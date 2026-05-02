"use strict";
/**
 * animation-tools — drive `cc.Animation` from MCP.
 *
 * Four tools:
 *   - animation_list_clips   — enumerate clips on a node's cc.Animation
 *   - animation_play         — start a clip (default if name omitted)
 *   - animation_stop         — stop the active clip
 *   - animation_set_clip     — set defaultClip / playOnLoad
 *
 * All four accept the v2.4.0 `nodeUuid | nodeName` fallback via
 * `resolveOrToolError`. Scene-side execution lives in
 * `source/scene.ts:methods.{getAnimationClips,playAnimation,
 * stopAnimation,setAnimationProperty}` so cc.* APIs stay where they
 * legally exist (engine context).
 *
 * Reference: cocos-mcp-extension (Spaydo)
 * `source/tools/animation-tools.ts`. We rewrite using the v2.4.0
 * declarative `defineTools` pattern + node fallback rather than the
 * upstream three-layer dispatch.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnimationTools = void 0;
const schema_1 = require("../lib/schema");
const define_tools_1 = require("../lib/define-tools");
const scene_bridge_1 = require("../lib/scene-bridge");
const resolve_node_1 = require("../lib/resolve-node");
const log_1 = require("../lib/log");
const animationListClips = {
    name: 'list_clips',
    title: 'List animation clips',
    description: 'List animation clips registered on a node\'s cc.Animation component. Returns clip names + which one is the defaultClip + the playOnLoad flag.',
    inputSchema: schema_1.z.object(Object.assign({}, resolve_node_1.nodeReferenceShape)),
    handler: async (args) => {
        const resolved = await (0, resolve_node_1.resolveOrToolError)(args);
        if ('response' in resolved)
            return resolved.response;
        return (0, scene_bridge_1.runSceneMethodAsToolResponse)('getAnimationClips', [resolved.uuid]);
    },
};
const animationPlay = {
    name: 'play',
    title: 'Play animation clip',
    description: 'Play an animation clip on a node\'s cc.Animation component. Omits clipName → plays the configured defaultClip. Returns success even when the clip was already playing (cocos no-op).',
    inputSchema: schema_1.z.object(Object.assign(Object.assign({}, resolve_node_1.nodeReferenceShape), { clipName: schema_1.z.string().optional().describe('Clip name registered on the Animation component. Omit to play defaultClip.') })),
    handler: async (args) => {
        const resolved = await (0, resolve_node_1.resolveOrToolError)(args);
        if ('response' in resolved)
            return resolved.response;
        return (0, scene_bridge_1.runSceneMethodAsToolResponse)('playAnimation', [resolved.uuid, args.clipName]);
    },
};
const animationStop = {
    name: 'stop',
    title: 'Stop animation',
    description: 'Stop the currently playing animation on a node\'s cc.Animation component. No-op if nothing is playing.',
    inputSchema: schema_1.z.object(Object.assign({}, resolve_node_1.nodeReferenceShape)),
    handler: async (args) => {
        const resolved = await (0, resolve_node_1.resolveOrToolError)(args);
        if ('response' in resolved)
            return resolved.response;
        return (0, scene_bridge_1.runSceneMethodAsToolResponse)('stopAnimation', [resolved.uuid]);
    },
};
const animationSetClip = {
    name: 'set_clip',
    title: 'Configure animation clip',
    description: 'Configure a node\'s cc.Animation: defaultClip name and/or playOnLoad. Both fields optional — only the ones you pass get written. Persists via the editor set-property channel (Landmine #11 scalar path) so save_scene picks it up.',
    inputSchema: schema_1.z.object(Object.assign(Object.assign({}, resolve_node_1.nodeReferenceShape), { defaultClip: schema_1.z.string().optional().describe('Name of the clip to use as defaultClip. Must already be registered in the component\'s clips array.'), playOnLoad: schema_1.z.boolean().optional().describe('Whether the component starts the defaultClip when the scene loads.') })),
    handler: async (args) => {
        var _a, _b, _c, _d;
        if (args.defaultClip === undefined && args.playOnLoad === undefined) {
            return {
                success: false,
                error: 'animation_set_clip: provide at least one of defaultClip / playOnLoad',
            };
        }
        const resolved = await (0, resolve_node_1.resolveOrToolError)(args);
        if ('response' in resolved)
            return resolved.response;
        const uuid = resolved.uuid;
        // Step 1: scene-script resolves component index + clip uuid (if
        // defaultClip is set). Bundled in one call so failures (no anim
        // component, unknown clip) bubble back before any set-property.
        const lookup = await (0, scene_bridge_1.runSceneMethod)('queryAnimationSetTargets', [uuid, (_a = args.defaultClip) !== null && _a !== void 0 ? _a : null], { capture: false });
        if (!lookup || lookup.success !== true) {
            return {
                success: false,
                error: (_b = lookup === null || lookup === void 0 ? void 0 : lookup.error) !== null && _b !== void 0 ? _b : 'queryAnimationSetTargets returned no data',
            };
        }
        const { componentIndex, clipUuid } = (_c = lookup.data) !== null && _c !== void 0 ? _c : {};
        if (typeof componentIndex !== 'number') {
            return { success: false, error: 'queryAnimationSetTargets did not return componentIndex' };
        }
        // Step 2: host-side set-property writes for each requested field.
        // Scalar paths per Landmine #11 propagate immediately, no nudge.
        const updated = [];
        try {
            if (args.defaultClip !== undefined) {
                await Editor.Message.request('scene', 'set-property', {
                    uuid,
                    path: `__comps__.${componentIndex}.defaultClip`,
                    dump: { value: { uuid: clipUuid }, type: 'cc.AnimationClip' },
                });
                updated.push('defaultClip');
            }
            if (args.playOnLoad !== undefined) {
                await Editor.Message.request('scene', 'set-property', {
                    uuid,
                    path: `__comps__.${componentIndex}.playOnLoad`,
                    dump: { value: args.playOnLoad === true },
                });
                updated.push('playOnLoad');
            }
        }
        catch (err) {
            log_1.logger.error('[AnimationTools] set-property failed:', err);
            return {
                success: false,
                error: `set-property failed after partial update [${updated.join(', ')}]: ${(_d = err === null || err === void 0 ? void 0 : err.message) !== null && _d !== void 0 ? _d : String(err)}`,
            };
        }
        return {
            success: true,
            message: `Updated ${updated.join(', ')} on cc.Animation`,
            data: { nodeUuid: uuid, componentIndex, updated },
            updatedProperties: updated,
        };
    },
};
class AnimationTools {
    constructor() {
        this.impl = (0, define_tools_1.defineTools)([
            animationListClips,
            animationPlay,
            animationStop,
            animationSetClip,
        ]);
    }
    getTools() {
        return this.impl.getTools();
    }
    execute(toolName, args) {
        return this.impl.execute(toolName, args);
    }
}
exports.AnimationTools = AnimationTools;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYW5pbWF0aW9uLXRvb2xzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL3Rvb2xzL2FuaW1hdGlvbi10b29scy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FtQkc7OztBQUdILDBDQUFrQztBQUNsQyxzREFBMkQ7QUFDM0Qsc0RBQW1GO0FBQ25GLHNEQUE2RTtBQUM3RSxvQ0FBb0M7QUFFcEMsTUFBTSxrQkFBa0IsR0FBWTtJQUNoQyxJQUFJLEVBQUUsWUFBWTtJQUNsQixLQUFLLEVBQUUsc0JBQXNCO0lBQzdCLFdBQVcsRUFBRSwrSUFBK0k7SUFDNUosV0FBVyxFQUFFLFVBQUMsQ0FBQyxNQUFNLG1CQUNkLGlDQUFrQixFQUN2QjtJQUNGLE9BQU8sRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFLEVBQUU7UUFDcEIsTUFBTSxRQUFRLEdBQUcsTUFBTSxJQUFBLGlDQUFrQixFQUFDLElBQUksQ0FBQyxDQUFDO1FBQ2hELElBQUksVUFBVSxJQUFJLFFBQVE7WUFBRSxPQUFPLFFBQVEsQ0FBQyxRQUFRLENBQUM7UUFDckQsT0FBTyxJQUFBLDJDQUE0QixFQUFDLG1CQUFtQixFQUFFLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7SUFDOUUsQ0FBQztDQUNKLENBQUM7QUFFRixNQUFNLGFBQWEsR0FBWTtJQUMzQixJQUFJLEVBQUUsTUFBTTtJQUNaLEtBQUssRUFBRSxxQkFBcUI7SUFDNUIsV0FBVyxFQUFFLHNMQUFzTDtJQUNuTSxXQUFXLEVBQUUsVUFBQyxDQUFDLE1BQU0saUNBQ2QsaUNBQWtCLEtBQ3JCLFFBQVEsRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxFQUFFLENBQUMsUUFBUSxDQUFDLDRFQUE0RSxDQUFDLElBQ3hIO0lBQ0YsT0FBTyxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsRUFBRTtRQUNwQixNQUFNLFFBQVEsR0FBRyxNQUFNLElB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LENBQUM7UUFDTixDQUFDO1FBRUQsT0FBTztZQUNILE9BQU8sRUFBRSxJQUFJO1lBQ2IsT0FBTyxFQUFFLFdBQVcsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsa0JBQWtCO1lBQ3hELElBQUksRUFBRSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsY0FBYyxFQUFFLE9BQU8sRUFBRTtZQUNqRCxpQkFBaUIsRUFBRSxPQUFPO1NBQzdCLENBQUM7SUFDTixDQUFDO0NBQ0osQ0FBQztBQUVGLE1BQWEsY0FBYztJQUEzQjtRQUNZLFNBQUksR0FBRyxJQUFBLDBCQUFXLEVBQUM7WUFDdkIsa0JBQWtCO1lBQ2xCLGFBQWE7WUFDYixhQUFhO1lBQ2IsZ0JBQWdCO1NBQ25CLENBQUMsQ0FBQztJQVNQLENBQUM7SUFQRyxRQUFRO1FBQ0osT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO0lBQ2hDLENBQUM7SUFFRCxPQUFPLENBQUMsUUFBZ0IsRUFBRSxJQUFTO1FBQy9CLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQzdDLENBQUM7Q0FDSjtBQWZELHdDQWVDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBhbmltYXRpb24tdG9vbHMg4oCUIGRyaXZlIGBjYy5BbmltYXRpb25gIGZyb20gTUNQLlxuICpcbiAqIEZvdXIgdG9vbHM6XG4gKiAgIC0gYW5pbWF0aW9uX2xpc3RfY2xpcHMgICDigJQgZW51bWVyYXRlIGNsaXBzIG9uIGEgbm9kZSdzIGNjLkFuaW1hdGlvblxuICogICAtIGFuaW1hdGlvbl9wbGF5ICAgICAgICAg4oCUIHN0YXJ0IGEgY2xpcCAoZGVmYXVsdCBpZiBuYW1lIG9taXR0ZWQpXG4gKiAgIC0gYW5pbWF0aW9uX3N0b3AgICAgICAgICDigJQgc3RvcCB0aGUgYWN0aXZlIGNsaXBcbiAqICAgLSBhbmltYXRpb25fc2V0X2NsaXAgICAgIOKAlCBzZXQgZGVmYXVsdENsaXAgLyBwbGF5T25Mb2FkXG4gKlxuICogQWxsIGZvdXIgYWNjZXB0IHRoZSB2Mi40LjAgYG5vZGVVdWlkIHwgbm9kZU5hbWVgIGZhbGxiYWNrIHZpYVxuICogYHJlc29sdmVPclRvb2xFcnJvcmAuIFNjZW5lLXNpZGUgZXhlY3V0aW9uIGxpdmVzIGluXG4gKiBgc291cmNlL3NjZW5lLnRzOm1ldGhvZHMue2dldEFuaW1hdGlvbkNsaXBzLHBsYXlBbmltYXRpb24sXG4gKiBzdG9wQW5pbWF0aW9uLHNldEFuaW1hdGlvblByb3BlcnR5fWAgc28gY2MuKiBBUElzIHN0YXkgd2hlcmUgdGhleVxuICogbGVnYWxseSBleGlzdCAoZW5naW5lIGNvbnRleHQpLlxuICpcbiAqIFJlZmVyZW5jZTogY29jb3MtbWNwLWV4dGVuc2lvbiAoU3BheWRvKVxuICogYHNvdXJjZS90b29scy9hbmltYXRpb24tdG9vbHMudHNgLiBXZSByZXdyaXRlIHVzaW5nIHRoZSB2Mi40LjBcbiAqIGRlY2xhcmF0aXZlIGBkZWZpbmVUb29sc2AgcGF0dGVybiArIG5vZGUgZmFsbGJhY2sgcmF0aGVyIHRoYW4gdGhlXG4gKiB1cHN0cmVhbSB0aHJlZS1sYXllciBkaXNwYXRjaC5cbiAqL1xuXG5pbXBvcnQgdHlwZSB7IFRvb2xSZXNwb25zZSB9IGZyb20gJy4uL3R5cGVzJztcbmltcG9ydCB7IHogfSBmcm9tICcuLi9saWIvc2NoZW1hJztcbmltcG9ydCB7IGRlZmluZVRvb2xzLCBUb29sRGVmIH0gZnJvbSAnLi4vbGliL2RlZmluZS10b29scyc7XG5pbXBvcnQgeyBydW5TY2VuZU1ldGhvZCwgcnVuU2NlbmVNZXRob2RBc1Rvb2xSZXNwb25zZSB9IGZyb20gJy4uL2xpYi9zY2VuZS1icmlkZ2UnO1xuaW1wb3J0IHsgbm9kZVJlZmVyZW5jZVNoYXBlLCByZXNvbHZlT3JUb29sRXJyb3IgfSBmcm9tICcuLi9saWIvcmVzb2x2ZS1ub2RlJztcbmltcG9ydCB7IGxvZ2dlciB9IGZyb20gJy4uL2xpYi9sb2cnO1xuXG5jb25zdCBhbmltYXRpb25MaXN0Q2xpcHM6IFRvb2xEZWYgPSB7XG4gICAgbmFtZTogJ2xpc3RfY2xpcHMnLFxuICAgIHRpdGxlOiAnTGlzdCBhbmltYXRpb24gY2xpcHMnLFxuICAgIGRlc2NyaXB0aW9uOiAnTGlzdCBhbmltYXRpb24gY2xpcHMgcmVnaXN0ZXJlZCBvbiBhIG5vZGVcXCdzIGNjLkFuaW1hdGlvbiBjb21wb25lbnQuIFJldHVybnMgY2xpcCBuYW1lcyArIHdoaWNoIG9uZSBpcyB0aGUgZGVmYXVsdENsaXAgKyB0aGUgcGxheU9uTG9hZCBmbGFnLicsXG4gICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgLi4ubm9kZVJlZmVyZW5jZVNoYXBlLFxuICAgIH0pLFxuICAgIGhhbmRsZXI6IGFzeW5jIChhcmdzKSA9PiB7XG4gICAgICAgIGNvbnN0IHJlc29sdmVkID0gYXdhaXQgcmVzb2x2ZU9yVG9vbEVycm9yKGFyZ3MpO1xuICAgICAgICBpZiAoJ3Jlc3BvbnNlJyBpbiByZXNvbHZlZCkgcmV0dXJuIHJlc29sdmVkLnJlc3BvbnNlO1xuICAgICAgICByZXR1cm4gcnVuU2NlbmVNZXRob2RBc1Rvb2xSZXNwb25zZSgnZ2V0QW5pbWF0aW9uQ2xpcHMnLCBbcmVzb2x2ZWQudXVpZF0pO1xuICAgIH0sXG59O1xuXG5jb25zdCBhbmltYXRpb25QbGF5OiBUb29sRGVmID0ge1xuICAgIG5hbWU6ICdwbGF5JyxcbiAgICB0aXRsZTogJ1BsYXkgYW5pbWF0aW9uIGNsaXAnLFxuICAgIGRlc2NyaXB0aW9uOiAnUGxheSBhbiBhbmltYXRpb24gY2xpcCBvbiBhIG5vZGVcXCdzIGNjLkFuaW1hdGlvbiBjb21wb25lbnQuIE9taXRzIGNsaXBOYW1lIOKGkiBwbGF5cyB0aGUgY29uZmlndXJlZCBkZWZhdWx0Q2xpcC4gUmV0dXJucyBzdWNjZXNzIGV2ZW4gd2hlbiB0aGUgY2xpcCB3YXMgYWxyZWFkeSBwbGF5aW5nIChjb2NvcyBuby1vcCkuJyxcbiAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAuLi5ub2RlUmVmZXJlbmNlU2hhcGUsXG4gICAgICAgIGNsaXBOYW1lOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0NsaXAgbmFtZSByZWdpc3RlcmVkIG9uIHRoZSBBbmltYXRpb24gY29tcG9uZW50LiBPbWl0IHRvIHBsYXkgZGVmYXVsdENsaXAuJyksXG4gICAgfSksXG4gICAgaGFuZGxlcjogYXN5bmMgKGFyZ3MpID0+IHtcbiAgICAgICAgY29uc3QgcmVzb2x2ZWQgPSBhd2FpdCByZXNvbHZlT3JUb29sRXJyb3IoYXJncyk7XG4gICAgICAgIGlmICgncmVzcG9uc2UnIGluIHJlc29sdmVkKSByZXR1cm4gcmVzb2x2ZWQucmVzcG9uc2U7XG4gICAgICAgIHJldHVybiBydW5TY2VuZU1ldGhvZEFzVG9vbFJlc3BvbnNlKCdwbGF5QW5pbWF0aW9uJywgW3Jlc29sdmVkLnV1aWQsIGFyZ3MuY2xpcE5hbWVdKTtcbiAgICB9LFxufTtcblxuY29uc3QgYW5pbWF0aW9uU3RvcDogVG9vbERlZiA9IHtcbiAgICBuYW1lOiAnc3RvcCcsXG4gICAgdGl0bGU6ICdTdG9wIGFuaW1hdGlvbicsXG4gICAgZGVzY3JpcHRpb246ICdTdG9wIHRoZSBjdXJyZW50bHkgcGxheWluZyBhbmltYXRpb24gb24gYSBub2RlXFwncyBjYy5BbmltYXRpb24gY29tcG9uZW50LiBOby1vcCBpZiBub3RoaW5nIGlzIHBsYXlpbmcuJyxcbiAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAuLi5ub2RlUmVmZXJlbmNlU2hhcGUsXG4gICAgfSksXG4gICAgaGFuZGxlcjogYXN5bmMgKGFyZ3MpID0+IHtcbiAgICAgICAgY29uc3QgcmVzb2x2ZWQgPSBhd2FpdCByZXNvbHZlT3JUb29sRXJyb3IoYXJncyk7XG4gICAgICAgIGlmICgncmVzcG9uc2UnIGluIHJlc29sdmVkKSByZXR1cm4gcmVzb2x2ZWQucmVzcG9uc2U7XG4gICAgICAgIHJldHVybiBydW5TY2VuZU1ldGhvZEFzVG9vbFJlc3BvbnNlKCdzdG9wQW5pbWF0aW9uJywgW3Jlc29sdmVkLnV1aWRdKTtcbiAgICB9LFxufTtcblxuY29uc3QgYW5pbWF0aW9uU2V0Q2xpcDogVG9vbERlZiA9IHtcbiAgICBuYW1lOiAnc2V0X2NsaXAnLFxuICAgIHRpdGxlOiAnQ29uZmlndXJlIGFuaW1hdGlvbiBjbGlwJyxcbiAgICBkZXNjcmlwdGlvbjogJ0NvbmZpZ3VyZSBhIG5vZGVcXCdzIGNjLkFuaW1hdGlvbjogZGVmYXVsdENsaXAgbmFtZSBhbmQvb3IgcGxheU9uTG9hZC4gQm90aCBmaWVsZHMgb3B0aW9uYWwg4oCUIG9ubHkgdGhlIG9uZXMgeW91IHBhc3MgZ2V0IHdyaXR0ZW4uIFBlcnNpc3RzIHZpYSB0aGUgZWRpdG9yIHNldC1wcm9wZXJ0eSBjaGFubmVsIChMYW5kbWluZSAjMTEgc2NhbGFyIHBhdGgpIHNvIHNhdmVfc2NlbmUgcGlja3MgaXQgdXAuJyxcbiAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAuLi5ub2RlUmVmZXJlbmNlU2hhcGUsXG4gICAgICAgIGRlZmF1bHRDbGlwOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ05hbWUgb2YgdGhlIGNsaXAgdG8gdXNlIGFzIGRlZmF1bHRDbGlwLiBNdXN0IGFscmVhZHkgYmUgcmVnaXN0ZXJlZCBpbiB0aGUgY29tcG9uZW50XFwncyBjbGlwcyBhcnJheS4nKSxcbiAgICAgICAgcGxheU9uTG9hZDogei5ib29sZWFuKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnV2hldGhlciB0aGUgY29tcG9uZW50IHN0YXJ0cyB0aGUgZGVmYXVsdENsaXAgd2hlbiB0aGUgc2NlbmUgbG9hZHMuJyksXG4gICAgfSksXG4gICAgaGFuZGxlcjogYXN5bmMgKGFyZ3MpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4gPT4ge1xuICAgICAgICBpZiAoYXJncy5kZWZhdWx0Q2xpcCA9PT0gdW5kZWZpbmVkICYmIGFyZ3MucGxheU9uTG9hZCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgIGVycm9yOiAnYW5pbWF0aW9uX3NldF9jbGlwOiBwcm92aWRlIGF0IGxlYXN0IG9uZSBvZiBkZWZhdWx0Q2xpcCAvIHBsYXlPbkxvYWQnLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCByZXNvbHZlZCA9IGF3YWl0IHJlc29sdmVPclRvb2xFcnJvcihhcmdzKTtcbiAgICAgICAgaWYgKCdyZXNwb25zZScgaW4gcmVzb2x2ZWQpIHJldHVybiByZXNvbHZlZC5yZXNwb25zZTtcbiAgICAgICAgY29uc3QgdXVpZCA9IHJlc29sdmVkLnV1aWQ7XG5cbiAgICAgICAgLy8gU3RlcCAxOiBzY2VuZS1zY3JpcHQgcmVzb2x2ZXMgY29tcG9uZW50IGluZGV4ICsgY2xpcCB1dWlkIChpZlxuICAgICAgICAvLyBkZWZhdWx0Q2xpcCBpcyBzZXQpLiBCdW5kbGVkIGluIG9uZSBjYWxsIHNvIGZhaWx1cmVzIChubyBhbmltXG4gICAgICAgIC8vIGNvbXBvbmVudCwgdW5rbm93biBjbGlwKSBidWJibGUgYmFjayBiZWZvcmUgYW55IHNldC1wcm9wZXJ0eS5cbiAgICAgICAgY29uc3QgbG9va3VwID0gYXdhaXQgcnVuU2NlbmVNZXRob2Q8YW55PihcbiAgICAgICAgICAgICdxdWVyeUFuaW1hdGlvblNldFRhcmdldHMnLFxuICAgICAgICAgICAgW3V1aWQsIGFyZ3MuZGVmYXVsdENsaXAgPz8gbnVsbF0sXG4gICAgICAgICAgICB7IGNhcHR1cmU6IGZhbHNlIH0sXG4gICAgICAgICk7XG4gICAgICAgIGlmICghbG9va3VwIHx8IGxvb2t1cC5zdWNjZXNzICE9PSB0cnVlKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgIGVycm9yOiBsb29rdXA/LmVycm9yID8/ICdxdWVyeUFuaW1hdGlvblNldFRhcmdldHMgcmV0dXJuZWQgbm8gZGF0YScsXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHsgY29tcG9uZW50SW5kZXgsIGNsaXBVdWlkIH0gPSBsb29rdXAuZGF0YSA/PyB7fTtcbiAgICAgICAgaWYgKHR5cGVvZiBjb21wb25lbnRJbmRleCAhPT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ3F1ZXJ5QW5pbWF0aW9uU2V0VGFyZ2V0cyBkaWQgbm90IHJldHVybiBjb21wb25lbnRJbmRleCcgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFN0ZXAgMjogaG9zdC1zaWRlIHNldC1wcm9wZXJ0eSB3cml0ZXMgZm9yIGVhY2ggcmVxdWVzdGVkIGZpZWxkLlxuICAgICAgICAvLyBTY2FsYXIgcGF0aHMgcGVyIExhbmRtaW5lICMxMSBwcm9wYWdhdGUgaW1tZWRpYXRlbHksIG5vIG51ZGdlLlxuICAgICAgICBjb25zdCB1cGRhdGVkOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgaWYgKGFyZ3MuZGVmYXVsdENsaXAgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3NldC1wcm9wZXJ0eScsIHtcbiAgICAgICAgICAgICAgICAgICAgdXVpZCxcbiAgICAgICAgICAgICAgICAgICAgcGF0aDogYF9fY29tcHNfXy4ke2NvbXBvbmVudEluZGV4fS5kZWZhdWx0Q2xpcGAsXG4gICAgICAgICAgICAgICAgICAgIGR1bXA6IHsgdmFsdWU6IHsgdXVpZDogY2xpcFV1aWQgfSwgdHlwZTogJ2NjLkFuaW1hdGlvbkNsaXAnIH0sXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgdXBkYXRlZC5wdXNoKCdkZWZhdWx0Q2xpcCcpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGFyZ3MucGxheU9uTG9hZCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnc2V0LXByb3BlcnR5Jywge1xuICAgICAgICAgICAgICAgICAgICB1dWlkLFxuICAgICAgICAgICAgICAgICAgICBwYXRoOiBgX19jb21wc19fLiR7Y29tcG9uZW50SW5kZXh9LnBsYXlPbkxvYWRgLFxuICAgICAgICAgICAgICAgICAgICBkdW1wOiB7IHZhbHVlOiBhcmdzLnBsYXlPbkxvYWQgPT09IHRydWUgfSxcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB1cGRhdGVkLnB1c2goJ3BsYXlPbkxvYWQnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIGxvZ2dlci5lcnJvcignW0FuaW1hdGlvblRvb2xzXSBzZXQtcHJvcGVydHkgZmFpbGVkOicsIGVycik7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgIGVycm9yOiBgc2V0LXByb3BlcnR5IGZhaWxlZCBhZnRlciBwYXJ0aWFsIHVwZGF0ZSBbJHt1cGRhdGVkLmpvaW4oJywgJyl9XTogJHtlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycil9YCxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgIG1lc3NhZ2U6IGBVcGRhdGVkICR7dXBkYXRlZC5qb2luKCcsICcpfSBvbiBjYy5BbmltYXRpb25gLFxuICAgICAgICAgICAgZGF0YTogeyBub2RlVXVpZDogdXVpZCwgY29tcG9uZW50SW5kZXgsIHVwZGF0ZWQgfSxcbiAgICAgICAgICAgIHVwZGF0ZWRQcm9wZXJ0aWVzOiB1cGRhdGVkLFxuICAgICAgICB9O1xuICAgIH0sXG59O1xuXG5leHBvcnQgY2xhc3MgQW5pbWF0aW9uVG9vbHMge1xuICAgIHByaXZhdGUgaW1wbCA9IGRlZmluZVRvb2xzKFtcbiAgICAgICAgYW5pbWF0aW9uTGlzdENsaXBzLFxuICAgICAgICBhbmltYXRpb25QbGF5LFxuICAgICAgICBhbmltYXRpb25TdG9wLFxuICAgICAgICBhbmltYXRpb25TZXRDbGlwLFxuICAgIF0pO1xuXG4gICAgZ2V0VG9vbHMoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmltcGwuZ2V0VG9vbHMoKTtcbiAgICB9XG5cbiAgICBleGVjdXRlKHRvb2xOYW1lOiBzdHJpbmcsIGFyZ3M6IGFueSkge1xuICAgICAgICByZXR1cm4gdGhpcy5pbXBsLmV4ZWN1dGUodG9vbE5hbWUsIGFyZ3MpO1xuICAgIH1cbn1cbiJdfQ==