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
        description: '[specialist] Read the currently open scene root summary (name/uuid/type/active/nodeCount). No scene mutation; use to get the scene root UUID. Also exposed as resource cocos://scene/current; prefer the resource when the client supports MCP resources.',
        inputSchema: schema_1.z.object({}),
    })
], SceneTools.prototype, "getCurrentScene", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'get_scene_list',
        title: 'List scene assets',
        description: '[specialist] List .scene assets under db://assets with name/path/uuid. Does not open scenes or modify assets. Also exposed as resource cocos://scene/list.',
        inputSchema: schema_1.z.object({}),
    })
], SceneTools.prototype, "getSceneList", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'open_scene',
        title: 'Open scene by path',
        description: '[specialist] Open a scene by db:// path. Switches the active Editor scene; save current edits first if needed.',
        inputSchema: schema_1.z.object({
            scenePath: schema_1.z.string().describe('Scene db:// path to open, e.g. db://assets/scenes/Main.scene. The tool resolves UUID first.'),
        }),
    })
], SceneTools.prototype, "openScene", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'save_scene',
        title: 'Save current scene',
        description: '[specialist] Save the currently open scene back to its scene asset. Mutates the project file on disk.',
        inputSchema: schema_1.z.object({}),
    })
], SceneTools.prototype, "saveScene", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'create_scene',
        title: 'Create scene asset',
        description: '[specialist] Create a new .scene asset. Mutates asset-db; non-empty templates also open the new scene and populate standard Camera/Canvas or Camera/Light nodes.',
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
        description: '[specialist] Copy the currently open scene to a new .scene asset. Saves current scene first; optionally opens the copy and can overwrite when requested.',
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
        description: '[specialist] Close the current scene. Editor state side effect; save first if unsaved changes matter.',
        inputSchema: schema_1.z.object({}),
    })
], SceneTools.prototype, "closeScene", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'get_scene_hierarchy',
        title: 'Read scene hierarchy',
        description: '[specialist] Read the complete current scene node hierarchy. No mutation; use for UUID/path lookup, optionally with component summaries. Also exposed as resource cocos://scene/hierarchy (defaults: includeComponents=false); prefer the resource for full-tree reads.',
        inputSchema: schema_1.z.object({
            includeComponents: schema_1.z.boolean().default(false).describe('Include component type/enabled summaries on each node. Increases response size.'),
        }),
    })
], SceneTools.prototype, "getSceneHierarchy", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NlbmUtdG9vbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvdG9vbHMvc2NlbmUtdG9vbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7O0FBQUEsOENBQTJDO0FBRTNDLDBDQUFrQztBQUNsQyxrREFBdUU7QUFDdkUsc0RBQXFEO0FBQ3JELHVEQUFtRDtBQUNuRCxvQ0FBc0M7QUFFdEMsTUFBTSxXQUFXLEdBQUcsUUFBUSxDQUFDO0FBRTdCLE1BQWEsVUFBVTtJQUduQjtRQWlMUSxtQkFBYyxHQUFHLElBQUksZ0NBQWMsRUFBRSxDQUFDO1FBaEwxQyxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUEsc0NBQXlCLEVBQUMsSUFBSSxDQUFDLENBQUM7SUFDaEQsQ0FBQztJQUVELFFBQVEsS0FBdUIsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUM3RCxPQUFPLENBQUMsUUFBZ0IsRUFBRSxJQUFTLElBQTJCLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztJQVFuRyxBQUFOLEtBQUssQ0FBQyxlQUFlO1FBQ2pCLE9BQU8sSUFBSSxDQUFDLG1CQUFtQixFQUFFLENBQUM7SUFDdEMsQ0FBQztJQVFLLEFBQU4sS0FBSyxDQUFDLFlBQVk7UUFDZCxPQUFPLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO0lBQ25DLENBQUM7SUFVSyxBQUFOLEtBQUssQ0FBQyxTQUFTLENBQUMsSUFBMkI7UUFDdkMsT0FBTyxJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUM5QyxDQUFDO0lBUUssQUFBTixLQUFLLENBQUMsU0FBUztRQUNYLE9BQU8sSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO0lBQ2hDLENBQUM7SUFrQkssQUFBTixLQUFLLENBQUMsV0FBVyxDQUFDLElB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TyxDQUFDLElBQUksQ0FBQyxDQUFDLFFBQVEsQ0FBQyw4R0FBOEcsQ0FBQztZQUM3SixTQUFTLEVBQUUsVUFBQyxDQUFDLE9BQU8sRUFBRSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxRQUFRLENBQUMsK0dBQStHLENBQUM7U0FDbEssQ0FBQztLQUNMLENBQUM7NkNBR0Q7QUFRSztJQU5MLElBQUEsb0JBQU8sRUFBQztRQUNMLElBQUksRUFBRSxhQUFhO1FBQ25CLEtBQUssRUFBRSxxQkFBcUI7UUFDNUIsV0FBVyxFQUFFLHVHQUF1RztRQUNwSCxXQUFXLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7S0FDNUIsQ0FBQzs0Q0FHRDtBQVVLO0lBUkwsSUFBQSxvQkFBTyxFQUFDO1FBQ0wsSUFBSSxFQUFFLHFCQUFxQjtRQUMzQixLQUFLLEVBQUUsc0JBQXNCO1FBQzdCLFdBQVcsRUFBRSx5UUFBeVE7UUFDdFIsV0FBVyxFQUFFLFVBQUMsQ0FBQyxNQUFNLENBQUM7WUFDbEIsaUJBQWlCLEVBQUUsVUFBQyxDQUFDLE9BQU8sRUFBRSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxRQUFRLENBQUMsaUZBQWlGLENBQUM7U0FDNUksQ0FBQztLQUNMLENBQUM7bURBR0QiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBvaywgZmFpbCB9IGZyb20gJy4uL2xpYi9yZXNwb25zZSc7XG5pbXBvcnQgdHlwZSB7IFRvb2xEZWZpbml0aW9uLCBUb29sUmVzcG9uc2UsIFRvb2xFeGVjdXRvciwgU2NlbmVJbmZvIH0gZnJvbSAnLi4vdHlwZXMnO1xuaW1wb3J0IHsgeiB9IGZyb20gJy4uL2xpYi9zY2hlbWEnO1xuaW1wb3J0IHsgbWNwVG9vbCwgZGVmaW5lVG9vbHNGcm9tRGVjb3JhdG9ycyB9IGZyb20gJy4uL2xpYi9kZWNvcmF0b3JzJztcbmltcG9ydCB7IHJ1blNjZW5lTWV0aG9kIH0gZnJvbSAnLi4vbGliL3NjZW5lLWJyaWRnZSc7XG5pbXBvcnQgeyBDb21wb25lbnRUb29scyB9IGZyb20gJy4vY29tcG9uZW50LXRvb2xzJztcbmltcG9ydCB7IGRlYnVnTG9nIH0gZnJvbSAnLi4vbGliL2xvZyc7XG5cbmNvbnN0IExBWUVSX1VJXzJEID0gMzM1NTQ0MzI7XG5cbmV4cG9ydCBjbGFzcyBTY2VuZVRvb2xzIGltcGxlbWVudHMgVG9vbEV4ZWN1dG9yIHtcbiAgICBwcml2YXRlIHJlYWRvbmx5IGV4ZWM6IFRvb2xFeGVjdXRvcjtcblxuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICB0aGlzLmV4ZWMgPSBkZWZpbmVUb29sc0Zyb21EZWNvcmF0b3JzKHRoaXMpO1xuICAgIH1cblxuICAgIGdldFRvb2xzKCk6IFRvb2xEZWZpbml0aW9uW10geyByZXR1cm4gdGhpcy5leGVjLmdldFRvb2xzKCk7IH1cbiAgICBleGVjdXRlKHRvb2xOYW1lOiBzdHJpbmcsIGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7IHJldHVybiB0aGlzLmV4ZWMuZXhlY3V0ZSh0b29sTmFtZSwgYXJncyk7IH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ2dldF9jdXJyZW50X3NjZW5lJyxcbiAgICAgICAgdGl0bGU6ICdSZWFkIGN1cnJlbnQgc2NlbmUnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBSZWFkIHRoZSBjdXJyZW50bHkgb3BlbiBzY2VuZSByb290IHN1bW1hcnkgKG5hbWUvdXVpZC90eXBlL2FjdGl2ZS9ub2RlQ291bnQpLiBObyBzY2VuZSBtdXRhdGlvbjsgdXNlIHRvIGdldCB0aGUgc2NlbmUgcm9vdCBVVUlELiBBbHNvIGV4cG9zZWQgYXMgcmVzb3VyY2UgY29jb3M6Ly9zY2VuZS9jdXJyZW50OyBwcmVmZXIgdGhlIHJlc291cmNlIHdoZW4gdGhlIGNsaWVudCBzdXBwb3J0cyBNQ1AgcmVzb3VyY2VzLicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksXG4gICAgfSlcbiAgICBhc3luYyBnZXRDdXJyZW50U2NlbmUoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0Q3VycmVudFNjZW5lSW1wbCgpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ2dldF9zY2VuZV9saXN0JyxcbiAgICAgICAgdGl0bGU6ICdMaXN0IHNjZW5lIGFzc2V0cycsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIExpc3QgLnNjZW5lIGFzc2V0cyB1bmRlciBkYjovL2Fzc2V0cyB3aXRoIG5hbWUvcGF0aC91dWlkLiBEb2VzIG5vdCBvcGVuIHNjZW5lcyBvciBtb2RpZnkgYXNzZXRzLiBBbHNvIGV4cG9zZWQgYXMgcmVzb3VyY2UgY29jb3M6Ly9zY2VuZS9saXN0LicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksXG4gICAgfSlcbiAgICBhc3luYyBnZXRTY2VuZUxpc3QoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0U2NlbmVMaXN0SW1wbCgpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ29wZW5fc2NlbmUnLFxuICAgICAgICB0aXRsZTogJ09wZW4gc2NlbmUgYnkgcGF0aCcsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIE9wZW4gYSBzY2VuZSBieSBkYjovLyBwYXRoLiBTd2l0Y2hlcyB0aGUgYWN0aXZlIEVkaXRvciBzY2VuZTsgc2F2ZSBjdXJyZW50IGVkaXRzIGZpcnN0IGlmIG5lZWRlZC4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgc2NlbmVQYXRoOiB6LnN0cmluZygpLmRlc2NyaWJlKCdTY2VuZSBkYjovLyBwYXRoIHRvIG9wZW4sIGUuZy4gZGI6Ly9hc3NldHMvc2NlbmVzL01haW4uc2NlbmUuIFRoZSB0b29sIHJlc29sdmVzIFVVSUQgZmlyc3QuJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgb3BlblNjZW5lKGFyZ3M6IHsgc2NlbmVQYXRoOiBzdHJpbmcgfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLm9wZW5TY2VuZUltcGwoYXJncy5zY2VuZVBhdGgpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ3NhdmVfc2NlbmUnLFxuICAgICAgICB0aXRsZTogJ1NhdmUgY3VycmVudCBzY2VuZScsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFNhdmUgdGhlIGN1cnJlbnRseSBvcGVuIHNjZW5lIGJhY2sgdG8gaXRzIHNjZW5lIGFzc2V0LiBNdXRhdGVzIHRoZSBwcm9qZWN0IGZpbGUgb24gZGlzay4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pLFxuICAgIH0pXG4gICAgYXN5bmMgc2F2ZVNjZW5lKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLnNhdmVTY2VuZUltcGwoKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdjcmVhdGVfc2NlbmUnLFxuICAgICAgICB0aXRsZTogJ0NyZWF0ZSBzY2VuZSBhc3NldCcsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIENyZWF0ZSBhIG5ldyAuc2NlbmUgYXNzZXQuIE11dGF0ZXMgYXNzZXQtZGI7IG5vbi1lbXB0eSB0ZW1wbGF0ZXMgYWxzbyBvcGVuIHRoZSBuZXcgc2NlbmUgYW5kIHBvcHVsYXRlIHN0YW5kYXJkIENhbWVyYS9DYW52YXMgb3IgQ2FtZXJhL0xpZ2h0IG5vZGVzLicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICBzY2VuZU5hbWU6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ05ldyBzY2VuZSBuYW1lOyB3cml0dGVuIGludG8gdGhlIGNyZWF0ZWQgY2MuU2NlbmVBc3NldCAvIGNjLlNjZW5lLicpLFxuICAgICAgICAgICAgc2F2ZVBhdGg6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1RhcmdldCBzY2VuZSBsb2NhdGlvbi4gUGFzcyBhIGZ1bGwgLnNjZW5lIHBhdGggb3IgYSBmb2xkZXIgcGF0aCB0byBhcHBlbmQgc2NlbmVOYW1lLnNjZW5lLicpLFxuICAgICAgICAgICAgdGVtcGxhdGU6IHouZW51bShbJ2VtcHR5JywgJzJkLXVpJywgJzNkLWJhc2ljJ10pLmRlZmF1bHQoJ2VtcHR5JykuZGVzY3JpYmUoXG4gICAgICAgICAgICAgICAgJ0J1aWx0LWluIHNjYWZmb2xkaW5nIGZvciB0aGUgbmV3IHNjZW5lLiAnICtcbiAgICAgICAgICAgICAgICAnXCJlbXB0eVwiIChkZWZhdWx0KTogYmFyZSBzY2VuZSByb290IG9ubHkg4oCUIGN1cnJlbnQgYmVoYXZpb3IuICcgK1xuICAgICAgICAgICAgICAgICdcIjJkLXVpXCI6IENhbWVyYSAoY2MuQ2FtZXJhLCBvcnRobyBwcm9qZWN0aW9uKSArIENhbnZhcyAoY2MuVUlUcmFuc2Zvcm0gKyBjYy5DYW52YXMgd2l0aCBjYW1lcmFDb21wb25lbnQgbGlua2VkLCBsYXllciBVSV8yRCkgc28gVUkgbm9kZXMgcmVuZGVyIGltbWVkaWF0ZWx5IHVuZGVyIHRoZSBVSSBjYW1lcmEuICcgK1xuICAgICAgICAgICAgICAgICdcIjNkLWJhc2ljXCI6IENhbWVyYSAocGVyc3BlY3RpdmUpICsgRGlyZWN0aW9uYWxMaWdodCBhdCBzY2VuZSByb290LiAnICtcbiAgICAgICAgICAgICAgICAn4pqg77iPIFNpZGUgZWZmZWN0OiB3aGVuIHRlbXBsYXRlIGlzIG5vdCBcImVtcHR5XCIgdGhlIGVkaXRvciBvcGVucyB0aGUgbmV3bHkgY3JlYXRlZCBzY2VuZSB0byBwb3B1bGF0ZSBpdC4gU2F2ZSB5b3VyIGN1cnJlbnQgc2NlbmUgZmlyc3QgaWYgaXQgaGFzIHVuc2F2ZWQgY2hhbmdlcy4nXG4gICAgICAgICAgICApLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIGNyZWF0ZVNjZW5lKGFyZ3M6IHsgc2NlbmVOYW1lOiBzdHJpbmc7IHNhdmVQYXRoOiBzdHJpbmc7IHRlbXBsYXRlOiAnZW1wdHknIHwgJzJkLXVpJyB8ICczZC1iYXNpYycgfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLmNyZWF0ZVNjZW5lSW1wbChhcmdzLnNjZW5lTmFtZSwgYXJncy5zYXZlUGF0aCwgYXJncy50ZW1wbGF0ZSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnc2F2ZV9zY2VuZV9hcycsXG4gICAgICAgIHRpdGxlOiAnQ29weSBzY2VuZSBhc3NldCcsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIENvcHkgdGhlIGN1cnJlbnRseSBvcGVuIHNjZW5lIHRvIGEgbmV3IC5zY2VuZSBhc3NldC4gU2F2ZXMgY3VycmVudCBzY2VuZSBmaXJzdDsgb3B0aW9uYWxseSBvcGVucyB0aGUgY29weSBhbmQgY2FuIG92ZXJ3cml0ZSB3aGVuIHJlcXVlc3RlZC4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgcGF0aDogei5zdHJpbmcoKS5kZXNjcmliZSgnVGFyZ2V0IGRiOi8vIHBhdGggZm9yIHRoZSBuZXcgc2NlbmUgZmlsZSAoZS5nLiBcImRiOi8vYXNzZXRzL3NjZW5lcy9Db3B5LnNjZW5lXCIpLiBUaGUgXCIuc2NlbmVcIiBleHRlbnNpb24gaXMgYXBwZW5kZWQgaWYgbWlzc2luZy4nKSxcbiAgICAgICAgICAgIG9wZW5BZnRlcjogei5ib29sZWFuKCkuZGVmYXVsdCh0cnVlKS5kZXNjcmliZSgnT3BlbiB0aGUgbmV3bHktc2F2ZWQgc2NlbmUgcmlnaHQgYWZ0ZXIgdGhlIGNvcHkuIERlZmF1bHQgdHJ1ZS4gUGFzcyBmYWxzZSB0byBrZWVwIHRoZSBjdXJyZW50IHNjZW5lIGZvY3VzZWQuJyksXG4gICAgICAgICAgICBvdmVyd3JpdGU6IHouYm9vbGVhbigpLmRlZmF1bHQoZmFsc2UpLmRlc2NyaWJlKCdPdmVyd3JpdGUgdGhlIHRhcmdldCBmaWxlIGlmIGl0IGFscmVhZHkgZXhpc3RzLiBEZWZhdWx0IGZhbHNlOyB3aXRoIGZhbHNlLCBhIG5hbWUgY29sbGlzaW9uIHJldHVybnMgYW4gZXJyb3IuJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgc2F2ZVNjZW5lQXMoYXJnczogeyBwYXRoOiBzdHJpbmc7IG9wZW5BZnRlcj86IGJvb2xlYW47IG92ZXJ3cml0ZT86IGJvb2xlYW4gfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLnNhdmVTY2VuZUFzSW1wbChhcmdzKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdjbG9zZV9zY2VuZScsXG4gICAgICAgIHRpdGxlOiAnQ2xvc2UgY3VycmVudCBzY2VuZScsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIENsb3NlIHRoZSBjdXJyZW50IHNjZW5lLiBFZGl0b3Igc3RhdGUgc2lkZSBlZmZlY3Q7IHNhdmUgZmlyc3QgaWYgdW5zYXZlZCBjaGFuZ2VzIG1hdHRlci4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pLFxuICAgIH0pXG4gICAgYXN5bmMgY2xvc2VTY2VuZSgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5jbG9zZVNjZW5lSW1wbCgpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ2dldF9zY2VuZV9oaWVyYXJjaHknLFxuICAgICAgICB0aXRsZTogJ1JlYWQgc2NlbmUgaGllcmFyY2h5JyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gUmVhZCB0aGUgY29tcGxldGUgY3VycmVudCBzY2VuZSBub2RlIGhpZXJhcmNoeS4gTm8gbXV0YXRpb247IHVzZSBmb3IgVVVJRC9wYXRoIGxvb2t1cCwgb3B0aW9uYWxseSB3aXRoIGNvbXBvbmVudCBzdW1tYXJpZXMuIEFsc28gZXhwb3NlZCBhcyByZXNvdXJjZSBjb2NvczovL3NjZW5lL2hpZXJhcmNoeSAoZGVmYXVsdHM6IGluY2x1ZGVDb21wb25lbnRzPWZhbHNlKTsgcHJlZmVyIHRoZSByZXNvdXJjZSBmb3IgZnVsbC10cmVlIHJlYWRzLicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICBpbmNsdWRlQ29tcG9uZW50czogei5ib29sZWFuKCkuZGVmYXVsdChmYWxzZSkuZGVzY3JpYmUoJ0luY2x1ZGUgY29tcG9uZW50IHR5cGUvZW5hYmxlZCBzdW1tYXJpZXMgb24gZWFjaCBub2RlLiBJbmNyZWFzZXMgcmVzcG9uc2Ugc2l6ZS4nKSxcbiAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBnZXRTY2VuZUhpZXJhcmNoeShhcmdzOiB7IGluY2x1ZGVDb21wb25lbnRzPzogYm9vbGVhbiB9KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0U2NlbmVIaWVyYXJjaHlJbXBsKGFyZ3MuaW5jbHVkZUNvbXBvbmVudHMpO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2V0Q3VycmVudFNjZW5lSW1wbCgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIC8vIOebtOaOpeS9v+eUqCBxdWVyeS1ub2RlLXRyZWUg5L6G542y5Y+W5aC05pmv5L+h5oGv77yI6YCZ5YCL5pa55rOV5bey57aT6amX6K2J5Y+v55So77yJXG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1ub2RlLXRyZWUnKS50aGVuKCh0cmVlOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAodHJlZSAmJiB0cmVlLnV1aWQpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogdHJlZS5uYW1lIHx8ICdDdXJyZW50IFNjZW5lJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiB0cmVlLnV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogdHJlZS50eXBlIHx8ICdjYy5TY2VuZScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYWN0aXZlOiB0cmVlLmFjdGl2ZSAhPT0gdW5kZWZpbmVkID8gdHJlZS5hY3RpdmUgOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5vZGVDb3VudDogdHJlZS5jaGlsZHJlbiA/IHRyZWUuY2hpbGRyZW4ubGVuZ3RoIDogMFxuICAgICAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbCgnTm8gc2NlbmUgZGF0YSBhdmFpbGFibGUnKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICAvLyDlgpnnlKjmlrnmoYjvvJrkvb/nlKjloLTmma/ohbPmnKxcbiAgICAgICAgICAgICAgICBydW5TY2VuZU1ldGhvZCgnZ2V0Q3VycmVudFNjZW5lSW5mbycsIFtdKS50aGVuKChyZXN1bHQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgfSkuY2F0Y2goKGVycjI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChgRGlyZWN0IEFQSSBmYWlsZWQ6ICR7ZXJyLm1lc3NhZ2V9LCBTY2VuZSBzY3JpcHQgZmFpbGVkOiAke2VycjIubWVzc2FnZX1gKSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRTY2VuZUxpc3RJbXBsKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgLy8gTm90ZTogcXVlcnktYXNzZXRzIEFQSSBjb3JyZWN0ZWQgd2l0aCBwcm9wZXIgcGFyYW1ldGVyc1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXRzJywge1xuICAgICAgICAgICAgICAgIHBhdHRlcm46ICdkYjovL2Fzc2V0cy8qKi8qLnNjZW5lJ1xuICAgICAgICAgICAgfSkudGhlbigocmVzdWx0czogYW55W10pID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBzY2VuZXM6IFNjZW5lSW5mb1tdID0gcmVzdWx0cy5tYXAoYXNzZXQgPT4gKHtcbiAgICAgICAgICAgICAgICAgICAgbmFtZTogYXNzZXQubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgcGF0aDogYXNzZXQudXJsLFxuICAgICAgICAgICAgICAgICAgICB1dWlkOiBhc3NldC51dWlkXG4gICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2soc2NlbmVzKSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgb3BlblNjZW5lSW1wbChzY2VuZVBhdGg6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgLy8g6aaW5YWI542y5Y+W5aC05pmv55qEVVVJRFxuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktdXVpZCcsIHNjZW5lUGF0aCkudGhlbigodXVpZDogc3RyaW5nIHwgbnVsbCkgPT4ge1xuICAgICAgICAgICAgICAgIGlmICghdXVpZCkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1NjZW5lIG5vdCBmb3VuZCcpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAvLyDkvb/nlKjmraPnorrnmoQgc2NlbmUgQVBJIOaJk+mWi+WgtOaZryAo6ZyA6KaBVVVJRClcbiAgICAgICAgICAgICAgICByZXR1cm4gRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnb3Blbi1zY2VuZScsIHV1aWQpO1xuICAgICAgICAgICAgfSkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh1bmRlZmluZWQsIGBTY2VuZSBvcGVuZWQ6ICR7c2NlbmVQYXRofWApKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBzYXZlU2NlbmVJbXBsKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnc2F2ZS1zY2VuZScpLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2sodW5kZWZpbmVkLCAnU2NlbmUgc2F2ZWQgc3VjY2Vzc2Z1bGx5JykpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGNvbXBvbmVudFRvb2xzID0gbmV3IENvbXBvbmVudFRvb2xzKCk7XG5cbiAgICBwcml2YXRlIGFzeW5jIGNyZWF0ZVNjZW5lSW1wbChzY2VuZU5hbWU6IHN0cmluZywgc2F2ZVBhdGg6IHN0cmluZywgdGVtcGxhdGU6ICdlbXB0eScgfCAnMmQtdWknIHwgJzNkLWJhc2ljJyA9ICdlbXB0eScpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIC8vIOeiuuS/nei3r+W+keS7pS5zY2VuZee1kOWwvlxuICAgICAgICAgICAgY29uc3QgZnVsbFBhdGggPSBzYXZlUGF0aC5lbmRzV2l0aCgnLnNjZW5lJykgPyBzYXZlUGF0aCA6IGAke3NhdmVQYXRofS8ke3NjZW5lTmFtZX0uc2NlbmVgO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyDkvb/nlKjmraPnorrnmoRDb2NvcyBDcmVhdG9yIDMuOOWgtOaZr+agvOW8j1xuICAgICAgICAgICAgY29uc3Qgc2NlbmVDb250ZW50ID0gSlNPTi5zdHJpbmdpZnkoW1xuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCJfX3R5cGVfX1wiOiBcImNjLlNjZW5lQXNzZXRcIixcbiAgICAgICAgICAgICAgICAgICAgXCJfbmFtZVwiOiBzY2VuZU5hbWUsXG4gICAgICAgICAgICAgICAgICAgIFwiX29iakZsYWdzXCI6IDAsXG4gICAgICAgICAgICAgICAgICAgIFwiX19lZGl0b3JFeHRyYXNfX1wiOiB7fSxcbiAgICAgICAgICAgICAgICAgICAgXCJfbmF0aXZlXCI6IFwiXCIsXG4gICAgICAgICAgICAgICAgICAgIFwic2NlbmVcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJfX2lkX19cIjogMVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIFwiX190eXBlX19cIjogXCJjYy5TY2VuZVwiLFxuICAgICAgICAgICAgICAgICAgICBcIl9uYW1lXCI6IHNjZW5lTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgXCJfb2JqRmxhZ3NcIjogMCxcbiAgICAgICAgICAgICAgICAgICAgXCJfX2VkaXRvckV4dHJhc19fXCI6IHt9LFxuICAgICAgICAgICAgICAgICAgICBcIl9wYXJlbnRcIjogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgXCJfY2hpbGRyZW5cIjogW10sXG4gICAgICAgICAgICAgICAgICAgIFwiX2FjdGl2ZVwiOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBcIl9jb21wb25lbnRzXCI6IFtdLFxuICAgICAgICAgICAgICAgICAgICBcIl9wcmVmYWJcIjogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgXCJfbHBvc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcIl9fdHlwZV9fXCI6IFwiY2MuVmVjM1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ4XCI6IDAsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInlcIjogMCxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwielwiOiAwXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIFwiX2xyb3RcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJfX3R5cGVfX1wiOiBcImNjLlF1YXRcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIFwieFwiOiAwLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ5XCI6IDAsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInpcIjogMCxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwid1wiOiAxXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIFwiX2xzY2FsZVwiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcIl9fdHlwZV9fXCI6IFwiY2MuVmVjM1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ4XCI6IDEsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInlcIjogMSxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwielwiOiAxXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIFwiX21vYmlsaXR5XCI6IDAsXG4gICAgICAgICAgICAgICAgICAgIFwiX2xheWVyXCI6IDEwNzM3NDE4MjQsXG4gICAgICAgICAgICAgICAgICAgIFwiX2V1bGVyXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiX190eXBlX19cIjogXCJjYy5WZWMzXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInhcIjogMCxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwieVwiOiAwLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ6XCI6IDBcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgXCJhdXRvUmVsZWFzZUFzc2V0c1wiOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgXCJfZ2xvYmFsc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcIl9faWRfX1wiOiAyXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIFwiX2lkXCI6IFwic2NlbmVcIlxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcIl9fdHlwZV9fXCI6IFwiY2MuU2NlbmVHbG9iYWxzXCIsXG4gICAgICAgICAgICAgICAgICAgIFwiYW1iaWVudFwiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcIl9faWRfX1wiOiAzXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIFwic2t5Ym94XCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiX19pZF9fXCI6IDRcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgXCJmb2dcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJfX2lkX19cIjogNVxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICBcIm9jdHJlZVwiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcIl9faWRfX1wiOiA2XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCJfX3R5cGVfX1wiOiBcImNjLkFtYmllbnRJbmZvXCIsXG4gICAgICAgICAgICAgICAgICAgIFwiX3NreUNvbG9ySERSXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiX190eXBlX19cIjogXCJjYy5WZWM0XCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInhcIjogMC4yLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ5XCI6IDAuNSxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwielwiOiAwLjgsXG4gICAgICAgICAgICAgICAgICAgICAgICBcIndcIjogMC41MjA4MzNcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgXCJfc2t5Q29sb3JcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJfX3R5cGVfX1wiOiBcImNjLlZlYzRcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIFwieFwiOiAwLjIsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInlcIjogMC41LFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ6XCI6IDAuOCxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwid1wiOiAwLjUyMDgzM1xuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICBcIl9za3lJbGx1bUhEUlwiOiAyMDAwMCxcbiAgICAgICAgICAgICAgICAgICAgXCJfc2t5SWxsdW1cIjogMjAwMDAsXG4gICAgICAgICAgICAgICAgICAgIFwiX2dyb3VuZEFsYmVkb0hEUlwiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcIl9fdHlwZV9fXCI6IFwiY2MuVmVjNFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ4XCI6IDAuMixcbiAgICAgICAgICAgICAgICAgICAgICAgIFwieVwiOiAwLjIsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInpcIjogMC4yLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ3XCI6IDFcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgXCJfZ3JvdW5kQWxiZWRvXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiX190eXBlX19cIjogXCJjYy5WZWM0XCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInhcIjogMC4yLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ5XCI6IDAuMixcbiAgICAgICAgICAgICAgICAgICAgICAgIFwielwiOiAwLjIsXG4gICAgICAgICAgICAgICAgICAgICAgICBcIndcIjogMVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIFwiX190eXBlX19cIjogXCJjYy5Ta3lib3hJbmZvXCIsXG4gICAgICAgICAgICAgICAgICAgIFwiX2VudkxpZ2h0aW5nVHlwZVwiOiAwLFxuICAgICAgICAgICAgICAgICAgICBcIl9lbnZtYXBIRFJcIjogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgXCJfZW52bWFwXCI6IG51bGwsXG4gICAgICAgICAgICAgICAgICAgIFwiX2Vudm1hcExvZENvdW50XCI6IDAsXG4gICAgICAgICAgICAgICAgICAgIFwiX2RpZmZ1c2VNYXBIRFJcIjogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgXCJfZGlmZnVzZU1hcFwiOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICBcIl9lbmFibGVkXCI6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICBcIl91c2VIRFJcIjogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgXCJfZWRpdGFibGVNYXRlcmlhbFwiOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICBcIl9yZWZsZWN0aW9uSERSXCI6IG51bGwsXG4gICAgICAgICAgICAgICAgICAgIFwiX3JlZmxlY3Rpb25NYXBcIjogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgXCJfcm90YXRpb25BbmdsZVwiOiAwXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIFwiX190eXBlX19cIjogXCJjYy5Gb2dJbmZvXCIsXG4gICAgICAgICAgICAgICAgICAgIFwiX3R5cGVcIjogMCxcbiAgICAgICAgICAgICAgICAgICAgXCJfZm9nQ29sb3JcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJfX3R5cGVfX1wiOiBcImNjLkNvbG9yXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInJcIjogMjAwLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJnXCI6IDIwMCxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiYlwiOiAyMDAsXG4gICAgICAgICAgICAgICAgICAgICAgICBcImFcIjogMjU1XG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIFwiX2VuYWJsZWRcIjogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIFwiX2ZvZ0RlbnNpdHlcIjogMC4zLFxuICAgICAgICAgICAgICAgICAgICBcIl9mb2dTdGFydFwiOiAwLjUsXG4gICAgICAgICAgICAgICAgICAgIFwiX2ZvZ0VuZFwiOiAzMDAsXG4gICAgICAgICAgICAgICAgICAgIFwiX2ZvZ0F0dGVuXCI6IDUsXG4gICAgICAgICAgICAgICAgICAgIFwiX2ZvZ1RvcFwiOiAxLjUsXG4gICAgICAgICAgICAgICAgICAgIFwiX2ZvZ1JhbmdlXCI6IDEuMixcbiAgICAgICAgICAgICAgICAgICAgXCJfYWNjdXJhdGVcIjogZmFsc2VcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCJfX3R5cGVfX1wiOiBcImNjLk9jdHJlZUluZm9cIixcbiAgICAgICAgICAgICAgICAgICAgXCJfZW5hYmxlZFwiOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgXCJfbWluUG9zXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiX190eXBlX19cIjogXCJjYy5WZWMzXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInhcIjogLTEwMjQsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInlcIjogLTEwMjQsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInpcIjogLTEwMjRcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgXCJfbWF4UG9zXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiX190eXBlX19cIjogXCJjYy5WZWMzXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInhcIjogMTAyNCxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwieVwiOiAxMDI0LFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ6XCI6IDEwMjRcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgXCJfZGVwdGhcIjogOFxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIF0sIG51bGwsIDIpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdjcmVhdGUtYXNzZXQnLCBmdWxsUGF0aCwgc2NlbmVDb250ZW50KS50aGVuKGFzeW5jIChyZXN1bHQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmICh0ZW1wbGF0ZSA9PT0gJ2VtcHR5Jykge1xuICAgICAgICAgICAgICAgICAgICAvLyBFeGlzdGluZyBwYXRoOiB2ZXJpZnkgYW5kIHJldHVybi5cbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHNjZW5lTGlzdCA9IGF3YWl0IHRoaXMuZ2V0U2NlbmVMaXN0SW1wbCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY3JlYXRlZFNjZW5lID0gc2NlbmVMaXN0LmRhdGE/LmZpbmQoKHNjZW5lOiBhbnkpID0+IHNjZW5lLnV1aWQgPT09IHJlc3VsdC51dWlkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiByZXN1bHQudXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdXJsOiByZXN1bHQudXJsLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBuYW1lOiBzY2VuZU5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRlbXBsYXRlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgU2NlbmUgJyR7c2NlbmVOYW1lfScgY3JlYXRlZCBzdWNjZXNzZnVsbHlgLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzY2VuZVZlcmlmaWVkOiAhIWNyZWF0ZWRTY2VuZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZlcmlmaWNhdGlvbkRhdGE6IGNyZWF0ZWRTY2VuZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiByZXN1bHQudXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdXJsOiByZXN1bHQudXJsLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBuYW1lOiBzY2VuZU5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRlbXBsYXRlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgU2NlbmUgJyR7c2NlbmVOYW1lfScgY3JlYXRlZCBzdWNjZXNzZnVsbHkgKHZlcmlmaWNhdGlvbiBmYWlsZWQpYCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIFRlbXBsYXRlIHBhdGg6IG9wZW4gdGhlIG5ld2x5LWNyZWF0ZWQgc2NlbmUgYXNzZXQgYW5kIGJha2UgdGhlXG4gICAgICAgICAgICAgICAgLy8gc3RhbmRhcmQgbm9kZXMvY29tcG9uZW50cyBvbiB0b3Agb2YgdGhlIGVtcHR5IHNjYWZmb2xkaW5nIHdlXG4gICAgICAgICAgICAgICAgLy8ganVzdCB3cm90ZS4gRG9uZSBob3N0LXNpZGUgdmlhIEVkaXRvci5NZXNzYWdlIHNvIGJlaGF2aW9yXG4gICAgICAgICAgICAgICAgLy8gbWF0Y2hlcyB3aGF0IHRoZSBJbnNwZWN0b3Igd291bGQgYnVpbGQgZm9yIFwiTmV3IDJEIC8gM0RcIi5cbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdvcGVuLXNjZW5lJywgcmVzdWx0LnV1aWQpO1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZSgocikgPT4gc2V0VGltZW91dChyLCA2MDApKTtcblxuICAgICAgICAgICAgICAgICAgICBjb25zdCB0cmVlOiBhbnkgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1ub2RlLXRyZWUnKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgc2NlbmVSb290VXVpZDogc3RyaW5nIHwgdW5kZWZpbmVkID0gdHJlZT8udXVpZDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFzY2VuZVJvb3RVdWlkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0NvdWxkIG5vdCByZXNvbHZlIHNjZW5lIHJvb3QgVVVJRCBhZnRlciBvcGVuLXNjZW5lJyk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBjb25zdCB0ZW1wbGF0ZURhdGEgPVxuICAgICAgICAgICAgICAgICAgICAgICAgdGVtcGxhdGUgPT09ICcyZC11aScgPyBhd2FpdCB0aGlzLmJ1aWxkVGVtcGxhdGUyRFVJKHNjZW5lUm9vdFV1aWQpXG4gICAgICAgICAgICAgICAgICAgICAgICA6IGF3YWl0IHRoaXMuYnVpbGRUZW1wbGF0ZTNEQmFzaWMoc2NlbmVSb290VXVpZCk7XG5cbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnc2F2ZS1zY2VuZScpO1xuXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IHJlc3VsdC51dWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHVybDogcmVzdWx0LnVybCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBuYW1lOiBzY2VuZU5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGVtcGxhdGUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGVtcGxhdGVOb2RlczogdGVtcGxhdGVEYXRhLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBTY2VuZSAnJHtzY2VuZU5hbWV9JyBjcmVhdGVkIHdpdGggdGVtcGxhdGUgJyR7dGVtcGxhdGV9Jy4gRWRpdG9yIHN3aXRjaGVkIHRvIHRoZSBuZXcgc2NlbmUuYCxcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoICh0ZW1wbGF0ZUVycjogYW55KSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChgU2NlbmUgYXNzZXQgY3JlYXRlZCBhdCAke3Jlc3VsdC51cmx9IGJ1dCB0ZW1wbGF0ZSBidWlsZCBmYWlsZWQ6ICR7dGVtcGxhdGVFcnI/Lm1lc3NhZ2UgPz8gdGVtcGxhdGVFcnJ9YCwgeyB1dWlkOiByZXN1bHQudXVpZCwgdXJsOiByZXN1bHQudXJsLCB0ZW1wbGF0ZSB9KSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBCdWlsZCBcIk5ldyAyRFwiIHNjYWZmb2xkaW5nIGluc2lkZSB0aGUgY3VycmVudGx5LW9wZW4gc2NlbmU6IENhbWVyYVxuICAgIC8vIChjYy5DYW1lcmEsIG9ydGhvKSArIENhbnZhcyAoY2MuVUlUcmFuc2Zvcm0gKyBjYy5DYW52YXMgd2l0aFxuICAgIC8vIGNhbWVyYUNvbXBvbmVudCBsaW5rZWQsIGxheWVyIFVJXzJEKS5cbiAgICBwcml2YXRlIGFzeW5jIGJ1aWxkVGVtcGxhdGUyRFVJKHNjZW5lUm9vdFV1aWQ6IHN0cmluZyk6IFByb21pc2U8eyBjYW1lcmFVdWlkOiBzdHJpbmc7IGNhbnZhc1V1aWQ6IHN0cmluZyB9PiB7XG4gICAgICAgIGNvbnN0IGNhbWVyYVV1aWQgPSBhd2FpdCB0aGlzLmNyZWF0ZU5vZGVXaXRoQ29tcG9uZW50cygnQ2FtZXJhJywgc2NlbmVSb290VXVpZCwgWydjYy5DYW1lcmEnXSk7XG4gICAgICAgIGF3YWl0IHRoaXMuZGVsYXkoMTUwKTtcbiAgICAgICAgY29uc3QgY2FtZXJhSWR4ID0gYXdhaXQgdGhpcy5maW5kQ29tcG9uZW50SW5kZXgoY2FtZXJhVXVpZCwgJ2NjLkNhbWVyYScpO1xuICAgICAgICBpZiAoY2FtZXJhSWR4ID49IDApIHtcbiAgICAgICAgICAgIC8vIDAgPSBPUlRITywgMSA9IFBFUlNQRUNUSVZFXG4gICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdzZXQtcHJvcGVydHknLCB7XG4gICAgICAgICAgICAgICAgdXVpZDogY2FtZXJhVXVpZCxcbiAgICAgICAgICAgICAgICBwYXRoOiBgX19jb21wc19fLiR7Y2FtZXJhSWR4fS5wcm9qZWN0aW9uYCxcbiAgICAgICAgICAgICAgICBkdW1wOiB7IHZhbHVlOiAwIH0sXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGNjLkNhbnZhcyByZXF1aXJlcyBjYy5VSVRyYW5zZm9ybTsgY29jb3MgYXV0by1hZGRzIGl0IHdoZW4gYWRkaW5nIGNjLkNhbnZhcy5cbiAgICAgICAgY29uc3QgY2FudmFzVXVpZCA9IGF3YWl0IHRoaXMuY3JlYXRlTm9kZVdpdGhDb21wb25lbnRzKCdDYW52YXMnLCBzY2VuZVJvb3RVdWlkLCBbJ2NjLkNhbnZhcyddKTtcbiAgICAgICAgYXdhaXQgdGhpcy5kZWxheSgxNTApO1xuXG4gICAgICAgIC8vIENhbnZhcyBpdHNlbGYgc2l0cyBvbiBVSV8yRCBzbyBpdCAoYW5kIGl0cyBkZXNjZW5kYW50cyBieSBpbmhlcml0YW5jZSB2aWFcbiAgICAgICAgLy8gY3JlYXRlX25vZGUgYXV0by1kZXRlY3Rpb24pIGFyZSB2aXNpYmxlIHRvIHRoZSBVSSBjYW1lcmEuXG4gICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3NldC1wcm9wZXJ0eScsIHtcbiAgICAgICAgICAgIHV1aWQ6IGNhbnZhc1V1aWQsXG4gICAgICAgICAgICBwYXRoOiAnbGF5ZXInLFxuICAgICAgICAgICAgZHVtcDogeyB2YWx1ZTogTEFZRVJfVUlfMkQgfSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gV2lyZSBDYW52YXMuY2FtZXJhQ29tcG9uZW50IOKGkiBDYW1lcmEgbm9kZS4gUmV1c2VzIHRoZSB2ZXJpZmllZFxuICAgICAgICAvLyBwcm9wZXJ0eVR5cGU6ICdjb21wb25lbnQnIGNvZGUgcGF0aCBzbyB3ZSBkbyBub3QgaGF2ZSB0byByZS1yZXNvbHZlXG4gICAgICAgIC8vIHRoZSBjb21wb25lbnQgc2NlbmUgX19pZF9fIGhlcmUuXG4gICAgICAgIGF3YWl0IHRoaXMuY29tcG9uZW50VG9vbHMuZXhlY3V0ZSgnc2V0X2NvbXBvbmVudF9wcm9wZXJ0eScsIHtcbiAgICAgICAgICAgIG5vZGVVdWlkOiBjYW52YXNVdWlkLFxuICAgICAgICAgICAgY29tcG9uZW50VHlwZTogJ2NjLkNhbnZhcycsXG4gICAgICAgICAgICBwcm9wZXJ0eTogJ2NhbWVyYUNvbXBvbmVudCcsXG4gICAgICAgICAgICBwcm9wZXJ0eVR5cGU6ICdjb21wb25lbnQnLFxuICAgICAgICAgICAgdmFsdWU6IGNhbWVyYVV1aWQsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiB7IGNhbWVyYVV1aWQsIGNhbnZhc1V1aWQgfTtcbiAgICB9XG5cbiAgICAvLyBCdWlsZCBcIk5ldyAzRFwiIHNjYWZmb2xkaW5nOiBDYW1lcmEgKHBlcnNwZWN0aXZlKSArIERpcmVjdGlvbmFsTGlnaHQuXG4gICAgcHJpdmF0ZSBhc3luYyBidWlsZFRlbXBsYXRlM0RCYXNpYyhzY2VuZVJvb3RVdWlkOiBzdHJpbmcpOiBQcm9taXNlPHsgY2FtZXJhVXVpZDogc3RyaW5nOyBsaWdodFV1aWQ6IHN0cmluZyB9PiB7XG4gICAgICAgIGNvbnN0IGNhbWVyYVV1aWQgPSBhd2FpdCB0aGlzLmNyZWF0ZU5vZGVXaXRoQ29tcG9uZW50cygnTWFpbiBDYW1lcmEnLCBzY2VuZVJvb3RVdWlkLCBbJ2NjLkNhbWVyYSddKTtcbiAgICAgICAgY29uc3QgbGlnaHRVdWlkID0gYXdhaXQgdGhpcy5jcmVhdGVOb2RlV2l0aENvbXBvbmVudHMoJ01haW4gTGlnaHQnLCBzY2VuZVJvb3RVdWlkLCBbJ2NjLkRpcmVjdGlvbmFsTGlnaHQnXSk7XG4gICAgICAgIGF3YWl0IHRoaXMuZGVsYXkoMTUwKTtcbiAgICAgICAgcmV0dXJuIHsgY2FtZXJhVXVpZCwgbGlnaHRVdWlkIH07XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBjcmVhdGVOb2RlV2l0aENvbXBvbmVudHMobmFtZTogc3RyaW5nLCBwYXJlbnQ6IHN0cmluZywgY29tcG9uZW50czogc3RyaW5nW10pOiBQcm9taXNlPHN0cmluZz4ge1xuICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdjcmVhdGUtbm9kZScsIHsgbmFtZSwgcGFyZW50IH0pO1xuICAgICAgICBjb25zdCB1dWlkID0gQXJyYXkuaXNBcnJheShyZXN1bHQpID8gcmVzdWx0WzBdIDogcmVzdWx0O1xuICAgICAgICBpZiAodHlwZW9mIHV1aWQgIT09ICdzdHJpbmcnIHx8ICF1dWlkKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYGNyZWF0ZS1ub2RlIHJldHVybmVkIG5vIFVVSUQgZm9yICR7bmFtZX1gKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBjcmVhdGUtbm9kZSBoYXMgbm8gYGNvbXBvbmVudHNgIGZpZWxkIG9uIHRoZSB0eXBlZCBDcmVhdGVOb2RlT3B0aW9ucyxcbiAgICAgICAgLy8gc28gd2lyZSBjb21wb25lbnRzIHZpYSB0aGUgZGVkaWNhdGVkIGNyZWF0ZS1jb21wb25lbnQgY2hhbm5lbC4gRWFjaFxuICAgICAgICAvLyBjYWxsIG5lZWRzIGEgc21hbGwgYnJlYXRoIGZvciB0aGUgZWRpdG9yIHRvIHNldHRsZSB0aGUgZHVtcC5cbiAgICAgICAgZm9yIChjb25zdCBjb21wb25lbnQgb2YgY29tcG9uZW50cykge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5kZWxheSg4MCk7XG4gICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdjcmVhdGUtY29tcG9uZW50JywgeyB1dWlkLCBjb21wb25lbnQgfSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHV1aWQ7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBmaW5kQ29tcG9uZW50SW5kZXgobm9kZVV1aWQ6IHN0cmluZywgY29tcG9uZW50VHlwZTogc3RyaW5nKTogUHJvbWlzZTxudW1iZXI+IHtcbiAgICAgICAgY29uc3QgZGF0YTogYW55ID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktbm9kZScsIG5vZGVVdWlkKTtcbiAgICAgICAgY29uc3QgY29tcHMgPSBBcnJheS5pc0FycmF5KGRhdGE/Ll9fY29tcHNfXykgPyBkYXRhLl9fY29tcHNfXyA6IFtdO1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGNvbXBzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCB0ID0gY29tcHNbaV0/Ll9fdHlwZV9fID8/IGNvbXBzW2ldPy50eXBlID8/IGNvbXBzW2ldPy5jaWQ7XG4gICAgICAgICAgICBpZiAodCA9PT0gY29tcG9uZW50VHlwZSkgcmV0dXJuIGk7XG4gICAgICAgIH1cbiAgICAgICAgZGVidWdMb2coYFtTY2VuZVRvb2xzXSBjb21wb25lbnQgJyR7Y29tcG9uZW50VHlwZX0nIG5vdCBmb3VuZCBvbiBub2RlICR7bm9kZVV1aWR9YCk7XG4gICAgICAgIHJldHVybiAtMTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGRlbGF5KG1zOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyKSA9PiBzZXRUaW1lb3V0KHIsIG1zKSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRTY2VuZUhpZXJhcmNoeUltcGwoaW5jbHVkZUNvbXBvbmVudHM6IGJvb2xlYW4gPSBmYWxzZSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgLy8g5YSq5YWI5ZqQ6Kmm5L2/55SoIEVkaXRvciBBUEkg5p+l6Kmi5aC05pmv56+A6bue5qi5XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1ub2RlLXRyZWUnKS50aGVuKCh0cmVlOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAodHJlZSkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBoaWVyYXJjaHkgPSB0aGlzLmJ1aWxkSGllcmFyY2h5KHRyZWUsIGluY2x1ZGVDb21wb25lbnRzKTtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShvayhoaWVyYXJjaHkpKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoJ05vIHNjZW5lIGhpZXJhcmNoeSBhdmFpbGFibGUnKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICAvLyDlgpnnlKjmlrnmoYjvvJrkvb/nlKjloLTmma/ohbPmnKxcbiAgICAgICAgICAgICAgICBydW5TY2VuZU1ldGhvZCgnZ2V0U2NlbmVIaWVyYXJjaHknLCBbaW5jbHVkZUNvbXBvbmVudHNdKS50aGVuKChyZXN1bHQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgfSkuY2F0Y2goKGVycjI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChgRGlyZWN0IEFQSSBmYWlsZWQ6ICR7ZXJyLm1lc3NhZ2V9LCBTY2VuZSBzY3JpcHQgZmFpbGVkOiAke2VycjIubWVzc2FnZX1gKSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBidWlsZEhpZXJhcmNoeShub2RlOiBhbnksIGluY2x1ZGVDb21wb25lbnRzOiBib29sZWFuKTogYW55IHtcbiAgICAgICAgY29uc3Qgbm9kZUluZm86IGFueSA9IHtcbiAgICAgICAgICAgIHV1aWQ6IG5vZGUudXVpZCxcbiAgICAgICAgICAgIG5hbWU6IG5vZGUubmFtZSxcbiAgICAgICAgICAgIHR5cGU6IG5vZGUudHlwZSxcbiAgICAgICAgICAgIGFjdGl2ZTogbm9kZS5hY3RpdmUsXG4gICAgICAgICAgICBjaGlsZHJlbjogW11cbiAgICAgICAgfTtcblxuICAgICAgICBpZiAoaW5jbHVkZUNvbXBvbmVudHMgJiYgbm9kZS5fX2NvbXBzX18pIHtcbiAgICAgICAgICAgIG5vZGVJbmZvLmNvbXBvbmVudHMgPSBub2RlLl9fY29tcHNfXy5tYXAoKGNvbXA6IGFueSkgPT4gKHtcbiAgICAgICAgICAgICAgICB0eXBlOiBjb21wLl9fdHlwZV9fIHx8ICdVbmtub3duJyxcbiAgICAgICAgICAgICAgICBlbmFibGVkOiBjb21wLmVuYWJsZWQgIT09IHVuZGVmaW5lZCA/IGNvbXAuZW5hYmxlZCA6IHRydWVcbiAgICAgICAgICAgIH0pKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChub2RlLmNoaWxkcmVuKSB7XG4gICAgICAgICAgICBub2RlSW5mby5jaGlsZHJlbiA9IG5vZGUuY2hpbGRyZW4ubWFwKChjaGlsZDogYW55KSA9PiBcbiAgICAgICAgICAgICAgICB0aGlzLmJ1aWxkSGllcmFyY2h5KGNoaWxkLCBpbmNsdWRlQ29tcG9uZW50cylcbiAgICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbm9kZUluZm87XG4gICAgfVxuXG4gICAgLy8gUHJvZ3JhbW1hdGljIHNhdmUtYXMuIFRoZSBjb2NvcyBgc2NlbmUvc2F2ZS1hcy1zY2VuZWAgY2hhbm5lbCBvbmx5IG9wZW5zXG4gICAgLy8gdGhlIG5hdGl2ZSBmaWxlIGRpYWxvZyAoYW5kIGJsb2NrcyB1bnRpbCB0aGUgdXNlciBkaXNtaXNzZXMgaXQg4oCUIHJvb3RcbiAgICAvLyBjYXVzZSBvZiB0aGUgPjE1cyB0aW1lb3V0IHJlcG9ydGVkIGluIEhBTkRPRkYpLCBzbyB3ZSBkbyBub3QgdXNlIGl0LlxuICAgIC8vIEluc3RlYWQ6IHNhdmUgdGhlIGN1cnJlbnQgc2NlbmUgdG8gZmx1c2ggZWRpdHMsIHJlc29sdmUgaXRzIGFzc2V0IHVybCxcbiAgICAvLyB0aGVuIGFzc2V0LWRiIGNvcHktYXNzZXQgdG8gdGhlIHRhcmdldCBwYXRoLiBPcHRpb25hbGx5IG9wZW4gdGhlIGNvcHkuXG4gICAgcHJpdmF0ZSBhc3luYyBzYXZlU2NlbmVBc0ltcGwoYXJnczogeyBwYXRoOiBzdHJpbmc7IG9wZW5BZnRlcj86IGJvb2xlYW47IG92ZXJ3cml0ZT86IGJvb2xlYW4gfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3NhdmUtc2NlbmUnKTtcblxuICAgICAgICBjb25zdCB0cmVlOiBhbnkgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1ub2RlLXRyZWUnKTtcbiAgICAgICAgY29uc3Qgc2NlbmVVdWlkOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB0cmVlPy51dWlkO1xuICAgICAgICBpZiAoIXNjZW5lVXVpZCkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ05vIHNjZW5lIGlzIGN1cnJlbnRseSBvcGVuLicpO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3Qgc291cmNlVXJsID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktdXJsJywgc2NlbmVVdWlkKTtcbiAgICAgICAgaWYgKCFzb3VyY2VVcmwpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKCdDdXJyZW50IHNjZW5lIGhhcyBubyBhc3NldCBwYXRoIG9uIGRpc2sgeWV0LiBTYXZlIGl0IG9uY2UgdmlhIHRoZSBDb2NvcyBVSSAob3IgdXNlIGNyZWF0ZV9zY2VuZSB0byB3cml0ZSBhIGJhY2tpbmcgZmlsZSkgYmVmb3JlIHNhdmVfc2NlbmVfYXMgY2FuIGNvcHkgaXQuJyk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCB0YXJnZXRQYXRoID0gYXJncy5wYXRoLmVuZHNXaXRoKCcuc2NlbmUnKSA/IGFyZ3MucGF0aCA6IGAke2FyZ3MucGF0aH0uc2NlbmVgO1xuXG4gICAgICAgIC8vIFByZS1jaGVjayBleGlzdGVuY2Ugc28gYSBjb2xsaXNpb24gcmV0dXJucyBhIGNsZWFuIGVycm9yXG4gICAgICAgIC8vIGluc3RlYWQgb2YgbGV0dGluZyBjb2NvcyBwb3AgYSBcImZpbGUgZXhpc3RzLCBvdmVyd3JpdGU/XCIgbW9kYWxcbiAgICAgICAgLy8gYW5kIGJsb2NrIG9uIHVzZXIgaW5wdXQuIGNvY29zIG9ubHkgcmVzcGVjdHMgYG92ZXJ3cml0ZTogdHJ1ZWBcbiAgICAgICAgLy8gc2lsZW50bHk7IHRoZSAhb3ZlcndyaXRlIHBhdGggb3RoZXJ3aXNlIG9wZW5zIGEgZGlhbG9nLlxuICAgICAgICBpZiAoIWFyZ3Mub3ZlcndyaXRlKSB7XG4gICAgICAgICAgICBjb25zdCBleGlzdGluZyA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LXV1aWQnLCB0YXJnZXRQYXRoKTtcbiAgICAgICAgICAgIGlmIChleGlzdGluZykge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKGBUYXJnZXQgJyR7dGFyZ2V0UGF0aH0nIGFscmVhZHkgZXhpc3RzLiBQYXNzIG92ZXJ3cml0ZTogdHJ1ZSB0byByZXBsYWNlIGl0LmAsIHsgZXhpc3RpbmdVdWlkOiBleGlzdGluZyB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGNvcHlSZXN1bHQ6IGFueSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoXG4gICAgICAgICAgICAnYXNzZXQtZGInLFxuICAgICAgICAgICAgJ2NvcHktYXNzZXQnLFxuICAgICAgICAgICAgc291cmNlVXJsLFxuICAgICAgICAgICAgdGFyZ2V0UGF0aCxcbiAgICAgICAgICAgIHsgb3ZlcndyaXRlOiAhIWFyZ3Mub3ZlcndyaXRlIH0sXG4gICAgICAgICk7XG4gICAgICAgIGlmICghY29weVJlc3VsdCB8fCAhY29weVJlc3VsdC51dWlkKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChgYXNzZXQtZGIgY29weS1hc3NldCByZXR1cm5lZCBubyByZXN1bHQgZm9yICR7c291cmNlVXJsfSAtPiAke3RhcmdldFBhdGh9LmApO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3Qgb3BlbkFmdGVyID0gYXJncy5vcGVuQWZ0ZXIgIT09IGZhbHNlO1xuICAgICAgICBpZiAob3BlbkFmdGVyKSB7XG4gICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdvcGVuLXNjZW5lJywgY29weVJlc3VsdC51dWlkKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgc291cmNlVXJsLFxuICAgICAgICAgICAgICAgIG5ld1V1aWQ6IGNvcHlSZXN1bHQudXVpZCxcbiAgICAgICAgICAgICAgICBuZXdVcmw6IGNvcHlSZXN1bHQudXJsLFxuICAgICAgICAgICAgICAgIG9wZW5lZDogb3BlbkFmdGVyLFxuICAgICAgICAgICAgfSwgYFNjZW5lIHNhdmVkIGFzICR7Y29weVJlc3VsdC51cmx9YCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBjbG9zZVNjZW5lSW1wbCgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ2Nsb3NlLXNjZW5lJykudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh1bmRlZmluZWQsICdTY2VuZSBjbG9zZWQgc3VjY2Vzc2Z1bGx5JykpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG59XG4iXX0=