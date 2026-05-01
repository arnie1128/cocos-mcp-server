"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.nodeReferenceShape = void 0;
exports.resolveNodeUuid = resolveNodeUuid;
exports.resolveOrToolError = resolveOrToolError;
const schema_1 = require("./schema");
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
exports.nodeReferenceShape = {
    nodeUuid: schema_1.z.string().optional().describe('Target node UUID. Provide this OR nodeName (UUID wins when both are set).'),
    nodeName: schema_1.z.string().optional().describe('Target node name; resolved by depth-first scan of the current scene. Use only when the name is unique. Ignored if nodeUuid is set.'),
};
async function resolveNodeUuid(ref) {
    var _a;
    if (ref.nodeUuid) {
        return { uuid: ref.nodeUuid };
    }
    if (!ref.nodeName) {
        return { error: 'resolve-node: provide nodeUuid or nodeName' };
    }
    try {
        const tree = await Editor.Message.request('scene', 'query-node-tree');
        const found = findNodeByNameDeep(tree, ref.nodeName);
        if (!found) {
            return { error: `resolve-node: no node found with name '${ref.nodeName}'` };
        }
        return { uuid: found.uuid };
    }
    catch (err) {
        return { error: `resolve-node: query-node-tree failed: ${(_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : String(err)}` };
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
async function resolveOrToolError(ref) {
    const r = await resolveNodeUuid(ref);
    if ('uuid' in r)
        return { uuid: r.uuid };
    return { response: { success: false, error: r.error } };
}
// Iterative DFS so very deep scenes (theatre/UI prefab forests) don't
// blow the JS call stack. v2.4.1 review fix (gemini): the v2.4.0
// recursion was uncapped.
function findNodeByNameDeep(root, target) {
    if (!root)
        return null;
    const stack = [root];
    while (stack.length > 0) {
        const node = stack.pop();
        if (!node)
            continue;
        if (node.name === target)
            return node;
        if (Array.isArray(node.children)) {
            // Push children in reverse so iteration order matches the
            // recursive walk (first child visited first).
            for (let i = node.children.length - 1; i >= 0; i--) {
                stack.push(node.children[i]);
            }
        }
    }
    return null;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVzb2x2ZS1ub2RlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL2xpYi9yZXNvbHZlLW5vZGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBbUJHOzs7QUE2QkgsMENBaUJDO0FBVUQsZ0RBTUM7QUE1REQscUNBQTZCO0FBRzdCOzs7Ozs7Ozs7OztHQVdHO0FBQ1UsUUFBQSxrQkFBa0IsR0FBRztJQUM5QixRQUFRLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsRUFBRSxDQUFDLFFBQVEsQ0FBQywyRUFBMkUsQ0FBQztJQUNySCxRQUFRLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsRUFBRSxDQUFDLFFBQVEsQ0FBQyxvSUFBb0ksQ0FBQztDQUN4SyxDQUFDO0FBU0osS0FBSyxVQUFVLGVBQWUsQ0FBQyxHQUFrQjs7SUFDcEQsSUFBSSxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDZixPQUFPLEVBQUUsSUFBSSxFQUFFLEdBQUcsQ0FBQyxRQUFRLEVBQUUsQ0FBQztJQUNsQyxDQUFDO0lBQ0QsSUFBSSxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUNoQixPQUFPLEVBQUUsS0FBSyxFQUFFLDRDQUE0QyxFQUFFLENBQUM7SUFDbkUsQ0FBQztJQUNELElBQUksQ0FBQztRQUNELE1BQU0sSUFBSSxHQUFRLE1BQU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLGlCQUFpQixDQUFDLENBQUM7UUFDM0UsTUFBTSxLQUFLLEdBQUcsa0JBQWtCLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUNyRCxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDVCxPQUFPLEVBQUUsS0FBSyxFQUFFLDBDQUEwQyxHQUFHLENBQUMsUUFBUSxHQUFHLEVBQUUsQ0FBQztRQUNoRixDQUFDO1FBQ0QsT0FBTyxFQUFFLElBQUksRUFBRSxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDaEMsQ0FBQztJQUFDLE9BQU8sR0FBUSxFQUFFLENBQUM7UUFDaEIsT0FBTyxFQUFFLEtBQUssRUFBRSx5Q0FBeUMsTUFBQSxHQUFHLGFBQUgsR0FBRyx1QkFBSCxHQUFHLENBQUUsT0FBTyxtQ0FBSSxNQUFNLENBQUMsR0FBRyxDQUFDLEVBQUUsRUFBRSxDQUFDO0lBQzdGLENBQUM7QUFDTCxDQUFDO0FBRUQ7Ozs7Ozs7R0FPRztBQUNJLEtBQUssVUFBVSxrQkFBa0IsQ0FDcEMsR0FBa0I7SUFFbEIsTUFBTSxDQUFDLEdBQUcsTUFBTSxlQUFlLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDckMsSUFBSSxNQUFNLElBQUksQ0FBQztRQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO0lBQ3pDLE9BQU8sRUFBRSxRQUFRLEVBQUUsRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQztBQUM1RCxDQUFDO0FBRUQsc0VBQXNFO0FBQ3RFLGlFQUFpRTtBQUNqRSwwQkFBMEI7QUFDMUIsU0FBUyxrQkFBa0IsQ0FBQyxJQUFTLEVBQUUsTUFBYztJQUNqRCxJQUFJLENBQUMsSUFBSTtRQUFFLE9BQU8sSUFBSSxDQUFDO0lBQ3ZCLE1BQU0sS0FBSyxHQUFVLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDNUIsT0FBTyxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO1FBQ3RCLE1BQU0sSUFBSSxHQUFHLEtBQUssQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUN6QixJQUFJLENBQUMsSUFBSTtZQUFFLFNBQVM7UUFDcEIsSUFBSSxJQUFJLENBQUMsSUFBSSxLQUFLLE1BQU07WUFBRSxPQUFPLElBQUksQ0FBQztRQUN0QyxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7WUFDL0IsMERBQTBEO1lBQzFELDhDQUE4QztZQUM5QyxLQUFLLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7Z0JBQ2pELEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2pDLENBQUM7UUFDTCxDQUFDO0lBQ0wsQ0FBQztJQUNELE9BQU8sSUFBSSxDQUFDO0FBQ2hCLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIHJlc29sdmUtbm9kZSDigJQgYWNjZXB0IGVpdGhlciBgbm9kZVV1aWRgIChwcmVjaXNlKSBvciBgbm9kZU5hbWVgIChmdXp6eSlcbiAqIGFuZCByZXR1cm4gYSBjb25jcmV0ZSBVVUlELiBMZXRzIEFJIGNsaWVudHMgZHJpdmUgc2NlbmUtbXV0YXRpbmcgdG9vbHNcbiAqIHdpdGhvdXQgZmlyc3QgY2FsbGluZyBmaW5kX25vZGVfYnlfbmFtZSB3aGVuIG5hbWVzIGFyZSB1bmlxdWUgZW5vdWdoLlxuICpcbiAqIFJlc29sdXRpb24gcnVsZTpcbiAqICAgMS4gSWYgYG5vZGVVdWlkYCBpcyBwcm92aWRlZCwgaXQgd2lucyAobm8gc2NlbmUgcXVlcnkpLlxuICogICAyLiBPdGhlcndpc2UsIHdhbGsgYHNjZW5lL3F1ZXJ5LW5vZGUtdHJlZWAgZGVwdGgtZmlyc3QgYW5kIHJldHVyblxuICogICAgICB0aGUgZmlyc3Qgbm9kZSB3aG9zZSBgbmFtZWAgbWF0Y2hlcyBgbm9kZU5hbWVgIGV4YWN0bHkuXG4gKlxuICogRmFpbHVyZSBjYXNlcyByZXR1cm4gYW4gZXJyb3Igc3RyaW5nIHRoZSBjYWxsZXIgY2FuIHN1cmZhY2UgYXMgYVxuICogVG9vbFJlc3BvbnNlIOKAlCB0aGV5IGRvIE5PVCB0aHJvdywgc28gaGFuZGxlcnMgY2FuIGZhaWwgY2xlYW5seS5cbiAqXG4gKiBDb2NvcyBgcXVlcnktbm9kZS10cmVlYCByZXR1cm5zIHBsYWluIGB7dXVpZCwgbmFtZSwgY2hpbGRyZW59YFxuICogb2JqZWN0cyAobm90IHRoZSBkdW1wIHNoYXBlIHVzZWQgYnkgYHF1ZXJ5LW5vZGVgKSwgc28gbmFtZSBsb29rdXBzXG4gKiBoZXJlIGFyZSBmYXN0IGFuZCBkb24ndCBuZWVkIHByb3BlcnR5IHVud3JhcHBpbmcuXG4gKlxuICogY29jb3MtY3JlYXRvci1tY3AgKGhhcmFkeSkgdXNlcyBhbiBlcXVpdmFsZW50IGZhbGxiYWNrIGxhZGRlcjsgc2VlXG4gKiBkb2NzL3Jlc2VhcmNoL3JlcG9zL2NvY29zLWNyZWF0b3ItbWNwLm1kIMKnMyAoXCJ1dWlkIC8gbm9kZU5hbWUg5LqM6YG45LiAXCIpLlxuICovXG5cbmltcG9ydCB7IHogfSBmcm9tICcuL3NjaGVtYSc7XG5pbXBvcnQgdHlwZSB7IFRvb2xSZXNwb25zZSB9IGZyb20gJy4uL3R5cGVzJztcblxuLyoqXG4gKiBab2Qgc2NoZW1hIGZyYWdtZW50IHRoYXQgYWRkcyBub2RlTmFtZSBhcyBhIHNpYmxpbmcgb2Ygbm9kZVV1aWQuXG4gKiBTcHJlYWQgaW50byBhIHRvb2wncyBpbnB1dCBzY2hlbWE6XG4gKlxuICogICB6Lm9iamVjdCh7XG4gKiAgICAgICAuLi5ub2RlUmVmZXJlbmNlU2hhcGUsXG4gKiAgICAgICBwcm9wZXJ0eTogei5zdHJpbmcoKSxcbiAqICAgfSlcbiAqXG4gKiBCb3RoIGZpZWxkcyBhcmUgb3B0aW9uYWwgYXQgdGhlIHNjaGVtYSBsZXZlbCDigJQgYHJlc29sdmVOb2RlVXVpZGBcbiAqIGNoZWNrcyBhdCBydW50aW1lIHRoYXQgZXhhY3RseSBvbmUgaXMgcHJvdmlkZWQuXG4gKi9cbmV4cG9ydCBjb25zdCBub2RlUmVmZXJlbmNlU2hhcGUgPSB7XG4gICAgbm9kZVV1aWQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnVGFyZ2V0IG5vZGUgVVVJRC4gUHJvdmlkZSB0aGlzIE9SIG5vZGVOYW1lIChVVUlEIHdpbnMgd2hlbiBib3RoIGFyZSBzZXQpLicpLFxuICAgIG5vZGVOYW1lOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1RhcmdldCBub2RlIG5hbWU7IHJlc29sdmVkIGJ5IGRlcHRoLWZpcnN0IHNjYW4gb2YgdGhlIGN1cnJlbnQgc2NlbmUuIFVzZSBvbmx5IHdoZW4gdGhlIG5hbWUgaXMgdW5pcXVlLiBJZ25vcmVkIGlmIG5vZGVVdWlkIGlzIHNldC4nKSxcbn0gYXMgY29uc3Q7XG5cbmV4cG9ydCBpbnRlcmZhY2UgTm9kZVJlZmVyZW5jZSB7XG4gICAgbm9kZVV1aWQ/OiBzdHJpbmc7XG4gICAgbm9kZU5hbWU/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCB0eXBlIE5vZGVSZXNvbHV0aW9uID0geyB1dWlkOiBzdHJpbmcgfSB8IHsgZXJyb3I6IHN0cmluZyB9O1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVzb2x2ZU5vZGVVdWlkKHJlZjogTm9kZVJlZmVyZW5jZSk6IFByb21pc2U8Tm9kZVJlc29sdXRpb24+IHtcbiAgICBpZiAocmVmLm5vZGVVdWlkKSB7XG4gICAgICAgIHJldHVybiB7IHV1aWQ6IHJlZi5ub2RlVXVpZCB9O1xuICAgIH1cbiAgICBpZiAoIXJlZi5ub2RlTmFtZSkge1xuICAgICAgICByZXR1cm4geyBlcnJvcjogJ3Jlc29sdmUtbm9kZTogcHJvdmlkZSBub2RlVXVpZCBvciBub2RlTmFtZScgfTtcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgdHJlZTogYW55ID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktbm9kZS10cmVlJyk7XG4gICAgICAgIGNvbnN0IGZvdW5kID0gZmluZE5vZGVCeU5hbWVEZWVwKHRyZWUsIHJlZi5ub2RlTmFtZSk7XG4gICAgICAgIGlmICghZm91bmQpIHtcbiAgICAgICAgICAgIHJldHVybiB7IGVycm9yOiBgcmVzb2x2ZS1ub2RlOiBubyBub2RlIGZvdW5kIHdpdGggbmFtZSAnJHtyZWYubm9kZU5hbWV9J2AgfTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4geyB1dWlkOiBmb3VuZC51dWlkIH07XG4gICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgcmV0dXJuIHsgZXJyb3I6IGByZXNvbHZlLW5vZGU6IHF1ZXJ5LW5vZGUtdHJlZSBmYWlsZWQ6ICR7ZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpfWAgfTtcbiAgICB9XG59XG5cbi8qKlxuICogQ29udmVuaWVuY2Ugd3JhcHBlciBmb3IgaGFuZGxlcnMgdGhhdCB3YW50IHRvIGVhcmx5LXJldHVybiBhXG4gKiBgVG9vbFJlc3BvbnNlYCBvbiByZXNvbHV0aW9uIGZhaWx1cmUuIENhbGxlcnMgZG86XG4gKlxuICogICBjb25zdCByZXNvbHZlZCA9IGF3YWl0IHJlc29sdmVPclRvb2xFcnJvcihhcmdzKTtcbiAqICAgaWYgKCdyZXNwb25zZScgaW4gcmVzb2x2ZWQpIHJldHVybiByZXNvbHZlZC5yZXNwb25zZTtcbiAqICAgY29uc3QgdXVpZCA9IHJlc29sdmVkLnV1aWQ7XG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiByZXNvbHZlT3JUb29sRXJyb3IoXG4gICAgcmVmOiBOb2RlUmVmZXJlbmNlLFxuKTogUHJvbWlzZTx7IHV1aWQ6IHN0cmluZyB9IHwgeyByZXNwb25zZTogVG9vbFJlc3BvbnNlIH0+IHtcbiAgICBjb25zdCByID0gYXdhaXQgcmVzb2x2ZU5vZGVVdWlkKHJlZik7XG4gICAgaWYgKCd1dWlkJyBpbiByKSByZXR1cm4geyB1dWlkOiByLnV1aWQgfTtcbiAgICByZXR1cm4geyByZXNwb25zZTogeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHIuZXJyb3IgfSB9O1xufVxuXG4vLyBJdGVyYXRpdmUgREZTIHNvIHZlcnkgZGVlcCBzY2VuZXMgKHRoZWF0cmUvVUkgcHJlZmFiIGZvcmVzdHMpIGRvbid0XG4vLyBibG93IHRoZSBKUyBjYWxsIHN0YWNrLiB2Mi40LjEgcmV2aWV3IGZpeCAoZ2VtaW5pKTogdGhlIHYyLjQuMFxuLy8gcmVjdXJzaW9uIHdhcyB1bmNhcHBlZC5cbmZ1bmN0aW9uIGZpbmROb2RlQnlOYW1lRGVlcChyb290OiBhbnksIHRhcmdldDogc3RyaW5nKTogYW55IHwgbnVsbCB7XG4gICAgaWYgKCFyb290KSByZXR1cm4gbnVsbDtcbiAgICBjb25zdCBzdGFjazogYW55W10gPSBbcm9vdF07XG4gICAgd2hpbGUgKHN0YWNrLmxlbmd0aCA+IDApIHtcbiAgICAgICAgY29uc3Qgbm9kZSA9IHN0YWNrLnBvcCgpO1xuICAgICAgICBpZiAoIW5vZGUpIGNvbnRpbnVlO1xuICAgICAgICBpZiAobm9kZS5uYW1lID09PSB0YXJnZXQpIHJldHVybiBub2RlO1xuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShub2RlLmNoaWxkcmVuKSkge1xuICAgICAgICAgICAgLy8gUHVzaCBjaGlsZHJlbiBpbiByZXZlcnNlIHNvIGl0ZXJhdGlvbiBvcmRlciBtYXRjaGVzIHRoZVxuICAgICAgICAgICAgLy8gcmVjdXJzaXZlIHdhbGsgKGZpcnN0IGNoaWxkIHZpc2l0ZWQgZmlyc3QpLlxuICAgICAgICAgICAgZm9yIChsZXQgaSA9IG5vZGUuY2hpbGRyZW4ubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgICAgICAgICBzdGFjay5wdXNoKG5vZGUuY2hpbGRyZW5baV0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xufVxuIl19