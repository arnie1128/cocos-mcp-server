# Version plan v2.3.0 — v2.7.0

最後更新：2026-05-02

從 HANDOFF B-2 抽出的詳細規劃。HANDOFF 只留一行 summary、細項看這份。
本檔走「版本一段、細拆步驟」結構，動工時直接看對應段。

跨專案盤點依據：[`../research/cross-repo-survey.md`](../research/cross-repo-survey.md)。

## 路線圖總覽

| 版本 | 主題 | 估時 | bump | 狀態 |
|---|---|---|---|---|
| v2.3.0 | AI workflow 強化（execute_javascript + screenshot + docs markdown） | 2 天 | minor | ✅ done |
| v2.3.1 | 三方 review patch round 1 on v2.3.0（6 issues） | 0.5 天 | patch | ✅ done |
| v2.4.0 | 6-step 架構重構（含 InstanceReference + TS 定義生成 + decorator） | 4 天 | minor | ✅ done |
| v2.4.1 | 三方 review patch round 1 on v2.4.0（9 issues — 不是原計畫 Asset interpreters） | 0.5 天 | patch | ✅ done |
| v2.4.2 | 三方 review patch round 2 on v2.4.0（2 must-fix + 4 polish） | 0.3 天 | patch | ✅ done |
| **v2.4.3** | Asset interpreters 系統（**原計畫的 v2.4.1**；版號被 v2.4.0 review patch 吃掉所以後挪 2 號） | 2-3 天 | patch | ✅ done |
| v2.4.4 | 三方 review patch round 1 on v2.4.3（2 must-fix + 5 polish） | 0.5 天 | patch | ✅ done |
| v2.4.5 | 三方 review patch round 2 on v2.4.3（7 worth-considering） | 0.3 天 | patch | ✅ done |
| v2.4.6 | 三方 review patch round 3 on v2.4.3（1 must-fix + 1 polish） | 0.1 天 | patch | ✅ done |
| v2.4.7 | landmine #14（cocos cumulative dirty flag）+ live-test cleanup fix bump | 0.1 天 | patch | ✅ done |
| v2.4.8 | 收 v2.4.0 同梱失蹤的 4 件（TS diagnostics + animation + capture-scene-logs + capability flag） | 3 天 | patch | ✅ done |
| v2.4.9 | 三方 review patch round 1 on v2.4.8（2 must-fix + 4 polish） | 0.5 天 | patch | ✅ done |
| v2.4.10 | 三方 review patch round 2 on v2.4.9（1 must-fix + 2 polish — AsyncLocalStorage 收 capture interleave） | 0.3 天 | patch | ✅ done |
| v2.4.11 | 三方 review patch round 3 on v2.4.10（1 must-fix — refcount leak path） | 0.1 天 | patch | ✅ done |
| v2.4.12 | reload retest fix — Node 22+ Windows .cmd shim spawn EINVAL | 0.1 天 | patch | ✅ done |
| v2.5.0 | 多 client 廣度（file-editor + Notifications + Prompts） | 5 天 | minor | ✅ done |
| v2.5.1 | 三方 review patch round 1 on v2.5.0（4 must-fix + 5 polish） | 0.5 天 | patch | ✅ done |
| v2.6.0 | 跨 LLM 兼容 + runtime QA（Gemini-compat guard + debug_game_command + decodeUuid 兼容層） | 1.5 天（實際；估 4-5 天） | minor | ✅ done |
| v2.6.1 | 三方 review patch round 1 on v2.6.0（5 must-fix + 6 polish） | 0.5 天 | patch | ✅ done |
| v2.6.2 | 三方 review patch round 2 on v2.6.1（1 doc fix — landmine #15 stale tool count） | 0.05 天 | patch | ✅ done |
| **v2.7.0** | spillover buffer / 動工到一半發現的延伸項 | — | minor | ⏳ next |

