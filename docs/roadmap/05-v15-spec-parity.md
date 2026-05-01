# P4 — v1.5.0 部分對齊（選擇性）

**Status**: ✅ done（v2.1.1 程式碼 + v2.1.2 EventHandler 持久化修補 +
v2.1.3 façade fallback 整鏈清理 + v2.1.4 P2-lite link/unlink 合併）；
全部實機驗證項已通過。詳見 [`docs/HANDOFF.md`](../HANDOFF.md) §進度快照
與 [`docs/archive/handoff-history.md`](../archive/handoff-history.md)
（Phase 1/2/3 詳細紀錄）。
**實際工時**：v2.1.0–v2.1.4 累積 ~10 天
**風險**：已落地（無新增風險）
**前置**：P1 完成（依賴 SDK + zod schema 樣板）；與 P3 互不相依
**依據**：[`docs/analysis/v15-feasibility.md`](../analysis/v15-feasibility.md)

## 範圍

從原作者 v1.5.0 README 承諾項目中挑出**可行且有獨立價值**的三項：

1. **Prefab façade 工具集**（v1.5.0 list 第 3 項，apply / link / unlink / 建立）
2. **事件綁定工具**（v1.5.0 list 第 4 項）
3. **面板 UI 簡潔化**（v1.5.0 list 第 6 項，縮小範圍至 composable 拆分）

不包含：
- 工具收斂 → P2
- 預製體 channel 驗證（restore-prefab） → 已在 P1 T-P1-6 完成
- 「100% 對齊官方格式」中的 fileId / `__id__` 全鏈路 → façade 化後再評
- 「整體架構效率」→ P1 整體已做底層改造
- 「token -50%」→ P2 條件式 + 量測

## 任務清單

### T-P4-3：Prefab façade 工具集

**問題**：

- `source/scene.ts:329 createPrefabFromNode` 是 stub（comment 寫
  「無法在運行時建立 prefab」是錯的）。
- `source/tools/prefab-tools.ts:953 updatePrefab`（apply 方向）在 P1 T-P1-6
  改為 fail loudly，但實際上 façade 有 `applyPrefab` 可呼叫。
- 缺 link / unlink / get-prefab-data 三個面向 prefab linkage 的工具，導致
  AI 助手無法用 MCP 完成完整 prefab 工作流。
- `prefab-tools.ts` 內 ~1000 行手刻 prefab JSON 程式碼是因為當初拿不到
  façade 才繞遠路；接到 façade 後可大幅縮減（**但縮減屬擴大重構，不在
  P4 範圍**，僅在 commit 內標記 deprecation）。

**做法**：

1. **`source/scene.ts`** 新增以下方法（皆透過 `cce.*` 在 scene-script
   進程內呼叫）：
   - `createPrefabFromNode(nodeUuid, url)` — 重寫，呼叫
     `cce.Prefab.createPrefab(nodeUuid, url)`。url 格式雙寫 try（先試
     `db://`，失敗試絕對路徑）。
   - `applyPrefab(nodeUuid)` — 呼叫 façade `applyPrefab`，失敗回標準錯誤
     物件。
   - `linkPrefab(nodeUuid, assetUuid)` — façade `linkPrefab`。
   - `unlinkPrefab(nodeUuid, removeNested)` — façade `unlinkPrefab`。
   - `getPrefabData(nodeUuid)` — façade `getPrefabData`，回傳 dump 物件。

2. **`source/tools/prefab-tools.ts`** 改動：
   - `updatePrefab`：從 fail loudly 改為走 `execute-scene-script` 呼叫
     scene 端 `applyPrefab`。失敗時清楚回報（含 façade 是否拋例外）。
   - `createPrefab` 系列：保留現有「自寫 JSON」分支作 fallback，但前置
     一個「scene-script `createPrefabFromNode` 呼叫」分支；若成功則略過
     後續手刻 JSON 路徑。Commit 內標記手刻路徑為 deprecated（不立刻刪）。
   - 新增 zod schema 與工具：`link_prefab` / `unlink_prefab` /
     `get_prefab_data`。
   - 既有 `revert_prefab` / `restore_prefab_node` 不動。

3. **scene-script bridge helper**：
   `prefab-tools.ts` 內已有多處 `Editor.Message.request('scene', 'execute-scene-script', { name, method, args })`
   呼叫，提取為 `lib/scene-bridge.ts` 的 `runSceneMethod(method, args)`
   helper，避免重複 boilerplate。

**驗證**：

- `tsc --noEmit` 通過。
- `node scripts/smoke-mcp-sdk.js` 通過（不依賴實機 Cocos）。
- 工具 schema 等價性檢查（`getTools()` 對 baseline 做 diff）。
- **實機測試**：建立簡單 button prefab → instantiate → 改 button 顏色 →
  apply → 重新開啟 prefab 確認顏色生效。此項標 ⚠️，commit 內註明未驗。

**風險與緩解**：

| 風險 | 緩解 |
|---|---|
| `cce.Prefab.createPrefab` url 參數格式未文件化 | 雙寫 try（`db://` → 絕對路徑），失敗訊息清楚 |
| `applyPrefab` 是否觸發 asset-db re-import 未知 | 配對呼叫 `asset-db: refresh-asset` 補保險 |
| façade 方法在某些版本可能不存在 | scene-script 端 `typeof cce?.Prefab?.[method] === 'function'` guard |

