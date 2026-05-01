import { ToolDefinition, ToolResponse, ToolExecutor, SceneInfo } from '../types';
import { z, toInputSchema, validateArgs } from '../lib/schema';
import { runSceneMethod } from '../lib/scene-bridge';
import { ComponentTools } from './component-tools';
import { debugLog } from '../lib/log';

const LAYER_UI_2D = 33554432;

const sceneSchemas = {
    get_current_scene: z.object({}),
    get_scene_list: z.object({}),
    open_scene: z.object({
        scenePath: z.string().describe('The scene file path'),
    }),
    save_scene: z.object({}),
    create_scene: z.object({
        sceneName: z.string().describe('Name of the new scene'),
        savePath: z.string().describe('Path to save the scene (e.g., db://assets/scenes/NewScene.scene)'),
        template: z.enum(['empty', '2d-ui', '3d-basic']).default('empty').describe(
            'Built-in scaffolding for the new scene. ' +
            '"empty" (default): bare scene root only — current behavior. ' +
            '"2d-ui": Camera (cc.Camera, ortho projection) + Canvas (cc.UITransform + cc.Canvas with cameraComponent linked, layer UI_2D) so UI nodes render immediately under the UI camera. ' +
            '"3d-basic": Camera (perspective) + DirectionalLight at scene root. ' +
            '⚠️ Side effect: when template is not "empty" the editor opens the newly created scene to populate it. Save your current scene first if it has unsaved changes.'
        ),
    }),
    save_scene_as: z.object({
        path: z.string().describe('Path to save the scene'),
    }),
    close_scene: z.object({}),
    get_scene_hierarchy: z.object({
        includeComponents: z.boolean().default(false).describe('Include component information'),
    }),
} as const;

const sceneToolMeta: Record<keyof typeof sceneSchemas, string> = {
    get_current_scene: 'Get current scene information',
    get_scene_list: 'Get all scenes in the project',
    open_scene: 'Open a scene by path',
    save_scene: 'Save current scene',
    create_scene: 'Create a new scene asset',
    save_scene_as: 'Save scene as new file',
    close_scene: 'Close current scene',
    get_scene_hierarchy: 'Get the complete hierarchy of current scene',
};

export class SceneTools implements ToolExecutor {
    getTools(): ToolDefinition[] {
        return (Object.keys(sceneSchemas) as Array<keyof typeof sceneSchemas>).map(name => ({
            name,
            description: sceneToolMeta[name],
            inputSchema: toInputSchema(sceneSchemas[name]),
        }));
    }

    async execute(toolName: string, args: any): Promise<ToolResponse> {
        const schemaName = toolName as keyof typeof sceneSchemas;
        const schema = sceneSchemas[schemaName];
        if (!schema) {
            throw new Error(`Unknown tool: ${toolName}`);
        }
        const validation = validateArgs(schema, args ?? {});
        if (!validation.ok) {
            return validation.response;
        }
        const a = validation.data as any;

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

    private async getCurrentScene(): Promise<ToolResponse> {
        return new Promise((resolve) => {
            // 直接使用 query-node-tree 來獲取場景信息（這個方法已經驗證可用）
            Editor.Message.request('scene', 'query-node-tree').then((tree: any) => {
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
                } else {
                    resolve({ success: false, error: 'No scene data available' });
                }
            }).catch((err: Error) => {
                // 備用方案：使用場景腳本
                runSceneMethod('getCurrentSceneInfo', []).then((result: any) => {
                    resolve(result);
                }).catch((err2: Error) => {
                    resolve({ success: false, error: `Direct API failed: ${err.message}, Scene script failed: ${err2.message}` });
                });
            });
        });
    }

    private async getSceneList(): Promise<ToolResponse> {
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
                resolve({ success: true, data: scenes });
            }).catch((err: Error) => {
                resolve({ success: false, error: err.message });
            });
        });
    }

    private async openScene(scenePath: string): Promise<ToolResponse> {
        return new Promise((resolve) => {
            // 首先獲取場景的UUID
            Editor.Message.request('asset-db', 'query-uuid', scenePath).then((uuid: string | null) => {
                if (!uuid) {
                    throw new Error('Scene not found');
                }
                
                // 使用正確的 scene API 打開場景 (需要UUID)
                return Editor.Message.request('scene', 'open-scene', uuid);
            }).then(() => {
                resolve({ success: true, message: `Scene opened: ${scenePath}` });
            }).catch((err: Error) => {
                resolve({ success: false, error: err.message });
            });
        });
    }

    private async saveScene(): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'save-scene').then(() => {
                resolve({ success: true, message: 'Scene saved successfully' });
            }).catch((err: Error) => {
                resolve({ success: false, error: err.message });
            });
        });
    }

    private componentTools = new ComponentTools();

    private async createScene(sceneName: string, savePath: string, template: 'empty' | '2d-ui' | '3d-basic' = 'empty'): Promise<ToolResponse> {
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
                        const sceneList = await this.getSceneList();
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

                    const tree: any = await Editor.Message.request('scene', 'query-node-tree');
                    const sceneRootUuid: string | undefined = tree?.uuid;
                    if (!sceneRootUuid) {
                        throw new Error('Could not resolve scene root UUID after open-scene');
                    }

                    const templateData =
                        template === '2d-ui' ? await this.buildTemplate2DUI(sceneRootUuid)
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
                } catch (templateErr: any) {
                    resolve({
                        success: false,
                        error: `Scene asset created at ${result.url} but template build failed: ${templateErr?.message ?? templateErr}`,
                        data: { uuid: result.uuid, url: result.url, template },
                    });
                }
            }).catch((err: Error) => {
                resolve({ success: false, error: err.message });
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

    private async getSceneHierarchy(includeComponents: boolean = false): Promise<ToolResponse> {
        return new Promise((resolve) => {
            // 優先嚐試使用 Editor API 查詢場景節點樹
            Editor.Message.request('scene', 'query-node-tree').then((tree: any) => {
                if (tree) {
                    const hierarchy = this.buildHierarchy(tree, includeComponents);
                    resolve({
                        success: true,
                        data: hierarchy
                    });
                } else {
                    resolve({ success: false, error: 'No scene hierarchy available' });
                }
            }).catch((err: Error) => {
                // 備用方案：使用場景腳本
                runSceneMethod('getSceneHierarchy', [includeComponents]).then((result: any) => {
                    resolve(result);
                }).catch((err2: Error) => {
                    resolve({ success: false, error: `Direct API failed: ${err.message}, Scene script failed: ${err2.message}` });
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

    private async saveSceneAs(path: string): Promise<ToolResponse> {
        return new Promise((resolve) => {
            // save-as-scene API 不接受路徑參數，會彈出對話框讓用戶選擇
            (Editor.Message.request as any)('scene', 'save-as-scene').then(() => {
                resolve({
                    success: true,
                    data: {
                        path: path,
                        message: `Scene save-as dialog opened`
                    }
                });
            }).catch((err: Error) => {
                resolve({ success: false, error: err.message });
            });
        });
    }

    private async closeScene(): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'close-scene').then(() => {
                resolve({
                    success: true,
                    message: 'Scene closed successfully'
                });
            }).catch((err: Error) => {
                resolve({ success: false, error: err.message });
            });
        });
    }
}