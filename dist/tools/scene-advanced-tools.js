"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SceneAdvancedTools = void 0;
const response_1 = require("../lib/response");
const schema_1 = require("../lib/schema");
const define_tools_1 = require("../lib/define-tools");
// Several tools accept either a single UUID or an array of UUIDs.
const stringOrStringArray = schema_1.z.union([schema_1.z.string(), schema_1.z.array(schema_1.z.string())]);
class SceneAdvancedTools {
    constructor() {
        const defs = [
            { name: 'reset_node_property', title: 'Reset node property', description: '[specialist] Reset one node property to Cocos default; mutates scene.',
                inputSchema: schema_1.z.object({
                    uuid: schema_1.z.string().describe('Node UUID whose property should be reset.'),
                    path: schema_1.z.string().describe('Node property path to reset, e.g. position, rotation, scale, layer.'),
                }), handler: a => this.resetNodeProperty(a.uuid, a.path) },
            { name: 'move_array_element', title: 'Move array element', description: '[specialist] Move an item in a node array property such as __comps__; mutates scene.',
                inputSchema: schema_1.z.object({
                    uuid: schema_1.z.string().describe('Node UUID that owns the array property.'),
                    path: schema_1.z.string().describe('Array property path, e.g. __comps__.'),
                    target: schema_1.z.number().describe('Original index of the array item to move.'),
                    offset: schema_1.z.number().describe('Relative move offset; positive moves later, negative moves earlier.'),
                }), handler: a => this.moveArrayElement(a.uuid, a.path, a.target, a.offset) },
            { name: 'remove_array_element', title: 'Remove array element', description: '[specialist] Remove an item from a node array property by index; mutates scene.',
                inputSchema: schema_1.z.object({
                    uuid: schema_1.z.string().describe('Node UUID that owns the array property.'),
                    path: schema_1.z.string().describe('Array property path to edit.'),
                    index: schema_1.z.number().describe('Array index to remove.'),
                }), handler: a => this.removeArrayElement(a.uuid, a.path, a.index) },
            { name: 'copy_node', title: 'Copy scene nodes', description: '[specialist] Copy nodes through the Cocos scene clipboard channel.',
                inputSchema: schema_1.z.object({
                    uuids: stringOrStringArray.describe('Node UUID or UUID array to copy into the editor clipboard context.'),
                }), handler: a => this.copyNode(a.uuids) },
            { name: 'paste_node', title: 'Paste scene nodes', description: '[specialist] Paste copied nodes under a target parent; mutates scene and returns new UUIDs.',
                inputSchema: schema_1.z.object({
                    target: schema_1.z.string().describe('Target parent node UUID for pasted nodes.'),
                    uuids: stringOrStringArray.describe('Node UUID or UUID array returned/used by copy_node.'),
                    keepWorldTransform: schema_1.z.boolean().default(false).describe('Preserve world transform while pasting/reparenting when Cocos supports it.'),
                }), handler: a => this.pasteNode(a.target, a.uuids, a.keepWorldTransform) },
            { name: 'cut_node', title: 'Cut scene nodes', description: '[specialist] Cut nodes through the Cocos scene channel; clipboard/scene side effects.',
                inputSchema: schema_1.z.object({
                    uuids: stringOrStringArray.describe('Node UUID or UUID array to cut via editor scene channel.'),
                }), handler: a => this.cutNode(a.uuids) },
            { name: 'reset_node_transform', title: 'Reset node transform', description: '[specialist] Reset node transform to Cocos defaults; mutates scene.',
                inputSchema: schema_1.z.object({
                    uuid: schema_1.z.string().describe('Node UUID whose transform should be reset to default.'),
                }), handler: a => this.resetNodeTransform(a.uuid) },
            { name: 'reset_component', title: 'Reset component state', description: '[specialist] Reset a component by component UUID; mutates scene.',
                inputSchema: schema_1.z.object({
                    uuid: schema_1.z.string().describe('Component UUID to reset to default values.'),
                }), handler: a => this.resetComponent(a.uuid) },
            { name: 'restore_prefab', title: 'Restore prefab instance', description: '[specialist] Restore a prefab instance through scene/restore-prefab; mutates scene.',
                inputSchema: schema_1.z.object({
                    nodeUuid: schema_1.z.string().describe('Prefab instance node UUID to restore.'),
                    assetUuid: schema_1.z.string().describe('Prefab asset UUID kept for context; scene/restore-prefab uses nodeUuid only.'),
                }), handler: a => this.restorePrefab(a.nodeUuid, a.assetUuid) },
            { name: 'execute_component_method', title: 'Invoke component method', description: '[specialist] Execute an editor-exposed component method; side effects depend on method.',
                inputSchema: schema_1.z.object({
                    uuid: schema_1.z.string().describe('Component UUID whose editor-exposed method should be invoked.'),
                    name: schema_1.z.string().describe('Method name to execute on the component.'),
                    args: schema_1.z.array(schema_1.z.any()).default([]).describe('Positional method arguments.'),
                }), handler: a => this.executeComponentMethod(a.uuid, a.name, a.args) },
            { name: 'execute_scene_script', title: 'Run scene script', description: '[specialist] Execute a scene script method; low-level escape hatch that can mutate scene.',
                inputSchema: schema_1.z.object({
                    name: schema_1.z.string().describe('Scene script package/plugin name.'),
                    method: schema_1.z.string().describe('Scene script method name to execute.'),
                    args: schema_1.z.array(schema_1.z.any()).default([]).describe('Positional method arguments.'),
                }), handler: a => this.executeSceneScript(a.name, a.method, a.args) },
            { name: 'scene_snapshot', title: 'Create scene snapshot', description: '[specialist] Create a Cocos scene snapshot for undo/change tracking.',
                inputSchema: schema_1.z.object({}), handler: () => this.sceneSnapshot() },
            { name: 'scene_snapshot_abort', title: 'Abort scene snapshot', description: '[specialist] Abort the current Cocos scene snapshot.',
                inputSchema: schema_1.z.object({}), handler: () => this.sceneSnapshotAbort() },
            { name: 'begin_undo_recording', title: 'Begin undo recording', description: '[specialist] Begin undo recording for a node and return undoId.',
                inputSchema: schema_1.z.object({
                    nodeUuid: schema_1.z.string().describe('Node UUID whose changes should be covered by the undo recording.'),
                }), handler: a => this.beginUndoRecording(a.nodeUuid) },
            { name: 'end_undo_recording', title: 'Commit undo recording', description: '[specialist] Commit a previously started undo recording.',
                inputSchema: schema_1.z.object({
                    undoId: schema_1.z.string().describe('Undo recording ID returned by begin_undo_recording.'),
                }), handler: a => this.endUndoRecording(a.undoId) },
            { name: 'cancel_undo_recording', title: 'Cancel undo recording', description: '[specialist] Cancel a previously started undo recording.',
                inputSchema: schema_1.z.object({
                    undoId: schema_1.z.string().describe('Undo recording ID to cancel without committing.'),
                }), handler: a => this.cancelUndoRecording(a.undoId) },
            { name: 'soft_reload_scene', title: 'Reload current scene', description: '[specialist] Soft reload the current scene; Editor state side effect.',
                inputSchema: schema_1.z.object({}), handler: () => this.softReloadScene() },
            { name: 'query_scene_ready', title: 'Check scene readiness', description: '[specialist] Check whether the scene module reports ready.',
                inputSchema: schema_1.z.object({}), handler: () => this.querySceneReady() },
            { name: 'query_scene_dirty', title: 'Check scene dirty state', description: '[specialist] Check whether the current scene has unsaved changes.',
                inputSchema: schema_1.z.object({}), handler: () => this.querySceneDirty() },
            { name: 'query_scene_classes', title: 'List scene classes', description: '[specialist] List registered scene classes, optionally filtered by base class.',
                inputSchema: schema_1.z.object({
                    extends: schema_1.z.string().optional().describe('Optional base class filter for scene/query-classes.'),
                }), handler: a => this.querySceneClasses(a.extends) },
            { name: 'query_scene_components', title: 'List scene components', description: '[specialist] List available scene component definitions from Cocos.',
                inputSchema: schema_1.z.object({}), handler: () => this.querySceneComponents() },
            { name: 'query_component_has_script', title: 'Check component script', description: '[specialist] Check whether a component class has an associated script.',
                inputSchema: schema_1.z.object({
                    className: schema_1.z.string().describe('Script class name to check through scene/query-component-has-script.'),
                }), handler: a => this.queryComponentHasScript(a.className) },
            { name: 'query_nodes_by_asset_uuid', title: 'Find nodes by asset', description: '[specialist] Find current-scene nodes that reference an asset UUID.',
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
                resolve((0, response_1.ok)(undefined, `Property '${path}' reset to default value`));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
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
                resolve((0, response_1.ok)(undefined, `Array element at index ${target} moved by ${offset}`));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
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
                resolve((0, response_1.ok)(undefined, `Array element at index ${index} removed`));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async copyNode(uuids) {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'copy-node', uuids).then((result) => {
                resolve((0, response_1.ok)({
                    copiedUuids: result,
                    message: 'Node(s) copied successfully'
                }));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
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
                resolve((0, response_1.ok)({
                    newUuids: result,
                    message: 'Node(s) pasted successfully'
                }));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async cutNode(uuids) {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'cut-node', uuids).then((result) => {
                resolve((0, response_1.ok)({
                    cutUuids: result,
                    message: 'Node(s) cut successfully'
                }));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async resetNodeTransform(uuid) {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'reset-node', { uuid }).then(() => {
                resolve((0, response_1.ok)(undefined, 'Node transform reset to default'));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async resetComponent(uuid) {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'reset-component', { uuid }).then(() => {
                resolve((0, response_1.ok)(undefined, 'Component reset to default values'));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
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
                resolve((0, response_1.ok)(undefined, 'Prefab restored successfully'));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
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
                resolve((0, response_1.ok)({
                    result: result,
                    message: `Method '${name}' executed successfully`
                }));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
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
                resolve((0, response_1.ok)(result));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async sceneSnapshot() {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'snapshot').then(() => {
                resolve((0, response_1.ok)(undefined, 'Scene snapshot created'));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async sceneSnapshotAbort() {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'snapshot-abort').then(() => {
                resolve((0, response_1.ok)(undefined, 'Scene snapshot aborted'));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async beginUndoRecording(nodeUuid) {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'begin-recording', nodeUuid).then((undoId) => {
                resolve((0, response_1.ok)({
                    undoId: undoId,
                    message: 'Undo recording started'
                }));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async endUndoRecording(undoId) {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'end-recording', undoId).then(() => {
                resolve((0, response_1.ok)(undefined, 'Undo recording ended'));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async cancelUndoRecording(undoId) {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'cancel-recording', undoId).then(() => {
                resolve((0, response_1.ok)(undefined, 'Undo recording cancelled'));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async softReloadScene() {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'soft-reload').then(() => {
                resolve((0, response_1.ok)(undefined, 'Scene soft reloaded successfully'));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async querySceneReady() {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'query-is-ready').then((ready) => {
                resolve((0, response_1.ok)({
                    ready: ready,
                    message: ready ? 'Scene is ready' : 'Scene is not ready'
                }));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async querySceneDirty() {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'query-dirty').then((dirty) => {
                resolve((0, response_1.ok)({
                    dirty: dirty,
                    message: dirty ? 'Scene has unsaved changes' : 'Scene is clean'
                }));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
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
                resolve((0, response_1.ok)({
                    classes: classes,
                    count: classes.length,
                    extendsFilter: extendsClass
                }));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async querySceneComponents() {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'query-components').then((components) => {
                resolve((0, response_1.ok)({
                    components: components,
                    count: components.length
                }));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async queryComponentHasScript(className) {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'query-component-has-script', className).then((hasScript) => {
                resolve((0, response_1.ok)({
                    className: className,
                    hasScript: hasScript,
                    message: hasScript ? `Component '${className}' has script` : `Component '${className}' does not have script`
                }));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async queryNodesByAssetUuid(assetUuid) {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'query-nodes-by-asset-uuid', assetUuid).then((nodeUuids) => {
                resolve((0, response_1.ok)({
                    assetUuid: assetUuid,
                    nodeUuids: nodeUuids,
                    count: nodeUuids.length,
                    message: `Found ${nodeUuids.length} nodes using asset`
                }));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
}
exports.SceneAdvancedTools = SceneAdvancedTools;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NlbmUtYWR2YW5jZWQtdG9vbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvdG9vbHMvc2NlbmUtYWR2YW5jZWQtdG9vbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsOENBQTJDO0FBRTNDLDBDQUFrQztBQUNsQyxzREFBMkQ7QUFFM0Qsa0VBQWtFO0FBQ2xFLE1BQU0sbUJBQW1CLEdBQUcsVUFBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLFVBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRSxVQUFDLENBQUMsS0FBSyxDQUFDLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUV2RSxNQUFhLGtCQUFrQjtJQUczQjtRQUNJLE1BQU0sSUFBSSxHQUFjO1lBQ3BCLEVBQUUsSUFBSSxFQUFFLHFCQUFxQixFQUFFLEtBQUssRUFBRSxxQkFBcUIsRUFBRSxXQUFXLEVBQUUsdUVBQXVFO2dCQUM3SSxXQUFXLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQztvQkFDbEIsSUFBSSxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLENBQUMsMkNBQTJDLENBQUM7b0JBQ3RFLElBQUksRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLHFFQUFxRSxDQUFDO2lCQUNuRyxDQUFDLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFO1lBQzlELEVBQUUsSUFBSSxFQUFFLG9CQUFvQixFQUFFLEtBQUssRUFBRSxvQkFBb0IsRUFBRSxXQUFXLEVBQUUsc0ZBQXNGO2dCQUMxSixXQUFXLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQztvQkFDbEIsSUFBSSxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLENBQUMseUNBQXlDLENBQUM7b0JB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UyxjQUFjLENBQUMsQ0FBQyxDQUFDLGNBQWMsU0FBUyx3QkFBd0I7aUJBQy9HLENBQUMsQ0FBQyxDQUFDO1lBQ1osQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBVSxFQUFFLEVBQUU7Z0JBQ3BCLE9BQU8sQ0FBQyxJQUFBLGVBQUksRUFBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztZQUMvQixDQUFDLENBQUMsQ0FBQztRQUNQLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztJQUVPLEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxTQUFpQjtRQUNqRCxPQUFPLElBQUksT0FBTyxDQUFDLENBQUMsT0FBTyxFQUFFLEVBQUU7WUFDM0IsTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLDJCQUEyQixFQUFFLFNBQVMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLFNBQW1CLEVBQUUsRUFBRTtnQkFDakcsT0FBTyxDQUFDLElBQUEsYUFBRSxFQUFDO29CQUNILFNBQVMsRUFBRSxTQUFTO29CQUNwQixTQUFTLEVBQUUsU0FBUztvQkFDcEIsS0FBSyxFQUFFLFNBQVMsQ0FBQyxNQUFNO29CQUN2QixPQUFPLEVBQUUsU0FBUyxTQUFTLENBQUMsTUFBTSxvQkFBb0I7aUJBQ3pELENBQUMsQ0FBQyxDQUFDO1lBQ1osQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBVSxFQUFFLEVBQUU7Z0JBQ3BCLE9BQU8sQ0FBQyxJQUFBLGVBQUksRUFBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztZQUMvQixDQUFDLENBQUMsQ0FBQztRQUNQLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztDQUNKO0FBdFpELGdEQXNaQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IG9rLCBmYWlsIH0gZnJvbSAnLi4vbGliL3Jlc3BvbnNlJztcbmltcG9ydCB7IFRvb2xEZWZpbml0aW9uLCBUb29sUmVzcG9uc2UsIFRvb2xFeGVjdXRvciB9IGZyb20gJy4uL3R5cGVzJztcbmltcG9ydCB7IHogfSBmcm9tICcuLi9saWIvc2NoZW1hJztcbmltcG9ydCB7IGRlZmluZVRvb2xzLCBUb29sRGVmIH0gZnJvbSAnLi4vbGliL2RlZmluZS10b29scyc7XG5cbi8vIFNldmVyYWwgdG9vbHMgYWNjZXB0IGVpdGhlciBhIHNpbmdsZSBVVUlEIG9yIGFuIGFycmF5IG9mIFVVSURzLlxuY29uc3Qgc3RyaW5nT3JTdHJpbmdBcnJheSA9IHoudW5pb24oW3ouc3RyaW5nKCksIHouYXJyYXkoei5zdHJpbmcoKSldKTtcblxuZXhwb3J0IGNsYXNzIFNjZW5lQWR2YW5jZWRUb29scyBpbXBsZW1lbnRzIFRvb2xFeGVjdXRvciB7XG4gICAgcHJpdmF0ZSByZWFkb25seSBleGVjOiBUb29sRXhlY3V0b3I7XG5cbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgY29uc3QgZGVmczogVG9vbERlZltdID0gW1xuICAgICAgICAgICAgeyBuYW1lOiAncmVzZXRfbm9kZV9wcm9wZXJ0eScsIHRpdGxlOiAnUmVzZXQgbm9kZSBwcm9wZXJ0eScsIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFJlc2V0IG9uZSBub2RlIHByb3BlcnR5IHRvIENvY29zIGRlZmF1bHQ7IG11dGF0ZXMgc2NlbmUuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICB1dWlkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdOb2RlIFVVSUQgd2hvc2UgcHJvcGVydHkgc2hvdWxkIGJlIHJlc2V0LicpLFxuICAgICAgICAgICAgICAgICAgICBwYXRoOiB6LnN0cmluZygpLmRlc2NyaWJlKCdOb2RlIHByb3BlcnR5IHBhdGggdG8gcmVzZXQsIGUuZy4gcG9zaXRpb24sIHJvdGF0aW9uLCBzY2FsZSwgbGF5ZXIuJyksXG4gICAgICAgICAgICAgICAgfSksIGhhbmRsZXI6IGEgPT4gdGhpcy5yZXNldE5vZGVQcm9wZXJ0eShhLnV1aWQsIGEucGF0aCkgfSxcbiAgICAgICAgICAgIHsgbmFtZTogJ21vdmVfYXJyYXlfZWxlbWVudCcsIHRpdGxlOiAnTW92ZSBhcnJheSBlbGVtZW50JywgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gTW92ZSBhbiBpdGVtIGluIGEgbm9kZSBhcnJheSBwcm9wZXJ0eSBzdWNoIGFzIF9fY29tcHNfXzsgbXV0YXRlcyBzY2VuZS4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ05vZGUgVVVJRCB0aGF0IG93bnMgdGhlIGFycmF5IHByb3BlcnR5LicpLFxuICAgICAgICAgICAgICAgICAgICBwYXRoOiB6LnN0cmluZygpLmRlc2NyaWJlKCdBcnJheSBwcm9wZXJ0eSBwYXRoLCBlLmcuIF9fY29tcHNfXy4nKSxcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0OiB6Lm51bWJlcigpLmRlc2NyaWJlKCdPcmlnaW5hbCBpbmRleCBvZiB0aGUgYXJyYXkgaXRlbSB0byBtb3ZlLicpLFxuICAgICAgICAgICAgICAgICAgICBvZmZzZXQ6IHoubnVtYmVyKCkuZGVzY3JpYmUoJ1JlbGF0aXZlIG1vdmUgb2Zmc2V0OyBwb3NpdGl2ZSBtb3ZlcyBsYXRlciwgbmVnYXRpdmUgbW92ZXMgZWFybGllci4nKSxcbiAgICAgICAgICAgICAgICB9KSwgaGFuZGxlcjogYSA9PiB0aGlzLm1vdmVBcnJheUVsZW1lbnQoYS51dWlkLCBhLnBhdGgsIGEudGFyZ2V0LCBhLm9mZnNldCkgfSxcbiAgICAgICAgICAgIHsgbmFtZTogJ3JlbW92ZV9hcnJheV9lbGVtZW50JywgdGl0bGU6ICdSZW1vdmUgYXJyYXkgZWxlbWVudCcsIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFJlbW92ZSBhbiBpdGVtIGZyb20gYSBub2RlIGFycmF5IHByb3BlcnR5IGJ5IGluZGV4OyBtdXRhdGVzIHNjZW5lLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgdXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnTm9kZSBVVUlEIHRoYXQgb3ducyB0aGUgYXJyYXkgcHJvcGVydHkuJyksXG4gICAgICAgICAgICAgICAgICAgIHBhdGg6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0FycmF5IHByb3BlcnR5IHBhdGggdG8gZWRpdC4nKSxcbiAgICAgICAgICAgICAgICAgICAgaW5kZXg6IHoubnVtYmVyKCkuZGVzY3JpYmUoJ0FycmF5IGluZGV4IHRvIHJlbW92ZS4nKSxcbiAgICAgICAgICAgICAgICB9KSwgaGFuZGxlcjogYSA9PiB0aGlzLnJlbW92ZUFycmF5RWxlbWVudChhLnV1aWQsIGEucGF0aCwgYS5pbmRleCkgfSxcbiAgICAgICAgICAgIHsgbmFtZTogJ2NvcHlfbm9kZScsIHRpdGxlOiAnQ29weSBzY2VuZSBub2RlcycsIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIENvcHkgbm9kZXMgdGhyb3VnaCB0aGUgQ29jb3Mgc2NlbmUgY2xpcGJvYXJkIGNoYW5uZWwuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICB1dWlkczogc3RyaW5nT3JTdHJpbmdBcnJheS5kZXNjcmliZSgnTm9kZSBVVUlEIG9yIFVVSUQgYXJyYXkgdG8gY29weSBpbnRvIHRoZSBlZGl0b3IgY2xpcGJvYXJkIGNvbnRleHQuJyksXG4gICAgICAgICAgICAgICAgfSksIGhhbmRsZXI6IGEgPT4gdGhpcy5jb3B5Tm9kZShhLnV1aWRzKSB9LFxuICAgICAgICAgICAgeyBuYW1lOiAncGFzdGVfbm9kZScsIHRpdGxlOiAnUGFzdGUgc2NlbmUgbm9kZXMnLCBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBQYXN0ZSBjb3BpZWQgbm9kZXMgdW5kZXIgYSB0YXJnZXQgcGFyZW50OyBtdXRhdGVzIHNjZW5lIGFuZCByZXR1cm5zIG5ldyBVVUlEcy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldDogei5zdHJpbmcoKS5kZXNjcmliZSgnVGFyZ2V0IHBhcmVudCBub2RlIFVVSUQgZm9yIHBhc3RlZCBub2Rlcy4nKSxcbiAgICAgICAgICAgICAgICAgICAgdXVpZHM6IHN0cmluZ09yU3RyaW5nQXJyYXkuZGVzY3JpYmUoJ05vZGUgVVVJRCBvciBVVUlEIGFycmF5IHJldHVybmVkL3VzZWQgYnkgY29weV9ub2RlLicpLFxuICAgICAgICAgICAgICAgICAgICBrZWVwV29ybGRUcmFuc2Zvcm06IHouYm9vbGVhbigpLmRlZmF1bHQoZmFsc2UpLmRlc2NyaWJlKCdQcmVzZXJ2ZSB3b3JsZCB0cmFuc2Zvcm0gd2hpbGUgcGFzdGluZy9yZXBhcmVudGluZyB3aGVuIENvY29zIHN1cHBvcnRzIGl0LicpLFxuICAgICAgICAgICAgICAgIH0pLCBoYW5kbGVyOiBhID0+IHRoaXMucGFzdGVOb2RlKGEudGFyZ2V0LCBhLnV1aWRzLCBhLmtlZXBXb3JsZFRyYW5zZm9ybSkgfSxcbiAgICAgICAgICAgIHsgbmFtZTogJ2N1dF9ub2RlJywgdGl0bGU6ICdDdXQgc2NlbmUgbm9kZXMnLCBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBDdXQgbm9kZXMgdGhyb3VnaCB0aGUgQ29jb3Mgc2NlbmUgY2hhbm5lbDsgY2xpcGJvYXJkL3NjZW5lIHNpZGUgZWZmZWN0cy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHV1aWRzOiBzdHJpbmdPclN0cmluZ0FycmF5LmRlc2NyaWJlKCdOb2RlIFVVSUQgb3IgVVVJRCBhcnJheSB0byBjdXQgdmlhIGVkaXRvciBzY2VuZSBjaGFubmVsLicpLFxuICAgICAgICAgICAgICAgIH0pLCBoYW5kbGVyOiBhID0+IHRoaXMuY3V0Tm9kZShhLnV1aWRzKSB9LFxuICAgICAgICAgICAgeyBuYW1lOiAncmVzZXRfbm9kZV90cmFuc2Zvcm0nLCB0aXRsZTogJ1Jlc2V0IG5vZGUgdHJhbnNmb3JtJywgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gUmVzZXQgbm9kZSB0cmFuc2Zvcm0gdG8gQ29jb3MgZGVmYXVsdHM7IG11dGF0ZXMgc2NlbmUuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICB1dWlkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdOb2RlIFVVSUQgd2hvc2UgdHJhbnNmb3JtIHNob3VsZCBiZSByZXNldCB0byBkZWZhdWx0LicpLFxuICAgICAgICAgICAgICAgIH0pLCBoYW5kbGVyOiBhID0+IHRoaXMucmVzZXROb2RlVHJhbnNmb3JtKGEudXVpZCkgfSxcbiAgICAgICAgICAgIHsgbmFtZTogJ3Jlc2V0X2NvbXBvbmVudCcsIHRpdGxlOiAnUmVzZXQgY29tcG9uZW50IHN0YXRlJywgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gUmVzZXQgYSBjb21wb25lbnQgYnkgY29tcG9uZW50IFVVSUQ7IG11dGF0ZXMgc2NlbmUuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICB1dWlkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdDb21wb25lbnQgVVVJRCB0byByZXNldCB0byBkZWZhdWx0IHZhbHVlcy4nKSxcbiAgICAgICAgICAgICAgICB9KSwgaGFuZGxlcjogYSA9PiB0aGlzLnJlc2V0Q29tcG9uZW50KGEudXVpZCkgfSxcbiAgICAgICAgICAgIHsgbmFtZTogJ3Jlc3RvcmVfcHJlZmFiJywgdGl0bGU6ICdSZXN0b3JlIHByZWZhYiBpbnN0YW5jZScsIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFJlc3RvcmUgYSBwcmVmYWIgaW5zdGFuY2UgdGhyb3VnaCBzY2VuZS9yZXN0b3JlLXByZWZhYjsgbXV0YXRlcyBzY2VuZS4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIG5vZGVVdWlkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdQcmVmYWIgaW5zdGFuY2Ugbm9kZSBVVUlEIHRvIHJlc3RvcmUuJyksXG4gICAgICAgICAgICAgICAgICAgIGFzc2V0VXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnUHJlZmFiIGFzc2V0IFVVSUQga2VwdCBmb3IgY29udGV4dDsgc2NlbmUvcmVzdG9yZS1wcmVmYWIgdXNlcyBub2RlVXVpZCBvbmx5LicpLFxuICAgICAgICAgICAgICAgIH0pLCBoYW5kbGVyOiBhID0+IHRoaXMucmVzdG9yZVByZWZhYihhLm5vZGVVdWlkLCBhLmFzc2V0VXVpZCkgfSxcbiAgICAgICAgICAgIHsgbmFtZTogJ2V4ZWN1dGVfY29tcG9uZW50X21ldGhvZCcsIHRpdGxlOiAnSW52b2tlIGNvbXBvbmVudCBtZXRob2QnLCBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBFeGVjdXRlIGFuIGVkaXRvci1leHBvc2VkIGNvbXBvbmVudCBtZXRob2Q7IHNpZGUgZWZmZWN0cyBkZXBlbmQgb24gbWV0aG9kLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgdXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnQ29tcG9uZW50IFVVSUQgd2hvc2UgZWRpdG9yLWV4cG9zZWQgbWV0aG9kIHNob3VsZCBiZSBpbnZva2VkLicpLFxuICAgICAgICAgICAgICAgICAgICBuYW1lOiB6LnN0cmluZygpLmRlc2NyaWJlKCdNZXRob2QgbmFtZSB0byBleGVjdXRlIG9uIHRoZSBjb21wb25lbnQuJyksXG4gICAgICAgICAgICAgICAgICAgIGFyZ3M6IHouYXJyYXkoei5hbnkoKSkuZGVmYXVsdChbXSkuZGVzY3JpYmUoJ1Bvc2l0aW9uYWwgbWV0aG9kIGFyZ3VtZW50cy4nKSxcbiAgICAgICAgICAgICAgICB9KSwgaGFuZGxlcjogYSA9PiB0aGlzLmV4ZWN1dGVDb21wb25lbnRNZXRob2QoYS51dWlkLCBhLm5hbWUsIGEuYXJncykgfSxcbiAgICAgICAgICAgIHsgbmFtZTogJ2V4ZWN1dGVfc2NlbmVfc2NyaXB0JywgdGl0bGU6ICdSdW4gc2NlbmUgc2NyaXB0JywgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gRXhlY3V0ZSBhIHNjZW5lIHNjcmlwdCBtZXRob2Q7IGxvdy1sZXZlbCBlc2NhcGUgaGF0Y2ggdGhhdCBjYW4gbXV0YXRlIHNjZW5lLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgbmFtZTogei5zdHJpbmcoKS5kZXNjcmliZSgnU2NlbmUgc2NyaXB0IHBhY2thZ2UvcGx1Z2luIG5hbWUuJyksXG4gICAgICAgICAgICAgICAgICAgIG1ldGhvZDogei5zdHJpbmcoKS5kZXNjcmliZSgnU2NlbmUgc2NyaXB0IG1ldGhvZCBuYW1lIHRvIGV4ZWN1dGUuJyksXG4gICAgICAgICAgICAgICAgICAgIGFyZ3M6IHouYXJyYXkoei5hbnkoKSkuZGVmYXVsdChbXSkuZGVzY3JpYmUoJ1Bvc2l0aW9uYWwgbWV0aG9kIGFyZ3VtZW50cy4nKSxcbiAgICAgICAgICAgICAgICB9KSwgaGFuZGxlcjogYSA9PiB0aGlzLmV4ZWN1dGVTY2VuZVNjcmlwdChhLm5hbWUsIGEubWV0aG9kLCBhLmFyZ3MpIH0sXG4gICAgICAgICAgICB7IG5hbWU6ICdzY2VuZV9zbmFwc2hvdCcsIHRpdGxlOiAnQ3JlYXRlIHNjZW5lIHNuYXBzaG90JywgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gQ3JlYXRlIGEgQ29jb3Mgc2NlbmUgc25hcHNob3QgZm9yIHVuZG8vY2hhbmdlIHRyYWNraW5nLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSwgaGFuZGxlcjogKCkgPT4gdGhpcy5zY2VuZVNuYXBzaG90KCkgfSxcbiAgICAgICAgICAgIHsgbmFtZTogJ3NjZW5lX3NuYXBzaG90X2Fib3J0JywgdGl0bGU6ICdBYm9ydCBzY2VuZSBzbmFwc2hvdCcsIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIEFib3J0IHRoZSBjdXJyZW50IENvY29zIHNjZW5lIHNuYXBzaG90LicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSwgaGFuZGxlcjogKCkgPT4gdGhpcy5zY2VuZVNuYXBzaG90QWJvcnQoKSB9LFxuICAgICAgICAgICAgeyBuYW1lOiAnYmVnaW5fdW5kb19yZWNvcmRpbmcnLCB0aXRsZTogJ0JlZ2luIHVuZG8gcmVjb3JkaW5nJywgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gQmVnaW4gdW5kbyByZWNvcmRpbmcgZm9yIGEgbm9kZSBhbmQgcmV0dXJuIHVuZG9JZC4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIG5vZGVVdWlkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdOb2RlIFVVSUQgd2hvc2UgY2hhbmdlcyBzaG91bGQgYmUgY292ZXJlZCBieSB0aGUgdW5kbyByZWNvcmRpbmcuJyksXG4gICAgICAgICAgICAgICAgfSksIGhhbmRsZXI6IGEgPT4gdGhpcy5iZWdpblVuZG9SZWNvcmRpbmcoYS5ub2RlVXVpZCkgfSxcbiAgICAgICAgICAgIHsgbmFtZTogJ2VuZF91bmRvX3JlY29yZGluZycsIHRpdGxlOiAnQ29tbWl0IHVuZG8gcmVjb3JkaW5nJywgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gQ29tbWl0IGEgcHJldmlvdXNseSBzdGFydGVkIHVuZG8gcmVjb3JkaW5nLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgdW5kb0lkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdVbmRvIHJlY29yZGluZyBJRCByZXR1cm5lZCBieSBiZWdpbl91bmRvX3JlY29yZGluZy4nKSxcbiAgICAgICAgICAgICAgICB9KSwgaGFuZGxlcjogYSA9PiB0aGlzLmVuZFVuZG9SZWNvcmRpbmcoYS51bmRvSWQpIH0sXG4gICAgICAgICAgICB7IG5hbWU6ICdjYW5jZWxfdW5kb19yZWNvcmRpbmcnLCB0aXRsZTogJ0NhbmNlbCB1bmRvIHJlY29yZGluZycsIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIENhbmNlbCBhIHByZXZpb3VzbHkgc3RhcnRlZCB1bmRvIHJlY29yZGluZy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHVuZG9JZDogei5zdHJpbmcoKS5kZXNjcmliZSgnVW5kbyByZWNvcmRpbmcgSUQgdG8gY2FuY2VsIHdpdGhvdXQgY29tbWl0dGluZy4nKSxcbiAgICAgICAgICAgICAgICB9KSwgaGFuZGxlcjogYSA9PiB0aGlzLmNhbmNlbFVuZG9SZWNvcmRpbmcoYS51bmRvSWQpIH0sXG4gICAgICAgICAgICB7IG5hbWU6ICdzb2Z0X3JlbG9hZF9zY2VuZScsIHRpdGxlOiAnUmVsb2FkIGN1cnJlbnQgc2NlbmUnLCBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBTb2Z0IHJlbG9hZCB0aGUgY3VycmVudCBzY2VuZTsgRWRpdG9yIHN0YXRlIHNpZGUgZWZmZWN0LicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSwgaGFuZGxlcjogKCkgPT4gdGhpcy5zb2Z0UmVsb2FkU2NlbmUoKSB9LFxuICAgICAgICAgICAgeyBuYW1lOiAncXVlcnlfc2NlbmVfcmVhZHknLCB0aXRsZTogJ0NoZWNrIHNjZW5lIHJlYWRpbmVzcycsIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIENoZWNrIHdoZXRoZXIgdGhlIHNjZW5lIG1vZHVsZSByZXBvcnRzIHJlYWR5LicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSwgaGFuZGxlcjogKCkgPT4gdGhpcy5xdWVyeVNjZW5lUmVhZHkoKSB9LFxuICAgICAgICAgICAgeyBuYW1lOiAncXVlcnlfc2NlbmVfZGlydHknLCB0aXRsZTogJ0NoZWNrIHNjZW5lIGRpcnR5IHN0YXRlJywgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gQ2hlY2sgd2hldGhlciB0aGUgY3VycmVudCBzY2VuZSBoYXMgdW5zYXZlZCBjaGFuZ2VzLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSwgaGFuZGxlcjogKCkgPT4gdGhpcy5xdWVyeVNjZW5lRGlydHkoKSB9LFxuICAgICAgICAgICAgeyBuYW1lOiAncXVlcnlfc2NlbmVfY2xhc3NlcycsIHRpdGxlOiAnTGlzdCBzY2VuZSBjbGFzc2VzJywgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gTGlzdCByZWdpc3RlcmVkIHNjZW5lIGNsYXNzZXMsIG9wdGlvbmFsbHkgZmlsdGVyZWQgYnkgYmFzZSBjbGFzcy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIGV4dGVuZHM6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnT3B0aW9uYWwgYmFzZSBjbGFzcyBmaWx0ZXIgZm9yIHNjZW5lL3F1ZXJ5LWNsYXNzZXMuJyksXG4gICAgICAgICAgICAgICAgfSksIGhhbmRsZXI6IGEgPT4gdGhpcy5xdWVyeVNjZW5lQ2xhc3NlcyhhLmV4dGVuZHMpIH0sXG4gICAgICAgICAgICB7IG5hbWU6ICdxdWVyeV9zY2VuZV9jb21wb25lbnRzJywgdGl0bGU6ICdMaXN0IHNjZW5lIGNvbXBvbmVudHMnLCBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBMaXN0IGF2YWlsYWJsZSBzY2VuZSBjb21wb25lbnQgZGVmaW5pdGlvbnMgZnJvbSBDb2Nvcy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksIGhhbmRsZXI6ICgpID0+IHRoaXMucXVlcnlTY2VuZUNvbXBvbmVudHMoKSB9LFxuICAgICAgICAgICAgeyBuYW1lOiAncXVlcnlfY29tcG9uZW50X2hhc19zY3JpcHQnLCB0aXRsZTogJ0NoZWNrIGNvbXBvbmVudCBzY3JpcHQnLCBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBDaGVjayB3aGV0aGVyIGEgY29tcG9uZW50IGNsYXNzIGhhcyBhbiBhc3NvY2lhdGVkIHNjcmlwdC4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZTogei5zdHJpbmcoKS5kZXNjcmliZSgnU2NyaXB0IGNsYXNzIG5hbWUgdG8gY2hlY2sgdGhyb3VnaCBzY2VuZS9xdWVyeS1jb21wb25lbnQtaGFzLXNjcmlwdC4nKSxcbiAgICAgICAgICAgICAgICB9KSwgaGFuZGxlcjogYSA9PiB0aGlzLnF1ZXJ5Q29tcG9uZW50SGFzU2NyaXB0KGEuY2xhc3NOYW1lKSB9LFxuICAgICAgICAgICAgeyBuYW1lOiAncXVlcnlfbm9kZXNfYnlfYXNzZXRfdXVpZCcsIHRpdGxlOiAnRmluZCBub2RlcyBieSBhc3NldCcsIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIEZpbmQgY3VycmVudC1zY2VuZSBub2RlcyB0aGF0IHJlZmVyZW5jZSBhbiBhc3NldCBVVUlELicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgYXNzZXRVdWlkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdBc3NldCBVVUlEIHRvIHNlYXJjaCBmb3IgaW4gc2NlbmUgbm9kZXMuJyksXG4gICAgICAgICAgICAgICAgfSksIGhhbmRsZXI6IGEgPT4gdGhpcy5xdWVyeU5vZGVzQnlBc3NldFV1aWQoYS5hc3NldFV1aWQpIH0sXG4gICAgICAgIF07XG4gICAgICAgIHRoaXMuZXhlYyA9IGRlZmluZVRvb2xzKGRlZnMpO1xuICAgIH1cblxuICAgIGdldFRvb2xzKCk6IFRvb2xEZWZpbml0aW9uW10geyByZXR1cm4gdGhpcy5leGVjLmdldFRvb2xzKCk7IH1cbiAgICBleGVjdXRlKHRvb2xOYW1lOiBzdHJpbmcsIGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7IHJldHVybiB0aGlzLmV4ZWMuZXhlY3V0ZSh0b29sTmFtZSwgYXJncyk7IH1cblxuICAgIHByaXZhdGUgYXN5bmMgcmVzZXROb2RlUHJvcGVydHkodXVpZDogc3RyaW5nLCBwYXRoOiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3Jlc2V0LXByb3BlcnR5JywgeyBcbiAgICAgICAgICAgICAgICB1dWlkLCBcbiAgICAgICAgICAgICAgICBwYXRoLCBcbiAgICAgICAgICAgICAgICBkdW1wOiB7IHZhbHVlOiBudWxsIH0gXG4gICAgICAgICAgICB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHVuZGVmaW5lZCwgYFByb3BlcnR5ICcke3BhdGh9JyByZXNldCB0byBkZWZhdWx0IHZhbHVlYCkpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIG1vdmVBcnJheUVsZW1lbnQodXVpZDogc3RyaW5nLCBwYXRoOiBzdHJpbmcsIHRhcmdldDogbnVtYmVyLCBvZmZzZXQ6IG51bWJlcik6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnbW92ZS1hcnJheS1lbGVtZW50Jywge1xuICAgICAgICAgICAgICAgIHV1aWQsXG4gICAgICAgICAgICAgICAgcGF0aCxcbiAgICAgICAgICAgICAgICB0YXJnZXQsXG4gICAgICAgICAgICAgICAgb2Zmc2V0XG4gICAgICAgICAgICB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHVuZGVmaW5lZCwgYEFycmF5IGVsZW1lbnQgYXQgaW5kZXggJHt0YXJnZXR9IG1vdmVkIGJ5ICR7b2Zmc2V0fWApKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyByZW1vdmVBcnJheUVsZW1lbnQodXVpZDogc3RyaW5nLCBwYXRoOiBzdHJpbmcsIGluZGV4OiBudW1iZXIpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3JlbW92ZS1hcnJheS1lbGVtZW50Jywge1xuICAgICAgICAgICAgICAgIHV1aWQsXG4gICAgICAgICAgICAgICAgcGF0aCxcbiAgICAgICAgICAgICAgICBpbmRleFxuICAgICAgICAgICAgfSkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh1bmRlZmluZWQsIGBBcnJheSBlbGVtZW50IGF0IGluZGV4ICR7aW5kZXh9IHJlbW92ZWRgKSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgY29weU5vZGUodXVpZHM6IHN0cmluZyB8IHN0cmluZ1tdKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdjb3B5LW5vZGUnLCB1dWlkcykudGhlbigocmVzdWx0OiBzdHJpbmcgfCBzdHJpbmdbXSkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgY29waWVkVXVpZHM6IHJlc3VsdCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdOb2RlKHMpIGNvcGllZCBzdWNjZXNzZnVsbHknXG4gICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBwYXN0ZU5vZGUodGFyZ2V0OiBzdHJpbmcsIHV1aWRzOiBzdHJpbmcgfCBzdHJpbmdbXSwga2VlcFdvcmxkVHJhbnNmb3JtOiBib29sZWFuID0gZmFsc2UpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3Bhc3RlLW5vZGUnLCB7XG4gICAgICAgICAgICAgICAgdGFyZ2V0LFxuICAgICAgICAgICAgICAgIHV1aWRzLFxuICAgICAgICAgICAgICAgIGtlZXBXb3JsZFRyYW5zZm9ybVxuICAgICAgICAgICAgfSkudGhlbigocmVzdWx0OiBzdHJpbmcgfCBzdHJpbmdbXSkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgbmV3VXVpZHM6IHJlc3VsdCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdOb2RlKHMpIHBhc3RlZCBzdWNjZXNzZnVsbHknXG4gICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBjdXROb2RlKHV1aWRzOiBzdHJpbmcgfCBzdHJpbmdbXSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnY3V0LW5vZGUnLCB1dWlkcykudGhlbigocmVzdWx0OiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGN1dFV1aWRzOiByZXN1bHQsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiAnTm9kZShzKSBjdXQgc3VjY2Vzc2Z1bGx5J1xuICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgcmVzZXROb2RlVHJhbnNmb3JtKHV1aWQ6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncmVzZXQtbm9kZScsIHsgdXVpZCB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHVuZGVmaW5lZCwgJ05vZGUgdHJhbnNmb3JtIHJlc2V0IHRvIGRlZmF1bHQnKSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgcmVzZXRDb21wb25lbnQodXVpZDogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdyZXNldC1jb21wb25lbnQnLCB7IHV1aWQgfSkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh1bmRlZmluZWQsICdDb21wb25lbnQgcmVzZXQgdG8gZGVmYXVsdCB2YWx1ZXMnKSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgcmVzdG9yZVByZWZhYihub2RlVXVpZDogc3RyaW5nLCBhc3NldFV1aWQ6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIC8vIHNjZW5lL3Jlc3RvcmUtcHJlZmFiIHRha2VzIFJlc2V0Q29tcG9uZW50T3B0aW9ucyA9IHsgdXVpZDogc3RyaW5nIH1cbiAgICAgICAgLy8gcGVyIEBjb2Nvcy9jcmVhdG9yLXR5cGVzLiBhc3NldFV1aWQgaXMga2VwdCBvbiB0aGUgcHVibGljIHNjaGVtYSBmb3JcbiAgICAgICAgLy8gcmVzcG9uc2UgY29udGV4dCBidXQgZG9lcyBub3QgZmxvdyBpbnRvIHRoZSBlZGl0b3IgbWVzc2FnZSDigJQgcGFzc2luZ1xuICAgICAgICAvLyBleHRyYSBwb3NpdGlvbmFsIGFyZ3MgaXMgc2lsZW50bHkgZHJvcHBlZCBieSBFZGl0b3IuTWVzc2FnZS5cbiAgICAgICAgdm9pZCBhc3NldFV1aWQ7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncmVzdG9yZS1wcmVmYWInLCB7IHV1aWQ6IG5vZGVVdWlkIH0pLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2sodW5kZWZpbmVkLCAnUHJlZmFiIHJlc3RvcmVkIHN1Y2Nlc3NmdWxseScpKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBleGVjdXRlQ29tcG9uZW50TWV0aG9kKHV1aWQ6IHN0cmluZywgbmFtZTogc3RyaW5nLCBhcmdzOiBhbnlbXSA9IFtdKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdleGVjdXRlLWNvbXBvbmVudC1tZXRob2QnLCB7XG4gICAgICAgICAgICAgICAgdXVpZCxcbiAgICAgICAgICAgICAgICBuYW1lLFxuICAgICAgICAgICAgICAgIGFyZ3NcbiAgICAgICAgICAgIH0pLnRoZW4oKHJlc3VsdDogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQ6IHJlc3VsdCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBNZXRob2QgJyR7bmFtZX0nIGV4ZWN1dGVkIHN1Y2Nlc3NmdWxseWBcbiAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGV4ZWN1dGVTY2VuZVNjcmlwdChuYW1lOiBzdHJpbmcsIG1ldGhvZDogc3RyaW5nLCBhcmdzOiBhbnlbXSA9IFtdKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdleGVjdXRlLXNjZW5lLXNjcmlwdCcsIHtcbiAgICAgICAgICAgICAgICBuYW1lLFxuICAgICAgICAgICAgICAgIG1ldGhvZCxcbiAgICAgICAgICAgICAgICBhcmdzXG4gICAgICAgICAgICB9KS50aGVuKChyZXN1bHQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2socmVzdWx0KSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgc2NlbmVTbmFwc2hvdCgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3NuYXBzaG90JykudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh1bmRlZmluZWQsICdTY2VuZSBzbmFwc2hvdCBjcmVhdGVkJykpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHNjZW5lU25hcHNob3RBYm9ydCgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3NuYXBzaG90LWFib3J0JykudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh1bmRlZmluZWQsICdTY2VuZSBzbmFwc2hvdCBhYm9ydGVkJykpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGJlZ2luVW5kb1JlY29yZGluZyhub2RlVXVpZDogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdiZWdpbi1yZWNvcmRpbmcnLCBub2RlVXVpZCkudGhlbigodW5kb0lkOiBzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHVuZG9JZDogdW5kb0lkLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogJ1VuZG8gcmVjb3JkaW5nIHN0YXJ0ZWQnXG4gICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBlbmRVbmRvUmVjb3JkaW5nKHVuZG9JZDogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdlbmQtcmVjb3JkaW5nJywgdW5kb0lkKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHVuZGVmaW5lZCwgJ1VuZG8gcmVjb3JkaW5nIGVuZGVkJykpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGNhbmNlbFVuZG9SZWNvcmRpbmcodW5kb0lkOiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ2NhbmNlbC1yZWNvcmRpbmcnLCB1bmRvSWQpLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2sodW5kZWZpbmVkLCAnVW5kbyByZWNvcmRpbmcgY2FuY2VsbGVkJykpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHNvZnRSZWxvYWRTY2VuZSgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3NvZnQtcmVsb2FkJykudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh1bmRlZmluZWQsICdTY2VuZSBzb2Z0IHJlbG9hZGVkIHN1Y2Nlc3NmdWxseScpKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBxdWVyeVNjZW5lUmVhZHkoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1pcy1yZWFkeScpLnRoZW4oKHJlYWR5OiBib29sZWFuKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICByZWFkeTogcmVhZHksXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiByZWFkeSA/ICdTY2VuZSBpcyByZWFkeScgOiAnU2NlbmUgaXMgbm90IHJlYWR5J1xuICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgcXVlcnlTY2VuZURpcnR5KCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktZGlydHknKS50aGVuKChkaXJ0eTogYm9vbGVhbikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgZGlydHk6IGRpcnR5LFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogZGlydHkgPyAnU2NlbmUgaGFzIHVuc2F2ZWQgY2hhbmdlcycgOiAnU2NlbmUgaXMgY2xlYW4nXG4gICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBxdWVyeVNjZW5lQ2xhc3NlcyhleHRlbmRzQ2xhc3M/OiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IG9wdGlvbnM6IGFueSA9IHt9O1xuICAgICAgICAgICAgaWYgKGV4dGVuZHNDbGFzcykge1xuICAgICAgICAgICAgICAgIG9wdGlvbnMuZXh0ZW5kcyA9IGV4dGVuZHNDbGFzcztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktY2xhc3NlcycsIG9wdGlvbnMpLnRoZW4oKGNsYXNzZXM6IGFueVtdKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICBjbGFzc2VzOiBjbGFzc2VzLFxuICAgICAgICAgICAgICAgICAgICAgICAgY291bnQ6IGNsYXNzZXMubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICAgICAgZXh0ZW5kc0ZpbHRlcjogZXh0ZW5kc0NsYXNzXG4gICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBxdWVyeVNjZW5lQ29tcG9uZW50cygpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LWNvbXBvbmVudHMnKS50aGVuKChjb21wb25lbnRzOiBhbnlbXSkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50czogY29tcG9uZW50cyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvdW50OiBjb21wb25lbnRzLmxlbmd0aFxuICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgcXVlcnlDb21wb25lbnRIYXNTY3JpcHQoY2xhc3NOYW1lOiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LWNvbXBvbmVudC1oYXMtc2NyaXB0JywgY2xhc3NOYW1lKS50aGVuKChoYXNTY3JpcHQ6IGJvb2xlYW4pID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZTogY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgaGFzU2NyaXB0OiBoYXNTY3JpcHQsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBoYXNTY3JpcHQgPyBgQ29tcG9uZW50ICcke2NsYXNzTmFtZX0nIGhhcyBzY3JpcHRgIDogYENvbXBvbmVudCAnJHtjbGFzc05hbWV9JyBkb2VzIG5vdCBoYXZlIHNjcmlwdGBcbiAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHF1ZXJ5Tm9kZXNCeUFzc2V0VXVpZChhc3NldFV1aWQ6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktbm9kZXMtYnktYXNzZXQtdXVpZCcsIGFzc2V0VXVpZCkudGhlbigobm9kZVV1aWRzOiBzdHJpbmdbXSkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgYXNzZXRVdWlkOiBhc3NldFV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBub2RlVXVpZHM6IG5vZGVVdWlkcyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvdW50OiBub2RlVXVpZHMubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYEZvdW5kICR7bm9kZVV1aWRzLmxlbmd0aH0gbm9kZXMgdXNpbmcgYXNzZXRgXG4gICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxufVxuIl19