# Session Handoff

> 給下次接手的 session（含未來自己）。看完這份 + `docs/roadmap/README.md`
> 就能繼續做下去，不需要重看歷史對話。

## 🚀 NEXT SESSION ENTRY POINT（2026-05-02 T-P3-1 Resources / v2.2.0）

當下版本：**v2.2.0**（origin/main HEAD 待 push；本 session 動工
B-2/T-P3-1，無 in-flight 任務）。

### B-2 / T-P3-1 Resources（minor bump 2.1.7 → 2.2.0）

落地 MCP `resources/*` capability。Client 可選擇用 resources 拿
read-only state，避免每個 query 都走 `tools/call`。

| URI | 對應既存 tool | 形態 |
|---|---|---|
| `cocos://scene/current` | `scene_get_current_scene` | static |
| `cocos://scene/hierarchy` | `scene_get_scene_hierarchy` | static |
| `cocos://scene/list` | `scene_get_scene_list` | static |
| `cocos://prefabs` + `cocos://prefabs{?folder}` | `prefab_get_prefab_list` | static + RFC 6570 template |
| `cocos://project/info` | `project_get_project_info` | static |
| `cocos://assets` + `cocos://assets{?type,folder}` | `project_get_assets` | static + RFC 6570 template |

**新增檔**：

- `source/resources/registry.ts` — URI → handler 對應、`url.parse` 拆
  query string、handler 透過既有 ToolExecutor 取資料保證 byte-identical
- `docs/research/t-p3-1-prior-art.md` — cocos-cli / FunplayAI / 我們三家
  URI 設計對照、最終決議

**修改檔**：

- `source/mcp-server-sdk.ts` — capability 補 `resources: { listChanged:
  true, subscribe: false }`，setRequestHandler 接 `ListResources` /
  `ListResourceTemplates` / `ReadResource`
- `source/tools/{scene,prefab,project}-tools.ts` — 6 個對應 tool
  description 補 "Also exposed as resource cocos://...; prefer the
  resource when the client supports MCP resources." deprecation 提示
- `scripts/smoke-mcp-sdk.js` — 加 stub `scene` / `prefab` / `project`
  category，加 5 條 resource round-trip check（list / templates/list /
  read static / read template+query / read unknown）
- `CHANGELOG.md` v2.2.0 區塊 + Deprecated 條目
- `docs/roadmap/04-protocol-extensions.md` T-P3-1 標 ✅ done + 加
  deprecation tracker 表

**參考 repo（已 clone 到 `D:/1_dev/cocos-mcp-references/`）**：

- `cocos-cli/src/mcp/{resources.ts,mcp.middleware.ts}` — 官方 anchor，
  capability 用 `{ subscribe, listChanged, templates }`，URI 前綴 `cli://`
  + `cocos://`（CLI 跑在 editor 外，所以 docs/api 走 resources）
- `funplay-cocos-mcp/lib/resources.js` — 唯一 ship resources + prompts
  的 embedded extension，URI 前綴 `cocos://`，全 `text/plain` MIME
- `cocos-creator-mcp/`（harady）/ `cocos-mcp-extension/`（Spaydo）/
  `RomaRogov-cocos-mcp/` — 同架構但無 resources，只當 tool 命名 / panel
  UX 參考

**驗證**（全綠）：

- `npm run build` tsc clean
- `node scripts/smoke-mcp-sdk.js` ✅ 12 checks（含 5 條新 resources）
- `node scripts/measure-tool-tokens.js` decision = CLOSE P2 不變
  （router-A +30.1% / router-B -62.8%）
- `node scripts/generate-tools-doc.js` 14 categories / 160 tools 不變
- dist + package.json 已 sync 到 `D:/1_dev/cocos_cs/cocos_cs_349/extensions/cocos-mcp-server/`

**Deprecated 生命週期**（CHANGELOG v2.2.0 已落檔）：

6 個對應的 read-only tool **保留**，description 帶提示。清除條件
（兩條都要）：

- (a) 主流 client（Claude Desktop / Claude Code / Cline / Continue）全支援 `resources/*`
- (b) `live-test.js` + ad-hoc REST 都改走 resources 一個 minor 版本

兩條達成才走 major bump 3.0.0 拔。完整 tracker 見
`docs/roadmap/04-protocol-extensions.md` T-P3-1 區塊。

---

