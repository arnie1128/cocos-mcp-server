"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResourceRegistry = void 0;
exports.createResourceRegistry = createResourceRegistry;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const url = __importStar(require("url"));
const MIME_JSON = 'application/json';
const MIME_MARKDOWN = 'text/markdown';
// Resolve the extension root so docs resources can read from disk regardless
// of where cocos installs the plugin. dist/resources/registry.js sits two
// levels deep, so `../..` is the extension root.
function getExtensionRoot() {
    return path.resolve(__dirname, '..', '..');
}
const STATIC_RESOURCES = [
    {
        uri: 'cocos://scene/current',
        name: 'Current scene summary',
        description: 'Active scene root metadata: name, uuid, type, active, nodeCount. Backed by scene_get_current_scene.',
        mimeType: MIME_JSON,
    },
    {
        uri: 'cocos://scene/hierarchy',
        name: 'Scene hierarchy',
        description: 'Full node hierarchy of the active scene. Component summaries omitted by default; use the tool form for the includeComponents flag. Backed by scene_get_scene_hierarchy.',
        mimeType: MIME_JSON,
    },
    {
        uri: 'cocos://scene/list',
        name: 'Project scene list',
        description: 'All .scene assets under db://assets. Backed by scene_get_scene_list.',
        mimeType: MIME_JSON,
    },
    {
        uri: 'cocos://prefabs',
        name: 'Project prefabs',
        description: 'All .prefab assets under db://assets. Use the cocos://prefabs{?folder} template to scope to a sub-folder. Backed by prefab_get_prefab_list.',
        mimeType: MIME_JSON,
    },
    {
        uri: 'cocos://project/info',
        name: 'Project info',
        description: 'Project name, path, uuid, version and Cocos version. Backed by project_get_project_info.',
        mimeType: MIME_JSON,
    },
    {
        uri: 'cocos://assets',
        name: 'Project assets',
        description: 'Asset list under db://assets, all types. Use the cocos://assets{?type,folder} template to filter by type or sub-folder. Backed by project_get_assets.',
        mimeType: MIME_JSON,
    },
    {
        uri: 'cocos://docs/landmines',
        name: 'Landmines reference',
        description: 'Project landmines list extracted from CLAUDE.md §Landmines. Read this when a tool call surprises you with editor-state behaviour — most surprises are documented as landmines.',
        mimeType: MIME_MARKDOWN,
    },
    {
        uri: 'cocos://docs/tools',
        name: 'Auto-generated tool reference',
        description: 'docs/tools.md generated from the live tool registry. Authoritative listing of every tool, its description, and its inputSchema.',
        mimeType: MIME_MARKDOWN,
    },
    {
        uri: 'cocos://docs/handoff',
        name: 'Session handoff',
        description: 'docs/HANDOFF.md — current backlog, version plan pointers, environment check commands, rollback anchors. Read this for project orientation.',
        mimeType: MIME_MARKDOWN,
    },
];
const TEMPLATE_RESOURCES = [
    {
        uriTemplate: 'cocos://prefabs{?folder}',
        name: 'Prefabs in folder',
        description: 'Prefab list scoped to a db:// folder. Example: cocos://prefabs?folder=db://assets/ui',
        mimeType: MIME_JSON,
    },
    {
        uriTemplate: 'cocos://assets{?type,folder}',
        name: 'Assets by type and folder',
        description: 'Asset list filtered by type (all|scene|prefab|script|texture|material|mesh|audio|animation) and folder. Example: cocos://assets?type=prefab&folder=db://assets/ui',
        mimeType: MIME_JSON,
    },
];
const HANDLERS = {
    'cocos://scene/current': {
        mimeType: MIME_JSON,
        fetch: async (r) => JSON.stringify(await callTool(r, 'scene', 'get_current_scene', {})),
    },
    'cocos://scene/hierarchy': {
        mimeType: MIME_JSON,
        fetch: async (r) => JSON.stringify(await callTool(r, 'scene', 'get_scene_hierarchy', {})),
    },
    'cocos://scene/list': {
        mimeType: MIME_JSON,
        fetch: async (r) => JSON.stringify(await callTool(r, 'scene', 'get_scene_list', {})),
    },
    'cocos://prefabs': {
        mimeType: MIME_JSON,
        fetch: async (r, q) => JSON.stringify(await callTool(r, 'prefab', 'get_prefab_list', q.folder ? { folder: q.folder } : {})),
    },
    'cocos://project/info': {
        mimeType: MIME_JSON,
        fetch: async (r) => JSON.stringify(await callTool(r, 'project', 'get_project_info', {})),
    },
    'cocos://assets': {
        mimeType: MIME_JSON,
        fetch: async (r, q) => JSON.stringify(await callTool(r, 'project', 'get_assets', Object.assign(Object.assign({}, (q.type ? { type: q.type } : {})), (q.folder ? { folder: q.folder } : {})))),
    },
    'cocos://docs/landmines': {
        mimeType: MIME_MARKDOWN,
        // Extract just the §Landmines section from CLAUDE.md so AI doesn't get
        // unrelated convention chatter. If the section header changes upstream,
        // fall back to whole file with a note.
        fetch: async () => readDocsSection(path.join(getExtensionRoot(), 'CLAUDE.md'), '## Landmines'),
    },
    'cocos://docs/tools': {
        mimeType: MIME_MARKDOWN,
        fetch: async () => readDocsFile(path.join(getExtensionRoot(), 'docs', 'tools.md')),
    },
    'cocos://docs/handoff': {
        mimeType: MIME_MARKDOWN,
        fetch: async () => readDocsFile(path.join(getExtensionRoot(), 'docs', 'HANDOFF.md')),
    },
};
async function callTool(registry, category, tool, args) {
    var _a, _b;
    const executor = registry[category];
    if (!executor) {
        throw new Error(`Resource backend missing: registry has no '${category}' category`);
    }
    const response = await executor.execute(tool, args);
    if (response && response.success === false) {
        const msg = (_b = (_a = response.error) !== null && _a !== void 0 ? _a : response.message) !== null && _b !== void 0 ? _b : `${category}_${tool} failed`;
        throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
    return response;
}
function readDocsFile(absPath) {
    try {
        return fs.readFileSync(absPath, 'utf8');
    }
    catch (e) {
        if ((e === null || e === void 0 ? void 0 : e.code) === 'ENOENT') {
            return `# Resource unavailable\n\nFile not found at install path: \`${absPath}\`\n\nThe docs resource expected this file at the extension root. If the\nextension was installed without source files, fetch the latest from\nhttps://github.com/arnie1128/cocos-mcp-server.`;
        }
        throw e;
    }
}
function readDocsSection(absPath, sectionHeader) {
    let raw;
    try {
        raw = fs.readFileSync(absPath, 'utf8');
    }
    catch (e) {
        if ((e === null || e === void 0 ? void 0 : e.code) === 'ENOENT') {
            return `# Resource unavailable\n\nFile not found at install path: \`${absPath}\`.`;
        }
        throw e;
    }
    // Strip optional UTF-8 BOM that some editors add to markdown files.
    const content = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
    // v2.3.1 review fix: split on CRLF or LF so Windows-saved markdown
    // doesn't leave \r residue at end of every line and confuse the section
    // header equality check below.
    const lines = content.split(/\r?\n/);
    // Match exact header or "## Header (...)" form. Section headers in CLAUDE.md
    // sometimes carry a parenthetical hint after the title, e.g.
    // "## Landmines (read before editing)".
    const startIdx = lines.findIndex(l => {
        const t = l.trim();
        return t === sectionHeader || t.startsWith(sectionHeader + ' ') || t.startsWith(sectionHeader + '(');
    });
    if (startIdx === -1) {
        return `# Section not found\n\nSection header \`${sectionHeader}\` not found in ${path.basename(absPath)}.\nReturning whole file as fallback.\n\n---\n\n${content}`;
    }
    // Find the next top-level (## ) heading after the section header to bound it.
    // sectionHeader is like "## Landmines"; the next sibling heading starts with "## " (2 hashes, space).
    let endIdx = lines.length;
    for (let i = startIdx + 1; i < lines.length; i++) {
        if (/^##\s/.test(lines[i])) {
            endIdx = i;
            break;
        }
    }
    return lines.slice(startIdx, endIdx).join('\n');
}
class ResourceRegistry {
    constructor(registry) {
        this.registry = registry;
    }
    list() {
        return STATIC_RESOURCES.slice();
    }
    listTemplates() {
        return TEMPLATE_RESOURCES.slice();
    }
    async read(uri) {
        const { base, query } = parseUri(uri);
        const handler = HANDLERS[base];
        if (!handler) {
            throw new Error(`Unknown resource URI: ${uri}`);
        }
        const text = await handler.fetch(this.registry, query);
        return {
            uri,
            mimeType: handler.mimeType,
            text,
        };
    }
}
exports.ResourceRegistry = ResourceRegistry;
// Strip query string + fragment, return base URI for handler lookup plus
// the parsed query params for parameterized handlers.
function parseUri(uri) {
    const parsed = url.parse(uri, true);
    if (!parsed.protocol || !parsed.host) {
        return { base: uri, query: {} };
    }
    const base = `${parsed.protocol}//${parsed.host}${parsed.pathname || ''}`;
    const query = {};
    for (const [k, v] of Object.entries(parsed.query)) {
        if (typeof v === 'string')
            query[k] = v;
        else if (Array.isArray(v) && v.length > 0)
            query[k] = v[0];
    }
    return { base, query };
}
function createResourceRegistry(toolRegistry) {
    return new ResourceRegistry(toolRegistry);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVnaXN0cnkuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvcmVzb3VyY2VzL3JlZ2lzdHJ5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQW1SQSx3REFFQztBQXJSRCx1Q0FBeUI7QUFDekIsMkNBQTZCO0FBQzdCLHlDQUEyQjtBQXVDM0IsTUFBTSxTQUFTLEdBQUcsa0JBQWtCLENBQUM7QUFDckMsTUFBTSxhQUFhLEdBQUcsZUFBZSxDQUFDO0FBRXRDLDZFQUE2RTtBQUM3RSwwRUFBMEU7QUFDMUUsaURBQWlEO0FBQ2pELFNBQVMsZ0JBQWdCO0lBQ3JCLE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQyxTQUFTLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO0FBQy9DLENBQUM7QUFFRCxNQUFNLGdCQUFnQixHQUF5QjtJQUMzQztRQUNJLEdBQUcsRUFBRSx1QkFBdUI7UUFDNUIsSUFBSSxFQUFFLHVCQUF1QjtRQUM3QixXQUFXLEVBQUUscUdBQXFHO1FBQ2xILFFBQVEsRUFBRSxTQUFTO0tBQ3RCO0lBQ0Q7UUFDSSxHQUFHLEVBQUUseUJBQXlCO1FBQzlCLElBQUksRUFBRSxpQkFBaUI7UUFDdkIsV0FBVyxFQUFFLHlLQUF5SztRQUN0TCxRQUFRLEVBQUUsU0FBUztLQUN0QjtJQUNEO1FBQ0ksR0FBRyxFQUFFLG9CQUFvQjtRQUN6QixJQUFJLEVBQUUsb0JBQW9CO1FBQzFCLFdBQVcsRUFBRSxzRUFBc0U7UUFDbkYsUUFBUSxFQUFFLFNBQVM7S0FDdEI7SUFDRDtRQUNJLEdBQUcsRUFBRSxpQkFBaUI7UUFDdEIsSUFBSSxFQUFFLGlCQUFpQjtRQUN2QixXQUFXLEVBQUUsNklBQTZJO1FBQzFKLFFBQVEsRUFBRSxTQUFTO0tBQ3RCO0lBQ0Q7UUFDSSxHQUFHLEVBQUUsc0JBQXNCO1FBQzNCLElBQUksRUFBRSxjQUFjO1FBQ3BCLFdBQVcsRUFBRSwwRkFB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R0FBVztJQUN6QixNQUFNLE1BQU0sR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsQ0FBQztJQUNwQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNuQyxPQUFPLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsRUFBRSxFQUFFLENBQUM7SUFDcEMsQ0FBQztJQUNELE1BQU0sSUFBSSxHQUFHLEdBQUcsTUFBTSxDQUFDLFFBQVEsS0FBSyxNQUFNLENBQUMsSUFBSSxHQUFHLE1BQU0sQ0FBQyxRQUFRLElBQUksRUFBRSxFQUFFLENBQUM7SUFDMUUsTUFBTSxLQUFLLEdBQTJCLEVBQUUsQ0FBQztJQUN6QyxLQUFLLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztRQUNoRCxJQUFJLE9BQU8sQ0FBQyxLQUFLLFFBQVE7WUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO2FBQ25DLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxHQUFHLENBQUM7WUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQy9ELENBQUM7SUFDRCxPQUFPLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxDQUFDO0FBQzNCLENBQUM7QUFFRCxTQUFnQixzQkFBc0IsQ0FBQyxZQUEwQjtJQUM3RCxPQUFPLElBQUksZ0JBQWdCLENBQUMsWUFBWSxDQUFDLENBQUM7QUFDOUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgKiBhcyB1cmwgZnJvbSAndXJsJztcbmltcG9ydCB7IFRvb2xSZWdpc3RyeSB9IGZyb20gJy4uL3Rvb2xzL3JlZ2lzdHJ5JztcbmltcG9ydCB7IFRvb2xSZXNwb25zZSB9IGZyb20gJy4uL3R5cGVzJztcblxuLyoqXG4gKiBNQ1AgUmVzb3VyY2VzIGZvciBjb2Nvcy1tY3Atc2VydmVyLlxuICpcbiAqIFN1cmZhY2Ug4oCUIHNlZSBkb2NzL3Jlc2VhcmNoL3QtcDMtMS1wcmlvci1hcnQubWQgYW5kXG4gKiBkb2NzL3JvYWRtYXAvMDYtdmVyc2lvbi1wbGFuLXYyMy12MjcubWQgZm9yIGRlc2lnbiByYXRpb25hbGUuXG4gKlxuICogLSBUb29sLWJhY2tlZCByZXNvdXJjZXMgcmV1c2UgdGhlIGV4aXN0aW5nIHJlYWQtb25seSBUb29sRXhlY3V0b3IgY2FsbCBzb1xuICogICByZXNvdXJjZSByZWFkIGFuZCB0b29scy9jYWxsIHJldHVybiBieXRlLWlkZW50aWNhbCBkYXRhLlxuICogLSBEb2NzIHJlc291cmNlcyByZWFkIG1hcmtkb3duIGZpbGVzIGF0IHJlcXVlc3QgdGltZSBzbyB1c2VyIGVkaXRzIHRvXG4gKiAgIENMQVVERS5tZCAvIGRvY3MvKi5tZCBhcmUgcmVmbGVjdGVkIGltbWVkaWF0ZWx5LCBubyBleHRlbnNpb24gcmVsb2FkLlxuICpcbiAqIFVSSSBwcmVmaXggaXMgYGNvY29zOi8vYCB0byBhbGlnbiB3aXRoIGNvY29zLWNsaSAob2ZmaWNpYWwpIGFuZFxuICogRnVucGxheUFJIChjbG9zZXN0IHNpYmxpbmcgZW1iZWRkZWQgZXh0ZW5zaW9uKS5cbiAqL1xuXG5leHBvcnQgaW50ZXJmYWNlIFJlc291cmNlRGVzY3JpcHRvciB7XG4gICAgdXJpOiBzdHJpbmc7XG4gICAgbmFtZTogc3RyaW5nO1xuICAgIGRlc2NyaXB0aW9uOiBzdHJpbmc7XG4gICAgbWltZVR5cGU6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBSZXNvdXJjZVRlbXBsYXRlRGVzY3JpcHRvciB7XG4gICAgdXJpVGVtcGxhdGU6IHN0cmluZztcbiAgICBuYW1lOiBzdHJpbmc7XG4gICAgZGVzY3JpcHRpb246IHN0cmluZztcbiAgICBtaW1lVHlwZTogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJlc291cmNlQ29udGVudCB7XG4gICAgdXJpOiBzdHJpbmc7XG4gICAgbWltZVR5cGU6IHN0cmluZztcbiAgICB0ZXh0OiBzdHJpbmc7XG59XG5cbmNvbnN0IE1JTUVfSlNPTiA9ICdhcHBsaWNhdGlvbi9qc29uJztcbmNvbnN0IE1JTUVfTUFSS0RPV04gPSAndGV4dC9tYXJrZG93bic7XG5cbi8vIFJlc29sdmUgdGhlIGV4dGVuc2lvbiByb290IHNvIGRvY3MgcmVzb3VyY2VzIGNhbiByZWFkIGZyb20gZGlzayByZWdhcmRsZXNzXG4vLyBvZiB3aGVyZSBjb2NvcyBpbnN0YWxscyB0aGUgcGx1Z2luLiBkaXN0L3Jlc291cmNlcy9yZWdpc3RyeS5qcyBzaXRzIHR3b1xuLy8gbGV2ZWxzIGRlZXAsIHNvIGAuLi8uLmAgaXMgdGhlIGV4dGVuc2lvbiByb290LlxuZnVuY3Rpb24gZ2V0RXh0ZW5zaW9uUm9vdCgpOiBzdHJpbmcge1xuICAgIHJldHVybiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCAnLi4nLCAnLi4nKTtcbn1cblxuY29uc3QgU1RBVElDX1JFU09VUkNFUzogUmVzb3VyY2VEZXNjcmlwdG9yW10gPSBbXG4gICAge1xuICAgICAgICB1cmk6ICdjb2NvczovL3NjZW5lL2N1cnJlbnQnLFxuICAgICAgICBuYW1lOiAnQ3VycmVudCBzY2VuZSBzdW1tYXJ5JyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdBY3RpdmUgc2NlbmUgcm9vdCBtZXRhZGF0YTogbmFtZSwgdXVpZCwgdHlwZSwgYWN0aXZlLCBub2RlQ291bnQuIEJhY2tlZCBieSBzY2VuZV9nZXRfY3VycmVudF9zY2VuZS4nLFxuICAgICAgICBtaW1lVHlwZTogTUlNRV9KU09OLFxuICAgIH0sXG4gICAge1xuICAgICAgICB1cmk6ICdjb2NvczovL3NjZW5lL2hpZXJhcmNoeScsXG4gICAgICAgIG5hbWU6ICdTY2VuZSBoaWVyYXJjaHknLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ0Z1bGwgbm9kZSBoaWVyYXJjaHkgb2YgdGhlIGFjdGl2ZSBzY2VuZS4gQ29tcG9uZW50IHN1bW1hcmllcyBvbWl0dGVkIGJ5IGRlZmF1bHQ7IHVzZSB0aGUgdG9vbCBmb3JtIGZvciB0aGUgaW5jbHVkZUNvbXBvbmVudHMgZmxhZy4gQmFja2VkIGJ5IHNjZW5lX2dldF9zY2VuZV9oaWVyYXJjaHkuJyxcbiAgICAgICAgbWltZVR5cGU6IE1JTUVfSlNPTixcbiAgICB9LFxuICAgIHtcbiAgICAgICAgdXJpOiAnY29jb3M6Ly9zY2VuZS9saXN0JyxcbiAgICAgICAgbmFtZTogJ1Byb2plY3Qgc2NlbmUgbGlzdCcsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnQWxsIC5zY2VuZSBhc3NldHMgdW5kZXIgZGI6Ly9hc3NldHMuIEJhY2tlZCBieSBzY2VuZV9nZXRfc2NlbmVfbGlzdC4nLFxuICAgICAgICBtaW1lVHlwZTogTUlNRV9KU09OLFxuICAgIH0sXG4gICAge1xuICAgICAgICB1cmk6ICdjb2NvczovL3ByZWZhYnMnLFxuICAgICAgICBuYW1lOiAnUHJvamVjdCBwcmVmYWJzJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdBbGwgLnByZWZhYiBhc3NldHMgdW5kZXIgZGI6Ly9hc3NldHMuIFVzZSB0aGUgY29jb3M6Ly9wcmVmYWJzez9mb2xkZXJ9IHRlbXBsYXRlIHRvIHNjb3BlIHRvIGEgc3ViLWZvbGRlci4gQmFja2VkIGJ5IHByZWZhYl9nZXRfcHJlZmFiX2xpc3QuJyxcbiAgICAgICAgbWltZVR5cGU6IE1JTUVfSlNPTixcbiAgICB9LFxuICAgIHtcbiAgICAgICAgdXJpOiAnY29jb3M6Ly9wcm9qZWN0L2luZm8nLFxuICAgICAgICBuYW1lOiAnUHJvamVjdCBpbmZvJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdQcm9qZWN0IG5hbWUsIHBhdGgsIHV1aWQsIHZlcnNpb24gYW5kIENvY29zIHZlcnNpb24uIEJhY2tlZCBieSBwcm9qZWN0X2dldF9wcm9qZWN0X2luZm8uJyxcbiAgICAgICAgbWltZVR5cGU6IE1JTUVfSlNPTixcbiAgICB9LFxuICAgIHtcbiAgICAgICAgdXJpOiAnY29jb3M6Ly9hc3NldHMnLFxuICAgICAgICBuYW1lOiAnUHJvamVjdCBhc3NldHMnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ0Fzc2V0IGxpc3QgdW5kZXIgZGI6Ly9hc3NldHMsIGFsbCB0eXBlcy4gVXNlIHRoZSBjb2NvczovL2Fzc2V0c3s/dHlwZSxmb2xkZXJ9IHRlbXBsYXRlIHRvIGZpbHRlciBieSB0eXBlIG9yIHN1Yi1mb2xkZXIuIEJhY2tlZCBieSBwcm9qZWN0X2dldF9hc3NldHMuJyxcbiAgICAgICAgbWltZVR5cGU6IE1JTUVfSlNPTixcbiAgICB9LFxuICAgIHtcbiAgICAgICAgdXJpOiAnY29jb3M6Ly9kb2NzL2xhbmRtaW5lcycsXG4gICAgICAgIG5hbWU6ICdMYW5kbWluZXMgcmVmZXJlbmNlJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdQcm9qZWN0IGxhbmRtaW5lcyBsaXN0IGV4dHJhY3RlZCBmcm9tIENMQVVERS5tZCDCp0xhbmRtaW5lcy4gUmVhZCB0aGlzIHdoZW4gYSB0b29sIGNhbGwgc3VycHJpc2VzIHlvdSB3aXRoIGVkaXRvci1zdGF0ZSBiZWhhdmlvdXIg4oCUIG1vc3Qgc3VycHJpc2VzIGFyZSBkb2N1bWVudGVkIGFzIGxhbmRtaW5lcy4nLFxuICAgICAgICBtaW1lVHlwZTogTUlNRV9NQVJLRE9XTixcbiAgICB9LFxuICAgIHtcbiAgICAgICAgdXJpOiAnY29jb3M6Ly9kb2NzL3Rvb2xzJyxcbiAgICAgICAgbmFtZTogJ0F1dG8tZ2VuZXJhdGVkIHRvb2wgcmVmZXJlbmNlJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdkb2NzL3Rvb2xzLm1kIGdlbmVyYXRlZCBmcm9tIHRoZSBsaXZlIHRvb2wgcmVnaXN0cnkuIEF1dGhvcml0YXRpdmUgbGlzdGluZyBvZiBldmVyeSB0b29sLCBpdHMgZGVzY3JpcHRpb24sIGFuZCBpdHMgaW5wdXRTY2hlbWEuJyxcbiAgICAgICAgbWltZVR5cGU6IE1JTUVfTUFSS0RPV04sXG4gICAgfSxcbiAgICB7XG4gICAgICAgIHVyaTogJ2NvY29zOi8vZG9jcy9oYW5kb2ZmJyxcbiAgICAgICAgbmFtZTogJ1Nlc3Npb24gaGFuZG9mZicsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnZG9jcy9IQU5ET0ZGLm1kIOKAlCBjdXJyZW50IGJhY2tsb2csIHZlcnNpb24gcGxhbiBwb2ludGVycywgZW52aXJvbm1lbnQgY2hlY2sgY29tbWFuZHMsIHJvbGxiYWNrIGFuY2hvcnMuIFJlYWQgdGhpcyBmb3IgcHJvamVjdCBvcmllbnRhdGlvbi4nLFxuICAgICAgICBtaW1lVHlwZTogTUlNRV9NQVJLRE9XTixcbiAgICB9LFxuXTtcblxuY29uc3QgVEVNUExBVEVfUkVTT1VSQ0VTOiBSZXNvdXJjZVRlbXBsYXRlRGVzY3JpcHRvcltdID0gW1xuICAgIHtcbiAgICAgICAgdXJpVGVtcGxhdGU6ICdjb2NvczovL3ByZWZhYnN7P2ZvbGRlcn0nLFxuICAgICAgICBuYW1lOiAnUHJlZmFicyBpbiBmb2xkZXInLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1ByZWZhYiBsaXN0IHNjb3BlZCB0byBhIGRiOi8vIGZvbGRlci4gRXhhbXBsZTogY29jb3M6Ly9wcmVmYWJzP2ZvbGRlcj1kYjovL2Fzc2V0cy91aScsXG4gICAgICAgIG1pbWVUeXBlOiBNSU1FX0pTT04sXG4gICAgfSxcbiAgICB7XG4gICAgICAgIHVyaVRlbXBsYXRlOiAnY29jb3M6Ly9hc3NldHN7P3R5cGUsZm9sZGVyfScsXG4gICAgICAgIG5hbWU6ICdBc3NldHMgYnkgdHlwZSBhbmQgZm9sZGVyJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdBc3NldCBsaXN0IGZpbHRlcmVkIGJ5IHR5cGUgKGFsbHxzY2VuZXxwcmVmYWJ8c2NyaXB0fHRleHR1cmV8bWF0ZXJpYWx8bWVzaHxhdWRpb3xhbmltYXRpb24pIGFuZCBmb2xkZXIuIEV4YW1wbGU6IGNvY29zOi8vYXNzZXRzP3R5cGU9cHJlZmFiJmZvbGRlcj1kYjovL2Fzc2V0cy91aScsXG4gICAgICAgIG1pbWVUeXBlOiBNSU1FX0pTT04sXG4gICAgfSxcbl07XG5cbmludGVyZmFjZSBSZXNvdXJjZUhhbmRsZXIge1xuICAgIG1pbWVUeXBlOiBzdHJpbmc7XG4gICAgLy8gUmV0dXJucyB0aGUgcmF3IHRleHQgYm9keSBmb3IgdGhlIHJlc291cmNlLiBDYWxsZXIgd3JhcHMgaW50byBNQ1Agc2hhcGUuXG4gICAgZmV0Y2g6IChyZWdpc3RyeTogVG9vbFJlZ2lzdHJ5LCBxdWVyeTogUmVjb3JkPHN0cmluZywgc3RyaW5nPikgPT4gUHJvbWlzZTxzdHJpbmc+O1xufVxuXG5jb25zdCBIQU5ETEVSUzogUmVjb3JkPHN0cmluZywgUmVzb3VyY2VIYW5kbGVyPiA9IHtcbiAgICAnY29jb3M6Ly9zY2VuZS9jdXJyZW50Jzoge1xuICAgICAgICBtaW1lVHlwZTogTUlNRV9KU09OLFxuICAgICAgICBmZXRjaDogYXN5bmMgKHIpID0+IEpTT04uc3RyaW5naWZ5KGF3YWl0IGNhbGxUb29sKHIsICdzY2VuZScsICdnZXRfY3VycmVudF9zY2VuZScsIHt9KSksXG4gICAgfSxcbiAgICAnY29jb3M6Ly9zY2VuZS9oaWVyYXJjaHknOiB7XG4gICAgICAgIG1pbWVUeXBlOiBNSU1FX0pTT04sXG4gICAgICAgIGZldGNoOiBhc3luYyAocikgPT4gSlNPTi5zdHJpbmdpZnkoYXdhaXQgY2FsbFRvb2wociwgJ3NjZW5lJywgJ2dldF9zY2VuZV9oaWVyYXJjaHknLCB7fSkpLFxuICAgIH0sXG4gICAgJ2NvY29zOi8vc2NlbmUvbGlzdCc6IHtcbiAgICAgICAgbWltZVR5cGU6IE1JTUVfSlNPTixcbiAgICAgICAgZmV0Y2g6IGFzeW5jIChyKSA9PiBKU09OLnN0cmluZ2lmeShhd2FpdCBjYWxsVG9vbChyLCAnc2NlbmUnLCAnZ2V0X3NjZW5lX2xpc3QnLCB7fSkpLFxuICAgIH0sXG4gICAgJ2NvY29zOi8vcHJlZmFicyc6IHtcbiAgICAgICAgbWltZVR5cGU6IE1JTUVfSlNPTixcbiAgICAgICAgZmV0Y2g6IGFzeW5jIChyLCBxKSA9PiBKU09OLnN0cmluZ2lmeShhd2FpdCBjYWxsVG9vbChyLCAncHJlZmFiJywgJ2dldF9wcmVmYWJfbGlzdCcsIHEuZm9sZGVyID8geyBmb2xkZXI6IHEuZm9sZGVyIH0gOiB7fSkpLFxuICAgIH0sXG4gICAgJ2NvY29zOi8vcHJvamVjdC9pbmZvJzoge1xuICAgICAgICBtaW1lVHlwZTogTUlNRV9KU09OLFxuICAgICAgICBmZXRjaDogYXN5bmMgKHIpID0+IEpTT04uc3RyaW5naWZ5KGF3YWl0IGNhbGxUb29sKHIsICdwcm9qZWN0JywgJ2dldF9wcm9qZWN0X2luZm8nLCB7fSkpLFxuICAgIH0sXG4gICAgJ2NvY29zOi8vYXNzZXRzJzoge1xuICAgICAgICBtaW1lVHlwZTogTUlNRV9KU09OLFxuICAgICAgICBmZXRjaDogYXN5bmMgKHIsIHEpID0+IEpTT04uc3RyaW5naWZ5KGF3YWl0IGNhbGxUb29sKHIsICdwcm9qZWN0JywgJ2dldF9hc3NldHMnLCB7XG4gICAgICAgICAgICAuLi4ocS50eXBlID8geyB0eXBlOiBxLnR5cGUgfSA6IHt9KSxcbiAgICAgICAgICAgIC4uLihxLmZvbGRlciA/IHsgZm9sZGVyOiBxLmZvbGRlciB9IDoge30pLFxuICAgICAgICB9KSksXG4gICAgfSxcbiAgICAnY29jb3M6Ly9kb2NzL2xhbmRtaW5lcyc6IHtcbiAgICAgICAgbWltZVR5cGU6IE1JTUVfTUFSS0RPV04sXG4gICAgICAgIC8vIEV4dHJhY3QganVzdCB0aGUgwqdMYW5kbWluZXMgc2VjdGlvbiBmcm9tIENMQVVERS5tZCBzbyBBSSBkb2Vzbid0IGdldFxuICAgICAgICAvLyB1bnJlbGF0ZWQgY29udmVudGlvbiBjaGF0dGVyLiBJZiB0aGUgc2VjdGlvbiBoZWFkZXIgY2hhbmdlcyB1cHN0cmVhbSxcbiAgICAgICAgLy8gZmFsbCBiYWNrIHRvIHdob2xlIGZpbGUgd2l0aCBhIG5vdGUuXG4gICAgICAgIGZldGNoOiBhc3luYyAoKSA9PiByZWFkRG9jc1NlY3Rpb24ocGF0aC5qb2luKGdldEV4dGVuc2lvblJvb3QoKSwgJ0NMQVVERS5tZCcpLCAnIyMgTGFuZG1pbmVzJyksXG4gICAgfSxcbiAgICAnY29jb3M6Ly9kb2NzL3Rvb2xzJzoge1xuICAgICAgICBtaW1lVHlwZTogTUlNRV9NQVJLRE9XTixcbiAgICAgICAgZmV0Y2g6IGFzeW5jICgpID0+IHJlYWREb2NzRmlsZShwYXRoLmpvaW4oZ2V0RXh0ZW5zaW9uUm9vdCgpLCAnZG9jcycsICd0b29scy5tZCcpKSxcbiAgICB9LFxuICAgICdjb2NvczovL2RvY3MvaGFuZG9mZic6IHtcbiAgICAgICAgbWltZVR5cGU6IE1JTUVfTUFSS0RPV04sXG4gICAgICAgIGZldGNoOiBhc3luYyAoKSA9PiByZWFkRG9jc0ZpbGUocGF0aC5qb2luKGdldEV4dGVuc2lvblJvb3QoKSwgJ2RvY3MnLCAnSEFORE9GRi5tZCcpKSxcbiAgICB9LFxufTtcblxuYXN5bmMgZnVuY3Rpb24gY2FsbFRvb2wocmVnaXN0cnk6IFRvb2xSZWdpc3RyeSwgY2F0ZWdvcnk6IHN0cmluZywgdG9vbDogc3RyaW5nLCBhcmdzOiBhbnkpOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IGV4ZWN1dG9yID0gcmVnaXN0cnlbY2F0ZWdvcnldO1xuICAgIGlmICghZXhlY3V0b3IpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBSZXNvdXJjZSBiYWNrZW5kIG1pc3Npbmc6IHJlZ2lzdHJ5IGhhcyBubyAnJHtjYXRlZ29yeX0nIGNhdGVnb3J5YCk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3BvbnNlOiBUb29sUmVzcG9uc2UgPSBhd2FpdCBleGVjdXRvci5leGVjdXRlKHRvb2wsIGFyZ3MpO1xuICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5zdWNjZXNzID09PSBmYWxzZSkge1xuICAgICAgICBjb25zdCBtc2cgPSByZXNwb25zZS5lcnJvciA/PyByZXNwb25zZS5tZXNzYWdlID8/IGAke2NhdGVnb3J5fV8ke3Rvb2x9IGZhaWxlZGA7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcih0eXBlb2YgbXNnID09PSAnc3RyaW5nJyA/IG1zZyA6IEpTT04uc3RyaW5naWZ5KG1zZykpO1xuICAgIH1cbiAgICByZXR1cm4gcmVzcG9uc2U7XG59XG5cbmZ1bmN0aW9uIHJlYWREb2NzRmlsZShhYnNQYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIHRyeSB7XG4gICAgICAgIHJldHVybiBmcy5yZWFkRmlsZVN5bmMoYWJzUGF0aCwgJ3V0ZjgnKTtcbiAgICB9IGNhdGNoIChlOiBhbnkpIHtcbiAgICAgICAgaWYgKGU/LmNvZGUgPT09ICdFTk9FTlQnKSB7XG4gICAgICAgICAgICByZXR1cm4gYCMgUmVzb3VyY2UgdW5hdmFpbGFibGVcXG5cXG5GaWxlIG5vdCBmb3VuZCBhdCBpbnN0YWxsIHBhdGg6IFxcYCR7YWJzUGF0aH1cXGBcXG5cXG5UaGUgZG9jcyByZXNvdXJjZSBleHBlY3RlZCB0aGlzIGZpbGUgYXQgdGhlIGV4dGVuc2lvbiByb290LiBJZiB0aGVcXG5leHRlbnNpb24gd2FzIGluc3RhbGxlZCB3aXRob3V0IHNvdXJjZSBmaWxlcywgZmV0Y2ggdGhlIGxhdGVzdCBmcm9tXFxuaHR0cHM6Ly9naXRodWIuY29tL2FybmllMTEyOC9jb2Nvcy1tY3Atc2VydmVyLmA7XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHJlYWREb2NzU2VjdGlvbihhYnNQYXRoOiBzdHJpbmcsIHNlY3Rpb25IZWFkZXI6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgbGV0IHJhdzogc3RyaW5nO1xuICAgIHRyeSB7XG4gICAgICAgIHJhdyA9IGZzLnJlYWRGaWxlU3luYyhhYnNQYXRoLCAndXRmOCcpO1xuICAgIH0gY2F0Y2ggKGU6IGFueSkge1xuICAgICAgICBpZiAoZT8uY29kZSA9PT0gJ0VOT0VOVCcpIHtcbiAgICAgICAgICAgIHJldHVybiBgIyBSZXNvdXJjZSB1bmF2YWlsYWJsZVxcblxcbkZpbGUgbm90IGZvdW5kIGF0IGluc3RhbGwgcGF0aDogXFxgJHthYnNQYXRofVxcYC5gO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGU7XG4gICAgfVxuICAgIC8vIFN0cmlwIG9wdGlvbmFsIFVURi04IEJPTSB0aGF0IHNvbWUgZWRpdG9ycyBhZGQgdG8gbWFya2Rvd24gZmlsZXMuXG4gICAgY29uc3QgY29udGVudCA9IHJhdy5jaGFyQ29kZUF0KDApID09PSAweEZFRkYgPyByYXcuc2xpY2UoMSkgOiByYXc7XG4gICAgLy8gdjIuMy4xIHJldmlldyBmaXg6IHNwbGl0IG9uIENSTEYgb3IgTEYgc28gV2luZG93cy1zYXZlZCBtYXJrZG93blxuICAgIC8vIGRvZXNuJ3QgbGVhdmUgXFxyIHJlc2lkdWUgYXQgZW5kIG9mIGV2ZXJ5IGxpbmUgYW5kIGNvbmZ1c2UgdGhlIHNlY3Rpb25cbiAgICAvLyBoZWFkZXIgZXF1YWxpdHkgY2hlY2sgYmVsb3cuXG4gICAgY29uc3QgbGluZXMgPSBjb250ZW50LnNwbGl0KC9cXHI/XFxuLyk7XG4gICAgLy8gTWF0Y2ggZXhhY3QgaGVhZGVyIG9yIFwiIyMgSGVhZGVyICguLi4pXCIgZm9ybS4gU2VjdGlvbiBoZWFkZXJzIGluIENMQVVERS5tZFxuICAgIC8vIHNvbWV0aW1lcyBjYXJyeSBhIHBhcmVudGhldGljYWwgaGludCBhZnRlciB0aGUgdGl0bGUsIGUuZy5cbiAgICAvLyBcIiMjIExhbmRtaW5lcyAocmVhZCBiZWZvcmUgZWRpdGluZylcIi5cbiAgICBjb25zdCBzdGFydElkeCA9IGxpbmVzLmZpbmRJbmRleChsID0+IHtcbiAgICAgICAgY29uc3QgdCA9IGwudHJpbSgpO1xuICAgICAgICByZXR1cm4gdCA9PT0gc2VjdGlvbkhlYWRlciB8fCB0LnN0YXJ0c1dpdGgoc2VjdGlvbkhlYWRlciArICcgJykgfHwgdC5zdGFydHNXaXRoKHNlY3Rpb25IZWFkZXIgKyAnKCcpO1xuICAgIH0pO1xuICAgIGlmIChzdGFydElkeCA9PT0gLTEpIHtcbiAgICAgICAgcmV0dXJuIGAjIFNlY3Rpb24gbm90IGZvdW5kXFxuXFxuU2VjdGlvbiBoZWFkZXIgXFxgJHtzZWN0aW9uSGVhZGVyfVxcYCBub3QgZm91bmQgaW4gJHtwYXRoLmJhc2VuYW1lKGFic1BhdGgpfS5cXG5SZXR1cm5pbmcgd2hvbGUgZmlsZSBhcyBmYWxsYmFjay5cXG5cXG4tLS1cXG5cXG4ke2NvbnRlbnR9YDtcbiAgICB9XG4gICAgLy8gRmluZCB0aGUgbmV4dCB0b3AtbGV2ZWwgKCMjICkgaGVhZGluZyBhZnRlciB0aGUgc2VjdGlvbiBoZWFkZXIgdG8gYm91bmQgaXQuXG4gICAgLy8gc2VjdGlvbkhlYWRlciBpcyBsaWtlIFwiIyMgTGFuZG1pbmVzXCI7IHRoZSBuZXh0IHNpYmxpbmcgaGVhZGluZyBzdGFydHMgd2l0aCBcIiMjIFwiICgyIGhhc2hlcywgc3BhY2UpLlxuICAgIGxldCBlbmRJZHggPSBsaW5lcy5sZW5ndGg7XG4gICAgZm9yIChsZXQgaSA9IHN0YXJ0SWR4ICsgMTsgaSA8IGxpbmVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmICgvXiMjXFxzLy50ZXN0KGxpbmVzW2ldKSkgeyBlbmRJZHggPSBpOyBicmVhazsgfVxuICAgIH1cbiAgICByZXR1cm4gbGluZXMuc2xpY2Uoc3RhcnRJZHgsIGVuZElkeCkuam9pbignXFxuJyk7XG59XG5cbmV4cG9ydCBjbGFzcyBSZXNvdXJjZVJlZ2lzdHJ5IHtcbiAgICBjb25zdHJ1Y3Rvcihwcml2YXRlIHJlZ2lzdHJ5OiBUb29sUmVnaXN0cnkpIHt9XG5cbiAgICBsaXN0KCk6IFJlc291cmNlRGVzY3JpcHRvcltdIHtcbiAgICAgICAgcmV0dXJuIFNUQVRJQ19SRVNPVVJDRVMuc2xpY2UoKTtcbiAgICB9XG5cbiAgICBsaXN0VGVtcGxhdGVzKCk6IFJlc291cmNlVGVtcGxhdGVEZXNjcmlwdG9yW10ge1xuICAgICAgICByZXR1cm4gVEVNUExBVEVfUkVTT1VSQ0VTLnNsaWNlKCk7XG4gICAgfVxuXG4gICAgYXN5bmMgcmVhZCh1cmk6IHN0cmluZyk6IFByb21pc2U8UmVzb3VyY2VDb250ZW50PiB7XG4gICAgICAgIGNvbnN0IHsgYmFzZSwgcXVlcnkgfSA9IHBhcnNlVXJpKHVyaSk7XG4gICAgICAgIGNvbnN0IGhhbmRsZXIgPSBIQU5ETEVSU1tiYXNlXTtcbiAgICAgICAgaWYgKCFoYW5kbGVyKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gcmVzb3VyY2UgVVJJOiAke3VyaX1gKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCB0ZXh0ID0gYXdhaXQgaGFuZGxlci5mZXRjaCh0aGlzLnJlZ2lzdHJ5LCBxdWVyeSk7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICB1cmksXG4gICAgICAgICAgICBtaW1lVHlwZTogaGFuZGxlci5taW1lVHlwZSxcbiAgICAgICAgICAgIHRleHQsXG4gICAgICAgIH07XG4gICAgfVxufVxuXG4vLyBTdHJpcCBxdWVyeSBzdHJpbmcgKyBmcmFnbWVudCwgcmV0dXJuIGJhc2UgVVJJIGZvciBoYW5kbGVyIGxvb2t1cCBwbHVzXG4vLyB0aGUgcGFyc2VkIHF1ZXJ5IHBhcmFtcyBmb3IgcGFyYW1ldGVyaXplZCBoYW5kbGVycy5cbmZ1bmN0aW9uIHBhcnNlVXJpKHVyaTogc3RyaW5nKTogeyBiYXNlOiBzdHJpbmc7IHF1ZXJ5OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+IH0ge1xuICAgIGNvbnN0IHBhcnNlZCA9IHVybC5wYXJzZSh1cmksIHRydWUpO1xuICAgIGlmICghcGFyc2VkLnByb3RvY29sIHx8ICFwYXJzZWQuaG9zdCkge1xuICAgICAgICByZXR1cm4geyBiYXNlOiB1cmksIHF1ZXJ5OiB7fSB9O1xuICAgIH1cbiAgICBjb25zdCBiYXNlID0gYCR7cGFyc2VkLnByb3RvY29sfS8vJHtwYXJzZWQuaG9zdH0ke3BhcnNlZC5wYXRobmFtZSB8fCAnJ31gO1xuICAgIGNvbnN0IHF1ZXJ5OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge307XG4gICAgZm9yIChjb25zdCBbaywgdl0gb2YgT2JqZWN0LmVudHJpZXMocGFyc2VkLnF1ZXJ5KSkge1xuICAgICAgICBpZiAodHlwZW9mIHYgPT09ICdzdHJpbmcnKSBxdWVyeVtrXSA9IHY7XG4gICAgICAgIGVsc2UgaWYgKEFycmF5LmlzQXJyYXkodikgJiYgdi5sZW5ndGggPiAwKSBxdWVyeVtrXSA9IHZbMF07XG4gICAgfVxuICAgIHJldHVybiB7IGJhc2UsIHF1ZXJ5IH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVSZXNvdXJjZVJlZ2lzdHJ5KHRvb2xSZWdpc3RyeTogVG9vbFJlZ2lzdHJ5KTogUmVzb3VyY2VSZWdpc3RyeSB7XG4gICAgcmV0dXJuIG5ldyBSZXNvdXJjZVJlZ2lzdHJ5KHRvb2xSZWdpc3RyeSk7XG59XG4iXX0=