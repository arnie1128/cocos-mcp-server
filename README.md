# Cocos Creator MCP Server（fork）

一個給 Cocos Creator 3.8+ 的編輯器擴充套件，把編輯器以 MCP（Model Context
Protocol）暴露出來，讓 AI 助手能驅動編輯器：場景／節點／組件／預製體／資源
操作、專案執行與建構、debug log 等。

> **Fork 注意**：這個 repo 是 [`arnie1128/cocos-mcp-server`](https://github.com/arnie1128/cocos-mcp-server)
> v1.4.0 的個人 fork，不對齊上游 README 中宣告的 v1.5.0 規劃（50 工具收斂、
> action router、token -50% 等都未實作；上游 v1.5.0 從未推到 GitHub）。
> 與上游的差異與決策見 [`docs/adr/0001-skip-v1.5.0-spec.md`](docs/adr/0001-skip-v1.5.0-spec.md)
> 與 [`docs/analysis/upstream-status.md`](docs/analysis/upstream-status.md)。
> 上游的原始 README / FEATURE_GUIDE 已歸檔至 [`docs/archive/upstream-docs/`](docs/archive/upstream-docs/)。

## 目前能做什麼

- **160 個 MCP 工具**，分 14 個 category（scene / node / component / prefab /
  project / debug / preferences / server / broadcast / referenceImage /
  assetAdvanced / sceneAdvanced / sceneView / validation）。完整工具清單見
  [`docs/tools.md`](docs/tools.md)。
- 採用官方 [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk)
  低階 `Server` + `StreamableHTTPServerTransport`，協定版本由 client 協商
  （已驗 `2025-06-18`）。
- 全部工具入參用 [zod](https://zod.dev/) schema 驗證，回應走 MCP structured
  content（`structuredContent` + back-compat `content[].text`）。
- 已落地 v1.5.0 中**真正可行**的部分：完整 Prefab façade（apply / link /
  unlink / get / createFromNode）、EventHandler 工具集（add / remove / list）、
  panel composable 拆分、cc.Sprite 建議旗標、節點 layer 自動推導、場景
  template 等。

## 安裝

把整個 repo 複製到你的 Cocos Creator 專案的 `extensions/` 目錄底下：

```
你的專案/
├── assets/
├── extensions/
│   └── cocos-mcp-server/      ← clone 到這裡
│       ├── source/
│       ├── dist/
│       ├── package.json
│       └── ...
└── settings/
```

進到資料夾安裝依賴：

```bash
cd extensions/cocos-mcp-server
npm install      # 跑 scripts/preinstall.js 預檢環境
npm run build    # tsc → dist/
```

重啟 Cocos Creator 或 reload extensions，從選單 `Extensions → Cocos MCP Server`
開啟面板，按下 Start Server。預設 port 3000，HTTP MCP 端點 `http://127.0.0.1:3000/mcp`，
另有 REST 短路 `POST http://127.0.0.1:3000/api/{category}/{tool}` 供 ad-hoc
測試。

## AI Client 配置

**Claude Code（CLI）**

```bash
claude mcp add --transport http cocos-creator http://127.0.0.1:3000/mcp
```

**Claude Desktop（`claude_desktop_config.json`）**

```json
{
  "mcpServers": {
    "cocos-creator": {
      "type": "http",
      "url": "http://127.0.0.1:3000/mcp"
    }
  }
}
```

**Cursor / VS Code MCP 風格 client**

```json
{
  "mcpServers": {
    "cocos-creator": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

## 健康檢查

```bash
curl -s http://127.0.0.1:3000/health
# {"status":"ok","tools":160}
```

## 工具總覽

完整清單見 [`docs/tools.md`](docs/tools.md)（由 `scripts/generate-tools-doc.js`
從 zod schema 自動產生，工具增減後重跑 generator 同步）。Category 一覽：

| Category | 工具數 | 涵蓋 |
|---|---|---|
| scene | 8 | 場景開關、儲存、新建（含 2D/3D template）、save-as |
| sceneAdvanced | 23 | 場景進階查詢、節點搜尋、scene-script 入口 |
| sceneView | 20 | gizmo / 視窗模式 / 座標系 / 參考圖 |
| node | 11 | 建／改／刪節點，含 layer 自動推導 |
| component | 10 | 組件 CRUD、property 設定、EventHandler 系列 |
| prefab | 11 | 完整 prefab façade（create / apply / link / unlink / get / restore）|
| project | 24 | 資源 CRUD、build、preview、設定查詢 |
| debug | 9 | console / log / 系統資訊 |
| preferences | 7 | 編輯器偏好 |
| server | 6 | server / 環境資訊 |
| broadcast | 5 | 訊息廣播 |
| referenceImage | 12 | 場景視圖參考圖管理 |
| assetAdvanced | 11 | meta、URL、相依性、批次操作 |
| validation | 3 | 場景／資源完整性檢查 |

## 文件導覽

開發者文件全部放在 [`docs/`](docs/)：

- [`docs/HANDOFF.md`](docs/HANDOFF.md) — 隨進度更新的 session 接手指南
- [`docs/README.md`](docs/README.md) — 文件入口與閱讀順序建議
- [`docs/architecture/`](docs/architecture/) — 系統如何運作
- [`docs/analysis/`](docs/analysis/) — 對現況的評估、上游差異、可行性分析
- [`docs/roadmap/`](docs/roadmap/) — P0 / P1 / P2 / P3 / P4 規劃與進度
- [`docs/adr/`](docs/adr/) — Architectural Decision Records

AI session 操作守則：repo 根目錄 [`CLAUDE.md`](CLAUDE.md)。

## 開發

```bash
npm run watch    # tsc -w，編輯時自動編譯
node scripts/smoke-mcp-sdk.js     # 對 SDK server 的 stub-registry smoke
```

新增工具：在 `source/tools/<category>-tools.ts` 的 `<categorySchemas>` 加入
zod schema，在 `execute()` switch 加入 dispatch，方法寫 scene-side 或 host-side
依需求。詳見 [`docs/architecture/tool-system.md`](docs/architecture/tool-system.md)。

## 授權

MIT，承襲上游。原作者 LiDaxian / arnie1128。
