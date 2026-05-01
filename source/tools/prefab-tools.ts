import { ToolDefinition, ToolResponse, ToolExecutor, PrefabInfo } from '../types';
import { debugLog } from '../lib/log';
import { z, toInputSchema, validateArgs } from '../lib/schema';
import { runSceneMethodAsToolResponse } from '../lib/scene-bridge';

const prefabPositionSchema = z.object({
    x: z.number().optional(),
    y: z.number().optional(),
    z: z.number().optional(),
});

const prefabSchemas = {
    get_prefab_list: z.object({
        folder: z.string().default('db://assets').describe('Folder path to search (optional)'),
    }),
    load_prefab: z.object({
        prefabPath: z.string().describe('Prefab asset path'),
    }),
    instantiate_prefab: z.object({
        prefabPath: z.string().describe('Prefab asset path'),
        parentUuid: z.string().optional().describe('Parent node UUID (optional)'),
        position: prefabPositionSchema.optional().describe('Initial position'),
    }),
    create_prefab: z.object({
        nodeUuid: z.string().describe('Source node UUID'),
        savePath: z.string().describe('Path to save the prefab (e.g., db://assets/prefabs/MyPrefab.prefab)'),
        prefabName: z.string().describe('Prefab name'),
    }),
    update_prefab: z.object({
        prefabPath: z.string().describe('Prefab asset path'),
        nodeUuid: z.string().describe('Node UUID with changes'),
    }),
    revert_prefab: z.object({
        nodeUuid: z.string().describe('Prefab instance node UUID'),
    }),
    get_prefab_info: z.object({
        prefabPath: z.string().describe('Prefab asset path'),
    }),
    validate_prefab: z.object({
        prefabPath: z.string().describe('Prefab asset path'),
    }),
    duplicate_prefab: z.object({
        sourcePrefabPath: z.string().describe('Source prefab path'),
        targetPrefabPath: z.string().describe('Target prefab path'),
        newPrefabName: z.string().optional().describe('New prefab name'),
    }),
    restore_prefab_node: z.object({
        nodeUuid: z.string().describe('Prefab instance node UUID'),
        assetUuid: z.string().describe('Prefab asset UUID'),
    }),
    link_prefab: z.object({
        nodeUuid: z.string().describe('Node UUID to connect to a prefab asset'),
        assetUuid: z.string().describe('Prefab asset UUID to link the node to'),
    }),
    unlink_prefab: z.object({
        nodeUuid: z.string().describe('Prefab instance node UUID to detach'),
        removeNested: z.boolean().default(false).describe('Whether to also unlink nested prefab instances under this node'),
    }),
    get_prefab_data: z.object({
        nodeUuid: z.string().describe('Prefab instance node UUID'),
    }),
} as const;

const prefabToolMeta: Record<keyof typeof prefabSchemas, string> = {
    get_prefab_list: 'Get all prefabs in the project',
    load_prefab: 'Load a prefab by path',
    instantiate_prefab: 'Instantiate a prefab in the scene',
    create_prefab: 'Create a prefab from a node with all children and components',
    update_prefab: 'Apply prefab instance edits back to the prefab asset (cce.SceneFacade.applyPrefab)',
    revert_prefab: 'Revert prefab instance to original',
    get_prefab_info: 'Get detailed prefab information',
    validate_prefab: 'Validate a prefab file format',
    duplicate_prefab: 'Duplicate an existing prefab',
    restore_prefab_node: 'Restore prefab node using prefab asset (built-in undo record)',
    link_prefab: 'Connect a regular node to a prefab asset (cce.SceneFacade.linkPrefab)',
    unlink_prefab: 'Break a prefab instance link, optionally clearing nested instances (cce.SceneFacade.unlinkPrefab)',
    get_prefab_data: 'Read the prefab dump for a prefab instance node (cce.SceneFacade.getPrefabData)',
};

export class PrefabTools implements ToolExecutor {
    getTools(): ToolDefinition[] {
        return (Object.keys(prefabSchemas) as Array<keyof typeof prefabSchemas>).map(name => ({
            name,
            description: prefabToolMeta[name],
            inputSchema: toInputSchema(prefabSchemas[name]),
        }));
    }

