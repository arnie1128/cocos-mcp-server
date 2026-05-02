import { ok, fail } from '../lib/response';
import type { ToolDefinition, ToolResponse, ToolExecutor, SceneInfo } from '../types';
import { z } from '../lib/schema';
import { mcpTool, defineToolsFromDecorators } from '../lib/decorators';
import { runSceneMethod } from '../lib/scene-bridge';
import { ComponentTools } from './component-tools';
import { debugLog } from '../lib/log';

const LAYER_UI_2D = 33554432;

export class SceneTools implements ToolExecutor {
    private readonly exec: ToolExecutor;

    constructor() {
        this.exec = defineToolsFromDecorators(this);
    }

    getTools(): ToolDefinition[] { return this.exec.getTools(); }
    execute(toolName: string, args: any): Promise<ToolResponse> { return this.exec.execute(toolName, args); }

    @mcpTool({
        name: 'get_current_scene',
        title: 'Read current scene',
        description: '[specialist] Read the currently open scene root summary (name/uuid/type/active/nodeCount). No scene mutation; use to get the scene root UUID. Also exposed as resource cocos://scene/current; prefer the resource when the client supports MCP resources.',
        inputSchema: z.object({}),
    })
    async getCurrentScene(): Promise<ToolResponse> {
        return this.getCurrentSceneImpl();
    }

    @mcpTool({
        name: 'get_scene_list',
        title: 'List scene assets',
        description: '[specialist] List .scene assets under db://assets with name/path/uuid. Does not open scenes or modify assets. Also exposed as resource cocos://scene/list.',
        inputSchema: z.object({}),
    })
    async getSceneList(): Promise<ToolResponse> {
        return this.getSceneListImpl();
    }

    @mcpTool({
        name: 'open_scene',
        title: 'Open scene by path',
        description: '[specialist] Open a scene by db:// path. Switches the active Editor scene; save current edits first if needed.',
        inputSchema: z.object({
            scenePath: z.string().describe('Scene db:// path to open, e.g. db://assets/scenes/Main.scene. The tool resolves UUID first.'),
        }),
    })
    async openScene(args: { scenePath: string }): Promise<ToolResponse> {
        return this.openSceneImpl(args.scenePath);
    }

    @mcpTool({
        name: 'save_scene',
        title: 'Save current scene',
        description: '[specialist] Save the currently open scene back to its scene asset. Mutates the project file on disk.',
        inputSchema: z.object({}),
    })
    async saveScene(): Promise<ToolResponse> {
        return this.saveSceneImpl();
    }

    @mcpTool({
        name: 'create_scene',
        title: 'Create scene asset',
        description: '[specialist] Create a new .scene asset. Mutates asset-db; non-empty templates also open the new scene and populate standard Camera/Canvas or Camera/Light nodes.',
        inputSchema: z.object({
            sceneName: z.string().describe('New scene name; written into the created cc.SceneAsset / cc.Scene.'),
            savePath: z.string().describe('Target scene location. Pass a full .scene path or a folder path to append sceneName.scene.'),
            template: z.enum(['empty', '2d-ui', '3d-basic']).default('empty').describe(
                'Built-in scaffolding for the new scene. ' +
                '"empty" (default): bare scene root only — current behavior. ' +
                '"2d-ui": Camera (cc.Camera, ortho projection) + Canvas (cc.UITransform + cc.Canvas with cameraComponent linked, layer UI_2D) so UI nodes render immediately under the UI camera. ' +
                '"3d-basic": Camera (perspective) + DirectionalLight at scene root. ' +
                '⚠️ Side effect: when template is not "empty" the editor opens the newly created scene to populate it. Save your current scene first if it has unsaved changes.'
            ),
        }),
    })
    async createScene(args: { sceneName: string; savePath: string; template: 'empty' | '2d-ui' | '3d-basic' }): Promise<ToolResponse> {
        return this.createSceneImpl(args.sceneName, args.savePath, args.template);
    }

    @mcpTool({
        name: 'save_scene_as',
        title: 'Copy scene asset',
        description: '[specialist] Copy the currently open scene to a new .scene asset. Saves current scene first; optionally opens the copy and can overwrite when requested.',
        inputSchema: z.object({
            path: z.string().describe('Target db:// path for the new scene file (e.g. "db://assets/scenes/Copy.scene"). The ".scene" extension is appended if missing.'),
            openAfter: z.boolean().default(true).describe('Open the newly-saved scene right after the copy. Default true. Pass false to keep the current scene focused.'),
            overwrite: z.boolean().default(false).describe('Overwrite the target file if it already exists. Default false; with false, a name collision returns an error.'),
        }),
    })
    async saveSceneAs(args: { path: string; openAfter?: boolean; overwrite?: boolean }): Promise<ToolResponse> {
        return this.saveSceneAsImpl(args);
    }

    @mcpTool({
        name: 'close_scene',
        title: 'Close current scene',
        description: '[specialist] Close the current scene. Editor state side effect; save first if unsaved changes matter.',
        inputSchema: z.object({}),
    })
    async closeScene(): Promise<ToolResponse> {
        return this.closeSceneImpl();
    }

