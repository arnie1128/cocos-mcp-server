"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SceneAdvancedTools = void 0;
const response_1 = require("../lib/response");
const schema_1 = require("../lib/schema");
const decorators_1 = require("../lib/decorators");
// Several tools accept either a single UUID or an array of UUIDs.
const stringOrStringArray = schema_1.z.union([schema_1.z.string(), schema_1.z.array(schema_1.z.string())]);
class SceneAdvancedTools {
    constructor() {
        this.exec = (0, decorators_1.defineToolsFromDecorators)(this);
    }
    getTools() { return this.exec.getTools(); }
    execute(toolName, args) { return this.exec.execute(toolName, args); }
    async resetNodeProperty(args) {
        return this.resetNodePropertyImpl(args.uuid, args.path);
    }
    async moveArrayElement(args) {
        return this.moveArrayElementImpl(args.uuid, args.path, args.target, args.offset);
    }
    async removeArrayElement(args) {
        return this.removeArrayElementImpl(args.uuid, args.path, args.index);
    }
    async copyNode(args) {
        return this.copyNodeImpl(args.uuids);
    }
    async pasteNode(args) {
        return this.pasteNodeImpl(args.target, args.uuids, args.keepWorldTransform);
    }
    async cutNode(args) {
        return this.cutNodeImpl(args.uuids);
    }
    async resetNodeTransform(args) {
        return this.resetNodeTransformImpl(args.uuid);
    }
    async resetComponent(args) {
        return this.resetComponentImpl(args.uuid);
    }
    async restorePrefab(args) {
        return this.restorePrefabImpl(args.nodeUuid, args.assetUuid);
    }
    async executeComponentMethod(args) {
        return this.executeComponentMethodImpl(args.uuid, args.name, args.args);
    }
    async executeSceneScript(args) {
        return this.executeSceneScriptImpl(args.name, args.method, args.args);
    }
    async sceneSnapshot() {
        return this.sceneSnapshotImpl();
    }
    async sceneSnapshotAbort() {
        return this.sceneSnapshotAbortImpl();
    }
    async beginUndoRecording(args) {
        return this.beginUndoRecordingImpl(args.nodeUuid);
    }
    async endUndoRecording(args) {
        return this.endUndoRecordingImpl(args.undoId);
    }
    async cancelUndoRecording(args) {
        return this.cancelUndoRecordingImpl(args.undoId);
    }
    async softReloadScene() {
        return this.softReloadSceneImpl();
    }
    async querySceneReady() {
        return this.querySceneReadyImpl();
    }
    async querySceneDirty() {
        return this.querySceneDirtyImpl();
    }
    async querySceneClasses(args) {
        return this.querySceneClassesImpl(args.extends);
    }
    async querySceneComponents() {
        return this.querySceneComponentsImpl();
    }
    async queryComponentHasScript(args) {
        return this.queryComponentHasScriptImpl(args.className);
    }
    async queryNodesByAssetUuid(args) {
        return this.queryNodesByAssetUuidImpl(args.assetUuid);
    }
    async resetNodePropertyImpl(uuid, path) {
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
    async moveArrayElementImpl(uuid, path, target, offset) {
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
    async removeArrayElementImpl(uuid, path, index) {
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
    async copyNodeImpl(uuids) {
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
    async pasteNodeImpl(target, uuids, keepWorldTransform = false) {
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
    async cutNodeImpl(uuids) {
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
    async resetNodeTransformImpl(uuid) {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'reset-node', { uuid }).then(() => {
                resolve((0, response_1.ok)(undefined, 'Node transform reset to default'));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async resetComponentImpl(uuid) {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'reset-component', { uuid }).then(() => {
                resolve((0, response_1.ok)(undefined, 'Component reset to default values'));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async restorePrefabImpl(nodeUuid, assetUuid) {
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
    async executeComponentMethodImpl(uuid, name, args = []) {
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
    async executeSceneScriptImpl(name, method, args = []) {
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
    async sceneSnapshotImpl() {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'snapshot').then(() => {
                resolve((0, response_1.ok)(undefined, 'Scene snapshot created'));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async sceneSnapshotAbortImpl() {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'snapshot-abort').then(() => {
                resolve((0, response_1.ok)(undefined, 'Scene snapshot aborted'));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async beginUndoRecordingImpl(nodeUuid) {
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
    async endUndoRecordingImpl(undoId) {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'end-recording', undoId).then(() => {
                resolve((0, response_1.ok)(undefined, 'Undo recording ended'));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async cancelUndoRecordingImpl(undoId) {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'cancel-recording', undoId).then(() => {
                resolve((0, response_1.ok)(undefined, 'Undo recording cancelled'));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async softReloadSceneImpl() {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'soft-reload').then(() => {
                resolve((0, response_1.ok)(undefined, 'Scene soft reloaded successfully'));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async querySceneReadyImpl() {
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
    async querySceneDirtyImpl() {
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
    async querySceneClassesImpl(extendsClass) {
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
    async querySceneComponentsImpl() {
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
    async queryComponentHasScriptImpl(className) {
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
    async queryNodesByAssetUuidImpl(assetUuid) {
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
__decorate([
    (0, decorators_1.mcpTool)({ name: 'reset_node_property', title: 'Reset node property', description: '[specialist] Reset one node property to Cocos default; mutates scene.',
        inputSchema: schema_1.z.object({
            uuid: schema_1.z.string().describe('Node UUID whose property should be reset.'),
            path: schema_1.z.string().describe('Node property path to reset, e.g. position, rotation, scale, layer.'),
        }) })
], SceneAdvancedTools.prototype, "resetNodeProperty", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'move_array_element', title: 'Move array element', description: '[specialist] Move an item in a node array property such as __comps__; mutates scene.',
        inputSchema: schema_1.z.object({
            uuid: schema_1.z.string().describe('Node UUID that owns the array property.'),
            path: schema_1.z.string().describe('Array property path, e.g. __comps__.'),
            target: schema_1.z.number().describe('Original index of the array item to move.'),
            offset: schema_1.z.number().describe('Relative move offset; positive moves later, negative moves earlier.'),
        }) })
], SceneAdvancedTools.prototype, "moveArrayElement", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'remove_array_element', title: 'Remove array element', description: '[specialist] Remove an item from a node array property by index; mutates scene.',
        inputSchema: schema_1.z.object({
            uuid: schema_1.z.string().describe('Node UUID that owns the array property.'),
            path: schema_1.z.string().describe('Array property path to edit.'),
            index: schema_1.z.number().describe('Array index to remove.'),
        }) })
], SceneAdvancedTools.prototype, "removeArrayElement", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'copy_node', title: 'Copy scene nodes', description: '[specialist] Copy nodes through the Cocos scene clipboard channel.',
        inputSchema: schema_1.z.object({
            uuids: stringOrStringArray.describe('Node UUID or UUID array to copy into the editor clipboard context.'),
        }) })
], SceneAdvancedTools.prototype, "copyNode", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'paste_node', title: 'Paste scene nodes', description: '[specialist] Paste copied nodes under a target parent; mutates scene and returns new UUIDs.',
        inputSchema: schema_1.z.object({
            target: schema_1.z.string().describe('Target parent node UUID for pasted nodes.'),
            uuids: stringOrStringArray.describe('Node UUID or UUID array returned/used by copy_node.'),
            keepWorldTransform: schema_1.z.boolean().default(false).describe('Preserve world transform while pasting/reparenting when Cocos supports it.'),
        }) })
], SceneAdvancedTools.prototype, "pasteNode", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'cut_node', title: 'Cut scene nodes', description: '[specialist] Cut nodes through the Cocos scene channel; clipboard/scene side effects.',
        inputSchema: schema_1.z.object({
            uuids: stringOrStringArray.describe('Node UUID or UUID array to cut via editor scene channel.'),
        }) })
], SceneAdvancedTools.prototype, "cutNode", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'reset_node_transform', title: 'Reset node transform', description: '[specialist] Reset node transform to Cocos defaults; mutates scene.',
        inputSchema: schema_1.z.object({
            uuid: schema_1.z.string().describe('Node UUID whose transform should be reset to default.'),
        }) })
], SceneAdvancedTools.prototype, "resetNodeTransform", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'reset_component', title: 'Reset component state', description: '[specialist] Reset a component by component UUID; mutates scene.',
        inputSchema: schema_1.z.object({
            uuid: schema_1.z.string().describe('Component UUID to reset to default values.'),
        }) })
], SceneAdvancedTools.prototype, "resetComponent", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'restore_prefab', title: 'Restore prefab instance', description: '[specialist] Restore a prefab instance through scene/restore-prefab; mutates scene.',
        inputSchema: schema_1.z.object({
            nodeUuid: schema_1.z.string().describe('Prefab instance node UUID to restore.'),
            assetUuid: schema_1.z.string().describe('Prefab asset UUID kept for context; scene/restore-prefab uses nodeUuid only.'),
        }) })
], SceneAdvancedTools.prototype, "restorePrefab", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'execute_component_method', title: 'Invoke component method', description: '[specialist] Execute an editor-exposed component method; side effects depend on method.',
        inputSchema: schema_1.z.object({
            uuid: schema_1.z.string().describe('Component UUID whose editor-exposed method should be invoked.'),
            name: schema_1.z.string().describe('Method name to execute on the component.'),
            args: schema_1.z.array(schema_1.z.any()).default([]).describe('Positional method arguments.'),
        }) })
], SceneAdvancedTools.prototype, "executeComponentMethod", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'execute_scene_script', title: 'Run scene script', description: '[specialist] Execute a scene script method; low-level escape hatch that can mutate scene.',
        inputSchema: schema_1.z.object({
            name: schema_1.z.string().describe('Scene script package/plugin name.'),
            method: schema_1.z.string().describe('Scene script method name to execute.'),
            args: schema_1.z.array(schema_1.z.any()).default([]).describe('Positional method arguments.'),
        }) })
], SceneAdvancedTools.prototype, "executeSceneScript", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'scene_snapshot', title: 'Create scene snapshot', description: '[specialist] Create a Cocos scene snapshot for undo/change tracking.',
        inputSchema: schema_1.z.object({}) })
], SceneAdvancedTools.prototype, "sceneSnapshot", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'scene_snapshot_abort', title: 'Abort scene snapshot', description: '[specialist] Abort the current Cocos scene snapshot.',
        inputSchema: schema_1.z.object({}) })
], SceneAdvancedTools.prototype, "sceneSnapshotAbort", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'begin_undo_recording', title: 'Begin undo recording', description: '[specialist] Begin undo recording for a node and return undoId.',
        inputSchema: schema_1.z.object({
            nodeUuid: schema_1.z.string().describe('Node UUID whose changes should be covered by the undo recording.'),
        }) })
], SceneAdvancedTools.prototype, "beginUndoRecording", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'end_undo_recording', title: 'Commit undo recording', description: '[specialist] Commit a previously started undo recording.',
        inputSchema: schema_1.z.object({
            undoId: schema_1.z.string().describe('Undo recording ID returned by begin_undo_recording.'),
        }) })
], SceneAdvancedTools.prototype, "endUndoRecording", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'cancel_undo_recording', title: 'Cancel undo recording', description: '[specialist] Cancel a previously started undo recording.',
        inputSchema: schema_1.z.object({
            undoId: schema_1.z.string().describe('Undo recording ID to cancel without committing.'),
        }) })
], SceneAdvancedTools.prototype, "cancelUndoRecording", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'soft_reload_scene', title: 'Reload current scene', description: '[specialist] Soft reload the current scene; Editor state side effect.',
        inputSchema: schema_1.z.object({}) })
], SceneAdvancedTools.prototype, "softReloadScene", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'query_scene_ready', title: 'Check scene readiness', description: '[specialist] Check whether the scene module reports ready.',
        inputSchema: schema_1.z.object({}) })
], SceneAdvancedTools.prototype, "querySceneReady", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'query_scene_dirty', title: 'Check scene dirty state', description: '[specialist] Check whether the current scene has unsaved changes.',
        inputSchema: schema_1.z.object({}) })
], SceneAdvancedTools.prototype, "querySceneDirty", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'query_scene_classes', title: 'List scene classes', description: '[specialist] List registered scene classes, optionally filtered by base class.',
        inputSchema: schema_1.z.object({
            extends: schema_1.z.string().optional().describe('Optional base class filter for scene/query-classes.'),
        }) })
], SceneAdvancedTools.prototype, "querySceneClasses", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'query_scene_components', title: 'List scene components', description: '[specialist] List available scene component definitions from Cocos.',
        inputSchema: schema_1.z.object({}) })
], SceneAdvancedTools.prototype, "querySceneComponents", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'query_component_has_script', title: 'Check component script', description: '[specialist] Check whether a component class has an associated script.',
        inputSchema: schema_1.z.object({
            className: schema_1.z.string().describe('Script class name to check through scene/query-component-has-script.'),
        }) })
], SceneAdvancedTools.prototype, "queryComponentHasScript", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'query_nodes_by_asset_uuid', title: 'Find nodes by asset', description: '[specialist] Find current-scene nodes that reference an asset UUID.',
        inputSchema: schema_1.z.object({
            assetUuid: schema_1.z.string().describe('Asset UUID to search for in scene nodes.'),
        }) })
], SceneAdvancedTools.prototype, "queryNodesByAssetUuid", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NlbmUtYWR2YW5jZWQtdG9vbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvdG9vbHMvc2NlbmUtYWR2YW5jZWQtdG9vbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7O0FBQUEsOENBQTJDO0FBRTNDLDBDQUFrQztBQUNsQyxrREFBdUU7QUFFdkUsa0VBQWtFO0FBQ2xFLE1BQU0sbUJBQW1CLEdBQUcsVUFBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLFVBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRSxVQUFDLENBQUMsS0FBSyxDQUFDLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUV2RSxNQUFhLGtCQUFrQjtJQUczQjtRQUNJLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBQSxzQ0FBeUIsRUFBQyxJQUFJLENBQUMsQ0FBQztJQUNoRCxDQUFDO0lBRUQsUUFBUSxLQUF1QixPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQzdELE9BQU8sQ0FBQyxRQUFnQixFQUFFLElBQVMsSUFBMkIsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBT25HLEFBQU4sS0FBSyxDQUFDLGlCQUFpQixDQUFDLElBQW9DO1FBQ3hELE9BQU8sSUFBSSxDQUFDLHFCQUFxQixDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQzVELENBQUM7SUFTSyxBQUFOLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFvRTtRQUN2RixPQUFPLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDckYsQ0FBQztJQVFL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O1NBQ3pHLENBQUMsRUFBRSxDQUFDO2lFQUdSO0FBTUs7SUFKTCxJQUFBLG9CQUFPLEVBQUMsRUFBRSxJQUFJLEVBQUUsMkJBQTJCLEVBQUUsS0FBSyxFQUFFLHFCQUFxQixFQUFFLFdBQVcsRUFBRSxxRUFBcUU7UUFDMUosV0FBVyxFQUFFLFVBQUMsQ0FBQyxNQUFNLENBQUM7WUFDbEIsU0FBUyxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLENBQUMsMENBQTBDLENBQUM7U0FDN0UsQ0FBQyxFQUFFLENBQUM7K0RBR1IiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBvaywgZmFpbCB9IGZyb20gJy4uL2xpYi9yZXNwb25zZSc7XG5pbXBvcnQgdHlwZSB7IFRvb2xEZWZpbml0aW9uLCBUb29sUmVzcG9uc2UsIFRvb2xFeGVjdXRvciB9IGZyb20gJy4uL3R5cGVzJztcbmltcG9ydCB7IHogfSBmcm9tICcuLi9saWIvc2NoZW1hJztcbmltcG9ydCB7IG1jcFRvb2wsIGRlZmluZVRvb2xzRnJvbURlY29yYXRvcnMgfSBmcm9tICcuLi9saWIvZGVjb3JhdG9ycyc7XG5cbi8vIFNldmVyYWwgdG9vbHMgYWNjZXB0IGVpdGhlciBhIHNpbmdsZSBVVUlEIG9yIGFuIGFycmF5IG9mIFVVSURzLlxuY29uc3Qgc3RyaW5nT3JTdHJpbmdBcnJheSA9IHoudW5pb24oW3ouc3RyaW5nKCksIHouYXJyYXkoei5zdHJpbmcoKSldKTtcblxuZXhwb3J0IGNsYXNzIFNjZW5lQWR2YW5jZWRUb29scyBpbXBsZW1lbnRzIFRvb2xFeGVjdXRvciB7XG4gICAgcHJpdmF0ZSByZWFkb25seSBleGVjOiBUb29sRXhlY3V0b3I7XG5cbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgdGhpcy5leGVjID0gZGVmaW5lVG9vbHNGcm9tRGVjb3JhdG9ycyh0aGlzKTtcbiAgICB9XG5cbiAgICBnZXRUb29scygpOiBUb29sRGVmaW5pdGlvbltdIHsgcmV0dXJuIHRoaXMuZXhlYy5nZXRUb29scygpOyB9XG4gICAgZXhlY3V0ZSh0b29sTmFtZTogc3RyaW5nLCBhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4geyByZXR1cm4gdGhpcy5leGVjLmV4ZWN1dGUodG9vbE5hbWUsIGFyZ3MpOyB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdyZXNldF9ub2RlX3Byb3BlcnR5JywgdGl0bGU6ICdSZXNldCBub2RlIHByb3BlcnR5JywgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gUmVzZXQgb25lIG5vZGUgcHJvcGVydHkgdG8gQ29jb3MgZGVmYXVsdDsgbXV0YXRlcyBzY2VuZS4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgdXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnTm9kZSBVVUlEIHdob3NlIHByb3BlcnR5IHNob3VsZCBiZSByZXNldC4nKSxcbiAgICAgICAgICAgIHBhdGg6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ05vZGUgcHJvcGVydHkgcGF0aCB0byByZXNldCwgZS5nLiBwb3NpdGlvbiwgcm90YXRpb24sIHNjYWxlLCBsYXllci4nKSxcbiAgICAgICAgfSkgfSlcbiAgICBhc3luYyByZXNldE5vZGVQcm9wZXJ0eShhcmdzOiB7IHV1aWQ6IHN0cmluZzsgcGF0aDogc3RyaW5nIH0pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5yZXNldE5vZGVQcm9wZXJ0eUltcGwoYXJncy51dWlkLCBhcmdzLnBhdGgpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHsgbmFtZTogJ21vdmVfYXJyYXlfZWxlbWVudCcsIHRpdGxlOiAnTW92ZSBhcnJheSBlbGVtZW50JywgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gTW92ZSBhbiBpdGVtIGluIGEgbm9kZSBhcnJheSBwcm9wZXJ0eSBzdWNoIGFzIF9fY29tcHNfXzsgbXV0YXRlcyBzY2VuZS4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgdXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnTm9kZSBVVUlEIHRoYXQgb3ducyB0aGUgYXJyYXkgcHJvcGVydHkuJyksXG4gICAgICAgICAgICBwYXRoOiB6LnN0cmluZygpLmRlc2NyaWJlKCdBcnJheSBwcm9wZXJ0eSBwYXRoLCBlLmcuIF9fY29tcHNfXy4nKSxcbiAgICAgICAgICAgIHRhcmdldDogei5udW1iZXIoKS5kZXNjcmliZSgnT3JpZ2luYWwgaW5kZXggb2YgdGhlIGFycmF5IGl0ZW0gdG8gbW92ZS4nKSxcbiAgICAgICAgICAgIG9mZnNldDogei5udW1iZXIoKS5kZXNjcmliZSgnUmVsYXRpdmUgbW92ZSBvZmZzZXQ7IHBvc2l0aXZlIG1vdmVzIGxhdGVyLCBuZWdhdGl2ZSBtb3ZlcyBlYXJsaWVyLicpLFxuICAgICAgICB9KSB9KVxuICAgIGFzeW5jIG1vdmVBcnJheUVsZW1lbnQoYXJnczogeyB1dWlkOiBzdHJpbmc7IHBhdGg6IHN0cmluZzsgdGFyZ2V0OiBudW1iZXI7IG9mZnNldDogbnVtYmVyIH0pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5tb3ZlQXJyYXlFbGVtZW50SW1wbChhcmdzLnV1aWQsIGFyZ3MucGF0aCwgYXJncy50YXJnZXQsIGFyZ3Mub2Zmc2V0KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdyZW1vdmVfYXJyYXlfZWxlbWVudCcsIHRpdGxlOiAnUmVtb3ZlIGFycmF5IGVsZW1lbnQnLCBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBSZW1vdmUgYW4gaXRlbSBmcm9tIGEgbm9kZSBhcnJheSBwcm9wZXJ0eSBieSBpbmRleDsgbXV0YXRlcyBzY2VuZS4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgdXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnTm9kZSBVVUlEIHRoYXQgb3ducyB0aGUgYXJyYXkgcHJvcGVydHkuJyksXG4gICAgICAgICAgICBwYXRoOiB6LnN0cmluZygpLmRlc2NyaWJlKCdBcnJheSBwcm9wZXJ0eSBwYXRoIHRvIGVkaXQuJyksXG4gICAgICAgICAgICBpbmRleDogei5udW1iZXIoKS5kZXNjcmliZSgnQXJyYXkgaW5kZXggdG8gcmVtb3ZlLicpLFxuICAgICAgICB9KSB9KVxuICAgIGFzeW5jIHJlbW92ZUFycmF5RWxlbWVudChhcmdzOiB7IHV1aWQ6IHN0cmluZzsgcGF0aDogc3RyaW5nOyBpbmRleDogbnVtYmVyIH0pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5yZW1vdmVBcnJheUVsZW1lbnRJbXBsKGFyZ3MudXVpZCwgYXJncy5wYXRoLCBhcmdzLmluZGV4KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdjb3B5X25vZGUnLCB0aXRsZTogJ0NvcHkgc2NlbmUgbm9kZXMnLCBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBDb3B5IG5vZGVzIHRocm91Z2ggdGhlIENvY29zIHNjZW5lIGNsaXBib2FyZCBjaGFubmVsLicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICB1dWlkczogc3RyaW5nT3JTdHJpbmdBcnJheS5kZXNjcmliZSgnTm9kZSBVVUlEIG9yIFVVSUQgYXJyYXkgdG8gY29weSBpbnRvIHRoZSBlZGl0b3IgY2xpcGJvYXJkIGNvbnRleHQuJyksXG4gICAgICAgIH0pIH0pXG4gICAgYXN5bmMgY29weU5vZGUoYXJnczogeyB1dWlkczogc3RyaW5nIHwgc3RyaW5nW10gfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLmNvcHlOb2RlSW1wbChhcmdzLnV1aWRzKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdwYXN0ZV9ub2RlJywgdGl0bGU6ICdQYXN0ZSBzY2VuZSBub2RlcycsIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFBhc3RlIGNvcGllZCBub2RlcyB1bmRlciBhIHRhcmdldCBwYXJlbnQ7IG11dGF0ZXMgc2NlbmUgYW5kIHJldHVybnMgbmV3IFVVSURzLicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICB0YXJnZXQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1RhcmdldCBwYXJlbnQgbm9kZSBVVUlEIGZvciBwYXN0ZWQgbm9kZXMuJyksXG4gICAgICAgICAgICB1dWlkczogc3RyaW5nT3JTdHJpbmdBcnJheS5kZXNjcmliZSgnTm9kZSBVVUlEIG9yIFVVSUQgYXJyYXkgcmV0dXJuZWQvdXNlZCBieSBjb3B5X25vZGUuJyksXG4gICAgICAgICAgICBrZWVwV29ybGRUcmFuc2Zvcm06IHouYm9vbGVhbigpLmRlZmF1bHQoZmFsc2UpLmRlc2NyaWJlKCdQcmVzZXJ2ZSB3b3JsZCB0cmFuc2Zvcm0gd2hpbGUgcGFzdGluZy9yZXBhcmVudGluZyB3aGVuIENvY29zIHN1cHBvcnRzIGl0LicpLFxuICAgICAgICB9KSB9KVxuICAgIGFzeW5jIHBhc3RlTm9kZShhcmdzOiB7IHRhcmdldDogc3RyaW5nOyB1dWlkczogc3RyaW5nIHwgc3RyaW5nW107IGtlZXBXb3JsZFRyYW5zZm9ybT86IGJvb2xlYW4gfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLnBhc3RlTm9kZUltcGwoYXJncy50YXJnZXQsIGFyZ3MudXVpZHMsIGFyZ3Mua2VlcFdvcmxkVHJhbnNmb3JtKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdjdXRfbm9kZScsIHRpdGxlOiAnQ3V0IHNjZW5lIG5vZGVzJywgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gQ3V0IG5vZGVzIHRocm91Z2ggdGhlIENvY29zIHNjZW5lIGNoYW5uZWw7IGNsaXBib2FyZC9zY2VuZSBzaWRlIGVmZmVjdHMuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIHV1aWRzOiBzdHJpbmdPclN0cmluZ0FycmF5LmRlc2NyaWJlKCdOb2RlIFVVSUQgb3IgVVVJRCBhcnJheSB0byBjdXQgdmlhIGVkaXRvciBzY2VuZSBjaGFubmVsLicpLFxuICAgICAgICB9KSB9KVxuICAgIGFzeW5jIGN1dE5vZGUoYXJnczogeyB1dWlkczogc3RyaW5nIHwgc3RyaW5nW10gfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLmN1dE5vZGVJbXBsKGFyZ3MudXVpZHMpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHsgbmFtZTogJ3Jlc2V0X25vZGVfdHJhbnNmb3JtJywgdGl0bGU6ICdSZXNldCBub2RlIHRyYW5zZm9ybScsIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFJlc2V0IG5vZGUgdHJhbnNmb3JtIHRvIENvY29zIGRlZmF1bHRzOyBtdXRhdGVzIHNjZW5lLicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICB1dWlkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdOb2RlIFVVSUQgd2hvc2UgdHJhbnNmb3JtIHNob3VsZCBiZSByZXNldCB0byBkZWZhdWx0LicpLFxuICAgICAgICB9KSB9KVxuICAgIGFzeW5jIHJlc2V0Tm9kZVRyYW5zZm9ybShhcmdzOiB7IHV1aWQ6IHN0cmluZyB9KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMucmVzZXROb2RlVHJhbnNmb3JtSW1wbChhcmdzLnV1aWQpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHsgbmFtZTogJ3Jlc2V0X2NvbXBvbmVudCcsIHRpdGxlOiAnUmVzZXQgY29tcG9uZW50IHN0YXRlJywgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gUmVzZXQgYSBjb21wb25lbnQgYnkgY29tcG9uZW50IFVVSUQ7IG11dGF0ZXMgc2NlbmUuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIHV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0NvbXBvbmVudCBVVUlEIHRvIHJlc2V0IHRvIGRlZmF1bHQgdmFsdWVzLicpLFxuICAgICAgICB9KSB9KVxuICAgIGFzeW5jIHJlc2V0Q29tcG9uZW50KGFyZ3M6IHsgdXVpZDogc3RyaW5nIH0pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5yZXNldENvbXBvbmVudEltcGwoYXJncy51dWlkKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdyZXN0b3JlX3ByZWZhYicsIHRpdGxlOiAnUmVzdG9yZSBwcmVmYWIgaW5zdGFuY2UnLCBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBSZXN0b3JlIGEgcHJlZmFiIGluc3RhbmNlIHRocm91Z2ggc2NlbmUvcmVzdG9yZS1wcmVmYWI7IG11dGF0ZXMgc2NlbmUuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIG5vZGVVdWlkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdQcmVmYWIgaW5zdGFuY2Ugbm9kZSBVVUlEIHRvIHJlc3RvcmUuJyksXG4gICAgICAgICAgICBhc3NldFV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1ByZWZhYiBhc3NldCBVVUlEIGtlcHQgZm9yIGNvbnRleHQ7IHNjZW5lL3Jlc3RvcmUtcHJlZmFiIHVzZXMgbm9kZVV1aWQgb25seS4nKSxcbiAgICAgICAgfSkgfSlcbiAgICBhc3luYyByZXN0b3JlUHJlZmFiKGFyZ3M6IHsgbm9kZVV1aWQ6IHN0cmluZzsgYXNzZXRVdWlkOiBzdHJpbmcgfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLnJlc3RvcmVQcmVmYWJJbXBsKGFyZ3Mubm9kZVV1aWQsIGFyZ3MuYXNzZXRVdWlkKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdleGVjdXRlX2NvbXBvbmVudF9tZXRob2QnLCB0aXRsZTogJ0ludm9rZSBjb21wb25lbnQgbWV0aG9kJywgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gRXhlY3V0ZSBhbiBlZGl0b3ItZXhwb3NlZCBjb21wb25lbnQgbWV0aG9kOyBzaWRlIGVmZmVjdHMgZGVwZW5kIG9uIG1ldGhvZC4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgdXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnQ29tcG9uZW50IFVVSUQgd2hvc2UgZWRpdG9yLWV4cG9zZWQgbWV0aG9kIHNob3VsZCBiZSBpbnZva2VkLicpLFxuICAgICAgICAgICAgbmFtZTogei5zdHJpbmcoKS5kZXNjcmliZSgnTWV0aG9kIG5hbWUgdG8gZXhlY3V0ZSBvbiB0aGUgY29tcG9uZW50LicpLFxuICAgICAgICAgICAgYXJnczogei5hcnJheSh6LmFueSgpKS5kZWZhdWx0KFtdKS5kZXNjcmliZSgnUG9zaXRpb25hbCBtZXRob2QgYXJndW1lbnRzLicpLFxuICAgICAgICB9KSB9KVxuICAgIGFzeW5jIGV4ZWN1dGVDb21wb25lbnRNZXRob2QoYXJnczogeyB1dWlkOiBzdHJpbmc7IG5hbWU6IHN0cmluZzsgYXJncz86IGFueVtdIH0pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5leGVjdXRlQ29tcG9uZW50TWV0aG9kSW1wbChhcmdzLnV1aWQsIGFyZ3MubmFtZSwgYXJncy5hcmdzKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdleGVjdXRlX3NjZW5lX3NjcmlwdCcsIHRpdGxlOiAnUnVuIHNjZW5lIHNjcmlwdCcsIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIEV4ZWN1dGUgYSBzY2VuZSBzY3JpcHQgbWV0aG9kOyBsb3ctbGV2ZWwgZXNjYXBlIGhhdGNoIHRoYXQgY2FuIG11dGF0ZSBzY2VuZS4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgbmFtZTogei5zdHJpbmcoKS5kZXNjcmliZSgnU2NlbmUgc2NyaXB0IHBhY2thZ2UvcGx1Z2luIG5hbWUuJyksXG4gICAgICAgICAgICBtZXRob2Q6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1NjZW5lIHNjcmlwdCBtZXRob2QgbmFtZSB0byBleGVjdXRlLicpLFxuICAgICAgICAgICAgYXJnczogei5hcnJheSh6LmFueSgpKS5kZWZhdWx0KFtdKS5kZXNjcmliZSgnUG9zaXRpb25hbCBtZXRob2QgYXJndW1lbnRzLicpLFxuICAgICAgICB9KSB9KVxuICAgIGFzeW5jIGV4ZWN1dGVTY2VuZVNjcmlwdChhcmdzOiB7IG5hbWU6IHN0cmluZzsgbWV0aG9kOiBzdHJpbmc7IGFyZ3M/OiBhbnlbXSB9KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZXhlY3V0ZVNjZW5lU2NyaXB0SW1wbChhcmdzLm5hbWUsIGFyZ3MubWV0aG9kLCBhcmdzLmFyZ3MpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHsgbmFtZTogJ3NjZW5lX3NuYXBzaG90JywgdGl0bGU6ICdDcmVhdGUgc2NlbmUgc25hcHNob3QnLCBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBDcmVhdGUgYSBDb2NvcyBzY2VuZSBzbmFwc2hvdCBmb3IgdW5kby9jaGFuZ2UgdHJhY2tpbmcuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSB9KVxuICAgIGFzeW5jIHNjZW5lU25hcHNob3QoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2NlbmVTbmFwc2hvdEltcGwoKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdzY2VuZV9zbmFwc2hvdF9hYm9ydCcsIHRpdGxlOiAnQWJvcnQgc2NlbmUgc25hcHNob3QnLCBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBBYm9ydCB0aGUgY3VycmVudCBDb2NvcyBzY2VuZSBzbmFwc2hvdC4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pIH0pXG4gICAgYXN5bmMgc2NlbmVTbmFwc2hvdEFib3J0KCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLnNjZW5lU25hcHNob3RBYm9ydEltcGwoKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdiZWdpbl91bmRvX3JlY29yZGluZycsIHRpdGxlOiAnQmVnaW4gdW5kbyByZWNvcmRpbmcnLCBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBCZWdpbiB1bmRvIHJlY29yZGluZyBmb3IgYSBub2RlIGFuZCByZXR1cm4gdW5kb0lkLicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICBub2RlVXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnTm9kZSBVVUlEIHdob3NlIGNoYW5nZXMgc2hvdWxkIGJlIGNvdmVyZWQgYnkgdGhlIHVuZG8gcmVjb3JkaW5nLicpLFxuICAgICAgICB9KSB9KVxuICAgIGFzeW5jIGJlZ2luVW5kb1JlY29yZGluZyhhcmdzOiB7IG5vZGVVdWlkOiBzdHJpbmcgfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLmJlZ2luVW5kb1JlY29yZGluZ0ltcGwoYXJncy5ub2RlVXVpZCk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woeyBuYW1lOiAnZW5kX3VuZG9fcmVjb3JkaW5nJywgdGl0bGU6ICdDb21taXQgdW5kbyByZWNvcmRpbmcnLCBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBDb21taXQgYSBwcmV2aW91c2x5IHN0YXJ0ZWQgdW5kbyByZWNvcmRpbmcuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIHVuZG9JZDogei5zdHJpbmcoKS5kZXNjcmliZSgnVW5kbyByZWNvcmRpbmcgSUQgcmV0dXJuZWQgYnkgYmVnaW5fdW5kb19yZWNvcmRpbmcuJyksXG4gICAgICAgIH0pIH0pXG4gICAgYXN5bmMgZW5kVW5kb1JlY29yZGluZyhhcmdzOiB7IHVuZG9JZDogc3RyaW5nIH0pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5lbmRVbmRvUmVjb3JkaW5nSW1wbChhcmdzLnVuZG9JZCk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woeyBuYW1lOiAnY2FuY2VsX3VuZG9fcmVjb3JkaW5nJywgdGl0bGU6ICdDYW5jZWwgdW5kbyByZWNvcmRpbmcnLCBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBDYW5jZWwgYSBwcmV2aW91c2x5IHN0YXJ0ZWQgdW5kbyByZWNvcmRpbmcuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIHVuZG9JZDogei5zdHJpbmcoKS5kZXNjcmliZSgnVW5kbyByZWNvcmRpbmcgSUQgdG8gY2FuY2VsIHdpdGhvdXQgY29tbWl0dGluZy4nKSxcbiAgICAgICAgfSkgfSlcbiAgICBhc3luYyBjYW5jZWxVbmRvUmVjb3JkaW5nKGFyZ3M6IHsgdW5kb0lkOiBzdHJpbmcgfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLmNhbmNlbFVuZG9SZWNvcmRpbmdJbXBsKGFyZ3MudW5kb0lkKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdzb2Z0X3JlbG9hZF9zY2VuZScsIHRpdGxlOiAnUmVsb2FkIGN1cnJlbnQgc2NlbmUnLCBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBTb2Z0IHJlbG9hZCB0aGUgY3VycmVudCBzY2VuZTsgRWRpdG9yIHN0YXRlIHNpZGUgZWZmZWN0LicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSkgfSlcbiAgICBhc3luYyBzb2Z0UmVsb2FkU2NlbmUoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc29mdFJlbG9hZFNjZW5lSW1wbCgpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHsgbmFtZTogJ3F1ZXJ5X3NjZW5lX3JlYWR5JywgdGl0bGU6ICdDaGVjayBzY2VuZSByZWFkaW5lc3MnLCBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBDaGVjayB3aGV0aGVyIHRoZSBzY2VuZSBtb2R1bGUgcmVwb3J0cyByZWFkeS4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pIH0pXG4gICAgYXN5bmMgcXVlcnlTY2VuZVJlYWR5KCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLnF1ZXJ5U2NlbmVSZWFkeUltcGwoKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdxdWVyeV9zY2VuZV9kaXJ0eScsIHRpdGxlOiAnQ2hlY2sgc2NlbmUgZGlydHkgc3RhdGUnLCBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBDaGVjayB3aGV0aGVyIHRoZSBjdXJyZW50IHNjZW5lIGhhcyB1bnNhdmVkIGNoYW5nZXMuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSB9KVxuICAgIGFzeW5jIHF1ZXJ5U2NlbmVEaXJ0eSgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5xdWVyeVNjZW5lRGlydHlJbXBsKCk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woeyBuYW1lOiAncXVlcnlfc2NlbmVfY2xhc3NlcycsIHRpdGxlOiAnTGlzdCBzY2VuZSBjbGFzc2VzJywgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gTGlzdCByZWdpc3RlcmVkIHNjZW5lIGNsYXNzZXMsIG9wdGlvbmFsbHkgZmlsdGVyZWQgYnkgYmFzZSBjbGFzcy4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgZXh0ZW5kczogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdPcHRpb25hbCBiYXNlIGNsYXNzIGZpbHRlciBmb3Igc2NlbmUvcXVlcnktY2xhc3Nlcy4nKSxcbiAgICAgICAgfSkgfSlcbiAgICBhc3luYyBxdWVyeVNjZW5lQ2xhc3NlcyhhcmdzOiB7IGV4dGVuZHM/OiBzdHJpbmcgfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLnF1ZXJ5U2NlbmVDbGFzc2VzSW1wbChhcmdzLmV4dGVuZHMpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHsgbmFtZTogJ3F1ZXJ5X3NjZW5lX2NvbXBvbmVudHMnLCB0aXRsZTogJ0xpc3Qgc2NlbmUgY29tcG9uZW50cycsIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIExpc3QgYXZhaWxhYmxlIHNjZW5lIGNvbXBvbmVudCBkZWZpbml0aW9ucyBmcm9tIENvY29zLicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSkgfSlcbiAgICBhc3luYyBxdWVyeVNjZW5lQ29tcG9uZW50cygpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5xdWVyeVNjZW5lQ29tcG9uZW50c0ltcGwoKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdxdWVyeV9jb21wb25lbnRfaGFzX3NjcmlwdCcsIHRpdGxlOiAnQ2hlY2sgY29tcG9uZW50IHNjcmlwdCcsIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIENoZWNrIHdoZXRoZXIgYSBjb21wb25lbnQgY2xhc3MgaGFzIGFuIGFzc29jaWF0ZWQgc2NyaXB0LicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICBjbGFzc05hbWU6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1NjcmlwdCBjbGFzcyBuYW1lIHRvIGNoZWNrIHRocm91Z2ggc2NlbmUvcXVlcnktY29tcG9uZW50LWhhcy1zY3JpcHQuJyksXG4gICAgICAgIH0pIH0pXG4gICAgYXN5bmMgcXVlcnlDb21wb25lbnRIYXNTY3JpcHQoYXJnczogeyBjbGFzc05hbWU6IHN0cmluZyB9KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMucXVlcnlDb21wb25lbnRIYXNTY3JpcHRJbXBsKGFyZ3MuY2xhc3NOYW1lKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdxdWVyeV9ub2Rlc19ieV9hc3NldF91dWlkJywgdGl0bGU6ICdGaW5kIG5vZGVzIGJ5IGFzc2V0JywgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gRmluZCBjdXJyZW50LXNjZW5lIG5vZGVzIHRoYXQgcmVmZXJlbmNlIGFuIGFzc2V0IFVVSUQuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIGFzc2V0VXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnQXNzZXQgVVVJRCB0byBzZWFyY2ggZm9yIGluIHNjZW5lIG5vZGVzLicpLFxuICAgICAgICB9KSB9KVxuICAgIGFzeW5jIHF1ZXJ5Tm9kZXNCeUFzc2V0VXVpZChhcmdzOiB7IGFzc2V0VXVpZDogc3RyaW5nIH0pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5xdWVyeU5vZGVzQnlBc3NldFV1aWRJbXBsKGFyZ3MuYXNzZXRVdWlkKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHJlc2V0Tm9kZVByb3BlcnR5SW1wbCh1dWlkOiBzdHJpbmcsIHBhdGg6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncmVzZXQtcHJvcGVydHknLCB7IFxuICAgICAgICAgICAgICAgIHV1aWQsIFxuICAgICAgICAgICAgICAgIHBhdGgsIFxuICAgICAgICAgICAgICAgIGR1bXA6IHsgdmFsdWU6IG51bGwgfSBcbiAgICAgICAgICAgIH0pLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2sodW5kZWZpbmVkLCBgUHJvcGVydHkgJyR7cGF0aH0nIHJlc2V0IHRvIGRlZmF1bHQgdmFsdWVgKSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgbW92ZUFycmF5RWxlbWVudEltcGwodXVpZDogc3RyaW5nLCBwYXRoOiBzdHJpbmcsIHRhcmdldDogbnVtYmVyLCBvZmZzZXQ6IG51bWJlcik6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnbW92ZS1hcnJheS1lbGVtZW50Jywge1xuICAgICAgICAgICAgICAgIHV1aWQsXG4gICAgICAgICAgICAgICAgcGF0aCxcbiAgICAgICAgICAgICAgICB0YXJnZXQsXG4gICAgICAgICAgICAgICAgb2Zmc2V0XG4gICAgICAgICAgICB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHVuZGVmaW5lZCwgYEFycmF5IGVsZW1lbnQgYXQgaW5kZXggJHt0YXJnZXR9IG1vdmVkIGJ5ICR7b2Zmc2V0fWApKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyByZW1vdmVBcnJheUVsZW1lbnRJbXBsKHV1aWQ6IHN0cmluZywgcGF0aDogc3RyaW5nLCBpbmRleDogbnVtYmVyKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdyZW1vdmUtYXJyYXktZWxlbWVudCcsIHtcbiAgICAgICAgICAgICAgICB1dWlkLFxuICAgICAgICAgICAgICAgIHBhdGgsXG4gICAgICAgICAgICAgICAgaW5kZXhcbiAgICAgICAgICAgIH0pLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2sodW5kZWZpbmVkLCBgQXJyYXkgZWxlbWVudCBhdCBpbmRleCAke2luZGV4fSByZW1vdmVkYCkpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGNvcHlOb2RlSW1wbCh1dWlkczogc3RyaW5nIHwgc3RyaW5nW10pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ2NvcHktbm9kZScsIHV1aWRzKS50aGVuKChyZXN1bHQ6IHN0cmluZyB8IHN0cmluZ1tdKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb3BpZWRVdWlkczogcmVzdWx0LFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogJ05vZGUocykgY29waWVkIHN1Y2Nlc3NmdWxseSdcbiAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHBhc3RlTm9kZUltcGwodGFyZ2V0OiBzdHJpbmcsIHV1aWRzOiBzdHJpbmcgfCBzdHJpbmdbXSwga2VlcFdvcmxkVHJhbnNmb3JtOiBib29sZWFuID0gZmFsc2UpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3Bhc3RlLW5vZGUnLCB7XG4gICAgICAgICAgICAgICAgdGFyZ2V0LFxuICAgICAgICAgICAgICAgIHV1aWRzLFxuICAgICAgICAgICAgICAgIGtlZXBXb3JsZFRyYW5zZm9ybVxuICAgICAgICAgICAgfSkudGhlbigocmVzdWx0OiBzdHJpbmcgfCBzdHJpbmdbXSkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgbmV3VXVpZHM6IHJlc3VsdCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdOb2RlKHMpIHBhc3RlZCBzdWNjZXNzZnVsbHknXG4gICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBjdXROb2RlSW1wbCh1dWlkczogc3RyaW5nIHwgc3RyaW5nW10pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ2N1dC1ub2RlJywgdXVpZHMpLnRoZW4oKHJlc3VsdDogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICBjdXRVdWlkczogcmVzdWx0LFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogJ05vZGUocykgY3V0IHN1Y2Nlc3NmdWxseSdcbiAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHJlc2V0Tm9kZVRyYW5zZm9ybUltcGwodXVpZDogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdyZXNldC1ub2RlJywgeyB1dWlkIH0pLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2sodW5kZWZpbmVkLCAnTm9kZSB0cmFuc2Zvcm0gcmVzZXQgdG8gZGVmYXVsdCcpKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyByZXNldENvbXBvbmVudEltcGwodXVpZDogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdyZXNldC1jb21wb25lbnQnLCB7IHV1aWQgfSkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh1bmRlZmluZWQsICdDb21wb25lbnQgcmVzZXQgdG8gZGVmYXVsdCB2YWx1ZXMnKSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgcmVzdG9yZVByZWZhYkltcGwobm9kZVV1aWQ6IHN0cmluZywgYXNzZXRVdWlkOiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICAvLyBzY2VuZS9yZXN0b3JlLXByZWZhYiB0YWtlcyBSZXNldENvbXBvbmVudE9wdGlvbnMgPSB7IHV1aWQ6IHN0cmluZyB9XG4gICAgICAgIC8vIHBlciBAY29jb3MvY3JlYXRvci10eXBlcy4gYXNzZXRVdWlkIGlzIGtlcHQgb24gdGhlIHB1YmxpYyBzY2hlbWEgZm9yXG4gICAgICAgIC8vIHJlc3BvbnNlIGNvbnRleHQgYnV0IGRvZXMgbm90IGZsb3cgaW50byB0aGUgZWRpdG9yIG1lc3NhZ2Ug4oCUIHBhc3NpbmdcbiAgICAgICAgLy8gZXh0cmEgcG9zaXRpb25hbCBhcmdzIGlzIHNpbGVudGx5IGRyb3BwZWQgYnkgRWRpdG9yLk1lc3NhZ2UuXG4gICAgICAgIHZvaWQgYXNzZXRVdWlkO1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3Jlc3RvcmUtcHJlZmFiJywgeyB1dWlkOiBub2RlVXVpZCB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHVuZGVmaW5lZCwgJ1ByZWZhYiByZXN0b3JlZCBzdWNjZXNzZnVsbHknKSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZXhlY3V0ZUNvbXBvbmVudE1ldGhvZEltcGwodXVpZDogc3RyaW5nLCBuYW1lOiBzdHJpbmcsIGFyZ3M6IGFueVtdID0gW10pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ2V4ZWN1dGUtY29tcG9uZW50LW1ldGhvZCcsIHtcbiAgICAgICAgICAgICAgICB1dWlkLFxuICAgICAgICAgICAgICAgIG5hbWUsXG4gICAgICAgICAgICAgICAgYXJnc1xuICAgICAgICAgICAgfSkudGhlbigocmVzdWx0OiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdDogcmVzdWx0LFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYE1ldGhvZCAnJHtuYW1lfScgZXhlY3V0ZWQgc3VjY2Vzc2Z1bGx5YFxuICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZXhlY3V0ZVNjZW5lU2NyaXB0SW1wbChuYW1lOiBzdHJpbmcsIG1ldGhvZDogc3RyaW5nLCBhcmdzOiBhbnlbXSA9IFtdKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdleGVjdXRlLXNjZW5lLXNjcmlwdCcsIHtcbiAgICAgICAgICAgICAgICBuYW1lLFxuICAgICAgICAgICAgICAgIG1ldGhvZCxcbiAgICAgICAgICAgICAgICBhcmdzXG4gICAgICAgICAgICB9KS50aGVuKChyZXN1bHQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2socmVzdWx0KSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgc2NlbmVTbmFwc2hvdEltcGwoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdzbmFwc2hvdCcpLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2sodW5kZWZpbmVkLCAnU2NlbmUgc25hcHNob3QgY3JlYXRlZCcpKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBzY2VuZVNuYXBzaG90QWJvcnRJbXBsKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnc25hcHNob3QtYWJvcnQnKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHVuZGVmaW5lZCwgJ1NjZW5lIHNuYXBzaG90IGFib3J0ZWQnKSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgYmVnaW5VbmRvUmVjb3JkaW5nSW1wbChub2RlVXVpZDogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdiZWdpbi1yZWNvcmRpbmcnLCBub2RlVXVpZCkudGhlbigodW5kb0lkOiBzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHVuZG9JZDogdW5kb0lkLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogJ1VuZG8gcmVjb3JkaW5nIHN0YXJ0ZWQnXG4gICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBlbmRVbmRvUmVjb3JkaW5nSW1wbCh1bmRvSWQ6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnZW5kLXJlY29yZGluZycsIHVuZG9JZCkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh1bmRlZmluZWQsICdVbmRvIHJlY29yZGluZyBlbmRlZCcpKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBjYW5jZWxVbmRvUmVjb3JkaW5nSW1wbCh1bmRvSWQ6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnY2FuY2VsLXJlY29yZGluZycsIHVuZG9JZCkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh1bmRlZmluZWQsICdVbmRvIHJlY29yZGluZyBjYW5jZWxsZWQnKSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgc29mdFJlbG9hZFNjZW5lSW1wbCgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3NvZnQtcmVsb2FkJykudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh1bmRlZmluZWQsICdTY2VuZSBzb2Z0IHJlbG9hZGVkIHN1Y2Nlc3NmdWxseScpKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBxdWVyeVNjZW5lUmVhZHlJbXBsKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktaXMtcmVhZHknKS50aGVuKChyZWFkeTogYm9vbGVhbikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVhZHk6IHJlYWR5LFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogcmVhZHkgPyAnU2NlbmUgaXMgcmVhZHknIDogJ1NjZW5lIGlzIG5vdCByZWFkeSdcbiAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHF1ZXJ5U2NlbmVEaXJ0eUltcGwoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1kaXJ0eScpLnRoZW4oKGRpcnR5OiBib29sZWFuKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICBkaXJ0eTogZGlydHksXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBkaXJ0eSA/ICdTY2VuZSBoYXMgdW5zYXZlZCBjaGFuZ2VzJyA6ICdTY2VuZSBpcyBjbGVhbidcbiAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHF1ZXJ5U2NlbmVDbGFzc2VzSW1wbChleHRlbmRzQ2xhc3M/OiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IG9wdGlvbnM6IGFueSA9IHt9O1xuICAgICAgICAgICAgaWYgKGV4dGVuZHNDbGFzcykge1xuICAgICAgICAgICAgICAgIG9wdGlvbnMuZXh0ZW5kcyA9IGV4dGVuZHNDbGFzcztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktY2xhc3NlcycsIG9wdGlvbnMpLnRoZW4oKGNsYXNzZXM6IGFueVtdKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICBjbGFzc2VzOiBjbGFzc2VzLFxuICAgICAgICAgICAgICAgICAgICAgICAgY291bnQ6IGNsYXNzZXMubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICAgICAgZXh0ZW5kc0ZpbHRlcjogZXh0ZW5kc0NsYXNzXG4gICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBxdWVyeVNjZW5lQ29tcG9uZW50c0ltcGwoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1jb21wb25lbnRzJykudGhlbigoY29tcG9uZW50czogYW55W10pID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudHM6IGNvbXBvbmVudHMsXG4gICAgICAgICAgICAgICAgICAgICAgICBjb3VudDogY29tcG9uZW50cy5sZW5ndGhcbiAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHF1ZXJ5Q29tcG9uZW50SGFzU2NyaXB0SW1wbChjbGFzc05hbWU6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktY29tcG9uZW50LWhhcy1zY3JpcHQnLCBjbGFzc05hbWUpLnRoZW4oKGhhc1NjcmlwdDogYm9vbGVhbikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lOiBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBoYXNTY3JpcHQ6IGhhc1NjcmlwdCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGhhc1NjcmlwdCA/IGBDb21wb25lbnQgJyR7Y2xhc3NOYW1lfScgaGFzIHNjcmlwdGAgOiBgQ29tcG9uZW50ICcke2NsYXNzTmFtZX0nIGRvZXMgbm90IGhhdmUgc2NyaXB0YFxuICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgcXVlcnlOb2Rlc0J5QXNzZXRVdWlkSW1wbChhc3NldFV1aWQ6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktbm9kZXMtYnktYXNzZXQtdXVpZCcsIGFzc2V0VXVpZCkudGhlbigobm9kZVV1aWRzOiBzdHJpbmdbXSkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgYXNzZXRVdWlkOiBhc3NldFV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBub2RlVXVpZHM6IG5vZGVVdWlkcyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvdW50OiBub2RlVXVpZHMubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYEZvdW5kICR7bm9kZVV1aWRzLmxlbmd0aH0gbm9kZXMgdXNpbmcgYXNzZXRgXG4gICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxufVxuIl19