import { ok, fail } from '../lib/response';
import type { ToolDefinition, ToolResponse, ToolExecutor } from '../types';
import { z } from '../lib/schema';
import { mcpTool, defineToolsFromDecorators } from '../lib/decorators';

// Several tools accept either a single UUID or an array of UUIDs.
const stringOrStringArray = z.union([z.string(), z.array(z.string())]);

export class SceneAdvancedTools implements ToolExecutor {
    private readonly exec: ToolExecutor;

    constructor() {
        this.exec = defineToolsFromDecorators(this);
    }

    getTools(): ToolDefinition[] { return this.exec.getTools(); }
    execute(toolName: string, args: any): Promise<ToolResponse> { return this.exec.execute(toolName, args); }

    @mcpTool({ name: 'reset_node_property', title: 'Reset node property', description: '[specialist] Reset one node property to Cocos default; mutates scene.',
        inputSchema: z.object({
            uuid: z.string().describe('Node UUID whose property should be reset.'),
            path: z.string().describe('Node property path to reset, e.g. position, rotation, scale, layer.'),
        }) })
    async resetNodeProperty(args: { uuid: string; path: string }): Promise<ToolResponse> {
        return this.resetNodePropertyImpl(args.uuid, args.path);
    }

    @mcpTool({ name: 'move_array_element', title: 'Move array element', description: '[specialist] Move an item in a node array property such as __comps__; mutates scene.',
        inputSchema: z.object({
            uuid: z.string().describe('Node UUID that owns the array property.'),
            path: z.string().describe('Array property path, e.g. __comps__.'),
            target: z.number().describe('Original index of the array item to move.'),
            offset: z.number().describe('Relative move offset; positive moves later, negative moves earlier.'),
        }) })
    async moveArrayElement(args: { uuid: string; path: string; target: number; offset: number }): Promise<ToolResponse> {
        return this.moveArrayElementImpl(args.uuid, args.path, args.target, args.offset);
    }

    @mcpTool({ name: 'remove_array_element', title: 'Remove array element', description: '[specialist] Remove an item from a node array property by index; mutates scene.',
        inputSchema: z.object({
            uuid: z.string().describe('Node UUID that owns the array property.'),
            path: z.string().describe('Array property path to edit.'),
            index: z.number().describe('Array index to remove.'),
        }) })
    async removeArrayElement(args: { uuid: string; path: string; index: number }): Promise<ToolResponse> {
        return this.removeArrayElementImpl(args.uuid, args.path, args.index);
    }

    @mcpTool({ name: 'copy_node', title: 'Copy scene nodes', description: '[specialist] Copy nodes through the Cocos scene clipboard channel.',
        inputSchema: z.object({
            uuids: stringOrStringArray.describe('Node UUID or UUID array to copy into the editor clipboard context.'),
        }) })
    async copyNode(args: { uuids: string | string[] }): Promise<ToolResponse> {
        return this.copyNodeImpl(args.uuids);
    }

    @mcpTool({ name: 'paste_node', title: 'Paste scene nodes', description: '[specialist] Paste copied nodes under a target parent; mutates scene and returns new UUIDs.',
        inputSchema: z.object({
            target: z.string().describe('Target parent node UUID for pasted nodes.'),
            uuids: stringOrStringArray.describe('Node UUID or UUID array returned/used by copy_node.'),
            keepWorldTransform: z.boolean().default(false).describe('Preserve world transform while pasting/reparenting when Cocos supports it.'),
        }) })
    async pasteNode(args: { target: string; uuids: string | string[]; keepWorldTransform?: boolean }): Promise<ToolResponse> {
        return this.pasteNodeImpl(args.target, args.uuids, args.keepWorldTransform);
    }

    @mcpTool({ name: 'cut_node', title: 'Cut scene nodes', description: '[specialist] Cut nodes through the Cocos scene channel; clipboard/scene side effects.',
        inputSchema: z.object({
            uuids: stringOrStringArray.describe('Node UUID or UUID array to cut via editor scene channel.'),
        }) })
    async cutNode(args: { uuids: string | string[] }): Promise<ToolResponse> {
        return this.cutNodeImpl(args.uuids);
    }

