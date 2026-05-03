# Session Handoff

> 給下次接手的 session（含未來自己）。看完這份 + `docs/roadmap/README.md`
> 就能繼續做下去；歷史細節已拆到 `docs/archive/handoff/` 與 `docs/releases/`。

## 🚀 NEXT SESSION ENTRY POINT（2026-05-03 / v2.12.1 done）

**當下版本**：v2.12.1（v2.12.0 tech-debt T1-T5 batch + `gen-build-hash.js` 改為 hash 全 dist tree，build hash 對齊 `check_code_sync` 語意）。**19 categories / 197 tools / 16 asset-interpreters / 5 prompt templates**。沒有 in-flight work。

v2.11.x 完整 cycle 紀錄已歸檔：[`docs/archive/handoff/v2.11.md`](archive/handoff/v2.11.md)。

## v2.12.x 候選清單

依跨 repo gap 排序（詳見 [`docs/research/cross-repo-survey.md`](research/cross-repo-survey.md) v2.11.7 refresh）：

| # | 來源 | 項目 | 估時 | 風險 |
|---|---|---|---|---|
| 1 | Spaydo | validation 5 子工具（validate_scene/_node/_components/get_scene_stats/validate_references） | 1.5 天 | 低 |
| 2 | chenShengBiao（Python headless）| scaffold_* 9 工具（player_controller/enemy_ai/spawner/game_loop/ui_screen/camera_follow/audio_controller/input_abstraction/score_system） | 2 天 | 低 |
| 3 | chenShengBiao | assert_scene_state（declarative 場景斷言；與 validation_compare_snapshots 互補）| 1 天 | 低 |
| 4 | cocos-code-mode | assetGetPreview（任意資產類型 base64 thumbnail）| 0.7 天 | 低 |
| 5 | chenShengBiao | composite UI presets（dialog_modal / main_menu / hud_bar / toast / loading_spinner）| 1 天 | 低 |
| 6 | harady | component_query_enum（component property enum 值查詢）| 0.5 天 | 低 |
| 7 | chenShengBiao | batch_scene_ops（JSON spec 批次場景變更）| 1 天 | 中 |
| 8 | cocos-cli | multi-node selection（PR #525 SelectionService）| 0.7 天 | 中 |
| 9 | cocos-cli | resource template `cocos://assets/{ccType}` | 0.3 天 | 低 |
| 10 | harady | debug 內省（list_messages / list_extensions / get_extension_info）| 0.5 天 | 低 |
| 11 | cocos-code-mode | editorGetScenePreview（顯式 camera framing 截圖） | 0.5 天 | 低 |

## 內部 tech-debt（v2.12.0 已 ship；v2.12.1 補 build-hash）

| Task | commit | 內容 |
|---|---|---|
| T1 | `7022688` | `findComponentIndexByType` → `lib/component-lookup.ts`（8 sites） |
| T2 | `ad7af6b` | dump-shape unwrap → `lib/dump-unwrap.ts`（含 landmine #11 例外保留） |
| T3 | `5ac06b5` | scene root UUID → `lib/scene-root.ts`（`getSceneRoots` + `getSceneRootUuid`） |
| T4 | `52c95ab` | `new Promise(async)` 清掃（17/19；2 個 `.then` 內 resolve 保留） |
| T5 | `b5a23e6` | tree/hierarchy caps（`maxDepth`/`maxNodes`/`summaryOnly`，additive schema） |
| build-hash | `72917d5` | hash 全 dist tree（補 v2.12.0 殘留瑕疵；對齊 `check_code_sync` 語意） |

## 未解 issues（不變）

- landmine #16 — preview_control(start) 觸發 cocos 3.8.7 softReloadScene race（CLAUDE.md 已記）
- landmine #17 — set_preview_mode 不支援（CLAUDE.md 已記）
- pre-existing `node-tools.ts` query-current-scene fallback 收斂到 typed channel
- MediaRecorder live-test 需 browser-preview 環境 + client wired into game

## 經驗教訓

詳細歸檔於 [`docs/archive/handoff/v2.10.md`](archive/handoff/v2.10.md) §經驗教訓 +
[`docs/archive/handoff/v2.11.md`](archive/handoff/v2.11.md) §觀察。摘要：

- **Codex 大 task 切多支並行**：v2.10.1 整支灌 18 檔 hung context overflow；v2.11.0 拆 6 支 successful；v2.11.7 拆 3 支 audit + 7 支跨 repo 並行成功
- **多 codex 並行寫同 repo**：明確「只動分配檔、不跑 tsc/smoke」可在無 worktree 下安全並行；多 task 觸動同檔則需序列
- **Cumulative review/simplify 在 cycle wrap 時做一次**（v2.11.7）有效揪出全專案 antipattern
- **schemas.ts 提取要含 consumer migration prompt**（不然會像 vec3Schema 變孤兒）
- **codex CLI 0.128.0 不需 `--dangerously-bypass`**（舊 1.0.4 wrapper 才要）
- **Cycle wrap audit**（user 主動列項目 verify）有效揪出漏網 task

## 最近 Commit

