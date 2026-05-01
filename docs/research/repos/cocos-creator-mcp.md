# cocos-creator-mcp（harady）

- URL: https://github.com/harady/cocos-creator-mcp
- Local clone: `D:/1_dev/cocos-mcp-references/cocos-creator-mcp/`
- 作者：harady
- Protocol：MCP（`@modelcontextprotocol/sdk`）

## 概述

161 個 tool（最接近我們 160）/ 13 category，LOC 7,037。架構同我們。
最 distinctive：**runtime 控制系列**（debug_screenshot / debug_record /
debug_game_command），把 cocos preview process 當作 AI 可控目標而不只是
用戶觀察視窗。

## 採用清單

### 1. `debug_screenshot` / `debug_batch_screenshot`（→ v2.3.0 T-V23-2）

`Electron webContents.capturePage()` → PNG 存盤、回傳路徑。
`debug_batch_screenshot` 一次抓多 panel。AI 自我驗證閉環。

**移植策略**：v2.3.0。0.5 天。

### 2. `debug_record_start` / `debug_record_stop`（→ v2.6.0 候選）

MediaRecorder 把 game preview canvas 錄成 WebM（auto-bitrate from
canvas resolution × fps × quality coefficient）。落到
`temp/recordings/rec_<datetime>.webm`。

**評估**：niche，QA / demo 場景才需要。v2.6 評估時看 user 真要不要。

### 3. `debug_game_command` + GameDebugClient injection（→ v2.6.0 T-V26-1）

**最具野心的功能**。注一個 `GameDebugClient` 進 cocos preview process，
AI 透過 `debug_game_command(type, args)` 能：

- `screenshot` —— game canvas
- `state` —— dump GameDb（runtime 全局狀態）
- `navigate` —— 跳頁面
- `click` —— 點擊節點 by name
- `inspect` —— 取 runtime 節點訊息（UITransform sizes / Widget /
  Layout / position）

**這是 AI 自動 runtime QA 的大門**。今天我們只能改 editor 內容；
debug_game_command 後可以「跑遊戲、AI 自己玩、AI 自己截圖驗收」。

**前置評估**：

1. cocos preview process 的 IPC 介面 —— `Editor.Message.broadcast` 能
   否到 preview？或要透過 WebSocket 自接？
2. inject 點 —— preview 啟動時插一段 setup script
3. Reload extension 時 client 要不要 re-inject？
4. 多 preview window 場景

**移植策略**：v2.6.0，3-5 天，自成 milestone。

### 4. `debug_wait_compile`（→ v2.4.0 同梱）

阻塞到 cocos editor TS 編譯完成。AI 改完 .ts 不會搶在編譯前讀錯誤訊息。

配合 FunplayAI `run_script_diagnostics` + `get_script_diagnostic_context`
是一組 —— 「等編譯 → 拿錯誤 → 自我修錯」工作流。

**移植策略**：v2.4.0 同梱 1.5 天。

### 5. `debug_preview` start/stop preview / `debug_query_devices`（→ v2.6.0 同梱）

程式化啟動/停止 preview、列 preview device。配合 `debug_game_command`
使用。

### 6. `node_set_layout` / `node_create_tree` 高階 helper（→ 不收）

批量 node 操作。我們 v2.3 後 AI 可用 `execute_javascript` 達成同樣
效果，不需另開 narrow tool。

### 7. `prefab_create_from_spec` / `prefab_create_and_replace`（→ v2.7 評估）

用 spec object 建 prefab，AI-friendly 一次性 spec 取代多 step。實機
測試後評估必要性。

## 不採納

| 內容 | 理由 |
|---|---|
| 整支替代我們 | 雖 tool 數相當（161 vs 160）但缺 resources/prompts，且 description 訊息密度 < 我們 v2.1.7 sweep 後 |
| stdio transport（程式碼預留） | cocos editor 內跑 stdio 不自然，roadmap T-P3-4 標可選 |

## 程式設計差異

vs 我們：

- **沒抽 scene-bridge helper**（每個 tool 各自寫 `Editor.Message.request('scene', 'execute-scene-script', {name: EXT_NAME, method: '...'})`）—— 重複碼較多
- **`uuid` / `nodeName` 二選一 fallback**（在 ToolRouter 統一 resolve），AI-friendly。我們 v2.4.0 step 2 抄這個
- **batch property write**（`properties: [{property, value}]` 陣列模式），1 call 改多屬性。我們 v2.4.0 step 3 抄這個
- **`screenshot: true` schema flag**——set 完自動截圖驗證。我們不直接抄；v2.3.0 T-V23-2 落地後評估要不要把 screenshot 當作 schema-level option

## Local clone 操作

```bash
git clone --depth 1 https://github.com/harady/cocos-creator-mcp.git \
  D:/1_dev/cocos-mcp-references/cocos-creator-mcp

# 看 debug-tools 全部
cat D:/1_dev/cocos-mcp-references/cocos-creator-mcp/source/tools/debug-tools.ts

# 看 nodeName 二選一 fallback
grep -A 10 "needsResolve" \
  D:/1_dev/cocos-mcp-references/cocos-creator-mcp/source/tools/component-tools.ts
```