    async execute(toolName: string, args: any): Promise<ToolResponse> {
        const schemaName = toolName as keyof typeof prefabSchemas;
        const schema = prefabSchemas[schemaName];
        if (!schema) {
            throw new Error(`Unknown tool: ${toolName}`);
        }
        const validation = validateArgs(schema, args ?? {});
        if (!validation.ok) {
            return validation.response;
        }
        const a = validation.data as any;

        switch (schemaName) {
            case 'get_prefab_list':
                return await this.getPrefabList(a.folder);
            case 'load_prefab':
                return await this.loadPrefab(a.prefabPath);
            case 'instantiate_prefab':
                return await this.instantiatePrefab(a);
            case 'create_prefab':
                return await this.createPrefab(a);
            case 'update_prefab':
                return await this.updatePrefab(a.prefabPath, a.nodeUuid);
            case 'revert_prefab':
                return await this.revertPrefab(a.nodeUuid);
            case 'get_prefab_info':
                return await this.getPrefabInfo(a.prefabPath);
            case 'validate_prefab':
                return await this.validatePrefab(a.prefabPath);
            case 'duplicate_prefab':
                return await this.duplicatePrefab(a);
            case 'restore_prefab_node':
                return await this.restorePrefabNode(a.nodeUuid, a.assetUuid);
            case 'link_prefab':
                return await this.linkPrefab(a.nodeUuid, a.assetUuid);
            case 'unlink_prefab':
                return await this.unlinkPrefab(a.nodeUuid, a.removeNested);
            case 'get_prefab_data':
                return await this.getPrefabData(a.nodeUuid);
        }
    }

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
                resolve({ success: true, data: prefabs });
            }).catch((err: Error) => {
                resolve({ success: false, error: err.message });
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
                    resolve({ success: false, error: `Prefab not found: ${prefabPath}` });
                    return;
                }
                resolve({
                    success: true,
                    data: {
                        uuid: assetInfo.uuid,
                        name: assetInfo.name,
                        url: assetInfo.url,
                        type: assetInfo.type,
                        source: assetInfo.source,
                        message: 'Prefab metadata retrieved (instantiate_prefab to add it to the scene)',
                    },
                });
            }).catch((err: Error) => {
                resolve({ success: false, error: err.message });
            });
        });
    }

    private async instantiatePrefab(args: any): Promise<ToolResponse> {
        return new Promise(async (resolve) => {
            try {
                // 获取预制体资源信息
                const assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', args.prefabPath);
                if (!assetInfo) {
                    throw new Error('预制体未找到');
                }

                // 使用正确的 create-node API 从预制体资源实例化
                const createNodeOptions: any = {
                    assetUuid: assetInfo.uuid
                };

                // 设置父节点
                if (args.parentUuid) {
                    createNodeOptions.parent = args.parentUuid;
                }

                // 设置节点名称
                if (args.name) {
                    createNodeOptions.name = args.name;
                } else if (assetInfo.name) {
                    createNodeOptions.name = assetInfo.name;
                }

                // 设置初始属性（如位置）
                if (args.position) {
                    createNodeOptions.dump = {
                        position: {
                            value: args.position
                        }
                    };
                }

                // 创建节点
                const nodeUuid = await Editor.Message.request('scene', 'create-node', createNodeOptions);
                const uuid = Array.isArray(nodeUuid) ? nodeUuid[0] : nodeUuid;

                // 注意：create-node API从预制体资源创建时应该自动建立预制体关联
                debugLog('预制体节点创建成功:', {
                    nodeUuid: uuid,
                    prefabUuid: assetInfo.uuid,
                    prefabPath: args.prefabPath
                });
                
                resolve({
                    success: true,
                    data: {
                        nodeUuid: uuid,
                        prefabPath: args.prefabPath,
                        parentUuid: args.parentUuid,
                        position: args.position,
                        message: '预制体实例化成功，已建立预制体关联'
                    }
                });
            } catch (err: any) {
                resolve({ 
                    success: false, 
                    error: `预制体实例化失败: ${err.message}`,
                    instruction: '请检查预制体路径是否正确，确保预制体文件格式正确'
                });
            }
        });
    }

    private async createPrefab(args: any): Promise<ToolResponse> {
        return new Promise(async (resolve) => {
            try {
                // 支持 prefabPath 和 savePath 两种参数名
                const pathParam = args.prefabPath || args.savePath;
                if (!pathParam) {
                    resolve({
                        success: false,
                        error: '缺少预制体路径参数。请提供 prefabPath 或 savePath。'
                    });
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
                resolve({
                    success: false,
                    error: `创建预制体时发生错误: ${error}`
                });
            }
        });
    }

    private generateUUID(): string {
        // 生成符合Cocos Creator格式的UUID
        const chars = '0123456789abcdef';
        let uuid = '';
        for (let i = 0; i < 32; i++) {
            if (i === 8 || i === 12 || i === 16 || i === 20) {
                uuid += '-';
            }
            uuid += chars[Math.floor(Math.random() * chars.length)];
        }
        return uuid;
    }

    private createMetaData(prefabName: string, prefabUuid: string): any {
        return {
            "ver": "1.1.50",
            "importer": "prefab",
            "imported": true,
            "uuid": prefabUuid,
            "files": [
                ".json"
            ],
            "subMetas": {},
            "userData": {
                "syncNodeName": prefabName
            }
        };
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
        return {
            success: false,
            error: facadeResult.error ?? 'applyPrefab failed via scene facade',
            data: { prefabPath, nodeUuid },
        };
    }

    private async linkPrefab(nodeUuid: string, assetUuid: string): Promise<ToolResponse> {
        return runSceneMethodAsToolResponse('linkPrefab', [nodeUuid, assetUuid]);
    }

    private async unlinkPrefab(nodeUuid: string, removeNested: boolean): Promise<ToolResponse> {
        return runSceneMethodAsToolResponse('unlinkPrefab', [nodeUuid, removeNested]);
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
                resolve({
                    success: true,
                    message: 'Prefab instance reverted successfully',
                });
            }).catch((err: Error) => {
                resolve({ success: false, error: err.message });
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
                resolve({ success: true, data: info });
            }).catch((err: Error) => {
                resolve({ success: false, error: err.message });
            });
        });
    }

    private async validatePrefab(prefabPath: string): Promise<ToolResponse> {
        return new Promise((resolve) => {
            try {
                // 读取预制体文件内容
                Editor.Message.request('asset-db', 'query-asset-info', prefabPath).then((assetInfo: any) => {
                    if (!assetInfo) {
                        resolve({
                            success: false,
                            error: '预制体文件不存在'
                        });
                        return;
                    }

                    // 验证预制体格式
                    Editor.Message.request('asset-db', 'read-asset', prefabPath).then((content: string) => {
                        try {
                            const prefabData = JSON.parse(content);
                            const validationResult = this.validatePrefabFormat(prefabData);
                            
                            resolve({
                                success: true,
                                data: {
                                    isValid: validationResult.isValid,
                                    issues: validationResult.issues,
                                    nodeCount: validationResult.nodeCount,
                                    componentCount: validationResult.componentCount,
                                    message: validationResult.isValid ? '预制体格式有效' : '预制体格式存在问题'
                                }
                            });
                        } catch (parseError) {
                            resolve({
                                success: false,
                                error: '预制体文件格式错误，无法解析JSON'
                            });
                        }
                    }).catch((error: any) => {
                        resolve({
                            success: false,
                            error: `读取预制体文件失败: ${error.message}`
                        });
                    });
                }).catch((error: any) => {
                    resolve({
                        success: false,
                        error: `查询预制体信息失败: ${error.message}`
                    });
                });
            } catch (error) {
                resolve({
                    success: false,
                    error: `验证预制体时发生错误: ${error}`
                });
            }
        });
    }

    private validatePrefabFormat(prefabData: any): { isValid: boolean; issues: string[]; nodeCount: number; componentCount: number } {
        const issues: string[] = [];
        let nodeCount = 0;
        let componentCount = 0;

        // 检查基本结构
        if (!Array.isArray(prefabData)) {
            issues.push('预制体数据必须是数组格式');
            return { isValid: false, issues, nodeCount, componentCount };
        }

        if (prefabData.length === 0) {
            issues.push('预制体数据为空');
            return { isValid: false, issues, nodeCount, componentCount };
        }

        // 检查第一个元素是否为预制体资产
        const firstElement = prefabData[0];
        if (!firstElement || firstElement.__type__ !== 'cc.Prefab') {
            issues.push('第一个元素必须是cc.Prefab类型');
        }

        // 统计节点和组件
        prefabData.forEach((item: any, index: number) => {
            if (item.__type__ === 'cc.Node') {
                nodeCount++;
            } else if (item.__type__ && item.__type__.includes('cc.')) {
                componentCount++;
            }
        });

        // 检查必要的字段
        if (nodeCount === 0) {
            issues.push('预制体必须包含至少一个节点');
        }

        return {
            isValid: issues.length === 0,
            issues,
            nodeCount,
            componentCount
        };
    }

    private async duplicatePrefab(args: any): Promise<ToolResponse> {
        return new Promise(async (resolve) => {
            try {
                const { sourcePrefabPath, targetPrefabPath, newPrefabName } = args;
                
                // 读取源预制体
                const sourceInfo = await this.getPrefabInfo(sourcePrefabPath);
                if (!sourceInfo.success) {
                    resolve({
                        success: false,
                        error: `无法读取源预制体: ${sourceInfo.error}`
                    });
                    return;
                }

                // 读取源预制体内容
                const sourceContent = await this.readPrefabContent(sourcePrefabPath);
                if (!sourceContent.success) {
                    resolve({
                        success: false,
                        error: `无法读取源预制体内容: ${sourceContent.error}`
                    });
                    return;
                }

                // 生成新的UUID
                const newUuid = this.generateUUID();
                
                // 修改预制体数据
                const modifiedData = this.modifyPrefabForDuplication(sourceContent.data, newPrefabName, newUuid);
                
                // 创建新的meta数据
                const newMetaData = this.createMetaData(newPrefabName || 'DuplicatedPrefab', newUuid);
                
                // 预制体复制功能暂时禁用，因为涉及复杂的序列化格式
                resolve({
                    success: false,
                    error: '预制体复制功能暂时不可用',
                    instruction: '请在 Cocos Creator 编辑器中手动复制预制体：\n1. 在资源管理器中选择要复制的预制体\n2. 右键选择复制\n3. 在目标位置粘贴'
                });

            } catch (error) {
                resolve({
                    success: false,
                    error: `复制预制体时发生错误: ${error}`
                });
            }
        });
    }

    private async readPrefabContent(prefabPath: string): Promise<{ success: boolean; data?: any; error?: string }> {
        return new Promise((resolve) => {
            Editor.Message.request('asset-db', 'read-asset', prefabPath).then((content: string) => {
                try {
                    const prefabData = JSON.parse(content);
                    resolve({ success: true, data: prefabData });
                } catch (parseError) {
                    resolve({ success: false, error: '预制体文件格式错误' });
                }
            }).catch((error: any) => {
                resolve({ success: false, error: error.message || '读取预制体文件失败' });
            });
        });
    }

    private modifyPrefabForDuplication(prefabData: any[], newName: string, newUuid: string): any[] {
        // 修改预制体数据以创建副本
        const modifiedData = [...prefabData];
        
        // 修改第一个元素（预制体资产）
        if (modifiedData[0] && modifiedData[0].__type__ === 'cc.Prefab') {
            modifiedData[0]._name = newName || 'DuplicatedPrefab';
        }

        // 更新所有UUID引用（简化版本）
        // 在实际应用中，可能需要更复杂的UUID映射处理
        
        return modifiedData;
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
                resolve({
                    success: true,
                    data: {
                        nodeUuid: nodeUuid,
                        assetUuid: assetUuid,
                        message: '预制体节点还原成功'
                    }
                });
            }).catch((error: any) => {
                resolve({
                    success: false,
                    error: `预制体节点还原失败: ${error.message}`
                });
            });
        });
    }

}