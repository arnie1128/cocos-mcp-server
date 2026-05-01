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
function findNodeByNameDeep(node, target) {
    if (!node)
        return null;
    if (node.name === target)
        return node;
    if (Array.isArray(node.children)) {
        for (const child of node.children) {
            const hit = findNodeByNameDeep(child, target);
            if (hit)
                return hit;
        }
    }
    return null;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVzb2x2ZS1ub2RlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL2xpYi9yZXNvbHZlLW5vZGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBbUJHOzs7QUE2QkgsMENBaUJDO0FBVUQsZ0RBTUM7QUE1REQscUNBQTZCO0FBRzdCOzs7Ozs7Ozs7OztHQVdHO0FBQ1UsUUFBQSxrQkFBa0IsR0FBRztJQUM5QixRQUFRLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsRUFBRSxDQUFDLFFBQVEsQ0FBQywyRUFBMkUsQ0FBQztJQUNySCxRQUFRLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsRUFBRSxDQUFDLFFBQVEsQ0FBQyxvSUFBb0ksQ0FBQztDQUN4SyxDQUFDO0FBU0osS0FBSyxVQUFVLGVBQWUsQ0FBQyxHQUFrQjs7SUFDcEQsSUFBSSxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDZixPQUFPLEVBQUUsSUFBSSxFQUFFLEdBQUcsQ0FBQyxRQUFRLEVBQUUsQ0FBQztJQUNsQyxDQUFDO0lBQ0QsSUFBSSxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUNoQixPQUFPLEVBQUUsS0FBSyxFQUFFLDRDQUE0QyxFQUFFLENBQUM7SUFDbkUsQ0FBQztJQUNELElBQUksQ0FBQztRQUNELE1BQU0sSUFBSSxHQUFRLE1BQU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLGlCQUFpQixDQUFDLENBQUM7UUFDM0UsTUFBTSxLQUFLLEdBQUcsa0JBQWtCLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUNyRCxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDVCxPQUFPLEVBQUUsS0FBSyxFQUFFLDBDQUEwQyxHQUFHLENBQUMsUUFBUSxHQUFHLEVBQUUsQ0FBQztRQUNoRixDQUFDO1FBQ0QsT0FBTyxFQUFFLElBQUksRUFBRSxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDaEMsQ0FBQztJQUFDLE9BQU8sR0FBUSxFQUFFLENBQUM7UUFDaEIsT0FBTyxFQUFFLEtBQUssRUFBRSx5Q0FBeUMsTUFBQSxHQUFHLGFBQUgsR0FBRyx1QkFBSCxHQUFHLENBQUUsT0FBTyxtQ0FBSSxNQUFNLENBQUMsR0FBRyxDQUFDLEVBQUUsRUFBRSxDQUFDO0lBQzdGLENBQUM7QUFDTCxDQUFDO0FBRUQ7Ozs7Ozs7R0FPRztBQUNJLEtBQUssVUFBVSxrQkFBa0IsQ0FDcEMsR0FBa0I7SUFFbEIsTUFBTSxDQUFDLEdBQUcsTUFBTSxlQUFlLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDckMsSUFBSSxNQUFNLElBQUksQ0FBQztRQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO0lBQ3pDLE9BQU8sRUFBRSxRQUFRLEVBQUUsRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQztBQUM1RCxDQUFDO0FBRUQsU0FBUyxrQkFBa0IsQ0FBQyxJQUFTLEVBQUUsTUFBYztJQUNqRCxJQUFJLENBQUMsSUFBSTtRQUFFLE9BQU8sSUFBSSxDQUFDO0lBQ3ZCLElBQUksSUFBSSxDQUFDLElBQUksS0FBSyxNQUFNO1FBQUUsT0FBTyxJQUFJLENBQUM7SUFDdEMsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO1FBQy9CLEtBQUssTUFBTSxLQUFLLElBQUksSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ2hDLE1BQU0sR0FBRyxHQUFHLGtCQUFrQixDQUFDLEtBQUssRUFBRSxNQUFNLENBQUMsQ0FBQztZQUM5QyxJQUFJLEdBQUc7Z0JBQUUsT0FBTyxHQUFHLENBQUM7UUFDeEIsQ0FBQztJQUNMLENBQUM7SUFDRCxPQUFPLElBQUksQ0FBQztBQUNoQixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiByZXNvbHZlLW5vZGUg4oCUIGFjY2VwdCBlaXRoZXIgYG5vZGVVdWlkYCAocHJlY2lzZSkgb3IgYG5vZGVOYW1lYCAoZnV6enkpXG4gKiBhbmQgcmV0dXJuIGEgY29uY3JldGUgVVVJRC4gTGV0cyBBSSBjbGllbnRzIGRyaXZlIHNjZW5lLW11dGF0aW5nIHRvb2xzXG4gKiB3aXRob3V0IGZpcnN0IGNhbGxpbmcgZmluZF9ub2RlX2J5X25hbWUgd2hlbiBuYW1lcyBhcmUgdW5pcXVlIGVub3VnaC5cbiAqXG4gKiBSZXNvbHV0aW9uIHJ1bGU6XG4gKiAgIDEuIElmIGBub2RlVXVpZGAgaXMgcHJvdmlkZWQsIGl0IHdpbnMgKG5vIHNjZW5lIHF1ZXJ5KS5cbiAqICAgMi4gT3RoZXJ3aXNlLCB3YWxrIGBzY2VuZS9xdWVyeS1ub2RlLXRyZWVgIGRlcHRoLWZpcnN0IGFuZCByZXR1cm5cbiAqICAgICAgdGhlIGZpcnN0IG5vZGUgd2hvc2UgYG5hbWVgIG1hdGNoZXMgYG5vZGVOYW1lYCBleGFjdGx5LlxuICpcbiAqIEZhaWx1cmUgY2FzZXMgcmV0dXJuIGFuIGVycm9yIHN0cmluZyB0aGUgY2FsbGVyIGNhbiBzdXJmYWNlIGFzIGFcbiAqIFRvb2xSZXNwb25zZSDigJQgdGhleSBkbyBOT1QgdGhyb3csIHNvIGhhbmRsZXJzIGNhbiBmYWlsIGNsZWFubHkuXG4gKlxuICogQ29jb3MgYHF1ZXJ5LW5vZGUtdHJlZWAgcmV0dXJucyBwbGFpbiBge3V1aWQsIG5hbWUsIGNoaWxkcmVufWBcbiAqIG9iamVjdHMgKG5vdCB0aGUgZHVtcCBzaGFwZSB1c2VkIGJ5IGBxdWVyeS1ub2RlYCksIHNvIG5hbWUgbG9va3Vwc1xuICogaGVyZSBhcmUgZmFzdCBhbmQgZG9uJ3QgbmVlZCBwcm9wZXJ0eSB1bndyYXBwaW5nLlxuICpcbiAqIGNvY29zLWNyZWF0b3ItbWNwIChoYXJhZHkpIHVzZXMgYW4gZXF1aXZhbGVudCBmYWxsYmFjayBsYWRkZXI7IHNlZVxuICogZG9jcy9yZXNlYXJjaC9yZXBvcy9jb2Nvcy1jcmVhdG9yLW1jcC5tZCDCpzMgKFwidXVpZCAvIG5vZGVOYW1lIOS6jOmBuOS4gFwiKS5cbiAqL1xuXG5pbXBvcnQgeyB6IH0gZnJvbSAnLi9zY2hlbWEnO1xuaW1wb3J0IHR5cGUgeyBUb29sUmVzcG9uc2UgfSBmcm9tICcuLi90eXBlcyc7XG5cbi8qKlxuICogWm9kIHNjaGVtYSBmcmFnbWVudCB0aGF0IGFkZHMgbm9kZU5hbWUgYXMgYSBzaWJsaW5nIG9mIG5vZGVVdWlkLlxuICogU3ByZWFkIGludG8gYSB0b29sJ3MgaW5wdXQgc2NoZW1hOlxuICpcbiAqICAgei5vYmplY3Qoe1xuICogICAgICAgLi4ubm9kZVJlZmVyZW5jZVNoYXBlLFxuICogICAgICAgcHJvcGVydHk6IHouc3RyaW5nKCksXG4gKiAgIH0pXG4gKlxuICogQm90aCBmaWVsZHMgYXJlIG9wdGlvbmFsIGF0IHRoZSBzY2hlbWEgbGV2ZWwg4oCUIGByZXNvbHZlTm9kZVV1aWRgXG4gKiBjaGVja3MgYXQgcnVudGltZSB0aGF0IGV4YWN0bHkgb25lIGlzIHByb3ZpZGVkLlxuICovXG5leHBvcnQgY29uc3Qgbm9kZVJlZmVyZW5jZVNoYXBlID0ge1xuICAgIG5vZGVVdWlkOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1RhcmdldCBub2RlIFVVSUQuIFByb3ZpZGUgdGhpcyBPUiBub2RlTmFtZSAoVVVJRCB3aW5zIHdoZW4gYm90aCBhcmUgc2V0KS4nKSxcbiAgICBub2RlTmFtZTogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdUYXJnZXQgbm9kZSBuYW1lOyByZXNvbHZlZCBieSBkZXB0aC1maXJzdCBzY2FuIG9mIHRoZSBjdXJyZW50IHNjZW5lLiBVc2Ugb25seSB3aGVuIHRoZSBuYW1lIGlzIHVuaXF1ZS4gSWdub3JlZCBpZiBub2RlVXVpZCBpcyBzZXQuJyksXG59IGFzIGNvbnN0O1xuXG5leHBvcnQgaW50ZXJmYWNlIE5vZGVSZWZlcmVuY2Uge1xuICAgIG5vZGVVdWlkPzogc3RyaW5nO1xuICAgIG5vZGVOYW1lPzogc3RyaW5nO1xufVxuXG5leHBvcnQgdHlwZSBOb2RlUmVzb2x1dGlvbiA9IHsgdXVpZDogc3RyaW5nIH0gfCB7IGVycm9yOiBzdHJpbmcgfTtcblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJlc29sdmVOb2RlVXVpZChyZWY6IE5vZGVSZWZlcmVuY2UpOiBQcm9taXNlPE5vZGVSZXNvbHV0aW9uPiB7XG4gICAgaWYgKHJlZi5ub2RlVXVpZCkge1xuICAgICAgICByZXR1cm4geyB1dWlkOiByZWYubm9kZVV1aWQgfTtcbiAgICB9XG4gICAgaWYgKCFyZWYubm9kZU5hbWUpIHtcbiAgICAgICAgcmV0dXJuIHsgZXJyb3I6ICdyZXNvbHZlLW5vZGU6IHByb3ZpZGUgbm9kZVV1aWQgb3Igbm9kZU5hbWUnIH07XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHRyZWU6IGFueSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LW5vZGUtdHJlZScpO1xuICAgICAgICBjb25zdCBmb3VuZCA9IGZpbmROb2RlQnlOYW1lRGVlcCh0cmVlLCByZWYubm9kZU5hbWUpO1xuICAgICAgICBpZiAoIWZvdW5kKSB7XG4gICAgICAgICAgICByZXR1cm4geyBlcnJvcjogYHJlc29sdmUtbm9kZTogbm8gbm9kZSBmb3VuZCB3aXRoIG5hbWUgJyR7cmVmLm5vZGVOYW1lfSdgIH07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgdXVpZDogZm91bmQudXVpZCB9O1xuICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgIHJldHVybiB7IGVycm9yOiBgcmVzb2x2ZS1ub2RlOiBxdWVyeS1ub2RlLXRyZWUgZmFpbGVkOiAke2Vycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKX1gIH07XG4gICAgfVxufVxuXG4vKipcbiAqIENvbnZlbmllbmNlIHdyYXBwZXIgZm9yIGhhbmRsZXJzIHRoYXQgd2FudCB0byBlYXJseS1yZXR1cm4gYVxuICogYFRvb2xSZXNwb25zZWAgb24gcmVzb2x1dGlvbiBmYWlsdXJlLiBDYWxsZXJzIGRvOlxuICpcbiAqICAgY29uc3QgcmVzb2x2ZWQgPSBhd2FpdCByZXNvbHZlT3JUb29sRXJyb3IoYXJncyk7XG4gKiAgIGlmICgncmVzcG9uc2UnIGluIHJlc29sdmVkKSByZXR1cm4gcmVzb2x2ZWQucmVzcG9uc2U7XG4gKiAgIGNvbnN0IHV1aWQgPSByZXNvbHZlZC51dWlkO1xuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVzb2x2ZU9yVG9vbEVycm9yKFxuICAgIHJlZjogTm9kZVJlZmVyZW5jZSxcbik6IFByb21pc2U8eyB1dWlkOiBzdHJpbmcgfSB8IHsgcmVzcG9uc2U6IFRvb2xSZXNwb25zZSB9PiB7XG4gICAgY29uc3QgciA9IGF3YWl0IHJlc29sdmVOb2RlVXVpZChyZWYpO1xuICAgIGlmICgndXVpZCcgaW4gcikgcmV0dXJuIHsgdXVpZDogci51dWlkIH07XG4gICAgcmV0dXJuIHsgcmVzcG9uc2U6IHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiByLmVycm9yIH0gfTtcbn1cblxuZnVuY3Rpb24gZmluZE5vZGVCeU5hbWVEZWVwKG5vZGU6IGFueSwgdGFyZ2V0OiBzdHJpbmcpOiBhbnkgfCBudWxsIHtcbiAgICBpZiAoIW5vZGUpIHJldHVybiBudWxsO1xuICAgIGlmIChub2RlLm5hbWUgPT09IHRhcmdldCkgcmV0dXJuIG5vZGU7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkobm9kZS5jaGlsZHJlbikpIHtcbiAgICAgICAgZm9yIChjb25zdCBjaGlsZCBvZiBub2RlLmNoaWxkcmVuKSB7XG4gICAgICAgICAgICBjb25zdCBoaXQgPSBmaW5kTm9kZUJ5TmFtZURlZXAoY2hpbGQsIHRhcmdldCk7XG4gICAgICAgICAgICBpZiAoaGl0KSByZXR1cm4gaGl0O1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xufVxuIl19