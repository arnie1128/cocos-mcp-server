# funplay-cocos-mcp

- URL: https://github.com/FunplayAI/funplay-cocos-mcp
- Local clone: `D:/1_dev/cocos-mcp-references/funplay-cocos-mcp/`
- 作者：Funplay
- Protocol：MCP（**手刻 JSON-RPC dispatcher**，不用 SDK）

## 概述

67 個 tool，LOC 3,315——**架構同我們**（embedded extension）但 LOC 只
有我們 1/3。原因：(1) 不用 `@modelcontextprotocol/sdk`，手刻 JSON-RPC，
省去 SDK 抽象；(2) `execute_javascript` 統一 sandbox 把多數複合操作壓
進 1 個 tool；(3) 沒 zod / 沒 i18n / 沒上游遺產。

最 distinctive：**`[primary]` / `[compat]` / `[specialist]` 三層 tool
分層** —— 每個 tool description 顯式標 priority，引導 AI 優先用 primary。

## 採用清單

### 1. `execute_javascript` 統一 sandbox（→ v2.3.0 T-V23-1）

```js
// FunplayAI 的設計
[primary] execute_javascript(context: 'scene'|'editor', code, args)
[compat]  execute_scene_script    // 兼容性入口，prefer execute_javascript
[compat]  execute_editor_script   // 同上
[specialist] get_scene_info / inspect_node / ... 64 個 specialist tool
```

每個 specialist tool description 帶：

```
[specialist] Return a structured summary of the active Cocos scene.
Prefer execute_javascript for multi-step inspection or mutation;
use this when you specifically want a compact scene snapshot.
```

**移植策略**：v2.3.0 升級既有 `debug_execute_script` → `execute_javascript`，
加 `context: 'scene'|'editor'` 參數，160 個既有 tool description 補
`[specialist]` 提示。1-2 天。

### 2. `prompts/*` capability 4 個 template（→ v2.5.0 T-P3-2）

`lib/prompts.js`（66 行）—— 4 個 template，每個帶 project context
（projectName / projectPath）baked in：

- `fix_script_errors`
- `create_playable_prototype`
- `scene_validation`
- `auto_wire_scene`

每個內文都引導 AI 優先用 `execute_javascript`，再走 specialist。

**移植策略**：v2.5.0 同梱。寫 `source/prompts/registry.ts`，配 mcp-server-sdk
register `prompts/list` + `prompts/get` handler。1 天。

### 3. Declarative tool definition 寫法（→ v2.4.0 step 1）

```js
{
    name: 'set_component_property',
    profile: 'full',
    description: '...',
    inputSchema: createSchema({ ... }, ['propertyPath', 'valueJson']),
    handler: async (args) => { ... }
}
```

單一物件包含 name + description + inputSchema + handler，**比我們的
三層分離（schemas + meta + execute switch）乾淨**。新 tool 摩擦力降
50%。

**移植策略**：v2.4.0 step 1 機械式 migration 14 category。

## 採用評估後 pass

### 直接 hand-roll JSON-RPC dispatcher 取代 SDK

技術可行（FunplayAI server.js 436 行就把 MCP 協議實現完），但失：

- Schema validation（zod runtime check）
- Protocol version negotiation（自己手刻會跟著規格演進落後）
- structuredContent 自動成形

我們 P1 階段刻意 migrate 到 SDK 是為了「protocol 更新跟著 SDK 升即可」。
**現在反向 hand-roll 等於 P1 工作回退**。不收。

### `interaction-log` 持久化 tool-call history

`lib/interaction-log.js`（40 行）—— 把每個 tool call 存進 ring buffer，
透過 `cocos://mcp/interactions` resource 暴露。AI 可以查歷史 tool 操作。

**評估**：低價值，配合 T-P3-3 Notifications 一起做才有意義（client 端
沒 cache 行為時，AI 看歷史也只是看自己的 context）。**v2.7 spillover**。

### 桌面輸入自動化（`simulate_mouse_click` / `simulate_key_combo` 等）

`lib/input.js`（151 行）+ `lib/electron-tools.js`（281 行）—— 用
electron API 做 panel UI 自動化測試。AI 可以驅動 cocos editor UI（按按鈕
切 tab）做 e2e。

**評估**：niche。我們的目標是 AI 寫 cocos 內容，不是 AI 驗 cocos editor
本身。**不收**。

### `screenshots.js` 5 個 capture 變種

我們 v2.3.0 T-V23-2 採 harady 路線（`debug_screenshot` 簡化版），先做
editor / batch。FunplayAI 額外有 `capture_game_screenshot` /
`capture_preview_screenshot` 兩個 preview-side，**v2.3.0 第二批**或
v2.6.0 配 `debug_game_command` 一起做。

## 為什麼 LOC 是我們的 1/3 — 三點結構

### 1. 不用 SDK，手刻 JSON-RPC dispatcher（436 行）

`lib/server.js` if-else cascade：

```js
if (method === 'tools/list') { ... }
if (method === 'tools/call') { ... }
if (method === 'resources/read') { ... }
if (method === 'prompts/get') { ... }
```

vs 我們 mcp-server-sdk.ts ~500 行 + 走 SDK 提供的 transport / schema /
capability negotiation。

### 2. `execute_javascript` 統一 sandbox

1 個寬 tool 涵蓋 80% 用例，66 個 specialist 當補充。複合操作不再 wrap
多個 narrow tool，省下大量 wrapper code。

### 3. 沒 zod / 沒 i18n / 沒 tool-manager UI persistence

- inputSchema 直接 plain JSON Schema object inline（手寫 `{type,
  properties, required}`），沒 zod 轉換層
- 沒 cocos editor i18n 多語系貢獻
- panel 是輕量單檔，沒 tool-manager 配置持久化 UI
- 沒上游 1700 行 prefab JSON 包袱

## 為什麼不全盤抄

我們 10,912 LOC 大部分**有用**：

- zod schema 是 v2.1.5 五個 rich tool 能精準描述語義的根基
- landmine #11 nudgeEditorModel 仰賴精準 propertyPath 算術 + 嚴謹型別
- tool-manager UI persistence 是 user 顯式要求的功能（per-config 啟用設定）

砍掉這些換 LOC 不划算。**抄第 2 條（execute_javascript）就好**。

## Local clone 操作

```bash
git clone --depth 1 https://github.com/FunplayAI/funplay-cocos-mcp.git \
  D:/1_dev/cocos-mcp-references/funplay-cocos-mcp

# 看手刻 dispatcher
sed -n '300,400p' D:/1_dev/cocos-mcp-references/funplay-cocos-mcp/lib/server.js

# 看 execute_javascript impl
grep -A 20 "execute_javascript" \
  D:/1_dev/cocos-mcp-references/funplay-cocos-mcp/lib/tool-registry.js | head -30
```
