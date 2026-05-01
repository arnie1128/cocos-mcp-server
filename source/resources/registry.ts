import * as url from 'url';
import { ToolRegistry } from '../tools/registry';
import { ToolResponse } from '../types';

/**
 * MCP Resources for cocos-mcp-server.
 *
 * T-P3-1 surface — see docs/research/t-p3-1-prior-art.md and
 * docs/HANDOFF.md §B-2 for design rationale.
 *
 * Each resource is backed by an existing read-only ToolExecutor call.
 * Resource read paths reuse the tool runtime so behaviour stays
 * byte-identical between resource read and tool call (smoke-mcp-sdk.js
 * enforces this with an equivalence check).
 *
 * URI prefix is `cocos://` to align with cocos-cli (official) and
 * FunplayAI (closest sibling embedded extension).
 */

export interface ResourceDescriptor {
    uri: string;
    name: string;
    description: string;
    mimeType: string;
}

export interface ResourceTemplateDescriptor {
    uriTemplate: string;
    name: string;
    description: string;
    mimeType: string;
}

export interface ResourceContent {
    uri: string;
    mimeType: string;
    text: string;
}

const MIME_JSON = 'application/json';

const STATIC_RESOURCES: ResourceDescriptor[] = [
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
];

const TEMPLATE_RESOURCES: ResourceTemplateDescriptor[] = [
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

type Handler = (registry: ToolRegistry, query: Record<string, string>) => Promise<any>;

const HANDLERS: Record<string, Handler> = {
    'cocos://scene/current': (r) => callTool(r, 'scene', 'get_current_scene', {}),
    'cocos://scene/hierarchy': (r) => callTool(r, 'scene', 'get_scene_hierarchy', {}),
    'cocos://scene/list': (r) => callTool(r, 'scene', 'get_scene_list', {}),
    'cocos://prefabs': (r, q) => callTool(r, 'prefab', 'get_prefab_list', q.folder ? { folder: q.folder } : {}),
    'cocos://project/info': (r) => callTool(r, 'project', 'get_project_info', {}),
    'cocos://assets': (r, q) => callTool(r, 'project', 'get_assets', {
        ...(q.type ? { type: q.type } : {}),
        ...(q.folder ? { folder: q.folder } : {}),
    }),
};

async function callTool(registry: ToolRegistry, category: string, tool: string, args: any): Promise<any> {
    const executor = registry[category];
    if (!executor) {
        throw new Error(`Resource backend missing: registry has no '${category}' category`);
    }
    const response: ToolResponse = await executor.execute(tool, args);
    if (response && response.success === false) {
        const msg = response.error ?? response.message ?? `${category}_${tool} failed`;
        throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
    // Return the raw ToolResponse so callers can see data + message; clients
    // mostly care about .data, but keeping the envelope keeps parity with
    // tools/call structuredContent.
    return response;
}

export class ResourceRegistry {
    constructor(private registry: ToolRegistry) {}

    list(): ResourceDescriptor[] {
        return STATIC_RESOURCES.slice();
    }

    listTemplates(): ResourceTemplateDescriptor[] {
        return TEMPLATE_RESOURCES.slice();
    }

    async read(uri: string): Promise<ResourceContent> {
        const { base, query } = parseUri(uri);
        const handler = HANDLERS[base];
        if (!handler) {
            throw new Error(`Unknown resource URI: ${uri}`);
        }
        const data = await handler(this.registry, query);
        return {
            uri,
            mimeType: MIME_JSON,
            text: JSON.stringify(data),
        };
    }
}

// Strip query string + fragment, return base URI for handler lookup plus
// the parsed query params for parameterized handlers.
function parseUri(uri: string): { base: string; query: Record<string, string> } {
    const parsed = url.parse(uri, true);
    // url.parse splits scheme://host/path?q. For cocos://scene/current:
    //   parsed.protocol = 'cocos:'
    //   parsed.host     = 'scene'
    //   parsed.pathname = '/current'
    //   parsed.query    = {}
    // Reconstruct base without query/fragment.
    if (!parsed.protocol || !parsed.host) {
        return { base: uri, query: {} };
    }
    const base = `${parsed.protocol}//${parsed.host}${parsed.pathname || ''}`;
    const query: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed.query)) {
        if (typeof v === 'string') query[k] = v;
        else if (Array.isArray(v) && v.length > 0) query[k] = v[0];
    }
    return { base, query };
}

export function createResourceRegistry(toolRegistry: ToolRegistry): ResourceRegistry {
    return new ResourceRegistry(toolRegistry);
}
