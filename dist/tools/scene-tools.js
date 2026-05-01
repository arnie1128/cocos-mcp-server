"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SceneTools = void 0;
const schema_1 = require("../lib/schema");
const scene_bridge_1 = require("../lib/scene-bridge");
const component_tools_1 = require("./component-tools");
const log_1 = require("../lib/log");
const LAYER_UI_2D = 33554432;
const sceneSchemas = {
    get_current_scene: schema_1.z.object({}),
    get_scene_list: schema_1.z.object({}),
    open_scene: schema_1.z.object({
        scenePath: schema_1.z.string().describe('The scene file path'),
    }),
    save_scene: schema_1.z.object({}),
    create_scene: schema_1.z.object({
        sceneName: schema_1.z.string().describe('Name of the new scene'),
        savePath: schema_1.z.string().describe('Path to save the scene (e.g., db://assets/scenes/NewScene.scene)'),
        template: schema_1.z.enum(['empty', '2d-ui', '3d-basic']).default('empty').describe('Built-in scaffolding for the new scene. ' +
            '"empty" (default): bare scene root only — current behavior. ' +
            '"2d-ui": Camera (cc.Camera, ortho projection) + Canvas (cc.UITransform + cc.Canvas with cameraComponent linked, layer UI_2D) so UI nodes render immediately under the UI camera. ' +
            '"3d-basic": Camera (perspective) + DirectionalLight at scene root. ' +
            '⚠️ Side effect: when template is not "empty" the editor opens the newly created scene to populate it. Save your current scene first if it has unsaved changes.'),
    }),
    save_scene_as: schema_1.z.object({
        path: schema_1.z.string().describe('Path to save the scene'),
    }),
    close_scene: schema_1.z.object({}),
    get_scene_hierarchy: schema_1.z.object({
        includeComponents: schema_1.z.boolean().default(false).describe('Include component information'),
    }),
};
const sceneToolMeta = {
    get_current_scene: 'Get current scene information',
    get_scene_list: 'Get all scenes in the project',
    open_scene: 'Open a scene by path',
    save_scene: 'Save current scene',
    create_scene: 'Create a new scene asset',
    save_scene_as: 'Save scene as new file',
    close_scene: 'Close current scene',
    get_scene_hierarchy: 'Get the complete hierarchy of current scene',
};
class SceneTools {
    constructor() {
        this.componentTools = new component_tools_1.ComponentTools();
    }
    getTools() {
        return Object.keys(sceneSchemas).map(name => ({
            name,
            description: sceneToolMeta[name],
            inputSchema: (0, schema_1.toInputSchema)(sceneSchemas[name]),
        }));
    }
    async execute(toolName, args) {
        const schemaName = toolName;
        const schema = sceneSchemas[schemaName];
        if (!schema) {
            throw new Error(`Unknown tool: ${toolName}`);
        }
        const validation = (0, schema_1.validateArgs)(schema, args !== null && args !== void 0 ? args : {});
        if (!validation.ok) {
            return validation.response;
        }
        const a = validation.data;
        switch (schemaName) {
            case 'get_current_scene':
                return await this.getCurrentScene();
            case 'get_scene_list':
                return await this.getSceneList();
            case 'open_scene':
                return await this.openScene(a.scenePath);
            case 'save_scene':
                return await this.saveScene();
            case 'create_scene':
                return await this.createScene(a.sceneName, a.savePath, a.template);
            case 'save_scene_as':
                return await this.saveSceneAs(a.path);
            case 'close_scene':
                return await this.closeScene();
            case 'get_scene_hierarchy':
                return await this.getSceneHierarchy(a.includeComponents);
        }
    }
    async getCurrentScene() {
        return new Promise((resolve) => {
            // 直接使用 query-node-tree 來獲取場景信息（這個方法已經驗證可用）
            Editor.Message.request('scene', 'query-node-tree').then((tree) => {
                if (tree && tree.uuid) {
                    resolve({
                        success: true,
                        data: {
                            name: tree.name || 'Current Scene',
                            uuid: tree.uuid,
                            type: tree.type || 'cc.Scene',
                            active: tree.active !== undefined ? tree.active : true,
                            nodeCount: tree.children ? tree.children.length : 0
                        }
                    });
                }
                else {
                    resolve({ success: false, error: 'No scene data available' });
                }
            }).catch((err) => {
                // 備用方案：使用場景腳本
                (0, scene_bridge_1.runSceneMethod)('getCurrentSceneInfo', []).then((result) => {
                    resolve(result);
                }).catch((err2) => {
                    resolve({ success: false, error: `Direct API failed: ${err.message}, Scene script failed: ${err2.message}` });
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
                resolve({ success: true, data: scenes });
            }).catch((err) => {
                resolve({ success: false, error: err.message });
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
                resolve({ success: true, message: `Scene opened: ${scenePath}` });
            }).catch((err) => {
                resolve({ success: false, error: err.message });
            });
        });
    }
    async saveScene() {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'save-scene').then(() => {
                resolve({ success: true, message: 'Scene saved successfully' });
            }).catch((err) => {
                resolve({ success: false, error: err.message });
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
                        resolve({
                            success: true,
                            data: {
                                uuid: result.uuid,
                                url: result.url,
                                name: sceneName,
                                template,
                                message: `Scene '${sceneName}' created successfully (verification failed)`,
                            },
                        });
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
                    resolve({
                        success: true,
                        data: {
                            uuid: result.uuid,
                            url: result.url,
                            name: sceneName,
                            template,
                            templateNodes: templateData,
                            message: `Scene '${sceneName}' created with template '${template}'. Editor switched to the new scene.`,
                        },
                    });
                }
                catch (templateErr) {
                    resolve({
                        success: false,
                        error: `Scene asset created at ${result.url} but template build failed: ${(_b = templateErr === null || templateErr === void 0 ? void 0 : templateErr.message) !== null && _b !== void 0 ? _b : templateErr}`,
                        data: { uuid: result.uuid, url: result.url, template },
                    });
                }
            }).catch((err) => {
                resolve({ success: false, error: err.message });
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
                    resolve({
                        success: true,
                        data: hierarchy
                    });
                }
                else {
                    resolve({ success: false, error: 'No scene hierarchy available' });
                }
            }).catch((err) => {
                // 備用方案：使用場景腳本
                (0, scene_bridge_1.runSceneMethod)('getSceneHierarchy', [includeComponents]).then((result) => {
                    resolve(result);
                }).catch((err2) => {
                    resolve({ success: false, error: `Direct API failed: ${err.message}, Scene script failed: ${err2.message}` });
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
    async saveSceneAs(path) {
        return new Promise((resolve) => {
            // save-as-scene API 不接受路徑參數，會彈出對話框讓用戶選擇
            Editor.Message.request('scene', 'save-as-scene').then(() => {
                resolve({
                    success: true,
                    data: {
                        path: path,
                        message: `Scene save-as dialog opened`
                    }
                });
            }).catch((err) => {
                resolve({ success: false, error: err.message });
            });
        });
    }
    async closeScene() {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'close-scene').then(() => {
                resolve({
                    success: true,
                    message: 'Scene closed successfully'
                });
            }).catch((err) => {
                resolve({ success: false, error: err.message });
            });
        });
    }
}
exports.SceneTools = SceneTools;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NlbmUtdG9vbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvdG9vbHMvc2NlbmUtdG9vbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQ0EsMENBQStEO0FBQy9ELHNEQUFxRDtBQUNyRCx1REFBbUQ7QUFDbkQsb0NBQXNDO0FBRXRDLE1BQU0sV0FBVyxHQUFHLFFBQVEsQ0FBQztBQUU3QixNQUFNLFlBQVksR0FBRztJQUNqQixpQkFBaUIsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztJQUMvQixjQUFjLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7SUFDNUIsVUFBVSxFQUFFLFVBQUMsQ0FBQyxNQUFNLENBQUM7UUFDakIsU0FBUyxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLENBQUMscUJBQXFCLENBQUM7S0FDeEQsQ0FBQztJQUNGLFVBQVUsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztJQUN4QixZQUFZLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQztRQUNuQixTQUFTLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyx1QkFBdUIsQ0FBQztRQUN2RCxRQUFRLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyxrRUFBa0UsQ0FBQztRQUNqRyxRQUFRLEVBQUUsVUFBQyxDQUFDLElBQUksQ0FBQyxDQUFDLE9BQU8sRUFBRSxPQUFPLEVBQUUsVUFBVSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUMsUUFBUSxDQUN0RSwwQ0FBMEM7WUFDMUMsOERBQThEO1lBQzlELG1MQUFtTDtZQUNuTCxxRUFBcUU7WUFDckUsZ0tBQWdLLENBQ25LO0tBQ0osQ0FBQztJQUNGLGFBQWEsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDO1FBQ3BCLElBQUksRUFBRSxVQUFDLENBQUMsTUFBTSxF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RUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEdBQUcsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO1lBQ3BELENBQUMsQ0FBQyxDQUFDO1FBQ1AsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDO0NBQ0o7QUFuZ0JELGdDQW1nQkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBUb29sRGVmaW5pdGlvbiwgVG9vbFJlc3BvbnNlLCBUb29sRXhlY3V0b3IsIFNjZW5lSW5mbyB9IGZyb20gJy4uL3R5cGVzJztcbmltcG9ydCB7IHosIHRvSW5wdXRTY2hlbWEsIHZhbGlkYXRlQXJncyB9IGZyb20gJy4uL2xpYi9zY2hlbWEnO1xuaW1wb3J0IHsgcnVuU2NlbmVNZXRob2QgfSBmcm9tICcuLi9saWIvc2NlbmUtYnJpZGdlJztcbmltcG9ydCB7IENvbXBvbmVudFRvb2xzIH0gZnJvbSAnLi9jb21wb25lbnQtdG9vbHMnO1xuaW1wb3J0IHsgZGVidWdMb2cgfSBmcm9tICcuLi9saWIvbG9nJztcblxuY29uc3QgTEFZRVJfVUlfMkQgPSAzMzU1NDQzMjtcblxuY29uc3Qgc2NlbmVTY2hlbWFzID0ge1xuICAgIGdldF9jdXJyZW50X3NjZW5lOiB6Lm9iamVjdCh7fSksXG4gICAgZ2V0X3NjZW5lX2xpc3Q6IHoub2JqZWN0KHt9KSxcbiAgICBvcGVuX3NjZW5lOiB6Lm9iamVjdCh7XG4gICAgICAgIHNjZW5lUGF0aDogei5zdHJpbmcoKS5kZXNjcmliZSgnVGhlIHNjZW5lIGZpbGUgcGF0aCcpLFxuICAgIH0pLFxuICAgIHNhdmVfc2NlbmU6IHoub2JqZWN0KHt9KSxcbiAgICBjcmVhdGVfc2NlbmU6IHoub2JqZWN0KHtcbiAgICAgICAgc2NlbmVOYW1lOiB6LnN0cmluZygpLmRlc2NyaWJlKCdOYW1lIG9mIHRoZSBuZXcgc2NlbmUnKSxcbiAgICAgICAgc2F2ZVBhdGg6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1BhdGggdG8gc2F2ZSB0aGUgc2NlbmUgKGUuZy4sIGRiOi8vYXNzZXRzL3NjZW5lcy9OZXdTY2VuZS5zY2VuZSknKSxcbiAgICAgICAgdGVtcGxhdGU6IHouZW51bShbJ2VtcHR5JywgJzJkLXVpJywgJzNkLWJhc2ljJ10pLmRlZmF1bHQoJ2VtcHR5JykuZGVzY3JpYmUoXG4gICAgICAgICAgICAnQnVpbHQtaW4gc2NhZmZvbGRpbmcgZm9yIHRoZSBuZXcgc2NlbmUuICcgK1xuICAgICAgICAgICAgJ1wiZW1wdHlcIiAoZGVmYXVsdCk6IGJhcmUgc2NlbmUgcm9vdCBvbmx5IOKAlCBjdXJyZW50IGJlaGF2aW9yLiAnICtcbiAgICAgICAgICAgICdcIjJkLXVpXCI6IENhbWVyYSAoY2MuQ2FtZXJhLCBvcnRobyBwcm9qZWN0aW9uKSArIENhbnZhcyAoY2MuVUlUcmFuc2Zvcm0gKyBjYy5DYW52YXMgd2l0aCBjYW1lcmFDb21wb25lbnQgbGlua2VkLCBsYXllciBVSV8yRCkgc28gVUkgbm9kZXMgcmVuZGVyIGltbWVkaWF0ZWx5IHVuZGVyIHRoZSBVSSBjYW1lcmEuICcgK1xuICAgICAgICAgICAgJ1wiM2QtYmFzaWNcIjogQ2FtZXJhIChwZXJzcGVjdGl2ZSkgKyBEaXJlY3Rpb25hbExpZ2h0IGF0IHNjZW5lIHJvb3QuICcgK1xuICAgICAgICAgICAgJ+KaoO+4jyBTaWRlIGVmZmVjdDogd2hlbiB0ZW1wbGF0ZSBpcyBub3QgXCJlbXB0eVwiIHRoZSBlZGl0b3Igb3BlbnMgdGhlIG5ld2x5IGNyZWF0ZWQgc2NlbmUgdG8gcG9wdWxhdGUgaXQuIFNhdmUgeW91ciBjdXJyZW50IHNjZW5lIGZpcnN0IGlmIGl0IGhhcyB1bnNhdmVkIGNoYW5nZXMuJ1xuICAgICAgICApLFxuICAgIH0pLFxuICAgIHNhdmVfc2NlbmVfYXM6IHoub2JqZWN0KHtcbiAgICAgICAgcGF0aDogei5zdHJpbmcoKS5kZXNjcmliZSgnUGF0aCB0byBzYXZlIHRoZSBzY2VuZScpLFxuICAgIH0pLFxuICAgIGNsb3NlX3NjZW5lOiB6Lm9iamVjdCh7fSksXG4gICAgZ2V0X3NjZW5lX2hpZXJhcmNoeTogei5vYmplY3Qoe1xuICAgICAgICBpbmNsdWRlQ29tcG9uZW50czogei5ib29sZWFuKCkuZGVmYXVsdChmYWxzZSkuZGVzY3JpYmUoJ0luY2x1ZGUgY29tcG9uZW50IGluZm9ybWF0aW9uJyksXG4gICAgfSksXG59IGFzIGNvbnN0O1xuXG5jb25zdCBzY2VuZVRvb2xNZXRhOiBSZWNvcmQ8a2V5b2YgdHlwZW9mIHNjZW5lU2NoZW1hcywgc3RyaW5nPiA9IHtcbiAgICBnZXRfY3VycmVudF9zY2VuZTogJ0dldCBjdXJyZW50IHNjZW5lIGluZm9ybWF0aW9uJyxcbiAgICBnZXRfc2NlbmVfbGlzdDogJ0dldCBhbGwgc2NlbmVzIGluIHRoZSBwcm9qZWN0JyxcbiAgICBvcGVuX3NjZW5lOiAnT3BlbiBhIHNjZW5lIGJ5IHBhdGgnLFxuICAgIHNhdmVfc2NlbmU6ICdTYXZlIGN1cnJlbnQgc2NlbmUnLFxuICAgIGNyZWF0ZV9zY2VuZTogJ0NyZWF0ZSBhIG5ldyBzY2VuZSBhc3NldCcsXG4gICAgc2F2ZV9zY2VuZV9hczogJ1NhdmUgc2NlbmUgYXMgbmV3IGZpbGUnLFxuICAgIGNsb3NlX3NjZW5lOiAnQ2xvc2UgY3VycmVudCBzY2VuZScsXG4gICAgZ2V0X3NjZW5lX2hpZXJhcmNoeTogJ0dldCB0aGUgY29tcGxldGUgaGllcmFyY2h5IG9mIGN1cnJlbnQgc2NlbmUnLFxufTtcblxuZXhwb3J0IGNsYXNzIFNjZW5lVG9vbHMgaW1wbGVtZW50cyBUb29sRXhlY3V0b3Ige1xuICAgIGdldFRvb2xzKCk6IFRvb2xEZWZpbml0aW9uW10ge1xuICAgICAgICByZXR1cm4gKE9iamVjdC5rZXlzKHNjZW5lU2NoZW1hcykgYXMgQXJyYXk8a2V5b2YgdHlwZW9mIHNjZW5lU2NoZW1hcz4pLm1hcChuYW1lID0+ICh7XG4gICAgICAgICAgICBuYW1lLFxuICAgICAgICAgICAgZGVzY3JpcHRpb246IHNjZW5lVG9vbE1ldGFbbmFtZV0sXG4gICAgICAgICAgICBpbnB1dFNjaGVtYTogdG9JbnB1dFNjaGVtYShzY2VuZVNjaGVtYXNbbmFtZV0pLFxuICAgICAgICB9KSk7XG4gICAgfVxuXG4gICAgYXN5bmMgZXhlY3V0ZSh0b29sTmFtZTogc3RyaW5nLCBhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBzY2hlbWFOYW1lID0gdG9vbE5hbWUgYXMga2V5b2YgdHlwZW9mIHNjZW5lU2NoZW1hcztcbiAgICAgICAgY29uc3Qgc2NoZW1hID0gc2NlbmVTY2hlbWFzW3NjaGVtYU5hbWVdO1xuICAgICAgICBpZiAoIXNjaGVtYSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIHRvb2w6ICR7dG9vbE5hbWV9YCk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgdmFsaWRhdGlvbiA9IHZhbGlkYXRlQXJncyhzY2hlbWEsIGFyZ3MgPz8ge30pO1xuICAgICAgICBpZiAoIXZhbGlkYXRpb24ub2spIHtcbiAgICAgICAgICAgIHJldHVybiB2YWxpZGF0aW9uLnJlc3BvbnNlO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGEgPSB2YWxpZGF0aW9uLmRhdGEgYXMgYW55O1xuXG4gICAgICAgIHN3aXRjaCAoc2NoZW1hTmFtZSkge1xuICAgICAgICAgICAgY2FzZSAnZ2V0X2N1cnJlbnRfc2NlbmUnOlxuICAgICAgICAgICAgICAgIHJldHVybiBhd2FpdCB0aGlzLmdldEN1cnJlbnRTY2VuZSgpO1xuICAgICAgICAgICAgY2FzZSAnZ2V0X3NjZW5lX2xpc3QnOlxuICAgICAgICAgICAgICAgIHJldHVybiBhd2FpdCB0aGlzLmdldFNjZW5lTGlzdCgpO1xuICAgICAgICAgICAgY2FzZSAnb3Blbl9zY2VuZSc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMub3BlblNjZW5lKGEuc2NlbmVQYXRoKTtcbiAgICAgICAgICAgIGNhc2UgJ3NhdmVfc2NlbmUnOlxuICAgICAgICAgICAgICAgIHJldHVybiBhd2FpdCB0aGlzLnNhdmVTY2VuZSgpO1xuICAgICAgICAgICAgY2FzZSAnY3JlYXRlX3NjZW5lJzpcbiAgICAgICAgICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5jcmVhdGVTY2VuZShhLnNjZW5lTmFtZSwgYS5zYXZlUGF0aCwgYS50ZW1wbGF0ZSk7XG4gICAgICAgICAgICBjYXNlICdzYXZlX3NjZW5lX2FzJzpcbiAgICAgICAgICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5zYXZlU2NlbmVBcyhhLnBhdGgpO1xuICAgICAgICAgICAgY2FzZSAnY2xvc2Vfc2NlbmUnOlxuICAgICAgICAgICAgICAgIHJldHVybiBhd2FpdCB0aGlzLmNsb3NlU2NlbmUoKTtcbiAgICAgICAgICAgIGNhc2UgJ2dldF9zY2VuZV9oaWVyYXJjaHknOlxuICAgICAgICAgICAgICAgIHJldHVybiBhd2FpdCB0aGlzLmdldFNjZW5lSGllcmFyY2h5KGEuaW5jbHVkZUNvbXBvbmVudHMpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRDdXJyZW50U2NlbmUoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICAvLyDnm7TmjqXkvb/nlKggcXVlcnktbm9kZS10cmVlIOS+hueNsuWPluWgtOaZr+S/oeaBr++8iOmAmeWAi+aWueazleW3sue2k+mpl+itieWPr+eUqO+8iVxuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktbm9kZS10cmVlJykudGhlbigodHJlZTogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHRyZWUgJiYgdHJlZS51dWlkKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBuYW1lOiB0cmVlLm5hbWUgfHwgJ0N1cnJlbnQgU2NlbmUnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IHRyZWUudXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiB0cmVlLnR5cGUgfHwgJ2NjLlNjZW5lJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBhY3RpdmU6IHRyZWUuYWN0aXZlICE9PSB1bmRlZmluZWQgPyB0cmVlLmFjdGl2ZSA6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbm9kZUNvdW50OiB0cmVlLmNoaWxkcmVuID8gdHJlZS5jaGlsZHJlbi5sZW5ndGggOiAwXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdObyBzY2VuZSBkYXRhIGF2YWlsYWJsZScgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICAvLyDlgpnnlKjmlrnmoYjvvJrkvb/nlKjloLTmma/ohbPmnKxcbiAgICAgICAgICAgICAgICBydW5TY2VuZU1ldGhvZCgnZ2V0Q3VycmVudFNjZW5lSW5mbycsIFtdKS50aGVuKChyZXN1bHQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgfSkuY2F0Y2goKGVycjI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBEaXJlY3QgQVBJIGZhaWxlZDogJHtlcnIubWVzc2FnZX0sIFNjZW5lIHNjcmlwdCBmYWlsZWQ6ICR7ZXJyMi5tZXNzYWdlfWAgfSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRTY2VuZUxpc3QoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICAvLyBOb3RlOiBxdWVyeS1hc3NldHMgQVBJIGNvcnJlY3RlZCB3aXRoIHByb3BlciBwYXJhbWV0ZXJzXG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldHMnLCB7XG4gICAgICAgICAgICAgICAgcGF0dGVybjogJ2RiOi8vYXNzZXRzLyoqLyouc2NlbmUnXG4gICAgICAgICAgICB9KS50aGVuKChyZXN1bHRzOiBhbnlbXSkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHNjZW5lczogU2NlbmVJbmZvW10gPSByZXN1bHRzLm1hcChhc3NldCA9PiAoe1xuICAgICAgICAgICAgICAgICAgICBuYW1lOiBhc3NldC5uYW1lLFxuICAgICAgICAgICAgICAgICAgICBwYXRoOiBhc3NldC51cmwsXG4gICAgICAgICAgICAgICAgICAgIHV1aWQ6IGFzc2V0LnV1aWRcbiAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IHNjZW5lcyB9KTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBvcGVuU2NlbmUoc2NlbmVQYXRoOiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIC8vIOmmluWFiOeNsuWPluWgtOaZr+eahFVVSURcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LXV1aWQnLCBzY2VuZVBhdGgpLnRoZW4oKHV1aWQ6IHN0cmluZyB8IG51bGwpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoIXV1aWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdTY2VuZSBub3QgZm91bmQnKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgLy8g5L2/55So5q2j56K655qEIHNjZW5lIEFQSSDmiZPplovloLTmma8gKOmcgOimgVVVSUQpXG4gICAgICAgICAgICAgICAgcmV0dXJuIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ29wZW4tc2NlbmUnLCB1dWlkKTtcbiAgICAgICAgICAgIH0pLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoeyBzdWNjZXNzOiB0cnVlLCBtZXNzYWdlOiBgU2NlbmUgb3BlbmVkOiAke3NjZW5lUGF0aH1gIH0pO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHNhdmVTY2VuZSgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3NhdmUtc2NlbmUnKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogdHJ1ZSwgbWVzc2FnZTogJ1NjZW5lIHNhdmVkIHN1Y2Nlc3NmdWxseScgfSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVyci5tZXNzYWdlIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgY29tcG9uZW50VG9vbHMgPSBuZXcgQ29tcG9uZW50VG9vbHMoKTtcblxuICAgIHByaXZhdGUgYXN5bmMgY3JlYXRlU2NlbmUoc2NlbmVOYW1lOiBzdHJpbmcsIHNhdmVQYXRoOiBzdHJpbmcsIHRlbXBsYXRlOiAnZW1wdHknIHwgJzJkLXVpJyB8ICczZC1iYXNpYycgPSAnZW1wdHknKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICAvLyDnorrkv53ot6/lvpHku6Uuc2NlbmXntZDlsL5cbiAgICAgICAgICAgIGNvbnN0IGZ1bGxQYXRoID0gc2F2ZVBhdGguZW5kc1dpdGgoJy5zY2VuZScpID8gc2F2ZVBhdGggOiBgJHtzYXZlUGF0aH0vJHtzY2VuZU5hbWV9LnNjZW5lYDtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8g5L2/55So5q2j56K655qEQ29jb3MgQ3JlYXRvciAzLjjloLTmma/moLzlvI9cbiAgICAgICAgICAgIGNvbnN0IHNjZW5lQ29udGVudCA9IEpTT04uc3RyaW5naWZ5KFtcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIFwiX190eXBlX19cIjogXCJjYy5TY2VuZUFzc2V0XCIsXG4gICAgICAgICAgICAgICAgICAgIFwiX25hbWVcIjogc2NlbmVOYW1lLFxuICAgICAgICAgICAgICAgICAgICBcIl9vYmpGbGFnc1wiOiAwLFxuICAgICAgICAgICAgICAgICAgICBcIl9fZWRpdG9yRXh0cmFzX19cIjoge30sXG4gICAgICAgICAgICAgICAgICAgIFwiX25hdGl2ZVwiOiBcIlwiLFxuICAgICAgICAgICAgICAgICAgICBcInNjZW5lXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiX19pZF9fXCI6IDFcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcIl9fdHlwZV9fXCI6IFwiY2MuU2NlbmVcIixcbiAgICAgICAgICAgICAgICAgICAgXCJfbmFtZVwiOiBzY2VuZU5hbWUsXG4gICAgICAgICAgICAgICAgICAgIFwiX29iakZsYWdzXCI6IDAsXG4gICAgICAgICAgICAgICAgICAgIFwiX19lZGl0b3JFeHRyYXNfX1wiOiB7fSxcbiAgICAgICAgICAgICAgICAgICAgXCJfcGFyZW50XCI6IG51bGwsXG4gICAgICAgICAgICAgICAgICAgIFwiX2NoaWxkcmVuXCI6IFtdLFxuICAgICAgICAgICAgICAgICAgICBcIl9hY3RpdmVcIjogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgXCJfY29tcG9uZW50c1wiOiBbXSxcbiAgICAgICAgICAgICAgICAgICAgXCJfcHJlZmFiXCI6IG51bGwsXG4gICAgICAgICAgICAgICAgICAgIFwiX2xwb3NcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJfX3R5cGVfX1wiOiBcImNjLlZlYzNcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIFwieFwiOiAwLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ5XCI6IDAsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInpcIjogMFxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICBcIl9scm90XCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiX190eXBlX19cIjogXCJjYy5RdWF0XCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInhcIjogMCxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwieVwiOiAwLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ6XCI6IDAsXG4gICAgICAgICAgICAgICAgICAgICAgICBcIndcIjogMVxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICBcIl9sc2NhbGVcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJfX3R5cGVfX1wiOiBcImNjLlZlYzNcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIFwieFwiOiAxLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ5XCI6IDEsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInpcIjogMVxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICBcIl9tb2JpbGl0eVwiOiAwLFxuICAgICAgICAgICAgICAgICAgICBcIl9sYXllclwiOiAxMDczNzQxODI0LFxuICAgICAgICAgICAgICAgICAgICBcIl9ldWxlclwiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcIl9fdHlwZV9fXCI6IFwiY2MuVmVjM1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ4XCI6IDAsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInlcIjogMCxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwielwiOiAwXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIFwiYXV0b1JlbGVhc2VBc3NldHNcIjogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIFwiX2dsb2JhbHNcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJfX2lkX19cIjogMlxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICBcIl9pZFwiOiBcInNjZW5lXCJcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCJfX3R5cGVfX1wiOiBcImNjLlNjZW5lR2xvYmFsc1wiLFxuICAgICAgICAgICAgICAgICAgICBcImFtYmllbnRcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJfX2lkX19cIjogM1xuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICBcInNreWJveFwiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcIl9faWRfX1wiOiA0XG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIFwiZm9nXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiX19pZF9fXCI6IDVcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgXCJvY3RyZWVcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJfX2lkX19cIjogNlxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIFwiX190eXBlX19cIjogXCJjYy5BbWJpZW50SW5mb1wiLFxuICAgICAgICAgICAgICAgICAgICBcIl9za3lDb2xvckhEUlwiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcIl9fdHlwZV9fXCI6IFwiY2MuVmVjNFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ4XCI6IDAuMixcbiAgICAgICAgICAgICAgICAgICAgICAgIFwieVwiOiAwLjUsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInpcIjogMC44LFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ3XCI6IDAuNTIwODMzXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIFwiX3NreUNvbG9yXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiX190eXBlX19cIjogXCJjYy5WZWM0XCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInhcIjogMC4yLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ5XCI6IDAuNSxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwielwiOiAwLjgsXG4gICAgICAgICAgICAgICAgICAgICAgICBcIndcIjogMC41MjA4MzNcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgXCJfc2t5SWxsdW1IRFJcIjogMjAwMDAsXG4gICAgICAgICAgICAgICAgICAgIFwiX3NreUlsbHVtXCI6IDIwMDAwLFxuICAgICAgICAgICAgICAgICAgICBcIl9ncm91bmRBbGJlZG9IRFJcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJfX3R5cGVfX1wiOiBcImNjLlZlYzRcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIFwieFwiOiAwLjIsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInlcIjogMC4yLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ6XCI6IDAuMixcbiAgICAgICAgICAgICAgICAgICAgICAgIFwid1wiOiAxXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIFwiX2dyb3VuZEFsYmVkb1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcIl9fdHlwZV9fXCI6IFwiY2MuVmVjNFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ4XCI6IDAuMixcbiAgICAgICAgICAgICAgICAgICAgICAgIFwieVwiOiAwLjIsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInpcIjogMC4yLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ3XCI6IDFcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcIl9fdHlwZV9fXCI6IFwiY2MuU2t5Ym94SW5mb1wiLFxuICAgICAgICAgICAgICAgICAgICBcIl9lbnZMaWdodGluZ1R5cGVcIjogMCxcbiAgICAgICAgICAgICAgICAgICAgXCJfZW52bWFwSERSXCI6IG51bGwsXG4gICAgICAgICAgICAgICAgICAgIFwiX2Vudm1hcFwiOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICBcIl9lbnZtYXBMb2RDb3VudFwiOiAwLFxuICAgICAgICAgICAgICAgICAgICBcIl9kaWZmdXNlTWFwSERSXCI6IG51bGwsXG4gICAgICAgICAgICAgICAgICAgIFwiX2RpZmZ1c2VNYXBcIjogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgXCJfZW5hYmxlZFwiOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgXCJfdXNlSERSXCI6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIFwiX2VkaXRhYmxlTWF0ZXJpYWxcIjogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgXCJfcmVmbGVjdGlvbkhEUlwiOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICBcIl9yZWZsZWN0aW9uTWFwXCI6IG51bGwsXG4gICAgICAgICAgICAgICAgICAgIFwiX3JvdGF0aW9uQW5nbGVcIjogMFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcIl9fdHlwZV9fXCI6IFwiY2MuRm9nSW5mb1wiLFxuICAgICAgICAgICAgICAgICAgICBcIl90eXBlXCI6IDAsXG4gICAgICAgICAgICAgICAgICAgIFwiX2ZvZ0NvbG9yXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiX190eXBlX19cIjogXCJjYy5Db2xvclwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJyXCI6IDIwMCxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiZ1wiOiAyMDAsXG4gICAgICAgICAgICAgICAgICAgICAgICBcImJcIjogMjAwLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJhXCI6IDI1NVxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICBcIl9lbmFibGVkXCI6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICBcIl9mb2dEZW5zaXR5XCI6IDAuMyxcbiAgICAgICAgICAgICAgICAgICAgXCJfZm9nU3RhcnRcIjogMC41LFxuICAgICAgICAgICAgICAgICAgICBcIl9mb2dFbmRcIjogMzAwLFxuICAgICAgICAgICAgICAgICAgICBcIl9mb2dBdHRlblwiOiA1LFxuICAgICAgICAgICAgICAgICAgICBcIl9mb2dUb3BcIjogMS41LFxuICAgICAgICAgICAgICAgICAgICBcIl9mb2dSYW5nZVwiOiAxLjIsXG4gICAgICAgICAgICAgICAgICAgIFwiX2FjY3VyYXRlXCI6IGZhbHNlXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIFwiX190eXBlX19cIjogXCJjYy5PY3RyZWVJbmZvXCIsXG4gICAgICAgICAgICAgICAgICAgIFwiX2VuYWJsZWRcIjogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIFwiX21pblBvc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcIl9fdHlwZV9fXCI6IFwiY2MuVmVjM1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ4XCI6IC0xMDI0LFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ5XCI6IC0xMDI0LFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ6XCI6IC0xMDI0XG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIFwiX21heFBvc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcIl9fdHlwZV9fXCI6IFwiY2MuVmVjM1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ4XCI6IDEwMjQsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInlcIjogMTAyNCxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwielwiOiAxMDI0XG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIFwiX2RlcHRoXCI6IDhcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICBdLCBudWxsLCAyKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAnY3JlYXRlLWFzc2V0JywgZnVsbFBhdGgsIHNjZW5lQ29udGVudCkudGhlbihhc3luYyAocmVzdWx0OiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAodGVtcGxhdGUgPT09ICdlbXB0eScpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gRXhpc3RpbmcgcGF0aDogdmVyaWZ5IGFuZCByZXR1cm4uXG4gICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBzY2VuZUxpc3QgPSBhd2FpdCB0aGlzLmdldFNjZW5lTGlzdCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY3JlYXRlZFNjZW5lID0gc2NlbmVMaXN0LmRhdGE/LmZpbmQoKHNjZW5lOiBhbnkpID0+IHNjZW5lLnV1aWQgPT09IHJlc3VsdC51dWlkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiByZXN1bHQudXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdXJsOiByZXN1bHQudXJsLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBuYW1lOiBzY2VuZU5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRlbXBsYXRlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgU2NlbmUgJyR7c2NlbmVOYW1lfScgY3JlYXRlZCBzdWNjZXNzZnVsbHlgLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzY2VuZVZlcmlmaWVkOiAhIWNyZWF0ZWRTY2VuZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZlcmlmaWNhdGlvbkRhdGE6IGNyZWF0ZWRTY2VuZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiByZXN1bHQudXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdXJsOiByZXN1bHQudXJsLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBuYW1lOiBzY2VuZU5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRlbXBsYXRlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgU2NlbmUgJyR7c2NlbmVOYW1lfScgY3JlYXRlZCBzdWNjZXNzZnVsbHkgKHZlcmlmaWNhdGlvbiBmYWlsZWQpYCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIFRlbXBsYXRlIHBhdGg6IG9wZW4gdGhlIG5ld2x5LWNyZWF0ZWQgc2NlbmUgYXNzZXQgYW5kIGJha2UgdGhlXG4gICAgICAgICAgICAgICAgLy8gc3RhbmRhcmQgbm9kZXMvY29tcG9uZW50cyBvbiB0b3Agb2YgdGhlIGVtcHR5IHNjYWZmb2xkaW5nIHdlXG4gICAgICAgICAgICAgICAgLy8ganVzdCB3cm90ZS4gRG9uZSBob3N0LXNpZGUgdmlhIEVkaXRvci5NZXNzYWdlIHNvIGJlaGF2aW9yXG4gICAgICAgICAgICAgICAgLy8gbWF0Y2hlcyB3aGF0IHRoZSBJbnNwZWN0b3Igd291bGQgYnVpbGQgZm9yIFwiTmV3IDJEIC8gM0RcIi5cbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdvcGVuLXNjZW5lJywgcmVzdWx0LnV1aWQpO1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZSgocikgPT4gc2V0VGltZW91dChyLCA2MDApKTtcblxuICAgICAgICAgICAgICAgICAgICBjb25zdCB0cmVlOiBhbnkgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1ub2RlLXRyZWUnKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgc2NlbmVSb290VXVpZDogc3RyaW5nIHwgdW5kZWZpbmVkID0gdHJlZT8udXVpZDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFzY2VuZVJvb3RVdWlkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0NvdWxkIG5vdCByZXNvbHZlIHNjZW5lIHJvb3QgVVVJRCBhZnRlciBvcGVuLXNjZW5lJyk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBjb25zdCB0ZW1wbGF0ZURhdGEgPVxuICAgICAgICAgICAgICAgICAgICAgICAgdGVtcGxhdGUgPT09ICcyZC11aScgPyBhd2FpdCB0aGlzLmJ1aWxkVGVtcGxhdGUyRFVJKHNjZW5lUm9vdFV1aWQpXG4gICAgICAgICAgICAgICAgICAgICAgICA6IGF3YWl0IHRoaXMuYnVpbGRUZW1wbGF0ZTNEQmFzaWMoc2NlbmVSb290VXVpZCk7XG5cbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnc2F2ZS1zY2VuZScpO1xuXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiByZXN1bHQudXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB1cmw6IHJlc3VsdC51cmwsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogc2NlbmVOYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRlbXBsYXRlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRlbXBsYXRlTm9kZXM6IHRlbXBsYXRlRGF0YSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgU2NlbmUgJyR7c2NlbmVOYW1lfScgY3JlYXRlZCB3aXRoIHRlbXBsYXRlICcke3RlbXBsYXRlfScuIEVkaXRvciBzd2l0Y2hlZCB0byB0aGUgbmV3IHNjZW5lLmAsXG4gICAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoICh0ZW1wbGF0ZUVycjogYW55KSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgICAgICBlcnJvcjogYFNjZW5lIGFzc2V0IGNyZWF0ZWQgYXQgJHtyZXN1bHQudXJsfSBidXQgdGVtcGxhdGUgYnVpbGQgZmFpbGVkOiAke3RlbXBsYXRlRXJyPy5tZXNzYWdlID8/IHRlbXBsYXRlRXJyfWAsXG4gICAgICAgICAgICAgICAgICAgICAgICBkYXRhOiB7IHV1aWQ6IHJlc3VsdC51dWlkLCB1cmw6IHJlc3VsdC51cmwsIHRlbXBsYXRlIH0sXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gQnVpbGQgXCJOZXcgMkRcIiBzY2FmZm9sZGluZyBpbnNpZGUgdGhlIGN1cnJlbnRseS1vcGVuIHNjZW5lOiBDYW1lcmFcbiAgICAvLyAoY2MuQ2FtZXJhLCBvcnRobykgKyBDYW52YXMgKGNjLlVJVHJhbnNmb3JtICsgY2MuQ2FudmFzIHdpdGhcbiAgICAvLyBjYW1lcmFDb21wb25lbnQgbGlua2VkLCBsYXllciBVSV8yRCkuXG4gICAgcHJpdmF0ZSBhc3luYyBidWlsZFRlbXBsYXRlMkRVSShzY2VuZVJvb3RVdWlkOiBzdHJpbmcpOiBQcm9taXNlPHsgY2FtZXJhVXVpZDogc3RyaW5nOyBjYW52YXNVdWlkOiBzdHJpbmcgfT4ge1xuICAgICAgICBjb25zdCBjYW1lcmFVdWlkID0gYXdhaXQgdGhpcy5jcmVhdGVOb2RlV2l0aENvbXBvbmVudHMoJ0NhbWVyYScsIHNjZW5lUm9vdFV1aWQsIFsnY2MuQ2FtZXJhJ10pO1xuICAgICAgICBhd2FpdCB0aGlzLmRlbGF5KDE1MCk7XG4gICAgICAgIGNvbnN0IGNhbWVyYUlkeCA9IGF3YWl0IHRoaXMuZmluZENvbXBvbmVudEluZGV4KGNhbWVyYVV1aWQsICdjYy5DYW1lcmEnKTtcbiAgICAgICAgaWYgKGNhbWVyYUlkeCA+PSAwKSB7XG4gICAgICAgICAgICAvLyAwID0gT1JUSE8sIDEgPSBQRVJTUEVDVElWRVxuICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnc2V0LXByb3BlcnR5Jywge1xuICAgICAgICAgICAgICAgIHV1aWQ6IGNhbWVyYVV1aWQsXG4gICAgICAgICAgICAgICAgcGF0aDogYF9fY29tcHNfXy4ke2NhbWVyYUlkeH0ucHJvamVjdGlvbmAsXG4gICAgICAgICAgICAgICAgZHVtcDogeyB2YWx1ZTogMCB9LFxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBjYy5DYW52YXMgcmVxdWlyZXMgY2MuVUlUcmFuc2Zvcm07IGNvY29zIGF1dG8tYWRkcyBpdCB3aGVuIGFkZGluZyBjYy5DYW52YXMuXG4gICAgICAgIGNvbnN0IGNhbnZhc1V1aWQgPSBhd2FpdCB0aGlzLmNyZWF0ZU5vZGVXaXRoQ29tcG9uZW50cygnQ2FudmFzJywgc2NlbmVSb290VXVpZCwgWydjYy5DYW52YXMnXSk7XG4gICAgICAgIGF3YWl0IHRoaXMuZGVsYXkoMTUwKTtcblxuICAgICAgICAvLyBDYW52YXMgaXRzZWxmIHNpdHMgb24gVUlfMkQgc28gaXQgKGFuZCBpdHMgZGVzY2VuZGFudHMgYnkgaW5oZXJpdGFuY2UgdmlhXG4gICAgICAgIC8vIGNyZWF0ZV9ub2RlIGF1dG8tZGV0ZWN0aW9uKSBhcmUgdmlzaWJsZSB0byB0aGUgVUkgY2FtZXJhLlxuICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdzZXQtcHJvcGVydHknLCB7XG4gICAgICAgICAgICB1dWlkOiBjYW52YXNVdWlkLFxuICAgICAgICAgICAgcGF0aDogJ2xheWVyJyxcbiAgICAgICAgICAgIGR1bXA6IHsgdmFsdWU6IExBWUVSX1VJXzJEIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIFdpcmUgQ2FudmFzLmNhbWVyYUNvbXBvbmVudCDihpIgQ2FtZXJhIG5vZGUuIFJldXNlcyB0aGUgdmVyaWZpZWRcbiAgICAgICAgLy8gcHJvcGVydHlUeXBlOiAnY29tcG9uZW50JyBjb2RlIHBhdGggc28gd2UgZG8gbm90IGhhdmUgdG8gcmUtcmVzb2x2ZVxuICAgICAgICAvLyB0aGUgY29tcG9uZW50IHNjZW5lIF9faWRfXyBoZXJlLlxuICAgICAgICBhd2FpdCB0aGlzLmNvbXBvbmVudFRvb2xzLmV4ZWN1dGUoJ3NldF9jb21wb25lbnRfcHJvcGVydHknLCB7XG4gICAgICAgICAgICBub2RlVXVpZDogY2FudmFzVXVpZCxcbiAgICAgICAgICAgIGNvbXBvbmVudFR5cGU6ICdjYy5DYW52YXMnLFxuICAgICAgICAgICAgcHJvcGVydHk6ICdjYW1lcmFDb21wb25lbnQnLFxuICAgICAgICAgICAgcHJvcGVydHlUeXBlOiAnY29tcG9uZW50JyxcbiAgICAgICAgICAgIHZhbHVlOiBjYW1lcmFVdWlkLFxuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4geyBjYW1lcmFVdWlkLCBjYW52YXNVdWlkIH07XG4gICAgfVxuXG4gICAgLy8gQnVpbGQgXCJOZXcgM0RcIiBzY2FmZm9sZGluZzogQ2FtZXJhIChwZXJzcGVjdGl2ZSkgKyBEaXJlY3Rpb25hbExpZ2h0LlxuICAgIHByaXZhdGUgYXN5bmMgYnVpbGRUZW1wbGF0ZTNEQmFzaWMoc2NlbmVSb290VXVpZDogc3RyaW5nKTogUHJvbWlzZTx7IGNhbWVyYVV1aWQ6IHN0cmluZzsgbGlnaHRVdWlkOiBzdHJpbmcgfT4ge1xuICAgICAgICBjb25zdCBjYW1lcmFVdWlkID0gYXdhaXQgdGhpcy5jcmVhdGVOb2RlV2l0aENvbXBvbmVudHMoJ01haW4gQ2FtZXJhJywgc2NlbmVSb290VXVpZCwgWydjYy5DYW1lcmEnXSk7XG4gICAgICAgIGNvbnN0IGxpZ2h0VXVpZCA9IGF3YWl0IHRoaXMuY3JlYXRlTm9kZVdpdGhDb21wb25lbnRzKCdNYWluIExpZ2h0Jywgc2NlbmVSb290VXVpZCwgWydjYy5EaXJlY3Rpb25hbExpZ2h0J10pO1xuICAgICAgICBhd2FpdCB0aGlzLmRlbGF5KDE1MCk7XG4gICAgICAgIHJldHVybiB7IGNhbWVyYVV1aWQsIGxpZ2h0VXVpZCB9O1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgY3JlYXRlTm9kZVdpdGhDb21wb25lbnRzKG5hbWU6IHN0cmluZywgcGFyZW50OiBzdHJpbmcsIGNvbXBvbmVudHM6IHN0cmluZ1tdKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnY3JlYXRlLW5vZGUnLCB7IG5hbWUsIHBhcmVudCB9KTtcbiAgICAgICAgY29uc3QgdXVpZCA9IEFycmF5LmlzQXJyYXkocmVzdWx0KSA/IHJlc3VsdFswXSA6IHJlc3VsdDtcbiAgICAgICAgaWYgKHR5cGVvZiB1dWlkICE9PSAnc3RyaW5nJyB8fCAhdXVpZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBjcmVhdGUtbm9kZSByZXR1cm5lZCBubyBVVUlEIGZvciAke25hbWV9YCk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gY3JlYXRlLW5vZGUgaGFzIG5vIGBjb21wb25lbnRzYCBmaWVsZCBvbiB0aGUgdHlwZWQgQ3JlYXRlTm9kZU9wdGlvbnMsXG4gICAgICAgIC8vIHNvIHdpcmUgY29tcG9uZW50cyB2aWEgdGhlIGRlZGljYXRlZCBjcmVhdGUtY29tcG9uZW50IGNoYW5uZWwuIEVhY2hcbiAgICAgICAgLy8gY2FsbCBuZWVkcyBhIHNtYWxsIGJyZWF0aCBmb3IgdGhlIGVkaXRvciB0byBzZXR0bGUgdGhlIGR1bXAuXG4gICAgICAgIGZvciAoY29uc3QgY29tcG9uZW50IG9mIGNvbXBvbmVudHMpIHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuZGVsYXkoODApO1xuICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnY3JlYXRlLWNvbXBvbmVudCcsIHsgdXVpZCwgY29tcG9uZW50IH0pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB1dWlkO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZmluZENvbXBvbmVudEluZGV4KG5vZGVVdWlkOiBzdHJpbmcsIGNvbXBvbmVudFR5cGU6IHN0cmluZyk6IFByb21pc2U8bnVtYmVyPiB7XG4gICAgICAgIGNvbnN0IGRhdGE6IGFueSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LW5vZGUnLCBub2RlVXVpZCk7XG4gICAgICAgIGNvbnN0IGNvbXBzID0gQXJyYXkuaXNBcnJheShkYXRhPy5fX2NvbXBzX18pID8gZGF0YS5fX2NvbXBzX18gOiBbXTtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjb21wcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgY29uc3QgdCA9IGNvbXBzW2ldPy5fX3R5cGVfXyA/PyBjb21wc1tpXT8udHlwZSA/PyBjb21wc1tpXT8uY2lkO1xuICAgICAgICAgICAgaWYgKHQgPT09IGNvbXBvbmVudFR5cGUpIHJldHVybiBpO1xuICAgICAgICB9XG4gICAgICAgIGRlYnVnTG9nKGBbU2NlbmVUb29sc10gY29tcG9uZW50ICcke2NvbXBvbmVudFR5cGV9JyBub3QgZm91bmQgb24gbm9kZSAke25vZGVVdWlkfWApO1xuICAgICAgICByZXR1cm4gLTE7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBkZWxheShtczogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocikgPT4gc2V0VGltZW91dChyLCBtcykpO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2V0U2NlbmVIaWVyYXJjaHkoaW5jbHVkZUNvbXBvbmVudHM6IGJvb2xlYW4gPSBmYWxzZSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgLy8g5YSq5YWI5ZqQ6Kmm5L2/55SoIEVkaXRvciBBUEkg5p+l6Kmi5aC05pmv56+A6bue5qi5XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1ub2RlLXRyZWUnKS50aGVuKCh0cmVlOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAodHJlZSkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBoaWVyYXJjaHkgPSB0aGlzLmJ1aWxkSGllcmFyY2h5KHRyZWUsIGluY2x1ZGVDb21wb25lbnRzKTtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgZGF0YTogaGllcmFyY2h5XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdObyBzY2VuZSBoaWVyYXJjaHkgYXZhaWxhYmxlJyB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIC8vIOWCmeeUqOaWueahiO+8muS9v+eUqOWgtOaZr+iFs+acrFxuICAgICAgICAgICAgICAgIHJ1blNjZW5lTWV0aG9kKCdnZXRTY2VuZUhpZXJhcmNoeScsIFtpbmNsdWRlQ29tcG9uZW50c10pLnRoZW4oKHJlc3VsdDogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICAgICAgICB9KS5jYXRjaCgoZXJyMjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYERpcmVjdCBBUEkgZmFpbGVkOiAke2Vyci5tZXNzYWdlfSwgU2NlbmUgc2NyaXB0IGZhaWxlZDogJHtlcnIyLm1lc3NhZ2V9YCB9KTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGJ1aWxkSGllcmFyY2h5KG5vZGU6IGFueSwgaW5jbHVkZUNvbXBvbmVudHM6IGJvb2xlYW4pOiBhbnkge1xuICAgICAgICBjb25zdCBub2RlSW5mbzogYW55ID0ge1xuICAgICAgICAgICAgdXVpZDogbm9kZS51dWlkLFxuICAgICAgICAgICAgbmFtZTogbm9kZS5uYW1lLFxuICAgICAgICAgICAgdHlwZTogbm9kZS50eXBlLFxuICAgICAgICAgICAgYWN0aXZlOiBub2RlLmFjdGl2ZSxcbiAgICAgICAgICAgIGNoaWxkcmVuOiBbXVxuICAgICAgICB9O1xuXG4gICAgICAgIGlmIChpbmNsdWRlQ29tcG9uZW50cyAmJiBub2RlLl9fY29tcHNfXykge1xuICAgICAgICAgICAgbm9kZUluZm8uY29tcG9uZW50cyA9IG5vZGUuX19jb21wc19fLm1hcCgoY29tcDogYW55KSA9PiAoe1xuICAgICAgICAgICAgICAgIHR5cGU6IGNvbXAuX190eXBlX18gfHwgJ1Vua25vd24nLFxuICAgICAgICAgICAgICAgIGVuYWJsZWQ6IGNvbXAuZW5hYmxlZCAhPT0gdW5kZWZpbmVkID8gY29tcC5lbmFibGVkIDogdHJ1ZVxuICAgICAgICAgICAgfSkpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKG5vZGUuY2hpbGRyZW4pIHtcbiAgICAgICAgICAgIG5vZGVJbmZvLmNoaWxkcmVuID0gbm9kZS5jaGlsZHJlbi5tYXAoKGNoaWxkOiBhbnkpID0+IFxuICAgICAgICAgICAgICAgIHRoaXMuYnVpbGRIaWVyYXJjaHkoY2hpbGQsIGluY2x1ZGVDb21wb25lbnRzKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBub2RlSW5mbztcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHNhdmVTY2VuZUFzKHBhdGg6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgLy8gc2F2ZS1hcy1zY2VuZSBBUEkg5LiN5o6l5Y+X6Lev5b6R5Y+D5pW477yM5pyD5b2I5Ye65bCN6Kmx5qGG6K6T55So5oi26YG45pOHXG4gICAgICAgICAgICAoRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCBhcyBhbnkpKCdzY2VuZScsICdzYXZlLWFzLXNjZW5lJykudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhdGg6IHBhdGgsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgU2NlbmUgc2F2ZS1hcyBkaWFsb2cgb3BlbmVkYFxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVyci5tZXNzYWdlIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgY2xvc2VTY2VuZSgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ2Nsb3NlLXNjZW5lJykudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdTY2VuZSBjbG9zZWQgc3VjY2Vzc2Z1bGx5J1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG59Il19