### T-P4-1：事件綁定工具（cc.EventHandler）

**問題**：`component-tools.ts` 完全沒有事件綁定相關工具——
`grep onClick|EventHandler` 在 14 個 tool 檔內僅 2 處 hit，皆為預製體
序列化時清空 `_clickEvents` / `clickEvents` 陣列，並無新增綁定的能力。

**做法**：

1. **Ground truth 抓取**：實作前先寫一個一次性 dev script（不入庫），對
   一個手綁過 onClick 的 Button 跑 `query-component`，把 `clickEvents` 的
   IProperty dump 結構記下來，作為下一步 dump 構造的樣板。
2. **新增 component 級工具**（在 `component-tools.ts`）：
   - `add_event_handler`：把 EventHandler 推進指定屬性陣列（`clickEvents`、
     `checkEvents` 等）。參數：`componentUuid`、`eventArrayProperty`（預設
     `clickEvents`）、`targetNodeUuid`、`componentName`、`handler`、
     `customEventData`。
   - `remove_event_handler`：依 `index` 或 `target+handler` 移除。
   - `list_event_handlers`：回傳指定 EventHandler 屬性的目前內容。
3. **實作策略**：路徑 A（host `set-property` on `clickEvents`），詳見
   v15-feasibility §三。路徑 B（scene-script）留作 fallback，遇到
   issue #16517 才切換。
4. 入參用 zod schema（依賴 P1 T-P1-4 已落地）。

**驗證**：

- `tsc --noEmit` 通過。
- 透過 MCP 工具對一個有 `cc.Button` 的節點新增 `onClick`，存場景，重啟
  編輯器後 handler 仍存在（⚠️ 實機）。
- 工具錯誤路徑（target 節點不存在、method 名空白）回 `success: false` +
  清楚訊息。
- 至少覆蓋 `cc.Button.clickEvents` 一個案例做為 baseline；其他
  EventHandler 屬性（Toggle、ScrollView 等）視時間延伸。

### T-P4-2：面板 UI 拆 composable（**範圍縮小**）

**問題**：`source/panels/default/index.ts` 385 行的 setup function 把
所有 reactive state、computed、IPC handler 塞在同一個元件內。

**範圍變化（2026-05-01）**：原規劃也包含 template / style 拆分。
重評後發現官方 `ui-*` 元件只有 4 個（num-input / slider / checkbox / select），
不夠取代既有 panel；template 拆分後仍是 Vue 3 自寫，ROI 低。**改為只拆
composable，不動 template / style**。

**做法**：

1. 把 setup 內邏輯拆成 composables，每個 composable 一檔：
   - `useServerStatus()` — server 啟動 / 停止 / 狀態
   - `useToolConfig()` — tool 開關 / 持久化
   - `useSettings()` — port / debug / autoStart
2. 移除 `console.log` 直接呼叫，改用 `logger.debug`（與 P1 T-P1-3 一致）。

**驗證**：

- 啟動 server、切換 tab、改 port、enable/disable 工具——所有功能等價。
- `index.ts` 行數降至 < 200。
- 改變不影響 `panels/tool-manager`（獨立面板）。

**權衡**：純 UX 改善，無功能變更。最低優先，若工時吃緊可延後。

## 完成標準

- [x] T-P4-3 prefab façade 工具集到位，`updatePrefab` 不再 fail loudly。
- [x] T-P4-1 至少 `Button.clickEvents` 完整 add / remove / list 工具到位。
- [x] T-P4-2 主面板 `index.ts` 行數降低（384 → 80）、composable 拆完。
- [x] 全部跑過 `tsc --noEmit` 與 smoke test（160 → 163 工具）。
- [x] HANDOFF 更新到 P4 done。
- [x] CLAUDE.md Landmines 加註 prefab façade 路徑。
- [ ] 實機測試：⚠️ 未驗項目集中在 HANDOFF「未驗實機項」一節，等用戶上 Cocos Creator 測。

## 不在範圍

- `prefab-tools.ts` 內手刻 JSON 路徑刪除 → façade 化後再評，獨立任務。
- 預製體序列化 100% 對齊（fileId / `__id__` 全鏈路） → 視 façade 化結果再決定。
- 工具收斂 → P2 條件式執行。
- 整體 token 量測 → P2 入口時做。

## 對照 v1.5.0 README 七項

| v1.5.0 承諾 | P4 落點 | 狀態 |
|---|---|---|
| 工具收斂 50 個 | P2（條件式） | 不在本階段 |
| 預製體 100% 對齊 | T-P4-3（apply / link / unlink / 建立） | 規劃中 |
| 事件綁定補完 | T-P4-1 | 規劃中 |
| 接口優化 | P1 zod schema 已做基礎；本階段邊做邊補 | 進行中 |
| 文件更完善 | docs/ 持續更新；本階段隨工作補 | 進行中 |
| 面板 UI 簡潔 | T-P4-2（縮小範圍） | 規劃中 |
| 整體架構效率 | P1 已做（SDK / structured content） | 不在本階段 |
