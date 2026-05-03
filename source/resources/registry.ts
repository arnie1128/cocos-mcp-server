import * as fs from 'fs';
import * as path from 'path';
import * as url from 'url';
import { ToolRegistry } from '../tools/registry';
import { ToolResponse } from '../types';

/**
 * MCP Resources for cocos-mcp-server.
 *
 * Surface — see docs/archive/research/t-p3-1-prior-art.md and
 * docs/roadmap/06-version-plan-v23-v27.md for design rationale.
 *
 * - Tool-backed resources reuse the existing read-only ToolExecutor call so
 *   resource read and tools/call return byte-identical data.
 * - Docs resources read markdown files at request time so user edits to
 *   CLAUDE.md / docs/*.md are reflected immediately, no extension reload.
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
const MIME_MARKDOWN = 'text/markdown';

// Resolve the extension root so docs resources can read from disk regardless
// of where cocos installs the plugin. dist/resources/registry.js sits two
// levels deep, so `../..` is the extension root.
function getExtensionRoot(): string {
    return path.resolve(__dirname, '..', '..');
}

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

interface ResourceHandler {
    mimeType: string;
    // Returns the raw text body for the resource. Caller wraps into MCP shape.
    fetch: (registry: ToolRegistry, query: Record<string, string>) => Promise<string>;
}

const HANDLERS: Record<string, ResourceHandler> = {
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
        fetch: async (r, q) => JSON.stringify(await callTool(r, 'project', 'get_assets', {
            ...(q.type ? { type: q.type } : {}),
            ...(q.folder ? { folder: q.folder } : {}),
        })),
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
    return response;
}

function readDocsFile(absPath: string): string {
    try {
        return fs.readFileSync(absPath, 'utf8');
    } catch (e: any) {
        if (e?.code === 'ENOENT') {
            return `# Resource unavailable\n\nFile not found at install path: \`${absPath}\`\n\nThe docs resource expected this file at the extension root. If the\nextension was installed without source files, fetch the latest from\nhttps://github.com/arnie1128/cocos-mcp-server.`;
        }
        throw e;
    }
}

function readDocsSection(absPath: string, sectionHeader: string): string {
    let raw: string;
    try {
        raw = fs.readFileSync(absPath, 'utf8');
    } catch (e: any) {
        if (e?.code === 'ENOENT') {
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
        if (/^##\s/.test(lines[i])) { endIdx = i; break; }
    }
    return lines.slice(startIdx, endIdx).join('\n');
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
        const text = await handler.fetch(this.registry, query);
        return {
            uri,
            mimeType: handler.mimeType,
            text,
        };
    }
}

// Strip query string + fragment, return base URI for handler lookup plus
// the parsed query params for parameterized handlers.
function parseUri(uri: string): { base: string; query: Record<string, string> } {
    const parsed = url.parse(uri, true);
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
