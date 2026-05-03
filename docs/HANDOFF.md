# Session Handoff

> 給下次接手的 session（含未來自己）。看完這份 + `docs/roadmap/README.md`
> 就能繼續做下去；歷史細節已拆到 `docs/archive/handoff/` 與 `docs/releases/`。

## 🚀 NEXT SESSION ENTRY POINT（2026-05-03 / v2.12.0 done — tech-debt T1-T5 batch ship）

**當下版本**：v2.12.0（內部 tech-debt 5 件套：3 個 lib 抽出 + Promise antipattern 清掃 + tree/hierarchy caps）。**19 categories / 197 tools（不變，純內部重構 + 1 個附加 schema field）/ 16 asset-interpreters / 5 prompt templates**。沒有 in-flight work；v2.11.x 全 ship + v2.12.x 內部 tech-debt T1-T5 全 ship。剩下 v2.12.x 跨 repo gap 11 項候選見下。

**v2.11 cycle 已 ship**：
- v2.11.0 — `@mcpTool` decorator 全面化（16 檔 tool 檔案統一），由 6 支並行 codex 處理，後手 `!` non-null assertion polish
- v2.11.1 — 中型檔案 narrative 外化（project / scene / scene-advanced / asset-advanced / scene-view / file-editor → `source/data/<category>-docs.ts`），由 3 支並行 codex 處理
- v2.11.2 — #6 `component_resolve_script_class` + `lib/ccclass-extractor.ts` 純 helper（regex 解析 `@ccclass('Name')` / `("Name")` / `` (`Name`) ``，dedup，含 multi-class 警告 / no-match 警告）。1 支 codex；本機 7 種 fixture pass
- v2.11.3 — #5 inspector 4 缺口（部分 ship）：(a) `i18n:` tooltip 解析 ✅；(b) Asset → Importer suffix 分支於 `get_instance_definition`（`data.kind = 'node' \| 'component' \| 'asset'`）✅；(c) `inspector_get_settings_definition` 新工具：`CommonTypes` ✅，`ProjectSettings` / `CurrentSceneGlobals` 因 cocos channel 未驗證 → 回傳明確 `pending` 訊息（部分 ship）；(d) `inspector_set_instance_properties` 通用 batch writer ✅，依 reference type 分派至既有 AssetMetaTools / ComponentTools / NodeTools 實例。1 支 codex；後手修 2 處 implicit any。Tool count 181 → 183 (+2)，inspector 2 → 4
- v2.11.4 — #2 `component_auto_bind` + #1 批次節點三件套（`node_create_tree` / `node_set_layout` / `prefab_create_from_spec`）：2 支循序 codex；後手修 `z.lazy()` → `z.any()` 避免 Gemini $ref + 移除 `as any` decorator cast。Tool count 183 → 187 (+4)
- v2.11.5 — Group A #3+#4：`validation_take_snapshot` + `validation_compare_snapshots`（場景節點快照與 diff，session-scoped）+ `assetAdvanced_get_tree`（遞迴資產樹，dirs-first 排序）+ `assetAdvanced_get_unused_assets` 由 placeholder 升級為真正 dependency-scan 實作（query-asset-dependencies）。三方 review 後修補：root asset 加入 referenced set、serializeNodeTree uuid/_id fallback + visited-set cycle guard、query-asset-depends channel 名稱修正。Tool count 187 → 190 (+3)。Group B #7+#9：`server_get_build_hash` / `server_check_code_sync`（build identity + 原始碼同步狀態診斷工具）+ pplyProfile('core'|'full') IPC + Core/Full 按鈕（UI + composable）+ `postbuild` 腳本（scripts/gen-build-hash.js）。三方 review 後修補：sourceRoot path traversal、get_build_hash raw JSON、double getEnabledTools()。Tool count 190 → 192 (+2)
- v2.11.6 — #8 `input_list_windows` + `input_simulate_mouse_move` / `input_simulate_mouse_click` / `input_simulate_mouse_drag` / `input_simulate_key_press`：基於 Electron `webContents.sendInputEvent()`，不需 OS 層 API（Cocos Creator 是 Electron app）；支援 editor / preview / simulator / focused 四種 windowKind + titleContains 字串定位 + windowId 精確定位 + 可選 panel 相對座標（DOM traversal）。1 支 codex；tsc 零錯誤 + Gemini compat 197/197 inline。Tool count 192 → 197 (+5)，categories 18 → 19
- **v2.11.7 — cumulative review + simplify pass on whole project（非僅 v2.11.5/6 diff）**：3 支並行 codex 全專案 audit（reuse / quality+efficiency / security）+ 1 支 ship 驗證 + 7 支跨 repo 重新分析（含新增 chenShengBiao Python repo）。
  - **Security**：landmine #18 — loopback Host check on `/mcp` + `/api/*` + `/game/*`（DNS rebinding 防護，`/health` 例外）；`batch_import_assets` 加 fileFilter+recursive guard + 500 file cap；`batch_delete_assets` 加 200 url cap；`server_check_code_sync` containment 改用 `path.relative`
  - **Performance**：`asset-advanced` 6 個 sequential await loop 改 `Promise.allSettled`（get_unused_assets / get_users / validate_asset_references / export_asset_manifest / batch_import_assets / batch_delete_assets）+ `prefab_create_from_spec` query-node 平行化 + `debug_get_node_tree` 同層子節點平行化
  - **Quality**：`component_auto_bind` recursive flatten → iterative DFS + 移除多餘 dump-shape unwrap；`validation_compare_snapshots.modified` payload 只回傳變動欄位（before+after 全嵌入會爆 token 預算）；TOCTOU `existsSync→readFileSync` 7 sites 改 try/catch ENOENT（settings / tool-manager / resources/registry / server-tools）
  - **Deferred**（記錄於 cross-repo-survey §內部 tech-debt）：3 個 lib 抽出（component-lookup 9 sites / dump-unwrap 16 sites / scene-root 14 sites，總 ~110 行可省）+ 19 個 `new Promise(async)` antipattern + get_node_tree/get_scene_hierarchy 加 caps
  - Tool count 不變 197（純 review/simplify，無新工具）

