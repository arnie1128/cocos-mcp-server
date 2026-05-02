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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVmZXJlbmNlLWltYWdlLXRvb2xzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL3Rvb2xzL3JlZmVyZW5jZS1pbWFnZS10b29scy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSwwQ0FBa0M7QUFDbEMsc0RBQTJEO0FBRTNELHVFQUF1RTtBQUN2RSx5RUFBeUU7QUFDekUsaUJBQWlCO0FBQ2pCLHlFQUF5RTtBQUN6RSwyQkFBMkI7QUFDM0Isc0VBQXNFO0FBQ3RFLG9FQUFvRTtBQUNwRSwyQ0FBMkM7QUFDM0MsdUVBQXVFO0FBQ3ZFLHNEQUFzRDtBQUN0RCxFQUFFO0FBQ0Ysd0VBQXdFO0FBQ3hFLHFFQUFxRTtBQUNyRSxvRUFBb0U7QUFDcEUsc0VBQXNFO0FBQ3RFLGlDQUFpQztBQUNqQyxFQUFFO0FBQ0YscUVBQXFFO0FBQ3JFLCtEQUErRDtBQUMvRCxrRUFBa0U7QUFDbEUsb0VBQW9FO0FBQ3BFLGlFQUFpRTtBQUNqRSxNQUFhLG1CQUFtQjtJQUc1QjtRQUNJLE1BQU0sSUFBSSxHQUFjO1lBQ3BCO2dCQUNJLElBQUksRUFBRSxRQUFRO2dCQUNkLFdBQVcsRUFBRSx3Z0JBQXdnQjtnQkFDcmhCLFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDO29CQUNsQixFQUFFLEVBQUUsVUFBQyxDQUFDLElBQUksQ0FBQzt3QkFDUCxLQUFLLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxVQUFVLEVBQUUsY0FBYzt3QkFDckQsZUFBZSxFQUFFLFNBQVMsRUFBRSxjQUFjLEVBQUUsV0FBVzt3QkFDdkQsYUFBYSxFQUFFLE1BQU0sRUFBRSxXQUFXO3FCQUNyQyxDQUFDLENBQUMsUUFBUSxDQUNQLHFrQkFBcWtCLENBQ3hrQjtvQkFDRCxLQUFLLEVBQUUsVUFBQyxDQUFDLEtBQUssQ0FBQyxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxRQUFRLENBQUMsNkVBQTZFLENBQUM7b0JBQzdI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ZSwgVG9vbEV4ZWN1dG9yIH0gZnJvbSAnLi4vdHlwZXMnO1xuaW1wb3J0IHsgeiB9IGZyb20gJy4uL2xpYi9zY2hlbWEnO1xuaW1wb3J0IHsgZGVmaW5lVG9vbHMsIFRvb2xEZWYgfSBmcm9tICcuLi9saWIvZGVmaW5lLXRvb2xzJztcblxuLy8gdjIuOS4wIFQtVjI5LTYgKFJvbWFSb2dvdiBtYWNyby10b29sIGVudW0gcm91dGluZyk6IGNvbGxhcHNlIDEyIGZsYXRcbi8vIHJlZmVyZW5jZS1pbWFnZSB0b29scyBpbnRvIGEgc2luZ2xlIGByZWZlcmVuY2VfaW1hZ2Uoe29wLCAuLi59KWAgbWFjcm9cbi8vIHRvb2wuIFJlYXNvbnM6XG4vLyAgIC0gVG9rZW4gY29zdDogMTIgc2VwYXJhdGUgdG9vbCBzY2hlbWFzIHZzIDEgdW5pb24gc2F2ZXMgfmtiIG9uIGV2ZXJ5XG4vLyAgICAgdG9vbHMvbGlzdCByZXNwb25zZS5cbi8vICAgLSBDb2hlcmVuY2U6IGFsbCBvcHMgc2hhcmUgdGhlIHNhbWUgZG9tYWluIChjb2NvcyByZWZlcmVuY2UtaW1hZ2Vcbi8vICAgICBtb2R1bGUpIGFuZCBkaXNwYXRjaCB0byB0aGUgc2FtZSBFZGl0b3IuTWVzc2FnZSBjaGFubmVsOyBmbGF0XG4vLyAgICAgY29sbGFwc2Uga2VlcHMgdGhlIGRpc3BhdGNoIHRyaXZpYWwuXG4vLyAgIC0gTExNIGVyZ29ub21pY3M6IGEgc2luZ2xlIHRvb2wgd2l0aCBgb3BgIGVudW0gaXMgZWFzaWVyIGZvciBBSSB0b1xuLy8gICAgIHBpY2sgdGhhbiAxMiBuZWFyLWlkZW50aWNhbGx5LW5hbWVkIGZsYXQgdG9vbHMuXG4vL1xuLy8gU2NoZW1hIHNoYXBlOiBmbGF0IG9wdGlvbmFsIGZpZWxkcyBwZXIgb3AgKE5PVCB6LmRpc2NyaW1pbmF0ZWRVbmlvbikuXG4vLyBkaXNjcmltaW5hdGVkVW5pb24gY29tcGlsZXMgdG8gSlNPTiBTY2hlbWEgYG9uZU9mYCB3aXRoIHBlci1icmFuY2hcbi8vIHJlcXVpcmVkIGFycmF5cyDigJQgZ2VtaW5pLWNvbXBhdCB3b3JrcyBpbiB6b2QgNCAvIGRyYWZ0LTcsIGJ1dCB0aGVcbi8vIGZsYXQgc2NoZW1hIGlzIHNpbXBsZXIgZm9yIGV2ZXJ5IExMTSB0b29sLWNhbGwgcGFyc2VyIGFuZCBlYXNpZXIgdG9cbi8vIGV4dGVuZCB3aGVuIG5ldyBvcHMgYXJlIGFkZGVkLlxuLy9cbi8vIEJhY2t3YXJkIGNvbXBhdGliaWxpdHk6IHRoaXMgaXMgYSBCUkVBS0lORyBjaGFuZ2UgZm9yIGNhbGxlcnMgdGhhdFxuLy8gYWRkcmVzc2VkIGluZGl2aWR1YWwgYHJlZmVyZW5jZV9pbWFnZV88dmVyYj5gIHRvb2wgbmFtZXMuIFdlXG4vLyBpbnRlbnRpb25hbGx5IGRvbid0IHNoaXAgY29tcGF0IGFsaWFzZXMg4oCUIHRoYXQgd291bGQgZGVmZWF0IHRoZVxuLy8gdG9rZW4tY29zdCByZWR1Y3Rpb24uIHYyLjkueCBpcyB0aGUgbWlncmF0aW9uIHdpbmRvdzsgQ0hBTkdFTE9HICtcbi8vIEhBTkRPRkYgZG9jdW1lbnQgdGhlIG5ldyBzaGFwZSBzbyBleHRlcm5hbCBjbGllbnRzIGNhbiB1cGRhdGUuXG5leHBvcnQgY2xhc3MgUmVmZXJlbmNlSW1hZ2VUb29scyBpbXBsZW1lbnRzIFRvb2xFeGVjdXRvciB7XG4gICAgcHJpdmF0ZSByZWFkb25seSBleGVjOiBUb29sRXhlY3V0b3I7XG5cbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgY29uc3QgZGVmczogVG9vbERlZltdID0gW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdtYW5hZ2UnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnUmVmZXJlbmNlLWltYWdlIG1vZHVsZSBvcGVyYXRpb25zIChjb2NvcyBlZGl0b3Igc2NlbmUgcmVmZXJlbmNlIGltYWdlcykuIE9wLXJvdXRpbmcgbWFjcm86IHBpY2sgYG9wYCBhbmQgc3VwcGx5IHRoZSBtYXRjaGluZyBhcmdzLiBSZXBsYWNlcyB0aGUgdjIuOC54IGZsYXQgc3VyZmFjZSAocmVmZXJlbmNlSW1hZ2VfYWRkX3JlZmVyZW5jZV9pbWFnZSAvIHJlbW92ZV9yZWZlcmVuY2VfaW1hZ2UgLyBzd2l0Y2hfcmVmZXJlbmNlX2ltYWdlIC8gc2V0X3JlZmVyZW5jZV9pbWFnZV9kYXRhIC8gcXVlcnlfcmVmZXJlbmNlX2ltYWdlX2NvbmZpZyAvIHF1ZXJ5X2N1cnJlbnRfcmVmZXJlbmNlX2ltYWdlIC8gcmVmcmVzaF9yZWZlcmVuY2VfaW1hZ2UgLyBzZXRfcmVmZXJlbmNlX2ltYWdlX3Bvc2l0aW9uIC8gc2V0X3JlZmVyZW5jZV9pbWFnZV9zY2FsZSAvIHNldF9yZWZlcmVuY2VfaW1hZ2Vfb3BhY2l0eSAvIGxpc3RfcmVmZXJlbmNlX2ltYWdlcyAvIGNsZWFyX2FsbF9yZWZlcmVuY2VfaW1hZ2VzIOKAlCAxMiDihpIgMSkuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBvcDogei5lbnVtKFtcbiAgICAgICAgICAgICAgICAgICAgICAgICdhZGQnLCAncmVtb3ZlJywgJ3N3aXRjaCcsICdzZXRfZGF0YScsICdxdWVyeV9jb25maWcnLFxuICAgICAgICAgICAgICAgICAgICAgICAgJ3F1ZXJ5X2N1cnJlbnQnLCAncmVmcmVzaCcsICdzZXRfcG9zaXRpb24nLCAnc2V0X3NjYWxlJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICdzZXRfb3BhY2l0eScsICdsaXN0JywgJ2NsZWFyX2FsbCcsXG4gICAgICAgICAgICAgICAgICAgIF0pLmRlc2NyaWJlKFxuICAgICAgICAgICAgICAgICAgICAgICAgJ09wIHNlbGVjdG9yLiBcImFkZFwiIOKAlCByZWdpc3RlciBhYnNvbHV0ZSBpbWFnZSBwYXRocyAocGF0aHMgcmVxdWlyZWQpLiBcInJlbW92ZVwiIOKAlCByZW1vdmUgc3BlY2lmaWMgcGF0aHMgb3IgY3VycmVudCBpbWFnZSB3aGVuIG9taXR0ZWQuIFwic3dpdGNoXCIg4oCUIHN3aXRjaCBhY3RpdmUgaW1hZ2UgKHBhdGggcmVxdWlyZWQsIHNjZW5lVVVJRCBvcHRpb25hbCkuIFwic2V0X2RhdGFcIiDigJQgc2V0IHJhdyBkaXNwbGF5IHByb3BlcnR5IChrZXkgKyB2YWx1ZSByZXF1aXJlZCkuIFwicXVlcnlfY29uZmlnXCIg4oCUIHJlYWQgbW9kdWxlIGNvbmZpZy4gXCJxdWVyeV9jdXJyZW50XCIg4oCUIHJlYWQgY3VycmVudCBpbWFnZSBzdGF0ZS4gXCJyZWZyZXNoXCIg4oCUIHJlZnJlc2ggZGlzcGxheSB3aXRob3V0IGNoYW5naW5nIGRhdGEuIFwic2V0X3Bvc2l0aW9uXCIg4oCUIHNldCB4L3kgb2Zmc2V0cy4gXCJzZXRfc2NhbGVcIiDigJQgc2V0IHN4L3N5IHNjYWxlIDAuMS0xMC4gXCJzZXRfb3BhY2l0eVwiIOKAlCBzZXQgb3BhY2l0eSAwLTEuIFwibGlzdFwiIOKAlCByZWFkIGNvbmZpZyArIGN1cnJlbnQgZGF0YS4gXCJjbGVhcl9hbGxcIiDigJQgcmVtb3ZlIGFsbCByZWZlcmVuY2UgaW1hZ2VzLidcbiAgICAgICAgICAgICAgICAgICAgKSxcbiAgICAgICAgICAgICAgICAgICAgcGF0aHM6IHouYXJyYXkoei5zdHJpbmcoKSkub3B0aW9uYWwoKS5kZXNjcmliZSgnRm9yIG9wPVwiYWRkXCIgKHJlcXVpcmVkKSBvciBvcD1cInJlbW92ZVwiIChvcHRpb25hbCDigJQgb21pdCB0byByZW1vdmUgY3VycmVudCkuJyksXG4gICAgICAgICAgICAgICAgICAgIHBhdGg6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnRm9yIG9wPVwic3dpdGNoXCIgKHJlcXVpcmVkKS4nKSxcbiAgICAgICAgICAgICAgICAgICAgc2NlbmVVVUlEOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0ZvciBvcD1cInN3aXRjaFwiIChvcHRpb25hbCBzY2VuZSBVVUlEIHNjb3BlKS4nKSxcbiAgICAgICAgICAgICAgICAgICAga2V5OiB6LmVudW0oWydwYXRoJywgJ3gnLCAneScsICdzeCcsICdzeScsICdvcGFjaXR5J10pLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0ZvciBvcD1cInNldF9kYXRhXCIgKHJlcXVpcmVkKSDigJQgcHJvcGVydHkga2V5LicpLFxuICAgICAgICAgICAgICAgICAgICB2YWx1ZTogei5hbnkoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdGb3Igb3A9XCJzZXRfZGF0YVwiIChyZXF1aXJlZCkg4oCUIHByb3BlcnR5IHZhbHVlLicpLFxuICAgICAgICAgICAgICAgICAgICB4OiB6Lm51bWJlcigpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0ZvciBvcD1cInNldF9wb3NpdGlvblwiIChyZXF1aXJlZCkuJyksXG4gICAgICAgICAgICAgICAgICAgIHk6IHoubnVtYmVyKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnRm9yIG9wPVwic2V0X3Bvc2l0aW9uXCIgKHJlcXVpcmVkKS4nKSxcbiAgICAgICAgICAgICAgICAgICAgc3g6IHoubnVtYmVyKCkubWluKDAuMSkubWF4KDEwKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdGb3Igb3A9XCJzZXRfc2NhbGVcIiAocmVxdWlyZWQpLCAwLjEtMTAuJyksXG4gICAgICAgICAgICAgICAgICAgIHN5OiB6Lm51bWJlcigpLm1pbigwLjEpLm1heCgxMCkub3B0aW9uYWwoKS5kZXNjcmliZSgnRm9yIG9wPVwic2V0X3NjYWxlXCIgKHJlcXVpcmVkKSwgMC4xLTEwLicpLFxuICAgICAgICAgICAgICAgICAgICBvcGFjaXR5OiB6Lm51bWJlcigpLm1pbigwKS5tYXgoMSkub3B0aW9uYWwoKS5kZXNjcmliZSgnRm9yIG9wPVwic2V0X29wYWNpdHlcIiAocmVxdWlyZWQpLCAwLTEuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLmRpc3BhdGNoKGEpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgXTtcbiAgICAgICAgdGhpcy5leGVjID0gZGVmaW5lVG9vbHMoZGVmcyk7XG4gICAgfVxuXG4gICAgZ2V0VG9vbHMoKTogVG9vbERlZmluaXRpb25bXSB7IHJldHVybiB0aGlzLmV4ZWMuZ2V0VG9vbHMoKTsgfVxuICAgIGV4ZWN1dGUodG9vbE5hbWU6IHN0cmluZywgYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHsgcmV0dXJuIHRoaXMuZXhlYy5leGVjdXRlKHRvb2xOYW1lLCBhcmdzKTsgfVxuXG4gICAgLy8gUGVyLW9wIHJlcXVpcmVkLWZpZWxkIHZhbGlkYXRpb24uIEVhY2ggb3AncyByZXF1aXJlZCBhcmdzIGFyZVxuICAgIC8vIHJlYXNzZXJ0ZWQgaGVyZSBiZWNhdXNlIHRoZSBmbGF0IHpvZCBzY2hlbWEgbWFya3MgdGhlbSBhbGxcbiAgICAvLyBvcHRpb25hbCBmb3Igc3VyZmFjZSBzaW1wbGljaXR5LiBGYWlsdXJlIHJldHVybnMgYSBjbGVhclxuICAgIC8vIHN0cnVjdHVyZWQgZXJyb3Igc28gQUkgY2FuIGNvcnJlY3QgdGhlIGNhbGwuXG4gICAgcHJpdmF0ZSByZXF1aXJlRmllbGRzKG9wOiBzdHJpbmcsIGFyZ3M6IGFueSwgLi4ua2V5czogc3RyaW5nW10pOiBzdHJpbmcgfCBudWxsIHtcbiAgICAgICAgZm9yIChjb25zdCBrIG9mIGtleXMpIHtcbiAgICAgICAgICAgIGlmIChhcmdzW2tdID09PSB1bmRlZmluZWQgfHwgYXJnc1trXSA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBgcmVmZXJlbmNlX2ltYWdlKG9wPVwiJHtvcH1cIikgcmVxdWlyZXMgJHtrfTsgZ290ICR7SlNPTi5zdHJpbmdpZnkoYXJncyl9LmA7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBkaXNwYXRjaChhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBvcCA9IGFyZ3Mub3AgYXMgc3RyaW5nO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgc3dpdGNoIChvcCkge1xuICAgICAgICAgICAgICAgIGNhc2UgJ2FkZCc6IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZXJyID0gdGhpcy5yZXF1aXJlRmllbGRzKG9wLCBhcmdzLCAncGF0aHMnKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGVycikgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnIgfTtcbiAgICAgICAgICAgICAgICAgICAgLy8gdjIuOS41IHJldmlldyBmaXggKENsYXVkZSDwn5+hKTogdGhlIHNjaGVtYSBtYXJrc1xuICAgICAgICAgICAgICAgICAgICAvLyBgcGF0aHNgIGFzIGBhcnJheShzdHJpbmcpYCBidXQgdGhlIGRpc3BhdGNoZXJcbiAgICAgICAgICAgICAgICAgICAgLy8gcmVxdWlyZUZpZWxkcyBoZWxwZXIgb25seSBjaGVja3MgcHJlc2VudC1hbmQtbm9uLW51bGwuXG4gICAgICAgICAgICAgICAgICAgIC8vIEEgbWlzc2hhcGVuIGNhbGwgKHN0cmluZyAvIG51bWJlcikgd291bGQgb3RoZXJ3aXNlXG4gICAgICAgICAgICAgICAgICAgIC8vIHBhc3MgdGhyb3VnaCB0byBFZGl0b3IuTWVzc2FnZSBhbmQgdGhlIHJlc3BvbnNlXG4gICAgICAgICAgICAgICAgICAgIC8vIG1lc3NhZ2Ugd291bGQgc2F5IFwiQWRkZWQgdW5kZWZpbmVkIHJlZmVyZW5jZSBpbWFnZShzKVwiLlxuICAgICAgICAgICAgICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkoYXJncy5wYXRocykgfHwgYXJncy5wYXRocy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYHJlZmVyZW5jZV9pbWFnZShvcD1cImFkZFwiKSByZXF1aXJlcyBwYXRocyB0byBiZSBhIG5vbi1lbXB0eSBhcnJheSBvZiBzdHJpbmdzOyBnb3QgJHtKU09OLnN0cmluZ2lmeShhcmdzLnBhdGhzKX0uYCB9O1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3JlZmVyZW5jZS1pbWFnZScsICdhZGQtaW1hZ2UnLCBhcmdzLnBhdGhzKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBkYXRhOiB7IG9wLCBhZGRlZFBhdGhzOiBhcmdzLnBhdGhzLCBjb3VudDogYXJncy5wYXRocy5sZW5ndGggfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBBZGRlZCAke2FyZ3MucGF0aHMubGVuZ3RofSByZWZlcmVuY2UgaW1hZ2UocylgLFxuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYXNlICdyZW1vdmUnOiB7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3JlZmVyZW5jZS1pbWFnZScsICdyZW1vdmUtaW1hZ2UnLCBhcmdzLnBhdGhzKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBkYXRhOiB7IG9wLCByZW1vdmVkUGF0aHM6IGFyZ3MucGF0aHMgPz8gbnVsbCB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYXJncy5wYXRocyAmJiBhcmdzLnBhdGhzLmxlbmd0aCA+IDBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA/IGBSZW1vdmVkICR7YXJncy5wYXRocy5sZW5ndGh9IHJlZmVyZW5jZSBpbWFnZShzKWBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA6ICdSZW1vdmVkIGN1cnJlbnQgcmVmZXJlbmNlIGltYWdlJyxcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2FzZSAnc3dpdGNoJzoge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBlcnIgPSB0aGlzLnJlcXVpcmVGaWVsZHMob3AsIGFyZ3MsICdwYXRoJyk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChlcnIpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyIH07XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNhbGxBcmdzID0gYXJncy5zY2VuZVVVSUQgPyBbYXJncy5wYXRoLCBhcmdzLnNjZW5lVVVJRF0gOiBbYXJncy5wYXRoXTtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgncmVmZXJlbmNlLWltYWdlJywgJ3N3aXRjaC1pbWFnZScsIC4uLmNhbGxBcmdzKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBkYXRhOiB7IG9wLCBwYXRoOiBhcmdzLnBhdGgsIHNjZW5lVVVJRDogYXJncy5zY2VuZVVVSUQgPz8gbnVsbCB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYFN3aXRjaGVkIHRvIHJlZmVyZW5jZSBpbWFnZTogJHthcmdzLnBhdGh9YCxcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2FzZSAnc2V0X2RhdGEnOiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGVyciA9IHRoaXMucmVxdWlyZUZpZWxkcyhvcCwgYXJncywgJ2tleScsICd2YWx1ZScpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoZXJyKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVyciB9O1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdyZWZlcmVuY2UtaW1hZ2UnLCAnc2V0LWltYWdlLWRhdGEnLCBhcmdzLmtleSwgYXJncy52YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgZGF0YTogeyBvcCwga2V5OiBhcmdzLmtleSwgdmFsdWU6IGFyZ3MudmFsdWUgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBSZWZlcmVuY2UgaW1hZ2UgJHthcmdzLmtleX0gc2V0IHRvICR7YXJncy52YWx1ZX1gLFxuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYXNlICdxdWVyeV9jb25maWcnOiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbmZpZzogYW55ID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgncmVmZXJlbmNlLWltYWdlJywgJ3F1ZXJ5LWNvbmZpZycpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBkYXRhOiB7IG9wLCBjb25maWcgfSB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYXNlICdxdWVyeV9jdXJyZW50Jzoge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjdXJyZW50OiBhbnkgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdyZWZlcmVuY2UtaW1hZ2UnLCAncXVlcnktY3VycmVudCcpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBkYXRhOiB7IG9wLCBjdXJyZW50IH0gfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2FzZSAncmVmcmVzaCc6IHtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgncmVmZXJlbmNlLWltYWdlJywgJ3JlZnJlc2gnKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogeyBvcCB9LCBtZXNzYWdlOiAnUmVmZXJlbmNlIGltYWdlIHJlZnJlc2hlZCcgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2FzZSAnc2V0X3Bvc2l0aW9uJzoge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBlcnIgPSB0aGlzLnJlcXVpcmVGaWVsZHMob3AsIGFyZ3MsICd4JywgJ3knKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGVycikgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnIgfTtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgncmVmZXJlbmNlLWltYWdlJywgJ3NldC1pbWFnZS1kYXRhJywgJ3gnLCBhcmdzLngpO1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdyZWZlcmVuY2UtaW1hZ2UnLCAnc2V0LWltYWdlLWRhdGEnLCAneScsIGFyZ3MueSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgZGF0YTogeyBvcCwgeDogYXJncy54LCB5OiBhcmdzLnkgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBSZWZlcmVuY2UgaW1hZ2UgcG9zaXRpb24gc2V0IHRvICgke2FyZ3MueH0sICR7YXJncy55fSlgLFxuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYXNlICdzZXRfc2NhbGUnOiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGVyciA9IHRoaXMucmVxdWlyZUZpZWxkcyhvcCwgYXJncywgJ3N4JywgJ3N5Jyk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChlcnIpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyIH07XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3JlZmVyZW5jZS1pbWFnZScsICdzZXQtaW1hZ2UtZGF0YScsICdzeCcsIGFyZ3Muc3gpO1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdyZWZlcmVuY2UtaW1hZ2UnLCAnc2V0LWltYWdlLWRhdGEnLCAnc3knLCBhcmdzLnN5KTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBkYXRhOiB7IG9wLCBzeDogYXJncy5zeCwgc3k6IGFyZ3Muc3kgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBSZWZlcmVuY2UgaW1hZ2Ugc2NhbGUgc2V0IHRvICgke2FyZ3Muc3h9LCAke2FyZ3Muc3l9KWAsXG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhc2UgJ3NldF9vcGFjaXR5Jzoge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBlcnIgPSB0aGlzLnJlcXVpcmVGaWVsZHMob3AsIGFyZ3MsICdvcGFjaXR5Jyk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChlcnIpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyIH07XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3JlZmVyZW5jZS1pbWFnZScsICdzZXQtaW1hZ2UtZGF0YScsICdvcGFjaXR5JywgYXJncy5vcGFjaXR5KTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBkYXRhOiB7IG9wLCBvcGFjaXR5OiBhcmdzLm9wYWNpdHkgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBSZWZlcmVuY2UgaW1hZ2Ugb3BhY2l0eSBzZXQgdG8gJHthcmdzLm9wYWNpdHl9YCxcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2FzZSAnbGlzdCc6IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY29uZmlnOiBhbnkgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdyZWZlcmVuY2UtaW1hZ2UnLCAncXVlcnktY29uZmlnJyk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGN1cnJlbnQ6IGFueSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3JlZmVyZW5jZS1pbWFnZScsICdxdWVyeS1jdXJyZW50Jyk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IHsgb3AsIGNvbmZpZywgY3VycmVudCB9IH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhc2UgJ2NsZWFyX2FsbCc6IHtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgncmVmZXJlbmNlLWltYWdlJywgJ3JlbW92ZS1pbWFnZScpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBkYXRhOiB7IG9wIH0sIG1lc3NhZ2U6ICdBbGwgcmVmZXJlbmNlIGltYWdlcyBjbGVhcmVkJyB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBVbmtub3duIHJlZmVyZW5jZV9pbWFnZSBvcDogJHtvcH1gIH07XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKSB9O1xuICAgICAgICB9XG4gICAgfVxufVxuIl19