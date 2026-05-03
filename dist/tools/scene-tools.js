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
const component_lookup_1 = require("../lib/component-lookup");
const scene_root_1 = require("../lib/scene-root");
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
        return this.getSceneHierarchyImpl(args.includeComponents, args.maxDepth, args.maxNodes, args.summaryOnly);
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
                    const sceneRootUuid = await (0, scene_root_1.getSceneRootUuid)();
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
        const data = await Editor.Message.request('scene', 'query-node', nodeUuid);
        const comps = Array.isArray(data === null || data === void 0 ? void 0 : data.__comps__) ? data.__comps__ : [];
        const componentIndex = (0, component_lookup_1.findComponentIndexByType)(comps, componentType);
        if (componentIndex !== -1)
            return componentIndex;
        (0, log_1.debugLog)(`[SceneTools] component '${componentType}' not found on node ${nodeUuid}`);
        return -1;
    }
    delay(ms) {
        return new Promise((r) => setTimeout(r, ms));
    }
    async getSceneHierarchyImpl(includeComponents = false, maxDepth = 10, maxNodes = 2000, summaryOnly = false) {
        return new Promise((resolve) => {
            // 優先嚐試使用 Editor API 查詢場景節點樹
            Editor.Message.request('scene', 'query-node-tree').then((tree) => {
                if (tree) {
                    const counter = { count: 0 };
                    const truncation = { truncated: false, truncatedBy: undefined };
                    const hierarchy = this.buildHierarchy(tree, includeComponents, maxDepth, maxNodes, summaryOnly, counter, truncation);
                    resolve(this.withHierarchyCaps((0, response_1.ok)(hierarchy), counter, truncation, maxDepth, maxNodes, summaryOnly));
                }
                else {
                    resolve((0, response_1.fail)('No scene hierarchy available'));
                }
            }).catch((err) => {
                // 備用方案：使用場景腳本
                (0, scene_bridge_1.runSceneMethod)('getSceneHierarchy', [includeComponents]).then((result) => {
                    if (!(result === null || result === void 0 ? void 0 : result.success) || !result.data) {
                        resolve(result);
                        return;
                    }
                    const counter = { count: 0 };
                    const truncation = { truncated: false, truncatedBy: undefined };
                    const hierarchy = this.buildHierarchy(result.data, includeComponents, maxDepth, maxNodes, summaryOnly, counter, truncation);
                    resolve(this.withHierarchyCaps((0, response_1.ok)(hierarchy, result.message), counter, truncation, maxDepth, maxNodes, summaryOnly));
                }).catch((err2) => {
                    resolve((0, response_1.fail)(`Direct API failed: ${err.message}, Scene script failed: ${err2.message}`));
                });
            });
        });
    }
    buildHierarchy(node, includeComponents, maxDepth, maxNodes, summaryOnly, counter, truncation, depth = 0) {
        var _a, _b, _c;
        counter.count++;
        const nodeInfo = {
            uuid: node.uuid,
            name: node.name,
            type: node.type,
            active: node.active,
            childCount: node.children ? node.children.length : 0,
        };
        if (!summaryOnly) {
            nodeInfo.children = [];
        }
        if (includeComponents && node.__comps__) {
            nodeInfo.components = node.__comps__.map((comp) => ({
                type: comp.__type__ || 'Unknown',
                enabled: comp.enabled !== undefined ? comp.enabled : true
            }));
        }
        if (!summaryOnly && nodeInfo.childCount > 0 && depth >= maxDepth - 1) {
            truncation.truncated = true;
            (_a = truncation.truncatedBy) !== null && _a !== void 0 ? _a : (truncation.truncatedBy = 'maxDepth');
            nodeInfo.truncated = true;
            nodeInfo.truncatedBy = 'maxDepth';
            return nodeInfo;
        }
        if (!summaryOnly && nodeInfo.childCount > 0 && counter.count >= maxNodes) {
            truncation.truncated = true;
            (_b = truncation.truncatedBy) !== null && _b !== void 0 ? _b : (truncation.truncatedBy = 'maxNodes');
            nodeInfo.truncated = true;
            nodeInfo.truncatedBy = 'maxNodes';
            return nodeInfo;
        }
        if (!summaryOnly && node.children) {
            nodeInfo.children = node.children.map((child) => this.buildHierarchy(child, includeComponents, maxDepth, maxNodes, summaryOnly, counter, truncation, depth + 1));
            if (counter.count >= maxNodes) {
                truncation.truncated = true;
                (_c = truncation.truncatedBy) !== null && _c !== void 0 ? _c : (truncation.truncatedBy = 'maxNodes');
            }
        }
        return nodeInfo;
    }
    withHierarchyCaps(response, counter, truncation, maxDepth, maxNodes, summaryOnly) {
        const cappedResponse = response;
        cappedResponse.truncated = truncation.truncated;
        if (truncation.truncatedBy)
            cappedResponse.truncatedBy = truncation.truncatedBy;
        cappedResponse.nodeCount = counter.count;
        cappedResponse.maxDepth = maxDepth;
        cappedResponse.maxNodes = maxNodes;
        cappedResponse.summaryOnly = summaryOnly;
        return cappedResponse;
    }
    // Programmatic save-as. The cocos `scene/save-as-scene` channel only opens
    // the native file dialog (and blocks until the user dismisses it — root
    // cause of the >15s timeout reported in HANDOFF), so we do not use it.
    // Instead: save the current scene to flush edits, resolve its asset url,
    // then asset-db copy-asset to the target path. Optionally open the copy.
    async saveSceneAsImpl(args) {
        await Editor.Message.request('scene', 'save-scene');
        const sceneUuid = await (0, scene_root_1.getSceneRootUuid)();
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
            maxDepth: schema_1.z.number().int().positive().default(10).describe('Maximum tree depth. Default 10; large values can return a lot of data.'),
            maxNodes: schema_1.z.number().int().positive().default(2000).describe('Maximum nodes to include before truncating traversal. Default 2000.'),
            summaryOnly: schema_1.z.boolean().default(false).describe('Return childCount without per-node children arrays. Default false.'),
        }),
    })
], SceneTools.prototype, "getSceneHierarchy", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NlbmUtdG9vbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvdG9vbHMvc2NlbmUtdG9vbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7O0FBQUEsOENBQTJDO0FBRTNDLDBDQUFrQztBQUNsQyxrREFBdUU7QUFDdkUsc0RBQXFEO0FBQ3JELHVEQUFtRDtBQUNuRCxvQ0FBc0M7QUFDdEMsbURBQWdEO0FBQ2hELDhEQUFtRTtBQUNuRSxrREFBcUQ7QUFFckQsTUFBTSxXQUFXLEdBQUcsUUFBUSxDQUFDO0FBRTdCLE1BQWEsVUFBVTtJQUduQjtRQW9MUSxtQkFBYyxHQUFHLElBQUksZ0NBQWMsRUFBRSxDQUFDO1FBbkwxQyxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUEsc0NBQXlCLEVBQUMsSUFBSSxDQUFDLENBQUM7SUFDaEQsQ0FBQztJQUVELFFBQVEsS0FBdUIsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUM3RCxPQUFPLENBQUMsUUFBZ0IsRUFBRSxJQUFTLElBQTJCLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztJQVFuRyxBQUFOLEtBQUssQ0FBQyxlQUFlO1FBQ2pCLE9BQU8sSUFBSSxDQUFDLG1CQUFtQixFQUFFLENBQUM7SUFDdEMsQ0FBQztJQVFLLEFBQU4sS0FBSyxDQUFDLFlBQVk7UUFDZCxPQUFPLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO0lBQ25DLENBQUM7SUFVSyxBQUFOLEtBQUssQ0FBQyxTQUFTLENBQUMsSUFBMkI7UUFDdkMsT0FBTyxJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUM5QyxDQUFDO0lBUUssQUFBTixLQUFLLENBQUMsU0FBUztRQUNYLE9BQU8sSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO0lBQ2hD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QUUsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLHdFQUF3RSxDQUFDO1lBQ3BJLFFBQVEsRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsR0FBRyxFQUFFLENBQUMsUUFBUSxFQUFFLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLFFBQVEsQ0FBQyxxRUFBcUUsQ0FBQztZQUNuSSxXQUFXLEVBQUUsVUFBQyxDQUFDLE9BQU8sRUFBRSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxRQUFRLENBQUMsb0VBQW9FLENBQUM7U0FDekgsQ0FBQztLQUNMLENBQUM7bURBR0QiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBvaywgZmFpbCB9IGZyb20gJy4uL2xpYi9yZXNwb25zZSc7XG5pbXBvcnQgdHlwZSB7IFRvb2xEZWZpbml0aW9uLCBUb29sUmVzcG9uc2UsIFRvb2xFeGVjdXRvciwgU2NlbmVJbmZvIH0gZnJvbSAnLi4vdHlwZXMnO1xuaW1wb3J0IHsgeiB9IGZyb20gJy4uL2xpYi9zY2hlbWEnO1xuaW1wb3J0IHsgbWNwVG9vbCwgZGVmaW5lVG9vbHNGcm9tRGVjb3JhdG9ycyB9IGZyb20gJy4uL2xpYi9kZWNvcmF0b3JzJztcbmltcG9ydCB7IHJ1blNjZW5lTWV0aG9kIH0gZnJvbSAnLi4vbGliL3NjZW5lLWJyaWRnZSc7XG5pbXBvcnQgeyBDb21wb25lbnRUb29scyB9IGZyb20gJy4vY29tcG9uZW50LXRvb2xzJztcbmltcG9ydCB7IGRlYnVnTG9nIH0gZnJvbSAnLi4vbGliL2xvZyc7XG5pbXBvcnQgeyBTQ0VORV9ET0NTIH0gZnJvbSAnLi4vZGF0YS9zY2VuZS1kb2NzJztcbmltcG9ydCB7IGZpbmRDb21wb25lbnRJbmRleEJ5VHlwZSB9IGZyb20gJy4uL2xpYi9jb21wb25lbnQtbG9va3VwJztcbmltcG9ydCB7IGdldFNjZW5lUm9vdFV1aWQgfSBmcm9tICcuLi9saWIvc2NlbmUtcm9vdCc7XG5cbmNvbnN0IExBWUVSX1VJXzJEID0gMzM1NTQ0MzI7XG5cbmV4cG9ydCBjbGFzcyBTY2VuZVRvb2xzIGltcGxlbWVudHMgVG9vbEV4ZWN1dG9yIHtcbiAgICBwcml2YXRlIHJlYWRvbmx5IGV4ZWM6IFRvb2xFeGVjdXRvcjtcblxuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICB0aGlzLmV4ZWMgPSBkZWZpbmVUb29sc0Zyb21EZWNvcmF0b3JzKHRoaXMpO1xuICAgIH1cblxuICAgIGdldFRvb2xzKCk6IFRvb2xEZWZpbml0aW9uW10geyByZXR1cm4gdGhpcy5leGVjLmdldFRvb2xzKCk7IH1cbiAgICBleGVjdXRlKHRvb2xOYW1lOiBzdHJpbmcsIGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7IHJldHVybiB0aGlzLmV4ZWMuZXhlY3V0ZSh0b29sTmFtZSwgYXJncyk7IH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ2dldF9jdXJyZW50X3NjZW5lJyxcbiAgICAgICAgdGl0bGU6ICdSZWFkIGN1cnJlbnQgc2NlbmUnLFxuICAgICAgICBkZXNjcmlwdGlvbjogU0NFTkVfRE9DUy5nZXRfY3VycmVudF9zY2VuZSxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSxcbiAgICB9KVxuICAgIGFzeW5jIGdldEN1cnJlbnRTY2VuZSgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRDdXJyZW50U2NlbmVJbXBsKCk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnZ2V0X3NjZW5lX2xpc3QnLFxuICAgICAgICB0aXRsZTogJ0xpc3Qgc2NlbmUgYXNzZXRzJyxcbiAgICAgICAgZGVzY3JpcHRpb246IFNDRU5FX0RPQ1MuZ2V0X3NjZW5lX2xpc3QsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksXG4gICAgfSlcbiAgICBhc3luYyBnZXRTY2VuZUxpc3QoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0U2NlbmVMaXN0SW1wbCgpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ29wZW5fc2NlbmUnLFxuICAgICAgICB0aXRsZTogJ09wZW4gc2NlbmUgYnkgcGF0aCcsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBTQ0VORV9ET0NTLm9wZW5fc2NlbmUsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICBzY2VuZVBhdGg6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1NjZW5lIGRiOi8vIHBhdGggdG8gb3BlbiwgZS5nLiBkYjovL2Fzc2V0cy9zY2VuZXMvTWFpbi5zY2VuZS4gVGhlIHRvb2wgcmVzb2x2ZXMgVVVJRCBmaXJzdC4nKSxcbiAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBvcGVuU2NlbmUoYXJnczogeyBzY2VuZVBhdGg6IHN0cmluZyB9KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMub3BlblNjZW5lSW1wbChhcmdzLnNjZW5lUGF0aCk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnc2F2ZV9zY2VuZScsXG4gICAgICAgIHRpdGxlOiAnU2F2ZSBjdXJyZW50IHNjZW5lJyxcbiAgICAgICAgZGVzY3JpcHRpb246IFNDRU5FX0RPQ1Muc2F2ZV9zY2VuZSxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSxcbiAgICB9KVxuICAgIGFzeW5jIHNhdmVTY2VuZSgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5zYXZlU2NlbmVJbXBsKCk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnY3JlYXRlX3NjZW5lJyxcbiAgICAgICAgdGl0bGU6ICdDcmVhdGUgc2NlbmUgYXNzZXQnLFxuICAgICAgICBkZXNjcmlwdGlvbjogU0NFTkVfRE9DUy5jcmVhdGVfc2NlbmUsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICBzY2VuZU5hbWU6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ05ldyBzY2VuZSBuYW1lOyB3cml0dGVuIGludG8gdGhlIGNyZWF0ZWQgY2MuU2NlbmVBc3NldCAvIGNjLlNjZW5lLicpLFxuICAgICAgICAgICAgc2F2ZVBhdGg6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1RhcmdldCBzY2VuZSBsb2NhdGlvbi4gUGFzcyBhIGZ1bGwgLnNjZW5lIHBhdGggb3IgYSBmb2xkZXIgcGF0aCB0byBhcHBlbmQgc2NlbmVOYW1lLnNjZW5lLicpLFxuICAgICAgICAgICAgdGVtcGxhdGU6IHouZW51bShbJ2VtcHR5JywgJzJkLXVpJywgJzNkLWJhc2ljJ10pLmRlZmF1bHQoJ2VtcHR5JykuZGVzY3JpYmUoXG4gICAgICAgICAgICAgICAgJ0J1aWx0LWluIHNjYWZmb2xkaW5nIGZvciB0aGUgbmV3IHNjZW5lLiAnICtcbiAgICAgICAgICAgICAgICAnXCJlbXB0eVwiIChkZWZhdWx0KTogYmFyZSBzY2VuZSByb290IG9ubHkg4oCUIGN1cnJlbnQgYmVoYXZpb3IuICcgK1xuICAgICAgICAgICAgICAgICdcIjJkLXVpXCI6IENhbWVyYSAoY2MuQ2FtZXJhLCBvcnRobyBwcm9qZWN0aW9uKSArIENhbnZhcyAoY2MuVUlUcmFuc2Zvcm0gKyBjYy5DYW52YXMgd2l0aCBjYW1lcmFDb21wb25lbnQgbGlua2VkLCBsYXllciBVSV8yRCkgc28gVUkgbm9kZXMgcmVuZGVyIGltbWVkaWF0ZWx5IHVuZGVyIHRoZSBVSSBjYW1lcmEuICcgK1xuICAgICAgICAgICAgICAgICdcIjNkLWJhc2ljXCI6IENhbWVyYSAocGVyc3BlY3RpdmUpICsgRGlyZWN0aW9uYWxMaWdodCBhdCBzY2VuZSByb290LiAnICtcbiAgICAgICAgICAgICAgICAn4pqg77iPIFNpZGUgZWZmZWN0OiB3aGVuIHRlbXBsYXRlIGlzIG5vdCBcImVtcHR5XCIgdGhlIGVkaXRvciBvcGVucyB0aGUgbmV3bHkgY3JlYXRlZCBzY2VuZSB0byBwb3B1bGF0ZSBpdC4gU2F2ZSB5b3VyIGN1cnJlbnQgc2NlbmUgZmlyc3QgaWYgaXQgaGFzIHVuc2F2ZWQgY2hhbmdlcy4nXG4gICAgICAgICAgICApLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIGNyZWF0ZVNjZW5lKGFyZ3M6IHsgc2NlbmVOYW1lOiBzdHJpbmc7IHNhdmVQYXRoOiBzdHJpbmc7IHRlbXBsYXRlOiAnZW1wdHknIHwgJzJkLXVpJyB8ICczZC1iYXNpYycgfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLmNyZWF0ZVNjZW5lSW1wbChhcmdzLnNjZW5lTmFtZSwgYXJncy5zYXZlUGF0aCwgYXJncy50ZW1wbGF0ZSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnc2F2ZV9zY2VuZV9hcycsXG4gICAgICAgIHRpdGxlOiAnQ29weSBzY2VuZSBhc3NldCcsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBTQ0VORV9ET0NTLnNhdmVfc2NlbmVfYXMsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICBwYXRoOiB6LnN0cmluZygpLmRlc2NyaWJlKCdUYXJnZXQgZGI6Ly8gcGF0aCBmb3IgdGhlIG5ldyBzY2VuZSBmaWxlIChlLmcuIFwiZGI6Ly9hc3NldHMvc2NlbmVzL0NvcHkuc2NlbmVcIikuIFRoZSBcIi5zY2VuZVwiIGV4dGVuc2lvbiBpcyBhcHBlbmRlZCBpZiBtaXNzaW5nLicpLFxuICAgICAgICAgICAgb3BlbkFmdGVyOiB6LmJvb2xlYW4oKS5kZWZhdWx0KHRydWUpLmRlc2NyaWJlKCdPcGVuIHRoZSBuZXdseS1zYXZlZCBzY2VuZSByaWdodCBhZnRlciB0aGUgY29weS4gRGVmYXVsdCB0cnVlLiBQYXNzIGZhbHNlIHRvIGtlZXAgdGhlIGN1cnJlbnQgc2NlbmUgZm9jdXNlZC4nKSxcbiAgICAgICAgICAgIG92ZXJ3cml0ZTogei5ib29sZWFuKCkuZGVmYXVsdChmYWxzZSkuZGVzY3JpYmUoJ092ZXJ3cml0ZSB0aGUgdGFyZ2V0IGZpbGUgaWYgaXQgYWxyZWFkeSBleGlzdHMuIERlZmF1bHQgZmFsc2U7IHdpdGggZmFsc2UsIGEgbmFtZSBjb2xsaXNpb24gcmV0dXJucyBhbiBlcnJvci4nKSxcbiAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBzYXZlU2NlbmVBcyhhcmdzOiB7IHBhdGg6IHN0cmluZzsgb3BlbkFmdGVyPzogYm9vbGVhbjsgb3ZlcndyaXRlPzogYm9vbGVhbiB9KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2F2ZVNjZW5lQXNJbXBsKGFyZ3MpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ2Nsb3NlX3NjZW5lJyxcbiAgICAgICAgdGl0bGU6ICdDbG9zZSBjdXJyZW50IHNjZW5lJyxcbiAgICAgICAgZGVzY3JpcHRpb246IFNDRU5FX0RPQ1MuY2xvc2Vfc2NlbmUsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksXG4gICAgfSlcbiAgICBhc3luYyBjbG9zZVNjZW5lKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLmNsb3NlU2NlbmVJbXBsKCk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnZ2V0X3NjZW5lX2hpZXJhcmNoeScsXG4gICAgICAgIHRpdGxlOiAnUmVhZCBzY2VuZSBoaWVyYXJjaHknLFxuICAgICAgICBkZXNjcmlwdGlvbjogU0NFTkVfRE9DUy5nZXRfc2NlbmVfaGllcmFyY2h5LFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgaW5jbHVkZUNvbXBvbmVudHM6IHouYm9vbGVhbigpLmRlZmF1bHQoZmFsc2UpLmRlc2NyaWJlKCdJbmNsdWRlIGNvbXBvbmVudCB0eXBlL2VuYWJsZWQgc3VtbWFyaWVzIG9uIGVhY2ggbm9kZS4gSW5jcmVhc2VzIHJlc3BvbnNlIHNpemUuJyksXG4gICAgICAgICAgICBtYXhEZXB0aDogei5udW1iZXIoKS5pbnQoKS5wb3NpdGl2ZSgpLmRlZmF1bHQoMTApLmRlc2NyaWJlKCdNYXhpbXVtIHRyZWUgZGVwdGguIERlZmF1bHQgMTA7IGxhcmdlIHZhbHVlcyBjYW4gcmV0dXJuIGEgbG90IG9mIGRhdGEuJyksXG4gICAgICAgICAgICBtYXhOb2Rlczogei5udW1iZXIoKS5pbnQoKS5wb3NpdGl2ZSgpLmRlZmF1bHQoMjAwMCkuZGVzY3JpYmUoJ01heGltdW0gbm9kZXMgdG8gaW5jbHVkZSBiZWZvcmUgdHJ1bmNhdGluZyB0cmF2ZXJzYWwuIERlZmF1bHQgMjAwMC4nKSxcbiAgICAgICAgICAgIHN1bW1hcnlPbmx5OiB6LmJvb2xlYW4oKS5kZWZhdWx0KGZhbHNlKS5kZXNjcmliZSgnUmV0dXJuIGNoaWxkQ291bnQgd2l0aG91dCBwZXItbm9kZSBjaGlsZHJlbiBhcnJheXMuIERlZmF1bHQgZmFsc2UuJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgZ2V0U2NlbmVIaWVyYXJjaHkoYXJnczogeyBpbmNsdWRlQ29tcG9uZW50cz86IGJvb2xlYW47IG1heERlcHRoPzogbnVtYmVyOyBtYXhOb2Rlcz86IG51bWJlcjsgc3VtbWFyeU9ubHk/OiBib29sZWFuIH0pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRTY2VuZUhpZXJhcmNoeUltcGwoYXJncy5pbmNsdWRlQ29tcG9uZW50cywgYXJncy5tYXhEZXB0aCwgYXJncy5tYXhOb2RlcywgYXJncy5zdW1tYXJ5T25seSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRDdXJyZW50U2NlbmVJbXBsKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgLy8g55u05o6l5L2/55SoIHF1ZXJ5LW5vZGUtdHJlZSDkvobnjbLlj5bloLTmma/kv6Hmga/vvIjpgJnlgIvmlrnms5Xlt7LntpPpqZforYnlj6/nlKjvvIlcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LW5vZGUtdHJlZScpLnRoZW4oKHRyZWU6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmICh0cmVlICYmIHRyZWUudXVpZCkge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBuYW1lOiB0cmVlLm5hbWUgfHwgJ0N1cnJlbnQgU2NlbmUnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IHRyZWUudXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiB0cmVlLnR5cGUgfHwgJ2NjLlNjZW5lJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBhY3RpdmU6IHRyZWUuYWN0aXZlICE9PSB1bmRlZmluZWQgPyB0cmVlLmFjdGl2ZSA6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbm9kZUNvdW50OiB0cmVlLmNoaWxkcmVuID8gdHJlZS5jaGlsZHJlbi5sZW5ndGggOiAwXG4gICAgICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKCdObyBzY2VuZSBkYXRhIGF2YWlsYWJsZScpKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIC8vIOWCmeeUqOaWueahiO+8muS9v+eUqOWgtOaZr+iFs+acrFxuICAgICAgICAgICAgICAgIHJ1blNjZW5lTWV0aG9kKCdnZXRDdXJyZW50U2NlbmVJbmZvJywgW10pLnRoZW4oKHJlc3VsdDogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICAgICAgICB9KS5jYXRjaCgoZXJyMjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGBEaXJlY3QgQVBJIGZhaWxlZDogJHtlcnIubWVzc2FnZX0sIFNjZW5lIHNjcmlwdCBmYWlsZWQ6ICR7ZXJyMi5tZXNzYWdlfWApKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldFNjZW5lTGlzdEltcGwoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICAvLyBOb3RlOiBxdWVyeS1hc3NldHMgQVBJIGNvcnJlY3RlZCB3aXRoIHByb3BlciBwYXJhbWV0ZXJzXG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldHMnLCB7XG4gICAgICAgICAgICAgICAgcGF0dGVybjogJ2RiOi8vYXNzZXRzLyoqLyouc2NlbmUnXG4gICAgICAgICAgICB9KS50aGVuKChyZXN1bHRzOiBhbnlbXSkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHNjZW5lczogU2NlbmVJbmZvW10gPSByZXN1bHRzLm1hcChhc3NldCA9PiAoe1xuICAgICAgICAgICAgICAgICAgICBuYW1lOiBhc3NldC5uYW1lLFxuICAgICAgICAgICAgICAgICAgICBwYXRoOiBhc3NldC51cmwsXG4gICAgICAgICAgICAgICAgICAgIHV1aWQ6IGFzc2V0LnV1aWRcbiAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayhzY2VuZXMpKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBvcGVuU2NlbmVJbXBsKHNjZW5lUGF0aDogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICAvLyDpppblhYjnjbLlj5bloLTmma/nmoRVVUlEXG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS11dWlkJywgc2NlbmVQYXRoKS50aGVuKCh1dWlkOiBzdHJpbmcgfCBudWxsKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKCF1dWlkKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignU2NlbmUgbm90IGZvdW5kJyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIC8vIOS9v+eUqOato+eiuueahCBzY2VuZSBBUEkg5omT6ZaL5aC05pmvICjpnIDopoFVVUlEKVxuICAgICAgICAgICAgICAgIHJldHVybiBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdvcGVuLXNjZW5lJywgdXVpZCk7XG4gICAgICAgICAgICB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHVuZGVmaW5lZCwgYFNjZW5lIG9wZW5lZDogJHtzY2VuZVBhdGh9YCkpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHNhdmVTY2VuZUltcGwoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdzYXZlLXNjZW5lJykudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh1bmRlZmluZWQsICdTY2VuZSBzYXZlZCBzdWNjZXNzZnVsbHknKSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgY29tcG9uZW50VG9vbHMgPSBuZXcgQ29tcG9uZW50VG9vbHMoKTtcblxuICAgIHByaXZhdGUgYXN5bmMgY3JlYXRlU2NlbmVJbXBsKHNjZW5lTmFtZTogc3RyaW5nLCBzYXZlUGF0aDogc3RyaW5nLCB0ZW1wbGF0ZTogJ2VtcHR5JyB8ICcyZC11aScgfCAnM2QtYmFzaWMnID0gJ2VtcHR5Jyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgLy8g56K65L+d6Lev5b6R5LulLnNjZW5l57WQ5bC+XG4gICAgICAgICAgICBjb25zdCBmdWxsUGF0aCA9IHNhdmVQYXRoLmVuZHNXaXRoKCcuc2NlbmUnKSA/IHNhdmVQYXRoIDogYCR7c2F2ZVBhdGh9LyR7c2NlbmVOYW1lfS5zY2VuZWA7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIOS9v+eUqOato+eiuueahENvY29zIENyZWF0b3IgMy445aC05pmv5qC85byPXG4gICAgICAgICAgICBjb25zdCBzY2VuZUNvbnRlbnQgPSBKU09OLnN0cmluZ2lmeShbXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcIl9fdHlwZV9fXCI6IFwiY2MuU2NlbmVBc3NldFwiLFxuICAgICAgICAgICAgICAgICAgICBcIl9uYW1lXCI6IHNjZW5lTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgXCJfb2JqRmxhZ3NcIjogMCxcbiAgICAgICAgICAgICAgICAgICAgXCJfX2VkaXRvckV4dHJhc19fXCI6IHt9LFxuICAgICAgICAgICAgICAgICAgICBcIl9uYXRpdmVcIjogXCJcIixcbiAgICAgICAgICAgICAgICAgICAgXCJzY2VuZVwiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcIl9faWRfX1wiOiAxXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCJfX3R5cGVfX1wiOiBcImNjLlNjZW5lXCIsXG4gICAgICAgICAgICAgICAgICAgIFwiX25hbWVcIjogc2NlbmVOYW1lLFxuICAgICAgICAgICAgICAgICAgICBcIl9vYmpGbGFnc1wiOiAwLFxuICAgICAgICAgICAgICAgICAgICBcIl9fZWRpdG9yRXh0cmFzX19cIjoge30sXG4gICAgICAgICAgICAgICAgICAgIFwiX3BhcmVudFwiOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICBcIl9jaGlsZHJlblwiOiBbXSxcbiAgICAgICAgICAgICAgICAgICAgXCJfYWN0aXZlXCI6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIFwiX2NvbXBvbmVudHNcIjogW10sXG4gICAgICAgICAgICAgICAgICAgIFwiX3ByZWZhYlwiOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICBcIl9scG9zXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiX190eXBlX19cIjogXCJjYy5WZWMzXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInhcIjogMCxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwieVwiOiAwLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ6XCI6IDBcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgXCJfbHJvdFwiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcIl9fdHlwZV9fXCI6IFwiY2MuUXVhdFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ4XCI6IDAsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInlcIjogMCxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwielwiOiAwLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ3XCI6IDFcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgXCJfbHNjYWxlXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiX190eXBlX19cIjogXCJjYy5WZWMzXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInhcIjogMSxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwieVwiOiAxLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ6XCI6IDFcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgXCJfbW9iaWxpdHlcIjogMCxcbiAgICAgICAgICAgICAgICAgICAgXCJfbGF5ZXJcIjogMTA3Mzc0MTgyNCxcbiAgICAgICAgICAgICAgICAgICAgXCJfZXVsZXJcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJfX3R5cGVfX1wiOiBcImNjLlZlYzNcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIFwieFwiOiAwLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ5XCI6IDAsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInpcIjogMFxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICBcImF1dG9SZWxlYXNlQXNzZXRzXCI6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICBcIl9nbG9iYWxzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiX19pZF9fXCI6IDJcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgXCJfaWRcIjogXCJzY2VuZVwiXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIFwiX190eXBlX19cIjogXCJjYy5TY2VuZUdsb2JhbHNcIixcbiAgICAgICAgICAgICAgICAgICAgXCJhbWJpZW50XCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiX19pZF9fXCI6IDNcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgXCJza3lib3hcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJfX2lkX19cIjogNFxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICBcImZvZ1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcIl9faWRfX1wiOiA1XG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIFwib2N0cmVlXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiX19pZF9fXCI6IDZcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcIl9fdHlwZV9fXCI6IFwiY2MuQW1iaWVudEluZm9cIixcbiAgICAgICAgICAgICAgICAgICAgXCJfc2t5Q29sb3JIRFJcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJfX3R5cGVfX1wiOiBcImNjLlZlYzRcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIFwieFwiOiAwLjIsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInlcIjogMC41LFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ6XCI6IDAuOCxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwid1wiOiAwLjUyMDgzM1xuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICBcIl9za3lDb2xvclwiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcIl9fdHlwZV9fXCI6IFwiY2MuVmVjNFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ4XCI6IDAuMixcbiAgICAgICAgICAgICAgICAgICAgICAgIFwieVwiOiAwLjUsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInpcIjogMC44LFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ3XCI6IDAuNTIwODMzXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIFwiX3NreUlsbHVtSERSXCI6IDIwMDAwLFxuICAgICAgICAgICAgICAgICAgICBcIl9za3lJbGx1bVwiOiAyMDAwMCxcbiAgICAgICAgICAgICAgICAgICAgXCJfZ3JvdW5kQWxiZWRvSERSXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiX190eXBlX19cIjogXCJjYy5WZWM0XCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInhcIjogMC4yLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ5XCI6IDAuMixcbiAgICAgICAgICAgICAgICAgICAgICAgIFwielwiOiAwLjIsXG4gICAgICAgICAgICAgICAgICAgICAgICBcIndcIjogMVxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICBcIl9ncm91bmRBbGJlZG9cIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJfX3R5cGVfX1wiOiBcImNjLlZlYzRcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIFwieFwiOiAwLjIsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInlcIjogMC4yLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ6XCI6IDAuMixcbiAgICAgICAgICAgICAgICAgICAgICAgIFwid1wiOiAxXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCJfX3R5cGVfX1wiOiBcImNjLlNreWJveEluZm9cIixcbiAgICAgICAgICAgICAgICAgICAgXCJfZW52TGlnaHRpbmdUeXBlXCI6IDAsXG4gICAgICAgICAgICAgICAgICAgIFwiX2Vudm1hcEhEUlwiOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICBcIl9lbnZtYXBcIjogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgXCJfZW52bWFwTG9kQ291bnRcIjogMCxcbiAgICAgICAgICAgICAgICAgICAgXCJfZGlmZnVzZU1hcEhEUlwiOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICBcIl9kaWZmdXNlTWFwXCI6IG51bGwsXG4gICAgICAgICAgICAgICAgICAgIFwiX2VuYWJsZWRcIjogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIFwiX3VzZUhEUlwiOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBcIl9lZGl0YWJsZU1hdGVyaWFsXCI6IG51bGwsXG4gICAgICAgICAgICAgICAgICAgIFwiX3JlZmxlY3Rpb25IRFJcIjogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgXCJfcmVmbGVjdGlvbk1hcFwiOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICBcIl9yb3RhdGlvbkFuZ2xlXCI6IDBcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCJfX3R5cGVfX1wiOiBcImNjLkZvZ0luZm9cIixcbiAgICAgICAgICAgICAgICAgICAgXCJfdHlwZVwiOiAwLFxuICAgICAgICAgICAgICAgICAgICBcIl9mb2dDb2xvclwiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcIl9fdHlwZV9fXCI6IFwiY2MuQ29sb3JcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiclwiOiAyMDAsXG4gICAgICAgICAgICAgICAgICAgICAgICBcImdcIjogMjAwLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJiXCI6IDIwMCxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiYVwiOiAyNTVcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgXCJfZW5hYmxlZFwiOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgXCJfZm9nRGVuc2l0eVwiOiAwLjMsXG4gICAgICAgICAgICAgICAgICAgIFwiX2ZvZ1N0YXJ0XCI6IDAuNSxcbiAgICAgICAgICAgICAgICAgICAgXCJfZm9nRW5kXCI6IDMwMCxcbiAgICAgICAgICAgICAgICAgICAgXCJfZm9nQXR0ZW5cIjogNSxcbiAgICAgICAgICAgICAgICAgICAgXCJfZm9nVG9wXCI6IDEuNSxcbiAgICAgICAgICAgICAgICAgICAgXCJfZm9nUmFuZ2VcIjogMS4yLFxuICAgICAgICAgICAgICAgICAgICBcIl9hY2N1cmF0ZVwiOiBmYWxzZVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcIl9fdHlwZV9fXCI6IFwiY2MuT2N0cmVlSW5mb1wiLFxuICAgICAgICAgICAgICAgICAgICBcIl9lbmFibGVkXCI6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICBcIl9taW5Qb3NcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJfX3R5cGVfX1wiOiBcImNjLlZlYzNcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIFwieFwiOiAtMTAyNCxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwieVwiOiAtMTAyNCxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwielwiOiAtMTAyNFxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICBcIl9tYXhQb3NcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJfX3R5cGVfX1wiOiBcImNjLlZlYzNcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIFwieFwiOiAxMDI0LFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ5XCI6IDEwMjQsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInpcIjogMTAyNFxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICBcIl9kZXB0aFwiOiA4XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgXSwgbnVsbCwgMik7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ2NyZWF0ZS1hc3NldCcsIGZ1bGxQYXRoLCBzY2VuZUNvbnRlbnQpLnRoZW4oYXN5bmMgKHJlc3VsdDogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHRlbXBsYXRlID09PSAnZW1wdHknKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIEV4aXN0aW5nIHBhdGg6IHZlcmlmeSBhbmQgcmV0dXJuLlxuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgc2NlbmVMaXN0ID0gYXdhaXQgdGhpcy5nZXRTY2VuZUxpc3RJbXBsKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjcmVhdGVkU2NlbmUgPSBzY2VuZUxpc3QuZGF0YT8uZmluZCgoc2NlbmU6IGFueSkgPT4gc2NlbmUudXVpZCA9PT0gcmVzdWx0LnV1aWQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IHJlc3VsdC51dWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB1cmw6IHJlc3VsdC51cmwsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5hbWU6IHNjZW5lTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGVtcGxhdGUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBTY2VuZSAnJHtzY2VuZU5hbWV9JyBjcmVhdGVkIHN1Y2Nlc3NmdWxseWAsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNjZW5lVmVyaWZpZWQ6ICEhY3JlYXRlZFNjZW5lLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmVyaWZpY2F0aW9uRGF0YTogY3JlYXRlZFNjZW5lLFxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IHJlc3VsdC51dWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB1cmw6IHJlc3VsdC51cmwsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5hbWU6IHNjZW5lTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGVtcGxhdGUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBTY2VuZSAnJHtzY2VuZU5hbWV9JyBjcmVhdGVkIHN1Y2Nlc3NmdWxseSAodmVyaWZpY2F0aW9uIGZhaWxlZClgLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gVGVtcGxhdGUgcGF0aDogb3BlbiB0aGUgbmV3bHktY3JlYXRlZCBzY2VuZSBhc3NldCBhbmQgYmFrZSB0aGVcbiAgICAgICAgICAgICAgICAvLyBzdGFuZGFyZCBub2Rlcy9jb21wb25lbnRzIG9uIHRvcCBvZiB0aGUgZW1wdHkgc2NhZmZvbGRpbmcgd2VcbiAgICAgICAgICAgICAgICAvLyBqdXN0IHdyb3RlLiBEb25lIGhvc3Qtc2lkZSB2aWEgRWRpdG9yLk1lc3NhZ2Ugc28gYmVoYXZpb3JcbiAgICAgICAgICAgICAgICAvLyBtYXRjaGVzIHdoYXQgdGhlIEluc3BlY3RvciB3b3VsZCBidWlsZCBmb3IgXCJOZXcgMkQgLyAzRFwiLlxuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ29wZW4tc2NlbmUnLCByZXN1bHQudXVpZCk7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKChyKSA9PiBzZXRUaW1lb3V0KHIsIDYwMCkpO1xuXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHNjZW5lUm9vdFV1aWQgPSBhd2FpdCBnZXRTY2VuZVJvb3RVdWlkKCk7XG4gICAgICAgICAgICAgICAgICAgIGlmICghc2NlbmVSb290VXVpZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdDb3VsZCBub3QgcmVzb2x2ZSBzY2VuZSByb290IFVVSUQgYWZ0ZXIgb3Blbi1zY2VuZScpO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdGVtcGxhdGVEYXRhID1cbiAgICAgICAgICAgICAgICAgICAgICAgIHRlbXBsYXRlID09PSAnMmQtdWknID8gYXdhaXQgdGhpcy5idWlsZFRlbXBsYXRlMkRVSShzY2VuZVJvb3RVdWlkKVxuICAgICAgICAgICAgICAgICAgICAgICAgOiBhd2FpdCB0aGlzLmJ1aWxkVGVtcGxhdGUzREJhc2ljKHNjZW5lUm9vdFV1aWQpO1xuXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3NhdmUtc2NlbmUnKTtcblxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiByZXN1bHQudXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB1cmw6IHJlc3VsdC51cmwsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogc2NlbmVOYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRlbXBsYXRlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRlbXBsYXRlTm9kZXM6IHRlbXBsYXRlRGF0YSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgU2NlbmUgJyR7c2NlbmVOYW1lfScgY3JlYXRlZCB3aXRoIHRlbXBsYXRlICcke3RlbXBsYXRlfScuIEVkaXRvciBzd2l0Y2hlZCB0byB0aGUgbmV3IHNjZW5lLmAsXG4gICAgICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAodGVtcGxhdGVFcnI6IGFueSkge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoYFNjZW5lIGFzc2V0IGNyZWF0ZWQgYXQgJHtyZXN1bHQudXJsfSBidXQgdGVtcGxhdGUgYnVpbGQgZmFpbGVkOiAke3RlbXBsYXRlRXJyPy5tZXNzYWdlID8/IHRlbXBsYXRlRXJyfWAsIHsgdXVpZDogcmVzdWx0LnV1aWQsIHVybDogcmVzdWx0LnVybCwgdGVtcGxhdGUgfSkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gQnVpbGQgXCJOZXcgMkRcIiBzY2FmZm9sZGluZyBpbnNpZGUgdGhlIGN1cnJlbnRseS1vcGVuIHNjZW5lOiBDYW1lcmFcbiAgICAvLyAoY2MuQ2FtZXJhLCBvcnRobykgKyBDYW52YXMgKGNjLlVJVHJhbnNmb3JtICsgY2MuQ2FudmFzIHdpdGhcbiAgICAvLyBjYW1lcmFDb21wb25lbnQgbGlua2VkLCBsYXllciBVSV8yRCkuXG4gICAgcHJpdmF0ZSBhc3luYyBidWlsZFRlbXBsYXRlMkRVSShzY2VuZVJvb3RVdWlkOiBzdHJpbmcpOiBQcm9taXNlPHsgY2FtZXJhVXVpZDogc3RyaW5nOyBjYW52YXNVdWlkOiBzdHJpbmcgfT4ge1xuICAgICAgICBjb25zdCBjYW1lcmFVdWlkID0gYXdhaXQgdGhpcy5jcmVhdGVOb2RlV2l0aENvbXBvbmVudHMoJ0NhbWVyYScsIHNjZW5lUm9vdFV1aWQsIFsnY2MuQ2FtZXJhJ10pO1xuICAgICAgICBhd2FpdCB0aGlzLmRlbGF5KDE1MCk7XG4gICAgICAgIGNvbnN0IGNhbWVyYUlkeCA9IGF3YWl0IHRoaXMuZmluZENvbXBvbmVudEluZGV4KGNhbWVyYVV1aWQsICdjYy5DYW1lcmEnKTtcbiAgICAgICAgaWYgKGNhbWVyYUlkeCA+PSAwKSB7XG4gICAgICAgICAgICAvLyAwID0gT1JUSE8sIDEgPSBQRVJTUEVDVElWRVxuICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnc2V0LXByb3BlcnR5Jywge1xuICAgICAgICAgICAgICAgIHV1aWQ6IGNhbWVyYVV1aWQsXG4gICAgICAgICAgICAgICAgcGF0aDogYF9fY29tcHNfXy4ke2NhbWVyYUlkeH0ucHJvamVjdGlvbmAsXG4gICAgICAgICAgICAgICAgZHVtcDogeyB2YWx1ZTogMCB9LFxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBjYy5DYW52YXMgcmVxdWlyZXMgY2MuVUlUcmFuc2Zvcm07IGNvY29zIGF1dG8tYWRkcyBpdCB3aGVuIGFkZGluZyBjYy5DYW52YXMuXG4gICAgICAgIGNvbnN0IGNhbnZhc1V1aWQgPSBhd2FpdCB0aGlzLmNyZWF0ZU5vZGVXaXRoQ29tcG9uZW50cygnQ2FudmFzJywgc2NlbmVSb290VXVpZCwgWydjYy5DYW52YXMnXSk7XG4gICAgICAgIGF3YWl0IHRoaXMuZGVsYXkoMTUwKTtcblxuICAgICAgICAvLyBDYW52YXMgaXRzZWxmIHNpdHMgb24gVUlfMkQgc28gaXQgKGFuZCBpdHMgZGVzY2VuZGFudHMgYnkgaW5oZXJpdGFuY2UgdmlhXG4gICAgICAgIC8vIGNyZWF0ZV9ub2RlIGF1dG8tZGV0ZWN0aW9uKSBhcmUgdmlzaWJsZSB0byB0aGUgVUkgY2FtZXJhLlxuICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdzZXQtcHJvcGVydHknLCB7XG4gICAgICAgICAgICB1dWlkOiBjYW52YXNVdWlkLFxuICAgICAgICAgICAgcGF0aDogJ2xheWVyJyxcbiAgICAgICAgICAgIGR1bXA6IHsgdmFsdWU6IExBWUVSX1VJXzJEIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIFdpcmUgQ2FudmFzLmNhbWVyYUNvbXBvbmVudCDihpIgQ2FtZXJhIG5vZGUuIFJldXNlcyB0aGUgdmVyaWZpZWRcbiAgICAgICAgLy8gcHJvcGVydHlUeXBlOiAnY29tcG9uZW50JyBjb2RlIHBhdGggc28gd2UgZG8gbm90IGhhdmUgdG8gcmUtcmVzb2x2ZVxuICAgICAgICAvLyB0aGUgY29tcG9uZW50IHNjZW5lIF9faWRfXyBoZXJlLlxuICAgICAgICBhd2FpdCB0aGlzLmNvbXBvbmVudFRvb2xzLmV4ZWN1dGUoJ3NldF9jb21wb25lbnRfcHJvcGVydHknLCB7XG4gICAgICAgICAgICBub2RlVXVpZDogY2FudmFzVXVpZCxcbiAgICAgICAgICAgIGNvbXBvbmVudFR5cGU6ICdjYy5DYW52YXMnLFxuICAgICAgICAgICAgcHJvcGVydHk6ICdjYW1lcmFDb21wb25lbnQnLFxuICAgICAgICAgICAgcHJvcGVydHlUeXBlOiAnY29tcG9uZW50JyxcbiAgICAgICAgICAgIHZhbHVlOiBjYW1lcmFVdWlkLFxuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4geyBjYW1lcmFVdWlkLCBjYW52YXNVdWlkIH07XG4gICAgfVxuXG4gICAgLy8gQnVpbGQgXCJOZXcgM0RcIiBzY2FmZm9sZGluZzogQ2FtZXJhIChwZXJzcGVjdGl2ZSkgKyBEaXJlY3Rpb25hbExpZ2h0LlxuICAgIHByaXZhdGUgYXN5bmMgYnVpbGRUZW1wbGF0ZTNEQmFzaWMoc2NlbmVSb290VXVpZDogc3RyaW5nKTogUHJvbWlzZTx7IGNhbWVyYVV1aWQ6IHN0cmluZzsgbGlnaHRVdWlkOiBzdHJpbmcgfT4ge1xuICAgICAgICBjb25zdCBjYW1lcmFVdWlkID0gYXdhaXQgdGhpcy5jcmVhdGVOb2RlV2l0aENvbXBvbmVudHMoJ01haW4gQ2FtZXJhJywgc2NlbmVSb290VXVpZCwgWydjYy5DYW1lcmEnXSk7XG4gICAgICAgIGNvbnN0IGxpZ2h0VXVpZCA9IGF3YWl0IHRoaXMuY3JlYXRlTm9kZVdpdGhDb21wb25lbnRzKCdNYWluIExpZ2h0Jywgc2NlbmVSb290VXVpZCwgWydjYy5EaXJlY3Rpb25hbExpZ2h0J10pO1xuICAgICAgICBhd2FpdCB0aGlzLmRlbGF5KDE1MCk7XG4gICAgICAgIHJldHVybiB7IGNhbWVyYVV1aWQsIGxpZ2h0VXVpZCB9O1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgY3JlYXRlTm9kZVdpdGhDb21wb25lbnRzKG5hbWU6IHN0cmluZywgcGFyZW50OiBzdHJpbmcsIGNvbXBvbmVudHM6IHN0cmluZ1tdKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnY3JlYXRlLW5vZGUnLCB7IG5hbWUsIHBhcmVudCB9KTtcbiAgICAgICAgY29uc3QgdXVpZCA9IEFycmF5LmlzQXJyYXkocmVzdWx0KSA/IHJlc3VsdFswXSA6IHJlc3VsdDtcbiAgICAgICAgaWYgKHR5cGVvZiB1dWlkICE9PSAnc3RyaW5nJyB8fCAhdXVpZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBjcmVhdGUtbm9kZSByZXR1cm5lZCBubyBVVUlEIGZvciAke25hbWV9YCk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gY3JlYXRlLW5vZGUgaGFzIG5vIGBjb21wb25lbnRzYCBmaWVsZCBvbiB0aGUgdHlwZWQgQ3JlYXRlTm9kZU9wdGlvbnMsXG4gICAgICAgIC8vIHNvIHdpcmUgY29tcG9uZW50cyB2aWEgdGhlIGRlZGljYXRlZCBjcmVhdGUtY29tcG9uZW50IGNoYW5uZWwuIEVhY2hcbiAgICAgICAgLy8gY2FsbCBuZWVkcyBhIHNtYWxsIGJyZWF0aCBmb3IgdGhlIGVkaXRvciB0byBzZXR0bGUgdGhlIGR1bXAuXG4gICAgICAgIGZvciAoY29uc3QgY29tcG9uZW50IG9mIGNvbXBvbmVudHMpIHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuZGVsYXkoODApO1xuICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnY3JlYXRlLWNvbXBvbmVudCcsIHsgdXVpZCwgY29tcG9uZW50IH0pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB1dWlkO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZmluZENvbXBvbmVudEluZGV4KG5vZGVVdWlkOiBzdHJpbmcsIGNvbXBvbmVudFR5cGU6IHN0cmluZyk6IFByb21pc2U8bnVtYmVyPiB7XG4gICAgICAgIGNvbnN0IGRhdGE6IGFueSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LW5vZGUnLCBub2RlVXVpZCk7XG4gICAgICAgIGNvbnN0IGNvbXBzID0gQXJyYXkuaXNBcnJheShkYXRhPy5fX2NvbXBzX18pID8gZGF0YS5fX2NvbXBzX18gOiBbXTtcbiAgICAgICAgY29uc3QgY29tcG9uZW50SW5kZXggPSBmaW5kQ29tcG9uZW50SW5kZXhCeVR5cGUoY29tcHMsIGNvbXBvbmVudFR5cGUpO1xuICAgICAgICBpZiAoY29tcG9uZW50SW5kZXggIT09IC0xKSByZXR1cm4gY29tcG9uZW50SW5kZXg7XG4gICAgICAgIGRlYnVnTG9nKGBbU2NlbmVUb29sc10gY29tcG9uZW50ICcke2NvbXBvbmVudFR5cGV9JyBub3QgZm91bmQgb24gbm9kZSAke25vZGVVdWlkfWApO1xuICAgICAgICByZXR1cm4gLTE7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBkZWxheShtczogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocikgPT4gc2V0VGltZW91dChyLCBtcykpO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2V0U2NlbmVIaWVyYXJjaHlJbXBsKGluY2x1ZGVDb21wb25lbnRzOiBib29sZWFuID0gZmFsc2UsIG1heERlcHRoOiBudW1iZXIgPSAxMCwgbWF4Tm9kZXM6IG51bWJlciA9IDIwMDAsIHN1bW1hcnlPbmx5OiBib29sZWFuID0gZmFsc2UpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIC8vIOWEquWFiOWakOippuS9v+eUqCBFZGl0b3IgQVBJIOafpeipouWgtOaZr+evgOm7nuaouVxuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktbm9kZS10cmVlJykudGhlbigodHJlZTogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHRyZWUpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY291bnRlciA9IHsgY291bnQ6IDAgfTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdHJ1bmNhdGlvbiA9IHsgdHJ1bmNhdGVkOiBmYWxzZSwgdHJ1bmNhdGVkQnk6IHVuZGVmaW5lZCBhcyAnbWF4RGVwdGgnIHwgJ21heE5vZGVzJyB8IHVuZGVmaW5lZCB9O1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBoaWVyYXJjaHkgPSB0aGlzLmJ1aWxkSGllcmFyY2h5KHRyZWUsIGluY2x1ZGVDb21wb25lbnRzLCBtYXhEZXB0aCwgbWF4Tm9kZXMsIHN1bW1hcnlPbmx5LCBjb3VudGVyLCB0cnVuY2F0aW9uKTtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh0aGlzLndpdGhIaWVyYXJjaHlDYXBzKG9rKGhpZXJhcmNoeSksIGNvdW50ZXIsIHRydW5jYXRpb24sIG1heERlcHRoLCBtYXhOb2Rlcywgc3VtbWFyeU9ubHkpKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoJ05vIHNjZW5lIGhpZXJhcmNoeSBhdmFpbGFibGUnKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICAvLyDlgpnnlKjmlrnmoYjvvJrkvb/nlKjloLTmma/ohbPmnKxcbiAgICAgICAgICAgICAgICBydW5TY2VuZU1ldGhvZCgnZ2V0U2NlbmVIaWVyYXJjaHknLCBbaW5jbHVkZUNvbXBvbmVudHNdKS50aGVuKChyZXN1bHQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXJlc3VsdD8uc3VjY2VzcyB8fCAhcmVzdWx0LmRhdGEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBjb25zdCBjb3VudGVyID0geyBjb3VudDogMCB9O1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB0cnVuY2F0aW9uID0geyB0cnVuY2F0ZWQ6IGZhbHNlLCB0cnVuY2F0ZWRCeTogdW5kZWZpbmVkIGFzICdtYXhEZXB0aCcgfCAnbWF4Tm9kZXMnIHwgdW5kZWZpbmVkIH07XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGhpZXJhcmNoeSA9IHRoaXMuYnVpbGRIaWVyYXJjaHkocmVzdWx0LmRhdGEsIGluY2x1ZGVDb21wb25lbnRzLCBtYXhEZXB0aCwgbWF4Tm9kZXMsIHN1bW1hcnlPbmx5LCBjb3VudGVyLCB0cnVuY2F0aW9uKTtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh0aGlzLndpdGhIaWVyYXJjaHlDYXBzKG9rKGhpZXJhcmNoeSwgcmVzdWx0Lm1lc3NhZ2UpLCBjb3VudGVyLCB0cnVuY2F0aW9uLCBtYXhEZXB0aCwgbWF4Tm9kZXMsIHN1bW1hcnlPbmx5KSk7XG4gICAgICAgICAgICAgICAgfSkuY2F0Y2goKGVycjI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChgRGlyZWN0IEFQSSBmYWlsZWQ6ICR7ZXJyLm1lc3NhZ2V9LCBTY2VuZSBzY3JpcHQgZmFpbGVkOiAke2VycjIubWVzc2FnZX1gKSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBidWlsZEhpZXJhcmNoeShcbiAgICAgICAgbm9kZTogYW55LFxuICAgICAgICBpbmNsdWRlQ29tcG9uZW50czogYm9vbGVhbixcbiAgICAgICAgbWF4RGVwdGg6IG51bWJlcixcbiAgICAgICAgbWF4Tm9kZXM6IG51bWJlcixcbiAgICAgICAgc3VtbWFyeU9ubHk6IGJvb2xlYW4sXG4gICAgICAgIGNvdW50ZXI6IHsgY291bnQ6IG51bWJlciB9LFxuICAgICAgICB0cnVuY2F0aW9uOiB7IHRydW5jYXRlZDogYm9vbGVhbjsgdHJ1bmNhdGVkQnk/OiAnbWF4RGVwdGgnIHwgJ21heE5vZGVzJyB9LFxuICAgICAgICBkZXB0aDogbnVtYmVyID0gMCxcbiAgICApOiBhbnkge1xuICAgICAgICBjb3VudGVyLmNvdW50Kys7XG5cbiAgICAgICAgY29uc3Qgbm9kZUluZm86IGFueSA9IHtcbiAgICAgICAgICAgIHV1aWQ6IG5vZGUudXVpZCxcbiAgICAgICAgICAgIG5hbWU6IG5vZGUubmFtZSxcbiAgICAgICAgICAgIHR5cGU6IG5vZGUudHlwZSxcbiAgICAgICAgICAgIGFjdGl2ZTogbm9kZS5hY3RpdmUsXG4gICAgICAgICAgICBjaGlsZENvdW50OiBub2RlLmNoaWxkcmVuID8gbm9kZS5jaGlsZHJlbi5sZW5ndGggOiAwLFxuICAgICAgICB9O1xuICAgICAgICBpZiAoIXN1bW1hcnlPbmx5KSB7XG4gICAgICAgICAgICBub2RlSW5mby5jaGlsZHJlbiA9IFtdO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGluY2x1ZGVDb21wb25lbnRzICYmIG5vZGUuX19jb21wc19fKSB7XG4gICAgICAgICAgICBub2RlSW5mby5jb21wb25lbnRzID0gbm9kZS5fX2NvbXBzX18ubWFwKChjb21wOiBhbnkpID0+ICh7XG4gICAgICAgICAgICAgICAgdHlwZTogY29tcC5fX3R5cGVfXyB8fCAnVW5rbm93bicsXG4gICAgICAgICAgICAgICAgZW5hYmxlZDogY29tcC5lbmFibGVkICE9PSB1bmRlZmluZWQgPyBjb21wLmVuYWJsZWQgOiB0cnVlXG4gICAgICAgICAgICB9KSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXN1bW1hcnlPbmx5ICYmIG5vZGVJbmZvLmNoaWxkQ291bnQgPiAwICYmIGRlcHRoID49IG1heERlcHRoIC0gMSkge1xuICAgICAgICAgICAgdHJ1bmNhdGlvbi50cnVuY2F0ZWQgPSB0cnVlO1xuICAgICAgICAgICAgdHJ1bmNhdGlvbi50cnVuY2F0ZWRCeSA/Pz0gJ21heERlcHRoJztcbiAgICAgICAgICAgIG5vZGVJbmZvLnRydW5jYXRlZCA9IHRydWU7XG4gICAgICAgICAgICBub2RlSW5mby50cnVuY2F0ZWRCeSA9ICdtYXhEZXB0aCc7XG4gICAgICAgICAgICByZXR1cm4gbm9kZUluZm87XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFzdW1tYXJ5T25seSAmJiBub2RlSW5mby5jaGlsZENvdW50ID4gMCAmJiBjb3VudGVyLmNvdW50ID49IG1heE5vZGVzKSB7XG4gICAgICAgICAgICB0cnVuY2F0aW9uLnRydW5jYXRlZCA9IHRydWU7XG4gICAgICAgICAgICB0cnVuY2F0aW9uLnRydW5jYXRlZEJ5ID8/PSAnbWF4Tm9kZXMnO1xuICAgICAgICAgICAgbm9kZUluZm8udHJ1bmNhdGVkID0gdHJ1ZTtcbiAgICAgICAgICAgIG5vZGVJbmZvLnRydW5jYXRlZEJ5ID0gJ21heE5vZGVzJztcbiAgICAgICAgICAgIHJldHVybiBub2RlSW5mbztcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghc3VtbWFyeU9ubHkgJiYgbm9kZS5jaGlsZHJlbikge1xuICAgICAgICAgICAgbm9kZUluZm8uY2hpbGRyZW4gPSBub2RlLmNoaWxkcmVuLm1hcCgoY2hpbGQ6IGFueSkgPT4gXG4gICAgICAgICAgICAgICAgdGhpcy5idWlsZEhpZXJhcmNoeShjaGlsZCwgaW5jbHVkZUNvbXBvbmVudHMsIG1heERlcHRoLCBtYXhOb2Rlcywgc3VtbWFyeU9ubHksIGNvdW50ZXIsIHRydW5jYXRpb24sIGRlcHRoICsgMSlcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBpZiAoY291bnRlci5jb3VudCA+PSBtYXhOb2Rlcykge1xuICAgICAgICAgICAgICAgIHRydW5jYXRpb24udHJ1bmNhdGVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB0cnVuY2F0aW9uLnRydW5jYXRlZEJ5ID8/PSAnbWF4Tm9kZXMnO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG5vZGVJbmZvO1xuICAgIH1cblxuICAgIHByaXZhdGUgd2l0aEhpZXJhcmNoeUNhcHMoXG4gICAgICAgIHJlc3BvbnNlOiBUb29sUmVzcG9uc2UsXG4gICAgICAgIGNvdW50ZXI6IHsgY291bnQ6IG51bWJlciB9LFxuICAgICAgICB0cnVuY2F0aW9uOiB7IHRydW5jYXRlZDogYm9vbGVhbjsgdHJ1bmNhdGVkQnk/OiAnbWF4RGVwdGgnIHwgJ21heE5vZGVzJyB9LFxuICAgICAgICBtYXhEZXB0aDogbnVtYmVyLFxuICAgICAgICBtYXhOb2RlczogbnVtYmVyLFxuICAgICAgICBzdW1tYXJ5T25seTogYm9vbGVhbixcbiAgICApOiBUb29sUmVzcG9uc2Uge1xuICAgICAgICBjb25zdCBjYXBwZWRSZXNwb25zZSA9IHJlc3BvbnNlIGFzIFRvb2xSZXNwb25zZSAmIHtcbiAgICAgICAgICAgIHRydW5jYXRlZDogYm9vbGVhbjtcbiAgICAgICAgICAgIHRydW5jYXRlZEJ5PzogJ21heERlcHRoJyB8ICdtYXhOb2Rlcyc7XG4gICAgICAgICAgICBub2RlQ291bnQ6IG51bWJlcjtcbiAgICAgICAgICAgIG1heERlcHRoOiBudW1iZXI7XG4gICAgICAgICAgICBtYXhOb2RlczogbnVtYmVyO1xuICAgICAgICAgICAgc3VtbWFyeU9ubHk6IGJvb2xlYW47XG4gICAgICAgIH07XG4gICAgICAgIGNhcHBlZFJlc3BvbnNlLnRydW5jYXRlZCA9IHRydW5jYXRpb24udHJ1bmNhdGVkO1xuICAgICAgICBpZiAodHJ1bmNhdGlvbi50cnVuY2F0ZWRCeSkgY2FwcGVkUmVzcG9uc2UudHJ1bmNhdGVkQnkgPSB0cnVuY2F0aW9uLnRydW5jYXRlZEJ5O1xuICAgICAgICBjYXBwZWRSZXNwb25zZS5ub2RlQ291bnQgPSBjb3VudGVyLmNvdW50O1xuICAgICAgICBjYXBwZWRSZXNwb25zZS5tYXhEZXB0aCA9IG1heERlcHRoO1xuICAgICAgICBjYXBwZWRSZXNwb25zZS5tYXhOb2RlcyA9IG1heE5vZGVzO1xuICAgICAgICBjYXBwZWRSZXNwb25zZS5zdW1tYXJ5T25seSA9IHN1bW1hcnlPbmx5O1xuICAgICAgICByZXR1cm4gY2FwcGVkUmVzcG9uc2U7XG4gICAgfVxuXG4gICAgLy8gUHJvZ3JhbW1hdGljIHNhdmUtYXMuIFRoZSBjb2NvcyBgc2NlbmUvc2F2ZS1hcy1zY2VuZWAgY2hhbm5lbCBvbmx5IG9wZW5zXG4gICAgLy8gdGhlIG5hdGl2ZSBmaWxlIGRpYWxvZyAoYW5kIGJsb2NrcyB1bnRpbCB0aGUgdXNlciBkaXNtaXNzZXMgaXQg4oCUIHJvb3RcbiAgICAvLyBjYXVzZSBvZiB0aGUgPjE1cyB0aW1lb3V0IHJlcG9ydGVkIGluIEhBTkRPRkYpLCBzbyB3ZSBkbyBub3QgdXNlIGl0LlxuICAgIC8vIEluc3RlYWQ6IHNhdmUgdGhlIGN1cnJlbnQgc2NlbmUgdG8gZmx1c2ggZWRpdHMsIHJlc29sdmUgaXRzIGFzc2V0IHVybCxcbiAgICAvLyB0aGVuIGFzc2V0LWRiIGNvcHktYXNzZXQgdG8gdGhlIHRhcmdldCBwYXRoLiBPcHRpb25hbGx5IG9wZW4gdGhlIGNvcHkuXG4gICAgcHJpdmF0ZSBhc3luYyBzYXZlU2NlbmVBc0ltcGwoYXJnczogeyBwYXRoOiBzdHJpbmc7IG9wZW5BZnRlcj86IGJvb2xlYW47IG92ZXJ3cml0ZT86IGJvb2xlYW4gfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3NhdmUtc2NlbmUnKTtcblxuICAgICAgICBjb25zdCBzY2VuZVV1aWQgPSBhd2FpdCBnZXRTY2VuZVJvb3RVdWlkKCk7XG4gICAgICAgIGlmICghc2NlbmVVdWlkKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbCgnTm8gc2NlbmUgaXMgY3VycmVudGx5IG9wZW4uJyk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBzb3VyY2VVcmwgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS11cmwnLCBzY2VuZVV1aWQpO1xuICAgICAgICBpZiAoIXNvdXJjZVVybCkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ0N1cnJlbnQgc2NlbmUgaGFzIG5vIGFzc2V0IHBhdGggb24gZGlzayB5ZXQuIFNhdmUgaXQgb25jZSB2aWEgdGhlIENvY29zIFVJIChvciB1c2UgY3JlYXRlX3NjZW5lIHRvIHdyaXRlIGEgYmFja2luZyBmaWxlKSBiZWZvcmUgc2F2ZV9zY2VuZV9hcyBjYW4gY29weSBpdC4nKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHRhcmdldFBhdGggPSBhcmdzLnBhdGguZW5kc1dpdGgoJy5zY2VuZScpID8gYXJncy5wYXRoIDogYCR7YXJncy5wYXRofS5zY2VuZWA7XG5cbiAgICAgICAgLy8gUHJlLWNoZWNrIGV4aXN0ZW5jZSBzbyBhIGNvbGxpc2lvbiByZXR1cm5zIGEgY2xlYW4gZXJyb3JcbiAgICAgICAgLy8gaW5zdGVhZCBvZiBsZXR0aW5nIGNvY29zIHBvcCBhIFwiZmlsZSBleGlzdHMsIG92ZXJ3cml0ZT9cIiBtb2RhbFxuICAgICAgICAvLyBhbmQgYmxvY2sgb24gdXNlciBpbnB1dC4gY29jb3Mgb25seSByZXNwZWN0cyBgb3ZlcndyaXRlOiB0cnVlYFxuICAgICAgICAvLyBzaWxlbnRseTsgdGhlICFvdmVyd3JpdGUgcGF0aCBvdGhlcndpc2Ugb3BlbnMgYSBkaWFsb2cuXG4gICAgICAgIGlmICghYXJncy5vdmVyd3JpdGUpIHtcbiAgICAgICAgICAgIGNvbnN0IGV4aXN0aW5nID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktdXVpZCcsIHRhcmdldFBhdGgpO1xuICAgICAgICAgICAgaWYgKGV4aXN0aW5nKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoYFRhcmdldCAnJHt0YXJnZXRQYXRofScgYWxyZWFkeSBleGlzdHMuIFBhc3Mgb3ZlcndyaXRlOiB0cnVlIHRvIHJlcGxhY2UgaXQuYCwgeyBleGlzdGluZ1V1aWQ6IGV4aXN0aW5nIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgY29weVJlc3VsdDogYW55ID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdChcbiAgICAgICAgICAgICdhc3NldC1kYicsXG4gICAgICAgICAgICAnY29weS1hc3NldCcsXG4gICAgICAgICAgICBzb3VyY2VVcmwsXG4gICAgICAgICAgICB0YXJnZXRQYXRoLFxuICAgICAgICAgICAgeyBvdmVyd3JpdGU6ICEhYXJncy5vdmVyd3JpdGUgfSxcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKCFjb3B5UmVzdWx0IHx8ICFjb3B5UmVzdWx0LnV1aWQpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGBhc3NldC1kYiBjb3B5LWFzc2V0IHJldHVybmVkIG5vIHJlc3VsdCBmb3IgJHtzb3VyY2VVcmx9IC0+ICR7dGFyZ2V0UGF0aH0uYCk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBvcGVuQWZ0ZXIgPSBhcmdzLm9wZW5BZnRlciAhPT0gZmFsc2U7XG4gICAgICAgIGlmIChvcGVuQWZ0ZXIpIHtcbiAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ29wZW4tc2NlbmUnLCBjb3B5UmVzdWx0LnV1aWQpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG9rKHtcbiAgICAgICAgICAgICAgICBzb3VyY2VVcmwsXG4gICAgICAgICAgICAgICAgbmV3VXVpZDogY29weVJlc3VsdC51dWlkLFxuICAgICAgICAgICAgICAgIG5ld1VybDogY29weVJlc3VsdC51cmwsXG4gICAgICAgICAgICAgICAgb3BlbmVkOiBvcGVuQWZ0ZXIsXG4gICAgICAgICAgICB9LCBgU2NlbmUgc2F2ZWQgYXMgJHtjb3B5UmVzdWx0LnVybH1gKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGNsb3NlU2NlbmVJbXBsKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnY2xvc2Utc2NlbmUnKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHVuZGVmaW5lZCwgJ1NjZW5lIGNsb3NlZCBzdWNjZXNzZnVsbHknKSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cbn1cbiJdfQ==