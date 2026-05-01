# cocos-code-mode

- URL: https://github.com/RomaRogov/cocos-code-mode
- Local clone: `D:/1_dev/cocos-mcp-references/cocos-code-mode/`
- 作者：Roman Rogov（同 RomaRogov-cocos-mcp 作者；此為**繼任專案**，
  作者轉 UTCP 路線）
- Protocol：**UTCP**（Universal Tool Calling Protocol，`@utcp/sdk` +
  `@utcp/http`）—— 不是 MCP

## 概述

24 個 macro-tool，LOC 5,569，**Express + UTCP REST 端點 `/utcp`**。
最大特徵是 **Code Mode 執行模型**：AI 寫 JavaScript、由 UTCP Code Mode
runtime 在 sandbox 跑，多次 tool call 在 server 端 chain 而不是回到 LLM
context。Anthropic / Apple / Cloudflare 三家有 paper 提案這個執行模型。

## Tool 分類

```
asset-tools.ts:        6   assetGetTree / assetGetAtPath / assetCreate / assetImport / assetOperate / assetGetPreview
component-tools.ts:    4   nodeComponentsGet / nodeComponentAdd / nodeComponentRemove / nodeGetAvailableComponentTypes
editor-tools.ts:       3   editorOperate / editorGetLogs / editorGetScenePreview
get-properties:        2   inspectorGetInstanceProperties / inspectorGetSettingsProperties
scene-tools.ts:        5   nodeGetTree / nodeGetAtPath / nodeCreate / nodeCreatePrimitive / nodeOperate
set-properties:        2   inspectorSetInstanceProperties / inspectorSetSettingsProperties
typescript-defenition: 2   inspectorGetInstanceDefinition / inspectorGetSettingsDefinition
```

## 採用清單（→ 排進 v2.4.0 重構）

### 1. InstanceReference `{id, type}` 模式（killer pattern）

所有節點 / 組件 / asset handle 都是 `{id: string, type: string}` 物件，
不是裸 UUID。type 跟 id 一起傳，AI 不會在 context 裡丟失「這 UUID 是
什麼東西」的資訊。

```typescript
// 他們的寫法
const tree = CocosEditor.nodeGetTree({});
const cameraRef = tree.children[0].components[0];
// cameraRef = { id: "abc-123", type: "cc.Camera" }
const def = CocosEditor.inspectorGetInstanceDefinition({ reference: cameraRef });

// 我們現在的寫法（v2.2.0）
const tree = await tools.scene.execute('get_scene_hierarchy', {});
const componentUuid = tree.children[0].components[0].uuid;  // 裸 UUID，AI 要記住這是 Camera
const info = await tools.component.execute('get_component_info', {
    nodeUuid: tree.children[0].uuid,
    componentType: 'cc.Camera'  // 這裡 AI 又要重新指定一次
});
```

**移植策略**：v2.4.0 step 4。新增 `source/lib/instance-reference.ts`
定義 type，所有 tool input schema 把 `nodeUuid` / `componentUuid` /
`assetUuid` 改成 InstanceReference。配合 step 6 的 TS 定義生成，AI 看到
`def` 就知道 `cameraRef` 能用哪些 property。

### 2. `inspectorGetInstanceDefinition` 動態 TS 類別定義（killer feature）

從 cocos editor 即時 dump 屬性、組成 TS class 文字回給 AI。AI 改屬性
**前**先讀定義，避免猜屬性名。

```typescript
// AI 拿到的是真的 TypeScript：
export class Camera {
    /** Field of view */
    fov: number;
    near: number;
    far: number;
    targetTexture?: RenderTexture;
    // ...
}
```

實作 `source/utcp/tools/typescript-defenition.ts`（300+ 行）：

- `processClass(className, providedProps)` —— 遞迴 walk Cocos
  IPropertyValueType dump，產生 TS class 字串
- 內建 `_commonTypesDefinition` 定義 Vec2/3/4 / Color / Rect / Quat /
  Mat3/4 / Gradient 等通用型別（不從 dump 推、直接寫死）
- 處理 `@property` decorator 提示（min / max / unit / tooltip）
- 處理 enum / 巢狀類別 hoisting

**移植策略**：v2.4.0 step 6。寫 `source/tools/typescript-definition-tool.ts`
新增 2 個 tool：

