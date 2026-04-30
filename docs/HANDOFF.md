# Session Handoff

> 給下次接手的 session（含未來自己）。看完這份 + `docs/roadmap/README.md`
> 就能繼續做下去，不需要重看歷史對話。

## 進度快照（最後更新：2026-05-01；P4 規劃就位，準備動工）

```
P0 ✅ done
P1 ✅ done (主架構部分)
   ├── T-P1-3 Logger 全面化           ✅ done
   ├── T-P1-2 工具註冊表去重複實例化   ✅ done
   ├── T-P1-4 zod schema (14 檔全部)  ✅ done
   ├── T-P1-6 預製體 channel 驗證     ✅ done
   ├── T-P1-1 換官方 MCP SDK          ✅ done
   └── T-P1-5 structured content     ✅ done（隨 T-P1-1 一起）
P4 🚧 in-progress
   ├── T-P4-3 Prefab façade 工具集    ✅ code done（⚠️ 未實機驗證）
   ├── T-P4-1 EventHandler 工具集     ⏳ pending（Phase 2）
   └── T-P4-2 Panel composable 拆分   ⏳ pending（Phase 3，可選）
P2/P3 ⏳ pending
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
- `source/mcp-server-sdk.ts` 用官方 `@modelcontextprotocol/sdk` 的低階
  `Server` + `StreamableHTTPServerTransport`（stateful 模式，
  `mcp-session-id` 分流），取代手寫 HTTP+JSON-RPC 派遣；協議版本由 SDK
  自動協商（已測過協商到 `2025-06-18`）
- `tools/call` 回應改為結構化：成功路徑帶 `structuredContent`（同時保留
  `content[].text` 為 JSON.stringify 結果做向後相容），失敗路徑帶
  `isError: true` + 錯誤訊息文字
- 五代理 code review（`/code-review:code-review`）跑完一輪後修了兩條
  ≥80 信心議題（`f327815`）：(1) `main.ts:updateSettings` 補
  `updateEnabledTools()` 復原 panel「保存設定」流程（之前每次按下都會
  重新暴露全部 157 工具）；(2) `CLAUDE.md` 架構地圖把已刪的
  `mcp-server.ts` 換成 `mcp-server-sdk.ts` 並補 `lib/log.ts` /
  `lib/schema.ts`。隨後 `code-simplifier:code-simplifier` subagent
  再做一輪內部精簡：抽 `jsonRpcError()` helper、去除 `start()` 多餘
  外層 try/catch、`executeToolCall` 用 destructuring + early return
  等，public surface 不變、smoke / live test 仍 59/59 全綠

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

## T-P1-1 / T-P1-5 完成記錄

### 架構

`source/mcp-server-sdk.ts` 用低階 `Server`（不是高階 `McpServer`）+
`StreamableHTTPServerTransport` stateful 模式：

```
http.Server (port: settings.port)
├── /mcp              → handleMcpRequest
│   ├── POST 帶現存 mcp-session-id  → 路由到對應 SessionEntry
│   ├── POST initialize 無 session   → 建新 Server+Transport，登錄 sessions Map
│   └── GET / DELETE                  → 路由到對應 SessionEntry（沒有回 404）
├── /health            → JSON {status:'ok', tools:N}
├── /api/tools         → JSON 工具清單 + curl 範例
└── /api/{cat}/{tool}  → REST 短路，繞過 MCP 直接 dispatch
```

每個 session = 一個 `Server` + 一個 `StreamableHTTPServerTransport`，
keyed by sessionId（透過 `onsessioninitialized` callback 寫入 Map，
`onsessionclosed` 與 `transport.onclose` 兩個地方做清理）。

`updateEnabledTools(...)` 重新計算 `toolsList`，之後對所有 live sessions
廣播 `sendToolListChanged()`。

### 對外契約（驗證過保留）

| 端點 / 行為 | 狀態 |
|---|---|
| `POST http://127.0.0.1:<port>/mcp` | ✅（現由 SDK 處理 session 與協議協商） |
| `GET /health` 回 `{status:"ok",tools:N}` | ✅ |
| `POST /api/{category}/{tool}` REST 短路 | ✅ |
| `GET /api/tools` 回工具清單 | ✅ |
| `updateEnabledTools(...)` 過濾 tools/list | ✅（過濾在 ListToolsRequest handler 內） |

煙霧測試腳本：`scripts/smoke-mcp-sdk.js`，跑流程
init → tools/list → tools/call (成功) → tools/call (失敗) → REST 一輪。
要重跑：

