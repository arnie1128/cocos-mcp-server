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
        var _a, _b, _c;
        try {
            const treeResult = await this.nodeTools.execute('create_tree', {
                spec: [args.rootSpec],
                parentUuid: args.parentUuid,
            });
            if (!treeResult.success) {
                return treeResult;
            }
            const createdNodes = ((_a = treeResult.data) === null || _a === void 0 ? void 0 : _a.nodes) || {};
            const rootNodeUuid = createdNodes[args.rootSpec.name];
            if (!rootNodeUuid) {
                return (0, response_1.fail)('Root node UUID missing from create_tree result');
            }
            if (args.autoBindMode !== 'none') {
                const uuids = Object.values(createdNodes);
                const nodeDataResults = await Promise.allSettled(uuids.map(uuid => Editor.Message.request('scene', 'query-node', uuid)));
                for (let i = 0; i < uuids.length; i++) {
                    const r = nodeDataResults[i];
                    if (r.status !== 'fulfilled')
                        continue;
                    const comps = ((_b = r.value) === null || _b === void 0 ? void 0 : _b.__comps__) || [];
                    for (const comp of comps) {
                        const componentType = comp === null || comp === void 0 ? void 0 : comp.__type__;
                        if (typeof componentType === 'string' && !componentType.startsWith('cc.')) {
                            await this.componentTools.execute('auto_bind', {
                                nodeUuid: uuids[i],
                                componentType,
                                mode: args.autoBindMode,
                            });
                        }
                    }
                }
            }
            const prefabResult = await (0, scene_bridge_1.runSceneMethodAsToolResponse)('createPrefabFromNode', [rootNodeUuid, args.prefabPath]);
            if (prefabResult.success) {
                return (0, response_1.ok)(Object.assign(Object.assign({}, ((_c = prefabResult.data) !== null && _c !== void 0 ? _c : {})), { createdNodes }));
            }
            return prefabResult;
        }
        catch (err) {
            return (0, response_1.fail)(`Failed to create prefab from spec: ${err.message}`);
        }
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
            return (0, response_1.ok)({
                nodeUuid: uuid,
                prefabPath: args.prefabPath,
                parentUuid: args.parentUuid,
                position: args.position,
                message: '預製體實例化成功，已建立預製體關聯'
            });
        }
        catch (err) {
            return {
                success: false,
                error: `預製體實例化失敗: ${err.message}`,
                instruction: '請檢查預製體路徑是否正確，確保預製體文件格式正確'
            };
        }
    }
    async createPrefab(args) {
        var _a, _b;
        try {
            // 支持 prefabPath 和 savePath 兩種參數名
            const pathParam = args.prefabPath || args.savePath;
            if (!pathParam) {
                return (0, response_1.fail)('缺少預製體路徑參數。請提供 prefabPath 或 savePath。');
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
                return facadeResult;
            }
            try {
                await Editor.Message.request('asset-db', 'refresh-asset', fullPath);
            }
            catch (refreshErr) {
                (0, log_1.debugLog)(`refresh-asset after facade createPrefab failed (non-fatal): ${(_a = refreshErr === null || refreshErr === void 0 ? void 0 : refreshErr.message) !== null && _a !== void 0 ? _a : refreshErr}`);
            }
            return Object.assign(Object.assign({}, facadeResult), { data: Object.assign(Object.assign({}, ((_b = facadeResult.data) !== null && _b !== void 0 ? _b : {})), { prefabName, prefabPath: fullPath, method: 'scene-facade' }) });
        }
        catch (error) {
            return (0, response_1.fail)(`創建預製體時發生錯誤: ${error}`);
        }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJlZmFiLXRvb2xzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL3Rvb2xzL3ByZWZhYi10b29scy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7QUFBQSw4Q0FBMkM7QUFFM0Msb0NBQXNDO0FBQ3RDLDBDQUFrQztBQUNsQyxrREFBdUU7QUFDdkUsc0RBQW1FO0FBQ25FLDZDQUF5QztBQUN6Qyx1REFBbUQ7QUFFbkQsTUFBTSxvQkFBb0IsR0FBRyxVQUFDLENBQUMsTUFBTSxDQUFDO0lBQ2xDLENBQUMsRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxFQUFFO0lBQ3hCLENBQUMsRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxFQUFFO0lBQ3hCLENBQUMsRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxFQUFFO0NBQzNCLENBQUMsQ0FBQztBQUVILE1BQWEsV0FBVztJQUtwQjtRQUhpQixjQUFTLEdBQUcsSUFBSSxzQkFBUyxFQUFFLENBQUM7UUFDNUIsbUJBQWMsR0FBRyxJQUFJLGdDQUFjLEVBQUUsQ0FBQztRQUduRCxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUEsc0NBQXlCLEVBQUMsSUFBSSxDQUFDLENBQUM7SUFDaEQsQ0FBQztJQUVELFFBQVEsS0FBdUIsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUM3RCxPQUFPLENBQUMsUUFBZ0IsRUFBRSxJQUFTLElBQTJCLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztJQTRCbkcsQUFBTixLQUFLLENBQUMsY0FBYyxDQUFDLElBQVM7O1FBQzFCLElBQUksQ0FBQztZQUNELE1BQU0sVUFBVSxHQUFHLE1BQU0sSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsYUFBYSxFQUFFO2dCQUMz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QVVLO0lBUkwsSUFBQSxvQkFBTyxFQUFDO1FBQ0wsSUFBSSxFQUFFLGlCQUFpQjtRQUN2QixLQUFLLEVBQUUsdUJBQXVCO1FBQzlCLFdBQVcsRUFBRSx5RkFBeUY7UUFDdEcsV0FBVyxFQUFFLFVBQUMsQ0FBQyxNQUFNLENBQUM7WUFDbEIsVUFBVSxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLENBQUMsMkRBQTJELENBQUM7U0FDL0YsQ0FBQztLQUNMLENBQUM7aURBc0NEO0FBdURLO0lBVEwsSUFBQSxvQkFBTyxFQUFDO1FBQ0wsSUFBSSxFQUFFLHFCQUFxQjtRQUMzQixLQUFLLEVBQUUscUJBQXFCO1FBQzVCLFdBQVcsRUFBRSxpR0FBaUc7UUFDOUcsV0FBVyxFQUFFLFVBQUMsQ0FBQyxNQUFNLENBQUM7WUFDbEIsUUFBUSxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLENBQUMsMkRBQTJELENBQUM7WUFDMUYsU0FBUyxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLENBQUMsdUZBQXVGLENBQUM7U0FDMUgsQ0FBQztLQUNMLENBQUM7b0RBcUJEIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgb2ssIGZhaWwgfSBmcm9tICcuLi9saWIvcmVzcG9uc2UnO1xuaW1wb3J0IHsgVG9vbERlZmluaXRpb24sIFRvb2xSZXNwb25zZSwgVG9vbEV4ZWN1dG9yLCBQcmVmYWJJbmZvIH0gZnJvbSAnLi4vdHlwZXMnO1xuaW1wb3J0IHsgZGVidWdMb2cgfSBmcm9tICcuLi9saWIvbG9nJztcbmltcG9ydCB7IHogfSBmcm9tICcuLi9saWIvc2NoZW1hJztcbmltcG9ydCB7IG1jcFRvb2wsIGRlZmluZVRvb2xzRnJvbURlY29yYXRvcnMgfSBmcm9tICcuLi9saWIvZGVjb3JhdG9ycyc7XG5pbXBvcnQgeyBydW5TY2VuZU1ldGhvZEFzVG9vbFJlc3BvbnNlIH0gZnJvbSAnLi4vbGliL3NjZW5lLWJyaWRnZSc7XG5pbXBvcnQgeyBOb2RlVG9vbHMgfSBmcm9tICcuL25vZGUtdG9vbHMnO1xuaW1wb3J0IHsgQ29tcG9uZW50VG9vbHMgfSBmcm9tICcuL2NvbXBvbmVudC10b29scyc7XG5cbmNvbnN0IHByZWZhYlBvc2l0aW9uU2NoZW1hID0gei5vYmplY3Qoe1xuICAgIHg6IHoubnVtYmVyKCkub3B0aW9uYWwoKSxcbiAgICB5OiB6Lm51bWJlcigpLm9wdGlvbmFsKCksXG4gICAgejogei5udW1iZXIoKS5vcHRpb25hbCgpLFxufSk7XG5cbmV4cG9ydCBjbGFzcyBQcmVmYWJUb29scyBpbXBsZW1lbnRzIFRvb2xFeGVjdXRvciB7XG4gICAgcHJpdmF0ZSByZWFkb25seSBleGVjOiBUb29sRXhlY3V0b3I7XG4gICAgcHJpdmF0ZSByZWFkb25seSBub2RlVG9vbHMgPSBuZXcgTm9kZVRvb2xzKCk7XG4gICAgcHJpdmF0ZSByZWFkb25seSBjb21wb25lbnRUb29scyA9IG5ldyBDb21wb25lbnRUb29scygpO1xuXG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHRoaXMuZXhlYyA9IGRlZmluZVRvb2xzRnJvbURlY29yYXRvcnModGhpcyk7XG4gICAgfVxuXG4gICAgZ2V0VG9vbHMoKTogVG9vbERlZmluaXRpb25bXSB7IHJldHVybiB0aGlzLmV4ZWMuZ2V0VG9vbHMoKTsgfVxuICAgIGV4ZWN1dGUodG9vbE5hbWU6IHN0cmluZywgYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHsgcmV0dXJuIHRoaXMuZXhlYy5leGVjdXRlKHRvb2xOYW1lLCBhcmdzKTsgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnY3JlYXRlX2Zyb21fc3BlYycsXG4gICAgICAgIHRpdGxlOiAnQ3JlYXRlIHByZWZhYiBmcm9tIHNwZWMnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBDcmVhdGUgYSBzY2VuZSBub2RlIHRyZWUgZnJvbSBhIHNwZWMsIGF1dG8tYmluZCBjdXN0b20gc2NyaXB0IHJlZmVyZW5jZXMsIHRoZW4gc2F2ZSBpdCBhcyBhIHByZWZhYiBhc3NldC4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgcHJlZmFiUGF0aDogei5zdHJpbmcoKS5kZXNjcmliZSgnVGFyZ2V0IHByZWZhYiBkYjovLyBwYXRoLicpLFxuICAgICAgICAgICAgcm9vdFNwZWM6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICBuYW1lOiB6LnN0cmluZygpLFxuICAgICAgICAgICAgICAgIG5vZGVUeXBlOiB6LmVudW0oWydOb2RlJywgJzJETm9kZScsICczRE5vZGUnXSkuZGVmYXVsdCgnTm9kZScpLm9wdGlvbmFsKCksXG4gICAgICAgICAgICAgICAgY29tcG9uZW50czogei5hcnJheSh6LnN0cmluZygpKS5vcHRpb25hbCgpLFxuICAgICAgICAgICAgICAgIGxheWVyOiB6LnVuaW9uKFtcbiAgICAgICAgICAgICAgICAgICAgei5lbnVtKFsnREVGQVVMVCcsICdVSV8yRCcsICdVSV8zRCcsICdTQ0VORV9HSVpNTycsICdFRElUT1InLCAnR0laTU9TJywgJ0lHTk9SRV9SQVlDQVNUJywgJ1BST0ZJTEVSJ10pLFxuICAgICAgICAgICAgICAgICAgICB6Lm51bWJlcigpLmludCgpLm5vbm5lZ2F0aXZlKCksXG4gICAgICAgICAgICAgICAgXSkub3B0aW9uYWwoKSxcbiAgICAgICAgICAgICAgICBhY3RpdmU6IHouYm9vbGVhbigpLm9wdGlvbmFsKCksXG4gICAgICAgICAgICAgICAgcG9zaXRpb246IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgeDogei5udW1iZXIoKS5vcHRpb25hbCgpLFxuICAgICAgICAgICAgICAgICAgICB5OiB6Lm51bWJlcigpLm9wdGlvbmFsKCksXG4gICAgICAgICAgICAgICAgICAgIHo6IHoubnVtYmVyKCkub3B0aW9uYWwoKSxcbiAgICAgICAgICAgICAgICB9KS5vcHRpb25hbCgpLFxuICAgICAgICAgICAgICAgIGNoaWxkcmVuOiB6LmFycmF5KHouYW55KCkpLm9wdGlvbmFsKCksXG4gICAgICAgICAgICB9KS5kZXNjcmliZSgnUm9vdCBub2RlIHNwZWMgcGFzc2VkIHRvIGNyZWF0ZV90cmVlLicpLFxuICAgICAgICAgICAgYXV0b0JpbmRNb2RlOiB6LmVudW0oWydzdHJpY3QnLCAnZnV6enknLCAnbm9uZSddKS5kZWZhdWx0KCdzdHJpY3QnKS5kZXNjcmliZSgnQXV0by1iaW5kIG1vZGUgZm9yIGN1c3RvbSBzY3JpcHQgY29tcG9uZW50cy4nKSxcbiAgICAgICAgICAgIHBhcmVudFV1aWQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnT3B0aW9uYWwgcGFyZW50IG5vZGUgVVVJRCBmb3IgdGVtcG9yYXJ5IHNjZW5lIGNvbnN0cnVjdGlvbi4nKSxcbiAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBjcmVhdGVGcm9tU3BlYyhhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgdHJlZVJlc3VsdCA9IGF3YWl0IHRoaXMubm9kZVRvb2xzLmV4ZWN1dGUoJ2NyZWF0ZV90cmVlJywge1xuICAgICAgICAgICAgICAgIHNwZWM6IFthcmdzLnJvb3RTcGVjXSxcbiAgICAgICAgICAgICAgICBwYXJlbnRVdWlkOiBhcmdzLnBhcmVudFV1aWQsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGlmICghdHJlZVJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRyZWVSZXN1bHQ7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IGNyZWF0ZWROb2RlcyA9IHRyZWVSZXN1bHQuZGF0YT8ubm9kZXMgfHwge307XG4gICAgICAgICAgICBjb25zdCByb290Tm9kZVV1aWQgPSBjcmVhdGVkTm9kZXNbYXJncy5yb290U3BlYy5uYW1lXTtcbiAgICAgICAgICAgIGlmICghcm9vdE5vZGVVdWlkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ1Jvb3Qgbm9kZSBVVUlEIG1pc3NpbmcgZnJvbSBjcmVhdGVfdHJlZSByZXN1bHQnKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGFyZ3MuYXV0b0JpbmRNb2RlICE9PSAnbm9uZScpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB1dWlkcyA9IE9iamVjdC52YWx1ZXMoY3JlYXRlZE5vZGVzKSBhcyBzdHJpbmdbXTtcbiAgICAgICAgICAgICAgICBjb25zdCBub2RlRGF0YVJlc3VsdHMgPSBhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQoXG4gICAgICAgICAgICAgICAgICAgIHV1aWRzLm1hcCh1dWlkID0+IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LW5vZGUnLCB1dWlkKSlcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdXVpZHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgciA9IG5vZGVEYXRhUmVzdWx0c1tpXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHIuc3RhdHVzICE9PSAnZnVsZmlsbGVkJykgY29udGludWU7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbXBzOiBhbnlbXSA9IChyLnZhbHVlIGFzIGFueSk/Ll9fY29tcHNfXyB8fCBbXTtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBjb21wIG9mIGNvbXBzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjb21wb25lbnRUeXBlID0gY29tcD8uX190eXBlX187XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGNvbXBvbmVudFR5cGUgPT09ICdzdHJpbmcnICYmICFjb21wb25lbnRUeXBlLnN0YXJ0c1dpdGgoJ2NjLicpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5jb21wb25lbnRUb29scy5leGVjdXRlKCdhdXRvX2JpbmQnLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5vZGVVdWlkOiB1dWlkc1tpXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50VHlwZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbW9kZTogYXJncy5hdXRvQmluZE1vZGUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IHByZWZhYlJlc3VsdCA9IGF3YWl0IHJ1blNjZW5lTWV0aG9kQXNUb29sUmVzcG9uc2UoJ2NyZWF0ZVByZWZhYkZyb21Ob2RlJywgW3Jvb3ROb2RlVXVpZCwgYXJncy5wcmVmYWJQYXRoXSk7XG4gICAgICAgICAgICBpZiAocHJlZmFiUmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gb2soe1xuICAgICAgICAgICAgICAgICAgICAuLi4ocHJlZmFiUmVzdWx0LmRhdGEgPz8ge30pLFxuICAgICAgICAgICAgICAgICAgICBjcmVhdGVkTm9kZXMsXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBwcmVmYWJSZXN1bHQ7XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChgRmFpbGVkIHRvIGNyZWF0ZSBwcmVmYWIgZnJvbSBzcGVjOiAke2Vyci5tZXNzYWdlfWApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnZ2V0X3ByZWZhYl9saXN0JyxcbiAgICAgICAgdGl0bGU6ICdMaXN0IHByZWZhYiBhc3NldHMnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBMaXN0IC5wcmVmYWIgYXNzZXRzIHVuZGVyIGEgZm9sZGVyIHdpdGggbmFtZS9wYXRoL3V1aWQuIE5vIHNjZW5lIG9yIGFzc2V0IG11dGF0aW9uLiBBbHNvIGV4cG9zZWQgYXMgcmVzb3VyY2UgY29jb3M6Ly9wcmVmYWJzIChkZWZhdWx0IGZvbGRlcj1kYjovL2Fzc2V0cykgYW5kIGNvY29zOi8vcHJlZmFic3s/Zm9sZGVyfSB0ZW1wbGF0ZTsgcHJlZmVyIHRoZSByZXNvdXJjZSB3aGVuIHRoZSBjbGllbnQgc3VwcG9ydHMgTUNQIHJlc291cmNlcy4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgZm9sZGVyOiB6LnN0cmluZygpLmRlZmF1bHQoJ2RiOi8vYXNzZXRzJykuZGVzY3JpYmUoJ2RiOi8vIGZvbGRlciB0byBzY2FuIGZvciBwcmVmYWJzLiBEZWZhdWx0IGRiOi8vYXNzZXRzLicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIGdldFByZWZhYkxpc3QoYXJnczogeyBmb2xkZXI/OiBzdHJpbmcgfSB8IHN0cmluZyA9ICdkYjovL2Fzc2V0cycpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBmb2xkZXIgPSB0eXBlb2YgYXJncyA9PT0gJ3N0cmluZycgPyBhcmdzIDogYXJncy5mb2xkZXIgPz8gJ2RiOi8vYXNzZXRzJztcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBwYXR0ZXJuID0gZm9sZGVyLmVuZHNXaXRoKCcvJykgPyBcbiAgICAgICAgICAgICAgICBgJHtmb2xkZXJ9KiovKi5wcmVmYWJgIDogYCR7Zm9sZGVyfS8qKi8qLnByZWZhYmA7XG5cbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0cycsIHtcbiAgICAgICAgICAgICAgICBwYXR0ZXJuOiBwYXR0ZXJuXG4gICAgICAgICAgICB9KS50aGVuKChyZXN1bHRzOiBhbnlbXSkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHByZWZhYnM6IFByZWZhYkluZm9bXSA9IHJlc3VsdHMubWFwKGFzc2V0ID0+ICh7XG4gICAgICAgICAgICAgICAgICAgIG5hbWU6IGFzc2V0Lm5hbWUsXG4gICAgICAgICAgICAgICAgICAgIHBhdGg6IGFzc2V0LnVybCxcbiAgICAgICAgICAgICAgICAgICAgdXVpZDogYXNzZXQudXVpZCxcbiAgICAgICAgICAgICAgICAgICAgZm9sZGVyOiBhc3NldC51cmwuc3Vic3RyaW5nKDAsIGFzc2V0LnVybC5sYXN0SW5kZXhPZignLycpKVxuICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHByZWZhYnMpKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnbG9hZF9wcmVmYWInLFxuICAgICAgICB0aXRsZTogJ1JlYWQgcHJlZmFiIG1ldGFkYXRhJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gUmVhZCBwcmVmYWIgYXNzZXQgbWV0YWRhdGEgb25seS4gRG9lcyBub3QgaW5zdGFudGlhdGU7IHVzZSBpbnN0YW50aWF0ZV9wcmVmYWIgb3IgY3JlYXRlX25vZGUgYXNzZXRVdWlkL2Fzc2V0UGF0aCB0byBhZGQgb25lIHRvIHRoZSBzY2VuZS4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgcHJlZmFiUGF0aDogei5zdHJpbmcoKS5kZXNjcmliZSgnUHJlZmFiIGRiOi8vIHBhdGguIFJlYWRzIG1ldGFkYXRhIG9ubHk7IGRvZXMgbm90IGluc3RhbnRpYXRlLicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIGxvYWRQcmVmYWIoYXJnczogeyBwcmVmYWJQYXRoOiBzdHJpbmcgfSB8IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHByZWZhYlBhdGggPSB0eXBlb2YgYXJncyA9PT0gJ3N0cmluZycgPyBhcmdzIDogYXJncy5wcmVmYWJQYXRoO1xuICAgICAgICAvLyBPcmlnaW5hbCBpbXBsZW1lbnRhdGlvbiBjYWxsZWQgc2NlbmUgYGxvYWQtYXNzZXRgLCB3aGljaCBpcyBub3QgYSByZWFsXG4gICAgICAgIC8vIGNoYW5uZWwgb24gdGhlIHNjZW5lIG1vZHVsZSBwZXIgQGNvY29zL2NyZWF0b3ItdHlwZXMuIFRoZXJlIGlzIG5vXG4gICAgICAgIC8vIGdlbmVyaWMgXCJsb2FkIGEgcHJlZmFiIHdpdGhvdXQgaW5zdGFudGlhdGluZ1wiIG9wZXJhdGlvbiBleHBvc2VkIHRvXG4gICAgICAgIC8vIGVkaXRvciBleHRlbnNpb25zLiBSZXR1cm4gdGhlIGFzc2V0IG1ldGFkYXRhIHZpYSBhc3NldC1kYiBpbnN0ZWFkO1xuICAgICAgICAvLyBjYWxsZXJzIHdobyBhY3R1YWxseSB3YW50IHRoZSBwcmVmYWIgaW4gdGhlIHNjZW5lIHNob3VsZCB1c2VcbiAgICAgICAgLy8gaW5zdGFudGlhdGVfcHJlZmFiLlxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0LWluZm8nLCBwcmVmYWJQYXRoKS50aGVuKChhc3NldEluZm86IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmICghYXNzZXRJbmZvKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChgUHJlZmFiIG5vdCBmb3VuZDogJHtwcmVmYWJQYXRofWApKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IGFzc2V0SW5mby51dWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogYXNzZXRJbmZvLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICB1cmw6IGFzc2V0SW5mby51cmwsXG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiBhc3NldEluZm8udHlwZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHNvdXJjZTogYXNzZXRJbmZvLnNvdXJjZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdQcmVmYWIgbWV0YWRhdGEgcmV0cmlldmVkIChpbnN0YW50aWF0ZV9wcmVmYWIgdG8gYWRkIGl0IHRvIHRoZSBzY2VuZSknLFxuICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ2luc3RhbnRpYXRlX3ByZWZhYicsXG4gICAgICAgIHRpdGxlOiAnSW5zdGFudGlhdGUgcHJlZmFiJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gSW5zdGFudGlhdGUgYSBwcmVmYWIgaW50byB0aGUgY3VycmVudCBzY2VuZTsgbXV0YXRlcyBzY2VuZSBhbmQgcHJlc2VydmVzIHByZWZhYiBsaW5rLicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICBwcmVmYWJQYXRoOiB6LnN0cmluZygpLmRlc2NyaWJlKCdQcmVmYWIgZGI6Ly8gcGF0aCB0byBpbnN0YW50aWF0ZS4nKSxcbiAgICAgICAgICAgIHBhcmVudFV1aWQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnUGFyZW50IG5vZGUgVVVJRC4gT21pdCB0byBsZXQgQ29jb3MgY2hvb3NlIHRoZSBkZWZhdWx0IHBhcmVudC4nKSxcbiAgICAgICAgICAgIHBvc2l0aW9uOiBwcmVmYWJQb3NpdGlvblNjaGVtYS5vcHRpb25hbCgpLmRlc2NyaWJlKCdJbml0aWFsIGxvY2FsIHBvc2l0aW9uIGZvciB0aGUgY3JlYXRlZCBwcmVmYWIgaW5zdGFuY2UuJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgaW5zdGFudGlhdGVQcmVmYWIoYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIOeNsuWPlumgkOijvemrlOizh+a6kOS/oeaBr1xuICAgICAgICAgICAgY29uc3QgYXNzZXRJbmZvID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXQtaW5mbycsIGFyZ3MucHJlZmFiUGF0aCk7XG4gICAgICAgICAgICBpZiAoIWFzc2V0SW5mbykge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcign6aCQ6KO96auU5pyq5om+5YiwJyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIOS9v+eUqOato+eiuueahCBjcmVhdGUtbm9kZSBBUEkg5b6e6aCQ6KO96auU6LOH5rqQ5a+m5L6L5YyWXG4gICAgICAgICAgICBjb25zdCBjcmVhdGVOb2RlT3B0aW9uczogYW55ID0ge1xuICAgICAgICAgICAgICAgIGFzc2V0VXVpZDogYXNzZXRJbmZvLnV1aWRcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIC8vIOioree9rueItuevgOm7nlxuICAgICAgICAgICAgaWYgKGFyZ3MucGFyZW50VXVpZCkge1xuICAgICAgICAgICAgICAgIGNyZWF0ZU5vZGVPcHRpb25zLnBhcmVudCA9IGFyZ3MucGFyZW50VXVpZDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8g6Kit572u56+A6bue5ZCN56ixXG4gICAgICAgICAgICBpZiAoYXJncy5uYW1lKSB7XG4gICAgICAgICAgICAgICAgY3JlYXRlTm9kZU9wdGlvbnMubmFtZSA9IGFyZ3MubmFtZTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoYXNzZXRJbmZvLm5hbWUpIHtcbiAgICAgICAgICAgICAgICBjcmVhdGVOb2RlT3B0aW9ucy5uYW1lID0gYXNzZXRJbmZvLm5hbWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIOioree9ruWIneWni+WxrOaAp++8iOWmguS9jee9ru+8iVxuICAgICAgICAgICAgaWYgKGFyZ3MucG9zaXRpb24pIHtcbiAgICAgICAgICAgICAgICBjcmVhdGVOb2RlT3B0aW9ucy5kdW1wID0ge1xuICAgICAgICAgICAgICAgICAgICBwb3NpdGlvbjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWU6IGFyZ3MucG9zaXRpb25cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIOWJteW7uuevgOm7nlxuICAgICAgICAgICAgY29uc3Qgbm9kZVV1aWQgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdjcmVhdGUtbm9kZScsIGNyZWF0ZU5vZGVPcHRpb25zKTtcbiAgICAgICAgICAgIGNvbnN0IHV1aWQgPSBBcnJheS5pc0FycmF5KG5vZGVVdWlkKSA/IG5vZGVVdWlkWzBdIDogbm9kZVV1aWQ7XG5cbiAgICAgICAgICAgIC8vIOazqOaEj++8mmNyZWF0ZS1ub2RlIEFQSeW+numgkOijvemrlOizh+a6kOWJteW7uuaZguaHieipsuiHquWLleW7uueri+mgkOijvemrlOmXnOiBr1xuICAgICAgICAgICAgZGVidWdMb2coJ+mgkOijvemrlOevgOm7nuWJteW7uuaIkOWKnzonLCB7XG4gICAgICAgICAgICAgICAgbm9kZVV1aWQ6IHV1aWQsXG4gICAgICAgICAgICAgICAgcHJlZmFiVXVpZDogYXNzZXRJbmZvLnV1aWQsXG4gICAgICAgICAgICAgICAgcHJlZmFiUGF0aDogYXJncy5wcmVmYWJQYXRoXG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgcmV0dXJuIG9rKHtcbiAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWQ6IHV1aWQsXG4gICAgICAgICAgICAgICAgICAgIHByZWZhYlBhdGg6IGFyZ3MucHJlZmFiUGF0aCxcbiAgICAgICAgICAgICAgICAgICAgcGFyZW50VXVpZDogYXJncy5wYXJlbnRVdWlkLFxuICAgICAgICAgICAgICAgICAgICBwb3NpdGlvbjogYXJncy5wb3NpdGlvbixcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogJ+mgkOijvemrlOWvpuS+i+WMluaIkOWKn++8jOW3suW7uueri+mgkOijvemrlOmXnOiBrydcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgZXJyb3I6IGDpoJDoo73pq5Tlr6bkvovljJblpLHmlZc6ICR7ZXJyLm1lc3NhZ2V9YCxcbiAgICAgICAgICAgICAgICBpbnN0cnVjdGlvbjogJ+iri+aqouafpemgkOijvemrlOi3r+W+keaYr+WQpuato+eiuu+8jOeiuuS/nemgkOijvemrlOaWh+S7tuagvOW8j+ato+eiuidcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdjcmVhdGVfcHJlZmFiJyxcbiAgICAgICAgdGl0bGU6ICdDcmVhdGUgcHJlZmFiIGFzc2V0JyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gQ3JlYXRlIGEgcHJlZmFiIGFzc2V0IGZyb20gYSBzY2VuZSBub2RlIHZpYSBjY2UuUHJlZmFiLmNyZWF0ZVByZWZhYiBmYWNhZGUuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIG5vZGVVdWlkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdTb3VyY2Ugbm9kZSBVVUlEIHRvIGNvbnZlcnQgaW50byBhIHByZWZhYiwgaW5jbHVkaW5nIGNoaWxkcmVuIGFuZCBjb21wb25lbnRzLicpLFxuICAgICAgICAgICAgc2F2ZVBhdGg6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1RhcmdldCBwcmVmYWIgZGI6Ly8gcGF0aC4gUGFzcyBhIGZ1bGwgLnByZWZhYiBwYXRoIG9yIGEgZm9sZGVyLicpLFxuICAgICAgICAgICAgcHJlZmFiTmFtZTogei5zdHJpbmcoKS5kZXNjcmliZSgnUHJlZmFiIG5hbWU7IHVzZWQgYXMgZmlsZW5hbWUgd2hlbiBzYXZlUGF0aCBpcyBhIGZvbGRlci4nKSxcbiAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBjcmVhdGVQcmVmYWIoYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIOaUr+aMgSBwcmVmYWJQYXRoIOWSjCBzYXZlUGF0aCDlhannqK7lj4PmlbjlkI1cbiAgICAgICAgICAgIGNvbnN0IHBhdGhQYXJhbSA9IGFyZ3MucHJlZmFiUGF0aCB8fCBhcmdzLnNhdmVQYXRoO1xuICAgICAgICAgICAgaWYgKCFwYXRoUGFyYW0pIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFpbCgn57y65bCR6aCQ6KO96auU6Lev5b6R5Y+D5pW444CC6KuL5o+Q5L6bIHByZWZhYlBhdGgg5oiWIHNhdmVQYXRo44CCJyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IHByZWZhYk5hbWUgPSBhcmdzLnByZWZhYk5hbWUgfHwgJ05ld1ByZWZhYic7XG4gICAgICAgICAgICBjb25zdCBmdWxsUGF0aCA9IHBhdGhQYXJhbS5lbmRzV2l0aCgnLnByZWZhYicpID9cbiAgICAgICAgICAgICAgICBwYXRoUGFyYW0gOiBgJHtwYXRoUGFyYW19LyR7cHJlZmFiTmFtZX0ucHJlZmFiYDtcblxuICAgICAgICAgICAgLy8gVGhlIG9mZmljaWFsIHNjZW5lLWZhY2FkZSBwYXRoIChjY2UuUHJlZmFiLmNyZWF0ZVByZWZhYiB2aWFcbiAgICAgICAgICAgIC8vIGV4ZWN1dGUtc2NlbmUtc2NyaXB0KS4gVGhlIGxlZ2FjeSBoYW5kLXJvbGxlZCBKU09OIGZhbGxiYWNrXG4gICAgICAgICAgICAvLyAoY3JlYXRlUHJlZmFiV2l0aEFzc2V0REIgLyBjcmVhdGVQcmVmYWJOYXRpdmUgLyBjcmVhdGVQcmVmYWJDdXN0b20sXG4gICAgICAgICAgICAvLyB+MjUwIHNvdXJjZSBsaW5lcykgd2FzIHJlbW92ZWQgaW4gdjIuMS4zIOKAlCBzZWUgY29tbWl0IDU0NzExNWJcbiAgICAgICAgICAgIC8vIGZvciB0aGUgcHJlLXJlbW92YWwgc291cmNlIGlmIGEgZnV0dXJlIENvY29zIENyZWF0b3IgYnVpbGRcbiAgICAgICAgICAgIC8vIGJyZWFrcyB0aGUgZmFjYWRlIHBhdGguIFRoZSBmYWNhZGUgaGFzIGJlZW4gdGhlIG9ubHkgcGF0aFxuICAgICAgICAgICAgLy8gZXhlcmNpc2VkIGluIHYyLjEuMSAvIHYyLjEuMiByZWFsLWVkaXRvciB0ZXN0aW5nIGFjcm9zc1xuICAgICAgICAgICAgLy8gc2ltcGxlIGFuZCBjb21wbGV4IChuZXN0ZWQgKyBtdWx0aS1jb21wb25lbnQpIHByZWZhYiBmb3Jtcy5cbiAgICAgICAgICAgIGRlYnVnTG9nKCdDYWxsaW5nIHNjZW5lLXNjcmlwdCBjY2UuUHJlZmFiLmNyZWF0ZVByZWZhYi4uLicpO1xuICAgICAgICAgICAgY29uc3QgZmFjYWRlUmVzdWx0ID0gYXdhaXQgcnVuU2NlbmVNZXRob2RBc1Rvb2xSZXNwb25zZSgnY3JlYXRlUHJlZmFiRnJvbU5vZGUnLCBbYXJncy5ub2RlVXVpZCwgZnVsbFBhdGhdKTtcbiAgICAgICAgICAgIGlmICghZmFjYWRlUmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFjYWRlUmVzdWx0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdyZWZyZXNoLWFzc2V0JywgZnVsbFBhdGgpO1xuICAgICAgICAgICAgfSBjYXRjaCAocmVmcmVzaEVycjogYW55KSB7XG4gICAgICAgICAgICAgICAgZGVidWdMb2coYHJlZnJlc2gtYXNzZXQgYWZ0ZXIgZmFjYWRlIGNyZWF0ZVByZWZhYiBmYWlsZWQgKG5vbi1mYXRhbCk6ICR7cmVmcmVzaEVycj8ubWVzc2FnZSA/PyByZWZyZXNoRXJyfWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAuLi5mYWNhZGVSZXN1bHQsXG4gICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICAuLi4oZmFjYWRlUmVzdWx0LmRhdGEgPz8ge30pLFxuICAgICAgICAgICAgICAgICAgICBwcmVmYWJOYW1lLFxuICAgICAgICAgICAgICAgICAgICBwcmVmYWJQYXRoOiBmdWxsUGF0aCxcbiAgICAgICAgICAgICAgICAgICAgbWV0aG9kOiAnc2NlbmUtZmFjYWRlJyxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGDlibXlu7rpoJDoo73pq5TmmYLnmbznlJ/pjK/oqqQ6ICR7ZXJyb3J9YCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICd1cGRhdGVfcHJlZmFiJyxcbiAgICAgICAgdGl0bGU6ICdBcHBseSBwcmVmYWIgZWRpdHMnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBBcHBseSBwcmVmYWIgaW5zdGFuY2UgZWRpdHMgYmFjayB0byBpdHMgbGlua2VkIHByZWZhYiBhc3NldDsgcHJlZmFiUGF0aCBpcyBjb250ZXh0IG9ubHkuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIHByZWZhYlBhdGg6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1ByZWZhYiBhc3NldCBwYXRoIGZvciByZXNwb25zZSBjb250ZXh0OyBhcHBseSB1c2VzIG5vZGVVdWlkIGxpbmtlZCBwcmVmYWIgZGF0YS4nKSxcbiAgICAgICAgICAgIG5vZGVVdWlkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdNb2RpZmllZCBwcmVmYWIgaW5zdGFuY2Ugbm9kZSBVVUlEIHRvIGFwcGx5IGJhY2sgdG8gaXRzIGxpbmtlZCBwcmVmYWIuJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgdXBkYXRlUHJlZmFiKGFyZ3M6IHsgcHJlZmFiUGF0aDogc3RyaW5nOyBub2RlVXVpZDogc3RyaW5nIH0gfCBzdHJpbmcsIG1heWJlTm9kZVV1aWQ/OiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBwcmVmYWJQYXRoID0gdHlwZW9mIGFyZ3MgPT09ICdzdHJpbmcnID8gYXJncyA6IGFyZ3MucHJlZmFiUGF0aDtcbiAgICAgICAgY29uc3Qgbm9kZVV1aWQgPSB0eXBlb2YgYXJncyA9PT0gJ3N0cmluZycgPyBtYXliZU5vZGVVdWlkISA6IGFyZ3Mubm9kZVV1aWQ7XG4gICAgICAgIC8vIEFwcGx5IHBhdGguIFRoZXJlIGlzIG5vIGhvc3QtcHJvY2VzcyBFZGl0b3IuTWVzc2FnZSBjaGFubmVsIGZvclxuICAgICAgICAvLyB0aGlzOyB0aGUgb3BlcmF0aW9uIGxpdmVzIG9uIHRoZSBzY2VuZSBmYWNhZGUgYW5kIGlzIHJlYWNoYWJsZVxuICAgICAgICAvLyB2aWEgZXhlY3V0ZS1zY2VuZS1zY3JpcHQgKHNlZSBzb3VyY2Uvc2NlbmUudHM6YXBwbHlQcmVmYWIpLlxuICAgICAgICBjb25zdCBmYWNhZGVSZXN1bHQgPSBhd2FpdCBydW5TY2VuZU1ldGhvZEFzVG9vbFJlc3BvbnNlKCdhcHBseVByZWZhYicsIFtub2RlVXVpZF0pO1xuICAgICAgICBpZiAoZmFjYWRlUmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgLi4uZmFjYWRlUmVzdWx0LFxuICAgICAgICAgICAgICAgIGRhdGE6IHsgLi4uKGZhY2FkZVJlc3VsdC5kYXRhID8/IHt9KSwgcHJlZmFiUGF0aCwgbm9kZVV1aWQgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhaWwoZmFjYWRlUmVzdWx0LmVycm9yID8/ICdhcHBseVByZWZhYiBmYWlsZWQgdmlhIHNjZW5lIGZhY2FkZScsIHsgcHJlZmFiUGF0aCwgbm9kZVV1aWQgfSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnc2V0X2xpbmsnLFxuICAgICAgICB0aXRsZTogJ1NldCBwcmVmYWIgbGluaycsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIEF0dGFjaCBvciBkZXRhY2ggYSBwcmVmYWIgbGluayBvbiBhIG5vZGUuIG1vZGU9XCJsaW5rXCIgd3JhcHMgY2NlLlNjZW5lRmFjYWRlLmxpbmtQcmVmYWI7IG1vZGU9XCJ1bmxpbmtcIiB3cmFwcyBjY2UuU2NlbmVGYWNhZGUudW5saW5rUHJlZmFiLicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICBtb2RlOiB6LmVudW0oWydsaW5rJywgJ3VubGluayddKS5kZXNjcmliZSgnT3BlcmF0aW9uOiBcImxpbmtcIiBhdHRhY2hlcyBhIHJlZ3VsYXIgbm9kZSB0byBhIHByZWZhYiBhc3NldDsgXCJ1bmxpbmtcIiBkZXRhY2hlcyBhIHByZWZhYiBpbnN0YW5jZS4nKSxcbiAgICAgICAgICAgIG5vZGVVdWlkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdOb2RlIFVVSUQuIEZvciBtb2RlPVwibGlua1wiLCB0aGUgbm9kZSB0byBhdHRhY2g7IGZvciBtb2RlPVwidW5saW5rXCIsIHRoZSBwcmVmYWIgaW5zdGFuY2UgdG8gZGV0YWNoLicpLFxuICAgICAgICAgICAgYXNzZXRVdWlkOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1ByZWZhYiBhc3NldCBVVUlELiBSZXF1aXJlZCB3aGVuIG1vZGU9XCJsaW5rXCI7IGlnbm9yZWQgd2hlbiBtb2RlPVwidW5saW5rXCIuJyksXG4gICAgICAgICAgICByZW1vdmVOZXN0ZWQ6IHouYm9vbGVhbigpLmRlZmF1bHQoZmFsc2UpLmRlc2NyaWJlKCdXaGVuIG1vZGU9XCJ1bmxpbmtcIiwgYWxzbyB1bmxpbmsgbmVzdGVkIHByZWZhYiBpbnN0YW5jZXMgdW5kZXIgdGhpcyBub2RlLiBJZ25vcmVkIHdoZW4gbW9kZT1cImxpbmtcIi4nKSxcbiAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBzZXRMaW5rKGE6IHsgbW9kZTogJ2xpbmsnIHwgJ3VubGluayc7IG5vZGVVdWlkOiBzdHJpbmc7IGFzc2V0VXVpZD86IHN0cmluZzsgcmVtb3ZlTmVzdGVkOiBib29sZWFuIH0pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBpZiAoYS5tb2RlID09PSAnbGluaycpIHtcbiAgICAgICAgICAgIGlmICghYS5hc3NldFV1aWQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFpbCgnc2V0X2xpbmsgd2l0aCBtb2RlPVwibGlua1wiIHJlcXVpcmVzIGFzc2V0VXVpZCcpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHJ1blNjZW5lTWV0aG9kQXNUb29sUmVzcG9uc2UoJ2xpbmtQcmVmYWInLCBbYS5ub2RlVXVpZCwgYS5hc3NldFV1aWRdKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcnVuU2NlbmVNZXRob2RBc1Rvb2xSZXNwb25zZSgndW5saW5rUHJlZmFiJywgW2Eubm9kZVV1aWQsIGEucmVtb3ZlTmVzdGVkXSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnZ2V0X3ByZWZhYl9kYXRhJyxcbiAgICAgICAgdGl0bGU6ICdSZWFkIHByZWZhYiBkYXRhJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gUmVhZCBmYWNhZGUgcHJlZmFiIGR1bXAgZm9yIGEgcHJlZmFiIGluc3RhbmNlIG5vZGUuIE5vIG11dGF0aW9uOyB1c2VmdWwgZm9yIGluc3BlY3RpbmcgaW5zdGFuY2UvbGluayBzZXJpYWxpemVkIGRhdGEuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIG5vZGVVdWlkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdQcmVmYWIgaW5zdGFuY2Ugbm9kZSBVVUlEIHdob3NlIHByZWZhYiBkdW1wIHNob3VsZCBiZSByZWFkLicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIGdldFByZWZhYkRhdGEoYXJnczogeyBub2RlVXVpZDogc3RyaW5nIH0gfCBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBub2RlVXVpZCA9IHR5cGVvZiBhcmdzID09PSAnc3RyaW5nJyA/IGFyZ3MgOiBhcmdzLm5vZGVVdWlkO1xuICAgICAgICByZXR1cm4gcnVuU2NlbmVNZXRob2RBc1Rvb2xSZXNwb25zZSgnZ2V0UHJlZmFiRGF0YScsIFtub2RlVXVpZF0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ3JldmVydF9wcmVmYWInLFxuICAgICAgICB0aXRsZTogJ1JldmVydCBwcmVmYWIgaW5zdGFuY2UnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBSZXN0b3JlIGEgcHJlZmFiIGluc3RhbmNlIGZyb20gaXRzIGxpbmtlZCBhc3NldDsgZGlzY2FyZHMgdW5hcHBsaWVkIG92ZXJyaWRlcy4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgbm9kZVV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1ByZWZhYiBpbnN0YW5jZSBub2RlIFVVSUQgdG8gcmVzdG9yZSBmcm9tIGl0cyBsaW5rZWQgYXNzZXQuJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgcmV2ZXJ0UHJlZmFiKGFyZ3M6IHsgbm9kZVV1aWQ6IHN0cmluZyB9IHwgc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3Qgbm9kZVV1aWQgPSB0eXBlb2YgYXJncyA9PT0gJ3N0cmluZycgPyBhcmdzIDogYXJncy5ub2RlVXVpZDtcbiAgICAgICAgLy8gVGhlIHByZXZpb3VzIGNvZGUgY2FsbGVkIHNjZW5lIGByZXZlcnQtcHJlZmFiYCwgd2hpY2ggZG9lcyBub3QgZXhpc3QuXG4gICAgICAgIC8vIFRoZSB2ZXJpZmllZCBjaGFubmVsIGlzIGByZXN0b3JlLXByZWZhYmAgdGFraW5nIGB7IHV1aWQ6IHN0cmluZyB9YFxuICAgICAgICAvLyAoUmVzZXRDb21wb25lbnRPcHRpb25zKS4gUGVyIHRoZSBlZGl0b3IgY29udmVudGlvbiB0aGlzIHJlc3RvcmVzIHRoZVxuICAgICAgICAvLyBub2RlIGZyb20gaXRzIGxpbmtlZCBwcmVmYWIgYXNzZXQsIHdoaWNoIG1hdGNoZXMgdGhlIFwicmV2ZXJ0XCIgaW50ZW50LlxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3Jlc3RvcmUtcHJlZmFiJywgeyB1dWlkOiBub2RlVXVpZCB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHVuZGVmaW5lZCwgJ1ByZWZhYiBpbnN0YW5jZSByZXZlcnRlZCBzdWNjZXNzZnVsbHknKSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ2dldF9wcmVmYWJfaW5mbycsXG4gICAgICAgIHRpdGxlOiAnUmVhZCBwcmVmYWIgaW5mbycsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFJlYWQgcHJlZmFiIG1ldGEvZGVwZW5kZW5jeSBzdW1tYXJ5IGJlZm9yZSBhcHBseS9yZXZlcnQuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIHByZWZhYlBhdGg6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1ByZWZhYiBhc3NldCBkYjovLyBwYXRoLicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIGdldFByZWZhYkluZm8oYXJnczogeyBwcmVmYWJQYXRoOiBzdHJpbmcgfSB8IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHByZWZhYlBhdGggPSB0eXBlb2YgYXJncyA9PT0gJ3N0cmluZycgPyBhcmdzIDogYXJncy5wcmVmYWJQYXRoO1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0LWluZm8nLCBwcmVmYWJQYXRoKS50aGVuKChhc3NldEluZm86IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmICghYXNzZXRJbmZvKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignUHJlZmFiIG5vdCBmb3VuZCcpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJldHVybiBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldC1tZXRhJywgYXNzZXRJbmZvLnV1aWQpO1xuICAgICAgICAgICAgfSkudGhlbigobWV0YUluZm86IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGluZm86IFByZWZhYkluZm8gPSB7XG4gICAgICAgICAgICAgICAgICAgIG5hbWU6IG1ldGFJbmZvLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgIHV1aWQ6IG1ldGFJbmZvLnV1aWQsXG4gICAgICAgICAgICAgICAgICAgIHBhdGg6IHByZWZhYlBhdGgsXG4gICAgICAgICAgICAgICAgICAgIGZvbGRlcjogcHJlZmFiUGF0aC5zdWJzdHJpbmcoMCwgcHJlZmFiUGF0aC5sYXN0SW5kZXhPZignLycpKSxcbiAgICAgICAgICAgICAgICAgICAgY3JlYXRlVGltZTogbWV0YUluZm8uY3JlYXRlVGltZSxcbiAgICAgICAgICAgICAgICAgICAgbW9kaWZ5VGltZTogbWV0YUluZm8ubW9kaWZ5VGltZSxcbiAgICAgICAgICAgICAgICAgICAgZGVwZW5kZW5jaWVzOiBtZXRhSW5mby5kZXBlbmRzIHx8IFtdXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKGluZm8pKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAndmFsaWRhdGVfcHJlZmFiJyxcbiAgICAgICAgdGl0bGU6ICdWYWxpZGF0ZSBwcmVmYWIgYXNzZXQnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBSdW4gYmFzaWMgcHJlZmFiIEpTT04gc3RydWN0dXJhbCBjaGVja3M7IG5vdCBieXRlLWxldmVsIENvY29zIGVxdWl2YWxlbmNlLicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICBwcmVmYWJQYXRoOiB6LnN0cmluZygpLmRlc2NyaWJlKCdQcmVmYWIgZGI6Ly8gcGF0aCB3aG9zZSBKU09OIHN0cnVjdHVyZSBzaG91bGQgYmUgY2hlY2tlZC4nKSxcbiAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyB2YWxpZGF0ZVByZWZhYihhcmdzOiB7IHByZWZhYlBhdGg6IHN0cmluZyB9IHwgc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgcHJlZmFiUGF0aCA9IHR5cGVvZiBhcmdzID09PSAnc3RyaW5nJyA/IGFyZ3MgOiBhcmdzLnByZWZhYlBhdGg7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAvLyDoroDlj5bpoJDoo73pq5Tmlofku7blhaflrrlcbiAgICAgICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldC1pbmZvJywgcHJlZmFiUGF0aCkudGhlbigoYXNzZXRJbmZvOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFhc3NldEluZm8pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbCgn6aCQ6KO96auU5paH5Lu25LiN5a2Y5ZyoJykpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgLy8g6amX6K2J6aCQ6KO96auU5qC85byPXG4gICAgICAgICAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3JlYWQtYXNzZXQnLCBwcmVmYWJQYXRoKS50aGVuKChjb250ZW50OiBzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcHJlZmFiRGF0YSA9IEpTT04ucGFyc2UoY29udGVudCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgdmFsaWRhdGlvblJlc3VsdCA9IHRoaXMudmFsaWRhdGVQcmVmYWJGb3JtYXQocHJlZmFiRGF0YSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpc1ZhbGlkOiB2YWxpZGF0aW9uUmVzdWx0LmlzVmFsaWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpc3N1ZXM6IHZhbGlkYXRpb25SZXN1bHQuaXNzdWVzLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbm9kZUNvdW50OiB2YWxpZGF0aW9uUmVzdWx0Lm5vZGVDb3VudCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudENvdW50OiB2YWxpZGF0aW9uUmVzdWx0LmNvbXBvbmVudENvdW50LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogdmFsaWRhdGlvblJlc3VsdC5pc1ZhbGlkID8gJ+mgkOijvemrlOagvOW8j+acieaViCcgOiAn6aCQ6KO96auU5qC85byP5a2Y5Zyo5ZWP6aGMJ1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIChwYXJzZUVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKCfpoJDoo73pq5Tmlofku7bmoLzlvI/pjK/oqqTvvIznhKHms5Xop6PmnpBKU09OJykpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9KS5jYXRjaCgoZXJyb3I6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGDoroDlj5bpoJDoo73pq5Tmlofku7blpLHmlZc6ICR7ZXJyb3IubWVzc2FnZX1gKSk7XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0pLmNhdGNoKChlcnJvcjogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChg5p+l6Kmi6aCQ6KO96auU5L+h5oGv5aSx5pWXOiAke2Vycm9yLm1lc3NhZ2V9YCkpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoYOmpl+itiemgkOijvemrlOaZgueZvOeUn+mMr+iqpDogJHtlcnJvcn1gKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgdmFsaWRhdGVQcmVmYWJGb3JtYXQocHJlZmFiRGF0YTogYW55KTogeyBpc1ZhbGlkOiBib29sZWFuOyBpc3N1ZXM6IHN0cmluZ1tdOyBub2RlQ291bnQ6IG51bWJlcjsgY29tcG9uZW50Q291bnQ6IG51bWJlciB9IHtcbiAgICAgICAgY29uc3QgaXNzdWVzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICBsZXQgbm9kZUNvdW50ID0gMDtcbiAgICAgICAgbGV0IGNvbXBvbmVudENvdW50ID0gMDtcblxuICAgICAgICAvLyDmqqLmn6Xln7rmnKzntZDmp4tcbiAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KHByZWZhYkRhdGEpKSB7XG4gICAgICAgICAgICBpc3N1ZXMucHVzaCgn6aCQ6KO96auU5pW45pOa5b+F6aCI5piv5pW457WE5qC85byPJyk7XG4gICAgICAgICAgICByZXR1cm4geyBpc1ZhbGlkOiBmYWxzZSwgaXNzdWVzLCBub2RlQ291bnQsIGNvbXBvbmVudENvdW50IH07XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocHJlZmFiRGF0YS5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIGlzc3Vlcy5wdXNoKCfpoJDoo73pq5Tmlbjmk5rngrrnqbonKTtcbiAgICAgICAgICAgIHJldHVybiB7IGlzVmFsaWQ6IGZhbHNlLCBpc3N1ZXMsIG5vZGVDb3VudCwgY29tcG9uZW50Q291bnQgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIOaqouafpeesrOS4gOWAi+WFg+e0oOaYr+WQpueCuumgkOijvemrlOizh+eUolxuICAgICAgICBjb25zdCBmaXJzdEVsZW1lbnQgPSBwcmVmYWJEYXRhWzBdO1xuICAgICAgICBpZiAoIWZpcnN0RWxlbWVudCB8fCBmaXJzdEVsZW1lbnQuX190eXBlX18gIT09ICdjYy5QcmVmYWInKSB7XG4gICAgICAgICAgICBpc3N1ZXMucHVzaCgn56ys5LiA5YCL5YWD57Sg5b+F6aCI5pivY2MuUHJlZmFi6aGe5Z6LJyk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyDntbHoqIjnr4Dpu57lkozntYTku7ZcbiAgICAgICAgcHJlZmFiRGF0YS5mb3JFYWNoKChpdGVtOiBhbnksIGluZGV4OiBudW1iZXIpID0+IHtcbiAgICAgICAgICAgIGlmIChpdGVtLl9fdHlwZV9fID09PSAnY2MuTm9kZScpIHtcbiAgICAgICAgICAgICAgICBub2RlQ291bnQrKztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoaXRlbS5fX3R5cGVfXyAmJiBpdGVtLl9fdHlwZV9fLmluY2x1ZGVzKCdjYy4nKSkge1xuICAgICAgICAgICAgICAgIGNvbXBvbmVudENvdW50Kys7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIOaqouafpeW/heimgeeahOWtl+autVxuICAgICAgICBpZiAobm9kZUNvdW50ID09PSAwKSB7XG4gICAgICAgICAgICBpc3N1ZXMucHVzaCgn6aCQ6KO96auU5b+F6aCI5YyF5ZCr6Iez5bCR5LiA5YCL56+A6bueJyk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgaXNWYWxpZDogaXNzdWVzLmxlbmd0aCA9PT0gMCxcbiAgICAgICAgICAgIGlzc3VlcyxcbiAgICAgICAgICAgIG5vZGVDb3VudCxcbiAgICAgICAgICAgIGNvbXBvbmVudENvdW50XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAncmVzdG9yZV9wcmVmYWJfbm9kZScsXG4gICAgICAgIHRpdGxlOiAnUmVzdG9yZSBwcmVmYWIgbm9kZScsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFJlc3RvcmUgYSBwcmVmYWIgaW5zdGFuY2UgdGhyb3VnaCBzY2VuZS9yZXN0b3JlLXByZWZhYjsgYXNzZXRVdWlkIGlzIGNvbnRleHQgb25seS4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgbm9kZVV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1ByZWZhYiBpbnN0YW5jZSBub2RlIFVVSUQgcGFzc2VkIHRvIHNjZW5lL3Jlc3RvcmUtcHJlZmFiLicpLFxuICAgICAgICAgICAgYXNzZXRVdWlkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdQcmVmYWIgYXNzZXQgVVVJRCBrZXB0IGZvciByZXNwb25zZSBjb250ZXh0OyBDb2NvcyByZXN0b3JlLXByZWZhYiB1c2VzIG5vZGVVdWlkIG9ubHkuJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgcmVzdG9yZVByZWZhYk5vZGUoYXJnczogeyBub2RlVXVpZDogc3RyaW5nOyBhc3NldFV1aWQ6IHN0cmluZyB9IHwgc3RyaW5nLCBtYXliZUFzc2V0VXVpZD86IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IG5vZGVVdWlkID0gdHlwZW9mIGFyZ3MgPT09ICdzdHJpbmcnID8gYXJncyA6IGFyZ3Mubm9kZVV1aWQ7XG4gICAgICAgIGNvbnN0IGFzc2V0VXVpZCA9IHR5cGVvZiBhcmdzID09PSAnc3RyaW5nJyA/IG1heWJlQXNzZXRVdWlkISA6IGFyZ3MuYXNzZXRVdWlkO1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIC8vIFZlcmlmaWVkIHNpZ25hdHVyZSBwZXIgQGNvY29zL2NyZWF0b3ItdHlwZXM6IHNjZW5lL3Jlc3RvcmUtcHJlZmFiXG4gICAgICAgICAgICAvLyB0YWtlcyBhIHNpbmdsZSBSZXNldENvbXBvbmVudE9wdGlvbnMgPSB7IHV1aWQ6IHN0cmluZyB9LiBUaGVcbiAgICAgICAgICAgIC8vIHByZXZpb3VzIGNvZGUgcGFzc2VkIChub2RlVXVpZCwgYXNzZXRVdWlkKSBhcyBwb3NpdGlvbmFsIGFyZ3MsXG4gICAgICAgICAgICAvLyB3aGljaCB0aGUgQVBJIGlnbm9yZXMgYWZ0ZXIgdGhlIGZpcnN0IG9uZSBhbmQgc2lsZW50bHkgbWlzcm91dGVzLlxuICAgICAgICAgICAgLy8gYXNzZXRVdWlkIGlzIHByZXNlcnZlZCBvbiB0aGUgcmVxdWVzdCBzaGFwZSBmb3IgcmVzcG9uc2UgY29udGV4dFxuICAgICAgICAgICAgLy8gYnV0IGRvZXMgbm90IGZsb3cgaW50byB0aGUgZWRpdG9yIG1lc3NhZ2UuXG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdyZXN0b3JlLXByZWZhYicsIHsgdXVpZDogbm9kZVV1aWQgfSkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICBub2RlVXVpZDogbm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBhc3NldFV1aWQ6IGFzc2V0VXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICfpoJDoo73pq5Tnr4Dpu57pgoTljp/miJDlip8nXG4gICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnJvcjogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGDpoJDoo73pq5Tnr4Dpu57pgoTljp/lpLHmlZc6ICR7ZXJyb3IubWVzc2FnZX1gKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG59XG4iXX0=