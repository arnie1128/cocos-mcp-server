# Session Handoff

> 給下次接手的 session（含未來自己）。看完這份 + `docs/roadmap/README.md`
> 就能繼續做下去，不需要重看歷史對話。**本檔走 slim 路線——下一步該做
> 什麼留這、細拆規劃看 `docs/roadmap/06-version-plan-v23-v27.md`、
> 跨專案分析看 `docs/research/cross-repo-survey.md`。**

## 🚀 NEXT SESSION ENTRY POINT（2026-05-02 / v2.3.1）

**當下版本**：v2.3.1（origin/main HEAD = `351023b`，已 push、無 in-flight
任務）。最近兩個 commit 是 v2.3.0 主功能 + v2.3.1 三方 review 反修。

**最近 commit**（最新到舊）：

| SHA | 內容 |
|---|---|
| `351023b` | fix(v2.3.1): three-way review fixes — re-apply editor-eval flag on settings update + 5 issues |
| `188ba52` | feat: v2.3.0 — execute_javascript [primary] + screenshots + docs markdown resources |
| `16655bb` | docs: split bloated HANDOFF — extract version plan + per-repo notes |
| `4e89abc` | docs(handoff): swap RomaRogov reference to cocos-code-mode, finalize v2.3-v2.7 plan |

**v2.3.1 vs v2.3.0**：v2.3.1 是反修 patch，無新功能，6 個 review 共識
issue 全清——詳見 CHANGELOG v2.3.1 區塊與下方 §三方 review 紀錄。下一個
session 直接動工 v2.4.0。

### v2.3.0 + v2.3.1 改動摘要

| 區 | 內容 |
|---|---|
| 新增 tool（3）| `debug_execute_javascript` `[primary]` / `debug_screenshot` / `debug_batch_screenshot` |
| 改既有 tool | `debug_execute_script` 改 `[compat]` alias 到 execute_javascript scene context（v2.3.1 wrapper 還原 legacy 回應形狀 `{data:{result, message}}`）|
| Tool 描述 | 所有 non-primary tool 在 tools/list 自動補 `[specialist]` prefix（mcp-server-sdk setupTools 加 1 行、不改 source）|
| 新增 resource（3）| `cocos://docs/landmines` / `cocos://docs/tools` / `cocos://docs/handoff`（全 `text/markdown`）|
| 新增檔 | `source/lib/runtime-flags.ts`（gate `enableEditorContextEval`）|
| Settings | 新增 `enableEditorContextEval: false` 默認；v2.3.1 wire `updateSettings()` 即時 re-apply runtime flag |
| 安全強化 | CLAUDE.md landmine #13 — editor-eval 兩層 opt-in（runtime flag 可逆 / persisted state 不自動可逆）|
| 反 DoS | `batch_screenshot.delaysMs` schema cap `.max(20)`（v2.3.1）|
| 多視窗友好 | `pickWindow` 預設過濾 Preview-titled 視窗（v2.3.1）|
| Windows 友好 | `readDocsSection` 處理 CRLF + UTF-8 BOM（v2.3.1）|
| Smoke | 14 條 check（+ docs/handoff round-trip + [specialist] prefix）|
| Tool 數 | 14 categories / **163 tools**（+3） |

### 三方 review 紀錄

v2.3.0 commit `188ba52` 收 codex / claude / gemini 三方 review，找到 6
issues：

| # | Severity | 內容 | Reviewers |
|---|---|---|---|
| 1 | 🔴 must-fix | `updateSettings()` 沒 re-apply `setEditorContextEvalEnabled` | Claude + Codex |
| 2 | 🟡 worth | `execute_script` 回應形狀變了（backward-compat） | 三方一致 |
| 3 | 🟡 worth | `batch_screenshot.delaysMs` 無 array length cap | Claude |
| 4 | 🟡 worth | `pickWindow` 預設可能選到 Preview 視窗 | Codex + Gemini |
| 5 | 🟡 worth | `readDocsSection` 沒 CRLF / BOM 處理 | Gemini |
| 6 | 🟡 worth | 缺 editor-eval 威脅模型的 landmine | Claude |

v2.3.1 commit `351023b` 全部反修。第二輪 review 三方 🟢 ship it。
完整 review 流程記錄在對話紀錄 2026-05-02。

### 下一個動工（**新 session 開**）

**v2.4.0 6-step 重構**（含 InstanceReference + TS 定義生成 + `@mcpTool`
decorator，~4 天）。細拆見
[`docs/roadmap/06-version-plan-v23-v27.md` §v2.4.0](roadmap/06-version-plan-v23-v27.md)。

**v2.4.0 動工前讀**：

1. 本 §NEXT SESSION ENTRY POINT
2. [`docs/roadmap/06-version-plan-v23-v27.md` §v2.4.0](roadmap/06-version-plan-v23-v27.md)
   — 6 step 細拆 + 同梱項
3. [`docs/research/repos/cocos-code-mode.md`](research/repos/cocos-code-mode.md)
   — InstanceReference / TS 定義生成 prior art
4. [`docs/research/repos/cocos-creator-mcp.md`](research/repos/cocos-creator-mcp.md)
   — `resolveNode()` / batch property 模式
5. CLAUDE.md §Conventions + §Landmines（特別 #13 editor-eval 注意事項）

**v2.4.0 風險點**：

- 重構 surface 大（160 tool 全 migration）—— 建議每個 step 一個 commit、
  smoke / measure 每步重跑
- InstanceReference 模式改變所有 input schema 形狀，可能觸發 client 端
  argument validation 錯誤，要實機驗 Claude Code → tools/call 通暢
- `@mcpTool` decorator 採 cocos-code-mode 風格（不用 `reflect-metadata`），
  確保 tsconfig `experimentalDecorators` 不衝突 cocos editor build 流程
- 動工前留 v2.3.1 release commit `351023b` 為 rollback anchor

**動工建議**：v2.4.0 是純架構重構，不增 tool 不改 user-facing 行為。
落地後可以也走 v2.3.0 同樣的「主 commit + 三方 review + 反修 patch」
流程，確保大規模改動不破 backward-compat。

---

## 📋 待動工 Backlog 概覽

### B-1：description 精簡 + tools.md 重生 ✅ done at v2.1.7

### B-2：擴充功能（active backlog）

詳細規劃見 [`docs/roadmap/06-version-plan-v23-v27.md`](roadmap/06-version-plan-v23-v27.md)。

| 版本 | 主題 | 估時 | 狀態 |
|---|---|---|---|
| **v2.3.0** | execute_javascript + screenshot + docs markdown | 2 天 | ✅ done |
| **v2.3.1** | 三方 review patch（6 issues 全清） | 0.5 天 | ✅ done |
| **v2.4.0** | 6-step 重構（含 InstanceReference + TS 定義生成 + decorator） | 4 天 | ⏳ next（新 session）|
| **v2.4.1** | Asset interpreters（asset meta 編輯能力） | 2-3 天 | ⏳ |
| **v2.5.0** | file-editor + Notifications + Prompts | 5 天 | ⏳ |
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
P2 ❌ closed（量測後否決：lossless +29.4% / lossy -63% 但丟 validation）

待動工（依優先序）：
B-2 ⏳ 擴充功能（next v2.4.0 重構，新 session 開；細拆見 docs/roadmap/06）
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
