# MCP 工具參考

> ⚙️ **本檔由 `scripts/generate-tools-doc.js` 自動產生**，請勿手動編輯。
> 工具增減或 schema 變動後，跑 `npm run build && node scripts/generate-tools-doc.js`
> 重新生成。手寫的章節介紹（category 描述、總覽段）放在 generator 內。

Cocos MCP Server 透過 [Model Context Protocol](https://modelcontextprotocol.io/) 對外暴露
**160 個工具**，分 **14** 個 category。
每個工具的 input schema 由 zod 在 `source/tools/<category>-tools.ts` 內定義，
經過 `lib/schema.ts:toInputSchema` 轉成 JSON Schema 後送出 `tools/list`，
Tool description 也直接來自 zod `.describe()` 文字。

## 共用約定

- **回應格式**：成功時 `{ success: true, data: {...}, message?: string }`；
  失敗時 `{ success: false, error: string, instruction?: string }`。MCP `tools/call`
  將以 `structuredContent` 帶回成功 payload，failure 走 `isError: true` 並把 error
  訊息塞進 `content[].text`。
- **REST 短路**：除了標準 MCP `/mcp` endpoint，server 也提供
  `POST /api/{category}/{tool}` 直接呼叫單一工具，方便 curl 測試。
- **Reference 屬性的 propertyType**：對 component reference（如 `cc.Canvas.cameraComponent`）
  必須用 `propertyType: "component"` 並提供裝載該 component 的 **node UUID**；
  server 會自動解析 component 的 scene `__id__`。傳錯會在 preflight 階段被擋下並
  回正確的範例。

## 工具總覽

| Category | 工具數 | 涵蓋 |
|---|---|---|
| [`scene`](#scene) | 8 | 場景檔案層級操作：開／關／儲存／新建／另存。`create_scene` 支援 `template` 參數可一次寫入 2D 或 3D 範本。 |
| [`sceneAdvanced`](#sceneadvanced) | 23 | 場景進階查詢與 scene-script 入口：依 asset uuid 反查節點、執行任意 scene-script 方法、批次節點查詢等。 |
| [`sceneView`](#sceneview) | 20 | 場景視圖控制：gizmo 工具切換、座標系、視圖模式、參考圖等。會影響編輯器面板，不影響 runtime 行為。 |
| [`node`](#node) | 11 | 節點生命週期：建立、查詢、改名、變換、移動、複製、刪除。`create_node` 支援 `layer` 參數；parent 是 Canvas 後代時自動推… |
| [`component`](#component) | 10 | 組件 CRUD、property 設定、事件綁定（cc.EventHandler）。`set_component_property` 對 reference… |
| [`prefab`](#prefab) | 11 | Prefab façade 工具集：建立、實例化、apply、link/unlink、get-data、restore。除了 `restore_prefab… |
| [`project`](#project) | 24 | 資源管理 + 專案建構：asset CRUD、build / preview server、設定查詢。覆蓋大多數 asset-db 高頻操作。 |
| [`debug`](#debug) | 9 | console log 與系統資訊：取得 / 清空 console、讀 project log 檔、編輯器資訊。 |
| [`preferences`](#preferences) | 7 | 編輯器偏好設定的讀寫。 |
| [`server`](#server) | 6 | MCP server 自身的狀態與環境資訊。 |
| [`broadcast`](#broadcast) | 5 | `Editor.Message` 廣播訊息監聽 / 發送。 |
| [`referenceImage`](#referenceimage) | 12 | 場景視圖中參考圖的管理（add / remove / list / 透明度等）。 |
| [`assetAdvanced`](#assetadvanced) | 11 | asset-db 進階：meta 寫入、URL 生成、相依性查詢、批次匯入 / 刪除、未使用資源偵測等。 |
| [`validation`](#validation) | 3 | 場景與資源完整性檢查工具，回報缺失或錯誤的 reference。 |

---

## 1. scene（場景操作）

場景檔案層級操作：開／關／儲存／新建／另存。`create_scene` 支援 `template` 參數可一次寫入 2D 或 3D 範本。

本 category 共 **8** 個工具。

### `scene_get_current_scene`

Read the currently open scene root summary (name/uuid/type/active/nodeCount). No scene mutation; use to get the scene root UUID.

**參數**：無

### `scene_get_scene_list`

List .scene assets under db://assets with name/path/uuid. Does not open scenes or modify assets.

**參數**：無

### `scene_open_scene`

Open a scene by db:// path. Switches the active Editor scene; save current edits first if needed.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `scenePath` | string | ✓ |  | Scene db:// path to open, e.g. db://assets/scenes/Main.scene. The tool resolves UUID first. |

### `scene_save_scene`

Save the currently open scene back to its scene asset. Mutates the project file on disk.

**參數**：無

### `scene_create_scene`

Create a new .scene asset. Mutates asset-db; non-empty templates also open the new scene and populate standard Camera/Canvas or Camera/Light nodes.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `sceneName` | string | ✓ |  | New scene name; written into the created cc.SceneAsset / cc.Scene. |
| `savePath` | string | ✓ |  | Target scene location. Pass a full .scene path or a folder path to append sceneName.scene. |
| `template` | enum: `empty` \| `2d-ui` \| `3d-basic` |  | `"empty"` | Built-in scaffolding for the new scene. "empty" (default): bare scene root only — current behavior. "2d-ui": Camera (cc.Camera, ortho projection) + Canvas (cc.UITransform + cc.Canvas with cameraComponent linked, layer UI_2D) so UI nodes render immediately under the UI camera. "3d-basic": Camera (perspective) + DirectionalLight at scene root. ⚠️ Side effect: when template is not "empty" the editor opens the newly created scene to populate it. Save your current scene first if it has unsaved changes. |

### `scene_save_scene_as`

Copy the currently open scene to a new .scene asset. Saves current scene first; optionally opens the copy and can overwrite when requested.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `path` | string | ✓ |  | Target db:// path for the new scene file (e.g. "db://assets/scenes/Copy.scene"). The ".scene" extension is appended if missing. |
| `openAfter` | boolean |  | `true` | Open the newly-saved scene right after the copy. Default true. Pass false to keep the current scene focused. |
| `overwrite` | boolean |  | `false` | Overwrite the target file if it already exists. Default false; with false, a name collision returns an error. |

### `scene_close_scene`

Close the current scene. Editor state side effect; save first if unsaved changes matter.

**參數**：無

### `scene_get_scene_hierarchy`

Read the complete current scene node hierarchy. No mutation; use for UUID/path lookup, optionally with component summaries.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `includeComponents` | boolean |  | `false` | Include component type/enabled summaries on each node. Increases response size. |

---

## 2. sceneAdvanced（場景進階）

場景進階查詢與 scene-script 入口：依 asset uuid 反查節點、執行任意 scene-script 方法、批次節點查詢等。

本 category 共 **23** 個工具。

### `sceneAdvanced_reset_node_property`

Reset one node property to Cocos default; mutates scene.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `uuid` | string | ✓ |  | Node UUID whose property should be reset. |
| `path` | string | ✓ |  | Node property path to reset, e.g. position, rotation, scale, layer. |

### `sceneAdvanced_move_array_element`

Move an item in a node array property such as __comps__; mutates scene.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `uuid` | string | ✓ |  | Node UUID that owns the array property. |
| `path` | string | ✓ |  | Array property path, e.g. __comps__. |
| `target` | number | ✓ |  | Original index of the array item to move. |
| `offset` | number | ✓ |  | Relative move offset; positive moves later, negative moves earlier. |

### `sceneAdvanced_remove_array_element`

Remove an item from a node array property by index; mutates scene.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `uuid` | string | ✓ |  | Node UUID that owns the array property. |
| `path` | string | ✓ |  | Array property path to edit. |
| `index` | number | ✓ |  | Array index to remove. |

### `sceneAdvanced_copy_node`

Copy nodes through the Cocos scene clipboard channel.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `uuids` | string \| array<string> | ✓ |  | Node UUID or UUID array to copy into the editor clipboard context. |

### `sceneAdvanced_paste_node`

Paste copied nodes under a target parent; mutates scene and returns new UUIDs.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `target` | string | ✓ |  | Target parent node UUID for pasted nodes. |
| `uuids` | string \| array<string> | ✓ |  | Node UUID or UUID array returned/used by copy_node. |
| `keepWorldTransform` | boolean |  | `false` | Preserve world transform while pasting/reparenting when Cocos supports it. |

### `sceneAdvanced_cut_node`

Cut nodes through the Cocos scene channel; clipboard/scene side effects.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `uuids` | string \| array<string> | ✓ |  | Node UUID or UUID array to cut via editor scene channel. |

### `sceneAdvanced_reset_node_transform`

Reset node transform to Cocos defaults; mutates scene.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `uuid` | string | ✓ |  | Node UUID whose transform should be reset to default. |

### `sceneAdvanced_reset_component`

Reset a component by component UUID; mutates scene.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `uuid` | string | ✓ |  | Component UUID to reset to default values. |

### `sceneAdvanced_restore_prefab`

Restore a prefab instance through scene/restore-prefab; mutates scene.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `nodeUuid` | string | ✓ |  | Prefab instance node UUID to restore. |
| `assetUuid` | string | ✓ |  | Prefab asset UUID kept for context; scene/restore-prefab uses nodeUuid only. |

### `sceneAdvanced_execute_component_method`

Execute an editor-exposed component method; side effects depend on method.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `uuid` | string | ✓ |  | Component UUID whose editor-exposed method should be invoked. |
| `name` | string | ✓ |  | Method name to execute on the component. |
| `args` | array<any> |  | `[]` | Positional method arguments. |

### `sceneAdvanced_execute_scene_script`

Execute a scene script method; low-level escape hatch that can mutate scene.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `name` | string | ✓ |  | Scene script package/plugin name. |
| `method` | string | ✓ |  | Scene script method name to execute. |
| `args` | array<any> |  | `[]` | Positional method arguments. |

### `sceneAdvanced_scene_snapshot`

Create a Cocos scene snapshot for undo/change tracking.

**參數**：無

### `sceneAdvanced_scene_snapshot_abort`

Abort the current Cocos scene snapshot.

**參數**：無

### `sceneAdvanced_begin_undo_recording`

Begin undo recording for a node and return undoId.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `nodeUuid` | string | ✓ |  | Node UUID whose changes should be covered by the undo recording. |

### `sceneAdvanced_end_undo_recording`

Commit a previously started undo recording.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `undoId` | string | ✓ |  | Undo recording ID returned by begin_undo_recording. |

### `sceneAdvanced_cancel_undo_recording`

Cancel a previously started undo recording.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `undoId` | string | ✓ |  | Undo recording ID to cancel without committing. |

### `sceneAdvanced_soft_reload_scene`

Soft reload the current scene; Editor state side effect.

**參數**：無

### `sceneAdvanced_query_scene_ready`

Check whether the scene module reports ready.

**參數**：無

### `sceneAdvanced_query_scene_dirty`

Check whether the current scene has unsaved changes.

**參數**：無

### `sceneAdvanced_query_scene_classes`

List registered scene classes, optionally filtered by base class.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `extends` | string |  |  | Optional base class filter for scene/query-classes. |

### `sceneAdvanced_query_scene_components`

List available scene component definitions from Cocos.

**參數**：無

### `sceneAdvanced_query_component_has_script`

Check whether a component class has an associated script.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `className` | string | ✓ |  | Script class name to check through scene/query-component-has-script. |

### `sceneAdvanced_query_nodes_by_asset_uuid`

Find current-scene nodes that reference an asset UUID.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `assetUuid` | string | ✓ |  | Asset UUID to search for in scene nodes. |

---

## 3. sceneView（場景視圖）

場景視圖控制：gizmo 工具切換、座標系、視圖模式、參考圖等。會影響編輯器面板，不影響 runtime 行為。

本 category 共 **20** 個工具。

### `sceneView_change_gizmo_tool`

Change active scene view gizmo tool; UI side effect only.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `name` | enum: `position` \| `rotation` \| `scale` \| `rect` | ✓ |  | Scene view gizmo tool to activate. |

### `sceneView_query_gizmo_tool_name`

Read active scene view gizmo tool.

**參數**：無

### `sceneView_change_gizmo_pivot`

Change scene view transform pivot mode; UI side effect only.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `name` | enum: `pivot` \| `center` | ✓ |  | Transform pivot mode: pivot or center. |

### `sceneView_query_gizmo_pivot`

Read current scene view pivot mode.

**參數**：無

### `sceneView_query_gizmo_view_mode`

Read current scene view/select mode.

**參數**：無

### `sceneView_change_gizmo_coordinate`

Change scene view coordinate system to local/global; UI side effect only.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `type` | enum: `local` \| `global` | ✓ |  | Transform coordinate system for the scene view gizmo. |

### `sceneView_query_gizmo_coordinate`

Read current scene view coordinate system.

**參數**：無

### `sceneView_change_view_mode_2d_3d`

Switch scene view between 2D and 3D; UI side effect only.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `is2D` | boolean | ✓ |  | true switches scene view to 2D mode; false switches to 3D mode. |

### `sceneView_query_view_mode_2d_3d`

Read whether scene view is in 2D or 3D mode.

**參數**：無

### `sceneView_set_grid_visible`

Show or hide scene view grid; UI side effect only.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `visible` | boolean | ✓ |  | Whether the scene view grid should be visible. |

### `sceneView_query_grid_visible`

Read scene view grid visibility.

**參數**：無

### `sceneView_set_icon_gizmo_3d`

Switch IconGizmo between 3D and 2D mode; UI side effect only.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `is3D` | boolean | ✓ |  | true sets IconGizmo to 3D mode; false sets 2D mode. |

### `sceneView_query_icon_gizmo_3d`

Read current IconGizmo 3D/2D mode.

**參數**：無

### `sceneView_set_icon_gizmo_size`

Set IconGizmo display size; UI side effect only.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `size` | number | ✓ |  | IconGizmo size from 10 to 100. |

### `sceneView_query_icon_gizmo_size`

Read current IconGizmo display size.

**參數**：無

### `sceneView_focus_camera_on_nodes`

Focus scene view camera on nodes or all nodes; camera UI side effect only.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `uuids` | array<string> \| null | ✓ |  | Node UUIDs to focus the scene camera on. null focuses all nodes. |

### `sceneView_align_camera_with_view`

Apply scene view camera transform to selected camera/node; may mutate selection.

**參數**：無

### `sceneView_align_view_with_node`

Align scene view to selected node; camera UI side effect only.

**參數**：無

### `sceneView_get_scene_view_status`

Read combined scene view status snapshot.

**參數**：無

### `sceneView_reset_scene_view`

Reset scene view UI settings to defaults; UI side effects only.

**參數**：無

---

## 4. node（節點）

節點生命週期：建立、查詢、改名、變換、移動、複製、刪除。`create_node` 支援 `layer` 參數；parent 是 Canvas 後代時自動推 UI_2D。

本 category 共 **11** 個工具。

### `node_create_node`

Create a node in current scene; supports empty, components, or prefab/asset instance. Provide parentUuid for predictable placement.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `name` | string | ✓ |  | New node name. The response returns the created UUID. |
| `parentUuid` | string |  |  | Parent node UUID. Strongly recommended; omit only when creating at scene root. |
| `nodeType` | enum: `Node` \| `2DNode` \| `3DNode` |  | `"Node"` | Empty-node type hint. Usually unnecessary when instantiating from assetUuid/assetPath. |
| `siblingIndex` | number |  | `-1` | Sibling index under the parent. -1 means append. |
| `assetUuid` | string |  |  | Asset UUID to instantiate from, e.g. prefab UUID. Creates an asset instance instead of an empty node. |
| `assetPath` | string |  |  | db:// asset path to instantiate from. Alternative to assetUuid; resolved before create-node. |
| `components` | array<string> |  |  | Component types to add after creation, e.g. ["cc.Sprite","cc.Button"]. |
| `unlinkPrefab` | boolean |  | `false` | When instantiating a prefab, immediately unlink it into a regular node. Default false preserves prefab link. |
| `keepWorldTransform` | boolean |  | `false` | Preserve world transform while parenting/creating when Cocos supports it. |
| `layer` | enum: `DEFAULT` \| `UI_2D` \| `UI_3D` \| `SCENE_GIZMO` \| `EDITOR` \| `GIZMOS` \| `IGNORE_RAYCAST` \| `PROFILER` \| integer |  |  | Node layer (cc.Layers). Accepts preset name (e.g. "UI_2D") or raw bitmask number. If omitted: auto-detected — UI_2D when any ancestor has cc.Canvas (so UI camera renders the new node), otherwise leaves the create-node default (DEFAULT). Required for UI nodes under Canvas; without it the node is invisible to the UI camera. |
| `initialTransform` | object{position, rotation, scale} |  |  | Initial transform applied after create-node via set_node_transform. |

### `node_get_node_info`

Read one node by UUID, including transform, children, and component summary. No mutation.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `uuid` | string | ✓ |  | Node UUID to inspect. |

### `node_find_nodes`

Search current-scene nodes by name pattern and return multiple matches. No mutation; use when names may be duplicated.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `pattern` | string | ✓ |  | Node name search pattern. Partial match unless exactMatch=true. |
| `exactMatch` | boolean |  | `false` | Require exact node name match. Default false. |

### `node_find_node_by_name`

Find the first node with an exact name. No mutation; only safe when the name is unique enough.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `name` | string | ✓ |  | Exact node name to find. Returns the first match only. |

### `node_get_all_nodes`

List all current-scene nodes with name/uuid/type/path; primary source for nodeUuid/parentUuid.

**參數**：無

### `node_set_node_property`

Write a node property path. Mutates scene; use for active/name/layer. Prefer set_node_transform for position/rotation/scale.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `uuid` | string | ✓ |  | Node UUID to modify. |
| `property` | string | ✓ |  | Node property path, e.g. active, name, layer. Prefer set_node_transform for position/rotation/scale. |
| `value` | any | ✓ |  | Value to write; must match the Cocos dump shape for the property path. |

### `node_set_node_transform`

Write position/rotation/scale with 2D/3D normalization; mutates scene.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `uuid` | string | ✓ |  | Node UUID whose transform should be changed. |
| `position` | object{x, y, z} |  |  | Local position. 2D nodes mainly use x/y; 3D nodes use x/y/z. |
| `rotation` | object{x, y, z} |  |  | Local euler rotation. 2D nodes mainly use z; 3D nodes use x/y/z. |
| `scale` | object{x, y, z} |  |  | Local scale. 2D nodes mainly use x/y and usually keep z=1. |

### `node_delete_node`

Delete a node from the current scene. Mutates scene and removes children; verify UUID first.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `uuid` | string | ✓ |  | Node UUID to delete. Children are removed with the node. |

### `node_move_node`

Reparent a node under a new parent. Mutates scene; current implementation does not preserve world transform.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `nodeUuid` | string | ✓ |  | Node UUID to reparent. |
| `newParentUuid` | string | ✓ |  | New parent node UUID. |
| `siblingIndex` | number |  | `-1` | Sibling index under the new parent. Currently advisory; move uses set-parent. |

### `node_duplicate_node`

Duplicate a node and return the new UUID. Mutates scene; child inclusion follows Cocos duplicate-node behavior.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `uuid` | string | ✓ |  | Node UUID to duplicate. |
| `includeChildren` | boolean |  | `true` | Whether children should be included; actual behavior follows Cocos duplicate-node. |

### `node_detect_node_type`

Heuristically classify a node as 2D or 3D from components/transform. No mutation; helps choose transform semantics.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `uuid` | string | ✓ |  | Node UUID to classify as 2D or 3D by heuristic. |

---

## 5. component（組件）

組件 CRUD、property 設定、事件綁定（cc.EventHandler）。`set_component_property` 對 reference 屬性會做 propertyType vs metadata 的 preflight 檢查；提供 `preserveContentSize` 旗標處理 Sprite 指派 spriteFrame 後 contentSize 被覆蓋的問題。

本 category 共 **10** 個工具。

### `component_add_component`

Add a component to a specific node. Mutates scene; provide nodeUuid explicitly and verify the component type or script class name first.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `nodeUuid` | string | ✓ |  | Target node UUID. REQUIRED: You must specify the exact node to add the component to. Use get_all_nodes or find_node_by_name to get the UUID of the desired node. |
| `componentType` | string | ✓ |  | Component type to add, e.g. cc.Sprite, cc.Label, cc.Button, or a custom script class name. |

### `component_remove_component`

Remove a component from a node. Mutates scene; componentType must be the cid/type returned by get_components, not a guessed script name.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `nodeUuid` | string | ✓ |  | Node UUID that owns the component to remove. |
| `componentType` | string | ✓ |  | Component cid (type field from getComponents). Do NOT use script name or class name. Example: "cc.Sprite" or "9b4a7ueT9xD6aRE+AlOusy1" |

### `component_get_components`

List all components on a node with type/cid and basic properties. No mutation; use before remove_component or set_component_property.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `nodeUuid` | string | ✓ |  | Node UUID whose components should be listed. |

### `component_get_component_info`

Read detailed data for one component on a node. No mutation; use to inspect property names and value shapes before editing.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `nodeUuid` | string | ✓ |  | Node UUID that owns the component. |
| `componentType` | string | ✓ |  | Component type/cid to inspect. Use get_components first if unsure. |

### `component_set_component_property`

Set component property values for UI components or custom script components. Supports setting properties of built-in UI components (e.g., cc.Label, cc.Sprite) and custom script components. Note: For node basic properties (name, active, layer, etc.), use set_node_property. For node transform properties (position, rotation, scale, etc.), use set_node_transform.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `nodeUuid` | string | ✓ |  | Target node UUID - Must specify the node to operate on |
| `componentType` | string | ✓ |  | Component type - Can be built-in components (e.g., cc.Label) or custom script components (e.g., MyScript). If unsure about component type, use get_components first to retrieve all components on the node. |
| `property` | string | ✓ |  | Property name - The property to set. Common properties include:<br>• cc.Label: string (text content), fontSize (font size), color (text color)<br>• cc.Sprite: spriteFrame (sprite frame), color (tint color), sizeMode (size mode)<br>• cc.Button: normalColor (normal color), pressedColor (pressed color), target (target node — propertyType: "node")<br>• cc.Canvas: cameraComponent (cc.Camera ref — propertyType: "component", value = node UUID hosting the camera)<br>• cc.UITransform: contentSize (content size), anchorPoint (anchor point)<br>• Custom Scripts: Based on properties defined in the script |
| `propertyType` | enum: `string` \| `number` \| `boolean` \| `integer` \| `float` \| `color` \| `vec2` \| `vec3` \| `size` \| `node` \| `component` \| `spriteFrame` \| `prefab` \| `asset` \| `nodeArray` \| `colorArray` \| `numberArray` \| `stringArray` | ✓ |  | Property type - Must explicitly specify the property data type for correct value conversion and validation |
| `value` | any | ✓ |  | Property value - Use the corresponding data format based on propertyType:<br><br>📝 Basic Data Types:<br>• string: "Hello World" (text string)<br>• number/integer/float: 42 or 3.14 (numeric value)<br>• boolean: true or false (boolean value)<br><br>🎨 Color Type:<br>• color: {"r":255,"g":0,"b":0,"a":255} (RGBA values, range 0-255)<br>  - Alternative: "#FF0000" (hexadecimal format)<br>  - Transparency: a value controls opacity, 255 = fully opaque, 0 = fully transparent<br><br>📐 Vector and Size Types:<br>• vec2: {"x":100,"y":50} (2D vector)<br>• vec3: {"x":1,"y":2,"z":3} (3D vector)<br>• size: {"width":100,"height":50} (size dimensions)<br><br>🔗 Reference Types (using UUID strings):<br>• node: "target-node-uuid" (cc.Node reference — property metadata type === "cc.Node")<br>  How to get: Use get_all_nodes or find_node_by_name to get node UUIDs<br>• component: "target-node-uuid" (cc.Component subclass reference — e.g. cc.Camera, cc.Sprite)<br>  ⚠️ Easy to confuse with "node": pick "component" whenever the property<br>     metadata expects a Component subclass, even though the value is still<br>     a NODE UUID (the server auto-resolves the component's scene __id__).<br>  Example — cc.Canvas.cameraComponent expects a cc.Camera ref:<br>     propertyType: "component", value: "<UUID of node that has cc.Camera>"<br>  Pitfall: passing propertyType: "node" for cameraComponent appears to<br>     succeed at the IPC layer but the reference never connects.<br>• spriteFrame: "spriteframe-uuid" (sprite frame asset)<br>  How to get: Check asset database or use asset browser<br>  ⚠️ Default cc.Sprite.sizeMode is TRIMMED (1), so assigning spriteFrame<br>     auto-resizes cc.UITransform.contentSize to the texture native size.<br>     Pass preserveContentSize: true to keep the node's current contentSize<br>     (the server pre-sets sizeMode to CUSTOM (0) before the assign).<br>• prefab: "prefab-uuid" (prefab asset)<br>  How to get: Check asset database or use asset browser<br>• asset: "asset-uuid" (generic asset reference)<br>  How to get: Check asset database or use asset browser<br><br>📋 Array Types:<br>• nodeArray: ["uuid1","uuid2"] (array of node UUIDs)<br>• colorArray: [{"r":255,"g":0,"b":0,"a":255}] (array of colors)<br>• numberArray: [1,2,3,4,5] (array of numbers)<br>• stringArray: ["item1","item2"] (array of strings) |
| `preserveContentSize` | boolean |  | `false` | Sprite-specific workflow flag. Only honoured when componentType="cc.Sprite" and property="spriteFrame": before the assign, sets cc.Sprite.sizeMode to CUSTOM (0) so the engine does NOT overwrite cc.UITransform.contentSize with the texture's native dimensions. Use when building UI procedurally and the node's pre-set size must be kept; leave false (default) to keep cocos' standard TRIMMED auto-fit behaviour. |

### `component_attach_script`

Attach a script asset as a component to a node. Mutates scene; use get_components afterward because custom scripts may appear as cid.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `nodeUuid` | string | ✓ |  | Node UUID to attach the script component to. |
| `scriptPath` | string | ✓ |  | Script asset db:// path, e.g. db://assets/scripts/MyScript.ts. |

### `component_get_available_components`

Return a curated built-in component type list by category. No scene query; custom project scripts are not discovered here.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `category` | enum: `all` \| `renderer` \| `ui` \| `physics` \| `animation` \| `audio` |  | `"all"` | Component category filter for the built-in curated list. |

### `component_add_event_handler`

Append a cc.EventHandler to a component event array and nudge the editor model for persistence. Mutates scene; use for Button/Toggle/Slider callbacks.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `nodeUuid` | string | ✓ |  | Node UUID owning the component (e.g. the Button node) |
| `componentType` | string |  | `"cc.Button"` | Component class name; defaults to cc.Button |
| `eventArrayProperty` | string |  | `"clickEvents"` | Component property holding the EventHandler array (cc.Button.clickEvents, cc.Toggle.checkEvents, …) |
| `targetNodeUuid` | string | ✓ |  | Node UUID where the callback component lives (most often the same as nodeUuid) |
| `componentName` | string | ✓ |  | Class name (cc-class) of the script that owns the callback method |
| `handler` | string | ✓ |  | Method name on the target component, e.g. "onClick" |
| `customEventData` | string |  |  | Optional string passed back when the event fires |

### `component_remove_event_handler`

Remove EventHandler entries by index or targetNodeUuid+handler match, then nudge the editor model for persistence. Mutates scene.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `nodeUuid` | string | ✓ |  | Node UUID owning the component |
| `componentType` | string |  | `"cc.Button"` | Component class name |
| `eventArrayProperty` | string |  | `"clickEvents"` | EventHandler array property name |
| `index` | integer |  |  | Zero-based index to remove. Takes precedence over targetNodeUuid/handler matching when provided. |
| `targetNodeUuid` | string |  |  | Match handlers whose target node has this UUID |
| `handler` | string |  |  | Match handlers with this method name |

### `component_list_event_handlers`

List EventHandler entries currently bound to a component event array. No mutation; use before remove_event_handler.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `nodeUuid` | string | ✓ |  | Node UUID owning the component |
| `componentType` | string |  | `"cc.Button"` | Component class name |
| `eventArrayProperty` | string |  | `"clickEvents"` | EventHandler array property name |

---

## 6. prefab（預製體）

Prefab façade 工具集：建立、實例化、apply、link/unlink、get-data、restore。除了 `restore_prefab_node` 走 host `restore-prefab` channel，其他都透過 scene façade 介面（execute-scene-script）。

本 category 共 **11** 個工具。

### `prefab_get_prefab_list`

List .prefab assets under a folder with name/path/uuid. No scene or asset mutation.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `folder` | string |  | `"db://assets"` | db:// folder to scan for prefabs. Default db://assets. |

### `prefab_load_prefab`

Read prefab asset metadata only. Does not instantiate; use instantiate_prefab or create_node assetUuid/assetPath to add one to the scene.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `prefabPath` | string | ✓ |  | Prefab db:// path. Reads metadata only; does not instantiate. |

### `prefab_instantiate_prefab`

Instantiate a prefab into the current scene; mutates scene and preserves prefab link.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `prefabPath` | string | ✓ |  | Prefab db:// path to instantiate. |
| `parentUuid` | string |  |  | Parent node UUID. Omit to let Cocos choose the default parent. |
| `position` | object{x, y, z} |  |  | Initial local position for the created prefab instance. |

### `prefab_create_prefab`

Create a prefab asset from a scene node via cce.Prefab.createPrefab facade.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `nodeUuid` | string | ✓ |  | Source node UUID to convert into a prefab, including children and components. |
| `savePath` | string | ✓ |  | Target prefab db:// path. Pass a full .prefab path or a folder. |
| `prefabName` | string | ✓ |  | Prefab name; used as filename when savePath is a folder. |

### `prefab_update_prefab`

Apply prefab instance edits back to its linked prefab asset; prefabPath is context only.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `prefabPath` | string | ✓ |  | Prefab asset path for response context; apply uses nodeUuid linked prefab data. |
| `nodeUuid` | string | ✓ |  | Modified prefab instance node UUID to apply back to its linked prefab. |

### `prefab_revert_prefab`

Restore a prefab instance from its linked asset; discards unapplied overrides.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `nodeUuid` | string | ✓ |  | Prefab instance node UUID to restore from its linked asset. |

### `prefab_get_prefab_info`

Read prefab meta/dependency summary before apply/revert.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `prefabPath` | string | ✓ |  | Prefab asset db:// path. |

### `prefab_validate_prefab`

Run basic prefab JSON structural checks; not byte-level Cocos equivalence.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `prefabPath` | string | ✓ |  | Prefab db:// path whose JSON structure should be checked. |

### `prefab_restore_prefab_node`

Restore a prefab instance through scene/restore-prefab; assetUuid is context only.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `nodeUuid` | string | ✓ |  | Prefab instance node UUID passed to scene/restore-prefab. |
| `assetUuid` | string | ✓ |  | Prefab asset UUID kept for response context; Cocos restore-prefab uses nodeUuid only. |

### `prefab_set_link`

Attach or detach a prefab link on a node (mode="link" wraps cce.SceneFacade.linkPrefab; mode="unlink" wraps cce.SceneFacade.unlinkPrefab).

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `mode` | enum: `link` \| `unlink` | ✓ |  | Operation: "link" attaches a regular node to a prefab asset; "unlink" detaches a prefab instance. |
| `nodeUuid` | string | ✓ |  | Node UUID. For mode="link", the node to attach; for mode="unlink", the prefab instance to detach. |
| `assetUuid` | string |  |  | Prefab asset UUID. Required when mode="link"; ignored when mode="unlink". |
| `removeNested` | boolean |  | `false` | When mode="unlink", also unlink nested prefab instances under this node. Ignored when mode="link". |

### `prefab_get_prefab_data`

Read facade prefab dump for a prefab instance node. No mutation; useful for inspecting instance/link serialized data.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `nodeUuid` | string | ✓ |  | Prefab instance node UUID whose prefab dump should be read. |

---

## 7. project（專案／資源）

資源管理 + 專案建構：asset CRUD、build / preview server、設定查詢。覆蓋大多數 asset-db 高頻操作。

本 category 共 **24** 個工具。

### `project_run_project`

Open Build panel as preview fallback; does not launch preview automatically.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `platform` | enum: `browser` \| `simulator` \| `preview` |  | `"browser"` | Requested preview platform. Current implementation opens the build panel instead of launching preview. |

### `project_build_project`

Open Build panel for the requested platform; does not start the build.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `platform` | enum: `web-mobile` \| `web-desktop` \| `ios` \| `android` \| `windows` \| `mac` | ✓ |  | Build platform to pre-contextualize the response. Actual build still requires Editor UI. |
| `debug` | boolean |  | `true` | Requested debug build flag. Returned as context only; build is not started programmatically. |

### `project_get_project_info`

Read project name/path/uuid/version/Cocos version and config.

**參數**：無

### `project_get_project_settings`

Read one project settings category via project/query-config.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `category` | enum: `general` \| `physics` \| `render` \| `assets` |  | `"general"` | Project settings category to query via project/query-config. |

### `project_refresh_assets`

Refresh asset-db for a folder; affects Editor asset state, not file content.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `folder` | string |  |  | Asset db:// folder to refresh. Omit to refresh db://assets. |

### `project_import_asset`

Import one disk file into asset-db; mutates project assets.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `sourcePath` | string | ✓ |  | Absolute source file path on disk. Must exist. |
| `targetFolder` | string | ✓ |  | Target asset folder, either db://... or relative under db://assets. |

### `project_get_asset_info`

Read basic metadata for one db:// asset path.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `assetPath` | string | ✓ |  | Asset db:// path to query. |

### `project_get_assets`

List assets under a folder using type-specific filename patterns.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `type` | enum: `all` \| `scene` \| `prefab` \| `script` \| `texture` \| `material` \| `mesh` \| `audio` \| `animation` |  | `"all"` | Asset type filter translated into filename patterns. |
| `folder` | string |  | `"db://assets"` | Asset-db folder to search. Default db://assets. |

### `project_get_build_settings`

Report builder readiness and MCP build limitations.

**參數**：無

### `project_open_build_panel`

Open the Cocos Build panel; does not start a build.

**參數**：無

### `project_check_builder_status`

Check whether the builder worker is ready.

**參數**：無

### `project_start_preview_server`

Unsupported preview-server placeholder; use Editor UI.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `port` | number |  | `7456` | Requested preview server port. Current implementation reports unsupported. |

### `project_stop_preview_server`

Unsupported preview-server placeholder; use Editor UI.

**參數**：無

### `project_create_asset`

Create an asset file or folder through asset-db; null content creates folder.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `url` | string | ✓ |  | Target asset db:// URL, e.g. db://assets/newfile.json. |
| `content` | string \| null |  |  | File content. Pass null/omit for folder creation. |
| `overwrite` | boolean |  | `false` | Overwrite existing target instead of auto-renaming. |

### `project_copy_asset`

Copy an asset through asset-db; mutates project assets.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `source` | string | ✓ |  | Source asset db:// URL. |
| `target` | string | ✓ |  | Target asset db:// URL or folder path. |
| `overwrite` | boolean |  | `false` | Overwrite existing target instead of auto-renaming. |

### `project_move_asset`

Move/rename an asset through asset-db; mutates project assets.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `source` | string | ✓ |  | Source asset db:// URL. |
| `target` | string | ✓ |  | Target asset db:// URL or folder path. |
| `overwrite` | boolean |  | `false` | Overwrite existing target instead of auto-renaming. |

### `project_delete_asset`

Delete one asset-db URL; mutates project assets.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `url` | string | ✓ |  | Asset db:// URL to delete. |

### `project_save_asset`

Write serialized content to an asset URL; use only for known-good formats.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `url` | string | ✓ |  | Asset db:// URL whose content should be saved. |
| `content` | string | ✓ |  | Serialized asset content to write. |

### `project_reimport_asset`

Ask asset-db to reimport an asset; updates imported asset state/cache.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `url` | string | ✓ |  | Asset db:// URL to reimport. |

### `project_query_asset_path`

Resolve an asset db:// URL to disk path.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `url` | string | ✓ |  | Asset db:// URL to resolve to a disk path. |

### `project_query_asset_uuid`

Resolve an asset db:// URL to UUID.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `url` | string | ✓ |  | Asset db:// URL to resolve to UUID. |

### `project_query_asset_url`

Resolve an asset UUID to db:// URL.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `uuid` | string | ✓ |  | Asset UUID to resolve to db:// URL. |

### `project_find_asset_by_name`

Search assets by name with exact/type/folder filters; use to discover UUIDs/paths.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `name` | string | ✓ |  | Asset name search term. Partial match unless exactMatch=true. |
| `exactMatch` | boolean |  | `false` | Require exact asset name match. Default false. |
| `assetType` | enum: `all` \| `scene` \| `prefab` \| `script` \| `texture` \| `material` \| `mesh` \| `audio` \| `animation` \| `spriteFrame` |  | `"all"` | Asset type filter for the search. |
| `folder` | string |  | `"db://assets"` | Asset-db folder to search. Default db://assets. |
| `maxResults` | number |  | `20` | Maximum matched assets to return. Default 20. |

### `project_get_asset_details`

Read asset info plus known image sub-assets such as spriteFrame/texture UUIDs.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `assetPath` | string | ✓ |  | Asset db:// path to inspect. |
| `includeSubAssets` | boolean |  | `true` | Try to include known image sub-assets such as spriteFrame and texture UUIDs. |

---

## 8. debug（除錯）

console log 與系統資訊：取得 / 清空 console、讀 project log 檔、編輯器資訊。

本 category 共 **9** 個工具。

### `debug_clear_console`

Clear the Cocos Editor Console UI. No project side effects.

**參數**：無

### `debug_execute_script`

Execute arbitrary JavaScript in scene context; can mutate the current scene.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `script` | string | ✓ |  | JavaScript to execute in scene context via console/eval. Can read or mutate the current scene. |

### `debug_get_node_tree`

Read a debug node tree from a root or scene root for hierarchy/component inspection.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `rootUuid` | string |  |  | Root node UUID to expand. Omit to use the current scene root. |
| `maxDepth` | number |  | `10` | Maximum tree depth. Default 10; large values can return a lot of data. |

### `debug_get_performance_stats`

Try to read scene query-performance stats; may return unavailable in edit mode.

**參數**：無

### `debug_validate_scene`

Run basic current-scene health checks for missing assets and node-count warnings.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `checkMissingAssets` | boolean |  | `true` | Check missing asset references when the Cocos scene API supports it. |
| `checkPerformance` | boolean |  | `true` | Run basic performance checks such as high node count warnings. |

### `debug_get_editor_info`

Read Editor/Cocos/project/process information and memory summary.

**參數**：無

### `debug_get_project_logs`

Read temp/logs/project.log tail with optional level/keyword filters.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `lines` | number |  | `100` | Number of lines to read from the end of temp/logs/project.log. Default 100. |
| `filterKeyword` | string |  |  | Optional case-insensitive keyword filter. |
| `logLevel` | enum: `ERROR` \| `WARN` \| `INFO` \| `DEBUG` \| `TRACE` \| `ALL` |  | `"ALL"` | Optional log level filter. ALL disables level filtering. |

### `debug_get_log_file_info`

Read temp/logs/project.log path, size, line count, and timestamps.

**參數**：無

### `debug_search_project_logs`

Search temp/logs/project.log for string/regex and return line context.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `pattern` | string | ✓ |  | Search string or regex. Invalid regex is treated as a literal string. |
| `maxResults` | number |  | `20` | Maximum matches to return. Default 20. |
| `contextLines` | number |  | `2` | Context lines before/after each match. Default 2. |

---

## 9. preferences（偏好設定）

編輯器偏好設定的讀寫。

本 category 共 **7** 個工具。

### `preferences_open_preferences_settings`

Open Cocos Preferences UI, optionally on a tab; UI side effect only.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `tab` | enum: `general` \| `external-tools` \| `data-editor` \| `laboratory` \| `extensions` |  |  | Preferences tab to open. Omit for the default settings panel. |
| `args` | array<any> |  |  | Extra tab arguments; normally unnecessary. |

### `preferences_query_preferences_config`

Read a Preferences config category/path/type; query before setting values.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `name` | string |  | `"general"` | Preferences category or extension/plugin name. Default general. |
| `path` | string |  |  | Optional config path. Omit to read the whole category. |
| `type` | enum: `default` \| `global` \| `local` |  | `"global"` | Config source: default, global, or project-local. |

### `preferences_set_preferences_config`

Write a Preferences config value; mutates Cocos global/local settings.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `name` | string | ✓ |  | Preferences category or extension/plugin name to modify. |
| `path` | string | ✓ |  | Exact config path to modify. Query first if unsure. |
| `value` | any | ✓ |  | Value to write; must match the target preference field shape. |
| `type` | enum: `default` \| `global` \| `local` |  | `"global"` | Write target. Prefer global or local; avoid default unless intentional. |

### `preferences_get_all_preferences`

Read common Preferences categories; may not include every extension category.

**參數**：無

### `preferences_reset_preferences`

Reset one Preferences category to defaults; all-category reset is unsupported.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `name` | string |  |  | Single preference category to reset. Resetting all categories is not supported. |
| `type` | enum: `global` \| `local` |  | `"global"` | Config scope to reset. Default global. |

### `preferences_export_preferences`

Return readable Preferences as JSON data; does not write a file.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `exportPath` | string |  |  | Label for the returned export path. Current implementation returns JSON data only; it does not write a file. |

### `preferences_import_preferences`

Unsupported Preferences import placeholder; never modifies settings.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `importPath` | string | ✓ |  | Preferences file path to import. Current implementation reports unsupported and does not modify settings. |

---

## 10. server（Server）

MCP server 自身的狀態與環境資訊。

本 category 共 **6** 個工具。

### `server_query_server_ip_list`

Read IPs reported by the Cocos Editor server. No project side effects; use to build client connection URLs.

**參數**：無

### `server_query_sorted_server_ip_list`

Read the Editor server IP list in preferred order. No project side effects.

**參數**：無

### `server_query_server_port`

Read the current Cocos Editor server port. Does not start or stop any server.

**參數**：無

### `server_get_server_status`

Collect Editor server IP/port, MCP port, Cocos version, platform, and Node runtime info. Diagnostics only.

**參數**：無

### `server_check_server_connectivity`

Probe Editor.Message connectivity with server/query-port and a timeout. No project side effects.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `timeout` | number |  | `5000` | Editor server response timeout in milliseconds. Default 5000. |

### `server_get_network_interfaces`

Read OS network interfaces and compare with Editor-reported IPs. Diagnostics only.

**參數**：無

---

## 11. broadcast（廣播）

`Editor.Message` 廣播訊息監聽 / 發送。

本 category 共 **5** 個工具。

### `broadcast_get_broadcast_log`

Read the extension-local broadcast log. No project side effects; filter by messageType to inspect scene/asset-db/build-worker events.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `limit` | number |  | `50` | Maximum recent log entries to return. Default 50. |
| `messageType` | string |  |  | Optional broadcast type filter, e.g. scene:ready or asset-db:asset-change. |

### `broadcast_listen_broadcast`

Add a messageType to the extension-local active listener list. Current path is simulated/logging only, not a guaranteed live Editor broadcast subscription.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `messageType` | string | ✓ |  | Broadcast type to add to the local listener list. Current implementation is simulated/logging only. |

### `broadcast_stop_listening`

Remove a messageType from the extension-local listener list. Does not affect Cocos Editor internals.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `messageType` | string | ✓ |  | Broadcast type to remove from the local listener list. |

### `broadcast_clear_broadcast_log`

Clear the extension-local broadcast log only. Does not modify scene, assets, or Editor state.

**參數**：無

### `broadcast_get_active_listeners`

List extension-local broadcast listener types and counts for diagnostics.

**參數**：無

---

## 12. referenceImage（參考圖）

場景視圖中參考圖的管理（add / remove / list / 透明度等）。

本 category 共 **12** 個工具。

### `referenceImage_add_reference_image`

Add absolute image paths to the reference-image module; does not create assets.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `paths` | array<string> | ✓ |  | Absolute image file paths to add as scene reference images. |

### `referenceImage_remove_reference_image`

Remove specific reference images, or current image when paths are omitted.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `paths` | array<string> |  |  | Reference image paths to remove. Omit/empty removes the current image. |

### `referenceImage_switch_reference_image`

Switch active reference image by absolute path, optionally scoped to scene UUID.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `path` | string | ✓ |  | Absolute reference image path to make current. |
| `sceneUUID` | string |  |  | Optional scene UUID scope for the switch. |

### `referenceImage_set_reference_image_data`

Set one raw reference-image display property: path/x/y/sx/sy/opacity.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `key` | enum: `path` \| `x` \| `y` \| `sx` \| `sy` \| `opacity` | ✓ |  | Reference image property key to set. |
| `value` | any | ✓ |  | Property value: path string, x/y/sx/sy number, or opacity 0-1. |

### `referenceImage_query_reference_image_config`

Read reference-image module configuration.

**參數**：無

### `referenceImage_query_current_reference_image`

Read current reference-image state.

**參數**：無

### `referenceImage_refresh_reference_image`

Refresh reference-image display without changing image data.

**參數**：無

### `referenceImage_set_reference_image_position`

Set current reference image x/y offsets.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `x` | number | ✓ |  | Reference image X offset. |
| `y` | number | ✓ |  | Reference image Y offset. |

### `referenceImage_set_reference_image_scale`

Set current reference image x/y scale.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `sx` | number | ✓ |  | Reference image X scale, 0.1-10. |
| `sy` | number | ✓ |  | Reference image Y scale, 0.1-10. |

### `referenceImage_set_reference_image_opacity`

Set current reference image opacity.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `opacity` | number | ✓ |  | Reference image opacity from 0.0 to 1.0. |

### `referenceImage_list_reference_images`

Read reference-image config plus current image data.

**參數**：無

### `referenceImage_clear_all_reference_images`

Remove reference images from the module; does not delete files/assets.

**參數**：無

---

## 13. assetAdvanced（資源進階）

asset-db 進階：meta 寫入、URL 生成、相依性查詢、批次匯入 / 刪除、未使用資源偵測等。

本 category 共 **11** 個工具。

### `assetAdvanced_save_asset_meta`

Write serialized meta content for an asset URL/UUID; mutates asset metadata.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `urlOrUUID` | string | ✓ |  | Asset db:// URL or UUID whose .meta content should be saved. |
| `content` | string | ✓ |  | Serialized asset meta content string to write. |

### `assetAdvanced_generate_available_url`

Return a collision-free asset URL derived from the requested URL.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `url` | string | ✓ |  | Desired asset db:// URL to test for collision and adjust if needed. |

### `assetAdvanced_query_asset_db_ready`

Check whether asset-db reports ready before batch operations.

**參數**：無

### `assetAdvanced_open_asset_external`

Open an asset through the editor/OS external handler; does not edit content.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `urlOrUUID` | string | ✓ |  | Asset db:// URL or UUID to open with the OS/editor associated external program. |

### `assetAdvanced_batch_import_assets`

Import files from a disk directory into asset-db; mutates project assets.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `sourceDirectory` | string | ✓ |  | Absolute source directory on disk to scan for import files. |
| `targetDirectory` | string | ✓ |  | Target asset-db directory URL, e.g. db://assets/textures. |
| `fileFilter` | array<string> |  | `[]` | Allowed file extensions, e.g. [".png",".jpg"]. Empty means all files. |
| `recursive` | boolean |  | `false` | Include files from subdirectories. |
| `overwrite` | boolean |  | `false` | Overwrite existing target assets instead of auto-renaming. |

### `assetAdvanced_batch_delete_assets`

Delete multiple asset-db URLs; mutates project assets.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `urls` | array<string> | ✓ |  | Asset db:// URLs to delete. Each URL is attempted independently. |

### `assetAdvanced_validate_asset_references`

Lightly scan assets under a directory for broken asset-info references.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `directory` | string |  | `"db://assets"` | Asset-db directory to scan. Default db://assets. |

### `assetAdvanced_get_asset_dependencies`

Unsupported dependency-analysis placeholder; always reports unsupported.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `urlOrUUID` | string | ✓ |  | Asset URL or UUID for dependency analysis. Current implementation reports unsupported. |
| `direction` | enum: `dependents` \| `dependencies` \| `both` |  | `"dependencies"` | Dependency direction requested. Current implementation reports unsupported. |

### `assetAdvanced_get_unused_assets`

Unsupported unused-asset placeholder; always reports unsupported.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `directory` | string |  | `"db://assets"` | Asset-db directory to scan. Current implementation reports unsupported. |
| `excludeDirectories` | array<string> |  | `[]` | Directories to exclude from the requested scan. Current implementation reports unsupported. |

### `assetAdvanced_compress_textures`

Unsupported texture-compression placeholder; always reports unsupported.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `directory` | string |  | `"db://assets"` | Texture directory requested for compression. Current implementation reports unsupported. |
| `format` | enum: `auto` \| `jpg` \| `png` \| `webp` |  | `"auto"` | Requested output format. Current implementation reports unsupported. |
| `quality` | number |  | `0.8` | Requested compression quality from 0.1 to 1.0. Current implementation reports unsupported. |

### `assetAdvanced_export_asset_manifest`

Return asset inventory for a directory as json/csv/xml text; does not write a file.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `directory` | string |  | `"db://assets"` | Asset-db directory to include in the manifest. Default db://assets. |
| `format` | enum: `json` \| `csv` \| `xml` |  | `"json"` | Returned manifest serialization format. |
| `includeMetadata` | boolean |  | `true` | Try to include asset metadata when available. |

---

## 14. validation（驗證）

場景與資源完整性檢查工具，回報缺失或錯誤的 reference。

本 category 共 **3** 個工具。

### `validation_validate_json_params`

Validate and lightly repair a JSON argument string before calling another tool. No Cocos side effects; useful for diagnosing escaping or required-field errors.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `jsonString` | string | ✓ |  | JSON string to parse and lightly repair before a tool call. Handles common escaping, quote, and trailing-comma mistakes. |
| `expectedSchema` | object |  |  | Optional simple JSON schema; checks only basic type and required fields. |

### `validation_safe_string_value`

Escape a raw string for safe use inside JSON arguments. No Cocos side effects; useful for Label text or custom data containing quotes/newlines.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `value` | string | ✓ |  | Raw string that must be embedded safely inside JSON arguments. |

### `validation_format_mcp_request`

Format a complete MCP tools/call request and curl example. Formatting only; does not execute the target tool.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `toolName` | string | ✓ |  | MCP tool name to wrap, e.g. create_node or set_component_property. |
| `arguments` | object | ✓ |  | Arguments object for the target tool. This helper formats only; it does not execute the tool. |

---

## 衍生連結

- [`README.md`](../README.md) — 安裝、啟動、AI client 配置
- [`docs/HANDOFF.md`](HANDOFF.md) — 開發進度、最新修補紀錄
- [`CLAUDE.md`](../CLAUDE.md) — AI session 操作守則與 landmines
