import { ok, fail } from '../lib/response';
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

import type { ToolResponse } from '../types';
import { z } from '../lib/schema';
import { defineTools, ToolDef } from '../lib/define-tools';
import { runSceneMethod, runSceneMethodAsToolResponse } from '../lib/scene-bridge';
import { nodeReferenceShape, resolveOrToolError } from '../lib/resolve-node';
import { logger } from '../lib/log';

const animationListClips: ToolDef = {
    name: 'list_clips',
    title: 'List animation clips',
    description: 'List animation clips registered on a node\'s cc.Animation component. Returns clip names + which one is the defaultClip + the playOnLoad flag.',
    inputSchema: z.object({
        ...nodeReferenceShape,
    }),
    handler: async (args) => {
        const resolved = await resolveOrToolError(args);
        if ('response' in resolved) return resolved.response;
        return runSceneMethodAsToolResponse('getAnimationClips', [resolved.uuid]);
    },
};

const animationPlay: ToolDef = {
    name: 'play',
    title: 'Play animation clip',
    description: 'Play an animation clip on a node\'s cc.Animation component. Omits clipName → plays the configured defaultClip. Returns success even when the clip was already playing (cocos no-op).',
    inputSchema: z.object({
        ...nodeReferenceShape,
        clipName: z.string().optional().describe('Clip name registered on the Animation component. Omit to play defaultClip.'),
    }),
    handler: async (args) => {
        const resolved = await resolveOrToolError(args);
        if ('response' in resolved) return resolved.response;
        return runSceneMethodAsToolResponse('playAnimation', [resolved.uuid, args.clipName]);
    },
};

const animationStop: ToolDef = {
    name: 'stop',
    title: 'Stop animation',
    description: 'Stop the currently playing animation on a node\'s cc.Animation component. No-op if nothing is playing.',
    inputSchema: z.object({
        ...nodeReferenceShape,
    }),
    handler: async (args) => {
        const resolved = await resolveOrToolError(args);
        if ('response' in resolved) return resolved.response;
        return runSceneMethodAsToolResponse('stopAnimation', [resolved.uuid]);
    },
};

const animationSetClip: ToolDef = {
    name: 'set_clip',
    title: 'Configure animation clip',
    description: 'Configure a node\'s cc.Animation: defaultClip name and/or playOnLoad. Both fields optional — only the ones you pass get written. Persists via the editor set-property channel (Landmine #11 scalar path) so save_scene picks it up.',
    inputSchema: z.object({
        ...nodeReferenceShape,
        defaultClip: z.string().optional().describe('Name of the clip to use as defaultClip. Must already be registered in the component\'s clips array.'),
        playOnLoad: z.boolean().optional().describe('Whether the component starts the defaultClip when the scene loads.'),
    }),
    handler: async (args): Promise<ToolResponse> => {
        if (args.defaultClip === undefined && args.playOnLoad === undefined) {
            return fail('animation_set_clip: provide at least one of defaultClip / playOnLoad');
        }
        const resolved = await resolveOrToolError(args);
        if ('response' in resolved) return resolved.response;
        const uuid = resolved.uuid;

        // Step 1: scene-script resolves component index + clip uuid (if
        // defaultClip is set). Bundled in one call so failures (no anim
        // component, unknown clip) bubble back before any set-property.
        const lookup = await runSceneMethod<any>(
            'queryAnimationSetTargets',
            [uuid, args.defaultClip ?? null],
            { capture: false },
        );
        if (!lookup || lookup.success !== true) {
            return fail(lookup?.error ?? 'queryAnimationSetTargets returned no data');
        }
        const { componentIndex, clipUuid } = lookup.data ?? {};
        if (typeof componentIndex !== 'number') {
            return fail('queryAnimationSetTargets did not return componentIndex');
        }

        // Step 2: host-side set-property writes for each requested field.
        // Scalar paths per Landmine #11 propagate immediately, no nudge.
        const updated: string[] = [];
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
        } catch (err: any) {
            logger.error('[AnimationTools] set-property failed:', err);
            return fail(`set-property failed after partial update [${updated.join(', ')}]: ${err?.message ?? String(err)}`);
        }

        return {
            success: true,
            message: `Updated ${updated.join(', ')} on cc.Animation`,
            data: { nodeUuid: uuid, componentIndex, updated },
            updatedProperties: updated,
        };
    },
};

const animationListStates: ToolDef = {
    name: 'list_animation_states',
    title: 'List animation states',
    description: 'List cc.AnimationState entries on a node\'s cc.Animation component.',
    inputSchema: z.object({
        nodeUuid: z.string().describe('UUID of the node with the cc.Animation component.'),
    }),
    handler: async (args) => {
        return runSceneMethodAsToolResponse('listAnimationStates', [args.nodeUuid]);
    },
};

const animationGetStateInfo: ToolDef = {
    name: 'get_animation_state_info',
    title: 'Get animation state info',
    description: 'Get speed and timing info for a named cc.AnimationState.',
    inputSchema: z.object({
        nodeUuid: z.string().describe('UUID of the node with the cc.Animation component.'),
        stateName: z.string().describe('Animation state name.'),
    }),
    handler: async (args) => {
        return runSceneMethodAsToolResponse('getAnimationStateInfo', [args.nodeUuid, args.stateName]);
    },
};

const animationSetSpeed: ToolDef = {
    name: 'set_animation_speed',
    title: 'Set animation speed',
    description: 'Set speed on a named cc.AnimationState.',
    inputSchema: z.object({
        nodeUuid: z.string().describe('UUID of the node with the cc.Animation component.'),
        stateName: z.string().describe('Animation state name.'),
        speed: z.number().describe('New AnimationState.speed value.'),
    }),
    handler: async (args) => {
        return runSceneMethodAsToolResponse('setAnimationSpeed', [args.nodeUuid, args.stateName, args.speed]);
    },
};

const animationCheckFinished: ToolDef = {
    name: 'check_animation_finished',
    title: 'Check animation finished',
    description: 'Check whether a named cc.AnimationState has reached its end time.',
    inputSchema: z.object({
        nodeUuid: z.string().describe('UUID of the node with the cc.Animation component.'),
        stateName: z.string().describe('Animation state name.'),
    }),
    handler: async (args) => {
        return runSceneMethodAsToolResponse('checkAnimationFinished', [args.nodeUuid, args.stateName]);
    },
};

export class AnimationTools {
    private impl = defineTools([
        animationCheckFinished,
        animationGetStateInfo,
        animationListClips,
        animationListStates,
        animationPlay,
        animationSetSpeed,
        animationStop,
        animationSetClip,
    ]);

    getTools() {
        return this.impl.getTools();
    }

    execute(toolName: string, args: any) {
        return this.impl.execute(toolName, args);
    }
}
