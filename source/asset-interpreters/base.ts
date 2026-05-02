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

const VALID_META_PATTERNS: RegExp[] = [
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
        if (results.some(r => r.success)) {
            try {
                await Editor.Message.request('asset-db', 'save-asset-meta', assetInfo.uuid, JSON.stringify(meta));
                // refresh-asset triggers re-import with the new settings;
                // without it, the disk meta is updated but cocos keeps
                // the old imported asset until next manual refresh.
                await Editor.Message.request('asset-db', 'refresh-asset', assetInfo.url);
            } catch (err: any) {
                // Annotate every successful set with the persistence
                // failure so the caller sees the partial outcome.
                for (const r of results) {
                    if (r.success) {
                        r.success = false;
                        r.error = `set succeeded in-memory but save-asset-meta/refresh failed: ${err?.message ?? String(err)}`;
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
     * Default setter — validates path against VALID_META_PATTERNS,
     * walks the dotted path creating only allowed intermediate
     * containers, and writes the coerced value at the leaf.
     * Specialized interpreters override this when their meta layout
     * needs custom routing (e.g. ImageInterpreter's main vs
     * sub-asset split).
     */
    protected async setProperty(meta: any, prop: PropertySetSpec): Promise<boolean> {
        const isValid = VALID_META_PATTERNS.some(re => re.test(prop.propertyPath));
        if (!isValid) {
            throw new Error(
                `Invalid asset-meta path '${prop.propertyPath}'. Allowed roots: userData.*, subMetas.*, platformSettings.*, importer, importerVersion, sourceUuid, isGroup, folder.`
            );
        }
        const pathParts = prop.propertyPath.split('.');
        let current = meta;
        for (let i = 0; i < pathParts.length - 1; i++) {
            const part = pathParts[i];
            if (current[part] === undefined || current[part] === null) {
                if (part === 'userData' || part === 'subMetas' || part === 'platformSettings') {
                    current[part] = {};
                } else if (i > 0) {
                    // Allow auto-create inside an already-allowed root.
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
                if (typeof value === 'boolean') return Boolean(value);
                if (typeof value === 'number') return Number(value);
                if (typeof value === 'string') return String(value);
                return value;
        }
    }
}
