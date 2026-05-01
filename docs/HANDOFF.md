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

### B-2：擴充功能（active backlog，動工順序如下）

關注點是「清理架構 + 持續優化 + 穩定維護」。T-P3-1 落地後（v2.2.0），
backlog 重排——根據 5 個 reference repo 盤點（見 §跨專案盤點筆記），
最高 ROI 不是 T-P3-3 Notifications，而是借鏡 FunplayAI / harady 的
AI workflow 強化：

| 動工順序 | 項目 | 來源 / 動機 | 估時 | bump |
|---|---|---|---|---|
| **第 1（v2.3.0）** | T-V23-1 `execute_javascript` 統一 sandbox | FunplayAI 架構翻轉：1 個 [primary] 寬 tool + 既有 160 narrow tool 標 [specialist]，AI 複合操作不再打 5-10 個 call | 1-2 天 | minor 2.3.0 |
| **第 2（v2.3.0 同梱）** | T-V23-2 `debug_screenshot` + `debug_batch_screenshot` | harady / FunplayAI：AI 視覺驗證閉環，自己看自己改的結果 | 0.5 天 | 同上 |
| **第 3（v2.3.0 同梱）** | T-V23-3 docs as markdown resources | 借鏡 cocos-cli `text/markdown` 文件型 resource。`cocos://docs/landmines`（CLAUDE.md §Landmines）+ `cocos://docs/tools`（tools.md）；AI 卡關時自助查 | 0.5 天 | 同上 |
| 第 4（v2.4.0） | T-V24-1 `debug_wait_compile` + TS diagnostics 系列 | harady `debug_wait_compile` + FunplayAI `run_script_diagnostics` / `get_script_diagnostic_context`，AI 工作流避免讀過時錯誤 | 1.5 天 | minor 2.4.0 |
| 第 5（v2.4.0 同梱） | T-V24-2 Animation tool 系列 | FunplayAI / Spaydo：`list_animations` / `play_animation` / `stop_animation` / `set_clip` | 1 天 | 同上 |
| 第 6（v2.5.0） | T-P3-3 Notifications | 我們 first mover；前置 probe-broadcast script | 3 天 | minor 2.5.0 |
| 第 7（v2.5.0 同梱） | T-P3-2 Prompts capability | FunplayAI 4 個 project-context-aware prompt template | 1 天 | 同上 |
| 第 8（自成 milestone） | T-V26-1 `debug_game_command` + GameDebugClient injection | harady：注 client 進 preview，AI 自動 runtime 測試大門。需要評估 cocos preview process 的 IPC 介面 | 3-5 天 | minor 2.6.0 |
| 路標保留 | T-P3-4 stdio transport | cocos editor 內跑 stdio 不自然，跳過 | — | — |
| 路標保留 | RomaRogov asset interpreters 系列 | 18 種 asset 專屬 reader（prefab/animation/particle/effect 結構化解析），有需求再做 | — | — |

**重排理由**：原本 T-P3-3 Notifications 排第二，但盤點後發現對 AI
workflow 的立即價值低於 `execute_javascript` + `debug_screenshot`。
Notifications 的價值要等 client 端真的 cache resources 才浮現，
而現在 client 多半 cold-read。先把 AI workflow 強化做厚。

#### T-P3-1 Resources（細拆，已落地 v2.2.0）

**狀態**：✅ done at v2.2.0（commit 4e5ab45）。完整改動見
`docs/roadmap/04-protocol-extensions.md` T-P3-1 區塊。本節保留作
「實作步驟」歷史紀錄，下次動工 T-V23-1 時看這個結構即可，不需重學。

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

#### T-V23-1 `execute_javascript` 統一 sandbox（next active backlog）

**動機**：FunplayAI 架構翻轉的核心。AI 做「讀 → 改 → 驗」複合操作時，
今天得打 3-5 個窄 tool（`get_node_info` → `set_component_property` →
`get_components`），每個 round-trip 都吃 token。一個寬 sandbox tool
讓 AI 在單一 turn 完成。

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
   一個多步腳本、一個故意錯誤；驗 sandbox 不會 leak 到 cocos process

**風險**：editor context eval 有沙箱風險。我們 server 只 listen
`127.0.0.1`，但 user 自己的 prompt 會被 AI 解讀執行——這是 prompt
injection 場景。建議：editor context **預設關閉**，`settings.ts` 加
`enableEditorContextEval: false` opt-in，panel UI 也加開關。

#### T-V23-2 screenshot 系列（next active backlog）

