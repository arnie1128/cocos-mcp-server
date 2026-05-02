/**
 * AssetInterpreterManager — Map<importerType, IAssetInterpreter>
 * registry. Singleton-ish: instantiated once at extension load via
 * `createAssetInterpreterRegistry()` and shared by the asset-meta
 * tools.
 *
 * `getInterpreter(importerType)` falls back to the `*` wildcard
 * (UnknownInterpreter) so unknown importer strings still produce a
 * usable response — UnknownInterpreter emits the meta as best-effort
 * read-only and rejects writes with a clear error.
 *
 * This manager intentionally does NOT use a TypeScript `static {}`
 * initializer block (RomaRogov pattern). cocos editor's bundler
 * historically chokes on Stage-3 / ES2022 features; we instantiate
 * via a plain factory function instead. Keeps the build pipeline
 * unchanged.
 */

import { IAssetInterpreter, AssetPropertiesDescription, PropertySetSpec, PropertySetResult } from './interface';
import type { AssetInfo } from '@cocos/creator-types/editor/packages/asset-db/@types/public';

export class AssetInterpreterManager {
    private interpreters: Map<string, IAssetInterpreter> = new Map();
    private fallback: IAssetInterpreter;

    constructor(interpreters: IAssetInterpreter[], fallback: IAssetInterpreter) {
        for (const interp of interpreters) {
            this.interpreters.set(interp.importerType, interp);
        }
        this.fallback = fallback;
        // The fallback is also reachable via its own importerType key
        // so callers asking for `*` explicitly still work.
        if (!this.interpreters.has(fallback.importerType)) {
            this.interpreters.set(fallback.importerType, fallback);
        }
    }

    getInterpreter(importerType: string): IAssetInterpreter {
        return this.interpreters.get(importerType) ?? this.fallback;
    }

    listImporterTypes(): string[] {
        return [...this.interpreters.keys()].sort();
    }

    async getAssetProperties(
        assetInfo: AssetInfo,
        includeTooltips: boolean = false,
        useAdvancedInspection: boolean = false,
    ): Promise<AssetPropertiesDescription> {
        return this.getInterpreter(assetInfo.importer).getProperties(assetInfo, includeTooltips, useAdvancedInspection);
    }

    async setAssetProperties(
        assetInfo: AssetInfo,
        properties: PropertySetSpec[],
    ): Promise<PropertySetResult[]> {
        return this.getInterpreter(assetInfo.importer).setProperties(assetInfo, properties);
    }
}
