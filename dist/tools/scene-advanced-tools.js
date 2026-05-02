"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SceneAdvancedTools = void 0;
const schema_1 = require("../lib/schema");
const define_tools_1 = require("../lib/define-tools");
// Several tools accept either a single UUID or an array of UUIDs.
const stringOrStringArray = schema_1.z.union([schema_1.z.string(), schema_1.z.array(schema_1.z.string())]);
class SceneAdvancedTools {
    constructor() {
        const defs = [
            { name: 'reset_node_property', title: 'Reset node property', description: 'Reset one node property to Cocos default; mutates scene.',
                inputSchema: schema_1.z.object({
                    uuid: schema_1.z.string().describe('Node UUID whose property should be reset.'),
                    path: schema_1.z.string().describe('Node property path to reset, e.g. position, rotation, scale, layer.'),
                }), handler: a => this.resetNodeProperty(a.uuid, a.path) },
            { name: 'move_array_element', title: 'Move array element', description: 'Move an item in a node array property such as __comps__; mutates scene.',
                inputSchema: schema_1.z.object({
                    uuid: schema_1.z.string().describe('Node UUID that owns the array property.'),
                    path: schema_1.z.string().describe('Array property path, e.g. __comps__.'),
                    target: schema_1.z.number().describe('Original index of the array item to move.'),
                    offset: schema_1.z.number().describe('Relative move offset; positive moves later, negative moves earlier.'),
                }), handler: a => this.moveArrayElement(a.uuid, a.path, a.target, a.offset) },
            { name: 'remove_array_element', title: 'Remove array element', description: 'Remove an item from a node array property by index; mutates scene.',
                inputSchema: schema_1.z.object({
                    uuid: schema_1.z.string().describe('Node UUID that owns the array property.'),
                    path: schema_1.z.string().describe('Array property path to edit.'),
                    index: schema_1.z.number().describe('Array index to remove.'),
                }), handler: a => this.removeArrayElement(a.uuid, a.path, a.index) },
            { name: 'copy_node', title: 'Copy scene nodes', description: 'Copy nodes through the Cocos scene clipboard channel.',
                inputSchema: schema_1.z.object({
                    uuids: stringOrStringArray.describe('Node UUID or UUID array to copy into the editor clipboard context.'),
                }), handler: a => this.copyNode(a.uuids) },
            { name: 'paste_node', title: 'Paste scene nodes', description: 'Paste copied nodes under a target parent; mutates scene and returns new UUIDs.',
                inputSchema: schema_1.z.object({
                    target: schema_1.z.string().describe('Target parent node UUID for pasted nodes.'),
                    uuids: stringOrStringArray.describe('Node UUID or UUID array returned/used by copy_node.'),
                    keepWorldTransform: schema_1.z.boolean().default(false).describe('Preserve world transform while pasting/reparenting when Cocos supports it.'),
                }), handler: a => this.pasteNode(a.target, a.uuids, a.keepWorldTransform) },
            { name: 'cut_node', title: 'Cut scene nodes', description: 'Cut nodes through the Cocos scene channel; clipboard/scene side effects.',
                inputSchema: schema_1.z.object({
                    uuids: stringOrStringArray.describe('Node UUID or UUID array to cut via editor scene channel.'),
                }), handler: a => this.cutNode(a.uuids) },
            { name: 'reset_node_transform', title: 'Reset node transform', description: 'Reset node transform to Cocos defaults; mutates scene.',
                inputSchema: schema_1.z.object({
                    uuid: schema_1.z.string().describe('Node UUID whose transform should be reset to default.'),
                }), handler: a => this.resetNodeTransform(a.uuid) },
            { name: 'reset_component', title: 'Reset component state', description: 'Reset a component by component UUID; mutates scene.',
                inputSchema: schema_1.z.object({
                    uuid: schema_1.z.string().describe('Component UUID to reset to default values.'),
                }), handler: a => this.resetComponent(a.uuid) },
            { name: 'restore_prefab', title: 'Restore prefab instance', description: 'Restore a prefab instance through scene/restore-prefab; mutates scene.',
                inputSchema: schema_1.z.object({
                    nodeUuid: schema_1.z.string().describe('Prefab instance node UUID to restore.'),
                    assetUuid: schema_1.z.string().describe('Prefab asset UUID kept for context; scene/restore-prefab uses nodeUuid only.'),
                }), handler: a => this.restorePrefab(a.nodeUuid, a.assetUuid) },
            { name: 'execute_component_method', title: 'Invoke component method', description: 'Execute an editor-exposed component method; side effects depend on method.',
                inputSchema: schema_1.z.object({
                    uuid: schema_1.z.string().describe('Component UUID whose editor-exposed method should be invoked.'),
                    name: schema_1.z.string().describe('Method name to execute on the component.'),
                    args: schema_1.z.array(schema_1.z.any()).default([]).describe('Positional method arguments.'),
                }), handler: a => this.executeComponentMethod(a.uuid, a.name, a.args) },
            { name: 'execute_scene_script', title: 'Run scene script', description: 'Execute a scene script method; low-level escape hatch that can mutate scene.',
                inputSchema: schema_1.z.object({
                    name: schema_1.z.string().describe('Scene script package/plugin name.'),
                    method: schema_1.z.string().describe('Scene script method name to execute.'),
                    args: schema_1.z.array(schema_1.z.any()).default([]).describe('Positional method arguments.'),
                }), handler: a => this.executeSceneScript(a.name, a.method, a.args) },
            { name: 'scene_snapshot', title: 'Create scene snapshot', description: 'Create a Cocos scene snapshot for undo/change tracking.',
                inputSchema: schema_1.z.object({}), handler: () => this.sceneSnapshot() },
            { name: 'scene_snapshot_abort', title: 'Abort scene snapshot', description: 'Abort the current Cocos scene snapshot.',
                inputSchema: schema_1.z.object({}), handler: () => this.sceneSnapshotAbort() },
            { name: 'begin_undo_recording', title: 'Begin undo recording', description: 'Begin undo recording for a node and return undoId.',
                inputSchema: schema_1.z.object({
                    nodeUuid: schema_1.z.string().describe('Node UUID whose changes should be covered by the undo recording.'),
                }), handler: a => this.beginUndoRecording(a.nodeUuid) },
            { name: 'end_undo_recording', title: 'Commit undo recording', description: 'Commit a previously started undo recording.',
                inputSchema: schema_1.z.object({
                    undoId: schema_1.z.string().describe('Undo recording ID returned by begin_undo_recording.'),
                }), handler: a => this.endUndoRecording(a.undoId) },
            { name: 'cancel_undo_recording', title: 'Cancel undo recording', description: 'Cancel a previously started undo recording.',
                inputSchema: schema_1.z.object({
                    undoId: schema_1.z.string().describe('Undo recording ID to cancel without committing.'),
                }), handler: a => this.cancelUndoRecording(a.undoId) },
            { name: 'soft_reload_scene', title: 'Reload current scene', description: 'Soft reload the current scene; Editor state side effect.',
                inputSchema: schema_1.z.object({}), handler: () => this.softReloadScene() },
            { name: 'query_scene_ready', title: 'Check scene readiness', description: 'Check whether the scene module reports ready.',
                inputSchema: schema_1.z.object({}), handler: () => this.querySceneReady() },
            { name: 'query_scene_dirty', title: 'Check scene dirty state', description: 'Check whether the current scene has unsaved changes.',
                inputSchema: schema_1.z.object({}), handler: () => this.querySceneDirty() },
            { name: 'query_scene_classes', title: 'List scene classes', description: 'List registered scene classes, optionally filtered by base class.',
                inputSchema: schema_1.z.object({
                    extends: schema_1.z.string().optional().describe('Optional base class filter for scene/query-classes.'),
                }), handler: a => this.querySceneClasses(a.extends) },
            { name: 'query_scene_components', title: 'List scene components', description: 'List available scene component definitions from Cocos.',
                inputSchema: schema_1.z.object({}), handler: () => this.querySceneComponents() },
            { name: 'query_component_has_script', title: 'Check component script', description: 'Check whether a component class has an associated script.',
                inputSchema: schema_1.z.object({
                    className: schema_1.z.string().describe('Script class name to check through scene/query-component-has-script.'),
                }), handler: a => this.queryComponentHasScript(a.className) },
            { name: 'query_nodes_by_asset_uuid', title: 'Find nodes by asset', description: 'Find current-scene nodes that reference an asset UUID.',
                inputSchema: schema_1.z.object({
                    assetUuid: schema_1.z.string().describe('Asset UUID to search for in scene nodes.'),
                }), handler: a => this.queryNodesByAssetUuid(a.assetUuid) },
        ];
        this.exec = (0, define_tools_1.defineTools)(defs);
    }
    getTools() { return this.exec.getTools(); }
    execute(toolName, args) { return this.exec.execute(toolName, args); }
    async resetNodeProperty(uuid, path) {
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
            }).catch((err) => {
                resolve({ success: false, error: err.message });
            });
        });
    }
    async moveArrayElement(uuid, path, target, offset) {
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
            }).catch((err) => {
                resolve({ success: false, error: err.message });
            });
        });
    }
    async removeArrayElement(uuid, path, index) {
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
            }).catch((err) => {
                resolve({ success: false, error: err.message });
            });
        });
    }
    async copyNode(uuids) {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'copy-node', uuids).then((result) => {
                resolve({
                    success: true,
                    data: {
                        copiedUuids: result,
                        message: 'Node(s) copied successfully'
                    }
                });
            }).catch((err) => {
                resolve({ success: false, error: err.message });
            });
        });
    }
    async pasteNode(target, uuids, keepWorldTransform = false) {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'paste-node', {
                target,
                uuids,
                keepWorldTransform
            }).then((result) => {
                resolve({
                    success: true,
                    data: {
                        newUuids: result,
                        message: 'Node(s) pasted successfully'
                    }
                });
            }).catch((err) => {
                resolve({ success: false, error: err.message });
            });
        });
    }
    async cutNode(uuids) {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'cut-node', uuids).then((result) => {
                resolve({
                    success: true,
                    data: {
                        cutUuids: result,
                        message: 'Node(s) cut successfully'
                    }
                });
            }).catch((err) => {
                resolve({ success: false, error: err.message });
            });
        });
    }
    async resetNodeTransform(uuid) {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'reset-node', { uuid }).then(() => {
                resolve({
                    success: true,
                    message: 'Node transform reset to default'
                });
            }).catch((err) => {
                resolve({ success: false, error: err.message });
            });
        });
    }
    async resetComponent(uuid) {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'reset-component', { uuid }).then(() => {
                resolve({
                    success: true,
                    message: 'Component reset to default values'
                });
            }).catch((err) => {
                resolve({ success: false, error: err.message });
            });
        });
    }
    async restorePrefab(nodeUuid, assetUuid) {
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
            }).catch((err) => {
                resolve({ success: false, error: err.message });
            });
        });
    }
    async executeComponentMethod(uuid, name, args = []) {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'execute-component-method', {
                uuid,
                name,
                args
            }).then((result) => {
                resolve({
                    success: true,
                    data: {
                        result: result,
                        message: `Method '${name}' executed successfully`
                    }
                });
            }).catch((err) => {
                resolve({ success: false, error: err.message });
            });
        });
    }
    async executeSceneScript(name, method, args = []) {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'execute-scene-script', {
                name,
                method,
                args
            }).then((result) => {
                resolve({
                    success: true,
                    data: result
                });
            }).catch((err) => {
                resolve({ success: false, error: err.message });
            });
        });
    }
    async sceneSnapshot() {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'snapshot').then(() => {
                resolve({
                    success: true,
                    message: 'Scene snapshot created'
                });
            }).catch((err) => {
                resolve({ success: false, error: err.message });
            });
        });
    }
    async sceneSnapshotAbort() {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'snapshot-abort').then(() => {
                resolve({
                    success: true,
                    message: 'Scene snapshot aborted'
                });
            }).catch((err) => {
                resolve({ success: false, error: err.message });
            });
        });
    }
    async beginUndoRecording(nodeUuid) {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'begin-recording', nodeUuid).then((undoId) => {
                resolve({
                    success: true,
                    data: {
                        undoId: undoId,
                        message: 'Undo recording started'
                    }
                });
            }).catch((err) => {
                resolve({ success: false, error: err.message });
            });
        });
    }
    async endUndoRecording(undoId) {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'end-recording', undoId).then(() => {
                resolve({
                    success: true,
                    message: 'Undo recording ended'
                });
            }).catch((err) => {
                resolve({ success: false, error: err.message });
            });
        });
    }
    async cancelUndoRecording(undoId) {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'cancel-recording', undoId).then(() => {
                resolve({
                    success: true,
                    message: 'Undo recording cancelled'
                });
            }).catch((err) => {
                resolve({ success: false, error: err.message });
            });
        });
    }
    async softReloadScene() {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'soft-reload').then(() => {
                resolve({
                    success: true,
                    message: 'Scene soft reloaded successfully'
                });
            }).catch((err) => {
                resolve({ success: false, error: err.message });
            });
        });
    }
    async querySceneReady() {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'query-is-ready').then((ready) => {
                resolve({
                    success: true,
                    data: {
                        ready: ready,
                        message: ready ? 'Scene is ready' : 'Scene is not ready'
                    }
                });
            }).catch((err) => {
                resolve({ success: false, error: err.message });
            });
        });
    }
    async querySceneDirty() {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'query-dirty').then((dirty) => {
                resolve({
                    success: true,
                    data: {
                        dirty: dirty,
                        message: dirty ? 'Scene has unsaved changes' : 'Scene is clean'
                    }
                });
            }).catch((err) => {
                resolve({ success: false, error: err.message });
            });
        });
    }
    async querySceneClasses(extendsClass) {
        return new Promise((resolve) => {
            const options = {};
            if (extendsClass) {
                options.extends = extendsClass;
            }
            Editor.Message.request('scene', 'query-classes', options).then((classes) => {
                resolve({
                    success: true,
                    data: {
                        classes: classes,
                        count: classes.length,
                        extendsFilter: extendsClass
                    }
                });
            }).catch((err) => {
                resolve({ success: false, error: err.message });
            });
        });
    }
    async querySceneComponents() {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'query-components').then((components) => {
                resolve({
                    success: true,
                    data: {
                        components: components,
                        count: components.length
                    }
                });
            }).catch((err) => {
                resolve({ success: false, error: err.message });
            });
        });
    }
    async queryComponentHasScript(className) {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'query-component-has-script', className).then((hasScript) => {
                resolve({
                    success: true,
                    data: {
                        className: className,
                        hasScript: hasScript,
                        message: hasScript ? `Component '${className}' has script` : `Component '${className}' does not have script`
                    }
                });
            }).catch((err) => {
                resolve({ success: false, error: err.message });
            });
        });
    }
    async queryNodesByAssetUuid(assetUuid) {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'query-nodes-by-asset-uuid', assetUuid).then((nodeUuids) => {
                resolve({
                    success: true,
                    data: {
                        assetUuid: assetUuid,
                        nodeUuids: nodeUuids,
                        count: nodeUuids.length,
                        message: `Found ${nodeUuids.length} nodes using asset`
                    }
                });
            }).catch((err) => {
                resolve({ success: false, error: err.message });
            });
        });
    }
}
exports.SceneAdvancedTools = SceneAdvancedTools;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NlbmUtYWR2YW5jZWQtdG9vbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvdG9vbHMvc2NlbmUtYWR2YW5jZWQtdG9vbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQ0EsMENBQWtDO0FBQ2xDLHNEQUEyRDtBQUUzRCxrRUFBa0U7QUFDbEUsTUFBTSxtQkFBbUIsR0FBRyxVQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsVUFBQyxDQUFDLE1BQU0sRUFBRSxFQUFFLFVBQUMsQ0FBQyxLQUFLLENBQUMsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBRXZFLE1BQWEsa0JBQWtCO0lBRzNCO1FBQ0ksTUFBTSxJQUFJLEdBQWM7WUFDcEIsRUFBRSxJQUFJLEVBQUUscUJBQXFCLEVBQUUsS0FBSyxFQUFFLHFCQUFxQixFQUFFLFdBQVcsRUFBRSwwREFBMEQ7Z0JBQ2hJLFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDO29CQUNsQixJQUFJLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQywyQ0FBMkMsQ0FBQztvQkFDdEUsSUFBSSxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLENBQUMscUVBQXFFLENBQUM7aUJBQ25HLENBQUMsRUFBRSxPQUFPLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUU7WUFDOUQsRUFBRSxJQUFJLEVBQUUsb0JBQW9CLEVBQUUsS0FBSyxFQUFFLG9CQUFvQixFQUFFLFdBQVcsRUFBRSx5RUFBeUU7Z0JBQzdJLFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDO29CQUNsQixJQUFJLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyx5Q0FBeUMsQ0FBQztvQkFDcEUsSUFBSSxFQUFF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QVUsRUFBRSxFQUFFO2dCQUNwQixPQUFPLENBQUMsRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxHQUFHLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQztZQUNwRCxDQUFDLENBQUMsQ0FBQztRQUNQLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztJQUVPLEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxTQUFpQjtRQUNqRCxPQUFPLElBQUksT0FBTyxDQUFDLENBQUMsT0FBTyxFQUFFLEVBQUU7WUFDM0IsTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLDJCQUEyQixFQUFFLFNBQVMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLFNBQW1CLEVBQUUsRUFBRTtnQkFDakcsT0FBTyxDQUFDO29CQUNKLE9BQU8sRUFBRSxJQUFJO29CQUNiLElBQUksRUFBRTt3QkFDRixTQUFTLEVBQUUsU0FBUzt3QkFDcEIsU0FBUyxFQUFFLFNBQVM7d0JBQ3BCLEtBQUssRUFBRSxTQUFTLENBQUMsTUFBTTt3QkFDdkIsT0FBTyxFQUFFLFNBQVMsU0FBUyxDQUFDLE1BQU0sb0JBQW9CO3FCQUN6RDtpQkFDSixDQUFDLENBQUM7WUFDUCxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFVLEVBQUUsRUFBRTtnQkFDcEIsT0FBTyxDQUFDLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsR0FBRyxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUM7WUFDcEQsQ0FBQyxDQUFDLENBQUM7UUFDUCxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7Q0FDSjtBQTNkRCxnREEyZEMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBUb29sRGVmaW5pdGlvbiwgVG9vbFJlc3BvbnNlLCBUb29sRXhlY3V0b3IgfSBmcm9tICcuLi90eXBlcyc7XG5pbXBvcnQgeyB6IH0gZnJvbSAnLi4vbGliL3NjaGVtYSc7XG5pbXBvcnQgeyBkZWZpbmVUb29scywgVG9vbERlZiB9IGZyb20gJy4uL2xpYi9kZWZpbmUtdG9vbHMnO1xuXG4vLyBTZXZlcmFsIHRvb2xzIGFjY2VwdCBlaXRoZXIgYSBzaW5nbGUgVVVJRCBvciBhbiBhcnJheSBvZiBVVUlEcy5cbmNvbnN0IHN0cmluZ09yU3RyaW5nQXJyYXkgPSB6LnVuaW9uKFt6LnN0cmluZygpLCB6LmFycmF5KHouc3RyaW5nKCkpXSk7XG5cbmV4cG9ydCBjbGFzcyBTY2VuZUFkdmFuY2VkVG9vbHMgaW1wbGVtZW50cyBUb29sRXhlY3V0b3Ige1xuICAgIHByaXZhdGUgcmVhZG9ubHkgZXhlYzogVG9vbEV4ZWN1dG9yO1xuXG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIGNvbnN0IGRlZnM6IFRvb2xEZWZbXSA9IFtcbiAgICAgICAgICAgIHsgbmFtZTogJ3Jlc2V0X25vZGVfcHJvcGVydHknLCB0aXRsZTogJ1Jlc2V0IG5vZGUgcHJvcGVydHknLCBkZXNjcmlwdGlvbjogJ1Jlc2V0IG9uZSBub2RlIHByb3BlcnR5IHRvIENvY29zIGRlZmF1bHQ7IG11dGF0ZXMgc2NlbmUuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICB1dWlkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdOb2RlIFVVSUQgd2hvc2UgcHJvcGVydHkgc2hvdWxkIGJlIHJlc2V0LicpLFxuICAgICAgICAgICAgICAgICAgICBwYXRoOiB6LnN0cmluZygpLmRlc2NyaWJlKCdOb2RlIHByb3BlcnR5IHBhdGggdG8gcmVzZXQsIGUuZy4gcG9zaXRpb24sIHJvdGF0aW9uLCBzY2FsZSwgbGF5ZXIuJyksXG4gICAgICAgICAgICAgICAgfSksIGhhbmRsZXI6IGEgPT4gdGhpcy5yZXNldE5vZGVQcm9wZXJ0eShhLnV1aWQsIGEucGF0aCkgfSxcbiAgICAgICAgICAgIHsgbmFtZTogJ21vdmVfYXJyYXlfZWxlbWVudCcsIHRpdGxlOiAnTW92ZSBhcnJheSBlbGVtZW50JywgZGVzY3JpcHRpb246ICdNb3ZlIGFuIGl0ZW0gaW4gYSBub2RlIGFycmF5IHByb3BlcnR5IHN1Y2ggYXMgX19jb21wc19fOyBtdXRhdGVzIHNjZW5lLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgdXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnTm9kZSBVVUlEIHRoYXQgb3ducyB0aGUgYXJyYXkgcHJvcGVydHkuJyksXG4gICAgICAgICAgICAgICAgICAgIHBhdGg6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0FycmF5IHByb3BlcnR5IHBhdGgsIGUuZy4gX19jb21wc19fLicpLFxuICAgICAgICAgICAgICAgICAgICB0YXJnZXQ6IHoubnVtYmVyKCkuZGVzY3JpYmUoJ09yaWdpbmFsIGluZGV4IG9mIHRoZSBhcnJheSBpdGVtIHRvIG1vdmUuJyksXG4gICAgICAgICAgICAgICAgICAgIG9mZnNldDogei5udW1iZXIoKS5kZXNjcmliZSgnUmVsYXRpdmUgbW92ZSBvZmZzZXQ7IHBvc2l0aXZlIG1vdmVzIGxhdGVyLCBuZWdhdGl2ZSBtb3ZlcyBlYXJsaWVyLicpLFxuICAgICAgICAgICAgICAgIH0pLCBoYW5kbGVyOiBhID0+IHRoaXMubW92ZUFycmF5RWxlbWVudChhLnV1aWQsIGEucGF0aCwgYS50YXJnZXQsIGEub2Zmc2V0KSB9LFxuICAgICAgICAgICAgeyBuYW1lOiAncmVtb3ZlX2FycmF5X2VsZW1lbnQnLCB0aXRsZTogJ1JlbW92ZSBhcnJheSBlbGVtZW50JywgZGVzY3JpcHRpb246ICdSZW1vdmUgYW4gaXRlbSBmcm9tIGEgbm9kZSBhcnJheSBwcm9wZXJ0eSBieSBpbmRleDsgbXV0YXRlcyBzY2VuZS4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ05vZGUgVVVJRCB0aGF0IG93bnMgdGhlIGFycmF5IHByb3BlcnR5LicpLFxuICAgICAgICAgICAgICAgICAgICBwYXRoOiB6LnN0cmluZygpLmRlc2NyaWJlKCdBcnJheSBwcm9wZXJ0eSBwYXRoIHRvIGVkaXQuJyksXG4gICAgICAgICAgICAgICAgICAgIGluZGV4OiB6Lm51bWJlcigpLmRlc2NyaWJlKCdBcnJheSBpbmRleCB0byByZW1vdmUuJyksXG4gICAgICAgICAgICAgICAgfSksIGhhbmRsZXI6IGEgPT4gdGhpcy5yZW1vdmVBcnJheUVsZW1lbnQoYS51dWlkLCBhLnBhdGgsIGEuaW5kZXgpIH0sXG4gICAgICAgICAgICB7IG5hbWU6ICdjb3B5X25vZGUnLCB0aXRsZTogJ0NvcHkgc2NlbmUgbm9kZXMnLCBkZXNjcmlwdGlvbjogJ0NvcHkgbm9kZXMgdGhyb3VnaCB0aGUgQ29jb3Mgc2NlbmUgY2xpcGJvYXJkIGNoYW5uZWwuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICB1dWlkczogc3RyaW5nT3JTdHJpbmdBcnJheS5kZXNjcmliZSgnTm9kZSBVVUlEIG9yIFVVSUQgYXJyYXkgdG8gY29weSBpbnRvIHRoZSBlZGl0b3IgY2xpcGJvYXJkIGNvbnRleHQuJyksXG4gICAgICAgICAgICAgICAgfSksIGhhbmRsZXI6IGEgPT4gdGhpcy5jb3B5Tm9kZShhLnV1aWRzKSB9LFxuICAgICAgICAgICAgeyBuYW1lOiAncGFzdGVfbm9kZScsIHRpdGxlOiAnUGFzdGUgc2NlbmUgbm9kZXMnLCBkZXNjcmlwdGlvbjogJ1Bhc3RlIGNvcGllZCBub2RlcyB1bmRlciBhIHRhcmdldCBwYXJlbnQ7IG11dGF0ZXMgc2NlbmUgYW5kIHJldHVybnMgbmV3IFVVSURzLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0OiB6LnN0cmluZygpLmRlc2NyaWJlKCdUYXJnZXQgcGFyZW50IG5vZGUgVVVJRCBmb3IgcGFzdGVkIG5vZGVzLicpLFxuICAgICAgICAgICAgICAgICAgICB1dWlkczogc3RyaW5nT3JTdHJpbmdBcnJheS5kZXNjcmliZSgnTm9kZSBVVUlEIG9yIFVVSUQgYXJyYXkgcmV0dXJuZWQvdXNlZCBieSBjb3B5X25vZGUuJyksXG4gICAgICAgICAgICAgICAgICAgIGtlZXBXb3JsZFRyYW5zZm9ybTogei5ib29sZWFuKCkuZGVmYXVsdChmYWxzZSkuZGVzY3JpYmUoJ1ByZXNlcnZlIHdvcmxkIHRyYW5zZm9ybSB3aGlsZSBwYXN0aW5nL3JlcGFyZW50aW5nIHdoZW4gQ29jb3Mgc3VwcG9ydHMgaXQuJyksXG4gICAgICAgICAgICAgICAgfSksIGhhbmRsZXI6IGEgPT4gdGhpcy5wYXN0ZU5vZGUoYS50YXJnZXQsIGEudXVpZHMsIGEua2VlcFdvcmxkVHJhbnNmb3JtKSB9LFxuICAgICAgICAgICAgeyBuYW1lOiAnY3V0X25vZGUnLCB0aXRsZTogJ0N1dCBzY2VuZSBub2RlcycsIGRlc2NyaXB0aW9uOiAnQ3V0IG5vZGVzIHRocm91Z2ggdGhlIENvY29zIHNjZW5lIGNoYW5uZWw7IGNsaXBib2FyZC9zY2VuZSBzaWRlIGVmZmVjdHMuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICB1dWlkczogc3RyaW5nT3JTdHJpbmdBcnJheS5kZXNjcmliZSgnTm9kZSBVVUlEIG9yIFVVSUQgYXJyYXkgdG8gY3V0IHZpYSBlZGl0b3Igc2NlbmUgY2hhbm5lbC4nKSxcbiAgICAgICAgICAgICAgICB9KSwgaGFuZGxlcjogYSA9PiB0aGlzLmN1dE5vZGUoYS51dWlkcykgfSxcbiAgICAgICAgICAgIHsgbmFtZTogJ3Jlc2V0X25vZGVfdHJhbnNmb3JtJywgdGl0bGU6ICdSZXNldCBub2RlIHRyYW5zZm9ybScsIGRlc2NyaXB0aW9uOiAnUmVzZXQgbm9kZSB0cmFuc2Zvcm0gdG8gQ29jb3MgZGVmYXVsdHM7IG11dGF0ZXMgc2NlbmUuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICB1dWlkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdOb2RlIFVVSUQgd2hvc2UgdHJhbnNmb3JtIHNob3VsZCBiZSByZXNldCB0byBkZWZhdWx0LicpLFxuICAgICAgICAgICAgICAgIH0pLCBoYW5kbGVyOiBhID0+IHRoaXMucmVzZXROb2RlVHJhbnNmb3JtKGEudXVpZCkgfSxcbiAgICAgICAgICAgIHsgbmFtZTogJ3Jlc2V0X2NvbXBvbmVudCcsIHRpdGxlOiAnUmVzZXQgY29tcG9uZW50IHN0YXRlJywgZGVzY3JpcHRpb246ICdSZXNldCBhIGNvbXBvbmVudCBieSBjb21wb25lbnQgVVVJRDsgbXV0YXRlcyBzY2VuZS4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0NvbXBvbmVudCBVVUlEIHRvIHJlc2V0IHRvIGRlZmF1bHQgdmFsdWVzLicpLFxuICAgICAgICAgICAgICAgIH0pLCBoYW5kbGVyOiBhID0+IHRoaXMucmVzZXRDb21wb25lbnQoYS51dWlkKSB9LFxuICAgICAgICAgICAgeyBuYW1lOiAncmVzdG9yZV9wcmVmYWInLCB0aXRsZTogJ1Jlc3RvcmUgcHJlZmFiIGluc3RhbmNlJywgZGVzY3JpcHRpb246ICdSZXN0b3JlIGEgcHJlZmFiIGluc3RhbmNlIHRocm91Z2ggc2NlbmUvcmVzdG9yZS1wcmVmYWI7IG11dGF0ZXMgc2NlbmUuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBub2RlVXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnUHJlZmFiIGluc3RhbmNlIG5vZGUgVVVJRCB0byByZXN0b3JlLicpLFxuICAgICAgICAgICAgICAgICAgICBhc3NldFV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1ByZWZhYiBhc3NldCBVVUlEIGtlcHQgZm9yIGNvbnRleHQ7IHNjZW5lL3Jlc3RvcmUtcHJlZmFiIHVzZXMgbm9kZVV1aWQgb25seS4nKSxcbiAgICAgICAgICAgICAgICB9KSwgaGFuZGxlcjogYSA9PiB0aGlzLnJlc3RvcmVQcmVmYWIoYS5ub2RlVXVpZCwgYS5hc3NldFV1aWQpIH0sXG4gICAgICAgICAgICB7IG5hbWU6ICdleGVjdXRlX2NvbXBvbmVudF9tZXRob2QnLCB0aXRsZTogJ0ludm9rZSBjb21wb25lbnQgbWV0aG9kJywgZGVzY3JpcHRpb246ICdFeGVjdXRlIGFuIGVkaXRvci1leHBvc2VkIGNvbXBvbmVudCBtZXRob2Q7IHNpZGUgZWZmZWN0cyBkZXBlbmQgb24gbWV0aG9kLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgdXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnQ29tcG9uZW50IFVVSUQgd2hvc2UgZWRpdG9yLWV4cG9zZWQgbWV0aG9kIHNob3VsZCBiZSBpbnZva2VkLicpLFxuICAgICAgICAgICAgICAgICAgICBuYW1lOiB6LnN0cmluZygpLmRlc2NyaWJlKCdNZXRob2QgbmFtZSB0byBleGVjdXRlIG9uIHRoZSBjb21wb25lbnQuJyksXG4gICAgICAgICAgICAgICAgICAgIGFyZ3M6IHouYXJyYXkoei5hbnkoKSkuZGVmYXVsdChbXSkuZGVzY3JpYmUoJ1Bvc2l0aW9uYWwgbWV0aG9kIGFyZ3VtZW50cy4nKSxcbiAgICAgICAgICAgICAgICB9KSwgaGFuZGxlcjogYSA9PiB0aGlzLmV4ZWN1dGVDb21wb25lbnRNZXRob2QoYS51dWlkLCBhLm5hbWUsIGEuYXJncykgfSxcbiAgICAgICAgICAgIHsgbmFtZTogJ2V4ZWN1dGVfc2NlbmVfc2NyaXB0JywgdGl0bGU6ICdSdW4gc2NlbmUgc2NyaXB0JywgZGVzY3JpcHRpb246ICdFeGVjdXRlIGEgc2NlbmUgc2NyaXB0IG1ldGhvZDsgbG93LWxldmVsIGVzY2FwZSBoYXRjaCB0aGF0IGNhbiBtdXRhdGUgc2NlbmUuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBuYW1lOiB6LnN0cmluZygpLmRlc2NyaWJlKCdTY2VuZSBzY3JpcHQgcGFja2FnZS9wbHVnaW4gbmFtZS4nKSxcbiAgICAgICAgICAgICAgICAgICAgbWV0aG9kOiB6LnN0cmluZygpLmRlc2NyaWJlKCdTY2VuZSBzY3JpcHQgbWV0aG9kIG5hbWUgdG8gZXhlY3V0ZS4nKSxcbiAgICAgICAgICAgICAgICAgICAgYXJnczogei5hcnJheSh6LmFueSgpKS5kZWZhdWx0KFtdKS5kZXNjcmliZSgnUG9zaXRpb25hbCBtZXRob2QgYXJndW1lbnRzLicpLFxuICAgICAgICAgICAgICAgIH0pLCBoYW5kbGVyOiBhID0+IHRoaXMuZXhlY3V0ZVNjZW5lU2NyaXB0KGEubmFtZSwgYS5tZXRob2QsIGEuYXJncykgfSxcbiAgICAgICAgICAgIHsgbmFtZTogJ3NjZW5lX3NuYXBzaG90JywgdGl0bGU6ICdDcmVhdGUgc2NlbmUgc25hcHNob3QnLCBkZXNjcmlwdGlvbjogJ0NyZWF0ZSBhIENvY29zIHNjZW5lIHNuYXBzaG90IGZvciB1bmRvL2NoYW5nZSB0cmFja2luZy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksIGhhbmRsZXI6ICgpID0+IHRoaXMuc2NlbmVTbmFwc2hvdCgpIH0sXG4gICAgICAgICAgICB7IG5hbWU6ICdzY2VuZV9zbmFwc2hvdF9hYm9ydCcsIHRpdGxlOiAnQWJvcnQgc2NlbmUgc25hcHNob3QnLCBkZXNjcmlwdGlvbjogJ0Fib3J0IHRoZSBjdXJyZW50IENvY29zIHNjZW5lIHNuYXBzaG90LicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSwgaGFuZGxlcjogKCkgPT4gdGhpcy5zY2VuZVNuYXBzaG90QWJvcnQoKSB9LFxuICAgICAgICAgICAgeyBuYW1lOiAnYmVnaW5fdW5kb19yZWNvcmRpbmcnLCB0aXRsZTogJ0JlZ2luIHVuZG8gcmVjb3JkaW5nJywgZGVzY3JpcHRpb246ICdCZWdpbiB1bmRvIHJlY29yZGluZyBmb3IgYSBub2RlIGFuZCByZXR1cm4gdW5kb0lkLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ05vZGUgVVVJRCB3aG9zZSBjaGFuZ2VzIHNob3VsZCBiZSBjb3ZlcmVkIGJ5IHRoZSB1bmRvIHJlY29yZGluZy4nKSxcbiAgICAgICAgICAgICAgICB9KSwgaGFuZGxlcjogYSA9PiB0aGlzLmJlZ2luVW5kb1JlY29yZGluZyhhLm5vZGVVdWlkKSB9LFxuICAgICAgICAgICAgeyBuYW1lOiAnZW5kX3VuZG9fcmVjb3JkaW5nJywgdGl0bGU6ICdDb21taXQgdW5kbyByZWNvcmRpbmcnLCBkZXNjcmlwdGlvbjogJ0NvbW1pdCBhIHByZXZpb3VzbHkgc3RhcnRlZCB1bmRvIHJlY29yZGluZy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHVuZG9JZDogei5zdHJpbmcoKS5kZXNjcmliZSgnVW5kbyByZWNvcmRpbmcgSUQgcmV0dXJuZWQgYnkgYmVnaW5fdW5kb19yZWNvcmRpbmcuJyksXG4gICAgICAgICAgICAgICAgfSksIGhhbmRsZXI6IGEgPT4gdGhpcy5lbmRVbmRvUmVjb3JkaW5nKGEudW5kb0lkKSB9LFxuICAgICAgICAgICAgeyBuYW1lOiAnY2FuY2VsX3VuZG9fcmVjb3JkaW5nJywgdGl0bGU6ICdDYW5jZWwgdW5kbyByZWNvcmRpbmcnLCBkZXNjcmlwdGlvbjogJ0NhbmNlbCBhIHByZXZpb3VzbHkgc3RhcnRlZCB1bmRvIHJlY29yZGluZy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHVuZG9JZDogei5zdHJpbmcoKS5kZXNjcmliZSgnVW5kbyByZWNvcmRpbmcgSUQgdG8gY2FuY2VsIHdpdGhvdXQgY29tbWl0dGluZy4nKSxcbiAgICAgICAgICAgICAgICB9KSwgaGFuZGxlcjogYSA9PiB0aGlzLmNhbmNlbFVuZG9SZWNvcmRpbmcoYS51bmRvSWQpIH0sXG4gICAgICAgICAgICB7IG5hbWU6ICdzb2Z0X3JlbG9hZF9zY2VuZScsIHRpdGxlOiAnUmVsb2FkIGN1cnJlbnQgc2NlbmUnLCBkZXNjcmlwdGlvbjogJ1NvZnQgcmVsb2FkIHRoZSBjdXJyZW50IHNjZW5lOyBFZGl0b3Igc3RhdGUgc2lkZSBlZmZlY3QuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pLCBoYW5kbGVyOiAoKSA9PiB0aGlzLnNvZnRSZWxvYWRTY2VuZSgpIH0sXG4gICAgICAgICAgICB7IG5hbWU6ICdxdWVyeV9zY2VuZV9yZWFkeScsIHRpdGxlOiAnQ2hlY2sgc2NlbmUgcmVhZGluZXNzJywgZGVzY3JpcHRpb246ICdDaGVjayB3aGV0aGVyIHRoZSBzY2VuZSBtb2R1bGUgcmVwb3J0cyByZWFkeS4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksIGhhbmRsZXI6ICgpID0+IHRoaXMucXVlcnlTY2VuZVJlYWR5KCkgfSxcbiAgICAgICAgICAgIHsgbmFtZTogJ3F1ZXJ5X3NjZW5lX2RpcnR5JywgdGl0bGU6ICdDaGVjayBzY2VuZSBkaXJ0eSBzdGF0ZScsIGRlc2NyaXB0aW9uOiAnQ2hlY2sgd2hldGhlciB0aGUgY3VycmVudCBzY2VuZSBoYXMgdW5zYXZlZCBjaGFuZ2VzLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSwgaGFuZGxlcjogKCkgPT4gdGhpcy5xdWVyeVNjZW5lRGlydHkoKSB9LFxuICAgICAgICAgICAgeyBuYW1lOiAncXVlcnlfc2NlbmVfY2xhc3NlcycsIHRpdGxlOiAnTGlzdCBzY2VuZSBjbGFzc2VzJywgZGVzY3JpcHRpb246ICdMaXN0IHJlZ2lzdGVyZWQgc2NlbmUgY2xhc3Nlcywgb3B0aW9uYWxseSBmaWx0ZXJlZCBieSBiYXNlIGNsYXNzLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgZXh0ZW5kczogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdPcHRpb25hbCBiYXNlIGNsYXNzIGZpbHRlciBmb3Igc2NlbmUvcXVlcnktY2xhc3Nlcy4nKSxcbiAgICAgICAgICAgICAgICB9KSwgaGFuZGxlcjogYSA9PiB0aGlzLnF1ZXJ5U2NlbmVDbGFzc2VzKGEuZXh0ZW5kcykgfSxcbiAgICAgICAgICAgIHsgbmFtZTogJ3F1ZXJ5X3NjZW5lX2NvbXBvbmVudHMnLCB0aXRsZTogJ0xpc3Qgc2NlbmUgY29tcG9uZW50cycsIGRlc2NyaXB0aW9uOiAnTGlzdCBhdmFpbGFibGUgc2NlbmUgY29tcG9uZW50IGRlZmluaXRpb25zIGZyb20gQ29jb3MuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pLCBoYW5kbGVyOiAoKSA9PiB0aGlzLnF1ZXJ5U2NlbmVDb21wb25lbnRzKCkgfSxcbiAgICAgICAgICAgIHsgbmFtZTogJ3F1ZXJ5X2NvbXBvbmVudF9oYXNfc2NyaXB0JywgdGl0bGU6ICdDaGVjayBjb21wb25lbnQgc2NyaXB0JywgZGVzY3JpcHRpb246ICdDaGVjayB3aGV0aGVyIGEgY29tcG9uZW50IGNsYXNzIGhhcyBhbiBhc3NvY2lhdGVkIHNjcmlwdC4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZTogei5zdHJpbmcoKS5kZXNjcmliZSgnU2NyaXB0IGNsYXNzIG5hbWUgdG8gY2hlY2sgdGhyb3VnaCBzY2VuZS9xdWVyeS1jb21wb25lbnQtaGFzLXNjcmlwdC4nKSxcbiAgICAgICAgICAgICAgICB9KSwgaGFuZGxlcjogYSA9PiB0aGlzLnF1ZXJ5Q29tcG9uZW50SGFzU2NyaXB0KGEuY2xhc3NOYW1lKSB9LFxuICAgICAgICAgICAgeyBuYW1lOiAncXVlcnlfbm9kZXNfYnlfYXNzZXRfdXVpZCcsIHRpdGxlOiAnRmluZCBub2RlcyBieSBhc3NldCcsIGRlc2NyaXB0aW9uOiAnRmluZCBjdXJyZW50LXNjZW5lIG5vZGVzIHRoYXQgcmVmZXJlbmNlIGFuIGFzc2V0IFVVSUQuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBhc3NldFV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0Fzc2V0IFVVSUQgdG8gc2VhcmNoIGZvciBpbiBzY2VuZSBub2Rlcy4nKSxcbiAgICAgICAgICAgICAgICB9KSwgaGFuZGxlcjogYSA9PiB0aGlzLnF1ZXJ5Tm9kZXNCeUFzc2V0VXVpZChhLmFzc2V0VXVpZCkgfSxcbiAgICAgICAgXTtcbiAgICAgICAgdGhpcy5leGVjID0gZGVmaW5lVG9vbHMoZGVmcyk7XG4gICAgfVxuXG4gICAgZ2V0VG9vbHMoKTogVG9vbERlZmluaXRpb25bXSB7IHJldHVybiB0aGlzLmV4ZWMuZ2V0VG9vbHMoKTsgfVxuICAgIGV4ZWN1dGUodG9vbE5hbWU6IHN0cmluZywgYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHsgcmV0dXJuIHRoaXMuZXhlYy5leGVjdXRlKHRvb2xOYW1lLCBhcmdzKTsgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyByZXNldE5vZGVQcm9wZXJ0eSh1dWlkOiBzdHJpbmcsIHBhdGg6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncmVzZXQtcHJvcGVydHknLCB7IFxuICAgICAgICAgICAgICAgIHV1aWQsIFxuICAgICAgICAgICAgICAgIHBhdGgsIFxuICAgICAgICAgICAgICAgIGR1bXA6IHsgdmFsdWU6IG51bGwgfSBcbiAgICAgICAgICAgIH0pLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgUHJvcGVydHkgJyR7cGF0aH0nIHJlc2V0IHRvIGRlZmF1bHQgdmFsdWVgXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVyci5tZXNzYWdlIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgbW92ZUFycmF5RWxlbWVudCh1dWlkOiBzdHJpbmcsIHBhdGg6IHN0cmluZywgdGFyZ2V0OiBudW1iZXIsIG9mZnNldDogbnVtYmVyKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdtb3ZlLWFycmF5LWVsZW1lbnQnLCB7XG4gICAgICAgICAgICAgICAgdXVpZCxcbiAgICAgICAgICAgICAgICBwYXRoLFxuICAgICAgICAgICAgICAgIHRhcmdldCxcbiAgICAgICAgICAgICAgICBvZmZzZXRcbiAgICAgICAgICAgIH0pLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgQXJyYXkgZWxlbWVudCBhdCBpbmRleCAke3RhcmdldH0gbW92ZWQgYnkgJHtvZmZzZXR9YFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHJlbW92ZUFycmF5RWxlbWVudCh1dWlkOiBzdHJpbmcsIHBhdGg6IHN0cmluZywgaW5kZXg6IG51bWJlcik6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncmVtb3ZlLWFycmF5LWVsZW1lbnQnLCB7XG4gICAgICAgICAgICAgICAgdXVpZCxcbiAgICAgICAgICAgICAgICBwYXRoLFxuICAgICAgICAgICAgICAgIGluZGV4XG4gICAgICAgICAgICB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYEFycmF5IGVsZW1lbnQgYXQgaW5kZXggJHtpbmRleH0gcmVtb3ZlZGBcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBjb3B5Tm9kZSh1dWlkczogc3RyaW5nIHwgc3RyaW5nW10pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ2NvcHktbm9kZScsIHV1aWRzKS50aGVuKChyZXN1bHQ6IHN0cmluZyB8IHN0cmluZ1tdKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvcGllZFV1aWRzOiByZXN1bHQsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiAnTm9kZShzKSBjb3BpZWQgc3VjY2Vzc2Z1bGx5J1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVyci5tZXNzYWdlIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgcGFzdGVOb2RlKHRhcmdldDogc3RyaW5nLCB1dWlkczogc3RyaW5nIHwgc3RyaW5nW10sIGtlZXBXb3JsZFRyYW5zZm9ybTogYm9vbGVhbiA9IGZhbHNlKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdwYXN0ZS1ub2RlJywge1xuICAgICAgICAgICAgICAgIHRhcmdldCxcbiAgICAgICAgICAgICAgICB1dWlkcyxcbiAgICAgICAgICAgICAgICBrZWVwV29ybGRUcmFuc2Zvcm1cbiAgICAgICAgICAgIH0pLnRoZW4oKHJlc3VsdDogc3RyaW5nIHwgc3RyaW5nW10pID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAgbmV3VXVpZHM6IHJlc3VsdCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdOb2RlKHMpIHBhc3RlZCBzdWNjZXNzZnVsbHknXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBjdXROb2RlKHV1aWRzOiBzdHJpbmcgfCBzdHJpbmdbXSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnY3V0LW5vZGUnLCB1dWlkcykudGhlbigocmVzdWx0OiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAgY3V0VXVpZHM6IHJlc3VsdCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdOb2RlKHMpIGN1dCBzdWNjZXNzZnVsbHknXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyByZXNldE5vZGVUcmFuc2Zvcm0odXVpZDogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdyZXNldC1ub2RlJywgeyB1dWlkIH0pLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiAnTm9kZSB0cmFuc2Zvcm0gcmVzZXQgdG8gZGVmYXVsdCdcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyByZXNldENvbXBvbmVudCh1dWlkOiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3Jlc2V0LWNvbXBvbmVudCcsIHsgdXVpZCB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogJ0NvbXBvbmVudCByZXNldCB0byBkZWZhdWx0IHZhbHVlcydcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyByZXN0b3JlUHJlZmFiKG5vZGVVdWlkOiBzdHJpbmcsIGFzc2V0VXVpZDogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgLy8gc2NlbmUvcmVzdG9yZS1wcmVmYWIgdGFrZXMgUmVzZXRDb21wb25lbnRPcHRpb25zID0geyB1dWlkOiBzdHJpbmcgfVxuICAgICAgICAvLyBwZXIgQGNvY29zL2NyZWF0b3ItdHlwZXMuIGFzc2V0VXVpZCBpcyBrZXB0IG9uIHRoZSBwdWJsaWMgc2NoZW1hIGZvclxuICAgICAgICAvLyByZXNwb25zZSBjb250ZXh0IGJ1dCBkb2VzIG5vdCBmbG93IGludG8gdGhlIGVkaXRvciBtZXNzYWdlIOKAlCBwYXNzaW5nXG4gICAgICAgIC8vIGV4dHJhIHBvc2l0aW9uYWwgYXJncyBpcyBzaWxlbnRseSBkcm9wcGVkIGJ5IEVkaXRvci5NZXNzYWdlLlxuICAgICAgICB2b2lkIGFzc2V0VXVpZDtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdyZXN0b3JlLXByZWZhYicsIHsgdXVpZDogbm9kZVV1aWQgfSkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdQcmVmYWIgcmVzdG9yZWQgc3VjY2Vzc2Z1bGx5J1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGV4ZWN1dGVDb21wb25lbnRNZXRob2QodXVpZDogc3RyaW5nLCBuYW1lOiBzdHJpbmcsIGFyZ3M6IGFueVtdID0gW10pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ2V4ZWN1dGUtY29tcG9uZW50LW1ldGhvZCcsIHtcbiAgICAgICAgICAgICAgICB1dWlkLFxuICAgICAgICAgICAgICAgIG5hbWUsXG4gICAgICAgICAgICAgICAgYXJnc1xuICAgICAgICAgICAgfSkudGhlbigocmVzdWx0OiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0OiByZXN1bHQsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgTWV0aG9kICcke25hbWV9JyBleGVjdXRlZCBzdWNjZXNzZnVsbHlgXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBleGVjdXRlU2NlbmVTY3JpcHQobmFtZTogc3RyaW5nLCBtZXRob2Q6IHN0cmluZywgYXJnczogYW55W10gPSBbXSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnZXhlY3V0ZS1zY2VuZS1zY3JpcHQnLCB7XG4gICAgICAgICAgICAgICAgbmFtZSxcbiAgICAgICAgICAgICAgICBtZXRob2QsXG4gICAgICAgICAgICAgICAgYXJnc1xuICAgICAgICAgICAgfSkudGhlbigocmVzdWx0OiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgZGF0YTogcmVzdWx0XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVyci5tZXNzYWdlIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgc2NlbmVTbmFwc2hvdCgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3NuYXBzaG90JykudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdTY2VuZSBzbmFwc2hvdCBjcmVhdGVkJ1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHNjZW5lU25hcHNob3RBYm9ydCgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3NuYXBzaG90LWFib3J0JykudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdTY2VuZSBzbmFwc2hvdCBhYm9ydGVkJ1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGJlZ2luVW5kb1JlY29yZGluZyhub2RlVXVpZDogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdiZWdpbi1yZWNvcmRpbmcnLCBub2RlVXVpZCkudGhlbigodW5kb0lkOiBzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAgdW5kb0lkOiB1bmRvSWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiAnVW5kbyByZWNvcmRpbmcgc3RhcnRlZCdcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGVuZFVuZG9SZWNvcmRpbmcodW5kb0lkOiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ2VuZC1yZWNvcmRpbmcnLCB1bmRvSWQpLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiAnVW5kbyByZWNvcmRpbmcgZW5kZWQnXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVyci5tZXNzYWdlIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgY2FuY2VsVW5kb1JlY29yZGluZyh1bmRvSWQ6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnY2FuY2VsLXJlY29yZGluZycsIHVuZG9JZCkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdVbmRvIHJlY29yZGluZyBjYW5jZWxsZWQnXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVyci5tZXNzYWdlIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgc29mdFJlbG9hZFNjZW5lKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnc29mdC1yZWxvYWQnKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogJ1NjZW5lIHNvZnQgcmVsb2FkZWQgc3VjY2Vzc2Z1bGx5J1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHF1ZXJ5U2NlbmVSZWFkeSgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LWlzLXJlYWR5JykudGhlbigocmVhZHk6IGJvb2xlYW4pID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVhZHk6IHJlYWR5LFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogcmVhZHkgPyAnU2NlbmUgaXMgcmVhZHknIDogJ1NjZW5lIGlzIG5vdCByZWFkeSdcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHF1ZXJ5U2NlbmVEaXJ0eSgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LWRpcnR5JykudGhlbigoZGlydHk6IGJvb2xlYW4pID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAgZGlydHk6IGRpcnR5LFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogZGlydHkgPyAnU2NlbmUgaGFzIHVuc2F2ZWQgY2hhbmdlcycgOiAnU2NlbmUgaXMgY2xlYW4nXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBxdWVyeVNjZW5lQ2xhc3NlcyhleHRlbmRzQ2xhc3M/OiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IG9wdGlvbnM6IGFueSA9IHt9O1xuICAgICAgICAgICAgaWYgKGV4dGVuZHNDbGFzcykge1xuICAgICAgICAgICAgICAgIG9wdGlvbnMuZXh0ZW5kcyA9IGV4dGVuZHNDbGFzcztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktY2xhc3NlcycsIG9wdGlvbnMpLnRoZW4oKGNsYXNzZXM6IGFueVtdKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNsYXNzZXM6IGNsYXNzZXMsXG4gICAgICAgICAgICAgICAgICAgICAgICBjb3VudDogY2xhc3Nlcy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgICAgICBleHRlbmRzRmlsdGVyOiBleHRlbmRzQ2xhc3NcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHF1ZXJ5U2NlbmVDb21wb25lbnRzKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktY29tcG9uZW50cycpLnRoZW4oKGNvbXBvbmVudHM6IGFueVtdKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudHM6IGNvbXBvbmVudHMsXG4gICAgICAgICAgICAgICAgICAgICAgICBjb3VudDogY29tcG9uZW50cy5sZW5ndGhcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHF1ZXJ5Q29tcG9uZW50SGFzU2NyaXB0KGNsYXNzTmFtZTogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1jb21wb25lbnQtaGFzLXNjcmlwdCcsIGNsYXNzTmFtZSkudGhlbigoaGFzU2NyaXB0OiBib29sZWFuKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZTogY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgaGFzU2NyaXB0OiBoYXNTY3JpcHQsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBoYXNTY3JpcHQgPyBgQ29tcG9uZW50ICcke2NsYXNzTmFtZX0nIGhhcyBzY3JpcHRgIDogYENvbXBvbmVudCAnJHtjbGFzc05hbWV9JyBkb2VzIG5vdCBoYXZlIHNjcmlwdGBcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHF1ZXJ5Tm9kZXNCeUFzc2V0VXVpZChhc3NldFV1aWQ6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktbm9kZXMtYnktYXNzZXQtdXVpZCcsIGFzc2V0VXVpZCkudGhlbigobm9kZVV1aWRzOiBzdHJpbmdbXSkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhc3NldFV1aWQ6IGFzc2V0VXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG5vZGVVdWlkczogbm9kZVV1aWRzLFxuICAgICAgICAgICAgICAgICAgICAgICAgY291bnQ6IG5vZGVVdWlkcy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgRm91bmQgJHtub2RlVXVpZHMubGVuZ3RofSBub2RlcyB1c2luZyBhc3NldGBcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG59XG4iXX0=