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
        new specialized_1.TiledMapInterpreter(),
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
        description: '[specialist] List the asset importer types this server has specialized interpreters for. The "*" entry is the read-only fallback used for any importer not in the list. Use to plan assetMeta_set_properties calls — writes against the fallback always reject. No side effects.',
        inputSchema: schema_1.z.object({}),
    })
], AssetMetaTools.prototype, "listInterpreters", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'get_properties',
        title: 'Read asset meta properties',
        description: '[specialist] Read an asset\'s meta + sub-meta userData via its importer-specific interpreter. Returns {properties: {path: {type, value, tooltip?, enumList?}}, arrays: {path: {type}}}. Use BEFORE assetMeta_set_properties so AI sees the real property names + types instead of guessing. Pair `includeTooltips: true` when AI needs context for unfamiliar importers. Note: useAdvancedInspection is reserved — full material editing is deferred to v2.5+, so the flag has no effect in v2.4.x.',
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
        description: '[specialist] Batch-write asset meta fields. Each entry is {propertyPath, propertyType, propertyValue}; the interpreter validates the path against an allow-list (userData.*, subMetas.*, platformSettings.*) and rejects unknown roots, prototype-pollution segments (__proto__, constructor, prototype), and empty segments. On commit the interpreter calls asset-db save-asset-meta + refresh-asset so cocos re-imports with the new settings. Use after assetMeta_get_properties to ensure paths/types are correct. Returns per-entry success/error so partial failures are visible; entries that succeeded on disk but failed re-import carry a `warning` field instead of being flipped to failure.',
        inputSchema: assetTargetSchema.extend({
            properties: schema_1.z.array(schema_1.z.object({
                propertyPath: schema_1.z.string().describe('Dotted meta path. Allowed roots: userData.*, subMetas.*, platformSettings.*. Forbidden segments anywhere in the path: __proto__, constructor, prototype.'),
                propertyType: schema_1.z.string().describe('Type tag for value coercion: Boolean (accepts true/false/1/0 strings), Number/Float (rejects NaN), Integer (rejects NaN), String, Enum, cc.ValueType, cc.Object.'),
                propertyValue: schema_1.z.any().describe('Raw value; coerced per propertyType.'),
            })).min(1).max(50).describe('Property writes. Capped at 50 per call.'),
        }),
    })
], AssetMetaTools.prototype, "setProperties", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXNzZXQtbWV0YS10b29scy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NvdXJjZS90b29scy9hc3NldC1tZXRhLXRvb2xzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7OztBQUFBLDhDQUEyQztBQXdCM0MsMENBQWtDO0FBQ2xDLGtEQUF1RTtBQUN2RSxrRUFBdUY7QUFDdkYsb0RBQWdEO0FBQ2hELDJEQUF3RTtBQUN4RSxtRUFPMkM7QUFHM0MsU0FBUyxZQUFZO0lBQ2pCLE1BQU0sUUFBUSxHQUFHLElBQUksZ0NBQWtCLEVBQUUsQ0FBQztJQUMxQyxPQUFPLElBQUksaUNBQXVCLENBQzlCO1FBQ0ksSUFBSSw4QkFBZ0IsRUFBRTtRQUN0QixJQUFJLGdDQUFrQixFQUFFO1FBQ3hCLElBQUksb0NBQXNCLEVBQUU7UUFDNUIsSUFBSSw0QkFBYyxFQUFFO1FBQ3BCLElBQUksaUNBQW1CLEVBQUU7UUFDekIsSUFBSSwrQkFBaUIsRUFBRTtRQUN2QixJQUFJLGlDQUFtQixFQUFFO1FBQ3pCLElBQUksc0NBQXdCLEVBQUU7UUFDOUIsSUFBSSxrQ0FBb0IsRUFBRTtRQUMxQixJQUFJLCtCQUFpQixFQUFFO1FBQ3ZCLElBQUksOEJBQWdCLEVBQUU7UUFDdEIsSUFBSSxtQ0FBcUIsRUFBRTtRQUMzQixJQUFJLDhCQUFnQixFQUFFO1FBQ3RCLElBQUksNkJBQWUsRUFBRTtRQUNyQixJQUFJLGlDQUFtQixFQUFFO0tBQzVCLEVBQ0QsUUFBUSxDQUNYLENBQUM7QUFDTixDQUFDO0FBT0QsS0FBSyxVQUFVLGdCQUFnQixDQUFDLE1BQW1COztJQUMvQyx5RUFBeUU7SUFDekUsd0RBQXdEO0lBQ3hELHNEQUFzRDtJQUN0RCxpRUFBaUU7SUFDakUsa0RBQWtEO0lBQ2xELElBQUksTUFBTSxDQUFDLFNBQVMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsRUFBRSxFQUFFLENBQUM7UUFDM0MsT0FBTyxFQUFFLEtBQUssRUFBRSxzRUFB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Z0JBQzdMLFlBQVksRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLGtLQUFrSyxDQUFDO2dCQUNyTSxhQUFhLEVBQUUsVUFBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLFFBQVEsQ0FBQyxzQ0FBc0MsQ0FBQzthQUMxRSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyx5Q0FBeUMsQ0FBQztTQUN6RSxDQUFDO0tBQ0wsQ0FBQzttREFtQkQiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBvaywgZmFpbCB9IGZyb20gJy4uL2xpYi9yZXNwb25zZSc7XG4vKipcbiAqIGFzc2V0LW1ldGEtdG9vbHMg4oCUIHRocmVlIE1DUCB0b29scyB0aGF0IGV4cG9zZSB0aGUgdjIuNC4zXG4gKiBhc3NldC1pbnRlcnByZXRlciBzeXN0ZW0gdG8gQUkuIFJlZ2lzdGVyZWQgdW5kZXIgdGhlIGBhc3NldE1ldGFgXG4gKiBjYXRlZ29yeSBzbyB0aGUgcHVibGljIE1DUCBuYW1lcyBhcmU6XG4gKlxuICogICBhc3NldE1ldGFfZ2V0X3Byb3BlcnRpZXMgICAgICDigJQgcmVhZCBtZXRhICsgc3ViLW1ldGEgdXNlckRhdGEgcGVyXG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaW1wb3J0ZXItc3BlY2lmaWMgbGF5b3V0XG4gKiAgIGFzc2V0TWV0YV9zZXRfcHJvcGVydGllcyAgICAgIOKAlCBiYXRjaC13cml0ZSBtZXRhIGZpZWxkcyB3aXRoIHBhdGhcbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWxpZGF0aW9uOyBzYXZlcyArIHJlZnJlc2gtYXNzZXRcbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvbiBjb21taXQgc28gY29jb3MgcmUtaW1wb3J0c1xuICogICBhc3NldE1ldGFfbGlzdF9pbnRlcnByZXRlcnMgICDigJQgd2hhdCBpbXBvcnRlciB0eXBlcyB3ZSByZWNvZ25pc2VcbiAqXG4gKiBBbGwgdGhyZWUgYWNjZXB0IEluc3RhbmNlUmVmZXJlbmNlIGZvciB0aGUgYXNzZXQgdGFyZ2V0IChwcmVmZXJyZWRcbiAqIHYyLjQuMCBmb3JtOiBge2lkOiBhc3NldFV1aWQsIHR5cGU6ICdhc3NldDpjYy5JbWFnZUFzc2V0J31gKS4gRm9yXG4gKiBiYWNrd2FyZCBjb21wYXRpYmlsaXR5IHRoZXkgYWxzbyBhY2NlcHQgYSBiYXJlIGBhc3NldFV1aWRgIHN0cmluZy5cbiAqXG4gKiBEZW1vbnN0cmF0ZXMgdGhlIHYyLjQuMCBzdGVwLTUgQG1jcFRvb2wgZGVjb3JhdG9yICsgc3RlcC00XG4gKiBJbnN0YW5jZVJlZmVyZW5jZSBzaGFwZS5cbiAqXG4gKiBSZWZlcmVuY2U6IGRvY3MvcmVzZWFyY2gvcmVwb3MvUm9tYVJvZ292LWNvY29zLW1jcC5tZC5cbiAqL1xuXG5pbXBvcnQgeyBUb29sRGVmaW5pdGlvbiwgVG9vbFJlc3BvbnNlLCBUb29sRXhlY3V0b3IgfSBmcm9tICcuLi90eXBlcyc7XG5pbXBvcnQgeyB6IH0gZnJvbSAnLi4vbGliL3NjaGVtYSc7XG5pbXBvcnQgeyBtY3BUb29sLCBkZWZpbmVUb29sc0Zyb21EZWNvcmF0b3JzIH0gZnJvbSAnLi4vbGliL2RlY29yYXRvcnMnO1xuaW1wb3J0IHsgaW5zdGFuY2VSZWZlcmVuY2VTY2hlbWEsIEluc3RhbmNlUmVmZXJlbmNlIH0gZnJvbSAnLi4vbGliL2luc3RhbmNlLXJlZmVyZW5jZSc7XG5pbXBvcnQgeyBkZWNvZGVVdWlkIH0gZnJvbSAnLi4vbGliL3V1aWQtY29tcGF0JztcbmltcG9ydCB7IEFzc2V0SW50ZXJwcmV0ZXJNYW5hZ2VyIH0gZnJvbSAnLi4vYXNzZXQtaW50ZXJwcmV0ZXJzL21hbmFnZXInO1xuaW1wb3J0IHtcbiAgICBJbWFnZUludGVycHJldGVyLCBUZXh0dXJlSW50ZXJwcmV0ZXIsIFNwcml0ZUZyYW1lSW50ZXJwcmV0ZXIsXG4gICAgRmJ4SW50ZXJwcmV0ZXIsIE1hdGVyaWFsSW50ZXJwcmV0ZXIsIEVmZmVjdEludGVycHJldGVyLFxuICAgIFBhcnRpY2xlSW50ZXJwcmV0ZXIsIFVua25vd25JbnRlcnByZXRlcixcbiAgICBBbmltYXRpb25DbGlwSW50ZXJwcmV0ZXIsIEF1ZGlvQ2xpcEludGVycHJldGVyLCBQcmVmYWJJbnRlcnByZXRlcixcbiAgICBTY2VuZUludGVycHJldGVyLCBMYWJlbEF0bGFzSW50ZXJwcmV0ZXIsIFNwaW5lSW50ZXJwcmV0ZXIsXG4gICAgSnNvbkludGVycHJldGVyLCBUaWxlZE1hcEludGVycHJldGVyLFxufSBmcm9tICcuLi9hc3NldC1pbnRlcnByZXRlcnMvc3BlY2lhbGl6ZWQnO1xuaW1wb3J0IHsgUHJvcGVydHlTZXRTcGVjIH0gZnJvbSAnLi4vYXNzZXQtaW50ZXJwcmV0ZXJzL2ludGVyZmFjZSc7XG5cbmZ1bmN0aW9uIGJ1aWxkTWFuYWdlcigpOiBBc3NldEludGVycHJldGVyTWFuYWdlciB7XG4gICAgY29uc3QgZmFsbGJhY2sgPSBuZXcgVW5rbm93bkludGVycHJldGVyKCk7XG4gICAgcmV0dXJuIG5ldyBBc3NldEludGVycHJldGVyTWFuYWdlcihcbiAgICAgICAgW1xuICAgICAgICAgICAgbmV3IEltYWdlSW50ZXJwcmV0ZXIoKSxcbiAgICAgICAgICAgIG5ldyBUZXh0dXJlSW50ZXJwcmV0ZXIoKSxcbiAgICAgICAgICAgIG5ldyBTcHJpdGVGcmFtZUludGVycHJldGVyKCksXG4gICAgICAgICAgICBuZXcgRmJ4SW50ZXJwcmV0ZXIoKSxcbiAgICAgICAgICAgIG5ldyBNYXRlcmlhbEludGVycHJldGVyKCksXG4gICAgICAgICAgICBuZXcgRWZmZWN0SW50ZXJwcmV0ZXIoKSxcbiAgICAgICAgICAgIG5ldyBQYXJ0aWNsZUludGVycHJldGVyKCksXG4gICAgICAgICAgICBuZXcgQW5pbWF0aW9uQ2xpcEludGVycHJldGVyKCksXG4gICAgICAgICAgICBuZXcgQXVkaW9DbGlwSW50ZXJwcmV0ZXIoKSxcbiAgICAgICAgICAgIG5ldyBQcmVmYWJJbnRlcnByZXRlcigpLFxuICAgICAgICAgICAgbmV3IFNjZW5lSW50ZXJwcmV0ZXIoKSxcbiAgICAgICAgICAgIG5ldyBMYWJlbEF0bGFzSW50ZXJwcmV0ZXIoKSxcbiAgICAgICAgICAgIG5ldyBTcGluZUludGVycHJldGVyKCksXG4gICAgICAgICAgICBuZXcgSnNvbkludGVycHJldGVyKCksXG4gICAgICAgICAgICBuZXcgVGlsZWRNYXBJbnRlcnByZXRlcigpLFxuICAgICAgICBdLFxuICAgICAgICBmYWxsYmFjayxcbiAgICApO1xufVxuXG5pbnRlcmZhY2UgQXNzZXRUYXJnZXQge1xuICAgIHJlZmVyZW5jZT86IEluc3RhbmNlUmVmZXJlbmNlO1xuICAgIGFzc2V0VXVpZD86IHN0cmluZztcbn1cblxuYXN5bmMgZnVuY3Rpb24gcmVzb2x2ZUFzc2V0SW5mbyh0YXJnZXQ6IEFzc2V0VGFyZ2V0KTogUHJvbWlzZTx7IGFzc2V0SW5mbzogYW55IH0gfCB7IGVycm9yOiBzdHJpbmcgfT4ge1xuICAgIC8vIHYyLjQuNCByZXZpZXcgZml4IChnZW1pbmkgKyBjbGF1ZGUpOiBzeW1tZXRyaWMgd2l0aCByZXNvbHZlUmVmZXJlbmNlJ3NcbiAgICAvLyBtYWxmb3JtZWQtcmVmZXJlbmNlIGRldGVjdGlvbiAodjIuNC4xIC8gdjIuNC4yIGZpeCBhdFxuICAgIC8vIHNvdXJjZS9saWIvaW5zdGFuY2UtcmVmZXJlbmNlLnRzKS4gQSBjYWxsZXIgcGFzc2luZ1xuICAgIC8vIGByZWZlcmVuY2U6IHt9YCAobm8gaWQpIHBsdXMgYSB2YWxpZCBhc3NldFV1aWQgd291bGQgb3RoZXJ3aXNlXG4gICAgLy8gc2lsZW50bHkgZmFsbCBiYWNrIHRvIGFzc2V0VXVpZCDigJQgbWFza3MgaW50ZW50LlxuICAgIGlmICh0YXJnZXQucmVmZXJlbmNlICYmICF0YXJnZXQucmVmZXJlbmNlLmlkKSB7XG4gICAgICAgIHJldHVybiB7IGVycm9yOiAnYXNzZXQtbWV0YSB0b29sOiByZWZlcmVuY2UuaWQgaXMgcmVxdWlyZWQgd2hlbiByZWZlcmVuY2UgaXMgcHJvdmlkZWQnIH07XG4gICAgfVxuICAgIGNvbnN0IHJhd1V1aWQgPSB0YXJnZXQucmVmZXJlbmNlPy5pZCA/PyB0YXJnZXQuYXNzZXRVdWlkO1xuICAgIGlmICghcmF3VXVpZCkge1xuICAgICAgICByZXR1cm4geyBlcnJvcjogJ2Fzc2V0LW1ldGEgdG9vbDogcHJvdmlkZSByZWZlcmVuY2U9e2lkLHR5cGV9IG9yIGFzc2V0VXVpZCcgfTtcbiAgICB9XG4gICAgaWYgKHRhcmdldC5yZWZlcmVuY2U/LmlkICYmIHRhcmdldC5hc3NldFV1aWQgJiYgdGFyZ2V0LnJlZmVyZW5jZS5pZCAhPT0gdGFyZ2V0LmFzc2V0VXVpZCkge1xuICAgICAgICByZXR1cm4geyBlcnJvcjogYGFzc2V0LW1ldGEgdG9vbDogcmVmZXJlbmNlLmlkICgke3RhcmdldC5yZWZlcmVuY2UuaWR9KSBjb25mbGljdHMgd2l0aCBhc3NldFV1aWQgKCR7dGFyZ2V0LmFzc2V0VXVpZH0pOyBwYXNzIG9ubHkgb25lYCB9O1xuICAgIH1cbiAgICAvLyB2Mi42LjAgVC1WMjYtYnVuZGxlOiBjb2NvcyBzdWItYXNzZXQgVVVJRHMgdXNlIGA8dXVpZD5APHN1Yi1rZXk+YC5cbiAgICAvLyBTb21lIGNsaWVudHMgYmFzZTY0LWVuY29kZSBgQGAtY29udGFpbmluZyBzdHJpbmdzIHRvIGRvZGdlIHdpcmVcbiAgICAvLyBtYW5nbGluZyDigJQgZGVjb2RlIGhlcmUgc28gYm90aCBmb3JtcyByZWFjaCBxdWVyeS1hc3NldC1pbmZvIGFzIHRoZVxuICAgIC8vIHJhdyBjb2NvcyBmb3JtYXQuIFBsYWluIFVVSURzIHBhc3MgdGhyb3VnaCB1bmNoYW5nZWQuXG4gICAgY29uc3QgdXVpZCA9IGRlY29kZVV1aWQocmF3VXVpZCk7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgaW5mbyA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0LWluZm8nLCB1dWlkKTtcbiAgICAgICAgaWYgKCFpbmZvKSByZXR1cm4geyBlcnJvcjogYEFzc2V0IG5vdCBmb3VuZDogJHt1dWlkfWAgfTtcbiAgICAgICAgcmV0dXJuIHsgYXNzZXRJbmZvOiBpbmZvIH07XG4gICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgcmV0dXJuIHsgZXJyb3I6IGBxdWVyeS1hc3NldC1pbmZvIGZhaWxlZCBmb3IgJHt1dWlkfTogJHtlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycil9YCB9O1xuICAgIH1cbn1cblxuY29uc3QgYXNzZXRUYXJnZXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gICAgcmVmZXJlbmNlOiBpbnN0YW5jZVJlZmVyZW5jZVNjaGVtYS5vcHRpb25hbCgpLmRlc2NyaWJlKCdJbnN0YW5jZVJlZmVyZW5jZSB7aWQsdHlwZX0uIFByZWZlcnJlZCBmb3JtLiB0eXBlIG1heSBiZSBcImFzc2V0OmNjLkltYWdlQXNzZXRcIiBldGMuLCBkaWFnbm9zdGljIG9ubHkuJyksXG4gICAgYXNzZXRVdWlkOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0Fzc2V0IFVVSUQuIFVzZWQgd2hlbiByZWZlcmVuY2UgaXMgb21pdHRlZC4nKSxcbn0pO1xuXG5leHBvcnQgY2xhc3MgQXNzZXRNZXRhVG9vbHMgaW1wbGVtZW50cyBUb29sRXhlY3V0b3Ige1xuICAgIHByaXZhdGUgcmVhZG9ubHkgZXhlYzogVG9vbEV4ZWN1dG9yO1xuICAgIHByaXZhdGUgcmVhZG9ubHkgbWFuYWdlcjogQXNzZXRJbnRlcnByZXRlck1hbmFnZXI7XG5cbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgdGhpcy5tYW5hZ2VyID0gYnVpbGRNYW5hZ2VyKCk7XG4gICAgICAgIHRoaXMuZXhlYyA9IGRlZmluZVRvb2xzRnJvbURlY29yYXRvcnModGhpcyk7XG4gICAgfVxuXG4gICAgZ2V0VG9vbHMoKTogVG9vbERlZmluaXRpb25bXSB7IHJldHVybiB0aGlzLmV4ZWMuZ2V0VG9vbHMoKTsgfVxuICAgIGV4ZWN1dGUodG9vbE5hbWU6IHN0cmluZywgYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHsgcmV0dXJuIHRoaXMuZXhlYy5leGVjdXRlKHRvb2xOYW1lLCBhcmdzKTsgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnbGlzdF9pbnRlcnByZXRlcnMnLFxuICAgICAgICB0aXRsZTogJ0xpc3QgYXNzZXQgaW50ZXJwcmV0ZXJzJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gTGlzdCB0aGUgYXNzZXQgaW1wb3J0ZXIgdHlwZXMgdGhpcyBzZXJ2ZXIgaGFzIHNwZWNpYWxpemVkIGludGVycHJldGVycyBmb3IuIFRoZSBcIipcIiBlbnRyeSBpcyB0aGUgcmVhZC1vbmx5IGZhbGxiYWNrIHVzZWQgZm9yIGFueSBpbXBvcnRlciBub3QgaW4gdGhlIGxpc3QuIFVzZSB0byBwbGFuIGFzc2V0TWV0YV9zZXRfcHJvcGVydGllcyBjYWxscyDigJQgd3JpdGVzIGFnYWluc3QgdGhlIGZhbGxiYWNrIGFsd2F5cyByZWplY3QuIE5vIHNpZGUgZWZmZWN0cy4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pLFxuICAgIH0pXG4gICAgYXN5bmMgbGlzdEludGVycHJldGVycygpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gb2soe1xuICAgICAgICAgICAgICAgIGltcG9ydGVyVHlwZXM6IHRoaXMubWFuYWdlci5saXN0SW1wb3J0ZXJUeXBlcygpLFxuICAgICAgICAgICAgICAgIGZhbGxiYWNrQmVoYXZpb3VyOiAnVW5rbm93bkludGVycHJldGVyIHJlamVjdHMgd3JpdGVzOyByZWFkcyB3b3JrIGFzIGJlc3QtZWZmb3J0IG1ldGEudXNlckRhdGEgZHVtcC4nLFxuICAgICAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnZ2V0X3Byb3BlcnRpZXMnLFxuICAgICAgICB0aXRsZTogJ1JlYWQgYXNzZXQgbWV0YSBwcm9wZXJ0aWVzJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gUmVhZCBhbiBhc3NldFxcJ3MgbWV0YSArIHN1Yi1tZXRhIHVzZXJEYXRhIHZpYSBpdHMgaW1wb3J0ZXItc3BlY2lmaWMgaW50ZXJwcmV0ZXIuIFJldHVybnMge3Byb3BlcnRpZXM6IHtwYXRoOiB7dHlwZSwgdmFsdWUsIHRvb2x0aXA/LCBlbnVtTGlzdD99fSwgYXJyYXlzOiB7cGF0aDoge3R5cGV9fX0uIFVzZSBCRUZPUkUgYXNzZXRNZXRhX3NldF9wcm9wZXJ0aWVzIHNvIEFJIHNlZXMgdGhlIHJlYWwgcHJvcGVydHkgbmFtZXMgKyB0eXBlcyBpbnN0ZWFkIG9mIGd1ZXNzaW5nLiBQYWlyIGBpbmNsdWRlVG9vbHRpcHM6IHRydWVgIHdoZW4gQUkgbmVlZHMgY29udGV4dCBmb3IgdW5mYW1pbGlhciBpbXBvcnRlcnMuIE5vdGU6IHVzZUFkdmFuY2VkSW5zcGVjdGlvbiBpcyByZXNlcnZlZCDigJQgZnVsbCBtYXRlcmlhbCBlZGl0aW5nIGlzIGRlZmVycmVkIHRvIHYyLjUrLCBzbyB0aGUgZmxhZyBoYXMgbm8gZWZmZWN0IGluIHYyLjQueC4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogYXNzZXRUYXJnZXRTY2hlbWEuZXh0ZW5kKHtcbiAgICAgICAgICAgIGluY2x1ZGVUb29sdGlwczogei5ib29sZWFuKCkuZGVmYXVsdChmYWxzZSkuZGVzY3JpYmUoJ0luY2x1ZGUgaTE4bi1yZXNvbHZlZCB0b29sdGlwIHRleHQgZm9yIGVhY2ggcHJvcGVydHkuIFNsb3dlcjsgb25seSByZXF1ZXN0IHdoZW4gQUkgaXMgZXhwbG9yaW5nIGFuIHVuZmFtaWxpYXIgaW1wb3J0ZXIuJyksXG4gICAgICAgICAgICB1c2VBZHZhbmNlZEluc3BlY3Rpb246IHouYm9vbGVhbigpLmRlZmF1bHQoZmFsc2UpLmRlc2NyaWJlKCdSZXNlcnZlZCBmb3IgdjIuNSsuIEhhcyBubyBlZmZlY3QgaW4gdjIuNC54IGJlY2F1c2UgdGhlIG9ubHkgY29uc3VtZXIgKE1hdGVyaWFsSW50ZXJwcmV0ZXIgYWR2YW5jZWQgZWRpdGluZykgaXMgZGVmZXJyZWQgdW50aWwgdGhlIHNjZW5lL2FwcGx5LW1hdGVyaWFsICsgVVVJRC1wcmVwcm9jZXNzaW5nIGxheWVyIGlzIHBvcnRlZC4gUGFzcyBmYWxzZSB1bnRpbCB2Mi41IGxhbmRzLicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIGdldFByb3BlcnRpZXMoYXJnczogQXNzZXRUYXJnZXQgJiB7IGluY2x1ZGVUb29sdGlwcz86IGJvb2xlYW47IHVzZUFkdmFuY2VkSW5zcGVjdGlvbj86IGJvb2xlYW4gfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHJlc29sdmVkID0gYXdhaXQgcmVzb2x2ZUFzc2V0SW5mbyhhcmdzKTtcbiAgICAgICAgaWYgKCdlcnJvcicgaW4gcmVzb2x2ZWQpIHJldHVybiBmYWlsKHJlc29sdmVkLmVycm9yKTtcbiAgICAgICAgY29uc3QgZGVzY3JpcHRpb24gPSBhd2FpdCB0aGlzLm1hbmFnZXIuZ2V0QXNzZXRQcm9wZXJ0aWVzKFxuICAgICAgICAgICAgcmVzb2x2ZWQuYXNzZXRJbmZvLFxuICAgICAgICAgICAgYXJncy5pbmNsdWRlVG9vbHRpcHMgPz8gZmFsc2UsXG4gICAgICAgICAgICBhcmdzLnVzZUFkdmFuY2VkSW5zcGVjdGlvbiA/PyBmYWxzZSxcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKGRlc2NyaXB0aW9uLmVycm9yKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChkZXNjcmlwdGlvbi5lcnJvciwgZGVzY3JpcHRpb24pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBvayhkZXNjcmlwdGlvbik7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnc2V0X3Byb3BlcnRpZXMnLFxuICAgICAgICB0aXRsZTogJ1dyaXRlIGFzc2V0IG1ldGEgcHJvcGVydGllcycsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIEJhdGNoLXdyaXRlIGFzc2V0IG1ldGEgZmllbGRzLiBFYWNoIGVudHJ5IGlzIHtwcm9wZXJ0eVBhdGgsIHByb3BlcnR5VHlwZSwgcHJvcGVydHlWYWx1ZX07IHRoZSBpbnRlcnByZXRlciB2YWxpZGF0ZXMgdGhlIHBhdGggYWdhaW5zdCBhbiBhbGxvdy1saXN0ICh1c2VyRGF0YS4qLCBzdWJNZXRhcy4qLCBwbGF0Zm9ybVNldHRpbmdzLiopIGFuZCByZWplY3RzIHVua25vd24gcm9vdHMsIHByb3RvdHlwZS1wb2xsdXRpb24gc2VnbWVudHMgKF9fcHJvdG9fXywgY29uc3RydWN0b3IsIHByb3RvdHlwZSksIGFuZCBlbXB0eSBzZWdtZW50cy4gT24gY29tbWl0IHRoZSBpbnRlcnByZXRlciBjYWxscyBhc3NldC1kYiBzYXZlLWFzc2V0LW1ldGEgKyByZWZyZXNoLWFzc2V0IHNvIGNvY29zIHJlLWltcG9ydHMgd2l0aCB0aGUgbmV3IHNldHRpbmdzLiBVc2UgYWZ0ZXIgYXNzZXRNZXRhX2dldF9wcm9wZXJ0aWVzIHRvIGVuc3VyZSBwYXRocy90eXBlcyBhcmUgY29ycmVjdC4gUmV0dXJucyBwZXItZW50cnkgc3VjY2Vzcy9lcnJvciBzbyBwYXJ0aWFsIGZhaWx1cmVzIGFyZSB2aXNpYmxlOyBlbnRyaWVzIHRoYXQgc3VjY2VlZGVkIG9uIGRpc2sgYnV0IGZhaWxlZCByZS1pbXBvcnQgY2FycnkgYSBgd2FybmluZ2AgZmllbGQgaW5zdGVhZCBvZiBiZWluZyBmbGlwcGVkIHRvIGZhaWx1cmUuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IGFzc2V0VGFyZ2V0U2NoZW1hLmV4dGVuZCh7XG4gICAgICAgICAgICBwcm9wZXJ0aWVzOiB6LmFycmF5KHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICBwcm9wZXJ0eVBhdGg6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0RvdHRlZCBtZXRhIHBhdGguIEFsbG93ZWQgcm9vdHM6IHVzZXJEYXRhLiosIHN1Yk1ldGFzLiosIHBsYXRmb3JtU2V0dGluZ3MuKi4gRm9yYmlkZGVuIHNlZ21lbnRzIGFueXdoZXJlIGluIHRoZSBwYXRoOiBfX3Byb3RvX18sIGNvbnN0cnVjdG9yLCBwcm90b3R5cGUuJyksXG4gICAgICAgICAgICAgICAgcHJvcGVydHlUeXBlOiB6LnN0cmluZygpLmRlc2NyaWJlKCdUeXBlIHRhZyBmb3IgdmFsdWUgY29lcmNpb246IEJvb2xlYW4gKGFjY2VwdHMgdHJ1ZS9mYWxzZS8xLzAgc3RyaW5ncyksIE51bWJlci9GbG9hdCAocmVqZWN0cyBOYU4pLCBJbnRlZ2VyIChyZWplY3RzIE5hTiksIFN0cmluZywgRW51bSwgY2MuVmFsdWVUeXBlLCBjYy5PYmplY3QuJyksXG4gICAgICAgICAgICAgICAgcHJvcGVydHlWYWx1ZTogei5hbnkoKS5kZXNjcmliZSgnUmF3IHZhbHVlOyBjb2VyY2VkIHBlciBwcm9wZXJ0eVR5cGUuJyksXG4gICAgICAgICAgICB9KSkubWluKDEpLm1heCg1MCkuZGVzY3JpYmUoJ1Byb3BlcnR5IHdyaXRlcy4gQ2FwcGVkIGF0IDUwIHBlciBjYWxsLicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIHNldFByb3BlcnRpZXMoYXJnczogQXNzZXRUYXJnZXQgJiB7IHByb3BlcnRpZXM6IFByb3BlcnR5U2V0U3BlY1tdIH0pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCByZXNvbHZlZCA9IGF3YWl0IHJlc29sdmVBc3NldEluZm8oYXJncyk7XG4gICAgICAgIGlmICgnZXJyb3InIGluIHJlc29sdmVkKSByZXR1cm4gZmFpbChyZXNvbHZlZC5lcnJvcik7XG4gICAgICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLm1hbmFnZXIuc2V0QXNzZXRQcm9wZXJ0aWVzKHJlc29sdmVkLmFzc2V0SW5mbywgYXJncy5wcm9wZXJ0aWVzKTtcbiAgICAgICAgY29uc3QgZmFpbGVkID0gcmVzdWx0cy5maWx0ZXIociA9PiAhci5zdWNjZXNzKTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHN1Y2Nlc3M6IGZhaWxlZC5sZW5ndGggPT09IDAsXG4gICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgYXNzZXRVdWlkOiByZXNvbHZlZC5hc3NldEluZm8udXVpZCxcbiAgICAgICAgICAgICAgICBpbXBvcnRlcjogcmVzb2x2ZWQuYXNzZXRJbmZvLmltcG9ydGVyLFxuICAgICAgICAgICAgICAgIHRvdGFsOiByZXN1bHRzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICBmYWlsZWRDb3VudDogZmFpbGVkLmxlbmd0aCxcbiAgICAgICAgICAgICAgICByZXN1bHRzLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIG1lc3NhZ2U6IGZhaWxlZC5sZW5ndGggPT09IDBcbiAgICAgICAgICAgICAgICA/IGBXcm90ZSAke3Jlc3VsdHMubGVuZ3RofSBhc3NldC1tZXRhIHByb3BlcnRpZXNgXG4gICAgICAgICAgICAgICAgOiBgJHtmYWlsZWQubGVuZ3RofS8ke3Jlc3VsdHMubGVuZ3RofSBhc3NldC1tZXRhIHdyaXRlcyBmYWlsZWRgLFxuICAgICAgICB9O1xuICAgIH1cbn1cbiJdfQ==