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
    if (!fs.existsSync(absPath)) {
        return `# Resource unavailable\n\nFile not found at install path: \`${absPath}\`\n\nThe docs resource expected this file at the extension root. If the\nextension was installed without source files, fetch the latest from\nhttps://github.com/arnie1128/cocos-mcp-server.`;
    }
    return fs.readFileSync(absPath, 'utf8');
}
function readDocsSection(absPath, sectionHeader) {
    if (!fs.existsSync(absPath)) {
        return `# Resource unavailable\n\nFile not found at install path: \`${absPath}\`.`;
    }
    // Strip optional UTF-8 BOM that some editors add to markdown files.
    const raw = fs.readFileSync(absPath, 'utf8');
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVnaXN0cnkuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvcmVzb3VyY2VzL3JlZ2lzdHJ5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQTBRQSx3REFFQztBQTVRRCx1Q0FBeUI7QUFDekIsMkNBQTZCO0FBQzdCLHlDQUEyQjtBQXVDM0IsTUFBTSxTQUFTLEdBQUcsa0JBQWtCLENBQUM7QUFDckMsTUFBTSxhQUFhLEdBQUcsZUFBZSxDQUFDO0FBRXRDLDZFQUE2RTtBQUM3RSwwRUFBMEU7QUFDMUUsaURBQWlEO0FBQ2pELFNBQVMsZ0JBQWdCO0lBQ3JCLE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQyxTQUFTLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO0FBQy9DLENBQUM7QUFFRCxNQUFNLGdCQUFnQixHQUF5QjtJQUMzQztRQUNJLEdBQUcsRUFBRSx1QkFBdUI7UUFDNUIsSUFBSSxFQUFFLHVCQUF1QjtRQUM3QixXQUFXLEVBQUUscUdBQXFHO1FBQ2xILFFBQVEsRUFBRSxTQUFTO0tBQ3RCO0lBQ0Q7UUFDSSxHQUFHLEVBQUUseUJBQXlCO1FBQzlCLElBQUksRUFBRSxpQkFBaUI7UUFDdkIsV0FBVyxFQUFFLHlLQUF5SztRQUN0TCxRQUFRLEVBQUUsU0FBUztLQUN0QjtJQUNEO1FBQ0ksR0FBRyxFQUFFLG9CQUFvQjtRQUN6QixJQUFJLEVBQUUsb0JBQW9CO1FBQzFCLFdBQVcsRUFBRSxzRUFBc0U7UUFDbkYsUUFBUSxFQUFFLFNBQVM7S0FDdEI7SUFDRDtRQUNJLEdBQUcsRUFBRSxpQkFBaUI7UUFDdEIsSUFBSSxFQUFFLGlCQUFpQjtRQUN2QixXQUFXLEVBQUUsNklBQTZJO1FBQzFKLFFBQVEsRUFBRSxTQUFTO0tBQ3RCO0lBQ0Q7UUFDSSxHQUFHLEVBQUUsc0JBQXNCO1FBQzNCLElBQUksRUFBRSxjQUFjO1FBQ3BCLFdBQVcsRUFBRSwwRkFB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O0lBQ0QsTUFBTSxJQUFJLEdBQUcsR0FBRyxNQUFNLENBQUMsUUFBUSxLQUFLLE1BQU0sQ0FBQyxJQUFJLEdBQUcsTUFBTSxDQUFDLFFBQVEsSUFBSSxFQUFFLEVBQUUsQ0FBQztJQUMxRSxNQUFNLEtBQUssR0FBMkIsRUFBRSxDQUFDO0lBQ3pDLEtBQUssTUFBTSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsSUFBSSxNQUFNLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1FBQ2hELElBQUksT0FBTyxDQUFDLEtBQUssUUFBUTtZQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7YUFDbkMsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLEdBQUcsQ0FBQztZQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDL0QsQ0FBQztJQUNELE9BQU8sRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLENBQUM7QUFDM0IsQ0FBQztBQUVELFNBQWdCLHNCQUFzQixDQUFDLFlBQTBCO0lBQzdELE9BQU8sSUFBSSxnQkFBZ0IsQ0FBQyxZQUFZLENBQUMsQ0FBQztBQUM5QyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCAqIGFzIHVybCBmcm9tICd1cmwnO1xuaW1wb3J0IHsgVG9vbFJlZ2lzdHJ5IH0gZnJvbSAnLi4vdG9vbHMvcmVnaXN0cnknO1xuaW1wb3J0IHsgVG9vbFJlc3BvbnNlIH0gZnJvbSAnLi4vdHlwZXMnO1xuXG4vKipcbiAqIE1DUCBSZXNvdXJjZXMgZm9yIGNvY29zLW1jcC1zZXJ2ZXIuXG4gKlxuICogU3VyZmFjZSDigJQgc2VlIGRvY3MvcmVzZWFyY2gvdC1wMy0xLXByaW9yLWFydC5tZCBhbmRcbiAqIGRvY3Mvcm9hZG1hcC8wNi12ZXJzaW9uLXBsYW4tdjIzLXYyNy5tZCBmb3IgZGVzaWduIHJhdGlvbmFsZS5cbiAqXG4gKiAtIFRvb2wtYmFja2VkIHJlc291cmNlcyByZXVzZSB0aGUgZXhpc3RpbmcgcmVhZC1vbmx5IFRvb2xFeGVjdXRvciBjYWxsIHNvXG4gKiAgIHJlc291cmNlIHJlYWQgYW5kIHRvb2xzL2NhbGwgcmV0dXJuIGJ5dGUtaWRlbnRpY2FsIGRhdGEuXG4gKiAtIERvY3MgcmVzb3VyY2VzIHJlYWQgbWFya2Rvd24gZmlsZXMgYXQgcmVxdWVzdCB0aW1lIHNvIHVzZXIgZWRpdHMgdG9cbiAqICAgQ0xBVURFLm1kIC8gZG9jcy8qLm1kIGFyZSByZWZsZWN0ZWQgaW1tZWRpYXRlbHksIG5vIGV4dGVuc2lvbiByZWxvYWQuXG4gKlxuICogVVJJIHByZWZpeCBpcyBgY29jb3M6Ly9gIHRvIGFsaWduIHdpdGggY29jb3MtY2xpIChvZmZpY2lhbCkgYW5kXG4gKiBGdW5wbGF5QUkgKGNsb3Nlc3Qgc2libGluZyBlbWJlZGRlZCBleHRlbnNpb24pLlxuICovXG5cbmV4cG9ydCBpbnRlcmZhY2UgUmVzb3VyY2VEZXNjcmlwdG9yIHtcbiAgICB1cmk6IHN0cmluZztcbiAgICBuYW1lOiBzdHJpbmc7XG4gICAgZGVzY3JpcHRpb246IHN0cmluZztcbiAgICBtaW1lVHlwZTogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJlc291cmNlVGVtcGxhdGVEZXNjcmlwdG9yIHtcbiAgICB1cmlUZW1wbGF0ZTogc3RyaW5nO1xuICAgIG5hbWU6IHN0cmluZztcbiAgICBkZXNjcmlwdGlvbjogc3RyaW5nO1xuICAgIG1pbWVUeXBlOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUmVzb3VyY2VDb250ZW50IHtcbiAgICB1cmk6IHN0cmluZztcbiAgICBtaW1lVHlwZTogc3RyaW5nO1xuICAgIHRleHQ6IHN0cmluZztcbn1cblxuY29uc3QgTUlNRV9KU09OID0gJ2FwcGxpY2F0aW9uL2pzb24nO1xuY29uc3QgTUlNRV9NQVJLRE9XTiA9ICd0ZXh0L21hcmtkb3duJztcblxuLy8gUmVzb2x2ZSB0aGUgZXh0ZW5zaW9uIHJvb3Qgc28gZG9jcyByZXNvdXJjZXMgY2FuIHJlYWQgZnJvbSBkaXNrIHJlZ2FyZGxlc3Ncbi8vIG9mIHdoZXJlIGNvY29zIGluc3RhbGxzIHRoZSBwbHVnaW4uIGRpc3QvcmVzb3VyY2VzL3JlZ2lzdHJ5LmpzIHNpdHMgdHdvXG4vLyBsZXZlbHMgZGVlcCwgc28gYC4uLy4uYCBpcyB0aGUgZXh0ZW5zaW9uIHJvb3QuXG5mdW5jdGlvbiBnZXRFeHRlbnNpb25Sb290KCk6IHN0cmluZyB7XG4gICAgcmV0dXJuIHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsICcuLicsICcuLicpO1xufVxuXG5jb25zdCBTVEFUSUNfUkVTT1VSQ0VTOiBSZXNvdXJjZURlc2NyaXB0b3JbXSA9IFtcbiAgICB7XG4gICAgICAgIHVyaTogJ2NvY29zOi8vc2NlbmUvY3VycmVudCcsXG4gICAgICAgIG5hbWU6ICdDdXJyZW50IHNjZW5lIHN1bW1hcnknLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ0FjdGl2ZSBzY2VuZSByb290IG1ldGFkYXRhOiBuYW1lLCB1dWlkLCB0eXBlLCBhY3RpdmUsIG5vZGVDb3VudC4gQmFja2VkIGJ5IHNjZW5lX2dldF9jdXJyZW50X3NjZW5lLicsXG4gICAgICAgIG1pbWVUeXBlOiBNSU1FX0pTT04sXG4gICAgfSxcbiAgICB7XG4gICAgICAgIHVyaTogJ2NvY29zOi8vc2NlbmUvaGllcmFyY2h5JyxcbiAgICAgICAgbmFtZTogJ1NjZW5lIGhpZXJhcmNoeScsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnRnVsbCBub2RlIGhpZXJhcmNoeSBvZiB0aGUgYWN0aXZlIHNjZW5lLiBDb21wb25lbnQgc3VtbWFyaWVzIG9taXR0ZWQgYnkgZGVmYXVsdDsgdXNlIHRoZSB0b29sIGZvcm0gZm9yIHRoZSBpbmNsdWRlQ29tcG9uZW50cyBmbGFnLiBCYWNrZWQgYnkgc2NlbmVfZ2V0X3NjZW5lX2hpZXJhcmNoeS4nLFxuICAgICAgICBtaW1lVHlwZTogTUlNRV9KU09OLFxuICAgIH0sXG4gICAge1xuICAgICAgICB1cmk6ICdjb2NvczovL3NjZW5lL2xpc3QnLFxuICAgICAgICBuYW1lOiAnUHJvamVjdCBzY2VuZSBsaXN0JyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdBbGwgLnNjZW5lIGFzc2V0cyB1bmRlciBkYjovL2Fzc2V0cy4gQmFja2VkIGJ5IHNjZW5lX2dldF9zY2VuZV9saXN0LicsXG4gICAgICAgIG1pbWVUeXBlOiBNSU1FX0pTT04sXG4gICAgfSxcbiAgICB7XG4gICAgICAgIHVyaTogJ2NvY29zOi8vcHJlZmFicycsXG4gICAgICAgIG5hbWU6ICdQcm9qZWN0IHByZWZhYnMnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ0FsbCAucHJlZmFiIGFzc2V0cyB1bmRlciBkYjovL2Fzc2V0cy4gVXNlIHRoZSBjb2NvczovL3ByZWZhYnN7P2ZvbGRlcn0gdGVtcGxhdGUgdG8gc2NvcGUgdG8gYSBzdWItZm9sZGVyLiBCYWNrZWQgYnkgcHJlZmFiX2dldF9wcmVmYWJfbGlzdC4nLFxuICAgICAgICBtaW1lVHlwZTogTUlNRV9KU09OLFxuICAgIH0sXG4gICAge1xuICAgICAgICB1cmk6ICdjb2NvczovL3Byb2plY3QvaW5mbycsXG4gICAgICAgIG5hbWU6ICdQcm9qZWN0IGluZm8nLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1Byb2plY3QgbmFtZSwgcGF0aCwgdXVpZCwgdmVyc2lvbiBhbmQgQ29jb3MgdmVyc2lvbi4gQmFja2VkIGJ5IHByb2plY3RfZ2V0X3Byb2plY3RfaW5mby4nLFxuICAgICAgICBtaW1lVHlwZTogTUlNRV9KU09OLFxuICAgIH0sXG4gICAge1xuICAgICAgICB1cmk6ICdjb2NvczovL2Fzc2V0cycsXG4gICAgICAgIG5hbWU6ICdQcm9qZWN0IGFzc2V0cycsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnQXNzZXQgbGlzdCB1bmRlciBkYjovL2Fzc2V0cywgYWxsIHR5cGVzLiBVc2UgdGhlIGNvY29zOi8vYXNzZXRzez90eXBlLGZvbGRlcn0gdGVtcGxhdGUgdG8gZmlsdGVyIGJ5IHR5cGUgb3Igc3ViLWZvbGRlci4gQmFja2VkIGJ5IHByb2plY3RfZ2V0X2Fzc2V0cy4nLFxuICAgICAgICBtaW1lVHlwZTogTUlNRV9KU09OLFxuICAgIH0sXG4gICAge1xuICAgICAgICB1cmk6ICdjb2NvczovL2RvY3MvbGFuZG1pbmVzJyxcbiAgICAgICAgbmFtZTogJ0xhbmRtaW5lcyByZWZlcmVuY2UnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1Byb2plY3QgbGFuZG1pbmVzIGxpc3QgZXh0cmFjdGVkIGZyb20gQ0xBVURFLm1kIMKnTGFuZG1pbmVzLiBSZWFkIHRoaXMgd2hlbiBhIHRvb2wgY2FsbCBzdXJwcmlzZXMgeW91IHdpdGggZWRpdG9yLXN0YXRlIGJlaGF2aW91ciDigJQgbW9zdCBzdXJwcmlzZXMgYXJlIGRvY3VtZW50ZWQgYXMgbGFuZG1pbmVzLicsXG4gICAgICAgIG1pbWVUeXBlOiBNSU1FX01BUktET1dOLFxuICAgIH0sXG4gICAge1xuICAgICAgICB1cmk6ICdjb2NvczovL2RvY3MvdG9vbHMnLFxuICAgICAgICBuYW1lOiAnQXV0by1nZW5lcmF0ZWQgdG9vbCByZWZlcmVuY2UnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ2RvY3MvdG9vbHMubWQgZ2VuZXJhdGVkIGZyb20gdGhlIGxpdmUgdG9vbCByZWdpc3RyeS4gQXV0aG9yaXRhdGl2ZSBsaXN0aW5nIG9mIGV2ZXJ5IHRvb2wsIGl0cyBkZXNjcmlwdGlvbiwgYW5kIGl0cyBpbnB1dFNjaGVtYS4nLFxuICAgICAgICBtaW1lVHlwZTogTUlNRV9NQVJLRE9XTixcbiAgICB9LFxuICAgIHtcbiAgICAgICAgdXJpOiAnY29jb3M6Ly9kb2NzL2hhbmRvZmYnLFxuICAgICAgICBuYW1lOiAnU2Vzc2lvbiBoYW5kb2ZmJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdkb2NzL0hBTkRPRkYubWQg4oCUIGN1cnJlbnQgYmFja2xvZywgdmVyc2lvbiBwbGFuIHBvaW50ZXJzLCBlbnZpcm9ubWVudCBjaGVjayBjb21tYW5kcywgcm9sbGJhY2sgYW5jaG9ycy4gUmVhZCB0aGlzIGZvciBwcm9qZWN0IG9yaWVudGF0aW9uLicsXG4gICAgICAgIG1pbWVUeXBlOiBNSU1FX01BUktET1dOLFxuICAgIH0sXG5dO1xuXG5jb25zdCBURU1QTEFURV9SRVNPVVJDRVM6IFJlc291cmNlVGVtcGxhdGVEZXNjcmlwdG9yW10gPSBbXG4gICAge1xuICAgICAgICB1cmlUZW1wbGF0ZTogJ2NvY29zOi8vcHJlZmFic3s/Zm9sZGVyfScsXG4gICAgICAgIG5hbWU6ICdQcmVmYWJzIGluIGZvbGRlcicsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnUHJlZmFiIGxpc3Qgc2NvcGVkIHRvIGEgZGI6Ly8gZm9sZGVyLiBFeGFtcGxlOiBjb2NvczovL3ByZWZhYnM/Zm9sZGVyPWRiOi8vYXNzZXRzL3VpJyxcbiAgICAgICAgbWltZVR5cGU6IE1JTUVfSlNPTixcbiAgICB9LFxuICAgIHtcbiAgICAgICAgdXJpVGVtcGxhdGU6ICdjb2NvczovL2Fzc2V0c3s/dHlwZSxmb2xkZXJ9JyxcbiAgICAgICAgbmFtZTogJ0Fzc2V0cyBieSB0eXBlIGFuZCBmb2xkZXInLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ0Fzc2V0IGxpc3QgZmlsdGVyZWQgYnkgdHlwZSAoYWxsfHNjZW5lfHByZWZhYnxzY3JpcHR8dGV4dHVyZXxtYXRlcmlhbHxtZXNofGF1ZGlvfGFuaW1hdGlvbikgYW5kIGZvbGRlci4gRXhhbXBsZTogY29jb3M6Ly9hc3NldHM/dHlwZT1wcmVmYWImZm9sZGVyPWRiOi8vYXNzZXRzL3VpJyxcbiAgICAgICAgbWltZVR5cGU6IE1JTUVfSlNPTixcbiAgICB9LFxuXTtcblxuaW50ZXJmYWNlIFJlc291cmNlSGFuZGxlciB7XG4gICAgbWltZVR5cGU6IHN0cmluZztcbiAgICAvLyBSZXR1cm5zIHRoZSByYXcgdGV4dCBib2R5IGZvciB0aGUgcmVzb3VyY2UuIENhbGxlciB3cmFwcyBpbnRvIE1DUCBzaGFwZS5cbiAgICBmZXRjaDogKHJlZ2lzdHJ5OiBUb29sUmVnaXN0cnksIHF1ZXJ5OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KSA9PiBQcm9taXNlPHN0cmluZz47XG59XG5cbmNvbnN0IEhBTkRMRVJTOiBSZWNvcmQ8c3RyaW5nLCBSZXNvdXJjZUhhbmRsZXI+ID0ge1xuICAgICdjb2NvczovL3NjZW5lL2N1cnJlbnQnOiB7XG4gICAgICAgIG1pbWVUeXBlOiBNSU1FX0pTT04sXG4gICAgICAgIGZldGNoOiBhc3luYyAocikgPT4gSlNPTi5zdHJpbmdpZnkoYXdhaXQgY2FsbFRvb2wociwgJ3NjZW5lJywgJ2dldF9jdXJyZW50X3NjZW5lJywge30pKSxcbiAgICB9LFxuICAgICdjb2NvczovL3NjZW5lL2hpZXJhcmNoeSc6IHtcbiAgICAgICAgbWltZVR5cGU6IE1JTUVfSlNPTixcbiAgICAgICAgZmV0Y2g6IGFzeW5jIChyKSA9PiBKU09OLnN0cmluZ2lmeShhd2FpdCBjYWxsVG9vbChyLCAnc2NlbmUnLCAnZ2V0X3NjZW5lX2hpZXJhcmNoeScsIHt9KSksXG4gICAgfSxcbiAgICAnY29jb3M6Ly9zY2VuZS9saXN0Jzoge1xuICAgICAgICBtaW1lVHlwZTogTUlNRV9KU09OLFxuICAgICAgICBmZXRjaDogYXN5bmMgKHIpID0+IEpTT04uc3RyaW5naWZ5KGF3YWl0IGNhbGxUb29sKHIsICdzY2VuZScsICdnZXRfc2NlbmVfbGlzdCcsIHt9KSksXG4gICAgfSxcbiAgICAnY29jb3M6Ly9wcmVmYWJzJzoge1xuICAgICAgICBtaW1lVHlwZTogTUlNRV9KU09OLFxuICAgICAgICBmZXRjaDogYXN5bmMgKHIsIHEpID0+IEpTT04uc3RyaW5naWZ5KGF3YWl0IGNhbGxUb29sKHIsICdwcmVmYWInLCAnZ2V0X3ByZWZhYl9saXN0JywgcS5mb2xkZXIgPyB7IGZvbGRlcjogcS5mb2xkZXIgfSA6IHt9KSksXG4gICAgfSxcbiAgICAnY29jb3M6Ly9wcm9qZWN0L2luZm8nOiB7XG4gICAgICAgIG1pbWVUeXBlOiBNSU1FX0pTT04sXG4gICAgICAgIGZldGNoOiBhc3luYyAocikgPT4gSlNPTi5zdHJpbmdpZnkoYXdhaXQgY2FsbFRvb2wociwgJ3Byb2plY3QnLCAnZ2V0X3Byb2plY3RfaW5mbycsIHt9KSksXG4gICAgfSxcbiAgICAnY29jb3M6Ly9hc3NldHMnOiB7XG4gICAgICAgIG1pbWVUeXBlOiBNSU1FX0pTT04sXG4gICAgICAgIGZldGNoOiBhc3luYyAociwgcSkgPT4gSlNPTi5zdHJpbmdpZnkoYXdhaXQgY2FsbFRvb2wociwgJ3Byb2plY3QnLCAnZ2V0X2Fzc2V0cycsIHtcbiAgICAgICAgICAgIC4uLihxLnR5cGUgPyB7IHR5cGU6IHEudHlwZSB9IDoge30pLFxuICAgICAgICAgICAgLi4uKHEuZm9sZGVyID8geyBmb2xkZXI6IHEuZm9sZGVyIH0gOiB7fSksXG4gICAgICAgIH0pKSxcbiAgICB9LFxuICAgICdjb2NvczovL2RvY3MvbGFuZG1pbmVzJzoge1xuICAgICAgICBtaW1lVHlwZTogTUlNRV9NQVJLRE9XTixcbiAgICAgICAgLy8gRXh0cmFjdCBqdXN0IHRoZSDCp0xhbmRtaW5lcyBzZWN0aW9uIGZyb20gQ0xBVURFLm1kIHNvIEFJIGRvZXNuJ3QgZ2V0XG4gICAgICAgIC8vIHVucmVsYXRlZCBjb252ZW50aW9uIGNoYXR0ZXIuIElmIHRoZSBzZWN0aW9uIGhlYWRlciBjaGFuZ2VzIHVwc3RyZWFtLFxuICAgICAgICAvLyBmYWxsIGJhY2sgdG8gd2hvbGUgZmlsZSB3aXRoIGEgbm90ZS5cbiAgICAgICAgZmV0Y2g6IGFzeW5jICgpID0+IHJlYWREb2NzU2VjdGlvbihwYXRoLmpvaW4oZ2V0RXh0ZW5zaW9uUm9vdCgpLCAnQ0xBVURFLm1kJyksICcjIyBMYW5kbWluZXMnKSxcbiAgICB9LFxuICAgICdjb2NvczovL2RvY3MvdG9vbHMnOiB7XG4gICAgICAgIG1pbWVUeXBlOiBNSU1FX01BUktET1dOLFxuICAgICAgICBmZXRjaDogYXN5bmMgKCkgPT4gcmVhZERvY3NGaWxlKHBhdGguam9pbihnZXRFeHRlbnNpb25Sb290KCksICdkb2NzJywgJ3Rvb2xzLm1kJykpLFxuICAgIH0sXG4gICAgJ2NvY29zOi8vZG9jcy9oYW5kb2ZmJzoge1xuICAgICAgICBtaW1lVHlwZTogTUlNRV9NQVJLRE9XTixcbiAgICAgICAgZmV0Y2g6IGFzeW5jICgpID0+IHJlYWREb2NzRmlsZShwYXRoLmpvaW4oZ2V0RXh0ZW5zaW9uUm9vdCgpLCAnZG9jcycsICdIQU5ET0ZGLm1kJykpLFxuICAgIH0sXG59O1xuXG5hc3luYyBmdW5jdGlvbiBjYWxsVG9vbChyZWdpc3RyeTogVG9vbFJlZ2lzdHJ5LCBjYXRlZ29yeTogc3RyaW5nLCB0b29sOiBzdHJpbmcsIGFyZ3M6IGFueSk6IFByb21pc2U8YW55PiB7XG4gICAgY29uc3QgZXhlY3V0b3IgPSByZWdpc3RyeVtjYXRlZ29yeV07XG4gICAgaWYgKCFleGVjdXRvcikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFJlc291cmNlIGJhY2tlbmQgbWlzc2luZzogcmVnaXN0cnkgaGFzIG5vICcke2NhdGVnb3J5fScgY2F0ZWdvcnlgKTtcbiAgICB9XG4gICAgY29uc3QgcmVzcG9uc2U6IFRvb2xSZXNwb25zZSA9IGF3YWl0IGV4ZWN1dG9yLmV4ZWN1dGUodG9vbCwgYXJncyk7XG4gICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLnN1Y2Nlc3MgPT09IGZhbHNlKSB7XG4gICAgICAgIGNvbnN0IG1zZyA9IHJlc3BvbnNlLmVycm9yID8/IHJlc3BvbnNlLm1lc3NhZ2UgPz8gYCR7Y2F0ZWdvcnl9XyR7dG9vbH0gZmFpbGVkYDtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKHR5cGVvZiBtc2cgPT09ICdzdHJpbmcnID8gbXNnIDogSlNPTi5zdHJpbmdpZnkobXNnKSk7XG4gICAgfVxuICAgIHJldHVybiByZXNwb25zZTtcbn1cblxuZnVuY3Rpb24gcmVhZERvY3NGaWxlKGFic1BhdGg6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgaWYgKCFmcy5leGlzdHNTeW5jKGFic1BhdGgpKSB7XG4gICAgICAgIHJldHVybiBgIyBSZXNvdXJjZSB1bmF2YWlsYWJsZVxcblxcbkZpbGUgbm90IGZvdW5kIGF0IGluc3RhbGwgcGF0aDogXFxgJHthYnNQYXRofVxcYFxcblxcblRoZSBkb2NzIHJlc291cmNlIGV4cGVjdGVkIHRoaXMgZmlsZSBhdCB0aGUgZXh0ZW5zaW9uIHJvb3QuIElmIHRoZVxcbmV4dGVuc2lvbiB3YXMgaW5zdGFsbGVkIHdpdGhvdXQgc291cmNlIGZpbGVzLCBmZXRjaCB0aGUgbGF0ZXN0IGZyb21cXG5odHRwczovL2dpdGh1Yi5jb20vYXJuaWUxMTI4L2NvY29zLW1jcC1zZXJ2ZXIuYDtcbiAgICB9XG4gICAgcmV0dXJuIGZzLnJlYWRGaWxlU3luYyhhYnNQYXRoLCAndXRmOCcpO1xufVxuXG5mdW5jdGlvbiByZWFkRG9jc1NlY3Rpb24oYWJzUGF0aDogc3RyaW5nLCBzZWN0aW9uSGVhZGVyOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIGlmICghZnMuZXhpc3RzU3luYyhhYnNQYXRoKSkge1xuICAgICAgICByZXR1cm4gYCMgUmVzb3VyY2UgdW5hdmFpbGFibGVcXG5cXG5GaWxlIG5vdCBmb3VuZCBhdCBpbnN0YWxsIHBhdGg6IFxcYCR7YWJzUGF0aH1cXGAuYDtcbiAgICB9XG4gICAgLy8gU3RyaXAgb3B0aW9uYWwgVVRGLTggQk9NIHRoYXQgc29tZSBlZGl0b3JzIGFkZCB0byBtYXJrZG93biBmaWxlcy5cbiAgICBjb25zdCByYXcgPSBmcy5yZWFkRmlsZVN5bmMoYWJzUGF0aCwgJ3V0ZjgnKTtcbiAgICBjb25zdCBjb250ZW50ID0gcmF3LmNoYXJDb2RlQXQoMCkgPT09IDB4RkVGRiA/IHJhdy5zbGljZSgxKSA6IHJhdztcbiAgICAvLyB2Mi4zLjEgcmV2aWV3IGZpeDogc3BsaXQgb24gQ1JMRiBvciBMRiBzbyBXaW5kb3dzLXNhdmVkIG1hcmtkb3duXG4gICAgLy8gZG9lc24ndCBsZWF2ZSBcXHIgcmVzaWR1ZSBhdCBlbmQgb2YgZXZlcnkgbGluZSBhbmQgY29uZnVzZSB0aGUgc2VjdGlvblxuICAgIC8vIGhlYWRlciBlcXVhbGl0eSBjaGVjayBiZWxvdy5cbiAgICBjb25zdCBsaW5lcyA9IGNvbnRlbnQuc3BsaXQoL1xccj9cXG4vKTtcbiAgICAvLyBNYXRjaCBleGFjdCBoZWFkZXIgb3IgXCIjIyBIZWFkZXIgKC4uLilcIiBmb3JtLiBTZWN0aW9uIGhlYWRlcnMgaW4gQ0xBVURFLm1kXG4gICAgLy8gc29tZXRpbWVzIGNhcnJ5IGEgcGFyZW50aGV0aWNhbCBoaW50IGFmdGVyIHRoZSB0aXRsZSwgZS5nLlxuICAgIC8vIFwiIyMgTGFuZG1pbmVzIChyZWFkIGJlZm9yZSBlZGl0aW5nKVwiLlxuICAgIGNvbnN0IHN0YXJ0SWR4ID0gbGluZXMuZmluZEluZGV4KGwgPT4ge1xuICAgICAgICBjb25zdCB0ID0gbC50cmltKCk7XG4gICAgICAgIHJldHVybiB0ID09PSBzZWN0aW9uSGVhZGVyIHx8IHQuc3RhcnRzV2l0aChzZWN0aW9uSGVhZGVyICsgJyAnKSB8fCB0LnN0YXJ0c1dpdGgoc2VjdGlvbkhlYWRlciArICcoJyk7XG4gICAgfSk7XG4gICAgaWYgKHN0YXJ0SWR4ID09PSAtMSkge1xuICAgICAgICByZXR1cm4gYCMgU2VjdGlvbiBub3QgZm91bmRcXG5cXG5TZWN0aW9uIGhlYWRlciBcXGAke3NlY3Rpb25IZWFkZXJ9XFxgIG5vdCBmb3VuZCBpbiAke3BhdGguYmFzZW5hbWUoYWJzUGF0aCl9LlxcblJldHVybmluZyB3aG9sZSBmaWxlIGFzIGZhbGxiYWNrLlxcblxcbi0tLVxcblxcbiR7Y29udGVudH1gO1xuICAgIH1cbiAgICAvLyBGaW5kIHRoZSBuZXh0IHRvcC1sZXZlbCAoIyMgKSBoZWFkaW5nIGFmdGVyIHRoZSBzZWN0aW9uIGhlYWRlciB0byBib3VuZCBpdC5cbiAgICAvLyBzZWN0aW9uSGVhZGVyIGlzIGxpa2UgXCIjIyBMYW5kbWluZXNcIjsgdGhlIG5leHQgc2libGluZyBoZWFkaW5nIHN0YXJ0cyB3aXRoIFwiIyMgXCIgKDIgaGFzaGVzLCBzcGFjZSkuXG4gICAgbGV0IGVuZElkeCA9IGxpbmVzLmxlbmd0aDtcbiAgICBmb3IgKGxldCBpID0gc3RhcnRJZHggKyAxOyBpIDwgbGluZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKC9eIyNcXHMvLnRlc3QobGluZXNbaV0pKSB7IGVuZElkeCA9IGk7IGJyZWFrOyB9XG4gICAgfVxuICAgIHJldHVybiBsaW5lcy5zbGljZShzdGFydElkeCwgZW5kSWR4KS5qb2luKCdcXG4nKTtcbn1cblxuZXhwb3J0IGNsYXNzIFJlc291cmNlUmVnaXN0cnkge1xuICAgIGNvbnN0cnVjdG9yKHByaXZhdGUgcmVnaXN0cnk6IFRvb2xSZWdpc3RyeSkge31cblxuICAgIGxpc3QoKTogUmVzb3VyY2VEZXNjcmlwdG9yW10ge1xuICAgICAgICByZXR1cm4gU1RBVElDX1JFU09VUkNFUy5zbGljZSgpO1xuICAgIH1cblxuICAgIGxpc3RUZW1wbGF0ZXMoKTogUmVzb3VyY2VUZW1wbGF0ZURlc2NyaXB0b3JbXSB7XG4gICAgICAgIHJldHVybiBURU1QTEFURV9SRVNPVVJDRVMuc2xpY2UoKTtcbiAgICB9XG5cbiAgICBhc3luYyByZWFkKHVyaTogc3RyaW5nKTogUHJvbWlzZTxSZXNvdXJjZUNvbnRlbnQ+IHtcbiAgICAgICAgY29uc3QgeyBiYXNlLCBxdWVyeSB9ID0gcGFyc2VVcmkodXJpKTtcbiAgICAgICAgY29uc3QgaGFuZGxlciA9IEhBTkRMRVJTW2Jhc2VdO1xuICAgICAgICBpZiAoIWhhbmRsZXIpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5rbm93biByZXNvdXJjZSBVUkk6ICR7dXJpfWApO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHRleHQgPSBhd2FpdCBoYW5kbGVyLmZldGNoKHRoaXMucmVnaXN0cnksIHF1ZXJ5KTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHVyaSxcbiAgICAgICAgICAgIG1pbWVUeXBlOiBoYW5kbGVyLm1pbWVUeXBlLFxuICAgICAgICAgICAgdGV4dCxcbiAgICAgICAgfTtcbiAgICB9XG59XG5cbi8vIFN0cmlwIHF1ZXJ5IHN0cmluZyArIGZyYWdtZW50LCByZXR1cm4gYmFzZSBVUkkgZm9yIGhhbmRsZXIgbG9va3VwIHBsdXNcbi8vIHRoZSBwYXJzZWQgcXVlcnkgcGFyYW1zIGZvciBwYXJhbWV0ZXJpemVkIGhhbmRsZXJzLlxuZnVuY3Rpb24gcGFyc2VVcmkodXJpOiBzdHJpbmcpOiB7IGJhc2U6IHN0cmluZzsgcXVlcnk6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gfSB7XG4gICAgY29uc3QgcGFyc2VkID0gdXJsLnBhcnNlKHVyaSwgdHJ1ZSk7XG4gICAgaWYgKCFwYXJzZWQucHJvdG9jb2wgfHwgIXBhcnNlZC5ob3N0KSB7XG4gICAgICAgIHJldHVybiB7IGJhc2U6IHVyaSwgcXVlcnk6IHt9IH07XG4gICAgfVxuICAgIGNvbnN0IGJhc2UgPSBgJHtwYXJzZWQucHJvdG9jb2x9Ly8ke3BhcnNlZC5ob3N0fSR7cGFyc2VkLnBhdGhuYW1lIHx8ICcnfWA7XG4gICAgY29uc3QgcXVlcnk6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcbiAgICBmb3IgKGNvbnN0IFtrLCB2XSBvZiBPYmplY3QuZW50cmllcyhwYXJzZWQucXVlcnkpKSB7XG4gICAgICAgIGlmICh0eXBlb2YgdiA9PT0gJ3N0cmluZycpIHF1ZXJ5W2tdID0gdjtcbiAgICAgICAgZWxzZSBpZiAoQXJyYXkuaXNBcnJheSh2KSAmJiB2Lmxlbmd0aCA+IDApIHF1ZXJ5W2tdID0gdlswXTtcbiAgICB9XG4gICAgcmV0dXJuIHsgYmFzZSwgcXVlcnkgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVJlc291cmNlUmVnaXN0cnkodG9vbFJlZ2lzdHJ5OiBUb29sUmVnaXN0cnkpOiBSZXNvdXJjZVJlZ2lzdHJ5IHtcbiAgICByZXR1cm4gbmV3IFJlc291cmNlUmVnaXN0cnkodG9vbFJlZ2lzdHJ5KTtcbn1cbiJdfQ==