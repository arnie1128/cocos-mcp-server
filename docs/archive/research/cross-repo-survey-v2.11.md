# Cross-repo survey

最後更新：2026-05-03（v2.11.1 refresh）

對照分析 6 個 cocos-mcp / cocos-cli 相關 repo。本文檔是 overview + 決策摘要 +
v2.11+ 候選清單；per-repo 深入筆記在 `repos/`。

Reference repos clone 在 `D:/1_dev/cocos-mcp-references/`（read-only，不會 commit
進 project tree）。

> 修訂歷史：
> - v2.2.0 baseline + v2.3-v2.7 採用決策 → 已歸檔。
> - v2.10 refresh（v2.9.7 baseline）→ [`docs/archive/research/cross-repo-survey-v2.10.md`](../archive/research/cross-repo-survey-v2.10.md)，
>   含 v2.10 推進清單（#1-#13，已於 v2.10.0-v2.10.5 ship 完）+ LOC 重量檔案盤點
>   pre-v2.11 + v2.2.0 baseline table。
> - 本次 v2.11 refresh 把基準更新為 v2.11.1 / 180 tools / 18 categories /
>   16,439 LOC，重新比對參考 repo 最新狀態（commit ≤ 2026-04-30）並挑選
>   v2.11.x+ 候選功能。

## v2.11.1 對照表

| repo | tools | source LOC | most-recent commit | protocol | 主要看點 |
|---|---:|---:|---|---|---|
| **本專案 v2.11.1** | **180** | **16,439** | 2026-05-03 | MCP（SDK） | `@mcpTool` 全面化 + narrative 外化 + landmine 補丁 + Gemini-compat |
| harady (cocos-creator-mcp) | ~150 | 7,037 | 2026-04-26 | MCP（SDK） | GameDebugClient 注入 + MediaRecorder + 批次節點建立 |
| Spaydo (cocos-mcp-extension) | ~131 | 7,136 | 2026-04-19 | MCP（SDK） | snapshot diff validation + 批次資產工具 + asset tree/manifest |
| RomaRogov-cocos-mcp（原版） | 16 macro | 9,231 | 2026-03-02 | MCP（SDK） | asset-interpreters + image generation pipeline（repo 標已停止支援） |
| cocos-code-mode（Roman 繼任） | 24 macro | 5,574 | 2026-03-30 | UTCP | InstanceReference + 完整 TS class 生成（含 enum/bitmask metadata） |
| FunplayAI (funplay-cocos-mcp) | ~58 | 5,306 (JS) | 2026-04-30 | MCP（手刻 JSON-RPC） | execute_javascript primary + OS 層輸入模擬 + core/full profile |
| cocos-cli（官方） | 45 `@tool` | (CLI 全棧) | 2026-04-30 | MCP（SDK） | 官方 builder/asset internals + Gemini middleware schema patch |

LOC 為 source TS/JS（不含 dist / node_modules / 測試 fixture）。"同架構" 全為
embedded cocos editor extension（除 cocos-cli 是 standalone CLI）。
Tool count 用各 repo 的 registration pattern（`@tool` / `@utcpTool` / `defineTools` /
手刻陣列）粗略計算，op-router 子操作未展開。

## 觀察：參考 repo 大多進入維護期

- harady 最後活動 2026-04-26，僅 doc 修補。
- Spaydo 最後活動 2026-04-19，且 revert 掉 monorepo 重組（再次定型於單 repo + 單 register pattern）。
- RomaRogov 原版 README 已標停止支援（2026-03-02 起），重心轉至 cocos-code-mode。
- cocos-code-mode 最後活動 2026-03-30，PR 為小幅補強。
- FunplayAI 最後活動 2026-04-30（v0.1.2 release）。
- cocos-cli 仍活躍（官方），最近 PR 補多節點選擇（#525）。

→ 我們是這 6 個 repo 中近期變動最頻繁的一個（v2.10.x 5 個 patch 一個 cycle wrap、
v2.11.0/v2.11.1 兩 cycle starter）。後續比對基本上是「我們持續 ship、它們穩定」。