## 📋 待動工 Backlog（依優先序）

### B-1：description 精簡 + tools.md 重生 ✅ done at v2.1.7

`commit ff62dd7`（codex 一次完成 14 個 category / 160 個 tool）。
細節見上方 §NEXT SESSION ENTRY POINT。

### B-2：P3 protocol extensions（active backlog，下一個動工目標）

關注點是「清理架構 + 持續優化 + 穩定維護」，P3 三個 sub-task 排序：

| Sub-task | 動工順序 | 主要價值 | 預估工時 |
|---|---|---|---|
| **T-P3-1 Resources** | **第一個動工** | read-only state 與 mutation tool 分離；client 可選擇性載入大資源；架構清理 | ~3-5 天 |
| **T-P3-3 Notifications** | 第二個動工 | 解 stale UUID retry 循環；需實機驗 cocos broadcast 行為 | ~3 天 |
| T-P3-2 Prompts | 有空再做 | UX feature（Claude Desktop slash command），無架構價值 | ~2 天 |
| T-P3-4 stdio | **跳過** | cocos editor 內跑 stdio 不自然；roadmap 自己標可選 | — |

#### T-P3-1 Resources（細拆）

**目標**：把 read-only state 從 `tools/list` 抽出來、走 `resources/*`
協議。Client（Claude Desktop / Claude Code）可選擇性載入大資源；新增
read-only API 時方向明確（不再走 tool）。

**Prior art（動工前必讀）**：

- `cocos/cocos-cli` 是官方 CLI 且 ship MCP server（`cocos start-mcp-server`，
  build 在 `fastmcp` 上）。`src/mcp/resources.ts` + `src/mcp/mcp.middleware.ts`
  是官方 URI scheme 的 anchor。雖然它是 standalone CLI（不是 editor 內擴充，
  call 不到 `Editor.Message`），URI 命名 / resources 結構應對齊。
- `FunplayAI/funplay-cocos-mcp` 是唯一 ship `tools + resources + prompts`
  的編輯器擴充。`lib/resources.js` 已經用 `cocos://` 前綴 + ResourceTemplate
  pattern（`cocos://scene/node/{path}`、`cocos://asset/info/{uuid_or_path}`）。
  與我們架構同源（embedded extension），是最直接的 prior art。
- 9 repo 調查（含 tidys、RomaRogov、harady、Spaydo 等）**沒有任何一家**
  實作 MCP notifications/subscribe，T-P3-3 是 first mover。

**URI scheme 決議**：採用 `cocos://`（兩個 prior art 都用），生態對齊。

**選哪些做 resource**：候選是「沒副作用 + 一次回大塊狀態」的 tool。

| URI | 對應 tool | 為什麼 |
|---|---|---|
| `cocos://scene/current` | `scene_get_current_scene` | 場景元資料；最常用 |
| `cocos://scene/hierarchy` | `scene_get_scene_hierarchy` | 完整 node tree；資料量大、值得 client cache |
| `cocos://scene/list` | `scene_get_scene_list` | 全專案場景清單 |
| `cocos://prefabs` | `prefab_get_prefab_list` | 全專案 prefab 清單 |
| `cocos://project/info` | `project_get_project_info` | 專案元資料 |
| `cocos://assets{?folder}` | `project_get_assets` | 參數化 query；用 ResourceTemplate |

**不選**的 read-only tool：細粒度的 `get_node_info` / `get_components`
/ `get_component_info` 維持 tool（每次拿一個 UUID 不適合走 resource
URI 列舉）。

**實作步驟**：

0. **Prior-art 讀通**：WebFetch 上述兩支檔案，落檔
   `docs/research/t-p3-1-prior-art.md`——三家（cocos-cli / FunplayAI / 我們）
   URI 表 side-by-side、命名差異、有沒有要調整 6 個 URI。**估 30 分**。
1. 在 `source/mcp-server-sdk.ts` `buildSdkServer()` 內：
   - 加 capability `resources: { listChanged: true, subscribe: false }`
     （subscribe 留給 T-P3-3）
   - `setRequestHandler(ListResourcesRequestSchema, …)` 回傳上表靜態
     資源清單
   - `setRequestHandler(ListResourceTemplatesRequestSchema, …)` 處理
     參數化 URI（如 `cocos://assets{?folder}`）
   - `setRequestHandler(ReadResourceRequestSchema, …)` 依 URI 分派到
     對應 ToolExecutor，把回傳轉成 `contents: [{ uri, mimeType, text }]`