> **版號順延說明**：原計畫 v2.4.1 = Asset interpreters，但 v2.4.0 的兩輪
> 三方 review patch 吃了 v2.4.1 + v2.4.2 兩個 slot，Asset interpreters
> 因此實際落地在 **v2.4.3**。v2.4.4–v2.4.7 是 v2.4.3 的後續 review +
> 文件 patch。v2.5.0 (file-editor + Notifications + Prompts) **名稱沒
> 順延**，仍是下一個 minor，只是時間軸上後了 6 個 patch number。

## v2.3.0 — AI workflow 強化

### T-V23-1 `execute_javascript` 統一 sandbox（FunplayAI 路線）

**動機**：AI 做「讀 → 改 → 驗」複合操作時，今天得打 3-5 個窄 tool。
一個寬 sandbox tool 讓 AI 在單一 turn 完成。

**做法**：

1. 升級既有 `debug_execute_script` → `execute_javascript`，加 `context:
   'scene'|'editor'` 參數
   - `context='scene'`：走既有的 `Editor.Message.request('scene',
     'execute-scene-script', ...)` 路徑（已 ship）
   - `context='editor'`：走 host-side eval（new；需 sandbox guard）
2. 既有 160 個 narrow tool **保留**，description 補一行
   `[specialist] Use when narrow primitive is clearly better than
    execute_javascript; otherwise prefer execute_javascript.`
3. `execute_javascript` description 標 `[primary] Default first tool ...`
4. 加單元測試：scene context / editor context 各跑一個 expression、
   一個多步腳本、一個故意錯誤；驗 sandbox 不會 leak

**風險**：editor context eval 有 prompt-injection 風險。建議：editor
context **預設關閉**，`settings.ts` 加 `enableEditorContextEval: false`
opt-in，panel UI 也加開關。

**估時**：1-2 天

### T-V23-2 screenshot 系列（harady 路線）

`debug_screenshot`：Electron `webContents.capturePage()` → PNG 存盤、
回傳路徑。
`debug_batch_screenshot`：多個 panel 一次抓。

FunplayAI 還有 `capture_game_screenshot` / `capture_preview_screenshot`
兩個 preview-side，**v2.6 配 `debug_game_command` 一起做**。

**估時**：0.5 天

### T-V23-3 docs markdown resources（cocos-cli 路線）

新增 3 個 `text/markdown` resource：

```
cocos://docs/landmines    text/markdown   from CLAUDE.md §Landmines
cocos://docs/tools        text/markdown   from docs/tools.md
cocos://docs/handoff      text/markdown   from docs/HANDOFF.md
```

讀檔時動態載入（不在 build time bake-in），保證 user 改 CLAUDE.md
後馬上反映。AI 卡關時可自助查 landmine 紀錄。

**估時**：0.5 天

## v2.4.0 — 6-step 架構重構

**目標**：把 cocos-code-mode 的關鍵 idea（InstanceReference + TS 定義
生成）移植進 MCP 路徑，同時清掉三層 ceremony。**不增加 tool 數**，但
AI 準確率 + 新增 tool 摩擦力都會大幅改善。

| 步驟 | 內容 | 估時 | 來源 / 動機 |
|---|---|---|---|
| 1 | 單檔三層分離（schemas + meta + execute switch）→ 單一 declarative array `[{name, description, inputSchema, handler}, ...]` | 0.5 天 | FunplayAI / Spaydo 寫法，新 tool 摩擦降 50% |
| 2 | 抽 `lib/resolve-node.ts`，所有寫類 tool 接受 `nodeUuid \| nodeName` 二選一 | 0.5 天 | harady AI-friendly fallback |
| 3 | 抽 `lib/batch-set.ts`，property 批量寫入單一 round-trip | 0.5 天 | harady batch mode |
| 4 | **InstanceReference `{id, type}` 模式** — 所有 tool 的 nodeUuid/componentUuid/assetUuid 改用 InstanceReference 物件，type 跟著傳。AI 不再在 context 裡丟失「這 UUID 是什麼東西」的資訊 | 1 天 | cocos-code-mode killer pattern |
| 5 | `@mcpTool` decorator（cocos-code-mode `@utcpTool` 風格、descriptor 直接捕獲、**不用 `reflect-metadata`**） | 0.5 天 | cocos-code-mode；比 cocos-cli `@tool` 簡 |
| 6 | **`inspectorGetInstanceDefinition` 等效 tool** — 從 cocos `query-node` dump 動態生成 TS 類別定義回給 AI | 1 天 | cocos-code-mode killer feature |

