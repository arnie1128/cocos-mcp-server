# T-V26-1 prior art — debug_game_command + GameDebugClient

> 投：v2.6.0 動工前調研。harady cocos-creator-mcp 是唯一 prior art。
> 結論：HTTP polling queue 路線，無需 cocos editor IPC magic。

## TL;DR

**harady 的 GameDebugClient 不是「進 cocos preview process 的 IPC 注入」**。
它是 user 在自家 game source 加一段 import + `initMcpDebugClient()`，
client 透過 `fetch()` polling MCP server 的 HTTP queue endpoint。

對我們：

- **server 端**：3 個新 HTTP endpoint + in-memory single-flight queue
  （~80 行 new code）
- **client 端**：ship 一份 `client/cocos-mcp-client.ts` 範本，user 自己 import
  到 game 入口（~300 行）
- **無 cocos editor IPC**、**無 Editor.Message broadcast**、**無 reload 重連
  邏輯**（client polling 自然容錯）

原 roadmap 估 3-4 天是基於「IPC 注入」設想；實際走 harady 路線估 1.5-2 天。

## harady 架構解剖

### server 端（`source/mcp-server.ts:281-298`）

```ts
let _pendingCommand: GameCommand | null = null;
let _commandResult: GameCommandResult | null = null;

// game polls (default 500ms)
GET  /game/command  →  consume _pendingCommand and clear
POST /game/result   →  store _commandResult

// MCP tool side
queueGameCommand(type, args) → returns id, sets _pendingCommand
gameCommand(type, args, timeout) {
  const cmdId = queueGameCommand(type, args);
  while (Date.now() - start < timeout) {
    const r = getCommandResult();
    if (r && r.id === cmdId) return r;
    await sleep(200);
  }
  return err('timeout — is GameDebugClient running?');
}
```

**Single-flight**：`_pendingCommand` is a single slot, not a queue. If the AI
fires two `debug_game_command` in parallel, the second overwrites the first
before the game polls. v0.x is fine because MCP `tools/call` is sequential
per session — but worth noting for future multi-session work.

### client 端（`client/McpDebugClient.ts:1-315`）

```ts
import { director, Node, Button, Camera, RenderTexture, gfx } from 'cc';

// User puts in game entry:
initMcpDebugClient({
  mcpBaseUrl: 'http://127.0.0.1:3000',
  pollInterval: 500,
  customCommands: {
    state: () => ({ success: true, data: gameDb.dump() }),
    navigate: async (args) => { await router.go(args.page); return { success: true }; },
    inspect: (args) => ({ success: true, data: inspectNode(args.name) }),
  },
});

// Built-in commands inside the client:
//   screenshot — RenderTexture + canvas.toDataURL('image/png')
//   click      — findByName + emit Button.EventType.CLICK
//   record_start / record_stop — MediaRecorder, base64 → POST /game/recording
//   (others)   — fall through to customCommands map
```

**Key design**: built-in commands are **engine-generic** (work for any cocos
project). Project-specific stuff (route, db dump) goes through customCommands.

**Failure mode**: when MCP server is down, `fetch` throws → caught silently
(`catch {}`), polling continues. No production impact when shipped to end
users.

## 對我們的影響

### 採納 verbatim

- HTTP endpoint 結構（`/game/command` GET / `/game/result` POST）
- In-memory single-flight queue
- `gameCommand(type, args, timeout)` polling loop with id-match
- Client polling pattern + `customCommands` extensibility
- Built-in `screenshot` + `click`

### 我們有、harady 沒有的

- **`/health` already lists tools count** — extend to also report
  `gameDebugClient: 'connected' | 'idle'` based on last-poll-timestamp
  freshness（>2× pollInterval ago → idle）
- **path-safety + project-rooted screenshot save**（v2.4.x landmines #2 教訓）—
  screenshot 落盤路徑必須 realpath check 在 `Editor.Project.tmpDir` 內
- **structured tool result**（v2.5.x review fix #2 教訓）— success/failure
  envelope 一致

### 不採（暫緩）

- `record_start`/`record_stop`（MediaRecorder webm）— niche，v2.7 評估
- `/game/recording` POST endpoint — 跟著 record 一起暫緩
- `debug_preview` 程式化啟停 preview — 我們的場景 user 通常已開好 preview
- `debug_query_devices` — 跟 preview 啟停同套，暫緩

## 動工 plan（v2.6.0 T-V26-1）

### Step 1 — server side queue + endpoints

`source/mcp-server-sdk.ts` 增 3 endpoint：

