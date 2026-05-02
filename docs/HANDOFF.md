# Session Handoff

> 給下次接手的 session（含未來自己）。看完這份 + `docs/roadmap/README.md`
> 就能繼續做下去；歷史細節已拆到 `docs/archive/handoff/` 與 `docs/releases/`。

## 🚀 NEXT SESSION ENTRY POINT（2026-05-02 / v2.9.7 done — next: v2.10 對比參考專案 + simulator/MediaRecorder live-test）

**當下版本**：v2.9.7（v2.9.x cumulative review converged — 3 rounds, 1 single-issue follow-up）。**18 categories / 181 tools**。目前沒有 in-flight work；下一步是 v2.10。

**v2.9.x cycle 收尾**：v2.9.0 +2 tools（check_editor_health / set_preview_mode）→ v2.9.1 setter no-op live-test + landmines #16/#17 → v2.9.2 polish batch → v2.9.3 macro-tool routing + park gates → v2.9.4 MediaRecorder bridge → v2.9.5/v2.9.6/v2.9.7 cumulative review patches。完整紀錄見 [`docs/archive/handoff/v2.9.md`](archive/handoff/v2.9.md)，release notes 見 [`docs/releases/v2.9.md`](releases/v2.9.md)。

**未解 issues**（v2.10 對比參考專案後再動）：
- landmine #16 — preview_control(start) 觸發 cocos 3.8.7 softReloadScene race，editor 凍結需 Ctrl+R。tool 已加 acknowledgeFreezeRisk park gate。
- landmine #17 — set_preview_mode 4 strategies 全 silent no-op；setter 仍 ⚠ EXPERIMENTAL。
- pre-existing `node-tools.ts` query-current-scene fallback 收斂到 typed channel。
- MediaRecorder live-test 需 browser-preview 環境 + client wired into game。

**下一個動工**：v2.10 對比參考專案（landmines #16 + #17 解 preview_control freeze 與 set_preview_mode no-op）→ simulator/MediaRecorder live-test → node-tools typed-channel cleanup。

## 最近 Commit

| SHA | 內容 |
|---|---|
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

## 📋 待動工 Backlog 概覽

### B-2：擴充功能（active backlog）

詳細規劃見 [`docs/roadmap/06-version-plan-v23-v27.md`](roadmap/06-version-plan-v23-v27.md)。v2.3 — v2.9 已 ship；下一個實際 work item 是 v2.10 reference-project comparison + simulator/MediaRecorder live-test。

### B-3：Prefab byte-level 比對（觸發再做）

v1.4.0 #1 — code path 全 façade（v2.1.3 砍 ~1700 行手刻 JSON），但缺 byte-level diff 驗證。等有人回報不一致或主動配「乾淨 fixture 專案」session 比對時再做。

## 進度快照

```text
P0 ✅ done
P1 ✅ done
P4 ✅ done（v2.1.1 程式碼 + v2.1.2 修補 EventHandler 持久化）
v2.1.2 — v2.1.7 ✅ done（修補 + audit + P2 close + B-1 description sweep；見 docs/archive/handoff/v2.1.md）
v2.2.0 — v2.9.7 ✅ done（per-cycle 詳細紀錄見 docs/archive/handoff/v2.2.md ... v2.9.md；release notes v2.7+ 見 docs/releases/）
P2 ❌ closed（量測後否決：lossless +29.4% / lossy -63% 但丟 validation）

待動工（依優先序）：
B-2 ⏳ v2.10 reference-project comparison + simulator/MediaRecorder live-test
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

# 工具數（v2.9.7）
node -e "const {createToolRegistry} = require('./dist/tools/registry.js'); const r=createToolRegistry(); let total=0; for (const c of Object.keys(r)) total += r[c].getTools().length; console.log('categories:', Object.keys(r).length, 'tools:', total);"
# 預期：categories: 18 tools: 181

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
