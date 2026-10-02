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
        description: 'Capped node hierarchy of the active scene. Component type summaries included; backed by debug_get_node_tree with maxDepth=8 and maxNodes=2000.',
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
        description: 'docs/landmines.md — numbered editor and engine pitfalls with their conditions and mitigations. Read this when a tool call surprises you with editor-state behaviour — most surprises are documented as landmines.',
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
        fetch: async (r) => JSON.stringify(await callTool(r, 'debug', 'get_node_tree', {
            maxDepth: 8,
            maxNodes: 2000,
            summaryOnly: false,
        })),
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
        fetch: async () => readDocsFile(path.join(getExtensionRoot(), 'docs', 'landmines.md')),
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVnaXN0cnkuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvcmVzb3VyY2VzL3JlZ2lzdHJ5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQWlQQSx3REFFQztBQW5QRCx1Q0FBeUI7QUFDekIsMkNBQTZCO0FBQzdCLHlDQUEyQjtBQXVDM0IsTUFBTSxTQUFTLEdBQUcsa0JBQWtCLENBQUM7QUFDckMsTUFBTSxhQUFhLEdBQUcsZUFBZSxDQUFDO0FBRXRDLDZFQUE2RTtBQUM3RSwwRUFBMEU7QUFDMUUsaURBQWlEO0FBQ2pELFNBQVMsZ0JBQWdCO0lBQ3JCLE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQyxTQUFTLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO0FBQy9DLENBQUM7QUFFRCxNQUFNLGdCQUFnQixHQUF5QjtJQUMzQztRQUNJLEdBQUcsRUFBRSx1QkFBdUI7UUFDNUIsSUFBSSxFQUFFLHVCQUF1QjtRQUM3QixXQUFXLEVBQUUscUdBQXFHO1FBQ2xILFFBQVEsRUFBRSxTQUFTO0tBQ3RCO0lBQ0Q7UUFDSSxHQUFHLEVBQUUseUJBQXlCO1FBQzlCLElBQUksRUFBRSxpQkFBaUI7UUFDdkIsV0FBVyxFQUFFLGdKQUFnSjtRQUM3SixRQUFRLEVBQUUsU0FBUztLQUN0QjtJQUNEO1FBQ0ksR0FBRyxFQUFFLG9CQUFvQjtRQUN6QixJQUFJLEVBQUUsb0JBQW9CO1FBQzFCLFdBQVcsRUFBRSxzRUFBc0U7UUFDbkYsUUFBUSxFQUFFLFNBQVM7S0FDdEI7SUFDRDtRQUNJLEdBQUcsRUFBRSxpQkFBaUI7UUFDdEIsSUFBSSxFQUFFLGlCQUFpQjtRQUN2QixXQUFXLEVBQUUsNklBQTZJO1FBQzFKLFFBQVEsRUFBRSxTQUFTO0tBQ3RCO0lBQ0Q7UUFDSSxHQUFHLEVBQUUsc0JBQXNCO1FBQzNCLElBQUksRUFBRSxjQUFjO1FBQ3BCLFdBQVcsRUFBRSwwRkFB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QUFDLEVBQUUsQ0FBQztRQUNoRCxJQUFJLE9BQU8sQ0FBQyxLQUFLLFFBQVE7WUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO2FBQ25DLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxHQUFHLENBQUM7WUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQy9ELENBQUM7SUFDRCxPQUFPLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxDQUFDO0FBQzNCLENBQUM7QUFFRCxTQUFnQixzQkFBc0IsQ0FBQyxZQUEwQjtJQUM3RCxPQUFPLElBQUksZ0JBQWdCLENBQUMsWUFBWSxDQUFDLENBQUM7QUFDOUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgKiBhcyB1cmwgZnJvbSAndXJsJztcbmltcG9ydCB7IFRvb2xSZWdpc3RyeSB9IGZyb20gJy4uL3Rvb2xzL3JlZ2lzdHJ5JztcbmltcG9ydCB7IFRvb2xSZXNwb25zZSB9IGZyb20gJy4uL3R5cGVzJztcblxuLyoqXG4gKiBNQ1AgUmVzb3VyY2VzIGZvciBjb2Nvcy1tY3Atc2VydmVyLlxuICpcbiAqIFN1cmZhY2Ug4oCUIHNlZSBkb2NzL2FyY2hpdmUvcmVzZWFyY2gvdC1wMy0xLXByaW9yLWFydC5tZCBhbmRcbiAqIGRvY3Mvcm9hZG1hcC8wNi12ZXJzaW9uLXBsYW4tdjIzLXYyNy5tZCBmb3IgZGVzaWduIHJhdGlvbmFsZS5cbiAqXG4gKiAtIFRvb2wtYmFja2VkIHJlc291cmNlcyByZXVzZSB0aGUgZXhpc3RpbmcgcmVhZC1vbmx5IFRvb2xFeGVjdXRvciBjYWxsIHNvXG4gKiAgIHJlc291cmNlIHJlYWQgYW5kIHRvb2xzL2NhbGwgcmV0dXJuIGJ5dGUtaWRlbnRpY2FsIGRhdGEuXG4gKiAtIERvY3MgcmVzb3VyY2VzIHJlYWQgbWFya2Rvd24gZmlsZXMgdW5kZXIgZG9jcy8gYXQgcmVxdWVzdCB0aW1lIHNvIGVkaXRzXG4gKiAgIGFyZSByZWZsZWN0ZWQgaW1tZWRpYXRlbHksIG5vIGV4dGVuc2lvbiByZWxvYWQuXG4gKlxuICogVVJJIHByZWZpeCBpcyBgY29jb3M6Ly9gIHRvIGFsaWduIHdpdGggY29jb3MtY2xpIChvZmZpY2lhbCkgYW5kXG4gKiBGdW5wbGF5QUkgKGNsb3Nlc3Qgc2libGluZyBlbWJlZGRlZCBleHRlbnNpb24pLlxuICovXG5cbmV4cG9ydCBpbnRlcmZhY2UgUmVzb3VyY2VEZXNjcmlwdG9yIHtcbiAgICB1cmk6IHN0cmluZztcbiAgICBuYW1lOiBzdHJpbmc7XG4gICAgZGVzY3JpcHRpb246IHN0cmluZztcbiAgICBtaW1lVHlwZTogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJlc291cmNlVGVtcGxhdGVEZXNjcmlwdG9yIHtcbiAgICB1cmlUZW1wbGF0ZTogc3RyaW5nO1xuICAgIG5hbWU6IHN0cmluZztcbiAgICBkZXNjcmlwdGlvbjogc3RyaW5nO1xuICAgIG1pbWVUeXBlOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUmVzb3VyY2VDb250ZW50IHtcbiAgICB1cmk6IHN0cmluZztcbiAgICBtaW1lVHlwZTogc3RyaW5nO1xuICAgIHRleHQ6IHN0cmluZztcbn1cblxuY29uc3QgTUlNRV9KU09OID0gJ2FwcGxpY2F0aW9uL2pzb24nO1xuY29uc3QgTUlNRV9NQVJLRE9XTiA9ICd0ZXh0L21hcmtkb3duJztcblxuLy8gUmVzb2x2ZSB0aGUgZXh0ZW5zaW9uIHJvb3Qgc28gZG9jcyByZXNvdXJjZXMgY2FuIHJlYWQgZnJvbSBkaXNrIHJlZ2FyZGxlc3Ncbi8vIG9mIHdoZXJlIGNvY29zIGluc3RhbGxzIHRoZSBwbHVnaW4uIGRpc3QvcmVzb3VyY2VzL3JlZ2lzdHJ5LmpzIHNpdHMgdHdvXG4vLyBsZXZlbHMgZGVlcCwgc28gYC4uLy4uYCBpcyB0aGUgZXh0ZW5zaW9uIHJvb3QuXG5mdW5jdGlvbiBnZXRFeHRlbnNpb25Sb290KCk6IHN0cmluZyB7XG4gICAgcmV0dXJuIHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsICcuLicsICcuLicpO1xufVxuXG5jb25zdCBTVEFUSUNfUkVTT1VSQ0VTOiBSZXNvdXJjZURlc2NyaXB0b3JbXSA9IFtcbiAgICB7XG4gICAgICAgIHVyaTogJ2NvY29zOi8vc2NlbmUvY3VycmVudCcsXG4gICAgICAgIG5hbWU6ICdDdXJyZW50IHNjZW5lIHN1bW1hcnknLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ0FjdGl2ZSBzY2VuZSByb290IG1ldGFkYXRhOiBuYW1lLCB1dWlkLCB0eXBlLCBhY3RpdmUsIG5vZGVDb3VudC4gQmFja2VkIGJ5IHNjZW5lX2dldF9jdXJyZW50X3NjZW5lLicsXG4gICAgICAgIG1pbWVUeXBlOiBNSU1FX0pTT04sXG4gICAgfSxcbiAgICB7XG4gICAgICAgIHVyaTogJ2NvY29zOi8vc2NlbmUvaGllcmFyY2h5JyxcbiAgICAgICAgbmFtZTogJ1NjZW5lIGhpZXJhcmNoeScsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnQ2FwcGVkIG5vZGUgaGllcmFyY2h5IG9mIHRoZSBhY3RpdmUgc2NlbmUuIENvbXBvbmVudCB0eXBlIHN1bW1hcmllcyBpbmNsdWRlZDsgYmFja2VkIGJ5IGRlYnVnX2dldF9ub2RlX3RyZWUgd2l0aCBtYXhEZXB0aD04IGFuZCBtYXhOb2Rlcz0yMDAwLicsXG4gICAgICAgIG1pbWVUeXBlOiBNSU1FX0pTT04sXG4gICAgfSxcbiAgICB7XG4gICAgICAgIHVyaTogJ2NvY29zOi8vc2NlbmUvbGlzdCcsXG4gICAgICAgIG5hbWU6ICdQcm9qZWN0IHNjZW5lIGxpc3QnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ0FsbCAuc2NlbmUgYXNzZXRzIHVuZGVyIGRiOi8vYXNzZXRzLiBCYWNrZWQgYnkgc2NlbmVfZ2V0X3NjZW5lX2xpc3QuJyxcbiAgICAgICAgbWltZVR5cGU6IE1JTUVfSlNPTixcbiAgICB9LFxuICAgIHtcbiAgICAgICAgdXJpOiAnY29jb3M6Ly9wcmVmYWJzJyxcbiAgICAgICAgbmFtZTogJ1Byb2plY3QgcHJlZmFicycsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnQWxsIC5wcmVmYWIgYXNzZXRzIHVuZGVyIGRiOi8vYXNzZXRzLiBVc2UgdGhlIGNvY29zOi8vcHJlZmFic3s/Zm9sZGVyfSB0ZW1wbGF0ZSB0byBzY29wZSB0byBhIHN1Yi1mb2xkZXIuIEJhY2tlZCBieSBwcmVmYWJfZ2V0X3ByZWZhYl9saXN0LicsXG4gICAgICAgIG1pbWVUeXBlOiBNSU1FX0pTT04sXG4gICAgfSxcbiAgICB7XG4gICAgICAgIHVyaTogJ2NvY29zOi8vcHJvamVjdC9pbmZvJyxcbiAgICAgICAgbmFtZTogJ1Byb2plY3QgaW5mbycsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnUHJvamVjdCBuYW1lLCBwYXRoLCB1dWlkLCB2ZXJzaW9uIGFuZCBDb2NvcyB2ZXJzaW9uLiBCYWNrZWQgYnkgcHJvamVjdF9nZXRfcHJvamVjdF9pbmZvLicsXG4gICAgICAgIG1pbWVUeXBlOiBNSU1FX0pTT04sXG4gICAgfSxcbiAgICB7XG4gICAgICAgIHVyaTogJ2NvY29zOi8vYXNzZXRzJyxcbiAgICAgICAgbmFtZTogJ1Byb2plY3QgYXNzZXRzJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdBc3NldCBsaXN0IHVuZGVyIGRiOi8vYXNzZXRzLCBhbGwgdHlwZXMuIFVzZSB0aGUgY29jb3M6Ly9hc3NldHN7P3R5cGUsZm9sZGVyfSB0ZW1wbGF0ZSB0byBmaWx0ZXIgYnkgdHlwZSBvciBzdWItZm9sZGVyLiBCYWNrZWQgYnkgcHJvamVjdF9nZXRfYXNzZXRzLicsXG4gICAgICAgIG1pbWVUeXBlOiBNSU1FX0pTT04sXG4gICAgfSxcbiAgICB7XG4gICAgICAgIHVyaTogJ2NvY29zOi8vZG9jcy9sYW5kbWluZXMnLFxuICAgICAgICBuYW1lOiAnTGFuZG1pbmVzIHJlZmVyZW5jZScsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnZG9jcy9sYW5kbWluZXMubWQg4oCUIG51bWJlcmVkIGVkaXRvciBhbmQgZW5naW5lIHBpdGZhbGxzIHdpdGggdGhlaXIgY29uZGl0aW9ucyBhbmQgbWl0aWdhdGlvbnMuIFJlYWQgdGhpcyB3aGVuIGEgdG9vbCBjYWxsIHN1cnByaXNlcyB5b3Ugd2l0aCBlZGl0b3Itc3RhdGUgYmVoYXZpb3VyIOKAlCBtb3N0IHN1cnByaXNlcyBhcmUgZG9jdW1lbnRlZCBhcyBsYW5kbWluZXMuJyxcbiAgICAgICAgbWltZVR5cGU6IE1JTUVfTUFSS0RPV04sXG4gICAgfSxcbiAgICB7XG4gICAgICAgIHVyaTogJ2NvY29zOi8vZG9jcy90b29scycsXG4gICAgICAgIG5hbWU6ICdBdXRvLWdlbmVyYXRlZCB0b29sIHJlZmVyZW5jZScsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnZG9jcy90b29scy5tZCBnZW5lcmF0ZWQgZnJvbSB0aGUgbGl2ZSB0b29sIHJlZ2lzdHJ5LiBBdXRob3JpdGF0aXZlIGxpc3Rpbmcgb2YgZXZlcnkgdG9vbCwgaXRzIGRlc2NyaXB0aW9uLCBhbmQgaXRzIGlucHV0U2NoZW1hLicsXG4gICAgICAgIG1pbWVUeXBlOiBNSU1FX01BUktET1dOLFxuICAgIH0sXG4gICAge1xuICAgICAgICB1cmk6ICdjb2NvczovL2RvY3MvaGFuZG9mZicsXG4gICAgICAgIG5hbWU6ICdTZXNzaW9uIGhhbmRvZmYnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ2RvY3MvSEFORE9GRi5tZCDigJQgY3VycmVudCBiYWNrbG9nLCB2ZXJzaW9uIHBsYW4gcG9pbnRlcnMsIGVudmlyb25tZW50IGNoZWNrIGNvbW1hbmRzLCByb2xsYmFjayBhbmNob3JzLiBSZWFkIHRoaXMgZm9yIHByb2plY3Qgb3JpZW50YXRpb24uJyxcbiAgICAgICAgbWltZVR5cGU6IE1JTUVfTUFSS0RPV04sXG4gICAgfSxcbl07XG5cbmNvbnN0IFRFTVBMQVRFX1JFU09VUkNFUzogUmVzb3VyY2VUZW1wbGF0ZURlc2NyaXB0b3JbXSA9IFtcbiAgICB7XG4gICAgICAgIHVyaVRlbXBsYXRlOiAnY29jb3M6Ly9wcmVmYWJzez9mb2xkZXJ9JyxcbiAgICAgICAgbmFtZTogJ1ByZWZhYnMgaW4gZm9sZGVyJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdQcmVmYWIgbGlzdCBzY29wZWQgdG8gYSBkYjovLyBmb2xkZXIuIEV4YW1wbGU6IGNvY29zOi8vcHJlZmFicz9mb2xkZXI9ZGI6Ly9hc3NldHMvdWknLFxuICAgICAgICBtaW1lVHlwZTogTUlNRV9KU09OLFxuICAgIH0sXG4gICAge1xuICAgICAgICB1cmlUZW1wbGF0ZTogJ2NvY29zOi8vYXNzZXRzez90eXBlLGZvbGRlcn0nLFxuICAgICAgICBuYW1lOiAnQXNzZXRzIGJ5IHR5cGUgYW5kIGZvbGRlcicsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnQXNzZXQgbGlzdCBmaWx0ZXJlZCBieSB0eXBlIChhbGx8c2NlbmV8cHJlZmFifHNjcmlwdHx0ZXh0dXJlfG1hdGVyaWFsfG1lc2h8YXVkaW98YW5pbWF0aW9uKSBhbmQgZm9sZGVyLiBFeGFtcGxlOiBjb2NvczovL2Fzc2V0cz90eXBlPXByZWZhYiZmb2xkZXI9ZGI6Ly9hc3NldHMvdWknLFxuICAgICAgICBtaW1lVHlwZTogTUlNRV9KU09OLFxuICAgIH0sXG5dO1xuXG5pbnRlcmZhY2UgUmVzb3VyY2VIYW5kbGVyIHtcbiAgICBtaW1lVHlwZTogc3RyaW5nO1xuICAgIC8vIFJldHVybnMgdGhlIHJhdyB0ZXh0IGJvZHkgZm9yIHRoZSByZXNvdXJjZS4gQ2FsbGVyIHdyYXBzIGludG8gTUNQIHNoYXBlLlxuICAgIGZldGNoOiAocmVnaXN0cnk6IFRvb2xSZWdpc3RyeSwgcXVlcnk6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4pID0+IFByb21pc2U8c3RyaW5nPjtcbn1cblxuY29uc3QgSEFORExFUlM6IFJlY29yZDxzdHJpbmcsIFJlc291cmNlSGFuZGxlcj4gPSB7XG4gICAgJ2NvY29zOi8vc2NlbmUvY3VycmVudCc6IHtcbiAgICAgICAgbWltZVR5cGU6IE1JTUVfSlNPTixcbiAgICAgICAgZmV0Y2g6IGFzeW5jIChyKSA9PiBKU09OLnN0cmluZ2lmeShhd2FpdCBjYWxsVG9vbChyLCAnc2NlbmUnLCAnZ2V0X2N1cnJlbnRfc2NlbmUnLCB7fSkpLFxuICAgIH0sXG4gICAgJ2NvY29zOi8vc2NlbmUvaGllcmFyY2h5Jzoge1xuICAgICAgICBtaW1lVHlwZTogTUlNRV9KU09OLFxuICAgICAgICBmZXRjaDogYXN5bmMgKHIpID0+IEpTT04uc3RyaW5naWZ5KGF3YWl0IGNhbGxUb29sKHIsICdkZWJ1ZycsICdnZXRfbm9kZV90cmVlJywge1xuICAgICAgICAgICAgbWF4RGVwdGg6IDgsXG4gICAgICAgICAgICBtYXhOb2RlczogMjAwMCxcbiAgICAgICAgICAgIHN1bW1hcnlPbmx5OiBmYWxzZSxcbiAgICAgICAgfSkpLFxuICAgIH0sXG4gICAgJ2NvY29zOi8vc2NlbmUvbGlzdCc6IHtcbiAgICAgICAgbWltZVR5cGU6IE1JTUVfSlNPTixcbiAgICAgICAgZmV0Y2g6IGFzeW5jIChyKSA9PiBKU09OLnN0cmluZ2lmeShhd2FpdCBjYWxsVG9vbChyLCAnc2NlbmUnLCAnZ2V0X3NjZW5lX2xpc3QnLCB7fSkpLFxuICAgIH0sXG4gICAgJ2NvY29zOi8vcHJlZmFicyc6IHtcbiAgICAgICAgbWltZVR5cGU6IE1JTUVfSlNPTixcbiAgICAgICAgZmV0Y2g6IGFzeW5jIChyLCBxKSA9PiBKU09OLnN0cmluZ2lmeShhd2FpdCBjYWxsVG9vbChyLCAncHJlZmFiJywgJ2dldF9wcmVmYWJfbGlzdCcsIHEuZm9sZGVyID8geyBmb2xkZXI6IHEuZm9sZGVyIH0gOiB7fSkpLFxuICAgIH0sXG4gICAgJ2NvY29zOi8vcHJvamVjdC9pbmZvJzoge1xuICAgICAgICBtaW1lVHlwZTogTUlNRV9KU09OLFxuICAgICAgICBmZXRjaDogYXN5bmMgKHIpID0+IEpTT04uc3RyaW5naWZ5KGF3YWl0IGNhbGxUb29sKHIsICdwcm9qZWN0JywgJ2dldF9wcm9qZWN0X2luZm8nLCB7fSkpLFxuICAgIH0sXG4gICAgJ2NvY29zOi8vYXNzZXRzJzoge1xuICAgICAgICBtaW1lVHlwZTogTUlNRV9KU09OLFxuICAgICAgICBmZXRjaDogYXN5bmMgKHIsIHEpID0+IEpTT04uc3RyaW5naWZ5KGF3YWl0IGNhbGxUb29sKHIsICdwcm9qZWN0JywgJ2dldF9hc3NldHMnLCB7XG4gICAgICAgICAgICAuLi4ocS50eXBlID8geyB0eXBlOiBxLnR5cGUgfSA6IHt9KSxcbiAgICAgICAgICAgIC4uLihxLmZvbGRlciA/IHsgZm9sZGVyOiBxLmZvbGRlciB9IDoge30pLFxuICAgICAgICB9KSksXG4gICAgfSxcbiAgICAnY29jb3M6Ly9kb2NzL2xhbmRtaW5lcyc6IHtcbiAgICAgICAgbWltZVR5cGU6IE1JTUVfTUFSS0RPV04sXG4gICAgICAgIGZldGNoOiBhc3luYyAoKSA9PiByZWFkRG9jc0ZpbGUocGF0aC5qb2luKGdldEV4dGVuc2lvblJvb3QoKSwgJ2RvY3MnLCAnbGFuZG1pbmVzLm1kJykpLFxuICAgIH0sXG4gICAgJ2NvY29zOi8vZG9jcy90b29scyc6IHtcbiAgICAgICAgbWltZVR5cGU6IE1JTUVfTUFSS0RPV04sXG4gICAgICAgIGZldGNoOiBhc3luYyAoKSA9PiByZWFkRG9jc0ZpbGUocGF0aC5qb2luKGdldEV4dGVuc2lvblJvb3QoKSwgJ2RvY3MnLCAndG9vbHMubWQnKSksXG4gICAgfSxcbiAgICAnY29jb3M6Ly9kb2NzL2hhbmRvZmYnOiB7XG4gICAgICAgIG1pbWVUeXBlOiBNSU1FX01BUktET1dOLFxuICAgICAgICBmZXRjaDogYXN5bmMgKCkgPT4gcmVhZERvY3NGaWxlKHBhdGguam9pbihnZXRFeHRlbnNpb25Sb290KCksICdkb2NzJywgJ0hBTkRPRkYubWQnKSksXG4gICAgfSxcbn07XG5cbmFzeW5jIGZ1bmN0aW9uIGNhbGxUb29sKHJlZ2lzdHJ5OiBUb29sUmVnaXN0cnksIGNhdGVnb3J5OiBzdHJpbmcsIHRvb2w6IHN0cmluZywgYXJnczogYW55KTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCBleGVjdXRvciA9IHJlZ2lzdHJ5W2NhdGVnb3J5XTtcbiAgICBpZiAoIWV4ZWN1dG9yKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgUmVzb3VyY2UgYmFja2VuZCBtaXNzaW5nOiByZWdpc3RyeSBoYXMgbm8gJyR7Y2F0ZWdvcnl9JyBjYXRlZ29yeWApO1xuICAgIH1cbiAgICBjb25zdCByZXNwb25zZTogVG9vbFJlc3BvbnNlID0gYXdhaXQgZXhlY3V0b3IuZXhlY3V0ZSh0b29sLCBhcmdzKTtcbiAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uuc3VjY2VzcyA9PT0gZmFsc2UpIHtcbiAgICAgICAgY29uc3QgbXNnID0gcmVzcG9uc2UuZXJyb3IgPz8gcmVzcG9uc2UubWVzc2FnZSA/PyBgJHtjYXRlZ29yeX1fJHt0b29sfSBmYWlsZWRgO1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IodHlwZW9mIG1zZyA9PT0gJ3N0cmluZycgPyBtc2cgOiBKU09OLnN0cmluZ2lmeShtc2cpKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3BvbnNlO1xufVxuXG5mdW5jdGlvbiByZWFkRG9jc0ZpbGUoYWJzUGF0aDogc3RyaW5nKTogc3RyaW5nIHtcbiAgICB0cnkge1xuICAgICAgICByZXR1cm4gZnMucmVhZEZpbGVTeW5jKGFic1BhdGgsICd1dGY4Jyk7XG4gICAgfSBjYXRjaCAoZTogYW55KSB7XG4gICAgICAgIGlmIChlPy5jb2RlID09PSAnRU5PRU5UJykge1xuICAgICAgICAgICAgcmV0dXJuIGAjIFJlc291cmNlIHVuYXZhaWxhYmxlXFxuXFxuRmlsZSBub3QgZm91bmQgYXQgaW5zdGFsbCBwYXRoOiBcXGAke2Fic1BhdGh9XFxgXFxuXFxuVGhlIGRvY3MgcmVzb3VyY2UgZXhwZWN0ZWQgdGhpcyBmaWxlIGF0IHRoZSBleHRlbnNpb24gcm9vdC4gSWYgdGhlXFxuZXh0ZW5zaW9uIHdhcyBpbnN0YWxsZWQgd2l0aG91dCBzb3VyY2UgZmlsZXMsIGZldGNoIHRoZSBsYXRlc3QgZnJvbVxcbmh0dHBzOi8vZ2l0aHViLmNvbS9hcm5pZTExMjgvY29jb3MtbWNwLXNlcnZlci5gO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGU7XG4gICAgfVxufVxuXG5leHBvcnQgY2xhc3MgUmVzb3VyY2VSZWdpc3RyeSB7XG4gICAgY29uc3RydWN0b3IocHJpdmF0ZSByZWdpc3RyeTogVG9vbFJlZ2lzdHJ5KSB7fVxuXG4gICAgbGlzdCgpOiBSZXNvdXJjZURlc2NyaXB0b3JbXSB7XG4gICAgICAgIHJldHVybiBTVEFUSUNfUkVTT1VSQ0VTLnNsaWNlKCk7XG4gICAgfVxuXG4gICAgbGlzdFRlbXBsYXRlcygpOiBSZXNvdXJjZVRlbXBsYXRlRGVzY3JpcHRvcltdIHtcbiAgICAgICAgcmV0dXJuIFRFTVBMQVRFX1JFU09VUkNFUy5zbGljZSgpO1xuICAgIH1cblxuICAgIGFzeW5jIHJlYWQodXJpOiBzdHJpbmcpOiBQcm9taXNlPFJlc291cmNlQ29udGVudD4ge1xuICAgICAgICBjb25zdCB7IGJhc2UsIHF1ZXJ5IH0gPSBwYXJzZVVyaSh1cmkpO1xuICAgICAgICBjb25zdCBoYW5kbGVyID0gSEFORExFUlNbYmFzZV07XG4gICAgICAgIGlmICghaGFuZGxlcikge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIHJlc291cmNlIFVSSTogJHt1cml9YCk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgdGV4dCA9IGF3YWl0IGhhbmRsZXIuZmV0Y2godGhpcy5yZWdpc3RyeSwgcXVlcnkpO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgdXJpLFxuICAgICAgICAgICAgbWltZVR5cGU6IGhhbmRsZXIubWltZVR5cGUsXG4gICAgICAgICAgICB0ZXh0LFxuICAgICAgICB9O1xuICAgIH1cbn1cblxuLy8gU3RyaXAgcXVlcnkgc3RyaW5nICsgZnJhZ21lbnQsIHJldHVybiBiYXNlIFVSSSBmb3IgaGFuZGxlciBsb29rdXAgcGx1c1xuLy8gdGhlIHBhcnNlZCBxdWVyeSBwYXJhbXMgZm9yIHBhcmFtZXRlcml6ZWQgaGFuZGxlcnMuXG5mdW5jdGlvbiBwYXJzZVVyaSh1cmk6IHN0cmluZyk6IHsgYmFzZTogc3RyaW5nOyBxdWVyeTogUmVjb3JkPHN0cmluZywgc3RyaW5nPiB9IHtcbiAgICBjb25zdCBwYXJzZWQgPSB1cmwucGFyc2UodXJpLCB0cnVlKTtcbiAgICBpZiAoIXBhcnNlZC5wcm90b2NvbCB8fCAhcGFyc2VkLmhvc3QpIHtcbiAgICAgICAgcmV0dXJuIHsgYmFzZTogdXJpLCBxdWVyeToge30gfTtcbiAgICB9XG4gICAgY29uc3QgYmFzZSA9IGAke3BhcnNlZC5wcm90b2NvbH0vLyR7cGFyc2VkLmhvc3R9JHtwYXJzZWQucGF0aG5hbWUgfHwgJyd9YDtcbiAgICBjb25zdCBxdWVyeTogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuICAgIGZvciAoY29uc3QgW2ssIHZdIG9mIE9iamVjdC5lbnRyaWVzKHBhcnNlZC5xdWVyeSkpIHtcbiAgICAgICAgaWYgKHR5cGVvZiB2ID09PSAnc3RyaW5nJykgcXVlcnlba10gPSB2O1xuICAgICAgICBlbHNlIGlmIChBcnJheS5pc0FycmF5KHYpICYmIHYubGVuZ3RoID4gMCkgcXVlcnlba10gPSB2WzBdO1xuICAgIH1cbiAgICByZXR1cm4geyBiYXNlLCBxdWVyeSB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlUmVzb3VyY2VSZWdpc3RyeSh0b29sUmVnaXN0cnk6IFRvb2xSZWdpc3RyeSk6IFJlc291cmNlUmVnaXN0cnkge1xuICAgIHJldHVybiBuZXcgUmVzb3VyY2VSZWdpc3RyeSh0b29sUmVnaXN0cnkpO1xufVxuIl19