# Session Handoff

> 給下次接手的 session（含未來自己）。看完這份 + `docs/roadmap/README.md`
> 就能繼續做下去，不需要重看歷史對話。**本檔走 slim 路線——下一步該做
> 什麼留這、細拆規劃看 `docs/roadmap/06-version-plan-v23-v27.md`、
> 跨專案分析看 `docs/research/cross-repo-survey.md`。**

## 🚀 NEXT SESSION ENTRY POINT（2026-05-02 / v2.9.6 — v2.9.x cumulative review round-2 patch landed → round-3 三方 review pending）

**當下版本**：v2.9.6（v2.9.x cumulative review round-2 patch on top of v2.9.5）。**18 categories / 181 tools**。

**v2.8.x 收尾**（已 push origin/main）：v2.8.0 spillover（T-V28-1 CORS hoist + T-V28-2 resolveAutoCaptureFile + T-V28-3 debug_preview_control）→ v2.8.1 round-1 review patch → v2.8.2 reload-retest fix（cce.SceneFacadeManager + 相對 savePath）→ v2.8.3 embedded-mode capture 補完（T-V283-1/2/3）→ v2.8.4 browser-mode retest fix（landmine #16 廣域化 + mode-aware fallback hint）。

**v2.9.x cycle 進度**：
- v2.9.0 +2 tools：debug_check_editor_health / debug_set_preview_mode
- v2.9.1 setter live-test fix（4-strategy probe）+ landmines #16/#17 doc
- v2.9.2 polish batch（8 件 v2.8.1 deferred single-🟡）
- v2.9.3 macro-tool routing（12 referenceImage_* → 1 op-router）+ preview-tools park gates
- v2.9.4 MediaRecorder bridge（debug_record_start/stop + client template）
- v2.9.5 cumulative review round-1 patch：check_editor_health 改用 query-is-ready + query-node 雙探針 / persistGameRecording regex 修 codecs 逗號（attempt 1，後發現仍有 bug）/ MediaRecorder cleanup centralization + recordStop durationMs 修 / 32MB→64MB cap reconcile / isPathWithinRoot `..` 邊界 / referenceImage_manage `add` array 驗證 / HANDOFF 整理
- v2.9.6 cumulative review round-2 patch（本 cycle）：3-reviewer 🔴 共識 regex attempt 1 仍卡 codec 內逗號 → 改用 base64-alphabet 終止符；query-current-scene 是 unverified channel → 改用 typed query-node-tree；null UUID 偽健康防呆；SERVER_VERSION '2.8.0' → '2.9.0' 同步 minor base；record_stop schema 32MB stale 文字 → 64MB；recordStart _recState 賦值順序修

**未解 issues**（v2.10 對比參考專案後再動）：
- landmine #16 — preview_control(start) 觸發 cocos 3.8.7 softReloadScene race，editor 凍結需 Ctrl+R。tool 已加 acknowledgeFreezeRisk park gate。
- landmine #17 — set_preview_mode 4 strategies 全 silent no-op；setter 仍 ⚠ EXPERIMENTAL。

**下一個動工**：v2.9.6 commit + push → 三方 review round-3（驗證 round-2 fix）→ 視結果決定 ship-it / round-4 patch。

**v2.9.0 候選清單**（v2.8.x 完整 ship 後再動）：
- **PIE freeze 對比參考專案**（landmine #16）— 讀 harady / RomaRogov-cocos-mcp / cocos-cli / FunplayAI / Spaydo / cocos-code-mode 各家如何處理 `changePreviewPlayState` 或同等 PIE 啟動：是否有人繞過 `softReloadScene` race / 使用其他 channel / 加 retry-with-build-prebake 之類前置步驟。如果有就移植；沒有就把結論記回 landmine #16 收斂（「業界亦無解，認定為 cocos 3.8.7 內傷」）。0.5 天。
- **`debug_check_editor_health` / `debug_check_scene_alive`** — 平行 probe `device/query`（快、不走 scene）+ `scene/execute-scene-script`（凍結時會 hang），對 scene 設 1-2s timeout，timeout 即視為 scene 凍結 → 回 `{ alive: false, suggestion: 'press Ctrl+R in cocos editor' }`。給 AI 在執行 preview_control 後可以主動偵測。0.3 天。
- **`debug_set_preview_mode` setter** — 配對 v2.8.3 `debug_get_preview_mode`，透過 typed `preferences/set-config 'preview' '<key>' <value>` 切換 cocos 預覽模式，給 AI retest / debug 流程程序化 routing（browser↔embedded↔simulator）。需加 confirm gate / 自動 restore 避免擅改使用者偏好。0.3 天。
- `debug_record_start/stop` MediaRecorder（harady 路線；client 端已有
  部分 code 註解可移植）。1.5 天。
- RomaRogov macro-tool enum routing 模式（`undo_recording({op})` /
  `reference_image({op,...})` 等收斂）。1-2 天。