### 同梱小項（原計畫，**全數順延 → v2.4.8**）

> v2.4.0 commit 只落地 6-step + 4 inspector/setter tool，下列 4 件
> 同梱項當時未進。v2.4.7 cycle 結束時盤點發現失蹤，重排成獨立的
> v2.4.8 patch（見下方 §v2.4.8）。

- ~~harady `debug_wait_compile` + FunplayAI `run_script_diagnostics` /
  `get_script_diagnostic_context` —— TS diagnostics 系列（1.5 天）~~ → v2.4.8 A1
- ~~FunplayAI / Spaydo animation tools（`list_clips` / `play` / `stop` /
  `set_clip`）（1 天）~~ → v2.4.8 A2
- ~~RomaRogov `startCaptureSceneLogs` / `getCapturedSceneLogs` 模式整合
  進 `lib/scene-bridge.ts`（0.5 天）~~ → v2.4.8 A3
- ~~補 capabilities `resources.templates: true` 顯式宣告（0.1 天）~~ → v2.4.8 A4

**驗證 checklist**：

- [ ] 全部 160 tool migration 完、tsc clean
- [ ] smoke 12 條 + 新 InstanceReference round-trip + 新 TS 定義生成
      check 全綠
- [ ] live-test 跑一輪、原有 user-facing 行為對等
- [ ] measure script 跑出 token 量化（預期 inputSchema 可能略增，但
      InstanceReference 對 AI context 的可讀性提升能抵銷）

**風險**：重構 surface 大、回滾錨點留好（`git reset --hard <v2.3.0
release commit>`）。建議分多個 commit 推、每個 step 一個 commit，方便
按步回滾。

**估時**：4 天（6 step）+ 3 天（同梱）= 共 ~7 天，但同梱可拆出走 v2.4
patch 路線

## v2.4.3 — Asset interpreters 系統（原 v2.4.1）

> **版號順延**：原計畫此節為 v2.4.1，但 v2.4.0 三方 review 兩輪 patch
> 用掉 v2.4.1 + v2.4.2，本系統實際落地在 **v2.4.3**（commit
> `aa95e53`，2026-05-03）。後續再有 v2.4.4 / v2.4.5 / v2.4.6 三輪
> review patch + v2.4.7 doc patch。實機驗證見 v2.4.7 reload 後測試
> 紀錄（HANDOFF.md NEXT SESSION ENTRY POINT 之下）。

**目標**：填補 asset meta 編輯能力空白。

**動機**：`set_component_property` 只動 scene node。Cocos asset 自身的
import 設定（texture compression / FBX animation extraction / SpriteFrame
trim mode / Material baked properties）全在 `<asset>.meta` 的 userData
裡，目前 AI 改不到。「把所有 cc.Sprite 用到的 texture 改成 ASTC 6×6
壓縮」今天我們做不到。

**做法**：移植 RomaRogov-cocos-mcp `source/mcp/tools/asset-interpreters/`
架構：

1. 抽 `source/asset-interpreters/{interface.ts, base.ts, manager.ts}`
   - `IAssetInterpreter` / `AssetPropertiesDescription` / `PropertySetSpec`
     型別
   - `BaseAssetInterpreter` 提供 `getProperties` / `setProperties` /
     `convertPropertyValue` 默認實作（regex 驗證 path、save-asset-meta
     + refresh-asset）
   - `AssetInterpreterManager` 收集 interpreter map<importerType, ...>
2. 按需要 5-8 個 specialized interpreter（不必全 24 個都做）：
   - `ImageInterpreter` / `TextureInterpreter` / `SpriteFrameInterpreter`
     —— 紋理壓縮設定
   - `FbxInterpreter` —— animation extraction、material extraction
   - `MaterialInterpreter` —— effect baked properties
   - `EffectInterpreter` / `ParticleInterpreter` —— 看實機需求
