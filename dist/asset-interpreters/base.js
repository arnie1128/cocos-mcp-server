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
const VALID_META_PATTERNS = [
    /^userData\./,
    /^subMetas\./,
    /^platformSettings\./,
    /^importer$/,
    /^importerVersion$/,
    /^sourceUuid$/,
    /^isGroup$/,
    /^folder$/,
];
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
        var _a, _b;
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
        if (results.some(r => r.success)) {
            try {
                await Editor.Message.request('asset-db', 'save-asset-meta', assetInfo.uuid, JSON.stringify(meta));
                // refresh-asset triggers re-import with the new settings;
                // without it, the disk meta is updated but cocos keeps
                // the old imported asset until next manual refresh.
                await Editor.Message.request('asset-db', 'refresh-asset', assetInfo.url);
            }
            catch (err) {
                // Annotate every successful set with the persistence
                // failure so the caller sees the partial outcome.
                for (const r of results) {
                    if (r.success) {
                        r.success = false;
                        r.error = `set succeeded in-memory but save-asset-meta/refresh failed: ${(_b = err === null || err === void 0 ? void 0 : err.message) !== null && _b !== void 0 ? _b : String(err)}`;
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
     * Default setter — validates path against VALID_META_PATTERNS,
     * walks the dotted path creating only allowed intermediate
     * containers, and writes the coerced value at the leaf.
     * Specialized interpreters override this when their meta layout
     * needs custom routing (e.g. ImageInterpreter's main vs
     * sub-asset split).
     */
    async setProperty(meta, prop) {
        const isValid = VALID_META_PATTERNS.some(re => re.test(prop.propertyPath));
        if (!isValid) {
            throw new Error(`Invalid asset-meta path '${prop.propertyPath}'. Allowed roots: userData.*, subMetas.*, platformSettings.*, importer, importerVersion, sourceUuid, isGroup, folder.`);
        }
        const pathParts = prop.propertyPath.split('.');
        let current = meta;
        for (let i = 0; i < pathParts.length - 1; i++) {
            const part = pathParts[i];
            if (current[part] === undefined || current[part] === null) {
                if (part === 'userData' || part === 'subMetas' || part === 'platformSettings') {
                    current[part] = {};
                }
                else if (i > 0) {
                    // Allow auto-create inside an already-allowed root.
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
                return Boolean(value);
            case 'Number':
            case 'Float':
                return parseFloat(String(value));
            case 'String':
                return String(value);
            case 'Integer':
                return parseInt(String(value), 10);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFzZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NvdXJjZS9hc3NldC1pbnRlcnByZXRlcnMvYmFzZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBdUJHOzs7QUFVSCxNQUFNLG1CQUFtQixHQUFhO0lBQ2xDLGFBQWE7SUFDYixhQUFhO0lBQ2IscUJBQXFCO0lBQ3JCLFlBQVk7SUFDWixtQkFBbUI7SUFDbkIsY0FBYztJQUNkLFdBQVc7SUFDWCxVQUFVO0NBQ2IsQ0FBQztBQUVGLE1BQU0sWUFBWSxHQUFHLElBQUksR0FBRyxDQUFDLENBQUMsUUFBUSxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsY0FBYyxFQUFFLFdBQVcsQ0FBQyxDQUFDLENBQUM7QUFFM0YsTUFBc0Isb0JBQW9CO0lBR3RDLEtBQUssQ0FBQyxhQUFhLENBQ2YsU0FBb0IsRUFDcEIsa0JBQTJCLEtBQUssRUFDaEMseUJBQWtDLEtBQUs7O1FBRXZDLElBQUksQ0FBQztZQUNELE1BQU0sSUFBSSxHQUFRLE1BQU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsVUFBVSxFQUFFLGtCQUFrQixFQUFFLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUMvRixJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQ1IsT0FBTztvQkFDSCxJQUFJLEVBQUUsU0FBUyxDQUFDLElBQUk7b0JBQ3BCLFFBQVEsRUFBRSxTQUFTLENBQUMsUUFBUTtvQkFDNUIsS0FBSyxFQUFFLDRCQUE0QixTQUFTLENBQUMsSUFBSSxFQUFFO2lCQUN0RCxDQUFDO1lBQ04sQ0FBQztZQUNELE1BQU0sV0FBVyxHQUErQjtnQkFDNUMsSUFBSSxFQUFFLFNBQVMsQ0FBQyxJQUFJO2dCQUNwQixRQUFRLEVBQUUsU0FBUyxDQUFDLFFBQVE7Z0JBQzVCLFVBQVUsRUFBRSxFQUFFO2dCQUNkLE1BQU0sRUFBRSxFQUFFO2FBQ2IsQ0FBQztZQUNGLElB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SyxDQUFDLENBQUM7Z0JBQ3RELElBQUksT0FBTyxLQUFLLEtBQUssUUFBUTtvQkFBRSxPQUFPLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDcEQsSUFBSSxPQUFPLEtBQUssS0FBSyxRQUFRO29CQUFFLE9BQU8sTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUNwRCxPQUFPLEtBQUssQ0FBQztRQUNyQixDQUFDO0lBQ0wsQ0FBQztDQUNKO0FBM1BELG9EQTJQQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQmFzZUFzc2V0SW50ZXJwcmV0ZXIg4oCUIHNoYXJlZCBnZXRQcm9wZXJ0aWVzIC8gc2V0UHJvcGVydGllcyBmb3IgdGhlXG4gKiBhc3NldC1tZXRhIGVkaXRpbmcgdG9vbHMuIFNwZWNpYWxpemVkIGludGVycHJldGVycyBleHRlbmQgdGhpcyBhbmRcbiAqIG92ZXJyaWRlIGBpbXBvcnRlclR5cGVgIChhbHdheXMpIHBsdXMgb3B0aW9uYWxseSBgc2V0UHJvcGVydHlgIC9cbiAqIGBnZXRQcm9wZXJ0aWVzYCBmb3IgdHlwZS1zcGVjaWZpYyBsYXlvdXRzLlxuICpcbiAqIFBhdGgtdmFsaWRhdGlvbiBwb2xpY3kgKENMQVVERS5tZCBsYW5kbWluZSBjYW5kaWRhdGUpOlxuICogICBBSS1nZW5lcmF0ZWQgcHJvcGVydHkgcGF0aHMgcnVuIHRocm91Z2ggYFZBTElEX01FVEFfUEFUVEVSTlNgXG4gKiAgIGJlZm9yZSBhbnkgbWV0YSBtdXRhdGlvbi4gQW55dGhpbmcgb3V0c2lkZSBgdXNlckRhdGEuKmAsXG4gKiAgIGBzdWJNZXRhcy4qYCwgYHBsYXRmb3JtU2V0dGluZ3MuKmAsIG9yIHRoZSBzbWFsbCBhbGxvdy1saXN0IG9mXG4gKiAgIGF0b21pYyB0b3AtbGV2ZWwga2V5cyBpcyByZWplY3RlZC4gVGhpcyBzdG9wcyBhIGNvbmZ1c2VkIEFJIGZyb21cbiAqICAgY2xvYmJlcmluZyBzdHJ1Y3R1cmFsIG1ldGEgZmllbGRzIGxpa2UgYF9fdHlwZV9fYCBvciByZXdyaXRpbmdcbiAqICAgYHZlcmAgYW5kIGJyZWFraW5nIHJlLWltcG9ydC5cbiAqXG4gKiBTYXZlIHNlbWFudGljczpcbiAqICAgYHNhdmUtYXNzZXQtbWV0YWAgZm9sbG93ZWQgYnkgYHJlZnJlc2gtYXNzZXRgIHBlciBSb21hUm9nb3YgcmVmLlxuICogICBSZWZyZXNoIGlzIHdoYXQgdHJpZ2dlcnMgY29jb3MgdG8gcmUtaW1wb3J0IHdpdGggdGhlIG5ldyBzZXR0aW5ncztcbiAqICAgd2l0aG91dCBpdCB0aGUgbmV3IHVzZXJEYXRhIHBlcnNpc3RzIGJ1dCB0aGUgaW1wb3J0ZWQgYXNzZXQgZG9lc24ndFxuICogICBwaWNrIHVwIHRoZSBjaGFuZ2UgdW50aWwgdGhlIG5leHQgbWFudWFsIHJlZnJlc2guXG4gKlxuICogUmVmZXJlbmNlOiBSb21hUm9nb3YtY29jb3MtbWNwIGBiYXNlLWludGVycHJldGVyLnRzYC4gV2Uga2VlcCB0aGVcbiAqIGV4dHJhY3Rpb24gbG9naWMgc2hhcGUgY2xvc2UgdG8gdXBzdHJlYW0gc28gZnV0dXJlIGJ1ZyBmaXhlcyB0aGVyZVxuICogcG9ydCBjbGVhbmx5LlxuICovXG5cbmltcG9ydCB0eXBlIHsgQXNzZXRJbmZvIH0gZnJvbSAnQGNvY29zL2NyZWF0b3ItdHlwZXMvZWRpdG9yL3BhY2thZ2VzL2Fzc2V0LWRiL0B0eXBlcy9wdWJsaWMnO1xuaW1wb3J0IHtcbiAgICBBc3NldFByb3BlcnRpZXNEZXNjcmlwdGlvbixcbiAgICBJQXNzZXRJbnRlcnByZXRlcixcbiAgICBQcm9wZXJ0eVNldFNwZWMsXG4gICAgUHJvcGVydHlTZXRSZXN1bHQsXG59IGZyb20gJy4vaW50ZXJmYWNlJztcblxuY29uc3QgVkFMSURfTUVUQV9QQVRURVJOUzogUmVnRXhwW10gPSBbXG4gICAgL151c2VyRGF0YVxcLi8sXG4gICAgL15zdWJNZXRhc1xcLi8sXG4gICAgL15wbGF0Zm9ybVNldHRpbmdzXFwuLyxcbiAgICAvXmltcG9ydGVyJC8sXG4gICAgL15pbXBvcnRlclZlcnNpb24kLyxcbiAgICAvXnNvdXJjZVV1aWQkLyxcbiAgICAvXmlzR3JvdXAkLyxcbiAgICAvXmZvbGRlciQvLFxuXTtcblxuY29uc3QgU0lNUExFX1RZUEVTID0gbmV3IFNldChbJ1N0cmluZycsICdOdW1iZXInLCAnQm9vbGVhbicsICdjYy5WYWx1ZVR5cGUnLCAnY2MuT2JqZWN0J10pO1xuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQmFzZUFzc2V0SW50ZXJwcmV0ZXIgaW1wbGVtZW50cyBJQXNzZXRJbnRlcnByZXRlciB7XG4gICAgYWJzdHJhY3QgZ2V0IGltcG9ydGVyVHlwZSgpOiBzdHJpbmc7XG5cbiAgICBhc3luYyBnZXRQcm9wZXJ0aWVzKFxuICAgICAgICBhc3NldEluZm86IEFzc2V0SW5mbyxcbiAgICAgICAgaW5jbHVkZVRvb2x0aXBzOiBib29sZWFuID0gZmFsc2UsXG4gICAgICAgIF91c2VBZHZhbmNlZEluc3BlY3Rpb246IGJvb2xlYW4gPSBmYWxzZSxcbiAgICApOiBQcm9taXNlPEFzc2V0UHJvcGVydGllc0Rlc2NyaXB0aW9uPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBtZXRhOiBhbnkgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldC1tZXRhJywgYXNzZXRJbmZvLnV1aWQpO1xuICAgICAgICAgICAgaWYgKCFtZXRhKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgdXVpZDogYXNzZXRJbmZvLnV1aWQsXG4gICAgICAgICAgICAgICAgICAgIGltcG9ydGVyOiBhc3NldEluZm8uaW1wb3J0ZXIsXG4gICAgICAgICAgICAgICAgICAgIGVycm9yOiBgQXNzZXQgbWV0YSBub3QgZm91bmQgZm9yICR7YXNzZXRJbmZvLnV1aWR9YCxcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgZGVzY3JpcHRpb246IEFzc2V0UHJvcGVydGllc0Rlc2NyaXB0aW9uID0ge1xuICAgICAgICAgICAgICAgIHV1aWQ6IGFzc2V0SW5mby51dWlkLFxuICAgICAgICAgICAgICAgIGltcG9ydGVyOiBhc3NldEluZm8uaW1wb3J0ZXIsXG4gICAgICAgICAgICAgICAgcHJvcGVydGllczoge30sXG4gICAgICAgICAgICAgICAgYXJyYXlzOiB7fSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBpZiAobWV0YS51c2VyRGF0YSkge1xuICAgICAgICAgICAgICAgIHRoaXMuZXh0cmFjdEZyb21Vc2VyRGF0YShtZXRhLnVzZXJEYXRhLCBkZXNjcmlwdGlvbiwgJycsIGluY2x1ZGVUb29sdGlwcyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAobWV0YS5zdWJNZXRhcykge1xuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgW3N1YlV1aWQsIHN1Yk1ldGFdIG9mIE9iamVjdC5lbnRyaWVzKG1ldGEuc3ViTWV0YXMpKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChzdWJNZXRhICYmIHR5cGVvZiBzdWJNZXRhID09PSAnb2JqZWN0JyAmJiAndXNlckRhdGEnIGluIHN1Yk1ldGEgJiYgKHN1Yk1ldGEgYXMgYW55KS51c2VyRGF0YSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgc3ViQXNzZXROYW1lID0gdGhpcy5nZXRTdWJBc3NldE5hbWUoYXNzZXRJbmZvLCBzdWJVdWlkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZXh0cmFjdEZyb21Vc2VyRGF0YSgoc3ViTWV0YSBhcyBhbnkpLnVzZXJEYXRhLCBkZXNjcmlwdGlvbiwgc3ViQXNzZXROYW1lLCBpbmNsdWRlVG9vbHRpcHMpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGRlc2NyaXB0aW9uO1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICB1dWlkOiBhc3NldEluZm8udXVpZCxcbiAgICAgICAgICAgICAgICBpbXBvcnRlcjogYXNzZXRJbmZvLmltcG9ydGVyLFxuICAgICAgICAgICAgICAgIGVycm9yOiBgRXJyb3IgcmVhZGluZyBhc3NldCBwcm9wZXJ0aWVzOiAke2Vycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKX1gLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGFzeW5jIHNldFByb3BlcnRpZXMoXG4gICAgICAgIGFzc2V0SW5mbzogQXNzZXRJbmZvLFxuICAgICAgICBwcm9wZXJ0aWVzOiBQcm9wZXJ0eVNldFNwZWNbXSxcbiAgICApOiBQcm9taXNlPFByb3BlcnR5U2V0UmVzdWx0W10+IHtcbiAgICAgICAgY29uc3QgcmVzdWx0czogUHJvcGVydHlTZXRSZXN1bHRbXSA9IFtdO1xuICAgICAgICBsZXQgbWV0YTogYW55O1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgbWV0YSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0LW1ldGEnLCBhc3NldEluZm8udXVpZCk7XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4gcHJvcGVydGllcy5tYXAocCA9PiAoe1xuICAgICAgICAgICAgICAgIHByb3BlcnR5UGF0aDogcC5wcm9wZXJ0eVBhdGgsXG4gICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgZXJyb3I6IGBxdWVyeS1hc3NldC1tZXRhIGZhaWxlZDogJHtlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycil9YCxcbiAgICAgICAgICAgIH0pKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIW1ldGEpIHtcbiAgICAgICAgICAgIHJldHVybiBwcm9wZXJ0aWVzLm1hcChwID0+ICh7XG4gICAgICAgICAgICAgICAgcHJvcGVydHlQYXRoOiBwLnByb3BlcnR5UGF0aCxcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBlcnJvcjogYEFzc2V0IG1ldGEgbm90IGZvdW5kIGZvciAke2Fzc2V0SW5mby51dWlkfWAsXG4gICAgICAgICAgICB9KSk7XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChjb25zdCBwcm9wIG9mIHByb3BlcnRpZXMpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgb2sgPSBhd2FpdCB0aGlzLnNldFByb3BlcnR5KG1ldGEsIHByb3ApO1xuICAgICAgICAgICAgICAgIHJlc3VsdHMucHVzaCh7IHByb3BlcnR5UGF0aDogcHJvcC5wcm9wZXJ0eVBhdGgsIHN1Y2Nlc3M6IG9rIH0pO1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgICAgICByZXN1bHRzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0eVBhdGg6IHByb3AucHJvcGVydHlQYXRoLFxuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKSxcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAocmVzdWx0cy5zb21lKHIgPT4gci5zdWNjZXNzKSkge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdzYXZlLWFzc2V0LW1ldGEnLCBhc3NldEluZm8udXVpZCwgSlNPTi5zdHJpbmdpZnkobWV0YSkpO1xuICAgICAgICAgICAgICAgIC8vIHJlZnJlc2gtYXNzZXQgdHJpZ2dlcnMgcmUtaW1wb3J0IHdpdGggdGhlIG5ldyBzZXR0aW5ncztcbiAgICAgICAgICAgICAgICAvLyB3aXRob3V0IGl0LCB0aGUgZGlzayBtZXRhIGlzIHVwZGF0ZWQgYnV0IGNvY29zIGtlZXBzXG4gICAgICAgICAgICAgICAgLy8gdGhlIG9sZCBpbXBvcnRlZCBhc3NldCB1bnRpbCBuZXh0IG1hbnVhbCByZWZyZXNoLlxuICAgICAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3JlZnJlc2gtYXNzZXQnLCBhc3NldEluZm8udXJsKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICAgICAgLy8gQW5ub3RhdGUgZXZlcnkgc3VjY2Vzc2Z1bCBzZXQgd2l0aCB0aGUgcGVyc2lzdGVuY2VcbiAgICAgICAgICAgICAgICAvLyBmYWlsdXJlIHNvIHRoZSBjYWxsZXIgc2VlcyB0aGUgcGFydGlhbCBvdXRjb21lLlxuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgciBvZiByZXN1bHRzKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChyLnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHIuc3VjY2VzcyA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICAgICAgci5lcnJvciA9IGBzZXQgc3VjY2VlZGVkIGluLW1lbW9yeSBidXQgc2F2ZS1hc3NldC1tZXRhL3JlZnJlc2ggZmFpbGVkOiAke2Vycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKX1gO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHRzO1xuICAgIH1cblxuICAgIHByb3RlY3RlZCBleHRyYWN0RnJvbVVzZXJEYXRhKFxuICAgICAgICB1c2VyRGF0YTogYW55LFxuICAgICAgICBkZXNjcmlwdGlvbjogQXNzZXRQcm9wZXJ0aWVzRGVzY3JpcHRpb24sXG4gICAgICAgIHBhdGhQcmVmaXg6IHN0cmluZyxcbiAgICAgICAgaW5jbHVkZVRvb2x0aXBzOiBib29sZWFuLFxuICAgICk6IHZvaWQge1xuICAgICAgICBpZiAoIXVzZXJEYXRhIHx8IHR5cGVvZiB1c2VyRGF0YSAhPT0gJ29iamVjdCcpIHJldHVybjtcbiAgICAgICAgY29uc3Qgb3V0ID0gdGhpcy5leHRyYWN0UmVjdXJzaXZlKHVzZXJEYXRhLCBwYXRoUHJlZml4LCBpbmNsdWRlVG9vbHRpcHMpO1xuICAgICAgICBPYmplY3QuYXNzaWduKGRlc2NyaXB0aW9uLnByb3BlcnRpZXMhLCBvdXQucHJvcGVydGllcyk7XG4gICAgICAgIE9iamVjdC5hc3NpZ24oZGVzY3JpcHRpb24uYXJyYXlzISwgb3V0LmFycmF5cyk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBleHRyYWN0UmVjdXJzaXZlKFxuICAgICAgICBvYmo6IGFueSxcbiAgICAgICAgYmFzZVBhdGg6IHN0cmluZyxcbiAgICAgICAgaW5jbHVkZVRvb2x0aXBzOiBib29sZWFuLFxuICAgICk6IHsgcHJvcGVydGllczogUmVjb3JkPHN0cmluZywgQXNzZXRQcm9wZXJ0aWVzRGVzY3JpcHRpb25bJ3Byb3BlcnRpZXMnXSBleHRlbmRzIGluZmVyIFAgPyBQIGV4dGVuZHMgUmVjb3JkPHN0cmluZywgaW5mZXIgVj4gPyBWIDogbmV2ZXIgOiBuZXZlcj47IGFycmF5czogUmVjb3JkPHN0cmluZywgQXNzZXRQcm9wZXJ0aWVzRGVzY3JpcHRpb25bJ2FycmF5cyddIGV4dGVuZHMgaW5mZXIgQSA/IEEgZXh0ZW5kcyBSZWNvcmQ8c3RyaW5nLCBpbmZlciBWPiA/IFYgOiBuZXZlciA6IG5ldmVyPiB9IHtcbiAgICAgICAgY29uc3QgcHJvcGVydGllczogUmVjb3JkPHN0cmluZywgYW55PiA9IHt9O1xuICAgICAgICBjb25zdCBhcnJheXM6IFJlY29yZDxzdHJpbmcsIGFueT4gPSB7fTtcbiAgICAgICAgaWYgKCFvYmogfHwgdHlwZW9mIG9iaiAhPT0gJ29iamVjdCcpIHJldHVybiB7IHByb3BlcnRpZXMsIGFycmF5cyB9O1xuICAgICAgICBmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhvYmopKSB7XG4gICAgICAgICAgICAvLyBTa2lwIHByaXZhdGUvaW50ZXJuYWwgZmllbGRzLiBBSSBzaG91bGRuJ3QgYmUgcG9raW5nIGF0XG4gICAgICAgICAgICAvLyBfaW50ZXJuYWwgY29jb3MgYm9va2tlZXBpbmcuXG4gICAgICAgICAgICBpZiAoa2V5LnN0YXJ0c1dpdGgoJ18nKSkgY29udGludWU7XG4gICAgICAgICAgICBjb25zdCBjdXJyZW50UGF0aCA9IGJhc2VQYXRoID8gYCR7YmFzZVBhdGh9LiR7a2V5fWAgOiBrZXk7XG4gICAgICAgICAgICBjb25zdCBwcm9wZXJ0eURhdGEgPSBvYmpba2V5XTtcbiAgICAgICAgICAgIGlmIChwcm9wZXJ0eURhdGEgJiYgdHlwZW9mIHByb3BlcnR5RGF0YSA9PT0gJ29iamVjdCcgJiYgT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHByb3BlcnR5RGF0YSwgJ3ZhbHVlJykpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBwcm9wZXJ0eUluZm86IGFueSA9IHtcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogcHJvcGVydHlEYXRhLnR5cGUgfHwgJ1Vua25vd24nLFxuICAgICAgICAgICAgICAgICAgICB2YWx1ZTogcHJvcGVydHlEYXRhLnZhbHVlLFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgaWYgKHByb3BlcnR5RGF0YS50b29sdGlwICYmIGluY2x1ZGVUb29sdGlwcykge1xuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZWRpdG9yID0gKGdsb2JhbFRoaXMgYXMgYW55KS5FZGl0b3I7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoZWRpdG9yPy5JMThuPy50ICYmIHR5cGVvZiBwcm9wZXJ0eURhdGEudG9vbHRpcCA9PT0gJ3N0cmluZycgJiYgcHJvcGVydHlEYXRhLnRvb2x0aXAuc3RhcnRzV2l0aCgnaTE4bjonKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb3BlcnR5SW5mby50b29sdGlwID0gZWRpdG9yLkkxOG4udChwcm9wZXJ0eURhdGEudG9vbHRpcC5zbGljZSg1KSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb3BlcnR5SW5mby50b29sdGlwID0gcHJvcGVydHlEYXRhLnRvb2x0aXA7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgICAgICAgICAgICAgcHJvcGVydHlJbmZvLnRvb2x0aXAgPSBwcm9wZXJ0eURhdGEudG9vbHRpcDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAocHJvcGVydHlEYXRhLnR5cGUgPT09ICdFbnVtJyAmJiBwcm9wZXJ0eURhdGEuZW51bUxpc3QpIHtcbiAgICAgICAgICAgICAgICAgICAgcHJvcGVydHlJbmZvLmVudW1MaXN0ID0gcHJvcGVydHlEYXRhLmVudW1MaXN0O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAocHJvcGVydHlEYXRhLmlzQXJyYXkpIHtcbiAgICAgICAgICAgICAgICAgICAgYXJyYXlzW2N1cnJlbnRQYXRoXSA9IHsgdHlwZTogcHJvcGVydHlJbmZvLnR5cGUsIHRvb2x0aXA6IHByb3BlcnR5SW5mby50b29sdGlwIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IGlzQ29tcGxleCA9IHByb3BlcnR5RGF0YS52YWx1ZVxuICAgICAgICAgICAgICAgICAgICAmJiAoKHR5cGVvZiBwcm9wZXJ0eURhdGEudmFsdWUgPT09ICdvYmplY3QnXG4gICAgICAgICAgICAgICAgICAgICAgICAmJiAhU0lNUExFX1RZUEVTLmhhcyhwcm9wZXJ0eURhdGEudHlwZSlcbiAgICAgICAgICAgICAgICAgICAgICAgICYmICEoQXJyYXkuaXNBcnJheShwcm9wZXJ0eURhdGEuZXh0ZW5kcykgJiYgcHJvcGVydHlEYXRhLmV4dGVuZHMuc29tZSgoZXh0OiBzdHJpbmcpID0+IFNJTVBMRV9UWVBFUy5oYXMoZXh0KSkpKVxuICAgICAgICAgICAgICAgICAgICAgICAgfHwgQXJyYXkuaXNBcnJheShwcm9wZXJ0eURhdGEudmFsdWUpKTtcbiAgICAgICAgICAgICAgICBpZiAoaXNDb21wbGV4KSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG5lc3RlZCA9IHRoaXMuZXh0cmFjdFJlY3Vyc2l2ZShwcm9wZXJ0eURhdGEudmFsdWUsIGN1cnJlbnRQYXRoLCBpbmNsdWRlVG9vbHRpcHMpO1xuICAgICAgICAgICAgICAgICAgICBPYmplY3QuYXNzaWduKHByb3BlcnRpZXMsIG5lc3RlZC5wcm9wZXJ0aWVzKTtcbiAgICAgICAgICAgICAgICAgICAgT2JqZWN0LmFzc2lnbihhcnJheXMsIG5lc3RlZC5hcnJheXMpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHByb3BlcnRpZXNbY3VycmVudFBhdGhdID0gcHJvcGVydHlJbmZvO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlEYXRhICE9PSBudWxsICYmIHR5cGVvZiBwcm9wZXJ0eURhdGEgPT09ICdvYmplY3QnICYmICFBcnJheS5pc0FycmF5KHByb3BlcnR5RGF0YSkpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBuZXN0ZWQgPSB0aGlzLmV4dHJhY3RSZWN1cnNpdmUocHJvcGVydHlEYXRhLCBjdXJyZW50UGF0aCwgaW5jbHVkZVRvb2x0aXBzKTtcbiAgICAgICAgICAgICAgICBPYmplY3QuYXNzaWduKHByb3BlcnRpZXMsIG5lc3RlZC5wcm9wZXJ0aWVzKTtcbiAgICAgICAgICAgICAgICBPYmplY3QuYXNzaWduKGFycmF5cywgbmVzdGVkLmFycmF5cyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHByb3BlcnRpZXNbY3VycmVudFBhdGhdID0ge1xuICAgICAgICAgICAgICAgICAgICB0eXBlOiB0aGlzLmluZmVyUHJvcGVydHlUeXBlKHByb3BlcnR5RGF0YSksXG4gICAgICAgICAgICAgICAgICAgIHZhbHVlOiBwcm9wZXJ0eURhdGEsXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4geyBwcm9wZXJ0aWVzLCBhcnJheXMgfTtcbiAgICB9XG5cbiAgICBwcm90ZWN0ZWQgaW5mZXJQcm9wZXJ0eVR5cGUodmFsdWU6IGFueSk6IHN0cmluZyB7XG4gICAgICAgIGlmICh2YWx1ZSA9PT0gbnVsbCB8fCB2YWx1ZSA9PT0gdW5kZWZpbmVkKSByZXR1cm4gJ1Vua25vd24nO1xuICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnYm9vbGVhbicpIHJldHVybiAnQm9vbGVhbic7XG4gICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInKSByZXR1cm4gJ051bWJlcic7XG4gICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSByZXR1cm4gJ1N0cmluZyc7XG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkgcmV0dXJuICdBcnJheSc7XG4gICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHZhbHVlLCAnX190eXBlX18nKSkgcmV0dXJuICh2YWx1ZSBhcyBhbnkpLl9fdHlwZV9fO1xuICAgICAgICAgICAgcmV0dXJuICdPYmplY3QnO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiAnVW5rbm93bic7XG4gICAgfVxuXG4gICAgcHJvdGVjdGVkIGdldFN1YkFzc2V0TmFtZShhc3NldEluZm86IEFzc2V0SW5mbywgc3ViVXVpZDogc3RyaW5nKTogc3RyaW5nIHtcbiAgICAgICAgY29uc3Qgc3ViQXNzZXRzID0gKGFzc2V0SW5mbyBhcyBhbnkpLnN1YkFzc2V0cztcbiAgICAgICAgaWYgKHN1YkFzc2V0cyAmJiBzdWJBc3NldHNbc3ViVXVpZF0/Lm5hbWUpIHJldHVybiBzdWJBc3NldHNbc3ViVXVpZF0ubmFtZTtcbiAgICAgICAgcmV0dXJuIHN1YlV1aWQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRGVmYXVsdCBzZXR0ZXIg4oCUIHZhbGlkYXRlcyBwYXRoIGFnYWluc3QgVkFMSURfTUVUQV9QQVRURVJOUyxcbiAgICAgKiB3YWxrcyB0aGUgZG90dGVkIHBhdGggY3JlYXRpbmcgb25seSBhbGxvd2VkIGludGVybWVkaWF0ZVxuICAgICAqIGNvbnRhaW5lcnMsIGFuZCB3cml0ZXMgdGhlIGNvZXJjZWQgdmFsdWUgYXQgdGhlIGxlYWYuXG4gICAgICogU3BlY2lhbGl6ZWQgaW50ZXJwcmV0ZXJzIG92ZXJyaWRlIHRoaXMgd2hlbiB0aGVpciBtZXRhIGxheW91dFxuICAgICAqIG5lZWRzIGN1c3RvbSByb3V0aW5nIChlLmcuIEltYWdlSW50ZXJwcmV0ZXIncyBtYWluIHZzXG4gICAgICogc3ViLWFzc2V0IHNwbGl0KS5cbiAgICAgKi9cbiAgICBwcm90ZWN0ZWQgYXN5bmMgc2V0UHJvcGVydHkobWV0YTogYW55LCBwcm9wOiBQcm9wZXJ0eVNldFNwZWMpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICAgICAgY29uc3QgaXNWYWxpZCA9IFZBTElEX01FVEFfUEFUVEVSTlMuc29tZShyZSA9PiByZS50ZXN0KHByb3AucHJvcGVydHlQYXRoKSk7XG4gICAgICAgIGlmICghaXNWYWxpZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgICAgICAgIGBJbnZhbGlkIGFzc2V0LW1ldGEgcGF0aCAnJHtwcm9wLnByb3BlcnR5UGF0aH0nLiBBbGxvd2VkIHJvb3RzOiB1c2VyRGF0YS4qLCBzdWJNZXRhcy4qLCBwbGF0Zm9ybVNldHRpbmdzLiosIGltcG9ydGVyLCBpbXBvcnRlclZlcnNpb24sIHNvdXJjZVV1aWQsIGlzR3JvdXAsIGZvbGRlci5gXG4gICAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHBhdGhQYXJ0cyA9IHByb3AucHJvcGVydHlQYXRoLnNwbGl0KCcuJyk7XG4gICAgICAgIGxldCBjdXJyZW50ID0gbWV0YTtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBwYXRoUGFydHMubGVuZ3RoIC0gMTsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBwYXJ0ID0gcGF0aFBhcnRzW2ldO1xuICAgICAgICAgICAgaWYgKGN1cnJlbnRbcGFydF0gPT09IHVuZGVmaW5lZCB8fCBjdXJyZW50W3BhcnRdID09PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgaWYgKHBhcnQgPT09ICd1c2VyRGF0YScgfHwgcGFydCA9PT0gJ3N1Yk1ldGFzJyB8fCBwYXJ0ID09PSAncGxhdGZvcm1TZXR0aW5ncycpIHtcbiAgICAgICAgICAgICAgICAgICAgY3VycmVudFtwYXJ0XSA9IHt9O1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoaSA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gQWxsb3cgYXV0by1jcmVhdGUgaW5zaWRlIGFuIGFscmVhZHktYWxsb3dlZCByb290LlxuICAgICAgICAgICAgICAgICAgICBjdXJyZW50W3BhcnRdID0ge307XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDYW5ub3QgY3JlYXRlIHRvcC1sZXZlbCBtZXRhIGZpZWxkICcke3BhcnR9JyAocGF0aDogJHtwcm9wLnByb3BlcnR5UGF0aH0pYCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY3VycmVudCA9IGN1cnJlbnRbcGFydF07XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZmluYWxLZXkgPSBwYXRoUGFydHNbcGF0aFBhcnRzLmxlbmd0aCAtIDFdO1xuICAgICAgICBjdXJyZW50W2ZpbmFsS2V5XSA9IHRoaXMuY29udmVydFByb3BlcnR5VmFsdWUocHJvcC5wcm9wZXJ0eVZhbHVlLCBwcm9wLnByb3BlcnR5VHlwZSk7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIHByb3RlY3RlZCBjb252ZXJ0UHJvcGVydHlWYWx1ZSh2YWx1ZTogYW55LCB0eXBlOiBzdHJpbmcpOiBhbnkge1xuICAgICAgICBzd2l0Y2ggKHR5cGUpIHtcbiAgICAgICAgICAgIGNhc2UgJ0Jvb2xlYW4nOlxuICAgICAgICAgICAgICAgIHJldHVybiBCb29sZWFuKHZhbHVlKTtcbiAgICAgICAgICAgIGNhc2UgJ051bWJlcic6XG4gICAgICAgICAgICBjYXNlICdGbG9hdCc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIHBhcnNlRmxvYXQoU3RyaW5nKHZhbHVlKSk7XG4gICAgICAgICAgICBjYXNlICdTdHJpbmcnOlxuICAgICAgICAgICAgICAgIHJldHVybiBTdHJpbmcodmFsdWUpO1xuICAgICAgICAgICAgY2FzZSAnSW50ZWdlcic6XG4gICAgICAgICAgICAgICAgcmV0dXJuIHBhcnNlSW50KFN0cmluZyh2YWx1ZSksIDEwKTtcbiAgICAgICAgICAgIGNhc2UgJ0VudW0nOlxuICAgICAgICAgICAgY2FzZSAnY2MuVmFsdWVUeXBlJzpcbiAgICAgICAgICAgIGNhc2UgJ2NjLk9iamVjdCc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnYm9vbGVhbicpIHJldHVybiBCb29sZWFuKHZhbHVlKTtcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJykgcmV0dXJuIE51bWJlcih2YWx1ZSk7XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHJldHVybiBTdHJpbmcodmFsdWUpO1xuICAgICAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgICAgfVxuICAgIH1cbn1cbiJdfQ==