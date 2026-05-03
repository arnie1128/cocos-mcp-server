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
const node_tools_1 = require("./node-tools");
const component_tools_1 = require("./component-tools");
const prefabPositionSchema = schema_1.z.object({
    x: schema_1.z.number().optional(),
    y: schema_1.z.number().optional(),
    z: schema_1.z.number().optional(),
});
class PrefabTools {
    constructor() {
        this.nodeTools = new node_tools_1.NodeTools();
        this.componentTools = new component_tools_1.ComponentTools();
        this.exec = (0, decorators_1.defineToolsFromDecorators)(this);
    }
    getTools() { return this.exec.getTools(); }
    execute(toolName, args) { return this.exec.execute(toolName, args); }
    async createFromSpec(args) {
        return new Promise(async (resolve) => {
            var _a, _b;
            try {
                const treeResult = await this.nodeTools.execute('create_tree', {
                    spec: [args.rootSpec],
                    parentUuid: args.parentUuid,
                });
                if (!treeResult.success) {
                    resolve(treeResult);
                    return;
                }
                const createdNodes = ((_a = treeResult.data) === null || _a === void 0 ? void 0 : _a.nodes) || {};
                const rootNodeUuid = createdNodes[args.rootSpec.name];
                if (!rootNodeUuid) {
                    resolve((0, response_1.fail)('Root node UUID missing from create_tree result'));
                    return;
                }
                if (args.autoBindMode !== 'none') {
                    for (const uuid of Object.values(createdNodes)) {
                        const nodeData = await Editor.Message.request('scene', 'query-node', uuid);
                        const comps = (nodeData === null || nodeData === void 0 ? void 0 : nodeData.__comps__) || [];
                        for (const comp of comps) {
                            const componentType = comp === null || comp === void 0 ? void 0 : comp.__type__;
                            if (typeof componentType === 'string' && !componentType.startsWith('cc.')) {
                                await this.componentTools.execute('auto_bind', {
                                    nodeUuid: uuid,
                                    componentType,
                                    mode: args.autoBindMode,
                                });
                            }
                        }
                    }
                }
                const prefabResult = await (0, scene_bridge_1.runSceneMethodAsToolResponse)('createPrefabFromNode', [rootNodeUuid, args.prefabPath]);
                if (prefabResult.success) {
                    resolve((0, response_1.ok)(Object.assign(Object.assign({}, ((_b = prefabResult.data) !== null && _b !== void 0 ? _b : {})), { createdNodes })));
                    return;
                }
                resolve(prefabResult);
            }
            catch (err) {
                resolve((0, response_1.fail)(`Failed to create prefab from spec: ${err.message}`));
            }
        });
    }
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
        name: 'create_from_spec',
        title: 'Create prefab from spec',
        description: '[specialist] Create a scene node tree from a spec, auto-bind custom script references, then save it as a prefab asset.',
        inputSchema: schema_1.z.object({
            prefabPath: schema_1.z.string().describe('Target prefab db:// path.'),
            rootSpec: schema_1.z.object({
                name: schema_1.z.string(),
                nodeType: schema_1.z.enum(['Node', '2DNode', '3DNode']).default('Node').optional(),
                components: schema_1.z.array(schema_1.z.string()).optional(),
                layer: schema_1.z.union([
                    schema_1.z.enum(['DEFAULT', 'UI_2D', 'UI_3D', 'SCENE_GIZMO', 'EDITOR', 'GIZMOS', 'IGNORE_RAYCAST', 'PROFILER']),
                    schema_1.z.number().int().nonnegative(),
                ]).optional(),
                active: schema_1.z.boolean().optional(),
                position: schema_1.z.object({
                    x: schema_1.z.number().optional(),
                    y: schema_1.z.number().optional(),
                    z: schema_1.z.number().optional(),
                }).optional(),
                children: schema_1.z.array(schema_1.z.any()).optional(),
            }).describe('Root node spec passed to create_tree.'),
            autoBindMode: schema_1.z.enum(['strict', 'fuzzy', 'none']).default('strict').describe('Auto-bind mode for custom script components.'),
            parentUuid: schema_1.z.string().optional().describe('Optional parent node UUID for temporary scene construction.'),
        }),
    })
], PrefabTools.prototype, "createFromSpec", null);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJlZmFiLXRvb2xzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL3Rvb2xzL3ByZWZhYi10b29scy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7QUFBQSw4Q0FBMkM7QUFFM0Msb0NBQXNDO0FBQ3RDLDBDQUFrQztBQUNsQyxrREFBdUU7QUFDdkUsc0RBQW1FO0FBQ25FLDZDQUF5QztBQUN6Qyx1REFBbUQ7QUFFbkQsTUFBTSxvQkFBb0IsR0FBRyxVQUFDLENBQUMsTUFBTSxDQUFDO0lBQ2xDLENBQUMsRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxFQUFFO0lBQ3hCLENBQUMsRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxFQUFFO0lBQ3hCLENBQUMsRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxFQUFFO0NBQzNCLENBQUMsQ0FBQztBQUVILE1BQWEsV0FBVztJQUtwQjtRQUhpQixjQUFTLEdBQUcsSUFBSSxzQkFBUyxFQUFFLENBQUM7UUFDNUIsbUJBQWMsR0FBRyxJQUFJLGdDQUFjLEVBQUUsQ0FBQztRQUduRCxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUEsc0NBQXlCLEVBQUMsSUFBSSxDQUFDLENBQUM7SUFDaEQsQ0FBQztJQUVELFFBQVEsS0FBdUIsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUM3RCxPQUFPLENBQUMsUUFBZ0IsRUFBRSxJQUFTLElBQTJCLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztJQTRCbkcsQUFBTixLQUFLLENBQUMsY0FBYyxDQUFDLElBQVM7UUFDMUIsT0FBTyxJQUFJLE9BQU8sQ0FBQyxLQUFLLEVBQUUsT0FBTyxFQUFFLEVBQUU7O1lBQ2pDLElBQUksQ0FBQztnQkFDRCxNQUFNLFVBQVUsR0FB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QUFJLEVBQUUsaUJBQWlCO1FBQ3ZCLEtBQUssRUFBRSxrQkFBa0I7UUFDekIsV0FBVyxFQUFFLHVFQUF1RTtRQUNwRixXQUFXLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQztZQUNsQixVQUFVLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQywwQkFBMEIsQ0FBQztTQUM5RCxDQUFDO0tBQ0wsQ0FBQztnREF5QkQ7QUFVSztJQVJMLElBQUEsb0JBQU8sRUFBQztRQUNMLElBQUksRUFBRSxpQkFBaUI7UUFDdkIsS0FBSyxFQUFFLHVCQUF1QjtRQUM5QixXQUFXLEVBQUUseUZBQXlGO1FBQ3RHLFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDO1lBQ2xCLFVBQVUsRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLDJEQUEyRCxDQUFDO1NBQy9GLENBQUM7S0FDTCxDQUFDO2lEQXNDRDtBQXVESztJQVRMLElBQUEsb0JBQU8sRUFBQztRQUNMLElBQUksRUFBRSxxQkFBcUI7UUFDM0IsS0FBSyxFQUFFLHFCQUFxQjtRQUM1QixXQUFXLEVBQUUsaUdBQWlHO1FBQzlHLFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDO1lBQ2xCLFFBQVEsRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLDJEQUEyRCxDQUFDO1lBQzFGLFNBQVMsRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLHVGQUF1RixDQUFDO1NBQzFILENBQUM7S0FDTCxDQUFDO29EQXFCRCIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IG9rLCBmYWlsIH0gZnJvbSAnLi4vbGliL3Jlc3BvbnNlJztcbmltcG9ydCB7IFRvb2xEZWZpbml0aW9uLCBUb29sUmVzcG9uc2UsIFRvb2xFeGVjdXRvciwgUHJlZmFiSW5mbyB9IGZyb20gJy4uL3R5cGVzJztcbmltcG9ydCB7IGRlYnVnTG9nIH0gZnJvbSAnLi4vbGliL2xvZyc7XG5pbXBvcnQgeyB6IH0gZnJvbSAnLi4vbGliL3NjaGVtYSc7XG5pbXBvcnQgeyBtY3BUb29sLCBkZWZpbmVUb29sc0Zyb21EZWNvcmF0b3JzIH0gZnJvbSAnLi4vbGliL2RlY29yYXRvcnMnO1xuaW1wb3J0IHsgcnVuU2NlbmVNZXRob2RBc1Rvb2xSZXNwb25zZSB9IGZyb20gJy4uL2xpYi9zY2VuZS1icmlkZ2UnO1xuaW1wb3J0IHsgTm9kZVRvb2xzIH0gZnJvbSAnLi9ub2RlLXRvb2xzJztcbmltcG9ydCB7IENvbXBvbmVudFRvb2xzIH0gZnJvbSAnLi9jb21wb25lbnQtdG9vbHMnO1xuXG5jb25zdCBwcmVmYWJQb3NpdGlvblNjaGVtYSA9IHoub2JqZWN0KHtcbiAgICB4OiB6Lm51bWJlcigpLm9wdGlvbmFsKCksXG4gICAgeTogei5udW1iZXIoKS5vcHRpb25hbCgpLFxuICAgIHo6IHoubnVtYmVyKCkub3B0aW9uYWwoKSxcbn0pO1xuXG5leHBvcnQgY2xhc3MgUHJlZmFiVG9vbHMgaW1wbGVtZW50cyBUb29sRXhlY3V0b3Ige1xuICAgIHByaXZhdGUgcmVhZG9ubHkgZXhlYzogVG9vbEV4ZWN1dG9yO1xuICAgIHByaXZhdGUgcmVhZG9ubHkgbm9kZVRvb2xzID0gbmV3IE5vZGVUb29scygpO1xuICAgIHByaXZhdGUgcmVhZG9ubHkgY29tcG9uZW50VG9vbHMgPSBuZXcgQ29tcG9uZW50VG9vbHMoKTtcblxuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICB0aGlzLmV4ZWMgPSBkZWZpbmVUb29sc0Zyb21EZWNvcmF0b3JzKHRoaXMpO1xuICAgIH1cblxuICAgIGdldFRvb2xzKCk6IFRvb2xEZWZpbml0aW9uW10geyByZXR1cm4gdGhpcy5leGVjLmdldFRvb2xzKCk7IH1cbiAgICBleGVjdXRlKHRvb2xOYW1lOiBzdHJpbmcsIGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7IHJldHVybiB0aGlzLmV4ZWMuZXhlY3V0ZSh0b29sTmFtZSwgYXJncyk7IH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ2NyZWF0ZV9mcm9tX3NwZWMnLFxuICAgICAgICB0aXRsZTogJ0NyZWF0ZSBwcmVmYWIgZnJvbSBzcGVjJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gQ3JlYXRlIGEgc2NlbmUgbm9kZSB0cmVlIGZyb20gYSBzcGVjLCBhdXRvLWJpbmQgY3VzdG9tIHNjcmlwdCByZWZlcmVuY2VzLCB0aGVuIHNhdmUgaXQgYXMgYSBwcmVmYWIgYXNzZXQuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIHByZWZhYlBhdGg6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1RhcmdldCBwcmVmYWIgZGI6Ly8gcGF0aC4nKSxcbiAgICAgICAgICAgIHJvb3RTcGVjOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgbmFtZTogei5zdHJpbmcoKSxcbiAgICAgICAgICAgICAgICBub2RlVHlwZTogei5lbnVtKFsnTm9kZScsICcyRE5vZGUnLCAnM0ROb2RlJ10pLmRlZmF1bHQoJ05vZGUnKS5vcHRpb25hbCgpLFxuICAgICAgICAgICAgICAgIGNvbXBvbmVudHM6IHouYXJyYXkoei5zdHJpbmcoKSkub3B0aW9uYWwoKSxcbiAgICAgICAgICAgICAgICBsYXllcjogei51bmlvbihbXG4gICAgICAgICAgICAgICAgICAgIHouZW51bShbJ0RFRkFVTFQnLCAnVUlfMkQnLCAnVUlfM0QnLCAnU0NFTkVfR0laTU8nLCAnRURJVE9SJywgJ0dJWk1PUycsICdJR05PUkVfUkFZQ0FTVCcsICdQUk9GSUxFUiddKSxcbiAgICAgICAgICAgICAgICAgICAgei5udW1iZXIoKS5pbnQoKS5ub25uZWdhdGl2ZSgpLFxuICAgICAgICAgICAgICAgIF0pLm9wdGlvbmFsKCksXG4gICAgICAgICAgICAgICAgYWN0aXZlOiB6LmJvb2xlYW4oKS5vcHRpb25hbCgpLFxuICAgICAgICAgICAgICAgIHBvc2l0aW9uOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHg6IHoubnVtYmVyKCkub3B0aW9uYWwoKSxcbiAgICAgICAgICAgICAgICAgICAgeTogei5udW1iZXIoKS5vcHRpb25hbCgpLFxuICAgICAgICAgICAgICAgICAgICB6OiB6Lm51bWJlcigpLm9wdGlvbmFsKCksXG4gICAgICAgICAgICAgICAgfSkub3B0aW9uYWwoKSxcbiAgICAgICAgICAgICAgICBjaGlsZHJlbjogei5hcnJheSh6LmFueSgpKS5vcHRpb25hbCgpLFxuICAgICAgICAgICAgfSkuZGVzY3JpYmUoJ1Jvb3Qgbm9kZSBzcGVjIHBhc3NlZCB0byBjcmVhdGVfdHJlZS4nKSxcbiAgICAgICAgICAgIGF1dG9CaW5kTW9kZTogei5lbnVtKFsnc3RyaWN0JywgJ2Z1enp5JywgJ25vbmUnXSkuZGVmYXVsdCgnc3RyaWN0JykuZGVzY3JpYmUoJ0F1dG8tYmluZCBtb2RlIGZvciBjdXN0b20gc2NyaXB0IGNvbXBvbmVudHMuJyksXG4gICAgICAgICAgICBwYXJlbnRVdWlkOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ09wdGlvbmFsIHBhcmVudCBub2RlIFVVSUQgZm9yIHRlbXBvcmFyeSBzY2VuZSBjb25zdHJ1Y3Rpb24uJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgY3JlYXRlRnJvbVNwZWMoYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKGFzeW5jIChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHRyZWVSZXN1bHQgPSBhd2FpdCB0aGlzLm5vZGVUb29scy5leGVjdXRlKCdjcmVhdGVfdHJlZScsIHtcbiAgICAgICAgICAgICAgICAgICAgc3BlYzogW2FyZ3Mucm9vdFNwZWNdLFxuICAgICAgICAgICAgICAgICAgICBwYXJlbnRVdWlkOiBhcmdzLnBhcmVudFV1aWQsXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgaWYgKCF0cmVlUmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh0cmVlUmVzdWx0KTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGNvbnN0IGNyZWF0ZWROb2RlcyA9IHRyZWVSZXN1bHQuZGF0YT8ubm9kZXMgfHwge307XG4gICAgICAgICAgICAgICAgY29uc3Qgcm9vdE5vZGVVdWlkID0gY3JlYXRlZE5vZGVzW2FyZ3Mucm9vdFNwZWMubmFtZV07XG4gICAgICAgICAgICAgICAgaWYgKCFyb290Tm9kZVV1aWQpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKCdSb290IG5vZGUgVVVJRCBtaXNzaW5nIGZyb20gY3JlYXRlX3RyZWUgcmVzdWx0JykpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKGFyZ3MuYXV0b0JpbmRNb2RlICE9PSAnbm9uZScpIHtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChjb25zdCB1dWlkIG9mIE9iamVjdC52YWx1ZXMoY3JlYXRlZE5vZGVzKSBhcyBzdHJpbmdbXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgbm9kZURhdGE6IGFueSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LW5vZGUnLCB1dWlkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbXBzOiBhbnlbXSA9IG5vZGVEYXRhPy5fX2NvbXBzX18gfHwgW107XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGNvbXAgb2YgY29tcHMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjb21wb25lbnRUeXBlID0gY29tcD8uX190eXBlX187XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBjb21wb25lbnRUeXBlID09PSAnc3RyaW5nJyAmJiAhY29tcG9uZW50VHlwZS5zdGFydHNXaXRoKCdjYy4nKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLmNvbXBvbmVudFRvb2xzLmV4ZWN1dGUoJ2F1dG9fYmluZCcsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5vZGVVdWlkOiB1dWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50VHlwZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vZGU6IGFyZ3MuYXV0b0JpbmRNb2RlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBjb25zdCBwcmVmYWJSZXN1bHQgPSBhd2FpdCBydW5TY2VuZU1ldGhvZEFzVG9vbFJlc3BvbnNlKCdjcmVhdGVQcmVmYWJGcm9tTm9kZScsIFtyb290Tm9kZVV1aWQsIGFyZ3MucHJlZmFiUGF0aF0pO1xuICAgICAgICAgICAgICAgIGlmIChwcmVmYWJSZXN1bHQuc3VjY2Vzcykge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC4uLihwcmVmYWJSZXN1bHQuZGF0YSA/PyB7fSksXG4gICAgICAgICAgICAgICAgICAgICAgICBjcmVhdGVkTm9kZXMsXG4gICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJlc29sdmUocHJlZmFiUmVzdWx0KTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGBGYWlsZWQgdG8gY3JlYXRlIHByZWZhYiBmcm9tIHNwZWM6ICR7ZXJyLm1lc3NhZ2V9YCkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdnZXRfcHJlZmFiX2xpc3QnLFxuICAgICAgICB0aXRsZTogJ0xpc3QgcHJlZmFiIGFzc2V0cycsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIExpc3QgLnByZWZhYiBhc3NldHMgdW5kZXIgYSBmb2xkZXIgd2l0aCBuYW1lL3BhdGgvdXVpZC4gTm8gc2NlbmUgb3IgYXNzZXQgbXV0YXRpb24uIEFsc28gZXhwb3NlZCBhcyByZXNvdXJjZSBjb2NvczovL3ByZWZhYnMgKGRlZmF1bHQgZm9sZGVyPWRiOi8vYXNzZXRzKSBhbmQgY29jb3M6Ly9wcmVmYWJzez9mb2xkZXJ9IHRlbXBsYXRlOyBwcmVmZXIgdGhlIHJlc291cmNlIHdoZW4gdGhlIGNsaWVudCBzdXBwb3J0cyBNQ1AgcmVzb3VyY2VzLicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICBmb2xkZXI6IHouc3RyaW5nKCkuZGVmYXVsdCgnZGI6Ly9hc3NldHMnKS5kZXNjcmliZSgnZGI6Ly8gZm9sZGVyIHRvIHNjYW4gZm9yIHByZWZhYnMuIERlZmF1bHQgZGI6Ly9hc3NldHMuJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgZ2V0UHJlZmFiTGlzdChhcmdzOiB7IGZvbGRlcj86IHN0cmluZyB9IHwgc3RyaW5nID0gJ2RiOi8vYXNzZXRzJyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IGZvbGRlciA9IHR5cGVvZiBhcmdzID09PSAnc3RyaW5nJyA/IGFyZ3MgOiBhcmdzLmZvbGRlciA/PyAnZGI6Ly9hc3NldHMnO1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHBhdHRlcm4gPSBmb2xkZXIuZW5kc1dpdGgoJy8nKSA/IFxuICAgICAgICAgICAgICAgIGAke2ZvbGRlcn0qKi8qLnByZWZhYmAgOiBgJHtmb2xkZXJ9LyoqLyoucHJlZmFiYDtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXRzJywge1xuICAgICAgICAgICAgICAgIHBhdHRlcm46IHBhdHRlcm5cbiAgICAgICAgICAgIH0pLnRoZW4oKHJlc3VsdHM6IGFueVtdKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgcHJlZmFiczogUHJlZmFiSW5mb1tdID0gcmVzdWx0cy5tYXAoYXNzZXQgPT4gKHtcbiAgICAgICAgICAgICAgICAgICAgbmFtZTogYXNzZXQubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgcGF0aDogYXNzZXQudXJsLFxuICAgICAgICAgICAgICAgICAgICB1dWlkOiBhc3NldC51dWlkLFxuICAgICAgICAgICAgICAgICAgICBmb2xkZXI6IGFzc2V0LnVybC5zdWJzdHJpbmcoMCwgYXNzZXQudXJsLmxhc3RJbmRleE9mKCcvJykpXG4gICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2socHJlZmFicykpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdsb2FkX3ByZWZhYicsXG4gICAgICAgIHRpdGxlOiAnUmVhZCBwcmVmYWIgbWV0YWRhdGEnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBSZWFkIHByZWZhYiBhc3NldCBtZXRhZGF0YSBvbmx5LiBEb2VzIG5vdCBpbnN0YW50aWF0ZTsgdXNlIGluc3RhbnRpYXRlX3ByZWZhYiBvciBjcmVhdGVfbm9kZSBhc3NldFV1aWQvYXNzZXRQYXRoIHRvIGFkZCBvbmUgdG8gdGhlIHNjZW5lLicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICBwcmVmYWJQYXRoOiB6LnN0cmluZygpLmRlc2NyaWJlKCdQcmVmYWIgZGI6Ly8gcGF0aC4gUmVhZHMgbWV0YWRhdGEgb25seTsgZG9lcyBub3QgaW5zdGFudGlhdGUuJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgbG9hZFByZWZhYihhcmdzOiB7IHByZWZhYlBhdGg6IHN0cmluZyB9IHwgc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgcHJlZmFiUGF0aCA9IHR5cGVvZiBhcmdzID09PSAnc3RyaW5nJyA/IGFyZ3MgOiBhcmdzLnByZWZhYlBhdGg7XG4gICAgICAgIC8vIE9yaWdpbmFsIGltcGxlbWVudGF0aW9uIGNhbGxlZCBzY2VuZSBgbG9hZC1hc3NldGAsIHdoaWNoIGlzIG5vdCBhIHJlYWxcbiAgICAgICAgLy8gY2hhbm5lbCBvbiB0aGUgc2NlbmUgbW9kdWxlIHBlciBAY29jb3MvY3JlYXRvci10eXBlcy4gVGhlcmUgaXMgbm9cbiAgICAgICAgLy8gZ2VuZXJpYyBcImxvYWQgYSBwcmVmYWIgd2l0aG91dCBpbnN0YW50aWF0aW5nXCIgb3BlcmF0aW9uIGV4cG9zZWQgdG9cbiAgICAgICAgLy8gZWRpdG9yIGV4dGVuc2lvbnMuIFJldHVybiB0aGUgYXNzZXQgbWV0YWRhdGEgdmlhIGFzc2V0LWRiIGluc3RlYWQ7XG4gICAgICAgIC8vIGNhbGxlcnMgd2hvIGFjdHVhbGx5IHdhbnQgdGhlIHByZWZhYiBpbiB0aGUgc2NlbmUgc2hvdWxkIHVzZVxuICAgICAgICAvLyBpbnN0YW50aWF0ZV9wcmVmYWIuXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXQtaW5mbycsIHByZWZhYlBhdGgpLnRoZW4oKGFzc2V0SW5mbzogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKCFhc3NldEluZm8pIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGBQcmVmYWIgbm90IGZvdW5kOiAke3ByZWZhYlBhdGh9YCkpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgdXVpZDogYXNzZXRJbmZvLnV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBuYW1lOiBhc3NldEluZm8ubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHVybDogYXNzZXRJbmZvLnVybCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6IGFzc2V0SW5mby50eXBlLFxuICAgICAgICAgICAgICAgICAgICAgICAgc291cmNlOiBhc3NldEluZm8uc291cmNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogJ1ByZWZhYiBtZXRhZGF0YSByZXRyaWV2ZWQgKGluc3RhbnRpYXRlX3ByZWZhYiB0byBhZGQgaXQgdG8gdGhlIHNjZW5lKScsXG4gICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnaW5zdGFudGlhdGVfcHJlZmFiJyxcbiAgICAgICAgdGl0bGU6ICdJbnN0YW50aWF0ZSBwcmVmYWInLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBJbnN0YW50aWF0ZSBhIHByZWZhYiBpbnRvIHRoZSBjdXJyZW50IHNjZW5lOyBtdXRhdGVzIHNjZW5lIGFuZCBwcmVzZXJ2ZXMgcHJlZmFiIGxpbmsuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIHByZWZhYlBhdGg6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1ByZWZhYiBkYjovLyBwYXRoIHRvIGluc3RhbnRpYXRlLicpLFxuICAgICAgICAgICAgcGFyZW50VXVpZDogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdQYXJlbnQgbm9kZSBVVUlELiBPbWl0IHRvIGxldCBDb2NvcyBjaG9vc2UgdGhlIGRlZmF1bHQgcGFyZW50LicpLFxuICAgICAgICAgICAgcG9zaXRpb246IHByZWZhYlBvc2l0aW9uU2NoZW1hLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0luaXRpYWwgbG9jYWwgcG9zaXRpb24gZm9yIHRoZSBjcmVhdGVkIHByZWZhYiBpbnN0YW5jZS4nKSxcbiAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBpbnN0YW50aWF0ZVByZWZhYihhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoYXN5bmMgKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgLy8g542y5Y+W6aCQ6KO96auU6LOH5rqQ5L+h5oGvXG4gICAgICAgICAgICAgICAgY29uc3QgYXNzZXRJbmZvID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXQtaW5mbycsIGFyZ3MucHJlZmFiUGF0aCk7XG4gICAgICAgICAgICAgICAgaWYgKCFhc3NldEluZm8pIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCfpoJDoo73pq5TmnKrmib7liLAnKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyDkvb/nlKjmraPnorrnmoQgY3JlYXRlLW5vZGUgQVBJIOW+numgkOijvemrlOizh+a6kOWvpuS+i+WMllxuICAgICAgICAgICAgICAgIGNvbnN0IGNyZWF0ZU5vZGVPcHRpb25zOiBhbnkgPSB7XG4gICAgICAgICAgICAgICAgICAgIGFzc2V0VXVpZDogYXNzZXRJbmZvLnV1aWRcbiAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgLy8g6Kit572u54i256+A6bueXG4gICAgICAgICAgICAgICAgaWYgKGFyZ3MucGFyZW50VXVpZCkge1xuICAgICAgICAgICAgICAgICAgICBjcmVhdGVOb2RlT3B0aW9ucy5wYXJlbnQgPSBhcmdzLnBhcmVudFV1aWQ7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8g6Kit572u56+A6bue5ZCN56ixXG4gICAgICAgICAgICAgICAgaWYgKGFyZ3MubmFtZSkge1xuICAgICAgICAgICAgICAgICAgICBjcmVhdGVOb2RlT3B0aW9ucy5uYW1lID0gYXJncy5uYW1lO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoYXNzZXRJbmZvLm5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgY3JlYXRlTm9kZU9wdGlvbnMubmFtZSA9IGFzc2V0SW5mby5uYW1lO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIOioree9ruWIneWni+WxrOaAp++8iOWmguS9jee9ru+8iVxuICAgICAgICAgICAgICAgIGlmIChhcmdzLnBvc2l0aW9uKSB7XG4gICAgICAgICAgICAgICAgICAgIGNyZWF0ZU5vZGVPcHRpb25zLmR1bXAgPSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBwb3NpdGlvbjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlOiBhcmdzLnBvc2l0aW9uXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8g5Ym15bu656+A6bueXG4gICAgICAgICAgICAgICAgY29uc3Qgbm9kZVV1aWQgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdjcmVhdGUtbm9kZScsIGNyZWF0ZU5vZGVPcHRpb25zKTtcbiAgICAgICAgICAgICAgICBjb25zdCB1dWlkID0gQXJyYXkuaXNBcnJheShub2RlVXVpZCkgPyBub2RlVXVpZFswXSA6IG5vZGVVdWlkO1xuXG4gICAgICAgICAgICAgICAgLy8g5rOo5oSP77yaY3JlYXRlLW5vZGUgQVBJ5b6e6aCQ6KO96auU6LOH5rqQ5Ym15bu65pmC5oeJ6Kmy6Ieq5YuV5bu656uL6aCQ6KO96auU6Zec6IGvXG4gICAgICAgICAgICAgICAgZGVidWdMb2coJ+mgkOijvemrlOevgOm7nuWJteW7uuaIkOWKnzonLCB7XG4gICAgICAgICAgICAgICAgICAgIG5vZGVVdWlkOiB1dWlkLFxuICAgICAgICAgICAgICAgICAgICBwcmVmYWJVdWlkOiBhc3NldEluZm8udXVpZCxcbiAgICAgICAgICAgICAgICAgICAgcHJlZmFiUGF0aDogYXJncy5wcmVmYWJQYXRoXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICBub2RlVXVpZDogdXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHByZWZhYlBhdGg6IGFyZ3MucHJlZmFiUGF0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhcmVudFV1aWQ6IGFyZ3MucGFyZW50VXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHBvc2l0aW9uOiBhcmdzLnBvc2l0aW9uLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogJ+mgkOijvemrlOWvpuS+i+WMluaIkOWKn++8jOW3suW7uueri+mgkOijvemrlOmXnOiBrydcbiAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHsgXG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLCBcbiAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGDpoJDoo73pq5Tlr6bkvovljJblpLHmlZc6ICR7ZXJyLm1lc3NhZ2V9YCxcbiAgICAgICAgICAgICAgICAgICAgaW5zdHJ1Y3Rpb246ICfoq4vmqqLmn6XpoJDoo73pq5Tot6/lvpHmmK/lkKbmraPnorrvvIznorrkv53poJDoo73pq5Tmlofku7bmoLzlvI/mraPnoronXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ2NyZWF0ZV9wcmVmYWInLFxuICAgICAgICB0aXRsZTogJ0NyZWF0ZSBwcmVmYWIgYXNzZXQnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBDcmVhdGUgYSBwcmVmYWIgYXNzZXQgZnJvbSBhIHNjZW5lIG5vZGUgdmlhIGNjZS5QcmVmYWIuY3JlYXRlUHJlZmFiIGZhY2FkZS4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgbm9kZVV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1NvdXJjZSBub2RlIFVVSUQgdG8gY29udmVydCBpbnRvIGEgcHJlZmFiLCBpbmNsdWRpbmcgY2hpbGRyZW4gYW5kIGNvbXBvbmVudHMuJyksXG4gICAgICAgICAgICBzYXZlUGF0aDogei5zdHJpbmcoKS5kZXNjcmliZSgnVGFyZ2V0IHByZWZhYiBkYjovLyBwYXRoLiBQYXNzIGEgZnVsbCAucHJlZmFiIHBhdGggb3IgYSBmb2xkZXIuJyksXG4gICAgICAgICAgICBwcmVmYWJOYW1lOiB6LnN0cmluZygpLmRlc2NyaWJlKCdQcmVmYWIgbmFtZTsgdXNlZCBhcyBmaWxlbmFtZSB3aGVuIHNhdmVQYXRoIGlzIGEgZm9sZGVyLicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIGNyZWF0ZVByZWZhYihhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoYXN5bmMgKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgLy8g5pSv5oyBIHByZWZhYlBhdGgg5ZKMIHNhdmVQYXRoIOWFqeeoruWPg+aVuOWQjVxuICAgICAgICAgICAgICAgIGNvbnN0IHBhdGhQYXJhbSA9IGFyZ3MucHJlZmFiUGF0aCB8fCBhcmdzLnNhdmVQYXRoO1xuICAgICAgICAgICAgICAgIGlmICghcGF0aFBhcmFtKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbCgn57y65bCR6aCQ6KO96auU6Lev5b6R5Y+D5pW444CC6KuL5o+Q5L6bIHByZWZhYlBhdGgg5oiWIHNhdmVQYXRo44CCJykpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgY29uc3QgcHJlZmFiTmFtZSA9IGFyZ3MucHJlZmFiTmFtZSB8fCAnTmV3UHJlZmFiJztcbiAgICAgICAgICAgICAgICBjb25zdCBmdWxsUGF0aCA9IHBhdGhQYXJhbS5lbmRzV2l0aCgnLnByZWZhYicpID9cbiAgICAgICAgICAgICAgICAgICAgcGF0aFBhcmFtIDogYCR7cGF0aFBhcmFtfS8ke3ByZWZhYk5hbWV9LnByZWZhYmA7XG5cbiAgICAgICAgICAgICAgICAvLyBUaGUgb2ZmaWNpYWwgc2NlbmUtZmFjYWRlIHBhdGggKGNjZS5QcmVmYWIuY3JlYXRlUHJlZmFiIHZpYVxuICAgICAgICAgICAgICAgIC8vIGV4ZWN1dGUtc2NlbmUtc2NyaXB0KS4gVGhlIGxlZ2FjeSBoYW5kLXJvbGxlZCBKU09OIGZhbGxiYWNrXG4gICAgICAgICAgICAgICAgLy8gKGNyZWF0ZVByZWZhYldpdGhBc3NldERCIC8gY3JlYXRlUHJlZmFiTmF0aXZlIC8gY3JlYXRlUHJlZmFiQ3VzdG9tLFxuICAgICAgICAgICAgICAgIC8vIH4yNTAgc291cmNlIGxpbmVzKSB3YXMgcmVtb3ZlZCBpbiB2Mi4xLjMg4oCUIHNlZSBjb21taXQgNTQ3MTE1YlxuICAgICAgICAgICAgICAgIC8vIGZvciB0aGUgcHJlLXJlbW92YWwgc291cmNlIGlmIGEgZnV0dXJlIENvY29zIENyZWF0b3IgYnVpbGRcbiAgICAgICAgICAgICAgICAvLyBicmVha3MgdGhlIGZhY2FkZSBwYXRoLiBUaGUgZmFjYWRlIGhhcyBiZWVuIHRoZSBvbmx5IHBhdGhcbiAgICAgICAgICAgICAgICAvLyBleGVyY2lzZWQgaW4gdjIuMS4xIC8gdjIuMS4yIHJlYWwtZWRpdG9yIHRlc3RpbmcgYWNyb3NzXG4gICAgICAgICAgICAgICAgLy8gc2ltcGxlIGFuZCBjb21wbGV4IChuZXN0ZWQgKyBtdWx0aS1jb21wb25lbnQpIHByZWZhYiBmb3Jtcy5cbiAgICAgICAgICAgICAgICBkZWJ1Z0xvZygnQ2FsbGluZyBzY2VuZS1zY3JpcHQgY2NlLlByZWZhYi5jcmVhdGVQcmVmYWIuLi4nKTtcbiAgICAgICAgICAgICAgICBjb25zdCBmYWNhZGVSZXN1bHQgPSBhd2FpdCBydW5TY2VuZU1ldGhvZEFzVG9vbFJlc3BvbnNlKCdjcmVhdGVQcmVmYWJGcm9tTm9kZScsIFthcmdzLm5vZGVVdWlkLCBmdWxsUGF0aF0pO1xuICAgICAgICAgICAgICAgIGlmICghZmFjYWRlUmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShmYWNhZGVSZXN1bHQpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3JlZnJlc2gtYXNzZXQnLCBmdWxsUGF0aCk7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAocmVmcmVzaEVycjogYW55KSB7XG4gICAgICAgICAgICAgICAgICAgIGRlYnVnTG9nKGByZWZyZXNoLWFzc2V0IGFmdGVyIGZhY2FkZSBjcmVhdGVQcmVmYWIgZmFpbGVkIChub24tZmF0YWwpOiAke3JlZnJlc2hFcnI/Lm1lc3NhZ2UgPz8gcmVmcmVzaEVycn1gKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgIC4uLmZhY2FkZVJlc3VsdCxcbiAgICAgICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAgLi4uKGZhY2FkZVJlc3VsdC5kYXRhID8/IHt9KSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHByZWZhYk5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBwcmVmYWJQYXRoOiBmdWxsUGF0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1ldGhvZDogJ3NjZW5lLWZhY2FkZScsXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChg5Ym15bu66aCQ6KO96auU5pmC55m855Sf6Yyv6KqkOiAke2Vycm9yfWApKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAndXBkYXRlX3ByZWZhYicsXG4gICAgICAgIHRpdGxlOiAnQXBwbHkgcHJlZmFiIGVkaXRzJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gQXBwbHkgcHJlZmFiIGluc3RhbmNlIGVkaXRzIGJhY2sgdG8gaXRzIGxpbmtlZCBwcmVmYWIgYXNzZXQ7IHByZWZhYlBhdGggaXMgY29udGV4dCBvbmx5LicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICBwcmVmYWJQYXRoOiB6LnN0cmluZygpLmRlc2NyaWJlKCdQcmVmYWIgYXNzZXQgcGF0aCBmb3IgcmVzcG9uc2UgY29udGV4dDsgYXBwbHkgdXNlcyBub2RlVXVpZCBsaW5rZWQgcHJlZmFiIGRhdGEuJyksXG4gICAgICAgICAgICBub2RlVXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnTW9kaWZpZWQgcHJlZmFiIGluc3RhbmNlIG5vZGUgVVVJRCB0byBhcHBseSBiYWNrIHRvIGl0cyBsaW5rZWQgcHJlZmFiLicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIHVwZGF0ZVByZWZhYihhcmdzOiB7IHByZWZhYlBhdGg6IHN0cmluZzsgbm9kZVV1aWQ6IHN0cmluZyB9IHwgc3RyaW5nLCBtYXliZU5vZGVVdWlkPzogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgcHJlZmFiUGF0aCA9IHR5cGVvZiBhcmdzID09PSAnc3RyaW5nJyA/IGFyZ3MgOiBhcmdzLnByZWZhYlBhdGg7XG4gICAgICAgIGNvbnN0IG5vZGVVdWlkID0gdHlwZW9mIGFyZ3MgPT09ICdzdHJpbmcnID8gbWF5YmVOb2RlVXVpZCEgOiBhcmdzLm5vZGVVdWlkO1xuICAgICAgICAvLyBBcHBseSBwYXRoLiBUaGVyZSBpcyBubyBob3N0LXByb2Nlc3MgRWRpdG9yLk1lc3NhZ2UgY2hhbm5lbCBmb3JcbiAgICAgICAgLy8gdGhpczsgdGhlIG9wZXJhdGlvbiBsaXZlcyBvbiB0aGUgc2NlbmUgZmFjYWRlIGFuZCBpcyByZWFjaGFibGVcbiAgICAgICAgLy8gdmlhIGV4ZWN1dGUtc2NlbmUtc2NyaXB0IChzZWUgc291cmNlL3NjZW5lLnRzOmFwcGx5UHJlZmFiKS5cbiAgICAgICAgY29uc3QgZmFjYWRlUmVzdWx0ID0gYXdhaXQgcnVuU2NlbmVNZXRob2RBc1Rvb2xSZXNwb25zZSgnYXBwbHlQcmVmYWInLCBbbm9kZVV1aWRdKTtcbiAgICAgICAgaWYgKGZhY2FkZVJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIC4uLmZhY2FkZVJlc3VsdCxcbiAgICAgICAgICAgICAgICBkYXRhOiB7IC4uLihmYWNhZGVSZXN1bHQuZGF0YSA/PyB7fSksIHByZWZhYlBhdGgsIG5vZGVVdWlkIH0sXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWlsKGZhY2FkZVJlc3VsdC5lcnJvciA/PyAnYXBwbHlQcmVmYWIgZmFpbGVkIHZpYSBzY2VuZSBmYWNhZGUnLCB7IHByZWZhYlBhdGgsIG5vZGVVdWlkIH0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ3NldF9saW5rJyxcbiAgICAgICAgdGl0bGU6ICdTZXQgcHJlZmFiIGxpbmsnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBBdHRhY2ggb3IgZGV0YWNoIGEgcHJlZmFiIGxpbmsgb24gYSBub2RlLiBtb2RlPVwibGlua1wiIHdyYXBzIGNjZS5TY2VuZUZhY2FkZS5saW5rUHJlZmFiOyBtb2RlPVwidW5saW5rXCIgd3JhcHMgY2NlLlNjZW5lRmFjYWRlLnVubGlua1ByZWZhYi4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgbW9kZTogei5lbnVtKFsnbGluaycsICd1bmxpbmsnXSkuZGVzY3JpYmUoJ09wZXJhdGlvbjogXCJsaW5rXCIgYXR0YWNoZXMgYSByZWd1bGFyIG5vZGUgdG8gYSBwcmVmYWIgYXNzZXQ7IFwidW5saW5rXCIgZGV0YWNoZXMgYSBwcmVmYWIgaW5zdGFuY2UuJyksXG4gICAgICAgICAgICBub2RlVXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnTm9kZSBVVUlELiBGb3IgbW9kZT1cImxpbmtcIiwgdGhlIG5vZGUgdG8gYXR0YWNoOyBmb3IgbW9kZT1cInVubGlua1wiLCB0aGUgcHJlZmFiIGluc3RhbmNlIHRvIGRldGFjaC4nKSxcbiAgICAgICAgICAgIGFzc2V0VXVpZDogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdQcmVmYWIgYXNzZXQgVVVJRC4gUmVxdWlyZWQgd2hlbiBtb2RlPVwibGlua1wiOyBpZ25vcmVkIHdoZW4gbW9kZT1cInVubGlua1wiLicpLFxuICAgICAgICAgICAgcmVtb3ZlTmVzdGVkOiB6LmJvb2xlYW4oKS5kZWZhdWx0KGZhbHNlKS5kZXNjcmliZSgnV2hlbiBtb2RlPVwidW5saW5rXCIsIGFsc28gdW5saW5rIG5lc3RlZCBwcmVmYWIgaW5zdGFuY2VzIHVuZGVyIHRoaXMgbm9kZS4gSWdub3JlZCB3aGVuIG1vZGU9XCJsaW5rXCIuJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgc2V0TGluayhhOiB7IG1vZGU6ICdsaW5rJyB8ICd1bmxpbmsnOyBub2RlVXVpZDogc3RyaW5nOyBhc3NldFV1aWQ/OiBzdHJpbmc7IHJlbW92ZU5lc3RlZDogYm9vbGVhbiB9KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgaWYgKGEubW9kZSA9PT0gJ2xpbmsnKSB7XG4gICAgICAgICAgICBpZiAoIWEuYXNzZXRVdWlkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ3NldF9saW5rIHdpdGggbW9kZT1cImxpbmtcIiByZXF1aXJlcyBhc3NldFV1aWQnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBydW5TY2VuZU1ldGhvZEFzVG9vbFJlc3BvbnNlKCdsaW5rUHJlZmFiJywgW2Eubm9kZVV1aWQsIGEuYXNzZXRVdWlkXSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJ1blNjZW5lTWV0aG9kQXNUb29sUmVzcG9uc2UoJ3VubGlua1ByZWZhYicsIFthLm5vZGVVdWlkLCBhLnJlbW92ZU5lc3RlZF0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ2dldF9wcmVmYWJfZGF0YScsXG4gICAgICAgIHRpdGxlOiAnUmVhZCBwcmVmYWIgZGF0YScsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFJlYWQgZmFjYWRlIHByZWZhYiBkdW1wIGZvciBhIHByZWZhYiBpbnN0YW5jZSBub2RlLiBObyBtdXRhdGlvbjsgdXNlZnVsIGZvciBpbnNwZWN0aW5nIGluc3RhbmNlL2xpbmsgc2VyaWFsaXplZCBkYXRhLicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICBub2RlVXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnUHJlZmFiIGluc3RhbmNlIG5vZGUgVVVJRCB3aG9zZSBwcmVmYWIgZHVtcCBzaG91bGQgYmUgcmVhZC4nKSxcbiAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBnZXRQcmVmYWJEYXRhKGFyZ3M6IHsgbm9kZVV1aWQ6IHN0cmluZyB9IHwgc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3Qgbm9kZVV1aWQgPSB0eXBlb2YgYXJncyA9PT0gJ3N0cmluZycgPyBhcmdzIDogYXJncy5ub2RlVXVpZDtcbiAgICAgICAgcmV0dXJuIHJ1blNjZW5lTWV0aG9kQXNUb29sUmVzcG9uc2UoJ2dldFByZWZhYkRhdGEnLCBbbm9kZVV1aWRdKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdyZXZlcnRfcHJlZmFiJyxcbiAgICAgICAgdGl0bGU6ICdSZXZlcnQgcHJlZmFiIGluc3RhbmNlJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gUmVzdG9yZSBhIHByZWZhYiBpbnN0YW5jZSBmcm9tIGl0cyBsaW5rZWQgYXNzZXQ7IGRpc2NhcmRzIHVuYXBwbGllZCBvdmVycmlkZXMuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIG5vZGVVdWlkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdQcmVmYWIgaW5zdGFuY2Ugbm9kZSBVVUlEIHRvIHJlc3RvcmUgZnJvbSBpdHMgbGlua2VkIGFzc2V0LicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIHJldmVydFByZWZhYihhcmdzOiB7IG5vZGVVdWlkOiBzdHJpbmcgfSB8IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IG5vZGVVdWlkID0gdHlwZW9mIGFyZ3MgPT09ICdzdHJpbmcnID8gYXJncyA6IGFyZ3Mubm9kZVV1aWQ7XG4gICAgICAgIC8vIFRoZSBwcmV2aW91cyBjb2RlIGNhbGxlZCBzY2VuZSBgcmV2ZXJ0LXByZWZhYmAsIHdoaWNoIGRvZXMgbm90IGV4aXN0LlxuICAgICAgICAvLyBUaGUgdmVyaWZpZWQgY2hhbm5lbCBpcyBgcmVzdG9yZS1wcmVmYWJgIHRha2luZyBgeyB1dWlkOiBzdHJpbmcgfWBcbiAgICAgICAgLy8gKFJlc2V0Q29tcG9uZW50T3B0aW9ucykuIFBlciB0aGUgZWRpdG9yIGNvbnZlbnRpb24gdGhpcyByZXN0b3JlcyB0aGVcbiAgICAgICAgLy8gbm9kZSBmcm9tIGl0cyBsaW5rZWQgcHJlZmFiIGFzc2V0LCB3aGljaCBtYXRjaGVzIHRoZSBcInJldmVydFwiIGludGVudC5cbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdyZXN0b3JlLXByZWZhYicsIHsgdXVpZDogbm9kZVV1aWQgfSkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh1bmRlZmluZWQsICdQcmVmYWIgaW5zdGFuY2UgcmV2ZXJ0ZWQgc3VjY2Vzc2Z1bGx5JykpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdnZXRfcHJlZmFiX2luZm8nLFxuICAgICAgICB0aXRsZTogJ1JlYWQgcHJlZmFiIGluZm8nLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBSZWFkIHByZWZhYiBtZXRhL2RlcGVuZGVuY3kgc3VtbWFyeSBiZWZvcmUgYXBwbHkvcmV2ZXJ0LicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICBwcmVmYWJQYXRoOiB6LnN0cmluZygpLmRlc2NyaWJlKCdQcmVmYWIgYXNzZXQgZGI6Ly8gcGF0aC4nKSxcbiAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBnZXRQcmVmYWJJbmZvKGFyZ3M6IHsgcHJlZmFiUGF0aDogc3RyaW5nIH0gfCBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBwcmVmYWJQYXRoID0gdHlwZW9mIGFyZ3MgPT09ICdzdHJpbmcnID8gYXJncyA6IGFyZ3MucHJlZmFiUGF0aDtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldC1pbmZvJywgcHJlZmFiUGF0aCkudGhlbigoYXNzZXRJbmZvOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoIWFzc2V0SW5mbykge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1ByZWZhYiBub3QgZm91bmQnKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXQtbWV0YScsIGFzc2V0SW5mby51dWlkKTtcbiAgICAgICAgICAgIH0pLnRoZW4oKG1ldGFJbmZvOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBpbmZvOiBQcmVmYWJJbmZvID0ge1xuICAgICAgICAgICAgICAgICAgICBuYW1lOiBtZXRhSW5mby5uYW1lLFxuICAgICAgICAgICAgICAgICAgICB1dWlkOiBtZXRhSW5mby51dWlkLFxuICAgICAgICAgICAgICAgICAgICBwYXRoOiBwcmVmYWJQYXRoLFxuICAgICAgICAgICAgICAgICAgICBmb2xkZXI6IHByZWZhYlBhdGguc3Vic3RyaW5nKDAsIHByZWZhYlBhdGgubGFzdEluZGV4T2YoJy8nKSksXG4gICAgICAgICAgICAgICAgICAgIGNyZWF0ZVRpbWU6IG1ldGFJbmZvLmNyZWF0ZVRpbWUsXG4gICAgICAgICAgICAgICAgICAgIG1vZGlmeVRpbWU6IG1ldGFJbmZvLm1vZGlmeVRpbWUsXG4gICAgICAgICAgICAgICAgICAgIGRlcGVuZGVuY2llczogbWV0YUluZm8uZGVwZW5kcyB8fCBbXVxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayhpbmZvKSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ3ZhbGlkYXRlX3ByZWZhYicsXG4gICAgICAgIHRpdGxlOiAnVmFsaWRhdGUgcHJlZmFiIGFzc2V0JyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gUnVuIGJhc2ljIHByZWZhYiBKU09OIHN0cnVjdHVyYWwgY2hlY2tzOyBub3QgYnl0ZS1sZXZlbCBDb2NvcyBlcXVpdmFsZW5jZS4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgcHJlZmFiUGF0aDogei5zdHJpbmcoKS5kZXNjcmliZSgnUHJlZmFiIGRiOi8vIHBhdGggd2hvc2UgSlNPTiBzdHJ1Y3R1cmUgc2hvdWxkIGJlIGNoZWNrZWQuJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgdmFsaWRhdGVQcmVmYWIoYXJnczogeyBwcmVmYWJQYXRoOiBzdHJpbmcgfSB8IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHByZWZhYlBhdGggPSB0eXBlb2YgYXJncyA9PT0gJ3N0cmluZycgPyBhcmdzIDogYXJncy5wcmVmYWJQYXRoO1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgLy8g6K6A5Y+W6aCQ6KO96auU5paH5Lu25YWn5a65XG4gICAgICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXQtaW5mbycsIHByZWZhYlBhdGgpLnRoZW4oKGFzc2V0SW5mbzogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmICghYXNzZXRJbmZvKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoJ+mgkOijvemrlOaWh+S7tuS4jeWtmOWcqCcpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIOmpl+itiemgkOijvemrlOagvOW8j1xuICAgICAgICAgICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdyZWFkLWFzc2V0JywgcHJlZmFiUGF0aCkudGhlbigoY29udGVudDogc3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHByZWZhYkRhdGEgPSBKU09OLnBhcnNlKGNvbnRlbnQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHZhbGlkYXRpb25SZXN1bHQgPSB0aGlzLnZhbGlkYXRlUHJlZmFiRm9ybWF0KHByZWZhYkRhdGEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaXNWYWxpZDogdmFsaWRhdGlvblJlc3VsdC5pc1ZhbGlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaXNzdWVzOiB2YWxpZGF0aW9uUmVzdWx0Lmlzc3VlcyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5vZGVDb3VudDogdmFsaWRhdGlvblJlc3VsdC5ub2RlQ291bnQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRDb3VudDogdmFsaWRhdGlvblJlc3VsdC5jb21wb25lbnRDb3VudCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IHZhbGlkYXRpb25SZXN1bHQuaXNWYWxpZCA/ICfpoJDoo73pq5TmoLzlvI/mnInmlYgnIDogJ+mgkOijvemrlOagvOW8j+WtmOWcqOWVj+mhjCdcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAocGFyc2VFcnJvcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbCgn6aCQ6KO96auU5paH5Lu25qC85byP6Yyv6Kqk77yM54Sh5rOV6Kej5p6QSlNPTicpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSkuY2F0Y2goKGVycm9yOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChg6K6A5Y+W6aCQ6KO96auU5paH5Lu25aSx5pWXOiAke2Vycm9yLm1lc3NhZ2V9YCkpO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9KS5jYXRjaCgoZXJyb3I6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoYOafpeipoumgkOijvemrlOS/oeaBr+WkseaVlzogJHtlcnJvci5tZXNzYWdlfWApKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGDpqZforYnpoJDoo73pq5TmmYLnmbznlJ/pjK/oqqQ6ICR7ZXJyb3J9YCkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHZhbGlkYXRlUHJlZmFiRm9ybWF0KHByZWZhYkRhdGE6IGFueSk6IHsgaXNWYWxpZDogYm9vbGVhbjsgaXNzdWVzOiBzdHJpbmdbXTsgbm9kZUNvdW50OiBudW1iZXI7IGNvbXBvbmVudENvdW50OiBudW1iZXIgfSB7XG4gICAgICAgIGNvbnN0IGlzc3Vlczogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgbGV0IG5vZGVDb3VudCA9IDA7XG4gICAgICAgIGxldCBjb21wb25lbnRDb3VudCA9IDA7XG5cbiAgICAgICAgLy8g5qqi5p+l5Z+65pys57WQ5qeLXG4gICAgICAgIGlmICghQXJyYXkuaXNBcnJheShwcmVmYWJEYXRhKSkge1xuICAgICAgICAgICAgaXNzdWVzLnB1c2goJ+mgkOijvemrlOaVuOaTmuW/hemgiOaYr+aVuOe1hOagvOW8jycpO1xuICAgICAgICAgICAgcmV0dXJuIHsgaXNWYWxpZDogZmFsc2UsIGlzc3Vlcywgbm9kZUNvdW50LCBjb21wb25lbnRDb3VudCB9O1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHByZWZhYkRhdGEubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICBpc3N1ZXMucHVzaCgn6aCQ6KO96auU5pW45pOa54K656m6Jyk7XG4gICAgICAgICAgICByZXR1cm4geyBpc1ZhbGlkOiBmYWxzZSwgaXNzdWVzLCBub2RlQ291bnQsIGNvbXBvbmVudENvdW50IH07XG4gICAgICAgIH1cblxuICAgICAgICAvLyDmqqLmn6XnrKzkuIDlgIvlhYPntKDmmK/lkKbngrrpoJDoo73pq5Tos4fnlKJcbiAgICAgICAgY29uc3QgZmlyc3RFbGVtZW50ID0gcHJlZmFiRGF0YVswXTtcbiAgICAgICAgaWYgKCFmaXJzdEVsZW1lbnQgfHwgZmlyc3RFbGVtZW50Ll9fdHlwZV9fICE9PSAnY2MuUHJlZmFiJykge1xuICAgICAgICAgICAgaXNzdWVzLnB1c2goJ+esrOS4gOWAi+WFg+e0oOW/hemgiOaYr2NjLlByZWZhYumhnuWeiycpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8g57Wx6KiI56+A6bue5ZKM57WE5Lu2XG4gICAgICAgIHByZWZhYkRhdGEuZm9yRWFjaCgoaXRlbTogYW55LCBpbmRleDogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgICBpZiAoaXRlbS5fX3R5cGVfXyA9PT0gJ2NjLk5vZGUnKSB7XG4gICAgICAgICAgICAgICAgbm9kZUNvdW50Kys7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGl0ZW0uX190eXBlX18gJiYgaXRlbS5fX3R5cGVfXy5pbmNsdWRlcygnY2MuJykpIHtcbiAgICAgICAgICAgICAgICBjb21wb25lbnRDb3VudCsrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICAvLyDmqqLmn6Xlv4XopoHnmoTlrZfmrrVcbiAgICAgICAgaWYgKG5vZGVDb3VudCA9PT0gMCkge1xuICAgICAgICAgICAgaXNzdWVzLnB1c2goJ+mgkOijvemrlOW/hemgiOWMheWQq+iHs+WwkeS4gOWAi+evgOm7nicpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGlzVmFsaWQ6IGlzc3Vlcy5sZW5ndGggPT09IDAsXG4gICAgICAgICAgICBpc3N1ZXMsXG4gICAgICAgICAgICBub2RlQ291bnQsXG4gICAgICAgICAgICBjb21wb25lbnRDb3VudFxuICAgICAgICB9O1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ3Jlc3RvcmVfcHJlZmFiX25vZGUnLFxuICAgICAgICB0aXRsZTogJ1Jlc3RvcmUgcHJlZmFiIG5vZGUnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBSZXN0b3JlIGEgcHJlZmFiIGluc3RhbmNlIHRocm91Z2ggc2NlbmUvcmVzdG9yZS1wcmVmYWI7IGFzc2V0VXVpZCBpcyBjb250ZXh0IG9ubHkuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIG5vZGVVdWlkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdQcmVmYWIgaW5zdGFuY2Ugbm9kZSBVVUlEIHBhc3NlZCB0byBzY2VuZS9yZXN0b3JlLXByZWZhYi4nKSxcbiAgICAgICAgICAgIGFzc2V0VXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnUHJlZmFiIGFzc2V0IFVVSUQga2VwdCBmb3IgcmVzcG9uc2UgY29udGV4dDsgQ29jb3MgcmVzdG9yZS1wcmVmYWIgdXNlcyBub2RlVXVpZCBvbmx5LicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIHJlc3RvcmVQcmVmYWJOb2RlKGFyZ3M6IHsgbm9kZVV1aWQ6IHN0cmluZzsgYXNzZXRVdWlkOiBzdHJpbmcgfSB8IHN0cmluZywgbWF5YmVBc3NldFV1aWQ/OiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBub2RlVXVpZCA9IHR5cGVvZiBhcmdzID09PSAnc3RyaW5nJyA/IGFyZ3MgOiBhcmdzLm5vZGVVdWlkO1xuICAgICAgICBjb25zdCBhc3NldFV1aWQgPSB0eXBlb2YgYXJncyA9PT0gJ3N0cmluZycgPyBtYXliZUFzc2V0VXVpZCEgOiBhcmdzLmFzc2V0VXVpZDtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICAvLyBWZXJpZmllZCBzaWduYXR1cmUgcGVyIEBjb2Nvcy9jcmVhdG9yLXR5cGVzOiBzY2VuZS9yZXN0b3JlLXByZWZhYlxuICAgICAgICAgICAgLy8gdGFrZXMgYSBzaW5nbGUgUmVzZXRDb21wb25lbnRPcHRpb25zID0geyB1dWlkOiBzdHJpbmcgfS4gVGhlXG4gICAgICAgICAgICAvLyBwcmV2aW91cyBjb2RlIHBhc3NlZCAobm9kZVV1aWQsIGFzc2V0VXVpZCkgYXMgcG9zaXRpb25hbCBhcmdzLFxuICAgICAgICAgICAgLy8gd2hpY2ggdGhlIEFQSSBpZ25vcmVzIGFmdGVyIHRoZSBmaXJzdCBvbmUgYW5kIHNpbGVudGx5IG1pc3JvdXRlcy5cbiAgICAgICAgICAgIC8vIGFzc2V0VXVpZCBpcyBwcmVzZXJ2ZWQgb24gdGhlIHJlcXVlc3Qgc2hhcGUgZm9yIHJlc3BvbnNlIGNvbnRleHRcbiAgICAgICAgICAgIC8vIGJ1dCBkb2VzIG5vdCBmbG93IGludG8gdGhlIGVkaXRvciBtZXNzYWdlLlxuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncmVzdG9yZS1wcmVmYWInLCB7IHV1aWQ6IG5vZGVVdWlkIH0pLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWQ6IG5vZGVVdWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgYXNzZXRVdWlkOiBhc3NldFV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiAn6aCQ6KO96auU56+A6bue6YKE5Y6f5oiQ5YqfJ1xuICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyb3I6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChg6aCQ6KO96auU56+A6bue6YKE5Y6f5aSx5pWXOiAke2Vycm9yLm1lc3NhZ2V9YCkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxufVxuIl19