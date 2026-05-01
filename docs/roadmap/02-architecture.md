# P1 — 架構債清理

**Status**: ✅ done（2026-04-30 ~ 2026-05-01）
**實際工時**: ~7 天
**風險**: 已落地（無新增風險）
**前置**: P0 完成

## 進度

- ✅ T-P1-3 Logger 全面化（commit `c411a9b`）：log.ts 升級為 logger 物件，
  16 處 `console.log` 全改 logger.info/debug 或 debugLog。
- ✅ T-P1-2 工具註冊表（commit `c411a9b`）：`source/tools/registry.ts` 一次
  實例化、`MCPServer` / `ToolManager` 共用同一份 ToolRegistry，main.ts 在
  load 時建立並重用。
- ✅ T-P1-4 zod schema（commits `6e6d720` pilot、`cba2fe1` `f2383a3`
  `24dfb45` `bafff81` `8342036` 5 batches）：14 個 tool 檔（157 tools）全部
  改為 module-scope schema map + `validateArgs` dispatch；schema 行數從
  ~3200 縮為 ~1100；helper `relaxJsonSchema` 抹平 zod 4 與手寫版的差異
  （`additionalProperties:false`、`.default()` vs `required`）。
- ✅ T-P1-6 預製體 channel 驗證：對 `@cocos/creator-types` 內 scene 模組
  message map 逐一比對，發現 8 個 prefab 相關 channel 中只有 `restore-prefab`
  真實存在（簽章 `{ uuid: string }`）。落地：(a) 砍 7 個死代碼 method
  （兩段 fallback ladder + 它們專屬的 `readPrefabFile` / private `getAssetInfo`
  / private `createNode`）；(b) `loadPrefab` 改走 `asset-db query-asset-info`
  回傳 metadata；(c) `updatePrefab` 改為 fail-loud（apply-back-to-asset 沒
  公開 API）；(d) `revertPrefab`、`restorePrefabNode`、scene-advanced 的
  `restorePrefab` 三處改用正確 channel 名稱與 `{ uuid }` 參數格式。
- ✅ T-P1-1 換官方 MCP SDK（commits `4c55c3d` feat / `cda18f2` cleanup
  / `63d5b9e` 三方 review fix）：`source/mcp-server-sdk.ts` 用低階 `Server`
  + `StreamableHTTPServerTransport` stateful（每個 `mcp-session-id` 一對
  Server+Transport）；REST endpoints `/health`、`/api/tools`、
  `/api/{cat}/{tool}` 共用同一 `http.Server`；協議版本由 SDK 自動協商
  （測過 `2025-06-18`）。session 加閒置 sweep（30min idle）、
  `httpServer.closeAllConnections()` 強制斷 keep-alive、
  `updateSettings` 重入 guard。版本由 1.4.0 → 2.0.0。
- ✅ T-P1-5 structured content（含於 `4c55c3d`）：`tools/call` 回應依
  `success` 分流——成功路徑帶 `structuredContent`（同時保留
  `content[].text` 為 JSON.stringify 結果做向後相容），失敗路徑加
  `isError: true` + 錯誤訊息文字。

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

1. ~~加入 `zod` 與 `zod-to-json-schema`~~ — 改採 zod 4 內建 `z.toJSONSchema`，
   不再需要 `zod-to-json-schema` 套件（已移除）。
2. ✅ **試點 node-tools.ts** 完成。helper 在 `source/lib/schema.ts`：
   - `toInputSchema(schema)`：zod → JSON Schema，後處理會移除
     `additionalProperties: false`（zod 4 預設加入）並把含 `default` 的欄位
     從 `required` 移除（手寫版的慣例）。
   - `validateArgs(schema, args)`：執行期驗證，失敗回 `success: false` +
     具體欄位錯誤訊息。
3. ✅ getTools() 改為由 `nodeSchemas` map 動態產出；execute() 入口先
   `validateArgs` 再 dispatch。
4. ✅ 剩餘 13 個工具檔全部改完（依複雜度由簡到難分 5 批 commit；最後 prefab
   / component / scene-advanced 也完成）。

**驗證**（已完成）：

- `tools/list` 回傳的 inputSchema 與舊版內容等價：對 `find_nodes`、
  `move_node`、`set_node_transform` 三組（簡單／中等／巢狀）做 diff，
  required 欄位、default、各層 description 完全一致。
- 程式碼行數略減（node-tools.ts 280 行 schema 縮為 ~90 行 zod）。

**驗證**：

- `tools/list` 回傳的 inputSchema 與舊版內容等價（用 diff 驗）。
- 傳入錯誤型別時回應為清晰的 zod error message，而非 runtime crash。
- 程式碼行數略減（schema 從幾十行 JSON 變成幾行 zod）。

### T-P1-6：預製體 Editor.Message channel 驗證 + ladder 清理

**問題**：`prefab-tools.ts` 內兩段 fallback ladder 是憑空猜的：

- `establishPrefabConnection`（line ~360）依序試
  `connect-prefab-instance` / `set-prefab-connection` / `apply-prefab-link`
  三個 channel。
- `applyPrefabToNode`（line ~621）依序試
  `apply-prefab` / `set-prefab` / `load-prefab-to-node`。

依 CLAUDE.md「用 `@cocos/creator-types` 驗證頻道而非 try-catch 階梯」原則
應改為單一已驗證 channel。

**做法**：

1. 對應目標 Cocos Creator 版本（3.8.x）打開 `@cocos/creator-types` 內
   `editor` namespace 的 message map，逐一確認 `scene` 模組下哪些
   prefab 相關 channel 真的存在。
2. 兩段 ladder 各保留**一個** verified channel，其餘刪除；若三個都不存在，
   保留 `manuallyEstablishPrefabConnection` 的 dump 路徑作為唯一實作，
   並在註解寫明驗證來源。
3. 出錯時 fail loudly，回 `success: false` + 具體錯誤訊息，不再吞錯誤
   往下試。

**驗證**：

- `tsc --noEmit` 通過。
- 實機（建立 prefab → 拖至場景 → 修改後 apply）一回合完整跑通。
- ladder log（`預制體連接方法失敗`、`所有預制體連接API都失敗`）不再
  出現於正常流程。

**不在範圍**：「100% 對齊官方序列化格式」（`fileId` / `__id__` 全鏈路一致）
屬另一階段工作，視 ladder 清理後的實機結果再決定是否加碼。

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

- [ ] 所有 6 個 task 完成。
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
