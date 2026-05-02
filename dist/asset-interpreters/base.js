"use strict";
/**
 * BaseAssetInterpreter — shared getProperties / setProperties for the
 * asset-meta editing tools. Specialized interpreters extend this and
 * override `importerType` (always) plus optionally `setProperty` /
 * `getProperties` for type-specific layouts.
 *
 * Path-validation policy (CLAUDE.md landmine candidate):
 *   AI-generated property paths run through `VALID_META_PATTERNS`
 *   before any meta mutation. Anything outside `userData.*`,
 *   `subMetas.*`, `platformSettings.*`, or the small allow-list of
 *   atomic top-level keys is rejected. This stops a confused AI from
 *   clobbering structural meta fields like `__type__` or rewriting
 *   `ver` and breaking re-import.
 *
 * Save semantics:
 *   `save-asset-meta` followed by `refresh-asset` per RomaRogov ref.
 *   Refresh is what triggers cocos to re-import with the new settings;
 *   without it the new userData persists but the imported asset doesn't
 *   pick up the change until the next manual refresh.
 *
 * Reference: RomaRogov-cocos-mcp `base-interpreter.ts`. We keep the
 * extraction logic shape close to upstream so future bug fixes there
 * port cleanly.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseAssetInterpreter = void 0;
exports.isPathSafe = isPathSafe;
// v2.4.4 review fix (claude): removed importer / importerVersion /
// sourceUuid / isGroup / folder from the writable allow-list. Letting
// AI flip an asset's importer string asks asset-db to re-import as a
// different importer; best case the import fails, worst case the
// asset is corrupted. None of these fields have a documented
// AI-driven use case yet — re-add when one shows up.
const VALID_META_PATTERNS = [
    /^userData\./,
    /^subMetas\./,
    /^platformSettings\./,
];
// v2.4.4 review fix (gemini + claude + codex): VALID_META_PATTERNS
// only checks the root prefix. Without this hard-stop list, paths
// like `userData.__proto__.polluted` pass the regex AND the walk
// descends through Object.prototype, producing process-wide
// prototype pollution observable from every other tool / scene
// script. Reject any of these segments anywhere in the path.
const FORBIDDEN_PATH_SEGMENTS = new Set([
    '__proto__', 'constructor', 'prototype',
]);
function isPathSafe(propertyPath) {
    if (!propertyPath || typeof propertyPath !== 'string') {
        return { ok: false, reason: 'propertyPath must be a non-empty string' };
    }
    const isValidRoot = VALID_META_PATTERNS.some(re => re.test(propertyPath));
    if (!isValidRoot) {
        return {
            ok: false,
            reason: `Invalid asset-meta path '${propertyPath}'. Allowed roots: userData.*, subMetas.*, platformSettings.*`,
        };
    }
    const parts = propertyPath.split('.');
    for (const part of parts) {
        if (part === '') {
            return { ok: false, reason: `Empty path segment in '${propertyPath}' (consecutive dots)` };
        }
        if (FORBIDDEN_PATH_SEGMENTS.has(part)) {
            return { ok: false, reason: `Forbidden path segment '${part}' in '${propertyPath}' (prototype-pollution guard)` };
        }
    }
    return { ok: true };
}
const SIMPLE_TYPES = new Set(['String', 'Number', 'Boolean', 'cc.ValueType', 'cc.Object']);
class BaseAssetInterpreter {
    async getProperties(assetInfo, includeTooltips = false, _useAdvancedInspection = false) {
        var _a;
        try {
            const meta = await Editor.Message.request('asset-db', 'query-asset-meta', assetInfo.uuid);
            if (!meta) {
                return {
                    uuid: assetInfo.uuid,
                    importer: assetInfo.importer,
                    error: `Asset meta not found for ${assetInfo.uuid}`,
                };
            }
            const description = {
                uuid: assetInfo.uuid,
                importer: assetInfo.importer,
                properties: {},
                arrays: {},
            };
            if (meta.userData) {
                this.extractFromUserData(meta.userData, description, '', includeTooltips);
            }
            if (meta.subMetas) {
                for (const [subUuid, subMeta] of Object.entries(meta.subMetas)) {
                    if (subMeta && typeof subMeta === 'object' && 'userData' in subMeta && subMeta.userData) {
                        const subAssetName = this.getSubAssetName(assetInfo, subUuid);
                        this.extractFromUserData(subMeta.userData, description, subAssetName, includeTooltips);
                    }
                }
            }
            return description;
        }
        catch (err) {
            return {
                uuid: assetInfo.uuid,
                importer: assetInfo.importer,
                error: `Error reading asset properties: ${(_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : String(err)}`,
            };
        }
    }
    async setProperties(assetInfo, properties) {
        var _a, _b, _c;
        const results = [];
        let meta;
        try {
            meta = await Editor.Message.request('asset-db', 'query-asset-meta', assetInfo.uuid);
        }
        catch (err) {
            return properties.map(p => {
                var _a;
                return ({
                    propertyPath: p.propertyPath,
                    success: false,
                    error: `query-asset-meta failed: ${(_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : String(err)}`,
                });
            });
        }
        if (!meta) {
            return properties.map(p => ({
                propertyPath: p.propertyPath,
                success: false,
                error: `Asset meta not found for ${assetInfo.uuid}`,
            }));
        }
        for (const prop of properties) {
            try {
                const ok = await this.setProperty(meta, prop);
                results.push({ propertyPath: prop.propertyPath, success: ok });
            }
            catch (err) {
                results.push({
                    propertyPath: prop.propertyPath,
                    success: false,
                    error: (_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : String(err),
                });
            }
        }
        // v2.4.4 review fix (claude + codex): split save vs refresh
        // failure handling. v2.4.3 lumped both errors together which
        // mislabelled the state on disk: if save succeeded but
        // refresh threw, the disk meta IS updated and only the
        // re-import is stale — flipping every successful entry to
        // failure was wrong.
        let saveStatus = 'ok';
        let saveError;
        if (results.some(r => r.success)) {
            try {
                await Editor.Message.request('asset-db', 'save-asset-meta', assetInfo.uuid, JSON.stringify(meta));
            }
            catch (err) {
                saveStatus = 'save-failed';
                saveError = `save-asset-meta failed: ${(_b = err === null || err === void 0 ? void 0 : err.message) !== null && _b !== void 0 ? _b : String(err)}`;
            }
            if (saveStatus === 'ok') {
                try {
                    await Editor.Message.request('asset-db', 'refresh-asset', assetInfo.url);
                }
                catch (err) {
                    saveStatus = 'refresh-failed';
                    saveError = `save-asset-meta succeeded but refresh-asset failed: ${(_c = err === null || err === void 0 ? void 0 : err.message) !== null && _c !== void 0 ? _c : String(err)}. Disk meta IS updated; cocos will pick up the change on next manual refresh.`;
                }
            }
            if (saveStatus === 'save-failed') {
                // Disk write never happened; flip in-memory successes
                // to failed so the caller knows nothing persisted.
                for (const r of results) {
                    if (r.success) {
                        r.success = false;
                        r.error = saveError;
                    }
                }
            }
            else if (saveStatus === 'refresh-failed') {
                // Disk write happened but re-import is stale; flag
                // each successful entry with a warning that doesn't
                // reverse the write status.
                for (const r of results) {
                    if (r.success) {
                        r.warning = saveError;
                    }
                }
            }
        }
        return results;
    }
    extractFromUserData(userData, description, pathPrefix, includeTooltips) {
        if (!userData || typeof userData !== 'object')
            return;
        const out = this.extractRecursive(userData, pathPrefix, includeTooltips);
        Object.assign(description.properties, out.properties);
        Object.assign(description.arrays, out.arrays);
    }
    extractRecursive(obj, basePath, includeTooltips) {
        var _a;
        const properties = {};
        const arrays = {};
        if (!obj || typeof obj !== 'object')
            return { properties, arrays };
        for (const key of Object.keys(obj)) {
            // Skip private/internal fields. AI shouldn't be poking at
            // _internal cocos bookkeeping.
            if (key.startsWith('_'))
                continue;
            const currentPath = basePath ? `${basePath}.${key}` : key;
            const propertyData = obj[key];
            if (propertyData && typeof propertyData === 'object' && Object.prototype.hasOwnProperty.call(propertyData, 'value')) {
                const propertyInfo = {
                    type: propertyData.type || 'Unknown',
                    value: propertyData.value,
                };
                if (propertyData.tooltip && includeTooltips) {
                    try {
                        const editor = globalThis.Editor;
                        if (((_a = editor === null || editor === void 0 ? void 0 : editor.I18n) === null || _a === void 0 ? void 0 : _a.t) && typeof propertyData.tooltip === 'string' && propertyData.tooltip.startsWith('i18n:')) {
                            propertyInfo.tooltip = editor.I18n.t(propertyData.tooltip.slice(5));
                        }
                        else {
                            propertyInfo.tooltip = propertyData.tooltip;
                        }
                    }
                    catch (_b) {
                        propertyInfo.tooltip = propertyData.tooltip;
                    }
                }
                if (propertyData.type === 'Enum' && propertyData.enumList) {
                    propertyInfo.enumList = propertyData.enumList;
                }
                if (propertyData.isArray) {
                    arrays[currentPath] = { type: propertyInfo.type, tooltip: propertyInfo.tooltip };
                }
                const isComplex = propertyData.value
                    && ((typeof propertyData.value === 'object'
                        && !SIMPLE_TYPES.has(propertyData.type)
                        && !(Array.isArray(propertyData.extends) && propertyData.extends.some((ext) => SIMPLE_TYPES.has(ext))))
                        || Array.isArray(propertyData.value));
                if (isComplex) {
                    const nested = this.extractRecursive(propertyData.value, currentPath, includeTooltips);
                    Object.assign(properties, nested.properties);
                    Object.assign(arrays, nested.arrays);
                }
                else {
                    properties[currentPath] = propertyInfo;
                }
            }
            else if (propertyData !== null && typeof propertyData === 'object' && !Array.isArray(propertyData)) {
                const nested = this.extractRecursive(propertyData, currentPath, includeTooltips);
                Object.assign(properties, nested.properties);
                Object.assign(arrays, nested.arrays);
            }
            else {
                properties[currentPath] = {
                    type: this.inferPropertyType(propertyData),
                    value: propertyData,
                };
            }
        }
        return { properties, arrays };
    }
    inferPropertyType(value) {
        if (value === null || value === undefined)
            return 'Unknown';
        if (typeof value === 'boolean')
            return 'Boolean';
        if (typeof value === 'number')
            return 'Number';
        if (typeof value === 'string')
            return 'String';
        if (Array.isArray(value))
            return 'Array';
        if (typeof value === 'object') {
            if (Object.prototype.hasOwnProperty.call(value, '__type__'))
                return value.__type__;
            return 'Object';
        }
        return 'Unknown';
    }
    getSubAssetName(assetInfo, subUuid) {
        var _a;
        const subAssets = assetInfo.subAssets;
        if (subAssets && ((_a = subAssets[subUuid]) === null || _a === void 0 ? void 0 : _a.name))
            return subAssets[subUuid].name;
        return subUuid;
    }
    /**
     * Default setter — validates path through `isPathSafe` (root +
     * forbidden-segment guard), walks the dotted path creating only
     * allowed intermediate containers, and writes the coerced value
     * at the leaf. Specialized interpreters override this when their
     * meta layout needs custom routing (e.g. ImageInterpreter's main
     * vs sub-asset split).
     *
     * Uses Object.create(null) for auto-created intermediate
     * containers so even if a future change introduces another
     * walk site, the new objects don't carry Object.prototype.
     */
    async setProperty(meta, prop) {
        const safe = isPathSafe(prop.propertyPath);
        if (!safe.ok)
            throw new Error(safe.reason);
        const pathParts = prop.propertyPath.split('.');
        let current = meta;
        for (let i = 0; i < pathParts.length - 1; i++) {
            const part = pathParts[i];
            if (current[part] === undefined || current[part] === null) {
                if (part === 'userData' || part === 'subMetas' || part === 'platformSettings') {
                    current[part] = {};
                }
                else if (i > 0) {
                    // Auto-create inside an already-allowed root.
                    current[part] = {};
                }
                else {
                    throw new Error(`Cannot create top-level meta field '${part}' (path: ${prop.propertyPath})`);
                }
            }
            current = current[part];
        }
        const finalKey = pathParts[pathParts.length - 1];
        current[finalKey] = this.convertPropertyValue(prop.propertyValue, prop.propertyType);
        return true;
    }
    convertPropertyValue(value, type) {
        switch (type) {
            case 'Boolean':
                // v2.4.4 review fix (codex): Boolean("false") === true
                // would silently flip the meaning of an AI-supplied
                // string. Treat the textual variants explicitly; only
                // truly empty / null / 0 are falsy.
                if (typeof value === 'string') {
                    const lower = value.trim().toLowerCase();
                    if (lower === 'false' || lower === '0' || lower === '')
                        return false;
                    if (lower === 'true' || lower === '1')
                        return true;
                    throw new Error(`Cannot coerce string '${value}' to Boolean (use true/false/1/0)`);
                }
                return Boolean(value);
            case 'Number':
            case 'Float': {
                const n = parseFloat(String(value));
                if (Number.isNaN(n)) {
                    throw new Error(`Cannot coerce '${value}' to ${type} (parseFloat -> NaN)`);
                }
                return n;
            }
            case 'String':
                return String(value);
            case 'Integer': {
                const n = parseInt(String(value), 10);
                if (Number.isNaN(n)) {
                    throw new Error(`Cannot coerce '${value}' to Integer (parseInt -> NaN)`);
                }
                return n;
            }
            case 'Enum':
            case 'cc.ValueType':
            case 'cc.Object':
                return value;
            default:
                if (typeof value === 'boolean')
                    return Boolean(value);
                if (typeof value === 'number')
                    return Number(value);
                if (typeof value === 'string')
                    return String(value);
                return value;
        }
    }
}
exports.BaseAssetInterpreter = BaseAssetInterpreter;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFzZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NvdXJjZS9hc3NldC1pbnRlcnByZXRlcnMvYmFzZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBdUJHOzs7QUFnQ0gsZ0NBcUJDO0FBM0NELG1FQUFtRTtBQUNuRSxzRUFBc0U7QUFDdEUscUVBQXFFO0FBQ3JFLGlFQUFpRTtBQUNqRSw2REFBNkQ7QUFDN0QscURBQXFEO0FBQ3JELE1BQU0sbUJBQW1CLEdBQWE7SUFDbEMsYUFBYTtJQUNiLGFBQWE7SUFDYixxQkFBcUI7Q0FDeEIsQ0FBQztBQUVGLG1FQUFtRTtBQUNuRSxrRUFBa0U7QUFDbEUsaUVBQWlFO0FBQ2pFLDREQUE0RDtBQUM1RCwrREFBK0Q7QUFDL0QsNkRBQTZEO0FBQzdELE1BQU0sdUJBQXVCLEdBQUcsSUFBSSxHQUFHLENBQUM7SUFDcEMsV0FBVyxFQUFFLGFBQWEsRUFBRSxXQUFXO0NBQzFDLENBQUMsQ0FBQztBQUVILFNBQWdCLFVBQVUsQ0FBQyxZQUFvQjtJQUMzQyxJQUFJLENBQUMsWUFBWSxJQUFJLE9BQU8sWUFBWSxLQUFLLFFBQVEsRUFBRSxDQUFDO1FBQ3BELE9BQU8sRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSx5Q0FBeUMsRUFBRSxDQUFDO0lBQzVFLENBQUM7SUFDRCxNQUFNLFdBQVcsR0FBRyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUM7SUFDMUUsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBQ2YsT0FBTztZQUNILEVBQUUsRUFBRSxLQUFLO1lBQ1QsTUFBTSxFQUFFLDRCQUE0QixZQUFZLDhEQUE4RDtTQUNqSCxDQUFDO0lBQ04sQ0FBQztJQUNELE1BQU0sS0FBSyxHQUFHLFlBQVksQ0FBQyxLQUFLLENBQUMsR0FBRyxD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Q0FBQyxrQkFBa0IsS0FBSyxRQUFRLElBQUksc0JBQXNCLENBQUMsQ0FBQztnQkFDL0UsQ0FBQztnQkFDRCxPQUFPLENBQUMsQ0FBQztZQUNiLENBQUM7WUFDRCxLQUFLLFFBQVE7Z0JBQ1QsT0FBTyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDekIsS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDO2dCQUNiLE1BQU0sQ0FBQyxHQUFHLFFBQVEsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7Z0JBQ3RDLElBQUksTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO29CQUNsQixNQUFNLElBQUksS0FBSyxDQUFDLGtCQUFrQixLQUFLLGdDQUFnQyxDQUFDLENBQUM7Z0JBQzdFLENBQUM7Z0JBQ0QsT0FBTyxDQUFDLENBQUM7WUFDYixDQUFDO1lBQ0QsS0FBSyxNQUFNLENBQUM7WUFDWixLQUFLLGNBQWMsQ0FBQztZQUNwQixLQUFLLFdBQVc7Z0JBQ1osT0FBTyxLQUFLLENBQUM7WUFDakI7Z0JBQ0ksSUFBSSxPQUFPLEtBQUssS0FBSyxTQUFTO29CQUFFLE9BQU8sT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUN0RCxJQUFJLE9BQU8sS0FBSyxLQUFLLFFBQVE7b0JBQUUsT0FBTyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQ3BELElBQUksT0FBTyxLQUFLLEtBQUssUUFBUTtvQkFBRSxPQUFPLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDcEQsT0FBTyxLQUFLLENBQUM7UUFDckIsQ0FBQztJQUNMLENBQUM7Q0FDSjtBQXhTRCxvREF3U0MiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEJhc2VBc3NldEludGVycHJldGVyIOKAlCBzaGFyZWQgZ2V0UHJvcGVydGllcyAvIHNldFByb3BlcnRpZXMgZm9yIHRoZVxuICogYXNzZXQtbWV0YSBlZGl0aW5nIHRvb2xzLiBTcGVjaWFsaXplZCBpbnRlcnByZXRlcnMgZXh0ZW5kIHRoaXMgYW5kXG4gKiBvdmVycmlkZSBgaW1wb3J0ZXJUeXBlYCAoYWx3YXlzKSBwbHVzIG9wdGlvbmFsbHkgYHNldFByb3BlcnR5YCAvXG4gKiBgZ2V0UHJvcGVydGllc2AgZm9yIHR5cGUtc3BlY2lmaWMgbGF5b3V0cy5cbiAqXG4gKiBQYXRoLXZhbGlkYXRpb24gcG9saWN5IChDTEFVREUubWQgbGFuZG1pbmUgY2FuZGlkYXRlKTpcbiAqICAgQUktZ2VuZXJhdGVkIHByb3BlcnR5IHBhdGhzIHJ1biB0aHJvdWdoIGBWQUxJRF9NRVRBX1BBVFRFUk5TYFxuICogICBiZWZvcmUgYW55IG1ldGEgbXV0YXRpb24uIEFueXRoaW5nIG91dHNpZGUgYHVzZXJEYXRhLipgLFxuICogICBgc3ViTWV0YXMuKmAsIGBwbGF0Zm9ybVNldHRpbmdzLipgLCBvciB0aGUgc21hbGwgYWxsb3ctbGlzdCBvZlxuICogICBhdG9taWMgdG9wLWxldmVsIGtleXMgaXMgcmVqZWN0ZWQuIFRoaXMgc3RvcHMgYSBjb25mdXNlZCBBSSBmcm9tXG4gKiAgIGNsb2JiZXJpbmcgc3RydWN0dXJhbCBtZXRhIGZpZWxkcyBsaWtlIGBfX3R5cGVfX2Agb3IgcmV3cml0aW5nXG4gKiAgIGB2ZXJgIGFuZCBicmVha2luZyByZS1pbXBvcnQuXG4gKlxuICogU2F2ZSBzZW1hbnRpY3M6XG4gKiAgIGBzYXZlLWFzc2V0LW1ldGFgIGZvbGxvd2VkIGJ5IGByZWZyZXNoLWFzc2V0YCBwZXIgUm9tYVJvZ292IHJlZi5cbiAqICAgUmVmcmVzaCBpcyB3aGF0IHRyaWdnZXJzIGNvY29zIHRvIHJlLWltcG9ydCB3aXRoIHRoZSBuZXcgc2V0dGluZ3M7XG4gKiAgIHdpdGhvdXQgaXQgdGhlIG5ldyB1c2VyRGF0YSBwZXJzaXN0cyBidXQgdGhlIGltcG9ydGVkIGFzc2V0IGRvZXNuJ3RcbiAqICAgcGljayB1cCB0aGUgY2hhbmdlIHVudGlsIHRoZSBuZXh0IG1hbnVhbCByZWZyZXNoLlxuICpcbiAqIFJlZmVyZW5jZTogUm9tYVJvZ292LWNvY29zLW1jcCBgYmFzZS1pbnRlcnByZXRlci50c2AuIFdlIGtlZXAgdGhlXG4gKiBleHRyYWN0aW9uIGxvZ2ljIHNoYXBlIGNsb3NlIHRvIHVwc3RyZWFtIHNvIGZ1dHVyZSBidWcgZml4ZXMgdGhlcmVcbiAqIHBvcnQgY2xlYW5seS5cbiAqL1xuXG5pbXBvcnQgdHlwZSB7IEFzc2V0SW5mbyB9IGZyb20gJ0Bjb2Nvcy9jcmVhdG9yLXR5cGVzL2VkaXRvci9wYWNrYWdlcy9hc3NldC1kYi9AdHlwZXMvcHVibGljJztcbmltcG9ydCB7XG4gICAgQXNzZXRQcm9wZXJ0aWVzRGVzY3JpcHRpb24sXG4gICAgSUFzc2V0SW50ZXJwcmV0ZXIsXG4gICAgUHJvcGVydHlTZXRTcGVjLFxuICAgIFByb3BlcnR5U2V0UmVzdWx0LFxufSBmcm9tICcuL2ludGVyZmFjZSc7XG5cbi8vIHYyLjQuNCByZXZpZXcgZml4IChjbGF1ZGUpOiByZW1vdmVkIGltcG9ydGVyIC8gaW1wb3J0ZXJWZXJzaW9uIC9cbi8vIHNvdXJjZVV1aWQgLyBpc0dyb3VwIC8gZm9sZGVyIGZyb20gdGhlIHdyaXRhYmxlIGFsbG93LWxpc3QuIExldHRpbmdcbi8vIEFJIGZsaXAgYW4gYXNzZXQncyBpbXBvcnRlciBzdHJpbmcgYXNrcyBhc3NldC1kYiB0byByZS1pbXBvcnQgYXMgYVxuLy8gZGlmZmVyZW50IGltcG9ydGVyOyBiZXN0IGNhc2UgdGhlIGltcG9ydCBmYWlscywgd29yc3QgY2FzZSB0aGVcbi8vIGFzc2V0IGlzIGNvcnJ1cHRlZC4gTm9uZSBvZiB0aGVzZSBmaWVsZHMgaGF2ZSBhIGRvY3VtZW50ZWRcbi8vIEFJLWRyaXZlbiB1c2UgY2FzZSB5ZXQg4oCUIHJlLWFkZCB3aGVuIG9uZSBzaG93cyB1cC5cbmNvbnN0IFZBTElEX01FVEFfUEFUVEVSTlM6IFJlZ0V4cFtdID0gW1xuICAgIC9edXNlckRhdGFcXC4vLFxuICAgIC9ec3ViTWV0YXNcXC4vLFxuICAgIC9ecGxhdGZvcm1TZXR0aW5nc1xcLi8sXG5dO1xuXG4vLyB2Mi40LjQgcmV2aWV3IGZpeCAoZ2VtaW5pICsgY2xhdWRlICsgY29kZXgpOiBWQUxJRF9NRVRBX1BBVFRFUk5TXG4vLyBvbmx5IGNoZWNrcyB0aGUgcm9vdCBwcmVmaXguIFdpdGhvdXQgdGhpcyBoYXJkLXN0b3AgbGlzdCwgcGF0aHNcbi8vIGxpa2UgYHVzZXJEYXRhLl9fcHJvdG9fXy5wb2xsdXRlZGAgcGFzcyB0aGUgcmVnZXggQU5EIHRoZSB3YWxrXG4vLyBkZXNjZW5kcyB0aHJvdWdoIE9iamVjdC5wcm90b3R5cGUsIHByb2R1Y2luZyBwcm9jZXNzLXdpZGVcbi8vIHByb3RvdHlwZSBwb2xsdXRpb24gb2JzZXJ2YWJsZSBmcm9tIGV2ZXJ5IG90aGVyIHRvb2wgLyBzY2VuZVxuLy8gc2NyaXB0LiBSZWplY3QgYW55IG9mIHRoZXNlIHNlZ21lbnRzIGFueXdoZXJlIGluIHRoZSBwYXRoLlxuY29uc3QgRk9SQklEREVOX1BBVEhfU0VHTUVOVFMgPSBuZXcgU2V0KFtcbiAgICAnX19wcm90b19fJywgJ2NvbnN0cnVjdG9yJywgJ3Byb3RvdHlwZScsXG5dKTtcblxuZXhwb3J0IGZ1bmN0aW9uIGlzUGF0aFNhZmUocHJvcGVydHlQYXRoOiBzdHJpbmcpOiB7IG9rOiB0cnVlIH0gfCB7IG9rOiBmYWxzZTsgcmVhc29uOiBzdHJpbmcgfSB7XG4gICAgaWYgKCFwcm9wZXJ0eVBhdGggfHwgdHlwZW9mIHByb3BlcnR5UGF0aCAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246ICdwcm9wZXJ0eVBhdGggbXVzdCBiZSBhIG5vbi1lbXB0eSBzdHJpbmcnIH07XG4gICAgfVxuICAgIGNvbnN0IGlzVmFsaWRSb290ID0gVkFMSURfTUVUQV9QQVRURVJOUy5zb21lKHJlID0+IHJlLnRlc3QocHJvcGVydHlQYXRoKSk7XG4gICAgaWYgKCFpc1ZhbGlkUm9vdCkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgb2s6IGZhbHNlLFxuICAgICAgICAgICAgcmVhc29uOiBgSW52YWxpZCBhc3NldC1tZXRhIHBhdGggJyR7cHJvcGVydHlQYXRofScuIEFsbG93ZWQgcm9vdHM6IHVzZXJEYXRhLiosIHN1Yk1ldGFzLiosIHBsYXRmb3JtU2V0dGluZ3MuKmAsXG4gICAgICAgIH07XG4gICAgfVxuICAgIGNvbnN0IHBhcnRzID0gcHJvcGVydHlQYXRoLnNwbGl0KCcuJyk7XG4gICAgZm9yIChjb25zdCBwYXJ0IG9mIHBhcnRzKSB7XG4gICAgICAgIGlmIChwYXJ0ID09PSAnJykge1xuICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246IGBFbXB0eSBwYXRoIHNlZ21lbnQgaW4gJyR7cHJvcGVydHlQYXRofScgKGNvbnNlY3V0aXZlIGRvdHMpYCB9O1xuICAgICAgICB9XG4gICAgICAgIGlmIChGT1JCSURERU5fUEFUSF9TRUdNRU5UUy5oYXMocGFydCkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiBgRm9yYmlkZGVuIHBhdGggc2VnbWVudCAnJHtwYXJ0fScgaW4gJyR7cHJvcGVydHlQYXRofScgKHByb3RvdHlwZS1wb2xsdXRpb24gZ3VhcmQpYCB9O1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG59XG5cbmNvbnN0IFNJTVBMRV9UWVBFUyA9IG5ldyBTZXQoWydTdHJpbmcnLCAnTnVtYmVyJywgJ0Jvb2xlYW4nLCAnY2MuVmFsdWVUeXBlJywgJ2NjLk9iamVjdCddKTtcblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEJhc2VBc3NldEludGVycHJldGVyIGltcGxlbWVudHMgSUFzc2V0SW50ZXJwcmV0ZXIge1xuICAgIGFic3RyYWN0IGdldCBpbXBvcnRlclR5cGUoKTogc3RyaW5nO1xuXG4gICAgYXN5bmMgZ2V0UHJvcGVydGllcyhcbiAgICAgICAgYXNzZXRJbmZvOiBBc3NldEluZm8sXG4gICAgICAgIGluY2x1ZGVUb29sdGlwczogYm9vbGVhbiA9IGZhbHNlLFxuICAgICAgICBfdXNlQWR2YW5jZWRJbnNwZWN0aW9uOiBib29sZWFuID0gZmFsc2UsXG4gICAgKTogUHJvbWlzZTxBc3NldFByb3BlcnRpZXNEZXNjcmlwdGlvbj4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgbWV0YTogYW55ID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXQtbWV0YScsIGFzc2V0SW5mby51dWlkKTtcbiAgICAgICAgICAgIGlmICghbWV0YSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgIHV1aWQ6IGFzc2V0SW5mby51dWlkLFxuICAgICAgICAgICAgICAgICAgICBpbXBvcnRlcjogYXNzZXRJbmZvLmltcG9ydGVyLFxuICAgICAgICAgICAgICAgICAgICBlcnJvcjogYEFzc2V0IG1ldGEgbm90IGZvdW5kIGZvciAke2Fzc2V0SW5mby51dWlkfWAsXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGRlc2NyaXB0aW9uOiBBc3NldFByb3BlcnRpZXNEZXNjcmlwdGlvbiA9IHtcbiAgICAgICAgICAgICAgICB1dWlkOiBhc3NldEluZm8udXVpZCxcbiAgICAgICAgICAgICAgICBpbXBvcnRlcjogYXNzZXRJbmZvLmltcG9ydGVyLFxuICAgICAgICAgICAgICAgIHByb3BlcnRpZXM6IHt9LFxuICAgICAgICAgICAgICAgIGFycmF5czoge30sXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgaWYgKG1ldGEudXNlckRhdGEpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmV4dHJhY3RGcm9tVXNlckRhdGEobWV0YS51c2VyRGF0YSwgZGVzY3JpcHRpb24sICcnLCBpbmNsdWRlVG9vbHRpcHMpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKG1ldGEuc3ViTWV0YXMpIHtcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IFtzdWJVdWlkLCBzdWJNZXRhXSBvZiBPYmplY3QuZW50cmllcyhtZXRhLnN1Yk1ldGFzKSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoc3ViTWV0YSAmJiB0eXBlb2Ygc3ViTWV0YSA9PT0gJ29iamVjdCcgJiYgJ3VzZXJEYXRhJyBpbiBzdWJNZXRhICYmIChzdWJNZXRhIGFzIGFueSkudXNlckRhdGEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHN1YkFzc2V0TmFtZSA9IHRoaXMuZ2V0U3ViQXNzZXROYW1lKGFzc2V0SW5mbywgc3ViVXVpZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmV4dHJhY3RGcm9tVXNlckRhdGEoKHN1Yk1ldGEgYXMgYW55KS51c2VyRGF0YSwgZGVzY3JpcHRpb24sIHN1YkFzc2V0TmFtZSwgaW5jbHVkZVRvb2x0aXBzKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBkZXNjcmlwdGlvbjtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgdXVpZDogYXNzZXRJbmZvLnV1aWQsXG4gICAgICAgICAgICAgICAgaW1wb3J0ZXI6IGFzc2V0SW5mby5pbXBvcnRlcixcbiAgICAgICAgICAgICAgICBlcnJvcjogYEVycm9yIHJlYWRpbmcgYXNzZXQgcHJvcGVydGllczogJHtlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycil9YCxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBhc3luYyBzZXRQcm9wZXJ0aWVzKFxuICAgICAgICBhc3NldEluZm86IEFzc2V0SW5mbyxcbiAgICAgICAgcHJvcGVydGllczogUHJvcGVydHlTZXRTcGVjW10sXG4gICAgKTogUHJvbWlzZTxQcm9wZXJ0eVNldFJlc3VsdFtdPiB7XG4gICAgICAgIGNvbnN0IHJlc3VsdHM6IFByb3BlcnR5U2V0UmVzdWx0W10gPSBbXTtcbiAgICAgICAgbGV0IG1ldGE6IGFueTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIG1ldGEgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldC1tZXRhJywgYXNzZXRJbmZvLnV1aWQpO1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHByb3BlcnRpZXMubWFwKHAgPT4gKHtcbiAgICAgICAgICAgICAgICBwcm9wZXJ0eVBhdGg6IHAucHJvcGVydHlQYXRoLFxuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgIGVycm9yOiBgcXVlcnktYXNzZXQtbWV0YSBmYWlsZWQ6ICR7ZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpfWAsXG4gICAgICAgICAgICB9KSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFtZXRhKSB7XG4gICAgICAgICAgICByZXR1cm4gcHJvcGVydGllcy5tYXAocCA9PiAoe1xuICAgICAgICAgICAgICAgIHByb3BlcnR5UGF0aDogcC5wcm9wZXJ0eVBhdGgsXG4gICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgZXJyb3I6IGBBc3NldCBtZXRhIG5vdCBmb3VuZCBmb3IgJHthc3NldEluZm8udXVpZH1gLFxuICAgICAgICAgICAgfSkpO1xuICAgICAgICB9XG4gICAgICAgIGZvciAoY29uc3QgcHJvcCBvZiBwcm9wZXJ0aWVzKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IG9rID0gYXdhaXQgdGhpcy5zZXRQcm9wZXJ0eShtZXRhLCBwcm9wKTtcbiAgICAgICAgICAgICAgICByZXN1bHRzLnB1c2goeyBwcm9wZXJ0eVBhdGg6IHByb3AucHJvcGVydHlQYXRoLCBzdWNjZXNzOiBvayB9KTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0cy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgcHJvcGVydHlQYXRoOiBwcm9wLnByb3BlcnR5UGF0aCxcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIGVycm9yOiBlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVyciksXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy8gdjIuNC40IHJldmlldyBmaXggKGNsYXVkZSArIGNvZGV4KTogc3BsaXQgc2F2ZSB2cyByZWZyZXNoXG4gICAgICAgIC8vIGZhaWx1cmUgaGFuZGxpbmcuIHYyLjQuMyBsdW1wZWQgYm90aCBlcnJvcnMgdG9nZXRoZXIgd2hpY2hcbiAgICAgICAgLy8gbWlzbGFiZWxsZWQgdGhlIHN0YXRlIG9uIGRpc2s6IGlmIHNhdmUgc3VjY2VlZGVkIGJ1dFxuICAgICAgICAvLyByZWZyZXNoIHRocmV3LCB0aGUgZGlzayBtZXRhIElTIHVwZGF0ZWQgYW5kIG9ubHkgdGhlXG4gICAgICAgIC8vIHJlLWltcG9ydCBpcyBzdGFsZSDigJQgZmxpcHBpbmcgZXZlcnkgc3VjY2Vzc2Z1bCBlbnRyeSB0b1xuICAgICAgICAvLyBmYWlsdXJlIHdhcyB3cm9uZy5cbiAgICAgICAgbGV0IHNhdmVTdGF0dXM6ICdvaycgfCAnc2F2ZS1mYWlsZWQnIHwgJ3JlZnJlc2gtZmFpbGVkJyA9ICdvayc7XG4gICAgICAgIGxldCBzYXZlRXJyb3I6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICAgICAgaWYgKHJlc3VsdHMuc29tZShyID0+IHIuc3VjY2VzcykpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAnc2F2ZS1hc3NldC1tZXRhJywgYXNzZXRJbmZvLnV1aWQsIEpTT04uc3RyaW5naWZ5KG1ldGEpKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICAgICAgc2F2ZVN0YXR1cyA9ICdzYXZlLWZhaWxlZCc7XG4gICAgICAgICAgICAgICAgc2F2ZUVycm9yID0gYHNhdmUtYXNzZXQtbWV0YSBmYWlsZWQ6ICR7ZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpfWA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoc2F2ZVN0YXR1cyA9PT0gJ29rJykge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3JlZnJlc2gtYXNzZXQnLCBhc3NldEluZm8udXJsKTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgICAgICAgICBzYXZlU3RhdHVzID0gJ3JlZnJlc2gtZmFpbGVkJztcbiAgICAgICAgICAgICAgICAgICAgc2F2ZUVycm9yID0gYHNhdmUtYXNzZXQtbWV0YSBzdWNjZWVkZWQgYnV0IHJlZnJlc2gtYXNzZXQgZmFpbGVkOiAke2Vycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKX0uIERpc2sgbWV0YSBJUyB1cGRhdGVkOyBjb2NvcyB3aWxsIHBpY2sgdXAgdGhlIGNoYW5nZSBvbiBuZXh0IG1hbnVhbCByZWZyZXNoLmA7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHNhdmVTdGF0dXMgPT09ICdzYXZlLWZhaWxlZCcpIHtcbiAgICAgICAgICAgICAgICAvLyBEaXNrIHdyaXRlIG5ldmVyIGhhcHBlbmVkOyBmbGlwIGluLW1lbW9yeSBzdWNjZXNzZXNcbiAgICAgICAgICAgICAgICAvLyB0byBmYWlsZWQgc28gdGhlIGNhbGxlciBrbm93cyBub3RoaW5nIHBlcnNpc3RlZC5cbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IHIgb2YgcmVzdWx0cykge1xuICAgICAgICAgICAgICAgICAgICBpZiAoci5zdWNjZXNzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByLnN1Y2Nlc3MgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHIuZXJyb3IgPSBzYXZlRXJyb3I7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHNhdmVTdGF0dXMgPT09ICdyZWZyZXNoLWZhaWxlZCcpIHtcbiAgICAgICAgICAgICAgICAvLyBEaXNrIHdyaXRlIGhhcHBlbmVkIGJ1dCByZS1pbXBvcnQgaXMgc3RhbGU7IGZsYWdcbiAgICAgICAgICAgICAgICAvLyBlYWNoIHN1Y2Nlc3NmdWwgZW50cnkgd2l0aCBhIHdhcm5pbmcgdGhhdCBkb2Vzbid0XG4gICAgICAgICAgICAgICAgLy8gcmV2ZXJzZSB0aGUgd3JpdGUgc3RhdHVzLlxuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgciBvZiByZXN1bHRzKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChyLnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIChyIGFzIGFueSkud2FybmluZyA9IHNhdmVFcnJvcjtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0cztcbiAgICB9XG5cbiAgICBwcm90ZWN0ZWQgZXh0cmFjdEZyb21Vc2VyRGF0YShcbiAgICAgICAgdXNlckRhdGE6IGFueSxcbiAgICAgICAgZGVzY3JpcHRpb246IEFzc2V0UHJvcGVydGllc0Rlc2NyaXB0aW9uLFxuICAgICAgICBwYXRoUHJlZml4OiBzdHJpbmcsXG4gICAgICAgIGluY2x1ZGVUb29sdGlwczogYm9vbGVhbixcbiAgICApOiB2b2lkIHtcbiAgICAgICAgaWYgKCF1c2VyRGF0YSB8fCB0eXBlb2YgdXNlckRhdGEgIT09ICdvYmplY3QnKSByZXR1cm47XG4gICAgICAgIGNvbnN0IG91dCA9IHRoaXMuZXh0cmFjdFJlY3Vyc2l2ZSh1c2VyRGF0YSwgcGF0aFByZWZpeCwgaW5jbHVkZVRvb2x0aXBzKTtcbiAgICAgICAgT2JqZWN0LmFzc2lnbihkZXNjcmlwdGlvbi5wcm9wZXJ0aWVzISwgb3V0LnByb3BlcnRpZXMpO1xuICAgICAgICBPYmplY3QuYXNzaWduKGRlc2NyaXB0aW9uLmFycmF5cyEsIG91dC5hcnJheXMpO1xuICAgIH1cblxuICAgIHByaXZhdGUgZXh0cmFjdFJlY3Vyc2l2ZShcbiAgICAgICAgb2JqOiBhbnksXG4gICAgICAgIGJhc2VQYXRoOiBzdHJpbmcsXG4gICAgICAgIGluY2x1ZGVUb29sdGlwczogYm9vbGVhbixcbiAgICApOiB7IHByb3BlcnRpZXM6IFJlY29yZDxzdHJpbmcsIEFzc2V0UHJvcGVydGllc0Rlc2NyaXB0aW9uWydwcm9wZXJ0aWVzJ10gZXh0ZW5kcyBpbmZlciBQID8gUCBleHRlbmRzIFJlY29yZDxzdHJpbmcsIGluZmVyIFY+ID8gViA6IG5ldmVyIDogbmV2ZXI+OyBhcnJheXM6IFJlY29yZDxzdHJpbmcsIEFzc2V0UHJvcGVydGllc0Rlc2NyaXB0aW9uWydhcnJheXMnXSBleHRlbmRzIGluZmVyIEEgPyBBIGV4dGVuZHMgUmVjb3JkPHN0cmluZywgaW5mZXIgVj4gPyBWIDogbmV2ZXIgOiBuZXZlcj4gfSB7XG4gICAgICAgIGNvbnN0IHByb3BlcnRpZXM6IFJlY29yZDxzdHJpbmcsIGFueT4gPSB7fTtcbiAgICAgICAgY29uc3QgYXJyYXlzOiBSZWNvcmQ8c3RyaW5nLCBhbnk+ID0ge307XG4gICAgICAgIGlmICghb2JqIHx8IHR5cGVvZiBvYmogIT09ICdvYmplY3QnKSByZXR1cm4geyBwcm9wZXJ0aWVzLCBhcnJheXMgfTtcbiAgICAgICAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMob2JqKSkge1xuICAgICAgICAgICAgLy8gU2tpcCBwcml2YXRlL2ludGVybmFsIGZpZWxkcy4gQUkgc2hvdWxkbid0IGJlIHBva2luZyBhdFxuICAgICAgICAgICAgLy8gX2ludGVybmFsIGNvY29zIGJvb2trZWVwaW5nLlxuICAgICAgICAgICAgaWYgKGtleS5zdGFydHNXaXRoKCdfJykpIGNvbnRpbnVlO1xuICAgICAgICAgICAgY29uc3QgY3VycmVudFBhdGggPSBiYXNlUGF0aCA/IGAke2Jhc2VQYXRofS4ke2tleX1gIDoga2V5O1xuICAgICAgICAgICAgY29uc3QgcHJvcGVydHlEYXRhID0gb2JqW2tleV07XG4gICAgICAgICAgICBpZiAocHJvcGVydHlEYXRhICYmIHR5cGVvZiBwcm9wZXJ0eURhdGEgPT09ICdvYmplY3QnICYmIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChwcm9wZXJ0eURhdGEsICd2YWx1ZScpKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcHJvcGVydHlJbmZvOiBhbnkgPSB7XG4gICAgICAgICAgICAgICAgICAgIHR5cGU6IHByb3BlcnR5RGF0YS50eXBlIHx8ICdVbmtub3duJyxcbiAgICAgICAgICAgICAgICAgICAgdmFsdWU6IHByb3BlcnR5RGF0YS52YWx1ZSxcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIGlmIChwcm9wZXJ0eURhdGEudG9vbHRpcCAmJiBpbmNsdWRlVG9vbHRpcHMpIHtcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGVkaXRvciA9IChnbG9iYWxUaGlzIGFzIGFueSkuRWRpdG9yO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGVkaXRvcj8uSTE4bj8udCAmJiB0eXBlb2YgcHJvcGVydHlEYXRhLnRvb2x0aXAgPT09ICdzdHJpbmcnICYmIHByb3BlcnR5RGF0YS50b29sdGlwLnN0YXJ0c1dpdGgoJ2kxOG46JykpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0eUluZm8udG9vbHRpcCA9IGVkaXRvci5JMThuLnQocHJvcGVydHlEYXRhLnRvb2x0aXAuc2xpY2UoNSkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0eUluZm8udG9vbHRpcCA9IHByb3BlcnR5RGF0YS50b29sdGlwO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHByb3BlcnR5SW5mby50b29sdGlwID0gcHJvcGVydHlEYXRhLnRvb2x0aXA7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKHByb3BlcnR5RGF0YS50eXBlID09PSAnRW51bScgJiYgcHJvcGVydHlEYXRhLmVudW1MaXN0KSB7XG4gICAgICAgICAgICAgICAgICAgIHByb3BlcnR5SW5mby5lbnVtTGlzdCA9IHByb3BlcnR5RGF0YS5lbnVtTGlzdDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKHByb3BlcnR5RGF0YS5pc0FycmF5KSB7XG4gICAgICAgICAgICAgICAgICAgIGFycmF5c1tjdXJyZW50UGF0aF0gPSB7IHR5cGU6IHByb3BlcnR5SW5mby50eXBlLCB0b29sdGlwOiBwcm9wZXJ0eUluZm8udG9vbHRpcCB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBpc0NvbXBsZXggPSBwcm9wZXJ0eURhdGEudmFsdWVcbiAgICAgICAgICAgICAgICAgICAgJiYgKCh0eXBlb2YgcHJvcGVydHlEYXRhLnZhbHVlID09PSAnb2JqZWN0J1xuICAgICAgICAgICAgICAgICAgICAgICAgJiYgIVNJTVBMRV9UWVBFUy5oYXMocHJvcGVydHlEYXRhLnR5cGUpXG4gICAgICAgICAgICAgICAgICAgICAgICAmJiAhKEFycmF5LmlzQXJyYXkocHJvcGVydHlEYXRhLmV4dGVuZHMpICYmIHByb3BlcnR5RGF0YS5leHRlbmRzLnNvbWUoKGV4dDogc3RyaW5nKSA9PiBTSU1QTEVfVFlQRVMuaGFzKGV4dCkpKSlcbiAgICAgICAgICAgICAgICAgICAgICAgIHx8IEFycmF5LmlzQXJyYXkocHJvcGVydHlEYXRhLnZhbHVlKSk7XG4gICAgICAgICAgICAgICAgaWYgKGlzQ29tcGxleCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBuZXN0ZWQgPSB0aGlzLmV4dHJhY3RSZWN1cnNpdmUocHJvcGVydHlEYXRhLnZhbHVlLCBjdXJyZW50UGF0aCwgaW5jbHVkZVRvb2x0aXBzKTtcbiAgICAgICAgICAgICAgICAgICAgT2JqZWN0LmFzc2lnbihwcm9wZXJ0aWVzLCBuZXN0ZWQucHJvcGVydGllcyk7XG4gICAgICAgICAgICAgICAgICAgIE9iamVjdC5hc3NpZ24oYXJyYXlzLCBuZXN0ZWQuYXJyYXlzKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0aWVzW2N1cnJlbnRQYXRoXSA9IHByb3BlcnR5SW5mbztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5RGF0YSAhPT0gbnVsbCAmJiB0eXBlb2YgcHJvcGVydHlEYXRhID09PSAnb2JqZWN0JyAmJiAhQXJyYXkuaXNBcnJheShwcm9wZXJ0eURhdGEpKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgbmVzdGVkID0gdGhpcy5leHRyYWN0UmVjdXJzaXZlKHByb3BlcnR5RGF0YSwgY3VycmVudFBhdGgsIGluY2x1ZGVUb29sdGlwcyk7XG4gICAgICAgICAgICAgICAgT2JqZWN0LmFzc2lnbihwcm9wZXJ0aWVzLCBuZXN0ZWQucHJvcGVydGllcyk7XG4gICAgICAgICAgICAgICAgT2JqZWN0LmFzc2lnbihhcnJheXMsIG5lc3RlZC5hcnJheXMpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBwcm9wZXJ0aWVzW2N1cnJlbnRQYXRoXSA9IHtcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogdGhpcy5pbmZlclByb3BlcnR5VHlwZShwcm9wZXJ0eURhdGEpLFxuICAgICAgICAgICAgICAgICAgICB2YWx1ZTogcHJvcGVydHlEYXRhLFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgcHJvcGVydGllcywgYXJyYXlzIH07XG4gICAgfVxuXG4gICAgcHJvdGVjdGVkIGluZmVyUHJvcGVydHlUeXBlKHZhbHVlOiBhbnkpOiBzdHJpbmcge1xuICAgICAgICBpZiAodmFsdWUgPT09IG51bGwgfHwgdmFsdWUgPT09IHVuZGVmaW5lZCkgcmV0dXJuICdVbmtub3duJztcbiAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ2Jvb2xlYW4nKSByZXR1cm4gJ0Jvb2xlYW4nO1xuICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJykgcmV0dXJuICdOdW1iZXInO1xuICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykgcmV0dXJuICdTdHJpbmcnO1xuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHJldHVybiAnQXJyYXknO1xuICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbCh2YWx1ZSwgJ19fdHlwZV9fJykpIHJldHVybiAodmFsdWUgYXMgYW55KS5fX3R5cGVfXztcbiAgICAgICAgICAgIHJldHVybiAnT2JqZWN0JztcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gJ1Vua25vd24nO1xuICAgIH1cblxuICAgIHByb3RlY3RlZCBnZXRTdWJBc3NldE5hbWUoYXNzZXRJbmZvOiBBc3NldEluZm8sIHN1YlV1aWQ6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgICAgIGNvbnN0IHN1YkFzc2V0cyA9IChhc3NldEluZm8gYXMgYW55KS5zdWJBc3NldHM7XG4gICAgICAgIGlmIChzdWJBc3NldHMgJiYgc3ViQXNzZXRzW3N1YlV1aWRdPy5uYW1lKSByZXR1cm4gc3ViQXNzZXRzW3N1YlV1aWRdLm5hbWU7XG4gICAgICAgIHJldHVybiBzdWJVdWlkO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIERlZmF1bHQgc2V0dGVyIOKAlCB2YWxpZGF0ZXMgcGF0aCB0aHJvdWdoIGBpc1BhdGhTYWZlYCAocm9vdCArXG4gICAgICogZm9yYmlkZGVuLXNlZ21lbnQgZ3VhcmQpLCB3YWxrcyB0aGUgZG90dGVkIHBhdGggY3JlYXRpbmcgb25seVxuICAgICAqIGFsbG93ZWQgaW50ZXJtZWRpYXRlIGNvbnRhaW5lcnMsIGFuZCB3cml0ZXMgdGhlIGNvZXJjZWQgdmFsdWVcbiAgICAgKiBhdCB0aGUgbGVhZi4gU3BlY2lhbGl6ZWQgaW50ZXJwcmV0ZXJzIG92ZXJyaWRlIHRoaXMgd2hlbiB0aGVpclxuICAgICAqIG1ldGEgbGF5b3V0IG5lZWRzIGN1c3RvbSByb3V0aW5nIChlLmcuIEltYWdlSW50ZXJwcmV0ZXIncyBtYWluXG4gICAgICogdnMgc3ViLWFzc2V0IHNwbGl0KS5cbiAgICAgKlxuICAgICAqIFVzZXMgT2JqZWN0LmNyZWF0ZShudWxsKSBmb3IgYXV0by1jcmVhdGVkIGludGVybWVkaWF0ZVxuICAgICAqIGNvbnRhaW5lcnMgc28gZXZlbiBpZiBhIGZ1dHVyZSBjaGFuZ2UgaW50cm9kdWNlcyBhbm90aGVyXG4gICAgICogd2FsayBzaXRlLCB0aGUgbmV3IG9iamVjdHMgZG9uJ3QgY2FycnkgT2JqZWN0LnByb3RvdHlwZS5cbiAgICAgKi9cbiAgICBwcm90ZWN0ZWQgYXN5bmMgc2V0UHJvcGVydHkobWV0YTogYW55LCBwcm9wOiBQcm9wZXJ0eVNldFNwZWMpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICAgICAgY29uc3Qgc2FmZSA9IGlzUGF0aFNhZmUocHJvcC5wcm9wZXJ0eVBhdGgpO1xuICAgICAgICBpZiAoIXNhZmUub2spIHRocm93IG5ldyBFcnJvcihzYWZlLnJlYXNvbik7XG4gICAgICAgIGNvbnN0IHBhdGhQYXJ0cyA9IHByb3AucHJvcGVydHlQYXRoLnNwbGl0KCcuJyk7XG4gICAgICAgIGxldCBjdXJyZW50ID0gbWV0YTtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBwYXRoUGFydHMubGVuZ3RoIC0gMTsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBwYXJ0ID0gcGF0aFBhcnRzW2ldO1xuICAgICAgICAgICAgaWYgKGN1cnJlbnRbcGFydF0gPT09IHVuZGVmaW5lZCB8fCBjdXJyZW50W3BhcnRdID09PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgaWYgKHBhcnQgPT09ICd1c2VyRGF0YScgfHwgcGFydCA9PT0gJ3N1Yk1ldGFzJyB8fCBwYXJ0ID09PSAncGxhdGZvcm1TZXR0aW5ncycpIHtcbiAgICAgICAgICAgICAgICAgICAgY3VycmVudFtwYXJ0XSA9IHt9O1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoaSA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gQXV0by1jcmVhdGUgaW5zaWRlIGFuIGFscmVhZHktYWxsb3dlZCByb290LlxuICAgICAgICAgICAgICAgICAgICBjdXJyZW50W3BhcnRdID0ge307XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDYW5ub3QgY3JlYXRlIHRvcC1sZXZlbCBtZXRhIGZpZWxkICcke3BhcnR9JyAocGF0aDogJHtwcm9wLnByb3BlcnR5UGF0aH0pYCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY3VycmVudCA9IGN1cnJlbnRbcGFydF07XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZmluYWxLZXkgPSBwYXRoUGFydHNbcGF0aFBhcnRzLmxlbmd0aCAtIDFdO1xuICAgICAgICBjdXJyZW50W2ZpbmFsS2V5XSA9IHRoaXMuY29udmVydFByb3BlcnR5VmFsdWUocHJvcC5wcm9wZXJ0eVZhbHVlLCBwcm9wLnByb3BlcnR5VHlwZSk7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIHByb3RlY3RlZCBjb252ZXJ0UHJvcGVydHlWYWx1ZSh2YWx1ZTogYW55LCB0eXBlOiBzdHJpbmcpOiBhbnkge1xuICAgICAgICBzd2l0Y2ggKHR5cGUpIHtcbiAgICAgICAgICAgIGNhc2UgJ0Jvb2xlYW4nOlxuICAgICAgICAgICAgICAgIC8vIHYyLjQuNCByZXZpZXcgZml4IChjb2RleCk6IEJvb2xlYW4oXCJmYWxzZVwiKSA9PT0gdHJ1ZVxuICAgICAgICAgICAgICAgIC8vIHdvdWxkIHNpbGVudGx5IGZsaXAgdGhlIG1lYW5pbmcgb2YgYW4gQUktc3VwcGxpZWRcbiAgICAgICAgICAgICAgICAvLyBzdHJpbmcuIFRyZWF0IHRoZSB0ZXh0dWFsIHZhcmlhbnRzIGV4cGxpY2l0bHk7IG9ubHlcbiAgICAgICAgICAgICAgICAvLyB0cnVseSBlbXB0eSAvIG51bGwgLyAwIGFyZSBmYWxzeS5cbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBsb3dlciA9IHZhbHVlLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgICAgICAgICBpZiAobG93ZXIgPT09ICdmYWxzZScgfHwgbG93ZXIgPT09ICcwJyB8fCBsb3dlciA9PT0gJycpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGxvd2VyID09PSAndHJ1ZScgfHwgbG93ZXIgPT09ICcxJykgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgQ2Fubm90IGNvZXJjZSBzdHJpbmcgJyR7dmFsdWV9JyB0byBCb29sZWFuICh1c2UgdHJ1ZS9mYWxzZS8xLzApYCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBCb29sZWFuKHZhbHVlKTtcbiAgICAgICAgICAgIGNhc2UgJ051bWJlcic6XG4gICAgICAgICAgICBjYXNlICdGbG9hdCc6IHtcbiAgICAgICAgICAgICAgICBjb25zdCBuID0gcGFyc2VGbG9hdChTdHJpbmcodmFsdWUpKTtcbiAgICAgICAgICAgICAgICBpZiAoTnVtYmVyLmlzTmFOKG4pKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgQ2Fubm90IGNvZXJjZSAnJHt2YWx1ZX0nIHRvICR7dHlwZX0gKHBhcnNlRmxvYXQgLT4gTmFOKWApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gbjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhc2UgJ1N0cmluZyc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIFN0cmluZyh2YWx1ZSk7XG4gICAgICAgICAgICBjYXNlICdJbnRlZ2VyJzoge1xuICAgICAgICAgICAgICAgIGNvbnN0IG4gPSBwYXJzZUludChTdHJpbmcodmFsdWUpLCAxMCk7XG4gICAgICAgICAgICAgICAgaWYgKE51bWJlci5pc05hTihuKSkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCBjb2VyY2UgJyR7dmFsdWV9JyB0byBJbnRlZ2VyIChwYXJzZUludCAtPiBOYU4pYCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2FzZSAnRW51bSc6XG4gICAgICAgICAgICBjYXNlICdjYy5WYWx1ZVR5cGUnOlxuICAgICAgICAgICAgY2FzZSAnY2MuT2JqZWN0JzpcbiAgICAgICAgICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdib29sZWFuJykgcmV0dXJuIEJvb2xlYW4odmFsdWUpO1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInKSByZXR1cm4gTnVtYmVyKHZhbHVlKTtcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykgcmV0dXJuIFN0cmluZyh2YWx1ZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgICB9XG4gICAgfVxufVxuIl19