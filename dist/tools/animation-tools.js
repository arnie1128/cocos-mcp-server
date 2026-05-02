"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnimationTools = void 0;
const response_1 = require("../lib/response");
const schema_1 = require("../lib/schema");
const decorators_1 = require("../lib/decorators");
const scene_bridge_1 = require("../lib/scene-bridge");
const resolve_node_1 = require("../lib/resolve-node");
const log_1 = require("../lib/log");
class AnimationTools {
    constructor() {
        this.exec = (0, decorators_1.defineToolsFromDecorators)(this);
    }
    getTools() { return this.exec.getTools(); }
    execute(toolName, args) { return this.exec.execute(toolName, args); }
    async listClips(args) {
        const resolved = await (0, resolve_node_1.resolveOrToolError)(args);
        if ('response' in resolved)
            return resolved.response;
        return (0, scene_bridge_1.runSceneMethodAsToolResponse)('getAnimationClips', [resolved.uuid]);
    }
    async play(args) {
        const resolved = await (0, resolve_node_1.resolveOrToolError)(args);
        if ('response' in resolved)
            return resolved.response;
        return (0, scene_bridge_1.runSceneMethodAsToolResponse)('playAnimation', [resolved.uuid, args.clipName]);
    }
    async stop(args) {
        const resolved = await (0, resolve_node_1.resolveOrToolError)(args);
        if ('response' in resolved)
            return resolved.response;
        return (0, scene_bridge_1.runSceneMethodAsToolResponse)('stopAnimation', [resolved.uuid]);
    }
    async setClip(args) {
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
    }
    async listAnimationStates(args) {
        return (0, scene_bridge_1.runSceneMethodAsToolResponse)('listAnimationStates', [args.nodeUuid]);
    }
    async getAnimationStateInfo(args) {
        return (0, scene_bridge_1.runSceneMethodAsToolResponse)('getAnimationStateInfo', [args.nodeUuid, args.stateName]);
    }
    async setAnimationSpeed(args) {
        return (0, scene_bridge_1.runSceneMethodAsToolResponse)('setAnimationSpeed', [args.nodeUuid, args.stateName, args.speed]);
    }
    async checkAnimationFinished(args) {
        return (0, scene_bridge_1.runSceneMethodAsToolResponse)('checkAnimationFinished', [args.nodeUuid, args.stateName]);
    }
}
exports.AnimationTools = AnimationTools;
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'list_clips',
        title: 'List animation clips',
        description: '[specialist] List animation clips registered on a node\'s cc.Animation component. Returns clip names + which one is the defaultClip + the playOnLoad flag.',
        inputSchema: schema_1.z.object(Object.assign({}, resolve_node_1.nodeReferenceShape)),
    })
], AnimationTools.prototype, "listClips", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'play',
        title: 'Play animation clip',
        description: '[specialist] Play an animation clip on a node\'s cc.Animation component. Omits clipName → plays the configured defaultClip. Returns success even when the clip was already playing (cocos no-op).',
        inputSchema: schema_1.z.object(Object.assign(Object.assign({}, resolve_node_1.nodeReferenceShape), { clipName: schema_1.z.string().optional().describe('Clip name registered on the Animation component. Omit to play defaultClip.') })),
    })
], AnimationTools.prototype, "play", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'stop',
        title: 'Stop animation',
        description: '[specialist] Stop the currently playing animation on a node\'s cc.Animation component. No-op if nothing is playing.',
        inputSchema: schema_1.z.object(Object.assign({}, resolve_node_1.nodeReferenceShape)),
    })
], AnimationTools.prototype, "stop", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'set_clip',
        title: 'Configure animation clip',
        description: '[specialist] Configure a node\'s cc.Animation: defaultClip name and/or playOnLoad. Both fields optional — only the ones you pass get written. Persists via the editor set-property channel (Landmine #11 scalar path) so save_scene picks it up.',
        inputSchema: schema_1.z.object(Object.assign(Object.assign({}, resolve_node_1.nodeReferenceShape), { defaultClip: schema_1.z.string().optional().describe('Name of the clip to use as defaultClip. Must already be registered in the component\'s clips array.'), playOnLoad: schema_1.z.boolean().optional().describe('Whether the component starts the defaultClip when the scene loads.') })),
    })
], AnimationTools.prototype, "setClip", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'list_animation_states',
        title: 'List animation states',
        description: '[specialist] List cc.AnimationState entries on a node\'s cc.Animation component.',
        inputSchema: schema_1.z.object({
            nodeUuid: schema_1.z.string().describe('UUID of the node with the cc.Animation component.'),
        }),
    })
], AnimationTools.prototype, "listAnimationStates", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'get_animation_state_info',
        title: 'Get animation state info',
        description: '[specialist] Get speed and timing info for a named cc.AnimationState.',
        inputSchema: schema_1.z.object({
            nodeUuid: schema_1.z.string().describe('UUID of the node with the cc.Animation component.'),
            stateName: schema_1.z.string().describe('Animation state name.'),
        }),
    })
], AnimationTools.prototype, "getAnimationStateInfo", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'set_animation_speed',
        title: 'Set animation speed',
        description: '[specialist] Set speed on a named cc.AnimationState.',
        inputSchema: schema_1.z.object({
            nodeUuid: schema_1.z.string().describe('UUID of the node with the cc.Animation component.'),
            stateName: schema_1.z.string().describe('Animation state name.'),
            speed: schema_1.z.number().describe('New AnimationState.speed value.'),
        }),
    })
], AnimationTools.prototype, "setAnimationSpeed", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'check_animation_finished',
        title: 'Check animation finished',
        description: '[specialist] Check whether a named cc.AnimationState has reached its end time.',
        inputSchema: schema_1.z.object({
            nodeUuid: schema_1.z.string().describe('UUID of the node with the cc.Animation component.'),
            stateName: schema_1.z.string().describe('Animation state name.'),
        }),
    })
], AnimationTools.prototype, "checkAnimationFinished", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYW5pbWF0aW9uLXRvb2xzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL3Rvb2xzL2FuaW1hdGlvbi10b29scy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7QUFBQSw4Q0FBdUM7QUF1QnZDLDBDQUFrQztBQUNsQyxrREFBdUU7QUFDdkUsc0RBQW1GO0FBQ25GLHNEQUE2RTtBQUM3RSxvQ0FBb0M7QUFFcEMsTUFBYSxjQUFjO0lBR3ZCO1FBQ0ksSUFBSSxDQUFDLElBQUksR0FBRyxJQUFBLHNDQUF5QixFQUFDLElBQUksQ0FBQyxDQUFDO0lBQ2hELENBQUM7SUFFRCxRQUFRLEtBQXVCLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDN0QsT0FBTyxDQUFDLFFBQWdCLEVBQUUsSUFBUyxJQUEyQixPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFVbkcsQUFBTixLQUFLLENBQUMsU0FBUyxDQUFDLElBQVM7UUFDckIsTUFBTSxRQUFRLEdBQUcsTUFBTSxJQUFBLGlDQUFrQixFQUFDLElBQUksQ0FBQyxDQUFDO1FBQ2hELElBQUksVUFBVSxJQUFJLFFBQVE7WUFBRSxPQUFPLFFBQVEsQ0FBQyxRQUFRLENBQUM7UUFDckQsT0FBTyxJQUFBLDJDQUE0QixFQUFDLG1CQUFtQixFQUFFLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7SUFDOUUsQ0FBQztJQVdLLEFBQU4sS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFTO1FBQ2hCLE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBQSxpQ0FBa0IsRUFBQyxJQUFJLENBQUMsQ0FBQztRQUNoRCxJQUFJLFVBQVUsSUFBSSxRQUFRO1lBQUUsT0FBTyxRQUFRLENBQUMsUUFBUSxDQUFDO1FBQ3JELE9BQU8sSUFBQSwyQ0FBNEIsRUFBQyxlQUFlLEVBQUUsQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO0lBQ3pGLENBQUM7SUFVSyxBQUFOLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBUztRQUNoQixNQUFNLFFBQVEsR0FBRyxNQUFNLElBQUEsaUNBQWtCLEVBQUMsSUFBSSxDQUFDLENBQUM7UUFDaEQsSUFBSSxVQUFVLElBQUksUUFBUTtZQUFFLE9BQU8sUUFBUSxDQUFDLFFBQVEsQ0FBQztRQUNyRCxPQUFPLElBQUEsMkNBQTRCLEVBQUMsZUFBZSxFQUFFLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7SUFDMUUsQ0FBQztJQVlLLEFBQU4sS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFTOztRQUNuQixJQUFJLElBQUksQ0FBQyxXQUFXLEtBQUssU0FBUyxJQUFJLElBQUksQ0FBQyxVQUFVLEtBQUssU0FBUyxFQUFFLENBQUM7WUFDbEUsT0FBTyxJQUFBLGVBQUksRUFBQyxzRUFBc0UsQ0FBQyxDQUFDO1FBQ3hGLENBQUM7UUFDRCxNQUFNLFFBQVEsR0FBRyxNQUFNLElBQUEsaUNBQWtCLEVBQUMsSUFBSSxDQUFDLENBQUM7UUFDaEQsSUFBSSxVQUFVLElBQUksUUFBUTtZQUFFLE9BQU8sUUFBUSxDQUFDLFFBQVEsQ0FBQztRQUNyRCxNQUFNLElBQUksR0FBRyxRQUFRLENBQUMsSUFBSSxDQUFDO1FBRTNCLGdFQUFnRTtRQUNoRSxnRUFBZ0U7UUFDaEUsZ0VBQWdFO1FBQ2hFLE1BQU0sTUFBTSxHQUFHLE1BQU0sSUFBQSw2QkFBYyxFQUMvQiwwQkFBMEIsRUFDMUIsQ0FBQyxJQUFJLEVBQUUsTUFBQSxJQUFJLENBQUMsV0FBVyxtQ0FBSSxJQUFJLENBQUMsRUFDaEMsRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLENBQ3JCLENBQUM7UUFDRixJQUFJLENBQUMsTUFBTSxJQUFJLE1BQU0sQ0FBQyxPQUFPLEtBQUssSUFBSSxFQUFFLENBQUM7WUFDckMsT0FBTyxJQUFBLGVBQUksRUFBQyxNQUFBLE1BQU0sYUFBTixNQUFNLHVCQUFOLE1BQU0sQ0FBRSxLQUFLLG1DQUFJLDJDQUEyQyxDQUFDLENBQUM7UUFDOUUsQ0FBQztRQUNELE1BQU0sRUFBRSxjQUFjLEVBQUUsUUFBUSxFQUFFLEdBQUcsTUFBQSxNQUFNLENBQUMsSUFBSSxtQ0FBSSxFQUFFLENBQUM7UUFDdkQsSUFBSSxPQUFPLGNBQWMsS0FBSyxRQUFRLEVBQUUsQ0FBQztZQUNyQyxPQUFPLElBQUEsZUFBSSxFQUFDLHdEQUF3RCxDQUFDLENBQUM7UUFDMUUsQ0FBQztRQUVELGtFQUFrRTtRQUNsRSxpRUFBaUU7UUFDakUsTUFBTSxPQUFPLEdBQWEsRUFBRSxDQUFDO1FBQzdCLElBQUksQ0FBQztZQUNELElBQUksSUFBSSxDQUFDLFdBQVcsS0FBSyxTQUFTLEVBQUUsQ0FBQztnQkFDakMsTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsY0FBYyxFQUFFO29CQUNsRCxJQUFJO29CQUNKLElBQUksRUFBRSxhQUFhLGNBQWMsY0FBYztvQkFDL0MsSUFBSSxFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxFQUFFLElBQUksRUFBRSxrQkFBa0IsRUFBRTtpQkFDaEUsQ0FBQyxDQUFDO2dCQUNILE9BQU8sQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUM7WUFDaEMsQ0FBQztZQUNELElBQUksSUFBSSxDQUFDLFVBQVUsS0FBSyxTQUFTLEVBQUUsQ0FBQztnQkFDaEMsTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsY0FBYyxFQUFFO29CQUNsRCxJQUFJO29CQUNKLElBQUksRUFBRSxhQUFhLGNBQWMsYUFBYTtvQkFDOUMsSUFBSSxFQUFFLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxVQUFVLEtBQUssSUFBSSxFQUFFO2lCQUM1QyxDQUFDLENBQUM7Z0JBQ0gsT0FBTyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUMvQixDQUFDO1FBQ0wsQ0FBQztRQUFDLE9BQU8sR0FBUSxFQUFFLENBQUM7WUFDaEIsWUFBTSxDQUFDLEtBQUssQ0FBQyx1Q0FBdUMsRUFBRSxHQUFHLENBQUMsQ0FBQztZQUMzRCxPQUFPLElBQUEsZUFBSSxFQUFDLDZDQUE2QyxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLE1BQUEsR0FBRyxhQUFILEdBQUcsdUJBQUgsR0FBRyxDQUFFLE9BQU8sbUNBQUksTUFBTSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNwSCxDQUFDO1FBRUQsT0FBTztZQUNILE9BQU8sRUFBRSxJQUFJO1lBQ2IsT0FBTyxFQUFFLFdBQVcsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsa0JBQWtCO1lBQ3hELElBQUksRUFBRSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsY0FBYyxFQUFFLE9BQU8sRUFBRTtZQUNqRCxpQkFBaUIsRUFBRSxPQUFPO1NBQzdCLENBQUM7SUFDTixDQUFDO0lBVUssQUFBTixLQUFLLENBQUMsbUJBQW1CLENBQUMsSUFBUztRQUMvQixPQUFPLElBQUEsMkNBQTRCLEVBQUMscUJBQXFCLEVBQUUsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztJQUNoRixDQUFDO0lBV0ssQUFBTixLQUFLLENBQUMscUJBQXFCLENBQUMsSUFBUztRQUNqQyxPQUFPLElBQUEsMkNBQTRCLEVBQUMsdUJBQXVCLEVBQUUsQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO0lBQ2xHLENBQUM7SUFZSyxBQUFOLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxJQUFTO1FBQzdCLE9BQU8sSUFBQSwyQ0FBNEIsRUFBQyxtQkFBbUIsRUFBRSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztJQUMxRyxDQUFDO0lBV0ssQUFBTixLQUFLLENBQUMsc0JBQXNCLENBQUMsSUFBUztRQUNsQyxPQUFPLElBQUEsMkNBQTRCLEVBQUMsd0JBQXdCLEVBQUUsQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO0lBQ25HLENBQUM7Q0FDSjtBQTNLRCx3Q0EyS0M7QUF6SlM7SUFSTCxJQUFBLG9CQUFPLEVBQUM7UUFDTCxJQUFJLEVBQUUsWUFBWTtRQUNsQixLQUFLLEVBQUUsc0JBQXNCO1FBQzdCLFdBQVcsRUFBRSw0SkFBNEo7UUFDekssV0FBVyxFQUFFLFVBQUMsQ0FBQyxNQUFNLG1CQUNkLGlDQUFrQixFQUN2QjtLQUNMLENBQUM7K0NBS0Q7QUFXSztJQVRMLElBQUEsb0JBQU8sRUFBQztRQUNMLElBQUksRUFBRSxNQUFNO1FBQ1osS0FBSyxFQUFFLHFCQUFxQjtRQUM1QixXQUFXLEVBQUUsbU1BQW1NO1FBQ2hOLFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxpQ0FDZCxpQ0FBa0IsS0FDckIsUUFBUSxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxRQUFRLENBQUMsNEVBQTRFLENBQUMsSUFDeEg7S0FDTCxDQUFDOzBDQUtEO0FBVUs7SUFSTCxJQUFBLG9CQUFPLEVBQUM7UUFDTCxJQUFJLEVBQUUsTUFBTTtRQUNaLEtBQUssRUFBRSxnQkFBZ0I7UUFDdkIsV0FBVyxFQUFFLHFIQUFxSDtRQUNsSSxXQUFXLEVBQUUsVUFBQyxDQUFDLE1BQU0sbUJBQ2QsaUNBQWtCLEVBQ3ZCO0tBQ0wsQ0FBQzswQ0FLRDtBQVlLO0lBVkwsSUFBQSxvQkFBTyxFQUFDO1FBQ0wsSUFBSSxFQUFFLFVBQVU7UUFDaEIsS0FBSyxFQUFFLDBCQUEwQjtRQUNqQyxXQUFXLEVBQUUsa1BBQWtQO1FBQy9QLFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxpQ0FDZCxpQ0FBa0IsS0FDckIsV0FBVyxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxRQUFRLENBQUMscUdBQXFHLENBQUMsRUFDbEosVUFBVSxFQUFFLFVBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxRQUFRLENBQUMsb0VBQW9FLENBQUMsSUFDbkg7S0FDTCxDQUFDOzZDQXdERDtBQVVLO0lBUkwsSUFBQSxvQkFBTyxFQUFDO1FBQ0wsSUFBSSxFQUFFLHVCQUF1QjtRQUM3QixLQUFLLEVBQUUsdUJBQXVCO1FBQzlCLFdBQVcsRUFBRSxrRkFBa0Y7UUFDL0YsV0FBVyxFQUFFLFVBQUMsQ0FBQyxNQUFNLENBQUM7WUFDbEIsUUFBUSxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLENBQUMsbURBQW1ELENBQUM7U0FDckYsQ0FBQztLQUNMLENBQUM7eURBR0Q7QUFXSztJQVRMLElBQUEsb0JBQU8sRUFBQztRQUNMLElBQUksRUFBRSwwQkFBMEI7UUFDaEMsS0FBSyxFQUFFLDBCQUEwQjtRQUNqQyxXQUFXLEVBQUUsdUVBQXVFO1FBQ3BGLFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDO1lBQ2xCLFFBQVEsRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLG1EQUFtRCxDQUFDO1lBQ2xGLFNBQVMsRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLHVCQUF1QixDQUFDO1NBQzFELENBQUM7S0FDTCxDQUFDOzJEQUdEO0FBWUs7SUFWTCxJQUFBLG9CQUFPLEVBQUM7UUFDTCxJQUFJLEVBQUUscUJBQXFCO1FBQzNCLEtBQUssRUFBRSxxQkFBcUI7UUFDNUIsV0FBVyxFQUFFLHNEQUFzRDtRQUNuRSxXQUFXLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQztZQUNsQixRQUFRLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyxtREFBbUQsQ0FBQztZQUNsRixTQUFTLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyx1QkFBdUIsQ0FBQztZQUN2RCxLQUFLLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyxpQ0FBaUMsQ0FBQztTQUNoRSxDQUFDO0tBQ0wsQ0FBQzt1REFHRDtBQVdLO0lBVEwsSUFBQSxvQkFBTyxFQUFDO1FBQ0wsSUFBSSxFQUFFLDBCQUEwQjtRQUNoQyxLQUFLLEVBQUUsMEJBQTBCO1FBQ2pDLFdBQVcsRUFBRSxnRkFBZ0Y7UUFDN0YsV0FBVyxFQUFFLFVBQUMsQ0FBQyxNQUFNLENBQUM7WUFDbEIsUUFBUSxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLENBQUMsbURBQW1ELENBQUM7WUFDbEYsU0FBUyxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLENBQUMsdUJBQXVCLENBQUM7U0FDMUQsQ0FBQztLQUNMLENBQUM7NERBR0QiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBmYWlsIH0gZnJvbSAnLi4vbGliL3Jlc3BvbnNlJztcbi8qKlxuICogYW5pbWF0aW9uLXRvb2xzIOKAlCBkcml2ZSBgY2MuQW5pbWF0aW9uYCBmcm9tIE1DUC5cbiAqXG4gKiBGb3VyIHRvb2xzOlxuICogICAtIGFuaW1hdGlvbl9saXN0X2NsaXBzICAg4oCUIGVudW1lcmF0ZSBjbGlwcyBvbiBhIG5vZGUncyBjYy5BbmltYXRpb25cbiAqICAgLSBhbmltYXRpb25fcGxheSAgICAgICAgIOKAlCBzdGFydCBhIGNsaXAgKGRlZmF1bHQgaWYgbmFtZSBvbWl0dGVkKVxuICogICAtIGFuaW1hdGlvbl9zdG9wICAgICAgICAg4oCUIHN0b3AgdGhlIGFjdGl2ZSBjbGlwXG4gKiAgIC0gYW5pbWF0aW9uX3NldF9jbGlwICAgICDigJQgc2V0IGRlZmF1bHRDbGlwIC8gcGxheU9uTG9hZFxuICpcbiAqIEFsbCBmb3VyIGFjY2VwdCB0aGUgdjIuNC4wIGBub2RlVXVpZCB8IG5vZGVOYW1lYCBmYWxsYmFjayB2aWFcbiAqIGByZXNvbHZlT3JUb29sRXJyb3JgLiBTY2VuZS1zaWRlIGV4ZWN1dGlvbiBsaXZlcyBpblxuICogYHNvdXJjZS9zY2VuZS50czptZXRob2RzLntnZXRBbmltYXRpb25DbGlwcyxwbGF5QW5pbWF0aW9uLFxuICogc3RvcEFuaW1hdGlvbixzZXRBbmltYXRpb25Qcm9wZXJ0eX1gIHNvIGNjLiogQVBJcyBzdGF5IHdoZXJlIHRoZXlcbiAqIGxlZ2FsbHkgZXhpc3QgKGVuZ2luZSBjb250ZXh0KS5cbiAqXG4gKiBSZWZlcmVuY2U6IGNvY29zLW1jcC1leHRlbnNpb24gKFNwYXlkbylcbiAqIGBzb3VyY2UvdG9vbHMvYW5pbWF0aW9uLXRvb2xzLnRzYC4gV2UgcmV3cml0ZSB1c2luZyB0aGUgdjIuNC4wXG4gKiBkZWNsYXJhdGl2ZSBgQG1jcFRvb2xgIHBhdHRlcm4gKyBub2RlIGZhbGxiYWNrIHJhdGhlciB0aGFuIHRoZVxuICogdXBzdHJlYW0gdGhyZWUtbGF5ZXIgZGlzcGF0Y2guXG4gKi9cblxuaW1wb3J0IHR5cGUgeyBUb29sRGVmaW5pdGlvbiwgVG9vbFJlc3BvbnNlLCBUb29sRXhlY3V0b3IgfSBmcm9tICcuLi90eXBlcyc7XG5pbXBvcnQgeyB6IH0gZnJvbSAnLi4vbGliL3NjaGVtYSc7XG5pbXBvcnQgeyBtY3BUb29sLCBkZWZpbmVUb29sc0Zyb21EZWNvcmF0b3JzIH0gZnJvbSAnLi4vbGliL2RlY29yYXRvcnMnO1xuaW1wb3J0IHsgcnVuU2NlbmVNZXRob2QsIHJ1blNjZW5lTWV0aG9kQXNUb29sUmVzcG9uc2UgfSBmcm9tICcuLi9saWIvc2NlbmUtYnJpZGdlJztcbmltcG9ydCB7IG5vZGVSZWZlcmVuY2VTaGFwZSwgcmVzb2x2ZU9yVG9vbEVycm9yIH0gZnJvbSAnLi4vbGliL3Jlc29sdmUtbm9kZSc7XG5pbXBvcnQgeyBsb2dnZXIgfSBmcm9tICcuLi9saWIvbG9nJztcblxuZXhwb3J0IGNsYXNzIEFuaW1hdGlvblRvb2xzIGltcGxlbWVudHMgVG9vbEV4ZWN1dG9yIHtcbiAgICBwcml2YXRlIHJlYWRvbmx5IGV4ZWM6IFRvb2xFeGVjdXRvcjtcblxuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICB0aGlzLmV4ZWMgPSBkZWZpbmVUb29sc0Zyb21EZWNvcmF0b3JzKHRoaXMpO1xuICAgIH1cblxuICAgIGdldFRvb2xzKCk6IFRvb2xEZWZpbml0aW9uW10geyByZXR1cm4gdGhpcy5leGVjLmdldFRvb2xzKCk7IH1cbiAgICBleGVjdXRlKHRvb2xOYW1lOiBzdHJpbmcsIGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7IHJldHVybiB0aGlzLmV4ZWMuZXhlY3V0ZSh0b29sTmFtZSwgYXJncyk7IH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ2xpc3RfY2xpcHMnLFxuICAgICAgICB0aXRsZTogJ0xpc3QgYW5pbWF0aW9uIGNsaXBzJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gTGlzdCBhbmltYXRpb24gY2xpcHMgcmVnaXN0ZXJlZCBvbiBhIG5vZGVcXCdzIGNjLkFuaW1hdGlvbiBjb21wb25lbnQuIFJldHVybnMgY2xpcCBuYW1lcyArIHdoaWNoIG9uZSBpcyB0aGUgZGVmYXVsdENsaXAgKyB0aGUgcGxheU9uTG9hZCBmbGFnLicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAuLi5ub2RlUmVmZXJlbmNlU2hhcGUsXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgbGlzdENsaXBzKGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHJlc29sdmVkID0gYXdhaXQgcmVzb2x2ZU9yVG9vbEVycm9yKGFyZ3MpO1xuICAgICAgICBpZiAoJ3Jlc3BvbnNlJyBpbiByZXNvbHZlZCkgcmV0dXJuIHJlc29sdmVkLnJlc3BvbnNlO1xuICAgICAgICByZXR1cm4gcnVuU2NlbmVNZXRob2RBc1Rvb2xSZXNwb25zZSgnZ2V0QW5pbWF0aW9uQ2xpcHMnLCBbcmVzb2x2ZWQudXVpZF0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ3BsYXknLFxuICAgICAgICB0aXRsZTogJ1BsYXkgYW5pbWF0aW9uIGNsaXAnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBQbGF5IGFuIGFuaW1hdGlvbiBjbGlwIG9uIGEgbm9kZVxcJ3MgY2MuQW5pbWF0aW9uIGNvbXBvbmVudC4gT21pdHMgY2xpcE5hbWUg4oaSIHBsYXlzIHRoZSBjb25maWd1cmVkIGRlZmF1bHRDbGlwLiBSZXR1cm5zIHN1Y2Nlc3MgZXZlbiB3aGVuIHRoZSBjbGlwIHdhcyBhbHJlYWR5IHBsYXlpbmcgKGNvY29zIG5vLW9wKS4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgLi4ubm9kZVJlZmVyZW5jZVNoYXBlLFxuICAgICAgICAgICAgY2xpcE5hbWU6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnQ2xpcCBuYW1lIHJlZ2lzdGVyZWQgb24gdGhlIEFuaW1hdGlvbiBjb21wb25lbnQuIE9taXQgdG8gcGxheSBkZWZhdWx0Q2xpcC4nKSxcbiAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBwbGF5KGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHJlc29sdmVkID0gYXdhaXQgcmVzb2x2ZU9yVG9vbEVycm9yKGFyZ3MpO1xuICAgICAgICBpZiAoJ3Jlc3BvbnNlJyBpbiByZXNvbHZlZCkgcmV0dXJuIHJlc29sdmVkLnJlc3BvbnNlO1xuICAgICAgICByZXR1cm4gcnVuU2NlbmVNZXRob2RBc1Rvb2xSZXNwb25zZSgncGxheUFuaW1hdGlvbicsIFtyZXNvbHZlZC51dWlkLCBhcmdzLmNsaXBOYW1lXSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnc3RvcCcsXG4gICAgICAgIHRpdGxlOiAnU3RvcCBhbmltYXRpb24nLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBTdG9wIHRoZSBjdXJyZW50bHkgcGxheWluZyBhbmltYXRpb24gb24gYSBub2RlXFwncyBjYy5BbmltYXRpb24gY29tcG9uZW50LiBOby1vcCBpZiBub3RoaW5nIGlzIHBsYXlpbmcuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIC4uLm5vZGVSZWZlcmVuY2VTaGFwZSxcbiAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBzdG9wKGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHJlc29sdmVkID0gYXdhaXQgcmVzb2x2ZU9yVG9vbEVycm9yKGFyZ3MpO1xuICAgICAgICBpZiAoJ3Jlc3BvbnNlJyBpbiByZXNvbHZlZCkgcmV0dXJuIHJlc29sdmVkLnJlc3BvbnNlO1xuICAgICAgICByZXR1cm4gcnVuU2NlbmVNZXRob2RBc1Rvb2xSZXNwb25zZSgnc3RvcEFuaW1hdGlvbicsIFtyZXNvbHZlZC51dWlkXSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnc2V0X2NsaXAnLFxuICAgICAgICB0aXRsZTogJ0NvbmZpZ3VyZSBhbmltYXRpb24gY2xpcCcsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIENvbmZpZ3VyZSBhIG5vZGVcXCdzIGNjLkFuaW1hdGlvbjogZGVmYXVsdENsaXAgbmFtZSBhbmQvb3IgcGxheU9uTG9hZC4gQm90aCBmaWVsZHMgb3B0aW9uYWwg4oCUIG9ubHkgdGhlIG9uZXMgeW91IHBhc3MgZ2V0IHdyaXR0ZW4uIFBlcnNpc3RzIHZpYSB0aGUgZWRpdG9yIHNldC1wcm9wZXJ0eSBjaGFubmVsIChMYW5kbWluZSAjMTEgc2NhbGFyIHBhdGgpIHNvIHNhdmVfc2NlbmUgcGlja3MgaXQgdXAuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIC4uLm5vZGVSZWZlcmVuY2VTaGFwZSxcbiAgICAgICAgICAgIGRlZmF1bHRDbGlwOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ05hbWUgb2YgdGhlIGNsaXAgdG8gdXNlIGFzIGRlZmF1bHRDbGlwLiBNdXN0IGFscmVhZHkgYmUgcmVnaXN0ZXJlZCBpbiB0aGUgY29tcG9uZW50XFwncyBjbGlwcyBhcnJheS4nKSxcbiAgICAgICAgICAgIHBsYXlPbkxvYWQ6IHouYm9vbGVhbigpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1doZXRoZXIgdGhlIGNvbXBvbmVudCBzdGFydHMgdGhlIGRlZmF1bHRDbGlwIHdoZW4gdGhlIHNjZW5lIGxvYWRzLicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIHNldENsaXAoYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgaWYgKGFyZ3MuZGVmYXVsdENsaXAgPT09IHVuZGVmaW5lZCAmJiBhcmdzLnBsYXlPbkxvYWQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ2FuaW1hdGlvbl9zZXRfY2xpcDogcHJvdmlkZSBhdCBsZWFzdCBvbmUgb2YgZGVmYXVsdENsaXAgLyBwbGF5T25Mb2FkJyk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcmVzb2x2ZWQgPSBhd2FpdCByZXNvbHZlT3JUb29sRXJyb3IoYXJncyk7XG4gICAgICAgIGlmICgncmVzcG9uc2UnIGluIHJlc29sdmVkKSByZXR1cm4gcmVzb2x2ZWQucmVzcG9uc2U7XG4gICAgICAgIGNvbnN0IHV1aWQgPSByZXNvbHZlZC51dWlkO1xuXG4gICAgICAgIC8vIFN0ZXAgMTogc2NlbmUtc2NyaXB0IHJlc29sdmVzIGNvbXBvbmVudCBpbmRleCArIGNsaXAgdXVpZCAoaWZcbiAgICAgICAgLy8gZGVmYXVsdENsaXAgaXMgc2V0KS4gQnVuZGxlZCBpbiBvbmUgY2FsbCBzbyBmYWlsdXJlcyAobm8gYW5pbVxuICAgICAgICAvLyBjb21wb25lbnQsIHVua25vd24gY2xpcCkgYnViYmxlIGJhY2sgYmVmb3JlIGFueSBzZXQtcHJvcGVydHkuXG4gICAgICAgIGNvbnN0IGxvb2t1cCA9IGF3YWl0IHJ1blNjZW5lTWV0aG9kPGFueT4oXG4gICAgICAgICAgICAncXVlcnlBbmltYXRpb25TZXRUYXJnZXRzJyxcbiAgICAgICAgICAgIFt1dWlkLCBhcmdzLmRlZmF1bHRDbGlwID8/IG51bGxdLFxuICAgICAgICAgICAgeyBjYXB0dXJlOiBmYWxzZSB9LFxuICAgICAgICApO1xuICAgICAgICBpZiAoIWxvb2t1cCB8fCBsb29rdXAuc3VjY2VzcyAhPT0gdHJ1ZSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwobG9va3VwPy5lcnJvciA/PyAncXVlcnlBbmltYXRpb25TZXRUYXJnZXRzIHJldHVybmVkIG5vIGRhdGEnKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCB7IGNvbXBvbmVudEluZGV4LCBjbGlwVXVpZCB9ID0gbG9va3VwLmRhdGEgPz8ge307XG4gICAgICAgIGlmICh0eXBlb2YgY29tcG9uZW50SW5kZXggIT09ICdudW1iZXInKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbCgncXVlcnlBbmltYXRpb25TZXRUYXJnZXRzIGRpZCBub3QgcmV0dXJuIGNvbXBvbmVudEluZGV4Jyk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBTdGVwIDI6IGhvc3Qtc2lkZSBzZXQtcHJvcGVydHkgd3JpdGVzIGZvciBlYWNoIHJlcXVlc3RlZCBmaWVsZC5cbiAgICAgICAgLy8gU2NhbGFyIHBhdGhzIHBlciBMYW5kbWluZSAjMTEgcHJvcGFnYXRlIGltbWVkaWF0ZWx5LCBubyBudWRnZS5cbiAgICAgICAgY29uc3QgdXBkYXRlZDogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGlmIChhcmdzLmRlZmF1bHRDbGlwICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdzZXQtcHJvcGVydHknLCB7XG4gICAgICAgICAgICAgICAgICAgIHV1aWQsXG4gICAgICAgICAgICAgICAgICAgIHBhdGg6IGBfX2NvbXBzX18uJHtjb21wb25lbnRJbmRleH0uZGVmYXVsdENsaXBgLFxuICAgICAgICAgICAgICAgICAgICBkdW1wOiB7IHZhbHVlOiB7IHV1aWQ6IGNsaXBVdWlkIH0sIHR5cGU6ICdjYy5BbmltYXRpb25DbGlwJyB9LFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHVwZGF0ZWQucHVzaCgnZGVmYXVsdENsaXAnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChhcmdzLnBsYXlPbkxvYWQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3NldC1wcm9wZXJ0eScsIHtcbiAgICAgICAgICAgICAgICAgICAgdXVpZCxcbiAgICAgICAgICAgICAgICAgICAgcGF0aDogYF9fY29tcHNfXy4ke2NvbXBvbmVudEluZGV4fS5wbGF5T25Mb2FkYCxcbiAgICAgICAgICAgICAgICAgICAgZHVtcDogeyB2YWx1ZTogYXJncy5wbGF5T25Mb2FkID09PSB0cnVlIH0sXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgdXBkYXRlZC5wdXNoKCdwbGF5T25Mb2FkJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICBsb2dnZXIuZXJyb3IoJ1tBbmltYXRpb25Ub29sc10gc2V0LXByb3BlcnR5IGZhaWxlZDonLCBlcnIpO1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoYHNldC1wcm9wZXJ0eSBmYWlsZWQgYWZ0ZXIgcGFydGlhbCB1cGRhdGUgWyR7dXBkYXRlZC5qb2luKCcsICcpfV06ICR7ZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpfWApO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICBtZXNzYWdlOiBgVXBkYXRlZCAke3VwZGF0ZWQuam9pbignLCAnKX0gb24gY2MuQW5pbWF0aW9uYCxcbiAgICAgICAgICAgIGRhdGE6IHsgbm9kZVV1aWQ6IHV1aWQsIGNvbXBvbmVudEluZGV4LCB1cGRhdGVkIH0sXG4gICAgICAgICAgICB1cGRhdGVkUHJvcGVydGllczogdXBkYXRlZCxcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdsaXN0X2FuaW1hdGlvbl9zdGF0ZXMnLFxuICAgICAgICB0aXRsZTogJ0xpc3QgYW5pbWF0aW9uIHN0YXRlcycsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIExpc3QgY2MuQW5pbWF0aW9uU3RhdGUgZW50cmllcyBvbiBhIG5vZGVcXCdzIGNjLkFuaW1hdGlvbiBjb21wb25lbnQuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIG5vZGVVdWlkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdVVUlEIG9mIHRoZSBub2RlIHdpdGggdGhlIGNjLkFuaW1hdGlvbiBjb21wb25lbnQuJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgbGlzdEFuaW1hdGlvblN0YXRlcyhhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gcnVuU2NlbmVNZXRob2RBc1Rvb2xSZXNwb25zZSgnbGlzdEFuaW1hdGlvblN0YXRlcycsIFthcmdzLm5vZGVVdWlkXSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnZ2V0X2FuaW1hdGlvbl9zdGF0ZV9pbmZvJyxcbiAgICAgICAgdGl0bGU6ICdHZXQgYW5pbWF0aW9uIHN0YXRlIGluZm8nLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBHZXQgc3BlZWQgYW5kIHRpbWluZyBpbmZvIGZvciBhIG5hbWVkIGNjLkFuaW1hdGlvblN0YXRlLicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICBub2RlVXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnVVVJRCBvZiB0aGUgbm9kZSB3aXRoIHRoZSBjYy5BbmltYXRpb24gY29tcG9uZW50LicpLFxuICAgICAgICAgICAgc3RhdGVOYW1lOiB6LnN0cmluZygpLmRlc2NyaWJlKCdBbmltYXRpb24gc3RhdGUgbmFtZS4nKSxcbiAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBnZXRBbmltYXRpb25TdGF0ZUluZm8oYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHJ1blNjZW5lTWV0aG9kQXNUb29sUmVzcG9uc2UoJ2dldEFuaW1hdGlvblN0YXRlSW5mbycsIFthcmdzLm5vZGVVdWlkLCBhcmdzLnN0YXRlTmFtZV0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ3NldF9hbmltYXRpb25fc3BlZWQnLFxuICAgICAgICB0aXRsZTogJ1NldCBhbmltYXRpb24gc3BlZWQnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBTZXQgc3BlZWQgb24gYSBuYW1lZCBjYy5BbmltYXRpb25TdGF0ZS4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgbm9kZVV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1VVSUQgb2YgdGhlIG5vZGUgd2l0aCB0aGUgY2MuQW5pbWF0aW9uIGNvbXBvbmVudC4nKSxcbiAgICAgICAgICAgIHN0YXRlTmFtZTogei5zdHJpbmcoKS5kZXNjcmliZSgnQW5pbWF0aW9uIHN0YXRlIG5hbWUuJyksXG4gICAgICAgICAgICBzcGVlZDogei5udW1iZXIoKS5kZXNjcmliZSgnTmV3IEFuaW1hdGlvblN0YXRlLnNwZWVkIHZhbHVlLicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIHNldEFuaW1hdGlvblNwZWVkKGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBydW5TY2VuZU1ldGhvZEFzVG9vbFJlc3BvbnNlKCdzZXRBbmltYXRpb25TcGVlZCcsIFthcmdzLm5vZGVVdWlkLCBhcmdzLnN0YXRlTmFtZSwgYXJncy5zcGVlZF0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ2NoZWNrX2FuaW1hdGlvbl9maW5pc2hlZCcsXG4gICAgICAgIHRpdGxlOiAnQ2hlY2sgYW5pbWF0aW9uIGZpbmlzaGVkJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gQ2hlY2sgd2hldGhlciBhIG5hbWVkIGNjLkFuaW1hdGlvblN0YXRlIGhhcyByZWFjaGVkIGl0cyBlbmQgdGltZS4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgbm9kZVV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1VVSUQgb2YgdGhlIG5vZGUgd2l0aCB0aGUgY2MuQW5pbWF0aW9uIGNvbXBvbmVudC4nKSxcbiAgICAgICAgICAgIHN0YXRlTmFtZTogei5zdHJpbmcoKS5kZXNjcmliZSgnQW5pbWF0aW9uIHN0YXRlIG5hbWUuJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgY2hlY2tBbmltYXRpb25GaW5pc2hlZChhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gcnVuU2NlbmVNZXRob2RBc1Rvb2xSZXNwb25zZSgnY2hlY2tBbmltYXRpb25GaW5pc2hlZCcsIFthcmdzLm5vZGVVdWlkLCBhcmdzLnN0YXRlTmFtZV0pO1xuICAgIH1cbn1cbiJdfQ==