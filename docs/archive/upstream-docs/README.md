# Cocos Creator MCP 服務器插件

**[📖 English](README.EN.md)**  **[📖 中文](README.md)**

一個適用於 Cocos Creator 3.8+ 的綜合性 MCP（模型上下文協議）服務器插件，使 AI 助手能夠通過標準化協議與 Cocos Creator 編輯器進行交互。一鍵安裝和使用，省去所有繁瑣環境和配置。已經測試過Claude客戶端Claude CLI和Cursor，其他的編輯器理論上也完美支持。

**🚀 現在提供 50 個強力融合工具，實現99%的編輯器控制！**

## 視頻演示和教學

[<img width="503" height="351" alt="image" src="https://github.com/user-attachments/assets/f186ce14-9ffc-4a29-8761-48bdd7c1ea16" />](https://www.bilibili.com/video/BV1mB8dzfEw8?spm_id_from=333.788.recommend_more_video.0&vd_source=6b1ff659dd5f04a92cc6d14061e8bb92)


##快速鏈接

- **[📖 Complete Feature Guide (English)](FEATURE_GUIDE_EN.md)** - Detailed documentation for all 158 tools（待補充）
- **[📖 完整功能指南 (中文)](FEATURE_GUIDE_CN.md)** - 所有158工具的詳細文檔（待補充）


## 更新日誌

## 🚀 重大更新 v1.5.0（2024年7月29日）（已經在cocos 商城更新，github版本將在下個版本同步更新）

cocos store：https://store.cocos.com/app/detail/7941

- **工具精簡與重構**：將原有150+工具濃縮規整為50個高複用、高覆蓋率的核心工具，去除所有無效冗餘代碼，極大提升易用性和可維護性。
- **操作碼統一**：所有工具均採用“操作碼+參數”模式，極大簡化AI調用流程，提升AI調用成功率，減少AI調用次數，降低50% token消耗。
- **預製體功能全面升級**：徹底修復和完善預製體的創建、實例化、同步、引用等所有核心功能，支持複雜引用關係，100%對齊官方格式。
- **事件綁定與老功能補全**：補充並實現了事件綁定、節點/組件/資源等老功能，所有方法與官方實現完全對齊。
- **接口優化**：所有接口參數更清晰，文檔更完善，AI更容易理解和調用。
- **插件面板優化**：面板UI更簡潔，操作更直觀。
- **性能與兼容性提升**：整體架構更高效，兼容Cocos Creator 3.8.6及以上所有版本。


## 工具體系與操作碼

- 所有工具均以“類別_操作”命名，參數採用統一Schema，支持多操作碼（action）切換，極大提升靈活性和可擴展性。
- 50個核心工具涵蓋場景、節點、組件、預製體、資源、項目、調試、偏好設置、服務器、消息廣播等全部編輯器操作。
- 工具調用示例：

```json
{
  "tool": "node_lifecycle",
  "arguments": {
    "action": "create",
    "name": "MyNode",
    "parentUuid": "parent-uuid",
    "nodeType": "2DNode"
  }
}
```

---

## 主要功能類別（部分示例）

- **scene_management**：場景管理（獲取/打開/保存/新建/關閉場景）
- **node_query / node_lifecycle / node_transform**：節點查詢、創建、刪除、屬性變更
- **component_manage / component_script / component_query**：組件增刪、腳本掛載、組件信息
- **prefab_browse / prefab_lifecycle / prefab_instance**：預製體瀏覽、創建、實例化、同步
- **asset_manage / asset_analyze**：資源導入、刪除、依賴分析
- **project_manage / project_build_system**：項目運行、構建、配置信息
- **debug_console / debug_logs**：控制台與日誌管理
- **preferences_manage**：偏好設置
- **server_info**：服務器信息
- **broadcast_message**：消息廣播


### v1.4.0 - 2025年7月26日（當前github版本）

#### 🎯 重大功能修復
- **完全修復預製體創建功能**: 徹底解決了預製體創建時組件/節點/資源類型引用丟失的問題
- **正確的引用處理**: 實現了與手動創建預製體完全一致的引用格式
  - **內部引用**: 預製體內部的節點和組件引用正確轉換為 `{"__id__": x}` 格式
  - **外部引用**: 預製體外部的節點和組件引用正確設置為 `null`
  - **資源引用**: 預製體、紋理、精靈幀等資源引用完整保留UUID格式
- **組件/腳本移除API規範化**: 現在移除組件/腳本時，必須傳入組件的cid（type字段），不能用腳本名或類名。AI和用戶應先用getComponents獲取type字段（cid），再傳給removeComponent。這樣能100%準確移除所有類型組件和腳本，兼容所有Cocos Creator版本。

#### 🔧 核心改進
- **索引順序優化**: 調整預製體對象創建順序，確保與Cocos Creator標準格式一致
- **組件類型支持**: 擴展組件引用檢測，支持所有cc.開頭的組件類型（Label、Button、Sprite等）
- **UUID映射機制**: 完善內部UUID到索引的映射系統，確保引用關係正確建立
- **屬性格式標準化**: 修復組件屬性順序和格式，消除引擎解析錯誤

#### 🐛 錯誤修復
- **修復預製體導入錯誤**: 解決 `Cannot read properties of undefined (reading '_name')` 錯誤
- **修復引擎兼容性**: 解決 `placeHolder.initDefault is not a function` 錯誤
- **修復屬性覆蓋**: 防止 `_objFlags` 等關鍵屬性被組件數據覆蓋
- **修復引用丟失**: 確保所有類型的引用都能正確保存和加載

#### 📈 功能增強
- **完整組件屬性保留**: 包括私有屬性（如_group、_density等）在內的所有組件屬性
- **子節點結構支持**: 正確處理預製體的層級結構和子節點關係
- **變換屬性處理**: 保留節點的位置、旋轉、縮放和層級信息
- **調試信息優化**: 添加詳細的引用處理日誌，便於問題追蹤

#### 💡 技術突破
- **引用類型識別**: 智能區分內部引用和外部引用，避免無效引用
- **格式兼容性**: 生成的預製體與手動創建的預製體格式100%兼容
- **引擎集成**: 預製體可以正常掛載到場景中，無任何運行時錯誤
- **性能優化**: 優化預製體創建流程，提高大型預製體的處理效率

**🎉 現在預製體創建功能已完全可用，支持複雜的組件引用關係和完整的預製體結構！**

### v1.3.0 - 2024年7月25日

#### 🆕 新功能
- **集成工具管理面板**: 在主控制面板中直接添加了全面的工具管理功能
- **工具配置系統**: 實現了選擇性工具啟用/禁用，支持持久化配置
- **動態工具加載**: 增強了工具發現功能，能夠動態加載MCP服務器中的所有158個可用工具
- **實時工具狀態管理**: 添加了工具計數和狀態的實時更新，當單個工具切換時立即反映
- **配置持久化**: 在編輯器會話間自動保存和加載工具配置

#### 🔧 改進
- **統一面板界面**: 將工具管理合併到主MCP服務器面板作為標籤頁，消除了對單獨面板的需求
- **增強服務器設置**: 改進了服務器配置管理，具有更好的持久化和加載功能
- **Vue 3集成**: 升級到Vue 3 Composition API，提供更好的響應性和性能
- **更好的錯誤處理**: 添加了全面的錯誤處理，包含失敗操作的回滾機制
- **改進的UI/UX**: 增強了視覺設計，包含適當的分隔符、獨特的塊樣式和非透明模態背景

#### 🐛 錯誤修復
- **修復工具狀態持久化**: 解決了工具狀態在標籤頁切換或面板重新打開時重置的問題
- **修復配置加載**: 糾正了服務器設置加載問題和消息註冊問題
- **修復複選框交互**: 解決了複選框取消選中問題並改進了響應性
- **修復面板滾動**: 確保工具管理面板中的正確滾動功能
- **修復IPC通信**: 解決了前端和後端之間的各種IPC通信問題

#### 🏗️ 技術改進
- **簡化架構**: 移除了多配置複雜性，專注於單一配置管理
- **更好的類型安全**: 增強了TypeScript類型定義和接口
- **改進數據同步**: 前端UI狀態和後端工具管理器之間更好的同步
- **增強調試**: 添加了全面的日誌記錄和調試功能

#### 📊 統計信息
- **總工具數**: 從151個增加到158個工具
- **類別**: 13個工具類別，全面覆蓋
- **編輯器控制**: 實現98%的編輯器功能覆蓋

### v1.2.0 - 之前版本
- 初始發佈，包含151個工具
- 基本MCP服務器功能
- 場景、節點、組件和預製體操作
- 項目控制和調試工具



## 快速使用

**Claude cli配置：**

```
claude mcp add --transport http cocos-creator http://127.0.0.1:3000/mcp（使用你自己配置的端口號）
```

**Claude客戶端配置：**

```
{

  "mcpServers": {

		"cocos-creator": {

 		"type": "http",

		"url": "http://127.0.0.1:3000/mcp"

		 }

	  }

}
```

**Cursor或VS類MCP配置**

```
{

  "mcpServers": { 

   "cocos-creator": {
      "url": "http://localhost:3000/mcp"
   }
  }

}
```

## 功能特性

### 🎯 場景操作 (scene_*)
- **scene_management**: 場景管理 - 獲取當前場景、打開/保存/創建/關閉場景，支持場景列表查詢
- **scene_hierarchy**: 場景層級 - 獲取完整場景結構，支持組件信息包含
- **scene_execution_control**: 執行控制 - 執行組件方法、場景腳本、預製體同步

### 🎮 節點操作 (node_*)
- **node_query**: 節點查詢 - 按名稱/模式查找節點，獲取節點信息，檢測2D/3D類型
- **node_lifecycle**: 節點生命週期 - 創建/刪除節點，支持組件預裝、預製體實例化
- **node_transform**: 節點變換 - 修改節點名稱、位置、旋轉、縮放、可見性等屬性
- **node_hierarchy**: 節點層級 - 移動、複製、粘貼節點，支持層級結構操作
- **node_clipboard**: 節點剪貼板 - 複製/粘貼/剪切節點操作
- **node_property_management**: 屬性管理 - 重置節點屬性、組件屬性、變換屬性

### 🔧 組件操作 (component_*)
- **component_manage**: 組件管理 - 添加/刪除引擎組件（cc.Sprite、cc.Button等）
- **component_script**: 腳本組件 - 掛載/移除自定義腳本組件
- **component_query**: 組件查詢 - 獲取組件列表、詳細信息、可用組件類型
- **set_component_property**: 屬性設置 - 設置單個或多個組件屬性值

### 📦 預製體操作 (prefab_*)
- **prefab_browse**: 預製體瀏覽 - 列出預製體、查看信息、驗證文件
- **prefab_lifecycle**: 預製體生命週期 - 從節點創建預製體、刪除預製體
- **prefab_instance**: 預製體實例 - 實例化到場景、解除鏈接、應用更改、還原原始
- **prefab_edit**: 預製體編輯 - 進入/退出編輯模式、保存預製體、測試更改

### 🚀 項目控制 (project_*)
- **project_manage**: 項目管理 - 運行項目、構建項目、獲取項目信息和設置
- **project_build_system**: 構建系統 - 控制構建面板、檢查構建狀態、預覽服務器管理

### 🔍 調試工具 (debug_*)
- **debug_console**: 控制台管理 - 獲取/清空控制台日誌，支持過濾和限制
- **debug_logs**: 日誌分析 - 讀取/搜索/分析項目日誌文件，支持模式匹配
- **debug_system**: 系統調試 - 獲取編輯器信息、性能統計、環境信息

### 📁 資源管理 (asset_*)
- **asset_manage**: 資源管理 - 批量導入/刪除資源、保存元數據、生成URL
- **asset_analyze**: 資源分析 - 獲取依賴關係、導出資源清單
- **asset_system**: 資源系統 - 刷新資源、查詢資源數據庫狀態
- **asset_query**: 資源查詢 - 按類型/文件夾查詢資源、獲取詳細信息
- **asset_operations**: 資源操作 - 創建/複製/移動/刪除/保存/重新導入資源

### ⚙️ 偏好設置 (preferences_*)
- **preferences_manage**: 偏好管理 - 獲取/設置編輯器偏好設置
- **preferences_global**: 全局設置 - 管理全局配置和系統設置

### 🌐 服務器與廣播 (server_* / broadcast_*)
- **server_info**: 服務器信息 - 獲取服務器狀態、項目詳情、環境信息
- **broadcast_message**: 消息廣播 - 監聽和廣播自定義消息

### 🖼️ 參考圖片 (referenceImage_*)
- **reference_image_manage**: 參考圖片管理 - 添加/刪除/管理場景視圖中的參考圖片
- **reference_image_view**: 參考圖片視圖 - 控制參考圖片的顯示和編輯

### 🎨 場景視圖 (sceneView_*)
- **scene_view_control**: 場景視圖控制 - 控制Gizmo工具、座標系、視圖模式
- **scene_view_tools**: 場景視圖工具 - 管理場景視圖的各種工具和選項

### ✅ 驗證工具 (validation_*)
- **validation_scene**: 場景驗證 - 驗證場景完整性、檢查缺失資源
- **validation_asset**: 資源驗證 - 驗證資源引用、檢查資源完整性

### 🛠️ 工具管理
- **工具配置系統**: 選擇性啟用/禁用工具，支持多套配置
- **配置持久化**: 自動保存和加載工具配置
- **配置導入導出**: 支持工具配置的導入導出功能
- **實時狀態管理**: 工具狀態實時更新和同步

### 🚀 核心優勢
- **操作碼統一**: 所有工具採用"類別_操作"命名，參數Schema統一
- **高複用性**: 50個核心工具覆蓋99%編輯器功能
- **AI友好**: 參數清晰、文檔完善、調用簡單
- **性能優化**: 降低50% token消耗，提升AI調用成功率
- **完全兼容**: 與Cocos Creator官方API 100%對齊

## 安裝說明

### 1. 複製插件文件

將整個 `cocos-mcp-server` 文件夾複製到您的 Cocos Creator 項目的 `extensions` 目錄中，您也可以直接在擴展管理器中導入項目：

```
您的項目/
├── assets/
├── extensions/
│   └── cocos-mcp-server/          <- 將插件放在這裡
│       ├── source/
│       ├── dist/
│       ├── package.json
│       └── ...
├── settings/
└── ...
```

### 2. 安裝依賴

```bash
cd extensions/cocos-mcp-server
npm install
```

### 3. 構建插件

```bash
npm run build
```

### 4. 啟用插件

1. 重啟 Cocos Creator 或刷新擴展
2. 插件將出現在擴展菜單中
3. 點擊 `擴展 > Cocos MCP Server` 打開控制面板

## 使用方法

### 啟動服務器

1. 從 `擴展 > Cocos MCP Server` 打開 MCP 服務器面板
2. 配置設置：
   - **端口**: HTTP 服務器端口（默認：3000）
   - **自動啟動**: 編輯器啟動時自動啟動服務器
   - **調試日誌**: 啟用詳細日誌以便開發調試
   - **最大連接數**: 允許的最大併發連接數

3. 點擊"啟動服務器"開始接受連接

### 連接 AI 助手

服務器在 `http://localhost:3000/mcp`（或您配置的端口）上提供 HTTP 端點。

AI 助手可以使用 MCP 協議連接並訪問所有可用工具。


## 開發

### 項目結構
```
cocos-mcp-server/
├── source/                    # TypeScript 源文件
│   ├── main.ts               # 插件入口點
│   ├── mcp-server.ts         # MCP 服務器實現
│   ├── settings.ts           # 設置管理
│   ├── types/                # TypeScript 類型定義
│   ├── tools/                # 工具實現
│   │   ├── scene-tools.ts
│   │   ├── node-tools.ts
│   │   ├── component-tools.ts
│   │   ├── prefab-tools.ts
│   │   ├── project-tools.ts
│   │   ├── debug-tools.ts
│   │   ├── preferences-tools.ts
│   │   ├── server-tools.ts
│   │   ├── broadcast-tools.ts
│   │   ├── scene-advanced-tools.ts (已整合到 node-tools.ts 和 scene-tools.ts)
│   │   ├── scene-view-tools.ts
│   │   ├── reference-image-tools.ts
│   │   └── asset-advanced-tools.ts
│   ├── panels/               # UI 面板實現
│   └── test/                 # 測試文件
├── dist/                     # 編譯後的 JavaScript 輸出
├── static/                   # 靜態資源（圖標等）
├── i18n/                     # 國際化文件
├── package.json              # 插件配置
└── tsconfig.json             # TypeScript 配置
```

### 從源碼構建

```bash
# 安裝依賴
npm install

# 開發構建（監視模式）
npm run watch

# 生產構建
npm run build
```

### 添加新工具

1. 在 `source/tools/` 中創建新的工具類
2. 實現 `ToolExecutor` 接口
3. 將工具添加到 `mcp-server.ts` 初始化中
4. 工具會自動通過 MCP 協議暴露

### TypeScript 支持

插件完全使用 TypeScript 編寫，具備：
- 啟用嚴格類型檢查
- 為所有 API 提供全面的類型定義
- 開發時的 IntelliSense 支持
- 自動編譯為 JavaScript

## 故障排除

### 常見問題

1. **服務器無法啟動**: 檢查端口可用性和防火牆設置
2. **工具不工作**: 確保場景已加載且 UUID 有效
3. **構建錯誤**: 運行 `npm run build` 檢查 TypeScript 錯誤
4. **連接問題**: 驗證 HTTP URL 和服務器狀態

### 調試模式

在插件面板中啟用調試日誌以獲取詳細的操作日誌。

### 使用調試工具

```json
{
  "tool": "debug_get_console_logs",
  "arguments": {"limit": 50, "filter": "error"}
}
```

```json
{
  "tool": "debug_validate_scene",
  "arguments": {"checkMissingAssets": true}
}
```

## 系統要求

- Cocos Creator 3.8.6 或更高版本
- Node.js（Cocos Creator 自帶）
- TypeScript（作為開發依賴安裝）

## 許可證

本插件供 Cocos Creator 項目使用,並且源代碼一併打包，可以用於學習和交流。沒有加密。可以支持你自己二次開發優化，任何本項目代碼或者衍生代碼均不能用於任何商用、轉售，如果需要商用，請聯繫本人。

## 聯繫我加入群
<img alt="image" src="https://github.com/user-attachments/assets/a276682c-4586-480c-90e5-6db132e89e0f" width="400" height="400" />


