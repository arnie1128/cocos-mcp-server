# P2 — 工具收斂（已 CLOSED）

**Status**: ❌ **CLOSED — 量測結果不值得執行**（2026-05-01）
**Decision**: see [ADR 0001 補註](../adr/0001-skip-v1.5.0-spec.md#補註p2-工具收斂量測結果2026-05-01)
**Measurement**: `scripts/measure-tool-tokens.js`

## TL;DR

跑完量測後決定 close。重點數據：

- 現況 160 flat tools 的 `tools/list` payload ≈ 52K chars / 14.8K tokens。
- P2 lossless（14 個 router + oneOf 保留 sub-schema）→ 71K chars / 20.4K
  tokens，**比現況多 37%**——是負收益。
- P2 lossy（14 個 router + enum + free-form args）→ 17K chars / 4.9K
  tokens，砍 67%，但代價是丟掉 per-action arg validation。對 Cocos
  Creator 領域（UUID / dump path 容易打錯）這個交換不划算。
- 上游 v1.5.0 README 宣稱「-50% tokens」只在 lossy 形態下達成，是
  行銷數字，不是無代價的優化。
- Round-trip 每 call ~257 tokens，P2 增加 action field 多 ~6 tokens
  / call（< 3%）。

由於 P1 已換到官方 SDK + zod schema，schema 表達已經接近 minimum；要
再降 prompt 預算的方向應該是 P3 的 Resources/Prompts feature（把
不變內容移出 prompt），或經由 ToolManager 砍冷門 tool 集合。

下面內容保留作歷史備查（原始計畫與門檻）。

---

**Status (legacy)**: pending（**先量測再決定是否執行**）
**預估工時**: ~1-2 週（若執行）
**風險**: 中（會改變對外工具名稱，需通知 client）
**前置**: P1 完成 + token 量測結果

## 是否執行的決策準則

P1 完成後跑 baseline scenario 量測。若以下條件都滿足，**才執行 P2**：

1. 量測顯示 `tools/list` 回傳的 schema JSON 字數仍佔 prompt 預算 >20%。
2. 至少 3 個常用 client（Claude/Cursor/VS-like）會把整份 schema 預載入
   prompt（部分 client 是 lazy load，無此問題）。
3. 用 action router 模式重寫後，估算 schema 字數可降 ≥ 40%。

若任一不成立，跳過 P2，直接做 P3。

## 範圍（若執行）

把 ~170 個獨立工具收斂為 ~30-50 個帶 `action` 操作碼的「廣義工具」。
**不增加功能**，只重組對外介面。

## 收斂藍本

依 `analysis/tool-inventory.md` §四的對應表，預計收斂為以下類別（草案）：

| 廣義工具 | 涵蓋現有工具 | action 數 |
|---|---|---|
| `scene_management` | scene + scene_advanced 內場景控制相關 | ~10 |
| `scene_hierarchy` | scene_get_scene_hierarchy + 相關 query | ~5 |
| `scene_view` | sceneView_* 全部 | ~15 |
| `node` | node_* 主要操作 | ~10 |
| `node_hierarchy` | move/duplicate/cut/paste/copy | ~6 |
| `component` | component_* + sceneAdvanced 內組件相關 | ~10 |
| `prefab` | prefab_* 全部 | ~10 |
| `asset` | project_*（資源相關） + assetAdvanced_* | ~15 |
| `project` | project_* 非資源相關 | ~8 |
| `debug` | debug_* | ~10 |
| `preferences` | preferences_* | ~7 |
| `server` | server_* | ~6 |
| `broadcast` | broadcast_* | ~5 |
| `reference_image` | referenceImage_* | ~12 |

合計 ~14 個廣義工具，~130 個 action（與原 170 工具對應；少掉的部分為刪除
冗餘 / 合併重疊）。

## 執行步驟

### T-P2-1：定義 action router pattern

新增 `source/lib/action-router.ts`：

- 提供 `defineActionTool({name, description, actions})` helper。
- 每個 action 有獨立 zod schema 與 handler。
- 自動產生 conditional JSON Schema（`oneOf` by `action` discriminator）。

### T-P2-2：第一個試點：`prefab` 收斂

選 prefab 作試點，因為它工具數適中（12）、邏輯獨立、是 v1.5.0 主打項。

### T-P2-3：依序收斂其餘類別

逐一執行，每類別獨立 commit。最容易爆炸的是 `component` 與
`scene_advanced`（混雜度高），放最後。

### T-P2-4：保留向後相容

舊工具名（`prefab_create_prefab` 等）改成 deprecated alias，內部轉發到
新的 `prefab(action='create')`。發 deprecation warning 至少一個 release
後再移除。

### T-P2-5：再量測一次 token

對比收斂前後同一個 scenario 的 token 用量，記錄到
`docs/analysis/post-consolidation-metrics.md`（新建）。

## 完成標準

- [ ] 14 個廣義工具全到位、每個有 zod schema。
- [ ] 舊工具名仍可呼叫（alias 模式）。
- [ ] `tsc --noEmit` 通過。
- [ ] Token 量測結果落地，無論結果如何（成功 = 收斂值得；失敗 = 警示後人
      不要再走這條路）。

## 風險與緩解

- **風險**：action router 的 conditional schema 太複雜，反而 client 解析
  失敗。
  **緩解**：先用最簡單的 `oneOf` discriminator，避免巢狀；client 端先實機
  測試。
- **風險**：alias 機制讓程式碼變兩倍。
  **緩解**：alias 用一張 map 機械轉發，不複製 handler。