    @mcpTool({
        name: 'get_scene_hierarchy',
        title: 'Read scene hierarchy',
        description: '[specialist] Read the complete current scene node hierarchy. No mutation; use for UUID/path lookup, optionally with component summaries. Also exposed as resource cocos://scene/hierarchy (defaults: includeComponents=false); prefer the resource for full-tree reads.',
        inputSchema: z.object({
            includeComponents: z.boolean().default(false).describe('Include component type/enabled summaries on each node. Increases response size.'),
        }),
    })
    async getSceneHierarchy(args: { includeComponents?: boolean }): Promise<ToolResponse> {
        return this.getSceneHierarchyImpl(args.includeComponents);
    }

    private async getCurrentSceneImpl(): Promise<ToolResponse> {
        return new Promise((resolve) => {
            // 直接使用 query-node-tree 來獲取場景信息（這個方法已經驗證可用）
            Editor.Message.request('scene', 'query-node-tree').then((tree: any) => {
                if (tree && tree.uuid) {
                    resolve(ok({
                            name: tree.name || 'Current Scene',
                            uuid: tree.uuid,
                            type: tree.type || 'cc.Scene',
                            active: tree.active !== undefined ? tree.active : true,
                            nodeCount: tree.children ? tree.children.length : 0
                        }));
                } else {
                    resolve(fail('No scene data available'));
                }
            }).catch((err: Error) => {
                // 備用方案：使用場景腳本
                runSceneMethod('getCurrentSceneInfo', []).then((result: any) => {
                    resolve(result);
                }).catch((err2: Error) => {
                    resolve(fail(`Direct API failed: ${err.message}, Scene script failed: ${err2.message}`));
                });
            });
        });
    }

