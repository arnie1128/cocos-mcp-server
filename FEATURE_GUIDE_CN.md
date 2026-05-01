# Cocos Creator MCP 服務器功能指導文檔

## 概述

Cocos Creator MCP 服務器是一個全面的 Model Context Protocol (MCP) 服務器插件，專為 Cocos Creator 3.8+ 設計，通過標準化協議使 AI 助手能夠與 Cocos Creator 編輯器進行交互。

本文檔詳細介紹了所有可用的 MCP 工具及其使用方法。

## 工具分類

MCP 服務器提供了 **158 個工具**，按功能分為 13 個主要類別：

1. [場景操作工具 (Scene Tools)](#1-場景操作工具-scene-tools)
2. [節點操作工具 (Node Tools)](#2-節點操作工具-node-tools)
3. [組件管理工具 (Component Tools)](#3-組件管理工具-component-tools)
4. [預製體操作工具 (Prefab Tools)](#4-預製體操作工具-prefab-tools)
5. [項目控制工具 (Project Tools)](#5-項目控制工具-project-tools)
6. [調試工具 (Debug Tools)](#6-調試工具-debug-tools)
7. [偏好設置工具 (Preferences Tools)](#7-偏好設置工具-preferences-tools)
8. [服務器工具 (Server Tools)](#8-服務器工具-server-tools)
9. [廣播工具 (Broadcast Tools)](#9-廣播工具-broadcast-tools)
10. [高級資源工具 (Asset Advanced Tools)](#10-高級資源工具-asset-advanced-tools)
11. [參考圖像工具 (Reference Image Tools)](#11-參考圖像工具-reference-image-tools)
12. [高級場景工具 (Scene Advanced Tools)](#12-高級場景工具-scene-advanced-tools)
13. [場景視圖工具 (Scene View Tools)](#13-場景視圖工具-scene-view-tools)

---

## 1. 場景操作工具 (Scene Tools)

### 1.1 scene_get_current_scene
獲取當前場景信息

**參數**: 無

**返回**: 當前場景的名稱、UUID、類型、激活狀態和節點數量

**示例**:
```json
{
  "tool": "scene_get_current_scene",
  "arguments": {}
}
```

### 1.2 scene_get_scene_list
獲取項目中所有場景列表

**參數**: 無

**返回**: 項目中所有場景的列表，包括名稱、路徑和UUID

**示例**:
```json
{
  "tool": "scene_get_scene_list",
  "arguments": {}
}
```

### 1.3 scene_open_scene
通過路徑打開場景

**參數**:
- `scenePath` (string, 必需): 場景文件路徑

**示例**:
```json
{
  "tool": "scene_open_scene",
  "arguments": {
    "scenePath": "db://assets/scenes/GameScene.scene"
  }
}
```

### 1.4 scene_save_scene
保存當前場景

**參數**: 無

**示例**:
```json
{
  "tool": "scene_save_scene",
  "arguments": {}
}
```

### 1.5 scene_create_scene
創建新場景資源

**參數**:
- `sceneName` (string, 必需): 新場景的名稱
- `savePath` (string, 必需): 保存場景的路徑

**示例**:
```json
{
  "tool": "scene_create_scene",
  "arguments": {
    "sceneName": "NewLevel",
    "savePath": "db://assets/scenes/NewLevel.scene"
  }
}
```

### 1.6 scene_save_scene_as
將場景另存為新文件

**參數**:
- `path` (string, 必需): 保存場景的路徑

**示例**:
```json
{
  "tool": "scene_save_scene_as",
  "arguments": {
    "path": "db://assets/scenes/GameScene_Copy.scene"
  }
}
```

### 1.7 scene_close_scene
關閉當前場景

**參數**: 無

**示例**:
```json
{
  "tool": "scene_close_scene",
  "arguments": {}
}
```

### 1.8 scene_get_scene_hierarchy
獲取當前場景的完整層級結構

**參數**:
- `includeComponents` (boolean, 可選): 是否包含組件信息，默認為 false

**示例**:
```json
{
  "tool": "scene_get_scene_hierarchy",
  "arguments": {
    "includeComponents": true
  }
}
```

---

## 2. 節點操作工具 (Node Tools)

### 2.1 node_create_node
在場景中創建新節點

**參數**:
- `name` (string, 必需): 節點名稱
- `parentUuid` (string, **強烈建議**): 父節點UUID。**重要**：強烈建議始終提供此參數。使用 `get_current_scene` 或 `get_all_nodes` 查找父節點UUID。如果不提供，節點將在場景根節點創建。
- `nodeType` (string, 可選): 節點類型，可選值：`Node`、`2DNode`、`3DNode`，默認為 `Node`
- `siblingIndex` (number, 可選): 同級索引，-1 表示添加到末尾，默認為 -1

**重要提示**: 為了確保節點創建在預期位置，請始終提供 `parentUuid` 參數。您可以通過以下方式獲取父節點UUID：
- 使用 `scene_get_current_scene` 獲取場景根節點UUID
- 使用 `node_get_all_nodes` 查看所有節點及其UUID
- 使用 `node_find_node_by_name` 查找特定節點的UUID

**示例**:
```json
{
  "tool": "node_create_node",
  "arguments": {
    "name": "PlayerNode",
    "nodeType": "2DNode",
    "parentUuid": "parent-uuid-here"
  }
}
```

### 2.2 node_get_node_info
通過UUID獲取節點信息

**參數**:
- `uuid` (string, 必需): 節點UUID

**示例**:
```json
{
  "tool": "node_get_node_info",
  "arguments": {
    "uuid": "node-uuid-here"
  }
}
```

### 2.3 node_find_nodes
按名稱模式查找節點

**參數**:
- `pattern` (string, 必需): 搜索的名稱模式
- `exactMatch` (boolean, 可選): 是否精確匹配，默認為 false

**示例**:
```json
{
  "tool": "node_find_nodes",
  "arguments": {
    "pattern": "Enemy",
    "exactMatch": false
  }
}
```

### 2.4 node_find_node_by_name
通過精確名稱查找第一個節點

**參數**:
- `name` (string, 必需): 要查找的節點名稱

**示例**:
```json
{
  "tool": "node_find_node_by_name",
  "arguments": {
    "name": "Player"
  }
}
```

### 2.5 node_get_all_nodes
獲取場景中所有節點及其UUID

**參數**: 無

**示例**:
```json
{
  "tool": "node_get_all_nodes",
  "arguments": {}
}
```

### 2.6 node_set_node_property
設置節點屬性值

**參數**:
- `uuid` (string, 必需): 節點UUID
- `property` (string, 必需): 屬性名稱（如 position、rotation、scale、active）
- `value` (any, 必需): 屬性值

**示例**:
```json
{
  "tool": "node_set_node_property",
  "arguments": {
    "uuid": "node-uuid-here",
    "property": "position",
    "value": {"x": 100, "y": 200, "z": 0}
  }
}
```

### 2.7 node_delete_node
從場景中刪除節點

**參數**:
- `uuid` (string, 必需): 要刪除的節點UUID

**示例**:
```json
{
  "tool": "node_delete_node",
  "arguments": {
    "uuid": "node-uuid-here"
  }
}
```

### 2.8 node_move_node
將節點移動到新的父節點

**參數**:
- `nodeUuid` (string, 必需): 要移動的節點UUID
- `newParentUuid` (string, 必需): 新父節點UUID
- `siblingIndex` (number, 可選): 新父節點中的同級索引，默認為 -1

**示例**:
```json
{
  "tool": "node_move_node",
  "arguments": {
    "nodeUuid": "node-uuid-here",
    "newParentUuid": "parent-uuid-here",
    "siblingIndex": 0
  }
}
```

### 2.9 node_duplicate_node
複製節點

**參數**:
- `uuid` (string, 必需): 要複製的節點UUID
- `includeChildren` (boolean, 可選): 是否包含子節點，默認為 true

**示例**:
```json
{
  "tool": "node_duplicate_node",
  "arguments": {
    "uuid": "node-uuid-here",
    "includeChildren": true
  }
}
```

---

## 3. 組件管理工具 (Component Tools)

### 3.1 component_add_component
向指定節點添加組件

**參數**:
- `nodeUuid` (string, **必需**): 目標節點UUID。**重要**：必須指定要添加組件的確切節點。使用 `get_all_nodes` 或 `find_node_by_name` 獲取所需節點的UUID。
- `componentType` (string, 必需): 組件類型（如 cc.Sprite、cc.Label、cc.Button）

**重要提示**: 在添加組件之前，請確保：
1. 先使用 `node_get_all_nodes` 或 `node_find_node_by_name` 找到目標節點的UUID
2. 驗證節點存在且UUID正確
3. 選擇合適的組件類型

**示例**:
```json
{
  "tool": "component_add_component",
  "arguments": {
    "nodeUuid": "node-uuid-here",
    "componentType": "cc.Sprite"
  }
}
```

### 3.2 component_remove_component
從節點移除組件

**參數**:
- `nodeUuid` (string, 必需): 節點UUID
- `componentType` (string, 必需): 要移除的組件類型

**示例**:
```json
{
  "tool": "component_remove_component",
  "arguments": {
    "nodeUuid": "node-uuid-here",
    "componentType": "cc.Sprite"
  }
}
```

### 3.3 component_get_components
獲取節點的所有組件

**參數**:
- `nodeUuid` (string, 必需): 節點UUID

**示例**:
```json
{
  "tool": "component_get_components",
  "arguments": {
    "nodeUuid": "node-uuid-here"
  }
}
```

### 3.4 component_get_component_info
獲取特定組件信息

**參數**:
- `nodeUuid` (string, 必需): 節點UUID
- `componentType` (string, 必需): 要獲取信息的組件類型

**示例**:
```json
{
  "tool": "component_get_component_info",
  "arguments": {
    "nodeUuid": "node-uuid-here",
    "componentType": "cc.Sprite"
  }
}
```

### 3.5 component_set_component_property
設置組件屬性值

**參數**:
- `nodeUuid` (string, 必需): 節點UUID
- `componentType` (string, 必需): 組件類型
- `property` (string, 必需): 屬性名稱
- `value` (any, 必需): 屬性值

**示例**:
```json
{
  "tool": "component_set_component_property",
  "arguments": {
    "nodeUuid": "node-uuid-here",
    "componentType": "cc.Sprite",
    "property": "spriteFrame",
    "value": "sprite-frame-uuid"
  }
}
```

### 3.6 component_attach_script
向節點附加腳本組件

**參數**:
- `nodeUuid` (string, 必需): 節點UUID
- `scriptPath` (string, 必需): 腳本資源路徑

**示例**:
```json
{
  "tool": "component_attach_script",
  "arguments": {
    "nodeUuid": "node-uuid-here",
    "scriptPath": "db://assets/scripts/PlayerController.ts"
  }
}
```

### 3.7 component_get_available_components
獲取可用組件類型列表

**參數**:
- `category` (string, 可選): 組件類別過濾器，可選值：`all`、`renderer`、`ui`、`physics`、`animation`、`audio`，默認為 `all`

**示例**:
```json
{
  "tool": "component_get_available_components",
  "arguments": {
    "category": "ui"
  }
}
```

---

## 4. 預製體操作工具 (Prefab Tools)

**⚠️ 已知問題**: 使用標準 Cocos Creator API 進行預製體實例化時，可能無法正確恢復包含子節點的複雜預製體結構。雖然預製體創建功能可以正確保存所有子節點信息，但通過 `create-node` 配合 `assetUuid` 進行的實例化過程存在限制，可能導致實例化的預製體中缺少子節點。

### 4.1 prefab_get_prefab_list
獲取項目中所有預製體

**參數**:
- `folder` (string, 可選): 搜索文件夾路徑，默認為 `db://assets`

**示例**:
```json
{
  "tool": "prefab_get_prefab_list",
  "arguments": {
    "folder": "db://assets/prefabs"
  }
}
```

### 4.2 prefab_load_prefab
通過路徑加載預製體

**參數**:
- `prefabPath` (string, 必需): 預製體資源路徑

**示例**:
```json
{
  "tool": "prefab_load_prefab",
  "arguments": {
    "prefabPath": "db://assets/prefabs/Enemy.prefab"
  }
}
```

### 4.3 prefab_instantiate_prefab
在場景中實例化預製體

**參數**:
- `prefabPath` (string, 必需): 預製體資源路徑
- `parentUuid` (string, 可選): 父節點UUID
- `position` (object, 可選): 初始位置，包含 x、y、z 屬性

**示例**:
```json
{
  "tool": "prefab_instantiate_prefab",
  "arguments": {
    "prefabPath": "db://assets/prefabs/Enemy.prefab",
    "parentUuid": "parent-uuid-here",
    "position": {"x": 100, "y": 200, "z": 0}
  }
}
```

**⚠️ 功能限制**: 包含子節點的複雜預製體可能無法正確實例化。由於 Cocos Creator API 在標準 `create-node` 方法中使用 `assetUuid` 的限制，可能只創建根節點，子節點可能會丟失。這是當前實現的已知問題。

### 4.4 prefab_create_prefab
從節點創建預製體

**參數**:
- `nodeUuid` (string, 必需): 源節點UUID
- `savePath` (string, 必需): 保存預製體的路徑
- `prefabName` (string, 必需): 預製體名稱

**示例**:
```json
{
  "tool": "prefab_create_prefab",
  "arguments": {
    "nodeUuid": "node-uuid-here",
    "savePath": "db://assets/prefabs/",
    "prefabName": "MyPrefab"
  }
}
```

### 4.5 prefab_create_prefab_from_node
從節點創建預製體（create_prefab 的別名）

**參數**:
- `nodeUuid` (string, 必需): 源節點UUID
- `prefabPath` (string, 必需): 保存預製體的路徑

**示例**:
```json
{
  "tool": "prefab_create_prefab_from_node",
  "arguments": {
    "nodeUuid": "node-uuid-here",
    "prefabPath": "db://assets/prefabs/MyPrefab.prefab"
  }
}
```

### 4.6 prefab_update_prefab
更新現有預製體

**參數**:
- `prefabPath` (string, 必需): 預製體資源路徑
- `nodeUuid` (string, 必需): 包含更改的節點UUID

**示例**:
```json
{
  "tool": "prefab_update_prefab",
  "arguments": {
    "prefabPath": "db://assets/prefabs/Enemy.prefab",
    "nodeUuid": "node-uuid-here"
  }
}
```

### 4.7 prefab_revert_prefab
將預製體實例恢復為原始狀態

**參數**:
- `nodeUuid` (string, 必需): 預製體實例節點UUID

**示例**:
```json
{
  "tool": "prefab_revert_prefab",
  "arguments": {
    "nodeUuid": "prefab-instance-uuid-here"
  }
}
```

### 4.8 prefab_get_prefab_info
獲取詳細的預製體信息

**參數**:
- `prefabPath` (string, 必需): 預製體資源路徑

**示例**:
```json
{
  "tool": "prefab_get_prefab_info",
  "arguments": {
    "prefabPath": "db://assets/prefabs/Enemy.prefab"
  }
}
```

---

## 5. 項目控制工具 (Project Tools)

### 5.1 project_run_project
在預覽模式下運行項目

**參數**:
- `platform` (string, 可選): 目標平臺，可選值：`browser`、`simulator`、`preview`，默認為 `browser`

**示例**:
```json
{
  "tool": "project_run_project",
  "arguments": {
    "platform": "browser"
  }
}
```

### 5.2 project_build_project
構建項目

**參數**:
- `platform` (string, 必需): 構建平臺，可選值：`web-mobile`、`web-desktop`、`ios`、`android`、`windows`、`mac`
- `debug` (boolean, 可選): 是否調試構建，默認為 true

**示例**:
```json
{
  "tool": "project_build_project",
  "arguments": {
    "platform": "web-mobile",
    "debug": false
  }
}
```

### 5.3 project_get_project_info
獲取項目信息

**參數**: 無

**示例**:
```json
{
  "tool": "project_get_project_info",
  "arguments": {}
}
```

### 5.4 project_get_project_settings
獲取項目設置

**參數**:
- `category` (string, 可選): 設置類別，可選值：`general`、`physics`、`render`、`assets`，默認為 `general`

**示例**:
```json
{
  "tool": "project_get_project_settings",
  "arguments": {
    "category": "physics"
  }
}
```

### 5.5 project_refresh_assets
刷新資源數據庫

**參數**:
- `folder` (string, 可選): 要刷新的特定文件夾

**示例**:
```json
{
  "tool": "project_refresh_assets",
  "arguments": {
    "folder": "db://assets/textures"
  }
}
```

### 5.6 project_import_asset
導入資源文件

**參數**:
- `sourcePath` (string, 必需): 源文件路徑
- `targetFolder` (string, 必需): 資源中的目標文件夾

**示例**:
```json
{
  "tool": "project_import_asset",
  "arguments": {
    "sourcePath": "/path/to/image.png",
    "targetFolder": "db://assets/textures"
  }
}
```

### 5.7 project_get_asset_info
獲取資源信息

**參數**:
- `assetPath` (string, 必需): 資源路徑

**示例**:
```json
{
  "tool": "project_get_asset_info",
  "arguments": {
    "assetPath": "db://assets/textures/player.png"
  }
}
```

### 5.8 project_get_assets
按類型獲取資源

**參數**:
- `type` (string, 可選): 資源類型過濾器，可選值：`all`、`scene`、`prefab`、`script`、`texture`、`material`、`mesh`、`audio`、`animation`，默認為 `all`
- `folder` (string, 可選): 搜索文件夾，默認為 `db://assets`

**示例**:
```json
{
  "tool": "project_get_assets",
  "arguments": {
    "type": "texture",
    "folder": "db://assets/textures"
  }
}
```

### 5.9 project_get_build_settings
獲取構建設置

**參數**: 無

**示例**:
```json
{
  "tool": "project_get_build_settings",
  "arguments": {}
}
```

### 5.10 project_open_build_panel
在編輯器中打開構建面板

**參數**: 無

**示例**:
```json
{
  "tool": "project_open_build_panel",
  "arguments": {}
}
```

### 5.11 project_check_builder_status
檢查構建器工作進程是否就緒

**參數**: 無

**示例**:
```json
{
  "tool": "project_check_builder_status",
  "arguments": {}
}
```

### 5.12 project_start_preview_server
啟動預覽服務器

**參數**:
- `port` (number, 可選): 預覽服務器端口，默認為 7456

**示例**:
```json
{
  "tool": "project_start_preview_server",
  "arguments": {
    "port": 8080
  }
}
```

### 5.13 project_stop_preview_server
停止預覽服務器

**參數**: 無

**示例**:
```json
{
  "tool": "project_stop_preview_server",
  "arguments": {}
}
```

### 5.14 project_create_asset
創建新的資源文件或文件夾

**參數**:
- `url` (string, 必需): 資源URL
- `content` (string, 可選): 文件內容，null 表示創建文件夾
- `overwrite` (boolean, 可選): 是否覆蓋現有文件，默認為 false

**示例**:
```json
{
  "tool": "project_create_asset",
  "arguments": {
    "url": "db://assets/scripts/NewScript.ts",
    "content": "// New TypeScript script\n",
    "overwrite": false
  }
}
```

### 5.15 project_copy_asset
複製資源到另一個位置

**參數**:
- `source` (string, 必需): 源資源URL
- `target` (string, 必需): 目標位置URL
- `overwrite` (boolean, 可選): 是否覆蓋現有文件，默認為 false

**示例**:
```json
{
  "tool": "project_copy_asset",
  "arguments": {
    "source": "db://assets/textures/player.png",
    "target": "db://assets/textures/backup/player.png",
    "overwrite": false
  }
}
```

### 5.16 project_move_asset
移動資源到另一個位置

**參數**:
- `source` (string, 必需): 源資源URL
- `target` (string, 必需): 目標位置URL
- `overwrite` (boolean, 可選): 是否覆蓋現有文件，默認為 false

**示例**:
```json
{
  "tool": "project_move_asset",
  "arguments": {
    "source": "db://assets/textures/old_player.png",
    "target": "db://assets/textures/player.png",
    "overwrite": true
  }
}
```

### 5.17 project_delete_asset
刪除資源

**參數**:
- `url` (string, 必需): 要刪除的資源URL

**示例**:
```json
{
  "tool": "project_delete_asset",
  "arguments": {
    "url": "db://assets/textures/unused.png"
  }
}
```

### 5.18 project_save_asset
保存資源內容

**參數**:
- `url` (string, 必需): 資源URL
- `content` (string, 必需): 資源內容

**示例**:
```json
{
  "tool": "project_save_asset",
  "arguments": {
    "url": "db://assets/scripts/GameManager.ts",
    "content": "// Updated script content\n"
  }
}
```

### 5.19 project_reimport_asset
重新導入資源

**參數**:
- `url` (string, 必需): 要重新導入的資源URL

**示例**:
```json
{
  "tool": "project_reimport_asset",
  "arguments": {
    "url": "db://assets/textures/player.png"
  }
}
```

### 5.20 project_query_asset_path
獲取資源磁盤路徑

**參數**:
- `url` (string, 必需): 資源URL

**示例**:
```json
{
  "tool": "project_query_asset_path",
  "arguments": {
    "url": "db://assets/textures/player.png"
  }
}
```

### 5.21 project_query_asset_uuid
從URL獲取資源UUID

**參數**:
- `url` (string, 必需): 資源URL

**示例**:
```json
{
  "tool": "project_query_asset_uuid",
  "arguments": {
    "url": "db://assets/textures/player.png"
  }
}
```

### 5.22 project_query_asset_url
從UUID獲取資源URL

**參數**:
- `uuid` (string, 必需): 資源UUID

**示例**:
```json
{
  "tool": "project_query_asset_url",
  "arguments": {
    "uuid": "asset-uuid-here"
  }
}
```

---

## 6. 調試工具 (Debug Tools)

### 6.1 debug_get_console_logs
獲取編輯器控制台日誌

**參數**:
- `limit` (number, 可選): 要檢索的最新日誌數量，默認為 100
- `filter` (string, 可選): 按類型過濾日誌，可選值：`all`、`log`、`warn`、`error`、`info`，默認為 `all`

**示例**:
```json
{
  "tool": "debug_get_console_logs",
  "arguments": {
    "limit": 50,
    "filter": "error"
  }
}
```

### 6.2 debug_clear_console
清空編輯器控制台

**參數**: 無

**示例**:
```json
{
  "tool": "debug_clear_console",
  "arguments": {}
}
```

### 6.3 debug_execute_script
在場景上下文中執行JavaScript代碼

**參數**:
- `script` (string, 必需): 要執行的JavaScript代碼

**示例**:
```json
{
  "tool": "debug_execute_script",
  "arguments": {
    "script": "console.log('Hello from MCP!');"
  }
}
```

### 6.4 debug_get_node_tree
獲取用於調試的詳細節點樹

**參數**:
- `rootUuid` (string, 可選): 根節點UUID，如果不提供則使用場景根節點
- `maxDepth` (number, 可選): 最大樹深度，默認為 10

**示例**:
```json
{
  "tool": "debug_get_node_tree",
  "arguments": {
    "rootUuid": "root-node-uuid",
    "maxDepth": 5
  }
}
```

### 6.5 debug_get_performance_stats
獲取性能統計信息

**參數**: 無

**示例**:
```json
{
  "tool": "debug_get_performance_stats",
  "arguments": {}
}
```

### 6.6 debug_validate_scene
驗證當前場景是否有問題

**參數**:
- `checkMissingAssets` (boolean, 可選): 檢查缺失的資源引用，默認為 true
- `checkPerformance` (boolean, 可選): 檢查性能問題，默認為 true

**示例**:
```json
{
  "tool": "debug_validate_scene",
  "arguments": {
    "checkMissingAssets": true,
    "checkPerformance": true
  }
}
```

### 6.7 debug_get_editor_info
獲取編輯器和環境信息

**參數**: 無

**示例**:
```json
{
  "tool": "debug_get_editor_info",
  "arguments": {}
}
```

### 6.8 debug_get_project_logs
從 temp/logs/project.log 文件獲取項目日誌

**參數**:
- `lines` (number, 可選): 從日誌文件末尾讀取的行數，默認值為100，範圍：1-10000
- `filterKeyword` (string, 可選): 按指定關鍵詞過濾日誌
- `logLevel` (string, 可選): 按日誌級別過濾，選項：`ERROR`, `WARN`, `INFO`, `DEBUG`, `TRACE`, `ALL`，默認為 `ALL`

**示例**:
```json
{
  "tool": "debug_get_project_logs",
  "arguments": {
    "lines": 200,
    "filterKeyword": "prefab",
    "logLevel": "INFO"
  }
}
```

### 6.9 debug_get_log_file_info
獲取項目日誌文件信息

**參數**: 無

**返回**: 文件大小、最後修改時間、行數和文件路徑信息

**示例**:
```json
{
  "tool": "debug_get_log_file_info",
  "arguments": {}
}
```

### 6.10 debug_search_project_logs
在項目日誌中搜索特定模式或錯誤

**參數**:
- `pattern` (string, 必需): 搜索模式（支持正則表達式）
- `maxResults` (number, 可選): 最大匹配結果數量，默認為20，範圍：1-100
- `contextLines` (number, 可選): 匹配結果周圍顯示的上下文行數，默認為2，範圍：0-10

**示例**:
```json
{
  "tool": "debug_search_project_logs",
  "arguments": {
    "pattern": "error|failed|exception",
    "maxResults": 10,
    "contextLines": 3
  }
}
```

---

## 7. 偏好設置工具 (Preferences Tools)

### 7.1 preferences_get_preferences
獲取編輯器偏好設置

**參數**:
- `key` (string, 可選): 要獲取的特定偏好設置鍵

**示例**:
```json
{
  "tool": "preferences_get_preferences",
  "arguments": {
    "key": "editor.theme"
  }
}
```

### 7.2 preferences_set_preferences
設置編輯器偏好設置

**參數**:
- `key` (string, 必需): 要設置的偏好設置鍵
- `value` (any, 必需): 要設置的偏好設置值

**示例**:
```json
{
  "tool": "preferences_set_preferences",
  "arguments": {
    "key": "editor.theme",
    "value": "dark"
  }
}
```

### 7.3 preferences_get_global_preferences
獲取全局編輯器偏好設置

**參數**:
- `key` (string, 可選): 要獲取的全局偏好設置鍵

**示例**:
```json
{
  "tool": "preferences_get_global_preferences",
  "arguments": {
    "key": "global.autoSave"
  }
}
```

### 7.4 preferences_set_global_preferences
設置全局編輯器偏好設置

**參數**:
- `key` (string, 必需): 要設置的全局偏好設置鍵
- `value` (any, 必需): 要設置的全局偏好設置值

**示例**:
```json
{
  "tool": "preferences_set_global_preferences",
  "arguments": {
    "key": "global.autoSave",
    "value": true
  }
}
```

### 7.5 preferences_get_recent_projects
獲取最近打開的項目

**參數**: 無

**示例**:
```json
{
  "tool": "preferences_get_recent_projects",
  "arguments": {}
}
```

### 7.6 preferences_clear_recent_projects
清除最近打開的項目列表

**參數**: 無

**示例**:
```json
{
  "tool": "preferences_clear_recent_projects",
  "arguments": {}
}
```

---

## 8. 服務器工具 (Server Tools)

### 8.1 server_get_server_info
獲取服務器信息

**參數**: 無

**示例**:
```json
{
  "tool": "server_get_server_info",
  "arguments": {}
}
```

### 8.2 server_broadcast_custom_message
廣播自定義消息

**參數**:
- `message` (string, 必需): 消息名稱
- `data` (any, 可選): 消息數據

**示例**:
```json
{
  "tool": "server_broadcast_custom_message",
  "arguments": {
    "message": "custom_event",
    "data": {"type": "test", "value": 123}
  }
}
```

### 8.3 server_get_editor_version
獲取編輯器版本信息

**參數**: 無

**示例**:
```json
{
  "tool": "server_get_editor_version",
  "arguments": {}
}
```

### 8.4 server_get_project_name
獲取當前項目名稱

**參數**: 無

**示例**:
```json
{
  "tool": "server_get_project_name",
  "arguments": {}
}
```

### 8.5 server_get_project_path
獲取當前項目路徑

**參數**: 無

**示例**:
```json
{
  "tool": "server_get_project_path",
  "arguments": {}
}
```

### 8.6 server_get_project_uuid
獲取當前項目UUID

**參數**: 無

**示例**:
```json
{
  "tool": "server_get_project_uuid",
  "arguments": {}
}
```

### 8.7 server_restart_editor
請求重啟編輯器

**參數**: 無

**示例**:
```json
{
  "tool": "server_restart_editor",
  "arguments": {}
}
```

### 8.8 server_quit_editor
請求退出編輯器

**參數**: 無

**示例**:
```json
{
  "tool": "server_quit_editor",
  "arguments": {}
}
```

---

## 9. 廣播工具 (Broadcast Tools)

### 9.1 broadcast_get_broadcast_log
獲取最近的廣播消息日誌

**參數**:
- `limit` (number, 可選): 要返回的最新消息數量，默認為 50
- `messageType` (string, 可選): 按消息類型過濾

**示例**:
```json
{
  "tool": "broadcast_get_broadcast_log",
  "arguments": {
    "limit": 100,
    "messageType": "scene_change"
  }
}
```

### 9.2 broadcast_listen_broadcast
開始監聽特定廣播消息

**參數**:
- `messageType` (string, 必需): 要監聽的消息類型

**示例**:
```json
{
  "tool": "broadcast_listen_broadcast",
  "arguments": {
    "messageType": "node_created"
  }
}
```

### 9.3 broadcast_stop_listening
停止監聽特定廣播消息

**參數**:
- `messageType` (string, 必需): 要停止監聽的消息類型

**示例**:
```json
{
  "tool": "broadcast_stop_listening",
  "arguments": {
    "messageType": "node_created"
  }
}
```

### 9.4 broadcast_clear_broadcast_log
清除廣播消息日誌

**參數**: 無

**示例**:
```json
{
  "tool": "broadcast_clear_broadcast_log",
  "arguments": {}
}
```

### 9.5 broadcast_get_active_listeners
獲取活動廣播監聽器列表

**參數**: 無

**示例**:
```json
{
  "tool": "broadcast_get_active_listeners",
  "arguments": {}
}
```

---

## 使用須知

### 1. 工具調用格式

所有工具調用都使用 JSON-RPC 2.0 格式：

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "tool_name",
    "arguments": {
      // 工具參數
    }
  },
  "id": 1
}
```

### 2. 常見UUID獲取方法

- 使用 `node_get_all_nodes` 獲取所有節點UUID
- 使用 `node_find_node_by_name` 按名稱查找節點UUID
- 使用 `scene_get_current_scene` 獲取場景UUID
- 使用 `prefab_get_prefab_list` 獲取預製體信息

### 3. 資源路徑格式

Cocos Creator 使用 `db://` 前綴的資源URL格式：
- 場景：`db://assets/scenes/GameScene.scene`
- 預製體：`db://assets/prefabs/Player.prefab`
- 腳本：`db://assets/scripts/GameManager.ts`
- 紋理：`db://assets/textures/player.png`

### 4. 錯誤處理

如果工具調用失敗，會返回錯誤信息：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32000,
    "message": "Tool execution failed",
    "data": {
      "error": "詳細錯誤信息"
    }
  }
}
```

### 5. 最佳實踐

1. **先查詢再操作**：在修改節點或組件之前，先使用查詢工具獲取當前狀態
2. **使用UUID**：儘量使用UUID而不是名稱來引用節點和資源
3. **錯誤檢查**：始終檢查工具調用的返回值，確保操作成功
4. **資源管理**：在刪除或移動資源前，確保沒有其他地方引用它們
5. **性能考慮**：避免在循環中頻繁調用工具，考慮批量操作

---

## 技術支持

如果您在使用過程中遇到問題，可以：

1. 使用 `debug_get_console_logs` 查看詳細的錯誤日誌
2. 使用 `debug_validate_scene` 檢查場景是否有問題
3. 使用 `debug_get_editor_info` 獲取環境信息
4. 檢查 MCP 服務器的運行狀態和日誌

---

*此文檔基於 Cocos Creator MCP 服務器 v1.3.0 編寫，如有更新請參考最新版本文檔。*