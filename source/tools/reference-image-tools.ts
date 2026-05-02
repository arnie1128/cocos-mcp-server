import { ToolDefinition, ToolResponse, ToolExecutor } from '../types';
import { z } from '../lib/schema';
import { defineTools, ToolDef } from '../lib/define-tools';

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
export class ReferenceImageTools implements ToolExecutor {
    private readonly exec: ToolExecutor;

    constructor() {
        const defs: ToolDef[] = [
            {
                name: 'manage',
                title: 'Manage reference images',
                description: 'Manage scene reference images through the cocos reference-image module. Op-routing macro: pick `op` and supply the matching args. Replaces the v2.8.x flat surface (referenceImage_add_reference_image / remove_reference_image / switch_reference_image / set_reference_image_data / query_reference_image_config / query_current_reference_image / refresh_reference_image / set_reference_image_position / set_reference_image_scale / set_reference_image_opacity / list_reference_images / clear_all_reference_images — 12 → 1).',
                inputSchema: z.object({
                    op: z.enum([
                        'add', 'remove', 'switch', 'set_data', 'query_config',
                        'query_current', 'refresh', 'set_position', 'set_scale',
                        'set_opacity', 'list', 'clear_all',
                    ]).describe(
                        'Op selector. "add" — register absolute image paths (paths required). "remove" — remove specific paths or current image when omitted. "switch" — switch active image (path required, sceneUUID optional). "set_data" — set raw display property (key + value required). "query_config" — read module config. "query_current" — read current image state. "refresh" — refresh display without changing data. "set_position" — set x/y offsets. "set_scale" — set sx/sy scale 0.1-10. "set_opacity" — set opacity 0-1. "list" — read config + current data. "clear_all" — remove all reference images.'
                    ),
                    paths: z.array(z.string()).optional().describe('For op="add" (required) or op="remove" (optional — omit to remove current).'),
                    path: z.string().optional().describe('For op="switch" (required).'),
                    sceneUUID: z.string().optional().describe('For op="switch" (optional scene UUID scope).'),
                    key: z.enum(['path', 'x', 'y', 'sx', 'sy', 'opacity']).optional().describe('For op="set_data" (required) — property key.'),
                    value: z.any().optional().describe('For op="set_data" (required) — property value.'),
                    x: z.number().optional().describe('For op="set_position" (required).'),
                    y: z.number().optional().describe('For op="set_position" (required).'),
                    sx: z.number().min(0.1).max(10).optional().describe('For op="set_scale" (required), 0.1-10.'),
                    sy: z.number().min(0.1).max(10).optional().describe('For op="set_scale" (required), 0.1-10.'),
                    opacity: z.number().min(0).max(1).optional().describe('For op="set_opacity" (required), 0-1.'),
                }),
                handler: a => this.dispatch(a),
            },
        ];
        this.exec = defineTools(defs);
    }

    getTools(): ToolDefinition[] { return this.exec.getTools(); }
    execute(toolName: string, args: any): Promise<ToolResponse> { return this.exec.execute(toolName, args); }

    // Per-op required-field validation. Each op's required args are
    // reasserted here because the flat zod schema marks them all
    // optional for surface simplicity. Failure returns a clear
    // structured error so AI can correct the call.
    private requireFields(op: string, args: any, ...keys: string[]): string | null {
        for (const k of keys) {
            if (args[k] === undefined || args[k] === null) {
                return `reference_image(op="${op}") requires ${k}; got ${JSON.stringify(args)}.`;
            }
        }
        return null;
    }

    private async dispatch(args: any): Promise<ToolResponse> {
        const op = args.op as string;
        try {
            switch (op) {
                case 'add': {
                    const err = this.requireFields(op, args, 'paths');
                    if (err) return { success: false, error: err };
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
                        data: { op, removedPaths: args.paths ?? null },
                        message: args.paths && args.paths.length > 0
                            ? `Removed ${args.paths.length} reference image(s)`
                            : 'Removed current reference image',
                    };
                }
                case 'switch': {
                    const err = this.requireFields(op, args, 'path');
                    if (err) return { success: false, error: err };
                    const callArgs = args.sceneUUID ? [args.path, args.sceneUUID] : [args.path];
                    await Editor.Message.request('reference-image', 'switch-image', ...callArgs);
                    return {
                        success: true,
                        data: { op, path: args.path, sceneUUID: args.sceneUUID ?? null },
                        message: `Switched to reference image: ${args.path}`,
                    };
                }
                case 'set_data': {
                    const err = this.requireFields(op, args, 'key', 'value');
                    if (err) return { success: false, error: err };
                    await Editor.Message.request('reference-image', 'set-image-data', args.key, args.value);
                    return {
                        success: true,
                        data: { op, key: args.key, value: args.value },
                        message: `Reference image ${args.key} set to ${args.value}`,
                    };
                }
                case 'query_config': {
                    const config: any = await Editor.Message.request('reference-image', 'query-config');
                    return { success: true, data: { op, config } };
                }
                case 'query_current': {
                    const current: any = await Editor.Message.request('reference-image', 'query-current');
                    return { success: true, data: { op, current } };
                }
                case 'refresh': {
                    await Editor.Message.request('reference-image', 'refresh');
                    return { success: true, data: { op }, message: 'Reference image refreshed' };
                }
                case 'set_position': {
                    const err = this.requireFields(op, args, 'x', 'y');
                    if (err) return { success: false, error: err };
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
                    if (err) return { success: false, error: err };
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
                    if (err) return { success: false, error: err };
                    await Editor.Message.request('reference-image', 'set-image-data', 'opacity', args.opacity);
                    return {
                        success: true,
                        data: { op, opacity: args.opacity },
                        message: `Reference image opacity set to ${args.opacity}`,
                    };
                }
                case 'list': {
                    const config: any = await Editor.Message.request('reference-image', 'query-config');
                    const current: any = await Editor.Message.request('reference-image', 'query-current');
                    return { success: true, data: { op, config, current } };
                }
                case 'clear_all': {
                    await Editor.Message.request('reference-image', 'remove-image');
                    return { success: true, data: { op }, message: 'All reference images cleared' };
                }
                default:
                    return { success: false, error: `Unknown reference_image op: ${op}` };
            }
        } catch (err: any) {
            return { success: false, error: err?.message ?? String(err) };
        }
    }
}