完整 v2.10.x 紀錄：[`docs/archive/handoff/v2.10.md`](archive/handoff/v2.10.md)，release notes：[`docs/releases/v2.10.md`](releases/v2.10.md)。

**v2.12.x+ 候選清單**（v2.11.7 cycle wrap 後重新整理；詳見 [`docs/research/cross-repo-survey.md`](research/cross-repo-survey.md) v2.11.7 refresh）：

| # | 來源 | 項目 | 估時 | 風險 |
|---|---|---|---|---|
| 1 | Spaydo | validation 5 子工具（validate_scene/_node/_components/get_scene_stats/validate_references） | 1.5 天 | 低 |
| 2 | chenShengBiao（新 repo, Python headless）| scaffold_* 9 工具（player_controller/enemy_ai/spawner/game_loop/ui_screen/camera_follow/audio_controller/input_abstraction/score_system） | 2 天 | 低 |
| 3 | chenShengBiao | assert_scene_state（declarative 場景斷言；與 validation_compare_snapshots 互補）| 1 天 | 低 |
| 4 | cocos-code-mode | assetGetPreview（任意資產類型 base64 thumbnail）| 0.7 天 | 低 |
| 5 | chenShengBiao | composite UI presets（dialog_modal / main_menu / hud_bar / toast / loading_spinner）| 1 天 | 低 |
| 6 | harady | component_query_enum（component property enum 值查詢）| 0.5 天 | 低 |
| 7 | chenShengBiao | batch_scene_ops（JSON spec 批次場景變更）| 1 天 | 中 |
| 8 | cocos-cli | multi-node selection（PR #525 SelectionService）| 0.7 天 | 中 |
| 9 | cocos-cli | resource template `cocos://assets/{ccType}` | 0.3 天 | 低 |
| 10 | harady | debug 內省（list_messages / list_extensions / get_extension_info）| 0.5 天 | 低 |
| 11 | cocos-code-mode | editorGetScenePreview（顯式 camera framing 截圖） | 0.5 天 | 低 |

