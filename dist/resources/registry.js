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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVnaXN0cnkuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvcmVzb3VyY2VzL3JlZ2lzdHJ5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQXVSQSx3REFFQztBQXpSRCx1Q0FBeUI7QUFDekIsMkNBQTZCO0FBQzdCLHlDQUEyQjtBQXVDM0IsTUFBTSxTQUFTLEdBQUcsa0JBQWtCLENBQUM7QUFDckMsTUFBTSxhQUFhLEdBQUcsZUFBZSxDQUFDO0FBRXRDLDZFQUE2RTtBQUM3RSwwRUFBMEU7QUFDMUUsaURBQWlEO0FBQ2pELFNBQVMsZ0JBQWdCO0lBQ3JCLE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQyxTQUFTLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO0FBQy9DLENBQUM7QUFFRCxNQUFNLGdCQUFnQixHQUF5QjtJQUMzQztRQUNJLEdBQUcsRUFBRSx1QkFBdUI7UUFDNUIsSUFBSSxFQUFFLHVCQUF1QjtRQUM3QixXQUFXLEVBQUUscUdBQXFHO1FBQ2xILFFBQVEsRUFBRSxTQUFTO0tBQ3RCO0lBQ0Q7UUFDSSxHQUFHLEVBQUUseUJBQXlCO1FBQzlCLElBQUksRUFBRSxpQkFBaUI7UUFDdkIsV0FBVyxFQUFFLGdKQUFnSjtRQUM3SixRQUFRLEVBQUUsU0FBUztLQUN0QjtJQUNEO1FBQ0ksR0FBRyxFQUFFLG9CQUFvQjtRQUN6QixJQUFJLEVBQUUsb0JBQW9CO1FBQzFCLFdBQVcsRUFBRSxzRUFBc0U7UUFDbkYsUUFBUSxFQUFFLFNBQVM7S0FDdEI7SUFDRDtRQUNJLEdBQUcsRUFBRSxpQkFBaUI7UUFDdEIsSUFBSSxFQUFFLGlCQUFpQjtRQUN2QixXQUFXLEVBQUUsNklBQTZJO1FBQzFKLFFBQVEsRUFBRSxTQUFTO0tBQ3RCO0lBQ0Q7UUFDSSxHQUFHLEVBQUUsc0JBQXNCO1FBQzNCLElBQUksRUFBRSxjQUFjO1FBQ3BCLFdBQVcsRUFBRSwwRkFBMEY7UUFDdkcsUUFBUSxFQUFFLFNBQVM7S0FDdEI7SUFDRDtRQUNJLEdBQUcsRUFBRSxnQkFBZ0I7UUFDckIsSUFBSSxFQUFFLGdCQUFnQjtRQUN0QixXQUFXLEVBQUUsdUpBQXVKO1FBQ3BLLFFBQVEsRUFBRSxTQUFTO0tBQ3RCO0lBQ0Q7UUFDSSxHQUFHLEVBQUUsd0JBQXdCO1FBQzdCLElBQUksRUFBRSxxQkFBcUI7UUFDM0IsV0FBVyxFQUFFLGdMQUFnTDtRQUM3TCxRQUFRLEVBQUUsYUFBYTtLQUMxQjtJQUNEO1FBQ0ksR0FBRyxFQUFFLG9CQUFvQjtRQUN6QixJQUFJLEVBQUUsK0JBQStCO1FBQ3JDLFdBQVcsRUFBRSxpSUFBaUk7UUFDOUksUUFBUSxFQUFFLGFBQWE7S0FDMUI7SUFDRDtRQUNJLEdBQUcsRUFBRSxzQkFBc0I7UUFDM0IsSUFBSSxFQUFFLGlCQUFpQjtRQUN2QixXQUFXLEVBQUUsNElBQTRJO1FBQ3pKLFFBQVEsRUFBRSxhQUFhO0tBQzFCO0NBQ0osQ0FBQztBQUVGLE1BQU0sa0JBQWtCLEdBQWlDO0lBQ3JEO1FBQ0ksV0FBVyxFQUFFLDBCQUEwQjtRQUN2QyxJQUFJLEVBQUUsbUJBQW1CO1FBQ3pCLFdBQVcsRUFBRSxzRkFBc0Y7UUFDbkcsUUFBUSxFQUFFLFNBQVM7S0FDdEI7SUFDRDtRQUNJLFdBQVcsRUFBRSw4QkFBOEI7UUFDM0MsSUFBSSxFQUFFLDJCQUEyQjtRQUNqQyxXQUFXLEVBQUUsbUtBQW1LO1FBQ2hMLFFBQVEsRUFBRSxTQUFTO0tBQ3RCO0NBQ0osQ0FBQztBQVFGLE1BQU0sUUFBUSxHQUFvQztJQUM5Qyx1QkFBdUIsRUFBRTtRQUNyQixRQUFRLEVBQUUsU0FBUztRQUNuQixLQUFLLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLFFBQVEsQ0FBQyxDQUFDLEVBQUUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLEVBQUUsQ0FBQyxDQUFDO0tBQzFGO0lBQ0QseUJBQXlCLEVBQUU7UUFDdkIsUUFBUSxFQUFFLFNBQVM7UUFDbkIsS0FBSyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxRQUFRLENBQUMsQ0FBQyxFQUFFLE9BQU8sRUFBRSxlQUFlLEVBQUU7WUFDM0UsUUFBUSxFQUFFLENBQUM7WUFDWCxRQUFRLEVBQUUsSUFBSTtZQUNkLFdBQVcsRUFBRSxLQUFLO1NBQ3JCLENBQUMsQ0FBQztLQUNOO0lBQ0Qsb0JBQW9CLEVBQUU7UUFDbEIsUUFBUSxFQUFFLFNBQVM7UUFDbkIsS0FBSyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxRQUFRLENBQUMsQ0FBQyxFQUFFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxFQUFFLENBQUMsQ0FBQztLQUN2RjtJQUNELGlCQUFpQixFQUFFO1FBQ2YsUUFBUSxFQUFFLFNBQVM7UUFDbkIsS0FBSyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sUUFBUSxDQUFDLENBQUMsRUFBRSxRQUFRLEVBQUUsaUJBQWlCLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztLQUM5SDtJQUNELHNCQUFzQixFQUFFO1FBQ3BCLFFBQVEsRUFBRSxTQUFTO1FBQ25CLEtBQUssRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sUUFBUSxDQUFDLENBQUMsRUFBRSxTQUFTLEVBQUUsa0JBQWtCLEVBQUUsRUFBRSxDQUFDLENBQUM7S0FDM0Y7SUFDRCxnQkFBZ0IsRUFBRTtRQUNkLFFBQVEsRUFBRSxTQUFTO1FBQ25CLEtBQUssRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLFFBQVEsQ0FBQyxDQUFDLEVBQUUsU0FBUyxFQUFFLFlBQVksa0NBQ3hFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FDaEMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUMzQyxDQUFDO0tBQ047SUFDRCx3QkFBd0IsRUFBRTtRQUN0QixRQUFRLEVBQUUsYUFBYTtRQUN2Qix1RUFBdUU7UUFDdkUsd0VBQXdFO1FBQ3hFLHVDQUF1QztRQUN2QyxLQUFLLEVBQUUsS0FBSyxJQUFJLEVBQUUsQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxFQUFFLFdBQVcsQ0FBQyxFQUFFLGNBQWMsQ0FBQztLQUNqRztJQUNELG9CQUFvQixFQUFFO1FBQ2xCLFFBQVEsRUFBRSxhQUFhO1FBQ3ZCLEtBQUssRUFBRSxLQUFLLElBQUksRUFBRSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLGdCQUFnQixFQUFFLEVBQUUsTUFBTSxFQUFFLFVBQVUsQ0FBQyxDQUFDO0tBQ3JGO0lBQ0Qsc0JBQXNCLEVBQUU7UUFDcEIsUUFBUSxFQUFFLGFBQWE7UUFDdkIsS0FBSyxFQUFFLEtBQUssSUFBSSxFQUFFLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsRUFBRSxNQUFNLEVBQUUsWUFBWSxDQUFDLENBQUM7S0FDdkY7Q0FDSixDQUFDO0FBRUYsS0FBSyxVQUFVLFFBQVEsQ0FBQyxRQUFzQixFQUFFLFFBQWdCLEVBQUUsSUFBWSxFQUFFLElBQVM7O0lBQ3JGLE1BQU0sUUFBUSxHQUFHLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUNwQyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDWixNQUFNLElBQUksS0FBSyxDQUFDLDhDQUE4QyxRQUFRLFlBQVksQ0FBQyxDQUFDO0lBQ3hGLENBQUM7SUFDRCxNQUFNLFFBQVEsR0FBaUIsTUFBTSxRQUFRLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztJQUNsRSxJQUFJLFFBQVEsSUFBSSxRQUFRLENBQUMsT0FBTyxLQUFLLEtBQUssRUFBRSxDQUFDO1FBQ3pDLE1BQU0sR0FBRyxHQUFHLE1BQUEsTUFBQSxRQUFRLENBQUMsS0FBSyxtQ0FBSSxRQUFRLENBQUMsT0FBTyxtQ0FBSSxHQUFHLFFBQVEsSUFBSSxJQUFJLFNBQVMsQ0FBQztRQUMvRSxNQUFNLElBQUksS0FBSyxDQUFDLE9BQU8sR0FBRyxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDekUsQ0FBQztJQUNELE9BQU8sUUFBUSxDQUFDO0FBQ3BCLENBQUM7QUFFRCxTQUFTLFlBQVksQ0FBQyxPQUFlO0lBQ2pDLElBQUksQ0FBQztRQUNELE9BQU8sRUFBRSxDQUFDLFlBQVksQ0FBQyxPQUFPLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFDNUMsQ0FBQztJQUFDLE9BQU8sQ0FBTSxFQUFFLENBQUM7UUFDZCxJQUFJLENBQUEsQ0FBQyxhQUFELENBQUMsdUJBQUQsQ0FBQyxDQUFFLElBQUksTUFBSyxRQUFRLEVBQUUsQ0FBQztZQUN2QixPQUFPLCtEQUErRCxPQUFPLCtMQUErTCxDQUFDO1FBQ2pSLENBQUM7UUFDRCxNQUFNLENBQUMsQ0FBQztJQUNaLENBQUM7QUFDTCxDQUFDO0FBRUQsU0FBUyxlQUFlLENBQUMsT0FBZSxFQUFFLGFBQXFCO0lBQzNELElBQUksR0FBVyxDQUFDO0lBQ2hCLElBQUksQ0FBQztRQUNELEdBQUcsR0FBRyxFQUFFLENBQUMsWUFBWSxDQUFDLE9BQU8sRUFBRSxNQUFNLENBQUMsQ0FBQztJQUMzQyxDQUFDO0lBQUMsT0FBTyxDQUFNLEVBQUUsQ0FBQztRQUNkLElBQUksQ0FBQSxDQUFDLGFBQUQsQ0FBQyx1QkFBRCxDQUFDLENBQUUsSUFBSSxNQUFLLFFBQVEsRUFBRSxDQUFDO1lBQ3ZCLE9BQU8sK0RBQStELE9BQU8sS0FBSyxDQUFDO1FBQ3ZGLENBQUM7UUFDRCxNQUFNLENBQUMsQ0FBQztJQUNaLENBQUM7SUFDRCxvRUFBb0U7SUFDcEUsTUFBTSxPQUFPLEdBQUcsR0FBRyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsS0FBSyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQztJQUNsRSxtRUFBbUU7SUFDbkUsd0VBQXdFO0lBQ3hFLCtCQUErQjtJQUMvQixNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ3JDLDZFQUE2RTtJQUM3RSw2REFBNkQ7SUFDN0Qsd0NBQXdDO0lBQ3hDLE1BQU0sUUFBUSxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUU7UUFDakMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ25CLE9BQU8sQ0FBQyxLQUFLLGFBQWEsSUFBSSxDQUFDLENBQUMsVUFBVSxDQUFDLGFBQWEsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsVUFBVSxDQUFDLGFBQWEsR0FBRyxHQUFHLENBQUMsQ0FBQztJQUN6RyxDQUFDLENBQUMsQ0FBQztJQUNILElBQUksUUFBUSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUM7UUFDbEIsT0FBTywyQ0FBMkMsYUFBYSxtQkFBbUIsSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsa0RBQWtELE9BQU8sRUFBRSxDQUFDO0lBQ3hLLENBQUM7SUFDRCw4RUFBOEU7SUFDOUUsc0dBQXNHO0lBQ3RHLElBQUksTUFBTSxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUM7SUFDMUIsS0FBSyxJQUFJLENBQUMsR0FBRyxRQUFRLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7UUFDL0MsSUFBSSxPQUFPLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDO1lBQUMsTUFBTTtRQUFDLENBQUM7SUFDdEQsQ0FBQztJQUNELE9BQU8sS0FBSyxDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQ3BELENBQUM7QUFFRCxNQUFhLGdCQUFnQjtJQUN6QixZQUFvQixRQUFzQjtRQUF0QixhQUFRLEdBQVIsUUFBUSxDQUFjO0lBQUcsQ0FBQztJQUU5QyxJQUFJO1FBQ0EsT0FBTyxnQkFBZ0IsQ0FBQyxLQUFLLEVBQUUsQ0FBQztJQUNwQyxDQUFDO0lBRUQsYUFBYTtRQUNULE9BQU8sa0JBQWtCLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDdEMsQ0FBQztJQUVELEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBVztRQUNsQixNQUFNLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUN0QyxNQUFNLE9BQU8sR0FBRyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDL0IsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ1gsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsR0FBRyxFQUFFLENBQUMsQ0FBQztRQUNwRCxDQUFDO1FBQ0QsTUFBTSxJQUFJLEdBQUcsTUFBTSxPQUFPLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDdkQsT0FBTztZQUNILEdBQUc7WUFDSCxRQUFRLEVBQUUsT0FBTyxDQUFDLFFBQVE7WUFDMUIsSUFBSTtTQUNQLENBQUM7SUFDTixDQUFDO0NBQ0o7QUF4QkQsNENBd0JDO0FBRUQseUVBQXlFO0FBQ3pFLHNEQUFzRDtBQUN0RCxTQUFTLFFBQVEsQ0FBQyxHQUFXO0lBQ3pCLE1BQU0sTUFBTSxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ3BDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ25DLE9BQU8sRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxFQUFFLEVBQUUsQ0FBQztJQUNwQyxDQUFDO0lBQ0QsTUFBTSxJQUFJLEdBQUcsR0FBRyxNQUFNLENBQUMsUUFBUSxLQUFLLE1BQU0sQ0FBQyxJQUFJLEdBQUcsTUFBTSxDQUFDLFFBQVEsSUFBSSxFQUFFLEVBQUUsQ0FBQztJQUMxRSxNQUFNLEtBQUssR0FBMkIsRUFBRSxDQUFDO0lBQ3pDLEtBQUssTUFBTSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsSUFBSSxNQUFNLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1FBQ2hELElBQUksT0FBTyxDQUFDLEtBQUssUUFBUTtZQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7YUFDbkMsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLEdBQUcsQ0FBQztZQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDL0QsQ0FBQztJQUNELE9BQU8sRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLENBQUM7QUFDM0IsQ0FBQztBQUVELFNBQWdCLHNCQUFzQixDQUFDLFlBQTBCO0lBQzdELE9BQU8sSUFBSSxnQkFBZ0IsQ0FBQyxZQUFZLENBQUMsQ0FBQztBQUM5QyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCAqIGFzIHVybCBmcm9tICd1cmwnO1xuaW1wb3J0IHsgVG9vbFJlZ2lzdHJ5IH0gZnJvbSAnLi4vdG9vbHMvcmVnaXN0cnknO1xuaW1wb3J0IHsgVG9vbFJlc3BvbnNlIH0gZnJvbSAnLi4vdHlwZXMnO1xuXG4vKipcbiAqIE1DUCBSZXNvdXJjZXMgZm9yIGNvY29zLW1jcC1zZXJ2ZXIuXG4gKlxuICogU3VyZmFjZSDigJQgc2VlIGRvY3MvcmVzZWFyY2gvdC1wMy0xLXByaW9yLWFydC5tZCBhbmRcbiAqIGRvY3Mvcm9hZG1hcC8wNi12ZXJzaW9uLXBsYW4tdjIzLXYyNy5tZCBmb3IgZGVzaWduIHJhdGlvbmFsZS5cbiAqXG4gKiAtIFRvb2wtYmFja2VkIHJlc291cmNlcyByZXVzZSB0aGUgZXhpc3RpbmcgcmVhZC1vbmx5IFRvb2xFeGVjdXRvciBjYWxsIHNvXG4gKiAgIHJlc291cmNlIHJlYWQgYW5kIHRvb2xzL2NhbGwgcmV0dXJuIGJ5dGUtaWRlbnRpY2FsIGRhdGEuXG4gKiAtIERvY3MgcmVzb3VyY2VzIHJlYWQgbWFya2Rvd24gZmlsZXMgYXQgcmVxdWVzdCB0aW1lIHNvIHVzZXIgZWRpdHMgdG9cbiAqICAgQ0xBVURFLm1kIC8gZG9jcy8qLm1kIGFyZSByZWZsZWN0ZWQgaW1tZWRpYXRlbHksIG5vIGV4dGVuc2lvbiByZWxvYWQuXG4gKlxuICogVVJJIHByZWZpeCBpcyBgY29jb3M6Ly9gIHRvIGFsaWduIHdpdGggY29jb3MtY2xpIChvZmZpY2lhbCkgYW5kXG4gKiBGdW5wbGF5QUkgKGNsb3Nlc3Qgc2libGluZyBlbWJlZGRlZCBleHRlbnNpb24pLlxuICovXG5cbmV4cG9ydCBpbnRlcmZhY2UgUmVzb3VyY2VEZXNjcmlwdG9yIHtcbiAgICB1cmk6IHN0cmluZztcbiAgICBuYW1lOiBzdHJpbmc7XG4gICAgZGVzY3JpcHRpb246IHN0cmluZztcbiAgICBtaW1lVHlwZTogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJlc291cmNlVGVtcGxhdGVEZXNjcmlwdG9yIHtcbiAgICB1cmlUZW1wbGF0ZTogc3RyaW5nO1xuICAgIG5hbWU6IHN0cmluZztcbiAgICBkZXNjcmlwdGlvbjogc3RyaW5nO1xuICAgIG1pbWVUeXBlOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUmVzb3VyY2VDb250ZW50IHtcbiAgICB1cmk6IHN0cmluZztcbiAgICBtaW1lVHlwZTogc3RyaW5nO1xuICAgIHRleHQ6IHN0cmluZztcbn1cblxuY29uc3QgTUlNRV9KU09OID0gJ2FwcGxpY2F0aW9uL2pzb24nO1xuY29uc3QgTUlNRV9NQVJLRE9XTiA9ICd0ZXh0L21hcmtkb3duJztcblxuLy8gUmVzb2x2ZSB0aGUgZXh0ZW5zaW9uIHJvb3Qgc28gZG9jcyByZXNvdXJjZXMgY2FuIHJlYWQgZnJvbSBkaXNrIHJlZ2FyZGxlc3Ncbi8vIG9mIHdoZXJlIGNvY29zIGluc3RhbGxzIHRoZSBwbHVnaW4uIGRpc3QvcmVzb3VyY2VzL3JlZ2lzdHJ5LmpzIHNpdHMgdHdvXG4vLyBsZXZlbHMgZGVlcCwgc28gYC4uLy4uYCBpcyB0aGUgZXh0ZW5zaW9uIHJvb3QuXG5mdW5jdGlvbiBnZXRFeHRlbnNpb25Sb290KCk6IHN0cmluZyB7XG4gICAgcmV0dXJuIHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsICcuLicsICcuLicpO1xufVxuXG5jb25zdCBTVEFUSUNfUkVTT1VSQ0VTOiBSZXNvdXJjZURlc2NyaXB0b3JbXSA9IFtcbiAgICB7XG4gICAgICAgIHVyaTogJ2NvY29zOi8vc2NlbmUvY3VycmVudCcsXG4gICAgICAgIG5hbWU6ICdDdXJyZW50IHNjZW5lIHN1bW1hcnknLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ0FjdGl2ZSBzY2VuZSByb290IG1ldGFkYXRhOiBuYW1lLCB1dWlkLCB0eXBlLCBhY3RpdmUsIG5vZGVDb3VudC4gQmFja2VkIGJ5IHNjZW5lX2dldF9jdXJyZW50X3NjZW5lLicsXG4gICAgICAgIG1pbWVUeXBlOiBNSU1FX0pTT04sXG4gICAgfSxcbiAgICB7XG4gICAgICAgIHVyaTogJ2NvY29zOi8vc2NlbmUvaGllcmFyY2h5JyxcbiAgICAgICAgbmFtZTogJ1NjZW5lIGhpZXJhcmNoeScsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnQ2FwcGVkIG5vZGUgaGllcmFyY2h5IG9mIHRoZSBhY3RpdmUgc2NlbmUuIENvbXBvbmVudCB0eXBlIHN1bW1hcmllcyBpbmNsdWRlZDsgYmFja2VkIGJ5IGRlYnVnX2dldF9ub2RlX3RyZWUgd2l0aCBtYXhEZXB0aD04IGFuZCBtYXhOb2Rlcz0yMDAwLicsXG4gICAgICAgIG1pbWVUeXBlOiBNSU1FX0pTT04sXG4gICAgfSxcbiAgICB7XG4gICAgICAgIHVyaTogJ2NvY29zOi8vc2NlbmUvbGlzdCcsXG4gICAgICAgIG5hbWU6ICdQcm9qZWN0IHNjZW5lIGxpc3QnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ0FsbCAuc2NlbmUgYXNzZXRzIHVuZGVyIGRiOi8vYXNzZXRzLiBCYWNrZWQgYnkgc2NlbmVfZ2V0X3NjZW5lX2xpc3QuJyxcbiAgICAgICAgbWltZVR5cGU6IE1JTUVfSlNPTixcbiAgICB9LFxuICAgIHtcbiAgICAgICAgdXJpOiAnY29jb3M6Ly9wcmVmYWJzJyxcbiAgICAgICAgbmFtZTogJ1Byb2plY3QgcHJlZmFicycsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnQWxsIC5wcmVmYWIgYXNzZXRzIHVuZGVyIGRiOi8vYXNzZXRzLiBVc2UgdGhlIGNvY29zOi8vcHJlZmFic3s/Zm9sZGVyfSB0ZW1wbGF0ZSB0byBzY29wZSB0byBhIHN1Yi1mb2xkZXIuIEJhY2tlZCBieSBwcmVmYWJfZ2V0X3ByZWZhYl9saXN0LicsXG4gICAgICAgIG1pbWVUeXBlOiBNSU1FX0pTT04sXG4gICAgfSxcbiAgICB7XG4gICAgICAgIHVyaTogJ2NvY29zOi8vcHJvamVjdC9pbmZvJyxcbiAgICAgICAgbmFtZTogJ1Byb2plY3QgaW5mbycsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnUHJvamVjdCBuYW1lLCBwYXRoLCB1dWlkLCB2ZXJzaW9uIGFuZCBDb2NvcyB2ZXJzaW9uLiBCYWNrZWQgYnkgcHJvamVjdF9nZXRfcHJvamVjdF9pbmZvLicsXG4gICAgICAgIG1pbWVUeXBlOiBNSU1FX0pTT04sXG4gICAgfSxcbiAgICB7XG4gICAgICAgIHVyaTogJ2NvY29zOi8vYXNzZXRzJyxcbiAgICAgICAgbmFtZTogJ1Byb2plY3QgYXNzZXRzJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdBc3NldCBsaXN0IHVuZGVyIGRiOi8vYXNzZXRzLCBhbGwgdHlwZXMuIFVzZSB0aGUgY29jb3M6Ly9hc3NldHN7P3R5cGUsZm9sZGVyfSB0ZW1wbGF0ZSB0byBmaWx0ZXIgYnkgdHlwZSBvciBzdWItZm9sZGVyLiBCYWNrZWQgYnkgcHJvamVjdF9nZXRfYXNzZXRzLicsXG4gICAgICAgIG1pbWVUeXBlOiBNSU1FX0pTT04sXG4gICAgfSxcbiAgICB7XG4gICAgICAgIHVyaTogJ2NvY29zOi8vZG9jcy9sYW5kbWluZXMnLFxuICAgICAgICBuYW1lOiAnTGFuZG1pbmVzIHJlZmVyZW5jZScsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnUHJvamVjdCBsYW5kbWluZXMgbGlzdCBleHRyYWN0ZWQgZnJvbSBDTEFVREUubWQgwqdMYW5kbWluZXMuIFJlYWQgdGhpcyB3aGVuIGEgdG9vbCBjYWxsIHN1cnByaXNlcyB5b3Ugd2l0aCBlZGl0b3Itc3RhdGUgYmVoYXZpb3VyIOKAlCBtb3N0IHN1cnByaXNlcyBhcmUgZG9jdW1lbnRlZCBhcyBsYW5kbWluZXMuJyxcbiAgICAgICAgbWltZVR5cGU6IE1JTUVfTUFSS0RPV04sXG4gICAgfSxcbiAgICB7XG4gICAgICAgIHVyaTogJ2NvY29zOi8vZG9jcy90b29scycsXG4gICAgICAgIG5hbWU6ICdBdXRvLWdlbmVyYXRlZCB0b29sIHJlZmVyZW5jZScsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnZG9jcy90b29scy5tZCBnZW5lcmF0ZWQgZnJvbSB0aGUgbGl2ZSB0b29sIHJlZ2lzdHJ5LiBBdXRob3JpdGF0aXZlIGxpc3Rpbmcgb2YgZXZlcnkgdG9vbCwgaXRzIGRlc2NyaXB0aW9uLCBhbmQgaXRzIGlucHV0U2NoZW1hLicsXG4gICAgICAgIG1pbWVUeXBlOiBNSU1FX01BUktET1dOLFxuICAgIH0sXG4gICAge1xuICAgICAgICB1cmk6ICdjb2NvczovL2RvY3MvaGFuZG9mZicsXG4gICAgICAgIG5hbWU6ICdTZXNzaW9uIGhhbmRvZmYnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ2RvY3MvSEFORE9GRi5tZCDigJQgY3VycmVudCBiYWNrbG9nLCB2ZXJzaW9uIHBsYW4gcG9pbnRlcnMsIGVudmlyb25tZW50IGNoZWNrIGNvbW1hbmRzLCByb2xsYmFjayBhbmNob3JzLiBSZWFkIHRoaXMgZm9yIHByb2plY3Qgb3JpZW50YXRpb24uJyxcbiAgICAgICAgbWltZVR5cGU6IE1JTUVfTUFSS0RPV04sXG4gICAgfSxcbl07XG5cbmNvbnN0IFRFTVBMQVRFX1JFU09VUkNFUzogUmVzb3VyY2VUZW1wbGF0ZURlc2NyaXB0b3JbXSA9IFtcbiAgICB7XG4gICAgICAgIHVyaVRlbXBsYXRlOiAnY29jb3M6Ly9wcmVmYWJzez9mb2xkZXJ9JyxcbiAgICAgICAgbmFtZTogJ1ByZWZhYnMgaW4gZm9sZGVyJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdQcmVmYWIgbGlzdCBzY29wZWQgdG8gYSBkYjovLyBmb2xkZXIuIEV4YW1wbGU6IGNvY29zOi8vcHJlZmFicz9mb2xkZXI9ZGI6Ly9hc3NldHMvdWknLFxuICAgICAgICBtaW1lVHlwZTogTUlNRV9KU09OLFxuICAgIH0sXG4gICAge1xuICAgICAgICB1cmlUZW1wbGF0ZTogJ2NvY29zOi8vYXNzZXRzez90eXBlLGZvbGRlcn0nLFxuICAgICAgICBuYW1lOiAnQXNzZXRzIGJ5IHR5cGUgYW5kIGZvbGRlcicsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnQXNzZXQgbGlzdCBmaWx0ZXJlZCBieSB0eXBlIChhbGx8c2NlbmV8cHJlZmFifHNjcmlwdHx0ZXh0dXJlfG1hdGVyaWFsfG1lc2h8YXVkaW98YW5pbWF0aW9uKSBhbmQgZm9sZGVyLiBFeGFtcGxlOiBjb2NvczovL2Fzc2V0cz90eXBlPXByZWZhYiZmb2xkZXI9ZGI6Ly9hc3NldHMvdWknLFxuICAgICAgICBtaW1lVHlwZTogTUlNRV9KU09OLFxuICAgIH0sXG5dO1xuXG5pbnRlcmZhY2UgUmVzb3VyY2VIYW5kbGVyIHtcbiAgICBtaW1lVHlwZTogc3RyaW5nO1xuICAgIC8vIFJldHVybnMgdGhlIHJhdyB0ZXh0IGJvZHkgZm9yIHRoZSByZXNvdXJjZS4gQ2FsbGVyIHdyYXBzIGludG8gTUNQIHNoYXBlLlxuICAgIGZldGNoOiAocmVnaXN0cnk6IFRvb2xSZWdpc3RyeSwgcXVlcnk6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4pID0+IFByb21pc2U8c3RyaW5nPjtcbn1cblxuY29uc3QgSEFORExFUlM6IFJlY29yZDxzdHJpbmcsIFJlc291cmNlSGFuZGxlcj4gPSB7XG4gICAgJ2NvY29zOi8vc2NlbmUvY3VycmVudCc6IHtcbiAgICAgICAgbWltZVR5cGU6IE1JTUVfSlNPTixcbiAgICAgICAgZmV0Y2g6IGFzeW5jIChyKSA9PiBKU09OLnN0cmluZ2lmeShhd2FpdCBjYWxsVG9vbChyLCAnc2NlbmUnLCAnZ2V0X2N1cnJlbnRfc2NlbmUnLCB7fSkpLFxuICAgIH0sXG4gICAgJ2NvY29zOi8vc2NlbmUvaGllcmFyY2h5Jzoge1xuICAgICAgICBtaW1lVHlwZTogTUlNRV9KU09OLFxuICAgICAgICBmZXRjaDogYXN5bmMgKHIpID0+IEpTT04uc3RyaW5naWZ5KGF3YWl0IGNhbGxUb29sKHIsICdkZWJ1ZycsICdnZXRfbm9kZV90cmVlJywge1xuICAgICAgICAgICAgbWF4RGVwdGg6IDgsXG4gICAgICAgICAgICBtYXhOb2RlczogMjAwMCxcbiAgICAgICAgICAgIHN1bW1hcnlPbmx5OiBmYWxzZSxcbiAgICAgICAgfSkpLFxuICAgIH0sXG4gICAgJ2NvY29zOi8vc2NlbmUvbGlzdCc6IHtcbiAgICAgICAgbWltZVR5cGU6IE1JTUVfSlNPTixcbiAgICAgICAgZmV0Y2g6IGFzeW5jIChyKSA9PiBKU09OLnN0cmluZ2lmeShhd2FpdCBjYWxsVG9vbChyLCAnc2NlbmUnLCAnZ2V0X3NjZW5lX2xpc3QnLCB7fSkpLFxuICAgIH0sXG4gICAgJ2NvY29zOi8vcHJlZmFicyc6IHtcbiAgICAgICAgbWltZVR5cGU6IE1JTUVfSlNPTixcbiAgICAgICAgZmV0Y2g6IGFzeW5jIChyLCBxKSA9PiBKU09OLnN0cmluZ2lmeShhd2FpdCBjYWxsVG9vbChyLCAncHJlZmFiJywgJ2dldF9wcmVmYWJfbGlzdCcsIHEuZm9sZGVyID8geyBmb2xkZXI6IHEuZm9sZGVyIH0gOiB7fSkpLFxuICAgIH0sXG4gICAgJ2NvY29zOi8vcHJvamVjdC9pbmZvJzoge1xuICAgICAgICBtaW1lVHlwZTogTUlNRV9KU09OLFxuICAgICAgICBmZXRjaDogYXN5bmMgKHIpID0+IEpTT04uc3RyaW5naWZ5KGF3YWl0IGNhbGxUb29sKHIsICdwcm9qZWN0JywgJ2dldF9wcm9qZWN0X2luZm8nLCB7fSkpLFxuICAgIH0sXG4gICAgJ2NvY29zOi8vYXNzZXRzJzoge1xuICAgICAgICBtaW1lVHlwZTogTUlNRV9KU09OLFxuICAgICAgICBmZXRjaDogYXN5bmMgKHIsIHEpID0+IEpTT04uc3RyaW5naWZ5KGF3YWl0IGNhbGxUb29sKHIsICdwcm9qZWN0JywgJ2dldF9hc3NldHMnLCB7XG4gICAgICAgICAgICAuLi4ocS50eXBlID8geyB0eXBlOiBxLnR5cGUgfSA6IHt9KSxcbiAgICAgICAgICAgIC4uLihxLmZvbGRlciA/IHsgZm9sZGVyOiBxLmZvbGRlciB9IDoge30pLFxuICAgICAgICB9KSksXG4gICAgfSxcbiAgICAnY29jb3M6Ly9kb2NzL2xhbmRtaW5lcyc6IHtcbiAgICAgICAgbWltZVR5cGU6IE1JTUVfTUFSS0RPV04sXG4gICAgICAgIC8vIEV4dHJhY3QganVzdCB0aGUgwqdMYW5kbWluZXMgc2VjdGlvbiBmcm9tIENMQVVERS5tZCBzbyBBSSBkb2Vzbid0IGdldFxuICAgICAgICAvLyB1bnJlbGF0ZWQgY29udmVudGlvbiBjaGF0dGVyLiBJZiB0aGUgc2VjdGlvbiBoZWFkZXIgY2hhbmdlcyB1cHN0cmVhbSxcbiAgICAgICAgLy8gZmFsbCBiYWNrIHRvIHdob2xlIGZpbGUgd2l0aCBhIG5vdGUuXG4gICAgICAgIGZldGNoOiBhc3luYyAoKSA9PiByZWFkRG9jc1NlY3Rpb24ocGF0aC5qb2luKGdldEV4dGVuc2lvblJvb3QoKSwgJ0NMQVVERS5tZCcpLCAnIyMgTGFuZG1pbmVzJyksXG4gICAgfSxcbiAgICAnY29jb3M6Ly9kb2NzL3Rvb2xzJzoge1xuICAgICAgICBtaW1lVHlwZTogTUlNRV9NQVJLRE9XTixcbiAgICAgICAgZmV0Y2g6IGFzeW5jICgpID0+IHJlYWREb2NzRmlsZShwYXRoLmpvaW4oZ2V0RXh0ZW5zaW9uUm9vdCgpLCAnZG9jcycsICd0b29scy5tZCcpKSxcbiAgICB9LFxuICAgICdjb2NvczovL2RvY3MvaGFuZG9mZic6IHtcbiAgICAgICAgbWltZVR5cGU6IE1JTUVfTUFSS0RPV04sXG4gICAgICAgIGZldGNoOiBhc3luYyAoKSA9PiByZWFkRG9jc0ZpbGUocGF0aC5qb2luKGdldEV4dGVuc2lvblJvb3QoKSwgJ2RvY3MnLCAnSEFORE9GRi5tZCcpKSxcbiAgICB9LFxufTtcblxuYXN5bmMgZnVuY3Rpb24gY2FsbFRvb2wocmVnaXN0cnk6IFRvb2xSZWdpc3RyeSwgY2F0ZWdvcnk6IHN0cmluZywgdG9vbDogc3RyaW5nLCBhcmdzOiBhbnkpOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IGV4ZWN1dG9yID0gcmVnaXN0cnlbY2F0ZWdvcnldO1xuICAgIGlmICghZXhlY3V0b3IpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBSZXNvdXJjZSBiYWNrZW5kIG1pc3Npbmc6IHJlZ2lzdHJ5IGhhcyBubyAnJHtjYXRlZ29yeX0nIGNhdGVnb3J5YCk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3BvbnNlOiBUb29sUmVzcG9uc2UgPSBhd2FpdCBleGVjdXRvci5leGVjdXRlKHRvb2wsIGFyZ3MpO1xuICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5zdWNjZXNzID09PSBmYWxzZSkge1xuICAgICAgICBjb25zdCBtc2cgPSByZXNwb25zZS5lcnJvciA/PyByZXNwb25zZS5tZXNzYWdlID8/IGAke2NhdGVnb3J5fV8ke3Rvb2x9IGZhaWxlZGA7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcih0eXBlb2YgbXNnID09PSAnc3RyaW5nJyA/IG1zZyA6IEpTT04uc3RyaW5naWZ5KG1zZykpO1xuICAgIH1cbiAgICByZXR1cm4gcmVzcG9uc2U7XG59XG5cbmZ1bmN0aW9uIHJlYWREb2NzRmlsZShhYnNQYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIHRyeSB7XG4gICAgICAgIHJldHVybiBmcy5yZWFkRmlsZVN5bmMoYWJzUGF0aCwgJ3V0ZjgnKTtcbiAgICB9IGNhdGNoIChlOiBhbnkpIHtcbiAgICAgICAgaWYgKGU/LmNvZGUgPT09ICdFTk9FTlQnKSB7XG4gICAgICAgICAgICByZXR1cm4gYCMgUmVzb3VyY2UgdW5hdmFpbGFibGVcXG5cXG5GaWxlIG5vdCBmb3VuZCBhdCBpbnN0YWxsIHBhdGg6IFxcYCR7YWJzUGF0aH1cXGBcXG5cXG5UaGUgZG9jcyByZXNvdXJjZSBleHBlY3RlZCB0aGlzIGZpbGUgYXQgdGhlIGV4dGVuc2lvbiByb290LiBJZiB0aGVcXG5leHRlbnNpb24gd2FzIGluc3RhbGxlZCB3aXRob3V0IHNvdXJjZSBmaWxlcywgZmV0Y2ggdGhlIGxhdGVzdCBmcm9tXFxuaHR0cHM6Ly9naXRodWIuY29tL2FybmllMTEyOC9jb2Nvcy1tY3Atc2VydmVyLmA7XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHJlYWREb2NzU2VjdGlvbihhYnNQYXRoOiBzdHJpbmcsIHNlY3Rpb25IZWFkZXI6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgbGV0IHJhdzogc3RyaW5nO1xuICAgIHRyeSB7XG4gICAgICAgIHJhdyA9IGZzLnJlYWRGaWxlU3luYyhhYnNQYXRoLCAndXRmOCcpO1xuICAgIH0gY2F0Y2ggKGU6IGFueSkge1xuICAgICAgICBpZiAoZT8uY29kZSA9PT0gJ0VOT0VOVCcpIHtcbiAgICAgICAgICAgIHJldHVybiBgIyBSZXNvdXJjZSB1bmF2YWlsYWJsZVxcblxcbkZpbGUgbm90IGZvdW5kIGF0IGluc3RhbGwgcGF0aDogXFxgJHthYnNQYXRofVxcYC5gO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGU7XG4gICAgfVxuICAgIC8vIFN0cmlwIG9wdGlvbmFsIFVURi04IEJPTSB0aGF0IHNvbWUgZWRpdG9ycyBhZGQgdG8gbWFya2Rvd24gZmlsZXMuXG4gICAgY29uc3QgY29udGVudCA9IHJhdy5jaGFyQ29kZUF0KDApID09PSAweEZFRkYgPyByYXcuc2xpY2UoMSkgOiByYXc7XG4gICAgLy8gdjIuMy4xIHJldmlldyBmaXg6IHNwbGl0IG9uIENSTEYgb3IgTEYgc28gV2luZG93cy1zYXZlZCBtYXJrZG93blxuICAgIC8vIGRvZXNuJ3QgbGVhdmUgXFxyIHJlc2lkdWUgYXQgZW5kIG9mIGV2ZXJ5IGxpbmUgYW5kIGNvbmZ1c2UgdGhlIHNlY3Rpb25cbiAgICAvLyBoZWFkZXIgZXF1YWxpdHkgY2hlY2sgYmVsb3cuXG4gICAgY29uc3QgbGluZXMgPSBjb250ZW50LnNwbGl0KC9cXHI/XFxuLyk7XG4gICAgLy8gTWF0Y2ggZXhhY3QgaGVhZGVyIG9yIFwiIyMgSGVhZGVyICguLi4pXCIgZm9ybS4gU2VjdGlvbiBoZWFkZXJzIGluIENMQVVERS5tZFxuICAgIC8vIHNvbWV0aW1lcyBjYXJyeSBhIHBhcmVudGhldGljYWwgaGludCBhZnRlciB0aGUgdGl0bGUsIGUuZy5cbiAgICAvLyBcIiMjIExhbmRtaW5lcyAocmVhZCBiZWZvcmUgZWRpdGluZylcIi5cbiAgICBjb25zdCBzdGFydElkeCA9IGxpbmVzLmZpbmRJbmRleChsID0+IHtcbiAgICAgICAgY29uc3QgdCA9IGwudHJpbSgpO1xuICAgICAgICByZXR1cm4gdCA9PT0gc2VjdGlvbkhlYWRlciB8fCB0LnN0YXJ0c1dpdGgoc2VjdGlvbkhlYWRlciArICcgJykgfHwgdC5zdGFydHNXaXRoKHNlY3Rpb25IZWFkZXIgKyAnKCcpO1xuICAgIH0pO1xuICAgIGlmIChzdGFydElkeCA9PT0gLTEpIHtcbiAgICAgICAgcmV0dXJuIGAjIFNlY3Rpb24gbm90IGZvdW5kXFxuXFxuU2VjdGlvbiBoZWFkZXIgXFxgJHtzZWN0aW9uSGVhZGVyfVxcYCBub3QgZm91bmQgaW4gJHtwYXRoLmJhc2VuYW1lKGFic1BhdGgpfS5cXG5SZXR1cm5pbmcgd2hvbGUgZmlsZSBhcyBmYWxsYmFjay5cXG5cXG4tLS1cXG5cXG4ke2NvbnRlbnR9YDtcbiAgICB9XG4gICAgLy8gRmluZCB0aGUgbmV4dCB0b3AtbGV2ZWwgKCMjICkgaGVhZGluZyBhZnRlciB0aGUgc2VjdGlvbiBoZWFkZXIgdG8gYm91bmQgaXQuXG4gICAgLy8gc2VjdGlvbkhlYWRlciBpcyBsaWtlIFwiIyMgTGFuZG1pbmVzXCI7IHRoZSBuZXh0IHNpYmxpbmcgaGVhZGluZyBzdGFydHMgd2l0aCBcIiMjIFwiICgyIGhhc2hlcywgc3BhY2UpLlxuICAgIGxldCBlbmRJZHggPSBsaW5lcy5sZW5ndGg7XG4gICAgZm9yIChsZXQgaSA9IHN0YXJ0SWR4ICsgMTsgaSA8IGxpbmVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmICgvXiMjXFxzLy50ZXN0KGxpbmVzW2ldKSkgeyBlbmRJZHggPSBpOyBicmVhazsgfVxuICAgIH1cbiAgICByZXR1cm4gbGluZXMuc2xpY2Uoc3RhcnRJZHgsIGVuZElkeCkuam9pbignXFxuJyk7XG59XG5cbmV4cG9ydCBjbGFzcyBSZXNvdXJjZVJlZ2lzdHJ5IHtcbiAgICBjb25zdHJ1Y3Rvcihwcml2YXRlIHJlZ2lzdHJ5OiBUb29sUmVnaXN0cnkpIHt9XG5cbiAgICBsaXN0KCk6IFJlc291cmNlRGVzY3JpcHRvcltdIHtcbiAgICAgICAgcmV0dXJuIFNUQVRJQ19SRVNPVVJDRVMuc2xpY2UoKTtcbiAgICB9XG5cbiAgICBsaXN0VGVtcGxhdGVzKCk6IFJlc291cmNlVGVtcGxhdGVEZXNjcmlwdG9yW10ge1xuICAgICAgICByZXR1cm4gVEVNUExBVEVfUkVTT1VSQ0VTLnNsaWNlKCk7XG4gICAgfVxuXG4gICAgYXN5bmMgcmVhZCh1cmk6IHN0cmluZyk6IFByb21pc2U8UmVzb3VyY2VDb250ZW50PiB7XG4gICAgICAgIGNvbnN0IHsgYmFzZSwgcXVlcnkgfSA9IHBhcnNlVXJpKHVyaSk7XG4gICAgICAgIGNvbnN0IGhhbmRsZXIgPSBIQU5ETEVSU1tiYXNlXTtcbiAgICAgICAgaWYgKCFoYW5kbGVyKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gcmVzb3VyY2UgVVJJOiAke3VyaX1gKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCB0ZXh0ID0gYXdhaXQgaGFuZGxlci5mZXRjaCh0aGlzLnJlZ2lzdHJ5LCBxdWVyeSk7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICB1cmksXG4gICAgICAgICAgICBtaW1lVHlwZTogaGFuZGxlci5taW1lVHlwZSxcbiAgICAgICAgICAgIHRleHQsXG4gICAgICAgIH07XG4gICAgfVxufVxuXG4vLyBTdHJpcCBxdWVyeSBzdHJpbmcgKyBmcmFnbWVudCwgcmV0dXJuIGJhc2UgVVJJIGZvciBoYW5kbGVyIGxvb2t1cCBwbHVzXG4vLyB0aGUgcGFyc2VkIHF1ZXJ5IHBhcmFtcyBmb3IgcGFyYW1ldGVyaXplZCBoYW5kbGVycy5cbmZ1bmN0aW9uIHBhcnNlVXJpKHVyaTogc3RyaW5nKTogeyBiYXNlOiBzdHJpbmc7IHF1ZXJ5OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+IH0ge1xuICAgIGNvbnN0IHBhcnNlZCA9IHVybC5wYXJzZSh1cmksIHRydWUpO1xuICAgIGlmICghcGFyc2VkLnByb3RvY29sIHx8ICFwYXJzZWQuaG9zdCkge1xuICAgICAgICByZXR1cm4geyBiYXNlOiB1cmksIHF1ZXJ5OiB7fSB9O1xuICAgIH1cbiAgICBjb25zdCBiYXNlID0gYCR7cGFyc2VkLnByb3RvY29sfS8vJHtwYXJzZWQuaG9zdH0ke3BhcnNlZC5wYXRobmFtZSB8fCAnJ31gO1xuICAgIGNvbnN0IHF1ZXJ5OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge307XG4gICAgZm9yIChjb25zdCBbaywgdl0gb2YgT2JqZWN0LmVudHJpZXMocGFyc2VkLnF1ZXJ5KSkge1xuICAgICAgICBpZiAodHlwZW9mIHYgPT09ICdzdHJpbmcnKSBxdWVyeVtrXSA9IHY7XG4gICAgICAgIGVsc2UgaWYgKEFycmF5LmlzQXJyYXkodikgJiYgdi5sZW5ndGggPiAwKSBxdWVyeVtrXSA9IHZbMF07XG4gICAgfVxuICAgIHJldHVybiB7IGJhc2UsIHF1ZXJ5IH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVSZXNvdXJjZVJlZ2lzdHJ5KHRvb2xSZWdpc3RyeTogVG9vbFJlZ2lzdHJ5KTogUmVzb3VyY2VSZWdpc3RyeSB7XG4gICAgcmV0dXJuIG5ldyBSZXNvdXJjZVJlZ2lzdHJ5KHRvb2xSZWdpc3RyeSk7XG59XG4iXX0=