# P0 — 基線硬傷修復

**Status**: done（2026-04-30）
**預估工時**: ~2 小時（實際 ~1 小時）
**風險**: 低（純機械修補，行為等價或更安全）
**前置**: 無

## 落地摘要（2026-04-30）

- T-P0-1：debug-tools.ts 三處與 prefab-tools.ts 一處硬編碼路徑全清，改用 `Editor.Project.path`；debug-tools 抽 `resolveProjectLogPath()` helper 統一三個工具入口。`grep lizhiyong` 無殘留。
- T-P0-2：移除 `fixCommonJsonIssues` 整個方法；`handleMCPRequest` / `handleSimpleAPIRequest` 改回標準 parse 失敗回應，`-32700` 與 400 路徑保留 200 字 body 截斷。
- T-P0-3：新增 `source/lib/log.ts`（`debugLog` + `setDebugLogEnabled`），`MCPServer` constructor 與 `updateSettings` 透過 `setDebugLogEnabled` 連動 `enableDebugLog` 設定；`prefab-tools.ts`（67 處）與 `component-tools.ts`（57 處）的 `console.log` 全改為 `debugLog`。`console.warn/error` 維持原樣（fatal/警告永遠輸出）。
- 建置驗證：`npm run build` 通過；source 行數淨減 ~200 行（含 P0-1 ladder 移除）。

## 範圍

只修「不修就會持續造成錯誤行為」的硬傷，不重構架構，不改公開介面。

## 任務清單

### T-P0-1：移除硬編碼 `/Users/lizhiyong/NewProject_3`

**位置**：

- `source/tools/debug-tools.ts:430`、`499`、`548`
- `source/tools/prefab-tools.ts:449`、`450`、`453`

**做法**：

1. 統一改用 `Editor.Project.path` 作為基準。
2. 若 `Editor.Project` 不存在，回 `success: false` 加明確錯誤訊息，**不要
   猜路徑**。
3. `prefab-tools.ts` 內 `possiblePaths` 陣列改為單一路徑（從
   `Editor.Project.path` 推導），刪除 `process.cwd()` 與寫死路徑兩個
   fallback。

**驗證**：

- 建立一個與原作者路徑不同的 Cocos 專案，呼叫 `debug_get_project_logs`
  與預製體建立相關工具，確認不再 fallback 到錯誤路徑。
- `grep -nE "lizhiyong|NewProject_3" source/` 應無結果。

### T-P0-2：移除 `fixCommonJsonIssues`

**位置**：`source/mcp-server.ts:295-313`、`220-225`、`360-373`。

**做法**：

1. 移除 `fixCommonJsonIssues` 整個方法。
2. `handleMCPRequest` 與 `handleSimpleAPIRequest` 內，JSON 解析失敗直接回
   JSON-RPC `-32700 Parse error`，body 截斷至前 200 字回應給 client（已存在
   邏輯，保留即可）。

**驗證**：

- 傳入一段含中文單引號的合法 JSON 字串，確認可正常 parse（不再被 regex
  亂改）。
- 傳入語法錯誤 JSON，確認回應為 `{jsonrpc: '2.0', id: null, error: {code:
  -32700, message: 'Parse error: ...'}}`。

### T-P0-3：log gating（最小版）

**做法**：

不一次重構成完整 Logger，先做兩件最便宜的事：

1. 在 `source/lib/log.ts`（新建）放一個 `debugLog(settings, ...args)`
   helper：當 `settings.enableDebugLog === true` 才呼叫 `console.log`。
2. `prefab-tools.ts` 與 `component-tools.ts` 內**最噴的迴圈裡**（`for`
   /`forEach` 內的 log）優先取代為 `debugLog(...)`。其他 log 留原樣，
   下一階段一併處理。

**驗證**：

- Server 預設 `enableDebugLog: false`，呼叫一次 `prefab_create_prefab`，
  Cocos console 內每次操作的 log 行數至少減少 50%。
- 設成 `true` 時行為與目前一致。

> 說明：完整的 log 系統重構放在 P1。這裡只解決「噴最大」的兩支檔案，避免
> 一次改 14 檔 PR 過大。

## 完成標準

- [ ] T-P0-1 三個檔案 6 處全改完，grep 無殘留。
- [ ] T-P0-2 整個 method 移除，handler 改回標準 parse 失敗回應。
- [ ] T-P0-3 至少 prefab-tools 與 component-tools 主要迴圈用 `debugLog`。
- [ ] `npm run build` 通過。
- [ ] 實機 smoke test：啟動 server、呼叫 `node_get_all_nodes`、
      `prefab_get_prefab_list`、`debug_get_project_logs` 三項，全成功。

## 不在範圍

- 不重寫 prefab fallback ladder（屬 P1）。
- 不換 MCP SDK（屬 P1）。
- 不重構 `ToolManager` 重複實例化（屬 P1）。