## v2.11.x 候選清單（依參考 repo gap 排序）

> 已不在候選的：
> - landmine #16/#17（cocos 3.8.7 preview-mode）— 6 repo 無一倖免，認定為 cocos
>   內建限制，已於 v2.10.0 文件 + tool guard 處理結案。
> - Discover-then-act 三步式（v2.10.4 已 ship `discover_then_act` prompt template）。
> - asset-interpreters 擴充（v2.10.3 8→15、v2.10.5 補 TiledMap）。
> - animation state 工具（v2.10.2 補完 4 個）。
> - get_users / 工具標記 / preferences macro / record format-quality（皆 v2.10.x ship）。
> - tool description / title 重構 + ok()/fail() helpers + schemas 抽取（v2.10.x 完成）。
> - **完整 TS class 定義生成**（v2.10.2 #1 已 ship — component dump 分支 + `@property` decorator + enum/bitmask metadata + nested type；inspector-tools.ts:139 `renderTsClass` / `processTsClass`）。

| # | 來源 | 內容 | 估時 | 風險 | 備註 |
|---|---|---|---|---|---|
| 1 | harady | **批次節點/排版三件套**：`node_create_tree`（JSON spec → 樹狀節點）、`node_set_layout`（cc.Layout 一次設定）、`prefab_create_from_spec`（spec 直建 prefab + 自動 autoBind，整合 #1+#2） | 1.5 天 | 低 | 高 ROI，省一連串 `create_node` + `set_property` round-trip。`create_from_spec` 是三者集成版 |
| 2 | harady | **`component_auto_bind`**：自動把 script `@property` editor reference 綁到場景對應名稱節點，含 `fuzzy`/`strict` 模式 + `force` flag | 0.5 天 | 低 | 重複勞動殺手；同時是 #1 的 `prefab_create_from_spec` 必要組件 |
| 3 | Spaydo | **`validation_take_snapshot` / `validation_compare_snapshots`**：場景快照 + node-level diff（added/removed/modified），AI 改完場景的回歸檢查 | 1 天 | 低 | 注意：是 **content-level diff**，與 `sceneAdvanced_scene_snapshot`（Cocos undo snapshot）機制不同，要實作場景狀態序列化 |
| 4 | Spaydo | **資產清查兩件**：`asset_get_tree`（樹狀層級回傳）+ 把現有 `assetAdvanced_get_unused_assets` 從 placeholder 升級成真正掃描實作。`assetAdvanced_export_asset_manifest` 已 ship 不算 | 0.7 天 | 低 | 大型專案 refactor 必備；unused 掃描需 walk 場景 + prefab 收集 reference set |
| 5 | cocos-code-mode | **inspector 補四條缺口**（場景 instance class 主路 v2.10.2 已 ship）：(a) `inspectorGetSettingsDefinition({ settingsType: 'ProjectSettings' \| 'CurrentSceneGlobals' \| 'CommonTypes' })` Settings dump → TS class；(b) Asset reference 自動加 `Importer` suffix；(c) tooltip / displayName `'i18n:'` 前綴解析（`Editor.I18n.t()`）；(d) 通用 `setInstanceProperties` writer（取代分散在 component/assetMeta/node 三套 setter） | 1.5 天 | 低 | inspector-tools.ts 純擴充；通用 setter 要對齊 InstanceReference 與三套既有 setter 的行為差異 |
| 6 | RomaRogov | **`@ccclass` URL → class name 萃取**：從 `db://` script URL 解析出 class name，比手填 className 可靠 | 0.3 天 | 低 | 補強 `component_add_component` 的 className 解析鏈路 |
| 7 | harady | **`server_check_code_sync` + `server_get_build_hash`**：runtime BUILD_HASH 與 dist/ 檔案 hash 比對，告知是否需要 reload extension | 0.5 天 | 中 | 需在 build 時生成 hash 並嵌入 runtime；對 AI 工作流有清楚 staleness 訊號 |
| 8 | FunplayAI | **OS 層輸入模擬**（`simulate_mouse_*` / `simulate_key_*`）：彌補 preview-mode 互動測試盲點 | 1 天 | 中 | 需處理跨平台（windows/macOS）IPC；landmine #16 之外的另一條路 |
| 9 | FunplayAI | **core/full tool profile**：tool-manager 補一層輕量 profile，降低小工作流的 AI tool token 消耗 | 0.5 天 | 中 | 與 v2.7 tool-manager UI persistence 互動，schema 變動需評估 |

