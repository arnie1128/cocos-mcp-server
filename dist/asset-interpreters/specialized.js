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
exports.UnknownInterpreter = exports.ParticleInterpreter = exports.EffectInterpreter = exports.MaterialInterpreter = exports.FbxInterpreter = exports.SpriteFrameInterpreter = exports.TextureInterpreter = exports.ImageInterpreter = void 0;
const base_1 = require("./base");
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
            // Re-validate the inner path through the same proto-pollution
            // guard the base class uses — `texture.__proto__.x` would
            // otherwise bypass the base validator entirely.
            const inner = propertyName.split('.');
            for (const seg of inner) {
                if (seg === '' || seg === '__proto__' || seg === 'constructor' || seg === 'prototype') {
                    throw new Error(`Forbidden / empty path segment in image sub-asset path '${prop.propertyPath}'`);
                }
            }
            if (!meta.subMetas)
                meta.subMetas = {};
            let target = null;
            for (const sub of Object.values(meta.subMetas)) {
                if (!sub || typeof sub !== 'object')
                    continue;
                const subName = sub.name;
                const subImporter = sub.importer;
                if (subName === subAssetName || subImporter === subImporterTag) {
                    target = sub;
                    break;
                }
            }
            if (!target) {
                throw new Error(`Image asset has no '${subAssetName}' sub-meta to write to (looked for name='${subAssetName}' or importer='${subImporterTag}')`);
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
            error: `No specialized interpreter for importer '${assetInfo.importer}'. Asset writes are rejected to avoid corrupting an unknown meta shape; reads via asset_get_properties still work. File a request to add a specialized interpreter.`,
        }));
    }
}
exports.UnknownInterpreter = UnknownInterpreter;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3BlY2lhbGl6ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvYXNzZXQtaW50ZXJwcmV0ZXJzL3NwZWNpYWxpemVkLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FtQ0c7OztBQUdILGlDQUEwRDtBQUcxRCxNQUFhLGdCQUFpQixTQUFRLDJCQUFvQjtJQUN0RCxJQUFJLFlBQVksS0FBYSxPQUFPLE9BQU8sQ0FBQyxDQUFDLENBQUM7SUFTcEMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxJQUFTLEVBQUUsSUFBcUI7UUFDeEQsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7UUFFM0MsOERBQThEO1FBQzlELElBQUksS0FBSyxDQUFDLE1BQU0sS0FBSyxDQUFDLElBQUksZ0JBQWdCLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQ3RFLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUTtnQkFBRSxJQUFJLENBQUMsUUFBUSxHQUFHLEVBQUUsQ0FBQztZQUN2QyxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUMzRixPQUFPLElBQUksQ0FBQztRQUNoQixDQUFDO1FBRUQsaUVBQWlFO1FBQ2pFLDBEQUEwRDtRQUMxRCw2REFBNkQ7UUFDN0QsNERBQTREO1FBQzVELHlEQUF5RDtRQUN6RCwyREFBMkQ7UUFDM0QsNkRBQTZEO1FBQzdELDJEQUEyRDtRQUMzRCxtREFBbUQ7UUFDbkQsbUJBQW1CO1FBQ25CLElBQUksS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLElBQUksQ0FBQyxL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LEtBQWEsT0FBTyxRQUFRLENBQUMsQ0FBQyxDQUFDO0NBQ2xEO0FBRkQsOENBRUM7QUFFRCxNQUFhLG1CQUFvQixTQUFRLDJCQUFvQjtJQUN6RCxJQUFJLFlBQVksS0FBYSxPQUFPLFVBQVUsQ0FBQyxDQUFDLENBQUM7Q0FDcEQ7QUFGRCxrREFFQztBQUVEOzs7OztHQUtHO0FBQ0gsTUFBYSxrQkFBbUIsU0FBUSwyQkFBb0I7SUFDeEQsSUFBSSxZQUFZLEtBQWEsT0FBTyxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBRTFDLEtBQUssQ0FBQyxhQUFhLENBQUMsU0FBb0IsRUFBRSxVQUE2QjtRQUNuRSxPQUFPLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ3hCLFlBQVksRUFBRSxDQUFDLENBQUMsWUFBWTtZQUM1QixPQUFPLEVBQUUsS0FBSztZQUNkLEtBQUssRUFBRSw0Q0FBNEMsU0FBUyxDQUFDLFFBQVEscUtBQXFLO1NBQzdPLENBQUMsQ0FBQyxDQUFDO0lBQ1IsQ0FBQztDQUNKO0FBVkQsZ0RBVUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEVpZ2h0IHNwZWNpYWxpemVkIGFzc2V0IGludGVycHJldGVycyBjb3ZlcmluZyB0aGUgaGlnaGVzdC12YWx1ZVxuICogYXNzZXQgdHlwZXMgcGVyIFJvbWFSb2dvdidzIHJlZmVyZW5jZSBzZXQ6XG4gKlxuICogICBJbWFnZUludGVycHJldGVyICAgICAgICDigJQgYGltYWdlYCAgICAgICAgKHRleHR1cmVzICsgc3ViLWFzc2V0IHJvdXRpbmcpXG4gKiAgIFRleHR1cmVJbnRlcnByZXRlciAgICAgIOKAlCBgdGV4dHVyZWBcbiAqICAgU3ByaXRlRnJhbWVJbnRlcnByZXRlciAg4oCUIGBzcHJpdGUtZnJhbWVgIChyZWFkLW9ubHkgLyB3cml0YWJsZSBndWFyZHMpXG4gKiAgIEZieEludGVycHJldGVyICAgICAgICAgIOKAlCBgZmJ4YFxuICogICBNYXRlcmlhbEludGVycHJldGVyICAgICDigJQgYG1hdGVyaWFsYCAgICAgKHJlYWQtb25seSB2aWEgYmFzZTsgYWR2YW5jZWQgZWRpdGluZyDihpIgZXhlY3V0ZV9qYXZhc2NyaXB0KVxuICogICBFZmZlY3RJbnRlcnByZXRlciAgICAgICDigJQgYGVmZmVjdGBcbiAqICAgUGFydGljbGVJbnRlcnByZXRlciAgICAg4oCUIGBwYXJ0aWNsZWBcbiAqICAgVW5rbm93bkludGVycHJldGVyICAgICAg4oCUIGAqYCAgICAgICAgICAgIChyZWFkLW9ubHkgZmFsbGJhY2spXG4gKlxuICogRWFjaCBpcyBhIHRoaW4gZXh0ZW5zaW9uIG9mIEJhc2VBc3NldEludGVycHJldGVyIOKAlCBtb3N0IG9ubHkgb3ZlcnJpZGVcbiAqIGBpbXBvcnRlclR5cGVgLiBUd28gbm90YWJsZSBvdmVycmlkZXM6XG4gKlxuICogICBJbWFnZUludGVycHJldGVyLnNldFByb3BlcnR5OiBpbWFnZSBtZXRhIGhhcyBib3RoIHRvcC1sZXZlbFxuICogICB1c2VyRGF0YSBmaWVsZHMgKHR5cGUgLyBmbGlwVmVydGljYWwgLyBldGMpIGFuZCBzdWItYXNzZXRcbiAqICAgdXNlckRhdGEgKHRoZSBgdGV4dHVyZWAgLyBgc3ByaXRlRnJhbWVgIHN1Yi1tZXRhcykuIFJvdXRlcyBieVxuICogICBwYXRoIHNoYXBlIHNvIEFJIGNhbiBwYXNzIGVpdGhlciBmbGF0IG9yIG5lc3RlZCBwYXRocy5cbiAqXG4gKiAgIFNwcml0ZUZyYW1lSW50ZXJwcmV0ZXIuc2V0UHJvcGVydHk6IHNwcml0ZS1mcmFtZSBtZXRhIGhhcyBtYW55XG4gKiAgIGNvbXB1dGVkIHJlYWQtb25seSBmaWVsZHMgKHdpZHRoLCBoZWlnaHQsIHJvdGF0ZWQsIGV0Yy4pOyByZWplY3RcbiAqICAgd3JpdGVzIHRvIHRoZW0gdXAtZnJvbnQgd2l0aCBhIGNsZWFyIGVycm9yIHJhdGhlciB0aGFuIHNpbGVudGx5XG4gKiAgIG5vLW9wLlxuICpcbiAqIE1hdGVyaWFsICplZGl0aW5nKiAoZWZmZWN0L3Bhc3Nlcy9wcm9wcykgZGVsaWJlcmF0ZWx5IGRlZmVycmVkIOKAlFxuICogUm9tYVJvZ292IHVzZXMgYHNjZW5lL3F1ZXJ5LW1hdGVyaWFsYCArIGBzY2VuZS9hcHBseS1tYXRlcmlhbGAgK1xuICogYW4gYXN5bmMgYXNzZXQtdXVpZCBwcmVwcm9jZXNzaW5nIGxheWVyIHRoYXQgcHVsbHMgaW4gdGhlaXJcbiAqIE1jcFNlcnZlck1hbmFnZXIuZGVjb2RlVXVpZCBwbHVtYmluZy4gRm9yIHYyLjQuMyB0aGUgbWF0ZXJpYWxcbiAqIGludGVycHJldGVyIG9ubHkgcmVhZHMgbWV0YSB1c2VyRGF0YTsgQUkgbmVlZGluZyB0byBzd2FwIGVmZmVjdHNcbiAqIG9yIHNldCBwYXNzZXMgc2hvdWxkIHVzZSBleGVjdXRlX2phdmFzY3JpcHQgd2l0aCBzY2VuZSBjb250ZXh0XG4gKiAoYWxyZWFkeSBzaGlwcGVkIGluIHYyLjMuMCkuXG4gKlxuICogUmVmZXJlbmNlOiBEOi8xX2Rldi9jb2Nvcy1tY3AtcmVmZXJlbmNlcy9Sb21hUm9nb3YtY29jb3MtbWNwL3NvdXJjZS9tY3AvdG9vbHMvYXNzZXQtaW50ZXJwcmV0ZXJzL1xuICovXG5cbmltcG9ydCB0eXBlIHsgQXNzZXRJbmZvIH0gZnJvbSAnQGNvY29zL2NyZWF0b3ItdHlwZXMvZWRpdG9yL3BhY2thZ2VzL2Fzc2V0LWRiL0B0eXBlcy9wdWJsaWMnO1xuaW1wb3J0IHsgQmFzZUFzc2V0SW50ZXJwcmV0ZXIsIGlzUGF0aFNhZmUgfSBmcm9tICcuL2Jhc2UnO1xuaW1wb3J0IHsgUHJvcGVydHlTZXRTcGVjLCBQcm9wZXJ0eVNldFJlc3VsdCB9IGZyb20gJy4vaW50ZXJmYWNlJztcblxuZXhwb3J0IGNsYXNzIEltYWdlSW50ZXJwcmV0ZXIgZXh0ZW5kcyBCYXNlQXNzZXRJbnRlcnByZXRlciB7XG4gICAgZ2V0IGltcG9ydGVyVHlwZSgpOiBzdHJpbmcgeyByZXR1cm4gJ2ltYWdlJzsgfVxuXG4gICAgLy8gVG9wLWxldmVsIGltYWdlIHByb3BlcnRpZXMgbGl2ZSBkaXJlY3RseSB1bmRlciB1c2VyRGF0YTsgc3ViLWFzc2V0XG4gICAgLy8gcHJvcGVydGllcyAodGV4dHVyZS9zcHJpdGVGcmFtZSkgbGl2ZSB1bmRlciBzdWJNZXRhc1tuYW1lXS51c2VyRGF0YS5cbiAgICBwcml2YXRlIHN0YXRpYyByZWFkb25seSBUT1BfTEVWRUxfS0VZUyA9IG5ldyBTZXQoW1xuICAgICAgICAndHlwZScsICdmbGlwVmVydGljYWwnLCAnZml4QWxwaGFUcmFuc3BhcmVuY3lBcnRpZmFjdHMnLFxuICAgICAgICAnZmxpcEdyZWVuQ2hhbm5lbCcsICdpc1JHQkUnLFxuICAgIF0pO1xuXG4gICAgcHJvdGVjdGVkIGFzeW5jIHNldFByb3BlcnR5KG1ldGE6IGFueSwgcHJvcDogUHJvcGVydHlTZXRTcGVjKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgICAgIGNvbnN0IHBhcnRzID0gcHJvcC5wcm9wZXJ0eVBhdGguc3BsaXQoJy4nKTtcblxuICAgICAgICAvLyBGbGF0IHBhdGg6IGEgdG9wLWxldmVsIGltYWdlIHByb3BlcnR5LiBIb2lzdCBpbnRvIHVzZXJEYXRhLlxuICAgICAgICBpZiAocGFydHMubGVuZ3RoID09PSAxICYmIEltYWdlSW50ZXJwcmV0ZXIuVE9QX0xFVkVMX0tFWVMuaGFzKHBhcnRzWzBdKSkge1xuICAgICAgICAgICAgaWYgKCFtZXRhLnVzZXJEYXRhKSBtZXRhLnVzZXJEYXRhID0ge307XG4gICAgICAgICAgICBtZXRhLnVzZXJEYXRhW3BhcnRzWzBdXSA9IHRoaXMuY29udmVydFByb3BlcnR5VmFsdWUocHJvcC5wcm9wZXJ0eVZhbHVlLCBwcm9wLnByb3BlcnR5VHlwZSk7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFN1Yi1hc3NldCBzaG9ydGhhbmQ6IGB0ZXh0dXJlLjxwcm9wPmAgb3IgYHNwcml0ZUZyYW1lLjxwcm9wPmAuXG4gICAgICAgIC8vIHYyLjQuNCByZXZpZXcgZml4IChnZW1pbmkgKyBjbGF1ZGUgKyBjb2RleCk6IHRoZSB2Mi40LjNcbiAgICAgICAgLy8gaW1wbGVtZW50YXRpb24gaXRlcmF0ZWQgYE9iamVjdC52YWx1ZXMobWV0YS5zdWJNZXRhcylgIGFuZFxuICAgICAgICAvLyB3cm90ZSBpbnRvIHRoZSBGSVJTVCBzdWItbWV0YSBmb3VuZCwgaWdub3Jpbmcgd2hldGhlciB0aGVcbiAgICAgICAgLy8gcGF0aCBtZW50aW9uZWQgYHRleHR1cmVgIG9yIGBzcHJpdGVGcmFtZWAuIENvY29zIGltYWdlXG4gICAgICAgIC8vIGFzc2V0cyB0eXBpY2FsbHkgaGF2ZSBCT1RILCBzbyB3cml0ZXMgc2lsZW50bHkgY29ycnVwdGVkXG4gICAgICAgIC8vIHRoZSB3cm9uZyBzdWItYXNzZXQuIE5vdyBtYXRjaCBlYWNoIHN1Yi1tZXRhIGJ5IGVpdGhlciBpdHNcbiAgICAgICAgLy8gZGVjbGFyZWQgYG5hbWVgIGZpZWxkIG9yIGJ5IHRoZSBpbXBvcnRlciBzdHJpbmcgKGltYWdlJ3NcbiAgICAgICAgLy8gc3ViLW1ldGFzIGFyZSB0aGVtc2VsdmVzIGltcG9ydGVycyBgdGV4dHVyZWAgYW5kXG4gICAgICAgIC8vIGBzcHJpdGUtZnJhbWVgKS5cbiAgICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDEgJiYgKHBhcnRzWzBdID09PSAndGV4dHVyZScgfHwgcGFydHNbMF0gPT09ICdzcHJpdGVGcmFtZScpKSB7XG4gICAgICAgICAgICBjb25zdCBzdWJBc3NldE5hbWUgPSBwYXJ0c1swXTtcbiAgICAgICAgICAgIGNvbnN0IHN1YkltcG9ydGVyVGFnID0gc3ViQXNzZXROYW1lID09PSAnc3ByaXRlRnJhbWUnID8gJ3Nwcml0ZS1mcmFtZScgOiAndGV4dHVyZSc7XG4gICAgICAgICAgICBjb25zdCBwcm9wZXJ0eU5hbWUgPSBwYXJ0cy5zbGljZSgxKS5qb2luKCcuJyk7XG5cbiAgICAgICAgICAgIC8vIFJlLXZhbGlkYXRlIHRoZSBpbm5lciBwYXRoIHRocm91Z2ggdGhlIHNhbWUgcHJvdG8tcG9sbHV0aW9uXG4gICAgICAgICAgICAvLyBndWFyZCB0aGUgYmFzZSBjbGFzcyB1c2VzIOKAlCBgdGV4dHVyZS5fX3Byb3RvX18ueGAgd291bGRcbiAgICAgICAgICAgIC8vIG90aGVyd2lzZSBieXBhc3MgdGhlIGJhc2UgdmFsaWRhdG9yIGVudGlyZWx5LlxuICAgICAgICAgICAgY29uc3QgaW5uZXIgPSBwcm9wZXJ0eU5hbWUuc3BsaXQoJy4nKTtcbiAgICAgICAgICAgIGZvciAoY29uc3Qgc2VnIG9mIGlubmVyKSB7XG4gICAgICAgICAgICAgICAgaWYgKHNlZyA9PT0gJycgfHwgc2VnID09PSAnX19wcm90b19fJyB8fCBzZWcgPT09ICdjb25zdHJ1Y3RvcicgfHwgc2VnID09PSAncHJvdG90eXBlJykge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEZvcmJpZGRlbiAvIGVtcHR5IHBhdGggc2VnbWVudCBpbiBpbWFnZSBzdWItYXNzZXQgcGF0aCAnJHtwcm9wLnByb3BlcnR5UGF0aH0nYCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoIW1ldGEuc3ViTWV0YXMpIG1ldGEuc3ViTWV0YXMgPSB7fTtcbiAgICAgICAgICAgIGxldCB0YXJnZXQ6IGFueSA9IG51bGw7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHN1YiBvZiBPYmplY3QudmFsdWVzKG1ldGEuc3ViTWV0YXMpIGFzIGFueVtdKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFzdWIgfHwgdHlwZW9mIHN1YiAhPT0gJ29iamVjdCcpIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIGNvbnN0IHN1Yk5hbWUgPSAoc3ViIGFzIGFueSkubmFtZTtcbiAgICAgICAgICAgICAgICBjb25zdCBzdWJJbXBvcnRlciA9IChzdWIgYXMgYW55KS5pbXBvcnRlcjtcbiAgICAgICAgICAgICAgICBpZiAoc3ViTmFtZSA9PT0gc3ViQXNzZXROYW1lIHx8IHN1YkltcG9ydGVyID09PSBzdWJJbXBvcnRlclRhZykge1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXQgPSBzdWI7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghdGFyZ2V0KSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgICAgICAgICAgICBgSW1hZ2UgYXNzZXQgaGFzIG5vICcke3N1YkFzc2V0TmFtZX0nIHN1Yi1tZXRhIHRvIHdyaXRlIHRvIChsb29rZWQgZm9yIG5hbWU9JyR7c3ViQXNzZXROYW1lfScgb3IgaW1wb3J0ZXI9JyR7c3ViSW1wb3J0ZXJUYWd9JylgXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghdGFyZ2V0LnVzZXJEYXRhKSB0YXJnZXQudXNlckRhdGEgPSB7fTtcbiAgICAgICAgICAgIGxldCBjdXJzb3IgPSB0YXJnZXQudXNlckRhdGE7XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGlubmVyLmxlbmd0aCAtIDE7IGkrKykge1xuICAgICAgICAgICAgICAgIGlmIChjdXJzb3JbaW5uZXJbaV1dID09PSB1bmRlZmluZWQgfHwgY3Vyc29yW2lubmVyW2ldXSA9PT0gbnVsbCkgY3Vyc29yW2lubmVyW2ldXSA9IHt9O1xuICAgICAgICAgICAgICAgIGN1cnNvciA9IGN1cnNvcltpbm5lcltpXV07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjdXJzb3JbaW5uZXJbaW5uZXIubGVuZ3RoIC0gMV1dID0gdGhpcy5jb252ZXJ0UHJvcGVydHlWYWx1ZShwcm9wLnByb3BlcnR5VmFsdWUsIHByb3AucHJvcGVydHlUeXBlKTtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHN1cGVyLnNldFByb3BlcnR5KG1ldGEsIHByb3ApO1xuICAgIH1cbn1cblxuZXhwb3J0IGNsYXNzIFRleHR1cmVJbnRlcnByZXRlciBleHRlbmRzIEJhc2VBc3NldEludGVycHJldGVyIHtcbiAgICBnZXQgaW1wb3J0ZXJUeXBlKCk6IHN0cmluZyB7IHJldHVybiAndGV4dHVyZSc7IH1cbn1cblxuZXhwb3J0IGNsYXNzIFNwcml0ZUZyYW1lSW50ZXJwcmV0ZXIgZXh0ZW5kcyBCYXNlQXNzZXRJbnRlcnByZXRlciB7XG4gICAgZ2V0IGltcG9ydGVyVHlwZSgpOiBzdHJpbmcgeyByZXR1cm4gJ3Nwcml0ZS1mcmFtZSc7IH1cblxuICAgIC8vIENvbXB1dGVkLWZyb20tc291cmNlIGZpZWxkcyB0aGUgZWRpdG9yIHJlY29tcHV0ZXMgb24gaW1wb3J0OyBBSVxuICAgIC8vIHdyaXRlcyB0byB0aGVzZSBhcmUgc2lsZW50bHkgZHJvcHBlZCBvbiBzYXZlIGFuZCB3YXN0ZSByb3VuZC10cmlwcy5cbiAgICBwcml2YXRlIHN0YXRpYyByZWFkb25seSBSRUFEX09OTFkgPSBuZXcgU2V0KFtcbiAgICAgICAgJ3dpZHRoJywgJ2hlaWdodCcsICdyYXdXaWR0aCcsICdyYXdIZWlnaHQnLFxuICAgICAgICAndHJpbVgnLCAndHJpbVknLCAnb2Zmc2V0WCcsICdvZmZzZXRZJyxcbiAgICAgICAgJ3ZlcnRpY2VzJywgJ3JvdGF0ZWQnLCAnaXNVdWlkJywgJ2ltYWdlVXVpZE9yRGF0YWJhc2VVcmknLFxuICAgIF0pO1xuXG4gICAgcHJvdGVjdGVkIGFzeW5jIHNldFByb3BlcnR5KG1ldGE6IGFueSwgcHJvcDogUHJvcGVydHlTZXRTcGVjKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgICAgIGNvbnN0IHByb3BlcnR5TmFtZSA9IHByb3AucHJvcGVydHlQYXRoLnJlcGxhY2UoL151c2VyRGF0YVxcLi8sICcnKTtcbiAgICAgICAgaWYgKFNwcml0ZUZyYW1lSW50ZXJwcmV0ZXIuUkVBRF9PTkxZLmhhcyhwcm9wZXJ0eU5hbWUpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFNwcml0ZUZyYW1lIHByb3BlcnR5ICcke3Byb3BlcnR5TmFtZX0nIGlzIHJlYWQtb25seSAoY29tcHV0ZWQgZnJvbSBzb3VyY2UgaW1hZ2UpYCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHN1cGVyLnNldFByb3BlcnR5KG1ldGEsIHByb3ApO1xuICAgIH1cbn1cblxuZXhwb3J0IGNsYXNzIEZieEludGVycHJldGVyIGV4dGVuZHMgQmFzZUFzc2V0SW50ZXJwcmV0ZXIge1xuICAgIGdldCBpbXBvcnRlclR5cGUoKTogc3RyaW5nIHsgcmV0dXJuICdmYngnOyB9XG59XG5cbmV4cG9ydCBjbGFzcyBNYXRlcmlhbEludGVycHJldGVyIGV4dGVuZHMgQmFzZUFzc2V0SW50ZXJwcmV0ZXIge1xuICAgIGdldCBpbXBvcnRlclR5cGUoKTogc3RyaW5nIHsgcmV0dXJuICdtYXRlcmlhbCc7IH1cblxuICAgIC8vIHYyLjQuMyBkZWxpYmVyYXRlbHkgZXhwb3NlcyBvbmx5IG1ldGEgdXNlckRhdGEgcmVhZHMuIGVmZmVjdCAvXG4gICAgLy8gdGVjaG5pcXVlIC8gcGFzc2VzIGVkaXRpbmcgcmVxdWlyZXMgc2NlbmUvYXBwbHktbWF0ZXJpYWwgcGx1cyBhblxuICAgIC8vIGFzc2V0LXV1aWQgcHJlcHJvY2Vzc2luZyBsYXllciAoUm9tYVJvZ292IHVzZXMgTWNwU2VydmVyTWFuYWdlci5cbiAgICAvLyBkZWNvZGVVdWlkKSB0aGF0IHdlJ2QgbmVlZCB0byBwb3J0IHdob2xlc2FsZS4gVW50aWwgdGhhdCBsYW5kc1xuICAgIC8vIGluIHYyLjUrLCBBSSBzaG91bGQgZHJpdmUgbWF0ZXJpYWwgZWRpdHMgdmlhIGV4ZWN1dGVfamF2YXNjcmlwdFxuICAgIC8vIHdpdGggY29udGV4dD0nc2NlbmUnIOKAlCB0aGF0IHBhdGggY2FuIGNhbGwgY2NlLlNjZW5lRmFjYWRlXG4gICAgLy8gZGlyZWN0bHkgYW5kIGlzIGFscmVhZHkgc2hpcHBlZCAodjIuMy4wKS5cbiAgICBhc3luYyBzZXRQcm9wZXJ0aWVzKGFzc2V0SW5mbzogQXNzZXRJbmZvLCBwcm9wZXJ0aWVzOiBQcm9wZXJ0eVNldFNwZWNbXSk6IFByb21pc2U8UHJvcGVydHlTZXRSZXN1bHRbXT4ge1xuICAgICAgICAvLyB1c2VyRGF0YSBlZGl0cyBnbyB0aHJvdWdoIHRoZSBiYXNlIHBhdGg7IGV2ZXJ5dGhpbmcgZWxzZVxuICAgICAgICAvLyBnZXRzIHJvdXRlZCB0byB0aGUgaGVscGZ1bC1lcnJvciBleHBsYW5hdGlvbi5cbiAgICAgICAgY29uc3QgdXNlckRhdGFPbmx5OiBQcm9wZXJ0eVNldFNwZWNbXSA9IFtdO1xuICAgICAgICBjb25zdCBvdGhlclJlc3VsdHM6IFByb3BlcnR5U2V0UmVzdWx0W10gPSBbXTtcbiAgICAgICAgZm9yIChjb25zdCBwIG9mIHByb3BlcnRpZXMpIHtcbiAgICAgICAgICAgIGlmIChwLnByb3BlcnR5UGF0aC5zdGFydHNXaXRoKCd1c2VyRGF0YS4nKSkge1xuICAgICAgICAgICAgICAgIHVzZXJEYXRhT25seS5wdXNoKHApO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBvdGhlclJlc3VsdHMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgIHByb3BlcnR5UGF0aDogcC5wcm9wZXJ0eVBhdGgsXG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICBlcnJvcjogYE1hdGVyaWFsSW50ZXJwcmV0ZXIgdjIuNC4zIG9ubHkgc3VwcG9ydHMgdXNlckRhdGEuKiB3cml0ZXMuIEZvciBlZmZlY3QvdGVjaG5pcXVlL3Bhc3NlcyB1c2UgZGVidWdfZXhlY3V0ZV9qYXZhc2NyaXB0IChjb250ZXh0PSdzY2VuZScpIHdpdGggY2NlLlNjZW5lRmFjYWRlLmFwcGx5TWF0ZXJpYWw7IGZ1bGwgbWF0ZXJpYWwgZWRpdGluZyBsYW5kcyBpbiB2Mi41Ky5gLFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmICh1c2VyRGF0YU9ubHkubGVuZ3RoID09PSAwKSByZXR1cm4gb3RoZXJSZXN1bHRzO1xuICAgICAgICBjb25zdCBiYXNlUmVzdWx0cyA9IGF3YWl0IHN1cGVyLnNldFByb3BlcnRpZXMoYXNzZXRJbmZvLCB1c2VyRGF0YU9ubHkpO1xuICAgICAgICByZXR1cm4gWy4uLmJhc2VSZXN1bHRzLCAuLi5vdGhlclJlc3VsdHNdO1xuICAgIH1cbn1cblxuZXhwb3J0IGNsYXNzIEVmZmVjdEludGVycHJldGVyIGV4dGVuZHMgQmFzZUFzc2V0SW50ZXJwcmV0ZXIge1xuICAgIGdldCBpbXBvcnRlclR5cGUoKTogc3RyaW5nIHsgcmV0dXJuICdlZmZlY3QnOyB9XG59XG5cbmV4cG9ydCBjbGFzcyBQYXJ0aWNsZUludGVycHJldGVyIGV4dGVuZHMgQmFzZUFzc2V0SW50ZXJwcmV0ZXIge1xuICAgIGdldCBpbXBvcnRlclR5cGUoKTogc3RyaW5nIHsgcmV0dXJuICdwYXJ0aWNsZSc7IH1cbn1cblxuLyoqXG4gKiBDYXRjaC1hbGwgZm9yIGltcG9ydGVyIHN0cmluZ3Mgd2UgZG9uJ3QgaGF2ZSBhIHNwZWNpYWxpemVkIGhhbmRsZXJcbiAqIGZvci4gUmVhZHMgd29yayB2aWEgdGhlIGJhc2UgY2xhc3MgKGJlc3QtZWZmb3J0IGR1bXAgb2YgdXNlckRhdGEgK1xuICogc3ViTWV0YXMpLCBidXQgd3JpdGVzIGFyZSByZWplY3RlZCDigJQgd2l0aG91dCBrbm93aW5nIHRoZSBpbXBvcnRlcidzXG4gKiBtZXRhIGxheW91dCwgYmxpbmRseSB3cml0aW5nIHJpc2tzIGNvcnJ1cHRpbmcgdGhlIGFzc2V0LlxuICovXG5leHBvcnQgY2xhc3MgVW5rbm93bkludGVycHJldGVyIGV4dGVuZHMgQmFzZUFzc2V0SW50ZXJwcmV0ZXIge1xuICAgIGdldCBpbXBvcnRlclR5cGUoKTogc3RyaW5nIHsgcmV0dXJuICcqJzsgfVxuXG4gICAgYXN5bmMgc2V0UHJvcGVydGllcyhhc3NldEluZm86IEFzc2V0SW5mbywgcHJvcGVydGllczogUHJvcGVydHlTZXRTcGVjW10pOiBQcm9taXNlPFByb3BlcnR5U2V0UmVzdWx0W10+IHtcbiAgICAgICAgcmV0dXJuIHByb3BlcnRpZXMubWFwKHAgPT4gKHtcbiAgICAgICAgICAgIHByb3BlcnR5UGF0aDogcC5wcm9wZXJ0eVBhdGgsXG4gICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgIGVycm9yOiBgTm8gc3BlY2lhbGl6ZWQgaW50ZXJwcmV0ZXIgZm9yIGltcG9ydGVyICcke2Fzc2V0SW5mby5pbXBvcnRlcn0nLiBBc3NldCB3cml0ZXMgYXJlIHJlamVjdGVkIHRvIGF2b2lkIGNvcnJ1cHRpbmcgYW4gdW5rbm93biBtZXRhIHNoYXBlOyByZWFkcyB2aWEgYXNzZXRfZ2V0X3Byb3BlcnRpZXMgc3RpbGwgd29yay4gRmlsZSBhIHJlcXVlc3QgdG8gYWRkIGEgc3BlY2lhbGl6ZWQgaW50ZXJwcmV0ZXIuYCxcbiAgICAgICAgfSkpO1xuICAgIH1cbn1cbiJdfQ==