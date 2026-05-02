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
    description: '[specialist] List animation clips registered on a node\'s cc.Animation component. Returns clip names + which one is the defaultClip + the playOnLoad flag.',
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
    description: '[specialist] Play an animation clip on a node\'s cc.Animation component. Omits clipName → plays the configured defaultClip. Returns success even when the clip was already playing (cocos no-op).',
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
    description: '[specialist] Stop the currently playing animation on a node\'s cc.Animation component. No-op if nothing is playing.',
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
    description: '[specialist] Configure a node\'s cc.Animation: defaultClip name and/or playOnLoad. Both fields optional — only the ones you pass get written. Persists via the editor set-property channel (Landmine #11 scalar path) so save_scene picks it up.',
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
    description: '[specialist] List cc.AnimationState entries on a node\'s cc.Animation component.',
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
    description: '[specialist] Get speed and timing info for a named cc.AnimationState.',
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
    description: '[specialist] Set speed on a named cc.AnimationState.',
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
    description: '[specialist] Check whether a named cc.AnimationState has reached its end time.',
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYW5pbWF0aW9uLXRvb2xzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL3Rvb2xzL2FuaW1hdGlvbi10b29scy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSw4Q0FBMkM7QUF1QjNDLDBDQUFrQztBQUNsQyxzREFBMkQ7QUFDM0Qsc0RBQW1GO0FBQ25GLHNEQUE2RTtBQUM3RSxvQ0FBb0M7QUFFcEMsTUFBTSxrQkFBa0IsR0FBWTtJQUNoQyxJQUFJLEVBQUUsWUFBWTtJQUNsQixLQUFLLEVBQUUsc0JBQXNCO0lBQzdCLFdBQVcsRUFBRSw0SkFBNEo7SUFDekssV0FBVyxFQUFFLFVBQUMsQ0FBQyxNQUFNLG1CQUNkLGlDQUFrQixFQUN2QjtJQUNGLE9BQU8sRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFLEVBQUU7UUFDcEIsTUFBTSxRQUFRLEdBQUcsTUFBTSxJQUFBLGlDQUFrQixFQUFDLElBQUksQ0FBQyxDQUFDO1FBQ2hELElBQUksVUFBVSxJQUFJLFFBQVE7WUFBRSxPQUFPLFFBQVEsQ0FBQyxRQUFRLENBQUM7UUFDckQsT0FBTyxJQUFBLDJDQUE0QixFQUFDLG1CQUFtQixFQUFFLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7SUFDOUUsQ0FBQztDQUNKLENBQUM7QUFFRixNQUFNLGFBQWEsR0FBWTtJQUMzQixJQUFJLEVBQUUsTUFBTTtJQUNaLEtBQUssRUFBRSxxQkFBcUI7SUFDNUIsV0FBVyxFQUFFLG1NQUFtTTtJQUNoTixXQUFXLEVBQUUsVUFBQyxDQUFDLE1BQU0saUNBQ2QsaUNBQWtCLEtBQ3JCLFFBQVEsRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxFQUFFLENBQUMsUUFBUSxDQUFDLDRFQUE0RSxDQUFDLElBQ3hIO0lBQ0YsT0FBTyxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsRUFBRTtRQUNwQixNQUFNLFFBQVEsR0FBRyxNQUFNLElBQUEsaUNBQWtCLEVBQUMsSUFBSSxDQUFDLENBQUM7UUFDaEQsSUFBSSxVQUFVLElBQUksUUFBUTtZQUFFLE9BQU8sUUFBUSxDQUFDLFFBQVEsQ0FBQztRQUNyRCxPQUFPLElBQUEsMkNBQTRCLEVBQUMsZUFBZSxFQUFFLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztJQUN6RixDQUFDO0NBQ0osQ0FBQztBQUVGLE1BQU0sYUFBYSxHQUFZO0lBQzNCLElBQUksRUFBRSxNQUFNO0lBQ1osS0FBSyxFQUFFLGdCQUFnQjtJQUN2QixXQUFXLEVBQUUscUhBQXFIO0lBQ2xJLFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxtQkFDZCxpQ0FBa0IsRUFDdkI7SUFDRixPQUFPLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRSxFQUFFO1FBQ3BCLE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBQSxpQ0FBa0IsRUFBQyxJQUFJLENBQUMsQ0FBQztRQUNoRCxJQUFJLFVBQVUsSUFBSSxRQUFRO1lBQUUsT0FBTyxRQUFRLENBQUMsUUFBUSxDQUFDO1FBQ3JELE9BQU8sSUFBQSwyQ0FBNEIsRUFBQyxlQUFlLEVBQUUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztJQUMxRSxDQUFDO0NBQ0osQ0FBQztBQUVGLE1BQU0sZ0JBQWdCLEdBQVk7SUFDOUIsSUFBSSxFQUFFLFVBQVU7SUFDaEIsS0FBSyxFQUFFLDBCQUEwQjtJQUNqQyxXQUFXLEVBQUUsa1BBQWtQO0lBQy9QLFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxpQ0FDZCxpQ0FBa0IsS0FDckIsV0FBVyxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxRQUFRLENBQUMscUdBQXFHLENBQUMsRUFDbEosVUFBVSxFQUFFLFVBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxRQUFRLENBQUMsb0VBQW9FLENBQUMsSUFDbkg7SUFDRixPQUFPLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBeUIsRUFBRTs7UUFDM0MsSUFBSSxJQUFJLENBQUMsV0FBVyxLQUFLLFNBQVMsSUFBSSxJQUFJLENBQUMsVUFBVSxLQUFLLFNBQVMsRUFBRSxDQUFDO1lBQ2xFLE9BQU8sSUFBQSxlQUFJLEVBQUMsc0VBQXNFLENBQUMsQ0FBQztRQUN4RixDQUFDO1FBQ0QsTUFBTSxRQUFRLEdBQUcsTUFBTSxJQUFBLGlDQUFrQixFQUFDLElBQUksQ0FBQyxDQUFDO1FBQ2hELElBQUksVUFBVSxJQUFJLFFBQVE7WUFBRSxPQUFPLFFBQVEsQ0FBQyxRQUFRLENBQUM7UUFDckQsTUFBTSxJQUFJLEdBQUcsUUFBUSxDQUFDLElBQUksQ0FBQztRQUUzQixnRUFBZ0U7UUFDaEUsZ0VBQWdFO1FBQ2hFLGdFQUFnRTtRQUNoRSxNQUFNLE1BQU0sR0FBRyxNQUFNLElBQUEsNkJBQWMsRUFDL0IsMEJBQTBCLEVBQzFCLENBQUMsSUFBSSxFQUFFLE1BQUEsSUFBSSxDQUFDLFdBQVcsbUNBQUksSUFBSSxDQUFDLEVBQ2hDLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxDQUNyQixDQUFDO1FBQ0YsSUFBSSxDQUFDLE1BQU0sSUFBSSxNQUFNLENBQUMsT0FBTyxLQUFLLElBQUksRUFBRSxDQUFDO1lBQ3JDLE9BQU8sSUFBQSxlQUFJLEVBQUMsTUFBQSxNQUFNLGFBQU4sTUFBTSx1QkFBTixNQUFNLENBQUUsS0FBSyxtQ0FBSSwyQ0FBMkMsQ0FBQyxDQUFDO1FBQzlFLENBQUM7UUFDRCxNQUFNLEVBQUUsY0FBYyxFQUFFLFFBQVEsRUFBRSxHQUFHLE1BQUEsTUFBTSxDQUFDLElBQUksbUNBQUksRUFBRSxDQUFDO1FBQ3ZELElBQUksT0FBTyxjQUFjLEtBQUssUUFBUSxFQUFFLENBQUM7WUFDckMsT0FBTyxJQUFBLGVBQUksRUFBQyx3REFBd0QsQ0FBQyxDQUFDO1FBQzFFLENBQUM7UUFFRCxrRUFBa0U7UUFDbEUsaUVBQWlFO1FBQ2pFLE1BQU0sT0FBTyxHQUFhLEVBQUUsQ0FBQztRQUM3QixJQUFJLENBQUM7WUFDRCxJQUFJLElBQUksQ0FBQyxXQUFXLEtBQUssU0FBUyxFQUFFLENBQUM7Z0JBQ2pDLE1BQU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLGNBQWMsRUFBRTtvQkFDbEQsSUFBSTtvQkFDSixJQUFJLEVBQUUsYUFBYSxjQUFjLGNBQWM7b0JBQy9DLElBQUksRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsRUFBRSxJQUFJLEVBQUUsa0JBQWtCLEVBQUU7aUJBQ2hFLENBQUMsQ0FBQztnQkFDSCxPQUFPLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1lBQ2hDLENBQUM7WUFDRCxJQUFJLElBQUksQ0FBQyxVQUFVLEtBQUssU0FBUyxFQUFFLENBQUM7Z0JBQ2hDLE1BQU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLGNBQWMsRUFBRTtvQkFDbEQsSUFBSTtvQkFDSixJQUFJLEVBQUUsYUFBYSxjQUFjLGFBQWE7b0JBQzlDLElBQUksRUFBRSxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsVUFBVSxLQUFLLElBQUksRUFBRTtpQkFDNUMsQ0FBQyxDQUFDO2dCQUNILE9BQU8sQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7WUFDL0IsQ0FBQztRQUNMLENBQUM7UUFBQyxPQUFPLEdBQVEsRUFBRSxDQUFDO1lBQ2hCLFlBQU0sQ0FBQyxLQUFLLENBQUMsdUNBQXVDLEVBQUUsR0FBRyxDQUFDLENBQUM7WUFDM0QsT0FBTyxJQUFBLGVBQUksRUFBQyw2Q0FBNkMsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxNQUFBLEdBQUcsYUFBSCxHQUFHLHVCQUFILEdBQUcsQ0FBRSxPQUFPLG1DQUFJLE1BQU0sQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDcEgsQ0FBQztRQUVELE9BQU87WUFDSCxPQUFPLEVBQUUsSUFBSTtZQUNiLE9BQU8sRUFBRSxXQUFXLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLGtCQUFrQjtZQUN4RCxJQUFJLEVBQUUsRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLGNBQWMsRUFBRSxPQUFPLEVBQUU7WUFDakQsaUJBQWlCLEVBQUUsT0FBTztTQUM3QixDQUFDO0lBQ04sQ0FBQztDQUNKLENBQUM7QUFFRixNQUFNLG1CQUFtQixHQUFZO0lBQ2pDLElBQUksRUFBRSx1QkFBdUI7SUFDN0IsS0FBSyxFQUFFLHVCQUF1QjtJQUM5QixXQUFXLEVBQUUsa0ZBQWtGO0lBQy9GLFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDO1FBQ2xCLFFBQVEsRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLG1EQUFtRCxDQUFDO0tBQ3JGLENBQUM7SUFDRixPQUFPLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRSxFQUFFO1FBQ3BCLE9BQU8sSUFBQSwyQ0FBNEIsRUFBQyxxQkFBcUIsRUFBRSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO0lBQ2hGLENBQUM7Q0FDSixDQUFDO0FBRUYsTUFBTSxxQkFBcUIsR0FBWTtJQUNuQyxJQUFJLEVBQUUsMEJBQTBCO0lBQ2hDLEtBQUssRUFBRSwwQkFBMEI7SUFDakMsV0FBVyxFQUFFLHVFQUF1RTtJQUNwRixXQUFXLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQztRQUNsQixRQUFRLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyxtREFBbUQsQ0FBQztRQUNsRixTQUFTLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyx1QkFBdUIsQ0FBQztLQUMxRCxDQUFDO0lBQ0YsT0FBTyxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsRUFBRTtRQUNwQixPQUFPLElBQUEsMkNBQTRCLEVBQUMsdUJBQXVCLEVBQUUsQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO0lBQ2xHLENBQUM7Q0FDSixDQUFDO0FBRUYsTUFBTSxpQkFBaUIsR0FBWTtJQUMvQixJQUFJLEVBQUUscUJBQXFCO0lBQzNCLEtBQUssRUFBRSxxQkFBcUI7SUFDNUIsV0FBVyxFQUFFLHNEQUFzRDtJQUNuRSxXQUFXLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQztRQUNsQixRQUFRLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyxtREFBbUQsQ0FBQztRQUNsRixTQUFTLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyx1QkFBdUIsQ0FBQztRQUN2RCxLQUFLLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyxpQ0FBaUMsQ0FBQztLQUNoRSxDQUFDO0lBQ0YsT0FBTyxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsRUFBRTtRQUNwQixPQUFPLElBQUEsMkNBQTRCLEVBQUMsbUJBQW1CLEVBQUUsQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFDMUcsQ0FBQztDQUNKLENBQUM7QUFFRixNQUFNLHNCQUFzQixHQUFZO0lBQ3BDLElBQUksRUFBRSwwQkFBMEI7SUFDaEMsS0FBSyxFQUFFLDBCQUEwQjtJQUNqQyxXQUFXLEVBQUUsZ0ZBQWdGO0lBQzdGLFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDO1FBQ2xCLFFBQVEsRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLG1EQUFtRCxDQUFDO1FBQ2xGLFNBQVMsRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLHVCQUF1QixDQUFDO0tBQzFELENBQUM7SUFDRixPQUFPLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRSxFQUFFO1FBQ3BCLE9BQU8sSUFBQSwyQ0FBNEIsRUFBQyx3QkFBd0IsRUFBRSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7SUFDbkcsQ0FBQztDQUNKLENBQUM7QUFFRixNQUFhLGNBQWM7SUFBM0I7UUFDWSxTQUFJLEdBQUcsSUFBQSwwQkFBVyxFQUFDO1lBQ3ZCLHNCQUFzQjtZQUN0QixxQkFBcUI7WUFDckIsa0JBQWtCO1lBQ2xCLG1CQUFtQjtZQUNuQixhQUFhO1lBQ2IsaUJBQWlCO1lBQ2pCLGFBQWE7WUFDYixnQkFBZ0I7U0FDbkIsQ0FBQyxDQUFDO0lBU1AsQ0FBQztJQVBHLFFBQVE7UUFDSixPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7SUFDaEMsQ0FBQztJQUVELE9BQU8sQ0FBQyxRQUFnQixFQUFFLElBQVM7UUFDL0IsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDN0MsQ0FBQztDQUNKO0FBbkJELHdDQW1CQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IG9rLCBmYWlsIH0gZnJvbSAnLi4vbGliL3Jlc3BvbnNlJztcbi8qKlxuICogYW5pbWF0aW9uLXRvb2xzIOKAlCBkcml2ZSBgY2MuQW5pbWF0aW9uYCBmcm9tIE1DUC5cbiAqXG4gKiBGb3VyIHRvb2xzOlxuICogICAtIGFuaW1hdGlvbl9saXN0X2NsaXBzICAg4oCUIGVudW1lcmF0ZSBjbGlwcyBvbiBhIG5vZGUncyBjYy5BbmltYXRpb25cbiAqICAgLSBhbmltYXRpb25fcGxheSAgICAgICAgIOKAlCBzdGFydCBhIGNsaXAgKGRlZmF1bHQgaWYgbmFtZSBvbWl0dGVkKVxuICogICAtIGFuaW1hdGlvbl9zdG9wICAgICAgICAg4oCUIHN0b3AgdGhlIGFjdGl2ZSBjbGlwXG4gKiAgIC0gYW5pbWF0aW9uX3NldF9jbGlwICAgICDigJQgc2V0IGRlZmF1bHRDbGlwIC8gcGxheU9uTG9hZFxuICpcbiAqIEFsbCBmb3VyIGFjY2VwdCB0aGUgdjIuNC4wIGBub2RlVXVpZCB8IG5vZGVOYW1lYCBmYWxsYmFjayB2aWFcbiAqIGByZXNvbHZlT3JUb29sRXJyb3JgLiBTY2VuZS1zaWRlIGV4ZWN1dGlvbiBsaXZlcyBpblxuICogYHNvdXJjZS9zY2VuZS50czptZXRob2RzLntnZXRBbmltYXRpb25DbGlwcyxwbGF5QW5pbWF0aW9uLFxuICogc3RvcEFuaW1hdGlvbixzZXRBbmltYXRpb25Qcm9wZXJ0eX1gIHNvIGNjLiogQVBJcyBzdGF5IHdoZXJlIHRoZXlcbiAqIGxlZ2FsbHkgZXhpc3QgKGVuZ2luZSBjb250ZXh0KS5cbiAqXG4gKiBSZWZlcmVuY2U6IGNvY29zLW1jcC1leHRlbnNpb24gKFNwYXlkbylcbiAqIGBzb3VyY2UvdG9vbHMvYW5pbWF0aW9uLXRvb2xzLnRzYC4gV2UgcmV3cml0ZSB1c2luZyB0aGUgdjIuNC4wXG4gKiBkZWNsYXJhdGl2ZSBgZGVmaW5lVG9vbHNgIHBhdHRlcm4gKyBub2RlIGZhbGxiYWNrIHJhdGhlciB0aGFuIHRoZVxuICogdXBzdHJlYW0gdGhyZWUtbGF5ZXIgZGlzcGF0Y2guXG4gKi9cblxuaW1wb3J0IHR5cGUgeyBUb29sUmVzcG9uc2UgfSBmcm9tICcuLi90eXBlcyc7XG5pbXBvcnQgeyB6IH0gZnJvbSAnLi4vbGliL3NjaGVtYSc7XG5pbXBvcnQgeyBkZWZpbmVUb29scywgVG9vbERlZiB9IGZyb20gJy4uL2xpYi9kZWZpbmUtdG9vbHMnO1xuaW1wb3J0IHsgcnVuU2NlbmVNZXRob2QsIHJ1blNjZW5lTWV0aG9kQXNUb29sUmVzcG9uc2UgfSBmcm9tICcuLi9saWIvc2NlbmUtYnJpZGdlJztcbmltcG9ydCB7IG5vZGVSZWZlcmVuY2VTaGFwZSwgcmVzb2x2ZU9yVG9vbEVycm9yIH0gZnJvbSAnLi4vbGliL3Jlc29sdmUtbm9kZSc7XG5pbXBvcnQgeyBsb2dnZXIgfSBmcm9tICcuLi9saWIvbG9nJztcblxuY29uc3QgYW5pbWF0aW9uTGlzdENsaXBzOiBUb29sRGVmID0ge1xuICAgIG5hbWU6ICdsaXN0X2NsaXBzJyxcbiAgICB0aXRsZTogJ0xpc3QgYW5pbWF0aW9uIGNsaXBzJyxcbiAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBMaXN0IGFuaW1hdGlvbiBjbGlwcyByZWdpc3RlcmVkIG9uIGEgbm9kZVxcJ3MgY2MuQW5pbWF0aW9uIGNvbXBvbmVudC4gUmV0dXJucyBjbGlwIG5hbWVzICsgd2hpY2ggb25lIGlzIHRoZSBkZWZhdWx0Q2xpcCArIHRoZSBwbGF5T25Mb2FkIGZsYWcuJyxcbiAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAuLi5ub2RlUmVmZXJlbmNlU2hhcGUsXG4gICAgfSksXG4gICAgaGFuZGxlcjogYXN5bmMgKGFyZ3MpID0+IHtcbiAgICAgICAgY29uc3QgcmVzb2x2ZWQgPSBhd2FpdCByZXNvbHZlT3JUb29sRXJyb3IoYXJncyk7XG4gICAgICAgIGlmICgncmVzcG9uc2UnIGluIHJlc29sdmVkKSByZXR1cm4gcmVzb2x2ZWQucmVzcG9uc2U7XG4gICAgICAgIHJldHVybiBydW5TY2VuZU1ldGhvZEFzVG9vbFJlc3BvbnNlKCdnZXRBbmltYXRpb25DbGlwcycsIFtyZXNvbHZlZC51dWlkXSk7XG4gICAgfSxcbn07XG5cbmNvbnN0IGFuaW1hdGlvblBsYXk6IFRvb2xEZWYgPSB7XG4gICAgbmFtZTogJ3BsYXknLFxuICAgIHRpdGxlOiAnUGxheSBhbmltYXRpb24gY2xpcCcsXG4gICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gUGxheSBhbiBhbmltYXRpb24gY2xpcCBvbiBhIG5vZGVcXCdzIGNjLkFuaW1hdGlvbiBjb21wb25lbnQuIE9taXRzIGNsaXBOYW1lIOKGkiBwbGF5cyB0aGUgY29uZmlndXJlZCBkZWZhdWx0Q2xpcC4gUmV0dXJucyBzdWNjZXNzIGV2ZW4gd2hlbiB0aGUgY2xpcCB3YXMgYWxyZWFkeSBwbGF5aW5nIChjb2NvcyBuby1vcCkuJyxcbiAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAuLi5ub2RlUmVmZXJlbmNlU2hhcGUsXG4gICAgICAgIGNsaXBOYW1lOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0NsaXAgbmFtZSByZWdpc3RlcmVkIG9uIHRoZSBBbmltYXRpb24gY29tcG9uZW50LiBPbWl0IHRvIHBsYXkgZGVmYXVsdENsaXAuJyksXG4gICAgfSksXG4gICAgaGFuZGxlcjogYXN5bmMgKGFyZ3MpID0+IHtcbiAgICAgICAgY29uc3QgcmVzb2x2ZWQgPSBhd2FpdCByZXNvbHZlT3JUb29sRXJyb3IoYXJncyk7XG4gICAgICAgIGlmICgncmVzcG9uc2UnIGluIHJlc29sdmVkKSByZXR1cm4gcmVzb2x2ZWQucmVzcG9uc2U7XG4gICAgICAgIHJldHVybiBydW5TY2VuZU1ldGhvZEFzVG9vbFJlc3BvbnNlKCdwbGF5QW5pbWF0aW9uJywgW3Jlc29sdmVkLnV1aWQsIGFyZ3MuY2xpcE5hbWVdKTtcbiAgICB9LFxufTtcblxuY29uc3QgYW5pbWF0aW9uU3RvcDogVG9vbERlZiA9IHtcbiAgICBuYW1lOiAnc3RvcCcsXG4gICAgdGl0bGU6ICdTdG9wIGFuaW1hdGlvbicsXG4gICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gU3RvcCB0aGUgY3VycmVudGx5IHBsYXlpbmcgYW5pbWF0aW9uIG9uIGEgbm9kZVxcJ3MgY2MuQW5pbWF0aW9uIGNvbXBvbmVudC4gTm8tb3AgaWYgbm90aGluZyBpcyBwbGF5aW5nLicsXG4gICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgLi4ubm9kZVJlZmVyZW5jZVNoYXBlLFxuICAgIH0pLFxuICAgIGhhbmRsZXI6IGFzeW5jIChhcmdzKSA9PiB7XG4gICAgICAgIGNvbnN0IHJlc29sdmVkID0gYXdhaXQgcmVzb2x2ZU9yVG9vbEVycm9yKGFyZ3MpO1xuICAgICAgICBpZiAoJ3Jlc3BvbnNlJyBpbiByZXNvbHZlZCkgcmV0dXJuIHJlc29sdmVkLnJlc3BvbnNlO1xuICAgICAgICByZXR1cm4gcnVuU2NlbmVNZXRob2RBc1Rvb2xSZXNwb25zZSgnc3RvcEFuaW1hdGlvbicsIFtyZXNvbHZlZC51dWlkXSk7XG4gICAgfSxcbn07XG5cbmNvbnN0IGFuaW1hdGlvblNldENsaXA6IFRvb2xEZWYgPSB7XG4gICAgbmFtZTogJ3NldF9jbGlwJyxcbiAgICB0aXRsZTogJ0NvbmZpZ3VyZSBhbmltYXRpb24gY2xpcCcsXG4gICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gQ29uZmlndXJlIGEgbm9kZVxcJ3MgY2MuQW5pbWF0aW9uOiBkZWZhdWx0Q2xpcCBuYW1lIGFuZC9vciBwbGF5T25Mb2FkLiBCb3RoIGZpZWxkcyBvcHRpb25hbCDigJQgb25seSB0aGUgb25lcyB5b3UgcGFzcyBnZXQgd3JpdHRlbi4gUGVyc2lzdHMgdmlhIHRoZSBlZGl0b3Igc2V0LXByb3BlcnR5IGNoYW5uZWwgKExhbmRtaW5lICMxMSBzY2FsYXIgcGF0aCkgc28gc2F2ZV9zY2VuZSBwaWNrcyBpdCB1cC4nLFxuICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgIC4uLm5vZGVSZWZlcmVuY2VTaGFwZSxcbiAgICAgICAgZGVmYXVsdENsaXA6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnTmFtZSBvZiB0aGUgY2xpcCB0byB1c2UgYXMgZGVmYXVsdENsaXAuIE11c3QgYWxyZWFkeSBiZSByZWdpc3RlcmVkIGluIHRoZSBjb21wb25lbnRcXCdzIGNsaXBzIGFycmF5LicpLFxuICAgICAgICBwbGF5T25Mb2FkOiB6LmJvb2xlYW4oKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdXaGV0aGVyIHRoZSBjb21wb25lbnQgc3RhcnRzIHRoZSBkZWZhdWx0Q2xpcCB3aGVuIHRoZSBzY2VuZSBsb2Fkcy4nKSxcbiAgICB9KSxcbiAgICBoYW5kbGVyOiBhc3luYyAoYXJncyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiA9PiB7XG4gICAgICAgIGlmIChhcmdzLmRlZmF1bHRDbGlwID09PSB1bmRlZmluZWQgJiYgYXJncy5wbGF5T25Mb2FkID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKCdhbmltYXRpb25fc2V0X2NsaXA6IHByb3ZpZGUgYXQgbGVhc3Qgb25lIG9mIGRlZmF1bHRDbGlwIC8gcGxheU9uTG9hZCcpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHJlc29sdmVkID0gYXdhaXQgcmVzb2x2ZU9yVG9vbEVycm9yKGFyZ3MpO1xuICAgICAgICBpZiAoJ3Jlc3BvbnNlJyBpbiByZXNvbHZlZCkgcmV0dXJuIHJlc29sdmVkLnJlc3BvbnNlO1xuICAgICAgICBjb25zdCB1dWlkID0gcmVzb2x2ZWQudXVpZDtcblxuICAgICAgICAvLyBTdGVwIDE6IHNjZW5lLXNjcmlwdCByZXNvbHZlcyBjb21wb25lbnQgaW5kZXggKyBjbGlwIHV1aWQgKGlmXG4gICAgICAgIC8vIGRlZmF1bHRDbGlwIGlzIHNldCkuIEJ1bmRsZWQgaW4gb25lIGNhbGwgc28gZmFpbHVyZXMgKG5vIGFuaW1cbiAgICAgICAgLy8gY29tcG9uZW50LCB1bmtub3duIGNsaXApIGJ1YmJsZSBiYWNrIGJlZm9yZSBhbnkgc2V0LXByb3BlcnR5LlxuICAgICAgICBjb25zdCBsb29rdXAgPSBhd2FpdCBydW5TY2VuZU1ldGhvZDxhbnk+KFxuICAgICAgICAgICAgJ3F1ZXJ5QW5pbWF0aW9uU2V0VGFyZ2V0cycsXG4gICAgICAgICAgICBbdXVpZCwgYXJncy5kZWZhdWx0Q2xpcCA/PyBudWxsXSxcbiAgICAgICAgICAgIHsgY2FwdHVyZTogZmFsc2UgfSxcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKCFsb29rdXAgfHwgbG9va3VwLnN1Y2Nlc3MgIT09IHRydWUpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGxvb2t1cD8uZXJyb3IgPz8gJ3F1ZXJ5QW5pbWF0aW9uU2V0VGFyZ2V0cyByZXR1cm5lZCBubyBkYXRhJyk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgeyBjb21wb25lbnRJbmRleCwgY2xpcFV1aWQgfSA9IGxvb2t1cC5kYXRhID8/IHt9O1xuICAgICAgICBpZiAodHlwZW9mIGNvbXBvbmVudEluZGV4ICE9PSAnbnVtYmVyJykge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ3F1ZXJ5QW5pbWF0aW9uU2V0VGFyZ2V0cyBkaWQgbm90IHJldHVybiBjb21wb25lbnRJbmRleCcpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gU3RlcCAyOiBob3N0LXNpZGUgc2V0LXByb3BlcnR5IHdyaXRlcyBmb3IgZWFjaCByZXF1ZXN0ZWQgZmllbGQuXG4gICAgICAgIC8vIFNjYWxhciBwYXRocyBwZXIgTGFuZG1pbmUgIzExIHByb3BhZ2F0ZSBpbW1lZGlhdGVseSwgbm8gbnVkZ2UuXG4gICAgICAgIGNvbnN0IHVwZGF0ZWQ6IHN0cmluZ1tdID0gW107XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBpZiAoYXJncy5kZWZhdWx0Q2xpcCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnc2V0LXByb3BlcnR5Jywge1xuICAgICAgICAgICAgICAgICAgICB1dWlkLFxuICAgICAgICAgICAgICAgICAgICBwYXRoOiBgX19jb21wc19fLiR7Y29tcG9uZW50SW5kZXh9LmRlZmF1bHRDbGlwYCxcbiAgICAgICAgICAgICAgICAgICAgZHVtcDogeyB2YWx1ZTogeyB1dWlkOiBjbGlwVXVpZCB9LCB0eXBlOiAnY2MuQW5pbWF0aW9uQ2xpcCcgfSxcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB1cGRhdGVkLnB1c2goJ2RlZmF1bHRDbGlwJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoYXJncy5wbGF5T25Mb2FkICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdzZXQtcHJvcGVydHknLCB7XG4gICAgICAgICAgICAgICAgICAgIHV1aWQsXG4gICAgICAgICAgICAgICAgICAgIHBhdGg6IGBfX2NvbXBzX18uJHtjb21wb25lbnRJbmRleH0ucGxheU9uTG9hZGAsXG4gICAgICAgICAgICAgICAgICAgIGR1bXA6IHsgdmFsdWU6IGFyZ3MucGxheU9uTG9hZCA9PT0gdHJ1ZSB9LFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHVwZGF0ZWQucHVzaCgncGxheU9uTG9hZCcpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgbG9nZ2VyLmVycm9yKCdbQW5pbWF0aW9uVG9vbHNdIHNldC1wcm9wZXJ0eSBmYWlsZWQ6JywgZXJyKTtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGBzZXQtcHJvcGVydHkgZmFpbGVkIGFmdGVyIHBhcnRpYWwgdXBkYXRlIFske3VwZGF0ZWQuam9pbignLCAnKX1dOiAke2Vycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKX1gKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgbWVzc2FnZTogYFVwZGF0ZWQgJHt1cGRhdGVkLmpvaW4oJywgJyl9IG9uIGNjLkFuaW1hdGlvbmAsXG4gICAgICAgICAgICBkYXRhOiB7IG5vZGVVdWlkOiB1dWlkLCBjb21wb25lbnRJbmRleCwgdXBkYXRlZCB9LFxuICAgICAgICAgICAgdXBkYXRlZFByb3BlcnRpZXM6IHVwZGF0ZWQsXG4gICAgICAgIH07XG4gICAgfSxcbn07XG5cbmNvbnN0IGFuaW1hdGlvbkxpc3RTdGF0ZXM6IFRvb2xEZWYgPSB7XG4gICAgbmFtZTogJ2xpc3RfYW5pbWF0aW9uX3N0YXRlcycsXG4gICAgdGl0bGU6ICdMaXN0IGFuaW1hdGlvbiBzdGF0ZXMnLFxuICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIExpc3QgY2MuQW5pbWF0aW9uU3RhdGUgZW50cmllcyBvbiBhIG5vZGVcXCdzIGNjLkFuaW1hdGlvbiBjb21wb25lbnQuJyxcbiAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICBub2RlVXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnVVVJRCBvZiB0aGUgbm9kZSB3aXRoIHRoZSBjYy5BbmltYXRpb24gY29tcG9uZW50LicpLFxuICAgIH0pLFxuICAgIGhhbmRsZXI6IGFzeW5jIChhcmdzKSA9PiB7XG4gICAgICAgIHJldHVybiBydW5TY2VuZU1ldGhvZEFzVG9vbFJlc3BvbnNlKCdsaXN0QW5pbWF0aW9uU3RhdGVzJywgW2FyZ3Mubm9kZVV1aWRdKTtcbiAgICB9LFxufTtcblxuY29uc3QgYW5pbWF0aW9uR2V0U3RhdGVJbmZvOiBUb29sRGVmID0ge1xuICAgIG5hbWU6ICdnZXRfYW5pbWF0aW9uX3N0YXRlX2luZm8nLFxuICAgIHRpdGxlOiAnR2V0IGFuaW1hdGlvbiBzdGF0ZSBpbmZvJyxcbiAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBHZXQgc3BlZWQgYW5kIHRpbWluZyBpbmZvIGZvciBhIG5hbWVkIGNjLkFuaW1hdGlvblN0YXRlLicsXG4gICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgbm9kZVV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1VVSUQgb2YgdGhlIG5vZGUgd2l0aCB0aGUgY2MuQW5pbWF0aW9uIGNvbXBvbmVudC4nKSxcbiAgICAgICAgc3RhdGVOYW1lOiB6LnN0cmluZygpLmRlc2NyaWJlKCdBbmltYXRpb24gc3RhdGUgbmFtZS4nKSxcbiAgICB9KSxcbiAgICBoYW5kbGVyOiBhc3luYyAoYXJncykgPT4ge1xuICAgICAgICByZXR1cm4gcnVuU2NlbmVNZXRob2RBc1Rvb2xSZXNwb25zZSgnZ2V0QW5pbWF0aW9uU3RhdGVJbmZvJywgW2FyZ3Mubm9kZVV1aWQsIGFyZ3Muc3RhdGVOYW1lXSk7XG4gICAgfSxcbn07XG5cbmNvbnN0IGFuaW1hdGlvblNldFNwZWVkOiBUb29sRGVmID0ge1xuICAgIG5hbWU6ICdzZXRfYW5pbWF0aW9uX3NwZWVkJyxcbiAgICB0aXRsZTogJ1NldCBhbmltYXRpb24gc3BlZWQnLFxuICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFNldCBzcGVlZCBvbiBhIG5hbWVkIGNjLkFuaW1hdGlvblN0YXRlLicsXG4gICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgbm9kZVV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1VVSUQgb2YgdGhlIG5vZGUgd2l0aCB0aGUgY2MuQW5pbWF0aW9uIGNvbXBvbmVudC4nKSxcbiAgICAgICAgc3RhdGVOYW1lOiB6LnN0cmluZygpLmRlc2NyaWJlKCdBbmltYXRpb24gc3RhdGUgbmFtZS4nKSxcbiAgICAgICAgc3BlZWQ6IHoubnVtYmVyKCkuZGVzY3JpYmUoJ05ldyBBbmltYXRpb25TdGF0ZS5zcGVlZCB2YWx1ZS4nKSxcbiAgICB9KSxcbiAgICBoYW5kbGVyOiBhc3luYyAoYXJncykgPT4ge1xuICAgICAgICByZXR1cm4gcnVuU2NlbmVNZXRob2RBc1Rvb2xSZXNwb25zZSgnc2V0QW5pbWF0aW9uU3BlZWQnLCBbYXJncy5ub2RlVXVpZCwgYXJncy5zdGF0ZU5hbWUsIGFyZ3Muc3BlZWRdKTtcbiAgICB9LFxufTtcblxuY29uc3QgYW5pbWF0aW9uQ2hlY2tGaW5pc2hlZDogVG9vbERlZiA9IHtcbiAgICBuYW1lOiAnY2hlY2tfYW5pbWF0aW9uX2ZpbmlzaGVkJyxcbiAgICB0aXRsZTogJ0NoZWNrIGFuaW1hdGlvbiBmaW5pc2hlZCcsXG4gICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gQ2hlY2sgd2hldGhlciBhIG5hbWVkIGNjLkFuaW1hdGlvblN0YXRlIGhhcyByZWFjaGVkIGl0cyBlbmQgdGltZS4nLFxuICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgIG5vZGVVdWlkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdVVUlEIG9mIHRoZSBub2RlIHdpdGggdGhlIGNjLkFuaW1hdGlvbiBjb21wb25lbnQuJyksXG4gICAgICAgIHN0YXRlTmFtZTogei5zdHJpbmcoKS5kZXNjcmliZSgnQW5pbWF0aW9uIHN0YXRlIG5hbWUuJyksXG4gICAgfSksXG4gICAgaGFuZGxlcjogYXN5bmMgKGFyZ3MpID0+IHtcbiAgICAgICAgcmV0dXJuIHJ1blNjZW5lTWV0aG9kQXNUb29sUmVzcG9uc2UoJ2NoZWNrQW5pbWF0aW9uRmluaXNoZWQnLCBbYXJncy5ub2RlVXVpZCwgYXJncy5zdGF0ZU5hbWVdKTtcbiAgICB9LFxufTtcblxuZXhwb3J0IGNsYXNzIEFuaW1hdGlvblRvb2xzIHtcbiAgICBwcml2YXRlIGltcGwgPSBkZWZpbmVUb29scyhbXG4gICAgICAgIGFuaW1hdGlvbkNoZWNrRmluaXNoZWQsXG4gICAgICAgIGFuaW1hdGlvbkdldFN0YXRlSW5mbyxcbiAgICAgICAgYW5pbWF0aW9uTGlzdENsaXBzLFxuICAgICAgICBhbmltYXRpb25MaXN0U3RhdGVzLFxuICAgICAgICBhbmltYXRpb25QbGF5LFxuICAgICAgICBhbmltYXRpb25TZXRTcGVlZCxcbiAgICAgICAgYW5pbWF0aW9uU3RvcCxcbiAgICAgICAgYW5pbWF0aW9uU2V0Q2xpcCxcbiAgICBdKTtcblxuICAgIGdldFRvb2xzKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5pbXBsLmdldFRvb2xzKCk7XG4gICAgfVxuXG4gICAgZXhlY3V0ZSh0b29sTmFtZTogc3RyaW5nLCBhcmdzOiBhbnkpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuaW1wbC5leGVjdXRlKHRvb2xOYW1lLCBhcmdzKTtcbiAgICB9XG59XG4iXX0=