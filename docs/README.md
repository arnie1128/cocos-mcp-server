# 文件索引

本資料夾收錄此 fork 的所有設計、分析與規劃文件。內容以**繁體中文**撰寫，供
專案維護者閱讀；AI session 的操作守則放在 repo 根目錄的 `CLAUDE.md`。

## 目錄結構

```
docs/
├── README.md                          # 本檔，整體導覽
├── HANDOFF.md                         # session 暫停 / 接手指南（隨進度更新）
├── architecture/                      # 系統如何運作（描述現況）
│   ├── overview.md                    # 整體架構與資料流
│   └── tool-system.md                 # 工具註冊／分派機制
├── analysis/                          # 我們對現況的評估（哪裡有問題）
│   ├── code-quality.md                # 程式碼品質瑕疵清單
│   ├── upstream-status.md             # 與原作者 v1.5.0 規劃的落差
│   ├── v15-feasibility.md             # v1.5.0 七承諾逐項可行性 + 官方 API 路徑
│   └── tool-inventory.md              # 170 個工具的盤點與分類
├── roadmap/                           # 未來規劃（按優先序分階段）
│   ├── README.md                      # P0–P4 總表
│   ├── 01-baseline-fixes.md           # P0：硬傷修復（done 2026-04-30）
│   ├── 02-architecture.md             # P1：架構債清理
│   ├── 03-tool-consolidation.md       # P2：工具收斂
│   ├── 04-protocol-extensions.md      # P3：MCP 進階能力
│   └── 05-v15-spec-parity.md          # P4：v1.5.0 部分對齊
└── adr/                               # Architectural Decision Records
    ├── README.md                      # ADR 總覽
    └── 0001-skip-v1.5.0-spec.md       # 不追原作者 v1.5.0 spec 的決議
```

## 閱讀順序建議

| 你是誰 | 從哪開始 |
|---|---|
| 第一次接觸這個 fork | `architecture/overview.md` → `analysis/upstream-status.md` |
| 想知道有哪些坑 | `analysis/code-quality.md` |
| 想開始動工 | `roadmap/README.md` 看優先序，再看對應階段檔 |
| 想理解某個決定為什麼這樣定 | `adr/` |
| AI session 要操作專案 | repo 根目錄 `CLAUDE.md` |

## 文件維護規則

- 新增 ADR 時用流水號（`0002-...`、`0003-...`），不重用、不重排。
- `architecture/` 是**現況描述**，重大重構後同步更新。
- `analysis/` 是**靜態快照**，加註撰寫日期；不要事後改寫已落地的觀察。
- `roadmap/` 內各階段完成後在該檔頂端加 `Status: done` 並保留歷史。
- 新文件加進來時，更新本檔的目錄樹。