- 實機 reload-retest 跨 simulator 模式（v2.8.x retest 已覆蓋 embedded + browser，simulator 待補）。0.2 天。
- v2.8.1 single-reviewer 🟡 polish：
  - `assertSavePathWithinProject` 相對路徑：先 `path.resolve(Editor.Project.path, savePath)` 再 dirname，或直接 reject 非 absolute（Codex r2）。
  - `realRootNormalized + path.sep` 換成 `path.relative(root, candidate)` 不以 `..` 開頭，避免 drive-root false-reject（Codex r2）。
  - TOCTOU between realpath 與 writeFileSync — 改 `fs.openSync(filePath, 'wx')` 模式（Codex r1 + Gemini r1）。
  - `previewControlInFlight` 模組級 flag 防止雙重 PIE-start（Codex r1）。
  - `previewControl` 失敗分支補 `message` 與成功分支對稱（Claude r1）。
  - Vary: Origin 套到非 /game/* 分支讓 invariant 全檔一致（Claude r1）。
  - `package.json contributions.scene.methods` 對齊 — 把 `getAnimationClips` / `runWithCapture` 等遺漏方法一次補上（Gemini r2）。
  - `getScriptDiagnosticContext` 自帶 path-safety 收斂到 `assertSavePathWithinProject`（Gemini r2）。
  - `scene.ts` 註解 `cce.SceneFacade` vs `SceneFacadeManager` 用詞統一（Gemini r1）。
  共 0.3 天。

> ~~decorator 捨棄 `reflect-metadata`~~ — closed at v2.7.0 task #1
> verification（2026-05-02）：v2.4.0 step 5 採 descriptor-capture，
> 從未用 `Reflect.metadata`/`Reflect.getMetadata`，`emitDecoratorMetadata`
> 從未開、`reflect-metadata` 從未 install、source/ 全 grep 無
> `Reflect.*`。`experimentalDecorators` 仍需保留（stage-2 @mcpTool
> decorator 簽章靠它）。無清理動作要做。

**v2.6.0 → v2.6.2 階段**：
- **v2.6.0**：T-V26-Gemini-guard（`scripts/check-gemini-compat.js` —
  發現 zod 4 + draft-7 已自動 inline，無 patch 需要，純 regression
  guard + landmine #15）+ T-V26-1 debug_game_command + GameDebugClient
  bridge（HTTP polling queue 路線、harady 為 prior art —
  `source/lib/game-command-queue.ts` single-flight + claim + stale guard +
  `lastPollAt` liveness；`source/mcp-server-sdk.ts` 3 endpoint
  `/game/command` `/game/result` `/game/status` + `/health` 加
  `gameClient` block；`source/tools/debug-tools.ts` 加
  `debug_game_command` + `debug_game_client_status` 共 +2 tool；
  `client/cocos-mcp-client.ts` + `README.md` 範本給 user 落到 game
  source；`tsconfig.json` 加 `exclude:["client"]`；`scripts/smoke-mcp-sdk.js`
  加 4 條 step 15-18）+ T-V26-decodeUuid（`source/lib/uuid-compat.ts`
  base64 sub-asset UUID 兼容、應用在 `asset-meta-tools.ts resolveAssetInfo`）。
- **v2.6.1**：round 1 — 5 🔴（`consumePendingCommand` re-delivery race /
  `/game/result` body 無 size cap → DoS / screenshot base64 size 無 cap →
  disk fill / `decodeUuid` false-positive on base64-shaped strings /
  `persistGameScreenshot` symlink check 是 tautology）+ 6 ≥1-reviewer 🟡
  （payload `success:boolean` validate / awaiter cleanup gap on id mismatch /
  CLAUDE.md tool count stale 160 / `npm run check:gemini` + smoke scripts /
  client `takeScreenshot` skip inactive + row-flip subarray.set + ccclass
  fallback over constructor.name / `POLL_TIMESTAMP_FRESH_MS` 2s→5s /
  `releaseDate` 日期錯 / smoke full round-trip + 400-shape）。
- **v2.6.2**：round 2 — 1 ≥2-reviewer 🟡（CLAUDE.md landmine #15 仍寫
  "181 v2.6.0" → 改 "183 v2.6.1"，Gemini r2 升 🔴 + Codex r2 🟡）。
  Round 2 三方達成 🟢 ship-it（單方 🟡 4 條：symlink-check tautology 是
  comment overclaim、413-after-destroy silent no-op、`queued` 命名 post-
  claim cosmetic、b64 cap off-by-≤2-bytes meaningless — 全 deferred）。
- **Round 3** confirms ship-it from all three reviewers, no findings.

**v2.5.0 → v2.5.1 階段**：
- **v2.5.0**：T-V25-1 fileEditor 4 tools（path-safety realpathSync + asset-db
  refresh hook）+ T-V25-2 probe-broadcast.js（編輯器內 30s 事件密度量測）+
  T-V25-3 Notifications（resources.subscribe:true + broadcast-bridge 1s/URI
  debounce + per-session subscriptions）+ T-V25-4 Prompts（4 templates with
  baked project context）。
- **v2.5.1**：round 1 — 4 🔴（SERVER_VERSION '2.0.0' stale / sdkServer.notification
  unhandled rejection / prompts/get unknown returned success body /
  replace_text $1 backreferences silently broken）+ 5 ≥2-reviewer 🟡（empty
  search reject / regex DoS 1MB cap / CRLF preservation / realpathSync.native
  fallback / probe partial-cleanup）。
- **Round 2** confirms ship-it from all three reviewers, no must-fix.

**v2.4.8 — v2.4.12 階段**：
- **v2.4.8**：A1 TS diagnostics（debug_wait_compile + debug_run_script_diagnostics
  + debug_get_script_diagnostic_context）+ A2 animation tools 4 件 + A3
  scene-script log capture（runWithCapture / capturedLogs）+ A4 capability
  no-op clarification。Tool count 170 → **177**（+1 category, +7 tools）。
- **v2.4.9**：round 1 — 2 🔴（execAsync ENOENT silent, symlink escape）+
  4 🟡（concurrent capture leak, unbounded capture, animation
  component lookup metadata fragility, TSC regex completeness）。
- **v2.4.10**：round 2 — 1 🔴（Codex 升等：_topSlot() interleave still
  broken）+ 2 🟡（warnings-only ok=false, marker bytes uncounted）。Adopt
  AsyncLocalStorage for capture isolation。
- **v2.4.11**：round 3 — 1 🔴（_ensureConsoleHook outside try → refcount
  leak path）。單行 try-block 重排。
- **Round 4** confirms ship-it from all three reviewers, no must-fix.
- **v2.4.12**：reload-retest fix — Node 22+ Windows .cmd shim spawn
  EINVAL on `debug_run_script_diagnostics` → `shell:true` for .cmd/.bat
  + cmd.exe-style `quoteForCmd` + sync-throw try/catch in execAsync.
  POSIX path unchanged（`isWindowsShim` 雙閘）。

**最近 commit**（最新到舊，僅列 v2.5.0 cycle 後）：

| SHA | 內容 |
|---|---|
| `769151b` | fix(v2.8.1): three-way review patch round 1 on v2.8.0 — 4 must-fix + 2 polish |
| `ddb6c77` | release: v2.8.0 — spillover (CORS polish + realpath helper + debug_preview_control) |
| `c4a4dc8` | feat(v2.8.0 #3): debug_preview_control for programmatic PIE play/stop |
| `80d722f` | fix(v2.8.0 #2): realpath containment helper for all auto-named capture paths |
| `39c0b36` | fix(v2.8.0 #1): CORS hoist resolveGameCorsOrigin + Vary: Origin on deny branch |
| `e695a99` | docs(handoff): v2.7.x cycle wrap — round 3 three-way ship-it converged |
| `d1a868f` | fix(v2.7.3): codex round-2 re-attendance — 2 must-fix + 2 polish |
| `dd88952` | fix(v2.7.2): three-way review patch round 2 on v2.7.1 — doc accuracy |
| `39d044f` | fix(v2.7.1): three-way review patch round 1 on v2.7.0 — 4 must-fix + 4 polish |
| `5c67031` | release: v2.7.0 — preview-QA + security hardening (#4 capture_preview_screenshot) |
| `bfb305a` | feat(v2.7.0 #3): debug_preview_url + debug_query_devices |
| `9fcfe29` | feat(v2.7.0 #2): CORS scoping for /game/* endpoints (W7) |
| `0cf8abe` | docs(v2.7.0 #1): close 'drop reflect-metadata' verification — no-op |
| `0e085ef` | docs(handoff): v2.6.2 reload retest — 22 checks green end-to-end |
| `3f1bc2e` | docs(handoff): v2.6.x cycle wrap — round 3 three-way ship-it converged |
| `27e7716` | fix(v2.6.2): three-way review patch round 2 on v2.6.1 — 1 doc fix |
| `7614497` | fix(v2.6.1): three-way review patch round 1 on v2.6.0 — 5 must-fix + 6 polish |
| `4ce04cd` | release: v2.6.0 — cross-LLM compat + runtime QA |
| `1c2d9cb` | feat(v2.6.0): debug_game_command + GameDebugClient bridge (T-V26-1) |
| `e737a33` | docs(v2.6.0): T-V26-1 prior art — harady polling-queue route, ~1.5 day |
| `e0307f0` | feat(v2.6.0): gemini-compat smoke guard + landmine #15 |
| `1e828ba` | docs(handoff): wrap v2.5.x cycle — reload-retested, ready for v2.6.0 |
| `3aa83e1` | docs(handoff): v2.5.1 reload retest — all green end-to-end |
| `a6c0c9b` | docs(handoff): v2.5.0 → v2.5.1 wrap — 2-round three-way review converged 🟢 |
| `1aa1120` | fix(v2.5.1): three-way review patch round 1 on v2.5.0 — 4 must-fix + 5 polish |
| `543c06a` | release: v2.5.0 — multi-client breadth (file-editor + Notifications + Prompts) |
| `e56b22c` | feat(T-V25-4): Prompts T-P3-2 — 4 templates with project-context baking |
| `9534305` | feat(T-V25-3): Notifications T-P3-3 — wire cocos broadcasts → resources/updated |
| `5a6719b` | feat(T-V25-2): probe-broadcast.js script for broadcast event density sampling |
| `e324c30` | feat(T-V25-1): file-editor 4 tools — insert/delete/replace/query lines |
| `b090e4d` | docs: schedule v2.5.0 — file-editor + Notifications + Prompts (T-V25-1..4) |
| `185f98c` | docs(handoff): v2.4.11 → v2.4.12 reload retest results + cross-platform note |
| `acfb930` | fix(v2.4.12): A1 debug_run_script_diagnostics spawn EINVAL on Node 22+ Windows .cmd |
| `8bb46e8` | docs(handoff): v2.4.8-v2.4.11 wrap — 4-round three-way review converged 🟢 |
| `a5c7c0e` | fix(v2.4.11): three-way review patch round 3 on v2.4.10 — 1 must-fix |

**v2.4.0 / v2.4.1 / v2.4.2 階段**：v2.4.0 是 6-step 架構重構（無新 user-facing
行為），v2.4.1 + v2.4.2 是兩輪三方 review patch。v2.4.2 三方 🟢 ship-it 一致
通過。

**v2.4.3 / v2.4.4 / v2.4.5 / v2.4.6 階段**：v2.4.3 落地 asset-meta 編輯能力
（從 RomaRogov-cocos-mcp 移植 asset-interpreter 系統，新增 3 tool / 1 category），
v2.4.4 / v2.4.5 / v2.4.6 是三輪三方 review patch。v2.4.6 三方 🟢 ship-it 一致
通過。下一個 session 可以動工 v2.5.0（file-editor + Notifications + Prompts）
或先做實機 live-test 驗證 v2.4.3 asset-meta tool 在真 cocos editor 行為。

### v2.4.0 改動摘要

| 區 | 內容 |
|---|---|
| 新增檔（5 lib + 1 tool category）| `source/lib/define-tools.ts` / `resolve-node.ts` / `batch-set.ts` / `instance-reference.ts` / `decorators.ts`；`source/tools/inspector-tools.ts`（新 `inspector` category）|
| 新增 tool（4）| `node_set_node_properties` / `component_set_component_properties` / `inspector_get_instance_definition` / `inspector_get_common_types_definition` |
| Step 1 重構 | 14 個 tool 檔從三層（schemas/meta/switch）→ 單一 `ToolDef[]` 宣告陣列。新 helper `defineTools(defs)` + `defineTool({...})` |
| Step 2 helper | `resolveOrToolError({nodeUuid, nodeName})` — opt-in 4 個 high-traffic 寫類 tool |
| Step 3 helper | `batchSetProperties(uuid, [{path,value}])` — v2.4.1 改為 sequential await |
| Step 4 模式 | `InstanceReference {id, type?}` + `resolveReference({reference, nodeUuid, nodeName})` — 同 6 tool opt-in |
| Step 5 decorator | `@mcpTool({...})` + `defineToolsFromDecorators(this)` — 無 `reflect-metadata` |
| Step 6 inspector | 從 cocos `query-node` dump 動態生成 TS 類別宣告（含 cc.Vec2/3/4/Color/Rect/Size/Quat/Mat3/4 + InstanceReference<T>）|
| Tool 數 | 15 categories / **167 tools**（+1 cat / +4 tool） |
| Backward compat | 所有 v2.3.1 tool 可同樣 args 呼叫；6 個 opt-in tool 的 `nodeUuid`/`uuid` 從 required → optional（CHANGELOG v2.4.1 明列）|

### 三方 review 紀錄

走「主 commit + 三方 review + 反修 patch」流程。三輪 review，兩輪反修。

#### Round 1 — v2.4.0 commit `0231b10`

| # | Severity | 內容 | Reviewers |
|---|---|---|---|
| 1 | 🔴 must-fix | `batch-set` Promise.allSettled 並發 → 改 sequential，duplicate paths reject，overlap warn | Gemini + Codex + Claude |
| 2 | 🔴 must-fix | `resolveReference` 靜默用 reference.id 蓋掉衝突的 nodeUuid → 顯式 error；malformed reference 也報錯 | Codex + Claude |
| 3 | 🔴 must-fix | inspector 描述「node or component」但只查 node → narrow 到 node-only | Codex |
| 4 | 🟡 worth | inspector deny-list 太薄（uuid/_prefabInstance/etc 漏網）→ expand | Codex |
| 5 | 🟡 worth | `findNodeByNameDeep` 遞迴可能 stack overflow → iterative DFS | Gemini |
| 6 | 🟡 worth | inspector Enum/BitMask 寫死 `number` → emit hint comment | Gemini |
| 7 | 🟡 worth | inspector \\n / `*/` 注入；custom type name 沒 sanitize → 修 | Claude |
| 8 | 🟡 worth | `nodeReferenceShape` import 沒用 → 移除 | Claude |
| 9 | 🟡 worth | CHANGELOG 沒誠實說 nodeUuid required → optional → 補 note | Claude |

v2.4.1 commit `c39e1aa` 全部反修。

#### Round 2 — v2.4.1 commit `c39e1aa`

| # | Severity | 內容 | Reviewers |
|---|---|---|---|
| 1 | 🔴 must-fix | `sanitizeTsName` 沒擋 digit-leading / empty result → 加 `_` 前綴 / `_Unknown` fallback | Codex |
| 2 | 🔴 must-fix | `reference.type` 蓋掉 `dump.__type__` 拿來做 class name → dump 為主，mismatch 出 warning | Codex |
| 3 | 🟡 worth | `resolveReference` 沒對稱檢查 refId vs nodeName → 加上 | Claude |
| 4 | 🟡 worth | `enumCommentHint` 漏 userData fallback；first-value name fallback 誤導 → 修 | Codex + Claude |
| 5 | 🟡 worth | `COMPONENT_INTERNAL_KEYS` dead code → 移除 | Claude + Codex + Gemini |
| 6 | 🟡 worth | `node_set_node_properties` description 還說 concurrent → 改 sequential | Codex |
| 7 | 🟡 worth | inspector file JSDoc 還說 node-or-component → narrow | Codex |

> Gemini round-2 的兩個 🔴 是 false positive（gemini 只讀 diff 沒看完整檔案，把
> 已存在的 `sanitizeTsName(className)` 認成缺失）。

v2.4.2 commit `2b5c1f2` 全部反修。

#### Round 3 — v2.4.2 commit `2b5c1f2`

三方 🟢 ship-it 一致通過。Codex 留一個非阻擋 🟡：`dump.__type__ === ""` 時
`??` fallback 不 fall through 到 `dump.type`（v2.4.1 改 truthy → nullish 的副
作用）。實機若沒看到空字串 `__type__` 就不必處理，下次有 symptom 再補。

### v2.4.3 改動摘要

| 區 | 內容 |
|---|---|
| 新增檔（4）| `source/asset-interpreters/{interface, base, manager, specialized}.ts` — 移植 RomaRogov-cocos-mcp asset-interpreter 系統 |
| 新增 tool category | `assetMeta`（用 v2.4.0 step 5 的 `@mcpTool` decorator）|
| 新增 tool（3）| `assetMeta_list_interpreters` / `assetMeta_get_properties` / `assetMeta_set_properties` |
| 8 specialized interpreter | Image / Texture / SpriteFrame / Fbx / Material / Effect / Particle / Unknown(`*`) |
| 安全強化（v2.4.4）| `BaseAssetInterpreter.setProperty` 加 prototype-pollution guard（reject `__proto__`/`constructor`/`prototype`/empty segments）|
| 路徑驗證（v2.4.4）| 移除 `importer`/`importerVersion`/`sourceUuid`/`isGroup`/`folder` 從 writable allow-list（避免 AI 改壞 importer 觸發 re-import 失敗）|
| 數值嚴格性（v2.4.5/v2.4.6）| `convertPropertyValue` Number/Float/Integer 拒絕 `''` / `Infinity` / `'1.2.3'` / `'123foo'` 等 silent coercion |
| Material 編輯範圍 | v2.4.3 只支援 userData reads；effect/passes/技術切換需走 `debug_execute_javascript(context='scene')` 直接呼叫 `cce.SceneFacade.applyMaterial`（v2.5+ 再評估完整 port）|
| Tool 數 | 16 categories / **170 tools**（+1 cat / +3 tool）|

### 三方 review 紀錄（v2.4.3 cycle）

走「主 commit + 三方 review + 反修 patch」流程。**四輪 review，三輪反修**。

#### Round 1 — v2.4.3 commit `aa95e53`

| # | Severity | 內容 | Reviewers |
|---|---|---|---|
| 1 | 🔴 must-fix | `BaseAssetInterpreter.setProperty` prototype-pollution（`userData.__proto__.polluted` walk 進入 Object.prototype）| Gemini + Claude + Codex |
| 2 | 🔴 must-fix | `ImageInterpreter` 寫進 `Object.values(meta.subMetas)` 第一個，無視 `texture` vs `spriteFrame`（沉默寫錯子資產）| Gemini + Claude + Codex |
| 3 | 🟡 worth | `resolveAssetInfo` 缺 malformed-reference 檢查（mock v2.4.1/v2.4.2 修法）| Gemini + Claude |
| 4 | 🟡 worth | inspector deny-list 太薄（Gemini, codex round-1 v2.4.3 沒提；其實是 v2.4.0 codex round-1 已提）| Gemini |
| 5 | 🟡 worth | `importer`/`sourceUuid` 等不該在 writable allow-list | Claude |
| 6 | 🟡 worth | `Boolean('false') === true` 等 silent coercion bug | Codex |
| 7 | 🟡 worth | `useAdvancedInspection` schema 宣告但無實作 | Codex |
| 8 | 🟡 worth | tool 描述提到 `asset_*` 但實際 register 是 `assetMeta_*` | Codex |
| 9 | 🟡 worth | save-vs-refresh 失敗 conflated（refresh 失敗時不該把 success flip 成 failed）| Claude + Codex |

v2.4.4 commit `ba6e39e` 全部反修。

#### Round 2 — v2.4.4 commit `ba6e39e`

無 🔴。**7 個 🟡** worth-considering polish：

| # | Severity | 內容 | Reviewers |
|---|---|---|---|
| 1 | 🟡 worth | `PropertySetResult.warning?: string` 沒宣告，用 `(r as any).warning` cast | Claude + Codex |
| 2 | 🟡 worth | `parseFloat('1.2.3')` 太寬鬆，回 `1.2` | Gemini + Claude + Codex |
| 3 | 🟡 worth | `parseInt('123foo')` 太寬鬆，回 `123` | Codex |
| 4 | 🟡 worth | `ImageInterpreter` sub-meta 沒 fallback 到 key（image meta 常以 'texture'/'spriteFrame' 為 key）| Codex |
| 5 | 🟡 worth | 還有兩處 `asset_*` tool 名 string 漏改 | Codex |
| 6 | 🟡 worth | JSDoc 寫 `Object.create(null)` 但實作是 `{}` | Claude + Codex |
| 7 | 🟡 worth | unused `isPathSafe` import in specialized.ts | Claude |

v2.4.5 commit `c4a759d` 全部反修。

#### Round 3 — v2.4.5 commit `c4a759d`

| # | Severity | 內容 | Reviewers |
|---|---|---|---|
| 1 | 🔴 must-fix | `Number('')` 沉默 coerce 成 `0`（v2.4.5 換 parseFloat→Number 後的副作用）| Codex |
| 2 | 🟡 worth | `Number('Infinity')` 通過 `Number.isNaN` 檢查，cocos asset 不該接受無窮 | Codex |

v2.4.6 commit `ac0539f` 反修。

#### Round 4 — v2.4.6 commit `ac0539f`

三方 🟢 ship-it 一致通過。

### v2.4.7 改動摘要

| 區 | 內容 |
|---|---|
| live-test cleanup（commit `ebab029`，pre-bump） | (1) `paste.data.uuids` → `data.newUuids` 修讀錯導致的 orphan paste node；(2) prefab section 改用 `make.data.instanceNodeUuid` 抓真 instance UUID + 先刪 instance 再刪 asset，避免 `(Missing Node)`；(3) scene-switch 前 re-query dirty，dirty 就 skip 不觸發 cocos save-changes 彈窗 |
| **CLAUDE.md landmine #14** | cocos cumulative dirty flag 不可程式化清除：scene `query-dirty` 存在但無 `clear-dirty`/`discard`/`revert` channel；`scene-facade-interface.d.ts` 也只暴露 `querySceneDirty`。create+delete round-trip 仍 dirty。AI workflow「mutate scene → switch scene」會觸發 cocos save-changes modal 並 block IPC reply（同 landmine #12 pattern，不同 channel）|
| 為什麼 bump | source/ 沒改，但 `cocos_cs_349` plugin panel 要看到新版號才知道 reload 是否生效；user request 為「修正版本順延小版號 + reload 後實機驗證」 |
| Roadmap doc 同步 | `docs/roadmap/06-version-plan-v23-v27.md` 從 v2.4.1 改稱 v2.4.3 並補版號順延說明（commit `6e63bbd`） |

### v2.4.7 reload 後實機測試紀錄

**環境**：`D:/1_dev/cocos_cs/cocos_cs_349/extensions/cocos-mcp-server/` 已同步
v2.4.7（dist + package.json + CHANGELOG.md），Cocos Creator 開 cocos_cs_349
project + reload extension panel，`/health` 回 `tools: 170`。

| 測項 | 結果 |
|---|---|
| `inspector_get_common_types_definition` | ✅ 9 cc value types + InstanceReference<T> |
| `inspector_get_instance_definition` (Canvas) | ✅ TS class 正確 + Vec3 type + Enum hint 註解（v2.4.5 fix）+ `__comps__` 尾端註解 |
| `inspector` reference.type mismatch warning（v2.4.2 fix） | ✅ type='cc.Sprite' vs dump='cc.Node' → warning 正確出 |
| `node_set_node_properties` 3 props batch | ✅ name + active + position 順序寫入；read-back 對 |
| batch-set 重複 path reject | ✅ `duplicate path(s) in entries: name` |
| batch-set overlap warning | ✅ `position ⊃ position.x` warning + 仍寫成功 |
| `component_set_component_properties` | ✅ UITransform.contentSize + anchorPoint sequential |
| `set_component_property` reference={id,type} | ✅ |
| Conflict detection reference vs nodeUuid | ✅ `resolveReference: ... conflicts ...` |
| `nodeName` fallback | ✅ |
| Malformed reference (id missing) | ✅ zod schema 層先擋住（更早的防線） |
| Scene 收尾 | ✅ 4 root nodes，無 orphan |

**實機觀察**：
- inspector tooltip 還是 raw `i18n:scene.cc.Node.properties.position.tooltip` 字串
  （Editor.I18n.t() 沒 resolve）。base.ts 的 extractFromUserData 有解，但 inspector
  的 walker 沒有 — 下次 patch 可整合，但只是 nice-to-have。
- live-test 跑完 scene 仍 dirty（cocos cumulative tracking）。User 要點 Discard
  或 save 才能切回乾淨狀態。Landmine #14 已記錄此為 cocos 限制。

### v2.8.4 reload 後實機測試紀錄

**環境**：cocos editor 3.8.7 切到 browser 模式（`preview.current.platform = "browser"`）後跑 v2.8.4 dist。

| # | 測項 | 結果 |
|---|---|---|
| 1 | `/health` 188 tools；`serverInfo.version: "2.8.0"`（SDK 常數追 minor base，policy 確立於 v2.8.1） | ✅ |
| 2 | `debug_get_preview_mode` → `interpreted: "browser"`, `interpretedFromKey: "preview.current.platform=browser"` | ✅ |
| 3 | `debug_preview_url(action="open")` → 啟動瀏覽器到 `http://192.168.2.4:7456` | ✅ |
| 4 | `debug_preview_control(start)` 在 browser 模式 → success **但仍踩 `Failed to refresh the current scene` race**（與 embedded 模式 v2.8.3 retest 行為完全一致），cocos editor 凍結需 Ctrl+R | ❌ cocos engine bug |
| 5 | `debug_capture_preview_screenshot{}` mode=auto → fallback 主編輯器，**hint 正確生成 browser-aware 文案**：「cocos preview is set to "browser" — actual preview content is in your external browser (NOT in this image)... use debug_game_command via GameDebugClient」 | ✅ |
| 6 | `debug_preview_control(stop)` → clean exit | ✅ |
| 7 | warning 文案改為「not gated by preview mode (verified in both embedded and browser modes)」+ 推薦 alternatives + Do NOT retry | ✅ |

