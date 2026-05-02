"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrefabTools = void 0;
const log_1 = require("../lib/log");
const schema_1 = require("../lib/schema");
const define_tools_1 = require("../lib/define-tools");
const scene_bridge_1 = require("../lib/scene-bridge");
const prefabPositionSchema = schema_1.z.object({
    x: schema_1.z.number().optional(),
    y: schema_1.z.number().optional(),
    z: schema_1.z.number().optional(),
});
class PrefabTools {
    constructor() {
        const defs = [
            {
                name: 'get_prefab_list',
                title: 'List prefab assets',
                description: 'List .prefab assets under a folder with name/path/uuid. No scene or asset mutation. Also exposed as resource cocos://prefabs (default folder=db://assets) and cocos://prefabs{?folder} template; prefer the resource when the client supports MCP resources.',
                inputSchema: schema_1.z.object({
                    folder: schema_1.z.string().default('db://assets').describe('db:// folder to scan for prefabs. Default db://assets.'),
                }),
                handler: a => this.getPrefabList(a.folder),
            },
            {
                name: 'load_prefab',
                title: 'Read prefab metadata',
                description: 'Read prefab asset metadata only. Does not instantiate; use instantiate_prefab or create_node assetUuid/assetPath to add one to the scene.',
                inputSchema: schema_1.z.object({
                    prefabPath: schema_1.z.string().describe('Prefab db:// path. Reads metadata only; does not instantiate.'),
                }),
                handler: a => this.loadPrefab(a.prefabPath),
            },
            {
                name: 'instantiate_prefab',
                title: 'Instantiate prefab',
                description: 'Instantiate a prefab into the current scene; mutates scene and preserves prefab link.',
                inputSchema: schema_1.z.object({
                    prefabPath: schema_1.z.string().describe('Prefab db:// path to instantiate.'),
                    parentUuid: schema_1.z.string().optional().describe('Parent node UUID. Omit to let Cocos choose the default parent.'),
                    position: prefabPositionSchema.optional().describe('Initial local position for the created prefab instance.'),
                }),
                handler: a => this.instantiatePrefab(a),
            },
            {
                name: 'create_prefab',
                title: 'Create prefab asset',
                description: 'Create a prefab asset from a scene node via cce.Prefab.createPrefab facade.',
                inputSchema: schema_1.z.object({
                    nodeUuid: schema_1.z.string().describe('Source node UUID to convert into a prefab, including children and components.'),
                    savePath: schema_1.z.string().describe('Target prefab db:// path. Pass a full .prefab path or a folder.'),
                    prefabName: schema_1.z.string().describe('Prefab name; used as filename when savePath is a folder.'),
                }),
                handler: a => this.createPrefab(a),
            },
            {
                name: 'update_prefab',
                title: 'Apply prefab edits',
                description: 'Apply prefab instance edits back to its linked prefab asset; prefabPath is context only.',
                inputSchema: schema_1.z.object({
                    prefabPath: schema_1.z.string().describe('Prefab asset path for response context; apply uses nodeUuid linked prefab data.'),
                    nodeUuid: schema_1.z.string().describe('Modified prefab instance node UUID to apply back to its linked prefab.'),
                }),
                handler: a => this.updatePrefab(a.prefabPath, a.nodeUuid),
            },
            {
                name: 'revert_prefab',
                title: 'Revert prefab instance',
                description: 'Restore a prefab instance from its linked asset; discards unapplied overrides.',
                inputSchema: schema_1.z.object({
                    nodeUuid: schema_1.z.string().describe('Prefab instance node UUID to restore from its linked asset.'),
                }),
                handler: a => this.revertPrefab(a.nodeUuid),
            },
            {
                name: 'get_prefab_info',
                title: 'Read prefab info',
                description: 'Read prefab meta/dependency summary before apply/revert.',
                inputSchema: schema_1.z.object({
                    prefabPath: schema_1.z.string().describe('Prefab asset db:// path.'),
                }),
                handler: a => this.getPrefabInfo(a.prefabPath),
            },
            {
                name: 'validate_prefab',
                title: 'Validate prefab asset',
                description: 'Run basic prefab JSON structural checks; not byte-level Cocos equivalence.',
                inputSchema: schema_1.z.object({
                    prefabPath: schema_1.z.string().describe('Prefab db:// path whose JSON structure should be checked.'),
                }),
                handler: a => this.validatePrefab(a.prefabPath),
            },
            {
                name: 'restore_prefab_node',
                title: 'Restore prefab node',
                description: 'Restore a prefab instance through scene/restore-prefab; assetUuid is context only.',
                inputSchema: schema_1.z.object({
                    nodeUuid: schema_1.z.string().describe('Prefab instance node UUID passed to scene/restore-prefab.'),
                    assetUuid: schema_1.z.string().describe('Prefab asset UUID kept for response context; Cocos restore-prefab uses nodeUuid only.'),
                }),
                handler: a => this.restorePrefabNode(a.nodeUuid, a.assetUuid),
            },
            {
                name: 'set_link',
                title: 'Set prefab link',
                description: 'Attach or detach a prefab link on a node. mode="link" wraps cce.SceneFacade.linkPrefab; mode="unlink" wraps cce.SceneFacade.unlinkPrefab.',
                inputSchema: schema_1.z.object({
                    mode: schema_1.z.enum(['link', 'unlink']).describe('Operation: "link" attaches a regular node to a prefab asset; "unlink" detaches a prefab instance.'),
                    nodeUuid: schema_1.z.string().describe('Node UUID. For mode="link", the node to attach; for mode="unlink", the prefab instance to detach.'),
                    assetUuid: schema_1.z.string().optional().describe('Prefab asset UUID. Required when mode="link"; ignored when mode="unlink".'),
                    removeNested: schema_1.z.boolean().default(false).describe('When mode="unlink", also unlink nested prefab instances under this node. Ignored when mode="link".'),
                }),
                handler: a => this.setLink(a),
            },
            {
                name: 'get_prefab_data',
                title: 'Read prefab data',
                description: 'Read facade prefab dump for a prefab instance node. No mutation; useful for inspecting instance/link serialized data.',
                inputSchema: schema_1.z.object({
                    nodeUuid: schema_1.z.string().describe('Prefab instance node UUID whose prefab dump should be read.'),
                }),
                handler: a => this.getPrefabData(a.nodeUuid),
            },
        ];
        this.exec = (0, define_tools_1.defineTools)(defs);
    }
    getTools() { return this.exec.getTools(); }
    execute(toolName, args) { return this.exec.execute(toolName, args); }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJlZmFiLXRvb2xzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL3Rvb2xzL3ByZWZhYi10b29scy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSxvQ0FBc0M7QUFDdEMsMENBQWtDO0FBQ2xDLHNEQUEyRDtBQUMzRCxzREFBbUU7QUFFbkUsTUFBTSxvQkFBb0IsR0FBRyxVQUFDLENBQUMsTUFBTSxDQUFDO0lBQ2xDLENBQUMsRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxFQUFFO0lBQ3hCLENBQUMsRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxFQUFFO0lBQ3hCLENBQUMsRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxFQUFFO0NBQzNCLENBQUMsQ0FBQztBQUVILE1BQWEsV0FBVztJQUdwQjtRQUNJLE1BQU0sSUFBSSxHQUFjO1lBQ3BCO2dCQUNJLElBQUksRUFBRSxpQkFBaUI7Z0JBQ3ZCLEtBQUssRUFBRSxvQkFBb0I7Z0JBQzNCLFdBQVcsRUFBRSw4UEFBOFA7Z0JBQzNRLFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDO29CQUNsQixNQUFNLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsQ0FBQyxRQUFRLENBQUMsd0RBQXdELENBQUM7aUJBQy9HLENBQUM7Z0JBQ0YsT0FBTyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDO2FBQzdDO1lBQ0Q7Z0JBQ0ksSUFBSSxFQUFFLGFBQWE7Z0JBQ25CLEtBQUssRUFBRSxzQkFBc0I7Z0JBQzdCLFdBQVcsRUFBRSwySUFBMkk7Z0JBQ3hKLFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDO29CQUNsQixVQUFVLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQywrREFBK0Qs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Q2IsSUFBSSxFQUFFO3dCQUNGLFFBQVEsRUFBRSxRQUFRO3dCQUNsQixTQUFTLEVBQUUsU0FBUzt3QkFDcEIsT0FBTyxFQUFFLFdBQVc7cUJBQ3ZCO2lCQUNKLENBQUMsQ0FBQztZQUNQLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLEtBQVUsRUFBRSxFQUFFO2dCQUNwQixPQUFPLENBQUM7b0JBQ0osT0FBTyxFQUFFLEtBQUs7b0JBQ2QsS0FBSyxFQUFFLGNBQWMsS0FBSyxDQUFDLE9BQU8sRUFBRTtpQkFDdkMsQ0FBQyxDQUFDO1lBQ1AsQ0FBQyxDQUFDLENBQUM7UUFDUCxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7Q0FFSjtBQTNlRCxrQ0EyZUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBUb29sRGVmaW5pdGlvbiwgVG9vbFJlc3BvbnNlLCBUb29sRXhlY3V0b3IsIFByZWZhYkluZm8gfSBmcm9tICcuLi90eXBlcyc7XG5pbXBvcnQgeyBkZWJ1Z0xvZyB9IGZyb20gJy4uL2xpYi9sb2cnO1xuaW1wb3J0IHsgeiB9IGZyb20gJy4uL2xpYi9zY2hlbWEnO1xuaW1wb3J0IHsgZGVmaW5lVG9vbHMsIFRvb2xEZWYgfSBmcm9tICcuLi9saWIvZGVmaW5lLXRvb2xzJztcbmltcG9ydCB7IHJ1blNjZW5lTWV0aG9kQXNUb29sUmVzcG9uc2UgfSBmcm9tICcuLi9saWIvc2NlbmUtYnJpZGdlJztcblxuY29uc3QgcHJlZmFiUG9zaXRpb25TY2hlbWEgPSB6Lm9iamVjdCh7XG4gICAgeDogei5udW1iZXIoKS5vcHRpb25hbCgpLFxuICAgIHk6IHoubnVtYmVyKCkub3B0aW9uYWwoKSxcbiAgICB6OiB6Lm51bWJlcigpLm9wdGlvbmFsKCksXG59KTtcblxuZXhwb3J0IGNsYXNzIFByZWZhYlRvb2xzIGltcGxlbWVudHMgVG9vbEV4ZWN1dG9yIHtcbiAgICBwcml2YXRlIHJlYWRvbmx5IGV4ZWM6IFRvb2xFeGVjdXRvcjtcblxuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICBjb25zdCBkZWZzOiBUb29sRGVmW10gPSBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2dldF9wcmVmYWJfbGlzdCcsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdMaXN0IHByZWZhYiBhc3NldHMnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnTGlzdCAucHJlZmFiIGFzc2V0cyB1bmRlciBhIGZvbGRlciB3aXRoIG5hbWUvcGF0aC91dWlkLiBObyBzY2VuZSBvciBhc3NldCBtdXRhdGlvbi4gQWxzbyBleHBvc2VkIGFzIHJlc291cmNlIGNvY29zOi8vcHJlZmFicyAoZGVmYXVsdCBmb2xkZXI9ZGI6Ly9hc3NldHMpIGFuZCBjb2NvczovL3ByZWZhYnN7P2ZvbGRlcn0gdGVtcGxhdGU7IHByZWZlciB0aGUgcmVzb3VyY2Ugd2hlbiB0aGUgY2xpZW50IHN1cHBvcnRzIE1DUCByZXNvdXJjZXMuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBmb2xkZXI6IHouc3RyaW5nKCkuZGVmYXVsdCgnZGI6Ly9hc3NldHMnKS5kZXNjcmliZSgnZGI6Ly8gZm9sZGVyIHRvIHNjYW4gZm9yIHByZWZhYnMuIERlZmF1bHQgZGI6Ly9hc3NldHMuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLmdldFByZWZhYkxpc3QoYS5mb2xkZXIpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnbG9hZF9wcmVmYWInLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnUmVhZCBwcmVmYWIgbWV0YWRhdGEnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnUmVhZCBwcmVmYWIgYXNzZXQgbWV0YWRhdGEgb25seS4gRG9lcyBub3QgaW5zdGFudGlhdGU7IHVzZSBpbnN0YW50aWF0ZV9wcmVmYWIgb3IgY3JlYXRlX25vZGUgYXNzZXRVdWlkL2Fzc2V0UGF0aCB0byBhZGQgb25lIHRvIHRoZSBzY2VuZS4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHByZWZhYlBhdGg6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1ByZWZhYiBkYjovLyBwYXRoLiBSZWFkcyBtZXRhZGF0YSBvbmx5OyBkb2VzIG5vdCBpbnN0YW50aWF0ZS4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMubG9hZFByZWZhYihhLnByZWZhYlBhdGgpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnaW5zdGFudGlhdGVfcHJlZmFiJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ0luc3RhbnRpYXRlIHByZWZhYicsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdJbnN0YW50aWF0ZSBhIHByZWZhYiBpbnRvIHRoZSBjdXJyZW50IHNjZW5lOyBtdXRhdGVzIHNjZW5lIGFuZCBwcmVzZXJ2ZXMgcHJlZmFiIGxpbmsuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBwcmVmYWJQYXRoOiB6LnN0cmluZygpLmRlc2NyaWJlKCdQcmVmYWIgZGI6Ly8gcGF0aCB0byBpbnN0YW50aWF0ZS4nKSxcbiAgICAgICAgICAgICAgICAgICAgcGFyZW50VXVpZDogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdQYXJlbnQgbm9kZSBVVUlELiBPbWl0IHRvIGxldCBDb2NvcyBjaG9vc2UgdGhlIGRlZmF1bHQgcGFyZW50LicpLFxuICAgICAgICAgICAgICAgICAgICBwb3NpdGlvbjogcHJlZmFiUG9zaXRpb25TY2hlbWEub3B0aW9uYWwoKS5kZXNjcmliZSgnSW5pdGlhbCBsb2NhbCBwb3NpdGlvbiBmb3IgdGhlIGNyZWF0ZWQgcHJlZmFiIGluc3RhbmNlLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy5pbnN0YW50aWF0ZVByZWZhYihhKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2NyZWF0ZV9wcmVmYWInLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnQ3JlYXRlIHByZWZhYiBhc3NldCcsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdDcmVhdGUgYSBwcmVmYWIgYXNzZXQgZnJvbSBhIHNjZW5lIG5vZGUgdmlhIGNjZS5QcmVmYWIuY3JlYXRlUHJlZmFiIGZhY2FkZS4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIG5vZGVVdWlkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdTb3VyY2Ugbm9kZSBVVUlEIHRvIGNvbnZlcnQgaW50byBhIHByZWZhYiwgaW5jbHVkaW5nIGNoaWxkcmVuIGFuZCBjb21wb25lbnRzLicpLFxuICAgICAgICAgICAgICAgICAgICBzYXZlUGF0aDogei5zdHJpbmcoKS5kZXNjcmliZSgnVGFyZ2V0IHByZWZhYiBkYjovLyBwYXRoLiBQYXNzIGEgZnVsbCAucHJlZmFiIHBhdGggb3IgYSBmb2xkZXIuJyksXG4gICAgICAgICAgICAgICAgICAgIHByZWZhYk5hbWU6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1ByZWZhYiBuYW1lOyB1c2VkIGFzIGZpbGVuYW1lIHdoZW4gc2F2ZVBhdGggaXMgYSBmb2xkZXIuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLmNyZWF0ZVByZWZhYihhKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3VwZGF0ZV9wcmVmYWInLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnQXBwbHkgcHJlZmFiIGVkaXRzJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ0FwcGx5IHByZWZhYiBpbnN0YW5jZSBlZGl0cyBiYWNrIHRvIGl0cyBsaW5rZWQgcHJlZmFiIGFzc2V0OyBwcmVmYWJQYXRoIGlzIGNvbnRleHQgb25seS4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHByZWZhYlBhdGg6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1ByZWZhYiBhc3NldCBwYXRoIGZvciByZXNwb25zZSBjb250ZXh0OyBhcHBseSB1c2VzIG5vZGVVdWlkIGxpbmtlZCBwcmVmYWIgZGF0YS4nKSxcbiAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ01vZGlmaWVkIHByZWZhYiBpbnN0YW5jZSBub2RlIFVVSUQgdG8gYXBwbHkgYmFjayB0byBpdHMgbGlua2VkIHByZWZhYi4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMudXBkYXRlUHJlZmFiKGEucHJlZmFiUGF0aCwgYS5ub2RlVXVpZCksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdyZXZlcnRfcHJlZmFiJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1JldmVydCBwcmVmYWIgaW5zdGFuY2UnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnUmVzdG9yZSBhIHByZWZhYiBpbnN0YW5jZSBmcm9tIGl0cyBsaW5rZWQgYXNzZXQ7IGRpc2NhcmRzIHVuYXBwbGllZCBvdmVycmlkZXMuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBub2RlVXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnUHJlZmFiIGluc3RhbmNlIG5vZGUgVVVJRCB0byByZXN0b3JlIGZyb20gaXRzIGxpbmtlZCBhc3NldC4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMucmV2ZXJ0UHJlZmFiKGEubm9kZVV1aWQpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnZ2V0X3ByZWZhYl9pbmZvJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1JlYWQgcHJlZmFiIGluZm8nLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnUmVhZCBwcmVmYWIgbWV0YS9kZXBlbmRlbmN5IHN1bW1hcnkgYmVmb3JlIGFwcGx5L3JldmVydC4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHByZWZhYlBhdGg6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1ByZWZhYiBhc3NldCBkYjovLyBwYXRoLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy5nZXRQcmVmYWJJbmZvKGEucHJlZmFiUGF0aCksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICd2YWxpZGF0ZV9wcmVmYWInLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnVmFsaWRhdGUgcHJlZmFiIGFzc2V0JyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1J1biBiYXNpYyBwcmVmYWIgSlNPTiBzdHJ1Y3R1cmFsIGNoZWNrczsgbm90IGJ5dGUtbGV2ZWwgQ29jb3MgZXF1aXZhbGVuY2UuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBwcmVmYWJQYXRoOiB6LnN0cmluZygpLmRlc2NyaWJlKCdQcmVmYWIgZGI6Ly8gcGF0aCB3aG9zZSBKU09OIHN0cnVjdHVyZSBzaG91bGQgYmUgY2hlY2tlZC4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMudmFsaWRhdGVQcmVmYWIoYS5wcmVmYWJQYXRoKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3Jlc3RvcmVfcHJlZmFiX25vZGUnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnUmVzdG9yZSBwcmVmYWIgbm9kZScsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdSZXN0b3JlIGEgcHJlZmFiIGluc3RhbmNlIHRocm91Z2ggc2NlbmUvcmVzdG9yZS1wcmVmYWI7IGFzc2V0VXVpZCBpcyBjb250ZXh0IG9ubHkuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBub2RlVXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnUHJlZmFiIGluc3RhbmNlIG5vZGUgVVVJRCBwYXNzZWQgdG8gc2NlbmUvcmVzdG9yZS1wcmVmYWIuJyksXG4gICAgICAgICAgICAgICAgICAgIGFzc2V0VXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnUHJlZmFiIGFzc2V0IFVVSUQga2VwdCBmb3IgcmVzcG9uc2UgY29udGV4dDsgQ29jb3MgcmVzdG9yZS1wcmVmYWIgdXNlcyBub2RlVXVpZCBvbmx5LicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy5yZXN0b3JlUHJlZmFiTm9kZShhLm5vZGVVdWlkLCBhLmFzc2V0VXVpZCksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdzZXRfbGluaycsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdTZXQgcHJlZmFiIGxpbmsnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnQXR0YWNoIG9yIGRldGFjaCBhIHByZWZhYiBsaW5rIG9uIGEgbm9kZS4gbW9kZT1cImxpbmtcIiB3cmFwcyBjY2UuU2NlbmVGYWNhZGUubGlua1ByZWZhYjsgbW9kZT1cInVubGlua1wiIHdyYXBzIGNjZS5TY2VuZUZhY2FkZS51bmxpbmtQcmVmYWIuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBtb2RlOiB6LmVudW0oWydsaW5rJywgJ3VubGluayddKS5kZXNjcmliZSgnT3BlcmF0aW9uOiBcImxpbmtcIiBhdHRhY2hlcyBhIHJlZ3VsYXIgbm9kZSB0byBhIHByZWZhYiBhc3NldDsgXCJ1bmxpbmtcIiBkZXRhY2hlcyBhIHByZWZhYiBpbnN0YW5jZS4nKSxcbiAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ05vZGUgVVVJRC4gRm9yIG1vZGU9XCJsaW5rXCIsIHRoZSBub2RlIHRvIGF0dGFjaDsgZm9yIG1vZGU9XCJ1bmxpbmtcIiwgdGhlIHByZWZhYiBpbnN0YW5jZSB0byBkZXRhY2guJyksXG4gICAgICAgICAgICAgICAgICAgIGFzc2V0VXVpZDogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdQcmVmYWIgYXNzZXQgVVVJRC4gUmVxdWlyZWQgd2hlbiBtb2RlPVwibGlua1wiOyBpZ25vcmVkIHdoZW4gbW9kZT1cInVubGlua1wiLicpLFxuICAgICAgICAgICAgICAgICAgICByZW1vdmVOZXN0ZWQ6IHouYm9vbGVhbigpLmRlZmF1bHQoZmFsc2UpLmRlc2NyaWJlKCdXaGVuIG1vZGU9XCJ1bmxpbmtcIiwgYWxzbyB1bmxpbmsgbmVzdGVkIHByZWZhYiBpbnN0YW5jZXMgdW5kZXIgdGhpcyBub2RlLiBJZ25vcmVkIHdoZW4gbW9kZT1cImxpbmtcIi4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMuc2V0TGluayhhKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2dldF9wcmVmYWJfZGF0YScsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdSZWFkIHByZWZhYiBkYXRhJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1JlYWQgZmFjYWRlIHByZWZhYiBkdW1wIGZvciBhIHByZWZhYiBpbnN0YW5jZSBub2RlLiBObyBtdXRhdGlvbjsgdXNlZnVsIGZvciBpbnNwZWN0aW5nIGluc3RhbmNlL2xpbmsgc2VyaWFsaXplZCBkYXRhLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1ByZWZhYiBpbnN0YW5jZSBub2RlIFVVSUQgd2hvc2UgcHJlZmFiIGR1bXAgc2hvdWxkIGJlIHJlYWQuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLmdldFByZWZhYkRhdGEoYS5ub2RlVXVpZCksXG4gICAgICAgICAgICB9LFxuICAgICAgICBdO1xuICAgICAgICB0aGlzLmV4ZWMgPSBkZWZpbmVUb29scyhkZWZzKTtcbiAgICB9XG5cbiAgICBnZXRUb29scygpOiBUb29sRGVmaW5pdGlvbltdIHsgcmV0dXJuIHRoaXMuZXhlYy5nZXRUb29scygpOyB9XG4gICAgZXhlY3V0ZSh0b29sTmFtZTogc3RyaW5nLCBhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4geyByZXR1cm4gdGhpcy5leGVjLmV4ZWN1dGUodG9vbE5hbWUsIGFyZ3MpOyB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldFByZWZhYkxpc3QoZm9sZGVyOiBzdHJpbmcgPSAnZGI6Ly9hc3NldHMnKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBwYXR0ZXJuID0gZm9sZGVyLmVuZHNXaXRoKCcvJykgPyBcbiAgICAgICAgICAgICAgICBgJHtmb2xkZXJ9KiovKi5wcmVmYWJgIDogYCR7Zm9sZGVyfS8qKi8qLnByZWZhYmA7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0cycsIHtcbiAgICAgICAgICAgICAgICBwYXR0ZXJuOiBwYXR0ZXJuXG4gICAgICAgICAgICB9KS50aGVuKChyZXN1bHRzOiBhbnlbXSkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHByZWZhYnM6IFByZWZhYkluZm9bXSA9IHJlc3VsdHMubWFwKGFzc2V0ID0+ICh7XG4gICAgICAgICAgICAgICAgICAgIG5hbWU6IGFzc2V0Lm5hbWUsXG4gICAgICAgICAgICAgICAgICAgIHBhdGg6IGFzc2V0LnVybCxcbiAgICAgICAgICAgICAgICAgICAgdXVpZDogYXNzZXQudXVpZCxcbiAgICAgICAgICAgICAgICAgICAgZm9sZGVyOiBhc3NldC51cmwuc3Vic3RyaW5nKDAsIGFzc2V0LnVybC5sYXN0SW5kZXhPZignLycpKVxuICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogcHJlZmFicyB9KTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBsb2FkUHJlZmFiKHByZWZhYlBhdGg6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIC8vIE9yaWdpbmFsIGltcGxlbWVudGF0aW9uIGNhbGxlZCBzY2VuZSBgbG9hZC1hc3NldGAsIHdoaWNoIGlzIG5vdCBhIHJlYWxcbiAgICAgICAgLy8gY2hhbm5lbCBvbiB0aGUgc2NlbmUgbW9kdWxlIHBlciBAY29jb3MvY3JlYXRvci10eXBlcy4gVGhlcmUgaXMgbm9cbiAgICAgICAgLy8gZ2VuZXJpYyBcImxvYWQgYSBwcmVmYWIgd2l0aG91dCBpbnN0YW50aWF0aW5nXCIgb3BlcmF0aW9uIGV4cG9zZWQgdG9cbiAgICAgICAgLy8gZWRpdG9yIGV4dGVuc2lvbnMuIFJldHVybiB0aGUgYXNzZXQgbWV0YWRhdGEgdmlhIGFzc2V0LWRiIGluc3RlYWQ7XG4gICAgICAgIC8vIGNhbGxlcnMgd2hvIGFjdHVhbGx5IHdhbnQgdGhlIHByZWZhYiBpbiB0aGUgc2NlbmUgc2hvdWxkIHVzZVxuICAgICAgICAvLyBpbnN0YW50aWF0ZV9wcmVmYWIuXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXQtaW5mbycsIHByZWZhYlBhdGgpLnRoZW4oKGFzc2V0SW5mbzogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKCFhc3NldEluZm8pIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYFByZWZhYiBub3QgZm91bmQ6ICR7cHJlZmFiUGF0aH1gIH0pO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiBhc3NldEluZm8udXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG5hbWU6IGFzc2V0SW5mby5uYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgdXJsOiBhc3NldEluZm8udXJsLFxuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogYXNzZXRJbmZvLnR5cGUsXG4gICAgICAgICAgICAgICAgICAgICAgICBzb3VyY2U6IGFzc2V0SW5mby5zb3VyY2UsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiAnUHJlZmFiIG1ldGFkYXRhIHJldHJpZXZlZCAoaW5zdGFudGlhdGVfcHJlZmFiIHRvIGFkZCBpdCB0byB0aGUgc2NlbmUpJyxcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBpbnN0YW50aWF0ZVByZWZhYihhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoYXN5bmMgKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgLy8g542y5Y+W6aCQ6KO96auU6LOH5rqQ5L+h5oGvXG4gICAgICAgICAgICAgICAgY29uc3QgYXNzZXRJbmZvID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXQtaW5mbycsIGFyZ3MucHJlZmFiUGF0aCk7XG4gICAgICAgICAgICAgICAgaWYgKCFhc3NldEluZm8pIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCfpoJDoo73pq5TmnKrmib7liLAnKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyDkvb/nlKjmraPnorrnmoQgY3JlYXRlLW5vZGUgQVBJIOW+numgkOijvemrlOizh+a6kOWvpuS+i+WMllxuICAgICAgICAgICAgICAgIGNvbnN0IGNyZWF0ZU5vZGVPcHRpb25zOiBhbnkgPSB7XG4gICAgICAgICAgICAgICAgICAgIGFzc2V0VXVpZDogYXNzZXRJbmZvLnV1aWRcbiAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgLy8g6Kit572u54i256+A6bueXG4gICAgICAgICAgICAgICAgaWYgKGFyZ3MucGFyZW50VXVpZCkge1xuICAgICAgICAgICAgICAgICAgICBjcmVhdGVOb2RlT3B0aW9ucy5wYXJlbnQgPSBhcmdzLnBhcmVudFV1aWQ7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8g6Kit572u56+A6bue5ZCN56ixXG4gICAgICAgICAgICAgICAgaWYgKGFyZ3MubmFtZSkge1xuICAgICAgICAgICAgICAgICAgICBjcmVhdGVOb2RlT3B0aW9ucy5uYW1lID0gYXJncy5uYW1lO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoYXNzZXRJbmZvLm5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgY3JlYXRlTm9kZU9wdGlvbnMubmFtZSA9IGFzc2V0SW5mby5uYW1lO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIOioree9ruWIneWni+WxrOaAp++8iOWmguS9jee9ru+8iVxuICAgICAgICAgICAgICAgIGlmIChhcmdzLnBvc2l0aW9uKSB7XG4gICAgICAgICAgICAgICAgICAgIGNyZWF0ZU5vZGVPcHRpb25zLmR1bXAgPSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBwb3NpdGlvbjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlOiBhcmdzLnBvc2l0aW9uXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8g5Ym15bu656+A6bueXG4gICAgICAgICAgICAgICAgY29uc3Qgbm9kZVV1aWQgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdjcmVhdGUtbm9kZScsIGNyZWF0ZU5vZGVPcHRpb25zKTtcbiAgICAgICAgICAgICAgICBjb25zdCB1dWlkID0gQXJyYXkuaXNBcnJheShub2RlVXVpZCkgPyBub2RlVXVpZFswXSA6IG5vZGVVdWlkO1xuXG4gICAgICAgICAgICAgICAgLy8g5rOo5oSP77yaY3JlYXRlLW5vZGUgQVBJ5b6e6aCQ6KO96auU6LOH5rqQ5Ym15bu65pmC5oeJ6Kmy6Ieq5YuV5bu656uL6aCQ6KO96auU6Zec6IGvXG4gICAgICAgICAgICAgICAgZGVidWdMb2coJ+mgkOijvemrlOevgOm7nuWJteW7uuaIkOWKnzonLCB7XG4gICAgICAgICAgICAgICAgICAgIG5vZGVVdWlkOiB1dWlkLFxuICAgICAgICAgICAgICAgICAgICBwcmVmYWJVdWlkOiBhc3NldEluZm8udXVpZCxcbiAgICAgICAgICAgICAgICAgICAgcHJlZmFiUGF0aDogYXJncy5wcmVmYWJQYXRoXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG5vZGVVdWlkOiB1dWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgcHJlZmFiUGF0aDogYXJncy5wcmVmYWJQYXRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgcGFyZW50VXVpZDogYXJncy5wYXJlbnRVdWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgcG9zaXRpb246IGFyZ3MucG9zaXRpb24sXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiAn6aCQ6KO96auU5a+m5L6L5YyW5oiQ5Yqf77yM5bey5bu656uL6aCQ6KO96auU6Zec6IGvJ1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoeyBcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsIFxuICAgICAgICAgICAgICAgICAgICBlcnJvcjogYOmgkOijvemrlOWvpuS+i+WMluWkseaVlzogJHtlcnIubWVzc2FnZX1gLFxuICAgICAgICAgICAgICAgICAgICBpbnN0cnVjdGlvbjogJ+iri+aqouafpemgkOijvemrlOi3r+W+keaYr+WQpuato+eiuu+8jOeiuuS/nemgkOijvemrlOaWh+S7tuagvOW8j+ato+eiuidcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBjcmVhdGVQcmVmYWIoYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKGFzeW5jIChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIC8vIOaUr+aMgSBwcmVmYWJQYXRoIOWSjCBzYXZlUGF0aCDlhannqK7lj4PmlbjlkI1cbiAgICAgICAgICAgICAgICBjb25zdCBwYXRoUGFyYW0gPSBhcmdzLnByZWZhYlBhdGggfHwgYXJncy5zYXZlUGF0aDtcbiAgICAgICAgICAgICAgICBpZiAoIXBhdGhQYXJhbSkge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3I6ICfnvLrlsJHpoJDoo73pq5Tot6/lvpHlj4PmlbjjgILoq4vmj5DkvpsgcHJlZmFiUGF0aCDmiJYgc2F2ZVBhdGjjgIInXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgY29uc3QgcHJlZmFiTmFtZSA9IGFyZ3MucHJlZmFiTmFtZSB8fCAnTmV3UHJlZmFiJztcbiAgICAgICAgICAgICAgICBjb25zdCBmdWxsUGF0aCA9IHBhdGhQYXJhbS5lbmRzV2l0aCgnLnByZWZhYicpID9cbiAgICAgICAgICAgICAgICAgICAgcGF0aFBhcmFtIDogYCR7cGF0aFBhcmFtfS8ke3ByZWZhYk5hbWV9LnByZWZhYmA7XG5cbiAgICAgICAgICAgICAgICAvLyBUaGUgb2ZmaWNpYWwgc2NlbmUtZmFjYWRlIHBhdGggKGNjZS5QcmVmYWIuY3JlYXRlUHJlZmFiIHZpYVxuICAgICAgICAgICAgICAgIC8vIGV4ZWN1dGUtc2NlbmUtc2NyaXB0KS4gVGhlIGxlZ2FjeSBoYW5kLXJvbGxlZCBKU09OIGZhbGxiYWNrXG4gICAgICAgICAgICAgICAgLy8gKGNyZWF0ZVByZWZhYldpdGhBc3NldERCIC8gY3JlYXRlUHJlZmFiTmF0aXZlIC8gY3JlYXRlUHJlZmFiQ3VzdG9tLFxuICAgICAgICAgICAgICAgIC8vIH4yNTAgc291cmNlIGxpbmVzKSB3YXMgcmVtb3ZlZCBpbiB2Mi4xLjMg4oCUIHNlZSBjb21taXQgNTQ3MTE1YlxuICAgICAgICAgICAgICAgIC8vIGZvciB0aGUgcHJlLXJlbW92YWwgc291cmNlIGlmIGEgZnV0dXJlIENvY29zIENyZWF0b3IgYnVpbGRcbiAgICAgICAgICAgICAgICAvLyBicmVha3MgdGhlIGZhY2FkZSBwYXRoLiBUaGUgZmFjYWRlIGhhcyBiZWVuIHRoZSBvbmx5IHBhdGhcbiAgICAgICAgICAgICAgICAvLyBleGVyY2lzZWQgaW4gdjIuMS4xIC8gdjIuMS4yIHJlYWwtZWRpdG9yIHRlc3RpbmcgYWNyb3NzXG4gICAgICAgICAgICAgICAgLy8gc2ltcGxlIGFuZCBjb21wbGV4IChuZXN0ZWQgKyBtdWx0aS1jb21wb25lbnQpIHByZWZhYiBmb3Jtcy5cbiAgICAgICAgICAgICAgICBkZWJ1Z0xvZygnQ2FsbGluZyBzY2VuZS1zY3JpcHQgY2NlLlByZWZhYi5jcmVhdGVQcmVmYWIuLi4nKTtcbiAgICAgICAgICAgICAgICBjb25zdCBmYWNhZGVSZXN1bHQgPSBhd2FpdCBydW5TY2VuZU1ldGhvZEFzVG9vbFJlc3BvbnNlKCdjcmVhdGVQcmVmYWJGcm9tTm9kZScsIFthcmdzLm5vZGVVdWlkLCBmdWxsUGF0aF0pO1xuICAgICAgICAgICAgICAgIGlmICghZmFjYWRlUmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShmYWNhZGVSZXN1bHQpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3JlZnJlc2gtYXNzZXQnLCBmdWxsUGF0aCk7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAocmVmcmVzaEVycjogYW55KSB7XG4gICAgICAgICAgICAgICAgICAgIGRlYnVnTG9nKGByZWZyZXNoLWFzc2V0IGFmdGVyIGZhY2FkZSBjcmVhdGVQcmVmYWIgZmFpbGVkIChub24tZmF0YWwpOiAke3JlZnJlc2hFcnI/Lm1lc3NhZ2UgPz8gcmVmcmVzaEVycn1gKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgIC4uLmZhY2FkZVJlc3VsdCxcbiAgICAgICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAgLi4uKGZhY2FkZVJlc3VsdC5kYXRhID8/IHt9KSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHByZWZhYk5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBwcmVmYWJQYXRoOiBmdWxsUGF0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1ldGhvZDogJ3NjZW5lLWZhY2FkZScsXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGDlibXlu7rpoJDoo73pq5TmmYLnmbznlJ/pjK/oqqQ6ICR7ZXJyb3J9YFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHVwZGF0ZVByZWZhYihwcmVmYWJQYXRoOiBzdHJpbmcsIG5vZGVVdWlkOiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICAvLyBBcHBseSBwYXRoLiBUaGVyZSBpcyBubyBob3N0LXByb2Nlc3MgRWRpdG9yLk1lc3NhZ2UgY2hhbm5lbCBmb3JcbiAgICAgICAgLy8gdGhpczsgdGhlIG9wZXJhdGlvbiBsaXZlcyBvbiB0aGUgc2NlbmUgZmFjYWRlIGFuZCBpcyByZWFjaGFibGVcbiAgICAgICAgLy8gdmlhIGV4ZWN1dGUtc2NlbmUtc2NyaXB0IChzZWUgc291cmNlL3NjZW5lLnRzOmFwcGx5UHJlZmFiKS5cbiAgICAgICAgY29uc3QgZmFjYWRlUmVzdWx0ID0gYXdhaXQgcnVuU2NlbmVNZXRob2RBc1Rvb2xSZXNwb25zZSgnYXBwbHlQcmVmYWInLCBbbm9kZVV1aWRdKTtcbiAgICAgICAgaWYgKGZhY2FkZVJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIC4uLmZhY2FkZVJlc3VsdCxcbiAgICAgICAgICAgICAgICBkYXRhOiB7IC4uLihmYWNhZGVSZXN1bHQuZGF0YSA/PyB7fSksIHByZWZhYlBhdGgsIG5vZGVVdWlkIH0sXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgIGVycm9yOiBmYWNhZGVSZXN1bHQuZXJyb3IgPz8gJ2FwcGx5UHJlZmFiIGZhaWxlZCB2aWEgc2NlbmUgZmFjYWRlJyxcbiAgICAgICAgICAgIGRhdGE6IHsgcHJlZmFiUGF0aCwgbm9kZVV1aWQgfSxcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHNldExpbmsoYTogeyBtb2RlOiAnbGluaycgfCAndW5saW5rJzsgbm9kZVV1aWQ6IHN0cmluZzsgYXNzZXRVdWlkPzogc3RyaW5nOyByZW1vdmVOZXN0ZWQ6IGJvb2xlYW4gfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGlmIChhLm1vZGUgPT09ICdsaW5rJykge1xuICAgICAgICAgICAgaWYgKCFhLmFzc2V0VXVpZCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ3NldF9saW5rIHdpdGggbW9kZT1cImxpbmtcIiByZXF1aXJlcyBhc3NldFV1aWQnIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gcnVuU2NlbmVNZXRob2RBc1Rvb2xSZXNwb25zZSgnbGlua1ByZWZhYicsIFthLm5vZGVVdWlkLCBhLmFzc2V0VXVpZF0pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBydW5TY2VuZU1ldGhvZEFzVG9vbFJlc3BvbnNlKCd1bmxpbmtQcmVmYWInLCBbYS5ub2RlVXVpZCwgYS5yZW1vdmVOZXN0ZWRdKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldFByZWZhYkRhdGEobm9kZVV1aWQ6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBydW5TY2VuZU1ldGhvZEFzVG9vbFJlc3BvbnNlKCdnZXRQcmVmYWJEYXRhJywgW25vZGVVdWlkXSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyByZXZlcnRQcmVmYWIobm9kZVV1aWQ6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIC8vIFRoZSBwcmV2aW91cyBjb2RlIGNhbGxlZCBzY2VuZSBgcmV2ZXJ0LXByZWZhYmAsIHdoaWNoIGRvZXMgbm90IGV4aXN0LlxuICAgICAgICAvLyBUaGUgdmVyaWZpZWQgY2hhbm5lbCBpcyBgcmVzdG9yZS1wcmVmYWJgIHRha2luZyBgeyB1dWlkOiBzdHJpbmcgfWBcbiAgICAgICAgLy8gKFJlc2V0Q29tcG9uZW50T3B0aW9ucykuIFBlciB0aGUgZWRpdG9yIGNvbnZlbnRpb24gdGhpcyByZXN0b3JlcyB0aGVcbiAgICAgICAgLy8gbm9kZSBmcm9tIGl0cyBsaW5rZWQgcHJlZmFiIGFzc2V0LCB3aGljaCBtYXRjaGVzIHRoZSBcInJldmVydFwiIGludGVudC5cbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdyZXN0b3JlLXByZWZhYicsIHsgdXVpZDogbm9kZVV1aWQgfSkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdQcmVmYWIgaW5zdGFuY2UgcmV2ZXJ0ZWQgc3VjY2Vzc2Z1bGx5JyxcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRQcmVmYWJJbmZvKHByZWZhYlBhdGg6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXQtaW5mbycsIHByZWZhYlBhdGgpLnRoZW4oKGFzc2V0SW5mbzogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKCFhc3NldEluZm8pIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdQcmVmYWIgbm90IGZvdW5kJyk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcmV0dXJuIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0LW1ldGEnLCBhc3NldEluZm8udXVpZCk7XG4gICAgICAgICAgICB9KS50aGVuKChtZXRhSW5mbzogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgaW5mbzogUHJlZmFiSW5mbyA9IHtcbiAgICAgICAgICAgICAgICAgICAgbmFtZTogbWV0YUluZm8ubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgdXVpZDogbWV0YUluZm8udXVpZCxcbiAgICAgICAgICAgICAgICAgICAgcGF0aDogcHJlZmFiUGF0aCxcbiAgICAgICAgICAgICAgICAgICAgZm9sZGVyOiBwcmVmYWJQYXRoLnN1YnN0cmluZygwLCBwcmVmYWJQYXRoLmxhc3RJbmRleE9mKCcvJykpLFxuICAgICAgICAgICAgICAgICAgICBjcmVhdGVUaW1lOiBtZXRhSW5mby5jcmVhdGVUaW1lLFxuICAgICAgICAgICAgICAgICAgICBtb2RpZnlUaW1lOiBtZXRhSW5mby5tb2RpZnlUaW1lLFxuICAgICAgICAgICAgICAgICAgICBkZXBlbmRlbmNpZXM6IG1ldGFJbmZvLmRlcGVuZHMgfHwgW11cbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIHJlc29sdmUoeyBzdWNjZXNzOiB0cnVlLCBkYXRhOiBpbmZvIH0pO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHZhbGlkYXRlUHJlZmFiKHByZWZhYlBhdGg6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAvLyDoroDlj5bpoJDoo73pq5Tmlofku7blhaflrrlcbiAgICAgICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldC1pbmZvJywgcHJlZmFiUGF0aCkudGhlbigoYXNzZXRJbmZvOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFhc3NldEluZm8pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yOiAn6aCQ6KO96auU5paH5Lu25LiN5a2Y5ZyoJ1xuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvLyDpqZforYnpoJDoo73pq5TmoLzlvI9cbiAgICAgICAgICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncmVhZC1hc3NldCcsIHByZWZhYlBhdGgpLnRoZW4oKGNvbnRlbnQ6IHN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBwcmVmYWJEYXRhID0gSlNPTi5wYXJzZShjb250ZW50KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB2YWxpZGF0aW9uUmVzdWx0ID0gdGhpcy52YWxpZGF0ZVByZWZhYkZvcm1hdChwcmVmYWJEYXRhKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaXNWYWxpZDogdmFsaWRhdGlvblJlc3VsdC5pc1ZhbGlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaXNzdWVzOiB2YWxpZGF0aW9uUmVzdWx0Lmlzc3VlcyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5vZGVDb3VudDogdmFsaWRhdGlvblJlc3VsdC5ub2RlQ291bnQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRDb3VudDogdmFsaWRhdGlvblJlc3VsdC5jb21wb25lbnRDb3VudCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IHZhbGlkYXRpb25SZXN1bHQuaXNWYWxpZCA/ICfpoJDoo73pq5TmoLzlvI/mnInmlYgnIDogJ+mgkOijvemrlOagvOW8j+WtmOWcqOWVj+mhjCdcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAocGFyc2VFcnJvcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3I6ICfpoJDoo73pq5Tmlofku7bmoLzlvI/pjK/oqqTvvIznhKHms5Xop6PmnpBKU09OJ1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9KS5jYXRjaCgoZXJyb3I6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGDoroDlj5bpoJDoo73pq5Tmlofku7blpLHmlZc6ICR7ZXJyb3IubWVzc2FnZX1gXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSkuY2F0Y2goKGVycm9yOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yOiBg5p+l6Kmi6aCQ6KO96auU5L+h5oGv5aSx5pWXOiAke2Vycm9yLm1lc3NhZ2V9YFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICBlcnJvcjogYOmpl+itiemgkOijvemrlOaZgueZvOeUn+mMr+iqpDogJHtlcnJvcn1gXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgdmFsaWRhdGVQcmVmYWJGb3JtYXQocHJlZmFiRGF0YTogYW55KTogeyBpc1ZhbGlkOiBib29sZWFuOyBpc3N1ZXM6IHN0cmluZ1tdOyBub2RlQ291bnQ6IG51bWJlcjsgY29tcG9uZW50Q291bnQ6IG51bWJlciB9IHtcbiAgICAgICAgY29uc3QgaXNzdWVzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICBsZXQgbm9kZUNvdW50ID0gMDtcbiAgICAgICAgbGV0IGNvbXBvbmVudENvdW50ID0gMDtcblxuICAgICAgICAvLyDmqqLmn6Xln7rmnKzntZDmp4tcbiAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KHByZWZhYkRhdGEpKSB7XG4gICAgICAgICAgICBpc3N1ZXMucHVzaCgn6aCQ6KO96auU5pW45pOa5b+F6aCI5piv5pW457WE5qC85byPJyk7XG4gICAgICAgICAgICByZXR1cm4geyBpc1ZhbGlkOiBmYWxzZSwgaXNzdWVzLCBub2RlQ291bnQsIGNvbXBvbmVudENvdW50IH07XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocHJlZmFiRGF0YS5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIGlzc3Vlcy5wdXNoKCfpoJDoo73pq5Tmlbjmk5rngrrnqbonKTtcbiAgICAgICAgICAgIHJldHVybiB7IGlzVmFsaWQ6IGZhbHNlLCBpc3N1ZXMsIG5vZGVDb3VudCwgY29tcG9uZW50Q291bnQgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIOaqouafpeesrOS4gOWAi+WFg+e0oOaYr+WQpueCuumgkOijvemrlOizh+eUolxuICAgICAgICBjb25zdCBmaXJzdEVsZW1lbnQgPSBwcmVmYWJEYXRhWzBdO1xuICAgICAgICBpZiAoIWZpcnN0RWxlbWVudCB8fCBmaXJzdEVsZW1lbnQuX190eXBlX18gIT09ICdjYy5QcmVmYWInKSB7XG4gICAgICAgICAgICBpc3N1ZXMucHVzaCgn56ys5LiA5YCL5YWD57Sg5b+F6aCI5pivY2MuUHJlZmFi6aGe5Z6LJyk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyDntbHoqIjnr4Dpu57lkozntYTku7ZcbiAgICAgICAgcHJlZmFiRGF0YS5mb3JFYWNoKChpdGVtOiBhbnksIGluZGV4OiBudW1iZXIpID0+IHtcbiAgICAgICAgICAgIGlmIChpdGVtLl9fdHlwZV9fID09PSAnY2MuTm9kZScpIHtcbiAgICAgICAgICAgICAgICBub2RlQ291bnQrKztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoaXRlbS5fX3R5cGVfXyAmJiBpdGVtLl9fdHlwZV9fLmluY2x1ZGVzKCdjYy4nKSkge1xuICAgICAgICAgICAgICAgIGNvbXBvbmVudENvdW50Kys7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIOaqouafpeW/heimgeeahOWtl+autVxuICAgICAgICBpZiAobm9kZUNvdW50ID09PSAwKSB7XG4gICAgICAgICAgICBpc3N1ZXMucHVzaCgn6aCQ6KO96auU5b+F6aCI5YyF5ZCr6Iez5bCR5LiA5YCL56+A6bueJyk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgaXNWYWxpZDogaXNzdWVzLmxlbmd0aCA9PT0gMCxcbiAgICAgICAgICAgIGlzc3VlcyxcbiAgICAgICAgICAgIG5vZGVDb3VudCxcbiAgICAgICAgICAgIGNvbXBvbmVudENvdW50XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyByZXN0b3JlUHJlZmFiTm9kZShub2RlVXVpZDogc3RyaW5nLCBhc3NldFV1aWQ6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgLy8gVmVyaWZpZWQgc2lnbmF0dXJlIHBlciBAY29jb3MvY3JlYXRvci10eXBlczogc2NlbmUvcmVzdG9yZS1wcmVmYWJcbiAgICAgICAgICAgIC8vIHRha2VzIGEgc2luZ2xlIFJlc2V0Q29tcG9uZW50T3B0aW9ucyA9IHsgdXVpZDogc3RyaW5nIH0uIFRoZVxuICAgICAgICAgICAgLy8gcHJldmlvdXMgY29kZSBwYXNzZWQgKG5vZGVVdWlkLCBhc3NldFV1aWQpIGFzIHBvc2l0aW9uYWwgYXJncyxcbiAgICAgICAgICAgIC8vIHdoaWNoIHRoZSBBUEkgaWdub3JlcyBhZnRlciB0aGUgZmlyc3Qgb25lIGFuZCBzaWxlbnRseSBtaXNyb3V0ZXMuXG4gICAgICAgICAgICAvLyBhc3NldFV1aWQgaXMgcHJlc2VydmVkIG9uIHRoZSByZXF1ZXN0IHNoYXBlIGZvciByZXNwb25zZSBjb250ZXh0XG4gICAgICAgICAgICAvLyBidXQgZG9lcyBub3QgZmxvdyBpbnRvIHRoZSBlZGl0b3IgbWVzc2FnZS5cbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3Jlc3RvcmUtcHJlZmFiJywgeyB1dWlkOiBub2RlVXVpZCB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWQ6IG5vZGVVdWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgYXNzZXRVdWlkOiBhc3NldFV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiAn6aCQ6KO96auU56+A6bue6YKE5Y6f5oiQ5YqfJ1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyb3I6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGDpoJDoo73pq5Tnr4Dpu57pgoTljp/lpLHmlZc6ICR7ZXJyb3IubWVzc2FnZX1gXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG59XG4iXX0=