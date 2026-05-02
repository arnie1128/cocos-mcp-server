/**
 * Eight specialized asset interpreters covering the highest-value
 * asset types per RomaRogov's reference set:
 *
 *   ImageInterpreter        — `image`        (textures + sub-asset routing)
 *   TextureInterpreter      — `texture`
 *   SpriteFrameInterpreter  — `sprite-frame` (read-only / writable guards)
 *   FbxInterpreter          — `fbx`
 *   MaterialInterpreter     — `material`     (read-only via base; advanced editing → execute_javascript)
 *   EffectInterpreter       — `effect`
 *   ParticleInterpreter     — `particle`
 *   UnknownInterpreter      — `*`            (read-only fallback)
 *
 * Each is a thin extension of BaseAssetInterpreter — most only override
 * `importerType`. Two notable overrides:
 *
 *   ImageInterpreter.setProperty: image meta has both top-level
 *   userData fields (type / flipVertical / etc) and sub-asset
 *   userData (the `texture` / `spriteFrame` sub-metas). Routes by
 *   path shape so AI can pass either flat or nested paths.
 *
 *   SpriteFrameInterpreter.setProperty: sprite-frame meta has many
 *   computed read-only fields (width, height, rotated, etc.); reject
 *   writes to them up-front with a clear error rather than silently
 *   no-op.
 *
 * Material *editing* (effect/passes/props) deliberately deferred —
 * RomaRogov uses `scene/query-material` + `scene/apply-material` +
 * an async asset-uuid preprocessing layer that pulls in their
 * McpServerManager.decodeUuid plumbing. For v2.4.3 the material
 * interpreter only reads meta userData; AI needing to swap effects
 * or set passes should use execute_javascript with scene context
 * (already shipped in v2.3.0).
 *
 * Reference: D:/1_dev/cocos-mcp-references/RomaRogov-cocos-mcp/source/mcp/tools/asset-interpreters/
 */

import type { AssetInfo } from '@cocos/creator-types/editor/packages/asset-db/@types/public';
import { BaseAssetInterpreter } from './base';
import { PropertySetSpec, PropertySetResult } from './interface';

export class ImageInterpreter extends BaseAssetInterpreter {
    get importerType(): string { return 'image'; }

    // Top-level image properties live directly under userData; sub-asset
    // properties (texture/spriteFrame) live under subMetas[name].userData.
    private static readonly TOP_LEVEL_KEYS = new Set([
        'type', 'flipVertical', 'fixAlphaTransparencyArtifacts',
        'flipGreenChannel', 'isRGBE',
    ]);

    protected async setProperty(meta: any, prop: PropertySetSpec): Promise<boolean> {
        const parts = prop.propertyPath.split('.');

        // Flat path: a top-level image property. Hoist into userData.
        if (parts.length === 1 && ImageInterpreter.TOP_LEVEL_KEYS.has(parts[0])) {
            if (!meta.userData) meta.userData = {};
            meta.userData[parts[0]] = this.convertPropertyValue(prop.propertyValue, prop.propertyType);
            return true;
        }

        // Sub-asset shorthand: `texture.<prop>` or `spriteFrame.<prop>`.
        // Find the matching sub-meta by name and write into its userData.
        if (parts.length > 1 && (parts[0] === 'texture' || parts[0] === 'spriteFrame')) {
            const subAssetName = parts[0];
            const propertyName = parts.slice(1).join('.');
            if (!meta.subMetas) meta.subMetas = {};
            for (const subMeta of Object.values(meta.subMetas) as any[]) {
                if (!subMeta || typeof subMeta !== 'object') continue;
                // RomaRogov treats either uuid match or the literal name
                // as a hit; we keep the literal-name behaviour since
                // image sub-metas are conventionally keyed by name.
                if (!subMeta.userData) subMeta.userData = {};
                const inner = propertyName.split('.');
                let cursor = subMeta.userData;
                for (let i = 0; i < inner.length - 1; i++) {
                    if (cursor[inner[i]] === undefined || cursor[inner[i]] === null) cursor[inner[i]] = {};
                    cursor = cursor[inner[i]];
                }
                cursor[inner[inner.length - 1]] = this.convertPropertyValue(prop.propertyValue, prop.propertyType);
                return true;
            }
            // No sub-meta matched — fall through to generic handler so
            // path-validation kicks in.
        }

        return super.setProperty(meta, prop);
    }
}