2. 加一個 `source/resources/registry.ts` 做 URI → handler 對應，避免
   把 routing 邏輯塞進 server 主檔（鏡像 `tools/registry.ts` 的形狀）
3. 對應的 read-only tool **保留**，description 補一行
   「Also exposed as resource `cocos://...`. Prefer the resource for
   full-state reads.」——不破壞舊 client，也讓新 client 知道優先順序
4. 擴 `scripts/smoke-mcp-sdk.js`：加 `resources/list` + `resources/read`
   的 round-trip check
5. 補 `scripts/measure-tool-tokens.js`：把 resources schema 列入量測，
   確認 `tools/list` 不會變大；resources 額外 overhead 量化

**驗證**：

- [ ] tsc clean、smoke 綠
- [ ] 用 MCP Inspector 或 Claude Desktop 連線，能 list / read 上述 URI
- [ ] `tools/list` 大小不退化（新增 deprecated 提示是 +字數，OK 但要
      確認沒 +30% 級別）
- [ ] 文件更新：`docs/architecture/overview.md` 加 Resources 區塊；
      `docs/roadmap/04-protocol-extensions.md` 標 T-P3-1 ✅
- [ ] dist + package.json 同步到 cocos_cs 安裝路徑

**Deprecated 生命週期**（tool 標 deprecated 後何時清）：

- 條件 A：主流 client（Claude Desktop / Claude Code / Cline / Continue）
  全部支援 `resources/*`
- 條件 B：自家 `live-test.js` + ad-hoc curl 都改走 resources，REST 短路
  停用一個 minor 版本以上
- 兩條都達成才走 major bump（3.0.0）拔舊 tool。在那之前 tool **保留**、
  description 帶 deprecation 提示
- 文件落點：`CHANGELOG.md` v2.2.0 加 Deprecated 區塊；
  `docs/roadmap/04-protocol-extensions.md` 加 deprecation tracker 表
  （tool / deprecated since / scheduled removal / current usage signal）

**測試**（不需新 framework）：

- `scripts/smoke-mcp-sdk.js` 加 equivalence check：每個 resource read 完
  跑一次對應 tool call，斷言兩邊 JSON 相等（容忍 timestamp）
- `scripts/live-test.js` 加 6 個 URI 的 round-trip 對照——實機 cocos
  editor 環境也對等

**版本策略**：minor bump（2.1.7 → 2.2.0），因為 capability 擴張屬
public surface 增加。

**風險**：

- Cocos `Editor.Message` 在 resource read handler 裡呼叫的時機與在 tool
  handler 裡一致，不會有 context 差異——已驗證 SDK transport 在
  request handler 內可正常 await `Editor.Message.request(...)`。
- 如果某個 client 不支援 resources capability，server 端 capability
  negotiation 會自動忽略——舊 client 不受影響。

#### T-P3-3 Notifications（粗拆，動工前再細）

**前置**：T-P3-1 已落地（resources 才有東西可推 `list_changed`）。

**做法骨架**：

1. 先寫 `scripts/probe-broadcast.js`：以 stub `Editor.Message` 偵聽
   `scene:change-node` / `scene:close` / `asset-db:asset-add` 等事件，
   記錄事件密度（拖節點 / 改屬性 / 存場景時各推幾下）
2. 設計 debounce / 合併規則：同一 URI 1 秒內最多一次 `notifications/
   resources/updated`
3. server capability 補 `resources: { subscribe: true, listChanged: true }`
4. 在 `source/main.ts` `load()` 註冊 broadcast listener，`unload()`
   解除——避免 reload extension 時 leak
5. 透過 sdkServer.notification(...) 推送到所有活躍 session

**動工前必做**：probe-broadcast 那支 script 跑出實機數據，否則
debounce 策略只能猜。

#### T-P3-2 Prompts（最低優先）

純 UX feature。等 T-P3-1 + T-P3-3 落地、且 user 有實際需求再做。
roadmap 04 章已有候選清單（create-ui-button / duplicate-prefab /
setup-2d-scene）。

### B-3：Prefab byte-level 比對（觸發再做）

v1.4.0 #1 — code path 全 façade（v2.1.3 砍 ~1700 行手刻 JSON），
但缺 byte-level diff 驗證。等有人回報不一致或主動配「乾淨 fixture
專案」session 比對時再做。

