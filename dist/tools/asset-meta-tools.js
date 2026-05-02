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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXNzZXQtbWV0YS10b29scy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NvdXJjZS90b29scy9hc3NldC1tZXRhLXRvb2xzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FvQkc7Ozs7Ozs7OztBQUdILDBDQUFrQztBQUNsQyxrREFBdUU7QUFDdkUsa0VBQXVGO0FBQ3ZGLG9EQUFnRDtBQUNoRCwyREFBd0U7QUFDeEUsbUVBSTJDO0FBRzNDLFNBQVMsWUFBWTtJQUNqQixNQUFNLFFBQVEsR0FBRyxJQUFJLGdDQUFrQixFQUFFLENBQUM7SUFDMUMsT0FBTyxJQUFJLGlDQUF1QixDQUM5QjtRQUNJLElBQUksOEJBQWdCLEVBQUU7UUFDdEIsSUFBSSxnQ0FBa0IsRUFBRTtRQUN4QixJQUFJLG9DQUFzQixFQUFFO1FBQzVCLElBQUksNEJBQWMsRUFBRTtRQUNwQixJQUFJLGlDQUFtQixFQUFFO1FBQ3pCLElBQUksK0JBQWlCLEVBQUU7UUFDdkIsSUFBSSxpQ0FBbUIsRUFBRTtLQUM1QixFQUNELFFBQVEsQ0FDWCxDQUFDO0FBQ04sQ0FBQztBQU9ELEtBQUssVUFBVSxnQkFBZ0IsQ0FBQyxNQUFtQjs7SUFDL0MseUVBQXlFO0lBQ3pFLHdEQUF3RDtJQUN4RCxzREFBc0Q7SUFDdEQsaUVBQWlFO0lBQ2pFLGtEQUFrRDtJQUNsRCxJQUFJLE1BQU0sQ0FBQyxTQUFTLElBQUksQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLEVBQUUsRUFBRSxDQUFDO1FBQzNDLE9BQU8sRUFBRSxLQUFLLEVBQUUsc0VBQXNFLEVBQUUsQ0FBQztJQUM3RixDQUFDO0lBQ0QsTUFBTSxPQUFPLEdBQUcsTUFBQSxNQUFBLE1BQU0sQ0FBQyxTQUFTLDBDQUFFLEVBQUUsbUNBQUksTUFBTSxDQUFDLFNBQVMsQ0FBQztJQUN6RCxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDWCxPQUFPLEVBQUUsS0FBSyxFQUFFLDJEQUEy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QWtLLENBQUM7Z0JBQ3JNLGFBQWEsRUFBRSxVQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsUUFBUSxDQUFDLHNDQUFzQyxDQUFDO2FBQzFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLHlDQUF5QyxDQUFDO1NBQ3pFLENBQUM7S0FDTCxDQUFDO21EQW1CRCIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogYXNzZXQtbWV0YS10b29scyDigJQgdGhyZWUgTUNQIHRvb2xzIHRoYXQgZXhwb3NlIHRoZSB2Mi40LjNcbiAqIGFzc2V0LWludGVycHJldGVyIHN5c3RlbSB0byBBSS4gUmVnaXN0ZXJlZCB1bmRlciB0aGUgYGFzc2V0TWV0YWBcbiAqIGNhdGVnb3J5IHNvIHRoZSBwdWJsaWMgTUNQIG5hbWVzIGFyZTpcbiAqXG4gKiAgIGFzc2V0TWV0YV9nZXRfcHJvcGVydGllcyAgICAgIOKAlCByZWFkIG1ldGEgKyBzdWItbWV0YSB1c2VyRGF0YSBwZXJcbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbXBvcnRlci1zcGVjaWZpYyBsYXlvdXRcbiAqICAgYXNzZXRNZXRhX3NldF9wcm9wZXJ0aWVzICAgICAg4oCUIGJhdGNoLXdyaXRlIG1ldGEgZmllbGRzIHdpdGggcGF0aFxuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbGlkYXRpb247IHNhdmVzICsgcmVmcmVzaC1hc3NldFxuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9uIGNvbW1pdCBzbyBjb2NvcyByZS1pbXBvcnRzXG4gKiAgIGFzc2V0TWV0YV9saXN0X2ludGVycHJldGVycyAgIOKAlCB3aGF0IGltcG9ydGVyIHR5cGVzIHdlIHJlY29nbmlzZVxuICpcbiAqIEFsbCB0aHJlZSBhY2NlcHQgSW5zdGFuY2VSZWZlcmVuY2UgZm9yIHRoZSBhc3NldCB0YXJnZXQgKHByZWZlcnJlZFxuICogdjIuNC4wIGZvcm06IGB7aWQ6IGFzc2V0VXVpZCwgdHlwZTogJ2Fzc2V0OmNjLkltYWdlQXNzZXQnfWApLiBGb3JcbiAqIGJhY2t3YXJkIGNvbXBhdGliaWxpdHkgdGhleSBhbHNvIGFjY2VwdCBhIGJhcmUgYGFzc2V0VXVpZGAgc3RyaW5nLlxuICpcbiAqIERlbW9uc3RyYXRlcyB0aGUgdjIuNC4wIHN0ZXAtNSBAbWNwVG9vbCBkZWNvcmF0b3IgKyBzdGVwLTRcbiAqIEluc3RhbmNlUmVmZXJlbmNlIHNoYXBlLlxuICpcbiAqIFJlZmVyZW5jZTogZG9jcy9yZXNlYXJjaC9yZXBvcy9Sb21hUm9nb3YtY29jb3MtbWNwLm1kLlxuICovXG5cbmltcG9ydCB7IFRvb2xEZWZpbml0aW9uLCBUb29sUmVzcG9uc2UsIFRvb2xFeGVjdXRvciB9IGZyb20gJy4uL3R5cGVzJztcbmltcG9ydCB7IHogfSBmcm9tICcuLi9saWIvc2NoZW1hJztcbmltcG9ydCB7IG1jcFRvb2wsIGRlZmluZVRvb2xzRnJvbURlY29yYXRvcnMgfSBmcm9tICcuLi9saWIvZGVjb3JhdG9ycyc7XG5pbXBvcnQgeyBpbnN0YW5jZVJlZmVyZW5jZVNjaGVtYSwgSW5zdGFuY2VSZWZlcmVuY2UgfSBmcm9tICcuLi9saWIvaW5zdGFuY2UtcmVmZXJlbmNlJztcbmltcG9ydCB7IGRlY29kZVV1aWQgfSBmcm9tICcuLi9saWIvdXVpZC1jb21wYXQnO1xuaW1wb3J0IHsgQXNzZXRJbnRlcnByZXRlck1hbmFnZXIgfSBmcm9tICcuLi9hc3NldC1pbnRlcnByZXRlcnMvbWFuYWdlcic7XG5pbXBvcnQge1xuICAgIEltYWdlSW50ZXJwcmV0ZXIsIFRleHR1cmVJbnRlcnByZXRlciwgU3ByaXRlRnJhbWVJbnRlcnByZXRlcixcbiAgICBGYnhJbnRlcnByZXRlciwgTWF0ZXJpYWxJbnRlcnByZXRlciwgRWZmZWN0SW50ZXJwcmV0ZXIsXG4gICAgUGFydGljbGVJbnRlcnByZXRlciwgVW5rbm93bkludGVycHJldGVyLFxufSBmcm9tICcuLi9hc3NldC1pbnRlcnByZXRlcnMvc3BlY2lhbGl6ZWQnO1xuaW1wb3J0IHsgUHJvcGVydHlTZXRTcGVjIH0gZnJvbSAnLi4vYXNzZXQtaW50ZXJwcmV0ZXJzL2ludGVyZmFjZSc7XG5cbmZ1bmN0aW9uIGJ1aWxkTWFuYWdlcigpOiBBc3NldEludGVycHJldGVyTWFuYWdlciB7XG4gICAgY29uc3QgZmFsbGJhY2sgPSBuZXcgVW5rbm93bkludGVycHJldGVyKCk7XG4gICAgcmV0dXJuIG5ldyBBc3NldEludGVycHJldGVyTWFuYWdlcihcbiAgICAgICAgW1xuICAgICAgICAgICAgbmV3IEltYWdlSW50ZXJwcmV0ZXIoKSxcbiAgICAgICAgICAgIG5ldyBUZXh0dXJlSW50ZXJwcmV0ZXIoKSxcbiAgICAgICAgICAgIG5ldyBTcHJpdGVGcmFtZUludGVycHJldGVyKCksXG4gICAgICAgICAgICBuZXcgRmJ4SW50ZXJwcmV0ZXIoKSxcbiAgICAgICAgICAgIG5ldyBNYXRlcmlhbEludGVycHJldGVyKCksXG4gICAgICAgICAgICBuZXcgRWZmZWN0SW50ZXJwcmV0ZXIoKSxcbiAgICAgICAgICAgIG5ldyBQYXJ0aWNsZUludGVycHJldGVyKCksXG4gICAgICAgIF0sXG4gICAgICAgIGZhbGxiYWNrLFxuICAgICk7XG59XG5cbmludGVyZmFjZSBBc3NldFRhcmdldCB7XG4gICAgcmVmZXJlbmNlPzogSW5zdGFuY2VSZWZlcmVuY2U7XG4gICAgYXNzZXRVdWlkPzogc3RyaW5nO1xufVxuXG5hc3luYyBmdW5jdGlvbiByZXNvbHZlQXNzZXRJbmZvKHRhcmdldDogQXNzZXRUYXJnZXQpOiBQcm9taXNlPHsgYXNzZXRJbmZvOiBhbnkgfSB8IHsgZXJyb3I6IHN0cmluZyB9PiB7XG4gICAgLy8gdjIuNC40IHJldmlldyBmaXggKGdlbWluaSArIGNsYXVkZSk6IHN5bW1ldHJpYyB3aXRoIHJlc29sdmVSZWZlcmVuY2Unc1xuICAgIC8vIG1hbGZvcm1lZC1yZWZlcmVuY2UgZGV0ZWN0aW9uICh2Mi40LjEgLyB2Mi40LjIgZml4IGF0XG4gICAgLy8gc291cmNlL2xpYi9pbnN0YW5jZS1yZWZlcmVuY2UudHMpLiBBIGNhbGxlciBwYXNzaW5nXG4gICAgLy8gYHJlZmVyZW5jZToge31gIChubyBpZCkgcGx1cyBhIHZhbGlkIGFzc2V0VXVpZCB3b3VsZCBvdGhlcndpc2VcbiAgICAvLyBzaWxlbnRseSBmYWxsIGJhY2sgdG8gYXNzZXRVdWlkIOKAlCBtYXNrcyBpbnRlbnQuXG4gICAgaWYgKHRhcmdldC5yZWZlcmVuY2UgJiYgIXRhcmdldC5yZWZlcmVuY2UuaWQpIHtcbiAgICAgICAgcmV0dXJuIHsgZXJyb3I6ICdhc3NldC1tZXRhIHRvb2w6IHJlZmVyZW5jZS5pZCBpcyByZXF1aXJlZCB3aGVuIHJlZmVyZW5jZSBpcyBwcm92aWRlZCcgfTtcbiAgICB9XG4gICAgY29uc3QgcmF3VXVpZCA9IHRhcmdldC5yZWZlcmVuY2U/LmlkID8/IHRhcmdldC5hc3NldFV1aWQ7XG4gICAgaWYgKCFyYXdVdWlkKSB7XG4gICAgICAgIHJldHVybiB7IGVycm9yOiAnYXNzZXQtbWV0YSB0b29sOiBwcm92aWRlIHJlZmVyZW5jZT17aWQsdHlwZX0gb3IgYXNzZXRVdWlkJyB9O1xuICAgIH1cbiAgICBpZiAodGFyZ2V0LnJlZmVyZW5jZT8uaWQgJiYgdGFyZ2V0LmFzc2V0VXVpZCAmJiB0YXJnZXQucmVmZXJlbmNlLmlkICE9PSB0YXJnZXQuYXNzZXRVdWlkKSB7XG4gICAgICAgIHJldHVybiB7IGVycm9yOiBgYXNzZXQtbWV0YSB0b29sOiByZWZlcmVuY2UuaWQgKCR7dGFyZ2V0LnJlZmVyZW5jZS5pZH0pIGNvbmZsaWN0cyB3aXRoIGFzc2V0VXVpZCAoJHt0YXJnZXQuYXNzZXRVdWlkfSk7IHBhc3Mgb25seSBvbmVgIH07XG4gICAgfVxuICAgIC8vIHYyLjYuMCBULVYyNi1idW5kbGU6IGNvY29zIHN1Yi1hc3NldCBVVUlEcyB1c2UgYDx1dWlkPkA8c3ViLWtleT5gLlxuICAgIC8vIFNvbWUgY2xpZW50cyBiYXNlNjQtZW5jb2RlIGBAYC1jb250YWluaW5nIHN0cmluZ3MgdG8gZG9kZ2Ugd2lyZVxuICAgIC8vIG1hbmdsaW5nIOKAlCBkZWNvZGUgaGVyZSBzbyBib3RoIGZvcm1zIHJlYWNoIHF1ZXJ5LWFzc2V0LWluZm8gYXMgdGhlXG4gICAgLy8gcmF3IGNvY29zIGZvcm1hdC4gUGxhaW4gVVVJRHMgcGFzcyB0aHJvdWdoIHVuY2hhbmdlZC5cbiAgICBjb25zdCB1dWlkID0gZGVjb2RlVXVpZChyYXdVdWlkKTtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCBpbmZvID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXQtaW5mbycsIHV1aWQpO1xuICAgICAgICBpZiAoIWluZm8pIHJldHVybiB7IGVycm9yOiBgQXNzZXQgbm90IGZvdW5kOiAke3V1aWR9YCB9O1xuICAgICAgICByZXR1cm4geyBhc3NldEluZm86IGluZm8gfTtcbiAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICByZXR1cm4geyBlcnJvcjogYHF1ZXJ5LWFzc2V0LWluZm8gZmFpbGVkIGZvciAke3V1aWR9OiAke2Vycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKX1gIH07XG4gICAgfVxufVxuXG5jb25zdCBhc3NldFRhcmdldFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgICByZWZlcmVuY2U6IGluc3RhbmNlUmVmZXJlbmNlU2NoZW1hLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0luc3RhbmNlUmVmZXJlbmNlIHtpZCx0eXBlfS4gUHJlZmVycmVkIGZvcm0uIHR5cGUgbWF5IGJlIFwiYXNzZXQ6Y2MuSW1hZ2VBc3NldFwiIGV0Yy4sIGRpYWdub3N0aWMgb25seS4nKSxcbiAgICBhc3NldFV1aWQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnQXNzZXQgVVVJRC4gVXNlZCB3aGVuIHJlZmVyZW5jZSBpcyBvbWl0dGVkLicpLFxufSk7XG5cbmV4cG9ydCBjbGFzcyBBc3NldE1ldGFUb29scyBpbXBsZW1lbnRzIFRvb2xFeGVjdXRvciB7XG4gICAgcHJpdmF0ZSByZWFkb25seSBleGVjOiBUb29sRXhlY3V0b3I7XG4gICAgcHJpdmF0ZSByZWFkb25seSBtYW5hZ2VyOiBBc3NldEludGVycHJldGVyTWFuYWdlcjtcblxuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICB0aGlzLm1hbmFnZXIgPSBidWlsZE1hbmFnZXIoKTtcbiAgICAgICAgdGhpcy5leGVjID0gZGVmaW5lVG9vbHNGcm9tRGVjb3JhdG9ycyh0aGlzKTtcbiAgICB9XG5cbiAgICBnZXRUb29scygpOiBUb29sRGVmaW5pdGlvbltdIHsgcmV0dXJuIHRoaXMuZXhlYy5nZXRUb29scygpOyB9XG4gICAgZXhlY3V0ZSh0b29sTmFtZTogc3RyaW5nLCBhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4geyByZXR1cm4gdGhpcy5leGVjLmV4ZWN1dGUodG9vbE5hbWUsIGFyZ3MpOyB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdsaXN0X2ludGVycHJldGVycycsXG4gICAgICAgIHRpdGxlOiAnTGlzdCBhc3NldCBpbnRlcnByZXRlcnMnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ0xpc3QgdGhlIGFzc2V0IGltcG9ydGVyIHR5cGVzIHRoaXMgc2VydmVyIGhhcyBzcGVjaWFsaXplZCBpbnRlcnByZXRlcnMgZm9yLiBUaGUgXCIqXCIgZW50cnkgaXMgdGhlIHJlYWQtb25seSBmYWxsYmFjayB1c2VkIGZvciBhbnkgaW1wb3J0ZXIgbm90IGluIHRoZSBsaXN0LiBVc2UgdG8gcGxhbiBhc3NldE1ldGFfc2V0X3Byb3BlcnRpZXMgY2FsbHMg4oCUIHdyaXRlcyBhZ2FpbnN0IHRoZSBmYWxsYmFjayBhbHdheXMgcmVqZWN0LiBObyBzaWRlIGVmZmVjdHMuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSxcbiAgICB9KVxuICAgIGFzeW5jIGxpc3RJbnRlcnByZXRlcnMoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgaW1wb3J0ZXJUeXBlczogdGhpcy5tYW5hZ2VyLmxpc3RJbXBvcnRlclR5cGVzKCksXG4gICAgICAgICAgICAgICAgZmFsbGJhY2tCZWhhdmlvdXI6ICdVbmtub3duSW50ZXJwcmV0ZXIgcmVqZWN0cyB3cml0ZXM7IHJlYWRzIHdvcmsgYXMgYmVzdC1lZmZvcnQgbWV0YS51c2VyRGF0YSBkdW1wLicsXG4gICAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ2dldF9wcm9wZXJ0aWVzJyxcbiAgICAgICAgdGl0bGU6ICdSZWFkIGFzc2V0IG1ldGEgcHJvcGVydGllcycsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnUmVhZCBhbiBhc3NldFxcJ3MgbWV0YSArIHN1Yi1tZXRhIHVzZXJEYXRhIHZpYSBpdHMgaW1wb3J0ZXItc3BlY2lmaWMgaW50ZXJwcmV0ZXIuIFJldHVybnMge3Byb3BlcnRpZXM6IHtwYXRoOiB7dHlwZSwgdmFsdWUsIHRvb2x0aXA/LCBlbnVtTGlzdD99fSwgYXJyYXlzOiB7cGF0aDoge3R5cGV9fX0uIFVzZSBCRUZPUkUgYXNzZXRNZXRhX3NldF9wcm9wZXJ0aWVzIHNvIEFJIHNlZXMgdGhlIHJlYWwgcHJvcGVydHkgbmFtZXMgKyB0eXBlcyBpbnN0ZWFkIG9mIGd1ZXNzaW5nLiBQYWlyIGBpbmNsdWRlVG9vbHRpcHM6IHRydWVgIHdoZW4gQUkgbmVlZHMgY29udGV4dCBmb3IgdW5mYW1pbGlhciBpbXBvcnRlcnMuIE5vdGU6IHVzZUFkdmFuY2VkSW5zcGVjdGlvbiBpcyByZXNlcnZlZCDigJQgZnVsbCBtYXRlcmlhbCBlZGl0aW5nIGlzIGRlZmVycmVkIHRvIHYyLjUrLCBzbyB0aGUgZmxhZyBoYXMgbm8gZWZmZWN0IGluIHYyLjQueC4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogYXNzZXRUYXJnZXRTY2hlbWEuZXh0ZW5kKHtcbiAgICAgICAgICAgIGluY2x1ZGVUb29sdGlwczogei5ib29sZWFuKCkuZGVmYXVsdChmYWxzZSkuZGVzY3JpYmUoJ0luY2x1ZGUgaTE4bi1yZXNvbHZlZCB0b29sdGlwIHRleHQgZm9yIGVhY2ggcHJvcGVydHkuIFNsb3dlcjsgb25seSByZXF1ZXN0IHdoZW4gQUkgaXMgZXhwbG9yaW5nIGFuIHVuZmFtaWxpYXIgaW1wb3J0ZXIuJyksXG4gICAgICAgICAgICB1c2VBZHZhbmNlZEluc3BlY3Rpb246IHouYm9vbGVhbigpLmRlZmF1bHQoZmFsc2UpLmRlc2NyaWJlKCdSZXNlcnZlZCBmb3IgdjIuNSsuIEhhcyBubyBlZmZlY3QgaW4gdjIuNC54IGJlY2F1c2UgdGhlIG9ubHkgY29uc3VtZXIgKE1hdGVyaWFsSW50ZXJwcmV0ZXIgYWR2YW5jZWQgZWRpdGluZykgaXMgZGVmZXJyZWQgdW50aWwgdGhlIHNjZW5lL2FwcGx5LW1hdGVyaWFsICsgVVVJRC1wcmVwcm9jZXNzaW5nIGxheWVyIGlzIHBvcnRlZC4gUGFzcyBmYWxzZSB1bnRpbCB2Mi41IGxhbmRzLicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIGdldFByb3BlcnRpZXMoYXJnczogQXNzZXRUYXJnZXQgJiB7IGluY2x1ZGVUb29sdGlwcz86IGJvb2xlYW47IHVzZUFkdmFuY2VkSW5zcGVjdGlvbj86IGJvb2xlYW4gfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHJlc29sdmVkID0gYXdhaXQgcmVzb2x2ZUFzc2V0SW5mbyhhcmdzKTtcbiAgICAgICAgaWYgKCdlcnJvcicgaW4gcmVzb2x2ZWQpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogcmVzb2x2ZWQuZXJyb3IgfTtcbiAgICAgICAgY29uc3QgZGVzY3JpcHRpb24gPSBhd2FpdCB0aGlzLm1hbmFnZXIuZ2V0QXNzZXRQcm9wZXJ0aWVzKFxuICAgICAgICAgICAgcmVzb2x2ZWQuYXNzZXRJbmZvLFxuICAgICAgICAgICAgYXJncy5pbmNsdWRlVG9vbHRpcHMgPz8gZmFsc2UsXG4gICAgICAgICAgICBhcmdzLnVzZUFkdmFuY2VkSW5zcGVjdGlvbiA/PyBmYWxzZSxcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKGRlc2NyaXB0aW9uLmVycm9yKSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGRlc2NyaXB0aW9uLmVycm9yLCBkYXRhOiBkZXNjcmlwdGlvbiB9O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IGRlc2NyaXB0aW9uIH07XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnc2V0X3Byb3BlcnRpZXMnLFxuICAgICAgICB0aXRsZTogJ1dyaXRlIGFzc2V0IG1ldGEgcHJvcGVydGllcycsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnQmF0Y2gtd3JpdGUgYXNzZXQgbWV0YSBmaWVsZHMuIEVhY2ggZW50cnkgaXMge3Byb3BlcnR5UGF0aCwgcHJvcGVydHlUeXBlLCBwcm9wZXJ0eVZhbHVlfTsgdGhlIGludGVycHJldGVyIHZhbGlkYXRlcyB0aGUgcGF0aCBhZ2FpbnN0IGFuIGFsbG93LWxpc3QgKHVzZXJEYXRhLiosIHN1Yk1ldGFzLiosIHBsYXRmb3JtU2V0dGluZ3MuKikgYW5kIHJlamVjdHMgdW5rbm93biByb290cywgcHJvdG90eXBlLXBvbGx1dGlvbiBzZWdtZW50cyAoX19wcm90b19fLCBjb25zdHJ1Y3RvciwgcHJvdG90eXBlKSwgYW5kIGVtcHR5IHNlZ21lbnRzLiBPbiBjb21taXQgdGhlIGludGVycHJldGVyIGNhbGxzIGFzc2V0LWRiIHNhdmUtYXNzZXQtbWV0YSArIHJlZnJlc2gtYXNzZXQgc28gY29jb3MgcmUtaW1wb3J0cyB3aXRoIHRoZSBuZXcgc2V0dGluZ3MuIFVzZSBhZnRlciBhc3NldE1ldGFfZ2V0X3Byb3BlcnRpZXMgdG8gZW5zdXJlIHBhdGhzL3R5cGVzIGFyZSBjb3JyZWN0LiBSZXR1cm5zIHBlci1lbnRyeSBzdWNjZXNzL2Vycm9yIHNvIHBhcnRpYWwgZmFpbHVyZXMgYXJlIHZpc2libGU7IGVudHJpZXMgdGhhdCBzdWNjZWVkZWQgb24gZGlzayBidXQgZmFpbGVkIHJlLWltcG9ydCBjYXJyeSBhIGB3YXJuaW5nYCBmaWVsZCBpbnN0ZWFkIG9mIGJlaW5nIGZsaXBwZWQgdG8gZmFpbHVyZS4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogYXNzZXRUYXJnZXRTY2hlbWEuZXh0ZW5kKHtcbiAgICAgICAgICAgIHByb3BlcnRpZXM6IHouYXJyYXkoei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgIHByb3BlcnR5UGF0aDogei5zdHJpbmcoKS5kZXNjcmliZSgnRG90dGVkIG1ldGEgcGF0aC4gQWxsb3dlZCByb290czogdXNlckRhdGEuKiwgc3ViTWV0YXMuKiwgcGxhdGZvcm1TZXR0aW5ncy4qLiBGb3JiaWRkZW4gc2VnbWVudHMgYW55d2hlcmUgaW4gdGhlIHBhdGg6IF9fcHJvdG9fXywgY29uc3RydWN0b3IsIHByb3RvdHlwZS4nKSxcbiAgICAgICAgICAgICAgICBwcm9wZXJ0eVR5cGU6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1R5cGUgdGFnIGZvciB2YWx1ZSBjb2VyY2lvbjogQm9vbGVhbiAoYWNjZXB0cyB0cnVlL2ZhbHNlLzEvMCBzdHJpbmdzKSwgTnVtYmVyL0Zsb2F0IChyZWplY3RzIE5hTiksIEludGVnZXIgKHJlamVjdHMgTmFOKSwgU3RyaW5nLCBFbnVtLCBjYy5WYWx1ZVR5cGUsIGNjLk9iamVjdC4nKSxcbiAgICAgICAgICAgICAgICBwcm9wZXJ0eVZhbHVlOiB6LmFueSgpLmRlc2NyaWJlKCdSYXcgdmFsdWU7IGNvZXJjZWQgcGVyIHByb3BlcnR5VHlwZS4nKSxcbiAgICAgICAgICAgIH0pKS5taW4oMSkubWF4KDUwKS5kZXNjcmliZSgnUHJvcGVydHkgd3JpdGVzLiBDYXBwZWQgYXQgNTAgcGVyIGNhbGwuJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgc2V0UHJvcGVydGllcyhhcmdzOiBBc3NldFRhcmdldCAmIHsgcHJvcGVydGllczogUHJvcGVydHlTZXRTcGVjW10gfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHJlc29sdmVkID0gYXdhaXQgcmVzb2x2ZUFzc2V0SW5mbyhhcmdzKTtcbiAgICAgICAgaWYgKCdlcnJvcicgaW4gcmVzb2x2ZWQpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogcmVzb2x2ZWQuZXJyb3IgfTtcbiAgICAgICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMubWFuYWdlci5zZXRBc3NldFByb3BlcnRpZXMocmVzb2x2ZWQuYXNzZXRJbmZvLCBhcmdzLnByb3BlcnRpZXMpO1xuICAgICAgICBjb25zdCBmYWlsZWQgPSByZXN1bHRzLmZpbHRlcihyID0+ICFyLnN1Y2Nlc3MpO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgc3VjY2VzczogZmFpbGVkLmxlbmd0aCA9PT0gMCxcbiAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICBhc3NldFV1aWQ6IHJlc29sdmVkLmFzc2V0SW5mby51dWlkLFxuICAgICAgICAgICAgICAgIGltcG9ydGVyOiByZXNvbHZlZC5hc3NldEluZm8uaW1wb3J0ZXIsXG4gICAgICAgICAgICAgICAgdG90YWw6IHJlc3VsdHMubGVuZ3RoLFxuICAgICAgICAgICAgICAgIGZhaWxlZENvdW50OiBmYWlsZWQubGVuZ3RoLFxuICAgICAgICAgICAgICAgIHJlc3VsdHMsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgbWVzc2FnZTogZmFpbGVkLmxlbmd0aCA9PT0gMFxuICAgICAgICAgICAgICAgID8gYFdyb3RlICR7cmVzdWx0cy5sZW5ndGh9IGFzc2V0LW1ldGEgcHJvcGVydGllc2BcbiAgICAgICAgICAgICAgICA6IGAke2ZhaWxlZC5sZW5ndGh9LyR7cmVzdWx0cy5sZW5ndGh9IGFzc2V0LW1ldGEgd3JpdGVzIGZhaWxlZGAsXG4gICAgICAgIH07XG4gICAgfVxufVxuIl19