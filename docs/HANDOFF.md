# Session Handoff — 2026-04-30

> 給下次接手的 session（含未來自己）。看完這份 + `docs/roadmap/README.md`
> 就能繼續做下去，不需要重看歷史對話。

## 目前進度（最後更新：2026-04-30）

```
P0 ✅ done
P1 🚧 in-progress  (約 60% 完成)
   ├── T-P1-3 Logger 全面化           ✅ done (c411a9b)
   ├── T-P1-2 工具註冊表去重複實例化   ✅ done (c411a9b)
   ├── T-P1-4 zod schema (14 檔全部)  ✅ done (8342036)
   ├── T-P1-6 預製體 channel 驗證     ⏳ pending  ← 建議下一個做
   ├── T-P1-1 換官方 MCP SDK          ⏳ pending
   └── T-P1-5 structured content     ⏳ pending（與 T-P1-1 一起）
P2/P3/P4 ⏳ pending
```

zod schema 落地後的 source size：14 個 tool 檔總 schema 行數從 ~3200 行
（手寫 JSON Schema）縮為 ~1100 行（zod）。所有 inputSchema 已透過
`source/lib/schema.ts` 的 `relaxJsonSchema` 後處理對齊原版風格
（無 `additionalProperties:false`、default 欄位不入 `required`）。
`createToolRegistry()` 回傳 14 類 / 157 tools。

## 還沒動的 P1 任務

### T-P1-6 預製體 channel 驗證

**位置**：`source/tools/prefab-tools.ts:330` (`establishPrefabConnection`) 與
`:617` (`applyPrefabToNode`)。

**做法**：
1. 打開 `node_modules/@cocos/creator-types/editor/...` 找 scene 模組的
   message map。確認 `connect-prefab-instance`、`set-prefab-connection`、
   `apply-prefab-link`、`apply-prefab`、`set-prefab`、`load-prefab-to-node`
   六個 channel 哪些真的存在。
2. 兩段 ladder 各保留**一個** verified channel，其他刪掉。
3. fail loudly：channel 不存在或執行失敗時 `success: false` + 具體錯誤，
   不再吞錯往下試。
4. 詳細範圍見 `roadmap/02-architecture.md` T-P1-6。

### T-P1-1 換官方 MCP SDK

**目標**：`@modelcontextprotocol/sdk` 取代手寫 `mcp-server.ts`。

**前提**：建議 T-P1-4 全部擴展完再做（zod schema 套用一致後，SDK 註冊
工具會比較單純）。

**保留必要**：`/health` 端點、`/api/{category}/{tool}` REST 路徑、
`updateEnabledTools` 邏輯。

### T-P1-5 structured content

**搭 T-P1-1 一起做**。SDK 提供結構化 response API，到時候改一次就好。

## 環境快速確認

```bash
cd D:/1_dev/cocos-mcp-server
npm run build               # 預期：tsc 無輸出代表通過
git log --oneline -5        # 確認最後一個 commit 是 6e6d720 (zod pilot)
grep -r "lizhiyong" source/ # 預期：無結果（P0 已清）
grep -r "fixCommonJsonIssues" source/  # 預期：無結果（P0 已清）
```

## 文件入口

- 整體 roadmap：`docs/roadmap/README.md`
- P1 詳細：`docs/roadmap/02-architecture.md`
- 程式碼地雷清單：`CLAUDE.md` §Landmines（P0 已修的標 ✅）
- ADR 0001（不追 v1.5.0 spec 的決策）：`docs/adr/0001-skip-v1.5.0-spec.md`

## 風險提醒

- 不要動 `dist/`（tsc 產物，build 自動更新）。
- 修工具的 zod schema 時，每改一個 tool 檔就 build 一次、用上面的 node 檢查
  指令做等價性驗證，避免 inputSchema 與原版偏離造成 Claude 行為改變。
- prefab-tools.ts 有 ~2855 行，最後做。需要與 T-P1-6 一起規劃。