---

## 📊 v1.4.0 / v1.5.0 落差現況

判斷新需求對不對齊時的快查表。**這份表是 HANDOFF 的常駐內容，逐 session
更新**；過去各 session 的詳細修補史搬到
[`archive/handoff-history.md`](archive/handoff-history.md)。

| 項目 | 狀態 | 何時做 |
|---|---|---|
| v1.4.0 Prefab 100% 對齊（fileId / `__id__` 全鏈路） | 🟡 code path 全 façade（v2.1.3 砍 ~1700 行手刻 JSON），缺 byte-level diff 驗證 | **B-3 觸發再做**：有人回報 byte-level 不一致時、或主動配「乾淨 fixture 專案」session 比對 |
| v1.5.0 #1 工具收斂為 50 個 | ❌ **closed**（量測後否決，2026-05-01） | 不再做（lossless 反而 +37%；lossy 達 -67% 但丟 arg validation；見 ADR 0001 補註） |
| v1.5.0 #2 token -50% | ❌ **closed**（量測證實是 lossy-only 行銷數字） | 不再做；後續若要降 prompt 走 P3 Resources/Prompts |
| v1.5.0 #3 Prefab 完整 API | ✅ done（P4 T-P4-3 + v2.1.4 set_link 合併） | — |
| v1.5.0 #4 事件綁定 | ✅ done（P4 T-P4-1 + v2.1.2 持久化修補） | — |
| v1.5.0 #5 介面參數更清晰 | ✅ done at v2.1.7（B-1 commit `ff62dd7`，14 個 category / 160 個 tool 全部改寫） | — |
| v1.5.0 #6 面板 UI 簡潔 | ✅ done（P4 T-P4-2，縮小範圍只拆 composable） | — |
| v1.5.0 #7 整體架構效率 | ❌ 跳過（無可測指標，ADR 0001） | — |

---

## 進度快照（最後更新：2026-05-02 B-1 description sweep / v2.1.7）

```
P0 ✅ done
P1 ✅ done
P4 ✅ done（v2.1.1 程式碼 + v2.1.2 修補 EventHandler 持久化）
v2.1.2 ✅ done（P1 host-side nudge 4d15563 + P2(b) 拿 placeholder + P3 文件訂正）
v2.1.2-audit ✅ done（round-1 d5c97ef + project sweep e2ffa3d/ccb5d04）
v2.1.3 ✅ done（scene-bridge migration + prefab fallback 大清掃 + _componentName 修補）
v2.1.4 ✅ done（Solo backlog 6 條 + /review 反修 1 條）
v2.1.5 ✅ done（live-test backlog 5 條全清，每條 user-driven 實機驗證）
v2.1.6 ✅ done（P2 量測 close 12c20c4 + 死碼清掃 -3286 行 05d865e）
v2.1.7 ✅ done（本 session：B-1 description sweep 全 14 categories / 160 tools，commit ff62dd7）
P2 ❌ closed（量測後否決：lossless +30.4% / lossy -63.5% 但丟 validation）

待動工（依優先序，詳見 §待動工 Backlog）：
B-2 ⏳ P3 protocol extensions（next：T-P3-1 Resources，~3-5 天 / minor bump 2.2.0）
B-3 ⏳ Prefab byte-level 比對（觸發再做）
```

## 環境快速確認

