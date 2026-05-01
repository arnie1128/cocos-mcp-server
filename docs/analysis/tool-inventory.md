# 工具盤點

> ⚠️ **STALE SNAPSHOT — 不再維護**。撰寫日期：2026-04-30，基線：`754adec`。
> 此檔為 fork 起點的工具普查，留下來看當時架構分析（§3.1-3.4 對 prefab-tools
> 異常肥大、set_component_property 過載、scene-advanced 雜燴、validation 名
> 實不符的批評）仍然有 reference 價值；**但統計數字早已過期**。
>
> **取得當前工具數的正確管道**：
> - `CLAUDE.md` §What this is（活檔，每次工具增刪都更新）
> - `docs/HANDOFF.md` §進度快照 + §環境快速確認的 `health` curl 命令
> - 直接跑：`node -e "const {createToolRegistry} = require('./dist/tools/registry.js'); …"`（HANDOFF 環境快速確認段有完整 one-liner）
>
> 截至 v2.1.4（2026-05-01）：14 類 / **160 tools**。各檔行數也大幅縮減
> （`prefab-tools.ts` 從 2855 → ~470）。
>
> ---
>
> 以下為 2026-04-30 原文（**勿改**，僅作歷史快照）：
>
> 統計來源：`grep -nE "name:\s*'[a-z_]+'" source/tools/*.ts`
>
> 本檔為快照，不事後改寫。**驗證後的數字**（P1 T-P1-4 落地後，
> 透過 `createToolRegistry()` 列舉）：14 類 / **157 tools**。
> 與下表 ~170 的差異主要來自原本 grep 對 schema 內 enum 字串的誤計。
> 各類工具 metadata 仍是這份盤點的對應檔；個別檔案行數因 zod 遷移與
> T-P1-6 死代碼刪除已大幅縮減（特別是 `prefab-tools.ts` 從 2855 → ~2400）。

## 一、總計

**約 170 個工具定義**，分佈於 14 個 `*-tools.ts` 檔。

> README 寫「150+」、FEATURE_GUIDE 寫「158」、實測 grep 170。差異主要來自
> 計算口徑（部分 tool 在 schema 內 enum 一個欄位被解讀成多種「動作」）。

## 二、各類別統計

| 類別 | 檔案 | 工具數 | 程式碼行數 |
|---|---|---|---|
| `scene` | `scene-tools.ts` | 10 | 481 |
| `node` | `node-tools.ts` | 15 | 1113 |
| `component` | `component-tools.ts` | 11 | 1776 |
| `prefab` | `prefab-tools.ts` | 12 | 2855 |
| `project` | `project-tools.ts` | 24 | 1097 |
| `debug` | `debug-tools.ts` | 11 | 641 |
| `preferences` | `preferences-tools.ts` | 7 | 330 |
| `server` | `server-tools.ts` | 6 | 259 |
| `broadcast` | `broadcast-tools.ts` | 5 | 263 |
| `sceneAdvanced` | `scene-advanced-tools.ts` | 23 | 775 |
| `sceneView` | `scene-view-tools.ts` | 20 | 627 |
| `referenceImage` | `reference-image-tools.ts` | 12 | 398 |
| `assetAdvanced` | `asset-advanced-tools.ts` | 11 | 613 |
| `validation` | `validation-tools.ts` | 3 | 262 |
| **合計** | | **~170** | **~13,300** |

## 三、值得注意的觀察

### 3.1 prefab-tools.ts 異常肥大

12 個工具佔了 2855 行（每工具均攤 238 行），主因：

- `establishPrefabConnection` / `manuallyEstablishPrefabConnection` /
  `readPrefabFile` / `tryCreateNodeWithPrefab` /
  `tryAlternativeInstantiateMethods` / `applyPrefabToNode` / ... 等
  fallback helper 共佔約 500 行。
- 預製體 JSON 結構（`_prefab`、`__id__`、`fileId`）的手動處理邏輯。

收斂機會：把 prefab 序列化邏輯抽到 `source/lib/prefab-serializer.ts`，工具
檔只負責協定／呼叫。

### 3.2 component-tools.ts 的 `set_component_property` 過載

單一工具處理 16 種 propertyType（`source/tools/component-tools.ts:101-107`），
schema 描述文字 ~50 行。這已經是「假裝是一個工具的 action router」。

收斂機會：v1.5.0 的 action 模式天生適合這裡，可拆成
`component_set_value` + `component_set_reference` + `component_set_array`。

### 3.3 scene-advanced-tools.ts 內容混雜

23 個工具混雜了：

- 節點操作（reset、copy、paste、cut、move array element）
- 組件方法執行（execute_component_method、execute_scene_script）
- Undo/redo 控制（begin/end/cancel_undo_recording）
- Scene 查詢（query_scene_ready / dirty / classes / components）

實質上應該拆成 `scene-tools`（場景控制）+ `node-tools`（節點進階）+
`undo-tools`（編輯歷史）。原作者把所有「想不到放哪」的工具都丟這裡。

### 3.4 validation-tools.ts 名實不符

3 個工具：

- `validate_json_params`：給 client 用的「JSON 預檢」。
- `safe_string_value`：字串 escape。
- `format_mcp_request`：格式化 MCP 請求範例。

**這些不是工具，是 client-side helper**。MCP server 不該負責這些，應該寫進
README/文件或刪除。

## 四、按 v1.5.0「50 工具」目標的可能映射

如果要照原作者 v1.5.0 收斂方向重組（非必然執行，僅供參考），最可能的對應：

| v1.5.0 目標工具 | 對應現有工具（合併） |
|---|---|
| `scene_management` | scene_get_current_scene / scene_get_scene_list / scene_open_scene / scene_save_scene / scene_create_scene / scene_save_scene_as / scene_close_scene |
| `scene_hierarchy` | scene_get_scene_hierarchy / sceneAdvanced_query_scene_components 等 |
| `scene_execution_control` | sceneAdvanced_execute_component_method / sceneAdvanced_execute_scene_script |
| `node_query` | node_find_nodes / node_find_node_by_name / node_get_all_nodes / node_get_node_info / node_detect_node_type |
| `node_lifecycle` | node_create_node / node_delete_node + 預製體實例化 |
| `node_transform` | node_set_node_transform / node_set_node_property |
| `node_hierarchy` | node_move_node / node_duplicate_node / sceneAdvanced_copy/paste/cut_node |
| `node_clipboard` | sceneAdvanced_copy/paste/cut_node（與上面有重疊） |
| `node_property_management` | sceneAdvanced_reset_node_property / reset_node_transform / reset_component |
| `component_manage` | component_add_component / component_remove_component / component_get_components / component_get_component_info |
| `component_script` | component_attach_script |
| `component_query` | component_get_available_components |
| `set_component_property` | component_set_component_property |
| `prefab_browse` | prefab_get_prefab_list / prefab_load_prefab / prefab_get_prefab_info / prefab_validate_prefab |
| `prefab_lifecycle` | prefab_create_prefab / prefab_update_prefab / prefab_duplicate_prefab |
| `prefab_instance` | prefab_instantiate_prefab / prefab_revert_prefab / sceneAdvanced_restore_prefab / prefab_restore_prefab_node |
| `prefab_edit` | （目前未實作） |
| ... | ... |

可看出大多數收斂是「把同類別的相關 verb 包成 action enum」，**並不會減少
功能面**，只會減少 `tools/list` 的回應長度。實際 token 改善取決於 prompt
策略。
