/**
 * asset-interpreters/interface — type contracts for v2.4.3 asset-meta
 * editing capability. Ports the RomaRogov-cocos-mcp shape so future
 * specialized interpreters can be lifted with minimal changes.
 *
 * Asset meta editing fills the gap left by `set_component_property`,
 * which only mutates scene nodes. Asset import settings (texture
 * compression, FBX animation extraction, SpriteFrame trim mode,
 * Material baked properties) live in `<asset>.meta` userData and
 * subMetas — this module is how AI reaches them.
 *
 * Reference: docs/research/repos/RomaRogov-cocos-mcp.md
 * `D:/1_dev/cocos-mcp-references/RomaRogov-cocos-mcp/source/mcp/tools/asset-interpreters/interface.ts`.
 */

import type { AssetInfo } from '@cocos/creator-types/editor/packages/asset-db/@types/public';

export interface AssetPropertyEntry {
    type: string;
    value?: any;
    tooltip?: string;
    enumList?: any[];
}

export interface AssetArrayEntry {
    type: string;
    tooltip?: string;
}

export interface AssetPropertiesDescription {
    uuid?: string;
    importer?: string;
    properties?: { [path: string]: AssetPropertyEntry };
    arrays?: { [path: string]: AssetArrayEntry };
    error?: string;
}

export interface PropertySetSpec {
    /**
     * Dotted path rooted at meta (e.g. `userData.compressType`,
     * `subMetas.<uuid>.userData.trimType`,
     * `platformSettings.android.format`). Validated by regex in
     * BaseAssetInterpreter.setProperty against an allow-list to keep
     * AI from clobbering arbitrary meta fields.
     */
    propertyPath: string;
    /** Type tag for value coercion (Boolean/Number/String/Integer/Float/Enum/cc.ValueType/cc.Object). */
    propertyType: string;
    /** Raw value; coerced by `convertPropertyValue(value, type)`. */
    propertyValue: any;
}

export interface PropertySetResult {
    propertyPath: string;
    success: boolean;
    error?: string;
}

export interface IAssetInterpreter {
    /**
     * Cocos importer string this interpreter handles, e.g. `image`,
     * `texture`, `fbx`, `material`. The `*` wildcard interpreter
     * (UnknownInterpreter) is the fallback when nothing else matches.
     */
    get importerType(): string;

    getProperties(
        assetInfo: AssetInfo,
        includeTooltips?: boolean,
        useAdvancedInspection?: boolean,
    ): Promise<AssetPropertiesDescription>;

    setProperties(
        assetInfo: AssetInfo,
        properties: PropertySetSpec[],
    ): Promise<PropertySetResult[]>;
}
