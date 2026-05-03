# chenShengBiao/cocos-mcp（Python headless）

最後分析：2026-05-03（v2.11.7 cycle wrap，cross-repo refresh）

## 基本資訊

- 來源：https://github.com/chenShengBiao/cocos-mcp
- 語言/runtime：Python ≥ 3.11（`pyproject.toml`）
- 最後 commit：`d05e46a` — 2026-04-22
- 活動狀態：active（持續維護）
- LOC：~18,400 行 Python 在 `server.py` + `cocos/`
- 工具數：184（FastMCP `@mcp.tool()` decorator）
- 分發方式：pip-installed Python package；stdio MCP server

## 與其他 6 個 ref repo 最大差異：headless 架構

不裝 Cocos Creator editor extension，**完全在 editor 進程外**運作：
- 直接讀寫專案目錄裡的 `.scene` / `.prefab` / `.meta` JSON 檔（file I/O）
- 透過 `CocosCreator --build` CLI 觸發 build
- preview 用 `python -m http.server` 起靜態服務
- preview 互動用 Playwright-style helpers（`cocos/interact.py`）

優缺點對照：

| 面向 | chenShengBiao | 我們（in-editor TS extension） |
|---|---|---|
| 安裝門檻 | pip install + project 路徑設定 | 把 extension 拉到 `extensions/` + 開啟 panel |
| live scene 互動 | ❌ 不行（沒接 IPC） | ✅ Editor.Message 全通道 |
| undo / redo 整合 | ❌ 直接寫 JSON，不走 cocos undo stack | ✅ 透過 `set-property` 進 undo |
| dirty state 同步 | ❌ 改檔後需 reload scene | ✅ 自動跟 cocos 內部 dirty flag |
| 目標使用者 | 自動化／無人值守流水線 | 編輯器旁人類 + AI 協作 |
| 啟動速度 | 即時（Python 進程） | 受 editor 啟動拖累 |
| 對 cocos 版本敏感度 | 中（meta JSON 格式變更會壞） | 低（透過官方 IPC channel）|

兩種架構不替代，是不同 scope。

## Tool inventory

184 工具分類：
- **core**（19）：UUID 工具、project init、theme、UI tokens
- **scene**（36）：node 建立 / 屬性 / prefab / batch_scene_ops / validate_scene / assert_scene_state / lint_ui
- **physics_ui**（26）：rigidbody2d / colliders / joints / button / layout / progress_bar / scroll_view ...
- **physics_3d / rendering_3d**（17）：rigidbody3d / colliders / lights / mesh_renderer
- **media / ui_patterns / composites**（48）：audio / animation / spine / dragonbones / tiled / camera / mask / richtext / dialog_modal / main_menu / hud_bar / fade_in / shake ...
- **build / interact / scaffolds**（38）：build / preview / WeChat config / scaffold_player_controller / scaffold_enemy_ai / scaffold_spawner / scaffold_game_loop / scaffold_ui_screen / scaffold_camera_follow / scaffold_audio_controller / scaffold_input_abstraction / scaffold_score_system

## 對我們有借鏡價值的部分

### ✅ 值得採納（建議列為 v2.12.x 候選）

| 項目 | 為什麼值得 |
|---|---|
| **scaffold_* 9 工具** | 純 file write，editor IPC 不需要，可直接學 template 並包成我們的 `fileEditor_scaffold_*` 工具 |
| **assert_scene_state** | declarative 場景斷言，與我們 `validation_compare_snapshots` 互補（snapshot 是事後比較，assert 是事前期望）|
| **composite UI presets**（dialog_modal / main_menu / hud_bar / toast / loading_spinner） | 與 v2.11.4 `node_create_tree` 整合即可；對 AI 一鍵建 UI block 很有用 |
| **batch_scene_ops** | JSON spec 批次場景變更；schema 設計需精心，但比一個個 `set_property` 高效 |
| **lint_ui** | 離線 UI lint 規則（anchor / size / 缺 UITransform）；可學規則組 |

### ❌ 不採納

| 項目 | 為什麼不 |
|---|---|
| Python 架構本身 | scope 衝突（我們需要 IPC） |
| 直寫 .scene/.prefab JSON | 跳過 cocos undo + dirty flag → 與我們現有 landmine 緩解策略不符 |
| `cocos_generate_asset` AI 圖生 | domain orthogonal，該放通用 image-gen MCP |
| `--build` CLI shell out | 我們已有 `project_build_project` 工具走 IPC |
| Playwright preview interact | 我們已有 v2.11.6 input simulation（Electron webContents），更精確 |

## 工具命名差異

chenShengBiao 全前綴 `cocos_`（如 `cocos_create_node`），我們用 `category_name`（如 `node_create_node`）。功能直接重疊的約 12 工具，名稱完全不撞。

## 觀察

- repo 看起來是 GitHub mirror（commit history 短，文件結構像從別處同步），可能背後有 Gitee 主庫或私有商業產品
- 沒有看到測試（除 `tests/` 一個 placeholder）
- README 明確 positioning：「無需 editor GUI」是賣點之一，鎖定批次自動化場景

## 結論

放入 cross-repo survey 的對照表（補完 7-of-7），但歸類為「side reference」非「主要 ref repo」。語意層面有借鏡點（scaffold + assert），架構層面不可借鏡。

下一次比對時機：v2.12 候選排版時驗證 scaffold tools 是否已 ship；2026 年中複查 chenShengBiao repo 是否仍活躍 + 是否有新 scaffold 模板可學。
