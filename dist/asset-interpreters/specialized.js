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
        // Find the matching sub-meta by name and write into its userData.
        if (parts.length > 1 && (parts[0] === 'texture' || parts[0] === 'spriteFrame')) {
            const subAssetName = parts[0];
            const propertyName = parts.slice(1).join('.');
            if (!meta.subMetas)
                meta.subMetas = {};
            for (const subMeta of Object.values(meta.subMetas)) {
                if (!subMeta || typeof subMeta !== 'object')
                    continue;
                // RomaRogov treats either uuid match or the literal name
                // as a hit; we keep the literal-name behaviour since
                // image sub-metas are conventionally keyed by name.
                if (!subMeta.userData)
                    subMeta.userData = {};
                const inner = propertyName.split('.');
                let cursor = subMeta.userData;
                for (let i = 0; i < inner.length - 1; i++) {
                    if (cursor[inner[i]] === undefined || cursor[inner[i]] === null)
                        cursor[inner[i]] = {};
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3BlY2lhbGl6ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvYXNzZXQtaW50ZXJwcmV0ZXJzL3NwZWNpYWxpemVkLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FtQ0c7OztBQUdILGlDQUE4QztBQUc5QyxNQUFhLGdCQUFpQixTQUFRLDJCQUFvQjtJQUN0RCxJQUFJLFlBQVksS0FBYSxPQUFPLE9BQU8sQ0FBQyxDQUFDLENBQUM7SUFTcEMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxJQUFTLEVBQUUsSUFBcUI7UUFDeEQsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7UUFFM0MsOERBQThEO1FBQzlELElBQUksS0FBSyxDQUFDLE1BQU0sS0FBSyxDQUFDLElBQUksZ0JBQWdCLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQ3RFLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUTtnQkFBRSxJQUFJLENBQUMsUUFBUSxHQUFHLEVBQUUsQ0FBQztZQUN2QyxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUMzRixPQUFPLElBQUksQ0FBQztRQUNoQixDQUFDO1FBRUQsaUVBQWlFO1FBQ2pFLGtFQUFrRTtRQUNsRSxJQUFJLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLFNBQVMsSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssYUFBYSxDQUFDLEVBQUUsQ0FBQztZQUM3RSxNQUFNLFlBQVksR0FBRyxLQUFL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LE1BQU0sV0FBVyxHQUFHLE1BQU0sS0FBSyxDQUFDLGFBQWEsQ0FBQyxTQUFTLEVBQUUsWUFBWSxDQUFDLENBQUM7UUFDdkUsT0FBTyxDQUFDLEdBQUcsV0FBVyxFQUFFLEdBQUcsWUFBWSxDQUFDLENBQUM7SUFDN0MsQ0FBQztDQUNKO0FBOUJELGtEQThCQztBQUVELE1BQWEsaUJBQWtCLFNBQVEsMkJBQW9CO0lBQ3ZELElBQUksWUFBWSxLQUFhLE9BQU8sUUFBUSxDQUFDLENBQUMsQ0FBQztDQUNsRDtBQUZELDhDQUVDO0FBRUQsTUFBYSxtQkFBb0IsU0FBUSwyQkFBb0I7SUFDekQsSUFBSSxZQUFZLEtBQWEsT0FBTyxVQUFVLENBQUMsQ0FBQyxDQUFDO0NBQ3BEO0FBRkQsa0RBRUM7QUFFRDs7Ozs7R0FLRztBQUNILE1BQWEsa0JBQW1CLFNBQVEsMkJBQW9CO0lBQ3hELElBQUksWUFBWSxLQUFhLE9BQU8sR0FBRyxDQUFDLENBQUMsQ0FBQztJQUUxQyxLQUFLLENBQUMsYUFBYSxDQUFDLFNBQW9CLEVBQUUsVUFBNkI7UUFDbkUsT0FBTyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUN4QixZQUFZLEVBQUUsQ0FBQyxDQUFDLFlBQVk7WUFDNUIsT0FBTyxFQUFFLEtBQUs7WUFDZCxLQUFLLEVBQUUsNENBQTRDLFNBQVMsQ0FBQyxRQUFRLHFLQUFxSztTQUM3TyxDQUFDLENBQUMsQ0FBQztJQUNSLENBQUM7Q0FDSjtBQVZELGdEQVVDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBFaWdodCBzcGVjaWFsaXplZCBhc3NldCBpbnRlcnByZXRlcnMgY292ZXJpbmcgdGhlIGhpZ2hlc3QtdmFsdWVcbiAqIGFzc2V0IHR5cGVzIHBlciBSb21hUm9nb3YncyByZWZlcmVuY2Ugc2V0OlxuICpcbiAqICAgSW1hZ2VJbnRlcnByZXRlciAgICAgICAg4oCUIGBpbWFnZWAgICAgICAgICh0ZXh0dXJlcyArIHN1Yi1hc3NldCByb3V0aW5nKVxuICogICBUZXh0dXJlSW50ZXJwcmV0ZXIgICAgICDigJQgYHRleHR1cmVgXG4gKiAgIFNwcml0ZUZyYW1lSW50ZXJwcmV0ZXIgIOKAlCBgc3ByaXRlLWZyYW1lYCAocmVhZC1vbmx5IC8gd3JpdGFibGUgZ3VhcmRzKVxuICogICBGYnhJbnRlcnByZXRlciAgICAgICAgICDigJQgYGZieGBcbiAqICAgTWF0ZXJpYWxJbnRlcnByZXRlciAgICAg4oCUIGBtYXRlcmlhbGAgICAgIChyZWFkLW9ubHkgdmlhIGJhc2U7IGFkdmFuY2VkIGVkaXRpbmcg4oaSIGV4ZWN1dGVfamF2YXNjcmlwdClcbiAqICAgRWZmZWN0SW50ZXJwcmV0ZXIgICAgICAg4oCUIGBlZmZlY3RgXG4gKiAgIFBhcnRpY2xlSW50ZXJwcmV0ZXIgICAgIOKAlCBgcGFydGljbGVgXG4gKiAgIFVua25vd25JbnRlcnByZXRlciAgICAgIOKAlCBgKmAgICAgICAgICAgICAocmVhZC1vbmx5IGZhbGxiYWNrKVxuICpcbiAqIEVhY2ggaXMgYSB0aGluIGV4dGVuc2lvbiBvZiBCYXNlQXNzZXRJbnRlcnByZXRlciDigJQgbW9zdCBvbmx5IG92ZXJyaWRlXG4gKiBgaW1wb3J0ZXJUeXBlYC4gVHdvIG5vdGFibGUgb3ZlcnJpZGVzOlxuICpcbiAqICAgSW1hZ2VJbnRlcnByZXRlci5zZXRQcm9wZXJ0eTogaW1hZ2UgbWV0YSBoYXMgYm90aCB0b3AtbGV2ZWxcbiAqICAgdXNlckRhdGEgZmllbGRzICh0eXBlIC8gZmxpcFZlcnRpY2FsIC8gZXRjKSBhbmQgc3ViLWFzc2V0XG4gKiAgIHVzZXJEYXRhICh0aGUgYHRleHR1cmVgIC8gYHNwcml0ZUZyYW1lYCBzdWItbWV0YXMpLiBSb3V0ZXMgYnlcbiAqICAgcGF0aCBzaGFwZSBzbyBBSSBjYW4gcGFzcyBlaXRoZXIgZmxhdCBvciBuZXN0ZWQgcGF0aHMuXG4gKlxuICogICBTcHJpdGVGcmFtZUludGVycHJldGVyLnNldFByb3BlcnR5OiBzcHJpdGUtZnJhbWUgbWV0YSBoYXMgbWFueVxuICogICBjb21wdXRlZCByZWFkLW9ubHkgZmllbGRzICh3aWR0aCwgaGVpZ2h0LCByb3RhdGVkLCBldGMuKTsgcmVqZWN0XG4gKiAgIHdyaXRlcyB0byB0aGVtIHVwLWZyb250IHdpdGggYSBjbGVhciBlcnJvciByYXRoZXIgdGhhbiBzaWxlbnRseVxuICogICBuby1vcC5cbiAqXG4gKiBNYXRlcmlhbCAqZWRpdGluZyogKGVmZmVjdC9wYXNzZXMvcHJvcHMpIGRlbGliZXJhdGVseSBkZWZlcnJlZCDigJRcbiAqIFJvbWFSb2dvdiB1c2VzIGBzY2VuZS9xdWVyeS1tYXRlcmlhbGAgKyBgc2NlbmUvYXBwbHktbWF0ZXJpYWxgICtcbiAqIGFuIGFzeW5jIGFzc2V0LXV1aWQgcHJlcHJvY2Vzc2luZyBsYXllciB0aGF0IHB1bGxzIGluIHRoZWlyXG4gKiBNY3BTZXJ2ZXJNYW5hZ2VyLmRlY29kZVV1aWQgcGx1bWJpbmcuIEZvciB2Mi40LjMgdGhlIG1hdGVyaWFsXG4gKiBpbnRlcnByZXRlciBvbmx5IHJlYWRzIG1ldGEgdXNlckRhdGE7IEFJIG5lZWRpbmcgdG8gc3dhcCBlZmZlY3RzXG4gKiBvciBzZXQgcGFzc2VzIHNob3VsZCB1c2UgZXhlY3V0ZV9qYXZhc2NyaXB0IHdpdGggc2NlbmUgY29udGV4dFxuICogKGFscmVhZHkgc2hpcHBlZCBpbiB2Mi4zLjApLlxuICpcbiAqIFJlZmVyZW5jZTogRDovMV9kZXYvY29jb3MtbWNwLXJlZmVyZW5jZXMvUm9tYVJvZ292LWNvY29zLW1jcC9zb3VyY2UvbWNwL3Rvb2xzL2Fzc2V0LWludGVycHJldGVycy9cbiAqL1xuXG5pbXBvcnQgdHlwZSB7IEFzc2V0SW5mbyB9IGZyb20gJ0Bjb2Nvcy9jcmVhdG9yLXR5cGVzL2VkaXRvci9wYWNrYWdlcy9hc3NldC1kYi9AdHlwZXMvcHVibGljJztcbmltcG9ydCB7IEJhc2VBc3NldEludGVycHJldGVyIH0gZnJvbSAnLi9iYXNlJztcbmltcG9ydCB7IFByb3BlcnR5U2V0U3BlYywgUHJvcGVydHlTZXRSZXN1bHQgfSBmcm9tICcuL2ludGVyZmFjZSc7XG5cbmV4cG9ydCBjbGFzcyBJbWFnZUludGVycHJldGVyIGV4dGVuZHMgQmFzZUFzc2V0SW50ZXJwcmV0ZXIge1xuICAgIGdldCBpbXBvcnRlclR5cGUoKTogc3RyaW5nIHsgcmV0dXJuICdpbWFnZSc7IH1cblxuICAgIC8vIFRvcC1sZXZlbCBpbWFnZSBwcm9wZXJ0aWVzIGxpdmUgZGlyZWN0bHkgdW5kZXIgdXNlckRhdGE7IHN1Yi1hc3NldFxuICAgIC8vIHByb3BlcnRpZXMgKHRleHR1cmUvc3ByaXRlRnJhbWUpIGxpdmUgdW5kZXIgc3ViTWV0YXNbbmFtZV0udXNlckRhdGEuXG4gICAgcHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgVE9QX0xFVkVMX0tFWVMgPSBuZXcgU2V0KFtcbiAgICAgICAgJ3R5cGUnLCAnZmxpcFZlcnRpY2FsJywgJ2ZpeEFscGhhVHJhbnNwYXJlbmN5QXJ0aWZhY3RzJyxcbiAgICAgICAgJ2ZsaXBHcmVlbkNoYW5uZWwnLCAnaXNSR0JFJyxcbiAgICBdKTtcblxuICAgIHByb3RlY3RlZCBhc3luYyBzZXRQcm9wZXJ0eShtZXRhOiBhbnksIHByb3A6IFByb3BlcnR5U2V0U3BlYyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgICAgICBjb25zdCBwYXJ0cyA9IHByb3AucHJvcGVydHlQYXRoLnNwbGl0KCcuJyk7XG5cbiAgICAgICAgLy8gRmxhdCBwYXRoOiBhIHRvcC1sZXZlbCBpbWFnZSBwcm9wZXJ0eS4gSG9pc3QgaW50byB1c2VyRGF0YS5cbiAgICAgICAgaWYgKHBhcnRzLmxlbmd0aCA9PT0gMSAmJiBJbWFnZUludGVycHJldGVyLlRPUF9MRVZFTF9LRVlTLmhhcyhwYXJ0c1swXSkpIHtcbiAgICAgICAgICAgIGlmICghbWV0YS51c2VyRGF0YSkgbWV0YS51c2VyRGF0YSA9IHt9O1xuICAgICAgICAgICAgbWV0YS51c2VyRGF0YVtwYXJ0c1swXV0gPSB0aGlzLmNvbnZlcnRQcm9wZXJ0eVZhbHVlKHByb3AucHJvcGVydHlWYWx1ZSwgcHJvcC5wcm9wZXJ0eVR5cGUpO1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBTdWItYXNzZXQgc2hvcnRoYW5kOiBgdGV4dHVyZS48cHJvcD5gIG9yIGBzcHJpdGVGcmFtZS48cHJvcD5gLlxuICAgICAgICAvLyBGaW5kIHRoZSBtYXRjaGluZyBzdWItbWV0YSBieSBuYW1lIGFuZCB3cml0ZSBpbnRvIGl0cyB1c2VyRGF0YS5cbiAgICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDEgJiYgKHBhcnRzWzBdID09PSAndGV4dHVyZScgfHwgcGFydHNbMF0gPT09ICdzcHJpdGVGcmFtZScpKSB7XG4gICAgICAgICAgICBjb25zdCBzdWJBc3NldE5hbWUgPSBwYXJ0c1swXTtcbiAgICAgICAgICAgIGNvbnN0IHByb3BlcnR5TmFtZSA9IHBhcnRzLnNsaWNlKDEpLmpvaW4oJy4nKTtcbiAgICAgICAgICAgIGlmICghbWV0YS5zdWJNZXRhcykgbWV0YS5zdWJNZXRhcyA9IHt9O1xuICAgICAgICAgICAgZm9yIChjb25zdCBzdWJNZXRhIG9mIE9iamVjdC52YWx1ZXMobWV0YS5zdWJNZXRhcykgYXMgYW55W10pIHtcbiAgICAgICAgICAgICAgICBpZiAoIXN1Yk1ldGEgfHwgdHlwZW9mIHN1Yk1ldGEgIT09ICdvYmplY3QnKSBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAvLyBSb21hUm9nb3YgdHJlYXRzIGVpdGhlciB1dWlkIG1hdGNoIG9yIHRoZSBsaXRlcmFsIG5hbWVcbiAgICAgICAgICAgICAgICAvLyBhcyBhIGhpdDsgd2Uga2VlcCB0aGUgbGl0ZXJhbC1uYW1lIGJlaGF2aW91ciBzaW5jZVxuICAgICAgICAgICAgICAgIC8vIGltYWdlIHN1Yi1tZXRhcyBhcmUgY29udmVudGlvbmFsbHkga2V5ZWQgYnkgbmFtZS5cbiAgICAgICAgICAgICAgICBpZiAoIXN1Yk1ldGEudXNlckRhdGEpIHN1Yk1ldGEudXNlckRhdGEgPSB7fTtcbiAgICAgICAgICAgICAgICBjb25zdCBpbm5lciA9IHByb3BlcnR5TmFtZS5zcGxpdCgnLicpO1xuICAgICAgICAgICAgICAgIGxldCBjdXJzb3IgPSBzdWJNZXRhLnVzZXJEYXRhO1xuICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgaW5uZXIubGVuZ3RoIC0gMTsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChjdXJzb3JbaW5uZXJbaV1dID09PSB1bmRlZmluZWQgfHwgY3Vyc29yW2lubmVyW2ldXSA9PT0gbnVsbCkgY3Vyc29yW2lubmVyW2ldXSA9IHt9O1xuICAgICAgICAgICAgICAgICAgICBjdXJzb3IgPSBjdXJzb3JbaW5uZXJbaV1dO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjdXJzb3JbaW5uZXJbaW5uZXIubGVuZ3RoIC0gMV1dID0gdGhpcy5jb252ZXJ0UHJvcGVydHlWYWx1ZShwcm9wLnByb3BlcnR5VmFsdWUsIHByb3AucHJvcGVydHlUeXBlKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIE5vIHN1Yi1tZXRhIG1hdGNoZWQg4oCUIGZhbGwgdGhyb3VnaCB0byBnZW5lcmljIGhhbmRsZXIgc29cbiAgICAgICAgICAgIC8vIHBhdGgtdmFsaWRhdGlvbiBraWNrcyBpbi5cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBzdXBlci5zZXRQcm9wZXJ0eShtZXRhLCBwcm9wKTtcbiAgICB9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXh0dXJlSW50ZXJwcmV0ZXIgZXh0ZW5kcyBCYXNlQXNzZXRJbnRlcnByZXRlciB7XG4gICAgZ2V0IGltcG9ydGVyVHlwZSgpOiBzdHJpbmcgeyByZXR1cm4gJ3RleHR1cmUnOyB9XG59XG5cbmV4cG9ydCBjbGFzcyBTcHJpdGVGcmFtZUludGVycHJldGVyIGV4dGVuZHMgQmFzZUFzc2V0SW50ZXJwcmV0ZXIge1xuICAgIGdldCBpbXBvcnRlclR5cGUoKTogc3RyaW5nIHsgcmV0dXJuICdzcHJpdGUtZnJhbWUnOyB9XG5cbiAgICAvLyBDb21wdXRlZC1mcm9tLXNvdXJjZSBmaWVsZHMgdGhlIGVkaXRvciByZWNvbXB1dGVzIG9uIGltcG9ydDsgQUlcbiAgICAvLyB3cml0ZXMgdG8gdGhlc2UgYXJlIHNpbGVudGx5IGRyb3BwZWQgb24gc2F2ZSBhbmQgd2FzdGUgcm91bmQtdHJpcHMuXG4gICAgcHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgUkVBRF9PTkxZID0gbmV3IFNldChbXG4gICAgICAgICd3aWR0aCcsICdoZWlnaHQnLCAncmF3V2lkdGgnLCAncmF3SGVpZ2h0JyxcbiAgICAgICAgJ3RyaW1YJywgJ3RyaW1ZJywgJ29mZnNldFgnLCAnb2Zmc2V0WScsXG4gICAgICAgICd2ZXJ0aWNlcycsICdyb3RhdGVkJywgJ2lzVXVpZCcsICdpbWFnZVV1aWRPckRhdGFiYXNlVXJpJyxcbiAgICBdKTtcblxuICAgIHByb3RlY3RlZCBhc3luYyBzZXRQcm9wZXJ0eShtZXRhOiBhbnksIHByb3A6IFByb3BlcnR5U2V0U3BlYyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgICAgICBjb25zdCBwcm9wZXJ0eU5hbWUgPSBwcm9wLnByb3BlcnR5UGF0aC5yZXBsYWNlKC9edXNlckRhdGFcXC4vLCAnJyk7XG4gICAgICAgIGlmIChTcHJpdGVGcmFtZUludGVycHJldGVyLlJFQURfT05MWS5oYXMocHJvcGVydHlOYW1lKSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBTcHJpdGVGcmFtZSBwcm9wZXJ0eSAnJHtwcm9wZXJ0eU5hbWV9JyBpcyByZWFkLW9ubHkgKGNvbXB1dGVkIGZyb20gc291cmNlIGltYWdlKWApO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBzdXBlci5zZXRQcm9wZXJ0eShtZXRhLCBwcm9wKTtcbiAgICB9XG59XG5cbmV4cG9ydCBjbGFzcyBGYnhJbnRlcnByZXRlciBleHRlbmRzIEJhc2VBc3NldEludGVycHJldGVyIHtcbiAgICBnZXQgaW1wb3J0ZXJUeXBlKCk6IHN0cmluZyB7IHJldHVybiAnZmJ4JzsgfVxufVxuXG5leHBvcnQgY2xhc3MgTWF0ZXJpYWxJbnRlcnByZXRlciBleHRlbmRzIEJhc2VBc3NldEludGVycHJldGVyIHtcbiAgICBnZXQgaW1wb3J0ZXJUeXBlKCk6IHN0cmluZyB7IHJldHVybiAnbWF0ZXJpYWwnOyB9XG5cbiAgICAvLyB2Mi40LjMgZGVsaWJlcmF0ZWx5IGV4cG9zZXMgb25seSBtZXRhIHVzZXJEYXRhIHJlYWRzLiBlZmZlY3QgL1xuICAgIC8vIHRlY2huaXF1ZSAvIHBhc3NlcyBlZGl0aW5nIHJlcXVpcmVzIHNjZW5lL2FwcGx5LW1hdGVyaWFsIHBsdXMgYW5cbiAgICAvLyBhc3NldC11dWlkIHByZXByb2Nlc3NpbmcgbGF5ZXIgKFJvbWFSb2dvdiB1c2VzIE1jcFNlcnZlck1hbmFnZXIuXG4gICAgLy8gZGVjb2RlVXVpZCkgdGhhdCB3ZSdkIG5lZWQgdG8gcG9ydCB3aG9sZXNhbGUuIFVudGlsIHRoYXQgbGFuZHNcbiAgICAvLyBpbiB2Mi41KywgQUkgc2hvdWxkIGRyaXZlIG1hdGVyaWFsIGVkaXRzIHZpYSBleGVjdXRlX2phdmFzY3JpcHRcbiAgICAvLyB3aXRoIGNvbnRleHQ9J3NjZW5lJyDigJQgdGhhdCBwYXRoIGNhbiBjYWxsIGNjZS5TY2VuZUZhY2FkZVxuICAgIC8vIGRpcmVjdGx5IGFuZCBpcyBhbHJlYWR5IHNoaXBwZWQgKHYyLjMuMCkuXG4gICAgYXN5bmMgc2V0UHJvcGVydGllcyhhc3NldEluZm86IEFzc2V0SW5mbywgcHJvcGVydGllczogUHJvcGVydHlTZXRTcGVjW10pOiBQcm9taXNlPFByb3BlcnR5U2V0UmVzdWx0W10+IHtcbiAgICAgICAgLy8gdXNlckRhdGEgZWRpdHMgZ28gdGhyb3VnaCB0aGUgYmFzZSBwYXRoOyBldmVyeXRoaW5nIGVsc2VcbiAgICAgICAgLy8gZ2V0cyByb3V0ZWQgdG8gdGhlIGhlbHBmdWwtZXJyb3IgZXhwbGFuYXRpb24uXG4gICAgICAgIGNvbnN0IHVzZXJEYXRhT25seTogUHJvcGVydHlTZXRTcGVjW10gPSBbXTtcbiAgICAgICAgY29uc3Qgb3RoZXJSZXN1bHRzOiBQcm9wZXJ0eVNldFJlc3VsdFtdID0gW107XG4gICAgICAgIGZvciAoY29uc3QgcCBvZiBwcm9wZXJ0aWVzKSB7XG4gICAgICAgICAgICBpZiAocC5wcm9wZXJ0eVBhdGguc3RhcnRzV2l0aCgndXNlckRhdGEuJykpIHtcbiAgICAgICAgICAgICAgICB1c2VyRGF0YU9ubHkucHVzaChwKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgb3RoZXJSZXN1bHRzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0eVBhdGg6IHAucHJvcGVydHlQYXRoLFxuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGBNYXRlcmlhbEludGVycHJldGVyIHYyLjQuMyBvbmx5IHN1cHBvcnRzIHVzZXJEYXRhLiogd3JpdGVzLiBGb3IgZWZmZWN0L3RlY2huaXF1ZS9wYXNzZXMgdXNlIGRlYnVnX2V4ZWN1dGVfamF2YXNjcmlwdCAoY29udGV4dD0nc2NlbmUnKSB3aXRoIGNjZS5TY2VuZUZhY2FkZS5hcHBseU1hdGVyaWFsOyBmdWxsIG1hdGVyaWFsIGVkaXRpbmcgbGFuZHMgaW4gdjIuNSsuYCxcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAodXNlckRhdGFPbmx5Lmxlbmd0aCA9PT0gMCkgcmV0dXJuIG90aGVyUmVzdWx0cztcbiAgICAgICAgY29uc3QgYmFzZVJlc3VsdHMgPSBhd2FpdCBzdXBlci5zZXRQcm9wZXJ0aWVzKGFzc2V0SW5mbywgdXNlckRhdGFPbmx5KTtcbiAgICAgICAgcmV0dXJuIFsuLi5iYXNlUmVzdWx0cywgLi4ub3RoZXJSZXN1bHRzXTtcbiAgICB9XG59XG5cbmV4cG9ydCBjbGFzcyBFZmZlY3RJbnRlcnByZXRlciBleHRlbmRzIEJhc2VBc3NldEludGVycHJldGVyIHtcbiAgICBnZXQgaW1wb3J0ZXJUeXBlKCk6IHN0cmluZyB7IHJldHVybiAnZWZmZWN0JzsgfVxufVxuXG5leHBvcnQgY2xhc3MgUGFydGljbGVJbnRlcnByZXRlciBleHRlbmRzIEJhc2VBc3NldEludGVycHJldGVyIHtcbiAgICBnZXQgaW1wb3J0ZXJUeXBlKCk6IHN0cmluZyB7IHJldHVybiAncGFydGljbGUnOyB9XG59XG5cbi8qKlxuICogQ2F0Y2gtYWxsIGZvciBpbXBvcnRlciBzdHJpbmdzIHdlIGRvbid0IGhhdmUgYSBzcGVjaWFsaXplZCBoYW5kbGVyXG4gKiBmb3IuIFJlYWRzIHdvcmsgdmlhIHRoZSBiYXNlIGNsYXNzIChiZXN0LWVmZm9ydCBkdW1wIG9mIHVzZXJEYXRhICtcbiAqIHN1Yk1ldGFzKSwgYnV0IHdyaXRlcyBhcmUgcmVqZWN0ZWQg4oCUIHdpdGhvdXQga25vd2luZyB0aGUgaW1wb3J0ZXInc1xuICogbWV0YSBsYXlvdXQsIGJsaW5kbHkgd3JpdGluZyByaXNrcyBjb3JydXB0aW5nIHRoZSBhc3NldC5cbiAqL1xuZXhwb3J0IGNsYXNzIFVua25vd25JbnRlcnByZXRlciBleHRlbmRzIEJhc2VBc3NldEludGVycHJldGVyIHtcbiAgICBnZXQgaW1wb3J0ZXJUeXBlKCk6IHN0cmluZyB7IHJldHVybiAnKic7IH1cblxuICAgIGFzeW5jIHNldFByb3BlcnRpZXMoYXNzZXRJbmZvOiBBc3NldEluZm8sIHByb3BlcnRpZXM6IFByb3BlcnR5U2V0U3BlY1tdKTogUHJvbWlzZTxQcm9wZXJ0eVNldFJlc3VsdFtdPiB7XG4gICAgICAgIHJldHVybiBwcm9wZXJ0aWVzLm1hcChwID0+ICh7XG4gICAgICAgICAgICBwcm9wZXJ0eVBhdGg6IHAucHJvcGVydHlQYXRoLFxuICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICBlcnJvcjogYE5vIHNwZWNpYWxpemVkIGludGVycHJldGVyIGZvciBpbXBvcnRlciAnJHthc3NldEluZm8uaW1wb3J0ZXJ9Jy4gQXNzZXQgd3JpdGVzIGFyZSByZWplY3RlZCB0byBhdm9pZCBjb3JydXB0aW5nIGFuIHVua25vd24gbWV0YSBzaGFwZTsgcmVhZHMgdmlhIGFzc2V0X2dldF9wcm9wZXJ0aWVzIHN0aWxsIHdvcmsuIEZpbGUgYSByZXF1ZXN0IHRvIGFkZCBhIHNwZWNpYWxpemVkIGludGVycHJldGVyLmAsXG4gICAgICAgIH0pKTtcbiAgICB9XG59XG4iXX0=