# Session Handoff — 2026-04-30 暫停點

> 給下次接手的 session（含未來自己）。看完這份 + `docs/roadmap/README.md`
> 就能繼續做下去，不需要重看歷史對話。

## 目前進度（最後更新：2026-04-30）

```
P0 ✅ done     (commit dafc25e..c42531a, docs c42531a..7fb416c)
P1 🚧 in-progress
   ├── T-P1-3 Logger 全面化         ✅ done (c411a9b)
   ├── T-P1-2 工具註冊表去重複實例化  ✅ done (c411a9b)
   ├── T-P1-4 zod schema             🚧 試點完成（node-tools.ts），13 檔待擴展 (6e6d720)
   ├── T-P1-6 預製體 channel 驗證     ⏳ pending
   ├── T-P1-1 換官方 MCP SDK         ⏳ pending
   └── T-P1-5 structured content     ⏳ pending（與 T-P1-1 一起）
P2/P3/P4 ⏳ pending
```

## 立即能接手的下一步：T-P1-4 擴展

把 `nodeSchemas` 模式套用到剩 13 個 tool 檔。**參考範本**：
`source/tools/node-tools.ts` 的整體結構（schema map → getTools 動態產出 →
execute 先 validateArgs 再 dispatch）。

### 建議擴展順序（從簡單到複雜）

| 順序 | 檔案 | 工具數 | 備註 |
|---|---|---|---|
| 1 | `server-tools.ts` | 6 | 最簡單，先暖身 |
| 2 | `preferences-tools.ts` | 7 | 簡單 |
| 3 | `broadcast-tools.ts` | 5 | 簡單 |
| 4 | `validation-tools.ts` | 3 | 極簡 |
| 5 | `reference-image-tools.ts` | 12 | 中等 |
| 6 | `scene-tools.ts` | 10 | 中等 |
| 7 | `debug-tools.ts` | 11 | 中等 |
| 8 | `asset-advanced-tools.ts` | 11 | 中等 |
| 9 | `project-tools.ts` | 24 | 大但結構清楚 |
| 10 | `scene-view-tools.ts` | 20 | 大 |
| 11 | `component-tools.ts` | 11 | **大量 console（已 P0 處理），但 schema 可能有複雜引用型別** |
| 12 | `scene-advanced-tools.ts` | 23 | 混雜度高 |
| 13 | `prefab-tools.ts` | 12 | **最後做**，與 T-P1-6 channel 驗證有相依性 |

### 套用範本（複製 node-tools.ts 的結構）

```ts
import { z, toInputSchema, validateArgs } from '../lib/schema';

const myToolSchemas = {
    tool_a: z.object({ ... }),
    tool_b: z.object({ ... }),
} as const;

const myToolMeta: Record<keyof typeof myToolSchemas, string> = {
    tool_a: 'description for tool_a',
    tool_b: 'description for tool_b',
};

export class MyTools implements ToolExecutor {
    getTools(): ToolDefinition[] {
        return (Object.keys(myToolSchemas) as Array<keyof typeof myToolSchemas>).map(name => ({
            name,
            description: myToolMeta[name],
            inputSchema: toInputSchema(myToolSchemas[name]),
        }));
    }

    async execute(toolName: string, args: any): Promise<ToolResponse> {
        const schemaName = toolName as keyof typeof myToolSchemas;
        const schema = myToolSchemas[schemaName];
        if (!schema) throw new Error(`Unknown tool: ${toolName}`);
        const validation = validateArgs(schema, args ?? {});
        if (!validation.ok) return validation.response;
        const a = validation.data as any;

        switch (schemaName) {
            case 'tool_a': return await this.toolA(a);
            // ...
        }
    }
}
```

### 等價性驗證（每檔做一次）

對照原始檔的「同一個工具」inputSchema 與 zod 產出，用以下指令快速看：

```bash
node -e "const { MyTools } = require('./dist/tools/my-tools.js');
const tools = new MyTools().getTools();
console.log(JSON.stringify(tools.find(t => t.name === 'tool_a').inputSchema, null, 2));"
```

**檢查重點**：
1. `required` 欄位是否一致（含 default 的欄位**不應**出現在 required；helper 已自動處理）
2. 不應出現 `additionalProperties: false`（helper 已遞迴清掉）
3. 巢狀物件每個欄位的 description 與型別跟原版相同
4. enum 值順序一致

### 已知 zod 4 v.s. 手寫的差異（helper 已抹平）

| 議題 | zod 4 預設 | 手寫慣例 | helper 處理 |
|---|---|---|---|
| `additionalProperties: false` | 加入 | 不加 | `relaxJsonSchema` 遞迴刪除 |
| `.default()` 欄位是否在 `required` | 在 | 不在 | helper 從 required 過濾掉 |
| `$schema` URL | 在頂層 | 不加 | helper 刪掉 |

### Schema 寫法注意事項

- **欄位純可選**（無 default）：`z.string().optional()`
- **欄位有預設值**：`z.boolean().default(false)`（zod 會處理輸入時補 default）
- **任意型別欄位**（原本只有 description 沒有 type）：`z.any().describe('...')`
- **enum**：`z.enum(['A', 'B'])`，順序保留
- **巢狀物件**：直接 `z.object({ ... })` 巢套；如複用，抽 const

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
