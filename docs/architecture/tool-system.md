# 工具系統

> 工具如何宣告、註冊、被外部呼叫的完整流程。
> 最後修訂：2026-04-30（P1 T-P1-2 / T-P1-4 落地後狀態）。

## 一、ToolExecutor 介面

所有工具類別必須實作 `source/types/index.ts` 的 `ToolExecutor`：

```ts
export interface ToolExecutor {
    getTools(): ToolDefinition[];
    execute(toolName: string, args: any): Promise<ToolResponse>;
}
```

- `getTools()`：回傳工具 metadata（名稱、描述、JSON Schema）。
- `execute()`：依工具名稱分派執行邏輯，回傳 `ToolResponse`。
  在 P1 T-P1-4 後，`execute()` 入口會先做 zod schema 驗證。

## 二、命名慣例

對外曝露的工具名為 `${category}_${toolName}`：

| 類別 | 檔案 | 範例工具名 |
|---|---|---|
| `scene` | `scene-tools.ts` | `scene_get_current_scene` |
| `node` | `node-tools.ts` | `node_create_node` |
| `component` | `component-tools.ts` | `component_set_component_property` |
| `prefab` | `prefab-tools.ts` | `prefab_create_prefab` |
| `project` | `project-tools.ts` | `project_run_project` |
| `debug` | `debug-tools.ts` | `debug_get_console_logs` |
| `preferences` | `preferences-tools.ts` | `preferences_query_preferences_config` |
| `server` | `server-tools.ts` | `server_get_server_status` |
| `broadcast` | `broadcast-tools.ts` | `broadcast_listen_broadcast` |
| `sceneAdvanced` | `scene-advanced-tools.ts` | `sceneAdvanced_execute_scene_script` |
| `sceneView` | `scene-view-tools.ts` | `sceneView_change_gizmo_tool` |
| `referenceImage` | `reference-image-tools.ts` | `referenceImage_add_reference_image` |
| `assetAdvanced` | `asset-advanced-tools.ts` | `assetAdvanced_batch_import_assets` |
| `validation` | `validation-tools.ts` | `validation_validate_json_params` |

## 三、註冊流程（P1 後）

```
┌─────────────────────────────────────────────────────────────┐
│ main.ts:load()                                              │
│   const registry = createToolRegistry()                     │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ source/tools/registry.ts                                    │
│   return {                                                  │
│     scene: new SceneTools(),                                │
│     node:  new NodeTools(),                                 │
│     ... (14 類，僅 new 一次)                                │
│   } as ToolRegistry  (= Record<string, ToolExecutor>)       │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
                ┌──────────────┴──────────────┐
                ▼                             ▼
     ┌──────────────────────┐      ┌──────────────────────┐
     │ new MCPServer(       │      │ new ToolManager(     │
     │   settings, registry)│      │   registry)          │
     │   this.tools = reg   │      │   讀 registry 出     │
     │                      │      │   metadata / 過濾     │
     └──────────┬───────────┘      └──────────────────────┘
                ▼
     MCPServer.setupTools()
       for (cat, set) in this.tools:
         for (t in set.getTools()):
           toolsList.push({
             name: `${cat}_${t.name}`,
             description, inputSchema  ← inputSchema 由 toInputSchema(zod) 產生
           })
                │
                ▼
     對外可見的 toolsList（再依 enabledTools 過濾）
```

## 四、分派流程（P1 後）

```
client → POST /mcp { method: 'tools/call', params: { name, arguments } }
                                   │
                                   ▼
              MCPServer.handleMessage(message)
                                   │
                                   ▼
              MCPServer.executeToolCall(toolName, args)
                  • parts = toolName.split('_')
                  • category = parts[0]
                  • methodName = parts.slice(1).join('_')
                  • this.tools[category].execute(methodName, args)
                                   │
                                   ▼
                  ToolExecutor.execute(toolName, args)
                  • const validation = validateArgs(schemas[toolName], args ?? {})
                  • if (!validation.ok) return validation.response  ← 早退錯誤
                  • const a = validation.data  ← defaults 已套用
                  • switch on toolName → 呼叫對應 private method 並傳 a
                  • 回傳 ToolResponse
```

## 五、工具啟用/停用機制

`source/tools/tool-manager.ts` 維護「configurations」清單，每個 config 記錄
14 個類別下所有工具的 `enabled: boolean`。流程：

1. 面板使用者勾選 → `Editor.Message.send('updateToolStatus', ...)`。
2. `main.ts:methods.updateToolStatus` 寫進 `tool-manager.json`。
3. `mcpServer.updateEnabledTools(toolManager.getEnabledTools())`。
4. `MCPServer.setupTools()` 重建 `toolsList`，被停用的工具不會再對外曝露。

T-P1-2 之後，`ToolManager` 透過 constructor 接收 `ToolRegistry`，從共用
registry 抽 metadata，**不再自己 new**。原作者版本的雙重實例化已移除。

