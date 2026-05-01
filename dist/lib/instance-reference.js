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
    if (refId) {
        return { uuid: refId, reference: args.reference };
    }
    return (0, resolve_node_1.resolveOrToolError)({ nodeUuid, nodeName });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5zdGFuY2UtcmVmZXJlbmNlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL2xpYi9pbnN0YW5jZS1yZWZlcmVuY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FxQkc7OztBQXNFSCw0Q0FtQ0M7QUF2R0QscUNBQTZCO0FBRTdCLGlEQUFvRDtBQTBCcEQ7Ozs7Ozs7Ozs7R0FVRztBQUNVLFFBQUEsdUJBQXVCLEdBQUcsVUFBQyxDQUFDLE1BQU0sQ0FBQztJQUM1QyxFQUFFLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyx3Q0FBd0MsQ0FBQztJQUNqRSxJQUFJLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsRUFBRSxDQUFDLFFBQVEsQ0FBQyxtSEFBbUgsQ0FBQztDQUM1SixDQUFDLENBQUM7QUFFSDs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0F1Qkc7QUFDSSxLQUFLLFVBQVUsZ0JBQWdCLENBQUMsSUFJdEM7O0lBQ0csTUFBTSxLQUFLLEdBQUcsTUFBQSxJQUFJLENBQUMsU0FBUywwQ0FBRSxFQUFFLENBQUM7SUFDakMsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQztJQUMvQixNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDO0lBRS9CLGlFQUFpRTtJQUNqRSwrREFBK0Q7SUFDL0QsZ0VBQWdFO0lBQ2hFLElBQUksSUFBSSxDQUFDLFNBQVMsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQzNCLE9BQU87WUFDSCxRQUFRLEVBQUU7Z0JBQ04sT0FBTyxFQUFFLEtBQUs7Z0JBQ2QsS0FBSyxFQUFFLHVFQUF1RTthQUNqRjtTQUNKLENBQUM7SUFDTixDQUFDO0lBRUQsaURBQWlEO0lBQ2pELElBQUksS0FBSyxJQUFJLFFBQVEsSUFBSSxLQUFLLEtBQUssUUFBUSxFQUFFLENBQUM7UUFDMUMsT0FBTztZQUNILFFBQVEsRUFBRTtnQkFDTixPQUFPLEVBQUUsS0FBSztnQkFDZCxLQUFLLEVBQUUsbUNBQW1DLEtBQUssOEJBQThCLFFBQVEsa0JBQWtCO2FBQzFHO1NBQ0osQ0FBQztJQUNOLENBQUM7SUFFRCxJQUFJLEtBQUssRUFBRSxDQUFDO1FBQ1IsT0FBTyxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztJQUN0RCxDQUFDO0lBQ0QsT0FBTyxJQUFBLGlDQUFrQixFQUFDLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxDQUFDLENBQUM7QUFDdEQsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogSW5zdGFuY2VSZWZlcmVuY2Ug4oCUIHR5cGVkIGhhbmRsZSBmb3Igbm9kZXMgLyBjb21wb25lbnRzIC8gYXNzZXRzLlxuICpcbiAqIFJlcGxhY2VzIGJhcmUgVVVJRHMgaW4gdG9vbCBpbnB1dHMvb3V0cHV0cyB3aXRoIGB7aWQsIHR5cGV9YCBzbyB0aGVcbiAqIFwid2hhdCBpcyB0aGlzIFVVSURcIiBzZW1hbnRpY3MgdHJhdmVsIHdpdGggdGhlIHZhbHVlLiBXaXRob3V0IGl0LCBBSVxuICogY2xpZW50cyBoYXZlIHRvIHJlbWVtYmVyIGV4dGVybmFsbHkgdGhhdCBcImFiYy0xMjNcIiBpcyBhIGNjLkNhbWVyYSB2c1xuICogYSBjYy5Ob2RlIHZzIGEgY2MuU3ByaXRlRnJhbWUgYXNzZXQsIHdoaWNoIGlzIHRoZSBtb3N0IGNvbW1vbiBjYXVzZVxuICogb2YgY3Jvc3MtdG9vbCBtaXN0YWtlcyAocGFzc2luZyBhIG5vZGUgVVVJRCB3aGVyZSBhIGNvbXBvbmVudCBVVUlEXG4gKiBpcyBleHBlY3RlZCwgZXRjLikuXG4gKlxuICogUmVmZXJlbmNlOiBjb2Nvcy1jb2RlLW1vZGUgKFJvbWFSb2dvdikg4oCUIHYyLjQuMCBzdGVwIDQgcG9ydHMgdGhlXG4gKiBge2lkLCB0eXBlfWAgcGF0dGVybiBmcm9tIGBEOi8xX2Rldi9jb2Nvcy1tY3AtcmVmZXJlbmNlcy9jb2Nvcy1jb2RlLW1vZGVgLlxuICogU2VlIGRvY3MvcmVzZWFyY2gvcmVwb3MvY29jb3MtY29kZS1tb2RlLm1kIMKnMSAoXCJJbnN0YW5jZVJlZmVyZW5jZSDmqKHlvI9cIikuXG4gKlxuICogTWlncmF0aW9uIHBvbGljeTogdG9vbHMgb3B0IGluLiB2Mi40LjAgd2lyZXMgSW5zdGFuY2VSZWZlcmVuY2UgdGhyb3VnaFxuICogYHJlc29sdmVSZWZlcmVuY2UoKWAgZm9yIHRoZSBzYW1lIGZvdXIgaGlnaC10cmFmZmljIHRvb2xzIHRoYXQgYWRvcHRlZFxuICogbm9kZVV1aWR8bm9kZU5hbWUgaW4gc3RlcCAyIChzZXRfbm9kZV9wcm9wZXJ0eSAvIHNldF9ub2RlX3RyYW5zZm9ybSAvXG4gKiBhZGRfY29tcG9uZW50IC8gc2V0X2NvbXBvbmVudF9wcm9wZXJ0eSkuIFdpZGVyIG1pZ3JhdGlvbiBpcyBsZWZ0IHRvXG4gKiB2Mi41KyBwYXRjaGVzIGFzIHdlIG1lYXN1cmUgQUkgYWNjdXJhY3kgZ2FpbnMuIEV4aXN0aW5nIDE2MCB0b29sc1xuICogd2l0aCBiYXJlLVVVSUQgc2NoZW1hcyBrZWVwIHdvcmtpbmcg4oCUIEluc3RhbmNlUmVmZXJlbmNlIGlzIHB1cmVseVxuICogYWRkaXRpdmUgaW4gdjIuNC4wLlxuICovXG5cbmltcG9ydCB7IHogfSBmcm9tICcuL3NjaGVtYSc7XG5pbXBvcnQgdHlwZSB7IFRvb2xSZXNwb25zZSB9IGZyb20gJy4uL3R5cGVzJztcbmltcG9ydCB7IHJlc29sdmVPclRvb2xFcnJvciB9IGZyb20gJy4vcmVzb2x2ZS1ub2RlJztcblxuLyoqIFR5cGUgdGFnIHByZWZpeGVzIGRlc2NyaWJlIHdoYXQgYGlkYCBwb2ludHMgYXQuICovXG5leHBvcnQgdHlwZSBJbnN0YW5jZVR5cGVLaW5kID1cbiAgICAvKiogR2VuZXJpYyBzY2VuZSBub2RlIOKAlCB0eXBlIGVpdGhlciBvbWl0dGVkIG9yIHNldCB0byAnY2MuTm9kZScgLyBhIGNsYXNzLiAqL1xuICAgIHwgJ25vZGUnXG4gICAgLyoqIENvbXBvbmVudCBvbiBhIHNjZW5lIG5vZGUg4oCUIGBpZGAgaXMgdGhlIGNvbXBvbmVudCBVVUlELCBgdHlwZWAgaXMgdGhlIGNjLkNvbXBvbmVudCBjbGFzcy4gKi9cbiAgICB8ICdjb21wb25lbnQnXG4gICAgLyoqIEFzc2V0IGluIGFzc2V0LWRiIOKAlCBgaWRgIGlzIHRoZSBhc3NldCBVVUlELCBgdHlwZWAgaXMgdGhlIGFzc2V0IGNsYXNzIChlLmcuICdjYy5QcmVmYWInKS4gKi9cbiAgICB8ICdhc3NldCdcbiAgICAvKiogQmFyZSBzdHJpbmcgdXNlZCBsb29zZWx5IOKAlCBjYWxsZXIgZGVjaWRlcyB0aGUga2luZCBieSBjb250ZXh0LiAqL1xuICAgIHwgc3RyaW5nO1xuXG5leHBvcnQgaW50ZXJmYWNlIEluc3RhbmNlUmVmZXJlbmNlIHtcbiAgICAvKiogVVVJRCBmb3IgdGhlIG5vZGUsIGNvbXBvbmVudCwgb3IgYXNzZXQuICovXG4gICAgaWQ6IHN0cmluZztcbiAgICAvKipcbiAgICAgKiBDbGFzcyBuYW1lIG9yIGtpbmQgdGFnLiBjb2Nvcy1jb2RlLW1vZGUgc3R5bGU6IHBhc3MgdGhlIGNjIGNsYXNzXG4gICAgICogZGlyZWN0bHkgKGUuZy4gJ2NjLkNhbWVyYScgLyAnY2MuUHJlZmFiJykuIEZvciBub2RlcyB5b3UgY2FuIGFsc29cbiAgICAgKiB1c2UgdGhlIGxpdGVyYWwgJ25vZGUnLiBPcHRpb25hbCBidXQgcmVjb21tZW5kZWQg4oCUIHdoZW4gcHJlc2VudCxcbiAgICAgKiB0b29scyBjYW4gdmFsaWRhdGUgdGhlIHJlZmVyZW5jZSBwb2ludHMgYXQgdGhlIHJpZ2h0IHRoaW5nXG4gICAgICogYmVmb3JlIG11dGF0aW5nIHNjZW5lLlxuICAgICAqL1xuICAgIHR5cGU/OiBzdHJpbmc7XG59XG5cbi8qKlxuICogWm9kIHNjaGVtYSBmb3IgSW5zdGFuY2VSZWZlcmVuY2UuIFVzZSBhcyBhIHByb3BlcnR5IGluIGEgdG9vbCBpbnB1dFxuICogc2NoZW1hOlxuICpcbiAqICAgei5vYmplY3Qoe1xuICogICAgICAgcmVmZXJlbmNlOiBpbnN0YW5jZVJlZmVyZW5jZVNjaGVtYSxcbiAqICAgICAgIHByb3BlcnR5OiB6LnN0cmluZygpLFxuICogICB9KVxuICpcbiAqIEJvdGggZmllbGRzIGFyZSB2YWxpZGF0ZWQ7IGB0eXBlYCBpcyBvcHRpb25hbCBidXQgbmV2ZXIgY29lcmNlZC5cbiAqL1xuZXhwb3J0IGNvbnN0IGluc3RhbmNlUmVmZXJlbmNlU2NoZW1hID0gei5vYmplY3Qoe1xuICAgIGlkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdVVUlEIGZvciB0aGUgbm9kZSAvIGNvbXBvbmVudCAvIGFzc2V0LicpLFxuICAgIHR5cGU6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnQ2xhc3MgbmFtZSBvciBraW5kIHRhZyAoZS5nLiBcImNjLkNhbWVyYVwiLCBcImNjLlByZWZhYlwiLCBcIm5vZGVcIikuIE9wdGlvbmFsIGJ1dCByZWNvbW1lbmRlZCDigJQgdG9vbHMgbWF5IHZhbGlkYXRlIGl0LicpLFxufSk7XG5cbi8qKlxuICogUmVzb2x2ZSBhIG5vZGUtc2hhcGVkIHRhcmdldCBmcm9tIG9uZSBvZiB0aHJlZSBpbnB1dCBmb3JtcyAoaW5cbiAqIHByZWNlZGVuY2Ugb3JkZXIpOlxuICogICAxLiBgcmVmZXJlbmNlYCDigJQgSW5zdGFuY2VSZWZlcmVuY2U7IHVzZXMgYHJlZmVyZW5jZS5pZGAgYXMgdGhlIFVVSUQuXG4gKiAgIDIuIGBub2RlVXVpZGAgIOKAlCBiYXJlIFVVSUQgc3RyaW5nIChsZWdhY3kgLyBzdGVwIDIgcGF0aCkuXG4gKiAgIDMuIGBub2RlTmFtZWAgIOKAlCBkZXB0aC1maXJzdCBmaXJzdCBtYXRjaCAoc3RlcCAyIGZhbGxiYWNrKS5cbiAqXG4gKiBSZXR1cm5zIGB7dXVpZH1gIG9uIHN1Y2Nlc3Mgb3IgYHtyZXNwb25zZX1gIGNvbnRhaW5pbmcgYVxuICogVG9vbFJlc3BvbnNlIGVycm9yIG9uIGZhaWx1cmUuIE1pcnJvcnMgYHJlc29sdmVPclRvb2xFcnJvcmAgc29cbiAqIGNhbGxlcnMgY2FuIGVhcmx5LXJldHVybiBjbGVhbmx5LlxuICpcbiAqIENvbmZsaWN0IGRldGVjdGlvbiAodjIuNC4xIHJldmlldyBmaXgg4oCUIGNsYXVkZSArIGNvZGV4KTogaWYgdHdvIG9yXG4gKiBtb3JlIHNlbGVjdG9ycyBhcmUgc3VwcGxpZWQgd2l0aCBjb25mbGljdGluZyB2YWx1ZXMgKGUuZy4gYm90aCBhXG4gKiBgcmVmZXJlbmNlLmlkYCBBTkQgYSBgbm9kZVV1aWRgIHRoYXQgZG9uJ3QgbWF0Y2gpLCB0aGUgaGVscGVyXG4gKiByZXR1cm5zIGFuIGV4cGxpY2l0IGVycm9yIHJhdGhlciB0aGFuIHNpbGVudGx5IHBpY2tpbmcgdGhlIGhpZ2hlci1cbiAqIHByaW9yaXR5IGZpZWxkLiBBSSBjbGllbnRzIHRoYXQgdGlsZSBtdWx0aXBsZSB0b29sIGNhbGxzIGFyZSB0aGVcbiAqIHVzdWFsIHNvdXJjZSBvZiB0aGlzIG1pc3Rha2U7IGZhaWxpbmcgbG91ZGx5IGF2b2lkcyBob3VycyBvZlxuICogZGVidWdnaW5nIHdoZW4gdGhlIHdyb25nIG5vZGUgZ2V0cyBtdXRhdGVkLlxuICpcbiAqIE5vdGU6IHdoZW4gYHJlZmVyZW5jZS50eXBlYCBpcyBzZXQsIGNhbGxlcnMgd2FudGluZyBzdHJpY3QgY2hlY2tpbmdcbiAqIGNhbiBjb21wYXJlIGFnYWluc3QgYW4gZXhwZWN0ZWQga2luZCB0aGVtc2VsdmVzOyB0aGlzIGhlbHBlciBkb2VzXG4gKiBub3QgZW5mb3JjZSBpdCBiZWNhdXNlIHRoZSBDb2NvcyB0eXBlIHVuaXZlcnNlIChjdXN0b20gc2NyaXB0cyxcbiAqIGluaGVyaXRhbmNlKSBtYWtlcyBibGFua2V0IHZhbGlkYXRpb24gbm9pc3kuXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiByZXNvbHZlUmVmZXJlbmNlKGFyZ3M6IHtcbiAgICByZWZlcmVuY2U/OiBJbnN0YW5jZVJlZmVyZW5jZTtcbiAgICBub2RlVXVpZD86IHN0cmluZztcbiAgICBub2RlTmFtZT86IHN0cmluZztcbn0pOiBQcm9taXNlPHsgdXVpZDogc3RyaW5nOyByZWZlcmVuY2U/OiBJbnN0YW5jZVJlZmVyZW5jZSB9IHwgeyByZXNwb25zZTogVG9vbFJlc3BvbnNlIH0+IHtcbiAgICBjb25zdCByZWZJZCA9IGFyZ3MucmVmZXJlbmNlPy5pZDtcbiAgICBjb25zdCBub2RlVXVpZCA9IGFyZ3Mubm9kZVV1aWQ7XG4gICAgY29uc3Qgbm9kZU5hbWUgPSBhcmdzLm5vZGVOYW1lO1xuXG4gICAgLy8gdjIuNC4xIHJldmlldyBmaXg6IGEgbWFsZm9ybWVkIHJlZmVyZW5jZSAocGFzc2VkIHdpdGhvdXQgYGlkYClcbiAgICAvLyB1c2VkIHRvIGZhbGwgdGhyb3VnaCB0byByZXNvbHZlT3JUb29sRXJyb3Igd2l0aCBhIG1pc2xlYWRpbmdcbiAgICAvLyAncHJvdmlkZSBub2RlVXVpZCBvciBub2RlTmFtZScgbWVzc2FnZS4gRGV0ZWN0IGl0IGV4cGxpY2l0bHkuXG4gICAgaWYgKGFyZ3MucmVmZXJlbmNlICYmICFyZWZJZCkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgcmVzcG9uc2U6IHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBlcnJvcjogJ3Jlc29sdmVSZWZlcmVuY2U6IHJlZmVyZW5jZS5pZCBpcyByZXF1aXJlZCB3aGVuIHJlZmVyZW5jZSBpcyBwcm92aWRlZCcsXG4gICAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgIH1cblxuICAgIC8vIENvbmZsaWN0OiByZWZJZCB2cyBleHBsaWNpdCBub2RlVXVpZCBkaXNhZ3JlZS5cbiAgICBpZiAocmVmSWQgJiYgbm9kZVV1aWQgJiYgcmVmSWQgIT09IG5vZGVVdWlkKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICByZXNwb25zZToge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgIGVycm9yOiBgcmVzb2x2ZVJlZmVyZW5jZTogcmVmZXJlbmNlLmlkICgke3JlZklkfSkgY29uZmxpY3RzIHdpdGggbm9kZVV1aWQgKCR7bm9kZVV1aWR9KTsgcGFzcyBvbmx5IG9uZWAsXG4gICAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgIH1cblxuICAgIGlmIChyZWZJZCkge1xuICAgICAgICByZXR1cm4geyB1dWlkOiByZWZJZCwgcmVmZXJlbmNlOiBhcmdzLnJlZmVyZW5jZSB9O1xuICAgIH1cbiAgICByZXR1cm4gcmVzb2x2ZU9yVG9vbEVycm9yKHsgbm9kZVV1aWQsIG5vZGVOYW1lIH0pO1xufVxuIl19