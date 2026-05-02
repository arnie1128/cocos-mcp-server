"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrefabTools = void 0;
const response_1 = require("../lib/response");
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
                description: '[specialist] List .prefab assets under a folder with name/path/uuid. No scene or asset mutation. Also exposed as resource cocos://prefabs (default folder=db://assets) and cocos://prefabs{?folder} template; prefer the resource when the client supports MCP resources.',
                inputSchema: schema_1.z.object({
                    folder: schema_1.z.string().default('db://assets').describe('db:// folder to scan for prefabs. Default db://assets.'),
                }),
                handler: a => this.getPrefabList(a.folder),
            },
            {
                name: 'load_prefab',
                title: 'Read prefab metadata',
                description: '[specialist] Read prefab asset metadata only. Does not instantiate; use instantiate_prefab or create_node assetUuid/assetPath to add one to the scene.',
                inputSchema: schema_1.z.object({
                    prefabPath: schema_1.z.string().describe('Prefab db:// path. Reads metadata only; does not instantiate.'),
                }),
                handler: a => this.loadPrefab(a.prefabPath),
            },
            {
                name: 'instantiate_prefab',
                title: 'Instantiate prefab',
                description: '[specialist] Instantiate a prefab into the current scene; mutates scene and preserves prefab link.',
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
                description: '[specialist] Create a prefab asset from a scene node via cce.Prefab.createPrefab facade.',
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
                description: '[specialist] Apply prefab instance edits back to its linked prefab asset; prefabPath is context only.',
                inputSchema: schema_1.z.object({
                    prefabPath: schema_1.z.string().describe('Prefab asset path for response context; apply uses nodeUuid linked prefab data.'),
                    nodeUuid: schema_1.z.string().describe('Modified prefab instance node UUID to apply back to its linked prefab.'),
                }),
                handler: a => this.updatePrefab(a.prefabPath, a.nodeUuid),
            },
            {
                name: 'revert_prefab',
                title: 'Revert prefab instance',
                description: '[specialist] Restore a prefab instance from its linked asset; discards unapplied overrides.',
                inputSchema: schema_1.z.object({
                    nodeUuid: schema_1.z.string().describe('Prefab instance node UUID to restore from its linked asset.'),
                }),
                handler: a => this.revertPrefab(a.nodeUuid),
            },
            {
                name: 'get_prefab_info',
                title: 'Read prefab info',
                description: '[specialist] Read prefab meta/dependency summary before apply/revert.',
                inputSchema: schema_1.z.object({
                    prefabPath: schema_1.z.string().describe('Prefab asset db:// path.'),
                }),
                handler: a => this.getPrefabInfo(a.prefabPath),
            },
            {
                name: 'validate_prefab',
                title: 'Validate prefab asset',
                description: '[specialist] Run basic prefab JSON structural checks; not byte-level Cocos equivalence.',
                inputSchema: schema_1.z.object({
                    prefabPath: schema_1.z.string().describe('Prefab db:// path whose JSON structure should be checked.'),
                }),
                handler: a => this.validatePrefab(a.prefabPath),
            },
            {
                name: 'restore_prefab_node',
                title: 'Restore prefab node',
                description: '[specialist] Restore a prefab instance through scene/restore-prefab; assetUuid is context only.',
                inputSchema: schema_1.z.object({
                    nodeUuid: schema_1.z.string().describe('Prefab instance node UUID passed to scene/restore-prefab.'),
                    assetUuid: schema_1.z.string().describe('Prefab asset UUID kept for response context; Cocos restore-prefab uses nodeUuid only.'),
                }),
                handler: a => this.restorePrefabNode(a.nodeUuid, a.assetUuid),
            },
            {
                name: 'set_link',
                title: 'Set prefab link',
                description: '[specialist] Attach or detach a prefab link on a node. mode="link" wraps cce.SceneFacade.linkPrefab; mode="unlink" wraps cce.SceneFacade.unlinkPrefab.',
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
                description: '[specialist] Read facade prefab dump for a prefab instance node. No mutation; useful for inspecting instance/link serialized data.',
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
                resolve((0, response_1.ok)(prefabs));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
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
                    resolve((0, response_1.fail)(`Prefab not found: ${prefabPath}`));
                    return;
                }
                resolve((0, response_1.ok)({
                    uuid: assetInfo.uuid,
                    name: assetInfo.name,
                    url: assetInfo.url,
                    type: assetInfo.type,
                    source: assetInfo.source,
                    message: 'Prefab metadata retrieved (instantiate_prefab to add it to the scene)',
                }));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
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
                resolve((0, response_1.ok)({
                    nodeUuid: uuid,
                    prefabPath: args.prefabPath,
                    parentUuid: args.parentUuid,
                    position: args.position,
                    message: '預製體實例化成功，已建立預製體關聯'
                }));
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
                    resolve((0, response_1.fail)('缺少預製體路徑參數。請提供 prefabPath 或 savePath。'));
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
                resolve((0, response_1.fail)(`創建預製體時發生錯誤: ${error}`));
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
        return (0, response_1.fail)((_b = facadeResult.error) !== null && _b !== void 0 ? _b : 'applyPrefab failed via scene facade', { prefabPath, nodeUuid });
    }
    async setLink(a) {
        if (a.mode === 'link') {
            if (!a.assetUuid) {
                return (0, response_1.fail)('set_link with mode="link" requires assetUuid');
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
                resolve((0, response_1.ok)(undefined, 'Prefab instance reverted successfully'));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
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
                resolve((0, response_1.ok)(info));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async validatePrefab(prefabPath) {
        return new Promise((resolve) => {
            try {
                // 讀取預製體文件內容
                Editor.Message.request('asset-db', 'query-asset-info', prefabPath).then((assetInfo) => {
                    if (!assetInfo) {
                        resolve((0, response_1.fail)('預製體文件不存在'));
                        return;
                    }
                    // 驗證預製體格式
                    Editor.Message.request('asset-db', 'read-asset', prefabPath).then((content) => {
                        try {
                            const prefabData = JSON.parse(content);
                            const validationResult = this.validatePrefabFormat(prefabData);
                            resolve((0, response_1.ok)({
                                isValid: validationResult.isValid,
                                issues: validationResult.issues,
                                nodeCount: validationResult.nodeCount,
                                componentCount: validationResult.componentCount,
                                message: validationResult.isValid ? '預製體格式有效' : '預製體格式存在問題'
                            }));
                        }
                        catch (parseError) {
                            resolve((0, response_1.fail)('預製體文件格式錯誤，無法解析JSON'));
                        }
                    }).catch((error) => {
                        resolve((0, response_1.fail)(`讀取預製體文件失敗: ${error.message}`));
                    });
                }).catch((error) => {
                    resolve((0, response_1.fail)(`查詢預製體信息失敗: ${error.message}`));
                });
            }
            catch (error) {
                resolve((0, response_1.fail)(`驗證預製體時發生錯誤: ${error}`));
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
                resolve((0, response_1.ok)({
                    nodeUuid: nodeUuid,
                    assetUuid: assetUuid,
                    message: '預製體節點還原成功'
                }));
            }).catch((error) => {
                resolve((0, response_1.fail)(`預製體節點還原失敗: ${error.message}`));
            });
        });
    }
}
exports.PrefabTools = PrefabTools;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJlZmFiLXRvb2xzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL3Rvb2xzL3ByZWZhYi10b29scy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSw4Q0FBMkM7QUFFM0Msb0NBQXNDO0FBQ3RDLDBDQUFrQztBQUNsQyxzREFBMkQ7QUFDM0Qsc0RBQW1FO0FBRW5FLE1BQU0sb0JBQW9CLEdBQUcsVUFBQyxDQUFDLE1BQU0sQ0FBQztJQUNsQyxDQUFDLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsRUFBRTtJQUN4QixDQUFDLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsRUFBRTtJQUN4QixDQUFDLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsRUFBRTtDQUMzQixDQUFDLENBQUM7QUFFSCxNQUFhLFdBQVc7SUFHcEI7UUFDSSxNQUFNLElBQUksR0FBYztZQUNwQjtnQkFDSSxJQUFJLEVBQUUsaUJBQWlCO2dCQUN2QixLQUFLLEVBQUUsb0JBQW9CO2dCQUMzQixXQUFXLEVBQUUsMlFBQTJRO2dCQUN4UixXQUFXLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQztvQkFDbEIsTUFBTSxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLENBQUMsUUFBUSxDQUFDLHdEQUF3RCxDQUFDO2lCQUMvRyxDQUFDO2dCQUNGLE9BQU8sRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQzthQUM3QztZQUNEO2dCQUNJLElBQUksRUFBRSxhQUFhO2dCQUNuQixLQUFLLEVBQUUsc0JBQXNCO2dCQUM3QixXQUFXLEVBQUUsd0pBQXdKO2dCQUNySyxXQUFXLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQztvQkFDbEIsVUFBVSxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFR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QUM7WUFDbEIsTUFBTSxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUNqQyxDQUFDO1FBRUQsT0FBTztZQUNILE9BQU8sRUFBRSxNQUFNLENBQUMsTUFBTSxLQUFLLENBQUM7WUFDNUIsTUFBTTtZQUNOLFNBQVM7WUFDVCxjQUFjO1NBQ2pCLENBQUM7SUFDTixDQUFDO0lBRU8sS0FBSyxDQUFDLGlCQUFpQixDQUFDLFFBQWdCLEVBQUUsU0FBaUI7UUFDL0QsT0FBTyxJQUFJLE9BQU8sQ0FBQyxDQUFDLE9BQU8sRUFBRSxFQUFFO1lBQzNCLG9FQUFvRTtZQUNwRSwrREFBK0Q7WUFDL0QsaUVBQWlFO1lBQ2pFLG9FQUFvRTtZQUNwRSxtRUFBbUU7WUFDbkUsNkNBQTZDO1lBQzdDLE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUU7Z0JBQzVFLE9BQU8sQ0FBQyxJQUFBLGFBQUUsRUFBQztvQkFDSCxRQUFRLEVBQUUsUUFBUTtvQkFDbEIsU0FBUyxFQUFFLFNBQVM7b0JBQ3BCLE9BQU8sRUFBRSxXQUFXO2lCQUN2QixDQUFDLENBQUMsQ0FBQztZQUNaLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLEtBQVUsRUFBRSxFQUFFO2dCQUNwQixPQUFPLENBQUMsSUFBQSxlQUFJLEVBQUMsY0FBYyxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ2pELENBQUMsQ0FBQyxDQUFDO1FBQ1AsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDO0NBRUo7QUFoY0Qsa0NBZ2NDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgb2ssIGZhaWwgfSBmcm9tICcuLi9saWIvcmVzcG9uc2UnO1xuaW1wb3J0IHsgVG9vbERlZmluaXRpb24sIFRvb2xSZXNwb25zZSwgVG9vbEV4ZWN1dG9yLCBQcmVmYWJJbmZvIH0gZnJvbSAnLi4vdHlwZXMnO1xuaW1wb3J0IHsgZGVidWdMb2cgfSBmcm9tICcuLi9saWIvbG9nJztcbmltcG9ydCB7IHogfSBmcm9tICcuLi9saWIvc2NoZW1hJztcbmltcG9ydCB7IGRlZmluZVRvb2xzLCBUb29sRGVmIH0gZnJvbSAnLi4vbGliL2RlZmluZS10b29scyc7XG5pbXBvcnQgeyBydW5TY2VuZU1ldGhvZEFzVG9vbFJlc3BvbnNlIH0gZnJvbSAnLi4vbGliL3NjZW5lLWJyaWRnZSc7XG5cbmNvbnN0IHByZWZhYlBvc2l0aW9uU2NoZW1hID0gei5vYmplY3Qoe1xuICAgIHg6IHoubnVtYmVyKCkub3B0aW9uYWwoKSxcbiAgICB5OiB6Lm51bWJlcigpLm9wdGlvbmFsKCksXG4gICAgejogei5udW1iZXIoKS5vcHRpb25hbCgpLFxufSk7XG5cbmV4cG9ydCBjbGFzcyBQcmVmYWJUb29scyBpbXBsZW1lbnRzIFRvb2xFeGVjdXRvciB7XG4gICAgcHJpdmF0ZSByZWFkb25seSBleGVjOiBUb29sRXhlY3V0b3I7XG5cbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgY29uc3QgZGVmczogVG9vbERlZltdID0gW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdnZXRfcHJlZmFiX2xpc3QnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnTGlzdCBwcmVmYWIgYXNzZXRzJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBMaXN0IC5wcmVmYWIgYXNzZXRzIHVuZGVyIGEgZm9sZGVyIHdpdGggbmFtZS9wYXRoL3V1aWQuIE5vIHNjZW5lIG9yIGFzc2V0IG11dGF0aW9uLiBBbHNvIGV4cG9zZWQgYXMgcmVzb3VyY2UgY29jb3M6Ly9wcmVmYWJzIChkZWZhdWx0IGZvbGRlcj1kYjovL2Fzc2V0cykgYW5kIGNvY29zOi8vcHJlZmFic3s/Zm9sZGVyfSB0ZW1wbGF0ZTsgcHJlZmVyIHRoZSByZXNvdXJjZSB3aGVuIHRoZSBjbGllbnQgc3VwcG9ydHMgTUNQIHJlc291cmNlcy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIGZvbGRlcjogei5zdHJpbmcoKS5kZWZhdWx0KCdkYjovL2Fzc2V0cycpLmRlc2NyaWJlKCdkYjovLyBmb2xkZXIgdG8gc2NhbiBmb3IgcHJlZmFicy4gRGVmYXVsdCBkYjovL2Fzc2V0cy4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMuZ2V0UHJlZmFiTGlzdChhLmZvbGRlciksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdsb2FkX3ByZWZhYicsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdSZWFkIHByZWZhYiBtZXRhZGF0YScsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gUmVhZCBwcmVmYWIgYXNzZXQgbWV0YWRhdGEgb25seS4gRG9lcyBub3QgaW5zdGFudGlhdGU7IHVzZSBpbnN0YW50aWF0ZV9wcmVmYWIgb3IgY3JlYXRlX25vZGUgYXNzZXRVdWlkL2Fzc2V0UGF0aCB0byBhZGQgb25lIHRvIHRoZSBzY2VuZS4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHByZWZhYlBhdGg6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1ByZWZhYiBkYjovLyBwYXRoLiBSZWFkcyBtZXRhZGF0YSBvbmx5OyBkb2VzIG5vdCBpbnN0YW50aWF0ZS4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMubG9hZFByZWZhYihhLnByZWZhYlBhdGgpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnaW5zdGFudGlhdGVfcHJlZmFiJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ0luc3RhbnRpYXRlIHByZWZhYicsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gSW5zdGFudGlhdGUgYSBwcmVmYWIgaW50byB0aGUgY3VycmVudCBzY2VuZTsgbXV0YXRlcyBzY2VuZSBhbmQgcHJlc2VydmVzIHByZWZhYiBsaW5rLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgcHJlZmFiUGF0aDogei5zdHJpbmcoKS5kZXNjcmliZSgnUHJlZmFiIGRiOi8vIHBhdGggdG8gaW5zdGFudGlhdGUuJyksXG4gICAgICAgICAgICAgICAgICAgIHBhcmVudFV1aWQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnUGFyZW50IG5vZGUgVVVJRC4gT21pdCB0byBsZXQgQ29jb3MgY2hvb3NlIHRoZSBkZWZhdWx0IHBhcmVudC4nKSxcbiAgICAgICAgICAgICAgICAgICAgcG9zaXRpb246IHByZWZhYlBvc2l0aW9uU2NoZW1hLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0luaXRpYWwgbG9jYWwgcG9zaXRpb24gZm9yIHRoZSBjcmVhdGVkIHByZWZhYiBpbnN0YW5jZS4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMuaW5zdGFudGlhdGVQcmVmYWIoYSksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdjcmVhdGVfcHJlZmFiJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ0NyZWF0ZSBwcmVmYWIgYXNzZXQnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIENyZWF0ZSBhIHByZWZhYiBhc3NldCBmcm9tIGEgc2NlbmUgbm9kZSB2aWEgY2NlLlByZWZhYi5jcmVhdGVQcmVmYWIgZmFjYWRlLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1NvdXJjZSBub2RlIFVVSUQgdG8gY29udmVydCBpbnRvIGEgcHJlZmFiLCBpbmNsdWRpbmcgY2hpbGRyZW4gYW5kIGNvbXBvbmVudHMuJyksXG4gICAgICAgICAgICAgICAgICAgIHNhdmVQYXRoOiB6LnN0cmluZygpLmRlc2NyaWJlKCdUYXJnZXQgcHJlZmFiIGRiOi8vIHBhdGguIFBhc3MgYSBmdWxsIC5wcmVmYWIgcGF0aCBvciBhIGZvbGRlci4nKSxcbiAgICAgICAgICAgICAgICAgICAgcHJlZmFiTmFtZTogei5zdHJpbmcoKS5kZXNjcmliZSgnUHJlZmFiIG5hbWU7IHVzZWQgYXMgZmlsZW5hbWUgd2hlbiBzYXZlUGF0aCBpcyBhIGZvbGRlci4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMuY3JlYXRlUHJlZmFiKGEpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAndXBkYXRlX3ByZWZhYicsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdBcHBseSBwcmVmYWIgZWRpdHMnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIEFwcGx5IHByZWZhYiBpbnN0YW5jZSBlZGl0cyBiYWNrIHRvIGl0cyBsaW5rZWQgcHJlZmFiIGFzc2V0OyBwcmVmYWJQYXRoIGlzIGNvbnRleHQgb25seS4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHByZWZhYlBhdGg6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1ByZWZhYiBhc3NldCBwYXRoIGZvciByZXNwb25zZSBjb250ZXh0OyBhcHBseSB1c2VzIG5vZGVVdWlkIGxpbmtlZCBwcmVmYWIgZGF0YS4nKSxcbiAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ01vZGlmaWVkIHByZWZhYiBpbnN0YW5jZSBub2RlIFVVSUQgdG8gYXBwbHkgYmFjayB0byBpdHMgbGlua2VkIHByZWZhYi4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMudXBkYXRlUHJlZmFiKGEucHJlZmFiUGF0aCwgYS5ub2RlVXVpZCksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdyZXZlcnRfcHJlZmFiJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1JldmVydCBwcmVmYWIgaW5zdGFuY2UnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFJlc3RvcmUgYSBwcmVmYWIgaW5zdGFuY2UgZnJvbSBpdHMgbGlua2VkIGFzc2V0OyBkaXNjYXJkcyB1bmFwcGxpZWQgb3ZlcnJpZGVzLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1ByZWZhYiBpbnN0YW5jZSBub2RlIFVVSUQgdG8gcmVzdG9yZSBmcm9tIGl0cyBsaW5rZWQgYXNzZXQuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLnJldmVydFByZWZhYihhLm5vZGVVdWlkKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2dldF9wcmVmYWJfaW5mbycsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdSZWFkIHByZWZhYiBpbmZvJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBSZWFkIHByZWZhYiBtZXRhL2RlcGVuZGVuY3kgc3VtbWFyeSBiZWZvcmUgYXBwbHkvcmV2ZXJ0LicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgcHJlZmFiUGF0aDogei5zdHJpbmcoKS5kZXNjcmliZSgnUHJlZmFiIGFzc2V0IGRiOi8vIHBhdGguJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLmdldFByZWZhYkluZm8oYS5wcmVmYWJQYXRoKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3ZhbGlkYXRlX3ByZWZhYicsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdWYWxpZGF0ZSBwcmVmYWIgYXNzZXQnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFJ1biBiYXNpYyBwcmVmYWIgSlNPTiBzdHJ1Y3R1cmFsIGNoZWNrczsgbm90IGJ5dGUtbGV2ZWwgQ29jb3MgZXF1aXZhbGVuY2UuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBwcmVmYWJQYXRoOiB6LnN0cmluZygpLmRlc2NyaWJlKCdQcmVmYWIgZGI6Ly8gcGF0aCB3aG9zZSBKU09OIHN0cnVjdHVyZSBzaG91bGQgYmUgY2hlY2tlZC4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMudmFsaWRhdGVQcmVmYWIoYS5wcmVmYWJQYXRoKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3Jlc3RvcmVfcHJlZmFiX25vZGUnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnUmVzdG9yZSBwcmVmYWIgbm9kZScsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gUmVzdG9yZSBhIHByZWZhYiBpbnN0YW5jZSB0aHJvdWdoIHNjZW5lL3Jlc3RvcmUtcHJlZmFiOyBhc3NldFV1aWQgaXMgY29udGV4dCBvbmx5LicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1ByZWZhYiBpbnN0YW5jZSBub2RlIFVVSUQgcGFzc2VkIHRvIHNjZW5lL3Jlc3RvcmUtcHJlZmFiLicpLFxuICAgICAgICAgICAgICAgICAgICBhc3NldFV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1ByZWZhYiBhc3NldCBVVUlEIGtlcHQgZm9yIHJlc3BvbnNlIGNvbnRleHQ7IENvY29zIHJlc3RvcmUtcHJlZmFiIHVzZXMgbm9kZVV1aWQgb25seS4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMucmVzdG9yZVByZWZhYk5vZGUoYS5ub2RlVXVpZCwgYS5hc3NldFV1aWQpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnc2V0X2xpbmsnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnU2V0IHByZWZhYiBsaW5rJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBBdHRhY2ggb3IgZGV0YWNoIGEgcHJlZmFiIGxpbmsgb24gYSBub2RlLiBtb2RlPVwibGlua1wiIHdyYXBzIGNjZS5TY2VuZUZhY2FkZS5saW5rUHJlZmFiOyBtb2RlPVwidW5saW5rXCIgd3JhcHMgY2NlLlNjZW5lRmFjYWRlLnVubGlua1ByZWZhYi4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIG1vZGU6IHouZW51bShbJ2xpbmsnLCAndW5saW5rJ10pLmRlc2NyaWJlKCdPcGVyYXRpb246IFwibGlua1wiIGF0dGFjaGVzIGEgcmVndWxhciBub2RlIHRvIGEgcHJlZmFiIGFzc2V0OyBcInVubGlua1wiIGRldGFjaGVzIGEgcHJlZmFiIGluc3RhbmNlLicpLFxuICAgICAgICAgICAgICAgICAgICBub2RlVXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnTm9kZSBVVUlELiBGb3IgbW9kZT1cImxpbmtcIiwgdGhlIG5vZGUgdG8gYXR0YWNoOyBmb3IgbW9kZT1cInVubGlua1wiLCB0aGUgcHJlZmFiIGluc3RhbmNlIHRvIGRldGFjaC4nKSxcbiAgICAgICAgICAgICAgICAgICAgYXNzZXRVdWlkOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1ByZWZhYiBhc3NldCBVVUlELiBSZXF1aXJlZCB3aGVuIG1vZGU9XCJsaW5rXCI7IGlnbm9yZWQgd2hlbiBtb2RlPVwidW5saW5rXCIuJyksXG4gICAgICAgICAgICAgICAgICAgIHJlbW92ZU5lc3RlZDogei5ib29sZWFuKCkuZGVmYXVsdChmYWxzZSkuZGVzY3JpYmUoJ1doZW4gbW9kZT1cInVubGlua1wiLCBhbHNvIHVubGluayBuZXN0ZWQgcHJlZmFiIGluc3RhbmNlcyB1bmRlciB0aGlzIG5vZGUuIElnbm9yZWQgd2hlbiBtb2RlPVwibGlua1wiLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy5zZXRMaW5rKGEpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnZ2V0X3ByZWZhYl9kYXRhJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1JlYWQgcHJlZmFiIGRhdGEnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFJlYWQgZmFjYWRlIHByZWZhYiBkdW1wIGZvciBhIHByZWZhYiBpbnN0YW5jZSBub2RlLiBObyBtdXRhdGlvbjsgdXNlZnVsIGZvciBpbnNwZWN0aW5nIGluc3RhbmNlL2xpbmsgc2VyaWFsaXplZCBkYXRhLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1ByZWZhYiBpbnN0YW5jZSBub2RlIFVVSUQgd2hvc2UgcHJlZmFiIGR1bXAgc2hvdWxkIGJlIHJlYWQuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLmdldFByZWZhYkRhdGEoYS5ub2RlVXVpZCksXG4gICAgICAgICAgICB9LFxuICAgICAgICBdO1xuICAgICAgICB0aGlzLmV4ZWMgPSBkZWZpbmVUb29scyhkZWZzKTtcbiAgICB9XG5cbiAgICBnZXRUb29scygpOiBUb29sRGVmaW5pdGlvbltdIHsgcmV0dXJuIHRoaXMuZXhlYy5nZXRUb29scygpOyB9XG4gICAgZXhlY3V0ZSh0b29sTmFtZTogc3RyaW5nLCBhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4geyByZXR1cm4gdGhpcy5leGVjLmV4ZWN1dGUodG9vbE5hbWUsIGFyZ3MpOyB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldFByZWZhYkxpc3QoZm9sZGVyOiBzdHJpbmcgPSAnZGI6Ly9hc3NldHMnKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBwYXR0ZXJuID0gZm9sZGVyLmVuZHNXaXRoKCcvJykgPyBcbiAgICAgICAgICAgICAgICBgJHtmb2xkZXJ9KiovKi5wcmVmYWJgIDogYCR7Zm9sZGVyfS8qKi8qLnByZWZhYmA7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0cycsIHtcbiAgICAgICAgICAgICAgICBwYXR0ZXJuOiBwYXR0ZXJuXG4gICAgICAgICAgICB9KS50aGVuKChyZXN1bHRzOiBhbnlbXSkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHByZWZhYnM6IFByZWZhYkluZm9bXSA9IHJlc3VsdHMubWFwKGFzc2V0ID0+ICh7XG4gICAgICAgICAgICAgICAgICAgIG5hbWU6IGFzc2V0Lm5hbWUsXG4gICAgICAgICAgICAgICAgICAgIHBhdGg6IGFzc2V0LnVybCxcbiAgICAgICAgICAgICAgICAgICAgdXVpZDogYXNzZXQudXVpZCxcbiAgICAgICAgICAgICAgICAgICAgZm9sZGVyOiBhc3NldC51cmwuc3Vic3RyaW5nKDAsIGFzc2V0LnVybC5sYXN0SW5kZXhPZignLycpKVxuICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHByZWZhYnMpKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBsb2FkUHJlZmFiKHByZWZhYlBhdGg6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIC8vIE9yaWdpbmFsIGltcGxlbWVudGF0aW9uIGNhbGxlZCBzY2VuZSBgbG9hZC1hc3NldGAsIHdoaWNoIGlzIG5vdCBhIHJlYWxcbiAgICAgICAgLy8gY2hhbm5lbCBvbiB0aGUgc2NlbmUgbW9kdWxlIHBlciBAY29jb3MvY3JlYXRvci10eXBlcy4gVGhlcmUgaXMgbm9cbiAgICAgICAgLy8gZ2VuZXJpYyBcImxvYWQgYSBwcmVmYWIgd2l0aG91dCBpbnN0YW50aWF0aW5nXCIgb3BlcmF0aW9uIGV4cG9zZWQgdG9cbiAgICAgICAgLy8gZWRpdG9yIGV4dGVuc2lvbnMuIFJldHVybiB0aGUgYXNzZXQgbWV0YWRhdGEgdmlhIGFzc2V0LWRiIGluc3RlYWQ7XG4gICAgICAgIC8vIGNhbGxlcnMgd2hvIGFjdHVhbGx5IHdhbnQgdGhlIHByZWZhYiBpbiB0aGUgc2NlbmUgc2hvdWxkIHVzZVxuICAgICAgICAvLyBpbnN0YW50aWF0ZV9wcmVmYWIuXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXQtaW5mbycsIHByZWZhYlBhdGgpLnRoZW4oKGFzc2V0SW5mbzogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKCFhc3NldEluZm8pIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGBQcmVmYWIgbm90IGZvdW5kOiAke3ByZWZhYlBhdGh9YCkpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgdXVpZDogYXNzZXRJbmZvLnV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBuYW1lOiBhc3NldEluZm8ubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHVybDogYXNzZXRJbmZvLnVybCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6IGFzc2V0SW5mby50eXBlLFxuICAgICAgICAgICAgICAgICAgICAgICAgc291cmNlOiBhc3NldEluZm8uc291cmNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogJ1ByZWZhYiBtZXRhZGF0YSByZXRyaWV2ZWQgKGluc3RhbnRpYXRlX3ByZWZhYiB0byBhZGQgaXQgdG8gdGhlIHNjZW5lKScsXG4gICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBpbnN0YW50aWF0ZVByZWZhYihhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoYXN5bmMgKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgLy8g542y5Y+W6aCQ6KO96auU6LOH5rqQ5L+h5oGvXG4gICAgICAgICAgICAgICAgY29uc3QgYXNzZXRJbmZvID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXQtaW5mbycsIGFyZ3MucHJlZmFiUGF0aCk7XG4gICAgICAgICAgICAgICAgaWYgKCFhc3NldEluZm8pIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCfpoJDoo73pq5TmnKrmib7liLAnKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyDkvb/nlKjmraPnorrnmoQgY3JlYXRlLW5vZGUgQVBJIOW+numgkOijvemrlOizh+a6kOWvpuS+i+WMllxuICAgICAgICAgICAgICAgIGNvbnN0IGNyZWF0ZU5vZGVPcHRpb25zOiBhbnkgPSB7XG4gICAgICAgICAgICAgICAgICAgIGFzc2V0VXVpZDogYXNzZXRJbmZvLnV1aWRcbiAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgLy8g6Kit572u54i256+A6bueXG4gICAgICAgICAgICAgICAgaWYgKGFyZ3MucGFyZW50VXVpZCkge1xuICAgICAgICAgICAgICAgICAgICBjcmVhdGVOb2RlT3B0aW9ucy5wYXJlbnQgPSBhcmdzLnBhcmVudFV1aWQ7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8g6Kit572u56+A6bue5ZCN56ixXG4gICAgICAgICAgICAgICAgaWYgKGFyZ3MubmFtZSkge1xuICAgICAgICAgICAgICAgICAgICBjcmVhdGVOb2RlT3B0aW9ucy5uYW1lID0gYXJncy5uYW1lO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoYXNzZXRJbmZvLm5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgY3JlYXRlTm9kZU9wdGlvbnMubmFtZSA9IGFzc2V0SW5mby5uYW1lO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIOioree9ruWIneWni+WxrOaAp++8iOWmguS9jee9ru+8iVxuICAgICAgICAgICAgICAgIGlmIChhcmdzLnBvc2l0aW9uKSB7XG4gICAgICAgICAgICAgICAgICAgIGNyZWF0ZU5vZGVPcHRpb25zLmR1bXAgPSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBwb3NpdGlvbjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlOiBhcmdzLnBvc2l0aW9uXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8g5Ym15bu656+A6bueXG4gICAgICAgICAgICAgICAgY29uc3Qgbm9kZVV1aWQgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdjcmVhdGUtbm9kZScsIGNyZWF0ZU5vZGVPcHRpb25zKTtcbiAgICAgICAgICAgICAgICBjb25zdCB1dWlkID0gQXJyYXkuaXNBcnJheShub2RlVXVpZCkgPyBub2RlVXVpZFswXSA6IG5vZGVVdWlkO1xuXG4gICAgICAgICAgICAgICAgLy8g5rOo5oSP77yaY3JlYXRlLW5vZGUgQVBJ5b6e6aCQ6KO96auU6LOH5rqQ5Ym15bu65pmC5oeJ6Kmy6Ieq5YuV5bu656uL6aCQ6KO96auU6Zec6IGvXG4gICAgICAgICAgICAgICAgZGVidWdMb2coJ+mgkOijvemrlOevgOm7nuWJteW7uuaIkOWKnzonLCB7XG4gICAgICAgICAgICAgICAgICAgIG5vZGVVdWlkOiB1dWlkLFxuICAgICAgICAgICAgICAgICAgICBwcmVmYWJVdWlkOiBhc3NldEluZm8udXVpZCxcbiAgICAgICAgICAgICAgICAgICAgcHJlZmFiUGF0aDogYXJncy5wcmVmYWJQYXRoXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICBub2RlVXVpZDogdXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHByZWZhYlBhdGg6IGFyZ3MucHJlZmFiUGF0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhcmVudFV1aWQ6IGFyZ3MucGFyZW50VXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHBvc2l0aW9uOiBhcmdzLnBvc2l0aW9uLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogJ+mgkOijvemrlOWvpuS+i+WMluaIkOWKn++8jOW3suW7uueri+mgkOijvemrlOmXnOiBrydcbiAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHsgXG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLCBcbiAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGDpoJDoo73pq5Tlr6bkvovljJblpLHmlZc6ICR7ZXJyLm1lc3NhZ2V9YCxcbiAgICAgICAgICAgICAgICAgICAgaW5zdHJ1Y3Rpb246ICfoq4vmqqLmn6XpoJDoo73pq5Tot6/lvpHmmK/lkKbmraPnorrvvIznorrkv53poJDoo73pq5Tmlofku7bmoLzlvI/mraPnoronXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgY3JlYXRlUHJlZmFiKGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZShhc3luYyAocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAvLyDmlK/mjIEgcHJlZmFiUGF0aCDlkowgc2F2ZVBhdGgg5YWp56iu5Y+D5pW45ZCNXG4gICAgICAgICAgICAgICAgY29uc3QgcGF0aFBhcmFtID0gYXJncy5wcmVmYWJQYXRoIHx8IGFyZ3Muc2F2ZVBhdGg7XG4gICAgICAgICAgICAgICAgaWYgKCFwYXRoUGFyYW0pIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKCfnvLrlsJHpoJDoo73pq5Tot6/lvpHlj4PmlbjjgILoq4vmj5DkvpsgcHJlZmFiUGF0aCDmiJYgc2F2ZVBhdGjjgIInKSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBjb25zdCBwcmVmYWJOYW1lID0gYXJncy5wcmVmYWJOYW1lIHx8ICdOZXdQcmVmYWInO1xuICAgICAgICAgICAgICAgIGNvbnN0IGZ1bGxQYXRoID0gcGF0aFBhcmFtLmVuZHNXaXRoKCcucHJlZmFiJykgP1xuICAgICAgICAgICAgICAgICAgICBwYXRoUGFyYW0gOiBgJHtwYXRoUGFyYW19LyR7cHJlZmFiTmFtZX0ucHJlZmFiYDtcblxuICAgICAgICAgICAgICAgIC8vIFRoZSBvZmZpY2lhbCBzY2VuZS1mYWNhZGUgcGF0aCAoY2NlLlByZWZhYi5jcmVhdGVQcmVmYWIgdmlhXG4gICAgICAgICAgICAgICAgLy8gZXhlY3V0ZS1zY2VuZS1zY3JpcHQpLiBUaGUgbGVnYWN5IGhhbmQtcm9sbGVkIEpTT04gZmFsbGJhY2tcbiAgICAgICAgICAgICAgICAvLyAoY3JlYXRlUHJlZmFiV2l0aEFzc2V0REIgLyBjcmVhdGVQcmVmYWJOYXRpdmUgLyBjcmVhdGVQcmVmYWJDdXN0b20sXG4gICAgICAgICAgICAgICAgLy8gfjI1MCBzb3VyY2UgbGluZXMpIHdhcyByZW1vdmVkIGluIHYyLjEuMyDigJQgc2VlIGNvbW1pdCA1NDcxMTViXG4gICAgICAgICAgICAgICAgLy8gZm9yIHRoZSBwcmUtcmVtb3ZhbCBzb3VyY2UgaWYgYSBmdXR1cmUgQ29jb3MgQ3JlYXRvciBidWlsZFxuICAgICAgICAgICAgICAgIC8vIGJyZWFrcyB0aGUgZmFjYWRlIHBhdGguIFRoZSBmYWNhZGUgaGFzIGJlZW4gdGhlIG9ubHkgcGF0aFxuICAgICAgICAgICAgICAgIC8vIGV4ZXJjaXNlZCBpbiB2Mi4xLjEgLyB2Mi4xLjIgcmVhbC1lZGl0b3IgdGVzdGluZyBhY3Jvc3NcbiAgICAgICAgICAgICAgICAvLyBzaW1wbGUgYW5kIGNvbXBsZXggKG5lc3RlZCArIG11bHRpLWNvbXBvbmVudCkgcHJlZmFiIGZvcm1zLlxuICAgICAgICAgICAgICAgIGRlYnVnTG9nKCdDYWxsaW5nIHNjZW5lLXNjcmlwdCBjY2UuUHJlZmFiLmNyZWF0ZVByZWZhYi4uLicpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGZhY2FkZVJlc3VsdCA9IGF3YWl0IHJ1blNjZW5lTWV0aG9kQXNUb29sUmVzcG9uc2UoJ2NyZWF0ZVByZWZhYkZyb21Ob2RlJywgW2FyZ3Mubm9kZVV1aWQsIGZ1bGxQYXRoXSk7XG4gICAgICAgICAgICAgICAgaWYgKCFmYWNhZGVSZXN1bHQuc3VjY2Vzcykge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKGZhY2FkZVJlc3VsdCk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncmVmcmVzaC1hc3NldCcsIGZ1bGxQYXRoKTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChyZWZyZXNoRXJyOiBhbnkpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYHJlZnJlc2gtYXNzZXQgYWZ0ZXIgZmFjYWRlIGNyZWF0ZVByZWZhYiBmYWlsZWQgKG5vbi1mYXRhbCk6ICR7cmVmcmVzaEVycj8ubWVzc2FnZSA/PyByZWZyZXNoRXJyfWApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgLi4uZmFjYWRlUmVzdWx0LFxuICAgICAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAuLi4oZmFjYWRlUmVzdWx0LmRhdGEgPz8ge30pLFxuICAgICAgICAgICAgICAgICAgICAgICAgcHJlZmFiTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHByZWZhYlBhdGg6IGZ1bGxQYXRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWV0aG9kOiAnc2NlbmUtZmFjYWRlJyxcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGDlibXlu7rpoJDoo73pq5TmmYLnmbznlJ/pjK/oqqQ6ICR7ZXJyb3J9YCkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHVwZGF0ZVByZWZhYihwcmVmYWJQYXRoOiBzdHJpbmcsIG5vZGVVdWlkOiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICAvLyBBcHBseSBwYXRoLiBUaGVyZSBpcyBubyBob3N0LXByb2Nlc3MgRWRpdG9yLk1lc3NhZ2UgY2hhbm5lbCBmb3JcbiAgICAgICAgLy8gdGhpczsgdGhlIG9wZXJhdGlvbiBsaXZlcyBvbiB0aGUgc2NlbmUgZmFjYWRlIGFuZCBpcyByZWFjaGFibGVcbiAgICAgICAgLy8gdmlhIGV4ZWN1dGUtc2NlbmUtc2NyaXB0IChzZWUgc291cmNlL3NjZW5lLnRzOmFwcGx5UHJlZmFiKS5cbiAgICAgICAgY29uc3QgZmFjYWRlUmVzdWx0ID0gYXdhaXQgcnVuU2NlbmVNZXRob2RBc1Rvb2xSZXNwb25zZSgnYXBwbHlQcmVmYWInLCBbbm9kZVV1aWRdKTtcbiAgICAgICAgaWYgKGZhY2FkZVJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIC4uLmZhY2FkZVJlc3VsdCxcbiAgICAgICAgICAgICAgICBkYXRhOiB7IC4uLihmYWNhZGVSZXN1bHQuZGF0YSA/PyB7fSksIHByZWZhYlBhdGgsIG5vZGVVdWlkIH0sXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWlsKGZhY2FkZVJlc3VsdC5lcnJvciA/PyAnYXBwbHlQcmVmYWIgZmFpbGVkIHZpYSBzY2VuZSBmYWNhZGUnLCB7IHByZWZhYlBhdGgsIG5vZGVVdWlkIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgc2V0TGluayhhOiB7IG1vZGU6ICdsaW5rJyB8ICd1bmxpbmsnOyBub2RlVXVpZDogc3RyaW5nOyBhc3NldFV1aWQ/OiBzdHJpbmc7IHJlbW92ZU5lc3RlZDogYm9vbGVhbiB9KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgaWYgKGEubW9kZSA9PT0gJ2xpbmsnKSB7XG4gICAgICAgICAgICBpZiAoIWEuYXNzZXRVdWlkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ3NldF9saW5rIHdpdGggbW9kZT1cImxpbmtcIiByZXF1aXJlcyBhc3NldFV1aWQnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBydW5TY2VuZU1ldGhvZEFzVG9vbFJlc3BvbnNlKCdsaW5rUHJlZmFiJywgW2Eubm9kZVV1aWQsIGEuYXNzZXRVdWlkXSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJ1blNjZW5lTWV0aG9kQXNUb29sUmVzcG9uc2UoJ3VubGlua1ByZWZhYicsIFthLm5vZGVVdWlkLCBhLnJlbW92ZU5lc3RlZF0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2V0UHJlZmFiRGF0YShub2RlVXVpZDogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHJ1blNjZW5lTWV0aG9kQXNUb29sUmVzcG9uc2UoJ2dldFByZWZhYkRhdGEnLCBbbm9kZVV1aWRdKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHJldmVydFByZWZhYihub2RlVXVpZDogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgLy8gVGhlIHByZXZpb3VzIGNvZGUgY2FsbGVkIHNjZW5lIGByZXZlcnQtcHJlZmFiYCwgd2hpY2ggZG9lcyBub3QgZXhpc3QuXG4gICAgICAgIC8vIFRoZSB2ZXJpZmllZCBjaGFubmVsIGlzIGByZXN0b3JlLXByZWZhYmAgdGFraW5nIGB7IHV1aWQ6IHN0cmluZyB9YFxuICAgICAgICAvLyAoUmVzZXRDb21wb25lbnRPcHRpb25zKS4gUGVyIHRoZSBlZGl0b3IgY29udmVudGlvbiB0aGlzIHJlc3RvcmVzIHRoZVxuICAgICAgICAvLyBub2RlIGZyb20gaXRzIGxpbmtlZCBwcmVmYWIgYXNzZXQsIHdoaWNoIG1hdGNoZXMgdGhlIFwicmV2ZXJ0XCIgaW50ZW50LlxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3Jlc3RvcmUtcHJlZmFiJywgeyB1dWlkOiBub2RlVXVpZCB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHVuZGVmaW5lZCwgJ1ByZWZhYiBpbnN0YW5jZSByZXZlcnRlZCBzdWNjZXNzZnVsbHknKSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2V0UHJlZmFiSW5mbyhwcmVmYWJQYXRoOiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0LWluZm8nLCBwcmVmYWJQYXRoKS50aGVuKChhc3NldEluZm86IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmICghYXNzZXRJbmZvKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignUHJlZmFiIG5vdCBmb3VuZCcpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJldHVybiBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldC1tZXRhJywgYXNzZXRJbmZvLnV1aWQpO1xuICAgICAgICAgICAgfSkudGhlbigobWV0YUluZm86IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGluZm86IFByZWZhYkluZm8gPSB7XG4gICAgICAgICAgICAgICAgICAgIG5hbWU6IG1ldGFJbmZvLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgIHV1aWQ6IG1ldGFJbmZvLnV1aWQsXG4gICAgICAgICAgICAgICAgICAgIHBhdGg6IHByZWZhYlBhdGgsXG4gICAgICAgICAgICAgICAgICAgIGZvbGRlcjogcHJlZmFiUGF0aC5zdWJzdHJpbmcoMCwgcHJlZmFiUGF0aC5sYXN0SW5kZXhPZignLycpKSxcbiAgICAgICAgICAgICAgICAgICAgY3JlYXRlVGltZTogbWV0YUluZm8uY3JlYXRlVGltZSxcbiAgICAgICAgICAgICAgICAgICAgbW9kaWZ5VGltZTogbWV0YUluZm8ubW9kaWZ5VGltZSxcbiAgICAgICAgICAgICAgICAgICAgZGVwZW5kZW5jaWVzOiBtZXRhSW5mby5kZXBlbmRzIHx8IFtdXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKGluZm8pKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyB2YWxpZGF0ZVByZWZhYihwcmVmYWJQYXRoOiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgLy8g6K6A5Y+W6aCQ6KO96auU5paH5Lu25YWn5a65XG4gICAgICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXQtaW5mbycsIHByZWZhYlBhdGgpLnRoZW4oKGFzc2V0SW5mbzogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmICghYXNzZXRJbmZvKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoJ+mgkOijvemrlOaWh+S7tuS4jeWtmOWcqCcpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIOmpl+itiemgkOijvemrlOagvOW8j1xuICAgICAgICAgICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdyZWFkLWFzc2V0JywgcHJlZmFiUGF0aCkudGhlbigoY29udGVudDogc3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHByZWZhYkRhdGEgPSBKU09OLnBhcnNlKGNvbnRlbnQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHZhbGlkYXRpb25SZXN1bHQgPSB0aGlzLnZhbGlkYXRlUHJlZmFiRm9ybWF0KHByZWZhYkRhdGEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaXNWYWxpZDogdmFsaWRhdGlvblJlc3VsdC5pc1ZhbGlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaXNzdWVzOiB2YWxpZGF0aW9uUmVzdWx0Lmlzc3VlcyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5vZGVDb3VudDogdmFsaWRhdGlvblJlc3VsdC5ub2RlQ291bnQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRDb3VudDogdmFsaWRhdGlvblJlc3VsdC5jb21wb25lbnRDb3VudCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IHZhbGlkYXRpb25SZXN1bHQuaXNWYWxpZCA/ICfpoJDoo73pq5TmoLzlvI/mnInmlYgnIDogJ+mgkOijvemrlOagvOW8j+WtmOWcqOWVj+mhjCdcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAocGFyc2VFcnJvcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbCgn6aCQ6KO96auU5paH5Lu25qC85byP6Yyv6Kqk77yM54Sh5rOV6Kej5p6QSlNPTicpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSkuY2F0Y2goKGVycm9yOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChg6K6A5Y+W6aCQ6KO96auU5paH5Lu25aSx5pWXOiAke2Vycm9yLm1lc3NhZ2V9YCkpO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9KS5jYXRjaCgoZXJyb3I6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoYOafpeipoumgkOijvemrlOS/oeaBr+WkseaVlzogJHtlcnJvci5tZXNzYWdlfWApKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGDpqZforYnpoJDoo73pq5TmmYLnmbznlJ/pjK/oqqQ6ICR7ZXJyb3J9YCkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHZhbGlkYXRlUHJlZmFiRm9ybWF0KHByZWZhYkRhdGE6IGFueSk6IHsgaXNWYWxpZDogYm9vbGVhbjsgaXNzdWVzOiBzdHJpbmdbXTsgbm9kZUNvdW50OiBudW1iZXI7IGNvbXBvbmVudENvdW50OiBudW1iZXIgfSB7XG4gICAgICAgIGNvbnN0IGlzc3Vlczogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgbGV0IG5vZGVDb3VudCA9IDA7XG4gICAgICAgIGxldCBjb21wb25lbnRDb3VudCA9IDA7XG5cbiAgICAgICAgLy8g5qqi5p+l5Z+65pys57WQ5qeLXG4gICAgICAgIGlmICghQXJyYXkuaXNBcnJheShwcmVmYWJEYXRhKSkge1xuICAgICAgICAgICAgaXNzdWVzLnB1c2goJ+mgkOijvemrlOaVuOaTmuW/hemgiOaYr+aVuOe1hOagvOW8jycpO1xuICAgICAgICAgICAgcmV0dXJuIHsgaXNWYWxpZDogZmFsc2UsIGlzc3Vlcywgbm9kZUNvdW50LCBjb21wb25lbnRDb3VudCB9O1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHByZWZhYkRhdGEubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICBpc3N1ZXMucHVzaCgn6aCQ6KO96auU5pW45pOa54K656m6Jyk7XG4gICAgICAgICAgICByZXR1cm4geyBpc1ZhbGlkOiBmYWxzZSwgaXNzdWVzLCBub2RlQ291bnQsIGNvbXBvbmVudENvdW50IH07XG4gICAgICAgIH1cblxuICAgICAgICAvLyDmqqLmn6XnrKzkuIDlgIvlhYPntKDmmK/lkKbngrrpoJDoo73pq5Tos4fnlKJcbiAgICAgICAgY29uc3QgZmlyc3RFbGVtZW50ID0gcHJlZmFiRGF0YVswXTtcbiAgICAgICAgaWYgKCFmaXJzdEVsZW1lbnQgfHwgZmlyc3RFbGVtZW50Ll9fdHlwZV9fICE9PSAnY2MuUHJlZmFiJykge1xuICAgICAgICAgICAgaXNzdWVzLnB1c2goJ+esrOS4gOWAi+WFg+e0oOW/hemgiOaYr2NjLlByZWZhYumhnuWeiycpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8g57Wx6KiI56+A6bue5ZKM57WE5Lu2XG4gICAgICAgIHByZWZhYkRhdGEuZm9yRWFjaCgoaXRlbTogYW55LCBpbmRleDogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgICBpZiAoaXRlbS5fX3R5cGVfXyA9PT0gJ2NjLk5vZGUnKSB7XG4gICAgICAgICAgICAgICAgbm9kZUNvdW50Kys7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGl0ZW0uX190eXBlX18gJiYgaXRlbS5fX3R5cGVfXy5pbmNsdWRlcygnY2MuJykpIHtcbiAgICAgICAgICAgICAgICBjb21wb25lbnRDb3VudCsrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICAvLyDmqqLmn6Xlv4XopoHnmoTlrZfmrrVcbiAgICAgICAgaWYgKG5vZGVDb3VudCA9PT0gMCkge1xuICAgICAgICAgICAgaXNzdWVzLnB1c2goJ+mgkOijvemrlOW/hemgiOWMheWQq+iHs+WwkeS4gOWAi+evgOm7nicpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGlzVmFsaWQ6IGlzc3Vlcy5sZW5ndGggPT09IDAsXG4gICAgICAgICAgICBpc3N1ZXMsXG4gICAgICAgICAgICBub2RlQ291bnQsXG4gICAgICAgICAgICBjb21wb25lbnRDb3VudFxuICAgICAgICB9O1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgcmVzdG9yZVByZWZhYk5vZGUobm9kZVV1aWQ6IHN0cmluZywgYXNzZXRVdWlkOiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIC8vIFZlcmlmaWVkIHNpZ25hdHVyZSBwZXIgQGNvY29zL2NyZWF0b3ItdHlwZXM6IHNjZW5lL3Jlc3RvcmUtcHJlZmFiXG4gICAgICAgICAgICAvLyB0YWtlcyBhIHNpbmdsZSBSZXNldENvbXBvbmVudE9wdGlvbnMgPSB7IHV1aWQ6IHN0cmluZyB9LiBUaGVcbiAgICAgICAgICAgIC8vIHByZXZpb3VzIGNvZGUgcGFzc2VkIChub2RlVXVpZCwgYXNzZXRVdWlkKSBhcyBwb3NpdGlvbmFsIGFyZ3MsXG4gICAgICAgICAgICAvLyB3aGljaCB0aGUgQVBJIGlnbm9yZXMgYWZ0ZXIgdGhlIGZpcnN0IG9uZSBhbmQgc2lsZW50bHkgbWlzcm91dGVzLlxuICAgICAgICAgICAgLy8gYXNzZXRVdWlkIGlzIHByZXNlcnZlZCBvbiB0aGUgcmVxdWVzdCBzaGFwZSBmb3IgcmVzcG9uc2UgY29udGV4dFxuICAgICAgICAgICAgLy8gYnV0IGRvZXMgbm90IGZsb3cgaW50byB0aGUgZWRpdG9yIG1lc3NhZ2UuXG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdyZXN0b3JlLXByZWZhYicsIHsgdXVpZDogbm9kZVV1aWQgfSkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICBub2RlVXVpZDogbm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBhc3NldFV1aWQ6IGFzc2V0VXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICfpoJDoo73pq5Tnr4Dpu57pgoTljp/miJDlip8nXG4gICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnJvcjogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGDpoJDoo73pq5Tnr4Dpu57pgoTljp/lpLHmlZc6ICR7ZXJyb3IubWVzc2FnZX1gKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG59XG4iXX0=