**內部 tech-debt（v2.12.0 ship 完成）**：
- ~~T1~~ ✅ `findComponentIndexByType` → `lib/component-lookup.ts`（commit `7022688`，8 sites 替換）
- ~~T2~~ ✅ dump-shape unwrap → `lib/dump-unwrap.ts`（commit `ad7af6b`，含 landmine #11 例外）
- ~~T3~~ ✅ scene root UUID → `lib/scene-root.ts`（commit `5ac06b5`，含 `getSceneRoots()` + `getSceneRootUuid()`）
- ~~T4~~ ✅ `new Promise(async)` 清掃（commit `52c95ab`，17/19 sites 替換 + 2 個 .then 內 resolve 保留）
- ~~T5~~ ✅ tree/hierarchy caps（commit `b5a23e6`，`debug_get_node_tree` + `scene_get_scene_hierarchy` + `cocos://scene/hierarchy` resource 加 `maxDepth`/`maxNodes`/`summaryOnly` 與 `truncated`/`truncatedBy`/`nodeCount` 回傳欄位；additive schema，舊 caller 不受影響）

**已知小瑕疵**（v2.12.x 後續可順手）：
- `get_build_hash` 目前只 hash `dist/main.js`（entry point identity 語意），對 sub-module 改動不敏感。若改成 hash 全 dist tree 會跟 `check_code_sync` 語意更一致；非阻塞，視需求決定。

**未解 issues（不變）**：
- landmine #16 — preview_control(start) 觸發 cocos 3.8.7 softReloadScene race（文件已記）
- landmine #17 — set_preview_mode 不支援（文件已記）
- pre-existing `node-tools.ts` query-current-scene fallback 收斂到 typed channel
- MediaRecorder live-test 需 browser-preview 環境 + client wired into game

**經驗教訓（新 session 必讀）**：詳見 [`docs/archive/handoff/v2.10.md`](archive/handoff/v2.10.md) §經驗教訓段。摘要：
- Codex 大 task 切多支並行（v2.10.1 整支灌 18 檔 hung context overflow；v2.11.0 拆 6 支 successful）
- 主動 log-tail 別等 status（rollout file size > 540KB 是 context warning）
- gemini-3.1-pro-preview 200K context 邊界要意識
- codex CLI 0.128.0 不需 `--dangerously-bypass`（舊 1.0.4 wrapper 才要）
- schemas.ts 提取要含 consumer migration prompt（不然會像 vec3Schema 變孤兒）
- Cycle wrap audit（user 主動列項目 verify）有效揪出漏網 task
- 多 codex 並行寫同 repo：明確「只動分配檔、不跑 tsc/smoke」可在無 worktree 下安全並行（v2.11.0 6 支 + v2.11.1 3 支驗證）
- Codex 對複雜 schema-bound class method 簽名偶爾用非標準 hybrid pattern（positional + 物件偵測），需 follow-up `!` non-null fix 或日後 polish 為單 args 物件

## 最近 Commit