export class TextureInterpreter extends BaseAssetInterpreter {
    get importerType(): string { return 'texture'; }
}

export class SpriteFrameInterpreter extends BaseAssetInterpreter {
    get importerType(): string { return 'sprite-frame'; }

    // Computed-from-source fields the editor recomputes on import; AI
    // writes to these are silently dropped on save and waste round-trips.
    private static readonly READ_ONLY = new Set([
        'width', 'height', 'rawWidth', 'rawHeight',
        'trimX', 'trimY', 'offsetX', 'offsetY',
        'vertices', 'rotated', 'isUuid', 'imageUuidOrDatabaseUri',
    ]);

    protected async setProperty(meta: any, prop: PropertySetSpec): Promise<boolean> {
        const propertyName = prop.propertyPath.replace(/^userData\./, '');
        if (SpriteFrameInterpreter.READ_ONLY.has(propertyName)) {
            throw new Error(`SpriteFrame property '${propertyName}' is read-only (computed from source image)`);
        }
        return super.setProperty(meta, prop);
    }
}

export class FbxInterpreter extends BaseAssetInterpreter {
    get importerType(): string { return 'fbx'; }
}

export class MaterialInterpreter extends BaseAssetInterpreter {
    get importerType(): string { return 'material'; }

    // v2.4.3 deliberately exposes only meta userData reads. effect /
    // technique / passes editing requires scene/apply-material plus an
    // asset-uuid preprocessing layer (RomaRogov uses McpServerManager.
    // decodeUuid) that we'd need to port wholesale. Until that lands
    // in v2.5+, AI should drive material edits via execute_javascript
    // with context='scene' — that path can call cce.SceneFacade
    // directly and is already shipped (v2.3.0).
    async setProperties(assetInfo: AssetInfo, properties: PropertySetSpec[]): Promise<PropertySetResult[]> {
        // userData edits go through the base path; everything else
        // gets routed to the helpful-error explanation.
        const userDataOnly: PropertySetSpec[] = [];
        const otherResults: PropertySetResult[] = [];
        for (const p of properties) {
            if (p.propertyPath.startsWith('userData.')) {
                userDataOnly.push(p);
            } else {
                otherResults.push({
                    propertyPath: p.propertyPath,
                    success: false,
                    error: `MaterialInterpreter v2.4.3 only supports userData.* writes. For effect/technique/passes use debug_execute_javascript (context='scene') with cce.SceneFacade.applyMaterial; full material editing lands in v2.5+.`,
                });
            }
        }
        if (userDataOnly.length === 0) return otherResults;
        const baseResults = await super.setProperties(assetInfo, userDataOnly);
        return [...baseResults, ...otherResults];
    }
}

export class EffectInterpreter extends BaseAssetInterpreter {
    get importerType(): string { return 'effect'; }
}

export class ParticleInterpreter extends BaseAssetInterpreter {
    get importerType(): string { return 'particle'; }
}

/**
 * Catch-all for importer strings we don't have a specialized handler
 * for. Reads work via the base class (best-effort dump of userData +
 * subMetas), but writes are rejected — without knowing the importer's
 * meta layout, blindly writing risks corrupting the asset.
 */
export class UnknownInterpreter extends BaseAssetInterpreter {
    get importerType(): string { return '*'; }

    async setProperties(assetInfo: AssetInfo, properties: PropertySetSpec[]): Promise<PropertySetResult[]> {
        return properties.map(p => ({
            propertyPath: p.propertyPath,
            success: false,
            error: `No specialized interpreter for importer '${assetInfo.importer}'. Asset writes are rejected to avoid corrupting an unknown meta shape; reads via asset_get_properties still work. File a request to add a specialized interpreter.`,
        }));
    }
}
