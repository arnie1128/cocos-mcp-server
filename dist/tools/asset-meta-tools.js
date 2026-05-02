"use strict";
/**
 * asset-meta-tools — three MCP tools that expose the v2.4.3
 * asset-interpreter system to AI:
 *
 *   asset_get_properties      — read meta + sub-meta userData per
 *                               importer-specific layout
 *   asset_set_properties      — batch-write meta fields with path
 *                               validation; saves + refresh-asset on
 *                               commit so cocos re-imports
 *   asset_list_interpreters   — what importer types we recognise
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
        description: 'List the asset importer types this server has specialized interpreters for. The "*" entry is the read-only fallback used for any importer not in the list. Use to plan asset_set_properties calls — writes against the fallback always reject. No side effects.',
        inputSchema: schema_1.z.object({}),
    })
], AssetMetaTools.prototype, "listInterpreters", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'get_properties',
        description: 'Read an asset\'s meta + sub-meta userData via its importer-specific interpreter. Returns {properties: {path: {type, value, tooltip?, enumList?}}, arrays: {path: {type}}}. Use BEFORE asset_set_properties so AI sees the real property names + types instead of guessing. Pair `includeTooltips: true` when AI needs context for unfamiliar importers.',
        inputSchema: assetTargetSchema.extend({
            includeTooltips: schema_1.z.boolean().default(false).describe('Include i18n-resolved tooltip text for each property. Slower; only request when AI is exploring an unfamiliar importer.'),
            useAdvancedInspection: schema_1.z.boolean().default(false).describe('Importer-specific advanced inspection mode. MaterialInterpreter uses it to surface defines and pass-level props; most interpreters ignore it.'),
        }),
    })
], AssetMetaTools.prototype, "getProperties", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'set_properties',
        description: 'Batch-write asset meta fields. Each entry is {propertyPath, propertyType, propertyValue}; the interpreter validates the path against an allow-list (userData.*, subMetas.*, platformSettings.*, etc.) and rejects unknown roots. On commit the interpreter calls asset-db save-asset-meta + refresh-asset so cocos re-imports with the new settings. Use after asset_get_properties to ensure paths/types are correct. Returns per-entry success/error so partial failures are visible.',
        inputSchema: assetTargetSchema.extend({
            properties: schema_1.z.array(schema_1.z.object({
                propertyPath: schema_1.z.string().describe('Dotted meta path. Allowed roots: userData.*, subMetas.*, platformSettings.*, importer, importerVersion, sourceUuid, isGroup, folder.'),
                propertyType: schema_1.z.string().describe('Type tag for value coercion: Boolean, Number, Float, Integer, String, Enum, cc.ValueType, cc.Object.'),
                propertyValue: schema_1.z.any().describe('Raw value; coerced per propertyType.'),
            })).min(1).max(50).describe('Property writes. Capped at 50 per call.'),
        }),
    })
], AssetMetaTools.prototype, "setProperties", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXNzZXQtbWV0YS10b29scy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NvdXJjZS90b29scy9hc3NldC1tZXRhLXRvb2xzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQW1CRzs7Ozs7Ozs7O0FBR0gsMENBQWtDO0FBQ2xDLGtEQUF1RTtBQUN2RSxrRUFBdUY7QUFDdkYsMkRBQXdFO0FBQ3hFLG1FQUkyQztBQUczQyxTQUFTLFlBQVk7SUFDakIsTUFBTSxRQUFRLEdBQUcsSUFBSSxnQ0FBa0IsRUFBRSxDQUFDO0lBQzFDLE9BQU8sSUFBSSxpQ0FBdUIsQ0FDOUI7UUFDSSxJQUFJLDhCQUFnQixFQUFFO1FBQ3RCLElBQUksZ0NBQWtCLEVBQUU7UUFDeEIsSUFBSSxvQ0FBc0IsRUFBRTtRQUM1QixJQUFJLDRCQUFjLEVBQUU7UUFDcEIsSUFBSSxpQ0FBbUIsRUFBRTtRQUN6QixJQUFJLCtCQUFpQixFQUFFO1FBQ3ZCLElBQUksaUNBQW1CLEVBQUU7S0FDNUIsRUFDRCxRQUFRLENBQ1gsQ0FBQztBQUNOLENBQUM7QUFPRCxLQUFLLFVBQVUsZ0JBQWdCLENBQUMsTUFBbUI7O0lBQy9DLE1BQU0sSUFBSSxHQUFHLE1BQUEsTUFBQSxNQUFNLENBQUMsU0FBUywwQ0FBRSxFQUFFLG1DQUFJLE1BQU0sQ0FBQyxTQUFTLENBQUM7SUFDdEQsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ1IsT0FBTyxFQUFFLEtBQUssRUFBRSwyREFBMkQsRUFBRSxDQUFDO0lBQ2xGLENBQUM7SUFDRCxJQUFJLENBQUEsTUFBQSxNQUFNLENBQUMsU0FBUywwQ0FBRSxFQUFFLEtBQUksTUFBTSxDQUFDLFNBQVMsSUFBSSxNQUFNLENBQUMsU0FBUyxDQUFDLEVBQUUsS0FBSyxNQUFNLENBQUMsU0FBUyxFQUFFLENBQUM7UUFDdkYsT0FBTyxFQUFFLEtBQUssRUFBRSxrQ0FBa0MsTUFBTSxDQUFDLFNBQVMsQ0FBQyxF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V0FBVyxFQUFFLGlCQUFpQixDQUFDLE1BQU0sQ0FBQztZQUNsQyxlQUFlLEVBQUUsVUFBQyxDQUFDLE9BQU8sRUFBRSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxRQUFRLENBQUMseUhBQXlILENBQUM7WUFDL0sscUJBQXFCLEVBQUUsVUFBQyxDQUFDLE9BQU8sRUFBRSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxRQUFRLENBQUMsK0lBQStJLENBQUM7U0FDOU0sQ0FBQztLQUNMLENBQUM7bURBYUQ7QUFhSztJQVhMLElBQUEsb0JBQU8sRUFBQztRQUNMLElBQUksRUFBRSxnQkFBZ0I7UUFDdEIsV0FBVyxFQUFFLHlkQUF5ZDtRQUN0ZSxXQUFXLEVBQUUsaUJBQWlCLENBQUMsTUFBTSxDQUFDO1lBQ2xDLFVBQVUsRUFBRSxVQUFDLENBQUMsS0FBSyxDQUFDLFVBQUMsQ0FBQyxNQUFNLENBQUM7Z0JBQ3pCLFlBQVksRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLHNJQUFzSSxDQUFDO2dCQUN6SyxZQUFZLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyxzR0FBc0csQ0FBQztnQkFDekksYUFBYSxFQUFFLFVBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxRQUFRLENBQUMsc0NBQXNDLENBQUM7YUFDMUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMseUNBQXlDLENBQUM7U0FDekUsQ0FBQztLQUNMLENBQUM7bURBbUJEIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBhc3NldC1tZXRhLXRvb2xzIOKAlCB0aHJlZSBNQ1AgdG9vbHMgdGhhdCBleHBvc2UgdGhlIHYyLjQuM1xuICogYXNzZXQtaW50ZXJwcmV0ZXIgc3lzdGVtIHRvIEFJOlxuICpcbiAqICAgYXNzZXRfZ2V0X3Byb3BlcnRpZXMgICAgICDigJQgcmVhZCBtZXRhICsgc3ViLW1ldGEgdXNlckRhdGEgcGVyXG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbXBvcnRlci1zcGVjaWZpYyBsYXlvdXRcbiAqICAgYXNzZXRfc2V0X3Byb3BlcnRpZXMgICAgICDigJQgYmF0Y2gtd3JpdGUgbWV0YSBmaWVsZHMgd2l0aCBwYXRoXG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWxpZGF0aW9uOyBzYXZlcyArIHJlZnJlc2gtYXNzZXQgb25cbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbW1pdCBzbyBjb2NvcyByZS1pbXBvcnRzXG4gKiAgIGFzc2V0X2xpc3RfaW50ZXJwcmV0ZXJzICAg4oCUIHdoYXQgaW1wb3J0ZXIgdHlwZXMgd2UgcmVjb2duaXNlXG4gKlxuICogQWxsIHRocmVlIGFjY2VwdCBJbnN0YW5jZVJlZmVyZW5jZSBmb3IgdGhlIGFzc2V0IHRhcmdldCAocHJlZmVycmVkXG4gKiB2Mi40LjAgZm9ybTogYHtpZDogYXNzZXRVdWlkLCB0eXBlOiAnYXNzZXQ6Y2MuSW1hZ2VBc3NldCd9YCkuIEZvclxuICogYmFja3dhcmQgY29tcGF0aWJpbGl0eSB0aGV5IGFsc28gYWNjZXB0IGEgYmFyZSBgYXNzZXRVdWlkYCBzdHJpbmcuXG4gKlxuICogRGVtb25zdHJhdGVzIHRoZSB2Mi40LjAgc3RlcC01IEBtY3BUb29sIGRlY29yYXRvciArIHN0ZXAtNFxuICogSW5zdGFuY2VSZWZlcmVuY2Ugc2hhcGUuXG4gKlxuICogUmVmZXJlbmNlOiBkb2NzL3Jlc2VhcmNoL3JlcG9zL1JvbWFSb2dvdi1jb2Nvcy1tY3AubWQuXG4gKi9cblxuaW1wb3J0IHsgVG9vbERlZmluaXRpb24sIFRvb2xSZXNwb25zZSwgVG9vbEV4ZWN1dG9yIH0gZnJvbSAnLi4vdHlwZXMnO1xuaW1wb3J0IHsgeiB9IGZyb20gJy4uL2xpYi9zY2hlbWEnO1xuaW1wb3J0IHsgbWNwVG9vbCwgZGVmaW5lVG9vbHNGcm9tRGVjb3JhdG9ycyB9IGZyb20gJy4uL2xpYi9kZWNvcmF0b3JzJztcbmltcG9ydCB7IGluc3RhbmNlUmVmZXJlbmNlU2NoZW1hLCBJbnN0YW5jZVJlZmVyZW5jZSB9IGZyb20gJy4uL2xpYi9pbnN0YW5jZS1yZWZlcmVuY2UnO1xuaW1wb3J0IHsgQXNzZXRJbnRlcnByZXRlck1hbmFnZXIgfSBmcm9tICcuLi9hc3NldC1pbnRlcnByZXRlcnMvbWFuYWdlcic7XG5pbXBvcnQge1xuICAgIEltYWdlSW50ZXJwcmV0ZXIsIFRleHR1cmVJbnRlcnByZXRlciwgU3ByaXRlRnJhbWVJbnRlcnByZXRlcixcbiAgICBGYnhJbnRlcnByZXRlciwgTWF0ZXJpYWxJbnRlcnByZXRlciwgRWZmZWN0SW50ZXJwcmV0ZXIsXG4gICAgUGFydGljbGVJbnRlcnByZXRlciwgVW5rbm93bkludGVycHJldGVyLFxufSBmcm9tICcuLi9hc3NldC1pbnRlcnByZXRlcnMvc3BlY2lhbGl6ZWQnO1xuaW1wb3J0IHsgUHJvcGVydHlTZXRTcGVjIH0gZnJvbSAnLi4vYXNzZXQtaW50ZXJwcmV0ZXJzL2ludGVyZmFjZSc7XG5cbmZ1bmN0aW9uIGJ1aWxkTWFuYWdlcigpOiBBc3NldEludGVycHJldGVyTWFuYWdlciB7XG4gICAgY29uc3QgZmFsbGJhY2sgPSBuZXcgVW5rbm93bkludGVycHJldGVyKCk7XG4gICAgcmV0dXJuIG5ldyBBc3NldEludGVycHJldGVyTWFuYWdlcihcbiAgICAgICAgW1xuICAgICAgICAgICAgbmV3IEltYWdlSW50ZXJwcmV0ZXIoKSxcbiAgICAgICAgICAgIG5ldyBUZXh0dXJlSW50ZXJwcmV0ZXIoKSxcbiAgICAgICAgICAgIG5ldyBTcHJpdGVGcmFtZUludGVycHJldGVyKCksXG4gICAgICAgICAgICBuZXcgRmJ4SW50ZXJwcmV0ZXIoKSxcbiAgICAgICAgICAgIG5ldyBNYXRlcmlhbEludGVycHJldGVyKCksXG4gICAgICAgICAgICBuZXcgRWZmZWN0SW50ZXJwcmV0ZXIoKSxcbiAgICAgICAgICAgIG5ldyBQYXJ0aWNsZUludGVycHJldGVyKCksXG4gICAgICAgIF0sXG4gICAgICAgIGZhbGxiYWNrLFxuICAgICk7XG59XG5cbmludGVyZmFjZSBBc3NldFRhcmdldCB7XG4gICAgcmVmZXJlbmNlPzogSW5zdGFuY2VSZWZlcmVuY2U7XG4gICAgYXNzZXRVdWlkPzogc3RyaW5nO1xufVxuXG5hc3luYyBmdW5jdGlvbiByZXNvbHZlQXNzZXRJbmZvKHRhcmdldDogQXNzZXRUYXJnZXQpOiBQcm9taXNlPHsgYXNzZXRJbmZvOiBhbnkgfSB8IHsgZXJyb3I6IHN0cmluZyB9PiB7XG4gICAgY29uc3QgdXVpZCA9IHRhcmdldC5yZWZlcmVuY2U/LmlkID8/IHRhcmdldC5hc3NldFV1aWQ7XG4gICAgaWYgKCF1dWlkKSB7XG4gICAgICAgIHJldHVybiB7IGVycm9yOiAnYXNzZXQtbWV0YSB0b29sOiBwcm92aWRlIHJlZmVyZW5jZT17aWQsdHlwZX0gb3IgYXNzZXRVdWlkJyB9O1xuICAgIH1cbiAgICBpZiAodGFyZ2V0LnJlZmVyZW5jZT8uaWQgJiYgdGFyZ2V0LmFzc2V0VXVpZCAmJiB0YXJnZXQucmVmZXJlbmNlLmlkICE9PSB0YXJnZXQuYXNzZXRVdWlkKSB7XG4gICAgICAgIHJldHVybiB7IGVycm9yOiBgYXNzZXQtbWV0YSB0b29sOiByZWZlcmVuY2UuaWQgKCR7dGFyZ2V0LnJlZmVyZW5jZS5pZH0pIGNvbmZsaWN0cyB3aXRoIGFzc2V0VXVpZCAoJHt0YXJnZXQuYXNzZXRVdWlkfSk7IHBhc3Mgb25seSBvbmVgIH07XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGluZm8gPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldC1pbmZvJywgdXVpZCk7XG4gICAgICAgIGlmICghaW5mbykgcmV0dXJuIHsgZXJyb3I6IGBBc3NldCBub3QgZm91bmQ6ICR7dXVpZH1gIH07XG4gICAgICAgIHJldHVybiB7IGFzc2V0SW5mbzogaW5mbyB9O1xuICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgIHJldHVybiB7IGVycm9yOiBgcXVlcnktYXNzZXQtaW5mbyBmYWlsZWQgZm9yICR7dXVpZH06ICR7ZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpfWAgfTtcbiAgICB9XG59XG5cbmNvbnN0IGFzc2V0VGFyZ2V0U2NoZW1hID0gei5vYmplY3Qoe1xuICAgIHJlZmVyZW5jZTogaW5zdGFuY2VSZWZlcmVuY2VTY2hlbWEub3B0aW9uYWwoKS5kZXNjcmliZSgnSW5zdGFuY2VSZWZlcmVuY2Uge2lkLHR5cGV9LiBQcmVmZXJyZWQgZm9ybS4gdHlwZSBtYXkgYmUgXCJhc3NldDpjYy5JbWFnZUFzc2V0XCIgZXRjLiwgZGlhZ25vc3RpYyBvbmx5LicpLFxuICAgIGFzc2V0VXVpZDogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdBc3NldCBVVUlELiBVc2VkIHdoZW4gcmVmZXJlbmNlIGlzIG9taXR0ZWQuJyksXG59KTtcblxuZXhwb3J0IGNsYXNzIEFzc2V0TWV0YVRvb2xzIGltcGxlbWVudHMgVG9vbEV4ZWN1dG9yIHtcbiAgICBwcml2YXRlIHJlYWRvbmx5IGV4ZWM6IFRvb2xFeGVjdXRvcjtcbiAgICBwcml2YXRlIHJlYWRvbmx5IG1hbmFnZXI6IEFzc2V0SW50ZXJwcmV0ZXJNYW5hZ2VyO1xuXG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHRoaXMubWFuYWdlciA9IGJ1aWxkTWFuYWdlcigpO1xuICAgICAgICB0aGlzLmV4ZWMgPSBkZWZpbmVUb29sc0Zyb21EZWNvcmF0b3JzKHRoaXMpO1xuICAgIH1cblxuICAgIGdldFRvb2xzKCk6IFRvb2xEZWZpbml0aW9uW10geyByZXR1cm4gdGhpcy5leGVjLmdldFRvb2xzKCk7IH1cbiAgICBleGVjdXRlKHRvb2xOYW1lOiBzdHJpbmcsIGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7IHJldHVybiB0aGlzLmV4ZWMuZXhlY3V0ZSh0b29sTmFtZSwgYXJncyk7IH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ2xpc3RfaW50ZXJwcmV0ZXJzJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdMaXN0IHRoZSBhc3NldCBpbXBvcnRlciB0eXBlcyB0aGlzIHNlcnZlciBoYXMgc3BlY2lhbGl6ZWQgaW50ZXJwcmV0ZXJzIGZvci4gVGhlIFwiKlwiIGVudHJ5IGlzIHRoZSByZWFkLW9ubHkgZmFsbGJhY2sgdXNlZCBmb3IgYW55IGltcG9ydGVyIG5vdCBpbiB0aGUgbGlzdC4gVXNlIHRvIHBsYW4gYXNzZXRfc2V0X3Byb3BlcnRpZXMgY2FsbHMg4oCUIHdyaXRlcyBhZ2FpbnN0IHRoZSBmYWxsYmFjayBhbHdheXMgcmVqZWN0LiBObyBzaWRlIGVmZmVjdHMuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSxcbiAgICB9KVxuICAgIGFzeW5jIGxpc3RJbnRlcnByZXRlcnMoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgaW1wb3J0ZXJUeXBlczogdGhpcy5tYW5hZ2VyLmxpc3RJbXBvcnRlclR5cGVzKCksXG4gICAgICAgICAgICAgICAgZmFsbGJhY2tCZWhhdmlvdXI6ICdVbmtub3duSW50ZXJwcmV0ZXIgcmVqZWN0cyB3cml0ZXM7IHJlYWRzIHdvcmsgYXMgYmVzdC1lZmZvcnQgbWV0YS51c2VyRGF0YSBkdW1wLicsXG4gICAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ2dldF9wcm9wZXJ0aWVzJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdSZWFkIGFuIGFzc2V0XFwncyBtZXRhICsgc3ViLW1ldGEgdXNlckRhdGEgdmlhIGl0cyBpbXBvcnRlci1zcGVjaWZpYyBpbnRlcnByZXRlci4gUmV0dXJucyB7cHJvcGVydGllczoge3BhdGg6IHt0eXBlLCB2YWx1ZSwgdG9vbHRpcD8sIGVudW1MaXN0P319LCBhcnJheXM6IHtwYXRoOiB7dHlwZX19fS4gVXNlIEJFRk9SRSBhc3NldF9zZXRfcHJvcGVydGllcyBzbyBBSSBzZWVzIHRoZSByZWFsIHByb3BlcnR5IG5hbWVzICsgdHlwZXMgaW5zdGVhZCBvZiBndWVzc2luZy4gUGFpciBgaW5jbHVkZVRvb2x0aXBzOiB0cnVlYCB3aGVuIEFJIG5lZWRzIGNvbnRleHQgZm9yIHVuZmFtaWxpYXIgaW1wb3J0ZXJzLicsXG4gICAgICAgIGlucHV0U2NoZW1hOiBhc3NldFRhcmdldFNjaGVtYS5leHRlbmQoe1xuICAgICAgICAgICAgaW5jbHVkZVRvb2x0aXBzOiB6LmJvb2xlYW4oKS5kZWZhdWx0KGZhbHNlKS5kZXNjcmliZSgnSW5jbHVkZSBpMThuLXJlc29sdmVkIHRvb2x0aXAgdGV4dCBmb3IgZWFjaCBwcm9wZXJ0eS4gU2xvd2VyOyBvbmx5IHJlcXVlc3Qgd2hlbiBBSSBpcyBleHBsb3JpbmcgYW4gdW5mYW1pbGlhciBpbXBvcnRlci4nKSxcbiAgICAgICAgICAgIHVzZUFkdmFuY2VkSW5zcGVjdGlvbjogei5ib29sZWFuKCkuZGVmYXVsdChmYWxzZSkuZGVzY3JpYmUoJ0ltcG9ydGVyLXNwZWNpZmljIGFkdmFuY2VkIGluc3BlY3Rpb24gbW9kZS4gTWF0ZXJpYWxJbnRlcnByZXRlciB1c2VzIGl0IHRvIHN1cmZhY2UgZGVmaW5lcyBhbmQgcGFzcy1sZXZlbCBwcm9wczsgbW9zdCBpbnRlcnByZXRlcnMgaWdub3JlIGl0LicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIGdldFByb3BlcnRpZXMoYXJnczogQXNzZXRUYXJnZXQgJiB7IGluY2x1ZGVUb29sdGlwcz86IGJvb2xlYW47IHVzZUFkdmFuY2VkSW5zcGVjdGlvbj86IGJvb2xlYW4gfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHJlc29sdmVkID0gYXdhaXQgcmVzb2x2ZUFzc2V0SW5mbyhhcmdzKTtcbiAgICAgICAgaWYgKCdlcnJvcicgaW4gcmVzb2x2ZWQpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogcmVzb2x2ZWQuZXJyb3IgfTtcbiAgICAgICAgY29uc3QgZGVzY3JpcHRpb24gPSBhd2FpdCB0aGlzLm1hbmFnZXIuZ2V0QXNzZXRQcm9wZXJ0aWVzKFxuICAgICAgICAgICAgcmVzb2x2ZWQuYXNzZXRJbmZvLFxuICAgICAgICAgICAgYXJncy5pbmNsdWRlVG9vbHRpcHMgPz8gZmFsc2UsXG4gICAgICAgICAgICBhcmdzLnVzZUFkdmFuY2VkSW5zcGVjdGlvbiA/PyBmYWxzZSxcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKGRlc2NyaXB0aW9uLmVycm9yKSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGRlc2NyaXB0aW9uLmVycm9yLCBkYXRhOiBkZXNjcmlwdGlvbiB9O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IGRlc2NyaXB0aW9uIH07XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnc2V0X3Byb3BlcnRpZXMnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ0JhdGNoLXdyaXRlIGFzc2V0IG1ldGEgZmllbGRzLiBFYWNoIGVudHJ5IGlzIHtwcm9wZXJ0eVBhdGgsIHByb3BlcnR5VHlwZSwgcHJvcGVydHlWYWx1ZX07IHRoZSBpbnRlcnByZXRlciB2YWxpZGF0ZXMgdGhlIHBhdGggYWdhaW5zdCBhbiBhbGxvdy1saXN0ICh1c2VyRGF0YS4qLCBzdWJNZXRhcy4qLCBwbGF0Zm9ybVNldHRpbmdzLiosIGV0Yy4pIGFuZCByZWplY3RzIHVua25vd24gcm9vdHMuIE9uIGNvbW1pdCB0aGUgaW50ZXJwcmV0ZXIgY2FsbHMgYXNzZXQtZGIgc2F2ZS1hc3NldC1tZXRhICsgcmVmcmVzaC1hc3NldCBzbyBjb2NvcyByZS1pbXBvcnRzIHdpdGggdGhlIG5ldyBzZXR0aW5ncy4gVXNlIGFmdGVyIGFzc2V0X2dldF9wcm9wZXJ0aWVzIHRvIGVuc3VyZSBwYXRocy90eXBlcyBhcmUgY29ycmVjdC4gUmV0dXJucyBwZXItZW50cnkgc3VjY2Vzcy9lcnJvciBzbyBwYXJ0aWFsIGZhaWx1cmVzIGFyZSB2aXNpYmxlLicsXG4gICAgICAgIGlucHV0U2NoZW1hOiBhc3NldFRhcmdldFNjaGVtYS5leHRlbmQoe1xuICAgICAgICAgICAgcHJvcGVydGllczogei5hcnJheSh6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgcHJvcGVydHlQYXRoOiB6LnN0cmluZygpLmRlc2NyaWJlKCdEb3R0ZWQgbWV0YSBwYXRoLiBBbGxvd2VkIHJvb3RzOiB1c2VyRGF0YS4qLCBzdWJNZXRhcy4qLCBwbGF0Zm9ybVNldHRpbmdzLiosIGltcG9ydGVyLCBpbXBvcnRlclZlcnNpb24sIHNvdXJjZVV1aWQsIGlzR3JvdXAsIGZvbGRlci4nKSxcbiAgICAgICAgICAgICAgICBwcm9wZXJ0eVR5cGU6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1R5cGUgdGFnIGZvciB2YWx1ZSBjb2VyY2lvbjogQm9vbGVhbiwgTnVtYmVyLCBGbG9hdCwgSW50ZWdlciwgU3RyaW5nLCBFbnVtLCBjYy5WYWx1ZVR5cGUsIGNjLk9iamVjdC4nKSxcbiAgICAgICAgICAgICAgICBwcm9wZXJ0eVZhbHVlOiB6LmFueSgpLmRlc2NyaWJlKCdSYXcgdmFsdWU7IGNvZXJjZWQgcGVyIHByb3BlcnR5VHlwZS4nKSxcbiAgICAgICAgICAgIH0pKS5taW4oMSkubWF4KDUwKS5kZXNjcmliZSgnUHJvcGVydHkgd3JpdGVzLiBDYXBwZWQgYXQgNTAgcGVyIGNhbGwuJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgc2V0UHJvcGVydGllcyhhcmdzOiBBc3NldFRhcmdldCAmIHsgcHJvcGVydGllczogUHJvcGVydHlTZXRTcGVjW10gfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHJlc29sdmVkID0gYXdhaXQgcmVzb2x2ZUFzc2V0SW5mbyhhcmdzKTtcbiAgICAgICAgaWYgKCdlcnJvcicgaW4gcmVzb2x2ZWQpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogcmVzb2x2ZWQuZXJyb3IgfTtcbiAgICAgICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMubWFuYWdlci5zZXRBc3NldFByb3BlcnRpZXMocmVzb2x2ZWQuYXNzZXRJbmZvLCBhcmdzLnByb3BlcnRpZXMpO1xuICAgICAgICBjb25zdCBmYWlsZWQgPSByZXN1bHRzLmZpbHRlcihyID0+ICFyLnN1Y2Nlc3MpO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgc3VjY2VzczogZmFpbGVkLmxlbmd0aCA9PT0gMCxcbiAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICBhc3NldFV1aWQ6IHJlc29sdmVkLmFzc2V0SW5mby51dWlkLFxuICAgICAgICAgICAgICAgIGltcG9ydGVyOiByZXNvbHZlZC5hc3NldEluZm8uaW1wb3J0ZXIsXG4gICAgICAgICAgICAgICAgdG90YWw6IHJlc3VsdHMubGVuZ3RoLFxuICAgICAgICAgICAgICAgIGZhaWxlZENvdW50OiBmYWlsZWQubGVuZ3RoLFxuICAgICAgICAgICAgICAgIHJlc3VsdHMsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgbWVzc2FnZTogZmFpbGVkLmxlbmd0aCA9PT0gMFxuICAgICAgICAgICAgICAgID8gYFdyb3RlICR7cmVzdWx0cy5sZW5ndGh9IGFzc2V0LW1ldGEgcHJvcGVydGllc2BcbiAgICAgICAgICAgICAgICA6IGAke2ZhaWxlZC5sZW5ndGh9LyR7cmVzdWx0cy5sZW5ndGh9IGFzc2V0LW1ldGEgd3JpdGVzIGZhaWxlZGAsXG4gICAgICAgIH07XG4gICAgfVxufVxuIl19