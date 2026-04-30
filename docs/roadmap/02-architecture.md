# P1 — 架構債清理

**Status**: pending
**預估工時**: ~5-7 天
**風險**: 中（會動到工具註冊與 server transport）
**前置**: P0 完成

## 範圍

把底層基礎打穩，以利後續工具收斂與 MCP 進階能力。**會改公開介面**：
HTTP endpoint 形式可能變更（從手寫 JSON-RPC 換成 SDK 標準 transport）。

## 任務清單

### T-P1-1：引入 `@modelcontextprotocol/sdk`

**目標**：把 `source/mcp-server.ts` 整個換成 SDK driven 的 server。

**做法**：

1. 加入依賴：`npm i @modelcontextprotocol/sdk`。
2. 用 `Server` + `StreamableHTTPServerTransport`（或 SSE，依 client 相容性
   評估）。
3. 把 `tools/list`、`tools/call`、`initialize` 的 handler 改用 SDK 註冊機
   制。
4. 移除手寫 `http.createServer`、JSON-RPC dispatch、`fixCommonJsonIssues`
   殘留（P0 已先移除函式本體）。
5. **保留** `/api/{category}/{tool}` 簡易 REST endpoint 與 `/health`，因為
   面板與既有 client 都依賴。

**驗證**：

- 既有 client（Claude / Cursor）能照原 `http://127.0.0.1:<port>/mcp` 連線
  並 `tools/list` / `tools/call`。
- `/health` 仍回 `{status:"ok",tools:N}`。
- `tsc --noEmit` 通過。
- 程式碼行數淨減 ≥ 200。

### T-P1-2：去重複實例化

**問題**：`MCPServer` 與 `ToolManager` 各自 `new` 14 個 ToolExecutor。

**做法**：

1. 抽出 `source/tools/registry.ts`（新建），匯出 `createToolRegistry()`
   工廠函式，回傳 `Map<categoryName, ToolExecutor>`。
2. `MCPServer` 與 `ToolManager` 改為接受 registry（DI），不再各自 `new`。
3. `ToolManager` 只持有 metadata（從 registry 抽 `getTools()`），不持有
   實例。

**驗證**：

- 啟動 server，`new MCPServer` 與 `new ToolManager` 共用同一份 registry。
- `tool-manager.json` 啟用/停用工具仍能正確套用到 server。
- 啟動時 console 不再出現重複的 `[MCPServer] Initializing tools...` 與
  `ToolManager initializing` 對應 log。

### T-P1-3：Logger 與全域 log gating

**做法**：

1. 新建 `source/lib/log.ts`：`Logger` class，提供 `debug/info/warn/error`，
   依 `settings.enableDebugLog` 決定 debug 是否輸出。
2. `error` 與 `warn` 永遠輸出。
3. 全部 14 個 tool 檔 + `mcp-server.ts` + `main.ts` 取代 `console.log` →
   `logger.debug` / `logger.info`。
4. 維持 `console.error` 不變（fatal）。

**驗證**：

- `enableDebugLog: false`（預設）下，跑完一次完整工具呼叫，Cocos console
  log 行數比現在減少 ≥ 80%。
- 改 `true` 後 log 與目前一致。

### T-P1-4：引入 zod schema

**做法**：

1. 加入 `zod` 與 `zod-to-json-schema`。
2. **試點**：選 `node-tools.ts` 為第一個重構對象（中等大小、無 prefab 包袱）。
3. 把 `getTools()` 內手寫 JSON Schema 改成 zod schema，自動轉 JSON Schema。
4. `execute()` 內用 zod 驗證 args，失敗時回 `success: false` + `error`。
5. 試點若順利，再依序套用到其他 13 個檔。

**驗證**：

- `tools/list` 回傳的 inputSchema 與舊版內容等價（用 diff 驗）。
- 傳入錯誤型別時回應為清晰的 zod error message，而非 runtime crash。
- 程式碼行數略減（schema 從幾十行 JSON 變成幾行 zod）。

### T-P1-5：ToolResponse → MCP structured content

**做法**：

1. `MCPServer.handleMessage` 內 `tools/call` 分支：依 `toolResult.success`
   分流：
   - `success: true`：`content: [{type:'text', text: <短訊>}]` 加上資料區塊。
   - `success: false`：`isError: true`，`content` 包錯誤訊息。
2. 大資料量（場景樹、預製體列表）改回 MCP `resource` 區塊或之後改 P3 的
   Resources 機制。

**驗證**：

- Client 看到的 `tools/call` 回應符合 MCP 規格的 structured content。
- 錯誤情況 client 端能正確顯示為 error 而非 success 字串。

## 完成標準

- [ ] 所有 5 個 task 完成。
- [ ] `tsc --noEmit` 通過。
- [ ] 實機 smoke test 過（覆蓋 scene/node/component/prefab/asset 各至少 1 工具）。
- [ ] 程式碼總行數減少 ≥ 300（樣板移除）。
- [ ] **量測 token**：跑一個固定的 AI scenario（如「建立 button 節點」），
      記錄 prompt+completion token 數，作為 P2 是否需要工具收斂的依據。

## 風險與緩解

- **風險**：SDK 換完 transport 後既有 client 連不上。
  **緩解**：保留舊 endpoint shim（`POST /mcp` 仍接受手寫 JSON-RPC）至少
  一個 release，發 deprecation 訊息。
- **風險**：zod 重構波及範圍大。
  **緩解**：試點先做一檔，確認無誤再擴。每檔獨立 commit。