3. 新增 3 個 MCP tool：
   - `assetGetProperties({reference: InstanceReference, includeTooltips?,
     useAdvancedInspection?})`
   - `assetSetProperties({reference: InstanceReference, properties:
     [{path, type, value}]})`
   - `assetListInterpreters()`（回傳支援的 importer types）
4. 整合 v2.4.0 的 InstanceReference 模式：
   `{id: assetUuid, type: 'asset:cc.ImageAsset'}` 對應 ImageInterpreter

**估時**：2-3 天

**為什麼不擠進 v2.4.0**：v2.4.0 是「重構 160 既有 tool」性質，v2.4.1
是「新增 feature」性質。混在一起風險集中度高、smoke / live-test 重跑
變兩次、回滾錨點不乾淨。拆 patch 推。

## v2.4.8 — 收 v2.4.0 同梱失蹤項（補欠款）

**動機**：v2.4.0 §同梱小項列了 4 件「不算進 6 step 但同版本進」的小
功能，但 v2.4.0 commit 只落地 6-step + 4 inspector tool，下列 4 件
同梱項當時未進。v2.4.7 cycle 結束時盤點發現失蹤，重排成獨立 patch。
等於「v2.4.0 的尾巴」。

**為什麼不直接收進 v2.5.0**：v2.5.0 是「多 client 廣度」（file-editor
+ Notifications + Prompts）minor bump，scope 已 5 天；把 v2.4.0 欠款
混進去會讓 v2.5.0 變成「補東西 + 加東西」混合包，三方 review 範圍變
雜。獨立 patch bump 乾淨。

### A1 — TS diagnostics 系列（harady + FunplayAI）

新增 3 個 tool：

- `debug_wait_compile({timeoutMs?})` — 阻塞到 cocos editor TS 編譯完成
  （`Editor.Message.request('builder', 'is-compiling')` 輪詢 + timeout）
- `debug_run_script_diagnostics({tsconfigPath?})` — `tsc --noEmit` 在
  cocos project 跑、parse output 成 `{file, line, column, code, message}`
  陣列回傳。binary 解析 `node_modules/.bin/tsc` → editor bundled tsc → npx fallback
- `debug_get_script_diagnostic_context({file, line, contextLines?})` —
  讀指定 file 對應 line 周邊 ±N 行，方便 AI 拿到錯誤 context

**為什麼**：AI 改完 .ts 不會搶在編譯前讀錯誤訊息；改完想自我修錯需要
runtime fetch diagnostics + source context。三件組合起來是「等編譯 →
拿錯誤 → 拿 context → 自我修錯」工作流。

**估時**：1.5 天

### A2 — Animation tools（FunplayAI / Spaydo）

新增 1 個 category（`animation`）/ 4 個 tool：

- `animation_list_clips({nodeUuid|nodeName})` — 列 cc.Animation 上的 clips
- `animation_play({nodeUuid|nodeName, clipName?})` — 播 clip（省略 = default）
- `animation_stop({nodeUuid|nodeName})` — 停
- `animation_set_clip({nodeUuid|nodeName, defaultClip?, playOnLoad?})` — 設 default + playOnLoad

走 v2.4.0 的 `defineTools` declarative 寫法 + `resolveOrToolError` nodeUuid/nodeName
fallback。Scene-script side methods 進 `source/scene.ts`。

**估時**：1 天

### A3 — Scene-script log capture（RomaRogov）

整合進 `source/lib/scene-bridge.ts`：

- 每個 `runSceneMethod` / `runSceneMethodAsToolResponse` 進入時 push 一個
  capture context；scene-script 端 monkey-patch `console.{log,warn,error}`
  把訊息推進 `_capturedLogs[]`
- tool 結束時 host fetch + clear，附在 tool result 的
  `data.capturedLogs: [{level, message, ts}]`
- 預設**開啟**（cost 低，AI 拿到 cocos console 訊息對 debug 很有用）；
  global toggle 由 settings `enableSceneLogCapture: true` 控制

**估時**：0.5 天

