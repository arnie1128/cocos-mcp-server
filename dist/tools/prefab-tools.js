"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrefabTools = void 0;
const response_1 = require("../lib/response");
const log_1 = require("../lib/log");
const schema_1 = require("../lib/schema");
const decorators_1 = require("../lib/decorators");
const scene_bridge_1 = require("../lib/scene-bridge");
const prefabPositionSchema = schema_1.z.object({
    x: schema_1.z.number().optional(),
    y: schema_1.z.number().optional(),
    z: schema_1.z.number().optional(),
});
class PrefabTools {
    constructor() {
        this.exec = (0, decorators_1.defineToolsFromDecorators)(this);
    }
    getTools() { return this.exec.getTools(); }
    execute(toolName, args) { return this.exec.execute(toolName, args); }
    async getPrefabList(args = 'db://assets') {
        var _a;
        const folder = typeof args === 'string' ? args : (_a = args.folder) !== null && _a !== void 0 ? _a : 'db://assets';
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
    async loadPrefab(args) {
        const prefabPath = typeof args === 'string' ? args : args.prefabPath;
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
    async updatePrefab(args, maybeNodeUuid) {
        var _a, _b;
        const prefabPath = typeof args === 'string' ? args : args.prefabPath;
        const nodeUuid = typeof args === 'string' ? maybeNodeUuid : args.nodeUuid;
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
    async getPrefabData(args) {
        const nodeUuid = typeof args === 'string' ? args : args.nodeUuid;
        return (0, scene_bridge_1.runSceneMethodAsToolResponse)('getPrefabData', [nodeUuid]);
    }
    async revertPrefab(args) {
        const nodeUuid = typeof args === 'string' ? args : args.nodeUuid;
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
    async getPrefabInfo(args) {
        const prefabPath = typeof args === 'string' ? args : args.prefabPath;
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
    async validatePrefab(args) {
        const prefabPath = typeof args === 'string' ? args : args.prefabPath;
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
    async restorePrefabNode(args, maybeAssetUuid) {
        const nodeUuid = typeof args === 'string' ? args : args.nodeUuid;
        const assetUuid = typeof args === 'string' ? maybeAssetUuid : args.assetUuid;
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
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'get_prefab_list',
        title: 'List prefab assets',
        description: '[specialist] List .prefab assets under a folder with name/path/uuid. No scene or asset mutation. Also exposed as resource cocos://prefabs (default folder=db://assets) and cocos://prefabs{?folder} template; prefer the resource when the client supports MCP resources.',
        inputSchema: schema_1.z.object({
            folder: schema_1.z.string().default('db://assets').describe('db:// folder to scan for prefabs. Default db://assets.'),
        }),
    })
], PrefabTools.prototype, "getPrefabList", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'load_prefab',
        title: 'Read prefab metadata',
        description: '[specialist] Read prefab asset metadata only. Does not instantiate; use instantiate_prefab or create_node assetUuid/assetPath to add one to the scene.',
        inputSchema: schema_1.z.object({
            prefabPath: schema_1.z.string().describe('Prefab db:// path. Reads metadata only; does not instantiate.'),
        }),
    })
], PrefabTools.prototype, "loadPrefab", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'instantiate_prefab',
        title: 'Instantiate prefab',
        description: '[specialist] Instantiate a prefab into the current scene; mutates scene and preserves prefab link.',
        inputSchema: schema_1.z.object({
            prefabPath: schema_1.z.string().describe('Prefab db:// path to instantiate.'),
            parentUuid: schema_1.z.string().optional().describe('Parent node UUID. Omit to let Cocos choose the default parent.'),
            position: prefabPositionSchema.optional().describe('Initial local position for the created prefab instance.'),
        }),
    })
], PrefabTools.prototype, "instantiatePrefab", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'create_prefab',
        title: 'Create prefab asset',
        description: '[specialist] Create a prefab asset from a scene node via cce.Prefab.createPrefab facade.',
        inputSchema: schema_1.z.object({
            nodeUuid: schema_1.z.string().describe('Source node UUID to convert into a prefab, including children and components.'),
            savePath: schema_1.z.string().describe('Target prefab db:// path. Pass a full .prefab path or a folder.'),
            prefabName: schema_1.z.string().describe('Prefab name; used as filename when savePath is a folder.'),
        }),
    })
], PrefabTools.prototype, "createPrefab", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'update_prefab',
        title: 'Apply prefab edits',
        description: '[specialist] Apply prefab instance edits back to its linked prefab asset; prefabPath is context only.',
        inputSchema: schema_1.z.object({
            prefabPath: schema_1.z.string().describe('Prefab asset path for response context; apply uses nodeUuid linked prefab data.'),
            nodeUuid: schema_1.z.string().describe('Modified prefab instance node UUID to apply back to its linked prefab.'),
        }),
    })
], PrefabTools.prototype, "updatePrefab", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'set_link',
        title: 'Set prefab link',
        description: '[specialist] Attach or detach a prefab link on a node. mode="link" wraps cce.SceneFacade.linkPrefab; mode="unlink" wraps cce.SceneFacade.unlinkPrefab.',
        inputSchema: schema_1.z.object({
            mode: schema_1.z.enum(['link', 'unlink']).describe('Operation: "link" attaches a regular node to a prefab asset; "unlink" detaches a prefab instance.'),
            nodeUuid: schema_1.z.string().describe('Node UUID. For mode="link", the node to attach; for mode="unlink", the prefab instance to detach.'),
            assetUuid: schema_1.z.string().optional().describe('Prefab asset UUID. Required when mode="link"; ignored when mode="unlink".'),
            removeNested: schema_1.z.boolean().default(false).describe('When mode="unlink", also unlink nested prefab instances under this node. Ignored when mode="link".'),
        }),
    })
], PrefabTools.prototype, "setLink", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'get_prefab_data',
        title: 'Read prefab data',
        description: '[specialist] Read facade prefab dump for a prefab instance node. No mutation; useful for inspecting instance/link serialized data.',
        inputSchema: schema_1.z.object({
            nodeUuid: schema_1.z.string().describe('Prefab instance node UUID whose prefab dump should be read.'),
        }),
    })
], PrefabTools.prototype, "getPrefabData", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'revert_prefab',
        title: 'Revert prefab instance',
        description: '[specialist] Restore a prefab instance from its linked asset; discards unapplied overrides.',
        inputSchema: schema_1.z.object({
            nodeUuid: schema_1.z.string().describe('Prefab instance node UUID to restore from its linked asset.'),
        }),
    })
], PrefabTools.prototype, "revertPrefab", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'get_prefab_info',
        title: 'Read prefab info',
        description: '[specialist] Read prefab meta/dependency summary before apply/revert.',
        inputSchema: schema_1.z.object({
            prefabPath: schema_1.z.string().describe('Prefab asset db:// path.'),
        }),
    })
], PrefabTools.prototype, "getPrefabInfo", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'validate_prefab',
        title: 'Validate prefab asset',
        description: '[specialist] Run basic prefab JSON structural checks; not byte-level Cocos equivalence.',
        inputSchema: schema_1.z.object({
            prefabPath: schema_1.z.string().describe('Prefab db:// path whose JSON structure should be checked.'),
        }),
    })
], PrefabTools.prototype, "validatePrefab", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'restore_prefab_node',
        title: 'Restore prefab node',
        description: '[specialist] Restore a prefab instance through scene/restore-prefab; assetUuid is context only.',
        inputSchema: schema_1.z.object({
            nodeUuid: schema_1.z.string().describe('Prefab instance node UUID passed to scene/restore-prefab.'),
            assetUuid: schema_1.z.string().describe('Prefab asset UUID kept for response context; Cocos restore-prefab uses nodeUuid only.'),
        }),
    })
], PrefabTools.prototype, "restorePrefabNode", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJlZmFiLXRvb2xzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL3Rvb2xzL3ByZWZhYi10b29scy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7QUFBQSw4Q0FBMkM7QUFFM0Msb0NBQXNDO0FBQ3RDLDBDQUFrQztBQUNsQyxrREFBdUU7QUFDdkUsc0RBQW1FO0FBRW5FLE1BQU0sb0JBQW9CLEdBQUcsVUFBQyxDQUFDLE1BQU0sQ0FBQztJQUNsQyxDQUFDLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsRUFBRTtJQUN4QixDQUFDLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsRUFBRTtJQUN4QixDQUFDLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsRUFBRTtDQUMzQixDQUFDLENBQUM7QUFFSCxNQUFhLFdBQVc7SUFHcEI7UUFDSSxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUEsc0NBQXlCLEVBQUMsSUFBSSxDQUFDLENBQUM7SUFDaEQsQ0FBQztJQUVELFFBQVEsS0FBdUIsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUM3RCxPQUFPLENBQUMsUUFBZ0IsRUFBRSxJQUFTLElBQTJCLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztJQVVuRyxBQUFOLEtBQUssQ0FBQyxhQUFhLENBQUMsT0FBcUMsYUFBYTs7UUFDbEUsTUFBTSxNQUFNLEdBQUcsT0FBTyxJQUFJLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLE1BQUEsSUFBSSxDQUFDLE1BQU0sbUNBQUksYUFBYSxDQUFDO1FBQzlFLE9BQU8sSUFBSSxPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsRUFBRTtZQUMzQixNQUFNLE9BQU8sR0FBRyxNQUFN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SztJQVRMLElBQUEsb0JBQU8sRUFBQztRQUNMLElBQUksRUFBRSxxQkFBcUI7UUFDM0IsS0FBSyxFQUFFLHFCQUFxQjtRQUM1QixXQUFXLEVBQUUsaUdBQWlHO1FBQzlHLFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDO1lBQ2xCLFFBQVEsRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLDJEQUEyRCxDQUFDO1lBQzFGLFNBQVMsRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLHVGQUF1RixDQUFDO1NBQzFILENBQUM7S0FDTCxDQUFDO29EQXFCRCIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IG9rLCBmYWlsIH0gZnJvbSAnLi4vbGliL3Jlc3BvbnNlJztcbmltcG9ydCB7IFRvb2xEZWZpbml0aW9uLCBUb29sUmVzcG9uc2UsIFRvb2xFeGVjdXRvciwgUHJlZmFiSW5mbyB9IGZyb20gJy4uL3R5cGVzJztcbmltcG9ydCB7IGRlYnVnTG9nIH0gZnJvbSAnLi4vbGliL2xvZyc7XG5pbXBvcnQgeyB6IH0gZnJvbSAnLi4vbGliL3NjaGVtYSc7XG5pbXBvcnQgeyBtY3BUb29sLCBkZWZpbmVUb29sc0Zyb21EZWNvcmF0b3JzIH0gZnJvbSAnLi4vbGliL2RlY29yYXRvcnMnO1xuaW1wb3J0IHsgcnVuU2NlbmVNZXRob2RBc1Rvb2xSZXNwb25zZSB9IGZyb20gJy4uL2xpYi9zY2VuZS1icmlkZ2UnO1xuXG5jb25zdCBwcmVmYWJQb3NpdGlvblNjaGVtYSA9IHoub2JqZWN0KHtcbiAgICB4OiB6Lm51bWJlcigpLm9wdGlvbmFsKCksXG4gICAgeTogei5udW1iZXIoKS5vcHRpb25hbCgpLFxuICAgIHo6IHoubnVtYmVyKCkub3B0aW9uYWwoKSxcbn0pO1xuXG5leHBvcnQgY2xhc3MgUHJlZmFiVG9vbHMgaW1wbGVtZW50cyBUb29sRXhlY3V0b3Ige1xuICAgIHByaXZhdGUgcmVhZG9ubHkgZXhlYzogVG9vbEV4ZWN1dG9yO1xuXG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHRoaXMuZXhlYyA9IGRlZmluZVRvb2xzRnJvbURlY29yYXRvcnModGhpcyk7XG4gICAgfVxuXG4gICAgZ2V0VG9vbHMoKTogVG9vbERlZmluaXRpb25bXSB7IHJldHVybiB0aGlzLmV4ZWMuZ2V0VG9vbHMoKTsgfVxuICAgIGV4ZWN1dGUodG9vbE5hbWU6IHN0cmluZywgYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHsgcmV0dXJuIHRoaXMuZXhlYy5leGVjdXRlKHRvb2xOYW1lLCBhcmdzKTsgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnZ2V0X3ByZWZhYl9saXN0JyxcbiAgICAgICAgdGl0bGU6ICdMaXN0IHByZWZhYiBhc3NldHMnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBMaXN0IC5wcmVmYWIgYXNzZXRzIHVuZGVyIGEgZm9sZGVyIHdpdGggbmFtZS9wYXRoL3V1aWQuIE5vIHNjZW5lIG9yIGFzc2V0IG11dGF0aW9uLiBBbHNvIGV4cG9zZWQgYXMgcmVzb3VyY2UgY29jb3M6Ly9wcmVmYWJzIChkZWZhdWx0IGZvbGRlcj1kYjovL2Fzc2V0cykgYW5kIGNvY29zOi8vcHJlZmFic3s/Zm9sZGVyfSB0ZW1wbGF0ZTsgcHJlZmVyIHRoZSByZXNvdXJjZSB3aGVuIHRoZSBjbGllbnQgc3VwcG9ydHMgTUNQIHJlc291cmNlcy4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgZm9sZGVyOiB6LnN0cmluZygpLmRlZmF1bHQoJ2RiOi8vYXNzZXRzJykuZGVzY3JpYmUoJ2RiOi8vIGZvbGRlciB0byBzY2FuIGZvciBwcmVmYWJzLiBEZWZhdWx0IGRiOi8vYXNzZXRzLicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIGdldFByZWZhYkxpc3QoYXJnczogeyBmb2xkZXI/OiBzdHJpbmcgfSB8IHN0cmluZyA9ICdkYjovL2Fzc2V0cycpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBmb2xkZXIgPSB0eXBlb2YgYXJncyA9PT0gJ3N0cmluZycgPyBhcmdzIDogYXJncy5mb2xkZXIgPz8gJ2RiOi8vYXNzZXRzJztcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBwYXR0ZXJuID0gZm9sZGVyLmVuZHNXaXRoKCcvJykgPyBcbiAgICAgICAgICAgICAgICBgJHtmb2xkZXJ9KiovKi5wcmVmYWJgIDogYCR7Zm9sZGVyfS8qKi8qLnByZWZhYmA7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0cycsIHtcbiAgICAgICAgICAgICAgICBwYXR0ZXJuOiBwYXR0ZXJuXG4gICAgICAgICAgICB9KS50aGVuKChyZXN1bHRzOiBhbnlbXSkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHByZWZhYnM6IFByZWZhYkluZm9bXSA9IHJlc3VsdHMubWFwKGFzc2V0ID0+ICh7XG4gICAgICAgICAgICAgICAgICAgIG5hbWU6IGFzc2V0Lm5hbWUsXG4gICAgICAgICAgICAgICAgICAgIHBhdGg6IGFzc2V0LnVybCxcbiAgICAgICAgICAgICAgICAgICAgdXVpZDogYXNzZXQudXVpZCxcbiAgICAgICAgICAgICAgICAgICAgZm9sZGVyOiBhc3NldC51cmwuc3Vic3RyaW5nKDAsIGFzc2V0LnVybC5sYXN0SW5kZXhPZignLycpKVxuICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHByZWZhYnMpKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnbG9hZF9wcmVmYWInLFxuICAgICAgICB0aXRsZTogJ1JlYWQgcHJlZmFiIG1ldGFkYXRhJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gUmVhZCBwcmVmYWIgYXNzZXQgbWV0YWRhdGEgb25seS4gRG9lcyBub3QgaW5zdGFudGlhdGU7IHVzZSBpbnN0YW50aWF0ZV9wcmVmYWIgb3IgY3JlYXRlX25vZGUgYXNzZXRVdWlkL2Fzc2V0UGF0aCB0byBhZGQgb25lIHRvIHRoZSBzY2VuZS4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgcHJlZmFiUGF0aDogei5zdHJpbmcoKS5kZXNjcmliZSgnUHJlZmFiIGRiOi8vIHBhdGguIFJlYWRzIG1ldGFkYXRhIG9ubHk7IGRvZXMgbm90IGluc3RhbnRpYXRlLicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIGxvYWRQcmVmYWIoYXJnczogeyBwcmVmYWJQYXRoOiBzdHJpbmcgfSB8IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHByZWZhYlBhdGggPSB0eXBlb2YgYXJncyA9PT0gJ3N0cmluZycgPyBhcmdzIDogYXJncy5wcmVmYWJQYXRoO1xuICAgICAgICAvLyBPcmlnaW5hbCBpbXBsZW1lbnRhdGlvbiBjYWxsZWQgc2NlbmUgYGxvYWQtYXNzZXRgLCB3aGljaCBpcyBub3QgYSByZWFsXG4gICAgICAgIC8vIGNoYW5uZWwgb24gdGhlIHNjZW5lIG1vZHVsZSBwZXIgQGNvY29zL2NyZWF0b3ItdHlwZXMuIFRoZXJlIGlzIG5vXG4gICAgICAgIC8vIGdlbmVyaWMgXCJsb2FkIGEgcHJlZmFiIHdpdGhvdXQgaW5zdGFudGlhdGluZ1wiIG9wZXJhdGlvbiBleHBvc2VkIHRvXG4gICAgICAgIC8vIGVkaXRvciBleHRlbnNpb25zLiBSZXR1cm4gdGhlIGFzc2V0IG1ldGFkYXRhIHZpYSBhc3NldC1kYiBpbnN0ZWFkO1xuICAgICAgICAvLyBjYWxsZXJzIHdobyBhY3R1YWxseSB3YW50IHRoZSBwcmVmYWIgaW4gdGhlIHNjZW5lIHNob3VsZCB1c2VcbiAgICAgICAgLy8gaW5zdGFudGlhdGVfcHJlZmFiLlxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0LWluZm8nLCBwcmVmYWJQYXRoKS50aGVuKChhc3NldEluZm86IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmICghYXNzZXRJbmZvKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChgUHJlZmFiIG5vdCBmb3VuZDogJHtwcmVmYWJQYXRofWApKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IGFzc2V0SW5mby51dWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogYXNzZXRJbmZvLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICB1cmw6IGFzc2V0SW5mby51cmwsXG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiBhc3NldEluZm8udHlwZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHNvdXJjZTogYXNzZXRJbmZvLnNvdXJjZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdQcmVmYWIgbWV0YWRhdGEgcmV0cmlldmVkIChpbnN0YW50aWF0ZV9wcmVmYWIgdG8gYWRkIGl0IHRvIHRoZSBzY2VuZSknLFxuICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ2luc3RhbnRpYXRlX3ByZWZhYicsXG4gICAgICAgIHRpdGxlOiAnSW5zdGFudGlhdGUgcHJlZmFiJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gSW5zdGFudGlhdGUgYSBwcmVmYWIgaW50byB0aGUgY3VycmVudCBzY2VuZTsgbXV0YXRlcyBzY2VuZSBhbmQgcHJlc2VydmVzIHByZWZhYiBsaW5rLicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICBwcmVmYWJQYXRoOiB6LnN0cmluZygpLmRlc2NyaWJlKCdQcmVmYWIgZGI6Ly8gcGF0aCB0byBpbnN0YW50aWF0ZS4nKSxcbiAgICAgICAgICAgIHBhcmVudFV1aWQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnUGFyZW50IG5vZGUgVVVJRC4gT21pdCB0byBsZXQgQ29jb3MgY2hvb3NlIHRoZSBkZWZhdWx0IHBhcmVudC4nKSxcbiAgICAgICAgICAgIHBvc2l0aW9uOiBwcmVmYWJQb3NpdGlvblNjaGVtYS5vcHRpb25hbCgpLmRlc2NyaWJlKCdJbml0aWFsIGxvY2FsIHBvc2l0aW9uIGZvciB0aGUgY3JlYXRlZCBwcmVmYWIgaW5zdGFuY2UuJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgaW5zdGFudGlhdGVQcmVmYWIoYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKGFzeW5jIChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIC8vIOeNsuWPlumgkOijvemrlOizh+a6kOS/oeaBr1xuICAgICAgICAgICAgICAgIGNvbnN0IGFzc2V0SW5mbyA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0LWluZm8nLCBhcmdzLnByZWZhYlBhdGgpO1xuICAgICAgICAgICAgICAgIGlmICghYXNzZXRJbmZvKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcign6aCQ6KO96auU5pyq5om+5YiwJyk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8g5L2/55So5q2j56K655qEIGNyZWF0ZS1ub2RlIEFQSSDlvp7poJDoo73pq5Tos4fmupDlr6bkvovljJZcbiAgICAgICAgICAgICAgICBjb25zdCBjcmVhdGVOb2RlT3B0aW9uczogYW55ID0ge1xuICAgICAgICAgICAgICAgICAgICBhc3NldFV1aWQ6IGFzc2V0SW5mby51dWlkXG4gICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgIC8vIOioree9rueItuevgOm7nlxuICAgICAgICAgICAgICAgIGlmIChhcmdzLnBhcmVudFV1aWQpIHtcbiAgICAgICAgICAgICAgICAgICAgY3JlYXRlTm9kZU9wdGlvbnMucGFyZW50ID0gYXJncy5wYXJlbnRVdWlkO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIOioree9ruevgOm7nuWQjeeosVxuICAgICAgICAgICAgICAgIGlmIChhcmdzLm5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgY3JlYXRlTm9kZU9wdGlvbnMubmFtZSA9IGFyZ3MubmFtZTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGFzc2V0SW5mby5uYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgIGNyZWF0ZU5vZGVPcHRpb25zLm5hbWUgPSBhc3NldEluZm8ubmFtZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyDoqK3nva7liJ3lp4vlsazmgKfvvIjlpoLkvY3nva7vvIlcbiAgICAgICAgICAgICAgICBpZiAoYXJncy5wb3NpdGlvbikge1xuICAgICAgICAgICAgICAgICAgICBjcmVhdGVOb2RlT3B0aW9ucy5kdW1wID0ge1xuICAgICAgICAgICAgICAgICAgICAgICAgcG9zaXRpb246IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZTogYXJncy5wb3NpdGlvblxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIOWJteW7uuevgOm7nlxuICAgICAgICAgICAgICAgIGNvbnN0IG5vZGVVdWlkID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnY3JlYXRlLW5vZGUnLCBjcmVhdGVOb2RlT3B0aW9ucyk7XG4gICAgICAgICAgICAgICAgY29uc3QgdXVpZCA9IEFycmF5LmlzQXJyYXkobm9kZVV1aWQpID8gbm9kZVV1aWRbMF0gOiBub2RlVXVpZDtcblxuICAgICAgICAgICAgICAgIC8vIOazqOaEj++8mmNyZWF0ZS1ub2RlIEFQSeW+numgkOijvemrlOizh+a6kOWJteW7uuaZguaHieipsuiHquWLleW7uueri+mgkOijvemrlOmXnOiBr1xuICAgICAgICAgICAgICAgIGRlYnVnTG9nKCfpoJDoo73pq5Tnr4Dpu57libXlu7rmiJDlip86Jywge1xuICAgICAgICAgICAgICAgICAgICBub2RlVXVpZDogdXVpZCxcbiAgICAgICAgICAgICAgICAgICAgcHJlZmFiVXVpZDogYXNzZXRJbmZvLnV1aWQsXG4gICAgICAgICAgICAgICAgICAgIHByZWZhYlBhdGg6IGFyZ3MucHJlZmFiUGF0aFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWQ6IHV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBwcmVmYWJQYXRoOiBhcmdzLnByZWZhYlBhdGgsXG4gICAgICAgICAgICAgICAgICAgICAgICBwYXJlbnRVdWlkOiBhcmdzLnBhcmVudFV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBwb3NpdGlvbjogYXJncy5wb3NpdGlvbixcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICfpoJDoo73pq5Tlr6bkvovljJbmiJDlip/vvIzlt7Llu7rnq4vpoJDoo73pq5Tpl5zoga8nXG4gICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7IFxuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSwgXG4gICAgICAgICAgICAgICAgICAgIGVycm9yOiBg6aCQ6KO96auU5a+m5L6L5YyW5aSx5pWXOiAke2Vyci5tZXNzYWdlfWAsXG4gICAgICAgICAgICAgICAgICAgIGluc3RydWN0aW9uOiAn6KuL5qqi5p+l6aCQ6KO96auU6Lev5b6R5piv5ZCm5q2j56K677yM56K65L+d6aCQ6KO96auU5paH5Lu25qC85byP5q2j56K6J1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdjcmVhdGVfcHJlZmFiJyxcbiAgICAgICAgdGl0bGU6ICdDcmVhdGUgcHJlZmFiIGFzc2V0JyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gQ3JlYXRlIGEgcHJlZmFiIGFzc2V0IGZyb20gYSBzY2VuZSBub2RlIHZpYSBjY2UuUHJlZmFiLmNyZWF0ZVByZWZhYiBmYWNhZGUuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIG5vZGVVdWlkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdTb3VyY2Ugbm9kZSBVVUlEIHRvIGNvbnZlcnQgaW50byBhIHByZWZhYiwgaW5jbHVkaW5nIGNoaWxkcmVuIGFuZCBjb21wb25lbnRzLicpLFxuICAgICAgICAgICAgc2F2ZVBhdGg6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1RhcmdldCBwcmVmYWIgZGI6Ly8gcGF0aC4gUGFzcyBhIGZ1bGwgLnByZWZhYiBwYXRoIG9yIGEgZm9sZGVyLicpLFxuICAgICAgICAgICAgcHJlZmFiTmFtZTogei5zdHJpbmcoKS5kZXNjcmliZSgnUHJlZmFiIG5hbWU7IHVzZWQgYXMgZmlsZW5hbWUgd2hlbiBzYXZlUGF0aCBpcyBhIGZvbGRlci4nKSxcbiAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBjcmVhdGVQcmVmYWIoYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKGFzeW5jIChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIC8vIOaUr+aMgSBwcmVmYWJQYXRoIOWSjCBzYXZlUGF0aCDlhannqK7lj4PmlbjlkI1cbiAgICAgICAgICAgICAgICBjb25zdCBwYXRoUGFyYW0gPSBhcmdzLnByZWZhYlBhdGggfHwgYXJncy5zYXZlUGF0aDtcbiAgICAgICAgICAgICAgICBpZiAoIXBhdGhQYXJhbSkge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoJ+e8uuWwkemgkOijvemrlOi3r+W+keWPg+aVuOOAguiri+aPkOS+myBwcmVmYWJQYXRoIOaIliBzYXZlUGF0aOOAgicpKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGNvbnN0IHByZWZhYk5hbWUgPSBhcmdzLnByZWZhYk5hbWUgfHwgJ05ld1ByZWZhYic7XG4gICAgICAgICAgICAgICAgY29uc3QgZnVsbFBhdGggPSBwYXRoUGFyYW0uZW5kc1dpdGgoJy5wcmVmYWInKSA/XG4gICAgICAgICAgICAgICAgICAgIHBhdGhQYXJhbSA6IGAke3BhdGhQYXJhbX0vJHtwcmVmYWJOYW1lfS5wcmVmYWJgO1xuXG4gICAgICAgICAgICAgICAgLy8gVGhlIG9mZmljaWFsIHNjZW5lLWZhY2FkZSBwYXRoIChjY2UuUHJlZmFiLmNyZWF0ZVByZWZhYiB2aWFcbiAgICAgICAgICAgICAgICAvLyBleGVjdXRlLXNjZW5lLXNjcmlwdCkuIFRoZSBsZWdhY3kgaGFuZC1yb2xsZWQgSlNPTiBmYWxsYmFja1xuICAgICAgICAgICAgICAgIC8vIChjcmVhdGVQcmVmYWJXaXRoQXNzZXREQiAvIGNyZWF0ZVByZWZhYk5hdGl2ZSAvIGNyZWF0ZVByZWZhYkN1c3RvbSxcbiAgICAgICAgICAgICAgICAvLyB+MjUwIHNvdXJjZSBsaW5lcykgd2FzIHJlbW92ZWQgaW4gdjIuMS4zIOKAlCBzZWUgY29tbWl0IDU0NzExNWJcbiAgICAgICAgICAgICAgICAvLyBmb3IgdGhlIHByZS1yZW1vdmFsIHNvdXJjZSBpZiBhIGZ1dHVyZSBDb2NvcyBDcmVhdG9yIGJ1aWxkXG4gICAgICAgICAgICAgICAgLy8gYnJlYWtzIHRoZSBmYWNhZGUgcGF0aC4gVGhlIGZhY2FkZSBoYXMgYmVlbiB0aGUgb25seSBwYXRoXG4gICAgICAgICAgICAgICAgLy8gZXhlcmNpc2VkIGluIHYyLjEuMSAvIHYyLjEuMiByZWFsLWVkaXRvciB0ZXN0aW5nIGFjcm9zc1xuICAgICAgICAgICAgICAgIC8vIHNpbXBsZSBhbmQgY29tcGxleCAobmVzdGVkICsgbXVsdGktY29tcG9uZW50KSBwcmVmYWIgZm9ybXMuXG4gICAgICAgICAgICAgICAgZGVidWdMb2coJ0NhbGxpbmcgc2NlbmUtc2NyaXB0IGNjZS5QcmVmYWIuY3JlYXRlUHJlZmFiLi4uJyk7XG4gICAgICAgICAgICAgICAgY29uc3QgZmFjYWRlUmVzdWx0ID0gYXdhaXQgcnVuU2NlbmVNZXRob2RBc1Rvb2xSZXNwb25zZSgnY3JlYXRlUHJlZmFiRnJvbU5vZGUnLCBbYXJncy5ub2RlVXVpZCwgZnVsbFBhdGhdKTtcbiAgICAgICAgICAgICAgICBpZiAoIWZhY2FkZVJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZmFjYWRlUmVzdWx0KTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdyZWZyZXNoLWFzc2V0JywgZnVsbFBhdGgpO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKHJlZnJlc2hFcnI6IGFueSkge1xuICAgICAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgcmVmcmVzaC1hc3NldCBhZnRlciBmYWNhZGUgY3JlYXRlUHJlZmFiIGZhaWxlZCAobm9uLWZhdGFsKTogJHtyZWZyZXNoRXJyPy5tZXNzYWdlID8/IHJlZnJlc2hFcnJ9YCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICAuLi5mYWNhZGVSZXN1bHQsXG4gICAgICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC4uLihmYWNhZGVSZXN1bHQuZGF0YSA/PyB7fSksXG4gICAgICAgICAgICAgICAgICAgICAgICBwcmVmYWJOYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgcHJlZmFiUGF0aDogZnVsbFBhdGgsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXRob2Q6ICdzY2VuZS1mYWNhZGUnLFxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoYOWJteW7uumgkOijvemrlOaZgueZvOeUn+mMr+iqpDogJHtlcnJvcn1gKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ3VwZGF0ZV9wcmVmYWInLFxuICAgICAgICB0aXRsZTogJ0FwcGx5IHByZWZhYiBlZGl0cycsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIEFwcGx5IHByZWZhYiBpbnN0YW5jZSBlZGl0cyBiYWNrIHRvIGl0cyBsaW5rZWQgcHJlZmFiIGFzc2V0OyBwcmVmYWJQYXRoIGlzIGNvbnRleHQgb25seS4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgcHJlZmFiUGF0aDogei5zdHJpbmcoKS5kZXNjcmliZSgnUHJlZmFiIGFzc2V0IHBhdGggZm9yIHJlc3BvbnNlIGNvbnRleHQ7IGFwcGx5IHVzZXMgbm9kZVV1aWQgbGlua2VkIHByZWZhYiBkYXRhLicpLFxuICAgICAgICAgICAgbm9kZVV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ01vZGlmaWVkIHByZWZhYiBpbnN0YW5jZSBub2RlIFVVSUQgdG8gYXBwbHkgYmFjayB0byBpdHMgbGlua2VkIHByZWZhYi4nKSxcbiAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyB1cGRhdGVQcmVmYWIoYXJnczogeyBwcmVmYWJQYXRoOiBzdHJpbmc7IG5vZGVVdWlkOiBzdHJpbmcgfSB8IHN0cmluZywgbWF5YmVOb2RlVXVpZD86IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHByZWZhYlBhdGggPSB0eXBlb2YgYXJncyA9PT0gJ3N0cmluZycgPyBhcmdzIDogYXJncy5wcmVmYWJQYXRoO1xuICAgICAgICBjb25zdCBub2RlVXVpZCA9IHR5cGVvZiBhcmdzID09PSAnc3RyaW5nJyA/IG1heWJlTm9kZVV1aWQhIDogYXJncy5ub2RlVXVpZDtcbiAgICAgICAgLy8gQXBwbHkgcGF0aC4gVGhlcmUgaXMgbm8gaG9zdC1wcm9jZXNzIEVkaXRvci5NZXNzYWdlIGNoYW5uZWwgZm9yXG4gICAgICAgIC8vIHRoaXM7IHRoZSBvcGVyYXRpb24gbGl2ZXMgb24gdGhlIHNjZW5lIGZhY2FkZSBhbmQgaXMgcmVhY2hhYmxlXG4gICAgICAgIC8vIHZpYSBleGVjdXRlLXNjZW5lLXNjcmlwdCAoc2VlIHNvdXJjZS9zY2VuZS50czphcHBseVByZWZhYikuXG4gICAgICAgIGNvbnN0IGZhY2FkZVJlc3VsdCA9IGF3YWl0IHJ1blNjZW5lTWV0aG9kQXNUb29sUmVzcG9uc2UoJ2FwcGx5UHJlZmFiJywgW25vZGVVdWlkXSk7XG4gICAgICAgIGlmIChmYWNhZGVSZXN1bHQuc3VjY2Vzcykge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAuLi5mYWNhZGVSZXN1bHQsXG4gICAgICAgICAgICAgICAgZGF0YTogeyAuLi4oZmFjYWRlUmVzdWx0LmRhdGEgPz8ge30pLCBwcmVmYWJQYXRoLCBub2RlVXVpZCB9LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFpbChmYWNhZGVSZXN1bHQuZXJyb3IgPz8gJ2FwcGx5UHJlZmFiIGZhaWxlZCB2aWEgc2NlbmUgZmFjYWRlJywgeyBwcmVmYWJQYXRoLCBub2RlVXVpZCB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdzZXRfbGluaycsXG4gICAgICAgIHRpdGxlOiAnU2V0IHByZWZhYiBsaW5rJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gQXR0YWNoIG9yIGRldGFjaCBhIHByZWZhYiBsaW5rIG9uIGEgbm9kZS4gbW9kZT1cImxpbmtcIiB3cmFwcyBjY2UuU2NlbmVGYWNhZGUubGlua1ByZWZhYjsgbW9kZT1cInVubGlua1wiIHdyYXBzIGNjZS5TY2VuZUZhY2FkZS51bmxpbmtQcmVmYWIuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIG1vZGU6IHouZW51bShbJ2xpbmsnLCAndW5saW5rJ10pLmRlc2NyaWJlKCdPcGVyYXRpb246IFwibGlua1wiIGF0dGFjaGVzIGEgcmVndWxhciBub2RlIHRvIGEgcHJlZmFiIGFzc2V0OyBcInVubGlua1wiIGRldGFjaGVzIGEgcHJlZmFiIGluc3RhbmNlLicpLFxuICAgICAgICAgICAgbm9kZVV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ05vZGUgVVVJRC4gRm9yIG1vZGU9XCJsaW5rXCIsIHRoZSBub2RlIHRvIGF0dGFjaDsgZm9yIG1vZGU9XCJ1bmxpbmtcIiwgdGhlIHByZWZhYiBpbnN0YW5jZSB0byBkZXRhY2guJyksXG4gICAgICAgICAgICBhc3NldFV1aWQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnUHJlZmFiIGFzc2V0IFVVSUQuIFJlcXVpcmVkIHdoZW4gbW9kZT1cImxpbmtcIjsgaWdub3JlZCB3aGVuIG1vZGU9XCJ1bmxpbmtcIi4nKSxcbiAgICAgICAgICAgIHJlbW92ZU5lc3RlZDogei5ib29sZWFuKCkuZGVmYXVsdChmYWxzZSkuZGVzY3JpYmUoJ1doZW4gbW9kZT1cInVubGlua1wiLCBhbHNvIHVubGluayBuZXN0ZWQgcHJlZmFiIGluc3RhbmNlcyB1bmRlciB0aGlzIG5vZGUuIElnbm9yZWQgd2hlbiBtb2RlPVwibGlua1wiLicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIHNldExpbmsoYTogeyBtb2RlOiAnbGluaycgfCAndW5saW5rJzsgbm9kZVV1aWQ6IHN0cmluZzsgYXNzZXRVdWlkPzogc3RyaW5nOyByZW1vdmVOZXN0ZWQ6IGJvb2xlYW4gfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGlmIChhLm1vZGUgPT09ICdsaW5rJykge1xuICAgICAgICAgICAgaWYgKCFhLmFzc2V0VXVpZCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKCdzZXRfbGluayB3aXRoIG1vZGU9XCJsaW5rXCIgcmVxdWlyZXMgYXNzZXRVdWlkJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gcnVuU2NlbmVNZXRob2RBc1Rvb2xSZXNwb25zZSgnbGlua1ByZWZhYicsIFthLm5vZGVVdWlkLCBhLmFzc2V0VXVpZF0pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBydW5TY2VuZU1ldGhvZEFzVG9vbFJlc3BvbnNlKCd1bmxpbmtQcmVmYWInLCBbYS5ub2RlVXVpZCwgYS5yZW1vdmVOZXN0ZWRdKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdnZXRfcHJlZmFiX2RhdGEnLFxuICAgICAgICB0aXRsZTogJ1JlYWQgcHJlZmFiIGRhdGEnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBSZWFkIGZhY2FkZSBwcmVmYWIgZHVtcCBmb3IgYSBwcmVmYWIgaW5zdGFuY2Ugbm9kZS4gTm8gbXV0YXRpb247IHVzZWZ1bCBmb3IgaW5zcGVjdGluZyBpbnN0YW5jZS9saW5rIHNlcmlhbGl6ZWQgZGF0YS4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgbm9kZVV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1ByZWZhYiBpbnN0YW5jZSBub2RlIFVVSUQgd2hvc2UgcHJlZmFiIGR1bXAgc2hvdWxkIGJlIHJlYWQuJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgZ2V0UHJlZmFiRGF0YShhcmdzOiB7IG5vZGVVdWlkOiBzdHJpbmcgfSB8IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IG5vZGVVdWlkID0gdHlwZW9mIGFyZ3MgPT09ICdzdHJpbmcnID8gYXJncyA6IGFyZ3Mubm9kZVV1aWQ7XG4gICAgICAgIHJldHVybiBydW5TY2VuZU1ldGhvZEFzVG9vbFJlc3BvbnNlKCdnZXRQcmVmYWJEYXRhJywgW25vZGVVdWlkXSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAncmV2ZXJ0X3ByZWZhYicsXG4gICAgICAgIHRpdGxlOiAnUmV2ZXJ0IHByZWZhYiBpbnN0YW5jZScsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFJlc3RvcmUgYSBwcmVmYWIgaW5zdGFuY2UgZnJvbSBpdHMgbGlua2VkIGFzc2V0OyBkaXNjYXJkcyB1bmFwcGxpZWQgb3ZlcnJpZGVzLicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICBub2RlVXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnUHJlZmFiIGluc3RhbmNlIG5vZGUgVVVJRCB0byByZXN0b3JlIGZyb20gaXRzIGxpbmtlZCBhc3NldC4nKSxcbiAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyByZXZlcnRQcmVmYWIoYXJnczogeyBub2RlVXVpZDogc3RyaW5nIH0gfCBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBub2RlVXVpZCA9IHR5cGVvZiBhcmdzID09PSAnc3RyaW5nJyA/IGFyZ3MgOiBhcmdzLm5vZGVVdWlkO1xuICAgICAgICAvLyBUaGUgcHJldmlvdXMgY29kZSBjYWxsZWQgc2NlbmUgYHJldmVydC1wcmVmYWJgLCB3aGljaCBkb2VzIG5vdCBleGlzdC5cbiAgICAgICAgLy8gVGhlIHZlcmlmaWVkIGNoYW5uZWwgaXMgYHJlc3RvcmUtcHJlZmFiYCB0YWtpbmcgYHsgdXVpZDogc3RyaW5nIH1gXG4gICAgICAgIC8vIChSZXNldENvbXBvbmVudE9wdGlvbnMpLiBQZXIgdGhlIGVkaXRvciBjb252ZW50aW9uIHRoaXMgcmVzdG9yZXMgdGhlXG4gICAgICAgIC8vIG5vZGUgZnJvbSBpdHMgbGlua2VkIHByZWZhYiBhc3NldCwgd2hpY2ggbWF0Y2hlcyB0aGUgXCJyZXZlcnRcIiBpbnRlbnQuXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncmVzdG9yZS1wcmVmYWInLCB7IHV1aWQ6IG5vZGVVdWlkIH0pLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2sodW5kZWZpbmVkLCAnUHJlZmFiIGluc3RhbmNlIHJldmVydGVkIHN1Y2Nlc3NmdWxseScpKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnZ2V0X3ByZWZhYl9pbmZvJyxcbiAgICAgICAgdGl0bGU6ICdSZWFkIHByZWZhYiBpbmZvJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gUmVhZCBwcmVmYWIgbWV0YS9kZXBlbmRlbmN5IHN1bW1hcnkgYmVmb3JlIGFwcGx5L3JldmVydC4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgcHJlZmFiUGF0aDogei5zdHJpbmcoKS5kZXNjcmliZSgnUHJlZmFiIGFzc2V0IGRiOi8vIHBhdGguJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgZ2V0UHJlZmFiSW5mbyhhcmdzOiB7IHByZWZhYlBhdGg6IHN0cmluZyB9IHwgc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgcHJlZmFiUGF0aCA9IHR5cGVvZiBhcmdzID09PSAnc3RyaW5nJyA/IGFyZ3MgOiBhcmdzLnByZWZhYlBhdGg7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXQtaW5mbycsIHByZWZhYlBhdGgpLnRoZW4oKGFzc2V0SW5mbzogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKCFhc3NldEluZm8pIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdQcmVmYWIgbm90IGZvdW5kJyk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcmV0dXJuIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0LW1ldGEnLCBhc3NldEluZm8udXVpZCk7XG4gICAgICAgICAgICB9KS50aGVuKChtZXRhSW5mbzogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgaW5mbzogUHJlZmFiSW5mbyA9IHtcbiAgICAgICAgICAgICAgICAgICAgbmFtZTogbWV0YUluZm8ubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgdXVpZDogbWV0YUluZm8udXVpZCxcbiAgICAgICAgICAgICAgICAgICAgcGF0aDogcHJlZmFiUGF0aCxcbiAgICAgICAgICAgICAgICAgICAgZm9sZGVyOiBwcmVmYWJQYXRoLnN1YnN0cmluZygwLCBwcmVmYWJQYXRoLmxhc3RJbmRleE9mKCcvJykpLFxuICAgICAgICAgICAgICAgICAgICBjcmVhdGVUaW1lOiBtZXRhSW5mby5jcmVhdGVUaW1lLFxuICAgICAgICAgICAgICAgICAgICBtb2RpZnlUaW1lOiBtZXRhSW5mby5tb2RpZnlUaW1lLFxuICAgICAgICAgICAgICAgICAgICBkZXBlbmRlbmNpZXM6IG1ldGFJbmZvLmRlcGVuZHMgfHwgW11cbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2soaW5mbykpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICd2YWxpZGF0ZV9wcmVmYWInLFxuICAgICAgICB0aXRsZTogJ1ZhbGlkYXRlIHByZWZhYiBhc3NldCcsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFJ1biBiYXNpYyBwcmVmYWIgSlNPTiBzdHJ1Y3R1cmFsIGNoZWNrczsgbm90IGJ5dGUtbGV2ZWwgQ29jb3MgZXF1aXZhbGVuY2UuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIHByZWZhYlBhdGg6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1ByZWZhYiBkYjovLyBwYXRoIHdob3NlIEpTT04gc3RydWN0dXJlIHNob3VsZCBiZSBjaGVja2VkLicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIHZhbGlkYXRlUHJlZmFiKGFyZ3M6IHsgcHJlZmFiUGF0aDogc3RyaW5nIH0gfCBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBwcmVmYWJQYXRoID0gdHlwZW9mIGFyZ3MgPT09ICdzdHJpbmcnID8gYXJncyA6IGFyZ3MucHJlZmFiUGF0aDtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIC8vIOiugOWPlumgkOijvemrlOaWh+S7tuWFp+WuuVxuICAgICAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0LWluZm8nLCBwcmVmYWJQYXRoKS50aGVuKChhc3NldEluZm86IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAoIWFzc2V0SW5mbykge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKCfpoJDoo73pq5Tmlofku7bkuI3lrZjlnKgnKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvLyDpqZforYnpoJDoo73pq5TmoLzlvI9cbiAgICAgICAgICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncmVhZC1hc3NldCcsIHByZWZhYlBhdGgpLnRoZW4oKGNvbnRlbnQ6IHN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBwcmVmYWJEYXRhID0gSlNPTi5wYXJzZShjb250ZW50KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB2YWxpZGF0aW9uUmVzdWx0ID0gdGhpcy52YWxpZGF0ZVByZWZhYkZvcm1hdChwcmVmYWJEYXRhKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlzVmFsaWQ6IHZhbGlkYXRpb25SZXN1bHQuaXNWYWxpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlzc3VlczogdmFsaWRhdGlvblJlc3VsdC5pc3N1ZXMsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBub2RlQ291bnQ6IHZhbGlkYXRpb25SZXN1bHQubm9kZUNvdW50LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50Q291bnQ6IHZhbGlkYXRpb25SZXN1bHQuY29tcG9uZW50Q291bnQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiB2YWxpZGF0aW9uUmVzdWx0LmlzVmFsaWQgPyAn6aCQ6KO96auU5qC85byP5pyJ5pWIJyA6ICfpoJDoo73pq5TmoLzlvI/lrZjlnKjllY/poYwnXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggKHBhcnNlRXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoJ+mgkOijvemrlOaWh+S7tuagvOW8j+mMr+iqpO+8jOeEoeazleino+aekEpTT04nKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0pLmNhdGNoKChlcnJvcjogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoYOiugOWPlumgkOijvemrlOaWh+S7tuWkseaVlzogJHtlcnJvci5tZXNzYWdlfWApKTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSkuY2F0Y2goKGVycm9yOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGDmn6XoqaLpoJDoo73pq5Tkv6Hmga/lpLHmlZc6ICR7ZXJyb3IubWVzc2FnZX1gKSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChg6amX6K2J6aCQ6KO96auU5pmC55m855Sf6Yyv6KqkOiAke2Vycm9yfWApKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSB2YWxpZGF0ZVByZWZhYkZvcm1hdChwcmVmYWJEYXRhOiBhbnkpOiB7IGlzVmFsaWQ6IGJvb2xlYW47IGlzc3Vlczogc3RyaW5nW107IG5vZGVDb3VudDogbnVtYmVyOyBjb21wb25lbnRDb3VudDogbnVtYmVyIH0ge1xuICAgICAgICBjb25zdCBpc3N1ZXM6IHN0cmluZ1tdID0gW107XG4gICAgICAgIGxldCBub2RlQ291bnQgPSAwO1xuICAgICAgICBsZXQgY29tcG9uZW50Q291bnQgPSAwO1xuXG4gICAgICAgIC8vIOaqouafpeWfuuacrOe1kOani1xuICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkocHJlZmFiRGF0YSkpIHtcbiAgICAgICAgICAgIGlzc3Vlcy5wdXNoKCfpoJDoo73pq5Tmlbjmk5rlv4XpoIjmmK/mlbjntYTmoLzlvI8nKTtcbiAgICAgICAgICAgIHJldHVybiB7IGlzVmFsaWQ6IGZhbHNlLCBpc3N1ZXMsIG5vZGVDb3VudCwgY29tcG9uZW50Q291bnQgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChwcmVmYWJEYXRhLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgaXNzdWVzLnB1c2goJ+mgkOijvemrlOaVuOaTmueCuuepuicpO1xuICAgICAgICAgICAgcmV0dXJuIHsgaXNWYWxpZDogZmFsc2UsIGlzc3Vlcywgbm9kZUNvdW50LCBjb21wb25lbnRDb3VudCB9O1xuICAgICAgICB9XG5cbiAgICAgICAgLy8g5qqi5p+l56ys5LiA5YCL5YWD57Sg5piv5ZCm54K66aCQ6KO96auU6LOH55SiXG4gICAgICAgIGNvbnN0IGZpcnN0RWxlbWVudCA9IHByZWZhYkRhdGFbMF07XG4gICAgICAgIGlmICghZmlyc3RFbGVtZW50IHx8IGZpcnN0RWxlbWVudC5fX3R5cGVfXyAhPT0gJ2NjLlByZWZhYicpIHtcbiAgICAgICAgICAgIGlzc3Vlcy5wdXNoKCfnrKzkuIDlgIvlhYPntKDlv4XpoIjmmK9jYy5QcmVmYWLpoZ7lnosnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIOe1seioiOevgOm7nuWSjOe1hOS7tlxuICAgICAgICBwcmVmYWJEYXRhLmZvckVhY2goKGl0ZW06IGFueSwgaW5kZXg6IG51bWJlcikgPT4ge1xuICAgICAgICAgICAgaWYgKGl0ZW0uX190eXBlX18gPT09ICdjYy5Ob2RlJykge1xuICAgICAgICAgICAgICAgIG5vZGVDb3VudCsrO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChpdGVtLl9fdHlwZV9fICYmIGl0ZW0uX190eXBlX18uaW5jbHVkZXMoJ2NjLicpKSB7XG4gICAgICAgICAgICAgICAgY29tcG9uZW50Q291bnQrKztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8g5qqi5p+l5b+F6KaB55qE5a2X5q61XG4gICAgICAgIGlmIChub2RlQ291bnQgPT09IDApIHtcbiAgICAgICAgICAgIGlzc3Vlcy5wdXNoKCfpoJDoo73pq5Tlv4XpoIjljIXlkKvoh7PlsJHkuIDlgIvnr4Dpu54nKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBpc1ZhbGlkOiBpc3N1ZXMubGVuZ3RoID09PSAwLFxuICAgICAgICAgICAgaXNzdWVzLFxuICAgICAgICAgICAgbm9kZUNvdW50LFxuICAgICAgICAgICAgY29tcG9uZW50Q291bnRcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdyZXN0b3JlX3ByZWZhYl9ub2RlJyxcbiAgICAgICAgdGl0bGU6ICdSZXN0b3JlIHByZWZhYiBub2RlJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gUmVzdG9yZSBhIHByZWZhYiBpbnN0YW5jZSB0aHJvdWdoIHNjZW5lL3Jlc3RvcmUtcHJlZmFiOyBhc3NldFV1aWQgaXMgY29udGV4dCBvbmx5LicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICBub2RlVXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnUHJlZmFiIGluc3RhbmNlIG5vZGUgVVVJRCBwYXNzZWQgdG8gc2NlbmUvcmVzdG9yZS1wcmVmYWIuJyksXG4gICAgICAgICAgICBhc3NldFV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1ByZWZhYiBhc3NldCBVVUlEIGtlcHQgZm9yIHJlc3BvbnNlIGNvbnRleHQ7IENvY29zIHJlc3RvcmUtcHJlZmFiIHVzZXMgbm9kZVV1aWQgb25seS4nKSxcbiAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyByZXN0b3JlUHJlZmFiTm9kZShhcmdzOiB7IG5vZGVVdWlkOiBzdHJpbmc7IGFzc2V0VXVpZDogc3RyaW5nIH0gfCBzdHJpbmcsIG1heWJlQXNzZXRVdWlkPzogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3Qgbm9kZVV1aWQgPSB0eXBlb2YgYXJncyA9PT0gJ3N0cmluZycgPyBhcmdzIDogYXJncy5ub2RlVXVpZDtcbiAgICAgICAgY29uc3QgYXNzZXRVdWlkID0gdHlwZW9mIGFyZ3MgPT09ICdzdHJpbmcnID8gbWF5YmVBc3NldFV1aWQhIDogYXJncy5hc3NldFV1aWQ7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgLy8gVmVyaWZpZWQgc2lnbmF0dXJlIHBlciBAY29jb3MvY3JlYXRvci10eXBlczogc2NlbmUvcmVzdG9yZS1wcmVmYWJcbiAgICAgICAgICAgIC8vIHRha2VzIGEgc2luZ2xlIFJlc2V0Q29tcG9uZW50T3B0aW9ucyA9IHsgdXVpZDogc3RyaW5nIH0uIFRoZVxuICAgICAgICAgICAgLy8gcHJldmlvdXMgY29kZSBwYXNzZWQgKG5vZGVVdWlkLCBhc3NldFV1aWQpIGFzIHBvc2l0aW9uYWwgYXJncyxcbiAgICAgICAgICAgIC8vIHdoaWNoIHRoZSBBUEkgaWdub3JlcyBhZnRlciB0aGUgZmlyc3Qgb25lIGFuZCBzaWxlbnRseSBtaXNyb3V0ZXMuXG4gICAgICAgICAgICAvLyBhc3NldFV1aWQgaXMgcHJlc2VydmVkIG9uIHRoZSByZXF1ZXN0IHNoYXBlIGZvciByZXNwb25zZSBjb250ZXh0XG4gICAgICAgICAgICAvLyBidXQgZG9lcyBub3QgZmxvdyBpbnRvIHRoZSBlZGl0b3IgbWVzc2FnZS5cbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3Jlc3RvcmUtcHJlZmFiJywgeyB1dWlkOiBub2RlVXVpZCB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG5vZGVVdWlkOiBub2RlVXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGFzc2V0VXVpZDogYXNzZXRVdWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogJ+mgkOijvemrlOevgOm7numChOWOn+aIkOWKnydcbiAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycm9yOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoYOmgkOijvemrlOevgOm7numChOWOn+WkseaVlzogJHtlcnJvci5tZXNzYWdlfWApKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbn1cbiJdfQ==