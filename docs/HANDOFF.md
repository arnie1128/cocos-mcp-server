# Session Handoff

> 給下次接手的 session（含未來自己）。看完這份 + `docs/roadmap/README.md`
> 就能繼續做下去，不需要重看歷史對話。

## 進度快照（最後更新：2026-04-30，HEAD `117d846`）

```
P0 ✅ done
P1 🚧 in-progress  (~75% 完成)
   ├── T-P1-3 Logger 全面化           ✅ done
   ├── T-P1-2 工具註冊表去重複實例化   ✅ done
   ├── T-P1-4 zod schema (14 檔全部)  ✅ done
   ├── T-P1-6 預製體 channel 驗證     ✅ done
   ├── T-P1-1 換官方 MCP SDK          ⏳ ← 下一個做（最大改動）
   └── T-P1-5 structured content     ⏳ 隨 T-P1-1 一起
P2/P3/P4 ⏳ pending
```

**累積成果**：
- 14 tool 檔 / 157 tools 全部走 zod schema（手寫 JSON Schema 從 ~3200 行
  縮為 ~1100 行）；helper 在 `source/lib/schema.ts` 抹平 zod 4 與手寫風格
  差異（`additionalProperties:false`、`.default()` 與 `required` 互動）
- `MCPServer` 與 `ToolManager` 共用 `createToolRegistry()` 出來的同一份
  ToolExecutor 實例（沒有重複 new）
- 全域 logger（`source/lib/log.ts`）：debug 受 `enableDebugLog` 設定 gating，
  warn/error 永遠輸出
- 預製體 channel 全部對齊 `@cocos/creator-types`，砍掉 ~250 行死代碼+
  bogus channel 呼叫
- `mcp-server.ts` 仍是手寫 HTTP+JSON-RPC，沒換 SDK——這就是 T-P1-1

## 工作流規則（**動工前先讀**）

### 先 commit + push 再動高風險改動

source: `~/.claude/projects/D--1-dev-cocos-mcp-server/memory/feedback_commit_before_risky_changes.md`

動以下任何一種改動前，務必：
1. `git status` 確認工作樹乾淨
2. `git log -1` 確認 origin/main 已 sync 到 HEAD
3. **不滿足** → 先把現有改動 commit + push 上去再開工

適用情境：
- 刪檔、刪 method（即使 grep 過確認沒人呼叫）
- 跨 5+ 檔的 bulk edit
- 換 SDK / 換 transport / 換協議
- mass schema 替換

理由：用戶要「`git reset --hard origin/main` 永遠是有效回滾」當保險。
本地 commit 不算數，必須 push 到遠端。

### 等價性驗證（非破壞性改動仍適用）

每改一檔工具的 schema → `npm run build` → 用：
```bash
node -e "const {Cls} = require('./dist/tools/X.js');
new Cls().getTools().forEach(t => console.log(t.name, JSON.stringify(t.inputSchema, null, 2)));"
```
跟 git history 上一版做 diff。已知 zod 4 vs 手寫差異列表見
`source/lib/schema.ts` 的 `relaxJsonSchema` 註解。

## 接下來：T-P1-1 換官方 MCP SDK

### 目標

把 `source/mcp-server.ts` 的手寫 HTTP server + JSON-RPC dispatch 換成
`@modelcontextprotocol/sdk` driven。預估砍掉 ~200 行樣板，並一次取得：
- 自動的 `protocolVersion` 協商（目前寫死 `2024-11-05`）
- streamable HTTP / SSE 支援
- 標準 error code 與 structured content 處理（順便完成 T-P1-5）
- 之後加 Resources / Prompts / Notifications（P3）有官方介面可用

### 必須保留的對外契約

舊 client 配置已散布在使用者環境，**這些不能變**：

| 端點 / 行為 | 必須保留原因 |
|---|---|
| `POST http://127.0.0.1:<port>/mcp` | Claude / Cursor 既有設定的 endpoint |
| `GET /health` 回 `{status:"ok",tools:N}` | 面板會 ping |
| `POST /api/{category}/{tool}` REST 短路 | 方便手動 curl 測試；面板也用 |
| `GET /api/tools` 回工具清單 | 面板用 |
| `updateEnabledTools(...)` 過濾出對外 tools/list | tool-manager 面板的核心功能 |

→ 若 SDK 不直接支援共存，就用同一個 `http.Server` 接 SDK transport
（`/mcp`）與既有 REST handler（`/api/*`、`/health`）並存。

### 建議步驟

1. **檢查點**：確保 HEAD = `117d846`（或更新後的乾淨點）已 push。
   ```bash
   git status; git log -1 --oneline
   git rev-parse HEAD == git rev-parse origin/main  # 該相等
   ```
2. **裝相依**：
   ```bash
   npm install @modelcontextprotocol/sdk
   ```
3. **先讀 SDK 範例**：
   - 看 `node_modules/@modelcontextprotocol/sdk/dist/esm/server/index.d.ts`
     了解 `Server` 介面
   - 找 `StreamableHTTPServerTransport` 的 README