`debug_screenshot`：Electron `webContents.capturePage()` → PNG。
`debug_batch_screenshot`：多個 panel 一次抓。FunplayAI 還有
`capture_game_screenshot` / `capture_preview_screenshot` 兩個
preview-side 的，可放第二批。

#### T-V23-3 docs markdown resources

新增 3 個 markdown resource：

```
cocos://docs/landmines    text/markdown   from CLAUDE.md §Landmines
cocos://docs/tools        text/markdown   from docs/tools.md
cocos://docs/handoff      text/markdown   from docs/HANDOFF.md
```

讀檔時動態載入（不在 build time bake-in），保證 user 改 CLAUDE.md
後馬上反映。AI 卡關時可自助查 landmine 紀錄。

#### T-P3-3 Notifications（v2.5.0，動工前先 probe）

**前置**：v2.3.0 + v2.4.0 落地，給 Notifications 預留實機 prove 的時間。

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
debounce 策略只能猜。9 個 reference repo **沒有任何一家**實作
Notifications/subscribe，我們是 first mover，沒有 anchor 可抄。

#### T-P3-2 Prompts（v2.5.0 同梱）

抄 FunplayAI `lib/prompts.js` 4 個 template 的 pattern：每個
prompt 帶 project context（projectName / projectPath）baked in，
內文引導 AI 優先用 `execute_javascript` 再走 specialist。
4 個建議 template：`fix_script_errors` / `create_playable_prototype`
/ `scene_validation` / `auto_wire_scene`。

### B-3：Prefab byte-level 比對（觸發再做）

v1.4.0 #1 — code path 全 façade（v2.1.3 砍 ~1700 行手刻 JSON），
但缺 byte-level diff 驗證。等有人回報不一致或主動配「乾淨 fixture
專案」session 比對時再做。

---

## 🔍 跨專案盤點筆記（2026-05-02）

5 個 reference repo clone 在 `D:/1_dev/cocos-mcp-references/`：
cocos-cli / funplay-cocos-mcp / cocos-creator-mcp（harady）/
cocos-mcp-extension（Spaydo）/ RomaRogov-cocos-mcp。

### Tool 數量 / LOC 對照

| repo | tools | LOC | resources | prompts | notifications | SDK | 同架構 |
|---|---:|---:|:---:|:---:|:---:|:---:|:---:|
| **ours v2.2.0** | **160** | 10,912 | ✅ 6+2 | ❌ | ❌ | ✅ | — |
| harady | 161 | 7,037 | ❌ | ❌ | ❌ | ✅ | ✅ |
| Spaydo | 139 | 7,136 | ❌ | ❌ | ❌ | ✅ | ✅ |
| FunplayAI | 67 | 3,315 | ✅ 8+3 | ✅ 4 | ❌ | ❌（手刻 JSON-RPC） | ✅ |
| RomaRogov | 16 macro | 9,194 | ❌ | ❌ | ❌ | ✅ | ✅ |
| cocos-cli | ~1+hooks | — | ✅ docs only | ❌ | ❌ | ✅ | ❌（CLI）|

### 我方獨有功能（盤點結論：全保留，無冗餘）

- Reference image 系統（12 tools） — 設計稿疊圖工作流
- Broadcast log 系統（5 tools） — cocos editor IPC 偵聽，T-P3-3 基礎
- `validate_*` 三件組（半 metadata，可考慮 v2.3 折成 prompt template）
- `begin/end/cancel_undo_recording` — 顯式 undo group
- Landmine 補丁系列（v2.1.5 五個 rich tool）：
  `set_component_property.preserveContentSize`、`create_node.layer` auto
  UI_2D、`create_scene.template`、`save_scene_as` 對話框預檢、
  `nudgeEditorModel`（內部，藏於 add/remove_event_handler）

### 對方有、我們缺（已排進 B-2 backlog）

最高 ROI 三件已排 v2.3.0：

- 來自 FunplayAI：`execute_javascript` 統一 sandbox（架構翻轉）
- 來自 harady：`debug_screenshot` / `debug_batch_screenshot`（AI 視覺驗證）
- 來自 cocos-cli：`text/markdown` docs resources（landmines / tools / handoff
  外露給 AI 自助查）

中 ROI 排 v2.4.0：TS diagnostics（FunplayAI）+ animation tools（FunplayAI/
Spaydo）。

不採納：

- Spaydo `file-editor-tools` / FunplayAI `read/write_file` —— Claude Code
  已有 Edit/Write，重複造會混淆
- RomaRogov `generate-image-asset` —— domain orthogonal，該放通用
  image-gen MCP server 不放 in-editor

