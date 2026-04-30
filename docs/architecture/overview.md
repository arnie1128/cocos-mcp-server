# 架構總覽

> 描述 v1.4.0 基線（fork commit `754adec`）的系統架構與資料流。
> 重大重構後請同步更新本檔。

## 一、定位

Cocos Creator 3.8+ 編輯器擴充套件。對外提供 MCP（Model Context Protocol）
HTTP 端點，讓 AI 助手能對 Cocos 編輯器執行場景／節點／組件／預製體／資源
／專案構建等操作。

執行環境分三層：

| 層 | Runtime | 程式碼位置 |
|---|---|---|
| **Editor host** | Node.js（編輯器主行程） | `source/main.ts`、`source/mcp-server.ts`、`source/tools/*` |
| **Scene context** | Cocos runtime（場景行程，可動 `cc.*` API） | `source/scene.ts` |
| **Panel UI** | Chromium（編輯器嵌入面板） | `source/panels/*`、`static/template/*`、`static/style/*` |

三者透過 `Editor.Message.request` / `execute-scene-script` 互通。

## 二、資料流

```
┌──────────────────────────────────────────────────────────────┐
│  AI Client (Claude / Cursor / VS-like)                       │
└─────────────────────────┬────────────────────────────────────┘
                          │ HTTP POST /mcp  (JSON-RPC 2.0)
                          ▼
┌──────────────────────────────────────────────────────────────┐
│  MCPServer  (source/mcp-server.ts)                           │
│   • http.createServer (手寫，未用 @modelcontextprotocol/sdk) │
│   • 路由：/mcp、/health、/api/{category}/{tool}              │
│   • dispatch → tools[category].execute(toolName, args)       │
└─────────────────────────┬────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────────────┐
        ▼                 ▼                         ▼
   SceneTools      ComponentTools  ...        PrefabTools
   (tools/scene-   (tools/component-          (tools/prefab-
    tools.ts)       tools.ts)                  tools.ts)
        │                 │                         │
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
     │ • execute-     │                          │ • create-asset   │
     │   scene-script │                          │ • ...            │
     └───────┬────────┘                          └──────────────────┘
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
   │  • new ToolManager()         ← 讀取 settings/tool-manager.json
   │  • readSettings()            ← 讀取 server settings
   │  • new MCPServer(settings)
   │  • mcpServer.updateEnabledTools(...)
   │  • if (autoStart) mcpServer.start()
   ▼
HTTP server listening on 127.0.0.1:<port>
   │
   ▼
client tools/list  → MCPServer.getAvailableTools()
client tools/call  → MCPServer.executeToolCall(name, args)
                       → tools[category].execute(toolName, args)
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

## 五、設定持久化

| 設定檔 | 位置 | 載入點 |
|---|---|---|
| Server settings（port、autoStart 等） | `<project>/settings/cocos-mcp-server.json` | `source/settings.ts` |
| Tool manager（啟用工具配置） | `<project>/settings/tool-manager.json` | `source/tools/tool-manager.ts` |

## 六、編譯與輸出

- `npm run build` → `tsc` → `dist/`
- `package.json:main` 指向 `dist/main.js`
- 面板 entry：`dist/panels/default/index.js`
- Scene 腳本：`dist/scene.js`（透過 `package.json:contributions.scene` 註冊）

## 七、值得注意的設計選擇

1. **手寫 HTTP server，不用官方 MCP SDK**：受限於 Cocos 編輯器內部 Node 環境
   與 ESM 相容性（需驗證），原作者選擇手實作 JSON-RPC。代價是缺少
   capability negotiation、SSE、streaming。
2. **工具雙重實例化**：`MCPServer` 與 `ToolManager` 都各自 `new` 一次全套
   工具類；前者用來執行、後者用來取 metadata。重構時須讓兩者共用同一份
   實例（見 `roadmap/02-architecture.md`）。
3. **Scene-side fallback**：`tools/component-tools.ts` 與 `tools/scene-
   tools.ts` 內，當 `Editor.Message` 失敗時會 fallback 到
   `execute-scene-script` 執行 `scene.ts` 裡的對應方法。雙路徑提高了魯棒性
   但也增加維護面積。
