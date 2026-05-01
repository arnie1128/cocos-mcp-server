// Generate docs/tools.md from the live tool registry.
//
// Walks createToolRegistry() and renders every tool's name + description +
// input schema as markdown. Hand-written sections (intro / category blurbs)
// live in this file; the rest is fully derived from zod via toInputSchema, so
// adding/changing tools just needs a re-run of this script.
//
// Usage from repo root:
//   npm run build && node scripts/generate-tools-doc.js
//
// The output overwrites docs/tools.md.

const fs = require('fs');
const path = require('path');

const { createToolRegistry } = require(path.join(__dirname, '..', 'dist', 'tools', 'registry.js'));

const OUT_PATH = path.join(__dirname, '..', 'docs', 'tools.md');

// Hand-written context for each category. Keys must match the registry keys
// returned by createToolRegistry().
const CATEGORY_BLURBS = {
    scene: '場景檔案層級操作：開／關／儲存／新建／另存。`create_scene` 支援 `template` 參數可一次寫入 2D 或 3D 範本。',
    sceneAdvanced: '場景進階查詢與 scene-script 入口：依 asset uuid 反查節點、執行任意 scene-script 方法、批次節點查詢等。',
    sceneView: '場景視圖控制：gizmo 工具切換、座標系、視圖模式、參考圖等。會影響編輯器面板，不影響 runtime 行為。',
    node: '節點生命週期：建立、查詢、改名、變換、移動、複製、刪除。`create_node` 支援 `layer` 參數；parent 是 Canvas 後代時自動推 UI_2D。',
    component: '組件 CRUD、property 設定、事件綁定（cc.EventHandler）。`set_component_property` 對 reference 屬性會做 propertyType vs metadata 的 preflight 檢查；提供 `preserveContentSize` 旗標處理 Sprite 指派 spriteFrame 後 contentSize 被覆蓋的問題。',
    prefab: 'Prefab façade 工具集：建立、實例化、apply、link/unlink、get-data、restore。除了 `restore_prefab_node` 走 host `restore-prefab` channel，其他都透過 scene façade 介面（execute-scene-script）。',
    project: '資源管理 + 專案建構：asset CRUD、build / preview server、設定查詢。覆蓋大多數 asset-db 高頻操作。',
    debug: 'console log 與系統資訊：取得 / 清空 console、讀 project log 檔、編輯器資訊。',
    preferences: '編輯器偏好設定的讀寫。',
    server: 'MCP server 自身的狀態與環境資訊。',
    broadcast: '`Editor.Message` 廣播訊息監聽 / 發送。',
    referenceImage: '場景視圖中參考圖的管理（add / remove / list / 透明度等）。',
    assetAdvanced: 'asset-db 進階：meta 寫入、URL 生成、相依性查詢、批次匯入 / 刪除、未使用資源偵測等。',
    validation: '場景與資源完整性檢查工具，回報缺失或錯誤的 reference。',
};

const CATEGORY_TITLES = {
    scene: '場景操作',
    sceneAdvanced: '場景進階',
    sceneView: '場景視圖',
    node: '節點',
    component: '組件',
    prefab: '預製體',
    project: '專案／資源',
    debug: '除錯',
    preferences: '偏好設定',
    server: 'Server',
    broadcast: '廣播',
    referenceImage: '參考圖',
    assetAdvanced: '資源進階',
    validation: '驗證',
};

function fmtType(prop) {
    if (!prop) return '–';
    if (Array.isArray(prop.enum)) {
        return `enum: ${prop.enum.map(v => '`' + v + '`').join(' \\| ')}`;
    }
    if (Array.isArray(prop.anyOf)) {
        return prop.anyOf.map(fmtType).join(' \\| ');
    }
    if (prop.type === 'array') {
        const item = prop.items ? fmtType(prop.items) : 'any';
        return `array<${item}>`;
    }
    if (prop.type === 'object') {
        const keys = prop.properties ? Object.keys(prop.properties) : [];
        if (keys.length === 0) return 'object';
        return `object{${keys.join(', ')}}`;
    }
    if (prop.type) return prop.type;
    return 'any';
}

function escapeCell(s) {
    if (s === undefined || s === null) return '';
    return String(s)
        .replace(/\|/g, '\\|')
        .replace(/\r?\n/g, '<br>');
}

function fmtDefault(prop) {
    if (prop && Object.prototype.hasOwnProperty.call(prop, 'default')) {
        const v = prop.default;
        if (typeof v === 'string') return '`"' + v + '"`';
        return '`' + JSON.stringify(v) + '`';
    }
    return '';
}

