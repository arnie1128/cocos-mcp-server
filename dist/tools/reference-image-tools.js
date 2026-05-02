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
                description: 'Reference-image module operations (cocos editor scene reference images). Op-routing macro: pick `op` and supply the matching args. Replaces the v2.8.x flat surface (referenceImage_add_reference_image / remove_reference_image / switch_reference_image / set_reference_image_data / query_reference_image_config / query_current_reference_image / refresh_reference_image / set_reference_image_position / set_reference_image_scale / set_reference_image_opacity / list_reference_images / clear_all_reference_images — 12 → 1).',
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVmZXJlbmNlLWltYWdlLXRvb2xzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL3Rvb2xzL3JlZmVyZW5jZS1pbWFnZS10b29scy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSwwQ0FBa0M7QUFDbEMsc0RBQTJEO0FBRTNELHVFQUF1RTtBQUN2RSx5RUFBeUU7QUFDekUsaUJBQWlCO0FBQ2pCLHlFQUF5RTtBQUN6RSwyQkFBMkI7QUFDM0Isc0VBQXNFO0FBQ3RFLG9FQUFvRTtBQUNwRSwyQ0FBMkM7QUFDM0MsdUVBQXVFO0FBQ3ZFLHNEQUFzRDtBQUN0RCxFQUFFO0FBQ0Ysd0VBQXdFO0FBQ3hFLHFFQUFxRTtBQUNyRSxvRUFBb0U7QUFDcEUsc0VBQXNFO0FBQ3RFLGlDQUFpQztBQUNqQyxFQUFFO0FBQ0YscUVBQXFFO0FBQ3JFLCtEQUErRDtBQUMvRCxrRUFBa0U7QUFDbEUsb0VBQW9FO0FBQ3BFLGlFQUFpRTtBQUNqRSxNQUFhLG1CQUFtQjtJQUc1QjtRQUNJLE1BQU0sSUFBSSxHQUFjO1lBQ3BCO2dCQUNJLElBQUksRUFBRSxRQUFRO2dCQUNkLFdBQVcsRUFBRSx3Z0JBQXdnQjtnQkFDcmhCLFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDO29CQUNsQixFQUFFLEVBQUUsVUFBQyxDQUFDLElBQUksQ0FBQzt3QkFDUCxLQUFLLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxVQUFVLEVBQUUsY0FBYzt3QkFDckQsZUFBZSxFQUFFLFNBQVMsRUFBRSxjQUFjLEVBQUUsV0FBVzt3QkFDdkQsYUFBYSxFQUFFLE1BQU0sRUFBRSxXQUFXO3FCQUNyQyxDQUFDLENBQUMsUUFBUSxDQUNQLHFrQkFBcWtCLENBQ3hrQjtvQkFDRCxLQUFLLEVBQUUsVUFBQyxDQUFDLEtBQUssQ0FBQyxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxRQUFRLENBQUMsNkVBQTZFLENBQUM7b0JBQzdILElBQUksRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxFQUFFLENBQUMsUUFBUSxDQUFDLDZCQUE2QixDQUFDO29CQUNuRSxTQUFTLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsRUFBRSxDQUFDLFFBQVEsQ0FBQyw4Q0FBOEMsQ0FBQztvQkFDekYsR0FBRyxFQUFFLFVBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLFNBQVMsQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUMsUUFBUSxDQUFDLDhDQUE4QyxDQUFDO29CQUMxSCxLQUFLLEVBQUUsVUFBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLFFBQVEsRUFBRSxDQUFDLFFBQVEsQ0FBQyxnREFBZ0QsQ0FBQztvQkFDcEYsQ0FBQyxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxRQUFRLENBQUMsbUNBQW1DLENBQUM7b0JBQ3RFLENBQUMsRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxFQUFFLENBQUMsUUFBUSxDQUFDLG1DQUFtQyxDQUFDO29CQUN0RSxFQUFFLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUMsUUFBUSxDQUFDLHdDQUF3QyxDQUFDO29CQUM3RixFQUFFLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUMsUUFBUSxDQUFDLHdDQUF3QyxDQUFDO29CQUM3RixPQUFPLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUMsUUFBUSxDQUFDLHVDQUF1QyxDQUFDO2lCQUNqRyxDQUFDO2dCQUNGLE9BQU8sRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO2FBQ2pDO1NBQ0osQ0FBQztRQUNGLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBQSwwQkFBVyxFQUFDLElBQUksQ0FBQyxDQUFDO0lBQ2xDLENBQUM7SUFFRCxRQUFRLEtBQXVCLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDN0QsT0FBTyxDQUFDLFFBQWdCLEVBQUUsSUFBUyxJQUEyQixPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFekcsZ0VBQWdFO0lBQ2hFLDZEQUE2RDtJQUM3RCwyREFBMkQ7SUFDM0QsK0NBQStDO0lBQ3ZDLGFBQWEsQ0FBQyxFQUFVLEVBQUUsSUFBUyxFQUFFLEdBQUcsSUFBYztRQUMxRCxLQUFLLE1BQU0sQ0FBQyxJQUFJLElBQUksRUFBRSxDQUFDO1lBQ25CLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLFNBQVMsSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDLEtBQUssSUFBSSxFQUFFLENBQUM7Z0JBQzVDLE9BQU8sdUJBQXVCLEVBQUUsZUFBZSxDQUFDLFNBQVMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDO1lBQ3JGLENBQUM7UUFDTCxDQUFDO1FBQ0QsT0FBTyxJQUFJLENBQUM7SUFDaEIsQ0FBQztJQUVPLEtBQUssQ0FBQyxRQUFRLENBQUMsSUFBUzs7UUFDNUIsTUFBTSxFQUFFLEdBQUcsSUFBSSxDQUFDLEVBQVksQ0FBQztRQUM3QixJQUFJLENBQUM7WUFDRCxRQUFRLEVBQUUsRUFBRSxDQUFDO2dCQUNULEtBQUssS0FBSyxDQUFDLENBQUMsQ0FBQztvQkFDVCxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLEVBQUUsRUFBRSxJQUFJLEVBQUUsT0FBTyxDQUFDLENBQUM7b0JBQ2xELElBQUksR0FBRzt3QkFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLENBQUM7b0JBQy9DLE1BQU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsaUJBQWlCLEVBQUUsV0FBVyxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztvQkFDekUsT0FBTzt3QkFDSCxPQUFPLEVBQUUsSUFBSTt3QkFDYixJQUFJLEVBQUUsRUFBRSxFQUFFLEVBQUUsVUFBVSxFQUFFLElBQUksQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFO3dCQUM5RCxPQUFPLEVBQUUsU0FBUyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0scUJBQXFCO3FCQUMzRCxDQUFDO2dCQUNOLENBQUM7Z0JBQ0QsS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDO29CQUNaLE1BQU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsaUJBQWlCLEVBQUUsY0FBYyxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztvQkFDNUUsT0FBTzt3QkFDSCxPQUFPLEVBQUUsSUFBSTt3QkFDYixJQUFJLEVBQUUsRUFBRSxFQUFFLEVBQUUsWUFBWSxFQUFFLE1BQUEsSUFBSSxDQUFDLEtBQUssbUNBQUksSUFBSSxFQUFFO3dCQUM5QyxPQUFPLEVBQUUsSUFBSSxDQUFDLEtBQUssSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDOzRCQUN4QyxDQUFDLENBQUMsV0FBVyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0scUJBQXFCOzRCQUNuRCxDQUFDLENBQUMsaUNBQWlDO3FCQUMxQyxDQUFDO2dCQUNOLENBQUM7Z0JBQ0QsS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDO29CQUNaLE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsRUFBRSxFQUFFLElBQUksRUFBRSxNQUFNLENBQUMsQ0FBQztvQkFDakQsSUFBSSxHQUFHO3dCQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsQ0FBQztvQkFDL0MsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7b0JBQzVFLE1BQU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsaUJBQWlCLEVBQUUsY0FBYyxFQUFFLEdBQUcsUUFBUSxDQUFDLENBQUM7b0JBQzdFLE9BQU87d0JBQ0gsT0FBTyxFQUFFLElBQUk7d0JBQ2IsSUFBSSxFQUFFLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSSxFQUFFLFNBQVMsRUFBRSxNQUFBLElBQUksQ0FBQyxTQUFTLG1DQUFJLElBQUksRUFBRTt3QkFDaEUsT0FBTyxFQUFFLGdDQUFnQyxJQUFJLENBQUMsSUFBSSxFQUFFO3FCQUN2RCxDQUFDO2dCQUNOLENBQUM7Z0JBQ0QsS0FBSyxVQUFVLENBQUMsQ0FBQyxDQUFDO29CQUNkLE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsRUFBRSxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsT0FBTyxDQUFDLENBQUM7b0JBQ3pELElBQUksR0FBRzt3QkFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLENBQUM7b0JBQy9DLE1BQU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsaUJBQWlCLEVBQUUsZ0JBQWdCLEVBQUUsSUFBSSxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7b0JBQ3hGLE9BQU87d0JBQ0gsT0FBTyxFQUFFLElBQUk7d0JBQ2IsSUFBSSxFQUFFLEVBQUUsRUFBRSxFQUFFLEdBQUcsRUFBRSxJQUFJLENBQUMsR0FBRyxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSyxFQUFFO3dCQUM5QyxPQUFPLEVBQUUsbUJBQW1CLElBQUksQ0FBQyxHQUFHLFdBQVcsSUFBSSxDQUFDLEtBQUssRUFBRTtxQkFDOUQsQ0FBQztnQkFDTixDQUFDO2dCQUNELEtBQUssY0FBYyxDQUFDLENBQUMsQ0FBQztvQkFDbEIsTUFBTSxNQUFNLEdBQVEsTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxpQkFBaUIsRUFBRSxjQUFjLENBQUMsQ0FBQztvQkFDcEYsT0FBTyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxFQUFFLE1BQU0sRUFBRSxFQUFFLENBQUM7Z0JBQ25ELENBQUM7Z0JBQ0QsS0FBSyxlQUFlLENBQUMsQ0FBQyxDQUFDO29CQUNuQixNQUFNLE9BQU8sR0FBUSxNQUFNLE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLGlCQUFpQixFQUFFLGVBQWUsQ0FBQyxDQUFDO29CQUN0RixPQUFPLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFLEVBQUUsT0FBTyxFQUFFLEVBQUUsQ0FBQztnQkFDcEQsQ0FBQztnQkFDRCxLQUFLLFNBQVMsQ0FBQyxDQUFDLENBQUM7b0JBQ2IsTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxpQkFBaUIsRUFBRSxTQUFTLENBQUMsQ0FBQztvQkFDM0QsT0FBTyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsT0FBTyxFQUFFLDJCQUEyQixFQUFFLENBQUM7Z0JBQ2pGLENBQUM7Z0JBQ0QsS0FBSyxjQUFjLENBQUMsQ0FBQyxDQUFDO29CQUNsQixNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLEVBQUUsRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDO29CQUNuRCxJQUFJLEdBQUc7d0JBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRSxDQUFDO29CQUMvQyxNQUFNLE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLGlCQUFpQixFQUFFLGdCQUFnQixFQUFFLEdBQUcsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQy9FLE1BQU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsaUJBQWlCLEVBQUUsZ0JBQWdCLEVBQUUsR0FBRyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDL0UsT0FBTzt3QkFDSCxPQUFPLEVBQUUsSUFBSTt3QkFDYixJQUFJLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDLEVBQUU7d0JBQ2xDLE9BQU8sRUFBRSxvQ0FBb0MsSUFBSSxDQUFDLENBQUMsS0FBSyxJQUFJLENBQUMsQ0FBQyxHQUFHO3FCQUNwRSxDQUFDO2dCQUNOLENBQUM7Z0JBQ0QsS0FBSyxXQUFXLENBQUMsQ0FBQyxDQUFDO29CQUNmLE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7b0JBQ3JELElBQUksR0FBRzt3QkFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLENBQUM7b0JBQy9DLE1BQU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsaUJBQWlCLEVBQUUsZ0JBQWdCLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztvQkFDakYsTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxpQkFBaUIsRUFBRSxnQkFBZ0IsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO29CQUNqRixPQUFPO3dCQUNILE9BQU8sRUFBRSxJQUFJO3dCQUNiLElBQUksRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsSUFBSSxDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsSUFBSSxDQUFDLEVBQUUsRUFBRTt3QkFDdEMsT0FBTyxFQUFFLGlDQUFpQyxJQUFJLENBQUMsRUFBRSxLQUFLLElBQUksQ0FBQyxFQUFFLEdBQUc7cUJBQ25FLENBQUM7Z0JBQ04sQ0FBQztnQkFDRCxLQUFLLGFBQWEsQ0FBQyxDQUFDLENBQUM7b0JBQ2pCLE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsRUFBRSxFQUFFLElBQUksRUFBRSxTQUFTLENBQUMsQ0FBQztvQkFDcEQsSUFBSSxHQUFHO3dCQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsQ0FBQztvQkFDL0MsTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxpQkFBaUIsRUFBRSxnQkFBZ0IsRUFBRSxTQUFTLEVBQUUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO29CQUMzRixPQUFPO3dCQUNILE9BQU8sRUFBRSxJQUFJO3dCQUNiLElBQUksRUFBRSxFQUFFLEVBQUUsRUFBRSxPQUFPLEVBQUUsSUFBSSxDQUFDLE9BQU8sRUFBRTt3QkFDbkMsT0FBTyxFQUFFLGtDQUFrQyxJQUFJLENBQUMsT0FBTyxFQUFFO3FCQUM1RCxDQUFDO2dCQUNOLENBQUM7Z0JBQ0QsS0FBSyxNQUFNLENBQUMsQ0FBQyxDQUFDO29CQUNWLE1BQU0sTUFBTSxHQUFRLE1BQU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsaUJBQWlCLEVBQUUsY0FBYyxDQUFDLENBQUM7b0JBQ3BGLE1BQU0sT0FBTyxHQUFRLE1BQU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsaUJBQWlCLEVBQUUsZUFBZSxDQUFDLENBQUM7b0JBQ3RGLE9BQU8sRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxFQUFFLEVBQUUsRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLEVBQUUsQ0FBQztnQkFDNUQsQ0FBQztnQkFDRCxLQUFLLFdBQVcsQ0FBQyxDQUFDLENBQUM7b0JBQ2YsTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxpQkFBaUIsRUFBRSxjQUFjLENBQUMsQ0FBQztvQkFDaEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsT0FBTyxFQUFFLDhCQUE4QixFQUFFLENBQUM7Z0JBQ3BGLENBQUM7Z0JBQ0Q7b0JBQ0ksT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLCtCQUErQixFQUFFLEVBQUUsRUFBRSxDQUFDO1lBQzlFLENBQUM7UUFDTCxDQUFDO1FBQUMsT0FBTyxHQUFRLEVBQUUsQ0FBQztZQUNoQixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsTUFBQSxHQUFHLGFBQUgsR0FBRyx1QkFBSCxHQUFHLENBQUUsT0FBTyxtQ0FBSSxNQUFNLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztRQUNsRSxDQUFDO0lBQ0wsQ0FBQztDQUNKO0FBMUpELGtEQTBKQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFRvb2xEZWZpbml0aW9uLCBUb29sUmVzcG9uc2UsIFRvb2xFeGVjdXRvciB9IGZyb20gJy4uL3R5cGVzJztcbmltcG9ydCB7IHogfSBmcm9tICcuLi9saWIvc2NoZW1hJztcbmltcG9ydCB7IGRlZmluZVRvb2xzLCBUb29sRGVmIH0gZnJvbSAnLi4vbGliL2RlZmluZS10b29scyc7XG5cbi8vIHYyLjkuMCBULVYyOS02IChSb21hUm9nb3YgbWFjcm8tdG9vbCBlbnVtIHJvdXRpbmcpOiBjb2xsYXBzZSAxMiBmbGF0XG4vLyByZWZlcmVuY2UtaW1hZ2UgdG9vbHMgaW50byBhIHNpbmdsZSBgcmVmZXJlbmNlX2ltYWdlKHtvcCwgLi4ufSlgIG1hY3JvXG4vLyB0b29sLiBSZWFzb25zOlxuLy8gICAtIFRva2VuIGNvc3Q6IDEyIHNlcGFyYXRlIHRvb2wgc2NoZW1hcyB2cyAxIHVuaW9uIHNhdmVzIH5rYiBvbiBldmVyeVxuLy8gICAgIHRvb2xzL2xpc3QgcmVzcG9uc2UuXG4vLyAgIC0gQ29oZXJlbmNlOiBhbGwgb3BzIHNoYXJlIHRoZSBzYW1lIGRvbWFpbiAoY29jb3MgcmVmZXJlbmNlLWltYWdlXG4vLyAgICAgbW9kdWxlKSBhbmQgZGlzcGF0Y2ggdG8gdGhlIHNhbWUgRWRpdG9yLk1lc3NhZ2UgY2hhbm5lbDsgZmxhdFxuLy8gICAgIGNvbGxhcHNlIGtlZXBzIHRoZSBkaXNwYXRjaCB0cml2aWFsLlxuLy8gICAtIExMTSBlcmdvbm9taWNzOiBhIHNpbmdsZSB0b29sIHdpdGggYG9wYCBlbnVtIGlzIGVhc2llciBmb3IgQUkgdG9cbi8vICAgICBwaWNrIHRoYW4gMTIgbmVhci1pZGVudGljYWxseS1uYW1lZCBmbGF0IHRvb2xzLlxuLy9cbi8vIFNjaGVtYSBzaGFwZTogZmxhdCBvcHRpb25hbCBmaWVsZHMgcGVyIG9wIChOT1Qgei5kaXNjcmltaW5hdGVkVW5pb24pLlxuLy8gZGlzY3JpbWluYXRlZFVuaW9uIGNvbXBpbGVzIHRvIEpTT04gU2NoZW1hIGBvbmVPZmAgd2l0aCBwZXItYnJhbmNoXG4vLyByZXF1aXJlZCBhcnJheXMg4oCUIGdlbWluaS1jb21wYXQgd29ya3MgaW4gem9kIDQgLyBkcmFmdC03LCBidXQgdGhlXG4vLyBmbGF0IHNjaGVtYSBpcyBzaW1wbGVyIGZvciBldmVyeSBMTE0gdG9vbC1jYWxsIHBhcnNlciBhbmQgZWFzaWVyIHRvXG4vLyBleHRlbmQgd2hlbiBuZXcgb3BzIGFyZSBhZGRlZC5cbi8vXG4vLyBCYWNrd2FyZCBjb21wYXRpYmlsaXR5OiB0aGlzIGlzIGEgQlJFQUtJTkcgY2hhbmdlIGZvciBjYWxsZXJzIHRoYXRcbi8vIGFkZHJlc3NlZCBpbmRpdmlkdWFsIGByZWZlcmVuY2VfaW1hZ2VfPHZlcmI+YCB0b29sIG5hbWVzLiBXZVxuLy8gaW50ZW50aW9uYWxseSBkb24ndCBzaGlwIGNvbXBhdCBhbGlhc2VzIOKAlCB0aGF0IHdvdWxkIGRlZmVhdCB0aGVcbi8vIHRva2VuLWNvc3QgcmVkdWN0aW9uLiB2Mi45LnggaXMgdGhlIG1pZ3JhdGlvbiB3aW5kb3c7IENIQU5HRUxPRyArXG4vLyBIQU5ET0ZGIGRvY3VtZW50IHRoZSBuZXcgc2hhcGUgc28gZXh0ZXJuYWwgY2xpZW50cyBjYW4gdXBkYXRlLlxuZXhwb3J0IGNsYXNzIFJlZmVyZW5jZUltYWdlVG9vbHMgaW1wbGVtZW50cyBUb29sRXhlY3V0b3Ige1xuICAgIHByaXZhdGUgcmVhZG9ubHkgZXhlYzogVG9vbEV4ZWN1dG9yO1xuXG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIGNvbnN0IGRlZnM6IFRvb2xEZWZbXSA9IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnbWFuYWdlJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1JlZmVyZW5jZS1pbWFnZSBtb2R1bGUgb3BlcmF0aW9ucyAoY29jb3MgZWRpdG9yIHNjZW5lIHJlZmVyZW5jZSBpbWFnZXMpLiBPcC1yb3V0aW5nIG1hY3JvOiBwaWNrIGBvcGAgYW5kIHN1cHBseSB0aGUgbWF0Y2hpbmcgYXJncy4gUmVwbGFjZXMgdGhlIHYyLjgueCBmbGF0IHN1cmZhY2UgKHJlZmVyZW5jZUltYWdlX2FkZF9yZWZlcmVuY2VfaW1hZ2UgLyByZW1vdmVfcmVmZXJlbmNlX2ltYWdlIC8gc3dpdGNoX3JlZmVyZW5jZV9pbWFnZSAvIHNldF9yZWZlcmVuY2VfaW1hZ2VfZGF0YSAvIHF1ZXJ5X3JlZmVyZW5jZV9pbWFnZV9jb25maWcgLyBxdWVyeV9jdXJyZW50X3JlZmVyZW5jZV9pbWFnZSAvIHJlZnJlc2hfcmVmZXJlbmNlX2ltYWdlIC8gc2V0X3JlZmVyZW5jZV9pbWFnZV9wb3NpdGlvbiAvIHNldF9yZWZlcmVuY2VfaW1hZ2Vfc2NhbGUgLyBzZXRfcmVmZXJlbmNlX2ltYWdlX29wYWNpdHkgLyBsaXN0X3JlZmVyZW5jZV9pbWFnZXMgLyBjbGVhcl9hbGxfcmVmZXJlbmNlX2ltYWdlcyDigJQgMTIg4oaSIDEpLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgb3A6IHouZW51bShbXG4gICAgICAgICAgICAgICAgICAgICAgICAnYWRkJywgJ3JlbW92ZScsICdzd2l0Y2gnLCAnc2V0X2RhdGEnLCAncXVlcnlfY29uZmlnJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICdxdWVyeV9jdXJyZW50JywgJ3JlZnJlc2gnLCAnc2V0X3Bvc2l0aW9uJywgJ3NldF9zY2FsZScsXG4gICAgICAgICAgICAgICAgICAgICAgICAnc2V0X29wYWNpdHknLCAnbGlzdCcsICdjbGVhcl9hbGwnLFxuICAgICAgICAgICAgICAgICAgICBdKS5kZXNjcmliZShcbiAgICAgICAgICAgICAgICAgICAgICAgICdPcCBzZWxlY3Rvci4gXCJhZGRcIiDigJQgcmVnaXN0ZXIgYWJzb2x1dGUgaW1hZ2UgcGF0aHMgKHBhdGhzIHJlcXVpcmVkKS4gXCJyZW1vdmVcIiDigJQgcmVtb3ZlIHNwZWNpZmljIHBhdGhzIG9yIGN1cnJlbnQgaW1hZ2Ugd2hlbiBvbWl0dGVkLiBcInN3aXRjaFwiIOKAlCBzd2l0Y2ggYWN0aXZlIGltYWdlIChwYXRoIHJlcXVpcmVkLCBzY2VuZVVVSUQgb3B0aW9uYWwpLiBcInNldF9kYXRhXCIg4oCUIHNldCByYXcgZGlzcGxheSBwcm9wZXJ0eSAoa2V5ICsgdmFsdWUgcmVxdWlyZWQpLiBcInF1ZXJ5X2NvbmZpZ1wiIOKAlCByZWFkIG1vZHVsZSBjb25maWcuIFwicXVlcnlfY3VycmVudFwiIOKAlCByZWFkIGN1cnJlbnQgaW1hZ2Ugc3RhdGUuIFwicmVmcmVzaFwiIOKAlCByZWZyZXNoIGRpc3BsYXkgd2l0aG91dCBjaGFuZ2luZyBkYXRhLiBcInNldF9wb3NpdGlvblwiIOKAlCBzZXQgeC95IG9mZnNldHMuIFwic2V0X3NjYWxlXCIg4oCUIHNldCBzeC9zeSBzY2FsZSAwLjEtMTAuIFwic2V0X29wYWNpdHlcIiDigJQgc2V0IG9wYWNpdHkgMC0xLiBcImxpc3RcIiDigJQgcmVhZCBjb25maWcgKyBjdXJyZW50IGRhdGEuIFwiY2xlYXJfYWxsXCIg4oCUIHJlbW92ZSBhbGwgcmVmZXJlbmNlIGltYWdlcy4nXG4gICAgICAgICAgICAgICAgICAgICksXG4gICAgICAgICAgICAgICAgICAgIHBhdGhzOiB6LmFycmF5KHouc3RyaW5nKCkpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0ZvciBvcD1cImFkZFwiIChyZXF1aXJlZCkgb3Igb3A9XCJyZW1vdmVcIiAob3B0aW9uYWwg4oCUIG9taXQgdG8gcmVtb3ZlIGN1cnJlbnQpLicpLFxuICAgICAgICAgICAgICAgICAgICBwYXRoOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0ZvciBvcD1cInN3aXRjaFwiIChyZXF1aXJlZCkuJyksXG4gICAgICAgICAgICAgICAgICAgIHNjZW5lVVVJRDogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdGb3Igb3A9XCJzd2l0Y2hcIiAob3B0aW9uYWwgc2NlbmUgVVVJRCBzY29wZSkuJyksXG4gICAgICAgICAgICAgICAgICAgIGtleTogei5lbnVtKFsncGF0aCcsICd4JywgJ3knLCAnc3gnLCAnc3knLCAnb3BhY2l0eSddKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdGb3Igb3A9XCJzZXRfZGF0YVwiIChyZXF1aXJlZCkg4oCUIHByb3BlcnR5IGtleS4nKSxcbiAgICAgICAgICAgICAgICAgICAgdmFsdWU6IHouYW55KCkub3B0aW9uYWwoKS5kZXNjcmliZSgnRm9yIG9wPVwic2V0X2RhdGFcIiAocmVxdWlyZWQpIOKAlCBwcm9wZXJ0eSB2YWx1ZS4nKSxcbiAgICAgICAgICAgICAgICAgICAgeDogei5udW1iZXIoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdGb3Igb3A9XCJzZXRfcG9zaXRpb25cIiAocmVxdWlyZWQpLicpLFxuICAgICAgICAgICAgICAgICAgICB5OiB6Lm51bWJlcigpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0ZvciBvcD1cInNldF9wb3NpdGlvblwiIChyZXF1aXJlZCkuJyksXG4gICAgICAgICAgICAgICAgICAgIHN4OiB6Lm51bWJlcigpLm1pbigwLjEpLm1heCgxMCkub3B0aW9uYWwoKS5kZXNjcmliZSgnRm9yIG9wPVwic2V0X3NjYWxlXCIgKHJlcXVpcmVkKSwgMC4xLTEwLicpLFxuICAgICAgICAgICAgICAgICAgICBzeTogei5udW1iZXIoKS5taW4oMC4xKS5tYXgoMTApLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0ZvciBvcD1cInNldF9zY2FsZVwiIChyZXF1aXJlZCksIDAuMS0xMC4nKSxcbiAgICAgICAgICAgICAgICAgICAgb3BhY2l0eTogei5udW1iZXIoKS5taW4oMCkubWF4KDEpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0ZvciBvcD1cInNldF9vcGFjaXR5XCIgKHJlcXVpcmVkKSwgMC0xLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy5kaXNwYXRjaChhKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgIF07XG4gICAgICAgIHRoaXMuZXhlYyA9IGRlZmluZVRvb2xzKGRlZnMpO1xuICAgIH1cblxuICAgIGdldFRvb2xzKCk6IFRvb2xEZWZpbml0aW9uW10geyByZXR1cm4gdGhpcy5leGVjLmdldFRvb2xzKCk7IH1cbiAgICBleGVjdXRlKHRvb2xOYW1lOiBzdHJpbmcsIGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7IHJldHVybiB0aGlzLmV4ZWMuZXhlY3V0ZSh0b29sTmFtZSwgYXJncyk7IH1cblxuICAgIC8vIFBlci1vcCByZXF1aXJlZC1maWVsZCB2YWxpZGF0aW9uLiBFYWNoIG9wJ3MgcmVxdWlyZWQgYXJncyBhcmVcbiAgICAvLyByZWFzc2VydGVkIGhlcmUgYmVjYXVzZSB0aGUgZmxhdCB6b2Qgc2NoZW1hIG1hcmtzIHRoZW0gYWxsXG4gICAgLy8gb3B0aW9uYWwgZm9yIHN1cmZhY2Ugc2ltcGxpY2l0eS4gRmFpbHVyZSByZXR1cm5zIGEgY2xlYXJcbiAgICAvLyBzdHJ1Y3R1cmVkIGVycm9yIHNvIEFJIGNhbiBjb3JyZWN0IHRoZSBjYWxsLlxuICAgIHByaXZhdGUgcmVxdWlyZUZpZWxkcyhvcDogc3RyaW5nLCBhcmdzOiBhbnksIC4uLmtleXM6IHN0cmluZ1tdKTogc3RyaW5nIHwgbnVsbCB7XG4gICAgICAgIGZvciAoY29uc3QgayBvZiBrZXlzKSB7XG4gICAgICAgICAgICBpZiAoYXJnc1trXSA9PT0gdW5kZWZpbmVkIHx8IGFyZ3Nba10gPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gYHJlZmVyZW5jZV9pbWFnZShvcD1cIiR7b3B9XCIpIHJlcXVpcmVzICR7a307IGdvdCAke0pTT04uc3RyaW5naWZ5KGFyZ3MpfS5gO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZGlzcGF0Y2goYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3Qgb3AgPSBhcmdzLm9wIGFzIHN0cmluZztcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHN3aXRjaCAob3ApIHtcbiAgICAgICAgICAgICAgICBjYXNlICdhZGQnOiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGVyciA9IHRoaXMucmVxdWlyZUZpZWxkcyhvcCwgYXJncywgJ3BhdGhzJyk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChlcnIpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyIH07XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3JlZmVyZW5jZS1pbWFnZScsICdhZGQtaW1hZ2UnLCBhcmdzLnBhdGhzKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBkYXRhOiB7IG9wLCBhZGRlZFBhdGhzOiBhcmdzLnBhdGhzLCBjb3VudDogYXJncy5wYXRocy5sZW5ndGggfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBBZGRlZCAke2FyZ3MucGF0aHMubGVuZ3RofSByZWZlcmVuY2UgaW1hZ2UocylgLFxuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYXNlICdyZW1vdmUnOiB7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3JlZmVyZW5jZS1pbWFnZScsICdyZW1vdmUtaW1hZ2UnLCBhcmdzLnBhdGhzKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBkYXRhOiB7IG9wLCByZW1vdmVkUGF0aHM6IGFyZ3MucGF0aHMgPz8gbnVsbCB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYXJncy5wYXRocyAmJiBhcmdzLnBhdGhzLmxlbmd0aCA+IDBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA/IGBSZW1vdmVkICR7YXJncy5wYXRocy5sZW5ndGh9IHJlZmVyZW5jZSBpbWFnZShzKWBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA6ICdSZW1vdmVkIGN1cnJlbnQgcmVmZXJlbmNlIGltYWdlJyxcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2FzZSAnc3dpdGNoJzoge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBlcnIgPSB0aGlzLnJlcXVpcmVGaWVsZHMob3AsIGFyZ3MsICdwYXRoJyk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChlcnIpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyIH07XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNhbGxBcmdzID0gYXJncy5zY2VuZVVVSUQgPyBbYXJncy5wYXRoLCBhcmdzLnNjZW5lVVVJRF0gOiBbYXJncy5wYXRoXTtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgncmVmZXJlbmNlLWltYWdlJywgJ3N3aXRjaC1pbWFnZScsIC4uLmNhbGxBcmdzKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBkYXRhOiB7IG9wLCBwYXRoOiBhcmdzLnBhdGgsIHNjZW5lVVVJRDogYXJncy5zY2VuZVVVSUQgPz8gbnVsbCB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYFN3aXRjaGVkIHRvIHJlZmVyZW5jZSBpbWFnZTogJHthcmdzLnBhdGh9YCxcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2FzZSAnc2V0X2RhdGEnOiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGVyciA9IHRoaXMucmVxdWlyZUZpZWxkcyhvcCwgYXJncywgJ2tleScsICd2YWx1ZScpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoZXJyKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVyciB9O1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdyZWZlcmVuY2UtaW1hZ2UnLCAnc2V0LWltYWdlLWRhdGEnLCBhcmdzLmtleSwgYXJncy52YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgZGF0YTogeyBvcCwga2V5OiBhcmdzLmtleSwgdmFsdWU6IGFyZ3MudmFsdWUgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBSZWZlcmVuY2UgaW1hZ2UgJHthcmdzLmtleX0gc2V0IHRvICR7YXJncy52YWx1ZX1gLFxuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYXNlICdxdWVyeV9jb25maWcnOiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbmZpZzogYW55ID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgncmVmZXJlbmNlLWltYWdlJywgJ3F1ZXJ5LWNvbmZpZycpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBkYXRhOiB7IG9wLCBjb25maWcgfSB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYXNlICdxdWVyeV9jdXJyZW50Jzoge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjdXJyZW50OiBhbnkgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdyZWZlcmVuY2UtaW1hZ2UnLCAncXVlcnktY3VycmVudCcpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBkYXRhOiB7IG9wLCBjdXJyZW50IH0gfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2FzZSAncmVmcmVzaCc6IHtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgncmVmZXJlbmNlLWltYWdlJywgJ3JlZnJlc2gnKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogeyBvcCB9LCBtZXNzYWdlOiAnUmVmZXJlbmNlIGltYWdlIHJlZnJlc2hlZCcgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2FzZSAnc2V0X3Bvc2l0aW9uJzoge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBlcnIgPSB0aGlzLnJlcXVpcmVGaWVsZHMob3AsIGFyZ3MsICd4JywgJ3knKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGVycikgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnIgfTtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgncmVmZXJlbmNlLWltYWdlJywgJ3NldC1pbWFnZS1kYXRhJywgJ3gnLCBhcmdzLngpO1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdyZWZlcmVuY2UtaW1hZ2UnLCAnc2V0LWltYWdlLWRhdGEnLCAneScsIGFyZ3MueSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgZGF0YTogeyBvcCwgeDogYXJncy54LCB5OiBhcmdzLnkgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBSZWZlcmVuY2UgaW1hZ2UgcG9zaXRpb24gc2V0IHRvICgke2FyZ3MueH0sICR7YXJncy55fSlgLFxuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYXNlICdzZXRfc2NhbGUnOiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGVyciA9IHRoaXMucmVxdWlyZUZpZWxkcyhvcCwgYXJncywgJ3N4JywgJ3N5Jyk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChlcnIpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyIH07XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3JlZmVyZW5jZS1pbWFnZScsICdzZXQtaW1hZ2UtZGF0YScsICdzeCcsIGFyZ3Muc3gpO1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdyZWZlcmVuY2UtaW1hZ2UnLCAnc2V0LWltYWdlLWRhdGEnLCAnc3knLCBhcmdzLnN5KTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBkYXRhOiB7IG9wLCBzeDogYXJncy5zeCwgc3k6IGFyZ3Muc3kgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBSZWZlcmVuY2UgaW1hZ2Ugc2NhbGUgc2V0IHRvICgke2FyZ3Muc3h9LCAke2FyZ3Muc3l9KWAsXG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhc2UgJ3NldF9vcGFjaXR5Jzoge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBlcnIgPSB0aGlzLnJlcXVpcmVGaWVsZHMob3AsIGFyZ3MsICdvcGFjaXR5Jyk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChlcnIpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyIH07XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3JlZmVyZW5jZS1pbWFnZScsICdzZXQtaW1hZ2UtZGF0YScsICdvcGFjaXR5JywgYXJncy5vcGFjaXR5KTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBkYXRhOiB7IG9wLCBvcGFjaXR5OiBhcmdzLm9wYWNpdHkgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBSZWZlcmVuY2UgaW1hZ2Ugb3BhY2l0eSBzZXQgdG8gJHthcmdzLm9wYWNpdHl9YCxcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2FzZSAnbGlzdCc6IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY29uZmlnOiBhbnkgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdyZWZlcmVuY2UtaW1hZ2UnLCAncXVlcnktY29uZmlnJyk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGN1cnJlbnQ6IGFueSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3JlZmVyZW5jZS1pbWFnZScsICdxdWVyeS1jdXJyZW50Jyk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IHsgb3AsIGNvbmZpZywgY3VycmVudCB9IH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhc2UgJ2NsZWFyX2FsbCc6IHtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgncmVmZXJlbmNlLWltYWdlJywgJ3JlbW92ZS1pbWFnZScpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBkYXRhOiB7IG9wIH0sIG1lc3NhZ2U6ICdBbGwgcmVmZXJlbmNlIGltYWdlcyBjbGVhcmVkJyB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBVbmtub3duIHJlZmVyZW5jZV9pbWFnZSBvcDogJHtvcH1gIH07XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKSB9O1xuICAgICAgICB9XG4gICAgfVxufVxuIl19