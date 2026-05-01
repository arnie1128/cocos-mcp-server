"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrefabTools = void 0;
const log_1 = require("../lib/log");
const schema_1 = require("../lib/schema");
const scene_bridge_1 = require("../lib/scene-bridge");
const prefabPositionSchema = schema_1.z.object({
    x: schema_1.z.number().optional(),
    y: schema_1.z.number().optional(),
    z: schema_1.z.number().optional(),
});
const prefabSchemas = {
    get_prefab_list: schema_1.z.object({
        folder: schema_1.z.string().default('db://assets').describe('Folder path to search (optional)'),
    }),
    load_prefab: schema_1.z.object({
        prefabPath: schema_1.z.string().describe('Prefab asset path'),
    }),
    instantiate_prefab: schema_1.z.object({
        prefabPath: schema_1.z.string().describe('Prefab asset path'),
        parentUuid: schema_1.z.string().optional().describe('Parent node UUID (optional)'),
        position: prefabPositionSchema.optional().describe('Initial position'),
    }),
    create_prefab: schema_1.z.object({
        nodeUuid: schema_1.z.string().describe('Source node UUID'),
        savePath: schema_1.z.string().describe('Path to save the prefab (e.g., db://assets/prefabs/MyPrefab.prefab)'),
        prefabName: schema_1.z.string().describe('Prefab name'),
    }),
    update_prefab: schema_1.z.object({
        prefabPath: schema_1.z.string().describe('Prefab asset path'),
        nodeUuid: schema_1.z.string().describe('Node UUID with changes'),
    }),
    revert_prefab: schema_1.z.object({
        nodeUuid: schema_1.z.string().describe('Prefab instance node UUID'),
    }),
    get_prefab_info: schema_1.z.object({
        prefabPath: schema_1.z.string().describe('Prefab asset path'),
    }),
    validate_prefab: schema_1.z.object({
        prefabPath: schema_1.z.string().describe('Prefab asset path'),
    }),
    duplicate_prefab: schema_1.z.object({
        sourcePrefabPath: schema_1.z.string().describe('Source prefab path'),
        targetPrefabPath: schema_1.z.string().describe('Target prefab path'),
        newPrefabName: schema_1.z.string().optional().describe('New prefab name'),
    }),
    restore_prefab_node: schema_1.z.object({
        nodeUuid: schema_1.z.string().describe('Prefab instance node UUID'),
        assetUuid: schema_1.z.string().describe('Prefab asset UUID'),
    }),
    link_prefab: schema_1.z.object({
        nodeUuid: schema_1.z.string().describe('Node UUID to connect to a prefab asset'),
        assetUuid: schema_1.z.string().describe('Prefab asset UUID to link the node to'),
    }),
    unlink_prefab: schema_1.z.object({
        nodeUuid: schema_1.z.string().describe('Prefab instance node UUID to detach'),
        removeNested: schema_1.z.boolean().default(false).describe('Whether to also unlink nested prefab instances under this node'),
    }),
    get_prefab_data: schema_1.z.object({
        nodeUuid: schema_1.z.string().describe('Prefab instance node UUID'),
    }),
};
const prefabToolMeta = {
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
class PrefabTools {
    getTools() {
        return Object.keys(prefabSchemas).map(name => ({
            name,
            description: prefabToolMeta[name],
            inputSchema: (0, schema_1.toInputSchema)(prefabSchemas[name]),
        }));
    }
    async execute(toolName, args) {
        const schemaName = toolName;
        const schema = prefabSchemas[schemaName];
        if (!schema) {
            throw new Error(`Unknown tool: ${toolName}`);
        }
        const validation = (0, schema_1.validateArgs)(schema, args !== null && args !== void 0 ? args : {});
        if (!validation.ok) {
            return validation.response;
        }
        const a = validation.data;
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
    async getPrefabList(folder = 'db://assets') {
        return new Promise((resolve) => {
            const pattern = folder.endsWith('/') ?
                `${folder}**/*.prefab` : `${folder}/**/*.prefab`;
            Editor.Message.request('asset-db', 'query-assets', {
                pattern: pattern
            }).then((results) => {
                const prefabs = results.map(asset => ({
                    name: asset.name,
                    path: asset.url,
                    uuid: asset.uuid,
                    folder: asset.url.substring(0, asset.url.lastIndexOf('/'))
                }));
                resolve({ success: true, data: prefabs });
            }).catch((err) => {
                resolve({ success: false, error: err.message });
            });
        });
    }
    async loadPrefab(prefabPath) {
        // Original implementation called scene `load-asset`, which is not a real
        // channel on the scene module per @cocos/creator-types. There is no
        // generic "load a prefab without instantiating" operation exposed to
        // editor extensions. Return the asset metadata via asset-db instead;
        // callers who actually want the prefab in the scene should use
        // instantiate_prefab.
        return new Promise((resolve) => {
            Editor.Message.request('asset-db', 'query-asset-info', prefabPath).then((assetInfo) => {
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
            }).catch((err) => {
                resolve({ success: false, error: err.message });
            });
        });
    }
    async instantiatePrefab(args) {
        return new Promise(async (resolve) => {
            try {
                // 获取预制体资源信息
                const assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', args.prefabPath);
                if (!assetInfo) {
                    throw new Error('预制体未找到');
                }
                // 使用正确的 create-node API 从预制体资源实例化
                const createNodeOptions = {
                    assetUuid: assetInfo.uuid
                };
                // 设置父节点
                if (args.parentUuid) {
                    createNodeOptions.parent = args.parentUuid;
                }
                // 设置节点名称
                if (args.name) {
                    createNodeOptions.name = args.name;
                }
                else if (assetInfo.name) {
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
                (0, log_1.debugLog)('预制体节点创建成功:', {
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
            }
            catch (err) {
                resolve({
                    success: false,
                    error: `预制体实例化失败: ${err.message}`,
                    instruction: '请检查预制体路径是否正确，确保预制体文件格式正确'
                });
            }
        });
    }
    async createPrefab(args) {
        return new Promise(async (resolve) => {
            var _a, _b;
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
                (0, log_1.debugLog)('Calling scene-script cce.Prefab.createPrefab...');
                const facadeResult = await (0, scene_bridge_1.runSceneMethodAsToolResponse)('createPrefabFromNode', [args.nodeUuid, fullPath]);
                if (!facadeResult.success) {
                    resolve(facadeResult);
                    return;
                }
                try {
                    await Editor.Message.request('asset-db', 'refresh-asset', fullPath);
                }
                catch (refreshErr) {
                    (0, log_1.debugLog)(`refresh-asset after facade createPrefab failed (non-fatal): ${(_a = refreshErr === null || refreshErr === void 0 ? void 0 : refreshErr.message) !== null && _a !== void 0 ? _a : refreshErr}`);
                }
                resolve(Object.assign(Object.assign({}, facadeResult), { data: Object.assign(Object.assign({}, ((_b = facadeResult.data) !== null && _b !== void 0 ? _b : {})), { prefabName, prefabPath: fullPath, method: 'scene-facade' }) }));
            }
            catch (error) {
                resolve({
                    success: false,
                    error: `创建预制体时发生错误: ${error}`
                });
            }
        });
    }
    generateUUID() {
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
    createMetaData(prefabName, prefabUuid) {
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
    async updatePrefab(prefabPath, nodeUuid) {
        var _a, _b;
        // Apply path. There is no host-process Editor.Message channel for
        // this; the operation lives on the scene facade and is reachable
        // via execute-scene-script (see source/scene.ts:applyPrefab).
        const facadeResult = await (0, scene_bridge_1.runSceneMethodAsToolResponse)('applyPrefab', [nodeUuid]);
        if (facadeResult.success) {
            return Object.assign(Object.assign({}, facadeResult), { data: Object.assign(Object.assign({}, ((_a = facadeResult.data) !== null && _a !== void 0 ? _a : {})), { prefabPath, nodeUuid }) });
        }
        return {
            success: false,
            error: (_b = facadeResult.error) !== null && _b !== void 0 ? _b : 'applyPrefab failed via scene facade',
            data: { prefabPath, nodeUuid },
        };
    }
    async linkPrefab(nodeUuid, assetUuid) {
        return (0, scene_bridge_1.runSceneMethodAsToolResponse)('linkPrefab', [nodeUuid, assetUuid]);
    }
    async unlinkPrefab(nodeUuid, removeNested) {
        return (0, scene_bridge_1.runSceneMethodAsToolResponse)('unlinkPrefab', [nodeUuid, removeNested]);
    }
    async getPrefabData(nodeUuid) {
        return (0, scene_bridge_1.runSceneMethodAsToolResponse)('getPrefabData', [nodeUuid]);
    }
    async revertPrefab(nodeUuid) {
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
            }).catch((err) => {
                resolve({ success: false, error: err.message });
            });
        });
    }
    async getPrefabInfo(prefabPath) {
        return new Promise((resolve) => {
            Editor.Message.request('asset-db', 'query-asset-info', prefabPath).then((assetInfo) => {
                if (!assetInfo) {
                    throw new Error('Prefab not found');
                }
                return Editor.Message.request('asset-db', 'query-asset-meta', assetInfo.uuid);
            }).then((metaInfo) => {
                const info = {
                    name: metaInfo.name,
                    uuid: metaInfo.uuid,
                    path: prefabPath,
                    folder: prefabPath.substring(0, prefabPath.lastIndexOf('/')),
                    createTime: metaInfo.createTime,
                    modifyTime: metaInfo.modifyTime,
                    dependencies: metaInfo.depends || []
                };
                resolve({ success: true, data: info });
            }).catch((err) => {
                resolve({ success: false, error: err.message });
            });
        });
    }
    async validatePrefab(prefabPath) {
        return new Promise((resolve) => {
            try {
                // 读取预制体文件内容
                Editor.Message.request('asset-db', 'query-asset-info', prefabPath).then((assetInfo) => {
                    if (!assetInfo) {
                        resolve({
                            success: false,
                            error: '预制体文件不存在'
                        });
                        return;
                    }
                    // 验证预制体格式
                    Editor.Message.request('asset-db', 'read-asset', prefabPath).then((content) => {
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
                        }
                        catch (parseError) {
                            resolve({
                                success: false,
                                error: '预制体文件格式错误，无法解析JSON'
                            });
                        }
                    }).catch((error) => {
                        resolve({
                            success: false,
                            error: `读取预制体文件失败: ${error.message}`
                        });
                    });
                }).catch((error) => {
                    resolve({
                        success: false,
                        error: `查询预制体信息失败: ${error.message}`
                    });
                });
            }
            catch (error) {
                resolve({
                    success: false,
                    error: `验证预制体时发生错误: ${error}`
                });
            }
        });
    }
    validatePrefabFormat(prefabData) {
        const issues = [];
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
        prefabData.forEach((item, index) => {
            if (item.__type__ === 'cc.Node') {
                nodeCount++;
            }
            else if (item.__type__ && item.__type__.includes('cc.')) {
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
    async duplicatePrefab(args) {
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
            }
            catch (error) {
                resolve({
                    success: false,
                    error: `复制预制体时发生错误: ${error}`
                });
            }
        });
    }
    async readPrefabContent(prefabPath) {
        return new Promise((resolve) => {
            Editor.Message.request('asset-db', 'read-asset', prefabPath).then((content) => {
                try {
                    const prefabData = JSON.parse(content);
                    resolve({ success: true, data: prefabData });
                }
                catch (parseError) {
                    resolve({ success: false, error: '预制体文件格式错误' });
                }
            }).catch((error) => {
                resolve({ success: false, error: error.message || '读取预制体文件失败' });
            });
        });
    }
    modifyPrefabForDuplication(prefabData, newName, newUuid) {
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
    async restorePrefabNode(nodeUuid, assetUuid) {
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
            }).catch((error) => {
                resolve({
                    success: false,
                    error: `预制体节点还原失败: ${error.message}`
                });
            });
        });
    }
}
exports.PrefabTools = PrefabTools;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJlZmFiLXRvb2xzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL3Rvb2xzL3ByZWZhYi10b29scy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSxvQ0FBc0M7QUFDdEMsMENBQStEO0FBQy9ELHNEQUFtRTtBQUVuRSxNQUFNLG9CQUFvQixHQUFHLFVBQUMsQ0FBQyxNQUFNLENBQUM7SUFDbEMsQ0FBQyxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLEVBQUU7SUFDeEIsQ0FBQyxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLEVBQUU7SUFDeEIsQ0FBQyxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLEVBQUU7Q0FDM0IsQ0FBQyxDQUFDO0FBRUgsTUFBTSxhQUFhLEdBQUc7SUFDbEIsZUFBZSxFQUFFLFVBQUMsQ0FBQyxNQUFNLENBQUM7UUFDdEIsTUFBTSxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLENBQUMsUUFBUSxDQUFDLGtDQUFrQyxDQUFDO0tBQ3pGLENBQUM7SUFDRixXQUFXLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQztRQUNsQixVQUFVLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyxtQkFBbUIsQ0FBQztLQUN2RCxDQUFDO0lBQ0Ysa0JBQWtCLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQztRQUN6QixVQUFVLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyxtQkFBbUIsQ0FBQztRQUNwRCxVQUFVLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsRUFBRSxDQUFDLFFBQVEsQ0FBQyw2QkFBNkIsQ0FBQztRQUN6RSxRQUFRLEVBQUUsb0JBQW9CLENBQUMsUUFBUSxFQUFFLENBQUMsUUFBUSxDQUFDLGtCQUFrQixDQUFDO0tBQ3pFLENBQUM7SUFD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RCxPQUFPLElBQUksT0FBTyxDQUFDLENBQUMsT0FBTyxFQUFFLEVBQUU7WUFDM0Isb0VBQW9FO1lBQ3BFLCtEQUErRDtZQUMvRCxpRUFBaUU7WUFDakUsb0VBQW9FO1lBQ3BFLG1FQUFtRTtZQUNuRSw2Q0FBNkM7WUFDN0MsTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLGdCQUFnQixFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRTtnQkFDNUUsT0FBTyxDQUFDO29CQUNKLE9BQU8sRUFBRSxJQUFJO29CQUNiLElBQUksRUFBRTt3QkFDRixRQUFRLEVBQUUsUUFBUTt3QkFDbEIsU0FBUyxFQUFFLFNBQVM7d0JBQ3BCLE9BQU8sRUFBRSxXQUFXO3FCQUN2QjtpQkFDSixDQUFDLENBQUM7WUFDUCxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxLQUFVLEVBQUUsRUFBRTtnQkFDcEIsT0FBTyxDQUFDO29CQUNKLE9BQU8sRUFBRSxLQUFLO29CQUNkLEtBQUssRUFBRSxjQUFjLEtBQUssQ0FBQyxPQUFPLEVBQUU7aUJBQ3ZDLENBQUMsQ0FBQztZQUNQLENBQUMsQ0FBQyxDQUFDO1FBQ1AsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDO0NBRUo7QUFqaEJELGtDQWloQkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBUb29sRGVmaW5pdGlvbiwgVG9vbFJlc3BvbnNlLCBUb29sRXhlY3V0b3IsIFByZWZhYkluZm8gfSBmcm9tICcuLi90eXBlcyc7XG5pbXBvcnQgeyBkZWJ1Z0xvZyB9IGZyb20gJy4uL2xpYi9sb2cnO1xuaW1wb3J0IHsgeiwgdG9JbnB1dFNjaGVtYSwgdmFsaWRhdGVBcmdzIH0gZnJvbSAnLi4vbGliL3NjaGVtYSc7XG5pbXBvcnQgeyBydW5TY2VuZU1ldGhvZEFzVG9vbFJlc3BvbnNlIH0gZnJvbSAnLi4vbGliL3NjZW5lLWJyaWRnZSc7XG5cbmNvbnN0IHByZWZhYlBvc2l0aW9uU2NoZW1hID0gei5vYmplY3Qoe1xuICAgIHg6IHoubnVtYmVyKCkub3B0aW9uYWwoKSxcbiAgICB5OiB6Lm51bWJlcigpLm9wdGlvbmFsKCksXG4gICAgejogei5udW1iZXIoKS5vcHRpb25hbCgpLFxufSk7XG5cbmNvbnN0IHByZWZhYlNjaGVtYXMgPSB7XG4gICAgZ2V0X3ByZWZhYl9saXN0OiB6Lm9iamVjdCh7XG4gICAgICAgIGZvbGRlcjogei5zdHJpbmcoKS5kZWZhdWx0KCdkYjovL2Fzc2V0cycpLmRlc2NyaWJlKCdGb2xkZXIgcGF0aCB0byBzZWFyY2ggKG9wdGlvbmFsKScpLFxuICAgIH0pLFxuICAgIGxvYWRfcHJlZmFiOiB6Lm9iamVjdCh7XG4gICAgICAgIHByZWZhYlBhdGg6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1ByZWZhYiBhc3NldCBwYXRoJyksXG4gICAgfSksXG4gICAgaW5zdGFudGlhdGVfcHJlZmFiOiB6Lm9iamVjdCh7XG4gICAgICAgIHByZWZhYlBhdGg6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1ByZWZhYiBhc3NldCBwYXRoJyksXG4gICAgICAgIHBhcmVudFV1aWQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnUGFyZW50IG5vZGUgVVVJRCAob3B0aW9uYWwpJyksXG4gICAgICAgIHBvc2l0aW9uOiBwcmVmYWJQb3NpdGlvblNjaGVtYS5vcHRpb25hbCgpLmRlc2NyaWJlKCdJbml0aWFsIHBvc2l0aW9uJyksXG4gICAgfSksXG4gICAgY3JlYXRlX3ByZWZhYjogei5vYmplY3Qoe1xuICAgICAgICBub2RlVXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnU291cmNlIG5vZGUgVVVJRCcpLFxuICAgICAgICBzYXZlUGF0aDogei5zdHJpbmcoKS5kZXNjcmliZSgnUGF0aCB0byBzYXZlIHRoZSBwcmVmYWIgKGUuZy4sIGRiOi8vYXNzZXRzL3ByZWZhYnMvTXlQcmVmYWIucHJlZmFiKScpLFxuICAgICAgICBwcmVmYWJOYW1lOiB6LnN0cmluZygpLmRlc2NyaWJlKCdQcmVmYWIgbmFtZScpLFxuICAgIH0pLFxuICAgIHVwZGF0ZV9wcmVmYWI6IHoub2JqZWN0KHtcbiAgICAgICAgcHJlZmFiUGF0aDogei5zdHJpbmcoKS5kZXNjcmliZSgnUHJlZmFiIGFzc2V0IHBhdGgnKSxcbiAgICAgICAgbm9kZVV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ05vZGUgVVVJRCB3aXRoIGNoYW5nZXMnKSxcbiAgICB9KSxcbiAgICByZXZlcnRfcHJlZmFiOiB6Lm9iamVjdCh7XG4gICAgICAgIG5vZGVVdWlkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdQcmVmYWIgaW5zdGFuY2Ugbm9kZSBVVUlEJyksXG4gICAgfSksXG4gICAgZ2V0X3ByZWZhYl9pbmZvOiB6Lm9iamVjdCh7XG4gICAgICAgIHByZWZhYlBhdGg6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1ByZWZhYiBhc3NldCBwYXRoJyksXG4gICAgfSksXG4gICAgdmFsaWRhdGVfcHJlZmFiOiB6Lm9iamVjdCh7XG4gICAgICAgIHByZWZhYlBhdGg6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1ByZWZhYiBhc3NldCBwYXRoJyksXG4gICAgfSksXG4gICAgZHVwbGljYXRlX3ByZWZhYjogei5vYmplY3Qoe1xuICAgICAgICBzb3VyY2VQcmVmYWJQYXRoOiB6LnN0cmluZygpLmRlc2NyaWJlKCdTb3VyY2UgcHJlZmFiIHBhdGgnKSxcbiAgICAgICAgdGFyZ2V0UHJlZmFiUGF0aDogei5zdHJpbmcoKS5kZXNjcmliZSgnVGFyZ2V0IHByZWZhYiBwYXRoJyksXG4gICAgICAgIG5ld1ByZWZhYk5hbWU6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnTmV3IHByZWZhYiBuYW1lJyksXG4gICAgfSksXG4gICAgcmVzdG9yZV9wcmVmYWJfbm9kZTogei5vYmplY3Qoe1xuICAgICAgICBub2RlVXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnUHJlZmFiIGluc3RhbmNlIG5vZGUgVVVJRCcpLFxuICAgICAgICBhc3NldFV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1ByZWZhYiBhc3NldCBVVUlEJyksXG4gICAgfSksXG4gICAgbGlua19wcmVmYWI6IHoub2JqZWN0KHtcbiAgICAgICAgbm9kZVV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ05vZGUgVVVJRCB0byBjb25uZWN0IHRvIGEgcHJlZmFiIGFzc2V0JyksXG4gICAgICAgIGFzc2V0VXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnUHJlZmFiIGFzc2V0IFVVSUQgdG8gbGluayB0aGUgbm9kZSB0bycpLFxuICAgIH0pLFxuICAgIHVubGlua19wcmVmYWI6IHoub2JqZWN0KHtcbiAgICAgICAgbm9kZVV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1ByZWZhYiBpbnN0YW5jZSBub2RlIFVVSUQgdG8gZGV0YWNoJyksXG4gICAgICAgIHJlbW92ZU5lc3RlZDogei5ib29sZWFuKCkuZGVmYXVsdChmYWxzZSkuZGVzY3JpYmUoJ1doZXRoZXIgdG8gYWxzbyB1bmxpbmsgbmVzdGVkIHByZWZhYiBpbnN0YW5jZXMgdW5kZXIgdGhpcyBub2RlJyksXG4gICAgfSksXG4gICAgZ2V0X3ByZWZhYl9kYXRhOiB6Lm9iamVjdCh7XG4gICAgICAgIG5vZGVVdWlkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdQcmVmYWIgaW5zdGFuY2Ugbm9kZSBVVUlEJyksXG4gICAgfSksXG59IGFzIGNvbnN0O1xuXG5jb25zdCBwcmVmYWJUb29sTWV0YTogUmVjb3JkPGtleW9mIHR5cGVvZiBwcmVmYWJTY2hlbWFzLCBzdHJpbmc+ID0ge1xuICAgIGdldF9wcmVmYWJfbGlzdDogJ0dldCBhbGwgcHJlZmFicyBpbiB0aGUgcHJvamVjdCcsXG4gICAgbG9hZF9wcmVmYWI6ICdMb2FkIGEgcHJlZmFiIGJ5IHBhdGgnLFxuICAgIGluc3RhbnRpYXRlX3ByZWZhYjogJ0luc3RhbnRpYXRlIGEgcHJlZmFiIGluIHRoZSBzY2VuZScsXG4gICAgY3JlYXRlX3ByZWZhYjogJ0NyZWF0ZSBhIHByZWZhYiBmcm9tIGEgbm9kZSB3aXRoIGFsbCBjaGlsZHJlbiBhbmQgY29tcG9uZW50cycsXG4gICAgdXBkYXRlX3ByZWZhYjogJ0FwcGx5IHByZWZhYiBpbnN0YW5jZSBlZGl0cyBiYWNrIHRvIHRoZSBwcmVmYWIgYXNzZXQgKGNjZS5TY2VuZUZhY2FkZS5hcHBseVByZWZhYiknLFxuICAgIHJldmVydF9wcmVmYWI6ICdSZXZlcnQgcHJlZmFiIGluc3RhbmNlIHRvIG9yaWdpbmFsJyxcbiAgICBnZXRfcHJlZmFiX2luZm86ICdHZXQgZGV0YWlsZWQgcHJlZmFiIGluZm9ybWF0aW9uJyxcbiAgICB2YWxpZGF0ZV9wcmVmYWI6ICdWYWxpZGF0ZSBhIHByZWZhYiBmaWxlIGZvcm1hdCcsXG4gICAgZHVwbGljYXRlX3ByZWZhYjogJ0R1cGxpY2F0ZSBhbiBleGlzdGluZyBwcmVmYWInLFxuICAgIHJlc3RvcmVfcHJlZmFiX25vZGU6ICdSZXN0b3JlIHByZWZhYiBub2RlIHVzaW5nIHByZWZhYiBhc3NldCAoYnVpbHQtaW4gdW5kbyByZWNvcmQpJyxcbiAgICBsaW5rX3ByZWZhYjogJ0Nvbm5lY3QgYSByZWd1bGFyIG5vZGUgdG8gYSBwcmVmYWIgYXNzZXQgKGNjZS5TY2VuZUZhY2FkZS5saW5rUHJlZmFiKScsXG4gICAgdW5saW5rX3ByZWZhYjogJ0JyZWFrIGEgcHJlZmFiIGluc3RhbmNlIGxpbmssIG9wdGlvbmFsbHkgY2xlYXJpbmcgbmVzdGVkIGluc3RhbmNlcyAoY2NlLlNjZW5lRmFjYWRlLnVubGlua1ByZWZhYiknLFxuICAgIGdldF9wcmVmYWJfZGF0YTogJ1JlYWQgdGhlIHByZWZhYiBkdW1wIGZvciBhIHByZWZhYiBpbnN0YW5jZSBub2RlIChjY2UuU2NlbmVGYWNhZGUuZ2V0UHJlZmFiRGF0YSknLFxufTtcblxuZXhwb3J0IGNsYXNzIFByZWZhYlRvb2xzIGltcGxlbWVudHMgVG9vbEV4ZWN1dG9yIHtcbiAgICBnZXRUb29scygpOiBUb29sRGVmaW5pdGlvbltdIHtcbiAgICAgICAgcmV0dXJuIChPYmplY3Qua2V5cyhwcmVmYWJTY2hlbWFzKSBhcyBBcnJheTxrZXlvZiB0eXBlb2YgcHJlZmFiU2NoZW1hcz4pLm1hcChuYW1lID0+ICh7XG4gICAgICAgICAgICBuYW1lLFxuICAgICAgICAgICAgZGVzY3JpcHRpb246IHByZWZhYlRvb2xNZXRhW25hbWVdLFxuICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHRvSW5wdXRTY2hlbWEocHJlZmFiU2NoZW1hc1tuYW1lXSksXG4gICAgICAgIH0pKTtcbiAgICB9XG5cbiAgICBhc3luYyBleGVjdXRlKHRvb2xOYW1lOiBzdHJpbmcsIGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHNjaGVtYU5hbWUgPSB0b29sTmFtZSBhcyBrZXlvZiB0eXBlb2YgcHJlZmFiU2NoZW1hcztcbiAgICAgICAgY29uc3Qgc2NoZW1hID0gcHJlZmFiU2NoZW1hc1tzY2hlbWFOYW1lXTtcbiAgICAgICAgaWYgKCFzY2hlbWEpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5rbm93biB0b29sOiAke3Rvb2xOYW1lfWApO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHZhbGlkYXRpb24gPSB2YWxpZGF0ZUFyZ3Moc2NoZW1hLCBhcmdzID8/IHt9KTtcbiAgICAgICAgaWYgKCF2YWxpZGF0aW9uLm9rKSB7XG4gICAgICAgICAgICByZXR1cm4gdmFsaWRhdGlvbi5yZXNwb25zZTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBhID0gdmFsaWRhdGlvbi5kYXRhIGFzIGFueTtcblxuICAgICAgICBzd2l0Y2ggKHNjaGVtYU5hbWUpIHtcbiAgICAgICAgICAgIGNhc2UgJ2dldF9wcmVmYWJfbGlzdCc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuZ2V0UHJlZmFiTGlzdChhLmZvbGRlcik7XG4gICAgICAgICAgICBjYXNlICdsb2FkX3ByZWZhYic6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMubG9hZFByZWZhYihhLnByZWZhYlBhdGgpO1xuICAgICAgICAgICAgY2FzZSAnaW5zdGFudGlhdGVfcHJlZmFiJzpcbiAgICAgICAgICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5pbnN0YW50aWF0ZVByZWZhYihhKTtcbiAgICAgICAgICAgIGNhc2UgJ2NyZWF0ZV9wcmVmYWInOlxuICAgICAgICAgICAgICAgIHJldHVybiBhd2FpdCB0aGlzLmNyZWF0ZVByZWZhYihhKTtcbiAgICAgICAgICAgIGNhc2UgJ3VwZGF0ZV9wcmVmYWInOlxuICAgICAgICAgICAgICAgIHJldHVybiBhd2FpdCB0aGlzLnVwZGF0ZVByZWZhYihhLnByZWZhYlBhdGgsIGEubm9kZVV1aWQpO1xuICAgICAgICAgICAgY2FzZSAncmV2ZXJ0X3ByZWZhYic6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMucmV2ZXJ0UHJlZmFiKGEubm9kZVV1aWQpO1xuICAgICAgICAgICAgY2FzZSAnZ2V0X3ByZWZhYl9pbmZvJzpcbiAgICAgICAgICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5nZXRQcmVmYWJJbmZvKGEucHJlZmFiUGF0aCk7XG4gICAgICAgICAgICBjYXNlICd2YWxpZGF0ZV9wcmVmYWInOlxuICAgICAgICAgICAgICAgIHJldHVybiBhd2FpdCB0aGlzLnZhbGlkYXRlUHJlZmFiKGEucHJlZmFiUGF0aCk7XG4gICAgICAgICAgICBjYXNlICdkdXBsaWNhdGVfcHJlZmFiJzpcbiAgICAgICAgICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5kdXBsaWNhdGVQcmVmYWIoYSk7XG4gICAgICAgICAgICBjYXNlICdyZXN0b3JlX3ByZWZhYl9ub2RlJzpcbiAgICAgICAgICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5yZXN0b3JlUHJlZmFiTm9kZShhLm5vZGVVdWlkLCBhLmFzc2V0VXVpZCk7XG4gICAgICAgICAgICBjYXNlICdsaW5rX3ByZWZhYic6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMubGlua1ByZWZhYihhLm5vZGVVdWlkLCBhLmFzc2V0VXVpZCk7XG4gICAgICAgICAgICBjYXNlICd1bmxpbmtfcHJlZmFiJzpcbiAgICAgICAgICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy51bmxpbmtQcmVmYWIoYS5ub2RlVXVpZCwgYS5yZW1vdmVOZXN0ZWQpO1xuICAgICAgICAgICAgY2FzZSAnZ2V0X3ByZWZhYl9kYXRhJzpcbiAgICAgICAgICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5nZXRQcmVmYWJEYXRhKGEubm9kZVV1aWQpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRQcmVmYWJMaXN0KGZvbGRlcjogc3RyaW5nID0gJ2RiOi8vYXNzZXRzJyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgcGF0dGVybiA9IGZvbGRlci5lbmRzV2l0aCgnLycpID8gXG4gICAgICAgICAgICAgICAgYCR7Zm9sZGVyfSoqLyoucHJlZmFiYCA6IGAke2ZvbGRlcn0vKiovKi5wcmVmYWJgO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldHMnLCB7XG4gICAgICAgICAgICAgICAgcGF0dGVybjogcGF0dGVyblxuICAgICAgICAgICAgfSkudGhlbigocmVzdWx0czogYW55W10pID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBwcmVmYWJzOiBQcmVmYWJJbmZvW10gPSByZXN1bHRzLm1hcChhc3NldCA9PiAoe1xuICAgICAgICAgICAgICAgICAgICBuYW1lOiBhc3NldC5uYW1lLFxuICAgICAgICAgICAgICAgICAgICBwYXRoOiBhc3NldC51cmwsXG4gICAgICAgICAgICAgICAgICAgIHV1aWQ6IGFzc2V0LnV1aWQsXG4gICAgICAgICAgICAgICAgICAgIGZvbGRlcjogYXNzZXQudXJsLnN1YnN0cmluZygwLCBhc3NldC51cmwubGFzdEluZGV4T2YoJy8nKSlcbiAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IHByZWZhYnMgfSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVyci5tZXNzYWdlIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgbG9hZFByZWZhYihwcmVmYWJQYXRoOiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICAvLyBPcmlnaW5hbCBpbXBsZW1lbnRhdGlvbiBjYWxsZWQgc2NlbmUgYGxvYWQtYXNzZXRgLCB3aGljaCBpcyBub3QgYSByZWFsXG4gICAgICAgIC8vIGNoYW5uZWwgb24gdGhlIHNjZW5lIG1vZHVsZSBwZXIgQGNvY29zL2NyZWF0b3ItdHlwZXMuIFRoZXJlIGlzIG5vXG4gICAgICAgIC8vIGdlbmVyaWMgXCJsb2FkIGEgcHJlZmFiIHdpdGhvdXQgaW5zdGFudGlhdGluZ1wiIG9wZXJhdGlvbiBleHBvc2VkIHRvXG4gICAgICAgIC8vIGVkaXRvciBleHRlbnNpb25zLiBSZXR1cm4gdGhlIGFzc2V0IG1ldGFkYXRhIHZpYSBhc3NldC1kYiBpbnN0ZWFkO1xuICAgICAgICAvLyBjYWxsZXJzIHdobyBhY3R1YWxseSB3YW50IHRoZSBwcmVmYWIgaW4gdGhlIHNjZW5lIHNob3VsZCB1c2VcbiAgICAgICAgLy8gaW5zdGFudGlhdGVfcHJlZmFiLlxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0LWluZm8nLCBwcmVmYWJQYXRoKS50aGVuKChhc3NldEluZm86IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmICghYXNzZXRJbmZvKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBQcmVmYWIgbm90IGZvdW5kOiAke3ByZWZhYlBhdGh9YCB9KTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAgdXVpZDogYXNzZXRJbmZvLnV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBuYW1lOiBhc3NldEluZm8ubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHVybDogYXNzZXRJbmZvLnVybCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6IGFzc2V0SW5mby50eXBlLFxuICAgICAgICAgICAgICAgICAgICAgICAgc291cmNlOiBhc3NldEluZm8uc291cmNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogJ1ByZWZhYiBtZXRhZGF0YSByZXRyaWV2ZWQgKGluc3RhbnRpYXRlX3ByZWZhYiB0byBhZGQgaXQgdG8gdGhlIHNjZW5lKScsXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVyci5tZXNzYWdlIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgaW5zdGFudGlhdGVQcmVmYWIoYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKGFzeW5jIChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIC8vIOiOt+WPlumihOWItuS9k+i1hOa6kOS/oeaBr1xuICAgICAgICAgICAgICAgIGNvbnN0IGFzc2V0SW5mbyA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0LWluZm8nLCBhcmdzLnByZWZhYlBhdGgpO1xuICAgICAgICAgICAgICAgIGlmICghYXNzZXRJbmZvKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcign6aKE5Yi25L2T5pyq5om+5YiwJyk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8g5L2/55So5q2j56Gu55qEIGNyZWF0ZS1ub2RlIEFQSSDku47pooTliLbkvZPotYTmupDlrp7kvovljJZcbiAgICAgICAgICAgICAgICBjb25zdCBjcmVhdGVOb2RlT3B0aW9uczogYW55ID0ge1xuICAgICAgICAgICAgICAgICAgICBhc3NldFV1aWQ6IGFzc2V0SW5mby51dWlkXG4gICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgIC8vIOiuvue9rueItuiKgueCuVxuICAgICAgICAgICAgICAgIGlmIChhcmdzLnBhcmVudFV1aWQpIHtcbiAgICAgICAgICAgICAgICAgICAgY3JlYXRlTm9kZU9wdGlvbnMucGFyZW50ID0gYXJncy5wYXJlbnRVdWlkO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIOiuvue9ruiKgueCueWQjeensFxuICAgICAgICAgICAgICAgIGlmIChhcmdzLm5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgY3JlYXRlTm9kZU9wdGlvbnMubmFtZSA9IGFyZ3MubmFtZTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGFzc2V0SW5mby5uYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgIGNyZWF0ZU5vZGVPcHRpb25zLm5hbWUgPSBhc3NldEluZm8ubmFtZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyDorr7nva7liJ3lp4vlsZ7mgKfvvIjlpoLkvY3nva7vvIlcbiAgICAgICAgICAgICAgICBpZiAoYXJncy5wb3NpdGlvbikge1xuICAgICAgICAgICAgICAgICAgICBjcmVhdGVOb2RlT3B0aW9ucy5kdW1wID0ge1xuICAgICAgICAgICAgICAgICAgICAgICAgcG9zaXRpb246IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZTogYXJncy5wb3NpdGlvblxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIOWIm+W7uuiKgueCuVxuICAgICAgICAgICAgICAgIGNvbnN0IG5vZGVVdWlkID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnY3JlYXRlLW5vZGUnLCBjcmVhdGVOb2RlT3B0aW9ucyk7XG4gICAgICAgICAgICAgICAgY29uc3QgdXVpZCA9IEFycmF5LmlzQXJyYXkobm9kZVV1aWQpID8gbm9kZVV1aWRbMF0gOiBub2RlVXVpZDtcblxuICAgICAgICAgICAgICAgIC8vIOazqOaEj++8mmNyZWF0ZS1ub2RlIEFQSeS7jumihOWItuS9k+i1hOa6kOWIm+W7uuaXtuW6lOivpeiHquWKqOW7uueri+mihOWItuS9k+WFs+iBlFxuICAgICAgICAgICAgICAgIGRlYnVnTG9nKCfpooTliLbkvZPoioLngrnliJvlu7rmiJDlip86Jywge1xuICAgICAgICAgICAgICAgICAgICBub2RlVXVpZDogdXVpZCxcbiAgICAgICAgICAgICAgICAgICAgcHJlZmFiVXVpZDogYXNzZXRJbmZvLnV1aWQsXG4gICAgICAgICAgICAgICAgICAgIHByZWZhYlBhdGg6IGFyZ3MucHJlZmFiUGF0aFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBub2RlVXVpZDogdXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHByZWZhYlBhdGg6IGFyZ3MucHJlZmFiUGF0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhcmVudFV1aWQ6IGFyZ3MucGFyZW50VXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHBvc2l0aW9uOiBhcmdzLnBvc2l0aW9uLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogJ+mihOWItuS9k+WunuS+i+WMluaIkOWKn++8jOW3suW7uueri+mihOWItuS9k+WFs+iBlCdcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHsgXG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLCBcbiAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGDpooTliLbkvZPlrp7kvovljJblpLHotKU6ICR7ZXJyLm1lc3NhZ2V9YCxcbiAgICAgICAgICAgICAgICAgICAgaW5zdHJ1Y3Rpb246ICfor7fmo4Dmn6XpooTliLbkvZPot6/lvoTmmK/lkKbmraPnoa7vvIznoa7kv53pooTliLbkvZPmlofku7bmoLzlvI/mraPnoa4nXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgY3JlYXRlUHJlZmFiKGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZShhc3luYyAocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAvLyDmlK/mjIEgcHJlZmFiUGF0aCDlkowgc2F2ZVBhdGgg5Lik56eN5Y+C5pWw5ZCNXG4gICAgICAgICAgICAgICAgY29uc3QgcGF0aFBhcmFtID0gYXJncy5wcmVmYWJQYXRoIHx8IGFyZ3Muc2F2ZVBhdGg7XG4gICAgICAgICAgICAgICAgaWYgKCFwYXRoUGFyYW0pIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yOiAn57y65bCR6aKE5Yi25L2T6Lev5b6E5Y+C5pWw44CC6K+35o+Q5L6bIHByZWZhYlBhdGgg5oiWIHNhdmVQYXRo44CCJ1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGNvbnN0IHByZWZhYk5hbWUgPSBhcmdzLnByZWZhYk5hbWUgfHwgJ05ld1ByZWZhYic7XG4gICAgICAgICAgICAgICAgY29uc3QgZnVsbFBhdGggPSBwYXRoUGFyYW0uZW5kc1dpdGgoJy5wcmVmYWInKSA/XG4gICAgICAgICAgICAgICAgICAgIHBhdGhQYXJhbSA6IGAke3BhdGhQYXJhbX0vJHtwcmVmYWJOYW1lfS5wcmVmYWJgO1xuXG4gICAgICAgICAgICAgICAgLy8gVGhlIG9mZmljaWFsIHNjZW5lLWZhY2FkZSBwYXRoIChjY2UuUHJlZmFiLmNyZWF0ZVByZWZhYiB2aWFcbiAgICAgICAgICAgICAgICAvLyBleGVjdXRlLXNjZW5lLXNjcmlwdCkuIFRoZSBsZWdhY3kgaGFuZC1yb2xsZWQgSlNPTiBmYWxsYmFja1xuICAgICAgICAgICAgICAgIC8vIChjcmVhdGVQcmVmYWJXaXRoQXNzZXREQiAvIGNyZWF0ZVByZWZhYk5hdGl2ZSAvIGNyZWF0ZVByZWZhYkN1c3RvbSxcbiAgICAgICAgICAgICAgICAvLyB+MjUwIHNvdXJjZSBsaW5lcykgd2FzIHJlbW92ZWQgaW4gdjIuMS4zIOKAlCBzZWUgY29tbWl0IDU0NzExNWJcbiAgICAgICAgICAgICAgICAvLyBmb3IgdGhlIHByZS1yZW1vdmFsIHNvdXJjZSBpZiBhIGZ1dHVyZSBDb2NvcyBDcmVhdG9yIGJ1aWxkXG4gICAgICAgICAgICAgICAgLy8gYnJlYWtzIHRoZSBmYWNhZGUgcGF0aC4gVGhlIGZhY2FkZSBoYXMgYmVlbiB0aGUgb25seSBwYXRoXG4gICAgICAgICAgICAgICAgLy8gZXhlcmNpc2VkIGluIHYyLjEuMSAvIHYyLjEuMiByZWFsLWVkaXRvciB0ZXN0aW5nIGFjcm9zc1xuICAgICAgICAgICAgICAgIC8vIHNpbXBsZSBhbmQgY29tcGxleCAobmVzdGVkICsgbXVsdGktY29tcG9uZW50KSBwcmVmYWIgZm9ybXMuXG4gICAgICAgICAgICAgICAgZGVidWdMb2coJ0NhbGxpbmcgc2NlbmUtc2NyaXB0IGNjZS5QcmVmYWIuY3JlYXRlUHJlZmFiLi4uJyk7XG4gICAgICAgICAgICAgICAgY29uc3QgZmFjYWRlUmVzdWx0ID0gYXdhaXQgcnVuU2NlbmVNZXRob2RBc1Rvb2xSZXNwb25zZSgnY3JlYXRlUHJlZmFiRnJvbU5vZGUnLCBbYXJncy5ub2RlVXVpZCwgZnVsbFBhdGhdKTtcbiAgICAgICAgICAgICAgICBpZiAoIWZhY2FkZVJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZmFjYWRlUmVzdWx0KTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdyZWZyZXNoLWFzc2V0JywgZnVsbFBhdGgpO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKHJlZnJlc2hFcnI6IGFueSkge1xuICAgICAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgcmVmcmVzaC1hc3NldCBhZnRlciBmYWNhZGUgY3JlYXRlUHJlZmFiIGZhaWxlZCAobm9uLWZhdGFsKTogJHtyZWZyZXNoRXJyPy5tZXNzYWdlID8/IHJlZnJlc2hFcnJ9YCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICAuLi5mYWNhZGVSZXN1bHQsXG4gICAgICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC4uLihmYWNhZGVSZXN1bHQuZGF0YSA/PyB7fSksXG4gICAgICAgICAgICAgICAgICAgICAgICBwcmVmYWJOYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgcHJlZmFiUGF0aDogZnVsbFBhdGgsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXRob2Q6ICdzY2VuZS1mYWNhZGUnLFxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIGVycm9yOiBg5Yib5bu66aKE5Yi25L2T5pe25Y+R55Sf6ZSZ6K+vOiAke2Vycm9yfWBcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBnZW5lcmF0ZVVVSUQoKTogc3RyaW5nIHtcbiAgICAgICAgLy8g55Sf5oiQ56ym5ZCIQ29jb3MgQ3JlYXRvcuagvOW8j+eahFVVSURcbiAgICAgICAgY29uc3QgY2hhcnMgPSAnMDEyMzQ1Njc4OWFiY2RlZic7XG4gICAgICAgIGxldCB1dWlkID0gJyc7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgMzI7IGkrKykge1xuICAgICAgICAgICAgaWYgKGkgPT09IDggfHwgaSA9PT0gMTIgfHwgaSA9PT0gMTYgfHwgaSA9PT0gMjApIHtcbiAgICAgICAgICAgICAgICB1dWlkICs9ICctJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHV1aWQgKz0gY2hhcnNbTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogY2hhcnMubGVuZ3RoKV07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHV1aWQ7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBjcmVhdGVNZXRhRGF0YShwcmVmYWJOYW1lOiBzdHJpbmcsIHByZWZhYlV1aWQ6IHN0cmluZyk6IGFueSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBcInZlclwiOiBcIjEuMS41MFwiLFxuICAgICAgICAgICAgXCJpbXBvcnRlclwiOiBcInByZWZhYlwiLFxuICAgICAgICAgICAgXCJpbXBvcnRlZFwiOiB0cnVlLFxuICAgICAgICAgICAgXCJ1dWlkXCI6IHByZWZhYlV1aWQsXG4gICAgICAgICAgICBcImZpbGVzXCI6IFtcbiAgICAgICAgICAgICAgICBcIi5qc29uXCJcbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgICBcInN1Yk1ldGFzXCI6IHt9LFxuICAgICAgICAgICAgXCJ1c2VyRGF0YVwiOiB7XG4gICAgICAgICAgICAgICAgXCJzeW5jTm9kZU5hbWVcIjogcHJlZmFiTmFtZVxuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgdXBkYXRlUHJlZmFiKHByZWZhYlBhdGg6IHN0cmluZywgbm9kZVV1aWQ6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIC8vIEFwcGx5IHBhdGguIFRoZXJlIGlzIG5vIGhvc3QtcHJvY2VzcyBFZGl0b3IuTWVzc2FnZSBjaGFubmVsIGZvclxuICAgICAgICAvLyB0aGlzOyB0aGUgb3BlcmF0aW9uIGxpdmVzIG9uIHRoZSBzY2VuZSBmYWNhZGUgYW5kIGlzIHJlYWNoYWJsZVxuICAgICAgICAvLyB2aWEgZXhlY3V0ZS1zY2VuZS1zY3JpcHQgKHNlZSBzb3VyY2Uvc2NlbmUudHM6YXBwbHlQcmVmYWIpLlxuICAgICAgICBjb25zdCBmYWNhZGVSZXN1bHQgPSBhd2FpdCBydW5TY2VuZU1ldGhvZEFzVG9vbFJlc3BvbnNlKCdhcHBseVByZWZhYicsIFtub2RlVXVpZF0pO1xuICAgICAgICBpZiAoZmFjYWRlUmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgLi4uZmFjYWRlUmVzdWx0LFxuICAgICAgICAgICAgICAgIGRhdGE6IHsgLi4uKGZhY2FkZVJlc3VsdC5kYXRhID8/IHt9KSwgcHJlZmFiUGF0aCwgbm9kZVV1aWQgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgZXJyb3I6IGZhY2FkZVJlc3VsdC5lcnJvciA/PyAnYXBwbHlQcmVmYWIgZmFpbGVkIHZpYSBzY2VuZSBmYWNhZGUnLFxuICAgICAgICAgICAgZGF0YTogeyBwcmVmYWJQYXRoLCBub2RlVXVpZCB9LFxuICAgICAgICB9O1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgbGlua1ByZWZhYihub2RlVXVpZDogc3RyaW5nLCBhc3NldFV1aWQ6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBydW5TY2VuZU1ldGhvZEFzVG9vbFJlc3BvbnNlKCdsaW5rUHJlZmFiJywgW25vZGVVdWlkLCBhc3NldFV1aWRdKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHVubGlua1ByZWZhYihub2RlVXVpZDogc3RyaW5nLCByZW1vdmVOZXN0ZWQ6IGJvb2xlYW4pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gcnVuU2NlbmVNZXRob2RBc1Rvb2xSZXNwb25zZSgndW5saW5rUHJlZmFiJywgW25vZGVVdWlkLCByZW1vdmVOZXN0ZWRdKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldFByZWZhYkRhdGEobm9kZVV1aWQ6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBydW5TY2VuZU1ldGhvZEFzVG9vbFJlc3BvbnNlKCdnZXRQcmVmYWJEYXRhJywgW25vZGVVdWlkXSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyByZXZlcnRQcmVmYWIobm9kZVV1aWQ6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIC8vIFRoZSBwcmV2aW91cyBjb2RlIGNhbGxlZCBzY2VuZSBgcmV2ZXJ0LXByZWZhYmAsIHdoaWNoIGRvZXMgbm90IGV4aXN0LlxuICAgICAgICAvLyBUaGUgdmVyaWZpZWQgY2hhbm5lbCBpcyBgcmVzdG9yZS1wcmVmYWJgIHRha2luZyBgeyB1dWlkOiBzdHJpbmcgfWBcbiAgICAgICAgLy8gKFJlc2V0Q29tcG9uZW50T3B0aW9ucykuIFBlciB0aGUgZWRpdG9yIGNvbnZlbnRpb24gdGhpcyByZXN0b3JlcyB0aGVcbiAgICAgICAgLy8gbm9kZSBmcm9tIGl0cyBsaW5rZWQgcHJlZmFiIGFzc2V0LCB3aGljaCBtYXRjaGVzIHRoZSBcInJldmVydFwiIGludGVudC5cbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdyZXN0b3JlLXByZWZhYicsIHsgdXVpZDogbm9kZVV1aWQgfSkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdQcmVmYWIgaW5zdGFuY2UgcmV2ZXJ0ZWQgc3VjY2Vzc2Z1bGx5JyxcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRQcmVmYWJJbmZvKHByZWZhYlBhdGg6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXQtaW5mbycsIHByZWZhYlBhdGgpLnRoZW4oKGFzc2V0SW5mbzogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKCFhc3NldEluZm8pIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdQcmVmYWIgbm90IGZvdW5kJyk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcmV0dXJuIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0LW1ldGEnLCBhc3NldEluZm8udXVpZCk7XG4gICAgICAgICAgICB9KS50aGVuKChtZXRhSW5mbzogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgaW5mbzogUHJlZmFiSW5mbyA9IHtcbiAgICAgICAgICAgICAgICAgICAgbmFtZTogbWV0YUluZm8ubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgdXVpZDogbWV0YUluZm8udXVpZCxcbiAgICAgICAgICAgICAgICAgICAgcGF0aDogcHJlZmFiUGF0aCxcbiAgICAgICAgICAgICAgICAgICAgZm9sZGVyOiBwcmVmYWJQYXRoLnN1YnN0cmluZygwLCBwcmVmYWJQYXRoLmxhc3RJbmRleE9mKCcvJykpLFxuICAgICAgICAgICAgICAgICAgICBjcmVhdGVUaW1lOiBtZXRhSW5mby5jcmVhdGVUaW1lLFxuICAgICAgICAgICAgICAgICAgICBtb2RpZnlUaW1lOiBtZXRhSW5mby5tb2RpZnlUaW1lLFxuICAgICAgICAgICAgICAgICAgICBkZXBlbmRlbmNpZXM6IG1ldGFJbmZvLmRlcGVuZHMgfHwgW11cbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIHJlc29sdmUoeyBzdWNjZXNzOiB0cnVlLCBkYXRhOiBpbmZvIH0pO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHZhbGlkYXRlUHJlZmFiKHByZWZhYlBhdGg6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAvLyDor7vlj5bpooTliLbkvZPmlofku7blhoXlrrlcbiAgICAgICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldC1pbmZvJywgcHJlZmFiUGF0aCkudGhlbigoYXNzZXRJbmZvOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFhc3NldEluZm8pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yOiAn6aKE5Yi25L2T5paH5Lu25LiN5a2Y5ZyoJ1xuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvLyDpqozor4HpooTliLbkvZPmoLzlvI9cbiAgICAgICAgICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncmVhZC1hc3NldCcsIHByZWZhYlBhdGgpLnRoZW4oKGNvbnRlbnQ6IHN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBwcmVmYWJEYXRhID0gSlNPTi5wYXJzZShjb250ZW50KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB2YWxpZGF0aW9uUmVzdWx0ID0gdGhpcy52YWxpZGF0ZVByZWZhYkZvcm1hdChwcmVmYWJEYXRhKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaXNWYWxpZDogdmFsaWRhdGlvblJlc3VsdC5pc1ZhbGlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaXNzdWVzOiB2YWxpZGF0aW9uUmVzdWx0Lmlzc3VlcyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5vZGVDb3VudDogdmFsaWRhdGlvblJlc3VsdC5ub2RlQ291bnQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRDb3VudDogdmFsaWRhdGlvblJlc3VsdC5jb21wb25lbnRDb3VudCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IHZhbGlkYXRpb25SZXN1bHQuaXNWYWxpZCA/ICfpooTliLbkvZPmoLzlvI/mnInmlYgnIDogJ+mihOWItuS9k+agvOW8j+WtmOWcqOmXrumimCdcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAocGFyc2VFcnJvcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3I6ICfpooTliLbkvZPmlofku7bmoLzlvI/plJnor6/vvIzml6Dms5Xop6PmnpBKU09OJ1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9KS5jYXRjaCgoZXJyb3I6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGDor7vlj5bpooTliLbkvZPmlofku7blpLHotKU6ICR7ZXJyb3IubWVzc2FnZX1gXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSkuY2F0Y2goKGVycm9yOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yOiBg5p+l6K+i6aKE5Yi25L2T5L+h5oGv5aSx6LSlOiAke2Vycm9yLm1lc3NhZ2V9YFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICBlcnJvcjogYOmqjOivgemihOWItuS9k+aXtuWPkeeUn+mUmeivrzogJHtlcnJvcn1gXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgdmFsaWRhdGVQcmVmYWJGb3JtYXQocHJlZmFiRGF0YTogYW55KTogeyBpc1ZhbGlkOiBib29sZWFuOyBpc3N1ZXM6IHN0cmluZ1tdOyBub2RlQ291bnQ6IG51bWJlcjsgY29tcG9uZW50Q291bnQ6IG51bWJlciB9IHtcbiAgICAgICAgY29uc3QgaXNzdWVzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICBsZXQgbm9kZUNvdW50ID0gMDtcbiAgICAgICAgbGV0IGNvbXBvbmVudENvdW50ID0gMDtcblxuICAgICAgICAvLyDmo4Dmn6Xln7rmnKznu5PmnoRcbiAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KHByZWZhYkRhdGEpKSB7XG4gICAgICAgICAgICBpc3N1ZXMucHVzaCgn6aKE5Yi25L2T5pWw5o2u5b+F6aG75piv5pWw57uE5qC85byPJyk7XG4gICAgICAgICAgICByZXR1cm4geyBpc1ZhbGlkOiBmYWxzZSwgaXNzdWVzLCBub2RlQ291bnQsIGNvbXBvbmVudENvdW50IH07XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocHJlZmFiRGF0YS5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIGlzc3Vlcy5wdXNoKCfpooTliLbkvZPmlbDmja7kuLrnqbonKTtcbiAgICAgICAgICAgIHJldHVybiB7IGlzVmFsaWQ6IGZhbHNlLCBpc3N1ZXMsIG5vZGVDb3VudCwgY29tcG9uZW50Q291bnQgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIOajgOafpeesrOS4gOS4quWFg+e0oOaYr+WQpuS4uumihOWItuS9k+i1hOS6p1xuICAgICAgICBjb25zdCBmaXJzdEVsZW1lbnQgPSBwcmVmYWJEYXRhWzBdO1xuICAgICAgICBpZiAoIWZpcnN0RWxlbWVudCB8fCBmaXJzdEVsZW1lbnQuX190eXBlX18gIT09ICdjYy5QcmVmYWInKSB7XG4gICAgICAgICAgICBpc3N1ZXMucHVzaCgn56ys5LiA5Liq5YWD57Sg5b+F6aG75pivY2MuUHJlZmFi57G75Z6LJyk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyDnu5/orqHoioLngrnlkoznu4Tku7ZcbiAgICAgICAgcHJlZmFiRGF0YS5mb3JFYWNoKChpdGVtOiBhbnksIGluZGV4OiBudW1iZXIpID0+IHtcbiAgICAgICAgICAgIGlmIChpdGVtLl9fdHlwZV9fID09PSAnY2MuTm9kZScpIHtcbiAgICAgICAgICAgICAgICBub2RlQ291bnQrKztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoaXRlbS5fX3R5cGVfXyAmJiBpdGVtLl9fdHlwZV9fLmluY2x1ZGVzKCdjYy4nKSkge1xuICAgICAgICAgICAgICAgIGNvbXBvbmVudENvdW50Kys7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIOajgOafpeW/heimgeeahOWtl+autVxuICAgICAgICBpZiAobm9kZUNvdW50ID09PSAwKSB7XG4gICAgICAgICAgICBpc3N1ZXMucHVzaCgn6aKE5Yi25L2T5b+F6aG75YyF5ZCr6Iez5bCR5LiA5Liq6IqC54K5Jyk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgaXNWYWxpZDogaXNzdWVzLmxlbmd0aCA9PT0gMCxcbiAgICAgICAgICAgIGlzc3VlcyxcbiAgICAgICAgICAgIG5vZGVDb3VudCxcbiAgICAgICAgICAgIGNvbXBvbmVudENvdW50XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBkdXBsaWNhdGVQcmVmYWIoYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKGFzeW5jIChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHsgc291cmNlUHJlZmFiUGF0aCwgdGFyZ2V0UHJlZmFiUGF0aCwgbmV3UHJlZmFiTmFtZSB9ID0gYXJncztcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAvLyDor7vlj5bmupDpooTliLbkvZNcbiAgICAgICAgICAgICAgICBjb25zdCBzb3VyY2VJbmZvID0gYXdhaXQgdGhpcy5nZXRQcmVmYWJJbmZvKHNvdXJjZVByZWZhYlBhdGgpO1xuICAgICAgICAgICAgICAgIGlmICghc291cmNlSW5mby5zdWNjZXNzKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgICAgICBlcnJvcjogYOaXoOazleivu+WPlua6kOmihOWItuS9kzogJHtzb3VyY2VJbmZvLmVycm9yfWBcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyDor7vlj5bmupDpooTliLbkvZPlhoXlrrlcbiAgICAgICAgICAgICAgICBjb25zdCBzb3VyY2VDb250ZW50ID0gYXdhaXQgdGhpcy5yZWFkUHJlZmFiQ29udGVudChzb3VyY2VQcmVmYWJQYXRoKTtcbiAgICAgICAgICAgICAgICBpZiAoIXNvdXJjZUNvbnRlbnQuc3VjY2Vzcykge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGDml6Dms5Xor7vlj5bmupDpooTliLbkvZPlhoXlrrk6ICR7c291cmNlQ29udGVudC5lcnJvcn1gXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8g55Sf5oiQ5paw55qEVVVJRFxuICAgICAgICAgICAgICAgIGNvbnN0IG5ld1V1aWQgPSB0aGlzLmdlbmVyYXRlVVVJRCgpO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIC8vIOS/ruaUuemihOWItuS9k+aVsOaNrlxuICAgICAgICAgICAgICAgIGNvbnN0IG1vZGlmaWVkRGF0YSA9IHRoaXMubW9kaWZ5UHJlZmFiRm9yRHVwbGljYXRpb24oc291cmNlQ29udGVudC5kYXRhLCBuZXdQcmVmYWJOYW1lLCBuZXdVdWlkKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAvLyDliJvlu7rmlrDnmoRtZXRh5pWw5o2uXG4gICAgICAgICAgICAgICAgY29uc3QgbmV3TWV0YURhdGEgPSB0aGlzLmNyZWF0ZU1ldGFEYXRhKG5ld1ByZWZhYk5hbWUgfHwgJ0R1cGxpY2F0ZWRQcmVmYWInLCBuZXdVdWlkKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAvLyDpooTliLbkvZPlpI3liLblip/og73mmoLml7bnpoHnlKjvvIzlm6DkuLrmtonlj4rlpI3mnYLnmoTluo/liJfljJbmoLzlvI9cbiAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIGVycm9yOiAn6aKE5Yi25L2T5aSN5Yi25Yqf6IO95pqC5pe25LiN5Y+v55SoJyxcbiAgICAgICAgICAgICAgICAgICAgaW5zdHJ1Y3Rpb246ICfor7flnKggQ29jb3MgQ3JlYXRvciDnvJbovpHlmajkuK3miYvliqjlpI3liLbpooTliLbkvZPvvJpcXG4xLiDlnKjotYTmupDnrqHnkIblmajkuK3pgInmi6nopoHlpI3liLbnmoTpooTliLbkvZNcXG4yLiDlj7PplK7pgInmi6nlpI3liLZcXG4zLiDlnKjnm67moIfkvY3nva7nspjotLQnXG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICBlcnJvcjogYOWkjeWItumihOWItuS9k+aXtuWPkeeUn+mUmeivrzogJHtlcnJvcn1gXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgcmVhZFByZWZhYkNvbnRlbnQocHJlZmFiUGF0aDogc3RyaW5nKTogUHJvbWlzZTx7IHN1Y2Nlc3M6IGJvb2xlYW47IGRhdGE/OiBhbnk7IGVycm9yPzogc3RyaW5nIH0+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdyZWFkLWFzc2V0JywgcHJlZmFiUGF0aCkudGhlbigoY29udGVudDogc3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcHJlZmFiRGF0YSA9IEpTT04ucGFyc2UoY29udGVudCk7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoeyBzdWNjZXNzOiB0cnVlLCBkYXRhOiBwcmVmYWJEYXRhIH0pO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKHBhcnNlRXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ+mihOWItuS9k+aWh+S7tuagvOW8j+mUmeivrycgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSkuY2F0Y2goKGVycm9yOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvci5tZXNzYWdlIHx8ICfor7vlj5bpooTliLbkvZPmlofku7blpLHotKUnIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgbW9kaWZ5UHJlZmFiRm9yRHVwbGljYXRpb24ocHJlZmFiRGF0YTogYW55W10sIG5ld05hbWU6IHN0cmluZywgbmV3VXVpZDogc3RyaW5nKTogYW55W10ge1xuICAgICAgICAvLyDkv67mlLnpooTliLbkvZPmlbDmja7ku6XliJvlu7rlia/mnKxcbiAgICAgICAgY29uc3QgbW9kaWZpZWREYXRhID0gWy4uLnByZWZhYkRhdGFdO1xuICAgICAgICBcbiAgICAgICAgLy8g5L+u5pS556ys5LiA5Liq5YWD57Sg77yI6aKE5Yi25L2T6LWE5Lqn77yJXG4gICAgICAgIGlmIChtb2RpZmllZERhdGFbMF0gJiYgbW9kaWZpZWREYXRhWzBdLl9fdHlwZV9fID09PSAnY2MuUHJlZmFiJykge1xuICAgICAgICAgICAgbW9kaWZpZWREYXRhWzBdLl9uYW1lID0gbmV3TmFtZSB8fCAnRHVwbGljYXRlZFByZWZhYic7XG4gICAgICAgIH1cblxuICAgICAgICAvLyDmm7TmlrDmiYDmnIlVVUlE5byV55So77yI566A5YyW54mI5pys77yJXG4gICAgICAgIC8vIOWcqOWunumZheW6lOeUqOS4re+8jOWPr+iDvemcgOimgeabtOWkjeadgueahFVVSUTmmKDlsITlpITnkIZcbiAgICAgICAgXG4gICAgICAgIHJldHVybiBtb2RpZmllZERhdGE7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyByZXN0b3JlUHJlZmFiTm9kZShub2RlVXVpZDogc3RyaW5nLCBhc3NldFV1aWQ6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgLy8gVmVyaWZpZWQgc2lnbmF0dXJlIHBlciBAY29jb3MvY3JlYXRvci10eXBlczogc2NlbmUvcmVzdG9yZS1wcmVmYWJcbiAgICAgICAgICAgIC8vIHRha2VzIGEgc2luZ2xlIFJlc2V0Q29tcG9uZW50T3B0aW9ucyA9IHsgdXVpZDogc3RyaW5nIH0uIFRoZVxuICAgICAgICAgICAgLy8gcHJldmlvdXMgY29kZSBwYXNzZWQgKG5vZGVVdWlkLCBhc3NldFV1aWQpIGFzIHBvc2l0aW9uYWwgYXJncyxcbiAgICAgICAgICAgIC8vIHdoaWNoIHRoZSBBUEkgaWdub3JlcyBhZnRlciB0aGUgZmlyc3Qgb25lIGFuZCBzaWxlbnRseSBtaXNyb3V0ZXMuXG4gICAgICAgICAgICAvLyBhc3NldFV1aWQgaXMgcHJlc2VydmVkIG9uIHRoZSByZXF1ZXN0IHNoYXBlIGZvciByZXNwb25zZSBjb250ZXh0XG4gICAgICAgICAgICAvLyBidXQgZG9lcyBub3QgZmxvdyBpbnRvIHRoZSBlZGl0b3IgbWVzc2FnZS5cbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3Jlc3RvcmUtcHJlZmFiJywgeyB1dWlkOiBub2RlVXVpZCB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWQ6IG5vZGVVdWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgYXNzZXRVdWlkOiBhc3NldFV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiAn6aKE5Yi25L2T6IqC54K56L+Y5Y6f5oiQ5YqfJ1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyb3I6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGDpooTliLbkvZPoioLngrnov5jljp/lpLHotKU6ICR7ZXJyb3IubWVzc2FnZX1gXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG59Il19