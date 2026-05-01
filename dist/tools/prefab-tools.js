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
    async tryCreateNodeWithPrefab(args) {
        return new Promise((resolve) => {
            Editor.Message.request('asset-db', 'query-asset-info', args.prefabPath).then((assetInfo) => {
                if (!assetInfo) {
                    throw new Error('预制体未找到');
                }
                // 方法2: 使用 create-node 指定预制体资源
                const createNodeOptions = {
                    assetUuid: assetInfo.uuid
                };
                // 设置父节点
                if (args.parentUuid) {
                    createNodeOptions.parent = args.parentUuid;
                }
                return Editor.Message.request('scene', 'create-node', createNodeOptions);
            }).then((nodeUuid) => {
                const uuid = Array.isArray(nodeUuid) ? nodeUuid[0] : nodeUuid;
                // 如果指定了位置，设置节点位置
                if (args.position && uuid) {
                    Editor.Message.request('scene', 'set-property', {
                        uuid: uuid,
                        path: 'position',
                        dump: { value: args.position }
                    }).then(() => {
                        resolve({
                            success: true,
                            data: {
                                nodeUuid: uuid,
                                prefabPath: args.prefabPath,
                                position: args.position,
                                message: '预制体实例化成功（备用方法）并设置了位置'
                            }
                        });
                    }).catch(() => {
                        resolve({
                            success: true,
                            data: {
                                nodeUuid: uuid,
                                prefabPath: args.prefabPath,
                                message: '预制体实例化成功（备用方法）但位置设置失败'
                            }
                        });
                    });
                }
                else {
                    resolve({
                        success: true,
                        data: {
                            nodeUuid: uuid,
                            prefabPath: args.prefabPath,
                            message: '预制体实例化成功（备用方法）'
                        }
                    });
                }
            }).catch((err) => {
                resolve({
                    success: false,
                    error: `备用预制体实例化方法也失败: ${err.message}`
                });
            });
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
    async getNodeData(nodeUuid) {
        return new Promise(async (resolve) => {
            try {
                // 首先获取基本节点信息
                const nodeInfo = await Editor.Message.request('scene', 'query-node', nodeUuid);
                if (!nodeInfo) {
                    resolve(null);
                    return;
                }
                (0, log_1.debugLog)(`获取节点 ${nodeUuid} 的基本信息成功`);
                // 使用query-node-tree获取包含子节点的完整结构
                const nodeTree = await this.getNodeWithChildren(nodeUuid);
                if (nodeTree) {
                    (0, log_1.debugLog)(`获取节点 ${nodeUuid} 的完整树结构成功`);
                    resolve(nodeTree);
                }
                else {
                    (0, log_1.debugLog)(`使用基本节点信息`);
                    resolve(nodeInfo);
                }
            }
            catch (error) {
                console.warn(`获取节点数据失败 ${nodeUuid}:`, error);
                resolve(null);
            }
        });
    }
    // 使用query-node-tree获取包含子节点的完整节点结构
    async getNodeWithChildren(nodeUuid) {
        try {
            // 获取整个场景树
            const tree = await Editor.Message.request('scene', 'query-node-tree');
            if (!tree) {
                return null;
            }
            // 在树中查找指定的节点
            const targetNode = this.findNodeInTree(tree, nodeUuid);
            if (targetNode) {
                (0, log_1.debugLog)(`在场景树中找到节点 ${nodeUuid}，子节点数量: ${targetNode.children ? targetNode.children.length : 0}`);
                // 增强节点树，获取每个节点的正确组件信息
                const enhancedTree = await this.enhanceTreeWithMCPComponents(targetNode);
                return enhancedTree;
            }
            return null;
        }
        catch (error) {
            console.warn(`获取节点树结构失败 ${nodeUuid}:`, error);
            return null;
        }
    }
    // 在节点树中递归查找指定UUID的节点
    findNodeInTree(node, targetUuid) {
        var _a;
        if (!node)
            return null;
        // 检查当前节点
        if (node.uuid === targetUuid || ((_a = node.value) === null || _a === void 0 ? void 0 : _a.uuid) === targetUuid) {
            return node;
        }
        // 递归检查子节点
        if (node.children && Array.isArray(node.children)) {
            for (const child of node.children) {
                const found = this.findNodeInTree(child, targetUuid);
                if (found) {
                    return found;
                }
            }
        }
        return null;
    }
    /**
     * 使用MCP接口增强节点树，获取正确的组件信息
     */
    async enhanceTreeWithMCPComponents(node) {
        var _a, _b, _c;
        if (!node || !node.uuid) {
            return node;
        }
        try {
            // 使用MCP接口获取节点的组件信息
            const response = await fetch('http://localhost:8585/mcp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    "jsonrpc": "2.0",
                    "method": "tools/call",
                    "params": {
                        "name": "component_get_components",
                        "arguments": {
                            "nodeUuid": node.uuid
                        }
                    },
                    "id": Date.now()
                })
            });
            const mcpResult = await response.json();
            if ((_c = (_b = (_a = mcpResult.result) === null || _a === void 0 ? void 0 : _a.content) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.text) {
                const componentData = JSON.parse(mcpResult.result.content[0].text);
                if (componentData.success && componentData.data.components) {
                    // 更新节点的组件信息为MCP返回的正确数据
                    node.components = componentData.data.components;
                    (0, log_1.debugLog)(`节点 ${node.uuid} 获取到 ${componentData.data.components.length} 个组件，包含脚本组件的正确类型`);
                }
            }
        }
        catch (error) {
            console.warn(`获取节点 ${node.uuid} 的MCP组件信息失败:`, error);
        }
        // 递归处理子节点
        if (node.children && Array.isArray(node.children)) {
            for (let i = 0; i < node.children.length; i++) {
                node.children[i] = await this.enhanceTreeWithMCPComponents(node.children[i]);
            }
        }
        return node;
    }
    async buildBasicNodeInfo(nodeUuid) {
        return new Promise((resolve) => {
            // 构建基本的节点信息
            Editor.Message.request('scene', 'query-node', nodeUuid).then((nodeInfo) => {
                if (!nodeInfo) {
                    resolve(null);
                    return;
                }
                // 简化版本：只返回基本节点信息，不获取子节点和组件
                // 这些信息将在后续的预制体处理中根据需要添加
                const basicInfo = Object.assign(Object.assign({}, nodeInfo), { children: [], components: [] });
                resolve(basicInfo);
            }).catch(() => {
                resolve(null);
            });
        });
    }
    // 验证节点数据是否有效
    isValidNodeData(nodeData) {
        if (!nodeData)
            return false;
        if (typeof nodeData !== 'object')
            return false;
        // 检查基本属性 - 适配query-node-tree的数据格式
        return nodeData.hasOwnProperty('uuid') ||
            nodeData.hasOwnProperty('name') ||
            nodeData.hasOwnProperty('__type__') ||
            (nodeData.value && (nodeData.value.hasOwnProperty('uuid') ||
                nodeData.value.hasOwnProperty('name') ||
                nodeData.value.hasOwnProperty('__type__')));
    }
    // 提取子节点UUID的统一方法
    extractChildUuid(childRef) {
        if (!childRef)
            return null;
        // 方法1: 直接字符串
        if (typeof childRef === 'string') {
            return childRef;
        }
        // 方法2: value属性包含字符串
        if (childRef.value && typeof childRef.value === 'string') {
            return childRef.value;
        }
        // 方法3: value.uuid属性
        if (childRef.value && childRef.value.uuid) {
            return childRef.value.uuid;
        }
        // 方法4: 直接uuid属性
        if (childRef.uuid) {
            return childRef.uuid;
        }
        // 方法5: __id__引用 - 这种情况需要特殊处理
        if (childRef.__id__ !== undefined) {
            (0, log_1.debugLog)(`发现__id__引用: ${childRef.__id__}，可能需要从数据结构中查找`);
            return null; // 暂时返回null，后续可以添加引用解析逻辑
        }
        console.warn('无法提取子节点UUID:', JSON.stringify(childRef));
        return null;
    }
    // 获取需要处理的子节点数据
    getChildrenToProcess(nodeData) {
        var _a;
        const children = [];
        // 方法1: 直接从children数组获取（从query-node-tree返回的数据）
        if (nodeData.children && Array.isArray(nodeData.children)) {
            (0, log_1.debugLog)(`从children数组获取子节点，数量: ${nodeData.children.length}`);
            for (const child of nodeData.children) {
                // query-node-tree返回的子节点通常已经是完整的数据结构
                if (this.isValidNodeData(child)) {
                    children.push(child);
                    (0, log_1.debugLog)(`添加子节点: ${child.name || ((_a = child.value) === null || _a === void 0 ? void 0 : _a.name) || '未知'}`);
                }
                else {
                    (0, log_1.debugLog)('子节点数据无效:', JSON.stringify(child, null, 2));
                }
            }
        }
        else {
            (0, log_1.debugLog)('节点没有子节点或children数组为空');
        }
        return children;
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
    createPrefabData(nodeData, prefabName, prefabUuid) {
        // 创建标准的预制体数据结构
        const prefabAsset = {
            "__type__": "cc.Prefab",
            "_name": prefabName,
            "_objFlags": 0,
            "__editorExtras__": {},
            "_native": "",
            "data": {
                "__id__": 1
            },
            "optimizationPolicy": 0,
            "persistent": false
        };
        // 处理节点数据，确保符合预制体格式
        const processedNodeData = this.processNodeForPrefab(nodeData, prefabUuid);
        return [prefabAsset, ...processedNodeData];
    }
    processNodeForPrefab(nodeData, prefabUuid) {
        // 处理节点数据以符合预制体格式
        const processedData = [];
        let idCounter = 1;
        // 递归处理节点和组件
        const processNode = (node, parentId = 0) => {
            const nodeId = idCounter++;
            // 创建节点对象
            const processedNode = {
                "__type__": "cc.Node",
                "_name": node.name || "Node",
                "_objFlags": 0,
                "__editorExtras__": {},
                "_parent": parentId > 0 ? { "__id__": parentId } : null,
                "_children": node.children ? node.children.map(() => ({ "__id__": idCounter++ })) : [],
                "_active": node.active !== false,
                "_components": node.components ? node.components.map(() => ({ "__id__": idCounter++ })) : [],
                "_prefab": {
                    "__id__": idCounter++
                },
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
                "_id": ""
            };
            processedData.push(processedNode);
            // 处理组件
            if (node.components) {
                node.components.forEach((component) => {
                    const componentId = idCounter++;
                    const processedComponents = this.processComponentForPrefab(component, componentId);
                    processedData.push(...processedComponents);
                });
            }
            // 处理子节点
            if (node.children) {
                node.children.forEach((child) => {
                    processNode(child, nodeId);
                });
            }
            return nodeId;
        };
        processNode(nodeData);
        return processedData;
    }
    processComponentForPrefab(component, componentId) {
        // 处理组件数据以符合预制体格式
        const processedComponent = Object.assign({ "__type__": component.type || "cc.Component", "_name": "", "_objFlags": 0, "__editorExtras__": {}, "node": {
                "__id__": componentId - 1
            }, "_enabled": component.enabled !== false, "__prefab": {
                "__id__": componentId + 1
            } }, component.properties);
        // 添加组件特定的预制体信息
        const compPrefabInfo = {
            "__type__": "cc.CompPrefabInfo",
            "fileId": this.generateFileId()
        };
        return [processedComponent, compPrefabInfo];
    }
    generateFileId() {
        // 生成文件ID（简化版本）
        const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/';
        let fileId = '';
        for (let i = 0; i < 22; i++) {
            fileId += chars[Math.floor(Math.random() * chars.length)];
        }
        return fileId;
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
    async savePrefabFiles(prefabPath, prefabData, metaData) {
        return new Promise((resolve) => {
            try {
                // 使用Editor API保存预制体文件
                const prefabContent = JSON.stringify(prefabData, null, 2);
                const metaContent = JSON.stringify(metaData, null, 2);
                // 尝试使用更可靠的保存方法
                this.saveAssetFile(prefabPath, prefabContent).then(() => {
                    // 再创建meta文件
                    const metaPath = `${prefabPath}.meta`;
                    return this.saveAssetFile(metaPath, metaContent);
                }).then(() => {
                    resolve({ success: true });
                }).catch((error) => {
                    resolve({ success: false, error: error.message || '保存预制体文件失败' });
                });
            }
            catch (error) {
                resolve({ success: false, error: `保存文件时发生错误: ${error}` });
            }
        });
    }
    async saveAssetFile(filePath, content) {
        return new Promise((resolve, reject) => {
            // 尝试多种保存方法
            const saveMethods = [
                () => Editor.Message.request('asset-db', 'create-asset', filePath, content),
                () => Editor.Message.request('asset-db', 'save-asset', filePath, content),
                () => Editor.Message.request('asset-db', 'write-asset', filePath, content)
            ];
            const trySave = (index) => {
                if (index >= saveMethods.length) {
                    reject(new Error('所有保存方法都失败了'));
                    return;
                }
                saveMethods[index]().then(() => {
                    resolve();
                }).catch(() => {
                    trySave(index + 1);
                });
            };
            trySave(0);
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
    async createPrefabFromNode(args) {
        var _a;
        // 从 prefabPath 提取名称
        const prefabPath = args.prefabPath;
        const prefabName = ((_a = prefabPath.split('/').pop()) === null || _a === void 0 ? void 0 : _a.replace('.prefab', '')) || 'NewPrefab';
        // 调用原来的 createPrefab 方法
        return await this.createPrefab({
            nodeUuid: args.nodeUuid,
            savePath: prefabPath,
            prefabName: prefabName
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
    /**
     * 使用 asset-db API 创建资源文件
     */
    async createAssetWithAssetDB(assetPath, content) {
        return new Promise((resolve) => {
            Editor.Message.request('asset-db', 'create-asset', assetPath, content, {
                overwrite: true,
                rename: false
            }).then((assetInfo) => {
                (0, log_1.debugLog)('创建资源文件成功:', assetInfo);
                resolve({ success: true, data: assetInfo });
            }).catch((error) => {
                console.error('创建资源文件失败:', error);
                resolve({ success: false, error: error.message || '创建资源文件失败' });
            });
        });
    }
    /**
     * 使用 asset-db API 创建 meta 文件
     */
    async createMetaWithAssetDB(assetPath, metaContent) {
        return new Promise((resolve) => {
            const metaContentString = JSON.stringify(metaContent, null, 2);
            Editor.Message.request('asset-db', 'save-asset-meta', assetPath, metaContentString).then((assetInfo) => {
                (0, log_1.debugLog)('创建meta文件成功:', assetInfo);
                resolve({ success: true, data: assetInfo });
            }).catch((error) => {
                console.error('创建meta文件失败:', error);
                resolve({ success: false, error: error.message || '创建meta文件失败' });
            });
        });
    }
    /**
     * 使用 asset-db API 重新导入资源
     */
    async reimportAssetWithAssetDB(assetPath) {
        return new Promise((resolve) => {
            Editor.Message.request('asset-db', 'reimport-asset', assetPath).then((result) => {
                (0, log_1.debugLog)('重新导入资源成功:', result);
                resolve({ success: true, data: result });
            }).catch((error) => {
                console.error('重新导入资源失败:', error);
                resolve({ success: false, error: error.message || '重新导入资源失败' });
            });
        });
    }
    /**
     * 使用 asset-db API 更新资源文件内容
     */
    async updateAssetWithAssetDB(assetPath, content) {
        return new Promise((resolve) => {
            Editor.Message.request('asset-db', 'save-asset', assetPath, content).then((result) => {
                (0, log_1.debugLog)('更新资源文件成功:', result);
                resolve({ success: true, data: result });
            }).catch((error) => {
                console.error('更新资源文件失败:', error);
                resolve({ success: false, error: error.message || '更新资源文件失败' });
            });
        });
    }
    /**
     * 创建符合 Cocos Creator 标准的预制体内容
     * 完整实现递归节点树处理，匹配引擎标准格式
     */
    async createStandardPrefabContent(nodeData, prefabName, prefabUuid, includeChildren, includeComponents) {
        (0, log_1.debugLog)('开始创建引擎标准预制体内容...');
        const prefabData = [];
        let currentId = 0;
        // 1. 创建预制体资产对象 (index 0)
        const prefabAsset = {
            "__type__": "cc.Prefab",
            "_name": prefabName || "", // 确保预制体名称不为空
            "_objFlags": 0,
            "__editorExtras__": {},
            "_native": "",
            "data": {
                "__id__": 1
            },
            "optimizationPolicy": 0,
            "persistent": false
        };
        prefabData.push(prefabAsset);
        currentId++;
        // 2. 递归创建完整的节点树结构
        const context = {
            prefabData,
            currentId: currentId + 1, // 根节点占用索引1，子节点从索引2开始
            prefabAssetIndex: 0,
            nodeFileIds: new Map(), // 存储节点ID到fileId的映射
            nodeUuidToIndex: new Map(), // 存储节点UUID到索引的映射
            componentUuidToIndex: new Map() // 存储组件UUID到索引的映射
        };
        // 创建根节点和整个节点树 - 注意：根节点的父节点应该是null，不是预制体对象
        await this.createCompleteNodeTree(nodeData, null, 1, context, includeChildren, includeComponents, prefabName);
        (0, log_1.debugLog)(`预制体内容创建完成，总共 ${prefabData.length} 个对象`);
        (0, log_1.debugLog)('节点fileId映射:', Array.from(context.nodeFileIds.entries()));
        return prefabData;
    }
    /**
     * 递归创建完整的节点树，包括所有子节点和对应的PrefabInfo
     */
    async createCompleteNodeTree(nodeData, parentNodeIndex, nodeIndex, context, includeChildren, includeComponents, nodeName) {
        const { prefabData } = context;
        // 创建节点对象
        const node = this.createEngineStandardNode(nodeData, parentNodeIndex, nodeName);
        // 确保节点在指定的索引位置
        while (prefabData.length <= nodeIndex) {
            prefabData.push(null);
        }
        (0, log_1.debugLog)(`设置节点到索引 ${nodeIndex}: ${node._name}, _parent:`, node._parent, `_children count: ${node._children.length}`);
        prefabData[nodeIndex] = node;
        // 为当前节点生成fileId并记录UUID到索引的映射
        const nodeUuid = this.extractNodeUuid(nodeData);
        const fileId = nodeUuid || this.generateFileId();
        context.nodeFileIds.set(nodeIndex.toString(), fileId);
        // 记录节点UUID到索引的映射
        if (nodeUuid) {
            context.nodeUuidToIndex.set(nodeUuid, nodeIndex);
            (0, log_1.debugLog)(`记录节点UUID映射: ${nodeUuid} -> ${nodeIndex}`);
        }
        // 先处理子节点（保持与手动创建的索引顺序一致）
        const childrenToProcess = this.getChildrenToProcess(nodeData);
        if (includeChildren && childrenToProcess.length > 0) {
            (0, log_1.debugLog)(`处理节点 ${node._name} 的 ${childrenToProcess.length} 个子节点`);
            // 为每个子节点分配索引
            const childIndices = [];
            (0, log_1.debugLog)(`准备为 ${childrenToProcess.length} 个子节点分配索引，当前ID: ${context.currentId}`);
            for (let i = 0; i < childrenToProcess.length; i++) {
                (0, log_1.debugLog)(`处理第 ${i + 1} 个子节点，当前currentId: ${context.currentId}`);
                const childIndex = context.currentId++;
                childIndices.push(childIndex);
                node._children.push({ "__id__": childIndex });
                (0, log_1.debugLog)(`✅ 添加子节点引用到 ${node._name}: {__id__: ${childIndex}}`);
            }
            (0, log_1.debugLog)(`✅ 节点 ${node._name} 最终的子节点数组:`, node._children);
            // 递归创建子节点
            for (let i = 0; i < childrenToProcess.length; i++) {
                const childData = childrenToProcess[i];
                const childIndex = childIndices[i];
                await this.createCompleteNodeTree(childData, nodeIndex, childIndex, context, includeChildren, includeComponents, childData.name || `Child${i + 1}`);
            }
        }
        // 然后处理组件
        if (includeComponents && nodeData.components && Array.isArray(nodeData.components)) {
            (0, log_1.debugLog)(`处理节点 ${node._name} 的 ${nodeData.components.length} 个组件`);
            const componentIndices = [];
            for (const component of nodeData.components) {
                const componentIndex = context.currentId++;
                componentIndices.push(componentIndex);
                node._components.push({ "__id__": componentIndex });
                // 记录组件UUID到索引的映射
                const componentUuid = component.uuid || (component.value && component.value.uuid);
                if (componentUuid) {
                    context.componentUuidToIndex.set(componentUuid, componentIndex);
                    (0, log_1.debugLog)(`记录组件UUID映射: ${componentUuid} -> ${componentIndex}`);
                }
                // 创建组件对象，传入context以处理引用
                const componentObj = this.createComponentObject(component, nodeIndex, context);
                prefabData[componentIndex] = componentObj;
                // 为组件创建 CompPrefabInfo
                const compPrefabInfoIndex = context.currentId++;
                prefabData[compPrefabInfoIndex] = {
                    "__type__": "cc.CompPrefabInfo",
                    "fileId": this.generateFileId()
                };
                // 如果组件对象有 __prefab 属性，设置引用
                if (componentObj && typeof componentObj === 'object') {
                    componentObj.__prefab = { "__id__": compPrefabInfoIndex };
                }
            }
            (0, log_1.debugLog)(`✅ 节点 ${node._name} 添加了 ${componentIndices.length} 个组件`);
        }
        // 为当前节点创建PrefabInfo
        const prefabInfoIndex = context.currentId++;
        node._prefab = { "__id__": prefabInfoIndex };
        const prefabInfo = {
            "__type__": "cc.PrefabInfo",
            "root": { "__id__": 1 },
            "asset": { "__id__": context.prefabAssetIndex },
            "fileId": fileId,
            "targetOverrides": null,
            "nestedPrefabInstanceRoots": null
        };
        // 根节点的特殊处理
        if (nodeIndex === 1) {
            // 根节点没有instance，但可能有targetOverrides
            prefabInfo.instance = null;
        }
        else {
            // 子节点通常有instance为null
            prefabInfo.instance = null;
        }
        prefabData[prefabInfoIndex] = prefabInfo;
        context.currentId = prefabInfoIndex + 1;
    }
    /**
     * 将UUID转换为Cocos Creator的压缩格式
     * 基于真实Cocos Creator编辑器的压缩算法实现
     * 前5个hex字符保持不变，剩余27个字符压缩成18个字符
     */
    uuidToCompressedId(uuid) {
        const BASE64_KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
        // 移除连字符并转为小写
        const cleanUuid = uuid.replace(/-/g, '').toLowerCase();
        // 确保UUID有效
        if (cleanUuid.length !== 32) {
            return uuid; // 如果不是有效的UUID，返回原始值
        }
        // Cocos Creator的压缩算法：前5个字符保持不变，剩余27个字符压缩成18个字符
        let result = cleanUuid.substring(0, 5);
        // 剩余27个字符需要压缩成18个字符
        const remainder = cleanUuid.substring(5);
        // 每3个hex字符压缩成2个字符
        for (let i = 0; i < remainder.length; i += 3) {
            const hex1 = remainder[i] || '0';
            const hex2 = remainder[i + 1] || '0';
            const hex3 = remainder[i + 2] || '0';
            // 将3个hex字符(12位)转换为2个base64字符
            const value = parseInt(hex1 + hex2 + hex3, 16);
            // 12位分成两个6位
            const high6 = (value >> 6) & 63;
            const low6 = value & 63;
            result += BASE64_KEYS[high6] + BASE64_KEYS[low6];
        }
        return result;
    }
    /**
     * 创建组件对象
     */
    createComponentObject(componentData, nodeIndex, context) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6;
        let componentType = componentData.type || componentData.__type__ || 'cc.Component';
        const enabled = componentData.enabled !== undefined ? componentData.enabled : true;
        // debugLog(`创建组件对象 - 原始类型: ${componentType}`);
        // debugLog('组件完整数据:', JSON.stringify(componentData, null, 2));
        // 处理脚本组件 - MCP接口已经返回正确的压缩UUID格式
        if (componentType && !componentType.startsWith('cc.')) {
            (0, log_1.debugLog)(`使用脚本组件压缩UUID类型: ${componentType}`);
        }
        // 基础组件结构
        const component = {
            "__type__": componentType,
            "_name": "",
            "_objFlags": 0,
            "__editorExtras__": {},
            "node": { "__id__": nodeIndex },
            "_enabled": enabled
        };
        // 提前设置 __prefab 属性占位符，后续会被正确设置
        component.__prefab = null;
        // 根据组件类型添加特定属性
        if (componentType === 'cc.UITransform') {
            const contentSize = ((_b = (_a = componentData.properties) === null || _a === void 0 ? void 0 : _a.contentSize) === null || _b === void 0 ? void 0 : _b.value) || { width: 100, height: 100 };
            const anchorPoint = ((_d = (_c = componentData.properties) === null || _c === void 0 ? void 0 : _c.anchorPoint) === null || _d === void 0 ? void 0 : _d.value) || { x: 0.5, y: 0.5 };
            component._contentSize = {
                "__type__": "cc.Size",
                "width": contentSize.width,
                "height": contentSize.height
            };
            component._anchorPoint = {
                "__type__": "cc.Vec2",
                "x": anchorPoint.x,
                "y": anchorPoint.y
            };
        }
        else if (componentType === 'cc.Sprite') {
            // 处理Sprite组件的spriteFrame引用
            const spriteFrameProp = ((_e = componentData.properties) === null || _e === void 0 ? void 0 : _e._spriteFrame) || ((_f = componentData.properties) === null || _f === void 0 ? void 0 : _f.spriteFrame);
            if (spriteFrameProp) {
                component._spriteFrame = this.processComponentProperty(spriteFrameProp, context);
            }
            else {
                component._spriteFrame = null;
            }
            component._type = (_j = (_h = (_g = componentData.properties) === null || _g === void 0 ? void 0 : _g._type) === null || _h === void 0 ? void 0 : _h.value) !== null && _j !== void 0 ? _j : 0;
            component._fillType = (_m = (_l = (_k = componentData.properties) === null || _k === void 0 ? void 0 : _k._fillType) === null || _l === void 0 ? void 0 : _l.value) !== null && _m !== void 0 ? _m : 0;
            component._sizeMode = (_q = (_p = (_o = componentData.properties) === null || _o === void 0 ? void 0 : _o._sizeMode) === null || _p === void 0 ? void 0 : _p.value) !== null && _q !== void 0 ? _q : 1;
            component._fillCenter = { "__type__": "cc.Vec2", "x": 0, "y": 0 };
            component._fillStart = (_t = (_s = (_r = componentData.properties) === null || _r === void 0 ? void 0 : _r._fillStart) === null || _s === void 0 ? void 0 : _s.value) !== null && _t !== void 0 ? _t : 0;
            component._fillRange = (_w = (_v = (_u = componentData.properties) === null || _u === void 0 ? void 0 : _u._fillRange) === null || _v === void 0 ? void 0 : _v.value) !== null && _w !== void 0 ? _w : 0;
            component._isTrimmedMode = (_z = (_y = (_x = componentData.properties) === null || _x === void 0 ? void 0 : _x._isTrimmedMode) === null || _y === void 0 ? void 0 : _y.value) !== null && _z !== void 0 ? _z : true;
            component._useGrayscale = (_2 = (_1 = (_0 = componentData.properties) === null || _0 === void 0 ? void 0 : _0._useGrayscale) === null || _1 === void 0 ? void 0 : _1.value) !== null && _2 !== void 0 ? _2 : false;
            // 调试：打印Sprite组件的所有属性（已注释）
            // debugLog('Sprite组件属性:', JSON.stringify(componentData.properties, null, 2));
            component._atlas = null;
            component._id = "";
        }
        else if (componentType === 'cc.Button') {
            component._interactable = true;
            component._transition = 3;
            component._normalColor = { "__type__": "cc.Color", "r": 255, "g": 255, "b": 255, "a": 255 };
            component._hoverColor = { "__type__": "cc.Color", "r": 211, "g": 211, "b": 211, "a": 255 };
            component._pressedColor = { "__type__": "cc.Color", "r": 255, "g": 255, "b": 255, "a": 255 };
            component._disabledColor = { "__type__": "cc.Color", "r": 124, "g": 124, "b": 124, "a": 255 };
            component._normalSprite = null;
            component._hoverSprite = null;
            component._pressedSprite = null;
            component._disabledSprite = null;
            component._duration = 0.1;
            component._zoomScale = 1.2;
            // 处理Button的target引用
            const targetProp = ((_3 = componentData.properties) === null || _3 === void 0 ? void 0 : _3._target) || ((_4 = componentData.properties) === null || _4 === void 0 ? void 0 : _4.target);
            if (targetProp) {
                component._target = this.processComponentProperty(targetProp, context);
            }
            else {
                component._target = { "__id__": nodeIndex }; // 默认指向自身节点
            }
            component._clickEvents = [];
            component._id = "";
        }
        else if (componentType === 'cc.Label') {
            component._string = ((_6 = (_5 = componentData.properties) === null || _5 === void 0 ? void 0 : _5._string) === null || _6 === void 0 ? void 0 : _6.value) || "Label";
            component._horizontalAlign = 1;
            component._verticalAlign = 1;
            component._actualFontSize = 20;
            component._fontSize = 20;
            component._fontFamily = "Arial";
            component._lineHeight = 25;
            component._overflow = 0;
            component._enableWrapText = true;
            component._font = null;
            component._isSystemFontUsed = true;
            component._spacingX = 0;
            component._isItalic = false;
            component._isBold = false;
            component._isUnderline = false;
            component._underlineHeight = 2;
            component._cacheMode = 0;
            component._id = "";
        }
        else if (componentData.properties) {
            // 处理所有组件的属性（包括内置组件和自定义脚本组件）
            for (const [key, value] of Object.entries(componentData.properties)) {
                if (key === 'node' || key === 'enabled' || key === '__type__' ||
                    key === 'uuid' || key === 'name' || key === '__scriptAsset' || key === '_objFlags') {
                    continue; // 跳过这些特殊属性，包括_objFlags
                }
                // 对于以下划线开头的属性，需要特殊处理
                if (key.startsWith('_')) {
                    // 确保属性名保持原样（包括下划线）
                    const propValue = this.processComponentProperty(value, context);
                    if (propValue !== undefined) {
                        component[key] = propValue;
                    }
                }
                else {
                    // 非下划线开头的属性正常处理
                    const propValue = this.processComponentProperty(value, context);
                    if (propValue !== undefined) {
                        component[key] = propValue;
                    }
                }
            }
        }
        // 确保 _id 在最后位置
        const _id = component._id || "";
        delete component._id;
        component._id = _id;
        return component;
    }
    /**
     * 处理组件属性值，确保格式与手动创建的预制体一致
     */
    processComponentProperty(propData, context) {
        var _a, _b;
        if (!propData || typeof propData !== 'object') {
            return propData;
        }
        const value = propData.value;
        const type = propData.type;
        // 处理null值
        if (value === null || value === undefined) {
            return null;
        }
        // 处理空UUID对象，转换为null
        if (value && typeof value === 'object' && value.uuid === '') {
            return null;
        }
        // 处理节点引用
        if (type === 'cc.Node' && (value === null || value === void 0 ? void 0 : value.uuid)) {
            // 在预制体中，节点引用需要转换为 __id__ 形式
            if ((context === null || context === void 0 ? void 0 : context.nodeUuidToIndex) && context.nodeUuidToIndex.has(value.uuid)) {
                // 内部引用：转换为__id__格式
                return {
                    "__id__": context.nodeUuidToIndex.get(value.uuid)
                };
            }
            // 外部引用：设置为null，因为外部节点不属于预制体结构
            console.warn(`Node reference UUID ${value.uuid} not found in prefab context, setting to null (external reference)`);
            return null;
        }
        // 处理资源引用（预制体、纹理、精灵帧等）
        if ((value === null || value === void 0 ? void 0 : value.uuid) && (type === 'cc.Prefab' ||
            type === 'cc.Texture2D' ||
            type === 'cc.SpriteFrame' ||
            type === 'cc.Material' ||
            type === 'cc.AnimationClip' ||
            type === 'cc.AudioClip' ||
            type === 'cc.Font' ||
            type === 'cc.Asset')) {
            // 对于预制体引用，保持原始UUID格式
            const uuidToUse = type === 'cc.Prefab' ? value.uuid : this.uuidToCompressedId(value.uuid);
            return {
                "__uuid__": uuidToUse,
                "__expectedType__": type
            };
        }
        // 处理组件引用（包括具体的组件类型如cc.Label, cc.Button等）
        if ((value === null || value === void 0 ? void 0 : value.uuid) && (type === 'cc.Component' ||
            type === 'cc.Label' || type === 'cc.Button' || type === 'cc.Sprite' ||
            type === 'cc.UITransform' || type === 'cc.RigidBody2D' ||
            type === 'cc.BoxCollider2D' || type === 'cc.Animation' ||
            type === 'cc.AudioSource' || ((type === null || type === void 0 ? void 0 : type.startsWith('cc.')) && !type.includes('@')))) {
            // 在预制体中，组件引用也需要转换为 __id__ 形式
            if ((context === null || context === void 0 ? void 0 : context.componentUuidToIndex) && context.componentUuidToIndex.has(value.uuid)) {
                // 内部引用：转换为__id__格式
                (0, log_1.debugLog)(`Component reference ${type} UUID ${value.uuid} found in prefab context, converting to __id__`);
                return {
                    "__id__": context.componentUuidToIndex.get(value.uuid)
                };
            }
            // 外部引用：设置为null，因为外部组件不属于预制体结构
            console.warn(`Component reference ${type} UUID ${value.uuid} not found in prefab context, setting to null (external reference)`);
            return null;
        }
        // 处理复杂类型，添加__type__标记
        if (value && typeof value === 'object') {
            if (type === 'cc.Color') {
                return {
                    "__type__": "cc.Color",
                    "r": Math.min(255, Math.max(0, Number(value.r) || 0)),
                    "g": Math.min(255, Math.max(0, Number(value.g) || 0)),
                    "b": Math.min(255, Math.max(0, Number(value.b) || 0)),
                    "a": value.a !== undefined ? Math.min(255, Math.max(0, Number(value.a))) : 255
                };
            }
            else if (type === 'cc.Vec3') {
                return {
                    "__type__": "cc.Vec3",
                    "x": Number(value.x) || 0,
                    "y": Number(value.y) || 0,
                    "z": Number(value.z) || 0
                };
            }
            else if (type === 'cc.Vec2') {
                return {
                    "__type__": "cc.Vec2",
                    "x": Number(value.x) || 0,
                    "y": Number(value.y) || 0
                };
            }
            else if (type === 'cc.Size') {
                return {
                    "__type__": "cc.Size",
                    "width": Number(value.width) || 0,
                    "height": Number(value.height) || 0
                };
            }
            else if (type === 'cc.Quat') {
                return {
                    "__type__": "cc.Quat",
                    "x": Number(value.x) || 0,
                    "y": Number(value.y) || 0,
                    "z": Number(value.z) || 0,
                    "w": value.w !== undefined ? Number(value.w) : 1
                };
            }
        }
        // 处理数组类型
        if (Array.isArray(value)) {
            // 节点数组
            if (((_a = propData.elementTypeData) === null || _a === void 0 ? void 0 : _a.type) === 'cc.Node') {
                return value.map(item => {
                    var _a;
                    if ((item === null || item === void 0 ? void 0 : item.uuid) && ((_a = context === null || context === void 0 ? void 0 : context.nodeUuidToIndex) === null || _a === void 0 ? void 0 : _a.has(item.uuid))) {
                        return { "__id__": context.nodeUuidToIndex.get(item.uuid) };
                    }
                    return null;
                }).filter(item => item !== null);
            }
            // 资源数组
            if (((_b = propData.elementTypeData) === null || _b === void 0 ? void 0 : _b.type) && propData.elementTypeData.type.startsWith('cc.')) {
                return value.map(item => {
                    if (item === null || item === void 0 ? void 0 : item.uuid) {
                        return {
                            "__uuid__": this.uuidToCompressedId(item.uuid),
                            "__expectedType__": propData.elementTypeData.type
                        };
                    }
                    return null;
                }).filter(item => item !== null);
            }
            // 基础类型数组
            return value.map(item => (item === null || item === void 0 ? void 0 : item.value) !== undefined ? item.value : item);
        }
        // 其他复杂对象类型，保持原样但确保有__type__标记
        if (value && typeof value === 'object' && type && type.startsWith('cc.')) {
            return Object.assign({ "__type__": type }, value);
        }
        return value;
    }
    /**
     * 创建符合引擎标准的节点对象
     */
    createEngineStandardNode(nodeData, parentNodeIndex, nodeName) {
        // 调试：打印原始节点数据（已注释）
        // debugLog('原始节点数据:', JSON.stringify(nodeData, null, 2));
        var _a, _b, _c, _d, _e, _f, _g, _h;
        // 提取节点的基本属性
        const getValue = (prop) => {
            if ((prop === null || prop === void 0 ? void 0 : prop.value) !== undefined)
                return prop.value;
            if (prop !== undefined)
                return prop;
            return null;
        };
        const position = getValue(nodeData.position) || getValue((_a = nodeData.value) === null || _a === void 0 ? void 0 : _a.position) || { x: 0, y: 0, z: 0 };
        const rotation = getValue(nodeData.rotation) || getValue((_b = nodeData.value) === null || _b === void 0 ? void 0 : _b.rotation) || { x: 0, y: 0, z: 0, w: 1 };
        const scale = getValue(nodeData.scale) || getValue((_c = nodeData.value) === null || _c === void 0 ? void 0 : _c.scale) || { x: 1, y: 1, z: 1 };
        const active = (_f = (_d = getValue(nodeData.active)) !== null && _d !== void 0 ? _d : getValue((_e = nodeData.value) === null || _e === void 0 ? void 0 : _e.active)) !== null && _f !== void 0 ? _f : true;
        const name = nodeName || getValue(nodeData.name) || getValue((_g = nodeData.value) === null || _g === void 0 ? void 0 : _g.name) || 'Node';
        const layer = getValue(nodeData.layer) || getValue((_h = nodeData.value) === null || _h === void 0 ? void 0 : _h.layer) || 1073741824;
        // 调试输出
        (0, log_1.debugLog)(`创建节点: ${name}, parentNodeIndex: ${parentNodeIndex}`);
        const parentRef = parentNodeIndex !== null ? { "__id__": parentNodeIndex } : null;
        (0, log_1.debugLog)(`节点 ${name} 的父节点引用:`, parentRef);
        return {
            "__type__": "cc.Node",
            "_name": name,
            "_objFlags": 0,
            "__editorExtras__": {},
            "_parent": parentRef,
            "_children": [], // 子节点引用将在递归过程中动态添加
            "_active": active,
            "_components": [], // 组件引用将在处理组件时动态添加
            "_prefab": { "__id__": 0 }, // 临时值，后续会被正确设置
            "_lpos": {
                "__type__": "cc.Vec3",
                "x": position.x,
                "y": position.y,
                "z": position.z
            },
            "_lrot": {
                "__type__": "cc.Quat",
                "x": rotation.x,
                "y": rotation.y,
                "z": rotation.z,
                "w": rotation.w
            },
            "_lscale": {
                "__type__": "cc.Vec3",
                "x": scale.x,
                "y": scale.y,
                "z": scale.z
            },
            "_mobility": 0,
            "_layer": layer,
            "_euler": {
                "__type__": "cc.Vec3",
                "x": 0,
                "y": 0,
                "z": 0
            },
            "_id": ""
        };
    }
    /**
     * 从节点数据中提取UUID
     */
    extractNodeUuid(nodeData) {
        var _a, _b, _c;
        if (!nodeData)
            return null;
        // 尝试多种方式获取UUID
        const sources = [
            nodeData.uuid,
            (_a = nodeData.value) === null || _a === void 0 ? void 0 : _a.uuid,
            nodeData.__uuid__,
            (_b = nodeData.value) === null || _b === void 0 ? void 0 : _b.__uuid__,
            nodeData.id,
            (_c = nodeData.value) === null || _c === void 0 ? void 0 : _c.id
        ];
        for (const source of sources) {
            if (typeof source === 'string' && source.length > 0) {
                return source;
            }
        }
        return null;
    }
    /**
     * 创建最小化的节点对象，不包含任何组件以避免依赖问题
     */
    createMinimalNode(nodeData, nodeName) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        // 提取节点的基本属性
        const getValue = (prop) => {
            if ((prop === null || prop === void 0 ? void 0 : prop.value) !== undefined)
                return prop.value;
            if (prop !== undefined)
                return prop;
            return null;
        };
        const position = getValue(nodeData.position) || getValue((_a = nodeData.value) === null || _a === void 0 ? void 0 : _a.position) || { x: 0, y: 0, z: 0 };
        const rotation = getValue(nodeData.rotation) || getValue((_b = nodeData.value) === null || _b === void 0 ? void 0 : _b.rotation) || { x: 0, y: 0, z: 0, w: 1 };
        const scale = getValue(nodeData.scale) || getValue((_c = nodeData.value) === null || _c === void 0 ? void 0 : _c.scale) || { x: 1, y: 1, z: 1 };
        const active = (_f = (_d = getValue(nodeData.active)) !== null && _d !== void 0 ? _d : getValue((_e = nodeData.value) === null || _e === void 0 ? void 0 : _e.active)) !== null && _f !== void 0 ? _f : true;
        const name = nodeName || getValue(nodeData.name) || getValue((_g = nodeData.value) === null || _g === void 0 ? void 0 : _g.name) || 'Node';
        const layer = getValue(nodeData.layer) || getValue((_h = nodeData.value) === null || _h === void 0 ? void 0 : _h.layer) || 33554432;
        return {
            "__type__": "cc.Node",
            "_name": name,
            "_objFlags": 0,
            "_parent": null,
            "_children": [],
            "_active": active,
            "_components": [], // 空的组件数组，避免组件依赖问题
            "_prefab": {
                "__id__": 2
            },
            "_lpos": {
                "__type__": "cc.Vec3",
                "x": position.x,
                "y": position.y,
                "z": position.z
            },
            "_lrot": {
                "__type__": "cc.Quat",
                "x": rotation.x,
                "y": rotation.y,
                "z": rotation.z,
                "w": rotation.w
            },
            "_lscale": {
                "__type__": "cc.Vec3",
                "x": scale.x,
                "y": scale.y,
                "z": scale.z
            },
            "_layer": layer,
            "_euler": {
                "__type__": "cc.Vec3",
                "x": 0,
                "y": 0,
                "z": 0
            },
            "_id": ""
        };
    }
    /**
     * 创建标准的 meta 文件内容
     */
    createStandardMetaContent(prefabName, prefabUuid) {
        return {
            "ver": "2.0.3",
            "importer": "prefab",
            "imported": true,
            "uuid": prefabUuid,
            "files": [
                ".json"
            ],
            "subMetas": {},
            "userData": {
                "syncNodeName": prefabName,
                "hasIcon": false
            }
        };
    }
    /**
     * 尝试将原始节点转换为预制体实例
     */
    async convertNodeToPrefabInstance(nodeUuid, prefabUuid, prefabPath) {
        return new Promise((resolve) => {
            // 这个功能需要深入的场景编辑器集成，暂时返回失败
            // 在实际的引擎中，这涉及到复杂的预制体实例化和节点替换逻辑
            (0, log_1.debugLog)('节点转换为预制体实例的功能需要更深入的引擎集成');
            resolve({
                success: false,
                error: '节点转换为预制体实例需要更深入的引擎集成支持'
            });
        });
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
    // 基于官方预制体格式的新实现方法
    async getNodeDataForPrefab(nodeUuid) {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'query-node', nodeUuid).then((nodeData) => {
                if (!nodeData) {
                    resolve({ success: false, error: '节点不存在' });
                    return;
                }
                resolve({ success: true, data: nodeData });
            }).catch((error) => {
                resolve({ success: false, error: error.message });
            });
        });
    }
    async createStandardPrefabData(nodeData, prefabName, prefabUuid) {
        // 基于官方Canvas.prefab格式创建预制体数据结构
        const prefabData = [];
        let currentId = 0;
        // 第一个元素：cc.Prefab 资源对象
        const prefabAsset = {
            "__type__": "cc.Prefab",
            "_name": prefabName,
            "_objFlags": 0,
            "__editorExtras__": {},
            "_native": "",
            "data": {
                "__id__": 1
            },
            "optimizationPolicy": 0,
            "persistent": false
        };
        prefabData.push(prefabAsset);
        currentId++;
        // 第二个元素：根节点
        const rootNode = await this.createNodeObject(nodeData, null, prefabData, currentId);
        prefabData.push(rootNode.node);
        currentId = rootNode.nextId;
        // 添加根节点的 PrefabInfo - 修复asset引用使用UUID
        const rootPrefabInfo = {
            "__type__": "cc.PrefabInfo",
            "root": {
                "__id__": 1
            },
            "asset": {
                "__uuid__": prefabUuid
            },
            "fileId": this.generateFileId(),
            "instance": null,
            "targetOverrides": [],
            "nestedPrefabInstanceRoots": []
        };
        prefabData.push(rootPrefabInfo);
        return prefabData;
    }
    async createNodeObject(nodeData, parentId, prefabData, currentId) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        const nodeId = currentId++;
        // 提取节点的基本属性 - 适配query-node-tree的数据格式
        const getValue = (prop) => {
            if ((prop === null || prop === void 0 ? void 0 : prop.value) !== undefined)
                return prop.value;
            if (prop !== undefined)
                return prop;
            return null;
        };
        const position = getValue(nodeData.position) || getValue((_a = nodeData.value) === null || _a === void 0 ? void 0 : _a.position) || { x: 0, y: 0, z: 0 };
        const rotation = getValue(nodeData.rotation) || getValue((_b = nodeData.value) === null || _b === void 0 ? void 0 : _b.rotation) || { x: 0, y: 0, z: 0, w: 1 };
        const scale = getValue(nodeData.scale) || getValue((_c = nodeData.value) === null || _c === void 0 ? void 0 : _c.scale) || { x: 1, y: 1, z: 1 };
        const active = (_f = (_d = getValue(nodeData.active)) !== null && _d !== void 0 ? _d : getValue((_e = nodeData.value) === null || _e === void 0 ? void 0 : _e.active)) !== null && _f !== void 0 ? _f : true;
        const name = getValue(nodeData.name) || getValue((_g = nodeData.value) === null || _g === void 0 ? void 0 : _g.name) || 'Node';
        const layer = getValue(nodeData.layer) || getValue((_h = nodeData.value) === null || _h === void 0 ? void 0 : _h.layer) || 33554432;
        const node = {
            "__type__": "cc.Node",
            "_name": name,
            "_objFlags": 0,
            "__editorExtras__": {},
            "_parent": parentId !== null ? { "__id__": parentId } : null,
            "_children": [],
            "_active": active,
            "_components": [],
            "_prefab": parentId === null ? {
                "__id__": currentId++
            } : null,
            "_lpos": {
                "__type__": "cc.Vec3",
                "x": position.x,
                "y": position.y,
                "z": position.z
            },
            "_lrot": {
                "__type__": "cc.Quat",
                "x": rotation.x,
                "y": rotation.y,
                "z": rotation.z,
                "w": rotation.w
            },
            "_lscale": {
                "__type__": "cc.Vec3",
                "x": scale.x,
                "y": scale.y,
                "z": scale.z
            },
            "_mobility": 0,
            "_layer": layer,
            "_euler": {
                "__type__": "cc.Vec3",
                "x": 0,
                "y": 0,
                "z": 0
            },
            "_id": ""
        };
        // 暂时跳过UITransform组件以避免_getDependComponent错误
        // 后续通过Engine API动态添加
        (0, log_1.debugLog)(`节点 ${name} 暂时跳过UITransform组件，避免引擎依赖错误`);
        // 处理其他组件（暂时跳过，专注于修复UITransform问题）
        const components = this.extractComponentsFromNode(nodeData);
        if (components.length > 0) {
            (0, log_1.debugLog)(`节点 ${name} 包含 ${components.length} 个其他组件，暂时跳过以专注于UITransform修复`);
        }
        // 处理子节点 - 使用query-node-tree获取的完整结构
        const childrenToProcess = this.getChildrenToProcess(nodeData);
        if (childrenToProcess.length > 0) {
            (0, log_1.debugLog)(`=== 处理子节点 ===`);
            (0, log_1.debugLog)(`节点 ${name} 包含 ${childrenToProcess.length} 个子节点`);
            for (let i = 0; i < childrenToProcess.length; i++) {
                const childData = childrenToProcess[i];
                const childName = childData.name || ((_j = childData.value) === null || _j === void 0 ? void 0 : _j.name) || '未知';
                (0, log_1.debugLog)(`处理第${i + 1}个子节点: ${childName}`);
                try {
                    const childId = currentId;
                    node._children.push({ "__id__": childId });
                    // 递归创建子节点
                    const childResult = await this.createNodeObject(childData, nodeId, prefabData, currentId);
                    prefabData.push(childResult.node);
                    currentId = childResult.nextId;
                    // 子节点不需要PrefabInfo，只有根节点需要
                    // 子节点的_prefab应该设置为null
                    childResult.node._prefab = null;
                    (0, log_1.debugLog)(`✅ 成功添加子节点: ${childName}`);
                }
                catch (error) {
                    console.error(`处理子节点 ${childName} 时出错:`, error);
                }
            }
        }
        return { node, nextId: currentId };
    }
    // 从节点数据中提取组件信息
    extractComponentsFromNode(nodeData) {
        var _a, _b;
        const components = [];
        // 从不同位置尝试获取组件数据
        const componentSources = [
            nodeData.__comps__,
            nodeData.components,
            (_a = nodeData.value) === null || _a === void 0 ? void 0 : _a.__comps__,
            (_b = nodeData.value) === null || _b === void 0 ? void 0 : _b.components
        ];
        for (const source of componentSources) {
            if (Array.isArray(source)) {
                components.push(...source.filter(comp => comp && (comp.__type__ || comp.type)));
                break; // 找到有效的组件数组就退出
            }
        }
        return components;
    }
    // 创建标准的组件对象
    createStandardComponentObject(componentData, nodeId, prefabInfoId) {
        const componentType = componentData.__type__ || componentData.type;
        if (!componentType) {
            console.warn('组件缺少类型信息:', componentData);
            return null;
        }
        // 基础组件结构 - 基于官方预制体格式
        const component = {
            "__type__": componentType,
            "_name": "",
            "_objFlags": 0,
            "node": {
                "__id__": nodeId
            },
            "_enabled": this.getComponentPropertyValue(componentData, 'enabled', true),
            "__prefab": {
                "__id__": prefabInfoId
            }
        };
        // 根据组件类型添加特定属性
        this.addComponentSpecificProperties(component, componentData, componentType);
        // 添加_id属性
        component._id = "";
        return component;
    }
    // 添加组件特定的属性
    addComponentSpecificProperties(component, componentData, componentType) {
        switch (componentType) {
            case 'cc.UITransform':
                this.addUITransformProperties(component, componentData);
                break;
            case 'cc.Sprite':
                this.addSpriteProperties(component, componentData);
                break;
            case 'cc.Label':
                this.addLabelProperties(component, componentData);
                break;
            case 'cc.Button':
                this.addButtonProperties(component, componentData);
                break;
            default:
                // 对于未知类型的组件，复制所有安全的属性
                this.addGenericProperties(component, componentData);
                break;
        }
    }
    // UITransform组件属性
    addUITransformProperties(component, componentData) {
        component._contentSize = this.createSizeObject(this.getComponentPropertyValue(componentData, 'contentSize', { width: 100, height: 100 }));
        component._anchorPoint = this.createVec2Object(this.getComponentPropertyValue(componentData, 'anchorPoint', { x: 0.5, y: 0.5 }));
    }
    // Sprite组件属性
    addSpriteProperties(component, componentData) {
        component._visFlags = 0;
        component._customMaterial = null;
        component._srcBlendFactor = 2;
        component._dstBlendFactor = 4;
        component._color = this.createColorObject(this.getComponentPropertyValue(componentData, 'color', { r: 255, g: 255, b: 255, a: 255 }));
        component._spriteFrame = this.getComponentPropertyValue(componentData, 'spriteFrame', null);
        component._type = this.getComponentPropertyValue(componentData, 'type', 0);
        component._fillType = 0;
        component._sizeMode = this.getComponentPropertyValue(componentData, 'sizeMode', 1);
        component._fillCenter = this.createVec2Object({ x: 0, y: 0 });
        component._fillStart = 0;
        component._fillRange = 0;
        component._isTrimmedMode = true;
        component._useGrayscale = false;
        component._atlas = null;
    }
    // Label组件属性
    addLabelProperties(component, componentData) {
        component._visFlags = 0;
        component._customMaterial = null;
        component._srcBlendFactor = 2;
        component._dstBlendFactor = 4;
        component._color = this.createColorObject(this.getComponentPropertyValue(componentData, 'color', { r: 0, g: 0, b: 0, a: 255 }));
        component._string = this.getComponentPropertyValue(componentData, 'string', 'Label');
        component._horizontalAlign = 1;
        component._verticalAlign = 1;
        component._actualFontSize = 20;
        component._fontSize = this.getComponentPropertyValue(componentData, 'fontSize', 20);
        component._fontFamily = 'Arial';
        component._lineHeight = 40;
        component._overflow = 1;
        component._enableWrapText = false;
        component._font = null;
        component._isSystemFontUsed = true;
        component._isItalic = false;
        component._isBold = false;
        component._isUnderline = false;
        component._underlineHeight = 2;
        component._cacheMode = 0;
    }
    // Button组件属性
    addButtonProperties(component, componentData) {
        component.clickEvents = [];
        component._interactable = true;
        component._transition = 2;
        component._normalColor = this.createColorObject({ r: 214, g: 214, b: 214, a: 255 });
        component._hoverColor = this.createColorObject({ r: 211, g: 211, b: 211, a: 255 });
        component._pressedColor = this.createColorObject({ r: 255, g: 255, b: 255, a: 255 });
        component._disabledColor = this.createColorObject({ r: 124, g: 124, b: 124, a: 255 });
        component._duration = 0.1;
        component._zoomScale = 1.2;
    }
    // 添加通用属性
    addGenericProperties(component, componentData) {
        // 只复制安全的、已知的属性
        const safeProperties = ['enabled', 'color', 'string', 'fontSize', 'spriteFrame', 'type', 'sizeMode'];
        for (const prop of safeProperties) {
            if (componentData.hasOwnProperty(prop)) {
                const value = this.getComponentPropertyValue(componentData, prop);
                if (value !== undefined) {
                    component[`_${prop}`] = value;
                }
            }
        }
    }
    // 创建Vec2对象
    createVec2Object(data) {
        return {
            "__type__": "cc.Vec2",
            "x": (data === null || data === void 0 ? void 0 : data.x) || 0,
            "y": (data === null || data === void 0 ? void 0 : data.y) || 0
        };
    }
    // 创建Vec3对象
    createVec3Object(data) {
        return {
            "__type__": "cc.Vec3",
            "x": (data === null || data === void 0 ? void 0 : data.x) || 0,
            "y": (data === null || data === void 0 ? void 0 : data.y) || 0,
            "z": (data === null || data === void 0 ? void 0 : data.z) || 0
        };
    }
    // 创建Size对象
    createSizeObject(data) {
        return {
            "__type__": "cc.Size",
            "width": (data === null || data === void 0 ? void 0 : data.width) || 100,
            "height": (data === null || data === void 0 ? void 0 : data.height) || 100
        };
    }
    // 创建Color对象
    createColorObject(data) {
        var _a, _b, _c, _d;
        return {
            "__type__": "cc.Color",
            "r": (_a = data === null || data === void 0 ? void 0 : data.r) !== null && _a !== void 0 ? _a : 255,
            "g": (_b = data === null || data === void 0 ? void 0 : data.g) !== null && _b !== void 0 ? _b : 255,
            "b": (_c = data === null || data === void 0 ? void 0 : data.b) !== null && _c !== void 0 ? _c : 255,
            "a": (_d = data === null || data === void 0 ? void 0 : data.a) !== null && _d !== void 0 ? _d : 255
        };
    }
    // 判断是否应该复制组件属性
    shouldCopyComponentProperty(key, value) {
        // 跳过内部属性和已处理的属性
        if (key.startsWith('__') || key === '_enabled' || key === 'node' || key === 'enabled') {
            return false;
        }
        // 跳过函数和undefined值
        if (typeof value === 'function' || value === undefined) {
            return false;
        }
        return true;
    }
    // 获取组件属性值 - 重命名以避免冲突
    getComponentPropertyValue(componentData, propertyName, defaultValue) {
        // 尝试直接获取属性
        if (componentData[propertyName] !== undefined) {
            return this.extractValue(componentData[propertyName]);
        }
        // 尝试从value属性中获取
        if (componentData.value && componentData.value[propertyName] !== undefined) {
            return this.extractValue(componentData.value[propertyName]);
        }
        // 尝试带下划线前缀的属性名
        const prefixedName = `_${propertyName}`;
        if (componentData[prefixedName] !== undefined) {
            return this.extractValue(componentData[prefixedName]);
        }
        return defaultValue;
    }
    // 提取属性值
    extractValue(data) {
        if (data === null || data === undefined) {
            return data;
        }
        // 如果有value属性，优先使用value
        if (typeof data === 'object' && data.hasOwnProperty('value')) {
            return data.value;
        }
        // 如果是引用对象，保持原样
        if (typeof data === 'object' && (data.__id__ !== undefined || data.__uuid__ !== undefined)) {
            return data;
        }
        return data;
    }
    createStandardMetaData(prefabName, prefabUuid) {
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
    async savePrefabWithMeta(prefabPath, prefabData, metaData) {
        try {
            const prefabContent = JSON.stringify(prefabData, null, 2);
            const metaContent = JSON.stringify(metaData, null, 2);
            // 确保路径以.prefab结尾
            const finalPrefabPath = prefabPath.endsWith('.prefab') ? prefabPath : `${prefabPath}.prefab`;
            const metaPath = `${finalPrefabPath}.meta`;
            // 使用asset-db API创建预制体文件
            await new Promise((resolve, reject) => {
                Editor.Message.request('asset-db', 'create-asset', finalPrefabPath, prefabContent).then(() => {
                    resolve(true);
                }).catch((error) => {
                    reject(error);
                });
            });
            // 创建meta文件
            await new Promise((resolve, reject) => {
                Editor.Message.request('asset-db', 'create-asset', metaPath, metaContent).then(() => {
                    resolve(true);
                }).catch((error) => {
                    reject(error);
                });
            });
            (0, log_1.debugLog)(`=== 预制体保存完成 ===`);
            (0, log_1.debugLog)(`预制体文件已保存: ${finalPrefabPath}`);
            (0, log_1.debugLog)(`Meta文件已保存: ${metaPath}`);
            (0, log_1.debugLog)(`预制体数组总长度: ${prefabData.length}`);
            (0, log_1.debugLog)(`预制体根节点索引: ${prefabData.length - 1}`);
            return { success: true };
        }
        catch (error) {
            console.error('保存预制体文件时出错:', error);
            return { success: false, error: error.message };
        }
    }
}
exports.PrefabTools = PrefabTools;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJlZmFiLXRvb2xzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL3Rvb2xzL3ByZWZhYi10b29scy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSxvQ0FBc0M7QUFDdEMsMENBQStEO0FBQy9ELHNEQUFtRTtBQUVuRSxNQUFNLG9CQUFvQixHQUFHLFVBQUMsQ0FBQyxNQUFNLENBQUM7SUFDbEMsQ0FBQyxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLEVBQUU7SUFDeEIsQ0FBQyxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLEVBQUU7SUFDeEIsQ0FBQyxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLEVBQUU7Q0FDM0IsQ0FBQyxDQUFDO0FBRUgsTUFBTSxhQUFhLEdBQUc7SUFDbEIsZUFBZSxFQUFFLFVBQUMsQ0FBQyxNQUFNLENBQUM7UUFDdEIsTUFBTSxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLENBQUMsUUFBUSxDQUFDLGtDQUFrQyxDQUFDO0tBQ3pGLENBQUM7SUFDRixXQUFXLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQztRQUNsQixVQUFVLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyxtQkFBbUIsQ0FBQztLQUN2RCxDQUFDO0lBQ0Ysa0JBQWtCLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQztRQUN6QixVQUFVLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyxtQkFBbUIsQ0FBQztRQUNwRCxVQUFVLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsRUFBRSxDQUFDLFFBQVEsQ0FBQyw2QkFBNkIsQ0FBQztRQUN6RSxRQUFRLEVBQUUsb0JBQW9CLENBQUMsUUFBUSxFQUFFLENBQUMsUUFBUSxDQUFDLGtCQUFrQixDQUFDO0tBQ3pFLENBQUM7SUFDRixhQUFhLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQztRQUNwQixRQUFRLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyxrQkFBa0IsQ0FBQztRQUNqRCxRQUFRLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyxxRUFBcUUsQ0FBQztRQUNwRyxVQUFVLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUM7S0FDakQsQ0FBQztJQUNGLGFBQWEsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDO1FBQ3BCLFVBQVUsRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLG1CQUFtQixDQUFDO1FBQ3BELFFBQVEsRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLHdCQUF3QixDQUFDO0tBQzFELENBQUM7SUFDRixhQUFhLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQztRQUNwQixRQUFRLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQywyQkFBMkIsQ0FBQztLQUM3RCxDQUFDO0lBQ0YsZUFBZSxFQUFFLFVBQUMsQ0FBQyxNQUFNLENBQUM7UUFDdEIsVUFBVSxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLENBQUMsbUJBQW1CLENBQUM7S0FDdkQsQ0FBQztJQUNGLGVBQWUsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDO1FBQ3RCLFVBQVUsRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLG1CQUFtQixDQUFDO0tBQ3ZELENBQUM7SUFDRixnQkFBZ0IsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDO1FBQ3ZCLGdCQUFnQixFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLENBQUMsb0JBQW9CLENBQUM7UUFDM0QsZ0JBQWdCLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyxvQkFBb0IsQ0FBQztRQUMzRCxhQUFhLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsRUFBRSxDQUFDLFFBQVEsQ0FBQyxpQkFBaUIsQ0FBQztLQUNuRSxDQUFDO0lBQ0YsbUJBQW1CLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQztRQUMxQixRQUFRLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQywyQkFBMkIsQ0FBQztRQUMxRCxTQUFTLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyxtQkFBbUIsQ0FBQztLQUN0RCxDQUFDO0lBQ0YsV0FBVyxFQUFFLFVBQUMsQ0FBQyxNQUFNLENBQUM7UUFDbEIsUUFBUSxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLENBQUMsd0NBQXdDLENBQUM7UUFDdkUsU0FBUyxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLENBQUMsdUNBQXVDLENBQUM7S0FDMUUsQ0FBQztJQUNGLGFBQWEsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDO1FBQ3BCLFFBQVEsRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLHFDQUFxQyxDQUFDO1FBQ3BFLFlBQVksRUFBRSxVQUFDLENBQUMsT0FBTyxFQUFFLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDLFFBQVEsQ0FBQyxnRUFBZ0UsQ0FBQztLQUN0SCxDQUFDO0lBQ0YsZUFBZSxFQUFFLFVBQUMsQ0FBQyxNQUFNLENBQUM7UUFDdEIsUUFBUSxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLENBQUMsMkJBQTJCLENBQUM7S0FDN0QsQ0FBQztDQUNJLENBQUM7QUFFWCxNQUFNLGNBQWMsR0FBK0M7SUFDL0QsZUFBZSxFQUFFLGdDQUFnQztJQUNqRCxXQUFXLEVBQUUsdUJBQXVCO0lBQ3BDLGtCQUFrQixFQUFFLG1DQUFtQztJQUN2RCxhQUFhLEVBQUUsOERBQThEO0lBQzdFLGFBQWEsRUFBRSxvRkFBb0Y7SUFDbkcsYUFBYSxFQUFFLG9DQUFvQztJQUNuRCxlQUFlLEVBQUUsaUNBQWlDO0lBQ2xELGVBQWUsRUFBRSwrQkFBK0I7SUFDaEQsZ0JBQWdCLEVBQUUsOEJBQThCO0lBQ2hELG1CQUFtQixFQUFFLCtEQUErRDtJQUNwRixXQUFXLEVBQUUsdUVBQXVFO0lBQ3BGLGFBQWEsRUFBRSxtR0FBbUc7SUFDbEgsZUFBZSxFQUFFLGlGQUFpRjtDQUNyRyxDQUFDO0FBRUYsTUFBYSxXQUFXO0lBQ3BCLFFBQVE7UUFDSixPQUFRLE1BQU0sQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUF1QyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDbEYsSUFBSTtZQUNKLFdBQVcsRUFBRSxjQUFjLENBQUMsSUFBSSxDQUFDO1lBQ2pDLFdBQVcsRUFBRSxJQUFBLHNCQUFhLEVBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxDQUFDO1NBQ2xELENBQUMsQ0FBQyxDQUFDO0lBQ1IsQ0FBQztJQUVELEtBQUssQ0FBQyxPQUFPLENBQUMsUUFBZ0IsRUFBRSxJQUFTO1FBQ3JDLE1BQU0sVUFBVSxHQUFHLFFBQXNDLENBQUM7UUFDMUQsTUFBTSxNQUFNLEdBQUcsYUFBYSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3pDLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNWLE1BQU0sSUFBSSxLQUFLLENBQUMsaUJBQWlCLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFDakQsQ0FBQztRQUNELE1BQU0sVUFBVSxHQUFHLElBQUEscUJBQVksRUFBQyxNQUFNLEVBQUUsSUFBSSxhQUFKLElBQUksY0FBSixJQUFJLEdBQUksRUFBRSxDQUFDLENBQUM7UUFDcEQsSUFBSSxDQUFDLFVBQVUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNqQixPQUFPLFVBQVUsQ0FBQyxRQUFRLENBQUM7UUFDL0IsQ0FBQztRQUNELE1BQU0sQ0FBQyxHQUFHLFVBQVUsQ0FBQyxJQUFXLENBQUM7UUFFakMsUUFBUSxVQUFVLEVBQUUsQ0FBQztZQUNqQixLQUFLLGlCQUFpQjtnQkFDbEIsT0FBTyxNQUFNLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQzlDLEtBQUssYUFBYTtnQkFDZCxPQUFPLE1BQU0sSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUM7WUFDL0MsS0FBSyxvQkFBb0I7Z0JBQ3JCLE9BQU8sTUFBTSxJQUFJLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDM0MsS0FBSyxlQUFlO2dCQUNoQixPQUFPLE1BQU0sSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN0QyxLQUFLLGVBQWU7Z0JBQ2hCLE9BQU8sTUFBTSxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQzdELEtBQUssZUFBZTtnQkFDaEIsT0FBTyxNQUFNLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQy9DLEtBQUssaUJBQWlCO2dCQUNsQixPQUFPLE1BQU0sSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUM7WUFDbEQsS0FBSyxpQkFBaUI7Z0JBQ2xCLE9BQU8sTUFBTSxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUNuRCxLQUFLLGtCQUFrQjtnQkFDbkIsT0FBTyxNQUFNLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDekMsS0FBSyxxQkFBcUI7Z0JBQ3RCLE9BQU8sTUFBTSxJQUFJLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDakUsS0FBSyxhQUFhO2dCQUNkLE9BQU8sTUFBTSxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQzFELEtBQUssZUFBZTtnQkFDaEIsT0FBTyxNQUFNLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUM7WUFDL0QsS0FBSyxpQkFBaUI7Z0JBQ2xCLE9BQU8sTUFBTSxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUNwRCxDQUFDO0lBQ0wsQ0FBQztJQUVPLEtBQUssQ0FBQyxhQUFhLENBQUMsU0FBaUIsYUFBYTtRQUN0RCxPQUFPLElBQUksT0FBTyxDQUFDLENBQUMsT0FBTyxFQUFFLEVBQUU7WUFDM0IsTUFBTSxPQUFPLEdBQUcsTUFBTSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO2dCQUNsQyxHQUFHLE1BQU0sYUFBYSxDQUFDLENBQUMsQ0FBQyxHQUFHLE1BQU0sY0FBYyxDQUFDO1lBRXJELE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLFVBQVUsRUFBRSxjQUFjLEVBQUU7Z0JBQy9DLE9BQU8sRUFBRSxPQUFPO2FBQ25CLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxPQUFjLEVBQUUsRUFBRTtnQkFDdkIsTUFBTSxPQUFPLEdBQWlCLE9BQU8sQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDO29CQUNoRCxJQUFJLEVBQUUsS0FBSyxDQUFDLElBQUk7b0JBQ2hCLElBQUksRUFBRSxLQUFLLENBQUMsR0FBRztvQkFDZixJQUFJLEVBQUUsS0FBSyxDQUFDLElBQUk7b0JBQ2hCLE1BQU0sRUFBRSxLQUFLLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLENBQUM7aUJBQzdELENBQUMsQ0FBQyxDQUFDO2dCQUNKLE9BQU8sQ0FBQyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxDQUFDLENBQUM7WUFDOUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBVSxFQUFFLEVBQUU7Z0JBQ3BCLE9BQU8sQ0FBQyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEdBQUcsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO1lBQ3BELENBQUMsQ0FBQyxDQUFDO1FBQ1AsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDO0lBRU8sS0FBSyxDQUFDLFVBQVUsQ0FBQyxVQUFrQjtRQUN2Qyx5RUFBeUU7UUFDekUsb0VBQW9FO1FBQ3BFLHFFQUFxRTtRQUNyRSxxRUFBcUU7UUFDckUsK0RBQStEO1FBQy9ELHNCQUFzQjtRQUN0QixPQUFPLElBQUksT0FBTyxDQUFDLENBQUMsT0FBTyxFQUFFLEVBQUU7WUFDM0IsTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsVUFBVSxFQUFFLGtCQUFrQixFQUFFLFVBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLFNBQWMsRUFBRSxFQUFFO2dCQUN2RixJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7b0JBQ2IsT0FBTyxDQUFDLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUscUJBQXFCLFVBQVUsRUFBRSxFQUFFLENBQUMsQ0FBQztvQkFDdEUsT0FBTztnQkFDWCxDQUFDO2dCQUNELE9BQU8sQ0FBQztvQkFDSixPQUFPLEVBQUUsSUFBSTtvQkFDYixJQUFJLEVBQUU7d0JBQ0YsSUFBSSxFQUFFLFNBQVMsQ0FBQyxJQUFJO3dCQUNwQixJQUFJLEVBQUUsU0FBUyxDQUFDLElBQUk7d0JBQ3BCLEdBQUcsRUFBRSxTQUFTLENBQUMsR0FBRzt3QkFDbEIsSUFBSSxFQUFFLFNBQVMsQ0FBQyxJQUFJO3dCQUNwQixNQUFNLEVBQUUsU0FBUyxDQUFDLE1BQU07d0JBQ3hCLE9BQU8sRUFBRSx1RUFBdUU7cUJBQ25GO2lCQUNKLENBQUMsQ0FBQztZQUNQLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQVUsRUFBRSxFQUFFO2dCQUNwQixPQUFPLENBQUMsRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxHQUFHLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQztZQUNwRCxDQUFDLENBQUMsQ0FBQztRQUNQLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztJQUVPLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxJQUFTO1FBQ3JDLE9BQU8sSUFBSSxPQUFPLENBQUMsS0FBSyxFQUFFLE9BQU8sRUFBRSxFQUFFO1lBQ2pDLElBQUksQ0FBQztnQkFDRCxZQUFZO2dCQUNaLE1BQU0sU0FBUyxHQUFHLE1BQU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsVUFBVSxFQUFFLGtCQUFrQixFQUFFLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztnQkFDaEcsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO29CQUNiLE1BQU0sSUFBSSxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUM7Z0JBQzlCLENBQUM7Z0JBRUQsa0NBQWtDO2dCQUNsQyxNQUFNLGlCQUFpQixHQUFRO29CQUMzQixTQUFTLEVBQUUsU0FBUyxDQUFDLElBQUk7aUJBQzVCLENBQUM7Z0JBRUYsUUFBUTtnQkFDUixJQUFJLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztvQkFDbEIsaUJBQWlCLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUM7Z0JBQy9DLENBQUM7Z0JBRUQsU0FBUztnQkFDVCxJQUFJLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztvQkFDWixpQkFBaUIsQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQztnQkFDdkMsQ0FBQztxQkFBTSxJQUFJLFNBQVMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztvQkFDeEIsaUJBQWlCLENBQUMsSUFBSSxHQUFHLFNBQVMsQ0FBQyxJQUFJLENBQUM7Z0JBQzVDLENBQUM7Z0JBRUQsY0FBYztnQkFDZCxJQUFJLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztvQkFDaEIsaUJBQWlCLENBQUMsSUFBSSxHQUFHO3dCQUNyQixRQUFRLEVBQUU7NEJBQ04sS0FBSyxFQUFFLElBQUksQ0FBQyxRQUFRO3lCQUN2QjtxQkFDSixDQUFDO2dCQUNOLENBQUM7Z0JBRUQsT0FBTztnQkFDUCxNQUFNLFFBQVEsR0FBRyxNQUFNLE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBRSxhQUFhLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztnQkFDekYsTUFBTSxJQUFJLEdBQUcsS0FBSyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUM7Z0JBRTlELHlDQUF5QztnQkFDekMsSUFBQSxjQUFRLEVBQUMsWUFBWSxFQUFFO29CQUNuQixRQUFRLEVBQUUsSUFBSTtvQkFDZCxVQUFVLEVBQUUsU0FBUyxDQUFDLElBQUk7b0JBQzFCLFVBQVUsRUFBRSxJQUFJLENBQUMsVUFBVTtpQkFDOUIsQ0FBQyxDQUFDO2dCQUVILE9BQU8sQ0FBQztvQkFDSixPQUFPLEVBQUUsSUFBSTtvQkFDYixJQUFJLEVBQUU7d0JBQ0YsUUFBUSxFQUFFLElBQUk7d0JBQ2QsVUFBVSxFQUFFLElBQUksQ0FBQyxVQUFVO3dCQUMzQixVQUFVLEVBQUUsSUFBSSxDQUFDLFVBQVU7d0JBQzNCLFFBQVEsRUFBRSxJQUFJLENBQUMsUUFBUTt3QkFDdkIsT0FBTyxFQUFFLG1CQUFtQjtxQkFDL0I7aUJBQ0osQ0FBQyxDQUFDO1lBQ1AsQ0FBQztZQUFDLE9BQU8sR0FBUSxFQUFFLENBQUM7Z0JBQ2hCLE9BQU8sQ0FBQztvQkFDSixPQUFPLEVBQUUsS0FBSztvQkFDZCxLQUFLLEVBQUUsYUFBYSxHQUFHLENBQUMsT0FBTyxFQUFFO29CQUNqQyxXQUFXLEVBQUUsMEJBQTBCO2lCQUMxQyxDQUFDLENBQUM7WUFDUCxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDO0lBRU8sS0FBSyxDQUFDLHVCQUF1QixDQUFDLElBQVM7UUFDM0MsT0FBTyxJQUFJLE9BQU8sQ0FBQyxDQUFDLE9BQU8sRUFBRSxFQUFFO1lBQzNCLE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLFVBQVUsRUFBRSxrQkFBa0IsRUFBRSxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsU0FBYyxFQUFFLEVBQUU7Z0JBQzVGLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztvQkFDYixNQUFNLElBQUksS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO2dCQUM5QixDQUFDO2dCQUVELDhCQUE4QjtnQkFDOUIsTUFBTSxpQkFBaUIsR0FBUTtvQkFDM0IsU0FBUyxFQUFFLFNBQVMsQ0FBQyxJQUFJO2lCQUM1QixDQUFDO2dCQUVGLFFBQVE7Z0JBQ1IsSUFBSSxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7b0JBQ2xCLGlCQUFpQixDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDO2dCQUMvQyxDQUFDO2dCQUVELE9BQU8sTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLGFBQWEsRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO1lBQzdFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLFFBQTJCLEVBQUUsRUFBRTtnQkFDcEMsTUFBTSxJQUFJLEdBQUcsS0FBSyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUM7Z0JBRTlELGlCQUFpQjtnQkFDakIsSUFBSSxJQUFJLENBQUMsUUFBUSxJQUFJLElBQUksRUFBRSxDQUFDO29CQUN4QixNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsY0FBYyxFQUFFO3dCQUM1QyxJQUFJLEVBQUUsSUFBSTt3QkFDVixJQUFJLEVBQUUsVUFBVTt3QkFDaEIsSUFBSSxFQUFFLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxRQUFRLEVBQUU7cUJBQ2pDLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFO3dCQUNULE9BQU8sQ0FBQzs0QkFDSixPQUFPLEVBQUUsSUFBSTs0QkFDYixJQUFJLEVBQUU7Z0NBQ0YsUUFBUSxFQUFFLElBQUk7Z0NBQ2QsVUFBVSxFQUFFLElBQUksQ0FBQyxVQUFVO2dDQUMzQixRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVE7Z0NBQ3ZCLE9BQU8sRUFBRSxzQkFBc0I7NkJBQ2xDO3lCQUNKLENBQUMsQ0FBQztvQkFDUCxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFO3dCQUNWLE9BQU8sQ0FBQzs0QkFDSixPQUFPLEVBQUUsSUFBSTs0QkFDYixJQUFJLEVBQUU7Z0NBQ0YsUUFBUSxFQUFFLElBQUk7Z0NBQ2QsVUFBVSxFQUFFLElBQUksQ0FBQyxVQUFVO2dDQUMzQixPQUFPLEVBQUUsdUJBQXVCOzZCQUNuQzt5QkFDSixDQUFDLENBQUM7b0JBQ1AsQ0FBQyxDQUFDLENBQUM7Z0JBQ1AsQ0FBQztxQkFBTSxDQUFDO29CQUNKLE9BQU8sQ0FBQzt3QkFDSixPQUFPLEVBQUUsSUFBSTt3QkFDYixJQUFJLEVBQUU7NEJBQ0YsUUFBUSxFQUFFLElBQUk7NEJBQ2QsVUFBVSxFQUFFLElBQUksQ0FBQyxVQUFVOzRCQUMzQixPQUFPLEVBQUUsZ0JBQWdCO3lCQUM1QjtxQkFDSixDQUFDLENBQUM7Z0JBQ1AsQ0FBQztZQUNMLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQVUsRUFBRSxFQUFFO2dCQUNwQixPQUFPLENBQUM7b0JBQ0osT0FBTyxFQUFFLEtBQUs7b0JBQ2QsS0FBSyxFQUFFLGtCQUFrQixHQUFHLENBQUMsT0FBTyxFQUFFO2lCQUN6QyxDQUFDLENBQUM7WUFDUCxDQUFDLENBQUMsQ0FBQztRQUNQLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztJQUVPLEtBQUssQ0FBQyxZQUFZLENBQUMsSUFBUztRQUNoQyxPQUFPLElBQUksT0FBTyxDQUFDLEtBQUssRUFBRSxPQUFPLEVBQUUsRUFBRTs7WUFDakMsSUFBSSxDQUFDO2dCQUNELGlDQUFpQztnQkFDakMsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLFVBQVUsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDO2dCQUNuRCxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7b0JBQ2IsT0FBTyxDQUFDO3dCQUNKLE9BQU8sRUFBRSxLQUFLO3dCQUNkLEtBQUssRUFBRSxzQ0FBc0M7cUJBQ2hELENBQUMsQ0FBQztvQkFDSCxPQUFPO2dCQUNYLENBQUM7Z0JBRUQsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLFVBQVUsSUFBSSxXQUFXLENBQUM7Z0JBQ2xELE1BQU0sUUFBUSxHQUFHLFNBQVMsQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztvQkFDNUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxHQUFHLFNBQVMsSUFBSSxVQUFVLFNBQVMsQ0FBQztnQkFFcEQsOERBQThEO2dCQUM5RCw4REFBOEQ7Z0JBQzlELHNFQUFzRTtnQkFDdEUsZ0VBQWdFO2dCQUNoRSw2REFBNkQ7Z0JBQzdELDREQUE0RDtnQkFDNUQsMERBQTBEO2dCQUMxRCw4REFBOEQ7Z0JBQzlELElBQUEsY0FBUSxFQUFDLGlEQUFpRCxDQUFDLENBQUM7Z0JBQzVELE1BQU0sWUFBWSxHQUFHLE1BQU0sSUFBQSwyQ0FBNEIsRUFBQyxzQkFBc0IsRUFBRSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQztnQkFDM0csSUFBSSxDQUFDLFlBQVksQ0FBQyxPQUFPLEVBQUUsQ0FBQztvQkFDeEIsT0FBTyxDQUFDLFlBQVksQ0FBQyxDQUFDO29CQUN0QixPQUFPO2dCQUNYLENBQUM7Z0JBQ0QsSUFBSSxDQUFDO29CQUNELE1BQU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsVUFBVSxFQUFFLGVBQWUsRUFBRSxRQUFRLENBQUMsQ0FBQztnQkFDeEUsQ0FBQztnQkFBQyxPQUFPLFVBQWUsRUFBRSxDQUFDO29CQUN2QixJQUFBLGNBQVEsRUFBQywrREFBK0QsTUFBQSxVQUFVLGFBQVYsVUFBVSx1QkFBVixVQUFVLENBQUUsT0FBTyxtQ0FBSSxVQUFVLEVBQUUsQ0FBQyxDQUFDO2dCQUNqSCxDQUFDO2dCQUNELE9BQU8saUNBQ0EsWUFBWSxLQUNmLElBQUksa0NBQ0csQ0FBQyxNQUFBLFlBQVksQ0FBQyxJQUFJLG1DQUFJLEVBQUUsQ0FBQyxLQUM1QixVQUFVLEVBQ1YsVUFBVSxFQUFFLFFBQVEsRUFDcEIsTUFBTSxFQUFFLGNBQWMsT0FFNUIsQ0FBQztZQUNQLENBQUM7WUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO2dCQUNiLE9BQU8sQ0FBQztvQkFDSixPQUFPLEVBQUUsS0FBSztvQkFDZCxLQUFLLEVBQUUsZUFBZSxLQUFLLEVBQUU7aUJBQ2hDLENBQUMsQ0FBQztZQUNQLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7SUFFTyxLQUFLLENBQUMsV0FBVyxDQUFDLFFBQWdCO1FBQ3RDLE9BQU8sSUFBSSxPQUFPLENBQUMsS0FBSyxFQUFFLE9BQU8sRUFBRSxFQUFFO1lBQ2pDLElBQUksQ0FBQztnQkFDRCxhQUFhO2dCQUNiLE1BQU0sUUFBUSxHQUFHLE1BQU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLFlBQVksRUFBRSxRQUFRLENBQUMsQ0FBQztnQkFDL0UsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO29CQUNaLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztvQkFDZCxPQUFPO2dCQUNYLENBQUM7Z0JBRUQsSUFBQSxjQUFRLEVBQUMsUUFBUSxRQUFRLFVBQVUsQ0FBQyxDQUFDO2dCQUVyQyxnQ0FBZ0M7Z0JBQ2hDLE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBSSxDQUFDLG1CQUFtQixDQUFDLFFBQVEsQ0FBQyxDQUFDO2dCQUMxRCxJQUFJLFFBQVEsRUFBRSxDQUFDO29CQUNYLElBQUEsY0FBUSxFQUFDLFFBQVEsUUFBUSxXQUFXLENBQUMsQ0FBQztvQkFDdEMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDO2dCQUN0QixDQUFDO3FCQUFNLENBQUM7b0JBQ0osSUFBQSxjQUFRLEVBQUMsVUFBVSxDQUFDLENBQUM7b0JBQ3JCLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQztnQkFDdEIsQ0FBQztZQUNMLENBQUM7WUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO2dCQUNiLE9BQU8sQ0FBQyxJQUFJLENBQUMsWUFBWSxRQUFRLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQztnQkFDN0MsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ2xCLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7SUFFRCxrQ0FBa0M7SUFDMUIsS0FBSyxDQUFDLG1CQUFtQixDQUFDLFFBQWdCO1FBQzlDLElBQUksQ0FBQztZQUNELFVBQVU7WUFDVixNQUFNLElBQUksR0FBRyxNQUFNLE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO1lBQ3RFLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDUixPQUFPLElBQUksQ0FBQztZQUNoQixDQUFDO1lBRUQsYUFBYTtZQUNiLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1lBQ3ZELElBQUksVUFBVSxFQUFFLENBQUM7Z0JBQ2IsSUFBQSxjQUFRLEVBQUMsYUFBYSxRQUFRLFdBQVcsVUFBVSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBRWpHLHNCQUFzQjtnQkFDdEIsTUFBTSxZQUFZLEdBQUcsTUFBTSxJQUFJLENBQUMsNEJBQTRCLENBQUMsVUFBVSxDQUFDLENBQUM7Z0JBQ3pFLE9BQU8sWUFBWSxDQUFDO1lBQ3hCLENBQUM7WUFFRCxPQUFPLElBQUksQ0FBQztRQUNoQixDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNiLE9BQU8sQ0FBQyxJQUFJLENBQUMsYUFBYSxRQUFRLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUM5QyxPQUFPLElBQUksQ0FBQztRQUNoQixDQUFDO0lBQ0wsQ0FBQztJQUVELHFCQUFxQjtJQUNiLGNBQWMsQ0FBQyxJQUFTLEVBQUUsVUFBa0I7O1FBQ2hELElBQUksQ0FBQyxJQUFJO1lBQUUsT0FBTyxJQUFJLENBQUM7UUFFdkIsU0FBUztRQUNULElBQUksSUFBSSxDQUFDLElBQUksS0FBSyxVQUFVLElBQUksQ0FBQSxNQUFBLElBQUksQ0FBQyxLQUFLLDBDQUFFLElBQUksTUFBSyxVQUFVLEVBQUUsQ0FBQztZQUM5RCxPQUFPLElBQUksQ0FBQztRQUNoQixDQUFDO1FBRUQsVUFBVTtRQUNWLElBQUksSUFBSSxDQUFDLFFBQVEsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO1lBQ2hELEtBQUssTUFBTSxLQUFLLElBQUksSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO2dCQUNoQyxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLEtBQUssRUFBRSxVQUFVLENBQUMsQ0FBQztnQkFDckQsSUFBSSxLQUFLLEVBQUUsQ0FBQztvQkFDUixPQUFPLEtBQUssQ0FBQztnQkFDakIsQ0FBQztZQUNMLENBQUM7UUFDTCxDQUFDO1FBRUQsT0FBTyxJQUFJLENBQUM7SUFDaEIsQ0FBQztJQUVEOztPQUVHO0lBQ0ssS0FBSyxDQUFDLDRCQUE0QixDQUFDLElBQVM7O1FBQ2hELElBQUksQ0FBQyxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDdEIsT0FBTyxJQUFJLENBQUM7UUFDaEIsQ0FBQztRQUVELElBQUksQ0FBQztZQUNELG1CQUFtQjtZQUNuQixNQUFNLFFBQVEsR0FBRyxNQUFNLEtBQUssQ0FBQywyQkFBMkIsRUFBRTtnQkFDdEQsTUFBTSxFQUFFLE1BQU07Z0JBQ2QsT0FBTyxFQUFFLEVBQUUsY0FBYyxFQUFFLGtCQUFrQixFQUFFO2dCQUMvQyxJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQztvQkFDakIsU0FBUyxFQUFFLEtBQUs7b0JBQ2hCLFFBQVEsRUFBRSxZQUFZO29CQUN0QixRQUFRLEVBQUU7d0JBQ04sTUFBTSxFQUFFLDBCQUEwQjt3QkFDbEMsV0FBVyxFQUFFOzRCQUNULFVBQVUsRUFBRSxJQUFJLENBQUMsSUFBSTt5QkFDeEI7cUJBQ0o7b0JBQ0QsSUFBSSxFQUFFLElBQUksQ0FBQyxHQUFHLEVBQUU7aUJBQ25CLENBQUM7YUFDTCxDQUFDLENBQUM7WUFFSCxNQUFNLFNBQVMsR0FBRyxNQUFNLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUN4QyxJQUFJLE1BQUEsTUFBQSxNQUFBLFNBQVMsQ0FBQyxNQUFNLDBDQUFFLE9BQU8sMENBQUcsQ0FBQyxDQUFDLDBDQUFFLElBQUksRUFBRSxDQUFDO2dCQUN2QyxNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNuRSxJQUFJLGFBQWEsQ0FBQyxPQUFPLElBQUksYUFBYSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztvQkFDekQsdUJBQXVCO29CQUN2QixJQUFJLENBQUMsVUFBVSxHQUFHLGFBQWEsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDO29CQUNoRCxJQUFBLGNBQVEsRUFBQyxNQUFNLElBQUksQ0FBQyxJQUFJLFFBQVEsYUFBYSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsTUFBTSxrQkFBa0IsQ0FBQyxDQUFDO2dCQUM1RixDQUFDO1lBQ0wsQ0FBQztRQUNMLENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2IsT0FBTyxDQUFDLElBQUksQ0FBQyxRQUFRLElBQUksQ0FBQyxJQUFJLGNBQWMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN6RCxDQUFDO1FBRUQsVUFBVTtRQUNWLElBQUksSUFBSSxDQUFDLFFBQVEsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO1lBQ2hELEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO2dCQUM1QyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxHQUFHLE1BQU0sSUFBSSxDQUFDLDRCQUE0QixDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNqRixDQUFDO1FBQ0wsQ0FBQztRQUVELE9BQU8sSUFBSSxDQUFDO0lBQ2hCLENBQUM7SUFFTyxLQUFLLENBQUMsa0JBQWtCLENBQUMsUUFBZ0I7UUFDN0MsT0FBTyxJQUFJLE9BQU8sQ0FBQyxDQUFDLE9BQU8sRUFBRSxFQUFFO1lBQzNCLFlBQVk7WUFDWixNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsWUFBWSxFQUFFLFFBQVEsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLFFBQWEsRUFBRSxFQUFFO2dCQUMzRSxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7b0JBQ1osT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO29CQUNkLE9BQU87Z0JBQ1gsQ0FBQztnQkFFRCwyQkFBMkI7Z0JBQzNCLHdCQUF3QjtnQkFDeEIsTUFBTSxTQUFTLG1DQUNSLFFBQVEsS0FDWCxRQUFRLEVBQUUsRUFBRSxFQUNaLFVBQVUsRUFBRSxFQUFFLEdBQ2pCLENBQUM7Z0JBQ0YsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQ3ZCLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUU7Z0JBQ1YsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ2xCLENBQUMsQ0FBQyxDQUFDO1FBQ1AsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDO0lBRUQsYUFBYTtJQUNMLGVBQWUsQ0FBQyxRQUFhO1FBQ2pDLElBQUksQ0FBQyxRQUFRO1lBQUUsT0FBTyxLQUFLLENBQUM7UUFDNUIsSUFBSSxPQUFPLFFBQVEsS0FBSyxRQUFRO1lBQUUsT0FBTyxLQUFLLENBQUM7UUFFL0Msa0NBQWtDO1FBQ2xDLE9BQU8sUUFBUSxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUM7WUFDL0IsUUFBUSxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUM7WUFDL0IsUUFBUSxDQUFDLGNBQWMsQ0FBQyxVQUFVLENBQUM7WUFDbkMsQ0FBQyxRQUFRLENBQUMsS0FBSyxJQUFJLENBQ2YsUUFBUSxDQUFDLEtBQUssQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDO2dCQUNyQyxRQUFRLENBQUMsS0FBSyxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUM7Z0JBQ3JDLFFBQVEsQ0FBQyxLQUFLLENBQUMsY0FBYyxDQUFDLFVBQVUsQ0FBQyxDQUM1QyxDQUFDLENBQUM7SUFDZCxDQUFDO0lBRUQsaUJBQWlCO0lBQ1QsZ0JBQWdCLENBQUMsUUFBYTtRQUNsQyxJQUFJLENBQUMsUUFBUTtZQUFFLE9BQU8sSUFBSSxDQUFDO1FBRTNCLGFBQWE7UUFDYixJQUFJLE9BQU8sUUFBUSxLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQy9CLE9BQU8sUUFBUSxDQUFDO1FBQ3BCLENBQUM7UUFFRCxvQkFBb0I7UUFDcEIsSUFBSSxRQUFRLENBQUMsS0FBSyxJQUFJLE9BQU8sUUFBUSxDQUFDLEtBQUssS0FBSyxRQUFRLEVBQUUsQ0FBQztZQUN2RCxPQUFPLFFBQVEsQ0FBQyxLQUFLLENBQUM7UUFDMUIsQ0FBQztRQUVELG9CQUFvQjtRQUNwQixJQUFJLFFBQVEsQ0FBQyxLQUFLLElBQUksUUFBUSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUN4QyxPQUFPLFFBQVEsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDO1FBQy9CLENBQUM7UUFFRCxnQkFBZ0I7UUFDaEIsSUFBSSxRQUFRLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDaEIsT0FBTyxRQUFRLENBQUMsSUFBSSxDQUFDO1FBQ3pCLENBQUM7UUFFRCw2QkFBNkI7UUFDN0IsSUFBSSxRQUFRLENBQUMsTUFBTSxLQUFLLFNBQVMsRUFBRSxDQUFDO1lBQ2hDLElBQUEsY0FBUSxFQUFDLGVBQWUsUUFBUSxDQUFDLE1BQU0sZUFBZSxDQUFDLENBQUM7WUFDeEQsT0FBTyxJQUFJLENBQUMsQ0FBQyx3QkFBd0I7UUFDekMsQ0FBQztRQUVELE9BQU8sQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztRQUN2RCxPQUFPLElBQUksQ0FBQztJQUNoQixDQUFDO0lBRUQsZUFBZTtJQUNQLG9CQUFvQixDQUFDLFFBQWE7O1FBQ3RDLE1BQU0sUUFBUSxHQUFVLEVBQUUsQ0FBQztRQUUzQiw4Q0FBOEM7UUFDOUMsSUFBSSxRQUFRLENBQUMsUUFBUSxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7WUFDeEQsSUFBQSxjQUFRLEVBQUMsd0JBQXdCLFFBQVEsQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztZQUM3RCxLQUFLLE1BQU0sS0FBSyxJQUFJLFFBQVEsQ0FBQyxRQUFRLEVBQUUsQ0FBQztnQkFDcEMsb0NBQW9DO2dCQUNwQyxJQUFJLElBQUksQ0FBQyxlQUFlLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztvQkFDOUIsUUFBUSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztvQkFDckIsSUFBQSxjQUFRLEVBQUMsVUFBVSxLQUFLLENBQUMsSUFBSSxLQUFJLE1BQUEsS0FBSyxDQUFDLEtBQUssMENBQUUsSUFBSSxDQUFBLElBQUksSUFBSSxFQUFFLENBQUMsQ0FBQztnQkFDbEUsQ0FBQztxQkFBTSxDQUFDO29CQUNKLElBQUEsY0FBUSxFQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDekQsQ0FBQztZQUNMLENBQUM7UUFDTCxDQUFDO2FBQU0sQ0FBQztZQUNKLElBQUEsY0FBUSxFQUFDLHNCQUFzQixDQUFDLENBQUM7UUFDckMsQ0FBQztRQUVELE9BQU8sUUFBUSxDQUFDO0lBQ3BCLENBQUM7SUFFTyxZQUFZO1FBQ2hCLDJCQUEyQjtRQUMzQixNQUFNLEtBQUssR0FBRyxrQkFBa0IsQ0FBQztRQUNqQyxJQUFJLElBQUksR0FBRyxFQUFFLENBQUM7UUFDZCxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDMUIsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUM7Z0JBQzlDLElBQUksSUFBSSxHQUFHLENBQUM7WUFDaEIsQ0FBQztZQUNELElBQUksSUFBSSxLQUFLLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7UUFDNUQsQ0FBQztRQUNELE9BQU8sSUFBSSxDQUFDO0lBQ2hCLENBQUM7SUFFTyxnQkFBZ0IsQ0FBQyxRQUFhLEVBQUUsVUFBa0IsRUFBRSxVQUFrQjtRQUMxRSxlQUFlO1FBQ2YsTUFBTSxXQUFXLEdBQUc7WUFDaEIsVUFBVSxFQUFFLFdBQVc7WUFDdkIsT0FBTyxFQUFFLFVBQVU7WUFDbkIsV0FBVyxFQUFFLENBQUM7WUFDZCxrQkFBa0IsRUFBRSxFQUFFO1lBQ3RCLFNBQVMsRUFBRSxFQUFFO1lBQ2IsTUFBTSxFQUFFO2dCQUNKLFFBQVEsRUFBRSxDQUFDO2FBQ2Q7WUFDRCxvQkFBb0IsRUFBRSxDQUFDO1lBQ3ZCLFlBQVksRUFBRSxLQUFLO1NBQ3RCLENBQUM7UUFFRixtQkFBbUI7UUFDbkIsTUFBTSxpQkFBaUIsR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsUUFBUSxFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBRTFFLE9BQU8sQ0FBQyxXQUFXLEVBQUUsR0FBRyxpQkFBaUIsQ0FBQyxDQUFDO0lBQy9DLENBQUM7SUFFTyxvQkFBb0IsQ0FBQyxRQUFhLEVBQUUsVUFBa0I7UUFDMUQsaUJBQWlCO1FBQ2pCLE1BQU0sYUFBYSxHQUFVLEVBQUUsQ0FBQztRQUNoQyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7UUFFbEIsWUFBWTtRQUNaLE1BQU0sV0FBVyxHQUFHLENBQUMsSUFBUyxFQUFFLFdBQW1CLENBQUMsRUFBVSxFQUFFO1lBQzVELE1BQU0sTUFBTSxHQUFHLFNBQVMsRUFBRSxDQUFDO1lBRTNCLFNBQVM7WUFDVCxNQUFNLGFBQWEsR0FBRztnQkFDbEIsVUFBVSxFQUFFLFNBQVM7Z0JBQ3JCLE9BQU8sRUFBRSxJQUFJLENBQUMsSUFBSSxJQUFJLE1BQU07Z0JBQzVCLFdBQVcsRUFBRSxDQUFDO2dCQUNkLGtCQUFrQixFQUFFLEVBQUU7Z0JBQ3RCLFNBQVMsRUFBRSxRQUFRLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSTtnQkFDdkQsV0FBVyxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUU7Z0JBQ3RGLFNBQVMsRUFBRSxJQUFJLENBQUMsTUFBTSxLQUFLLEtBQUs7Z0JBQ2hDLGFBQWEsRUFBRSxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFO2dCQUM1RixTQUFTLEVBQUU7b0JBQ1AsUUFBUSxFQUFFLFNBQVMsRUFBRTtpQkFDeEI7Z0JBQ0QsT0FBTyxFQUFFO29CQUNMLFVBQVUsRUFBRSxTQUFTO29CQUNyQixHQUFHLEVBQUUsQ0FBQztvQkFDTixHQUFHLEVBQUUsQ0FBQztvQkFDTixHQUFHLEVBQUUsQ0FBQztpQkFDVDtnQkFDRCxPQUFPLEVBQUU7b0JBQ0wsVUFBVSxFQUFFLFNBQVM7b0JBQ3JCLEdBQUcsRUFBRSxDQUFDO29CQUNOLEdBQUcsRUFBRSxDQUFDO29CQUNOLEdBQUcsRUFBRSxDQUFDO29CQUNOLEdBQUcsRUFBRSxDQUFDO2lCQUNUO2dCQUNELFNBQVMsRUFBRTtvQkFDUCxVQUFVLEVBQUUsU0FBUztvQkFDckIsR0FBRyxFQUFFLENBQUM7b0JBQ04sR0FBRyxFQUFFLENBQUM7b0JBQ04sR0FBRyxFQUFFLENBQUM7aUJBQ1Q7Z0JBQ0QsV0FBVyxFQUFFLENBQUM7Z0JBQ2QsUUFBUSxFQUFFLFVBQVU7Z0JBQ3BCLFFBQVEsRUFBRTtvQkFDTixVQUFVLEVBQUUsU0FBUztvQkFDckIsR0FBRyxFQUFFLENBQUM7b0JBQ04sR0FBRyxFQUFFLENBQUM7b0JBQ04sR0FBRyxFQUFFLENBQUM7aUJBQ1Q7Z0JBQ0QsS0FBSyxFQUFFLEVBQUU7YUFDWixDQUFDO1lBRUYsYUFBYSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztZQUVsQyxPQUFPO1lBQ1AsSUFBSSxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7Z0JBQ2xCLElBQUksQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLENBQUMsU0FBYyxFQUFFLEVBQUU7b0JBQ3ZDLE1BQU0sV0FBVyxHQUFHLFNBQVMsRUFBRSxDQUFDO29CQUNoQyxNQUFNLG1CQUFtQixHQUFHLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxTQUFTLEVBQUUsV0FBVyxDQUFDLENBQUM7b0JBQ25GLGFBQWEsQ0FBQyxJQUFJLENBQUMsR0FBRyxtQkFBbUIsQ0FBQyxDQUFDO2dCQUMvQyxDQUFDLENBQUMsQ0FBQztZQUNQLENBQUM7WUFFRCxRQUFRO1lBQ1IsSUFBSSxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7Z0JBQ2hCLElBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsS0FBVSxFQUFFLEVBQUU7b0JBQ2pDLFdBQVcsQ0FBQyxLQUFLLEVBQUUsTUFBTSxDQUFDLENBQUM7Z0JBQy9CLENBQUMsQ0FBQyxDQUFDO1lBQ1AsQ0FBQztZQUVELE9BQU8sTUFBTSxDQUFDO1FBQ2xCLENBQUMsQ0FBQztRQUVGLFdBQVcsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUN0QixPQUFPLGFBQWEsQ0FBQztJQUN6QixDQUFDO0lBRU8seUJBQXlCLENBQUMsU0FBYyxFQUFFLFdBQW1CO1FBQ2pFLGlCQUFpQjtRQUNqQixNQUFNLGtCQUFrQixtQkFDcEIsVUFBVSxFQUFFLFNBQVMsQ0FBQyxJQUFJLElBQUksY0FBYyxFQUM1QyxPQUFPLEVBQUUsRUFBRSxFQUNYLFdBQVcsRUFBRSxDQUFDLEVBQ2Qsa0JBQWtCLEVBQUUsRUFBRSxFQUN0QixNQUFNLEVBQUU7Z0JBQ0osUUFBUSxFQUFFLFdBQVcsR0FBRyxDQUFDO2FBQzVCLEVBQ0QsVUFBVSxFQUFFLFNBQVMsQ0FBQyxPQUFPLEtBQUssS0FBSyxFQUN2QyxVQUFVLEVBQUU7Z0JBQ1IsUUFBUSxFQUFFLFdBQVcsR0FBRyxDQUFDO2FBQzVCLElBQ0UsU0FBUyxDQUFDLFVBQVUsQ0FDMUIsQ0FBQztRQUVGLGVBQWU7UUFDZixNQUFNLGNBQWMsR0FBRztZQUNuQixVQUFVLEVBQUUsbUJBQW1CO1lBQy9CLFFBQVEsRUFBRSxJQUFJLENBQUMsY0FBYyxFQUFFO1NBQ2xDLENBQUM7UUFFRixPQUFPLENBQUMsa0JBQWtCLEVBQUUsY0FBYyxDQUFDLENBQUM7SUFDaEQsQ0FBQztJQUVPLGNBQWM7UUFDbEIsZUFBZTtRQUNmLE1BQU0sS0FBSyxHQUFHLGtFQUFrRSxDQUFDO1FBQ2pGLElBQUksTUFBTSxHQUFHLEVBQUUsQ0FBQztRQUNoQixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDMUIsTUFBTSxJQUFJLEtBQUssQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztRQUM5RCxDQUFDO1FBQ0QsT0FBTyxNQUFNLENBQUM7SUFDbEIsQ0FBQztJQUVPLGNBQWMsQ0FBQyxVQUFrQixFQUFFLFVBQWtCO1FBQ3pELE9BQU87WUFDSCxLQUFLLEVBQUUsUUFBUTtZQUNmLFVBQVUsRUFBRSxRQUFRO1lBQ3BCLFVBQVUsRUFBRSxJQUFJO1lBQ2hCLE1BQU0sRUFBRSxVQUFVO1lBQ2xCLE9BQU8sRUFBRTtnQkFDTCxPQUFPO2FBQ1Y7WUFDRCxVQUFVLEVBQUUsRUFBRTtZQUNkLFVBQVUsRUFBRTtnQkFDUixjQUFjLEVBQUUsVUFBVTthQUM3QjtTQUNKLENBQUM7SUFDTixDQUFDO0lBRU8sS0FBSyxDQUFDLGVBQWUsQ0FBQyxVQUFrQixFQUFFLFVBQWlCLEVBQUUsUUFBYTtRQUM5RSxPQUFPLElBQUksT0FBTyxDQUFDLENBQUMsT0FBTyxFQUFFLEVBQUU7WUFDM0IsSUFBSSxDQUFDO2dCQUNELHNCQUFzQjtnQkFDdEIsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxVQUFVLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUMxRCxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLFFBQVEsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7Z0JBRXRELGVBQWU7Z0JBQ2YsSUFBSSxDQUFDLGFBQWEsQ0FBQyxVQUFVLEVBQUUsYUFBYSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRTtvQkFDcEQsWUFBWTtvQkFDWixNQUFNLFFBQVEsR0FBRyxHQUFHLFVBQVUsT0FBTyxDQUFDO29CQUN0QyxPQUFPLElBQUksQ0FBQyxhQUFhLENBQUMsUUFBUSxFQUFFLFdBQVcsQ0FBQyxDQUFDO2dCQUNyRCxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFO29CQUNULE9BQU8sQ0FBQyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO2dCQUMvQixDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxLQUFVLEVBQUUsRUFBRTtvQkFDcEIsT0FBTyxDQUFDLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxDQUFDLE9BQU8sSUFBSSxXQUFXLEVBQUUsQ0FBQyxDQUFDO2dCQUNyRSxDQUFDLENBQUMsQ0FBQztZQUNQLENBQUM7WUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO2dCQUNiLE9BQU8sQ0FBQyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLGNBQWMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQzlELENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7SUFFTyxLQUFLLENBQUMsYUFBYSxDQUFDLFFBQWdCLEVBQUUsT0FBZTtRQUN6RCxPQUFPLElBQUksT0FBTyxDQUFDLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxFQUFFO1lBQ25DLFdBQVc7WUFDWCxNQUFNLFdBQVcsR0FBRztnQkFDaEIsR0FBRyxFQUFFLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsVUFBVSxFQUFFLGNBQWMsRUFBRSxRQUFRLEVBQUUsT0FBTyxDQUFDO2dCQUMzRSxHQUFHLEVBQUUsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUUsWUFBWSxFQUFFLFFBQVEsRUFBRSxPQUFPLENBQUM7Z0JBQ3pFLEdBQUcsRUFBRSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLFVBQVUsRUFBRSxhQUFhLEVBQUUsUUFBUSxFQUFFLE9BQU8sQ0FBQzthQUM3RSxDQUFDO1lBRUYsTUFBTSxPQUFPLEdBQUcsQ0FBQyxLQUFhLEVBQUUsRUFBRTtnQkFDOUIsSUFBSSxLQUFLLElBQUksV0FBVyxDQUFDLE1BQU0sRUFBRSxDQUFDO29CQUM5QixNQUFNLENBQUMsSUFBSSxLQUFLLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQztvQkFDaEMsT0FBTztnQkFDWCxDQUFDO2dCQUVELFdBQVcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUU7b0JBQzNCLE9BQU8sRUFBRSxDQUFDO2dCQUNkLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUU7b0JBQ1YsT0FBTyxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQztnQkFDdkIsQ0FBQyxDQUFDLENBQUM7WUFDUCxDQUFDLENBQUM7WUFFRixPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDZixDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7SUFFTyxLQUFLLENBQUMsWUFBWSxDQUFDLFVBQWtCLEVBQUUsUUFBZ0I7O1FBQzNELGtFQUFrRTtRQUNsRSxpRUFBaUU7UUFDakUsOERBQThEO1FBQzlELE1BQU0sWUFBWSxHQUFHLE1BQU0sSUFBQSwyQ0FBNEIsRUFBQyxhQUFhLEVBQUUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO1FBQ25GLElBQUksWUFBWSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ3ZCLHVDQUNPLFlBQVksS0FDZixJQUFJLGtDQUFPLENBQUMsTUFBQSxZQUFZLENBQUMsSUFBSSxtQ0FBSSxFQUFFLENBQUMsS0FBRSxVQUFVLEVBQUUsUUFBUSxPQUM1RDtRQUNOLENBQUM7UUFDRCxPQUFPO1lBQ0gsT0FBTyxFQUFFLEtBQUs7WUFDZCxLQUFLLEVBQUUsTUFBQSxZQUFZLENBQUMsS0FBSyxtQ0FBSSxxQ0FBcUM7WUFDbEUsSUFBSSxFQUFFLEVBQUUsVUFBVSxFQUFFLFFBQVEsRUFBRTtTQUNqQyxDQUFDO0lBQ04sQ0FBQztJQUVPLEtBQUssQ0FBQyxVQUFVLENBQUMsUUFBZ0IsRUFBRSxTQUFpQjtRQUN4RCxPQUFPLElBQUEsMkNBQTRCLEVBQUMsWUFBWSxFQUFFLENBQUMsUUFBUSxFQUFFLFNBQVMsQ0FBQyxDQUFDLENBQUM7SUFDN0UsQ0FBQztJQUVPLEtBQUssQ0FBQyxZQUFZLENBQUMsUUFBZ0IsRUFBRSxZQUFxQjtRQUM5RCxPQUFPLElBQUEsMkNBQTRCLEVBQUMsY0FBYyxFQUFFLENBQUMsUUFBUSxFQUFFLFlBQVksQ0FBQyxDQUFDLENBQUM7SUFDbEYsQ0FBQztJQUVPLEtBQUssQ0FBQyxhQUFhLENBQUMsUUFBZ0I7UUFDeEMsT0FBTyxJQUFBLDJDQUE0QixFQUFDLGVBQWUsRUFBRSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7SUFDckUsQ0FBQztJQUVPLEtBQUssQ0FBQyxZQUFZLENBQUMsUUFBZ0I7UUFDdkMsd0VBQXdFO1FBQ3hFLHFFQUFxRTtRQUNyRSx1RUFBdUU7UUFDdkUsd0VBQXdFO1FBQ3hFLE9BQU8sSUFBSSxPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsRUFBRTtZQUMzQixNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFO2dCQUM1RSxPQUFPLENBQUM7b0JBQ0osT0FBTyxFQUFFLElBQUk7b0JBQ2IsT0FBTyxFQUFFLHVDQUF1QztpQkFDbkQsQ0FBQyxDQUFDO1lBQ1AsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBVSxFQUFFLEVBQUU7Z0JBQ3BCLE9BQU8sQ0FBQyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEdBQUcsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO1lBQ3BELENBQUMsQ0FBQyxDQUFDO1FBQ1AsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDO0lBRU8sS0FBSyxDQUFDLGFBQWEsQ0FBQyxVQUFrQjtRQUMxQyxPQUFPLElBQUksT0FBTyxDQUFDLENBQUMsT0FBTyxFQUFFLEVBQUU7WUFDM0IsTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsVUFBVSxFQUFFLGtCQUFrQixFQUFFLFVBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLFNBQWMsRUFBRSxFQUFFO2dCQUN2RixJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7b0JBQ2IsTUFBTSxJQUFJLEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO2dCQUN4QyxDQUFDO2dCQUVELE9BQU8sTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsVUFBVSxFQUFFLGtCQUFrQixFQUFFLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNsRixDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxRQUFhLEVBQUUsRUFBRTtnQkFDdEIsTUFBTSxJQUFJLEdBQWU7b0JBQ3JCLElBQUksRUFBRSxRQUFRLENBQUMsSUFBSTtvQkFDbkIsSUFBSSxFQUFFLFFBQVEsQ0FBQyxJQUFJO29CQUNuQixJQUFJLEVBQUUsVUFBVTtvQkFDaEIsTUFBTSxFQUFFLFVBQVUsQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLFVBQVUsQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLENBQUM7b0JBQzVELFVBQVUsRUFBRSxRQUFRLENBQUMsVUFBVTtvQkFDL0IsVUFBVSxFQUFFLFFBQVEsQ0FBQyxVQUFVO29CQUMvQixZQUFZLEVBQUUsUUFBUSxDQUFDLE9BQU8sSUFBSSxFQUFFO2lCQUN2QyxDQUFDO2dCQUNGLE9BQU8sQ0FBQyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7WUFDM0MsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBVSxFQUFFLEVBQUU7Z0JBQ3BCLE9BQU8sQ0FBQyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEdBQUcsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO1lBQ3BELENBQUMsQ0FBQyxDQUFDO1FBQ1AsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDO0lBRU8sS0FBSyxDQUFDLG9CQUFvQixDQUFDLElBQVM7O1FBQ3hDLG9CQUFvQjtRQUNwQixNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDO1FBQ25DLE1BQU0sVUFBVSxHQUFHLENBQUEsTUFBQSxVQUFVLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsRUFBRSwwQ0FBRSxPQUFPLENBQUMsU0FBUyxFQUFFLEVBQUUsQ0FBQyxLQUFJLFdBQVcsQ0FBQztRQUV0Rix3QkFBd0I7UUFDeEIsT0FBTyxNQUFNLElBQUksQ0FBQyxZQUFZLENBQUM7WUFDM0IsUUFBUSxFQUFFLElBQUksQ0FBQyxRQUFRO1lBQ3ZCLFFBQVEsRUFBRSxVQUFVO1lBQ3BCLFVBQVUsRUFBRSxVQUFVO1NBQ3pCLENBQUMsQ0FBQztJQUNQLENBQUM7SUFFTyxLQUFLLENBQUMsY0FBYyxDQUFDLFVBQWtCO1FBQzNDLE9BQU8sSUFBSSxPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsRUFBRTtZQUMzQixJQUFJLENBQUM7Z0JBQ0QsWUFBWTtnQkFDWixNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUUsa0JBQWtCLEVBQUUsVUFBVSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsU0FBYyxFQUFFLEVBQUU7b0JBQ3ZGLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQzt3QkFDYixPQUFPLENBQUM7NEJBQ0osT0FBTyxFQUFFLEtBQUs7NEJBQ2QsS0FBSyxFQUFFLFVBQVU7eUJBQ3BCLENBQUMsQ0FBQzt3QkFDSCxPQUFPO29CQUNYLENBQUM7b0JBRUQsVUFBVTtvQkFDVixNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUUsWUFBWSxFQUFFLFVBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLE9BQWUsRUFBRSxFQUFFO3dCQUNsRixJQUFJLENBQUM7NEJBQ0QsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQzs0QkFDdkMsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsVUFBVSxDQUFDLENBQUM7NEJBRS9ELE9BQU8sQ0FBQztnQ0FDSixPQUFPLEVBQUUsSUFBSTtnQ0FDYixJQUFJLEVBQUU7b0NBQ0YsT0FBTyxFQUFFLGdCQUFnQixDQUFDLE9BQU87b0NBQ2pDLE1BQU0sRUFBRSxnQkFBZ0IsQ0FBQyxNQUFNO29DQUMvQixTQUFTLEVBQUUsZ0JBQWdCLENBQUMsU0FBUztvQ0FDckMsY0FBYyxFQUFFLGdCQUFnQixDQUFDLGNBQWM7b0NBQy9DLE9BQU8sRUFBRSxnQkFBZ0IsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsV0FBVztpQ0FDOUQ7NkJBQ0osQ0FBQyxDQUFDO3dCQUNQLENBQUM7d0JBQUMsT0FBTyxVQUFVLEVBQUUsQ0FBQzs0QkFDbEIsT0FBTyxDQUFDO2dDQUNKLE9BQU8sRUFBRSxLQUFLO2dDQUNkLEtBQUssRUFBRSxvQkFBb0I7NkJBQzlCLENBQUMsQ0FBQzt3QkFDUCxDQUFDO29CQUNMLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLEtBQVUsRUFBRSxFQUFFO3dCQUNwQixPQUFPLENBQUM7NEJBQ0osT0FBTyxFQUFFLEtBQUs7NEJBQ2QsS0FBSyxFQUFFLGNBQWMsS0FBSyxDQUFDLE9BQU8sRUFBRTt5QkFDdkMsQ0FBQyxDQUFDO29CQUNQLENBQUMsQ0FBQyxDQUFDO2dCQUNQLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLEtBQVUsRUFBRSxFQUFFO29CQUNwQixPQUFPLENBQUM7d0JBQ0osT0FBTyxFQUFFLEtBQUs7d0JBQ2QsS0FBSyxFQUFFLGNBQWMsS0FBSyxDQUFDLE9BQU8sRUFBRTtxQkFDdkMsQ0FBQyxDQUFDO2dCQUNQLENBQUMsQ0FBQyxDQUFDO1lBQ1AsQ0FBQztZQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7Z0JBQ2IsT0FBTyxDQUFDO29CQUNKLE9BQU8sRUFBRSxLQUFLO29CQUNkLEtBQUssRUFBRSxlQUFlLEtBQUssRUFBRTtpQkFDaEMsQ0FBQyxDQUFDO1lBQ1AsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztJQUVPLG9CQUFvQixDQUFDLFVBQWU7UUFDeEMsTUFBTSxNQUFNLEdBQWEsRUFBRSxDQUFDO1FBQzVCLElBQUksU0FBUyxHQUFHLENBQUMsQ0FBQztRQUNsQixJQUFJLGNBQWMsR0FBRyxDQUFDLENBQUM7UUFFdkIsU0FBUztRQUNULElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUM7WUFDN0IsTUFBTSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQztZQUM1QixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLGNBQWMsRUFBRSxDQUFDO1FBQ2pFLENBQUM7UUFFRCxJQUFJLFVBQVUsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDMUIsTUFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUN2QixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLGNBQWMsRUFBRSxDQUFDO1FBQ2pFLENBQUM7UUFFRCxrQkFBa0I7UUFDbEIsTUFBTSxZQUFZLEdBQUcsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ25DLElBQUksQ0FBQyxZQUFZLElBQUksWUFBWSxDQUFDLFFBQVEsS0FBSyxXQUFXLEVBQUUsQ0FBQztZQUN6RCxNQUFNLENBQUMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLENBQUM7UUFDdkMsQ0FBQztRQUVELFVBQVU7UUFDVixVQUFVLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBUyxFQUFFLEtBQWEsRUFBRSxFQUFFO1lBQzVDLElBQUksSUFBSSxDQUFDLFFBQVEsS0FBSyxTQUFTLEVBQUUsQ0FBQztnQkFDOUIsU0FBUyxFQUFFLENBQUM7WUFDaEIsQ0FBQztpQkFBTSxJQUFJLElBQUksQ0FBQyxRQUFRLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztnQkFDeEQsY0FBYyxFQUFFLENBQUM7WUFDckIsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO1FBRUgsVUFBVTtRQUNWLElBQUksU0FBUyxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ2xCLE1BQU0sQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDakMsQ0FBQztRQUVELE9BQU87WUFDSCxPQUFPLEVBQUUsTUFBTSxDQUFDLE1BQU0sS0FBSyxDQUFDO1lBQzVCLE1BQU07WUFDTixTQUFTO1lBQ1QsY0FBYztTQUNqQixDQUFDO0lBQ04sQ0FBQztJQUVPLEtBQUssQ0FBQyxlQUFlLENBQUMsSUFBUztRQUNuQyxPQUFPLElBQUksT0FBTyxDQUFDLEtBQUssRUFBRSxPQUFPLEVBQUUsRUFBRTtZQUNqQyxJQUFJLENBQUM7Z0JBQ0QsTUFBTSxFQUFFLGdCQUFnQixFQUFFLGdCQUFnQixFQUFFLGFBQWEsRUFBRSxHQUFHLElBQUksQ0FBQztnQkFFbkUsU0FBUztnQkFDVCxNQUFNLFVBQVUsR0FBRyxNQUFNLElBQUksQ0FBQyxhQUFhLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztnQkFDOUQsSUFBSSxDQUFDLFVBQVUsQ0FBQyxPQUFPLEVBQUUsQ0FBQztvQkFDdEIsT0FBTyxDQUFDO3dCQUNKLE9BQU8sRUFBRSxLQUFLO3dCQUNkLEtBQUssRUFBRSxhQUFhLFVBQVUsQ0FBQyxLQUFLLEVBQUU7cUJBQ3pDLENBQUMsQ0FBQztvQkFDSCxPQUFPO2dCQUNYLENBQUM7Z0JBRUQsV0FBVztnQkFDWCxNQUFNLGFBQWEsR0FBRyxNQUFNLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO2dCQUNyRSxJQUFJLENBQUMsYUFBYSxDQUFDLE9BQU8sRUFBRSxDQUFDO29CQUN6QixPQUFPLENBQUM7d0JBQ0osT0FBTyxFQUFFLEtBQUs7d0JBQ2QsS0FBSyxFQUFFLGVBQWUsYUFBYSxDQUFDLEtBQUssRUFBRTtxQkFDOUMsQ0FBQyxDQUFDO29CQUNILE9BQU87Z0JBQ1gsQ0FBQztnQkFFRCxXQUFXO2dCQUNYLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztnQkFFcEMsVUFBVTtnQkFDVixNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsMEJBQTBCLENBQUMsYUFBYSxDQUFDLElBQUksRUFBRSxhQUFhLEVBQUUsT0FBTyxDQUFDLENBQUM7Z0JBRWpHLGFBQWE7Z0JBQ2IsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxhQUFhLElBQUksa0JBQWtCLEVBQUUsT0FBTyxDQUFDLENBQUM7Z0JBRXRGLDJCQUEyQjtnQkFDM0IsT0FBTyxDQUFDO29CQUNKLE9BQU8sRUFBRSxLQUFLO29CQUNkLEtBQUssRUFBRSxjQUFjO29CQUNyQixXQUFXLEVBQUUsMkVBQTJFO2lCQUMzRixDQUFDLENBQUM7WUFFUCxDQUFDO1lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztnQkFDYixPQUFPLENBQUM7b0JBQ0osT0FBTyxFQUFFLEtBQUs7b0JBQ2QsS0FBSyxFQUFFLGVBQWUsS0FBSyxFQUFFO2lCQUNoQyxDQUFDLENBQUM7WUFDUCxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDO0lBRU8sS0FBSyxDQUFDLGlCQUFpQixDQUFDLFVBQWtCO1FBQzlDLE9BQU8sSUFBSSxPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsRUFBRTtZQUMzQixNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUUsWUFBWSxFQUFFLFVBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLE9BQWUsRUFBRSxFQUFFO2dCQUNsRixJQUFJLENBQUM7b0JBQ0QsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQztvQkFDdkMsT0FBTyxDQUFDLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsVUFBVSxFQUFFLENBQUMsQ0FBQztnQkFDakQsQ0FBQztnQkFBQyxPQUFPLFVBQVUsRUFBRSxDQUFDO29CQUNsQixPQUFPLENBQUMsRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxXQUFXLEVBQUUsQ0FBQyxDQUFDO2dCQUNwRCxDQUFDO1lBQ0wsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsS0FBVSxFQUFFLEVBQUU7Z0JBQ3BCLE9BQU8sQ0FBQyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxPQUFPLElBQUksV0FBVyxFQUFFLENBQUMsQ0FBQztZQUNyRSxDQUFDLENBQUMsQ0FBQztRQUNQLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztJQUVPLDBCQUEwQixDQUFDLFVBQWlCLEVBQUUsT0FBZSxFQUFFLE9BQWU7UUFDbEYsZUFBZTtRQUNmLE1BQU0sWUFBWSxHQUFHLENBQUMsR0FBRyxVQUFVLENBQUMsQ0FBQztRQUVyQyxpQkFBaUI7UUFDakIsSUFBSSxZQUFZLENBQUMsQ0FBQyxDQUFDLElBQUksWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsS0FBSyxXQUFXLEVBQUUsQ0FBQztZQUM5RCxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxHQUFHLE9BQU8sSUFBSSxrQkFBa0IsQ0FBQztRQUMxRCxDQUFDO1FBRUQsbUJBQW1CO1FBQ25CLDBCQUEwQjtRQUUxQixPQUFPLFlBQVksQ0FBQztJQUN4QixDQUFDO0lBRUQ7O09BRUc7SUFDSyxLQUFLLENBQUMsc0JBQXNCLENBQUMsU0FBaUIsRUFBRSxPQUFlO1FBQ25FLE9BQU8sSUFBSSxPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsRUFBRTtZQUMzQixNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUUsY0FBYyxFQUFFLFNBQVMsRUFBRSxPQUFPLEVBQUU7Z0JBQ25FLFNBQVMsRUFBRSxJQUFJO2dCQUNmLE1BQU0sRUFBRSxLQUFLO2FBQ2hCLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxTQUFjLEVBQUUsRUFBRTtnQkFDdkIsSUFBQSxjQUFRLEVBQUMsV0FBVyxFQUFFLFNBQVMsQ0FBQyxDQUFDO2dCQUNqQyxPQUFPLENBQUMsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsQ0FBQyxDQUFDO1lBQ2hELENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLEtBQVUsRUFBRSxFQUFFO2dCQUNwQixPQUFPLENBQUMsS0FBSyxDQUFDLFdBQVcsRUFBRSxLQUFLLENBQUMsQ0FBQztnQkFDbEMsT0FBTyxDQUFDLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxDQUFDLE9BQU8sSUFBSSxVQUFVLEVBQUUsQ0FBQyxDQUFDO1lBQ3BFLENBQUMsQ0FBQyxDQUFDO1FBQ1AsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDO0lBRUQ7O09BRUc7SUFDSyxLQUFLLENBQUMscUJBQXFCLENBQUMsU0FBaUIsRUFBRSxXQUFnQjtRQUNuRSxPQUFPLElBQUksT0FBTyxDQUFDLENBQUMsT0FBTyxFQUFFLEVBQUU7WUFDM0IsTUFBTSxpQkFBaUIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLFdBQVcsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDL0QsTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsVUFBVSxFQUFFLGlCQUFpQixFQUFFLFNBQVMsRUFBRSxpQkFBaUIsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLFNBQWMsRUFBRSxFQUFFO2dCQUN4RyxJQUFBLGNBQVEsRUFBQyxhQUFhLEVBQUUsU0FBUyxDQUFDLENBQUM7Z0JBQ25DLE9BQU8sQ0FBQyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxDQUFDLENBQUM7WUFDaEQsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsS0FBVSxFQUFFLEVBQUU7Z0JBQ3BCLE9BQU8sQ0FBQyxLQUFLLENBQUMsYUFBYSxFQUFFLEtBQUssQ0FBQyxDQUFDO2dCQUNwQyxPQUFPLENBQUMsRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsT0FBTyxJQUFJLFlBQVksRUFBRSxDQUFDLENBQUM7WUFDdEUsQ0FBQyxDQUFDLENBQUM7UUFDUCxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7SUFFRDs7T0FFRztJQUNLLEtBQUssQ0FBQyx3QkFBd0IsQ0FBQyxTQUFpQjtRQUNwRCxPQUFPLElBQUksT0FBTyxDQUFDLENBQUMsT0FBTyxFQUFFLEVBQUU7WUFDM0IsTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsVUFBVSxFQUFFLGdCQUFnQixFQUFFLFNBQVMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQVcsRUFBRSxFQUFFO2dCQUNqRixJQUFBLGNBQVEsRUFBQyxXQUFXLEVBQUUsTUFBTSxDQUFDLENBQUM7Z0JBQzlCLE9BQU8sQ0FBQyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUM7WUFDN0MsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsS0FBVSxFQUFFLEVBQUU7Z0JBQ3BCLE9BQU8sQ0FBQyxLQUFLLENBQUMsV0FBVyxFQUFFLEtBQUssQ0FBQyxDQUFDO2dCQUNsQyxPQUFPLENBQUMsRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsT0FBTyxJQUFJLFVBQVUsRUFBRSxDQUFDLENBQUM7WUFDcEUsQ0FBQyxDQUFDLENBQUM7UUFDUCxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7SUFFRDs7T0FFRztJQUNLLEtBQUssQ0FBQyxzQkFBc0IsQ0FBQyxTQUFpQixFQUFFLE9BQWU7UUFDbkUsT0FBTyxJQUFJLE9BQU8sQ0FBQyxDQUFDLE9BQU8sRUFBRSxFQUFFO1lBQzNCLE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLFVBQVUsRUFBRSxZQUFZLEVBQUUsU0FBUyxFQUFFLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQVcsRUFBRSxFQUFFO2dCQUN0RixJQUFBLGNBQVEsRUFBQyxXQUFXLEVBQUUsTUFBTSxDQUFDLENBQUM7Z0JBQzlCLE9BQU8sQ0FBQyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUM7WUFDN0MsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsS0FBVSxFQUFFLEVBQUU7Z0JBQ3BCLE9BQU8sQ0FBQyxLQUFLLENBQUMsV0FBVyxFQUFFLEtBQUssQ0FBQyxDQUFDO2dCQUNsQyxPQUFPLENBQUMsRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsT0FBTyxJQUFJLFVBQVUsRUFBRSxDQUFDLENBQUM7WUFDcEUsQ0FBQyxDQUFDLENBQUM7UUFDUCxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7SUFFRDs7O09BR0c7SUFDSyxLQUFLLENBQUMsMkJBQTJCLENBQUMsUUFBYSxFQUFFLFVBQWtCLEVBQUUsVUFBa0IsRUFBRSxlQUF3QixFQUFFLGlCQUEwQjtRQUNqSixJQUFBLGNBQVEsRUFBQyxrQkFBa0IsQ0FBQyxDQUFDO1FBRTdCLE1BQU0sVUFBVSxHQUFVLEVBQUUsQ0FBQztRQUM3QixJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7UUFFbEIseUJBQXlCO1FBQ3pCLE1BQU0sV0FBVyxHQUFHO1lBQ2hCLFVBQVUsRUFBRSxXQUFXO1lBQ3ZCLE9BQU8sRUFBRSxVQUFVLElBQUksRUFBRSxFQUFFLGFBQWE7WUFDeEMsV0FBVyxFQUFFLENBQUM7WUFDZCxrQkFBa0IsRUFBRSxFQUFFO1lBQ3RCLFNBQVMsRUFBRSxFQUFFO1lBQ2IsTUFBTSxFQUFFO2dCQUNKLFFBQVEsRUFBRSxDQUFDO2FBQ2Q7WUFDRCxvQkFBb0IsRUFBRSxDQUFDO1lBQ3ZCLFlBQVksRUFBRSxLQUFLO1NBQ3RCLENBQUM7UUFDRixVQUFVLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQzdCLFNBQVMsRUFBRSxDQUFDO1FBRVosa0JBQWtCO1FBQ2xCLE1BQU0sT0FBTyxHQUFHO1lBQ1osVUFBVTtZQUNWLFNBQVMsRUFBRSxTQUFTLEdBQUcsQ0FBQyxFQUFFLHFCQUFxQjtZQUMvQyxnQkFBZ0IsRUFBRSxDQUFDO1lBQ25CLFdBQVcsRUFBRSxJQUFJLEdBQUcsRUFBa0IsRUFBRSxtQkFBbUI7WUFDM0QsZUFBZSxFQUFFLElBQUksR0FBRyxFQUFrQixFQUFFLGlCQUFpQjtZQUM3RCxvQkFBb0IsRUFBRSxJQUFJLEdBQUcsRUFBa0IsQ0FBQyxpQkFBaUI7U0FDcEUsQ0FBQztRQUVGLDBDQUEwQztRQUMxQyxNQUFNLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxRQUFRLEVBQUUsSUFBSSxFQUFFLENBQUMsRUFBRSxPQUFPLEVBQUUsZUFBZSxFQUFFLGlCQUFpQixFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBRTlHLElBQUEsY0FBUSxFQUFDLGdCQUFnQixVQUFVLENBQUMsTUFBTSxNQUFNLENBQUMsQ0FBQztRQUNsRCxJQUFBLGNBQVEsRUFBQyxhQUFhLEVBQUUsS0FBSyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUVuRSxPQUFPLFVBQVUsQ0FBQztJQUN0QixDQUFDO0lBRUQ7O09BRUc7SUFDSyxLQUFLLENBQUMsc0JBQXNCLENBQ2hDLFFBQWEsRUFDYixlQUE4QixFQUM5QixTQUFpQixFQUNqQixPQU9DLEVBQ0QsZUFBd0IsRUFDeEIsaUJBQTBCLEVBQzFCLFFBQWlCO1FBRWpCLE1BQU0sRUFBRSxVQUFVLEVBQUUsR0FBRyxPQUFPLENBQUM7UUFFL0IsU0FBUztRQUNULE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxRQUFRLEVBQUUsZUFBZSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBRWhGLGVBQWU7UUFDZixPQUFPLFVBQVUsQ0FBQyxNQUFNLElBQUksU0FBUyxFQUFFLENBQUM7WUFDcEMsVUFBVSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUMxQixDQUFDO1FBQ0QsSUFBQSxjQUFRLEVBQUMsV0FBVyxTQUFTLEtBQUssSUFBSSxDQUFDLEtBQUssWUFBWSxFQUFFLElBQUksQ0FBQyxPQUFPLEVBQUUsb0JBQW9CLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztRQUNySCxVQUFVLENBQUMsU0FBUyxDQUFDLEdBQUcsSUFBSSxDQUFDO1FBRTdCLDZCQUE2QjtRQUM3QixNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsZUFBZSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ2hELE1BQU0sTUFBTSxHQUFHLFFBQVEsSUFBSSxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7UUFDakQsT0FBTyxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLFFBQVEsRUFBRSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBRXRELGlCQUFpQjtRQUNqQixJQUFJLFFBQVEsRUFBRSxDQUFDO1lBQ1gsT0FBTyxDQUFDLGVBQWUsQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBQ2pELElBQUEsY0FBUSxFQUFDLGVBQWUsUUFBUSxPQUFPLFNBQVMsRUFBRSxDQUFDLENBQUM7UUFDeEQsQ0FBQztRQUVELHlCQUF5QjtRQUN6QixNQUFNLGlCQUFpQixHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUM5RCxJQUFJLGVBQWUsSUFBSSxpQkFBaUIsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDbEQsSUFBQSxjQUFRLEVBQUMsUUFBUSxJQUFJLENBQUMsS0FBSyxNQUFNLGlCQUFpQixDQUFDLE1BQU0sT0FBTyxDQUFDLENBQUM7WUFFbEUsYUFBYTtZQUNiLE1BQU0sWUFBWSxHQUFhLEVBQUUsQ0FBQztZQUNsQyxJQUFBLGNBQVEsRUFBQyxPQUFPLGlCQUFpQixDQUFDLE1BQU0sbUJBQW1CLE9BQU8sQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDO1lBQ2hGLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxpQkFBaUIsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztnQkFDaEQsSUFBQSxjQUFRLEVBQUMsT0FBTyxDQUFDLEdBQUMsQ0FBQyxzQkFBc0IsT0FBTyxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUM7Z0JBQzlELE1BQU0sVUFBVSxHQUFHLE9BQU8sQ0FBQyxTQUFTLEVBQUUsQ0FBQztnQkFDdkMsWUFBWSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztnQkFDOUIsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsRUFBRSxRQUFRLEVBQUUsVUFBVSxFQUFFLENBQUMsQ0FBQztnQkFDOUMsSUFBQSxjQUFRLEVBQUMsY0FBYyxJQUFJLENBQUMsS0FBSyxjQUFjLFVBQVUsR0FBRyxDQUFDLENBQUM7WUFDbEUsQ0FBQztZQUNELElBQUEsY0FBUSxFQUFDLFFBQVEsSUFBSSxDQUFDLEtBQUssWUFBWSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUV6RCxVQUFVO1lBQ1YsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLGlCQUFpQixDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO2dCQUNoRCxNQUFNLFNBQVMsR0FBRyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDdkMsTUFBTSxVQUFVLEdBQUcsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNuQyxNQUFNLElBQUksQ0FBQyxzQkFBc0IsQ0FDN0IsU0FBUyxFQUNULFNBQVMsRUFDVCxVQUFVLEVBQ1YsT0FBTyxFQUNQLGVBQWUsRUFDZixpQkFBaUIsRUFDakIsU0FBUyxDQUFDLElBQUksSUFBSSxRQUFRLENBQUMsR0FBQyxDQUFDLEVBQUUsQ0FDbEMsQ0FBQztZQUNOLENBQUM7UUFDTCxDQUFDO1FBRUQsU0FBUztRQUNULElBQUksaUJBQWlCLElBQUksUUFBUSxDQUFDLFVBQVUsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDO1lBQ2pGLElBQUEsY0FBUSxFQUFDLFFBQVEsSUFBSSxDQUFDLEtBQUssTUFBTSxRQUFRLENBQUMsVUFBVSxDQUFDLE1BQU0sTUFBTSxDQUFDLENBQUM7WUFFbkUsTUFBTSxnQkFBZ0IsR0FBYSxFQUFFLENBQUM7WUFDdEMsS0FBSyxNQUFNLFNBQVMsSUFBSSxRQUFRLENBQUMsVUFBVSxFQUFFLENBQUM7Z0JBQzFDLE1BQU0sY0FBYyxHQUFHLE9BQU8sQ0FBQyxTQUFTLEVBQUUsQ0FBQztnQkFDM0MsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDO2dCQUN0QyxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxFQUFFLFFBQVEsRUFBRSxjQUFjLEVBQUUsQ0FBQyxDQUFDO2dCQUVwRCxpQkFBaUI7Z0JBQ2pCLE1BQU0sYUFBYSxHQUFHLFNBQVMsQ0FBQyxJQUFJLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxJQUFJLFNBQVMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ2xGLElBQUksYUFBYSxFQUFFLENBQUM7b0JBQ2hCLE9BQU8sQ0FBQyxvQkFBb0IsQ0FBQyxHQUFHLENBQUMsYUFBYSxFQUFFLGNBQWMsQ0FBQyxDQUFDO29CQUNoRSxJQUFBLGNBQVEsRUFBQyxlQUFlLGFBQWEsT0FBTyxjQUFjLEVBQUUsQ0FBQyxDQUFDO2dCQUNsRSxDQUFDO2dCQUVELHdCQUF3QjtnQkFDeEIsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLHFCQUFxQixDQUFDLFNBQVMsRUFBRSxTQUFTLEVBQUUsT0FBTyxDQUFDLENBQUM7Z0JBQy9FLFVBQVUsQ0FBQyxjQUFjLENBQUMsR0FBRyxZQUFZLENBQUM7Z0JBRTFDLHVCQUF1QjtnQkFDdkIsTUFBTSxtQkFBbUIsR0FBRyxPQUFPLENBQUMsU0FBUyxFQUFFLENBQUM7Z0JBQ2hELFVBQVUsQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHO29CQUM5QixVQUFVLEVBQUUsbUJBQW1CO29CQUMvQixRQUFRLEVBQUUsSUFBSSxDQUFDLGNBQWMsRUFBRTtpQkFDbEMsQ0FBQztnQkFFRiwyQkFBMkI7Z0JBQzNCLElBQUksWUFBWSxJQUFJLE9BQU8sWUFBWSxLQUFLLFFBQVEsRUFBRSxDQUFDO29CQUNuRCxZQUFZLENBQUMsUUFBUSxHQUFHLEVBQUUsUUFBUSxFQUFFLG1CQUFtQixFQUFFLENBQUM7Z0JBQzlELENBQUM7WUFDTCxDQUFDO1lBRUQsSUFBQSxjQUFRLEVBQUMsUUFBUSxJQUFJLENBQUMsS0FBSyxRQUFRLGdCQUFnQixDQUFDLE1BQU0sTUFBTSxDQUFDLENBQUM7UUFDdEUsQ0FBQztRQUdELG9CQUFvQjtRQUNwQixNQUFNLGVBQWUsR0FBRyxPQUFPLENBQUMsU0FBUyxFQUFFLENBQUM7UUFDNUMsSUFBSSxDQUFDLE9BQU8sR0FBRyxFQUFFLFFBQVEsRUFBRSxlQUFlLEVBQUUsQ0FBQztRQUU3QyxNQUFNLFVBQVUsR0FBUTtZQUNwQixVQUFVLEVBQUUsZUFBZTtZQUMzQixNQUFNLEVBQUUsRUFBRSxRQUFRLEVBQUUsQ0FBQyxFQUFFO1lBQ3ZCLE9BQU8sRUFBRSxFQUFFLFFBQVEsRUFBRSxPQUFPLENBQUMsZ0JBQWdCLEVBQUU7WUFDL0MsUUFBUSxFQUFFLE1BQU07WUFDaEIsaUJBQWlCLEVBQUUsSUFBSTtZQUN2QiwyQkFBMkIsRUFBRSxJQUFJO1NBQ3BDLENBQUM7UUFFRixXQUFXO1FBQ1gsSUFBSSxTQUFTLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDbEIsb0NBQW9DO1lBQ3BDLFVBQVUsQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDO1FBQy9CLENBQUM7YUFBTSxDQUFDO1lBQ0osc0JBQXNCO1lBQ3RCLFVBQVUsQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDO1FBQy9CLENBQUM7UUFFRCxVQUFVLENBQUMsZUFBZSxDQUFDLEdBQUcsVUFBVSxDQUFDO1FBQ3pDLE9BQU8sQ0FBQyxTQUFTLEdBQUcsZUFBZSxHQUFHLENBQUMsQ0FBQztJQUM1QyxDQUFDO0lBRUQ7Ozs7T0FJRztJQUNLLGtCQUFrQixDQUFDLElBQVk7UUFDbkMsTUFBTSxXQUFXLEdBQUcsbUVBQW1FLENBQUM7UUFFeEYsYUFBYTtRQUNiLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBRXZELFdBQVc7UUFDWCxJQUFJLFNBQVMsQ0FBQyxNQUFNLEtBQUssRUFBRSxFQUFFLENBQUM7WUFDMUIsT0FBTyxJQUFJLENBQUMsQ0FBQyxvQkFBb0I7UUFDckMsQ0FBQztRQUVELCtDQUErQztRQUMvQyxJQUFJLE1BQU0sR0FBRyxTQUFTLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUV2QyxvQkFBb0I7UUFDcEIsTUFBTSxTQUFTLEdBQUcsU0FBUyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUV6QyxrQkFBa0I7UUFDbEIsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLFNBQVMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO1lBQzNDLE1BQU0sSUFBSSxHQUFHLFNBQVMsQ0FBQyxDQUFDLENBQUMsSUFBSSxHQUFHLENBQUM7WUFDakMsTUFBTSxJQUFJLEdBQUcsU0FBUyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxHQUFHLENBQUM7WUFDckMsTUFBTSxJQUFJLEdBQUcsU0FBUyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxHQUFHLENBQUM7WUFFckMsNkJBQTZCO1lBQzdCLE1BQU0sS0FBSyxHQUFHLFFBQVEsQ0FBQyxJQUFJLEdBQUcsSUFBSSxHQUFHLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQztZQUUvQyxZQUFZO1lBQ1osTUFBTSxLQUFLLEdBQUcsQ0FBQyxLQUFLLElBQUksQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQ2hDLE1BQU0sSUFBSSxHQUFHLEtBQUssR0FBRyxFQUFFLENBQUM7WUFFeEIsTUFBTSxJQUFJLFdBQVcsQ0FBQyxLQUFLLENBQUMsR0FBRyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDckQsQ0FBQztRQUVELE9BQU8sTUFBTSxDQUFDO0lBQ2xCLENBQUM7SUFFRDs7T0FFRztJQUNLLHFCQUFxQixDQUFDLGFBQWtCLEVBQUUsU0FBaUIsRUFBRSxPQUdwRTs7UUFDRyxJQUFJLGFBQWEsR0FBRyxhQUFhLENBQUMsSUFBSSxJQUFJLGFBQWEsQ0FBQyxRQUFRLElBQUksY0FBYyxDQUFDO1FBQ25GLE1BQU0sT0FBTyxHQUFHLGFBQWEsQ0FBQyxPQUFPLEtBQUssU0FBUyxDQUFDLENBQUMsQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7UUFFbkYsK0NBQStDO1FBQy9DLCtEQUErRDtRQUUvRCxnQ0FBZ0M7UUFDaEMsSUFBSSxhQUFhLElBQUksQ0FBQyxhQUFhLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDcEQsSUFBQSxjQUFRLEVBQUMsbUJBQW1CLGFBQWEsRUFBRSxDQUFDLENBQUM7UUFDakQsQ0FBQztRQUVELFNBQVM7UUFDVCxNQUFNLFNBQVMsR0FBUTtZQUNuQixVQUFVLEVBQUUsYUFBYTtZQUN6QixPQUFPLEVBQUUsRUFBRTtZQUNYLFdBQVcsRUFBRSxDQUFDO1lBQ2Qsa0JBQWtCLEVBQUUsRUFBRTtZQUN0QixNQUFNLEVBQUUsRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFO1lBQy9CLFVBQVUsRUFBRSxPQUFPO1NBQ3RCLENBQUM7UUFFRiwrQkFBK0I7UUFDL0IsU0FBUyxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUM7UUFFMUIsZUFBZTtRQUNmLElBQUksYUFBYSxLQUFLLGdCQUFnQixFQUFFLENBQUM7WUFDckMsTUFBTSxXQUFXLEdBQUcsQ0FBQSxNQUFBLE1BQUEsYUFBYSxDQUFDLFVBQVUsMENBQUUsV0FBVywwQ0FBRSxLQUFLLEtBQUksRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLE1BQU0sRUFBRSxHQUFHLEVBQUUsQ0FBQztZQUNoRyxNQUFNLFdBQVcsR0FBRyxDQUFBLE1BQUEsTUFBQSxhQUFhLENBQUMsVUFBVSwwQ0FBRSxXQUFXLDBDQUFFLEtBQUssS0FBSSxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDO1lBRXZGLFNBQVMsQ0FBQyxZQUFZLEdBQUc7Z0JBQ3JCLFVBQVUsRUFBRSxTQUFTO2dCQUNyQixPQUFPLEVBQUUsV0FBVyxDQUFDLEtBQUs7Z0JBQzFCLFFBQVEsRUFBRSxXQUFXLENBQUMsTUFBTTthQUMvQixDQUFDO1lBQ0YsU0FBUyxDQUFDLFlBQVksR0FBRztnQkFDckIsVUFBVSxFQUFFLFNBQVM7Z0JBQ3JCLEdBQUcsRUFBRSxXQUFXLENBQUMsQ0FBQztnQkFDbEIsR0FBRyxFQUFFLFdBQVcsQ0FBQyxDQUFDO2FBQ3JCLENBQUM7UUFDTixDQUFDO2FBQU0sSUFBSSxhQUFhLEtBQUssV0FBVyxFQUFFLENBQUM7WUFDdkMsMkJBQTJCO1lBQzNCLE1BQU0sZUFBZSxHQUFHLENBQUEsTUFBQSxhQUFhLENBQUMsVUFBVSwwQ0FBRSxZQUFZLE1BQUksTUFBQSxhQUFhLENBQUMsVUFBVSwwQ0FBRSxXQUFXLENBQUEsQ0FBQztZQUN4RyxJQUFJLGVBQWUsRUFBRSxDQUFDO2dCQUNsQixTQUFTLENBQUMsWUFBWSxHQUFHLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxlQUFlLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDckYsQ0FBQztpQkFBTSxDQUFDO2dCQUNKLFNBQVMsQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDO1lBQ2xDLENBQUM7WUFFRCxTQUFTLENBQUMsS0FBSyxHQUFHLE1BQUEsTUFBQSxNQUFBLGFBQWEsQ0FBQyxVQUFVLDBDQUFFLEtBQUssMENBQUUsS0FBSyxtQ0FBSSxDQUFDLENBQUM7WUFDOUQsU0FBUyxDQUFDLFNBQVMsR0FBRyxNQUFBLE1BQUEsTUFBQSxhQUFhLENBQUMsVUFBVSwwQ0FBRSxTQUFTLDBDQUFFLEtBQUssbUNBQUksQ0FBQyxDQUFDO1lBQ3RFLFNBQVMsQ0FBQyxTQUFTLEdBQUcsTUFBQSxNQUFBLE1BQUEsYUFBYSxDQUFDLFVBQVUsMENBQUUsU0FBUywwQ0FBRSxLQUFLLG1DQUFJLENBQUMsQ0FBQztZQUN0RSxTQUFTLENBQUMsV0FBVyxHQUFHLEVBQUUsVUFBVSxFQUFFLFNBQVMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQztZQUNsRSxTQUFTLENBQUMsVUFBVSxHQUFHLE1BQUEsTUFBQSxNQUFBLGFBQWEsQ0FBQyxVQUFVLDBDQUFFLFVBQVUsMENBQUUsS0FBSyxtQ0FBSSxDQUFDLENBQUM7WUFDeEUsU0FBUyxDQUFDLFVBQVUsR0FBRyxNQUFBLE1BQUEsTUFBQSxhQUFhLENBQUMsVUFBVSwwQ0FBRSxVQUFVLDBDQUFFLEtBQUssbUNBQUksQ0FBQyxDQUFDO1lBQ3hFLFNBQVMsQ0FBQyxjQUFjLEdBQUcsTUFBQSxNQUFBLE1BQUEsYUFBYSxDQUFDLFVBQVUsMENBQUUsY0FBYywwQ0FBRSxLQUFLLG1DQUFJLElBQUksQ0FBQztZQUNuRixTQUFTLENBQUMsYUFBYSxHQUFHLE1BQUEsTUFBQSxNQUFBLGFBQWEsQ0FBQyxVQUFVLDBDQUFFLGFBQWEsMENBQUUsS0FBSyxtQ0FBSSxLQUFLLENBQUM7WUFFbEYsMEJBQTBCO1lBQzFCLDhFQUE4RTtZQUM5RSxTQUFTLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQztZQUN4QixTQUFTLENBQUMsR0FBRyxHQUFHLEVBQUUsQ0FBQztRQUN2QixDQUFDO2FBQU0sSUFBSSxhQUFhLEtBQUssV0FBVyxFQUFFLENBQUM7WUFDdkMsU0FBUyxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUM7WUFDL0IsU0FBUyxDQUFDLFdBQVcsR0FBRyxDQUFDLENBQUM7WUFDMUIsU0FBUyxDQUFDLFlBQVksR0FBRyxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDO1lBQzVGLFNBQVMsQ0FBQyxXQUFXLEdBQUcsRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsQ0FBQztZQUMzRixTQUFTLENBQUMsYUFBYSxHQUFHLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLENBQUM7WUFDN0YsU0FBUyxDQUFDLGNBQWMsR0FBRyxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDO1lBQzlGLFNBQVMsQ0FBQyxhQUFhLEdBQUcsSUFBSSxDQUFDO1lBQy9CLFNBQVMsQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDO1lBQzlCLFNBQVMsQ0FBQyxjQUFjLEdBQUcsSUFBSSxDQUFDO1lBQ2hDLFNBQVMsQ0FBQyxlQUFlLEdBQUcsSUFBSSxDQUFDO1lBQ2pDLFNBQVMsQ0FBQyxTQUFTLEdBQUcsR0FBRyxDQUFDO1lBQzFCLFNBQVMsQ0FBQyxVQUFVLEdBQUcsR0FBRyxDQUFDO1lBQzNCLG9CQUFvQjtZQUNwQixNQUFNLFVBQVUsR0FBRyxDQUFBLE1BQUEsYUFBYSxDQUFDLFVBQVUsMENBQUUsT0FBTyxNQUFJLE1BQUEsYUFBYSxDQUFDLFVBQVUsMENBQUUsTUFBTSxDQUFBLENBQUM7WUFDekYsSUFBSSxVQUFVLEVBQUUsQ0FBQztnQkFDYixTQUFTLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxVQUFVLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDM0UsQ0FBQztpQkFBTSxDQUFDO2dCQUNKLFNBQVMsQ0FBQyxPQUFPLEdBQUcsRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLENBQUMsQ0FBQyxXQUFXO1lBQzVELENBQUM7WUFDRCxTQUFTLENBQUMsWUFBWSxHQUFHLEVBQUUsQ0FBQztZQUM1QixTQUFTLENBQUMsR0FBRyxHQUFHLEVBQUUsQ0FBQztRQUN2QixDQUFDO2FBQU0sSUFBSSxhQUFhLEtBQUssVUFBVSxFQUFFLENBQUM7WUFDdEMsU0FBUyxDQUFDLE9BQU8sR0FBRyxDQUFBLE1BQUEsTUFBQSxhQUFhLENBQUMsVUFBVSwwQ0FBRSxPQUFPLDBDQUFFLEtBQUssS0FBSSxPQUFPLENBQUM7WUFDeEUsU0FBUyxDQUFDLGdCQUFnQixHQUFHLENBQUMsQ0FBQztZQUMvQixTQUFTLENBQUMsY0FBYyxHQUFHLENBQUMsQ0FBQztZQUM3QixTQUFTLENBQUMsZUFBZSxHQUFHLEVBQUUsQ0FBQztZQUMvQixTQUFTLENBQUMsU0FBUyxHQUFHLEVBQUUsQ0FBQztZQUN6QixTQUFTLENBQUMsV0FBVyxHQUFHLE9BQU8sQ0FBQztZQUNoQyxTQUFTLENBQUMsV0FBVyxHQUFHLEVBQUUsQ0FBQztZQUMzQixTQUFTLENBQUMsU0FBUyxHQUFHLENBQUMsQ0FBQztZQUN4QixTQUFTLENBQUMsZUFBZSxHQUFHLElBQUksQ0FBQztZQUNqQyxTQUFTLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQztZQUN2QixTQUFTLENBQUMsaUJBQWlCLEdBQUcsSUFBSSxDQUFDO1lBQ25DLFNBQVMsQ0FBQyxTQUFTLEdBQUcsQ0FBQyxDQUFDO1lBQ3hCLFNBQVMsQ0FBQyxTQUFTLEdBQUcsS0FBSyxDQUFDO1lBQzVCLFNBQVMsQ0FBQyxPQUFPLEdBQUcsS0FBSyxDQUFDO1lBQzFCLFNBQVMsQ0FBQyxZQUFZLEdBQUcsS0FBSyxDQUFDO1lBQy9CLFNBQVMsQ0FBQyxnQkFBZ0IsR0FBRyxDQUFDLENBQUM7WUFDL0IsU0FBUyxDQUFDLFVBQVUsR0FBRyxDQUFDLENBQUM7WUFDekIsU0FBUyxDQUFDLEdBQUcsR0FBRyxFQUFFLENBQUM7UUFDdkIsQ0FBQzthQUFNLElBQUksYUFBYSxDQUFDLFVBQVUsRUFBRSxDQUFDO1lBQ2xDLDRCQUE0QjtZQUM1QixLQUFLLE1BQU0sQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQztnQkFDbEUsSUFBSSxHQUFHLEtBQUssTUFBTSxJQUFJLEdBQUcsS0FBSyxTQUFTLElBQUksR0FBRyxLQUFLLFVBQVU7b0JBQ3pELEdBQUcsS0FBSyxNQUFNLElBQUksR0FBRyxLQUFLLE1BQU0sSUFBSSxHQUFHLEtBQUssZUFBZSxJQUFJLEdBQUcsS0FBSyxXQUFXLEVBQUUsQ0FBQztvQkFDckYsU0FBUyxDQUFDLHVCQUF1QjtnQkFDckMsQ0FBQztnQkFFRCxxQkFBcUI7Z0JBQ3JCLElBQUksR0FBRyxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO29CQUN0QixtQkFBbUI7b0JBQ25CLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxLQUFLLEVBQUUsT0FBTyxDQUFDLENBQUM7b0JBQ2hFLElBQUksU0FBUyxLQUFLLFNBQVMsRUFBRSxDQUFDO3dCQUMxQixTQUFTLENBQUMsR0FBRyxDQUFDLEdBQUcsU0FBUyxDQUFDO29CQUMvQixDQUFDO2dCQUNMLENBQUM7cUJBQU0sQ0FBQztvQkFDSixnQkFBZ0I7b0JBQ2hCLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxLQUFLLEVBQUUsT0FBTyxDQUFDLENBQUM7b0JBQ2hFLElBQUksU0FBUyxLQUFLLFNBQVMsRUFBRSxDQUFDO3dCQUMxQixTQUFTLENBQUMsR0FBRyxDQUFDLEdBQUcsU0FBUyxDQUFDO29CQUMvQixDQUFDO2dCQUNMLENBQUM7WUFDTCxDQUFDO1FBQ0wsQ0FBQztRQUVELGVBQWU7UUFDZixNQUFNLEdBQUcsR0FBRyxTQUFTLENBQUMsR0FBRyxJQUFJLEVBQUUsQ0FBQztRQUNoQyxPQUFPLFNBQVMsQ0FBQyxHQUFHLENBQUM7UUFDckIsU0FBUyxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7UUFFcEIsT0FBTyxTQUFTLENBQUM7SUFDckIsQ0FBQztJQUVEOztPQUVHO0lBQ0ssd0JBQXdCLENBQUMsUUFBYSxFQUFFLE9BRy9DOztRQUNHLElBQUksQ0FBQyxRQUFRLElBQUksT0FBTyxRQUFRLEtBQUssUUFBUSxFQUFFLENBQUM7WUFDNUMsT0FBTyxRQUFRLENBQUM7UUFDcEIsQ0FBQztRQUVELE1BQU0sS0FBSyxHQUFHLFFBQVEsQ0FBQyxLQUFLLENBQUM7UUFDN0IsTUFBTSxJQUFJLEdBQUcsUUFBUSxDQUFDLElBQUksQ0FBQztRQUUzQixVQUFVO1FBQ1YsSUFBSSxLQUFLLEtBQUssSUFBSSxJQUFJLEtBQUssS0FBSyxTQUFTLEVBQUUsQ0FBQztZQUN4QyxPQUFPLElBQUksQ0FBQztRQUNoQixDQUFDO1FBRUQsb0JBQW9CO1FBQ3BCLElBQUksS0FBSyxJQUFJLE9BQU8sS0FBSyxLQUFLLFFBQVEsSUFBSSxLQUFLLENBQUMsSUFBSSxLQUFLLEVBQUUsRUFBRSxDQUFDO1lBQzFELE9BQU8sSUFBSSxDQUFDO1FBQ2hCLENBQUM7UUFFRCxTQUFTO1FBQ1QsSUFBSSxJQUFJLEtBQUssU0FBUyxLQUFJLEtBQUssYUFBTCxLQUFLLHVCQUFMLEtBQUssQ0FBRSxJQUFJLENBQUEsRUFBRSxDQUFDO1lBQ3BDLDRCQUE0QjtZQUM1QixJQUFJLENBQUEsT0FBTyxhQUFQLE9BQU8sdUJBQVAsT0FBTyxDQUFFLGVBQWUsS0FBSSxPQUFPLENBQUMsZUFBZSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztnQkFDdEUsbUJBQW1CO2dCQUNuQixPQUFPO29CQUNILFFBQVEsRUFBRSxPQUFPLENBQUMsZUFBZSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDO2lCQUNwRCxDQUFDO1lBQ04sQ0FBQztZQUNELDhCQUE4QjtZQUM5QixPQUFPLENBQUMsSUFBSSxDQUFDLHVCQUF1QixLQUFLLENBQUMsSUFBSSxvRUFBb0UsQ0FBQyxDQUFDO1lBQ3BILE9BQU8sSUFBSSxDQUFDO1FBQ2hCLENBQUM7UUFFRCxzQkFBc0I7UUFDdEIsSUFBSSxDQUFBLEtBQUssYUFBTCxLQUFLLHVCQUFMLEtBQUssQ0FBRSxJQUFJLEtBQUksQ0FDZixJQUFJLEtBQUssV0FBVztZQUNwQixJQUFJLEtBQUssY0FBYztZQUN2QixJQUFJLEtBQUssZ0JBQWdCO1lBQ3pCLElBQUksS0FBSyxhQUFhO1lBQ3RCLElBQUksS0FBSyxrQkFBa0I7WUFDM0IsSUFBSSxLQUFLLGNBQWM7WUFDdkIsSUFBSSxLQUFLLFNBQVM7WUFDbEIsSUFBSSxLQUFLLFVBQVUsQ0FDdEIsRUFBRSxDQUFDO1lBQ0EscUJBQXFCO1lBQ3JCLE1BQU0sU0FBUyxHQUFHLElBQUksS0FBSyxXQUFXLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDMUYsT0FBTztnQkFDSCxVQUFVLEVBQUUsU0FBUztnQkFDckIsa0JBQWtCLEVBQUUsSUFBSTthQUMzQixDQUFDO1FBQ04sQ0FBQztRQUVELHlDQUF5QztRQUN6QyxJQUFJLENBQUEsS0FBSyxhQUFMLEtBQUssdUJBQUwsS0FBSyxDQUFFLElBQUksS0FBSSxDQUFDLElBQUksS0FBSyxjQUFjO1lBQ3ZDLElBQUksS0FBSyxVQUFVLElBQUksSUFBSSxLQUFLLFdBQVcsSUFBSSxJQUFJLEtBQUssV0FBVztZQUNuRSxJQUFJLEtBQUssZ0JBQWdCLElBQUksSUFBSSxLQUFLLGdCQUFnQjtZQUN0RCxJQUFJLEtBQUssa0JBQWtCLElBQUksSUFBSSxLQUFLLGNBQWM7WUFDdEQsSUFBSSxLQUFLLGdCQUFnQixJQUFJLENBQUMsQ0FBQSxJQUFJLGFBQUosSUFBSSx1QkFBSixJQUFJLENBQUUsVUFBVSxDQUFDLEtBQUssQ0FBQyxLQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztZQUNqRiw2QkFBNkI7WUFDN0IsSUFBSSxDQUFBLE9BQU8sYUFBUCxPQUFPLHVCQUFQLE9BQU8sQ0FBRSxvQkFBb0IsS0FBSSxPQUFPLENBQUMsb0JBQW9CLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO2dCQUNoRixtQkFBbUI7Z0JBQ25CLElBQUEsY0FBUSxFQUFDLHVCQUF1QixJQUFJLFNBQVMsS0FBSyxDQUFDLElBQUksZ0RBQWdELENBQUMsQ0FBQztnQkFDekcsT0FBTztvQkFDSCxRQUFRLEVBQUUsT0FBTyxDQUFDLG9CQUFvQixDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDO2lCQUN6RCxDQUFDO1lBQ04sQ0FBQztZQUNELDhCQUE4QjtZQUM5QixPQUFPLENBQUMsSUFBSSxDQUFDLHVCQUF1QixJQUFJLFNBQVMsS0FBSyxDQUFDLElBQUksb0VBQW9FLENBQUMsQ0FBQztZQUNqSSxPQUFPLElBQUksQ0FBQztRQUNoQixDQUFDO1FBRUQsc0JBQXNCO1FBQ3RCLElBQUksS0FBSyxJQUFJLE9BQU8sS0FBSyxLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQ3JDLElBQUksSUFBSSxLQUFLLFVBQVUsRUFBRSxDQUFDO2dCQUN0QixPQUFPO29CQUNILFVBQVUsRUFBRSxVQUFVO29CQUN0QixHQUFHLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFDckQsR0FBRyxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7b0JBQ3JELEdBQUcsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO29CQUNyRCxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUMsS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHO2lCQUNqRixDQUFDO1lBQ04sQ0FBQztpQkFBTSxJQUFJLElBQUksS0FBSyxTQUFTLEVBQUUsQ0FBQztnQkFDNUIsT0FBTztvQkFDSCxVQUFVLEVBQUUsU0FBUztvQkFDckIsR0FBRyxFQUFFLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQztvQkFDekIsR0FBRyxFQUFFLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQztvQkFDekIsR0FBRyxFQUFFLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQztpQkFDNUIsQ0FBQztZQUNOLENBQUM7aUJBQU0sSUFBSSxJQUFJLEtBQUssU0FBUyxFQUFFLENBQUM7Z0JBQzVCLE9BQU87b0JBQ0gsVUFBVSxFQUFFLFNBQVM7b0JBQ3JCLEdBQUcsRUFBRSxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7b0JBQ3pCLEdBQUcsRUFBRSxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7aUJBQzVCLENBQUM7WUFDTixDQUFDO2lCQUFNLElBQUksSUFBSSxLQUFLLFNBQVMsRUFBRSxDQUFDO2dCQUM1QixPQUFPO29CQUNILFVBQVUsRUFBRSxTQUFTO29CQUNyQixPQUFPLEVBQUUsTUFBTSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDO29CQUNqQyxRQUFRLEVBQUUsTUFBTSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDO2lCQUN0QyxDQUFDO1lBQ04sQ0FBQztpQkFBTSxJQUFJLElBQUksS0FBSyxTQUFTLEVBQUUsQ0FBQztnQkFDNUIsT0FBTztvQkFDSCxVQUFVLEVBQUUsU0FBUztvQkFDckIsR0FBRyxFQUFFLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQztvQkFDekIsR0FBRyxFQUFFLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQztvQkFDekIsR0FBRyxFQUFFLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQztvQkFDekIsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDLEtBQUssU0FBUyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2lCQUNuRCxDQUFDO1lBQ04sQ0FBQztRQUNMLENBQUM7UUFFRCxTQUFTO1FBQ1QsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDdkIsT0FBTztZQUNQLElBQUksQ0FBQSxNQUFBLFFBQVEsQ0FBQyxlQUFlLDBDQUFFLElBQUksTUFBSyxTQUFTLEVBQUUsQ0FBQztnQkFDL0MsT0FBTyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFOztvQkFDcEIsSUFBSSxDQUFBLElBQUksYUFBSixJQUFJLHVCQUFKLElBQUksQ0FBRSxJQUFJLE1BQUksTUFBQSxPQUFPLGFBQVAsT0FBTyx1QkFBUCxPQUFPLENBQUUsZUFBZSwwQ0FBRSxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFBLEVBQUUsQ0FBQzt3QkFDekQsT0FBTyxFQUFFLFFBQVEsRUFBRSxPQUFPLENBQUMsZUFBZSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztvQkFDaEUsQ0FBQztvQkFDRCxPQUFPLElBQUksQ0FBQztnQkFDaEIsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxLQUFLLElBQUksQ0FBQyxDQUFDO1lBQ3JDLENBQUM7WUFFRCxPQUFPO1lBQ1AsSUFBSSxDQUFBLE1BQUEsUUFBUSxDQUFDLGVBQWUsMENBQUUsSUFBSSxLQUFJLFFBQVEsQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO2dCQUNwRixPQUFPLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUU7b0JBQ3BCLElBQUksSUFBSSxhQUFKLElBQUksdUJBQUosSUFBSSxDQUFFLElBQUksRUFBRSxDQUFDO3dCQUNiLE9BQU87NEJBQ0gsVUFBVSxFQUFFLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDOzRCQUM5QyxrQkFBa0IsRUFBRSxRQUFRLENBQUMsZUFBZSxDQUFDLElBQUk7eUJBQ3BELENBQUM7b0JBQ04sQ0FBQztvQkFDRCxPQUFPLElBQUksQ0FBQztnQkFDaEIsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxLQUFLLElBQUksQ0FBQyxDQUFDO1lBQ3JDLENBQUM7WUFFRCxTQUFTO1lBQ1QsT0FBTyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQSxJQUFJLGFBQUosSUFBSSx1QkFBSixJQUFJLENBQUUsS0FBSyxNQUFLLFNBQVMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDNUUsQ0FBQztRQUVELDhCQUE4QjtRQUM5QixJQUFJLEtBQUssSUFBSSxPQUFPLEtBQUssS0FBSyxRQUFRLElBQUksSUFBSSxJQUFJLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUN2RSx1QkFDSSxVQUFVLEVBQUUsSUFBSSxJQUNiLEtBQUssRUFDVjtRQUNOLENBQUM7UUFFRCxPQUFPLEtBQUssQ0FBQztJQUNqQixDQUFDO0lBRUQ7O09BRUc7SUFDSyx3QkFBd0IsQ0FBQyxRQUFhLEVBQUUsZUFBOEIsRUFBRSxRQUFpQjtRQUM3RixtQkFBbUI7UUFDbkIsMERBQTBEOztRQUUxRCxZQUFZO1FBQ1osTUFBTSxRQUFRLEdBQUcsQ0FBQyxJQUFTLEVBQUUsRUFBRTtZQUMzQixJQUFJLENBQUEsSUFBSSxhQUFKLElBQUksdUJBQUosSUFBSSxDQUFFLEtBQUssTUFBSyxTQUFTO2dCQUFFLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQztZQUNqRCxJQUFJLElBQUksS0FBSyxTQUFTO2dCQUFFLE9BQU8sSUFBSSxDQUFDO1lBQ3BDLE9BQU8sSUFBSSxDQUFDO1FBQ2hCLENBQUMsQ0FBQztRQUVGLE1BQU0sUUFBUSxHQUFHLFFBQVEsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLElBQUksUUFBUSxDQUFDLE1BQUEsUUFBUSxDQUFDLEtBQUssMENBQUUsUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDO1FBQzNHLE1BQU0sUUFBUSxHQUFHLFFBQVEsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLElBQUksUUFBUSxDQUFDLE1BQUEsUUFBUSxDQUFDLEtBQUssMENBQUUsUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUM7UUFDakgsTUFBTSxLQUFLLEdBQUcsUUFBUSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsSUFBSSxRQUFRLENBQUMsTUFBQSxRQUFRLENBQUMsS0FBSywwQ0FBRSxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUM7UUFDbEcsTUFBTSxNQUFNLEdBQUcsTUFBQSxNQUFBLFFBQVEsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLG1DQUFJLFFBQVEsQ0FBQyxNQUFBLFFBQVEsQ0FBQyxLQUFLLDBDQUFFLE1BQU0sQ0FBQyxtQ0FBSSxJQUFJLENBQUM7UUFDckYsTUFBTSxJQUFJLEdBQUcsUUFBUSxJQUFJLFFBQVEsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLElBQUksUUFBUSxDQUFDLE1BQUEsUUFBUSxDQUFDLEtBQUssMENBQUUsSUFBSSxDQUFDLElBQUksTUFBTSxDQUFDO1FBQzdGLE1BQU0sS0FBSyxHQUFHLFFBQVEsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLElBQUksUUFBUSxDQUFDLE1BQUEsUUFBUSxDQUFDLEtBQUssMENBQUUsS0FBSyxDQUFDLElBQUksVUFBVSxDQUFDO1FBRXhGLE9B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Y0FBUSxFQUFDLGlCQUFpQixDQUFDLENBQUM7WUFDNUIsSUFBQSxjQUFRLEVBQUMsYUFBYSxlQUFlLEVBQUUsQ0FBQyxDQUFDO1lBQ3pDLElBQUEsY0FBUSxFQUFDLGNBQWMsUUFBUSxFQUFFLENBQUMsQ0FBQztZQUNuQyxJQUFBLGNBQVEsRUFBQyxhQUFhLFVBQVUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO1lBQzNDLElBQUEsY0FBUSxFQUFDLGFBQWEsVUFBVSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBRS9DLE9BQU8sRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLENBQUM7UUFDN0IsQ0FBQztRQUFDLE9BQU8sS0FBVSxFQUFFLENBQUM7WUFDbEIsT0FBTyxDQUFDLEtBQUssQ0FBQyxhQUFhLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDcEMsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNwRCxDQUFDO0lBQ0wsQ0FBQztDQUVKO0FBdnRFRCxrQ0F1dEVDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgVG9vbERlZmluaXRpb24sIFRvb2xSZXNwb25zZSwgVG9vbEV4ZWN1dG9yLCBQcmVmYWJJbmZvIH0gZnJvbSAnLi4vdHlwZXMnO1xuaW1wb3J0IHsgZGVidWdMb2cgfSBmcm9tICcuLi9saWIvbG9nJztcbmltcG9ydCB7IHosIHRvSW5wdXRTY2hlbWEsIHZhbGlkYXRlQXJncyB9IGZyb20gJy4uL2xpYi9zY2hlbWEnO1xuaW1wb3J0IHsgcnVuU2NlbmVNZXRob2RBc1Rvb2xSZXNwb25zZSB9IGZyb20gJy4uL2xpYi9zY2VuZS1icmlkZ2UnO1xuXG5jb25zdCBwcmVmYWJQb3NpdGlvblNjaGVtYSA9IHoub2JqZWN0KHtcbiAgICB4OiB6Lm51bWJlcigpLm9wdGlvbmFsKCksXG4gICAgeTogei5udW1iZXIoKS5vcHRpb25hbCgpLFxuICAgIHo6IHoubnVtYmVyKCkub3B0aW9uYWwoKSxcbn0pO1xuXG5jb25zdCBwcmVmYWJTY2hlbWFzID0ge1xuICAgIGdldF9wcmVmYWJfbGlzdDogei5vYmplY3Qoe1xuICAgICAgICBmb2xkZXI6IHouc3RyaW5nKCkuZGVmYXVsdCgnZGI6Ly9hc3NldHMnKS5kZXNjcmliZSgnRm9sZGVyIHBhdGggdG8gc2VhcmNoIChvcHRpb25hbCknKSxcbiAgICB9KSxcbiAgICBsb2FkX3ByZWZhYjogei5vYmplY3Qoe1xuICAgICAgICBwcmVmYWJQYXRoOiB6LnN0cmluZygpLmRlc2NyaWJlKCdQcmVmYWIgYXNzZXQgcGF0aCcpLFxuICAgIH0pLFxuICAgIGluc3RhbnRpYXRlX3ByZWZhYjogei5vYmplY3Qoe1xuICAgICAgICBwcmVmYWJQYXRoOiB6LnN0cmluZygpLmRlc2NyaWJlKCdQcmVmYWIgYXNzZXQgcGF0aCcpLFxuICAgICAgICBwYXJlbnRVdWlkOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1BhcmVudCBub2RlIFVVSUQgKG9wdGlvbmFsKScpLFxuICAgICAgICBwb3NpdGlvbjogcHJlZmFiUG9zaXRpb25TY2hlbWEub3B0aW9uYWwoKS5kZXNjcmliZSgnSW5pdGlhbCBwb3NpdGlvbicpLFxuICAgIH0pLFxuICAgIGNyZWF0ZV9wcmVmYWI6IHoub2JqZWN0KHtcbiAgICAgICAgbm9kZVV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1NvdXJjZSBub2RlIFVVSUQnKSxcbiAgICAgICAgc2F2ZVBhdGg6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1BhdGggdG8gc2F2ZSB0aGUgcHJlZmFiIChlLmcuLCBkYjovL2Fzc2V0cy9wcmVmYWJzL015UHJlZmFiLnByZWZhYiknKSxcbiAgICAgICAgcHJlZmFiTmFtZTogei5zdHJpbmcoKS5kZXNjcmliZSgnUHJlZmFiIG5hbWUnKSxcbiAgICB9KSxcbiAgICB1cGRhdGVfcHJlZmFiOiB6Lm9iamVjdCh7XG4gICAgICAgIHByZWZhYlBhdGg6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1ByZWZhYiBhc3NldCBwYXRoJyksXG4gICAgICAgIG5vZGVVdWlkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdOb2RlIFVVSUQgd2l0aCBjaGFuZ2VzJyksXG4gICAgfSksXG4gICAgcmV2ZXJ0X3ByZWZhYjogei5vYmplY3Qoe1xuICAgICAgICBub2RlVXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnUHJlZmFiIGluc3RhbmNlIG5vZGUgVVVJRCcpLFxuICAgIH0pLFxuICAgIGdldF9wcmVmYWJfaW5mbzogei5vYmplY3Qoe1xuICAgICAgICBwcmVmYWJQYXRoOiB6LnN0cmluZygpLmRlc2NyaWJlKCdQcmVmYWIgYXNzZXQgcGF0aCcpLFxuICAgIH0pLFxuICAgIHZhbGlkYXRlX3ByZWZhYjogei5vYmplY3Qoe1xuICAgICAgICBwcmVmYWJQYXRoOiB6LnN0cmluZygpLmRlc2NyaWJlKCdQcmVmYWIgYXNzZXQgcGF0aCcpLFxuICAgIH0pLFxuICAgIGR1cGxpY2F0ZV9wcmVmYWI6IHoub2JqZWN0KHtcbiAgICAgICAgc291cmNlUHJlZmFiUGF0aDogei5zdHJpbmcoKS5kZXNjcmliZSgnU291cmNlIHByZWZhYiBwYXRoJyksXG4gICAgICAgIHRhcmdldFByZWZhYlBhdGg6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1RhcmdldCBwcmVmYWIgcGF0aCcpLFxuICAgICAgICBuZXdQcmVmYWJOYW1lOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ05ldyBwcmVmYWIgbmFtZScpLFxuICAgIH0pLFxuICAgIHJlc3RvcmVfcHJlZmFiX25vZGU6IHoub2JqZWN0KHtcbiAgICAgICAgbm9kZVV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1ByZWZhYiBpbnN0YW5jZSBub2RlIFVVSUQnKSxcbiAgICAgICAgYXNzZXRVdWlkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdQcmVmYWIgYXNzZXQgVVVJRCcpLFxuICAgIH0pLFxuICAgIGxpbmtfcHJlZmFiOiB6Lm9iamVjdCh7XG4gICAgICAgIG5vZGVVdWlkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdOb2RlIFVVSUQgdG8gY29ubmVjdCB0byBhIHByZWZhYiBhc3NldCcpLFxuICAgICAgICBhc3NldFV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1ByZWZhYiBhc3NldCBVVUlEIHRvIGxpbmsgdGhlIG5vZGUgdG8nKSxcbiAgICB9KSxcbiAgICB1bmxpbmtfcHJlZmFiOiB6Lm9iamVjdCh7XG4gICAgICAgIG5vZGVVdWlkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdQcmVmYWIgaW5zdGFuY2Ugbm9kZSBVVUlEIHRvIGRldGFjaCcpLFxuICAgICAgICByZW1vdmVOZXN0ZWQ6IHouYm9vbGVhbigpLmRlZmF1bHQoZmFsc2UpLmRlc2NyaWJlKCdXaGV0aGVyIHRvIGFsc28gdW5saW5rIG5lc3RlZCBwcmVmYWIgaW5zdGFuY2VzIHVuZGVyIHRoaXMgbm9kZScpLFxuICAgIH0pLFxuICAgIGdldF9wcmVmYWJfZGF0YTogei5vYmplY3Qoe1xuICAgICAgICBub2RlVXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnUHJlZmFiIGluc3RhbmNlIG5vZGUgVVVJRCcpLFxuICAgIH0pLFxufSBhcyBjb25zdDtcblxuY29uc3QgcHJlZmFiVG9vbE1ldGE6IFJlY29yZDxrZXlvZiB0eXBlb2YgcHJlZmFiU2NoZW1hcywgc3RyaW5nPiA9IHtcbiAgICBnZXRfcHJlZmFiX2xpc3Q6ICdHZXQgYWxsIHByZWZhYnMgaW4gdGhlIHByb2plY3QnLFxuICAgIGxvYWRfcHJlZmFiOiAnTG9hZCBhIHByZWZhYiBieSBwYXRoJyxcbiAgICBpbnN0YW50aWF0ZV9wcmVmYWI6ICdJbnN0YW50aWF0ZSBhIHByZWZhYiBpbiB0aGUgc2NlbmUnLFxuICAgIGNyZWF0ZV9wcmVmYWI6ICdDcmVhdGUgYSBwcmVmYWIgZnJvbSBhIG5vZGUgd2l0aCBhbGwgY2hpbGRyZW4gYW5kIGNvbXBvbmVudHMnLFxuICAgIHVwZGF0ZV9wcmVmYWI6ICdBcHBseSBwcmVmYWIgaW5zdGFuY2UgZWRpdHMgYmFjayB0byB0aGUgcHJlZmFiIGFzc2V0IChjY2UuU2NlbmVGYWNhZGUuYXBwbHlQcmVmYWIpJyxcbiAgICByZXZlcnRfcHJlZmFiOiAnUmV2ZXJ0IHByZWZhYiBpbnN0YW5jZSB0byBvcmlnaW5hbCcsXG4gICAgZ2V0X3ByZWZhYl9pbmZvOiAnR2V0IGRldGFpbGVkIHByZWZhYiBpbmZvcm1hdGlvbicsXG4gICAgdmFsaWRhdGVfcHJlZmFiOiAnVmFsaWRhdGUgYSBwcmVmYWIgZmlsZSBmb3JtYXQnLFxuICAgIGR1cGxpY2F0ZV9wcmVmYWI6ICdEdXBsaWNhdGUgYW4gZXhpc3RpbmcgcHJlZmFiJyxcbiAgICByZXN0b3JlX3ByZWZhYl9ub2RlOiAnUmVzdG9yZSBwcmVmYWIgbm9kZSB1c2luZyBwcmVmYWIgYXNzZXQgKGJ1aWx0LWluIHVuZG8gcmVjb3JkKScsXG4gICAgbGlua19wcmVmYWI6ICdDb25uZWN0IGEgcmVndWxhciBub2RlIHRvIGEgcHJlZmFiIGFzc2V0IChjY2UuU2NlbmVGYWNhZGUubGlua1ByZWZhYiknLFxuICAgIHVubGlua19wcmVmYWI6ICdCcmVhayBhIHByZWZhYiBpbnN0YW5jZSBsaW5rLCBvcHRpb25hbGx5IGNsZWFyaW5nIG5lc3RlZCBpbnN0YW5jZXMgKGNjZS5TY2VuZUZhY2FkZS51bmxpbmtQcmVmYWIpJyxcbiAgICBnZXRfcHJlZmFiX2RhdGE6ICdSZWFkIHRoZSBwcmVmYWIgZHVtcCBmb3IgYSBwcmVmYWIgaW5zdGFuY2Ugbm9kZSAoY2NlLlNjZW5lRmFjYWRlLmdldFByZWZhYkRhdGEpJyxcbn07XG5cbmV4cG9ydCBjbGFzcyBQcmVmYWJUb29scyBpbXBsZW1lbnRzIFRvb2xFeGVjdXRvciB7XG4gICAgZ2V0VG9vbHMoKTogVG9vbERlZmluaXRpb25bXSB7XG4gICAgICAgIHJldHVybiAoT2JqZWN0LmtleXMocHJlZmFiU2NoZW1hcykgYXMgQXJyYXk8a2V5b2YgdHlwZW9mIHByZWZhYlNjaGVtYXM+KS5tYXAobmFtZSA9PiAoe1xuICAgICAgICAgICAgbmFtZSxcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBwcmVmYWJUb29sTWV0YVtuYW1lXSxcbiAgICAgICAgICAgIGlucHV0U2NoZW1hOiB0b0lucHV0U2NoZW1hKHByZWZhYlNjaGVtYXNbbmFtZV0pLFxuICAgICAgICB9KSk7XG4gICAgfVxuXG4gICAgYXN5bmMgZXhlY3V0ZSh0b29sTmFtZTogc3RyaW5nLCBhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBzY2hlbWFOYW1lID0gdG9vbE5hbWUgYXMga2V5b2YgdHlwZW9mIHByZWZhYlNjaGVtYXM7XG4gICAgICAgIGNvbnN0IHNjaGVtYSA9IHByZWZhYlNjaGVtYXNbc2NoZW1hTmFtZV07XG4gICAgICAgIGlmICghc2NoZW1hKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gdG9vbDogJHt0b29sTmFtZX1gKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCB2YWxpZGF0aW9uID0gdmFsaWRhdGVBcmdzKHNjaGVtYSwgYXJncyA/PyB7fSk7XG4gICAgICAgIGlmICghdmFsaWRhdGlvbi5vaykge1xuICAgICAgICAgICAgcmV0dXJuIHZhbGlkYXRpb24ucmVzcG9uc2U7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgYSA9IHZhbGlkYXRpb24uZGF0YSBhcyBhbnk7XG5cbiAgICAgICAgc3dpdGNoIChzY2hlbWFOYW1lKSB7XG4gICAgICAgICAgICBjYXNlICdnZXRfcHJlZmFiX2xpc3QnOlxuICAgICAgICAgICAgICAgIHJldHVybiBhd2FpdCB0aGlzLmdldFByZWZhYkxpc3QoYS5mb2xkZXIpO1xuICAgICAgICAgICAgY2FzZSAnbG9hZF9wcmVmYWInOlxuICAgICAgICAgICAgICAgIHJldHVybiBhd2FpdCB0aGlzLmxvYWRQcmVmYWIoYS5wcmVmYWJQYXRoKTtcbiAgICAgICAgICAgIGNhc2UgJ2luc3RhbnRpYXRlX3ByZWZhYic6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuaW5zdGFudGlhdGVQcmVmYWIoYSk7XG4gICAgICAgICAgICBjYXNlICdjcmVhdGVfcHJlZmFiJzpcbiAgICAgICAgICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5jcmVhdGVQcmVmYWIoYSk7XG4gICAgICAgICAgICBjYXNlICd1cGRhdGVfcHJlZmFiJzpcbiAgICAgICAgICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy51cGRhdGVQcmVmYWIoYS5wcmVmYWJQYXRoLCBhLm5vZGVVdWlkKTtcbiAgICAgICAgICAgIGNhc2UgJ3JldmVydF9wcmVmYWInOlxuICAgICAgICAgICAgICAgIHJldHVybiBhd2FpdCB0aGlzLnJldmVydFByZWZhYihhLm5vZGVVdWlkKTtcbiAgICAgICAgICAgIGNhc2UgJ2dldF9wcmVmYWJfaW5mbyc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuZ2V0UHJlZmFiSW5mbyhhLnByZWZhYlBhdGgpO1xuICAgICAgICAgICAgY2FzZSAndmFsaWRhdGVfcHJlZmFiJzpcbiAgICAgICAgICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy52YWxpZGF0ZVByZWZhYihhLnByZWZhYlBhdGgpO1xuICAgICAgICAgICAgY2FzZSAnZHVwbGljYXRlX3ByZWZhYic6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuZHVwbGljYXRlUHJlZmFiKGEpO1xuICAgICAgICAgICAgY2FzZSAncmVzdG9yZV9wcmVmYWJfbm9kZSc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMucmVzdG9yZVByZWZhYk5vZGUoYS5ub2RlVXVpZCwgYS5hc3NldFV1aWQpO1xuICAgICAgICAgICAgY2FzZSAnbGlua19wcmVmYWInOlxuICAgICAgICAgICAgICAgIHJldHVybiBhd2FpdCB0aGlzLmxpbmtQcmVmYWIoYS5ub2RlVXVpZCwgYS5hc3NldFV1aWQpO1xuICAgICAgICAgICAgY2FzZSAndW5saW5rX3ByZWZhYic6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMudW5saW5rUHJlZmFiKGEubm9kZVV1aWQsIGEucmVtb3ZlTmVzdGVkKTtcbiAgICAgICAgICAgIGNhc2UgJ2dldF9wcmVmYWJfZGF0YSc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuZ2V0UHJlZmFiRGF0YShhLm5vZGVVdWlkKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2V0UHJlZmFiTGlzdChmb2xkZXI6IHN0cmluZyA9ICdkYjovL2Fzc2V0cycpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHBhdHRlcm4gPSBmb2xkZXIuZW5kc1dpdGgoJy8nKSA/IFxuICAgICAgICAgICAgICAgIGAke2ZvbGRlcn0qKi8qLnByZWZhYmAgOiBgJHtmb2xkZXJ9LyoqLyoucHJlZmFiYDtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXRzJywge1xuICAgICAgICAgICAgICAgIHBhdHRlcm46IHBhdHRlcm5cbiAgICAgICAgICAgIH0pLnRoZW4oKHJlc3VsdHM6IGFueVtdKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgcHJlZmFiczogUHJlZmFiSW5mb1tdID0gcmVzdWx0cy5tYXAoYXNzZXQgPT4gKHtcbiAgICAgICAgICAgICAgICAgICAgbmFtZTogYXNzZXQubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgcGF0aDogYXNzZXQudXJsLFxuICAgICAgICAgICAgICAgICAgICB1dWlkOiBhc3NldC51dWlkLFxuICAgICAgICAgICAgICAgICAgICBmb2xkZXI6IGFzc2V0LnVybC5zdWJzdHJpbmcoMCwgYXNzZXQudXJsLmxhc3RJbmRleE9mKCcvJykpXG4gICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgICAgIHJlc29sdmUoeyBzdWNjZXNzOiB0cnVlLCBkYXRhOiBwcmVmYWJzIH0pO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGxvYWRQcmVmYWIocHJlZmFiUGF0aDogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgLy8gT3JpZ2luYWwgaW1wbGVtZW50YXRpb24gY2FsbGVkIHNjZW5lIGBsb2FkLWFzc2V0YCwgd2hpY2ggaXMgbm90IGEgcmVhbFxuICAgICAgICAvLyBjaGFubmVsIG9uIHRoZSBzY2VuZSBtb2R1bGUgcGVyIEBjb2Nvcy9jcmVhdG9yLXR5cGVzLiBUaGVyZSBpcyBub1xuICAgICAgICAvLyBnZW5lcmljIFwibG9hZCBhIHByZWZhYiB3aXRob3V0IGluc3RhbnRpYXRpbmdcIiBvcGVyYXRpb24gZXhwb3NlZCB0b1xuICAgICAgICAvLyBlZGl0b3IgZXh0ZW5zaW9ucy4gUmV0dXJuIHRoZSBhc3NldCBtZXRhZGF0YSB2aWEgYXNzZXQtZGIgaW5zdGVhZDtcbiAgICAgICAgLy8gY2FsbGVycyB3aG8gYWN0dWFsbHkgd2FudCB0aGUgcHJlZmFiIGluIHRoZSBzY2VuZSBzaG91bGQgdXNlXG4gICAgICAgIC8vIGluc3RhbnRpYXRlX3ByZWZhYi5cbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldC1pbmZvJywgcHJlZmFiUGF0aCkudGhlbigoYXNzZXRJbmZvOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoIWFzc2V0SW5mbykge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgUHJlZmFiIG5vdCBmb3VuZDogJHtwcmVmYWJQYXRofWAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IGFzc2V0SW5mby51dWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogYXNzZXRJbmZvLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICB1cmw6IGFzc2V0SW5mby51cmwsXG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiBhc3NldEluZm8udHlwZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHNvdXJjZTogYXNzZXRJbmZvLnNvdXJjZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdQcmVmYWIgbWV0YWRhdGEgcmV0cmlldmVkIChpbnN0YW50aWF0ZV9wcmVmYWIgdG8gYWRkIGl0IHRvIHRoZSBzY2VuZSknLFxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGluc3RhbnRpYXRlUHJlZmFiKGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZShhc3luYyAocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAvLyDojrflj5bpooTliLbkvZPotYTmupDkv6Hmga9cbiAgICAgICAgICAgICAgICBjb25zdCBhc3NldEluZm8gPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldC1pbmZvJywgYXJncy5wcmVmYWJQYXRoKTtcbiAgICAgICAgICAgICAgICBpZiAoIWFzc2V0SW5mbykge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ+mihOWItuS9k+acquaJvuWIsCcpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIOS9v+eUqOato+ehrueahCBjcmVhdGUtbm9kZSBBUEkg5LuO6aKE5Yi25L2T6LWE5rqQ5a6e5L6L5YyWXG4gICAgICAgICAgICAgICAgY29uc3QgY3JlYXRlTm9kZU9wdGlvbnM6IGFueSA9IHtcbiAgICAgICAgICAgICAgICAgICAgYXNzZXRVdWlkOiBhc3NldEluZm8udXVpZFxuICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgICAvLyDorr7nva7niLboioLngrlcbiAgICAgICAgICAgICAgICBpZiAoYXJncy5wYXJlbnRVdWlkKSB7XG4gICAgICAgICAgICAgICAgICAgIGNyZWF0ZU5vZGVPcHRpb25zLnBhcmVudCA9IGFyZ3MucGFyZW50VXVpZDtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyDorr7nva7oioLngrnlkI3np7BcbiAgICAgICAgICAgICAgICBpZiAoYXJncy5uYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgIGNyZWF0ZU5vZGVPcHRpb25zLm5hbWUgPSBhcmdzLm5hbWU7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChhc3NldEluZm8ubmFtZSkge1xuICAgICAgICAgICAgICAgICAgICBjcmVhdGVOb2RlT3B0aW9ucy5uYW1lID0gYXNzZXRJbmZvLm5hbWU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8g6K6+572u5Yid5aeL5bGe5oCn77yI5aaC5L2N572u77yJXG4gICAgICAgICAgICAgICAgaWYgKGFyZ3MucG9zaXRpb24pIHtcbiAgICAgICAgICAgICAgICAgICAgY3JlYXRlTm9kZU9wdGlvbnMuZHVtcCA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHBvc2l0aW9uOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWU6IGFyZ3MucG9zaXRpb25cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyDliJvlu7roioLngrlcbiAgICAgICAgICAgICAgICBjb25zdCBub2RlVXVpZCA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ2NyZWF0ZS1ub2RlJywgY3JlYXRlTm9kZU9wdGlvbnMpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHV1aWQgPSBBcnJheS5pc0FycmF5KG5vZGVVdWlkKSA/IG5vZGVVdWlkWzBdIDogbm9kZVV1aWQ7XG5cbiAgICAgICAgICAgICAgICAvLyDms6jmhI/vvJpjcmVhdGUtbm9kZSBBUEnku47pooTliLbkvZPotYTmupDliJvlu7rml7blupTor6Xoh6rliqjlu7rnq4vpooTliLbkvZPlhbPogZRcbiAgICAgICAgICAgICAgICBkZWJ1Z0xvZygn6aKE5Yi25L2T6IqC54K55Yib5bu65oiQ5YqfOicsIHtcbiAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWQ6IHV1aWQsXG4gICAgICAgICAgICAgICAgICAgIHByZWZhYlV1aWQ6IGFzc2V0SW5mby51dWlkLFxuICAgICAgICAgICAgICAgICAgICBwcmVmYWJQYXRoOiBhcmdzLnByZWZhYlBhdGhcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWQ6IHV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBwcmVmYWJQYXRoOiBhcmdzLnByZWZhYlBhdGgsXG4gICAgICAgICAgICAgICAgICAgICAgICBwYXJlbnRVdWlkOiBhcmdzLnBhcmVudFV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBwb3NpdGlvbjogYXJncy5wb3NpdGlvbixcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICfpooTliLbkvZPlrp7kvovljJbmiJDlip/vvIzlt7Llu7rnq4vpooTliLbkvZPlhbPogZQnXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7IFxuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSwgXG4gICAgICAgICAgICAgICAgICAgIGVycm9yOiBg6aKE5Yi25L2T5a6e5L6L5YyW5aSx6LSlOiAke2Vyci5tZXNzYWdlfWAsXG4gICAgICAgICAgICAgICAgICAgIGluc3RydWN0aW9uOiAn6K+35qOA5p+l6aKE5Yi25L2T6Lev5b6E5piv5ZCm5q2j56Gu77yM56Gu5L+d6aKE5Yi25L2T5paH5Lu25qC85byP5q2j56GuJ1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHRyeUNyZWF0ZU5vZGVXaXRoUHJlZmFiKGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXQtaW5mbycsIGFyZ3MucHJlZmFiUGF0aCkudGhlbigoYXNzZXRJbmZvOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoIWFzc2V0SW5mbykge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ+mihOWItuS9k+acquaJvuWIsCcpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIOaWueazlTI6IOS9v+eUqCBjcmVhdGUtbm9kZSDmjIflrprpooTliLbkvZPotYTmupBcbiAgICAgICAgICAgICAgICBjb25zdCBjcmVhdGVOb2RlT3B0aW9uczogYW55ID0ge1xuICAgICAgICAgICAgICAgICAgICBhc3NldFV1aWQ6IGFzc2V0SW5mby51dWlkXG4gICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgIC8vIOiuvue9rueItuiKgueCuVxuICAgICAgICAgICAgICAgIGlmIChhcmdzLnBhcmVudFV1aWQpIHtcbiAgICAgICAgICAgICAgICAgICAgY3JlYXRlTm9kZU9wdGlvbnMucGFyZW50ID0gYXJncy5wYXJlbnRVdWlkO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJldHVybiBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdjcmVhdGUtbm9kZScsIGNyZWF0ZU5vZGVPcHRpb25zKTtcbiAgICAgICAgICAgIH0pLnRoZW4oKG5vZGVVdWlkOiBzdHJpbmcgfCBzdHJpbmdbXSkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHV1aWQgPSBBcnJheS5pc0FycmF5KG5vZGVVdWlkKSA/IG5vZGVVdWlkWzBdIDogbm9kZVV1aWQ7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgLy8g5aaC5p6c5oyH5a6a5LqG5L2N572u77yM6K6+572u6IqC54K55L2N572uXG4gICAgICAgICAgICAgICAgaWYgKGFyZ3MucG9zaXRpb24gJiYgdXVpZCkge1xuICAgICAgICAgICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdzZXQtcHJvcGVydHknLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiB1dWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgcGF0aDogJ3Bvc2l0aW9uJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGR1bXA6IHsgdmFsdWU6IGFyZ3MucG9zaXRpb24gfVxuICAgICAgICAgICAgICAgICAgICB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBub2RlVXVpZDogdXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJlZmFiUGF0aDogYXJncy5wcmVmYWJQYXRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwb3NpdGlvbjogYXJncy5wb3NpdGlvbixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogJ+mihOWItuS9k+WunuS+i+WMluaIkOWKn++8iOWkh+eUqOaWueazle+8ieW5tuiuvue9ruS6huS9jee9ridcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfSkuY2F0Y2goKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5vZGVVdWlkOiB1dWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcmVmYWJQYXRoOiBhcmdzLnByZWZhYlBhdGgsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICfpooTliLbkvZPlrp7kvovljJbmiJDlip/vvIjlpIfnlKjmlrnms5XvvInkvYbkvY3nva7orr7nva7lpLHotKUnXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBub2RlVXVpZDogdXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcmVmYWJQYXRoOiBhcmdzLnByZWZhYlBhdGgsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogJ+mihOWItuS9k+WunuS+i+WMluaIkOWKn++8iOWkh+eUqOaWueazle+8iSdcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIGVycm9yOiBg5aSH55So6aKE5Yi25L2T5a6e5L6L5YyW5pa55rOV5Lmf5aSx6LSlOiAke2Vyci5tZXNzYWdlfWBcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGNyZWF0ZVByZWZhYihhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoYXN5bmMgKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgLy8g5pSv5oyBIHByZWZhYlBhdGgg5ZKMIHNhdmVQYXRoIOS4pOenjeWPguaVsOWQjVxuICAgICAgICAgICAgICAgIGNvbnN0IHBhdGhQYXJhbSA9IGFyZ3MucHJlZmFiUGF0aCB8fCBhcmdzLnNhdmVQYXRoO1xuICAgICAgICAgICAgICAgIGlmICghcGF0aFBhcmFtKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgICAgICBlcnJvcjogJ+e8uuWwkemihOWItuS9k+i3r+W+hOWPguaVsOOAguivt+aPkOS+myBwcmVmYWJQYXRoIOaIliBzYXZlUGF0aOOAgidcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBjb25zdCBwcmVmYWJOYW1lID0gYXJncy5wcmVmYWJOYW1lIHx8ICdOZXdQcmVmYWInO1xuICAgICAgICAgICAgICAgIGNvbnN0IGZ1bGxQYXRoID0gcGF0aFBhcmFtLmVuZHNXaXRoKCcucHJlZmFiJykgP1xuICAgICAgICAgICAgICAgICAgICBwYXRoUGFyYW0gOiBgJHtwYXRoUGFyYW19LyR7cHJlZmFiTmFtZX0ucHJlZmFiYDtcblxuICAgICAgICAgICAgICAgIC8vIFRoZSBvZmZpY2lhbCBzY2VuZS1mYWNhZGUgcGF0aCAoY2NlLlByZWZhYi5jcmVhdGVQcmVmYWIgdmlhXG4gICAgICAgICAgICAgICAgLy8gZXhlY3V0ZS1zY2VuZS1zY3JpcHQpLiBUaGUgbGVnYWN5IGhhbmQtcm9sbGVkIEpTT04gZmFsbGJhY2tcbiAgICAgICAgICAgICAgICAvLyAoY3JlYXRlUHJlZmFiV2l0aEFzc2V0REIgLyBjcmVhdGVQcmVmYWJOYXRpdmUgLyBjcmVhdGVQcmVmYWJDdXN0b20sXG4gICAgICAgICAgICAgICAgLy8gfjI1MCBzb3VyY2UgbGluZXMpIHdhcyByZW1vdmVkIGluIHYyLjEuMyDigJQgc2VlIGNvbW1pdCA1NDcxMTViXG4gICAgICAgICAgICAgICAgLy8gZm9yIHRoZSBwcmUtcmVtb3ZhbCBzb3VyY2UgaWYgYSBmdXR1cmUgQ29jb3MgQ3JlYXRvciBidWlsZFxuICAgICAgICAgICAgICAgIC8vIGJyZWFrcyB0aGUgZmFjYWRlIHBhdGguIFRoZSBmYWNhZGUgaGFzIGJlZW4gdGhlIG9ubHkgcGF0aFxuICAgICAgICAgICAgICAgIC8vIGV4ZXJjaXNlZCBpbiB2Mi4xLjEgLyB2Mi4xLjIgcmVhbC1lZGl0b3IgdGVzdGluZyBhY3Jvc3NcbiAgICAgICAgICAgICAgICAvLyBzaW1wbGUgYW5kIGNvbXBsZXggKG5lc3RlZCArIG11bHRpLWNvbXBvbmVudCkgcHJlZmFiIGZvcm1zLlxuICAgICAgICAgICAgICAgIGRlYnVnTG9nKCdDYWxsaW5nIHNjZW5lLXNjcmlwdCBjY2UuUHJlZmFiLmNyZWF0ZVByZWZhYi4uLicpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGZhY2FkZVJlc3VsdCA9IGF3YWl0IHJ1blNjZW5lTWV0aG9kQXNUb29sUmVzcG9uc2UoJ2NyZWF0ZVByZWZhYkZyb21Ob2RlJywgW2FyZ3Mubm9kZVV1aWQsIGZ1bGxQYXRoXSk7XG4gICAgICAgICAgICAgICAgaWYgKCFmYWNhZGVSZXN1bHQuc3VjY2Vzcykge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKGZhY2FkZVJlc3VsdCk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncmVmcmVzaC1hc3NldCcsIGZ1bGxQYXRoKTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChyZWZyZXNoRXJyOiBhbnkpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYHJlZnJlc2gtYXNzZXQgYWZ0ZXIgZmFjYWRlIGNyZWF0ZVByZWZhYiBmYWlsZWQgKG5vbi1mYXRhbCk6ICR7cmVmcmVzaEVycj8ubWVzc2FnZSA/PyByZWZyZXNoRXJyfWApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgLi4uZmFjYWRlUmVzdWx0LFxuICAgICAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAuLi4oZmFjYWRlUmVzdWx0LmRhdGEgPz8ge30pLFxuICAgICAgICAgICAgICAgICAgICAgICAgcHJlZmFiTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHByZWZhYlBhdGg6IGZ1bGxQYXRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWV0aG9kOiAnc2NlbmUtZmFjYWRlJyxcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICBlcnJvcjogYOWIm+W7uumihOWItuS9k+aXtuWPkeeUn+mUmeivrzogJHtlcnJvcn1gXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2V0Tm9kZURhdGEobm9kZVV1aWQ6IHN0cmluZyk6IFByb21pc2U8YW55PiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZShhc3luYyAocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAvLyDpppblhYjojrflj5bln7rmnKzoioLngrnkv6Hmga9cbiAgICAgICAgICAgICAgICBjb25zdCBub2RlSW5mbyA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LW5vZGUnLCBub2RlVXVpZCk7XG4gICAgICAgICAgICAgICAgaWYgKCFub2RlSW5mbykge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKG51bGwpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgZGVidWdMb2coYOiOt+WPluiKgueCuSAke25vZGVVdWlkfSDnmoTln7rmnKzkv6Hmga/miJDlip9gKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAvLyDkvb/nlKhxdWVyeS1ub2RlLXRyZWXojrflj5bljIXlkKvlrZDoioLngrnnmoTlrozmlbTnu5PmnoRcbiAgICAgICAgICAgICAgICBjb25zdCBub2RlVHJlZSA9IGF3YWl0IHRoaXMuZ2V0Tm9kZVdpdGhDaGlsZHJlbihub2RlVXVpZCk7XG4gICAgICAgICAgICAgICAgaWYgKG5vZGVUcmVlKSB7XG4gICAgICAgICAgICAgICAgICAgIGRlYnVnTG9nKGDojrflj5boioLngrkgJHtub2RlVXVpZH0g55qE5a6M5pW05qCR57uT5p6E5oiQ5YqfYCk7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUobm9kZVRyZWUpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGRlYnVnTG9nKGDkvb/nlKjln7rmnKzoioLngrnkv6Hmga9gKTtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShub2RlSW5mbyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oYOiOt+WPluiKgueCueaVsOaNruWksei0pSAke25vZGVVdWlkfTpgLCBlcnJvcik7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShudWxsKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8g5L2/55SocXVlcnktbm9kZS10cmVl6I635Y+W5YyF5ZCr5a2Q6IqC54K555qE5a6M5pW06IqC54K557uT5p6EXG4gICAgcHJpdmF0ZSBhc3luYyBnZXROb2RlV2l0aENoaWxkcmVuKG5vZGVVdWlkOiBzdHJpbmcpOiBQcm9taXNlPGFueT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8g6I635Y+W5pW05Liq5Zy65pmv5qCRXG4gICAgICAgICAgICBjb25zdCB0cmVlID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktbm9kZS10cmVlJyk7XG4gICAgICAgICAgICBpZiAoIXRyZWUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8g5Zyo5qCR5Lit5p+l5om+5oyH5a6a55qE6IqC54K5XG4gICAgICAgICAgICBjb25zdCB0YXJnZXROb2RlID0gdGhpcy5maW5kTm9kZUluVHJlZSh0cmVlLCBub2RlVXVpZCk7XG4gICAgICAgICAgICBpZiAodGFyZ2V0Tm9kZSkge1xuICAgICAgICAgICAgICAgIGRlYnVnTG9nKGDlnKjlnLrmma/moJHkuK3mib7liLDoioLngrkgJHtub2RlVXVpZH3vvIzlrZDoioLngrnmlbDph486ICR7dGFyZ2V0Tm9kZS5jaGlsZHJlbiA/IHRhcmdldE5vZGUuY2hpbGRyZW4ubGVuZ3RoIDogMH1gKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAvLyDlop7lvLroioLngrnmoJHvvIzojrflj5bmr4/kuKroioLngrnnmoTmraPnoa7nu4Tku7bkv6Hmga9cbiAgICAgICAgICAgICAgICBjb25zdCBlbmhhbmNlZFRyZWUgPSBhd2FpdCB0aGlzLmVuaGFuY2VUcmVlV2l0aE1DUENvbXBvbmVudHModGFyZ2V0Tm9kZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGVuaGFuY2VkVHJlZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oYOiOt+WPluiKgueCueagkee7k+aehOWksei0pSAke25vZGVVdWlkfTpgLCBlcnJvcik7XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIOWcqOiKgueCueagkeS4remAkuW9kuafpeaJvuaMh+WumlVVSUTnmoToioLngrlcbiAgICBwcml2YXRlIGZpbmROb2RlSW5UcmVlKG5vZGU6IGFueSwgdGFyZ2V0VXVpZDogc3RyaW5nKTogYW55IHtcbiAgICAgICAgaWYgKCFub2RlKSByZXR1cm4gbnVsbDtcbiAgICAgICAgXG4gICAgICAgIC8vIOajgOafpeW9k+WJjeiKgueCuVxuICAgICAgICBpZiAobm9kZS51dWlkID09PSB0YXJnZXRVdWlkIHx8IG5vZGUudmFsdWU/LnV1aWQgPT09IHRhcmdldFV1aWQpIHtcbiAgICAgICAgICAgIHJldHVybiBub2RlO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8g6YCS5b2S5qOA5p+l5a2Q6IqC54K5XG4gICAgICAgIGlmIChub2RlLmNoaWxkcmVuICYmIEFycmF5LmlzQXJyYXkobm9kZS5jaGlsZHJlbikpIHtcbiAgICAgICAgICAgIGZvciAoY29uc3QgY2hpbGQgb2Ygbm9kZS5jaGlsZHJlbikge1xuICAgICAgICAgICAgICAgIGNvbnN0IGZvdW5kID0gdGhpcy5maW5kTm9kZUluVHJlZShjaGlsZCwgdGFyZ2V0VXVpZCk7XG4gICAgICAgICAgICAgICAgaWYgKGZvdW5kKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmb3VuZDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiDkvb/nlKhNQ1DmjqXlj6Plop7lvLroioLngrnmoJHvvIzojrflj5bmraPnoa7nmoTnu4Tku7bkv6Hmga9cbiAgICAgKi9cbiAgICBwcml2YXRlIGFzeW5jIGVuaGFuY2VUcmVlV2l0aE1DUENvbXBvbmVudHMobm9kZTogYW55KTogUHJvbWlzZTxhbnk+IHtcbiAgICAgICAgaWYgKCFub2RlIHx8ICFub2RlLnV1aWQpIHtcbiAgICAgICAgICAgIHJldHVybiBub2RlO1xuICAgICAgICB9XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIOS9v+eUqE1DUOaOpeWPo+iOt+WPluiKgueCueeahOe7hOS7tuS/oeaBr1xuICAgICAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCgnaHR0cDovL2xvY2FsaG9zdDo4NTg1L21jcCcsIHtcbiAgICAgICAgICAgICAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICAgICAgICAgICAgICBoZWFkZXJzOiB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSxcbiAgICAgICAgICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICAgICAgICAgIFwianNvbnJwY1wiOiBcIjIuMFwiLFxuICAgICAgICAgICAgICAgICAgICBcIm1ldGhvZFwiOiBcInRvb2xzL2NhbGxcIixcbiAgICAgICAgICAgICAgICAgICAgXCJwYXJhbXNcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJuYW1lXCI6IFwiY29tcG9uZW50X2dldF9jb21wb25lbnRzXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBcImFyZ3VtZW50c1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJub2RlVXVpZFwiOiBub2RlLnV1aWRcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgXCJpZFwiOiBEYXRlLm5vdygpXG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBjb25zdCBtY3BSZXN1bHQgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XG4gICAgICAgICAgICBpZiAobWNwUmVzdWx0LnJlc3VsdD8uY29udGVudD8uWzBdPy50ZXh0KSB7XG4gICAgICAgICAgICAgICAgY29uc3QgY29tcG9uZW50RGF0YSA9IEpTT04ucGFyc2UobWNwUmVzdWx0LnJlc3VsdC5jb250ZW50WzBdLnRleHQpO1xuICAgICAgICAgICAgICAgIGlmIChjb21wb25lbnREYXRhLnN1Y2Nlc3MgJiYgY29tcG9uZW50RGF0YS5kYXRhLmNvbXBvbmVudHMpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8g5pu05paw6IqC54K555qE57uE5Lu25L+h5oGv5Li6TUNQ6L+U5Zue55qE5q2j56Gu5pWw5o2uXG4gICAgICAgICAgICAgICAgICAgIG5vZGUuY29tcG9uZW50cyA9IGNvbXBvbmVudERhdGEuZGF0YS5jb21wb25lbnRzO1xuICAgICAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhg6IqC54K5ICR7bm9kZS51dWlkfSDojrflj5bliLAgJHtjb21wb25lbnREYXRhLmRhdGEuY29tcG9uZW50cy5sZW5ndGh9IOS4que7hOS7tu+8jOWMheWQq+iEmuacrOe7hOS7tueahOato+ehruexu+Wei2ApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIGNvbnNvbGUud2Fybihg6I635Y+W6IqC54K5ICR7bm9kZS51dWlkfSDnmoRNQ1Dnu4Tku7bkv6Hmga/lpLHotKU6YCwgZXJyb3IpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8g6YCS5b2S5aSE55CG5a2Q6IqC54K5XG4gICAgICAgIGlmIChub2RlLmNoaWxkcmVuICYmIEFycmF5LmlzQXJyYXkobm9kZS5jaGlsZHJlbikpIHtcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbm9kZS5jaGlsZHJlbi5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIG5vZGUuY2hpbGRyZW5baV0gPSBhd2FpdCB0aGlzLmVuaGFuY2VUcmVlV2l0aE1DUENvbXBvbmVudHMobm9kZS5jaGlsZHJlbltpXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbm9kZTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGJ1aWxkQmFzaWNOb2RlSW5mbyhub2RlVXVpZDogc3RyaW5nKTogUHJvbWlzZTxhbnk+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICAvLyDmnoTlu7rln7rmnKznmoToioLngrnkv6Hmga9cbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LW5vZGUnLCBub2RlVXVpZCkudGhlbigobm9kZUluZm86IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmICghbm9kZUluZm8pIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShudWxsKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIOeugOWMlueJiOacrO+8muWPqui/lOWbnuWfuuacrOiKgueCueS/oeaBr++8jOS4jeiOt+WPluWtkOiKgueCueWSjOe7hOS7tlxuICAgICAgICAgICAgICAgIC8vIOi/meS6m+S/oeaBr+WwhuWcqOWQjue7reeahOmihOWItuS9k+WkhOeQhuS4reagueaNrumcgOimgea3u+WKoFxuICAgICAgICAgICAgICAgIGNvbnN0IGJhc2ljSW5mbyA9IHtcbiAgICAgICAgICAgICAgICAgICAgLi4ubm9kZUluZm8sXG4gICAgICAgICAgICAgICAgICAgIGNoaWxkcmVuOiBbXSxcbiAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50czogW11cbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIHJlc29sdmUoYmFzaWNJbmZvKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG51bGwpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIOmqjOivgeiKgueCueaVsOaNruaYr+WQpuacieaViFxuICAgIHByaXZhdGUgaXNWYWxpZE5vZGVEYXRhKG5vZGVEYXRhOiBhbnkpOiBib29sZWFuIHtcbiAgICAgICAgaWYgKCFub2RlRGF0YSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICBpZiAodHlwZW9mIG5vZGVEYXRhICE9PSAnb2JqZWN0JykgcmV0dXJuIGZhbHNlO1xuICAgICAgICBcbiAgICAgICAgLy8g5qOA5p+l5Z+65pys5bGe5oCnIC0g6YCC6YWNcXVlcnktbm9kZS10cmVl55qE5pWw5o2u5qC85byPXG4gICAgICAgIHJldHVybiBub2RlRGF0YS5oYXNPd25Qcm9wZXJ0eSgndXVpZCcpIHx8IFxuICAgICAgICAgICAgICAgbm9kZURhdGEuaGFzT3duUHJvcGVydHkoJ25hbWUnKSB8fCBcbiAgICAgICAgICAgICAgIG5vZGVEYXRhLmhhc093blByb3BlcnR5KCdfX3R5cGVfXycpIHx8XG4gICAgICAgICAgICAgICAobm9kZURhdGEudmFsdWUgJiYgKFxuICAgICAgICAgICAgICAgICAgIG5vZGVEYXRhLnZhbHVlLmhhc093blByb3BlcnR5KCd1dWlkJykgfHxcbiAgICAgICAgICAgICAgICAgICBub2RlRGF0YS52YWx1ZS5oYXNPd25Qcm9wZXJ0eSgnbmFtZScpIHx8XG4gICAgICAgICAgICAgICAgICAgbm9kZURhdGEudmFsdWUuaGFzT3duUHJvcGVydHkoJ19fdHlwZV9fJylcbiAgICAgICAgICAgICAgICkpO1xuICAgIH1cblxuICAgIC8vIOaPkOWPluWtkOiKgueCuVVVSUTnmoTnu5/kuIDmlrnms5VcbiAgICBwcml2YXRlIGV4dHJhY3RDaGlsZFV1aWQoY2hpbGRSZWY6IGFueSk6IHN0cmluZyB8IG51bGwge1xuICAgICAgICBpZiAoIWNoaWxkUmVmKSByZXR1cm4gbnVsbDtcbiAgICAgICAgXG4gICAgICAgIC8vIOaWueazlTE6IOebtOaOpeWtl+espuS4slxuICAgICAgICBpZiAodHlwZW9mIGNoaWxkUmVmID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgcmV0dXJuIGNoaWxkUmVmO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAvLyDmlrnms5UyOiB2YWx1ZeWxnuaAp+WMheWQq+Wtl+espuS4slxuICAgICAgICBpZiAoY2hpbGRSZWYudmFsdWUgJiYgdHlwZW9mIGNoaWxkUmVmLnZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgcmV0dXJuIGNoaWxkUmVmLnZhbHVlO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAvLyDmlrnms5UzOiB2YWx1ZS51dWlk5bGe5oCnXG4gICAgICAgIGlmIChjaGlsZFJlZi52YWx1ZSAmJiBjaGlsZFJlZi52YWx1ZS51dWlkKSB7XG4gICAgICAgICAgICByZXR1cm4gY2hpbGRSZWYudmFsdWUudXVpZDtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgLy8g5pa55rOVNDog55u05o6ldXVpZOWxnuaAp1xuICAgICAgICBpZiAoY2hpbGRSZWYudXVpZCkge1xuICAgICAgICAgICAgcmV0dXJuIGNoaWxkUmVmLnV1aWQ7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vIOaWueazlTU6IF9faWRfX+W8leeUqCAtIOi/meenjeaDheWGtemcgOimgeeJueauiuWkhOeQhlxuICAgICAgICBpZiAoY2hpbGRSZWYuX19pZF9fICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGRlYnVnTG9nKGDlj5HnjrBfX2lkX1/lvJXnlKg6ICR7Y2hpbGRSZWYuX19pZF9ffe+8jOWPr+iDvemcgOimgeS7juaVsOaNrue7k+aehOS4reafpeaJvmApO1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7IC8vIOaaguaXtui/lOWbnm51bGzvvIzlkI7nu63lj6/ku6Xmt7vliqDlvJXnlKjop6PmnpDpgLvovpFcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgY29uc29sZS53YXJuKCfml6Dms5Xmj5Dlj5blrZDoioLngrlVVUlEOicsIEpTT04uc3RyaW5naWZ5KGNoaWxkUmVmKSk7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIC8vIOiOt+WPlumcgOimgeWkhOeQhueahOWtkOiKgueCueaVsOaNrlxuICAgIHByaXZhdGUgZ2V0Q2hpbGRyZW5Ub1Byb2Nlc3Mobm9kZURhdGE6IGFueSk6IGFueVtdIHtcbiAgICAgICAgY29uc3QgY2hpbGRyZW46IGFueVtdID0gW107XG4gICAgICAgIFxuICAgICAgICAvLyDmlrnms5UxOiDnm7TmjqXku45jaGlsZHJlbuaVsOe7hOiOt+WPlu+8iOS7jnF1ZXJ5LW5vZGUtdHJlZei/lOWbnueahOaVsOaNru+8iVxuICAgICAgICBpZiAobm9kZURhdGEuY2hpbGRyZW4gJiYgQXJyYXkuaXNBcnJheShub2RlRGF0YS5jaGlsZHJlbikpIHtcbiAgICAgICAgICAgIGRlYnVnTG9nKGDku45jaGlsZHJlbuaVsOe7hOiOt+WPluWtkOiKgueCue+8jOaVsOmHjzogJHtub2RlRGF0YS5jaGlsZHJlbi5sZW5ndGh9YCk7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIG5vZGVEYXRhLmNoaWxkcmVuKSB7XG4gICAgICAgICAgICAgICAgLy8gcXVlcnktbm9kZS10cmVl6L+U5Zue55qE5a2Q6IqC54K56YCa5bi45bey57uP5piv5a6M5pW055qE5pWw5o2u57uT5p6EXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuaXNWYWxpZE5vZGVEYXRhKGNoaWxkKSkge1xuICAgICAgICAgICAgICAgICAgICBjaGlsZHJlbi5wdXNoKGNoaWxkKTtcbiAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYOa3u+WKoOWtkOiKgueCuTogJHtjaGlsZC5uYW1lIHx8IGNoaWxkLnZhbHVlPy5uYW1lIHx8ICfmnKrnn6UnfWApO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGRlYnVnTG9nKCflrZDoioLngrnmlbDmja7ml6DmlYg6JywgSlNPTi5zdHJpbmdpZnkoY2hpbGQsIG51bGwsIDIpKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBkZWJ1Z0xvZygn6IqC54K55rKh5pyJ5a2Q6IqC54K55oiWY2hpbGRyZW7mlbDnu4TkuLrnqbonKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgcmV0dXJuIGNoaWxkcmVuO1xuICAgIH1cblxuICAgIHByaXZhdGUgZ2VuZXJhdGVVVUlEKCk6IHN0cmluZyB7XG4gICAgICAgIC8vIOeUn+aIkOespuWQiENvY29zIENyZWF0b3LmoLzlvI/nmoRVVUlEXG4gICAgICAgIGNvbnN0IGNoYXJzID0gJzAxMjM0NTY3ODlhYmNkZWYnO1xuICAgICAgICBsZXQgdXVpZCA9ICcnO1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IDMyOyBpKyspIHtcbiAgICAgICAgICAgIGlmIChpID09PSA4IHx8IGkgPT09IDEyIHx8IGkgPT09IDE2IHx8IGkgPT09IDIwKSB7XG4gICAgICAgICAgICAgICAgdXVpZCArPSAnLSc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB1dWlkICs9IGNoYXJzW01hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIGNoYXJzLmxlbmd0aCldO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB1dWlkO1xuICAgIH1cblxuICAgIHByaXZhdGUgY3JlYXRlUHJlZmFiRGF0YShub2RlRGF0YTogYW55LCBwcmVmYWJOYW1lOiBzdHJpbmcsIHByZWZhYlV1aWQ6IHN0cmluZyk6IGFueVtdIHtcbiAgICAgICAgLy8g5Yib5bu65qCH5YeG55qE6aKE5Yi25L2T5pWw5o2u57uT5p6EXG4gICAgICAgIGNvbnN0IHByZWZhYkFzc2V0ID0ge1xuICAgICAgICAgICAgXCJfX3R5cGVfX1wiOiBcImNjLlByZWZhYlwiLFxuICAgICAgICAgICAgXCJfbmFtZVwiOiBwcmVmYWJOYW1lLFxuICAgICAgICAgICAgXCJfb2JqRmxhZ3NcIjogMCxcbiAgICAgICAgICAgIFwiX19lZGl0b3JFeHRyYXNfX1wiOiB7fSxcbiAgICAgICAgICAgIFwiX25hdGl2ZVwiOiBcIlwiLFxuICAgICAgICAgICAgXCJkYXRhXCI6IHtcbiAgICAgICAgICAgICAgICBcIl9faWRfX1wiOiAxXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJvcHRpbWl6YXRpb25Qb2xpY3lcIjogMCxcbiAgICAgICAgICAgIFwicGVyc2lzdGVudFwiOiBmYWxzZVxuICAgICAgICB9O1xuXG4gICAgICAgIC8vIOWkhOeQhuiKgueCueaVsOaNru+8jOehruS/neespuWQiOmihOWItuS9k+agvOW8j1xuICAgICAgICBjb25zdCBwcm9jZXNzZWROb2RlRGF0YSA9IHRoaXMucHJvY2Vzc05vZGVGb3JQcmVmYWIobm9kZURhdGEsIHByZWZhYlV1aWQpO1xuXG4gICAgICAgIHJldHVybiBbcHJlZmFiQXNzZXQsIC4uLnByb2Nlc3NlZE5vZGVEYXRhXTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHByb2Nlc3NOb2RlRm9yUHJlZmFiKG5vZGVEYXRhOiBhbnksIHByZWZhYlV1aWQ6IHN0cmluZyk6IGFueVtdIHtcbiAgICAgICAgLy8g5aSE55CG6IqC54K55pWw5o2u5Lul56ym5ZCI6aKE5Yi25L2T5qC85byPXG4gICAgICAgIGNvbnN0IHByb2Nlc3NlZERhdGE6IGFueVtdID0gW107XG4gICAgICAgIGxldCBpZENvdW50ZXIgPSAxO1xuXG4gICAgICAgIC8vIOmAkuW9kuWkhOeQhuiKgueCueWSjOe7hOS7tlxuICAgICAgICBjb25zdCBwcm9jZXNzTm9kZSA9IChub2RlOiBhbnksIHBhcmVudElkOiBudW1iZXIgPSAwKTogbnVtYmVyID0+IHtcbiAgICAgICAgICAgIGNvbnN0IG5vZGVJZCA9IGlkQ291bnRlcisrO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyDliJvlu7roioLngrnlr7nosaFcbiAgICAgICAgICAgIGNvbnN0IHByb2Nlc3NlZE5vZGUgPSB7XG4gICAgICAgICAgICAgICAgXCJfX3R5cGVfX1wiOiBcImNjLk5vZGVcIixcbiAgICAgICAgICAgICAgICBcIl9uYW1lXCI6IG5vZGUubmFtZSB8fCBcIk5vZGVcIixcbiAgICAgICAgICAgICAgICBcIl9vYmpGbGFnc1wiOiAwLFxuICAgICAgICAgICAgICAgIFwiX19lZGl0b3JFeHRyYXNfX1wiOiB7fSxcbiAgICAgICAgICAgICAgICBcIl9wYXJlbnRcIjogcGFyZW50SWQgPiAwID8geyBcIl9faWRfX1wiOiBwYXJlbnRJZCB9IDogbnVsbCxcbiAgICAgICAgICAgICAgICBcIl9jaGlsZHJlblwiOiBub2RlLmNoaWxkcmVuID8gbm9kZS5jaGlsZHJlbi5tYXAoKCkgPT4gKHsgXCJfX2lkX19cIjogaWRDb3VudGVyKysgfSkpIDogW10sXG4gICAgICAgICAgICAgICAgXCJfYWN0aXZlXCI6IG5vZGUuYWN0aXZlICE9PSBmYWxzZSxcbiAgICAgICAgICAgICAgICBcIl9jb21wb25lbnRzXCI6IG5vZGUuY29tcG9uZW50cyA/IG5vZGUuY29tcG9uZW50cy5tYXAoKCkgPT4gKHsgXCJfX2lkX19cIjogaWRDb3VudGVyKysgfSkpIDogW10sXG4gICAgICAgICAgICAgICAgXCJfcHJlZmFiXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJfX2lkX19cIjogaWRDb3VudGVyKytcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwiX2xwb3NcIjoge1xuICAgICAgICAgICAgICAgICAgICBcIl9fdHlwZV9fXCI6IFwiY2MuVmVjM1wiLFxuICAgICAgICAgICAgICAgICAgICBcInhcIjogMCxcbiAgICAgICAgICAgICAgICAgICAgXCJ5XCI6IDAsXG4gICAgICAgICAgICAgICAgICAgIFwielwiOiAwXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBcIl9scm90XCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJfX3R5cGVfX1wiOiBcImNjLlF1YXRcIixcbiAgICAgICAgICAgICAgICAgICAgXCJ4XCI6IDAsXG4gICAgICAgICAgICAgICAgICAgIFwieVwiOiAwLFxuICAgICAgICAgICAgICAgICAgICBcInpcIjogMCxcbiAgICAgICAgICAgICAgICAgICAgXCJ3XCI6IDFcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwiX2xzY2FsZVwiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwiX190eXBlX19cIjogXCJjYy5WZWMzXCIsXG4gICAgICAgICAgICAgICAgICAgIFwieFwiOiAxLFxuICAgICAgICAgICAgICAgICAgICBcInlcIjogMSxcbiAgICAgICAgICAgICAgICAgICAgXCJ6XCI6IDFcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwiX21vYmlsaXR5XCI6IDAsXG4gICAgICAgICAgICAgICAgXCJfbGF5ZXJcIjogMTA3Mzc0MTgyNCxcbiAgICAgICAgICAgICAgICBcIl9ldWxlclwiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwiX190eXBlX19cIjogXCJjYy5WZWMzXCIsXG4gICAgICAgICAgICAgICAgICAgIFwieFwiOiAwLFxuICAgICAgICAgICAgICAgICAgICBcInlcIjogMCxcbiAgICAgICAgICAgICAgICAgICAgXCJ6XCI6IDBcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwiX2lkXCI6IFwiXCJcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIHByb2Nlc3NlZERhdGEucHVzaChwcm9jZXNzZWROb2RlKTtcblxuICAgICAgICAgICAgLy8g5aSE55CG57uE5Lu2XG4gICAgICAgICAgICBpZiAobm9kZS5jb21wb25lbnRzKSB7XG4gICAgICAgICAgICAgICAgbm9kZS5jb21wb25lbnRzLmZvckVhY2goKGNvbXBvbmVudDogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbXBvbmVudElkID0gaWRDb3VudGVyKys7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHByb2Nlc3NlZENvbXBvbmVudHMgPSB0aGlzLnByb2Nlc3NDb21wb25lbnRGb3JQcmVmYWIoY29tcG9uZW50LCBjb21wb25lbnRJZCk7XG4gICAgICAgICAgICAgICAgICAgIHByb2Nlc3NlZERhdGEucHVzaCguLi5wcm9jZXNzZWRDb21wb25lbnRzKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8g5aSE55CG5a2Q6IqC54K5XG4gICAgICAgICAgICBpZiAobm9kZS5jaGlsZHJlbikge1xuICAgICAgICAgICAgICAgIG5vZGUuY2hpbGRyZW4uZm9yRWFjaCgoY2hpbGQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBwcm9jZXNzTm9kZShjaGlsZCwgbm9kZUlkKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIG5vZGVJZDtcbiAgICAgICAgfTtcblxuICAgICAgICBwcm9jZXNzTm9kZShub2RlRGF0YSk7XG4gICAgICAgIHJldHVybiBwcm9jZXNzZWREYXRhO1xuICAgIH1cblxuICAgIHByaXZhdGUgcHJvY2Vzc0NvbXBvbmVudEZvclByZWZhYihjb21wb25lbnQ6IGFueSwgY29tcG9uZW50SWQ6IG51bWJlcik6IGFueVtdIHtcbiAgICAgICAgLy8g5aSE55CG57uE5Lu25pWw5o2u5Lul56ym5ZCI6aKE5Yi25L2T5qC85byPXG4gICAgICAgIGNvbnN0IHByb2Nlc3NlZENvbXBvbmVudCA9IHtcbiAgICAgICAgICAgIFwiX190eXBlX19cIjogY29tcG9uZW50LnR5cGUgfHwgXCJjYy5Db21wb25lbnRcIixcbiAgICAgICAgICAgIFwiX25hbWVcIjogXCJcIixcbiAgICAgICAgICAgIFwiX29iakZsYWdzXCI6IDAsXG4gICAgICAgICAgICBcIl9fZWRpdG9yRXh0cmFzX19cIjoge30sXG4gICAgICAgICAgICBcIm5vZGVcIjoge1xuICAgICAgICAgICAgICAgIFwiX19pZF9fXCI6IGNvbXBvbmVudElkIC0gMVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiX2VuYWJsZWRcIjogY29tcG9uZW50LmVuYWJsZWQgIT09IGZhbHNlLFxuICAgICAgICAgICAgXCJfX3ByZWZhYlwiOiB7XG4gICAgICAgICAgICAgICAgXCJfX2lkX19cIjogY29tcG9uZW50SWQgKyAxXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgLi4uY29tcG9uZW50LnByb3BlcnRpZXNcbiAgICAgICAgfTtcblxuICAgICAgICAvLyDmt7vliqDnu4Tku7bnibnlrprnmoTpooTliLbkvZPkv6Hmga9cbiAgICAgICAgY29uc3QgY29tcFByZWZhYkluZm8gPSB7XG4gICAgICAgICAgICBcIl9fdHlwZV9fXCI6IFwiY2MuQ29tcFByZWZhYkluZm9cIixcbiAgICAgICAgICAgIFwiZmlsZUlkXCI6IHRoaXMuZ2VuZXJhdGVGaWxlSWQoKVxuICAgICAgICB9O1xuXG4gICAgICAgIHJldHVybiBbcHJvY2Vzc2VkQ29tcG9uZW50LCBjb21wUHJlZmFiSW5mb107XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBnZW5lcmF0ZUZpbGVJZCgpOiBzdHJpbmcge1xuICAgICAgICAvLyDnlJ/miJDmlofku7ZJRO+8iOeugOWMlueJiOacrO+8iVxuICAgICAgICBjb25zdCBjaGFycyA9ICdhYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5ekFCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaMDEyMzQ1Njc4OSsvJztcbiAgICAgICAgbGV0IGZpbGVJZCA9ICcnO1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IDIyOyBpKyspIHtcbiAgICAgICAgICAgIGZpbGVJZCArPSBjaGFyc1tNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiBjaGFycy5sZW5ndGgpXTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmlsZUlkO1xuICAgIH1cblxuICAgIHByaXZhdGUgY3JlYXRlTWV0YURhdGEocHJlZmFiTmFtZTogc3RyaW5nLCBwcmVmYWJVdWlkOiBzdHJpbmcpOiBhbnkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgXCJ2ZXJcIjogXCIxLjEuNTBcIixcbiAgICAgICAgICAgIFwiaW1wb3J0ZXJcIjogXCJwcmVmYWJcIixcbiAgICAgICAgICAgIFwiaW1wb3J0ZWRcIjogdHJ1ZSxcbiAgICAgICAgICAgIFwidXVpZFwiOiBwcmVmYWJVdWlkLFxuICAgICAgICAgICAgXCJmaWxlc1wiOiBbXG4gICAgICAgICAgICAgICAgXCIuanNvblwiXG4gICAgICAgICAgICBdLFxuICAgICAgICAgICAgXCJzdWJNZXRhc1wiOiB7fSxcbiAgICAgICAgICAgIFwidXNlckRhdGFcIjoge1xuICAgICAgICAgICAgICAgIFwic3luY05vZGVOYW1lXCI6IHByZWZhYk5hbWVcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHNhdmVQcmVmYWJGaWxlcyhwcmVmYWJQYXRoOiBzdHJpbmcsIHByZWZhYkRhdGE6IGFueVtdLCBtZXRhRGF0YTogYW55KTogUHJvbWlzZTx7IHN1Y2Nlc3M6IGJvb2xlYW47IGVycm9yPzogc3RyaW5nIH0+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIC8vIOS9v+eUqEVkaXRvciBBUEnkv53lrZjpooTliLbkvZPmlofku7ZcbiAgICAgICAgICAgICAgICBjb25zdCBwcmVmYWJDb250ZW50ID0gSlNPTi5zdHJpbmdpZnkocHJlZmFiRGF0YSwgbnVsbCwgMik7XG4gICAgICAgICAgICAgICAgY29uc3QgbWV0YUNvbnRlbnQgPSBKU09OLnN0cmluZ2lmeShtZXRhRGF0YSwgbnVsbCwgMik7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgLy8g5bCd6K+V5L2/55So5pu05Y+v6Z2g55qE5L+d5a2Y5pa55rOVXG4gICAgICAgICAgICAgICAgdGhpcy5zYXZlQXNzZXRGaWxlKHByZWZhYlBhdGgsIHByZWZhYkNvbnRlbnQpLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAvLyDlho3liJvlu7ptZXRh5paH5Lu2XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG1ldGFQYXRoID0gYCR7cHJlZmFiUGF0aH0ubWV0YWA7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLnNhdmVBc3NldEZpbGUobWV0YVBhdGgsIG1ldGFDb250ZW50KTtcbiAgICAgICAgICAgICAgICB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IHRydWUgfSk7XG4gICAgICAgICAgICAgICAgfSkuY2F0Y2goKGVycm9yOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3IubWVzc2FnZSB8fCAn5L+d5a2Y6aKE5Yi25L2T5paH5Lu25aSx6LSlJyB9KTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYOS/neWtmOaWh+S7tuaXtuWPkeeUn+mUmeivrzogJHtlcnJvcn1gIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHNhdmVBc3NldEZpbGUoZmlsZVBhdGg6IHN0cmluZywgY29udGVudDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgICAvLyDlsJ3or5XlpJrnp43kv53lrZjmlrnms5VcbiAgICAgICAgICAgIGNvbnN0IHNhdmVNZXRob2RzID0gW1xuICAgICAgICAgICAgICAgICgpID0+IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ2NyZWF0ZS1hc3NldCcsIGZpbGVQYXRoLCBjb250ZW50KSxcbiAgICAgICAgICAgICAgICAoKSA9PiBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdzYXZlLWFzc2V0JywgZmlsZVBhdGgsIGNvbnRlbnQpLFxuICAgICAgICAgICAgICAgICgpID0+IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3dyaXRlLWFzc2V0JywgZmlsZVBhdGgsIGNvbnRlbnQpXG4gICAgICAgICAgICBdO1xuXG4gICAgICAgICAgICBjb25zdCB0cnlTYXZlID0gKGluZGV4OiBudW1iZXIpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoaW5kZXggPj0gc2F2ZU1ldGhvZHMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoJ+aJgOacieS/neWtmOaWueazlemDveWksei0peS6hicpKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHNhdmVNZXRob2RzW2luZGV4XSgpLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7XG4gICAgICAgICAgICAgICAgfSkuY2F0Y2goKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICB0cnlTYXZlKGluZGV4ICsgMSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICB0cnlTYXZlKDApO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHVwZGF0ZVByZWZhYihwcmVmYWJQYXRoOiBzdHJpbmcsIG5vZGVVdWlkOiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICAvLyBBcHBseSBwYXRoLiBUaGVyZSBpcyBubyBob3N0LXByb2Nlc3MgRWRpdG9yLk1lc3NhZ2UgY2hhbm5lbCBmb3JcbiAgICAgICAgLy8gdGhpczsgdGhlIG9wZXJhdGlvbiBsaXZlcyBvbiB0aGUgc2NlbmUgZmFjYWRlIGFuZCBpcyByZWFjaGFibGVcbiAgICAgICAgLy8gdmlhIGV4ZWN1dGUtc2NlbmUtc2NyaXB0IChzZWUgc291cmNlL3NjZW5lLnRzOmFwcGx5UHJlZmFiKS5cbiAgICAgICAgY29uc3QgZmFjYWRlUmVzdWx0ID0gYXdhaXQgcnVuU2NlbmVNZXRob2RBc1Rvb2xSZXNwb25zZSgnYXBwbHlQcmVmYWInLCBbbm9kZVV1aWRdKTtcbiAgICAgICAgaWYgKGZhY2FkZVJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIC4uLmZhY2FkZVJlc3VsdCxcbiAgICAgICAgICAgICAgICBkYXRhOiB7IC4uLihmYWNhZGVSZXN1bHQuZGF0YSA/PyB7fSksIHByZWZhYlBhdGgsIG5vZGVVdWlkIH0sXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgIGVycm9yOiBmYWNhZGVSZXN1bHQuZXJyb3IgPz8gJ2FwcGx5UHJlZmFiIGZhaWxlZCB2aWEgc2NlbmUgZmFjYWRlJyxcbiAgICAgICAgICAgIGRhdGE6IHsgcHJlZmFiUGF0aCwgbm9kZVV1aWQgfSxcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGxpbmtQcmVmYWIobm9kZVV1aWQ6IHN0cmluZywgYXNzZXRVdWlkOiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gcnVuU2NlbmVNZXRob2RBc1Rvb2xSZXNwb25zZSgnbGlua1ByZWZhYicsIFtub2RlVXVpZCwgYXNzZXRVdWlkXSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyB1bmxpbmtQcmVmYWIobm9kZVV1aWQ6IHN0cmluZywgcmVtb3ZlTmVzdGVkOiBib29sZWFuKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHJ1blNjZW5lTWV0aG9kQXNUb29sUmVzcG9uc2UoJ3VubGlua1ByZWZhYicsIFtub2RlVXVpZCwgcmVtb3ZlTmVzdGVkXSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRQcmVmYWJEYXRhKG5vZGVVdWlkOiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gcnVuU2NlbmVNZXRob2RBc1Rvb2xSZXNwb25zZSgnZ2V0UHJlZmFiRGF0YScsIFtub2RlVXVpZF0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgcmV2ZXJ0UHJlZmFiKG5vZGVVdWlkOiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICAvLyBUaGUgcHJldmlvdXMgY29kZSBjYWxsZWQgc2NlbmUgYHJldmVydC1wcmVmYWJgLCB3aGljaCBkb2VzIG5vdCBleGlzdC5cbiAgICAgICAgLy8gVGhlIHZlcmlmaWVkIGNoYW5uZWwgaXMgYHJlc3RvcmUtcHJlZmFiYCB0YWtpbmcgYHsgdXVpZDogc3RyaW5nIH1gXG4gICAgICAgIC8vIChSZXNldENvbXBvbmVudE9wdGlvbnMpLiBQZXIgdGhlIGVkaXRvciBjb252ZW50aW9uIHRoaXMgcmVzdG9yZXMgdGhlXG4gICAgICAgIC8vIG5vZGUgZnJvbSBpdHMgbGlua2VkIHByZWZhYiBhc3NldCwgd2hpY2ggbWF0Y2hlcyB0aGUgXCJyZXZlcnRcIiBpbnRlbnQuXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncmVzdG9yZS1wcmVmYWInLCB7IHV1aWQ6IG5vZGVVdWlkIH0pLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiAnUHJlZmFiIGluc3RhbmNlIHJldmVydGVkIHN1Y2Nlc3NmdWxseScsXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVyci5tZXNzYWdlIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2V0UHJlZmFiSW5mbyhwcmVmYWJQYXRoOiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0LWluZm8nLCBwcmVmYWJQYXRoKS50aGVuKChhc3NldEluZm86IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmICghYXNzZXRJbmZvKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignUHJlZmFiIG5vdCBmb3VuZCcpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJldHVybiBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldC1tZXRhJywgYXNzZXRJbmZvLnV1aWQpO1xuICAgICAgICAgICAgfSkudGhlbigobWV0YUluZm86IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGluZm86IFByZWZhYkluZm8gPSB7XG4gICAgICAgICAgICAgICAgICAgIG5hbWU6IG1ldGFJbmZvLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgIHV1aWQ6IG1ldGFJbmZvLnV1aWQsXG4gICAgICAgICAgICAgICAgICAgIHBhdGg6IHByZWZhYlBhdGgsXG4gICAgICAgICAgICAgICAgICAgIGZvbGRlcjogcHJlZmFiUGF0aC5zdWJzdHJpbmcoMCwgcHJlZmFiUGF0aC5sYXN0SW5kZXhPZignLycpKSxcbiAgICAgICAgICAgICAgICAgICAgY3JlYXRlVGltZTogbWV0YUluZm8uY3JlYXRlVGltZSxcbiAgICAgICAgICAgICAgICAgICAgbW9kaWZ5VGltZTogbWV0YUluZm8ubW9kaWZ5VGltZSxcbiAgICAgICAgICAgICAgICAgICAgZGVwZW5kZW5jaWVzOiBtZXRhSW5mby5kZXBlbmRzIHx8IFtdXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogaW5mbyB9KTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBjcmVhdGVQcmVmYWJGcm9tTm9kZShhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICAvLyDku44gcHJlZmFiUGF0aCDmj5Dlj5blkI3np7BcbiAgICAgICAgY29uc3QgcHJlZmFiUGF0aCA9IGFyZ3MucHJlZmFiUGF0aDtcbiAgICAgICAgY29uc3QgcHJlZmFiTmFtZSA9IHByZWZhYlBhdGguc3BsaXQoJy8nKS5wb3AoKT8ucmVwbGFjZSgnLnByZWZhYicsICcnKSB8fCAnTmV3UHJlZmFiJztcbiAgICAgICAgXG4gICAgICAgIC8vIOiwg+eUqOWOn+adpeeahCBjcmVhdGVQcmVmYWIg5pa55rOVXG4gICAgICAgIHJldHVybiBhd2FpdCB0aGlzLmNyZWF0ZVByZWZhYih7XG4gICAgICAgICAgICBub2RlVXVpZDogYXJncy5ub2RlVXVpZCxcbiAgICAgICAgICAgIHNhdmVQYXRoOiBwcmVmYWJQYXRoLFxuICAgICAgICAgICAgcHJlZmFiTmFtZTogcHJlZmFiTmFtZVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHZhbGlkYXRlUHJlZmFiKHByZWZhYlBhdGg6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAvLyDor7vlj5bpooTliLbkvZPmlofku7blhoXlrrlcbiAgICAgICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldC1pbmZvJywgcHJlZmFiUGF0aCkudGhlbigoYXNzZXRJbmZvOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFhc3NldEluZm8pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yOiAn6aKE5Yi25L2T5paH5Lu25LiN5a2Y5ZyoJ1xuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvLyDpqozor4HpooTliLbkvZPmoLzlvI9cbiAgICAgICAgICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncmVhZC1hc3NldCcsIHByZWZhYlBhdGgpLnRoZW4oKGNvbnRlbnQ6IHN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBwcmVmYWJEYXRhID0gSlNPTi5wYXJzZShjb250ZW50KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB2YWxpZGF0aW9uUmVzdWx0ID0gdGhpcy52YWxpZGF0ZVByZWZhYkZvcm1hdChwcmVmYWJEYXRhKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaXNWYWxpZDogdmFsaWRhdGlvblJlc3VsdC5pc1ZhbGlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaXNzdWVzOiB2YWxpZGF0aW9uUmVzdWx0Lmlzc3VlcyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5vZGVDb3VudDogdmFsaWRhdGlvblJlc3VsdC5ub2RlQ291bnQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRDb3VudDogdmFsaWRhdGlvblJlc3VsdC5jb21wb25lbnRDb3VudCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IHZhbGlkYXRpb25SZXN1bHQuaXNWYWxpZCA/ICfpooTliLbkvZPmoLzlvI/mnInmlYgnIDogJ+mihOWItuS9k+agvOW8j+WtmOWcqOmXrumimCdcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAocGFyc2VFcnJvcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3I6ICfpooTliLbkvZPmlofku7bmoLzlvI/plJnor6/vvIzml6Dms5Xop6PmnpBKU09OJ1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9KS5jYXRjaCgoZXJyb3I6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGDor7vlj5bpooTliLbkvZPmlofku7blpLHotKU6ICR7ZXJyb3IubWVzc2FnZX1gXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSkuY2F0Y2goKGVycm9yOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yOiBg5p+l6K+i6aKE5Yi25L2T5L+h5oGv5aSx6LSlOiAke2Vycm9yLm1lc3NhZ2V9YFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICBlcnJvcjogYOmqjOivgemihOWItuS9k+aXtuWPkeeUn+mUmeivrzogJHtlcnJvcn1gXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgdmFsaWRhdGVQcmVmYWJGb3JtYXQocHJlZmFiRGF0YTogYW55KTogeyBpc1ZhbGlkOiBib29sZWFuOyBpc3N1ZXM6IHN0cmluZ1tdOyBub2RlQ291bnQ6IG51bWJlcjsgY29tcG9uZW50Q291bnQ6IG51bWJlciB9IHtcbiAgICAgICAgY29uc3QgaXNzdWVzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICBsZXQgbm9kZUNvdW50ID0gMDtcbiAgICAgICAgbGV0IGNvbXBvbmVudENvdW50ID0gMDtcblxuICAgICAgICAvLyDmo4Dmn6Xln7rmnKznu5PmnoRcbiAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KHByZWZhYkRhdGEpKSB7XG4gICAgICAgICAgICBpc3N1ZXMucHVzaCgn6aKE5Yi25L2T5pWw5o2u5b+F6aG75piv5pWw57uE5qC85byPJyk7XG4gICAgICAgICAgICByZXR1cm4geyBpc1ZhbGlkOiBmYWxzZSwgaXNzdWVzLCBub2RlQ291bnQsIGNvbXBvbmVudENvdW50IH07XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocHJlZmFiRGF0YS5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIGlzc3Vlcy5wdXNoKCfpooTliLbkvZPmlbDmja7kuLrnqbonKTtcbiAgICAgICAgICAgIHJldHVybiB7IGlzVmFsaWQ6IGZhbHNlLCBpc3N1ZXMsIG5vZGVDb3VudCwgY29tcG9uZW50Q291bnQgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIOajgOafpeesrOS4gOS4quWFg+e0oOaYr+WQpuS4uumihOWItuS9k+i1hOS6p1xuICAgICAgICBjb25zdCBmaXJzdEVsZW1lbnQgPSBwcmVmYWJEYXRhWzBdO1xuICAgICAgICBpZiAoIWZpcnN0RWxlbWVudCB8fCBmaXJzdEVsZW1lbnQuX190eXBlX18gIT09ICdjYy5QcmVmYWInKSB7XG4gICAgICAgICAgICBpc3N1ZXMucHVzaCgn56ys5LiA5Liq5YWD57Sg5b+F6aG75pivY2MuUHJlZmFi57G75Z6LJyk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyDnu5/orqHoioLngrnlkoznu4Tku7ZcbiAgICAgICAgcHJlZmFiRGF0YS5mb3JFYWNoKChpdGVtOiBhbnksIGluZGV4OiBudW1iZXIpID0+IHtcbiAgICAgICAgICAgIGlmIChpdGVtLl9fdHlwZV9fID09PSAnY2MuTm9kZScpIHtcbiAgICAgICAgICAgICAgICBub2RlQ291bnQrKztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoaXRlbS5fX3R5cGVfXyAmJiBpdGVtLl9fdHlwZV9fLmluY2x1ZGVzKCdjYy4nKSkge1xuICAgICAgICAgICAgICAgIGNvbXBvbmVudENvdW50Kys7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIOajgOafpeW/heimgeeahOWtl+autVxuICAgICAgICBpZiAobm9kZUNvdW50ID09PSAwKSB7XG4gICAgICAgICAgICBpc3N1ZXMucHVzaCgn6aKE5Yi25L2T5b+F6aG75YyF5ZCr6Iez5bCR5LiA5Liq6IqC54K5Jyk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgaXNWYWxpZDogaXNzdWVzLmxlbmd0aCA9PT0gMCxcbiAgICAgICAgICAgIGlzc3VlcyxcbiAgICAgICAgICAgIG5vZGVDb3VudCxcbiAgICAgICAgICAgIGNvbXBvbmVudENvdW50XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBkdXBsaWNhdGVQcmVmYWIoYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKGFzeW5jIChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHsgc291cmNlUHJlZmFiUGF0aCwgdGFyZ2V0UHJlZmFiUGF0aCwgbmV3UHJlZmFiTmFtZSB9ID0gYXJncztcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAvLyDor7vlj5bmupDpooTliLbkvZNcbiAgICAgICAgICAgICAgICBjb25zdCBzb3VyY2VJbmZvID0gYXdhaXQgdGhpcy5nZXRQcmVmYWJJbmZvKHNvdXJjZVByZWZhYlBhdGgpO1xuICAgICAgICAgICAgICAgIGlmICghc291cmNlSW5mby5zdWNjZXNzKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgICAgICBlcnJvcjogYOaXoOazleivu+WPlua6kOmihOWItuS9kzogJHtzb3VyY2VJbmZvLmVycm9yfWBcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyDor7vlj5bmupDpooTliLbkvZPlhoXlrrlcbiAgICAgICAgICAgICAgICBjb25zdCBzb3VyY2VDb250ZW50ID0gYXdhaXQgdGhpcy5yZWFkUHJlZmFiQ29udGVudChzb3VyY2VQcmVmYWJQYXRoKTtcbiAgICAgICAgICAgICAgICBpZiAoIXNvdXJjZUNvbnRlbnQuc3VjY2Vzcykge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGDml6Dms5Xor7vlj5bmupDpooTliLbkvZPlhoXlrrk6ICR7c291cmNlQ29udGVudC5lcnJvcn1gXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8g55Sf5oiQ5paw55qEVVVJRFxuICAgICAgICAgICAgICAgIGNvbnN0IG5ld1V1aWQgPSB0aGlzLmdlbmVyYXRlVVVJRCgpO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIC8vIOS/ruaUuemihOWItuS9k+aVsOaNrlxuICAgICAgICAgICAgICAgIGNvbnN0IG1vZGlmaWVkRGF0YSA9IHRoaXMubW9kaWZ5UHJlZmFiRm9yRHVwbGljYXRpb24oc291cmNlQ29udGVudC5kYXRhLCBuZXdQcmVmYWJOYW1lLCBuZXdVdWlkKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAvLyDliJvlu7rmlrDnmoRtZXRh5pWw5o2uXG4gICAgICAgICAgICAgICAgY29uc3QgbmV3TWV0YURhdGEgPSB0aGlzLmNyZWF0ZU1ldGFEYXRhKG5ld1ByZWZhYk5hbWUgfHwgJ0R1cGxpY2F0ZWRQcmVmYWInLCBuZXdVdWlkKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAvLyDpooTliLbkvZPlpI3liLblip/og73mmoLml7bnpoHnlKjvvIzlm6DkuLrmtonlj4rlpI3mnYLnmoTluo/liJfljJbmoLzlvI9cbiAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIGVycm9yOiAn6aKE5Yi25L2T5aSN5Yi25Yqf6IO95pqC5pe25LiN5Y+v55SoJyxcbiAgICAgICAgICAgICAgICAgICAgaW5zdHJ1Y3Rpb246ICfor7flnKggQ29jb3MgQ3JlYXRvciDnvJbovpHlmajkuK3miYvliqjlpI3liLbpooTliLbkvZPvvJpcXG4xLiDlnKjotYTmupDnrqHnkIblmajkuK3pgInmi6nopoHlpI3liLbnmoTpooTliLbkvZNcXG4yLiDlj7PplK7pgInmi6nlpI3liLZcXG4zLiDlnKjnm67moIfkvY3nva7nspjotLQnXG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICBlcnJvcjogYOWkjeWItumihOWItuS9k+aXtuWPkeeUn+mUmeivrzogJHtlcnJvcn1gXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgcmVhZFByZWZhYkNvbnRlbnQocHJlZmFiUGF0aDogc3RyaW5nKTogUHJvbWlzZTx7IHN1Y2Nlc3M6IGJvb2xlYW47IGRhdGE/OiBhbnk7IGVycm9yPzogc3RyaW5nIH0+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdyZWFkLWFzc2V0JywgcHJlZmFiUGF0aCkudGhlbigoY29udGVudDogc3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcHJlZmFiRGF0YSA9IEpTT04ucGFyc2UoY29udGVudCk7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoeyBzdWNjZXNzOiB0cnVlLCBkYXRhOiBwcmVmYWJEYXRhIH0pO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKHBhcnNlRXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ+mihOWItuS9k+aWh+S7tuagvOW8j+mUmeivrycgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSkuY2F0Y2goKGVycm9yOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvci5tZXNzYWdlIHx8ICfor7vlj5bpooTliLbkvZPmlofku7blpLHotKUnIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgbW9kaWZ5UHJlZmFiRm9yRHVwbGljYXRpb24ocHJlZmFiRGF0YTogYW55W10sIG5ld05hbWU6IHN0cmluZywgbmV3VXVpZDogc3RyaW5nKTogYW55W10ge1xuICAgICAgICAvLyDkv67mlLnpooTliLbkvZPmlbDmja7ku6XliJvlu7rlia/mnKxcbiAgICAgICAgY29uc3QgbW9kaWZpZWREYXRhID0gWy4uLnByZWZhYkRhdGFdO1xuICAgICAgICBcbiAgICAgICAgLy8g5L+u5pS556ys5LiA5Liq5YWD57Sg77yI6aKE5Yi25L2T6LWE5Lqn77yJXG4gICAgICAgIGlmIChtb2RpZmllZERhdGFbMF0gJiYgbW9kaWZpZWREYXRhWzBdLl9fdHlwZV9fID09PSAnY2MuUHJlZmFiJykge1xuICAgICAgICAgICAgbW9kaWZpZWREYXRhWzBdLl9uYW1lID0gbmV3TmFtZSB8fCAnRHVwbGljYXRlZFByZWZhYic7XG4gICAgICAgIH1cblxuICAgICAgICAvLyDmm7TmlrDmiYDmnIlVVUlE5byV55So77yI566A5YyW54mI5pys77yJXG4gICAgICAgIC8vIOWcqOWunumZheW6lOeUqOS4re+8jOWPr+iDvemcgOimgeabtOWkjeadgueahFVVSUTmmKDlsITlpITnkIZcbiAgICAgICAgXG4gICAgICAgIHJldHVybiBtb2RpZmllZERhdGE7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICog5L2/55SoIGFzc2V0LWRiIEFQSSDliJvlu7rotYTmupDmlofku7ZcbiAgICAgKi9cbiAgICBwcml2YXRlIGFzeW5jIGNyZWF0ZUFzc2V0V2l0aEFzc2V0REIoYXNzZXRQYXRoOiBzdHJpbmcsIGNvbnRlbnQ6IHN0cmluZyk6IFByb21pc2U8eyBzdWNjZXNzOiBib29sZWFuOyBkYXRhPzogYW55OyBlcnJvcj86IHN0cmluZyB9PiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAnY3JlYXRlLWFzc2V0JywgYXNzZXRQYXRoLCBjb250ZW50LCB7XG4gICAgICAgICAgICAgICAgb3ZlcndyaXRlOiB0cnVlLFxuICAgICAgICAgICAgICAgIHJlbmFtZTogZmFsc2VcbiAgICAgICAgICAgIH0pLnRoZW4oKGFzc2V0SW5mbzogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgZGVidWdMb2coJ+WIm+W7uui1hOa6kOaWh+S7tuaIkOWKnzonLCBhc3NldEluZm8pO1xuICAgICAgICAgICAgICAgIHJlc29sdmUoeyBzdWNjZXNzOiB0cnVlLCBkYXRhOiBhc3NldEluZm8gfSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyb3I6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ+WIm+W7uui1hOa6kOaWh+S7tuWksei0pTonLCBlcnJvcik7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3IubWVzc2FnZSB8fCAn5Yib5bu66LWE5rqQ5paH5Lu25aSx6LSlJyB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiDkvb/nlKggYXNzZXQtZGIgQVBJIOWIm+W7uiBtZXRhIOaWh+S7tlxuICAgICAqL1xuICAgIHByaXZhdGUgYXN5bmMgY3JlYXRlTWV0YVdpdGhBc3NldERCKGFzc2V0UGF0aDogc3RyaW5nLCBtZXRhQ29udGVudDogYW55KTogUHJvbWlzZTx7IHN1Y2Nlc3M6IGJvb2xlYW47IGRhdGE/OiBhbnk7IGVycm9yPzogc3RyaW5nIH0+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBtZXRhQ29udGVudFN0cmluZyA9IEpTT04uc3RyaW5naWZ5KG1ldGFDb250ZW50LCBudWxsLCAyKTtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3NhdmUtYXNzZXQtbWV0YScsIGFzc2V0UGF0aCwgbWV0YUNvbnRlbnRTdHJpbmcpLnRoZW4oKGFzc2V0SW5mbzogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgZGVidWdMb2coJ+WIm+W7um1ldGHmlofku7bmiJDlip86JywgYXNzZXRJbmZvKTtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogYXNzZXRJbmZvIH0pO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycm9yOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKCfliJvlu7ptZXRh5paH5Lu25aSx6LSlOicsIGVycm9yKTtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvci5tZXNzYWdlIHx8ICfliJvlu7ptZXRh5paH5Lu25aSx6LSlJyB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiDkvb/nlKggYXNzZXQtZGIgQVBJIOmHjeaWsOWvvOWFpei1hOa6kFxuICAgICAqL1xuICAgIHByaXZhdGUgYXN5bmMgcmVpbXBvcnRBc3NldFdpdGhBc3NldERCKGFzc2V0UGF0aDogc3RyaW5nKTogUHJvbWlzZTx7IHN1Y2Nlc3M6IGJvb2xlYW47IGRhdGE/OiBhbnk7IGVycm9yPzogc3RyaW5nIH0+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdyZWltcG9ydC1hc3NldCcsIGFzc2V0UGF0aCkudGhlbigocmVzdWx0OiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBkZWJ1Z0xvZygn6YeN5paw5a+85YWl6LWE5rqQ5oiQ5YqfOicsIHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IHJlc3VsdCB9KTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnJvcjogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcign6YeN5paw5a+85YWl6LWE5rqQ5aSx6LSlOicsIGVycm9yKTtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvci5tZXNzYWdlIHx8ICfph43mlrDlr7zlhaXotYTmupDlpLHotKUnIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIOS9v+eUqCBhc3NldC1kYiBBUEkg5pu05paw6LWE5rqQ5paH5Lu25YaF5a65XG4gICAgICovXG4gICAgcHJpdmF0ZSBhc3luYyB1cGRhdGVBc3NldFdpdGhBc3NldERCKGFzc2V0UGF0aDogc3RyaW5nLCBjb250ZW50OiBzdHJpbmcpOiBQcm9taXNlPHsgc3VjY2VzczogYm9vbGVhbjsgZGF0YT86IGFueTsgZXJyb3I/OiBzdHJpbmcgfT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3NhdmUtYXNzZXQnLCBhc3NldFBhdGgsIGNvbnRlbnQpLnRoZW4oKHJlc3VsdDogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgZGVidWdMb2coJ+abtOaWsOi1hOa6kOaWh+S7tuaIkOWKnzonLCByZXN1bHQpO1xuICAgICAgICAgICAgICAgIHJlc29sdmUoeyBzdWNjZXNzOiB0cnVlLCBkYXRhOiByZXN1bHQgfSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyb3I6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ+abtOaWsOi1hOa6kOaWh+S7tuWksei0pTonLCBlcnJvcik7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3IubWVzc2FnZSB8fCAn5pu05paw6LWE5rqQ5paH5Lu25aSx6LSlJyB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiDliJvlu7rnrKblkIggQ29jb3MgQ3JlYXRvciDmoIflh4bnmoTpooTliLbkvZPlhoXlrrlcbiAgICAgKiDlrozmlbTlrp7njrDpgJLlvZLoioLngrnmoJHlpITnkIbvvIzljLnphY3lvJXmk47moIflh4bmoLzlvI9cbiAgICAgKi9cbiAgICBwcml2YXRlIGFzeW5jIGNyZWF0ZVN0YW5kYXJkUHJlZmFiQ29udGVudChub2RlRGF0YTogYW55LCBwcmVmYWJOYW1lOiBzdHJpbmcsIHByZWZhYlV1aWQ6IHN0cmluZywgaW5jbHVkZUNoaWxkcmVuOiBib29sZWFuLCBpbmNsdWRlQ29tcG9uZW50czogYm9vbGVhbik6IFByb21pc2U8YW55W10+IHtcbiAgICAgICAgZGVidWdMb2coJ+W8gOWni+WIm+W7uuW8leaTjuagh+WHhumihOWItuS9k+WGheWuuS4uLicpO1xuICAgICAgICBcbiAgICAgICAgY29uc3QgcHJlZmFiRGF0YTogYW55W10gPSBbXTtcbiAgICAgICAgbGV0IGN1cnJlbnRJZCA9IDA7XG5cbiAgICAgICAgLy8gMS4g5Yib5bu66aKE5Yi25L2T6LWE5Lqn5a+56LGhIChpbmRleCAwKVxuICAgICAgICBjb25zdCBwcmVmYWJBc3NldCA9IHtcbiAgICAgICAgICAgIFwiX190eXBlX19cIjogXCJjYy5QcmVmYWJcIixcbiAgICAgICAgICAgIFwiX25hbWVcIjogcHJlZmFiTmFtZSB8fCBcIlwiLCAvLyDnoa7kv53pooTliLbkvZPlkI3np7DkuI3kuLrnqbpcbiAgICAgICAgICAgIFwiX29iakZsYWdzXCI6IDAsXG4gICAgICAgICAgICBcIl9fZWRpdG9yRXh0cmFzX19cIjoge30sXG4gICAgICAgICAgICBcIl9uYXRpdmVcIjogXCJcIixcbiAgICAgICAgICAgIFwiZGF0YVwiOiB7XG4gICAgICAgICAgICAgICAgXCJfX2lkX19cIjogMVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwib3B0aW1pemF0aW9uUG9saWN5XCI6IDAsXG4gICAgICAgICAgICBcInBlcnNpc3RlbnRcIjogZmFsc2VcbiAgICAgICAgfTtcbiAgICAgICAgcHJlZmFiRGF0YS5wdXNoKHByZWZhYkFzc2V0KTtcbiAgICAgICAgY3VycmVudElkKys7XG5cbiAgICAgICAgLy8gMi4g6YCS5b2S5Yib5bu65a6M5pW055qE6IqC54K55qCR57uT5p6EXG4gICAgICAgIGNvbnN0IGNvbnRleHQgPSB7XG4gICAgICAgICAgICBwcmVmYWJEYXRhLFxuICAgICAgICAgICAgY3VycmVudElkOiBjdXJyZW50SWQgKyAxLCAvLyDmoLnoioLngrnljaDnlKjntKLlvJUx77yM5a2Q6IqC54K55LuO57Si5byVMuW8gOWni1xuICAgICAgICAgICAgcHJlZmFiQXNzZXRJbmRleDogMCxcbiAgICAgICAgICAgIG5vZGVGaWxlSWRzOiBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpLCAvLyDlrZjlgqjoioLngrlJROWIsGZpbGVJZOeahOaYoOWwhFxuICAgICAgICAgICAgbm9kZVV1aWRUb0luZGV4OiBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpLCAvLyDlrZjlgqjoioLngrlVVUlE5Yiw57Si5byV55qE5pig5bCEXG4gICAgICAgICAgICBjb21wb25lbnRVdWlkVG9JbmRleDogbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKSAvLyDlrZjlgqjnu4Tku7ZVVUlE5Yiw57Si5byV55qE5pig5bCEXG4gICAgICAgIH07XG5cbiAgICAgICAgLy8g5Yib5bu65qC56IqC54K55ZKM5pW05Liq6IqC54K55qCRIC0g5rOo5oSP77ya5qC56IqC54K555qE54i26IqC54K55bqU6K+l5pivbnVsbO+8jOS4jeaYr+mihOWItuS9k+WvueixoVxuICAgICAgICBhd2FpdCB0aGlzLmNyZWF0ZUNvbXBsZXRlTm9kZVRyZWUobm9kZURhdGEsIG51bGwsIDEsIGNvbnRleHQsIGluY2x1ZGVDaGlsZHJlbiwgaW5jbHVkZUNvbXBvbmVudHMsIHByZWZhYk5hbWUpO1xuXG4gICAgICAgIGRlYnVnTG9nKGDpooTliLbkvZPlhoXlrrnliJvlu7rlrozmiJDvvIzmgLvlhbEgJHtwcmVmYWJEYXRhLmxlbmd0aH0g5Liq5a+56LGhYCk7XG4gICAgICAgIGRlYnVnTG9nKCfoioLngrlmaWxlSWTmmKDlsIQ6JywgQXJyYXkuZnJvbShjb250ZXh0Lm5vZGVGaWxlSWRzLmVudHJpZXMoKSkpO1xuICAgICAgICBcbiAgICAgICAgcmV0dXJuIHByZWZhYkRhdGE7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICog6YCS5b2S5Yib5bu65a6M5pW055qE6IqC54K55qCR77yM5YyF5ous5omA5pyJ5a2Q6IqC54K55ZKM5a+55bqU55qEUHJlZmFiSW5mb1xuICAgICAqL1xuICAgIHByaXZhdGUgYXN5bmMgY3JlYXRlQ29tcGxldGVOb2RlVHJlZShcbiAgICAgICAgbm9kZURhdGE6IGFueSwgXG4gICAgICAgIHBhcmVudE5vZGVJbmRleDogbnVtYmVyIHwgbnVsbCwgXG4gICAgICAgIG5vZGVJbmRleDogbnVtYmVyLFxuICAgICAgICBjb250ZXh0OiB7IFxuICAgICAgICAgICAgcHJlZmFiRGF0YTogYW55W10sIFxuICAgICAgICAgICAgY3VycmVudElkOiBudW1iZXIsIFxuICAgICAgICAgICAgcHJlZmFiQXNzZXRJbmRleDogbnVtYmVyLCBcbiAgICAgICAgICAgIG5vZGVGaWxlSWRzOiBNYXA8c3RyaW5nLCBzdHJpbmc+LFxuICAgICAgICAgICAgbm9kZVV1aWRUb0luZGV4OiBNYXA8c3RyaW5nLCBudW1iZXI+LFxuICAgICAgICAgICAgY29tcG9uZW50VXVpZFRvSW5kZXg6IE1hcDxzdHJpbmcsIG51bWJlcj5cbiAgICAgICAgfSxcbiAgICAgICAgaW5jbHVkZUNoaWxkcmVuOiBib29sZWFuLFxuICAgICAgICBpbmNsdWRlQ29tcG9uZW50czogYm9vbGVhbixcbiAgICAgICAgbm9kZU5hbWU/OiBzdHJpbmdcbiAgICApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgICAgY29uc3QgeyBwcmVmYWJEYXRhIH0gPSBjb250ZXh0O1xuICAgICAgICBcbiAgICAgICAgLy8g5Yib5bu66IqC54K55a+56LGhXG4gICAgICAgIGNvbnN0IG5vZGUgPSB0aGlzLmNyZWF0ZUVuZ2luZVN0YW5kYXJkTm9kZShub2RlRGF0YSwgcGFyZW50Tm9kZUluZGV4LCBub2RlTmFtZSk7XG4gICAgICAgIFxuICAgICAgICAvLyDnoa7kv53oioLngrnlnKjmjIflrprnmoTntKLlvJXkvY3nva5cbiAgICAgICAgd2hpbGUgKHByZWZhYkRhdGEubGVuZ3RoIDw9IG5vZGVJbmRleCkge1xuICAgICAgICAgICAgcHJlZmFiRGF0YS5wdXNoKG51bGwpO1xuICAgICAgICB9XG4gICAgICAgIGRlYnVnTG9nKGDorr7nva7oioLngrnliLDntKLlvJUgJHtub2RlSW5kZXh9OiAke25vZGUuX25hbWV9LCBfcGFyZW50OmAsIG5vZGUuX3BhcmVudCwgYF9jaGlsZHJlbiBjb3VudDogJHtub2RlLl9jaGlsZHJlbi5sZW5ndGh9YCk7XG4gICAgICAgIHByZWZhYkRhdGFbbm9kZUluZGV4XSA9IG5vZGU7XG4gICAgICAgIFxuICAgICAgICAvLyDkuLrlvZPliY3oioLngrnnlJ/miJBmaWxlSWTlubborrDlvZVVVUlE5Yiw57Si5byV55qE5pig5bCEXG4gICAgICAgIGNvbnN0IG5vZGVVdWlkID0gdGhpcy5leHRyYWN0Tm9kZVV1aWQobm9kZURhdGEpO1xuICAgICAgICBjb25zdCBmaWxlSWQgPSBub2RlVXVpZCB8fCB0aGlzLmdlbmVyYXRlRmlsZUlkKCk7XG4gICAgICAgIGNvbnRleHQubm9kZUZpbGVJZHMuc2V0KG5vZGVJbmRleC50b1N0cmluZygpLCBmaWxlSWQpO1xuICAgICAgICBcbiAgICAgICAgLy8g6K6w5b2V6IqC54K5VVVJROWIsOe0ouW8leeahOaYoOWwhFxuICAgICAgICBpZiAobm9kZVV1aWQpIHtcbiAgICAgICAgICAgIGNvbnRleHQubm9kZVV1aWRUb0luZGV4LnNldChub2RlVXVpZCwgbm9kZUluZGV4KTtcbiAgICAgICAgICAgIGRlYnVnTG9nKGDorrDlvZXoioLngrlVVUlE5pig5bCEOiAke25vZGVVdWlkfSAtPiAke25vZGVJbmRleH1gKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIOWFiOWkhOeQhuWtkOiKgueCue+8iOS/neaMgeS4juaJi+WKqOWIm+W7uueahOe0ouW8lemhuuW6j+S4gOiHtO+8iVxuICAgICAgICBjb25zdCBjaGlsZHJlblRvUHJvY2VzcyA9IHRoaXMuZ2V0Q2hpbGRyZW5Ub1Byb2Nlc3Mobm9kZURhdGEpO1xuICAgICAgICBpZiAoaW5jbHVkZUNoaWxkcmVuICYmIGNoaWxkcmVuVG9Qcm9jZXNzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGRlYnVnTG9nKGDlpITnkIboioLngrkgJHtub2RlLl9uYW1lfSDnmoQgJHtjaGlsZHJlblRvUHJvY2Vzcy5sZW5ndGh9IOS4quWtkOiKgueCuWApO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyDkuLrmr4/kuKrlrZDoioLngrnliIbphY3ntKLlvJVcbiAgICAgICAgICAgIGNvbnN0IGNoaWxkSW5kaWNlczogbnVtYmVyW10gPSBbXTtcbiAgICAgICAgICAgIGRlYnVnTG9nKGDlh4blpIfkuLogJHtjaGlsZHJlblRvUHJvY2Vzcy5sZW5ndGh9IOS4quWtkOiKgueCueWIhumFjee0ouW8le+8jOW9k+WJjUlEOiAke2NvbnRleHQuY3VycmVudElkfWApO1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjaGlsZHJlblRvUHJvY2Vzcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIGRlYnVnTG9nKGDlpITnkIbnrKwgJHtpKzF9IOS4quWtkOiKgueCue+8jOW9k+WJjWN1cnJlbnRJZDogJHtjb250ZXh0LmN1cnJlbnRJZH1gKTtcbiAgICAgICAgICAgICAgICBjb25zdCBjaGlsZEluZGV4ID0gY29udGV4dC5jdXJyZW50SWQrKztcbiAgICAgICAgICAgICAgICBjaGlsZEluZGljZXMucHVzaChjaGlsZEluZGV4KTtcbiAgICAgICAgICAgICAgICBub2RlLl9jaGlsZHJlbi5wdXNoKHsgXCJfX2lkX19cIjogY2hpbGRJbmRleCB9KTtcbiAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhg4pyFIOa3u+WKoOWtkOiKgueCueW8leeUqOWIsCAke25vZGUuX25hbWV9OiB7X19pZF9fOiAke2NoaWxkSW5kZXh9fWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZGVidWdMb2coYOKchSDoioLngrkgJHtub2RlLl9uYW1lfSDmnIDnu4jnmoTlrZDoioLngrnmlbDnu4Q6YCwgbm9kZS5fY2hpbGRyZW4pO1xuXG4gICAgICAgICAgICAvLyDpgJLlvZLliJvlu7rlrZDoioLngrlcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY2hpbGRyZW5Ub1Byb2Nlc3MubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICBjb25zdCBjaGlsZERhdGEgPSBjaGlsZHJlblRvUHJvY2Vzc1tpXTtcbiAgICAgICAgICAgICAgICBjb25zdCBjaGlsZEluZGV4ID0gY2hpbGRJbmRpY2VzW2ldO1xuICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMuY3JlYXRlQ29tcGxldGVOb2RlVHJlZShcbiAgICAgICAgICAgICAgICAgICAgY2hpbGREYXRhLCBcbiAgICAgICAgICAgICAgICAgICAgbm9kZUluZGV4LCBcbiAgICAgICAgICAgICAgICAgICAgY2hpbGRJbmRleCwgXG4gICAgICAgICAgICAgICAgICAgIGNvbnRleHQsXG4gICAgICAgICAgICAgICAgICAgIGluY2x1ZGVDaGlsZHJlbixcbiAgICAgICAgICAgICAgICAgICAgaW5jbHVkZUNvbXBvbmVudHMsXG4gICAgICAgICAgICAgICAgICAgIGNoaWxkRGF0YS5uYW1lIHx8IGBDaGlsZCR7aSsxfWBcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8g54S25ZCO5aSE55CG57uE5Lu2XG4gICAgICAgIGlmIChpbmNsdWRlQ29tcG9uZW50cyAmJiBub2RlRGF0YS5jb21wb25lbnRzICYmIEFycmF5LmlzQXJyYXkobm9kZURhdGEuY29tcG9uZW50cykpIHtcbiAgICAgICAgICAgIGRlYnVnTG9nKGDlpITnkIboioLngrkgJHtub2RlLl9uYW1lfSDnmoQgJHtub2RlRGF0YS5jb21wb25lbnRzLmxlbmd0aH0g5Liq57uE5Lu2YCk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGNvbnN0IGNvbXBvbmVudEluZGljZXM6IG51bWJlcltdID0gW107XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGNvbXBvbmVudCBvZiBub2RlRGF0YS5jb21wb25lbnRzKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgY29tcG9uZW50SW5kZXggPSBjb250ZXh0LmN1cnJlbnRJZCsrO1xuICAgICAgICAgICAgICAgIGNvbXBvbmVudEluZGljZXMucHVzaChjb21wb25lbnRJbmRleCk7XG4gICAgICAgICAgICAgICAgbm9kZS5fY29tcG9uZW50cy5wdXNoKHsgXCJfX2lkX19cIjogY29tcG9uZW50SW5kZXggfSk7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgLy8g6K6w5b2V57uE5Lu2VVVJROWIsOe0ouW8leeahOaYoOWwhFxuICAgICAgICAgICAgICAgIGNvbnN0IGNvbXBvbmVudFV1aWQgPSBjb21wb25lbnQudXVpZCB8fCAoY29tcG9uZW50LnZhbHVlICYmIGNvbXBvbmVudC52YWx1ZS51dWlkKTtcbiAgICAgICAgICAgICAgICBpZiAoY29tcG9uZW50VXVpZCkge1xuICAgICAgICAgICAgICAgICAgICBjb250ZXh0LmNvbXBvbmVudFV1aWRUb0luZGV4LnNldChjb21wb25lbnRVdWlkLCBjb21wb25lbnRJbmRleCk7XG4gICAgICAgICAgICAgICAgICAgIGRlYnVnTG9nKGDorrDlvZXnu4Tku7ZVVUlE5pig5bCEOiAke2NvbXBvbmVudFV1aWR9IC0+ICR7Y29tcG9uZW50SW5kZXh9YCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIC8vIOWIm+W7uue7hOS7tuWvueixoe+8jOS8oOWFpWNvbnRleHTku6XlpITnkIblvJXnlKhcbiAgICAgICAgICAgICAgICBjb25zdCBjb21wb25lbnRPYmogPSB0aGlzLmNyZWF0ZUNvbXBvbmVudE9iamVjdChjb21wb25lbnQsIG5vZGVJbmRleCwgY29udGV4dCk7XG4gICAgICAgICAgICAgICAgcHJlZmFiRGF0YVtjb21wb25lbnRJbmRleF0gPSBjb21wb25lbnRPYmo7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgLy8g5Li657uE5Lu25Yib5bu6IENvbXBQcmVmYWJJbmZvXG4gICAgICAgICAgICAgICAgY29uc3QgY29tcFByZWZhYkluZm9JbmRleCA9IGNvbnRleHQuY3VycmVudElkKys7XG4gICAgICAgICAgICAgICAgcHJlZmFiRGF0YVtjb21wUHJlZmFiSW5mb0luZGV4XSA9IHtcbiAgICAgICAgICAgICAgICAgICAgXCJfX3R5cGVfX1wiOiBcImNjLkNvbXBQcmVmYWJJbmZvXCIsXG4gICAgICAgICAgICAgICAgICAgIFwiZmlsZUlkXCI6IHRoaXMuZ2VuZXJhdGVGaWxlSWQoKVxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgLy8g5aaC5p6c57uE5Lu25a+56LGh5pyJIF9fcHJlZmFiIOWxnuaAp++8jOiuvue9ruW8leeUqFxuICAgICAgICAgICAgICAgIGlmIChjb21wb25lbnRPYmogJiYgdHlwZW9mIGNvbXBvbmVudE9iaiA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50T2JqLl9fcHJlZmFiID0geyBcIl9faWRfX1wiOiBjb21wUHJlZmFiSW5mb0luZGV4IH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICBkZWJ1Z0xvZyhg4pyFIOiKgueCuSAke25vZGUuX25hbWV9IOa3u+WKoOS6hiAke2NvbXBvbmVudEluZGljZXMubGVuZ3RofSDkuKrnu4Tku7ZgKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8g5Li65b2T5YmN6IqC54K55Yib5bu6UHJlZmFiSW5mb1xuICAgICAgICBjb25zdCBwcmVmYWJJbmZvSW5kZXggPSBjb250ZXh0LmN1cnJlbnRJZCsrO1xuICAgICAgICBub2RlLl9wcmVmYWIgPSB7IFwiX19pZF9fXCI6IHByZWZhYkluZm9JbmRleCB9O1xuICAgICAgICBcbiAgICAgICAgY29uc3QgcHJlZmFiSW5mbzogYW55ID0ge1xuICAgICAgICAgICAgXCJfX3R5cGVfX1wiOiBcImNjLlByZWZhYkluZm9cIixcbiAgICAgICAgICAgIFwicm9vdFwiOiB7IFwiX19pZF9fXCI6IDEgfSxcbiAgICAgICAgICAgIFwiYXNzZXRcIjogeyBcIl9faWRfX1wiOiBjb250ZXh0LnByZWZhYkFzc2V0SW5kZXggfSxcbiAgICAgICAgICAgIFwiZmlsZUlkXCI6IGZpbGVJZCxcbiAgICAgICAgICAgIFwidGFyZ2V0T3ZlcnJpZGVzXCI6IG51bGwsXG4gICAgICAgICAgICBcIm5lc3RlZFByZWZhYkluc3RhbmNlUm9vdHNcIjogbnVsbFxuICAgICAgICB9O1xuICAgICAgICBcbiAgICAgICAgLy8g5qC56IqC54K555qE54m55q6K5aSE55CGXG4gICAgICAgIGlmIChub2RlSW5kZXggPT09IDEpIHtcbiAgICAgICAgICAgIC8vIOagueiKgueCueayoeaciWluc3RhbmNl77yM5L2G5Y+v6IO95pyJdGFyZ2V0T3ZlcnJpZGVzXG4gICAgICAgICAgICBwcmVmYWJJbmZvLmluc3RhbmNlID0gbnVsbDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIOWtkOiKgueCuemAmuW4uOaciWluc3RhbmNl5Li6bnVsbFxuICAgICAgICAgICAgcHJlZmFiSW5mby5pbnN0YW5jZSA9IG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHByZWZhYkRhdGFbcHJlZmFiSW5mb0luZGV4XSA9IHByZWZhYkluZm87XG4gICAgICAgIGNvbnRleHQuY3VycmVudElkID0gcHJlZmFiSW5mb0luZGV4ICsgMTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiDlsIZVVUlE6L2s5o2i5Li6Q29jb3MgQ3JlYXRvcueahOWOi+e8qeagvOW8j1xuICAgICAqIOWfuuS6juecn+WunkNvY29zIENyZWF0b3LnvJbovpHlmajnmoTljovnvKnnrpfms5Xlrp7njrBcbiAgICAgKiDliY015LiqaGV45a2X56ym5L+d5oyB5LiN5Y+Y77yM5Ymp5L2ZMjfkuKrlrZfnrKbljovnvKnmiJAxOOS4quWtl+esplxuICAgICAqL1xuICAgIHByaXZhdGUgdXVpZFRvQ29tcHJlc3NlZElkKHV1aWQ6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgICAgIGNvbnN0IEJBU0U2NF9LRVlTID0gJ0FCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXowMTIzNDU2Nzg5Ky89JztcbiAgICAgICAgXG4gICAgICAgIC8vIOenu+mZpOi/nuWtl+espuW5tui9rOS4uuWwj+WGmVxuICAgICAgICBjb25zdCBjbGVhblV1aWQgPSB1dWlkLnJlcGxhY2UoLy0vZywgJycpLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIFxuICAgICAgICAvLyDnoa7kv51VVUlE5pyJ5pWIXG4gICAgICAgIGlmIChjbGVhblV1aWQubGVuZ3RoICE9PSAzMikge1xuICAgICAgICAgICAgcmV0dXJuIHV1aWQ7IC8vIOWmguaenOS4jeaYr+acieaViOeahFVVSUTvvIzov5Tlm57ljp/lp4vlgLxcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgLy8gQ29jb3MgQ3JlYXRvcueahOWOi+e8qeeul+azle+8muWJjTXkuKrlrZfnrKbkv53mjIHkuI3lj5jvvIzliankvZkyN+S4quWtl+espuWOi+e8qeaIkDE45Liq5a2X56ymXG4gICAgICAgIGxldCByZXN1bHQgPSBjbGVhblV1aWQuc3Vic3RyaW5nKDAsIDUpO1xuICAgICAgICBcbiAgICAgICAgLy8g5Ymp5L2ZMjfkuKrlrZfnrKbpnIDopoHljovnvKnmiJAxOOS4quWtl+esplxuICAgICAgICBjb25zdCByZW1haW5kZXIgPSBjbGVhblV1aWQuc3Vic3RyaW5nKDUpO1xuICAgICAgICBcbiAgICAgICAgLy8g5q+PM+S4qmhleOWtl+espuWOi+e8qeaIkDLkuKrlrZfnrKZcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCByZW1haW5kZXIubGVuZ3RoOyBpICs9IDMpIHtcbiAgICAgICAgICAgIGNvbnN0IGhleDEgPSByZW1haW5kZXJbaV0gfHwgJzAnO1xuICAgICAgICAgICAgY29uc3QgaGV4MiA9IHJlbWFpbmRlcltpICsgMV0gfHwgJzAnO1xuICAgICAgICAgICAgY29uc3QgaGV4MyA9IHJlbWFpbmRlcltpICsgMl0gfHwgJzAnO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyDlsIYz5LiqaGV45a2X56ymKDEy5L2NKei9rOaNouS4ujLkuKpiYXNlNjTlrZfnrKZcbiAgICAgICAgICAgIGNvbnN0IHZhbHVlID0gcGFyc2VJbnQoaGV4MSArIGhleDIgKyBoZXgzLCAxNik7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIDEy5L2N5YiG5oiQ5Lik5LiqNuS9jVxuICAgICAgICAgICAgY29uc3QgaGlnaDYgPSAodmFsdWUgPj4gNikgJiA2MztcbiAgICAgICAgICAgIGNvbnN0IGxvdzYgPSB2YWx1ZSAmIDYzO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICByZXN1bHQgKz0gQkFTRTY0X0tFWVNbaGlnaDZdICsgQkFTRTY0X0tFWVNbbG93Nl07XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICog5Yib5bu657uE5Lu25a+56LGhXG4gICAgICovXG4gICAgcHJpdmF0ZSBjcmVhdGVDb21wb25lbnRPYmplY3QoY29tcG9uZW50RGF0YTogYW55LCBub2RlSW5kZXg6IG51bWJlciwgY29udGV4dD86IHsgXG4gICAgICAgIG5vZGVVdWlkVG9JbmRleD86IE1hcDxzdHJpbmcsIG51bWJlcj4sXG4gICAgICAgIGNvbXBvbmVudFV1aWRUb0luZGV4PzogTWFwPHN0cmluZywgbnVtYmVyPlxuICAgIH0pOiBhbnkge1xuICAgICAgICBsZXQgY29tcG9uZW50VHlwZSA9IGNvbXBvbmVudERhdGEudHlwZSB8fCBjb21wb25lbnREYXRhLl9fdHlwZV9fIHx8ICdjYy5Db21wb25lbnQnO1xuICAgICAgICBjb25zdCBlbmFibGVkID0gY29tcG9uZW50RGF0YS5lbmFibGVkICE9PSB1bmRlZmluZWQgPyBjb21wb25lbnREYXRhLmVuYWJsZWQgOiB0cnVlO1xuICAgICAgICBcbiAgICAgICAgLy8gZGVidWdMb2coYOWIm+W7uue7hOS7tuWvueixoSAtIOWOn+Wni+exu+WeizogJHtjb21wb25lbnRUeXBlfWApO1xuICAgICAgICAvLyBkZWJ1Z0xvZygn57uE5Lu25a6M5pW05pWw5o2uOicsIEpTT04uc3RyaW5naWZ5KGNvbXBvbmVudERhdGEsIG51bGwsIDIpKTtcbiAgICAgICAgXG4gICAgICAgIC8vIOWkhOeQhuiEmuacrOe7hOS7tiAtIE1DUOaOpeWPo+W3sue7j+i/lOWbnuato+ehrueahOWOi+e8qVVVSUTmoLzlvI9cbiAgICAgICAgaWYgKGNvbXBvbmVudFR5cGUgJiYgIWNvbXBvbmVudFR5cGUuc3RhcnRzV2l0aCgnY2MuJykpIHtcbiAgICAgICAgICAgIGRlYnVnTG9nKGDkvb/nlKjohJrmnKznu4Tku7bljovnvKlVVUlE57G75Z6LOiAke2NvbXBvbmVudFR5cGV9YCk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vIOWfuuehgOe7hOS7tue7k+aehFxuICAgICAgICBjb25zdCBjb21wb25lbnQ6IGFueSA9IHtcbiAgICAgICAgICAgIFwiX190eXBlX19cIjogY29tcG9uZW50VHlwZSxcbiAgICAgICAgICAgIFwiX25hbWVcIjogXCJcIixcbiAgICAgICAgICAgIFwiX29iakZsYWdzXCI6IDAsXG4gICAgICAgICAgICBcIl9fZWRpdG9yRXh0cmFzX19cIjoge30sXG4gICAgICAgICAgICBcIm5vZGVcIjogeyBcIl9faWRfX1wiOiBub2RlSW5kZXggfSxcbiAgICAgICAgICAgIFwiX2VuYWJsZWRcIjogZW5hYmxlZFxuICAgICAgICB9O1xuICAgICAgICBcbiAgICAgICAgLy8g5o+Q5YmN6K6+572uIF9fcHJlZmFiIOWxnuaAp+WNoOS9jeespu+8jOWQjue7reS8muiiq+ato+ehruiuvue9rlxuICAgICAgICBjb21wb25lbnQuX19wcmVmYWIgPSBudWxsO1xuICAgICAgICBcbiAgICAgICAgLy8g5qC55o2u57uE5Lu257G75Z6L5re75Yqg54m55a6a5bGe5oCnXG4gICAgICAgIGlmIChjb21wb25lbnRUeXBlID09PSAnY2MuVUlUcmFuc2Zvcm0nKSB7XG4gICAgICAgICAgICBjb25zdCBjb250ZW50U2l6ZSA9IGNvbXBvbmVudERhdGEucHJvcGVydGllcz8uY29udGVudFNpemU/LnZhbHVlIHx8IHsgd2lkdGg6IDEwMCwgaGVpZ2h0OiAxMDAgfTtcbiAgICAgICAgICAgIGNvbnN0IGFuY2hvclBvaW50ID0gY29tcG9uZW50RGF0YS5wcm9wZXJ0aWVzPy5hbmNob3JQb2ludD8udmFsdWUgfHwgeyB4OiAwLjUsIHk6IDAuNSB9O1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBjb21wb25lbnQuX2NvbnRlbnRTaXplID0ge1xuICAgICAgICAgICAgICAgIFwiX190eXBlX19cIjogXCJjYy5TaXplXCIsXG4gICAgICAgICAgICAgICAgXCJ3aWR0aFwiOiBjb250ZW50U2l6ZS53aWR0aCxcbiAgICAgICAgICAgICAgICBcImhlaWdodFwiOiBjb250ZW50U2l6ZS5oZWlnaHRcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBjb21wb25lbnQuX2FuY2hvclBvaW50ID0ge1xuICAgICAgICAgICAgICAgIFwiX190eXBlX19cIjogXCJjYy5WZWMyXCIsXG4gICAgICAgICAgICAgICAgXCJ4XCI6IGFuY2hvclBvaW50LngsXG4gICAgICAgICAgICAgICAgXCJ5XCI6IGFuY2hvclBvaW50LnlcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gZWxzZSBpZiAoY29tcG9uZW50VHlwZSA9PT0gJ2NjLlNwcml0ZScpIHtcbiAgICAgICAgICAgIC8vIOWkhOeQhlNwcml0Zee7hOS7tueahHNwcml0ZUZyYW1l5byV55SoXG4gICAgICAgICAgICBjb25zdCBzcHJpdGVGcmFtZVByb3AgPSBjb21wb25lbnREYXRhLnByb3BlcnRpZXM/Ll9zcHJpdGVGcmFtZSB8fCBjb21wb25lbnREYXRhLnByb3BlcnRpZXM/LnNwcml0ZUZyYW1lO1xuICAgICAgICAgICAgaWYgKHNwcml0ZUZyYW1lUHJvcCkge1xuICAgICAgICAgICAgICAgIGNvbXBvbmVudC5fc3ByaXRlRnJhbWUgPSB0aGlzLnByb2Nlc3NDb21wb25lbnRQcm9wZXJ0eShzcHJpdGVGcmFtZVByb3AsIGNvbnRleHQpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb21wb25lbnQuX3Nwcml0ZUZyYW1lID0gbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgY29tcG9uZW50Ll90eXBlID0gY29tcG9uZW50RGF0YS5wcm9wZXJ0aWVzPy5fdHlwZT8udmFsdWUgPz8gMDtcbiAgICAgICAgICAgIGNvbXBvbmVudC5fZmlsbFR5cGUgPSBjb21wb25lbnREYXRhLnByb3BlcnRpZXM/Ll9maWxsVHlwZT8udmFsdWUgPz8gMDtcbiAgICAgICAgICAgIGNvbXBvbmVudC5fc2l6ZU1vZGUgPSBjb21wb25lbnREYXRhLnByb3BlcnRpZXM/Ll9zaXplTW9kZT8udmFsdWUgPz8gMTtcbiAgICAgICAgICAgIGNvbXBvbmVudC5fZmlsbENlbnRlciA9IHsgXCJfX3R5cGVfX1wiOiBcImNjLlZlYzJcIiwgXCJ4XCI6IDAsIFwieVwiOiAwIH07XG4gICAgICAgICAgICBjb21wb25lbnQuX2ZpbGxTdGFydCA9IGNvbXBvbmVudERhdGEucHJvcGVydGllcz8uX2ZpbGxTdGFydD8udmFsdWUgPz8gMDtcbiAgICAgICAgICAgIGNvbXBvbmVudC5fZmlsbFJhbmdlID0gY29tcG9uZW50RGF0YS5wcm9wZXJ0aWVzPy5fZmlsbFJhbmdlPy52YWx1ZSA/PyAwO1xuICAgICAgICAgICAgY29tcG9uZW50Ll9pc1RyaW1tZWRNb2RlID0gY29tcG9uZW50RGF0YS5wcm9wZXJ0aWVzPy5faXNUcmltbWVkTW9kZT8udmFsdWUgPz8gdHJ1ZTtcbiAgICAgICAgICAgIGNvbXBvbmVudC5fdXNlR3JheXNjYWxlID0gY29tcG9uZW50RGF0YS5wcm9wZXJ0aWVzPy5fdXNlR3JheXNjYWxlPy52YWx1ZSA/PyBmYWxzZTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8g6LCD6K+V77ya5omT5Y2wU3ByaXRl57uE5Lu255qE5omA5pyJ5bGe5oCn77yI5bey5rOo6YeK77yJXG4gICAgICAgICAgICAvLyBkZWJ1Z0xvZygnU3ByaXRl57uE5Lu25bGe5oCnOicsIEpTT04uc3RyaW5naWZ5KGNvbXBvbmVudERhdGEucHJvcGVydGllcywgbnVsbCwgMikpO1xuICAgICAgICAgICAgY29tcG9uZW50Ll9hdGxhcyA9IG51bGw7XG4gICAgICAgICAgICBjb21wb25lbnQuX2lkID0gXCJcIjtcbiAgICAgICAgfSBlbHNlIGlmIChjb21wb25lbnRUeXBlID09PSAnY2MuQnV0dG9uJykge1xuICAgICAgICAgICAgY29tcG9uZW50Ll9pbnRlcmFjdGFibGUgPSB0cnVlO1xuICAgICAgICAgICAgY29tcG9uZW50Ll90cmFuc2l0aW9uID0gMztcbiAgICAgICAgICAgIGNvbXBvbmVudC5fbm9ybWFsQ29sb3IgPSB7IFwiX190eXBlX19cIjogXCJjYy5Db2xvclwiLCBcInJcIjogMjU1LCBcImdcIjogMjU1LCBcImJcIjogMjU1LCBcImFcIjogMjU1IH07XG4gICAgICAgICAgICBjb21wb25lbnQuX2hvdmVyQ29sb3IgPSB7IFwiX190eXBlX19cIjogXCJjYy5Db2xvclwiLCBcInJcIjogMjExLCBcImdcIjogMjExLCBcImJcIjogMjExLCBcImFcIjogMjU1IH07XG4gICAgICAgICAgICBjb21wb25lbnQuX3ByZXNzZWRDb2xvciA9IHsgXCJfX3R5cGVfX1wiOiBcImNjLkNvbG9yXCIsIFwiclwiOiAyNTUsIFwiZ1wiOiAyNTUsIFwiYlwiOiAyNTUsIFwiYVwiOiAyNTUgfTtcbiAgICAgICAgICAgIGNvbXBvbmVudC5fZGlzYWJsZWRDb2xvciA9IHsgXCJfX3R5cGVfX1wiOiBcImNjLkNvbG9yXCIsIFwiclwiOiAxMjQsIFwiZ1wiOiAxMjQsIFwiYlwiOiAxMjQsIFwiYVwiOiAyNTUgfTtcbiAgICAgICAgICAgIGNvbXBvbmVudC5fbm9ybWFsU3ByaXRlID0gbnVsbDtcbiAgICAgICAgICAgIGNvbXBvbmVudC5faG92ZXJTcHJpdGUgPSBudWxsO1xuICAgICAgICAgICAgY29tcG9uZW50Ll9wcmVzc2VkU3ByaXRlID0gbnVsbDtcbiAgICAgICAgICAgIGNvbXBvbmVudC5fZGlzYWJsZWRTcHJpdGUgPSBudWxsO1xuICAgICAgICAgICAgY29tcG9uZW50Ll9kdXJhdGlvbiA9IDAuMTtcbiAgICAgICAgICAgIGNvbXBvbmVudC5fem9vbVNjYWxlID0gMS4yO1xuICAgICAgICAgICAgLy8g5aSE55CGQnV0dG9u55qEdGFyZ2V05byV55SoXG4gICAgICAgICAgICBjb25zdCB0YXJnZXRQcm9wID0gY29tcG9uZW50RGF0YS5wcm9wZXJ0aWVzPy5fdGFyZ2V0IHx8IGNvbXBvbmVudERhdGEucHJvcGVydGllcz8udGFyZ2V0O1xuICAgICAgICAgICAgaWYgKHRhcmdldFByb3ApIHtcbiAgICAgICAgICAgICAgICBjb21wb25lbnQuX3RhcmdldCA9IHRoaXMucHJvY2Vzc0NvbXBvbmVudFByb3BlcnR5KHRhcmdldFByb3AsIGNvbnRleHQpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb21wb25lbnQuX3RhcmdldCA9IHsgXCJfX2lkX19cIjogbm9kZUluZGV4IH07IC8vIOm7mOiupOaMh+WQkeiHqui6q+iKgueCuVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29tcG9uZW50Ll9jbGlja0V2ZW50cyA9IFtdO1xuICAgICAgICAgICAgY29tcG9uZW50Ll9pZCA9IFwiXCI7XG4gICAgICAgIH0gZWxzZSBpZiAoY29tcG9uZW50VHlwZSA9PT0gJ2NjLkxhYmVsJykge1xuICAgICAgICAgICAgY29tcG9uZW50Ll9zdHJpbmcgPSBjb21wb25lbnREYXRhLnByb3BlcnRpZXM/Ll9zdHJpbmc/LnZhbHVlIHx8IFwiTGFiZWxcIjtcbiAgICAgICAgICAgIGNvbXBvbmVudC5faG9yaXpvbnRhbEFsaWduID0gMTtcbiAgICAgICAgICAgIGNvbXBvbmVudC5fdmVydGljYWxBbGlnbiA9IDE7XG4gICAgICAgICAgICBjb21wb25lbnQuX2FjdHVhbEZvbnRTaXplID0gMjA7XG4gICAgICAgICAgICBjb21wb25lbnQuX2ZvbnRTaXplID0gMjA7XG4gICAgICAgICAgICBjb21wb25lbnQuX2ZvbnRGYW1pbHkgPSBcIkFyaWFsXCI7XG4gICAgICAgICAgICBjb21wb25lbnQuX2xpbmVIZWlnaHQgPSAyNTtcbiAgICAgICAgICAgIGNvbXBvbmVudC5fb3ZlcmZsb3cgPSAwO1xuICAgICAgICAgICAgY29tcG9uZW50Ll9lbmFibGVXcmFwVGV4dCA9IHRydWU7XG4gICAgICAgICAgICBjb21wb25lbnQuX2ZvbnQgPSBudWxsO1xuICAgICAgICAgICAgY29tcG9uZW50Ll9pc1N5c3RlbUZvbnRVc2VkID0gdHJ1ZTtcbiAgICAgICAgICAgIGNvbXBvbmVudC5fc3BhY2luZ1ggPSAwO1xuICAgICAgICAgICAgY29tcG9uZW50Ll9pc0l0YWxpYyA9IGZhbHNlO1xuICAgICAgICAgICAgY29tcG9uZW50Ll9pc0JvbGQgPSBmYWxzZTtcbiAgICAgICAgICAgIGNvbXBvbmVudC5faXNVbmRlcmxpbmUgPSBmYWxzZTtcbiAgICAgICAgICAgIGNvbXBvbmVudC5fdW5kZXJsaW5lSGVpZ2h0ID0gMjtcbiAgICAgICAgICAgIGNvbXBvbmVudC5fY2FjaGVNb2RlID0gMDtcbiAgICAgICAgICAgIGNvbXBvbmVudC5faWQgPSBcIlwiO1xuICAgICAgICB9IGVsc2UgaWYgKGNvbXBvbmVudERhdGEucHJvcGVydGllcykge1xuICAgICAgICAgICAgLy8g5aSE55CG5omA5pyJ57uE5Lu255qE5bGe5oCn77yI5YyF5ous5YaF572u57uE5Lu25ZKM6Ieq5a6a5LmJ6ISa5pys57uE5Lu277yJXG4gICAgICAgICAgICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhjb21wb25lbnREYXRhLnByb3BlcnRpZXMpKSB7XG4gICAgICAgICAgICAgICAgaWYgKGtleSA9PT0gJ25vZGUnIHx8IGtleSA9PT0gJ2VuYWJsZWQnIHx8IGtleSA9PT0gJ19fdHlwZV9fJyB8fCBcbiAgICAgICAgICAgICAgICAgICAga2V5ID09PSAndXVpZCcgfHwga2V5ID09PSAnbmFtZScgfHwga2V5ID09PSAnX19zY3JpcHRBc3NldCcgfHwga2V5ID09PSAnX29iakZsYWdzJykge1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTsgLy8g6Lez6L+H6L+Z5Lqb54m55q6K5bGe5oCn77yM5YyF5ousX29iakZsYWdzXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIC8vIOWvueS6juS7peS4i+WIkue6v+W8gOWktOeahOWxnuaAp++8jOmcgOimgeeJueauiuWkhOeQhlxuICAgICAgICAgICAgICAgIGlmIChrZXkuc3RhcnRzV2l0aCgnXycpKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIOehruS/neWxnuaAp+WQjeS/neaMgeWOn+agt++8iOWMheaLrOS4i+WIkue6v++8iVxuICAgICAgICAgICAgICAgICAgICBjb25zdCBwcm9wVmFsdWUgPSB0aGlzLnByb2Nlc3NDb21wb25lbnRQcm9wZXJ0eSh2YWx1ZSwgY29udGV4dCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChwcm9wVmFsdWUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50W2tleV0gPSBwcm9wVmFsdWU7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAvLyDpnZ7kuIvliJLnur/lvIDlpLTnmoTlsZ7mgKfmraPluLjlpITnkIZcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcHJvcFZhbHVlID0gdGhpcy5wcm9jZXNzQ29tcG9uZW50UHJvcGVydHkodmFsdWUsIGNvbnRleHQpO1xuICAgICAgICAgICAgICAgICAgICBpZiAocHJvcFZhbHVlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudFtrZXldID0gcHJvcFZhbHVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAvLyDnoa7kv50gX2lkIOWcqOacgOWQjuS9jee9rlxuICAgICAgICBjb25zdCBfaWQgPSBjb21wb25lbnQuX2lkIHx8IFwiXCI7XG4gICAgICAgIGRlbGV0ZSBjb21wb25lbnQuX2lkO1xuICAgICAgICBjb21wb25lbnQuX2lkID0gX2lkO1xuICAgICAgICBcbiAgICAgICAgcmV0dXJuIGNvbXBvbmVudDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiDlpITnkIbnu4Tku7blsZ7mgKflgLzvvIznoa7kv53moLzlvI/kuI7miYvliqjliJvlu7rnmoTpooTliLbkvZPkuIDoh7RcbiAgICAgKi9cbiAgICBwcml2YXRlIHByb2Nlc3NDb21wb25lbnRQcm9wZXJ0eShwcm9wRGF0YTogYW55LCBjb250ZXh0PzogeyBcbiAgICAgICAgbm9kZVV1aWRUb0luZGV4PzogTWFwPHN0cmluZywgbnVtYmVyPixcbiAgICAgICAgY29tcG9uZW50VXVpZFRvSW5kZXg/OiBNYXA8c3RyaW5nLCBudW1iZXI+XG4gICAgfSk6IGFueSB7XG4gICAgICAgIGlmICghcHJvcERhdGEgfHwgdHlwZW9mIHByb3BEYXRhICE9PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgcmV0dXJuIHByb3BEYXRhO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgdmFsdWUgPSBwcm9wRGF0YS52YWx1ZTtcbiAgICAgICAgY29uc3QgdHlwZSA9IHByb3BEYXRhLnR5cGU7XG5cbiAgICAgICAgLy8g5aSE55CGbnVsbOWAvFxuICAgICAgICBpZiAodmFsdWUgPT09IG51bGwgfHwgdmFsdWUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICAvLyDlpITnkIbnqbpVVUlE5a+56LGh77yM6L2s5o2i5Li6bnVsbFxuICAgICAgICBpZiAodmFsdWUgJiYgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZS51dWlkID09PSAnJykge1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICAvLyDlpITnkIboioLngrnlvJXnlKhcbiAgICAgICAgaWYgKHR5cGUgPT09ICdjYy5Ob2RlJyAmJiB2YWx1ZT8udXVpZCkge1xuICAgICAgICAgICAgLy8g5Zyo6aKE5Yi25L2T5Lit77yM6IqC54K55byV55So6ZyA6KaB6L2s5o2i5Li6IF9faWRfXyDlvaLlvI9cbiAgICAgICAgICAgIGlmIChjb250ZXh0Py5ub2RlVXVpZFRvSW5kZXggJiYgY29udGV4dC5ub2RlVXVpZFRvSW5kZXguaGFzKHZhbHVlLnV1aWQpKSB7XG4gICAgICAgICAgICAgICAgLy8g5YaF6YOo5byV55So77ya6L2s5o2i5Li6X19pZF9f5qC85byPXG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgXCJfX2lkX19cIjogY29udGV4dC5ub2RlVXVpZFRvSW5kZXguZ2V0KHZhbHVlLnV1aWQpXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIOWklumDqOW8leeUqO+8muiuvue9ruS4um51bGzvvIzlm6DkuLrlpJbpg6joioLngrnkuI3lsZ7kuo7pooTliLbkvZPnu5PmnoRcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihgTm9kZSByZWZlcmVuY2UgVVVJRCAke3ZhbHVlLnV1aWR9IG5vdCBmb3VuZCBpbiBwcmVmYWIgY29udGV4dCwgc2V0dGluZyB0byBudWxsIChleHRlcm5hbCByZWZlcmVuY2UpYCk7XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIOWkhOeQhui1hOa6kOW8leeUqO+8iOmihOWItuS9k+OAgee6ueeQhuOAgeeyvueBteW4p+etie+8iVxuICAgICAgICBpZiAodmFsdWU/LnV1aWQgJiYgKFxuICAgICAgICAgICAgdHlwZSA9PT0gJ2NjLlByZWZhYicgfHwgXG4gICAgICAgICAgICB0eXBlID09PSAnY2MuVGV4dHVyZTJEJyB8fCBcbiAgICAgICAgICAgIHR5cGUgPT09ICdjYy5TcHJpdGVGcmFtZScgfHxcbiAgICAgICAgICAgIHR5cGUgPT09ICdjYy5NYXRlcmlhbCcgfHxcbiAgICAgICAgICAgIHR5cGUgPT09ICdjYy5BbmltYXRpb25DbGlwJyB8fFxuICAgICAgICAgICAgdHlwZSA9PT0gJ2NjLkF1ZGlvQ2xpcCcgfHxcbiAgICAgICAgICAgIHR5cGUgPT09ICdjYy5Gb250JyB8fFxuICAgICAgICAgICAgdHlwZSA9PT0gJ2NjLkFzc2V0J1xuICAgICAgICApKSB7XG4gICAgICAgICAgICAvLyDlr7nkuo7pooTliLbkvZPlvJXnlKjvvIzkv53mjIHljp/lp4tVVUlE5qC85byPXG4gICAgICAgICAgICBjb25zdCB1dWlkVG9Vc2UgPSB0eXBlID09PSAnY2MuUHJlZmFiJyA/IHZhbHVlLnV1aWQgOiB0aGlzLnV1aWRUb0NvbXByZXNzZWRJZCh2YWx1ZS51dWlkKTtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgXCJfX3V1aWRfX1wiOiB1dWlkVG9Vc2UsXG4gICAgICAgICAgICAgICAgXCJfX2V4cGVjdGVkVHlwZV9fXCI6IHR5cGVcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cblxuICAgICAgICAvLyDlpITnkIbnu4Tku7blvJXnlKjvvIjljIXmi6zlhbfkvZPnmoTnu4Tku7bnsbvlnovlpoJjYy5MYWJlbCwgY2MuQnV0dG9u562J77yJXG4gICAgICAgIGlmICh2YWx1ZT8udXVpZCAmJiAodHlwZSA9PT0gJ2NjLkNvbXBvbmVudCcgfHwgXG4gICAgICAgICAgICB0eXBlID09PSAnY2MuTGFiZWwnIHx8IHR5cGUgPT09ICdjYy5CdXR0b24nIHx8IHR5cGUgPT09ICdjYy5TcHJpdGUnIHx8IFxuICAgICAgICAgICAgdHlwZSA9PT0gJ2NjLlVJVHJhbnNmb3JtJyB8fCB0eXBlID09PSAnY2MuUmlnaWRCb2R5MkQnIHx8IFxuICAgICAgICAgICAgdHlwZSA9PT0gJ2NjLkJveENvbGxpZGVyMkQnIHx8IHR5cGUgPT09ICdjYy5BbmltYXRpb24nIHx8IFxuICAgICAgICAgICAgdHlwZSA9PT0gJ2NjLkF1ZGlvU291cmNlJyB8fCAodHlwZT8uc3RhcnRzV2l0aCgnY2MuJykgJiYgIXR5cGUuaW5jbHVkZXMoJ0AnKSkpKSB7XG4gICAgICAgICAgICAvLyDlnKjpooTliLbkvZPkuK3vvIznu4Tku7blvJXnlKjkuZ/pnIDopoHovazmjaLkuLogX19pZF9fIOW9ouW8j1xuICAgICAgICAgICAgaWYgKGNvbnRleHQ/LmNvbXBvbmVudFV1aWRUb0luZGV4ICYmIGNvbnRleHQuY29tcG9uZW50VXVpZFRvSW5kZXguaGFzKHZhbHVlLnV1aWQpKSB7XG4gICAgICAgICAgICAgICAgLy8g5YaF6YOo5byV55So77ya6L2s5o2i5Li6X19pZF9f5qC85byPXG4gICAgICAgICAgICAgICAgZGVidWdMb2coYENvbXBvbmVudCByZWZlcmVuY2UgJHt0eXBlfSBVVUlEICR7dmFsdWUudXVpZH0gZm91bmQgaW4gcHJlZmFiIGNvbnRleHQsIGNvbnZlcnRpbmcgdG8gX19pZF9fYCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgXCJfX2lkX19cIjogY29udGV4dC5jb21wb25lbnRVdWlkVG9JbmRleC5nZXQodmFsdWUudXVpZClcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8g5aSW6YOo5byV55So77ya6K6+572u5Li6bnVsbO+8jOWboOS4uuWklumDqOe7hOS7tuS4jeWxnuS6jumihOWItuS9k+e7k+aehFxuICAgICAgICAgICAgY29uc29sZS53YXJuKGBDb21wb25lbnQgcmVmZXJlbmNlICR7dHlwZX0gVVVJRCAke3ZhbHVlLnV1aWR9IG5vdCBmb3VuZCBpbiBwcmVmYWIgY29udGV4dCwgc2V0dGluZyB0byBudWxsIChleHRlcm5hbCByZWZlcmVuY2UpYCk7XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIOWkhOeQhuWkjeadguexu+Wei++8jOa3u+WKoF9fdHlwZV9f5qCH6K6wXG4gICAgICAgIGlmICh2YWx1ZSAmJiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICBpZiAodHlwZSA9PT0gJ2NjLkNvbG9yJykge1xuICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgIFwiX190eXBlX19cIjogXCJjYy5Db2xvclwiLFxuICAgICAgICAgICAgICAgICAgICBcInJcIjogTWF0aC5taW4oMjU1LCBNYXRoLm1heCgwLCBOdW1iZXIodmFsdWUucikgfHwgMCkpLFxuICAgICAgICAgICAgICAgICAgICBcImdcIjogTWF0aC5taW4oMjU1LCBNYXRoLm1heCgwLCBOdW1iZXIodmFsdWUuZykgfHwgMCkpLFxuICAgICAgICAgICAgICAgICAgICBcImJcIjogTWF0aC5taW4oMjU1LCBNYXRoLm1heCgwLCBOdW1iZXIodmFsdWUuYikgfHwgMCkpLFxuICAgICAgICAgICAgICAgICAgICBcImFcIjogdmFsdWUuYSAhPT0gdW5kZWZpbmVkID8gTWF0aC5taW4oMjU1LCBNYXRoLm1heCgwLCBOdW1iZXIodmFsdWUuYSkpKSA6IDI1NVxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGUgPT09ICdjYy5WZWMzJykge1xuICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgIFwiX190eXBlX19cIjogXCJjYy5WZWMzXCIsXG4gICAgICAgICAgICAgICAgICAgIFwieFwiOiBOdW1iZXIodmFsdWUueCkgfHwgMCxcbiAgICAgICAgICAgICAgICAgICAgXCJ5XCI6IE51bWJlcih2YWx1ZS55KSB8fCAwLFxuICAgICAgICAgICAgICAgICAgICBcInpcIjogTnVtYmVyKHZhbHVlLnopIHx8IDBcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlID09PSAnY2MuVmVjMicpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICBcIl9fdHlwZV9fXCI6IFwiY2MuVmVjMlwiLCBcbiAgICAgICAgICAgICAgICAgICAgXCJ4XCI6IE51bWJlcih2YWx1ZS54KSB8fCAwLFxuICAgICAgICAgICAgICAgICAgICBcInlcIjogTnVtYmVyKHZhbHVlLnkpIHx8IDBcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlID09PSAnY2MuU2l6ZScpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICBcIl9fdHlwZV9fXCI6IFwiY2MuU2l6ZVwiLFxuICAgICAgICAgICAgICAgICAgICBcIndpZHRoXCI6IE51bWJlcih2YWx1ZS53aWR0aCkgfHwgMCxcbiAgICAgICAgICAgICAgICAgICAgXCJoZWlnaHRcIjogTnVtYmVyKHZhbHVlLmhlaWdodCkgfHwgMFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGUgPT09ICdjYy5RdWF0Jykge1xuICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgIFwiX190eXBlX19cIjogXCJjYy5RdWF0XCIsXG4gICAgICAgICAgICAgICAgICAgIFwieFwiOiBOdW1iZXIodmFsdWUueCkgfHwgMCxcbiAgICAgICAgICAgICAgICAgICAgXCJ5XCI6IE51bWJlcih2YWx1ZS55KSB8fCAwLFxuICAgICAgICAgICAgICAgICAgICBcInpcIjogTnVtYmVyKHZhbHVlLnopIHx8IDAsXG4gICAgICAgICAgICAgICAgICAgIFwid1wiOiB2YWx1ZS53ICE9PSB1bmRlZmluZWQgPyBOdW1iZXIodmFsdWUudykgOiAxXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIOWkhOeQhuaVsOe7hOexu+Wei1xuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcbiAgICAgICAgICAgIC8vIOiKgueCueaVsOe7hFxuICAgICAgICAgICAgaWYgKHByb3BEYXRhLmVsZW1lbnRUeXBlRGF0YT8udHlwZSA9PT0gJ2NjLk5vZGUnKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlLm1hcChpdGVtID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGl0ZW0/LnV1aWQgJiYgY29udGV4dD8ubm9kZVV1aWRUb0luZGV4Py5oYXMoaXRlbS51dWlkKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgXCJfX2lkX19cIjogY29udGV4dC5ub2RlVXVpZFRvSW5kZXguZ2V0KGl0ZW0udXVpZCkgfTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgICAgICB9KS5maWx0ZXIoaXRlbSA9PiBpdGVtICE9PSBudWxsKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8g6LWE5rqQ5pWw57uEXG4gICAgICAgICAgICBpZiAocHJvcERhdGEuZWxlbWVudFR5cGVEYXRhPy50eXBlICYmIHByb3BEYXRhLmVsZW1lbnRUeXBlRGF0YS50eXBlLnN0YXJ0c1dpdGgoJ2NjLicpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlLm1hcChpdGVtID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGl0ZW0/LnV1aWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJfX3V1aWRfX1wiOiB0aGlzLnV1aWRUb0NvbXByZXNzZWRJZChpdGVtLnV1aWQpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiX19leHBlY3RlZFR5cGVfX1wiOiBwcm9wRGF0YS5lbGVtZW50VHlwZURhdGEudHlwZVxuICAgICAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgICAgICB9KS5maWx0ZXIoaXRlbSA9PiBpdGVtICE9PSBudWxsKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8g5Z+656GA57G75Z6L5pWw57uEXG4gICAgICAgICAgICByZXR1cm4gdmFsdWUubWFwKGl0ZW0gPT4gaXRlbT8udmFsdWUgIT09IHVuZGVmaW5lZCA/IGl0ZW0udmFsdWUgOiBpdGVtKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIOWFtuS7luWkjeadguWvueixoeexu+Wei++8jOS/neaMgeWOn+agt+S9huehruS/neaciV9fdHlwZV9f5qCH6K6wXG4gICAgICAgIGlmICh2YWx1ZSAmJiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHR5cGUgJiYgdHlwZS5zdGFydHNXaXRoKCdjYy4nKSkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBcIl9fdHlwZV9fXCI6IHR5cGUsXG4gICAgICAgICAgICAgICAgLi4udmFsdWVcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICog5Yib5bu656ym5ZCI5byV5pOO5qCH5YeG55qE6IqC54K55a+56LGhXG4gICAgICovXG4gICAgcHJpdmF0ZSBjcmVhdGVFbmdpbmVTdGFuZGFyZE5vZGUobm9kZURhdGE6IGFueSwgcGFyZW50Tm9kZUluZGV4OiBudW1iZXIgfCBudWxsLCBub2RlTmFtZT86IHN0cmluZyk6IGFueSB7XG4gICAgICAgIC8vIOiwg+ivle+8muaJk+WNsOWOn+Wni+iKgueCueaVsOaNru+8iOW3suazqOmHiu+8iVxuICAgICAgICAvLyBkZWJ1Z0xvZygn5Y6f5aeL6IqC54K55pWw5o2uOicsIEpTT04uc3RyaW5naWZ5KG5vZGVEYXRhLCBudWxsLCAyKSk7XG4gICAgICAgIFxuICAgICAgICAvLyDmj5Dlj5boioLngrnnmoTln7rmnKzlsZ7mgKdcbiAgICAgICAgY29uc3QgZ2V0VmFsdWUgPSAocHJvcDogYW55KSA9PiB7XG4gICAgICAgICAgICBpZiAocHJvcD8udmFsdWUgIT09IHVuZGVmaW5lZCkgcmV0dXJuIHByb3AudmFsdWU7XG4gICAgICAgICAgICBpZiAocHJvcCAhPT0gdW5kZWZpbmVkKSByZXR1cm4gcHJvcDtcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9O1xuICAgICAgICBcbiAgICAgICAgY29uc3QgcG9zaXRpb24gPSBnZXRWYWx1ZShub2RlRGF0YS5wb3NpdGlvbikgfHwgZ2V0VmFsdWUobm9kZURhdGEudmFsdWU/LnBvc2l0aW9uKSB8fCB7IHg6IDAsIHk6IDAsIHo6IDAgfTtcbiAgICAgICAgY29uc3Qgcm90YXRpb24gPSBnZXRWYWx1ZShub2RlRGF0YS5yb3RhdGlvbikgfHwgZ2V0VmFsdWUobm9kZURhdGEudmFsdWU/LnJvdGF0aW9uKSB8fCB7IHg6IDAsIHk6IDAsIHo6IDAsIHc6IDEgfTtcbiAgICAgICAgY29uc3Qgc2NhbGUgPSBnZXRWYWx1ZShub2RlRGF0YS5zY2FsZSkgfHwgZ2V0VmFsdWUobm9kZURhdGEudmFsdWU/LnNjYWxlKSB8fCB7IHg6IDEsIHk6IDEsIHo6IDEgfTtcbiAgICAgICAgY29uc3QgYWN0aXZlID0gZ2V0VmFsdWUobm9kZURhdGEuYWN0aXZlKSA/PyBnZXRWYWx1ZShub2RlRGF0YS52YWx1ZT8uYWN0aXZlKSA/PyB0cnVlO1xuICAgICAgICBjb25zdCBuYW1lID0gbm9kZU5hbWUgfHwgZ2V0VmFsdWUobm9kZURhdGEubmFtZSkgfHwgZ2V0VmFsdWUobm9kZURhdGEudmFsdWU/Lm5hbWUpIHx8ICdOb2RlJztcbiAgICAgICAgY29uc3QgbGF5ZXIgPSBnZXRWYWx1ZShub2RlRGF0YS5sYXllcikgfHwgZ2V0VmFsdWUobm9kZURhdGEudmFsdWU/LmxheWVyKSB8fCAxMDczNzQxODI0O1xuXG4gICAgICAgIC8vIOiwg+ivlei+k+WHulxuICAgICAgICBkZWJ1Z0xvZyhg5Yib5bu66IqC54K5OiAke25hbWV9LCBwYXJlbnROb2RlSW5kZXg6ICR7cGFyZW50Tm9kZUluZGV4fWApO1xuXG4gICAgICAgIGNvbnN0IHBhcmVudFJlZiA9IHBhcmVudE5vZGVJbmRleCAhPT0gbnVsbCA/IHsgXCJfX2lkX19cIjogcGFyZW50Tm9kZUluZGV4IH0gOiBudWxsO1xuICAgICAgICBkZWJ1Z0xvZyhg6IqC54K5ICR7bmFtZX0g55qE54i26IqC54K55byV55SoOmAsIHBhcmVudFJlZik7XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIFwiX190eXBlX19cIjogXCJjYy5Ob2RlXCIsXG4gICAgICAgICAgICBcIl9uYW1lXCI6IG5hbWUsXG4gICAgICAgICAgICBcIl9vYmpGbGFnc1wiOiAwLFxuICAgICAgICAgICAgXCJfX2VkaXRvckV4dHJhc19fXCI6IHt9LFxuICAgICAgICAgICAgXCJfcGFyZW50XCI6IHBhcmVudFJlZixcbiAgICAgICAgICAgIFwiX2NoaWxkcmVuXCI6IFtdLCAvLyDlrZDoioLngrnlvJXnlKjlsIblnKjpgJLlvZLov4fnqIvkuK3liqjmgIHmt7vliqBcbiAgICAgICAgICAgIFwiX2FjdGl2ZVwiOiBhY3RpdmUsXG4gICAgICAgICAgICBcIl9jb21wb25lbnRzXCI6IFtdLCAvLyDnu4Tku7blvJXnlKjlsIblnKjlpITnkIbnu4Tku7bml7bliqjmgIHmt7vliqBcbiAgICAgICAgICAgIFwiX3ByZWZhYlwiOiB7IFwiX19pZF9fXCI6IDAgfSwgLy8g5Li05pe25YC877yM5ZCO57ut5Lya6KKr5q2j56Gu6K6+572uXG4gICAgICAgICAgICBcIl9scG9zXCI6IHtcbiAgICAgICAgICAgICAgICBcIl9fdHlwZV9fXCI6IFwiY2MuVmVjM1wiLFxuICAgICAgICAgICAgICAgIFwieFwiOiBwb3NpdGlvbi54LFxuICAgICAgICAgICAgICAgIFwieVwiOiBwb3NpdGlvbi55LFxuICAgICAgICAgICAgICAgIFwielwiOiBwb3NpdGlvbi56XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJfbHJvdFwiOiB7XG4gICAgICAgICAgICAgICAgXCJfX3R5cGVfX1wiOiBcImNjLlF1YXRcIixcbiAgICAgICAgICAgICAgICBcInhcIjogcm90YXRpb24ueCxcbiAgICAgICAgICAgICAgICBcInlcIjogcm90YXRpb24ueSxcbiAgICAgICAgICAgICAgICBcInpcIjogcm90YXRpb24ueixcbiAgICAgICAgICAgICAgICBcIndcIjogcm90YXRpb24ud1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiX2xzY2FsZVwiOiB7XG4gICAgICAgICAgICAgICAgXCJfX3R5cGVfX1wiOiBcImNjLlZlYzNcIixcbiAgICAgICAgICAgICAgICBcInhcIjogc2NhbGUueCxcbiAgICAgICAgICAgICAgICBcInlcIjogc2NhbGUueSxcbiAgICAgICAgICAgICAgICBcInpcIjogc2NhbGUuelxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiX21vYmlsaXR5XCI6IDAsXG4gICAgICAgICAgICBcIl9sYXllclwiOiBsYXllcixcbiAgICAgICAgICAgIFwiX2V1bGVyXCI6IHtcbiAgICAgICAgICAgICAgICBcIl9fdHlwZV9fXCI6IFwiY2MuVmVjM1wiLFxuICAgICAgICAgICAgICAgIFwieFwiOiAwLFxuICAgICAgICAgICAgICAgIFwieVwiOiAwLFxuICAgICAgICAgICAgICAgIFwielwiOiAwXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJfaWRcIjogXCJcIlxuICAgICAgICB9O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIOS7juiKgueCueaVsOaNruS4reaPkOWPllVVSURcbiAgICAgKi9cbiAgICBwcml2YXRlIGV4dHJhY3ROb2RlVXVpZChub2RlRGF0YTogYW55KTogc3RyaW5nIHwgbnVsbCB7XG4gICAgICAgIGlmICghbm9kZURhdGEpIHJldHVybiBudWxsO1xuICAgICAgICBcbiAgICAgICAgLy8g5bCd6K+V5aSa56eN5pa55byP6I635Y+WVVVJRFxuICAgICAgICBjb25zdCBzb3VyY2VzID0gW1xuICAgICAgICAgICAgbm9kZURhdGEudXVpZCxcbiAgICAgICAgICAgIG5vZGVEYXRhLnZhbHVlPy51dWlkLFxuICAgICAgICAgICAgbm9kZURhdGEuX191dWlkX18sXG4gICAgICAgICAgICBub2RlRGF0YS52YWx1ZT8uX191dWlkX18sXG4gICAgICAgICAgICBub2RlRGF0YS5pZCxcbiAgICAgICAgICAgIG5vZGVEYXRhLnZhbHVlPy5pZFxuICAgICAgICBdO1xuICAgICAgICBcbiAgICAgICAgZm9yIChjb25zdCBzb3VyY2Ugb2Ygc291cmNlcykge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBzb3VyY2UgPT09ICdzdHJpbmcnICYmIHNvdXJjZS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNvdXJjZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICog5Yib5bu65pyA5bCP5YyW55qE6IqC54K55a+56LGh77yM5LiN5YyF5ZCr5Lu75L2V57uE5Lu25Lul6YG/5YWN5L6d6LWW6Zeu6aKYXG4gICAgICovXG4gICAgcHJpdmF0ZSBjcmVhdGVNaW5pbWFsTm9kZShub2RlRGF0YTogYW55LCBub2RlTmFtZT86IHN0cmluZyk6IGFueSB7XG4gICAgICAgIC8vIOaPkOWPluiKgueCueeahOWfuuacrOWxnuaAp1xuICAgICAgICBjb25zdCBnZXRWYWx1ZSA9IChwcm9wOiBhbnkpID0+IHtcbiAgICAgICAgICAgIGlmIChwcm9wPy52YWx1ZSAhPT0gdW5kZWZpbmVkKSByZXR1cm4gcHJvcC52YWx1ZTtcbiAgICAgICAgICAgIGlmIChwcm9wICE9PSB1bmRlZmluZWQpIHJldHVybiBwcm9wO1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH07XG4gICAgICAgIFxuICAgICAgICBjb25zdCBwb3NpdGlvbiA9IGdldFZhbHVlKG5vZGVEYXRhLnBvc2l0aW9uKSB8fCBnZXRWYWx1ZShub2RlRGF0YS52YWx1ZT8ucG9zaXRpb24pIHx8IHsgeDogMCwgeTogMCwgejogMCB9O1xuICAgICAgICBjb25zdCByb3RhdGlvbiA9IGdldFZhbHVlKG5vZGVEYXRhLnJvdGF0aW9uKSB8fCBnZXRWYWx1ZShub2RlRGF0YS52YWx1ZT8ucm90YXRpb24pIHx8IHsgeDogMCwgeTogMCwgejogMCwgdzogMSB9O1xuICAgICAgICBjb25zdCBzY2FsZSA9IGdldFZhbHVlKG5vZGVEYXRhLnNjYWxlKSB8fCBnZXRWYWx1ZShub2RlRGF0YS52YWx1ZT8uc2NhbGUpIHx8IHsgeDogMSwgeTogMSwgejogMSB9O1xuICAgICAgICBjb25zdCBhY3RpdmUgPSBnZXRWYWx1ZShub2RlRGF0YS5hY3RpdmUpID8/IGdldFZhbHVlKG5vZGVEYXRhLnZhbHVlPy5hY3RpdmUpID8/IHRydWU7XG4gICAgICAgIGNvbnN0IG5hbWUgPSBub2RlTmFtZSB8fCBnZXRWYWx1ZShub2RlRGF0YS5uYW1lKSB8fCBnZXRWYWx1ZShub2RlRGF0YS52YWx1ZT8ubmFtZSkgfHwgJ05vZGUnO1xuICAgICAgICBjb25zdCBsYXllciA9IGdldFZhbHVlKG5vZGVEYXRhLmxheWVyKSB8fCBnZXRWYWx1ZShub2RlRGF0YS52YWx1ZT8ubGF5ZXIpIHx8IDMzNTU0NDMyO1xuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBcIl9fdHlwZV9fXCI6IFwiY2MuTm9kZVwiLFxuICAgICAgICAgICAgXCJfbmFtZVwiOiBuYW1lLFxuICAgICAgICAgICAgXCJfb2JqRmxhZ3NcIjogMCxcbiAgICAgICAgICAgIFwiX3BhcmVudFwiOiBudWxsLFxuICAgICAgICAgICAgXCJfY2hpbGRyZW5cIjogW10sXG4gICAgICAgICAgICBcIl9hY3RpdmVcIjogYWN0aXZlLFxuICAgICAgICAgICAgXCJfY29tcG9uZW50c1wiOiBbXSwgLy8g56m655qE57uE5Lu25pWw57uE77yM6YG/5YWN57uE5Lu25L6d6LWW6Zeu6aKYXG4gICAgICAgICAgICBcIl9wcmVmYWJcIjoge1xuICAgICAgICAgICAgICAgIFwiX19pZF9fXCI6IDJcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcIl9scG9zXCI6IHtcbiAgICAgICAgICAgICAgICBcIl9fdHlwZV9fXCI6IFwiY2MuVmVjM1wiLFxuICAgICAgICAgICAgICAgIFwieFwiOiBwb3NpdGlvbi54LFxuICAgICAgICAgICAgICAgIFwieVwiOiBwb3NpdGlvbi55LFxuICAgICAgICAgICAgICAgIFwielwiOiBwb3NpdGlvbi56XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJfbHJvdFwiOiB7XG4gICAgICAgICAgICAgICAgXCJfX3R5cGVfX1wiOiBcImNjLlF1YXRcIixcbiAgICAgICAgICAgICAgICBcInhcIjogcm90YXRpb24ueCxcbiAgICAgICAgICAgICAgICBcInlcIjogcm90YXRpb24ueSxcbiAgICAgICAgICAgICAgICBcInpcIjogcm90YXRpb24ueixcbiAgICAgICAgICAgICAgICBcIndcIjogcm90YXRpb24ud1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiX2xzY2FsZVwiOiB7XG4gICAgICAgICAgICAgICAgXCJfX3R5cGVfX1wiOiBcImNjLlZlYzNcIixcbiAgICAgICAgICAgICAgICBcInhcIjogc2NhbGUueCxcbiAgICAgICAgICAgICAgICBcInlcIjogc2NhbGUueSxcbiAgICAgICAgICAgICAgICBcInpcIjogc2NhbGUuelxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiX2xheWVyXCI6IGxheWVyLFxuICAgICAgICAgICAgXCJfZXVsZXJcIjoge1xuICAgICAgICAgICAgICAgIFwiX190eXBlX19cIjogXCJjYy5WZWMzXCIsXG4gICAgICAgICAgICAgICAgXCJ4XCI6IDAsXG4gICAgICAgICAgICAgICAgXCJ5XCI6IDAsXG4gICAgICAgICAgICAgICAgXCJ6XCI6IDBcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcIl9pZFwiOiBcIlwiXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICog5Yib5bu65qCH5YeG55qEIG1ldGEg5paH5Lu25YaF5a65XG4gICAgICovXG4gICAgcHJpdmF0ZSBjcmVhdGVTdGFuZGFyZE1ldGFDb250ZW50KHByZWZhYk5hbWU6IHN0cmluZywgcHJlZmFiVXVpZDogc3RyaW5nKTogYW55IHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIFwidmVyXCI6IFwiMi4wLjNcIixcbiAgICAgICAgICAgIFwiaW1wb3J0ZXJcIjogXCJwcmVmYWJcIixcbiAgICAgICAgICAgIFwiaW1wb3J0ZWRcIjogdHJ1ZSxcbiAgICAgICAgICAgIFwidXVpZFwiOiBwcmVmYWJVdWlkLFxuICAgICAgICAgICAgXCJmaWxlc1wiOiBbXG4gICAgICAgICAgICAgICAgXCIuanNvblwiXG4gICAgICAgICAgICBdLFxuICAgICAgICAgICAgXCJzdWJNZXRhc1wiOiB7fSxcbiAgICAgICAgICAgIFwidXNlckRhdGFcIjoge1xuICAgICAgICAgICAgICAgIFwic3luY05vZGVOYW1lXCI6IHByZWZhYk5hbWUsXG4gICAgICAgICAgICAgICAgXCJoYXNJY29uXCI6IGZhbHNlXG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICog5bCd6K+V5bCG5Y6f5aeL6IqC54K56L2s5o2i5Li66aKE5Yi25L2T5a6e5L6LXG4gICAgICovXG4gICAgcHJpdmF0ZSBhc3luYyBjb252ZXJ0Tm9kZVRvUHJlZmFiSW5zdGFuY2Uobm9kZVV1aWQ6IHN0cmluZywgcHJlZmFiVXVpZDogc3RyaW5nLCBwcmVmYWJQYXRoOiBzdHJpbmcpOiBQcm9taXNlPHsgc3VjY2VzczogYm9vbGVhbjsgZXJyb3I/OiBzdHJpbmcgfT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIC8vIOi/meS4quWKn+iDvemcgOimgea3seWFpeeahOWcuuaZr+e8lui+keWZqOmbhuaIkO+8jOaaguaXtui/lOWbnuWksei0pVxuICAgICAgICAgICAgLy8g5Zyo5a6e6ZmF55qE5byV5pOO5Lit77yM6L+Z5raJ5Y+K5Yiw5aSN5p2C55qE6aKE5Yi25L2T5a6e5L6L5YyW5ZKM6IqC54K55pu/5o2i6YC76L6RXG4gICAgICAgICAgICBkZWJ1Z0xvZygn6IqC54K56L2s5o2i5Li66aKE5Yi25L2T5a6e5L6L55qE5Yqf6IO96ZyA6KaB5pu05rex5YWl55qE5byV5pOO6ZuG5oiQJyk7XG4gICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBlcnJvcjogJ+iKgueCuei9rOaNouS4uumihOWItuS9k+WunuS+i+mcgOimgeabtOa3seWFpeeahOW8leaTjumbhuaIkOaUr+aMgSdcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHJlc3RvcmVQcmVmYWJOb2RlKG5vZGVVdWlkOiBzdHJpbmcsIGFzc2V0VXVpZDogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICAvLyBWZXJpZmllZCBzaWduYXR1cmUgcGVyIEBjb2Nvcy9jcmVhdG9yLXR5cGVzOiBzY2VuZS9yZXN0b3JlLXByZWZhYlxuICAgICAgICAgICAgLy8gdGFrZXMgYSBzaW5nbGUgUmVzZXRDb21wb25lbnRPcHRpb25zID0geyB1dWlkOiBzdHJpbmcgfS4gVGhlXG4gICAgICAgICAgICAvLyBwcmV2aW91cyBjb2RlIHBhc3NlZCAobm9kZVV1aWQsIGFzc2V0VXVpZCkgYXMgcG9zaXRpb25hbCBhcmdzLFxuICAgICAgICAgICAgLy8gd2hpY2ggdGhlIEFQSSBpZ25vcmVzIGFmdGVyIHRoZSBmaXJzdCBvbmUgYW5kIHNpbGVudGx5IG1pc3JvdXRlcy5cbiAgICAgICAgICAgIC8vIGFzc2V0VXVpZCBpcyBwcmVzZXJ2ZWQgb24gdGhlIHJlcXVlc3Qgc2hhcGUgZm9yIHJlc3BvbnNlIGNvbnRleHRcbiAgICAgICAgICAgIC8vIGJ1dCBkb2VzIG5vdCBmbG93IGludG8gdGhlIGVkaXRvciBtZXNzYWdlLlxuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncmVzdG9yZS1wcmVmYWInLCB7IHV1aWQ6IG5vZGVVdWlkIH0pLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBub2RlVXVpZDogbm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBhc3NldFV1aWQ6IGFzc2V0VXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICfpooTliLbkvZPoioLngrnov5jljp/miJDlip8nXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnJvcjogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICBlcnJvcjogYOmihOWItuS9k+iKgueCuei/mOWOn+Wksei0pTogJHtlcnJvci5tZXNzYWdlfWBcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyDln7rkuo7lrpjmlrnpooTliLbkvZPmoLzlvI/nmoTmlrDlrp7njrDmlrnms5VcbiAgICBwcml2YXRlIGFzeW5jIGdldE5vZGVEYXRhRm9yUHJlZmFiKG5vZGVVdWlkOiBzdHJpbmcpOiBQcm9taXNlPHsgc3VjY2VzczogYm9vbGVhbjsgZGF0YT86IGFueTsgZXJyb3I/OiBzdHJpbmcgfT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LW5vZGUnLCBub2RlVXVpZCkudGhlbigobm9kZURhdGE6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmICghbm9kZURhdGEpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ+iKgueCueS4jeWtmOWcqCcgfSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IG5vZGVEYXRhIH0pO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycm9yOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvci5tZXNzYWdlIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgY3JlYXRlU3RhbmRhcmRQcmVmYWJEYXRhKG5vZGVEYXRhOiBhbnksIHByZWZhYk5hbWU6IHN0cmluZywgcHJlZmFiVXVpZDogc3RyaW5nKTogUHJvbWlzZTxhbnlbXT4ge1xuICAgICAgICAvLyDln7rkuo7lrpjmlrlDYW52YXMucHJlZmFi5qC85byP5Yib5bu66aKE5Yi25L2T5pWw5o2u57uT5p6EXG4gICAgICAgIGNvbnN0IHByZWZhYkRhdGE6IGFueVtdID0gW107XG4gICAgICAgIGxldCBjdXJyZW50SWQgPSAwO1xuXG4gICAgICAgIC8vIOesrOS4gOS4quWFg+e0oO+8mmNjLlByZWZhYiDotYTmupDlr7nosaFcbiAgICAgICAgY29uc3QgcHJlZmFiQXNzZXQgPSB7XG4gICAgICAgICAgICBcIl9fdHlwZV9fXCI6IFwiY2MuUHJlZmFiXCIsXG4gICAgICAgICAgICBcIl9uYW1lXCI6IHByZWZhYk5hbWUsXG4gICAgICAgICAgICBcIl9vYmpGbGFnc1wiOiAwLFxuICAgICAgICAgICAgXCJfX2VkaXRvckV4dHJhc19fXCI6IHt9LFxuICAgICAgICAgICAgXCJfbmF0aXZlXCI6IFwiXCIsXG4gICAgICAgICAgICBcImRhdGFcIjoge1xuICAgICAgICAgICAgICAgIFwiX19pZF9fXCI6IDFcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcIm9wdGltaXphdGlvblBvbGljeVwiOiAwLFxuICAgICAgICAgICAgXCJwZXJzaXN0ZW50XCI6IGZhbHNlXG4gICAgICAgIH07XG4gICAgICAgIHByZWZhYkRhdGEucHVzaChwcmVmYWJBc3NldCk7XG4gICAgICAgIGN1cnJlbnRJZCsrO1xuXG4gICAgICAgIC8vIOesrOS6jOS4quWFg+e0oO+8muagueiKgueCuVxuICAgICAgICBjb25zdCByb290Tm9kZSA9IGF3YWl0IHRoaXMuY3JlYXRlTm9kZU9iamVjdChub2RlRGF0YSwgbnVsbCwgcHJlZmFiRGF0YSwgY3VycmVudElkKTtcbiAgICAgICAgcHJlZmFiRGF0YS5wdXNoKHJvb3ROb2RlLm5vZGUpO1xuICAgICAgICBjdXJyZW50SWQgPSByb290Tm9kZS5uZXh0SWQ7XG5cbiAgICAgICAgLy8g5re75Yqg5qC56IqC54K555qEIFByZWZhYkluZm8gLSDkv67lpI1hc3NldOW8leeUqOS9v+eUqFVVSURcbiAgICAgICAgY29uc3Qgcm9vdFByZWZhYkluZm8gPSB7XG4gICAgICAgICAgICBcIl9fdHlwZV9fXCI6IFwiY2MuUHJlZmFiSW5mb1wiLFxuICAgICAgICAgICAgXCJyb290XCI6IHtcbiAgICAgICAgICAgICAgICBcIl9faWRfX1wiOiAxXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJhc3NldFwiOiB7XG4gICAgICAgICAgICAgICAgXCJfX3V1aWRfX1wiOiBwcmVmYWJVdWlkXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJmaWxlSWRcIjogdGhpcy5nZW5lcmF0ZUZpbGVJZCgpLFxuICAgICAgICAgICAgXCJpbnN0YW5jZVwiOiBudWxsLFxuICAgICAgICAgICAgXCJ0YXJnZXRPdmVycmlkZXNcIjogW10sXG4gICAgICAgICAgICBcIm5lc3RlZFByZWZhYkluc3RhbmNlUm9vdHNcIjogW11cbiAgICAgICAgfTtcbiAgICAgICAgcHJlZmFiRGF0YS5wdXNoKHJvb3RQcmVmYWJJbmZvKTtcblxuICAgICAgICByZXR1cm4gcHJlZmFiRGF0YTtcbiAgICB9XG5cblxuICAgIHByaXZhdGUgYXN5bmMgY3JlYXRlTm9kZU9iamVjdChub2RlRGF0YTogYW55LCBwYXJlbnRJZDogbnVtYmVyIHwgbnVsbCwgcHJlZmFiRGF0YTogYW55W10sIGN1cnJlbnRJZDogbnVtYmVyKTogUHJvbWlzZTx7IG5vZGU6IGFueTsgbmV4dElkOiBudW1iZXIgfT4ge1xuICAgICAgICBjb25zdCBub2RlSWQgPSBjdXJyZW50SWQrKztcbiAgICAgICAgXG4gICAgICAgIC8vIOaPkOWPluiKgueCueeahOWfuuacrOWxnuaApyAtIOmAgumFjXF1ZXJ5LW5vZGUtdHJlZeeahOaVsOaNruagvOW8j1xuICAgICAgICBjb25zdCBnZXRWYWx1ZSA9IChwcm9wOiBhbnkpID0+IHtcbiAgICAgICAgICAgIGlmIChwcm9wPy52YWx1ZSAhPT0gdW5kZWZpbmVkKSByZXR1cm4gcHJvcC52YWx1ZTtcbiAgICAgICAgICAgIGlmIChwcm9wICE9PSB1bmRlZmluZWQpIHJldHVybiBwcm9wO1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH07XG4gICAgICAgIFxuICAgICAgICBjb25zdCBwb3NpdGlvbiA9IGdldFZhbHVlKG5vZGVEYXRhLnBvc2l0aW9uKSB8fCBnZXRWYWx1ZShub2RlRGF0YS52YWx1ZT8ucG9zaXRpb24pIHx8IHsgeDogMCwgeTogMCwgejogMCB9O1xuICAgICAgICBjb25zdCByb3RhdGlvbiA9IGdldFZhbHVlKG5vZGVEYXRhLnJvdGF0aW9uKSB8fCBnZXRWYWx1ZShub2RlRGF0YS52YWx1ZT8ucm90YXRpb24pIHx8IHsgeDogMCwgeTogMCwgejogMCwgdzogMSB9O1xuICAgICAgICBjb25zdCBzY2FsZSA9IGdldFZhbHVlKG5vZGVEYXRhLnNjYWxlKSB8fCBnZXRWYWx1ZShub2RlRGF0YS52YWx1ZT8uc2NhbGUpIHx8IHsgeDogMSwgeTogMSwgejogMSB9O1xuICAgICAgICBjb25zdCBhY3RpdmUgPSBnZXRWYWx1ZShub2RlRGF0YS5hY3RpdmUpID8/IGdldFZhbHVlKG5vZGVEYXRhLnZhbHVlPy5hY3RpdmUpID8/IHRydWU7XG4gICAgICAgIGNvbnN0IG5hbWUgPSBnZXRWYWx1ZShub2RlRGF0YS5uYW1lKSB8fCBnZXRWYWx1ZShub2RlRGF0YS52YWx1ZT8ubmFtZSkgfHwgJ05vZGUnO1xuICAgICAgICBjb25zdCBsYXllciA9IGdldFZhbHVlKG5vZGVEYXRhLmxheWVyKSB8fCBnZXRWYWx1ZShub2RlRGF0YS52YWx1ZT8ubGF5ZXIpIHx8IDMzNTU0NDMyO1xuXG4gICAgICAgIGNvbnN0IG5vZGU6IGFueSA9IHtcbiAgICAgICAgICAgIFwiX190eXBlX19cIjogXCJjYy5Ob2RlXCIsXG4gICAgICAgICAgICBcIl9uYW1lXCI6IG5hbWUsXG4gICAgICAgICAgICBcIl9vYmpGbGFnc1wiOiAwLFxuICAgICAgICAgICAgXCJfX2VkaXRvckV4dHJhc19fXCI6IHt9LFxuICAgICAgICAgICAgXCJfcGFyZW50XCI6IHBhcmVudElkICE9PSBudWxsID8geyBcIl9faWRfX1wiOiBwYXJlbnRJZCB9IDogbnVsbCxcbiAgICAgICAgICAgIFwiX2NoaWxkcmVuXCI6IFtdLFxuICAgICAgICAgICAgXCJfYWN0aXZlXCI6IGFjdGl2ZSxcbiAgICAgICAgICAgIFwiX2NvbXBvbmVudHNcIjogW10sXG4gICAgICAgICAgICBcIl9wcmVmYWJcIjogcGFyZW50SWQgPT09IG51bGwgPyB7XG4gICAgICAgICAgICAgICAgXCJfX2lkX19cIjogY3VycmVudElkKytcbiAgICAgICAgICAgIH0gOiBudWxsLFxuICAgICAgICAgICAgXCJfbHBvc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJfX3R5cGVfX1wiOiBcImNjLlZlYzNcIixcbiAgICAgICAgICAgICAgICBcInhcIjogcG9zaXRpb24ueCxcbiAgICAgICAgICAgICAgICBcInlcIjogcG9zaXRpb24ueSxcbiAgICAgICAgICAgICAgICBcInpcIjogcG9zaXRpb24uelxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiX2xyb3RcIjoge1xuICAgICAgICAgICAgICAgIFwiX190eXBlX19cIjogXCJjYy5RdWF0XCIsXG4gICAgICAgICAgICAgICAgXCJ4XCI6IHJvdGF0aW9uLngsXG4gICAgICAgICAgICAgICAgXCJ5XCI6IHJvdGF0aW9uLnksXG4gICAgICAgICAgICAgICAgXCJ6XCI6IHJvdGF0aW9uLnosXG4gICAgICAgICAgICAgICAgXCJ3XCI6IHJvdGF0aW9uLndcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcIl9sc2NhbGVcIjoge1xuICAgICAgICAgICAgICAgIFwiX190eXBlX19cIjogXCJjYy5WZWMzXCIsXG4gICAgICAgICAgICAgICAgXCJ4XCI6IHNjYWxlLngsXG4gICAgICAgICAgICAgICAgXCJ5XCI6IHNjYWxlLnksXG4gICAgICAgICAgICAgICAgXCJ6XCI6IHNjYWxlLnpcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcIl9tb2JpbGl0eVwiOiAwLFxuICAgICAgICAgICAgXCJfbGF5ZXJcIjogbGF5ZXIsXG4gICAgICAgICAgICBcIl9ldWxlclwiOiB7XG4gICAgICAgICAgICAgICAgXCJfX3R5cGVfX1wiOiBcImNjLlZlYzNcIixcbiAgICAgICAgICAgICAgICBcInhcIjogMCxcbiAgICAgICAgICAgICAgICBcInlcIjogMCxcbiAgICAgICAgICAgICAgICBcInpcIjogMFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiX2lkXCI6IFwiXCJcbiAgICAgICAgfTtcblxuICAgICAgICAvLyDmmoLml7bot7Pov4dVSVRyYW5zZm9ybee7hOS7tuS7pemBv+WFjV9nZXREZXBlbmRDb21wb25lbnTplJnor69cbiAgICAgICAgLy8g5ZCO57ut6YCa6L+HRW5naW5lIEFQSeWKqOaAgea3u+WKoFxuICAgICAgICBkZWJ1Z0xvZyhg6IqC54K5ICR7bmFtZX0g5pqC5pe26Lez6L+HVUlUcmFuc2Zvcm3nu4Tku7bvvIzpgb/lhY3lvJXmk47kvp3otZbplJnor69gKTtcbiAgICAgICAgXG4gICAgICAgIC8vIOWkhOeQhuWFtuS7lue7hOS7tu+8iOaaguaXtui3s+i/h++8jOS4k+azqOS6juS/ruWkjVVJVHJhbnNmb3Jt6Zeu6aKY77yJXG4gICAgICAgIGNvbnN0IGNvbXBvbmVudHMgPSB0aGlzLmV4dHJhY3RDb21wb25lbnRzRnJvbU5vZGUobm9kZURhdGEpO1xuICAgICAgICBpZiAoY29tcG9uZW50cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBkZWJ1Z0xvZyhg6IqC54K5ICR7bmFtZX0g5YyF5ZCrICR7Y29tcG9uZW50cy5sZW5ndGh9IOS4quWFtuS7lue7hOS7tu+8jOaaguaXtui3s+i/h+S7peS4k+azqOS6jlVJVHJhbnNmb3Jt5L+u5aSNYCk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyDlpITnkIblrZDoioLngrkgLSDkvb/nlKhxdWVyeS1ub2RlLXRyZWXojrflj5bnmoTlrozmlbTnu5PmnoRcbiAgICAgICAgY29uc3QgY2hpbGRyZW5Ub1Byb2Nlc3MgPSB0aGlzLmdldENoaWxkcmVuVG9Qcm9jZXNzKG5vZGVEYXRhKTtcbiAgICAgICAgaWYgKGNoaWxkcmVuVG9Qcm9jZXNzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGRlYnVnTG9nKGA9PT0g5aSE55CG5a2Q6IqC54K5ID09PWApO1xuICAgICAgICAgICAgZGVidWdMb2coYOiKgueCuSAke25hbWV9IOWMheWQqyAke2NoaWxkcmVuVG9Qcm9jZXNzLmxlbmd0aH0g5Liq5a2Q6IqC54K5YCk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY2hpbGRyZW5Ub1Byb2Nlc3MubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICBjb25zdCBjaGlsZERhdGEgPSBjaGlsZHJlblRvUHJvY2Vzc1tpXTtcbiAgICAgICAgICAgICAgICBjb25zdCBjaGlsZE5hbWUgPSBjaGlsZERhdGEubmFtZSB8fCBjaGlsZERhdGEudmFsdWU/Lm5hbWUgfHwgJ+acquefpSc7XG4gICAgICAgICAgICAgICAgZGVidWdMb2coYOWkhOeQhuesrCR7aSArIDF95Liq5a2Q6IqC54K5OiAke2NoaWxkTmFtZX1gKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjaGlsZElkID0gY3VycmVudElkO1xuICAgICAgICAgICAgICAgICAgICBub2RlLl9jaGlsZHJlbi5wdXNoKHsgXCJfX2lkX19cIjogY2hpbGRJZCB9KTtcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIC8vIOmAkuW9kuWIm+W7uuWtkOiKgueCuVxuICAgICAgICAgICAgICAgICAgICBjb25zdCBjaGlsZFJlc3VsdCA9IGF3YWl0IHRoaXMuY3JlYXRlTm9kZU9iamVjdChjaGlsZERhdGEsIG5vZGVJZCwgcHJlZmFiRGF0YSwgY3VycmVudElkKTtcbiAgICAgICAgICAgICAgICAgICAgcHJlZmFiRGF0YS5wdXNoKGNoaWxkUmVzdWx0Lm5vZGUpO1xuICAgICAgICAgICAgICAgICAgICBjdXJyZW50SWQgPSBjaGlsZFJlc3VsdC5uZXh0SWQ7XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAvLyDlrZDoioLngrnkuI3pnIDopoFQcmVmYWJJbmZv77yM5Y+q5pyJ5qC56IqC54K56ZyA6KaBXG4gICAgICAgICAgICAgICAgICAgIC8vIOWtkOiKgueCueeahF9wcmVmYWLlupTor6Xorr7nva7kuLpudWxsXG4gICAgICAgICAgICAgICAgICAgIGNoaWxkUmVzdWx0Lm5vZGUuX3ByZWZhYiA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhg4pyFIOaIkOWKn+a3u+WKoOWtkOiKgueCuTogJHtjaGlsZE5hbWV9YCk7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihg5aSE55CG5a2Q6IqC54K5ICR7Y2hpbGROYW1lfSDml7blh7rplJk6YCwgZXJyb3IpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB7IG5vZGUsIG5leHRJZDogY3VycmVudElkIH07XG4gICAgfVxuXG4gICAgLy8g5LuO6IqC54K55pWw5o2u5Lit5o+Q5Y+W57uE5Lu25L+h5oGvXG4gICAgcHJpdmF0ZSBleHRyYWN0Q29tcG9uZW50c0Zyb21Ob2RlKG5vZGVEYXRhOiBhbnkpOiBhbnlbXSB7XG4gICAgICAgIGNvbnN0IGNvbXBvbmVudHM6IGFueVtdID0gW107XG4gICAgICAgIFxuICAgICAgICAvLyDku47kuI3lkIzkvY3nva7lsJ3or5Xojrflj5bnu4Tku7bmlbDmja5cbiAgICAgICAgY29uc3QgY29tcG9uZW50U291cmNlcyA9IFtcbiAgICAgICAgICAgIG5vZGVEYXRhLl9fY29tcHNfXyxcbiAgICAgICAgICAgIG5vZGVEYXRhLmNvbXBvbmVudHMsXG4gICAgICAgICAgICBub2RlRGF0YS52YWx1ZT8uX19jb21wc19fLFxuICAgICAgICAgICAgbm9kZURhdGEudmFsdWU/LmNvbXBvbmVudHNcbiAgICAgICAgXTtcbiAgICAgICAgXG4gICAgICAgIGZvciAoY29uc3Qgc291cmNlIG9mIGNvbXBvbmVudFNvdXJjZXMpIHtcbiAgICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KHNvdXJjZSkpIHtcbiAgICAgICAgICAgICAgICBjb21wb25lbnRzLnB1c2goLi4uc291cmNlLmZpbHRlcihjb21wID0+IGNvbXAgJiYgKGNvbXAuX190eXBlX18gfHwgY29tcC50eXBlKSkpO1xuICAgICAgICAgICAgICAgIGJyZWFrOyAvLyDmib7liLDmnInmlYjnmoTnu4Tku7bmlbDnu4TlsLHpgIDlh7pcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgcmV0dXJuIGNvbXBvbmVudHM7XG4gICAgfVxuICAgIFxuICAgIC8vIOWIm+W7uuagh+WHhueahOe7hOS7tuWvueixoVxuICAgIHByaXZhdGUgY3JlYXRlU3RhbmRhcmRDb21wb25lbnRPYmplY3QoY29tcG9uZW50RGF0YTogYW55LCBub2RlSWQ6IG51bWJlciwgcHJlZmFiSW5mb0lkOiBudW1iZXIpOiBhbnkge1xuICAgICAgICBjb25zdCBjb21wb25lbnRUeXBlID0gY29tcG9uZW50RGF0YS5fX3R5cGVfXyB8fCBjb21wb25lbnREYXRhLnR5cGU7XG4gICAgICAgIFxuICAgICAgICBpZiAoIWNvbXBvbmVudFR5cGUpIHtcbiAgICAgICAgICAgIGNvbnNvbGUud2Fybign57uE5Lu257y65bCR57G75Z6L5L+h5oGvOicsIGNvbXBvbmVudERhdGEpO1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vIOWfuuehgOe7hOS7tue7k+aehCAtIOWfuuS6juWumOaWuemihOWItuS9k+agvOW8j1xuICAgICAgICBjb25zdCBjb21wb25lbnQ6IGFueSA9IHtcbiAgICAgICAgICAgIFwiX190eXBlX19cIjogY29tcG9uZW50VHlwZSxcbiAgICAgICAgICAgIFwiX25hbWVcIjogXCJcIixcbiAgICAgICAgICAgIFwiX29iakZsYWdzXCI6IDAsXG4gICAgICAgICAgICBcIm5vZGVcIjoge1xuICAgICAgICAgICAgICAgIFwiX19pZF9fXCI6IG5vZGVJZFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiX2VuYWJsZWRcIjogdGhpcy5nZXRDb21wb25lbnRQcm9wZXJ0eVZhbHVlKGNvbXBvbmVudERhdGEsICdlbmFibGVkJywgdHJ1ZSksXG4gICAgICAgICAgICBcIl9fcHJlZmFiXCI6IHtcbiAgICAgICAgICAgICAgICBcIl9faWRfX1wiOiBwcmVmYWJJbmZvSWRcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgXG4gICAgICAgIC8vIOagueaNrue7hOS7tuexu+Wei+a3u+WKoOeJueWumuWxnuaAp1xuICAgICAgICB0aGlzLmFkZENvbXBvbmVudFNwZWNpZmljUHJvcGVydGllcyhjb21wb25lbnQsIGNvbXBvbmVudERhdGEsIGNvbXBvbmVudFR5cGUpO1xuICAgICAgICBcbiAgICAgICAgLy8g5re75YqgX2lk5bGe5oCnXG4gICAgICAgIGNvbXBvbmVudC5faWQgPSBcIlwiO1xuICAgICAgICBcbiAgICAgICAgcmV0dXJuIGNvbXBvbmVudDtcbiAgICB9XG4gICAgXG4gICAgLy8g5re75Yqg57uE5Lu254m55a6a55qE5bGe5oCnXG4gICAgcHJpdmF0ZSBhZGRDb21wb25lbnRTcGVjaWZpY1Byb3BlcnRpZXMoY29tcG9uZW50OiBhbnksIGNvbXBvbmVudERhdGE6IGFueSwgY29tcG9uZW50VHlwZTogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIHN3aXRjaCAoY29tcG9uZW50VHlwZSkge1xuICAgICAgICAgICAgY2FzZSAnY2MuVUlUcmFuc2Zvcm0nOlxuICAgICAgICAgICAgICAgIHRoaXMuYWRkVUlUcmFuc2Zvcm1Qcm9wZXJ0aWVzKGNvbXBvbmVudCwgY29tcG9uZW50RGF0YSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdjYy5TcHJpdGUnOlxuICAgICAgICAgICAgICAgIHRoaXMuYWRkU3ByaXRlUHJvcGVydGllcyhjb21wb25lbnQsIGNvbXBvbmVudERhdGEpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnY2MuTGFiZWwnOlxuICAgICAgICAgICAgICAgIHRoaXMuYWRkTGFiZWxQcm9wZXJ0aWVzKGNvbXBvbmVudCwgY29tcG9uZW50RGF0YSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdjYy5CdXR0b24nOlxuICAgICAgICAgICAgICAgIHRoaXMuYWRkQnV0dG9uUHJvcGVydGllcyhjb21wb25lbnQsIGNvbXBvbmVudERhdGEpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAvLyDlr7nkuo7mnKrnn6XnsbvlnovnmoTnu4Tku7bvvIzlpI3liLbmiYDmnInlronlhajnmoTlsZ7mgKdcbiAgICAgICAgICAgICAgICB0aGlzLmFkZEdlbmVyaWNQcm9wZXJ0aWVzKGNvbXBvbmVudCwgY29tcG9uZW50RGF0YSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgLy8gVUlUcmFuc2Zvcm3nu4Tku7blsZ7mgKdcbiAgICBwcml2YXRlIGFkZFVJVHJhbnNmb3JtUHJvcGVydGllcyhjb21wb25lbnQ6IGFueSwgY29tcG9uZW50RGF0YTogYW55KTogdm9pZCB7XG4gICAgICAgIGNvbXBvbmVudC5fY29udGVudFNpemUgPSB0aGlzLmNyZWF0ZVNpemVPYmplY3QoXG4gICAgICAgICAgICB0aGlzLmdldENvbXBvbmVudFByb3BlcnR5VmFsdWUoY29tcG9uZW50RGF0YSwgJ2NvbnRlbnRTaXplJywgeyB3aWR0aDogMTAwLCBoZWlnaHQ6IDEwMCB9KVxuICAgICAgICApO1xuICAgICAgICBjb21wb25lbnQuX2FuY2hvclBvaW50ID0gdGhpcy5jcmVhdGVWZWMyT2JqZWN0KFxuICAgICAgICAgICAgdGhpcy5nZXRDb21wb25lbnRQcm9wZXJ0eVZhbHVlKGNvbXBvbmVudERhdGEsICdhbmNob3JQb2ludCcsIHsgeDogMC41LCB5OiAwLjUgfSlcbiAgICAgICAgKTtcbiAgICB9XG4gICAgXG4gICAgLy8gU3ByaXRl57uE5Lu25bGe5oCnXG4gICAgcHJpdmF0ZSBhZGRTcHJpdGVQcm9wZXJ0aWVzKGNvbXBvbmVudDogYW55LCBjb21wb25lbnREYXRhOiBhbnkpOiB2b2lkIHtcbiAgICAgICAgY29tcG9uZW50Ll92aXNGbGFncyA9IDA7XG4gICAgICAgIGNvbXBvbmVudC5fY3VzdG9tTWF0ZXJpYWwgPSBudWxsO1xuICAgICAgICBjb21wb25lbnQuX3NyY0JsZW5kRmFjdG9yID0gMjtcbiAgICAgICAgY29tcG9uZW50Ll9kc3RCbGVuZEZhY3RvciA9IDQ7XG4gICAgICAgIGNvbXBvbmVudC5fY29sb3IgPSB0aGlzLmNyZWF0ZUNvbG9yT2JqZWN0KFxuICAgICAgICAgICAgdGhpcy5nZXRDb21wb25lbnRQcm9wZXJ0eVZhbHVlKGNvbXBvbmVudERhdGEsICdjb2xvcicsIHsgcjogMjU1LCBnOiAyNTUsIGI6IDI1NSwgYTogMjU1IH0pXG4gICAgICAgICk7XG4gICAgICAgIGNvbXBvbmVudC5fc3ByaXRlRnJhbWUgPSB0aGlzLmdldENvbXBvbmVudFByb3BlcnR5VmFsdWUoY29tcG9uZW50RGF0YSwgJ3Nwcml0ZUZyYW1lJywgbnVsbCk7XG4gICAgICAgIGNvbXBvbmVudC5fdHlwZSA9IHRoaXMuZ2V0Q29tcG9uZW50UHJvcGVydHlWYWx1ZShjb21wb25lbnREYXRhLCAndHlwZScsIDApO1xuICAgICAgICBjb21wb25lbnQuX2ZpbGxUeXBlID0gMDtcbiAgICAgICAgY29tcG9uZW50Ll9zaXplTW9kZSA9IHRoaXMuZ2V0Q29tcG9uZW50UHJvcGVydHlWYWx1ZShjb21wb25lbnREYXRhLCAnc2l6ZU1vZGUnLCAxKTtcbiAgICAgICAgY29tcG9uZW50Ll9maWxsQ2VudGVyID0gdGhpcy5jcmVhdGVWZWMyT2JqZWN0KHsgeDogMCwgeTogMCB9KTtcbiAgICAgICAgY29tcG9uZW50Ll9maWxsU3RhcnQgPSAwO1xuICAgICAgICBjb21wb25lbnQuX2ZpbGxSYW5nZSA9IDA7XG4gICAgICAgIGNvbXBvbmVudC5faXNUcmltbWVkTW9kZSA9IHRydWU7XG4gICAgICAgIGNvbXBvbmVudC5fdXNlR3JheXNjYWxlID0gZmFsc2U7XG4gICAgICAgIGNvbXBvbmVudC5fYXRsYXMgPSBudWxsO1xuICAgIH1cbiAgICBcbiAgICAvLyBMYWJlbOe7hOS7tuWxnuaAp1xuICAgIHByaXZhdGUgYWRkTGFiZWxQcm9wZXJ0aWVzKGNvbXBvbmVudDogYW55LCBjb21wb25lbnREYXRhOiBhbnkpOiB2b2lkIHtcbiAgICAgICAgY29tcG9uZW50Ll92aXNGbGFncyA9IDA7XG4gICAgICAgIGNvbXBvbmVudC5fY3VzdG9tTWF0ZXJpYWwgPSBudWxsO1xuICAgICAgICBjb21wb25lbnQuX3NyY0JsZW5kRmFjdG9yID0gMjtcbiAgICAgICAgY29tcG9uZW50Ll9kc3RCbGVuZEZhY3RvciA9IDQ7XG4gICAgICAgIGNvbXBvbmVudC5fY29sb3IgPSB0aGlzLmNyZWF0ZUNvbG9yT2JqZWN0KFxuICAgICAgICAgICAgdGhpcy5nZXRDb21wb25lbnRQcm9wZXJ0eVZhbHVlKGNvbXBvbmVudERhdGEsICdjb2xvcicsIHsgcjogMCwgZzogMCwgYjogMCwgYTogMjU1IH0pXG4gICAgICAgICk7XG4gICAgICAgIGNvbXBvbmVudC5fc3RyaW5nID0gdGhpcy5nZXRDb21wb25lbnRQcm9wZXJ0eVZhbHVlKGNvbXBvbmVudERhdGEsICdzdHJpbmcnLCAnTGFiZWwnKTtcbiAgICAgICAgY29tcG9uZW50Ll9ob3Jpem9udGFsQWxpZ24gPSAxO1xuICAgICAgICBjb21wb25lbnQuX3ZlcnRpY2FsQWxpZ24gPSAxO1xuICAgICAgICBjb21wb25lbnQuX2FjdHVhbEZvbnRTaXplID0gMjA7XG4gICAgICAgIGNvbXBvbmVudC5fZm9udFNpemUgPSB0aGlzLmdldENvbXBvbmVudFByb3BlcnR5VmFsdWUoY29tcG9uZW50RGF0YSwgJ2ZvbnRTaXplJywgMjApO1xuICAgICAgICBjb21wb25lbnQuX2ZvbnRGYW1pbHkgPSAnQXJpYWwnO1xuICAgICAgICBjb21wb25lbnQuX2xpbmVIZWlnaHQgPSA0MDtcbiAgICAgICAgY29tcG9uZW50Ll9vdmVyZmxvdyA9IDE7XG4gICAgICAgIGNvbXBvbmVudC5fZW5hYmxlV3JhcFRleHQgPSBmYWxzZTtcbiAgICAgICAgY29tcG9uZW50Ll9mb250ID0gbnVsbDtcbiAgICAgICAgY29tcG9uZW50Ll9pc1N5c3RlbUZvbnRVc2VkID0gdHJ1ZTtcbiAgICAgICAgY29tcG9uZW50Ll9pc0l0YWxpYyA9IGZhbHNlO1xuICAgICAgICBjb21wb25lbnQuX2lzQm9sZCA9IGZhbHNlO1xuICAgICAgICBjb21wb25lbnQuX2lzVW5kZXJsaW5lID0gZmFsc2U7XG4gICAgICAgIGNvbXBvbmVudC5fdW5kZXJsaW5lSGVpZ2h0ID0gMjtcbiAgICAgICAgY29tcG9uZW50Ll9jYWNoZU1vZGUgPSAwO1xuICAgIH1cbiAgICBcbiAgICAvLyBCdXR0b27nu4Tku7blsZ7mgKdcbiAgICBwcml2YXRlIGFkZEJ1dHRvblByb3BlcnRpZXMoY29tcG9uZW50OiBhbnksIGNvbXBvbmVudERhdGE6IGFueSk6IHZvaWQge1xuICAgICAgICBjb21wb25lbnQuY2xpY2tFdmVudHMgPSBbXTtcbiAgICAgICAgY29tcG9uZW50Ll9pbnRlcmFjdGFibGUgPSB0cnVlO1xuICAgICAgICBjb21wb25lbnQuX3RyYW5zaXRpb24gPSAyO1xuICAgICAgICBjb21wb25lbnQuX25vcm1hbENvbG9yID0gdGhpcy5jcmVhdGVDb2xvck9iamVjdCh7IHI6IDIxNCwgZzogMjE0LCBiOiAyMTQsIGE6IDI1NSB9KTtcbiAgICAgICAgY29tcG9uZW50Ll9ob3ZlckNvbG9yID0gdGhpcy5jcmVhdGVDb2xvck9iamVjdCh7IHI6IDIxMSwgZzogMjExLCBiOiAyMTEsIGE6IDI1NSB9KTtcbiAgICAgICAgY29tcG9uZW50Ll9wcmVzc2VkQ29sb3IgPSB0aGlzLmNyZWF0ZUNvbG9yT2JqZWN0KHsgcjogMjU1LCBnOiAyNTUsIGI6IDI1NSwgYTogMjU1IH0pO1xuICAgICAgICBjb21wb25lbnQuX2Rpc2FibGVkQ29sb3IgPSB0aGlzLmNyZWF0ZUNvbG9yT2JqZWN0KHsgcjogMTI0LCBnOiAxMjQsIGI6IDEyNCwgYTogMjU1IH0pO1xuICAgICAgICBjb21wb25lbnQuX2R1cmF0aW9uID0gMC4xO1xuICAgICAgICBjb21wb25lbnQuX3pvb21TY2FsZSA9IDEuMjtcbiAgICB9XG4gICAgXG4gICAgLy8g5re75Yqg6YCa55So5bGe5oCnXG4gICAgcHJpdmF0ZSBhZGRHZW5lcmljUHJvcGVydGllcyhjb21wb25lbnQ6IGFueSwgY29tcG9uZW50RGF0YTogYW55KTogdm9pZCB7XG4gICAgICAgIC8vIOWPquWkjeWItuWuieWFqOeahOOAgeW3suefpeeahOWxnuaAp1xuICAgICAgICBjb25zdCBzYWZlUHJvcGVydGllcyA9IFsnZW5hYmxlZCcsICdjb2xvcicsICdzdHJpbmcnLCAnZm9udFNpemUnLCAnc3ByaXRlRnJhbWUnLCAndHlwZScsICdzaXplTW9kZSddO1xuICAgICAgICBcbiAgICAgICAgZm9yIChjb25zdCBwcm9wIG9mIHNhZmVQcm9wZXJ0aWVzKSB7XG4gICAgICAgICAgICBpZiAoY29tcG9uZW50RGF0YS5oYXNPd25Qcm9wZXJ0eShwcm9wKSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHZhbHVlID0gdGhpcy5nZXRDb21wb25lbnRQcm9wZXJ0eVZhbHVlKGNvbXBvbmVudERhdGEsIHByb3ApO1xuICAgICAgICAgICAgICAgIGlmICh2YWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudFtgXyR7cHJvcH1gXSA9IHZhbHVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBcbiAgICAvLyDliJvlu7pWZWMy5a+56LGhXG4gICAgcHJpdmF0ZSBjcmVhdGVWZWMyT2JqZWN0KGRhdGE6IGFueSk6IGFueSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBcIl9fdHlwZV9fXCI6IFwiY2MuVmVjMlwiLFxuICAgICAgICAgICAgXCJ4XCI6IGRhdGE/LnggfHwgMCxcbiAgICAgICAgICAgIFwieVwiOiBkYXRhPy55IHx8IDBcbiAgICAgICAgfTtcbiAgICB9XG4gICAgXG4gICAgLy8g5Yib5bu6VmVjM+WvueixoVxuICAgIHByaXZhdGUgY3JlYXRlVmVjM09iamVjdChkYXRhOiBhbnkpOiBhbnkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgXCJfX3R5cGVfX1wiOiBcImNjLlZlYzNcIixcbiAgICAgICAgICAgIFwieFwiOiBkYXRhPy54IHx8IDAsXG4gICAgICAgICAgICBcInlcIjogZGF0YT8ueSB8fCAwLFxuICAgICAgICAgICAgXCJ6XCI6IGRhdGE/LnogfHwgMFxuICAgICAgICB9O1xuICAgIH1cbiAgICBcbiAgICAvLyDliJvlu7pTaXpl5a+56LGhXG4gICAgcHJpdmF0ZSBjcmVhdGVTaXplT2JqZWN0KGRhdGE6IGFueSk6IGFueSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBcIl9fdHlwZV9fXCI6IFwiY2MuU2l6ZVwiLFxuICAgICAgICAgICAgXCJ3aWR0aFwiOiBkYXRhPy53aWR0aCB8fCAxMDAsXG4gICAgICAgICAgICBcImhlaWdodFwiOiBkYXRhPy5oZWlnaHQgfHwgMTAwXG4gICAgICAgIH07XG4gICAgfVxuICAgIFxuICAgIC8vIOWIm+W7ukNvbG9y5a+56LGhXG4gICAgcHJpdmF0ZSBjcmVhdGVDb2xvck9iamVjdChkYXRhOiBhbnkpOiBhbnkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgXCJfX3R5cGVfX1wiOiBcImNjLkNvbG9yXCIsXG4gICAgICAgICAgICBcInJcIjogZGF0YT8uciA/PyAyNTUsXG4gICAgICAgICAgICBcImdcIjogZGF0YT8uZyA/PyAyNTUsXG4gICAgICAgICAgICBcImJcIjogZGF0YT8uYiA/PyAyNTUsXG4gICAgICAgICAgICBcImFcIjogZGF0YT8uYSA/PyAyNTVcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyDliKTmlq3mmK/lkKblupTor6XlpI3liLbnu4Tku7blsZ7mgKdcbiAgICBwcml2YXRlIHNob3VsZENvcHlDb21wb25lbnRQcm9wZXJ0eShrZXk6IHN0cmluZywgdmFsdWU6IGFueSk6IGJvb2xlYW4ge1xuICAgICAgICAvLyDot7Pov4flhoXpg6jlsZ7mgKflkozlt7LlpITnkIbnmoTlsZ7mgKdcbiAgICAgICAgaWYgKGtleS5zdGFydHNXaXRoKCdfXycpIHx8IGtleSA9PT0gJ19lbmFibGVkJyB8fCBrZXkgPT09ICdub2RlJyB8fCBrZXkgPT09ICdlbmFibGVkJykge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAvLyDot7Pov4flh73mlbDlkox1bmRlZmluZWTlgLxcbiAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ2Z1bmN0aW9uJyB8fCB2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuXG4gICAgLy8g6I635Y+W57uE5Lu25bGe5oCn5YC8IC0g6YeN5ZG95ZCN5Lul6YG/5YWN5Yay56qBXG4gICAgcHJpdmF0ZSBnZXRDb21wb25lbnRQcm9wZXJ0eVZhbHVlKGNvbXBvbmVudERhdGE6IGFueSwgcHJvcGVydHlOYW1lOiBzdHJpbmcsIGRlZmF1bHRWYWx1ZT86IGFueSk6IGFueSB7XG4gICAgICAgIC8vIOWwneivleebtOaOpeiOt+WPluWxnuaAp1xuICAgICAgICBpZiAoY29tcG9uZW50RGF0YVtwcm9wZXJ0eU5hbWVdICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmV4dHJhY3RWYWx1ZShjb21wb25lbnREYXRhW3Byb3BlcnR5TmFtZV0pO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAvLyDlsJ3or5Xku452YWx1ZeWxnuaAp+S4reiOt+WPllxuICAgICAgICBpZiAoY29tcG9uZW50RGF0YS52YWx1ZSAmJiBjb21wb25lbnREYXRhLnZhbHVlW3Byb3BlcnR5TmFtZV0gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZXh0cmFjdFZhbHVlKGNvbXBvbmVudERhdGEudmFsdWVbcHJvcGVydHlOYW1lXSk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vIOWwneivleW4puS4i+WIkue6v+WJjee8gOeahOWxnuaAp+WQjVxuICAgICAgICBjb25zdCBwcmVmaXhlZE5hbWUgPSBgXyR7cHJvcGVydHlOYW1lfWA7XG4gICAgICAgIGlmIChjb21wb25lbnREYXRhW3ByZWZpeGVkTmFtZV0gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZXh0cmFjdFZhbHVlKGNvbXBvbmVudERhdGFbcHJlZml4ZWROYW1lXSk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHJldHVybiBkZWZhdWx0VmFsdWU7XG4gICAgfVxuICAgIFxuICAgIC8vIOaPkOWPluWxnuaAp+WAvFxuICAgIHByaXZhdGUgZXh0cmFjdFZhbHVlKGRhdGE6IGFueSk6IGFueSB7XG4gICAgICAgIGlmIChkYXRhID09PSBudWxsIHx8IGRhdGEgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgcmV0dXJuIGRhdGE7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vIOWmguaenOaciXZhbHVl5bGe5oCn77yM5LyY5YWI5L2/55SodmFsdWVcbiAgICAgICAgaWYgKHR5cGVvZiBkYXRhID09PSAnb2JqZWN0JyAmJiBkYXRhLmhhc093blByb3BlcnR5KCd2YWx1ZScpKSB7XG4gICAgICAgICAgICByZXR1cm4gZGF0YS52YWx1ZTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgLy8g5aaC5p6c5piv5byV55So5a+56LGh77yM5L+d5oyB5Y6f5qC3XG4gICAgICAgIGlmICh0eXBlb2YgZGF0YSA9PT0gJ29iamVjdCcgJiYgKGRhdGEuX19pZF9fICE9PSB1bmRlZmluZWQgfHwgZGF0YS5fX3V1aWRfXyAhPT0gdW5kZWZpbmVkKSkge1xuICAgICAgICAgICAgcmV0dXJuIGRhdGE7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHJldHVybiBkYXRhO1xuICAgIH1cblxuICAgIHByaXZhdGUgY3JlYXRlU3RhbmRhcmRNZXRhRGF0YShwcmVmYWJOYW1lOiBzdHJpbmcsIHByZWZhYlV1aWQ6IHN0cmluZyk6IGFueSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBcInZlclwiOiBcIjEuMS41MFwiLFxuICAgICAgICAgICAgXCJpbXBvcnRlclwiOiBcInByZWZhYlwiLFxuICAgICAgICAgICAgXCJpbXBvcnRlZFwiOiB0cnVlLFxuICAgICAgICAgICAgXCJ1dWlkXCI6IHByZWZhYlV1aWQsXG4gICAgICAgICAgICBcImZpbGVzXCI6IFtcbiAgICAgICAgICAgICAgICBcIi5qc29uXCJcbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgICBcInN1Yk1ldGFzXCI6IHt9LFxuICAgICAgICAgICAgXCJ1c2VyRGF0YVwiOiB7XG4gICAgICAgICAgICAgICAgXCJzeW5jTm9kZU5hbWVcIjogcHJlZmFiTmFtZVxuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgc2F2ZVByZWZhYldpdGhNZXRhKHByZWZhYlBhdGg6IHN0cmluZywgcHJlZmFiRGF0YTogYW55W10sIG1ldGFEYXRhOiBhbnkpOiBQcm9taXNlPHsgc3VjY2VzczogYm9vbGVhbjsgZXJyb3I/OiBzdHJpbmcgfT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcHJlZmFiQ29udGVudCA9IEpTT04uc3RyaW5naWZ5KHByZWZhYkRhdGEsIG51bGwsIDIpO1xuICAgICAgICAgICAgY29uc3QgbWV0YUNvbnRlbnQgPSBKU09OLnN0cmluZ2lmeShtZXRhRGF0YSwgbnVsbCwgMik7XG5cbiAgICAgICAgICAgIC8vIOehruS/nei3r+W+hOS7pS5wcmVmYWLnu5PlsL5cbiAgICAgICAgICAgIGNvbnN0IGZpbmFsUHJlZmFiUGF0aCA9IHByZWZhYlBhdGguZW5kc1dpdGgoJy5wcmVmYWInKSA/IHByZWZhYlBhdGggOiBgJHtwcmVmYWJQYXRofS5wcmVmYWJgO1xuICAgICAgICAgICAgY29uc3QgbWV0YVBhdGggPSBgJHtmaW5hbFByZWZhYlBhdGh9Lm1ldGFgO1xuXG4gICAgICAgICAgICAvLyDkvb/nlKhhc3NldC1kYiBBUEnliJvlu7rpooTliLbkvZPmlofku7ZcbiAgICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdjcmVhdGUtYXNzZXQnLCBmaW5hbFByZWZhYlBhdGgsIHByZWZhYkNvbnRlbnQpLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHRydWUpO1xuICAgICAgICAgICAgICAgIH0pLmNhdGNoKChlcnJvcjogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHJlamVjdChlcnJvcik7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8g5Yib5bu6bWV0YeaWh+S7tlxuICAgICAgICAgICAgYXdhaXQgbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ2NyZWF0ZS1hc3NldCcsIG1ldGFQYXRoLCBtZXRhQ29udGVudCkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUodHJ1ZSk7XG4gICAgICAgICAgICAgICAgfSkuY2F0Y2goKGVycm9yOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmVqZWN0KGVycm9yKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBkZWJ1Z0xvZyhgPT09IOmihOWItuS9k+S/neWtmOWujOaIkCA9PT1gKTtcbiAgICAgICAgICAgIGRlYnVnTG9nKGDpooTliLbkvZPmlofku7blt7Lkv53lrZg6ICR7ZmluYWxQcmVmYWJQYXRofWApO1xuICAgICAgICAgICAgZGVidWdMb2coYE1ldGHmlofku7blt7Lkv53lrZg6ICR7bWV0YVBhdGh9YCk7XG4gICAgICAgICAgICBkZWJ1Z0xvZyhg6aKE5Yi25L2T5pWw57uE5oC76ZW/5bqmOiAke3ByZWZhYkRhdGEubGVuZ3RofWApO1xuICAgICAgICAgICAgZGVidWdMb2coYOmihOWItuS9k+agueiKgueCuee0ouW8lTogJHtwcmVmYWJEYXRhLmxlbmd0aCAtIDF9YCk7XG5cbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcign5L+d5a2Y6aKE5Yi25L2T5paH5Lu25pe25Ye66ZSZOicsIGVycm9yKTtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3IubWVzc2FnZSB9O1xuICAgICAgICB9XG4gICAgfVxuXG59Il19