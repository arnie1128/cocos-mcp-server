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

Get current scene information

**參數**：無

### `scene_get_scene_list`

Get all scenes in the project

**參數**：無

### `scene_open_scene`

Open a scene by path

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `scenePath` | string | ✓ |  | The scene file path |

### `scene_save_scene`

Save current scene

**參數**：無

### `scene_create_scene`

Create a new scene asset

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `sceneName` | string | ✓ |  | Name of the new scene |
| `savePath` | string | ✓ |  | Path to save the scene (e.g., db://assets/scenes/NewScene.scene) |
| `template` | enum: `empty` \| `2d-ui` \| `3d-basic` |  | `"empty"` | Built-in scaffolding for the new scene. "empty" (default): bare scene root only — current behavior. "2d-ui": Camera (cc.Camera, ortho projection) + Canvas (cc.UITransform + cc.Canvas with cameraComponent linked, layer UI_2D) so UI nodes render immediately under the UI camera. "3d-basic": Camera (perspective) + DirectionalLight at scene root. ⚠️ Side effect: when template is not "empty" the editor opens the newly created scene to populate it. Save your current scene first if it has unsaved changes. |

### `scene_save_scene_as`

Save scene as new file

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `path` | string | ✓ |  | Target db:// path for the new scene file (e.g. "db://assets/scenes/Copy.scene"). The ".scene" extension is appended if missing. |
| `openAfter` | boolean |  | `true` | Open the newly-saved scene right after the copy. Default true. Pass false to keep the current scene focused. |
| `overwrite` | boolean |  | `false` | Overwrite the target file if it already exists. Default false; with false, a name collision returns an error. |

### `scene_close_scene`

Close current scene

**參數**：無

### `scene_get_scene_hierarchy`

Get the complete hierarchy of current scene

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `includeComponents` | boolean |  | `false` | Include component information |

---

## 2. sceneAdvanced（場景進階）

場景進階查詢與 scene-script 入口：依 asset uuid 反查節點、執行任意 scene-script 方法、批次節點查詢等。

本 category 共 **23** 個工具。

### `sceneAdvanced_reset_node_property`

Reset node property to default value

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `uuid` | string | ✓ |  | Node UUID |
| `path` | string | ✓ |  | Property path (e.g., position, rotation, scale) |

### `sceneAdvanced_move_array_element`

Move array element position

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `uuid` | string | ✓ |  | Node UUID |
| `path` | string | ✓ |  | Array property path (e.g., __comps__) |
| `target` | number | ✓ |  | Target item original index |
| `offset` | number | ✓ |  | Offset amount (positive or negative) |

### `sceneAdvanced_remove_array_element`

Remove array element at specific index

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `uuid` | string | ✓ |  | Node UUID |
| `path` | string | ✓ |  | Array property path |
| `index` | number | ✓ |  | Target item index to remove |

### `sceneAdvanced_copy_node`

Copy node for later paste operation

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `uuids` | string \| array<string> | ✓ |  | Node UUID or array of UUIDs to copy |

### `sceneAdvanced_paste_node`

Paste previously copied nodes

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `target` | string | ✓ |  | Target parent node UUID |
| `uuids` | string \| array<string> | ✓ |  | Node UUIDs to paste |
| `keepWorldTransform` | boolean |  | `false` | Keep world transform coordinates |

### `sceneAdvanced_cut_node`

Cut node (copy + mark for move)

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `uuids` | string \| array<string> | ✓ |  | Node UUID or array of UUIDs to cut |

### `sceneAdvanced_reset_node_transform`

Reset node position, rotation and scale

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `uuid` | string | ✓ |  | Node UUID |

### `sceneAdvanced_reset_component`

Reset component to default values

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `uuid` | string | ✓ |  | Component UUID |

### `sceneAdvanced_restore_prefab`

Restore prefab instance from asset

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `nodeUuid` | string | ✓ |  | Node UUID |
| `assetUuid` | string | ✓ |  | Prefab asset UUID |

### `sceneAdvanced_execute_component_method`

Execute method on component

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `uuid` | string | ✓ |  | Component UUID |
| `name` | string | ✓ |  | Method name |
| `args` | array<any> |  | `[]` | Method arguments |

### `sceneAdvanced_execute_scene_script`

Execute scene script method

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `name` | string | ✓ |  | Plugin name |
| `method` | string | ✓ |  | Method name |
| `args` | array<any> |  | `[]` | Method arguments |

### `sceneAdvanced_scene_snapshot`

Create scene state snapshot

**參數**：無

### `sceneAdvanced_scene_snapshot_abort`

Abort scene snapshot creation

**參數**：無

### `sceneAdvanced_begin_undo_recording`

Begin recording undo data

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `nodeUuid` | string | ✓ |  | Node UUID to record |

### `sceneAdvanced_end_undo_recording`

End recording undo data

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `undoId` | string | ✓ |  | Undo recording ID from begin_undo_recording |

### `sceneAdvanced_cancel_undo_recording`

Cancel undo recording

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `undoId` | string | ✓ |  | Undo recording ID to cancel |

### `sceneAdvanced_soft_reload_scene`

Soft reload current scene

**參數**：無

### `sceneAdvanced_query_scene_ready`

Check if scene is ready

**參數**：無

### `sceneAdvanced_query_scene_dirty`

Check if scene has unsaved changes

**參數**：無

### `sceneAdvanced_query_scene_classes`

Query all registered classes

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `extends` | string |  |  | Filter classes that extend this base class |

### `sceneAdvanced_query_scene_components`

Query available scene components

**參數**：無

### `sceneAdvanced_query_component_has_script`

Check if component has script

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `className` | string | ✓ |  | Script class name to check |

### `sceneAdvanced_query_nodes_by_asset_uuid`

Find nodes that use specific asset UUID

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `assetUuid` | string | ✓ |  | Asset UUID to search for |

---

## 3. sceneView（場景視圖）

場景視圖控制：gizmo 工具切換、座標系、視圖模式、參考圖等。會影響編輯器面板，不影響 runtime 行為。

本 category 共 **20** 個工具。

### `sceneView_change_gizmo_tool`

Change Gizmo tool

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `name` | enum: `position` \| `rotation` \| `scale` \| `rect` | ✓ |  | Tool name |

### `sceneView_query_gizmo_tool_name`

Get current Gizmo tool name

**參數**：無

### `sceneView_change_gizmo_pivot`

Change transform pivot point

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `name` | enum: `pivot` \| `center` | ✓ |  | Pivot point |

### `sceneView_query_gizmo_pivot`

Get current Gizmo pivot point

**參數**：無

### `sceneView_query_gizmo_view_mode`

Query view mode (view/select)

**參數**：無

### `sceneView_change_gizmo_coordinate`

Change coordinate system

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `type` | enum: `local` \| `global` | ✓ |  | Coordinate system |

### `sceneView_query_gizmo_coordinate`

Get current coordinate system

**參數**：無

### `sceneView_change_view_mode_2d_3d`

Change 2D/3D view mode

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `is2D` | boolean | ✓ |  | 2D/3D view mode (true for 2D, false for 3D) |

### `sceneView_query_view_mode_2d_3d`

Get current view mode

**參數**：無

### `sceneView_set_grid_visible`

Show/hide grid

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `visible` | boolean | ✓ |  | Grid visibility |

### `sceneView_query_grid_visible`

Query grid visibility status

**參數**：無

### `sceneView_set_icon_gizmo_3d`

Set IconGizmo to 3D or 2D mode

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `is3D` | boolean | ✓ |  | 3D/2D IconGizmo (true for 3D, false for 2D) |

### `sceneView_query_icon_gizmo_3d`

Query IconGizmo mode

**參數**：無

### `sceneView_set_icon_gizmo_size`

Set IconGizmo size

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `size` | number | ✓ |  | IconGizmo size |

### `sceneView_query_icon_gizmo_size`

Query IconGizmo size

**參數**：無

### `sceneView_focus_camera_on_nodes`

Focus scene camera on nodes

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `uuids` | array<string> \| null | ✓ |  | Node UUIDs to focus on (null for all) |

### `sceneView_align_camera_with_view`

Apply scene camera position and angle to selected node

**參數**：無

### `sceneView_align_view_with_node`

Apply selected node position and angle to current view

**參數**：無

### `sceneView_get_scene_view_status`

Get comprehensive scene view status

**參數**：無

### `sceneView_reset_scene_view`

Reset scene view to default settings

**參數**：無

---

## 4. node（節點）

節點生命週期：建立、查詢、改名、變換、移動、複製、刪除。`create_node` 支援 `layer` 參數；parent 是 Canvas 後代時自動推 UI_2D。

本 category 共 **11** 個工具。

### `node_create_node`

Create a new node in the scene. Supports creating empty nodes, nodes with components, or instantiating from assets (prefabs, etc.). IMPORTANT: You should always provide parentUuid to specify where to create the node.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `name` | string | ✓ |  | Node name |
| `parentUuid` | string |  |  | Parent node UUID. STRONGLY RECOMMENDED: Always provide this parameter. Use get_current_scene or get_all_nodes to find parent UUIDs. If not provided, node will be created at scene root. |
| `nodeType` | enum: `Node` \| `2DNode` \| `3DNode` |  | `"Node"` | Node type: Node, 2DNode, 3DNode |
| `siblingIndex` | number |  | `-1` | Sibling index for ordering (-1 means append at end) |
| `assetUuid` | string |  |  | Asset UUID to instantiate from (e.g., prefab UUID). When provided, creates a node instance from the asset instead of an empty node. |
| `assetPath` | string |  |  | Asset path to instantiate from (e.g., "db://assets/prefabs/MyPrefab.prefab"). Alternative to assetUuid. |
| `components` | array<string> |  |  | Array of component type names to add to the new node (e.g., ["cc.Sprite", "cc.Button"]) |
| `unlinkPrefab` | boolean |  | `false` | If true and creating from prefab, unlink from prefab to create a regular node |
| `keepWorldTransform` | boolean |  | `false` | Whether to keep world transform when creating the node |
| `layer` | enum: `DEFAULT` \| `UI_2D` \| `UI_3D` \| `SCENE_GIZMO` \| `EDITOR` \| `GIZMOS` \| `IGNORE_RAYCAST` \| `PROFILER` \| integer |  |  | Node layer (cc.Layers). Accepts preset name (e.g. "UI_2D") or raw bitmask number. If omitted: auto-detected — UI_2D when any ancestor has cc.Canvas (so UI camera renders the new node), otherwise leaves the create-node default (DEFAULT). Required for UI nodes under Canvas; without it the node is invisible to the UI camera. |
| `initialTransform` | object{position, rotation, scale} |  |  | Initial transform to apply to the created node |

### `node_get_node_info`

Get node information by UUID

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `uuid` | string | ✓ |  | Node UUID |

### `node_find_nodes`

Find nodes by name pattern

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `pattern` | string | ✓ |  | Name pattern to search |
| `exactMatch` | boolean |  | `false` | Exact match or partial match |

### `node_find_node_by_name`

Find first node by exact name

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `name` | string | ✓ |  | Node name to find |

### `node_get_all_nodes`

Get all nodes in the scene with their UUIDs

**參數**：無

### `node_set_node_property`

Set node property value (prefer using set_node_transform for active/layer/mobility/position/rotation/scale)

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `uuid` | string | ✓ |  | Node UUID |
| `property` | string | ✓ |  | Property name (e.g., active, name, layer) |
| `value` | any | ✓ |  | Property value |

### `node_set_node_transform`

Set node transform properties (position, rotation, scale) with unified interface. Automatically handles 2D/3D node differences.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `uuid` | string | ✓ |  | Node UUID |
| `position` | object{x, y, z} |  |  | Node position. For 2D nodes, only x,y are used; z is ignored. For 3D nodes, all coordinates are used. |
| `rotation` | object{x, y, z} |  |  | Node rotation in euler angles. For 2D nodes, only z rotation is used. For 3D nodes, all axes are used. |
| `scale` | object{x, y, z} |  |  | Node scale. For 2D nodes, z is typically 1. For 3D nodes, all axes are used. |

### `node_delete_node`

Delete a node from scene

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `uuid` | string | ✓ |  | Node UUID to delete |

### `node_move_node`

Move node to new parent

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `nodeUuid` | string | ✓ |  | Node UUID to move |
| `newParentUuid` | string | ✓ |  | New parent node UUID |
| `siblingIndex` | number |  | `-1` | Sibling index in new parent |

### `node_duplicate_node`

Duplicate a node

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `uuid` | string | ✓ |  | Node UUID to duplicate |
| `includeChildren` | boolean |  | `true` | Include children nodes |

### `node_detect_node_type`

Detect if a node is 2D or 3D based on its components and properties

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `uuid` | string | ✓ |  | Node UUID to analyze |

---

## 5. component（組件）

組件 CRUD、property 設定、事件綁定（cc.EventHandler）。`set_component_property` 對 reference 屬性會做 propertyType vs metadata 的 preflight 檢查；提供 `preserveContentSize` 旗標處理 Sprite 指派 spriteFrame 後 contentSize 被覆蓋的問題。

本 category 共 **10** 個工具。

### `component_add_component`

Add a component to a specific node. IMPORTANT: You must provide the nodeUuid parameter to specify which node to add the component to.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `nodeUuid` | string | ✓ |  | Target node UUID. REQUIRED: You must specify the exact node to add the component to. Use get_all_nodes or find_node_by_name to get the UUID of the desired node. |
| `componentType` | string | ✓ |  | Component type (e.g., cc.Sprite, cc.Label, cc.Button) |

### `component_remove_component`

Remove a component from a node. componentType must be the component's classId (cid, i.e. the type field from getComponents), not the script name or class name. Use getComponents to get the correct cid.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `nodeUuid` | string | ✓ |  | Node UUID |
| `componentType` | string | ✓ |  | Component cid (type field from getComponents). Do NOT use script name or class name. Example: "cc.Sprite" or "9b4a7ueT9xD6aRE+AlOusy1" |

### `component_get_components`

Get all components of a node

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `nodeUuid` | string | ✓ |  | Node UUID |

### `component_get_component_info`

Get specific component information

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `nodeUuid` | string | ✓ |  | Node UUID |
| `componentType` | string | ✓ |  | Component type to get info for |

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

Attach a script component to a node

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `nodeUuid` | string | ✓ |  | Node UUID |
| `scriptPath` | string | ✓ |  | Script asset path (e.g., db://assets/scripts/MyScript.ts) |

### `component_get_available_components`

Get list of available component types

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `category` | enum: `all` \| `renderer` \| `ui` \| `physics` \| `animation` \| `audio` |  | `"all"` | Component category filter |

### `component_add_event_handler`

Append a cc.EventHandler entry to a component event array (default: cc.Button.clickEvents). Use this to wire onClick / onCheck / onValueChanged callbacks.

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

Remove an EventHandler entry by index, or by matching targetNodeUuid + handler name.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `nodeUuid` | string | ✓ |  | Node UUID owning the component |
| `componentType` | string |  | `"cc.Button"` | Component class name |
| `eventArrayProperty` | string |  | `"clickEvents"` | EventHandler array property name |
| `index` | integer |  |  | Zero-based index to remove. Takes precedence over targetNodeUuid/handler matching when provided. |
| `targetNodeUuid` | string |  |  | Match handlers whose target node has this UUID |
| `handler` | string |  |  | Match handlers with this method name |

### `component_list_event_handlers`

List EventHandler entries currently bound to a component event array.

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

Get all prefabs in the project

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `folder` | string |  | `"db://assets"` | Folder path to search (optional) |

### `prefab_load_prefab`

Load a prefab by path

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `prefabPath` | string | ✓ |  | Prefab asset path |

### `prefab_instantiate_prefab`

Instantiate a prefab in the scene

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `prefabPath` | string | ✓ |  | Prefab asset path |
| `parentUuid` | string |  |  | Parent node UUID (optional) |
| `position` | object{x, y, z} |  |  | Initial position |

### `prefab_create_prefab`

Create a prefab from a node with all children and components

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `nodeUuid` | string | ✓ |  | Source node UUID |
| `savePath` | string | ✓ |  | Path to save the prefab (e.g., db://assets/prefabs/MyPrefab.prefab) |
| `prefabName` | string | ✓ |  | Prefab name |

### `prefab_update_prefab`

Apply prefab instance edits back to the prefab asset (cce.SceneFacade.applyPrefab)

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `prefabPath` | string | ✓ |  | Prefab asset path |
| `nodeUuid` | string | ✓ |  | Node UUID with changes |

### `prefab_revert_prefab`

Revert prefab instance to original

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `nodeUuid` | string | ✓ |  | Prefab instance node UUID |

### `prefab_get_prefab_info`

Get detailed prefab information

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `prefabPath` | string | ✓ |  | Prefab asset path |

### `prefab_validate_prefab`

Validate a prefab file format

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `prefabPath` | string | ✓ |  | Prefab asset path |

### `prefab_restore_prefab_node`

Restore prefab node using prefab asset (built-in undo record)

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `nodeUuid` | string | ✓ |  | Prefab instance node UUID |
| `assetUuid` | string | ✓ |  | Prefab asset UUID |

### `prefab_set_link`

Attach or detach a prefab link on a node (mode="link" wraps cce.SceneFacade.linkPrefab; mode="unlink" wraps cce.SceneFacade.unlinkPrefab).

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `mode` | enum: `link` \| `unlink` | ✓ |  | Operation: "link" attaches a regular node to a prefab asset; "unlink" detaches a prefab instance. |
| `nodeUuid` | string | ✓ |  | Node UUID. For mode="link", the node to attach; for mode="unlink", the prefab instance to detach. |
| `assetUuid` | string |  |  | Prefab asset UUID. Required when mode="link"; ignored when mode="unlink". |
| `removeNested` | boolean |  | `false` | When mode="unlink", also unlink nested prefab instances under this node. Ignored when mode="link". |

### `prefab_get_prefab_data`

Read the prefab dump for a prefab instance node (cce.SceneFacade.getPrefabData)

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `nodeUuid` | string | ✓ |  | Prefab instance node UUID |

---

## 7. project（專案／資源）

資源管理 + 專案建構：asset CRUD、build / preview server、設定查詢。覆蓋大多數 asset-db 高頻操作。

本 category 共 **24** 個工具。

### `project_run_project`

Run the project in preview mode

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `platform` | enum: `browser` \| `simulator` \| `preview` |  | `"browser"` | Target platform |

### `project_build_project`

Build the project

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `platform` | enum: `web-mobile` \| `web-desktop` \| `ios` \| `android` \| `windows` \| `mac` | ✓ |  | Build platform |
| `debug` | boolean |  | `true` | Debug build |

### `project_get_project_info`

Get project information

**參數**：無

### `project_get_project_settings`

Get project settings

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `category` | enum: `general` \| `physics` \| `render` \| `assets` |  | `"general"` | Settings category |

### `project_refresh_assets`

Refresh asset database

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `folder` | string |  |  | Specific folder to refresh (optional) |

### `project_import_asset`

Import an asset file

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `sourcePath` | string | ✓ |  | Source file path |
| `targetFolder` | string | ✓ |  | Target folder in assets |

### `project_get_asset_info`

Get asset information

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `assetPath` | string | ✓ |  | Asset path (db://assets/...) |

### `project_get_assets`

Get assets by type

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `type` | enum: `all` \| `scene` \| `prefab` \| `script` \| `texture` \| `material` \| `mesh` \| `audio` \| `animation` |  | `"all"` | Asset type filter |
| `folder` | string |  | `"db://assets"` | Folder to search in |

### `project_get_build_settings`

Get build settings - shows current limitations

**參數**：無

### `project_open_build_panel`

Open the build panel in the editor

**參數**：無

### `project_check_builder_status`

Check if builder worker is ready

**參數**：無

### `project_start_preview_server`

Start preview server

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `port` | number |  | `7456` | Preview server port |

### `project_stop_preview_server`

Stop preview server

**參數**：無

### `project_create_asset`

Create a new asset file or folder

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `url` | string | ✓ |  | Asset URL (e.g., db://assets/newfile.json) |
| `content` | string \| null |  |  | File content (null for folder) |
| `overwrite` | boolean |  | `false` | Overwrite existing file |

### `project_copy_asset`

Copy an asset to another location

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `source` | string | ✓ |  | Source asset URL |
| `target` | string | ✓ |  | Target location URL |
| `overwrite` | boolean |  | `false` | Overwrite existing file |

### `project_move_asset`

Move an asset to another location

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `source` | string | ✓ |  | Source asset URL |
| `target` | string | ✓ |  | Target location URL |
| `overwrite` | boolean |  | `false` | Overwrite existing file |

### `project_delete_asset`

Delete an asset

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `url` | string | ✓ |  | Asset URL to delete |

### `project_save_asset`

Save asset content

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `url` | string | ✓ |  | Asset URL |
| `content` | string | ✓ |  | Asset content |

### `project_reimport_asset`

Reimport an asset

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `url` | string | ✓ |  | Asset URL to reimport |

### `project_query_asset_path`

Get asset disk path

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `url` | string | ✓ |  | Asset URL |

### `project_query_asset_uuid`

Get asset UUID from URL

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `url` | string | ✓ |  | Asset URL |

### `project_query_asset_url`

Get asset URL from UUID

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `uuid` | string | ✓ |  | Asset UUID |

### `project_find_asset_by_name`

Find assets by name (supports partial matching and multiple results)

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `name` | string | ✓ |  | Asset name to search for (supports partial matching) |
| `exactMatch` | boolean |  | `false` | Whether to use exact name matching |
| `assetType` | enum: `all` \| `scene` \| `prefab` \| `script` \| `texture` \| `material` \| `mesh` \| `audio` \| `animation` \| `spriteFrame` |  | `"all"` | Filter by asset type |
| `folder` | string |  | `"db://assets"` | Folder to search in |
| `maxResults` | number |  | `20` | Maximum number of results to return |

### `project_get_asset_details`

Get detailed asset information including spriteFrame sub-assets

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `assetPath` | string | ✓ |  | Asset path (db://assets/...) |
| `includeSubAssets` | boolean |  | `true` | Include sub-assets like spriteFrame, texture |

---

## 8. debug（除錯）

console log 與系統資訊：取得 / 清空 console、讀 project log 檔、編輯器資訊。

本 category 共 **9** 個工具。

### `debug_clear_console`

Clear editor console

**參數**：無

### `debug_execute_script`

Execute JavaScript in scene context

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `script` | string | ✓ |  | JavaScript code to execute |

### `debug_get_node_tree`

Get detailed node tree for debugging

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `rootUuid` | string |  |  | Root node UUID (optional, uses scene root if not provided) |
| `maxDepth` | number |  | `10` | Maximum tree depth |

### `debug_get_performance_stats`

Get performance statistics

**參數**：無

### `debug_validate_scene`

Validate current scene for issues

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `checkMissingAssets` | boolean |  | `true` | Check for missing asset references |
| `checkPerformance` | boolean |  | `true` | Check for performance issues |

### `debug_get_editor_info`

Get editor and environment information

**參數**：無

### `debug_get_project_logs`

Get project logs from temp/logs/project.log file

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `lines` | number |  | `100` | Number of lines to read from the end of the log file (default: 100) |
| `filterKeyword` | string |  |  | Filter logs containing specific keyword (optional) |
| `logLevel` | enum: `ERROR` \| `WARN` \| `INFO` \| `DEBUG` \| `TRACE` \| `ALL` |  | `"ALL"` | Filter by log level |

### `debug_get_log_file_info`

Get information about the project log file

**參數**：無

### `debug_search_project_logs`

Search for specific patterns or errors in project logs

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `pattern` | string | ✓ |  | Search pattern (supports regex) |
| `maxResults` | number |  | `20` | Maximum number of matching results |
| `contextLines` | number |  | `2` | Number of context lines to show around each match |

---

## 9. preferences（偏好設定）

編輯器偏好設定的讀寫。

本 category 共 **7** 個工具。

### `preferences_open_preferences_settings`

Open preferences settings panel

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `tab` | enum: `general` \| `external-tools` \| `data-editor` \| `laboratory` \| `extensions` |  |  | Preferences tab to open (optional) |
| `args` | array<any> |  |  | Additional arguments to pass to the tab |

### `preferences_query_preferences_config`

Query preferences configuration

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `name` | string |  | `"general"` | Plugin or category name |
| `path` | string |  |  | Configuration path (optional) |
| `type` | enum: `default` \| `global` \| `local` |  | `"global"` | Configuration type |

### `preferences_set_preferences_config`

Set preferences configuration

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `name` | string | ✓ |  | Plugin name |
| `path` | string | ✓ |  | Configuration path |
| `value` | any | ✓ |  | Configuration value |
| `type` | enum: `default` \| `global` \| `local` |  | `"global"` | Configuration type |

### `preferences_get_all_preferences`

Get all available preferences categories

**參數**：無

### `preferences_reset_preferences`

Reset preferences to default values

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `name` | string |  |  | Specific preference category to reset (optional) |
| `type` | enum: `global` \| `local` |  | `"global"` | Configuration type to reset |

### `preferences_export_preferences`

Export current preferences configuration

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `exportPath` | string |  |  | Path to export preferences file (optional) |

### `preferences_import_preferences`

Import preferences configuration from file

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `importPath` | string | ✓ |  | Path to import preferences file from |

---

## 10. server（Server）

MCP server 自身的狀態與環境資訊。

本 category 共 **6** 個工具。

### `server_query_server_ip_list`

Query server IP list

**參數**：無

### `server_query_sorted_server_ip_list`

Get sorted server IP list

**參數**：無

### `server_query_server_port`

Query editor server current port

**參數**：無

### `server_get_server_status`

Get comprehensive server status information

**參數**：無

### `server_check_server_connectivity`

Check server connectivity and network status

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `timeout` | number |  | `5000` | Timeout in milliseconds |

### `server_get_network_interfaces`

Get available network interfaces

**參數**：無

---

## 11. broadcast（廣播）

`Editor.Message` 廣播訊息監聽 / 發送。

本 category 共 **5** 個工具。

### `broadcast_get_broadcast_log`

Get recent broadcast messages log

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `limit` | number |  | `50` | Number of recent messages to return |
| `messageType` | string |  |  | Filter by message type (optional) |

### `broadcast_listen_broadcast`

Start listening for specific broadcast messages

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `messageType` | string | ✓ |  | Message type to listen for |

### `broadcast_stop_listening`

Stop listening for specific broadcast messages

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `messageType` | string | ✓ |  | Message type to stop listening for |

### `broadcast_clear_broadcast_log`

Clear the broadcast messages log

**參數**：無

### `broadcast_get_active_listeners`

Get list of active broadcast listeners

**參數**：無

---

## 12. referenceImage（參考圖）

場景視圖中參考圖的管理（add / remove / list / 透明度等）。

本 category 共 **12** 個工具。

### `referenceImage_add_reference_image`

Add reference image(s) to scene

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `paths` | array<string> | ✓ |  | Array of reference image absolute paths |

### `referenceImage_remove_reference_image`

Remove reference image(s)

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `paths` | array<string> |  |  | Array of reference image paths to remove (optional, removes current if empty) |

### `referenceImage_switch_reference_image`

Switch to specific reference image

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `path` | string | ✓ |  | Reference image absolute path |
| `sceneUUID` | string |  |  | Specific scene UUID (optional) |

### `referenceImage_set_reference_image_data`

Set reference image transform and display properties

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `key` | enum: `path` \| `x` \| `y` \| `sx` \| `sy` \| `opacity` | ✓ |  | Property key |
| `value` | any | ✓ |  | Property value (path: string, x/y/sx/sy: number, opacity: number 0-1) |

### `referenceImage_query_reference_image_config`

Query reference image configuration

**參數**：無

### `referenceImage_query_current_reference_image`

Query current reference image data

**參數**：無

### `referenceImage_refresh_reference_image`

Refresh reference image display

**參數**：無

### `referenceImage_set_reference_image_position`

Set reference image position

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `x` | number | ✓ |  | X offset |
| `y` | number | ✓ |  | Y offset |

### `referenceImage_set_reference_image_scale`

Set reference image scale

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `sx` | number | ✓ |  | X scale |
| `sy` | number | ✓ |  | Y scale |

### `referenceImage_set_reference_image_opacity`

Set reference image opacity

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `opacity` | number | ✓ |  | Opacity (0.0 to 1.0) |

### `referenceImage_list_reference_images`

List all available reference images

**參數**：無

### `referenceImage_clear_all_reference_images`

Clear all reference images

**參數**：無

---

## 13. assetAdvanced（資源進階）

asset-db 進階：meta 寫入、URL 生成、相依性查詢、批次匯入 / 刪除、未使用資源偵測等。

本 category 共 **11** 個工具。

### `assetAdvanced_save_asset_meta`

Save asset meta information

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `urlOrUUID` | string | ✓ |  | Asset URL or UUID |
| `content` | string | ✓ |  | Asset meta serialized content string |

### `assetAdvanced_generate_available_url`

Generate an available URL based on input URL

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `url` | string | ✓ |  | Asset URL to generate available URL for |

### `assetAdvanced_query_asset_db_ready`

Check if asset database is ready

**參數**：無

### `assetAdvanced_open_asset_external`

Open asset with external program

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `urlOrUUID` | string | ✓ |  | Asset URL or UUID to open |

### `assetAdvanced_batch_import_assets`

Import multiple assets in batch

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `sourceDirectory` | string | ✓ |  | Source directory path |
| `targetDirectory` | string | ✓ |  | Target directory URL |
| `fileFilter` | array<string> |  | `[]` | File extensions to include (e.g., [".png", ".jpg"]) |
| `recursive` | boolean |  | `false` | Include subdirectories |
| `overwrite` | boolean |  | `false` | Overwrite existing files |

### `assetAdvanced_batch_delete_assets`

Delete multiple assets in batch

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `urls` | array<string> | ✓ |  | Array of asset URLs to delete |

### `assetAdvanced_validate_asset_references`

Validate asset references and find broken links

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `directory` | string |  | `"db://assets"` | Directory to validate (default: entire project) |

### `assetAdvanced_get_asset_dependencies`

Get asset dependency tree

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `urlOrUUID` | string | ✓ |  | Asset URL or UUID |
| `direction` | enum: `dependents` \| `dependencies` \| `both` |  | `"dependencies"` | Dependency direction |

### `assetAdvanced_get_unused_assets`

Find unused assets in project

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `directory` | string |  | `"db://assets"` | Directory to scan (default: entire project) |
| `excludeDirectories` | array<string> |  | `[]` | Directories to exclude from scan |

### `assetAdvanced_compress_textures`

Batch compress texture assets

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `directory` | string |  | `"db://assets"` | Directory containing textures |
| `format` | enum: `auto` \| `jpg` \| `png` \| `webp` |  | `"auto"` | Compression format |
| `quality` | number |  | `0.8` | Compression quality (0.1-1.0) |

### `assetAdvanced_export_asset_manifest`

Export asset manifest/inventory

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `directory` | string |  | `"db://assets"` | Directory to export manifest for |
| `format` | enum: `json` \| `csv` \| `xml` |  | `"json"` | Export format |
| `includeMetadata` | boolean |  | `true` | Include asset metadata |

---

## 14. validation（驗證）

場景與資源完整性檢查工具，回報缺失或錯誤的 reference。

本 category 共 **3** 個工具。

### `validation_validate_json_params`

Validate and fix JSON parameters before sending to other tools

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `jsonString` | string | ✓ |  | JSON string to validate and fix |
| `expectedSchema` | object |  |  | Expected parameter schema (optional) |

### `validation_safe_string_value`

Create a safe string value that won't cause JSON parsing issues

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `value` | string | ✓ |  | String value to make safe |

### `validation_format_mcp_request`

Format a complete MCP request with proper JSON escaping

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `toolName` | string | ✓ |  | Tool name to call |
| `arguments` | object | ✓ |  | Tool arguments |

---

## 衍生連結

- [`README.md`](../README.md) — 安裝、啟動、AI client 配置
- [`docs/HANDOFF.md`](HANDOFF.md) — 開發進度、最新修補紀錄
- [`CLAUDE.md`](../CLAUDE.md) — AI session 操作守則與 landmines
