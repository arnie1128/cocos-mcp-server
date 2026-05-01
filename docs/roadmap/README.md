# Roadmap 總覽

> 按優先序分四階段。各階段可獨立交付，後一階段不嚴格 block 前一階段，但
> 強烈建議照順序做。

## 階段速查

| 階段 | 主題 | 預估工時 | 風險 | 文件 |
|---|---|---|---|---|
| **P0** | 基線硬傷修復 ✅ done 2026-04-30 | ~2 小時 | 低 | [`01-baseline-fixes.md`](./01-baseline-fixes.md) |
| **P1** | 架構債清理 ✅ done 2026-05-01 | ~7 天 | 中 | [`02-architecture.md`](./02-architecture.md) |
| **P2** | 工具收斂 ❌ closed 2026-05-01（量測後判定不值得：lossless 反而 +37%） | ~1-2 週 | 中 | [`03-tool-consolidation.md`](./03-tool-consolidation.md) |
| **P4** | v1.5.0 部分對齊（prefab façade + 事件綁定 + 面板 composable）✅ done v2.1.1–v2.1.4（含實機驗證） | ~10 天累積 | 中 | [`05-v15-spec-parity.md`](./05-v15-spec-parity.md) |
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

3. ~~**P2 為條件式執行**~~：**已 close（2026-05-01）**。跑了
   `scripts/measure-tool-tokens.js`，lossless 收斂（router-A，oneOf
   保留每個 sub-schema）反而比現況多 37% 字數；只有 lossy 形態
   （丟掉 per-action arg validation）才能達到 v1.5.0 宣稱的「-50%」。
   後者對 Cocos Creator 領域不划算。詳見
   [ADR 0001 補註](../adr/0001-skip-v1.5.0-spec.md#補註p2-工具收斂量測結果2026-05-01)。

4. **P3 最後**：Resources / Prompts / Notifications 是錦上添花，只在前面
   穩了之後才有意義。

## 與 v1.5.0 的關係（2026-05-01 修訂）

| 原作者 v1.5.0 承諾 | 我們對應的階段 |
|---|---|
| 工具收斂 50 個 | P2 ❌ closed（量測後否決；lossless 反而 +37%） |
| 預製體 channel 驗證 | P1 T-P1-6 ✅ done（`restore-prefab` 是唯一 host channel） |
| 預製體 apply / link / unlink / 建立 | **P4 T-P4-3**（走 scene-script + façade） |
| 事件綁定補完 | P4 T-P4-1 |
| 接口優化 | 散落在 P1（zod schema）與 P2 |
| 面板 UI | P4 T-P4-2（範圍縮小：只拆 composable） |
| Token -50% | 已量測；只有丟 arg validation 才達得到，否決 |

ADR 0001（不追 v1.5.0 spec）的決策仍成立——我們不把「對齊上游 README」
當主目標，但 v1.5.0 列項中**可行且有獨立價值**的部分可選擇性拿回。

每項對應的官方 API 路徑與可行性詳見
[`analysis/v15-feasibility.md`](../analysis/v15-feasibility.md)。
詳細不追的理由見 [`adr/0001-skip-v1.5.0-spec.md`](../adr/0001-skip-v1.5.0-spec.md)。

## 執行原則

- **每階段獨立 PR / commit**：不混。
- **每階段結束都跑一次** `tsc --noEmit` 與實機 smoke test。
- **不引入未測試的 fallback**：寧可工具暫時 fail loudly，不要藏 try-catch 階梯。
- **量測勝於猜測**：宣稱「token 降低 X%」之前先量。

## 進度追蹤

各階段檔頂端會標 `Status: pending | in-progress | done`。完成後保留歷史
記錄，不刪文，方便回頭比對決策。