### A4 — Capability `resources.templates: true` 紀錄為 noop

**結論**：實作後發現 MCP spec 的 `ServerCapabilitiesSchema`
（`@modelcontextprotocol/sdk` types.d.ts:776–812）下 `resources` 物件
**只有 `subscribe` 與 `listChanged` 兩個 flag**。cocos-cli 的
`templates: true` 是 non-spec 字段，SDK 的 `z.core.$strip` 會靜默丟掉。

實際上 server 已經透過 register `ListResourceTemplatesRequestSchema`
handler（`mcp-server-sdk.ts:101`）支援 RFC 6570 URI template，client
透過 `resources/templates/list` 方法即能取得，**無需 capability flag**。

**動作**：在 `mcp-server-sdk.ts` capability 區塊補一段註解說明此事，
不寫非規格 flag。文件級修正 + 後續 reviewer 不會再誤把這當 missing
feature。

**估時**：0.1 天 → 實際 0.05 天（一段註解）

### 驗證 checklist

- [ ] tsc clean
- [ ] smoke (`scripts/smoke-mcp-sdk.js`) 全綠 + 新增 1 條 capability
      宣告 check
- [ ] tool count 170 (v2.4.3 baseline) + 3 (A1 進 debug category)
      + 4 (A2 新 animation category) = **177 tools / 17 categories**
- [ ] live-test 跑一輪、A2 / A1 兩個新 tool 至少 each one expression 過
- [ ] 三方 review 通過

**回滾錨點**：v2.4.7 release commit `acdfac1`。

**估時**：3 天（A1: 1.5 + A2: 1 + A3: 0.5 + A4: 0.1）

## v2.5.0 — 多 client 廣度

> **狀態**：⏳ in-progress（v2.4.12 reload-retest 後動工）。三個子任務的
> sub-task ID 為 T-V25-1（file-editor）/ T-V25-2（probe-broadcast 量測）/
> T-V25-3（Notifications 落地）/ T-V25-4（Prompts）。動工順序建議：
> T-V25-1 → T-V25-2 → T-V25-3 → T-V25-4，每個子任務一個 commit。

### T-V25-1 file-editor 4 tool（Spaydo 路線 + 補強）

```
insert_text   delete_lines   replace_text   query_text
```

對 Claude Code 用戶這 4 個 tool 重複（IDE 已有 Edit/Write），但對
Claude Desktop / Cline / Continue 必要——多 client 廣度策略。

Spaydo 沒做、我們必須補的兩件：

1. **path-safety guard**：解析路徑後檢查 `.startsWith(projectPath)`
   防止逃出專案
2. **asset-db refresh hook**：改完 `.ts` 後自動 trigger
   `Editor.Message.request('asset-db', 'refresh', url)`，否則 cocos
   editor 不會 reimport

對 Claude Code 用戶 description 標
`[claude-code-redundant] Use Edit/Write tool from your IDE if available.`

**估時**：1 天

### T-V25-2 + T-V25-3 — T-P3-3 Notifications

**前置**：T-P3-1 已落地（resources 才有東西可推 `list_changed`）。
**子任務拆分**：T-V25-2 = probe-broadcast 量測；T-V25-3 = 落地實作。

**做法骨架**：

1. 先寫 `scripts/probe-broadcast.js`：以 stub `Editor.Message` 偵聽
   `scene:change-node` / `scene:close` / `asset-db:asset-add` 等事件，
   記錄事件密度（拖節點 / 改屬性 / 存場景時各推幾下）
2. 設計 debounce / 合併規則：同一 URI 1 秒內最多一次
   `notifications/resources/updated`
3. server capability 補 `resources: { subscribe: true, listChanged: true }`
4. 在 `source/main.ts` `load()` 註冊 broadcast listener，`unload()`
   解除——避免 reload extension 時 leak
5. 透過 sdkServer.notification(...) 推送到所有活躍 session

**動工前必做**：probe-broadcast 那支 script 跑出實機數據，否則
debounce 策略只能猜。9 個 reference repo **沒有任何一家**實作
notifications/subscribe，我們是 first mover，沒有 anchor 可抄。

