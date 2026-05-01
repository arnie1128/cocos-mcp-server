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
        folder: schema_1.z.string().default('db://assets').describe('db:// folder to scan for prefabs. Default db://assets.'),
    }),
    load_prefab: schema_1.z.object({
        prefabPath: schema_1.z.string().describe('Prefab db:// path. Reads metadata only; does not instantiate.'),
    }),
    instantiate_prefab: schema_1.z.object({
        prefabPath: schema_1.z.string().describe('Prefab db:// path to instantiate.'),
        parentUuid: schema_1.z.string().optional().describe('Parent node UUID. Omit to let Cocos choose the default parent.'),
        position: prefabPositionSchema.optional().describe('Initial local position for the created prefab instance.'),
    }),
    create_prefab: schema_1.z.object({
        nodeUuid: schema_1.z.string().describe('Source node UUID to convert into a prefab, including children and components.'),
        savePath: schema_1.z.string().describe('Target prefab db:// path. Pass a full .prefab path or a folder.'),
        prefabName: schema_1.z.string().describe('Prefab name; used as filename when savePath is a folder.'),
    }),
    update_prefab: schema_1.z.object({
        prefabPath: schema_1.z.string().describe('Prefab asset path for response context; apply uses nodeUuid linked prefab data.'),
        nodeUuid: schema_1.z.string().describe('Modified prefab instance node UUID to apply back to its linked prefab.'),
    }),
    revert_prefab: schema_1.z.object({
        nodeUuid: schema_1.z.string().describe('Prefab instance node UUID to restore from its linked asset.'),
    }),
    get_prefab_info: schema_1.z.object({
        prefabPath: schema_1.z.string().describe('Prefab asset db:// path.'),
    }),
    validate_prefab: schema_1.z.object({
        prefabPath: schema_1.z.string().describe('Prefab db:// path whose JSON structure should be checked.'),
    }),
    restore_prefab_node: schema_1.z.object({
        nodeUuid: schema_1.z.string().describe('Prefab instance node UUID passed to scene/restore-prefab.'),
        assetUuid: schema_1.z.string().describe('Prefab asset UUID kept for response context; Cocos restore-prefab uses nodeUuid only.'),
    }),
    set_link: schema_1.z.object({
        mode: schema_1.z.enum(['link', 'unlink']).describe('Operation: "link" attaches a regular node to a prefab asset; "unlink" detaches a prefab instance.'),
        nodeUuid: schema_1.z.string().describe('Node UUID. For mode="link", the node to attach; for mode="unlink", the prefab instance to detach.'),
        assetUuid: schema_1.z.string().optional().describe('Prefab asset UUID. Required when mode="link"; ignored when mode="unlink".'),
        removeNested: schema_1.z.boolean().default(false).describe('When mode="unlink", also unlink nested prefab instances under this node. Ignored when mode="link".'),
    }),
    get_prefab_data: schema_1.z.object({
        nodeUuid: schema_1.z.string().describe('Prefab instance node UUID whose prefab dump should be read.'),
    }),
};
const prefabToolMeta = {
    get_prefab_list: 'List .prefab assets under a folder with name/path/uuid. No scene or asset mutation. Also exposed as resource cocos://prefabs (default folder=db://assets) and cocos://prefabs{?folder} template; prefer the resource when the client supports MCP resources.',
    load_prefab: 'Read prefab asset metadata only. Does not instantiate; use instantiate_prefab or create_node assetUuid/assetPath to add one to the scene.',
    instantiate_prefab: 'Instantiate a prefab into the current scene; mutates scene and preserves prefab link.',
    create_prefab: 'Create a prefab asset from a scene node via cce.Prefab.createPrefab facade.',
    update_prefab: 'Apply prefab instance edits back to its linked prefab asset; prefabPath is context only.',
    revert_prefab: 'Restore a prefab instance from its linked asset; discards unapplied overrides.',
    get_prefab_info: 'Read prefab meta/dependency summary before apply/revert.',
    validate_prefab: 'Run basic prefab JSON structural checks; not byte-level Cocos equivalence.',
    restore_prefab_node: 'Restore a prefab instance through scene/restore-prefab; assetUuid is context only.',
    set_link: 'Attach or detach a prefab link on a node (mode="link" wraps cce.SceneFacade.linkPrefab; mode="unlink" wraps cce.SceneFacade.unlinkPrefab).',
    get_prefab_data: 'Read facade prefab dump for a prefab instance node. No mutation; useful for inspecting instance/link serialized data.',
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
            case 'restore_prefab_node':
                return await this.restorePrefabNode(a.nodeUuid, a.assetUuid);
            case 'set_link':
                return await this.setLink(a);
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
                // 獲取預製體資源信息
                const assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', args.prefabPath);
                if (!assetInfo) {
                    throw new Error('預製體未找到');
                }
                // 使用正確的 create-node API 從預製體資源實例化
                const createNodeOptions = {
                    assetUuid: assetInfo.uuid
                };
                // 設置父節點
                if (args.parentUuid) {
                    createNodeOptions.parent = args.parentUuid;
                }
                // 設置節點名稱
                if (args.name) {
                    createNodeOptions.name = args.name;
                }
                else if (assetInfo.name) {
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
                (0, log_1.debugLog)('預製體節點創建成功:', {
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
                        message: '預製體實例化成功，已建立預製體關聯'
                    }
                });
            }
            catch (err) {
                resolve({
                    success: false,
                    error: `預製體實例化失敗: ${err.message}`,
                    instruction: '請檢查預製體路徑是否正確，確保預製體文件格式正確'
                });
            }
        });
    }
    async createPrefab(args) {
        return new Promise(async (resolve) => {
            var _a, _b;
            try {
                // 支持 prefabPath 和 savePath 兩種參數名
                const pathParam = args.prefabPath || args.savePath;
                if (!pathParam) {
                    resolve({
                        success: false,
                        error: '缺少預製體路徑參數。請提供 prefabPath 或 savePath。'
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
                    error: `創建預製體時發生錯誤: ${error}`
                });
            }
        });
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
    async setLink(a) {
        if (a.mode === 'link') {
            if (!a.assetUuid) {
                return { success: false, error: 'set_link with mode="link" requires assetUuid' };
            }
            return (0, scene_bridge_1.runSceneMethodAsToolResponse)('linkPrefab', [a.nodeUuid, a.assetUuid]);
        }
        return (0, scene_bridge_1.runSceneMethodAsToolResponse)('unlinkPrefab', [a.nodeUuid, a.removeNested]);
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
                // 讀取預製體文件內容
                Editor.Message.request('asset-db', 'query-asset-info', prefabPath).then((assetInfo) => {
                    if (!assetInfo) {
                        resolve({
                            success: false,
                            error: '預製體文件不存在'
                        });
                        return;
                    }
                    // 驗證預製體格式
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
                                    message: validationResult.isValid ? '預製體格式有效' : '預製體格式存在問題'
                                }
                            });
                        }
                        catch (parseError) {
                            resolve({
                                success: false,
                                error: '預製體文件格式錯誤，無法解析JSON'
                            });
                        }
                    }).catch((error) => {
                        resolve({
                            success: false,
                            error: `讀取預製體文件失敗: ${error.message}`
                        });
                    });
                }).catch((error) => {
                    resolve({
                        success: false,
                        error: `查詢預製體信息失敗: ${error.message}`
                    });
                });
            }
            catch (error) {
                resolve({
                    success: false,
                    error: `驗證預製體時發生錯誤: ${error}`
                });
            }
        });
    }
    validatePrefabFormat(prefabData) {
        const issues = [];
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
        prefabData.forEach((item, index) => {
            if (item.__type__ === 'cc.Node') {
                nodeCount++;
            }
            else if (item.__type__ && item.__type__.includes('cc.')) {
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
                        message: '預製體節點還原成功'
                    }
                });
            }).catch((error) => {
                resolve({
                    success: false,
                    error: `預製體節點還原失敗: ${error.message}`
                });
            });
        });
    }
}
exports.PrefabTools = PrefabTools;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJlZmFiLXRvb2xzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL3Rvb2xzL3ByZWZhYi10b29scy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSxvQ0FBc0M7QUFDdEMsMENBQStEO0FBQy9ELHNEQUFtRTtBQUVuRSxNQUFNLG9CQUFvQixHQUFHLFVBQUMsQ0FBQyxNQUFNLENBQUM7SUFDbEMsQ0FBQyxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLEVBQUU7SUFDeEIsQ0FBQyxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLEVBQUU7SUFDeEIsQ0FBQyxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLEVBQUU7Q0FDM0IsQ0FBQyxDQUFDO0FBRUgsTUFBTSxhQUFhLEdBQUc7SUFDbEIsZUFBZSxFQUFFLFVBQUMsQ0FBQyxNQUFNLENBQUM7UUFDdEIsTUFBTSxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLENBQUMsUUFBUSxDQUFDLHdEQUF3RCxDQUFDO0tBQy9HLENBQUM7SUFDRixXQUFXLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQztRQUNsQixVQUFVLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQywrREFBK0QsQ0FBQztLQUNuRyxDQUFDO0lBQ0Ysa0JBQWtCLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQztRQUN6QixVQUFVLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyxtQ0FBbUMsQ0FBQztRQUNwRSxVQUFVLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsRUFBRSxDQUFDLFFBQVEsQ0FBQyxnRUFBZ0UsQ0FBQztRQUM1RyxRQUFRLEVBQUUsb0JBQW9CLENBQUMsUUFBUSxFQUFFLENBQUMsUUFBUSxDQUFDLHlEQUF5RCxDQUFDO0tBQ2hILENBQUM7SUFD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RSxLQUFLO29CQUNkLEtBQUssRUFBRSxjQUFjLEtBQUssQ0FBQyxPQUFPLEVBQUU7aUJBQ3ZDLENBQUMsQ0FBQztZQUNQLENBQUMsQ0FBQyxDQUFDO1FBQ1AsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDO0NBRUo7QUFsYUQsa0NBa2FDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgVG9vbERlZmluaXRpb24sIFRvb2xSZXNwb25zZSwgVG9vbEV4ZWN1dG9yLCBQcmVmYWJJbmZvIH0gZnJvbSAnLi4vdHlwZXMnO1xuaW1wb3J0IHsgZGVidWdMb2cgfSBmcm9tICcuLi9saWIvbG9nJztcbmltcG9ydCB7IHosIHRvSW5wdXRTY2hlbWEsIHZhbGlkYXRlQXJncyB9IGZyb20gJy4uL2xpYi9zY2hlbWEnO1xuaW1wb3J0IHsgcnVuU2NlbmVNZXRob2RBc1Rvb2xSZXNwb25zZSB9IGZyb20gJy4uL2xpYi9zY2VuZS1icmlkZ2UnO1xuXG5jb25zdCBwcmVmYWJQb3NpdGlvblNjaGVtYSA9IHoub2JqZWN0KHtcbiAgICB4OiB6Lm51bWJlcigpLm9wdGlvbmFsKCksXG4gICAgeTogei5udW1iZXIoKS5vcHRpb25hbCgpLFxuICAgIHo6IHoubnVtYmVyKCkub3B0aW9uYWwoKSxcbn0pO1xuXG5jb25zdCBwcmVmYWJTY2hlbWFzID0ge1xuICAgIGdldF9wcmVmYWJfbGlzdDogei5vYmplY3Qoe1xuICAgICAgICBmb2xkZXI6IHouc3RyaW5nKCkuZGVmYXVsdCgnZGI6Ly9hc3NldHMnKS5kZXNjcmliZSgnZGI6Ly8gZm9sZGVyIHRvIHNjYW4gZm9yIHByZWZhYnMuIERlZmF1bHQgZGI6Ly9hc3NldHMuJyksXG4gICAgfSksXG4gICAgbG9hZF9wcmVmYWI6IHoub2JqZWN0KHtcbiAgICAgICAgcHJlZmFiUGF0aDogei5zdHJpbmcoKS5kZXNjcmliZSgnUHJlZmFiIGRiOi8vIHBhdGguIFJlYWRzIG1ldGFkYXRhIG9ubHk7IGRvZXMgbm90IGluc3RhbnRpYXRlLicpLFxuICAgIH0pLFxuICAgIGluc3RhbnRpYXRlX3ByZWZhYjogei5vYmplY3Qoe1xuICAgICAgICBwcmVmYWJQYXRoOiB6LnN0cmluZygpLmRlc2NyaWJlKCdQcmVmYWIgZGI6Ly8gcGF0aCB0byBpbnN0YW50aWF0ZS4nKSxcbiAgICAgICAgcGFyZW50VXVpZDogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdQYXJlbnQgbm9kZSBVVUlELiBPbWl0IHRvIGxldCBDb2NvcyBjaG9vc2UgdGhlIGRlZmF1bHQgcGFyZW50LicpLFxuICAgICAgICBwb3NpdGlvbjogcHJlZmFiUG9zaXRpb25TY2hlbWEub3B0aW9uYWwoKS5kZXNjcmliZSgnSW5pdGlhbCBsb2NhbCBwb3NpdGlvbiBmb3IgdGhlIGNyZWF0ZWQgcHJlZmFiIGluc3RhbmNlLicpLFxuICAgIH0pLFxuICAgIGNyZWF0ZV9wcmVmYWI6IHoub2JqZWN0KHtcbiAgICAgICAgbm9kZVV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1NvdXJjZSBub2RlIFVVSUQgdG8gY29udmVydCBpbnRvIGEgcHJlZmFiLCBpbmNsdWRpbmcgY2hpbGRyZW4gYW5kIGNvbXBvbmVudHMuJyksXG4gICAgICAgIHNhdmVQYXRoOiB6LnN0cmluZygpLmRlc2NyaWJlKCdUYXJnZXQgcHJlZmFiIGRiOi8vIHBhdGguIFBhc3MgYSBmdWxsIC5wcmVmYWIgcGF0aCBvciBhIGZvbGRlci4nKSxcbiAgICAgICAgcHJlZmFiTmFtZTogei5zdHJpbmcoKS5kZXNjcmliZSgnUHJlZmFiIG5hbWU7IHVzZWQgYXMgZmlsZW5hbWUgd2hlbiBzYXZlUGF0aCBpcyBhIGZvbGRlci4nKSxcbiAgICB9KSxcbiAgICB1cGRhdGVfcHJlZmFiOiB6Lm9iamVjdCh7XG4gICAgICAgIHByZWZhYlBhdGg6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1ByZWZhYiBhc3NldCBwYXRoIGZvciByZXNwb25zZSBjb250ZXh0OyBhcHBseSB1c2VzIG5vZGVVdWlkIGxpbmtlZCBwcmVmYWIgZGF0YS4nKSxcbiAgICAgICAgbm9kZVV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ01vZGlmaWVkIHByZWZhYiBpbnN0YW5jZSBub2RlIFVVSUQgdG8gYXBwbHkgYmFjayB0byBpdHMgbGlua2VkIHByZWZhYi4nKSxcbiAgICB9KSxcbiAgICByZXZlcnRfcHJlZmFiOiB6Lm9iamVjdCh7XG4gICAgICAgIG5vZGVVdWlkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdQcmVmYWIgaW5zdGFuY2Ugbm9kZSBVVUlEIHRvIHJlc3RvcmUgZnJvbSBpdHMgbGlua2VkIGFzc2V0LicpLFxuICAgIH0pLFxuICAgIGdldF9wcmVmYWJfaW5mbzogei5vYmplY3Qoe1xuICAgICAgICBwcmVmYWJQYXRoOiB6LnN0cmluZygpLmRlc2NyaWJlKCdQcmVmYWIgYXNzZXQgZGI6Ly8gcGF0aC4nKSxcbiAgICB9KSxcbiAgICB2YWxpZGF0ZV9wcmVmYWI6IHoub2JqZWN0KHtcbiAgICAgICAgcHJlZmFiUGF0aDogei5zdHJpbmcoKS5kZXNjcmliZSgnUHJlZmFiIGRiOi8vIHBhdGggd2hvc2UgSlNPTiBzdHJ1Y3R1cmUgc2hvdWxkIGJlIGNoZWNrZWQuJyksXG4gICAgfSksXG4gICAgcmVzdG9yZV9wcmVmYWJfbm9kZTogei5vYmplY3Qoe1xuICAgICAgICBub2RlVXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnUHJlZmFiIGluc3RhbmNlIG5vZGUgVVVJRCBwYXNzZWQgdG8gc2NlbmUvcmVzdG9yZS1wcmVmYWIuJyksXG4gICAgICAgIGFzc2V0VXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnUHJlZmFiIGFzc2V0IFVVSUQga2VwdCBmb3IgcmVzcG9uc2UgY29udGV4dDsgQ29jb3MgcmVzdG9yZS1wcmVmYWIgdXNlcyBub2RlVXVpZCBvbmx5LicpLFxuICAgIH0pLFxuICAgIHNldF9saW5rOiB6Lm9iamVjdCh7XG4gICAgICAgIG1vZGU6IHouZW51bShbJ2xpbmsnLCAndW5saW5rJ10pLmRlc2NyaWJlKCdPcGVyYXRpb246IFwibGlua1wiIGF0dGFjaGVzIGEgcmVndWxhciBub2RlIHRvIGEgcHJlZmFiIGFzc2V0OyBcInVubGlua1wiIGRldGFjaGVzIGEgcHJlZmFiIGluc3RhbmNlLicpLFxuICAgICAgICBub2RlVXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnTm9kZSBVVUlELiBGb3IgbW9kZT1cImxpbmtcIiwgdGhlIG5vZGUgdG8gYXR0YWNoOyBmb3IgbW9kZT1cInVubGlua1wiLCB0aGUgcHJlZmFiIGluc3RhbmNlIHRvIGRldGFjaC4nKSxcbiAgICAgICAgYXNzZXRVdWlkOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1ByZWZhYiBhc3NldCBVVUlELiBSZXF1aXJlZCB3aGVuIG1vZGU9XCJsaW5rXCI7IGlnbm9yZWQgd2hlbiBtb2RlPVwidW5saW5rXCIuJyksXG4gICAgICAgIHJlbW92ZU5lc3RlZDogei5ib29sZWFuKCkuZGVmYXVsdChmYWxzZSkuZGVzY3JpYmUoJ1doZW4gbW9kZT1cInVubGlua1wiLCBhbHNvIHVubGluayBuZXN0ZWQgcHJlZmFiIGluc3RhbmNlcyB1bmRlciB0aGlzIG5vZGUuIElnbm9yZWQgd2hlbiBtb2RlPVwibGlua1wiLicpLFxuICAgIH0pLFxuICAgIGdldF9wcmVmYWJfZGF0YTogei5vYmplY3Qoe1xuICAgICAgICBub2RlVXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnUHJlZmFiIGluc3RhbmNlIG5vZGUgVVVJRCB3aG9zZSBwcmVmYWIgZHVtcCBzaG91bGQgYmUgcmVhZC4nKSxcbiAgICB9KSxcbn0gYXMgY29uc3Q7XG5cbmNvbnN0IHByZWZhYlRvb2xNZXRhOiBSZWNvcmQ8a2V5b2YgdHlwZW9mIHByZWZhYlNjaGVtYXMsIHN0cmluZz4gPSB7XG4gICAgZ2V0X3ByZWZhYl9saXN0OiAnTGlzdCAucHJlZmFiIGFzc2V0cyB1bmRlciBhIGZvbGRlciB3aXRoIG5hbWUvcGF0aC91dWlkLiBObyBzY2VuZSBvciBhc3NldCBtdXRhdGlvbi4gQWxzbyBleHBvc2VkIGFzIHJlc291cmNlIGNvY29zOi8vcHJlZmFicyAoZGVmYXVsdCBmb2xkZXI9ZGI6Ly9hc3NldHMpIGFuZCBjb2NvczovL3ByZWZhYnN7P2ZvbGRlcn0gdGVtcGxhdGU7IHByZWZlciB0aGUgcmVzb3VyY2Ugd2hlbiB0aGUgY2xpZW50IHN1cHBvcnRzIE1DUCByZXNvdXJjZXMuJyxcbiAgICBsb2FkX3ByZWZhYjogJ1JlYWQgcHJlZmFiIGFzc2V0IG1ldGFkYXRhIG9ubHkuIERvZXMgbm90IGluc3RhbnRpYXRlOyB1c2UgaW5zdGFudGlhdGVfcHJlZmFiIG9yIGNyZWF0ZV9ub2RlIGFzc2V0VXVpZC9hc3NldFBhdGggdG8gYWRkIG9uZSB0byB0aGUgc2NlbmUuJyxcbiAgICBpbnN0YW50aWF0ZV9wcmVmYWI6ICdJbnN0YW50aWF0ZSBhIHByZWZhYiBpbnRvIHRoZSBjdXJyZW50IHNjZW5lOyBtdXRhdGVzIHNjZW5lIGFuZCBwcmVzZXJ2ZXMgcHJlZmFiIGxpbmsuJyxcbiAgICBjcmVhdGVfcHJlZmFiOiAnQ3JlYXRlIGEgcHJlZmFiIGFzc2V0IGZyb20gYSBzY2VuZSBub2RlIHZpYSBjY2UuUHJlZmFiLmNyZWF0ZVByZWZhYiBmYWNhZGUuJyxcbiAgICB1cGRhdGVfcHJlZmFiOiAnQXBwbHkgcHJlZmFiIGluc3RhbmNlIGVkaXRzIGJhY2sgdG8gaXRzIGxpbmtlZCBwcmVmYWIgYXNzZXQ7IHByZWZhYlBhdGggaXMgY29udGV4dCBvbmx5LicsXG4gICAgcmV2ZXJ0X3ByZWZhYjogJ1Jlc3RvcmUgYSBwcmVmYWIgaW5zdGFuY2UgZnJvbSBpdHMgbGlua2VkIGFzc2V0OyBkaXNjYXJkcyB1bmFwcGxpZWQgb3ZlcnJpZGVzLicsXG4gICAgZ2V0X3ByZWZhYl9pbmZvOiAnUmVhZCBwcmVmYWIgbWV0YS9kZXBlbmRlbmN5IHN1bW1hcnkgYmVmb3JlIGFwcGx5L3JldmVydC4nLFxuICAgIHZhbGlkYXRlX3ByZWZhYjogJ1J1biBiYXNpYyBwcmVmYWIgSlNPTiBzdHJ1Y3R1cmFsIGNoZWNrczsgbm90IGJ5dGUtbGV2ZWwgQ29jb3MgZXF1aXZhbGVuY2UuJyxcbiAgICByZXN0b3JlX3ByZWZhYl9ub2RlOiAnUmVzdG9yZSBhIHByZWZhYiBpbnN0YW5jZSB0aHJvdWdoIHNjZW5lL3Jlc3RvcmUtcHJlZmFiOyBhc3NldFV1aWQgaXMgY29udGV4dCBvbmx5LicsXG4gICAgc2V0X2xpbms6ICdBdHRhY2ggb3IgZGV0YWNoIGEgcHJlZmFiIGxpbmsgb24gYSBub2RlIChtb2RlPVwibGlua1wiIHdyYXBzIGNjZS5TY2VuZUZhY2FkZS5saW5rUHJlZmFiOyBtb2RlPVwidW5saW5rXCIgd3JhcHMgY2NlLlNjZW5lRmFjYWRlLnVubGlua1ByZWZhYikuJyxcbiAgICBnZXRfcHJlZmFiX2RhdGE6ICdSZWFkIGZhY2FkZSBwcmVmYWIgZHVtcCBmb3IgYSBwcmVmYWIgaW5zdGFuY2Ugbm9kZS4gTm8gbXV0YXRpb247IHVzZWZ1bCBmb3IgaW5zcGVjdGluZyBpbnN0YW5jZS9saW5rIHNlcmlhbGl6ZWQgZGF0YS4nLFxufTtcblxuZXhwb3J0IGNsYXNzIFByZWZhYlRvb2xzIGltcGxlbWVudHMgVG9vbEV4ZWN1dG9yIHtcbiAgICBnZXRUb29scygpOiBUb29sRGVmaW5pdGlvbltdIHtcbiAgICAgICAgcmV0dXJuIChPYmplY3Qua2V5cyhwcmVmYWJTY2hlbWFzKSBhcyBBcnJheTxrZXlvZiB0eXBlb2YgcHJlZmFiU2NoZW1hcz4pLm1hcChuYW1lID0+ICh7XG4gICAgICAgICAgICBuYW1lLFxuICAgICAgICAgICAgZGVzY3JpcHRpb246IHByZWZhYlRvb2xNZXRhW25hbWVdLFxuICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHRvSW5wdXRTY2hlbWEocHJlZmFiU2NoZW1hc1tuYW1lXSksXG4gICAgICAgIH0pKTtcbiAgICB9XG5cbiAgICBhc3luYyBleGVjdXRlKHRvb2xOYW1lOiBzdHJpbmcsIGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHNjaGVtYU5hbWUgPSB0b29sTmFtZSBhcyBrZXlvZiB0eXBlb2YgcHJlZmFiU2NoZW1hcztcbiAgICAgICAgY29uc3Qgc2NoZW1hID0gcHJlZmFiU2NoZW1hc1tzY2hlbWFOYW1lXTtcbiAgICAgICAgaWYgKCFzY2hlbWEpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5rbm93biB0b29sOiAke3Rvb2xOYW1lfWApO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHZhbGlkYXRpb24gPSB2YWxpZGF0ZUFyZ3Moc2NoZW1hLCBhcmdzID8/IHt9KTtcbiAgICAgICAgaWYgKCF2YWxpZGF0aW9uLm9rKSB7XG4gICAgICAgICAgICByZXR1cm4gdmFsaWRhdGlvbi5yZXNwb25zZTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBhID0gdmFsaWRhdGlvbi5kYXRhIGFzIGFueTtcblxuICAgICAgICBzd2l0Y2ggKHNjaGVtYU5hbWUpIHtcbiAgICAgICAgICAgIGNhc2UgJ2dldF9wcmVmYWJfbGlzdCc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuZ2V0UHJlZmFiTGlzdChhLmZvbGRlcik7XG4gICAgICAgICAgICBjYXNlICdsb2FkX3ByZWZhYic6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMubG9hZFByZWZhYihhLnByZWZhYlBhdGgpO1xuICAgICAgICAgICAgY2FzZSAnaW5zdGFudGlhdGVfcHJlZmFiJzpcbiAgICAgICAgICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5pbnN0YW50aWF0ZVByZWZhYihhKTtcbiAgICAgICAgICAgIGNhc2UgJ2NyZWF0ZV9wcmVmYWInOlxuICAgICAgICAgICAgICAgIHJldHVybiBhd2FpdCB0aGlzLmNyZWF0ZVByZWZhYihhKTtcbiAgICAgICAgICAgIGNhc2UgJ3VwZGF0ZV9wcmVmYWInOlxuICAgICAgICAgICAgICAgIHJldHVybiBhd2FpdCB0aGlzLnVwZGF0ZVByZWZhYihhLnByZWZhYlBhdGgsIGEubm9kZVV1aWQpO1xuICAgICAgICAgICAgY2FzZSAncmV2ZXJ0X3ByZWZhYic6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMucmV2ZXJ0UHJlZmFiKGEubm9kZVV1aWQpO1xuICAgICAgICAgICAgY2FzZSAnZ2V0X3ByZWZhYl9pbmZvJzpcbiAgICAgICAgICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5nZXRQcmVmYWJJbmZvKGEucHJlZmFiUGF0aCk7XG4gICAgICAgICAgICBjYXNlICd2YWxpZGF0ZV9wcmVmYWInOlxuICAgICAgICAgICAgICAgIHJldHVybiBhd2FpdCB0aGlzLnZhbGlkYXRlUHJlZmFiKGEucHJlZmFiUGF0aCk7XG4gICAgICAgICAgICBjYXNlICdyZXN0b3JlX3ByZWZhYl9ub2RlJzpcbiAgICAgICAgICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5yZXN0b3JlUHJlZmFiTm9kZShhLm5vZGVVdWlkLCBhLmFzc2V0VXVpZCk7XG4gICAgICAgICAgICBjYXNlICdzZXRfbGluayc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuc2V0TGluayhhKTtcbiAgICAgICAgICAgIGNhc2UgJ2dldF9wcmVmYWJfZGF0YSc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuZ2V0UHJlZmFiRGF0YShhLm5vZGVVdWlkKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2V0UHJlZmFiTGlzdChmb2xkZXI6IHN0cmluZyA9ICdkYjovL2Fzc2V0cycpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHBhdHRlcm4gPSBmb2xkZXIuZW5kc1dpdGgoJy8nKSA/IFxuICAgICAgICAgICAgICAgIGAke2ZvbGRlcn0qKi8qLnByZWZhYmAgOiBgJHtmb2xkZXJ9LyoqLyoucHJlZmFiYDtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXRzJywge1xuICAgICAgICAgICAgICAgIHBhdHRlcm46IHBhdHRlcm5cbiAgICAgICAgICAgIH0pLnRoZW4oKHJlc3VsdHM6IGFueVtdKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgcHJlZmFiczogUHJlZmFiSW5mb1tdID0gcmVzdWx0cy5tYXAoYXNzZXQgPT4gKHtcbiAgICAgICAgICAgICAgICAgICAgbmFtZTogYXNzZXQubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgcGF0aDogYXNzZXQudXJsLFxuICAgICAgICAgICAgICAgICAgICB1dWlkOiBhc3NldC51dWlkLFxuICAgICAgICAgICAgICAgICAgICBmb2xkZXI6IGFzc2V0LnVybC5zdWJzdHJpbmcoMCwgYXNzZXQudXJsLmxhc3RJbmRleE9mKCcvJykpXG4gICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgICAgIHJlc29sdmUoeyBzdWNjZXNzOiB0cnVlLCBkYXRhOiBwcmVmYWJzIH0pO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGxvYWRQcmVmYWIocHJlZmFiUGF0aDogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgLy8gT3JpZ2luYWwgaW1wbGVtZW50YXRpb24gY2FsbGVkIHNjZW5lIGBsb2FkLWFzc2V0YCwgd2hpY2ggaXMgbm90IGEgcmVhbFxuICAgICAgICAvLyBjaGFubmVsIG9uIHRoZSBzY2VuZSBtb2R1bGUgcGVyIEBjb2Nvcy9jcmVhdG9yLXR5cGVzLiBUaGVyZSBpcyBub1xuICAgICAgICAvLyBnZW5lcmljIFwibG9hZCBhIHByZWZhYiB3aXRob3V0IGluc3RhbnRpYXRpbmdcIiBvcGVyYXRpb24gZXhwb3NlZCB0b1xuICAgICAgICAvLyBlZGl0b3IgZXh0ZW5zaW9ucy4gUmV0dXJuIHRoZSBhc3NldCBtZXRhZGF0YSB2aWEgYXNzZXQtZGIgaW5zdGVhZDtcbiAgICAgICAgLy8gY2FsbGVycyB3aG8gYWN0dWFsbHkgd2FudCB0aGUgcHJlZmFiIGluIHRoZSBzY2VuZSBzaG91bGQgdXNlXG4gICAgICAgIC8vIGluc3RhbnRpYXRlX3ByZWZhYi5cbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldC1pbmZvJywgcHJlZmFiUGF0aCkudGhlbigoYXNzZXRJbmZvOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoIWFzc2V0SW5mbykge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgUHJlZmFiIG5vdCBmb3VuZDogJHtwcmVmYWJQYXRofWAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IGFzc2V0SW5mby51dWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogYXNzZXRJbmZvLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICB1cmw6IGFzc2V0SW5mby51cmwsXG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiBhc3NldEluZm8udHlwZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHNvdXJjZTogYXNzZXRJbmZvLnNvdXJjZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdQcmVmYWIgbWV0YWRhdGEgcmV0cmlldmVkIChpbnN0YW50aWF0ZV9wcmVmYWIgdG8gYWRkIGl0IHRvIHRoZSBzY2VuZSknLFxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGluc3RhbnRpYXRlUHJlZmFiKGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZShhc3luYyAocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAvLyDnjbLlj5bpoJDoo73pq5Tos4fmupDkv6Hmga9cbiAgICAgICAgICAgICAgICBjb25zdCBhc3NldEluZm8gPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldC1pbmZvJywgYXJncy5wcmVmYWJQYXRoKTtcbiAgICAgICAgICAgICAgICBpZiAoIWFzc2V0SW5mbykge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ+mgkOijvemrlOacquaJvuWIsCcpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIOS9v+eUqOato+eiuueahCBjcmVhdGUtbm9kZSBBUEkg5b6e6aCQ6KO96auU6LOH5rqQ5a+m5L6L5YyWXG4gICAgICAgICAgICAgICAgY29uc3QgY3JlYXRlTm9kZU9wdGlvbnM6IGFueSA9IHtcbiAgICAgICAgICAgICAgICAgICAgYXNzZXRVdWlkOiBhc3NldEluZm8udXVpZFxuICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgICAvLyDoqK3nva7niLbnr4Dpu55cbiAgICAgICAgICAgICAgICBpZiAoYXJncy5wYXJlbnRVdWlkKSB7XG4gICAgICAgICAgICAgICAgICAgIGNyZWF0ZU5vZGVPcHRpb25zLnBhcmVudCA9IGFyZ3MucGFyZW50VXVpZDtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyDoqK3nva7nr4Dpu57lkI3nqLFcbiAgICAgICAgICAgICAgICBpZiAoYXJncy5uYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgIGNyZWF0ZU5vZGVPcHRpb25zLm5hbWUgPSBhcmdzLm5hbWU7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChhc3NldEluZm8ubmFtZSkge1xuICAgICAgICAgICAgICAgICAgICBjcmVhdGVOb2RlT3B0aW9ucy5uYW1lID0gYXNzZXRJbmZvLm5hbWU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8g6Kit572u5Yid5aeL5bGs5oCn77yI5aaC5L2N572u77yJXG4gICAgICAgICAgICAgICAgaWYgKGFyZ3MucG9zaXRpb24pIHtcbiAgICAgICAgICAgICAgICAgICAgY3JlYXRlTm9kZU9wdGlvbnMuZHVtcCA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHBvc2l0aW9uOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWU6IGFyZ3MucG9zaXRpb25cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyDlibXlu7rnr4Dpu55cbiAgICAgICAgICAgICAgICBjb25zdCBub2RlVXVpZCA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ2NyZWF0ZS1ub2RlJywgY3JlYXRlTm9kZU9wdGlvbnMpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHV1aWQgPSBBcnJheS5pc0FycmF5KG5vZGVVdWlkKSA/IG5vZGVVdWlkWzBdIDogbm9kZVV1aWQ7XG5cbiAgICAgICAgICAgICAgICAvLyDms6jmhI/vvJpjcmVhdGUtbm9kZSBBUEnlvp7poJDoo73pq5Tos4fmupDlibXlu7rmmYLmh4noqbLoh6rli5Xlu7rnq4vpoJDoo73pq5Tpl5zoga9cbiAgICAgICAgICAgICAgICBkZWJ1Z0xvZygn6aCQ6KO96auU56+A6bue5Ym15bu65oiQ5YqfOicsIHtcbiAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWQ6IHV1aWQsXG4gICAgICAgICAgICAgICAgICAgIHByZWZhYlV1aWQ6IGFzc2V0SW5mby51dWlkLFxuICAgICAgICAgICAgICAgICAgICBwcmVmYWJQYXRoOiBhcmdzLnByZWZhYlBhdGhcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWQ6IHV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBwcmVmYWJQYXRoOiBhcmdzLnByZWZhYlBhdGgsXG4gICAgICAgICAgICAgICAgICAgICAgICBwYXJlbnRVdWlkOiBhcmdzLnBhcmVudFV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBwb3NpdGlvbjogYXJncy5wb3NpdGlvbixcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICfpoJDoo73pq5Tlr6bkvovljJbmiJDlip/vvIzlt7Llu7rnq4vpoJDoo73pq5Tpl5zoga8nXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7IFxuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSwgXG4gICAgICAgICAgICAgICAgICAgIGVycm9yOiBg6aCQ6KO96auU5a+m5L6L5YyW5aSx5pWXOiAke2Vyci5tZXNzYWdlfWAsXG4gICAgICAgICAgICAgICAgICAgIGluc3RydWN0aW9uOiAn6KuL5qqi5p+l6aCQ6KO96auU6Lev5b6R5piv5ZCm5q2j56K677yM56K65L+d6aCQ6KO96auU5paH5Lu25qC85byP5q2j56K6J1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGNyZWF0ZVByZWZhYihhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoYXN5bmMgKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgLy8g5pSv5oyBIHByZWZhYlBhdGgg5ZKMIHNhdmVQYXRoIOWFqeeoruWPg+aVuOWQjVxuICAgICAgICAgICAgICAgIGNvbnN0IHBhdGhQYXJhbSA9IGFyZ3MucHJlZmFiUGF0aCB8fCBhcmdzLnNhdmVQYXRoO1xuICAgICAgICAgICAgICAgIGlmICghcGF0aFBhcmFtKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgICAgICBlcnJvcjogJ+e8uuWwkemgkOijvemrlOi3r+W+keWPg+aVuOOAguiri+aPkOS+myBwcmVmYWJQYXRoIOaIliBzYXZlUGF0aOOAgidcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBjb25zdCBwcmVmYWJOYW1lID0gYXJncy5wcmVmYWJOYW1lIHx8ICdOZXdQcmVmYWInO1xuICAgICAgICAgICAgICAgIGNvbnN0IGZ1bGxQYXRoID0gcGF0aFBhcmFtLmVuZHNXaXRoKCcucHJlZmFiJykgP1xuICAgICAgICAgICAgICAgICAgICBwYXRoUGFyYW0gOiBgJHtwYXRoUGFyYW19LyR7cHJlZmFiTmFtZX0ucHJlZmFiYDtcblxuICAgICAgICAgICAgICAgIC8vIFRoZSBvZmZpY2lhbCBzY2VuZS1mYWNhZGUgcGF0aCAoY2NlLlByZWZhYi5jcmVhdGVQcmVmYWIgdmlhXG4gICAgICAgICAgICAgICAgLy8gZXhlY3V0ZS1zY2VuZS1zY3JpcHQpLiBUaGUgbGVnYWN5IGhhbmQtcm9sbGVkIEpTT04gZmFsbGJhY2tcbiAgICAgICAgICAgICAgICAvLyAoY3JlYXRlUHJlZmFiV2l0aEFzc2V0REIgLyBjcmVhdGVQcmVmYWJOYXRpdmUgLyBjcmVhdGVQcmVmYWJDdXN0b20sXG4gICAgICAgICAgICAgICAgLy8gfjI1MCBzb3VyY2UgbGluZXMpIHdhcyByZW1vdmVkIGluIHYyLjEuMyDigJQgc2VlIGNvbW1pdCA1NDcxMTViXG4gICAgICAgICAgICAgICAgLy8gZm9yIHRoZSBwcmUtcmVtb3ZhbCBzb3VyY2UgaWYgYSBmdXR1cmUgQ29jb3MgQ3JlYXRvciBidWlsZFxuICAgICAgICAgICAgICAgIC8vIGJyZWFrcyB0aGUgZmFjYWRlIHBhdGguIFRoZSBmYWNhZGUgaGFzIGJlZW4gdGhlIG9ubHkgcGF0aFxuICAgICAgICAgICAgICAgIC8vIGV4ZXJjaXNlZCBpbiB2Mi4xLjEgLyB2Mi4xLjIgcmVhbC1lZGl0b3IgdGVzdGluZyBhY3Jvc3NcbiAgICAgICAgICAgICAgICAvLyBzaW1wbGUgYW5kIGNvbXBsZXggKG5lc3RlZCArIG11bHRpLWNvbXBvbmVudCkgcHJlZmFiIGZvcm1zLlxuICAgICAgICAgICAgICAgIGRlYnVnTG9nKCdDYWxsaW5nIHNjZW5lLXNjcmlwdCBjY2UuUHJlZmFiLmNyZWF0ZVByZWZhYi4uLicpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGZhY2FkZVJlc3VsdCA9IGF3YWl0IHJ1blNjZW5lTWV0aG9kQXNUb29sUmVzcG9uc2UoJ2NyZWF0ZVByZWZhYkZyb21Ob2RlJywgW2FyZ3Mubm9kZVV1aWQsIGZ1bGxQYXRoXSk7XG4gICAgICAgICAgICAgICAgaWYgKCFmYWNhZGVSZXN1bHQuc3VjY2Vzcykge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKGZhY2FkZVJlc3VsdCk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncmVmcmVzaC1hc3NldCcsIGZ1bGxQYXRoKTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChyZWZyZXNoRXJyOiBhbnkpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYHJlZnJlc2gtYXNzZXQgYWZ0ZXIgZmFjYWRlIGNyZWF0ZVByZWZhYiBmYWlsZWQgKG5vbi1mYXRhbCk6ICR7cmVmcmVzaEVycj8ubWVzc2FnZSA/PyByZWZyZXNoRXJyfWApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgLi4uZmFjYWRlUmVzdWx0LFxuICAgICAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAuLi4oZmFjYWRlUmVzdWx0LmRhdGEgPz8ge30pLFxuICAgICAgICAgICAgICAgICAgICAgICAgcHJlZmFiTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHByZWZhYlBhdGg6IGZ1bGxQYXRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWV0aG9kOiAnc2NlbmUtZmFjYWRlJyxcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICBlcnJvcjogYOWJteW7uumgkOijvemrlOaZgueZvOeUn+mMr+iqpDogJHtlcnJvcn1gXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgdXBkYXRlUHJlZmFiKHByZWZhYlBhdGg6IHN0cmluZywgbm9kZVV1aWQ6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIC8vIEFwcGx5IHBhdGguIFRoZXJlIGlzIG5vIGhvc3QtcHJvY2VzcyBFZGl0b3IuTWVzc2FnZSBjaGFubmVsIGZvclxuICAgICAgICAvLyB0aGlzOyB0aGUgb3BlcmF0aW9uIGxpdmVzIG9uIHRoZSBzY2VuZSBmYWNhZGUgYW5kIGlzIHJlYWNoYWJsZVxuICAgICAgICAvLyB2aWEgZXhlY3V0ZS1zY2VuZS1zY3JpcHQgKHNlZSBzb3VyY2Uvc2NlbmUudHM6YXBwbHlQcmVmYWIpLlxuICAgICAgICBjb25zdCBmYWNhZGVSZXN1bHQgPSBhd2FpdCBydW5TY2VuZU1ldGhvZEFzVG9vbFJlc3BvbnNlKCdhcHBseVByZWZhYicsIFtub2RlVXVpZF0pO1xuICAgICAgICBpZiAoZmFjYWRlUmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgLi4uZmFjYWRlUmVzdWx0LFxuICAgICAgICAgICAgICAgIGRhdGE6IHsgLi4uKGZhY2FkZVJlc3VsdC5kYXRhID8/IHt9KSwgcHJlZmFiUGF0aCwgbm9kZVV1aWQgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgZXJyb3I6IGZhY2FkZVJlc3VsdC5lcnJvciA/PyAnYXBwbHlQcmVmYWIgZmFpbGVkIHZpYSBzY2VuZSBmYWNhZGUnLFxuICAgICAgICAgICAgZGF0YTogeyBwcmVmYWJQYXRoLCBub2RlVXVpZCB9LFxuICAgICAgICB9O1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgc2V0TGluayhhOiB7IG1vZGU6ICdsaW5rJyB8ICd1bmxpbmsnOyBub2RlVXVpZDogc3RyaW5nOyBhc3NldFV1aWQ/OiBzdHJpbmc7IHJlbW92ZU5lc3RlZDogYm9vbGVhbiB9KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgaWYgKGEubW9kZSA9PT0gJ2xpbmsnKSB7XG4gICAgICAgICAgICBpZiAoIWEuYXNzZXRVdWlkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnc2V0X2xpbmsgd2l0aCBtb2RlPVwibGlua1wiIHJlcXVpcmVzIGFzc2V0VXVpZCcgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBydW5TY2VuZU1ldGhvZEFzVG9vbFJlc3BvbnNlKCdsaW5rUHJlZmFiJywgW2Eubm9kZVV1aWQsIGEuYXNzZXRVdWlkXSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJ1blNjZW5lTWV0aG9kQXNUb29sUmVzcG9uc2UoJ3VubGlua1ByZWZhYicsIFthLm5vZGVVdWlkLCBhLnJlbW92ZU5lc3RlZF0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2V0UHJlZmFiRGF0YShub2RlVXVpZDogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHJ1blNjZW5lTWV0aG9kQXNUb29sUmVzcG9uc2UoJ2dldFByZWZhYkRhdGEnLCBbbm9kZVV1aWRdKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHJldmVydFByZWZhYihub2RlVXVpZDogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgLy8gVGhlIHByZXZpb3VzIGNvZGUgY2FsbGVkIHNjZW5lIGByZXZlcnQtcHJlZmFiYCwgd2hpY2ggZG9lcyBub3QgZXhpc3QuXG4gICAgICAgIC8vIFRoZSB2ZXJpZmllZCBjaGFubmVsIGlzIGByZXN0b3JlLXByZWZhYmAgdGFraW5nIGB7IHV1aWQ6IHN0cmluZyB9YFxuICAgICAgICAvLyAoUmVzZXRDb21wb25lbnRPcHRpb25zKS4gUGVyIHRoZSBlZGl0b3IgY29udmVudGlvbiB0aGlzIHJlc3RvcmVzIHRoZVxuICAgICAgICAvLyBub2RlIGZyb20gaXRzIGxpbmtlZCBwcmVmYWIgYXNzZXQsIHdoaWNoIG1hdGNoZXMgdGhlIFwicmV2ZXJ0XCIgaW50ZW50LlxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3Jlc3RvcmUtcHJlZmFiJywgeyB1dWlkOiBub2RlVXVpZCB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogJ1ByZWZhYiBpbnN0YW5jZSByZXZlcnRlZCBzdWNjZXNzZnVsbHknLFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldFByZWZhYkluZm8ocHJlZmFiUGF0aDogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldC1pbmZvJywgcHJlZmFiUGF0aCkudGhlbigoYXNzZXRJbmZvOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoIWFzc2V0SW5mbykge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1ByZWZhYiBub3QgZm91bmQnKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXQtbWV0YScsIGFzc2V0SW5mby51dWlkKTtcbiAgICAgICAgICAgIH0pLnRoZW4oKG1ldGFJbmZvOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBpbmZvOiBQcmVmYWJJbmZvID0ge1xuICAgICAgICAgICAgICAgICAgICBuYW1lOiBtZXRhSW5mby5uYW1lLFxuICAgICAgICAgICAgICAgICAgICB1dWlkOiBtZXRhSW5mby51dWlkLFxuICAgICAgICAgICAgICAgICAgICBwYXRoOiBwcmVmYWJQYXRoLFxuICAgICAgICAgICAgICAgICAgICBmb2xkZXI6IHByZWZhYlBhdGguc3Vic3RyaW5nKDAsIHByZWZhYlBhdGgubGFzdEluZGV4T2YoJy8nKSksXG4gICAgICAgICAgICAgICAgICAgIGNyZWF0ZVRpbWU6IG1ldGFJbmZvLmNyZWF0ZVRpbWUsXG4gICAgICAgICAgICAgICAgICAgIG1vZGlmeVRpbWU6IG1ldGFJbmZvLm1vZGlmeVRpbWUsXG4gICAgICAgICAgICAgICAgICAgIGRlcGVuZGVuY2llczogbWV0YUluZm8uZGVwZW5kcyB8fCBbXVxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IGluZm8gfSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVyci5tZXNzYWdlIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgdmFsaWRhdGVQcmVmYWIocHJlZmFiUGF0aDogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIC8vIOiugOWPlumgkOijvemrlOaWh+S7tuWFp+WuuVxuICAgICAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0LWluZm8nLCBwcmVmYWJQYXRoKS50aGVuKChhc3NldEluZm86IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAoIWFzc2V0SW5mbykge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3I6ICfpoJDoo73pq5Tmlofku7bkuI3lrZjlnKgnXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIOmpl+itiemgkOijvemrlOagvOW8j1xuICAgICAgICAgICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdyZWFkLWFzc2V0JywgcHJlZmFiUGF0aCkudGhlbigoY29udGVudDogc3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHByZWZhYkRhdGEgPSBKU09OLnBhcnNlKGNvbnRlbnQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHZhbGlkYXRpb25SZXN1bHQgPSB0aGlzLnZhbGlkYXRlUHJlZmFiRm9ybWF0KHByZWZhYkRhdGEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpc1ZhbGlkOiB2YWxpZGF0aW9uUmVzdWx0LmlzVmFsaWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpc3N1ZXM6IHZhbGlkYXRpb25SZXN1bHQuaXNzdWVzLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbm9kZUNvdW50OiB2YWxpZGF0aW9uUmVzdWx0Lm5vZGVDb3VudCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudENvdW50OiB2YWxpZGF0aW9uUmVzdWx0LmNvbXBvbmVudENvdW50LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogdmFsaWRhdGlvblJlc3VsdC5pc1ZhbGlkID8gJ+mgkOijvemrlOagvOW8j+acieaViCcgOiAn6aCQ6KO96auU5qC85byP5a2Y5Zyo5ZWP6aGMJ1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIChwYXJzZUVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlcnJvcjogJ+mgkOijvemrlOaWh+S7tuagvOW8j+mMr+iqpO+8jOeEoeazleino+aekEpTT04nXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0pLmNhdGNoKChlcnJvcjogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlcnJvcjogYOiugOWPlumgkOijvemrlOaWh+S7tuWkseaVlzogJHtlcnJvci5tZXNzYWdlfWBcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9KS5jYXRjaCgoZXJyb3I6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGDmn6XoqaLpoJDoo73pq5Tkv6Hmga/lpLHmlZc6ICR7ZXJyb3IubWVzc2FnZX1gXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIGVycm9yOiBg6amX6K2J6aCQ6KO96auU5pmC55m855Sf6Yyv6KqkOiAke2Vycm9yfWBcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSB2YWxpZGF0ZVByZWZhYkZvcm1hdChwcmVmYWJEYXRhOiBhbnkpOiB7IGlzVmFsaWQ6IGJvb2xlYW47IGlzc3Vlczogc3RyaW5nW107IG5vZGVDb3VudDogbnVtYmVyOyBjb21wb25lbnRDb3VudDogbnVtYmVyIH0ge1xuICAgICAgICBjb25zdCBpc3N1ZXM6IHN0cmluZ1tdID0gW107XG4gICAgICAgIGxldCBub2RlQ291bnQgPSAwO1xuICAgICAgICBsZXQgY29tcG9uZW50Q291bnQgPSAwO1xuXG4gICAgICAgIC8vIOaqouafpeWfuuacrOe1kOani1xuICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkocHJlZmFiRGF0YSkpIHtcbiAgICAgICAgICAgIGlzc3Vlcy5wdXNoKCfpoJDoo73pq5Tmlbjmk5rlv4XpoIjmmK/mlbjntYTmoLzlvI8nKTtcbiAgICAgICAgICAgIHJldHVybiB7IGlzVmFsaWQ6IGZhbHNlLCBpc3N1ZXMsIG5vZGVDb3VudCwgY29tcG9uZW50Q291bnQgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChwcmVmYWJEYXRhLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgaXNzdWVzLnB1c2goJ+mgkOijvemrlOaVuOaTmueCuuepuicpO1xuICAgICAgICAgICAgcmV0dXJuIHsgaXNWYWxpZDogZmFsc2UsIGlzc3Vlcywgbm9kZUNvdW50LCBjb21wb25lbnRDb3VudCB9O1xuICAgICAgICB9XG5cbiAgICAgICAgLy8g5qqi5p+l56ys5LiA5YCL5YWD57Sg5piv5ZCm54K66aCQ6KO96auU6LOH55SiXG4gICAgICAgIGNvbnN0IGZpcnN0RWxlbWVudCA9IHByZWZhYkRhdGFbMF07XG4gICAgICAgIGlmICghZmlyc3RFbGVtZW50IHx8IGZpcnN0RWxlbWVudC5fX3R5cGVfXyAhPT0gJ2NjLlByZWZhYicpIHtcbiAgICAgICAgICAgIGlzc3Vlcy5wdXNoKCfnrKzkuIDlgIvlhYPntKDlv4XpoIjmmK9jYy5QcmVmYWLpoZ7lnosnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIOe1seioiOevgOm7nuWSjOe1hOS7tlxuICAgICAgICBwcmVmYWJEYXRhLmZvckVhY2goKGl0ZW06IGFueSwgaW5kZXg6IG51bWJlcikgPT4ge1xuICAgICAgICAgICAgaWYgKGl0ZW0uX190eXBlX18gPT09ICdjYy5Ob2RlJykge1xuICAgICAgICAgICAgICAgIG5vZGVDb3VudCsrO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChpdGVtLl9fdHlwZV9fICYmIGl0ZW0uX190eXBlX18uaW5jbHVkZXMoJ2NjLicpKSB7XG4gICAgICAgICAgICAgICAgY29tcG9uZW50Q291bnQrKztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8g5qqi5p+l5b+F6KaB55qE5a2X5q61XG4gICAgICAgIGlmIChub2RlQ291bnQgPT09IDApIHtcbiAgICAgICAgICAgIGlzc3Vlcy5wdXNoKCfpoJDoo73pq5Tlv4XpoIjljIXlkKvoh7PlsJHkuIDlgIvnr4Dpu54nKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBpc1ZhbGlkOiBpc3N1ZXMubGVuZ3RoID09PSAwLFxuICAgICAgICAgICAgaXNzdWVzLFxuICAgICAgICAgICAgbm9kZUNvdW50LFxuICAgICAgICAgICAgY29tcG9uZW50Q291bnRcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHJlc3RvcmVQcmVmYWJOb2RlKG5vZGVVdWlkOiBzdHJpbmcsIGFzc2V0VXVpZDogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICAvLyBWZXJpZmllZCBzaWduYXR1cmUgcGVyIEBjb2Nvcy9jcmVhdG9yLXR5cGVzOiBzY2VuZS9yZXN0b3JlLXByZWZhYlxuICAgICAgICAgICAgLy8gdGFrZXMgYSBzaW5nbGUgUmVzZXRDb21wb25lbnRPcHRpb25zID0geyB1dWlkOiBzdHJpbmcgfS4gVGhlXG4gICAgICAgICAgICAvLyBwcmV2aW91cyBjb2RlIHBhc3NlZCAobm9kZVV1aWQsIGFzc2V0VXVpZCkgYXMgcG9zaXRpb25hbCBhcmdzLFxuICAgICAgICAgICAgLy8gd2hpY2ggdGhlIEFQSSBpZ25vcmVzIGFmdGVyIHRoZSBmaXJzdCBvbmUgYW5kIHNpbGVudGx5IG1pc3JvdXRlcy5cbiAgICAgICAgICAgIC8vIGFzc2V0VXVpZCBpcyBwcmVzZXJ2ZWQgb24gdGhlIHJlcXVlc3Qgc2hhcGUgZm9yIHJlc3BvbnNlIGNvbnRleHRcbiAgICAgICAgICAgIC8vIGJ1dCBkb2VzIG5vdCBmbG93IGludG8gdGhlIGVkaXRvciBtZXNzYWdlLlxuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncmVzdG9yZS1wcmVmYWInLCB7IHV1aWQ6IG5vZGVVdWlkIH0pLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBub2RlVXVpZDogbm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBhc3NldFV1aWQ6IGFzc2V0VXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICfpoJDoo73pq5Tnr4Dpu57pgoTljp/miJDlip8nXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnJvcjogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICBlcnJvcjogYOmgkOijvemrlOevgOm7numChOWOn+WkseaVlzogJHtlcnJvci5tZXNzYWdlfWBcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbn1cbiJdfQ==