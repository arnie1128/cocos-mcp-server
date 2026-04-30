# 工具系統

> 工具如何宣告、註冊、被外部呼叫的完整流程。

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

## 三、註冊流程

```
┌─────────────────────────────────────────────────────────────┐
│ MCPServer.initializeTools()  (mcp-server.ts:33-55)          │
│   • this.tools.scene = new SceneTools()                     │
│   • this.tools.node  = new NodeTools()                      │
│   • ... (14 個類別)                                          │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ MCPServer.setupTools()  (mcp-server.ts:91)                  │
│   for (cat, set) in this.tools:                             │
│     for (t in set.getTools()):                              │
│       toolsList.push({                                      │
│         name: `${cat}_${t.name}`,                           │
│         description, inputSchema                            │
│       })                                                    │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
                    對外可見的 toolsList
```

## 四、分派流程

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
                  • switch on toolName → 呼叫對應 private method
                  • 回傳 ToolResponse
```

## 五、工具啟用/停用機制

`source/tools/tool-manager.ts` 維護「configurations」清單，每個 config 記錄
14 個類別下所有工具的 `enabled: boolean`。流程：

1. 面板使用者勾選 → `Editor.Message.send('updateToolStatus', ...)`。
2. `main.ts:methods.updateToolStatus` 寫進 `tool-manager.json`。
3. `mcpServer.updateEnabledTools(toolManager.getEnabledTools())`。
4. `MCPServer.setupTools()` 重建 `toolsList`，被停用的工具不會再對外曝露。

**注意**：`ToolManager` 自己也 `new` 了一次所有工具類別（line 101-116）來
取 metadata。這是已知重複，已列入 `roadmap/02-architecture.md` 的 P1。

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

`MCPServer.handleMessage` 會把整個 `ToolResponse` 序列化成 JSON 字串包進
MCP `content[0].text`。Client 看到的是 string，不是結構化物件——這是
偷懶的做法，實際應該用 `content[0].type='resource'` 或多 `content` 段。

## 七、Schema 撰寫風格

每個工具的 `inputSchema` 是手寫 JSON Schema 物件，**沒有**自動 type
generation 也**沒有** runtime 驗證。換言之：

- 改 TypeScript 介面不會自動同步 Schema。
- Client 傳入錯誤型別只會在執行時 throw。
- `propertyType` 列舉常常與實際處理邏輯漂移（見 `component-tools.ts:101-107`
  的長 enum）。

改善方向（roadmap P1）：引入 zod + `zod-to-json-schema`，單一來源產生
TS 型別與 JSON Schema。
