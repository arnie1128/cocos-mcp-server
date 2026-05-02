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

import type { AssetInfo } from '@cocos/creator-types/editor/packages/asset-db/@types/public';
import {
    AssetPropertiesDescription,
    IAssetInterpreter,
    PropertySetSpec,
    PropertySetResult,
} from './interface';

// v2.4.4 review fix (claude): removed importer / importerVersion /
// sourceUuid / isGroup / folder from the writable allow-list. Letting
// AI flip an asset's importer string asks asset-db to re-import as a
// different importer; best case the import fails, worst case the
// asset is corrupted. None of these fields have a documented
// AI-driven use case yet — re-add when one shows up.
const VALID_META_PATTERNS: RegExp[] = [
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

export function isPathSafe(propertyPath: string): { ok: true } | { ok: false; reason: string } {
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

export abstract class BaseAssetInterpreter implements IAssetInterpreter {
    abstract get importerType(): string;

    async getProperties(
        assetInfo: AssetInfo,
        includeTooltips: boolean = false,
        _useAdvancedInspection: boolean = false,
    ): Promise<AssetPropertiesDescription> {
        try {
            const meta: any = await Editor.Message.request('asset-db', 'query-asset-meta', assetInfo.uuid);
            if (!meta) {
                return {
                    uuid: assetInfo.uuid,
                    importer: assetInfo.importer,
                    error: `Asset meta not found for ${assetInfo.uuid}`,
                };
            }
            const description: AssetPropertiesDescription = {
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
                    if (subMeta && typeof subMeta === 'object' && 'userData' in subMeta && (subMeta as any).userData) {
                        const subAssetName = this.getSubAssetName(assetInfo, subUuid);
                        this.extractFromUserData((subMeta as any).userData, description, subAssetName, includeTooltips);
                    }
                }
            }
            return description;
        } catch (err: any) {
            return {
                uuid: assetInfo.uuid,
                importer: assetInfo.importer,
                error: `Error reading asset properties: ${err?.message ?? String(err)}`,
            };
        }
    }

    async setProperties(
        assetInfo: AssetInfo,
        properties: PropertySetSpec[],
    ): Promise<PropertySetResult[]> {
        const results: PropertySetResult[] = [];
        let meta: any;
        try {
            meta = await Editor.Message.request('asset-db', 'query-asset-meta', assetInfo.uuid);
        } catch (err: any) {
            return properties.map(p => ({
                propertyPath: p.propertyPath,
                success: false,
                error: `query-asset-meta failed: ${err?.message ?? String(err)}`,
            }));
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
            } catch (err: any) {
                results.push({
                    propertyPath: prop.propertyPath,
                    success: false,
                    error: err?.message ?? String(err),
                });
            }
        }
        // v2.4.4 review fix (claude + codex): split save vs refresh
        // failure handling. v2.4.3 lumped both errors together which
        // mislabelled the state on disk: if save succeeded but
        // refresh threw, the disk meta IS updated and only the
        // re-import is stale — flipping every successful entry to
        // failure was wrong.
        let saveStatus: 'ok' | 'save-failed' | 'refresh-failed' = 'ok';
        let saveError: string | undefined;
        if (results.some(r => r.success)) {
            try {
                await Editor.Message.request('asset-db', 'save-asset-meta', assetInfo.uuid, JSON.stringify(meta));
            } catch (err: any) {
                saveStatus = 'save-failed';
                saveError = `save-asset-meta failed: ${err?.message ?? String(err)}`;
            }
            if (saveStatus === 'ok') {
                try {
                    await Editor.Message.request('asset-db', 'refresh-asset', assetInfo.url);
                } catch (err: any) {
                    saveStatus = 'refresh-failed';
                    saveError = `save-asset-meta succeeded but refresh-asset failed: ${err?.message ?? String(err)}. Disk meta IS updated; cocos will pick up the change on next manual refresh.`;
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
            } else if (saveStatus === 'refresh-failed') {
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

    protected extractFromUserData(
        userData: any,
        description: AssetPropertiesDescription,
        pathPrefix: string,
        includeTooltips: boolean,
    ): void {
        if (!userData || typeof userData !== 'object') return;
        const out = this.extractRecursive(userData, pathPrefix, includeTooltips);
        Object.assign(description.properties!, out.properties);
        Object.assign(description.arrays!, out.arrays);
    }

    private extractRecursive(
        obj: any,
        basePath: string,
        includeTooltips: boolean,
    ): { properties: Record<string, AssetPropertiesDescription['properties'] extends infer P ? P extends Record<string, infer V> ? V : never : never>; arrays: Record<string, AssetPropertiesDescription['arrays'] extends infer A ? A extends Record<string, infer V> ? V : never : never> } {
        const properties: Record<string, any> = {};
        const arrays: Record<string, any> = {};
        if (!obj || typeof obj !== 'object') return { properties, arrays };
        for (const key of Object.keys(obj)) {
            // Skip private/internal fields. AI shouldn't be poking at
            // _internal cocos bookkeeping.
            if (key.startsWith('_')) continue;
            const currentPath = basePath ? `${basePath}.${key}` : key;
            const propertyData = obj[key];
            if (propertyData && typeof propertyData === 'object' && Object.prototype.hasOwnProperty.call(propertyData, 'value')) {
                const propertyInfo: any = {
                    type: propertyData.type || 'Unknown',
                    value: propertyData.value,
                };
                if (propertyData.tooltip && includeTooltips) {
                    try {
                        const editor = (globalThis as any).Editor;
                        if (editor?.I18n?.t && typeof propertyData.tooltip === 'string' && propertyData.tooltip.startsWith('i18n:')) {
                            propertyInfo.tooltip = editor.I18n.t(propertyData.tooltip.slice(5));
                        } else {
                            propertyInfo.tooltip = propertyData.tooltip;
                        }
                    } catch {
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
                        && !(Array.isArray(propertyData.extends) && propertyData.extends.some((ext: string) => SIMPLE_TYPES.has(ext))))
                        || Array.isArray(propertyData.value));
                if (isComplex) {
                    const nested = this.extractRecursive(propertyData.value, currentPath, includeTooltips);
                    Object.assign(properties, nested.properties);
                    Object.assign(arrays, nested.arrays);
                } else {
                    properties[currentPath] = propertyInfo;
                }
            } else if (propertyData !== null && typeof propertyData === 'object' && !Array.isArray(propertyData)) {
                const nested = this.extractRecursive(propertyData, currentPath, includeTooltips);
                Object.assign(properties, nested.properties);
                Object.assign(arrays, nested.arrays);
            } else {
                properties[currentPath] = {
                    type: this.inferPropertyType(propertyData),
                    value: propertyData,
                };
            }
        }
        return { properties, arrays };
    }

    protected inferPropertyType(value: any): string {
        if (value === null || value === undefined) return 'Unknown';
        if (typeof value === 'boolean') return 'Boolean';
        if (typeof value === 'number') return 'Number';
        if (typeof value === 'string') return 'String';
        if (Array.isArray(value)) return 'Array';
        if (typeof value === 'object') {
            if (Object.prototype.hasOwnProperty.call(value, '__type__')) return (value as any).__type__;
            return 'Object';
        }
        return 'Unknown';
    }

    protected getSubAssetName(assetInfo: AssetInfo, subUuid: string): string {
        const subAssets = (assetInfo as any).subAssets;
        if (subAssets && subAssets[subUuid]?.name) return subAssets[subUuid].name;
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
    protected async setProperty(meta: any, prop: PropertySetSpec): Promise<boolean> {
        const safe = isPathSafe(prop.propertyPath);
        if (!safe.ok) throw new Error(safe.reason);
        const pathParts = prop.propertyPath.split('.');
        let current = meta;
        for (let i = 0; i < pathParts.length - 1; i++) {
            const part = pathParts[i];
            if (current[part] === undefined || current[part] === null) {
                if (part === 'userData' || part === 'subMetas' || part === 'platformSettings') {
                    current[part] = {};
                } else if (i > 0) {
                    // Auto-create inside an already-allowed root.
                    current[part] = {};
                } else {
                    throw new Error(`Cannot create top-level meta field '${part}' (path: ${prop.propertyPath})`);
                }
            }
            current = current[part];
        }
        const finalKey = pathParts[pathParts.length - 1];
        current[finalKey] = this.convertPropertyValue(prop.propertyValue, prop.propertyType);
        return true;
    }

    protected convertPropertyValue(value: any, type: string): any {
        switch (type) {
            case 'Boolean':
                // v2.4.4 review fix (codex): Boolean("false") === true
                // would silently flip the meaning of an AI-supplied
                // string. Treat the textual variants explicitly; only
                // truly empty / null / 0 are falsy.
                if (typeof value === 'string') {
                    const lower = value.trim().toLowerCase();
                    if (lower === 'false' || lower === '0' || lower === '') return false;
                    if (lower === 'true' || lower === '1') return true;
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
                if (typeof value === 'boolean') return Boolean(value);
                if (typeof value === 'number') return Number(value);
                if (typeof value === 'string') return String(value);
                return value;
        }
    }
}
