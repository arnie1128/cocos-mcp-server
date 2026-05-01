# RomaRogov-cocos-mcp

- URL: https://github.com/RomaRogov/cocos-mcp
- Local clone: `D:/1_dev/cocos-mcp-references/RomaRogov-cocos-mcp/`
- 作者：Roman Rogov（同 cocos-code-mode 作者；此為**初代專案**，
  後來作者轉 UTCP 路線繼任）
- Protocol：MCP（`@modelcontextprotocol/sdk`）

## 概述

16 個 macro-tool（每個 tool 用 `operation: enum` 路由到多個動作），
LOC 9,194。架構同我們（embedded extension，call `Editor.Message`），
但**規模壓在 16 個 macro tool** 是 vs FunplayAI execute_javascript 之外的
另一條路：**enum-routed macro tools**。

## 採用清單（→ 排進 v2.4-v2.7）

### asset-interpreters 系統（最有價值）

填補我們完全沒有的能力 — **編輯 asset 的 `meta.userData`**。
今天 `set_component_property` 只動 scene node，但 cocos asset 自身的
import 設定（texture compression / FBX animation / SpriteFrame trim mode /
Material baked properties）全在 `<asset>.meta` 的 userData 裡，目前 AI
改不到。

`source/mcp/tools/asset-interpreters/`（24 檔，~1,500 LOC）：

- `interface.ts` —— `AssetPropertiesDescription` / `PropertySetSpec` /
  `PropertySetResult` / `IAssetInterpreter` 型別契約
- `base-interpreter.ts`（~250 行）—— 核心邏輯：
  - `getProperties(assetInfo, includeTooltips, useAdvancedInspection)`：
    遞迴遍歷 `meta.userData` + `meta.subMetas`，抽出
    `{type, value, tooltip, isArray, enumList}` 結構
  - `setProperties([{propertyPath, propertyType, propertyValue}])`：
    regex 驗證路徑（`/^userData\./` / `/^subMetas\./` /
    `/^platformSettings\./` 等）→ 修改 → `save-asset-meta` +
    `refresh-asset`
  - `convertPropertyValue()`：8 種型別 coercion（Boolean / Number /
    String / Integer / Float / Enum / cc.ValueType / cc.Object）
- `asset-interpreter-manager.ts` —— Map<importerType, IAssetInterpreter>
  registry，`registerInterpreter()` + `getInterpreter()` 查詢
- 21 個 specialized interpreter（`PrefabInterpreter` / `ImageInterpreter`
  / `FbxInterpreter` / `MaterialInterpreter` / `EffectInterpreter` /
  `ParticleInterpreter` 等）大多只 override `importerType` 字串
  （PrefabInterpreter 整支 5 行），少數會 override `setProperty` 做
  type-specific logic

**真實工作流範例**：「把所有 `cc.Sprite` 用到的 texture 都改成 ASTC 6×6
壓縮格式」——今天我們做不到。要 ImageInterpreter 改 `userData.compressType`
+ 各 platform setting。

**移植策略**：

- v2.6.0 或更早 —— 抽 `source/asset-interpreters/{base.ts, manager.ts}` +
  按需要的 5-8 個 specialized interpreter（不是全 21 個都要做）
- 新增 2-3 個 tool：
  - `assetGetProperties({uuid, includeTooltips?, useAdvancedInspection?})`
  - `assetSetProperties({uuid, properties: [{path, type, value}]})`
  - `assetListInterpreters()` （回傳支援的 importer types）
- 整合到 v2.4.0 的 InstanceReference 模式：
  `{id: assetUuid, type: 'asset:cc.ImageAsset'}` 對應 ImageInterpreter

### `startCaptureSceneLogs` / `getCapturedSceneLogs` 模式

每個 tool 進入時 `startCaptureSceneLogs`、退出時把 captured logs 附在
回應裡。**AI 看 tool result 同時看到 cocos editor 為這次操作吐出的
console 訊息**。

實作方式：scene-script 端 monkey-patch `console.log/warn/error`
push 進 `_capturedLogs[]`，host 端 tool handler 收尾時 fetch + clear。

**移植策略**：v2.4.0 同梱（與 `lib/scene-bridge.ts` 整合，所有走 bridge
的 tool 自動帶 captured logs）。0.5 天。

### `McpServerManager.decodeUuid()` UUID 兼容層

某種 UUID 編碼層，看到 `McpServerManager.decodeUuid(componentSpec.uuid)`
被反覆 call。沒看實作但暗示作者處理過 client UUID 兼容性 — Gemini
function calling 對 UUID dashes / 長度有限制。

**移植策略**：v2.6.0 接 Gemini-compat 時讀完整實作再決定要不要照抄。

### Macro-tool enum routing 模式（待評估）

`operate_current_scene` 用 `operation: "open" | "save" |
"inspect-hierarchy" | "get-properties" | "set-properties" |
"get-last-logs"` enum 路由。**比 FunplayAI execute_javascript（全 sandbox）
保守、比我們 160 個 narrow tool（全攤開）緊湊**——middle ground。

候選收斂目標（v2.7.0 評估）：

- `begin/end/cancel_undo_recording` 三件組 → 一個 `undo_recording({op})`
- `set_*_reference_image_*` 系列 12 個 → 一個 `reference_image({op, ...})`
- `query_gizmo_*` / `change_gizmo_*` → 一個 `gizmo({op, ...})`

**不急著做**——v2.4.0 declarative array 落地後才有乾淨的 base 來收。
而且 FunplayAI execute_javascript 已經有 catch-all 角色，macro routing
邊際效益要實機 token 量過才知道值不值得。

## 不採納

| 內容 | 不採納理由 |
|---|---|
| `generate-image-asset` AI 圖生 | domain orthogonal，該放通用 image-gen MCP server，不放 in-editor |
| 整支替代我們 | 我們 tool 廣度（160 vs 16）+ 已 ship resources，沒理由縮成 16 macro |

## 與 cocos-code-mode 的關係

同作者繼任。RomaRogov-cocos-mcp 是初代 MCP 路線，cocos-code-mode 是 UTCP
路線。作者主力應已轉 UTCP（cocos-code-mode commit 較新），但 asset-
interpreters 沒移植到 cocos-code-mode（cocos-code-mode 走 inspector 模式
而非 meta editor）。所以**這個專案在 asset-meta 編輯能力上反而比作者新
作更完整**——值得留作參考。

## Local clone 操作

```bash
# 重新 clone（如砍掉了）
git clone --depth 1 https://github.com/RomaRogov/cocos-mcp.git \
  D:/1_dev/cocos-mcp-references/RomaRogov-cocos-mcp

# 看 base interpreter
sed -n '1,100p' D:/1_dev/cocos-mcp-references/RomaRogov-cocos-mcp/source/mcp/tools/asset-interpreters/base-interpreter.ts
```