**估時**：3 天

### T-V25-4 — T-P3-2 Prompts capability（FunplayAI 路線）

抄 `lib/prompts.js` 4 個 template 的 pattern：每個 prompt 帶 project
context（projectName / projectPath）baked in，內文引導 AI 優先用
`execute_javascript` 再走 specialist。

4 個建議 template：
- `fix_script_errors`
- `create_playable_prototype`
- `scene_validation`
- `auto_wire_scene`

**估時**：1 天

## v2.6.0 — 跨 LLM 兼容 + runtime QA

### Gemini-compat schema patch（cocos-cli 路線）

**問題**：zod 預設轉 JSON Schema 用 `$ref` 引用 reused subschema
（例：vec3Schema / prefabPositionSchema / transformPositionSchema）。
Gemini parser 不接受 `$ref`，看到直接掛掉。Claude / OpenAI 接受。

**做法**：手動覆蓋 `tools/list` handler，把 zod 轉成 inline JSON Schema 7
（不產 `$ref`）。實作見 cocos-cli `mcp.middleware.ts:218`。

**何時做**：user 開始接 Gemini client（gemini-cli / Vertex AI / Cline
用 Gemini backend）才需要。

**估時**：0.5-1 天

### `debug_game_command` + GameDebugClient injection（harady 路線）

**最具野心的功能**。注一個 `GameDebugClient` 進 cocos preview process，
AI 透過 `debug_game_command(type, args)` 能：

- `screenshot` —— game canvas
- `state` —— dump GameDb（runtime 全局狀態）
- `navigate` —— 跳頁面
- `click` —— 點擊節點 by name
- `inspect` —— 取 runtime 節點訊息（UITransform sizes / Widget /
  Layout / position）

**這是 AI 自動 runtime QA 的大門**。今天我們只能改 editor 內容；
debug_game_command 後可以「跑遊戲、AI 自己玩、AI 自己截圖驗收」。

**前置評估**：

1. cocos preview process 的 IPC 介面 —— `Editor.Message.broadcast` 能
   否到 preview？或要透過 WebSocket 自接？
2. inject 點 —— preview 啟動時插一段 setup script
3. Reload extension 時 client 要不要 re-inject？
4. 多 preview window 場景

**同梱**：FunplayAI `capture_game_screenshot` / `capture_preview_screenshot`
（preview-side 截圖，跟 GameDebugClient 同層）

**估時**：3-4 天

## v2.7.0 — Spillover buffer

預留給 v2.3 — v2.6 動工到一半發現的延伸需求 + 評估後決定收的 lower-priority
項目：

候選清單（不保證全做、視 v2.6 結束時的進度）：

- RomaRogov macro-tool enum routing 模式（`undo_recording({op})` /
  `reference_image({op, ...})` / `gizmo({op, ...})` 等收斂）
- FunplayAI `interaction-log` 持久化 tool-call history
- harady `debug_record_start/stop` MediaRecorder
- cocos-code-mode 14 個 asset importer（asset 創建專屬流程，FBX/GLTF 等）
- harady `prefab_create_from_spec` / `prefab_create_and_replace` 高階 helper
- Spaydo `query_users` 找誰引用了某 asset
- `validate_*` 三件組折成 prompt template
- ~~decorator 全面捨棄 `reflect-metadata` 路線檢討~~ — closed at v2.7.0
  task #1 verification（2026-05-02）：v2.4.0 step 5 從未用
  `reflect-metadata`，`experimentalDecorators` 仍需保留（stage-2
  decorator 簽章），`emitDecoratorMetadata` 從未開。No-op cleanup.

## 路標保留（不在 v2.7 前的計畫內）

- T-P3-4 stdio transport（cocos editor 內跑 stdio 不自然，跳過）
- RomaRogov `generate-image-asset` AI 圖生（domain orthogonal，該放
  通用 image-gen MCP server）
- UTCP-only protocol switch（生態損失大、見
  [`../research/repos/cocos-code-mode.md`](../research/repos/cocos-code-mode.md)）
