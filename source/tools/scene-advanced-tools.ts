import { ToolDefinition, ToolResponse, ToolExecutor } from '../types';
import { z } from '../lib/schema';
import { defineTools, ToolDef } from '../lib/define-tools';

// Several tools accept either a single UUID or an array of UUIDs.
const stringOrStringArray = z.union([z.string(), z.array(z.string())]);

export class SceneAdvancedTools implements ToolExecutor {
    private readonly exec: ToolExecutor;

    constructor() {
        const defs: ToolDef[] = [
            { name: 'reset_node_property', description: 'Reset one node property to Cocos default; mutates scene.',
                inputSchema: z.object({
                    uuid: z.string().describe('Node UUID whose property should be reset.'),
                    path: z.string().describe('Node property path to reset, e.g. position, rotation, scale, layer.'),
                }), handler: a => this.resetNodeProperty(a.uuid, a.path) },
            { name: 'move_array_element', description: 'Move an item in a node array property such as __comps__; mutates scene.',
                inputSchema: z.object({
                    uuid: z.string().describe('Node UUID that owns the array property.'),
                    path: z.string().describe('Array property path, e.g. __comps__.'),
                    target: z.number().describe('Original index of the array item to move.'),
                    offset: z.number().describe('Relative move offset; positive moves later, negative moves earlier.'),
                }), handler: a => this.moveArrayElement(a.uuid, a.path, a.target, a.offset) },
            { name: 'remove_array_element', description: 'Remove an item from a node array property by index; mutates scene.',
                inputSchema: z.object({
                    uuid: z.string().describe('Node UUID that owns the array property.'),
                    path: z.string().describe('Array property path to edit.'),
                    index: z.number().describe('Array index to remove.'),
                }), handler: a => this.removeArrayElement(a.uuid, a.path, a.index) },
            { name: 'copy_node', description: 'Copy nodes through the Cocos scene clipboard channel.',
                inputSchema: z.object({
                    uuids: stringOrStringArray.describe('Node UUID or UUID array to copy into the editor clipboard context.'),
                }), handler: a => this.copyNode(a.uuids) },
            { name: 'paste_node', description: 'Paste copied nodes under a target parent; mutates scene and returns new UUIDs.',
                inputSchema: z.object({
                    target: z.string().describe('Target parent node UUID for pasted nodes.'),
                    uuids: stringOrStringArray.describe('Node UUID or UUID array returned/used by copy_node.'),
                    keepWorldTransform: z.boolean().default(false).describe('Preserve world transform while pasting/reparenting when Cocos supports it.'),
                }), handler: a => this.pasteNode(a.target, a.uuids, a.keepWorldTransform) },
            { name: 'cut_node', description: 'Cut nodes through the Cocos scene channel; clipboard/scene side effects.',
                inputSchema: z.object({
                    uuids: stringOrStringArray.describe('Node UUID or UUID array to cut via editor scene channel.'),
                }), handler: a => this.cutNode(a.uuids) },
            { name: 'reset_node_transform', description: 'Reset node transform to Cocos defaults; mutates scene.',
                inputSchema: z.object({
                    uuid: z.string().describe('Node UUID whose transform should be reset to default.'),
                }), handler: a => this.resetNodeTransform(a.uuid) },
            { name: 'reset_component', description: 'Reset a component by component UUID; mutates scene.',
                inputSchema: z.object({
                    uuid: z.string().describe('Component UUID to reset to default values.'),
                }), handler: a => this.resetComponent(a.uuid) },
            { name: 'restore_prefab', description: 'Restore a prefab instance through scene/restore-prefab; mutates scene.',
                inputSchema: z.object({
                    nodeUuid: z.string().describe('Prefab instance node UUID to restore.'),
                    assetUuid: z.string().describe('Prefab asset UUID kept for context; scene/restore-prefab uses nodeUuid only.'),
                }), handler: a => this.restorePrefab(a.nodeUuid, a.assetUuid) },
            { name: 'execute_component_method', description: 'Execute an editor-exposed component method; side effects depend on method.',
                inputSchema: z.object({
                    uuid: z.string().describe('Component UUID whose editor-exposed method should be invoked.'),
                    name: z.string().describe('Method name to execute on the component.'),
                    args: z.array(z.any()).default([]).describe('Positional method arguments.'),
                }), handler: a => this.executeComponentMethod(a.uuid, a.name, a.args) },
            { name: 'execute_scene_script', description: 'Execute a scene script method; low-level escape hatch that can mutate scene.',
                inputSchema: z.object({
                    name: z.string().describe('Scene script package/plugin name.'),
                    method: z.string().describe('Scene script method name to execute.'),
                    args: z.array(z.any()).default([]).describe('Positional method arguments.'),
                }), handler: a => this.executeSceneScript(a.name, a.method, a.args) },
            { name: 'scene_snapshot', description: 'Create a Cocos scene snapshot for undo/change tracking.',
                inputSchema: z.object({}), handler: () => this.sceneSnapshot() },
            { name: 'scene_snapshot_abort', description: 'Abort the current Cocos scene snapshot.',
                inputSchema: z.object({}), handler: () => this.sceneSnapshotAbort() },
            { name: 'begin_undo_recording', description: 'Begin undo recording for a node and return undoId.',
                inputSchema: z.object({
                    nodeUuid: z.string().describe('Node UUID whose changes should be covered by the undo recording.'),
                }), handler: a => this.beginUndoRecording(a.nodeUuid) },
            { name: 'end_undo_recording', description: 'Commit a previously started undo recording.',
                inputSchema: z.object({
                    undoId: z.string().describe('Undo recording ID returned by begin_undo_recording.'),
                }), handler: a => this.endUndoRecording(a.undoId) },
            { name: 'cancel_undo_recording', description: 'Cancel a previously started undo recording.',
                inputSchema: z.object({
                    undoId: z.string().describe('Undo recording ID to cancel without committing.'),
                }), handler: a => this.cancelUndoRecording(a.undoId) },
            { name: 'soft_reload_scene', description: 'Soft reload the current scene; Editor state side effect.',
                inputSchema: z.object({}), handler: () => this.softReloadScene() },
            { name: 'query_scene_ready', description: 'Check whether the scene module reports ready.',
                inputSchema: z.object({}), handler: () => this.querySceneReady() },
            { name: 'query_scene_dirty', description: 'Check whether the current scene has unsaved changes.',
                inputSchema: z.object({}), handler: () => this.querySceneDirty() },
            { name: 'query_scene_classes', description: 'List registered scene classes, optionally filtered by base class.',
                inputSchema: z.object({
                    extends: z.string().optional().describe('Optional base class filter for scene/query-classes.'),
                }), handler: a => this.querySceneClasses(a.extends) },
            { name: 'query_scene_components', description: 'List available scene component definitions from Cocos.',
                inputSchema: z.object({}), handler: () => this.querySceneComponents() },
            { name: 'query_component_has_script', description: 'Check whether a component class has an associated script.',
                inputSchema: z.object({
                    className: z.string().describe('Script class name to check through scene/query-component-has-script.'),
                }), handler: a => this.queryComponentHasScript(a.className) },
            { name: 'query_nodes_by_asset_uuid', description: 'Find current-scene nodes that reference an asset UUID.',
                inputSchema: z.object({
                    assetUuid: z.string().describe('Asset UUID to search for in scene nodes.'),
                }), handler: a => this.queryNodesByAssetUuid(a.assetUuid) },
        ];
        this.exec = defineTools(defs);
    }

