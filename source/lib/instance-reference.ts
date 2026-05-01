/**
 * InstanceReference — typed handle for nodes / components / assets.
 *
 * Replaces bare UUIDs in tool inputs/outputs with `{id, type}` so the
 * "what is this UUID" semantics travel with the value. Without it, AI
 * clients have to remember externally that "abc-123" is a cc.Camera vs
 * a cc.Node vs a cc.SpriteFrame asset, which is the most common cause
 * of cross-tool mistakes (passing a node UUID where a component UUID
 * is expected, etc.).
 *
 * Reference: cocos-code-mode (RomaRogov) — v2.4.0 step 4 ports the
 * `{id, type}` pattern from `D:/1_dev/cocos-mcp-references/cocos-code-mode`.
 * See docs/research/repos/cocos-code-mode.md §1 ("InstanceReference 模式").
 *
 * Migration policy: tools opt in. v2.4.0 wires InstanceReference through
 * `resolveReference()` for the same four high-traffic tools that adopted
 * nodeUuid|nodeName in step 2 (set_node_property / set_node_transform /
 * add_component / set_component_property). Wider migration is left to
 * v2.5+ patches as we measure AI accuracy gains. Existing 160 tools
 * with bare-UUID schemas keep working — InstanceReference is purely
 * additive in v2.4.0.
 */

import { z } from './schema';
import type { ToolResponse } from '../types';
import { resolveOrToolError } from './resolve-node';

/** Type tag prefixes describe what `id` points at. */
export type InstanceTypeKind =
    /** Generic scene node — type either omitted or set to 'cc.Node' / a class. */
    | 'node'
    /** Component on a scene node — `id` is the component UUID, `type` is the cc.Component class. */
    | 'component'
    /** Asset in asset-db — `id` is the asset UUID, `type` is the asset class (e.g. 'cc.Prefab'). */
    | 'asset'
    /** Bare string used loosely — caller decides the kind by context. */
    | string;

export interface InstanceReference {
    /** UUID for the node, component, or asset. */
    id: string;
    /**
     * Class name or kind tag. cocos-code-mode style: pass the cc class
     * directly (e.g. 'cc.Camera' / 'cc.Prefab'). For nodes you can also
     * use the literal 'node'. Optional but recommended — when present,
     * tools can validate the reference points at the right thing
     * before mutating scene.
     */
    type?: string;
}

/**
 * Zod schema for InstanceReference. Use as a property in a tool input
 * schema:
 *
 *   z.object({
 *       reference: instanceReferenceSchema,
 *       property: z.string(),
 *   })
 *
 * Both fields are validated; `type` is optional but never coerced.
 */
export const instanceReferenceSchema = z.object({
    id: z.string().describe('UUID for the node / component / asset.'),
    type: z.string().optional().describe('Class name or kind tag (e.g. "cc.Camera", "cc.Prefab", "node"). Optional but recommended — tools may validate it.'),
});

/**
 * Resolve a node-shaped target from one of three input forms (in
 * precedence order):
 *   1. `reference` — InstanceReference; uses `reference.id` as the UUID.
 *   2. `nodeUuid`  — bare UUID string (legacy / step 2 path).
 *   3. `nodeName`  — depth-first first match (step 2 fallback).
 *
 * Returns `{uuid}` on success or `{response}` containing a
 * ToolResponse error on failure. Mirrors `resolveOrToolError` so
 * callers can early-return cleanly.
 *
 * Conflict detection (v2.4.1 review fix — claude + codex): if two or
 * more selectors are supplied with conflicting values (e.g. both a
 * `reference.id` AND a `nodeUuid` that don't match), the helper
 * returns an explicit error rather than silently picking the higher-
 * priority field. AI clients that tile multiple tool calls are the
 * usual source of this mistake; failing loudly avoids hours of
 * debugging when the wrong node gets mutated.
 *
 * Note: when `reference.type` is set, callers wanting strict checking
 * can compare against an expected kind themselves; this helper does
 * not enforce it because the Cocos type universe (custom scripts,
 * inheritance) makes blanket validation noisy.
 */
export async function resolveReference(args: {
    reference?: InstanceReference;
    nodeUuid?: string;
    nodeName?: string;
}): Promise<{ uuid: string; reference?: InstanceReference } | { response: ToolResponse }> {
    const refId = args.reference?.id;
    const nodeUuid = args.nodeUuid;
    const nodeName = args.nodeName;

    // v2.4.1 review fix: a malformed reference (passed without `id`)
    // used to fall through to resolveOrToolError with a misleading
    // 'provide nodeUuid or nodeName' message. Detect it explicitly.
    if (args.reference && !refId) {
        return {
            response: {
                success: false,
                error: 'resolveReference: reference.id is required when reference is provided',
            },
        };
    }

    // Conflict: refId vs explicit nodeUuid disagree.
    if (refId && nodeUuid && refId !== nodeUuid) {
        return {
            response: {
                success: false,
                error: `resolveReference: reference.id (${refId}) conflicts with nodeUuid (${nodeUuid}); pass only one`,
            },
        };
    }

    // v2.4.2 review fix (claude): symmetric check for refId vs
    // nodeName. v2.4.1 caught refId/nodeUuid mismatch but silently
    // ignored a nodeName supplied alongside reference. Same class of
    // mistake — flag it explicitly so the AI sees both selectors are
    // redundant rather than partially honoured.
    if (refId && nodeName) {
        return {
            response: {
                success: false,
                error: `resolveReference: reference.id (${refId}) supplied alongside nodeName (${nodeName}); pass only one`,
            },
        };
    }

    if (refId) {
        return { uuid: refId, reference: args.reference };
    }
    return resolveOrToolError({ nodeUuid, nodeName });
}
