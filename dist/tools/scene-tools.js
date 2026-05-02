"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SceneTools = void 0;
const response_1 = require("../lib/response");
const schema_1 = require("../lib/schema");
const decorators_1 = require("../lib/decorators");
const scene_bridge_1 = require("../lib/scene-bridge");
const component_tools_1 = require("./component-tools");
const log_1 = require("../lib/log");
const scene_docs_1 = require("../data/scene-docs");
const LAYER_UI_2D = 33554432;
class SceneTools {
    constructor() {
        this.componentTools = new component_tools_1.ComponentTools();
        this.exec = (0, decorators_1.defineToolsFromDecorators)(this);
    }
    getTools() { return this.exec.getTools(); }
    execute(toolName, args) { return this.exec.execute(toolName, args); }
    async getCurrentScene() {
        return this.getCurrentSceneImpl();
    }
    async getSceneList() {
        return this.getSceneListImpl();
    }
    async openScene(args) {
        return this.openSceneImpl(args.scenePath);
    }
    async saveScene() {
        return this.saveSceneImpl();
    }
    async createScene(args) {
        return this.createSceneImpl(args.sceneName, args.savePath, args.template);
    }
    async saveSceneAs(args) {
        return this.saveSceneAsImpl(args);
    }
    async closeScene() {
        return this.closeSceneImpl();
    }
    async getSceneHierarchy(args) {
        return this.getSceneHierarchyImpl(args.includeComponents);
    }
    async getCurrentSceneImpl() {
        return new Promise((resolve) => {
            // 直接使用 query-node-tree 來獲取場景信息（這個方法已經驗證可用）
            Editor.Message.request('scene', 'query-node-tree').then((tree) => {
                if (tree && tree.uuid) {
                    resolve((0, response_1.ok)({
                        name: tree.name || 'Current Scene',
                        uuid: tree.uuid,
                        type: tree.type || 'cc.Scene',
                        active: tree.active !== undefined ? tree.active : true,
                        nodeCount: tree.children ? tree.children.length : 0
                    }));
                }
                else {
                    resolve((0, response_1.fail)('No scene data available'));
                }
            }).catch((err) => {
                // 備用方案：使用場景腳本
                (0, scene_bridge_1.runSceneMethod)('getCurrentSceneInfo', []).then((result) => {
                    resolve(result);
                }).catch((err2) => {
                    resolve((0, response_1.fail)(`Direct API failed: ${err.message}, Scene script failed: ${err2.message}`));
                });
            });
        });
    }
    async getSceneListImpl() {
        return new Promise((resolve) => {
            // Note: query-assets API corrected with proper parameters
            Editor.Message.request('asset-db', 'query-assets', {
                pattern: 'db://assets/**/*.scene'
            }).then((results) => {
                const scenes = results.map(asset => ({
                    name: asset.name,
                    path: asset.url,
                    uuid: asset.uuid
                }));
                resolve((0, response_1.ok)(scenes));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async openSceneImpl(scenePath) {
        return new Promise((resolve) => {
            // 首先獲取場景的UUID
            Editor.Message.request('asset-db', 'query-uuid', scenePath).then((uuid) => {
                if (!uuid) {
                    throw new Error('Scene not found');
                }
                // 使用正確的 scene API 打開場景 (需要UUID)
                return Editor.Message.request('scene', 'open-scene', uuid);
            }).then(() => {
                resolve((0, response_1.ok)(undefined, `Scene opened: ${scenePath}`));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async saveSceneImpl() {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'save-scene').then(() => {
                resolve((0, response_1.ok)(undefined, 'Scene saved successfully'));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async createSceneImpl(sceneName, savePath, template = 'empty') {
        return new Promise((resolve) => {
            // 確保路徑以.scene結尾
            const fullPath = savePath.endsWith('.scene') ? savePath : `${savePath}/${sceneName}.scene`;
            // 使用正確的Cocos Creator 3.8場景格式
            const sceneContent = JSON.stringify([
                {
                    "__type__": "cc.SceneAsset",
                    "_name": sceneName,
                    "_objFlags": 0,
                    "__editorExtras__": {},
                    "_native": "",
                    "scene": {
                        "__id__": 1
                    }
                },
                {
                    "__type__": "cc.Scene",
                    "_name": sceneName,
                    "_objFlags": 0,
                    "__editorExtras__": {},
                    "_parent": null,
                    "_children": [],
                    "_active": true,
                    "_components": [],
                    "_prefab": null,
                    "_lpos": {
                        "__type__": "cc.Vec3",
                        "x": 0,
                        "y": 0,
                        "z": 0
                    },
                    "_lrot": {
                        "__type__": "cc.Quat",
                        "x": 0,
                        "y": 0,
                        "z": 0,
                        "w": 1
                    },
                    "_lscale": {
                        "__type__": "cc.Vec3",
                        "x": 1,
                        "y": 1,
                        "z": 1
                    },
                    "_mobility": 0,
                    "_layer": 1073741824,
                    "_euler": {
                        "__type__": "cc.Vec3",
                        "x": 0,
                        "y": 0,
                        "z": 0
                    },
                    "autoReleaseAssets": false,
                    "_globals": {
                        "__id__": 2
                    },
                    "_id": "scene"
                },
                {
                    "__type__": "cc.SceneGlobals",
                    "ambient": {
                        "__id__": 3
                    },
                    "skybox": {
                        "__id__": 4
                    },
                    "fog": {
                        "__id__": 5
                    },
                    "octree": {
                        "__id__": 6
                    }
                },
                {
                    "__type__": "cc.AmbientInfo",
                    "_skyColorHDR": {
                        "__type__": "cc.Vec4",
                        "x": 0.2,
                        "y": 0.5,
                        "z": 0.8,
                        "w": 0.520833
                    },
                    "_skyColor": {
                        "__type__": "cc.Vec4",
                        "x": 0.2,
                        "y": 0.5,
                        "z": 0.8,
                        "w": 0.520833
                    },
                    "_skyIllumHDR": 20000,
                    "_skyIllum": 20000,
                    "_groundAlbedoHDR": {
                        "__type__": "cc.Vec4",
                        "x": 0.2,
                        "y": 0.2,
                        "z": 0.2,
                        "w": 1
                    },
                    "_groundAlbedo": {
                        "__type__": "cc.Vec4",
                        "x": 0.2,
                        "y": 0.2,
                        "z": 0.2,
                        "w": 1
                    }
                },
                {
                    "__type__": "cc.SkyboxInfo",
                    "_envLightingType": 0,
                    "_envmapHDR": null,
                    "_envmap": null,
                    "_envmapLodCount": 0,
                    "_diffuseMapHDR": null,
                    "_diffuseMap": null,
                    "_enabled": false,
                    "_useHDR": true,
                    "_editableMaterial": null,
                    "_reflectionHDR": null,
                    "_reflectionMap": null,
                    "_rotationAngle": 0
                },
                {
                    "__type__": "cc.FogInfo",
                    "_type": 0,
                    "_fogColor": {
                        "__type__": "cc.Color",
                        "r": 200,
                        "g": 200,
                        "b": 200,
                        "a": 255
                    },
                    "_enabled": false,
                    "_fogDensity": 0.3,
                    "_fogStart": 0.5,
                    "_fogEnd": 300,
                    "_fogAtten": 5,
                    "_fogTop": 1.5,
                    "_fogRange": 1.2,
                    "_accurate": false
                },
                {
                    "__type__": "cc.OctreeInfo",
                    "_enabled": false,
                    "_minPos": {
                        "__type__": "cc.Vec3",
                        "x": -1024,
                        "y": -1024,
                        "z": -1024
                    },
                    "_maxPos": {
                        "__type__": "cc.Vec3",
                        "x": 1024,
                        "y": 1024,
                        "z": 1024
                    },
                    "_depth": 8
                }
            ], null, 2);
            Editor.Message.request('asset-db', 'create-asset', fullPath, sceneContent).then(async (result) => {
                var _a, _b;
                if (template === 'empty') {
                    // Existing path: verify and return.
                    try {
                        const sceneList = await this.getSceneListImpl();
                        const createdScene = (_a = sceneList.data) === null || _a === void 0 ? void 0 : _a.find((scene) => scene.uuid === result.uuid);
                        resolve({
                            success: true,
                            data: {
                                uuid: result.uuid,
                                url: result.url,
                                name: sceneName,
                                template,
                                message: `Scene '${sceneName}' created successfully`,
                                sceneVerified: !!createdScene,
                            },
                            verificationData: createdScene,
                        });
                    }
                    catch (_c) {
                        resolve((0, response_1.ok)({
                            uuid: result.uuid,
                            url: result.url,
                            name: sceneName,
                            template,
                            message: `Scene '${sceneName}' created successfully (verification failed)`,
                        }));
                    }
                    return;
                }
                // Template path: open the newly-created scene asset and bake the
                // standard nodes/components on top of the empty scaffolding we
                // just wrote. Done host-side via Editor.Message so behavior
                // matches what the Inspector would build for "New 2D / 3D".
                try {
                    await Editor.Message.request('scene', 'open-scene', result.uuid);
                    await new Promise((r) => setTimeout(r, 600));
                    const tree = await Editor.Message.request('scene', 'query-node-tree');
                    const sceneRootUuid = tree === null || tree === void 0 ? void 0 : tree.uuid;
                    if (!sceneRootUuid) {
                        throw new Error('Could not resolve scene root UUID after open-scene');
                    }
                    const templateData = template === '2d-ui' ? await this.buildTemplate2DUI(sceneRootUuid)
                        : await this.buildTemplate3DBasic(sceneRootUuid);
                    await Editor.Message.request('scene', 'save-scene');
                    resolve((0, response_1.ok)({
                        uuid: result.uuid,
                        url: result.url,
                        name: sceneName,
                        template,
                        templateNodes: templateData,
                        message: `Scene '${sceneName}' created with template '${template}'. Editor switched to the new scene.`,
                    }));
                }
                catch (templateErr) {
                    resolve((0, response_1.fail)(`Scene asset created at ${result.url} but template build failed: ${(_b = templateErr === null || templateErr === void 0 ? void 0 : templateErr.message) !== null && _b !== void 0 ? _b : templateErr}`, { uuid: result.uuid, url: result.url, template }));
                }
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    // Build "New 2D" scaffolding inside the currently-open scene: Camera
    // (cc.Camera, ortho) + Canvas (cc.UITransform + cc.Canvas with
    // cameraComponent linked, layer UI_2D).
    async buildTemplate2DUI(sceneRootUuid) {
        const cameraUuid = await this.createNodeWithComponents('Camera', sceneRootUuid, ['cc.Camera']);
        await this.delay(150);
        const cameraIdx = await this.findComponentIndex(cameraUuid, 'cc.Camera');
        if (cameraIdx >= 0) {
            // 0 = ORTHO, 1 = PERSPECTIVE
            await Editor.Message.request('scene', 'set-property', {
                uuid: cameraUuid,
                path: `__comps__.${cameraIdx}.projection`,
                dump: { value: 0 },
            });
        }
        // cc.Canvas requires cc.UITransform; cocos auto-adds it when adding cc.Canvas.
        const canvasUuid = await this.createNodeWithComponents('Canvas', sceneRootUuid, ['cc.Canvas']);
        await this.delay(150);
        // Canvas itself sits on UI_2D so it (and its descendants by inheritance via
        // create_node auto-detection) are visible to the UI camera.
        await Editor.Message.request('scene', 'set-property', {
            uuid: canvasUuid,
            path: 'layer',
            dump: { value: LAYER_UI_2D },
        });
        // Wire Canvas.cameraComponent → Camera node. Reuses the verified
        // propertyType: 'component' code path so we do not have to re-resolve
        // the component scene __id__ here.
        await this.componentTools.execute('set_component_property', {
            nodeUuid: canvasUuid,
            componentType: 'cc.Canvas',
            property: 'cameraComponent',
            propertyType: 'component',
            value: cameraUuid,
        });
        return { cameraUuid, canvasUuid };
    }
    // Build "New 3D" scaffolding: Camera (perspective) + DirectionalLight.
    async buildTemplate3DBasic(sceneRootUuid) {
        const cameraUuid = await this.createNodeWithComponents('Main Camera', sceneRootUuid, ['cc.Camera']);
        const lightUuid = await this.createNodeWithComponents('Main Light', sceneRootUuid, ['cc.DirectionalLight']);
        await this.delay(150);
        return { cameraUuid, lightUuid };
    }
    async createNodeWithComponents(name, parent, components) {
        const result = await Editor.Message.request('scene', 'create-node', { name, parent });
        const uuid = Array.isArray(result) ? result[0] : result;
        if (typeof uuid !== 'string' || !uuid) {
            throw new Error(`create-node returned no UUID for ${name}`);
        }
        // create-node has no `components` field on the typed CreateNodeOptions,
        // so wire components via the dedicated create-component channel. Each
        // call needs a small breath for the editor to settle the dump.
        for (const component of components) {
            await this.delay(80);
            await Editor.Message.request('scene', 'create-component', { uuid, component });
        }
        return uuid;
    }
    async findComponentIndex(nodeUuid, componentType) {
        var _a, _b, _c, _d, _e;
        const data = await Editor.Message.request('scene', 'query-node', nodeUuid);
        const comps = Array.isArray(data === null || data === void 0 ? void 0 : data.__comps__) ? data.__comps__ : [];
        for (let i = 0; i < comps.length; i++) {
            const t = (_d = (_b = (_a = comps[i]) === null || _a === void 0 ? void 0 : _a.__type__) !== null && _b !== void 0 ? _b : (_c = comps[i]) === null || _c === void 0 ? void 0 : _c.type) !== null && _d !== void 0 ? _d : (_e = comps[i]) === null || _e === void 0 ? void 0 : _e.cid;
            if (t === componentType)
                return i;
        }
        (0, log_1.debugLog)(`[SceneTools] component '${componentType}' not found on node ${nodeUuid}`);
        return -1;
    }
    delay(ms) {
        return new Promise((r) => setTimeout(r, ms));
    }
    async getSceneHierarchyImpl(includeComponents = false) {
        return new Promise((resolve) => {
            // 優先嚐試使用 Editor API 查詢場景節點樹
            Editor.Message.request('scene', 'query-node-tree').then((tree) => {
                if (tree) {
                    const hierarchy = this.buildHierarchy(tree, includeComponents);
                    resolve((0, response_1.ok)(hierarchy));
                }
                else {
                    resolve((0, response_1.fail)('No scene hierarchy available'));
                }
            }).catch((err) => {
                // 備用方案：使用場景腳本
                (0, scene_bridge_1.runSceneMethod)('getSceneHierarchy', [includeComponents]).then((result) => {
                    resolve(result);
                }).catch((err2) => {
                    resolve((0, response_1.fail)(`Direct API failed: ${err.message}, Scene script failed: ${err2.message}`));
                });
            });
        });
    }
    buildHierarchy(node, includeComponents) {
        const nodeInfo = {
            uuid: node.uuid,
            name: node.name,
            type: node.type,
            active: node.active,
            children: []
        };
        if (includeComponents && node.__comps__) {
            nodeInfo.components = node.__comps__.map((comp) => ({
                type: comp.__type__ || 'Unknown',
                enabled: comp.enabled !== undefined ? comp.enabled : true
            }));
        }
        if (node.children) {
            nodeInfo.children = node.children.map((child) => this.buildHierarchy(child, includeComponents));
        }
        return nodeInfo;
    }
    // Programmatic save-as. The cocos `scene/save-as-scene` channel only opens
    // the native file dialog (and blocks until the user dismisses it — root
    // cause of the >15s timeout reported in HANDOFF), so we do not use it.
    // Instead: save the current scene to flush edits, resolve its asset url,
    // then asset-db copy-asset to the target path. Optionally open the copy.
    async saveSceneAsImpl(args) {
        await Editor.Message.request('scene', 'save-scene');
        const tree = await Editor.Message.request('scene', 'query-node-tree');
        const sceneUuid = tree === null || tree === void 0 ? void 0 : tree.uuid;
        if (!sceneUuid) {
            return (0, response_1.fail)('No scene is currently open.');
        }
        const sourceUrl = await Editor.Message.request('asset-db', 'query-url', sceneUuid);
        if (!sourceUrl) {
            return (0, response_1.fail)('Current scene has no asset path on disk yet. Save it once via the Cocos UI (or use create_scene to write a backing file) before save_scene_as can copy it.');
        }
        const targetPath = args.path.endsWith('.scene') ? args.path : `${args.path}.scene`;
        // Pre-check existence so a collision returns a clean error
        // instead of letting cocos pop a "file exists, overwrite?" modal
        // and block on user input. cocos only respects `overwrite: true`
        // silently; the !overwrite path otherwise opens a dialog.
        if (!args.overwrite) {
            const existing = await Editor.Message.request('asset-db', 'query-uuid', targetPath);
            if (existing) {
                return (0, response_1.fail)(`Target '${targetPath}' already exists. Pass overwrite: true to replace it.`, { existingUuid: existing });
            }
        }
        const copyResult = await Editor.Message.request('asset-db', 'copy-asset', sourceUrl, targetPath, { overwrite: !!args.overwrite });
        if (!copyResult || !copyResult.uuid) {
            return (0, response_1.fail)(`asset-db copy-asset returned no result for ${sourceUrl} -> ${targetPath}.`);
        }
        const openAfter = args.openAfter !== false;
        if (openAfter) {
            await Editor.Message.request('scene', 'open-scene', copyResult.uuid);
        }
        return (0, response_1.ok)({
            sourceUrl,
            newUuid: copyResult.uuid,
            newUrl: copyResult.url,
            opened: openAfter,
        }, `Scene saved as ${copyResult.url}`);
    }
    async closeSceneImpl() {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'close-scene').then(() => {
                resolve((0, response_1.ok)(undefined, 'Scene closed successfully'));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
}
exports.SceneTools = SceneTools;
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'get_current_scene',
        title: 'Read current scene',
        description: scene_docs_1.SCENE_DOCS.get_current_scene,
        inputSchema: schema_1.z.object({}),
    })
], SceneTools.prototype, "getCurrentScene", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'get_scene_list',
        title: 'List scene assets',
        description: scene_docs_1.SCENE_DOCS.get_scene_list,
        inputSchema: schema_1.z.object({}),
    })
], SceneTools.prototype, "getSceneList", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'open_scene',
        title: 'Open scene by path',
        description: scene_docs_1.SCENE_DOCS.open_scene,
        inputSchema: schema_1.z.object({
            scenePath: schema_1.z.string().describe('Scene db:// path to open, e.g. db://assets/scenes/Main.scene. The tool resolves UUID first.'),
        }),
    })
], SceneTools.prototype, "openScene", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'save_scene',
        title: 'Save current scene',
        description: scene_docs_1.SCENE_DOCS.save_scene,
        inputSchema: schema_1.z.object({}),
    })
], SceneTools.prototype, "saveScene", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'create_scene',
        title: 'Create scene asset',
        description: scene_docs_1.SCENE_DOCS.create_scene,
        inputSchema: schema_1.z.object({
            sceneName: schema_1.z.string().describe('New scene name; written into the created cc.SceneAsset / cc.Scene.'),
            savePath: schema_1.z.string().describe('Target scene location. Pass a full .scene path or a folder path to append sceneName.scene.'),
            template: schema_1.z.enum(['empty', '2d-ui', '3d-basic']).default('empty').describe('Built-in scaffolding for the new scene. ' +
                '"empty" (default): bare scene root only — current behavior. ' +
                '"2d-ui": Camera (cc.Camera, ortho projection) + Canvas (cc.UITransform + cc.Canvas with cameraComponent linked, layer UI_2D) so UI nodes render immediately under the UI camera. ' +
                '"3d-basic": Camera (perspective) + DirectionalLight at scene root. ' +
                '⚠️ Side effect: when template is not "empty" the editor opens the newly created scene to populate it. Save your current scene first if it has unsaved changes.'),
        }),
    })
], SceneTools.prototype, "createScene", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'save_scene_as',
        title: 'Copy scene asset',
        description: scene_docs_1.SCENE_DOCS.save_scene_as,
        inputSchema: schema_1.z.object({
            path: schema_1.z.string().describe('Target db:// path for the new scene file (e.g. "db://assets/scenes/Copy.scene"). The ".scene" extension is appended if missing.'),
            openAfter: schema_1.z.boolean().default(true).describe('Open the newly-saved scene right after the copy. Default true. Pass false to keep the current scene focused.'),
            overwrite: schema_1.z.boolean().default(false).describe('Overwrite the target file if it already exists. Default false; with false, a name collision returns an error.'),
        }),
    })
], SceneTools.prototype, "saveSceneAs", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'close_scene',
        title: 'Close current scene',
        description: scene_docs_1.SCENE_DOCS.close_scene,
        inputSchema: schema_1.z.object({}),
    })
], SceneTools.prototype, "closeScene", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'get_scene_hierarchy',
        title: 'Read scene hierarchy',
        description: scene_docs_1.SCENE_DOCS.get_scene_hierarchy,
        inputSchema: schema_1.z.object({
            includeComponents: schema_1.z.boolean().default(false).describe('Include component type/enabled summaries on each node. Increases response size.'),
        }),
    })
], SceneTools.prototype, "getSceneHierarchy", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NlbmUtdG9vbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvdG9vbHMvc2NlbmUtdG9vbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7O0FBQUEsOENBQTJDO0FBRTNDLDBDQUFrQztBQUNsQyxrREFBdUU7QUFDdkUsc0RBQXFEO0FBQ3JELHVEQUFtRDtBQUNuRCxvQ0FBc0M7QUFDdEMsbURBQWdEO0FBRWhELE1BQU0sV0FBVyxHQUFHLFFBQVEsQ0FBQztBQUU3QixNQUFhLFVBQVU7SUFHbkI7UUFpTFEsbUJBQWMsR0FBRyxJQUFJLGdDQUFjLEVBQUUsQ0FBQztRQWhMMUMsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFBLHNDQUF5QixFQUFDLElBQUksQ0FBQyxDQUFDO0lBQ2hELENBQUM7SUFFRCxRQUFRLEtBQXVCLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDN0QsT0FBTyxDQUFDLFFBQWdCLEVBQUUsSUFBUyxJQUEyQixPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFRbkcsQUFBTixLQUFLLENBQUMsZUFBZTtRQUNqQixPQUFPLElBQUksQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO0lBQ3RDLENBQUM7SUFRSyxBQUFOLEtBQUssQ0FBQyxZQUFZO1FBQ2QsT0FBTyxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztJQUNuQyxDQUFDO0lBVUssQUFBTixLQUFLLENBQUMsU0FBUyxDQUFDLElBQTJCO1FBQ3ZDLE9BQU8sSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDOUMsQ0FBQztJQVFLLEFBQU4sS0FBSyxDQUFDLFNBQVM7UUFDWCxPQUFPLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztJQUNoQyxDQUFDO0lBa0JLLEFBQU4sS0FBSyxDQUFD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QUMsUUFBUSxDQUFDLGlJQUFpSSxDQUFDO1lBQzVKLFNBQVMsRUFBRSxVQUFDLENBQUMsT0FBTyxFQUFFLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLFFBQVEsQ0FBQyw4R0FBOEcsQ0FBQztZQUM3SixTQUFTLEVBQUUsVUFBQyxDQUFDLE9BQU8sRUFBRSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxRQUFRLENBQUMsK0dBQStHLENBQUM7U0FDbEssQ0FBQztLQUNMLENBQUM7NkNBR0Q7QUFRSztJQU5MLElBQUEsb0JBQU8sRUFBQztRQUNMLElBQUksRUFBRSxhQUFhO1FBQ25CLEtBQUssRUFBRSxxQkFBcUI7UUFDNUIsV0FBVyxFQUFFLHVCQUFVLENBQUMsV0FBVztRQUNuQyxXQUFXLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7S0FDNUIsQ0FBQzs0Q0FHRDtBQVVLO0lBUkwsSUFBQSxvQkFBTyxFQUFDO1FBQ0wsSUFBSSxFQUFFLHFCQUFxQjtRQUMzQixLQUFLLEVBQUUsc0JBQXNCO1FBQzdCLFdBQVcsRUFBRSx1QkFBVSxDQUFDLG1CQUFtQjtRQUMzQyxXQUFXLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQztZQUNsQixpQkFBaUIsRUFBRSxVQUFDLENBQUMsT0FBTyxFQUFFLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDLFFBQVEsQ0FBQyxpRkFBaUYsQ0FBQztTQUM1SSxDQUFDO0tBQ0wsQ0FBQzttREFHRCIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IG9rLCBmYWlsIH0gZnJvbSAnLi4vbGliL3Jlc3BvbnNlJztcbmltcG9ydCB0eXBlIHsgVG9vbERlZmluaXRpb24sIFRvb2xSZXNwb25zZSwgVG9vbEV4ZWN1dG9yLCBTY2VuZUluZm8gfSBmcm9tICcuLi90eXBlcyc7XG5pbXBvcnQgeyB6IH0gZnJvbSAnLi4vbGliL3NjaGVtYSc7XG5pbXBvcnQgeyBtY3BUb29sLCBkZWZpbmVUb29sc0Zyb21EZWNvcmF0b3JzIH0gZnJvbSAnLi4vbGliL2RlY29yYXRvcnMnO1xuaW1wb3J0IHsgcnVuU2NlbmVNZXRob2QgfSBmcm9tICcuLi9saWIvc2NlbmUtYnJpZGdlJztcbmltcG9ydCB7IENvbXBvbmVudFRvb2xzIH0gZnJvbSAnLi9jb21wb25lbnQtdG9vbHMnO1xuaW1wb3J0IHsgZGVidWdMb2cgfSBmcm9tICcuLi9saWIvbG9nJztcbmltcG9ydCB7IFNDRU5FX0RPQ1MgfSBmcm9tICcuLi9kYXRhL3NjZW5lLWRvY3MnO1xuXG5jb25zdCBMQVlFUl9VSV8yRCA9IDMzNTU0NDMyO1xuXG5leHBvcnQgY2xhc3MgU2NlbmVUb29scyBpbXBsZW1lbnRzIFRvb2xFeGVjdXRvciB7XG4gICAgcHJpdmF0ZSByZWFkb25seSBleGVjOiBUb29sRXhlY3V0b3I7XG5cbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgdGhpcy5leGVjID0gZGVmaW5lVG9vbHNGcm9tRGVjb3JhdG9ycyh0aGlzKTtcbiAgICB9XG5cbiAgICBnZXRUb29scygpOiBUb29sRGVmaW5pdGlvbltdIHsgcmV0dXJuIHRoaXMuZXhlYy5nZXRUb29scygpOyB9XG4gICAgZXhlY3V0ZSh0b29sTmFtZTogc3RyaW5nLCBhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4geyByZXR1cm4gdGhpcy5leGVjLmV4ZWN1dGUodG9vbE5hbWUsIGFyZ3MpOyB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdnZXRfY3VycmVudF9zY2VuZScsXG4gICAgICAgIHRpdGxlOiAnUmVhZCBjdXJyZW50IHNjZW5lJyxcbiAgICAgICAgZGVzY3JpcHRpb246IFNDRU5FX0RPQ1MuZ2V0X2N1cnJlbnRfc2NlbmUsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksXG4gICAgfSlcbiAgICBhc3luYyBnZXRDdXJyZW50U2NlbmUoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0Q3VycmVudFNjZW5lSW1wbCgpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ2dldF9zY2VuZV9saXN0JyxcbiAgICAgICAgdGl0bGU6ICdMaXN0IHNjZW5lIGFzc2V0cycsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBTQ0VORV9ET0NTLmdldF9zY2VuZV9saXN0LFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pLFxuICAgIH0pXG4gICAgYXN5bmMgZ2V0U2NlbmVMaXN0KCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldFNjZW5lTGlzdEltcGwoKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdvcGVuX3NjZW5lJyxcbiAgICAgICAgdGl0bGU6ICdPcGVuIHNjZW5lIGJ5IHBhdGgnLFxuICAgICAgICBkZXNjcmlwdGlvbjogU0NFTkVfRE9DUy5vcGVuX3NjZW5lLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgc2NlbmVQYXRoOiB6LnN0cmluZygpLmRlc2NyaWJlKCdTY2VuZSBkYjovLyBwYXRoIHRvIG9wZW4sIGUuZy4gZGI6Ly9hc3NldHMvc2NlbmVzL01haW4uc2NlbmUuIFRoZSB0b29sIHJlc29sdmVzIFVVSUQgZmlyc3QuJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgb3BlblNjZW5lKGFyZ3M6IHsgc2NlbmVQYXRoOiBzdHJpbmcgfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLm9wZW5TY2VuZUltcGwoYXJncy5zY2VuZVBhdGgpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ3NhdmVfc2NlbmUnLFxuICAgICAgICB0aXRsZTogJ1NhdmUgY3VycmVudCBzY2VuZScsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBTQ0VORV9ET0NTLnNhdmVfc2NlbmUsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksXG4gICAgfSlcbiAgICBhc3luYyBzYXZlU2NlbmUoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2F2ZVNjZW5lSW1wbCgpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ2NyZWF0ZV9zY2VuZScsXG4gICAgICAgIHRpdGxlOiAnQ3JlYXRlIHNjZW5lIGFzc2V0JyxcbiAgICAgICAgZGVzY3JpcHRpb246IFNDRU5FX0RPQ1MuY3JlYXRlX3NjZW5lLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgc2NlbmVOYW1lOiB6LnN0cmluZygpLmRlc2NyaWJlKCdOZXcgc2NlbmUgbmFtZTsgd3JpdHRlbiBpbnRvIHRoZSBjcmVhdGVkIGNjLlNjZW5lQXNzZXQgLyBjYy5TY2VuZS4nKSxcbiAgICAgICAgICAgIHNhdmVQYXRoOiB6LnN0cmluZygpLmRlc2NyaWJlKCdUYXJnZXQgc2NlbmUgbG9jYXRpb24uIFBhc3MgYSBmdWxsIC5zY2VuZSBwYXRoIG9yIGEgZm9sZGVyIHBhdGggdG8gYXBwZW5kIHNjZW5lTmFtZS5zY2VuZS4nKSxcbiAgICAgICAgICAgIHRlbXBsYXRlOiB6LmVudW0oWydlbXB0eScsICcyZC11aScsICczZC1iYXNpYyddKS5kZWZhdWx0KCdlbXB0eScpLmRlc2NyaWJlKFxuICAgICAgICAgICAgICAgICdCdWlsdC1pbiBzY2FmZm9sZGluZyBmb3IgdGhlIG5ldyBzY2VuZS4gJyArXG4gICAgICAgICAgICAgICAgJ1wiZW1wdHlcIiAoZGVmYXVsdCk6IGJhcmUgc2NlbmUgcm9vdCBvbmx5IOKAlCBjdXJyZW50IGJlaGF2aW9yLiAnICtcbiAgICAgICAgICAgICAgICAnXCIyZC11aVwiOiBDYW1lcmEgKGNjLkNhbWVyYSwgb3J0aG8gcHJvamVjdGlvbikgKyBDYW52YXMgKGNjLlVJVHJhbnNmb3JtICsgY2MuQ2FudmFzIHdpdGggY2FtZXJhQ29tcG9uZW50IGxpbmtlZCwgbGF5ZXIgVUlfMkQpIHNvIFVJIG5vZGVzIHJlbmRlciBpbW1lZGlhdGVseSB1bmRlciB0aGUgVUkgY2FtZXJhLiAnICtcbiAgICAgICAgICAgICAgICAnXCIzZC1iYXNpY1wiOiBDYW1lcmEgKHBlcnNwZWN0aXZlKSArIERpcmVjdGlvbmFsTGlnaHQgYXQgc2NlbmUgcm9vdC4gJyArXG4gICAgICAgICAgICAgICAgJ+KaoO+4jyBTaWRlIGVmZmVjdDogd2hlbiB0ZW1wbGF0ZSBpcyBub3QgXCJlbXB0eVwiIHRoZSBlZGl0b3Igb3BlbnMgdGhlIG5ld2x5IGNyZWF0ZWQgc2NlbmUgdG8gcG9wdWxhdGUgaXQuIFNhdmUgeW91ciBjdXJyZW50IHNjZW5lIGZpcnN0IGlmIGl0IGhhcyB1bnNhdmVkIGNoYW5nZXMuJ1xuICAgICAgICAgICAgKSxcbiAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBjcmVhdGVTY2VuZShhcmdzOiB7IHNjZW5lTmFtZTogc3RyaW5nOyBzYXZlUGF0aDogc3RyaW5nOyB0ZW1wbGF0ZTogJ2VtcHR5JyB8ICcyZC11aScgfCAnM2QtYmFzaWMnIH0pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5jcmVhdGVTY2VuZUltcGwoYXJncy5zY2VuZU5hbWUsIGFyZ3Muc2F2ZVBhdGgsIGFyZ3MudGVtcGxhdGUpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ3NhdmVfc2NlbmVfYXMnLFxuICAgICAgICB0aXRsZTogJ0NvcHkgc2NlbmUgYXNzZXQnLFxuICAgICAgICBkZXNjcmlwdGlvbjogU0NFTkVfRE9DUy5zYXZlX3NjZW5lX2FzLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgcGF0aDogei5zdHJpbmcoKS5kZXNjcmliZSgnVGFyZ2V0IGRiOi8vIHBhdGggZm9yIHRoZSBuZXcgc2NlbmUgZmlsZSAoZS5nLiBcImRiOi8vYXNzZXRzL3NjZW5lcy9Db3B5LnNjZW5lXCIpLiBUaGUgXCIuc2NlbmVcIiBleHRlbnNpb24gaXMgYXBwZW5kZWQgaWYgbWlzc2luZy4nKSxcbiAgICAgICAgICAgIG9wZW5BZnRlcjogei5ib29sZWFuKCkuZGVmYXVsdCh0cnVlKS5kZXNjcmliZSgnT3BlbiB0aGUgbmV3bHktc2F2ZWQgc2NlbmUgcmlnaHQgYWZ0ZXIgdGhlIGNvcHkuIERlZmF1bHQgdHJ1ZS4gUGFzcyBmYWxzZSB0byBrZWVwIHRoZSBjdXJyZW50IHNjZW5lIGZvY3VzZWQuJyksXG4gICAgICAgICAgICBvdmVyd3JpdGU6IHouYm9vbGVhbigpLmRlZmF1bHQoZmFsc2UpLmRlc2NyaWJlKCdPdmVyd3JpdGUgdGhlIHRhcmdldCBmaWxlIGlmIGl0IGFscmVhZHkgZXhpc3RzLiBEZWZhdWx0IGZhbHNlOyB3aXRoIGZhbHNlLCBhIG5hbWUgY29sbGlzaW9uIHJldHVybnMgYW4gZXJyb3IuJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgc2F2ZVNjZW5lQXMoYXJnczogeyBwYXRoOiBzdHJpbmc7IG9wZW5BZnRlcj86IGJvb2xlYW47IG92ZXJ3cml0ZT86IGJvb2xlYW4gfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLnNhdmVTY2VuZUFzSW1wbChhcmdzKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdjbG9zZV9zY2VuZScsXG4gICAgICAgIHRpdGxlOiAnQ2xvc2UgY3VycmVudCBzY2VuZScsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBTQ0VORV9ET0NTLmNsb3NlX3NjZW5lLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pLFxuICAgIH0pXG4gICAgYXN5bmMgY2xvc2VTY2VuZSgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5jbG9zZVNjZW5lSW1wbCgpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ2dldF9zY2VuZV9oaWVyYXJjaHknLFxuICAgICAgICB0aXRsZTogJ1JlYWQgc2NlbmUgaGllcmFyY2h5JyxcbiAgICAgICAgZGVzY3JpcHRpb246IFNDRU5FX0RPQ1MuZ2V0X3NjZW5lX2hpZXJhcmNoeSxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIGluY2x1ZGVDb21wb25lbnRzOiB6LmJvb2xlYW4oKS5kZWZhdWx0KGZhbHNlKS5kZXNjcmliZSgnSW5jbHVkZSBjb21wb25lbnQgdHlwZS9lbmFibGVkIHN1bW1hcmllcyBvbiBlYWNoIG5vZGUuIEluY3JlYXNlcyByZXNwb25zZSBzaXplLicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIGdldFNjZW5lSGllcmFyY2h5KGFyZ3M6IHsgaW5jbHVkZUNvbXBvbmVudHM/OiBib29sZWFuIH0pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRTY2VuZUhpZXJhcmNoeUltcGwoYXJncy5pbmNsdWRlQ29tcG9uZW50cyk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRDdXJyZW50U2NlbmVJbXBsKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgLy8g55u05o6l5L2/55SoIHF1ZXJ5LW5vZGUtdHJlZSDkvobnjbLlj5bloLTmma/kv6Hmga/vvIjpgJnlgIvmlrnms5Xlt7LntpPpqZforYnlj6/nlKjvvIlcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LW5vZGUtdHJlZScpLnRoZW4oKHRyZWU6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmICh0cmVlICYmIHRyZWUudXVpZCkge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBuYW1lOiB0cmVlLm5hbWUgfHwgJ0N1cnJlbnQgU2NlbmUnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IHRyZWUudXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiB0cmVlLnR5cGUgfHwgJ2NjLlNjZW5lJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBhY3RpdmU6IHRyZWUuYWN0aXZlICE9PSB1bmRlZmluZWQgPyB0cmVlLmFjdGl2ZSA6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbm9kZUNvdW50OiB0cmVlLmNoaWxkcmVuID8gdHJlZS5jaGlsZHJlbi5sZW5ndGggOiAwXG4gICAgICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKCdObyBzY2VuZSBkYXRhIGF2YWlsYWJsZScpKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIC8vIOWCmeeUqOaWueahiO+8muS9v+eUqOWgtOaZr+iFs+acrFxuICAgICAgICAgICAgICAgIHJ1blNjZW5lTWV0aG9kKCdnZXRDdXJyZW50U2NlbmVJbmZvJywgW10pLnRoZW4oKHJlc3VsdDogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICAgICAgICB9KS5jYXRjaCgoZXJyMjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGBEaXJlY3QgQVBJIGZhaWxlZDogJHtlcnIubWVzc2FnZX0sIFNjZW5lIHNjcmlwdCBmYWlsZWQ6ICR7ZXJyMi5tZXNzYWdlfWApKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldFNjZW5lTGlzdEltcGwoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICAvLyBOb3RlOiBxdWVyeS1hc3NldHMgQVBJIGNvcnJlY3RlZCB3aXRoIHByb3BlciBwYXJhbWV0ZXJzXG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldHMnLCB7XG4gICAgICAgICAgICAgICAgcGF0dGVybjogJ2RiOi8vYXNzZXRzLyoqLyouc2NlbmUnXG4gICAgICAgICAgICB9KS50aGVuKChyZXN1bHRzOiBhbnlbXSkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHNjZW5lczogU2NlbmVJbmZvW10gPSByZXN1bHRzLm1hcChhc3NldCA9PiAoe1xuICAgICAgICAgICAgICAgICAgICBuYW1lOiBhc3NldC5uYW1lLFxuICAgICAgICAgICAgICAgICAgICBwYXRoOiBhc3NldC51cmwsXG4gICAgICAgICAgICAgICAgICAgIHV1aWQ6IGFzc2V0LnV1aWRcbiAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayhzY2VuZXMpKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBvcGVuU2NlbmVJbXBsKHNjZW5lUGF0aDogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICAvLyDpppblhYjnjbLlj5bloLTmma/nmoRVVUlEXG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS11dWlkJywgc2NlbmVQYXRoKS50aGVuKCh1dWlkOiBzdHJpbmcgfCBudWxsKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKCF1dWlkKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignU2NlbmUgbm90IGZvdW5kJyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIC8vIOS9v+eUqOato+eiuueahCBzY2VuZSBBUEkg5omT6ZaL5aC05pmvICjpnIDopoFVVUlEKVxuICAgICAgICAgICAgICAgIHJldHVybiBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdvcGVuLXNjZW5lJywgdXVpZCk7XG4gICAgICAgICAgICB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHVuZGVmaW5lZCwgYFNjZW5lIG9wZW5lZDogJHtzY2VuZVBhdGh9YCkpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHNhdmVTY2VuZUltcGwoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdzYXZlLXNjZW5lJykudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh1bmRlZmluZWQsICdTY2VuZSBzYXZlZCBzdWNjZXNzZnVsbHknKSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgY29tcG9uZW50VG9vbHMgPSBuZXcgQ29tcG9uZW50VG9vbHMoKTtcblxuICAgIHByaXZhdGUgYXN5bmMgY3JlYXRlU2NlbmVJbXBsKHNjZW5lTmFtZTogc3RyaW5nLCBzYXZlUGF0aDogc3RyaW5nLCB0ZW1wbGF0ZTogJ2VtcHR5JyB8ICcyZC11aScgfCAnM2QtYmFzaWMnID0gJ2VtcHR5Jyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgLy8g56K65L+d6Lev5b6R5LulLnNjZW5l57WQ5bC+XG4gICAgICAgICAgICBjb25zdCBmdWxsUGF0aCA9IHNhdmVQYXRoLmVuZHNXaXRoKCcuc2NlbmUnKSA/IHNhdmVQYXRoIDogYCR7c2F2ZVBhdGh9LyR7c2NlbmVOYW1lfS5zY2VuZWA7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIOS9v+eUqOato+eiuueahENvY29zIENyZWF0b3IgMy445aC05pmv5qC85byPXG4gICAgICAgICAgICBjb25zdCBzY2VuZUNvbnRlbnQgPSBKU09OLnN0cmluZ2lmeShbXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcIl9fdHlwZV9fXCI6IFwiY2MuU2NlbmVBc3NldFwiLFxuICAgICAgICAgICAgICAgICAgICBcIl9uYW1lXCI6IHNjZW5lTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgXCJfb2JqRmxhZ3NcIjogMCxcbiAgICAgICAgICAgICAgICAgICAgXCJfX2VkaXRvckV4dHJhc19fXCI6IHt9LFxuICAgICAgICAgICAgICAgICAgICBcIl9uYXRpdmVcIjogXCJcIixcbiAgICAgICAgICAgICAgICAgICAgXCJzY2VuZVwiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcIl9faWRfX1wiOiAxXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCJfX3R5cGVfX1wiOiBcImNjLlNjZW5lXCIsXG4gICAgICAgICAgICAgICAgICAgIFwiX25hbWVcIjogc2NlbmVOYW1lLFxuICAgICAgICAgICAgICAgICAgICBcIl9vYmpGbGFnc1wiOiAwLFxuICAgICAgICAgICAgICAgICAgICBcIl9fZWRpdG9yRXh0cmFzX19cIjoge30sXG4gICAgICAgICAgICAgICAgICAgIFwiX3BhcmVudFwiOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICBcIl9jaGlsZHJlblwiOiBbXSxcbiAgICAgICAgICAgICAgICAgICAgXCJfYWN0aXZlXCI6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIFwiX2NvbXBvbmVudHNcIjogW10sXG4gICAgICAgICAgICAgICAgICAgIFwiX3ByZWZhYlwiOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICBcIl9scG9zXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiX190eXBlX19cIjogXCJjYy5WZWMzXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInhcIjogMCxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwieVwiOiAwLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ6XCI6IDBcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgXCJfbHJvdFwiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcIl9fdHlwZV9fXCI6IFwiY2MuUXVhdFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ4XCI6IDAsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInlcIjogMCxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwielwiOiAwLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ3XCI6IDFcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgXCJfbHNjYWxlXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiX190eXBlX19cIjogXCJjYy5WZWMzXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInhcIjogMSxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwieVwiOiAxLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ6XCI6IDFcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgXCJfbW9iaWxpdHlcIjogMCxcbiAgICAgICAgICAgICAgICAgICAgXCJfbGF5ZXJcIjogMTA3Mzc0MTgyNCxcbiAgICAgICAgICAgICAgICAgICAgXCJfZXVsZXJcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJfX3R5cGVfX1wiOiBcImNjLlZlYzNcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIFwieFwiOiAwLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ5XCI6IDAsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInpcIjogMFxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICBcImF1dG9SZWxlYXNlQXNzZXRzXCI6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICBcIl9nbG9iYWxzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiX19pZF9fXCI6IDJcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgXCJfaWRcIjogXCJzY2VuZVwiXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIFwiX190eXBlX19cIjogXCJjYy5TY2VuZUdsb2JhbHNcIixcbiAgICAgICAgICAgICAgICAgICAgXCJhbWJpZW50XCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiX19pZF9fXCI6IDNcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgXCJza3lib3hcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJfX2lkX19cIjogNFxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICBcImZvZ1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcIl9faWRfX1wiOiA1XG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIFwib2N0cmVlXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiX19pZF9fXCI6IDZcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcIl9fdHlwZV9fXCI6IFwiY2MuQW1iaWVudEluZm9cIixcbiAgICAgICAgICAgICAgICAgICAgXCJfc2t5Q29sb3JIRFJcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJfX3R5cGVfX1wiOiBcImNjLlZlYzRcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIFwieFwiOiAwLjIsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInlcIjogMC41LFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ6XCI6IDAuOCxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwid1wiOiAwLjUyMDgzM1xuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICBcIl9za3lDb2xvclwiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcIl9fdHlwZV9fXCI6IFwiY2MuVmVjNFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ4XCI6IDAuMixcbiAgICAgICAgICAgICAgICAgICAgICAgIFwieVwiOiAwLjUsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInpcIjogMC44LFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ3XCI6IDAuNTIwODMzXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIFwiX3NreUlsbHVtSERSXCI6IDIwMDAwLFxuICAgICAgICAgICAgICAgICAgICBcIl9za3lJbGx1bVwiOiAyMDAwMCxcbiAgICAgICAgICAgICAgICAgICAgXCJfZ3JvdW5kQWxiZWRvSERSXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiX190eXBlX19cIjogXCJjYy5WZWM0XCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInhcIjogMC4yLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ5XCI6IDAuMixcbiAgICAgICAgICAgICAgICAgICAgICAgIFwielwiOiAwLjIsXG4gICAgICAgICAgICAgICAgICAgICAgICBcIndcIjogMVxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICBcIl9ncm91bmRBbGJlZG9cIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJfX3R5cGVfX1wiOiBcImNjLlZlYzRcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIFwieFwiOiAwLjIsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInlcIjogMC4yLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ6XCI6IDAuMixcbiAgICAgICAgICAgICAgICAgICAgICAgIFwid1wiOiAxXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCJfX3R5cGVfX1wiOiBcImNjLlNreWJveEluZm9cIixcbiAgICAgICAgICAgICAgICAgICAgXCJfZW52TGlnaHRpbmdUeXBlXCI6IDAsXG4gICAgICAgICAgICAgICAgICAgIFwiX2Vudm1hcEhEUlwiOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICBcIl9lbnZtYXBcIjogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgXCJfZW52bWFwTG9kQ291bnRcIjogMCxcbiAgICAgICAgICAgICAgICAgICAgXCJfZGlmZnVzZU1hcEhEUlwiOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICBcIl9kaWZmdXNlTWFwXCI6IG51bGwsXG4gICAgICAgICAgICAgICAgICAgIFwiX2VuYWJsZWRcIjogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIFwiX3VzZUhEUlwiOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBcIl9lZGl0YWJsZU1hdGVyaWFsXCI6IG51bGwsXG4gICAgICAgICAgICAgICAgICAgIFwiX3JlZmxlY3Rpb25IRFJcIjogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgXCJfcmVmbGVjdGlvbk1hcFwiOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICBcIl9yb3RhdGlvbkFuZ2xlXCI6IDBcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCJfX3R5cGVfX1wiOiBcImNjLkZvZ0luZm9cIixcbiAgICAgICAgICAgICAgICAgICAgXCJfdHlwZVwiOiAwLFxuICAgICAgICAgICAgICAgICAgICBcIl9mb2dDb2xvclwiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcIl9fdHlwZV9fXCI6IFwiY2MuQ29sb3JcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiclwiOiAyMDAsXG4gICAgICAgICAgICAgICAgICAgICAgICBcImdcIjogMjAwLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJiXCI6IDIwMCxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiYVwiOiAyNTVcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgXCJfZW5hYmxlZFwiOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgXCJfZm9nRGVuc2l0eVwiOiAwLjMsXG4gICAgICAgICAgICAgICAgICAgIFwiX2ZvZ1N0YXJ0XCI6IDAuNSxcbiAgICAgICAgICAgICAgICAgICAgXCJfZm9nRW5kXCI6IDMwMCxcbiAgICAgICAgICAgICAgICAgICAgXCJfZm9nQXR0ZW5cIjogNSxcbiAgICAgICAgICAgICAgICAgICAgXCJfZm9nVG9wXCI6IDEuNSxcbiAgICAgICAgICAgICAgICAgICAgXCJfZm9nUmFuZ2VcIjogMS4yLFxuICAgICAgICAgICAgICAgICAgICBcIl9hY2N1cmF0ZVwiOiBmYWxzZVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcIl9fdHlwZV9fXCI6IFwiY2MuT2N0cmVlSW5mb1wiLFxuICAgICAgICAgICAgICAgICAgICBcIl9lbmFibGVkXCI6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICBcIl9taW5Qb3NcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJfX3R5cGVfX1wiOiBcImNjLlZlYzNcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIFwieFwiOiAtMTAyNCxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwieVwiOiAtMTAyNCxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwielwiOiAtMTAyNFxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICBcIl9tYXhQb3NcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJfX3R5cGVfX1wiOiBcImNjLlZlYzNcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIFwieFwiOiAxMDI0LFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ5XCI6IDEwMjQsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInpcIjogMTAyNFxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICBcIl9kZXB0aFwiOiA4XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgXSwgbnVsbCwgMik7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ2NyZWF0ZS1hc3NldCcsIGZ1bGxQYXRoLCBzY2VuZUNvbnRlbnQpLnRoZW4oYXN5bmMgKHJlc3VsdDogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHRlbXBsYXRlID09PSAnZW1wdHknKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIEV4aXN0aW5nIHBhdGg6IHZlcmlmeSBhbmQgcmV0dXJuLlxuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgc2NlbmVMaXN0ID0gYXdhaXQgdGhpcy5nZXRTY2VuZUxpc3RJbXBsKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjcmVhdGVkU2NlbmUgPSBzY2VuZUxpc3QuZGF0YT8uZmluZCgoc2NlbmU6IGFueSkgPT4gc2NlbmUudXVpZCA9PT0gcmVzdWx0LnV1aWQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IHJlc3VsdC51dWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB1cmw6IHJlc3VsdC51cmwsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5hbWU6IHNjZW5lTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGVtcGxhdGUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBTY2VuZSAnJHtzY2VuZU5hbWV9JyBjcmVhdGVkIHN1Y2Nlc3NmdWxseWAsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNjZW5lVmVyaWZpZWQ6ICEhY3JlYXRlZFNjZW5lLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmVyaWZpY2F0aW9uRGF0YTogY3JlYXRlZFNjZW5lLFxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IHJlc3VsdC51dWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB1cmw6IHJlc3VsdC51cmwsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5hbWU6IHNjZW5lTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGVtcGxhdGUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBTY2VuZSAnJHtzY2VuZU5hbWV9JyBjcmVhdGVkIHN1Y2Nlc3NmdWxseSAodmVyaWZpY2F0aW9uIGZhaWxlZClgLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gVGVtcGxhdGUgcGF0aDogb3BlbiB0aGUgbmV3bHktY3JlYXRlZCBzY2VuZSBhc3NldCBhbmQgYmFrZSB0aGVcbiAgICAgICAgICAgICAgICAvLyBzdGFuZGFyZCBub2Rlcy9jb21wb25lbnRzIG9uIHRvcCBvZiB0aGUgZW1wdHkgc2NhZmZvbGRpbmcgd2VcbiAgICAgICAgICAgICAgICAvLyBqdXN0IHdyb3RlLiBEb25lIGhvc3Qtc2lkZSB2aWEgRWRpdG9yLk1lc3NhZ2Ugc28gYmVoYXZpb3JcbiAgICAgICAgICAgICAgICAvLyBtYXRjaGVzIHdoYXQgdGhlIEluc3BlY3RvciB3b3VsZCBidWlsZCBmb3IgXCJOZXcgMkQgLyAzRFwiLlxuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ29wZW4tc2NlbmUnLCByZXN1bHQudXVpZCk7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKChyKSA9PiBzZXRUaW1lb3V0KHIsIDYwMCkpO1xuXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRyZWU6IGFueSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LW5vZGUtdHJlZScpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBzY2VuZVJvb3RVdWlkOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB0cmVlPy51dWlkO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXNjZW5lUm9vdFV1aWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignQ291bGQgbm90IHJlc29sdmUgc2NlbmUgcm9vdCBVVUlEIGFmdGVyIG9wZW4tc2NlbmUnKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRlbXBsYXRlRGF0YSA9XG4gICAgICAgICAgICAgICAgICAgICAgICB0ZW1wbGF0ZSA9PT0gJzJkLXVpJyA/IGF3YWl0IHRoaXMuYnVpbGRUZW1wbGF0ZTJEVUkoc2NlbmVSb290VXVpZClcbiAgICAgICAgICAgICAgICAgICAgICAgIDogYXdhaXQgdGhpcy5idWlsZFRlbXBsYXRlM0RCYXNpYyhzY2VuZVJvb3RVdWlkKTtcblxuICAgICAgICAgICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdzYXZlLXNjZW5lJyk7XG5cbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdXVpZDogcmVzdWx0LnV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdXJsOiByZXN1bHQudXJsLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5hbWU6IHNjZW5lTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0ZW1wbGF0ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0ZW1wbGF0ZU5vZGVzOiB0ZW1wbGF0ZURhdGEsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYFNjZW5lICcke3NjZW5lTmFtZX0nIGNyZWF0ZWQgd2l0aCB0ZW1wbGF0ZSAnJHt0ZW1wbGF0ZX0nLiBFZGl0b3Igc3dpdGNoZWQgdG8gdGhlIG5ldyBzY2VuZS5gLFxuICAgICAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKHRlbXBsYXRlRXJyOiBhbnkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGBTY2VuZSBhc3NldCBjcmVhdGVkIGF0ICR7cmVzdWx0LnVybH0gYnV0IHRlbXBsYXRlIGJ1aWxkIGZhaWxlZDogJHt0ZW1wbGF0ZUVycj8ubWVzc2FnZSA/PyB0ZW1wbGF0ZUVycn1gLCB7IHV1aWQ6IHJlc3VsdC51dWlkLCB1cmw6IHJlc3VsdC51cmwsIHRlbXBsYXRlIH0pKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIEJ1aWxkIFwiTmV3IDJEXCIgc2NhZmZvbGRpbmcgaW5zaWRlIHRoZSBjdXJyZW50bHktb3BlbiBzY2VuZTogQ2FtZXJhXG4gICAgLy8gKGNjLkNhbWVyYSwgb3J0aG8pICsgQ2FudmFzIChjYy5VSVRyYW5zZm9ybSArIGNjLkNhbnZhcyB3aXRoXG4gICAgLy8gY2FtZXJhQ29tcG9uZW50IGxpbmtlZCwgbGF5ZXIgVUlfMkQpLlxuICAgIHByaXZhdGUgYXN5bmMgYnVpbGRUZW1wbGF0ZTJEVUkoc2NlbmVSb290VXVpZDogc3RyaW5nKTogUHJvbWlzZTx7IGNhbWVyYVV1aWQ6IHN0cmluZzsgY2FudmFzVXVpZDogc3RyaW5nIH0+IHtcbiAgICAgICAgY29uc3QgY2FtZXJhVXVpZCA9IGF3YWl0IHRoaXMuY3JlYXRlTm9kZVdpdGhDb21wb25lbnRzKCdDYW1lcmEnLCBzY2VuZVJvb3RVdWlkLCBbJ2NjLkNhbWVyYSddKTtcbiAgICAgICAgYXdhaXQgdGhpcy5kZWxheSgxNTApO1xuICAgICAgICBjb25zdCBjYW1lcmFJZHggPSBhd2FpdCB0aGlzLmZpbmRDb21wb25lbnRJbmRleChjYW1lcmFVdWlkLCAnY2MuQ2FtZXJhJyk7XG4gICAgICAgIGlmIChjYW1lcmFJZHggPj0gMCkge1xuICAgICAgICAgICAgLy8gMCA9IE9SVEhPLCAxID0gUEVSU1BFQ1RJVkVcbiAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3NldC1wcm9wZXJ0eScsIHtcbiAgICAgICAgICAgICAgICB1dWlkOiBjYW1lcmFVdWlkLFxuICAgICAgICAgICAgICAgIHBhdGg6IGBfX2NvbXBzX18uJHtjYW1lcmFJZHh9LnByb2plY3Rpb25gLFxuICAgICAgICAgICAgICAgIGR1bXA6IHsgdmFsdWU6IDAgfSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gY2MuQ2FudmFzIHJlcXVpcmVzIGNjLlVJVHJhbnNmb3JtOyBjb2NvcyBhdXRvLWFkZHMgaXQgd2hlbiBhZGRpbmcgY2MuQ2FudmFzLlxuICAgICAgICBjb25zdCBjYW52YXNVdWlkID0gYXdhaXQgdGhpcy5jcmVhdGVOb2RlV2l0aENvbXBvbmVudHMoJ0NhbnZhcycsIHNjZW5lUm9vdFV1aWQsIFsnY2MuQ2FudmFzJ10pO1xuICAgICAgICBhd2FpdCB0aGlzLmRlbGF5KDE1MCk7XG5cbiAgICAgICAgLy8gQ2FudmFzIGl0c2VsZiBzaXRzIG9uIFVJXzJEIHNvIGl0IChhbmQgaXRzIGRlc2NlbmRhbnRzIGJ5IGluaGVyaXRhbmNlIHZpYVxuICAgICAgICAvLyBjcmVhdGVfbm9kZSBhdXRvLWRldGVjdGlvbikgYXJlIHZpc2libGUgdG8gdGhlIFVJIGNhbWVyYS5cbiAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnc2V0LXByb3BlcnR5Jywge1xuICAgICAgICAgICAgdXVpZDogY2FudmFzVXVpZCxcbiAgICAgICAgICAgIHBhdGg6ICdsYXllcicsXG4gICAgICAgICAgICBkdW1wOiB7IHZhbHVlOiBMQVlFUl9VSV8yRCB9LFxuICAgICAgICB9KTtcblxuICAgICAgICAvLyBXaXJlIENhbnZhcy5jYW1lcmFDb21wb25lbnQg4oaSIENhbWVyYSBub2RlLiBSZXVzZXMgdGhlIHZlcmlmaWVkXG4gICAgICAgIC8vIHByb3BlcnR5VHlwZTogJ2NvbXBvbmVudCcgY29kZSBwYXRoIHNvIHdlIGRvIG5vdCBoYXZlIHRvIHJlLXJlc29sdmVcbiAgICAgICAgLy8gdGhlIGNvbXBvbmVudCBzY2VuZSBfX2lkX18gaGVyZS5cbiAgICAgICAgYXdhaXQgdGhpcy5jb21wb25lbnRUb29scy5leGVjdXRlKCdzZXRfY29tcG9uZW50X3Byb3BlcnR5Jywge1xuICAgICAgICAgICAgbm9kZVV1aWQ6IGNhbnZhc1V1aWQsXG4gICAgICAgICAgICBjb21wb25lbnRUeXBlOiAnY2MuQ2FudmFzJyxcbiAgICAgICAgICAgIHByb3BlcnR5OiAnY2FtZXJhQ29tcG9uZW50JyxcbiAgICAgICAgICAgIHByb3BlcnR5VHlwZTogJ2NvbXBvbmVudCcsXG4gICAgICAgICAgICB2YWx1ZTogY2FtZXJhVXVpZCxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHsgY2FtZXJhVXVpZCwgY2FudmFzVXVpZCB9O1xuICAgIH1cblxuICAgIC8vIEJ1aWxkIFwiTmV3IDNEXCIgc2NhZmZvbGRpbmc6IENhbWVyYSAocGVyc3BlY3RpdmUpICsgRGlyZWN0aW9uYWxMaWdodC5cbiAgICBwcml2YXRlIGFzeW5jIGJ1aWxkVGVtcGxhdGUzREJhc2ljKHNjZW5lUm9vdFV1aWQ6IHN0cmluZyk6IFByb21pc2U8eyBjYW1lcmFVdWlkOiBzdHJpbmc7IGxpZ2h0VXVpZDogc3RyaW5nIH0+IHtcbiAgICAgICAgY29uc3QgY2FtZXJhVXVpZCA9IGF3YWl0IHRoaXMuY3JlYXRlTm9kZVdpdGhDb21wb25lbnRzKCdNYWluIENhbWVyYScsIHNjZW5lUm9vdFV1aWQsIFsnY2MuQ2FtZXJhJ10pO1xuICAgICAgICBjb25zdCBsaWdodFV1aWQgPSBhd2FpdCB0aGlzLmNyZWF0ZU5vZGVXaXRoQ29tcG9uZW50cygnTWFpbiBMaWdodCcsIHNjZW5lUm9vdFV1aWQsIFsnY2MuRGlyZWN0aW9uYWxMaWdodCddKTtcbiAgICAgICAgYXdhaXQgdGhpcy5kZWxheSgxNTApO1xuICAgICAgICByZXR1cm4geyBjYW1lcmFVdWlkLCBsaWdodFV1aWQgfTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGNyZWF0ZU5vZGVXaXRoQ29tcG9uZW50cyhuYW1lOiBzdHJpbmcsIHBhcmVudDogc3RyaW5nLCBjb21wb25lbnRzOiBzdHJpbmdbXSk6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ2NyZWF0ZS1ub2RlJywgeyBuYW1lLCBwYXJlbnQgfSk7XG4gICAgICAgIGNvbnN0IHV1aWQgPSBBcnJheS5pc0FycmF5KHJlc3VsdCkgPyByZXN1bHRbMF0gOiByZXN1bHQ7XG4gICAgICAgIGlmICh0eXBlb2YgdXVpZCAhPT0gJ3N0cmluZycgfHwgIXV1aWQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgY3JlYXRlLW5vZGUgcmV0dXJuZWQgbm8gVVVJRCBmb3IgJHtuYW1lfWApO1xuICAgICAgICB9XG4gICAgICAgIC8vIGNyZWF0ZS1ub2RlIGhhcyBubyBgY29tcG9uZW50c2AgZmllbGQgb24gdGhlIHR5cGVkIENyZWF0ZU5vZGVPcHRpb25zLFxuICAgICAgICAvLyBzbyB3aXJlIGNvbXBvbmVudHMgdmlhIHRoZSBkZWRpY2F0ZWQgY3JlYXRlLWNvbXBvbmVudCBjaGFubmVsLiBFYWNoXG4gICAgICAgIC8vIGNhbGwgbmVlZHMgYSBzbWFsbCBicmVhdGggZm9yIHRoZSBlZGl0b3IgdG8gc2V0dGxlIHRoZSBkdW1wLlxuICAgICAgICBmb3IgKGNvbnN0IGNvbXBvbmVudCBvZiBjb21wb25lbnRzKSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLmRlbGF5KDgwKTtcbiAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ2NyZWF0ZS1jb21wb25lbnQnLCB7IHV1aWQsIGNvbXBvbmVudCB9KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdXVpZDtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGZpbmRDb21wb25lbnRJbmRleChub2RlVXVpZDogc3RyaW5nLCBjb21wb25lbnRUeXBlOiBzdHJpbmcpOiBQcm9taXNlPG51bWJlcj4ge1xuICAgICAgICBjb25zdCBkYXRhOiBhbnkgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1ub2RlJywgbm9kZVV1aWQpO1xuICAgICAgICBjb25zdCBjb21wcyA9IEFycmF5LmlzQXJyYXkoZGF0YT8uX19jb21wc19fKSA/IGRhdGEuX19jb21wc19fIDogW107XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY29tcHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IHQgPSBjb21wc1tpXT8uX190eXBlX18gPz8gY29tcHNbaV0/LnR5cGUgPz8gY29tcHNbaV0/LmNpZDtcbiAgICAgICAgICAgIGlmICh0ID09PSBjb21wb25lbnRUeXBlKSByZXR1cm4gaTtcbiAgICAgICAgfVxuICAgICAgICBkZWJ1Z0xvZyhgW1NjZW5lVG9vbHNdIGNvbXBvbmVudCAnJHtjb21wb25lbnRUeXBlfScgbm90IGZvdW5kIG9uIG5vZGUgJHtub2RlVXVpZH1gKTtcbiAgICAgICAgcmV0dXJuIC0xO1xuICAgIH1cblxuICAgIHByaXZhdGUgZGVsYXkobXM6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHIpID0+IHNldFRpbWVvdXQociwgbXMpKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldFNjZW5lSGllcmFyY2h5SW1wbChpbmNsdWRlQ29tcG9uZW50czogYm9vbGVhbiA9IGZhbHNlKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICAvLyDlhKrlhYjlmpDoqabkvb/nlKggRWRpdG9yIEFQSSDmn6XoqaLloLTmma/nr4Dpu57mqLlcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LW5vZGUtdHJlZScpLnRoZW4oKHRyZWU6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmICh0cmVlKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGhpZXJhcmNoeSA9IHRoaXMuYnVpbGRIaWVyYXJjaHkodHJlZSwgaW5jbHVkZUNvbXBvbmVudHMpO1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKG9rKGhpZXJhcmNoeSkpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbCgnTm8gc2NlbmUgaGllcmFyY2h5IGF2YWlsYWJsZScpKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIC8vIOWCmeeUqOaWueahiO+8muS9v+eUqOWgtOaZr+iFs+acrFxuICAgICAgICAgICAgICAgIHJ1blNjZW5lTWV0aG9kKCdnZXRTY2VuZUhpZXJhcmNoeScsIFtpbmNsdWRlQ29tcG9uZW50c10pLnRoZW4oKHJlc3VsdDogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICAgICAgICB9KS5jYXRjaCgoZXJyMjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGBEaXJlY3QgQVBJIGZhaWxlZDogJHtlcnIubWVzc2FnZX0sIFNjZW5lIHNjcmlwdCBmYWlsZWQ6ICR7ZXJyMi5tZXNzYWdlfWApKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGJ1aWxkSGllcmFyY2h5KG5vZGU6IGFueSwgaW5jbHVkZUNvbXBvbmVudHM6IGJvb2xlYW4pOiBhbnkge1xuICAgICAgICBjb25zdCBub2RlSW5mbzogYW55ID0ge1xuICAgICAgICAgICAgdXVpZDogbm9kZS51dWlkLFxuICAgICAgICAgICAgbmFtZTogbm9kZS5uYW1lLFxuICAgICAgICAgICAgdHlwZTogbm9kZS50eXBlLFxuICAgICAgICAgICAgYWN0aXZlOiBub2RlLmFjdGl2ZSxcbiAgICAgICAgICAgIGNoaWxkcmVuOiBbXVxuICAgICAgICB9O1xuXG4gICAgICAgIGlmIChpbmNsdWRlQ29tcG9uZW50cyAmJiBub2RlLl9fY29tcHNfXykge1xuICAgICAgICAgICAgbm9kZUluZm8uY29tcG9uZW50cyA9IG5vZGUuX19jb21wc19fLm1hcCgoY29tcDogYW55KSA9PiAoe1xuICAgICAgICAgICAgICAgIHR5cGU6IGNvbXAuX190eXBlX18gfHwgJ1Vua25vd24nLFxuICAgICAgICAgICAgICAgIGVuYWJsZWQ6IGNvbXAuZW5hYmxlZCAhPT0gdW5kZWZpbmVkID8gY29tcC5lbmFibGVkIDogdHJ1ZVxuICAgICAgICAgICAgfSkpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKG5vZGUuY2hpbGRyZW4pIHtcbiAgICAgICAgICAgIG5vZGVJbmZvLmNoaWxkcmVuID0gbm9kZS5jaGlsZHJlbi5tYXAoKGNoaWxkOiBhbnkpID0+IFxuICAgICAgICAgICAgICAgIHRoaXMuYnVpbGRIaWVyYXJjaHkoY2hpbGQsIGluY2x1ZGVDb21wb25lbnRzKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBub2RlSW5mbztcbiAgICB9XG5cbiAgICAvLyBQcm9ncmFtbWF0aWMgc2F2ZS1hcy4gVGhlIGNvY29zIGBzY2VuZS9zYXZlLWFzLXNjZW5lYCBjaGFubmVsIG9ubHkgb3BlbnNcbiAgICAvLyB0aGUgbmF0aXZlIGZpbGUgZGlhbG9nIChhbmQgYmxvY2tzIHVudGlsIHRoZSB1c2VyIGRpc21pc3NlcyBpdCDigJQgcm9vdFxuICAgIC8vIGNhdXNlIG9mIHRoZSA+MTVzIHRpbWVvdXQgcmVwb3J0ZWQgaW4gSEFORE9GRiksIHNvIHdlIGRvIG5vdCB1c2UgaXQuXG4gICAgLy8gSW5zdGVhZDogc2F2ZSB0aGUgY3VycmVudCBzY2VuZSB0byBmbHVzaCBlZGl0cywgcmVzb2x2ZSBpdHMgYXNzZXQgdXJsLFxuICAgIC8vIHRoZW4gYXNzZXQtZGIgY29weS1hc3NldCB0byB0aGUgdGFyZ2V0IHBhdGguIE9wdGlvbmFsbHkgb3BlbiB0aGUgY29weS5cbiAgICBwcml2YXRlIGFzeW5jIHNhdmVTY2VuZUFzSW1wbChhcmdzOiB7IHBhdGg6IHN0cmluZzsgb3BlbkFmdGVyPzogYm9vbGVhbjsgb3ZlcndyaXRlPzogYm9vbGVhbiB9KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnc2F2ZS1zY2VuZScpO1xuXG4gICAgICAgIGNvbnN0IHRyZWU6IGFueSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LW5vZGUtdHJlZScpO1xuICAgICAgICBjb25zdCBzY2VuZVV1aWQ6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHRyZWU/LnV1aWQ7XG4gICAgICAgIGlmICghc2NlbmVVdWlkKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbCgnTm8gc2NlbmUgaXMgY3VycmVudGx5IG9wZW4uJyk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBzb3VyY2VVcmwgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS11cmwnLCBzY2VuZVV1aWQpO1xuICAgICAgICBpZiAoIXNvdXJjZVVybCkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ0N1cnJlbnQgc2NlbmUgaGFzIG5vIGFzc2V0IHBhdGggb24gZGlzayB5ZXQuIFNhdmUgaXQgb25jZSB2aWEgdGhlIENvY29zIFVJIChvciB1c2UgY3JlYXRlX3NjZW5lIHRvIHdyaXRlIGEgYmFja2luZyBmaWxlKSBiZWZvcmUgc2F2ZV9zY2VuZV9hcyBjYW4gY29weSBpdC4nKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHRhcmdldFBhdGggPSBhcmdzLnBhdGguZW5kc1dpdGgoJy5zY2VuZScpID8gYXJncy5wYXRoIDogYCR7YXJncy5wYXRofS5zY2VuZWA7XG5cbiAgICAgICAgLy8gUHJlLWNoZWNrIGV4aXN0ZW5jZSBzbyBhIGNvbGxpc2lvbiByZXR1cm5zIGEgY2xlYW4gZXJyb3JcbiAgICAgICAgLy8gaW5zdGVhZCBvZiBsZXR0aW5nIGNvY29zIHBvcCBhIFwiZmlsZSBleGlzdHMsIG92ZXJ3cml0ZT9cIiBtb2RhbFxuICAgICAgICAvLyBhbmQgYmxvY2sgb24gdXNlciBpbnB1dC4gY29jb3Mgb25seSByZXNwZWN0cyBgb3ZlcndyaXRlOiB0cnVlYFxuICAgICAgICAvLyBzaWxlbnRseTsgdGhlICFvdmVyd3JpdGUgcGF0aCBvdGhlcndpc2Ugb3BlbnMgYSBkaWFsb2cuXG4gICAgICAgIGlmICghYXJncy5vdmVyd3JpdGUpIHtcbiAgICAgICAgICAgIGNvbnN0IGV4aXN0aW5nID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktdXVpZCcsIHRhcmdldFBhdGgpO1xuICAgICAgICAgICAgaWYgKGV4aXN0aW5nKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoYFRhcmdldCAnJHt0YXJnZXRQYXRofScgYWxyZWFkeSBleGlzdHMuIFBhc3Mgb3ZlcndyaXRlOiB0cnVlIHRvIHJlcGxhY2UgaXQuYCwgeyBleGlzdGluZ1V1aWQ6IGV4aXN0aW5nIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgY29weVJlc3VsdDogYW55ID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdChcbiAgICAgICAgICAgICdhc3NldC1kYicsXG4gICAgICAgICAgICAnY29weS1hc3NldCcsXG4gICAgICAgICAgICBzb3VyY2VVcmwsXG4gICAgICAgICAgICB0YXJnZXRQYXRoLFxuICAgICAgICAgICAgeyBvdmVyd3JpdGU6ICEhYXJncy5vdmVyd3JpdGUgfSxcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKCFjb3B5UmVzdWx0IHx8ICFjb3B5UmVzdWx0LnV1aWQpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGBhc3NldC1kYiBjb3B5LWFzc2V0IHJldHVybmVkIG5vIHJlc3VsdCBmb3IgJHtzb3VyY2VVcmx9IC0+ICR7dGFyZ2V0UGF0aH0uYCk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBvcGVuQWZ0ZXIgPSBhcmdzLm9wZW5BZnRlciAhPT0gZmFsc2U7XG4gICAgICAgIGlmIChvcGVuQWZ0ZXIpIHtcbiAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ29wZW4tc2NlbmUnLCBjb3B5UmVzdWx0LnV1aWQpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG9rKHtcbiAgICAgICAgICAgICAgICBzb3VyY2VVcmwsXG4gICAgICAgICAgICAgICAgbmV3VXVpZDogY29weVJlc3VsdC51dWlkLFxuICAgICAgICAgICAgICAgIG5ld1VybDogY29weVJlc3VsdC51cmwsXG4gICAgICAgICAgICAgICAgb3BlbmVkOiBvcGVuQWZ0ZXIsXG4gICAgICAgICAgICB9LCBgU2NlbmUgc2F2ZWQgYXMgJHtjb3B5UmVzdWx0LnVybH1gKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGNsb3NlU2NlbmVJbXBsKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnY2xvc2Utc2NlbmUnKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHVuZGVmaW5lZCwgJ1NjZW5lIGNsb3NlZCBzdWNjZXNzZnVsbHknKSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cbn1cbiJdfQ==