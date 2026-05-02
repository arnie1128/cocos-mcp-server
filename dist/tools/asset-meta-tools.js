"use strict";
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
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssetMetaTools = void 0;
const schema_1 = require("../lib/schema");
const decorators_1 = require("../lib/decorators");
const instance_reference_1 = require("../lib/instance-reference");
const manager_1 = require("../asset-interpreters/manager");
const specialized_1 = require("../asset-interpreters/specialized");
function buildManager() {
    const fallback = new specialized_1.UnknownInterpreter();
    return new manager_1.AssetInterpreterManager([
        new specialized_1.ImageInterpreter(),
        new specialized_1.TextureInterpreter(),
        new specialized_1.SpriteFrameInterpreter(),
        new specialized_1.FbxInterpreter(),
        new specialized_1.MaterialInterpreter(),
        new specialized_1.EffectInterpreter(),
        new specialized_1.ParticleInterpreter(),
    ], fallback);
}
async function resolveAssetInfo(target) {
    var _a, _b, _c, _d;
    // v2.4.4 review fix (gemini + claude): symmetric with resolveReference's
    // malformed-reference detection (v2.4.1 / v2.4.2 fix at
    // source/lib/instance-reference.ts). A caller passing
    // `reference: {}` (no id) plus a valid assetUuid would otherwise
    // silently fall back to assetUuid — masks intent.
    if (target.reference && !target.reference.id) {
        return { error: 'asset-meta tool: reference.id is required when reference is provided' };
    }
    const uuid = (_b = (_a = target.reference) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : target.assetUuid;
    if (!uuid) {
        return { error: 'asset-meta tool: provide reference={id,type} or assetUuid' };
    }
    if (((_c = target.reference) === null || _c === void 0 ? void 0 : _c.id) && target.assetUuid && target.reference.id !== target.assetUuid) {
        return { error: `asset-meta tool: reference.id (${target.reference.id}) conflicts with assetUuid (${target.assetUuid}); pass only one` };
    }
    try {
        const info = await Editor.Message.request('asset-db', 'query-asset-info', uuid);
        if (!info)
            return { error: `Asset not found: ${uuid}` };
        return { assetInfo: info };
    }
    catch (err) {
        return { error: `query-asset-info failed for ${uuid}: ${(_d = err === null || err === void 0 ? void 0 : err.message) !== null && _d !== void 0 ? _d : String(err)}` };
    }
}
const assetTargetSchema = schema_1.z.object({
    reference: instance_reference_1.instanceReferenceSchema.optional().describe('InstanceReference {id,type}. Preferred form. type may be "asset:cc.ImageAsset" etc., diagnostic only.'),
    assetUuid: schema_1.z.string().optional().describe('Asset UUID. Used when reference is omitted.'),
});
class AssetMetaTools {
    constructor() {
        this.manager = buildManager();
        this.exec = (0, decorators_1.defineToolsFromDecorators)(this);
    }
    getTools() { return this.exec.getTools(); }
    execute(toolName, args) { return this.exec.execute(toolName, args); }
    async listInterpreters() {
        return {
            success: true,
            data: {
                importerTypes: this.manager.listImporterTypes(),
                fallbackBehaviour: 'UnknownInterpreter rejects writes; reads work as best-effort meta.userData dump.',
            },
        };
    }
    async getProperties(args) {
        var _a, _b;
        const resolved = await resolveAssetInfo(args);
        if ('error' in resolved)
            return { success: false, error: resolved.error };
        const description = await this.manager.getAssetProperties(resolved.assetInfo, (_a = args.includeTooltips) !== null && _a !== void 0 ? _a : false, (_b = args.useAdvancedInspection) !== null && _b !== void 0 ? _b : false);
        if (description.error) {
            return { success: false, error: description.error, data: description };
        }
        return { success: true, data: description };
    }
    async setProperties(args) {
        const resolved = await resolveAssetInfo(args);
        if ('error' in resolved)
            return { success: false, error: resolved.error };
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
exports.AssetMetaTools = AssetMetaTools;
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'list_interpreters',
        description: 'List the asset importer types this server has specialized interpreters for. The "*" entry is the read-only fallback used for any importer not in the list. Use to plan assetMeta_set_properties calls — writes against the fallback always reject. No side effects.',
        inputSchema: schema_1.z.object({}),
    })
], AssetMetaTools.prototype, "listInterpreters", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'get_properties',
        description: 'Read an asset\'s meta + sub-meta userData via its importer-specific interpreter. Returns {properties: {path: {type, value, tooltip?, enumList?}}, arrays: {path: {type}}}. Use BEFORE assetMeta_set_properties so AI sees the real property names + types instead of guessing. Pair `includeTooltips: true` when AI needs context for unfamiliar importers. Note: useAdvancedInspection is reserved — full material editing is deferred to v2.5+, so the flag has no effect in v2.4.x.',
        inputSchema: assetTargetSchema.extend({
            includeTooltips: schema_1.z.boolean().default(false).describe('Include i18n-resolved tooltip text for each property. Slower; only request when AI is exploring an unfamiliar importer.'),
            useAdvancedInspection: schema_1.z.boolean().default(false).describe('Reserved for v2.5+. Has no effect in v2.4.x because the only consumer (MaterialInterpreter advanced editing) is deferred until the scene/apply-material + UUID-preprocessing layer is ported. Pass false until v2.5 lands.'),
        }),
    })
], AssetMetaTools.prototype, "getProperties", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'set_properties',
        description: 'Batch-write asset meta fields. Each entry is {propertyPath, propertyType, propertyValue}; the interpreter validates the path against an allow-list (userData.*, subMetas.*, platformSettings.*) and rejects unknown roots, prototype-pollution segments (__proto__, constructor, prototype), and empty segments. On commit the interpreter calls asset-db save-asset-meta + refresh-asset so cocos re-imports with the new settings. Use after assetMeta_get_properties to ensure paths/types are correct. Returns per-entry success/error so partial failures are visible; entries that succeeded on disk but failed re-import carry a `warning` field instead of being flipped to failure.',
        inputSchema: assetTargetSchema.extend({
            properties: schema_1.z.array(schema_1.z.object({
                propertyPath: schema_1.z.string().describe('Dotted meta path. Allowed roots: userData.*, subMetas.*, platformSettings.*. Forbidden segments anywhere in the path: __proto__, constructor, prototype.'),
                propertyType: schema_1.z.string().describe('Type tag for value coercion: Boolean (accepts true/false/1/0 strings), Number/Float (rejects NaN), Integer (rejects NaN), String, Enum, cc.ValueType, cc.Object.'),
                propertyValue: schema_1.z.any().describe('Raw value; coerced per propertyType.'),
            })).min(1).max(50).describe('Property writes. Capped at 50 per call.'),
        }),
    })
], AssetMetaTools.prototype, "setProperties", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXNzZXQtbWV0YS10b29scy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NvdXJjZS90b29scy9hc3NldC1tZXRhLXRvb2xzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FvQkc7Ozs7Ozs7OztBQUdILDBDQUFrQztBQUNsQyxrREFBdUU7QUFDdkUsa0VBQXVGO0FBQ3ZGLDJEQUF3RTtBQUN4RSxtRUFJMkM7QUFHM0MsU0FBUyxZQUFZO0lBQ2pCLE1BQU0sUUFBUSxHQUFHLElBQUksZ0NBQWtCLEVBQUUsQ0FBQztJQUMxQyxPQUFPLElBQUksaUNBQXVCLENBQzlCO1FBQ0ksSUFBSSw4QkFBZ0IsRUFBRTtRQUN0QixJQUFJLGdDQUFrQixFQUFFO1FBQ3hCLElBQUksb0NBQXNCLEVBQUU7UUFDNUIsSUFBSSw0QkFBYyxFQUFFO1FBQ3BCLElBQUksaUNBQW1CLEVBQUU7UUFDekIsSUFBSSwrQkFBaUIsRUFBRTtRQUN2QixJQUFJLGlDQUFtQixFQUFFO0tBQzVCLEVBQ0QsUUFBUSxDQUNYLENBQUM7QUFDTixDQUFDO0FBT0QsS0FBSyxVQUFVLGdCQUFnQixDQUFDLE1BQW1COztJQUMvQyx5RUFBeUU7SUFDekUsd0RBQXdEO0lBQ3hELHNEQUFzRDtJQUN0RCxpRUFBaUU7SUFDakUsa0RBQWtEO0lBQ2xELElBQUksTUFBTSxDQUFDLFNBQVMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsRUFBRSxFQUFFLENBQUM7UUFDM0MsT0FBTyxFQUFFLEtBQUssRUFBRSxzRUFBc0UsRUFBRSxDQUFDO0lBQzdGLENBQUM7SUFDRCxNQUFNLElBQUksR0FBRyxNQUFBLE1BQUEsTUFBTSxDQUFDLFNBQVMsMENBQUUsRUFBRSxtQ0FBSSxNQUFNLENBQUMsU0FBUyxDQUFDO0lBQ3RELElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNSLE9BQU8sRUFBRSxLQUFLLEVBQUUsMkRBQTJELEVBQUUsQ0FBQztJQUNsRixDQUFDO0lBQ0QsSUFBSSxDQUFBLE1BQUEsTUFBTSxDQUFDLFNBQVMsMENBQUUsRUFBRSxLQUFJLE1BQU0sQ0FBQyxTQUFTLElBQUksTUFBTSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEtBQUssTUFBTSxDQUFDLFNBQVMsRUFBRSxDQUFDO1FBQ3ZGLE9BQU8sRUFBRSxLQUFLLEVBQUUsa0NBQWtDLE1BQU0sQ0FBQyxTQUFTLENBQUMsRUFBRSwrQkFBK0IsTUFBTSxDQUFDLFNBQVMsa0JBQWtCLEVBQUUsQ0FBQztJQUM3SSxDQUFDO0lBQ0QsSUFBSSxDQUFDO1FBQ0QsTUFBTSxJQUFJLEdBQUcsTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUUsa0JBQWtCLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDaEYsSUFBSSxDQUFDLElBQUk7WUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLG9CQUFvQixJQUFJLEVBQUUsRUFBRSxDQUFDO1FBQ3hELE9BQU8sRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLENBQUM7SUFDL0IsQ0FBQztJQUFDLE9BQU8sR0FBUSxFQUFFLENBQUM7UUFDaEIsT0FBTyxFQUFFLEtBQUssRUFBRSwrQkFBK0IsSUFBSSxLQUFLLE1BQUEsR0FBRyxhQUFILEdBQUcsdUJBQUgsR0FBRyxDQUFFLE9BQU8sbUNBQUksTUFBTSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEVBQUUsQ0FBQztJQUM1RixDQUFDO0FBQ0wsQ0FBQztBQUVELE1BQU0saUJBQWlCLEdBQUcsVUFBQyxDQUFDLE1BQU0sQ0FBQztJQUMvQixTQUFTLEVBQUUsNENBQXVCLENBQUMsUUFBUSxFQUFFLENBQUMsUUFBUSxDQUFDLHVHQUF1RyxDQUFDO0lBQy9KLFNBQVMsRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxFQUFFLENBQUMsUUFBUSxDQUFDLDZDQUE2QyxDQUFDO0NBQzNGLENBQUMsQ0FBQztBQUVILE1BQWEsY0FBYztJQUl2QjtRQUNJLElBQUksQ0FBQyxPQUFPLEdBQUcsWUFBWSxFQUFFLENBQUM7UUFDOUIsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFBLHNDQUF5QixFQUFDLElBQUksQ0FBQyxDQUFDO0lBQ2hELENBQUM7SUFFRCxRQUFRLEtBQXVCLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDN0QsT0FBTyxDQUFDLFFBQWdCLEVBQUUsSUFBUyxJQUEyQixPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFPbkcsQUFBTixLQUFLLENBQUMsZ0JBQWdCO1FBQ2xCLE9BQU87WUFDSCxPQUFPLEVBQUUsSUFBSTtZQUNiLElBQUksRUFBRTtnQkFDRixhQUFhLEVBQUUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxpQkFBaUIsRUFBRTtnQkFDL0MsaUJBQWlCLEVBQUUsa0ZBQWtGO2FBQ3hHO1NBQ0osQ0FBQztJQUNOLENBQUM7SUFVSyxBQUFOLEtBQUssQ0FBQyxhQUFhLENBQUMsSUFBa0Y7O1FBQ2xHLE1BQU0sUUFBUSxHQUFHLE1BQU0sZ0JBQWdCLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDOUMsSUFBSSxPQUFPLElBQUksUUFBUTtZQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxRQUFRLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDMUUsTUFBTSxXQUFXLEdBQUcsTUFBTSxJQUFJLENBQUMsT0FBTyxDQUFDLGtCQUFrQixDQUNyRCxRQUFRLENBQUMsU0FBUyxFQUNsQixNQUFBLElBQUksQ0FBQyxlQUFlLG1DQUFJLEtBQUssRUFDN0IsTUFBQSxJQUFJLENBQUMscUJBQXFCLG1DQUFJLEtBQUssQ0FDdEMsQ0FBQztRQUNGLElBQUksV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ3BCLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxXQUFXLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxXQUFXLEVBQUUsQ0FBQztRQUMzRSxDQUFDO1FBQ0QsT0FBTyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLFdBQVcsRUFBRSxDQUFDO0lBQ2hELENBQUM7SUFhSyxBQUFOLEtBQUssQ0FBQyxhQUFhLENBQUMsSUFBcUQ7UUFDckUsTUFBTSxRQUFRLEdBQUcsTUFBTSxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUM5QyxJQUFJLE9BQU8sSUFBSSxRQUFRO1lBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLFFBQVEsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUMxRSxNQUFNLE9BQU8sR0FBRyxNQUFNLElBQUksQ0FBQyxPQUFPLENBQUMsa0JBQWtCLENBQUMsUUFBUSxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDM0YsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQy9DLE9BQU87WUFDSCxPQUFPLEVBQUUsTUFBTSxDQUFDLE1BQU0sS0FBSyxDQUFDO1lBQzVCLElBQUksRUFBRTtnQkFDRixTQUFTLEVBQUUsUUFBUSxDQUFDLFNBQVMsQ0FBQyxJQUFJO2dCQUNsQyxRQUFRLEVBQUUsUUFBUSxDQUFDLFNBQVMsQ0FBQyxRQUFRO2dCQUNyQyxLQUFLLEVBQUUsT0FBTyxDQUFDLE1BQU07Z0JBQ3JCLFdBQVcsRUFBRSxNQUFNLENBQUMsTUFBTTtnQkFDMUIsT0FBTzthQUNWO1lBQ0QsT0FBTyxFQUFFLE1BQU0sQ0FBQyxNQUFNLEtBQUssQ0FBQztnQkFDeEIsQ0FBQyxDQUFDLFNBQVMsT0FBTyxDQUFDLE1BQU0sd0JBQXdCO2dCQUNqRCxDQUFDLENBQUMsR0FBRyxNQUFNLENBQUMsTUFBTSxJQUFJLE9BQU8sQ0FBQyxNQUFNLDJCQUEyQjtTQUN0RSxDQUFDO0lBQ04sQ0FBQztDQUNKO0FBL0VELHdDQStFQztBQTlEUztJQUxMLElBQUEsb0JBQU8sRUFBQztRQUNMLElBQUksRUFBRSxtQkFBbUI7UUFDekIsV0FBVyxFQUFFLHFRQUFxUTtRQUNsUixXQUFXLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7S0FDNUIsQ0FBQztzREFTRDtBQVVLO0lBUkwsSUFBQSxvQkFBTyxFQUFDO1FBQ0wsSUFBSSxFQUFFLGdCQUFnQjtRQUN0QixXQUFXLEVBQUUsd2RBQXdkO1FBQ3JlLFdBQVcsRUFBRSxpQkFBaUIsQ0FBQyxNQUFNLENBQUM7WUFDbEMsZUFBZSxFQUFFLFVBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUMsUUFBUSxDQUFDLHlIQUF5SCxDQUFDO1lBQy9LLHFCQUFxQixFQUFFLFVBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUMsUUFBUSxDQUFDLDROQUE0TixDQUFDO1NBQzNSLENBQUM7S0FDTCxDQUFDO21EQWFEO0FBYUs7SUFYTCxJQUFBLG9CQUFPLEVBQUM7UUFDTCxJQUFJLEVBQUUsZ0JBQWdCO1FBQ3RCLFdBQVcsRUFBRSw4cEJBQThwQjtRQUMzcUIsV0FBVyxFQUFFLGlCQUFpQixDQUFDLE1BQU0sQ0FBQztZQUNsQyxVQUFVLEVBQUUsVUFBQyxDQUFDLEtBQUssQ0FBQyxVQUFDLENBQUMsTUFBTSxDQUFDO2dCQUN6QixZQUFZLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQywwSkFBMEosQ0FBQztnQkFDN0wsWUFBWSxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLENBQUMsa0tBQWtLLENBQUM7Z0JBQ3JNLGFBQWEsRUFBRSxVQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsUUFBUSxDQUFDLHNDQUFzQyxDQUFDO2FBQzFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLHlDQUF5QyxDQUFDO1NBQ3pFLENBQUM7S0FDTCxDQUFDO21EQW1CRCIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogYXNzZXQtbWV0YS10b29scyDigJQgdGhyZWUgTUNQIHRvb2xzIHRoYXQgZXhwb3NlIHRoZSB2Mi40LjNcbiAqIGFzc2V0LWludGVycHJldGVyIHN5c3RlbSB0byBBSS4gUmVnaXN0ZXJlZCB1bmRlciB0aGUgYGFzc2V0TWV0YWBcbiAqIGNhdGVnb3J5IHNvIHRoZSBwdWJsaWMgTUNQIG5hbWVzIGFyZTpcbiAqXG4gKiAgIGFzc2V0TWV0YV9nZXRfcHJvcGVydGllcyAgICAgIOKAlCByZWFkIG1ldGEgKyBzdWItbWV0YSB1c2VyRGF0YSBwZXJcbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbXBvcnRlci1zcGVjaWZpYyBsYXlvdXRcbiAqICAgYXNzZXRNZXRhX3NldF9wcm9wZXJ0aWVzICAgICAg4oCUIGJhdGNoLXdyaXRlIG1ldGEgZmllbGRzIHdpdGggcGF0aFxuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbGlkYXRpb247IHNhdmVzICsgcmVmcmVzaC1hc3NldFxuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9uIGNvbW1pdCBzbyBjb2NvcyByZS1pbXBvcnRzXG4gKiAgIGFzc2V0TWV0YV9saXN0X2ludGVycHJldGVycyAgIOKAlCB3aGF0IGltcG9ydGVyIHR5cGVzIHdlIHJlY29nbmlzZVxuICpcbiAqIEFsbCB0aHJlZSBhY2NlcHQgSW5zdGFuY2VSZWZlcmVuY2UgZm9yIHRoZSBhc3NldCB0YXJnZXQgKHByZWZlcnJlZFxuICogdjIuNC4wIGZvcm06IGB7aWQ6IGFzc2V0VXVpZCwgdHlwZTogJ2Fzc2V0OmNjLkltYWdlQXNzZXQnfWApLiBGb3JcbiAqIGJhY2t3YXJkIGNvbXBhdGliaWxpdHkgdGhleSBhbHNvIGFjY2VwdCBhIGJhcmUgYGFzc2V0VXVpZGAgc3RyaW5nLlxuICpcbiAqIERlbW9uc3RyYXRlcyB0aGUgdjIuNC4wIHN0ZXAtNSBAbWNwVG9vbCBkZWNvcmF0b3IgKyBzdGVwLTRcbiAqIEluc3RhbmNlUmVmZXJlbmNlIHNoYXBlLlxuICpcbiAqIFJlZmVyZW5jZTogZG9jcy9yZXNlYXJjaC9yZXBvcy9Sb21hUm9nb3YtY29jb3MtbWNwLm1kLlxuICovXG5cbmltcG9ydCB7IFRvb2xEZWZpbml0aW9uLCBUb29sUmVzcG9uc2UsIFRvb2xFeGVjdXRvciB9IGZyb20gJy4uL3R5cGVzJztcbmltcG9ydCB7IHogfSBmcm9tICcuLi9saWIvc2NoZW1hJztcbmltcG9ydCB7IG1jcFRvb2wsIGRlZmluZVRvb2xzRnJvbURlY29yYXRvcnMgfSBmcm9tICcuLi9saWIvZGVjb3JhdG9ycyc7XG5pbXBvcnQgeyBpbnN0YW5jZVJlZmVyZW5jZVNjaGVtYSwgSW5zdGFuY2VSZWZlcmVuY2UgfSBmcm9tICcuLi9saWIvaW5zdGFuY2UtcmVmZXJlbmNlJztcbmltcG9ydCB7IEFzc2V0SW50ZXJwcmV0ZXJNYW5hZ2VyIH0gZnJvbSAnLi4vYXNzZXQtaW50ZXJwcmV0ZXJzL21hbmFnZXInO1xuaW1wb3J0IHtcbiAgICBJbWFnZUludGVycHJldGVyLCBUZXh0dXJlSW50ZXJwcmV0ZXIsIFNwcml0ZUZyYW1lSW50ZXJwcmV0ZXIsXG4gICAgRmJ4SW50ZXJwcmV0ZXIsIE1hdGVyaWFsSW50ZXJwcmV0ZXIsIEVmZmVjdEludGVycHJldGVyLFxuICAgIFBhcnRpY2xlSW50ZXJwcmV0ZXIsIFVua25vd25JbnRlcnByZXRlcixcbn0gZnJvbSAnLi4vYXNzZXQtaW50ZXJwcmV0ZXJzL3NwZWNpYWxpemVkJztcbmltcG9ydCB7IFByb3BlcnR5U2V0U3BlYyB9IGZyb20gJy4uL2Fzc2V0LWludGVycHJldGVycy9pbnRlcmZhY2UnO1xuXG5mdW5jdGlvbiBidWlsZE1hbmFnZXIoKTogQXNzZXRJbnRlcnByZXRlck1hbmFnZXIge1xuICAgIGNvbnN0IGZhbGxiYWNrID0gbmV3IFVua25vd25JbnRlcnByZXRlcigpO1xuICAgIHJldHVybiBuZXcgQXNzZXRJbnRlcnByZXRlck1hbmFnZXIoXG4gICAgICAgIFtcbiAgICAgICAgICAgIG5ldyBJbWFnZUludGVycHJldGVyKCksXG4gICAgICAgICAgICBuZXcgVGV4dHVyZUludGVycHJldGVyKCksXG4gICAgICAgICAgICBuZXcgU3ByaXRlRnJhbWVJbnRlcnByZXRlcigpLFxuICAgICAgICAgICAgbmV3IEZieEludGVycHJldGVyKCksXG4gICAgICAgICAgICBuZXcgTWF0ZXJpYWxJbnRlcnByZXRlcigpLFxuICAgICAgICAgICAgbmV3IEVmZmVjdEludGVycHJldGVyKCksXG4gICAgICAgICAgICBuZXcgUGFydGljbGVJbnRlcnByZXRlcigpLFxuICAgICAgICBdLFxuICAgICAgICBmYWxsYmFjayxcbiAgICApO1xufVxuXG5pbnRlcmZhY2UgQXNzZXRUYXJnZXQge1xuICAgIHJlZmVyZW5jZT86IEluc3RhbmNlUmVmZXJlbmNlO1xuICAgIGFzc2V0VXVpZD86IHN0cmluZztcbn1cblxuYXN5bmMgZnVuY3Rpb24gcmVzb2x2ZUFzc2V0SW5mbyh0YXJnZXQ6IEFzc2V0VGFyZ2V0KTogUHJvbWlzZTx7IGFzc2V0SW5mbzogYW55IH0gfCB7IGVycm9yOiBzdHJpbmcgfT4ge1xuICAgIC8vIHYyLjQuNCByZXZpZXcgZml4IChnZW1pbmkgKyBjbGF1ZGUpOiBzeW1tZXRyaWMgd2l0aCByZXNvbHZlUmVmZXJlbmNlJ3NcbiAgICAvLyBtYWxmb3JtZWQtcmVmZXJlbmNlIGRldGVjdGlvbiAodjIuNC4xIC8gdjIuNC4yIGZpeCBhdFxuICAgIC8vIHNvdXJjZS9saWIvaW5zdGFuY2UtcmVmZXJlbmNlLnRzKS4gQSBjYWxsZXIgcGFzc2luZ1xuICAgIC8vIGByZWZlcmVuY2U6IHt9YCAobm8gaWQpIHBsdXMgYSB2YWxpZCBhc3NldFV1aWQgd291bGQgb3RoZXJ3aXNlXG4gICAgLy8gc2lsZW50bHkgZmFsbCBiYWNrIHRvIGFzc2V0VXVpZCDigJQgbWFza3MgaW50ZW50LlxuICAgIGlmICh0YXJnZXQucmVmZXJlbmNlICYmICF0YXJnZXQucmVmZXJlbmNlLmlkKSB7XG4gICAgICAgIHJldHVybiB7IGVycm9yOiAnYXNzZXQtbWV0YSB0b29sOiByZWZlcmVuY2UuaWQgaXMgcmVxdWlyZWQgd2hlbiByZWZlcmVuY2UgaXMgcHJvdmlkZWQnIH07XG4gICAgfVxuICAgIGNvbnN0IHV1aWQgPSB0YXJnZXQucmVmZXJlbmNlPy5pZCA/PyB0YXJnZXQuYXNzZXRVdWlkO1xuICAgIGlmICghdXVpZCkge1xuICAgICAgICByZXR1cm4geyBlcnJvcjogJ2Fzc2V0LW1ldGEgdG9vbDogcHJvdmlkZSByZWZlcmVuY2U9e2lkLHR5cGV9IG9yIGFzc2V0VXVpZCcgfTtcbiAgICB9XG4gICAgaWYgKHRhcmdldC5yZWZlcmVuY2U/LmlkICYmIHRhcmdldC5hc3NldFV1aWQgJiYgdGFyZ2V0LnJlZmVyZW5jZS5pZCAhPT0gdGFyZ2V0LmFzc2V0VXVpZCkge1xuICAgICAgICByZXR1cm4geyBlcnJvcjogYGFzc2V0LW1ldGEgdG9vbDogcmVmZXJlbmNlLmlkICgke3RhcmdldC5yZWZlcmVuY2UuaWR9KSBjb25mbGljdHMgd2l0aCBhc3NldFV1aWQgKCR7dGFyZ2V0LmFzc2V0VXVpZH0pOyBwYXNzIG9ubHkgb25lYCB9O1xuICAgIH1cbiAgICB0cnkge1xuICAgICAgICBjb25zdCBpbmZvID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXQtaW5mbycsIHV1aWQpO1xuICAgICAgICBpZiAoIWluZm8pIHJldHVybiB7IGVycm9yOiBgQXNzZXQgbm90IGZvdW5kOiAke3V1aWR9YCB9O1xuICAgICAgICByZXR1cm4geyBhc3NldEluZm86IGluZm8gfTtcbiAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICByZXR1cm4geyBlcnJvcjogYHF1ZXJ5LWFzc2V0LWluZm8gZmFpbGVkIGZvciAke3V1aWR9OiAke2Vycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKX1gIH07XG4gICAgfVxufVxuXG5jb25zdCBhc3NldFRhcmdldFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgICByZWZlcmVuY2U6IGluc3RhbmNlUmVmZXJlbmNlU2NoZW1hLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0luc3RhbmNlUmVmZXJlbmNlIHtpZCx0eXBlfS4gUHJlZmVycmVkIGZvcm0uIHR5cGUgbWF5IGJlIFwiYXNzZXQ6Y2MuSW1hZ2VBc3NldFwiIGV0Yy4sIGRpYWdub3N0aWMgb25seS4nKSxcbiAgICBhc3NldFV1aWQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnQXNzZXQgVVVJRC4gVXNlZCB3aGVuIHJlZmVyZW5jZSBpcyBvbWl0dGVkLicpLFxufSk7XG5cbmV4cG9ydCBjbGFzcyBBc3NldE1ldGFUb29scyBpbXBsZW1lbnRzIFRvb2xFeGVjdXRvciB7XG4gICAgcHJpdmF0ZSByZWFkb25seSBleGVjOiBUb29sRXhlY3V0b3I7XG4gICAgcHJpdmF0ZSByZWFkb25seSBtYW5hZ2VyOiBBc3NldEludGVycHJldGVyTWFuYWdlcjtcblxuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICB0aGlzLm1hbmFnZXIgPSBidWlsZE1hbmFnZXIoKTtcbiAgICAgICAgdGhpcy5leGVjID0gZGVmaW5lVG9vbHNGcm9tRGVjb3JhdG9ycyh0aGlzKTtcbiAgICB9XG5cbiAgICBnZXRUb29scygpOiBUb29sRGVmaW5pdGlvbltdIHsgcmV0dXJuIHRoaXMuZXhlYy5nZXRUb29scygpOyB9XG4gICAgZXhlY3V0ZSh0b29sTmFtZTogc3RyaW5nLCBhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4geyByZXR1cm4gdGhpcy5leGVjLmV4ZWN1dGUodG9vbE5hbWUsIGFyZ3MpOyB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdsaXN0X2ludGVycHJldGVycycsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnTGlzdCB0aGUgYXNzZXQgaW1wb3J0ZXIgdHlwZXMgdGhpcyBzZXJ2ZXIgaGFzIHNwZWNpYWxpemVkIGludGVycHJldGVycyBmb3IuIFRoZSBcIipcIiBlbnRyeSBpcyB0aGUgcmVhZC1vbmx5IGZhbGxiYWNrIHVzZWQgZm9yIGFueSBpbXBvcnRlciBub3QgaW4gdGhlIGxpc3QuIFVzZSB0byBwbGFuIGFzc2V0TWV0YV9zZXRfcHJvcGVydGllcyBjYWxscyDigJQgd3JpdGVzIGFnYWluc3QgdGhlIGZhbGxiYWNrIGFsd2F5cyByZWplY3QuIE5vIHNpZGUgZWZmZWN0cy4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pLFxuICAgIH0pXG4gICAgYXN5bmMgbGlzdEludGVycHJldGVycygpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICBpbXBvcnRlclR5cGVzOiB0aGlzLm1hbmFnZXIubGlzdEltcG9ydGVyVHlwZXMoKSxcbiAgICAgICAgICAgICAgICBmYWxsYmFja0JlaGF2aW91cjogJ1Vua25vd25JbnRlcnByZXRlciByZWplY3RzIHdyaXRlczsgcmVhZHMgd29yayBhcyBiZXN0LWVmZm9ydCBtZXRhLnVzZXJEYXRhIGR1bXAuJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnZ2V0X3Byb3BlcnRpZXMnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1JlYWQgYW4gYXNzZXRcXCdzIG1ldGEgKyBzdWItbWV0YSB1c2VyRGF0YSB2aWEgaXRzIGltcG9ydGVyLXNwZWNpZmljIGludGVycHJldGVyLiBSZXR1cm5zIHtwcm9wZXJ0aWVzOiB7cGF0aDoge3R5cGUsIHZhbHVlLCB0b29sdGlwPywgZW51bUxpc3Q/fX0sIGFycmF5czoge3BhdGg6IHt0eXBlfX19LiBVc2UgQkVGT1JFIGFzc2V0TWV0YV9zZXRfcHJvcGVydGllcyBzbyBBSSBzZWVzIHRoZSByZWFsIHByb3BlcnR5IG5hbWVzICsgdHlwZXMgaW5zdGVhZCBvZiBndWVzc2luZy4gUGFpciBgaW5jbHVkZVRvb2x0aXBzOiB0cnVlYCB3aGVuIEFJIG5lZWRzIGNvbnRleHQgZm9yIHVuZmFtaWxpYXIgaW1wb3J0ZXJzLiBOb3RlOiB1c2VBZHZhbmNlZEluc3BlY3Rpb24gaXMgcmVzZXJ2ZWQg4oCUIGZ1bGwgbWF0ZXJpYWwgZWRpdGluZyBpcyBkZWZlcnJlZCB0byB2Mi41Kywgc28gdGhlIGZsYWcgaGFzIG5vIGVmZmVjdCBpbiB2Mi40LnguJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IGFzc2V0VGFyZ2V0U2NoZW1hLmV4dGVuZCh7XG4gICAgICAgICAgICBpbmNsdWRlVG9vbHRpcHM6IHouYm9vbGVhbigpLmRlZmF1bHQoZmFsc2UpLmRlc2NyaWJlKCdJbmNsdWRlIGkxOG4tcmVzb2x2ZWQgdG9vbHRpcCB0ZXh0IGZvciBlYWNoIHByb3BlcnR5LiBTbG93ZXI7IG9ubHkgcmVxdWVzdCB3aGVuIEFJIGlzIGV4cGxvcmluZyBhbiB1bmZhbWlsaWFyIGltcG9ydGVyLicpLFxuICAgICAgICAgICAgdXNlQWR2YW5jZWRJbnNwZWN0aW9uOiB6LmJvb2xlYW4oKS5kZWZhdWx0KGZhbHNlKS5kZXNjcmliZSgnUmVzZXJ2ZWQgZm9yIHYyLjUrLiBIYXMgbm8gZWZmZWN0IGluIHYyLjQueCBiZWNhdXNlIHRoZSBvbmx5IGNvbnN1bWVyIChNYXRlcmlhbEludGVycHJldGVyIGFkdmFuY2VkIGVkaXRpbmcpIGlzIGRlZmVycmVkIHVudGlsIHRoZSBzY2VuZS9hcHBseS1tYXRlcmlhbCArIFVVSUQtcHJlcHJvY2Vzc2luZyBsYXllciBpcyBwb3J0ZWQuIFBhc3MgZmFsc2UgdW50aWwgdjIuNSBsYW5kcy4nKSxcbiAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBnZXRQcm9wZXJ0aWVzKGFyZ3M6IEFzc2V0VGFyZ2V0ICYgeyBpbmNsdWRlVG9vbHRpcHM/OiBib29sZWFuOyB1c2VBZHZhbmNlZEluc3BlY3Rpb24/OiBib29sZWFuIH0pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCByZXNvbHZlZCA9IGF3YWl0IHJlc29sdmVBc3NldEluZm8oYXJncyk7XG4gICAgICAgIGlmICgnZXJyb3InIGluIHJlc29sdmVkKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHJlc29sdmVkLmVycm9yIH07XG4gICAgICAgIGNvbnN0IGRlc2NyaXB0aW9uID0gYXdhaXQgdGhpcy5tYW5hZ2VyLmdldEFzc2V0UHJvcGVydGllcyhcbiAgICAgICAgICAgIHJlc29sdmVkLmFzc2V0SW5mbyxcbiAgICAgICAgICAgIGFyZ3MuaW5jbHVkZVRvb2x0aXBzID8/IGZhbHNlLFxuICAgICAgICAgICAgYXJncy51c2VBZHZhbmNlZEluc3BlY3Rpb24gPz8gZmFsc2UsXG4gICAgICAgICk7XG4gICAgICAgIGlmIChkZXNjcmlwdGlvbi5lcnJvcikge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBkZXNjcmlwdGlvbi5lcnJvciwgZGF0YTogZGVzY3JpcHRpb24gfTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBkYXRhOiBkZXNjcmlwdGlvbiB9O1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ3NldF9wcm9wZXJ0aWVzJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdCYXRjaC13cml0ZSBhc3NldCBtZXRhIGZpZWxkcy4gRWFjaCBlbnRyeSBpcyB7cHJvcGVydHlQYXRoLCBwcm9wZXJ0eVR5cGUsIHByb3BlcnR5VmFsdWV9OyB0aGUgaW50ZXJwcmV0ZXIgdmFsaWRhdGVzIHRoZSBwYXRoIGFnYWluc3QgYW4gYWxsb3ctbGlzdCAodXNlckRhdGEuKiwgc3ViTWV0YXMuKiwgcGxhdGZvcm1TZXR0aW5ncy4qKSBhbmQgcmVqZWN0cyB1bmtub3duIHJvb3RzLCBwcm90b3R5cGUtcG9sbHV0aW9uIHNlZ21lbnRzIChfX3Byb3RvX18sIGNvbnN0cnVjdG9yLCBwcm90b3R5cGUpLCBhbmQgZW1wdHkgc2VnbWVudHMuIE9uIGNvbW1pdCB0aGUgaW50ZXJwcmV0ZXIgY2FsbHMgYXNzZXQtZGIgc2F2ZS1hc3NldC1tZXRhICsgcmVmcmVzaC1hc3NldCBzbyBjb2NvcyByZS1pbXBvcnRzIHdpdGggdGhlIG5ldyBzZXR0aW5ncy4gVXNlIGFmdGVyIGFzc2V0TWV0YV9nZXRfcHJvcGVydGllcyB0byBlbnN1cmUgcGF0aHMvdHlwZXMgYXJlIGNvcnJlY3QuIFJldHVybnMgcGVyLWVudHJ5IHN1Y2Nlc3MvZXJyb3Igc28gcGFydGlhbCBmYWlsdXJlcyBhcmUgdmlzaWJsZTsgZW50cmllcyB0aGF0IHN1Y2NlZWRlZCBvbiBkaXNrIGJ1dCBmYWlsZWQgcmUtaW1wb3J0IGNhcnJ5IGEgYHdhcm5pbmdgIGZpZWxkIGluc3RlYWQgb2YgYmVpbmcgZmxpcHBlZCB0byBmYWlsdXJlLicsXG4gICAgICAgIGlucHV0U2NoZW1hOiBhc3NldFRhcmdldFNjaGVtYS5leHRlbmQoe1xuICAgICAgICAgICAgcHJvcGVydGllczogei5hcnJheSh6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgcHJvcGVydHlQYXRoOiB6LnN0cmluZygpLmRlc2NyaWJlKCdEb3R0ZWQgbWV0YSBwYXRoLiBBbGxvd2VkIHJvb3RzOiB1c2VyRGF0YS4qLCBzdWJNZXRhcy4qLCBwbGF0Zm9ybVNldHRpbmdzLiouIEZvcmJpZGRlbiBzZWdtZW50cyBhbnl3aGVyZSBpbiB0aGUgcGF0aDogX19wcm90b19fLCBjb25zdHJ1Y3RvciwgcHJvdG90eXBlLicpLFxuICAgICAgICAgICAgICAgIHByb3BlcnR5VHlwZTogei5zdHJpbmcoKS5kZXNjcmliZSgnVHlwZSB0YWcgZm9yIHZhbHVlIGNvZXJjaW9uOiBCb29sZWFuIChhY2NlcHRzIHRydWUvZmFsc2UvMS8wIHN0cmluZ3MpLCBOdW1iZXIvRmxvYXQgKHJlamVjdHMgTmFOKSwgSW50ZWdlciAocmVqZWN0cyBOYU4pLCBTdHJpbmcsIEVudW0sIGNjLlZhbHVlVHlwZSwgY2MuT2JqZWN0LicpLFxuICAgICAgICAgICAgICAgIHByb3BlcnR5VmFsdWU6IHouYW55KCkuZGVzY3JpYmUoJ1JhdyB2YWx1ZTsgY29lcmNlZCBwZXIgcHJvcGVydHlUeXBlLicpLFxuICAgICAgICAgICAgfSkpLm1pbigxKS5tYXgoNTApLmRlc2NyaWJlKCdQcm9wZXJ0eSB3cml0ZXMuIENhcHBlZCBhdCA1MCBwZXIgY2FsbC4nKSxcbiAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBzZXRQcm9wZXJ0aWVzKGFyZ3M6IEFzc2V0VGFyZ2V0ICYgeyBwcm9wZXJ0aWVzOiBQcm9wZXJ0eVNldFNwZWNbXSB9KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgcmVzb2x2ZWQgPSBhd2FpdCByZXNvbHZlQXNzZXRJbmZvKGFyZ3MpO1xuICAgICAgICBpZiAoJ2Vycm9yJyBpbiByZXNvbHZlZCkgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiByZXNvbHZlZC5lcnJvciB9O1xuICAgICAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5tYW5hZ2VyLnNldEFzc2V0UHJvcGVydGllcyhyZXNvbHZlZC5hc3NldEluZm8sIGFyZ3MucHJvcGVydGllcyk7XG4gICAgICAgIGNvbnN0IGZhaWxlZCA9IHJlc3VsdHMuZmlsdGVyKHIgPT4gIXIuc3VjY2Vzcyk7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBzdWNjZXNzOiBmYWlsZWQubGVuZ3RoID09PSAwLFxuICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgIGFzc2V0VXVpZDogcmVzb2x2ZWQuYXNzZXRJbmZvLnV1aWQsXG4gICAgICAgICAgICAgICAgaW1wb3J0ZXI6IHJlc29sdmVkLmFzc2V0SW5mby5pbXBvcnRlcixcbiAgICAgICAgICAgICAgICB0b3RhbDogcmVzdWx0cy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgZmFpbGVkQ291bnQ6IGZhaWxlZC5sZW5ndGgsXG4gICAgICAgICAgICAgICAgcmVzdWx0cyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBtZXNzYWdlOiBmYWlsZWQubGVuZ3RoID09PSAwXG4gICAgICAgICAgICAgICAgPyBgV3JvdGUgJHtyZXN1bHRzLmxlbmd0aH0gYXNzZXQtbWV0YSBwcm9wZXJ0aWVzYFxuICAgICAgICAgICAgICAgIDogYCR7ZmFpbGVkLmxlbmd0aH0vJHtyZXN1bHRzLmxlbmd0aH0gYXNzZXQtbWV0YSB3cml0ZXMgZmFpbGVkYCxcbiAgICAgICAgfTtcbiAgICB9XG59XG4iXX0=