4. **新增 `source/mcp-server-sdk.ts`** 而非直接改舊檔：先平行存在、能跑
   再切換。舊檔暫時留著，等到 client 連線確認 OK 再刪。
5. **registry 不動**：SDK 接受工具註冊的方式跟 `createToolRegistry()`
   產出的 Map 介面相容（每個 ToolExecutor 有 `getTools()` + `execute()`）。
   只要在 SDK 端註冊一次。
6. **轉接 tools/call response**：SDK 期望 structured content
   `{content: [...], isError?: bool}`。原本是
   `{content:[{type:'text', text: JSON.stringify(toolResult)}]}` 一律純文字。
   改為依 `toolResult.success` 分流（這就是 T-P1-5）：
   - 成功：`{content: [{type:'text', text: <msg>}], structuredContent: <data>}`
   - 失敗：`{content: [{type:'text', text: <error>}], isError: true}`
7. **驗證**：開 Claude Desktop / Cursor 對 endpoint 跑 `tools/list` 與
   一個簡單 `tools/call`（例如 `node_get_all_nodes`），確認前後行為一致。
8. **移除舊 mcp-server.ts**：確認穩定後再刪手寫版。同一個 commit 也行，
   分兩個 commit 也行（拆兩個 commit 比較好回滾）。

### 風險與對策

| 風險 | 對策 |
|---|---|
| SDK 預設 transport 與既有 `POST /mcp` 不相容 | 用 SDK 的 transport adapter；必要時留舊 endpoint shim 一個 release |
| 工具回應格式變更影響 client 顯示 | T-P1-5 同步完成；發 release notes |
| 工具數 157 註冊到 SDK 後啟動慢 | 量測前後啟動時間；超過 1s 才優化 |
| `updateEnabledTools` 過濾邏輯不能直接移植 | 過濾在 `tools/list` handler 內實作，註冊全部 tool 但 list 時依設定過濾 |

## T-P1-6 驗證結果（保留為 reference）

下次任何 prefab 相關工作要記得：

**`@cocos/creator-types/editor/packages/scene/@types/message.d.ts` 中
prefab 相關 channel 只有一個：`restore-prefab`**，簽章
`{ uuid: string }`（`ResetComponentOptions`）。

不存在的 channel（不要再寫）：
- `connect-prefab-instance` / `set-prefab-connection` / `apply-prefab-link`
- `apply-prefab` / `set-prefab` / `load-prefab-to-node`
- `revert-prefab` / `load-asset`

實際在用的 prefab 流程：
- 實例化 → `scene/create-node` 帶 `assetUuid`（會自動建立 prefab linkage）
- 還原 / revert → `scene/restore-prefab` 帶 `{ uuid: nodeUuid }`
- Apply（把實例改動推回資產）→ **公開 API 沒提供**，目前 fail loudly

## 環境快速確認

```bash
cd D:/1_dev/cocos-mcp-server
git status                    # 應為乾淨
git log --oneline -3          # 最頂應是 117d846 fix(p1): verify prefab Editor.Message channels
npm run build                 # 預期 tsc 無輸出
node -e "const {createToolRegistry} = require('./dist/tools/registry.js');
const r = createToolRegistry();
let total = 0;
for (const c of Object.keys(r)) total += r[c].getTools().length;
console.log('categories:', Object.keys(r).length, 'tools:', total);"
# 預期：categories: 14 tools: 157

grep -rE "lizhiyong|fixCommonJsonIssues" source/   # 應無輸出（P0）
grep -rE "'apply-prefab'|'revert-prefab'|'load-asset'|'connect-prefab-instance'" source/   # 應無輸出（T-P1-6）
```

## 文件入口

- 整體 roadmap：`docs/roadmap/README.md`
- P1 詳細任務 + 進度：`docs/roadmap/02-architecture.md`
- 程式碼地雷清單：`CLAUDE.md` §Landmines（P0 + T-P1-6 已修的標 ✅）
- ADR 0001（不追 v1.5.0 spec 的決策）：`docs/adr/0001-skip-v1.5.0-spec.md`
- v1.5.0 部分對齊（P4）：`docs/roadmap/05-v15-spec-parity.md`
- 上游差異分析：`docs/analysis/upstream-status.md`

## 回滾錨點

| 退到哪個狀態 | 指令 |
|---|---|
| T-P1-6 改動前（保留 zod 全部） | `git reset --hard 1035407` 然後 `git push --force-with-lease` |
| T-P1-4 全部改動前（只留 P0 + logger/registry） | `git reset --hard c411a9b` 然後 `git push --force-with-lease` |
| P1 全部改動前（只留 P0） | `git reset --hard 7fb416c` 然後 `git push --force-with-lease` |
| Fork 起點 | `git reset --hard 754adec` 然後 `git push --force-with-lease`（會丟掉所有本 fork commit）|

`--force-with-lease` 比 `--force` 安全，會檢查遠端沒被別人推過。
