# Cross-repo survey — v2.10 archive

> **Archived 2026-05-03** when v2.11.x cycle started. The current survey
> is at [`docs/research/cross-repo-survey.md`](../../research/cross-repo-survey.md).
> This file preserves the v2.10-era snapshot verbatim: the v2.10 推進清單
> (#1-#13, mostly shipped during v2.10.0-v2.10.5), the v2.2.0 baseline
> comparison table, and the LOC 重量檔案盤點 (file sizes pre v2.11).

---

# Cross-repo survey

最後更新：2026-05-02（v2.10 refresh）

對照分析 6 個 cocos-mcp / cocos-cli 相關 repo。Per-repo 深入筆記在
`repos/`，本文檔是 overview + 決策摘要 + v2.10 推進清單。

Reference repos clone 在 `D:/1_dev/cocos-mcp-references/`（read-only，
不會 commit 進 project tree）。

> 修訂歷史：原版（2026-05-02 早段）比對基準是我們 v2.2.0 / 160 tools；
> 本次 v2.10 refresh 把基準更新到 v2.9.7 / 181 tools / 18 categories /
> 16,208 LOC，並補上 v2.10 推進清單。原始 v2.3-v2.7 決策表保留在文末。

## v2.9.7 對照表

| repo | tools | categories | LOC | protocol | 主要看點 |
|---|---:|---:|---:|---|---|
| **本專案 v2.9.7** | **181** | **18** | **16,208** | MCP（SDK） | Notifications + landmine 補丁 + 三方 review |
| harady (cocos-creator-mcp) | ~169 | 13 | 7,037 | MCP（SDK） | GameDebugClient 注入 + MediaRecorder（format） |
| Spaydo (cocos-mcp-extension) | ~196* | 14 | 7,136 | MCP（SDK） | animation-tools 8 + file-editor + get_users(uuid) |
| RomaRogov-cocos-mcp（原版） | 16 macro + 21 interpreter | 16 macro | 9,194 | MCP（SDK） | asset-interpreters 21 個專用 + macro-routing |
| cocos-code-mode（Roman 繼任） | 24 macro | 7 | 5,569 | UTCP | InstanceReference + 完整 TS class 生成 |
| FunplayAI (funplay-cocos-mcp) | ~94 | ~9 | 5,306 (JS) | MCP（手刻 JSON-RPC） | execute_javascript primary + prompts capability |
| cocos-cli（官方） | ~61 | ~8 | 13,600 | MCP（fastmcp） | `@tool` decorator + Gemini-compat 中介層 |

\* Spaydo 196 是估算（含 op-router 子操作展開），需實機校驗才精確。
LOC 為 source TS/JS（不含 dist / node_modules）。"同架構" 全為 embedded
cocos editor extension（除 cocos-cli 是 standalone CLI）。

## v2.10 Preview landmine 結論（重要）

**Landmine #16（preview_control 凍結）+ #17（set_preview_mode 無聲 no-op）
皆無法靠抄參考專案解決**：

- 6 個參考專案中只有 harady（`debug-tools.ts:486`）和 cocos-code-mode
  （`editor-tools.ts:30`）有 preview start/stop 工具，皆使用
  `Editor.Message.request('scene', 'editor-preview-set-play', true)`
  ，**與我們走的 `cce.SceneFacade.changePreviewPlayState` 是同一支底層 race**
  ，無一倖免。
- 我們 `source/scene.ts:1016` 註解早就提過 `editor-preview-set-play`
  channel；走 typed facade 是型別安全考量，但凍結問題與 channel 選擇無關。
- 沒有任何參考專案 ship 過可運作的 preview-mode setter。`preview.current.platform`
  在 cocos 3.8.7 對外完全是 read-only。
- `debug_check_editor_health` 用 `getCurrentSceneInfo` 探測，已知會誤報
  「健康」即使 editor 已凍結（CLAUDE.md #16 retest 結論）。harady 同樣盲點。

**v2.10 處理方式（已 land）**：
- `debug_preview_control(op="start")`：保留 park gate（`acknowledgeFreezeRisk`），
  description 改為明確指向兩個替代路徑（embedded screenshot / game_command），
  不再宣稱「pending reference comparison」。
- `debug_set_preview_mode`：從「⚠ EXPERIMENTAL 試 4 strategy」改為
  「❌ NOT_SUPPORTED 預設硬擋」，需明確 `attemptAnyway=true` 才進入 4-strategy 診斷探測；
  errored response 直接引導使用者用 cocos UI 下拉。
- 兩個 tool 的調用本身都不會凍結 editor — 只有 `preview_control(start)` 走完
  facade 後 cocos 自己內部觸發；本層的職責是擋住誤觸。

## 先前推進過的 4 項計畫 — 實作狀態盤點

| 項目 | 狀態 | 證據 / 缺口 |
|---|---|---|
| 1. Discover-then-act 三步式 | 🟡 **部分落地**（=#3） | 來源 cocos-code-mode README §How It Works：「(1) Get scene tree → (2) Get type definition → (3) Set properties by name」三步式。我們三步的 tool 都有：Step 1 ✅ `node_get_node_tree` 等 / Step 2 🟡 `inspector_get_instance_definition`（部分）/ Step 3 ✅ `component_set_component_property` 等。**Gap = Step 2 的完整度，等同項目 #3**；兩者實質同一件事的不同說法。Optional 加值：用已 ship 的 `prompts/` framework 加一個 workflow template 強化 AI 順序遵守。 |
| 2. InstanceReference {id, type} | ✅ **已 ship**（v2.4.0） | `source/lib/instance-reference.ts` 定義 schema；inspector-tools / asset-meta-tools / component-tools 都 wired。 |
| 3. 動態 TS 定義生成 | 🟡 **部分完成** | `inspector_get_instance_definition` (inspector-tools.ts:96) 只支援 node dump → TS class；缺 component/asset 分支、缺 `@property` decorator、缺 enum / nested type、缺 ProjectSettings 內省。完整版見 cocos-code-mode `source/utcp/tools/typescript-defenition.ts`。 |
| 4. Asset importers / interpreters 系統 | 🟡 **部分完成** | `source/asset-interpreters/` 有 4 檔（interface / base / manager / specialized），8 個 interpreter（Image/Texture/SpriteFrame/Fbx/Material/Effect/Particle/Unknown）— 對 RomaRogov `source/mcp/tools/asset-interpreters/` 的 21+ 個（含 Animation / Audio / Prefab / Scene / Atlas 等）只達 ~38% 覆蓋。 |

> **Prompts capability 修正**：先前版本誤標 FunplayAI Prompts 為「v2.5.0 spillover / 待做」。
> 實機驗證 `source/mcp-server-sdk.ts:177` 已掛 `ListPromptsRequestSchema` + `GetPromptRequestSchema`
> handler，4 個 template 完整 ship 於 v2.5.0 T-V25-4。從 v2.10 推進清單移除。

## v2.10 推進清單（候選池，依優先序）

> 顯式取消的：
> - landmine #16/#17 不再列為「對比參考解決」工作項，已認定為 cocos
>   3.8.7 內建限制；改為文件 + tool guard 處理（已 land 於 v2.10.0）。
> - 原 #6「Prompts capability」移除 — 實機驗證已 ship 於 v2.5.0 T-V25-4。
>
> 全部優化 LOC 項目（top-5 + 進一步盤點，~950 LOC）已 fold 進 #10 / #11 / #12。

### 功能擴充（feature work）

| # | 來源 | 內容 | 估時 | 風險 |
|---|---|---|---|---|
| 1 | cocos-code-mode | **完整 TS class 定義生成擴充**（= Discover-then-act 三步式 Step 2 補完）：補上 component dump 分支、`@property` decorator、enum / nested type 渲染、ProjectSettings 內省 | 1.5 天 | 低 — 純擴充 inspector-tools.ts，不動 schema layer |
| 2 | harady | **`debug_game_command` sub-action 補齊**：`state` (GameDb dump) / `navigate` (page-by-name) / runtime UITransform/Widget/Layout `inspect` 強化 | 1 天 | 低 — 走既有 GameDebugClient 注入；client template 需擴充 |
| 3 | RomaRogov | **asset-interpreters 擴充**：從 8 個專用補到 ≥15 個（補 Animation / Audio / Prefab / Scene / Atlas / Tiled / Spine / Json） | 2 天 | 中 — 每個 interpreter 需驗證 cocos meta schema |
| 4 | Spaydo | **animation-tools 補 4 個**：`list_animation_states` / `get_animation_state_info` / `set_animation_speed` / `check_animation_finished` | 0.5 天 | 低 |
| 5 | harady | **`debug_record_*` 加 format/quality 控制**：`mp4` fallback、explicit codec 選擇、quality preset | 0.3 天 | 低 |
| 6 | FunplayAI | **Tool priority labeling**：description 補 `[primary]` / `[specialist]` 標記，引導 AI 偏好 execute_javascript | 0.3 天 | 無 |
| 7 | Spaydo | **`get_users(uuid)`**：找出某 asset 被誰參考（refactor 安全網） | 0.3 天 | 低 |
| 8 | RomaRogov | **macro-tool enum routing 推廣**：preferences-tools 13 個 → 1 個 `operate_project_settings` op-router（v2.9.x 已對 reference-image 試過） | 1 天 | 中 — 影響 schema 介面 |
| 9 | cocos-code-mode + 自家 | **Discover-then-act workflow prompt template**（optional）：用 v2.5.0 已 ship 的 `prompts/` framework 加一個 template，引導 AI 按三步走 | 0.3 天 | 無 |

### 文件 / 描述 重構（doc & description）

| # | 內容 | 估時 | 風險 |
|---|---|---|---|
| 10 | **Tool description / title 重構**（已派發 codex gpt-5.4，背景跑中）：(a) `tools.md` generator 改用 TOC + `<details>` 摺疊；(b) 每 tool description 第一句 ≤120 char summary；(c) 加 `annotations.title` ≤50 char；(d) 整體 trim 冗述 | 1.5 天（codex） | 中 — 涉及 181 tool 描述 + lib + protocol 響應；需驗證 Gemini-compat 不破 |

### LOC 精簡（refactor / polish）

合計約可省 **~950 LOC**（5.9% 全專案），分三批安排避免一次大改：

| # | 內容 | LOC 省 | 估時 | 風險 |
|---|---|---:|---|---|
| 11 | **Polish 批 A — 最低風險**：(a) `ToolResponse` envelope helper `ok()` / `fail()` 取代 167 處字面；(b) `vec3Schema` / `vec4Schema` / `referenceSchema` 抽 `lib/schemas.ts`；(c) component-tools / debug-tools 的 narrative 描述外移到資料檔 | ~300 | 1 天 | 低 |
| 12 | **Polish 批 B — 中型檔案精簡**：top-5 餘額（component fallback wrapper / debug log-parser / scene concurrency 註解 / node 2D-3D 抽常數 / mcp-server CORS helper）+ 中型檔案（project / scene-tools / scene-advanced / asset-advanced / scene-view / file-editor）narrative 外移 | ~500 | 1.5 天 | 低 |
| 13 | **Polish 批 C — 中等風險**：移除冗餘 try/catch（已被 `defineTools()` 包外層）、scene.ts envelope builder 統一 | ~150 | 1 天 | 中 — 需驗證 control flow |

> Decorator unification（`@mcpTool` 全面化）省 150-250 LOC 但 effort 高、改動 16 檔，留 v3.0。

### 推薦執行順序

階段一（v2.10.1，立即可動）：#10（codex 跑中）→ tools.md 重生
階段二（v2.10.2，~3 天）：#1 + #2 + #4 + #11（user 明確要求 #1/#2，#4 順手，#11 LOC polish 與 description 重構成果衝突最低先做）
階段三（v2.10.3，~3 天）：#3 + #5 + #6 + #7 + #12
階段四（v2.10.4 或 v2.11，~2-3 天）：#8 + #9 + #13

## LOC 重量檔案盤點

Top 5 檔案 = 6,721 / 16,208 LOC = **41.5%** 全專案 LOC。

| 檔案 | LOC | 功能概要 | 重量來源 | 主要精簡建議 |
|---|---:|---|---|---|
| `tools/component-tools.ts` | 1,943 | 11 個 component CRUD / 屬性 setter / event handler tool；landmine #11 nudge 邏輯所在 | (a) 內嵌 70+ LOC user-facing 屬性敘述；(b) enum list 兩 tool 重複；(c) Editor API + scene fallback 雙路徑重複 6 次 | 1. 拆 `data/component-property-docs.ts` 抽 narrative（-40）2. enum 抽常數（-20）3. fallback wrapper（-80，需保留 nudge 不通用）|
| `tools/debug-tools.ts` | 1,843 | 11 個 debug tool：execute_javascript / screenshot / record / preview / log / TS diagnostics / game_command | (a) 多行 `.describe()` ~300 LOC；(b) log filter / regex 三個 method 重寫；(c) 路徑 containment 重複 | 1. log-parser 抽 lib（-60）2. doc 抽資料檔（-120）3. fallback wrapper（-40）|
| `scene.ts` | 1,060 | 18 個 scene-script 方法：facade probe / console capture / preview / animation / prefab | (a) v2.4.8/9/10 concurrency 註解 ~150 LOC；(b) facade probe 邏輯重複；(c) `{success, error/data}` envelope ~90 處 | 1. concurrency 註解外移 CONCURRENCY.md（-50）2. probe helper（-25）3. envelope builder（-25）|
| `tools/node-tools.ts` | 1,018 | 12 個 node CRUD / transform / 2D-3D heuristic | (a) reference 解析 boilerplate ×7；(b) transform 正規化 2D vs 3D 重寫；(c) 2D component list 三處重複 | 1. 2D/3D component 抽常數（-30）2. reference 解析 inline util（-20）3. createNode layer 邏輯抽 helper（-50）|
| `mcp-server-sdk.ts` | 857 | MCP HTTP server 核心：session / CORS / route / SDK Server bridge | (a) CORS header 設定重複；(b) pathname 路由 if-chain；(c) origin 政策 narrative 註解 ~80 LOC | 1. CORS helper（-30）2. 路由表化（-40）3. 政策註解外移 CORS-POLICY.md（-20）|

合計約可省 **~520 LOC**（top-3 ROI 約 350 LOC、effort 3-4 hr）。
landmine 風險：所有建議都不動 #11 / #14 / #15 邏輯路徑；narrative 外移
與 enum 抽常數零風險；fallback wrapper 需保留 nudge 不通用化。

實作建議：v2.10 收一個「polish patch」slot 做最容易的三項（component
narrative 外移、enum 抽、debug-tools narrative 外移），其餘等動 component-tools
時順手做。

## 對照表（原 v2.2.0 baseline，保留歷史紀錄）

| repo | tools | LOC | protocol | resources | prompts | notifications | 同架構 | 主要看點 |
|---|---:|---:|---|:---:|:---:|:---:|:---:|---|
| ours v2.2.0 | 160 | 10,912 | MCP（SDK） | ✅ 6+2 | ❌ | ❌ | — | — |
| harady | 161 | 7,037 | MCP（SDK） | ❌ | ❌ | ❌ | ✅ | debug_screenshot / debug_record / debug_game_command |
| Spaydo | 139 | 7,136 | MCP（SDK） | ❌ | ❌ | ❌ | ✅ | file-editor-tools / animation-tools |
| FunplayAI | 67 | 3,315 | MCP（手刻 JSON-RPC） | ✅ 8+3 | ✅ 4 | ❌ | ✅ | execute_javascript primary tool / interaction-log |
| cocos-code-mode | 24 macro | 5,569 | UTCP | (Code Mode) | ❌ | ❌ | ✅ | InstanceReference / TS 定義生成 / @utcpTool decorator |
| RomaRogov-cocos-mcp | 16 macro | 9,194 | MCP（SDK） | ❌ | ❌ | ❌ | ✅ | asset-interpreters 系統 / macro-tool enum routing |
| cocos-cli | ~1+hooks | — | MCP（fastmcp） | ✅ docs only | ❌ | ❌ | ❌（CLI） | decorator tool registration / Gemini-compat schema patch |

## 採用決策一覽（→ v2.3-v2.7 規劃）

| 來源 | 採用內容 | 排版 | 為什麼 |
|---|---|---|---|
| FunplayAI | `execute_javascript` 統一 sandbox（[primary]） | v2.3.0 | 架構翻轉、複合操作 token 暴降 |
| harady | `debug_screenshot` / `debug_batch_screenshot` | v2.3.0 | AI 視覺驗證閉環 |
| cocos-cli | `text/markdown` docs resources（landmines / tools / handoff） | v2.3.0 | AI 卡關時自助查 |
| FunplayAI / Spaydo | declarative array tool def（單一物件取代三層分離） | v2.4.0 step 1 | 新 tool 摩擦力降 50% |
| harady | `resolveNode()` nodeUuid/nodeName 二選一 | v2.4.0 step 2 | AI-friendly fallback |
| harady | batch property write helper | v2.4.0 step 3 | 少 round-trip |
| **cocos-code-mode** | **InstanceReference `{id, type}` 模式** | v2.4.0 step 4 | type 跟 UUID 一起傳，AI 不丟失 context |
| **cocos-code-mode** | **`@mcpTool` decorator**（descriptor 直接捕獲、不需 reflect-metadata） | v2.4.0 step 5 | 比 cocos-cli `@tool` 更簡潔 |
| **cocos-code-mode** | **`inspectorGetInstanceDefinition` 等效 tool** | v2.4.0 step 6 | 動態 TS 類別定義給 AI、改屬性前先讀不用猜 |
| **RomaRogov-cocos-mcp** | **asset-interpreters 系統**（asset meta editing） | **v2.4.1**（patch，緊接 v2.4.0 重構後） | 我們完全沒有的能力（compress 設定 / FBX / Sprite trim 等）|
| RomaRogov-cocos-mcp | `startCaptureSceneLogs` / `getCapturedSceneLogs` 模式 | v2.4.0 同梱 | AI tool 結果附 cocos console 訊息 |
| Spaydo | `file-editor-tools`（4 個，附 path-safety + asset-db refresh hook）| v2.5.0 | 多 client 廣度（Claude Desktop / Cline 沒原生 file 操作） |
| harady / FunplayAI | TS diagnostics 系列 | v2.4.0 同梱 | AI 工作流避免讀過時錯誤 |
| FunplayAI / Spaydo | Animation tool 系列 | v2.4.0 同梱 | UI/2D 遊戲常用 |
| FunplayAI | `prompts/*` capability 4 個 template | v2.5.0 | UX feature |
| 我們自己 first mover | T-P3-3 Notifications | v2.5.0 | 沒任何 prior art |
| cocos-cli | Gemini-compat schema patch（zod inline 不用 `$ref`） | v2.6.0 | 接 Gemini client 才需要 |
| harady | `debug_game_command` + GameDebugClient injection | v2.6.0 | AI runtime QA 大門 |
| RomaRogov-cocos-mcp | macro-tool enum routing 模式 | v2.7.0 評估 | 中間路線（vs execute_javascript），看實機需求 |
| RomaRogov-cocos-mcp | `decodeUuid` UUID 兼容層 | v2.6.0 同梱 | 接 Gemini 時可能需要 |

## 不採納

| 來源 | 內容 | 不採納理由 |
|---|---|---|
| cocos-code-mode | UTCP-only protocol switch | Claude Code/Desktop/Cline/Continue 全 MCP-native；UTCP 失主流 client；重寫 5-7 天 ≈ v2.3+v2.4+v2.5 加總；80% Code Mode 效益可在 MCP 內取得（execute_javascript per Anthropic paper） |
| RomaRogov | `generate-image-asset` AI 圖生 | domain orthogonal，該放通用 image-gen MCP server |
| 全部 | stdio transport（cocos-cli / harady 預留） | cocos editor 內跑 stdio 不自然、roadmap T-P3-4 標可選 |
| 全部 | Spaydo `file-editor-tools` 對 Claude Code 用戶 | 重複 Edit/Write，但**對其他 client 不重複**——所以 v2.5.0 仍做、tool description 標 `[claude-code-redundant]` |

## 我們獨有功能（盤點結論：全保留）

| 功能 | 是什麼 | 評估 |
|---|---|---|
| Reference image 系統（v2.9.x 收成 1 個 op-router `referenceImage_manage`）| 設計稿疊圖工作流 | ✅ 優勢；v2.9.x macro-routing 試金石 |
| Broadcast log 系統（5 tools）| cocos editor IPC 偵聽 | ✅ T-P3-3 基礎 |
| `validate_*` 三件組 | 半 metadata，AI argument 預檢 | 🟡 可考慮 v2.5 折成 prompt template |
| `begin/end/cancel_undo_recording` | 顯式 undo group 控制 | ✅ |
| Landmine 補丁系列（v2.1.5 五個）| `preserveContentSize` / `create_node.layer` / `create_scene.template` / `save_scene_as` 預檢 / `nudgeEditorModel` | ✅ 必要 |

## 與 cocos-code-mode（UTCP）的關係

**同源不同協議**。Roman Rogov 的繼任專案，主推 UTCP + Code Mode 執行模型。
完整對比 + 為什麼不換 protocol，見 [`repos/cocos-code-mode.md`](repos/cocos-code-mode.md)。

簡述：抄它的 idea（InstanceReference / TS 定義生成 / decorator）不抄它的
protocol stack。詳細推理見對話紀錄 2026-05-02 §UTCP vs MCP。

## 與官方 cocos-cli 的關係

**互補不替代**。cocos-cli 跑在 editor 外（standalone CLI 進程），主能力
是 build / create / import / wizard，MCP 暴露的 tool 圍繞 build 流程；
不能 call `Editor.Message`、不能 mutate live scene。我們是 in-editor
extension，主場景是 live scene 操作。沒有 cocos-mcp 場景能單靠 cocos-cli
解決。

詳細：[`repos/cocos-cli.md`](repos/cocos-cli.md)。

## FunplayAI LOC 為何 3,315？

不換 protocol 的前提下，FunplayAI 三點結構決定壓 LOC：

1. 不用 SDK，手刻 JSON-RPC dispatcher
2. `execute_javascript` 統一 sandbox 把 80% 用例壓進 1 個 tool
3. 沒 zod / 沒 i18n / 沒 tool-manager UI persistence

詳細 + 為什麼不全盤抄：[`repos/funplay-cocos-mcp.md`](repos/funplay-cocos-mcp.md)。