> Decorator unification（v2.11.0 已 ship 16 檔）/ narrative 外化（v2.11.1 已 ship 6 檔）
> 不再列為候選，移到「已 ship」段。

### 推薦執行順序

階段一（v2.11.2，~3 天）：#2 + #1（auto_bind → batch node tree → prefab_create_from_spec，依序解鎖；高 ROI 工作流殺手）
階段二（v2.11.3，~2.5 天）：#3 + #5（snapshot diff + inspector 四條缺口；皆 inspector/scene 工具帶）
階段三（v2.11.4，~1.5 天）：#4 + #6（資產清查 + ccclass 萃取；輔助型工具）
階段四（v2.11.5 or v2.12）：#7（code_sync）+ #9（tool profile）；#8（input simulation）依需求

## 我們獨有功能（v2.11.1 確認，全保留）

對全 6 個 repo 仍唯一：

| 功能 | 是什麼 | 引入版本 |
|---|---|---|
| `@mcpTool` decorator 全面化（16 檔統一） | 取代 inline `defineTools(array)`，consistency + 後續維護成本降 | v2.11.0 |
| Narrative 外化（6 中型檔案 → `source/data/<category>-docs.ts`） | description 與 routing/handler 分離，閱讀更聚焦 | v2.11.1 |
| Landmine #11 host-side nudge（component runtime mutation → 編輯器序列化模型） | scene-script `arr.push` 後從 host 端 `set-property` 補刀 | v2.1.5 |
| `referenceImage_manage`（12 → 1 op-router） | 設計稿疊圖；macro-routing 試金石 | v2.9.x |
| `preferences_manage`（7 → 1 macro） | preferences 7 個工具收成 1 個 op-router | v2.10.4 |
| `animation_set_animation_speed` / `animation_check_animation_finished` | AnimationState 細粒度控制 | v2.10.2 |
| `debug_game_client_status`（GameDebugClient 狀態查詢） | 與 `debug_game_command` 配對的 readiness probe | v2.6.0 |
| Gemini inline draft-7 zod schema patch（extension 端） | cocos-cli 在 middleware 端做，我們在 server 端做，路徑不同 | v2.6.0 |
| `assetMeta_*` op-router with TiledMap | 16 interpreter（含 TiledMap）涵蓋面 | v2.4.3 起 / v2.10.5 補 TiledMap |
| `assetAdvanced_get_users`（asset reference lookup by uuid） | refactor 安全網 | v2.10.3 |
| `lib/schemas.ts` 集中萃取（vec3 / vec4 / referenceSchema 等） | schema 重複定義消除 | v2.10.x Polish A |
| Cumulative 三方 review workflow（claude + codex + gemini） | landmine 揪出 + ship-it 確認 | v2.3.0 起 |

非獨有（已確認至少一個 repo 也有）：
- broadcast tools → Spaydo 也有
- file-editor 4 工具 → Spaydo 也有
- prompts capability → FunplayAI 也有
- `debug_record_start/stop` / `debug_game_command` / `GameDebugClient` / `ok()` helper → harady 也有

## 與 cocos-code-mode（UTCP）的關係

**同源不同協議**。Roman Rogov 的繼任專案，主推 UTCP + Code Mode 執行模型。
完整對比 + 為什麼不換 protocol，見 [`repos/cocos-code-mode.md`](repos/cocos-code-mode.md)。

