# P3 — MCP 進階能力

**Status**: pending
**預估工時**: ~1-2 週
**風險**: 中-高（依賴 client 是否支援對應 capability）
**前置**: P1 完成（P2 可做可不做）

## 範圍

實作 MCP 規格中目前未使用的能力：**Resources**、**Prompts**、
**Notifications**。讓 AI 能更聰明地存取編輯器狀態。

## 任務清單

### T-P3-1：Resources

**動機**：場景樹、預製體清單、資源清單目前都是工具呼叫，AI 每次都要
`tools/call` 一次才能拿到。改成 Resources 後，client 可以自選載入時機，
甚至訂閱變更。

**做法**：

1. 註冊 Resources：
   - `cocos://scene/current` — 當前場景元資料。
   - `cocos://scene/hierarchy` — 完整場景樹（JSON）。
   - `cocos://prefabs` — 全專案 prefab 清單。
   - `cocos://assets/{path}` — 任意資源 query。
2. 實作 `resources/list`、`resources/read` handler。
3. 大資源（hierarchy）支援分頁或僅回傳 root 層 + child UUIDs。

**驗證**：

- Claude Desktop 能列出並讀取上述 resource。
- 對比同一個 AI scenario，`tools/call` 次數應減少。

### T-P3-2：Prompts

**動機**：常用組合（建 button、複製預製體、批次改顏色）每次 AI 要 reason
一遍。提供 prompt template 可以一次觸發。

**做法**：

1. 設計 prompt 庫：
   - `create-ui-button` — 引導建立帶 cc.Button 的節點，含預設屬性。
   - `duplicate-prefab` — 複製預製體並重命名。
   - `setup-2d-scene` — 建立基本 2D 場景骨架。
2. 實作 `prompts/list`、`prompts/get` handler。
3. Prompt 內可帶參數（節點名、父節點 UUID 等）。

**驗證**：

- Claude Desktop slash command 能列出並觸發。
- 對應流程的 token 用量比手動 reasoning 低。

### T-P3-3：Notifications（場景變更推送）

**動機**：目前 AI 拿到場景樹後若使用者手動改了場景，AI 仍引用舊 UUID
直到下一次 query。MCP Notifications 可以主動推 `resources/updated`。

**做法**：

1. 訂閱 Cocos 編輯器事件：
   - `Editor.Message.broadcast('scene', 'change-node')` 等。
2. 對應觸發 `notifications/resources/updated` 帶上對應 URI。
3. 加入 debounce（避免拖曳節點時每秒 60 次 push）。

**驗證**：

- Claude Desktop 收到通知後 client log 顯示 resource invalidated。
- 拖曳節點 1 秒內不重複 push（debounce 生效）。

### T-P3-4：stdio transport（可選）

**動機**：Claude Desktop 與部分 client 預設用 stdio，不用 HTTP。提供
stdio 可以省掉 port 設定。

**做法**：

1. `package.json` 新增 `bin` entry，產生 standalone binary（透過 `tsc`
   或 `esbuild`）。
2. 啟動時偵測 `process.stdin.isTTY`，非 TTY 走 stdio transport。
3. 文件補上 Claude Desktop 設定範例。

**權衡**：Cocos 編輯器內部要跑 stdio server 不太自然，因為 server 需要
存活在編輯器行程內才能呼叫 `Editor.Message`。stdio 形式比較適合做成
**獨立 binary 反向連回編輯器**——成本不小，視 demand 再做。

## 完成標準

- [ ] T-P3-1 至少 2 個 Resource URI 可用。
- [ ] T-P3-2 至少 3 個 Prompt template。
- [ ] T-P3-3 場景變更會推送通知，debounce 有效。
- [ ] T-P3-4 視需求做。
- [ ] 文件更新（README + `architecture/overview.md`）。

## 風險與緩解

- **風險**：Client 不支援 Resources/Prompts。
  **緩解**：MCP 規格允許 capability negotiation；client 不支援時 server
  靜默不啟用，不影響 tools。
- **風險**：Notifications 風暴。
  **緩解**：debounce + 合併通知（同一資源 1 秒內只發一次）。
