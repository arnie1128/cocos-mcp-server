"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnimationTools = void 0;
const response_1 = require("../lib/response");
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
            return (0, response_1.fail)('animation_set_clip: provide at least one of defaultClip / playOnLoad');
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
            return (0, response_1.fail)((_b = lookup === null || lookup === void 0 ? void 0 : lookup.error) !== null && _b !== void 0 ? _b : 'queryAnimationSetTargets returned no data');
        }
        const { componentIndex, clipUuid } = (_c = lookup.data) !== null && _c !== void 0 ? _c : {};
        if (typeof componentIndex !== 'number') {
            return (0, response_1.fail)('queryAnimationSetTargets did not return componentIndex');
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
            return (0, response_1.fail)(`set-property failed after partial update [${updated.join(', ')}]: ${(_d = err === null || err === void 0 ? void 0 : err.message) !== null && _d !== void 0 ? _d : String(err)}`);
        }
        return {
            success: true,
            message: `Updated ${updated.join(', ')} on cc.Animation`,
            data: { nodeUuid: uuid, componentIndex, updated },
            updatedProperties: updated,
        };
    },
};
const animationListStates = {
    name: 'list_animation_states',
    title: 'List animation states',
    description: 'List cc.AnimationState entries on a node\'s cc.Animation component.',
    inputSchema: schema_1.z.object({
        nodeUuid: schema_1.z.string().describe('UUID of the node with the cc.Animation component.'),
    }),
    handler: async (args) => {
        return (0, scene_bridge_1.runSceneMethodAsToolResponse)('listAnimationStates', [args.nodeUuid]);
    },
};
const animationGetStateInfo = {
    name: 'get_animation_state_info',
    title: 'Get animation state info',
    description: 'Get speed and timing info for a named cc.AnimationState.',
    inputSchema: schema_1.z.object({
        nodeUuid: schema_1.z.string().describe('UUID of the node with the cc.Animation component.'),
        stateName: schema_1.z.string().describe('Animation state name.'),
    }),
    handler: async (args) => {
        return (0, scene_bridge_1.runSceneMethodAsToolResponse)('getAnimationStateInfo', [args.nodeUuid, args.stateName]);
    },
};
const animationSetSpeed = {
    name: 'set_animation_speed',
    title: 'Set animation speed',
    description: 'Set speed on a named cc.AnimationState.',
    inputSchema: schema_1.z.object({
        nodeUuid: schema_1.z.string().describe('UUID of the node with the cc.Animation component.'),
        stateName: schema_1.z.string().describe('Animation state name.'),
        speed: schema_1.z.number().describe('New AnimationState.speed value.'),
    }),
    handler: async (args) => {
        return (0, scene_bridge_1.runSceneMethodAsToolResponse)('setAnimationSpeed', [args.nodeUuid, args.stateName, args.speed]);
    },
};
const animationCheckFinished = {
    name: 'check_animation_finished',
    title: 'Check animation finished',
    description: 'Check whether a named cc.AnimationState has reached its end time.',
    inputSchema: schema_1.z.object({
        nodeUuid: schema_1.z.string().describe('UUID of the node with the cc.Animation component.'),
        stateName: schema_1.z.string().describe('Animation state name.'),
    }),
    handler: async (args) => {
        return (0, scene_bridge_1.runSceneMethodAsToolResponse)('checkAnimationFinished', [args.nodeUuid, args.stateName]);
    },
};
class AnimationTools {
    constructor() {
        this.impl = (0, define_tools_1.defineTools)([
            animationCheckFinished,
            animationGetStateInfo,
            animationListClips,
            animationListStates,
            animationPlay,
            animationSetSpeed,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYW5pbWF0aW9uLXRvb2xzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL3Rvb2xzL2FuaW1hdGlvbi10b29scy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSw4Q0FBMkM7QUF1QjNDLDBDQUFrQztBQUNsQyxzREFBMkQ7QUFDM0Qsc0RBQW1GO0FBQ25GLHNEQUE2RTtBQUM3RSxvQ0FBb0M7QUFFcEMsTUFBTSxrQkFBa0IsR0FBWTtJQUNoQyxJQUFJLEVBQUUsWUFBWTtJQUNsQixLQUFLLEVBQUUsc0JBQXNCO0lBQzdCLFdBQVcsRUFBRSwrSUFBK0k7SUFDNUosV0FBVyxFQUFFLFVBQUMsQ0FBQyxNQUFNLG1CQUNkLGlDQUFrQixFQUN2QjtJQUNGLE9BQU8sRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFLEVBQUU7UUFDcEIsTUFBTSxRQUFRLEdBQUcsTUFBTSxJQUFBLGlDQUFrQixFQUFDLElBQUksQ0FBQyxDQUFDO1FBQ2hELElBQUksVUFBVSxJQUFJLFFBQVE7WUFBRSxPQUFPLFFBQVEsQ0FBQyxRQUFRLENBQUM7UUFDckQsT0FBTyxJQUFBLDJDQUE0QixFQUFDLG1CQUFtQixFQUFFLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7SUFDOUUsQ0FBQztDQUNKLENBQUM7QUFFRixNQUFNLGFBQWEsR0FBWTtJQUMzQixJQUFJLEVBQUUsTUFBTTtJQUNaLEtBQUssRUFBRSxxQkFBcUI7SUFDNUIsV0FBVyxFQUFFLHNMQUFzTDtJQUNuTSxXQUFXLEVBQUUsVUFBQyxDQUFDLE1BQU0saUNBQ2QsaUNBQWtCLEtBQ3JCLFFBQVEsRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxFQUFFLENBQUMsUUFBUSxDQUFDLDRFQUE0RSxDQUFDLElBQ3hIO0lBQ0YsT0FBTyxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsRUFBRTtRQUNwQixNQUFNLFFBQVEsR0FBRyxNQUFNLElBQUEsaUNBQWtCLEVBQUMs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RixNQUFhLGNBQWM7SUFBM0I7UUFDWSxTQUFJLEdBQUcsSUFBQSwwQkFBVyxFQUFDO1lBQ3ZCLHNCQUFzQjtZQUN0QixxQkFBcUI7WUFDckIsa0JBQWtCO1lBQ2xCLG1CQUFtQjtZQUNuQixhQUFhO1lBQ2IsaUJBQWlCO1lBQ2pCLGFBQWE7WUFDYixnQkFBZ0I7U0FDbkIsQ0FBQyxDQUFDO0lBU1AsQ0FBQztJQVBHLFFBQVE7UUFDSixPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7SUFDaEMsQ0FBQztJQUVELE9BQU8sQ0FBQyxRQUFnQixFQUFFLElBQVM7UUFDL0IsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDN0MsQ0FBQztDQUNKO0FBbkJELHdDQW1CQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IG9rLCBmYWlsIH0gZnJvbSAnLi4vbGliL3Jlc3BvbnNlJztcbi8qKlxuICogYW5pbWF0aW9uLXRvb2xzIOKAlCBkcml2ZSBgY2MuQW5pbWF0aW9uYCBmcm9tIE1DUC5cbiAqXG4gKiBGb3VyIHRvb2xzOlxuICogICAtIGFuaW1hdGlvbl9saXN0X2NsaXBzICAg4oCUIGVudW1lcmF0ZSBjbGlwcyBvbiBhIG5vZGUncyBjYy5BbmltYXRpb25cbiAqICAgLSBhbmltYXRpb25fcGxheSAgICAgICAgIOKAlCBzdGFydCBhIGNsaXAgKGRlZmF1bHQgaWYgbmFtZSBvbWl0dGVkKVxuICogICAtIGFuaW1hdGlvbl9zdG9wICAgICAgICAg4oCUIHN0b3AgdGhlIGFjdGl2ZSBjbGlwXG4gKiAgIC0gYW5pbWF0aW9uX3NldF9jbGlwICAgICDigJQgc2V0IGRlZmF1bHRDbGlwIC8gcGxheU9uTG9hZFxuICpcbiAqIEFsbCBmb3VyIGFjY2VwdCB0aGUgdjIuNC4wIGBub2RlVXVpZCB8IG5vZGVOYW1lYCBmYWxsYmFjayB2aWFcbiAqIGByZXNvbHZlT3JUb29sRXJyb3JgLiBTY2VuZS1zaWRlIGV4ZWN1dGlvbiBsaXZlcyBpblxuICogYHNvdXJjZS9zY2VuZS50czptZXRob2RzLntnZXRBbmltYXRpb25DbGlwcyxwbGF5QW5pbWF0aW9uLFxuICogc3RvcEFuaW1hdGlvbixzZXRBbmltYXRpb25Qcm9wZXJ0eX1gIHNvIGNjLiogQVBJcyBzdGF5IHdoZXJlIHRoZXlcbiAqIGxlZ2FsbHkgZXhpc3QgKGVuZ2luZSBjb250ZXh0KS5cbiAqXG4gKiBSZWZlcmVuY2U6IGNvY29zLW1jcC1leHRlbnNpb24gKFNwYXlkbylcbiAqIGBzb3VyY2UvdG9vbHMvYW5pbWF0aW9uLXRvb2xzLnRzYC4gV2UgcmV3cml0ZSB1c2luZyB0aGUgdjIuNC4wXG4gKiBkZWNsYXJhdGl2ZSBgZGVmaW5lVG9vbHNgIHBhdHRlcm4gKyBub2RlIGZhbGxiYWNrIHJhdGhlciB0aGFuIHRoZVxuICogdXBzdHJlYW0gdGhyZWUtbGF5ZXIgZGlzcGF0Y2guXG4gKi9cblxuaW1wb3J0IHR5cGUgeyBUb29sUmVzcG9uc2UgfSBmcm9tICcuLi90eXBlcyc7XG5pbXBvcnQgeyB6IH0gZnJvbSAnLi4vbGliL3NjaGVtYSc7XG5pbXBvcnQgeyBkZWZpbmVUb29scywgVG9vbERlZiB9IGZyb20gJy4uL2xpYi9kZWZpbmUtdG9vbHMnO1xuaW1wb3J0IHsgcnVuU2NlbmVNZXRob2QsIHJ1blNjZW5lTWV0aG9kQXNUb29sUmVzcG9uc2UgfSBmcm9tICcuLi9saWIvc2NlbmUtYnJpZGdlJztcbmltcG9ydCB7IG5vZGVSZWZlcmVuY2VTaGFwZSwgcmVzb2x2ZU9yVG9vbEVycm9yIH0gZnJvbSAnLi4vbGliL3Jlc29sdmUtbm9kZSc7XG5pbXBvcnQgeyBsb2dnZXIgfSBmcm9tICcuLi9saWIvbG9nJztcblxuY29uc3QgYW5pbWF0aW9uTGlzdENsaXBzOiBUb29sRGVmID0ge1xuICAgIG5hbWU6ICdsaXN0X2NsaXBzJyxcbiAgICB0aXRsZTogJ0xpc3QgYW5pbWF0aW9uIGNsaXBzJyxcbiAgICBkZXNjcmlwdGlvbjogJ0xpc3QgYW5pbWF0aW9uIGNsaXBzIHJlZ2lzdGVyZWQgb24gYSBub2RlXFwncyBjYy5BbmltYXRpb24gY29tcG9uZW50LiBSZXR1cm5zIGNsaXAgbmFtZXMgKyB3aGljaCBvbmUgaXMgdGhlIGRlZmF1bHRDbGlwICsgdGhlIHBsYXlPbkxvYWQgZmxhZy4nLFxuICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgIC4uLm5vZGVSZWZlcmVuY2VTaGFwZSxcbiAgICB9KSxcbiAgICBoYW5kbGVyOiBhc3luYyAoYXJncykgPT4ge1xuICAgICAgICBjb25zdCByZXNvbHZlZCA9IGF3YWl0IHJlc29sdmVPclRvb2xFcnJvcihhcmdzKTtcbiAgICAgICAgaWYgKCdyZXNwb25zZScgaW4gcmVzb2x2ZWQpIHJldHVybiByZXNvbHZlZC5yZXNwb25zZTtcbiAgICAgICAgcmV0dXJuIHJ1blNjZW5lTWV0aG9kQXNUb29sUmVzcG9uc2UoJ2dldEFuaW1hdGlvbkNsaXBzJywgW3Jlc29sdmVkLnV1aWRdKTtcbiAgICB9LFxufTtcblxuY29uc3QgYW5pbWF0aW9uUGxheTogVG9vbERlZiA9IHtcbiAgICBuYW1lOiAncGxheScsXG4gICAgdGl0bGU6ICdQbGF5IGFuaW1hdGlvbiBjbGlwJyxcbiAgICBkZXNjcmlwdGlvbjogJ1BsYXkgYW4gYW5pbWF0aW9uIGNsaXAgb24gYSBub2RlXFwncyBjYy5BbmltYXRpb24gY29tcG9uZW50LiBPbWl0cyBjbGlwTmFtZSDihpIgcGxheXMgdGhlIGNvbmZpZ3VyZWQgZGVmYXVsdENsaXAuIFJldHVybnMgc3VjY2VzcyBldmVuIHdoZW4gdGhlIGNsaXAgd2FzIGFscmVhZHkgcGxheWluZyAoY29jb3Mgbm8tb3ApLicsXG4gICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgLi4ubm9kZVJlZmVyZW5jZVNoYXBlLFxuICAgICAgICBjbGlwTmFtZTogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdDbGlwIG5hbWUgcmVnaXN0ZXJlZCBvbiB0aGUgQW5pbWF0aW9uIGNvbXBvbmVudC4gT21pdCB0byBwbGF5IGRlZmF1bHRDbGlwLicpLFxuICAgIH0pLFxuICAgIGhhbmRsZXI6IGFzeW5jIChhcmdzKSA9PiB7XG4gICAgICAgIGNvbnN0IHJlc29sdmVkID0gYXdhaXQgcmVzb2x2ZU9yVG9vbEVycm9yKGFyZ3MpO1xuICAgICAgICBpZiAoJ3Jlc3BvbnNlJyBpbiByZXNvbHZlZCkgcmV0dXJuIHJlc29sdmVkLnJlc3BvbnNlO1xuICAgICAgICByZXR1cm4gcnVuU2NlbmVNZXRob2RBc1Rvb2xSZXNwb25zZSgncGxheUFuaW1hdGlvbicsIFtyZXNvbHZlZC51dWlkLCBhcmdzLmNsaXBOYW1lXSk7XG4gICAgfSxcbn07XG5cbmNvbnN0IGFuaW1hdGlvblN0b3A6IFRvb2xEZWYgPSB7XG4gICAgbmFtZTogJ3N0b3AnLFxuICAgIHRpdGxlOiAnU3RvcCBhbmltYXRpb24nLFxuICAgIGRlc2NyaXB0aW9uOiAnU3RvcCB0aGUgY3VycmVudGx5IHBsYXlpbmcgYW5pbWF0aW9uIG9uIGEgbm9kZVxcJ3MgY2MuQW5pbWF0aW9uIGNvbXBvbmVudC4gTm8tb3AgaWYgbm90aGluZyBpcyBwbGF5aW5nLicsXG4gICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgLi4ubm9kZVJlZmVyZW5jZVNoYXBlLFxuICAgIH0pLFxuICAgIGhhbmRsZXI6IGFzeW5jIChhcmdzKSA9PiB7XG4gICAgICAgIGNvbnN0IHJlc29sdmVkID0gYXdhaXQgcmVzb2x2ZU9yVG9vbEVycm9yKGFyZ3MpO1xuICAgICAgICBpZiAoJ3Jlc3BvbnNlJyBpbiByZXNvbHZlZCkgcmV0dXJuIHJlc29sdmVkLnJlc3BvbnNlO1xuICAgICAgICByZXR1cm4gcnVuU2NlbmVNZXRob2RBc1Rvb2xSZXNwb25zZSgnc3RvcEFuaW1hdGlvbicsIFtyZXNvbHZlZC51dWlkXSk7XG4gICAgfSxcbn07XG5cbmNvbnN0IGFuaW1hdGlvblNldENsaXA6IFRvb2xEZWYgPSB7XG4gICAgbmFtZTogJ3NldF9jbGlwJyxcbiAgICB0aXRsZTogJ0NvbmZpZ3VyZSBhbmltYXRpb24gY2xpcCcsXG4gICAgZGVzY3JpcHRpb246ICdDb25maWd1cmUgYSBub2RlXFwncyBjYy5BbmltYXRpb246IGRlZmF1bHRDbGlwIG5hbWUgYW5kL29yIHBsYXlPbkxvYWQuIEJvdGggZmllbGRzIG9wdGlvbmFsIOKAlCBvbmx5IHRoZSBvbmVzIHlvdSBwYXNzIGdldCB3cml0dGVuLiBQZXJzaXN0cyB2aWEgdGhlIGVkaXRvciBzZXQtcHJvcGVydHkgY2hhbm5lbCAoTGFuZG1pbmUgIzExIHNjYWxhciBwYXRoKSBzbyBzYXZlX3NjZW5lIHBpY2tzIGl0IHVwLicsXG4gICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgLi4ubm9kZVJlZmVyZW5jZVNoYXBlLFxuICAgICAgICBkZWZhdWx0Q2xpcDogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdOYW1lIG9mIHRoZSBjbGlwIHRvIHVzZSBhcyBkZWZhdWx0Q2xpcC4gTXVzdCBhbHJlYWR5IGJlIHJlZ2lzdGVyZWQgaW4gdGhlIGNvbXBvbmVudFxcJ3MgY2xpcHMgYXJyYXkuJyksXG4gICAgICAgIHBsYXlPbkxvYWQ6IHouYm9vbGVhbigpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1doZXRoZXIgdGhlIGNvbXBvbmVudCBzdGFydHMgdGhlIGRlZmF1bHRDbGlwIHdoZW4gdGhlIHNjZW5lIGxvYWRzLicpLFxuICAgIH0pLFxuICAgIGhhbmRsZXI6IGFzeW5jIChhcmdzKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+ID0+IHtcbiAgICAgICAgaWYgKGFyZ3MuZGVmYXVsdENsaXAgPT09IHVuZGVmaW5lZCAmJiBhcmdzLnBsYXlPbkxvYWQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ2FuaW1hdGlvbl9zZXRfY2xpcDogcHJvdmlkZSBhdCBsZWFzdCBvbmUgb2YgZGVmYXVsdENsaXAgLyBwbGF5T25Mb2FkJyk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcmVzb2x2ZWQgPSBhd2FpdCByZXNvbHZlT3JUb29sRXJyb3IoYXJncyk7XG4gICAgICAgIGlmICgncmVzcG9uc2UnIGluIHJlc29sdmVkKSByZXR1cm4gcmVzb2x2ZWQucmVzcG9uc2U7XG4gICAgICAgIGNvbnN0IHV1aWQgPSByZXNvbHZlZC51dWlkO1xuXG4gICAgICAgIC8vIFN0ZXAgMTogc2NlbmUtc2NyaXB0IHJlc29sdmVzIGNvbXBvbmVudCBpbmRleCArIGNsaXAgdXVpZCAoaWZcbiAgICAgICAgLy8gZGVmYXVsdENsaXAgaXMgc2V0KS4gQnVuZGxlZCBpbiBvbmUgY2FsbCBzbyBmYWlsdXJlcyAobm8gYW5pbVxuICAgICAgICAvLyBjb21wb25lbnQsIHVua25vd24gY2xpcCkgYnViYmxlIGJhY2sgYmVmb3JlIGFueSBzZXQtcHJvcGVydHkuXG4gICAgICAgIGNvbnN0IGxvb2t1cCA9IGF3YWl0IHJ1blNjZW5lTWV0aG9kPGFueT4oXG4gICAgICAgICAgICAncXVlcnlBbmltYXRpb25TZXRUYXJnZXRzJyxcbiAgICAgICAgICAgIFt1dWlkLCBhcmdzLmRlZmF1bHRDbGlwID8/IG51bGxdLFxuICAgICAgICAgICAgeyBjYXB0dXJlOiBmYWxzZSB9LFxuICAgICAgICApO1xuICAgICAgICBpZiAoIWxvb2t1cCB8fCBsb29rdXAuc3VjY2VzcyAhPT0gdHJ1ZSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwobG9va3VwPy5lcnJvciA/PyAncXVlcnlBbmltYXRpb25TZXRUYXJnZXRzIHJldHVybmVkIG5vIGRhdGEnKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCB7IGNvbXBvbmVudEluZGV4LCBjbGlwVXVpZCB9ID0gbG9va3VwLmRhdGEgPz8ge307XG4gICAgICAgIGlmICh0eXBlb2YgY29tcG9uZW50SW5kZXggIT09ICdudW1iZXInKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbCgncXVlcnlBbmltYXRpb25TZXRUYXJnZXRzIGRpZCBub3QgcmV0dXJuIGNvbXBvbmVudEluZGV4Jyk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBTdGVwIDI6IGhvc3Qtc2lkZSBzZXQtcHJvcGVydHkgd3JpdGVzIGZvciBlYWNoIHJlcXVlc3RlZCBmaWVsZC5cbiAgICAgICAgLy8gU2NhbGFyIHBhdGhzIHBlciBMYW5kbWluZSAjMTEgcHJvcGFnYXRlIGltbWVkaWF0ZWx5LCBubyBudWRnZS5cbiAgICAgICAgY29uc3QgdXBkYXRlZDogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGlmIChhcmdzLmRlZmF1bHRDbGlwICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdzZXQtcHJvcGVydHknLCB7XG4gICAgICAgICAgICAgICAgICAgIHV1aWQsXG4gICAgICAgICAgICAgICAgICAgIHBhdGg6IGBfX2NvbXBzX18uJHtjb21wb25lbnRJbmRleH0uZGVmYXVsdENsaXBgLFxuICAgICAgICAgICAgICAgICAgICBkdW1wOiB7IHZhbHVlOiB7IHV1aWQ6IGNsaXBVdWlkIH0sIHR5cGU6ICdjYy5BbmltYXRpb25DbGlwJyB9LFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHVwZGF0ZWQucHVzaCgnZGVmYXVsdENsaXAnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChhcmdzLnBsYXlPbkxvYWQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3NldC1wcm9wZXJ0eScsIHtcbiAgICAgICAgICAgICAgICAgICAgdXVpZCxcbiAgICAgICAgICAgICAgICAgICAgcGF0aDogYF9fY29tcHNfXy4ke2NvbXBvbmVudEluZGV4fS5wbGF5T25Mb2FkYCxcbiAgICAgICAgICAgICAgICAgICAgZHVtcDogeyB2YWx1ZTogYXJncy5wbGF5T25Mb2FkID09PSB0cnVlIH0sXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgdXBkYXRlZC5wdXNoKCdwbGF5T25Mb2FkJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICBsb2dnZXIuZXJyb3IoJ1tBbmltYXRpb25Ub29sc10gc2V0LXByb3BlcnR5IGZhaWxlZDonLCBlcnIpO1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoYHNldC1wcm9wZXJ0eSBmYWlsZWQgYWZ0ZXIgcGFydGlhbCB1cGRhdGUgWyR7dXBkYXRlZC5qb2luKCcsICcpfV06ICR7ZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpfWApO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICBtZXNzYWdlOiBgVXBkYXRlZCAke3VwZGF0ZWQuam9pbignLCAnKX0gb24gY2MuQW5pbWF0aW9uYCxcbiAgICAgICAgICAgIGRhdGE6IHsgbm9kZVV1aWQ6IHV1aWQsIGNvbXBvbmVudEluZGV4LCB1cGRhdGVkIH0sXG4gICAgICAgICAgICB1cGRhdGVkUHJvcGVydGllczogdXBkYXRlZCxcbiAgICAgICAgfTtcbiAgICB9LFxufTtcblxuY29uc3QgYW5pbWF0aW9uTGlzdFN0YXRlczogVG9vbERlZiA9IHtcbiAgICBuYW1lOiAnbGlzdF9hbmltYXRpb25fc3RhdGVzJyxcbiAgICB0aXRsZTogJ0xpc3QgYW5pbWF0aW9uIHN0YXRlcycsXG4gICAgZGVzY3JpcHRpb246ICdMaXN0IGNjLkFuaW1hdGlvblN0YXRlIGVudHJpZXMgb24gYSBub2RlXFwncyBjYy5BbmltYXRpb24gY29tcG9uZW50LicsXG4gICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgbm9kZVV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1VVSUQgb2YgdGhlIG5vZGUgd2l0aCB0aGUgY2MuQW5pbWF0aW9uIGNvbXBvbmVudC4nKSxcbiAgICB9KSxcbiAgICBoYW5kbGVyOiBhc3luYyAoYXJncykgPT4ge1xuICAgICAgICByZXR1cm4gcnVuU2NlbmVNZXRob2RBc1Rvb2xSZXNwb25zZSgnbGlzdEFuaW1hdGlvblN0YXRlcycsIFthcmdzLm5vZGVVdWlkXSk7XG4gICAgfSxcbn07XG5cbmNvbnN0IGFuaW1hdGlvbkdldFN0YXRlSW5mbzogVG9vbERlZiA9IHtcbiAgICBuYW1lOiAnZ2V0X2FuaW1hdGlvbl9zdGF0ZV9pbmZvJyxcbiAgICB0aXRsZTogJ0dldCBhbmltYXRpb24gc3RhdGUgaW5mbycsXG4gICAgZGVzY3JpcHRpb246ICdHZXQgc3BlZWQgYW5kIHRpbWluZyBpbmZvIGZvciBhIG5hbWVkIGNjLkFuaW1hdGlvblN0YXRlLicsXG4gICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgbm9kZVV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1VVSUQgb2YgdGhlIG5vZGUgd2l0aCB0aGUgY2MuQW5pbWF0aW9uIGNvbXBvbmVudC4nKSxcbiAgICAgICAgc3RhdGVOYW1lOiB6LnN0cmluZygpLmRlc2NyaWJlKCdBbmltYXRpb24gc3RhdGUgbmFtZS4nKSxcbiAgICB9KSxcbiAgICBoYW5kbGVyOiBhc3luYyAoYXJncykgPT4ge1xuICAgICAgICByZXR1cm4gcnVuU2NlbmVNZXRob2RBc1Rvb2xSZXNwb25zZSgnZ2V0QW5pbWF0aW9uU3RhdGVJbmZvJywgW2FyZ3Mubm9kZVV1aWQsIGFyZ3Muc3RhdGVOYW1lXSk7XG4gICAgfSxcbn07XG5cbmNvbnN0IGFuaW1hdGlvblNldFNwZWVkOiBUb29sRGVmID0ge1xuICAgIG5hbWU6ICdzZXRfYW5pbWF0aW9uX3NwZWVkJyxcbiAgICB0aXRsZTogJ1NldCBhbmltYXRpb24gc3BlZWQnLFxuICAgIGRlc2NyaXB0aW9uOiAnU2V0IHNwZWVkIG9uIGEgbmFtZWQgY2MuQW5pbWF0aW9uU3RhdGUuJyxcbiAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICBub2RlVXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnVVVJRCBvZiB0aGUgbm9kZSB3aXRoIHRoZSBjYy5BbmltYXRpb24gY29tcG9uZW50LicpLFxuICAgICAgICBzdGF0ZU5hbWU6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0FuaW1hdGlvbiBzdGF0ZSBuYW1lLicpLFxuICAgICAgICBzcGVlZDogei5udW1iZXIoKS5kZXNjcmliZSgnTmV3IEFuaW1hdGlvblN0YXRlLnNwZWVkIHZhbHVlLicpLFxuICAgIH0pLFxuICAgIGhhbmRsZXI6IGFzeW5jIChhcmdzKSA9PiB7XG4gICAgICAgIHJldHVybiBydW5TY2VuZU1ldGhvZEFzVG9vbFJlc3BvbnNlKCdzZXRBbmltYXRpb25TcGVlZCcsIFthcmdzLm5vZGVVdWlkLCBhcmdzLnN0YXRlTmFtZSwgYXJncy5zcGVlZF0pO1xuICAgIH0sXG59O1xuXG5jb25zdCBhbmltYXRpb25DaGVja0ZpbmlzaGVkOiBUb29sRGVmID0ge1xuICAgIG5hbWU6ICdjaGVja19hbmltYXRpb25fZmluaXNoZWQnLFxuICAgIHRpdGxlOiAnQ2hlY2sgYW5pbWF0aW9uIGZpbmlzaGVkJyxcbiAgICBkZXNjcmlwdGlvbjogJ0NoZWNrIHdoZXRoZXIgYSBuYW1lZCBjYy5BbmltYXRpb25TdGF0ZSBoYXMgcmVhY2hlZCBpdHMgZW5kIHRpbWUuJyxcbiAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICBub2RlVXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnVVVJRCBvZiB0aGUgbm9kZSB3aXRoIHRoZSBjYy5BbmltYXRpb24gY29tcG9uZW50LicpLFxuICAgICAgICBzdGF0ZU5hbWU6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0FuaW1hdGlvbiBzdGF0ZSBuYW1lLicpLFxuICAgIH0pLFxuICAgIGhhbmRsZXI6IGFzeW5jIChhcmdzKSA9PiB7XG4gICAgICAgIHJldHVybiBydW5TY2VuZU1ldGhvZEFzVG9vbFJlc3BvbnNlKCdjaGVja0FuaW1hdGlvbkZpbmlzaGVkJywgW2FyZ3Mubm9kZVV1aWQsIGFyZ3Muc3RhdGVOYW1lXSk7XG4gICAgfSxcbn07XG5cbmV4cG9ydCBjbGFzcyBBbmltYXRpb25Ub29scyB7XG4gICAgcHJpdmF0ZSBpbXBsID0gZGVmaW5lVG9vbHMoW1xuICAgICAgICBhbmltYXRpb25DaGVja0ZpbmlzaGVkLFxuICAgICAgICBhbmltYXRpb25HZXRTdGF0ZUluZm8sXG4gICAgICAgIGFuaW1hdGlvbkxpc3RDbGlwcyxcbiAgICAgICAgYW5pbWF0aW9uTGlzdFN0YXRlcyxcbiAgICAgICAgYW5pbWF0aW9uUGxheSxcbiAgICAgICAgYW5pbWF0aW9uU2V0U3BlZWQsXG4gICAgICAgIGFuaW1hdGlvblN0b3AsXG4gICAgICAgIGFuaW1hdGlvblNldENsaXAsXG4gICAgXSk7XG5cbiAgICBnZXRUb29scygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuaW1wbC5nZXRUb29scygpO1xuICAgIH1cblxuICAgIGV4ZWN1dGUodG9vbE5hbWU6IHN0cmluZywgYXJnczogYW55KSB7XG4gICAgICAgIHJldHVybiB0aGlzLmltcGwuZXhlY3V0ZSh0b29sTmFtZSwgYXJncyk7XG4gICAgfVxufVxuIl19