# P3 — MCP 進階能力

**Status**: pending
**預估工時**: ~1-2 週
**風險**: 中-高（依賴 client 是否支援對應 capability）
**前置**: P1 完成（P2 可做可不做）

## 範圍

實作 MCP 規格中目前未使用的能力：**Resources**、**Prompts**、
**Notifications**。讓 AI 能更聰明地存取編輯器狀態。

## 任務清單

### T-P3-1：Resources ✅ done at v2.2.0 (2026-05-02)

**落地**：6 個 static resource + 2 個 RFC 6570 template，URI 前綴
`cocos://`（對齊 cocos-cli + FunplayAI prior art，見
`docs/research/t-p3-1-prior-art.md`）。

| URI | 對應 tool |
|---|---|
| `cocos://scene/current` | `scene_get_current_scene` |
| `cocos://scene/hierarchy` | `scene_get_scene_hierarchy` |
| `cocos://scene/list` | `scene_get_scene_list` |
| `cocos://prefabs` + `cocos://prefabs{?folder}` | `prefab_get_prefab_list` |
| `cocos://project/info` | `project_get_project_info` |
| `cocos://assets` + `cocos://assets{?type,folder}` | `project_get_assets` |

實作要點：

- `source/resources/registry.ts` URI → handler 對應，handler 透過既有
  `ToolExecutor` 取資料，保證 resource read 與 tools/call 回傳同一份 JSON。
- `source/mcp-server-sdk.ts` capability 補 `resources: { listChanged: true,
  subscribe: false }`；`subscribe` 留給 T-P3-3。
- 對應 6 個 read-only tool description 補 deprecation 提示，但 tool
  本體保留——deprecated 條件 + 清除策略見 CHANGELOG v2.2.0 + HANDOFF B-2。
- `scripts/smoke-mcp-sdk.js` 加 5 條 resource round-trip check（list /
  templates/list / read static / read template + query / read unknown）。

Deprecation tracker（v2.2.0 起）：

| 既存 tool | Deprecated since | Scheduled removal | 觀測訊號 |
|---|---|---|---|
| `scene_get_current_scene` | v2.2.0 | v3.0.0 | 客戶端是否仍 hit `tools/call` |
| `scene_get_scene_hierarchy` | v2.2.0 | v3.0.0 | 同上 |
| `scene_get_scene_list` | v2.2.0 | v3.0.0 | 同上 |
| `prefab_get_prefab_list` | v2.2.0 | v3.0.0 | 同上 |
| `project_get_project_info` | v2.2.0 | v3.0.0 | 同上 |
| `project_get_assets` | v2.2.0 | v3.0.0 | 同上 |

清除前提（兩條都要）：(a) 主流 client 全支援 `resources/*`；(b) 自家
`live-test.js` + REST `/api/*` 沒人在跑這 6 個。


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
