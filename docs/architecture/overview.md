# 架構總覽

> 描述當前狀態（基線 fork commit `754adec`，疊加 P0 + P1（部分完成）的
> 改動）。重大重構後請同步更新本檔。最後修訂：2026-04-30，HEAD `4df3639`。

## 一、定位

Cocos Creator 3.8+ 編輯器擴充套件。對外提供 MCP（Model Context Protocol）
HTTP 端點，讓 AI 助手能對 Cocos 編輯器執行場景／節點／組件／預製體／資源
／專案構建等操作。

執行環境分三層：

| 層 | Runtime | 程式碼位置 |
|---|---|---|
| **Editor host** | Node.js（編輯器主行程） | `source/main.ts`、`source/mcp-server.ts`、`source/tools/*`、`source/lib/*` |
| **Scene context** | Cocos runtime（場景行程，可動 `cc.*` API） | `source/scene.ts` |
| **Panel UI** | Chromium（編輯器嵌入面板） | `source/panels/*`、`static/template/*`、`static/style/*` |

三者透過 `Editor.Message.request` / `execute-scene-script` 互通。

## 二、資料流

```
┌──────────────────────────────────────────────────────────────┐
│  AI Client (Claude / Cursor / VS-like)                       │
└─────────────────────────┬────────────────────────────────────┘
                          │ HTTP POST /mcp  (Streamable HTTP, JSON-RPC 2.0)
                          │ (協議版本由 SDK 自動協商；mcp-session-id 分流)
                          ▼
┌──────────────────────────────────────────────────────────────┐
│  MCPServer  (source/mcp-server-sdk.ts)                       │
│   • @modelcontextprotocol/sdk 低階 Server +                   │
│     StreamableHTTPServerTransport（stateful，每個 session    │
│     一對 Server+Transport，閒置 30min 自動回收）              │
│   • REST 短路：/health、/api/tools、/api/{category}/{tool}    │
│   • 持有 ToolRegistry 引用                                   │
│   • dispatch → registry[category].execute(toolName, args)    │
│     （execute 內先 validateArgs(zodSchema, args) 再分派）    │
└─────────────────────────┬────────────────────────────────────┘
                          │
   ┌──────────────────────┴──────────────────────┐
   │  source/tools/registry.ts                   │
   │  createToolRegistry() → 共用 14 個          │
   │  ToolExecutor 實例（new 僅一次）            │
   │  MCPServer 與 ToolManager 都從這拿          │
   └──────────────────────┬──────────────────────┘
                          │
        ┌─────────────────┼─────────────────────────┐
        ▼                 ▼                         ▼
   SceneTools      ComponentTools  ...        PrefabTools
   (tools/scene-   (tools/component-          (tools/prefab-
    tools.ts)       tools.ts)                  tools.ts)
        │                 │                         │
        │ 每檔內：                                  │
        │  • module-scope 的 `Schemas` map          │
        │    (zod object → toInputSchema 給 MCP)   │
        │  • execute() 先 validateArgs 再 dispatch │
        └─────────────────┴─────────────┬───────────┘
                                        │
                                        ▼
                       Editor.Message.request(...)
                                        │
              ┌─────────────────────────┴───────────────────┐
              ▼                                              ▼
     ┌────────────────┐                          ┌──────────────────┐
     │ scene module   │                          │ asset-db module  │
     │ • query-node   │                          │ • query-assets   │
     │ • create-node  │                          │ • query-asset-   │
     │ • set-property │                          │   info           │
     │ • restore-     │                          │ • create-asset   │
     │   prefab       │                          │ • ...            │
     │ • execute-     │                          └──────────────────┘
     │   scene-script │
     └───────┬────────┘
             │
             ▼
     ┌────────────────────────────┐
     │ scene.ts (Cocos runtime)   │
     │  • createNewScene          │
     │  • addComponentToNode      │
     │  • setNodeProperty / ...   │
     └────────────────────────────┘
```

## 三、生命週期

```
Editor 載入擴充
   │
   ▼
main.ts:load()
   │  • toolRegistry = createToolRegistry()  ← 一次實例化 14 類
   │  • toolManager = new ToolManager(toolRegistry)
   │  • settings = readSettings()
   │  • mcpServer = new MCPServer(settings, toolRegistry)
   │  • setDebugLogEnabled(settings.enableDebugLog) ← 透過 ctor 連動
   │  • mcpServer.updateEnabledTools(toolManager.getEnabledTools())
   │  • if (autoStart) mcpServer.start()
   ▼
HTTP server listening on 127.0.0.1:<port>
   │
   ▼
client tools/list  → MCPServer.getAvailableTools() （已套 enabled 過濾）
client tools/call  → MCPServer.executeToolCall(name, args)
                       → registry[category].execute(toolName, args)
                         → validateArgs(zodSchema, args) ── 失敗 → success:false
                         → dispatch private method
                         → Editor.Message.request(...)
                         → 結果包成 ToolResponse → JSON-RPC result
```