function renderTool(category, tool) {
    const lines = [];
    lines.push(`### \`${category}_${tool.name}\``);
    lines.push('');
    if (tool.description) {
        lines.push(escapeCell(tool.description).replace(/<br>/g, '\n'));
        lines.push('');
    }

    const schema = tool.inputSchema || {};
    const props = schema.properties || {};
    const required = new Set(schema.required || []);
    const propNames = Object.keys(props);

    if (propNames.length === 0) {
        lines.push('**參數**：無');
        lines.push('');
        return lines.join('\n');
    }

    lines.push('| 參數 | 型別 | 必填 | 預設 | 說明 |');
    lines.push('|---|---|---|---|---|');
    for (const name of propNames) {
        const p = props[name] || {};
        const type = fmtType(p);
        const req = required.has(name) ? '✓' : '';
        const def = fmtDefault(p);
        const desc = escapeCell(p.description || '');
        lines.push(`| \`${name}\` | ${type} | ${req} | ${def} | ${desc} |`);
    }
    lines.push('');

    return lines.join('\n');
}

function buildCategoryOrder(registry) {
    const declared = Object.keys(CATEGORY_BLURBS);
    const seen = new Set();
    const out = [];
    for (const k of declared) {
        if (registry[k]) {
            out.push(k);
            seen.add(k);
        }
    }
    for (const k of Object.keys(registry)) {
        if (!seen.has(k)) out.push(k);
    }
    return out;
}

function main() {
    const registry = createToolRegistry();
    const categories = buildCategoryOrder(registry);

    let totalTools = 0;
    for (const c of categories) totalTools += registry[c].getTools().length;

    const out = [];
    out.push('# MCP 工具參考');
    out.push('');
    out.push('> ⚙️ **本檔由 `scripts/generate-tools-doc.js` 自動產生**，請勿手動編輯。');
    out.push('> 工具增減或 schema 變動後，跑 `npm run build && node scripts/generate-tools-doc.js`');
    out.push('> 重新生成。手寫的章節介紹（category 描述、總覽段）放在 generator 內。');
    out.push('');
    out.push('Cocos MCP Server 透過 [Model Context Protocol](https://modelcontextprotocol.io/) 對外暴露');
    out.push(`**${totalTools} 個工具**，分 **${categories.length}** 個 category。`);
    out.push('每個工具的 input schema 由 zod 在 `source/tools/<category>-tools.ts` 內定義，');
    out.push('經過 `lib/schema.ts:toInputSchema` 轉成 JSON Schema 後送出 `tools/list`，');
    out.push('Tool description 也直接來自 zod `.describe()` 文字。');
    out.push('');
    out.push('## 共用約定');
    out.push('');
    out.push('- **回應格式**：成功時 `{ success: true, data: {...}, message?: string }`；');
    out.push('  失敗時 `{ success: false, error: string, instruction?: string }`。MCP `tools/call`');
    out.push('  將以 `structuredContent` 帶回成功 payload，failure 走 `isError: true` 並把 error');
    out.push('  訊息塞進 `content[].text`。');
    out.push('- **REST 短路**：除了標準 MCP `/mcp` endpoint，server 也提供');
    out.push('  `POST /api/{category}/{tool}` 直接呼叫單一工具，方便 curl 測試。');
    out.push('- **Reference 屬性的 propertyType**：對 component reference（如 `cc.Canvas.cameraComponent`）');
    out.push('  必須用 `propertyType: "component"` 並提供裝載該 component 的 **node UUID**；');
    out.push('  server 會自動解析 component 的 scene `__id__`。傳錯會在 preflight 階段被擋下並');
    out.push('  回正確的範例。');
    out.push('');
    out.push('## 工具總覽');
    out.push('');
    out.push('| Category | 工具數 | 涵蓋 |');
    out.push('|---|---|---|');
    for (const c of categories) {
        const tools = registry[c].getTools();
        const blurb = CATEGORY_BLURBS[c] || '_（無描述）_';
        const summary = blurb.length > 80 ? blurb.slice(0, 78) + '…' : blurb;
        out.push(`| [\`${c}\`](#${c.toLowerCase()}) | ${tools.length} | ${escapeCell(summary)} |`);
    }
    out.push('');

    let idx = 0;
    for (const c of categories) {
        idx += 1;
        const tools = registry[c].getTools();
        const title = CATEGORY_TITLES[c] || c;
        out.push('---');
        out.push('');
        out.push(`## ${idx}. ${c}（${title}）`);
        out.push('');
        out.push(CATEGORY_BLURBS[c] || '_（無描述）_');
        out.push('');
        out.push(`本 category 共 **${tools.length}** 個工具。`);
        out.push('');
        for (const tool of tools) {
            out.push(renderTool(c, tool));
        }
    }

    out.push('---');
    out.push('');
    out.push('## 衍生連結');
    out.push('');
    out.push('- [`README.md`](../README.md) — 安裝、啟動、AI client 配置');
    out.push('- [`docs/HANDOFF.md`](HANDOFF.md) — 開發進度、最新修補紀錄');
    out.push('- [`CLAUDE.md`](../CLAUDE.md) — AI session 操作守則與 landmines');
    out.push('');

    fs.writeFileSync(OUT_PATH, out.join('\n'), 'utf-8');
    console.log(`wrote ${OUT_PATH} (${categories.length} categories, ${totalTools} tools)`);
}

main();
