"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SceneTools = void 0;
const response_1 = require("../lib/response");
const schema_1 = require("../lib/schema");
const define_tools_1 = require("../lib/define-tools");
const scene_bridge_1 = require("../lib/scene-bridge");
const component_tools_1 = require("./component-tools");
const log_1 = require("../lib/log");
const LAYER_UI_2D = 33554432;
class SceneTools {
    constructor() {
        this.componentTools = new component_tools_1.ComponentTools();
        const defs = [
            {
                name: 'get_current_scene',
                title: 'Read current scene',
                description: '[specialist] Read the currently open scene root summary (name/uuid/type/active/nodeCount). No scene mutation; use to get the scene root UUID. Also exposed as resource cocos://scene/current; prefer the resource when the client supports MCP resources.',
                inputSchema: schema_1.z.object({}),
                handler: () => this.getCurrentScene(),
            },
            {
                name: 'get_scene_list',
                title: 'List scene assets',
                description: '[specialist] List .scene assets under db://assets with name/path/uuid. Does not open scenes or modify assets. Also exposed as resource cocos://scene/list.',
                inputSchema: schema_1.z.object({}),
                handler: () => this.getSceneList(),
            },
            {
                name: 'open_scene',
                title: 'Open scene by path',
                description: '[specialist] Open a scene by db:// path. Switches the active Editor scene; save current edits first if needed.',
                inputSchema: schema_1.z.object({
                    scenePath: schema_1.z.string().describe('Scene db:// path to open, e.g. db://assets/scenes/Main.scene. The tool resolves UUID first.'),
                }),
                handler: a => this.openScene(a.scenePath),
            },
            {
                name: 'save_scene',
                title: 'Save current scene',
                description: '[specialist] Save the currently open scene back to its scene asset. Mutates the project file on disk.',
                inputSchema: schema_1.z.object({}),
                handler: () => this.saveScene(),
            },
            {
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
                handler: a => this.createScene(a.sceneName, a.savePath, a.template),
            },
            {
                name: 'save_scene_as',
                title: 'Copy scene asset',
                description: '[specialist] Copy the currently open scene to a new .scene asset. Saves current scene first; optionally opens the copy and can overwrite when requested.',
                inputSchema: schema_1.z.object({
                    path: schema_1.z.string().describe('Target db:// path for the new scene file (e.g. "db://assets/scenes/Copy.scene"). The ".scene" extension is appended if missing.'),
                    openAfter: schema_1.z.boolean().default(true).describe('Open the newly-saved scene right after the copy. Default true. Pass false to keep the current scene focused.'),
                    overwrite: schema_1.z.boolean().default(false).describe('Overwrite the target file if it already exists. Default false; with false, a name collision returns an error.'),
                }),
                handler: a => this.saveSceneAs(a),
            },
            {
                name: 'close_scene',
                title: 'Close current scene',
                description: '[specialist] Close the current scene. Editor state side effect; save first if unsaved changes matter.',
                inputSchema: schema_1.z.object({}),
                handler: () => this.closeScene(),
            },
            {
                name: 'get_scene_hierarchy',
                title: 'Read scene hierarchy',
                description: '[specialist] Read the complete current scene node hierarchy. No mutation; use for UUID/path lookup, optionally with component summaries. Also exposed as resource cocos://scene/hierarchy (defaults: includeComponents=false); prefer the resource for full-tree reads.',
                inputSchema: schema_1.z.object({
                    includeComponents: schema_1.z.boolean().default(false).describe('Include component type/enabled summaries on each node. Increases response size.'),
                }),
                handler: a => this.getSceneHierarchy(a.includeComponents),
            },
        ];
        this.exec = (0, define_tools_1.defineTools)(defs);
    }
    getTools() { return this.exec.getTools(); }
    execute(toolName, args) { return this.exec.execute(toolName, args); }
    async getCurrentScene() {
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
    async getSceneList() {
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
    async openScene(scenePath) {
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
    async saveScene() {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'save-scene').then(() => {
                resolve((0, response_1.ok)(undefined, 'Scene saved successfully'));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async createScene(sceneName, savePath, template = 'empty') {
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
                        const sceneList = await this.getSceneList();
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
    async getSceneHierarchy(includeComponents = false) {
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
    async saveSceneAs(args) {
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
    async closeScene() {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NlbmUtdG9vbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvdG9vbHMvc2NlbmUtdG9vbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsOENBQTJDO0FBRTNDLDBDQUFrQztBQUNsQyxzREFBMkQ7QUFDM0Qsc0RBQXFEO0FBQ3JELHVEQUFtRDtBQUNuRCxvQ0FBc0M7QUFFdEMsTUFBTSxXQUFXLEdBQUcsUUFBUSxDQUFDO0FBRTdCLE1BQWEsVUFBVTtJQUduQjtRQTJKUSxtQkFBYyxHQUFHLElBQUksZ0NBQWMsRUFBRSxDQUFDO1FBMUoxQyxNQUFNLElBQUksR0FBYztZQUNwQjtnQkFDSSxJQUFJLEVBQUUsbUJBQW1CO2dCQUN6QixLQUFLLEVBQUUsb0JBQW9CO2dCQUMzQixXQUFXLEVBQUUsMlBBQTJQO2dCQUN4USxXQUFXLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7Z0JBQ3pCLE9BQU8sRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFO2FBQ3hDO1lBQ0Q7Z0JBQ0ksSUFBSSxFQUFFLGdCQUFnQjtnQkFDdEIsS0FBSyxFQUFFLG1CQUFtQjtnQkFDMUIsV0FBVyxFQUFFLDRKQUE0SjtnQkFDekssV0FBVyxFQUFFLFVBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO2dCQUN6QixPQUFPLEVBQUUsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLFlBQVksRUFBRTthQUNyQztZQUNEO2dCQUNJLElBQUksRUFBRSxZQUFZO2dCQUNsQixLQUFLLEVBQUUsb0JBQW9CO2dCQUMzQixXQUFXLEVBQUUsZ0hBQWdIO2dCQUM3SCxXQUFXLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQztvQkFDbEIsU0FBUyxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLENBQUMsNkZBQTZGLENBQUM7aUJBQ2hJLENBQUM7Z0JBQ0YsT0FBTyxFQUFFLENBQUMsQ0FBQyxFQUFFLENB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QyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBVSxFQUFFLEVBQUU7Z0JBQ3BCLE9BQU8sQ0FBQyxJQUFBLGVBQUksRUFBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztZQUMvQixDQUFDLENBQUMsQ0FBQztRQUNQLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztDQUNKO0FBcGtCRCxnQ0Fva0JDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgb2ssIGZhaWwgfSBmcm9tICcuLi9saWIvcmVzcG9uc2UnO1xuaW1wb3J0IHsgVG9vbERlZmluaXRpb24sIFRvb2xSZXNwb25zZSwgVG9vbEV4ZWN1dG9yLCBTY2VuZUluZm8gfSBmcm9tICcuLi90eXBlcyc7XG5pbXBvcnQgeyB6IH0gZnJvbSAnLi4vbGliL3NjaGVtYSc7XG5pbXBvcnQgeyBkZWZpbmVUb29scywgVG9vbERlZiB9IGZyb20gJy4uL2xpYi9kZWZpbmUtdG9vbHMnO1xuaW1wb3J0IHsgcnVuU2NlbmVNZXRob2QgfSBmcm9tICcuLi9saWIvc2NlbmUtYnJpZGdlJztcbmltcG9ydCB7IENvbXBvbmVudFRvb2xzIH0gZnJvbSAnLi9jb21wb25lbnQtdG9vbHMnO1xuaW1wb3J0IHsgZGVidWdMb2cgfSBmcm9tICcuLi9saWIvbG9nJztcblxuY29uc3QgTEFZRVJfVUlfMkQgPSAzMzU1NDQzMjtcblxuZXhwb3J0IGNsYXNzIFNjZW5lVG9vbHMgaW1wbGVtZW50cyBUb29sRXhlY3V0b3Ige1xuICAgIHByaXZhdGUgcmVhZG9ubHkgZXhlYzogVG9vbEV4ZWN1dG9yO1xuXG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIGNvbnN0IGRlZnM6IFRvb2xEZWZbXSA9IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnZ2V0X2N1cnJlbnRfc2NlbmUnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnUmVhZCBjdXJyZW50IHNjZW5lJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBSZWFkIHRoZSBjdXJyZW50bHkgb3BlbiBzY2VuZSByb290IHN1bW1hcnkgKG5hbWUvdXVpZC90eXBlL2FjdGl2ZS9ub2RlQ291bnQpLiBObyBzY2VuZSBtdXRhdGlvbjsgdXNlIHRvIGdldCB0aGUgc2NlbmUgcm9vdCBVVUlELiBBbHNvIGV4cG9zZWQgYXMgcmVzb3VyY2UgY29jb3M6Ly9zY2VuZS9jdXJyZW50OyBwcmVmZXIgdGhlIHJlc291cmNlIHdoZW4gdGhlIGNsaWVudCBzdXBwb3J0cyBNQ1AgcmVzb3VyY2VzLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiAoKSA9PiB0aGlzLmdldEN1cnJlbnRTY2VuZSgpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnZ2V0X3NjZW5lX2xpc3QnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnTGlzdCBzY2VuZSBhc3NldHMnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIExpc3QgLnNjZW5lIGFzc2V0cyB1bmRlciBkYjovL2Fzc2V0cyB3aXRoIG5hbWUvcGF0aC91dWlkLiBEb2VzIG5vdCBvcGVuIHNjZW5lcyBvciBtb2RpZnkgYXNzZXRzLiBBbHNvIGV4cG9zZWQgYXMgcmVzb3VyY2UgY29jb3M6Ly9zY2VuZS9saXN0LicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiAoKSA9PiB0aGlzLmdldFNjZW5lTGlzdCgpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnb3Blbl9zY2VuZScsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdPcGVuIHNjZW5lIGJ5IHBhdGgnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIE9wZW4gYSBzY2VuZSBieSBkYjovLyBwYXRoLiBTd2l0Y2hlcyB0aGUgYWN0aXZlIEVkaXRvciBzY2VuZTsgc2F2ZSBjdXJyZW50IGVkaXRzIGZpcnN0IGlmIG5lZWRlZC4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHNjZW5lUGF0aDogei5zdHJpbmcoKS5kZXNjcmliZSgnU2NlbmUgZGI6Ly8gcGF0aCB0byBvcGVuLCBlLmcuIGRiOi8vYXNzZXRzL3NjZW5lcy9NYWluLnNjZW5lLiBUaGUgdG9vbCByZXNvbHZlcyBVVUlEIGZpcnN0LicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy5vcGVuU2NlbmUoYS5zY2VuZVBhdGgpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnc2F2ZV9zY2VuZScsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdTYXZlIGN1cnJlbnQgc2NlbmUnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFNhdmUgdGhlIGN1cnJlbnRseSBvcGVuIHNjZW5lIGJhY2sgdG8gaXRzIHNjZW5lIGFzc2V0LiBNdXRhdGVzIHRoZSBwcm9qZWN0IGZpbGUgb24gZGlzay4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogKCkgPT4gdGhpcy5zYXZlU2NlbmUoKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2NyZWF0ZV9zY2VuZScsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdDcmVhdGUgc2NlbmUgYXNzZXQnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIENyZWF0ZSBhIG5ldyAuc2NlbmUgYXNzZXQuIE11dGF0ZXMgYXNzZXQtZGI7IG5vbi1lbXB0eSB0ZW1wbGF0ZXMgYWxzbyBvcGVuIHRoZSBuZXcgc2NlbmUgYW5kIHBvcHVsYXRlIHN0YW5kYXJkIENhbWVyYS9DYW52YXMgb3IgQ2FtZXJhL0xpZ2h0IG5vZGVzLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgc2NlbmVOYW1lOiB6LnN0cmluZygpLmRlc2NyaWJlKCdOZXcgc2NlbmUgbmFtZTsgd3JpdHRlbiBpbnRvIHRoZSBjcmVhdGVkIGNjLlNjZW5lQXNzZXQgLyBjYy5TY2VuZS4nKSxcbiAgICAgICAgICAgICAgICAgICAgc2F2ZVBhdGg6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1RhcmdldCBzY2VuZSBsb2NhdGlvbi4gUGFzcyBhIGZ1bGwgLnNjZW5lIHBhdGggb3IgYSBmb2xkZXIgcGF0aCB0byBhcHBlbmQgc2NlbmVOYW1lLnNjZW5lLicpLFxuICAgICAgICAgICAgICAgICAgICB0ZW1wbGF0ZTogei5lbnVtKFsnZW1wdHknLCAnMmQtdWknLCAnM2QtYmFzaWMnXSkuZGVmYXVsdCgnZW1wdHknKS5kZXNjcmliZShcbiAgICAgICAgICAgICAgICAgICAgICAgICdCdWlsdC1pbiBzY2FmZm9sZGluZyBmb3IgdGhlIG5ldyBzY2VuZS4gJyArXG4gICAgICAgICAgICAgICAgICAgICAgICAnXCJlbXB0eVwiIChkZWZhdWx0KTogYmFyZSBzY2VuZSByb290IG9ubHkg4oCUIGN1cnJlbnQgYmVoYXZpb3IuICcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgJ1wiMmQtdWlcIjogQ2FtZXJhIChjYy5DYW1lcmEsIG9ydGhvIHByb2plY3Rpb24pICsgQ2FudmFzIChjYy5VSVRyYW5zZm9ybSArIGNjLkNhbnZhcyB3aXRoIGNhbWVyYUNvbXBvbmVudCBsaW5rZWQsIGxheWVyIFVJXzJEKSBzbyBVSSBub2RlcyByZW5kZXIgaW1tZWRpYXRlbHkgdW5kZXIgdGhlIFVJIGNhbWVyYS4gJyArXG4gICAgICAgICAgICAgICAgICAgICAgICAnXCIzZC1iYXNpY1wiOiBDYW1lcmEgKHBlcnNwZWN0aXZlKSArIERpcmVjdGlvbmFsTGlnaHQgYXQgc2NlbmUgcm9vdC4gJyArXG4gICAgICAgICAgICAgICAgICAgICAgICAn4pqg77iPIFNpZGUgZWZmZWN0OiB3aGVuIHRlbXBsYXRlIGlzIG5vdCBcImVtcHR5XCIgdGhlIGVkaXRvciBvcGVucyB0aGUgbmV3bHkgY3JlYXRlZCBzY2VuZSB0byBwb3B1bGF0ZSBpdC4gU2F2ZSB5b3VyIGN1cnJlbnQgc2NlbmUgZmlyc3QgaWYgaXQgaGFzIHVuc2F2ZWQgY2hhbmdlcy4nXG4gICAgICAgICAgICAgICAgICAgICksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLmNyZWF0ZVNjZW5lKGEuc2NlbmVOYW1lLCBhLnNhdmVQYXRoLCBhLnRlbXBsYXRlKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3NhdmVfc2NlbmVfYXMnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnQ29weSBzY2VuZSBhc3NldCcsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gQ29weSB0aGUgY3VycmVudGx5IG9wZW4gc2NlbmUgdG8gYSBuZXcgLnNjZW5lIGFzc2V0LiBTYXZlcyBjdXJyZW50IHNjZW5lIGZpcnN0OyBvcHRpb25hbGx5IG9wZW5zIHRoZSBjb3B5IGFuZCBjYW4gb3ZlcndyaXRlIHdoZW4gcmVxdWVzdGVkLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgcGF0aDogei5zdHJpbmcoKS5kZXNjcmliZSgnVGFyZ2V0IGRiOi8vIHBhdGggZm9yIHRoZSBuZXcgc2NlbmUgZmlsZSAoZS5nLiBcImRiOi8vYXNzZXRzL3NjZW5lcy9Db3B5LnNjZW5lXCIpLiBUaGUgXCIuc2NlbmVcIiBleHRlbnNpb24gaXMgYXBwZW5kZWQgaWYgbWlzc2luZy4nKSxcbiAgICAgICAgICAgICAgICAgICAgb3BlbkFmdGVyOiB6LmJvb2xlYW4oKS5kZWZhdWx0KHRydWUpLmRlc2NyaWJlKCdPcGVuIHRoZSBuZXdseS1zYXZlZCBzY2VuZSByaWdodCBhZnRlciB0aGUgY29weS4gRGVmYXVsdCB0cnVlLiBQYXNzIGZhbHNlIHRvIGtlZXAgdGhlIGN1cnJlbnQgc2NlbmUgZm9jdXNlZC4nKSxcbiAgICAgICAgICAgICAgICAgICAgb3ZlcndyaXRlOiB6LmJvb2xlYW4oKS5kZWZhdWx0KGZhbHNlKS5kZXNjcmliZSgnT3ZlcndyaXRlIHRoZSB0YXJnZXQgZmlsZSBpZiBpdCBhbHJlYWR5IGV4aXN0cy4gRGVmYXVsdCBmYWxzZTsgd2l0aCBmYWxzZSwgYSBuYW1lIGNvbGxpc2lvbiByZXR1cm5zIGFuIGVycm9yLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy5zYXZlU2NlbmVBcyhhKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2Nsb3NlX3NjZW5lJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ0Nsb3NlIGN1cnJlbnQgc2NlbmUnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIENsb3NlIHRoZSBjdXJyZW50IHNjZW5lLiBFZGl0b3Igc3RhdGUgc2lkZSBlZmZlY3Q7IHNhdmUgZmlyc3QgaWYgdW5zYXZlZCBjaGFuZ2VzIG1hdHRlci4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogKCkgPT4gdGhpcy5jbG9zZVNjZW5lKCksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdnZXRfc2NlbmVfaGllcmFyY2h5JyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1JlYWQgc2NlbmUgaGllcmFyY2h5JyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBSZWFkIHRoZSBjb21wbGV0ZSBjdXJyZW50IHNjZW5lIG5vZGUgaGllcmFyY2h5LiBObyBtdXRhdGlvbjsgdXNlIGZvciBVVUlEL3BhdGggbG9va3VwLCBvcHRpb25hbGx5IHdpdGggY29tcG9uZW50IHN1bW1hcmllcy4gQWxzbyBleHBvc2VkIGFzIHJlc291cmNlIGNvY29zOi8vc2NlbmUvaGllcmFyY2h5IChkZWZhdWx0czogaW5jbHVkZUNvbXBvbmVudHM9ZmFsc2UpOyBwcmVmZXIgdGhlIHJlc291cmNlIGZvciBmdWxsLXRyZWUgcmVhZHMuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBpbmNsdWRlQ29tcG9uZW50czogei5ib29sZWFuKCkuZGVmYXVsdChmYWxzZSkuZGVzY3JpYmUoJ0luY2x1ZGUgY29tcG9uZW50IHR5cGUvZW5hYmxlZCBzdW1tYXJpZXMgb24gZWFjaCBub2RlLiBJbmNyZWFzZXMgcmVzcG9uc2Ugc2l6ZS4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMuZ2V0U2NlbmVIaWVyYXJjaHkoYS5pbmNsdWRlQ29tcG9uZW50cyksXG4gICAgICAgICAgICB9LFxuICAgICAgICBdO1xuICAgICAgICB0aGlzLmV4ZWMgPSBkZWZpbmVUb29scyhkZWZzKTtcbiAgICB9XG5cbiAgICBnZXRUb29scygpOiBUb29sRGVmaW5pdGlvbltdIHsgcmV0dXJuIHRoaXMuZXhlYy5nZXRUb29scygpOyB9XG4gICAgZXhlY3V0ZSh0b29sTmFtZTogc3RyaW5nLCBhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4geyByZXR1cm4gdGhpcy5leGVjLmV4ZWN1dGUodG9vbE5hbWUsIGFyZ3MpOyB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldEN1cnJlbnRTY2VuZSgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIC8vIOebtOaOpeS9v+eUqCBxdWVyeS1ub2RlLXRyZWUg5L6G542y5Y+W5aC05pmv5L+h5oGv77yI6YCZ5YCL5pa55rOV5bey57aT6amX6K2J5Y+v55So77yJXG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1ub2RlLXRyZWUnKS50aGVuKCh0cmVlOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAodHJlZSAmJiB0cmVlLnV1aWQpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogdHJlZS5uYW1lIHx8ICdDdXJyZW50IFNjZW5lJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiB0cmVlLnV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogdHJlZS50eXBlIHx8ICdjYy5TY2VuZScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYWN0aXZlOiB0cmVlLmFjdGl2ZSAhPT0gdW5kZWZpbmVkID8gdHJlZS5hY3RpdmUgOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5vZGVDb3VudDogdHJlZS5jaGlsZHJlbiA/IHRyZWUuY2hpbGRyZW4ubGVuZ3RoIDogMFxuICAgICAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbCgnTm8gc2NlbmUgZGF0YSBhdmFpbGFibGUnKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICAvLyDlgpnnlKjmlrnmoYjvvJrkvb/nlKjloLTmma/ohbPmnKxcbiAgICAgICAgICAgICAgICBydW5TY2VuZU1ldGhvZCgnZ2V0Q3VycmVudFNjZW5lSW5mbycsIFtdKS50aGVuKChyZXN1bHQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgfSkuY2F0Y2goKGVycjI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChgRGlyZWN0IEFQSSBmYWlsZWQ6ICR7ZXJyLm1lc3NhZ2V9LCBTY2VuZSBzY3JpcHQgZmFpbGVkOiAke2VycjIubWVzc2FnZX1gKSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRTY2VuZUxpc3QoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICAvLyBOb3RlOiBxdWVyeS1hc3NldHMgQVBJIGNvcnJlY3RlZCB3aXRoIHByb3BlciBwYXJhbWV0ZXJzXG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldHMnLCB7XG4gICAgICAgICAgICAgICAgcGF0dGVybjogJ2RiOi8vYXNzZXRzLyoqLyouc2NlbmUnXG4gICAgICAgICAgICB9KS50aGVuKChyZXN1bHRzOiBhbnlbXSkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHNjZW5lczogU2NlbmVJbmZvW10gPSByZXN1bHRzLm1hcChhc3NldCA9PiAoe1xuICAgICAgICAgICAgICAgICAgICBuYW1lOiBhc3NldC5uYW1lLFxuICAgICAgICAgICAgICAgICAgICBwYXRoOiBhc3NldC51cmwsXG4gICAgICAgICAgICAgICAgICAgIHV1aWQ6IGFzc2V0LnV1aWRcbiAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayhzY2VuZXMpKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBvcGVuU2NlbmUoc2NlbmVQYXRoOiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIC8vIOmmluWFiOeNsuWPluWgtOaZr+eahFVVSURcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LXV1aWQnLCBzY2VuZVBhdGgpLnRoZW4oKHV1aWQ6IHN0cmluZyB8IG51bGwpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoIXV1aWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdTY2VuZSBub3QgZm91bmQnKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgLy8g5L2/55So5q2j56K655qEIHNjZW5lIEFQSSDmiZPplovloLTmma8gKOmcgOimgVVVSUQpXG4gICAgICAgICAgICAgICAgcmV0dXJuIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ29wZW4tc2NlbmUnLCB1dWlkKTtcbiAgICAgICAgICAgIH0pLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2sodW5kZWZpbmVkLCBgU2NlbmUgb3BlbmVkOiAke3NjZW5lUGF0aH1gKSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgc2F2ZVNjZW5lKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnc2F2ZS1zY2VuZScpLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2sodW5kZWZpbmVkLCAnU2NlbmUgc2F2ZWQgc3VjY2Vzc2Z1bGx5JykpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGNvbXBvbmVudFRvb2xzID0gbmV3IENvbXBvbmVudFRvb2xzKCk7XG5cbiAgICBwcml2YXRlIGFzeW5jIGNyZWF0ZVNjZW5lKHNjZW5lTmFtZTogc3RyaW5nLCBzYXZlUGF0aDogc3RyaW5nLCB0ZW1wbGF0ZTogJ2VtcHR5JyB8ICcyZC11aScgfCAnM2QtYmFzaWMnID0gJ2VtcHR5Jyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgLy8g56K65L+d6Lev5b6R5LulLnNjZW5l57WQ5bC+XG4gICAgICAgICAgICBjb25zdCBmdWxsUGF0aCA9IHNhdmVQYXRoLmVuZHNXaXRoKCcuc2NlbmUnKSA/IHNhdmVQYXRoIDogYCR7c2F2ZVBhdGh9LyR7c2NlbmVOYW1lfS5zY2VuZWA7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIOS9v+eUqOato+eiuueahENvY29zIENyZWF0b3IgMy445aC05pmv5qC85byPXG4gICAgICAgICAgICBjb25zdCBzY2VuZUNvbnRlbnQgPSBKU09OLnN0cmluZ2lmeShbXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcIl9fdHlwZV9fXCI6IFwiY2MuU2NlbmVBc3NldFwiLFxuICAgICAgICAgICAgICAgICAgICBcIl9uYW1lXCI6IHNjZW5lTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgXCJfb2JqRmxhZ3NcIjogMCxcbiAgICAgICAgICAgICAgICAgICAgXCJfX2VkaXRvckV4dHJhc19fXCI6IHt9LFxuICAgICAgICAgICAgICAgICAgICBcIl9uYXRpdmVcIjogXCJcIixcbiAgICAgICAgICAgICAgICAgICAgXCJzY2VuZVwiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcIl9faWRfX1wiOiAxXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCJfX3R5cGVfX1wiOiBcImNjLlNjZW5lXCIsXG4gICAgICAgICAgICAgICAgICAgIFwiX25hbWVcIjogc2NlbmVOYW1lLFxuICAgICAgICAgICAgICAgICAgICBcIl9vYmpGbGFnc1wiOiAwLFxuICAgICAgICAgICAgICAgICAgICBcIl9fZWRpdG9yRXh0cmFzX19cIjoge30sXG4gICAgICAgICAgICAgICAgICAgIFwiX3BhcmVudFwiOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICBcIl9jaGlsZHJlblwiOiBbXSxcbiAgICAgICAgICAgICAgICAgICAgXCJfYWN0aXZlXCI6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIFwiX2NvbXBvbmVudHNcIjogW10sXG4gICAgICAgICAgICAgICAgICAgIFwiX3ByZWZhYlwiOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICBcIl9scG9zXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiX190eXBlX19cIjogXCJjYy5WZWMzXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInhcIjogMCxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwieVwiOiAwLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ6XCI6IDBcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgXCJfbHJvdFwiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcIl9fdHlwZV9fXCI6IFwiY2MuUXVhdFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ4XCI6IDAsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInlcIjogMCxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwielwiOiAwLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ3XCI6IDFcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgXCJfbHNjYWxlXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiX190eXBlX19cIjogXCJjYy5WZWMzXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInhcIjogMSxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwieVwiOiAxLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ6XCI6IDFcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgXCJfbW9iaWxpdHlcIjogMCxcbiAgICAgICAgICAgICAgICAgICAgXCJfbGF5ZXJcIjogMTA3Mzc0MTgyNCxcbiAgICAgICAgICAgICAgICAgICAgXCJfZXVsZXJcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJfX3R5cGVfX1wiOiBcImNjLlZlYzNcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIFwieFwiOiAwLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ5XCI6IDAsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInpcIjogMFxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICBcImF1dG9SZWxlYXNlQXNzZXRzXCI6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICBcIl9nbG9iYWxzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiX19pZF9fXCI6IDJcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgXCJfaWRcIjogXCJzY2VuZVwiXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIFwiX190eXBlX19cIjogXCJjYy5TY2VuZUdsb2JhbHNcIixcbiAgICAgICAgICAgICAgICAgICAgXCJhbWJpZW50XCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiX19pZF9fXCI6IDNcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgXCJza3lib3hcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJfX2lkX19cIjogNFxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICBcImZvZ1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcIl9faWRfX1wiOiA1XG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIFwib2N0cmVlXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiX19pZF9fXCI6IDZcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcIl9fdHlwZV9fXCI6IFwiY2MuQW1iaWVudEluZm9cIixcbiAgICAgICAgICAgICAgICAgICAgXCJfc2t5Q29sb3JIRFJcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJfX3R5cGVfX1wiOiBcImNjLlZlYzRcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIFwieFwiOiAwLjIsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInlcIjogMC41LFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ6XCI6IDAuOCxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwid1wiOiAwLjUyMDgzM1xuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICBcIl9za3lDb2xvclwiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcIl9fdHlwZV9fXCI6IFwiY2MuVmVjNFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ4XCI6IDAuMixcbiAgICAgICAgICAgICAgICAgICAgICAgIFwieVwiOiAwLjUsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInpcIjogMC44LFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ3XCI6IDAuNTIwODMzXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIFwiX3NreUlsbHVtSERSXCI6IDIwMDAwLFxuICAgICAgICAgICAgICAgICAgICBcIl9za3lJbGx1bVwiOiAyMDAwMCxcbiAgICAgICAgICAgICAgICAgICAgXCJfZ3JvdW5kQWxiZWRvSERSXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiX190eXBlX19cIjogXCJjYy5WZWM0XCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInhcIjogMC4yLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ5XCI6IDAuMixcbiAgICAgICAgICAgICAgICAgICAgICAgIFwielwiOiAwLjIsXG4gICAgICAgICAgICAgICAgICAgICAgICBcIndcIjogMVxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICBcIl9ncm91bmRBbGJlZG9cIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJfX3R5cGVfX1wiOiBcImNjLlZlYzRcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIFwieFwiOiAwLjIsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInlcIjogMC4yLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ6XCI6IDAuMixcbiAgICAgICAgICAgICAgICAgICAgICAgIFwid1wiOiAxXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCJfX3R5cGVfX1wiOiBcImNjLlNreWJveEluZm9cIixcbiAgICAgICAgICAgICAgICAgICAgXCJfZW52TGlnaHRpbmdUeXBlXCI6IDAsXG4gICAgICAgICAgICAgICAgICAgIFwiX2Vudm1hcEhEUlwiOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICBcIl9lbnZtYXBcIjogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgXCJfZW52bWFwTG9kQ291bnRcIjogMCxcbiAgICAgICAgICAgICAgICAgICAgXCJfZGlmZnVzZU1hcEhEUlwiOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICBcIl9kaWZmdXNlTWFwXCI6IG51bGwsXG4gICAgICAgICAgICAgICAgICAgIFwiX2VuYWJsZWRcIjogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIFwiX3VzZUhEUlwiOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBcIl9lZGl0YWJsZU1hdGVyaWFsXCI6IG51bGwsXG4gICAgICAgICAgICAgICAgICAgIFwiX3JlZmxlY3Rpb25IRFJcIjogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgXCJfcmVmbGVjdGlvbk1hcFwiOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICBcIl9yb3RhdGlvbkFuZ2xlXCI6IDBcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCJfX3R5cGVfX1wiOiBcImNjLkZvZ0luZm9cIixcbiAgICAgICAgICAgICAgICAgICAgXCJfdHlwZVwiOiAwLFxuICAgICAgICAgICAgICAgICAgICBcIl9mb2dDb2xvclwiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcIl9fdHlwZV9fXCI6IFwiY2MuQ29sb3JcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiclwiOiAyMDAsXG4gICAgICAgICAgICAgICAgICAgICAgICBcImdcIjogMjAwLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJiXCI6IDIwMCxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiYVwiOiAyNTVcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgXCJfZW5hYmxlZFwiOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgXCJfZm9nRGVuc2l0eVwiOiAwLjMsXG4gICAgICAgICAgICAgICAgICAgIFwiX2ZvZ1N0YXJ0XCI6IDAuNSxcbiAgICAgICAgICAgICAgICAgICAgXCJfZm9nRW5kXCI6IDMwMCxcbiAgICAgICAgICAgICAgICAgICAgXCJfZm9nQXR0ZW5cIjogNSxcbiAgICAgICAgICAgICAgICAgICAgXCJfZm9nVG9wXCI6IDEuNSxcbiAgICAgICAgICAgICAgICAgICAgXCJfZm9nUmFuZ2VcIjogMS4yLFxuICAgICAgICAgICAgICAgICAgICBcIl9hY2N1cmF0ZVwiOiBmYWxzZVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcIl9fdHlwZV9fXCI6IFwiY2MuT2N0cmVlSW5mb1wiLFxuICAgICAgICAgICAgICAgICAgICBcIl9lbmFibGVkXCI6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICBcIl9taW5Qb3NcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJfX3R5cGVfX1wiOiBcImNjLlZlYzNcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIFwieFwiOiAtMTAyNCxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwieVwiOiAtMTAyNCxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwielwiOiAtMTAyNFxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICBcIl9tYXhQb3NcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJfX3R5cGVfX1wiOiBcImNjLlZlYzNcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIFwieFwiOiAxMDI0LFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ5XCI6IDEwMjQsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInpcIjogMTAyNFxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICBcIl9kZXB0aFwiOiA4XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgXSwgbnVsbCwgMik7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ2NyZWF0ZS1hc3NldCcsIGZ1bGxQYXRoLCBzY2VuZUNvbnRlbnQpLnRoZW4oYXN5bmMgKHJlc3VsdDogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHRlbXBsYXRlID09PSAnZW1wdHknKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIEV4aXN0aW5nIHBhdGg6IHZlcmlmeSBhbmQgcmV0dXJuLlxuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgc2NlbmVMaXN0ID0gYXdhaXQgdGhpcy5nZXRTY2VuZUxpc3QoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGNyZWF0ZWRTY2VuZSA9IHNjZW5lTGlzdC5kYXRhPy5maW5kKChzY2VuZTogYW55KSA9PiBzY2VuZS51dWlkID09PSByZXN1bHQudXVpZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdXVpZDogcmVzdWx0LnV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHVybDogcmVzdWx0LnVybCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogc2NlbmVOYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0ZW1wbGF0ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYFNjZW5lICcke3NjZW5lTmFtZX0nIGNyZWF0ZWQgc3VjY2Vzc2Z1bGx5YCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2NlbmVWZXJpZmllZDogISFjcmVhdGVkU2NlbmUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2ZXJpZmljYXRpb25EYXRhOiBjcmVhdGVkU2NlbmUsXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdXVpZDogcmVzdWx0LnV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHVybDogcmVzdWx0LnVybCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogc2NlbmVOYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0ZW1wbGF0ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYFNjZW5lICcke3NjZW5lTmFtZX0nIGNyZWF0ZWQgc3VjY2Vzc2Z1bGx5ICh2ZXJpZmljYXRpb24gZmFpbGVkKWAsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBUZW1wbGF0ZSBwYXRoOiBvcGVuIHRoZSBuZXdseS1jcmVhdGVkIHNjZW5lIGFzc2V0IGFuZCBiYWtlIHRoZVxuICAgICAgICAgICAgICAgIC8vIHN0YW5kYXJkIG5vZGVzL2NvbXBvbmVudHMgb24gdG9wIG9mIHRoZSBlbXB0eSBzY2FmZm9sZGluZyB3ZVxuICAgICAgICAgICAgICAgIC8vIGp1c3Qgd3JvdGUuIERvbmUgaG9zdC1zaWRlIHZpYSBFZGl0b3IuTWVzc2FnZSBzbyBiZWhhdmlvclxuICAgICAgICAgICAgICAgIC8vIG1hdGNoZXMgd2hhdCB0aGUgSW5zcGVjdG9yIHdvdWxkIGJ1aWxkIGZvciBcIk5ldyAyRCAvIDNEXCIuXG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnb3Blbi1zY2VuZScsIHJlc3VsdC51dWlkKTtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgbmV3IFByb21pc2UoKHIpID0+IHNldFRpbWVvdXQociwgNjAwKSk7XG5cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdHJlZTogYW55ID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktbm9kZS10cmVlJyk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHNjZW5lUm9vdFV1aWQ6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHRyZWU/LnV1aWQ7XG4gICAgICAgICAgICAgICAgICAgIGlmICghc2NlbmVSb290VXVpZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdDb3VsZCBub3QgcmVzb2x2ZSBzY2VuZSByb290IFVVSUQgYWZ0ZXIgb3Blbi1zY2VuZScpO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdGVtcGxhdGVEYXRhID1cbiAgICAgICAgICAgICAgICAgICAgICAgIHRlbXBsYXRlID09PSAnMmQtdWknID8gYXdhaXQgdGhpcy5idWlsZFRlbXBsYXRlMkRVSShzY2VuZVJvb3RVdWlkKVxuICAgICAgICAgICAgICAgICAgICAgICAgOiBhd2FpdCB0aGlzLmJ1aWxkVGVtcGxhdGUzREJhc2ljKHNjZW5lUm9vdFV1aWQpO1xuXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3NhdmUtc2NlbmUnKTtcblxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiByZXN1bHQudXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB1cmw6IHJlc3VsdC51cmwsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogc2NlbmVOYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRlbXBsYXRlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRlbXBsYXRlTm9kZXM6IHRlbXBsYXRlRGF0YSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgU2NlbmUgJyR7c2NlbmVOYW1lfScgY3JlYXRlZCB3aXRoIHRlbXBsYXRlICcke3RlbXBsYXRlfScuIEVkaXRvciBzd2l0Y2hlZCB0byB0aGUgbmV3IHNjZW5lLmAsXG4gICAgICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAodGVtcGxhdGVFcnI6IGFueSkge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoYFNjZW5lIGFzc2V0IGNyZWF0ZWQgYXQgJHtyZXN1bHQudXJsfSBidXQgdGVtcGxhdGUgYnVpbGQgZmFpbGVkOiAke3RlbXBsYXRlRXJyPy5tZXNzYWdlID8/IHRlbXBsYXRlRXJyfWAsIHsgdXVpZDogcmVzdWx0LnV1aWQsIHVybDogcmVzdWx0LnVybCwgdGVtcGxhdGUgfSkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gQnVpbGQgXCJOZXcgMkRcIiBzY2FmZm9sZGluZyBpbnNpZGUgdGhlIGN1cnJlbnRseS1vcGVuIHNjZW5lOiBDYW1lcmFcbiAgICAvLyAoY2MuQ2FtZXJhLCBvcnRobykgKyBDYW52YXMgKGNjLlVJVHJhbnNmb3JtICsgY2MuQ2FudmFzIHdpdGhcbiAgICAvLyBjYW1lcmFDb21wb25lbnQgbGlua2VkLCBsYXllciBVSV8yRCkuXG4gICAgcHJpdmF0ZSBhc3luYyBidWlsZFRlbXBsYXRlMkRVSShzY2VuZVJvb3RVdWlkOiBzdHJpbmcpOiBQcm9taXNlPHsgY2FtZXJhVXVpZDogc3RyaW5nOyBjYW52YXNVdWlkOiBzdHJpbmcgfT4ge1xuICAgICAgICBjb25zdCBjYW1lcmFVdWlkID0gYXdhaXQgdGhpcy5jcmVhdGVOb2RlV2l0aENvbXBvbmVudHMoJ0NhbWVyYScsIHNjZW5lUm9vdFV1aWQsIFsnY2MuQ2FtZXJhJ10pO1xuICAgICAgICBhd2FpdCB0aGlzLmRlbGF5KDE1MCk7XG4gICAgICAgIGNvbnN0IGNhbWVyYUlkeCA9IGF3YWl0IHRoaXMuZmluZENvbXBvbmVudEluZGV4KGNhbWVyYVV1aWQsICdjYy5DYW1lcmEnKTtcbiAgICAgICAgaWYgKGNhbWVyYUlkeCA+PSAwKSB7XG4gICAgICAgICAgICAvLyAwID0gT1JUSE8sIDEgPSBQRVJTUEVDVElWRVxuICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnc2V0LXByb3BlcnR5Jywge1xuICAgICAgICAgICAgICAgIHV1aWQ6IGNhbWVyYVV1aWQsXG4gICAgICAgICAgICAgICAgcGF0aDogYF9fY29tcHNfXy4ke2NhbWVyYUlkeH0ucHJvamVjdGlvbmAsXG4gICAgICAgICAgICAgICAgZHVtcDogeyB2YWx1ZTogMCB9LFxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBjYy5DYW52YXMgcmVxdWlyZXMgY2MuVUlUcmFuc2Zvcm07IGNvY29zIGF1dG8tYWRkcyBpdCB3aGVuIGFkZGluZyBjYy5DYW52YXMuXG4gICAgICAgIGNvbnN0IGNhbnZhc1V1aWQgPSBhd2FpdCB0aGlzLmNyZWF0ZU5vZGVXaXRoQ29tcG9uZW50cygnQ2FudmFzJywgc2NlbmVSb290VXVpZCwgWydjYy5DYW52YXMnXSk7XG4gICAgICAgIGF3YWl0IHRoaXMuZGVsYXkoMTUwKTtcblxuICAgICAgICAvLyBDYW52YXMgaXRzZWxmIHNpdHMgb24gVUlfMkQgc28gaXQgKGFuZCBpdHMgZGVzY2VuZGFudHMgYnkgaW5oZXJpdGFuY2UgdmlhXG4gICAgICAgIC8vIGNyZWF0ZV9ub2RlIGF1dG8tZGV0ZWN0aW9uKSBhcmUgdmlzaWJsZSB0byB0aGUgVUkgY2FtZXJhLlxuICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdzZXQtcHJvcGVydHknLCB7XG4gICAgICAgICAgICB1dWlkOiBjYW52YXNVdWlkLFxuICAgICAgICAgICAgcGF0aDogJ2xheWVyJyxcbiAgICAgICAgICAgIGR1bXA6IHsgdmFsdWU6IExBWUVSX1VJXzJEIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIFdpcmUgQ2FudmFzLmNhbWVyYUNvbXBvbmVudCDihpIgQ2FtZXJhIG5vZGUuIFJldXNlcyB0aGUgdmVyaWZpZWRcbiAgICAgICAgLy8gcHJvcGVydHlUeXBlOiAnY29tcG9uZW50JyBjb2RlIHBhdGggc28gd2UgZG8gbm90IGhhdmUgdG8gcmUtcmVzb2x2ZVxuICAgICAgICAvLyB0aGUgY29tcG9uZW50IHNjZW5lIF9faWRfXyBoZXJlLlxuICAgICAgICBhd2FpdCB0aGlzLmNvbXBvbmVudFRvb2xzLmV4ZWN1dGUoJ3NldF9jb21wb25lbnRfcHJvcGVydHknLCB7XG4gICAgICAgICAgICBub2RlVXVpZDogY2FudmFzVXVpZCxcbiAgICAgICAgICAgIGNvbXBvbmVudFR5cGU6ICdjYy5DYW52YXMnLFxuICAgICAgICAgICAgcHJvcGVydHk6ICdjYW1lcmFDb21wb25lbnQnLFxuICAgICAgICAgICAgcHJvcGVydHlUeXBlOiAnY29tcG9uZW50JyxcbiAgICAgICAgICAgIHZhbHVlOiBjYW1lcmFVdWlkLFxuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4geyBjYW1lcmFVdWlkLCBjYW52YXNVdWlkIH07XG4gICAgfVxuXG4gICAgLy8gQnVpbGQgXCJOZXcgM0RcIiBzY2FmZm9sZGluZzogQ2FtZXJhIChwZXJzcGVjdGl2ZSkgKyBEaXJlY3Rpb25hbExpZ2h0LlxuICAgIHByaXZhdGUgYXN5bmMgYnVpbGRUZW1wbGF0ZTNEQmFzaWMoc2NlbmVSb290VXVpZDogc3RyaW5nKTogUHJvbWlzZTx7IGNhbWVyYVV1aWQ6IHN0cmluZzsgbGlnaHRVdWlkOiBzdHJpbmcgfT4ge1xuICAgICAgICBjb25zdCBjYW1lcmFVdWlkID0gYXdhaXQgdGhpcy5jcmVhdGVOb2RlV2l0aENvbXBvbmVudHMoJ01haW4gQ2FtZXJhJywgc2NlbmVSb290VXVpZCwgWydjYy5DYW1lcmEnXSk7XG4gICAgICAgIGNvbnN0IGxpZ2h0VXVpZCA9IGF3YWl0IHRoaXMuY3JlYXRlTm9kZVdpdGhDb21wb25lbnRzKCdNYWluIExpZ2h0Jywgc2NlbmVSb290VXVpZCwgWydjYy5EaXJlY3Rpb25hbExpZ2h0J10pO1xuICAgICAgICBhd2FpdCB0aGlzLmRlbGF5KDE1MCk7XG4gICAgICAgIHJldHVybiB7IGNhbWVyYVV1aWQsIGxpZ2h0VXVpZCB9O1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgY3JlYXRlTm9kZVdpdGhDb21wb25lbnRzKG5hbWU6IHN0cmluZywgcGFyZW50OiBzdHJpbmcsIGNvbXBvbmVudHM6IHN0cmluZ1tdKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnY3JlYXRlLW5vZGUnLCB7IG5hbWUsIHBhcmVudCB9KTtcbiAgICAgICAgY29uc3QgdXVpZCA9IEFycmF5LmlzQXJyYXkocmVzdWx0KSA/IHJlc3VsdFswXSA6IHJlc3VsdDtcbiAgICAgICAgaWYgKHR5cGVvZiB1dWlkICE9PSAnc3RyaW5nJyB8fCAhdXVpZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBjcmVhdGUtbm9kZSByZXR1cm5lZCBubyBVVUlEIGZvciAke25hbWV9YCk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gY3JlYXRlLW5vZGUgaGFzIG5vIGBjb21wb25lbnRzYCBmaWVsZCBvbiB0aGUgdHlwZWQgQ3JlYXRlTm9kZU9wdGlvbnMsXG4gICAgICAgIC8vIHNvIHdpcmUgY29tcG9uZW50cyB2aWEgdGhlIGRlZGljYXRlZCBjcmVhdGUtY29tcG9uZW50IGNoYW5uZWwuIEVhY2hcbiAgICAgICAgLy8gY2FsbCBuZWVkcyBhIHNtYWxsIGJyZWF0aCBmb3IgdGhlIGVkaXRvciB0byBzZXR0bGUgdGhlIGR1bXAuXG4gICAgICAgIGZvciAoY29uc3QgY29tcG9uZW50IG9mIGNvbXBvbmVudHMpIHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuZGVsYXkoODApO1xuICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnY3JlYXRlLWNvbXBvbmVudCcsIHsgdXVpZCwgY29tcG9uZW50IH0pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB1dWlkO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZmluZENvbXBvbmVudEluZGV4KG5vZGVVdWlkOiBzdHJpbmcsIGNvbXBvbmVudFR5cGU6IHN0cmluZyk6IFByb21pc2U8bnVtYmVyPiB7XG4gICAgICAgIGNvbnN0IGRhdGE6IGFueSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LW5vZGUnLCBub2RlVXVpZCk7XG4gICAgICAgIGNvbnN0IGNvbXBzID0gQXJyYXkuaXNBcnJheShkYXRhPy5fX2NvbXBzX18pID8gZGF0YS5fX2NvbXBzX18gOiBbXTtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjb21wcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgY29uc3QgdCA9IGNvbXBzW2ldPy5fX3R5cGVfXyA/PyBjb21wc1tpXT8udHlwZSA/PyBjb21wc1tpXT8uY2lkO1xuICAgICAgICAgICAgaWYgKHQgPT09IGNvbXBvbmVudFR5cGUpIHJldHVybiBpO1xuICAgICAgICB9XG4gICAgICAgIGRlYnVnTG9nKGBbU2NlbmVUb29sc10gY29tcG9uZW50ICcke2NvbXBvbmVudFR5cGV9JyBub3QgZm91bmQgb24gbm9kZSAke25vZGVVdWlkfWApO1xuICAgICAgICByZXR1cm4gLTE7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBkZWxheShtczogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocikgPT4gc2V0VGltZW91dChyLCBtcykpO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2V0U2NlbmVIaWVyYXJjaHkoaW5jbHVkZUNvbXBvbmVudHM6IGJvb2xlYW4gPSBmYWxzZSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgLy8g5YSq5YWI5ZqQ6Kmm5L2/55SoIEVkaXRvciBBUEkg5p+l6Kmi5aC05pmv56+A6bue5qi5XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1ub2RlLXRyZWUnKS50aGVuKCh0cmVlOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAodHJlZSkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBoaWVyYXJjaHkgPSB0aGlzLmJ1aWxkSGllcmFyY2h5KHRyZWUsIGluY2x1ZGVDb21wb25lbnRzKTtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShvayhoaWVyYXJjaHkpKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoJ05vIHNjZW5lIGhpZXJhcmNoeSBhdmFpbGFibGUnKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICAvLyDlgpnnlKjmlrnmoYjvvJrkvb/nlKjloLTmma/ohbPmnKxcbiAgICAgICAgICAgICAgICBydW5TY2VuZU1ldGhvZCgnZ2V0U2NlbmVIaWVyYXJjaHknLCBbaW5jbHVkZUNvbXBvbmVudHNdKS50aGVuKChyZXN1bHQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgfSkuY2F0Y2goKGVycjI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChgRGlyZWN0IEFQSSBmYWlsZWQ6ICR7ZXJyLm1lc3NhZ2V9LCBTY2VuZSBzY3JpcHQgZmFpbGVkOiAke2VycjIubWVzc2FnZX1gKSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBidWlsZEhpZXJhcmNoeShub2RlOiBhbnksIGluY2x1ZGVDb21wb25lbnRzOiBib29sZWFuKTogYW55IHtcbiAgICAgICAgY29uc3Qgbm9kZUluZm86IGFueSA9IHtcbiAgICAgICAgICAgIHV1aWQ6IG5vZGUudXVpZCxcbiAgICAgICAgICAgIG5hbWU6IG5vZGUubmFtZSxcbiAgICAgICAgICAgIHR5cGU6IG5vZGUudHlwZSxcbiAgICAgICAgICAgIGFjdGl2ZTogbm9kZS5hY3RpdmUsXG4gICAgICAgICAgICBjaGlsZHJlbjogW11cbiAgICAgICAgfTtcblxuICAgICAgICBpZiAoaW5jbHVkZUNvbXBvbmVudHMgJiYgbm9kZS5fX2NvbXBzX18pIHtcbiAgICAgICAgICAgIG5vZGVJbmZvLmNvbXBvbmVudHMgPSBub2RlLl9fY29tcHNfXy5tYXAoKGNvbXA6IGFueSkgPT4gKHtcbiAgICAgICAgICAgICAgICB0eXBlOiBjb21wLl9fdHlwZV9fIHx8ICdVbmtub3duJyxcbiAgICAgICAgICAgICAgICBlbmFibGVkOiBjb21wLmVuYWJsZWQgIT09IHVuZGVmaW5lZCA/IGNvbXAuZW5hYmxlZCA6IHRydWVcbiAgICAgICAgICAgIH0pKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChub2RlLmNoaWxkcmVuKSB7XG4gICAgICAgICAgICBub2RlSW5mby5jaGlsZHJlbiA9IG5vZGUuY2hpbGRyZW4ubWFwKChjaGlsZDogYW55KSA9PiBcbiAgICAgICAgICAgICAgICB0aGlzLmJ1aWxkSGllcmFyY2h5KGNoaWxkLCBpbmNsdWRlQ29tcG9uZW50cylcbiAgICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbm9kZUluZm87XG4gICAgfVxuXG4gICAgLy8gUHJvZ3JhbW1hdGljIHNhdmUtYXMuIFRoZSBjb2NvcyBgc2NlbmUvc2F2ZS1hcy1zY2VuZWAgY2hhbm5lbCBvbmx5IG9wZW5zXG4gICAgLy8gdGhlIG5hdGl2ZSBmaWxlIGRpYWxvZyAoYW5kIGJsb2NrcyB1bnRpbCB0aGUgdXNlciBkaXNtaXNzZXMgaXQg4oCUIHJvb3RcbiAgICAvLyBjYXVzZSBvZiB0aGUgPjE1cyB0aW1lb3V0IHJlcG9ydGVkIGluIEhBTkRPRkYpLCBzbyB3ZSBkbyBub3QgdXNlIGl0LlxuICAgIC8vIEluc3RlYWQ6IHNhdmUgdGhlIGN1cnJlbnQgc2NlbmUgdG8gZmx1c2ggZWRpdHMsIHJlc29sdmUgaXRzIGFzc2V0IHVybCxcbiAgICAvLyB0aGVuIGFzc2V0LWRiIGNvcHktYXNzZXQgdG8gdGhlIHRhcmdldCBwYXRoLiBPcHRpb25hbGx5IG9wZW4gdGhlIGNvcHkuXG4gICAgcHJpdmF0ZSBhc3luYyBzYXZlU2NlbmVBcyhhcmdzOiB7IHBhdGg6IHN0cmluZzsgb3BlbkFmdGVyPzogYm9vbGVhbjsgb3ZlcndyaXRlPzogYm9vbGVhbiB9KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnc2F2ZS1zY2VuZScpO1xuXG4gICAgICAgIGNvbnN0IHRyZWU6IGFueSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LW5vZGUtdHJlZScpO1xuICAgICAgICBjb25zdCBzY2VuZVV1aWQ6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHRyZWU/LnV1aWQ7XG4gICAgICAgIGlmICghc2NlbmVVdWlkKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbCgnTm8gc2NlbmUgaXMgY3VycmVudGx5IG9wZW4uJyk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBzb3VyY2VVcmwgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS11cmwnLCBzY2VuZVV1aWQpO1xuICAgICAgICBpZiAoIXNvdXJjZVVybCkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ0N1cnJlbnQgc2NlbmUgaGFzIG5vIGFzc2V0IHBhdGggb24gZGlzayB5ZXQuIFNhdmUgaXQgb25jZSB2aWEgdGhlIENvY29zIFVJIChvciB1c2UgY3JlYXRlX3NjZW5lIHRvIHdyaXRlIGEgYmFja2luZyBmaWxlKSBiZWZvcmUgc2F2ZV9zY2VuZV9hcyBjYW4gY29weSBpdC4nKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHRhcmdldFBhdGggPSBhcmdzLnBhdGguZW5kc1dpdGgoJy5zY2VuZScpID8gYXJncy5wYXRoIDogYCR7YXJncy5wYXRofS5zY2VuZWA7XG5cbiAgICAgICAgLy8gUHJlLWNoZWNrIGV4aXN0ZW5jZSBzbyBhIGNvbGxpc2lvbiByZXR1cm5zIGEgY2xlYW4gZXJyb3JcbiAgICAgICAgLy8gaW5zdGVhZCBvZiBsZXR0aW5nIGNvY29zIHBvcCBhIFwiZmlsZSBleGlzdHMsIG92ZXJ3cml0ZT9cIiBtb2RhbFxuICAgICAgICAvLyBhbmQgYmxvY2sgb24gdXNlciBpbnB1dC4gY29jb3Mgb25seSByZXNwZWN0cyBgb3ZlcndyaXRlOiB0cnVlYFxuICAgICAgICAvLyBzaWxlbnRseTsgdGhlICFvdmVyd3JpdGUgcGF0aCBvdGhlcndpc2Ugb3BlbnMgYSBkaWFsb2cuXG4gICAgICAgIGlmICghYXJncy5vdmVyd3JpdGUpIHtcbiAgICAgICAgICAgIGNvbnN0IGV4aXN0aW5nID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktdXVpZCcsIHRhcmdldFBhdGgpO1xuICAgICAgICAgICAgaWYgKGV4aXN0aW5nKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoYFRhcmdldCAnJHt0YXJnZXRQYXRofScgYWxyZWFkeSBleGlzdHMuIFBhc3Mgb3ZlcndyaXRlOiB0cnVlIHRvIHJlcGxhY2UgaXQuYCwgeyBleGlzdGluZ1V1aWQ6IGV4aXN0aW5nIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgY29weVJlc3VsdDogYW55ID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdChcbiAgICAgICAgICAgICdhc3NldC1kYicsXG4gICAgICAgICAgICAnY29weS1hc3NldCcsXG4gICAgICAgICAgICBzb3VyY2VVcmwsXG4gICAgICAgICAgICB0YXJnZXRQYXRoLFxuICAgICAgICAgICAgeyBvdmVyd3JpdGU6ICEhYXJncy5vdmVyd3JpdGUgfSxcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKCFjb3B5UmVzdWx0IHx8ICFjb3B5UmVzdWx0LnV1aWQpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGBhc3NldC1kYiBjb3B5LWFzc2V0IHJldHVybmVkIG5vIHJlc3VsdCBmb3IgJHtzb3VyY2VVcmx9IC0+ICR7dGFyZ2V0UGF0aH0uYCk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBvcGVuQWZ0ZXIgPSBhcmdzLm9wZW5BZnRlciAhPT0gZmFsc2U7XG4gICAgICAgIGlmIChvcGVuQWZ0ZXIpIHtcbiAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ29wZW4tc2NlbmUnLCBjb3B5UmVzdWx0LnV1aWQpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG9rKHtcbiAgICAgICAgICAgICAgICBzb3VyY2VVcmwsXG4gICAgICAgICAgICAgICAgbmV3VXVpZDogY29weVJlc3VsdC51dWlkLFxuICAgICAgICAgICAgICAgIG5ld1VybDogY29weVJlc3VsdC51cmwsXG4gICAgICAgICAgICAgICAgb3BlbmVkOiBvcGVuQWZ0ZXIsXG4gICAgICAgICAgICB9LCBgU2NlbmUgc2F2ZWQgYXMgJHtjb3B5UmVzdWx0LnVybH1gKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGNsb3NlU2NlbmUoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdjbG9zZS1zY2VuZScpLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2sodW5kZWZpbmVkLCAnU2NlbmUgY2xvc2VkIHN1Y2Nlc3NmdWxseScpKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxufVxuIl19