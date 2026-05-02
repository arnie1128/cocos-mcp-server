import { ok, fail } from '../lib/response';
/**
 * asset-meta-tools — three MCP tools that expose the v2.4.3
 * asset-interpreter system to AI. Registered under the `assetMeta`
 * category so the public MCP names are:
 *
 *   assetMeta_get_properties      — read meta + sub-meta userData per
 *                                   importer-specific layout
 *   assetMeta_set_properties      — batch-write meta fields with path
 *                                   validation; saves + refresh-asset
 *                                   on commit so cocos re-imports
 *   assetMeta_list_interpreters   — what importer types we recognise
 *
 * All three accept InstanceReference for the asset target (preferred
 * v2.4.0 form: `{id: assetUuid, type: 'asset:cc.ImageAsset'}`). For
 * backward compatibility they also accept a bare `assetUuid` string.
 *
 * Demonstrates the v2.4.0 step-5 @mcpTool decorator + step-4
 * InstanceReference shape.
 *
 * Reference: docs/research/repos/RomaRogov-cocos-mcp.md.
 */

import { ToolDefinition, ToolResponse, ToolExecutor } from '../types';
import { z } from '../lib/schema';
import { mcpTool, defineToolsFromDecorators } from '../lib/decorators';
import { instanceReferenceSchema, InstanceReference } from '../lib/instance-reference';
import { decodeUuid } from '../lib/uuid-compat';
import { AssetInterpreterManager } from '../asset-interpreters/manager';
import {
    ImageInterpreter, TextureInterpreter, SpriteFrameInterpreter,
    FbxInterpreter, MaterialInterpreter, EffectInterpreter,
    ParticleInterpreter, UnknownInterpreter,
    AnimationClipInterpreter, AudioClipInterpreter, PrefabInterpreter,
    SceneInterpreter, LabelAtlasInterpreter, SpineInterpreter,
    JsonInterpreter, TiledMapInterpreter,
} from '../asset-interpreters/specialized';
import { PropertySetSpec } from '../asset-interpreters/interface';

function buildManager(): AssetInterpreterManager {
    const fallback = new UnknownInterpreter();
    return new AssetInterpreterManager(
        [
            new ImageInterpreter(),
            new TextureInterpreter(),
            new SpriteFrameInterpreter(),
            new FbxInterpreter(),
            new MaterialInterpreter(),
            new EffectInterpreter(),
            new ParticleInterpreter(),
            new AnimationClipInterpreter(),
            new AudioClipInterpreter(),
            new PrefabInterpreter(),
            new SceneInterpreter(),
            new LabelAtlasInterpreter(),
            new SpineInterpreter(),
            new JsonInterpreter(),
            new TiledMapInterpreter(),
        ],
        fallback,
    );
}

interface AssetTarget {
    reference?: InstanceReference;
    assetUuid?: string;
}

async function resolveAssetInfo(target: AssetTarget): Promise<{ assetInfo: any } | { error: string }> {
    // v2.4.4 review fix (gemini + claude): symmetric with resolveReference's
    // malformed-reference detection (v2.4.1 / v2.4.2 fix at
    // source/lib/instance-reference.ts). A caller passing
    // `reference: {}` (no id) plus a valid assetUuid would otherwise
    // silently fall back to assetUuid — masks intent.
    if (target.reference && !target.reference.id) {
        return { error: 'asset-meta tool: reference.id is required when reference is provided' };
    }
    const rawUuid = target.reference?.id ?? target.assetUuid;
    if (!rawUuid) {
        return { error: 'asset-meta tool: provide reference={id,type} or assetUuid' };
    }
    if (target.reference?.id && target.assetUuid && target.reference.id !== target.assetUuid) {
        return { error: `asset-meta tool: reference.id (${target.reference.id}) conflicts with assetUuid (${target.assetUuid}); pass only one` };
    }
    // v2.6.0 T-V26-bundle: cocos sub-asset UUIDs use `<uuid>@<sub-key>`.
    // Some clients base64-encode `@`-containing strings to dodge wire
    // mangling — decode here so both forms reach query-asset-info as the
    // raw cocos format. Plain UUIDs pass through unchanged.
    const uuid = decodeUuid(rawUuid);
    try {
        const info = await Editor.Message.request('asset-db', 'query-asset-info', uuid);
        if (!info) return { error: `Asset not found: ${uuid}` };
        return { assetInfo: info };
    } catch (err: any) {
        return { error: `query-asset-info failed for ${uuid}: ${err?.message ?? String(err)}` };
    }
}

const assetTargetSchema = z.object({
    reference: instanceReferenceSchema.optional().describe('InstanceReference {id,type}. Preferred form. type may be "asset:cc.ImageAsset" etc., diagnostic only.'),
    assetUuid: z.string().optional().describe('Asset UUID. Used when reference is omitted.'),
});

