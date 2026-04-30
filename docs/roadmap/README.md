# Roadmap 總覽

> 按優先序分四階段。各階段可獨立交付，後一階段不嚴格 block 前一階段，但
> 強烈建議照順序做。

## 階段速查

| 階段 | 主題 | 預估工時 | 風險 | 文件 |
|---|---|---|---|---|
| **P0** | 基線硬傷修復 ✅ done 2026-04-30 | ~2 小時 | 低 | [`01-baseline-fixes.md`](./01-baseline-fixes.md) |
| **P1** | 架構債清理 ✅ done 2026-05-01 | ~7 天 | 中 | [`02-architecture.md`](./02-architecture.md) |
| **P2** | 工具收斂（評估 + 選擇性執行） | ~1-2 週 | 中 | [`03-tool-consolidation.md`](./03-tool-consolidation.md) |
| **P4** | v1.5.0 部分對齊（事件綁定 + 面板 UI） | ~3-5 天 | 中 | [`05-v15-spec-parity.md`](./05-v15-spec-parity.md) |
| **P3** | MCP 進階能力（Resources/Prompts/Notifications） | ~1-2 週 | 中-高 | [`04-protocol-extensions.md`](./04-protocol-extensions.md) |

> P3 與 P4 互不相依，順序視當下需求。
> P1 細項進度見 [`02-architecture.md`](./02-architecture.md) §進度；
> 下一個 session 接手點見 [`docs/HANDOFF.md`](../HANDOFF.md)。

## 排序邏輯

1. **P0 在最前面**：硬編碼路徑、JSON 修補 regex、未控制的 console.log
   是「不修就一直在咬人」的問題，優先級高於任何新功能。每項 30 分鐘到 1
   小時，做完才有乾淨的工作環境。

2. **P1 排第二**：在收斂工具或加新功能前，先把底層換掉。如果先做 P2 或
   P3 才換 SDK，等於工作做兩遍。換 SDK 預估**砍掉 200+ 行樣板**，CP 值
   高。

3. **P2 為條件式執行**：是否要照 v1.5.0 收斂工具，**取決於 P1 完成後
   的 token 量測**。如果 zod schema + structured content 已經顯著降低
   prompt 成本，工具收斂可能不再必要。

4. **P3 最後**：Resources / Prompts / Notifications 是錦上添花，只在前面
   穩了之後才有意義。

## 與 v1.5.0 的關係（2026-04-30 修訂）

| 原作者 v1.5.0 承諾 | 我們對應的階段 |
|---|---|
| 工具收斂 50 個 | P2（條件式執行） |
| 預製體 100% 對齊 | P1 T-P1-6 處理 ladder 清理；「100%」全鏈路依實機測試結果再加碼 |
| 事件綁定補完 | P4 T-P4-1 |
| 接口優化 | 散落在 P1（zod schema）與 P2 |
| 面板 UI | P4 T-P4-2（低優先，可省略） |
| Token -50% | 不承諾，但 P1 + P2 做完後會量測 |

ADR 0001（不追 v1.5.0 spec）的決策仍成立——我們不把「對齊上游 README」
當主目標，但 v1.5.0 列項中**可行且有獨立價值**的部分可選擇性拿回。

詳細不追的理由見 [`adr/0001-skip-v1.5.0-spec.md`](../adr/0001-skip-v1.5.0-spec.md)。

## 執行原則

- **每階段獨立 PR / commit**：不混。
- **每階段結束都跑一次** `tsc --noEmit` 與實機 smoke test。
- **不引入未測試的 fallback**：寧可工具暫時 fail loudly，不要藏 try-catch 階梯。
- **量測勝於猜測**：宣稱「token 降低 X%」之前先量。

## 進度追蹤

各階段檔頂端會標 `Status: pending | in-progress | done`。完成後保留歷史
記錄，不刪文，方便回頭比對決策。
