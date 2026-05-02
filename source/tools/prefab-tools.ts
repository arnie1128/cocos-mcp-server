import { ok, fail } from '../lib/response';
import { ToolDefinition, ToolResponse, ToolExecutor, PrefabInfo } from '../types';
import { debugLog } from '../lib/log';
import { z } from '../lib/schema';
import { defineTools, ToolDef } from '../lib/define-tools';
import { runSceneMethodAsToolResponse } from '../lib/scene-bridge';

const prefabPositionSchema = z.object({
    x: z.number().optional(),
    y: z.number().optional(),
    z: z.number().optional(),
});

export class PrefabTools implements ToolExecutor {
    private readonly exec: ToolExecutor;

    constructor() {
        const defs: ToolDef[] = [
            {
                name: 'get_prefab_list',
                title: 'List prefab assets',
                description: 'List .prefab assets under a folder with name/path/uuid. No scene or asset mutation. Also exposed as resource cocos://prefabs (default folder=db://assets) and cocos://prefabs{?folder} template; prefer the resource when the client supports MCP resources.',
                inputSchema: z.object({
                    folder: z.string().default('db://assets').describe('db:// folder to scan for prefabs. Default db://assets.'),
                }),
                handler: a => this.getPrefabList(a.folder),
            },
            {
                name: 'load_prefab',
                title: 'Read prefab metadata',
                description: 'Read prefab asset metadata only. Does not instantiate; use instantiate_prefab or create_node assetUuid/assetPath to add one to the scene.',
                inputSchema: z.object({
                    prefabPath: z.string().describe('Prefab db:// path. Reads metadata only; does not instantiate.'),
                }),
                handler: a => this.loadPrefab(a.prefabPath),
            },
            {
                name: 'instantiate_prefab',
                title: 'Instantiate prefab',
                description: 'Instantiate a prefab into the current scene; mutates scene and preserves prefab link.',
                inputSchema: z.object({
                    prefabPath: z.string().describe('Prefab db:// path to instantiate.'),
                    parentUuid: z.string().optional().describe('Parent node UUID. Omit to let Cocos choose the default parent.'),
                    position: prefabPositionSchema.optional().describe('Initial local position for the created prefab instance.'),
                }),
                handler: a => this.instantiatePrefab(a),
            },
            {
                name: 'create_prefab',
                title: 'Create prefab asset',
                description: 'Create a prefab asset from a scene node via cce.Prefab.createPrefab facade.',
                inputSchema: z.object({
                    nodeUuid: z.string().describe('Source node UUID to convert into a prefab, including children and components.'),
                    savePath: z.string().describe('Target prefab db:// path. Pass a full .prefab path or a folder.'),
                    prefabName: z.string().describe('Prefab name; used as filename when savePath is a folder.'),
                }),
                handler: a => this.createPrefab(a),
            },
            {
                name: 'update_prefab',
                title: 'Apply prefab edits',
                description: 'Apply prefab instance edits back to its linked prefab asset; prefabPath is context only.',
                inputSchema: z.object({
                    prefabPath: z.string().describe('Prefab asset path for response context; apply uses nodeUuid linked prefab data.'),
                    nodeUuid: z.string().describe('Modified prefab instance node UUID to apply back to its linked prefab.'),
                }),
                handler: a => this.updatePrefab(a.prefabPath, a.nodeUuid),
            },
            {
                name: 'revert_prefab',
                title: 'Revert prefab instance',
                description: 'Restore a prefab instance from its linked asset; discards unapplied overrides.',
                inputSchema: z.object({
                    nodeUuid: z.string().describe('Prefab instance node UUID to restore from its linked asset.'),
                }),
                handler: a => this.revertPrefab(a.nodeUuid),
            },
            {
                name: 'get_prefab_info',
                title: 'Read prefab info',
                description: 'Read prefab meta/dependency summary before apply/revert.',
                inputSchema: z.object({
                    prefabPath: z.string().describe('Prefab asset db:// path.'),
                }),
                handler: a => this.getPrefabInfo(a.prefabPath),
            },
            {
                name: 'validate_prefab',
                title: 'Validate prefab asset',
                description: 'Run basic prefab JSON structural checks; not byte-level Cocos equivalence.',
                inputSchema: z.object({
                    prefabPath: z.string().describe('Prefab db:// path whose JSON structure should be checked.'),
                }),
                handler: a => this.validatePrefab(a.prefabPath),
            },
            {
                name: 'restore_prefab_node',
                title: 'Restore prefab node',
                description: 'Restore a prefab instance through scene/restore-prefab; assetUuid is context only.',
                inputSchema: z.object({
                    nodeUuid: z.string().describe('Prefab instance node UUID passed to scene/restore-prefab.'),
                    assetUuid: z.string().describe('Prefab asset UUID kept for response context; Cocos restore-prefab uses nodeUuid only.'),
                }),
                handler: a => this.restorePrefabNode(a.nodeUuid, a.assetUuid),
            },
            {
                name: 'set_link',
                title: 'Set prefab link',
                description: 'Attach or detach a prefab link on a node. mode="link" wraps cce.SceneFacade.linkPrefab; mode="unlink" wraps cce.SceneFacade.unlinkPrefab.',
                inputSchema: z.object({
                    mode: z.enum(['link', 'unlink']).describe('Operation: "link" attaches a regular node to a prefab asset; "unlink" detaches a prefab instance.'),
                    nodeUuid: z.string().describe('Node UUID. For mode="link", the node to attach; for mode="unlink", the prefab instance to detach.'),
                    assetUuid: z.string().optional().describe('Prefab asset UUID. Required when mode="link"; ignored when mode="unlink".'),
                    removeNested: z.boolean().default(false).describe('When mode="unlink", also unlink nested prefab instances under this node. Ignored when mode="link".'),
                }),
                handler: a => this.setLink(a),
            },
            {
                name: 'get_prefab_data',
                title: 'Read prefab data',
                description: 'Read facade prefab dump for a prefab instance node. No mutation; useful for inspecting instance/link serialized data.',
                inputSchema: z.object({
                    nodeUuid: z.string().describe('Prefab instance node UUID whose prefab dump should be read.'),
                }),
                handler: a => this.getPrefabData(a.nodeUuid),
            },
        ];
        this.exec = defineTools(defs);
    }

