# Cross-repo survey

最後更新：2026-05-03（v2.11.7 cycle wrap refresh）

對照分析 7 個 cocos-mcp / cocos-cli 相關 repo（新增 chenShengBiao Python repo）。本文檔是 overview + 決策摘要 +
v2.12+ 候選清單；per-repo 深入筆記在 `repos/`。

Reference repos clone 在 `D:/1_dev/cocos-mcp-references/`（read-only，不會 commit
進 project tree）。

> 修訂歷史：
> - v2.2.0 baseline + v2.3-v2.7 採用決策 → 已歸檔。
> - v2.10 refresh（v2.9.7 baseline）→ [`docs/archive/research/cross-repo-survey-v2.10.md`](../archive/research/cross-repo-survey-v2.10.md)
> - v2.11 refresh（v2.11.1 baseline）→ [`docs/archive/research/cross-repo-survey-v2.11.md`](../archive/research/cross-repo-survey-v2.11.md)
> - 本次 v2.11.7 wrap refresh：基準 197 tools / 19 categories / ~17.5k LOC，重新比對 6 個既有參考 repo + 新增
>   chenShengBiao/cocos-mcp Python 實作，挑選 v2.12.x+ 候選功能；6 中 5 個 ref repo 已進入 dormant，
>   cocos-cli 與 chenShengBiao 仍活躍。

## v2.11.7 對照表

| repo | tools | source LOC | most-recent commit | protocol | 主要看點 |
|---|---:|---:|---|---|---|
| **本專案 v2.11.7** | **197** | **~17.5k** | 2026-05-03 | MCP（SDK） | input simulation + Core/Full profile + snapshot diff + asset tree + build hash + 全專案 review/simplify wrap + landmine #18 loopback Host check |
| harady (cocos-creator-mcp) | 164 | 6,574 | 2026-04-26 | MCP（SDK） | 13 categories；近期 dormant；`component_query_enum` 仍唯一 |
| Spaydo (cocos-mcp-extension) | 130 | ~6k | 2026-04-19 | MCP（SDK） | 14 categories；dormant；validation_* 5 子工具仍唯一 |
| RomaRogov-cocos-mcp（原版） | 16 macro | 9,231 | 2026-03-02 | MCP（SDK） | DEPRECATED — 僅 README 更新 |
| cocos-code-mode（Roman 繼任） | 24 macro | 5,574 | 2026-03-30 | UTCP | dormant；`assetGetPreview` 仍唯一 |
| FunplayAI (funplay-cocos-mcp) | 67 | 5,306 (JS) | 2026-04-30 | MCP（手刻 JSON-RPC） | core/full profile + Electron input（與我們同 webContents 路徑，非 OS-level，舊調查錯誤） |
| cocos-cli（官方） | ~50 `@tool` | (CLI 全棧) | 2026-04-30 | MCP（SDK） | 仍活躍；PR #525 多節點選擇 + `cocos://assets/{ccType}` template |
| **chenShengBiao/cocos-mcp**（新） | **184** | ~18.4k Python | 2026-04-22 | MCP（FastMCP stdio） | **Python headless** — 不裝 editor extension，靠 .scene/.prefab/.meta 直寫 + `CocosCreator --build`；scaffold 9 工具 + composite UI presets |

LOC 為 source TS/JS/PY（不含 dist / node_modules / 測試 fixture）。架構分類：
- **In-editor TS extension**（5 個）：harady / Spaydo / RomaRogov / cocos-code-mode / FunplayAI / 本專案
- **Standalone CLI**（1 個）：cocos-cli
- **Headless Python**（1 個，新）：chenShengBiao

## 觀察：5/7 ref repo 已 dormant，2 個仍活躍但與我們互補

- **harady**：2026-04-26 後零提交（一週以上無活動）
- **Spaydo**：2026-04-19 revert monorepo 後零提交
- **RomaRogov 原版**：2026-03-02 標記停止支援
- **cocos-code-mode**：2026-03-30 後零提交
- **FunplayAI**：2026-04-30 v0.1.2 release 後無更新
- **cocos-cli**：2026-04-30 PR #525 後無更新（仍是官方主線，預期會持續，但近期靜止）
- **chenShengBiao**：2026-04-22 仍活躍，但 scope 與我們完全不同（headless 自動生成 vs editor-assisted 互動）

→ v2.11.x cycle 我們從 v2.11.1（180 tools）一路 ship 到 v2.11.7（197 tools + cumulative review wrap），是這 7 個 repo 中變動最頻繁的一個。

## v2.12.x+ 候選清單（依跨參考 repo gap 排序）

