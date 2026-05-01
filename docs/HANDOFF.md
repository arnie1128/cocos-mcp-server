# Session Handoff

> 給下次接手的 session（含未來自己）。看完這份 + `docs/roadmap/README.md`
> 就能繼續做下去，不需要重看歷史對話。**本檔走 slim 路線——下一步該做
> 什麼留這、細拆規劃看 `docs/roadmap/06-version-plan-v23-v27.md`、
> 跨專案分析看 `docs/research/cross-repo-survey.md`。**

## 🚀 NEXT SESSION ENTRY POINT（2026-05-02 / v2.4.2）

**當下版本**：v2.4.2（origin/main HEAD = `2b5c1f2`，已 push、無 in-flight
任務）。v2.4.0 6-step 重構落地 + 兩輪三方 review patch（v2.4.1 / v2.4.2）。

**最近 commit**（最新到舊）：

| SHA | 內容 |
|---|---|
| `2b5c1f2` | fix(v2.4.2): second-round review fixes on v2.4.1 (2 must-fix + 4 polish) |
| `c39e1aa` | fix(v2.4.1): three-way review fixes on v2.4.0 (9 issues) |
| `0231b10` | release: v2.4.0 (6-step refactor + InstanceReference + TS definitions) |
| `0df2dde` | feat(v2.4.0 step 6): add inspector_get_instance_definition + common types |
| `91dec60` | feat(v2.4.0 step 5): add @mcpTool decorator (no reflect-metadata) |
| `0b62050` | feat(v2.4.0 step 4): add InstanceReference {id,type} mode (opt-in) |
| `4747f8f` | feat(v2.4.0 step 3): add lib/batch-set + plural set_*_properties tools |
| `5105db5` | feat(v2.4.0 step 2): add lib/resolve-node helper for nodeUuid|nodeName |
| `1c8b347` | refactor(v2.4.0 step 1): collapse tool 3-layer to declarative array |

**v2.4.0 / v2.4.1 / v2.4.2 階段**：v2.4.0 是 6-step 架構重構（無新 user-facing
行為），v2.4.1 + v2.4.2 是兩輪三方 review patch。v2.4.2 三方 🟢 ship-it 一致
通過。下一個 session 可以動工 v2.4.1 (asset interpreters，被 v2.4.0 佔用版號
所以實際是 v2.4.3+) 或 v2.5.0 (file-editor + Notifications)。

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

### 下一個動工

**選項 A（推薦）**：**v2.4.3 = asset interpreters**（原計畫的 v2.4.1 內容，
版號被 review patch 佔用所以順延）。細拆見
[`docs/roadmap/06-version-plan-v23-v27.md` §v2.4.1](roadmap/06-version-plan-v23-v27.md)。

**選項 B**：實機 live-test v2.4.0 新 tool（`set_node_properties` /
`set_component_properties` / `inspector_get_instance_definition`）+ Claude
Code 整合驗證 InstanceReference round-trip。Live-test 前需 ping user
（feedback memory: notify-before-live-test）。

**選項 C**：v2.5.0 file-editor + Notifications + Prompts（5 天）。

**動工前讀**：

1. 本 §NEXT SESSION ENTRY POINT
2. CHANGELOG.md v2.4.0 / v2.4.1 / v2.4.2 區塊
3. CLAUDE.md §Landmines（無新增 landmine — v2.4.x 都是 lib helper 抽出 + 新工具，
   未踩既有 IPC quirks）
4. 對應選項的 docs/roadmap/06 段落

**回滾錨點**：
- v2.4.2 改動前（v2.4.1 release 點）→ `git reset --hard c39e1aa`
- v2.4.1 改動前（v2.4.0 release 點）→ `git reset --hard 0231b10`
- v2.4.0 改動前（v2.3.1 release 點）→ `git reset --hard 351023b`

**動工建議**：v2.4.x 三 commit 已穩定，下個版本直接動工不需先驗證
v2.4.x；新功能落地後同樣走主 commit + 三方 review + 反修流程。

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
| **v2.4.3** | Asset interpreters（asset meta 編輯能力，原 v2.4.1 計畫） | 2-3 天 | ⏳ next |
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
v2.4.0 ✅ done（6-step 重構 + InstanceReference + TS 定義生成 + @mcpTool，167 tools）
v2.4.1 ✅ done（三方 review patch round 1 — 9 issues 全清，commit c39e1aa）
v2.4.2 ✅ done（三方 review patch round 2 — 2 must-fix + 4 polish，commit 2b5c1f2）
P2 ❌ closed（量測後否決：lossless +29.4% / lossy -63% 但丟 validation）

待動工（依優先序）：
B-2 ⏳ 擴充功能（next v2.4.3 asset interpreters；細拆見 docs/roadmap/06 §v2.4.1）
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