    getTools(): ToolDefinition[] { return this.exec.getTools(); }
    execute(toolName: string, args: any): Promise<ToolResponse> { return this.exec.execute(toolName, args); }

    private async resetNodeProperty(uuid: string, path: string): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'reset-property', { 
                uuid, 
                path, 
                dump: { value: null } 
            }).then(() => {
                resolve({
                    success: true,
                    message: `Property '${path}' reset to default value`
                });
            }).catch((err: Error) => {
                resolve({ success: false, error: err.message });
            });
        });
    }

    private async moveArrayElement(uuid: string, path: string, target: number, offset: number): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'move-array-element', {
                uuid,
                path,
                target,
                offset
            }).then(() => {
                resolve({
                    success: true,
                    message: `Array element at index ${target} moved by ${offset}`
                });
            }).catch((err: Error) => {
                resolve({ success: false, error: err.message });
            });
        });
    }

    private async removeArrayElement(uuid: string, path: string, index: number): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'remove-array-element', {
                uuid,
                path,
                index
            }).then(() => {
                resolve({
                    success: true,
                    message: `Array element at index ${index} removed`
                });
            }).catch((err: Error) => {
                resolve({ success: false, error: err.message });
            });
        });
    }

    private async copyNode(uuids: string | string[]): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'copy-node', uuids).then((result: string | string[]) => {
                resolve({
                    success: true,
                    data: {
                        copiedUuids: result,
                        message: 'Node(s) copied successfully'
                    }
                });
            }).catch((err: Error) => {
                resolve({ success: false, error: err.message });
            });
        });
    }

    private async pasteNode(target: string, uuids: string | string[], keepWorldTransform: boolean = false): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'paste-node', {
                target,
                uuids,
                keepWorldTransform
            }).then((result: string | string[]) => {
                resolve({
                    success: true,
                    data: {
                        newUuids: result,
                        message: 'Node(s) pasted successfully'
                    }
                });
            }).catch((err: Error) => {
                resolve({ success: false, error: err.message });
            });
        });
    }

    private async cutNode(uuids: string | string[]): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'cut-node', uuids).then((result: any) => {
                resolve({
                    success: true,
                    data: {
                        cutUuids: result,
                        message: 'Node(s) cut successfully'
                    }
                });
            }).catch((err: Error) => {
                resolve({ success: false, error: err.message });
            });
        });
    }

    private async resetNodeTransform(uuid: string): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'reset-node', { uuid }).then(() => {
                resolve({
                    success: true,
                    message: 'Node transform reset to default'
                });
            }).catch((err: Error) => {
                resolve({ success: false, error: err.message });
            });
        });
    }

    private async resetComponent(uuid: string): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'reset-component', { uuid }).then(() => {
                resolve({
                    success: true,
                    message: 'Component reset to default values'
                });
            }).catch((err: Error) => {
                resolve({ success: false, error: err.message });
            });
        });
    }

    private async restorePrefab(nodeUuid: string, assetUuid: string): Promise<ToolResponse> {
        // scene/restore-prefab takes ResetComponentOptions = { uuid: string }
        // per @cocos/creator-types. assetUuid is kept on the public schema for
        // response context but does not flow into the editor message — passing
        // extra positional args is silently dropped by Editor.Message.
        void assetUuid;
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'restore-prefab', { uuid: nodeUuid }).then(() => {
                resolve({
                    success: true,
                    message: 'Prefab restored successfully'
                });
            }).catch((err: Error) => {
                resolve({ success: false, error: err.message });
            });
        });
    }

    private async executeComponentMethod(uuid: string, name: string, args: any[] = []): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'execute-component-method', {
                uuid,
                name,
                args
            }).then((result: any) => {
                resolve({
                    success: true,
                    data: {
                        result: result,
                        message: `Method '${name}' executed successfully`
                    }
                });
            }).catch((err: Error) => {
                resolve({ success: false, error: err.message });
            });
        });
    }

    private async executeSceneScript(name: string, method: string, args: any[] = []): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'execute-scene-script', {
                name,
                method,
                args
            }).then((result: any) => {
                resolve({
                    success: true,
                    data: result
                });
            }).catch((err: Error) => {
                resolve({ success: false, error: err.message });
            });
        });
    }

    private async sceneSnapshot(): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'snapshot').then(() => {
                resolve({
                    success: true,
                    message: 'Scene snapshot created'
                });
            }).catch((err: Error) => {
                resolve({ success: false, error: err.message });
            });
        });
    }

    private async sceneSnapshotAbort(): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'snapshot-abort').then(() => {
                resolve({
                    success: true,
                    message: 'Scene snapshot aborted'
                });
            }).catch((err: Error) => {
                resolve({ success: false, error: err.message });
            });
        });
    }

    private async beginUndoRecording(nodeUuid: string): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'begin-recording', nodeUuid).then((undoId: string) => {
                resolve({
                    success: true,
                    data: {
                        undoId: undoId,
                        message: 'Undo recording started'
                    }
                });
            }).catch((err: Error) => {
                resolve({ success: false, error: err.message });
            });
        });
    }

    private async endUndoRecording(undoId: string): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'end-recording', undoId).then(() => {
                resolve({
                    success: true,
                    message: 'Undo recording ended'
                });
            }).catch((err: Error) => {
                resolve({ success: false, error: err.message });
            });
        });
    }

    private async cancelUndoRecording(undoId: string): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'cancel-recording', undoId).then(() => {
                resolve({
                    success: true,
                    message: 'Undo recording cancelled'
                });
            }).catch((err: Error) => {
                resolve({ success: false, error: err.message });
            });
        });
    }

    private async softReloadScene(): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'soft-reload').then(() => {
                resolve({
                    success: true,
                    message: 'Scene soft reloaded successfully'
                });
            }).catch((err: Error) => {
                resolve({ success: false, error: err.message });
            });
        });
    }

    private async querySceneReady(): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'query-is-ready').then((ready: boolean) => {
                resolve({
                    success: true,
                    data: {
                        ready: ready,
                        message: ready ? 'Scene is ready' : 'Scene is not ready'
                    }
                });
            }).catch((err: Error) => {
                resolve({ success: false, error: err.message });
            });
        });
    }

    private async querySceneDirty(): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'query-dirty').then((dirty: boolean) => {
                resolve({
                    success: true,
                    data: {
                        dirty: dirty,
                        message: dirty ? 'Scene has unsaved changes' : 'Scene is clean'
                    }
                });
            }).catch((err: Error) => {
                resolve({ success: false, error: err.message });
            });
        });
    }

    private async querySceneClasses(extendsClass?: string): Promise<ToolResponse> {
        return new Promise((resolve) => {
            const options: any = {};
            if (extendsClass) {
                options.extends = extendsClass;
            }

            Editor.Message.request('scene', 'query-classes', options).then((classes: any[]) => {
                resolve({
                    success: true,
                    data: {
                        classes: classes,
                        count: classes.length,
                        extendsFilter: extendsClass
                    }
                });
            }).catch((err: Error) => {
                resolve({ success: false, error: err.message });
            });
        });
    }

    private async querySceneComponents(): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'query-components').then((components: any[]) => {
                resolve({
                    success: true,
                    data: {
                        components: components,
                        count: components.length
                    }
                });
            }).catch((err: Error) => {
                resolve({ success: false, error: err.message });
            });
        });
    }

    private async queryComponentHasScript(className: string): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'query-component-has-script', className).then((hasScript: boolean) => {
                resolve({
                    success: true,
                    data: {
                        className: className,
                        hasScript: hasScript,
                        message: hasScript ? `Component '${className}' has script` : `Component '${className}' does not have script`
                    }
                });
            }).catch((err: Error) => {
                resolve({ success: false, error: err.message });
            });
        });
    }

    private async queryNodesByAssetUuid(assetUuid: string): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'query-nodes-by-asset-uuid', assetUuid).then((nodeUuids: string[]) => {
                resolve({
                    success: true,
                    data: {
                        assetUuid: assetUuid,
                        nodeUuids: nodeUuids,
                        count: nodeUuids.length,
                        message: `Found ${nodeUuids.length} nodes using asset`
                    }
                });
            }).catch((err: Error) => {
                resolve({ success: false, error: err.message });
            });
        });
    }
}