**重大發現升級 landmine #16**：原 v2.8.3 認為 race 限 embedded 模式；v2.8.4 browser-mode retest 證實**race 不限 mode**，是 `changePreviewPlayState` → `softReloadScene` 內部 race，cocos 3.8.7 engine-wide bug。`.ccc` bundle code 內部問題、外部無法修。已記為 landmine #16（v2.8.4 改寫）+ tool description / warning 改為「not gated by preview mode」。

**v2.9.0 對策**（已加進候選清單最前面）：對比 6 個參考專案（harady / RomaRogov / cocos-cli / FunplayAI / Spaydo / cocos-code-mode）看是否有人繞過此 race；同時加 `debug_check_editor_health` / `debug_check_scene_alive` 工具讓 AI 偵測 scene-script 是否凍結（透過 device/query 快通道 + scene-script timeout 平行 probe）。

### v2.8.3 reload 後實機測試紀錄

**環境**：cocos editor 3.8.7、preview 設 `preview.current.platform =
"gameView"`（embedded 模式），project = `cocos_cs_349`。

| # | 測項 | 結果 |
|---|---|---|
| 1 | `/health` 188 tools | ✅ |
| 2 | `debug_get_preview_mode` 初版（heuristic miss `current.platform`）→ 回 `unknown` + 完整 raw dump | ⚠ 修 |
| 3 | `debug_capture_preview_screenshot{}` mode=auto → fallback embedded、截主編輯器 143KB png | ✅ |
| 4 | end-to-end save → preview_control(start) → capture(auto/embedded) → preview_control(stop) | ✅ |
| 5 | `preview_control(start)` warning 推到 `data.warnings[]` + ⚠ top-level message | ✅ |
| 6 | `debug_get_preview_mode` heuristic patch 後 → `interpreted: "embedded"`, `interpretedFromKey: "preview.current.platform=gameView"` | ✅ |

