# Session Handoff

> 給下次接手的 session（含未來自己）。看完這份 + `docs/roadmap/README.md`
> 就能繼續做下去，不需要重看歷史對話。**本檔走 slim 路線——下一步該做
> 什麼留這、細拆規劃看 `docs/roadmap/06-version-plan-v23-v27.md`、
> 跨專案分析看 `docs/research/cross-repo-survey.md`。**

## 🚀 NEXT SESSION ENTRY POINT（2026-05-03 / v2.4.12 — A1-A4 reload-retest passed, v2.5.0 in progress）

**當下版本**：v2.4.12（origin/main HEAD = `185f98c`，已 push、**已同步到
`cocos_cs_349` extension path 並 reload retest 全綠**）。v2.4.8 收 v2.4.0
同梱失蹤的 A1-A4 四件 + 4 輪三方 review patch（v2.4.9 / v2.4.10 / v2.4.11）+
v2.4.12 reload retest fix（Node 22 .cmd shim）。

**動工中**：**v2.5.0** — file-editor + Notifications + Prompts（5 天）。
細拆見 [`docs/roadmap/06-version-plan-v23-v27.md` §v2.5.0](roadmap/06-version-plan-v23-v27.md)。
- T-V25-1: file-editor 4 tool（insert_text / delete_lines / replace_text /
  query_text + path-safety guard + asset-db refresh hook）
- T-V25-2: T-P3-3 Notifications — 前置 probe-broadcast.js 量實機事件密度
- T-V25-3: T-P3-3 Notifications 落地（debounce + capability 補
  `resources.subscribe: true` + main.ts broadcast listener
  load/unload + sdkServer.notification 推送）
- T-V25-4: T-P3-2 Prompts — `prompts/list` + `prompts/get` handler + 4
  template (fix_script_errors / create_playable_prototype /
  scene_validation / auto_wire_scene)

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

**最近 commit**（最新到舊，僅列 v2.4.8 cycle 後）：

| SHA | 內容 |
|---|---|
| `185f98c` | docs(handoff): v2.4.11 → v2.4.12 reload retest results + cross-platform note |
| `acfb930` | fix(v2.4.12): A1 debug_run_script_diagnostics spawn EINVAL on Node 22+ Windows .cmd |
| `8bb46e8` | docs(handoff): v2.4.8-v2.4.11 wrap — 4-round three-way review converged 🟢 |
| `a5c7c0e` | fix(v2.4.11): three-way review patch round 3 on v2.4.10 — 1 must-fix |
| `8dfd500` | chore: untrack .claude/settings.local.json (per-machine overlay) |
| `52bad57` | fix(v2.4.10): three-way review patch round 2 on v2.4.9 — 1 must-fix + 2 polish |
| `15b6a8e` | fix(v2.4.9): three-way review patch round 1 on v2.4.8 — 2 must-fix + 4 polish |
| `a953e6e` | release: v2.4.8 — recover v2.4.0 同梱 leftovers (TS diagnostics + animation + scene-log capture) |
| `395413f` | feat(v2.4.8 A1): TS diagnostics — wait_compile, run_script_diagnostics, get_script_diagnostic_context |
| `5cd723f` | feat(v2.4.8 A2): animation tools category — list_clips/play/stop/set_clip |
| `c92319d` | feat(v2.4.8 A3): scene-script log capture in scene-bridge |
| `bb02c67` | docs(v2.4.8 A4): clarify resources.templates is implicit, not a capability flag |

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
- v2.4.6 改動前（v2.4.5 release 點）→ `git reset --hard c4a759d`
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

**動工建議**：v2.4.8 — v2.4.11 stack 已穩定（三方 4 輪、3 輪反修），下個
版本（v2.5.0 或 live-test）直接動工不需先驗證 v2.4.x；新功能落地後同樣走
主 commit + 三方 review + 反修流程。

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
| **v2.5.0** | file-editor + Notifications + Prompts | 5 天 | ⏳ in-progress |
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
v2.5.0 ⏳ in-progress（file-editor + Notifications + Prompts，5 天）
P2 ❌ closed（量測後否決：lossless +29.4% / lossy -63% 但丟 validation）

待動工（依優先序）：
B-2 ⏳ 擴充功能（next v2.5.0 file-editor + Notifications + Prompts；細拆見 docs/roadmap/06）
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