簡述：抄它的 idea（InstanceReference / TS 定義生成 / decorator）不抄它的
protocol stack — Claude Code/Desktop/Cline/Continue 全 MCP-native；UTCP 失主流
client；80% Code Mode 效益可在 MCP 內透過 `execute_javascript` 取得。

場景 instance 的完整 TS class 定義（含 `@property` decorator + enum/bitmask metadata）已於
v2.10.2 #1 ship；剩下 ProjectSettings 內省與通用 instance properties writer 是 v2.11 候選 #6。

## 與官方 cocos-cli 的關係

**互補不替代**。cocos-cli 跑在 editor 外（standalone CLI 進程），主能力
是 build / create / import / wizard；不能 call `Editor.Message`、不能 mutate
live scene。我們是 in-editor extension，主場景是 live scene 操作。沒有
cocos-mcp 場景能單靠 cocos-cli 解決。

cocos-cli 的 Gemini-compat schema 處理在 MCP middleware 層，我們在 server
端 zod 設定層；目標相同（避免 `$ref` / `$defs`），路徑不同，不衝突。

詳細：[`repos/cocos-cli.md`](repos/cocos-cli.md)。

## FunplayAI LOC 為何 5,306？

不換 protocol 的前提下，FunplayAI 三點結構決定壓 LOC：

1. 不用 SDK，手刻 JSON-RPC dispatcher
2. `execute_javascript` 統一 sandbox 把 80% 用例壓進 1 個 tool
3. 沒 zod / 沒 i18n / 沒 tool-manager UI persistence

我們選擇 zod + SDK + tool-manager UI 是為了 schema 安全 + 多 client 廣度
（Claude Desktop / Cline / Gemini / Continue 都要顧），LOC 高有業務理由。

詳細 + 為什麼不全盤抄：[`repos/funplay-cocos-mcp.md`](repos/funplay-cocos-mcp.md)。

## 採用決策一覽（v2.3-v2.10 縮表）

完整 v2.3-v2.7 決策表保留在 [v2.10 archive](../archive/research/cross-repo-survey-v2.10.md)。
v2.10.x cycle 採用：

| 來源 | 採用內容 | 排版 |
|---|---|---|
| Spaydo | animation state 工具 4 個（list_states / get_state_info / set_speed / check_finished） | v2.10.2 |
| RomaRogov | asset-interpreters 8 → 15（補 Animation/Audio/Prefab/Scene/Atlas/Json/LabelAtlas）+ TiledMap | v2.10.3 + v2.10.5 |
| harady | `debug_record_*` format/quality 控制 | v2.10.3 |
| FunplayAI | `[primary]` / `[specialist]` tool labeling | v2.10.3 |
| Spaydo | `assetAdvanced_get_users(uuid)` | v2.10.3 |
| RomaRogov | macro-tool enum routing 推廣到 preferences（7 → 1） | v2.10.4 |
| cocos-code-mode + 自家 | Discover-then-act workflow prompt template | v2.10.4 |

v2.11.x cycle 採用（持續中）：

| # | 內容 | 排版 |
|---|---|---|
| 1 | `@mcpTool` decorator 全面化（16 檔） | v2.11.0 |
| 2 | 中型檔案 narrative 外化（6 檔 → `source/data/`） | v2.11.1 |

## 不採納（持續適用）

| 來源 | 內容 | 不採納理由 |
|---|---|---|
| cocos-code-mode | UTCP-only protocol switch | 主流 client 全 MCP-native；重寫成本 5-7 天 |
| RomaRogov | `generate-image-asset` AI 圖生 | domain orthogonal，該放通用 image-gen MCP server |
| 全部 | stdio transport（cocos-cli / harady 預留） | cocos editor 內跑 stdio 不自然 |
| Spaydo file-editor 對 Claude Code 用戶 | 重複 Edit/Write，但對其他 client 不重複 | v2.5.0 仍 ship、description 標 `[claude-code-redundant]` |