**重大發現（landmine #16 已記）**：v2.8.3 retest 中
`preview_control(start)` 在 embedded 模式真的會造成 cocos editor
freeze（spinning，需 Ctrl+R 復原）。從 project.log 抓到完整堆疊：

```
SceneFacadeManager.changePreviewPlayState
 → SceneFacadeFSM.issueCommand → PreviewSceneFacade.enter
  → PreviewSceneFacade.enterGameview → PreviewPlay.start
   → SceneFacadeManager.softReloadScene → THROWS
   → "Failed to refresh the current scene"
   → "[Scene] The json file of asset 1777714366991.18521454594443276
              is empty or missing"
```

placeholder 名稱 `Date.now()+'.'+Math.random()` 是 cocos 內部對 dirty
scene 做臨時序列化的 temp asset 命名格式，writer/reader race。**這是
cocos 3.8.7 自身 bug（`.ccc` bundle 內部）**，無法從外部修補。v2.8.3
做的是：landmine #16 完整記錄、`preview_control` description 標警告 +
推薦替代方案（`mode="embedded"` 在 EDIT 模式截圖、或 GameDebugClient
+ browser preview 路線）、warning hint 升級為「**不要重試**，PIE 沒真的
啟動，editor 可能凍結需 Ctrl+R」。

### v2.8.2 reload 後實機測試紀錄

**環境**：v2.8.2 同步到 `cocos_cs_349/extensions/cocos-mcp-server`，
cocos editor 3.8.7 reload 後 `/health` 回 `tools: 187`，`SERVER_VERSION
= '2.8.0'`（SDK 常數追 behavior 版本，patch 留在 minor base — 既定 policy）。
Active scene = `a-test`，project = `cocos_cs_349`，project root =
`D:\1_dev\cocos_cs\cocos_cs_349`。

| # | 測項 | 結果 |
|---|---|---|
| 1 | `/health` → `{tools:187}` | ✅ |
| 2 | `debug_preview_url(query)` → `http://192.168.2.4:7456` | ✅ |
| 3 | `debug_query_devices` → 20 個 device entry（iPhone/iPad/HUAWEI/小米/Sony 等） | ✅ |
| 4 | `debug_capture_preview_screenshot{}` 無 PIE → 失敗訊息引導開 preview，列出可見視窗 | ✅ |
| 5 | `debug_screenshot{}` auto-named → `<project>/temp/mcp-captures/screenshot-<ts>.png`，3652 bytes | ✅ |
| 6 | `debug_screenshot{savePath:"C:/Windows/Temp/x.png"}` → containment guard 擋下、訊息清楚 | ✅ |
| 7 | `debug_screenshot{savePath:"out.png"}` v2.8.1 → 解析到 host cwd（CocosDashboard） **🔴 v2.8.2 修** | ✅ retest |
| 8 | `debug_preview_control{op:"start"}` v2.8.1 → `cce.SceneFacade is not available` **🔴 v2.8.2 修** | ✅ retest |
| 9 | `debug_preview_control{op:"start"}` v2.8.2 → `success:true, requestedState:true` | ✅ |
| 10 | `debug_preview_control{op:"stop"}` → `success:true, requestedState:false` | ✅ |
| 11 | `debug_screenshot{savePath:"out.png"}` v2.8.2 → 寫到 `<project>/out.png` | ✅ |
| 12 | `debug_screenshot{savePath:"../escape.png"}` → 解析到 `D:\1_dev\cocos_cs`、guard 擋下 | ✅ |

**觀察 (非 tool bug)**：v2.8.2 retest 中 `preview_control(start)` 雖然
facade call 通過、無 exception，cocos 內部 capturedLogs 收到 "Failed
to refresh the current scene" 兩條 error，且 PIE 視窗（`Preview` 標題）
沒有出現。最可能解釋：cocos 預覽設置成 browser-only 模式（`debug_preview_url`
回的就是 `http://192.168.2.4:7456`），所以 `changePreviewPlayState`
雖然觸發 PreviewPlay state 改變，但 render destination 是 browser、
不是 Electron BrowserWindow，因此 `capture_preview_screenshot` 找不到
"Preview" 視窗。Tool 行為符合 typed facade 契約；視覺結果取決於 cocos
preview config，不算 tool 缺陷。v2.9.0 可加 `getPreviewMode` query
helper 區分 embedded vs browser 給 AI 用。

### v2.6.2 reload 後實機測試紀錄

**環境**：v2.6.2 已同步到 `cocos_cs_349/extensions/cocos-mcp-server`
（dist + package.json + CHANGELOG.md + 新 client/ 範本），Cocos Creator
reload 後 `/health` 回 `tools: 183`、`gameClient: {connected: false,
lastPollAt: null}`，`serverInfo.version: "2.6.2"`。Project = cocos_cs_349
v1.0.0、active scene = `a-test`（uuid b8131213-da3...）。