> 已不在候選的：v2.11.x cycle 全 ship 項目（#1-#9 from old list）+ landmine #16/#17 cocos 限制（已結案）+ tool labelling / preferences macro / record format-quality / discover-then-act prompt（皆 v2.10.x ship）。

| # | 來源 | 內容 | 估時 | 風險 | 備註 |
|---|---|---|---|---|---|
| 1 | Spaydo | **validation 5 子工具**：`validate_scene` / `validate_node` / `validate_components` / `get_scene_stats` / `validate_references` — 場景 / 節點 / 元件層級的 declarative validators | 1.5 天 | 低 | 補完 validation category；依現有 query-node 與 query-asset-references infra |
| 2 | chenShengBiao | **scaffold_* 9 工具**：`player_controller` / `enemy_ai` / `spawner` / `game_loop` / `ui_screen` / `camera_follow` / `audio_controller` / `input_abstraction` / `score_system` — 從 template 寫出完整 TS 遊戲邏輯檔 | 2 天 | 低 | 純 file write，不需 IPC；template 可學 chenShengBiao Python `cocos/scaffolds/` |
| 3 | chenShengBiao | **assert_scene_state**：declarative 場景斷言（給 AI 改完場景的回歸測試用） | 1 天 | 低 | 與 v2.11.5 `validation_compare_snapshots` 互補（snapshot 比較 vs 直接斷言）|
| 4 | cocos-code-mode | **assetGetPreview**：任意資產類型回傳 base64 thumbnail（image / prefab / model / material / scene） | 0.7 天 | 低 | 透過 preview 面板 fallback 或 asset-db preview channel；對 AI 視覺檢查價值高 |
| 5 | chenShengBiao | **composite UI presets**：`dialog_modal` / `main_menu` / `hud_bar` / `toast` / `loading_spinner` — 一次建立完整 UI block（Layout + Sprite + Label 組合） | 1 天 | 低 | 與 v2.11.4 `node_create_tree` 整合即可 |
| 6 | harady | **component_query_enum**：查詢 component property 的合法 enum 值（讓 AI 在 `set_component_property` 前知道有效值） | 0.5 天 | 低 | inspector dump 已含 enum metadata；包成獨立 tool 即可 |
| 7 | chenShengBiao | **batch_scene_ops**：JSON spec 批次場景變更（`{ops: [{action, target, value}, ...]}`）| 1 天 | 中 | 與現有 `inspector_set_instance_properties` 重疊但更自由；要設計 op schema |
| 8 | cocos-cli | **multi-node selection**：`SelectionService`（_uuids, select, unselect, clear, query, isSelect）+ region/click/Ctrl-toggle | 0.7 天 | 中 | PR #525；對 batch 操作前置 selection 工作流有用 |
| 9 | cocos-cli | **assets resource template**：`cocos://assets/{ccType}` 按 type 過濾的 resource | 0.3 天 | 低 | 補強 MCP resources 層；`@modelcontextprotocol/sdk` 內建 ResourceTemplate |
| 10 | harady | **debug 內省工具**：`list_messages` / `list_extensions` / `get_extension_info` — editor message bus + extensions 列表 | 0.5 天 | 低 | 對 AI 自我診斷工作流有用 |
| 11 | cocos-code-mode | **editorGetScenePreview**：scene-view 截圖 + 顯式 camera position/target/ortho/size/JPEG quality | 0.5 天 | 低 | 與現有 `debug_capture_preview_screenshot` 互補 |

### 內部 tech-debt（v2.12.0 ship 完成）

| # | 項目 | 狀態 | commit |
|---|---|---|---|
| ~~T1~~ | `findComponentIndexByType` → `lib/component-lookup.ts`（8 sites 替換）| ✅ ship | `7022688` |
| ~~T2~~ | dump-shape unwrap → `lib/dump-unwrap.ts`（含 landmine #11 例外保留）| ✅ ship | `ad7af6b` |
| ~~T3~~ | scene root UUID → `lib/scene-root.ts`（`getSceneRoots` + `getSceneRootUuid`）| ✅ ship | `5ac06b5` |
| ~~T4~~ | `new Promise(async)` antipattern 清掃（17/19 sites；2 個 `.then` 內 resolve 保留）| ✅ ship | `52c95ab` |
| ~~T5~~ | tree/hierarchy caps（`maxDepth`/`maxNodes`/`summaryOnly` + `truncated`/`truncatedBy`/`nodeCount`，additive schema）| ✅ ship | `b5a23e6` |

