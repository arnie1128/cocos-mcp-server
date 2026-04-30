# 程式碼品質瑕疵清單

> 撰寫日期：2026-04-30，基線：`754adec`。
> 本檔列舉**靜態觀察**得到的具體缺陷，以可定位（檔名+行號）為原則。
>
> 本檔內容為快照，不事後改寫；**處理進度** maintained 在下表，所有 §x.y
> 的 body 維持原樣作為當時觀察的歷史記錄。

## 處理進度（截至 2026-04-30 / HEAD `4df3639`）

| 條目 | 狀態 | 落地位置 |
|---|---|---|
| 1.1 硬編碼路徑 `/Users/lizhiyong/...` | ✅ fixed | P0 T-P0-1，commit `c42531a`；`debug-tools.ts` 抽 `resolveProjectLogPath()`，`prefab-tools.ts` 改用 `Editor.Project.path` |
| 1.2 危險的 JSON 自動修補 | ✅ fixed | P0 T-P0-2，commit `c42531a`；`fixCommonJsonIssues` 已整段移除，parse 失敗回 `-32700` |
| 1.3 console.log 未受 debug flag 控制 | ✅ fixed | P0 T-P0-3 + P1 T-P1-3，commits `c42531a` + `c411a9b`；`source/lib/log.ts` logger 物件，14 檔全部走 `logger.{debug,info}` 或 `debugLog` |
| 2.1 預製體 API try-catch 階梯 | ✅ fixed | P1 T-P1-6，commit `117d846`；對 `@cocos/creator-types` 驗證後，scene 模組唯一存在的是 `restore-prefab`，兩段 ladder 與其專屬 helper 全已刪除（~250 行死代碼） |
| 2.2 工具雙重實例化 | ✅ fixed | P1 T-P1-2，commit `c411a9b`；`source/tools/registry.ts` 一次實例化，`MCPServer` / `ToolManager` 共用 |
| 2.3 自寫 HTTP/JSON-RPC 而非用官方 SDK | ⏳ pending | P1 T-P1-1（下一個任務） |
| 2.4 JSON Schema 全手寫 | ✅ fixed | P1 T-P1-4，commits `6e6d720` 起 5 batches 至 `8342036`；14 檔（157 tools）全部走 zod，schema 行數從 ~3200 縮為 ~1100 |
| 2.5 ToolResponse 包字串而非 structured content | ⏳ pending | P1 T-P1-5（與 T-P1-1 一起） |
| 3.1 沒有測試串接 | ⏳ deferred | 暫無排程 |
| 3.2 build 產物進版控 | 🟡 acknowledged | `.gitignore` 已加註解標明 `dist/` 是刻意例外（Cocos 商城安裝後不跑 build） |
| 3.3 i18n 覆蓋率不全 | ⏳ deferred | 暫無排程 |

下面 §一～§三 維持 2026-04-30 撰寫時的原始觀察，作為歷史快照。


## 一、P0 — 阻塞性問題

### 1.1 硬編碼原作者本機路徑

**位置**（共 6 處）：

```
source/tools/debug-tools.ts:430    '/Users/lizhiyong/NewProject_3'
source/tools/debug-tools.ts:499    '/Users/lizhiyong/NewProject_3'
source/tools/debug-tools.ts:548    '/Users/lizhiyong/NewProject_3'
source/tools/prefab-tools.ts:449   path.resolve(process.cwd(), '../../NewProject_3', fsPath)
source/tools/prefab-tools.ts:450   path.resolve('/Users/lizhiyong/NewProject_3', fsPath)
source/tools/prefab-tools.ts:453   path.resolve('/Users/lizhiyong/NewProject_3/assets', ...)
```

**影響**：在你的專案上會 silently fall through 到非預期路徑，或讀到不存在的
檔案。`debug` 三處用於讀 `temp/logs/project.log`；`prefab` 三處用於讀
prefab 原始 JSON 來建立預製體連線。

**修法**：一律改用 `Editor.Project.path` 作為基準。如果該值不存在則直接
回錯，不要繼續猜。

### 1.2 危險的 JSON 自動修補

**位置**：`source/mcp-server.ts:295-313` `fixCommonJsonIssues()`

```ts
fixed = fixed
    .replace(/'/g, '"')                  // ← 把所有單引號當 JSON 字串邊界
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
```

**影響**：

- 若 client 傳入的字串內容包含合法單引號（中文標點 ’、英文撇號 don't），
  會被全域替換成雙引號，破壞語意。
- `.replace(/\n/g, '\\n')` 對已經是 `"abc\\n"` 的合法 JSON 反而會誤傷。
- `replace(/([^\\])\\([^"\\\/bfnrt])/g, '$1\\\\$2')` 是不可預期的字串改寫。

**修法**：移除整個 `fixCommonJsonIssues`，把 parse 失敗直接回應
JSON-RPC `-32700 Parse error`。

### 1.3 console.log 未受 debug flag 控制

**統計**（每檔 `console.log` 計數）：

| 檔案 | 數量 |
|---|---|
| `prefab-tools.ts` | 72 |
| `component-tools.ts` | 57 |
| `tool-manager.ts` | 15 |
| `mcp-server.ts` | 13 |
| `node-tools.ts` | 6 |
| `broadcast-tools.ts` | 3 |
| `main.ts` | 2 |
| `debug-tools.ts` | 1 |