- `inspectorGetInstanceDefinition({reference: InstanceReference})`
- `inspectorGetCommonTypesDefinition()`（回傳 hardcoded common types）

不需照抄全部 300 行邏輯——先做基本 walk，特殊類型（Gradient 等）按需要
加。1 天。

### 3. `@utcpTool` decorator pattern

```typescript
export function utcpTool(name, description, inputs, outputs, httpMethod, tags) {
    return function (target, propertyKey, descriptor) {
        if (!descriptor) return;
        ToolRegistry.register({
            method: descriptor.value,
            target,
            tool: { name, description, inputs, outputs, ... }
        });
    };
}
```

**特點**：descriptor 直接捕獲，**不需 `reflect-metadata` polyfill**
（不像 cocos-cli 走 reflect 路線）。TS 5+ 內建支援，cocos editor build
pipeline 不需額外配置。

**移植策略**：v2.4.0 step 5。寫 `source/lib/decorators.ts` `@mcpTool`：

```typescript
export function mcpTool(opts: ToolDef) {
    return function (target, propertyKey, descriptor) {
        if (!descriptor) return;
        ToolRegistry.register({
            method: descriptor.value, target,
            tool: { name: opts.name, description: opts.description,
                    inputSchema: opts.inputSchema, ... }
        });
    };
}
```

對 14 個 category 機械式 migration，0.5 天。

## 不採納

### UTCP-only protocol switch

技術可行（5-7 天重寫），不建議：

1. **Claude Code 是主力 client，MCP-native**。換 UTCP 後 user 要另起
   UTCP Code Mode runtime + MCP-bridge 才能用，多一層裝設成本
2. **UTCP 規格仍在動**（utcp.io v1.x 持續迭代）。MCP 動量穩定，Anthropic
   主導
3. **80% Code Mode 效益可在 MCP 內取得**（execute_javascript per
   Anthropic「Code Execution with MCP」paper，2025）—— 我們 v2.3.0
   T-V23-1 就是這個方向
4. **重寫成本 5-7 天 ≈ v2.3 + v2.4 + v2.5 加總時間**，兌價不划算

「只追求成果」的條件式 yes：如果 user 個人 workflow 願意 always-on 跑
UTCP runtime 換極限 token 效率，那 UTCP-only 是對的。但意味著生態收窄。

長期觀察：UTCP 若哪天被 Claude Code/Desktop native 支援，重新評估
dual-protocol。今天 MCP 仍是唯一的廣度選擇。

### 整套 Asset importers（14+ 檔）

cocos-code-mode `source/utcp/utils/asset-importers/` 14 個專屬 importer
（FBX / GLTF / auto-atlas / prefab / material / particle 等）做 asset
**創建**而非 **meta 編輯**——跟 RomaRogov-cocos-mcp 的 asset-interpreters
不同層次。我們現有 `import_asset` + `create_asset` 已涵蓋基本場景；
特殊 importer 等 user 真要做（例：批量 FBX 設定）再按需要抽。

## Code Mode runtime 是什麼

執行模型，不是協議。詳見 `cross-repo-survey.md` §UTCP vs MCP 段落 +
對話紀錄 2026-05-02。

簡述：傳統 MCP 是「LLM 一次選一個 tool、client 打 server、結果回 LLM」
（每次 round-trip 都吃 context）。Code Mode 是「LLM 寫一段 JS function、
runtime 在 sandbox 跑、JS 內部多次 call tool、回 LLM 一個聚合結果」。

Anthropic 2025 paper「Code Execution with MCP」示範可在 MCP 上做（不必
換 UTCP）。我們 T-V23-1 `execute_javascript` 就是 MCP 上最小化的 Code
Mode。

## Local clone 操作

```bash
# clone
git clone --depth 1 https://github.com/RomaRogov/cocos-code-mode.git \
  D:/1_dev/cocos-mcp-references/cocos-code-mode

# 看 decorator
cat D:/1_dev/cocos-mcp-references/cocos-code-mode/source/utcp/decorators.ts

# 看 TS 定義生成
cat D:/1_dev/cocos-mcp-references/cocos-code-mode/source/utcp/tools/typescript-defenition.ts
```
