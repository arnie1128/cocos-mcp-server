"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.instanceReferenceSchema = void 0;
exports.resolveReference = resolveReference;
const schema_1 = require("./schema");
const resolve_node_1 = require("./resolve-node");
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
exports.instanceReferenceSchema = schema_1.z.object({
    id: schema_1.z.string().describe('UUID for the node / component / asset.'),
    type: schema_1.z.string().optional().describe('Class name or kind tag (e.g. "cc.Camera", "cc.Prefab", "node"). Optional but recommended — tools may validate it.'),
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
async function resolveReference(args) {
    var _a;
    const refId = (_a = args.reference) === null || _a === void 0 ? void 0 : _a.id;
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
    return (0, resolve_node_1.resolveOrToolError)({ nodeUuid, nodeName });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5zdGFuY2UtcmVmZXJlbmNlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL2xpYi9pbnN0YW5jZS1yZWZlcmVuY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FxQkc7OztBQXNFSCw0Q0FpREM7QUFySEQscUNBQTZCO0FBRTdCLGlEQUFvRDtBQTBCcEQ7Ozs7Ozs7Ozs7R0FVRztBQUNVLFFBQUEsdUJBQXVCLEdBQUcsVUFBQyxDQUFDLE1BQU0sQ0FBQztJQUM1QyxFQUFFLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyx3Q0FBd0MsQ0FBQztJQUNqRSxJQUFJLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsRUFBRSxDQUFDLFFBQVEsQ0FBQyxtSEFBbUgsQ0FBQztDQUM1SixDQUFDLENBQUM7QUFFSDs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0F1Qkc7QUFDSSxLQUFLLFVBQVUsZ0JBQWdCLENBQUMsSUFJdEM7O0lBQ0csTUFBTSxLQUFLLEdBQUcsTUFBQSxJQUFJLENBQUMsU0FBUywwQ0FBRSxFQUFFLENBQUM7SUFDakMsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQztJQUMvQixNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDO0lBRS9CLGlFQUFpRTtJQUNqRSwrREFBK0Q7SUFDL0QsZ0VBQWdFO0lBQ2hFLElBQUksSUFBSSxDQUFDLFNBQVMsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQzNCLE9BQU87WUFDSCxRQUFRLEVBQUU7Z0JBQ04sT0FBTyxFQUFFLEtBQUs7Z0JBQ2QsS0FBSyxFQUFFLHVFQUF1RTthQUNqRjtTQUNKLENBQUM7SUFDTixDQUFDO0lBRUQsaURBQWlEO0lBQ2pELElBQUksS0FBSyxJQUFJLFFBQVEsSUFBSSxLQUFLLEtBQUssUUFBUSxFQUFFLENBQUM7UUFDMUMsT0FBTztZQUNILFFBQVEsRUFBRTtnQkFDTixPQUFPLEVBQUUsS0FBSztnQkFDZCxLQUFLLEVBQUUsbUNBQW1DLEtBQUssOEJBQThCLFFBQVEsa0JBQWtCO2FBQzFHO1NBQ0osQ0FBQztJQUNOLENBQUM7SUFFRCwyREFBMkQ7SUFDM0QsK0RBQStEO0lBQy9ELGlFQUFpRTtJQUNqRSxpRUFBaUU7SUFDakUsNENBQTRDO0lBQzVDLElBQUksS0FBSyxJQUFJLFFBQVEsRUFBRSxDQUFDO1FBQ3BCLE9BQU87WUFDSCxRQUFRLEVBQUU7Z0JBQ04sT0FBTyxFQUFFLEtBQUs7Z0JBQ2QsS0FBSyxFQUFFLG1DQUFtQyxLQUFLLGtDQUFrQyxRQUFRLGtCQUFrQjthQUM5RztTQUNKLENBQUM7SUFDTixDQUFDO0lBRUQsSUFBSSxLQUFLLEVBQUUsQ0FBQztRQUNSLE9BQU8sRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRSxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7SUFDdEQsQ0FBQztJQUNELE9BQU8sSUFBQSxpQ0FBa0IsRUFBQyxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsQ0FBQyxDQUFDO0FBQ3RELENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEluc3RhbmNlUmVmZXJlbmNlIOKAlCB0eXBlZCBoYW5kbGUgZm9yIG5vZGVzIC8gY29tcG9uZW50cyAvIGFzc2V0cy5cbiAqXG4gKiBSZXBsYWNlcyBiYXJlIFVVSURzIGluIHRvb2wgaW5wdXRzL291dHB1dHMgd2l0aCBge2lkLCB0eXBlfWAgc28gdGhlXG4gKiBcIndoYXQgaXMgdGhpcyBVVUlEXCIgc2VtYW50aWNzIHRyYXZlbCB3aXRoIHRoZSB2YWx1ZS4gV2l0aG91dCBpdCwgQUlcbiAqIGNsaWVudHMgaGF2ZSB0byByZW1lbWJlciBleHRlcm5hbGx5IHRoYXQgXCJhYmMtMTIzXCIgaXMgYSBjYy5DYW1lcmEgdnNcbiAqIGEgY2MuTm9kZSB2cyBhIGNjLlNwcml0ZUZyYW1lIGFzc2V0LCB3aGljaCBpcyB0aGUgbW9zdCBjb21tb24gY2F1c2VcbiAqIG9mIGNyb3NzLXRvb2wgbWlzdGFrZXMgKHBhc3NpbmcgYSBub2RlIFVVSUQgd2hlcmUgYSBjb21wb25lbnQgVVVJRFxuICogaXMgZXhwZWN0ZWQsIGV0Yy4pLlxuICpcbiAqIFJlZmVyZW5jZTogY29jb3MtY29kZS1tb2RlIChSb21hUm9nb3YpIOKAlCB2Mi40LjAgc3RlcCA0IHBvcnRzIHRoZVxuICogYHtpZCwgdHlwZX1gIHBhdHRlcm4gZnJvbSBgRDovMV9kZXYvY29jb3MtbWNwLXJlZmVyZW5jZXMvY29jb3MtY29kZS1tb2RlYC5cbiAqIFNlZSBkb2NzL3Jlc2VhcmNoL3JlcG9zL2NvY29zLWNvZGUtbW9kZS5tZCDCpzEgKFwiSW5zdGFuY2VSZWZlcmVuY2Ug5qih5byPXCIpLlxuICpcbiAqIE1pZ3JhdGlvbiBwb2xpY3k6IHRvb2xzIG9wdCBpbi4gdjIuNC4wIHdpcmVzIEluc3RhbmNlUmVmZXJlbmNlIHRocm91Z2hcbiAqIGByZXNvbHZlUmVmZXJlbmNlKClgIGZvciB0aGUgc2FtZSBmb3VyIGhpZ2gtdHJhZmZpYyB0b29scyB0aGF0IGFkb3B0ZWRcbiAqIG5vZGVVdWlkfG5vZGVOYW1lIGluIHN0ZXAgMiAoc2V0X25vZGVfcHJvcGVydHkgLyBzZXRfbm9kZV90cmFuc2Zvcm0gL1xuICogYWRkX2NvbXBvbmVudCAvIHNldF9jb21wb25lbnRfcHJvcGVydHkpLiBXaWRlciBtaWdyYXRpb24gaXMgbGVmdCB0b1xuICogdjIuNSsgcGF0Y2hlcyBhcyB3ZSBtZWFzdXJlIEFJIGFjY3VyYWN5IGdhaW5zLiBFeGlzdGluZyAxNjAgdG9vbHNcbiAqIHdpdGggYmFyZS1VVUlEIHNjaGVtYXMga2VlcCB3b3JraW5nIOKAlCBJbnN0YW5jZVJlZmVyZW5jZSBpcyBwdXJlbHlcbiAqIGFkZGl0aXZlIGluIHYyLjQuMC5cbiAqL1xuXG5pbXBvcnQgeyB6IH0gZnJvbSAnLi9zY2hlbWEnO1xuaW1wb3J0IHR5cGUgeyBUb29sUmVzcG9uc2UgfSBmcm9tICcuLi90eXBlcyc7XG5pbXBvcnQgeyByZXNvbHZlT3JUb29sRXJyb3IgfSBmcm9tICcuL3Jlc29sdmUtbm9kZSc7XG5cbi8qKiBUeXBlIHRhZyBwcmVmaXhlcyBkZXNjcmliZSB3aGF0IGBpZGAgcG9pbnRzIGF0LiAqL1xuZXhwb3J0IHR5cGUgSW5zdGFuY2VUeXBlS2luZCA9XG4gICAgLyoqIEdlbmVyaWMgc2NlbmUgbm9kZSDigJQgdHlwZSBlaXRoZXIgb21pdHRlZCBvciBzZXQgdG8gJ2NjLk5vZGUnIC8gYSBjbGFzcy4gKi9cbiAgICB8ICdub2RlJ1xuICAgIC8qKiBDb21wb25lbnQgb24gYSBzY2VuZSBub2RlIOKAlCBgaWRgIGlzIHRoZSBjb21wb25lbnQgVVVJRCwgYHR5cGVgIGlzIHRoZSBjYy5Db21wb25lbnQgY2xhc3MuICovXG4gICAgfCAnY29tcG9uZW50J1xuICAgIC8qKiBBc3NldCBpbiBhc3NldC1kYiDigJQgYGlkYCBpcyB0aGUgYXNzZXQgVVVJRCwgYHR5cGVgIGlzIHRoZSBhc3NldCBjbGFzcyAoZS5nLiAnY2MuUHJlZmFiJykuICovXG4gICAgfCAnYXNzZXQnXG4gICAgLyoqIEJhcmUgc3RyaW5nIHVzZWQgbG9vc2VseSDigJQgY2FsbGVyIGRlY2lkZXMgdGhlIGtpbmQgYnkgY29udGV4dC4gKi9cbiAgICB8IHN0cmluZztcblxuZXhwb3J0IGludGVyZmFjZSBJbnN0YW5jZVJlZmVyZW5jZSB7XG4gICAgLyoqIFVVSUQgZm9yIHRoZSBub2RlLCBjb21wb25lbnQsIG9yIGFzc2V0LiAqL1xuICAgIGlkOiBzdHJpbmc7XG4gICAgLyoqXG4gICAgICogQ2xhc3MgbmFtZSBvciBraW5kIHRhZy4gY29jb3MtY29kZS1tb2RlIHN0eWxlOiBwYXNzIHRoZSBjYyBjbGFzc1xuICAgICAqIGRpcmVjdGx5IChlLmcuICdjYy5DYW1lcmEnIC8gJ2NjLlByZWZhYicpLiBGb3Igbm9kZXMgeW91IGNhbiBhbHNvXG4gICAgICogdXNlIHRoZSBsaXRlcmFsICdub2RlJy4gT3B0aW9uYWwgYnV0IHJlY29tbWVuZGVkIOKAlCB3aGVuIHByZXNlbnQsXG4gICAgICogdG9vbHMgY2FuIHZhbGlkYXRlIHRoZSByZWZlcmVuY2UgcG9pbnRzIGF0IHRoZSByaWdodCB0aGluZ1xuICAgICAqIGJlZm9yZSBtdXRhdGluZyBzY2VuZS5cbiAgICAgKi9cbiAgICB0eXBlPzogc3RyaW5nO1xufVxuXG4vKipcbiAqIFpvZCBzY2hlbWEgZm9yIEluc3RhbmNlUmVmZXJlbmNlLiBVc2UgYXMgYSBwcm9wZXJ0eSBpbiBhIHRvb2wgaW5wdXRcbiAqIHNjaGVtYTpcbiAqXG4gKiAgIHoub2JqZWN0KHtcbiAqICAgICAgIHJlZmVyZW5jZTogaW5zdGFuY2VSZWZlcmVuY2VTY2hlbWEsXG4gKiAgICAgICBwcm9wZXJ0eTogei5zdHJpbmcoKSxcbiAqICAgfSlcbiAqXG4gKiBCb3RoIGZpZWxkcyBhcmUgdmFsaWRhdGVkOyBgdHlwZWAgaXMgb3B0aW9uYWwgYnV0IG5ldmVyIGNvZXJjZWQuXG4gKi9cbmV4cG9ydCBjb25zdCBpbnN0YW5jZVJlZmVyZW5jZVNjaGVtYSA9IHoub2JqZWN0KHtcbiAgICBpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnVVVJRCBmb3IgdGhlIG5vZGUgLyBjb21wb25lbnQgLyBhc3NldC4nKSxcbiAgICB0eXBlOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0NsYXNzIG5hbWUgb3Iga2luZCB0YWcgKGUuZy4gXCJjYy5DYW1lcmFcIiwgXCJjYy5QcmVmYWJcIiwgXCJub2RlXCIpLiBPcHRpb25hbCBidXQgcmVjb21tZW5kZWQg4oCUIHRvb2xzIG1heSB2YWxpZGF0ZSBpdC4nKSxcbn0pO1xuXG4vKipcbiAqIFJlc29sdmUgYSBub2RlLXNoYXBlZCB0YXJnZXQgZnJvbSBvbmUgb2YgdGhyZWUgaW5wdXQgZm9ybXMgKGluXG4gKiBwcmVjZWRlbmNlIG9yZGVyKTpcbiAqICAgMS4gYHJlZmVyZW5jZWAg4oCUIEluc3RhbmNlUmVmZXJlbmNlOyB1c2VzIGByZWZlcmVuY2UuaWRgIGFzIHRoZSBVVUlELlxuICogICAyLiBgbm9kZVV1aWRgICDigJQgYmFyZSBVVUlEIHN0cmluZyAobGVnYWN5IC8gc3RlcCAyIHBhdGgpLlxuICogICAzLiBgbm9kZU5hbWVgICDigJQgZGVwdGgtZmlyc3QgZmlyc3QgbWF0Y2ggKHN0ZXAgMiBmYWxsYmFjaykuXG4gKlxuICogUmV0dXJucyBge3V1aWR9YCBvbiBzdWNjZXNzIG9yIGB7cmVzcG9uc2V9YCBjb250YWluaW5nIGFcbiAqIFRvb2xSZXNwb25zZSBlcnJvciBvbiBmYWlsdXJlLiBNaXJyb3JzIGByZXNvbHZlT3JUb29sRXJyb3JgIHNvXG4gKiBjYWxsZXJzIGNhbiBlYXJseS1yZXR1cm4gY2xlYW5seS5cbiAqXG4gKiBDb25mbGljdCBkZXRlY3Rpb24gKHYyLjQuMSByZXZpZXcgZml4IOKAlCBjbGF1ZGUgKyBjb2RleCk6IGlmIHR3byBvclxuICogbW9yZSBzZWxlY3RvcnMgYXJlIHN1cHBsaWVkIHdpdGggY29uZmxpY3RpbmcgdmFsdWVzIChlLmcuIGJvdGggYVxuICogYHJlZmVyZW5jZS5pZGAgQU5EIGEgYG5vZGVVdWlkYCB0aGF0IGRvbid0IG1hdGNoKSwgdGhlIGhlbHBlclxuICogcmV0dXJucyBhbiBleHBsaWNpdCBlcnJvciByYXRoZXIgdGhhbiBzaWxlbnRseSBwaWNraW5nIHRoZSBoaWdoZXItXG4gKiBwcmlvcml0eSBmaWVsZC4gQUkgY2xpZW50cyB0aGF0IHRpbGUgbXVsdGlwbGUgdG9vbCBjYWxscyBhcmUgdGhlXG4gKiB1c3VhbCBzb3VyY2Ugb2YgdGhpcyBtaXN0YWtlOyBmYWlsaW5nIGxvdWRseSBhdm9pZHMgaG91cnMgb2ZcbiAqIGRlYnVnZ2luZyB3aGVuIHRoZSB3cm9uZyBub2RlIGdldHMgbXV0YXRlZC5cbiAqXG4gKiBOb3RlOiB3aGVuIGByZWZlcmVuY2UudHlwZWAgaXMgc2V0LCBjYWxsZXJzIHdhbnRpbmcgc3RyaWN0IGNoZWNraW5nXG4gKiBjYW4gY29tcGFyZSBhZ2FpbnN0IGFuIGV4cGVjdGVkIGtpbmQgdGhlbXNlbHZlczsgdGhpcyBoZWxwZXIgZG9lc1xuICogbm90IGVuZm9yY2UgaXQgYmVjYXVzZSB0aGUgQ29jb3MgdHlwZSB1bml2ZXJzZSAoY3VzdG9tIHNjcmlwdHMsXG4gKiBpbmhlcml0YW5jZSkgbWFrZXMgYmxhbmtldCB2YWxpZGF0aW9uIG5vaXN5LlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVzb2x2ZVJlZmVyZW5jZShhcmdzOiB7XG4gICAgcmVmZXJlbmNlPzogSW5zdGFuY2VSZWZlcmVuY2U7XG4gICAgbm9kZVV1aWQ/OiBzdHJpbmc7XG4gICAgbm9kZU5hbWU/OiBzdHJpbmc7XG59KTogUHJvbWlzZTx7IHV1aWQ6IHN0cmluZzsgcmVmZXJlbmNlPzogSW5zdGFuY2VSZWZlcmVuY2UgfSB8IHsgcmVzcG9uc2U6IFRvb2xSZXNwb25zZSB9PiB7XG4gICAgY29uc3QgcmVmSWQgPSBhcmdzLnJlZmVyZW5jZT8uaWQ7XG4gICAgY29uc3Qgbm9kZVV1aWQgPSBhcmdzLm5vZGVVdWlkO1xuICAgIGNvbnN0IG5vZGVOYW1lID0gYXJncy5ub2RlTmFtZTtcblxuICAgIC8vIHYyLjQuMSByZXZpZXcgZml4OiBhIG1hbGZvcm1lZCByZWZlcmVuY2UgKHBhc3NlZCB3aXRob3V0IGBpZGApXG4gICAgLy8gdXNlZCB0byBmYWxsIHRocm91Z2ggdG8gcmVzb2x2ZU9yVG9vbEVycm9yIHdpdGggYSBtaXNsZWFkaW5nXG4gICAgLy8gJ3Byb3ZpZGUgbm9kZVV1aWQgb3Igbm9kZU5hbWUnIG1lc3NhZ2UuIERldGVjdCBpdCBleHBsaWNpdGx5LlxuICAgIGlmIChhcmdzLnJlZmVyZW5jZSAmJiAhcmVmSWQpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHJlc3BvbnNlOiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgZXJyb3I6ICdyZXNvbHZlUmVmZXJlbmNlOiByZWZlcmVuY2UuaWQgaXMgcmVxdWlyZWQgd2hlbiByZWZlcmVuY2UgaXMgcHJvdmlkZWQnLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBDb25mbGljdDogcmVmSWQgdnMgZXhwbGljaXQgbm9kZVV1aWQgZGlzYWdyZWUuXG4gICAgaWYgKHJlZklkICYmIG5vZGVVdWlkICYmIHJlZklkICE9PSBub2RlVXVpZCkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgcmVzcG9uc2U6IHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBlcnJvcjogYHJlc29sdmVSZWZlcmVuY2U6IHJlZmVyZW5jZS5pZCAoJHtyZWZJZH0pIGNvbmZsaWN0cyB3aXRoIG5vZGVVdWlkICgke25vZGVVdWlkfSk7IHBhc3Mgb25seSBvbmVgLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyB2Mi40LjIgcmV2aWV3IGZpeCAoY2xhdWRlKTogc3ltbWV0cmljIGNoZWNrIGZvciByZWZJZCB2c1xuICAgIC8vIG5vZGVOYW1lLiB2Mi40LjEgY2F1Z2h0IHJlZklkL25vZGVVdWlkIG1pc21hdGNoIGJ1dCBzaWxlbnRseVxuICAgIC8vIGlnbm9yZWQgYSBub2RlTmFtZSBzdXBwbGllZCBhbG9uZ3NpZGUgcmVmZXJlbmNlLiBTYW1lIGNsYXNzIG9mXG4gICAgLy8gbWlzdGFrZSDigJQgZmxhZyBpdCBleHBsaWNpdGx5IHNvIHRoZSBBSSBzZWVzIGJvdGggc2VsZWN0b3JzIGFyZVxuICAgIC8vIHJlZHVuZGFudCByYXRoZXIgdGhhbiBwYXJ0aWFsbHkgaG9ub3VyZWQuXG4gICAgaWYgKHJlZklkICYmIG5vZGVOYW1lKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICByZXNwb25zZToge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgIGVycm9yOiBgcmVzb2x2ZVJlZmVyZW5jZTogcmVmZXJlbmNlLmlkICgke3JlZklkfSkgc3VwcGxpZWQgYWxvbmdzaWRlIG5vZGVOYW1lICgke25vZGVOYW1lfSk7IHBhc3Mgb25seSBvbmVgLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBpZiAocmVmSWQpIHtcbiAgICAgICAgcmV0dXJuIHsgdXVpZDogcmVmSWQsIHJlZmVyZW5jZTogYXJncy5yZWZlcmVuY2UgfTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc29sdmVPclRvb2xFcnJvcih7IG5vZGVVdWlkLCBub2RlTmFtZSB9KTtcbn1cbiJdfQ==