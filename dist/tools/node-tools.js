"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NodeTools = void 0;
const response_1 = require("../lib/response");
const component_tools_1 = require("./component-tools");
const log_1 = require("../lib/log");
const schema_1 = require("../lib/schema");
const decorators_1 = require("../lib/decorators");
const scene_bridge_1 = require("../lib/scene-bridge");
const batch_set_1 = require("../lib/batch-set");
const instance_reference_1 = require("../lib/instance-reference");
const node_classifications_1 = require("../lib/node-classifications");
const component_lookup_1 = require("../lib/component-lookup");
const dump_unwrap_1 = require("../lib/dump-unwrap");
const scene_root_1 = require("../lib/scene-root");
// vec3 shared via lib/schemas.ts — used by create_node's initialTransform.
const schemas_1 = require("../lib/schemas");
// Standard cc.Layers bit values. Custom user-defined layers go through the
// numeric branch of the create_node `layer` arg, so this list only enumerates
// the engine-shipped presets.
const LAYER_PRESETS = {
    DEFAULT: 1073741824, // 1 << 30
    UI_2D: 33554432, // 1 << 25
    SCENE_GIZMO: 16777216, // 1 << 24
    UI_3D: 8388608, // 1 << 23
    EDITOR: 4194304, // 1 << 22
    GIZMOS: 2097152, // 1 << 21
    IGNORE_RAYCAST: 1048576, // 1 << 20
    PROFILER: 268435456, // 1 << 28
};
// set_node_transform has axis-specific descriptions per channel; rebuild each
// inline so the per-axis text matches the original hand-written schema exactly.
const transformPositionSchema = schema_1.z.object({
    x: schema_1.z.number().optional(),
    y: schema_1.z.number().optional(),
    z: schema_1.z.number().optional().describe('Z coordinate. Ignored/normalized for 2D nodes.'),
});
const transformRotationSchema = schema_1.z.object({
    x: schema_1.z.number().optional().describe('X euler rotation. Ignored/normalized for 2D nodes.'),
    y: schema_1.z.number().optional().describe('Y euler rotation. Ignored/normalized for 2D nodes.'),
    z: schema_1.z.number().optional().describe('Z euler rotation. Main rotation axis for 2D nodes.'),
});
const transformScaleSchema = schema_1.z.object({
    x: schema_1.z.number().optional(),
    y: schema_1.z.number().optional(),
    z: schema_1.z.number().optional().describe('Z scale. Usually 1 for 2D nodes.'),
});
// nodeSpecSchema: children uses z.any() instead of z.lazy() to avoid
// $ref in the JSON Schema output (Gemini rejects $ref/$defs — landmine #15).
const nodeSpecSchema = schema_1.z.object({
    name: schema_1.z.string().describe('Node name.'),
    nodeType: schema_1.z.enum(['Node', '2DNode', '3DNode']).default('Node').optional().describe('Empty-node type hint.'),
    components: schema_1.z.array(schema_1.z.string()).optional().describe('Component types to add, e.g. ["cc.Sprite"].'),
    layer: schema_1.z.union([
        schema_1.z.enum(['DEFAULT', 'UI_2D', 'UI_3D', 'SCENE_GIZMO', 'EDITOR', 'GIZMOS', 'IGNORE_RAYCAST', 'PROFILER']),
        schema_1.z.number().int().nonnegative(),
    ]).optional().describe('Node layer preset or raw bitmask.'),
    active: schema_1.z.boolean().optional().describe('Set false to create the node inactive.'),
    position: schema_1.z.object({
        x: schema_1.z.number().optional(),
        y: schema_1.z.number().optional(),
        z: schema_1.z.number().optional(),
    }).optional(),
    rotation: schema_1.z.object({
        x: schema_1.z.number().optional(),
        y: schema_1.z.number().optional(),
        z: schema_1.z.number().optional(),
    }).optional(),
    scale: schema_1.z.object({
        x: schema_1.z.number().optional(),
        y: schema_1.z.number().optional(),
        z: schema_1.z.number().optional(),
    }).optional(),
    children: schema_1.z.array(schema_1.z.any()).optional().describe('Nested node specs (same shape, recursively).'),
});
class NodeTools {
    constructor() {
        this.componentTools = new component_tools_1.ComponentTools();
        this.exec = (0, decorators_1.defineToolsFromDecorators)(this);
    }
    getTools() { return this.exec.getTools(); }
    execute(toolName, args) { return this.exec.execute(toolName, args); }
    async createTreeNode(spec, parentUuid, pathPrefix, results) {
        var _a, _b, _c;
        const createArgs = {
            name: spec.name,
            parentUuid,
            nodeType: spec.nodeType || 'Node',
            components: spec.components,
            layer: spec.layer,
        };
        if (spec.position || spec.rotation || spec.scale) {
            createArgs.initialTransform = {
                position: spec.position,
                rotation: spec.rotation,
                scale: spec.scale,
            };
        }
        const createResult = await this.execute('create_node', createArgs);
        if (!createResult.success) {
            return createResult;
        }
        const uuid = ((_b = (_a = createResult.data) === null || _a === void 0 ? void 0 : _a.nodeInfo) === null || _b === void 0 ? void 0 : _b.uuid) || ((_c = createResult.data) === null || _c === void 0 ? void 0 : _c.uuid);
        if (!uuid) {
            return (0, response_1.fail)('create_node did not return a node UUID');
        }
        if (spec.active === false) {
            await Editor.Message.request('scene', 'set-property', {
                uuid,
                path: 'active',
                dump: { value: false },
            });
        }
        const key = pathPrefix + spec.name;
        results[key] = uuid;
        for (const child of spec.children || []) {
            const childResult = await this.createTreeNode(child, uuid, key + '/', results);
            if (!childResult.success) {
                return childResult;
            }
        }
        return (0, response_1.ok)({ uuid });
    }
    async createTree(args) {
        try {
            let parentUuid = args.parentUuid;
            if (!parentUuid) {
                parentUuid = await (0, scene_root_1.getSceneRootUuid)();
            }
            const nodes = {};
            for (const item of args.spec) {
                const result = await this.createTreeNode(item, parentUuid, '', nodes);
                if (!result.success) {
                    return result;
                }
            }
            return (0, response_1.ok)({
                nodes,
                count: Object.keys(nodes).length,
            });
        }
        catch (err) {
            return (0, response_1.fail)(`Failed to create node tree: ${err.message}`);
        }
    }
    async createNode(args) {
        try {
            let targetParentUuid = args.parentUuid;
            // 如果沒有提供父節點UUID，獲取場景根節點
            if (!targetParentUuid) {
                try {
                    targetParentUuid = await (0, scene_root_1.getSceneRootUuid)();
                    if (targetParentUuid) {
                        (0, log_1.debugLog)(`No parent specified, using scene root: ${targetParentUuid}`);
                    }
                    else {
                        const currentScene = await Editor.Message.request('scene', 'query-current-scene');
                        if (currentScene && currentScene.uuid) {
                            targetParentUuid = currentScene.uuid;
                        }
                    }
                }
                catch (err) {
                    console.warn('Failed to get scene root, will use default behavior');
                }
            }
            // 如果提供了assetPath，先解析為assetUuid
            let finalAssetUuid = args.assetUuid;
            if (args.assetPath && !finalAssetUuid) {
                try {
                    const assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', args.assetPath);
                    if (assetInfo && assetInfo.uuid) {
                        finalAssetUuid = assetInfo.uuid;
                        (0, log_1.debugLog)(`Asset path '${args.assetPath}' resolved to UUID: ${finalAssetUuid}`);
                    }
                    else {
                        return (0, response_1.fail)(`Asset not found at path: ${args.assetPath}`);
                    }
                }
                catch (err) {
                    return (0, response_1.fail)(`Failed to resolve asset path '${args.assetPath}': ${err}`);
                }
            }
            // 構建create-node選項
            const createNodeOptions = {
                name: args.name
            };
            // 設置父節點
            if (targetParentUuid) {
                createNodeOptions.parent = targetParentUuid;
            }
            // 從資源實例化
            if (finalAssetUuid) {
                createNodeOptions.assetUuid = finalAssetUuid;
                if (args.unlinkPrefab) {
                    createNodeOptions.unlinkPrefab = true;
                }
            }
            // 添加組件
            if (args.components && args.components.length > 0) {
                createNodeOptions.components = args.components;
            }
            else if (args.nodeType && args.nodeType !== 'Node' && !finalAssetUuid) {
                // 只有在不從資源實例化時才添加nodeType組件
                createNodeOptions.components = [args.nodeType];
            }
            // 保持世界變換
            if (args.keepWorldTransform) {
                createNodeOptions.keepWorldTransform = true;
            }
            // 不使用dump參數處理初始變換，創建後使用set_node_transform設置
            (0, log_1.debugLog)('Creating node with options:', createNodeOptions);
            // 創建節點
            const nodeUuid = await Editor.Message.request('scene', 'create-node', createNodeOptions);
            const uuid = Array.isArray(nodeUuid) ? nodeUuid[0] : nodeUuid;
            // 處理兄弟索引
            if (args.siblingIndex !== undefined && args.siblingIndex >= 0 && uuid && targetParentUuid) {
                try {
                    await new Promise(resolve => setTimeout(resolve, 100)); // 等待內部狀態更新
                    await Editor.Message.request('scene', 'set-parent', {
                        parent: targetParentUuid,
                        uuids: [uuid],
                        keepWorldTransform: args.keepWorldTransform || false
                    });
                }
                catch (err) {
                    console.warn('Failed to set sibling index:', err);
                }
            }
            // 添加組件（如果提供的話）
            if (args.components && args.components.length > 0 && uuid) {
                try {
                    await new Promise(resolve => setTimeout(resolve, 100)); // 等待節點創建完成
                    for (const componentType of args.components) {
                        try {
                            const result = await this.componentTools.execute('add_component', {
                                nodeUuid: uuid,
                                componentType: componentType
                            });
                            if (result.success) {
                                (0, log_1.debugLog)(`Component ${componentType} added successfully`);
                            }
                            else {
                                console.warn(`Failed to add component ${componentType}:`, result.error);
                            }
                        }
                        catch (err) {
                            console.warn(`Failed to add component ${componentType}:`, err);
                        }
                    }
                }
                catch (err) {
                    console.warn('Failed to add components:', err);
                }
            }
            // 設置初始變換（如果提供的話）
            if (args.initialTransform && uuid) {
                try {
                    await new Promise(resolve => setTimeout(resolve, 150)); // 等待節點和組件創建完成
                    await this.setNodeTransform({
                        uuid: uuid,
                        position: args.initialTransform.position,
                        rotation: args.initialTransform.rotation,
                        scale: args.initialTransform.scale
                    });
                    (0, log_1.debugLog)('Initial transform applied successfully');
                }
                catch (err) {
                    console.warn('Failed to set initial transform:', err);
                }
            }
            // 設定 layer（user-provided 或 auto-detect Canvas ancestor）
            let resolvedLayer = null;
            let layerSource = 'default';
            if (uuid) {
                if (args.layer !== undefined && args.layer !== null) {
                    if (typeof args.layer === 'number') {
                        resolvedLayer = args.layer;
                        layerSource = 'explicit';
                    }
                    else if (typeof args.layer === 'string') {
                        const preset = LAYER_PRESETS[args.layer];
                        if (typeof preset !== 'number') {
                            return (0, response_1.fail)(`Unknown layer preset '${args.layer}'. Allowed: ${Object.keys(LAYER_PRESETS).join(', ')}, or pass a raw number.`);
                        }
                        resolvedLayer = preset;
                        layerSource = 'explicit';
                    }
                }
                else if (targetParentUuid) {
                    // Auto-detect: if any ancestor has cc.Canvas, default to UI_2D so
                    // the UI camera actually renders the new node.
                    const hasCanvasAncestor = await this.ancestorHasComponent(targetParentUuid, 'cc.Canvas');
                    if (hasCanvasAncestor) {
                        resolvedLayer = LAYER_PRESETS.UI_2D;
                        layerSource = 'auto-canvas';
                    }
                }
                if (resolvedLayer !== null) {
                    try {
                        await Editor.Message.request('scene', 'set-property', {
                            uuid,
                            path: 'layer',
                            dump: { value: resolvedLayer },
                        });
                        (0, log_1.debugLog)(`Applied layer ${resolvedLayer} (${layerSource}) to ${uuid}`);
                    }
                    catch (err) {
                        console.warn('Failed to set layer:', err);
                    }
                }
            }
            // 獲取創建後的節點信息進行驗證
            let verificationData = null;
            try {
                const nodeInfo = await this.getNodeInfo(uuid);
                if (nodeInfo.success) {
                    verificationData = {
                        nodeInfo: nodeInfo.data,
                        creationDetails: {
                            parentUuid: targetParentUuid,
                            nodeType: args.nodeType || 'Node',
                            fromAsset: !!finalAssetUuid,
                            assetUuid: finalAssetUuid,
                            assetPath: args.assetPath,
                            timestamp: new Date().toISOString()
                        }
                    };
                }
            }
            catch (err) {
                console.warn('Failed to get verification data:', err);
            }
            const successMessage = finalAssetUuid
                ? `Node '${args.name}' instantiated from asset successfully`
                : `Node '${args.name}' created successfully`;
            return {
                success: true,
                data: {
                    uuid: uuid,
                    name: args.name,
                    parentUuid: targetParentUuid,
                    nodeType: args.nodeType || 'Node',
                    fromAsset: !!finalAssetUuid,
                    assetUuid: finalAssetUuid,
                    layer: resolvedLayer,
                    layerSource,
                    message: successMessage
                },
                verificationData: verificationData
            };
        }
        catch (err) {
            return (0, response_1.fail)(`Failed to create node: ${err.message}. Args: ${JSON.stringify(args)}`);
        }
    }
    // Walk up from `startUuid` (inclusive) checking for a component whose
    // __type__ matches `componentType`. Returns true if found anywhere in the
    // chain up to (but not including) the scene root. Bounded to 64 steps as
    // a safety stop in case of a malformed parent graph.
    async ancestorHasComponent(startUuid, componentType) {
        var _a, _b, _c;
        let cursor = startUuid;
        for (let hops = 0; hops < 64 && cursor; hops++) {
            try {
                const data = await Editor.Message.request('scene', 'query-node', cursor);
                if (!data)
                    return false;
                if (Array.isArray(data.__comps__)) {
                    for (const comp of data.__comps__) {
                        if (comp && (comp.__type__ === componentType || comp.type === componentType || comp.cid === componentType)) {
                            return true;
                        }
                    }
                }
                const parentUuid = (_c = (_b = (_a = data.parent) === null || _a === void 0 ? void 0 : _a.value) === null || _b === void 0 ? void 0 : _b.uuid) !== null && _c !== void 0 ? _c : null;
                if (!parentUuid || parentUuid === cursor)
                    return false;
                cursor = parentUuid;
            }
            catch (_d) {
                return false;
            }
        }
        return false;
    }
    async getNodeInfo(uuid) {
        if (uuid && typeof uuid === 'object') {
            uuid = uuid.uuid;
        }
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'query-node', uuid).then((nodeData) => {
                var _a, _b, _c;
                if (!nodeData) {
                    resolve((0, response_1.fail)('Node not found or invalid response'));
                    return;
                }
                // 根據實際返回的數據結構解析節點信息
                const info = {
                    uuid: (0, dump_unwrap_1.dumpUnwrap)(nodeData.uuid, uuid),
                    name: (0, dump_unwrap_1.dumpUnwrap)(nodeData.name, 'Unknown'),
                    active: ((_a = nodeData.active) === null || _a === void 0 ? void 0 : _a.value) !== undefined ? nodeData.active.value : true,
                    position: (0, dump_unwrap_1.dumpUnwrap)(nodeData.position, { x: 0, y: 0, z: 0 }),
                    rotation: (0, dump_unwrap_1.dumpUnwrap)(nodeData.rotation, { x: 0, y: 0, z: 0 }),
                    scale: (0, dump_unwrap_1.dumpUnwrap)(nodeData.scale, { x: 1, y: 1, z: 1 }),
                    parent: ((_c = (_b = nodeData.parent) === null || _b === void 0 ? void 0 : _b.value) === null || _c === void 0 ? void 0 : _c.uuid) || null,
                    children: nodeData.children || [],
                    components: (nodeData.__comps__ || []).map((comp) => ({
                        type: comp.__type__ || 'Unknown',
                        enabled: comp.enabled !== undefined ? comp.enabled : true
                    })),
                    layer: (0, dump_unwrap_1.dumpUnwrap)(nodeData.layer, 1073741824),
                    mobility: (0, dump_unwrap_1.dumpUnwrap)(nodeData.mobility, 0)
                };
                resolve((0, response_1.ok)(info));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async setLayout(args) {
        try {
            const typeMap = { NONE: 0, HORIZONTAL: 1, VERTICAL: 2, GRID: 3 };
            const resizeModeMap = { NONE: 0, CONTAINER: 1, CHILDREN: 2 };
            const startAxisMap = { HORIZONTAL: 0, VERTICAL: 1 };
            let nodeData = await Editor.Message.request('scene', 'query-node', args.nodeUuid);
            let comps = (nodeData === null || nodeData === void 0 ? void 0 : nodeData.__comps__) || [];
            let layoutIdx = (0, component_lookup_1.findComponentIndexByType)(comps, 'cc.Layout');
            if (layoutIdx === -1) {
                const addResult = await this.componentTools.execute('add_component', {
                    nodeUuid: args.nodeUuid,
                    componentType: 'cc.Layout',
                });
                if (!addResult.success) {
                    return addResult;
                }
                nodeData = await Editor.Message.request('scene', 'query-node', args.nodeUuid);
                comps = (nodeData === null || nodeData === void 0 ? void 0 : nodeData.__comps__) || [];
                layoutIdx = (0, component_lookup_1.findComponentIndexByType)(comps, 'cc.Layout');
            }
            if (layoutIdx === -1) {
                return (0, response_1.fail)('cc.Layout component not found after add_component');
            }
            const setProps = [];
            if (args.type !== undefined)
                setProps.push({ prop: 'type', value: typeMap[args.type] });
            if (args.resizeMode !== undefined)
                setProps.push({ prop: 'resizeMode', value: resizeModeMap[args.resizeMode] });
            if (args.paddingTop !== undefined)
                setProps.push({ prop: 'paddingTop', value: args.paddingTop });
            if (args.paddingBottom !== undefined)
                setProps.push({ prop: 'paddingBottom', value: args.paddingBottom });
            if (args.paddingLeft !== undefined)
                setProps.push({ prop: 'paddingLeft', value: args.paddingLeft });
            if (args.paddingRight !== undefined)
                setProps.push({ prop: 'paddingRight', value: args.paddingRight });
            if (args.spacingX !== undefined)
                setProps.push({ prop: 'spacingX', value: args.spacingX });
            if (args.spacingY !== undefined)
                setProps.push({ prop: 'spacingY', value: args.spacingY });
            if (args.startAxis !== undefined)
                setProps.push({ prop: 'startAxis', value: startAxisMap[args.startAxis] });
            if (args.constraintNum !== undefined)
                setProps.push({ prop: 'constraintNum', value: args.constraintNum });
            if (args.autoAlignment !== undefined)
                setProps.push({ prop: 'autoAlignment', value: args.autoAlignment });
            if (args.affectedByScale !== undefined)
                setProps.push({ prop: 'affectedByScale', value: args.affectedByScale });
            for (const item of setProps) {
                await Editor.Message.request('scene', 'set-property', {
                    uuid: args.nodeUuid,
                    path: '__comps__.' + layoutIdx + '.' + item.prop,
                    dump: { value: item.value },
                });
            }
            return (0, response_1.ok)({
                nodeUuid: args.nodeUuid,
                applied: setProps.map(item => item.prop),
            });
        }
        catch (err) {
            return (0, response_1.fail)(`Failed to set layout: ${err.message}`);
        }
    }
    async findNodes(pattern, exactMatch = false) {
        if (pattern && typeof pattern === 'object') {
            exactMatch = pattern.exactMatch;
            pattern = pattern.pattern;
        }
        return new Promise((resolve) => {
            // Note: 'query-nodes-by-name' API doesn't exist in official documentation
            // Using tree traversal as primary approach
            Editor.Message.request('scene', 'query-node-tree').then((tree) => {
                const nodes = [];
                const searchTree = (node, currentPath = '') => {
                    const nodePath = currentPath ? `${currentPath}/${node.name}` : node.name;
                    const matches = exactMatch ?
                        node.name === pattern :
                        node.name.toLowerCase().includes(pattern.toLowerCase());
                    if (matches) {
                        nodes.push({
                            uuid: node.uuid,
                            name: node.name,
                            path: nodePath
                        });
                    }
                    if (node.children) {
                        for (const child of node.children) {
                            searchTree(child, nodePath);
                        }
                    }
                };
                if (tree) {
                    searchTree(tree);
                }
                resolve((0, response_1.ok)(nodes));
            }).catch((err) => {
                // 備用方案：使用場景腳本
                (0, scene_bridge_1.runSceneMethod)('findNodes', [pattern, exactMatch]).then((result) => {
                    resolve(result);
                }).catch((err2) => {
                    resolve((0, response_1.fail)(`Tree search failed: ${err.message}, Scene script failed: ${err2.message}`));
                });
            });
        });
    }
    async findNodeByName(name) {
        if (name && typeof name === 'object') {
            name = name.name;
        }
        return new Promise((resolve) => {
            // 優先嚐試使用 Editor API 查詢節點樹並搜索
            Editor.Message.request('scene', 'query-node-tree').then((tree) => {
                const foundNode = this.searchNodeInTree(tree, name);
                if (foundNode) {
                    resolve((0, response_1.ok)({
                        uuid: foundNode.uuid,
                        name: foundNode.name,
                        path: this.getNodePath(foundNode)
                    }));
                }
                else {
                    resolve((0, response_1.fail)(`Node '${name}' not found`));
                }
            }).catch((err) => {
                // 備用方案：使用場景腳本
                (0, scene_bridge_1.runSceneMethod)('findNodeByName', [name]).then((result) => {
                    resolve(result);
                }).catch((err2) => {
                    resolve((0, response_1.fail)(`Direct API failed: ${err.message}, Scene script failed: ${err2.message}`));
                });
            });
        });
    }
    searchNodeInTree(node, targetName) {
        if (node.name === targetName) {
            return node;
        }
        if (node.children) {
            for (const child of node.children) {
                const found = this.searchNodeInTree(child, targetName);
                if (found) {
                    return found;
                }
            }
        }
        return null;
    }
    async getAllNodes() {
        return new Promise((resolve) => {
            // 嘗試查詢場景節點樹
            Editor.Message.request('scene', 'query-node-tree').then((tree) => {
                const nodes = [];
                const traverseTree = (node) => {
                    nodes.push({
                        uuid: node.uuid,
                        name: node.name,
                        type: node.type,
                        active: node.active,
                        path: this.getNodePath(node)
                    });
                    if (node.children) {
                        for (const child of node.children) {
                            traverseTree(child);
                        }
                    }
                };
                if (tree && tree.children) {
                    traverseTree(tree);
                }
                resolve((0, response_1.ok)({
                    totalNodes: nodes.length,
                    nodes: nodes
                }));
            }).catch((err) => {
                // 備用方案：使用場景腳本
                (0, scene_bridge_1.runSceneMethod)('getAllNodes', []).then((result) => {
                    resolve(result);
                }).catch((err2) => {
                    resolve((0, response_1.fail)(`Direct API failed: ${err.message}, Scene script failed: ${err2.message}`));
                });
            });
        });
    }
    getNodePath(node) {
        const path = [node.name];
        let current = node.parent;
        while (current && current.name !== 'Canvas') {
            path.unshift(current.name);
            current = current.parent;
        }
        return path.join('/');
    }
    async setNodeProperty(uuid, property, value) {
        if (uuid && typeof uuid === 'object') {
            const a = uuid;
            const r = await (0, instance_reference_1.resolveReference)({ reference: a.reference, nodeUuid: a.uuid, nodeName: a.nodeName });
            if ('response' in r)
                return r.response;
            return this.setNodeProperty(r.uuid, a.property, a.value);
        }
        return new Promise((resolve) => {
            // 嘗試直接使用 Editor API 設置節點屬性
            Editor.Message.request('scene', 'set-property', {
                uuid: uuid,
                path: property,
                dump: {
                    value: value
                }
            }).then(() => {
                // Get comprehensive verification data including updated node info
                this.getNodeInfo(uuid).then((nodeInfo) => {
                    resolve({
                        success: true,
                        message: `Property '${property}' updated successfully`,
                        data: {
                            nodeUuid: uuid,
                            property: property,
                            newValue: value
                        },
                        verificationData: {
                            nodeInfo: nodeInfo.data,
                            changeDetails: {
                                property: property,
                                value: value,
                                timestamp: new Date().toISOString()
                            }
                        }
                    });
                }).catch(() => {
                    resolve((0, response_1.ok)(undefined, `Property '${property}' updated successfully (verification failed)`));
                });
            }).catch((err) => {
                // 如果直接設置失敗，嘗試使用場景腳本
                (0, scene_bridge_1.runSceneMethod)('setNodeProperty', [uuid, property, value]).then((result) => {
                    resolve(result);
                }).catch((err2) => {
                    resolve((0, response_1.fail)(`Direct API failed: ${err.message}, Scene script failed: ${err2.message}`));
                });
            });
        });
    }
    async setNodeTransform(args) {
        if (args && typeof args === 'object' && ('reference' in args || 'uuid' in args || 'nodeName' in args)) {
            const r = await (0, instance_reference_1.resolveReference)({ reference: args.reference, nodeUuid: args.uuid, nodeName: args.nodeName });
            if ('response' in r)
                return r.response;
            args = Object.assign(Object.assign({}, args), { uuid: r.uuid });
        }
        const { uuid, position, rotation, scale } = args;
        const updatePromises = [];
        const updates = [];
        const warnings = [];
        try {
            // First get node info to determine if it's 2D or 3D
            const nodeInfoResponse = await this.getNodeInfo(uuid);
            if (!nodeInfoResponse.success || !nodeInfoResponse.data) {
                return (0, response_1.fail)('Failed to get node information');
            }
            const nodeInfo = nodeInfoResponse.data;
            const is2DNode = this.is2DNode(nodeInfo);
            if (position) {
                const normalizedPosition = this.normalizeTransformValue(position, 'position', is2DNode);
                if (normalizedPosition.warning) {
                    warnings.push(normalizedPosition.warning);
                }
                updatePromises.push(Editor.Message.request('scene', 'set-property', {
                    uuid: uuid,
                    path: 'position',
                    dump: { value: normalizedPosition.value }
                }));
                updates.push('position');
            }
            if (rotation) {
                const normalizedRotation = this.normalizeTransformValue(rotation, 'rotation', is2DNode);
                if (normalizedRotation.warning) {
                    warnings.push(normalizedRotation.warning);
                }
                updatePromises.push(Editor.Message.request('scene', 'set-property', {
                    uuid: uuid,
                    path: 'rotation',
                    dump: { value: normalizedRotation.value }
                }));
                updates.push('rotation');
            }
            if (scale) {
                const normalizedScale = this.normalizeTransformValue(scale, 'scale', is2DNode);
                if (normalizedScale.warning) {
                    warnings.push(normalizedScale.warning);
                }
                updatePromises.push(Editor.Message.request('scene', 'set-property', {
                    uuid: uuid,
                    path: 'scale',
                    dump: { value: normalizedScale.value }
                }));
                updates.push('scale');
            }
            if (updatePromises.length === 0) {
                return (0, response_1.fail)('No transform properties specified');
            }
            await Promise.all(updatePromises);
            // Verify the changes by getting updated node info
            const updatedNodeInfo = await this.getNodeInfo(uuid);
            const response = {
                success: true,
                message: `Transform properties updated: ${updates.join(', ')} ${is2DNode ? '(2D node)' : '(3D node)'}`,
                updatedProperties: updates,
                data: {
                    nodeUuid: uuid,
                    nodeType: is2DNode ? '2D' : '3D',
                    appliedChanges: updates,
                    transformConstraints: {
                        position: is2DNode ? 'x, y only (z ignored)' : 'x, y, z all used',
                        rotation: is2DNode ? 'z only (x, y ignored)' : 'x, y, z all used',
                        scale: is2DNode ? 'x, y main, z typically 1' : 'x, y, z all used'
                    }
                },
                verificationData: {
                    nodeInfo: updatedNodeInfo.data,
                    transformDetails: {
                        originalNodeType: is2DNode ? '2D' : '3D',
                        appliedTransforms: updates,
                        timestamp: new Date().toISOString()
                    },
                    beforeAfterComparison: {
                        before: nodeInfo,
                        after: updatedNodeInfo.data
                    }
                }
            };
            if (warnings.length > 0) {
                response.warning = warnings.join('; ');
            }
            return response;
        }
        catch (err) {
            return (0, response_1.fail)(`Failed to update transform: ${err.message}`);
        }
    }
    is2DNode(nodeInfo) {
        // Check if node has 2D-specific components or is under Canvas
        const components = nodeInfo.components || [];
        // Check for common 2D components
        const has2DComponents = components.some((comp) => comp.type && (0, node_classifications_1.is2DComponentType)(comp.type));
        if (has2DComponents) {
            return true;
        }
        // Check for 3D-specific components  
        const has3DComponents = components.some((comp) => comp.type && (0, node_classifications_1.is3DComponentType)(comp.type));
        if (has3DComponents) {
            return false;
        }
        // Default heuristic: if z position is 0 and hasn't been changed, likely 2D
        const position = nodeInfo.position;
        if (position && Math.abs(position.z) < 0.001) {
            return true;
        }
        // Default to 3D if uncertain
        return false;
    }
    normalizeTransformValue(value, type, is2D) {
        const result = Object.assign({}, value);
        let warning;
        if (is2D) {
            switch (type) {
                case 'position':
                    if (value.z !== undefined && Math.abs(value.z) > 0.001) {
                        warning = `2D node: z position (${value.z}) ignored, set to 0`;
                        result.z = 0;
                    }
                    else if (value.z === undefined) {
                        result.z = 0;
                    }
                    break;
                case 'rotation':
                    if ((value.x !== undefined && Math.abs(value.x) > 0.001) ||
                        (value.y !== undefined && Math.abs(value.y) > 0.001)) {
                        warning = `2D node: x,y rotations ignored, only z rotation applied`;
                        result.x = 0;
                        result.y = 0;
                    }
                    else {
                        result.x = result.x || 0;
                        result.y = result.y || 0;
                    }
                    result.z = result.z || 0;
                    break;
                case 'scale':
                    if (value.z === undefined) {
                        result.z = 1; // Default scale for 2D
                    }
                    break;
            }
        }
        else {
            // 3D node - ensure all axes are defined
            result.x = result.x !== undefined ? result.x : (type === 'scale' ? 1 : 0);
            result.y = result.y !== undefined ? result.y : (type === 'scale' ? 1 : 0);
            result.z = result.z !== undefined ? result.z : (type === 'scale' ? 1 : 0);
        }
        return { value: result, warning };
    }
    async deleteNode(uuid) {
        if (uuid && typeof uuid === 'object') {
            uuid = uuid.uuid;
        }
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'remove-node', { uuid: uuid }).then(() => {
                resolve((0, response_1.ok)(undefined, 'Node deleted successfully'));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async moveNode(nodeUuid, newParentUuid, siblingIndex = -1) {
        if (nodeUuid && typeof nodeUuid === 'object') {
            newParentUuid = nodeUuid.newParentUuid;
            siblingIndex = nodeUuid.siblingIndex;
            nodeUuid = nodeUuid.nodeUuid;
        }
        return new Promise((resolve) => {
            // Use correct set-parent API instead of move-node
            Editor.Message.request('scene', 'set-parent', {
                parent: newParentUuid,
                uuids: [nodeUuid],
                keepWorldTransform: false
            }).then(() => {
                resolve((0, response_1.ok)(undefined, 'Node moved successfully'));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async duplicateNode(uuid, includeChildren = true) {
        if (uuid && typeof uuid === 'object') {
            includeChildren = uuid.includeChildren;
            uuid = uuid.uuid;
        }
        return new Promise((resolve) => {
            // Note: includeChildren parameter is accepted for future use but not currently implemented
            Editor.Message.request('scene', 'duplicate-node', uuid).then((result) => {
                resolve((0, response_1.ok)({
                    newUuid: result.uuid,
                    message: 'Node duplicated successfully'
                }));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async detectNodeType(uuid) {
        if (uuid && typeof uuid === 'object') {
            uuid = uuid.uuid;
        }
        try {
            const nodeInfoResponse = await this.getNodeInfo(uuid);
            if (!nodeInfoResponse.success || !nodeInfoResponse.data) {
                return (0, response_1.fail)('Failed to get node information');
            }
            const nodeInfo = nodeInfoResponse.data;
            const is2D = this.is2DNode(nodeInfo);
            const components = nodeInfo.components || [];
            // Collect detection reasons
            const detectionReasons = [];
            // Check for 2D components
            const twoDComponents = components.filter((comp) => comp.type && (0, node_classifications_1.is2DComponentType)(comp.type));
            // Check for 3D components
            const threeDComponents = components.filter((comp) => comp.type && (0, node_classifications_1.is3DComponentType)(comp.type));
            if (twoDComponents.length > 0) {
                detectionReasons.push(`Has 2D components: ${twoDComponents.map((c) => c.type).join(', ')}`);
            }
            if (threeDComponents.length > 0) {
                detectionReasons.push(`Has 3D components: ${threeDComponents.map((c) => c.type).join(', ')}`);
            }
            // Check position for heuristic
            const position = nodeInfo.position;
            if (position && Math.abs(position.z) < 0.001) {
                detectionReasons.push('Z position is ~0 (likely 2D)');
            }
            else if (position && Math.abs(position.z) > 0.001) {
                detectionReasons.push(`Z position is ${position.z} (likely 3D)`);
            }
            if (detectionReasons.length === 0) {
                detectionReasons.push('No specific indicators found, defaulting based on heuristics');
            }
            return (0, response_1.ok)({
                nodeUuid: uuid,
                nodeName: nodeInfo.name,
                nodeType: is2D ? '2D' : '3D',
                detectionReasons: detectionReasons,
                components: components.map((comp) => ({
                    type: comp.type,
                    category: this.getComponentCategory(comp.type)
                })),
                position: nodeInfo.position,
                transformConstraints: {
                    position: is2D ? 'x, y only (z ignored)' : 'x, y, z all used',
                    rotation: is2D ? 'z only (x, y ignored)' : 'x, y, z all used',
                    scale: is2D ? 'x, y main, z typically 1' : 'x, y, z all used'
                }
            });
        }
        catch (err) {
            return (0, response_1.fail)(`Failed to detect node type: ${err.message}`);
        }
    }
    async setNodeProperties(a) {
        const r = await (0, instance_reference_1.resolveReference)({ reference: a.reference, nodeUuid: a.uuid, nodeName: a.nodeName });
        if ('response' in r)
            return r.response;
        return (0, batch_set_1.batchSetProperties)(r.uuid, a.properties);
    }
    getComponentCategory(componentType) {
        if (!componentType)
            return 'unknown';
        if ((0, node_classifications_1.is2DComponentType)(componentType)) {
            return '2D';
        }
        if ((0, node_classifications_1.is3DComponentType)(componentType)) {
            return '3D';
        }
        return 'generic';
    }
}
exports.NodeTools = NodeTools;
__decorate([
    (0, decorators_1.mcpTool)({ name: 'create_tree', title: 'Create node tree', description: '[specialist] Create a hierarchy of scene nodes from a compact spec. Mutates scene and returns a path-to-UUID map.',
        inputSchema: schema_1.z.object({
            parentUuid: schema_1.z.string().optional().describe('Parent node UUID. Omit to create under the scene root.'),
            spec: schema_1.z.array(nodeSpecSchema).describe('Root node specs to create under parentUuid.'),
        })
    })
], NodeTools.prototype, "createTree", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'create_node', title: 'Create scene node', description: '[specialist] Create a node in the current scene. Supports empty, component, or prefab/asset instances; provide parentUuid for predictable placement.',
        inputSchema: schema_1.z.object({
            name: schema_1.z.string().describe('New node name. The response returns the created UUID.'),
            parentUuid: schema_1.z.string().optional().describe('Parent node UUID. Strongly recommended; omit only when creating at scene root.'),
            nodeType: schema_1.z.enum(['Node', '2DNode', '3DNode']).default('Node').describe('Empty-node type hint. Usually unnecessary when instantiating from assetUuid/assetPath.'),
            siblingIndex: schema_1.z.number().default(-1).describe('Sibling index under the parent. -1 means append.'),
            assetUuid: schema_1.z.string().optional().describe('Asset UUID to instantiate from, e.g. prefab UUID. Creates an asset instance instead of an empty node.'),
            assetPath: schema_1.z.string().optional().describe('db:// asset path to instantiate from. Alternative to assetUuid; resolved before create-node.'),
            components: schema_1.z.array(schema_1.z.string()).optional().describe('Component types to add after creation, e.g. ["cc.Sprite","cc.Button"].'),
            unlinkPrefab: schema_1.z.boolean().default(false).describe('When instantiating a prefab, immediately unlink it into a regular node. Default false preserves prefab link.'),
            keepWorldTransform: schema_1.z.boolean().default(false).describe('Preserve world transform while parenting/creating when Cocos supports it.'),
            layer: schema_1.z.union([
                schema_1.z.enum(['DEFAULT', 'UI_2D', 'UI_3D', 'SCENE_GIZMO', 'EDITOR', 'GIZMOS', 'IGNORE_RAYCAST', 'PROFILER']),
                schema_1.z.number().int().nonnegative(),
            ]).optional().describe('Node layer (cc.Layers). Accepts preset name (e.g. "UI_2D") or raw bitmask number. If omitted: auto-detected — UI_2D when any ancestor has cc.Canvas (so UI camera renders the new node), otherwise leaves the create-node default (DEFAULT). Required for UI nodes under Canvas; without it the node is invisible to the UI camera.'),
            initialTransform: schema_1.z.object({
                position: schemas_1.vec3Schema.optional(),
                rotation: schemas_1.vec3Schema.optional(),
                scale: schemas_1.vec3Schema.optional(),
            }).optional().describe('Initial transform applied after create-node via set_node_transform.'),
        })
    })
], NodeTools.prototype, "createNode", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'get_node_info', title: 'Read node info', description: '[specialist] Read one node by UUID, including transform, children, and component summary. No mutation.',
        inputSchema: schema_1.z.object({
            uuid: schema_1.z.string().describe('Node UUID to inspect.'),
        })
    })
], NodeTools.prototype, "getNodeInfo", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'set_layout', title: 'Set layout component', description: '[specialist] Add or update cc.Layout on a node. Mutates scene and applies only provided layout properties.',
        inputSchema: schema_1.z.object({
            nodeUuid: schema_1.z.string().describe('Node UUID that owns or should receive cc.Layout.'),
            type: schema_1.z.enum(['NONE', 'HORIZONTAL', 'VERTICAL', 'GRID']).optional(),
            resizeMode: schema_1.z.enum(['NONE', 'CONTAINER', 'CHILDREN']).optional(),
            paddingTop: schema_1.z.number().optional(),
            paddingBottom: schema_1.z.number().optional(),
            paddingLeft: schema_1.z.number().optional(),
            paddingRight: schema_1.z.number().optional(),
            spacingX: schema_1.z.number().optional(),
            spacingY: schema_1.z.number().optional(),
            startAxis: schema_1.z.enum(['HORIZONTAL', 'VERTICAL']).optional(),
            constraintNum: schema_1.z.number().int().optional(),
            autoAlignment: schema_1.z.boolean().optional(),
            affectedByScale: schema_1.z.boolean().optional(),
        })
    })
], NodeTools.prototype, "setLayout", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'find_nodes', title: 'Find nodes by pattern', description: '[specialist] Search current-scene nodes by name pattern and return multiple matches. No mutation; use when names may be duplicated.',
        inputSchema: schema_1.z.object({
            pattern: schema_1.z.string().describe('Node name search pattern. Partial match unless exactMatch=true.'),
            exactMatch: schema_1.z.boolean().default(false).describe('Require exact node name match. Default false.'),
        })
    })
], NodeTools.prototype, "findNodes", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'find_node_by_name', title: 'Find node by name', description: '[specialist] Find the first node with an exact name. No mutation; only safe when the name is unique enough.',
        inputSchema: schema_1.z.object({
            name: schema_1.z.string().describe('Exact node name to find. Returns the first match only.'),
        })
    })
], NodeTools.prototype, "findNodeByName", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'get_all_nodes', title: 'List all nodes', description: '[specialist] List all current-scene nodes with name/uuid/type/path; primary source for nodeUuid/parentUuid.',
        inputSchema: schema_1.z.object({})
    })
], NodeTools.prototype, "getAllNodes", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'set_node_property', title: 'Set node property', description: '[specialist] Set a node property path. Mutates scene; use for active/name/layer. Prefer set_node_transform for position/rotation/scale. Accepts reference={id,type} (preferred), uuid, or nodeName.',
        inputSchema: schema_1.z.object({
            reference: instance_reference_1.instanceReferenceSchema.optional().describe('InstanceReference {id,type}. Preferred form — type travels with the id so AI does not lose semantic context.'),
            uuid: schema_1.z.string().optional().describe('Node UUID to modify. Used when reference is omitted.'),
            nodeName: schema_1.z.string().optional().describe('Node name (depth-first first match). Used when reference and uuid are omitted.'),
            property: schema_1.z.string().describe('Node property path, e.g. active, name, layer. Prefer set_node_transform for position/rotation/scale.'),
            value: schema_1.z.any().describe('Value to write; must match the Cocos dump shape for the property path.'),
        })
    })
], NodeTools.prototype, "setNodeProperty", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'set_node_transform', title: 'Set node transform', description: '[specialist] Set node position, rotation, or scale with 2D/3D normalization. Mutates scene. Accepts reference={id,type} (preferred), uuid, or nodeName.',
        inputSchema: schema_1.z.object({
            reference: instance_reference_1.instanceReferenceSchema.optional().describe('InstanceReference {id,type}. Preferred form — type travels with the id so AI does not lose semantic context.'),
            uuid: schema_1.z.string().optional().describe('Node UUID whose transform should be changed. Used when reference is omitted.'),
            nodeName: schema_1.z.string().optional().describe('Node name (depth-first first match). Used when reference and uuid are omitted.'),
            position: transformPositionSchema.optional().describe('Local position. 2D nodes mainly use x/y; 3D nodes use x/y/z.'),
            rotation: transformRotationSchema.optional().describe('Local euler rotation. 2D nodes mainly use z; 3D nodes use x/y/z.'),
            scale: transformScaleSchema.optional().describe('Local scale. 2D nodes mainly use x/y and usually keep z=1.'),
        })
    })
], NodeTools.prototype, "setNodeTransform", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'delete_node', title: 'Delete scene node', description: '[specialist] Delete a node from the current scene. Mutates scene and removes children; verify UUID first.',
        inputSchema: schema_1.z.object({
            uuid: schema_1.z.string().describe('Node UUID to delete. Children are removed with the node.'),
        })
    })
], NodeTools.prototype, "deleteNode", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'move_node', title: 'Reparent scene node', description: '[specialist] Reparent a node under a new parent. Mutates scene; current implementation does not preserve world transform.',
        inputSchema: schema_1.z.object({
            nodeUuid: schema_1.z.string().describe('Node UUID to reparent.'),
            newParentUuid: schema_1.z.string().describe('New parent node UUID.'),
            siblingIndex: schema_1.z.number().default(-1).describe('Sibling index under the new parent. Currently advisory; move uses set-parent.'),
        })
    })
], NodeTools.prototype, "moveNode", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'duplicate_node', title: 'Duplicate scene node', description: '[specialist] Duplicate a node and return the new UUID. Mutates scene; child inclusion follows Cocos duplicate-node behavior.',
        inputSchema: schema_1.z.object({
            uuid: schema_1.z.string().describe('Node UUID to duplicate.'),
            includeChildren: schema_1.z.boolean().default(true).describe('Whether children should be included; actual behavior follows Cocos duplicate-node.'),
        })
    })
], NodeTools.prototype, "duplicateNode", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'detect_node_type', title: 'Detect node type', description: '[specialist] Heuristically classify a node as 2D or 3D from components/transform. No mutation; helps choose transform semantics.',
        inputSchema: schema_1.z.object({
            uuid: schema_1.z.string().describe('Node UUID to classify as 2D or 3D by heuristic.'),
        })
    })
], NodeTools.prototype, "detectNodeType", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'set_node_properties', title: 'Set node properties', description: '[specialist] Batch-set multiple properties on the same node in one tool call. Mutates scene; entries run sequentially in array order so cocos undo/serialization stay coherent. Returns per-entry success/error so partial failures are visible. Duplicate paths are rejected up-front; overlapping paths (e.g. position vs position.x) are warned. Use when changing several properties on the same node at once. Accepts reference={id,type} (preferred), uuid, or nodeName.',
        inputSchema: schema_1.z.object({
            reference: instance_reference_1.instanceReferenceSchema.optional().describe('InstanceReference {id,type}. Preferred form.'),
            uuid: schema_1.z.string().optional().describe('Node UUID to modify. Used when reference is omitted.'),
            nodeName: schema_1.z.string().optional().describe('Node name (depth-first first match). Used when reference and uuid are omitted.'),
            properties: schema_1.z.array(schema_1.z.object({
                path: schema_1.z.string().describe('Property path passed to scene/set-property (e.g. active, name, layer, position).'),
                value: schema_1.z.any().describe('Property value matching the Cocos dump shape for the path.'),
            })).min(1).max(50).describe('Properties to write. Capped at 50 entries per call.'),
        })
    })
], NodeTools.prototype, "setNodeProperties", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm9kZS10b29scy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NvdXJjZS90b29scy9ub2RlLXRvb2xzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7OztBQUFBLDhDQUEyQztBQUUzQyx1REFBbUQ7QUFDbkQsb0NBQXNDO0FBQ3RDLDBDQUFrQztBQUNsQyxrREFBdUU7QUFDdkUsc0RBQXFEO0FBRXJELGdEQUFzRDtBQUN0RCxrRUFBc0Y7QUFDdEYsc0VBQTBHO0FBQzFHLDhEQUFtRTtBQUNuRSxvREFBZ0Q7QUFDaEQsa0RBQXFEO0FBQ3JELDJFQUEyRTtBQUMzRSw0Q0FBNEM7QUFFNUMsMkVBQTJFO0FBQzNFLDhFQUE4RTtBQUM5RSw4QkFBOEI7QUFDOUIsTUFBTSxhQUFhLEdBQUc7SUFDbEIsT0FBTyxFQUFFLFVBQVUsRUFBUyxVQUFVO0lBQ3RDLEtBQUssRUFBRSxRQUFRLEVBQWEsVUFBVTtJQUN0QyxXQUFXLEVBQUUsUUFBUSxFQUFPLFVBQVU7SUFDdEMsS0FBSyxFQUFFLE9BQU8sRUFBYyxVQUFVO0lBQ3RDLE1BQU0sRUFBRSxPQUFPLEVBQWEsVUFBVTtJQUN0QyxNQUFNLEVBQUUsT0FBTyxFQUFhLFVBQVU7SUFDdEMsY0FBYyxFQUFFLE9BQU8sRUFBSyxVQUFVO0lBQ3RDLFFBQVEsRUFBRSxTQUFTLEVBQVMsVUFBVTtDQUNoQyxDQUFDO0FBR1gsOEVBQThFO0FBQzlFLGdGQUFnRjtBQUNoRixNQUFNLHVCQUF1QixHQUFHLFVBQUMsQ0FBQyxNQUFNLENBQUM7SUFDckMsQ0FBQyxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLEVBQUU7SUFDeEIsQ0FBQyxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLEVBQUU7SUFDeEIsQ0FBQyxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxRQUFRLENBQUMsZ0RBQWdELENBQUM7Q0FDdEYsQ0FBQyxDQUFDO0FBRUgs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QUksRUFBRSxlQUFlLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQyxDQUFDO1lBQzFHLElBQUksSUFBSSxDQUFDLFdBQVcsS0FBSyxTQUFTO2dCQUFFLFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsYUFBYSxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQztZQUNwRyxJQUFJLElBQUksQ0FBQyxZQUFZLEtBQUssU0FBUztnQkFBRSxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsSUFBSSxFQUFFLGNBQWMsRUFBRSxLQUFLLEVBQUUsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDLENBQUM7WUFDdkcsSUFBSSxJQUFJLENBQUMsUUFBUSxLQUFLLFNBQVM7Z0JBQUUsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO1lBQzNGLElBQUksSUFBSSxDQUFDLFFBQVEsS0FBSyxTQUFTO2dCQUFFLFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztZQUMzRixJQUFJLElBQUksQ0FBQyxTQUFTLEtBQUssU0FBUztnQkFBRSxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsSUFBSSxFQUFFLFdBQVcsRUFBRSxLQUFLLEVBQUUsWUFBWSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDNUcsSUFBSSxJQUFJLENBQUMsYUFBYSxLQUFLLFNBQVM7Z0JBQUUsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxlQUFlLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQyxDQUFDO1lBQzFHLElBQUksSUFBSSxDQUFDLGFBQWEsS0FBSyxTQUFTO2dCQUFFLFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFB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bSAnLi4vbGliL3Jlc3BvbnNlJztcbmltcG9ydCB0eXBlIHsgVG9vbERlZmluaXRpb24sIFRvb2xSZXNwb25zZSwgVG9vbEV4ZWN1dG9yLCBOb2RlSW5mbyB9IGZyb20gJy4uL3R5cGVzJztcbmltcG9ydCB7IENvbXBvbmVudFRvb2xzIH0gZnJvbSAnLi9jb21wb25lbnQtdG9vbHMnO1xuaW1wb3J0IHsgZGVidWdMb2cgfSBmcm9tICcuLi9saWIvbG9nJztcbmltcG9ydCB7IHogfSBmcm9tICcuLi9saWIvc2NoZW1hJztcbmltcG9ydCB7IG1jcFRvb2wsIGRlZmluZVRvb2xzRnJvbURlY29yYXRvcnMgfSBmcm9tICcuLi9saWIvZGVjb3JhdG9ycyc7XG5pbXBvcnQgeyBydW5TY2VuZU1ldGhvZCB9IGZyb20gJy4uL2xpYi9zY2VuZS1icmlkZ2UnO1xuaW1wb3J0IHsgcmVzb2x2ZU9yVG9vbEVycm9yIH0gZnJvbSAnLi4vbGliL3Jlc29sdmUtbm9kZSc7XG5pbXBvcnQgeyBiYXRjaFNldFByb3BlcnRpZXMgfSBmcm9tICcuLi9saWIvYmF0Y2gtc2V0JztcbmltcG9ydCB7IGluc3RhbmNlUmVmZXJlbmNlU2NoZW1hLCByZXNvbHZlUmVmZXJlbmNlIH0gZnJvbSAnLi4vbGliL2luc3RhbmNlLXJlZmVyZW5jZSc7XG5pbXBvcnQgeyBpczJEQ29tcG9uZW50VHlwZSwgaXMzRENvbXBvbmVudFR5cGUsIEJVSUxUSU5fMkRfQ09NUE9ORU5UUyB9IGZyb20gJy4uL2xpYi9ub2RlLWNsYXNzaWZpY2F0aW9ucyc7XG5pbXBvcnQgeyBmaW5kQ29tcG9uZW50SW5kZXhCeVR5cGUgfSBmcm9tICcuLi9saWIvY29tcG9uZW50LWxvb2t1cCc7XG5pbXBvcnQgeyBkdW1wVW53cmFwIH0gZnJvbSAnLi4vbGliL2R1bXAtdW53cmFwJztcbmltcG9ydCB7IGdldFNjZW5lUm9vdFV1aWQgfSBmcm9tICcuLi9saWIvc2NlbmUtcm9vdCc7XG4vLyB2ZWMzIHNoYXJlZCB2aWEgbGliL3NjaGVtYXMudHMg4oCUIHVzZWQgYnkgY3JlYXRlX25vZGUncyBpbml0aWFsVHJhbnNmb3JtLlxuaW1wb3J0IHsgdmVjM1NjaGVtYSB9IGZyb20gJy4uL2xpYi9zY2hlbWFzJztcblxuLy8gU3RhbmRhcmQgY2MuTGF5ZXJzIGJpdCB2YWx1ZXMuIEN1c3RvbSB1c2VyLWRlZmluZWQgbGF5ZXJzIGdvIHRocm91Z2ggdGhlXG4vLyBudW1lcmljIGJyYW5jaCBvZiB0aGUgY3JlYXRlX25vZGUgYGxheWVyYCBhcmcsIHNvIHRoaXMgbGlzdCBvbmx5IGVudW1lcmF0ZXNcbi8vIHRoZSBlbmdpbmUtc2hpcHBlZCBwcmVzZXRzLlxuY29uc3QgTEFZRVJfUFJFU0VUUyA9IHtcbiAgICBERUZBVUxUOiAxMDczNzQxODI0LCAgICAgICAgLy8gMSA8PCAzMFxuICAgIFVJXzJEOiAzMzU1NDQzMiwgICAgICAgICAgICAvLyAxIDw8IDI1XG4gICAgU0NFTkVfR0laTU86IDE2Nzc3MjE2LCAgICAgIC8vIDEgPDwgMjRcbiAgICBVSV8zRDogODM4ODYwOCwgICAgICAgICAgICAgLy8gMSA8PCAyM1xuICAgIEVESVRPUjogNDE5NDMwNCwgICAgICAgICAgICAvLyAxIDw8IDIyXG4gICAgR0laTU9TOiAyMDk3MTUyLCAgICAgICAgICAgIC8vIDEgPDwgMjFcbiAgICBJR05PUkVfUkFZQ0FTVDogMTA0ODU3NiwgICAgLy8gMSA8PCAyMFxuICAgIFBST0ZJTEVSOiAyNjg0MzU0NTYsICAgICAgICAvLyAxIDw8IDI4XG59IGFzIGNvbnN0O1xudHlwZSBMYXllclByZXNldCA9IGtleW9mIHR5cGVvZiBMQVlFUl9QUkVTRVRTO1xuXG4vLyBzZXRfbm9kZV90cmFuc2Zvcm0gaGFzIGF4aXMtc3BlY2lmaWMgZGVzY3JpcHRpb25zIHBlciBjaGFubmVsOyByZWJ1aWxkIGVhY2hcbi8vIGlubGluZSBzbyB0aGUgcGVyLWF4aXMgdGV4dCBtYXRjaGVzIHRoZSBvcmlnaW5hbCBoYW5kLXdyaXR0ZW4gc2NoZW1hIGV4YWN0bHkuXG5jb25zdCB0cmFuc2Zvcm1Qb3NpdGlvblNjaGVtYSA9IHoub2JqZWN0KHtcbiAgICB4OiB6Lm51bWJlcigpLm9wdGlvbmFsKCksXG4gICAgeTogei5udW1iZXIoKS5vcHRpb25hbCgpLFxuICAgIHo6IHoubnVtYmVyKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnWiBjb29yZGluYXRlLiBJZ25vcmVkL25vcm1hbGl6ZWQgZm9yIDJEIG5vZGVzLicpLFxufSk7XG5cbmNvbnN0IHRyYW5zZm9ybVJvdGF0aW9uU2NoZW1hID0gei5vYmplY3Qoe1xuICAgIHg6IHoubnVtYmVyKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnWCBldWxlciByb3RhdGlvbi4gSWdub3JlZC9ub3JtYWxpemVkIGZvciAyRCBub2Rlcy4nKSxcbiAgICB5OiB6Lm51bWJlcigpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1kgZXVsZXIgcm90YXRpb24uIElnbm9yZWQvbm9ybWFsaXplZCBmb3IgMkQgbm9kZXMuJyksXG4gICAgejogei5udW1iZXIoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdaIGV1bGVyIHJvdGF0aW9uLiBNYWluIHJvdGF0aW9uIGF4aXMgZm9yIDJEIG5vZGVzLicpLFxufSk7XG5cbmNvbnN0IHRyYW5zZm9ybVNjYWxlU2NoZW1hID0gei5vYmplY3Qoe1xuICAgIHg6IHoubnVtYmVyKCkub3B0aW9uYWwoKSxcbiAgICB5OiB6Lm51bWJlcigpLm9wdGlvbmFsKCksXG4gICAgejogei5udW1iZXIoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdaIHNjYWxlLiBVc3VhbGx5IDEgZm9yIDJEIG5vZGVzLicpLFxufSk7XG5cbi8vIG5vZGVTcGVjU2NoZW1hOiBjaGlsZHJlbiB1c2VzIHouYW55KCkgaW5zdGVhZCBvZiB6LmxhenkoKSB0byBhdm9pZFxuLy8gJHJlZiBpbiB0aGUgSlNPTiBTY2hlbWEgb3V0cHV0IChHZW1pbmkgcmVqZWN0cyAkcmVmLyRkZWZzIOKAlCBsYW5kbWluZSAjMTUpLlxuY29uc3Qgbm9kZVNwZWNTY2hlbWEgPSB6Lm9iamVjdCh7XG4gICAgbmFtZTogei5zdHJpbmcoKS5kZXNjcmliZSgnTm9kZSBuYW1lLicpLFxuICAgIG5vZGVUeXBlOiB6LmVudW0oWydOb2RlJywgJzJETm9kZScsICczRE5vZGUnXSkuZGVmYXVsdCgnTm9kZScpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0VtcHR5LW5vZGUgdHlwZSBoaW50LicpLFxuICAgIGNvbXBvbmVudHM6IHouYXJyYXkoei5zdHJpbmcoKSkub3B0aW9uYWwoKS5kZXNjcmliZSgnQ29tcG9uZW50IHR5cGVzIHRvIGFkZCwgZS5nLiBbXCJjYy5TcHJpdGVcIl0uJyksXG4gICAgbGF5ZXI6IHoudW5pb24oW1xuICAgICAgICB6LmVudW0oWydERUZBVUxUJywgJ1VJXzJEJywgJ1VJXzNEJywgJ1NDRU5FX0dJWk1PJywgJ0VESVRPUicsICdHSVpNT1MnLCAnSUdOT1JFX1JBWUNBU1QnLCAnUFJPRklMRVInXSksXG4gICAgICAgIHoubnVtYmVyKCkuaW50KCkubm9ubmVnYXRpdmUoKSxcbiAgICBdKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdOb2RlIGxheWVyIHByZXNldCBvciByYXcgYml0bWFzay4nKSxcbiAgICBhY3RpdmU6IHouYm9vbGVhbigpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1NldCBmYWxzZSB0byBjcmVhdGUgdGhlIG5vZGUgaW5hY3RpdmUuJyksXG4gICAgcG9zaXRpb246IHoub2JqZWN0KHtcbiAgICAgICAgeDogei5udW1iZXIoKS5vcHRpb25hbCgpLFxuICAgICAgICB5OiB6Lm51bWJlcigpLm9wdGlvbmFsKCksXG4gICAgICAgIHo6IHoubnVtYmVyKCkub3B0aW9uYWwoKSxcbiAgICB9KS5vcHRpb25hbCgpLFxuICAgIHJvdGF0aW9uOiB6Lm9iamVjdCh7XG4gICAgICAgIHg6IHoubnVtYmVyKCkub3B0aW9uYWwoKSxcbiAgICAgICAgeTogei5udW1iZXIoKS5vcHRpb25hbCgpLFxuICAgICAgICB6OiB6Lm51bWJlcigpLm9wdGlvbmFsKCksXG4gICAgfSkub3B0aW9uYWwoKSxcbiAgICBzY2FsZTogei5vYmplY3Qoe1xuICAgICAgICB4OiB6Lm51bWJlcigpLm9wdGlvbmFsKCksXG4gICAgICAgIHk6IHoubnVtYmVyKCkub3B0aW9uYWwoKSxcbiAgICAgICAgejogei5udW1iZXIoKS5vcHRpb25hbCgpLFxuICAgIH0pLm9wdGlvbmFsKCksXG4gICAgY2hpbGRyZW46IHouYXJyYXkoei5hbnkoKSkub3B0aW9uYWwoKS5kZXNjcmliZSgnTmVzdGVkIG5vZGUgc3BlY3MgKHNhbWUgc2hhcGUsIHJlY3Vyc2l2ZWx5KS4nKSxcbn0pO1xuXG5leHBvcnQgY2xhc3MgTm9kZVRvb2xzIGltcGxlbWVudHMgVG9vbEV4ZWN1dG9yIHtcbiAgICBwcml2YXRlIGNvbXBvbmVudFRvb2xzID0gbmV3IENvbXBvbmVudFRvb2xzKCk7XG4gICAgcHJpdmF0ZSByZWFkb25seSBleGVjOiBUb29sRXhlY3V0b3I7XG5cbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgdGhpcy5leGVjID0gZGVmaW5lVG9vbHNGcm9tRGVjb3JhdG9ycyh0aGlzKTtcbiAgICB9XG5cbiAgICBnZXRUb29scygpOiBUb29sRGVmaW5pdGlvbltdIHsgcmV0dXJuIHRoaXMuZXhlYy5nZXRUb29scygpOyB9XG4gICAgZXhlY3V0ZSh0b29sTmFtZTogc3RyaW5nLCBhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4geyByZXR1cm4gdGhpcy5leGVjLmV4ZWN1dGUodG9vbE5hbWUsIGFyZ3MpOyB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGNyZWF0ZVRyZWVOb2RlKHNwZWM6IGFueSwgcGFyZW50VXVpZDogc3RyaW5nIHwgdW5kZWZpbmVkLCBwYXRoUHJlZml4OiBzdHJpbmcsIHJlc3VsdHM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBjcmVhdGVBcmdzOiBhbnkgPSB7XG4gICAgICAgICAgICBuYW1lOiBzcGVjLm5hbWUsXG4gICAgICAgICAgICBwYXJlbnRVdWlkLFxuICAgICAgICAgICAgbm9kZVR5cGU6IHNwZWMubm9kZVR5cGUgfHwgJ05vZGUnLFxuICAgICAgICAgICAgY29tcG9uZW50czogc3BlYy5jb21wb25lbnRzLFxuICAgICAgICAgICAgbGF5ZXI6IHNwZWMubGF5ZXIsXG4gICAgICAgIH07XG4gICAgICAgIGlmIChzcGVjLnBvc2l0aW9uIHx8IHNwZWMucm90YXRpb24gfHwgc3BlYy5zY2FsZSkge1xuICAgICAgICAgICAgY3JlYXRlQXJncy5pbml0aWFsVHJhbnNmb3JtID0ge1xuICAgICAgICAgICAgICAgIHBvc2l0aW9uOiBzcGVjLnBvc2l0aW9uLFxuICAgICAgICAgICAgICAgIHJvdGF0aW9uOiBzcGVjLnJvdGF0aW9uLFxuICAgICAgICAgICAgICAgIHNjYWxlOiBzcGVjLnNjYWxlLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGNyZWF0ZVJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZSgnY3JlYXRlX25vZGUnLCBjcmVhdGVBcmdzKTtcbiAgICAgICAgaWYgKCFjcmVhdGVSZXN1bHQuc3VjY2Vzcykge1xuICAgICAgICAgICAgcmV0dXJuIGNyZWF0ZVJlc3VsdDtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHV1aWQgPSBjcmVhdGVSZXN1bHQuZGF0YT8ubm9kZUluZm8/LnV1aWQgfHwgY3JlYXRlUmVzdWx0LmRhdGE/LnV1aWQ7XG4gICAgICAgIGlmICghdXVpZCkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ2NyZWF0ZV9ub2RlIGRpZCBub3QgcmV0dXJuIGEgbm9kZSBVVUlEJyk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc3BlYy5hY3RpdmUgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdzZXQtcHJvcGVydHknLCB7XG4gICAgICAgICAgICAgICAgdXVpZCxcbiAgICAgICAgICAgICAgICBwYXRoOiAnYWN0aXZlJyxcbiAgICAgICAgICAgICAgICBkdW1wOiB7IHZhbHVlOiBmYWxzZSB9LFxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBrZXkgPSBwYXRoUHJlZml4ICsgc3BlYy5uYW1lO1xuICAgICAgICByZXN1bHRzW2tleV0gPSB1dWlkO1xuXG4gICAgICAgIGZvciAoY29uc3QgY2hpbGQgb2Ygc3BlYy5jaGlsZHJlbiB8fCBbXSkge1xuICAgICAgICAgICAgY29uc3QgY2hpbGRSZXN1bHQgPSBhd2FpdCB0aGlzLmNyZWF0ZVRyZWVOb2RlKGNoaWxkLCB1dWlkLCBrZXkgKyAnLycsIHJlc3VsdHMpO1xuICAgICAgICAgICAgaWYgKCFjaGlsZFJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNoaWxkUmVzdWx0O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG9rKHsgdXVpZCB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdjcmVhdGVfdHJlZScsIHRpdGxlOiAnQ3JlYXRlIG5vZGUgdHJlZScsIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIENyZWF0ZSBhIGhpZXJhcmNoeSBvZiBzY2VuZSBub2RlcyBmcm9tIGEgY29tcGFjdCBzcGVjLiBNdXRhdGVzIHNjZW5lIGFuZCByZXR1cm5zIGEgcGF0aC10by1VVUlEIG1hcC4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHBhcmVudFV1aWQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnUGFyZW50IG5vZGUgVVVJRC4gT21pdCB0byBjcmVhdGUgdW5kZXIgdGhlIHNjZW5lIHJvb3QuJyksXG4gICAgICAgICAgICAgICAgICAgIHNwZWM6IHouYXJyYXkobm9kZVNwZWNTY2hlbWEpLmRlc2NyaWJlKCdSb290IG5vZGUgc3BlY3MgdG8gY3JlYXRlIHVuZGVyIHBhcmVudFV1aWQuJyksXG4gICAgICAgICAgICAgICAgfSlcbiAgICB9KVxuICAgIGFzeW5jIGNyZWF0ZVRyZWUoYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGxldCBwYXJlbnRVdWlkID0gYXJncy5wYXJlbnRVdWlkO1xuICAgICAgICAgICAgaWYgKCFwYXJlbnRVdWlkKSB7XG4gICAgICAgICAgICAgICAgcGFyZW50VXVpZCA9IGF3YWl0IGdldFNjZW5lUm9vdFV1aWQoKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3Qgbm9kZXM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgaXRlbSBvZiBhcmdzLnNwZWMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmNyZWF0ZVRyZWVOb2RlKGl0ZW0sIHBhcmVudFV1aWQsICcnLCBub2Rlcyk7XG4gICAgICAgICAgICAgICAgaWYgKCFyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIG9rKHtcbiAgICAgICAgICAgICAgICBub2RlcyxcbiAgICAgICAgICAgICAgICBjb3VudDogT2JqZWN0LmtleXMobm9kZXMpLmxlbmd0aCxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoYEZhaWxlZCB0byBjcmVhdGUgbm9kZSB0cmVlOiAke2Vyci5tZXNzYWdlfWApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgQG1jcFRvb2woeyBuYW1lOiAnY3JlYXRlX25vZGUnLCB0aXRsZTogJ0NyZWF0ZSBzY2VuZSBub2RlJywgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gQ3JlYXRlIGEgbm9kZSBpbiB0aGUgY3VycmVudCBzY2VuZS4gU3VwcG9ydHMgZW1wdHksIGNvbXBvbmVudCwgb3IgcHJlZmFiL2Fzc2V0IGluc3RhbmNlczsgcHJvdmlkZSBwYXJlbnRVdWlkIGZvciBwcmVkaWN0YWJsZSBwbGFjZW1lbnQuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBuYW1lOiB6LnN0cmluZygpLmRlc2NyaWJlKCdOZXcgbm9kZSBuYW1lLiBUaGUgcmVzcG9uc2UgcmV0dXJucyB0aGUgY3JlYXRlZCBVVUlELicpLFxuICAgICAgICAgICAgICAgICAgICBwYXJlbnRVdWlkOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1BhcmVudCBub2RlIFVVSUQuIFN0cm9uZ2x5IHJlY29tbWVuZGVkOyBvbWl0IG9ubHkgd2hlbiBjcmVhdGluZyBhdCBzY2VuZSByb290LicpLFxuICAgICAgICAgICAgICAgICAgICBub2RlVHlwZTogei5lbnVtKFsnTm9kZScsICcyRE5vZGUnLCAnM0ROb2RlJ10pLmRlZmF1bHQoJ05vZGUnKS5kZXNjcmliZSgnRW1wdHktbm9kZSB0eXBlIGhpbnQuIFVzdWFsbHkgdW5uZWNlc3Nhcnkgd2hlbiBpbnN0YW50aWF0aW5nIGZyb20gYXNzZXRVdWlkL2Fzc2V0UGF0aC4nKSxcbiAgICAgICAgICAgICAgICAgICAgc2libGluZ0luZGV4OiB6Lm51bWJlcigpLmRlZmF1bHQoLTEpLmRlc2NyaWJlKCdTaWJsaW5nIGluZGV4IHVuZGVyIHRoZSBwYXJlbnQuIC0xIG1lYW5zIGFwcGVuZC4nKSxcbiAgICAgICAgICAgICAgICAgICAgYXNzZXRVdWlkOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0Fzc2V0IFVVSUQgdG8gaW5zdGFudGlhdGUgZnJvbSwgZS5nLiBwcmVmYWIgVVVJRC4gQ3JlYXRlcyBhbiBhc3NldCBpbnN0YW5jZSBpbnN0ZWFkIG9mIGFuIGVtcHR5IG5vZGUuJyksXG4gICAgICAgICAgICAgICAgICAgIGFzc2V0UGF0aDogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdkYjovLyBhc3NldCBwYXRoIHRvIGluc3RhbnRpYXRlIGZyb20uIEFsdGVybmF0aXZlIHRvIGFzc2V0VXVpZDsgcmVzb2x2ZWQgYmVmb3JlIGNyZWF0ZS1ub2RlLicpLFxuICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRzOiB6LmFycmF5KHouc3RyaW5nKCkpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0NvbXBvbmVudCB0eXBlcyB0byBhZGQgYWZ0ZXIgY3JlYXRpb24sIGUuZy4gW1wiY2MuU3ByaXRlXCIsXCJjYy5CdXR0b25cIl0uJyksXG4gICAgICAgICAgICAgICAgICAgIHVubGlua1ByZWZhYjogei5ib29sZWFuKCkuZGVmYXVsdChmYWxzZSkuZGVzY3JpYmUoJ1doZW4gaW5zdGFudGlhdGluZyBhIHByZWZhYiwgaW1tZWRpYXRlbHkgdW5saW5rIGl0IGludG8gYSByZWd1bGFyIG5vZGUuIERlZmF1bHQgZmFsc2UgcHJlc2VydmVzIHByZWZhYiBsaW5rLicpLFxuICAgICAgICAgICAgICAgICAgICBrZWVwV29ybGRUcmFuc2Zvcm06IHouYm9vbGVhbigpLmRlZmF1bHQoZmFsc2UpLmRlc2NyaWJlKCdQcmVzZXJ2ZSB3b3JsZCB0cmFuc2Zvcm0gd2hpbGUgcGFyZW50aW5nL2NyZWF0aW5nIHdoZW4gQ29jb3Mgc3VwcG9ydHMgaXQuJyksXG4gICAgICAgICAgICAgICAgICAgIGxheWVyOiB6LnVuaW9uKFtcbiAgICAgICAgICAgICAgICAgICAgICAgIHouZW51bShbJ0RFRkFVTFQnLCAnVUlfMkQnLCAnVUlfM0QnLCAnU0NFTkVfR0laTU8nLCAnRURJVE9SJywgJ0dJWk1PUycsICdJR05PUkVfUkFZQ0FTVCcsICdQUk9GSUxFUiddKSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHoubnVtYmVyKCkuaW50KCkubm9ubmVnYXRpdmUoKSxcbiAgICAgICAgICAgICAgICAgICAgXSkub3B0aW9uYWwoKS5kZXNjcmliZSgnTm9kZSBsYXllciAoY2MuTGF5ZXJzKS4gQWNjZXB0cyBwcmVzZXQgbmFtZSAoZS5nLiBcIlVJXzJEXCIpIG9yIHJhdyBiaXRtYXNrIG51bWJlci4gSWYgb21pdHRlZDogYXV0by1kZXRlY3RlZCDigJQgVUlfMkQgd2hlbiBhbnkgYW5jZXN0b3IgaGFzIGNjLkNhbnZhcyAoc28gVUkgY2FtZXJhIHJlbmRlcnMgdGhlIG5ldyBub2RlKSwgb3RoZXJ3aXNlIGxlYXZlcyB0aGUgY3JlYXRlLW5vZGUgZGVmYXVsdCAoREVGQVVMVCkuIFJlcXVpcmVkIGZvciBVSSBub2RlcyB1bmRlciBDYW52YXM7IHdpdGhvdXQgaXQgdGhlIG5vZGUgaXMgaW52aXNpYmxlIHRvIHRoZSBVSSBjYW1lcmEuJyksXG4gICAgICAgICAgICAgICAgICAgIGluaXRpYWxUcmFuc2Zvcm06IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHBvc2l0aW9uOiB2ZWMzU2NoZW1hLm9wdGlvbmFsKCksXG4gICAgICAgICAgICAgICAgICAgICAgICByb3RhdGlvbjogdmVjM1NjaGVtYS5vcHRpb25hbCgpLFxuICAgICAgICAgICAgICAgICAgICAgICAgc2NhbGU6IHZlYzNTY2hlbWEub3B0aW9uYWwoKSxcbiAgICAgICAgICAgICAgICAgICAgfSkub3B0aW9uYWwoKS5kZXNjcmliZSgnSW5pdGlhbCB0cmFuc2Zvcm0gYXBwbGllZCBhZnRlciBjcmVhdGUtbm9kZSB2aWEgc2V0X25vZGVfdHJhbnNmb3JtLicpLFxuICAgICAgICAgICAgICAgIH0pXG4gICAgfSlcbiAgICBhc3luYyBjcmVhdGVOb2RlKGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgbGV0IHRhcmdldFBhcmVudFV1aWQgPSBhcmdzLnBhcmVudFV1aWQ7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgLy8g5aaC5p6c5rKS5pyJ5o+Q5L6b54i256+A6bueVVVJRO+8jOeNsuWPluWgtOaZr+agueevgOm7nlxuICAgICAgICAgICAgICAgIGlmICghdGFyZ2V0UGFyZW50VXVpZCkge1xuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGFyZ2V0UGFyZW50VXVpZCA9IGF3YWl0IGdldFNjZW5lUm9vdFV1aWQoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0YXJnZXRQYXJlbnRVdWlkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYE5vIHBhcmVudCBzcGVjaWZpZWQsIHVzaW5nIHNjZW5lIHJvb3Q6ICR7dGFyZ2V0UGFyZW50VXVpZH1gKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY3VycmVudFNjZW5lID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktY3VycmVudC1zY2VuZScpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjdXJyZW50U2NlbmUgJiYgY3VycmVudFNjZW5lLnV1aWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGFyZ2V0UGFyZW50VXVpZCA9IGN1cnJlbnRTY2VuZS51dWlkO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oJ0ZhaWxlZCB0byBnZXQgc2NlbmUgcm9vdCwgd2lsbCB1c2UgZGVmYXVsdCBiZWhhdmlvcicpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8g5aaC5p6c5o+Q5L6b5LqGYXNzZXRQYXRo77yM5YWI6Kej5p6Q54K6YXNzZXRVdWlkXG4gICAgICAgICAgICAgICAgbGV0IGZpbmFsQXNzZXRVdWlkID0gYXJncy5hc3NldFV1aWQ7XG4gICAgICAgICAgICAgICAgaWYgKGFyZ3MuYXNzZXRQYXRoICYmICFmaW5hbEFzc2V0VXVpZCkge1xuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgYXNzZXRJbmZvID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXQtaW5mbycsIGFyZ3MuYXNzZXRQYXRoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChhc3NldEluZm8gJiYgYXNzZXRJbmZvLnV1aWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmaW5hbEFzc2V0VXVpZCA9IGFzc2V0SW5mby51dWlkO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlYnVnTG9nKGBBc3NldCBwYXRoICcke2FyZ3MuYXNzZXRQYXRofScgcmVzb2x2ZWQgdG8gVVVJRDogJHtmaW5hbEFzc2V0VXVpZH1gKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoYEFzc2V0IG5vdCBmb3VuZCBhdCBwYXRoOiAke2FyZ3MuYXNzZXRQYXRofWApO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKGBGYWlsZWQgdG8gcmVzb2x2ZSBhc3NldCBwYXRoICcke2FyZ3MuYXNzZXRQYXRofSc6ICR7ZXJyfWApO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8g5qeL5bu6Y3JlYXRlLW5vZGXpgbjpoIVcbiAgICAgICAgICAgICAgICBjb25zdCBjcmVhdGVOb2RlT3B0aW9uczogYW55ID0ge1xuICAgICAgICAgICAgICAgICAgICBuYW1lOiBhcmdzLm5hbWVcbiAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgLy8g6Kit572u54i256+A6bueXG4gICAgICAgICAgICAgICAgaWYgKHRhcmdldFBhcmVudFV1aWQpIHtcbiAgICAgICAgICAgICAgICAgICAgY3JlYXRlTm9kZU9wdGlvbnMucGFyZW50ID0gdGFyZ2V0UGFyZW50VXVpZDtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyDlvp7os4fmupDlr6bkvovljJZcbiAgICAgICAgICAgICAgICBpZiAoZmluYWxBc3NldFV1aWQpIHtcbiAgICAgICAgICAgICAgICAgICAgY3JlYXRlTm9kZU9wdGlvbnMuYXNzZXRVdWlkID0gZmluYWxBc3NldFV1aWQ7XG4gICAgICAgICAgICAgICAgICAgIGlmIChhcmdzLnVubGlua1ByZWZhYikge1xuICAgICAgICAgICAgICAgICAgICAgICAgY3JlYXRlTm9kZU9wdGlvbnMudW5saW5rUHJlZmFiID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIOa3u+WKoOe1hOS7tlxuICAgICAgICAgICAgICAgIGlmIChhcmdzLmNvbXBvbmVudHMgJiYgYXJncy5jb21wb25lbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgY3JlYXRlTm9kZU9wdGlvbnMuY29tcG9uZW50cyA9IGFyZ3MuY29tcG9uZW50cztcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGFyZ3Mubm9kZVR5cGUgJiYgYXJncy5ub2RlVHlwZSAhPT0gJ05vZGUnICYmICFmaW5hbEFzc2V0VXVpZCkge1xuICAgICAgICAgICAgICAgICAgICAvLyDlj6rmnInlnKjkuI3lvp7os4fmupDlr6bkvovljJbmmYLmiY3mt7vliqBub2RlVHlwZee1hOS7tlxuICAgICAgICAgICAgICAgICAgICBjcmVhdGVOb2RlT3B0aW9ucy5jb21wb25lbnRzID0gW2FyZ3Mubm9kZVR5cGVdO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIOS/neaMgeS4lueVjOiuiuaPm1xuICAgICAgICAgICAgICAgIGlmIChhcmdzLmtlZXBXb3JsZFRyYW5zZm9ybSkge1xuICAgICAgICAgICAgICAgICAgICBjcmVhdGVOb2RlT3B0aW9ucy5rZWVwV29ybGRUcmFuc2Zvcm0gPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIOS4jeS9v+eUqGR1bXDlj4PmlbjomZXnkIbliJ3lp4vorormj5vvvIzlibXlu7rlvozkvb/nlKhzZXRfbm9kZV90cmFuc2Zvcm3oqK3nva5cblxuICAgICAgICAgICAgICAgIGRlYnVnTG9nKCdDcmVhdGluZyBub2RlIHdpdGggb3B0aW9uczonLCBjcmVhdGVOb2RlT3B0aW9ucyk7XG5cbiAgICAgICAgICAgICAgICAvLyDlibXlu7rnr4Dpu55cbiAgICAgICAgICAgICAgICBjb25zdCBub2RlVXVpZCA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ2NyZWF0ZS1ub2RlJywgY3JlYXRlTm9kZU9wdGlvbnMpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHV1aWQgPSBBcnJheS5pc0FycmF5KG5vZGVVdWlkKSA/IG5vZGVVdWlkWzBdIDogbm9kZVV1aWQ7XG5cbiAgICAgICAgICAgICAgICAvLyDomZXnkIblhYTlvJ/ntKLlvJVcbiAgICAgICAgICAgICAgICBpZiAoYXJncy5zaWJsaW5nSW5kZXggIT09IHVuZGVmaW5lZCAmJiBhcmdzLnNpYmxpbmdJbmRleCA+PSAwICYmIHV1aWQgJiYgdGFyZ2V0UGFyZW50VXVpZCkge1xuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDEwMCkpOyAvLyDnrYnlvoXlhafpg6jni4DmhYvmm7TmlrBcbiAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3NldC1wYXJlbnQnLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcGFyZW50OiB0YXJnZXRQYXJlbnRVdWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHV1aWRzOiBbdXVpZF0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAga2VlcFdvcmxkVHJhbnNmb3JtOiBhcmdzLmtlZXBXb3JsZFRyYW5zZm9ybSB8fCBmYWxzZVxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS53YXJuKCdGYWlsZWQgdG8gc2V0IHNpYmxpbmcgaW5kZXg6JywgZXJyKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIOa3u+WKoOe1hOS7tu+8iOWmguaenOaPkOS+m+eahOipse+8iVxuICAgICAgICAgICAgICAgIGlmIChhcmdzLmNvbXBvbmVudHMgJiYgYXJncy5jb21wb25lbnRzLmxlbmd0aCA+IDAgJiYgdXVpZCkge1xuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDEwMCkpOyAvLyDnrYnlvoXnr4Dpu57libXlu7rlrozmiJBcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAoY29uc3QgY29tcG9uZW50VHlwZSBvZiBhcmdzLmNvbXBvbmVudHMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmNvbXBvbmVudFRvb2xzLmV4ZWN1dGUoJ2FkZF9jb21wb25lbnQnLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBub2RlVXVpZDogdXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudFR5cGU6IGNvbXBvbmVudFR5cGVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYENvbXBvbmVudCAke2NvbXBvbmVudFR5cGV9IGFkZGVkIHN1Y2Nlc3NmdWxseWApO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS53YXJuKGBGYWlsZWQgdG8gYWRkIGNvbXBvbmVudCAke2NvbXBvbmVudFR5cGV9OmAsIHJlc3VsdC5lcnJvcik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS53YXJuKGBGYWlsZWQgdG8gYWRkIGNvbXBvbmVudCAke2NvbXBvbmVudFR5cGV9OmAsIGVycik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybignRmFpbGVkIHRvIGFkZCBjb21wb25lbnRzOicsIGVycik7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyDoqK3nva7liJ3lp4vorormj5vvvIjlpoLmnpzmj5DkvpvnmoToqbHvvIlcbiAgICAgICAgICAgICAgICBpZiAoYXJncy5pbml0aWFsVHJhbnNmb3JtICYmIHV1aWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxNTApKTsgLy8g562J5b6F56+A6bue5ZKM57WE5Lu25Ym15bu65a6M5oiQXG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnNldE5vZGVUcmFuc2Zvcm0oe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IHV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcG9zaXRpb246IGFyZ3MuaW5pdGlhbFRyYW5zZm9ybS5wb3NpdGlvbixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByb3RhdGlvbjogYXJncy5pbml0aWFsVHJhbnNmb3JtLnJvdGF0aW9uLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNjYWxlOiBhcmdzLmluaXRpYWxUcmFuc2Zvcm0uc2NhbGVcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coJ0luaXRpYWwgdHJhbnNmb3JtIGFwcGxpZWQgc3VjY2Vzc2Z1bGx5Jyk7XG4gICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS53YXJuKCdGYWlsZWQgdG8gc2V0IGluaXRpYWwgdHJhbnNmb3JtOicsIGVycik7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyDoqK3lrpogbGF5ZXLvvIh1c2VyLXByb3ZpZGVkIOaIliBhdXRvLWRldGVjdCBDYW52YXMgYW5jZXN0b3LvvIlcbiAgICAgICAgICAgICAgICBsZXQgcmVzb2x2ZWRMYXllcjogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG4gICAgICAgICAgICAgICAgbGV0IGxheWVyU291cmNlOiAnZXhwbGljaXQnIHwgJ2F1dG8tY2FudmFzJyB8ICdkZWZhdWx0JyA9ICdkZWZhdWx0JztcbiAgICAgICAgICAgICAgICBpZiAodXVpZCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoYXJncy5sYXllciAhPT0gdW5kZWZpbmVkICYmIGFyZ3MubGF5ZXIgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgYXJncy5sYXllciA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlZExheWVyID0gYXJncy5sYXllcjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsYXllclNvdXJjZSA9ICdleHBsaWNpdCc7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBhcmdzLmxheWVyID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHByZXNldCA9IChMQVlFUl9QUkVTRVRTIGFzIGFueSlbYXJncy5sYXllcl0gYXMgbnVtYmVyIHwgdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgcHJlc2V0ICE9PSAnbnVtYmVyJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFpbChgVW5rbm93biBsYXllciBwcmVzZXQgJyR7YXJncy5sYXllcn0nLiBBbGxvd2VkOiAke09iamVjdC5rZXlzKExBWUVSX1BSRVNFVFMpLmpvaW4oJywgJyl9LCBvciBwYXNzIGEgcmF3IG51bWJlci5gKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZWRMYXllciA9IHByZXNldDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsYXllclNvdXJjZSA9ICdleHBsaWNpdCc7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodGFyZ2V0UGFyZW50VXVpZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gQXV0by1kZXRlY3Q6IGlmIGFueSBhbmNlc3RvciBoYXMgY2MuQ2FudmFzLCBkZWZhdWx0IHRvIFVJXzJEIHNvXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyB0aGUgVUkgY2FtZXJhIGFjdHVhbGx5IHJlbmRlcnMgdGhlIG5ldyBub2RlLlxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgaGFzQ2FudmFzQW5jZXN0b3IgPSBhd2FpdCB0aGlzLmFuY2VzdG9ySGFzQ29tcG9uZW50KHRhcmdldFBhcmVudFV1aWQsICdjYy5DYW52YXMnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChoYXNDYW52YXNBbmNlc3Rvcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmVkTGF5ZXIgPSBMQVlFUl9QUkVTRVRTLlVJXzJEO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxheWVyU291cmNlID0gJ2F1dG8tY2FudmFzJztcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGlmIChyZXNvbHZlZExheWVyICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3NldC1wcm9wZXJ0eScsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcGF0aDogJ2xheWVyJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZHVtcDogeyB2YWx1ZTogcmVzb2x2ZWRMYXllciB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlYnVnTG9nKGBBcHBsaWVkIGxheWVyICR7cmVzb2x2ZWRMYXllcn0gKCR7bGF5ZXJTb3VyY2V9KSB0byAke3V1aWR9YCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oJ0ZhaWxlZCB0byBzZXQgbGF5ZXI6JywgZXJyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIOeNsuWPluWJteW7uuW+jOeahOevgOm7nuS/oeaBr+mAsuihjOmpl+itiVxuICAgICAgICAgICAgICAgIGxldCB2ZXJpZmljYXRpb25EYXRhOiBhbnkgPSBudWxsO1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG5vZGVJbmZvID0gYXdhaXQgdGhpcy5nZXROb2RlSW5mbyh1dWlkKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG5vZGVJbmZvLnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZlcmlmaWNhdGlvbkRhdGEgPSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbm9kZUluZm86IG5vZGVJbmZvLmRhdGEsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY3JlYXRpb25EZXRhaWxzOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBhcmVudFV1aWQ6IHRhcmdldFBhcmVudFV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5vZGVUeXBlOiBhcmdzLm5vZGVUeXBlIHx8ICdOb2RlJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZnJvbUFzc2V0OiAhIWZpbmFsQXNzZXRVdWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhc3NldFV1aWQ6IGZpbmFsQXNzZXRVdWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhc3NldFBhdGg6IGFyZ3MuYXNzZXRQYXRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS53YXJuKCdGYWlsZWQgdG8gZ2V0IHZlcmlmaWNhdGlvbiBkYXRhOicsIGVycik7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgY29uc3Qgc3VjY2Vzc01lc3NhZ2UgPSBmaW5hbEFzc2V0VXVpZCBcbiAgICAgICAgICAgICAgICAgICAgPyBgTm9kZSAnJHthcmdzLm5hbWV9JyBpbnN0YW50aWF0ZWQgZnJvbSBhc3NldCBzdWNjZXNzZnVsbHlgXG4gICAgICAgICAgICAgICAgICAgIDogYE5vZGUgJyR7YXJncy5uYW1lfScgY3JlYXRlZCBzdWNjZXNzZnVsbHlgO1xuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAgdXVpZDogdXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG5hbWU6IGFyZ3MubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhcmVudFV1aWQ6IHRhcmdldFBhcmVudFV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBub2RlVHlwZTogYXJncy5ub2RlVHlwZSB8fCAnTm9kZScsXG4gICAgICAgICAgICAgICAgICAgICAgICBmcm9tQXNzZXQ6ICEhZmluYWxBc3NldFV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBhc3NldFV1aWQ6IGZpbmFsQXNzZXRVdWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgbGF5ZXI6IHJlc29sdmVkTGF5ZXIsXG4gICAgICAgICAgICAgICAgICAgICAgICBsYXllclNvdXJjZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IHN1Y2Nlc3NNZXNzYWdlXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIHZlcmlmaWNhdGlvbkRhdGE6IHZlcmlmaWNhdGlvbkRhdGFcbiAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKGBGYWlsZWQgdG8gY3JlYXRlIG5vZGU6ICR7ZXJyLm1lc3NhZ2V9LiBBcmdzOiAke0pTT04uc3RyaW5naWZ5KGFyZ3MpfWApO1xuICAgICAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIFdhbGsgdXAgZnJvbSBgc3RhcnRVdWlkYCAoaW5jbHVzaXZlKSBjaGVja2luZyBmb3IgYSBjb21wb25lbnQgd2hvc2VcbiAgICAvLyBfX3R5cGVfXyBtYXRjaGVzIGBjb21wb25lbnRUeXBlYC4gUmV0dXJucyB0cnVlIGlmIGZvdW5kIGFueXdoZXJlIGluIHRoZVxuICAgIC8vIGNoYWluIHVwIHRvIChidXQgbm90IGluY2x1ZGluZykgdGhlIHNjZW5lIHJvb3QuIEJvdW5kZWQgdG8gNjQgc3RlcHMgYXNcbiAgICAvLyBhIHNhZmV0eSBzdG9wIGluIGNhc2Ugb2YgYSBtYWxmb3JtZWQgcGFyZW50IGdyYXBoLlxuICAgIHByaXZhdGUgYXN5bmMgYW5jZXN0b3JIYXNDb21wb25lbnQoc3RhcnRVdWlkOiBzdHJpbmcsIGNvbXBvbmVudFR5cGU6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgICAgICBsZXQgY3Vyc29yOiBzdHJpbmcgfCBudWxsID0gc3RhcnRVdWlkO1xuICAgICAgICBmb3IgKGxldCBob3BzID0gMDsgaG9wcyA8IDY0ICYmIGN1cnNvcjsgaG9wcysrKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGRhdGE6IGFueSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LW5vZGUnLCBjdXJzb3IpO1xuICAgICAgICAgICAgICAgIGlmICghZGF0YSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KGRhdGEuX19jb21wc19fKSkge1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGNvbXAgb2YgZGF0YS5fX2NvbXBzX18pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjb21wICYmIChjb21wLl9fdHlwZV9fID09PSBjb21wb25lbnRUeXBlIHx8IGNvbXAudHlwZSA9PT0gY29tcG9uZW50VHlwZSB8fCBjb21wLmNpZCA9PT0gY29tcG9uZW50VHlwZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBwYXJlbnRVdWlkID0gZGF0YS5wYXJlbnQ/LnZhbHVlPy51dWlkID8/IG51bGw7XG4gICAgICAgICAgICAgICAgaWYgKCFwYXJlbnRVdWlkIHx8IHBhcmVudFV1aWQgPT09IGN1cnNvcikgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIGN1cnNvciA9IHBhcmVudFV1aWQ7XG4gICAgICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHsgbmFtZTogJ2dldF9ub2RlX2luZm8nLCB0aXRsZTogJ1JlYWQgbm9kZSBpbmZvJywgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gUmVhZCBvbmUgbm9kZSBieSBVVUlELCBpbmNsdWRpbmcgdHJhbnNmb3JtLCBjaGlsZHJlbiwgYW5kIGNvbXBvbmVudCBzdW1tYXJ5LiBObyBtdXRhdGlvbi4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ05vZGUgVVVJRCB0byBpbnNwZWN0LicpLFxuICAgICAgICAgICAgICAgIH0pXG4gICAgfSlcbiAgICBhc3luYyBnZXROb2RlSW5mbyh1dWlkOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBpZiAodXVpZCAmJiB0eXBlb2YgdXVpZCA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIHV1aWQgPSB1dWlkLnV1aWQ7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1ub2RlJywgdXVpZCkudGhlbigobm9kZURhdGE6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmICghbm9kZURhdGEpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKCdOb2RlIG5vdCBmb3VuZCBvciBpbnZhbGlkIHJlc3BvbnNlJykpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIC8vIOagueaTmuWvpumam+i/lOWbnueahOaVuOaTmue1kOani+ino+aekOevgOm7nuS/oeaBr1xuICAgICAgICAgICAgICAgIGNvbnN0IGluZm86IE5vZGVJbmZvID0ge1xuICAgICAgICAgICAgICAgICAgICB1dWlkOiBkdW1wVW53cmFwKG5vZGVEYXRhLnV1aWQsIHV1aWQpLFxuICAgICAgICAgICAgICAgICAgICBuYW1lOiBkdW1wVW53cmFwKG5vZGVEYXRhLm5hbWUsICdVbmtub3duJyksXG4gICAgICAgICAgICAgICAgICAgIGFjdGl2ZTogbm9kZURhdGEuYWN0aXZlPy52YWx1ZSAhPT0gdW5kZWZpbmVkID8gbm9kZURhdGEuYWN0aXZlLnZhbHVlIDogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgcG9zaXRpb246IGR1bXBVbndyYXAobm9kZURhdGEucG9zaXRpb24sIHsgeDogMCwgeTogMCwgejogMCB9KSxcbiAgICAgICAgICAgICAgICAgICAgcm90YXRpb246IGR1bXBVbndyYXAobm9kZURhdGEucm90YXRpb24sIHsgeDogMCwgeTogMCwgejogMCB9KSxcbiAgICAgICAgICAgICAgICAgICAgc2NhbGU6IGR1bXBVbndyYXAobm9kZURhdGEuc2NhbGUsIHsgeDogMSwgeTogMSwgejogMSB9KSxcbiAgICAgICAgICAgICAgICAgICAgcGFyZW50OiBub2RlRGF0YS5wYXJlbnQ/LnZhbHVlPy51dWlkIHx8IG51bGwsXG4gICAgICAgICAgICAgICAgICAgIGNoaWxkcmVuOiBub2RlRGF0YS5jaGlsZHJlbiB8fCBbXSxcbiAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50czogKG5vZGVEYXRhLl9fY29tcHNfXyB8fCBbXSkubWFwKChjb21wOiBhbnkpID0+ICh7XG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiBjb21wLl9fdHlwZV9fIHx8ICdVbmtub3duJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGVuYWJsZWQ6IGNvbXAuZW5hYmxlZCAhPT0gdW5kZWZpbmVkID8gY29tcC5lbmFibGVkIDogdHJ1ZVxuICAgICAgICAgICAgICAgICAgICB9KSksXG4gICAgICAgICAgICAgICAgICAgIGxheWVyOiBkdW1wVW53cmFwKG5vZGVEYXRhLmxheWVyLCAxMDczNzQxODI0KSxcbiAgICAgICAgICAgICAgICAgICAgbW9iaWxpdHk6IGR1bXBVbndyYXAobm9kZURhdGEubW9iaWxpdHksIDApXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKGluZm8pKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woeyBuYW1lOiAnc2V0X2xheW91dCcsIHRpdGxlOiAnU2V0IGxheW91dCBjb21wb25lbnQnLCBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBBZGQgb3IgdXBkYXRlIGNjLkxheW91dCBvbiBhIG5vZGUuIE11dGF0ZXMgc2NlbmUgYW5kIGFwcGxpZXMgb25seSBwcm92aWRlZCBsYXlvdXQgcHJvcGVydGllcy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIG5vZGVVdWlkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdOb2RlIFVVSUQgdGhhdCBvd25zIG9yIHNob3VsZCByZWNlaXZlIGNjLkxheW91dC4nKSxcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogei5lbnVtKFsnTk9ORScsICdIT1JJWk9OVEFMJywgJ1ZFUlRJQ0FMJywgJ0dSSUQnXSkub3B0aW9uYWwoKSxcbiAgICAgICAgICAgICAgICAgICAgcmVzaXplTW9kZTogei5lbnVtKFsnTk9ORScsICdDT05UQUlORVInLCAnQ0hJTERSRU4nXSkub3B0aW9uYWwoKSxcbiAgICAgICAgICAgICAgICAgICAgcGFkZGluZ1RvcDogei5udW1iZXIoKS5vcHRpb25hbCgpLFxuICAgICAgICAgICAgICAgICAgICBwYWRkaW5nQm90dG9tOiB6Lm51bWJlcigpLm9wdGlvbmFsKCksXG4gICAgICAgICAgICAgICAgICAgIHBhZGRpbmdMZWZ0OiB6Lm51bWJlcigpLm9wdGlvbmFsKCksXG4gICAgICAgICAgICAgICAgICAgIHBhZGRpbmdSaWdodDogei5udW1iZXIoKS5vcHRpb25hbCgpLFxuICAgICAgICAgICAgICAgICAgICBzcGFjaW5nWDogei5udW1iZXIoKS5vcHRpb25hbCgpLFxuICAgICAgICAgICAgICAgICAgICBzcGFjaW5nWTogei5udW1iZXIoKS5vcHRpb25hbCgpLFxuICAgICAgICAgICAgICAgICAgICBzdGFydEF4aXM6IHouZW51bShbJ0hPUklaT05UQUwnLCAnVkVSVElDQUwnXSkub3B0aW9uYWwoKSxcbiAgICAgICAgICAgICAgICAgICAgY29uc3RyYWludE51bTogei5udW1iZXIoKS5pbnQoKS5vcHRpb25hbCgpLFxuICAgICAgICAgICAgICAgICAgICBhdXRvQWxpZ25tZW50OiB6LmJvb2xlYW4oKS5vcHRpb25hbCgpLFxuICAgICAgICAgICAgICAgICAgICBhZmZlY3RlZEJ5U2NhbGU6IHouYm9vbGVhbigpLm9wdGlvbmFsKCksXG4gICAgICAgICAgICAgICAgfSlcbiAgICB9KVxuICAgIGFzeW5jIHNldExheW91dChhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgdHlwZU1hcDogUmVjb3JkPHN0cmluZywgbnVtYmVyPiA9IHsgTk9ORTogMCwgSE9SSVpPTlRBTDogMSwgVkVSVElDQUw6IDIsIEdSSUQ6IDMgfTtcbiAgICAgICAgICAgIGNvbnN0IHJlc2l6ZU1vZGVNYXA6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gPSB7IE5PTkU6IDAsIENPTlRBSU5FUjogMSwgQ0hJTERSRU46IDIgfTtcbiAgICAgICAgICAgIGNvbnN0IHN0YXJ0QXhpc01hcDogUmVjb3JkPHN0cmluZywgbnVtYmVyPiA9IHsgSE9SSVpPTlRBTDogMCwgVkVSVElDQUw6IDEgfTtcblxuICAgICAgICAgICAgbGV0IG5vZGVEYXRhOiBhbnkgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1ub2RlJywgYXJncy5ub2RlVXVpZCk7XG4gICAgICAgICAgICBsZXQgY29tcHM6IGFueVtdID0gbm9kZURhdGE/Ll9fY29tcHNfXyB8fCBbXTtcbiAgICAgICAgICAgIGxldCBsYXlvdXRJZHggPSBmaW5kQ29tcG9uZW50SW5kZXhCeVR5cGUoY29tcHMsICdjYy5MYXlvdXQnKTtcblxuICAgICAgICAgICAgaWYgKGxheW91dElkeCA9PT0gLTEpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBhZGRSZXN1bHQgPSBhd2FpdCB0aGlzLmNvbXBvbmVudFRvb2xzLmV4ZWN1dGUoJ2FkZF9jb21wb25lbnQnLCB7XG4gICAgICAgICAgICAgICAgICAgIG5vZGVVdWlkOiBhcmdzLm5vZGVVdWlkLFxuICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRUeXBlOiAnY2MuTGF5b3V0JyxcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBpZiAoIWFkZFJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBhZGRSZXN1bHQ7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgbm9kZURhdGEgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1ub2RlJywgYXJncy5ub2RlVXVpZCk7XG4gICAgICAgICAgICAgICAgY29tcHMgPSBub2RlRGF0YT8uX19jb21wc19fIHx8IFtdO1xuICAgICAgICAgICAgICAgIGxheW91dElkeCA9IGZpbmRDb21wb25lbnRJbmRleEJ5VHlwZShjb21wcywgJ2NjLkxheW91dCcpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAobGF5b3V0SWR4ID09PSAtMSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKCdjYy5MYXlvdXQgY29tcG9uZW50IG5vdCBmb3VuZCBhZnRlciBhZGRfY29tcG9uZW50Jyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IHNldFByb3BzOiBBcnJheTx7IHByb3A6IHN0cmluZzsgdmFsdWU6IGFueSB9PiA9IFtdO1xuICAgICAgICAgICAgaWYgKGFyZ3MudHlwZSAhPT0gdW5kZWZpbmVkKSBzZXRQcm9wcy5wdXNoKHsgcHJvcDogJ3R5cGUnLCB2YWx1ZTogdHlwZU1hcFthcmdzLnR5cGVdIH0pO1xuICAgICAgICAgICAgaWYgKGFyZ3MucmVzaXplTW9kZSAhPT0gdW5kZWZpbmVkKSBzZXRQcm9wcy5wdXNoKHsgcHJvcDogJ3Jlc2l6ZU1vZGUnLCB2YWx1ZTogcmVzaXplTW9kZU1hcFthcmdzLnJlc2l6ZU1vZGVdIH0pO1xuICAgICAgICAgICAgaWYgKGFyZ3MucGFkZGluZ1RvcCAhPT0gdW5kZWZpbmVkKSBzZXRQcm9wcy5wdXNoKHsgcHJvcDogJ3BhZGRpbmdUb3AnLCB2YWx1ZTogYXJncy5wYWRkaW5nVG9wIH0pO1xuICAgICAgICAgICAgaWYgKGFyZ3MucGFkZGluZ0JvdHRvbSAhPT0gdW5kZWZpbmVkKSBzZXRQcm9wcy5wdXNoKHsgcHJvcDogJ3BhZGRpbmdCb3R0b20nLCB2YWx1ZTogYXJncy5wYWRkaW5nQm90dG9tIH0pO1xuICAgICAgICAgICAgaWYgKGFyZ3MucGFkZGluZ0xlZnQgIT09IHVuZGVmaW5lZCkgc2V0UHJvcHMucHVzaCh7IHByb3A6ICdwYWRkaW5nTGVmdCcsIHZhbHVlOiBhcmdzLnBhZGRpbmdMZWZ0IH0pO1xuICAgICAgICAgICAgaWYgKGFyZ3MucGFkZGluZ1JpZ2h0ICE9PSB1bmRlZmluZWQpIHNldFByb3BzLnB1c2goeyBwcm9wOiAncGFkZGluZ1JpZ2h0JywgdmFsdWU6IGFyZ3MucGFkZGluZ1JpZ2h0IH0pO1xuICAgICAgICAgICAgaWYgKGFyZ3Muc3BhY2luZ1ggIT09IHVuZGVmaW5lZCkgc2V0UHJvcHMucHVzaCh7IHByb3A6ICdzcGFjaW5nWCcsIHZhbHVlOiBhcmdzLnNwYWNpbmdYIH0pO1xuICAgICAgICAgICAgaWYgKGFyZ3Muc3BhY2luZ1kgIT09IHVuZGVmaW5lZCkgc2V0UHJvcHMucHVzaCh7IHByb3A6ICdzcGFjaW5nWScsIHZhbHVlOiBhcmdzLnNwYWNpbmdZIH0pO1xuICAgICAgICAgICAgaWYgKGFyZ3Muc3RhcnRBeGlzICE9PSB1bmRlZmluZWQpIHNldFByb3BzLnB1c2goeyBwcm9wOiAnc3RhcnRBeGlzJywgdmFsdWU6IHN0YXJ0QXhpc01hcFthcmdzLnN0YXJ0QXhpc10gfSk7XG4gICAgICAgICAgICBpZiAoYXJncy5jb25zdHJhaW50TnVtICE9PSB1bmRlZmluZWQpIHNldFByb3BzLnB1c2goeyBwcm9wOiAnY29uc3RyYWludE51bScsIHZhbHVlOiBhcmdzLmNvbnN0cmFpbnROdW0gfSk7XG4gICAgICAgICAgICBpZiAoYXJncy5hdXRvQWxpZ25tZW50ICE9PSB1bmRlZmluZWQpIHNldFByb3BzLnB1c2goeyBwcm9wOiAnYXV0b0FsaWdubWVudCcsIHZhbHVlOiBhcmdzLmF1dG9BbGlnbm1lbnQgfSk7XG4gICAgICAgICAgICBpZiAoYXJncy5hZmZlY3RlZEJ5U2NhbGUgIT09IHVuZGVmaW5lZCkgc2V0UHJvcHMucHVzaCh7IHByb3A6ICdhZmZlY3RlZEJ5U2NhbGUnLCB2YWx1ZTogYXJncy5hZmZlY3RlZEJ5U2NhbGUgfSk7XG5cbiAgICAgICAgICAgIGZvciAoY29uc3QgaXRlbSBvZiBzZXRQcm9wcykge1xuICAgICAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3NldC1wcm9wZXJ0eScsIHtcbiAgICAgICAgICAgICAgICAgICAgdXVpZDogYXJncy5ub2RlVXVpZCxcbiAgICAgICAgICAgICAgICAgICAgcGF0aDogJ19fY29tcHNfXy4nICsgbGF5b3V0SWR4ICsgJy4nICsgaXRlbS5wcm9wLFxuICAgICAgICAgICAgICAgICAgICBkdW1wOiB7IHZhbHVlOiBpdGVtLnZhbHVlIH0sXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgbm9kZVV1aWQ6IGFyZ3Mubm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgYXBwbGllZDogc2V0UHJvcHMubWFwKGl0ZW0gPT4gaXRlbS5wcm9wKSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoYEZhaWxlZCB0byBzZXQgbGF5b3V0OiAke2Vyci5tZXNzYWdlfWApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgQG1jcFRvb2woeyBuYW1lOiAnZmluZF9ub2RlcycsIHRpdGxlOiAnRmluZCBub2RlcyBieSBwYXR0ZXJuJywgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gU2VhcmNoIGN1cnJlbnQtc2NlbmUgbm9kZXMgYnkgbmFtZSBwYXR0ZXJuIGFuZCByZXR1cm4gbXVsdGlwbGUgbWF0Y2hlcy4gTm8gbXV0YXRpb247IHVzZSB3aGVuIG5hbWVzIG1heSBiZSBkdXBsaWNhdGVkLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgcGF0dGVybjogei5zdHJpbmcoKS5kZXNjcmliZSgnTm9kZSBuYW1lIHNlYXJjaCBwYXR0ZXJuLiBQYXJ0aWFsIG1hdGNoIHVubGVzcyBleGFjdE1hdGNoPXRydWUuJyksXG4gICAgICAgICAgICAgICAgICAgIGV4YWN0TWF0Y2g6IHouYm9vbGVhbigpLmRlZmF1bHQoZmFsc2UpLmRlc2NyaWJlKCdSZXF1aXJlIGV4YWN0IG5vZGUgbmFtZSBtYXRjaC4gRGVmYXVsdCBmYWxzZS4nKSxcbiAgICAgICAgICAgICAgICB9KVxuICAgIH0pXG4gICAgYXN5bmMgZmluZE5vZGVzKHBhdHRlcm46IGFueSwgZXhhY3RNYXRjaDogYm9vbGVhbiA9IGZhbHNlKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgaWYgKHBhdHRlcm4gJiYgdHlwZW9mIHBhdHRlcm4gPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICBleGFjdE1hdGNoID0gcGF0dGVybi5leGFjdE1hdGNoO1xuICAgICAgICAgICAgcGF0dGVybiA9IHBhdHRlcm4ucGF0dGVybjtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIC8vIE5vdGU6ICdxdWVyeS1ub2Rlcy1ieS1uYW1lJyBBUEkgZG9lc24ndCBleGlzdCBpbiBvZmZpY2lhbCBkb2N1bWVudGF0aW9uXG4gICAgICAgICAgICAvLyBVc2luZyB0cmVlIHRyYXZlcnNhbCBhcyBwcmltYXJ5IGFwcHJvYWNoXG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1ub2RlLXRyZWUnKS50aGVuKCh0cmVlOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBub2RlczogYW55W10gPSBbXTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBjb25zdCBzZWFyY2hUcmVlID0gKG5vZGU6IGFueSwgY3VycmVudFBhdGg6IHN0cmluZyA9ICcnKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG5vZGVQYXRoID0gY3VycmVudFBhdGggPyBgJHtjdXJyZW50UGF0aH0vJHtub2RlLm5hbWV9YCA6IG5vZGUubmFtZTtcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG1hdGNoZXMgPSBleGFjdE1hdGNoID8gXG4gICAgICAgICAgICAgICAgICAgICAgICBub2RlLm5hbWUgPT09IHBhdHRlcm4gOiBcbiAgICAgICAgICAgICAgICAgICAgICAgIG5vZGUubmFtZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHBhdHRlcm4udG9Mb3dlckNhc2UoKSk7XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICBpZiAobWF0Y2hlcykge1xuICAgICAgICAgICAgICAgICAgICAgICAgbm9kZXMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdXVpZDogbm9kZS51dWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5hbWU6IG5vZGUubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwYXRoOiBub2RlUGF0aFxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIGlmIChub2RlLmNoaWxkcmVuKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIG5vZGUuY2hpbGRyZW4pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZWFyY2hUcmVlKGNoaWxkLCBub2RlUGF0aCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGlmICh0cmVlKSB7XG4gICAgICAgICAgICAgICAgICAgIHNlYXJjaFRyZWUodHJlZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIHJlc29sdmUob2sobm9kZXMpKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgLy8g5YKZ55So5pa55qGI77ya5L2/55So5aC05pmv6IWz5pysXG4gICAgICAgICAgICAgICAgcnVuU2NlbmVNZXRob2QoJ2ZpbmROb2RlcycsIFtwYXR0ZXJuLCBleGFjdE1hdGNoXSkudGhlbigocmVzdWx0OiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgICAgICAgIH0pLmNhdGNoKChlcnIyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoYFRyZWUgc2VhcmNoIGZhaWxlZDogJHtlcnIubWVzc2FnZX0sIFNjZW5lIHNjcmlwdCBmYWlsZWQ6ICR7ZXJyMi5tZXNzYWdlfWApKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdmaW5kX25vZGVfYnlfbmFtZScsIHRpdGxlOiAnRmluZCBub2RlIGJ5IG5hbWUnLCBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBGaW5kIHRoZSBmaXJzdCBub2RlIHdpdGggYW4gZXhhY3QgbmFtZS4gTm8gbXV0YXRpb247IG9ubHkgc2FmZSB3aGVuIHRoZSBuYW1lIGlzIHVuaXF1ZSBlbm91Z2guJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBuYW1lOiB6LnN0cmluZygpLmRlc2NyaWJlKCdFeGFjdCBub2RlIG5hbWUgdG8gZmluZC4gUmV0dXJucyB0aGUgZmlyc3QgbWF0Y2ggb25seS4nKSxcbiAgICAgICAgICAgICAgICB9KVxuICAgIH0pXG4gICAgYXN5bmMgZmluZE5vZGVCeU5hbWUobmFtZTogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgaWYgKG5hbWUgJiYgdHlwZW9mIG5hbWUgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICBuYW1lID0gbmFtZS5uYW1lO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgLy8g5YSq5YWI5ZqQ6Kmm5L2/55SoIEVkaXRvciBBUEkg5p+l6Kmi56+A6bue5qi55Lim5pCc57SiXG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1ub2RlLXRyZWUnKS50aGVuKCh0cmVlOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBmb3VuZE5vZGUgPSB0aGlzLnNlYXJjaE5vZGVJblRyZWUodHJlZSwgbmFtZSk7XG4gICAgICAgICAgICAgICAgaWYgKGZvdW5kTm9kZSkge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiBmb3VuZE5vZGUudXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBuYW1lOiBmb3VuZE5vZGUubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwYXRoOiB0aGlzLmdldE5vZGVQYXRoKGZvdW5kTm9kZSlcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoYE5vZGUgJyR7bmFtZX0nIG5vdCBmb3VuZGApKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIC8vIOWCmeeUqOaWueahiO+8muS9v+eUqOWgtOaZr+iFs+acrFxuICAgICAgICAgICAgICAgIHJ1blNjZW5lTWV0aG9kKCdmaW5kTm9kZUJ5TmFtZScsIFtuYW1lXSkudGhlbigocmVzdWx0OiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgICAgICAgIH0pLmNhdGNoKChlcnIyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoYERpcmVjdCBBUEkgZmFpbGVkOiAke2Vyci5tZXNzYWdlfSwgU2NlbmUgc2NyaXB0IGZhaWxlZDogJHtlcnIyLm1lc3NhZ2V9YCkpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgc2VhcmNoTm9kZUluVHJlZShub2RlOiBhbnksIHRhcmdldE5hbWU6IHN0cmluZyk6IGFueSB7XG4gICAgICAgIGlmIChub2RlLm5hbWUgPT09IHRhcmdldE5hbWUpIHtcbiAgICAgICAgICAgIHJldHVybiBub2RlO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBpZiAobm9kZS5jaGlsZHJlbikge1xuICAgICAgICAgICAgZm9yIChjb25zdCBjaGlsZCBvZiBub2RlLmNoaWxkcmVuKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZm91bmQgPSB0aGlzLnNlYXJjaE5vZGVJblRyZWUoY2hpbGQsIHRhcmdldE5hbWUpO1xuICAgICAgICAgICAgICAgIGlmIChmb3VuZCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZm91bmQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdnZXRfYWxsX25vZGVzJywgdGl0bGU6ICdMaXN0IGFsbCBub2RlcycsIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIExpc3QgYWxsIGN1cnJlbnQtc2NlbmUgbm9kZXMgd2l0aCBuYW1lL3V1aWQvdHlwZS9wYXRoOyBwcmltYXJ5IHNvdXJjZSBmb3Igbm9kZVV1aWQvcGFyZW50VXVpZC4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSlcbiAgICB9KVxuICAgIGFzeW5jIGdldEFsbE5vZGVzKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgLy8g5ZiX6Kmm5p+l6Kmi5aC05pmv56+A6bue5qi5XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1ub2RlLXRyZWUnKS50aGVuKCh0cmVlOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBub2RlczogYW55W10gPSBbXTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBjb25zdCB0cmF2ZXJzZVRyZWUgPSAobm9kZTogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIG5vZGVzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgdXVpZDogbm9kZS51dWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogbm9kZS5uYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogbm9kZS50eXBlLFxuICAgICAgICAgICAgICAgICAgICAgICAgYWN0aXZlOiBub2RlLmFjdGl2ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhdGg6IHRoaXMuZ2V0Tm9kZVBhdGgobm9kZSlcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICBpZiAobm9kZS5jaGlsZHJlbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBjaGlsZCBvZiBub2RlLmNoaWxkcmVuKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHJhdmVyc2VUcmVlKGNoaWxkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaWYgKHRyZWUgJiYgdHJlZS5jaGlsZHJlbikge1xuICAgICAgICAgICAgICAgICAgICB0cmF2ZXJzZVRyZWUodHJlZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgdG90YWxOb2Rlczogbm9kZXMubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICAgICAgbm9kZXM6IG5vZGVzXG4gICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgLy8g5YKZ55So5pa55qGI77ya5L2/55So5aC05pmv6IWz5pysXG4gICAgICAgICAgICAgICAgcnVuU2NlbmVNZXRob2QoJ2dldEFsbE5vZGVzJywgW10pLnRoZW4oKHJlc3VsdDogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICAgICAgICB9KS5jYXRjaCgoZXJyMjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGBEaXJlY3QgQVBJIGZhaWxlZDogJHtlcnIubWVzc2FnZX0sIFNjZW5lIHNjcmlwdCBmYWlsZWQ6ICR7ZXJyMi5tZXNzYWdlfWApKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGdldE5vZGVQYXRoKG5vZGU6IGFueSk6IHN0cmluZyB7XG4gICAgICAgIGNvbnN0IHBhdGggPSBbbm9kZS5uYW1lXTtcbiAgICAgICAgbGV0IGN1cnJlbnQgPSBub2RlLnBhcmVudDtcbiAgICAgICAgd2hpbGUgKGN1cnJlbnQgJiYgY3VycmVudC5uYW1lICE9PSAnQ2FudmFzJykge1xuICAgICAgICAgICAgcGF0aC51bnNoaWZ0KGN1cnJlbnQubmFtZSk7XG4gICAgICAgICAgICBjdXJyZW50ID0gY3VycmVudC5wYXJlbnQ7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHBhdGguam9pbignLycpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHsgbmFtZTogJ3NldF9ub2RlX3Byb3BlcnR5JywgdGl0bGU6ICdTZXQgbm9kZSBwcm9wZXJ0eScsIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFNldCBhIG5vZGUgcHJvcGVydHkgcGF0aC4gTXV0YXRlcyBzY2VuZTsgdXNlIGZvciBhY3RpdmUvbmFtZS9sYXllci4gUHJlZmVyIHNldF9ub2RlX3RyYW5zZm9ybSBmb3IgcG9zaXRpb24vcm90YXRpb24vc2NhbGUuIEFjY2VwdHMgcmVmZXJlbmNlPXtpZCx0eXBlfSAocHJlZmVycmVkKSwgdXVpZCwgb3Igbm9kZU5hbWUuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICByZWZlcmVuY2U6IGluc3RhbmNlUmVmZXJlbmNlU2NoZW1hLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0luc3RhbmNlUmVmZXJlbmNlIHtpZCx0eXBlfS4gUHJlZmVycmVkIGZvcm0g4oCUIHR5cGUgdHJhdmVscyB3aXRoIHRoZSBpZCBzbyBBSSBkb2VzIG5vdCBsb3NlIHNlbWFudGljIGNvbnRleHQuJyksXG4gICAgICAgICAgICAgICAgICAgIHV1aWQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnTm9kZSBVVUlEIHRvIG1vZGlmeS4gVXNlZCB3aGVuIHJlZmVyZW5jZSBpcyBvbWl0dGVkLicpLFxuICAgICAgICAgICAgICAgICAgICBub2RlTmFtZTogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdOb2RlIG5hbWUgKGRlcHRoLWZpcnN0IGZpcnN0IG1hdGNoKS4gVXNlZCB3aGVuIHJlZmVyZW5jZSBhbmQgdXVpZCBhcmUgb21pdHRlZC4nKSxcbiAgICAgICAgICAgICAgICAgICAgcHJvcGVydHk6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ05vZGUgcHJvcGVydHkgcGF0aCwgZS5nLiBhY3RpdmUsIG5hbWUsIGxheWVyLiBQcmVmZXIgc2V0X25vZGVfdHJhbnNmb3JtIGZvciBwb3NpdGlvbi9yb3RhdGlvbi9zY2FsZS4nKSxcbiAgICAgICAgICAgICAgICAgICAgdmFsdWU6IHouYW55KCkuZGVzY3JpYmUoJ1ZhbHVlIHRvIHdyaXRlOyBtdXN0IG1hdGNoIHRoZSBDb2NvcyBkdW1wIHNoYXBlIGZvciB0aGUgcHJvcGVydHkgcGF0aC4nKSxcbiAgICAgICAgICAgICAgICB9KVxuICAgIH0pXG4gICAgYXN5bmMgc2V0Tm9kZVByb3BlcnR5KHV1aWQ6IGFueSwgcHJvcGVydHk/OiBzdHJpbmcsIHZhbHVlPzogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgaWYgKHV1aWQgJiYgdHlwZW9mIHV1aWQgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICBjb25zdCBhID0gdXVpZDtcbiAgICAgICAgICAgIGNvbnN0IHIgPSBhd2FpdCByZXNvbHZlUmVmZXJlbmNlKHsgcmVmZXJlbmNlOiBhLnJlZmVyZW5jZSwgbm9kZVV1aWQ6IGEudXVpZCwgbm9kZU5hbWU6IGEubm9kZU5hbWUgfSk7XG4gICAgICAgICAgICBpZiAoJ3Jlc3BvbnNlJyBpbiByKSByZXR1cm4gci5yZXNwb25zZTtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnNldE5vZGVQcm9wZXJ0eShyLnV1aWQsIGEucHJvcGVydHksIGEudmFsdWUpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgLy8g5ZiX6Kmm55u05o6l5L2/55SoIEVkaXRvciBBUEkg6Kit572u56+A6bue5bGs5oCnXG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdzZXQtcHJvcGVydHknLCB7XG4gICAgICAgICAgICAgICAgdXVpZDogdXVpZCxcbiAgICAgICAgICAgICAgICBwYXRoOiBwcm9wZXJ0eSEsXG4gICAgICAgICAgICAgICAgZHVtcDoge1xuICAgICAgICAgICAgICAgICAgICB2YWx1ZTogdmFsdWVcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICAvLyBHZXQgY29tcHJlaGVuc2l2ZSB2ZXJpZmljYXRpb24gZGF0YSBpbmNsdWRpbmcgdXBkYXRlZCBub2RlIGluZm9cbiAgICAgICAgICAgICAgICB0aGlzLmdldE5vZGVJbmZvKHV1aWQpLnRoZW4oKG5vZGVJbmZvKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBQcm9wZXJ0eSAnJHtwcm9wZXJ0eX0nIHVwZGF0ZWQgc3VjY2Vzc2Z1bGx5YCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBub2RlVXVpZDogdXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0eTogcHJvcGVydHksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV3VmFsdWU6IHZhbHVlXG4gICAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgdmVyaWZpY2F0aW9uRGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5vZGVJbmZvOiBub2RlSW5mby5kYXRhLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNoYW5nZURldGFpbHM6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvcGVydHk6IHByb3BlcnR5LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZTogdmFsdWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9KS5jYXRjaCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUob2sodW5kZWZpbmVkLCBgUHJvcGVydHkgJyR7cHJvcGVydHl9JyB1cGRhdGVkIHN1Y2Nlc3NmdWxseSAodmVyaWZpY2F0aW9uIGZhaWxlZClgKSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIC8vIOWmguaenOebtOaOpeioree9ruWkseaVl++8jOWYl+ippuS9v+eUqOWgtOaZr+iFs+acrFxuICAgICAgICAgICAgICAgIHJ1blNjZW5lTWV0aG9kKCdzZXROb2RlUHJvcGVydHknLCBbdXVpZCwgcHJvcGVydHksIHZhbHVlXSkudGhlbigocmVzdWx0OiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgICAgICAgIH0pLmNhdGNoKChlcnIyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoYERpcmVjdCBBUEkgZmFpbGVkOiAke2Vyci5tZXNzYWdlfSwgU2NlbmUgc2NyaXB0IGZhaWxlZDogJHtlcnIyLm1lc3NhZ2V9YCkpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHsgbmFtZTogJ3NldF9ub2RlX3RyYW5zZm9ybScsIHRpdGxlOiAnU2V0IG5vZGUgdHJhbnNmb3JtJywgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gU2V0IG5vZGUgcG9zaXRpb24sIHJvdGF0aW9uLCBvciBzY2FsZSB3aXRoIDJELzNEIG5vcm1hbGl6YXRpb24uIE11dGF0ZXMgc2NlbmUuIEFjY2VwdHMgcmVmZXJlbmNlPXtpZCx0eXBlfSAocHJlZmVycmVkKSwgdXVpZCwgb3Igbm9kZU5hbWUuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICByZWZlcmVuY2U6IGluc3RhbmNlUmVmZXJlbmNlU2NoZW1hLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0luc3RhbmNlUmVmZXJlbmNlIHtpZCx0eXBlfS4gUHJlZmVycmVkIGZvcm0g4oCUIHR5cGUgdHJhdmVscyB3aXRoIHRoZSBpZCBzbyBBSSBkb2VzIG5vdCBsb3NlIHNlbWFudGljIGNvbnRleHQuJyksXG4gICAgICAgICAgICAgICAgICAgIHV1aWQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnTm9kZSBVVUlEIHdob3NlIHRyYW5zZm9ybSBzaG91bGQgYmUgY2hhbmdlZC4gVXNlZCB3aGVuIHJlZmVyZW5jZSBpcyBvbWl0dGVkLicpLFxuICAgICAgICAgICAgICAgICAgICBub2RlTmFtZTogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdOb2RlIG5hbWUgKGRlcHRoLWZpcnN0IGZpcnN0IG1hdGNoKS4gVXNlZCB3aGVuIHJlZmVyZW5jZSBhbmQgdXVpZCBhcmUgb21pdHRlZC4nKSxcbiAgICAgICAgICAgICAgICAgICAgcG9zaXRpb246IHRyYW5zZm9ybVBvc2l0aW9uU2NoZW1hLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0xvY2FsIHBvc2l0aW9uLiAyRCBub2RlcyBtYWlubHkgdXNlIHgveTsgM0Qgbm9kZXMgdXNlIHgveS96LicpLFxuICAgICAgICAgICAgICAgICAgICByb3RhdGlvbjogdHJhbnNmb3JtUm90YXRpb25TY2hlbWEub3B0aW9uYWwoKS5kZXNjcmliZSgnTG9jYWwgZXVsZXIgcm90YXRpb24uIDJEIG5vZGVzIG1haW5seSB1c2UgejsgM0Qgbm9kZXMgdXNlIHgveS96LicpLFxuICAgICAgICAgICAgICAgICAgICBzY2FsZTogdHJhbnNmb3JtU2NhbGVTY2hlbWEub3B0aW9uYWwoKS5kZXNjcmliZSgnTG9jYWwgc2NhbGUuIDJEIG5vZGVzIG1haW5seSB1c2UgeC95IGFuZCB1c3VhbGx5IGtlZXAgej0xLicpLFxuICAgICAgICAgICAgICAgIH0pXG4gICAgfSlcbiAgICBhc3luYyBzZXROb2RlVHJhbnNmb3JtKGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGlmIChhcmdzICYmIHR5cGVvZiBhcmdzID09PSAnb2JqZWN0JyAmJiAoJ3JlZmVyZW5jZScgaW4gYXJncyB8fCAndXVpZCcgaW4gYXJncyB8fCAnbm9kZU5hbWUnIGluIGFyZ3MpKSB7XG4gICAgICAgICAgICBjb25zdCByID0gYXdhaXQgcmVzb2x2ZVJlZmVyZW5jZSh7IHJlZmVyZW5jZTogYXJncy5yZWZlcmVuY2UsIG5vZGVVdWlkOiBhcmdzLnV1aWQsIG5vZGVOYW1lOiBhcmdzLm5vZGVOYW1lIH0pO1xuICAgICAgICAgICAgaWYgKCdyZXNwb25zZScgaW4gcikgcmV0dXJuIHIucmVzcG9uc2U7XG4gICAgICAgICAgICBhcmdzID0geyAuLi5hcmdzLCB1dWlkOiByLnV1aWQgfTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCB7IHV1aWQsIHBvc2l0aW9uLCByb3RhdGlvbiwgc2NhbGUgfSA9IGFyZ3M7XG4gICAgICAgIGNvbnN0IHVwZGF0ZVByb21pc2VzOiBQcm9taXNlPGFueT5bXSA9IFtdO1xuICAgICAgICBjb25zdCB1cGRhdGVzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICBjb25zdCB3YXJuaW5nczogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgICAgIFxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIC8vIEZpcnN0IGdldCBub2RlIGluZm8gdG8gZGV0ZXJtaW5lIGlmIGl0J3MgMkQgb3IgM0RcbiAgICAgICAgICAgICAgICBjb25zdCBub2RlSW5mb1Jlc3BvbnNlID0gYXdhaXQgdGhpcy5nZXROb2RlSW5mbyh1dWlkKTtcbiAgICAgICAgICAgICAgICBpZiAoIW5vZGVJbmZvUmVzcG9uc2Uuc3VjY2VzcyB8fCAhbm9kZUluZm9SZXNwb25zZS5kYXRhKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKCdGYWlsZWQgdG8gZ2V0IG5vZGUgaW5mb3JtYXRpb24nKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgY29uc3Qgbm9kZUluZm8gPSBub2RlSW5mb1Jlc3BvbnNlLmRhdGE7XG4gICAgICAgICAgICAgICAgY29uc3QgaXMyRE5vZGUgPSB0aGlzLmlzMkROb2RlKG5vZGVJbmZvKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpZiAocG9zaXRpb24pIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgbm9ybWFsaXplZFBvc2l0aW9uID0gdGhpcy5ub3JtYWxpemVUcmFuc2Zvcm1WYWx1ZShwb3NpdGlvbiwgJ3Bvc2l0aW9uJywgaXMyRE5vZGUpO1xuICAgICAgICAgICAgICAgICAgICBpZiAobm9ybWFsaXplZFBvc2l0aW9uLndhcm5pbmcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdhcm5pbmdzLnB1c2gobm9ybWFsaXplZFBvc2l0aW9uLndhcm5pbmcpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICB1cGRhdGVQcm9taXNlcy5wdXNoKFxuICAgICAgICAgICAgICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnc2V0LXByb3BlcnR5Jywge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IHV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcGF0aDogJ3Bvc2l0aW9uJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkdW1wOiB7IHZhbHVlOiBub3JtYWxpemVkUG9zaXRpb24udmFsdWUgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgICAgdXBkYXRlcy5wdXNoKCdwb3NpdGlvbicpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpZiAocm90YXRpb24pIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgbm9ybWFsaXplZFJvdGF0aW9uID0gdGhpcy5ub3JtYWxpemVUcmFuc2Zvcm1WYWx1ZShyb3RhdGlvbiwgJ3JvdGF0aW9uJywgaXMyRE5vZGUpO1xuICAgICAgICAgICAgICAgICAgICBpZiAobm9ybWFsaXplZFJvdGF0aW9uLndhcm5pbmcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdhcm5pbmdzLnB1c2gobm9ybWFsaXplZFJvdGF0aW9uLndhcm5pbmcpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICB1cGRhdGVQcm9taXNlcy5wdXNoKFxuICAgICAgICAgICAgICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnc2V0LXByb3BlcnR5Jywge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IHV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcGF0aDogJ3JvdGF0aW9uJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkdW1wOiB7IHZhbHVlOiBub3JtYWxpemVkUm90YXRpb24udmFsdWUgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgICAgdXBkYXRlcy5wdXNoKCdyb3RhdGlvbicpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpZiAoc2NhbGUpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgbm9ybWFsaXplZFNjYWxlID0gdGhpcy5ub3JtYWxpemVUcmFuc2Zvcm1WYWx1ZShzY2FsZSwgJ3NjYWxlJywgaXMyRE5vZGUpO1xuICAgICAgICAgICAgICAgICAgICBpZiAobm9ybWFsaXplZFNjYWxlLndhcm5pbmcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdhcm5pbmdzLnB1c2gobm9ybWFsaXplZFNjYWxlLndhcm5pbmcpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICB1cGRhdGVQcm9taXNlcy5wdXNoKFxuICAgICAgICAgICAgICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnc2V0LXByb3BlcnR5Jywge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IHV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcGF0aDogJ3NjYWxlJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkdW1wOiB7IHZhbHVlOiBub3JtYWxpemVkU2NhbGUudmFsdWUgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgICAgdXBkYXRlcy5wdXNoKCdzY2FsZScpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpZiAodXBkYXRlUHJvbWlzZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKCdObyB0cmFuc2Zvcm0gcHJvcGVydGllcyBzcGVjaWZpZWQnKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgYXdhaXQgUHJvbWlzZS5hbGwodXBkYXRlUHJvbWlzZXMpO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIC8vIFZlcmlmeSB0aGUgY2hhbmdlcyBieSBnZXR0aW5nIHVwZGF0ZWQgbm9kZSBpbmZvXG4gICAgICAgICAgICAgICAgY29uc3QgdXBkYXRlZE5vZGVJbmZvID0gYXdhaXQgdGhpcy5nZXROb2RlSW5mbyh1dWlkKTtcbiAgICAgICAgICAgICAgICBjb25zdCByZXNwb25zZTogYW55ID0ge1xuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgVHJhbnNmb3JtIHByb3BlcnRpZXMgdXBkYXRlZDogJHt1cGRhdGVzLmpvaW4oJywgJyl9ICR7aXMyRE5vZGUgPyAnKDJEIG5vZGUpJyA6ICcoM0Qgbm9kZSknfWAsXG4gICAgICAgICAgICAgICAgICAgIHVwZGF0ZWRQcm9wZXJ0aWVzOiB1cGRhdGVzLFxuICAgICAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBub2RlVXVpZDogdXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG5vZGVUeXBlOiBpczJETm9kZSA/ICcyRCcgOiAnM0QnLFxuICAgICAgICAgICAgICAgICAgICAgICAgYXBwbGllZENoYW5nZXM6IHVwZGF0ZXMsXG4gICAgICAgICAgICAgICAgICAgICAgICB0cmFuc2Zvcm1Db25zdHJhaW50czoge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBvc2l0aW9uOiBpczJETm9kZSA/ICd4LCB5IG9ubHkgKHogaWdub3JlZCknIDogJ3gsIHksIHogYWxsIHVzZWQnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJvdGF0aW9uOiBpczJETm9kZSA/ICd6IG9ubHkgKHgsIHkgaWdub3JlZCknIDogJ3gsIHksIHogYWxsIHVzZWQnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNjYWxlOiBpczJETm9kZSA/ICd4LCB5IG1haW4sIHogdHlwaWNhbGx5IDEnIDogJ3gsIHksIHogYWxsIHVzZWQnXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIHZlcmlmaWNhdGlvbkRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG5vZGVJbmZvOiB1cGRhdGVkTm9kZUluZm8uZGF0YSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyYW5zZm9ybURldGFpbHM6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBvcmlnaW5hbE5vZGVUeXBlOiBpczJETm9kZSA/ICcyRCcgOiAnM0QnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFwcGxpZWRUcmFuc2Zvcm1zOiB1cGRhdGVzLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpXG4gICAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgYmVmb3JlQWZ0ZXJDb21wYXJpc29uOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYmVmb3JlOiBub2RlSW5mbyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBhZnRlcjogdXBkYXRlZE5vZGVJbmZvLmRhdGFcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaWYgKHdhcm5pbmdzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzcG9uc2Uud2FybmluZyA9IHdhcm5pbmdzLmpvaW4oJzsgJyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIHJldHVybiByZXNwb25zZTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoYEZhaWxlZCB0byB1cGRhdGUgdHJhbnNmb3JtOiAke2Vyci5tZXNzYWdlfWApO1xuICAgICAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgaXMyRE5vZGUobm9kZUluZm86IGFueSk6IGJvb2xlYW4ge1xuICAgICAgICAvLyBDaGVjayBpZiBub2RlIGhhcyAyRC1zcGVjaWZpYyBjb21wb25lbnRzIG9yIGlzIHVuZGVyIENhbnZhc1xuICAgICAgICBjb25zdCBjb21wb25lbnRzID0gbm9kZUluZm8uY29tcG9uZW50cyB8fCBbXTtcbiAgICAgICAgXG4gICAgICAgIC8vIENoZWNrIGZvciBjb21tb24gMkQgY29tcG9uZW50c1xuICAgICAgICBjb25zdCBoYXMyRENvbXBvbmVudHMgPSBjb21wb25lbnRzLnNvbWUoKGNvbXA6IGFueSkgPT4gXG4gICAgICAgICAgICBjb21wLnR5cGUgJiYgaXMyRENvbXBvbmVudFR5cGUoY29tcC50eXBlKVxuICAgICAgICApO1xuICAgICAgICBcbiAgICAgICAgaWYgKGhhczJEQ29tcG9uZW50cykge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vIENoZWNrIGZvciAzRC1zcGVjaWZpYyBjb21wb25lbnRzICBcbiAgICAgICAgY29uc3QgaGFzM0RDb21wb25lbnRzID0gY29tcG9uZW50cy5zb21lKChjb21wOiBhbnkpID0+XG4gICAgICAgICAgICBjb21wLnR5cGUgJiYgaXMzRENvbXBvbmVudFR5cGUoY29tcC50eXBlKVxuICAgICAgICApO1xuICAgICAgICBcbiAgICAgICAgaWYgKGhhczNEQ29tcG9uZW50cykge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAvLyBEZWZhdWx0IGhldXJpc3RpYzogaWYgeiBwb3NpdGlvbiBpcyAwIGFuZCBoYXNuJ3QgYmVlbiBjaGFuZ2VkLCBsaWtlbHkgMkRcbiAgICAgICAgY29uc3QgcG9zaXRpb24gPSBub2RlSW5mby5wb3NpdGlvbjtcbiAgICAgICAgaWYgKHBvc2l0aW9uICYmIE1hdGguYWJzKHBvc2l0aW9uLnopIDwgMC4wMDEpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAvLyBEZWZhdWx0IHRvIDNEIGlmIHVuY2VydGFpblxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBub3JtYWxpemVUcmFuc2Zvcm1WYWx1ZSh2YWx1ZTogYW55LCB0eXBlOiAncG9zaXRpb24nIHwgJ3JvdGF0aW9uJyB8ICdzY2FsZScsIGlzMkQ6IGJvb2xlYW4pOiB7IHZhbHVlOiBhbnksIHdhcm5pbmc/OiBzdHJpbmcgfSB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IHsgLi4udmFsdWUgfTtcbiAgICAgICAgbGV0IHdhcm5pbmc6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICAgICAgXG4gICAgICAgIGlmIChpczJEKSB7XG4gICAgICAgICAgICBzd2l0Y2ggKHR5cGUpIHtcbiAgICAgICAgICAgICAgICBjYXNlICdwb3NpdGlvbic6XG4gICAgICAgICAgICAgICAgICAgIGlmICh2YWx1ZS56ICE9PSB1bmRlZmluZWQgJiYgTWF0aC5hYnModmFsdWUueikgPiAwLjAwMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgd2FybmluZyA9IGAyRCBub2RlOiB6IHBvc2l0aW9uICgke3ZhbHVlLnp9KSBpZ25vcmVkLCBzZXQgdG8gMGA7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQueiA9IDA7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodmFsdWUueiA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQueiA9IDA7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGNhc2UgJ3JvdGF0aW9uJzpcbiAgICAgICAgICAgICAgICAgICAgaWYgKCh2YWx1ZS54ICE9PSB1bmRlZmluZWQgJiYgTWF0aC5hYnModmFsdWUueCkgPiAwLjAwMSkgfHwgXG4gICAgICAgICAgICAgICAgICAgICAgICAodmFsdWUueSAhPT0gdW5kZWZpbmVkICYmIE1hdGguYWJzKHZhbHVlLnkpID4gMC4wMDEpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB3YXJuaW5nID0gYDJEIG5vZGU6IHgseSByb3RhdGlvbnMgaWdub3JlZCwgb25seSB6IHJvdGF0aW9uIGFwcGxpZWRgO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0LnggPSAwO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0LnkgPSAwO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0LnggPSByZXN1bHQueCB8fCAwO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0LnkgPSByZXN1bHQueSB8fCAwO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdC56ID0gcmVzdWx0LnogfHwgMDtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGNhc2UgJ3NjYWxlJzpcbiAgICAgICAgICAgICAgICAgICAgaWYgKHZhbHVlLnogPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0LnogPSAxOyAvLyBEZWZhdWx0IHNjYWxlIGZvciAyRFxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gM0Qgbm9kZSAtIGVuc3VyZSBhbGwgYXhlcyBhcmUgZGVmaW5lZFxuICAgICAgICAgICAgcmVzdWx0LnggPSByZXN1bHQueCAhPT0gdW5kZWZpbmVkID8gcmVzdWx0LnggOiAodHlwZSA9PT0gJ3NjYWxlJyA/IDEgOiAwKTtcbiAgICAgICAgICAgIHJlc3VsdC55ID0gcmVzdWx0LnkgIT09IHVuZGVmaW5lZCA/IHJlc3VsdC55IDogKHR5cGUgPT09ICdzY2FsZScgPyAxIDogMCk7XG4gICAgICAgICAgICByZXN1bHQueiA9IHJlc3VsdC56ICE9PSB1bmRlZmluZWQgPyByZXN1bHQueiA6ICh0eXBlID09PSAnc2NhbGUnID8gMSA6IDApO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICByZXR1cm4geyB2YWx1ZTogcmVzdWx0LCB3YXJuaW5nIH07XG4gICAgfVxuXG4gICAgQG1jcFRvb2woeyBuYW1lOiAnZGVsZXRlX25vZGUnLCB0aXRsZTogJ0RlbGV0ZSBzY2VuZSBub2RlJywgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gRGVsZXRlIGEgbm9kZSBmcm9tIHRoZSBjdXJyZW50IHNjZW5lLiBNdXRhdGVzIHNjZW5lIGFuZCByZW1vdmVzIGNoaWxkcmVuOyB2ZXJpZnkgVVVJRCBmaXJzdC4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ05vZGUgVVVJRCB0byBkZWxldGUuIENoaWxkcmVuIGFyZSByZW1vdmVkIHdpdGggdGhlIG5vZGUuJyksXG4gICAgICAgICAgICAgICAgfSlcbiAgICB9KVxuICAgIGFzeW5jIGRlbGV0ZU5vZGUodXVpZDogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgaWYgKHV1aWQgJiYgdHlwZW9mIHV1aWQgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICB1dWlkID0gdXVpZC51dWlkO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncmVtb3ZlLW5vZGUnLCB7IHV1aWQ6IHV1aWQgfSkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh1bmRlZmluZWQsICdOb2RlIGRlbGV0ZWQgc3VjY2Vzc2Z1bGx5JykpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdtb3ZlX25vZGUnLCB0aXRsZTogJ1JlcGFyZW50IHNjZW5lIG5vZGUnLCBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBSZXBhcmVudCBhIG5vZGUgdW5kZXIgYSBuZXcgcGFyZW50LiBNdXRhdGVzIHNjZW5lOyBjdXJyZW50IGltcGxlbWVudGF0aW9uIGRvZXMgbm90IHByZXNlcnZlIHdvcmxkIHRyYW5zZm9ybS4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIG5vZGVVdWlkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdOb2RlIFVVSUQgdG8gcmVwYXJlbnQuJyksXG4gICAgICAgICAgICAgICAgICAgIG5ld1BhcmVudFV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ05ldyBwYXJlbnQgbm9kZSBVVUlELicpLFxuICAgICAgICAgICAgICAgICAgICBzaWJsaW5nSW5kZXg6IHoubnVtYmVyKCkuZGVmYXVsdCgtMSkuZGVzY3JpYmUoJ1NpYmxpbmcgaW5kZXggdW5kZXIgdGhlIG5ldyBwYXJlbnQuIEN1cnJlbnRseSBhZHZpc29yeTsgbW92ZSB1c2VzIHNldC1wYXJlbnQuJyksXG4gICAgICAgICAgICAgICAgfSlcbiAgICB9KVxuICAgIGFzeW5jIG1vdmVOb2RlKG5vZGVVdWlkOiBhbnksIG5ld1BhcmVudFV1aWQ/OiBzdHJpbmcsIHNpYmxpbmdJbmRleDogbnVtYmVyID0gLTEpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBpZiAobm9kZVV1aWQgJiYgdHlwZW9mIG5vZGVVdWlkID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgbmV3UGFyZW50VXVpZCA9IG5vZGVVdWlkLm5ld1BhcmVudFV1aWQ7XG4gICAgICAgICAgICBzaWJsaW5nSW5kZXggPSBub2RlVXVpZC5zaWJsaW5nSW5kZXg7XG4gICAgICAgICAgICBub2RlVXVpZCA9IG5vZGVVdWlkLm5vZGVVdWlkO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgLy8gVXNlIGNvcnJlY3Qgc2V0LXBhcmVudCBBUEkgaW5zdGVhZCBvZiBtb3ZlLW5vZGVcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3NldC1wYXJlbnQnLCB7XG4gICAgICAgICAgICAgICAgcGFyZW50OiBuZXdQYXJlbnRVdWlkISxcbiAgICAgICAgICAgICAgICB1dWlkczogW25vZGVVdWlkXSxcbiAgICAgICAgICAgICAgICBrZWVwV29ybGRUcmFuc2Zvcm06IGZhbHNlXG4gICAgICAgICAgICB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHVuZGVmaW5lZCwgJ05vZGUgbW92ZWQgc3VjY2Vzc2Z1bGx5JykpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdkdXBsaWNhdGVfbm9kZScsIHRpdGxlOiAnRHVwbGljYXRlIHNjZW5lIG5vZGUnLCBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBEdXBsaWNhdGUgYSBub2RlIGFuZCByZXR1cm4gdGhlIG5ldyBVVUlELiBNdXRhdGVzIHNjZW5lOyBjaGlsZCBpbmNsdXNpb24gZm9sbG93cyBDb2NvcyBkdXBsaWNhdGUtbm9kZSBiZWhhdmlvci4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ05vZGUgVVVJRCB0byBkdXBsaWNhdGUuJyksXG4gICAgICAgICAgICAgICAgICAgIGluY2x1ZGVDaGlsZHJlbjogei5ib29sZWFuKCkuZGVmYXVsdCh0cnVlKS5kZXNjcmliZSgnV2hldGhlciBjaGlsZHJlbiBzaG91bGQgYmUgaW5jbHVkZWQ7IGFjdHVhbCBiZWhhdmlvciBmb2xsb3dzIENvY29zIGR1cGxpY2F0ZS1ub2RlLicpLFxuICAgICAgICAgICAgICAgIH0pXG4gICAgfSlcbiAgICBhc3luYyBkdXBsaWNhdGVOb2RlKHV1aWQ6IGFueSwgaW5jbHVkZUNoaWxkcmVuOiBib29sZWFuID0gdHJ1ZSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGlmICh1dWlkICYmIHR5cGVvZiB1dWlkID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgaW5jbHVkZUNoaWxkcmVuID0gdXVpZC5pbmNsdWRlQ2hpbGRyZW47XG4gICAgICAgICAgICB1dWlkID0gdXVpZC51dWlkO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgLy8gTm90ZTogaW5jbHVkZUNoaWxkcmVuIHBhcmFtZXRlciBpcyBhY2NlcHRlZCBmb3IgZnV0dXJlIHVzZSBidXQgbm90IGN1cnJlbnRseSBpbXBsZW1lbnRlZFxuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnZHVwbGljYXRlLW5vZGUnLCB1dWlkKS50aGVuKChyZXN1bHQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgbmV3VXVpZDogcmVzdWx0LnV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiAnTm9kZSBkdXBsaWNhdGVkIHN1Y2Nlc3NmdWxseSdcbiAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdkZXRlY3Rfbm9kZV90eXBlJywgdGl0bGU6ICdEZXRlY3Qgbm9kZSB0eXBlJywgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gSGV1cmlzdGljYWxseSBjbGFzc2lmeSBhIG5vZGUgYXMgMkQgb3IgM0QgZnJvbSBjb21wb25lbnRzL3RyYW5zZm9ybS4gTm8gbXV0YXRpb247IGhlbHBzIGNob29zZSB0cmFuc2Zvcm0gc2VtYW50aWNzLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgdXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnTm9kZSBVVUlEIHRvIGNsYXNzaWZ5IGFzIDJEIG9yIDNEIGJ5IGhldXJpc3RpYy4nKSxcbiAgICAgICAgICAgICAgICB9KVxuICAgIH0pXG4gICAgYXN5bmMgZGV0ZWN0Tm9kZVR5cGUodXVpZDogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgaWYgKHV1aWQgJiYgdHlwZW9mIHV1aWQgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICB1dWlkID0gdXVpZC51dWlkO1xuICAgICAgICB9XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBub2RlSW5mb1Jlc3BvbnNlID0gYXdhaXQgdGhpcy5nZXROb2RlSW5mbyh1dWlkKTtcbiAgICAgICAgICAgIGlmICghbm9kZUluZm9SZXNwb25zZS5zdWNjZXNzIHx8ICFub2RlSW5mb1Jlc3BvbnNlLmRhdGEpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFpbCgnRmFpbGVkIHRvIGdldCBub2RlIGluZm9ybWF0aW9uJyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IG5vZGVJbmZvID0gbm9kZUluZm9SZXNwb25zZS5kYXRhO1xuICAgICAgICAgICAgY29uc3QgaXMyRCA9IHRoaXMuaXMyRE5vZGUobm9kZUluZm8pO1xuICAgICAgICAgICAgY29uc3QgY29tcG9uZW50cyA9IG5vZGVJbmZvLmNvbXBvbmVudHMgfHwgW107XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgLy8gQ29sbGVjdCBkZXRlY3Rpb24gcmVhc29uc1xuICAgICAgICAgICAgICAgIGNvbnN0IGRldGVjdGlvblJlYXNvbnM6IHN0cmluZ1tdID0gW107XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgLy8gQ2hlY2sgZm9yIDJEIGNvbXBvbmVudHNcbiAgICAgICAgICAgICAgICBjb25zdCB0d29EQ29tcG9uZW50cyA9IGNvbXBvbmVudHMuZmlsdGVyKChjb21wOiBhbnkpID0+IFxuICAgICAgICAgICAgICAgICAgICBjb21wLnR5cGUgJiYgaXMyRENvbXBvbmVudFR5cGUoY29tcC50eXBlKVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgLy8gQ2hlY2sgZm9yIDNEIGNvbXBvbmVudHNcbiAgICAgICAgICAgICAgICBjb25zdCB0aHJlZURDb21wb25lbnRzID0gY29tcG9uZW50cy5maWx0ZXIoKGNvbXA6IGFueSkgPT5cbiAgICAgICAgICAgICAgICAgICAgY29tcC50eXBlICYmIGlzM0RDb21wb25lbnRUeXBlKGNvbXAudHlwZSlcbiAgICAgICAgICAgICAgICApO1xuXG4gICAgICAgICAgICAgICAgaWYgKHR3b0RDb21wb25lbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgZGV0ZWN0aW9uUmVhc29ucy5wdXNoKGBIYXMgMkQgY29tcG9uZW50czogJHt0d29EQ29tcG9uZW50cy5tYXAoKGM6IGFueSkgPT4gYy50eXBlKS5qb2luKCcsICcpfWApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpZiAodGhyZWVEQ29tcG9uZW50cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGRldGVjdGlvblJlYXNvbnMucHVzaChgSGFzIDNEIGNvbXBvbmVudHM6ICR7dGhyZWVEQ29tcG9uZW50cy5tYXAoKGM6IGFueSkgPT4gYy50eXBlKS5qb2luKCcsICcpfWApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAvLyBDaGVjayBwb3NpdGlvbiBmb3IgaGV1cmlzdGljXG4gICAgICAgICAgICAgICAgY29uc3QgcG9zaXRpb24gPSBub2RlSW5mby5wb3NpdGlvbjtcbiAgICAgICAgICAgICAgICBpZiAocG9zaXRpb24gJiYgTWF0aC5hYnMocG9zaXRpb24ueikgPCAwLjAwMSkge1xuICAgICAgICAgICAgICAgICAgICBkZXRlY3Rpb25SZWFzb25zLnB1c2goJ1ogcG9zaXRpb24gaXMgfjAgKGxpa2VseSAyRCknKTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHBvc2l0aW9uICYmIE1hdGguYWJzKHBvc2l0aW9uLnopID4gMC4wMDEpIHtcbiAgICAgICAgICAgICAgICAgICAgZGV0ZWN0aW9uUmVhc29ucy5wdXNoKGBaIHBvc2l0aW9uIGlzICR7cG9zaXRpb24uen0gKGxpa2VseSAzRClgKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoZGV0ZWN0aW9uUmVhc29ucy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgZGV0ZWN0aW9uUmVhc29ucy5wdXNoKCdObyBzcGVjaWZpYyBpbmRpY2F0b3JzIGZvdW5kLCBkZWZhdWx0aW5nIGJhc2VkIG9uIGhldXJpc3RpY3MnKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgICAgIG5vZGVVdWlkOiB1dWlkLFxuICAgICAgICAgICAgICAgICAgICBub2RlTmFtZTogbm9kZUluZm8ubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgbm9kZVR5cGU6IGlzMkQgPyAnMkQnIDogJzNEJyxcbiAgICAgICAgICAgICAgICAgICAgZGV0ZWN0aW9uUmVhc29uczogZGV0ZWN0aW9uUmVhc29ucyxcbiAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50czogY29tcG9uZW50cy5tYXAoKGNvbXA6IGFueSkgPT4gKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6IGNvbXAudHlwZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhdGVnb3J5OiB0aGlzLmdldENvbXBvbmVudENhdGVnb3J5KGNvbXAudHlwZSlcbiAgICAgICAgICAgICAgICAgICAgfSkpLFxuICAgICAgICAgICAgICAgICAgICBwb3NpdGlvbjogbm9kZUluZm8ucG9zaXRpb24sXG4gICAgICAgICAgICAgICAgICAgIHRyYW5zZm9ybUNvbnN0cmFpbnRzOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBwb3NpdGlvbjogaXMyRCA/ICd4LCB5IG9ubHkgKHogaWdub3JlZCknIDogJ3gsIHksIHogYWxsIHVzZWQnLFxuICAgICAgICAgICAgICAgICAgICAgICAgcm90YXRpb246IGlzMkQgPyAneiBvbmx5ICh4LCB5IGlnbm9yZWQpJyA6ICd4LCB5LCB6IGFsbCB1c2VkJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIHNjYWxlOiBpczJEID8gJ3gsIHkgbWFpbiwgeiB0eXBpY2FsbHkgMScgOiAneCwgeSwgeiBhbGwgdXNlZCdcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoYEZhaWxlZCB0byBkZXRlY3Qgbm9kZSB0eXBlOiAke2Vyci5tZXNzYWdlfWApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgQG1jcFRvb2woeyBuYW1lOiAnc2V0X25vZGVfcHJvcGVydGllcycsIHRpdGxlOiAnU2V0IG5vZGUgcHJvcGVydGllcycsIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIEJhdGNoLXNldCBtdWx0aXBsZSBwcm9wZXJ0aWVzIG9uIHRoZSBzYW1lIG5vZGUgaW4gb25lIHRvb2wgY2FsbC4gTXV0YXRlcyBzY2VuZTsgZW50cmllcyBydW4gc2VxdWVudGlhbGx5IGluIGFycmF5IG9yZGVyIHNvIGNvY29zIHVuZG8vc2VyaWFsaXphdGlvbiBzdGF5IGNvaGVyZW50LiBSZXR1cm5zIHBlci1lbnRyeSBzdWNjZXNzL2Vycm9yIHNvIHBhcnRpYWwgZmFpbHVyZXMgYXJlIHZpc2libGUuIER1cGxpY2F0ZSBwYXRocyBhcmUgcmVqZWN0ZWQgdXAtZnJvbnQ7IG92ZXJsYXBwaW5nIHBhdGhzIChlLmcuIHBvc2l0aW9uIHZzIHBvc2l0aW9uLngpIGFyZSB3YXJuZWQuIFVzZSB3aGVuIGNoYW5naW5nIHNldmVyYWwgcHJvcGVydGllcyBvbiB0aGUgc2FtZSBub2RlIGF0IG9uY2UuIEFjY2VwdHMgcmVmZXJlbmNlPXtpZCx0eXBlfSAocHJlZmVycmVkKSwgdXVpZCwgb3Igbm9kZU5hbWUuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICByZWZlcmVuY2U6IGluc3RhbmNlUmVmZXJlbmNlU2NoZW1hLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0luc3RhbmNlUmVmZXJlbmNlIHtpZCx0eXBlfS4gUHJlZmVycmVkIGZvcm0uJyksXG4gICAgICAgICAgICAgICAgICAgIHV1aWQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnTm9kZSBVVUlEIHRvIG1vZGlmeS4gVXNlZCB3aGVuIHJlZmVyZW5jZSBpcyBvbWl0dGVkLicpLFxuICAgICAgICAgICAgICAgICAgICBub2RlTmFtZTogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdOb2RlIG5hbWUgKGRlcHRoLWZpcnN0IGZpcnN0IG1hdGNoKS4gVXNlZCB3aGVuIHJlZmVyZW5jZSBhbmQgdXVpZCBhcmUgb21pdHRlZC4nKSxcbiAgICAgICAgICAgICAgICAgICAgcHJvcGVydGllczogei5hcnJheSh6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgICAgICBwYXRoOiB6LnN0cmluZygpLmRlc2NyaWJlKCdQcm9wZXJ0eSBwYXRoIHBhc3NlZCB0byBzY2VuZS9zZXQtcHJvcGVydHkgKGUuZy4gYWN0aXZlLCBuYW1lLCBsYXllciwgcG9zaXRpb24pLicpLFxuICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWU6IHouYW55KCkuZGVzY3JpYmUoJ1Byb3BlcnR5IHZhbHVlIG1hdGNoaW5nIHRoZSBDb2NvcyBkdW1wIHNoYXBlIGZvciB0aGUgcGF0aC4nKSxcbiAgICAgICAgICAgICAgICAgICAgfSkpLm1pbigxKS5tYXgoNTApLmRlc2NyaWJlKCdQcm9wZXJ0aWVzIHRvIHdyaXRlLiBDYXBwZWQgYXQgNTAgZW50cmllcyBwZXIgY2FsbC4nKSxcbiAgICAgICAgICAgICAgICB9KVxuICAgIH0pXG4gICAgYXN5bmMgc2V0Tm9kZVByb3BlcnRpZXMoYTogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgciA9IGF3YWl0IHJlc29sdmVSZWZlcmVuY2UoeyByZWZlcmVuY2U6IGEucmVmZXJlbmNlLCBub2RlVXVpZDogYS51dWlkLCBub2RlTmFtZTogYS5ub2RlTmFtZSB9KTtcbiAgICAgICAgaWYgKCdyZXNwb25zZScgaW4gcikgcmV0dXJuIHIucmVzcG9uc2U7XG4gICAgICAgIHJldHVybiBiYXRjaFNldFByb3BlcnRpZXMoci51dWlkLCBhLnByb3BlcnRpZXMpO1xuICAgIH1cblxuICAgIHByaXZhdGUgZ2V0Q29tcG9uZW50Q2F0ZWdvcnkoY29tcG9uZW50VHlwZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgICAgICAgaWYgKCFjb21wb25lbnRUeXBlKSByZXR1cm4gJ3Vua25vd24nO1xuICAgICAgICBcbiAgICAgICAgaWYgKGlzMkRDb21wb25lbnRUeXBlKGNvbXBvbmVudFR5cGUpKSB7XG4gICAgICAgICAgICByZXR1cm4gJzJEJztcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgaWYgKGlzM0RDb21wb25lbnRUeXBlKGNvbXBvbmVudFR5cGUpKSB7XG4gICAgICAgICAgICByZXR1cm4gJzNEJztcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgcmV0dXJuICdnZW5lcmljJztcbiAgICB9XG59XG4iXX0=