    getTools(): ToolDefinition[] { return this.exec.getTools(); }
    execute(toolName: string, args: any): Promise<ToolResponse> { return this.exec.execute(toolName, args); }

    private async getPrefabList(folder: string = 'db://assets'): Promise<ToolResponse> {
        return new Promise((resolve) => {
            const pattern = folder.endsWith('/') ? 
                `${folder}**/*.prefab` : `${folder}/**/*.prefab`;
            
            Editor.Message.request('asset-db', 'query-assets', {
                pattern: pattern
            }).then((results: any[]) => {
                const prefabs: PrefabInfo[] = results.map(asset => ({
                    name: asset.name,
                    path: asset.url,
                    uuid: asset.uuid,
                    folder: asset.url.substring(0, asset.url.lastIndexOf('/'))
                }));
                resolve(ok(prefabs));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async loadPrefab(prefabPath: string): Promise<ToolResponse> {
        // Original implementation called scene `load-asset`, which is not a real
        // channel on the scene module per @cocos/creator-types. There is no
        // generic "load a prefab without instantiating" operation exposed to
        // editor extensions. Return the asset metadata via asset-db instead;
        // callers who actually want the prefab in the scene should use
        // instantiate_prefab.
        return new Promise((resolve) => {
            Editor.Message.request('asset-db', 'query-asset-info', prefabPath).then((assetInfo: any) => {
                if (!assetInfo) {
                    resolve(fail(`Prefab not found: ${prefabPath}`));
                    return;
                }
                resolve(ok({
                        uuid: assetInfo.uuid,
                        name: assetInfo.name,
                        url: assetInfo.url,
                        type: assetInfo.type,
                        source: assetInfo.source,
                        message: 'Prefab metadata retrieved (instantiate_prefab to add it to the scene)',
                    }));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async instantiatePrefab(args: any): Promise<ToolResponse> {
        return new Promise(async (resolve) => {
            try {
                // 獲取預製體資源信息
                const assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', args.prefabPath);
                if (!assetInfo) {
                    throw new Error('預製體未找到');
                }

                // 使用正確的 create-node API 從預製體資源實例化
                const createNodeOptions: any = {
                    assetUuid: assetInfo.uuid
                };

                // 設置父節點
                if (args.parentUuid) {
                    createNodeOptions.parent = args.parentUuid;
                }

                // 設置節點名稱
                if (args.name) {
                    createNodeOptions.name = args.name;
                } else if (assetInfo.name) {
                    createNodeOptions.name = assetInfo.name;
                }

                // 設置初始屬性（如位置）
                if (args.position) {
                    createNodeOptions.dump = {
                        position: {
                            value: args.position
                        }
                    };
                }

                // 創建節點
                const nodeUuid = await Editor.Message.request('scene', 'create-node', createNodeOptions);
                const uuid = Array.isArray(nodeUuid) ? nodeUuid[0] : nodeUuid;

                // 注意：create-node API從預製體資源創建時應該自動建立預製體關聯
                debugLog('預製體節點創建成功:', {
                    nodeUuid: uuid,
                    prefabUuid: assetInfo.uuid,
                    prefabPath: args.prefabPath
                });
                
                resolve(ok({
                        nodeUuid: uuid,
                        prefabPath: args.prefabPath,
                        parentUuid: args.parentUuid,
                        position: args.position,
                        message: '預製體實例化成功，已建立預製體關聯'
                    }));
            } catch (err: any) {
                resolve({ 
                    success: false, 
                    error: `預製體實例化失敗: ${err.message}`,
                    instruction: '請檢查預製體路徑是否正確，確保預製體文件格式正確'
                });
            }
        });
    }

    private async createPrefab(args: any): Promise<ToolResponse> {
        return new Promise(async (resolve) => {
            try {
                // 支持 prefabPath 和 savePath 兩種參數名
                const pathParam = args.prefabPath || args.savePath;
                if (!pathParam) {
                    resolve(fail('缺少預製體路徑參數。請提供 prefabPath 或 savePath。'));
                    return;
                }

                const prefabName = args.prefabName || 'NewPrefab';
                const fullPath = pathParam.endsWith('.prefab') ?
                    pathParam : `${pathParam}/${prefabName}.prefab`;

                // The official scene-facade path (cce.Prefab.createPrefab via
                // execute-scene-script). The legacy hand-rolled JSON fallback
                // (createPrefabWithAssetDB / createPrefabNative / createPrefabCustom,
                // ~250 source lines) was removed in v2.1.3 — see commit 547115b
                // for the pre-removal source if a future Cocos Creator build
                // breaks the facade path. The facade has been the only path
                // exercised in v2.1.1 / v2.1.2 real-editor testing across
                // simple and complex (nested + multi-component) prefab forms.
                debugLog('Calling scene-script cce.Prefab.createPrefab...');
                const facadeResult = await runSceneMethodAsToolResponse('createPrefabFromNode', [args.nodeUuid, fullPath]);
                if (!facadeResult.success) {
                    resolve(facadeResult);
                    return;
                }
                try {
                    await Editor.Message.request('asset-db', 'refresh-asset', fullPath);
                } catch (refreshErr: any) {
                    debugLog(`refresh-asset after facade createPrefab failed (non-fatal): ${refreshErr?.message ?? refreshErr}`);
                }
                resolve({
                    ...facadeResult,
                    data: {
                        ...(facadeResult.data ?? {}),
                        prefabName,
                        prefabPath: fullPath,
                        method: 'scene-facade',
                    },
                });
            } catch (error) {
                resolve(fail(`創建預製體時發生錯誤: ${error}`));
            }
        });
    }

    private async updatePrefab(prefabPath: string, nodeUuid: string): Promise<ToolResponse> {
        // Apply path. There is no host-process Editor.Message channel for
        // this; the operation lives on the scene facade and is reachable
        // via execute-scene-script (see source/scene.ts:applyPrefab).
        const facadeResult = await runSceneMethodAsToolResponse('applyPrefab', [nodeUuid]);
        if (facadeResult.success) {
            return {
                ...facadeResult,
                data: { ...(facadeResult.data ?? {}), prefabPath, nodeUuid },
            };
        }
        return fail(facadeResult.error ?? 'applyPrefab failed via scene facade', { prefabPath, nodeUuid });
    }

    private async setLink(a: { mode: 'link' | 'unlink'; nodeUuid: string; assetUuid?: string; removeNested: boolean }): Promise<ToolResponse> {
        if (a.mode === 'link') {
            if (!a.assetUuid) {
                return fail('set_link with mode="link" requires assetUuid');
            }
            return runSceneMethodAsToolResponse('linkPrefab', [a.nodeUuid, a.assetUuid]);
        }
        return runSceneMethodAsToolResponse('unlinkPrefab', [a.nodeUuid, a.removeNested]);
    }

    private async getPrefabData(nodeUuid: string): Promise<ToolResponse> {
        return runSceneMethodAsToolResponse('getPrefabData', [nodeUuid]);
    }

    private async revertPrefab(nodeUuid: string): Promise<ToolResponse> {
        // The previous code called scene `revert-prefab`, which does not exist.
        // The verified channel is `restore-prefab` taking `{ uuid: string }`
        // (ResetComponentOptions). Per the editor convention this restores the
        // node from its linked prefab asset, which matches the "revert" intent.
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'restore-prefab', { uuid: nodeUuid }).then(() => {
                resolve(ok(undefined, 'Prefab instance reverted successfully'));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async getPrefabInfo(prefabPath: string): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('asset-db', 'query-asset-info', prefabPath).then((assetInfo: any) => {
                if (!assetInfo) {
                    throw new Error('Prefab not found');
                }

                return Editor.Message.request('asset-db', 'query-asset-meta', assetInfo.uuid);
            }).then((metaInfo: any) => {
                const info: PrefabInfo = {
                    name: metaInfo.name,
                    uuid: metaInfo.uuid,
                    path: prefabPath,
                    folder: prefabPath.substring(0, prefabPath.lastIndexOf('/')),
                    createTime: metaInfo.createTime,
                    modifyTime: metaInfo.modifyTime,
                    dependencies: metaInfo.depends || []
                };
                resolve(ok(info));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async validatePrefab(prefabPath: string): Promise<ToolResponse> {
        return new Promise((resolve) => {
            try {
                // 讀取預製體文件內容
                Editor.Message.request('asset-db', 'query-asset-info', prefabPath).then((assetInfo: any) => {
                    if (!assetInfo) {
                        resolve(fail('預製體文件不存在'));
                        return;
                    }

                    // 驗證預製體格式
                    Editor.Message.request('asset-db', 'read-asset', prefabPath).then((content: string) => {
                        try {
                            const prefabData = JSON.parse(content);
                            const validationResult = this.validatePrefabFormat(prefabData);
                            
                            resolve(ok({
                                    isValid: validationResult.isValid,
                                    issues: validationResult.issues,
                                    nodeCount: validationResult.nodeCount,
                                    componentCount: validationResult.componentCount,
                                    message: validationResult.isValid ? '預製體格式有效' : '預製體格式存在問題'
                                }));
                        } catch (parseError) {
                            resolve(fail('預製體文件格式錯誤，無法解析JSON'));
                        }
                    }).catch((error: any) => {
                        resolve(fail(`讀取預製體文件失敗: ${error.message}`));
                    });
                }).catch((error: any) => {
                    resolve(fail(`查詢預製體信息失敗: ${error.message}`));
                });
            } catch (error) {
                resolve(fail(`驗證預製體時發生錯誤: ${error}`));
            }
        });
    }

    private validatePrefabFormat(prefabData: any): { isValid: boolean; issues: string[]; nodeCount: number; componentCount: number } {
        const issues: string[] = [];
        let nodeCount = 0;
        let componentCount = 0;

        // 檢查基本結構
        if (!Array.isArray(prefabData)) {
            issues.push('預製體數據必須是數組格式');
            return { isValid: false, issues, nodeCount, componentCount };
        }

        if (prefabData.length === 0) {
            issues.push('預製體數據為空');
            return { isValid: false, issues, nodeCount, componentCount };
        }

        // 檢查第一個元素是否為預製體資產
        const firstElement = prefabData[0];
        if (!firstElement || firstElement.__type__ !== 'cc.Prefab') {
            issues.push('第一個元素必須是cc.Prefab類型');
        }

        // 統計節點和組件
        prefabData.forEach((item: any, index: number) => {
            if (item.__type__ === 'cc.Node') {
                nodeCount++;
            } else if (item.__type__ && item.__type__.includes('cc.')) {
                componentCount++;
            }
        });

        // 檢查必要的字段
        if (nodeCount === 0) {
            issues.push('預製體必須包含至少一個節點');
        }

        return {
            isValid: issues.length === 0,
            issues,
            nodeCount,
            componentCount
        };
    }

    private async restorePrefabNode(nodeUuid: string, assetUuid: string): Promise<ToolResponse> {
        return new Promise((resolve) => {
            // Verified signature per @cocos/creator-types: scene/restore-prefab
            // takes a single ResetComponentOptions = { uuid: string }. The
            // previous code passed (nodeUuid, assetUuid) as positional args,
            // which the API ignores after the first one and silently misroutes.
            // assetUuid is preserved on the request shape for response context
            // but does not flow into the editor message.
            Editor.Message.request('scene', 'restore-prefab', { uuid: nodeUuid }).then(() => {
                resolve(ok({
                        nodeUuid: nodeUuid,
                        assetUuid: assetUuid,
                        message: '預製體節點還原成功'
                    }));
            }).catch((error: any) => {
                resolve(fail(`預製體節點還原失敗: ${error.message}`));
            });
        });
    }

}
