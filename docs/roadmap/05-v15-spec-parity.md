# P4 — v1.5.0 部分對齊（選擇性）

**Status**: pending
**預估工時**: ~3-5 天
**風險**: 中（事件綁定需研究 `cc.EventHandler` 序列化）
**前置**: P1 完成（依賴 SDK + zod schema 樣板）；與 P3 互不相依

## 範圍

從原作者 v1.5.0 README 承諾項目中挑出**可行且有獨立價值**的兩項：

1. **事件綁定工具**（v1.5.0 list 第 3 項）
2. **面板 UI 簡潔化**（v1.5.0 list 第 6 項）

不包含：
- 工具收斂 → P2
- 預製體 ladder 清理 → 已併入 P1 T-P1-6
- 「整體架構效率」→ P1 整體
- 「token -50%」→ P2 條件式 + 量測

## 任務清單

### T-P4-1：事件綁定工具（cc.EventHandler）

**問題**：`component-tools.ts` 完全沒有事件綁定相關工具——
`grep onClick|EventHandler` 在 14 個 tool 檔內僅 2 處 hit，皆為預製體
序列化時清空 `_clickEvents` / `clickEvents` 陣列，並無新增綁定的能力。

**做法**：

1. 研究 `cc.EventHandler` 的 dump 格式（target node UUID、component
   名稱、handler method、customEventData）。
2. 新增 component 級工具（暫定名）：
   - `component_add_event_handler`：把 EventHandler 推進指定屬性陣列
     （例：`Button.clickEvents`、`Toggle.checkEvents`）。
   - `component_remove_event_handler`：依索引或 target+method 移除。
   - `component_list_event_handlers`：列出某個 EventHandler 屬性的目前
     內容。
3. 入參用 zod schema（依賴 P1 T-P1-4 已落地）。

**驗證**：

- 透過 MCP 工具對一個有 `cc.Button` 的節點新增 `onClick`，存場景，重啟
  編輯器後 handler 仍存在。
- 工具錯誤路徑（target 節點不存在、method 名空白）回 `success: false` +
  清楚訊息。
- 至少覆蓋 `cc.Button.clickEvents` 一個案例做為 baseline；其他
  EventHandler 屬性（Toggle、ScrollView 等）視時間延伸。

### T-P4-2：面板 UI 清理

**問題**：`source/panels/default/index.ts` 385 行的 setup function 把
所有 reactive state、computed、IPC handler 塞在同一個元件內；template
與 style 拆在 `static/template/default/index.html` 與
`static/style/default/index.css`。可讀性差、不易延伸。

**做法**：

1. 把 setup 內邏輯拆成 composables（`useServerStatus`、`useToolConfig`、
   `useSettings`），每個 composable 一檔。
2. Template 拆 SFC-like 區塊（即使仍走 `readFileSync` 載 HTML，至少
   切多檔）。
3. 移除 `console.log` 直接呼叫，改用 `debugLog`（與 P0-3 一致）。

**驗證**：

- 啟動 server、切換 tab、改 port、enable/disable 工具——所有功能等價。
- `index.ts` 行數降至 < 200。
- 改變不影響 `panels/tool-manager`（獨立面板）。

**權衡**：純 UX 改善，無功能變更。低優先，若工時吃緊可只做拆 composable
不動 template。

## 完成標準

- [ ] T-P4-1 至少 `Button.clickEvents` 完整 add/remove/list 工具到位。
- [ ] T-P4-2 主面板 `index.ts` 行數降低、結構清晰。
- [ ] `tsc --noEmit` 通過、實機 smoke 測試過。

## 風險與緩解

- **風險**：`cc.EventHandler` 序列化格式與 Cocos 版本有關。
  **緩解**：先以 3.8.x 為目標，序列化結果以「實機建一個 onClick → 存場景
  → 讀回 JSON」為 ground truth。
- **風險**：面板拆分可能踩到 Cocos 自訂 `ui-*` 元素的 compiler 設定。
  **緩解**：保留 `app.config.compilerOptions.isCustomElement` 設定不動。

## 不在範圍

- 預製體序列化 100% 對齊 → 視 P1 T-P1-6 + 實機測試結果再決定加碼項目。
- 工具收斂 → P2 條件式執行。
- 整體 token 量測 → P2 入口時做。
