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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3BlY2lhbGl6ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvYXNzZXQtaW50ZXJwcmV0ZXJzL3NwZWNpYWxpemVkLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FtQ0c7OztBQUdILGlDQUE4QztBQUc5Qyw0REFBNEQ7QUFDNUQsK0RBQStEO0FBQy9ELDhEQUE4RDtBQUM5RCxzQ0FBc0M7QUFDdEMsTUFBTSx3QkFBd0IsR0FBRyxJQUFJLEdBQUcsQ0FBQyxDQUFDLFdBQVcsRUFBRSxhQUFhLEVBQUUsV0FBVyxDQUFDLENBQUMsQ0FBQztBQUVwRixNQUFhLGdCQUFpQixTQUFRLDJCQUFvQjtJQUN0RCxJQUFJLFlBQVksS0FBYSxPQUFPLE9BQU8sQ0FBQyxDQUFDLENBQUM7SUFTcEMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxJQUFTLEVBQUUsSUFBcUI7UUFDeEQsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7UUFFM0MsOERBQThEO1FBQzlELElBQUksS0FBSyxDQUFDLE1BQU0sS0FBSyxDQUFDLElBQUksZ0JBQWdCLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQ3RFLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUTtnQkFBRSxJQUFJLENBQUMsUUFBUSxHQUFHLEVBQUUsQ0FBQztZQUN2QyxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUMzRixPQUFPLElBQUksQ0FBQztRQUNoQixDQUFDO1FBRUQsaUVBQWlFO1FBQ2pFLDBEQUEwRDtRQUMxRCw2REFBNkQ7UUFD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LFlBQVksQ0FBQyxNQUFNLEtBQUssQ0FBQztZQUFFLE9BQU8sWUFBWSxDQUFDO1FBQ25ELE1BQU0sV0FBVyxHQUFHLE1BQU0sS0FBSyxDQUFDLGFBQWEsQ0FBQyxTQUFTLEVBQUUsWUFBWSxDQUFDLENBQUM7UUFDdkUsT0FBTyxDQUFDLEdBQUcsV0FBVyxFQUFFLEdBQUcsWUFBWSxDQUFDLENBQUM7SUFDN0MsQ0FBQztDQUNKO0FBOUJELGtEQThCQztBQUVELE1BQWEsaUJBQWtCLFNBQVEsMkJBQW9CO0lBQ3ZELElBQUksWUFBWSxLQUFhLE9BQU8sUUFBUSxDQUFDLENBQUMsQ0FBQztDQUNsRDtBQUZELDhDQUVDO0FBRUQsTUFBYSxtQkFBb0IsU0FBUSwyQkFBb0I7SUFDekQsSUFBSSxZQUFZLEtBQWEsT0FBTyxVQUFVLENBQUMsQ0FBQyxDQUFDO0NBQ3BEO0FBRkQsa0RBRUM7QUFFRDs7Ozs7R0FLRztBQUNILE1BQWEsa0JBQW1CLFNBQVEsMkJBQW9CO0lBQ3hELElBQUksWUFBWSxLQUFhLE9BQU8sR0FBRyxDQUFDLENBQUMsQ0FBQztJQUUxQyxLQUFLLENBQUMsYUFBYSxDQUFDLFNBQW9CLEVBQUUsVUFBNkI7UUFDbkUsT0FBTyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUN4QixZQUFZLEVBQUUsQ0FBQyxDQUFDLFlBQVk7WUFDNUIsT0FBTyxFQUFFLEtBQUs7WUFDZCxLQUFLLEVBQUUsNENBQTRDLFNBQVMsQ0FBQyxRQUFRLHlLQUF5SztTQUNqUCxDQUFDLENBQUMsQ0FBQztJQUNSLENBQUM7Q0FDSjtBQVZELGdEQVVDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBFaWdodCBzcGVjaWFsaXplZCBhc3NldCBpbnRlcnByZXRlcnMgY292ZXJpbmcgdGhlIGhpZ2hlc3QtdmFsdWVcbiAqIGFzc2V0IHR5cGVzIHBlciBSb21hUm9nb3YncyByZWZlcmVuY2Ugc2V0OlxuICpcbiAqICAgSW1hZ2VJbnRlcnByZXRlciAgICAgICAg4oCUIGBpbWFnZWAgICAgICAgICh0ZXh0dXJlcyArIHN1Yi1hc3NldCByb3V0aW5nKVxuICogICBUZXh0dXJlSW50ZXJwcmV0ZXIgICAgICDigJQgYHRleHR1cmVgXG4gKiAgIFNwcml0ZUZyYW1lSW50ZXJwcmV0ZXIgIOKAlCBgc3ByaXRlLWZyYW1lYCAocmVhZC1vbmx5IC8gd3JpdGFibGUgZ3VhcmRzKVxuICogICBGYnhJbnRlcnByZXRlciAgICAgICAgICDigJQgYGZieGBcbiAqICAgTWF0ZXJpYWxJbnRlcnByZXRlciAgICAg4oCUIGBtYXRlcmlhbGAgICAgIChyZWFkLW9ubHkgdmlhIGJhc2U7IGFkdmFuY2VkIGVkaXRpbmcg4oaSIGV4ZWN1dGVfamF2YXNjcmlwdClcbiAqICAgRWZmZWN0SW50ZXJwcmV0ZXIgICAgICAg4oCUIGBlZmZlY3RgXG4gKiAgIFBhcnRpY2xlSW50ZXJwcmV0ZXIgICAgIOKAlCBgcGFydGljbGVgXG4gKiAgIFVua25vd25JbnRlcnByZXRlciAgICAgIOKAlCBgKmAgICAgICAgICAgICAocmVhZC1vbmx5IGZhbGxiYWNrKVxuICpcbiAqIEVhY2ggaXMgYSB0aGluIGV4dGVuc2lvbiBvZiBCYXNlQXNzZXRJbnRlcnByZXRlciDigJQgbW9zdCBvbmx5IG92ZXJyaWRlXG4gKiBgaW1wb3J0ZXJUeXBlYC4gVHdvIG5vdGFibGUgb3ZlcnJpZGVzOlxuICpcbiAqICAgSW1hZ2VJbnRlcnByZXRlci5zZXRQcm9wZXJ0eTogaW1hZ2UgbWV0YSBoYXMgYm90aCB0b3AtbGV2ZWxcbiAqICAgdXNlckRhdGEgZmllbGRzICh0eXBlIC8gZmxpcFZlcnRpY2FsIC8gZXRjKSBhbmQgc3ViLWFzc2V0XG4gKiAgIHVzZXJEYXRhICh0aGUgYHRleHR1cmVgIC8gYHNwcml0ZUZyYW1lYCBzdWItbWV0YXMpLiBSb3V0ZXMgYnlcbiAqICAgcGF0aCBzaGFwZSBzbyBBSSBjYW4gcGFzcyBlaXRoZXIgZmxhdCBvciBuZXN0ZWQgcGF0aHMuXG4gKlxuICogICBTcHJpdGVGcmFtZUludGVycHJldGVyLnNldFByb3BlcnR5OiBzcHJpdGUtZnJhbWUgbWV0YSBoYXMgbWFueVxuICogICBjb21wdXRlZCByZWFkLW9ubHkgZmllbGRzICh3aWR0aCwgaGVpZ2h0LCByb3RhdGVkLCBldGMuKTsgcmVqZWN0XG4gKiAgIHdyaXRlcyB0byB0aGVtIHVwLWZyb250IHdpdGggYSBjbGVhciBlcnJvciByYXRoZXIgdGhhbiBzaWxlbnRseVxuICogICBuby1vcC5cbiAqXG4gKiBNYXRlcmlhbCAqZWRpdGluZyogKGVmZmVjdC9wYXNzZXMvcHJvcHMpIGRlbGliZXJhdGVseSBkZWZlcnJlZCDigJRcbiAqIFJvbWFSb2dvdiB1c2VzIGBzY2VuZS9xdWVyeS1tYXRlcmlhbGAgKyBgc2NlbmUvYXBwbHktbWF0ZXJpYWxgICtcbiAqIGFuIGFzeW5jIGFzc2V0LXV1aWQgcHJlcHJvY2Vzc2luZyBsYXllciB0aGF0IHB1bGxzIGluIHRoZWlyXG4gKiBNY3BTZXJ2ZXJNYW5hZ2VyLmRlY29kZVV1aWQgcGx1bWJpbmcuIEZvciB2Mi40LjMgdGhlIG1hdGVyaWFsXG4gKiBpbnRlcnByZXRlciBvbmx5IHJlYWRzIG1ldGEgdXNlckRhdGE7IEFJIG5lZWRpbmcgdG8gc3dhcCBlZmZlY3RzXG4gKiBvciBzZXQgcGFzc2VzIHNob3VsZCB1c2UgZXhlY3V0ZV9qYXZhc2NyaXB0IHdpdGggc2NlbmUgY29udGV4dFxuICogKGFscmVhZHkgc2hpcHBlZCBpbiB2Mi4zLjApLlxuICpcbiAqIFJlZmVyZW5jZTogRDovMV9kZXYvY29jb3MtbWNwLXJlZmVyZW5jZXMvUm9tYVJvZ292LWNvY29zLW1jcC9zb3VyY2UvbWNwL3Rvb2xzL2Fzc2V0LWludGVycHJldGVycy9cbiAqL1xuXG5pbXBvcnQgdHlwZSB7IEFzc2V0SW5mbyB9IGZyb20gJ0Bjb2Nvcy9jcmVhdG9yLXR5cGVzL2VkaXRvci9wYWNrYWdlcy9hc3NldC1kYi9AdHlwZXMvcHVibGljJztcbmltcG9ydCB7IEJhc2VBc3NldEludGVycHJldGVyIH0gZnJvbSAnLi9iYXNlJztcbmltcG9ydCB7IFByb3BlcnR5U2V0U3BlYywgUHJvcGVydHlTZXRSZXN1bHQgfSBmcm9tICcuL2ludGVyZmFjZSc7XG5cbi8vIHYyLjQuNSByZXZpZXcgZml4IChjbGF1ZGUpOiBpbmxpbmUgZ3VhcmQgc2V0IHNvIHRoZSBpbm5lclxuLy8gSW1hZ2VJbnRlcnByZXRlciB3YWxrIGRvZXNuJ3QgaGF2ZSB0byBjYWxsIGlzUGF0aFNhZmUgd2l0aCBhXG4vLyBmYWtlLXJvb3QganVzdCB0byByZXVzZSB0aGUgaGVscGVyLiBTYW1lIGZvcmJpZGRlbiBzZWdtZW50c1xuLy8gYXMgYmFzZS50cyBGT1JCSURERU5fUEFUSF9TRUdNRU5UUy5cbmNvbnN0IEZPUkJJRERFTl9JTk5FUl9TRUdNRU5UUyA9IG5ldyBTZXQoWydfX3Byb3RvX18nLCAnY29uc3RydWN0b3InLCAncHJvdG90eXBlJ10pO1xuXG5leHBvcnQgY2xhc3MgSW1hZ2VJbnRlcnByZXRlciBleHRlbmRzIEJhc2VBc3NldEludGVycHJldGVyIHtcbiAgICBnZXQgaW1wb3J0ZXJUeXBlKCk6IHN0cmluZyB7IHJldHVybiAnaW1hZ2UnOyB9XG5cbiAgICAvLyBUb3AtbGV2ZWwgaW1hZ2UgcHJvcGVydGllcyBsaXZlIGRpcmVjdGx5IHVuZGVyIHVzZXJEYXRhOyBzdWItYXNzZXRcbiAgICAvLyBwcm9wZXJ0aWVzICh0ZXh0dXJlL3Nwcml0ZUZyYW1lKSBsaXZlIHVuZGVyIHN1Yk1ldGFzW25hbWVdLnVzZXJEYXRhLlxuICAgIHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFRPUF9MRVZFTF9LRVlTID0gbmV3IFNldChbXG4gICAgICAgICd0eXBlJywgJ2ZsaXBWZXJ0aWNhbCcsICdmaXhBbHBoYVRyYW5zcGFyZW5jeUFydGlmYWN0cycsXG4gICAgICAgICdmbGlwR3JlZW5DaGFubmVsJywgJ2lzUkdCRScsXG4gICAgXSk7XG5cbiAgICBwcm90ZWN0ZWQgYXN5bmMgc2V0UHJvcGVydHkobWV0YTogYW55LCBwcm9wOiBQcm9wZXJ0eVNldFNwZWMpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICAgICAgY29uc3QgcGFydHMgPSBwcm9wLnByb3BlcnR5UGF0aC5zcGxpdCgnLicpO1xuXG4gICAgICAgIC8vIEZsYXQgcGF0aDogYSB0b3AtbGV2ZWwgaW1hZ2UgcHJvcGVydHkuIEhvaXN0IGludG8gdXNlckRhdGEuXG4gICAgICAgIGlmIChwYXJ0cy5sZW5ndGggPT09IDEgJiYgSW1hZ2VJbnRlcnByZXRlci5UT1BfTEVWRUxfS0VZUy5oYXMocGFydHNbMF0pKSB7XG4gICAgICAgICAgICBpZiAoIW1ldGEudXNlckRhdGEpIG1ldGEudXNlckRhdGEgPSB7fTtcbiAgICAgICAgICAgIG1ldGEudXNlckRhdGFbcGFydHNbMF1dID0gdGhpcy5jb252ZXJ0UHJvcGVydHlWYWx1ZShwcm9wLnByb3BlcnR5VmFsdWUsIHByb3AucHJvcGVydHlUeXBlKTtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gU3ViLWFzc2V0IHNob3J0aGFuZDogYHRleHR1cmUuPHByb3A+YCBvciBgc3ByaXRlRnJhbWUuPHByb3A+YC5cbiAgICAgICAgLy8gdjIuNC40IHJldmlldyBmaXggKGdlbWluaSArIGNsYXVkZSArIGNvZGV4KTogdGhlIHYyLjQuM1xuICAgICAgICAvLyBpbXBsZW1lbnRhdGlvbiBpdGVyYXRlZCBgT2JqZWN0LnZhbHVlcyhtZXRhLnN1Yk1ldGFzKWAgYW5kXG4gICAgICAgIC8vIHdyb3RlIGludG8gdGhlIEZJUlNUIHN1Yi1tZXRhIGZvdW5kLCBpZ25vcmluZyB3aGV0aGVyIHRoZVxuICAgICAgICAvLyBwYXRoIG1lbnRpb25lZCBgdGV4dHVyZWAgb3IgYHNwcml0ZUZyYW1lYC4gQ29jb3MgaW1hZ2VcbiAgICAgICAgLy8gYXNzZXRzIHR5cGljYWxseSBoYXZlIEJPVEgsIHNvIHdyaXRlcyBzaWxlbnRseSBjb3JydXB0ZWRcbiAgICAgICAgLy8gdGhlIHdyb25nIHN1Yi1hc3NldC4gTm93IG1hdGNoIGVhY2ggc3ViLW1ldGEgYnkgZWl0aGVyIGl0c1xuICAgICAgICAvLyBkZWNsYXJlZCBgbmFtZWAgZmllbGQgb3IgYnkgdGhlIGltcG9ydGVyIHN0cmluZyAoaW1hZ2Unc1xuICAgICAgICAvLyBzdWItbWV0YXMgYXJlIHRoZW1zZWx2ZXMgaW1wb3J0ZXJzIGB0ZXh0dXJlYCBhbmRcbiAgICAgICAgLy8gYHNwcml0ZS1mcmFtZWApLlxuICAgICAgICBpZiAocGFydHMubGVuZ3RoID4gMSAmJiAocGFydHNbMF0gPT09ICd0ZXh0dXJlJyB8fCBwYXJ0c1swXSA9PT0gJ3Nwcml0ZUZyYW1lJykpIHtcbiAgICAgICAgICAgIGNvbnN0IHN1YkFzc2V0TmFtZSA9IHBhcnRzWzBdO1xuICAgICAgICAgICAgY29uc3Qgc3ViSW1wb3J0ZXJUYWcgPSBzdWJBc3NldE5hbWUgPT09ICdzcHJpdGVGcmFtZScgPyAnc3ByaXRlLWZyYW1lJyA6ICd0ZXh0dXJlJztcbiAgICAgICAgICAgIGNvbnN0IHByb3BlcnR5TmFtZSA9IHBhcnRzLnNsaWNlKDEpLmpvaW4oJy4nKTtcblxuICAgICAgICAgICAgLy8gUmUtdmFsaWRhdGUgdGhlIGlubmVyIHBhdGggdGhyb3VnaCB0aGUgcHJvdG8tcG9sbHV0aW9uXG4gICAgICAgICAgICAvLyBndWFyZC4gYHRleHR1cmUuX19wcm90b19fLnhgIHdvdWxkIG90aGVyd2lzZSBieXBhc3MgdGhlXG4gICAgICAgICAgICAvLyBiYXNlIHZhbGlkYXRvciBlbnRpcmVseS5cbiAgICAgICAgICAgIGNvbnN0IGlubmVyID0gcHJvcGVydHlOYW1lLnNwbGl0KCcuJyk7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHNlZyBvZiBpbm5lcikge1xuICAgICAgICAgICAgICAgIGlmIChzZWcgPT09ICcnIHx8IEZPUkJJRERFTl9JTk5FUl9TRUdNRU5UUy5oYXMoc2VnKSkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEZvcmJpZGRlbiAvIGVtcHR5IHBhdGggc2VnbWVudCBpbiBpbWFnZSBzdWItYXNzZXQgcGF0aCAnJHtwcm9wLnByb3BlcnR5UGF0aH0nYCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoIW1ldGEuc3ViTWV0YXMpIG1ldGEuc3ViTWV0YXMgPSB7fTtcbiAgICAgICAgICAgIC8vIHYyLjQuNSByZXZpZXcgZml4IChjb2RleCk6IG1hdGNoIGJ5IHN1Yi1tZXRhIGtleSBhcyB3ZWxsLFxuICAgICAgICAgICAgLy8gbm90IG9ubHkgYnkgbmFtZSAvIGltcG9ydGVyIGZpZWxkcy4gSW1hZ2Ugc3ViLW1ldGFzIGFyZVxuICAgICAgICAgICAgLy8gY29tbW9ubHkga2V5ZWQgYnkgbGl0ZXJhbCBuYW1lIGluIHRoZSBtZXRhIEpTT04sIHNvIGFcbiAgICAgICAgICAgIC8vIGtleSA9PT0gJ3RleHR1cmUnIC8gJ3Nwcml0ZUZyYW1lJyBsb29rdXAgaXMgdGhlIG1vc3RcbiAgICAgICAgICAgIC8vIGRpcmVjdCBtYXRjaC4gRmFsbHMgYmFjayB0byBuYW1lIC8gaW1wb3J0ZXIgZm9yIGNhc2VzXG4gICAgICAgICAgICAvLyB3aGVyZSB0aGUga2V5IGlzIGEgVVVJRC5cbiAgICAgICAgICAgIGxldCB0YXJnZXQ6IGFueSA9IG51bGw7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IFtrZXksIHN1Yl0gb2YgT2JqZWN0LmVudHJpZXMobWV0YS5zdWJNZXRhcykgYXMgW3N0cmluZywgYW55XVtdKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFzdWIgfHwgdHlwZW9mIHN1YiAhPT0gJ29iamVjdCcpIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIGNvbnN0IHN1Yk5hbWUgPSAoc3ViIGFzIGFueSkubmFtZTtcbiAgICAgICAgICAgICAgICBjb25zdCBzdWJJbXBvcnRlciA9IChzdWIgYXMgYW55KS5pbXBvcnRlcjtcbiAgICAgICAgICAgICAgICBpZiAoa2V5ID09PSBzdWJBc3NldE5hbWUgfHwgc3ViTmFtZSA9PT0gc3ViQXNzZXROYW1lIHx8IHN1YkltcG9ydGVyID09PSBzdWJJbXBvcnRlclRhZykge1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXQgPSBzdWI7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghdGFyZ2V0KSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgICAgICAgICAgICBgSW1hZ2UgYXNzZXQgaGFzIG5vICcke3N1YkFzc2V0TmFtZX0nIHN1Yi1tZXRhIHRvIHdyaXRlIHRvIChsb29rZWQgZm9yIGtleT0nJHtzdWJBc3NldE5hbWV9JywgbmFtZT0nJHtzdWJBc3NldE5hbWV9Jywgb3IgaW1wb3J0ZXI9JyR7c3ViSW1wb3J0ZXJUYWd9JylgXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghdGFyZ2V0LnVzZXJEYXRhKSB0YXJnZXQudXNlckRhdGEgPSB7fTtcbiAgICAgICAgICAgIGxldCBjdXJzb3IgPSB0YXJnZXQudXNlckRhdGE7XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGlubmVyLmxlbmd0aCAtIDE7IGkrKykge1xuICAgICAgICAgICAgICAgIGlmIChjdXJzb3JbaW5uZXJbaV1dID09PSB1bmRlZmluZWQgfHwgY3Vyc29yW2lubmVyW2ldXSA9PT0gbnVsbCkgY3Vyc29yW2lubmVyW2ldXSA9IHt9O1xuICAgICAgICAgICAgICAgIGN1cnNvciA9IGN1cnNvcltpbm5lcltpXV07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjdXJzb3JbaW5uZXJbaW5uZXIubGVuZ3RoIC0gMV1dID0gdGhpcy5jb252ZXJ0UHJvcGVydHlWYWx1ZShwcm9wLnByb3BlcnR5VmFsdWUsIHByb3AucHJvcGVydHlUeXBlKTtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHN1cGVyLnNldFByb3BlcnR5KG1ldGEsIHByb3ApO1xuICAgIH1cbn1cblxuZXhwb3J0IGNsYXNzIFRleHR1cmVJbnRlcnByZXRlciBleHRlbmRzIEJhc2VBc3NldEludGVycHJldGVyIHtcbiAgICBnZXQgaW1wb3J0ZXJUeXBlKCk6IHN0cmluZyB7IHJldHVybiAndGV4dHVyZSc7IH1cbn1cblxuZXhwb3J0IGNsYXNzIFNwcml0ZUZyYW1lSW50ZXJwcmV0ZXIgZXh0ZW5kcyBCYXNlQXNzZXRJbnRlcnByZXRlciB7XG4gICAgZ2V0IGltcG9ydGVyVHlwZSgpOiBzdHJpbmcgeyByZXR1cm4gJ3Nwcml0ZS1mcmFtZSc7IH1cblxuICAgIC8vIENvbXB1dGVkLWZyb20tc291cmNlIGZpZWxkcyB0aGUgZWRpdG9yIHJlY29tcHV0ZXMgb24gaW1wb3J0OyBBSVxuICAgIC8vIHdyaXRlcyB0byB0aGVzZSBhcmUgc2lsZW50bHkgZHJvcHBlZCBvbiBzYXZlIGFuZCB3YXN0ZSByb3VuZC10cmlwcy5cbiAgICBwcml2YXRlIHN0YXRpYyByZWFkb25seSBSRUFEX09OTFkgPSBuZXcgU2V0KFtcbiAgICAgICAgJ3dpZHRoJywgJ2hlaWdodCcsICdyYXdXaWR0aCcsICdyYXdIZWlnaHQnLFxuICAgICAgICAndHJpbVgnLCAndHJpbVknLCAnb2Zmc2V0WCcsICdvZmZzZXRZJyxcbiAgICAgICAgJ3ZlcnRpY2VzJywgJ3JvdGF0ZWQnLCAnaXNVdWlkJywgJ2ltYWdlVXVpZE9yRGF0YWJhc2VVcmknLFxuICAgIF0pO1xuXG4gICAgcHJvdGVjdGVkIGFzeW5jIHNldFByb3BlcnR5KG1ldGE6IGFueSwgcHJvcDogUHJvcGVydHlTZXRTcGVjKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgICAgIGNvbnN0IHByb3BlcnR5TmFtZSA9IHByb3AucHJvcGVydHlQYXRoLnJlcGxhY2UoL151c2VyRGF0YVxcLi8sICcnKTtcbiAgICAgICAgaWYgKFNwcml0ZUZyYW1lSW50ZXJwcmV0ZXIuUkVBRF9PTkxZLmhhcyhwcm9wZXJ0eU5hbWUpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFNwcml0ZUZyYW1lIHByb3BlcnR5ICcke3Byb3BlcnR5TmFtZX0nIGlzIHJlYWQtb25seSAoY29tcHV0ZWQgZnJvbSBzb3VyY2UgaW1hZ2UpYCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHN1cGVyLnNldFByb3BlcnR5KG1ldGEsIHByb3ApO1xuICAgIH1cbn1cblxuZXhwb3J0IGNsYXNzIEZieEludGVycHJldGVyIGV4dGVuZHMgQmFzZUFzc2V0SW50ZXJwcmV0ZXIge1xuICAgIGdldCBpbXBvcnRlclR5cGUoKTogc3RyaW5nIHsgcmV0dXJuICdmYngnOyB9XG59XG5cbmV4cG9ydCBjbGFzcyBNYXRlcmlhbEludGVycHJldGVyIGV4dGVuZHMgQmFzZUFzc2V0SW50ZXJwcmV0ZXIge1xuICAgIGdldCBpbXBvcnRlclR5cGUoKTogc3RyaW5nIHsgcmV0dXJuICdtYXRlcmlhbCc7IH1cblxuICAgIC8vIHYyLjQuMyBkZWxpYmVyYXRlbHkgZXhwb3NlcyBvbmx5IG1ldGEgdXNlckRhdGEgcmVhZHMuIGVmZmVjdCAvXG4gICAgLy8gdGVjaG5pcXVlIC8gcGFzc2VzIGVkaXRpbmcgcmVxdWlyZXMgc2NlbmUvYXBwbHktbWF0ZXJpYWwgcGx1cyBhblxuICAgIC8vIGFzc2V0LXV1aWQgcHJlcHJvY2Vzc2luZyBsYXllciAoUm9tYVJvZ292IHVzZXMgTWNwU2VydmVyTWFuYWdlci5cbiAgICAvLyBkZWNvZGVVdWlkKSB0aGF0IHdlJ2QgbmVlZCB0byBwb3J0IHdob2xlc2FsZS4gVW50aWwgdGhhdCBsYW5kc1xuICAgIC8vIGluIHYyLjUrLCBBSSBzaG91bGQgZHJpdmUgbWF0ZXJpYWwgZWRpdHMgdmlhIGV4ZWN1dGVfamF2YXNjcmlwdFxuICAgIC8vIHdpdGggY29udGV4dD0nc2NlbmUnIOKAlCB0aGF0IHBhdGggY2FuIGNhbGwgY2NlLlNjZW5lRmFjYWRlXG4gICAgLy8gZGlyZWN0bHkgYW5kIGlzIGFscmVhZHkgc2hpcHBlZCAodjIuMy4wKS5cbiAgICBhc3luYyBzZXRQcm9wZXJ0aWVzKGFzc2V0SW5mbzogQXNzZXRJbmZvLCBwcm9wZXJ0aWVzOiBQcm9wZXJ0eVNldFNwZWNbXSk6IFByb21pc2U8UHJvcGVydHlTZXRSZXN1bHRbXT4ge1xuICAgICAgICAvLyB1c2VyRGF0YSBlZGl0cyBnbyB0aHJvdWdoIHRoZSBiYXNlIHBhdGg7IGV2ZXJ5dGhpbmcgZWxzZVxuICAgICAgICAvLyBnZXRzIHJvdXRlZCB0byB0aGUgaGVscGZ1bC1lcnJvciBleHBsYW5hdGlvbi5cbiAgICAgICAgY29uc3QgdXNlckRhdGFPbmx5OiBQcm9wZXJ0eVNldFNwZWNbXSA9IFtdO1xuICAgICAgICBjb25zdCBvdGhlclJlc3VsdHM6IFByb3BlcnR5U2V0UmVzdWx0W10gPSBbXTtcbiAgICAgICAgZm9yIChjb25zdCBwIG9mIHByb3BlcnRpZXMpIHtcbiAgICAgICAgICAgIGlmIChwLnByb3BlcnR5UGF0aC5zdGFydHNXaXRoKCd1c2VyRGF0YS4nKSkge1xuICAgICAgICAgICAgICAgIHVzZXJEYXRhT25seS5wdXNoKHApO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBvdGhlclJlc3VsdHMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgIHByb3BlcnR5UGF0aDogcC5wcm9wZXJ0eVBhdGgsXG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICBlcnJvcjogYE1hdGVyaWFsSW50ZXJwcmV0ZXIgdjIuNC4zIG9ubHkgc3VwcG9ydHMgdXNlckRhdGEuKiB3cml0ZXMuIEZvciBlZmZlY3QvdGVjaG5pcXVlL3Bhc3NlcyB1c2UgZGVidWdfZXhlY3V0ZV9qYXZhc2NyaXB0IChjb250ZXh0PSdzY2VuZScpIHdpdGggY2NlLlNjZW5lRmFjYWRlLmFwcGx5TWF0ZXJpYWw7IGZ1bGwgbWF0ZXJpYWwgZWRpdGluZyBsYW5kcyBpbiB2Mi41Ky5gLFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmICh1c2VyRGF0YU9ubHkubGVuZ3RoID09PSAwKSByZXR1cm4gb3RoZXJSZXN1bHRzO1xuICAgICAgICBjb25zdCBiYXNlUmVzdWx0cyA9IGF3YWl0IHN1cGVyLnNldFByb3BlcnRpZXMoYXNzZXRJbmZvLCB1c2VyRGF0YU9ubHkpO1xuICAgICAgICByZXR1cm4gWy4uLmJhc2VSZXN1bHRzLCAuLi5vdGhlclJlc3VsdHNdO1xuICAgIH1cbn1cblxuZXhwb3J0IGNsYXNzIEVmZmVjdEludGVycHJldGVyIGV4dGVuZHMgQmFzZUFzc2V0SW50ZXJwcmV0ZXIge1xuICAgIGdldCBpbXBvcnRlclR5cGUoKTogc3RyaW5nIHsgcmV0dXJuICdlZmZlY3QnOyB9XG59XG5cbmV4cG9ydCBjbGFzcyBQYXJ0aWNsZUludGVycHJldGVyIGV4dGVuZHMgQmFzZUFzc2V0SW50ZXJwcmV0ZXIge1xuICAgIGdldCBpbXBvcnRlclR5cGUoKTogc3RyaW5nIHsgcmV0dXJuICdwYXJ0aWNsZSc7IH1cbn1cblxuLyoqXG4gKiBDYXRjaC1hbGwgZm9yIGltcG9ydGVyIHN0cmluZ3Mgd2UgZG9uJ3QgaGF2ZSBhIHNwZWNpYWxpemVkIGhhbmRsZXJcbiAqIGZvci4gUmVhZHMgd29yayB2aWEgdGhlIGJhc2UgY2xhc3MgKGJlc3QtZWZmb3J0IGR1bXAgb2YgdXNlckRhdGEgK1xuICogc3ViTWV0YXMpLCBidXQgd3JpdGVzIGFyZSByZWplY3RlZCDigJQgd2l0aG91dCBrbm93aW5nIHRoZSBpbXBvcnRlcidzXG4gKiBtZXRhIGxheW91dCwgYmxpbmRseSB3cml0aW5nIHJpc2tzIGNvcnJ1cHRpbmcgdGhlIGFzc2V0LlxuICovXG5leHBvcnQgY2xhc3MgVW5rbm93bkludGVycHJldGVyIGV4dGVuZHMgQmFzZUFzc2V0SW50ZXJwcmV0ZXIge1xuICAgIGdldCBpbXBvcnRlclR5cGUoKTogc3RyaW5nIHsgcmV0dXJuICcqJzsgfVxuXG4gICAgYXN5bmMgc2V0UHJvcGVydGllcyhhc3NldEluZm86IEFzc2V0SW5mbywgcHJvcGVydGllczogUHJvcGVydHlTZXRTcGVjW10pOiBQcm9taXNlPFByb3BlcnR5U2V0UmVzdWx0W10+IHtcbiAgICAgICAgcmV0dXJuIHByb3BlcnRpZXMubWFwKHAgPT4gKHtcbiAgICAgICAgICAgIHByb3BlcnR5UGF0aDogcC5wcm9wZXJ0eVBhdGgsXG4gICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgIGVycm9yOiBgTm8gc3BlY2lhbGl6ZWQgaW50ZXJwcmV0ZXIgZm9yIGltcG9ydGVyICcke2Fzc2V0SW5mby5pbXBvcnRlcn0nLiBBc3NldCB3cml0ZXMgYXJlIHJlamVjdGVkIHRvIGF2b2lkIGNvcnJ1cHRpbmcgYW4gdW5rbm93biBtZXRhIHNoYXBlOyByZWFkcyB2aWEgYXNzZXRNZXRhX2dldF9wcm9wZXJ0aWVzIHN0aWxsIHdvcmsuIEZpbGUgYSByZXF1ZXN0IHRvIGFkZCBhIHNwZWNpYWxpemVkIGludGVycHJldGVyLmAsXG4gICAgICAgIH0pKTtcbiAgICB9XG59XG4iXX0=