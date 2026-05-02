# MCP 工具參考

> ⚙️ **本檔由 `scripts/generate-tools-doc.js` 自動產生**，請勿手動編輯。
> 工具增減或 schema 變動後，跑 `node scripts/generate-tools-doc.js`
> 重新生成。手寫的章節介紹（category 描述、總覽段）放在 generator 內。

Cocos MCP Server 透過 [Model Context Protocol](https://modelcontextprotocol.io/) 對外暴露
**181 tools across 18 categories**（181 個工具，分 18 個 category）。
每個工具的 input schema 由 zod 在 `source/tools/&lt;category&gt;-tools.ts` 內定義，
經過 `lib/schema.ts:toInputSchema` 轉成 JSON Schema 後送出 `tools/list`。
Tool description 來自 zod `.describe()` 文字；title 來自 `annotations.title`，缺少時由工具名稱自動轉成人類可讀文字。

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

## Category 總覽

| Category | 工具數 | 涵蓋 |
|---|---:|---|
| [`scene`](#scene) | 8 | 場景檔案層級操作：開／關／儲存／新建／另存。`create_scene` 支援 `template` 參數可一次寫入 2D 或 3D 範本。 |
| [`node`](#node) | 12 | 節點生命週期：建立、查詢、改名、變換、移動、複製、刪除。`create_node` 支援 `layer` 參數；parent 是 Canvas 後代時自動推… |
| [`component`](#component) | 11 | 組件 CRUD、property 設定、事件綁定（cc.EventHandler）。`set_component_property` 對 reference… |
| [`prefab`](#prefab) | 11 | Prefab façade 工具集：建立、實例化、apply、link/unlink、get-data、restore。除了 `restore_prefab… |
| [`project`](#project) | 24 | 資源管理 + 專案建構：asset CRUD、build / preview server、設定查詢。覆蓋大多數 asset-db 高頻操作。 |
| [`debug`](#debug) | 26 | console log、截圖、preview 與系統資訊：取得 / 清空 console、讀 project log 檔、編輯器資訊。 |
| [`preferences`](#preferences) | 7 | 編輯器偏好設定的讀寫。 |
| [`server`](#server) | 6 | MCP server 自身的狀態與環境資訊。 |
| [`broadcast`](#broadcast) | 5 | `Editor.Message` 廣播訊息監聽 / 發送。 |
| [`sceneAdvanced`](#sceneadvanced) | 23 | 場景進階查詢與 scene-script 入口：依 asset uuid 反查節點、執行任意 scene-script 方法、批次節點查詢等。 |
| [`sceneView`](#sceneview) | 20 | 場景視圖控制：gizmo 工具切換、座標系、視圖模式、參考圖等。會影響編輯器面板，不影響 runtime 行為。 |
| [`referenceImage`](#referenceimage) | 1 | 場景視圖中參考圖的管理（add / remove / list / 透明度等）。 |
| [`assetAdvanced`](#assetadvanced) | 11 | asset-db 進階：meta 寫入、URL 生成、相依性查詢、批次匯入 / 刪除、未使用資源偵測等。 |
| [`validation`](#validation) | 3 | 場景與資源完整性檢查工具，回報缺失或錯誤的 reference。 |
| [`inspector`](#inspector) | 2 | Inspector 面板與選取狀態查詢，用於讀取目前編輯器 UI context。 |
| [`assetMeta`](#assetmeta) | 3 | 資源 meta 查詢與設定工具，處理 importer / uuid / meta 層級資訊。 |
| [`animation`](#animation) | 4 | 動畫 clip、track、keyframe 與 animation component 的建立、查詢和修改。 |
| [`fileEditor`](#fileeditor) | 4 | 專案檔案讀寫與搜尋工具，適合檢查或小範圍修改腳本與文字資源。 |

## 工具總覽

| Category | Tool | title | summary |
|---|---|---|---|
| `scene` | [`scene_get_current_scene`](#scene_get_current_scene) | Get current scene | Read the currently open scene root summary (name/uuid/type/active/nodeCount). |
| `scene` | [`scene_get_scene_list`](#scene_get_scene_list) | Get scene list | List .scene assets under db://assets with name/path/uuid. |
| `scene` | [`scene_open_scene`](#scene_open_scene) | Open scene | Open a scene by db:// path. |
| `scene` | [`scene_save_scene`](#scene_save_scene) | Save scene | Save the currently open scene back to its scene asset. |
| `scene` | [`scene_create_scene`](#scene_create_scene) | Create scene | Create a new .scene asset. |
| `scene` | [`scene_save_scene_as`](#scene_save_scene_as) | Save scene as | Copy the currently open scene to a new .scene asset. |
| `scene` | [`scene_close_scene`](#scene_close_scene) | Close scene | Close the current scene. |
| `scene` | [`scene_get_scene_hierarchy`](#scene_get_scene_hierarchy) | Get scene hierarchy | Read the complete current scene node hierarchy. |
| `node` | [`node_create_node`](#node_create_node) | Create node | Create a node in current scene; supports empty, components, or prefab/asset instance. |
| `node` | [`node_get_node_info`](#node_get_node_info) | Get node info | Read one node by UUID, including transform, children, and component summary. |
| `node` | [`node_find_nodes`](#node_find_nodes) | Find nodes | Search current-scene nodes by name pattern and return multiple matches. |
| `node` | [`node_find_node_by_name`](#node_find_node_by_name) | Find node by name | Find the first node with an exact name. |
| `node` | [`node_get_all_nodes`](#node_get_all_nodes) | Get all nodes | List all current-scene nodes with name/uuid/type/path; primary source for nodeUuid/parentUuid. |
| `node` | [`node_set_node_property`](#node_set_node_property) | Set node property | Write a node property path. |
| `node` | [`node_set_node_transform`](#node_set_node_transform) | Set node transform | Write position/rotation/scale with 2D/3D normalization; mutates scene. |
| `node` | [`node_delete_node`](#node_delete_node) | Delete node | Delete a node from the current scene. |
| `node` | [`node_move_node`](#node_move_node) | Move node | Reparent a node under a new parent. |
| `node` | [`node_duplicate_node`](#node_duplicate_node) | Duplicate node | Duplicate a node and return the new UUID. |
| `node` | [`node_detect_node_type`](#node_detect_node_type) | Detect node type | Heuristically classify a node as 2D or 3D from components/transform. |
| `node` | [`node_set_node_properties`](#node_set_node_properties) | Set node properties | Batch-write multiple node properties on the same node in one tool call. |
| `component` | [`component_add_component`](#component_add_component) | Add component | Add a component to a specific node. |
| `component` | [`component_remove_component`](#component_remove_component) | Remove component | Remove a component from a node. |
| `component` | [`component_get_components`](#component_get_components) | Get components | List all components on a node with type/cid and basic properties. |
| `component` | [`component_get_component_info`](#component_get_component_info) | Get component info | Read detailed data for one component on a node. |
| `component` | [`component_set_component_property`](#component_set_component_property) | Set component property | Set component property values for UI components or custom script components. |
| `component` | [`component_attach_script`](#component_attach_script) | Attach script | Attach a script asset as a component to a node. |
| `component` | [`component_get_available_components`](#component_get_available_components) | Get available components | Return a curated built-in component type list by category. |
| `component` | [`component_add_event_handler`](#component_add_event_handler) | Add event handler | Append a cc.EventHandler to a component event array and nudge the editor model for persistence. |
| `component` | [`component_remove_event_handler`](#component_remove_event_handler) | Remove event handler | Remove EventHandler entries by index or targetNodeUuid+handler match, then nudge the editor model for persistence. |
| `component` | [`component_list_event_handlers`](#component_list_event_handlers) | List event handlers | List EventHandler entries currently bound to a component event array. |
| `component` | [`component_set_component_properties`](#component_set_component_properties) | Set component properties | Batch-set multiple component properties on the same component in one tool call. |
| `prefab` | [`prefab_get_prefab_list`](#prefab_get_prefab_list) | Get prefab list | List .prefab assets under a folder with name/path/uuid. |
| `prefab` | [`prefab_load_prefab`](#prefab_load_prefab) | Load prefab | Read prefab asset metadata only. |
| `prefab` | [`prefab_instantiate_prefab`](#prefab_instantiate_prefab) | Instantiate prefab | Instantiate a prefab into the current scene; mutates scene and preserves prefab link. |
| `prefab` | [`prefab_create_prefab`](#prefab_create_prefab) | Create prefab | Create a prefab asset from a scene node via cce.Prefab.createPrefab facade. |
| `prefab` | [`prefab_update_prefab`](#prefab_update_prefab) | Update prefab | Apply prefab instance edits back to its linked prefab asset; prefabPath is context only. |
| `prefab` | [`prefab_revert_prefab`](#prefab_revert_prefab) | Revert prefab | Restore a prefab instance from its linked asset; discards unapplied overrides. |
| `prefab` | [`prefab_get_prefab_info`](#prefab_get_prefab_info) | Get prefab info | Read prefab meta/dependency summary before apply/revert. |
| `prefab` | [`prefab_validate_prefab`](#prefab_validate_prefab) | Validate prefab | Run basic prefab JSON structural checks; not byte-level Cocos equivalence. |
| `prefab` | [`prefab_restore_prefab_node`](#prefab_restore_prefab_node) | Restore prefab node | Restore a prefab instance through scene/restore-prefab; assetUuid is context only. |
| `prefab` | [`prefab_set_link`](#prefab_set_link) | Set link | Attach or detach a prefab link on a node (mode="link" wraps cce.SceneFacade.linkPrefab; mode="unlink" wraps cce.SceneFacade.unlinkPrefab). |
| `prefab` | [`prefab_get_prefab_data`](#prefab_get_prefab_data) | Get prefab data | Read facade prefab dump for a prefab instance node. |
| `project` | [`project_run_project`](#project_run_project) | Run project | Open Build panel as preview fallback; does not launch preview automatically. |
| `project` | [`project_build_project`](#project_build_project) | Build project | Open Build panel for the requested platform; does not start the build. |
| `project` | [`project_get_project_info`](#project_get_project_info) | Get project info | Read project name/path/uuid/version/Cocos version and config. |
| `project` | [`project_get_project_settings`](#project_get_project_settings) | Get project settings | Read one project settings category via project/query-config. |
| `project` | [`project_refresh_assets`](#project_refresh_assets) | Refresh assets | Refresh asset-db for a folder; affects Editor asset state, not file content. |
| `project` | [`project_import_asset`](#project_import_asset) | Import asset | Import one disk file into asset-db; mutates project assets. |
| `project` | [`project_get_asset_info`](#project_get_asset_info) | Get asset info | Read basic metadata for one db:// asset path. |
| `project` | [`project_get_assets`](#project_get_assets) | Get assets | List assets under a folder using type-specific filename patterns. |
| `project` | [`project_get_build_settings`](#project_get_build_settings) | Get build settings | Report builder readiness and MCP build limitations. |
| `project` | [`project_open_build_panel`](#project_open_build_panel) | Open build panel | Open the Cocos Build panel; does not start a build. |
| `project` | [`project_check_builder_status`](#project_check_builder_status) | Check builder status | Check whether the builder worker is ready. |
| `project` | [`project_start_preview_server`](#project_start_preview_server) | Start preview server | Unsupported preview-server placeholder; use Editor UI. |
| `project` | [`project_stop_preview_server`](#project_stop_preview_server) | Stop preview server | Unsupported preview-server placeholder; use Editor UI. |
| `project` | [`project_create_asset`](#project_create_asset) | Create asset | Create an asset file or folder through asset-db; null content creates folder. |
| `project` | [`project_copy_asset`](#project_copy_asset) | Copy asset | Copy an asset through asset-db; mutates project assets. |
| `project` | [`project_move_asset`](#project_move_asset) | Move asset | Move/rename an asset through asset-db; mutates project assets. |
| `project` | [`project_delete_asset`](#project_delete_asset) | Delete asset | Delete one asset-db URL; mutates project assets. |
| `project` | [`project_save_asset`](#project_save_asset) | Save asset | Write serialized content to an asset URL; use only for known-good formats. |
| `project` | [`project_reimport_asset`](#project_reimport_asset) | Reimport asset | Ask asset-db to reimport an asset; updates imported asset state/cache. |
| `project` | [`project_query_asset_path`](#project_query_asset_path) | Query asset path | Resolve an asset db:// URL to disk path. |
| `project` | [`project_query_asset_uuid`](#project_query_asset_uuid) | Query asset uuid | Resolve an asset db:// URL to UUID. |
| `project` | [`project_query_asset_url`](#project_query_asset_url) | Query asset url | Resolve an asset UUID to db:// URL. |
| `project` | [`project_find_asset_by_name`](#project_find_asset_by_name) | Find asset by name | Search assets by name with exact/type/folder filters; use to discover UUIDs/paths. |
| `project` | [`project_get_asset_details`](#project_get_asset_details) | Get asset details | Read asset info plus known image sub-assets such as spriteFrame/texture UUIDs. |
| `debug` | [`debug_clear_console`](#debug_clear_console) | Clear console | Clear the Cocos Editor Console UI. |
| `debug` | [`debug_execute_javascript`](#debug_execute_javascript) | Execute javascript | [primary] Execute JavaScript in scene or editor context. |
| `debug` | [`debug_execute_script`](#debug_execute_script) | Execute script | [compat] Scene-only JavaScript eval. |
| `debug` | [`debug_get_node_tree`](#debug_get_node_tree) | Get node tree | Read a debug node tree from a root or scene root for hierarchy/component inspection. |
| `debug` | [`debug_get_performance_stats`](#debug_get_performance_stats) | Get performance stats | Try to read scene query-performance stats; may return unavailable in edit mode. |
| `debug` | [`debug_validate_scene`](#debug_validate_scene) | Validate scene | Run basic current-scene health checks for missing assets and node-count warnings. |
| `debug` | [`debug_get_editor_info`](#debug_get_editor_info) | Get editor info | Read Editor/Cocos/project/process information and memory summary. |
| `debug` | [`debug_get_project_logs`](#debug_get_project_logs) | Get project logs | Read temp/logs/project.log tail with optional level/keyword filters. |
| `debug` | [`debug_get_log_file_info`](#debug_get_log_file_info) | Get log file info | Read temp/logs/project.log path, size, line count, and timestamps. |
| `debug` | [`debug_search_project_logs`](#debug_search_project_logs) | Search project logs | Search temp/logs/project.log for string/regex and return line context. |
| `debug` | [`debug_screenshot`](#debug_screenshot) | Screenshot | Capture the focused Cocos Editor window (or a window matched by title) to a PNG. |
| `debug` | [`debug_capture_preview_screenshot`](#debug_capture_preview_screenshot) | Capture preview screenshot | Capture the cocos Preview-in-Editor (PIE) gameview to a PNG. |
| `debug` | [`debug_get_preview_mode`](#debug_get_preview_mode) | Get preview mode | Read the cocos preview configuration via Editor.Message preferences/query-config so AI can route debug_capture_preview_screenshot to the correct mode. |
| `debug` | [`debug_set_preview_mode`](#debug_set_preview_mode) | Set preview mode | ❌ NOT SUPPORTED on cocos 3.8.7+ (landmine #17). |
| `debug` | [`debug_batch_screenshot`](#debug_batch_screenshot) | Batch screenshot | Capture multiple PNGs of the editor window with optional delays between shots. |
| `debug` | [`debug_wait_compile`](#debug_wait_compile) | Wait compile | Block until cocos finishes its TypeScript compile pass. |
| `debug` | [`debug_run_script_diagnostics`](#debug_run_script_diagnostics) | Run script diagnostics | Run `tsc --noEmit` against the project tsconfig and return parsed diagnostics. |
| `debug` | [`debug_preview_url`](#debug_preview_url) | Preview url | Resolve the cocos browser-preview URL (e.g. |
| `debug` | [`debug_query_devices`](#debug_query_devices) | Query devices | List preview devices configured in the cocos project (cc.IDeviceItem entries). |
| `debug` | [`debug_game_command`](#debug_game_command) | Game command | Send a runtime command to a GameDebugClient running inside a cocos preview/build (browser, Preview-in-Editor, or any device that fetches /game/command). |
| `debug` | [`debug_record_start`](#debug_record_start) | Record start | Start recording the running game canvas via the GameDebugClient (browser/PIE preview only). |
| `debug` | [`debug_record_stop`](#debug_record_stop) | Record stop | Stop the in-progress game canvas recording and persist the result to &lt;project&gt;/temp/mcp-captures/recording-&lt;timestamp&gt;.{webm\|mp4}. |
| `debug` | [`debug_game_client_status`](#debug_game_client_status) | Game client status | Read GameDebugClient connection status: connected (polled within 2s), last poll timestamp, whether a command is queued. |
| `debug` | [`debug_check_editor_health`](#debug_check_editor_health) | Check editor health | Probe whether the cocos editor scene-script renderer is responsive. |
| `debug` | [`debug_preview_control`](#debug_preview_control) | Preview control | ⚠ PARKED — start FREEZES cocos 3.8.7 (landmine #16). |
| `debug` | [`debug_get_script_diagnostic_context`](#debug_get_script_diagnostic_context) | Get script diagnostic context | Read a window of source lines around a diagnostic location so AI can read the offending code without a separate file read. |
| `preferences` | [`preferences_open_preferences_settings`](#preferences_open_preferences_settings) | Open preferences settings | Open Cocos Preferences UI, optionally on a tab; UI side effect only. |
| `preferences` | [`preferences_query_preferences_config`](#preferences_query_preferences_config) | Query preferences config | Read a Preferences config category/path/type; query before setting values. |
| `preferences` | [`preferences_set_preferences_config`](#preferences_set_preferences_config) | Set preferences config | Write a Preferences config value; mutates Cocos global/local settings. |
| `preferences` | [`preferences_get_all_preferences`](#preferences_get_all_preferences) | Get all preferences | Read common Preferences categories; may not include every extension category. |
| `preferences` | [`preferences_reset_preferences`](#preferences_reset_preferences) | Reset preferences | Reset one Preferences category to defaults; all-category reset is unsupported. |
| `preferences` | [`preferences_export_preferences`](#preferences_export_preferences) | Export preferences | Return readable Preferences as JSON data; does not write a file. |
| `preferences` | [`preferences_import_preferences`](#preferences_import_preferences) | Import preferences | Unsupported Preferences import placeholder; never modifies settings. |
| `server` | [`server_query_server_ip_list`](#server_query_server_ip_list) | Query server ip list | Read IPs reported by the Cocos Editor server. |
| `server` | [`server_query_sorted_server_ip_list`](#server_query_sorted_server_ip_list) | Query sorted server ip list | Read the Editor server IP list in preferred order. |
| `server` | [`server_query_server_port`](#server_query_server_port) | Query server port | Read the current Cocos Editor server port. |
| `server` | [`server_get_server_status`](#server_get_server_status) | Get server status | Collect Editor server IP/port, MCP port, Cocos version, platform, and Node runtime info. |
| `server` | [`server_check_server_connectivity`](#server_check_server_connectivity) | Check server connectivity | Probe Editor.Message connectivity with server/query-port and a timeout. |
| `server` | [`server_get_network_interfaces`](#server_get_network_interfaces) | Get network interfaces | Read OS network interfaces and compare with Editor-reported IPs. |
| `broadcast` | [`broadcast_get_broadcast_log`](#broadcast_get_broadcast_log) | Get broadcast log | Read the extension-local broadcast log. |
| `broadcast` | [`broadcast_listen_broadcast`](#broadcast_listen_broadcast) | Listen broadcast | Add a messageType to the extension-local active listener list. |
| `broadcast` | [`broadcast_stop_listening`](#broadcast_stop_listening) | Stop listening | Remove a messageType from the extension-local listener list. |
| `broadcast` | [`broadcast_clear_broadcast_log`](#broadcast_clear_broadcast_log) | Clear broadcast log | Clear the extension-local broadcast log only. |
| `broadcast` | [`broadcast_get_active_listeners`](#broadcast_get_active_listeners) | Get active listeners | List extension-local broadcast listener types and counts for diagnostics. |
| `sceneAdvanced` | [`sceneAdvanced_reset_node_property`](#sceneadvanced_reset_node_property) | Reset node property | Reset one node property to Cocos default; mutates scene. |
| `sceneAdvanced` | [`sceneAdvanced_move_array_element`](#sceneadvanced_move_array_element) | Move array element | Move an item in a node array property such as __comps__; mutates scene. |
| `sceneAdvanced` | [`sceneAdvanced_remove_array_element`](#sceneadvanced_remove_array_element) | Remove array element | Remove an item from a node array property by index; mutates scene. |
| `sceneAdvanced` | [`sceneAdvanced_copy_node`](#sceneadvanced_copy_node) | Copy node | Copy nodes through the Cocos scene clipboard channel. |
| `sceneAdvanced` | [`sceneAdvanced_paste_node`](#sceneadvanced_paste_node) | Paste node | Paste copied nodes under a target parent; mutates scene and returns new UUIDs. |
| `sceneAdvanced` | [`sceneAdvanced_cut_node`](#sceneadvanced_cut_node) | Cut node | Cut nodes through the Cocos scene channel; clipboard/scene side effects. |
| `sceneAdvanced` | [`sceneAdvanced_reset_node_transform`](#sceneadvanced_reset_node_transform) | Reset node transform | Reset node transform to Cocos defaults; mutates scene. |
| `sceneAdvanced` | [`sceneAdvanced_reset_component`](#sceneadvanced_reset_component) | Reset component | Reset a component by component UUID; mutates scene. |
| `sceneAdvanced` | [`sceneAdvanced_restore_prefab`](#sceneadvanced_restore_prefab) | Restore prefab | Restore a prefab instance through scene/restore-prefab; mutates scene. |
| `sceneAdvanced` | [`sceneAdvanced_execute_component_method`](#sceneadvanced_execute_component_method) | Execute component method | Execute an editor-exposed component method; side effects depend on method. |
| `sceneAdvanced` | [`sceneAdvanced_execute_scene_script`](#sceneadvanced_execute_scene_script) | Execute scene script | Execute a scene script method; low-level escape hatch that can mutate scene. |
| `sceneAdvanced` | [`sceneAdvanced_scene_snapshot`](#sceneadvanced_scene_snapshot) | Scene snapshot | Create a Cocos scene snapshot for undo/change tracking. |
| `sceneAdvanced` | [`sceneAdvanced_scene_snapshot_abort`](#sceneadvanced_scene_snapshot_abort) | Scene snapshot abort | Abort the current Cocos scene snapshot. |
| `sceneAdvanced` | [`sceneAdvanced_begin_undo_recording`](#sceneadvanced_begin_undo_recording) | Begin undo recording | Begin undo recording for a node and return undoId. |
| `sceneAdvanced` | [`sceneAdvanced_end_undo_recording`](#sceneadvanced_end_undo_recording) | End undo recording | Commit a previously started undo recording. |
| `sceneAdvanced` | [`sceneAdvanced_cancel_undo_recording`](#sceneadvanced_cancel_undo_recording) | Cancel undo recording | Cancel a previously started undo recording. |
| `sceneAdvanced` | [`sceneAdvanced_soft_reload_scene`](#sceneadvanced_soft_reload_scene) | Soft reload scene | Soft reload the current scene; Editor state side effect. |
| `sceneAdvanced` | [`sceneAdvanced_query_scene_ready`](#sceneadvanced_query_scene_ready) | Query scene ready | Check whether the scene module reports ready. |
| `sceneAdvanced` | [`sceneAdvanced_query_scene_dirty`](#sceneadvanced_query_scene_dirty) | Query scene dirty | Check whether the current scene has unsaved changes. |
| `sceneAdvanced` | [`sceneAdvanced_query_scene_classes`](#sceneadvanced_query_scene_classes) | Query scene classes | List registered scene classes, optionally filtered by base class. |
| `sceneAdvanced` | [`sceneAdvanced_query_scene_components`](#sceneadvanced_query_scene_components) | Query scene components | List available scene component definitions from Cocos. |
| `sceneAdvanced` | [`sceneAdvanced_query_component_has_script`](#sceneadvanced_query_component_has_script) | Query component has script | Check whether a component class has an associated script. |
| `sceneAdvanced` | [`sceneAdvanced_query_nodes_by_asset_uuid`](#sceneadvanced_query_nodes_by_asset_uuid) | Query nodes by asset uuid | Find current-scene nodes that reference an asset UUID. |
| `sceneView` | [`sceneView_change_gizmo_tool`](#sceneview_change_gizmo_tool) | Change gizmo tool | Change active scene view gizmo tool; UI side effect only. |
| `sceneView` | [`sceneView_query_gizmo_tool_name`](#sceneview_query_gizmo_tool_name) | Query gizmo tool name | Read active scene view gizmo tool. |
| `sceneView` | [`sceneView_change_gizmo_pivot`](#sceneview_change_gizmo_pivot) | Change gizmo pivot | Change scene view transform pivot mode; UI side effect only. |
| `sceneView` | [`sceneView_query_gizmo_pivot`](#sceneview_query_gizmo_pivot) | Query gizmo pivot | Read current scene view pivot mode. |
| `sceneView` | [`sceneView_query_gizmo_view_mode`](#sceneview_query_gizmo_view_mode) | Query gizmo view mode | Read current scene view/select mode. |
| `sceneView` | [`sceneView_change_gizmo_coordinate`](#sceneview_change_gizmo_coordinate) | Change gizmo coordinate | Change scene view coordinate system to local/global; UI side effect only. |
| `sceneView` | [`sceneView_query_gizmo_coordinate`](#sceneview_query_gizmo_coordinate) | Query gizmo coordinate | Read current scene view coordinate system. |
| `sceneView` | [`sceneView_change_view_mode_2d_3d`](#sceneview_change_view_mode_2d_3d) | Change view mode 2d 3d | Switch scene view between 2D and 3D; UI side effect only. |
| `sceneView` | [`sceneView_query_view_mode_2d_3d`](#sceneview_query_view_mode_2d_3d) | Query view mode 2d 3d | Read whether scene view is in 2D or 3D mode. |
| `sceneView` | [`sceneView_set_grid_visible`](#sceneview_set_grid_visible) | Set grid visible | Show or hide scene view grid; UI side effect only. |
| `sceneView` | [`sceneView_query_grid_visible`](#sceneview_query_grid_visible) | Query grid visible | Read scene view grid visibility. |
| `sceneView` | [`sceneView_set_icon_gizmo_3d`](#sceneview_set_icon_gizmo_3d) | Set icon gizmo 3d | Switch IconGizmo between 3D and 2D mode; UI side effect only. |
| `sceneView` | [`sceneView_query_icon_gizmo_3d`](#sceneview_query_icon_gizmo_3d) | Query icon gizmo 3d | Read current IconGizmo 3D/2D mode. |
| `sceneView` | [`sceneView_set_icon_gizmo_size`](#sceneview_set_icon_gizmo_size) | Set icon gizmo size | Set IconGizmo display size; UI side effect only. |
| `sceneView` | [`sceneView_query_icon_gizmo_size`](#sceneview_query_icon_gizmo_size) | Query icon gizmo size | Read current IconGizmo display size. |
| `sceneView` | [`sceneView_focus_camera_on_nodes`](#sceneview_focus_camera_on_nodes) | Focus camera on nodes | Focus scene view camera on nodes or all nodes; camera UI side effect only. |
| `sceneView` | [`sceneView_align_camera_with_view`](#sceneview_align_camera_with_view) | Align camera with view | Apply scene view camera transform to selected camera/node; may mutate selection. |
| `sceneView` | [`sceneView_align_view_with_node`](#sceneview_align_view_with_node) | Align view with node | Align scene view to selected node; camera UI side effect only. |
| `sceneView` | [`sceneView_get_scene_view_status`](#sceneview_get_scene_view_status) | Get scene view status | Read combined scene view status snapshot. |
| `sceneView` | [`sceneView_reset_scene_view`](#sceneview_reset_scene_view) | Reset scene view | Reset scene view UI settings to defaults; UI side effects only. |
| `referenceImage` | [`referenceImage_manage`](#referenceimage_manage) | Manage | Reference-image module operations (cocos editor scene reference images). |
| `assetAdvanced` | [`assetAdvanced_save_asset_meta`](#assetadvanced_save_asset_meta) | Save asset meta | Write serialized meta content for an asset URL/UUID; mutates asset metadata. |
| `assetAdvanced` | [`assetAdvanced_generate_available_url`](#assetadvanced_generate_available_url) | Generate available url | Return a collision-free asset URL derived from the requested URL. |
| `assetAdvanced` | [`assetAdvanced_query_asset_db_ready`](#assetadvanced_query_asset_db_ready) | Query asset db ready | Check whether asset-db reports ready before batch operations. |
| `assetAdvanced` | [`assetAdvanced_open_asset_external`](#assetadvanced_open_asset_external) | Open asset external | Open an asset through the editor/OS external handler; does not edit content. |
| `assetAdvanced` | [`assetAdvanced_batch_import_assets`](#assetadvanced_batch_import_assets) | Batch import assets | Import files from a disk directory into asset-db; mutates project assets. |
| `assetAdvanced` | [`assetAdvanced_batch_delete_assets`](#assetadvanced_batch_delete_assets) | Batch delete assets | Delete multiple asset-db URLs; mutates project assets. |
| `assetAdvanced` | [`assetAdvanced_validate_asset_references`](#assetadvanced_validate_asset_references) | Validate asset references | Lightly scan assets under a directory for broken asset-info references. |
| `assetAdvanced` | [`assetAdvanced_get_asset_dependencies`](#assetadvanced_get_asset_dependencies) | Get asset dependencies | Unsupported dependency-analysis placeholder; always reports unsupported. |
| `assetAdvanced` | [`assetAdvanced_get_unused_assets`](#assetadvanced_get_unused_assets) | Get unused assets | Unsupported unused-asset placeholder; always reports unsupported. |
| `assetAdvanced` | [`assetAdvanced_compress_textures`](#assetadvanced_compress_textures) | Compress textures | Unsupported texture-compression placeholder; always reports unsupported. |
| `assetAdvanced` | [`assetAdvanced_export_asset_manifest`](#assetadvanced_export_asset_manifest) | Export asset manifest | Return asset inventory for a directory as json/csv/xml text; does not write a file. |
| `validation` | [`validation_validate_json_params`](#validation_validate_json_params) | Validate json params | Validate and lightly repair a JSON argument string before calling another tool. |
| `validation` | [`validation_safe_string_value`](#validation_safe_string_value) | Safe string value | Escape a raw string for safe use inside JSON arguments. |
| `validation` | [`validation_format_mcp_request`](#validation_format_mcp_request) | Format mcp request | Format a complete MCP tools/call request and curl example. |
| `inspector` | [`inspector_get_common_types_definition`](#inspector_get_common_types_definition) | Get common types definition | Return hardcoded TypeScript declarations for cocos value types (Vec2/3/4, Color, Rect, Size, Quat, Mat3/4) and the InstanceReference shape. |
| `inspector` | [`inspector_get_instance_definition`](#inspector_get_instance_definition) | Get instance definition | Generate a TypeScript class declaration for a scene node, derived from the live cocos scene/query-node dump. |
| `assetMeta` | [`assetMeta_list_interpreters`](#assetmeta_list_interpreters) | List interpreters | List the asset importer types this server has specialized interpreters for. |
| `assetMeta` | [`assetMeta_get_properties`](#assetmeta_get_properties) | Get properties | Read an asset's meta + sub-meta userData via its importer-specific interpreter. |
| `assetMeta` | [`assetMeta_set_properties`](#assetmeta_set_properties) | Set properties | Batch-write asset meta fields. |
| `animation` | [`animation_list_clips`](#animation_list_clips) | List clips | List animation clips registered on a node's cc.Animation component. |
| `animation` | [`animation_play`](#animation_play) | Play | Play an animation clip on a node's cc.Animation component. |
| `animation` | [`animation_stop`](#animation_stop) | Stop | Stop the currently playing animation on a node's cc.Animation component. |
| `animation` | [`animation_set_clip`](#animation_set_clip) | Set clip | Configure a node's cc.Animation: defaultClip name and/or playOnLoad. |
| `fileEditor` | [`fileEditor_insert_text`](#fileeditor_insert_text) | Insert text | [claude-code-redundant] Use Edit/Write tool from your IDE if available. |
| `fileEditor` | [`fileEditor_delete_lines`](#fileeditor_delete_lines) | Delete lines | [claude-code-redundant] Use Edit/Write tool from your IDE if available. |
| `fileEditor` | [`fileEditor_replace_text`](#fileeditor_replace_text) | Replace text | [claude-code-redundant] Use Edit/Write tool from your IDE if available. |
| `fileEditor` | [`fileEditor_query_text`](#fileeditor_query_text) | Query text | [claude-code-redundant] Use Edit/Write tool from your IDE if available. |

---

<a id="scene"></a>

## 1. scene（場景操作）

場景檔案層級操作：開／關／儲存／新建／另存。`create_scene` 支援 `template` 參數可一次寫入 2D 或 3D 範本。

本 category 共 **8** 個工具。

<a id="scene_get_current_scene"></a>

<details>
<summary><code>scene_get_current_scene</code> — Get current scene</summary>

_Read the currently open scene root summary (name/uuid/type/active/nodeCount)._

Read the currently open scene root summary (name/uuid/type/active/nodeCount). No scene mutation; use to get the scene root UUID. Also exposed as resource cocos://scene/current; prefer the resource when the client supports MCP resources.

**參數**：無

</details>

<a id="scene_get_scene_list"></a>

<details>
<summary><code>scene_get_scene_list</code> — Get scene list</summary>

_List .scene assets under db://assets with name/path/uuid._

List .scene assets under db://assets with name/path/uuid. Does not open scenes or modify assets. Also exposed as resource cocos://scene/list.

**參數**：無

</details>

<a id="scene_open_scene"></a>

<details>
<summary><code>scene_open_scene</code> — Open scene</summary>

_Open a scene by db:// path._

Open a scene by db:// path. Switches the active Editor scene; save current edits first if needed.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `scenePath` | string | ✓ |  | Scene db:// path to open, e.g. db://assets/scenes/Main.scene. The tool resolves UUID first. |

</details>

<a id="scene_save_scene"></a>

<details>
<summary><code>scene_save_scene</code> — Save scene</summary>

_Save the currently open scene back to its scene asset._

Save the currently open scene back to its scene asset. Mutates the project file on disk.

**參數**：無

</details>

<a id="scene_create_scene"></a>

<details>
<summary><code>scene_create_scene</code> — Create scene</summary>

_Create a new .scene asset._

Create a new .scene asset. Mutates asset-db; non-empty templates also open the new scene and populate standard Camera/Canvas or Camera/Light nodes.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `sceneName` | string | ✓ |  | New scene name; written into the created cc.SceneAsset / cc.Scene. |
| `savePath` | string | ✓ |  | Target scene location. Pass a full .scene path or a folder path to append sceneName.scene. |
| `template` | enum: `empty` \| `2d-ui` \| `3d-basic` |  | `"empty"` | Built-in scaffolding for the new scene. "empty" (default): bare scene root only — current behavior. "2d-ui": Camera (cc.Camera, ortho projection) + Canvas (cc.UITransform + cc.Canvas with cameraComponent linked, layer UI_2D) so UI nodes render immediately under the UI camera. "3d-basic": Camera (perspective) + DirectionalLight at scene root. ⚠️ Side effect: when template is not "empty" the editor opens the newly created scene to populate it. Save your current scene first if it has unsaved changes. |

</details>

<a id="scene_save_scene_as"></a>

<details>
<summary><code>scene_save_scene_as</code> — Save scene as</summary>

_Copy the currently open scene to a new .scene asset._

Copy the currently open scene to a new .scene asset. Saves current scene first; optionally opens the copy and can overwrite when requested.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `path` | string | ✓ |  | Target db:// path for the new scene file (e.g. "db://assets/scenes/Copy.scene"). The ".scene" extension is appended if missing. |
| `openAfter` | boolean |  | `true` | Open the newly-saved scene right after the copy. Default true. Pass false to keep the current scene focused. |
| `overwrite` | boolean |  | `false` | Overwrite the target file if it already exists. Default false; with false, a name collision returns an error. |

</details>

<a id="scene_close_scene"></a>

<details>
<summary><code>scene_close_scene</code> — Close scene</summary>

_Close the current scene._

Close the current scene. Editor state side effect; save first if unsaved changes matter.

**參數**：無

</details>

<a id="scene_get_scene_hierarchy"></a>

<details>
<summary><code>scene_get_scene_hierarchy</code> — Get scene hierarchy</summary>

_Read the complete current scene node hierarchy._

Read the complete current scene node hierarchy. No mutation; use for UUID/path lookup, optionally with component summaries. Also exposed as resource cocos://scene/hierarchy (defaults: includeComponents=false); prefer the resource for full-tree reads.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `includeComponents` | boolean |  | `false` | Include component type/enabled summaries on each node. Increases response size. |

</details>

---

<a id="node"></a>

## 2. node（節點）

節點生命週期：建立、查詢、改名、變換、移動、複製、刪除。`create_node` 支援 `layer` 參數；parent 是 Canvas 後代時自動推 UI_2D。

本 category 共 **12** 個工具。

<a id="node_create_node"></a>

<details>
<summary><code>node_create_node</code> — Create node</summary>

_Create a node in current scene; supports empty, components, or prefab/asset instance._

Create a node in current scene; supports empty, components, or prefab/asset instance. Provide parentUuid for predictable placement.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `name` | string | ✓ |  | New node name. The response returns the created UUID. |
| `parentUuid` | string |  |  | Parent node UUID. Strongly recommended; omit only when creating at scene root. |
| `nodeType` | enum: `Node` \| `2DNode` \| `3DNode` |  | `"Node"` | Empty-node type hint. Usually unnecessary when instantiating from assetUuid/assetPath. |
| `siblingIndex` | number |  | `-1` | Sibling index under the parent. -1 means append. |
| `assetUuid` | string |  |  | Asset UUID to instantiate from, e.g. prefab UUID. Creates an asset instance instead of an empty node. |
| `assetPath` | string |  |  | db:// asset path to instantiate from. Alternative to assetUuid; resolved before create-node. |
| `components` | array&lt;string&gt; |  |  | Component types to add after creation, e.g. ["cc.Sprite","cc.Button"]. |
| `unlinkPrefab` | boolean |  | `false` | When instantiating a prefab, immediately unlink it into a regular node. Default false preserves prefab link. |
| `keepWorldTransform` | boolean |  | `false` | Preserve world transform while parenting/creating when Cocos supports it. |
| `layer` | enum: `DEFAULT` \| `UI_2D` \| `UI_3D` \| `SCENE_GIZMO` \| `EDITOR` \| `GIZMOS` \| `IGNORE_RAYCAST` \| `PROFILER` \| integer |  |  | Node layer (cc.Layers). Accepts preset name (e.g. "UI_2D") or raw bitmask number. If omitted: auto-detected — UI_2D when any ancestor has cc.Canvas (so UI camera renders the new node), otherwise leaves the create-node default (DEFAULT). Required for UI nodes under Canvas; without it the node is invisible to the UI camera. |
| `initialTransform` | object{position, rotation, scale} |  |  | Initial transform applied after create-node via set_node_transform. |

</details>

<a id="node_get_node_info"></a>

<details>
<summary><code>node_get_node_info</code> — Get node info</summary>

_Read one node by UUID, including transform, children, and component summary._

Read one node by UUID, including transform, children, and component summary. No mutation.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `uuid` | string | ✓ |  | Node UUID to inspect. |

</details>

<a id="node_find_nodes"></a>

<details>
<summary><code>node_find_nodes</code> — Find nodes</summary>

_Search current-scene nodes by name pattern and return multiple matches._

Search current-scene nodes by name pattern and return multiple matches. No mutation; use when names may be duplicated.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `pattern` | string | ✓ |  | Node name search pattern. Partial match unless exactMatch=true. |
| `exactMatch` | boolean |  | `false` | Require exact node name match. Default false. |

</details>

<a id="node_find_node_by_name"></a>

<details>
<summary><code>node_find_node_by_name</code> — Find node by name</summary>

_Find the first node with an exact name._

Find the first node with an exact name. No mutation; only safe when the name is unique enough.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `name` | string | ✓ |  | Exact node name to find. Returns the first match only. |

</details>

<a id="node_get_all_nodes"></a>

<details>
<summary><code>node_get_all_nodes</code> — Get all nodes</summary>

_List all current-scene nodes with name/uuid/type/path; primary source for nodeUuid/parentUuid._

List all current-scene nodes with name/uuid/type/path; primary source for nodeUuid/parentUuid.

**參數**：無

</details>

<a id="node_set_node_property"></a>

<details>
<summary><code>node_set_node_property</code> — Set node property</summary>

_Write a node property path._

Write a node property path. Mutates scene; use for active/name/layer. Prefer set_node_transform for position/rotation/scale. Accepts reference={id,type} (preferred), uuid, or nodeName.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `reference` | object{id, type} |  |  | InstanceReference {id,type}. Preferred form — type travels with the id so AI does not lose semantic context. |
| `uuid` | string |  |  | Node UUID to modify. Used when reference is omitted. |
| `nodeName` | string |  |  | Node name (depth-first first match). Used when reference and uuid are omitted. |
| `property` | string | ✓ |  | Node property path, e.g. active, name, layer. Prefer set_node_transform for position/rotation/scale. |
| `value` | any | ✓ |  | Value to write; must match the Cocos dump shape for the property path. |

</details>

<a id="node_set_node_transform"></a>

<details>
<summary><code>node_set_node_transform</code> — Set node transform</summary>

_Write position/rotation/scale with 2D/3D normalization; mutates scene._

Write position/rotation/scale with 2D/3D normalization; mutates scene. Accepts reference={id,type} (preferred), uuid, or nodeName.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `reference` | object{id, type} |  |  | InstanceReference {id,type}. Preferred form — type travels with the id so AI does not lose semantic context. |
| `uuid` | string |  |  | Node UUID whose transform should be changed. Used when reference is omitted. |
| `nodeName` | string |  |  | Node name (depth-first first match). Used when reference and uuid are omitted. |
| `position` | object{x, y, z} |  |  | Local position. 2D nodes mainly use x/y; 3D nodes use x/y/z. |
| `rotation` | object{x, y, z} |  |  | Local euler rotation. 2D nodes mainly use z; 3D nodes use x/y/z. |
| `scale` | object{x, y, z} |  |  | Local scale. 2D nodes mainly use x/y and usually keep z=1. |

</details>

<a id="node_delete_node"></a>

<details>
<summary><code>node_delete_node</code> — Delete node</summary>

_Delete a node from the current scene._

Delete a node from the current scene. Mutates scene and removes children; verify UUID first.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `uuid` | string | ✓ |  | Node UUID to delete. Children are removed with the node. |

</details>

<a id="node_move_node"></a>

<details>
<summary><code>node_move_node</code> — Move node</summary>

_Reparent a node under a new parent._

Reparent a node under a new parent. Mutates scene; current implementation does not preserve world transform.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `nodeUuid` | string | ✓ |  | Node UUID to reparent. |
| `newParentUuid` | string | ✓ |  | New parent node UUID. |
| `siblingIndex` | number |  | `-1` | Sibling index under the new parent. Currently advisory; move uses set-parent. |

</details>

<a id="node_duplicate_node"></a>

<details>
<summary><code>node_duplicate_node</code> — Duplicate node</summary>

_Duplicate a node and return the new UUID._

Duplicate a node and return the new UUID. Mutates scene; child inclusion follows Cocos duplicate-node behavior.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `uuid` | string | ✓ |  | Node UUID to duplicate. |
| `includeChildren` | boolean |  | `true` | Whether children should be included; actual behavior follows Cocos duplicate-node. |

</details>

<a id="node_detect_node_type"></a>

<details>
<summary><code>node_detect_node_type</code> — Detect node type</summary>

_Heuristically classify a node as 2D or 3D from components/transform._

Heuristically classify a node as 2D or 3D from components/transform. No mutation; helps choose transform semantics.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `uuid` | string | ✓ |  | Node UUID to classify as 2D or 3D by heuristic. |

</details>

<a id="node_set_node_properties"></a>

<details>
<summary><code>node_set_node_properties</code> — Set node properties</summary>

_Batch-write multiple node properties on the same node in one tool call._

Batch-write multiple node properties on the same node in one tool call. Mutates scene; entries run sequentially in array order so cocos undo/serialization stay coherent. Returns per-entry success/error so partial failures are visible. Duplicate paths are rejected up-front; overlapping paths (e.g. position vs position.x) are warned. Use when changing several properties on the same node at once. Accepts reference={id,type} (preferred), uuid, or nodeName.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `reference` | object{id, type} |  |  | InstanceReference {id,type}. Preferred form. |
| `uuid` | string |  |  | Node UUID to modify. Used when reference is omitted. |
| `nodeName` | string |  |  | Node name (depth-first first match). Used when reference and uuid are omitted. |
| `properties` | array&lt;object{path, value}&gt; | ✓ |  | Properties to write. Capped at 50 entries per call. |

</details>

---

<a id="component"></a>

## 3. component（組件）

組件 CRUD、property 設定、事件綁定（cc.EventHandler）。`set_component_property` 對 reference 屬性會做 propertyType vs metadata 的 preflight 檢查；提供 `preserveContentSize` 旗標處理 Sprite 指派 spriteFrame 後 contentSize 被覆蓋的問題。

本 category 共 **11** 個工具。

<a id="component_add_component"></a>

<details>
<summary><code>component_add_component</code> — Add component</summary>

_Add a component to a specific node._

Add a component to a specific node. Mutates scene; verify the component type or script class name first. Accepts reference={id,type} (preferred), nodeUuid, or nodeName.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `reference` | object{id, type} |  |  | InstanceReference {id,type} for the host node. Preferred form. |
| `nodeUuid` | string |  |  | Target node UUID. Used when reference is omitted. |
| `nodeName` | string |  |  | Target node name (depth-first first match). Used when reference and nodeUuid are omitted. |
| `componentType` | string | ✓ |  | Component type to add, e.g. cc.Sprite, cc.Label, cc.Button, or a custom script class name. |

</details>

<a id="component_remove_component"></a>

<details>
<summary><code>component_remove_component</code> — Remove component</summary>

_Remove a component from a node._

Remove a component from a node. Mutates scene; componentType must be the cid/type returned by get_components, not a guessed script name.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `nodeUuid` | string | ✓ |  | Node UUID that owns the component to remove. |
| `componentType` | string | ✓ |  | Component cid (type field from getComponents). Do NOT use script name or class name. Example: "cc.Sprite" or "9b4a7ueT9xD6aRE+AlOusy1" |

</details>

<a id="component_get_components"></a>

<details>
<summary><code>component_get_components</code> — Get components</summary>

_List all components on a node with type/cid and basic properties._

List all components on a node with type/cid and basic properties. No mutation; use before remove_component or set_component_property.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `nodeUuid` | string | ✓ |  | Node UUID whose components should be listed. |

</details>

<a id="component_get_component_info"></a>

<details>
<summary><code>component_get_component_info</code> — Get component info</summary>

_Read detailed data for one component on a node._

Read detailed data for one component on a node. No mutation; use to inspect property names and value shapes before editing.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `nodeUuid` | string | ✓ |  | Node UUID that owns the component. |
| `componentType` | string | ✓ |  | Component type/cid to inspect. Use get_components first if unsure. |

</details>

<a id="component_set_component_property"></a>

<details>
<summary><code>component_set_component_property</code> — Set component property</summary>

_Set component property values for UI components or custom script components._

Set component property values for UI components or custom script components. Supports setting properties of built-in UI components (e.g., cc.Label, cc.Sprite) and custom script components. Accepts reference={id,type} (preferred), nodeUuid, or nodeName. Note: For node basic properties (name, active, layer, etc.), use set_node_property. For node transform properties (position, rotation, scale, etc.), use set_node_transform.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `reference` | object{id, type} |  |  | InstanceReference {id,type} for the host node. Preferred form. |
| `nodeUuid` | string |  |  | Target node UUID. Used when reference is omitted. |
| `nodeName` | string |  |  | Target node name (depth-first first match). Used when reference and nodeUuid are omitted. |
| `componentType` | string | ✓ |  | Component type - Can be built-in components (e.g., cc.Label) or custom script components (e.g., MyScript). If unsure about component type, use get_components first to retrieve all components on the node. |
| `property` | string | ✓ |  | Property name - The property to set. Common properties include:<br>• cc.Label: string (text content), fontSize (font size), color (text color)<br>• cc.Sprite: spriteFrame (sprite frame), color (tint color), sizeMode (size mode)<br>• cc.Button: normalColor (normal color), pressedColor (pressed color), target (target node — propertyType: "node")<br>• cc.Canvas: cameraComponent (cc.Camera ref — propertyType: "component", value = node UUID hosting the camera)<br>• cc.UITransform: contentSize (content size), anchorPoint (anchor point)<br>• Custom Scripts: Based on properties defined in the script |
| `propertyType` | enum: `string` \| `number` \| `boolean` \| `integer` \| `float` \| `color` \| `vec2` \| `vec3` \| `size` \| `node` \| `component` \| `spriteFrame` \| `prefab` \| `asset` \| `nodeArray` \| `colorArray` \| `numberArray` \| `stringArray` | ✓ |  | Property type - Must explicitly specify the property data type for correct value conversion and validation |
| `value` | any | ✓ |  | Property value - Use the corresponding data format based on propertyType:<br><br>📝 Basic Data Types:<br>• string: "Hello World" (text string)<br>• number/integer/float: 42 or 3.14 (numeric value)<br>• boolean: true or false (boolean value)<br><br>🎨 Color Type:<br>• color: {"r":255,"g":0,"b":0,"a":255} (RGBA values, range 0-255)<br>  - Alternative: "#FF0000" (hexadecimal format)<br>  - Transparency: a value controls opacity, 255 = fully opaque, 0 = fully transparent<br><br>📐 Vector and Size Types:<br>• vec2: {"x":100,"y":50} (2D vector)<br>• vec3: {"x":1,"y":2,"z":3} (3D vector)<br>• size: {"width":100,"height":50} (size dimensions)<br><br>🔗 Reference Types (using UUID strings):<br>• node: "target-node-uuid" (cc.Node reference — property metadata type === "cc.Node")<br>  How to get: Use get_all_nodes or find_node_by_name to get node UUIDs<br>• component: "target-node-uuid" (cc.Component subclass reference — e.g. cc.Camera, cc.Sprite)<br>  ⚠️ Easy to confuse with "node": pick "component" whenever the property<br>     metadata expects a Component subclass, even though the value is still<br>     a NODE UUID (the server auto-resolves the component's scene __id__).<br>  Example — cc.Canvas.cameraComponent expects a cc.Camera ref:<br>     propertyType: "component", value: "&lt;UUID of node that has cc.Camera&gt;"<br>  Pitfall: passing propertyType: "node" for cameraComponent appears to<br>     succeed at the IPC layer but the reference never connects.<br>• spriteFrame: "spriteframe-uuid" (sprite frame asset)<br>  How to get: Check asset database or use asset browser<br>  ⚠️ Default cc.Sprite.sizeMode is TRIMMED (1), so assigning spriteFrame<br>     auto-resizes cc.UITransform.contentSize to the texture native size.<br>     Pass preserveContentSize: true to keep the node's current contentSize<br>     (the server pre-sets sizeMode to CUSTOM (0) before the assign).<br>• prefab: "prefab-uuid" (prefab asset)<br>  How to get: Check asset database or use asset browser<br>• asset: "asset-uuid" (generic asset reference)<br>  How to get: Check asset database or use asset browser<br><br>📋 Array Types:<br>• nodeArray: ["uuid1","uuid2"] (array of node UUIDs)<br>• colorArray: [{"r":255,"g":0,"b":0,"a":255}] (array of colors)<br>• numberArray: [1,2,3,4,5] (array of numbers)<br>• stringArray: ["item1","item2"] (array of strings) |
| `preserveContentSize` | boolean |  | `false` | Sprite-specific workflow flag. Only honoured when componentType="cc.Sprite" and property="spriteFrame": before the assign, sets cc.Sprite.sizeMode to CUSTOM (0) so the engine does NOT overwrite cc.UITransform.contentSize with the texture's native dimensions. Use when building UI procedurally and the node's pre-set size must be kept; leave false (default) to keep cocos' standard TRIMMED auto-fit behaviour. |

</details>

<a id="component_attach_script"></a>

<details>
<summary><code>component_attach_script</code> — Attach script</summary>

_Attach a script asset as a component to a node._

Attach a script asset as a component to a node. Mutates scene; use get_components afterward because custom scripts may appear as cid.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `nodeUuid` | string | ✓ |  | Node UUID to attach the script component to. |
| `scriptPath` | string | ✓ |  | Script asset db:// path, e.g. db://assets/scripts/MyScript.ts. |

</details>

<a id="component_get_available_components"></a>

<details>
<summary><code>component_get_available_components</code> — Get available components</summary>

_Return a curated built-in component type list by category._

Return a curated built-in component type list by category. No scene query; custom project scripts are not discovered here.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `category` | enum: `all` \| `renderer` \| `ui` \| `physics` \| `animation` \| `audio` |  | `"all"` | Component category filter for the built-in curated list. |

</details>

<a id="component_add_event_handler"></a>

<details>
<summary><code>component_add_event_handler</code> — Add event handler</summary>

_Append a cc.EventHandler to a component event array and nudge the editor model for persistence._

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

</details>

<a id="component_remove_event_handler"></a>

<details>
<summary><code>component_remove_event_handler</code> — Remove event handler</summary>

_Remove EventHandler entries by index or targetNodeUuid+handler match, then nudge the editor model for persistence._

Remove EventHandler entries by index or targetNodeUuid+handler match, then nudge the editor model for persistence. Mutates scene.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `nodeUuid` | string | ✓ |  | Node UUID owning the component |
| `componentType` | string |  | `"cc.Button"` | Component class name |
| `eventArrayProperty` | string |  | `"clickEvents"` | EventHandler array property name |
| `index` | integer |  |  | Zero-based index to remove. Takes precedence over targetNodeUuid/handler matching when provided. |
| `targetNodeUuid` | string |  |  | Match handlers whose target node has this UUID |
| `handler` | string |  |  | Match handlers with this method name |

</details>

<a id="component_list_event_handlers"></a>

<details>
<summary><code>component_list_event_handlers</code> — List event handlers</summary>

_List EventHandler entries currently bound to a component event array._

List EventHandler entries currently bound to a component event array. No mutation; use before remove_event_handler.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `nodeUuid` | string | ✓ |  | Node UUID owning the component |
| `componentType` | string |  | `"cc.Button"` | Component class name |
| `eventArrayProperty` | string |  | `"clickEvents"` | EventHandler array property name |

</details>

<a id="component_set_component_properties"></a>

<details>
<summary><code>component_set_component_properties</code> — Set component properties</summary>

_Batch-set multiple component properties on the same component in one tool call._

Batch-set multiple component properties on the same component in one tool call. Mutates scene; each property is written sequentially through set_component_property to share nodeUuid+componentType resolution. Returns per-entry success/error so partial failures are visible. Use when AI needs to set 3+ properties on a single component at once. Accepts reference={id,type} (preferred), nodeUuid, or nodeName.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `reference` | object{id, type} |  |  | InstanceReference {id,type} for the host node. Preferred form. |
| `nodeUuid` | string |  |  | Target node UUID. Used when reference is omitted. |
| `nodeName` | string |  |  | Target node name (depth-first first match). Used when reference and nodeUuid are omitted. |
| `componentType` | string | ✓ |  | Component type/cid shared by all entries. |
| `properties` | array&lt;object{property, propertyType, value, preserveContentSize}&gt; | ✓ |  | Property entries. Capped at 20 per call. |

</details>

---

<a id="prefab"></a>

## 4. prefab（預製體）

Prefab façade 工具集：建立、實例化、apply、link/unlink、get-data、restore。除了 `restore_prefab_node` 走 host `restore-prefab` channel，其他都透過 scene façade 介面（execute-scene-script）。

本 category 共 **11** 個工具。

<a id="prefab_get_prefab_list"></a>

<details>
<summary><code>prefab_get_prefab_list</code> — Get prefab list</summary>

_List .prefab assets under a folder with name/path/uuid._

List .prefab assets under a folder with name/path/uuid. No scene or asset mutation. Also exposed as resource cocos://prefabs (default folder=db://assets) and cocos://prefabs{?folder} template; prefer the resource when the client supports MCP resources.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `folder` | string |  | `"db://assets"` | db:// folder to scan for prefabs. Default db://assets. |

</details>

<a id="prefab_load_prefab"></a>

<details>
<summary><code>prefab_load_prefab</code> — Load prefab</summary>

_Read prefab asset metadata only._

Read prefab asset metadata only. Does not instantiate; use instantiate_prefab or create_node assetUuid/assetPath to add one to the scene.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `prefabPath` | string | ✓ |  | Prefab db:// path. Reads metadata only; does not instantiate. |

</details>

<a id="prefab_instantiate_prefab"></a>

<details>
<summary><code>prefab_instantiate_prefab</code> — Instantiate prefab</summary>

_Instantiate a prefab into the current scene; mutates scene and preserves prefab link._

Instantiate a prefab into the current scene; mutates scene and preserves prefab link.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `prefabPath` | string | ✓ |  | Prefab db:// path to instantiate. |
| `parentUuid` | string |  |  | Parent node UUID. Omit to let Cocos choose the default parent. |
| `position` | object{x, y, z} |  |  | Initial local position for the created prefab instance. |

</details>

<a id="prefab_create_prefab"></a>

<details>
<summary><code>prefab_create_prefab</code> — Create prefab</summary>

_Create a prefab asset from a scene node via cce.Prefab.createPrefab facade._

Create a prefab asset from a scene node via cce.Prefab.createPrefab facade.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `nodeUuid` | string | ✓ |  | Source node UUID to convert into a prefab, including children and components. |
| `savePath` | string | ✓ |  | Target prefab db:// path. Pass a full .prefab path or a folder. |
| `prefabName` | string | ✓ |  | Prefab name; used as filename when savePath is a folder. |

</details>

<a id="prefab_update_prefab"></a>

<details>
<summary><code>prefab_update_prefab</code> — Update prefab</summary>

_Apply prefab instance edits back to its linked prefab asset; prefabPath is context only._

Apply prefab instance edits back to its linked prefab asset; prefabPath is context only.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `prefabPath` | string | ✓ |  | Prefab asset path for response context; apply uses nodeUuid linked prefab data. |
| `nodeUuid` | string | ✓ |  | Modified prefab instance node UUID to apply back to its linked prefab. |

</details>

<a id="prefab_revert_prefab"></a>

<details>
<summary><code>prefab_revert_prefab</code> — Revert prefab</summary>

_Restore a prefab instance from its linked asset; discards unapplied overrides._

Restore a prefab instance from its linked asset; discards unapplied overrides.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `nodeUuid` | string | ✓ |  | Prefab instance node UUID to restore from its linked asset. |

</details>

<a id="prefab_get_prefab_info"></a>

<details>
<summary><code>prefab_get_prefab_info</code> — Get prefab info</summary>

_Read prefab meta/dependency summary before apply/revert._

Read prefab meta/dependency summary before apply/revert.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `prefabPath` | string | ✓ |  | Prefab asset db:// path. |

</details>

<a id="prefab_validate_prefab"></a>

<details>
<summary><code>prefab_validate_prefab</code> — Validate prefab</summary>

_Run basic prefab JSON structural checks; not byte-level Cocos equivalence._

Run basic prefab JSON structural checks; not byte-level Cocos equivalence.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `prefabPath` | string | ✓ |  | Prefab db:// path whose JSON structure should be checked. |

</details>

<a id="prefab_restore_prefab_node"></a>

<details>
<summary><code>prefab_restore_prefab_node</code> — Restore prefab node</summary>

_Restore a prefab instance through scene/restore-prefab; assetUuid is context only._

Restore a prefab instance through scene/restore-prefab; assetUuid is context only.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `nodeUuid` | string | ✓ |  | Prefab instance node UUID passed to scene/restore-prefab. |
| `assetUuid` | string | ✓ |  | Prefab asset UUID kept for response context; Cocos restore-prefab uses nodeUuid only. |

</details>

<a id="prefab_set_link"></a>

<details>
<summary><code>prefab_set_link</code> — Set link</summary>

_Attach or detach a prefab link on a node (mode="link" wraps cce.SceneFacade.linkPrefab; mode="unlink" wraps cce.SceneFacade.unlinkPrefab)._

Attach or detach a prefab link on a node (mode="link" wraps cce.SceneFacade.linkPrefab; mode="unlink" wraps cce.SceneFacade.unlinkPrefab).

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `mode` | enum: `link` \| `unlink` | ✓ |  | Operation: "link" attaches a regular node to a prefab asset; "unlink" detaches a prefab instance. |
| `nodeUuid` | string | ✓ |  | Node UUID. For mode="link", the node to attach; for mode="unlink", the prefab instance to detach. |
| `assetUuid` | string |  |  | Prefab asset UUID. Required when mode="link"; ignored when mode="unlink". |
| `removeNested` | boolean |  | `false` | When mode="unlink", also unlink nested prefab instances under this node. Ignored when mode="link". |

</details>

<a id="prefab_get_prefab_data"></a>

<details>
<summary><code>prefab_get_prefab_data</code> — Get prefab data</summary>

_Read facade prefab dump for a prefab instance node._

Read facade prefab dump for a prefab instance node. No mutation; useful for inspecting instance/link serialized data.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `nodeUuid` | string | ✓ |  | Prefab instance node UUID whose prefab dump should be read. |

</details>

---

<a id="project"></a>

## 5. project（專案／資源）

資源管理 + 專案建構：asset CRUD、build / preview server、設定查詢。覆蓋大多數 asset-db 高頻操作。

本 category 共 **24** 個工具。

<a id="project_run_project"></a>

<details>
<summary><code>project_run_project</code> — Run project</summary>

_Open Build panel as preview fallback; does not launch preview automatically._

Open Build panel as preview fallback; does not launch preview automatically.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `platform` | enum: `browser` \| `simulator` \| `preview` |  | `"browser"` | Requested preview platform. Current implementation opens the build panel instead of launching preview. |

</details>

<a id="project_build_project"></a>

<details>
<summary><code>project_build_project</code> — Build project</summary>

_Open Build panel for the requested platform; does not start the build._

Open Build panel for the requested platform; does not start the build.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `platform` | enum: `web-mobile` \| `web-desktop` \| `ios` \| `android` \| `windows` \| `mac` | ✓ |  | Build platform to pre-contextualize the response. Actual build still requires Editor UI. |
| `debug` | boolean |  | `true` | Requested debug build flag. Returned as context only; build is not started programmatically. |

</details>

<a id="project_get_project_info"></a>

<details>
<summary><code>project_get_project_info</code> — Get project info</summary>

_Read project name/path/uuid/version/Cocos version and config._

Read project name/path/uuid/version/Cocos version and config. Also exposed as resource cocos://project/info; prefer the resource when the client supports MCP resources.

**參數**：無

</details>

<a id="project_get_project_settings"></a>

<details>
<summary><code>project_get_project_settings</code> — Get project settings</summary>

_Read one project settings category via project/query-config._

Read one project settings category via project/query-config.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `category` | enum: `general` \| `physics` \| `render` \| `assets` |  | `"general"` | Project settings category to query via project/query-config. |

</details>

<a id="project_refresh_assets"></a>

<details>
<summary><code>project_refresh_assets</code> — Refresh assets</summary>

_Refresh asset-db for a folder; affects Editor asset state, not file content._

Refresh asset-db for a folder; affects Editor asset state, not file content.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `folder` | string |  |  | Asset db:// folder to refresh. Omit to refresh db://assets. |

</details>

<a id="project_import_asset"></a>

<details>
<summary><code>project_import_asset</code> — Import asset</summary>

_Import one disk file into asset-db; mutates project assets._

Import one disk file into asset-db; mutates project assets.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `sourcePath` | string | ✓ |  | Absolute source file path on disk. Must exist. |
| `targetFolder` | string | ✓ |  | Target asset folder, either db://... or relative under db://assets. |

</details>

<a id="project_get_asset_info"></a>

<details>
<summary><code>project_get_asset_info</code> — Get asset info</summary>

_Read basic metadata for one db:// asset path._

Read basic metadata for one db:// asset path.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `assetPath` | string | ✓ |  | Asset db:// path to query. |

</details>

<a id="project_get_assets"></a>

<details>
<summary><code>project_get_assets</code> — Get assets</summary>

_List assets under a folder using type-specific filename patterns._

List assets under a folder using type-specific filename patterns. Also exposed as resource cocos://assets (defaults type=all, folder=db://assets) and cocos://assets{?type,folder} template.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `type` | enum: `all` \| `scene` \| `prefab` \| `script` \| `texture` \| `material` \| `mesh` \| `audio` \| `animation` |  | `"all"` | Asset type filter translated into filename patterns. |
| `folder` | string |  | `"db://assets"` | Asset-db folder to search. Default db://assets. |

</details>

<a id="project_get_build_settings"></a>

<details>
<summary><code>project_get_build_settings</code> — Get build settings</summary>

_Report builder readiness and MCP build limitations._

Report builder readiness and MCP build limitations.

**參數**：無

</details>

<a id="project_open_build_panel"></a>

<details>
<summary><code>project_open_build_panel</code> — Open build panel</summary>

_Open the Cocos Build panel; does not start a build._

Open the Cocos Build panel; does not start a build.

**參數**：無

</details>

<a id="project_check_builder_status"></a>

<details>
<summary><code>project_check_builder_status</code> — Check builder status</summary>

_Check whether the builder worker is ready._

Check whether the builder worker is ready.

**參數**：無

</details>

<a id="project_start_preview_server"></a>

<details>
<summary><code>project_start_preview_server</code> — Start preview server</summary>

_Unsupported preview-server placeholder; use Editor UI._

Unsupported preview-server placeholder; use Editor UI.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `port` | number |  | `7456` | Requested preview server port. Current implementation reports unsupported. |

</details>

<a id="project_stop_preview_server"></a>

<details>
<summary><code>project_stop_preview_server</code> — Stop preview server</summary>

_Unsupported preview-server placeholder; use Editor UI._

Unsupported preview-server placeholder; use Editor UI.

**參數**：無

</details>

<a id="project_create_asset"></a>

<details>
<summary><code>project_create_asset</code> — Create asset</summary>

_Create an asset file or folder through asset-db; null content creates folder._

Create an asset file or folder through asset-db; null content creates folder.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `url` | string | ✓ |  | Target asset db:// URL, e.g. db://assets/newfile.json. |
| `content` | string \| null |  |  | File content. Pass null/omit for folder creation. |
| `overwrite` | boolean |  | `false` | Overwrite existing target instead of auto-renaming. |

</details>

<a id="project_copy_asset"></a>

<details>
<summary><code>project_copy_asset</code> — Copy asset</summary>

_Copy an asset through asset-db; mutates project assets._

Copy an asset through asset-db; mutates project assets.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `source` | string | ✓ |  | Source asset db:// URL. |
| `target` | string | ✓ |  | Target asset db:// URL or folder path. |
| `overwrite` | boolean |  | `false` | Overwrite existing target instead of auto-renaming. |

</details>

<a id="project_move_asset"></a>

<details>
<summary><code>project_move_asset</code> — Move asset</summary>

_Move/rename an asset through asset-db; mutates project assets._

Move/rename an asset through asset-db; mutates project assets.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `source` | string | ✓ |  | Source asset db:// URL. |
| `target` | string | ✓ |  | Target asset db:// URL or folder path. |
| `overwrite` | boolean |  | `false` | Overwrite existing target instead of auto-renaming. |

</details>

<a id="project_delete_asset"></a>

<details>
<summary><code>project_delete_asset</code> — Delete asset</summary>

_Delete one asset-db URL; mutates project assets._

Delete one asset-db URL; mutates project assets.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `url` | string | ✓ |  | Asset db:// URL to delete. |

</details>

<a id="project_save_asset"></a>

<details>
<summary><code>project_save_asset</code> — Save asset</summary>

_Write serialized content to an asset URL; use only for known-good formats._

Write serialized content to an asset URL; use only for known-good formats.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `url` | string | ✓ |  | Asset db:// URL whose content should be saved. |
| `content` | string | ✓ |  | Serialized asset content to write. |

</details>

<a id="project_reimport_asset"></a>

<details>
<summary><code>project_reimport_asset</code> — Reimport asset</summary>

_Ask asset-db to reimport an asset; updates imported asset state/cache._

Ask asset-db to reimport an asset; updates imported asset state/cache.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `url` | string | ✓ |  | Asset db:// URL to reimport. |

</details>

<a id="project_query_asset_path"></a>

<details>
<summary><code>project_query_asset_path</code> — Query asset path</summary>

_Resolve an asset db:// URL to disk path._

Resolve an asset db:// URL to disk path.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `url` | string | ✓ |  | Asset db:// URL to resolve to a disk path. |

</details>

<a id="project_query_asset_uuid"></a>

<details>
<summary><code>project_query_asset_uuid</code> — Query asset uuid</summary>

_Resolve an asset db:// URL to UUID._

Resolve an asset db:// URL to UUID.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `url` | string | ✓ |  | Asset db:// URL to resolve to UUID. |

</details>

<a id="project_query_asset_url"></a>

<details>
<summary><code>project_query_asset_url</code> — Query asset url</summary>

_Resolve an asset UUID to db:// URL._

Resolve an asset UUID to db:// URL.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `uuid` | string | ✓ |  | Asset UUID to resolve to db:// URL. |

</details>

<a id="project_find_asset_by_name"></a>

<details>
<summary><code>project_find_asset_by_name</code> — Find asset by name</summary>

_Search assets by name with exact/type/folder filters; use to discover UUIDs/paths._

Search assets by name with exact/type/folder filters; use to discover UUIDs/paths.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `name` | string | ✓ |  | Asset name search term. Partial match unless exactMatch=true. |
| `exactMatch` | boolean |  | `false` | Require exact asset name match. Default false. |
| `assetType` | enum: `all` \| `scene` \| `prefab` \| `script` \| `texture` \| `material` \| `mesh` \| `audio` \| `animation` \| `spriteFrame` |  | `"all"` | Asset type filter for the search. |
| `folder` | string |  | `"db://assets"` | Asset-db folder to search. Default db://assets. |
| `maxResults` | number |  | `20` | Maximum matched assets to return. Default 20. |

</details>

<a id="project_get_asset_details"></a>

<details>
<summary><code>project_get_asset_details</code> — Get asset details</summary>

_Read asset info plus known image sub-assets such as spriteFrame/texture UUIDs._

Read asset info plus known image sub-assets such as spriteFrame/texture UUIDs.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `assetPath` | string | ✓ |  | Asset db:// path to inspect. |
| `includeSubAssets` | boolean |  | `true` | Try to include known image sub-assets such as spriteFrame and texture UUIDs. |

</details>

---

<a id="debug"></a>

## 6. debug（除錯）

console log、截圖、preview 與系統資訊：取得 / 清空 console、讀 project log 檔、編輯器資訊。

本 category 共 **26** 個工具。

<a id="debug_clear_console"></a>

<details>
<summary><code>debug_clear_console</code> — Clear console</summary>

_Clear the Cocos Editor Console UI._

Clear the Cocos Editor Console UI. No project side effects.

**參數**：無

</details>

<a id="debug_execute_javascript"></a>

<details>
<summary><code>debug_execute_javascript</code> — Execute javascript</summary>

_[primary] Execute JavaScript in scene or editor context._

[primary] Execute JavaScript in scene or editor context. Use this as the default first tool for compound operations (read → mutate → verify) — one call replaces 5-10 narrow specialist tools and avoids per-call token overhead. context="scene" inspects/mutates cc.Node graph; context="editor" runs in host process for Editor.Message + fs (default off, opt-in).

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `code` | string | ✓ |  | JavaScript source to execute. Has access to cc.* in scene context, Editor.* in editor context. |
| `context` | enum: `scene` \| `editor` |  | `"scene"` | Execution sandbox. "scene" runs inside the cocos scene script context (cc, director, find). "editor" runs in the editor host process (Editor, asset-db, fs, require). Editor context is OFF by default and must be opt-in via panel setting `enableEditorContextEval` — arbitrary code in the host process is a prompt-injection risk. |

</details>

<a id="debug_execute_script"></a>

<details>
<summary><code>debug_execute_script</code> — Execute script</summary>

_[compat] Scene-only JavaScript eval._

[compat] Scene-only JavaScript eval. Prefer execute_javascript with context="scene" — kept as compatibility entrypoint for older clients.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `script` | string | ✓ |  | JavaScript to execute in scene context via console/eval. Can read or mutate the current scene. |

</details>

<a id="debug_get_node_tree"></a>

<details>
<summary><code>debug_get_node_tree</code> — Get node tree</summary>

_Read a debug node tree from a root or scene root for hierarchy/component inspection._

Read a debug node tree from a root or scene root for hierarchy/component inspection.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `rootUuid` | string |  |  | Root node UUID to expand. Omit to use the current scene root. |
| `maxDepth` | number |  | `10` | Maximum tree depth. Default 10; large values can return a lot of data. |

</details>

<a id="debug_get_performance_stats"></a>

<details>
<summary><code>debug_get_performance_stats</code> — Get performance stats</summary>

_Try to read scene query-performance stats; may return unavailable in edit mode._

Try to read scene query-performance stats; may return unavailable in edit mode.

**參數**：無

</details>

<a id="debug_validate_scene"></a>

<details>
<summary><code>debug_validate_scene</code> — Validate scene</summary>

_Run basic current-scene health checks for missing assets and node-count warnings._

Run basic current-scene health checks for missing assets and node-count warnings.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `checkMissingAssets` | boolean |  | `true` | Check missing asset references when the Cocos scene API supports it. |
| `checkPerformance` | boolean |  | `true` | Run basic performance checks such as high node count warnings. |

</details>

<a id="debug_get_editor_info"></a>

<details>
<summary><code>debug_get_editor_info</code> — Get editor info</summary>

_Read Editor/Cocos/project/process information and memory summary._

Read Editor/Cocos/project/process information and memory summary.

**參數**：無

</details>

<a id="debug_get_project_logs"></a>

<details>
<summary><code>debug_get_project_logs</code> — Get project logs</summary>

_Read temp/logs/project.log tail with optional level/keyword filters._

Read temp/logs/project.log tail with optional level/keyword filters.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `lines` | number |  | `100` | Number of lines to read from the end of temp/logs/project.log. Default 100. |
| `filterKeyword` | string |  |  | Optional case-insensitive keyword filter. |
| `logLevel` | enum: `ERROR` \| `WARN` \| `INFO` \| `DEBUG` \| `TRACE` \| `ALL` |  | `"ALL"` | Optional log level filter. ALL disables level filtering. |

</details>

<a id="debug_get_log_file_info"></a>

<details>
<summary><code>debug_get_log_file_info</code> — Get log file info</summary>

_Read temp/logs/project.log path, size, line count, and timestamps._

Read temp/logs/project.log path, size, line count, and timestamps.

**參數**：無

</details>

<a id="debug_search_project_logs"></a>

<details>
<summary><code>debug_search_project_logs</code> — Search project logs</summary>

_Search temp/logs/project.log for string/regex and return line context._

Search temp/logs/project.log for string/regex and return line context.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `pattern` | string | ✓ |  | Search string or regex. Invalid regex is treated as a literal string. |
| `maxResults` | number |  | `20` | Maximum matches to return. Default 20. |
| `contextLines` | number |  | `2` | Context lines before/after each match. Default 2. |

</details>

<a id="debug_screenshot"></a>

<details>
<summary><code>debug_screenshot</code> — Screenshot</summary>

_Capture the focused Cocos Editor window (or a window matched by title) to a PNG._

Capture the focused Cocos Editor window (or a window matched by title) to a PNG. Returns saved file path. Use this for AI visual verification after scene/UI changes.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `savePath` | string |  |  | Absolute filesystem path to save the PNG. Must resolve inside the cocos project root (containment check via realpath). Omit to auto-name into &lt;project&gt;/temp/mcp-captures/screenshot-&lt;timestamp&gt;.png. |
| `windowTitle` | string |  |  | Optional substring match on window title to pick a specific Electron window. Default: focused window. |
| `includeBase64` | boolean |  | `false` | Embed PNG bytes as base64 in response data (large; default false). When false, only the saved file path is returned. |

</details>

<a id="debug_capture_preview_screenshot"></a>

<details>
<summary><code>debug_capture_preview_screenshot</code> — Capture preview screenshot</summary>

_Capture the cocos Preview-in-Editor (PIE) gameview to a PNG._

Capture the cocos Preview-in-Editor (PIE) gameview to a PNG. Cocos has multiple PIE render targets depending on the user's preview config (Preferences → Preview → Open Preview With): "browser" opens an external browser (NOT capturable here), "window" / "simulator" opens a separate Electron window (title contains "Preview"), "embedded" renders the gameview inside the main editor window. The default mode="auto" tries the Preview-titled window first and falls back to capturing the main editor window when no Preview-titled window exists (covers embedded mode). Use mode="window" to force the separate-window strategy or mode="embedded" to skip the window probe. Pair with debug_get_preview_mode to read the cocos config and route deterministically. For runtime game-canvas pixel-level capture (camera RenderTexture), use debug_game_command(type="screenshot") instead.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `savePath` | string |  |  | Absolute filesystem path to save the PNG. Must resolve inside the cocos project root (containment check via realpath). Omit to auto-name into &lt;project&gt;/temp/mcp-captures/preview-&lt;timestamp&gt;.png. |
| `mode` | enum: `auto` \| `window` \| `embedded` |  | `"auto"` | Capture target. "auto" (default) tries Preview-titled window then falls back to the main editor window. "window" only matches Preview-titled windows (fails if none). "embedded" captures the main editor window directly (skip Preview-window probe). |
| `windowTitle` | string |  | `"Preview"` | Substring matched against window titles in window/auto modes (default "Preview" for PIE). Ignored in embedded mode. |
| `includeBase64` | boolean |  | `false` | Embed PNG bytes as base64 in response data (large; default false). |

</details>

<a id="debug_get_preview_mode"></a>

<details>
<summary><code>debug_get_preview_mode</code> — Get preview mode</summary>

_Read the cocos preview configuration via Editor.Message preferences/query-config so AI can route debug_capture_preview_screenshot to the correct mode._

Read the cocos preview configuration via Editor.Message preferences/query-config so AI can route debug_capture_preview_screenshot to the correct mode. Returns { interpreted: "browser" \| "window" \| "simulator" \| "embedded" \| "unknown", raw: &lt;full preview config dump&gt; }. Use before capture: if interpreted="embedded", call capture_preview_screenshot with mode="embedded" or rely on mode="auto" fallback.

**參數**：無

</details>

<a id="debug_set_preview_mode"></a>

<details>
<summary><code>debug_set_preview_mode</code> — Set preview mode</summary>

_❌ NOT SUPPORTED on cocos 3.8.7+ (landmine #17)._

❌ NOT SUPPORTED on cocos 3.8.7+ (landmine #17). Programmatic preview-mode switching is impossible from a third-party extension on cocos 3.8.7: `preferences/set-config` against `preview.current.platform` returns truthy but never persists, and **none of 6 surveyed reference projects (harady / Spaydo / RomaRogov / cocos-code-mode / FunplayAI / cocos-cli) ship a working alternative** (v2.10 cross-repo refresh, 2026-05-02). The field is effectively read-only — only the cocos preview dropdown writes it. **Use the cocos preview dropdown in the editor toolbar to switch modes**. Default behavior is hard-fail; pass attemptAnyway=true ONLY for diagnostic probing (returns 4-strategy attempt log so you can verify against a future cocos build whether any shape now works).

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `mode` | enum: `browser` \| `gameView` \| `simulator` | ✓ |  | Target preview platform. "browser" opens preview in the user default browser. "gameView" embeds the gameview in the main editor (in-editor preview). "simulator" launches the cocos simulator. Maps directly to the cocos preview.current.platform value. |
| `attemptAnyway` | boolean |  | `false` | Diagnostic opt-in. Default false returns NOT_SUPPORTED with the cocos UI redirect. Set true ONLY to re-probe the 4 set-config shapes against a new cocos build — useful when validating whether a future cocos version exposes a write path. Returns data.attempts with every shape tried and its read-back observation. Does NOT freeze the editor (the call merely no-ops). |

</details>

<a id="debug_batch_screenshot"></a>

<details>
<summary><code>debug_batch_screenshot</code> — Batch screenshot</summary>

_Capture multiple PNGs of the editor window with optional delays between shots._

Capture multiple PNGs of the editor window with optional delays between shots. Useful for animating preview verification or capturing transitions.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `savePathPrefix` | string |  |  | Path prefix for batch output files. Files written as &lt;prefix&gt;-&lt;index&gt;.png. Must resolve inside the cocos project root (containment check via realpath). Default: &lt;project&gt;/temp/mcp-captures/batch-&lt;timestamp&gt;. |
| `delaysMs` | array&lt;number&gt; |  | `[0]` | Delay (ms) before each capture. Length determines how many shots taken (capped at 20 to prevent disk fill / editor freeze). Default [0] = single shot. |
| `windowTitle` | string |  |  | Optional substring match on window title. |

</details>

<a id="debug_wait_compile"></a>

<details>
<summary><code>debug_wait_compile</code> — Wait compile</summary>

_Block until cocos finishes its TypeScript compile pass._

Block until cocos finishes its TypeScript compile pass. Tails temp/programming/packer-driver/logs/debug.log for the "Target(editor) ends" marker. Returns immediately with compiled=false if no compile was triggered (clean project / no changes detected). Pair with run_script_diagnostics for an "edit .ts → wait → fetch errors" workflow.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `timeoutMs` | number |  | `15000` | Max wait time in ms before giving up. Default 15000. |

</details>

<a id="debug_run_script_diagnostics"></a>

<details>
<summary><code>debug_run_script_diagnostics</code> — Run script diagnostics</summary>

_Run `tsc --noEmit` against the project tsconfig and return parsed diagnostics._

Run `tsc --noEmit` against the project tsconfig and return parsed diagnostics. Used after wait_compile to surface compilation errors as structured {file, line, column, code, message} entries. Resolves tsc binary from project node_modules → editor bundled engine → npx fallback.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `tsconfigPath` | string |  |  | Optional override (absolute or project-relative). Default: tsconfig.json or temp/tsconfig.cocos.json. |

</details>

<a id="debug_preview_url"></a>

<details>
<summary><code>debug_preview_url</code> — Preview url</summary>

_Resolve the cocos browser-preview URL (e.g._

Resolve the cocos browser-preview URL (e.g. http://localhost:7456) via the documented Editor.Message channel preview/query-preview-url. With action="open", also launches the URL in the user default browser via electron.shell.openExternal — useful as a setup step before debug_game_command, since the GameDebugClient running inside the preview must be reachable. Editor-side Preview-in-Editor play/stop is NOT exposed by the public message API and is intentionally not implemented here; use the cocos editor toolbar manually for PIE.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `action` | enum: `query` \| `open` |  | `"query"` | "query" returns the URL; "open" returns the URL AND opens it in the user default browser via electron.shell.openExternal. |

</details>

<a id="debug_query_devices"></a>

<details>
<summary><code>debug_query_devices</code> — Query devices</summary>

_List preview devices configured in the cocos project (cc.IDeviceItem entries)._

List preview devices configured in the cocos project (cc.IDeviceItem entries). Backed by Editor.Message channel device/query. Returns an array of {name, width, height, ratio} entries — useful for batch-screenshot pipelines that target multiple resolutions.

**參數**：無

</details>

<a id="debug_game_command"></a>

<details>
<summary><code>debug_game_command</code> — Game command</summary>

_Send a runtime command to a GameDebugClient running inside a cocos preview/build (browser, Preview-in-Editor, or any device that fetches /game/command)._

Send a runtime command to a GameDebugClient running inside a cocos preview/build (browser, Preview-in-Editor, or any device that fetches /game/command). Built-in command types: "screenshot" (capture game canvas to PNG, returns saved file path), "click" (emit Button.CLICK on a node by name), "inspect" (dump runtime node info: position/scale/rotation/contentSize/active/components by name). Custom command types are forwarded to the client's customCommands map (e.g. "state", "navigate"). Requires the GameDebugClient template (client/cocos-mcp-client.ts) wired into the running game; without it the call times out. Check GET /game/status to verify client liveness first.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `type` | string | ✓ |  | Command type. Built-ins: screenshot, click, inspect. Customs: any string the GameDebugClient registered in customCommands. |
| `args` | any |  |  | Command-specific arguments. For "click"/"inspect": {name: string} node name. For "screenshot": {} (no args). |
| `timeoutMs` | number |  | `10000` | Max wait for client response. Default 10000ms. |

</details>

<a id="debug_record_start"></a>

<details>
<summary><code>debug_record_start</code> — Record start</summary>

_Start recording the running game canvas via the GameDebugClient (browser/PIE preview only)._

Start recording the running game canvas via the GameDebugClient (browser/PIE preview only). Wraps debug_game_command(type="record_start") for AI ergonomics. Returns immediately with { recording: true, mimeType }; the recording continues until debug_record_stop is called. Browser-only — fails on native cocos builds (MediaRecorder API requires a DOM canvas + captureStream). Single-flight per client: a second record_start while a recording is in progress returns success:false. Pair with debug_game_client_status to confirm a client is connected before calling.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `mimeType` | enum: `video/webm` \| `video/mp4` |  |  | Container/codec hint for MediaRecorder. Default: browser auto-pick (webm preferred where supported, falls back to mp4). Some browsers reject unsupported types — record_start surfaces a clear error in that case. |
| `videoBitsPerSecond` | number |  |  | Optional MediaRecorder bitrate hint in bits/sec. Lower → smaller files but lower quality. Browser default if omitted. |
| `timeoutMs` | number |  | `5000` | Max wait for the GameDebugClient to acknowledge record_start. Recording itself runs until debug_record_stop. Default 5000ms. |

</details>

<a id="debug_record_stop"></a>

<details>
<summary><code>debug_record_stop</code> — Record stop</summary>

_Stop the in-progress game canvas recording and persist the result to &lt;project&gt;/temp/mcp-captures/recording-&lt;timestamp&gt;.{webm\|mp4}._

Stop the in-progress game canvas recording and persist the result to &lt;project&gt;/temp/mcp-captures/recording-&lt;timestamp&gt;.{webm\|mp4}. Wraps debug_game_command(type="record_stop"). Returns { filePath, size, mimeType, durationMs }. Calling without a prior record_start returns success:false. The host applies the same realpath containment guard + 64MB byte cap (synced with the request body cap in mcp-server-sdk.ts; v2.9.6 raised both from 32 to 64MB); raise videoBitsPerSecond / reduce recording duration on cap rejection.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `timeoutMs` | number |  | `30000` | Max wait for the client to assemble + return the recording blob. Recordings of several seconds at high bitrate may need longer than the default 30s — raise on long recordings. |

</details>

<a id="debug_game_client_status"></a>

<details>
<summary><code>debug_game_client_status</code> — Game client status</summary>

_Read GameDebugClient connection status: connected (polled within 2s), last poll timestamp, whether a command is queued._

Read GameDebugClient connection status: connected (polled within 2s), last poll timestamp, whether a command is queued. Use before debug_game_command to confirm the client is reachable.

**參數**：無

</details>

<a id="debug_check_editor_health"></a>

<details>
<summary><code>debug_check_editor_health</code> — Check editor health</summary>

_Probe whether the cocos editor scene-script renderer is responsive._

Probe whether the cocos editor scene-script renderer is responsive. Useful after debug_preview_control(start) — landmine #16 documents that cocos 3.8.7 sometimes freezes the scene-script renderer (spinning indicator, Ctrl+R required). Strategy (v2.9.6): three probes — (1) host: device/query (main process, always responsive even when scene-script is wedged); (2) scene/query-is-ready typed channel — direct IPC into the scene module, hangs when scene renderer is frozen; (3) scene/query-node-tree typed channel — returns the full scene tree, forces an actual scene-graph walk through the wedged code path. Each probe has its own timeout race (default 1500ms each). Scene declared alive only when BOTH (2) returns true AND (3) returns a non-null tree within the timeout. Returns { hostAlive, sceneAlive, sceneLatencyMs, hostError, sceneError, totalProbeMs }. AI workflow: call after preview_control(start); if sceneAlive=false, surface "cocos editor likely frozen — press Ctrl+R" instead of issuing more scene-bound calls.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `sceneTimeoutMs` | number |  | `1500` | Timeout for the scene-script probe in ms. Below this scene is considered frozen. Default 1500ms. |

</details>

<a id="debug_preview_control"></a>

<details>
<summary><code>debug_preview_control</code> — Preview control</summary>

_⚠ PARKED — start FREEZES cocos 3.8.7 (landmine #16)._

⚠ PARKED — start FREEZES cocos 3.8.7 (landmine #16). Programmatically start or stop Preview-in-Editor (PIE) play mode. Wraps the typed cce.SceneFacadeManager.changePreviewPlayState method. **start hits a cocos 3.8.7 softReloadScene race** that returns success but freezes the editor (spinning indicator, Ctrl+R required to recover). Verified in both embedded and browser preview modes. v2.10 cross-repo refresh confirmed: none of 6 surveyed peers (harady / Spaydo / RomaRogov / cocos-code-mode / FunplayAI / cocos-cli) ship a safer call path — harady and cocos-code-mode use the `Editor.Message scene/editor-preview-set-play` channel and hit the same race. **stop is safe** and reliable. To prevent accidental triggering, start requires explicit `acknowledgeFreezeRisk: true`. **Strongly preferred alternatives instead of start**: (a) debug_capture_preview_screenshot(mode="embedded") in EDIT mode — no PIE needed; (b) debug_game_command(type="screenshot") via GameDebugClient on browser preview launched via debug_preview_url(action="open").

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `op` | enum: `start` \| `stop` | ✓ |  | "start" enters PIE play mode (equivalent to clicking the toolbar play button) — REQUIRES acknowledgeFreezeRisk=true on cocos 3.8.7 due to landmine #16. "stop" exits PIE play and returns to scene mode (always safe). |
| `acknowledgeFreezeRisk` | boolean |  | `false` | Required to be true for op="start" on cocos 3.8.7 due to landmine #16 (softReloadScene race that freezes the editor). Set true ONLY when the human user has explicitly accepted the risk and is prepared to press Ctrl+R if the editor freezes. Ignored for op="stop" which is reliable. |

</details>

<a id="debug_get_script_diagnostic_context"></a>

<details>
<summary><code>debug_get_script_diagnostic_context</code> — Get script diagnostic context</summary>

_Read a window of source lines around a diagnostic location so AI can read the offending code without a separate file read._

Read a window of source lines around a diagnostic location so AI can read the offending code without a separate file read. Pair with run_script_diagnostics: pass file/line from each diagnostic to fetch context.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `file` | string | ✓ |  | Absolute or project-relative path to the source file. Diagnostics from run_script_diagnostics already use a path tsc emitted, which is suitable here. |
| `line` | number | ✓ |  | 1-based line number that the diagnostic points at. |
| `contextLines` | number |  | `5` | Number of lines to include before and after the target line. Default 5 (±5 → 11-line window). |

</details>

---

<a id="preferences"></a>

## 7. preferences（偏好設定）

編輯器偏好設定的讀寫。

本 category 共 **7** 個工具。

<a id="preferences_open_preferences_settings"></a>

<details>
<summary><code>preferences_open_preferences_settings</code> — Open preferences settings</summary>

_Open Cocos Preferences UI, optionally on a tab; UI side effect only._

Open Cocos Preferences UI, optionally on a tab; UI side effect only.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `tab` | enum: `general` \| `external-tools` \| `data-editor` \| `laboratory` \| `extensions` |  |  | Preferences tab to open. Omit for the default settings panel. |
| `args` | array&lt;any&gt; |  |  | Extra tab arguments; normally unnecessary. |

</details>

<a id="preferences_query_preferences_config"></a>

<details>
<summary><code>preferences_query_preferences_config</code> — Query preferences config</summary>

_Read a Preferences config category/path/type; query before setting values._

Read a Preferences config category/path/type; query before setting values.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `name` | string |  | `"general"` | Preferences category or extension/plugin name. Default general. |
| `path` | string |  |  | Optional config path. Omit to read the whole category. |
| `type` | enum: `default` \| `global` \| `local` |  | `"global"` | Config source: default, global, or project-local. |

</details>

<a id="preferences_set_preferences_config"></a>

<details>
<summary><code>preferences_set_preferences_config</code> — Set preferences config</summary>

_Write a Preferences config value; mutates Cocos global/local settings._

Write a Preferences config value; mutates Cocos global/local settings.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `name` | string | ✓ |  | Preferences category or extension/plugin name to modify. |
| `path` | string | ✓ |  | Exact config path to modify. Query first if unsure. |
| `value` | any | ✓ |  | Value to write; must match the target preference field shape. |
| `type` | enum: `default` \| `global` \| `local` |  | `"global"` | Write target. Prefer global or local; avoid default unless intentional. |

</details>

<a id="preferences_get_all_preferences"></a>

<details>
<summary><code>preferences_get_all_preferences</code> — Get all preferences</summary>

_Read common Preferences categories; may not include every extension category._

Read common Preferences categories; may not include every extension category.

**參數**：無

</details>

<a id="preferences_reset_preferences"></a>

<details>
<summary><code>preferences_reset_preferences</code> — Reset preferences</summary>

_Reset one Preferences category to defaults; all-category reset is unsupported._

Reset one Preferences category to defaults; all-category reset is unsupported.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `name` | string |  |  | Single preference category to reset. Resetting all categories is not supported. |
| `type` | enum: `global` \| `local` |  | `"global"` | Config scope to reset. Default global. |

</details>

<a id="preferences_export_preferences"></a>

<details>
<summary><code>preferences_export_preferences</code> — Export preferences</summary>

_Return readable Preferences as JSON data; does not write a file._

Return readable Preferences as JSON data; does not write a file.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `exportPath` | string |  |  | Label for the returned export path. Current implementation returns JSON data only; it does not write a file. |

</details>

<a id="preferences_import_preferences"></a>

<details>
<summary><code>preferences_import_preferences</code> — Import preferences</summary>

_Unsupported Preferences import placeholder; never modifies settings._

Unsupported Preferences import placeholder; never modifies settings.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `importPath` | string | ✓ |  | Preferences file path to import. Current implementation reports unsupported and does not modify settings. |

</details>

---

<a id="server"></a>

## 8. server（Server）

MCP server 自身的狀態與環境資訊。

本 category 共 **6** 個工具。

<a id="server_query_server_ip_list"></a>

<details>
<summary><code>server_query_server_ip_list</code> — Query server ip list</summary>

_Read IPs reported by the Cocos Editor server._

Read IPs reported by the Cocos Editor server. No project side effects; use to build client connection URLs.

**參數**：無

</details>

<a id="server_query_sorted_server_ip_list"></a>

<details>
<summary><code>server_query_sorted_server_ip_list</code> — Query sorted server ip list</summary>

_Read the Editor server IP list in preferred order._

Read the Editor server IP list in preferred order. No project side effects.

**參數**：無

</details>

<a id="server_query_server_port"></a>

<details>
<summary><code>server_query_server_port</code> — Query server port</summary>

_Read the current Cocos Editor server port._

Read the current Cocos Editor server port. Does not start or stop any server.

**參數**：無

</details>

<a id="server_get_server_status"></a>

<details>
<summary><code>server_get_server_status</code> — Get server status</summary>

_Collect Editor server IP/port, MCP port, Cocos version, platform, and Node runtime info._

Collect Editor server IP/port, MCP port, Cocos version, platform, and Node runtime info. Diagnostics only.

**參數**：無

</details>

<a id="server_check_server_connectivity"></a>

<details>
<summary><code>server_check_server_connectivity</code> — Check server connectivity</summary>

_Probe Editor.Message connectivity with server/query-port and a timeout._

Probe Editor.Message connectivity with server/query-port and a timeout. No project side effects.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `timeout` | number |  | `5000` | Editor server response timeout in milliseconds. Default 5000. |

</details>

<a id="server_get_network_interfaces"></a>

<details>
<summary><code>server_get_network_interfaces</code> — Get network interfaces</summary>

_Read OS network interfaces and compare with Editor-reported IPs._

Read OS network interfaces and compare with Editor-reported IPs. Diagnostics only.

**參數**：無

</details>

---

<a id="broadcast"></a>

## 9. broadcast（廣播）

`Editor.Message` 廣播訊息監聽 / 發送。

本 category 共 **5** 個工具。

<a id="broadcast_get_broadcast_log"></a>

<details>
<summary><code>broadcast_get_broadcast_log</code> — Get broadcast log</summary>

_Read the extension-local broadcast log._

Read the extension-local broadcast log. No project side effects; filter by messageType to inspect scene/asset-db/build-worker events.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `limit` | number |  | `50` | Maximum recent log entries to return. Default 50. |
| `messageType` | string |  |  | Optional broadcast type filter, e.g. scene:ready or asset-db:asset-change. |

</details>

<a id="broadcast_listen_broadcast"></a>

<details>
<summary><code>broadcast_listen_broadcast</code> — Listen broadcast</summary>

_Add a messageType to the extension-local active listener list._

Add a messageType to the extension-local active listener list. Current path is simulated/logging only, not a guaranteed live Editor broadcast subscription.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `messageType` | string | ✓ |  | Broadcast type to add to the local listener list. Current implementation is simulated/logging only. |

</details>

<a id="broadcast_stop_listening"></a>

<details>
<summary><code>broadcast_stop_listening</code> — Stop listening</summary>

_Remove a messageType from the extension-local listener list._

Remove a messageType from the extension-local listener list. Does not affect Cocos Editor internals.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `messageType` | string | ✓ |  | Broadcast type to remove from the local listener list. |

</details>

<a id="broadcast_clear_broadcast_log"></a>

<details>
<summary><code>broadcast_clear_broadcast_log</code> — Clear broadcast log</summary>

_Clear the extension-local broadcast log only._

Clear the extension-local broadcast log only. Does not modify scene, assets, or Editor state.

**參數**：無

</details>

<a id="broadcast_get_active_listeners"></a>

<details>
<summary><code>broadcast_get_active_listeners</code> — Get active listeners</summary>

_List extension-local broadcast listener types and counts for diagnostics._

List extension-local broadcast listener types and counts for diagnostics.

**參數**：無

</details>

---

<a id="sceneadvanced"></a>

## 10. sceneAdvanced（場景進階）

場景進階查詢與 scene-script 入口：依 asset uuid 反查節點、執行任意 scene-script 方法、批次節點查詢等。

本 category 共 **23** 個工具。

<a id="sceneadvanced_reset_node_property"></a>

<details>
<summary><code>sceneAdvanced_reset_node_property</code> — Reset node property</summary>

_Reset one node property to Cocos default; mutates scene._

Reset one node property to Cocos default; mutates scene.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `uuid` | string | ✓ |  | Node UUID whose property should be reset. |
| `path` | string | ✓ |  | Node property path to reset, e.g. position, rotation, scale, layer. |

</details>

<a id="sceneadvanced_move_array_element"></a>

<details>
<summary><code>sceneAdvanced_move_array_element</code> — Move array element</summary>

_Move an item in a node array property such as __comps__; mutates scene._

Move an item in a node array property such as __comps__; mutates scene.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `uuid` | string | ✓ |  | Node UUID that owns the array property. |
| `path` | string | ✓ |  | Array property path, e.g. __comps__. |
| `target` | number | ✓ |  | Original index of the array item to move. |
| `offset` | number | ✓ |  | Relative move offset; positive moves later, negative moves earlier. |

</details>

<a id="sceneadvanced_remove_array_element"></a>

<details>
<summary><code>sceneAdvanced_remove_array_element</code> — Remove array element</summary>

_Remove an item from a node array property by index; mutates scene._

Remove an item from a node array property by index; mutates scene.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `uuid` | string | ✓ |  | Node UUID that owns the array property. |
| `path` | string | ✓ |  | Array property path to edit. |
| `index` | number | ✓ |  | Array index to remove. |

</details>

<a id="sceneadvanced_copy_node"></a>

<details>
<summary><code>sceneAdvanced_copy_node</code> — Copy node</summary>

_Copy nodes through the Cocos scene clipboard channel._

Copy nodes through the Cocos scene clipboard channel.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `uuids` | string \| array&lt;string&gt; | ✓ |  | Node UUID or UUID array to copy into the editor clipboard context. |

</details>

<a id="sceneadvanced_paste_node"></a>

<details>
<summary><code>sceneAdvanced_paste_node</code> — Paste node</summary>

_Paste copied nodes under a target parent; mutates scene and returns new UUIDs._

Paste copied nodes under a target parent; mutates scene and returns new UUIDs.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `target` | string | ✓ |  | Target parent node UUID for pasted nodes. |
| `uuids` | string \| array&lt;string&gt; | ✓ |  | Node UUID or UUID array returned/used by copy_node. |
| `keepWorldTransform` | boolean |  | `false` | Preserve world transform while pasting/reparenting when Cocos supports it. |

</details>

<a id="sceneadvanced_cut_node"></a>

<details>
<summary><code>sceneAdvanced_cut_node</code> — Cut node</summary>

_Cut nodes through the Cocos scene channel; clipboard/scene side effects._

Cut nodes through the Cocos scene channel; clipboard/scene side effects.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `uuids` | string \| array&lt;string&gt; | ✓ |  | Node UUID or UUID array to cut via editor scene channel. |

</details>

<a id="sceneadvanced_reset_node_transform"></a>

<details>
<summary><code>sceneAdvanced_reset_node_transform</code> — Reset node transform</summary>

_Reset node transform to Cocos defaults; mutates scene._

Reset node transform to Cocos defaults; mutates scene.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `uuid` | string | ✓ |  | Node UUID whose transform should be reset to default. |

</details>

<a id="sceneadvanced_reset_component"></a>

<details>
<summary><code>sceneAdvanced_reset_component</code> — Reset component</summary>

_Reset a component by component UUID; mutates scene._

Reset a component by component UUID; mutates scene.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `uuid` | string | ✓ |  | Component UUID to reset to default values. |

</details>

<a id="sceneadvanced_restore_prefab"></a>

<details>
<summary><code>sceneAdvanced_restore_prefab</code> — Restore prefab</summary>

_Restore a prefab instance through scene/restore-prefab; mutates scene._

Restore a prefab instance through scene/restore-prefab; mutates scene.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `nodeUuid` | string | ✓ |  | Prefab instance node UUID to restore. |
| `assetUuid` | string | ✓ |  | Prefab asset UUID kept for context; scene/restore-prefab uses nodeUuid only. |

</details>

<a id="sceneadvanced_execute_component_method"></a>

<details>
<summary><code>sceneAdvanced_execute_component_method</code> — Execute component method</summary>

_Execute an editor-exposed component method; side effects depend on method._

Execute an editor-exposed component method; side effects depend on method.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `uuid` | string | ✓ |  | Component UUID whose editor-exposed method should be invoked. |
| `name` | string | ✓ |  | Method name to execute on the component. |
| `args` | array&lt;any&gt; |  | `[]` | Positional method arguments. |

</details>

<a id="sceneadvanced_execute_scene_script"></a>

<details>
<summary><code>sceneAdvanced_execute_scene_script</code> — Execute scene script</summary>

_Execute a scene script method; low-level escape hatch that can mutate scene._

Execute a scene script method; low-level escape hatch that can mutate scene.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `name` | string | ✓ |  | Scene script package/plugin name. |
| `method` | string | ✓ |  | Scene script method name to execute. |
| `args` | array&lt;any&gt; |  | `[]` | Positional method arguments. |

</details>

<a id="sceneadvanced_scene_snapshot"></a>

<details>
<summary><code>sceneAdvanced_scene_snapshot</code> — Scene snapshot</summary>

_Create a Cocos scene snapshot for undo/change tracking._

Create a Cocos scene snapshot for undo/change tracking.

**參數**：無

</details>

<a id="sceneadvanced_scene_snapshot_abort"></a>

<details>
<summary><code>sceneAdvanced_scene_snapshot_abort</code> — Scene snapshot abort</summary>

_Abort the current Cocos scene snapshot._

Abort the current Cocos scene snapshot.

**參數**：無

</details>

<a id="sceneadvanced_begin_undo_recording"></a>

<details>
<summary><code>sceneAdvanced_begin_undo_recording</code> — Begin undo recording</summary>

_Begin undo recording for a node and return undoId._

Begin undo recording for a node and return undoId.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `nodeUuid` | string | ✓ |  | Node UUID whose changes should be covered by the undo recording. |

</details>

<a id="sceneadvanced_end_undo_recording"></a>

<details>
<summary><code>sceneAdvanced_end_undo_recording</code> — End undo recording</summary>

_Commit a previously started undo recording._

Commit a previously started undo recording.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `undoId` | string | ✓ |  | Undo recording ID returned by begin_undo_recording. |

</details>

<a id="sceneadvanced_cancel_undo_recording"></a>

<details>
<summary><code>sceneAdvanced_cancel_undo_recording</code> — Cancel undo recording</summary>

_Cancel a previously started undo recording._

Cancel a previously started undo recording.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `undoId` | string | ✓ |  | Undo recording ID to cancel without committing. |

</details>

<a id="sceneadvanced_soft_reload_scene"></a>

<details>
<summary><code>sceneAdvanced_soft_reload_scene</code> — Soft reload scene</summary>

_Soft reload the current scene; Editor state side effect._

Soft reload the current scene; Editor state side effect.

**參數**：無

</details>

<a id="sceneadvanced_query_scene_ready"></a>

<details>
<summary><code>sceneAdvanced_query_scene_ready</code> — Query scene ready</summary>

_Check whether the scene module reports ready._

Check whether the scene module reports ready.

**參數**：無

</details>

<a id="sceneadvanced_query_scene_dirty"></a>

<details>
<summary><code>sceneAdvanced_query_scene_dirty</code> — Query scene dirty</summary>

_Check whether the current scene has unsaved changes._

Check whether the current scene has unsaved changes.

**參數**：無

</details>

<a id="sceneadvanced_query_scene_classes"></a>

<details>
<summary><code>sceneAdvanced_query_scene_classes</code> — Query scene classes</summary>

_List registered scene classes, optionally filtered by base class._

List registered scene classes, optionally filtered by base class.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `extends` | string |  |  | Optional base class filter for scene/query-classes. |

</details>

<a id="sceneadvanced_query_scene_components"></a>

<details>
<summary><code>sceneAdvanced_query_scene_components</code> — Query scene components</summary>

_List available scene component definitions from Cocos._

List available scene component definitions from Cocos.

**參數**：無

</details>

<a id="sceneadvanced_query_component_has_script"></a>

<details>
<summary><code>sceneAdvanced_query_component_has_script</code> — Query component has script</summary>

_Check whether a component class has an associated script._

Check whether a component class has an associated script.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `className` | string | ✓ |  | Script class name to check through scene/query-component-has-script. |

</details>

<a id="sceneadvanced_query_nodes_by_asset_uuid"></a>

<details>
<summary><code>sceneAdvanced_query_nodes_by_asset_uuid</code> — Query nodes by asset uuid</summary>

_Find current-scene nodes that reference an asset UUID._

Find current-scene nodes that reference an asset UUID.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `assetUuid` | string | ✓ |  | Asset UUID to search for in scene nodes. |

</details>

---

<a id="sceneview"></a>

## 11. sceneView（場景視圖）

場景視圖控制：gizmo 工具切換、座標系、視圖模式、參考圖等。會影響編輯器面板，不影響 runtime 行為。

本 category 共 **20** 個工具。

<a id="sceneview_change_gizmo_tool"></a>

<details>
<summary><code>sceneView_change_gizmo_tool</code> — Change gizmo tool</summary>

_Change active scene view gizmo tool; UI side effect only._

Change active scene view gizmo tool; UI side effect only.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `name` | enum: `position` \| `rotation` \| `scale` \| `rect` | ✓ |  | Scene view gizmo tool to activate. |

</details>

<a id="sceneview_query_gizmo_tool_name"></a>

<details>
<summary><code>sceneView_query_gizmo_tool_name</code> — Query gizmo tool name</summary>

_Read active scene view gizmo tool._

Read active scene view gizmo tool.

**參數**：無

</details>

<a id="sceneview_change_gizmo_pivot"></a>

<details>
<summary><code>sceneView_change_gizmo_pivot</code> — Change gizmo pivot</summary>

_Change scene view transform pivot mode; UI side effect only._

Change scene view transform pivot mode; UI side effect only.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `name` | enum: `pivot` \| `center` | ✓ |  | Transform pivot mode: pivot or center. |

</details>

<a id="sceneview_query_gizmo_pivot"></a>

<details>
<summary><code>sceneView_query_gizmo_pivot</code> — Query gizmo pivot</summary>

_Read current scene view pivot mode._

Read current scene view pivot mode.

**參數**：無

</details>

<a id="sceneview_query_gizmo_view_mode"></a>

<details>
<summary><code>sceneView_query_gizmo_view_mode</code> — Query gizmo view mode</summary>

_Read current scene view/select mode._

Read current scene view/select mode.

**參數**：無

</details>

<a id="sceneview_change_gizmo_coordinate"></a>

<details>
<summary><code>sceneView_change_gizmo_coordinate</code> — Change gizmo coordinate</summary>

_Change scene view coordinate system to local/global; UI side effect only._

Change scene view coordinate system to local/global; UI side effect only.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `type` | enum: `local` \| `global` | ✓ |  | Transform coordinate system for the scene view gizmo. |

</details>

<a id="sceneview_query_gizmo_coordinate"></a>

<details>
<summary><code>sceneView_query_gizmo_coordinate</code> — Query gizmo coordinate</summary>

_Read current scene view coordinate system._

Read current scene view coordinate system.

**參數**：無

</details>

<a id="sceneview_change_view_mode_2d_3d"></a>

<details>
<summary><code>sceneView_change_view_mode_2d_3d</code> — Change view mode 2d 3d</summary>

_Switch scene view between 2D and 3D; UI side effect only._

Switch scene view between 2D and 3D; UI side effect only.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `is2D` | boolean | ✓ |  | true switches scene view to 2D mode; false switches to 3D mode. |

</details>

<a id="sceneview_query_view_mode_2d_3d"></a>

<details>
<summary><code>sceneView_query_view_mode_2d_3d</code> — Query view mode 2d 3d</summary>

_Read whether scene view is in 2D or 3D mode._

Read whether scene view is in 2D or 3D mode.

**參數**：無

</details>

<a id="sceneview_set_grid_visible"></a>

<details>
<summary><code>sceneView_set_grid_visible</code> — Set grid visible</summary>

_Show or hide scene view grid; UI side effect only._

Show or hide scene view grid; UI side effect only.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `visible` | boolean | ✓ |  | Whether the scene view grid should be visible. |

</details>

<a id="sceneview_query_grid_visible"></a>

<details>
<summary><code>sceneView_query_grid_visible</code> — Query grid visible</summary>

_Read scene view grid visibility._

Read scene view grid visibility.

**參數**：無

</details>

<a id="sceneview_set_icon_gizmo_3d"></a>

<details>
<summary><code>sceneView_set_icon_gizmo_3d</code> — Set icon gizmo 3d</summary>

_Switch IconGizmo between 3D and 2D mode; UI side effect only._

Switch IconGizmo between 3D and 2D mode; UI side effect only.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `is3D` | boolean | ✓ |  | true sets IconGizmo to 3D mode; false sets 2D mode. |

</details>

<a id="sceneview_query_icon_gizmo_3d"></a>

<details>
<summary><code>sceneView_query_icon_gizmo_3d</code> — Query icon gizmo 3d</summary>

_Read current IconGizmo 3D/2D mode._

Read current IconGizmo 3D/2D mode.

**參數**：無

</details>

<a id="sceneview_set_icon_gizmo_size"></a>

<details>
<summary><code>sceneView_set_icon_gizmo_size</code> — Set icon gizmo size</summary>

_Set IconGizmo display size; UI side effect only._

Set IconGizmo display size; UI side effect only.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `size` | number | ✓ |  | IconGizmo size from 10 to 100. |

</details>

<a id="sceneview_query_icon_gizmo_size"></a>

<details>
<summary><code>sceneView_query_icon_gizmo_size</code> — Query icon gizmo size</summary>

_Read current IconGizmo display size._

Read current IconGizmo display size.

**參數**：無

</details>

<a id="sceneview_focus_camera_on_nodes"></a>

<details>
<summary><code>sceneView_focus_camera_on_nodes</code> — Focus camera on nodes</summary>

_Focus scene view camera on nodes or all nodes; camera UI side effect only._

Focus scene view camera on nodes or all nodes; camera UI side effect only.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `uuids` | array&lt;string&gt; \| null | ✓ |  | Node UUIDs to focus the scene camera on. null focuses all nodes. |

</details>

<a id="sceneview_align_camera_with_view"></a>

<details>
<summary><code>sceneView_align_camera_with_view</code> — Align camera with view</summary>

_Apply scene view camera transform to selected camera/node; may mutate selection._

Apply scene view camera transform to selected camera/node; may mutate selection.

**參數**：無

</details>

<a id="sceneview_align_view_with_node"></a>

<details>
<summary><code>sceneView_align_view_with_node</code> — Align view with node</summary>

_Align scene view to selected node; camera UI side effect only._

Align scene view to selected node; camera UI side effect only.

**參數**：無

</details>

<a id="sceneview_get_scene_view_status"></a>

<details>
<summary><code>sceneView_get_scene_view_status</code> — Get scene view status</summary>

_Read combined scene view status snapshot._

Read combined scene view status snapshot.

**參數**：無

</details>

<a id="sceneview_reset_scene_view"></a>

<details>
<summary><code>sceneView_reset_scene_view</code> — Reset scene view</summary>

_Reset scene view UI settings to defaults; UI side effects only._

Reset scene view UI settings to defaults; UI side effects only.

**參數**：無

</details>

---

<a id="referenceimage"></a>

## 12. referenceImage（參考圖）

場景視圖中參考圖的管理（add / remove / list / 透明度等）。

本 category 共 **1** 個工具。

<a id="referenceimage_manage"></a>

<details>
<summary><code>referenceImage_manage</code> — Manage</summary>

_Reference-image module operations (cocos editor scene reference images)._

Reference-image module operations (cocos editor scene reference images). Op-routing macro: pick `op` and supply the matching args. Replaces the v2.8.x flat surface (referenceImage_add_reference_image / remove_reference_image / switch_reference_image / set_reference_image_data / query_reference_image_config / query_current_reference_image / refresh_reference_image / set_reference_image_position / set_reference_image_scale / set_reference_image_opacity / list_reference_images / clear_all_reference_images — 12 → 1).

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `op` | enum: `add` \| `remove` \| `switch` \| `set_data` \| `query_config` \| `query_current` \| `refresh` \| `set_position` \| `set_scale` \| `set_opacity` \| `list` \| `clear_all` | ✓ |  | Op selector. "add" — register absolute image paths (paths required). "remove" — remove specific paths or current image when omitted. "switch" — switch active image (path required, sceneUUID optional). "set_data" — set raw display property (key + value required). "query_config" — read module config. "query_current" — read current image state. "refresh" — refresh display without changing data. "set_position" — set x/y offsets. "set_scale" — set sx/sy scale 0.1-10. "set_opacity" — set opacity 0-1. "list" — read config + current data. "clear_all" — remove all reference images. |
| `paths` | array&lt;string&gt; |  |  | For op="add" (required) or op="remove" (optional — omit to remove current). |
| `path` | string |  |  | For op="switch" (required). |
| `sceneUUID` | string |  |  | For op="switch" (optional scene UUID scope). |
| `key` | enum: `path` \| `x` \| `y` \| `sx` \| `sy` \| `opacity` |  |  | For op="set_data" (required) — property key. |
| `value` | any |  |  | For op="set_data" (required) — property value. |
| `x` | number |  |  | For op="set_position" (required). |
| `y` | number |  |  | For op="set_position" (required). |
| `sx` | number |  |  | For op="set_scale" (required), 0.1-10. |
| `sy` | number |  |  | For op="set_scale" (required), 0.1-10. |
| `opacity` | number |  |  | For op="set_opacity" (required), 0-1. |

</details>

---

<a id="assetadvanced"></a>

## 13. assetAdvanced（資源進階）

asset-db 進階：meta 寫入、URL 生成、相依性查詢、批次匯入 / 刪除、未使用資源偵測等。

本 category 共 **11** 個工具。

<a id="assetadvanced_save_asset_meta"></a>

<details>
<summary><code>assetAdvanced_save_asset_meta</code> — Save asset meta</summary>

_Write serialized meta content for an asset URL/UUID; mutates asset metadata._

Write serialized meta content for an asset URL/UUID; mutates asset metadata.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `urlOrUUID` | string | ✓ |  | Asset db:// URL or UUID whose .meta content should be saved. |
| `content` | string | ✓ |  | Serialized asset meta content string to write. |

</details>

<a id="assetadvanced_generate_available_url"></a>

<details>
<summary><code>assetAdvanced_generate_available_url</code> — Generate available url</summary>

_Return a collision-free asset URL derived from the requested URL._

Return a collision-free asset URL derived from the requested URL.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `url` | string | ✓ |  | Desired asset db:// URL to test for collision and adjust if needed. |

</details>

<a id="assetadvanced_query_asset_db_ready"></a>

<details>
<summary><code>assetAdvanced_query_asset_db_ready</code> — Query asset db ready</summary>

_Check whether asset-db reports ready before batch operations._

Check whether asset-db reports ready before batch operations.

**參數**：無

</details>

<a id="assetadvanced_open_asset_external"></a>

<details>
<summary><code>assetAdvanced_open_asset_external</code> — Open asset external</summary>

_Open an asset through the editor/OS external handler; does not edit content._

Open an asset through the editor/OS external handler; does not edit content.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `urlOrUUID` | string | ✓ |  | Asset db:// URL or UUID to open with the OS/editor associated external program. |

</details>

<a id="assetadvanced_batch_import_assets"></a>

<details>
<summary><code>assetAdvanced_batch_import_assets</code> — Batch import assets</summary>

_Import files from a disk directory into asset-db; mutates project assets._

Import files from a disk directory into asset-db; mutates project assets.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `sourceDirectory` | string | ✓ |  | Absolute source directory on disk to scan for import files. |
| `targetDirectory` | string | ✓ |  | Target asset-db directory URL, e.g. db://assets/textures. |
| `fileFilter` | array&lt;string&gt; |  | `[]` | Allowed file extensions, e.g. [".png",".jpg"]. Empty means all files. |
| `recursive` | boolean |  | `false` | Include files from subdirectories. |
| `overwrite` | boolean |  | `false` | Overwrite existing target assets instead of auto-renaming. |

</details>

<a id="assetadvanced_batch_delete_assets"></a>

<details>
<summary><code>assetAdvanced_batch_delete_assets</code> — Batch delete assets</summary>

_Delete multiple asset-db URLs; mutates project assets._

Delete multiple asset-db URLs; mutates project assets.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `urls` | array&lt;string&gt; | ✓ |  | Asset db:// URLs to delete. Each URL is attempted independently. |

</details>

<a id="assetadvanced_validate_asset_references"></a>

<details>
<summary><code>assetAdvanced_validate_asset_references</code> — Validate asset references</summary>

_Lightly scan assets under a directory for broken asset-info references._

Lightly scan assets under a directory for broken asset-info references.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `directory` | string |  | `"db://assets"` | Asset-db directory to scan. Default db://assets. |

</details>

<a id="assetadvanced_get_asset_dependencies"></a>

<details>
<summary><code>assetAdvanced_get_asset_dependencies</code> — Get asset dependencies</summary>

_Unsupported dependency-analysis placeholder; always reports unsupported._

Unsupported dependency-analysis placeholder; always reports unsupported.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `urlOrUUID` | string | ✓ |  | Asset URL or UUID for dependency analysis. Current implementation reports unsupported. |
| `direction` | enum: `dependents` \| `dependencies` \| `both` |  | `"dependencies"` | Dependency direction requested. Current implementation reports unsupported. |

</details>

<a id="assetadvanced_get_unused_assets"></a>

<details>
<summary><code>assetAdvanced_get_unused_assets</code> — Get unused assets</summary>

_Unsupported unused-asset placeholder; always reports unsupported._

Unsupported unused-asset placeholder; always reports unsupported.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `directory` | string |  | `"db://assets"` | Asset-db directory to scan. Current implementation reports unsupported. |
| `excludeDirectories` | array&lt;string&gt; |  | `[]` | Directories to exclude from the requested scan. Current implementation reports unsupported. |

</details>

<a id="assetadvanced_compress_textures"></a>

<details>
<summary><code>assetAdvanced_compress_textures</code> — Compress textures</summary>

_Unsupported texture-compression placeholder; always reports unsupported._

Unsupported texture-compression placeholder; always reports unsupported.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `directory` | string |  | `"db://assets"` | Texture directory requested for compression. Current implementation reports unsupported. |
| `format` | enum: `auto` \| `jpg` \| `png` \| `webp` |  | `"auto"` | Requested output format. Current implementation reports unsupported. |
| `quality` | number |  | `0.8` | Requested compression quality from 0.1 to 1.0. Current implementation reports unsupported. |

</details>

<a id="assetadvanced_export_asset_manifest"></a>

<details>
<summary><code>assetAdvanced_export_asset_manifest</code> — Export asset manifest</summary>

_Return asset inventory for a directory as json/csv/xml text; does not write a file._

Return asset inventory for a directory as json/csv/xml text; does not write a file.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `directory` | string |  | `"db://assets"` | Asset-db directory to include in the manifest. Default db://assets. |
| `format` | enum: `json` \| `csv` \| `xml` |  | `"json"` | Returned manifest serialization format. |
| `includeMetadata` | boolean |  | `true` | Try to include asset metadata when available. |

</details>

---

<a id="validation"></a>

## 14. validation（驗證）

場景與資源完整性檢查工具，回報缺失或錯誤的 reference。

本 category 共 **3** 個工具。

<a id="validation_validate_json_params"></a>

<details>
<summary><code>validation_validate_json_params</code> — Validate json params</summary>

_Validate and lightly repair a JSON argument string before calling another tool._

Validate and lightly repair a JSON argument string before calling another tool. No Cocos side effects; useful for diagnosing escaping or required-field errors.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `jsonString` | string | ✓ |  | JSON string to parse and lightly repair before a tool call. Handles common escaping, quote, and trailing-comma mistakes. |
| `expectedSchema` | object |  |  | Optional simple JSON schema; checks only basic type and required fields. |

</details>

<a id="validation_safe_string_value"></a>

<details>
<summary><code>validation_safe_string_value</code> — Safe string value</summary>

_Escape a raw string for safe use inside JSON arguments._

Escape a raw string for safe use inside JSON arguments. No Cocos side effects; useful for Label text or custom data containing quotes/newlines.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `value` | string | ✓ |  | Raw string that must be embedded safely inside JSON arguments. |

</details>

<a id="validation_format_mcp_request"></a>

<details>
<summary><code>validation_format_mcp_request</code> — Format mcp request</summary>

_Format a complete MCP tools/call request and curl example._

Format a complete MCP tools/call request and curl example. Formatting only; does not execute the target tool.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `toolName` | string | ✓ |  | MCP tool name to wrap, e.g. create_node or set_component_property. |
| `arguments` | object | ✓ |  | Arguments object for the target tool. This helper formats only; it does not execute the tool. |

</details>

---

<a id="inspector"></a>

## 15. inspector（Inspector）

Inspector 面板與選取狀態查詢，用於讀取目前編輯器 UI context。

本 category 共 **2** 個工具。

<a id="inspector_get_common_types_definition"></a>

<details>
<summary><code>inspector_get_common_types_definition</code> — Get common types definition</summary>

_Return hardcoded TypeScript declarations for cocos value types (Vec2/3/4, Color, Rect, Size, Quat, Mat3/4) and the InstanceReference shape._

Return hardcoded TypeScript declarations for cocos value types (Vec2/3/4, Color, Rect, Size, Quat, Mat3/4) and the InstanceReference shape. AI can prepend this to inspector_get_instance_definition output before generating type-safe code. No scene query.

**參數**：無

</details>

<a id="inspector_get_instance_definition"></a>

<details>
<summary><code>inspector_get_instance_definition</code> — Get instance definition</summary>

_Generate a TypeScript class declaration for a scene node, derived from the live cocos scene/query-node dump._

Generate a TypeScript class declaration for a scene node, derived from the live cocos scene/query-node dump. The generated class includes a comment listing the components attached to the node (with UUIDs). AI should call this BEFORE writing properties so it sees the real property names + types instead of guessing. Pair with get_common_types_definition for Vec2/Color/etc references. v2.4.1 note: only node-shaped references are inspected here — component/asset definition support is deferred until a verified Cocos query-component channel is wired.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `reference` | object{id, type} | ✓ |  | Target node. {id} = node UUID, {type} optional cc class label. Component or asset references will return an error in v2.4.1. |

</details>

---

<a id="assetmeta"></a>

## 16. assetMeta（資源 Meta）

資源 meta 查詢與設定工具，處理 importer / uuid / meta 層級資訊。

本 category 共 **3** 個工具。

<a id="assetmeta_list_interpreters"></a>

<details>
<summary><code>assetMeta_list_interpreters</code> — List interpreters</summary>

_List the asset importer types this server has specialized interpreters for._

List the asset importer types this server has specialized interpreters for. The "*" entry is the read-only fallback used for any importer not in the list. Use to plan assetMeta_set_properties calls — writes against the fallback always reject. No side effects.

**參數**：無

</details>

<a id="assetmeta_get_properties"></a>

<details>
<summary><code>assetMeta_get_properties</code> — Get properties</summary>

_Read an asset's meta + sub-meta userData via its importer-specific interpreter._

Read an asset's meta + sub-meta userData via its importer-specific interpreter. Returns {properties: {path: {type, value, tooltip?, enumList?}}, arrays: {path: {type}}}. Use BEFORE assetMeta_set_properties so AI sees the real property names + types instead of guessing. Pair `includeTooltips: true` when AI needs context for unfamiliar importers. Note: useAdvancedInspection is reserved — full material editing is deferred to v2.5+, so the flag has no effect in v2.4.x.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `reference` | object{id, type} |  |  | InstanceReference {id,type}. Preferred form. type may be "asset:cc.ImageAsset" etc., diagnostic only. |
| `assetUuid` | string |  |  | Asset UUID. Used when reference is omitted. |
| `includeTooltips` | boolean |  | `false` | Include i18n-resolved tooltip text for each property. Slower; only request when AI is exploring an unfamiliar importer. |
| `useAdvancedInspection` | boolean |  | `false` | Reserved for v2.5+. Has no effect in v2.4.x because the only consumer (MaterialInterpreter advanced editing) is deferred until the scene/apply-material + UUID-preprocessing layer is ported. Pass false until v2.5 lands. |

</details>

<a id="assetmeta_set_properties"></a>

<details>
<summary><code>assetMeta_set_properties</code> — Set properties</summary>

_Batch-write asset meta fields._

Batch-write asset meta fields. Each entry is {propertyPath, propertyType, propertyValue}; the interpreter validates the path against an allow-list (userData.*, subMetas.*, platformSettings.*) and rejects unknown roots, prototype-pollution segments (__proto__, constructor, prototype), and empty segments. On commit the interpreter calls asset-db save-asset-meta + refresh-asset so cocos re-imports with the new settings. Use after assetMeta_get_properties to ensure paths/types are correct. Returns per-entry success/error so partial failures are visible; entries that succeeded on disk but failed re-import carry a `warning` field instead of being flipped to failure.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `reference` | object{id, type} |  |  | InstanceReference {id,type}. Preferred form. type may be "asset:cc.ImageAsset" etc., diagnostic only. |
| `assetUuid` | string |  |  | Asset UUID. Used when reference is omitted. |
| `properties` | array&lt;object{propertyPath, propertyType, propertyValue}&gt; | ✓ |  | Property writes. Capped at 50 per call. |

</details>

---

<a id="animation"></a>

## 17. animation（動畫）

動畫 clip、track、keyframe 與 animation component 的建立、查詢和修改。

本 category 共 **4** 個工具。

<a id="animation_list_clips"></a>

<details>
<summary><code>animation_list_clips</code> — List clips</summary>

_List animation clips registered on a node's cc.Animation component._

List animation clips registered on a node's cc.Animation component. Returns clip names + which one is the defaultClip + the playOnLoad flag.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `nodeUuid` | string |  |  | Target node UUID. Provide this OR nodeName (UUID wins when both are set). |
| `nodeName` | string |  |  | Target node name; resolved by depth-first scan of the current scene. Use only when the name is unique. Ignored if nodeUuid is set. |

</details>

<a id="animation_play"></a>

<details>
<summary><code>animation_play</code> — Play</summary>

_Play an animation clip on a node's cc.Animation component._

Play an animation clip on a node's cc.Animation component. Omits clipName → plays the configured defaultClip. Returns success even when the clip was already playing (cocos no-op).

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `nodeUuid` | string |  |  | Target node UUID. Provide this OR nodeName (UUID wins when both are set). |
| `nodeName` | string |  |  | Target node name; resolved by depth-first scan of the current scene. Use only when the name is unique. Ignored if nodeUuid is set. |
| `clipName` | string |  |  | Clip name registered on the Animation component. Omit to play defaultClip. |

</details>

<a id="animation_stop"></a>

<details>
<summary><code>animation_stop</code> — Stop</summary>

_Stop the currently playing animation on a node's cc.Animation component._

Stop the currently playing animation on a node's cc.Animation component. No-op if nothing is playing.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `nodeUuid` | string |  |  | Target node UUID. Provide this OR nodeName (UUID wins when both are set). |
| `nodeName` | string |  |  | Target node name; resolved by depth-first scan of the current scene. Use only when the name is unique. Ignored if nodeUuid is set. |

</details>

<a id="animation_set_clip"></a>

<details>
<summary><code>animation_set_clip</code> — Set clip</summary>

_Configure a node's cc.Animation: defaultClip name and/or playOnLoad._

Configure a node's cc.Animation: defaultClip name and/or playOnLoad. Both fields optional — only the ones you pass get written. Persists via the editor set-property channel (Landmine #11 scalar path) so save_scene picks it up.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `nodeUuid` | string |  |  | Target node UUID. Provide this OR nodeName (UUID wins when both are set). |
| `nodeName` | string |  |  | Target node name; resolved by depth-first scan of the current scene. Use only when the name is unique. Ignored if nodeUuid is set. |
| `defaultClip` | string |  |  | Name of the clip to use as defaultClip. Must already be registered in the component's clips array. |
| `playOnLoad` | boolean |  |  | Whether the component starts the defaultClip when the scene loads. |

</details>

---

<a id="fileeditor"></a>

## 18. fileEditor（檔案編輯）

專案檔案讀寫與搜尋工具，適合檢查或小範圍修改腳本與文字資源。

本 category 共 **4** 個工具。

<a id="fileeditor_insert_text"></a>

<details>
<summary><code>fileEditor_insert_text</code> — Insert text</summary>

_[claude-code-redundant] Use Edit/Write tool from your IDE if available._

[claude-code-redundant] Use Edit/Write tool from your IDE if available. Insert a new line at the given 1-based line number. If line exceeds total, text is appended at end of file. Triggers cocos asset-db refresh on cocos-recognised extensions (.ts/.json/.scene/.prefab/etc.) so the editor reimports.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `filePath` | string | ✓ |  | Path to the file (absolute or project-relative). |
| `line` | integer | ✓ |  | 1-based line number to insert at; existing lines shift down. |
| `text` | string | ✓ |  | Text to insert as a new line (no trailing newline expected). |

</details>

<a id="fileeditor_delete_lines"></a>

<details>
<summary><code>fileEditor_delete_lines</code> — Delete lines</summary>

_[claude-code-redundant] Use Edit/Write tool from your IDE if available._

[claude-code-redundant] Use Edit/Write tool from your IDE if available. Delete a range of lines (1-based, inclusive). Triggers cocos asset-db refresh.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `filePath` | string | ✓ |  | Path to the file (absolute or project-relative). |
| `startLine` | integer | ✓ |  | First line to delete (1-based, inclusive). |
| `endLine` | integer | ✓ |  | Last line to delete (1-based, inclusive). Must be &gt;= startLine. |

</details>

<a id="fileeditor_replace_text"></a>

<details>
<summary><code>fileEditor_replace_text</code> — Replace text</summary>

_[claude-code-redundant] Use Edit/Write tool from your IDE if available._

[claude-code-redundant] Use Edit/Write tool from your IDE if available. Find/replace text in a file. Plain string by default; pass useRegex:true to interpret search as a regex. Replaces first occurrence only unless replaceAll:true. Regex backreferences ($1, $&amp;, $`, $') work when useRegex:true. Triggers cocos asset-db refresh.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `filePath` | string | ✓ |  | Path to the file (absolute or project-relative). |
| `search` | string | ✓ |  | Search text or regex pattern (depends on useRegex). Must be non-empty. |
| `replace` | string | ✓ |  | Replacement text. Regex backreferences ($1, $&amp;, $`, $') expand when useRegex:true. |
| `useRegex` | boolean |  | `false` | Treat `search` as a JS RegExp source string. Default false. |
| `replaceAll` | boolean |  | `false` | Replace every occurrence. Default false (first only). |

</details>

<a id="fileeditor_query_text"></a>

<details>
<summary><code>fileEditor_query_text</code> — Query text</summary>

_[claude-code-redundant] Use Edit/Write tool from your IDE if available._

[claude-code-redundant] Use Edit/Write tool from your IDE if available. Read a range of lines (1-based, inclusive). Returns lines with line numbers; total line count of file in data.totalLines. Read-only; no asset-db refresh.

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `filePath` | string | ✓ |  | Path to the file (absolute or project-relative). |
| `startLine` | integer |  |  | First line to read (1-based). Default 1. |
| `endLine` | integer |  |  | Last line to read (1-based, inclusive). Default end of file. |

</details>

---

## 衍生連結

- [`README.md`](../README.md) — 安裝、啟動、AI client 配置
- [`docs/HANDOFF.md`](HANDOFF.md) — 開發進度、最新修補紀錄
- [`CLAUDE.md`](../CLAUDE.md) — AI session 操作守則與 landmines
