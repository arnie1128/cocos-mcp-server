import { ToolDefinition, ToolResponse, ToolExecutor } from '../types';
import { z, toInputSchema, validateArgs } from '../lib/schema';

// Several tools accept either a single UUID or an array of UUIDs.
const stringOrStringArray = z.union([z.string(), z.array(z.string())]);

const sceneAdvancedSchemas = {
    reset_node_property: z.object({
        uuid: z.string().describe('Node UUID'),
        path: z.string().describe('Property path (e.g., position, rotation, scale)'),
    }),
    move_array_element: z.object({
        uuid: z.string().describe('Node UUID'),
        path: z.string().describe('Array property path (e.g., __comps__)'),
        target: z.number().describe('Target item original index'),
        offset: z.number().describe('Offset amount (positive or negative)'),
    }),
    remove_array_element: z.object({
        uuid: z.string().describe('Node UUID'),
        path: z.string().describe('Array property path'),
        index: z.number().describe('Target item index to remove'),
    }),
    copy_node: z.object({
        uuids: stringOrStringArray.describe('Node UUID or array of UUIDs to copy'),
    }),
    paste_node: z.object({
        target: z.string().describe('Target parent node UUID'),
        uuids: stringOrStringArray.describe('Node UUIDs to paste'),
        keepWorldTransform: z.boolean().default(false).describe('Keep world transform coordinates'),
    }),
    cut_node: z.object({
        uuids: stringOrStringArray.describe('Node UUID or array of UUIDs to cut'),
    }),
    reset_node_transform: z.object({
        uuid: z.string().describe('Node UUID'),
    }),
    reset_component: z.object({
        uuid: z.string().describe('Component UUID'),
    }),
    restore_prefab: z.object({
        nodeUuid: z.string().describe('Node UUID'),
        assetUuid: z.string().describe('Prefab asset UUID'),
    }),
    execute_component_method: z.object({
        uuid: z.string().describe('Component UUID'),
        name: z.string().describe('Method name'),
        args: z.array(z.any()).default([]).describe('Method arguments'),
    }),
    execute_scene_script: z.object({
        name: z.string().describe('Plugin name'),
        method: z.string().describe('Method name'),
        args: z.array(z.any()).default([]).describe('Method arguments'),
    }),
    scene_snapshot: z.object({}),
    scene_snapshot_abort: z.object({}),
    begin_undo_recording: z.object({
        nodeUuid: z.string().describe('Node UUID to record'),
    }),
    end_undo_recording: z.object({
        undoId: z.string().describe('Undo recording ID from begin_undo_recording'),
    }),
    cancel_undo_recording: z.object({
        undoId: z.string().describe('Undo recording ID to cancel'),
    }),
    soft_reload_scene: z.object({}),
    query_scene_ready: z.object({}),
    query_scene_dirty: z.object({}),
    query_scene_classes: z.object({
        extends: z.string().optional().describe('Filter classes that extend this base class'),
    }),
    query_scene_components: z.object({}),
    query_component_has_script: z.object({
        className: z.string().describe('Script class name to check'),
    }),
    query_nodes_by_asset_uuid: z.object({
        assetUuid: z.string().describe('Asset UUID to search for'),
    }),
} as const;

const sceneAdvancedToolMeta: Record<keyof typeof sceneAdvancedSchemas, string> = {
    reset_node_property: 'Reset node property to default value',
    move_array_element: 'Move array element position',
    remove_array_element: 'Remove array element at specific index',
    copy_node: 'Copy node for later paste operation',
    paste_node: 'Paste previously copied nodes',
    cut_node: 'Cut node (copy + mark for move)',
    reset_node_transform: 'Reset node position, rotation and scale',
    reset_component: 'Reset component to default values',
    restore_prefab: 'Restore prefab instance from asset',
    execute_component_method: 'Execute method on component',
    execute_scene_script: 'Execute scene script method',
    scene_snapshot: 'Create scene state snapshot',
    scene_snapshot_abort: 'Abort scene snapshot creation',
    begin_undo_recording: 'Begin recording undo data',
    end_undo_recording: 'End recording undo data',
    cancel_undo_recording: 'Cancel undo recording',
    soft_reload_scene: 'Soft reload current scene',
    query_scene_ready: 'Check if scene is ready',
    query_scene_dirty: 'Check if scene has unsaved changes',
    query_scene_classes: 'Query all registered classes',
    query_scene_components: 'Query available scene components',
    query_component_has_script: 'Check if component has script',
    query_nodes_by_asset_uuid: 'Find nodes that use specific asset UUID',
};

export class SceneAdvancedTools implements ToolExecutor {
    getTools(): ToolDefinition[] {
        return (Object.keys(sceneAdvancedSchemas) as Array<keyof typeof sceneAdvancedSchemas>).map(name => ({
            name,
            description: sceneAdvancedToolMeta[name],
            inputSchema: toInputSchema(sceneAdvancedSchemas[name]),
        }));
    }

    async execute(toolName: string, args: any): Promise<ToolResponse> {
        const schemaName = toolName as keyof typeof sceneAdvancedSchemas;
        const schema = sceneAdvancedSchemas[schemaName];
        if (!schema) {
            throw new Error(`Unknown tool: ${toolName}`);
        }
        const validation = validateArgs(schema, args ?? {});
        if (!validation.ok) {
            return validation.response;
        }
        const a = validation.data as any;

        switch (schemaName) {
            case 'reset_node_property':
                return await this.resetNodeProperty(a.uuid, a.path);
            case 'move_array_element':
                return await this.moveArrayElement(a.uuid, a.path, a.target, a.offset);
            case 'remove_array_element':
                return await this.removeArrayElement(a.uuid, a.path, a.index);
            case 'copy_node':
                return await this.copyNode(a.uuids);
            case 'paste_node':
                return await this.pasteNode(a.target, a.uuids, a.keepWorldTransform);
            case 'cut_node':
                return await this.cutNode(a.uuids);
            case 'reset_node_transform':
                return await this.resetNodeTransform(a.uuid);
            case 'reset_component':
                return await this.resetComponent(a.uuid);
            case 'restore_prefab':
                return await this.restorePrefab(a.nodeUuid, a.assetUuid);
            case 'execute_component_method':
                return await this.executeComponentMethod(a.uuid, a.name, a.args);
            case 'execute_scene_script':
                return await this.executeSceneScript(a.name, a.method, a.args);
            case 'scene_snapshot':
                return await this.sceneSnapshot();
            case 'scene_snapshot_abort':
                return await this.sceneSnapshotAbort();
            case 'begin_undo_recording':
                return await this.beginUndoRecording(a.nodeUuid);
            case 'end_undo_recording':
                return await this.endUndoRecording(a.undoId);
            case 'cancel_undo_recording':
                return await this.cancelUndoRecording(a.undoId);
            case 'soft_reload_scene':
                return await this.softReloadScene();
            case 'query_scene_ready':
                return await this.querySceneReady();
            case 'query_scene_dirty':
                return await this.querySceneDirty();
            case 'query_scene_classes':
                return await this.querySceneClasses(a.extends);
            case 'query_scene_components':
                return await this.querySceneComponents();
            case 'query_component_has_script':
                return await this.queryComponentHasScript(a.className);
            case 'query_nodes_by_asset_uuid':
                return await this.queryNodesByAssetUuid(a.assetUuid);
        }
    }

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