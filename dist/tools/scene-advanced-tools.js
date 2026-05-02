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
const scene_advanced_docs_1 = require("../data/scene-advanced-docs");
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
    (0, decorators_1.mcpTool)({ name: 'reset_node_property', title: 'Reset node property', description: scene_advanced_docs_1.SCENE_ADVANCED_DOCS.reset_node_property,
        inputSchema: schema_1.z.object({
            uuid: schema_1.z.string().describe('Node UUID whose property should be reset.'),
            path: schema_1.z.string().describe('Node property path to reset, e.g. position, rotation, scale, layer.'),
        }) })
], SceneAdvancedTools.prototype, "resetNodeProperty", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'move_array_element', title: 'Move array element', description: scene_advanced_docs_1.SCENE_ADVANCED_DOCS.move_array_element,
        inputSchema: schema_1.z.object({
            uuid: schema_1.z.string().describe('Node UUID that owns the array property.'),
            path: schema_1.z.string().describe('Array property path, e.g. __comps__.'),
            target: schema_1.z.number().describe('Original index of the array item to move.'),
            offset: schema_1.z.number().describe('Relative move offset; positive moves later, negative moves earlier.'),
        }) })
], SceneAdvancedTools.prototype, "moveArrayElement", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'remove_array_element', title: 'Remove array element', description: scene_advanced_docs_1.SCENE_ADVANCED_DOCS.remove_array_element,
        inputSchema: schema_1.z.object({
            uuid: schema_1.z.string().describe('Node UUID that owns the array property.'),
            path: schema_1.z.string().describe('Array property path to edit.'),
            index: schema_1.z.number().describe('Array index to remove.'),
        }) })
], SceneAdvancedTools.prototype, "removeArrayElement", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'copy_node', title: 'Copy scene nodes', description: scene_advanced_docs_1.SCENE_ADVANCED_DOCS.copy_node,
        inputSchema: schema_1.z.object({
            uuids: stringOrStringArray.describe('Node UUID or UUID array to copy into the editor clipboard context.'),
        }) })
], SceneAdvancedTools.prototype, "copyNode", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'paste_node', title: 'Paste scene nodes', description: scene_advanced_docs_1.SCENE_ADVANCED_DOCS.paste_node,
        inputSchema: schema_1.z.object({
            target: schema_1.z.string().describe('Target parent node UUID for pasted nodes.'),
            uuids: stringOrStringArray.describe('Node UUID or UUID array returned/used by copy_node.'),
            keepWorldTransform: schema_1.z.boolean().default(false).describe('Preserve world transform while pasting/reparenting when Cocos supports it.'),
        }) })
], SceneAdvancedTools.prototype, "pasteNode", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'cut_node', title: 'Cut scene nodes', description: scene_advanced_docs_1.SCENE_ADVANCED_DOCS.cut_node,
        inputSchema: schema_1.z.object({
            uuids: stringOrStringArray.describe('Node UUID or UUID array to cut via editor scene channel.'),
        }) })
], SceneAdvancedTools.prototype, "cutNode", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'reset_node_transform', title: 'Reset node transform', description: scene_advanced_docs_1.SCENE_ADVANCED_DOCS.reset_node_transform,
        inputSchema: schema_1.z.object({
            uuid: schema_1.z.string().describe('Node UUID whose transform should be reset to default.'),
        }) })
], SceneAdvancedTools.prototype, "resetNodeTransform", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'reset_component', title: 'Reset component state', description: scene_advanced_docs_1.SCENE_ADVANCED_DOCS.reset_component,
        inputSchema: schema_1.z.object({
            uuid: schema_1.z.string().describe('Component UUID to reset to default values.'),
        }) })
], SceneAdvancedTools.prototype, "resetComponent", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'restore_prefab', title: 'Restore prefab instance', description: scene_advanced_docs_1.SCENE_ADVANCED_DOCS.restore_prefab,
        inputSchema: schema_1.z.object({
            nodeUuid: schema_1.z.string().describe('Prefab instance node UUID to restore.'),
            assetUuid: schema_1.z.string().describe('Prefab asset UUID kept for context; scene/restore-prefab uses nodeUuid only.'),
        }) })
], SceneAdvancedTools.prototype, "restorePrefab", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'execute_component_method', title: 'Invoke component method', description: scene_advanced_docs_1.SCENE_ADVANCED_DOCS.execute_component_method,
        inputSchema: schema_1.z.object({
            uuid: schema_1.z.string().describe('Component UUID whose editor-exposed method should be invoked.'),
            name: schema_1.z.string().describe('Method name to execute on the component.'),
            args: schema_1.z.array(schema_1.z.any()).default([]).describe('Positional method arguments.'),
        }) })
], SceneAdvancedTools.prototype, "executeComponentMethod", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'execute_scene_script', title: 'Run scene script', description: scene_advanced_docs_1.SCENE_ADVANCED_DOCS.execute_scene_script,
        inputSchema: schema_1.z.object({
            name: schema_1.z.string().describe('Scene script package/plugin name.'),
            method: schema_1.z.string().describe('Scene script method name to execute.'),
            args: schema_1.z.array(schema_1.z.any()).default([]).describe('Positional method arguments.'),
        }) })
], SceneAdvancedTools.prototype, "executeSceneScript", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'scene_snapshot', title: 'Create scene snapshot', description: scene_advanced_docs_1.SCENE_ADVANCED_DOCS.scene_snapshot,
        inputSchema: schema_1.z.object({}) })
], SceneAdvancedTools.prototype, "sceneSnapshot", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'scene_snapshot_abort', title: 'Abort scene snapshot', description: scene_advanced_docs_1.SCENE_ADVANCED_DOCS.scene_snapshot_abort,
        inputSchema: schema_1.z.object({}) })
], SceneAdvancedTools.prototype, "sceneSnapshotAbort", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'begin_undo_recording', title: 'Begin undo recording', description: scene_advanced_docs_1.SCENE_ADVANCED_DOCS.begin_undo_recording,
        inputSchema: schema_1.z.object({
            nodeUuid: schema_1.z.string().describe('Node UUID whose changes should be covered by the undo recording.'),
        }) })
], SceneAdvancedTools.prototype, "beginUndoRecording", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'end_undo_recording', title: 'Commit undo recording', description: scene_advanced_docs_1.SCENE_ADVANCED_DOCS.end_undo_recording,
        inputSchema: schema_1.z.object({
            undoId: schema_1.z.string().describe('Undo recording ID returned by begin_undo_recording.'),
        }) })
], SceneAdvancedTools.prototype, "endUndoRecording", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'cancel_undo_recording', title: 'Cancel undo recording', description: scene_advanced_docs_1.SCENE_ADVANCED_DOCS.cancel_undo_recording,
        inputSchema: schema_1.z.object({
            undoId: schema_1.z.string().describe('Undo recording ID to cancel without committing.'),
        }) })
], SceneAdvancedTools.prototype, "cancelUndoRecording", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'soft_reload_scene', title: 'Reload current scene', description: scene_advanced_docs_1.SCENE_ADVANCED_DOCS.soft_reload_scene,
        inputSchema: schema_1.z.object({}) })
], SceneAdvancedTools.prototype, "softReloadScene", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'query_scene_ready', title: 'Check scene readiness', description: scene_advanced_docs_1.SCENE_ADVANCED_DOCS.query_scene_ready,
        inputSchema: schema_1.z.object({}) })
], SceneAdvancedTools.prototype, "querySceneReady", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'query_scene_dirty', title: 'Check scene dirty state', description: scene_advanced_docs_1.SCENE_ADVANCED_DOCS.query_scene_dirty,
        inputSchema: schema_1.z.object({}) })
], SceneAdvancedTools.prototype, "querySceneDirty", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'query_scene_classes', title: 'List scene classes', description: scene_advanced_docs_1.SCENE_ADVANCED_DOCS.query_scene_classes,
        inputSchema: schema_1.z.object({
            extends: schema_1.z.string().optional().describe('Optional base class filter for scene/query-classes.'),
        }) })
], SceneAdvancedTools.prototype, "querySceneClasses", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'query_scene_components', title: 'List scene components', description: scene_advanced_docs_1.SCENE_ADVANCED_DOCS.query_scene_components,
        inputSchema: schema_1.z.object({}) })
], SceneAdvancedTools.prototype, "querySceneComponents", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'query_component_has_script', title: 'Check component script', description: scene_advanced_docs_1.SCENE_ADVANCED_DOCS.query_component_has_script,
        inputSchema: schema_1.z.object({
            className: schema_1.z.string().describe('Script class name to check through scene/query-component-has-script.'),
        }) })
], SceneAdvancedTools.prototype, "queryComponentHasScript", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'query_nodes_by_asset_uuid', title: 'Find nodes by asset', description: scene_advanced_docs_1.SCENE_ADVANCED_DOCS.query_nodes_by_asset_uuid,
        inputSchema: schema_1.z.object({
            assetUuid: schema_1.z.string().describe('Asset UUID to search for in scene nodes.'),
        }) })
], SceneAdvancedTools.prototype, "queryNodesByAssetUuid", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NlbmUtYWR2YW5jZWQtdG9vbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvdG9vbHMvc2NlbmUtYWR2YW5jZWQtdG9vbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7O0FBQUEsOENBQTJDO0FBRTNDLDBDQUFrQztBQUNsQyxrREFBdUU7QUFDdkUscUVBQWtFO0FBRWxFLGtFQUFrRTtBQUNsRSxNQUFNLG1CQUFtQixHQUFHLFVBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxVQUFDLENBQUMsTUFBTSxFQUFFLEVBQUUsVUFBQyxDQUFDLEtBQUssQ0FBQyxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFFdkUsTUFBYSxrQkFBa0I7SUFHM0I7UUFDSSxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUEsc0NBQXlCLEVBQUMsSUFBSSxDQUFDLENBQUM7SUFDaEQsQ0FBQztJQUVELFFBQVEsS0FBdUIsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUM3RCxPQUFPLENBQUMsUUFBZ0IsRUFBRSxJQUFTLElBQTJCLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztJQU9uRyxBQUFOLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxJQUFvQztRQUN4RCxPQUFPLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUM1RCxDQUFDO0lBU0ssQUFBTixLQUFLLENBQUMsZ0JBQWdCLENBQUMsSUFBb0U7UUFDdkYsT0FBTyxJQUFJLENBQUMsb0JBQW9CLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lB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UUFDOUgsV0FBVyxFQUFFLFVBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQzs4REFHL0I7QUFNSztJQUpMLElBQUEsb0JBQU8sRUFBQyxFQUFFLElBQUksRUFBRSw0QkFBNEIsRUFBRSxLQUFLLEVBQUUsd0JBQXdCLEVBQUUsV0FBVyxFQUFFLHlDQUFtQixDQUFDLDBCQUEwQjtRQUN2SSxXQUFXLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQztZQUNsQixTQUFTLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyxzRUFBc0UsQ0FBQztTQUN6RyxDQUFDLEVBQUUsQ0FBQztpRUFHUjtBQU1LO0lBSkwsSUFBQSxvQkFBTyxFQUFDLEVBQUUsSUFBSSxFQUFFLDJCQUEyQixFQUFFLEtBQUssRUFBRSxxQkFBcUIsRUFBRSxXQUFXLEVBQUUseUNBQW1CLENBQUMseUJBQXlCO1FBQ2xJLFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDO1lBQ2xCLFNBQVMsRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLDBDQUEwQyxDQUFDO1NBQzdFLENBQUMsRUFBRSxDQUFDOytEQUdSIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgb2ssIGZhaWwgfSBmcm9tICcuLi9saWIvcmVzcG9uc2UnO1xuaW1wb3J0IHR5cGUgeyBUb29sRGVmaW5pdGlvbiwgVG9vbFJlc3BvbnNlLCBUb29sRXhlY3V0b3IgfSBmcm9tICcuLi90eXBlcyc7XG5pbXBvcnQgeyB6IH0gZnJvbSAnLi4vbGliL3NjaGVtYSc7XG5pbXBvcnQgeyBtY3BUb29sLCBkZWZpbmVUb29sc0Zyb21EZWNvcmF0b3JzIH0gZnJvbSAnLi4vbGliL2RlY29yYXRvcnMnO1xuaW1wb3J0IHsgU0NFTkVfQURWQU5DRURfRE9DUyB9IGZyb20gJy4uL2RhdGEvc2NlbmUtYWR2YW5jZWQtZG9jcyc7XG5cbi8vIFNldmVyYWwgdG9vbHMgYWNjZXB0IGVpdGhlciBhIHNpbmdsZSBVVUlEIG9yIGFuIGFycmF5IG9mIFVVSURzLlxuY29uc3Qgc3RyaW5nT3JTdHJpbmdBcnJheSA9IHoudW5pb24oW3ouc3RyaW5nKCksIHouYXJyYXkoei5zdHJpbmcoKSldKTtcblxuZXhwb3J0IGNsYXNzIFNjZW5lQWR2YW5jZWRUb29scyBpbXBsZW1lbnRzIFRvb2xFeGVjdXRvciB7XG4gICAgcHJpdmF0ZSByZWFkb25seSBleGVjOiBUb29sRXhlY3V0b3I7XG5cbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgdGhpcy5leGVjID0gZGVmaW5lVG9vbHNGcm9tRGVjb3JhdG9ycyh0aGlzKTtcbiAgICB9XG5cbiAgICBnZXRUb29scygpOiBUb29sRGVmaW5pdGlvbltdIHsgcmV0dXJuIHRoaXMuZXhlYy5nZXRUb29scygpOyB9XG4gICAgZXhlY3V0ZSh0b29sTmFtZTogc3RyaW5nLCBhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4geyByZXR1cm4gdGhpcy5leGVjLmV4ZWN1dGUodG9vbE5hbWUsIGFyZ3MpOyB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdyZXNldF9ub2RlX3Byb3BlcnR5JywgdGl0bGU6ICdSZXNldCBub2RlIHByb3BlcnR5JywgZGVzY3JpcHRpb246IFNDRU5FX0FEVkFOQ0VEX0RPQ1MucmVzZXRfbm9kZV9wcm9wZXJ0eSxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIHV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ05vZGUgVVVJRCB3aG9zZSBwcm9wZXJ0eSBzaG91bGQgYmUgcmVzZXQuJyksXG4gICAgICAgICAgICBwYXRoOiB6LnN0cmluZygpLmRlc2NyaWJlKCdOb2RlIHByb3BlcnR5IHBhdGggdG8gcmVzZXQsIGUuZy4gcG9zaXRpb24sIHJvdGF0aW9uLCBzY2FsZSwgbGF5ZXIuJyksXG4gICAgICAgIH0pIH0pXG4gICAgYXN5bmMgcmVzZXROb2RlUHJvcGVydHkoYXJnczogeyB1dWlkOiBzdHJpbmc7IHBhdGg6IHN0cmluZyB9KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMucmVzZXROb2RlUHJvcGVydHlJbXBsKGFyZ3MudXVpZCwgYXJncy5wYXRoKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdtb3ZlX2FycmF5X2VsZW1lbnQnLCB0aXRsZTogJ01vdmUgYXJyYXkgZWxlbWVudCcsIGRlc2NyaXB0aW9uOiBTQ0VORV9BRFZBTkNFRF9ET0NTLm1vdmVfYXJyYXlfZWxlbWVudCxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIHV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ05vZGUgVVVJRCB0aGF0IG93bnMgdGhlIGFycmF5IHByb3BlcnR5LicpLFxuICAgICAgICAgICAgcGF0aDogei5zdHJpbmcoKS5kZXNjcmliZSgnQXJyYXkgcHJvcGVydHkgcGF0aCwgZS5nLiBfX2NvbXBzX18uJyksXG4gICAgICAgICAgICB0YXJnZXQ6IHoubnVtYmVyKCkuZGVzY3JpYmUoJ09yaWdpbmFsIGluZGV4IG9mIHRoZSBhcnJheSBpdGVtIHRvIG1vdmUuJyksXG4gICAgICAgICAgICBvZmZzZXQ6IHoubnVtYmVyKCkuZGVzY3JpYmUoJ1JlbGF0aXZlIG1vdmUgb2Zmc2V0OyBwb3NpdGl2ZSBtb3ZlcyBsYXRlciwgbmVnYXRpdmUgbW92ZXMgZWFybGllci4nKSxcbiAgICAgICAgfSkgfSlcbiAgICBhc3luYyBtb3ZlQXJyYXlFbGVtZW50KGFyZ3M6IHsgdXVpZDogc3RyaW5nOyBwYXRoOiBzdHJpbmc7IHRhcmdldDogbnVtYmVyOyBvZmZzZXQ6IG51bWJlciB9KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMubW92ZUFycmF5RWxlbWVudEltcGwoYXJncy51dWlkLCBhcmdzLnBhdGgsIGFyZ3MudGFyZ2V0LCBhcmdzLm9mZnNldCk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woeyBuYW1lOiAncmVtb3ZlX2FycmF5X2VsZW1lbnQnLCB0aXRsZTogJ1JlbW92ZSBhcnJheSBlbGVtZW50JywgZGVzY3JpcHRpb246IFNDRU5FX0FEVkFOQ0VEX0RPQ1MucmVtb3ZlX2FycmF5X2VsZW1lbnQsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICB1dWlkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdOb2RlIFVVSUQgdGhhdCBvd25zIHRoZSBhcnJheSBwcm9wZXJ0eS4nKSxcbiAgICAgICAgICAgIHBhdGg6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0FycmF5IHByb3BlcnR5IHBhdGggdG8gZWRpdC4nKSxcbiAgICAgICAgICAgIGluZGV4OiB6Lm51bWJlcigpLmRlc2NyaWJlKCdBcnJheSBpbmRleCB0byByZW1vdmUuJyksXG4gICAgICAgIH0pIH0pXG4gICAgYXN5bmMgcmVtb3ZlQXJyYXlFbGVtZW50KGFyZ3M6IHsgdXVpZDogc3RyaW5nOyBwYXRoOiBzdHJpbmc7IGluZGV4OiBudW1iZXIgfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLnJlbW92ZUFycmF5RWxlbWVudEltcGwoYXJncy51dWlkLCBhcmdzLnBhdGgsIGFyZ3MuaW5kZXgpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHsgbmFtZTogJ2NvcHlfbm9kZScsIHRpdGxlOiAnQ29weSBzY2VuZSBub2RlcycsIGRlc2NyaXB0aW9uOiBTQ0VORV9BRFZBTkNFRF9ET0NTLmNvcHlfbm9kZSxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIHV1aWRzOiBzdHJpbmdPclN0cmluZ0FycmF5LmRlc2NyaWJlKCdOb2RlIFVVSUQgb3IgVVVJRCBhcnJheSB0byBjb3B5IGludG8gdGhlIGVkaXRvciBjbGlwYm9hcmQgY29udGV4dC4nKSxcbiAgICAgICAgfSkgfSlcbiAgICBhc3luYyBjb3B5Tm9kZShhcmdzOiB7IHV1aWRzOiBzdHJpbmcgfCBzdHJpbmdbXSB9KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY29weU5vZGVJbXBsKGFyZ3MudXVpZHMpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHsgbmFtZTogJ3Bhc3RlX25vZGUnLCB0aXRsZTogJ1Bhc3RlIHNjZW5lIG5vZGVzJywgZGVzY3JpcHRpb246IFNDRU5FX0FEVkFOQ0VEX0RPQ1MucGFzdGVfbm9kZSxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIHRhcmdldDogei5zdHJpbmcoKS5kZXNjcmliZSgnVGFyZ2V0IHBhcmVudCBub2RlIFVVSUQgZm9yIHBhc3RlZCBub2Rlcy4nKSxcbiAgICAgICAgICAgIHV1aWRzOiBzdHJpbmdPclN0cmluZ0FycmF5LmRlc2NyaWJlKCdOb2RlIFVVSUQgb3IgVVVJRCBhcnJheSByZXR1cm5lZC91c2VkIGJ5IGNvcHlfbm9kZS4nKSxcbiAgICAgICAgICAgIGtlZXBXb3JsZFRyYW5zZm9ybTogei5ib29sZWFuKCkuZGVmYXVsdChmYWxzZSkuZGVzY3JpYmUoJ1ByZXNlcnZlIHdvcmxkIHRyYW5zZm9ybSB3aGlsZSBwYXN0aW5nL3JlcGFyZW50aW5nIHdoZW4gQ29jb3Mgc3VwcG9ydHMgaXQuJyksXG4gICAgICAgIH0pIH0pXG4gICAgYXN5bmMgcGFzdGVOb2RlKGFyZ3M6IHsgdGFyZ2V0OiBzdHJpbmc7IHV1aWRzOiBzdHJpbmcgfCBzdHJpbmdbXTsga2VlcFdvcmxkVHJhbnNmb3JtPzogYm9vbGVhbiB9KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMucGFzdGVOb2RlSW1wbChhcmdzLnRhcmdldCwgYXJncy51dWlkcywgYXJncy5rZWVwV29ybGRUcmFuc2Zvcm0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHsgbmFtZTogJ2N1dF9ub2RlJywgdGl0bGU6ICdDdXQgc2NlbmUgbm9kZXMnLCBkZXNjcmlwdGlvbjogU0NFTkVfQURWQU5DRURfRE9DUy5jdXRfbm9kZSxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIHV1aWRzOiBzdHJpbmdPclN0cmluZ0FycmF5LmRlc2NyaWJlKCdOb2RlIFVVSUQgb3IgVVVJRCBhcnJheSB0byBjdXQgdmlhIGVkaXRvciBzY2VuZSBjaGFubmVsLicpLFxuICAgICAgICB9KSB9KVxuICAgIGFzeW5jIGN1dE5vZGUoYXJnczogeyB1dWlkczogc3RyaW5nIHwgc3RyaW5nW10gfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLmN1dE5vZGVJbXBsKGFyZ3MudXVpZHMpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHsgbmFtZTogJ3Jlc2V0X25vZGVfdHJhbnNmb3JtJywgdGl0bGU6ICdSZXNldCBub2RlIHRyYW5zZm9ybScsIGRlc2NyaXB0aW9uOiBTQ0VORV9BRFZBTkNFRF9ET0NTLnJlc2V0X25vZGVfdHJhbnNmb3JtLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgdXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnTm9kZSBVVUlEIHdob3NlIHRyYW5zZm9ybSBzaG91bGQgYmUgcmVzZXQgdG8gZGVmYXVsdC4nKSxcbiAgICAgICAgfSkgfSlcbiAgICBhc3luYyByZXNldE5vZGVUcmFuc2Zvcm0oYXJnczogeyB1dWlkOiBzdHJpbmcgfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLnJlc2V0Tm9kZVRyYW5zZm9ybUltcGwoYXJncy51dWlkKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdyZXNldF9jb21wb25lbnQnLCB0aXRsZTogJ1Jlc2V0IGNvbXBvbmVudCBzdGF0ZScsIGRlc2NyaXB0aW9uOiBTQ0VORV9BRFZBTkNFRF9ET0NTLnJlc2V0X2NvbXBvbmVudCxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIHV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0NvbXBvbmVudCBVVUlEIHRvIHJlc2V0IHRvIGRlZmF1bHQgdmFsdWVzLicpLFxuICAgICAgICB9KSB9KVxuICAgIGFzeW5jIHJlc2V0Q29tcG9uZW50KGFyZ3M6IHsgdXVpZDogc3RyaW5nIH0pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5yZXNldENvbXBvbmVudEltcGwoYXJncy51dWlkKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdyZXN0b3JlX3ByZWZhYicsIHRpdGxlOiAnUmVzdG9yZSBwcmVmYWIgaW5zdGFuY2UnLCBkZXNjcmlwdGlvbjogU0NFTkVfQURWQU5DRURfRE9DUy5yZXN0b3JlX3ByZWZhYixcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIG5vZGVVdWlkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdQcmVmYWIgaW5zdGFuY2Ugbm9kZSBVVUlEIHRvIHJlc3RvcmUuJyksXG4gICAgICAgICAgICBhc3NldFV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1ByZWZhYiBhc3NldCBVVUlEIGtlcHQgZm9yIGNvbnRleHQ7IHNjZW5lL3Jlc3RvcmUtcHJlZmFiIHVzZXMgbm9kZVV1aWQgb25seS4nKSxcbiAgICAgICAgfSkgfSlcbiAgICBhc3luYyByZXN0b3JlUHJlZmFiKGFyZ3M6IHsgbm9kZVV1aWQ6IHN0cmluZzsgYXNzZXRVdWlkOiBzdHJpbmcgfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLnJlc3RvcmVQcmVmYWJJbXBsKGFyZ3Mubm9kZVV1aWQsIGFyZ3MuYXNzZXRVdWlkKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdleGVjdXRlX2NvbXBvbmVudF9tZXRob2QnLCB0aXRsZTogJ0ludm9rZSBjb21wb25lbnQgbWV0aG9kJywgZGVzY3JpcHRpb246IFNDRU5FX0FEVkFOQ0VEX0RPQ1MuZXhlY3V0ZV9jb21wb25lbnRfbWV0aG9kLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgdXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnQ29tcG9uZW50IFVVSUQgd2hvc2UgZWRpdG9yLWV4cG9zZWQgbWV0aG9kIHNob3VsZCBiZSBpbnZva2VkLicpLFxuICAgICAgICAgICAgbmFtZTogei5zdHJpbmcoKS5kZXNjcmliZSgnTWV0aG9kIG5hbWUgdG8gZXhlY3V0ZSBvbiB0aGUgY29tcG9uZW50LicpLFxuICAgICAgICAgICAgYXJnczogei5hcnJheSh6LmFueSgpKS5kZWZhdWx0KFtdKS5kZXNjcmliZSgnUG9zaXRpb25hbCBtZXRob2QgYXJndW1lbnRzLicpLFxuICAgICAgICB9KSB9KVxuICAgIGFzeW5jIGV4ZWN1dGVDb21wb25lbnRNZXRob2QoYXJnczogeyB1dWlkOiBzdHJpbmc7IG5hbWU6IHN0cmluZzsgYXJncz86IGFueVtdIH0pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5leGVjdXRlQ29tcG9uZW50TWV0aG9kSW1wbChhcmdzLnV1aWQsIGFyZ3MubmFtZSwgYXJncy5hcmdzKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdleGVjdXRlX3NjZW5lX3NjcmlwdCcsIHRpdGxlOiAnUnVuIHNjZW5lIHNjcmlwdCcsIGRlc2NyaXB0aW9uOiBTQ0VORV9BRFZBTkNFRF9ET0NTLmV4ZWN1dGVfc2NlbmVfc2NyaXB0LFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgbmFtZTogei5zdHJpbmcoKS5kZXNjcmliZSgnU2NlbmUgc2NyaXB0IHBhY2thZ2UvcGx1Z2luIG5hbWUuJyksXG4gICAgICAgICAgICBtZXRob2Q6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1NjZW5lIHNjcmlwdCBtZXRob2QgbmFtZSB0byBleGVjdXRlLicpLFxuICAgICAgICAgICAgYXJnczogei5hcnJheSh6LmFueSgpKS5kZWZhdWx0KFtdKS5kZXNjcmliZSgnUG9zaXRpb25hbCBtZXRob2QgYXJndW1lbnRzLicpLFxuICAgICAgICB9KSB9KVxuICAgIGFzeW5jIGV4ZWN1dGVTY2VuZVNjcmlwdChhcmdzOiB7IG5hbWU6IHN0cmluZzsgbWV0aG9kOiBzdHJpbmc7IGFyZ3M/OiBhbnlbXSB9KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZXhlY3V0ZVNjZW5lU2NyaXB0SW1wbChhcmdzLm5hbWUsIGFyZ3MubWV0aG9kLCBhcmdzLmFyZ3MpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHsgbmFtZTogJ3NjZW5lX3NuYXBzaG90JywgdGl0bGU6ICdDcmVhdGUgc2NlbmUgc25hcHNob3QnLCBkZXNjcmlwdGlvbjogU0NFTkVfQURWQU5DRURfRE9DUy5zY2VuZV9zbmFwc2hvdCxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSB9KVxuICAgIGFzeW5jIHNjZW5lU25hcHNob3QoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2NlbmVTbmFwc2hvdEltcGwoKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdzY2VuZV9zbmFwc2hvdF9hYm9ydCcsIHRpdGxlOiAnQWJvcnQgc2NlbmUgc25hcHNob3QnLCBkZXNjcmlwdGlvbjogU0NFTkVfQURWQU5DRURfRE9DUy5zY2VuZV9zbmFwc2hvdF9hYm9ydCxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSB9KVxuICAgIGFzeW5jIHNjZW5lU25hcHNob3RBYm9ydCgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5zY2VuZVNuYXBzaG90QWJvcnRJbXBsKCk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woeyBuYW1lOiAnYmVnaW5fdW5kb19yZWNvcmRpbmcnLCB0aXRsZTogJ0JlZ2luIHVuZG8gcmVjb3JkaW5nJywgZGVzY3JpcHRpb246IFNDRU5FX0FEVkFOQ0VEX0RPQ1MuYmVnaW5fdW5kb19yZWNvcmRpbmcsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICBub2RlVXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnTm9kZSBVVUlEIHdob3NlIGNoYW5nZXMgc2hvdWxkIGJlIGNvdmVyZWQgYnkgdGhlIHVuZG8gcmVjb3JkaW5nLicpLFxuICAgICAgICB9KSB9KVxuICAgIGFzeW5jIGJlZ2luVW5kb1JlY29yZGluZyhhcmdzOiB7IG5vZGVVdWlkOiBzdHJpbmcgfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLmJlZ2luVW5kb1JlY29yZGluZ0ltcGwoYXJncy5ub2RlVXVpZCk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woeyBuYW1lOiAnZW5kX3VuZG9fcmVjb3JkaW5nJywgdGl0bGU6ICdDb21taXQgdW5kbyByZWNvcmRpbmcnLCBkZXNjcmlwdGlvbjogU0NFTkVfQURWQU5DRURfRE9DUy5lbmRfdW5kb19yZWNvcmRpbmcsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICB1bmRvSWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1VuZG8gcmVjb3JkaW5nIElEIHJldHVybmVkIGJ5IGJlZ2luX3VuZG9fcmVjb3JkaW5nLicpLFxuICAgICAgICB9KSB9KVxuICAgIGFzeW5jIGVuZFVuZG9SZWNvcmRpbmcoYXJnczogeyB1bmRvSWQ6IHN0cmluZyB9KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZW5kVW5kb1JlY29yZGluZ0ltcGwoYXJncy51bmRvSWQpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHsgbmFtZTogJ2NhbmNlbF91bmRvX3JlY29yZGluZycsIHRpdGxlOiAnQ2FuY2VsIHVuZG8gcmVjb3JkaW5nJywgZGVzY3JpcHRpb246IFNDRU5FX0FEVkFOQ0VEX0RPQ1MuY2FuY2VsX3VuZG9fcmVjb3JkaW5nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgdW5kb0lkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdVbmRvIHJlY29yZGluZyBJRCB0byBjYW5jZWwgd2l0aG91dCBjb21taXR0aW5nLicpLFxuICAgICAgICB9KSB9KVxuICAgIGFzeW5jIGNhbmNlbFVuZG9SZWNvcmRpbmcoYXJnczogeyB1bmRvSWQ6IHN0cmluZyB9KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY2FuY2VsVW5kb1JlY29yZGluZ0ltcGwoYXJncy51bmRvSWQpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHsgbmFtZTogJ3NvZnRfcmVsb2FkX3NjZW5lJywgdGl0bGU6ICdSZWxvYWQgY3VycmVudCBzY2VuZScsIGRlc2NyaXB0aW9uOiBTQ0VORV9BRFZBTkNFRF9ET0NTLnNvZnRfcmVsb2FkX3NjZW5lLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pIH0pXG4gICAgYXN5bmMgc29mdFJlbG9hZFNjZW5lKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLnNvZnRSZWxvYWRTY2VuZUltcGwoKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdxdWVyeV9zY2VuZV9yZWFkeScsIHRpdGxlOiAnQ2hlY2sgc2NlbmUgcmVhZGluZXNzJywgZGVzY3JpcHRpb246IFNDRU5FX0FEVkFOQ0VEX0RPQ1MucXVlcnlfc2NlbmVfcmVhZHksXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSkgfSlcbiAgICBhc3luYyBxdWVyeVNjZW5lUmVhZHkoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMucXVlcnlTY2VuZVJlYWR5SW1wbCgpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHsgbmFtZTogJ3F1ZXJ5X3NjZW5lX2RpcnR5JywgdGl0bGU6ICdDaGVjayBzY2VuZSBkaXJ0eSBzdGF0ZScsIGRlc2NyaXB0aW9uOiBTQ0VORV9BRFZBTkNFRF9ET0NTLnF1ZXJ5X3NjZW5lX2RpcnR5LFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pIH0pXG4gICAgYXN5bmMgcXVlcnlTY2VuZURpcnR5KCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLnF1ZXJ5U2NlbmVEaXJ0eUltcGwoKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdxdWVyeV9zY2VuZV9jbGFzc2VzJywgdGl0bGU6ICdMaXN0IHNjZW5lIGNsYXNzZXMnLCBkZXNjcmlwdGlvbjogU0NFTkVfQURWQU5DRURfRE9DUy5xdWVyeV9zY2VuZV9jbGFzc2VzLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgZXh0ZW5kczogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdPcHRpb25hbCBiYXNlIGNsYXNzIGZpbHRlciBmb3Igc2NlbmUvcXVlcnktY2xhc3Nlcy4nKSxcbiAgICAgICAgfSkgfSlcbiAgICBhc3luYyBxdWVyeVNjZW5lQ2xhc3NlcyhhcmdzOiB7IGV4dGVuZHM/OiBzdHJpbmcgfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLnF1ZXJ5U2NlbmVDbGFzc2VzSW1wbChhcmdzLmV4dGVuZHMpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHsgbmFtZTogJ3F1ZXJ5X3NjZW5lX2NvbXBvbmVudHMnLCB0aXRsZTogJ0xpc3Qgc2NlbmUgY29tcG9uZW50cycsIGRlc2NyaXB0aW9uOiBTQ0VORV9BRFZBTkNFRF9ET0NTLnF1ZXJ5X3NjZW5lX2NvbXBvbmVudHMsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSkgfSlcbiAgICBhc3luYyBxdWVyeVNjZW5lQ29tcG9uZW50cygpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5xdWVyeVNjZW5lQ29tcG9uZW50c0ltcGwoKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdxdWVyeV9jb21wb25lbnRfaGFzX3NjcmlwdCcsIHRpdGxlOiAnQ2hlY2sgY29tcG9uZW50IHNjcmlwdCcsIGRlc2NyaXB0aW9uOiBTQ0VORV9BRFZBTkNFRF9ET0NTLnF1ZXJ5X2NvbXBvbmVudF9oYXNfc2NyaXB0LFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgY2xhc3NOYW1lOiB6LnN0cmluZygpLmRlc2NyaWJlKCdTY3JpcHQgY2xhc3MgbmFtZSB0byBjaGVjayB0aHJvdWdoIHNjZW5lL3F1ZXJ5LWNvbXBvbmVudC1oYXMtc2NyaXB0LicpLFxuICAgICAgICB9KSB9KVxuICAgIGFzeW5jIHF1ZXJ5Q29tcG9uZW50SGFzU2NyaXB0KGFyZ3M6IHsgY2xhc3NOYW1lOiBzdHJpbmcgfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLnF1ZXJ5Q29tcG9uZW50SGFzU2NyaXB0SW1wbChhcmdzLmNsYXNzTmFtZSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woeyBuYW1lOiAncXVlcnlfbm9kZXNfYnlfYXNzZXRfdXVpZCcsIHRpdGxlOiAnRmluZCBub2RlcyBieSBhc3NldCcsIGRlc2NyaXB0aW9uOiBTQ0VORV9BRFZBTkNFRF9ET0NTLnF1ZXJ5X25vZGVzX2J5X2Fzc2V0X3V1aWQsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICBhc3NldFV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0Fzc2V0IFVVSUQgdG8gc2VhcmNoIGZvciBpbiBzY2VuZSBub2Rlcy4nKSxcbiAgICAgICAgfSkgfSlcbiAgICBhc3luYyBxdWVyeU5vZGVzQnlBc3NldFV1aWQoYXJnczogeyBhc3NldFV1aWQ6IHN0cmluZyB9KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMucXVlcnlOb2Rlc0J5QXNzZXRVdWlkSW1wbChhcmdzLmFzc2V0VXVpZCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyByZXNldE5vZGVQcm9wZXJ0eUltcGwodXVpZDogc3RyaW5nLCBwYXRoOiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3Jlc2V0LXByb3BlcnR5JywgeyBcbiAgICAgICAgICAgICAgICB1dWlkLCBcbiAgICAgICAgICAgICAgICBwYXRoLCBcbiAgICAgICAgICAgICAgICBkdW1wOiB7IHZhbHVlOiBudWxsIH0gXG4gICAgICAgICAgICB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHVuZGVmaW5lZCwgYFByb3BlcnR5ICcke3BhdGh9JyByZXNldCB0byBkZWZhdWx0IHZhbHVlYCkpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIG1vdmVBcnJheUVsZW1lbnRJbXBsKHV1aWQ6IHN0cmluZywgcGF0aDogc3RyaW5nLCB0YXJnZXQ6IG51bWJlciwgb2Zmc2V0OiBudW1iZXIpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ21vdmUtYXJyYXktZWxlbWVudCcsIHtcbiAgICAgICAgICAgICAgICB1dWlkLFxuICAgICAgICAgICAgICAgIHBhdGgsXG4gICAgICAgICAgICAgICAgdGFyZ2V0LFxuICAgICAgICAgICAgICAgIG9mZnNldFxuICAgICAgICAgICAgfSkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh1bmRlZmluZWQsIGBBcnJheSBlbGVtZW50IGF0IGluZGV4ICR7dGFyZ2V0fSBtb3ZlZCBieSAke29mZnNldH1gKSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgcmVtb3ZlQXJyYXlFbGVtZW50SW1wbCh1dWlkOiBzdHJpbmcsIHBhdGg6IHN0cmluZywgaW5kZXg6IG51bWJlcik6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncmVtb3ZlLWFycmF5LWVsZW1lbnQnLCB7XG4gICAgICAgICAgICAgICAgdXVpZCxcbiAgICAgICAgICAgICAgICBwYXRoLFxuICAgICAgICAgICAgICAgIGluZGV4XG4gICAgICAgICAgICB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHVuZGVmaW5lZCwgYEFycmF5IGVsZW1lbnQgYXQgaW5kZXggJHtpbmRleH0gcmVtb3ZlZGApKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBjb3B5Tm9kZUltcGwodXVpZHM6IHN0cmluZyB8IHN0cmluZ1tdKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdjb3B5LW5vZGUnLCB1dWlkcykudGhlbigocmVzdWx0OiBzdHJpbmcgfCBzdHJpbmdbXSkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgY29waWVkVXVpZHM6IHJlc3VsdCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdOb2RlKHMpIGNvcGllZCBzdWNjZXNzZnVsbHknXG4gICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBwYXN0ZU5vZGVJbXBsKHRhcmdldDogc3RyaW5nLCB1dWlkczogc3RyaW5nIHwgc3RyaW5nW10sIGtlZXBXb3JsZFRyYW5zZm9ybTogYm9vbGVhbiA9IGZhbHNlKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdwYXN0ZS1ub2RlJywge1xuICAgICAgICAgICAgICAgIHRhcmdldCxcbiAgICAgICAgICAgICAgICB1dWlkcyxcbiAgICAgICAgICAgICAgICBrZWVwV29ybGRUcmFuc2Zvcm1cbiAgICAgICAgICAgIH0pLnRoZW4oKHJlc3VsdDogc3RyaW5nIHwgc3RyaW5nW10pID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG5ld1V1aWRzOiByZXN1bHQsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiAnTm9kZShzKSBwYXN0ZWQgc3VjY2Vzc2Z1bGx5J1xuICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgY3V0Tm9kZUltcGwodXVpZHM6IHN0cmluZyB8IHN0cmluZ1tdKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdjdXQtbm9kZScsIHV1aWRzKS50aGVuKChyZXN1bHQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgY3V0VXVpZHM6IHJlc3VsdCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdOb2RlKHMpIGN1dCBzdWNjZXNzZnVsbHknXG4gICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyByZXNldE5vZGVUcmFuc2Zvcm1JbXBsKHV1aWQ6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncmVzZXQtbm9kZScsIHsgdXVpZCB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHVuZGVmaW5lZCwgJ05vZGUgdHJhbnNmb3JtIHJlc2V0IHRvIGRlZmF1bHQnKSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgcmVzZXRDb21wb25lbnRJbXBsKHV1aWQ6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncmVzZXQtY29tcG9uZW50JywgeyB1dWlkIH0pLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2sodW5kZWZpbmVkLCAnQ29tcG9uZW50IHJlc2V0IHRvIGRlZmF1bHQgdmFsdWVzJykpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHJlc3RvcmVQcmVmYWJJbXBsKG5vZGVVdWlkOiBzdHJpbmcsIGFzc2V0VXVpZDogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgLy8gc2NlbmUvcmVzdG9yZS1wcmVmYWIgdGFrZXMgUmVzZXRDb21wb25lbnRPcHRpb25zID0geyB1dWlkOiBzdHJpbmcgfVxuICAgICAgICAvLyBwZXIgQGNvY29zL2NyZWF0b3ItdHlwZXMuIGFzc2V0VXVpZCBpcyBrZXB0IG9uIHRoZSBwdWJsaWMgc2NoZW1hIGZvclxuICAgICAgICAvLyByZXNwb25zZSBjb250ZXh0IGJ1dCBkb2VzIG5vdCBmbG93IGludG8gdGhlIGVkaXRvciBtZXNzYWdlIOKAlCBwYXNzaW5nXG4gICAgICAgIC8vIGV4dHJhIHBvc2l0aW9uYWwgYXJncyBpcyBzaWxlbnRseSBkcm9wcGVkIGJ5IEVkaXRvci5NZXNzYWdlLlxuICAgICAgICB2b2lkIGFzc2V0VXVpZDtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdyZXN0b3JlLXByZWZhYicsIHsgdXVpZDogbm9kZVV1aWQgfSkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh1bmRlZmluZWQsICdQcmVmYWIgcmVzdG9yZWQgc3VjY2Vzc2Z1bGx5JykpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGV4ZWN1dGVDb21wb25lbnRNZXRob2RJbXBsKHV1aWQ6IHN0cmluZywgbmFtZTogc3RyaW5nLCBhcmdzOiBhbnlbXSA9IFtdKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdleGVjdXRlLWNvbXBvbmVudC1tZXRob2QnLCB7XG4gICAgICAgICAgICAgICAgdXVpZCxcbiAgICAgICAgICAgICAgICBuYW1lLFxuICAgICAgICAgICAgICAgIGFyZ3NcbiAgICAgICAgICAgIH0pLnRoZW4oKHJlc3VsdDogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQ6IHJlc3VsdCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBNZXRob2QgJyR7bmFtZX0nIGV4ZWN1dGVkIHN1Y2Nlc3NmdWxseWBcbiAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGV4ZWN1dGVTY2VuZVNjcmlwdEltcGwobmFtZTogc3RyaW5nLCBtZXRob2Q6IHN0cmluZywgYXJnczogYW55W10gPSBbXSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnZXhlY3V0ZS1zY2VuZS1zY3JpcHQnLCB7XG4gICAgICAgICAgICAgICAgbmFtZSxcbiAgICAgICAgICAgICAgICBtZXRob2QsXG4gICAgICAgICAgICAgICAgYXJnc1xuICAgICAgICAgICAgfSkudGhlbigocmVzdWx0OiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHJlc3VsdCkpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHNjZW5lU25hcHNob3RJbXBsKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnc25hcHNob3QnKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHVuZGVmaW5lZCwgJ1NjZW5lIHNuYXBzaG90IGNyZWF0ZWQnKSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgc2NlbmVTbmFwc2hvdEFib3J0SW1wbCgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3NuYXBzaG90LWFib3J0JykudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh1bmRlZmluZWQsICdTY2VuZSBzbmFwc2hvdCBhYm9ydGVkJykpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGJlZ2luVW5kb1JlY29yZGluZ0ltcGwobm9kZVV1aWQ6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnYmVnaW4tcmVjb3JkaW5nJywgbm9kZVV1aWQpLnRoZW4oKHVuZG9JZDogc3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICB1bmRvSWQ6IHVuZG9JZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdVbmRvIHJlY29yZGluZyBzdGFydGVkJ1xuICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZW5kVW5kb1JlY29yZGluZ0ltcGwodW5kb0lkOiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ2VuZC1yZWNvcmRpbmcnLCB1bmRvSWQpLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2sodW5kZWZpbmVkLCAnVW5kbyByZWNvcmRpbmcgZW5kZWQnKSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgY2FuY2VsVW5kb1JlY29yZGluZ0ltcGwodW5kb0lkOiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ2NhbmNlbC1yZWNvcmRpbmcnLCB1bmRvSWQpLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2sodW5kZWZpbmVkLCAnVW5kbyByZWNvcmRpbmcgY2FuY2VsbGVkJykpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHNvZnRSZWxvYWRTY2VuZUltcGwoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdzb2Z0LXJlbG9hZCcpLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2sodW5kZWZpbmVkLCAnU2NlbmUgc29mdCByZWxvYWRlZCBzdWNjZXNzZnVsbHknKSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgcXVlcnlTY2VuZVJlYWR5SW1wbCgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LWlzLXJlYWR5JykudGhlbigocmVhZHk6IGJvb2xlYW4pID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlYWR5OiByZWFkeSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IHJlYWR5ID8gJ1NjZW5lIGlzIHJlYWR5JyA6ICdTY2VuZSBpcyBub3QgcmVhZHknXG4gICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBxdWVyeVNjZW5lRGlydHlJbXBsKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktZGlydHknKS50aGVuKChkaXJ0eTogYm9vbGVhbikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgZGlydHk6IGRpcnR5LFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogZGlydHkgPyAnU2NlbmUgaGFzIHVuc2F2ZWQgY2hhbmdlcycgOiAnU2NlbmUgaXMgY2xlYW4nXG4gICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBxdWVyeVNjZW5lQ2xhc3Nlc0ltcGwoZXh0ZW5kc0NsYXNzPzogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBvcHRpb25zOiBhbnkgPSB7fTtcbiAgICAgICAgICAgIGlmIChleHRlbmRzQ2xhc3MpIHtcbiAgICAgICAgICAgICAgICBvcHRpb25zLmV4dGVuZHMgPSBleHRlbmRzQ2xhc3M7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LWNsYXNzZXMnLCBvcHRpb25zKS50aGVuKChjbGFzc2VzOiBhbnlbXSkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgY2xhc3NlczogY2xhc3NlcyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvdW50OiBjbGFzc2VzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGV4dGVuZHNGaWx0ZXI6IGV4dGVuZHNDbGFzc1xuICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgcXVlcnlTY2VuZUNvbXBvbmVudHNJbXBsKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktY29tcG9uZW50cycpLnRoZW4oKGNvbXBvbmVudHM6IGFueVtdKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRzOiBjb21wb25lbnRzLFxuICAgICAgICAgICAgICAgICAgICAgICAgY291bnQ6IGNvbXBvbmVudHMubGVuZ3RoXG4gICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBxdWVyeUNvbXBvbmVudEhhc1NjcmlwdEltcGwoY2xhc3NOYW1lOiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LWNvbXBvbmVudC1oYXMtc2NyaXB0JywgY2xhc3NOYW1lKS50aGVuKChoYXNTY3JpcHQ6IGJvb2xlYW4pID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZTogY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgaGFzU2NyaXB0OiBoYXNTY3JpcHQsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBoYXNTY3JpcHQgPyBgQ29tcG9uZW50ICcke2NsYXNzTmFtZX0nIGhhcyBzY3JpcHRgIDogYENvbXBvbmVudCAnJHtjbGFzc05hbWV9JyBkb2VzIG5vdCBoYXZlIHNjcmlwdGBcbiAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHF1ZXJ5Tm9kZXNCeUFzc2V0VXVpZEltcGwoYXNzZXRVdWlkOiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LW5vZGVzLWJ5LWFzc2V0LXV1aWQnLCBhc3NldFV1aWQpLnRoZW4oKG5vZGVVdWlkczogc3RyaW5nW10pID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFzc2V0VXVpZDogYXNzZXRVdWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWRzOiBub2RlVXVpZHMsXG4gICAgICAgICAgICAgICAgICAgICAgICBjb3VudDogbm9kZVV1aWRzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBGb3VuZCAke25vZGVVdWlkcy5sZW5ndGh9IG5vZGVzIHVzaW5nIGFzc2V0YFxuICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cbn1cbiJdfQ==