```
GET  /game/command  →  {id, type, args} | null
POST /game/result   →  {id, success, data?, error?}
GET  /game/status   →  {connected: bool, lastPollAt: iso, queued: bool}
```

新模組 `source/lib/game-command-queue.ts`：

```ts
export function queueGameCommand(type: string, args?: any): string;
export function consumePendingCommand(): GameCommand | null;
export function setCommandResult(r: GameCommandResult): void;
export function awaitCommandResult(id: string, timeoutMs: number): Promise<GameCommandResult | null>;
export function getClientStatus(): { connected: boolean; lastPollAt: string | null; queued: boolean };
```

Single-flight 加一個 mutex（`_busy` flag）避免兩個 tool call 並發踩腳。
Client poll 的 wall-clock timestamp 記到 `_lastPollAt` 給 `/game/status` 用。

### Step 2 — debug_game_command MCP tool

`source/tools/debug-tools.ts` 增 `debug_game_command`：

```ts
inputSchema: {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['screenshot', 'click', 'inspect', 'state', 'navigate', /* free string for customs */] },
    args: { type: 'object' },
    timeoutMs: { type: 'number', default: 10000, minimum: 500, maximum: 60000 },
  },
  required: ['type'],
}
```

執行：`queueGameCommand(type, args)` → `awaitCommandResult(id, timeoutMs)`。
若 type === 'screenshot' 且 result 有 dataUrl → 落盤到 `Editor.Project.tmpDir/mcp-screenshots/`，
realpath check + 副檔名強制 png。回傳 `{path, size, width, height}`。

對 timeout 提示：`Game did not respond — is GameDebugClient running and polling? GET /game/status to check.`

### Step 3 — ship client template

新增 `client/cocos-mcp-client.ts`（裝置給 user 複製到 game source）：

- `initMcpDebugClient(config)` / `stopMcpDebugClient()`
- 內建 `screenshot` / `click` / `inspect`（**inspect 是我們加的內建**：
  `findByName(args.name)` → 回傳 `{position, scale, rotation, contentSize?, anchor?, layer, active, components: [...]}`，
  純 cc API 無 project-coupling，algo 簡單通用）
- `customCommands` extensibility 完整對齊 harady

打包：放 `client/` folder，`README.md` 一段「How to wire up GameDebugClient」
教 user `import { initMcpDebugClient } from './path/to/cocos-mcp-client'`。

### Step 4 — `/health` extend

`/health` 加 `gameClient: 'connected' | 'idle'`，方便 user / AI 知道 client
是否 ready 無需先 fire test command。

### Step 5 — smoke test

`scripts/smoke-mcp-sdk.js` 補：
- POST `/game/result`（stub a result）
- GET `/game/command`（驗 consume + clear）
- `debug_game_command` tool call timeout 路徑（無 client 時要回 timeout
  error 而不是 hang）

## 估時

| Step | 估時 |
|---|---|
| 1. server queue + endpoints | 0.5 天 |
| 2. debug_game_command tool | 0.3 天 |
| 3. client template ship | 0.4 天 |
| 4. /health extend | 0.1 天 |
| 5. smoke updates | 0.2 天 |
| **總** | **1.5 天** |

比 roadmap 原 3-4 天估短，主因 harady 已 prove out HTTP polling 路線、無需
攻 IPC 注入。

## 風險

1. **Single-flight queue 的 race condition** — 兩個 MCP tool call 並發時
   第二個 queue 蓋掉第一個。MCP `tools/call` per-session 是 sequential
   所以單 client 場景安全；但 multi-client（v2.5.0 多 session 加進來）會
   碰。Mitigation：`_busy` mutex，第二個 call 直接 return error
   `another command in flight`。
2. **Long-running custom commands** — user 寫的 `state` 慢回應（>10s
   default timeout）→ `debug_game_command` 返回 timeout 但 client 還在
   執行；之後 result 進 `_commandResult` 但沒人 await。Mitigation：每
   次 `queueGameCommand` 清 `_commandResult`；client 端不要寫長 op。
3. **client 必須 user 自己加** — 跟 transparent IPC 不同，需要 onboarding
   docs。Mitigation：README 一段、tool description 提示。

## 參考

- `D:/1_dev/cocos-mcp-references/cocos-creator-mcp/source/mcp-server.ts:52-73,281-298`
- `D:/1_dev/cocos-mcp-references/cocos-creator-mcp/source/tools/debug-tools.ts:604-644`
- `D:/1_dev/cocos-mcp-references/cocos-creator-mcp/client/McpDebugClient.ts:1-315`