### MIME 政策定案

`MIME 反映內容類型`（與 cocos-cli 官方做法一致），不一刀切：

- 結構化資料 → `application/json`（我們現在 6 個 resource、cocos-cli
  asset query template 都用這個）
- 文件型 / narrative → `text/markdown`（cocos-cli docs resources、
  我們 v2.3.0 即將加的 docs 系列）
- 自然語言摘要 → `text/plain`（FunplayAI 走這路；我們暫無此類）

### 與官方 cocos-cli 的關係

**互補不替代**。cocos-cli 跑在 editor 外（standalone CLI 進程），
主能力是 build / create / import / wizard，MCP 暴露的 tool 圍繞 build
流程；不能 call `Editor.Message`、不能 mutate live scene。我們是
in-editor extension，主場景是 live scene/node/component 操作。**沒有
任何 cocos-mcp 場景可以單靠 cocos-cli 解決。**

值得借鏡的兩個技術點：

- decorator-driven tool registration（`@Tool` 從裝飾器收 toolRegistry，
  比每個 category 手寫 `getTools()` 集中）—— 長期重構考慮
- Gemini-compat schema patch（手動覆蓋 `tools/list` 把 zod 轉成
  Gemini 接受的 JSON Schema 7、不用 `$ref`）—— 接 Gemini client 時
  會撞同樣的牆，可抄

### FunplayAI LOC 為何 3,315？

三個結構決定：

1. **不用 SDK** — `lib/server.js` 436 行手刻 JSON-RPC dispatcher
   （`if (method === 'tools/list')` cascade）。代價：失 schema
   validation / protocol negotiation / structuredContent。
2. **`execute_javascript` 統一 sandbox** — 1 個 `[primary]` tool
   涵蓋 80% 用例，66 個 `[specialist]` 當補充。複合操作不再 wrap
   多個 narrow tool。
3. **沒 zod / 沒 i18n / 沒 tool-manager UI persistence** —
   inputSchema 直接 JSON Schema inline，panel 單檔，沒上游 1700 行
   prefab JSON 包袱。

不該全盤抄。第 1 條（去 SDK）會丟驗證嚴謹度；第 3 條（去 zod）會
讓 v2.1.5 那五個 rich description 沒地方掛。**第 2 條值得抄**——
排進 v2.3.0 T-V23-1。

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

## 進度快照（最後更新：2026-05-02 T-P3-1 Resources / v2.2.0）

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
v2.1.7 ✅ done（B-1 description sweep 全 14 categories / 160 tools，commit ff62dd7）
v2.2.0 ✅ done（本 session：T-P3-1 Resources，commit 4e5ab45）
P2 ❌ closed（量測後否決：lossless +30.1% / lossy -62.8% 但丟 validation）

待動工（依優先序，詳見 §待動工 Backlog + §跨專案盤點筆記）：
B-2 ⏳ 擴充功能 backlog（next v2.3.0：execute_javascript + screenshot + docs markdown，~2 天）
B-3 ⏳ Prefab byte-level 比對（觸發再做）
```

## 環境快速確認

```bash
cd D:/1_dev/cocos-mcp-server
git status                    # 應為乾淨
git log --oneline -6          # 最頂為 4e5ab45（feat(resources): add MCP resources/* capability，bump 2.2.0）

# tsc + smoke + 工具數
npm run build                 # 預期 tsc 無輸出
node scripts/smoke-mcp-sdk.js # 預期 ✅ all smoke checks passed（含 5 條 resources round-trip）
node -e "const {createToolRegistry} = require('./dist/tools/registry.js');
const r = createToolRegistry();
let total = 0;
for (const c of Object.keys(r)) total += r[c].getTools().length;
console.log('categories:', Object.keys(r).length, 'tools:', total);"
# 預期：categories: 14 tools: 160

# Resource registry 健檢（不需 cocos editor）
node -e "const {createResourceRegistry} = require('./dist/resources/registry.js');
const r = createResourceRegistry({});
console.log('static:', r.list().length, 'templates:', r.listTemplates().length);"
# 預期：static: 6 templates: 2

# P2 量測重跑（任何時候都可重跑、輸出穩定，可拿來做 regression 比對）
node scripts/measure-tool-tokens.js
# 預期：router-A +30.1% / router-B -62.8% / decision: CLOSE P2

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
| v2.2.0 T-P3-1 Resources 改動前（v2.1.7 release 點） | `git reset --hard ab7191b` 然後 `git push --force-with-lease` |
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