```bash
npm run build
node scripts/smoke-mcp-sdk.js
```

### 已知限制 / 後續可改

1. **session 閒置 TTL 已加（30 分鐘預設，每 60 秒掃一次），但仍無 LRU 上限**。
   詳見 `source/mcp-server-sdk.ts` 的 `SESSION_IDLE_TIMEOUT_MS` 與
   `sweepIdleSessions()`。若日後上多 client 並發長駐情境，要再補
   max-sessions 上限以防超量同時開啟造成記憶體成長。
2. **行為變更**：以前可以直接 POST `/mcp` 帶 `tools/list` 不需先 initialize，
   現在會 400「No valid session ID」。Streamable HTTP spec 本來就要求
   先 initialize；任何不照 spec 走的 client 要改。`/api/{cat}/{tool}`
   REST 短路保持原樣，可以繼續直接打。
3. **協議版本**自動協商（測過協商到 `2025-06-18`）；`2024-11-05` 寫死沒了。

### Panel bug B-001 一併修了

`<ui-checkbox>` 是 Cocos 自訂元素、事件是 `change`+`event.target.checked`，
不吃 Vue v-model 的 `value`+`input`。原本 `自動啟動` / `調試日誌` 兩個
checkbox 用 `v-model` 綁，所以勾選不持久化視覺。改用同檔工具勾選框那種
`:value` + `@change` 的寫法。順便修了 `saveSettings()` 把 `debugLog`
直接送後端的問題（後端欄位是 `enableDebugLog`），原本 debug log 設定會
靜默丟失。詳見 `docs/bugs.md` B-001。

## T-P1-6 驗證結果（保留為 reference）

下次任何 prefab 相關工作要記得：

**`@cocos/creator-types/editor/packages/scene/@types/message.d.ts` 中
prefab 相關 channel 只有一個：`restore-prefab`**，簽章
`{ uuid: string }`（`ResetComponentOptions`）。

不存在的 channel（不要再寫）：
- `connect-prefab-instance` / `set-prefab-connection` / `apply-prefab-link`
- `apply-prefab` / `set-prefab` / `load-prefab-to-node`
- `revert-prefab` / `load-asset`

實際在用的 prefab 流程（host 進程，Editor.Message）：
- 實例化 → `scene/create-node` 帶 `assetUuid`（會自動建立 prefab linkage）
- 還原 / revert → `scene/restore-prefab` 帶 `{ uuid: nodeUuid }`
- Apply（把實例改動推回資產）→ host 沒有；要走 scene-script + façade
  `applyPrefab(nodeUuid)`（見下節）

## 2026-05-01：P4 規劃就位 + Phase 1 done（程式碼層）

詳細可行性分析：[`docs/analysis/v15-feasibility.md`](analysis/v15-feasibility.md)
任務分解：[`docs/roadmap/05-v15-spec-parity.md`](roadmap/05-v15-spec-parity.md)

**Phase 1 已落地**（commit `<TBD-after-this-commit>`）—— T-P4-3 Prefab façade 工具集：

完整 prefab API 在 **scene façade**（`scene-facade-interface.d.ts`），只能透過
`Editor.Message.request('scene', 'execute-scene-script', { name, method, args })`
進入 scene 進程後呼叫：

| 動作 | 路徑 |
|---|---|
| 建立 prefab 資產 | scene-script `cce.Prefab.createPrefab(uuid, url)` |
| Apply（推回資產） | scene-script façade `applyPrefab(nodeUuid)` |
| Link（連到 prefab 資產） | scene-script façade `linkPrefab(nodeUuid, assetUuid)` |
| Unlink（解除連接） | scene-script façade `unlinkPrefab(nodeUuid, removeNested)` |
| 讀 prefab dump | scene-script façade `getPrefabData(nodeUuid)` |

**Phase 1 落地清單**（已完成）：

1. ✅ `source/scene.ts`：補 5 個方法（createPrefabFromNode 重寫、applyPrefab、
   linkPrefab、unlinkPrefab、getPrefabData），加 `getPrefabFacade()` 在
   `cce.Prefab` / `cce.SceneFacadeManager` 之間找可用 façade。
2. ✅ `source/lib/scene-bridge.ts`（新檔）：抽 `runSceneMethod()` /
   `runSceneMethodAsToolResponse()` helper。