殘留小瑕疵：`get_build_hash` 只 hash `dist/main.js`（entry-point identity 語意），對 sub-module 改動不敏感。若改成 hash 全 dist tree 會跟 `check_code_sync` 一致；非阻塞，後續視需求決定。

### 不採納（持續適用）

| 來源 | 內容 | 不採納理由 |
|---|---|---|
| cocos-code-mode | UTCP-only protocol switch | 主流 client 全 MCP-native；重寫成本 5-7 天 |
| RomaRogov | `generate-image-asset` AI 圖生 | domain orthogonal，該放通用 image-gen MCP server |
| chenShengBiao | Python headless 架構 | 與我們 editor-extension scope 衝突；他們不需要 IPC，我們不能放棄 IPC（live scene mutation） |
| chenShengBiao | `cocos_generate_asset` 外接 image API | 同 RomaRogov 理由 |
| 全部 | stdio transport | cocos editor 內跑 stdio 不自然 |
| Spaydo file-editor 對 Claude Code 用戶 | 重複 Edit/Write，但對其他 client 不重複 | v2.5.0 仍 ship、description 標 `[claude-code-redundant]` |
| 全部 | `get_console_logs` 主動 polling | 我們有 `debug_game_command` + websocket 路徑，更精確 |

## 我們獨有功能（v2.11.7 確認，全保留）

對全 7 個 repo 仍唯一：

