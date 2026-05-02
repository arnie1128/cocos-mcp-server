"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnknownInterpreter = exports.TiledMapInterpreter = exports.JsonInterpreter = exports.SpineInterpreter = exports.LabelAtlasInterpreter = exports.SceneInterpreter = exports.PrefabInterpreter = exports.AudioClipInterpreter = exports.AnimationClipInterpreter = exports.ParticleInterpreter = exports.EffectInterpreter = exports.MaterialInterpreter = exports.FbxInterpreter = exports.SpriteFrameInterpreter = exports.TextureInterpreter = exports.ImageInterpreter = void 0;
const base_1 = require("./base");
// v2.4.5 review fix (claude): inline guard set so the inner
// ImageInterpreter walk doesn't have to call isPathSafe with a
// fake-root just to reuse the helper. Same forbidden segments
// as base.ts FORBIDDEN_PATH_SEGMENTS.
const FORBIDDEN_INNER_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);
class ImageInterpreter extends base_1.BaseAssetInterpreter {
    get importerType() { return 'image'; }
    async setProperty(meta, prop) {
        const parts = prop.propertyPath.split('.');
        // Flat path: a top-level image property. Hoist into userData.
        if (parts.length === 1 && ImageInterpreter.TOP_LEVEL_KEYS.has(parts[0])) {
            if (!meta.userData)
                meta.userData = {};
            meta.userData[parts[0]] = this.convertPropertyValue(prop.propertyValue, prop.propertyType);
            return true;
        }
        // Sub-asset shorthand: `texture.<prop>` or `spriteFrame.<prop>`.
        // v2.4.4 review fix (gemini + claude + codex): the v2.4.3
        // implementation iterated `Object.values(meta.subMetas)` and
        // wrote into the FIRST sub-meta found, ignoring whether the
        // path mentioned `texture` or `spriteFrame`. Cocos image
        // assets typically have BOTH, so writes silently corrupted
        // the wrong sub-asset. Now match each sub-meta by either its
        // declared `name` field or by the importer string (image's
        // sub-metas are themselves importers `texture` and
        // `sprite-frame`).
        if (parts.length > 1 && (parts[0] === 'texture' || parts[0] === 'spriteFrame')) {
            const subAssetName = parts[0];
            const subImporterTag = subAssetName === 'spriteFrame' ? 'sprite-frame' : 'texture';
            const propertyName = parts.slice(1).join('.');
            // Re-validate the inner path through the proto-pollution
            // guard. `texture.__proto__.x` would otherwise bypass the
            // base validator entirely.
            const inner = propertyName.split('.');
            for (const seg of inner) {
                if (seg === '' || FORBIDDEN_INNER_SEGMENTS.has(seg)) {
                    throw new Error(`Forbidden / empty path segment in image sub-asset path '${prop.propertyPath}'`);
                }
            }
            if (!meta.subMetas)
                meta.subMetas = {};
            // v2.4.5 review fix (codex): match by sub-meta key as well,
            // not only by name / importer fields. Image sub-metas are
            // commonly keyed by literal name in the meta JSON, so a
            // key === 'texture' / 'spriteFrame' lookup is the most
            // direct match. Falls back to name / importer for cases
            // where the key is a UUID.
            let target = null;
            for (const [key, sub] of Object.entries(meta.subMetas)) {
                if (!sub || typeof sub !== 'object')
                    continue;
                const subName = sub.name;
                const subImporter = sub.importer;
                if (key === subAssetName || subName === subAssetName || subImporter === subImporterTag) {
                    target = sub;
                    break;
                }
            }
            if (!target) {
                throw new Error(`Image asset has no '${subAssetName}' sub-meta to write to (looked for key='${subAssetName}', name='${subAssetName}', or importer='${subImporterTag}')`);
            }
            if (!target.userData)
                target.userData = {};
            let cursor = target.userData;
            for (let i = 0; i < inner.length - 1; i++) {
                if (cursor[inner[i]] === undefined || cursor[inner[i]] === null)
                    cursor[inner[i]] = {};
                cursor = cursor[inner[i]];
            }
            cursor[inner[inner.length - 1]] = this.convertPropertyValue(prop.propertyValue, prop.propertyType);
            return true;
        }
        return super.setProperty(meta, prop);
    }
}
exports.ImageInterpreter = ImageInterpreter;
// Top-level image properties live directly under userData; sub-asset
// properties (texture/spriteFrame) live under subMetas[name].userData.
ImageInterpreter.TOP_LEVEL_KEYS = new Set([
    'type', 'flipVertical', 'fixAlphaTransparencyArtifacts',
    'flipGreenChannel', 'isRGBE',
]);
class TextureInterpreter extends base_1.BaseAssetInterpreter {
    get importerType() { return 'texture'; }
}
exports.TextureInterpreter = TextureInterpreter;
class SpriteFrameInterpreter extends base_1.BaseAssetInterpreter {
    get importerType() { return 'sprite-frame'; }
    async setProperty(meta, prop) {
        const propertyName = prop.propertyPath.replace(/^userData\./, '');
        if (SpriteFrameInterpreter.READ_ONLY.has(propertyName)) {
            throw new Error(`SpriteFrame property '${propertyName}' is read-only (computed from source image)`);
        }
        return super.setProperty(meta, prop);
    }
}
exports.SpriteFrameInterpreter = SpriteFrameInterpreter;
// Computed-from-source fields the editor recomputes on import; AI
// writes to these are silently dropped on save and waste round-trips.
SpriteFrameInterpreter.READ_ONLY = new Set([
    'width', 'height', 'rawWidth', 'rawHeight',
    'trimX', 'trimY', 'offsetX', 'offsetY',
    'vertices', 'rotated', 'isUuid', 'imageUuidOrDatabaseUri',
]);
class FbxInterpreter extends base_1.BaseAssetInterpreter {
    get importerType() { return 'fbx'; }
}
exports.FbxInterpreter = FbxInterpreter;
class MaterialInterpreter extends base_1.BaseAssetInterpreter {
    get importerType() { return 'material'; }
    // v2.4.3 deliberately exposes only meta userData reads. effect /
    // technique / passes editing requires scene/apply-material plus an
    // asset-uuid preprocessing layer (RomaRogov uses McpServerManager.
    // decodeUuid) that we'd need to port wholesale. Until that lands
    // in v2.5+, AI should drive material edits via execute_javascript
    // with context='scene' — that path can call cce.SceneFacade
    // directly and is already shipped (v2.3.0).
    async setProperties(assetInfo, properties) {
        // userData edits go through the base path; everything else
        // gets routed to the helpful-error explanation.
        const userDataOnly = [];
        const otherResults = [];
        for (const p of properties) {
            if (p.propertyPath.startsWith('userData.')) {
                userDataOnly.push(p);
            }
            else {
                otherResults.push({
                    propertyPath: p.propertyPath,
                    success: false,
                    error: `MaterialInterpreter v2.4.3 only supports userData.* writes. For effect/technique/passes use debug_execute_javascript (context='scene') with cce.SceneFacade.applyMaterial; full material editing lands in v2.5+.`,
                });
            }
        }
        if (userDataOnly.length === 0)
            return otherResults;
        const baseResults = await super.setProperties(assetInfo, userDataOnly);
        return [...baseResults, ...otherResults];
    }
}
exports.MaterialInterpreter = MaterialInterpreter;
class EffectInterpreter extends base_1.BaseAssetInterpreter {
    get importerType() { return 'effect'; }
}
exports.EffectInterpreter = EffectInterpreter;
class ParticleInterpreter extends base_1.BaseAssetInterpreter {
    get importerType() { return 'particle'; }
}
exports.ParticleInterpreter = ParticleInterpreter;
class AnimationClipInterpreter extends base_1.BaseAssetInterpreter {
    get importerType() { return 'animation-clip'; }
}
exports.AnimationClipInterpreter = AnimationClipInterpreter;
class AudioClipInterpreter extends base_1.BaseAssetInterpreter {
    get importerType() { return 'audio-clip'; }
}
exports.AudioClipInterpreter = AudioClipInterpreter;
class PrefabInterpreter extends base_1.BaseAssetInterpreter {
    get importerType() { return 'prefab'; }
}
exports.PrefabInterpreter = PrefabInterpreter;
class SceneInterpreter extends base_1.BaseAssetInterpreter {
    get importerType() { return 'scene'; }
}
exports.SceneInterpreter = SceneInterpreter;
class LabelAtlasInterpreter extends base_1.BaseAssetInterpreter {
    get importerType() { return 'label-atlas'; }
}
exports.LabelAtlasInterpreter = LabelAtlasInterpreter;
class SpineInterpreter extends base_1.BaseAssetInterpreter {
    get importerType() { return 'spine'; }
}
exports.SpineInterpreter = SpineInterpreter;
class JsonInterpreter extends base_1.BaseAssetInterpreter {
    get importerType() { return 'json'; }
}
exports.JsonInterpreter = JsonInterpreter;
class TiledMapInterpreter extends base_1.BaseAssetInterpreter {
    get importerType() { return 'tiled-map'; }
}
exports.TiledMapInterpreter = TiledMapInterpreter;
/**
 * Catch-all for importer strings we don't have a specialized handler
 * for. Reads work via the base class (best-effort dump of userData +
 * subMetas), but writes are rejected — without knowing the importer's
 * meta layout, blindly writing risks corrupting the asset.
 */