| SHA | 內容 |
|---|---|
| `72917d5` | fix(v2.12.1): build hash now reflects whole dist tree |
| `38fdb71` | release(v2.12.0): tech-debt T1-T5 batch wrap + dist sync |
| `b5a23e6` | feat(v2.12.x T5): add maxDepth/maxNodes/summary caps to tree tools |
| `52c95ab` | refactor(v2.12.x T4): sweep new Promise(async) antipattern |
| `5ac06b5` | refactor(v2.12.x T3): extract scene root UUID extractor to lib |
| `ad7af6b` | refactor(v2.12.x T2): extract dump-shape unwrap helper to lib |
| `7022688` | refactor(v2.12.x T1): extract findComponentIndexByType to lib |
| `b2bd98c` | docs(v2.11.7): refresh cross-repo survey + HANDOFF after cycle wrap |
| `987756c` | fix(v2.11.7): cumulative review + simplify pass on whole project |
| `2fe8f4d` | feat(v2.11.6 #8): input simulation via Electron webContents.sendInputEvent |
| `a71353e` | feat(v2.11.5 #7+#9): build-hash tools + Core/Full profile + asset-db channel fix |
| `e0fb6c6` | merge(v2.11.5 group-a): scene snapshots + asset tree + real get_unused_assets |
| `e4f8115` | feat(v2.11.4 #2+#1): component_auto_bind + node_create_tree/set_layout + prefab_create_from_spec |
| `1a636ca` | feat(v2.11.3 #5): close cocos-code-mode inspector parity gaps (3.5/4 ship) |
| `9a0151e` | feat(v2.11.2 #6): add @ccclass extractor + component_resolve_script_class tool |

更早 commits 見 cycle archives。

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
| v2.11 | decorator unification + narrative externalization + ccclass extractor + inspector parity gaps + harady batch tools + Spaydo snapshot diff/asset tree + harady build-hash/Core-Full profile + Electron input simulation + cumulative review/simplify + DNS rebinding 防護 | [`docs/archive/handoff/v2.11.md`](archive/handoff/v2.11.md) |

## 待動工 Backlog

- **B-2**：v2.12.x+ 跨 repo gap 11 項候選（見上方表）。內部 tech-debt T1-T5 + build-hash 已 ship 完。
- **B-3**：Prefab byte-level 比對（觸發再做）— v1.4.0 #1 code path 全 façade，但缺 byte-level diff 驗證。等有人回報不一致或主動配「乾淨 fixture 專案」時做。

完整歷史優先序快照：

```text
P0 / P1 / P4 ✅ done（v2.1.x）
P2 ❌ closed（量測後否決：lossless +29.4% / lossy -63% 但丟 validation）
v2.1.x — v2.12.1 ✅ done（per-cycle 詳細紀錄見 docs/archive/handoff/v2.1-v2.11.md；release notes v2.7+ 見 docs/releases/）
B-2 ⏳ active（v2.12.x 跨 repo gap）
B-3 ⏳ deferred（觸發再做）
```

## 環境快速確認

```bash
cd D:/1_dev/cocos-mcp-server
git status                    # 開發起點應確認無意外變更
git log --oneline -6          # 最頂應為當下版本（v2.12.1 = 72917d5）

# tsc + smoke + Gemini schema compatibility
npx tsc --noEmit
node scripts/check-gemini-compat.js
node scripts/smoke-mcp-sdk.js

# 工具數
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
- Per-repo 深入筆記：`docs/research/repos/`
- 已歸檔的 prior-art / cross-repo snapshots：`docs/archive/research/`

### Analysis / 歷史

- v1.5.0 可行性分析：[`docs/analysis/v15-feasibility.md`](analysis/v15-feasibility.md)
- 上游差異分析：[`docs/analysis/upstream-status.md`](analysis/upstream-status.md)
- ADR 0001（不追 v1.5.0 spec）：[`docs/adr/0001-skip-v1.5.0-spec.md`](adr/0001-skip-v1.5.0-spec.md)
- Handoff archives：[`docs/archive/handoff/v2.1.md`](archive/handoff/v2.1.md) ... [`docs/archive/handoff/v2.11.md`](archive/handoff/v2.11.md)
- Release archives：[`docs/releases/v2.7.md`](releases/v2.7.md) / [`docs/releases/v2.8.md`](releases/v2.8.md) / [`docs/releases/v2.9.md`](releases/v2.9.md) / [`docs/releases/v2.10.md`](releases/v2.10.md)
- Resolved landmines：[`docs/archive/landmines-resolved.md`](archive/landmines-resolved.md)
- 工具參考（auto-generated）：[`docs/tools.md`](tools.md)
- 程式碼地雷清單：`CLAUDE.md` §Landmines

## 回滾錨點

最近兩 cycle（v2.11.x + v2.12.x）；更早的歷史錨點見
[`docs/archive/rollback-anchors.md`](archive/rollback-anchors.md)。

| 退到哪個狀態 | 指令 |
|---|---|
| v2.12.1 改動前（v2.12.0 ship 點） | `git reset --hard 38fdb71` |
| v2.12.0 改動前（v2.11.7 wrap 點 + tech-debt T1-T5 之前） | `git reset --hard b2bd98c` |
| v2.11.7 改動前（v2.11.6 ship 點） | `git reset --hard 93d3c9f` |
| v2.11.6 改動前（v2.11.5 ship 點） | `git reset --hard 487eb38` |
| v2.11.5 改動前（v2.11.4 ship 點） | `git reset --hard ea24fb0` |
| v2.11.4 改動前（v2.11.3 ship 點） | `git reset --hard 1a636ca` |
| v2.11.3 改動前（v2.11.2 ship 點） | `git reset --hard 9a0151e` |
| v2.11.2 改動前（v2.11.1 docs refresh 點） | `git reset --hard e05b889` |
| v2.11.1 改動前（v2.11.0 ship 點） | `git reset --hard 3f62c7f` |
| v2.11.0 改動前（v2.10.x cycle wrap 點） | `git reset --hard d48d834` |

如需推遠端覆蓋：`git push --force-with-lease`（`--force-with-lease` 會檢查遠端沒被別人推過，比 `--force` 安全）。
