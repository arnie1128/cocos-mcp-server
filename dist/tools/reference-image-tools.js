"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReferenceImageTools = void 0;
const schema_1 = require("../lib/schema");
const define_tools_1 = require("../lib/define-tools");
// v2.9.0 T-V29-6 (RomaRogov macro-tool enum routing): collapse 12 flat
// reference-image tools into a single `reference_image({op, ...})` macro
// tool. Reasons:
//   - Token cost: 12 separate tool schemas vs 1 union saves ~kb on every
//     tools/list response.
//   - Coherence: all ops share the same domain (cocos reference-image
//     module) and dispatch to the same Editor.Message channel; flat
//     collapse keeps the dispatch trivial.
//   - LLM ergonomics: a single tool with `op` enum is easier for AI to
//     pick than 12 near-identically-named flat tools.
//
// Schema shape: flat optional fields per op (NOT z.discriminatedUnion).
// discriminatedUnion compiles to JSON Schema `oneOf` with per-branch
// required arrays — gemini-compat works in zod 4 / draft-7, but the
// flat schema is simpler for every LLM tool-call parser and easier to
// extend when new ops are added.
//
// Backward compatibility: this is a BREAKING change for callers that
// addressed individual `reference_image_<verb>` tool names. We
// intentionally don't ship compat aliases — that would defeat the
// token-cost reduction. v2.9.x is the migration window; CHANGELOG +
// HANDOFF document the new shape so external clients can update.
class ReferenceImageTools {
    constructor() {
        const defs = [
            {
                name: 'manage',
                title: 'Manage reference images',
                description: 'Manage scene reference images through the cocos reference-image module. Op-routing macro: pick `op` and supply the matching args. Replaces the v2.8.x flat surface (referenceImage_add_reference_image / remove_reference_image / switch_reference_image / set_reference_image_data / query_reference_image_config / query_current_reference_image / refresh_reference_image / set_reference_image_position / set_reference_image_scale / set_reference_image_opacity / list_reference_images / clear_all_reference_images — 12 → 1).',
                inputSchema: schema_1.z.object({
                    op: schema_1.z.enum([
                        'add', 'remove', 'switch', 'set_data', 'query_config',
                        'query_current', 'refresh', 'set_position', 'set_scale',
                        'set_opacity', 'list', 'clear_all',
                    ]).describe('Op selector. "add" — register absolute image paths (paths required). "remove" — remove specific paths or current image when omitted. "switch" — switch active image (path required, sceneUUID optional). "set_data" — set raw display property (key + value required). "query_config" — read module config. "query_current" — read current image state. "refresh" — refresh display without changing data. "set_position" — set x/y offsets. "set_scale" — set sx/sy scale 0.1-10. "set_opacity" — set opacity 0-1. "list" — read config + current data. "clear_all" — remove all reference images.'),
                    paths: schema_1.z.array(schema_1.z.string()).optional().describe('For op="add" (required) or op="remove" (optional — omit to remove current).'),
                    path: schema_1.z.string().optional().describe('For op="switch" (required).'),
                    sceneUUID: schema_1.z.string().optional().describe('For op="switch" (optional scene UUID scope).'),
                    key: schema_1.z.enum(['path', 'x', 'y', 'sx', 'sy', 'opacity']).optional().describe('For op="set_data" (required) — property key.'),
                    value: schema_1.z.any().optional().describe('For op="set_data" (required) — property value.'),
                    x: schema_1.z.number().optional().describe('For op="set_position" (required).'),
                    y: schema_1.z.number().optional().describe('For op="set_position" (required).'),
                    sx: schema_1.z.number().min(0.1).max(10).optional().describe('For op="set_scale" (required), 0.1-10.'),
                    sy: schema_1.z.number().min(0.1).max(10).optional().describe('For op="set_scale" (required), 0.1-10.'),
                    opacity: schema_1.z.number().min(0).max(1).optional().describe('For op="set_opacity" (required), 0-1.'),
                }),
                handler: a => this.dispatch(a),
            },
        ];
        this.exec = (0, define_tools_1.defineTools)(defs);
    }
    getTools() { return this.exec.getTools(); }
    execute(toolName, args) { return this.exec.execute(toolName, args); }
    // Per-op required-field validation. Each op's required args are
    // reasserted here because the flat zod schema marks them all
    // optional for surface simplicity. Failure returns a clear
    // structured error so AI can correct the call.
    requireFields(op, args, ...keys) {
        for (const k of keys) {
            if (args[k] === undefined || args[k] === null) {
                return `reference_image(op="${op}") requires ${k}; got ${JSON.stringify(args)}.`;
            }
        }
        return null;
    }
    async dispatch(args) {
        var _a, _b, _c;
        const op = args.op;
        try {
            switch (op) {
                case 'add': {
                    const err = this.requireFields(op, args, 'paths');
                    if (err)
                        return { success: false, error: err };
                    // v2.9.5 review fix (Claude 🟡): the schema marks
                    // `paths` as `array(string)` but the dispatcher
                    // requireFields helper only checks present-and-non-null.
                    // A misshapen call (string / number) would otherwise
                    // pass through to Editor.Message and the response
                    // message would say "Added undefined reference image(s)".
                    if (!Array.isArray(args.paths) || args.paths.length === 0) {
                        return { success: false, error: `reference_image(op="add") requires paths to be a non-empty array of strings; got ${JSON.stringify(args.paths)}.` };
                    }
                    await Editor.Message.request('reference-image', 'add-image', args.paths);
                    return {
                        success: true,
                        data: { op, addedPaths: args.paths, count: args.paths.length },
                        message: `Added ${args.paths.length} reference image(s)`,
                    };
                }
                case 'remove': {
                    await Editor.Message.request('reference-image', 'remove-image', args.paths);
                    return {
                        success: true,
                        data: { op, removedPaths: (_a = args.paths) !== null && _a !== void 0 ? _a : null },
                        message: args.paths && args.paths.length > 0
                            ? `Removed ${args.paths.length} reference image(s)`
                            : 'Removed current reference image',
                    };
                }
                case 'switch': {
                    const err = this.requireFields(op, args, 'path');
                    if (err)
                        return { success: false, error: err };
                    const callArgs = args.sceneUUID ? [args.path, args.sceneUUID] : [args.path];
                    await Editor.Message.request('reference-image', 'switch-image', ...callArgs);
                    return {
                        success: true,
                        data: { op, path: args.path, sceneUUID: (_b = args.sceneUUID) !== null && _b !== void 0 ? _b : null },
                        message: `Switched to reference image: ${args.path}`,
                    };
                }
                case 'set_data': {
                    const err = this.requireFields(op, args, 'key', 'value');
                    if (err)
                        return { success: false, error: err };
                    await Editor.Message.request('reference-image', 'set-image-data', args.key, args.value);
                    return {
                        success: true,
                        data: { op, key: args.key, value: args.value },
                        message: `Reference image ${args.key} set to ${args.value}`,
                    };
                }
                case 'query_config': {
                    const config = await Editor.Message.request('reference-image', 'query-config');
                    return { success: true, data: { op, config } };
                }
                case 'query_current': {
                    const current = await Editor.Message.request('reference-image', 'query-current');
                    return { success: true, data: { op, current } };
                }
                case 'refresh': {
                    await Editor.Message.request('reference-image', 'refresh');
                    return { success: true, data: { op }, message: 'Reference image refreshed' };
                }
                case 'set_position': {
                    const err = this.requireFields(op, args, 'x', 'y');
                    if (err)
                        return { success: false, error: err };
                    await Editor.Message.request('reference-image', 'set-image-data', 'x', args.x);
                    await Editor.Message.request('reference-image', 'set-image-data', 'y', args.y);
                    return {
                        success: true,
                        data: { op, x: args.x, y: args.y },
                        message: `Reference image position set to (${args.x}, ${args.y})`,
                    };
                }
                case 'set_scale': {
                    const err = this.requireFields(op, args, 'sx', 'sy');
                    if (err)
                        return { success: false, error: err };
                    await Editor.Message.request('reference-image', 'set-image-data', 'sx', args.sx);
                    await Editor.Message.request('reference-image', 'set-image-data', 'sy', args.sy);
                    return {
                        success: true,
                        data: { op, sx: args.sx, sy: args.sy },
                        message: `Reference image scale set to (${args.sx}, ${args.sy})`,
                    };
                }
                case 'set_opacity': {
                    const err = this.requireFields(op, args, 'opacity');
                    if (err)
                        return { success: false, error: err };
                    await Editor.Message.request('reference-image', 'set-image-data', 'opacity', args.opacity);
                    return {
                        success: true,
                        data: { op, opacity: args.opacity },
                        message: `Reference image opacity set to ${args.opacity}`,
                    };
                }
                case 'list': {
                    const config = await Editor.Message.request('reference-image', 'query-config');
                    const current = await Editor.Message.request('reference-image', 'query-current');
                    return { success: true, data: { op, config, current } };
                }
                case 'clear_all': {
                    await Editor.Message.request('reference-image', 'remove-image');
                    return { success: true, data: { op }, message: 'All reference images cleared' };
                }
                default:
                    return { success: false, error: `Unknown reference_image op: ${op}` };
            }
        }
        catch (err) {
            return { success: false, error: (_c = err === null || err === void 0 ? void 0 : err.message) !== null && _c !== void 0 ? _c : String(err) };
        }
    }
}
exports.ReferenceImageTools = ReferenceImageTools;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVmZXJlbmNlLWltYWdlLXRvb2xzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL3Rvb2xzL3JlZmVyZW5jZS1pbWFnZS10b29scy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSwwQ0FBa0M7QUFDbEMsc0RBQTJEO0FBRTNELHVFQUF1RTtBQUN2RSx5RUFBeUU7QUFDekUsaUJBQWlCO0FBQ2pCLHlFQUF5RTtBQUN6RSwyQkFBMkI7QUFDM0Isc0VBQXNFO0FBQ3RFLG9FQUFvRTtBQUNwRSwyQ0FBMkM7QUFDM0MsdUVBQXVFO0FBQ3ZFLHNEQUFzRDtBQUN0RCxFQUFFO0FBQ0Ysd0VBQXdFO0FBQ3hFLHFFQUFxRTtBQUNyRSxvRUFBb0U7QUFDcEUsc0VBQXNFO0FBQ3RFLGlDQUFpQztBQUNqQyxFQUFFO0FBQ0YscUVBQXFFO0FBQ3JFLCtEQUErRDtBQUMvRCxrRUFBa0U7QUFDbEUsb0VBQW9FO0FBQ3BFLGlFQUFpRTtBQUNqRSxNQUFhLG1CQUFtQjtJQUc1QjtRQUNJLE1BQU0sSUFBSSxHQUFjO1lBQ3BCO2dCQUNJLElBQUksRUFBRSxRQUFRO2dCQUNkLEtBQUssRUFBRSx5QkFBeUI7Z0JBQ2hDLFdBQVcsRUFBRSx1Z0JBQXVnQjtnQkFDcGhCLFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDO29CQUNsQixFQUFFLEVBQUUsVUFBQyxDQUFDLElBQUksQ0FBQzt3QkFDUCxLQUFLLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxVQUFVLEVBQUUsY0FBYzt3QkFDckQsZUFBZSxFQUFFLFNBQVMsRUFBRSxjQUFjLEVBQUUsV0FBVzt3QkFDdkQsYUFBYSxFQUFFLE1BQU0sRUFBRSxXQUFXO3FCQUNyQyxDQUFDLENBQUMsUUFBUSxDQUNQLHFrQkFBcWtCLENBQ3hrQjtvQkFDRCxLQUFLLEVBQUUsVUFBQyxDQUFDLEtBQUssQ0FBQyxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxRQUFR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bERlZmluaXRpb24sIFRvb2xSZXNwb25zZSwgVG9vbEV4ZWN1dG9yIH0gZnJvbSAnLi4vdHlwZXMnO1xuaW1wb3J0IHsgeiB9IGZyb20gJy4uL2xpYi9zY2hlbWEnO1xuaW1wb3J0IHsgZGVmaW5lVG9vbHMsIFRvb2xEZWYgfSBmcm9tICcuLi9saWIvZGVmaW5lLXRvb2xzJztcblxuLy8gdjIuOS4wIFQtVjI5LTYgKFJvbWFSb2dvdiBtYWNyby10b29sIGVudW0gcm91dGluZyk6IGNvbGxhcHNlIDEyIGZsYXRcbi8vIHJlZmVyZW5jZS1pbWFnZSB0b29scyBpbnRvIGEgc2luZ2xlIGByZWZlcmVuY2VfaW1hZ2Uoe29wLCAuLi59KWAgbWFjcm9cbi8vIHRvb2wuIFJlYXNvbnM6XG4vLyAgIC0gVG9rZW4gY29zdDogMTIgc2VwYXJhdGUgdG9vbCBzY2hlbWFzIHZzIDEgdW5pb24gc2F2ZXMgfmtiIG9uIGV2ZXJ5XG4vLyAgICAgdG9vbHMvbGlzdCByZXNwb25zZS5cbi8vICAgLSBDb2hlcmVuY2U6IGFsbCBvcHMgc2hhcmUgdGhlIHNhbWUgZG9tYWluIChjb2NvcyByZWZlcmVuY2UtaW1hZ2Vcbi8vICAgICBtb2R1bGUpIGFuZCBkaXNwYXRjaCB0byB0aGUgc2FtZSBFZGl0b3IuTWVzc2FnZSBjaGFubmVsOyBmbGF0XG4vLyAgICAgY29sbGFwc2Uga2VlcHMgdGhlIGRpc3BhdGNoIHRyaXZpYWwuXG4vLyAgIC0gTExNIGVyZ29ub21pY3M6IGEgc2luZ2xlIHRvb2wgd2l0aCBgb3BgIGVudW0gaXMgZWFzaWVyIGZvciBBSSB0b1xuLy8gICAgIHBpY2sgdGhhbiAxMiBuZWFyLWlkZW50aWNhbGx5LW5hbWVkIGZsYXQgdG9vbHMuXG4vL1xuLy8gU2NoZW1hIHNoYXBlOiBmbGF0IG9wdGlvbmFsIGZpZWxkcyBwZXIgb3AgKE5PVCB6LmRpc2NyaW1pbmF0ZWRVbmlvbikuXG4vLyBkaXNjcmltaW5hdGVkVW5pb24gY29tcGlsZXMgdG8gSlNPTiBTY2hlbWEgYG9uZU9mYCB3aXRoIHBlci1icmFuY2hcbi8vIHJlcXVpcmVkIGFycmF5cyDigJQgZ2VtaW5pLWNvbXBhdCB3b3JrcyBpbiB6b2QgNCAvIGRyYWZ0LTcsIGJ1dCB0aGVcbi8vIGZsYXQgc2NoZW1hIGlzIHNpbXBsZXIgZm9yIGV2ZXJ5IExMTSB0b29sLWNhbGwgcGFyc2VyIGFuZCBlYXNpZXIgdG9cbi8vIGV4dGVuZCB3aGVuIG5ldyBvcHMgYXJlIGFkZGVkLlxuLy9cbi8vIEJhY2t3YXJkIGNvbXBhdGliaWxpdHk6IHRoaXMgaXMgYSBCUkVBS0lORyBjaGFuZ2UgZm9yIGNhbGxlcnMgdGhhdFxuLy8gYWRkcmVzc2VkIGluZGl2aWR1YWwgYHJlZmVyZW5jZV9pbWFnZV88dmVyYj5gIHRvb2wgbmFtZXMuIFdlXG4vLyBpbnRlbnRpb25hbGx5IGRvbid0IHNoaXAgY29tcGF0IGFsaWFzZXMg4oCUIHRoYXQgd291bGQgZGVmZWF0IHRoZVxuLy8gdG9rZW4tY29zdCByZWR1Y3Rpb24uIHYyLjkueCBpcyB0aGUgbWlncmF0aW9uIHdpbmRvdzsgQ0hBTkdFTE9HICtcbi8vIEhBTkRPRkYgZG9jdW1lbnQgdGhlIG5ldyBzaGFwZSBzbyBleHRlcm5hbCBjbGllbnRzIGNhbiB1cGRhdGUuXG5leHBvcnQgY2xhc3MgUmVmZXJlbmNlSW1hZ2VUb29scyBpbXBsZW1lbnRzIFRvb2xFeGVjdXRvciB7XG4gICAgcHJpdmF0ZSByZWFkb25seSBleGVjOiBUb29sRXhlY3V0b3I7XG5cbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgY29uc3QgZGVmczogVG9vbERlZltdID0gW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdtYW5hZ2UnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnTWFuYWdlIHJlZmVyZW5jZSBpbWFnZXMnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnTWFuYWdlIHNjZW5lIHJlZmVyZW5jZSBpbWFnZXMgdGhyb3VnaCB0aGUgY29jb3MgcmVmZXJlbmNlLWltYWdlIG1vZHVsZS4gT3Atcm91dGluZyBtYWNybzogcGljayBgb3BgIGFuZCBzdXBwbHkgdGhlIG1hdGNoaW5nIGFyZ3MuIFJlcGxhY2VzIHRoZSB2Mi44LnggZmxhdCBzdXJmYWNlIChyZWZlcmVuY2VJbWFnZV9hZGRfcmVmZXJlbmNlX2ltYWdlIC8gcmVtb3ZlX3JlZmVyZW5jZV9pbWFnZSAvIHN3aXRjaF9yZWZlcmVuY2VfaW1hZ2UgLyBzZXRfcmVmZXJlbmNlX2ltYWdlX2RhdGEgLyBxdWVyeV9yZWZlcmVuY2VfaW1hZ2VfY29uZmlnIC8gcXVlcnlfY3VycmVudF9yZWZlcmVuY2VfaW1hZ2UgLyByZWZyZXNoX3JlZmVyZW5jZV9pbWFnZSAvIHNldF9yZWZlcmVuY2VfaW1hZ2VfcG9zaXRpb24gLyBzZXRfcmVmZXJlbmNlX2ltYWdlX3NjYWxlIC8gc2V0X3JlZmVyZW5jZV9pbWFnZV9vcGFjaXR5IC8gbGlzdF9yZWZlcmVuY2VfaW1hZ2VzIC8gY2xlYXJfYWxsX3JlZmVyZW5jZV9pbWFnZXMg4oCUIDEyIOKGkiAxKS4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIG9wOiB6LmVudW0oW1xuICAgICAgICAgICAgICAgICAgICAgICAgJ2FkZCcsICdyZW1vdmUnLCAnc3dpdGNoJywgJ3NldF9kYXRhJywgJ3F1ZXJ5X2NvbmZpZycsXG4gICAgICAgICAgICAgICAgICAgICAgICAncXVlcnlfY3VycmVudCcsICdyZWZyZXNoJywgJ3NldF9wb3NpdGlvbicsICdzZXRfc2NhbGUnLFxuICAgICAgICAgICAgICAgICAgICAgICAgJ3NldF9vcGFjaXR5JywgJ2xpc3QnLCAnY2xlYXJfYWxsJyxcbiAgICAgICAgICAgICAgICAgICAgXSkuZGVzY3JpYmUoXG4gICAgICAgICAgICAgICAgICAgICAgICAnT3Agc2VsZWN0b3IuIFwiYWRkXCIg4oCUIHJlZ2lzdGVyIGFic29sdXRlIGltYWdlIHBhdGhzIChwYXRocyByZXF1aXJlZCkuIFwicmVtb3ZlXCIg4oCUIHJlbW92ZSBzcGVjaWZpYyBwYXRocyBvciBjdXJyZW50IGltYWdlIHdoZW4gb21pdHRlZC4gXCJzd2l0Y2hcIiDigJQgc3dpdGNoIGFjdGl2ZSBpbWFnZSAocGF0aCByZXF1aXJlZCwgc2NlbmVVVUlEIG9wdGlvbmFsKS4gXCJzZXRfZGF0YVwiIOKAlCBzZXQgcmF3IGRpc3BsYXkgcHJvcGVydHkgKGtleSArIHZhbHVlIHJlcXVpcmVkKS4gXCJxdWVyeV9jb25maWdcIiDigJQgcmVhZCBtb2R1bGUgY29uZmlnLiBcInF1ZXJ5X2N1cnJlbnRcIiDigJQgcmVhZCBjdXJyZW50IGltYWdlIHN0YXRlLiBcInJlZnJlc2hcIiDigJQgcmVmcmVzaCBkaXNwbGF5IHdpdGhvdXQgY2hhbmdpbmcgZGF0YS4gXCJzZXRfcG9zaXRpb25cIiDigJQgc2V0IHgveSBvZmZzZXRzLiBcInNldF9zY2FsZVwiIOKAlCBzZXQgc3gvc3kgc2NhbGUgMC4xLTEwLiBcInNldF9vcGFjaXR5XCIg4oCUIHNldCBvcGFjaXR5IDAtMS4gXCJsaXN0XCIg4oCUIHJlYWQgY29uZmlnICsgY3VycmVudCBkYXRhLiBcImNsZWFyX2FsbFwiIOKAlCByZW1vdmUgYWxsIHJlZmVyZW5jZSBpbWFnZXMuJ1xuICAgICAgICAgICAgICAgICAgICApLFxuICAgICAgICAgICAgICAgICAgICBwYXRoczogei5hcnJheSh6LnN0cmluZygpKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdGb3Igb3A9XCJhZGRcIiAocmVxdWlyZWQpIG9yIG9wPVwicmVtb3ZlXCIgKG9wdGlvbmFsIOKAlCBvbWl0IHRvIHJlbW92ZSBjdXJyZW50KS4nKSxcbiAgICAgICAgICAgICAgICAgICAgcGF0aDogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdGb3Igb3A9XCJzd2l0Y2hcIiAocmVxdWlyZWQpLicpLFxuICAgICAgICAgICAgICAgICAgICBzY2VuZVVVSUQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnRm9yIG9wPVwic3dpdGNoXCIgKG9wdGlvbmFsIHNjZW5lIFVVSUQgc2NvcGUpLicpLFxuICAgICAgICAgICAgICAgICAgICBrZXk6IHouZW51bShbJ3BhdGgnLCAneCcsICd5JywgJ3N4JywgJ3N5JywgJ29wYWNpdHknXSkub3B0aW9uYWwoKS5kZXNjcmliZSgnRm9yIG9wPVwic2V0X2RhdGFcIiAocmVxdWlyZWQpIOKAlCBwcm9wZXJ0eSBrZXkuJyksXG4gICAgICAgICAgICAgICAgICAgIHZhbHVlOiB6LmFueSgpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0ZvciBvcD1cInNldF9kYXRhXCIgKHJlcXVpcmVkKSDigJQgcHJvcGVydHkgdmFsdWUuJyksXG4gICAgICAgICAgICAgICAgICAgIHg6IHoubnVtYmVyKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnRm9yIG9wPVwic2V0X3Bvc2l0aW9uXCIgKHJlcXVpcmVkKS4nKSxcbiAgICAgICAgICAgICAgICAgICAgeTogei5udW1iZXIoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdGb3Igb3A9XCJzZXRfcG9zaXRpb25cIiAocmVxdWlyZWQpLicpLFxuICAgICAgICAgICAgICAgICAgICBzeDogei5udW1iZXIoKS5taW4oMC4xKS5tYXgoMTApLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0ZvciBvcD1cInNldF9zY2FsZVwiIChyZXF1aXJlZCksIDAuMS0xMC4nKSxcbiAgICAgICAgICAgICAgICAgICAgc3k6IHoubnVtYmVyKCkubWluKDAuMSkubWF4KDEwKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdGb3Igb3A9XCJzZXRfc2NhbGVcIiAocmVxdWlyZWQpLCAwLjEtMTAuJyksXG4gICAgICAgICAgICAgICAgICAgIG9wYWNpdHk6IHoubnVtYmVyKCkubWluKDApLm1heCgxKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdGb3Igb3A9XCJzZXRfb3BhY2l0eVwiIChyZXF1aXJlZCksIDAtMS4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMuZGlzcGF0Y2goYSksXG4gICAgICAgICAgICB9LFxuICAgICAgICBdO1xuICAgICAgICB0aGlzLmV4ZWMgPSBkZWZpbmVUb29scyhkZWZzKTtcbiAgICB9XG5cbiAgICBnZXRUb29scygpOiBUb29sRGVmaW5pdGlvbltdIHsgcmV0dXJuIHRoaXMuZXhlYy5nZXRUb29scygpOyB9XG4gICAgZXhlY3V0ZSh0b29sTmFtZTogc3RyaW5nLCBhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4geyByZXR1cm4gdGhpcy5leGVjLmV4ZWN1dGUodG9vbE5hbWUsIGFyZ3MpOyB9XG5cbiAgICAvLyBQZXItb3AgcmVxdWlyZWQtZmllbGQgdmFsaWRhdGlvbi4gRWFjaCBvcCdzIHJlcXVpcmVkIGFyZ3MgYXJlXG4gICAgLy8gcmVhc3NlcnRlZCBoZXJlIGJlY2F1c2UgdGhlIGZsYXQgem9kIHNjaGVtYSBtYXJrcyB0aGVtIGFsbFxuICAgIC8vIG9wdGlvbmFsIGZvciBzdXJmYWNlIHNpbXBsaWNpdHkuIEZhaWx1cmUgcmV0dXJucyBhIGNsZWFyXG4gICAgLy8gc3RydWN0dXJlZCBlcnJvciBzbyBBSSBjYW4gY29ycmVjdCB0aGUgY2FsbC5cbiAgICBwcml2YXRlIHJlcXVpcmVGaWVsZHMob3A6IHN0cmluZywgYXJnczogYW55LCAuLi5rZXlzOiBzdHJpbmdbXSk6IHN0cmluZyB8IG51bGwge1xuICAgICAgICBmb3IgKGNvbnN0IGsgb2Yga2V5cykge1xuICAgICAgICAgICAgaWYgKGFyZ3Nba10gPT09IHVuZGVmaW5lZCB8fCBhcmdzW2tdID09PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGByZWZlcmVuY2VfaW1hZ2Uob3A9XCIke29wfVwiKSByZXF1aXJlcyAke2t9OyBnb3QgJHtKU09OLnN0cmluZ2lmeShhcmdzKX0uYDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGRpc3BhdGNoKGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IG9wID0gYXJncy5vcCBhcyBzdHJpbmc7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBzd2l0Y2ggKG9wKSB7XG4gICAgICAgICAgICAgICAgY2FzZSAnYWRkJzoge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBlcnIgPSB0aGlzLnJlcXVpcmVGaWVsZHMob3AsIGFyZ3MsICdwYXRocycpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoZXJyKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVyciB9O1xuICAgICAgICAgICAgICAgICAgICAvLyB2Mi45LjUgcmV2aWV3IGZpeCAoQ2xhdWRlIPCfn6EpOiB0aGUgc2NoZW1hIG1hcmtzXG4gICAgICAgICAgICAgICAgICAgIC8vIGBwYXRoc2AgYXMgYGFycmF5KHN0cmluZylgIGJ1dCB0aGUgZGlzcGF0Y2hlclxuICAgICAgICAgICAgICAgICAgICAvLyByZXF1aXJlRmllbGRzIGhlbHBlciBvbmx5IGNoZWNrcyBwcmVzZW50LWFuZC1ub24tbnVsbC5cbiAgICAgICAgICAgICAgICAgICAgLy8gQSBtaXNzaGFwZW4gY2FsbCAoc3RyaW5nIC8gbnVtYmVyKSB3b3VsZCBvdGhlcndpc2VcbiAgICAgICAgICAgICAgICAgICAgLy8gcGFzcyB0aHJvdWdoIHRvIEVkaXRvci5NZXNzYWdlIGFuZCB0aGUgcmVzcG9uc2VcbiAgICAgICAgICAgICAgICAgICAgLy8gbWVzc2FnZSB3b3VsZCBzYXkgXCJBZGRlZCB1bmRlZmluZWQgcmVmZXJlbmNlIGltYWdlKHMpXCIuXG4gICAgICAgICAgICAgICAgICAgIGlmICghQXJyYXkuaXNBcnJheShhcmdzLnBhdGhzKSB8fCBhcmdzLnBhdGhzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgcmVmZXJlbmNlX2ltYWdlKG9wPVwiYWRkXCIpIHJlcXVpcmVzIHBhdGhzIHRvIGJlIGEgbm9uLWVtcHR5IGFycmF5IG9mIHN0cmluZ3M7IGdvdCAke0pTT04uc3RyaW5naWZ5KGFyZ3MucGF0aHMpfS5gIH07XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgncmVmZXJlbmNlLWltYWdlJywgJ2FkZC1pbWFnZScsIGFyZ3MucGF0aHMpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGRhdGE6IHsgb3AsIGFkZGVkUGF0aHM6IGFyZ3MucGF0aHMsIGNvdW50OiBhcmdzLnBhdGhzLmxlbmd0aCB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYEFkZGVkICR7YXJncy5wYXRocy5sZW5ndGh9IHJlZmVyZW5jZSBpbWFnZShzKWAsXG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhc2UgJ3JlbW92ZSc6IHtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgncmVmZXJlbmNlLWltYWdlJywgJ3JlbW92ZS1pbWFnZScsIGFyZ3MucGF0aHMpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGRhdGE6IHsgb3AsIHJlbW92ZWRQYXRoczogYXJncy5wYXRocyA/PyBudWxsIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBhcmdzLnBhdGhzICYmIGFyZ3MucGF0aHMubGVuZ3RoID4gMFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgID8gYFJlbW92ZWQgJHthcmdzLnBhdGhzLmxlbmd0aH0gcmVmZXJlbmNlIGltYWdlKHMpYFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDogJ1JlbW92ZWQgY3VycmVudCByZWZlcmVuY2UgaW1hZ2UnLFxuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYXNlICdzd2l0Y2gnOiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGVyciA9IHRoaXMucmVxdWlyZUZpZWxkcyhvcCwgYXJncywgJ3BhdGgnKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGVycikgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnIgfTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY2FsbEFyZ3MgPSBhcmdzLnNjZW5lVVVJRCA/IFthcmdzLnBhdGgsIGFyZ3Muc2NlbmVVVUlEXSA6IFthcmdzLnBhdGhdO1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdyZWZlcmVuY2UtaW1hZ2UnLCAnc3dpdGNoLWltYWdlJywgLi4uY2FsbEFyZ3MpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGRhdGE6IHsgb3AsIHBhdGg6IGFyZ3MucGF0aCwgc2NlbmVVVUlEOiBhcmdzLnNjZW5lVVVJRCA/PyBudWxsIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgU3dpdGNoZWQgdG8gcmVmZXJlbmNlIGltYWdlOiAke2FyZ3MucGF0aH1gLFxuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYXNlICdzZXRfZGF0YSc6IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZXJyID0gdGhpcy5yZXF1aXJlRmllbGRzKG9wLCBhcmdzLCAna2V5JywgJ3ZhbHVlJyk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChlcnIpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyIH07XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3JlZmVyZW5jZS1pbWFnZScsICdzZXQtaW1hZ2UtZGF0YScsIGFyZ3Mua2V5LCBhcmdzLnZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBkYXRhOiB7IG9wLCBrZXk6IGFyZ3Mua2V5LCB2YWx1ZTogYXJncy52YWx1ZSB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYFJlZmVyZW5jZSBpbWFnZSAke2FyZ3Mua2V5fSBzZXQgdG8gJHthcmdzLnZhbHVlfWAsXG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhc2UgJ3F1ZXJ5X2NvbmZpZyc6IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY29uZmlnOiBhbnkgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdyZWZlcmVuY2UtaW1hZ2UnLCAncXVlcnktY29uZmlnJyk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IHsgb3AsIGNvbmZpZyB9IH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhc2UgJ3F1ZXJ5X2N1cnJlbnQnOiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGN1cnJlbnQ6IGFueSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3JlZmVyZW5jZS1pbWFnZScsICdxdWVyeS1jdXJyZW50Jyk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IHsgb3AsIGN1cnJlbnQgfSB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYXNlICdyZWZyZXNoJzoge1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdyZWZlcmVuY2UtaW1hZ2UnLCAncmVmcmVzaCcpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBkYXRhOiB7IG9wIH0sIG1lc3NhZ2U6ICdSZWZlcmVuY2UgaW1hZ2UgcmVmcmVzaGVkJyB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYXNlICdzZXRfcG9zaXRpb24nOiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGVyciA9IHRoaXMucmVxdWlyZUZpZWxkcyhvcCwgYXJncywgJ3gnLCAneScpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoZXJyKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVyciB9O1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdyZWZlcmVuY2UtaW1hZ2UnLCAnc2V0LWltYWdlLWRhdGEnLCAneCcsIGFyZ3MueCk7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3JlZmVyZW5jZS1pbWFnZScsICdzZXQtaW1hZ2UtZGF0YScsICd5JywgYXJncy55KTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBkYXRhOiB7IG9wLCB4OiBhcmdzLngsIHk6IGFyZ3MueSB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYFJlZmVyZW5jZSBpbWFnZSBwb3NpdGlvbiBzZXQgdG8gKCR7YXJncy54fSwgJHthcmdzLnl9KWAsXG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhc2UgJ3NldF9zY2FsZSc6IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZXJyID0gdGhpcy5yZXF1aXJlRmllbGRzKG9wLCBhcmdzLCAnc3gnLCAnc3knKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGVycikgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnIgfTtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgncmVmZXJlbmNlLWltYWdlJywgJ3NldC1pbWFnZS1kYXRhJywgJ3N4JywgYXJncy5zeCk7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3JlZmVyZW5jZS1pbWFnZScsICdzZXQtaW1hZ2UtZGF0YScsICdzeScsIGFyZ3Muc3kpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGRhdGE6IHsgb3AsIHN4OiBhcmdzLnN4LCBzeTogYXJncy5zeSB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYFJlZmVyZW5jZSBpbWFnZSBzY2FsZSBzZXQgdG8gKCR7YXJncy5zeH0sICR7YXJncy5zeX0pYCxcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2FzZSAnc2V0X29wYWNpdHknOiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGVyciA9IHRoaXMucmVxdWlyZUZpZWxkcyhvcCwgYXJncywgJ29wYWNpdHknKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGVycikgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnIgfTtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgncmVmZXJlbmNlLWltYWdlJywgJ3NldC1pbWFnZS1kYXRhJywgJ29wYWNpdHknLCBhcmdzLm9wYWNpdHkpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGRhdGE6IHsgb3AsIG9wYWNpdHk6IGFyZ3Mub3BhY2l0eSB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYFJlZmVyZW5jZSBpbWFnZSBvcGFjaXR5IHNldCB0byAke2FyZ3Mub3BhY2l0eX1gLFxuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYXNlICdsaXN0Jzoge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjb25maWc6IGFueSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3JlZmVyZW5jZS1pbWFnZScsICdxdWVyeS1jb25maWcnKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY3VycmVudDogYW55ID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgncmVmZXJlbmNlLWltYWdlJywgJ3F1ZXJ5LWN1cnJlbnQnKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogeyBvcCwgY29uZmlnLCBjdXJyZW50IH0gfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2FzZSAnY2xlYXJfYWxsJzoge1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdyZWZlcmVuY2UtaW1hZ2UnLCAncmVtb3ZlLWltYWdlJyk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IHsgb3AgfSwgbWVzc2FnZTogJ0FsbCByZWZlcmVuY2UgaW1hZ2VzIGNsZWFyZWQnIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYFVua25vd24gcmVmZXJlbmNlX2ltYWdlIG9wOiAke29wfWAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpIH07XG4gICAgICAgIH1cbiAgICB9XG59XG4iXX0=