**影響**：`MCPServerSettings` 雖然有 `enableDebugLog: boolean` 欄位，但程式碼
根本沒讀。所有 log 都會噴到 Cocos 編輯器 console，使用者無法靜音。

**修法**：建立 `Logger`（包一層 `debug/info/warn/error`，依 settings 控制
debug 等級），全檔取代直接 `console.log`。

## 二、P1 — 架構債

### 2.1 預製體 API 是 try-catch 階梯

**位置**：`source/tools/prefab-tools.ts`

`establishPrefabConnection` (line 359-374)：

```ts
const connectionMethods = [
    () => Editor.Message.request('scene', 'connect-prefab-instance', ...),
    () => Editor.Message.request('scene', 'set-prefab-connection', ...),
    () => Editor.Message.request('scene', 'apply-prefab-link', ...),
];
let connected = false;
for (const method of connectionMethods) {
    try { await method(); connected = true; break; }
    catch (error) { console.warn('預制体连接方法失败...'); }
}
```

`applyPrefabToNode` (line 643-666)：類似的對 `apply-prefab` /
`set-prefab` / `load-prefab-to-node` 做順序試誤。

**判讀**：原作者也不確定哪個 channel 真的存在。每次呼叫都會
trigger 至少一次例外 + console.warn。

**修法**：拿 `@cocos/creator-types` 對 3.8.6 的 `Editor.Message` 列舉做
ground truth；只保留實際存在的 channel；不存在的直接刪除（**不是註解**）。

### 2.2 工具雙重實例化

**位置**：

- `source/mcp-server.ts:36-49`：`new SceneTools()` 等 14 個類別。
- `source/tools/tool-manager.ts:101-116`：再 `new` 一次同樣 14 個。

**判讀**：`ToolManager` 只是要拿 metadata。完全沒必要持有實例。

**修法**：讓 `ToolManager` 接受 `MCPServer` 的工具索引（dependency
injection），或抽出一個 `getAllToolDefinitions()` 純函式由雙方共用。

### 2.3 自寫 HTTP/JSON-RPC 而非用官方 SDK

**位置**：整個 `source/mcp-server.ts`。

**問題**：

- 協定版本硬碼 `'2024-11-05'`（line 264），無 capability negotiation。
- 只支援 HTTP request/response，無 SSE、無 streaming。
- 只實作 `tools/list`、`tools/call`、`initialize`，不支援 Resources、Prompts
  與 Notifications。

**修法**：改用 `@modelcontextprotocol/sdk`，使用
`StreamableHTTPServerTransport` 或同時提供 stdio。預估可砍 ~200 行樣板。

### 2.4 JSON Schema 全手寫

**位置**：每個 `source/tools/*-tools.ts` 的 `getTools()`。

**問題**：

- TypeScript 介面與 Schema 沒有任何同步機制。
- 沒有 runtime 驗證，client 傳錯型別要等到實際執行時才爆。
- Schema 中描述文字（`description`）長到誇張（如 `component-tools.ts:91-143`
  的 propertyType 說明），佔 prompt 預算。

**修法**：引入 zod + `zod-to-json-schema`。把 schema 與型別綁在一起。

### 2.5 ToolResponse 包字串而非 structured content

**位置**：`source/mcp-server.ts:259`

```ts
result = { content: [{ type: 'text', text: JSON.stringify(toolResult) }] };
```

**問題**：把整個 `ToolResponse` JSON.stringify 成一段純文字塞回去，
client 拿到是字串還要再 parse 一次。MCP 規格支援 structured content。

**修法**：依 `success` / `error` 分流，錯誤走 `isError: true`，成功時用
適當的 `content` 區塊；資料量大時改回 `resource`。

## 三、P2 — 改善類

### 3.1 沒有測試串接

`source/test/` 下有 4 個 `.ts`（manual-test、tool-tester、prefab-tools-test、
mcp-tool-tester），但 `package.json` 沒有 test script。

**修法**：補 `npm test`，至少跑 smoke test 確認每個 ToolExecutor 的
`getTools()` 不丟例外、`execute()` 對未知 toolName 會 throw。

### 3.2 build 產物進版控

`dist/` 被 commit 進 repo（`.gitignore` 只有 `node_modules` 與
`build_backup_*`）。

**權衡**：

- 走 Cocos Store 上架流程：使用者 import 解壓即用，需要 `dist/`。
- 走 GitHub clone + `npm run build`：應 gitignore，避免 PR diff 被汙染。

**建議**：兩者擇一明確化。若選後者，發 release 時打 zip/tarball 給商城。

### 3.3 i18n 覆蓋率不全

`i18n/zh.js` 與 `i18n/en.js` 只覆蓋面板字串，工具錯誤訊息（如
`prefab-tools.ts` 內大量「預制体未找到」「無法找到或讀取預制體文件」）
全部硬碼中文。

**影響**：英文 client 收到中文錯誤；除錯時不易 grep。

**修法**：錯誤訊息走英文（程式語意），UI 文案走 i18n。