```bash
cd D:/1_dev/cocos-mcp-server
git status                    # 應為乾淨
git log --oneline -6          # 最頂為 ff62dd7（docs(tools): rewrite descriptions, bump 2.1.7）

# tsc + smoke + 工具數
npm run build                 # 預期 tsc 無輸出
node scripts/smoke-mcp-sdk.js # 預期 ✅ all smoke checks passed
node -e "const {createToolRegistry} = require('./dist/tools/registry.js');
const r = createToolRegistry();
let total = 0;
for (const c of Object.keys(r)) total += r[c].getTools().length;
console.log('categories:', Object.keys(r).length, 'tools:', total);"
# 預期：categories: 14 tools: 160

# P2 量測重跑（任何時候都可重跑、輸出穩定，可拿來做 regression 比對）
node scripts/measure-tool-tokens.js
# 預期：router-A +30.4% / router-B -63.5% / decision: CLOSE P2
# 註：v2.1.7 描述變長，current schema 從 51,983 chars 增至 ~54,700；
# 兩個收斂形態與 current 的差距同步收斂，但仍遠超 close 線

# tools.md 重產（B-1 description sweep 每批改完都要跑）
node scripts/generate-tools-doc.js
# 預期：wrote .../docs/tools.md (14 categories, 160 tools)

# 歷史 landmine 檢查（應全無輸出）
grep -rE "lizhiyong|fixCommonJsonIssues" source/   # P0
grep -rE "'apply-prefab'|'revert-prefab'|'load-asset'|'connect-prefab-instance'" source/   # T-P1-6
grep -rE "openToolManager|panels/tool-manager" source/ package.json   # v2.1.6 cleanup（dead panel）

# v2.1.6 同步檢查（應全相等）
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

## 文件入口

- 整體 roadmap：`docs/roadmap/README.md`
- P1 詳細任務 + 進度：`docs/roadmap/02-architecture.md`
- P3 規劃（Resources/Prompts/Notifications）：`docs/roadmap/04-protocol-extensions.md`
- P4 詳細任務 + 進度：`docs/roadmap/05-v15-spec-parity.md`
- **v1.5.0 可行性分析（P4 落地依據）**：`docs/analysis/v15-feasibility.md`
- 程式碼地雷清單：`CLAUDE.md` §Landmines（P0 + T-P1-6 已修的標 ✅；v2.1.6 補 #10/#11/#12）
- ADR 0001（不追 v1.5.0 spec 的決策 + P2 量測補註）：`docs/adr/0001-skip-v1.5.0-spec.md`
- 上游差異分析：`docs/analysis/upstream-status.md`
- 工具參考（auto-generated）：`docs/tools.md`
- **歷史 session 詳細修補史**：`docs/archive/handoff-history.md`（v2.1.0 ~ v2.1.5 修補史 + Phase 1-3 落地紀錄；HANDOFF 只留當前可動工項目）

## 回滾錨點

| 退到哪個狀態 | 指令 |
|---|---|
| v2.1.7 description sweep 改動前（v2.1.6 release 點） | `git reset --hard 05d865e` 然後 `git push --force-with-lease` |
| v2.1.6 死碼清掃前（保留 P2 close 的 doc 改動） | `git reset --hard 12c20c4` 然後 `git push --force-with-lease` |
| v2.1.6 全部改動前（P2 close 也退） | `git reset --hard 18810a0` 然後 `git push --force-with-lease` |
| v2.1.5 改動前（v2.1.4 release 點） | `git reset --hard 6cc295f` 然後 `git push --force-with-lease` |
| v2.1.5 batch 中段（#3 scene template 後、#4 preserveContentSize 前） | `git reset --hard cf2272a` 然後 `git push --force-with-lease` |
| v2.1.4 改動前（v2.1.3 release 點） | `git reset --hard 9b7f1f7` 然後 `git push --force-with-lease` |
| v2.1.4 prefab cleanup 後、component-tools dedup 前 | `git reset --hard ca4c760` 然後 `git push --force-with-lease` |
| v2.1.4 review 反修前（成功合進但 trim regression 還在） | `git reset --hard dfdb335` 然後 `git push --force-with-lease` |
| Panel 直式改動前（v2.1.1 release 點） | `git reset --hard 62f6e83` 然後 `git push --force-with-lease` |
| v2.1.1 改動前（v2.1.0 release 點） | `git reset --hard ac1248e` 然後 `git push --force-with-lease` |
| P4 開工前（只留 P1 done） | `git reset --hard afc4753` 然後 `git push --force-with-lease` |
| T-P1-1 改動前（保留 T-P1-2~6） | `git reset --hard d5b0484` 然後 `git push --force-with-lease` |
| T-P1-6 改動前（保留 zod 全部） | `git reset --hard 1035407` 然後 `git push --force-with-lease` |
| T-P1-4 全部改動前（只留 P0 + logger/registry） | `git reset --hard c411a9b` 然後 `git push --force-with-lease` |
| P1 全部改動前（只留 P0） | `git reset --hard 7fb416c` 然後 `git push --force-with-lease` |
| Fork 起點 | `git reset --hard 754adec` 然後 `git push --force-with-lease`（會丟掉所有本 fork commit）|

`--force-with-lease` 比 `--force` 安全，會檢查遠端沒被別人推過。