    @mcpTool({ name: 'reset_node_transform', title: 'Reset node transform', description: '[specialist] Reset node transform to Cocos defaults; mutates scene.',
        inputSchema: z.object({
            uuid: z.string().describe('Node UUID whose transform should be reset to default.'),
        }) })
    async resetNodeTransform(args: { uuid: string }): Promise<ToolResponse> {
        return this.resetNodeTransformImpl(args.uuid);
    }

    @mcpTool({ name: 'reset_component', title: 'Reset component state', description: '[specialist] Reset a component by component UUID; mutates scene.',
        inputSchema: z.object({
            uuid: z.string().describe('Component UUID to reset to default values.'),
        }) })
    async resetComponent(args: { uuid: string }): Promise<ToolResponse> {
        return this.resetComponentImpl(args.uuid);
    }

    @mcpTool({ name: 'restore_prefab', title: 'Restore prefab instance', description: '[specialist] Restore a prefab instance through scene/restore-prefab; mutates scene.',
        inputSchema: z.object({
            nodeUuid: z.string().describe('Prefab instance node UUID to restore.'),
            assetUuid: z.string().describe('Prefab asset UUID kept for context; scene/restore-prefab uses nodeUuid only.'),
        }) })
    async restorePrefab(args: { nodeUuid: string; assetUuid: string }): Promise<ToolResponse> {
        return this.restorePrefabImpl(args.nodeUuid, args.assetUuid);
    }

    @mcpTool({ name: 'execute_component_method', title: 'Invoke component method', description: '[specialist] Execute an editor-exposed component method; side effects depend on method.',
        inputSchema: z.object({
            uuid: z.string().describe('Component UUID whose editor-exposed method should be invoked.'),
            name: z.string().describe('Method name to execute on the component.'),
            args: z.array(z.any()).default([]).describe('Positional method arguments.'),
        }) })
    async executeComponentMethod(args: { uuid: string; name: string; args?: any[] }): Promise<ToolResponse> {
        return this.executeComponentMethodImpl(args.uuid, args.name, args.args);
    }

    @mcpTool({ name: 'execute_scene_script', title: 'Run scene script', description: '[specialist] Execute a scene script method; low-level escape hatch that can mutate scene.',
        inputSchema: z.object({
            name: z.string().describe('Scene script package/plugin name.'),
            method: z.string().describe('Scene script method name to execute.'),
            args: z.array(z.any()).default([]).describe('Positional method arguments.'),
        }) })
    async executeSceneScript(args: { name: string; method: string; args?: any[] }): Promise<ToolResponse> {
        return this.executeSceneScriptImpl(args.name, args.method, args.args);
    }

    @mcpTool({ name: 'scene_snapshot', title: 'Create scene snapshot', description: '[specialist] Create a Cocos scene snapshot for undo/change tracking.',
        inputSchema: z.object({}) })
    async sceneSnapshot(): Promise<ToolResponse> {
        return this.sceneSnapshotImpl();
    }

    @mcpTool({ name: 'scene_snapshot_abort', title: 'Abort scene snapshot', description: '[specialist] Abort the current Cocos scene snapshot.',
        inputSchema: z.object({}) })
    async sceneSnapshotAbort(): Promise<ToolResponse> {
        return this.sceneSnapshotAbortImpl();
    }

    @mcpTool({ name: 'begin_undo_recording', title: 'Begin undo recording', description: '[specialist] Begin undo recording for a node and return undoId.',
        inputSchema: z.object({
            nodeUuid: z.string().describe('Node UUID whose changes should be covered by the undo recording.'),
        }) })
    async beginUndoRecording(args: { nodeUuid: string }): Promise<ToolResponse> {
        return this.beginUndoRecordingImpl(args.nodeUuid);
    }

    @mcpTool({ name: 'end_undo_recording', title: 'Commit undo recording', description: '[specialist] Commit a previously started undo recording.',
        inputSchema: z.object({
            undoId: z.string().describe('Undo recording ID returned by begin_undo_recording.'),
        }) })
    async endUndoRecording(args: { undoId: string }): Promise<ToolResponse> {
        return this.endUndoRecordingImpl(args.undoId);
    }

