# cocos/cocos-cli

- URL: https://github.com/cocos/cocos-cli
- Local clone: `D:/1_dev/cocos-mcp-references/cocos-cli/`
- 作者：Cocos 官方
- Protocol：MCP（`fastmcp`，包了 `@modelcontextprotocol/sdk`）

## 概述

**官方** Cocos CLI（v0.0.1-alpha.23），standalone Node CLI 進程。270+ stars。
跟我們**不同 deployment surface**：

- 我們 = in-editor extension（call 得到 `Editor.Message`）
- cocos-cli = standalone CLI（不能 call `Editor.Message`、不能 mutate
  live scene）

主能力是 build / create / import / wizard。MCP 暴露的 tool 圍繞 build
流程（`BuilderHook` 動態掃 `packages/platforms/*` 註冊）。Resources 是
**官方文件**（`cli://docs/readme` / `cocos://docs/api`）+ asset query
template `cocos://assets/{ccType}`。

## 與我們的關係

**互補不替代**。

| 用途 | 工具 |
|---|---|
| 「建專案、編譯 web-mobile、查 asset 列表」 | cocos-cli |
| 「開場景、改節點、設組件屬性、debug runtime、編 prefab」 | 我們 |

兩者完全沒重疊。如果 user 整套 AI workflow 需要「自動建專案 → 寫
gameplay → 編譯」，會同時開兩個 MCP server 接 client。

## 採用清單

### 1. Decorator-driven tool registration 模式（→ v2.4.0 step 5）

```typescript
class ProjectAPI {
    @tool('project.info')
    @description('Read project metadata')
    @returns(ProjectInfoSchema)
    getProjectInfo(
        @param(z.string().describe('Project path')) projectPath: string
    ): ProjectInfo {
        return readProjectJson(projectPath);
    }
}
```

裝飾器在 class load 時把 metadata 寫進 module-level
`Map<toolName, {target, meta}>`。

**特徵**：用 `reflect-metadata` polyfill，要 tsconfig 開
`experimentalDecorators` + `emitDecoratorMetadata`。

**移植策略**：**不直接抄**。改抄 cocos-code-mode `@utcpTool` 風格
（descriptor 直接捕獲、不需 reflect-metadata），更輕量。但 cocos-cli
這份還是值得讀，了解「reflect 路線」可能需要的 metadata API。

### 2. Gemini-compat schema patch（→ v2.6.0）

```typescript
// mcp.middleware.ts:218
this.server.server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = ... .map(([name, {meta}]) => {
        const fullInputZodSchema = z.object(inputSchemaFields);
        const geminiInputSchema = this.zodToJSONSchema7(fullInputZodSchema);
        // ↑ 用 zod-to-json-schema package、強制 inline、不產 $ref
        return { name, description, inputSchema: geminiInputSchema };
    });
});
```

**問題背景**：zod 預設轉 JSON Schema 用 `$ref` 引用 reused subschema。
Gemini parser 不接受 `$ref`，看到直接掛掉。Claude / OpenAI 接受。

我們有 `vec3Schema` / `prefabPositionSchema` / `transformPositionSchema`
等 reused subschema，跑 Gemini 都會炸。

**移植策略**：v2.6.0 接 Gemini client 時做。0.5-1 天。

### 3. Capability declaration 對照

```typescript
{
    capabilities: {
        resources: {
            subscribe: true,
            listChanged: true,
            templates: true     // ← 我們沒寫這個 flag
        },
        tools: {},
        logging: {},            // ← 我們沒開 logging
    }
}
```

**評估**：

- `resources.templates: true` —— 我們有用 ResourceTemplate
  （`cocos://prefabs{?folder}` / `cocos://assets{?type,folder}`），但 capabilities
  沒顯式宣告。**v2.4.0 補一行**
- `logging` capability —— MCP server 主動 push 結構化 log 給 client。
  價值低（我們有 `temp/logs/project.log` + `get_project_logs` tool 即可），
  **不收**

### 4. URI scheme 設計參考

`cli://docs/*` + `cocos://docs/api` + `cocos://assets/{ccType}`：

- `cli://` 是專案內部 URI（我們不用）
- `cocos://docs/*` 用 `text/markdown` —— 我們 v2.3.0 T-V23-3 對齊
- `cocos://assets/{ccType}` template —— 我們 `cocos://assets{?type,folder}`
  類似但更靈活（query string 支援 type + folder 雙過濾）

URI 命名 prefix 採用 `cocos://`（兩個 prior art 都用）。

## 不採納

| 內容 | 理由 |
|---|---|
| 整套 hook 系統 | 我們不做 build pipeline，沒對應需求 |
| `cli://docs/*` 內部文件 system | 我們的 docs 走 `cocos://docs/*` 同層即可 |
| `fastmcp` SDK wrapper | 我們直接用 `@modelcontextprotocol/sdk`，多一層 wrapper 沒收益 |

## Local clone 操作

```bash
git clone --depth 1 https://github.com/cocos/cocos-cli.git \
  D:/1_dev/cocos-mcp-references/cocos-cli

# 看 decorator 實作
cat D:/1_dev/cocos-mcp-references/cocos-cli/src/api/decorator/decorator.ts

# 看 Gemini patch
sed -n '200,240p' D:/1_dev/cocos-mcp-references/cocos-cli/src/mcp/mcp.middleware.ts
```