class UnknownInterpreter extends base_1.BaseAssetInterpreter {
    get importerType() { return '*'; }
    async setProperties(assetInfo, properties) {
        return properties.map(p => ({
            propertyPath: p.propertyPath,
            success: false,
            error: `No specialized interpreter for importer '${assetInfo.importer}'. Asset writes are rejected to avoid corrupting an unknown meta shape; reads via assetMeta_get_properties still work. File a request to add a specialized interpreter.`,
        }));
    }
}
exports.UnknownInterpreter = UnknownInterpreter;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3BlY2lhbGl6ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvYXNzZXQtaW50ZXJwcmV0ZXJzL3NwZWNpYWxpemVkLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FtQ0c7OztBQUdILGlDQUE4QztBQUc5Qyw0REFBNEQ7QUFDNUQsK0RBQStEO0FBQy9ELDhEQUE4RDtBQUM5RCxzQ0FBc0M7QUFDdEMsTUFBTSx3QkFBd0IsR0FBRyxJQUFJLEdBQUcsQ0FBQyxDQUFDLFdBQVcsRUFBRSxhQUFhLEVBQUUsV0FBVyxDQUFDLENBQUMsQ0FBQztBQUVwRixNQUFhLGdCQUFpQixTQUFRLDJCQUFvQjtJQUN0RCxJQUFJLFlBQVksS0FBYSxPQUFPLE9BQU8sQ0FBQyxDQUFDLENBQUM7SUFTcEMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxJQUFTLEVBQUUsSUFBcUI7UUFDeEQsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7UUFFM0MsOERBQThEO1FBQzlELElBQUksS0FBSyxDQUFDLE1BQU0sS0FBSyxDQUFDLElBQUksZ0JBQWdCLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQ3RFLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUTtnQkFBRSxJQUFJLENBQUMsUUFBUSxHQUFHLEVBQUUsQ0FBQztZQUN2QyxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUMzRixPQUFPLElBQUksQ0FBQztRQUNoQixDQUFDO1FBRUQsaUVBQWlFO1FBQ2pFLDBEQUEwRDtRQUMxRCw2REFBNkQ7UUFD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QU8sQ0FBQyxDQUFDLENBQUM7Q0FDakQ7QUFGRCw0Q0FFQztBQUVELE1BQWEsZUFBZ0IsU0FBUSwyQkFBb0I7SUFDckQsSUFBSSxZQUFZLEtBQWEsT0FBTyxNQUFNLENBQUMsQ0FBQyxDQUFDO0NBQ2hEO0FBRkQsMENBRUM7QUFFRCxNQUFhLG1CQUFvQixTQUFRLDJCQUFvQjtJQUN6RCxJQUFJLFlBQVksS0FBYSxPQUFPLFdBQVcsQ0FBQyxDQUFDLENBQUM7Q0FDckQ7QUFGRCxrREFFQztBQUdEOzs7OztHQUtHO0FBQ0gsTUFBYSxrQkFBbUIsU0FBUSwyQkFBb0I7SUFDeEQsSUFBSSxZQUFZLEtBQWEsT0FBTyxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBRTFDLEtBQUssQ0FBQyxhQUFhLENBQUMsU0FBb0IsRUFBRSxVQUE2QjtRQUNuRSxPQUFPLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ3hCLFlBQVksRUFBRSxDQUFDLENBQUMsWUFBWTtZQUM1QixPQUFPLEVBQUUsS0FBSztZQUNkLEtBQUssRUFBRSw0Q0FBNEMsU0FBUyxDQUFDLFFBQVEseUtBQXlLO1NBQ2pQLENBQUMsQ0FBQyxDQUFDO0lBQ1IsQ0FBQztDQUNKO0FBVkQsZ0RBVUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEVpZ2h0IHNwZWNpYWxpemVkIGFzc2V0IGludGVycHJldGVycyBjb3ZlcmluZyB0aGUgaGlnaGVzdC12YWx1ZVxuICogYXNzZXQgdHlwZXMgcGVyIFJvbWFSb2dvdidzIHJlZmVyZW5jZSBzZXQ6XG4gKlxuICogICBJbWFnZUludGVycHJldGVyICAgICAgICDigJQgYGltYWdlYCAgICAgICAgKHRleHR1cmVzICsgc3ViLWFzc2V0IHJvdXRpbmcpXG4gKiAgIFRleHR1cmVJbnRlcnByZXRlciAgICAgIOKAlCBgdGV4dHVyZWBcbiAqICAgU3ByaXRlRnJhbWVJbnRlcnByZXRlciAg4oCUIGBzcHJpdGUtZnJhbWVgIChyZWFkLW9ubHkgLyB3cml0YWJsZSBndWFyZHMpXG4gKiAgIEZieEludGVycHJldGVyICAgICAgICAgIOKAlCBgZmJ4YFxuICogICBNYXRlcmlhbEludGVycHJldGVyICAgICDigJQgYG1hdGVyaWFsYCAgICAgKHJlYWQtb25seSB2aWEgYmFzZTsgYWR2YW5jZWQgZWRpdGluZyDihpIgZXhlY3V0ZV9qYXZhc2NyaXB0KVxuICogICBFZmZlY3RJbnRlcnByZXRlciAgICAgICDigJQgYGVmZmVjdGBcbiAqICAgUGFydGljbGVJbnRlcnByZXRlciAgICAg4oCUIGBwYXJ0aWNsZWBcbiAqICAgVW5rbm93bkludGVycHJldGVyICAgICAg4oCUIGAqYCAgICAgICAgICAgIChyZWFkLW9ubHkgZmFsbGJhY2spXG4gKlxuICogRWFjaCBpcyBhIHRoaW4gZXh0ZW5zaW9uIG9mIEJhc2VBc3NldEludGVycHJldGVyIOKAlCBtb3N0IG9ubHkgb3ZlcnJpZGVcbiAqIGBpbXBvcnRlclR5cGVgLiBUd28gbm90YWJsZSBvdmVycmlkZXM6XG4gKlxuICogICBJbWFnZUludGVycHJldGVyLnNldFByb3BlcnR5OiBpbWFnZSBtZXRhIGhhcyBib3RoIHRvcC1sZXZlbFxuICogICB1c2VyRGF0YSBmaWVsZHMgKHR5cGUgLyBmbGlwVmVydGljYWwgLyBldGMpIGFuZCBzdWItYXNzZXRcbiAqICAgdXNlckRhdGEgKHRoZSBgdGV4dHVyZWAgLyBgc3ByaXRlRnJhbWVgIHN1Yi1tZXRhcykuIFJvdXRlcyBieVxuICogICBwYXRoIHNoYXBlIHNvIEFJIGNhbiBwYXNzIGVpdGhlciBmbGF0IG9yIG5lc3RlZCBwYXRocy5cbiAqXG4gKiAgIFNwcml0ZUZyYW1lSW50ZXJwcmV0ZXIuc2V0UHJvcGVydHk6IHNwcml0ZS1mcmFtZSBtZXRhIGhhcyBtYW55XG4gKiAgIGNvbXB1dGVkIHJlYWQtb25seSBmaWVsZHMgKHdpZHRoLCBoZWlnaHQsIHJvdGF0ZWQsIGV0Yy4pOyByZWplY3RcbiAqICAgd3JpdGVzIHRvIHRoZW0gdXAtZnJvbnQgd2l0aCBhIGNsZWFyIGVycm9yIHJhdGhlciB0aGFuIHNpbGVudGx5XG4gKiAgIG5vLW9wLlxuICpcbiAqIE1hdGVyaWFsICplZGl0aW5nKiAoZWZmZWN0L3Bhc3Nlcy9wcm9wcykgZGVsaWJlcmF0ZWx5IGRlZmVycmVkIOKAlFxuICogUm9tYVJvZ292IHVzZXMgYHNjZW5lL3F1ZXJ5LW1hdGVyaWFsYCArIGBzY2VuZS9hcHBseS1tYXRlcmlhbGAgK1xuICogYW4gYXN5bmMgYXNzZXQtdXVpZCBwcmVwcm9jZXNzaW5nIGxheWVyIHRoYXQgcHVsbHMgaW4gdGhlaXJcbiAqIE1jcFNlcnZlck1hbmFnZXIuZGVjb2RlVXVpZCBwbHVtYmluZy4gRm9yIHYyLjQuMyB0aGUgbWF0ZXJpYWxcbiAqIGludGVycHJldGVyIG9ubHkgcmVhZHMgbWV0YSB1c2VyRGF0YTsgQUkgbmVlZGluZyB0byBzd2FwIGVmZmVjdHNcbiAqIG9yIHNldCBwYXNzZXMgc2hvdWxkIHVzZSBleGVjdXRlX2phdmFzY3JpcHQgd2l0aCBzY2VuZSBjb250ZXh0XG4gKiAoYWxyZWFkeSBzaGlwcGVkIGluIHYyLjMuMCkuXG4gKlxuICogUmVmZXJlbmNlOiBEOi8xX2Rldi9jb2Nvcy1tY3AtcmVmZXJlbmNlcy9Sb21hUm9nb3YtY29jb3MtbWNwL3NvdXJjZS9tY3AvdG9vbHMvYXNzZXQtaW50ZXJwcmV0ZXJzL1xuICovXG5cbmltcG9ydCB0eXBlIHsgQXNzZXRJbmZvIH0gZnJvbSAnQGNvY29zL2NyZWF0b3ItdHlwZXMvZWRpdG9yL3BhY2thZ2VzL2Fzc2V0LWRiL0B0eXBlcy9wdWJsaWMnO1xuaW1wb3J0IHsgQmFzZUFzc2V0SW50ZXJwcmV0ZXIgfSBmcm9tICcuL2Jhc2UnO1xuaW1wb3J0IHsgUHJvcGVydHlTZXRTcGVjLCBQcm9wZXJ0eVNldFJlc3VsdCB9IGZyb20gJy4vaW50ZXJmYWNlJztcblxuLy8gdjIuNC41IHJldmlldyBmaXggKGNsYXVkZSk6IGlubGluZSBndWFyZCBzZXQgc28gdGhlIGlubmVyXG4vLyBJbWFnZUludGVycHJldGVyIHdhbGsgZG9lc24ndCBoYXZlIHRvIGNhbGwgaXNQYXRoU2FmZSB3aXRoIGFcbi8vIGZha2Utcm9vdCBqdXN0IHRvIHJldXNlIHRoZSBoZWxwZXIuIFNhbWUgZm9yYmlkZGVuIHNlZ21lbnRzXG4vLyBhcyBiYXNlLnRzIEZPUkJJRERFTl9QQVRIX1NFR01FTlRTLlxuY29uc3QgRk9SQklEREVOX0lOTkVSX1NFR01FTlRTID0gbmV3IFNldChbJ19fcHJvdG9fXycsICdjb25zdHJ1Y3RvcicsICdwcm90b3R5cGUnXSk7XG5cbmV4cG9ydCBjbGFzcyBJbWFnZUludGVycHJldGVyIGV4dGVuZHMgQmFzZUFzc2V0SW50ZXJwcmV0ZXIge1xuICAgIGdldCBpbXBvcnRlclR5cGUoKTogc3RyaW5nIHsgcmV0dXJuICdpbWFnZSc7IH1cblxuICAgIC8vIFRvcC1sZXZlbCBpbWFnZSBwcm9wZXJ0aWVzIGxpdmUgZGlyZWN0bHkgdW5kZXIgdXNlckRhdGE7IHN1Yi1hc3NldFxuICAgIC8vIHByb3BlcnRpZXMgKHRleHR1cmUvc3ByaXRlRnJhbWUpIGxpdmUgdW5kZXIgc3ViTWV0YXNbbmFtZV0udXNlckRhdGEuXG4gICAgcHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgVE9QX0xFVkVMX0tFWVMgPSBuZXcgU2V0KFtcbiAgICAgICAgJ3R5cGUnLCAnZmxpcFZlcnRpY2FsJywgJ2ZpeEFscGhhVHJhbnNwYXJlbmN5QXJ0aWZhY3RzJyxcbiAgICAgICAgJ2ZsaXBHcmVlbkNoYW5uZWwnLCAnaXNSR0JFJyxcbiAgICBdKTtcblxuICAgIHByb3RlY3RlZCBhc3luYyBzZXRQcm9wZXJ0eShtZXRhOiBhbnksIHByb3A6IFByb3BlcnR5U2V0U3BlYyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgICAgICBjb25zdCBwYXJ0cyA9IHByb3AucHJvcGVydHlQYXRoLnNwbGl0KCcuJyk7XG5cbiAgICAgICAgLy8gRmxhdCBwYXRoOiBhIHRvcC1sZXZlbCBpbWFnZSBwcm9wZXJ0eS4gSG9pc3QgaW50byB1c2VyRGF0YS5cbiAgICAgICAgaWYgKHBhcnRzLmxlbmd0aCA9PT0gMSAmJiBJbWFnZUludGVycHJldGVyLlRPUF9MRVZFTF9LRVlTLmhhcyhwYXJ0c1swXSkpIHtcbiAgICAgICAgICAgIGlmICghbWV0YS51c2VyRGF0YSkgbWV0YS51c2VyRGF0YSA9IHt9O1xuICAgICAgICAgICAgbWV0YS51c2VyRGF0YVtwYXJ0c1swXV0gPSB0aGlzLmNvbnZlcnRQcm9wZXJ0eVZhbHVlKHByb3AucHJvcGVydHlWYWx1ZSwgcHJvcC5wcm9wZXJ0eVR5cGUpO1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBTdWItYXNzZXQgc2hvcnRoYW5kOiBgdGV4dHVyZS48cHJvcD5gIG9yIGBzcHJpdGVGcmFtZS48cHJvcD5gLlxuICAgICAgICAvLyB2Mi40LjQgcmV2aWV3IGZpeCAoZ2VtaW5pICsgY2xhdWRlICsgY29kZXgpOiB0aGUgdjIuNC4zXG4gICAgICAgIC8vIGltcGxlbWVudGF0aW9uIGl0ZXJhdGVkIGBPYmplY3QudmFsdWVzKG1ldGEuc3ViTWV0YXMpYCBhbmRcbiAgICAgICAgLy8gd3JvdGUgaW50byB0aGUgRklSU1Qgc3ViLW1ldGEgZm91bmQsIGlnbm9yaW5nIHdoZXRoZXIgdGhlXG4gICAgICAgIC8vIHBhdGggbWVudGlvbmVkIGB0ZXh0dXJlYCBvciBgc3ByaXRlRnJhbWVgLiBDb2NvcyBpbWFnZVxuICAgICAgICAvLyBhc3NldHMgdHlwaWNhbGx5IGhhdmUgQk9USCwgc28gd3JpdGVzIHNpbGVudGx5IGNvcnJ1cHRlZFxuICAgICAgICAvLyB0aGUgd3Jvbmcgc3ViLWFzc2V0LiBOb3cgbWF0Y2ggZWFjaCBzdWItbWV0YSBieSBlaXRoZXIgaXRzXG4gICAgICAgIC8vIGRlY2xhcmVkIGBuYW1lYCBmaWVsZCBvciBieSB0aGUgaW1wb3J0ZXIgc3RyaW5nIChpbWFnZSdzXG4gICAgICAgIC8vIHN1Yi1tZXRhcyBhcmUgdGhlbXNlbHZlcyBpbXBvcnRlcnMgYHRleHR1cmVgIGFuZFxuICAgICAgICAvLyBgc3ByaXRlLWZyYW1lYCkuXG4gICAgICAgIGlmIChwYXJ0cy5sZW5ndGggPiAxICYmIChwYXJ0c1swXSA9PT0gJ3RleHR1cmUnIHx8IHBhcnRzWzBdID09PSAnc3ByaXRlRnJhbWUnKSkge1xuICAgICAgICAgICAgY29uc3Qgc3ViQXNzZXROYW1lID0gcGFydHNbMF07XG4gICAgICAgICAgICBjb25zdCBzdWJJbXBvcnRlclRhZyA9IHN1YkFzc2V0TmFtZSA9PT0gJ3Nwcml0ZUZyYW1lJyA/ICdzcHJpdGUtZnJhbWUnIDogJ3RleHR1cmUnO1xuICAgICAgICAgICAgY29uc3QgcHJvcGVydHlOYW1lID0gcGFydHMuc2xpY2UoMSkuam9pbignLicpO1xuXG4gICAgICAgICAgICAvLyBSZS12YWxpZGF0ZSB0aGUgaW5uZXIgcGF0aCB0aHJvdWdoIHRoZSBwcm90by1wb2xsdXRpb25cbiAgICAgICAgICAgIC8vIGd1YXJkLiBgdGV4dHVyZS5fX3Byb3RvX18ueGAgd291bGQgb3RoZXJ3aXNlIGJ5cGFzcyB0aGVcbiAgICAgICAgICAgIC8vIGJhc2UgdmFsaWRhdG9yIGVudGlyZWx5LlxuICAgICAgICAgICAgY29uc3QgaW5uZXIgPSBwcm9wZXJ0eU5hbWUuc3BsaXQoJy4nKTtcbiAgICAgICAgICAgIGZvciAoY29uc3Qgc2VnIG9mIGlubmVyKSB7XG4gICAgICAgICAgICAgICAgaWYgKHNlZyA9PT0gJycgfHwgRk9SQklEREVOX0lOTkVSX1NFR01FTlRTLmhhcyhzZWcpKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgRm9yYmlkZGVuIC8gZW1wdHkgcGF0aCBzZWdtZW50IGluIGltYWdlIHN1Yi1hc3NldCBwYXRoICcke3Byb3AucHJvcGVydHlQYXRofSdgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICghbWV0YS5zdWJNZXRhcykgbWV0YS5zdWJNZXRhcyA9IHt9O1xuICAgICAgICAgICAgLy8gdjIuNC41IHJldmlldyBmaXggKGNvZGV4KTogbWF0Y2ggYnkgc3ViLW1ldGEga2V5IGFzIHdlbGwsXG4gICAgICAgICAgICAvLyBub3Qgb25seSBieSBuYW1lIC8gaW1wb3J0ZXIgZmllbGRzLiBJbWFnZSBzdWItbWV0YXMgYXJlXG4gICAgICAgICAgICAvLyBjb21tb25seSBrZXllZCBieSBsaXRlcmFsIG5hbWUgaW4gdGhlIG1ldGEgSlNPTiwgc28gYVxuICAgICAgICAgICAgLy8ga2V5ID09PSAndGV4dHVyZScgLyAnc3ByaXRlRnJhbWUnIGxvb2t1cCBpcyB0aGUgbW9zdFxuICAgICAgICAgICAgLy8gZGlyZWN0IG1hdGNoLiBGYWxscyBiYWNrIHRvIG5hbWUgLyBpbXBvcnRlciBmb3IgY2FzZXNcbiAgICAgICAgICAgIC8vIHdoZXJlIHRoZSBrZXkgaXMgYSBVVUlELlxuICAgICAgICAgICAgbGV0IHRhcmdldDogYW55ID0gbnVsbDtcbiAgICAgICAgICAgIGZvciAoY29uc3QgW2tleSwgc3ViXSBvZiBPYmplY3QuZW50cmllcyhtZXRhLnN1Yk1ldGFzKSBhcyBbc3RyaW5nLCBhbnldW10pIHtcbiAgICAgICAgICAgICAgICBpZiAoIXN1YiB8fCB0eXBlb2Ygc3ViICE9PSAnb2JqZWN0JykgY29udGludWU7XG4gICAgICAgICAgICAgICAgY29uc3Qgc3ViTmFtZSA9IChzdWIgYXMgYW55KS5uYW1lO1xuICAgICAgICAgICAgICAgIGNvbnN0IHN1YkltcG9ydGVyID0gKHN1YiBhcyBhbnkpLmltcG9ydGVyO1xuICAgICAgICAgICAgICAgIGlmIChrZXkgPT09IHN1YkFzc2V0TmFtZSB8fCBzdWJOYW1lID09PSBzdWJBc3NldE5hbWUgfHwgc3ViSW1wb3J0ZXIgPT09IHN1YkltcG9ydGVyVGFnKSB7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldCA9IHN1YjtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCF0YXJnZXQpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgICAgICAgICAgIGBJbWFnZSBhc3NldCBoYXMgbm8gJyR7c3ViQXNzZXROYW1lfScgc3ViLW1ldGEgdG8gd3JpdGUgdG8gKGxvb2tlZCBmb3Iga2V5PScke3N1YkFzc2V0TmFtZX0nLCBuYW1lPScke3N1YkFzc2V0TmFtZX0nLCBvciBpbXBvcnRlcj0nJHtzdWJJbXBvcnRlclRhZ30nKWBcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCF0YXJnZXQudXNlckRhdGEpIHRhcmdldC51c2VyRGF0YSA9IHt9O1xuICAgICAgICAgICAgbGV0IGN1cnNvciA9IHRhcmdldC51c2VyRGF0YTtcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgaW5uZXIubGVuZ3RoIC0gMTsgaSsrKSB7XG4gICAgICAgICAgICAgICAgaWYgKGN1cnNvcltpbm5lcltpXV0gPT09IHVuZGVmaW5lZCB8fCBjdXJzb3JbaW5uZXJbaV1dID09PSBudWxsKSBjdXJzb3JbaW5uZXJbaV1dID0ge307XG4gICAgICAgICAgICAgICAgY3Vyc29yID0gY3Vyc29yW2lubmVyW2ldXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGN1cnNvcltpbm5lcltpbm5lci5sZW5ndGggLSAxXV0gPSB0aGlzLmNvbnZlcnRQcm9wZXJ0eVZhbHVlKHByb3AucHJvcGVydHlWYWx1ZSwgcHJvcC5wcm9wZXJ0eVR5cGUpO1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gc3VwZXIuc2V0UHJvcGVydHkobWV0YSwgcHJvcCk7XG4gICAgfVxufVxuXG5leHBvcnQgY2xhc3MgVGV4dHVyZUludGVycHJldGVyIGV4dGVuZHMgQmFzZUFzc2V0SW50ZXJwcmV0ZXIge1xuICAgIGdldCBpbXBvcnRlclR5cGUoKTogc3RyaW5nIHsgcmV0dXJuICd0ZXh0dXJlJzsgfVxufVxuXG5leHBvcnQgY2xhc3MgU3ByaXRlRnJhbWVJbnRlcnByZXRlciBleHRlbmRzIEJhc2VBc3NldEludGVycHJldGVyIHtcbiAgICBnZXQgaW1wb3J0ZXJUeXBlKCk6IHN0cmluZyB7IHJldHVybiAnc3ByaXRlLWZyYW1lJzsgfVxuXG4gICAgLy8gQ29tcHV0ZWQtZnJvbS1zb3VyY2UgZmllbGRzIHRoZSBlZGl0b3IgcmVjb21wdXRlcyBvbiBpbXBvcnQ7IEFJXG4gICAgLy8gd3JpdGVzIHRvIHRoZXNlIGFyZSBzaWxlbnRseSBkcm9wcGVkIG9uIHNhdmUgYW5kIHdhc3RlIHJvdW5kLXRyaXBzLlxuICAgIHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFJFQURfT05MWSA9IG5ldyBTZXQoW1xuICAgICAgICAnd2lkdGgnLCAnaGVpZ2h0JywgJ3Jhd1dpZHRoJywgJ3Jhd0hlaWdodCcsXG4gICAgICAgICd0cmltWCcsICd0cmltWScsICdvZmZzZXRYJywgJ29mZnNldFknLFxuICAgICAgICAndmVydGljZXMnLCAncm90YXRlZCcsICdpc1V1aWQnLCAnaW1hZ2VVdWlkT3JEYXRhYmFzZVVyaScsXG4gICAgXSk7XG5cbiAgICBwcm90ZWN0ZWQgYXN5bmMgc2V0UHJvcGVydHkobWV0YTogYW55LCBwcm9wOiBQcm9wZXJ0eVNldFNwZWMpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICAgICAgY29uc3QgcHJvcGVydHlOYW1lID0gcHJvcC5wcm9wZXJ0eVBhdGgucmVwbGFjZSgvXnVzZXJEYXRhXFwuLywgJycpO1xuICAgICAgICBpZiAoU3ByaXRlRnJhbWVJbnRlcnByZXRlci5SRUFEX09OTFkuaGFzKHByb3BlcnR5TmFtZSkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgU3ByaXRlRnJhbWUgcHJvcGVydHkgJyR7cHJvcGVydHlOYW1lfScgaXMgcmVhZC1vbmx5IChjb21wdXRlZCBmcm9tIHNvdXJjZSBpbWFnZSlgKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gc3VwZXIuc2V0UHJvcGVydHkobWV0YSwgcHJvcCk7XG4gICAgfVxufVxuXG5leHBvcnQgY2xhc3MgRmJ4SW50ZXJwcmV0ZXIgZXh0ZW5kcyBCYXNlQXNzZXRJbnRlcnByZXRlciB7XG4gICAgZ2V0IGltcG9ydGVyVHlwZSgpOiBzdHJpbmcgeyByZXR1cm4gJ2ZieCc7IH1cbn1cblxuZXhwb3J0IGNsYXNzIE1hdGVyaWFsSW50ZXJwcmV0ZXIgZXh0ZW5kcyBCYXNlQXNzZXRJbnRlcnByZXRlciB7XG4gICAgZ2V0IGltcG9ydGVyVHlwZSgpOiBzdHJpbmcgeyByZXR1cm4gJ21hdGVyaWFsJzsgfVxuXG4gICAgLy8gdjIuNC4zIGRlbGliZXJhdGVseSBleHBvc2VzIG9ubHkgbWV0YSB1c2VyRGF0YSByZWFkcy4gZWZmZWN0IC9cbiAgICAvLyB0ZWNobmlxdWUgLyBwYXNzZXMgZWRpdGluZyByZXF1aXJlcyBzY2VuZS9hcHBseS1tYXRlcmlhbCBwbHVzIGFuXG4gICAgLy8gYXNzZXQtdXVpZCBwcmVwcm9jZXNzaW5nIGxheWVyIChSb21hUm9nb3YgdXNlcyBNY3BTZXJ2ZXJNYW5hZ2VyLlxuICAgIC8vIGRlY29kZVV1aWQpIHRoYXQgd2UnZCBuZWVkIHRvIHBvcnQgd2hvbGVzYWxlLiBVbnRpbCB0aGF0IGxhbmRzXG4gICAgLy8gaW4gdjIuNSssIEFJIHNob3VsZCBkcml2ZSBtYXRlcmlhbCBlZGl0cyB2aWEgZXhlY3V0ZV9qYXZhc2NyaXB0XG4gICAgLy8gd2l0aCBjb250ZXh0PSdzY2VuZScg4oCUIHRoYXQgcGF0aCBjYW4gY2FsbCBjY2UuU2NlbmVGYWNhZGVcbiAgICAvLyBkaXJlY3RseSBhbmQgaXMgYWxyZWFkeSBzaGlwcGVkICh2Mi4zLjApLlxuICAgIGFzeW5jIHNldFByb3BlcnRpZXMoYXNzZXRJbmZvOiBBc3NldEluZm8sIHByb3BlcnRpZXM6IFByb3BlcnR5U2V0U3BlY1tdKTogUHJvbWlzZTxQcm9wZXJ0eVNldFJlc3VsdFtdPiB7XG4gICAgICAgIC8vIHVzZXJEYXRhIGVkaXRzIGdvIHRocm91Z2ggdGhlIGJhc2UgcGF0aDsgZXZlcnl0aGluZyBlbHNlXG4gICAgICAgIC8vIGdldHMgcm91dGVkIHRvIHRoZSBoZWxwZnVsLWVycm9yIGV4cGxhbmF0aW9uLlxuICAgICAgICBjb25zdCB1c2VyRGF0YU9ubHk6IFByb3BlcnR5U2V0U3BlY1tdID0gW107XG4gICAgICAgIGNvbnN0IG90aGVyUmVzdWx0czogUHJvcGVydHlTZXRSZXN1bHRbXSA9IFtdO1xuICAgICAgICBmb3IgKGNvbnN0IHAgb2YgcHJvcGVydGllcykge1xuICAgICAgICAgICAgaWYgKHAucHJvcGVydHlQYXRoLnN0YXJ0c1dpdGgoJ3VzZXJEYXRhLicpKSB7XG4gICAgICAgICAgICAgICAgdXNlckRhdGFPbmx5LnB1c2gocCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIG90aGVyUmVzdWx0cy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgcHJvcGVydHlQYXRoOiBwLnByb3BlcnR5UGF0aCxcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIGVycm9yOiBgTWF0ZXJpYWxJbnRlcnByZXRlciB2Mi40LjMgb25seSBzdXBwb3J0cyB1c2VyRGF0YS4qIHdyaXRlcy4gRm9yIGVmZmVjdC90ZWNobmlxdWUvcGFzc2VzIHVzZSBkZWJ1Z19leGVjdXRlX2phdmFzY3JpcHQgKGNvbnRleHQ9J3NjZW5lJykgd2l0aCBjY2UuU2NlbmVGYWNhZGUuYXBwbHlNYXRlcmlhbDsgZnVsbCBtYXRlcmlhbCBlZGl0aW5nIGxhbmRzIGluIHYyLjUrLmAsXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHVzZXJEYXRhT25seS5sZW5ndGggPT09IDApIHJldHVybiBvdGhlclJlc3VsdHM7XG4gICAgICAgIGNvbnN0IGJhc2VSZXN1bHRzID0gYXdhaXQgc3VwZXIuc2V0UHJvcGVydGllcyhhc3NldEluZm8sIHVzZXJEYXRhT25seSk7XG4gICAgICAgIHJldHVybiBbLi4uYmFzZVJlc3VsdHMsIC4uLm90aGVyUmVzdWx0c107XG4gICAgfVxufVxuXG5leHBvcnQgY2xhc3MgRWZmZWN0SW50ZXJwcmV0ZXIgZXh0ZW5kcyBCYXNlQXNzZXRJbnRlcnByZXRlciB7XG4gICAgZ2V0IGltcG9ydGVyVHlwZSgpOiBzdHJpbmcgeyByZXR1cm4gJ2VmZmVjdCc7IH1cbn1cblxuZXhwb3J0IGNsYXNzIFBhcnRpY2xlSW50ZXJwcmV0ZXIgZXh0ZW5kcyBCYXNlQXNzZXRJbnRlcnByZXRlciB7XG4gICAgZ2V0IGltcG9ydGVyVHlwZSgpOiBzdHJpbmcgeyByZXR1cm4gJ3BhcnRpY2xlJzsgfVxufVxuXG5leHBvcnQgY2xhc3MgQW5pbWF0aW9uQ2xpcEludGVycHJldGVyIGV4dGVuZHMgQmFzZUFzc2V0SW50ZXJwcmV0ZXIge1xuICAgIGdldCBpbXBvcnRlclR5cGUoKTogc3RyaW5nIHsgcmV0dXJuICdhbmltYXRpb24tY2xpcCc7IH1cbn1cblxuZXhwb3J0IGNsYXNzIEF1ZGlvQ2xpcEludGVycHJldGVyIGV4dGVuZHMgQmFzZUFzc2V0SW50ZXJwcmV0ZXIge1xuICAgIGdldCBpbXBvcnRlclR5cGUoKTogc3RyaW5nIHsgcmV0dXJuICdhdWRpby1jbGlwJzsgfVxufVxuXG5leHBvcnQgY2xhc3MgUHJlZmFiSW50ZXJwcmV0ZXIgZXh0ZW5kcyBCYXNlQXNzZXRJbnRlcnByZXRlciB7XG4gICAgZ2V0IGltcG9ydGVyVHlwZSgpOiBzdHJpbmcgeyByZXR1cm4gJ3ByZWZhYic7IH1cbn1cblxuZXhwb3J0IGNsYXNzIFNjZW5lSW50ZXJwcmV0ZXIgZXh0ZW5kcyBCYXNlQXNzZXRJbnRlcnByZXRlciB7XG4gICAgZ2V0IGltcG9ydGVyVHlwZSgpOiBzdHJpbmcgeyByZXR1cm4gJ3NjZW5lJzsgfVxufVxuXG5leHBvcnQgY2xhc3MgTGFiZWxBdGxhc0ludGVycHJldGVyIGV4dGVuZHMgQmFzZUFzc2V0SW50ZXJwcmV0ZXIge1xuICAgIGdldCBpbXBvcnRlclR5cGUoKTogc3RyaW5nIHsgcmV0dXJuICdsYWJlbC1hdGxhcyc7IH1cbn1cblxuZXhwb3J0IGNsYXNzIFNwaW5lSW50ZXJwcmV0ZXIgZXh0ZW5kcyBCYXNlQXNzZXRJbnRlcnByZXRlciB7XG4gICAgZ2V0IGltcG9ydGVyVHlwZSgpOiBzdHJpbmcgeyByZXR1cm4gJ3NwaW5lJzsgfVxufVxuXG5leHBvcnQgY2xhc3MgSnNvbkludGVycHJldGVyIGV4dGVuZHMgQmFzZUFzc2V0SW50ZXJwcmV0ZXIge1xuICAgIGdldCBpbXBvcnRlclR5cGUoKTogc3RyaW5nIHsgcmV0dXJuICdqc29uJzsgfVxufVxuXG5leHBvcnQgY2xhc3MgVGlsZWRNYXBJbnRlcnByZXRlciBleHRlbmRzIEJhc2VBc3NldEludGVycHJldGVyIHtcbiAgICBnZXQgaW1wb3J0ZXJUeXBlKCk6IHN0cmluZyB7IHJldHVybiAndGlsZWQtbWFwJzsgfVxufVxuXG5cbi8qKlxuICogQ2F0Y2gtYWxsIGZvciBpbXBvcnRlciBzdHJpbmdzIHdlIGRvbid0IGhhdmUgYSBzcGVjaWFsaXplZCBoYW5kbGVyXG4gKiBmb3IuIFJlYWRzIHdvcmsgdmlhIHRoZSBiYXNlIGNsYXNzIChiZXN0LWVmZm9ydCBkdW1wIG9mIHVzZXJEYXRhICtcbiAqIHN1Yk1ldGFzKSwgYnV0IHdyaXRlcyBhcmUgcmVqZWN0ZWQg4oCUIHdpdGhvdXQga25vd2luZyB0aGUgaW1wb3J0ZXInc1xuICogbWV0YSBsYXlvdXQsIGJsaW5kbHkgd3JpdGluZyByaXNrcyBjb3JydXB0aW5nIHRoZSBhc3NldC5cbiAqL1xuZXhwb3J0IGNsYXNzIFVua25vd25JbnRlcnByZXRlciBleHRlbmRzIEJhc2VBc3NldEludGVycHJldGVyIHtcbiAgICBnZXQgaW1wb3J0ZXJUeXBlKCk6IHN0cmluZyB7IHJldHVybiAnKic7IH1cblxuICAgIGFzeW5jIHNldFByb3BlcnRpZXMoYXNzZXRJbmZvOiBBc3NldEluZm8sIHByb3BlcnRpZXM6IFByb3BlcnR5U2V0U3BlY1tdKTogUHJvbWlzZTxQcm9wZXJ0eVNldFJlc3VsdFtdPiB7XG4gICAgICAgIHJldHVybiBwcm9wZXJ0aWVzLm1hcChwID0+ICh7XG4gICAgICAgICAgICBwcm9wZXJ0eVBhdGg6IHAucHJvcGVydHlQYXRoLFxuICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICBlcnJvcjogYE5vIHNwZWNpYWxpemVkIGludGVycHJldGVyIGZvciBpbXBvcnRlciAnJHthc3NldEluZm8uaW1wb3J0ZXJ9Jy4gQXNzZXQgd3JpdGVzIGFyZSByZWplY3RlZCB0byBhdm9pZCBjb3JydXB0aW5nIGFuIHVua25vd24gbWV0YSBzaGFwZTsgcmVhZHMgdmlhIGFzc2V0TWV0YV9nZXRfcHJvcGVydGllcyBzdGlsbCB3b3JrLiBGaWxlIGEgcmVxdWVzdCB0byBhZGQgYSBzcGVjaWFsaXplZCBpbnRlcnByZXRlci5gLFxuICAgICAgICB9KSk7XG4gICAgfVxufVxuIl19