## 六、ToolResponse 格式

```ts
export interface ToolResponse {
    success: boolean;
    data?: any;
    message?: string;
    error?: string;
    instruction?: string;       // 給 AI 的後續操作建議
    warning?: string;
    verificationData?: any;
    updatedProperties?: string[];
}
```

**T-P1-5 已落地**（commit `4c55c3d`）：`source/mcp-server-sdk.ts`
`buildToolResult()` 依 `ToolResponse.success` 分流：

- `success: true` → `content: [{type:'text', text: JSON.stringify(result)}]`
  + `structuredContent: result`（後者讓現代 MCP client 直接拿到結構化資料；
  前者保留向後相容，避免舊 client 看不到內容）。
- `success: false` → `content: [{type:'text', text: <error|message>}]` +
  `isError: true`，client 端可正確顯示為錯誤而非成功字串。

## 七、Schema 撰寫風格（P1 T-P1-4 後）

每個工具的 `inputSchema` 由 zod object 透過 `toInputSchema(...)` 產出。
**單一來源**：同一份 zod schema 既給 MCP `tools/list`，也用來在
`execute()` 內做執行期驗證。

範例：

```ts
// source/tools/node-tools.ts
import { z, toInputSchema, validateArgs } from '../lib/schema';

const nodeSchemas = {
    get_node_info: z.object({
        uuid: z.string().describe('Node UUID'),
    }),
    move_node: z.object({
        nodeUuid: z.string().describe('Node UUID to move'),
        newParentUuid: z.string().describe('New parent node UUID'),
        siblingIndex: z.number().default(-1).describe('Sibling index in new parent'),
    }),
    // ...
} as const;

const nodeToolMeta: Record<keyof typeof nodeSchemas, string> = {
    get_node_info: 'Get node information by UUID',
    move_node: 'Move node to new parent',
    // ...
};

export class NodeTools implements ToolExecutor {
    getTools(): ToolDefinition[] {
        return (Object.keys(nodeSchemas) as Array<keyof typeof nodeSchemas>).map(name => ({
            name,
            description: nodeToolMeta[name],
            inputSchema: toInputSchema(nodeSchemas[name]),
        }));
    }

    async execute(toolName: string, args: any): Promise<ToolResponse> {
        const schema = nodeSchemas[toolName as keyof typeof nodeSchemas];
        if (!schema) throw new Error(`Unknown tool: ${toolName}`);
        const validation = validateArgs(schema, args ?? {});
        if (!validation.ok) return validation.response;
        const a = validation.data as any;

        switch (toolName) {
            case 'get_node_info': return await this.getNodeInfo(a.uuid);
            case 'move_node': return await this.moveNode(a.nodeUuid, a.newParentUuid, a.siblingIndex);
            // ...
        }
    }
}
```

### Helper 行為（`source/lib/schema.ts`）

`toInputSchema(zodSchema)` 包裝 zod 4 的 `z.toJSONSchema`，後處理會：

- 移除頂層 `$schema` URL（與手寫風格對齊）
- 遞迴移除 `additionalProperties: false`（zod 4 預設加；手寫慣例不加）
- 把含 `default` 的欄位從 `required` 移除（手寫慣例：default 等於可選）

`validateArgs(zodSchema, args)` 用 `safeParse`：

- 成功：回 `{ ok: true, data: parsedArgs }`，defaults 已套用
- 失敗：回 `{ ok: false, response: { success: false, error: '<details>' } }`，
  錯誤訊息包含 zod 給的欄位路徑與原因

### 已知 zod 4 與手寫 JSON Schema 的差異對照

| 項目 | zod 4 預設 | 手寫慣例 | helper 處理 |
|---|---|---|---|
| `additionalProperties` | `false` | 不設（即預設 `true`） | 遞迴刪除 |
| `default` 欄位是否在 `required` | 在 | 不在 | 從 required 過濾掉 |
| `oneOf` vs `anyOf`（互斥型別 union） | `anyOf` | 多為 `oneOf` | 不轉換（語意等價） |
| 巢狀 object 內無 description 的軸 | 仍可能加 description（如有 `.describe`） | 大量沒有 description | 直接對應；要保真就在 zod 寫 `.optional()` 不加 `.describe()` |

## 八、新增工具的標準作法

1. 在對應的 `source/tools/<category>-tools.ts` 內：
   - 加一筆到 `<category>Schemas` map（zod object）
   - 加一筆到 `<category>ToolMeta` map（description string）
   - 在 `execute()` 的 switch 加 case，呼叫 private method
2. 私有 method 的型別簽章可從 zod schema 推回去（手動或 `z.infer`）
3. `npm run build` 通過後，用以下指令快速 sanity-check schema 輸出：
   ```bash
   node -e "const {Cls} = require('./dist/tools/<category>-tools.js');
   new Cls().getTools().forEach(t => console.log(t.name));"
   ```