export class AssetMetaTools implements ToolExecutor {
    private readonly exec: ToolExecutor;
    private readonly manager: AssetInterpreterManager;

    constructor() {
        this.manager = buildManager();
        this.exec = defineToolsFromDecorators(this);
    }

    getTools(): ToolDefinition[] { return this.exec.getTools(); }
    execute(toolName: string, args: any): Promise<ToolResponse> { return this.exec.execute(toolName, args); }

    @mcpTool({
        name: 'list_interpreters',
        title: 'List asset interpreters',
        description: '[specialist] List the asset importer types this server has specialized interpreters for. The "*" entry is the read-only fallback used for any importer not in the list. Use to plan assetMeta_set_properties calls — writes against the fallback always reject. No side effects.',
        inputSchema: z.object({}),
    })
    async listInterpreters(): Promise<ToolResponse> {
        return ok({
                importerTypes: this.manager.listImporterTypes(),
                fallbackBehaviour: 'UnknownInterpreter rejects writes; reads work as best-effort meta.userData dump.',
            });
    }

    @mcpTool({
        name: 'get_properties',
        title: 'Read asset meta properties',
        description: '[specialist] Read an asset\'s meta + sub-meta userData via its importer-specific interpreter. Returns {properties: {path: {type, value, tooltip?, enumList?}}, arrays: {path: {type}}}. Use BEFORE assetMeta_set_properties so AI sees the real property names + types instead of guessing. Pair `includeTooltips: true` when AI needs context for unfamiliar importers. Note: useAdvancedInspection is reserved — full material editing is deferred to v2.5+, so the flag has no effect in v2.4.x.',
        inputSchema: assetTargetSchema.extend({
            includeTooltips: z.boolean().default(false).describe('Include i18n-resolved tooltip text for each property. Slower; only request when AI is exploring an unfamiliar importer.'),
            useAdvancedInspection: z.boolean().default(false).describe('Reserved for v2.5+. Has no effect in v2.4.x because the only consumer (MaterialInterpreter advanced editing) is deferred until the scene/apply-material + UUID-preprocessing layer is ported. Pass false until v2.5 lands.'),
        }),
    })
    async getProperties(args: AssetTarget & { includeTooltips?: boolean; useAdvancedInspection?: boolean }): Promise<ToolResponse> {
        const resolved = await resolveAssetInfo(args);
        if ('error' in resolved) return fail(resolved.error);
        const description = await this.manager.getAssetProperties(
            resolved.assetInfo,
            args.includeTooltips ?? false,
            args.useAdvancedInspection ?? false,
        );
        if (description.error) {
            return fail(description.error, description);
        }
        return ok(description);
    }

    @mcpTool({
        name: 'set_properties',
        title: 'Write asset meta properties',
        description: '[specialist] Batch-write asset meta fields. Each entry is {propertyPath, propertyType, propertyValue}; the interpreter validates the path against an allow-list (userData.*, subMetas.*, platformSettings.*) and rejects unknown roots, prototype-pollution segments (__proto__, constructor, prototype), and empty segments. On commit the interpreter calls asset-db save-asset-meta + refresh-asset so cocos re-imports with the new settings. Use after assetMeta_get_properties to ensure paths/types are correct. Returns per-entry success/error so partial failures are visible; entries that succeeded on disk but failed re-import carry a `warning` field instead of being flipped to failure.',
        inputSchema: assetTargetSchema.extend({
            properties: z.array(z.object({
                propertyPath: z.string().describe('Dotted meta path. Allowed roots: userData.*, subMetas.*, platformSettings.*. Forbidden segments anywhere in the path: __proto__, constructor, prototype.'),
                propertyType: z.string().describe('Type tag for value coercion: Boolean (accepts true/false/1/0 strings), Number/Float (rejects NaN), Integer (rejects NaN), String, Enum, cc.ValueType, cc.Object.'),
                propertyValue: z.any().describe('Raw value; coerced per propertyType.'),
            })).min(1).max(50).describe('Property writes. Capped at 50 per call.'),
        }),
    })
    async setProperties(args: AssetTarget & { properties: PropertySetSpec[] }): Promise<ToolResponse> {
        const resolved = await resolveAssetInfo(args);
        if ('error' in resolved) return fail(resolved.error);
        const results = await this.manager.setAssetProperties(resolved.assetInfo, args.properties);
        const failed = results.filter(r => !r.success);
        return {
            success: failed.length === 0,
            data: {
                assetUuid: resolved.assetInfo.uuid,
                importer: resolved.assetInfo.importer,
                total: results.length,
                failedCount: failed.length,
                results,
            },
            message: failed.length === 0
                ? `Wrote ${results.length} asset-meta properties`
                : `${failed.length}/${results.length} asset-meta writes failed`,
        };
    }
}
