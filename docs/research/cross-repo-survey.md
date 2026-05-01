# Cross-repo survey

最後更新：2026-05-02

對照分析 6 個 cocos-mcp / cocos-cli 相關 repo，產出我們 v2.3 — v2.7 規劃
依據。Per-repo 深入筆記在 `repos/`，本文檔是 overview + 決策摘要。

Reference repos clone 在 `D:/1_dev/cocos-mcp-references/`（read-only，
不會 commit 進 project tree）。

## 對照表

| repo | tools | LOC | protocol | resources | prompts | notifications | 同架構 | 主要看點 |
|---|---:|---:|---|:---:|:---:|:---:|:---:|---|
| **ours v2.2.0** | **160** | 10,912 | MCP（SDK） | ✅ 6+2 | ❌ | ❌ | — | — |
| harady | 161 | 7,037 | MCP（SDK） | ❌ | ❌ | ❌ | ✅ | debug_screenshot / debug_record / debug_game_command |
| Spaydo | 139 | 7,136 | MCP（SDK） | ❌ | ❌ | ❌ | ✅ | file-editor-tools / animation-tools |
| FunplayAI | 67 | 3,315 | MCP（手刻 JSON-RPC） | ✅ 8+3 | ✅ 4 | ❌ | ✅ | execute_javascript primary tool / interaction-log |
| cocos-code-mode | 24 macro | 5,569 | UTCP | (Code Mode) | ❌ | ❌ | ✅ | InstanceReference / TS 定義生成 / @utcpTool decorator |
| RomaRogov-cocos-mcp | 16 macro | 9,194 | MCP（SDK） | ❌ | ❌ | ❌ | ✅ | asset-interpreters 系統 / macro-tool enum routing |
| cocos-cli | ~1+hooks | — | MCP（fastmcp） | ✅ docs only | ❌ | ❌ | ❌（CLI） | decorator tool registration / Gemini-compat schema patch |

說明：

- LOC 為 source TypeScript（不含 dist / node_modules）
- "同架構" = embedded cocos editor extension（call 得到 `Editor.Message`）

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
| Reference image 系統（12 tools）| 設計稿疊圖工作流 | ✅ 優勢 |
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
