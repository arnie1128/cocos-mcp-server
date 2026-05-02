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
                description: 'Read the currently open scene root summary (name/uuid/type/active/nodeCount). No scene mutation; use to get the scene root UUID. Also exposed as resource cocos://scene/current; prefer the resource when the client supports MCP resources.',
                inputSchema: schema_1.z.object({}),
                handler: () => this.getCurrentScene(),
            },
            {
                name: 'get_scene_list',
                title: 'List scene assets',
                description: 'List .scene assets under db://assets with name/path/uuid. Does not open scenes or modify assets. Also exposed as resource cocos://scene/list.',
                inputSchema: schema_1.z.object({}),
                handler: () => this.getSceneList(),
            },
            {
                name: 'open_scene',
                title: 'Open scene by path',
                description: 'Open a scene by db:// path. Switches the active Editor scene; save current edits first if needed.',
                inputSchema: schema_1.z.object({
                    scenePath: schema_1.z.string().describe('Scene db:// path to open, e.g. db://assets/scenes/Main.scene. The tool resolves UUID first.'),
                }),
                handler: a => this.openScene(a.scenePath),
            },
            {
                name: 'save_scene',
                title: 'Save current scene',
                description: 'Save the currently open scene back to its scene asset. Mutates the project file on disk.',
                inputSchema: schema_1.z.object({}),
                handler: () => this.saveScene(),
            },
            {
                name: 'create_scene',
                title: 'Create scene asset',
                description: 'Create a new .scene asset. Mutates asset-db; non-empty templates also open the new scene and populate standard Camera/Canvas or Camera/Light nodes.',
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
                description: 'Copy the currently open scene to a new .scene asset. Saves current scene first; optionally opens the copy and can overwrite when requested.',
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
                description: 'Close the current scene. Editor state side effect; save first if unsaved changes matter.',
                inputSchema: schema_1.z.object({}),
                handler: () => this.closeScene(),
            },
            {
                name: 'get_scene_hierarchy',
                title: 'Read scene hierarchy',
                description: 'Read the complete current scene node hierarchy. No mutation; use for UUID/path lookup, optionally with component summaries. Also exposed as resource cocos://scene/hierarchy (defaults: includeComponents=false); prefer the resource for full-tree reads.',
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
        return new Promise(async (resolve) => {
            var _a;
            try {
                await Editor.Message.request('scene', 'save-scene');
                const tree = await Editor.Message.request('scene', 'query-node-tree');
                const sceneUuid = tree === null || tree === void 0 ? void 0 : tree.uuid;
                if (!sceneUuid) {
                    resolve((0, response_1.fail)('No scene is currently open.'));
                    return;
                }
                const sourceUrl = await Editor.Message.request('asset-db', 'query-url', sceneUuid);
                if (!sourceUrl) {
                    resolve((0, response_1.fail)('Current scene has no asset path on disk yet. Save it once via the Cocos UI (or use create_scene to write a backing file) before save_scene_as can copy it.'));
                    return;
                }
                const targetPath = args.path.endsWith('.scene') ? args.path : `${args.path}.scene`;
                // Pre-check existence so a collision returns a clean error
                // instead of letting cocos pop a "file exists, overwrite?" modal
                // and block on user input. cocos only respects `overwrite: true`
                // silently; the !overwrite path otherwise opens a dialog.
                if (!args.overwrite) {
                    const existing = await Editor.Message.request('asset-db', 'query-uuid', targetPath);
                    if (existing) {
                        resolve((0, response_1.fail)(`Target '${targetPath}' already exists. Pass overwrite: true to replace it.`, { existingUuid: existing }));
                        return;
                    }
                }
                const copyResult = await Editor.Message.request('asset-db', 'copy-asset', sourceUrl, targetPath, { overwrite: !!args.overwrite });
                if (!copyResult || !copyResult.uuid) {
                    resolve((0, response_1.fail)(`asset-db copy-asset returned no result for ${sourceUrl} -> ${targetPath}.`));
                    return;
                }
                const openAfter = args.openAfter !== false;
                if (openAfter) {
                    await Editor.Message.request('scene', 'open-scene', copyResult.uuid);
                }
                resolve((0, response_1.ok)({
                    sourceUrl,
                    newUuid: copyResult.uuid,
                    newUrl: copyResult.url,
                    opened: openAfter,
                }, `Scene saved as ${copyResult.url}`));
            }
            catch (err) {
                resolve((0, response_1.fail)((_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : String(err)));
            }
        });
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NlbmUtdG9vbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvdG9vbHMvc2NlbmUtdG9vbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsOENBQTJDO0FBRTNDLDBDQUFrQztBQUNsQyxzREFBMkQ7QUFDM0Qsc0RBQXFEO0FBQ3JELHVEQUFtRDtBQUNuRCxvQ0FBc0M7QUFFdEMsTUFBTSxXQUFXLEdBQUcsUUFBUSxDQUFDO0FBRTdCLE1BQWEsVUFBVTtJQUduQjtRQTJKUSxtQkFBYyxHQUFHLElBQUksZ0NBQWMsRUFBRSxDQUFDO1FBMUoxQyxNQUFNLElBQUksR0FBYztZQUNwQjtnQkFDSSxJQUFJLEVBQUUsbUJBQW1CO2dCQUN6QixLQUFLLEVBQUUsb0JBQW9CO2dCQUMzQixXQUFXLEVBQUUsOE9BQThPO2dCQUMzUCxXQUFXLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7Z0JBQ3pCLE9BQU8sRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFO2FBQ3hDO1lBQ0Q7Z0JBQ0ksSUFBSSxFQUFFLGdCQUFnQjtnQkFDdEIsS0FBSyxFQUFFLG1CQUFtQjtnQkFDMUIsV0FBVyxFQUFFLCtJQUErSTtnQkFDNUosV0FBVyxFQUFFLFVBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO2dCQUN6QixPQUFPLEVBQUUsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLFlBQVksRUFBRTthQUNyQztZQUNEO2dCQUNJLElBQUksRUFBRSxZQUFZO2dCQUNsQixLQUFLLEVBQUUsb0JBQW9CO2dCQUMzQixXQUFXLEVBQUUsbUdBQW1HO2dCQUNoSCxXQUFXLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQztvQkFDbEIsU0FBUyxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLENBQUMsNkZBQTZGLENBQUM7aUJBQ2hJLENBQUM7Z0JBQ0YsT0FBTyxFQUFFLENBQUMsQ0FBQyxFQUFFLENB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Z0JBQ2hCLE9BQU8sQ0FBQyxJQUFBLGVBQUksRUFBQyxNQUFBLEdBQUcsYUFBSCxHQUFHLHVCQUFILEdBQUcsQ0FBRSxPQUFPLG1DQUFJLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDL0MsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztJQUVPLEtBQUssQ0FBQyxVQUFVO1FBQ3BCLE9BQU8sSUFBSSxPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsRUFBRTtZQUMzQixNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsYUFBYSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRTtnQkFDckQsT0FBTyxDQUFDLElBQUEsYUFBRSxFQUFDLFNBQVMsRUFBRSwyQkFBMkIsQ0FBQyxDQUFDLENBQUM7WUFDeEQsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBVSxFQUFFLEVBQUU7Z0JBQ3BCLE9BQU8sQ0FBQyxJQUFBLGVBQUksRUFBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztZQUMvQixDQUFDLENBQUMsQ0FBQztRQUNQLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztDQUNKO0FBOWtCRCxnQ0E4a0JDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgb2ssIGZhaWwgfSBmcm9tICcuLi9saWIvcmVzcG9uc2UnO1xuaW1wb3J0IHsgVG9vbERlZmluaXRpb24sIFRvb2xSZXNwb25zZSwgVG9vbEV4ZWN1dG9yLCBTY2VuZUluZm8gfSBmcm9tICcuLi90eXBlcyc7XG5pbXBvcnQgeyB6IH0gZnJvbSAnLi4vbGliL3NjaGVtYSc7XG5pbXBvcnQgeyBkZWZpbmVUb29scywgVG9vbERlZiB9IGZyb20gJy4uL2xpYi9kZWZpbmUtdG9vbHMnO1xuaW1wb3J0IHsgcnVuU2NlbmVNZXRob2QgfSBmcm9tICcuLi9saWIvc2NlbmUtYnJpZGdlJztcbmltcG9ydCB7IENvbXBvbmVudFRvb2xzIH0gZnJvbSAnLi9jb21wb25lbnQtdG9vbHMnO1xuaW1wb3J0IHsgZGVidWdMb2cgfSBmcm9tICcuLi9saWIvbG9nJztcblxuY29uc3QgTEFZRVJfVUlfMkQgPSAzMzU1NDQzMjtcblxuZXhwb3J0IGNsYXNzIFNjZW5lVG9vbHMgaW1wbGVtZW50cyBUb29sRXhlY3V0b3Ige1xuICAgIHByaXZhdGUgcmVhZG9ubHkgZXhlYzogVG9vbEV4ZWN1dG9yO1xuXG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIGNvbnN0IGRlZnM6IFRvb2xEZWZbXSA9IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnZ2V0X2N1cnJlbnRfc2NlbmUnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnUmVhZCBjdXJyZW50IHNjZW5lJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1JlYWQgdGhlIGN1cnJlbnRseSBvcGVuIHNjZW5lIHJvb3Qgc3VtbWFyeSAobmFtZS91dWlkL3R5cGUvYWN0aXZlL25vZGVDb3VudCkuIE5vIHNjZW5lIG11dGF0aW9uOyB1c2UgdG8gZ2V0IHRoZSBzY2VuZSByb290IFVVSUQuIEFsc28gZXhwb3NlZCBhcyByZXNvdXJjZSBjb2NvczovL3NjZW5lL2N1cnJlbnQ7IHByZWZlciB0aGUgcmVzb3VyY2Ugd2hlbiB0aGUgY2xpZW50IHN1cHBvcnRzIE1DUCByZXNvdXJjZXMuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6ICgpID0+IHRoaXMuZ2V0Q3VycmVudFNjZW5lKCksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdnZXRfc2NlbmVfbGlzdCcsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdMaXN0IHNjZW5lIGFzc2V0cycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdMaXN0IC5zY2VuZSBhc3NldHMgdW5kZXIgZGI6Ly9hc3NldHMgd2l0aCBuYW1lL3BhdGgvdXVpZC4gRG9lcyBub3Qgb3BlbiBzY2VuZXMgb3IgbW9kaWZ5IGFzc2V0cy4gQWxzbyBleHBvc2VkIGFzIHJlc291cmNlIGNvY29zOi8vc2NlbmUvbGlzdC4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogKCkgPT4gdGhpcy5nZXRTY2VuZUxpc3QoKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ29wZW5fc2NlbmUnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnT3BlbiBzY2VuZSBieSBwYXRoJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ09wZW4gYSBzY2VuZSBieSBkYjovLyBwYXRoLiBTd2l0Y2hlcyB0aGUgYWN0aXZlIEVkaXRvciBzY2VuZTsgc2F2ZSBjdXJyZW50IGVkaXRzIGZpcnN0IGlmIG5lZWRlZC4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHNjZW5lUGF0aDogei5zdHJpbmcoKS5kZXNjcmliZSgnU2NlbmUgZGI6Ly8gcGF0aCB0byBvcGVuLCBlLmcuIGRiOi8vYXNzZXRzL3NjZW5lcy9NYWluLnNjZW5lLiBUaGUgdG9vbCByZXNvbHZlcyBVVUlEIGZpcnN0LicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy5vcGVuU2NlbmUoYS5zY2VuZVBhdGgpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnc2F2ZV9zY2VuZScsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdTYXZlIGN1cnJlbnQgc2NlbmUnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnU2F2ZSB0aGUgY3VycmVudGx5IG9wZW4gc2NlbmUgYmFjayB0byBpdHMgc2NlbmUgYXNzZXQuIE11dGF0ZXMgdGhlIHByb2plY3QgZmlsZSBvbiBkaXNrLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiAoKSA9PiB0aGlzLnNhdmVTY2VuZSgpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnY3JlYXRlX3NjZW5lJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ0NyZWF0ZSBzY2VuZSBhc3NldCcsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdDcmVhdGUgYSBuZXcgLnNjZW5lIGFzc2V0LiBNdXRhdGVzIGFzc2V0LWRiOyBub24tZW1wdHkgdGVtcGxhdGVzIGFsc28gb3BlbiB0aGUgbmV3IHNjZW5lIGFuZCBwb3B1bGF0ZSBzdGFuZGFyZCBDYW1lcmEvQ2FudmFzIG9yIENhbWVyYS9MaWdodCBub2Rlcy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHNjZW5lTmFtZTogei5zdHJpbmcoKS5kZXNjcmliZSgnTmV3IHNjZW5lIG5hbWU7IHdyaXR0ZW4gaW50byB0aGUgY3JlYXRlZCBjYy5TY2VuZUFzc2V0IC8gY2MuU2NlbmUuJyksXG4gICAgICAgICAgICAgICAgICAgIHNhdmVQYXRoOiB6LnN0cmluZygpLmRlc2NyaWJlKCdUYXJnZXQgc2NlbmUgbG9jYXRpb24uIFBhc3MgYSBmdWxsIC5zY2VuZSBwYXRoIG9yIGEgZm9sZGVyIHBhdGggdG8gYXBwZW5kIHNjZW5lTmFtZS5zY2VuZS4nKSxcbiAgICAgICAgICAgICAgICAgICAgdGVtcGxhdGU6IHouZW51bShbJ2VtcHR5JywgJzJkLXVpJywgJzNkLWJhc2ljJ10pLmRlZmF1bHQoJ2VtcHR5JykuZGVzY3JpYmUoXG4gICAgICAgICAgICAgICAgICAgICAgICAnQnVpbHQtaW4gc2NhZmZvbGRpbmcgZm9yIHRoZSBuZXcgc2NlbmUuICcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgJ1wiZW1wdHlcIiAoZGVmYXVsdCk6IGJhcmUgc2NlbmUgcm9vdCBvbmx5IOKAlCBjdXJyZW50IGJlaGF2aW9yLiAnICtcbiAgICAgICAgICAgICAgICAgICAgICAgICdcIjJkLXVpXCI6IENhbWVyYSAoY2MuQ2FtZXJhLCBvcnRobyBwcm9qZWN0aW9uKSArIENhbnZhcyAoY2MuVUlUcmFuc2Zvcm0gKyBjYy5DYW52YXMgd2l0aCBjYW1lcmFDb21wb25lbnQgbGlua2VkLCBsYXllciBVSV8yRCkgc28gVUkgbm9kZXMgcmVuZGVyIGltbWVkaWF0ZWx5IHVuZGVyIHRoZSBVSSBjYW1lcmEuICcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgJ1wiM2QtYmFzaWNcIjogQ2FtZXJhIChwZXJzcGVjdGl2ZSkgKyBEaXJlY3Rpb25hbExpZ2h0IGF0IHNjZW5lIHJvb3QuICcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgJ+KaoO+4jyBTaWRlIGVmZmVjdDogd2hlbiB0ZW1wbGF0ZSBpcyBub3QgXCJlbXB0eVwiIHRoZSBlZGl0b3Igb3BlbnMgdGhlIG5ld2x5IGNyZWF0ZWQgc2NlbmUgdG8gcG9wdWxhdGUgaXQuIFNhdmUgeW91ciBjdXJyZW50IHNjZW5lIGZpcnN0IGlmIGl0IGhhcyB1bnNhdmVkIGNoYW5nZXMuJ1xuICAgICAgICAgICAgICAgICAgICApLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy5jcmVhdGVTY2VuZShhLnNjZW5lTmFtZSwgYS5zYXZlUGF0aCwgYS50ZW1wbGF0ZSksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdzYXZlX3NjZW5lX2FzJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ0NvcHkgc2NlbmUgYXNzZXQnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnQ29weSB0aGUgY3VycmVudGx5IG9wZW4gc2NlbmUgdG8gYSBuZXcgLnNjZW5lIGFzc2V0LiBTYXZlcyBjdXJyZW50IHNjZW5lIGZpcnN0OyBvcHRpb25hbGx5IG9wZW5zIHRoZSBjb3B5IGFuZCBjYW4gb3ZlcndyaXRlIHdoZW4gcmVxdWVzdGVkLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgcGF0aDogei5zdHJpbmcoKS5kZXNjcmliZSgnVGFyZ2V0IGRiOi8vIHBhdGggZm9yIHRoZSBuZXcgc2NlbmUgZmlsZSAoZS5nLiBcImRiOi8vYXNzZXRzL3NjZW5lcy9Db3B5LnNjZW5lXCIpLiBUaGUgXCIuc2NlbmVcIiBleHRlbnNpb24gaXMgYXBwZW5kZWQgaWYgbWlzc2luZy4nKSxcbiAgICAgICAgICAgICAgICAgICAgb3BlbkFmdGVyOiB6LmJvb2xlYW4oKS5kZWZhdWx0KHRydWUpLmRlc2NyaWJlKCdPcGVuIHRoZSBuZXdseS1zYXZlZCBzY2VuZSByaWdodCBhZnRlciB0aGUgY29weS4gRGVmYXVsdCB0cnVlLiBQYXNzIGZhbHNlIHRvIGtlZXAgdGhlIGN1cnJlbnQgc2NlbmUgZm9jdXNlZC4nKSxcbiAgICAgICAgICAgICAgICAgICAgb3ZlcndyaXRlOiB6LmJvb2xlYW4oKS5kZWZhdWx0KGZhbHNlKS5kZXNjcmliZSgnT3ZlcndyaXRlIHRoZSB0YXJnZXQgZmlsZSBpZiBpdCBhbHJlYWR5IGV4aXN0cy4gRGVmYXVsdCBmYWxzZTsgd2l0aCBmYWxzZSwgYSBuYW1lIGNvbGxpc2lvbiByZXR1cm5zIGFuIGVycm9yLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy5zYXZlU2NlbmVBcyhhKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2Nsb3NlX3NjZW5lJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ0Nsb3NlIGN1cnJlbnQgc2NlbmUnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnQ2xvc2UgdGhlIGN1cnJlbnQgc2NlbmUuIEVkaXRvciBzdGF0ZSBzaWRlIGVmZmVjdDsgc2F2ZSBmaXJzdCBpZiB1bnNhdmVkIGNoYW5nZXMgbWF0dGVyLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiAoKSA9PiB0aGlzLmNsb3NlU2NlbmUoKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2dldF9zY2VuZV9oaWVyYXJjaHknLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnUmVhZCBzY2VuZSBoaWVyYXJjaHknLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnUmVhZCB0aGUgY29tcGxldGUgY3VycmVudCBzY2VuZSBub2RlIGhpZXJhcmNoeS4gTm8gbXV0YXRpb247IHVzZSBmb3IgVVVJRC9wYXRoIGxvb2t1cCwgb3B0aW9uYWxseSB3aXRoIGNvbXBvbmVudCBzdW1tYXJpZXMuIEFsc28gZXhwb3NlZCBhcyByZXNvdXJjZSBjb2NvczovL3NjZW5lL2hpZXJhcmNoeSAoZGVmYXVsdHM6IGluY2x1ZGVDb21wb25lbnRzPWZhbHNlKTsgcHJlZmVyIHRoZSByZXNvdXJjZSBmb3IgZnVsbC10cmVlIHJlYWRzLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgaW5jbHVkZUNvbXBvbmVudHM6IHouYm9vbGVhbigpLmRlZmF1bHQoZmFsc2UpLmRlc2NyaWJlKCdJbmNsdWRlIGNvbXBvbmVudCB0eXBlL2VuYWJsZWQgc3VtbWFyaWVzIG9uIGVhY2ggbm9kZS4gSW5jcmVhc2VzIHJlc3BvbnNlIHNpemUuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLmdldFNjZW5lSGllcmFyY2h5KGEuaW5jbHVkZUNvbXBvbmVudHMpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgXTtcbiAgICAgICAgdGhpcy5leGVjID0gZGVmaW5lVG9vbHMoZGVmcyk7XG4gICAgfVxuXG4gICAgZ2V0VG9vbHMoKTogVG9vbERlZmluaXRpb25bXSB7IHJldHVybiB0aGlzLmV4ZWMuZ2V0VG9vbHMoKTsgfVxuICAgIGV4ZWN1dGUodG9vbE5hbWU6IHN0cmluZywgYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHsgcmV0dXJuIHRoaXMuZXhlYy5leGVjdXRlKHRvb2xOYW1lLCBhcmdzKTsgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRDdXJyZW50U2NlbmUoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICAvLyDnm7TmjqXkvb/nlKggcXVlcnktbm9kZS10cmVlIOS+hueNsuWPluWgtOaZr+S/oeaBr++8iOmAmeWAi+aWueazleW3sue2k+mpl+itieWPr+eUqO+8iVxuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktbm9kZS10cmVlJykudGhlbigodHJlZTogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHRyZWUgJiYgdHJlZS51dWlkKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5hbWU6IHRyZWUubmFtZSB8fCAnQ3VycmVudCBTY2VuZScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdXVpZDogdHJlZS51dWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6IHRyZWUudHlwZSB8fCAnY2MuU2NlbmUnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFjdGl2ZTogdHJlZS5hY3RpdmUgIT09IHVuZGVmaW5lZCA/IHRyZWUuYWN0aXZlIDogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBub2RlQ291bnQ6IHRyZWUuY2hpbGRyZW4gPyB0cmVlLmNoaWxkcmVuLmxlbmd0aCA6IDBcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoJ05vIHNjZW5lIGRhdGEgYXZhaWxhYmxlJykpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgLy8g5YKZ55So5pa55qGI77ya5L2/55So5aC05pmv6IWz5pysXG4gICAgICAgICAgICAgICAgcnVuU2NlbmVNZXRob2QoJ2dldEN1cnJlbnRTY2VuZUluZm8nLCBbXSkudGhlbigocmVzdWx0OiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgICAgICAgIH0pLmNhdGNoKChlcnIyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoYERpcmVjdCBBUEkgZmFpbGVkOiAke2Vyci5tZXNzYWdlfSwgU2NlbmUgc2NyaXB0IGZhaWxlZDogJHtlcnIyLm1lc3NhZ2V9YCkpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2V0U2NlbmVMaXN0KCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgLy8gTm90ZTogcXVlcnktYXNzZXRzIEFQSSBjb3JyZWN0ZWQgd2l0aCBwcm9wZXIgcGFyYW1ldGVyc1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXRzJywge1xuICAgICAgICAgICAgICAgIHBhdHRlcm46ICdkYjovL2Fzc2V0cy8qKi8qLnNjZW5lJ1xuICAgICAgICAgICAgfSkudGhlbigocmVzdWx0czogYW55W10pID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBzY2VuZXM6IFNjZW5lSW5mb1tdID0gcmVzdWx0cy5tYXAoYXNzZXQgPT4gKHtcbiAgICAgICAgICAgICAgICAgICAgbmFtZTogYXNzZXQubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgcGF0aDogYXNzZXQudXJsLFxuICAgICAgICAgICAgICAgICAgICB1dWlkOiBhc3NldC51dWlkXG4gICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2soc2NlbmVzKSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgb3BlblNjZW5lKHNjZW5lUGF0aDogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICAvLyDpppblhYjnjbLlj5bloLTmma/nmoRVVUlEXG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS11dWlkJywgc2NlbmVQYXRoKS50aGVuKCh1dWlkOiBzdHJpbmcgfCBudWxsKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKCF1dWlkKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignU2NlbmUgbm90IGZvdW5kJyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIC8vIOS9v+eUqOato+eiuueahCBzY2VuZSBBUEkg5omT6ZaL5aC05pmvICjpnIDopoFVVUlEKVxuICAgICAgICAgICAgICAgIHJldHVybiBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdvcGVuLXNjZW5lJywgdXVpZCk7XG4gICAgICAgICAgICB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHVuZGVmaW5lZCwgYFNjZW5lIG9wZW5lZDogJHtzY2VuZVBhdGh9YCkpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHNhdmVTY2VuZSgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3NhdmUtc2NlbmUnKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHVuZGVmaW5lZCwgJ1NjZW5lIHNhdmVkIHN1Y2Nlc3NmdWxseScpKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBjb21wb25lbnRUb29scyA9IG5ldyBDb21wb25lbnRUb29scygpO1xuXG4gICAgcHJpdmF0ZSBhc3luYyBjcmVhdGVTY2VuZShzY2VuZU5hbWU6IHN0cmluZywgc2F2ZVBhdGg6IHN0cmluZywgdGVtcGxhdGU6ICdlbXB0eScgfCAnMmQtdWknIHwgJzNkLWJhc2ljJyA9ICdlbXB0eScpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIC8vIOeiuuS/nei3r+W+keS7pS5zY2VuZee1kOWwvlxuICAgICAgICAgICAgY29uc3QgZnVsbFBhdGggPSBzYXZlUGF0aC5lbmRzV2l0aCgnLnNjZW5lJykgPyBzYXZlUGF0aCA6IGAke3NhdmVQYXRofS8ke3NjZW5lTmFtZX0uc2NlbmVgO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyDkvb/nlKjmraPnorrnmoRDb2NvcyBDcmVhdG9yIDMuOOWgtOaZr+agvOW8j1xuICAgICAgICAgICAgY29uc3Qgc2NlbmVDb250ZW50ID0gSlNPTi5zdHJpbmdpZnkoW1xuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCJfX3R5cGVfX1wiOiBcImNjLlNjZW5lQXNzZXRcIixcbiAgICAgICAgICAgICAgICAgICAgXCJfbmFtZVwiOiBzY2VuZU5hbWUsXG4gICAgICAgICAgICAgICAgICAgIFwiX29iakZsYWdzXCI6IDAsXG4gICAgICAgICAgICAgICAgICAgIFwiX19lZGl0b3JFeHRyYXNfX1wiOiB7fSxcbiAgICAgICAgICAgICAgICAgICAgXCJfbmF0aXZlXCI6IFwiXCIsXG4gICAgICAgICAgICAgICAgICAgIFwic2NlbmVcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJfX2lkX19cIjogMVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIFwiX190eXBlX19cIjogXCJjYy5TY2VuZVwiLFxuICAgICAgICAgICAgICAgICAgICBcIl9uYW1lXCI6IHNjZW5lTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgXCJfb2JqRmxhZ3NcIjogMCxcbiAgICAgICAgICAgICAgICAgICAgXCJfX2VkaXRvckV4dHJhc19fXCI6IHt9LFxuICAgICAgICAgICAgICAgICAgICBcIl9wYXJlbnRcIjogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgXCJfY2hpbGRyZW5cIjogW10sXG4gICAgICAgICAgICAgICAgICAgIFwiX2FjdGl2ZVwiOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBcIl9jb21wb25lbnRzXCI6IFtdLFxuICAgICAgICAgICAgICAgICAgICBcIl9wcmVmYWJcIjogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgXCJfbHBvc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcIl9fdHlwZV9fXCI6IFwiY2MuVmVjM1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ4XCI6IDAsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInlcIjogMCxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwielwiOiAwXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIFwiX2xyb3RcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJfX3R5cGVfX1wiOiBcImNjLlF1YXRcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIFwieFwiOiAwLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ5XCI6IDAsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInpcIjogMCxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwid1wiOiAxXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIFwiX2xzY2FsZVwiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcIl9fdHlwZV9fXCI6IFwiY2MuVmVjM1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ4XCI6IDEsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInlcIjogMSxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwielwiOiAxXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIFwiX21vYmlsaXR5XCI6IDAsXG4gICAgICAgICAgICAgICAgICAgIFwiX2xheWVyXCI6IDEwNzM3NDE4MjQsXG4gICAgICAgICAgICAgICAgICAgIFwiX2V1bGVyXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiX190eXBlX19cIjogXCJjYy5WZWMzXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInhcIjogMCxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwieVwiOiAwLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ6XCI6IDBcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgXCJhdXRvUmVsZWFzZUFzc2V0c1wiOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgXCJfZ2xvYmFsc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcIl9faWRfX1wiOiAyXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIFwiX2lkXCI6IFwic2NlbmVcIlxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcIl9fdHlwZV9fXCI6IFwiY2MuU2NlbmVHbG9iYWxzXCIsXG4gICAgICAgICAgICAgICAgICAgIFwiYW1iaWVudFwiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcIl9faWRfX1wiOiAzXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIFwic2t5Ym94XCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiX19pZF9fXCI6IDRcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgXCJmb2dcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJfX2lkX19cIjogNVxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICBcIm9jdHJlZVwiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcIl9faWRfX1wiOiA2XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCJfX3R5cGVfX1wiOiBcImNjLkFtYmllbnRJbmZvXCIsXG4gICAgICAgICAgICAgICAgICAgIFwiX3NreUNvbG9ySERSXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiX190eXBlX19cIjogXCJjYy5WZWM0XCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInhcIjogMC4yLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ5XCI6IDAuNSxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwielwiOiAwLjgsXG4gICAgICAgICAgICAgICAgICAgICAgICBcIndcIjogMC41MjA4MzNcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgXCJfc2t5Q29sb3JcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJfX3R5cGVfX1wiOiBcImNjLlZlYzRcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIFwieFwiOiAwLjIsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInlcIjogMC41LFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ6XCI6IDAuOCxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwid1wiOiAwLjUyMDgzM1xuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICBcIl9za3lJbGx1bUhEUlwiOiAyMDAwMCxcbiAgICAgICAgICAgICAgICAgICAgXCJfc2t5SWxsdW1cIjogMjAwMDAsXG4gICAgICAgICAgICAgICAgICAgIFwiX2dyb3VuZEFsYmVkb0hEUlwiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcIl9fdHlwZV9fXCI6IFwiY2MuVmVjNFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ4XCI6IDAuMixcbiAgICAgICAgICAgICAgICAgICAgICAgIFwieVwiOiAwLjIsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInpcIjogMC4yLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ3XCI6IDFcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgXCJfZ3JvdW5kQWxiZWRvXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiX190eXBlX19cIjogXCJjYy5WZWM0XCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInhcIjogMC4yLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ5XCI6IDAuMixcbiAgICAgICAgICAgICAgICAgICAgICAgIFwielwiOiAwLjIsXG4gICAgICAgICAgICAgICAgICAgICAgICBcIndcIjogMVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIFwiX190eXBlX19cIjogXCJjYy5Ta3lib3hJbmZvXCIsXG4gICAgICAgICAgICAgICAgICAgIFwiX2VudkxpZ2h0aW5nVHlwZVwiOiAwLFxuICAgICAgICAgICAgICAgICAgICBcIl9lbnZtYXBIRFJcIjogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgXCJfZW52bWFwXCI6IG51bGwsXG4gICAgICAgICAgICAgICAgICAgIFwiX2Vudm1hcExvZENvdW50XCI6IDAsXG4gICAgICAgICAgICAgICAgICAgIFwiX2RpZmZ1c2VNYXBIRFJcIjogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgXCJfZGlmZnVzZU1hcFwiOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICBcIl9lbmFibGVkXCI6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICBcIl91c2VIRFJcIjogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgXCJfZWRpdGFibGVNYXRlcmlhbFwiOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICBcIl9yZWZsZWN0aW9uSERSXCI6IG51bGwsXG4gICAgICAgICAgICAgICAgICAgIFwiX3JlZmxlY3Rpb25NYXBcIjogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgXCJfcm90YXRpb25BbmdsZVwiOiAwXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIFwiX190eXBlX19cIjogXCJjYy5Gb2dJbmZvXCIsXG4gICAgICAgICAgICAgICAgICAgIFwiX3R5cGVcIjogMCxcbiAgICAgICAgICAgICAgICAgICAgXCJfZm9nQ29sb3JcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJfX3R5cGVfX1wiOiBcImNjLkNvbG9yXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInJcIjogMjAwLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJnXCI6IDIwMCxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiYlwiOiAyMDAsXG4gICAgICAgICAgICAgICAgICAgICAgICBcImFcIjogMjU1XG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIFwiX2VuYWJsZWRcIjogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIFwiX2ZvZ0RlbnNpdHlcIjogMC4zLFxuICAgICAgICAgICAgICAgICAgICBcIl9mb2dTdGFydFwiOiAwLjUsXG4gICAgICAgICAgICAgICAgICAgIFwiX2ZvZ0VuZFwiOiAzMDAsXG4gICAgICAgICAgICAgICAgICAgIFwiX2ZvZ0F0dGVuXCI6IDUsXG4gICAgICAgICAgICAgICAgICAgIFwiX2ZvZ1RvcFwiOiAxLjUsXG4gICAgICAgICAgICAgICAgICAgIFwiX2ZvZ1JhbmdlXCI6IDEuMixcbiAgICAgICAgICAgICAgICAgICAgXCJfYWNjdXJhdGVcIjogZmFsc2VcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCJfX3R5cGVfX1wiOiBcImNjLk9jdHJlZUluZm9cIixcbiAgICAgICAgICAgICAgICAgICAgXCJfZW5hYmxlZFwiOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgXCJfbWluUG9zXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiX190eXBlX19cIjogXCJjYy5WZWMzXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInhcIjogLTEwMjQsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInlcIjogLTEwMjQsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInpcIjogLTEwMjRcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgXCJfbWF4UG9zXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiX190eXBlX19cIjogXCJjYy5WZWMzXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInhcIjogMTAyNCxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwieVwiOiAxMDI0LFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ6XCI6IDEwMjRcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgXCJfZGVwdGhcIjogOFxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIF0sIG51bGwsIDIpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdjcmVhdGUtYXNzZXQnLCBmdWxsUGF0aCwgc2NlbmVDb250ZW50KS50aGVuKGFzeW5jIChyZXN1bHQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmICh0ZW1wbGF0ZSA9PT0gJ2VtcHR5Jykge1xuICAgICAgICAgICAgICAgICAgICAvLyBFeGlzdGluZyBwYXRoOiB2ZXJpZnkgYW5kIHJldHVybi5cbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHNjZW5lTGlzdCA9IGF3YWl0IHRoaXMuZ2V0U2NlbmVMaXN0KCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjcmVhdGVkU2NlbmUgPSBzY2VuZUxpc3QuZGF0YT8uZmluZCgoc2NlbmU6IGFueSkgPT4gc2NlbmUudXVpZCA9PT0gcmVzdWx0LnV1aWQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IHJlc3VsdC51dWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB1cmw6IHJlc3VsdC51cmwsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5hbWU6IHNjZW5lTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGVtcGxhdGUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBTY2VuZSAnJHtzY2VuZU5hbWV9JyBjcmVhdGVkIHN1Y2Nlc3NmdWxseWAsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNjZW5lVmVyaWZpZWQ6ICEhY3JlYXRlZFNjZW5lLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmVyaWZpY2F0aW9uRGF0YTogY3JlYXRlZFNjZW5lLFxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IHJlc3VsdC51dWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB1cmw6IHJlc3VsdC51cmwsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5hbWU6IHNjZW5lTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGVtcGxhdGUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBTY2VuZSAnJHtzY2VuZU5hbWV9JyBjcmVhdGVkIHN1Y2Nlc3NmdWxseSAodmVyaWZpY2F0aW9uIGZhaWxlZClgLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gVGVtcGxhdGUgcGF0aDogb3BlbiB0aGUgbmV3bHktY3JlYXRlZCBzY2VuZSBhc3NldCBhbmQgYmFrZSB0aGVcbiAgICAgICAgICAgICAgICAvLyBzdGFuZGFyZCBub2Rlcy9jb21wb25lbnRzIG9uIHRvcCBvZiB0aGUgZW1wdHkgc2NhZmZvbGRpbmcgd2VcbiAgICAgICAgICAgICAgICAvLyBqdXN0IHdyb3RlLiBEb25lIGhvc3Qtc2lkZSB2aWEgRWRpdG9yLk1lc3NhZ2Ugc28gYmVoYXZpb3JcbiAgICAgICAgICAgICAgICAvLyBtYXRjaGVzIHdoYXQgdGhlIEluc3BlY3RvciB3b3VsZCBidWlsZCBmb3IgXCJOZXcgMkQgLyAzRFwiLlxuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ29wZW4tc2NlbmUnLCByZXN1bHQudXVpZCk7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKChyKSA9PiBzZXRUaW1lb3V0KHIsIDYwMCkpO1xuXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRyZWU6IGFueSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LW5vZGUtdHJlZScpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBzY2VuZVJvb3RVdWlkOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB0cmVlPy51dWlkO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXNjZW5lUm9vdFV1aWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignQ291bGQgbm90IHJlc29sdmUgc2NlbmUgcm9vdCBVVUlEIGFmdGVyIG9wZW4tc2NlbmUnKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRlbXBsYXRlRGF0YSA9XG4gICAgICAgICAgICAgICAgICAgICAgICB0ZW1wbGF0ZSA9PT0gJzJkLXVpJyA/IGF3YWl0IHRoaXMuYnVpbGRUZW1wbGF0ZTJEVUkoc2NlbmVSb290VXVpZClcbiAgICAgICAgICAgICAgICAgICAgICAgIDogYXdhaXQgdGhpcy5idWlsZFRlbXBsYXRlM0RCYXNpYyhzY2VuZVJvb3RVdWlkKTtcblxuICAgICAgICAgICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdzYXZlLXNjZW5lJyk7XG5cbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdXVpZDogcmVzdWx0LnV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdXJsOiByZXN1bHQudXJsLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5hbWU6IHNjZW5lTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0ZW1wbGF0ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0ZW1wbGF0ZU5vZGVzOiB0ZW1wbGF0ZURhdGEsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYFNjZW5lICcke3NjZW5lTmFtZX0nIGNyZWF0ZWQgd2l0aCB0ZW1wbGF0ZSAnJHt0ZW1wbGF0ZX0nLiBFZGl0b3Igc3dpdGNoZWQgdG8gdGhlIG5ldyBzY2VuZS5gLFxuICAgICAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKHRlbXBsYXRlRXJyOiBhbnkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGBTY2VuZSBhc3NldCBjcmVhdGVkIGF0ICR7cmVzdWx0LnVybH0gYnV0IHRlbXBsYXRlIGJ1aWxkIGZhaWxlZDogJHt0ZW1wbGF0ZUVycj8ubWVzc2FnZSA/PyB0ZW1wbGF0ZUVycn1gLCB7IHV1aWQ6IHJlc3VsdC51dWlkLCB1cmw6IHJlc3VsdC51cmwsIHRlbXBsYXRlIH0pKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIEJ1aWxkIFwiTmV3IDJEXCIgc2NhZmZvbGRpbmcgaW5zaWRlIHRoZSBjdXJyZW50bHktb3BlbiBzY2VuZTogQ2FtZXJhXG4gICAgLy8gKGNjLkNhbWVyYSwgb3J0aG8pICsgQ2FudmFzIChjYy5VSVRyYW5zZm9ybSArIGNjLkNhbnZhcyB3aXRoXG4gICAgLy8gY2FtZXJhQ29tcG9uZW50IGxpbmtlZCwgbGF5ZXIgVUlfMkQpLlxuICAgIHByaXZhdGUgYXN5bmMgYnVpbGRUZW1wbGF0ZTJEVUkoc2NlbmVSb290VXVpZDogc3RyaW5nKTogUHJvbWlzZTx7IGNhbWVyYVV1aWQ6IHN0cmluZzsgY2FudmFzVXVpZDogc3RyaW5nIH0+IHtcbiAgICAgICAgY29uc3QgY2FtZXJhVXVpZCA9IGF3YWl0IHRoaXMuY3JlYXRlTm9kZVdpdGhDb21wb25lbnRzKCdDYW1lcmEnLCBzY2VuZVJvb3RVdWlkLCBbJ2NjLkNhbWVyYSddKTtcbiAgICAgICAgYXdhaXQgdGhpcy5kZWxheSgxNTApO1xuICAgICAgICBjb25zdCBjYW1lcmFJZHggPSBhd2FpdCB0aGlzLmZpbmRDb21wb25lbnRJbmRleChjYW1lcmFVdWlkLCAnY2MuQ2FtZXJhJyk7XG4gICAgICAgIGlmIChjYW1lcmFJZHggPj0gMCkge1xuICAgICAgICAgICAgLy8gMCA9IE9SVEhPLCAxID0gUEVSU1BFQ1RJVkVcbiAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3NldC1wcm9wZXJ0eScsIHtcbiAgICAgICAgICAgICAgICB1dWlkOiBjYW1lcmFVdWlkLFxuICAgICAgICAgICAgICAgIHBhdGg6IGBfX2NvbXBzX18uJHtjYW1lcmFJZHh9LnByb2plY3Rpb25gLFxuICAgICAgICAgICAgICAgIGR1bXA6IHsgdmFsdWU6IDAgfSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gY2MuQ2FudmFzIHJlcXVpcmVzIGNjLlVJVHJhbnNmb3JtOyBjb2NvcyBhdXRvLWFkZHMgaXQgd2hlbiBhZGRpbmcgY2MuQ2FudmFzLlxuICAgICAgICBjb25zdCBjYW52YXNVdWlkID0gYXdhaXQgdGhpcy5jcmVhdGVOb2RlV2l0aENvbXBvbmVudHMoJ0NhbnZhcycsIHNjZW5lUm9vdFV1aWQsIFsnY2MuQ2FudmFzJ10pO1xuICAgICAgICBhd2FpdCB0aGlzLmRlbGF5KDE1MCk7XG5cbiAgICAgICAgLy8gQ2FudmFzIGl0c2VsZiBzaXRzIG9uIFVJXzJEIHNvIGl0IChhbmQgaXRzIGRlc2NlbmRhbnRzIGJ5IGluaGVyaXRhbmNlIHZpYVxuICAgICAgICAvLyBjcmVhdGVfbm9kZSBhdXRvLWRldGVjdGlvbikgYXJlIHZpc2libGUgdG8gdGhlIFVJIGNhbWVyYS5cbiAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnc2V0LXByb3BlcnR5Jywge1xuICAgICAgICAgICAgdXVpZDogY2FudmFzVXVpZCxcbiAgICAgICAgICAgIHBhdGg6ICdsYXllcicsXG4gICAgICAgICAgICBkdW1wOiB7IHZhbHVlOiBMQVlFUl9VSV8yRCB9LFxuICAgICAgICB9KTtcblxuICAgICAgICAvLyBXaXJlIENhbnZhcy5jYW1lcmFDb21wb25lbnQg4oaSIENhbWVyYSBub2RlLiBSZXVzZXMgdGhlIHZlcmlmaWVkXG4gICAgICAgIC8vIHByb3BlcnR5VHlwZTogJ2NvbXBvbmVudCcgY29kZSBwYXRoIHNvIHdlIGRvIG5vdCBoYXZlIHRvIHJlLXJlc29sdmVcbiAgICAgICAgLy8gdGhlIGNvbXBvbmVudCBzY2VuZSBfX2lkX18gaGVyZS5cbiAgICAgICAgYXdhaXQgdGhpcy5jb21wb25lbnRUb29scy5leGVjdXRlKCdzZXRfY29tcG9uZW50X3Byb3BlcnR5Jywge1xuICAgICAgICAgICAgbm9kZVV1aWQ6IGNhbnZhc1V1aWQsXG4gICAgICAgICAgICBjb21wb25lbnRUeXBlOiAnY2MuQ2FudmFzJyxcbiAgICAgICAgICAgIHByb3BlcnR5OiAnY2FtZXJhQ29tcG9uZW50JyxcbiAgICAgICAgICAgIHByb3BlcnR5VHlwZTogJ2NvbXBvbmVudCcsXG4gICAgICAgICAgICB2YWx1ZTogY2FtZXJhVXVpZCxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHsgY2FtZXJhVXVpZCwgY2FudmFzVXVpZCB9O1xuICAgIH1cblxuICAgIC8vIEJ1aWxkIFwiTmV3IDNEXCIgc2NhZmZvbGRpbmc6IENhbWVyYSAocGVyc3BlY3RpdmUpICsgRGlyZWN0aW9uYWxMaWdodC5cbiAgICBwcml2YXRlIGFzeW5jIGJ1aWxkVGVtcGxhdGUzREJhc2ljKHNjZW5lUm9vdFV1aWQ6IHN0cmluZyk6IFByb21pc2U8eyBjYW1lcmFVdWlkOiBzdHJpbmc7IGxpZ2h0VXVpZDogc3RyaW5nIH0+IHtcbiAgICAgICAgY29uc3QgY2FtZXJhVXVpZCA9IGF3YWl0IHRoaXMuY3JlYXRlTm9kZVdpdGhDb21wb25lbnRzKCdNYWluIENhbWVyYScsIHNjZW5lUm9vdFV1aWQsIFsnY2MuQ2FtZXJhJ10pO1xuICAgICAgICBjb25zdCBsaWdodFV1aWQgPSBhd2FpdCB0aGlzLmNyZWF0ZU5vZGVXaXRoQ29tcG9uZW50cygnTWFpbiBMaWdodCcsIHNjZW5lUm9vdFV1aWQsIFsnY2MuRGlyZWN0aW9uYWxMaWdodCddKTtcbiAgICAgICAgYXdhaXQgdGhpcy5kZWxheSgxNTApO1xuICAgICAgICByZXR1cm4geyBjYW1lcmFVdWlkLCBsaWdodFV1aWQgfTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGNyZWF0ZU5vZGVXaXRoQ29tcG9uZW50cyhuYW1lOiBzdHJpbmcsIHBhcmVudDogc3RyaW5nLCBjb21wb25lbnRzOiBzdHJpbmdbXSk6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ2NyZWF0ZS1ub2RlJywgeyBuYW1lLCBwYXJlbnQgfSk7XG4gICAgICAgIGNvbnN0IHV1aWQgPSBBcnJheS5pc0FycmF5KHJlc3VsdCkgPyByZXN1bHRbMF0gOiByZXN1bHQ7XG4gICAgICAgIGlmICh0eXBlb2YgdXVpZCAhPT0gJ3N0cmluZycgfHwgIXV1aWQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgY3JlYXRlLW5vZGUgcmV0dXJuZWQgbm8gVVVJRCBmb3IgJHtuYW1lfWApO1xuICAgICAgICB9XG4gICAgICAgIC8vIGNyZWF0ZS1ub2RlIGhhcyBubyBgY29tcG9uZW50c2AgZmllbGQgb24gdGhlIHR5cGVkIENyZWF0ZU5vZGVPcHRpb25zLFxuICAgICAgICAvLyBzbyB3aXJlIGNvbXBvbmVudHMgdmlhIHRoZSBkZWRpY2F0ZWQgY3JlYXRlLWNvbXBvbmVudCBjaGFubmVsLiBFYWNoXG4gICAgICAgIC8vIGNhbGwgbmVlZHMgYSBzbWFsbCBicmVhdGggZm9yIHRoZSBlZGl0b3IgdG8gc2V0dGxlIHRoZSBkdW1wLlxuICAgICAgICBmb3IgKGNvbnN0IGNvbXBvbmVudCBvZiBjb21wb25lbnRzKSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLmRlbGF5KDgwKTtcbiAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ2NyZWF0ZS1jb21wb25lbnQnLCB7IHV1aWQsIGNvbXBvbmVudCB9KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdXVpZDtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGZpbmRDb21wb25lbnRJbmRleChub2RlVXVpZDogc3RyaW5nLCBjb21wb25lbnRUeXBlOiBzdHJpbmcpOiBQcm9taXNlPG51bWJlcj4ge1xuICAgICAgICBjb25zdCBkYXRhOiBhbnkgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1ub2RlJywgbm9kZVV1aWQpO1xuICAgICAgICBjb25zdCBjb21wcyA9IEFycmF5LmlzQXJyYXkoZGF0YT8uX19jb21wc19fKSA/IGRhdGEuX19jb21wc19fIDogW107XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY29tcHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IHQgPSBjb21wc1tpXT8uX190eXBlX18gPz8gY29tcHNbaV0/LnR5cGUgPz8gY29tcHNbaV0/LmNpZDtcbiAgICAgICAgICAgIGlmICh0ID09PSBjb21wb25lbnRUeXBlKSByZXR1cm4gaTtcbiAgICAgICAgfVxuICAgICAgICBkZWJ1Z0xvZyhgW1NjZW5lVG9vbHNdIGNvbXBvbmVudCAnJHtjb21wb25lbnRUeXBlfScgbm90IGZvdW5kIG9uIG5vZGUgJHtub2RlVXVpZH1gKTtcbiAgICAgICAgcmV0dXJuIC0xO1xuICAgIH1cblxuICAgIHByaXZhdGUgZGVsYXkobXM6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHIpID0+IHNldFRpbWVvdXQociwgbXMpKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldFNjZW5lSGllcmFyY2h5KGluY2x1ZGVDb21wb25lbnRzOiBib29sZWFuID0gZmFsc2UpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIC8vIOWEquWFiOWakOippuS9v+eUqCBFZGl0b3IgQVBJIOafpeipouWgtOaZr+evgOm7nuaouVxuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktbm9kZS10cmVlJykudGhlbigodHJlZTogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHRyZWUpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaGllcmFyY2h5ID0gdGhpcy5idWlsZEhpZXJhcmNoeSh0cmVlLCBpbmNsdWRlQ29tcG9uZW50cyk7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUob2soaGllcmFyY2h5KSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKCdObyBzY2VuZSBoaWVyYXJjaHkgYXZhaWxhYmxlJykpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgLy8g5YKZ55So5pa55qGI77ya5L2/55So5aC05pmv6IWz5pysXG4gICAgICAgICAgICAgICAgcnVuU2NlbmVNZXRob2QoJ2dldFNjZW5lSGllcmFyY2h5JywgW2luY2x1ZGVDb21wb25lbnRzXSkudGhlbigocmVzdWx0OiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgICAgICAgIH0pLmNhdGNoKChlcnIyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoYERpcmVjdCBBUEkgZmFpbGVkOiAke2Vyci5tZXNzYWdlfSwgU2NlbmUgc2NyaXB0IGZhaWxlZDogJHtlcnIyLm1lc3NhZ2V9YCkpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYnVpbGRIaWVyYXJjaHkobm9kZTogYW55LCBpbmNsdWRlQ29tcG9uZW50czogYm9vbGVhbik6IGFueSB7XG4gICAgICAgIGNvbnN0IG5vZGVJbmZvOiBhbnkgPSB7XG4gICAgICAgICAgICB1dWlkOiBub2RlLnV1aWQsXG4gICAgICAgICAgICBuYW1lOiBub2RlLm5hbWUsXG4gICAgICAgICAgICB0eXBlOiBub2RlLnR5cGUsXG4gICAgICAgICAgICBhY3RpdmU6IG5vZGUuYWN0aXZlLFxuICAgICAgICAgICAgY2hpbGRyZW46IFtdXG4gICAgICAgIH07XG5cbiAgICAgICAgaWYgKGluY2x1ZGVDb21wb25lbnRzICYmIG5vZGUuX19jb21wc19fKSB7XG4gICAgICAgICAgICBub2RlSW5mby5jb21wb25lbnRzID0gbm9kZS5fX2NvbXBzX18ubWFwKChjb21wOiBhbnkpID0+ICh7XG4gICAgICAgICAgICAgICAgdHlwZTogY29tcC5fX3R5cGVfXyB8fCAnVW5rbm93bicsXG4gICAgICAgICAgICAgICAgZW5hYmxlZDogY29tcC5lbmFibGVkICE9PSB1bmRlZmluZWQgPyBjb21wLmVuYWJsZWQgOiB0cnVlXG4gICAgICAgICAgICB9KSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAobm9kZS5jaGlsZHJlbikge1xuICAgICAgICAgICAgbm9kZUluZm8uY2hpbGRyZW4gPSBub2RlLmNoaWxkcmVuLm1hcCgoY2hpbGQ6IGFueSkgPT4gXG4gICAgICAgICAgICAgICAgdGhpcy5idWlsZEhpZXJhcmNoeShjaGlsZCwgaW5jbHVkZUNvbXBvbmVudHMpXG4gICAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG5vZGVJbmZvO1xuICAgIH1cblxuICAgIC8vIFByb2dyYW1tYXRpYyBzYXZlLWFzLiBUaGUgY29jb3MgYHNjZW5lL3NhdmUtYXMtc2NlbmVgIGNoYW5uZWwgb25seSBvcGVuc1xuICAgIC8vIHRoZSBuYXRpdmUgZmlsZSBkaWFsb2cgKGFuZCBibG9ja3MgdW50aWwgdGhlIHVzZXIgZGlzbWlzc2VzIGl0IOKAlCByb290XG4gICAgLy8gY2F1c2Ugb2YgdGhlID4xNXMgdGltZW91dCByZXBvcnRlZCBpbiBIQU5ET0ZGKSwgc28gd2UgZG8gbm90IHVzZSBpdC5cbiAgICAvLyBJbnN0ZWFkOiBzYXZlIHRoZSBjdXJyZW50IHNjZW5lIHRvIGZsdXNoIGVkaXRzLCByZXNvbHZlIGl0cyBhc3NldCB1cmwsXG4gICAgLy8gdGhlbiBhc3NldC1kYiBjb3B5LWFzc2V0IHRvIHRoZSB0YXJnZXQgcGF0aC4gT3B0aW9uYWxseSBvcGVuIHRoZSBjb3B5LlxuICAgIHByaXZhdGUgYXN5bmMgc2F2ZVNjZW5lQXMoYXJnczogeyBwYXRoOiBzdHJpbmc7IG9wZW5BZnRlcj86IGJvb2xlYW47IG92ZXJ3cml0ZT86IGJvb2xlYW4gfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZShhc3luYyAocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdzYXZlLXNjZW5lJyk7XG5cbiAgICAgICAgICAgICAgICBjb25zdCB0cmVlOiBhbnkgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1ub2RlLXRyZWUnKTtcbiAgICAgICAgICAgICAgICBjb25zdCBzY2VuZVV1aWQ6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHRyZWU/LnV1aWQ7XG4gICAgICAgICAgICAgICAgaWYgKCFzY2VuZVV1aWQpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKCdObyBzY2VuZSBpcyBjdXJyZW50bHkgb3Blbi4nKSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBjb25zdCBzb3VyY2VVcmwgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS11cmwnLCBzY2VuZVV1aWQpO1xuICAgICAgICAgICAgICAgIGlmICghc291cmNlVXJsKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbCgnQ3VycmVudCBzY2VuZSBoYXMgbm8gYXNzZXQgcGF0aCBvbiBkaXNrIHlldC4gU2F2ZSBpdCBvbmNlIHZpYSB0aGUgQ29jb3MgVUkgKG9yIHVzZSBjcmVhdGVfc2NlbmUgdG8gd3JpdGUgYSBiYWNraW5nIGZpbGUpIGJlZm9yZSBzYXZlX3NjZW5lX2FzIGNhbiBjb3B5IGl0LicpKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGNvbnN0IHRhcmdldFBhdGggPSBhcmdzLnBhdGguZW5kc1dpdGgoJy5zY2VuZScpID8gYXJncy5wYXRoIDogYCR7YXJncy5wYXRofS5zY2VuZWA7XG5cbiAgICAgICAgICAgICAgICAvLyBQcmUtY2hlY2sgZXhpc3RlbmNlIHNvIGEgY29sbGlzaW9uIHJldHVybnMgYSBjbGVhbiBlcnJvclxuICAgICAgICAgICAgICAgIC8vIGluc3RlYWQgb2YgbGV0dGluZyBjb2NvcyBwb3AgYSBcImZpbGUgZXhpc3RzLCBvdmVyd3JpdGU/XCIgbW9kYWxcbiAgICAgICAgICAgICAgICAvLyBhbmQgYmxvY2sgb24gdXNlciBpbnB1dC4gY29jb3Mgb25seSByZXNwZWN0cyBgb3ZlcndyaXRlOiB0cnVlYFxuICAgICAgICAgICAgICAgIC8vIHNpbGVudGx5OyB0aGUgIW92ZXJ3cml0ZSBwYXRoIG90aGVyd2lzZSBvcGVucyBhIGRpYWxvZy5cbiAgICAgICAgICAgICAgICBpZiAoIWFyZ3Mub3ZlcndyaXRlKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGV4aXN0aW5nID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktdXVpZCcsIHRhcmdldFBhdGgpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoZXhpc3RpbmcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChgVGFyZ2V0ICcke3RhcmdldFBhdGh9JyBhbHJlYWR5IGV4aXN0cy4gUGFzcyBvdmVyd3JpdGU6IHRydWUgdG8gcmVwbGFjZSBpdC5gLCB7IGV4aXN0aW5nVXVpZDogZXhpc3RpbmcgfSkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgY29uc3QgY29weVJlc3VsdDogYW55ID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdChcbiAgICAgICAgICAgICAgICAgICAgJ2Fzc2V0LWRiJyxcbiAgICAgICAgICAgICAgICAgICAgJ2NvcHktYXNzZXQnLFxuICAgICAgICAgICAgICAgICAgICBzb3VyY2VVcmwsXG4gICAgICAgICAgICAgICAgICAgIHRhcmdldFBhdGgsXG4gICAgICAgICAgICAgICAgICAgIHsgb3ZlcndyaXRlOiAhIWFyZ3Mub3ZlcndyaXRlIH0sXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICBpZiAoIWNvcHlSZXN1bHQgfHwgIWNvcHlSZXN1bHQudXVpZCkge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoYGFzc2V0LWRiIGNvcHktYXNzZXQgcmV0dXJuZWQgbm8gcmVzdWx0IGZvciAke3NvdXJjZVVybH0gLT4gJHt0YXJnZXRQYXRofS5gKSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBjb25zdCBvcGVuQWZ0ZXIgPSBhcmdzLm9wZW5BZnRlciAhPT0gZmFsc2U7XG4gICAgICAgICAgICAgICAgaWYgKG9wZW5BZnRlcikge1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdvcGVuLXNjZW5lJywgY29weVJlc3VsdC51dWlkKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNvdXJjZVVybCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG5ld1V1aWQ6IGNvcHlSZXN1bHQudXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG5ld1VybDogY29weVJlc3VsdC51cmwsXG4gICAgICAgICAgICAgICAgICAgICAgICBvcGVuZWQ6IG9wZW5BZnRlcixcbiAgICAgICAgICAgICAgICAgICAgfSwgYFNjZW5lIHNhdmVkIGFzICR7Y29weVJlc3VsdC51cmx9YCkpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgY2xvc2VTY2VuZSgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ2Nsb3NlLXNjZW5lJykudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh1bmRlZmluZWQsICdTY2VuZSBjbG9zZWQgc3VjY2Vzc2Z1bGx5JykpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG59XG4iXX0=