    @mcpTool({ name: 'cancel_undo_recording', title: 'Cancel undo recording', description: '[specialist] Cancel a previously started undo recording.',
        inputSchema: z.object({
            undoId: z.string().describe('Undo recording ID to cancel without committing.'),
        }) })
    async cancelUndoRecording(args: { undoId: string }): Promise<ToolResponse> {
        return this.cancelUndoRecordingImpl(args.undoId);
    }

    @mcpTool({ name: 'soft_reload_scene', title: 'Reload current scene', description: '[specialist] Soft reload the current scene; Editor state side effect.',
        inputSchema: z.object({}) })
    async softReloadScene(): Promise<ToolResponse> {
        return this.softReloadSceneImpl();
    }

    @mcpTool({ name: 'query_scene_ready', title: 'Check scene readiness', description: '[specialist] Check whether the scene module reports ready.',
        inputSchema: z.object({}) })
    async querySceneReady(): Promise<ToolResponse> {
        return this.querySceneReadyImpl();
    }

    @mcpTool({ name: 'query_scene_dirty', title: 'Check scene dirty state', description: '[specialist] Check whether the current scene has unsaved changes.',
        inputSchema: z.object({}) })
    async querySceneDirty(): Promise<ToolResponse> {
        return this.querySceneDirtyImpl();
    }

    @mcpTool({ name: 'query_scene_classes', title: 'List scene classes', description: '[specialist] List registered scene classes, optionally filtered by base class.',
        inputSchema: z.object({
            extends: z.string().optional().describe('Optional base class filter for scene/query-classes.'),
        }) })
    async querySceneClasses(args: { extends?: string }): Promise<ToolResponse> {
        return this.querySceneClassesImpl(args.extends);
    }

    @mcpTool({ name: 'query_scene_components', title: 'List scene components', description: '[specialist] List available scene component definitions from Cocos.',
        inputSchema: z.object({}) })
    async querySceneComponents(): Promise<ToolResponse> {
        return this.querySceneComponentsImpl();
    }

    @mcpTool({ name: 'query_component_has_script', title: 'Check component script', description: '[specialist] Check whether a component class has an associated script.',
        inputSchema: z.object({
            className: z.string().describe('Script class name to check through scene/query-component-has-script.'),
        }) })
    async queryComponentHasScript(args: { className: string }): Promise<ToolResponse> {
        return this.queryComponentHasScriptImpl(args.className);
    }

    @mcpTool({ name: 'query_nodes_by_asset_uuid', title: 'Find nodes by asset', description: '[specialist] Find current-scene nodes that reference an asset UUID.',
        inputSchema: z.object({
            assetUuid: z.string().describe('Asset UUID to search for in scene nodes.'),
        }) })
    async queryNodesByAssetUuid(args: { assetUuid: string }): Promise<ToolResponse> {
        return this.queryNodesByAssetUuidImpl(args.assetUuid);
    }

    private async resetNodePropertyImpl(uuid: string, path: string): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'reset-property', { 
                uuid, 
                path, 
                dump: { value: null } 
            }).then(() => {
                resolve(ok(undefined, `Property '${path}' reset to default value`));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async moveArrayElementImpl(uuid: string, path: string, target: number, offset: number): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'move-array-element', {
                uuid,
                path,
                target,
                offset
            }).then(() => {
                resolve(ok(undefined, `Array element at index ${target} moved by ${offset}`));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async removeArrayElementImpl(uuid: string, path: string, index: number): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'remove-array-element', {
                uuid,
                path,
                index
            }).then(() => {
                resolve(ok(undefined, `Array element at index ${index} removed`));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async copyNodeImpl(uuids: string | string[]): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'copy-node', uuids).then((result: string | string[]) => {
                resolve(ok({
                        copiedUuids: result,
                        message: 'Node(s) copied successfully'
                    }));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async pasteNodeImpl(target: string, uuids: string | string[], keepWorldTransform: boolean = false): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'paste-node', {
                target,
                uuids,
                keepWorldTransform
            }).then((result: string | string[]) => {
                resolve(ok({
                        newUuids: result,
                        message: 'Node(s) pasted successfully'
                    }));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async cutNodeImpl(uuids: string | string[]): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'cut-node', uuids).then((result: any) => {
                resolve(ok({
                        cutUuids: result,
                        message: 'Node(s) cut successfully'
                    }));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async resetNodeTransformImpl(uuid: string): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'reset-node', { uuid }).then(() => {
                resolve(ok(undefined, 'Node transform reset to default'));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async resetComponentImpl(uuid: string): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'reset-component', { uuid }).then(() => {
                resolve(ok(undefined, 'Component reset to default values'));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async restorePrefabImpl(nodeUuid: string, assetUuid: string): Promise<ToolResponse> {
        // scene/restore-prefab takes ResetComponentOptions = { uuid: string }
        // per @cocos/creator-types. assetUuid is kept on the public schema for
        // response context but does not flow into the editor message — passing
        // extra positional args is silently dropped by Editor.Message.
        void assetUuid;
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'restore-prefab', { uuid: nodeUuid }).then(() => {
                resolve(ok(undefined, 'Prefab restored successfully'));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async executeComponentMethodImpl(uuid: string, name: string, args: any[] = []): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'execute-component-method', {
                uuid,
                name,
                args
            }).then((result: any) => {
                resolve(ok({
                        result: result,
                        message: `Method '${name}' executed successfully`
                    }));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async executeSceneScriptImpl(name: string, method: string, args: any[] = []): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'execute-scene-script', {
                name,
                method,
                args
            }).then((result: any) => {
                resolve(ok(result));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async sceneSnapshotImpl(): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'snapshot').then(() => {
                resolve(ok(undefined, 'Scene snapshot created'));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async sceneSnapshotAbortImpl(): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'snapshot-abort').then(() => {
                resolve(ok(undefined, 'Scene snapshot aborted'));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async beginUndoRecordingImpl(nodeUuid: string): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'begin-recording', nodeUuid).then((undoId: string) => {
                resolve(ok({
                        undoId: undoId,
                        message: 'Undo recording started'
                    }));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async endUndoRecordingImpl(undoId: string): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'end-recording', undoId).then(() => {
                resolve(ok(undefined, 'Undo recording ended'));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async cancelUndoRecordingImpl(undoId: string): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'cancel-recording', undoId).then(() => {
                resolve(ok(undefined, 'Undo recording cancelled'));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async softReloadSceneImpl(): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'soft-reload').then(() => {
                resolve(ok(undefined, 'Scene soft reloaded successfully'));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async querySceneReadyImpl(): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'query-is-ready').then((ready: boolean) => {
                resolve(ok({
                        ready: ready,
                        message: ready ? 'Scene is ready' : 'Scene is not ready'
                    }));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async querySceneDirtyImpl(): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'query-dirty').then((dirty: boolean) => {
                resolve(ok({
                        dirty: dirty,
                        message: dirty ? 'Scene has unsaved changes' : 'Scene is clean'
                    }));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async querySceneClassesImpl(extendsClass?: string): Promise<ToolResponse> {
        return new Promise((resolve) => {
            const options: any = {};
            if (extendsClass) {
                options.extends = extendsClass;
            }

            Editor.Message.request('scene', 'query-classes', options).then((classes: any[]) => {
                resolve(ok({
                        classes: classes,
                        count: classes.length,
                        extendsFilter: extendsClass
                    }));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async querySceneComponentsImpl(): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'query-components').then((components: any[]) => {
                resolve(ok({
                        components: components,
                        count: components.length
                    }));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async queryComponentHasScriptImpl(className: string): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'query-component-has-script', className).then((hasScript: boolean) => {
                resolve(ok({
                        className: className,
                        hasScript: hasScript,
                        message: hasScript ? `Component '${className}' has script` : `Component '${className}' does not have script`
                    }));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async queryNodesByAssetUuidImpl(assetUuid: string): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'query-nodes-by-asset-uuid', assetUuid).then((nodeUuids: string[]) => {
                resolve(ok({
                        assetUuid: assetUuid,
                        nodeUuids: nodeUuids,
                        count: nodeUuids.length,
                        message: `Found ${nodeUuids.length} nodes using asset`
                    }));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }
}
