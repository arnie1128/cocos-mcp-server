"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssetMetaTools = void 0;
const response_1 = require("../lib/response");
const schema_1 = require("../lib/schema");
const decorators_1 = require("../lib/decorators");
const instance_reference_1 = require("../lib/instance-reference");
const uuid_compat_1 = require("../lib/uuid-compat");
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
        new specialized_1.AnimationClipInterpreter(),
        new specialized_1.AudioClipInterpreter(),
        new specialized_1.PrefabInterpreter(),
        new specialized_1.SceneInterpreter(),
        new specialized_1.LabelAtlasInterpreter(),
        new specialized_1.SpineInterpreter(),
        new specialized_1.JsonInterpreter(),
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
    const rawUuid = (_b = (_a = target.reference) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : target.assetUuid;
    if (!rawUuid) {
        return { error: 'asset-meta tool: provide reference={id,type} or assetUuid' };
    }
    if (((_c = target.reference) === null || _c === void 0 ? void 0 : _c.id) && target.assetUuid && target.reference.id !== target.assetUuid) {
        return { error: `asset-meta tool: reference.id (${target.reference.id}) conflicts with assetUuid (${target.assetUuid}); pass only one` };
    }
    // v2.6.0 T-V26-bundle: cocos sub-asset UUIDs use `<uuid>@<sub-key>`.
    // Some clients base64-encode `@`-containing strings to dodge wire
    // mangling — decode here so both forms reach query-asset-info as the
    // raw cocos format. Plain UUIDs pass through unchanged.
    const uuid = (0, uuid_compat_1.decodeUuid)(rawUuid);
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
        return (0, response_1.ok)({
            importerTypes: this.manager.listImporterTypes(),
            fallbackBehaviour: 'UnknownInterpreter rejects writes; reads work as best-effort meta.userData dump.',
        });
    }
    async getProperties(args) {
        var _a, _b;
        const resolved = await resolveAssetInfo(args);
        if ('error' in resolved)
            return (0, response_1.fail)(resolved.error);
        const description = await this.manager.getAssetProperties(resolved.assetInfo, (_a = args.includeTooltips) !== null && _a !== void 0 ? _a : false, (_b = args.useAdvancedInspection) !== null && _b !== void 0 ? _b : false);
        if (description.error) {
            return (0, response_1.fail)(description.error, description);
        }
        return (0, response_1.ok)(description);
    }
    async setProperties(args) {
        const resolved = await resolveAssetInfo(args);
        if ('error' in resolved)
            return (0, response_1.fail)(resolved.error);
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
        title: 'List asset interpreters',
        description: 'List the asset importer types this server has specialized interpreters for. The "*" entry is the read-only fallback used for any importer not in the list. Use to plan assetMeta_set_properties calls — writes against the fallback always reject. No side effects.',
        inputSchema: schema_1.z.object({}),
    })
], AssetMetaTools.prototype, "listInterpreters", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'get_properties',
        title: 'Read asset meta properties',
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
        title: 'Write asset meta properties',
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXNzZXQtbWV0YS10b29scy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NvdXJjZS90b29scy9hc3NldC1tZXRhLXRvb2xzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7OztBQUFBLDhDQUEyQztBQXdCM0MsMENBQWtDO0FBQ2xDLGtEQUF1RTtBQUN2RSxrRUFBdUY7QUFDdkYsb0RBQWdEO0FBQ2hELDJEQUF3RTtBQUN4RSxtRUFPMkM7QUFHM0MsU0FBUyxZQUFZO0lBQ2pCLE1BQU0sUUFBUSxHQUFHLElBQUksZ0NBQWtCLEVBQUUsQ0FBQztJQUMxQyxPQUFPLElBQUksaUNBQXVCLENBQzlCO1FBQ0ksSUFBSSw4QkFBZ0IsRUFBRTtRQUN0QixJQUFJLGdDQUFrQixFQUFFO1FBQ3hCLElBQUksb0NBQXNCLEVBQUU7UUFDNUIsSUFBSSw0QkFBYyxFQUFFO1FBQ3BCLElBQUksaUNBQW1CLEVBQUU7UUFDekIsSUFBSSwrQkFBaUIsRUFBRTtRQUN2QixJQUFJLGlDQUFtQixFQUFFO1FBQ3pCLElBQUksc0NBQXdCLEVBQUU7UUFDOUIsSUFBSSxrQ0FBb0IsRUFBRTtRQUMxQixJQUFJLCtCQUFpQixFQUFFO1FBQ3ZCLElBQUksOEJBQWdCLEVBQUU7UUFDdEIsSUFBSSxtQ0FBcUIsRUFBRTtRQUMzQixJQUFJLDhCQUFnQixFQUFFO1FBQ3RCLElBQUksNkJBQWUsRUFBRTtLQUN4QixFQUNELFFBQVEsQ0FDWCxDQUFDO0FBQ04sQ0FBQztBQU9ELEtBQUssVUFBVSxnQkFBZ0IsQ0FBQyxNQUFtQjs7SUFDL0MseUVBQXlFO0lBQ3pFLHdEQUF3RDtJQUN4RCxzREFBc0Q7SUFDdEQsaUVBQWlFO0lBQ2pFLGtEQUFrRDtJQUNsRCxJQUFJLE1BQU0sQ0FBQyxTQUFTLElBQUksQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLEVBQUUsRUFBRSxDQUFDO1FBQzNDLE9BQU8sRUFBRSxLQUFLLEVBQUUsc0VBQXNFLEVBQUUsQ0FBQztJQUM3RixDQUFDO0lBQ0QsTUFBTSxPQUFPLEdBQUcsTUFBQSxNQUFBLE1BQU0sQ0FBQyxTQUFTLDBDQUFFLEVBQUUsbUNBQUksTUFBTSxDQUFDLFNBQVMsQ0FBQztJQUN6RCxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDWCxPQUFPLEVBQUUsS0FBSyxFQUFFLDJEQUEyRCxFQUFFLENBQUM7SUFDbEYsQ0FBQztJQUNELElBQUksQ0FBQSxNQUFBLE1BQU0sQ0FBQyxTQUFTLDBDQUFFLEVBQUUsS0FBSSxNQUFNLENBQUMsU0FBUyxJQUFJLE1BQU0sQ0FBQyxTQUFTLENBQUMsRUFBRSxLQUFLLE1BQU0sQ0FBQyxTQUFTLEVBQUUsQ0FBQztRQUN2RixPQUFPLEVBQUUsS0FBSyxFQUFFLGtDQUFrQyxNQUFNLENBQUMsU0FBUyxDQUFDLEVBQUUsK0JBQStCLE1BQU0sQ0FBQyxTQUFTLGtCQUFrQixFQUFFLENBQUM7SUFDN0ksQ0FBQztJQUNELHFFQUFxRTtJQUNyRSxrRUFBa0U7SUFDbEUscUVBQXFFO0lBQ3JFLHdEQUF3RDtJQUN4RCxNQUFNLElBQUksR0FBRyxJQUFBLHdCQUFVLEVBQUMsT0FBTyxDQUFDLENBQUM7SUFDakMsSUFBSSxDQUFDO1FBQ0QsTUFBTSxJQUFJLEdBQUcsTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUUsa0JBQWtCLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDaEYsSUFBSSxDQUFDLElBQUk7WUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLG9CQUFvQixJQUFJLEVBQUUsRUFBRSxDQUFDO1FBQ3hELE9BQU8sRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLENBQUM7SUFDL0IsQ0FBQztJQUFDLE9BQU8sR0FBUSxFQUFFLENBQUM7UUFDaEIsT0FBTyxFQUFFLEtBQUssRUFBRSwrQkFBK0IsSUFBSSxLQUFLLE1BQUEsR0FBRyxhQUFILEdBQUcsdUJBQUgsR0FBRyxDQUFFLE9BQU8sbUNBQUksTUFBTSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEVBQUUsQ0FBQztJQUM1RixDQUFDO0FBQ0wsQ0FBQztBQUVELE1BQU0saUJBQWlCLEdBQUcsVUFBQyxDQUFDLE1BQU0sQ0FBQztJQUMvQixTQUFTLEVBQUUsNENBQXVCLENBQUMsUUFBUSxFQUFFLENBQUMsUUFBUSxDQUFDLHVHQUF1RyxDQUFDO0lBQy9KLFNBQVMsRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxFQUFFLENBQUMsUUFBUSxDQUFDLDZDQUE2QyxDQUFDO0NBQzNGLENBQUMsQ0FBQztBQUVILE1BQWEsY0FBYztJQUl2QjtRQUNJLElBQUksQ0FBQyxPQUFPLEdBQUcsWUFBWSxFQUFFLENBQUM7UUFDOUIsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFBLHNDQUF5QixFQUFDLElBQUksQ0FBQyxDQUFDO0lBQ2hELENBQUM7SUFFRCxRQUFRLEtBQXVCLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDN0QsT0FBTyxDQUFDLFFBQWdCLEVBQUUsSUFBUyxJQUEyQixPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFRbkcsQUFBTixLQUFLLENBQUMsZ0JBQWdCO1FBQ2xCLE9BQU8sSUFBQSxhQUFFLEVBQUM7WUFDRixhQUFhLEVBQUUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxpQkFBaUIsRUFBRTtZQUMvQyxpQkFBaUIsRUFBRSxrRkFBa0Y7U0FDeEcsQ0FBQyxDQUFDO0lBQ1gsQ0FBQztJQVdLLEFBQU4sS0FBSyxDQUFDLGFBQWEsQ0FBQyxJQUFrRjs7UUFDbEcsTUFBTSxRQUFRLEdBQUcsTUFBTSxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUM5QyxJQUFJLE9BQU8sSUFBSSxRQUFRO1lBQUUsT0FBTyxJQUFBLGVBQUksRUFBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDckQsTUFBTSxXQUFXLEdBQUcsTUFBTSxJQUFJLENBQUMsT0FBTyxDQUFDLGtCQUFrQixDQUNyRCxRQUFRLENBQUMsU0FBUyxFQUNsQixNQUFBLElBQUksQ0FBQyxlQUFlLG1DQUFJLEtBQUssRUFDN0IsTUFBQSxJQUFJLENBQUMscUJBQXFCLG1DQUFJLEtBQUssQ0FDdEMsQ0FBQztRQUNGLElBQUksV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ3BCLE9BQU8sSUFBQSxlQUFJLEVBQUMsV0FBVyxDQUFDLEtBQUssRUFBRSxXQUFXLENBQUMsQ0FBQztRQUNoRCxDQUFDO1FBQ0QsT0FBTyxJQUFBLGFBQUUsRUFBQyxXQUFXLENBQUMsQ0FBQztJQUMzQixDQUFDO0lBY0ssQUFBTixLQUFLLENBQUMsYUFBYSxDQUFDLElBQXFEO1FBQ3JFLE1BQU0sUUFBUSxHQUFHLE1BQU0sZ0JBQWdCLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDOUMsSUFBSSxPQUFPLElBQUksUUFBUTtZQUFFLE9BQU8sSUFBQSxlQUFJLEVBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3JELE1BQU0sT0FBTyxHQUFHLE1BQU0sSUFBSSxDQUFDLE9BQU8sQ0FBQyxrQkFBa0IsQ0FBQyxRQUFRLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUMzRixNQUFNLE1BQU0sR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDL0MsT0FBTztZQUNILE9BQU8sRUFBRSxNQUFNLENBQUMsTUFBTSxLQUFLLENBQUM7WUFDNUIsSUFBSSxFQUFFO2dCQUNGLFNBQVMsRUFBRSxRQUFRLENBQUMsU0FBUyxDQUFDLElBQUk7Z0JBQ2xDLFFBQVEsRUFBRSxRQUFRLENBQUMsU0FBUyxDQUFDLFFBQVE7Z0JBQ3JDLEtBQUssRUFBRSxPQUFPLENBQUMsTUFBTTtnQkFDckIsV0FBVyxFQUFFLE1BQU0sQ0FBQyxNQUFNO2dCQUMxQixPQUFPO2FBQ1Y7WUFDRCxPQUFPLEVBQUUsTUFBTSxDQUFDLE1BQU0sS0FBSyxDQUFDO2dCQUN4QixDQUFDLENBQUMsU0FBUyxPQUFPLENBQUMsTUFBTSx3QkFBd0I7Z0JBQ2pELENBQUMsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxNQUFNLElBQUksT0FBTyxDQUFDLE1BQU0sMkJBQTJCO1NBQ3RFLENBQUM7SUFDTixDQUFDO0NBQ0o7QUEvRUQsd0NBK0VDO0FBN0RTO0lBTkwsSUFBQSxvQkFBTyxFQUFDO1FBQ0wsSUFBSSxFQUFFLG1CQUFtQjtRQUN6QixLQUFLLEVBQUUseUJBQXlCO1FBQ2hDLFdBQVcsRUFBRSxxUUFBcVE7UUFDbFIsV0FBVyxFQUFFLFVBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO0tBQzVCLENBQUM7c0RBTUQ7QUFXSztJQVRMLElBQUEsb0JBQU8sRUFBQztRQUNMLElBQUksRUFBRSxnQkFBZ0I7UUFDdEIsS0FBSyxFQUFFLDRCQUE0QjtRQUNuQyxXQUFXLEVBQUUsd2RBQXdkO1FBQ3JlLFdBQVcsRUFBRSxpQkFBaUIsQ0FBQyxNQUFNLENBQUM7WUFDbEMsZUFBZSxFQUFFLFVBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUMsUUFBUSxDQUFDLHlIQUF5SCxDQUFDO1lBQy9LLHFCQUFxQixFQUFFLFVBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUMsUUFBUSxDQUFDLDROQUE0TixDQUFDO1NBQzNSLENBQUM7S0FDTCxDQUFDO21EQWFEO0FBY0s7SUFaTCxJQUFBLG9CQUFPLEVBQUM7UUFDTCxJQUFJLEVBQUUsZ0JBQWdCO1FBQ3RCLEtBQUssRUFBRSw2QkFBNkI7UUFDcEMsV0FBVyxFQUFFLDhwQkFBOHBCO1FBQzNxQixXQUFXLEVBQUUsaUJBQWlCLENBQUMsTUFBTSxDQUFDO1lBQ2xDLFVBQVUsRUFBRSxVQUFDLENBQUMsS0FBSyxDQUFDLFVBQUMsQ0FBQyxNQUFNLENBQUM7Z0JBQ3pCLFlBQVksRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLDBKQUEwSixDQUFDO2dCQUM3TCxZQUFZLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyxrS0FBa0ssQ0FBQztnQkFDck0sYUFBYSxFQUFFLFVBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxRQUFRLENBQUMsc0NBQXNDLENBQUM7YUFDMUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMseUNBQXlDLENBQUM7U0FDekUsQ0FBQztLQUNMLENBQUM7bURBbUJEIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgb2ssIGZhaWwgfSBmcm9tICcuLi9saWIvcmVzcG9uc2UnO1xuLyoqXG4gKiBhc3NldC1tZXRhLXRvb2xzIOKAlCB0aHJlZSBNQ1AgdG9vbHMgdGhhdCBleHBvc2UgdGhlIHYyLjQuM1xuICogYXNzZXQtaW50ZXJwcmV0ZXIgc3lzdGVtIHRvIEFJLiBSZWdpc3RlcmVkIHVuZGVyIHRoZSBgYXNzZXRNZXRhYFxuICogY2F0ZWdvcnkgc28gdGhlIHB1YmxpYyBNQ1AgbmFtZXMgYXJlOlxuICpcbiAqICAgYXNzZXRNZXRhX2dldF9wcm9wZXJ0aWVzICAgICAg4oCUIHJlYWQgbWV0YSArIHN1Yi1tZXRhIHVzZXJEYXRhIHBlclxuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGltcG9ydGVyLXNwZWNpZmljIGxheW91dFxuICogICBhc3NldE1ldGFfc2V0X3Byb3BlcnRpZXMgICAgICDigJQgYmF0Y2gtd3JpdGUgbWV0YSBmaWVsZHMgd2l0aCBwYXRoXG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsaWRhdGlvbjsgc2F2ZXMgKyByZWZyZXNoLWFzc2V0XG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgb24gY29tbWl0IHNvIGNvY29zIHJlLWltcG9ydHNcbiAqICAgYXNzZXRNZXRhX2xpc3RfaW50ZXJwcmV0ZXJzICAg4oCUIHdoYXQgaW1wb3J0ZXIgdHlwZXMgd2UgcmVjb2duaXNlXG4gKlxuICogQWxsIHRocmVlIGFjY2VwdCBJbnN0YW5jZVJlZmVyZW5jZSBmb3IgdGhlIGFzc2V0IHRhcmdldCAocHJlZmVycmVkXG4gKiB2Mi40LjAgZm9ybTogYHtpZDogYXNzZXRVdWlkLCB0eXBlOiAnYXNzZXQ6Y2MuSW1hZ2VBc3NldCd9YCkuIEZvclxuICogYmFja3dhcmQgY29tcGF0aWJpbGl0eSB0aGV5IGFsc28gYWNjZXB0IGEgYmFyZSBgYXNzZXRVdWlkYCBzdHJpbmcuXG4gKlxuICogRGVtb25zdHJhdGVzIHRoZSB2Mi40LjAgc3RlcC01IEBtY3BUb29sIGRlY29yYXRvciArIHN0ZXAtNFxuICogSW5zdGFuY2VSZWZlcmVuY2Ugc2hhcGUuXG4gKlxuICogUmVmZXJlbmNlOiBkb2NzL3Jlc2VhcmNoL3JlcG9zL1JvbWFSb2dvdi1jb2Nvcy1tY3AubWQuXG4gKi9cblxuaW1wb3J0IHsgVG9vbERlZmluaXRpb24sIFRvb2xSZXNwb25zZSwgVG9vbEV4ZWN1dG9yIH0gZnJvbSAnLi4vdHlwZXMnO1xuaW1wb3J0IHsgeiB9IGZyb20gJy4uL2xpYi9zY2hlbWEnO1xuaW1wb3J0IHsgbWNwVG9vbCwgZGVmaW5lVG9vbHNGcm9tRGVjb3JhdG9ycyB9IGZyb20gJy4uL2xpYi9kZWNvcmF0b3JzJztcbmltcG9ydCB7IGluc3RhbmNlUmVmZXJlbmNlU2NoZW1hLCBJbnN0YW5jZVJlZmVyZW5jZSB9IGZyb20gJy4uL2xpYi9pbnN0YW5jZS1yZWZlcmVuY2UnO1xuaW1wb3J0IHsgZGVjb2RlVXVpZCB9IGZyb20gJy4uL2xpYi91dWlkLWNvbXBhdCc7XG5pbXBvcnQgeyBBc3NldEludGVycHJldGVyTWFuYWdlciB9IGZyb20gJy4uL2Fzc2V0LWludGVycHJldGVycy9tYW5hZ2VyJztcbmltcG9ydCB7XG4gICAgSW1hZ2VJbnRlcnByZXRlciwgVGV4dHVyZUludGVycHJldGVyLCBTcHJpdGVGcmFtZUludGVycHJldGVyLFxuICAgIEZieEludGVycHJldGVyLCBNYXRlcmlhbEludGVycHJldGVyLCBFZmZlY3RJbnRlcnByZXRlcixcbiAgICBQYXJ0aWNsZUludGVycHJldGVyLCBVbmtub3duSW50ZXJwcmV0ZXIsXG4gICAgQW5pbWF0aW9uQ2xpcEludGVycHJldGVyLCBBdWRpb0NsaXBJbnRlcnByZXRlciwgUHJlZmFiSW50ZXJwcmV0ZXIsXG4gICAgU2NlbmVJbnRlcnByZXRlciwgTGFiZWxBdGxhc0ludGVycHJldGVyLCBTcGluZUludGVycHJldGVyLFxuICAgIEpzb25JbnRlcnByZXRlclxufSBmcm9tICcuLi9hc3NldC1pbnRlcnByZXRlcnMvc3BlY2lhbGl6ZWQnO1xuaW1wb3J0IHsgUHJvcGVydHlTZXRTcGVjIH0gZnJvbSAnLi4vYXNzZXQtaW50ZXJwcmV0ZXJzL2ludGVyZmFjZSc7XG5cbmZ1bmN0aW9uIGJ1aWxkTWFuYWdlcigpOiBBc3NldEludGVycHJldGVyTWFuYWdlciB7XG4gICAgY29uc3QgZmFsbGJhY2sgPSBuZXcgVW5rbm93bkludGVycHJldGVyKCk7XG4gICAgcmV0dXJuIG5ldyBBc3NldEludGVycHJldGVyTWFuYWdlcihcbiAgICAgICAgW1xuICAgICAgICAgICAgbmV3IEltYWdlSW50ZXJwcmV0ZXIoKSxcbiAgICAgICAgICAgIG5ldyBUZXh0dXJlSW50ZXJwcmV0ZXIoKSxcbiAgICAgICAgICAgIG5ldyBTcHJpdGVGcmFtZUludGVycHJldGVyKCksXG4gICAgICAgICAgICBuZXcgRmJ4SW50ZXJwcmV0ZXIoKSxcbiAgICAgICAgICAgIG5ldyBNYXRlcmlhbEludGVycHJldGVyKCksXG4gICAgICAgICAgICBuZXcgRWZmZWN0SW50ZXJwcmV0ZXIoKSxcbiAgICAgICAgICAgIG5ldyBQYXJ0aWNsZUludGVycHJldGVyKCksXG4gICAgICAgICAgICBuZXcgQW5pbWF0aW9uQ2xpcEludGVycHJldGVyKCksXG4gICAgICAgICAgICBuZXcgQXVkaW9DbGlwSW50ZXJwcmV0ZXIoKSxcbiAgICAgICAgICAgIG5ldyBQcmVmYWJJbnRlcnByZXRlcigpLFxuICAgICAgICAgICAgbmV3IFNjZW5lSW50ZXJwcmV0ZXIoKSxcbiAgICAgICAgICAgIG5ldyBMYWJlbEF0bGFzSW50ZXJwcmV0ZXIoKSxcbiAgICAgICAgICAgIG5ldyBTcGluZUludGVycHJldGVyKCksXG4gICAgICAgICAgICBuZXcgSnNvbkludGVycHJldGVyKCksXG4gICAgICAgIF0sXG4gICAgICAgIGZhbGxiYWNrLFxuICAgICk7XG59XG5cbmludGVyZmFjZSBBc3NldFRhcmdldCB7XG4gICAgcmVmZXJlbmNlPzogSW5zdGFuY2VSZWZlcmVuY2U7XG4gICAgYXNzZXRVdWlkPzogc3RyaW5nO1xufVxuXG5hc3luYyBmdW5jdGlvbiByZXNvbHZlQXNzZXRJbmZvKHRhcmdldDogQXNzZXRUYXJnZXQpOiBQcm9taXNlPHsgYXNzZXRJbmZvOiBhbnkgfSB8IHsgZXJyb3I6IHN0cmluZyB9PiB7XG4gICAgLy8gdjIuNC40IHJldmlldyBmaXggKGdlbWluaSArIGNsYXVkZSk6IHN5bW1ldHJpYyB3aXRoIHJlc29sdmVSZWZlcmVuY2Unc1xuICAgIC8vIG1hbGZvcm1lZC1yZWZlcmVuY2UgZGV0ZWN0aW9uICh2Mi40LjEgLyB2Mi40LjIgZml4IGF0XG4gICAgLy8gc291cmNlL2xpYi9pbnN0YW5jZS1yZWZlcmVuY2UudHMpLiBBIGNhbGxlciBwYXNzaW5nXG4gICAgLy8gYHJlZmVyZW5jZToge31gIChubyBpZCkgcGx1cyBhIHZhbGlkIGFzc2V0VXVpZCB3b3VsZCBvdGhlcndpc2VcbiAgICAvLyBzaWxlbnRseSBmYWxsIGJhY2sgdG8gYXNzZXRVdWlkIOKAlCBtYXNrcyBpbnRlbnQuXG4gICAgaWYgKHRhcmdldC5yZWZlcmVuY2UgJiYgIXRhcmdldC5yZWZlcmVuY2UuaWQpIHtcbiAgICAgICAgcmV0dXJuIHsgZXJyb3I6ICdhc3NldC1tZXRhIHRvb2w6IHJlZmVyZW5jZS5pZCBpcyByZXF1aXJlZCB3aGVuIHJlZmVyZW5jZSBpcyBwcm92aWRlZCcgfTtcbiAgICB9XG4gICAgY29uc3QgcmF3VXVpZCA9IHRhcmdldC5yZWZlcmVuY2U/LmlkID8/IHRhcmdldC5hc3NldFV1aWQ7XG4gICAgaWYgKCFyYXdVdWlkKSB7XG4gICAgICAgIHJldHVybiB7IGVycm9yOiAnYXNzZXQtbWV0YSB0b29sOiBwcm92aWRlIHJlZmVyZW5jZT17aWQsdHlwZX0gb3IgYXNzZXRVdWlkJyB9O1xuICAgIH1cbiAgICBpZiAodGFyZ2V0LnJlZmVyZW5jZT8uaWQgJiYgdGFyZ2V0LmFzc2V0VXVpZCAmJiB0YXJnZXQucmVmZXJlbmNlLmlkICE9PSB0YXJnZXQuYXNzZXRVdWlkKSB7XG4gICAgICAgIHJldHVybiB7IGVycm9yOiBgYXNzZXQtbWV0YSB0b29sOiByZWZlcmVuY2UuaWQgKCR7dGFyZ2V0LnJlZmVyZW5jZS5pZH0pIGNvbmZsaWN0cyB3aXRoIGFzc2V0VXVpZCAoJHt0YXJnZXQuYXNzZXRVdWlkfSk7IHBhc3Mgb25seSBvbmVgIH07XG4gICAgfVxuICAgIC8vIHYyLjYuMCBULVYyNi1idW5kbGU6IGNvY29zIHN1Yi1hc3NldCBVVUlEcyB1c2UgYDx1dWlkPkA8c3ViLWtleT5gLlxuICAgIC8vIFNvbWUgY2xpZW50cyBiYXNlNjQtZW5jb2RlIGBAYC1jb250YWluaW5nIHN0cmluZ3MgdG8gZG9kZ2Ugd2lyZVxuICAgIC8vIG1hbmdsaW5nIOKAlCBkZWNvZGUgaGVyZSBzbyBib3RoIGZvcm1zIHJlYWNoIHF1ZXJ5LWFzc2V0LWluZm8gYXMgdGhlXG4gICAgLy8gcmF3IGNvY29zIGZvcm1hdC4gUGxhaW4gVVVJRHMgcGFzcyB0aHJvdWdoIHVuY2hhbmdlZC5cbiAgICBjb25zdCB1dWlkID0gZGVjb2RlVXVpZChyYXdVdWlkKTtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCBpbmZvID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXQtaW5mbycsIHV1aWQpO1xuICAgICAgICBpZiAoIWluZm8pIHJldHVybiB7IGVycm9yOiBgQXNzZXQgbm90IGZvdW5kOiAke3V1aWR9YCB9O1xuICAgICAgICByZXR1cm4geyBhc3NldEluZm86IGluZm8gfTtcbiAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICByZXR1cm4geyBlcnJvcjogYHF1ZXJ5LWFzc2V0LWluZm8gZmFpbGVkIGZvciAke3V1aWR9OiAke2Vycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKX1gIH07XG4gICAgfVxufVxuXG5jb25zdCBhc3NldFRhcmdldFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgICByZWZlcmVuY2U6IGluc3RhbmNlUmVmZXJlbmNlU2NoZW1hLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0luc3RhbmNlUmVmZXJlbmNlIHtpZCx0eXBlfS4gUHJlZmVycmVkIGZvcm0uIHR5cGUgbWF5IGJlIFwiYXNzZXQ6Y2MuSW1hZ2VBc3NldFwiIGV0Yy4sIGRpYWdub3N0aWMgb25seS4nKSxcbiAgICBhc3NldFV1aWQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnQXNzZXQgVVVJRC4gVXNlZCB3aGVuIHJlZmVyZW5jZSBpcyBvbWl0dGVkLicpLFxufSk7XG5cbmV4cG9ydCBjbGFzcyBBc3NldE1ldGFUb29scyBpbXBsZW1lbnRzIFRvb2xFeGVjdXRvciB7XG4gICAgcHJpdmF0ZSByZWFkb25seSBleGVjOiBUb29sRXhlY3V0b3I7XG4gICAgcHJpdmF0ZSByZWFkb25seSBtYW5hZ2VyOiBBc3NldEludGVycHJldGVyTWFuYWdlcjtcblxuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICB0aGlzLm1hbmFnZXIgPSBidWlsZE1hbmFnZXIoKTtcbiAgICAgICAgdGhpcy5leGVjID0gZGVmaW5lVG9vbHNGcm9tRGVjb3JhdG9ycyh0aGlzKTtcbiAgICB9XG5cbiAgICBnZXRUb29scygpOiBUb29sRGVmaW5pdGlvbltdIHsgcmV0dXJuIHRoaXMuZXhlYy5nZXRUb29scygpOyB9XG4gICAgZXhlY3V0ZSh0b29sTmFtZTogc3RyaW5nLCBhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4geyByZXR1cm4gdGhpcy5leGVjLmV4ZWN1dGUodG9vbE5hbWUsIGFyZ3MpOyB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdsaXN0X2ludGVycHJldGVycycsXG4gICAgICAgIHRpdGxlOiAnTGlzdCBhc3NldCBpbnRlcnByZXRlcnMnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ0xpc3QgdGhlIGFzc2V0IGltcG9ydGVyIHR5cGVzIHRoaXMgc2VydmVyIGhhcyBzcGVjaWFsaXplZCBpbnRlcnByZXRlcnMgZm9yLiBUaGUgXCIqXCIgZW50cnkgaXMgdGhlIHJlYWQtb25seSBmYWxsYmFjayB1c2VkIGZvciBhbnkgaW1wb3J0ZXIgbm90IGluIHRoZSBsaXN0LiBVc2UgdG8gcGxhbiBhc3NldE1ldGFfc2V0X3Byb3BlcnRpZXMgY2FsbHMg4oCUIHdyaXRlcyBhZ2FpbnN0IHRoZSBmYWxsYmFjayBhbHdheXMgcmVqZWN0LiBObyBzaWRlIGVmZmVjdHMuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSxcbiAgICB9KVxuICAgIGFzeW5jIGxpc3RJbnRlcnByZXRlcnMoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG9rKHtcbiAgICAgICAgICAgICAgICBpbXBvcnRlclR5cGVzOiB0aGlzLm1hbmFnZXIubGlzdEltcG9ydGVyVHlwZXMoKSxcbiAgICAgICAgICAgICAgICBmYWxsYmFja0JlaGF2aW91cjogJ1Vua25vd25JbnRlcnByZXRlciByZWplY3RzIHdyaXRlczsgcmVhZHMgd29yayBhcyBiZXN0LWVmZm9ydCBtZXRhLnVzZXJEYXRhIGR1bXAuJyxcbiAgICAgICAgICAgIH0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ2dldF9wcm9wZXJ0aWVzJyxcbiAgICAgICAgdGl0bGU6ICdSZWFkIGFzc2V0IG1ldGEgcHJvcGVydGllcycsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnUmVhZCBhbiBhc3NldFxcJ3MgbWV0YSArIHN1Yi1tZXRhIHVzZXJEYXRhIHZpYSBpdHMgaW1wb3J0ZXItc3BlY2lmaWMgaW50ZXJwcmV0ZXIuIFJldHVybnMge3Byb3BlcnRpZXM6IHtwYXRoOiB7dHlwZSwgdmFsdWUsIHRvb2x0aXA/LCBlbnVtTGlzdD99fSwgYXJyYXlzOiB7cGF0aDoge3R5cGV9fX0uIFVzZSBCRUZPUkUgYXNzZXRNZXRhX3NldF9wcm9wZXJ0aWVzIHNvIEFJIHNlZXMgdGhlIHJlYWwgcHJvcGVydHkgbmFtZXMgKyB0eXBlcyBpbnN0ZWFkIG9mIGd1ZXNzaW5nLiBQYWlyIGBpbmNsdWRlVG9vbHRpcHM6IHRydWVgIHdoZW4gQUkgbmVlZHMgY29udGV4dCBmb3IgdW5mYW1pbGlhciBpbXBvcnRlcnMuIE5vdGU6IHVzZUFkdmFuY2VkSW5zcGVjdGlvbiBpcyByZXNlcnZlZCDigJQgZnVsbCBtYXRlcmlhbCBlZGl0aW5nIGlzIGRlZmVycmVkIHRvIHYyLjUrLCBzbyB0aGUgZmxhZyBoYXMgbm8gZWZmZWN0IGluIHYyLjQueC4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogYXNzZXRUYXJnZXRTY2hlbWEuZXh0ZW5kKHtcbiAgICAgICAgICAgIGluY2x1ZGVUb29sdGlwczogei5ib29sZWFuKCkuZGVmYXVsdChmYWxzZSkuZGVzY3JpYmUoJ0luY2x1ZGUgaTE4bi1yZXNvbHZlZCB0b29sdGlwIHRleHQgZm9yIGVhY2ggcHJvcGVydHkuIFNsb3dlcjsgb25seSByZXF1ZXN0IHdoZW4gQUkgaXMgZXhwbG9yaW5nIGFuIHVuZmFtaWxpYXIgaW1wb3J0ZXIuJyksXG4gICAgICAgICAgICB1c2VBZHZhbmNlZEluc3BlY3Rpb246IHouYm9vbGVhbigpLmRlZmF1bHQoZmFsc2UpLmRlc2NyaWJlKCdSZXNlcnZlZCBmb3IgdjIuNSsuIEhhcyBubyBlZmZlY3QgaW4gdjIuNC54IGJlY2F1c2UgdGhlIG9ubHkgY29uc3VtZXIgKE1hdGVyaWFsSW50ZXJwcmV0ZXIgYWR2YW5jZWQgZWRpdGluZykgaXMgZGVmZXJyZWQgdW50aWwgdGhlIHNjZW5lL2FwcGx5LW1hdGVyaWFsICsgVVVJRC1wcmVwcm9jZXNzaW5nIGxheWVyIGlzIHBvcnRlZC4gUGFzcyBmYWxzZSB1bnRpbCB2Mi41IGxhbmRzLicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIGdldFByb3BlcnRpZXMoYXJnczogQXNzZXRUYXJnZXQgJiB7IGluY2x1ZGVUb29sdGlwcz86IGJvb2xlYW47IHVzZUFkdmFuY2VkSW5zcGVjdGlvbj86IGJvb2xlYW4gfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHJlc29sdmVkID0gYXdhaXQgcmVzb2x2ZUFzc2V0SW5mbyhhcmdzKTtcbiAgICAgICAgaWYgKCdlcnJvcicgaW4gcmVzb2x2ZWQpIHJldHVybiBmYWlsKHJlc29sdmVkLmVycm9yKTtcbiAgICAgICAgY29uc3QgZGVzY3JpcHRpb24gPSBhd2FpdCB0aGlzLm1hbmFnZXIuZ2V0QXNzZXRQcm9wZXJ0aWVzKFxuICAgICAgICAgICAgcmVzb2x2ZWQuYXNzZXRJbmZvLFxuICAgICAgICAgICAgYXJncy5pbmNsdWRlVG9vbHRpcHMgPz8gZmFsc2UsXG4gICAgICAgICAgICBhcmdzLnVzZUFkdmFuY2VkSW5zcGVjdGlvbiA/PyBmYWxzZSxcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKGRlc2NyaXB0aW9uLmVycm9yKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChkZXNjcmlwdGlvbi5lcnJvciwgZGVzY3JpcHRpb24pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBvayhkZXNjcmlwdGlvbik7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnc2V0X3Byb3BlcnRpZXMnLFxuICAgICAgICB0aXRsZTogJ1dyaXRlIGFzc2V0IG1ldGEgcHJvcGVydGllcycsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnQmF0Y2gtd3JpdGUgYXNzZXQgbWV0YSBmaWVsZHMuIEVhY2ggZW50cnkgaXMge3Byb3BlcnR5UGF0aCwgcHJvcGVydHlUeXBlLCBwcm9wZXJ0eVZhbHVlfTsgdGhlIGludGVycHJldGVyIHZhbGlkYXRlcyB0aGUgcGF0aCBhZ2FpbnN0IGFuIGFsbG93LWxpc3QgKHVzZXJEYXRhLiosIHN1Yk1ldGFzLiosIHBsYXRmb3JtU2V0dGluZ3MuKikgYW5kIHJlamVjdHMgdW5rbm93biByb290cywgcHJvdG90eXBlLXBvbGx1dGlvbiBzZWdtZW50cyAoX19wcm90b19fLCBjb25zdHJ1Y3RvciwgcHJvdG90eXBlKSwgYW5kIGVtcHR5IHNlZ21lbnRzLiBPbiBjb21taXQgdGhlIGludGVycHJldGVyIGNhbGxzIGFzc2V0LWRiIHNhdmUtYXNzZXQtbWV0YSArIHJlZnJlc2gtYXNzZXQgc28gY29jb3MgcmUtaW1wb3J0cyB3aXRoIHRoZSBuZXcgc2V0dGluZ3MuIFVzZSBhZnRlciBhc3NldE1ldGFfZ2V0X3Byb3BlcnRpZXMgdG8gZW5zdXJlIHBhdGhzL3R5cGVzIGFyZSBjb3JyZWN0LiBSZXR1cm5zIHBlci1lbnRyeSBzdWNjZXNzL2Vycm9yIHNvIHBhcnRpYWwgZmFpbHVyZXMgYXJlIHZpc2libGU7IGVudHJpZXMgdGhhdCBzdWNjZWVkZWQgb24gZGlzayBidXQgZmFpbGVkIHJlLWltcG9ydCBjYXJyeSBhIGB3YXJuaW5nYCBmaWVsZCBpbnN0ZWFkIG9mIGJlaW5nIGZsaXBwZWQgdG8gZmFpbHVyZS4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogYXNzZXRUYXJnZXRTY2hlbWEuZXh0ZW5kKHtcbiAgICAgICAgICAgIHByb3BlcnRpZXM6IHouYXJyYXkoei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgIHByb3BlcnR5UGF0aDogei5zdHJpbmcoKS5kZXNjcmliZSgnRG90dGVkIG1ldGEgcGF0aC4gQWxsb3dlZCByb290czogdXNlckRhdGEuKiwgc3ViTWV0YXMuKiwgcGxhdGZvcm1TZXR0aW5ncy4qLiBGb3JiaWRkZW4gc2VnbWVudHMgYW55d2hlcmUgaW4gdGhlIHBhdGg6IF9fcHJvdG9fXywgY29uc3RydWN0b3IsIHByb3RvdHlwZS4nKSxcbiAgICAgICAgICAgICAgICBwcm9wZXJ0eVR5cGU6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1R5cGUgdGFnIGZvciB2YWx1ZSBjb2VyY2lvbjogQm9vbGVhbiAoYWNjZXB0cyB0cnVlL2ZhbHNlLzEvMCBzdHJpbmdzKSwgTnVtYmVyL0Zsb2F0IChyZWplY3RzIE5hTiksIEludGVnZXIgKHJlamVjdHMgTmFOKSwgU3RyaW5nLCBFbnVtLCBjYy5WYWx1ZVR5cGUsIGNjLk9iamVjdC4nKSxcbiAgICAgICAgICAgICAgICBwcm9wZXJ0eVZhbHVlOiB6LmFueSgpLmRlc2NyaWJlKCdSYXcgdmFsdWU7IGNvZXJjZWQgcGVyIHByb3BlcnR5VHlwZS4nKSxcbiAgICAgICAgICAgIH0pKS5taW4oMSkubWF4KDUwKS5kZXNjcmliZSgnUHJvcGVydHkgd3JpdGVzLiBDYXBwZWQgYXQgNTAgcGVyIGNhbGwuJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgc2V0UHJvcGVydGllcyhhcmdzOiBBc3NldFRhcmdldCAmIHsgcHJvcGVydGllczogUHJvcGVydHlTZXRTcGVjW10gfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHJlc29sdmVkID0gYXdhaXQgcmVzb2x2ZUFzc2V0SW5mbyhhcmdzKTtcbiAgICAgICAgaWYgKCdlcnJvcicgaW4gcmVzb2x2ZWQpIHJldHVybiBmYWlsKHJlc29sdmVkLmVycm9yKTtcbiAgICAgICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMubWFuYWdlci5zZXRBc3NldFByb3BlcnRpZXMocmVzb2x2ZWQuYXNzZXRJbmZvLCBhcmdzLnByb3BlcnRpZXMpO1xuICAgICAgICBjb25zdCBmYWlsZWQgPSByZXN1bHRzLmZpbHRlcihyID0+ICFyLnN1Y2Nlc3MpO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgc3VjY2VzczogZmFpbGVkLmxlbmd0aCA9PT0gMCxcbiAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICBhc3NldFV1aWQ6IHJlc29sdmVkLmFzc2V0SW5mby51dWlkLFxuICAgICAgICAgICAgICAgIGltcG9ydGVyOiByZXNvbHZlZC5hc3NldEluZm8uaW1wb3J0ZXIsXG4gICAgICAgICAgICAgICAgdG90YWw6IHJlc3VsdHMubGVuZ3RoLFxuICAgICAgICAgICAgICAgIGZhaWxlZENvdW50OiBmYWlsZWQubGVuZ3RoLFxuICAgICAgICAgICAgICAgIHJlc3VsdHMsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgbWVzc2FnZTogZmFpbGVkLmxlbmd0aCA9PT0gMFxuICAgICAgICAgICAgICAgID8gYFdyb3RlICR7cmVzdWx0cy5sZW5ndGh9IGFzc2V0LW1ldGEgcHJvcGVydGllc2BcbiAgICAgICAgICAgICAgICA6IGAke2ZhaWxlZC5sZW5ndGh9LyR7cmVzdWx0cy5sZW5ndGh9IGFzc2V0LW1ldGEgd3JpdGVzIGZhaWxlZGAsXG4gICAgICAgIH07XG4gICAgfVxufVxuIl19