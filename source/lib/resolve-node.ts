/**
 * resolve-node — accept either `nodeUuid` (precise) or `nodeName` (fuzzy)
 * and return a concrete UUID. Lets AI clients drive scene-mutating tools
 * without first calling find_node_by_name when names are unique enough.
 *
 * Resolution rule:
 *   1. If `nodeUuid` is provided, it wins (no scene query).
 *   2. Otherwise, walk `scene/query-node-tree` depth-first and return
 *      the first node whose `name` matches `nodeName` exactly.
 *
 * Failure cases return an error string the caller can surface as a
 * ToolResponse — they do NOT throw, so handlers can fail cleanly.
 *
 * Cocos `query-node-tree` returns plain `{uuid, name, children}`
 * objects (not the dump shape used by `query-node`), so name lookups
 * here are fast and don't need property unwrapping.
 *
 * cocos-creator-mcp (harady) uses an equivalent fallback ladder; see
 * docs/research/repos/cocos-creator-mcp.md §3 ("uuid / nodeName 二選一").
 */

import { z } from './schema';
import type { ToolResponse } from '../types';

/**
 * Zod schema fragment that adds nodeName as a sibling of nodeUuid.
 * Spread into a tool's input schema:
 *
 *   z.object({
 *       ...nodeReferenceShape,
 *       property: z.string(),
 *   })
 *
 * Both fields are optional at the schema level — `resolveNodeUuid`
 * checks at runtime that exactly one is provided.
 */
export const nodeReferenceShape = {
    nodeUuid: z.string().optional().describe('Target node UUID. Provide this OR nodeName (UUID wins when both are set).'),
    nodeName: z.string().optional().describe('Target node name; resolved by depth-first scan of the current scene. Use only when the name is unique. Ignored if nodeUuid is set.'),
} as const;

export interface NodeReference {
    nodeUuid?: string;
    nodeName?: string;
}

export type NodeResolution = { uuid: string } | { error: string };

export async function resolveNodeUuid(ref: NodeReference): Promise<NodeResolution> {
    if (ref.nodeUuid) {
        return { uuid: ref.nodeUuid };
    }
    if (!ref.nodeName) {
        return { error: 'resolve-node: provide nodeUuid or nodeName' };
    }
    try {
        const tree: any = await Editor.Message.request('scene', 'query-node-tree');
        const found = findNodeByNameDeep(tree, ref.nodeName);
        if (!found) {
            return { error: `resolve-node: no node found with name '${ref.nodeName}'` };
        }
        return { uuid: found.uuid };
    } catch (err: any) {
        return { error: `resolve-node: query-node-tree failed: ${err?.message ?? String(err)}` };
    }
}

/**
 * Convenience wrapper for handlers that want to early-return a
 * `ToolResponse` on resolution failure. Callers do:
 *
 *   const resolved = await resolveOrToolError(args);
 *   if ('response' in resolved) return resolved.response;
 *   const uuid = resolved.uuid;
 */
export async function resolveOrToolError(
    ref: NodeReference,
): Promise<{ uuid: string } | { response: ToolResponse }> {
    const r = await resolveNodeUuid(ref);
    if ('uuid' in r) return { uuid: r.uuid };
    return { response: { success: false, error: r.error } };
}

function findNodeByNameDeep(node: any, target: string): any | null {
    if (!node) return null;
    if (node.name === target) return node;
    if (Array.isArray(node.children)) {
        for (const child of node.children) {
            const hit = findNodeByNameDeep(child, target);
            if (hit) return hit;
        }
    }
    return null;
}