| 功能 | 是什麼 | 引入版本 |
|---|---|---|
| `@mcpTool` decorator 全面化（16 檔統一） | 取代 inline `defineTools(array)`，consistency + 後續維護成本降 | v2.11.0 |
| Narrative 外化（6 中型檔案 → `source/data/<category>-docs.ts`） | description 與 routing/handler 分離，閱讀更聚焦 | v2.11.1 |
| Loopback Host check on /mcp + /api/* + /game/* | DNS rebinding defence; landmine #18 | v2.11.7 |
| Landmine #11 host-side nudge（component runtime mutation → 編輯器序列化模型） | scene-script `arr.push` 後從 host 端 `set-property` 補刀 | v2.1.5 |
| `referenceImage_manage`（12 → 1 op-router） | 設計稿疊圖；macro-routing 試金石 | v2.9.x |
| `preferences_manage`（7 → 1 macro） | preferences 7 個工具收成 1 個 op-router | v2.10.4 |
| `animation_set_animation_speed` / `check_animation_finished` | AnimationState 細粒度控制 | v2.10.2 |
| `debug_game_client_status`（GameDebugClient 狀態查詢） | 與 `debug_game_command` 配對的 readiness probe | v2.6.0 |
| Gemini inline draft-7 zod schema patch（extension 端） | cocos-cli 在 middleware 端做，我們在 server 端做，路徑不同 | v2.6.0 |
| `assetMeta_*` op-router with TiledMap | 16 interpreter（含 TiledMap）涵蓋面 | v2.4.3 起 / v2.10.5 補 TiledMap |
| `assetAdvanced_get_users` / `get_unused_assets` real impl / `get_tree` | asset graph + audit | v2.10.3 / v2.11.5 |
| `lib/schemas.ts` 集中萃取 + `ccclass-extractor.ts` | schema / class name 重複定義消除 | v2.10.x / v2.11.2 |
| `validation_take_snapshot` + `compare_snapshots`（content-level diff） | 場景狀態回歸檢查 | v2.11.5 |
| `inspector_get_settings_definition` ProjectSettings + CurrentSceneGlobals | 三分支齊備 | v2.11.5 |
| `server_get_build_hash` + `check_code_sync` | extension staleness 訊號 | v2.11.5 |
| Core/Full tool profile UI（一鍵切換 49/197 tool） | 降低 small-task token | v2.11.5 |
| `input_*` 5 工具（Electron webContents.sendInputEvent，跨 editor/preview/simulator） | preview QA 工作流 | v2.11.6 |
| Cumulative 三方 review workflow（claude + codex + gemini） | landmine 揪出 + ship-it 確認 | v2.3.0 起 |

非獨有（已確認至少一個 repo 也有）：
- broadcast tools → Spaydo 也有
- file-editor 4 工具 → Spaydo 也有
- prompts capability → FunplayAI 也有
- input simulation → FunplayAI 也用 `webContents.sendInputEvent`（同路徑）
- core/full profile → FunplayAI 有 JS-only filter 版（我們有 UI 按鈕）
- TS class definition gen → cocos-code-mode 也有（後者用 UTCP InstanceReference）

## 與各 ref repo 關係

### 與 cocos-code-mode（UTCP）的關係
**同源不同協議**。Roman Rogov 的繼任專案，主推 UTCP + Code Mode 執行模型。完整對比 + 為什麼不換 protocol，見 [`repos/cocos-code-mode.md`](repos/cocos-code-mode.md)。簡述：抄它的 idea（InstanceReference / TS 定義生成）不抄它的 protocol stack — Claude Code/Desktop/Cline/Continue 全 MCP-native；UTCP 失主流 client。

### 與 cocos-cli（官方）的關係
**互補不替代**。cocos-cli 跑在 editor 外（standalone CLI 進程），主能力是 build / create / import / wizard；不能 call `Editor.Message`、不能 mutate live scene。我們是 in-editor extension，主場景是 live scene 操作。可借鏡的是 `BuilderHook` middleware pattern + `cocos://assets/{ccType}` resource template + `SelectionService`。

### 與 chenShengBiao/cocos-mcp（Python headless，新分析）的關係
**完全不同 scope，建議借語意不借架構**。chenShengBiao 是 Python `FastMCP` + 直接讀寫 `.scene/.prefab/.meta` JSON 的 headless server，目標是「無人值守自動生成完整遊戲」。我們是 editor extension，目標是「有人值守的 AI 互動編輯」。詳細對比見 [`repos/chenShengBiao-cocos-mcp.md`](repos/chenShengBiao-cocos-mcp.md)。

值得借的是 9 個 scaffold tool（純 file write，editor IPC 不需要）+ composite UI presets + `assert_scene_state` 思路。不能借的是整個 file-direct architecture（會丟掉 undo / live inspect / dirty state 同步）。

### FunplayAI LOC 為何 5,306？
不換 protocol 的前提下，FunplayAI 三點結構決定壓 LOC：
1. 不用 SDK，手刻 JSON-RPC dispatcher
2. `execute_javascript` 統一 sandbox 把 80% 用例壓進 1 個 tool
3. 沒 zod / 沒 i18n / 沒 tool-manager UI persistence

我們選擇 zod + SDK + tool-manager UI 是為了 schema 安全 + 多 client 廣度（Claude Desktop / Cline / Gemini / Continue / Codex 都要顧），LOC 高有業務理由。

詳細：[`repos/funplay-cocos-mcp.md`](repos/funplay-cocos-mcp.md)。

## 採用決策一覽（v2.10-v2.11 縮表）

完整 v2.3-v2.7 決策表保留在 [v2.10 archive](../archive/research/cross-repo-survey-v2.10.md)。
v2.10.x cycle 採用：

| 來源 | 採用內容 | 排版 |
|---|---|---|
| Spaydo | animation state 工具 4 個 | v2.10.2 |
| RomaRogov | asset-interpreters 8 → 15 + TiledMap | v2.10.3 + v2.10.5 |
| harady | `debug_record_*` format/quality 控制 | v2.10.3 |
| FunplayAI | `[primary]` / `[specialist]` tool labeling | v2.10.3 |
| Spaydo | `assetAdvanced_get_users(uuid)` | v2.10.3 |
| RomaRogov | macro-tool enum routing 推廣到 preferences（7 → 1） | v2.10.4 |
| cocos-code-mode + 自家 | Discover-then-act workflow prompt template | v2.10.4 |

v2.11.x cycle 採用：

| # | 內容 | 排版 |
|---|---|---|
| 1 | `@mcpTool` decorator 全面化（16 檔） | v2.11.0 |
| 2 | 中型檔案 narrative 外化（6 檔 → `source/data/`） | v2.11.1 |
| 3 | RomaRogov `@ccclass` URL → class name 萃取 helper | v2.11.2 |
| 4 | cocos-code-mode inspector 4 缺口（i18n tooltip / Importer suffix / Settings dump / set_instance_properties） | v2.11.3 + v2.11.5 補完 |
| 5 | harady 批次節點/排版三件套 + `component_auto_bind` | v2.11.4 |
| 6 | Spaydo snapshot diff + asset_get_tree + get_unused_assets real impl | v2.11.5 |
| 7 | harady `server_get_build_hash` + `check_code_sync` + Core/Full profile UI | v2.11.5 |
| 8 | FunplayAI input simulation（Electron webContents path）| v2.11.6 |
| 9 | Cumulative review/simplify pass + DNS rebinding 防護 | v2.11.7 |

## 文檔更新節奏

每一輪 minor cycle wrap（v2.X.0 → v2.X.x complete）做一次此文檔的 refresh：
- 重點是 ref repo 活動狀態（dormant 標記）
- 跨 repo 新工具 / 新 pattern 是否該採納
- 我們獨有功能名單是否該擴充

下一次預計 refresh：v2.12.x cycle wrap（依候選清單推進完畢後）。