## 四、面板（Panel）

`source/panels/default/index.ts`：Vue 3 應用，掛在 `#app`，模板來自
`static/template/default/index.html`。功能含：

- 啟停 server、調整 port／autoStart／debugLog
- Tools tab：列出當前可用工具，可勾選啟用/停用
- 設定變動透過 `Editor.Message.send('cocos-mcp-server', '<message>', ...)` 與
  `main.ts:methods` 通訊

P4 T-P4-2 計畫拆 composables、降低 `index.ts` 行數，目前未動。

## 五、設定持久化

| 設定檔 | 位置 | 載入點 |
|---|---|---|
| Server settings（port、autoStart、enableDebugLog 等） | `<project>/settings/cocos-mcp-server.json` | `source/settings.ts` |
| Tool manager（啟用工具配置） | `<project>/settings/tool-manager.json` | `source/tools/tool-manager.ts` |

## 六、編譯與輸出

- `npm run build` → `tsc` → `dist/`
- `package.json:main` 指向 `dist/main.js`
- 面板 entry：`dist/panels/default/index.js`
- Scene 腳本：`dist/scene.js`（透過 `package.json:contributions.scene` 註冊）
- `dist/` 刻意納入版控（Cocos 商城安裝後不會跑 build），由 `.gitignore`
  註解標明此例外。

## 七、值得注意的設計選擇

1. **官方 MCP SDK driven**（P1 T-P1-1 落地）：`source/mcp-server-sdk.ts`
   用 `@modelcontextprotocol/sdk` 的低階 `Server` +
   `StreamableHTTPServerTransport`（stateful 模式，`mcp-session-id` keyed
   per-session）。協議版本由 SDK 自動協商（測過 `2025-06-18`）。
   `tools/call` 回應依 `success` 分流（T-P1-5 落地）：成功路徑帶
   `structuredContent`、失敗路徑加 `isError: true`。REST endpoints
   `/health`、`/api/tools`、`/api/{cat}/{tool}` 共用同一 `http.Server`，
   讓面板與 curl 不需走完整 MCP handshake。session 30min idle sweep +
   `httpServer.closeAllConnections()` 強制斷 keep-alive；
   `updateSettings` 重入 guard。

2. **共用 ToolRegistry**（P1 T-P1-2 落地）：`source/tools/registry.ts` 的
   `createToolRegistry()` 一次實例化 14 個 ToolExecutor。
   `MCPServer` 與 `ToolManager` 各自接受 registry 參數，不再各自 `new`。
   原作者版本的雙重實例化已移除。

3. **Schema 與執行期驗證**（P1 T-P1-4 落地）：每個 tool 檔的 schema
   定義改為 module-scope `Schemas` map（zod object）。`getTools()` 動態
   呼叫 `toInputSchema(...)` 產出對外 JSON Schema；`execute()` 入口先
   `validateArgs(...)`，型別錯誤直接回 `success:false` + 清楚訊息，不再
   crash。Helper 在 `source/lib/schema.ts`。

4. **全域 Logger**（P1 T-P1-3 落地）：`source/lib/log.ts` 提供
   `logger.{debug,info,warn,error}` 與 `setDebugLogEnabled(boolean)`。
   `debug` 受 `MCPServerSettings.enableDebugLog` 控制；`warn`/`error`
   永遠輸出。Bootstrap log 走 `logger.info`。

5. **Scene-side fallback**：`tools/component-tools.ts` 與
   `tools/scene-tools.ts` 內，當 `Editor.Message` 失敗時會 fallback 到
   `execute-scene-script` 執行 `scene.ts` 裡的對應方法。雙路徑提高了魯棒性
   但也增加維護面積。

6. **預製體 Editor.Message channel 已對齊型別定義**（P1 T-P1-6 落地）：
   `scene` 模組唯一存在的 prefab channel 是 `restore-prefab`（簽章
   `{ uuid: string }`），驗證來源是
   `node_modules/@cocos/creator-types/editor/packages/scene/@types/message.d.ts`。
   原本兩段「猜 channel」的 fallback ladder 與其專屬 helper 全已刪除。