| 測項 | 結果 |
|---|---|
| `/health` 183 tools / 18 categories / gameClient block | ✅ |
| `serverInfo.version` = 2.6.2（v2.5.1 round-1 fix #1 仍有效） | ✅ |
| `capabilities.resources.subscribe: true` / `prompts.listChanged: false` | ✅ |
| **T-V26-1 game/* endpoints** `/game/status` idle 初始狀態 | ✅ `connected:false, lastPollAt:null, queued:false` |
| `/game/command` 空 poll → null + flips `lastPollAt` | ✅ poll 後 `connected:true` |
| `/game/result` no pending → 409 | ✅ `no command pending` |
| `/game/result` missing `success:boolean` → 400（v2.6.1 W2 fix） | ✅ shape error 訊息正確 |
| `/game/result` 非 JSON body → 400 | ✅ `Invalid JSON: Unexpected token...` |
| **T-V26-1 tools** `debug_game_client_status` | ✅ structuredContent 含 lastPollAt |
| `debug_game_command` 無 client 觸發 timeout（2s cap） | ✅ 2229ms close to cap，error msg 含 GameDebugClient 提示 |
| timeout 後 single-flight slot 釋放（v2.6.1 W3 fix） | ✅ `/game/status queued:false` |
| `debug_game_command` 完整 round-trip — simulated client poll + post inspect result | ✅ 1186ms，structuredContent 帶 type/name/active/layer/components |
| Drain 後 queue idle | ✅ `queued:false` |
| **T-V26-decodeUuid** raw uuid 走 `assetMeta_get_properties`（no-op） | ✅ importer=image，9 properties |
| 純 uuid 經 base64 → 不被 decode（v2.6.1 fix #4 false-positive 防護） | ✅ pass-through，到 query-asset-info 後 `Asset not found` 對 base64 字串 |
| `<uuid>@texture` 經 base64 → decode 後到 query-asset-info | ✅ error 訊息回傳 **decoded** form `c7655a0e-...@texture` 證明 decode 已執行 |
| **regression** `scene_get_current_scene` | ✅ 抓到 `a-test` |
| `assetMeta_list_interpreters` 8 importer types | ✅ `*, effect, fbx, image, material, particle, sprite-frame, texture` |
| `project_get_project_info` | ✅ `cocos_cs_349 / 1.0.0` |
| `project_get_assets folder=db://assets type=all` | ✅ 1279 items；types breakdown 正常 |
| `prompts/get fix_script_errors` 帶 baked project context | ✅ 1003 chars，含 `Target Cocos project` |
| `prompts/get` unknown name → JSON-RPC -32603（v2.5.1 round-1 fix #3） | ✅ `Unknown prompt: nope. Available: ...` |
| `resources/list` 9 static resources | ✅ scene/current, hierarchy, list, prefabs, project/info, assets, docs/{landmines,tools,handoff} |

**實機觀察**：
- GameDebugClient bridge 端到端 verified — host queue 收命令、外部
  client 透過 HTTP polling 領、執行、POST 結果，host 把 dataUrl 落
  到 capture dir 的完整 pipeline 都通；smoke step 20 驗 claim guard
  + 400/409 邊界，實機驗 round-trip latency + structuredContent shape。
- decodeUuid 實機驗證 v2.6.1 fix #4 兩個方向：(a) 不誤觸發（純 uuid
  base64 後不被 decode）(b) 真實使用（`<uuid>@<sub>` base64 後正確
  decode 到 query-asset-info）。Error message 回傳 decoded form 是
  最強證據——若 decodeUuid 沒跑，error 應是 base64 字串不是 UUID 形式。
- cocos-cs-349 ImageAsset 在 `query-asset-info` 不暴露 `@texture`/
  `@spriteFrame` sub-asset record（types breakdown 顯示 SpriteFrame
  679 個是獨立 asset，非 sub-meta）。這是 cocos asset-db 的 import
  策略而非 v2.6.x bug。decode 路徑本身 verified。
- 所有 v2.5.x / v2.4.x reload-tested tool 在 v2.6.2 仍綠（regression
  通過）。

### v2.5.1 reload 後實機測試紀錄

**環境**：v2.5.1 已同步到 `cocos_cs_349/extensions/cocos-mcp-server`，
Cocos Creator reload 後 `/health` 回 `tools: 181`，
`serverInfo.version: "2.5.1"`，`capabilities.resources.subscribe: true`，
`capabilities.prompts.listChanged: false`。

| 測項 | 結果 |
|---|---|
| `/health` 181 tools / 18 categories | ✅ |
| `serverInfo.version` = 2.5.1（round-1 fix #1 SERVER_VERSION） | ✅ |
| `capabilities.resources.subscribe` = true | ✅ |
| `capabilities.prompts.listChanged` = false | ✅ |
| **A4 Prompts** — `prompts/list` 4 templates | ✅ |
| **A4** `prompts/get fix_script_errors` 帶 baked project context（"Target Cocos project: cocos_cs_349 / Project path: D:\1_dev\cocos_cs\cocos_cs_349"） | ✅ |
| **A4** `prompts/get` unknown name → JSON-RPC -32603（round-1 fix #3）| ✅ `Unknown prompt: ... Available: fix_script_errors, ...` |
| **T-V25-1 fileEditor** `query_text` 偵測 `eol:CRLF` | ✅ |
| **T-V25-1** `insert_text` 寫入後實際 disk bytes 仍為 CRLF（round-1 fix #7）| ✅ `od -c` 確認 |
| **T-V25-1** empty search 在 zod 層 reject（round-1 fix #5） | ✅ `Invalid arguments: search: search must be non-empty` |
| **T-V25-1** regex backreference `$1` 展開（round-1 fix #4）| ✅ `(\w+) line` → `[first]/[second]/[third]` 3 replacements |
| **T-V25-1** regex DoS guard — 1.5 MB 檔在 regex mode reject（round-1 fix #6）| ✅ `regex mode refuses files > 1048576 bytes` |
| **T-V25-1** plain mode 5MB cap — 1.5MB query_text 通過 | ✅ |
| **T-V25-1** path-safety — 真存在的 outside-project 檔（C:/Windows/.../hosts）reject | ✅ `resolves outside the project root (symlink-aware check)` |
| **T-V25-1** delete_lines past EOF reject | ✅ `range 100-200 is past EOF (file has 6 lines)` |
| **T-V25-3 Notifications** subscribe `cocos://scene/hierarchy` → create_node → SSE delivery | ✅ 收到 `notifications/resources/updated` |
| **T-V25-3** delete_node 再次觸發 → 第二次 notification 約 1500ms 後到 | ✅ debounce 1s/URI 生效 |
| **T-V25-3** unsubscribe 後不再收 | ✅ |

**實機觀察**：
- Notifications subscribe 路徑端到端整通：cocos broadcast `scene:change-node`
  → broadcast-bridge addBroadcastListener → per-URI 1s debounce →
  notifyResourceUpdated → sdkServer.notification SSE 推送。對 AI 而言
  代表 scene 變更後不必再主動 poll。
- prompts/get 的 lazy `ProjectContext` 解析正確抓到當前 cocos_cs_349
  project name + path。Editor.Project.path 在 prompts/get 觸發時已 ready。
- A1/A2/A3/A4 + T-V25-1..4 reload 全綠，無新 landmine。

### v2.4.11 → v2.4.12 reload 後實機測試紀錄

**環境**：v2.4.11 reload 通過後跑 retest，A1 在 Node 22 Windows .cmd
路徑爆 spawn EINVAL，發 v2.4.12 patch（`acfb930`）後再 reload retest。

| 測項 | v2.4.11 結果 | v2.4.12 結果 |
|---|---|---|
| `/health` 177 tools / 17 categories | ✅ | ✅ |
| **A4** `resources/templates/list` 回 2 templates | ✅ | (unchanged) |
| **A3** `capturedLogs` 在 scene-bridge tool（prefab/animation）envelope 內 | ✅ | (unchanged) |
| **A2** animation_list_clips / play (no clip → friendly error) / stop | ✅ | (unchanged) |
| **A2** animation_set_clip {playOnLoad:true} 寫入 + read-back 持久化 | ✅ Landmine #11 scalar path | (unchanged) |
| **A2** nodeName fallback / 雙欄位 undefined reject | ✅ | (unchanged) |
| **A1** debug_run_script_diagnostics | 🔴 spawn EINVAL（Node 22 .cmd shim）| ✅ 88 structured diagnostics + severity + binary/tsconfig discovery 正確 |
| **A1** debug_wait_compile | 未測（依賴 A1 binary）| ✅ no log growth → graceful "no compile triggered" return |
| **A1** get_script_diagnostic_context — 真 project file | 未測 | ✅ 結構化 lines + targetLine + 路徑相對化 |
| **A1** get_script_diagnostic_context — cocos editor 外路徑 | 未測 | ✅ symlink-aware reject（"resolves outside the project root"）|
| **A1** get_script_diagnostic_context — `../` traversal | 未測 | ✅ ENOENT reject（`D:\etc\hosts` not found）|

**實機觀察**：
- Cocos editor 自帶的 `cocos_cs_349/tsconfig.json` 抓不到自家 `@types/jsb.d.ts` 的
  TypedArray，跑 tsc 會回 88 個 diagnostics（多半是 ambient TS class 定義錯）— 這是
  user project 自身的設定問題，不是 mcp tool bug。AI 看到 `success:false` +
  88 diagnostics 是預期行為。
- 跨平台：v2.4.12 fix 用 `process.platform === 'win32' && /\.(cmd|bat)$/i` 雙閘
  限定 Windows shim 路徑，macOS / Linux 走原本 shell:false + 直接 argv。POSIX
  argv 不經 shell parsing，spaces in paths 自然安全；quoteForCmd 不會被觸發。
  註解已寫進 `source/lib/ts-diagnostics.ts:execAsync`。

### v2.8.0 — v2.8.1 三方 review 紀錄（2 輪 / 1 反修）

走「主 commit + 三方 review + 反修 patch」流程。**2 輪 review，1 輪反修**。

#### Round 1 — v2.8.0 commit `ddb6c77`

| # | Severity | 內容 | Reviewers |
|---|---|---|---|
| 1 | 🔴 must-fix | `resolveAutoCaptureFile` containment check 為 tautological（`realpath(dir) === realpath(dirname(join(dir, basename)))` 兩邊都 collapse 到 `dir`，無法擋 `temp/mcp-captures` 自身為 symlink 逃出 project tree）→ 改錨定 `realpath(Editor.Project.path)` | Codex 🔴 + Claude 🟡 |
| 2 | 🔴 must-fix | `SERVER_VERSION = '2.7.3'` 漂移（package.json 已 2.8.0，但 MCP initialize 握手回報 SDK 常數）→ 同步 '2.8.0' | Codex 🔴 |
| 3 | 🔴 must-fix | `screenshot` / `capturePreviewScreenshot` / `batchScreenshot` 在 caller 提供 `savePath` / `savePathPrefix` 時繞過 containment guard（AI-generated 路徑可寫到任何地方）→ 新 helper `assertSavePathWithinProject` 同樣錨定 project root | Gemini 🔴 + Codex 🟡 |
| 4 | 🔴 must-fix | `changePreviewPlayState` 未在 `package.json` `contributions.scene.methods` 列出 | Gemini 🔴 |
| 5 | 🟡 worth | `req.headers.origin` 可為 `string[]`（Node http duplicate Origin），WHATWG URL 會 throw／mis-classify → `Array.isArray` 早 reject | Codex 🟡 + Gemini 🟡 |
| 6 | 🟡 worth | `HANDOFF.md` commit table `<v2.8.0>` placeholder 應補回真 SHA | Codex 🟡 |

Single-reviewer 🟡 deferred（v2.8.x → v2.9.0 spillover）：TOCTOU between
realpath check 和 writeFileSync（Codex + Gemini，但兩位都注明本地 dev
tool 風險很低）/ Vary header on non-game branches（Claude）/
previewControlInFlight 雙重 PIE-start guard（Codex）/ previewControl
失敗分支 message 缺失對稱（Claude）/ scene.ts 註解 cce.SceneFacade vs
SceneFacadeManager 用詞不一致（Gemini）。

v2.8.1 commit `769151b` 反修：4 🔴 + 2 🟡 全清。

#### Round 2 — v2.8.1 commit `769151b`

三方一致 🟢 ship-it。

| reviewer | 結果 | 細節 |
|---|---|---|
| Claude r2 | 🟢 ship-it | 6 件 round-1 fix 全部驗過、無 regression、CHANGELOG / HANDOFF / dist 一致；single-🟡 deferrals 重檢無新理由提升 |
| Codex r2 | 🟢 ship-it（無 🔴） | 提 2 件 single-🟡：(a) `assertSavePathWithinProject` 對相對路徑的 `path.dirname` 會回 `.`，後續驗證會踩到 host cwd 而非 project root；(b) `realRootNormalized + path.sep` 在 project root 為 drive root（`C:\`）時可能 false-reject。建議改用 `path.relative` |
| Gemini r2 | 🟢 ship-it | 提 2 件 single-🟡：(a) `package.json` `contributions.scene.methods` 雖補了 `changePreviewPlayState` 但 `getAnimationClips` / `runWithCapture` 等仍未列；(b) `getScriptDiagnosticContext` 自帶 path-safety 邏輯，可考慮收斂到新 helper |

無 🔴，無 ≥2-reviewer 🟡 重疊；所有 single-🟡 依「主 commit + 三方
review + 反修 patch」workflow 規則 deferred 至 v2.9.0 spillover。

### v2.7.0 — v2.7.3 三方 review 紀錄（3 輪 + 1 re-attendance）

走「主 commit + 三方 review + 反修 patch」流程。**3 輪 review，3 輪反修**；
其中 round-2 Codex 缺席（out-of-credits），re-attendance 後追加一輪修補。

#### Round 1 — v2.7.0 commit `5c67031`

| # | Severity | 內容 | Reviewers |
|---|---|---|---|
| 1 | 🔴 must-fix | `resolveGameCorsOrigin` JSDoc 說 no-Origin 回 sentinel `'null'`，但 code 回 `'*'` — 程式正確、註解錯 | Claude + Codex 🟡 |
| 2 | 🔴 must-fix | CHANGELOG #3 稱兩個新 tool 都走 "public Editor.Message channels"，但 `preview/query-preview-url` 在 `@types/protected/`、不算 public | Claude + Codex 🟡 + Gemini 🟡 三方 |
| 3 | 🔴 must-fix | smoke step 21 缺 OPTIONS preflight 403 + ACAO-absent assertion lock | Claude |
| 4 | 🔴 must-fix | IPv6 `[::1]` Node-version 漂移 — Node 22 帶括號、舊版可能裸 `::1` | Gemini 🔴 + Claude 🟡 |
| 5 | 🟡 worth | `capturePreviewScreenshot` substring `'Preview'` 默認對中文/locale cocos 主視窗（含 "Cocos Creator Preview"）會誤匹配；delegate 到 `screenshot()` → `pickWindow` 又把負濾除掉 | Claude + Codex |
| 6 | 🟡 worth | `previewUrl` `data.opened: true` 措辭誤導：`openExternal` 只保證 OS launcher 觸發、不代表 page 已 render | Codex + Gemini |
| 7 | 🟡 worth | `CLAUDE.md` 工具總數仍記 183、debug-tools.ts 仍 9（v2.7.0 後實為 186 / 17）| Codex |
| 8 | 🟡 worth | `HANDOFF.md` next entry blurb 仍說 183 tools | Codex |

v2.7.1 commit `39d044f` 反修：4 🔴 + 4 ≥2-reviewer 🟡 全清。

#### Round 2 — v2.7.1 commit `39d044f`

reviewer attendance：Gemini ✅ full / Claude partial（stream stalled）/
Codex 失敗 out-of-credits（resets 16:00）。

| # | Severity | 內容 | Reviewers |
|---|---|---|---|
| 1 | 🔴 must-fix | `CLAUDE.md:51` debug 17 → live 20（v2.7.1 patch 自己算錯，少了 v2.3.0 的 4 件 / net 3 件）| Gemini r2 |
| 2 | 🔴 must-fix | `CLAUDE.md:47` node 11 → live 12（drift）| Gemini r2 |
| 3 | 🔴 must-fix | `CLAUDE.md:48` component 10 → live 11（drift）| Gemini r2 |
| 4 | 🔴 must-fix | `CLAUDE.md` 架構地圖完全沒列 inspector / asset-meta / animation / file-editor 4 個檔案 | Gemini r2 |
| 5 | 🟡 worth | `HANDOFF.md:8` heading 仍說 "next: v2.7.0"（v2.7.0 已 ship）| Claude r2 partial |

v2.7.2 commit `dd88952` 反修：4 🔴 + 1 🟡（doc-only）。

#### Round 2 re-attendance — Codex 對 v2.7.2 commit `dd88952`

Codex credits 回後跑 `5c67031..dd88952` cumulative 補考，找出 v2.7.2 自己漏的：

| # | Severity | 內容 | Reviewers |
|---|---|---|---|
| 1 | 🔴 must-fix | `HANDOFF.md:10` body 仍說「當下版本：v2.7.1」（v2.7.2 patch 改了 heading 沒改 body）| Codex r2-redux |
| 2 | 🔴 must-fix | `HANDOFF.md:25-28` v2.8.0 candidates 仍列 `capture_preview_screenshot` / `debug_query_devices` / `debug_preview_url`（這 3 件在 v2.7.0 #3+#4 已落地）| Codex r2-redux |
| 3 | 🟡 worth | smoke step 21 no-Origin case 只驗 200，未鎖 `ACAO === '*'` | Codex r2-redux |
| 4 | 🟡 worth | `CLAUDE.md:51` v2.3.0 列 +4 但 `execute_script` 是 compat alias、實為淨 +3 | Codex r2-redux |

v2.7.3 commit `d1a868f` 反修：2 🔴 + 2 🟡 全清。

#### Round 3 — v2.7.3 commit `d1a868f`

三方一致 🟢 ship-it（Claude / Codex / Gemini 全 0 🔴 0 🟡）。

### v2.4.8 — v2.4.11 三方 review 紀錄（4 輪）

走「主 commit + 三方 review + 反修 patch」流程。**4 輪 review，3 輪反修**。

#### Round 1 — v2.4.8 commit `a953e6e`

| # | Severity | 內容 | Reviewers |
|---|---|---|---|
| 1 | 🔴 must-fix | `ts-diagnostics.ts` `execAsync` ENOENT/字串 error.code 被當 0 → 假 ok:true | Claude + Codex (+Gemini 🟡) |
| 2 | 🔴 must-fix | `debug-tools.ts:736` symlink 可逃出 project root | Codex |
| 3 | 🟡 worth | scene.ts 並發 capture cross-contamination | Claude + Codex |
| 4 | 🟡 worth | scene.ts 無上限 capture → memory 風險 | Claude + Codex |
| 5 | 🟡 worth | `queryAnimationSetTargets` 用 `constructor.name` 對 cc.Animation 不可靠 → `components.indexOf(anim)` | Claude + Codex |
| 6 | 🟡 worth | TSC regex 不全 — multi-line / warning / project-scope | Claude + Codex + Gemini |

v2.4.9 commit `15b6a8e` 全部反修。

#### Round 2 — v2.4.9 commit `15b6a8e`

| # | Severity | 內容 | Reviewers |
|---|---|---|---|
| 1 | 🔴 must-fix | scene.ts `_topSlot()` 仍對 interleaved async 誤歸屬（codex 升 🟡 → 🔴）→ 改用 AsyncLocalStorage | Codex 🔴 + Claude 🟡 + Gemini 🟡 |
| 2 | 🟡 worth | warnings-only run 仍 ok=false（severity-aware ok）| Claude + Codex + Gemini |
| 3 | 🟡 worth | truncation marker bytes 未計入 slot.bytes | Codex + Claude |

v2.4.10 commit `52bad57` 全部反修。

#### Round 3 — v2.4.10 commit `52bad57`

| # | Severity | 內容 | Reviewers |
|---|---|---|---|
| 1 | 🔴 must-fix | scene.ts `_activeSlotCount += 1` 在 try 外，`_ensureConsoleHook` throw → refcount 洩漏 | Codex 🔴 + Claude 🟡 + Gemini 🟡 |

v2.4.11 commit `a5c7c0e` 反修（單行重排 + comment）。

#### Round 4 — v2.4.11 commit `a5c7c0e`

三方 🟢 ship-it 一致通過。Gemini 留一個 comment 用詞精準度 🟡（「increment INSIDE the try」應為「_ensureConsoleHook INSIDE the try」），用 follow-up 文件 commit 清掉。

### 下一個動工

**選項 A（推薦）**：**v2.5.0 file-editor + Notifications + Prompts**（5 天）。
細拆見 [`docs/roadmap/06-version-plan-v23-v27.md` §v2.5.0](roadmap/06-version-plan-v23-v27.md)。
- file-editor 4 tool（Spaydo 路線 + path-safety guard + asset-db refresh hook）
- T-P3-3 Notifications（resources/updated subscribe；前置：先寫 probe-broadcast script 量實機事件密度）
- T-P3-2 Prompts capability（FunplayAI 路線，4 個 template）

**選項 B**：實機 live-test v2.4.8 新 tool — animation_*（需有 cc.Animation
clips 的測試 prefab）+ debug_run_script_diagnostics（在真 cocos project 跑
tsc）+ debug_wait_compile（改一個 .ts 觀察 packer-driver log 行為）+
capturedLogs 在 ToolResponse 真的有內容。Reload 後測。

**選項 C（live-test 補洞，平行可做）**：實機 live-test `assetMeta_*` 三個 tool 真正
set_properties path（v2.4.7 的 reload 測試只驗了 read + guard rejection；真正寫
image asset meta 沒測，因為會改 user 的真實檔案）。要 user 同意 + 指定可改的
disposable asset 才能跑。

**動工前讀**：

1. 本 §NEXT SESSION ENTRY POINT
2. CHANGELOG.md v2.4.3 / v2.4.4 / v2.4.5 / v2.4.6 區塊
3. CLAUDE.md §Landmines（**無新增 landmine** — v2.4.3 cycle 雖然踩過 prototype
   pollution 但 fix 是檔案層級保護，不算 cocos-specific quirk）
4. 對應選項的 docs/roadmap/06 段落

**回滾錨點**：
- v2.9.6 改動前（v2.9.5 round-1 patch 點）→ `git reset --hard e425aa7`
- v2.9.5 改動前（v2.9.4 release 點）→ `git reset --hard 3bf839f`
- v2.9.0 改動前（v2.8.4 release 點）→ `git reset --hard 843fe73`
- v2.8.4 改動前（v2.8.3 #5 landmine + sharper warning 點）→ `git reset --hard ce6825f`
- v2.8.3 改動前（v2.8.2 reload-retest doc 點）→ `git reset --hard 40ad5b7`
- v2.8.2 改動前（v2.8.1 release 點 + round-2 ship-it）→ `git reset --hard 03568fc`
- v2.8.1 改動前（v2.8.0 release 點）→ `git reset --hard ddb6c77`
- v2.8.0 改動前（v2.7.3 release 點 + 三方 ship-it round 3）→ `git reset --hard d1a868f`
- v2.7.3 改動前（v2.7.2 release 點）→ `git reset --hard dd88952`
- v2.7.2 改動前（v2.7.1 release 點）→ `git reset --hard 39d044f`
- v2.7.1 改動前（v2.7.0 release 點）→ `git reset --hard 5c67031`
- v2.7.0 改動前（v2.6.2 release 點 + 三方 ship-it round 3）→ `git reset --hard 27e7716`
- v2.6.2 改動前（v2.6.1 release 點 + 三方 ship-it round 2 part-A）→ `git reset --hard 7614497`
- v2.6.1 改動前（v2.6.0 release 點）→ `git reset --hard 4ce04cd`
- v2.6.0 改動前（v2.5.1 release 點 + reload-retested）→ `git reset --hard 1e828ba`
- v2.4.6 改動前（v2.4.5 release 點）→ `git reset --hard c4a759d`
- v2.5.1 改動前（v2.5.0 release 點）→ `git reset --hard 543c06a`
- v2.5.0 改動前（v2.4.12 release 點 + reload-retested）→ `git reset --hard 185f98c`
- v2.4.12 改動前（v2.4.11 release 點 + 三方 ship-it round 4）→ `git reset --hard 8bb46e8`
- v2.4.11 改動前（v2.4.10 release 點）→ `git reset --hard 52bad57`
- v2.4.10 改動前（v2.4.9 release 點 + 三方 ship-it round 2）→ `git reset --hard 15b6a8e`
- v2.4.9 改動前（v2.4.8 release 點）→ `git reset --hard a953e6e`
- v2.4.8 改動前（v2.4.7 release 點 + reload-tested）→ `git reset --hard acdfac1`
- v2.4.5 改動前（v2.4.4 release 點）→ `git reset --hard ba6e39e`
- v2.4.4 改動前（v2.4.3 release 點）→ `git reset --hard aa95e53`
- v2.4.3 全部改動前（v2.4.2 release 點）→ `git reset --hard 2b5c1f2`
- v2.4.2 改動前（v2.4.1 release 點）→ `git reset --hard c39e1aa`
- v2.4.1 改動前（v2.4.0 release 點）→ `git reset --hard 0231b10`
- v2.4.0 改動前（v2.3.1 release 點）→ `git reset --hard 351023b`

**動工建議**：v2.5.0 — v2.5.1 stack 已穩定（三方 2 輪、1 輪反修），下個
版本（v2.6.0 或 live-test）直接動工不需先驗證 v2.5.x；新功能落地後同樣走
主 commit + 三方 review + 反修流程。

### v2.5.0 → v2.5.1 三方 review 紀錄（2 輪）

走「主 commit + 三方 review + 反修 patch」流程。**2 輪 review，1 輪反修**。

#### Round 1 — v2.5.0 commit `543c06a`

| # | Severity | 內容 | Reviewers |
|---|---|---|---|
| 1 | 🔴 must-fix | mcp-server-sdk.ts SERVER_VERSION '2.0.0' 自 v2.0 起未更新 | Gemini |
| 2 | 🔴 must-fix | notifyResourceUpdated 未 await/catch sdkServer.notification → unhandled rejection | Codex (+ Claude 🟡) |
| 3 | 🔴 must-fix | prompts/get unknown name 回成功內容應拋 JSON-RPC error | Codex (+ Claude 🟡) |
| 4 | 🔴 must-fix | replace_text useRegex callback form 讓 $1/$&/etc backreferences 永遠不展開 | Codex |
| 5 | 🟡 worth | search 允許空字串：replaceAll 在每字元間插入 / first-only 插在 byte 0 | Claude + Codex |
| 6 | 🟡 worth | regex mode 無 size cap → catastrophic backtracking 風險 | Claude + Codex + Gemini |
| 7 | 🟡 worth | CRLF 寫入時被默默轉成 LF（Windows project silent corruption）| Claude |
| 8 | 🟡 worth | fs.realpathSync.native 不一定存在於 cocos 內建 Node | Codex |
| 9 | 🟡 worth | probe-broadcast.js partial registration 可能洩漏 listeners | Codex |

v2.5.1 commit `1aa1120` 全部反修。

#### Round 2 — v2.5.1 commit `1aa1120`

三方 🟢 ship-it 一致通過。Codex/Gemini/Claude 三方各有單人 🟡 觀察（output-size
bomb on zero-width regex / replacement-string EOL normalization /
realpathSync `as any` type narrowing），無 ≥2-reviewer 重疊也無 🔴，全
deferred 為觀察項。

---

## 📋 待動工 Backlog 概覽

### B-1：description 精簡 + tools.md 重生 ✅ done at v2.1.7

### B-2：擴充功能（active backlog）

詳細規劃見 [`docs/roadmap/06-version-plan-v23-v27.md`](roadmap/06-version-plan-v23-v27.md)。

| 版本 | 主題 | 估時 | 狀態 |
|---|---|---|---|
| **v2.3.0** | execute_javascript + screenshot + docs markdown | 2 天 | ✅ done |
| **v2.3.1** | 三方 review patch（6 issues 全清） | 0.5 天 | ✅ done |
| **v2.4.0** | 6-step 重構（含 InstanceReference + TS 定義生成 + decorator） | 4 天 | ✅ done |
| **v2.4.1** | 三方 review patch round 1（9 issues 全清） | 0.5 天 | ✅ done |
| **v2.4.2** | 三方 review patch round 2（2 must-fix + 4 polish） | 0.3 天 | ✅ done |
| **v2.4.3** | Asset interpreters（asset meta 編輯能力，原 v2.4.1 計畫） | 2-3 天 | ✅ done |
| **v2.4.4** | 三方 review patch round 1 on v2.4.3（2 must-fix + 5 polish） | 0.5 天 | ✅ done |
| **v2.4.5** | 三方 review patch round 2 on v2.4.4（7 worth-considering） | 0.3 天 | ✅ done |
| **v2.4.6** | 三方 review patch round 3 on v2.4.5（1 must-fix + 1 polish） | 0.1 天 | ✅ done |
| **v2.4.7** | landmine #14 + live-test cleanup fix bump + roadmap renumber + 實機 reload 測試 | 0.2 天 | ✅ done |
| **v2.4.8** | 收 v2.4.0 同梱失蹤的 4 件（TS diagnostics + animation + capture-scene-logs + capability flag） | 3 天 | ✅ done |
| **v2.4.9** | 三方 review patch round 1 on v2.4.8（2 must-fix + 4 polish） | 0.5 天 | ✅ done |
| **v2.4.10** | 三方 review patch round 2 on v2.4.9（1 must-fix + 2 polish — AsyncLocalStorage 收 capture interleave） | 0.3 天 | ✅ done |
| **v2.4.11** | 三方 review patch round 3 on v2.4.10（1 must-fix — refcount leak path） | 0.1 天 | ✅ done |
| **v2.4.12** | reload retest fix — Node 22+ Windows .cmd shim spawn EINVAL on A1 | 0.1 天 | ✅ done |
| **v2.5.0** | file-editor + Notifications + Prompts (T-V25-1..4) | 5 天 | ✅ done |
| **v2.5.1** | 三方 review patch round 1 on v2.5.0 (4 must-fix + 5 polish) | 0.5 天 | ✅ done |
| **v2.6.0** | 跨 LLM 兼容 + runtime QA（Gemini-compat + debug_game_command） | 4-5 天 | ⏳ next |
| **v2.6.0** | Gemini-compat schema + debug_game_command | 4-5 天 | ⏳ |
| **v2.7.0** | spillover buffer | — | ⏳ |

**架構決議**：不轉 UTCP-only，抄 cocos-code-mode 的 idea
（InstanceReference + TS 定義生成 + decorator）走 v2.4.0 重構移植進 MCP。
完整推理見 [`docs/research/cross-repo-survey.md`](research/cross-repo-survey.md)
+ [`docs/research/repos/cocos-code-mode.md`](research/repos/cocos-code-mode.md)。

### B-3：Prefab byte-level 比對（觸發再做）

v1.4.0 #1 — code path 全 façade（v2.1.3 砍 ~1700 行手刻 JSON），
但缺 byte-level diff 驗證。等有人回報不一致或主動配「乾淨 fixture
專案」session 比對時再做。

---

## 📊 v1.4.0 / v1.5.0 落差現況

判斷新需求對不對齊時的快查表。

| 項目 | 狀態 | 何時做 |
|---|---|---|
| v1.4.0 Prefab 100% 對齊 | 🟡 缺 byte-level diff 驗證 | B-3 觸發再做 |
| v1.5.0 #1 工具收斂為 50 個 | ❌ closed（量測後否決，2026-05-01） | 不再做（見 ADR 0001 補註） |
| v1.5.0 #2 token -50% | ❌ closed（lossy-only 行銷數字） | 不再做 |
| v1.5.0 #3 Prefab 完整 API | ✅ done（P4 T-P4-3 + v2.1.4 set_link）| — |
| v1.5.0 #4 事件綁定 | ✅ done（P4 T-P4-1 + v2.1.2 持久化修補）| — |
| v1.5.0 #5 介面參數更清晰 | ✅ done at v2.1.7（B-1 全 160 個 tool）| — |
| v1.5.0 #6 面板 UI 簡潔 | ✅ done（P4 T-P4-2）| — |
| v1.5.0 #7 整體架構效率 | ❌ 跳過（無可測指標）| — |

---

## 進度快照

```
P0 ✅ done
P1 ✅ done
P4 ✅ done（v2.1.1 程式碼 + v2.1.2 修補 EventHandler 持久化）
v2.1.2 — v2.1.5 ✅ done（修補 + audit 系列）
v2.1.6 ✅ done（P2 量測 close + 死碼清掃 -3286 行）
v2.1.7 ✅ done（B-1 description sweep 全 14 categories / 160 tools）
v2.2.0 ✅ done（T-P3-1 Resources）
v2.3.0 ✅ done（execute_javascript + screenshot + docs markdown，163 tools）
v2.3.1 ✅ done（三方 review patch — 6 issues 全清，commit 351023b）
v2.4.0 ✅ done（6-step 重構 + InstanceReference + TS 定義生成 + @mcpTool，167 tools）
v2.4.1 ✅ done（三方 review patch round 1 — 9 issues 全清，commit c39e1aa）
v2.4.2 ✅ done（三方 review patch round 2 — 2 must-fix + 4 polish，commit 2b5c1f2）
v2.4.3 ✅ done（asset-meta 編輯系統 — assetMeta category +3 tools，170 tools）
v2.4.4 ✅ done（三方 review patch round 1 — 2 must-fix（proto pollution + ImageInterpreter routing） + 5 polish，commit ba6e39e）
v2.4.5 ✅ done（三方 review patch round 2 — 7 polish 全清，commit c4a759d）
v2.4.6 ✅ done（三方 review patch round 3 — 1 must-fix（Number('')→0） + 1 polish，commit ac0539f）
v2.4.7 ✅ done（landmine #14 + live-test cleanup fix + roadmap renumber + 實機 reload 測試，commit 6e63bbd）
v2.4.8 ✅ done（v2.4.0 同梱 leftover — A1 TS diagnostics + A2 animation + A3 scene-log capture + A4 capability noop，177 tools / 17 categories，commit a953e6e）
v2.4.9 ✅ done（三方 review patch round 1 — 2 must-fix（ENOENT silent + symlink escape） + 4 polish，commit 15b6a8e）
v2.4.10 ✅ done（三方 review patch round 2 — 1 must-fix（_topSlot interleave → AsyncLocalStorage） + 2 polish，commit 52bad57）
v2.4.11 ✅ done（三方 review patch round 3 — 1 must-fix（refcount leak path），commit a5c7c0e）
v2.4.12 ✅ done（reload retest fix — Node 22+ Windows .cmd shim 透過 shell:true + quoteForCmd + sync-throw try/catch，commit acfb930；retest doc 185f98c）
v2.5.0 ✅ done（multi-client breadth — fileEditor 4 tools + probe-broadcast + Notifications subscribe + Prompts 4 templates，18 categories / 181 tools，commit 543c06a）
v2.5.1 ✅ done（三方 review patch round 1 — 4 must-fix（SERVER_VERSION stale + notification unhandled rejection + prompts/get error envelope + replace_text $1 backreferences）+ 5 polish，commit 1aa1120）
v2.6.0 ✅ done（cross-LLM compat + runtime QA — gemini-compat smoke guard + debug_game_command + GameDebugClient bridge + decodeUuid 兼容層，18 categories / 183 tools，commit 4ce04cd）
v2.6.1 ✅ done（三方 review patch round 1 — 5 must-fix（consume re-delivery race + body unbounded DoS + screenshot size DoS + decodeUuid false-positive + symlink check broken）+ 6 polish，commit 7614497）
v2.6.2 ✅ done（三方 review patch round 2 — 1 doc fix（CLAUDE.md landmine #15 stale "181 v2.6.0" → "183 v2.6.1"），commit 27e7716；round 3 三方一致 🟢 ship-it）
v2.6.2 reload-tested ✅（22 條全綠：/game/* 三 endpoint + debug_game_command timeout/round-trip + decodeUuid no-op/decode-and-use + regression all v2.5.x/v2.4.x）
v2.7.0 ✅ done（preview-QA + security hardening — CORS scoping for /game/* + debug_preview_url + debug_query_devices + debug_capture_preview_screenshot，18 categories / 186 tools，commit 5c67031）
v2.7.1 ✅ done（三方 review patch round 1 — 4 must-fix（resolveGameCorsOrigin doc/code mismatch + CHANGELOG 'public' channels misleading + smoke OPTIONS preflight + IPv6 [::1] portability）+ 4 polish，commit 39d044f）
v2.7.2 ✅ done（三方 review patch round 2 — CLAUDE.md architecture map drift（debug 17→20 / node 11→12 / component 10→11 / +4 missing entries）+ HANDOFF heading stale，commit dd88952；Codex r2 出貨 due to out-of-credits）
v2.7.3 ✅ done（Codex round-2 re-attendance — 2 must-fix（HANDOFF body 漏更新 v2.7.2 + v2.8.0 candidates 列已落地工具）+ 2 polish（smoke ACAO=* + CLAUDE.md v2.3.0 數學澄清），commit d1a868f；round 3 三方一致 🟢 ship-it）
v2.8.0 ✅ done（spillover — T-V28-1 CORS hoist + Vary: Origin on deny + T-V28-2 resolveAutoCaptureFile helper for 4 capture paths + T-V28-3 debug_preview_control via typed cce.SceneFacade.changePreviewPlayState，18 categories / 187 tools，commits 39c0b36 / 80d722f / c4a4dc8 / ddb6c77）
v2.8.1 ✅ done（三方 review round 1 — 4 must-fix（containment helper anchor against project root + SERVER_VERSION sync + explicit savePath also containment-checked + changePreviewPlayState in contributions.scene.methods）+ 2 polish（Array.isArray Origin guard + HANDOFF SHA fix），commit 769151b；round 2 三方一致 🟢 ship-it — Claude / Codex 0🔴-2single🟡 / Gemini 0🔴-2single🟡，所有 single 🟡 deferred 至 v2.9.0 spillover）
v2.8.2 ✅ done（reload-retest patch — 2 bugs 三方 review 全漏的 runtime-only issues：(1) `cce.SceneFacade` 名稱應為 `cce.SceneFacadeManager` / `.instance`（cocos 3.8.7 實機驗）→ 改 probe 三候選；(2) 相對 savePath 解析到 host cwd（CocosDashboard 路徑）而非 project root → `path.resolve(projectPath, savePath)` 錨定後再 dirname，commit 5725f09）
v2.8.2 reload-tested ✅（11 條 live-test 全綠 + 1 觀察：cocos preview 設成「編輯器內預覽 (embedded)」時 `preview_control(start)` facade 通但 `capture_preview_screenshot` 用 Preview-title 濾抓不到視窗，因 embedded 模式 gameview 嵌在主編輯器、不開新 window）
v2.8.3 ✅ done（embedded-mode PIE 補完 — 5 件子任務，commits 48d11ec / 71c4868 / ce6825f）
v2.8.4 ✅ done（browser-mode retest 又抓到 2 件 — landmine #16 廣域化 + auto fallback hint mode-aware；commit 843fe73，已 push origin/main）
v2.9.0 ⏳ in-progress（T-V29-1 check_editor_health + T-V29-2 set_preview_mode 落地 → 188 → 190 tools，commit 2c277b4 已 push）
v2.9.1 ⚠ partial（setter 落地但 cocos 3.8.7 拒絕所有 4 種 set-config 寫入 shape — `setResult: true` 但 read-back 永遠不變。記為 landmine #17、tool description 改為 ⚠ EXPERIMENTAL，user 改走 cocos UI dropdown，待 v2.9 後續對比參考專案找到正確 write path 再恢復）
v2.9.1 retest 觀察（freeze 偵測）：`check_editor_health` 在 cocos 凍結後仍回 `sceneAlive: true, sceneLatencyMs: 1ms`。getCurrentSceneInfo probe 沒抓到 freeze — 推測 cocos cached director state，沒走過 wedged code path。記在 landmine #16 補註，待對比參考專案後找更敏感的 probe。
v2.9.2 ✅ done（T-V29-3 polish batch — 8 件 v2.8.1 deferred single-reviewer 🟡 全部處理）
v2.9.3 ✅ done（T-V29-6 macro-tool routing — 12 個 referenceImage_* 工具 collapse 成 1 個 `referenceImage_manage({op,...})` op-router；preview-mode 兩件加 park gate：preview_control(start) 需 `acknowledgeFreezeRisk:true`、set_preview_mode 已有 `confirm` gate + ⚠ EXPERIMENTAL 描述。**18 categories / 179 tools**，retest 全綠（含 simulator 模式 T-V29-4 順帶完成）；breaking change：舊的 referenceImage_add_reference_image 等 12 個 flat tool 移除，callers 改用 referenceImage_manage(op=...)）
v2.9.4 ✅ done（T-V29-5 MediaRecorder bridge — `debug_record_start` / `debug_record_stop` 顯式工具 wrap game_command 隊列；client 端加 record_start / record_stop built-in handlers 用 MediaRecorder + canvas.captureStream；server 端 persistGameRecording 32MB cap + project containment guard。**18 categories / 181 tools**。Live-test 因目前 preview 在 simulator 模式且 client 未 wire 進 game 而暫緩，待未來 browser-preview 環境的 session retest）
剩 preview-mode 對比參考專案；T-V29-batch cumulative 三方 review 收尾
P2 ❌ closed（量測後否決：lossless +29.4% / lossy -63% 但丟 validation）

待動工（依優先序）：
B-2 ⏳ 擴充功能（next v2.7.0 spillover；細拆見 docs/roadmap/06；v2.6.x 都已 ship）
B-3 ⏳ Prefab byte-level 比對（觸發再做）
```

詳細 v2.1.0 — v2.1.5 修補史搬到 [`docs/archive/handoff-history.md`](archive/handoff-history.md)。

---

## 環境快速確認

```bash
cd D:/1_dev/cocos-mcp-server
git status                    # 應為乾淨
git log --oneline -6          # 最頂為 351023b（v2.3.1 review patch）

# tsc + smoke + 工具數
npm run build                 # 預期 tsc 無輸出
node scripts/smoke-mcp-sdk.js # 預期 ✅ all smoke checks passed（14 條，含 docs/handoff + [specialist] prefix）
node -e "const {createToolRegistry} = require('./dist/tools/registry.js');
const r = createToolRegistry();
let total = 0;
for (const c of Object.keys(r)) total += r[c].getTools().length;
console.log('categories:', Object.keys(r).length, 'tools:', total);"
# 預期：categories: 14 tools: 163（v2.3.0 加 execute_javascript / screenshot / batch_screenshot）

# Resource registry 健檢（不需 cocos editor）
node -e "const {createResourceRegistry} = require('./dist/resources/registry.js');
const r = createResourceRegistry({});
console.log('static:', r.list().length, 'templates:', r.listTemplates().length);"
# 預期：static: 9 templates: 2（v2.3.0 加 cocos://docs/* 三個 markdown resource）

# P2 量測重跑（任何時候都可重跑、輸出穩定，可拿來做 regression 比對）
node scripts/measure-tool-tokens.js
# 預期：router-A +29.4% / router-B -63% / decision: CLOSE P2

# tools.md 重產
node scripts/generate-tools-doc.js
# 預期：wrote .../docs/tools.md (14 categories, 160 tools)

# 歷史 landmine 檢查（應全無輸出）
grep -rE "lizhiyong|fixCommonJsonIssues" source/   # P0
grep -rE "'apply-prefab'|'revert-prefab'|'load-asset'|'connect-prefab-instance'" source/   # T-P1-6
grep -rE "openToolManager|panels/tool-manager" source/ package.json   # v2.1.6 cleanup（dead panel）

# v2.2.0 同步檢查（應全相等）
diff -rq D:/1_dev/cocos-mcp-server/dist D:/1_dev/cocos_cs/cocos_cs_349/extensions/cocos-mcp-server/dist
diff D:/1_dev/cocos-mcp-server/package.json D:/1_dev/cocos_cs/cocos_cs_349/extensions/cocos-mcp-server/package.json

# MCP server 健康檢查（cocos editor 已開 plugin）
curl -s http://127.0.0.1:3000/health   # 預期：{"status":"ok","tools":160}
```

**測試場景**：`db://assets/test-mcp/p4-test.scene`（含 TestBtn instance + TestBtn.prefab）。
要清就：
```bash
curl -s -X POST http://127.0.0.1:3000/api/project/delete_asset -H "Content-Type: application/json" -d '{"url":"db://assets/test-mcp"}'
```

---

## 文件入口

### Roadmap

- 整體 roadmap：[`docs/roadmap/README.md`](roadmap/README.md)
- P1 詳細任務：[`docs/roadmap/02-architecture.md`](roadmap/02-architecture.md)
- P3 protocol extensions：[`docs/roadmap/04-protocol-extensions.md`](roadmap/04-protocol-extensions.md)（T-P3-1 done tracker）
- P4 詳細任務：[`docs/roadmap/05-v15-spec-parity.md`](roadmap/05-v15-spec-parity.md)
- **v2.3 — v2.7 版本規劃**：[`docs/roadmap/06-version-plan-v23-v27.md`](roadmap/06-version-plan-v23-v27.md)

### Research / Cross-repo

- **跨專案盤點 overview + 決策**：[`docs/research/cross-repo-survey.md`](research/cross-repo-survey.md)
- T-P3-1 prior art：[`docs/research/t-p3-1-prior-art.md`](research/t-p3-1-prior-art.md)
- Per-repo 深入筆記：
  - [`repos/cocos-cli.md`](research/repos/cocos-cli.md)（官方 CLI）
  - [`repos/cocos-code-mode.md`](research/repos/cocos-code-mode.md)（UTCP / Code Mode）
  - [`repos/funplay-cocos-mcp.md`](research/repos/funplay-cocos-mcp.md)（手刻 JSON-RPC + execute_javascript）
  - [`repos/cocos-creator-mcp.md`](research/repos/cocos-creator-mcp.md)（harady debug-tools）
  - [`repos/cocos-mcp-extension.md`](research/repos/cocos-mcp-extension.md)（Spaydo file-editor / animation）
  - [`repos/RomaRogov-cocos-mcp.md`](research/repos/RomaRogov-cocos-mcp.md)（asset interpreters）

### Analysis / 歷史

- v1.5.0 可行性分析：[`docs/analysis/v15-feasibility.md`](analysis/v15-feasibility.md)
- 上游差異分析：[`docs/analysis/upstream-status.md`](analysis/upstream-status.md)
- ADR 0001（不追 v1.5.0 spec）：[`docs/adr/0001-skip-v1.5.0-spec.md`](adr/0001-skip-v1.5.0-spec.md)
- 歷史 session 修補史：[`docs/archive/handoff-history.md`](archive/handoff-history.md)
  （v2.1.0 — v2.1.5）
- 工具參考（auto-generated）：[`docs/tools.md`](tools.md)
- 程式碼地雷清單：`CLAUDE.md` §Landmines

---

## 回滾錨點

| 退到哪個狀態 | 指令 |
|---|---|
| v2.4.7 改動前（v2.4.6 release 點 + 三方 ship-it） | `git reset --hard ac0539f` 然後 `git push --force-with-lease` |
| v2.4.6 改動前（v2.4.5 release 點） | `git reset --hard c4a759d` 然後 `git push --force-with-lease` |
| v2.4.5 改動前（v2.4.4 release 點） | `git reset --hard ba6e39e` 然後 `git push --force-with-lease` |
| v2.4.4 改動前（v2.4.3 release 點） | `git reset --hard aa95e53` 然後 `git push --force-with-lease` |
| v2.4.3 全部改動前（v2.4.2 release 點） | `git reset --hard 2b5c1f2` 然後 `git push --force-with-lease` |
| v2.4.2 review patch round 2 改動前（v2.4.1 release 點） | `git reset --hard c39e1aa` 然後 `git push --force-with-lease` |
| v2.4.1 review patch round 1 改動前（v2.4.0 release 點） | `git reset --hard 0231b10` 然後 `git push --force-with-lease` |
| v2.4.0 全部改動前（v2.3.1 release 點） | `git reset --hard 351023b` 然後 `git push --force-with-lease` |
| v2.3.1 review fixes 改動前（v2.3.0 release 點） | `git reset --hard 188ba52` 然後 `git push --force-with-lease` |
| v2.3.0 改動前（v2.2.0 release 點） | `git reset --hard 16655bb` 然後 `git push --force-with-lease` |
| v2.2.0 T-P3-1 Resources 改動前（v2.1.7 release 點） | `git reset --hard ab7191b` 然後 `git push --force-with-lease` |
| v2.1.7 description sweep 改動前（v2.1.6 release 點） | `git reset --hard 05d865e` 然後 `git push --force-with-lease` |
| v2.1.6 死碼清掃前（保留 P2 close 的 doc 改動） | `git reset --hard 12c20c4` 然後 `git push --force-with-lease` |
| v2.1.6 全部改動前（P2 close 也退） | `git reset --hard 18810a0` 然後 `git push --force-with-lease` |
| v2.1.5 改動前（v2.1.4 release 點） | `git reset --hard 6cc295f` 然後 `git push --force-with-lease` |
| v2.1.4 改動前（v2.1.3 release 點） | `git reset --hard 9b7f1f7` 然後 `git push --force-with-lease` |
| Panel 直式改動前（v2.1.1 release 點） | `git reset --hard 62f6e83` 然後 `git push --force-with-lease` |
| v2.1.1 改動前（v2.1.0 release 點） | `git reset --hard ac1248e` 然後 `git push --force-with-lease` |
| P4 開工前（只留 P1 done） | `git reset --hard afc4753` 然後 `git push --force-with-lease` |
| P1 全部改動前（只留 P0） | `git reset --hard 7fb416c` 然後 `git push --force-with-lease` |
| Fork 起點 | `git reset --hard 754adec` 然後 `git push --force-with-lease`（會丟掉所有本 fork commit）|

`--force-with-lease` 比 `--force` 安全，會檢查遠端沒被別人推過。
完整中段錨點（v2.1.5 batch 中段、v2.1.4 prefab cleanup 後等）搬到
[`docs/archive/handoff-history.md`](archive/handoff-history.md)。