3. ✅ `source/tools/prefab-tools.ts`：
   - `updatePrefab` 改走 scene-bridge → applyPrefab，不再 fail loudly。
   - 新增三個 MCP 工具：`link_prefab` / `unlink_prefab` / `get_prefab_data`
     （走 zod schema、走 scene-bridge）。
   - `createPrefab` 入口先試 scene-script `cce.Prefab.createPrefab`，
     成功時 fire-and-forget `asset-db: refresh-asset` 補保險；失敗
     fallback 自寫 JSON。
4. ✅ `tsc --noEmit` 通過、`node scripts/smoke-mcp-sdk.js` 全綠
   （tools count 157 → 160）。
5. ✅ CLAUDE.md Landmines 加註：`updatePrefab` 已走 façade。

**Phase 1 ⚠️ 未驗實機項**（等 Cocos Creator 上手測）：
- `cce.Prefab.createPrefab(uuid, url)` url 雙寫：先試 `db://...`，失敗
  試呼叫端原樣字串。實機驗哪個成功。
- `applyPrefab` 是否自動觸發 asset-db re-import；目前 `update_prefab` 的
  父呼叫端不額外 refresh，但 `create_prefab` 走 façade 路徑時有 refresh
  補保險。
- façade 偵測順序：`cce.Prefab` → `cce.SceneFacadeManager.instance` →
  `cce.SceneFacadeManager`。實機若三者都不通，要回 scene.ts 補正確路徑。

**Phase 2 入口** — T-P4-1 EventHandler 工具：在 `component-tools.ts` 新增
`add_event_handler` / `remove_event_handler` / `list_event_handlers`，
路徑用 host `set-property` on `clickEvents`，dump 結構先以 dev script 抓
ground truth（一次性，不入庫）。

**Phase 3 入口** — T-P4-2 Panel composable：拆 `useServerStatus` /
`useToolConfig` / `useSettings`，只動 `panels/default/index.ts`，不動
template / style。

**未驗的實機項目**（每個 Phase 完成後再排）：
- `cce.Prefab.createPrefab` url 參數格式（`db://` vs 絕對路徑）
- `applyPrefab` 是否觸發 asset-db re-import
- EventHandler dump 的精確 `type` 欄位值
- 3.8.1 `component` 欄位寫不進去的 issue #16517 影響

## 環境快速確認

```bash
cd D:/1_dev/cocos-mcp-server
git status                    # 應為乾淨
git log --oneline -3          # 最頂為 P4 Phase 0（doc 規劃）的 commit
npm run build                 # 預期 tsc 無輸出
node -e "const {createToolRegistry} = require('./dist/tools/registry.js');
const r = createToolRegistry();
let total = 0;
for (const c of Object.keys(r)) total += r[c].getTools().length;
console.log('categories:', Object.keys(r).length, 'tools:', total);"
# 預期：categories: 14 tools: 157（Phase 1 後會 +3 變 160）

grep -rE "lizhiyong|fixCommonJsonIssues" source/   # 應無輸出（P0）
grep -rE "'apply-prefab'|'revert-prefab'|'load-asset'|'connect-prefab-instance'" source/   # 應無輸出（T-P1-6）
```

## 文件入口

- 整體 roadmap：`docs/roadmap/README.md`
- P1 詳細任務 + 進度：`docs/roadmap/02-architecture.md`
- P4 詳細任務 + 進度：`docs/roadmap/05-v15-spec-parity.md`
- **v1.5.0 可行性分析（P4 落地依據）**：`docs/analysis/v15-feasibility.md`
- 程式碼地雷清單：`CLAUDE.md` §Landmines（P0 + T-P1-6 已修的標 ✅）
- ADR 0001（不追 v1.5.0 spec 的決策）：`docs/adr/0001-skip-v1.5.0-spec.md`
- 上游差異分析：`docs/analysis/upstream-status.md`

## 回滾錨點

| 退到哪個狀態 | 指令 |
|---|---|
| T-P1-1 改動前（保留 T-P1-2~6） | `git reset --hard d5b0484` 然後 `git push --force-with-lease` |
| T-P1-6 改動前（保留 zod 全部） | `git reset --hard 1035407` 然後 `git push --force-with-lease` |
| T-P1-4 全部改動前（只留 P0 + logger/registry） | `git reset --hard c411a9b` 然後 `git push --force-with-lease` |
| P1 全部改動前（只留 P0） | `git reset --hard 7fb416c` 然後 `git push --force-with-lease` |
| Fork 起點 | `git reset --hard 754adec` 然後 `git push --force-with-lease`（會丟掉所有本 fork commit）|

`--force-with-lease` 比 `--force` 安全，會檢查遠端沒被別人推過。
