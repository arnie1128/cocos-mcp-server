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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYW5pbWF0aW9uLXRvb2xzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL3Rvb2xzL2FuaW1hdGlvbi10b29scy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FtQkc7OztBQUdILDBDQUFrQztBQUNsQyxzREFBMkQ7QUFDM0Qsc0RBQW1GO0FBQ25GLHNEQUE2RTtBQUM3RSxvQ0FBb0M7QUFFcEMsTUFBTSxrQkFBa0IsR0FBWTtJQUNoQyxJQUFJLEVBQUUsWUFBWTtJQUNsQixXQUFXLEVBQUUsK0lBQStJO0lBQzVKLFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxtQkFDZCxpQ0FBa0IsRUFDdkI7SUFDRixPQUFPLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRSxFQUFFO1FBQ3BCLE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBQSxpQ0FBa0IsRUFBQyxJQUFJLENBQUMsQ0FBQztRQUNoRCxJQUFJLFVBQVUsSUFBSSxRQUFRO1lBQUUsT0FBTyxRQUFRLENBQUMsUUFBUSxDQUFDO1FBQ3JELE9BQU8sSUFBQSwyQ0FBNEIsRUFBQyxtQkFBbUIsRUFBRSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQzlFLENBQUM7Q0FDSixDQUFDO0FBRUYsTUFBTSxhQUFhLEdBQVk7SUFDM0IsSUFBSSxFQUFFLE1BQU07SUFDWixXQUFXLEVBQUUsc0xBQXNMO0lBQ25NLFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxpQ0FDZCxpQ0FBa0IsS0FDckIsUUFBUSxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxRQUFRLENBQUMsNEVBQTRFLENBQUMsSUFDeEg7SUFDRixPQUFPLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRSxFQUFFO1FBQ3BCLE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBQSxpQ0FBa0IsRUFBQyxJQUFJLENBQUMsQ0FBQztRQUNoRCxJQUFJLFVBQVUs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QUFDLGtCQUFrQjtZQUN4RCxJQUFJLEVBQUUsRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLGNBQWMsRUFBRSxPQUFPLEVBQUU7WUFDakQsaUJBQWlCLEVBQUUsT0FBTztTQUM3QixDQUFDO0lBQ04sQ0FBQztDQUNKLENBQUM7QUFFRixNQUFhLGNBQWM7SUFBM0I7UUFDWSxTQUFJLEdBQUcsSUFBQSwwQkFBVyxFQUFDO1lBQ3ZCLGtCQUFrQjtZQUNsQixhQUFhO1lBQ2IsYUFBYTtZQUNiLGdCQUFnQjtTQUNuQixDQUFDLENBQUM7SUFTUCxDQUFDO0lBUEcsUUFBUTtRQUNKLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztJQUNoQyxDQUFDO0lBRUQsT0FBTyxDQUFDLFFBQWdCLEVBQUUsSUFBUztRQUMvQixPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQztJQUM3QyxDQUFDO0NBQ0o7QUFmRCx3Q0FlQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogYW5pbWF0aW9uLXRvb2xzIOKAlCBkcml2ZSBgY2MuQW5pbWF0aW9uYCBmcm9tIE1DUC5cbiAqXG4gKiBGb3VyIHRvb2xzOlxuICogICAtIGFuaW1hdGlvbl9saXN0X2NsaXBzICAg4oCUIGVudW1lcmF0ZSBjbGlwcyBvbiBhIG5vZGUncyBjYy5BbmltYXRpb25cbiAqICAgLSBhbmltYXRpb25fcGxheSAgICAgICAgIOKAlCBzdGFydCBhIGNsaXAgKGRlZmF1bHQgaWYgbmFtZSBvbWl0dGVkKVxuICogICAtIGFuaW1hdGlvbl9zdG9wICAgICAgICAg4oCUIHN0b3AgdGhlIGFjdGl2ZSBjbGlwXG4gKiAgIC0gYW5pbWF0aW9uX3NldF9jbGlwICAgICDigJQgc2V0IGRlZmF1bHRDbGlwIC8gcGxheU9uTG9hZFxuICpcbiAqIEFsbCBmb3VyIGFjY2VwdCB0aGUgdjIuNC4wIGBub2RlVXVpZCB8IG5vZGVOYW1lYCBmYWxsYmFjayB2aWFcbiAqIGByZXNvbHZlT3JUb29sRXJyb3JgLiBTY2VuZS1zaWRlIGV4ZWN1dGlvbiBsaXZlcyBpblxuICogYHNvdXJjZS9zY2VuZS50czptZXRob2RzLntnZXRBbmltYXRpb25DbGlwcyxwbGF5QW5pbWF0aW9uLFxuICogc3RvcEFuaW1hdGlvbixzZXRBbmltYXRpb25Qcm9wZXJ0eX1gIHNvIGNjLiogQVBJcyBzdGF5IHdoZXJlIHRoZXlcbiAqIGxlZ2FsbHkgZXhpc3QgKGVuZ2luZSBjb250ZXh0KS5cbiAqXG4gKiBSZWZlcmVuY2U6IGNvY29zLW1jcC1leHRlbnNpb24gKFNwYXlkbylcbiAqIGBzb3VyY2UvdG9vbHMvYW5pbWF0aW9uLXRvb2xzLnRzYC4gV2UgcmV3cml0ZSB1c2luZyB0aGUgdjIuNC4wXG4gKiBkZWNsYXJhdGl2ZSBgZGVmaW5lVG9vbHNgIHBhdHRlcm4gKyBub2RlIGZhbGxiYWNrIHJhdGhlciB0aGFuIHRoZVxuICogdXBzdHJlYW0gdGhyZWUtbGF5ZXIgZGlzcGF0Y2guXG4gKi9cblxuaW1wb3J0IHR5cGUgeyBUb29sUmVzcG9uc2UgfSBmcm9tICcuLi90eXBlcyc7XG5pbXBvcnQgeyB6IH0gZnJvbSAnLi4vbGliL3NjaGVtYSc7XG5pbXBvcnQgeyBkZWZpbmVUb29scywgVG9vbERlZiB9IGZyb20gJy4uL2xpYi9kZWZpbmUtdG9vbHMnO1xuaW1wb3J0IHsgcnVuU2NlbmVNZXRob2QsIHJ1blNjZW5lTWV0aG9kQXNUb29sUmVzcG9uc2UgfSBmcm9tICcuLi9saWIvc2NlbmUtYnJpZGdlJztcbmltcG9ydCB7IG5vZGVSZWZlcmVuY2VTaGFwZSwgcmVzb2x2ZU9yVG9vbEVycm9yIH0gZnJvbSAnLi4vbGliL3Jlc29sdmUtbm9kZSc7XG5pbXBvcnQgeyBsb2dnZXIgfSBmcm9tICcuLi9saWIvbG9nJztcblxuY29uc3QgYW5pbWF0aW9uTGlzdENsaXBzOiBUb29sRGVmID0ge1xuICAgIG5hbWU6ICdsaXN0X2NsaXBzJyxcbiAgICBkZXNjcmlwdGlvbjogJ0xpc3QgYW5pbWF0aW9uIGNsaXBzIHJlZ2lzdGVyZWQgb24gYSBub2RlXFwncyBjYy5BbmltYXRpb24gY29tcG9uZW50LiBSZXR1cm5zIGNsaXAgbmFtZXMgKyB3aGljaCBvbmUgaXMgdGhlIGRlZmF1bHRDbGlwICsgdGhlIHBsYXlPbkxvYWQgZmxhZy4nLFxuICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgIC4uLm5vZGVSZWZlcmVuY2VTaGFwZSxcbiAgICB9KSxcbiAgICBoYW5kbGVyOiBhc3luYyAoYXJncykgPT4ge1xuICAgICAgICBjb25zdCByZXNvbHZlZCA9IGF3YWl0IHJlc29sdmVPclRvb2xFcnJvcihhcmdzKTtcbiAgICAgICAgaWYgKCdyZXNwb25zZScgaW4gcmVzb2x2ZWQpIHJldHVybiByZXNvbHZlZC5yZXNwb25zZTtcbiAgICAgICAgcmV0dXJuIHJ1blNjZW5lTWV0aG9kQXNUb29sUmVzcG9uc2UoJ2dldEFuaW1hdGlvbkNsaXBzJywgW3Jlc29sdmVkLnV1aWRdKTtcbiAgICB9LFxufTtcblxuY29uc3QgYW5pbWF0aW9uUGxheTogVG9vbERlZiA9IHtcbiAgICBuYW1lOiAncGxheScsXG4gICAgZGVzY3JpcHRpb246ICdQbGF5IGFuIGFuaW1hdGlvbiBjbGlwIG9uIGEgbm9kZVxcJ3MgY2MuQW5pbWF0aW9uIGNvbXBvbmVudC4gT21pdHMgY2xpcE5hbWUg4oaSIHBsYXlzIHRoZSBjb25maWd1cmVkIGRlZmF1bHRDbGlwLiBSZXR1cm5zIHN1Y2Nlc3MgZXZlbiB3aGVuIHRoZSBjbGlwIHdhcyBhbHJlYWR5IHBsYXlpbmcgKGNvY29zIG5vLW9wKS4nLFxuICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgIC4uLm5vZGVSZWZlcmVuY2VTaGFwZSxcbiAgICAgICAgY2xpcE5hbWU6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnQ2xpcCBuYW1lIHJlZ2lzdGVyZWQgb24gdGhlIEFuaW1hdGlvbiBjb21wb25lbnQuIE9taXQgdG8gcGxheSBkZWZhdWx0Q2xpcC4nKSxcbiAgICB9KSxcbiAgICBoYW5kbGVyOiBhc3luYyAoYXJncykgPT4ge1xuICAgICAgICBjb25zdCByZXNvbHZlZCA9IGF3YWl0IHJlc29sdmVPclRvb2xFcnJvcihhcmdzKTtcbiAgICAgICAgaWYgKCdyZXNwb25zZScgaW4gcmVzb2x2ZWQpIHJldHVybiByZXNvbHZlZC5yZXNwb25zZTtcbiAgICAgICAgcmV0dXJuIHJ1blNjZW5lTWV0aG9kQXNUb29sUmVzcG9uc2UoJ3BsYXlBbmltYXRpb24nLCBbcmVzb2x2ZWQudXVpZCwgYXJncy5jbGlwTmFtZV0pO1xuICAgIH0sXG59O1xuXG5jb25zdCBhbmltYXRpb25TdG9wOiBUb29sRGVmID0ge1xuICAgIG5hbWU6ICdzdG9wJyxcbiAgICBkZXNjcmlwdGlvbjogJ1N0b3AgdGhlIGN1cnJlbnRseSBwbGF5aW5nIGFuaW1hdGlvbiBvbiBhIG5vZGVcXCdzIGNjLkFuaW1hdGlvbiBjb21wb25lbnQuIE5vLW9wIGlmIG5vdGhpbmcgaXMgcGxheWluZy4nLFxuICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgIC4uLm5vZGVSZWZlcmVuY2VTaGFwZSxcbiAgICB9KSxcbiAgICBoYW5kbGVyOiBhc3luYyAoYXJncykgPT4ge1xuICAgICAgICBjb25zdCByZXNvbHZlZCA9IGF3YWl0IHJlc29sdmVPclRvb2xFcnJvcihhcmdzKTtcbiAgICAgICAgaWYgKCdyZXNwb25zZScgaW4gcmVzb2x2ZWQpIHJldHVybiByZXNvbHZlZC5yZXNwb25zZTtcbiAgICAgICAgcmV0dXJuIHJ1blNjZW5lTWV0aG9kQXNUb29sUmVzcG9uc2UoJ3N0b3BBbmltYXRpb24nLCBbcmVzb2x2ZWQudXVpZF0pO1xuICAgIH0sXG59O1xuXG5jb25zdCBhbmltYXRpb25TZXRDbGlwOiBUb29sRGVmID0ge1xuICAgIG5hbWU6ICdzZXRfY2xpcCcsXG4gICAgZGVzY3JpcHRpb246ICdDb25maWd1cmUgYSBub2RlXFwncyBjYy5BbmltYXRpb246IGRlZmF1bHRDbGlwIG5hbWUgYW5kL29yIHBsYXlPbkxvYWQuIEJvdGggZmllbGRzIG9wdGlvbmFsIOKAlCBvbmx5IHRoZSBvbmVzIHlvdSBwYXNzIGdldCB3cml0dGVuLiBQZXJzaXN0cyB2aWEgdGhlIGVkaXRvciBzZXQtcHJvcGVydHkgY2hhbm5lbCAoTGFuZG1pbmUgIzExIHNjYWxhciBwYXRoKSBzbyBzYXZlX3NjZW5lIHBpY2tzIGl0IHVwLicsXG4gICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgLi4ubm9kZVJlZmVyZW5jZVNoYXBlLFxuICAgICAgICBkZWZhdWx0Q2xpcDogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdOYW1lIG9mIHRoZSBjbGlwIHRvIHVzZSBhcyBkZWZhdWx0Q2xpcC4gTXVzdCBhbHJlYWR5IGJlIHJlZ2lzdGVyZWQgaW4gdGhlIGNvbXBvbmVudFxcJ3MgY2xpcHMgYXJyYXkuJyksXG4gICAgICAgIHBsYXlPbkxvYWQ6IHouYm9vbGVhbigpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1doZXRoZXIgdGhlIGNvbXBvbmVudCBzdGFydHMgdGhlIGRlZmF1bHRDbGlwIHdoZW4gdGhlIHNjZW5lIGxvYWRzLicpLFxuICAgIH0pLFxuICAgIGhhbmRsZXI6IGFzeW5jIChhcmdzKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+ID0+IHtcbiAgICAgICAgaWYgKGFyZ3MuZGVmYXVsdENsaXAgPT09IHVuZGVmaW5lZCAmJiBhcmdzLnBsYXlPbkxvYWQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBlcnJvcjogJ2FuaW1hdGlvbl9zZXRfY2xpcDogcHJvdmlkZSBhdCBsZWFzdCBvbmUgb2YgZGVmYXVsdENsaXAgLyBwbGF5T25Mb2FkJyxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcmVzb2x2ZWQgPSBhd2FpdCByZXNvbHZlT3JUb29sRXJyb3IoYXJncyk7XG4gICAgICAgIGlmICgncmVzcG9uc2UnIGluIHJlc29sdmVkKSByZXR1cm4gcmVzb2x2ZWQucmVzcG9uc2U7XG4gICAgICAgIGNvbnN0IHV1aWQgPSByZXNvbHZlZC51dWlkO1xuXG4gICAgICAgIC8vIFN0ZXAgMTogc2NlbmUtc2NyaXB0IHJlc29sdmVzIGNvbXBvbmVudCBpbmRleCArIGNsaXAgdXVpZCAoaWZcbiAgICAgICAgLy8gZGVmYXVsdENsaXAgaXMgc2V0KS4gQnVuZGxlZCBpbiBvbmUgY2FsbCBzbyBmYWlsdXJlcyAobm8gYW5pbVxuICAgICAgICAvLyBjb21wb25lbnQsIHVua25vd24gY2xpcCkgYnViYmxlIGJhY2sgYmVmb3JlIGFueSBzZXQtcHJvcGVydHkuXG4gICAgICAgIGNvbnN0IGxvb2t1cCA9IGF3YWl0IHJ1blNjZW5lTWV0aG9kPGFueT4oXG4gICAgICAgICAgICAncXVlcnlBbmltYXRpb25TZXRUYXJnZXRzJyxcbiAgICAgICAgICAgIFt1dWlkLCBhcmdzLmRlZmF1bHRDbGlwID8/IG51bGxdLFxuICAgICAgICAgICAgeyBjYXB0dXJlOiBmYWxzZSB9LFxuICAgICAgICApO1xuICAgICAgICBpZiAoIWxvb2t1cCB8fCBsb29rdXAuc3VjY2VzcyAhPT0gdHJ1ZSkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBlcnJvcjogbG9va3VwPy5lcnJvciA/PyAncXVlcnlBbmltYXRpb25TZXRUYXJnZXRzIHJldHVybmVkIG5vIGRhdGEnLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCB7IGNvbXBvbmVudEluZGV4LCBjbGlwVXVpZCB9ID0gbG9va3VwLmRhdGEgPz8ge307XG4gICAgICAgIGlmICh0eXBlb2YgY29tcG9uZW50SW5kZXggIT09ICdudW1iZXInKSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdxdWVyeUFuaW1hdGlvblNldFRhcmdldHMgZGlkIG5vdCByZXR1cm4gY29tcG9uZW50SW5kZXgnIH07XG4gICAgICAgIH1cblxuICAgICAgICAvLyBTdGVwIDI6IGhvc3Qtc2lkZSBzZXQtcHJvcGVydHkgd3JpdGVzIGZvciBlYWNoIHJlcXVlc3RlZCBmaWVsZC5cbiAgICAgICAgLy8gU2NhbGFyIHBhdGhzIHBlciBMYW5kbWluZSAjMTEgcHJvcGFnYXRlIGltbWVkaWF0ZWx5LCBubyBudWRnZS5cbiAgICAgICAgY29uc3QgdXBkYXRlZDogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGlmIChhcmdzLmRlZmF1bHRDbGlwICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdzZXQtcHJvcGVydHknLCB7XG4gICAgICAgICAgICAgICAgICAgIHV1aWQsXG4gICAgICAgICAgICAgICAgICAgIHBhdGg6IGBfX2NvbXBzX18uJHtjb21wb25lbnRJbmRleH0uZGVmYXVsdENsaXBgLFxuICAgICAgICAgICAgICAgICAgICBkdW1wOiB7IHZhbHVlOiB7IHV1aWQ6IGNsaXBVdWlkIH0sIHR5cGU6ICdjYy5BbmltYXRpb25DbGlwJyB9LFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHVwZGF0ZWQucHVzaCgnZGVmYXVsdENsaXAnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChhcmdzLnBsYXlPbkxvYWQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3NldC1wcm9wZXJ0eScsIHtcbiAgICAgICAgICAgICAgICAgICAgdXVpZCxcbiAgICAgICAgICAgICAgICAgICAgcGF0aDogYF9fY29tcHNfXy4ke2NvbXBvbmVudEluZGV4fS5wbGF5T25Mb2FkYCxcbiAgICAgICAgICAgICAgICAgICAgZHVtcDogeyB2YWx1ZTogYXJncy5wbGF5T25Mb2FkID09PSB0cnVlIH0sXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgdXBkYXRlZC5wdXNoKCdwbGF5T25Mb2FkJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICBsb2dnZXIuZXJyb3IoJ1tBbmltYXRpb25Ub29sc10gc2V0LXByb3BlcnR5IGZhaWxlZDonLCBlcnIpO1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBlcnJvcjogYHNldC1wcm9wZXJ0eSBmYWlsZWQgYWZ0ZXIgcGFydGlhbCB1cGRhdGUgWyR7dXBkYXRlZC5qb2luKCcsICcpfV06ICR7ZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpfWAsXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICBtZXNzYWdlOiBgVXBkYXRlZCAke3VwZGF0ZWQuam9pbignLCAnKX0gb24gY2MuQW5pbWF0aW9uYCxcbiAgICAgICAgICAgIGRhdGE6IHsgbm9kZVV1aWQ6IHV1aWQsIGNvbXBvbmVudEluZGV4LCB1cGRhdGVkIH0sXG4gICAgICAgICAgICB1cGRhdGVkUHJvcGVydGllczogdXBkYXRlZCxcbiAgICAgICAgfTtcbiAgICB9LFxufTtcblxuZXhwb3J0IGNsYXNzIEFuaW1hdGlvblRvb2xzIHtcbiAgICBwcml2YXRlIGltcGwgPSBkZWZpbmVUb29scyhbXG4gICAgICAgIGFuaW1hdGlvbkxpc3RDbGlwcyxcbiAgICAgICAgYW5pbWF0aW9uUGxheSxcbiAgICAgICAgYW5pbWF0aW9uU3RvcCxcbiAgICAgICAgYW5pbWF0aW9uU2V0Q2xpcCxcbiAgICBdKTtcblxuICAgIGdldFRvb2xzKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5pbXBsLmdldFRvb2xzKCk7XG4gICAgfVxuXG4gICAgZXhlY3V0ZSh0b29sTmFtZTogc3RyaW5nLCBhcmdzOiBhbnkpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuaW1wbC5leGVjdXRlKHRvb2xOYW1lLCBhcmdzKTtcbiAgICB9XG59XG4iXX0=