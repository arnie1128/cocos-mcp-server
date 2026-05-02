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
                // reverse the write status. v2.4.5: warning is now a
                // declared field on PropertySetResult, no `as any`.
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
     * v2.4.5: removed misleading "Object.create(null)" claim from
     * the JSDoc — the auto-created containers are plain `{}`. The
     * forbidden-segment guard (__proto__ / constructor / prototype)
     * is what blocks pollution; the container shape doesn't matter
     * for that protection.
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
                // v2.4.5 review fix (claude + codex + gemini):
                // parseFloat('1.2.3') silently returns 1.2 — too
                // lenient. Use Number() which rejects trailing garbage
                // by returning NaN.
                //
                // v2.4.6 review fixes:
                //   - codex 🔴: Number('') === 0 silently coerces an
                //     empty string to zero. Reject explicitly so AI
                //     doesn't accidentally write 0 when it meant to
                //     omit a value.
                //   - codex 🟡: Number('Infinity') === Infinity passes
                //     the NaN check. Use Number.isFinite to reject
                //     ±Infinity for the asset-meta numeric path —
                //     cocos asset properties never want infinite
                //     values, so this is fail-fast.
                if (typeof value !== 'number') {
                    const s = String(value).trim();
                    if (s === '') {
                        throw new Error(`Cannot coerce empty string to ${type}`);
                    }
                    const n = Number(s);
                    if (!Number.isFinite(n)) {
                        throw new Error(`Cannot coerce '${value}' to ${type} (not a finite number)`);
                    }
                    return n;
                }
                if (!Number.isFinite(value)) {
                    throw new Error(`Cannot coerce ${value} to ${type} (not a finite number)`);
                }
                return value;
            }
            case 'String':
                return String(value);
            case 'Integer': {
                // v2.4.5: stricter than parseInt — '123foo' must throw,
                // not silently truncate to 123. Allow leading sign and
                // optional surrounding whitespace.
                if (typeof value === 'number') {
                    if (!Number.isFinite(value)) {
                        throw new Error(`Cannot coerce ${value} to Integer (not finite)`);
                    }
                    return Math.trunc(value);
                }
                const s = String(value).trim();
                if (!/^-?\d+$/.test(s)) {
                    throw new Error(`Cannot coerce '${value}' to Integer (must match /^-?\\d+$/)`);
                }
                const n = parseInt(s, 10);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFzZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NvdXJjZS9hc3NldC1pbnRlcnByZXRlcnMvYmFzZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBdUJHOzs7QUFnQ0gsZ0NBcUJDO0FBM0NELG1FQUFtRTtBQUNuRSxzRUFBc0U7QUFDdEUscUVBQXFFO0FBQ3JFLGlFQUFpRTtBQUNqRSw2REFBNkQ7QUFDN0QscURBQXFEO0FBQ3JELE1BQU0sbUJBQW1CLEdBQWE7SUFDbEMsYUFBYTtJQUNiLGFBQWE7SUFDYixxQkFBcUI7Q0FDeEIsQ0FBQztBQUVGLG1FQUFtRTtBQUNuRSxrRUFBa0U7QUFDbEUsaUVBQWlFO0FBQ2pFLDREQUE0RDtBQUM1RCwrREFBK0Q7QUFDL0QsNkRBQTZEO0FBQzdELE1BQU0sdUJBQXVCLEdBQUcsSUFBSSxHQUFHLENBQUM7SUFDcEMsV0FBVyxFQUFFLGFBQWEsRUFBRSxXQUFXO0NBQzFDLENBQUMsQ0FBQztBQUVILFNBQWdCLFVBQVUsQ0FBQyxZQUFvQjtJQUMzQyxJQUFJLENBQUMsWUFBWSxJQUFJLE9BQU8sWUFBWSxLQUFLLFFBQVEsRUFBRSxDQUFDO1FBQ3BELE9BQU8sRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSx5Q0FBeUMsRUFBRSxDQUFDO0lBQzVFLENBQUM7SUFDRCxNQUFNLFdBQVcsR0FBRyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUM7SUFDMUUsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBQ2YsT0FBTztZQUNILEVBQUUsRUFBRSxLQUFLO1lBQ1QsTUFBTSxFQUFFLDRCQUE0QixZQUFZLDhEQUE4RDtTQUNqSCxDQUFDO0lBQ04sQ0FBQztJQUNELE1BQU0sS0FBSyxHQUFHLFlBQVksQ0FBQyxLQUFLLENBQUMsR0FBRyxD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ZXJwcmV0ZXIg4oCUIHNoYXJlZCBnZXRQcm9wZXJ0aWVzIC8gc2V0UHJvcGVydGllcyBmb3IgdGhlXG4gKiBhc3NldC1tZXRhIGVkaXRpbmcgdG9vbHMuIFNwZWNpYWxpemVkIGludGVycHJldGVycyBleHRlbmQgdGhpcyBhbmRcbiAqIG92ZXJyaWRlIGBpbXBvcnRlclR5cGVgIChhbHdheXMpIHBsdXMgb3B0aW9uYWxseSBgc2V0UHJvcGVydHlgIC9cbiAqIGBnZXRQcm9wZXJ0aWVzYCBmb3IgdHlwZS1zcGVjaWZpYyBsYXlvdXRzLlxuICpcbiAqIFBhdGgtdmFsaWRhdGlvbiBwb2xpY3kgKENMQVVERS5tZCBsYW5kbWluZSBjYW5kaWRhdGUpOlxuICogICBBSS1nZW5lcmF0ZWQgcHJvcGVydHkgcGF0aHMgcnVuIHRocm91Z2ggYFZBTElEX01FVEFfUEFUVEVSTlNgXG4gKiAgIGJlZm9yZSBhbnkgbWV0YSBtdXRhdGlvbi4gQW55dGhpbmcgb3V0c2lkZSBgdXNlckRhdGEuKmAsXG4gKiAgIGBzdWJNZXRhcy4qYCwgYHBsYXRmb3JtU2V0dGluZ3MuKmAsIG9yIHRoZSBzbWFsbCBhbGxvdy1saXN0IG9mXG4gKiAgIGF0b21pYyB0b3AtbGV2ZWwga2V5cyBpcyByZWplY3RlZC4gVGhpcyBzdG9wcyBhIGNvbmZ1c2VkIEFJIGZyb21cbiAqICAgY2xvYmJlcmluZyBzdHJ1Y3R1cmFsIG1ldGEgZmllbGRzIGxpa2UgYF9fdHlwZV9fYCBvciByZXdyaXRpbmdcbiAqICAgYHZlcmAgYW5kIGJyZWFraW5nIHJlLWltcG9ydC5cbiAqXG4gKiBTYXZlIHNlbWFudGljczpcbiAqICAgYHNhdmUtYXNzZXQtbWV0YWAgZm9sbG93ZWQgYnkgYHJlZnJlc2gtYXNzZXRgIHBlciBSb21hUm9nb3YgcmVmLlxuICogICBSZWZyZXNoIGlzIHdoYXQgdHJpZ2dlcnMgY29jb3MgdG8gcmUtaW1wb3J0IHdpdGggdGhlIG5ldyBzZXR0aW5ncztcbiAqICAgd2l0aG91dCBpdCB0aGUgbmV3IHVzZXJEYXRhIHBlcnNpc3RzIGJ1dCB0aGUgaW1wb3J0ZWQgYXNzZXQgZG9lc24ndFxuICogICBwaWNrIHVwIHRoZSBjaGFuZ2UgdW50aWwgdGhlIG5leHQgbWFudWFsIHJlZnJlc2guXG4gKlxuICogUmVmZXJlbmNlOiBSb21hUm9nb3YtY29jb3MtbWNwIGBiYXNlLWludGVycHJldGVyLnRzYC4gV2Uga2VlcCB0aGVcbiAqIGV4dHJhY3Rpb24gbG9naWMgc2hhcGUgY2xvc2UgdG8gdXBzdHJlYW0gc28gZnV0dXJlIGJ1ZyBmaXhlcyB0aGVyZVxuICogcG9ydCBjbGVhbmx5LlxuICovXG5cbmltcG9ydCB0eXBlIHsgQXNzZXRJbmZvIH0gZnJvbSAnQGNvY29zL2NyZWF0b3ItdHlwZXMvZWRpdG9yL3BhY2thZ2VzL2Fzc2V0LWRiL0B0eXBlcy9wdWJsaWMnO1xuaW1wb3J0IHtcbiAgICBBc3NldFByb3BlcnRpZXNEZXNjcmlwdGlvbixcbiAgICBJQXNzZXRJbnRlcnByZXRlcixcbiAgICBQcm9wZXJ0eVNldFNwZWMsXG4gICAgUHJvcGVydHlTZXRSZXN1bHQsXG59IGZyb20gJy4vaW50ZXJmYWNlJztcblxuLy8gdjIuNC40IHJldmlldyBmaXggKGNsYXVkZSk6IHJlbW92ZWQgaW1wb3J0ZXIgLyBpbXBvcnRlclZlcnNpb24gL1xuLy8gc291cmNlVXVpZCAvIGlzR3JvdXAgLyBmb2xkZXIgZnJvbSB0aGUgd3JpdGFibGUgYWxsb3ctbGlzdC4gTGV0dGluZ1xuLy8gQUkgZmxpcCBhbiBhc3NldCdzIGltcG9ydGVyIHN0cmluZyBhc2tzIGFzc2V0LWRiIHRvIHJlLWltcG9ydCBhcyBhXG4vLyBkaWZmZXJlbnQgaW1wb3J0ZXI7IGJlc3QgY2FzZSB0aGUgaW1wb3J0IGZhaWxzLCB3b3JzdCBjYXNlIHRoZVxuLy8gYXNzZXQgaXMgY29ycnVwdGVkLiBOb25lIG9mIHRoZXNlIGZpZWxkcyBoYXZlIGEgZG9jdW1lbnRlZFxuLy8gQUktZHJpdmVuIHVzZSBjYXNlIHlldCDigJQgcmUtYWRkIHdoZW4gb25lIHNob3dzIHVwLlxuY29uc3QgVkFMSURfTUVUQV9QQVRURVJOUzogUmVnRXhwW10gPSBbXG4gICAgL151c2VyRGF0YVxcLi8sXG4gICAgL15zdWJNZXRhc1xcLi8sXG4gICAgL15wbGF0Zm9ybVNldHRpbmdzXFwuLyxcbl07XG5cbi8vIHYyLjQuNCByZXZpZXcgZml4IChnZW1pbmkgKyBjbGF1ZGUgKyBjb2RleCk6IFZBTElEX01FVEFfUEFUVEVSTlNcbi8vIG9ubHkgY2hlY2tzIHRoZSByb290IHByZWZpeC4gV2l0aG91dCB0aGlzIGhhcmQtc3RvcCBsaXN0LCBwYXRoc1xuLy8gbGlrZSBgdXNlckRhdGEuX19wcm90b19fLnBvbGx1dGVkYCBwYXNzIHRoZSByZWdleCBBTkQgdGhlIHdhbGtcbi8vIGRlc2NlbmRzIHRocm91Z2ggT2JqZWN0LnByb3RvdHlwZSwgcHJvZHVjaW5nIHByb2Nlc3Mtd2lkZVxuLy8gcHJvdG90eXBlIHBvbGx1dGlvbiBvYnNlcnZhYmxlIGZyb20gZXZlcnkgb3RoZXIgdG9vbCAvIHNjZW5lXG4vLyBzY3JpcHQuIFJlamVjdCBhbnkgb2YgdGhlc2Ugc2VnbWVudHMgYW55d2hlcmUgaW4gdGhlIHBhdGguXG5jb25zdCBGT1JCSURERU5fUEFUSF9TRUdNRU5UUyA9IG5ldyBTZXQoW1xuICAgICdfX3Byb3RvX18nLCAnY29uc3RydWN0b3InLCAncHJvdG90eXBlJyxcbl0pO1xuXG5leHBvcnQgZnVuY3Rpb24gaXNQYXRoU2FmZShwcm9wZXJ0eVBhdGg6IHN0cmluZyk6IHsgb2s6IHRydWUgfSB8IHsgb2s6IGZhbHNlOyByZWFzb246IHN0cmluZyB9IHtcbiAgICBpZiAoIXByb3BlcnR5UGF0aCB8fCB0eXBlb2YgcHJvcGVydHlQYXRoICE9PSAnc3RyaW5nJykge1xuICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogJ3Byb3BlcnR5UGF0aCBtdXN0IGJlIGEgbm9uLWVtcHR5IHN0cmluZycgfTtcbiAgICB9XG4gICAgY29uc3QgaXNWYWxpZFJvb3QgPSBWQUxJRF9NRVRBX1BBVFRFUk5TLnNvbWUocmUgPT4gcmUudGVzdChwcm9wZXJ0eVBhdGgpKTtcbiAgICBpZiAoIWlzVmFsaWRSb290KSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBvazogZmFsc2UsXG4gICAgICAgICAgICByZWFzb246IGBJbnZhbGlkIGFzc2V0LW1ldGEgcGF0aCAnJHtwcm9wZXJ0eVBhdGh9Jy4gQWxsb3dlZCByb290czogdXNlckRhdGEuKiwgc3ViTWV0YXMuKiwgcGxhdGZvcm1TZXR0aW5ncy4qYCxcbiAgICAgICAgfTtcbiAgICB9XG4gICAgY29uc3QgcGFydHMgPSBwcm9wZXJ0eVBhdGguc3BsaXQoJy4nKTtcbiAgICBmb3IgKGNvbnN0IHBhcnQgb2YgcGFydHMpIHtcbiAgICAgICAgaWYgKHBhcnQgPT09ICcnKSB7XG4gICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogYEVtcHR5IHBhdGggc2VnbWVudCBpbiAnJHtwcm9wZXJ0eVBhdGh9JyAoY29uc2VjdXRpdmUgZG90cylgIH07XG4gICAgICAgIH1cbiAgICAgICAgaWYgKEZPUkJJRERFTl9QQVRIX1NFR01FTlRTLmhhcyhwYXJ0KSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246IGBGb3JiaWRkZW4gcGF0aCBzZWdtZW50ICcke3BhcnR9JyBpbiAnJHtwcm9wZXJ0eVBhdGh9JyAocHJvdG90eXBlLXBvbGx1dGlvbiBndWFyZClgIH07XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbn1cblxuY29uc3QgU0lNUExFX1RZUEVTID0gbmV3IFNldChbJ1N0cmluZycsICdOdW1iZXInLCAnQm9vbGVhbicsICdjYy5WYWx1ZVR5cGUnLCAnY2MuT2JqZWN0J10pO1xuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQmFzZUFzc2V0SW50ZXJwcmV0ZXIgaW1wbGVtZW50cyBJQXNzZXRJbnRlcnByZXRlciB7XG4gICAgYWJzdHJhY3QgZ2V0IGltcG9ydGVyVHlwZSgpOiBzdHJpbmc7XG5cbiAgICBhc3luYyBnZXRQcm9wZXJ0aWVzKFxuICAgICAgICBhc3NldEluZm86IEFzc2V0SW5mbyxcbiAgICAgICAgaW5jbHVkZVRvb2x0aXBzOiBib29sZWFuID0gZmFsc2UsXG4gICAgICAgIF91c2VBZHZhbmNlZEluc3BlY3Rpb246IGJvb2xlYW4gPSBmYWxzZSxcbiAgICApOiBQcm9taXNlPEFzc2V0UHJvcGVydGllc0Rlc2NyaXB0aW9uPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBtZXRhOiBhbnkgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldC1tZXRhJywgYXNzZXRJbmZvLnV1aWQpO1xuICAgICAgICAgICAgaWYgKCFtZXRhKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgdXVpZDogYXNzZXRJbmZvLnV1aWQsXG4gICAgICAgICAgICAgICAgICAgIGltcG9ydGVyOiBhc3NldEluZm8uaW1wb3J0ZXIsXG4gICAgICAgICAgICAgICAgICAgIGVycm9yOiBgQXNzZXQgbWV0YSBub3QgZm91bmQgZm9yICR7YXNzZXRJbmZvLnV1aWR9YCxcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgZGVzY3JpcHRpb246IEFzc2V0UHJvcGVydGllc0Rlc2NyaXB0aW9uID0ge1xuICAgICAgICAgICAgICAgIHV1aWQ6IGFzc2V0SW5mby51dWlkLFxuICAgICAgICAgICAgICAgIGltcG9ydGVyOiBhc3NldEluZm8uaW1wb3J0ZXIsXG4gICAgICAgICAgICAgICAgcHJvcGVydGllczoge30sXG4gICAgICAgICAgICAgICAgYXJyYXlzOiB7fSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBpZiAobWV0YS51c2VyRGF0YSkge1xuICAgICAgICAgICAgICAgIHRoaXMuZXh0cmFjdEZyb21Vc2VyRGF0YShtZXRhLnVzZXJEYXRhLCBkZXNjcmlwdGlvbiwgJycsIGluY2x1ZGVUb29sdGlwcyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAobWV0YS5zdWJNZXRhcykge1xuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgW3N1YlV1aWQsIHN1Yk1ldGFdIG9mIE9iamVjdC5lbnRyaWVzKG1ldGEuc3ViTWV0YXMpKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChzdWJNZXRhICYmIHR5cGVvZiBzdWJNZXRhID09PSAnb2JqZWN0JyAmJiAndXNlckRhdGEnIGluIHN1Yk1ldGEgJiYgKHN1Yk1ldGEgYXMgYW55KS51c2VyRGF0YSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgc3ViQXNzZXROYW1lID0gdGhpcy5nZXRTdWJBc3NldE5hbWUoYXNzZXRJbmZvLCBzdWJVdWlkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZXh0cmFjdEZyb21Vc2VyRGF0YSgoc3ViTWV0YSBhcyBhbnkpLnVzZXJEYXRhLCBkZXNjcmlwdGlvbiwgc3ViQXNzZXROYW1lLCBpbmNsdWRlVG9vbHRpcHMpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGRlc2NyaXB0aW9uO1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICB1dWlkOiBhc3NldEluZm8udXVpZCxcbiAgICAgICAgICAgICAgICBpbXBvcnRlcjogYXNzZXRJbmZvLmltcG9ydGVyLFxuICAgICAgICAgICAgICAgIGVycm9yOiBgRXJyb3IgcmVhZGluZyBhc3NldCBwcm9wZXJ0aWVzOiAke2Vycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKX1gLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGFzeW5jIHNldFByb3BlcnRpZXMoXG4gICAgICAgIGFzc2V0SW5mbzogQXNzZXRJbmZvLFxuICAgICAgICBwcm9wZXJ0aWVzOiBQcm9wZXJ0eVNldFNwZWNbXSxcbiAgICApOiBQcm9taXNlPFByb3BlcnR5U2V0UmVzdWx0W10+IHtcbiAgICAgICAgY29uc3QgcmVzdWx0czogUHJvcGVydHlTZXRSZXN1bHRbXSA9IFtdO1xuICAgICAgICBsZXQgbWV0YTogYW55O1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgbWV0YSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0LW1ldGEnLCBhc3NldEluZm8udXVpZCk7XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4gcHJvcGVydGllcy5tYXAocCA9PiAoe1xuICAgICAgICAgICAgICAgIHByb3BlcnR5UGF0aDogcC5wcm9wZXJ0eVBhdGgsXG4gICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgZXJyb3I6IGBxdWVyeS1hc3NldC1tZXRhIGZhaWxlZDogJHtlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycil9YCxcbiAgICAgICAgICAgIH0pKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIW1ldGEpIHtcbiAgICAgICAgICAgIHJldHVybiBwcm9wZXJ0aWVzLm1hcChwID0+ICh7XG4gICAgICAgICAgICAgICAgcHJvcGVydHlQYXRoOiBwLnByb3BlcnR5UGF0aCxcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBlcnJvcjogYEFzc2V0IG1ldGEgbm90IGZvdW5kIGZvciAke2Fzc2V0SW5mby51dWlkfWAsXG4gICAgICAgICAgICB9KSk7XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChjb25zdCBwcm9wIG9mIHByb3BlcnRpZXMpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgb2sgPSBhd2FpdCB0aGlzLnNldFByb3BlcnR5KG1ldGEsIHByb3ApO1xuICAgICAgICAgICAgICAgIHJlc3VsdHMucHVzaCh7IHByb3BlcnR5UGF0aDogcHJvcC5wcm9wZXJ0eVBhdGgsIHN1Y2Nlc3M6IG9rIH0pO1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgICAgICByZXN1bHRzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0eVBhdGg6IHByb3AucHJvcGVydHlQYXRoLFxuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKSxcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAvLyB2Mi40LjQgcmV2aWV3IGZpeCAoY2xhdWRlICsgY29kZXgpOiBzcGxpdCBzYXZlIHZzIHJlZnJlc2hcbiAgICAgICAgLy8gZmFpbHVyZSBoYW5kbGluZy4gdjIuNC4zIGx1bXBlZCBib3RoIGVycm9ycyB0b2dldGhlciB3aGljaFxuICAgICAgICAvLyBtaXNsYWJlbGxlZCB0aGUgc3RhdGUgb24gZGlzazogaWYgc2F2ZSBzdWNjZWVkZWQgYnV0XG4gICAgICAgIC8vIHJlZnJlc2ggdGhyZXcsIHRoZSBkaXNrIG1ldGEgSVMgdXBkYXRlZCBhbmQgb25seSB0aGVcbiAgICAgICAgLy8gcmUtaW1wb3J0IGlzIHN0YWxlIOKAlCBmbGlwcGluZyBldmVyeSBzdWNjZXNzZnVsIGVudHJ5IHRvXG4gICAgICAgIC8vIGZhaWx1cmUgd2FzIHdyb25nLlxuICAgICAgICBsZXQgc2F2ZVN0YXR1czogJ29rJyB8ICdzYXZlLWZhaWxlZCcgfCAncmVmcmVzaC1mYWlsZWQnID0gJ29rJztcbiAgICAgICAgbGV0IHNhdmVFcnJvcjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICAgICAgICBpZiAocmVzdWx0cy5zb21lKHIgPT4gci5zdWNjZXNzKSkge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdzYXZlLWFzc2V0LW1ldGEnLCBhc3NldEluZm8udXVpZCwgSlNPTi5zdHJpbmdpZnkobWV0YSkpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgICAgICBzYXZlU3RhdHVzID0gJ3NhdmUtZmFpbGVkJztcbiAgICAgICAgICAgICAgICBzYXZlRXJyb3IgPSBgc2F2ZS1hc3NldC1tZXRhIGZhaWxlZDogJHtlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycil9YDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChzYXZlU3RhdHVzID09PSAnb2snKSB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncmVmcmVzaC1hc3NldCcsIGFzc2V0SW5mby51cmwpO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICAgICAgICAgIHNhdmVTdGF0dXMgPSAncmVmcmVzaC1mYWlsZWQnO1xuICAgICAgICAgICAgICAgICAgICBzYXZlRXJyb3IgPSBgc2F2ZS1hc3NldC1tZXRhIHN1Y2NlZWRlZCBidXQgcmVmcmVzaC1hc3NldCBmYWlsZWQ6ICR7ZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpfS4gRGlzayBtZXRhIElTIHVwZGF0ZWQ7IGNvY29zIHdpbGwgcGljayB1cCB0aGUgY2hhbmdlIG9uIG5leHQgbWFudWFsIHJlZnJlc2guYDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoc2F2ZVN0YXR1cyA9PT0gJ3NhdmUtZmFpbGVkJykge1xuICAgICAgICAgICAgICAgIC8vIERpc2sgd3JpdGUgbmV2ZXIgaGFwcGVuZWQ7IGZsaXAgaW4tbWVtb3J5IHN1Y2Nlc3Nlc1xuICAgICAgICAgICAgICAgIC8vIHRvIGZhaWxlZCBzbyB0aGUgY2FsbGVyIGtub3dzIG5vdGhpbmcgcGVyc2lzdGVkLlxuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgciBvZiByZXN1bHRzKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChyLnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHIuc3VjY2VzcyA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICAgICAgci5lcnJvciA9IHNhdmVFcnJvcjtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSBpZiAoc2F2ZVN0YXR1cyA9PT0gJ3JlZnJlc2gtZmFpbGVkJykge1xuICAgICAgICAgICAgICAgIC8vIERpc2sgd3JpdGUgaGFwcGVuZWQgYnV0IHJlLWltcG9ydCBpcyBzdGFsZTsgZmxhZ1xuICAgICAgICAgICAgICAgIC8vIGVhY2ggc3VjY2Vzc2Z1bCBlbnRyeSB3aXRoIGEgd2FybmluZyB0aGF0IGRvZXNuJ3RcbiAgICAgICAgICAgICAgICAvLyByZXZlcnNlIHRoZSB3cml0ZSBzdGF0dXMuIHYyLjQuNTogd2FybmluZyBpcyBub3cgYVxuICAgICAgICAgICAgICAgIC8vIGRlY2xhcmVkIGZpZWxkIG9uIFByb3BlcnR5U2V0UmVzdWx0LCBubyBgYXMgYW55YC5cbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IHIgb2YgcmVzdWx0cykge1xuICAgICAgICAgICAgICAgICAgICBpZiAoci5zdWNjZXNzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByLndhcm5pbmcgPSBzYXZlRXJyb3I7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdHM7XG4gICAgfVxuXG4gICAgcHJvdGVjdGVkIGV4dHJhY3RGcm9tVXNlckRhdGEoXG4gICAgICAgIHVzZXJEYXRhOiBhbnksXG4gICAgICAgIGRlc2NyaXB0aW9uOiBBc3NldFByb3BlcnRpZXNEZXNjcmlwdGlvbixcbiAgICAgICAgcGF0aFByZWZpeDogc3RyaW5nLFxuICAgICAgICBpbmNsdWRlVG9vbHRpcHM6IGJvb2xlYW4sXG4gICAgKTogdm9pZCB7XG4gICAgICAgIGlmICghdXNlckRhdGEgfHwgdHlwZW9mIHVzZXJEYXRhICE9PSAnb2JqZWN0JykgcmV0dXJuO1xuICAgICAgICBjb25zdCBvdXQgPSB0aGlzLmV4dHJhY3RSZWN1cnNpdmUodXNlckRhdGEsIHBhdGhQcmVmaXgsIGluY2x1ZGVUb29sdGlwcyk7XG4gICAgICAgIE9iamVjdC5hc3NpZ24oZGVzY3JpcHRpb24ucHJvcGVydGllcyEsIG91dC5wcm9wZXJ0aWVzKTtcbiAgICAgICAgT2JqZWN0LmFzc2lnbihkZXNjcmlwdGlvbi5hcnJheXMhLCBvdXQuYXJyYXlzKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGV4dHJhY3RSZWN1cnNpdmUoXG4gICAgICAgIG9iajogYW55LFxuICAgICAgICBiYXNlUGF0aDogc3RyaW5nLFxuICAgICAgICBpbmNsdWRlVG9vbHRpcHM6IGJvb2xlYW4sXG4gICAgKTogeyBwcm9wZXJ0aWVzOiBSZWNvcmQ8c3RyaW5nLCBBc3NldFByb3BlcnRpZXNEZXNjcmlwdGlvblsncHJvcGVydGllcyddIGV4dGVuZHMgaW5mZXIgUCA/IFAgZXh0ZW5kcyBSZWNvcmQ8c3RyaW5nLCBpbmZlciBWPiA/IFYgOiBuZXZlciA6IG5ldmVyPjsgYXJyYXlzOiBSZWNvcmQ8c3RyaW5nLCBBc3NldFByb3BlcnRpZXNEZXNjcmlwdGlvblsnYXJyYXlzJ10gZXh0ZW5kcyBpbmZlciBBID8gQSBleHRlbmRzIFJlY29yZDxzdHJpbmcsIGluZmVyIFY+ID8gViA6IG5ldmVyIDogbmV2ZXI+IH0ge1xuICAgICAgICBjb25zdCBwcm9wZXJ0aWVzOiBSZWNvcmQ8c3RyaW5nLCBhbnk+ID0ge307XG4gICAgICAgIGNvbnN0IGFycmF5czogUmVjb3JkPHN0cmluZywgYW55PiA9IHt9O1xuICAgICAgICBpZiAoIW9iaiB8fCB0eXBlb2Ygb2JqICE9PSAnb2JqZWN0JykgcmV0dXJuIHsgcHJvcGVydGllcywgYXJyYXlzIH07XG4gICAgICAgIGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKG9iaikpIHtcbiAgICAgICAgICAgIC8vIFNraXAgcHJpdmF0ZS9pbnRlcm5hbCBmaWVsZHMuIEFJIHNob3VsZG4ndCBiZSBwb2tpbmcgYXRcbiAgICAgICAgICAgIC8vIF9pbnRlcm5hbCBjb2NvcyBib29ra2VlcGluZy5cbiAgICAgICAgICAgIGlmIChrZXkuc3RhcnRzV2l0aCgnXycpKSBjb250aW51ZTtcbiAgICAgICAgICAgIGNvbnN0IGN1cnJlbnRQYXRoID0gYmFzZVBhdGggPyBgJHtiYXNlUGF0aH0uJHtrZXl9YCA6IGtleTtcbiAgICAgICAgICAgIGNvbnN0IHByb3BlcnR5RGF0YSA9IG9ialtrZXldO1xuICAgICAgICAgICAgaWYgKHByb3BlcnR5RGF0YSAmJiB0eXBlb2YgcHJvcGVydHlEYXRhID09PSAnb2JqZWN0JyAmJiBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocHJvcGVydHlEYXRhLCAndmFsdWUnKSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHByb3BlcnR5SW5mbzogYW55ID0ge1xuICAgICAgICAgICAgICAgICAgICB0eXBlOiBwcm9wZXJ0eURhdGEudHlwZSB8fCAnVW5rbm93bicsXG4gICAgICAgICAgICAgICAgICAgIHZhbHVlOiBwcm9wZXJ0eURhdGEudmFsdWUsXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICBpZiAocHJvcGVydHlEYXRhLnRvb2x0aXAgJiYgaW5jbHVkZVRvb2x0aXBzKSB7XG4gICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBlZGl0b3IgPSAoZ2xvYmFsVGhpcyBhcyBhbnkpLkVkaXRvcjtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChlZGl0b3I/LkkxOG4/LnQgJiYgdHlwZW9mIHByb3BlcnR5RGF0YS50b29sdGlwID09PSAnc3RyaW5nJyAmJiBwcm9wZXJ0eURhdGEudG9vbHRpcC5zdGFydHNXaXRoKCdpMThuOicpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvcGVydHlJbmZvLnRvb2x0aXAgPSBlZGl0b3IuSTE4bi50KHByb3BlcnR5RGF0YS50b29sdGlwLnNsaWNlKDUpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvcGVydHlJbmZvLnRvb2x0aXAgPSBwcm9wZXJ0eURhdGEudG9vbHRpcDtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0eUluZm8udG9vbHRpcCA9IHByb3BlcnR5RGF0YS50b29sdGlwO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChwcm9wZXJ0eURhdGEudHlwZSA9PT0gJ0VudW0nICYmIHByb3BlcnR5RGF0YS5lbnVtTGlzdCkge1xuICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0eUluZm8uZW51bUxpc3QgPSBwcm9wZXJ0eURhdGEuZW51bUxpc3Q7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChwcm9wZXJ0eURhdGEuaXNBcnJheSkge1xuICAgICAgICAgICAgICAgICAgICBhcnJheXNbY3VycmVudFBhdGhdID0geyB0eXBlOiBwcm9wZXJ0eUluZm8udHlwZSwgdG9vbHRpcDogcHJvcGVydHlJbmZvLnRvb2x0aXAgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29uc3QgaXNDb21wbGV4ID0gcHJvcGVydHlEYXRhLnZhbHVlXG4gICAgICAgICAgICAgICAgICAgICYmICgodHlwZW9mIHByb3BlcnR5RGF0YS52YWx1ZSA9PT0gJ29iamVjdCdcbiAgICAgICAgICAgICAgICAgICAgICAgICYmICFTSU1QTEVfVFlQRVMuaGFzKHByb3BlcnR5RGF0YS50eXBlKVxuICAgICAgICAgICAgICAgICAgICAgICAgJiYgIShBcnJheS5pc0FycmF5KHByb3BlcnR5RGF0YS5leHRlbmRzKSAmJiBwcm9wZXJ0eURhdGEuZXh0ZW5kcy5zb21lKChleHQ6IHN0cmluZykgPT4gU0lNUExFX1RZUEVTLmhhcyhleHQpKSkpXG4gICAgICAgICAgICAgICAgICAgICAgICB8fCBBcnJheS5pc0FycmF5KHByb3BlcnR5RGF0YS52YWx1ZSkpO1xuICAgICAgICAgICAgICAgIGlmIChpc0NvbXBsZXgpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbmVzdGVkID0gdGhpcy5leHRyYWN0UmVjdXJzaXZlKHByb3BlcnR5RGF0YS52YWx1ZSwgY3VycmVudFBhdGgsIGluY2x1ZGVUb29sdGlwcyk7XG4gICAgICAgICAgICAgICAgICAgIE9iamVjdC5hc3NpZ24ocHJvcGVydGllcywgbmVzdGVkLnByb3BlcnRpZXMpO1xuICAgICAgICAgICAgICAgICAgICBPYmplY3QuYXNzaWduKGFycmF5cywgbmVzdGVkLmFycmF5cyk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcHJvcGVydGllc1tjdXJyZW50UGF0aF0gPSBwcm9wZXJ0eUluZm87XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eURhdGEgIT09IG51bGwgJiYgdHlwZW9mIHByb3BlcnR5RGF0YSA9PT0gJ29iamVjdCcgJiYgIUFycmF5LmlzQXJyYXkocHJvcGVydHlEYXRhKSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IG5lc3RlZCA9IHRoaXMuZXh0cmFjdFJlY3Vyc2l2ZShwcm9wZXJ0eURhdGEsIGN1cnJlbnRQYXRoLCBpbmNsdWRlVG9vbHRpcHMpO1xuICAgICAgICAgICAgICAgIE9iamVjdC5hc3NpZ24ocHJvcGVydGllcywgbmVzdGVkLnByb3BlcnRpZXMpO1xuICAgICAgICAgICAgICAgIE9iamVjdC5hc3NpZ24oYXJyYXlzLCBuZXN0ZWQuYXJyYXlzKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcHJvcGVydGllc1tjdXJyZW50UGF0aF0gPSB7XG4gICAgICAgICAgICAgICAgICAgIHR5cGU6IHRoaXMuaW5mZXJQcm9wZXJ0eVR5cGUocHJvcGVydHlEYXRhKSxcbiAgICAgICAgICAgICAgICAgICAgdmFsdWU6IHByb3BlcnR5RGF0YSxcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7IHByb3BlcnRpZXMsIGFycmF5cyB9O1xuICAgIH1cblxuICAgIHByb3RlY3RlZCBpbmZlclByb3BlcnR5VHlwZSh2YWx1ZTogYW55KTogc3RyaW5nIHtcbiAgICAgICAgaWYgKHZhbHVlID09PSBudWxsIHx8IHZhbHVlID09PSB1bmRlZmluZWQpIHJldHVybiAnVW5rbm93bic7XG4gICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdib29sZWFuJykgcmV0dXJuICdCb29sZWFuJztcbiAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicpIHJldHVybiAnTnVtYmVyJztcbiAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHJldHVybiAnU3RyaW5nJztcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSByZXR1cm4gJ0FycmF5JztcbiAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwodmFsdWUsICdfX3R5cGVfXycpKSByZXR1cm4gKHZhbHVlIGFzIGFueSkuX190eXBlX187XG4gICAgICAgICAgICByZXR1cm4gJ09iamVjdCc7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuICdVbmtub3duJztcbiAgICB9XG5cbiAgICBwcm90ZWN0ZWQgZ2V0U3ViQXNzZXROYW1lKGFzc2V0SW5mbzogQXNzZXRJbmZvLCBzdWJVdWlkOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgICAgICBjb25zdCBzdWJBc3NldHMgPSAoYXNzZXRJbmZvIGFzIGFueSkuc3ViQXNzZXRzO1xuICAgICAgICBpZiAoc3ViQXNzZXRzICYmIHN1YkFzc2V0c1tzdWJVdWlkXT8ubmFtZSkgcmV0dXJuIHN1YkFzc2V0c1tzdWJVdWlkXS5uYW1lO1xuICAgICAgICByZXR1cm4gc3ViVXVpZDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEZWZhdWx0IHNldHRlciDigJQgdmFsaWRhdGVzIHBhdGggdGhyb3VnaCBgaXNQYXRoU2FmZWAgKHJvb3QgK1xuICAgICAqIGZvcmJpZGRlbi1zZWdtZW50IGd1YXJkKSwgd2Fsa3MgdGhlIGRvdHRlZCBwYXRoIGNyZWF0aW5nIG9ubHlcbiAgICAgKiBhbGxvd2VkIGludGVybWVkaWF0ZSBjb250YWluZXJzLCBhbmQgd3JpdGVzIHRoZSBjb2VyY2VkIHZhbHVlXG4gICAgICogYXQgdGhlIGxlYWYuIFNwZWNpYWxpemVkIGludGVycHJldGVycyBvdmVycmlkZSB0aGlzIHdoZW4gdGhlaXJcbiAgICAgKiBtZXRhIGxheW91dCBuZWVkcyBjdXN0b20gcm91dGluZyAoZS5nLiBJbWFnZUludGVycHJldGVyJ3MgbWFpblxuICAgICAqIHZzIHN1Yi1hc3NldCBzcGxpdCkuXG4gICAgICpcbiAgICAgKiB2Mi40LjU6IHJlbW92ZWQgbWlzbGVhZGluZyBcIk9iamVjdC5jcmVhdGUobnVsbClcIiBjbGFpbSBmcm9tXG4gICAgICogdGhlIEpTRG9jIOKAlCB0aGUgYXV0by1jcmVhdGVkIGNvbnRhaW5lcnMgYXJlIHBsYWluIGB7fWAuIFRoZVxuICAgICAqIGZvcmJpZGRlbi1zZWdtZW50IGd1YXJkIChfX3Byb3RvX18gLyBjb25zdHJ1Y3RvciAvIHByb3RvdHlwZSlcbiAgICAgKiBpcyB3aGF0IGJsb2NrcyBwb2xsdXRpb247IHRoZSBjb250YWluZXIgc2hhcGUgZG9lc24ndCBtYXR0ZXJcbiAgICAgKiBmb3IgdGhhdCBwcm90ZWN0aW9uLlxuICAgICAqL1xuICAgIHByb3RlY3RlZCBhc3luYyBzZXRQcm9wZXJ0eShtZXRhOiBhbnksIHByb3A6IFByb3BlcnR5U2V0U3BlYyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgICAgICBjb25zdCBzYWZlID0gaXNQYXRoU2FmZShwcm9wLnByb3BlcnR5UGF0aCk7XG4gICAgICAgIGlmICghc2FmZS5vaykgdGhyb3cgbmV3IEVycm9yKHNhZmUucmVhc29uKTtcbiAgICAgICAgY29uc3QgcGF0aFBhcnRzID0gcHJvcC5wcm9wZXJ0eVBhdGguc3BsaXQoJy4nKTtcbiAgICAgICAgbGV0IGN1cnJlbnQgPSBtZXRhO1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHBhdGhQYXJ0cy5sZW5ndGggLSAxOyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IHBhcnQgPSBwYXRoUGFydHNbaV07XG4gICAgICAgICAgICBpZiAoY3VycmVudFtwYXJ0XSA9PT0gdW5kZWZpbmVkIHx8IGN1cnJlbnRbcGFydF0gPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBpZiAocGFydCA9PT0gJ3VzZXJEYXRhJyB8fCBwYXJ0ID09PSAnc3ViTWV0YXMnIHx8IHBhcnQgPT09ICdwbGF0Zm9ybVNldHRpbmdzJykge1xuICAgICAgICAgICAgICAgICAgICBjdXJyZW50W3BhcnRdID0ge307XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChpID4gMCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBBdXRvLWNyZWF0ZSBpbnNpZGUgYW4gYWxyZWFkeS1hbGxvd2VkIHJvb3QuXG4gICAgICAgICAgICAgICAgICAgIGN1cnJlbnRbcGFydF0gPSB7fTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCBjcmVhdGUgdG9wLWxldmVsIG1ldGEgZmllbGQgJyR7cGFydH0nIChwYXRoOiAke3Byb3AucHJvcGVydHlQYXRofSlgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjdXJyZW50ID0gY3VycmVudFtwYXJ0XTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBmaW5hbEtleSA9IHBhdGhQYXJ0c1twYXRoUGFydHMubGVuZ3RoIC0gMV07XG4gICAgICAgIGN1cnJlbnRbZmluYWxLZXldID0gdGhpcy5jb252ZXJ0UHJvcGVydHlWYWx1ZShwcm9wLnByb3BlcnR5VmFsdWUsIHByb3AucHJvcGVydHlUeXBlKTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgcHJvdGVjdGVkIGNvbnZlcnRQcm9wZXJ0eVZhbHVlKHZhbHVlOiBhbnksIHR5cGU6IHN0cmluZyk6IGFueSB7XG4gICAgICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgICAgICAgY2FzZSAnQm9vbGVhbic6XG4gICAgICAgICAgICAgICAgLy8gdjIuNC40IHJldmlldyBmaXggKGNvZGV4KTogQm9vbGVhbihcImZhbHNlXCIpID09PSB0cnVlXG4gICAgICAgICAgICAgICAgLy8gd291bGQgc2lsZW50bHkgZmxpcCB0aGUgbWVhbmluZyBvZiBhbiBBSS1zdXBwbGllZFxuICAgICAgICAgICAgICAgIC8vIHN0cmluZy4gVHJlYXQgdGhlIHRleHR1YWwgdmFyaWFudHMgZXhwbGljaXRseTsgb25seVxuICAgICAgICAgICAgICAgIC8vIHRydWx5IGVtcHR5IC8gbnVsbCAvIDAgYXJlIGZhbHN5LlxuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGxvd2VyID0gdmFsdWUudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChsb3dlciA9PT0gJ2ZhbHNlJyB8fCBsb3dlciA9PT0gJzAnIHx8IGxvd2VyID09PSAnJykgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICBpZiAobG93ZXIgPT09ICd0cnVlJyB8fCBsb3dlciA9PT0gJzEnKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDYW5ub3QgY29lcmNlIHN0cmluZyAnJHt2YWx1ZX0nIHRvIEJvb2xlYW4gKHVzZSB0cnVlL2ZhbHNlLzEvMClgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIEJvb2xlYW4odmFsdWUpO1xuICAgICAgICAgICAgY2FzZSAnTnVtYmVyJzpcbiAgICAgICAgICAgIGNhc2UgJ0Zsb2F0Jzoge1xuICAgICAgICAgICAgICAgIC8vIHYyLjQuNSByZXZpZXcgZml4IChjbGF1ZGUgKyBjb2RleCArIGdlbWluaSk6XG4gICAgICAgICAgICAgICAgLy8gcGFyc2VGbG9hdCgnMS4yLjMnKSBzaWxlbnRseSByZXR1cm5zIDEuMiDigJQgdG9vXG4gICAgICAgICAgICAgICAgLy8gbGVuaWVudC4gVXNlIE51bWJlcigpIHdoaWNoIHJlamVjdHMgdHJhaWxpbmcgZ2FyYmFnZVxuICAgICAgICAgICAgICAgIC8vIGJ5IHJldHVybmluZyBOYU4uXG4gICAgICAgICAgICAgICAgLy9cbiAgICAgICAgICAgICAgICAvLyB2Mi40LjYgcmV2aWV3IGZpeGVzOlxuICAgICAgICAgICAgICAgIC8vICAgLSBjb2RleCDwn5S0OiBOdW1iZXIoJycpID09PSAwIHNpbGVudGx5IGNvZXJjZXMgYW5cbiAgICAgICAgICAgICAgICAvLyAgICAgZW1wdHkgc3RyaW5nIHRvIHplcm8uIFJlamVjdCBleHBsaWNpdGx5IHNvIEFJXG4gICAgICAgICAgICAgICAgLy8gICAgIGRvZXNuJ3QgYWNjaWRlbnRhbGx5IHdyaXRlIDAgd2hlbiBpdCBtZWFudCB0b1xuICAgICAgICAgICAgICAgIC8vICAgICBvbWl0IGEgdmFsdWUuXG4gICAgICAgICAgICAgICAgLy8gICAtIGNvZGV4IPCfn6E6IE51bWJlcignSW5maW5pdHknKSA9PT0gSW5maW5pdHkgcGFzc2VzXG4gICAgICAgICAgICAgICAgLy8gICAgIHRoZSBOYU4gY2hlY2suIFVzZSBOdW1iZXIuaXNGaW5pdGUgdG8gcmVqZWN0XG4gICAgICAgICAgICAgICAgLy8gICAgIMKxSW5maW5pdHkgZm9yIHRoZSBhc3NldC1tZXRhIG51bWVyaWMgcGF0aCDigJRcbiAgICAgICAgICAgICAgICAvLyAgICAgY29jb3MgYXNzZXQgcHJvcGVydGllcyBuZXZlciB3YW50IGluZmluaXRlXG4gICAgICAgICAgICAgICAgLy8gICAgIHZhbHVlcywgc28gdGhpcyBpcyBmYWlsLWZhc3QuXG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcyA9IFN0cmluZyh2YWx1ZSkudHJpbSgpO1xuICAgICAgICAgICAgICAgICAgICBpZiAocyA9PT0gJycpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgQ2Fubm90IGNvZXJjZSBlbXB0eSBzdHJpbmcgdG8gJHt0eXBlfWApO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG4gPSBOdW1iZXIocyk7XG4gICAgICAgICAgICAgICAgICAgIGlmICghTnVtYmVyLmlzRmluaXRlKG4pKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCBjb2VyY2UgJyR7dmFsdWV9JyB0byAke3R5cGV9IChub3QgYSBmaW5pdGUgbnVtYmVyKWApO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoIU51bWJlci5pc0Zpbml0ZSh2YWx1ZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDYW5ub3QgY29lcmNlICR7dmFsdWV9IHRvICR7dHlwZX0gKG5vdCBhIGZpbml0ZSBudW1iZXIpYCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhc2UgJ1N0cmluZyc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIFN0cmluZyh2YWx1ZSk7XG4gICAgICAgICAgICBjYXNlICdJbnRlZ2VyJzoge1xuICAgICAgICAgICAgICAgIC8vIHYyLjQuNTogc3RyaWN0ZXIgdGhhbiBwYXJzZUludCDigJQgJzEyM2ZvbycgbXVzdCB0aHJvdyxcbiAgICAgICAgICAgICAgICAvLyBub3Qgc2lsZW50bHkgdHJ1bmNhdGUgdG8gMTIzLiBBbGxvdyBsZWFkaW5nIHNpZ24gYW5kXG4gICAgICAgICAgICAgICAgLy8gb3B0aW9uYWwgc3Vycm91bmRpbmcgd2hpdGVzcGFjZS5cbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJykge1xuICAgICAgICAgICAgICAgICAgICBpZiAoIU51bWJlci5pc0Zpbml0ZSh2YWx1ZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgQ2Fubm90IGNvZXJjZSAke3ZhbHVlfSB0byBJbnRlZ2VyIChub3QgZmluaXRlKWApO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBNYXRoLnRydW5jKHZhbHVlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29uc3QgcyA9IFN0cmluZyh2YWx1ZSkudHJpbSgpO1xuICAgICAgICAgICAgICAgIGlmICghL14tP1xcZCskLy50ZXN0KHMpKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgQ2Fubm90IGNvZXJjZSAnJHt2YWx1ZX0nIHRvIEludGVnZXIgKG11c3QgbWF0Y2ggL14tP1xcXFxkKyQvKWApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBuID0gcGFyc2VJbnQocywgMTApO1xuICAgICAgICAgICAgICAgIGlmIChOdW1iZXIuaXNOYU4obikpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDYW5ub3QgY29lcmNlICcke3ZhbHVlfScgdG8gSW50ZWdlciAocGFyc2VJbnQgLT4gTmFOKWApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gbjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhc2UgJ0VudW0nOlxuICAgICAgICAgICAgY2FzZSAnY2MuVmFsdWVUeXBlJzpcbiAgICAgICAgICAgIGNhc2UgJ2NjLk9iamVjdCc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnYm9vbGVhbicpIHJldHVybiBCb29sZWFuKHZhbHVlKTtcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJykgcmV0dXJuIE51bWJlcih2YWx1ZSk7XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHJldHVybiBTdHJpbmcodmFsdWUpO1xuICAgICAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgICAgfVxuICAgIH1cbn1cbiJdfQ==