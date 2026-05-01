# cocos-mcp-extension（Spaydo）

- URL: https://github.com/Spaydo/cocos-mcp-extension
- Local clone: `D:/1_dev/cocos-mcp-references/cocos-mcp-extension/`
- 作者：Spaydo
- Protocol：MCP（`@modelcontextprotocol/sdk`）

## 概述

139 個 tool / 11 category（11 + 4 advanced），LOC 7,136。架構同我們。
最 distinctive：**file-editor-tools 系列**（純 fs 操作 tool）和
**animation-tools 系列**。

## 採用清單

### 1. file-editor-tools 4 個 tool（→ v2.5.0）

```
insert_text   — 在指定 line 插入文字
delete_lines  — 刪一段 line range
replace_text  — find/replace（plain string or regex）
query_text    — 讀取 line range
```

純 `fs.readFile` / `fs.writeFile` 操作，**沒碰 Cocos editor API**。

**為什麼對我們有意義**（雖然 Claude Code 已有 Edit/Write）：

- Claude Desktop / Cline / Continue 等 client **沒原生 file 操作能力**，
  AI 要改 source code 必須走 MCP server
- 對 Claude Code 重複，但對其他 client 不重複
- 多 client 廣度策略

**移植策略**：v2.5.0。Spaydo 沒做的兩個必補：

1. **path-safety guard**：解析路徑後檢查 `.startsWith(projectPath)`
   防止 `../../../etc/passwd`。Spaydo `resolvePath` 有這個，照抄
2. **asset-db refresh hook**：改完 `.ts` 後自動 trigger
   `Editor.Message.request('asset-db', 'refresh', url)`，否則
   cocos editor 不會 reimport。Spaydo **沒做**這個——是我們的補強

對 Claude Code 用戶這 4 個 tool 重複，tool description 標
`[claude-code-redundant] Use Edit/Write tool from your IDE if available.`

1 天。

### 2. animation-tools 4 個 tool（→ v2.4.0 同梱）

```
list_clips   — 列 cc.AnimationComponent 上的 clips
play         — 播放
stop         — 停
set_clip     — 切 clip
```

UI / 2D 遊戲常用。我們現在 component-tools 沒有這個系列。

**移植策略**：v2.4.0 同梱 1 天。

### 3. `query_users` 找誰引用了某 asset（→ v2.7 評估）

對 refactor 工作流有用——「我要刪這個 prefab，誰還在用？」。實機觀察
有沒有需求再做。

### 4. `editor_info` / `engine_info` / `network_info`（→ 已有等效）

我們有 `debug_get_editor_info` / `server_get_network_interfaces` 等效。
不重複做。

## 不採納

| 內容 | 理由 |
|---|---|
| `query_devices` | 我們沒 preview device 列表需求 |
| `reset_preferences` | 風險 > 收益，AI 不該動使用者全域偏好 |
| `category-based enable` UX | 我們 tool-manager 已有 per-config 啟用設定，更細 |

## 程式設計差異

vs 我們：

- **single-file inline schema**（沒拆 zod schemas + meta record）—— 簡潔但失型別推論
- **`get_log` / `get_logs` 命名重複**（單複數區分功能）—— 不直觀
- **動詞做 tool 名**（`add` / `delete` / `play` / `stop`）—— 短但易撞名（與 `delete_asset` 等）

## Spaydo 的 file-editor-tools — 為何 in-editor extension 要有純 fs 工具？

合理推測：Spaydo 預設 client **不是** Claude Code（Claude Code 已有
Edit/Write）。可能預期：

1. Claude Desktop / 其他 chat client（沒原生 file 操作）
2. 自家命令列 client
3. cocos editor 內建 chat interface（cocos 有 `cce.IPC` chat 通路）

對我們的判斷：**多 client 廣度** —— 雖對 Claude Code redundant，但
其他 client 場景仍需要。所以 v2.5.0 收。

## Local clone 操作

```bash
git clone --depth 1 https://github.com/Spaydo/cocos-mcp-extension.git \
  D:/1_dev/cocos-mcp-references/cocos-mcp-extension

# 看 file-editor 全部
cat D:/1_dev/cocos-mcp-references/cocos-mcp-extension/source/tools/file-editor-tools.ts

# 看 animation
cat D:/1_dev/cocos-mcp-references/cocos-mcp-extension/source/tools/animation-tools.ts
```