| SHA | 內容 |
|---|---|
| `b5a23e6` | feat(v2.12.x T5): add maxDepth/maxNodes/summary caps to tree tools |
| `52c95ab` | refactor(v2.12.x T4): sweep new Promise(async) antipattern |
| `5ac06b5` | refactor(v2.12.x T3): extract scene root UUID extractor to lib |
| `ad7af6b` | refactor(v2.12.x T2): extract dump-shape unwrap helper to lib |
| `7022688` | refactor(v2.12.x T1): extract findComponentIndexByType to lib |
| `987756c` | fix(v2.11.7): cumulative review + simplify pass on whole project |
| `2fe8f4d` | feat(v2.11.6 #8): input simulation via Electron webContents.sendInputEvent |
| `a71353e` | feat(v2.11.5 #7+#9): build-hash tools + Core/Full profile + asset-db channel fix |
| `e0fb6c6` | merge(v2.11.5 group-a): scene snapshots + asset tree + real get_unused_assets |
| `6c4832e` | feat(v2.11.5): complete inspector_get_settings_definition — wire CurrentSceneGlobals + ProjectSettings |
| `e4f8115` | feat(v2.11.4 #2+#1): component_auto_bind + node_create_tree/set_layout + prefab_create_from_spec |
| `1a636ca` | feat(v2.11.3 #5): close cocos-code-mode inspector parity gaps (3.5/4 ship) |
| `9a0151e` | feat(v2.11.2 #6): add @ccclass extractor + component_resolve_script_class tool |
| `e05b889` | docs: tighten v2.11.x candidate list after re-verification against codebase |
| `0d4c3cf` | docs: correct v2.11 candidate #6 — TS class definition generation already shipped in v2.10.2 |
| `5a3f857` | docs: refresh cross-repo-survey for v2.11.1 + archive v2.10 snapshot |
| `5861bd0` | refactor(v2.11.1 #2): externalize tool descriptions for 6 mid-size files |
| `3f62c7f` | refactor(v2.11.0 #1): unify 16 tool files to @mcpTool decorator pattern |
| `d48d834` | docs(v2.10): cycle wrap — release notes + handoff archive + HANDOFF v2.11 entry point |
| `61ceed3` | fix(v2.10.5): close v2.10.x backlog gaps — TiledMap interpreter + referenceSchema + lib/schemas migration |
| `211bfb7` | release: v2.10.4 — Stage 4 wrap + #11/#12 quality polish |
| `e596095` | release: v2.10.3 — Stage 3 wrap (interpreters/record/labeling/get_users/Polish B) |
| `c2c2ef6` | release: v2.10.2 — Stage 2 wave 1 + Polish A wrap |
| `4c8e232` | release: v2.10.1 — landmine #16/#17 closure + Stage 1 tool description/title infra |
| `5573190` | release: v2.9.7 — cumulative review round-3 patch + cycle wrap |
| `e9fd3c0` | fix(v2.9.6): cumulative review round-2 patch — 4 must-fix + 2 polish |
| `e425aa7` | fix(v2.9.5): cumulative review round-1 patch — 5 must-fix + 4 polish |
| `3bf839f` | feat(v2.9.4): T-V29-5 MediaRecorder bridge — debug_record_start/stop |
| `963c91c` | feat(v2.9.3): T-V29-6 macro-tool routing + preview-tools park gates |
| `77a6430` | fix(v2.9.2): T-V29-3 polish batch — 8 deferred v2.8.1 single-reviewer 🟡 |
| `bd36a00` | docs(v2.9.1): record setter no-op + freeze probe gap as landmines #16/#17 |
| `792a692` | fix(v2.9.1): set_preview_mode write was silently ignored on cocos 3.8.7 |
| `2c277b4` | feat(v2.9.0 #1+#2): debug_check_editor_health + debug_set_preview_mode |
| `843fe73` | release: v2.8.4 — browser-mode retest fixes |

## Cycle Archives

| Cycle | Summary | Archive |
|---|---|---|
| v2.1 | P0/P1/P4, EventHandler persistence, panel cleanup, P2 measurement, description sweep | [`docs/archive/handoff/v2.1.md`](archive/handoff/v2.1.md) |
| v2.2 | T-P3-1 Resources | [`docs/archive/handoff/v2.2.md`](archive/handoff/v2.2.md) |
| v2.3 | execute_javascript + screenshot + docs markdown; v2.3.1 review patch | [`docs/archive/handoff/v2.3.md`](archive/handoff/v2.3.md) |
| v2.4 | inspector refactor, assetMeta, animation/diagnostics, reload retests, 4 review rounds | [`docs/archive/handoff/v2.4.md`](archive/handoff/v2.4.md) |
| v2.5 | fileEditor + Notifications + Prompts; reload retest; 2 review rounds | [`docs/archive/handoff/v2.5.md`](archive/handoff/v2.5.md) |
| v2.6 | Gemini schema guard + debug_game_command bridge; reload retest | [`docs/archive/handoff/v2.6.md`](archive/handoff/v2.6.md) |
| v2.7 | preview-QA + security hardening; 3 review rounds + re-attendance | [`docs/archive/handoff/v2.7.md`](archive/handoff/v2.7.md) |
| v2.8 | CORS/capture/preview_control spillover; embedded/browser retests; landmine #16 | [`docs/archive/handoff/v2.8.md`](archive/handoff/v2.8.md) |
| v2.9 | health/mode tools, macro routing, MediaRecorder, cumulative review wrap | [`docs/archive/handoff/v2.9.md`](archive/handoff/v2.9.md) |
| v2.10 | cross-repo refresh + landmine 結案 + tool desc/title 重構 + 13 backlog ship + Polish A/B/C | [`docs/archive/handoff/v2.10.md`](archive/handoff/v2.10.md) |

## 📋 待動工 Backlog 概覽

### B-2：擴充功能（active backlog）

詳細規劃見 [`docs/roadmap/06-version-plan-v23-v27.md`](roadmap/06-version-plan-v23-v27.md)。v2.3 — v2.10 已 ship；v2.11 候選見 NEXT SESSION ENTRY POINT（decorator unification + 中型檔案 narrative 外移）。

### B-3：Prefab byte-level 比對（觸發再做）

v1.4.0 #1 — code path 全 façade（v2.1.3 砍 ~1700 行手刻 JSON），但缺 byte-level diff 驗證。等有人回報不一致或主動配「乾淨 fixture 專案」session 比對時再做。

## 進度快照

```text
P0 ✅ done
P1 ✅ done
P4 ✅ done（v2.1.1 程式碼 + v2.1.2 修補 EventHandler 持久化）
v2.1.2 — v2.1.7 ✅ done（修補 + audit + P2 close + B-1 description sweep；見 docs/archive/handoff/v2.1.md）
v2.2.0 — v2.12.0 ✅ done（per-cycle 詳細紀錄見 docs/archive/handoff/v2.2.md ... v2.10.md；release notes v2.7+ 見 docs/releases/；v2.11.x cycle wrap + v2.12.x tech-debt T1-T5 見上方 NEXT SESSION ENTRY POINT）
P2 ❌ closed（量測後否決：lossless +29.4% / lossy -63% 但丟 validation）

待動工（依優先序）：
B-2 ⏳ v2.12.x+ — 跨 repo gap 11 項候選（內部 tech-debt T1-T5 已於 v2.12.0 ship 完），依 docs/research/cross-repo-survey.md v2.11.7 refresh
B-3 ⏳ Prefab byte-level 比對（觸發再做）
```

## 環境快速確認

```bash
cd D:/1_dev/cocos-mcp-server
git status                    # 本整理要求 leave unstaged；正常開發起點應確認無意外變更
git log --oneline -6          # 最頂為 5573190（v2.9.7 cycle wrap）

# tsc + smoke + Gemini schema compatibility
npx tsc --noEmit
node scripts/check-gemini-compat.js
node scripts/smoke-mcp-sdk.js

# 工具數（v2.11.7）
node -e "const {createToolRegistry} = require('./dist/tools/registry.js'); const r=createToolRegistry(); let total=0; for (const c of Object.keys(r)) total += r[c].getTools().length; console.log('categories:', Object.keys(r).length, 'tools:', total);"
# 預期：categories: 19 tools: 197

# Resource registry 健檢（不需 cocos editor）
node -e "const {createResourceRegistry} = require('./dist/resources/registry.js'); const r=createResourceRegistry({}); console.log('static:', r.list().length, 'templates:', r.listTemplates().length);"
# 預期：static: 9 templates: 2
```

**測試場景**：`db://assets/test-mcp/p4-test.scene`（含 TestBtn instance + TestBtn.prefab）。

## 文件入口

### Roadmap

- 整體 roadmap：[`docs/roadmap/README.md`](roadmap/README.md)
- P1 詳細任務：[`docs/roadmap/02-architecture.md`](roadmap/02-architecture.md)
- P3 protocol extensions：[`docs/roadmap/04-protocol-extensions.md`](roadmap/04-protocol-extensions.md)
- P4 詳細任務：[`docs/roadmap/05-v15-spec-parity.md`](roadmap/05-v15-spec-parity.md)
- v2.3 — v2.7 版本規劃：[`docs/roadmap/06-version-plan-v23-v27.md`](roadmap/06-version-plan-v23-v27.md)

### Research / Cross-repo

- 跨專案盤點 overview + 決策：[`docs/research/cross-repo-survey.md`](research/cross-repo-survey.md)
- T-P3-1 prior art：[`docs/research/t-p3-1-prior-art.md`](research/t-p3-1-prior-art.md)
- Per-repo 深入筆記：`docs/research/repos/`

### Analysis / 歷史

- v1.5.0 可行性分析：[`docs/analysis/v15-feasibility.md`](analysis/v15-feasibility.md)
- 上游差異分析：[`docs/analysis/upstream-status.md`](analysis/upstream-status.md)
- ADR 0001（不追 v1.5.0 spec）：[`docs/adr/0001-skip-v1.5.0-spec.md`](adr/0001-skip-v1.5.0-spec.md)
- Handoff archives：[`docs/archive/handoff/v2.1.md`](archive/handoff/v2.1.md) ... [`docs/archive/handoff/v2.9.md`](archive/handoff/v2.9.md)
- Release archives：[`docs/releases/v2.7.md`](releases/v2.7.md) / [`docs/releases/v2.8.md`](releases/v2.8.md) / [`docs/releases/v2.9.md`](releases/v2.9.md)
- Resolved landmines：[`docs/archive/landmines-resolved.md`](archive/landmines-resolved.md)
- 工具參考（auto-generated）：[`docs/tools.md`](tools.md)
- 程式碼地雷清單：`CLAUDE.md` §Landmines

## 回滾錨點

### Recent

- v2.12.0 改動前（v2.11.7 ship 點 + tech-debt T1-T5 之前）→ `git reset --hard b2bd98c`
- v2.11.7 改動前（v2.11.6 ship 點）→ `git reset --hard 93d3c9f`
- v2.11.6 改動前（v2.11.5 ship 點）→ `git reset --hard 487eb38`
- v2.11.4 改動前（v2.11.3 ship 點）→ `git reset --hard 1a636ca`
- v2.11.3 改動前（v2.11.2 ship 點）→ `git reset --hard 9a0151e`
- v2.11.2 改動前（v2.11.1 docs refresh 點）→ `git reset --hard e05b889`
- v2.11.1 改動前（v2.11.0 ship 點）→ `git reset --hard 3f62c7f`
- v2.11.0 改動前（v2.10.x cycle wrap 點）→ `git reset --hard d48d834`
- v2.10.5 改動前（v2.10.4 cycle wrap 點）→ `git reset --hard 211bfb7`
- v2.10.4 改動前（v2.10.3 Stage 3 wrap 點）→ `git reset --hard e596095`
- v2.10.3 改動前（v2.10.2 Stage 2 wrap 點）→ `git reset --hard c2c2ef6`
- v2.10.2 改動前（v2.10.1 Stage 1 wrap 點）→ `git reset --hard 4c8e232`
- v2.10.1 改動前（v2.9.7 release 點）→ `git reset --hard 5573190`
- v2.9.7 改動前（v2.9.6 round-2 patch 點）→ `git reset --hard e9fd3c0`
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
- v2.5.1 改動前（v2.5.0 release 點）→ `git reset --hard 543c06a`
- v2.5.0 改動前（v2.4.12 release 點 + reload-retested）→ `git reset --hard 185f98c`
- v2.4.12 改動前（v2.4.11 release 點 + 三方 ship-it round 4）→ `git reset --hard 8bb46e8`
- v2.4.11 改動前（v2.4.10 release 點）→ `git reset --hard 52bad57`
- v2.4.10 改動前（v2.4.9 release 點 + 三方 ship-it round 2）→ `git reset --hard 15b6a8e`
- v2.4.9 改動前（v2.4.8 release 點）→ `git reset --hard a953e6e`
- v2.4.8 改動前（v2.4.7 release 點 + reload-tested）→ `git reset --hard acdfac1`

### Full Baseline Table

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