    private async getSceneListImpl(): Promise<ToolResponse> {
        return new Promise((resolve) => {
            // Note: query-assets API corrected with proper parameters
            Editor.Message.request('asset-db', 'query-assets', {
                pattern: 'db://assets/**/*.scene'
            }).then((results: any[]) => {
                const scenes: SceneInfo[] = results.map(asset => ({
                    name: asset.name,
                    path: asset.url,
                    uuid: asset.uuid
                }));
                resolve(ok(scenes));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async openSceneImpl(scenePath: string): Promise<ToolResponse> {
        return new Promise((resolve) => {
            // 首先獲取場景的UUID
            Editor.Message.request('asset-db', 'query-uuid', scenePath).then((uuid: string | null) => {
                if (!uuid) {
                    throw new Error('Scene not found');
                }
                
                // 使用正確的 scene API 打開場景 (需要UUID)
                return Editor.Message.request('scene', 'open-scene', uuid);
            }).then(() => {
                resolve(ok(undefined, `Scene opened: ${scenePath}`));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async saveSceneImpl(): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'save-scene').then(() => {
                resolve(ok(undefined, 'Scene saved successfully'));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private componentTools = new ComponentTools();

    private async createSceneImpl(sceneName: string, savePath: string, template: 'empty' | '2d-ui' | '3d-basic' = 'empty'): Promise<ToolResponse> {
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
            
            Editor.Message.request('asset-db', 'create-asset', fullPath, sceneContent).then(async (result: any) => {
                if (template === 'empty') {
                    // Existing path: verify and return.
                    try {
                        const sceneList = await this.getSceneListImpl();
                        const createdScene = sceneList.data?.find((scene: any) => scene.uuid === result.uuid);
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
                    } catch {
                        resolve(ok({
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

                    const tree: any = await Editor.Message.request('scene', 'query-node-tree');
                    const sceneRootUuid: string | undefined = tree?.uuid;
                    if (!sceneRootUuid) {
                        throw new Error('Could not resolve scene root UUID after open-scene');
                    }

                    const templateData =
                        template === '2d-ui' ? await this.buildTemplate2DUI(sceneRootUuid)
                        : await this.buildTemplate3DBasic(sceneRootUuid);

                    await Editor.Message.request('scene', 'save-scene');

                    resolve(ok({
                            uuid: result.uuid,
                            url: result.url,
                            name: sceneName,
                            template,
                            templateNodes: templateData,
                            message: `Scene '${sceneName}' created with template '${template}'. Editor switched to the new scene.`,
                        }));
                } catch (templateErr: any) {
                    resolve(fail(`Scene asset created at ${result.url} but template build failed: ${templateErr?.message ?? templateErr}`, { uuid: result.uuid, url: result.url, template }));
                }
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    // Build "New 2D" scaffolding inside the currently-open scene: Camera
    // (cc.Camera, ortho) + Canvas (cc.UITransform + cc.Canvas with
    // cameraComponent linked, layer UI_2D).
    private async buildTemplate2DUI(sceneRootUuid: string): Promise<{ cameraUuid: string; canvasUuid: string }> {
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
    private async buildTemplate3DBasic(sceneRootUuid: string): Promise<{ cameraUuid: string; lightUuid: string }> {
        const cameraUuid = await this.createNodeWithComponents('Main Camera', sceneRootUuid, ['cc.Camera']);
        const lightUuid = await this.createNodeWithComponents('Main Light', sceneRootUuid, ['cc.DirectionalLight']);
        await this.delay(150);
        return { cameraUuid, lightUuid };
    }

    private async createNodeWithComponents(name: string, parent: string, components: string[]): Promise<string> {
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

    private async findComponentIndex(nodeUuid: string, componentType: string): Promise<number> {
        const data: any = await Editor.Message.request('scene', 'query-node', nodeUuid);
        const comps = Array.isArray(data?.__comps__) ? data.__comps__ : [];
        for (let i = 0; i < comps.length; i++) {
            const t = comps[i]?.__type__ ?? comps[i]?.type ?? comps[i]?.cid;
            if (t === componentType) return i;
        }
        debugLog(`[SceneTools] component '${componentType}' not found on node ${nodeUuid}`);
        return -1;
    }

    private delay(ms: number): Promise<void> {
        return new Promise((r) => setTimeout(r, ms));
    }

    private async getSceneHierarchyImpl(includeComponents: boolean = false): Promise<ToolResponse> {
        return new Promise((resolve) => {
            // 優先嚐試使用 Editor API 查詢場景節點樹
            Editor.Message.request('scene', 'query-node-tree').then((tree: any) => {
                if (tree) {
                    const hierarchy = this.buildHierarchy(tree, includeComponents);
                    resolve(ok(hierarchy));
                } else {
                    resolve(fail('No scene hierarchy available'));
                }
            }).catch((err: Error) => {
                // 備用方案：使用場景腳本
                runSceneMethod('getSceneHierarchy', [includeComponents]).then((result: any) => {
                    resolve(result);
                }).catch((err2: Error) => {
                    resolve(fail(`Direct API failed: ${err.message}, Scene script failed: ${err2.message}`));
                });
            });
        });
    }

    private buildHierarchy(node: any, includeComponents: boolean): any {
        const nodeInfo: any = {
            uuid: node.uuid,
            name: node.name,
            type: node.type,
            active: node.active,
            children: []
        };

        if (includeComponents && node.__comps__) {
            nodeInfo.components = node.__comps__.map((comp: any) => ({
                type: comp.__type__ || 'Unknown',
                enabled: comp.enabled !== undefined ? comp.enabled : true
            }));
        }

        if (node.children) {
            nodeInfo.children = node.children.map((child: any) => 
                this.buildHierarchy(child, includeComponents)
            );
        }

        return nodeInfo;
    }

    // Programmatic save-as. The cocos `scene/save-as-scene` channel only opens
    // the native file dialog (and blocks until the user dismisses it — root
    // cause of the >15s timeout reported in HANDOFF), so we do not use it.
    // Instead: save the current scene to flush edits, resolve its asset url,
    // then asset-db copy-asset to the target path. Optionally open the copy.
    private async saveSceneAsImpl(args: { path: string; openAfter?: boolean; overwrite?: boolean }): Promise<ToolResponse> {
        await Editor.Message.request('scene', 'save-scene');

        const tree: any = await Editor.Message.request('scene', 'query-node-tree');
        const sceneUuid: string | undefined = tree?.uuid;
        if (!sceneUuid) {
            return fail('No scene is currently open.');
        }

        const sourceUrl = await Editor.Message.request('asset-db', 'query-url', sceneUuid);
        if (!sourceUrl) {
            return fail('Current scene has no asset path on disk yet. Save it once via the Cocos UI (or use create_scene to write a backing file) before save_scene_as can copy it.');
        }

        const targetPath = args.path.endsWith('.scene') ? args.path : `${args.path}.scene`;

        // Pre-check existence so a collision returns a clean error
        // instead of letting cocos pop a "file exists, overwrite?" modal
        // and block on user input. cocos only respects `overwrite: true`
        // silently; the !overwrite path otherwise opens a dialog.
        if (!args.overwrite) {
            const existing = await Editor.Message.request('asset-db', 'query-uuid', targetPath);
            if (existing) {
                return fail(`Target '${targetPath}' already exists. Pass overwrite: true to replace it.`, { existingUuid: existing });
            }
        }

        const copyResult: any = await Editor.Message.request(
            'asset-db',
            'copy-asset',
            sourceUrl,
            targetPath,
            { overwrite: !!args.overwrite },
        );
        if (!copyResult || !copyResult.uuid) {
            return fail(`asset-db copy-asset returned no result for ${sourceUrl} -> ${targetPath}.`);
        }

        const openAfter = args.openAfter !== false;
        if (openAfter) {
            await Editor.Message.request('scene', 'open-scene', copyResult.uuid);
        }

        return ok({
                sourceUrl,
                newUuid: copyResult.uuid,
                newUrl: copyResult.url,
                opened: openAfter,
            }, `Scene saved as ${copyResult.url}`);
    }

    private async closeSceneImpl(): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'close-scene').then(() => {
                resolve(ok(undefined, 'Scene closed successfully'));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }
}
