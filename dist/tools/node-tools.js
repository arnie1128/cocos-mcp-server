"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NodeTools = void 0;
const response_1 = require("../lib/response");
const component_tools_1 = require("./component-tools");
const log_1 = require("../lib/log");
const schema_1 = require("../lib/schema");
const define_tools_1 = require("../lib/define-tools");
const scene_bridge_1 = require("../lib/scene-bridge");
const batch_set_1 = require("../lib/batch-set");
const instance_reference_1 = require("../lib/instance-reference");
// vec3 used by create_node's initialTransform — original schema had no
// per-axis description and no required marker, so axes are plain optional numbers.
const vec3Schema = schema_1.z.object({
    x: schema_1.z.number().optional(),
    y: schema_1.z.number().optional(),
    z: schema_1.z.number().optional(),
});
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
class NodeTools {
    constructor() {
        this.componentTools = new component_tools_1.ComponentTools();
        const defs = [
            { name: 'create_node', title: 'Create scene node', description: '[specialist] Create a node in the current scene. Supports empty, component, or prefab/asset instances; provide parentUuid for predictable placement.',
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
                        position: vec3Schema.optional(),
                        rotation: vec3Schema.optional(),
                        scale: vec3Schema.optional(),
                    }).optional().describe('Initial transform applied after create-node via set_node_transform.'),
                }), handler: a => this.createNode(a) },
            { name: 'get_node_info', title: 'Read node info', description: '[specialist] Read one node by UUID, including transform, children, and component summary. No mutation.',
                inputSchema: schema_1.z.object({
                    uuid: schema_1.z.string().describe('Node UUID to inspect.'),
                }), handler: a => this.getNodeInfo(a.uuid) },
            { name: 'find_nodes', title: 'Find nodes by pattern', description: '[specialist] Search current-scene nodes by name pattern and return multiple matches. No mutation; use when names may be duplicated.',
                inputSchema: schema_1.z.object({
                    pattern: schema_1.z.string().describe('Node name search pattern. Partial match unless exactMatch=true.'),
                    exactMatch: schema_1.z.boolean().default(false).describe('Require exact node name match. Default false.'),
                }), handler: a => this.findNodes(a.pattern, a.exactMatch) },
            { name: 'find_node_by_name', title: 'Find node by name', description: '[specialist] Find the first node with an exact name. No mutation; only safe when the name is unique enough.',
                inputSchema: schema_1.z.object({
                    name: schema_1.z.string().describe('Exact node name to find. Returns the first match only.'),
                }), handler: a => this.findNodeByName(a.name) },
            { name: 'get_all_nodes', title: 'List all nodes', description: '[specialist] List all current-scene nodes with name/uuid/type/path; primary source for nodeUuid/parentUuid.',
                inputSchema: schema_1.z.object({}), handler: () => this.getAllNodes() },
            { name: 'set_node_property', title: 'Set node property', description: '[specialist] Set a node property path. Mutates scene; use for active/name/layer. Prefer set_node_transform for position/rotation/scale. Accepts reference={id,type} (preferred), uuid, or nodeName.',
                inputSchema: schema_1.z.object({
                    reference: instance_reference_1.instanceReferenceSchema.optional().describe('InstanceReference {id,type}. Preferred form — type travels with the id so AI does not lose semantic context.'),
                    uuid: schema_1.z.string().optional().describe('Node UUID to modify. Used when reference is omitted.'),
                    nodeName: schema_1.z.string().optional().describe('Node name (depth-first first match). Used when reference and uuid are omitted.'),
                    property: schema_1.z.string().describe('Node property path, e.g. active, name, layer. Prefer set_node_transform for position/rotation/scale.'),
                    value: schema_1.z.any().describe('Value to write; must match the Cocos dump shape for the property path.'),
                }),
                handler: async (a) => {
                    const r = await (0, instance_reference_1.resolveReference)({ reference: a.reference, nodeUuid: a.uuid, nodeName: a.nodeName });
                    if ('response' in r)
                        return r.response;
                    return this.setNodeProperty(r.uuid, a.property, a.value);
                } },
            { name: 'set_node_transform', title: 'Set node transform', description: '[specialist] Set node position, rotation, or scale with 2D/3D normalization. Mutates scene. Accepts reference={id,type} (preferred), uuid, or nodeName.',
                inputSchema: schema_1.z.object({
                    reference: instance_reference_1.instanceReferenceSchema.optional().describe('InstanceReference {id,type}. Preferred form — type travels with the id so AI does not lose semantic context.'),
                    uuid: schema_1.z.string().optional().describe('Node UUID whose transform should be changed. Used when reference is omitted.'),
                    nodeName: schema_1.z.string().optional().describe('Node name (depth-first first match). Used when reference and uuid are omitted.'),
                    position: transformPositionSchema.optional().describe('Local position. 2D nodes mainly use x/y; 3D nodes use x/y/z.'),
                    rotation: transformRotationSchema.optional().describe('Local euler rotation. 2D nodes mainly use z; 3D nodes use x/y/z.'),
                    scale: transformScaleSchema.optional().describe('Local scale. 2D nodes mainly use x/y and usually keep z=1.'),
                }),
                handler: async (a) => {
                    const r = await (0, instance_reference_1.resolveReference)({ reference: a.reference, nodeUuid: a.uuid, nodeName: a.nodeName });
                    if ('response' in r)
                        return r.response;
                    return this.setNodeTransform(Object.assign(Object.assign({}, a), { uuid: r.uuid }));
                } },
            { name: 'delete_node', title: 'Delete scene node', description: '[specialist] Delete a node from the current scene. Mutates scene and removes children; verify UUID first.',
                inputSchema: schema_1.z.object({
                    uuid: schema_1.z.string().describe('Node UUID to delete. Children are removed with the node.'),
                }), handler: a => this.deleteNode(a.uuid) },
            { name: 'move_node', title: 'Reparent scene node', description: '[specialist] Reparent a node under a new parent. Mutates scene; current implementation does not preserve world transform.',
                inputSchema: schema_1.z.object({
                    nodeUuid: schema_1.z.string().describe('Node UUID to reparent.'),
                    newParentUuid: schema_1.z.string().describe('New parent node UUID.'),
                    siblingIndex: schema_1.z.number().default(-1).describe('Sibling index under the new parent. Currently advisory; move uses set-parent.'),
                }), handler: a => this.moveNode(a.nodeUuid, a.newParentUuid, a.siblingIndex) },
            { name: 'duplicate_node', title: 'Duplicate scene node', description: '[specialist] Duplicate a node and return the new UUID. Mutates scene; child inclusion follows Cocos duplicate-node behavior.',
                inputSchema: schema_1.z.object({
                    uuid: schema_1.z.string().describe('Node UUID to duplicate.'),
                    includeChildren: schema_1.z.boolean().default(true).describe('Whether children should be included; actual behavior follows Cocos duplicate-node.'),
                }), handler: a => this.duplicateNode(a.uuid, a.includeChildren) },
            { name: 'detect_node_type', title: 'Detect node type', description: '[specialist] Heuristically classify a node as 2D or 3D from components/transform. No mutation; helps choose transform semantics.',
                inputSchema: schema_1.z.object({
                    uuid: schema_1.z.string().describe('Node UUID to classify as 2D or 3D by heuristic.'),
                }), handler: a => this.detectNodeType(a.uuid) },
            { name: 'set_node_properties', title: 'Set node properties', description: '[specialist] Batch-set multiple properties on the same node in one tool call. Mutates scene; entries run sequentially in array order so cocos undo/serialization stay coherent. Returns per-entry success/error so partial failures are visible. Duplicate paths are rejected up-front; overlapping paths (e.g. position vs position.x) are warned. Use when changing several properties on the same node at once. Accepts reference={id,type} (preferred), uuid, or nodeName.',
                inputSchema: schema_1.z.object({
                    reference: instance_reference_1.instanceReferenceSchema.optional().describe('InstanceReference {id,type}. Preferred form.'),
                    uuid: schema_1.z.string().optional().describe('Node UUID to modify. Used when reference is omitted.'),
                    nodeName: schema_1.z.string().optional().describe('Node name (depth-first first match). Used when reference and uuid are omitted.'),
                    properties: schema_1.z.array(schema_1.z.object({
                        path: schema_1.z.string().describe('Property path passed to scene/set-property (e.g. active, name, layer, position).'),
                        value: schema_1.z.any().describe('Property value matching the Cocos dump shape for the path.'),
                    })).min(1).max(50).describe('Properties to write. Capped at 50 entries per call.'),
                }),
                handler: async (a) => {
                    const r = await (0, instance_reference_1.resolveReference)({ reference: a.reference, nodeUuid: a.uuid, nodeName: a.nodeName });
                    if ('response' in r)
                        return r.response;
                    return (0, batch_set_1.batchSetProperties)(r.uuid, a.properties);
                } },
        ];
        this.exec = (0, define_tools_1.defineTools)(defs);
    }
    getTools() { return this.exec.getTools(); }
    execute(toolName, args) { return this.exec.execute(toolName, args); }
    async createNode(args) {
        return new Promise(async (resolve) => {
            try {
                let targetParentUuid = args.parentUuid;
                // 如果沒有提供父節點UUID，獲取場景根節點
                if (!targetParentUuid) {
                    try {
                        const sceneInfo = await Editor.Message.request('scene', 'query-node-tree');
                        if (sceneInfo && typeof sceneInfo === 'object' && !Array.isArray(sceneInfo) && Object.prototype.hasOwnProperty.call(sceneInfo, 'uuid')) {
                            targetParentUuid = sceneInfo.uuid;
                            (0, log_1.debugLog)(`No parent specified, using scene root: ${targetParentUuid}`);
                        }
                        else if (Array.isArray(sceneInfo) && sceneInfo.length > 0 && sceneInfo[0].uuid) {
                            targetParentUuid = sceneInfo[0].uuid;
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
                            resolve((0, response_1.fail)(`Asset not found at path: ${args.assetPath}`));
                            return;
                        }
                    }
                    catch (err) {
                        resolve((0, response_1.fail)(`Failed to resolve asset path '${args.assetPath}': ${err}`));
                        return;
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
                                resolve((0, response_1.fail)(`Unknown layer preset '${args.layer}'. Allowed: ${Object.keys(LAYER_PRESETS).join(', ')}, or pass a raw number.`));
                                return;
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
                resolve({
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
                });
            }
            catch (err) {
                resolve((0, response_1.fail)(`Failed to create node: ${err.message}. Args: ${JSON.stringify(args)}`));
            }
        });
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
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'query-node', uuid).then((nodeData) => {
                var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
                if (!nodeData) {
                    resolve((0, response_1.fail)('Node not found or invalid response'));
                    return;
                }
                // 根據實際返回的數據結構解析節點信息
                const info = {
                    uuid: ((_a = nodeData.uuid) === null || _a === void 0 ? void 0 : _a.value) || uuid,
                    name: ((_b = nodeData.name) === null || _b === void 0 ? void 0 : _b.value) || 'Unknown',
                    active: ((_c = nodeData.active) === null || _c === void 0 ? void 0 : _c.value) !== undefined ? nodeData.active.value : true,
                    position: ((_d = nodeData.position) === null || _d === void 0 ? void 0 : _d.value) || { x: 0, y: 0, z: 0 },
                    rotation: ((_e = nodeData.rotation) === null || _e === void 0 ? void 0 : _e.value) || { x: 0, y: 0, z: 0 },
                    scale: ((_f = nodeData.scale) === null || _f === void 0 ? void 0 : _f.value) || { x: 1, y: 1, z: 1 },
                    parent: ((_h = (_g = nodeData.parent) === null || _g === void 0 ? void 0 : _g.value) === null || _h === void 0 ? void 0 : _h.uuid) || null,
                    children: nodeData.children || [],
                    components: (nodeData.__comps__ || []).map((comp) => ({
                        type: comp.__type__ || 'Unknown',
                        enabled: comp.enabled !== undefined ? comp.enabled : true
                    })),
                    layer: ((_j = nodeData.layer) === null || _j === void 0 ? void 0 : _j.value) || 1073741824,
                    mobility: ((_k = nodeData.mobility) === null || _k === void 0 ? void 0 : _k.value) || 0
                };
                resolve((0, response_1.ok)(info));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async findNodes(pattern, exactMatch = false) {
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
        return new Promise(async (resolve) => {
            const { uuid, position, rotation, scale } = args;
            const updatePromises = [];
            const updates = [];
            const warnings = [];
            try {
                // First get node info to determine if it's 2D or 3D
                const nodeInfoResponse = await this.getNodeInfo(uuid);
                if (!nodeInfoResponse.success || !nodeInfoResponse.data) {
                    resolve((0, response_1.fail)('Failed to get node information'));
                    return;
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
                    resolve((0, response_1.fail)('No transform properties specified'));
                    return;
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
                resolve(response);
            }
            catch (err) {
                resolve((0, response_1.fail)(`Failed to update transform: ${err.message}`));
            }
        });
    }
    is2DNode(nodeInfo) {
        // Check if node has 2D-specific components or is under Canvas
        const components = nodeInfo.components || [];
        // Check for common 2D components
        const has2DComponents = components.some((comp) => comp.type && (comp.type.includes('cc.Sprite') ||
            comp.type.includes('cc.Label') ||
            comp.type.includes('cc.Button') ||
            comp.type.includes('cc.Layout') ||
            comp.type.includes('cc.Widget') ||
            comp.type.includes('cc.Mask') ||
            comp.type.includes('cc.Graphics')));
        if (has2DComponents) {
            return true;
        }
        // Check for 3D-specific components  
        const has3DComponents = components.some((comp) => comp.type && (comp.type.includes('cc.MeshRenderer') ||
            comp.type.includes('cc.Camera') ||
            comp.type.includes('cc.Light') ||
            comp.type.includes('cc.DirectionalLight') ||
            comp.type.includes('cc.PointLight') ||
            comp.type.includes('cc.SpotLight')));
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
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'remove-node', { uuid: uuid }).then(() => {
                resolve((0, response_1.ok)(undefined, 'Node deleted successfully'));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async moveNode(nodeUuid, newParentUuid, siblingIndex = -1) {
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
        return new Promise(async (resolve) => {
            try {
                const nodeInfoResponse = await this.getNodeInfo(uuid);
                if (!nodeInfoResponse.success || !nodeInfoResponse.data) {
                    resolve((0, response_1.fail)('Failed to get node information'));
                    return;
                }
                const nodeInfo = nodeInfoResponse.data;
                const is2D = this.is2DNode(nodeInfo);
                const components = nodeInfo.components || [];
                // Collect detection reasons
                const detectionReasons = [];
                // Check for 2D components
                const twoDComponents = components.filter((comp) => comp.type && (comp.type.includes('cc.Sprite') ||
                    comp.type.includes('cc.Label') ||
                    comp.type.includes('cc.Button') ||
                    comp.type.includes('cc.Layout') ||
                    comp.type.includes('cc.Widget') ||
                    comp.type.includes('cc.Mask') ||
                    comp.type.includes('cc.Graphics')));
                // Check for 3D components
                const threeDComponents = components.filter((comp) => comp.type && (comp.type.includes('cc.MeshRenderer') ||
                    comp.type.includes('cc.Camera') ||
                    comp.type.includes('cc.Light') ||
                    comp.type.includes('cc.DirectionalLight') ||
                    comp.type.includes('cc.PointLight') ||
                    comp.type.includes('cc.SpotLight')));
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
                resolve((0, response_1.ok)({
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
                }));
            }
            catch (err) {
                resolve((0, response_1.fail)(`Failed to detect node type: ${err.message}`));
            }
        });
    }
    getComponentCategory(componentType) {
        if (!componentType)
            return 'unknown';
        if (componentType.includes('cc.Sprite') || componentType.includes('cc.Label') ||
            componentType.includes('cc.Button') || componentType.includes('cc.Layout') ||
            componentType.includes('cc.Widget') || componentType.includes('cc.Mask') ||
            componentType.includes('cc.Graphics')) {
            return '2D';
        }
        if (componentType.includes('cc.MeshRenderer') || componentType.includes('cc.Camera') ||
            componentType.includes('cc.Light') || componentType.includes('cc.DirectionalLight') ||
            componentType.includes('cc.PointLight') || componentType.includes('cc.SpotLight')) {
            return '3D';
        }
        return 'generic';
    }
}
exports.NodeTools = NodeTools;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm9kZS10b29scy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NvdXJjZS90b29scy9ub2RlLXRvb2xzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLDhDQUEyQztBQUUzQyx1REFBbUQ7QUFDbkQsb0NBQXNDO0FBQ3RDLDBDQUFrQztBQUNsQyxzREFBMkQ7QUFDM0Qsc0RBQXFEO0FBRXJELGdEQUFzRDtBQUN0RCxrRUFBc0Y7QUFFdEYsdUVBQXVFO0FBQ3ZFLG1GQUFtRjtBQUNuRixNQUFNLFVBQVUsR0FBRyxVQUFDLENBQUMsTUFBTSxDQUFDO0lBQ3hCLENBQUMsRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxFQUFFO0lBQ3hCLENBQUMsRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxFQUFFO0lBQ3hCLENBQUMsRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxFQUFFO0NBQzNCLENBQUMsQ0FBQztBQUVILDJFQUEyRTtBQUMzRSw4RUFBOEU7QUFDOUUsOEJBQThCO0FBQzlCLE1BQU0sYUFBYSxHQUFHO0lBQ2xCLE9BQU8sRUFBRSxVQUFVLEVBQVMsVUFBVTtJQUN0QyxLQUFLLEVBQUUsUUFBUSxFQUFhLFVBQVU7SUFDdEMsV0FBVyxFQUFFLFFBQVEsRUFBTyxVQUFVO0lBQ3RDLEtBQUssRUFBRSxPQUFPLEVBQWMsVUFBVTtJQUN0QyxNQUFNLEVBQUUsT0FBTyxFQUFhLFVBQVU7SUFDdEMsTUFBTSxFQUFFLE9BQU8sRUFBYSxVQUFVO0lBQ3RDLGNBQWMsRUFBRSxPQUFPLEVBQUssVUFBVTtJQUN0QyxRQUFRLEVBQUUsU0FBUyxFQUFTLFVBQVU7Q0FDaEMsQ0FBQztBQUdYLDhFQUE4RTtBQUM5RSxnRkFBZ0Y7QUFDaEYsTUFBTSx1QkFBdUIsR0FBRyxVQUFDLENBQUMsTUFBTSxDQUFDO0lBQ3JDLENBQUMsRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxFQUFF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QSxNQUFBLFFBQVEsQ0FBQyxNQUFNLDBDQUFFLEtBQUssTUFBSyxTQUFTLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJO29CQUMzRSxRQUFRLEVBQUUsQ0FBQSxNQUFBLFFBQVEsQ0FBQyxRQUFRLDBDQUFFLEtBQUssS0FBSSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFO29CQUMxRCxRQUFRLEVBQUUsQ0FBQSxNQUFBLFFBQVEsQ0FBQyxRQUFRLDBDQUFFLEtBQUssS0FBSSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFO29CQUMxRCxLQUFLLEVBQUUsQ0FBQSxNQUFBLFFBQVEsQ0FBQyxLQUFLLDBDQUFFLEtBQUssS0FBSSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFO29CQUNwRCxNQUFNLEVBQUUsQ0FBQSxNQUFBLE1BQUEsUUFBUSxDQUFDLE1BQU0sMENBQUUsS0FBSywwQ0FBRSxJQUFJLEtBQUksSUFBSTtvQkFDNUMsUUFBUSxFQUFFLFFBQVEsQ0FBQyxRQUFRLElBQUksRUFBRTtvQkFDakMsVUFBVSxFQUFFLENBQUMsUUFBUSxDQUFDLFNBQVMsSUFBSSxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFTLEVBQUUsRUFBRSxDQUFDLENBQUM7d0JBQ3ZELElBQUksRUFBRSxJQUFJLENBQUMsUUFBUSxJQUFJLFNBQVM7d0JBQ2hDLE9BQU8sRUFBRSxJQUFJLENBQUMsT0FBTyxLQUFLLFNBQVMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsSUFBSTtxQkFDNUQsQ0FBQyxDQUFDO29CQUNILEtBQUssRUFBRSxDQUFBLE1BQUEsUUFBUSxDQUFDLEtBQUssMENBQUUsS0FBSyxLQUFJLFVB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QUFDO1lBQ25GLGFBQWEsQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLElBQUksYUFBYSxDQUFDLFFBQVEsQ0FBQyxjQUFjLENBQUMsRUFBRSxDQUFDO1lBQ3BGLE9BQU8sSUFBSSxDQUFDO1FBQ2hCLENBQUM7UUFFRCxPQUFPLFNBQVMsQ0FBQztJQUNyQixDQUFDO0NBQ0o7QUExNUJELDhCQTA1QkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBvaywgZmFpbCB9IGZyb20gJy4uL2xpYi9yZXNwb25zZSc7XG5pbXBvcnQgeyBUb29sRGVmaW5pdGlvbiwgVG9vbFJlc3BvbnNlLCBUb29sRXhlY3V0b3IsIE5vZGVJbmZvIH0gZnJvbSAnLi4vdHlwZXMnO1xuaW1wb3J0IHsgQ29tcG9uZW50VG9vbHMgfSBmcm9tICcuL2NvbXBvbmVudC10b29scyc7XG5pbXBvcnQgeyBkZWJ1Z0xvZyB9IGZyb20gJy4uL2xpYi9sb2cnO1xuaW1wb3J0IHsgeiB9IGZyb20gJy4uL2xpYi9zY2hlbWEnO1xuaW1wb3J0IHsgZGVmaW5lVG9vbHMsIFRvb2xEZWYgfSBmcm9tICcuLi9saWIvZGVmaW5lLXRvb2xzJztcbmltcG9ydCB7IHJ1blNjZW5lTWV0aG9kIH0gZnJvbSAnLi4vbGliL3NjZW5lLWJyaWRnZSc7XG5pbXBvcnQgeyByZXNvbHZlT3JUb29sRXJyb3IgfSBmcm9tICcuLi9saWIvcmVzb2x2ZS1ub2RlJztcbmltcG9ydCB7IGJhdGNoU2V0UHJvcGVydGllcyB9IGZyb20gJy4uL2xpYi9iYXRjaC1zZXQnO1xuaW1wb3J0IHsgaW5zdGFuY2VSZWZlcmVuY2VTY2hlbWEsIHJlc29sdmVSZWZlcmVuY2UgfSBmcm9tICcuLi9saWIvaW5zdGFuY2UtcmVmZXJlbmNlJztcblxuLy8gdmVjMyB1c2VkIGJ5IGNyZWF0ZV9ub2RlJ3MgaW5pdGlhbFRyYW5zZm9ybSDigJQgb3JpZ2luYWwgc2NoZW1hIGhhZCBub1xuLy8gcGVyLWF4aXMgZGVzY3JpcHRpb24gYW5kIG5vIHJlcXVpcmVkIG1hcmtlciwgc28gYXhlcyBhcmUgcGxhaW4gb3B0aW9uYWwgbnVtYmVycy5cbmNvbnN0IHZlYzNTY2hlbWEgPSB6Lm9iamVjdCh7XG4gICAgeDogei5udW1iZXIoKS5vcHRpb25hbCgpLFxuICAgIHk6IHoubnVtYmVyKCkub3B0aW9uYWwoKSxcbiAgICB6OiB6Lm51bWJlcigpLm9wdGlvbmFsKCksXG59KTtcblxuLy8gU3RhbmRhcmQgY2MuTGF5ZXJzIGJpdCB2YWx1ZXMuIEN1c3RvbSB1c2VyLWRlZmluZWQgbGF5ZXJzIGdvIHRocm91Z2ggdGhlXG4vLyBudW1lcmljIGJyYW5jaCBvZiB0aGUgY3JlYXRlX25vZGUgYGxheWVyYCBhcmcsIHNvIHRoaXMgbGlzdCBvbmx5IGVudW1lcmF0ZXNcbi8vIHRoZSBlbmdpbmUtc2hpcHBlZCBwcmVzZXRzLlxuY29uc3QgTEFZRVJfUFJFU0VUUyA9IHtcbiAgICBERUZBVUxUOiAxMDczNzQxODI0LCAgICAgICAgLy8gMSA8PCAzMFxuICAgIFVJXzJEOiAzMzU1NDQzMiwgICAgICAgICAgICAvLyAxIDw8IDI1XG4gICAgU0NFTkVfR0laTU86IDE2Nzc3MjE2LCAgICAgIC8vIDEgPDwgMjRcbiAgICBVSV8zRDogODM4ODYwOCwgICAgICAgICAgICAgLy8gMSA8PCAyM1xuICAgIEVESVRPUjogNDE5NDMwNCwgICAgICAgICAgICAvLyAxIDw8IDIyXG4gICAgR0laTU9TOiAyMDk3MTUyLCAgICAgICAgICAgIC8vIDEgPDwgMjFcbiAgICBJR05PUkVfUkFZQ0FTVDogMTA0ODU3NiwgICAgLy8gMSA8PCAyMFxuICAgIFBST0ZJTEVSOiAyNjg0MzU0NTYsICAgICAgICAvLyAxIDw8IDI4XG59IGFzIGNvbnN0O1xudHlwZSBMYXllclByZXNldCA9IGtleW9mIHR5cGVvZiBMQVlFUl9QUkVTRVRTO1xuXG4vLyBzZXRfbm9kZV90cmFuc2Zvcm0gaGFzIGF4aXMtc3BlY2lmaWMgZGVzY3JpcHRpb25zIHBlciBjaGFubmVsOyByZWJ1aWxkIGVhY2hcbi8vIGlubGluZSBzbyB0aGUgcGVyLWF4aXMgdGV4dCBtYXRjaGVzIHRoZSBvcmlnaW5hbCBoYW5kLXdyaXR0ZW4gc2NoZW1hIGV4YWN0bHkuXG5jb25zdCB0cmFuc2Zvcm1Qb3NpdGlvblNjaGVtYSA9IHoub2JqZWN0KHtcbiAgICB4OiB6Lm51bWJlcigpLm9wdGlvbmFsKCksXG4gICAgeTogei5udW1iZXIoKS5vcHRpb25hbCgpLFxuICAgIHo6IHoubnVtYmVyKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnWiBjb29yZGluYXRlLiBJZ25vcmVkL25vcm1hbGl6ZWQgZm9yIDJEIG5vZGVzLicpLFxufSk7XG5cbmNvbnN0IHRyYW5zZm9ybVJvdGF0aW9uU2NoZW1hID0gei5vYmplY3Qoe1xuICAgIHg6IHoubnVtYmVyKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnWCBldWxlciByb3RhdGlvbi4gSWdub3JlZC9ub3JtYWxpemVkIGZvciAyRCBub2Rlcy4nKSxcbiAgICB5OiB6Lm51bWJlcigpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1kgZXVsZXIgcm90YXRpb24uIElnbm9yZWQvbm9ybWFsaXplZCBmb3IgMkQgbm9kZXMuJyksXG4gICAgejogei5udW1iZXIoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdaIGV1bGVyIHJvdGF0aW9uLiBNYWluIHJvdGF0aW9uIGF4aXMgZm9yIDJEIG5vZGVzLicpLFxufSk7XG5cbmNvbnN0IHRyYW5zZm9ybVNjYWxlU2NoZW1hID0gei5vYmplY3Qoe1xuICAgIHg6IHoubnVtYmVyKCkub3B0aW9uYWwoKSxcbiAgICB5OiB6Lm51bWJlcigpLm9wdGlvbmFsKCksXG4gICAgejogei5udW1iZXIoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdaIHNjYWxlLiBVc3VhbGx5IDEgZm9yIDJEIG5vZGVzLicpLFxufSk7XG5cbmV4cG9ydCBjbGFzcyBOb2RlVG9vbHMgaW1wbGVtZW50cyBUb29sRXhlY3V0b3Ige1xuICAgIHByaXZhdGUgY29tcG9uZW50VG9vbHMgPSBuZXcgQ29tcG9uZW50VG9vbHMoKTtcbiAgICBwcml2YXRlIHJlYWRvbmx5IGV4ZWM6IFRvb2xFeGVjdXRvcjtcblxuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICBjb25zdCBkZWZzOiBUb29sRGVmW10gPSBbXG4gICAgICAgICAgICB7IG5hbWU6ICdjcmVhdGVfbm9kZScsIHRpdGxlOiAnQ3JlYXRlIHNjZW5lIG5vZGUnLCBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBDcmVhdGUgYSBub2RlIGluIHRoZSBjdXJyZW50IHNjZW5lLiBTdXBwb3J0cyBlbXB0eSwgY29tcG9uZW50LCBvciBwcmVmYWIvYXNzZXQgaW5zdGFuY2VzOyBwcm92aWRlIHBhcmVudFV1aWQgZm9yIHByZWRpY3RhYmxlIHBsYWNlbWVudC4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIG5hbWU6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ05ldyBub2RlIG5hbWUuIFRoZSByZXNwb25zZSByZXR1cm5zIHRoZSBjcmVhdGVkIFVVSUQuJyksXG4gICAgICAgICAgICAgICAgICAgIHBhcmVudFV1aWQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnUGFyZW50IG5vZGUgVVVJRC4gU3Ryb25nbHkgcmVjb21tZW5kZWQ7IG9taXQgb25seSB3aGVuIGNyZWF0aW5nIGF0IHNjZW5lIHJvb3QuJyksXG4gICAgICAgICAgICAgICAgICAgIG5vZGVUeXBlOiB6LmVudW0oWydOb2RlJywgJzJETm9kZScsICczRE5vZGUnXSkuZGVmYXVsdCgnTm9kZScpLmRlc2NyaWJlKCdFbXB0eS1ub2RlIHR5cGUgaGludC4gVXN1YWxseSB1bm5lY2Vzc2FyeSB3aGVuIGluc3RhbnRpYXRpbmcgZnJvbSBhc3NldFV1aWQvYXNzZXRQYXRoLicpLFxuICAgICAgICAgICAgICAgICAgICBzaWJsaW5nSW5kZXg6IHoubnVtYmVyKCkuZGVmYXVsdCgtMSkuZGVzY3JpYmUoJ1NpYmxpbmcgaW5kZXggdW5kZXIgdGhlIHBhcmVudC4gLTEgbWVhbnMgYXBwZW5kLicpLFxuICAgICAgICAgICAgICAgICAgICBhc3NldFV1aWQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnQXNzZXQgVVVJRCB0byBpbnN0YW50aWF0ZSBmcm9tLCBlLmcuIHByZWZhYiBVVUlELiBDcmVhdGVzIGFuIGFzc2V0IGluc3RhbmNlIGluc3RlYWQgb2YgYW4gZW1wdHkgbm9kZS4nKSxcbiAgICAgICAgICAgICAgICAgICAgYXNzZXRQYXRoOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ2RiOi8vIGFzc2V0IHBhdGggdG8gaW5zdGFudGlhdGUgZnJvbS4gQWx0ZXJuYXRpdmUgdG8gYXNzZXRVdWlkOyByZXNvbHZlZCBiZWZvcmUgY3JlYXRlLW5vZGUuJyksXG4gICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudHM6IHouYXJyYXkoei5zdHJpbmcoKSkub3B0aW9uYWwoKS5kZXNjcmliZSgnQ29tcG9uZW50IHR5cGVzIHRvIGFkZCBhZnRlciBjcmVhdGlvbiwgZS5nLiBbXCJjYy5TcHJpdGVcIixcImNjLkJ1dHRvblwiXS4nKSxcbiAgICAgICAgICAgICAgICAgICAgdW5saW5rUHJlZmFiOiB6LmJvb2xlYW4oKS5kZWZhdWx0KGZhbHNlKS5kZXNjcmliZSgnV2hlbiBpbnN0YW50aWF0aW5nIGEgcHJlZmFiLCBpbW1lZGlhdGVseSB1bmxpbmsgaXQgaW50byBhIHJlZ3VsYXIgbm9kZS4gRGVmYXVsdCBmYWxzZSBwcmVzZXJ2ZXMgcHJlZmFiIGxpbmsuJyksXG4gICAgICAgICAgICAgICAgICAgIGtlZXBXb3JsZFRyYW5zZm9ybTogei5ib29sZWFuKCkuZGVmYXVsdChmYWxzZSkuZGVzY3JpYmUoJ1ByZXNlcnZlIHdvcmxkIHRyYW5zZm9ybSB3aGlsZSBwYXJlbnRpbmcvY3JlYXRpbmcgd2hlbiBDb2NvcyBzdXBwb3J0cyBpdC4nKSxcbiAgICAgICAgICAgICAgICAgICAgbGF5ZXI6IHoudW5pb24oW1xuICAgICAgICAgICAgICAgICAgICAgICAgei5lbnVtKFsnREVGQVVMVCcsICdVSV8yRCcsICdVSV8zRCcsICdTQ0VORV9HSVpNTycsICdFRElUT1InLCAnR0laTU9TJywgJ0lHTk9SRV9SQVlDQVNUJywgJ1BST0ZJTEVSJ10pLFxuICAgICAgICAgICAgICAgICAgICAgICAgei5udW1iZXIoKS5pbnQoKS5ub25uZWdhdGl2ZSgpLFxuICAgICAgICAgICAgICAgICAgICBdKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdOb2RlIGxheWVyIChjYy5MYXllcnMpLiBBY2NlcHRzIHByZXNldCBuYW1lIChlLmcuIFwiVUlfMkRcIikgb3IgcmF3IGJpdG1hc2sgbnVtYmVyLiBJZiBvbWl0dGVkOiBhdXRvLWRldGVjdGVkIOKAlCBVSV8yRCB3aGVuIGFueSBhbmNlc3RvciBoYXMgY2MuQ2FudmFzIChzbyBVSSBjYW1lcmEgcmVuZGVycyB0aGUgbmV3IG5vZGUpLCBvdGhlcndpc2UgbGVhdmVzIHRoZSBjcmVhdGUtbm9kZSBkZWZhdWx0IChERUZBVUxUKS4gUmVxdWlyZWQgZm9yIFVJIG5vZGVzIHVuZGVyIENhbnZhczsgd2l0aG91dCBpdCB0aGUgbm9kZSBpcyBpbnZpc2libGUgdG8gdGhlIFVJIGNhbWVyYS4nKSxcbiAgICAgICAgICAgICAgICAgICAgaW5pdGlhbFRyYW5zZm9ybTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICAgICAgcG9zaXRpb246IHZlYzNTY2hlbWEub3B0aW9uYWwoKSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHJvdGF0aW9uOiB2ZWMzU2NoZW1hLm9wdGlvbmFsKCksXG4gICAgICAgICAgICAgICAgICAgICAgICBzY2FsZTogdmVjM1NjaGVtYS5vcHRpb25hbCgpLFxuICAgICAgICAgICAgICAgICAgICB9KS5vcHRpb25hbCgpLmRlc2NyaWJlKCdJbml0aWFsIHRyYW5zZm9ybSBhcHBsaWVkIGFmdGVyIGNyZWF0ZS1ub2RlIHZpYSBzZXRfbm9kZV90cmFuc2Zvcm0uJyksXG4gICAgICAgICAgICAgICAgfSksIGhhbmRsZXI6IGEgPT4gdGhpcy5jcmVhdGVOb2RlKGEpIH0sXG4gICAgICAgICAgICB7IG5hbWU6ICdnZXRfbm9kZV9pbmZvJywgdGl0bGU6ICdSZWFkIG5vZGUgaW5mbycsIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFJlYWQgb25lIG5vZGUgYnkgVVVJRCwgaW5jbHVkaW5nIHRyYW5zZm9ybSwgY2hpbGRyZW4sIGFuZCBjb21wb25lbnQgc3VtbWFyeS4gTm8gbXV0YXRpb24uJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICB1dWlkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdOb2RlIFVVSUQgdG8gaW5zcGVjdC4nKSxcbiAgICAgICAgICAgICAgICB9KSwgaGFuZGxlcjogYSA9PiB0aGlzLmdldE5vZGVJbmZvKGEudXVpZCkgfSxcbiAgICAgICAgICAgIHsgbmFtZTogJ2ZpbmRfbm9kZXMnLCB0aXRsZTogJ0ZpbmQgbm9kZXMgYnkgcGF0dGVybicsIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFNlYXJjaCBjdXJyZW50LXNjZW5lIG5vZGVzIGJ5IG5hbWUgcGF0dGVybiBhbmQgcmV0dXJuIG11bHRpcGxlIG1hdGNoZXMuIE5vIG11dGF0aW9uOyB1c2Ugd2hlbiBuYW1lcyBtYXkgYmUgZHVwbGljYXRlZC4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHBhdHRlcm46IHouc3RyaW5nKCkuZGVzY3JpYmUoJ05vZGUgbmFtZSBzZWFyY2ggcGF0dGVybi4gUGFydGlhbCBtYXRjaCB1bmxlc3MgZXhhY3RNYXRjaD10cnVlLicpLFxuICAgICAgICAgICAgICAgICAgICBleGFjdE1hdGNoOiB6LmJvb2xlYW4oKS5kZWZhdWx0KGZhbHNlKS5kZXNjcmliZSgnUmVxdWlyZSBleGFjdCBub2RlIG5hbWUgbWF0Y2guIERlZmF1bHQgZmFsc2UuJyksXG4gICAgICAgICAgICAgICAgfSksIGhhbmRsZXI6IGEgPT4gdGhpcy5maW5kTm9kZXMoYS5wYXR0ZXJuLCBhLmV4YWN0TWF0Y2gpIH0sXG4gICAgICAgICAgICB7IG5hbWU6ICdmaW5kX25vZGVfYnlfbmFtZScsIHRpdGxlOiAnRmluZCBub2RlIGJ5IG5hbWUnLCBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBGaW5kIHRoZSBmaXJzdCBub2RlIHdpdGggYW4gZXhhY3QgbmFtZS4gTm8gbXV0YXRpb247IG9ubHkgc2FmZSB3aGVuIHRoZSBuYW1lIGlzIHVuaXF1ZSBlbm91Z2guJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBuYW1lOiB6LnN0cmluZygpLmRlc2NyaWJlKCdFeGFjdCBub2RlIG5hbWUgdG8gZmluZC4gUmV0dXJucyB0aGUgZmlyc3QgbWF0Y2ggb25seS4nKSxcbiAgICAgICAgICAgICAgICB9KSwgaGFuZGxlcjogYSA9PiB0aGlzLmZpbmROb2RlQnlOYW1lKGEubmFtZSkgfSxcbiAgICAgICAgICAgIHsgbmFtZTogJ2dldF9hbGxfbm9kZXMnLCB0aXRsZTogJ0xpc3QgYWxsIG5vZGVzJywgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gTGlzdCBhbGwgY3VycmVudC1zY2VuZSBub2RlcyB3aXRoIG5hbWUvdXVpZC90eXBlL3BhdGg7IHByaW1hcnkgc291cmNlIGZvciBub2RlVXVpZC9wYXJlbnRVdWlkLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSwgaGFuZGxlcjogKCkgPT4gdGhpcy5nZXRBbGxOb2RlcygpIH0sXG4gICAgICAgICAgICB7IG5hbWU6ICdzZXRfbm9kZV9wcm9wZXJ0eScsIHRpdGxlOiAnU2V0IG5vZGUgcHJvcGVydHknLCBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBTZXQgYSBub2RlIHByb3BlcnR5IHBhdGguIE11dGF0ZXMgc2NlbmU7IHVzZSBmb3IgYWN0aXZlL25hbWUvbGF5ZXIuIFByZWZlciBzZXRfbm9kZV90cmFuc2Zvcm0gZm9yIHBvc2l0aW9uL3JvdGF0aW9uL3NjYWxlLiBBY2NlcHRzIHJlZmVyZW5jZT17aWQsdHlwZX0gKHByZWZlcnJlZCksIHV1aWQsIG9yIG5vZGVOYW1lLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgcmVmZXJlbmNlOiBpbnN0YW5jZVJlZmVyZW5jZVNjaGVtYS5vcHRpb25hbCgpLmRlc2NyaWJlKCdJbnN0YW5jZVJlZmVyZW5jZSB7aWQsdHlwZX0uIFByZWZlcnJlZCBmb3JtIOKAlCB0eXBlIHRyYXZlbHMgd2l0aCB0aGUgaWQgc28gQUkgZG9lcyBub3QgbG9zZSBzZW1hbnRpYyBjb250ZXh0LicpLFxuICAgICAgICAgICAgICAgICAgICB1dWlkOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ05vZGUgVVVJRCB0byBtb2RpZnkuIFVzZWQgd2hlbiByZWZlcmVuY2UgaXMgb21pdHRlZC4nKSxcbiAgICAgICAgICAgICAgICAgICAgbm9kZU5hbWU6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnTm9kZSBuYW1lIChkZXB0aC1maXJzdCBmaXJzdCBtYXRjaCkuIFVzZWQgd2hlbiByZWZlcmVuY2UgYW5kIHV1aWQgYXJlIG9taXR0ZWQuJyksXG4gICAgICAgICAgICAgICAgICAgIHByb3BlcnR5OiB6LnN0cmluZygpLmRlc2NyaWJlKCdOb2RlIHByb3BlcnR5IHBhdGgsIGUuZy4gYWN0aXZlLCBuYW1lLCBsYXllci4gUHJlZmVyIHNldF9ub2RlX3RyYW5zZm9ybSBmb3IgcG9zaXRpb24vcm90YXRpb24vc2NhbGUuJyksXG4gICAgICAgICAgICAgICAgICAgIHZhbHVlOiB6LmFueSgpLmRlc2NyaWJlKCdWYWx1ZSB0byB3cml0ZTsgbXVzdCBtYXRjaCB0aGUgQ29jb3MgZHVtcCBzaGFwZSBmb3IgdGhlIHByb3BlcnR5IHBhdGguJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYXN5bmMgYSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHIgPSBhd2FpdCByZXNvbHZlUmVmZXJlbmNlKHsgcmVmZXJlbmNlOiBhLnJlZmVyZW5jZSwgbm9kZVV1aWQ6IGEudXVpZCwgbm9kZU5hbWU6IGEubm9kZU5hbWUgfSk7XG4gICAgICAgICAgICAgICAgICAgIGlmICgncmVzcG9uc2UnIGluIHIpIHJldHVybiByLnJlc3BvbnNlO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5zZXROb2RlUHJvcGVydHkoci51dWlkLCBhLnByb3BlcnR5LCBhLnZhbHVlKTtcbiAgICAgICAgICAgICAgICB9IH0sXG4gICAgICAgICAgICB7IG5hbWU6ICdzZXRfbm9kZV90cmFuc2Zvcm0nLCB0aXRsZTogJ1NldCBub2RlIHRyYW5zZm9ybScsIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFNldCBub2RlIHBvc2l0aW9uLCByb3RhdGlvbiwgb3Igc2NhbGUgd2l0aCAyRC8zRCBub3JtYWxpemF0aW9uLiBNdXRhdGVzIHNjZW5lLiBBY2NlcHRzIHJlZmVyZW5jZT17aWQsdHlwZX0gKHByZWZlcnJlZCksIHV1aWQsIG9yIG5vZGVOYW1lLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgcmVmZXJlbmNlOiBpbnN0YW5jZVJlZmVyZW5jZVNjaGVtYS5vcHRpb25hbCgpLmRlc2NyaWJlKCdJbnN0YW5jZVJlZmVyZW5jZSB7aWQsdHlwZX0uIFByZWZlcnJlZCBmb3JtIOKAlCB0eXBlIHRyYXZlbHMgd2l0aCB0aGUgaWQgc28gQUkgZG9lcyBub3QgbG9zZSBzZW1hbnRpYyBjb250ZXh0LicpLFxuICAgICAgICAgICAgICAgICAgICB1dWlkOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ05vZGUgVVVJRCB3aG9zZSB0cmFuc2Zvcm0gc2hvdWxkIGJlIGNoYW5nZWQuIFVzZWQgd2hlbiByZWZlcmVuY2UgaXMgb21pdHRlZC4nKSxcbiAgICAgICAgICAgICAgICAgICAgbm9kZU5hbWU6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnTm9kZSBuYW1lIChkZXB0aC1maXJzdCBmaXJzdCBtYXRjaCkuIFVzZWQgd2hlbiByZWZlcmVuY2UgYW5kIHV1aWQgYXJlIG9taXR0ZWQuJyksXG4gICAgICAgICAgICAgICAgICAgIHBvc2l0aW9uOiB0cmFuc2Zvcm1Qb3NpdGlvblNjaGVtYS5vcHRpb25hbCgpLmRlc2NyaWJlKCdMb2NhbCBwb3NpdGlvbi4gMkQgbm9kZXMgbWFpbmx5IHVzZSB4L3k7IDNEIG5vZGVzIHVzZSB4L3kvei4nKSxcbiAgICAgICAgICAgICAgICAgICAgcm90YXRpb246IHRyYW5zZm9ybVJvdGF0aW9uU2NoZW1hLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0xvY2FsIGV1bGVyIHJvdGF0aW9uLiAyRCBub2RlcyBtYWlubHkgdXNlIHo7IDNEIG5vZGVzIHVzZSB4L3kvei4nKSxcbiAgICAgICAgICAgICAgICAgICAgc2NhbGU6IHRyYW5zZm9ybVNjYWxlU2NoZW1hLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0xvY2FsIHNjYWxlLiAyRCBub2RlcyBtYWlubHkgdXNlIHgveSBhbmQgdXN1YWxseSBrZWVwIHo9MS4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhc3luYyBhID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgciA9IGF3YWl0IHJlc29sdmVSZWZlcmVuY2UoeyByZWZlcmVuY2U6IGEucmVmZXJlbmNlLCBub2RlVXVpZDogYS51dWlkLCBub2RlTmFtZTogYS5ub2RlTmFtZSB9KTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCdyZXNwb25zZScgaW4gcikgcmV0dXJuIHIucmVzcG9uc2U7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLnNldE5vZGVUcmFuc2Zvcm0oeyAuLi5hLCB1dWlkOiByLnV1aWQgfSk7XG4gICAgICAgICAgICAgICAgfSB9LFxuICAgICAgICAgICAgeyBuYW1lOiAnZGVsZXRlX25vZGUnLCB0aXRsZTogJ0RlbGV0ZSBzY2VuZSBub2RlJywgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gRGVsZXRlIGEgbm9kZSBmcm9tIHRoZSBjdXJyZW50IHNjZW5lLiBNdXRhdGVzIHNjZW5lIGFuZCByZW1vdmVzIGNoaWxkcmVuOyB2ZXJpZnkgVVVJRCBmaXJzdC4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ05vZGUgVVVJRCB0byBkZWxldGUuIENoaWxkcmVuIGFyZSByZW1vdmVkIHdpdGggdGhlIG5vZGUuJyksXG4gICAgICAgICAgICAgICAgfSksIGhhbmRsZXI6IGEgPT4gdGhpcy5kZWxldGVOb2RlKGEudXVpZCkgfSxcbiAgICAgICAgICAgIHsgbmFtZTogJ21vdmVfbm9kZScsIHRpdGxlOiAnUmVwYXJlbnQgc2NlbmUgbm9kZScsIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFJlcGFyZW50IGEgbm9kZSB1bmRlciBhIG5ldyBwYXJlbnQuIE11dGF0ZXMgc2NlbmU7IGN1cnJlbnQgaW1wbGVtZW50YXRpb24gZG9lcyBub3QgcHJlc2VydmUgd29ybGQgdHJhbnNmb3JtLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ05vZGUgVVVJRCB0byByZXBhcmVudC4nKSxcbiAgICAgICAgICAgICAgICAgICAgbmV3UGFyZW50VXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnTmV3IHBhcmVudCBub2RlIFVVSUQuJyksXG4gICAgICAgICAgICAgICAgICAgIHNpYmxpbmdJbmRleDogei5udW1iZXIoKS5kZWZhdWx0KC0xKS5kZXNjcmliZSgnU2libGluZyBpbmRleCB1bmRlciB0aGUgbmV3IHBhcmVudC4gQ3VycmVudGx5IGFkdmlzb3J5OyBtb3ZlIHVzZXMgc2V0LXBhcmVudC4nKSxcbiAgICAgICAgICAgICAgICB9KSwgaGFuZGxlcjogYSA9PiB0aGlzLm1vdmVOb2RlKGEubm9kZVV1aWQsIGEubmV3UGFyZW50VXVpZCwgYS5zaWJsaW5nSW5kZXgpIH0sXG4gICAgICAgICAgICB7IG5hbWU6ICdkdXBsaWNhdGVfbm9kZScsIHRpdGxlOiAnRHVwbGljYXRlIHNjZW5lIG5vZGUnLCBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBEdXBsaWNhdGUgYSBub2RlIGFuZCByZXR1cm4gdGhlIG5ldyBVVUlELiBNdXRhdGVzIHNjZW5lOyBjaGlsZCBpbmNsdXNpb24gZm9sbG93cyBDb2NvcyBkdXBsaWNhdGUtbm9kZSBiZWhhdmlvci4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ05vZGUgVVVJRCB0byBkdXBsaWNhdGUuJyksXG4gICAgICAgICAgICAgICAgICAgIGluY2x1ZGVDaGlsZHJlbjogei5ib29sZWFuKCkuZGVmYXVsdCh0cnVlKS5kZXNjcmliZSgnV2hldGhlciBjaGlsZHJlbiBzaG91bGQgYmUgaW5jbHVkZWQ7IGFjdHVhbCBiZWhhdmlvciBmb2xsb3dzIENvY29zIGR1cGxpY2F0ZS1ub2RlLicpLFxuICAgICAgICAgICAgICAgIH0pLCBoYW5kbGVyOiBhID0+IHRoaXMuZHVwbGljYXRlTm9kZShhLnV1aWQsIGEuaW5jbHVkZUNoaWxkcmVuKSB9LFxuICAgICAgICAgICAgeyBuYW1lOiAnZGV0ZWN0X25vZGVfdHlwZScsIHRpdGxlOiAnRGV0ZWN0IG5vZGUgdHlwZScsIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIEhldXJpc3RpY2FsbHkgY2xhc3NpZnkgYSBub2RlIGFzIDJEIG9yIDNEIGZyb20gY29tcG9uZW50cy90cmFuc2Zvcm0uIE5vIG11dGF0aW9uOyBoZWxwcyBjaG9vc2UgdHJhbnNmb3JtIHNlbWFudGljcy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ05vZGUgVVVJRCB0byBjbGFzc2lmeSBhcyAyRCBvciAzRCBieSBoZXVyaXN0aWMuJyksXG4gICAgICAgICAgICAgICAgfSksIGhhbmRsZXI6IGEgPT4gdGhpcy5kZXRlY3ROb2RlVHlwZShhLnV1aWQpIH0sXG4gICAgICAgICAgICB7IG5hbWU6ICdzZXRfbm9kZV9wcm9wZXJ0aWVzJywgdGl0bGU6ICdTZXQgbm9kZSBwcm9wZXJ0aWVzJywgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gQmF0Y2gtc2V0IG11bHRpcGxlIHByb3BlcnRpZXMgb24gdGhlIHNhbWUgbm9kZSBpbiBvbmUgdG9vbCBjYWxsLiBNdXRhdGVzIHNjZW5lOyBlbnRyaWVzIHJ1biBzZXF1ZW50aWFsbHkgaW4gYXJyYXkgb3JkZXIgc28gY29jb3MgdW5kby9zZXJpYWxpemF0aW9uIHN0YXkgY29oZXJlbnQuIFJldHVybnMgcGVyLWVudHJ5IHN1Y2Nlc3MvZXJyb3Igc28gcGFydGlhbCBmYWlsdXJlcyBhcmUgdmlzaWJsZS4gRHVwbGljYXRlIHBhdGhzIGFyZSByZWplY3RlZCB1cC1mcm9udDsgb3ZlcmxhcHBpbmcgcGF0aHMgKGUuZy4gcG9zaXRpb24gdnMgcG9zaXRpb24ueCkgYXJlIHdhcm5lZC4gVXNlIHdoZW4gY2hhbmdpbmcgc2V2ZXJhbCBwcm9wZXJ0aWVzIG9uIHRoZSBzYW1lIG5vZGUgYXQgb25jZS4gQWNjZXB0cyByZWZlcmVuY2U9e2lkLHR5cGV9IChwcmVmZXJyZWQpLCB1dWlkLCBvciBub2RlTmFtZS4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHJlZmVyZW5jZTogaW5zdGFuY2VSZWZlcmVuY2VTY2hlbWEub3B0aW9uYWwoKS5kZXNjcmliZSgnSW5zdGFuY2VSZWZlcmVuY2Uge2lkLHR5cGV9LiBQcmVmZXJyZWQgZm9ybS4nKSxcbiAgICAgICAgICAgICAgICAgICAgdXVpZDogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdOb2RlIFVVSUQgdG8gbW9kaWZ5LiBVc2VkIHdoZW4gcmVmZXJlbmNlIGlzIG9taXR0ZWQuJyksXG4gICAgICAgICAgICAgICAgICAgIG5vZGVOYW1lOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ05vZGUgbmFtZSAoZGVwdGgtZmlyc3QgZmlyc3QgbWF0Y2gpLiBVc2VkIHdoZW4gcmVmZXJlbmNlIGFuZCB1dWlkIGFyZSBvbWl0dGVkLicpLFxuICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0aWVzOiB6LmFycmF5KHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhdGg6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1Byb3BlcnR5IHBhdGggcGFzc2VkIHRvIHNjZW5lL3NldC1wcm9wZXJ0eSAoZS5nLiBhY3RpdmUsIG5hbWUsIGxheWVyLCBwb3NpdGlvbikuJyksXG4gICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZTogei5hbnkoKS5kZXNjcmliZSgnUHJvcGVydHkgdmFsdWUgbWF0Y2hpbmcgdGhlIENvY29zIGR1bXAgc2hhcGUgZm9yIHRoZSBwYXRoLicpLFxuICAgICAgICAgICAgICAgICAgICB9KSkubWluKDEpLm1heCg1MCkuZGVzY3JpYmUoJ1Byb3BlcnRpZXMgdG8gd3JpdGUuIENhcHBlZCBhdCA1MCBlbnRyaWVzIHBlciBjYWxsLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGFzeW5jIGEgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCByID0gYXdhaXQgcmVzb2x2ZVJlZmVyZW5jZSh7IHJlZmVyZW5jZTogYS5yZWZlcmVuY2UsIG5vZGVVdWlkOiBhLnV1aWQsIG5vZGVOYW1lOiBhLm5vZGVOYW1lIH0pO1xuICAgICAgICAgICAgICAgICAgICBpZiAoJ3Jlc3BvbnNlJyBpbiByKSByZXR1cm4gci5yZXNwb25zZTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGJhdGNoU2V0UHJvcGVydGllcyhyLnV1aWQsIGEucHJvcGVydGllcyk7XG4gICAgICAgICAgICAgICAgfSB9LFxuICAgICAgICBdO1xuICAgICAgICB0aGlzLmV4ZWMgPSBkZWZpbmVUb29scyhkZWZzKTtcbiAgICB9XG5cbiAgICBnZXRUb29scygpOiBUb29sRGVmaW5pdGlvbltdIHsgcmV0dXJuIHRoaXMuZXhlYy5nZXRUb29scygpOyB9XG4gICAgZXhlY3V0ZSh0b29sTmFtZTogc3RyaW5nLCBhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4geyByZXR1cm4gdGhpcy5leGVjLmV4ZWN1dGUodG9vbE5hbWUsIGFyZ3MpOyB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGNyZWF0ZU5vZGUoYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKGFzeW5jIChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGxldCB0YXJnZXRQYXJlbnRVdWlkID0gYXJncy5wYXJlbnRVdWlkO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIC8vIOWmguaenOaykuacieaPkOS+m+eItuevgOm7nlVVSUTvvIznjbLlj5bloLTmma/moLnnr4Dpu55cbiAgICAgICAgICAgICAgICBpZiAoIXRhcmdldFBhcmVudFV1aWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHNjZW5lSW5mbyA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LW5vZGUtdHJlZScpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHNjZW5lSW5mbyAmJiB0eXBlb2Ygc2NlbmVJbmZvID09PSAnb2JqZWN0JyAmJiAhQXJyYXkuaXNBcnJheShzY2VuZUluZm8pICYmIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChzY2VuZUluZm8sICd1dWlkJykpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0YXJnZXRQYXJlbnRVdWlkID0gKHNjZW5lSW5mbyBhcyBhbnkpLnV1aWQ7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYE5vIHBhcmVudCBzcGVjaWZpZWQsIHVzaW5nIHNjZW5lIHJvb3Q6ICR7dGFyZ2V0UGFyZW50VXVpZH1gKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShzY2VuZUluZm8pICYmIHNjZW5lSW5mby5sZW5ndGggPiAwICYmIHNjZW5lSW5mb1swXS51dWlkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGFyZ2V0UGFyZW50VXVpZCA9IHNjZW5lSW5mb1swXS51dWlkO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlYnVnTG9nKGBObyBwYXJlbnQgc3BlY2lmaWVkLCB1c2luZyBzY2VuZSByb290OiAke3RhcmdldFBhcmVudFV1aWR9YCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGN1cnJlbnRTY2VuZSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LWN1cnJlbnQtc2NlbmUnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoY3VycmVudFNjZW5lICYmIGN1cnJlbnRTY2VuZS51dWlkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRhcmdldFBhcmVudFV1aWQgPSBjdXJyZW50U2NlbmUudXVpZDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS53YXJuKCdGYWlsZWQgdG8gZ2V0IHNjZW5lIHJvb3QsIHdpbGwgdXNlIGRlZmF1bHQgYmVoYXZpb3InKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIOWmguaenOaPkOS+m+S6hmFzc2V0UGF0aO+8jOWFiOino+aekOeCumFzc2V0VXVpZFxuICAgICAgICAgICAgICAgIGxldCBmaW5hbEFzc2V0VXVpZCA9IGFyZ3MuYXNzZXRVdWlkO1xuICAgICAgICAgICAgICAgIGlmIChhcmdzLmFzc2V0UGF0aCAmJiAhZmluYWxBc3NldFV1aWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGFzc2V0SW5mbyA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0LWluZm8nLCBhcmdzLmFzc2V0UGF0aCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoYXNzZXRJbmZvICYmIGFzc2V0SW5mby51dWlkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZmluYWxBc3NldFV1aWQgPSBhc3NldEluZm8udXVpZDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgQXNzZXQgcGF0aCAnJHthcmdzLmFzc2V0UGF0aH0nIHJlc29sdmVkIHRvIFVVSUQ6ICR7ZmluYWxBc3NldFV1aWR9YCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChgQXNzZXQgbm90IGZvdW5kIGF0IHBhdGg6ICR7YXJncy5hc3NldFBhdGh9YCkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoYEZhaWxlZCB0byByZXNvbHZlIGFzc2V0IHBhdGggJyR7YXJncy5hc3NldFBhdGh9JzogJHtlcnJ9YCkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8g5qeL5bu6Y3JlYXRlLW5vZGXpgbjpoIVcbiAgICAgICAgICAgICAgICBjb25zdCBjcmVhdGVOb2RlT3B0aW9uczogYW55ID0ge1xuICAgICAgICAgICAgICAgICAgICBuYW1lOiBhcmdzLm5hbWVcbiAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgLy8g6Kit572u54i256+A6bueXG4gICAgICAgICAgICAgICAgaWYgKHRhcmdldFBhcmVudFV1aWQpIHtcbiAgICAgICAgICAgICAgICAgICAgY3JlYXRlTm9kZU9wdGlvbnMucGFyZW50ID0gdGFyZ2V0UGFyZW50VXVpZDtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyDlvp7os4fmupDlr6bkvovljJZcbiAgICAgICAgICAgICAgICBpZiAoZmluYWxBc3NldFV1aWQpIHtcbiAgICAgICAgICAgICAgICAgICAgY3JlYXRlTm9kZU9wdGlvbnMuYXNzZXRVdWlkID0gZmluYWxBc3NldFV1aWQ7XG4gICAgICAgICAgICAgICAgICAgIGlmIChhcmdzLnVubGlua1ByZWZhYikge1xuICAgICAgICAgICAgICAgICAgICAgICAgY3JlYXRlTm9kZU9wdGlvbnMudW5saW5rUHJlZmFiID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIOa3u+WKoOe1hOS7tlxuICAgICAgICAgICAgICAgIGlmIChhcmdzLmNvbXBvbmVudHMgJiYgYXJncy5jb21wb25lbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgY3JlYXRlTm9kZU9wdGlvbnMuY29tcG9uZW50cyA9IGFyZ3MuY29tcG9uZW50cztcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGFyZ3Mubm9kZVR5cGUgJiYgYXJncy5ub2RlVHlwZSAhPT0gJ05vZGUnICYmICFmaW5hbEFzc2V0VXVpZCkge1xuICAgICAgICAgICAgICAgICAgICAvLyDlj6rmnInlnKjkuI3lvp7os4fmupDlr6bkvovljJbmmYLmiY3mt7vliqBub2RlVHlwZee1hOS7tlxuICAgICAgICAgICAgICAgICAgICBjcmVhdGVOb2RlT3B0aW9ucy5jb21wb25lbnRzID0gW2FyZ3Mubm9kZVR5cGVdO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIOS/neaMgeS4lueVjOiuiuaPm1xuICAgICAgICAgICAgICAgIGlmIChhcmdzLmtlZXBXb3JsZFRyYW5zZm9ybSkge1xuICAgICAgICAgICAgICAgICAgICBjcmVhdGVOb2RlT3B0aW9ucy5rZWVwV29ybGRUcmFuc2Zvcm0gPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIOS4jeS9v+eUqGR1bXDlj4PmlbjomZXnkIbliJ3lp4vorormj5vvvIzlibXlu7rlvozkvb/nlKhzZXRfbm9kZV90cmFuc2Zvcm3oqK3nva5cblxuICAgICAgICAgICAgICAgIGRlYnVnTG9nKCdDcmVhdGluZyBub2RlIHdpdGggb3B0aW9uczonLCBjcmVhdGVOb2RlT3B0aW9ucyk7XG5cbiAgICAgICAgICAgICAgICAvLyDlibXlu7rnr4Dpu55cbiAgICAgICAgICAgICAgICBjb25zdCBub2RlVXVpZCA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ2NyZWF0ZS1ub2RlJywgY3JlYXRlTm9kZU9wdGlvbnMpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHV1aWQgPSBBcnJheS5pc0FycmF5KG5vZGVVdWlkKSA/IG5vZGVVdWlkWzBdIDogbm9kZVV1aWQ7XG5cbiAgICAgICAgICAgICAgICAvLyDomZXnkIblhYTlvJ/ntKLlvJVcbiAgICAgICAgICAgICAgICBpZiAoYXJncy5zaWJsaW5nSW5kZXggIT09IHVuZGVmaW5lZCAmJiBhcmdzLnNpYmxpbmdJbmRleCA+PSAwICYmIHV1aWQgJiYgdGFyZ2V0UGFyZW50VXVpZCkge1xuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDEwMCkpOyAvLyDnrYnlvoXlhafpg6jni4DmhYvmm7TmlrBcbiAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3NldC1wYXJlbnQnLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcGFyZW50OiB0YXJnZXRQYXJlbnRVdWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHV1aWRzOiBbdXVpZF0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAga2VlcFdvcmxkVHJhbnNmb3JtOiBhcmdzLmtlZXBXb3JsZFRyYW5zZm9ybSB8fCBmYWxzZVxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS53YXJuKCdGYWlsZWQgdG8gc2V0IHNpYmxpbmcgaW5kZXg6JywgZXJyKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIOa3u+WKoOe1hOS7tu+8iOWmguaenOaPkOS+m+eahOipse+8iVxuICAgICAgICAgICAgICAgIGlmIChhcmdzLmNvbXBvbmVudHMgJiYgYXJncy5jb21wb25lbnRzLmxlbmd0aCA+IDAgJiYgdXVpZCkge1xuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDEwMCkpOyAvLyDnrYnlvoXnr4Dpu57libXlu7rlrozmiJBcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAoY29uc3QgY29tcG9uZW50VHlwZSBvZiBhcmdzLmNvbXBvbmVudHMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmNvbXBvbmVudFRvb2xzLmV4ZWN1dGUoJ2FkZF9jb21wb25lbnQnLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBub2RlVXVpZDogdXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudFR5cGU6IGNvbXBvbmVudFR5cGVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYENvbXBvbmVudCAke2NvbXBvbmVudFR5cGV9IGFkZGVkIHN1Y2Nlc3NmdWxseWApO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS53YXJuKGBGYWlsZWQgdG8gYWRkIGNvbXBvbmVudCAke2NvbXBvbmVudFR5cGV9OmAsIHJlc3VsdC5lcnJvcik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS53YXJuKGBGYWlsZWQgdG8gYWRkIGNvbXBvbmVudCAke2NvbXBvbmVudFR5cGV9OmAsIGVycik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybignRmFpbGVkIHRvIGFkZCBjb21wb25lbnRzOicsIGVycik7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyDoqK3nva7liJ3lp4vorormj5vvvIjlpoLmnpzmj5DkvpvnmoToqbHvvIlcbiAgICAgICAgICAgICAgICBpZiAoYXJncy5pbml0aWFsVHJhbnNmb3JtICYmIHV1aWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxNTApKTsgLy8g562J5b6F56+A6bue5ZKM57WE5Lu25Ym15bu65a6M5oiQXG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnNldE5vZGVUcmFuc2Zvcm0oe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IHV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcG9zaXRpb246IGFyZ3MuaW5pdGlhbFRyYW5zZm9ybS5wb3NpdGlvbixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByb3RhdGlvbjogYXJncy5pbml0aWFsVHJhbnNmb3JtLnJvdGF0aW9uLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNjYWxlOiBhcmdzLmluaXRpYWxUcmFuc2Zvcm0uc2NhbGVcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coJ0luaXRpYWwgdHJhbnNmb3JtIGFwcGxpZWQgc3VjY2Vzc2Z1bGx5Jyk7XG4gICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS53YXJuKCdGYWlsZWQgdG8gc2V0IGluaXRpYWwgdHJhbnNmb3JtOicsIGVycik7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyDoqK3lrpogbGF5ZXLvvIh1c2VyLXByb3ZpZGVkIOaIliBhdXRvLWRldGVjdCBDYW52YXMgYW5jZXN0b3LvvIlcbiAgICAgICAgICAgICAgICBsZXQgcmVzb2x2ZWRMYXllcjogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG4gICAgICAgICAgICAgICAgbGV0IGxheWVyU291cmNlOiAnZXhwbGljaXQnIHwgJ2F1dG8tY2FudmFzJyB8ICdkZWZhdWx0JyA9ICdkZWZhdWx0JztcbiAgICAgICAgICAgICAgICBpZiAodXVpZCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoYXJncy5sYXllciAhPT0gdW5kZWZpbmVkICYmIGFyZ3MubGF5ZXIgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgYXJncy5sYXllciA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlZExheWVyID0gYXJncy5sYXllcjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsYXllclNvdXJjZSA9ICdleHBsaWNpdCc7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBhcmdzLmxheWVyID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHByZXNldCA9IChMQVlFUl9QUkVTRVRTIGFzIGFueSlbYXJncy5sYXllcl0gYXMgbnVtYmVyIHwgdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgcHJlc2V0ICE9PSAnbnVtYmVyJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoYFVua25vd24gbGF5ZXIgcHJlc2V0ICcke2FyZ3MubGF5ZXJ9Jy4gQWxsb3dlZDogJHtPYmplY3Qua2V5cyhMQVlFUl9QUkVTRVRTKS5qb2luKCcsICcpfSwgb3IgcGFzcyBhIHJhdyBudW1iZXIuYCkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmVkTGF5ZXIgPSBwcmVzZXQ7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbGF5ZXJTb3VyY2UgPSAnZXhwbGljaXQnO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHRhcmdldFBhcmVudFV1aWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIEF1dG8tZGV0ZWN0OiBpZiBhbnkgYW5jZXN0b3IgaGFzIGNjLkNhbnZhcywgZGVmYXVsdCB0byBVSV8yRCBzb1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gdGhlIFVJIGNhbWVyYSBhY3R1YWxseSByZW5kZXJzIHRoZSBuZXcgbm9kZS5cbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGhhc0NhbnZhc0FuY2VzdG9yID0gYXdhaXQgdGhpcy5hbmNlc3Rvckhhc0NvbXBvbmVudCh0YXJnZXRQYXJlbnRVdWlkLCAnY2MuQ2FudmFzJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoaGFzQ2FudmFzQW5jZXN0b3IpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlZExheWVyID0gTEFZRVJfUFJFU0VUUy5VSV8yRDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsYXllclNvdXJjZSA9ICdhdXRvLWNhbnZhcyc7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBpZiAocmVzb2x2ZWRMYXllciAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdzZXQtcHJvcGVydHknLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBhdGg6ICdsYXllcicsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGR1bXA6IHsgdmFsdWU6IHJlc29sdmVkTGF5ZXIgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgQXBwbGllZCBsYXllciAke3Jlc29sdmVkTGF5ZXJ9ICgke2xheWVyU291cmNlfSkgdG8gJHt1dWlkfWApO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS53YXJuKCdGYWlsZWQgdG8gc2V0IGxheWVyOicsIGVycik7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyDnjbLlj5blibXlu7rlvoznmoTnr4Dpu57kv6Hmga/pgLLooYzpqZforYlcbiAgICAgICAgICAgICAgICBsZXQgdmVyaWZpY2F0aW9uRGF0YTogYW55ID0gbnVsbDtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBub2RlSW5mbyA9IGF3YWl0IHRoaXMuZ2V0Tm9kZUluZm8odXVpZCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChub2RlSW5mby5zdWNjZXNzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2ZXJpZmljYXRpb25EYXRhID0ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5vZGVJbmZvOiBub2RlSW5mby5kYXRhLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNyZWF0aW9uRGV0YWlsczoge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwYXJlbnRVdWlkOiB0YXJnZXRQYXJlbnRVdWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBub2RlVHlwZTogYXJncy5ub2RlVHlwZSB8fCAnTm9kZScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZyb21Bc3NldDogISFmaW5hbEFzc2V0VXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYXNzZXRVdWlkOiBmaW5hbEFzc2V0VXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYXNzZXRQYXRoOiBhcmdzLmFzc2V0UGF0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybignRmFpbGVkIHRvIGdldCB2ZXJpZmljYXRpb24gZGF0YTonLCBlcnIpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGNvbnN0IHN1Y2Nlc3NNZXNzYWdlID0gZmluYWxBc3NldFV1aWQgXG4gICAgICAgICAgICAgICAgICAgID8gYE5vZGUgJyR7YXJncy5uYW1lfScgaW5zdGFudGlhdGVkIGZyb20gYXNzZXQgc3VjY2Vzc2Z1bGx5YFxuICAgICAgICAgICAgICAgICAgICA6IGBOb2RlICcke2FyZ3MubmFtZX0nIGNyZWF0ZWQgc3VjY2Vzc2Z1bGx5YDtcblxuICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiB1dWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogYXJncy5uYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgcGFyZW50VXVpZDogdGFyZ2V0UGFyZW50VXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG5vZGVUeXBlOiBhcmdzLm5vZGVUeXBlIHx8ICdOb2RlJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGZyb21Bc3NldDogISFmaW5hbEFzc2V0VXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGFzc2V0VXVpZDogZmluYWxBc3NldFV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBsYXllcjogcmVzb2x2ZWRMYXllcixcbiAgICAgICAgICAgICAgICAgICAgICAgIGxheWVyU291cmNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogc3VjY2Vzc01lc3NhZ2VcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgdmVyaWZpY2F0aW9uRGF0YTogdmVyaWZpY2F0aW9uRGF0YVxuICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChgRmFpbGVkIHRvIGNyZWF0ZSBub2RlOiAke2Vyci5tZXNzYWdlfS4gQXJnczogJHtKU09OLnN0cmluZ2lmeShhcmdzKX1gKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIFdhbGsgdXAgZnJvbSBgc3RhcnRVdWlkYCAoaW5jbHVzaXZlKSBjaGVja2luZyBmb3IgYSBjb21wb25lbnQgd2hvc2VcbiAgICAvLyBfX3R5cGVfXyBtYXRjaGVzIGBjb21wb25lbnRUeXBlYC4gUmV0dXJucyB0cnVlIGlmIGZvdW5kIGFueXdoZXJlIGluIHRoZVxuICAgIC8vIGNoYWluIHVwIHRvIChidXQgbm90IGluY2x1ZGluZykgdGhlIHNjZW5lIHJvb3QuIEJvdW5kZWQgdG8gNjQgc3RlcHMgYXNcbiAgICAvLyBhIHNhZmV0eSBzdG9wIGluIGNhc2Ugb2YgYSBtYWxmb3JtZWQgcGFyZW50IGdyYXBoLlxuICAgIHByaXZhdGUgYXN5bmMgYW5jZXN0b3JIYXNDb21wb25lbnQoc3RhcnRVdWlkOiBzdHJpbmcsIGNvbXBvbmVudFR5cGU6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgICAgICBsZXQgY3Vyc29yOiBzdHJpbmcgfCBudWxsID0gc3RhcnRVdWlkO1xuICAgICAgICBmb3IgKGxldCBob3BzID0gMDsgaG9wcyA8IDY0ICYmIGN1cnNvcjsgaG9wcysrKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGRhdGE6IGFueSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LW5vZGUnLCBjdXJzb3IpO1xuICAgICAgICAgICAgICAgIGlmICghZGF0YSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KGRhdGEuX19jb21wc19fKSkge1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGNvbXAgb2YgZGF0YS5fX2NvbXBzX18pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjb21wICYmIChjb21wLl9fdHlwZV9fID09PSBjb21wb25lbnRUeXBlIHx8IGNvbXAudHlwZSA9PT0gY29tcG9uZW50VHlwZSB8fCBjb21wLmNpZCA9PT0gY29tcG9uZW50VHlwZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBwYXJlbnRVdWlkID0gZGF0YS5wYXJlbnQ/LnZhbHVlPy51dWlkID8/IG51bGw7XG4gICAgICAgICAgICAgICAgaWYgKCFwYXJlbnRVdWlkIHx8IHBhcmVudFV1aWQgPT09IGN1cnNvcikgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIGN1cnNvciA9IHBhcmVudFV1aWQ7XG4gICAgICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2V0Tm9kZUluZm8odXVpZDogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1ub2RlJywgdXVpZCkudGhlbigobm9kZURhdGE6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmICghbm9kZURhdGEpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKCdOb2RlIG5vdCBmb3VuZCBvciBpbnZhbGlkIHJlc3BvbnNlJykpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIC8vIOagueaTmuWvpumam+i/lOWbnueahOaVuOaTmue1kOani+ino+aekOevgOm7nuS/oeaBr1xuICAgICAgICAgICAgICAgIGNvbnN0IGluZm86IE5vZGVJbmZvID0ge1xuICAgICAgICAgICAgICAgICAgICB1dWlkOiBub2RlRGF0YS51dWlkPy52YWx1ZSB8fCB1dWlkLFxuICAgICAgICAgICAgICAgICAgICBuYW1lOiBub2RlRGF0YS5uYW1lPy52YWx1ZSB8fCAnVW5rbm93bicsXG4gICAgICAgICAgICAgICAgICAgIGFjdGl2ZTogbm9kZURhdGEuYWN0aXZlPy52YWx1ZSAhPT0gdW5kZWZpbmVkID8gbm9kZURhdGEuYWN0aXZlLnZhbHVlIDogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgcG9zaXRpb246IG5vZGVEYXRhLnBvc2l0aW9uPy52YWx1ZSB8fCB7IHg6IDAsIHk6IDAsIHo6IDAgfSxcbiAgICAgICAgICAgICAgICAgICAgcm90YXRpb246IG5vZGVEYXRhLnJvdGF0aW9uPy52YWx1ZSB8fCB7IHg6IDAsIHk6IDAsIHo6IDAgfSxcbiAgICAgICAgICAgICAgICAgICAgc2NhbGU6IG5vZGVEYXRhLnNjYWxlPy52YWx1ZSB8fCB7IHg6IDEsIHk6IDEsIHo6IDEgfSxcbiAgICAgICAgICAgICAgICAgICAgcGFyZW50OiBub2RlRGF0YS5wYXJlbnQ/LnZhbHVlPy51dWlkIHx8IG51bGwsXG4gICAgICAgICAgICAgICAgICAgIGNoaWxkcmVuOiBub2RlRGF0YS5jaGlsZHJlbiB8fCBbXSxcbiAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50czogKG5vZGVEYXRhLl9fY29tcHNfXyB8fCBbXSkubWFwKChjb21wOiBhbnkpID0+ICh7XG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiBjb21wLl9fdHlwZV9fIHx8ICdVbmtub3duJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGVuYWJsZWQ6IGNvbXAuZW5hYmxlZCAhPT0gdW5kZWZpbmVkID8gY29tcC5lbmFibGVkIDogdHJ1ZVxuICAgICAgICAgICAgICAgICAgICB9KSksXG4gICAgICAgICAgICAgICAgICAgIGxheWVyOiBub2RlRGF0YS5sYXllcj8udmFsdWUgfHwgMTA3Mzc0MTgyNCxcbiAgICAgICAgICAgICAgICAgICAgbW9iaWxpdHk6IG5vZGVEYXRhLm1vYmlsaXR5Py52YWx1ZSB8fCAwXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKGluZm8pKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBmaW5kTm9kZXMocGF0dGVybjogc3RyaW5nLCBleGFjdE1hdGNoOiBib29sZWFuID0gZmFsc2UpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIC8vIE5vdGU6ICdxdWVyeS1ub2Rlcy1ieS1uYW1lJyBBUEkgZG9lc24ndCBleGlzdCBpbiBvZmZpY2lhbCBkb2N1bWVudGF0aW9uXG4gICAgICAgICAgICAvLyBVc2luZyB0cmVlIHRyYXZlcnNhbCBhcyBwcmltYXJ5IGFwcHJvYWNoXG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1ub2RlLXRyZWUnKS50aGVuKCh0cmVlOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBub2RlczogYW55W10gPSBbXTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBjb25zdCBzZWFyY2hUcmVlID0gKG5vZGU6IGFueSwgY3VycmVudFBhdGg6IHN0cmluZyA9ICcnKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG5vZGVQYXRoID0gY3VycmVudFBhdGggPyBgJHtjdXJyZW50UGF0aH0vJHtub2RlLm5hbWV9YCA6IG5vZGUubmFtZTtcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG1hdGNoZXMgPSBleGFjdE1hdGNoID8gXG4gICAgICAgICAgICAgICAgICAgICAgICBub2RlLm5hbWUgPT09IHBhdHRlcm4gOiBcbiAgICAgICAgICAgICAgICAgICAgICAgIG5vZGUubmFtZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHBhdHRlcm4udG9Mb3dlckNhc2UoKSk7XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICBpZiAobWF0Y2hlcykge1xuICAgICAgICAgICAgICAgICAgICAgICAgbm9kZXMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdXVpZDogbm9kZS51dWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5hbWU6IG5vZGUubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwYXRoOiBub2RlUGF0aFxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIGlmIChub2RlLmNoaWxkcmVuKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIG5vZGUuY2hpbGRyZW4pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZWFyY2hUcmVlKGNoaWxkLCBub2RlUGF0aCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGlmICh0cmVlKSB7XG4gICAgICAgICAgICAgICAgICAgIHNlYXJjaFRyZWUodHJlZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIHJlc29sdmUob2sobm9kZXMpKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgLy8g5YKZ55So5pa55qGI77ya5L2/55So5aC05pmv6IWz5pysXG4gICAgICAgICAgICAgICAgcnVuU2NlbmVNZXRob2QoJ2ZpbmROb2RlcycsIFtwYXR0ZXJuLCBleGFjdE1hdGNoXSkudGhlbigocmVzdWx0OiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgICAgICAgIH0pLmNhdGNoKChlcnIyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoYFRyZWUgc2VhcmNoIGZhaWxlZDogJHtlcnIubWVzc2FnZX0sIFNjZW5lIHNjcmlwdCBmYWlsZWQ6ICR7ZXJyMi5tZXNzYWdlfWApKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGZpbmROb2RlQnlOYW1lKG5hbWU6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgLy8g5YSq5YWI5ZqQ6Kmm5L2/55SoIEVkaXRvciBBUEkg5p+l6Kmi56+A6bue5qi55Lim5pCc57SiXG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1ub2RlLXRyZWUnKS50aGVuKCh0cmVlOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBmb3VuZE5vZGUgPSB0aGlzLnNlYXJjaE5vZGVJblRyZWUodHJlZSwgbmFtZSk7XG4gICAgICAgICAgICAgICAgaWYgKGZvdW5kTm9kZSkge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiBmb3VuZE5vZGUudXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBuYW1lOiBmb3VuZE5vZGUubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwYXRoOiB0aGlzLmdldE5vZGVQYXRoKGZvdW5kTm9kZSlcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoYE5vZGUgJyR7bmFtZX0nIG5vdCBmb3VuZGApKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIC8vIOWCmeeUqOaWueahiO+8muS9v+eUqOWgtOaZr+iFs+acrFxuICAgICAgICAgICAgICAgIHJ1blNjZW5lTWV0aG9kKCdmaW5kTm9kZUJ5TmFtZScsIFtuYW1lXSkudGhlbigocmVzdWx0OiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgICAgICAgIH0pLmNhdGNoKChlcnIyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoYERpcmVjdCBBUEkgZmFpbGVkOiAke2Vyci5tZXNzYWdlfSwgU2NlbmUgc2NyaXB0IGZhaWxlZDogJHtlcnIyLm1lc3NhZ2V9YCkpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgc2VhcmNoTm9kZUluVHJlZShub2RlOiBhbnksIHRhcmdldE5hbWU6IHN0cmluZyk6IGFueSB7XG4gICAgICAgIGlmIChub2RlLm5hbWUgPT09IHRhcmdldE5hbWUpIHtcbiAgICAgICAgICAgIHJldHVybiBub2RlO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBpZiAobm9kZS5jaGlsZHJlbikge1xuICAgICAgICAgICAgZm9yIChjb25zdCBjaGlsZCBvZiBub2RlLmNoaWxkcmVuKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZm91bmQgPSB0aGlzLnNlYXJjaE5vZGVJblRyZWUoY2hpbGQsIHRhcmdldE5hbWUpO1xuICAgICAgICAgICAgICAgIGlmIChmb3VuZCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZm91bmQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldEFsbE5vZGVzKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgLy8g5ZiX6Kmm5p+l6Kmi5aC05pmv56+A6bue5qi5XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1ub2RlLXRyZWUnKS50aGVuKCh0cmVlOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBub2RlczogYW55W10gPSBbXTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBjb25zdCB0cmF2ZXJzZVRyZWUgPSAobm9kZTogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIG5vZGVzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgdXVpZDogbm9kZS51dWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogbm9kZS5uYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogbm9kZS50eXBlLFxuICAgICAgICAgICAgICAgICAgICAgICAgYWN0aXZlOiBub2RlLmFjdGl2ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhdGg6IHRoaXMuZ2V0Tm9kZVBhdGgobm9kZSlcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICBpZiAobm9kZS5jaGlsZHJlbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBjaGlsZCBvZiBub2RlLmNoaWxkcmVuKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHJhdmVyc2VUcmVlKGNoaWxkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaWYgKHRyZWUgJiYgdHJlZS5jaGlsZHJlbikge1xuICAgICAgICAgICAgICAgICAgICB0cmF2ZXJzZVRyZWUodHJlZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgdG90YWxOb2Rlczogbm9kZXMubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICAgICAgbm9kZXM6IG5vZGVzXG4gICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgLy8g5YKZ55So5pa55qGI77ya5L2/55So5aC05pmv6IWz5pysXG4gICAgICAgICAgICAgICAgcnVuU2NlbmVNZXRob2QoJ2dldEFsbE5vZGVzJywgW10pLnRoZW4oKHJlc3VsdDogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICAgICAgICB9KS5jYXRjaCgoZXJyMjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGBEaXJlY3QgQVBJIGZhaWxlZDogJHtlcnIubWVzc2FnZX0sIFNjZW5lIHNjcmlwdCBmYWlsZWQ6ICR7ZXJyMi5tZXNzYWdlfWApKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGdldE5vZGVQYXRoKG5vZGU6IGFueSk6IHN0cmluZyB7XG4gICAgICAgIGNvbnN0IHBhdGggPSBbbm9kZS5uYW1lXTtcbiAgICAgICAgbGV0IGN1cnJlbnQgPSBub2RlLnBhcmVudDtcbiAgICAgICAgd2hpbGUgKGN1cnJlbnQgJiYgY3VycmVudC5uYW1lICE9PSAnQ2FudmFzJykge1xuICAgICAgICAgICAgcGF0aC51bnNoaWZ0KGN1cnJlbnQubmFtZSk7XG4gICAgICAgICAgICBjdXJyZW50ID0gY3VycmVudC5wYXJlbnQ7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHBhdGguam9pbignLycpO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgc2V0Tm9kZVByb3BlcnR5KHV1aWQ6IHN0cmluZywgcHJvcGVydHk6IHN0cmluZywgdmFsdWU6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgLy8g5ZiX6Kmm55u05o6l5L2/55SoIEVkaXRvciBBUEkg6Kit572u56+A6bue5bGs5oCnXG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdzZXQtcHJvcGVydHknLCB7XG4gICAgICAgICAgICAgICAgdXVpZDogdXVpZCxcbiAgICAgICAgICAgICAgICBwYXRoOiBwcm9wZXJ0eSxcbiAgICAgICAgICAgICAgICBkdW1wOiB7XG4gICAgICAgICAgICAgICAgICAgIHZhbHVlOiB2YWx1ZVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIC8vIEdldCBjb21wcmVoZW5zaXZlIHZlcmlmaWNhdGlvbiBkYXRhIGluY2x1ZGluZyB1cGRhdGVkIG5vZGUgaW5mb1xuICAgICAgICAgICAgICAgIHRoaXMuZ2V0Tm9kZUluZm8odXVpZCkudGhlbigobm9kZUluZm8pID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYFByb3BlcnR5ICcke3Byb3BlcnR5fScgdXBkYXRlZCBzdWNjZXNzZnVsbHlgLFxuICAgICAgICAgICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5vZGVVdWlkOiB1dWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb3BlcnR5OiBwcm9wZXJ0eSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBuZXdWYWx1ZTogdmFsdWVcbiAgICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICB2ZXJpZmljYXRpb25EYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbm9kZUluZm86IG5vZGVJbmZvLmRhdGEsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2hhbmdlRGV0YWlsczoge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0eTogcHJvcGVydHksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlOiB2YWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0pLmNhdGNoKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShvayh1bmRlZmluZWQsIGBQcm9wZXJ0eSAnJHtwcm9wZXJ0eX0nIHVwZGF0ZWQgc3VjY2Vzc2Z1bGx5ICh2ZXJpZmljYXRpb24gZmFpbGVkKWApKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgLy8g5aaC5p6c55u05o6l6Kit572u5aSx5pWX77yM5ZiX6Kmm5L2/55So5aC05pmv6IWz5pysXG4gICAgICAgICAgICAgICAgcnVuU2NlbmVNZXRob2QoJ3NldE5vZGVQcm9wZXJ0eScsIFt1dWlkLCBwcm9wZXJ0eSwgdmFsdWVdKS50aGVuKChyZXN1bHQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgfSkuY2F0Y2goKGVycjI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChgRGlyZWN0IEFQSSBmYWlsZWQ6ICR7ZXJyLm1lc3NhZ2V9LCBTY2VuZSBzY3JpcHQgZmFpbGVkOiAke2VycjIubWVzc2FnZX1gKSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBzZXROb2RlVHJhbnNmb3JtKGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZShhc3luYyAocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgeyB1dWlkLCBwb3NpdGlvbiwgcm90YXRpb24sIHNjYWxlIH0gPSBhcmdzO1xuICAgICAgICAgICAgY29uc3QgdXBkYXRlUHJvbWlzZXM6IFByb21pc2U8YW55PltdID0gW107XG4gICAgICAgICAgICBjb25zdCB1cGRhdGVzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICAgICAgY29uc3Qgd2FybmluZ3M6IHN0cmluZ1tdID0gW107XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgLy8gRmlyc3QgZ2V0IG5vZGUgaW5mbyB0byBkZXRlcm1pbmUgaWYgaXQncyAyRCBvciAzRFxuICAgICAgICAgICAgICAgIGNvbnN0IG5vZGVJbmZvUmVzcG9uc2UgPSBhd2FpdCB0aGlzLmdldE5vZGVJbmZvKHV1aWQpO1xuICAgICAgICAgICAgICAgIGlmICghbm9kZUluZm9SZXNwb25zZS5zdWNjZXNzIHx8ICFub2RlSW5mb1Jlc3BvbnNlLmRhdGEpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKCdGYWlsZWQgdG8gZ2V0IG5vZGUgaW5mb3JtYXRpb24nKSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgY29uc3Qgbm9kZUluZm8gPSBub2RlSW5mb1Jlc3BvbnNlLmRhdGE7XG4gICAgICAgICAgICAgICAgY29uc3QgaXMyRE5vZGUgPSB0aGlzLmlzMkROb2RlKG5vZGVJbmZvKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpZiAocG9zaXRpb24pIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgbm9ybWFsaXplZFBvc2l0aW9uID0gdGhpcy5ub3JtYWxpemVUcmFuc2Zvcm1WYWx1ZShwb3NpdGlvbiwgJ3Bvc2l0aW9uJywgaXMyRE5vZGUpO1xuICAgICAgICAgICAgICAgICAgICBpZiAobm9ybWFsaXplZFBvc2l0aW9uLndhcm5pbmcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdhcm5pbmdzLnB1c2gobm9ybWFsaXplZFBvc2l0aW9uLndhcm5pbmcpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICB1cGRhdGVQcm9taXNlcy5wdXNoKFxuICAgICAgICAgICAgICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnc2V0LXByb3BlcnR5Jywge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IHV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcGF0aDogJ3Bvc2l0aW9uJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkdW1wOiB7IHZhbHVlOiBub3JtYWxpemVkUG9zaXRpb24udmFsdWUgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgICAgdXBkYXRlcy5wdXNoKCdwb3NpdGlvbicpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpZiAocm90YXRpb24pIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgbm9ybWFsaXplZFJvdGF0aW9uID0gdGhpcy5ub3JtYWxpemVUcmFuc2Zvcm1WYWx1ZShyb3RhdGlvbiwgJ3JvdGF0aW9uJywgaXMyRE5vZGUpO1xuICAgICAgICAgICAgICAgICAgICBpZiAobm9ybWFsaXplZFJvdGF0aW9uLndhcm5pbmcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdhcm5pbmdzLnB1c2gobm9ybWFsaXplZFJvdGF0aW9uLndhcm5pbmcpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICB1cGRhdGVQcm9taXNlcy5wdXNoKFxuICAgICAgICAgICAgICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnc2V0LXByb3BlcnR5Jywge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IHV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcGF0aDogJ3JvdGF0aW9uJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkdW1wOiB7IHZhbHVlOiBub3JtYWxpemVkUm90YXRpb24udmFsdWUgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgICAgdXBkYXRlcy5wdXNoKCdyb3RhdGlvbicpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpZiAoc2NhbGUpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgbm9ybWFsaXplZFNjYWxlID0gdGhpcy5ub3JtYWxpemVUcmFuc2Zvcm1WYWx1ZShzY2FsZSwgJ3NjYWxlJywgaXMyRE5vZGUpO1xuICAgICAgICAgICAgICAgICAgICBpZiAobm9ybWFsaXplZFNjYWxlLndhcm5pbmcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdhcm5pbmdzLnB1c2gobm9ybWFsaXplZFNjYWxlLndhcm5pbmcpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICB1cGRhdGVQcm9taXNlcy5wdXNoKFxuICAgICAgICAgICAgICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnc2V0LXByb3BlcnR5Jywge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IHV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcGF0aDogJ3NjYWxlJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkdW1wOiB7IHZhbHVlOiBub3JtYWxpemVkU2NhbGUudmFsdWUgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgICAgdXBkYXRlcy5wdXNoKCdzY2FsZScpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpZiAodXBkYXRlUHJvbWlzZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbCgnTm8gdHJhbnNmb3JtIHByb3BlcnRpZXMgc3BlY2lmaWVkJykpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGF3YWl0IFByb21pc2UuYWxsKHVwZGF0ZVByb21pc2VzKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAvLyBWZXJpZnkgdGhlIGNoYW5nZXMgYnkgZ2V0dGluZyB1cGRhdGVkIG5vZGUgaW5mb1xuICAgICAgICAgICAgICAgIGNvbnN0IHVwZGF0ZWROb2RlSW5mbyA9IGF3YWl0IHRoaXMuZ2V0Tm9kZUluZm8odXVpZCk7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVzcG9uc2U6IGFueSA9IHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYFRyYW5zZm9ybSBwcm9wZXJ0aWVzIHVwZGF0ZWQ6ICR7dXBkYXRlcy5qb2luKCcsICcpfSAke2lzMkROb2RlID8gJygyRCBub2RlKScgOiAnKDNEIG5vZGUpJ31gLFxuICAgICAgICAgICAgICAgICAgICB1cGRhdGVkUHJvcGVydGllczogdXBkYXRlcyxcbiAgICAgICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWQ6IHV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBub2RlVHlwZTogaXMyRE5vZGUgPyAnMkQnIDogJzNEJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGFwcGxpZWRDaGFuZ2VzOiB1cGRhdGVzLFxuICAgICAgICAgICAgICAgICAgICAgICAgdHJhbnNmb3JtQ29uc3RyYWludHM6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwb3NpdGlvbjogaXMyRE5vZGUgPyAneCwgeSBvbmx5ICh6IGlnbm9yZWQpJyA6ICd4LCB5LCB6IGFsbCB1c2VkJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByb3RhdGlvbjogaXMyRE5vZGUgPyAneiBvbmx5ICh4LCB5IGlnbm9yZWQpJyA6ICd4LCB5LCB6IGFsbCB1c2VkJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzY2FsZTogaXMyRE5vZGUgPyAneCwgeSBtYWluLCB6IHR5cGljYWxseSAxJyA6ICd4LCB5LCB6IGFsbCB1c2VkJ1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICB2ZXJpZmljYXRpb25EYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBub2RlSW5mbzogdXBkYXRlZE5vZGVJbmZvLmRhdGEsXG4gICAgICAgICAgICAgICAgICAgICAgICB0cmFuc2Zvcm1EZXRhaWxzOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgb3JpZ2luYWxOb2RlVHlwZTogaXMyRE5vZGUgPyAnMkQnIDogJzNEJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBhcHBsaWVkVHJhbnNmb3JtczogdXBkYXRlcyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKVxuICAgICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGJlZm9yZUFmdGVyQ29tcGFyaXNvbjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJlZm9yZTogbm9kZUluZm8sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYWZ0ZXI6IHVwZGF0ZWROb2RlSW5mby5kYXRhXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGlmICh3YXJuaW5ncy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3BvbnNlLndhcm5pbmcgPSB3YXJuaW5ncy5qb2luKCc7ICcpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICByZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGBGYWlsZWQgdG8gdXBkYXRlIHRyYW5zZm9ybTogJHtlcnIubWVzc2FnZX1gKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgaXMyRE5vZGUobm9kZUluZm86IGFueSk6IGJvb2xlYW4ge1xuICAgICAgICAvLyBDaGVjayBpZiBub2RlIGhhcyAyRC1zcGVjaWZpYyBjb21wb25lbnRzIG9yIGlzIHVuZGVyIENhbnZhc1xuICAgICAgICBjb25zdCBjb21wb25lbnRzID0gbm9kZUluZm8uY29tcG9uZW50cyB8fCBbXTtcbiAgICAgICAgXG4gICAgICAgIC8vIENoZWNrIGZvciBjb21tb24gMkQgY29tcG9uZW50c1xuICAgICAgICBjb25zdCBoYXMyRENvbXBvbmVudHMgPSBjb21wb25lbnRzLnNvbWUoKGNvbXA6IGFueSkgPT4gXG4gICAgICAgICAgICBjb21wLnR5cGUgJiYgKFxuICAgICAgICAgICAgICAgIGNvbXAudHlwZS5pbmNsdWRlcygnY2MuU3ByaXRlJykgfHxcbiAgICAgICAgICAgICAgICBjb21wLnR5cGUuaW5jbHVkZXMoJ2NjLkxhYmVsJykgfHxcbiAgICAgICAgICAgICAgICBjb21wLnR5cGUuaW5jbHVkZXMoJ2NjLkJ1dHRvbicpIHx8XG4gICAgICAgICAgICAgICAgY29tcC50eXBlLmluY2x1ZGVzKCdjYy5MYXlvdXQnKSB8fFxuICAgICAgICAgICAgICAgIGNvbXAudHlwZS5pbmNsdWRlcygnY2MuV2lkZ2V0JykgfHxcbiAgICAgICAgICAgICAgICBjb21wLnR5cGUuaW5jbHVkZXMoJ2NjLk1hc2snKSB8fFxuICAgICAgICAgICAgICAgIGNvbXAudHlwZS5pbmNsdWRlcygnY2MuR3JhcGhpY3MnKVxuICAgICAgICAgICAgKVxuICAgICAgICApO1xuICAgICAgICBcbiAgICAgICAgaWYgKGhhczJEQ29tcG9uZW50cykge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vIENoZWNrIGZvciAzRC1zcGVjaWZpYyBjb21wb25lbnRzICBcbiAgICAgICAgY29uc3QgaGFzM0RDb21wb25lbnRzID0gY29tcG9uZW50cy5zb21lKChjb21wOiBhbnkpID0+XG4gICAgICAgICAgICBjb21wLnR5cGUgJiYgKFxuICAgICAgICAgICAgICAgIGNvbXAudHlwZS5pbmNsdWRlcygnY2MuTWVzaFJlbmRlcmVyJykgfHxcbiAgICAgICAgICAgICAgICBjb21wLnR5cGUuaW5jbHVkZXMoJ2NjLkNhbWVyYScpIHx8XG4gICAgICAgICAgICAgICAgY29tcC50eXBlLmluY2x1ZGVzKCdjYy5MaWdodCcpIHx8XG4gICAgICAgICAgICAgICAgY29tcC50eXBlLmluY2x1ZGVzKCdjYy5EaXJlY3Rpb25hbExpZ2h0JykgfHxcbiAgICAgICAgICAgICAgICBjb21wLnR5cGUuaW5jbHVkZXMoJ2NjLlBvaW50TGlnaHQnKSB8fFxuICAgICAgICAgICAgICAgIGNvbXAudHlwZS5pbmNsdWRlcygnY2MuU3BvdExpZ2h0JylcbiAgICAgICAgICAgIClcbiAgICAgICAgKTtcbiAgICAgICAgXG4gICAgICAgIGlmIChoYXMzRENvbXBvbmVudHMpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgLy8gRGVmYXVsdCBoZXVyaXN0aWM6IGlmIHogcG9zaXRpb24gaXMgMCBhbmQgaGFzbid0IGJlZW4gY2hhbmdlZCwgbGlrZWx5IDJEXG4gICAgICAgIGNvbnN0IHBvc2l0aW9uID0gbm9kZUluZm8ucG9zaXRpb247XG4gICAgICAgIGlmIChwb3NpdGlvbiAmJiBNYXRoLmFicyhwb3NpdGlvbi56KSA8IDAuMDAxKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgLy8gRGVmYXVsdCB0byAzRCBpZiB1bmNlcnRhaW5cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIHByaXZhdGUgbm9ybWFsaXplVHJhbnNmb3JtVmFsdWUodmFsdWU6IGFueSwgdHlwZTogJ3Bvc2l0aW9uJyB8ICdyb3RhdGlvbicgfCAnc2NhbGUnLCBpczJEOiBib29sZWFuKTogeyB2YWx1ZTogYW55LCB3YXJuaW5nPzogc3RyaW5nIH0ge1xuICAgICAgICBjb25zdCByZXN1bHQgPSB7IC4uLnZhbHVlIH07XG4gICAgICAgIGxldCB3YXJuaW5nOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gICAgICAgIFxuICAgICAgICBpZiAoaXMyRCkge1xuICAgICAgICAgICAgc3dpdGNoICh0eXBlKSB7XG4gICAgICAgICAgICAgICAgY2FzZSAncG9zaXRpb24nOlxuICAgICAgICAgICAgICAgICAgICBpZiAodmFsdWUueiAhPT0gdW5kZWZpbmVkICYmIE1hdGguYWJzKHZhbHVlLnopID4gMC4wMDEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdhcm5pbmcgPSBgMkQgbm9kZTogeiBwb3NpdGlvbiAoJHt2YWx1ZS56fSkgaWdub3JlZCwgc2V0IHRvIDBgO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0LnogPSAwO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHZhbHVlLnogPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0LnogPSAwO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBjYXNlICdyb3RhdGlvbic6XG4gICAgICAgICAgICAgICAgICAgIGlmICgodmFsdWUueCAhPT0gdW5kZWZpbmVkICYmIE1hdGguYWJzKHZhbHVlLngpID4gMC4wMDEpIHx8IFxuICAgICAgICAgICAgICAgICAgICAgICAgKHZhbHVlLnkgIT09IHVuZGVmaW5lZCAmJiBNYXRoLmFicyh2YWx1ZS55KSA+IDAuMDAxKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgd2FybmluZyA9IGAyRCBub2RlOiB4LHkgcm90YXRpb25zIGlnbm9yZWQsIG9ubHkgeiByb3RhdGlvbiBhcHBsaWVkYDtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdC54ID0gMDtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdC55ID0gMDtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdC54ID0gcmVzdWx0LnggfHwgMDtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdC55ID0gcmVzdWx0LnkgfHwgMDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXN1bHQueiA9IHJlc3VsdC56IHx8IDA7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBjYXNlICdzY2FsZSc6XG4gICAgICAgICAgICAgICAgICAgIGlmICh2YWx1ZS56ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdC56ID0gMTsgLy8gRGVmYXVsdCBzY2FsZSBmb3IgMkRcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIDNEIG5vZGUgLSBlbnN1cmUgYWxsIGF4ZXMgYXJlIGRlZmluZWRcbiAgICAgICAgICAgIHJlc3VsdC54ID0gcmVzdWx0LnggIT09IHVuZGVmaW5lZCA/IHJlc3VsdC54IDogKHR5cGUgPT09ICdzY2FsZScgPyAxIDogMCk7XG4gICAgICAgICAgICByZXN1bHQueSA9IHJlc3VsdC55ICE9PSB1bmRlZmluZWQgPyByZXN1bHQueSA6ICh0eXBlID09PSAnc2NhbGUnID8gMSA6IDApO1xuICAgICAgICAgICAgcmVzdWx0LnogPSByZXN1bHQueiAhPT0gdW5kZWZpbmVkID8gcmVzdWx0LnogOiAodHlwZSA9PT0gJ3NjYWxlJyA/IDEgOiAwKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgcmV0dXJuIHsgdmFsdWU6IHJlc3VsdCwgd2FybmluZyB9O1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZGVsZXRlTm9kZSh1dWlkOiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3JlbW92ZS1ub2RlJywgeyB1dWlkOiB1dWlkIH0pLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2sodW5kZWZpbmVkLCAnTm9kZSBkZWxldGVkIHN1Y2Nlc3NmdWxseScpKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBtb3ZlTm9kZShub2RlVXVpZDogc3RyaW5nLCBuZXdQYXJlbnRVdWlkOiBzdHJpbmcsIHNpYmxpbmdJbmRleDogbnVtYmVyID0gLTEpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIC8vIFVzZSBjb3JyZWN0IHNldC1wYXJlbnQgQVBJIGluc3RlYWQgb2YgbW92ZS1ub2RlXG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdzZXQtcGFyZW50Jywge1xuICAgICAgICAgICAgICAgIHBhcmVudDogbmV3UGFyZW50VXVpZCxcbiAgICAgICAgICAgICAgICB1dWlkczogW25vZGVVdWlkXSxcbiAgICAgICAgICAgICAgICBrZWVwV29ybGRUcmFuc2Zvcm06IGZhbHNlXG4gICAgICAgICAgICB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHVuZGVmaW5lZCwgJ05vZGUgbW92ZWQgc3VjY2Vzc2Z1bGx5JykpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGR1cGxpY2F0ZU5vZGUodXVpZDogc3RyaW5nLCBpbmNsdWRlQ2hpbGRyZW46IGJvb2xlYW4gPSB0cnVlKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICAvLyBOb3RlOiBpbmNsdWRlQ2hpbGRyZW4gcGFyYW1ldGVyIGlzIGFjY2VwdGVkIGZvciBmdXR1cmUgdXNlIGJ1dCBub3QgY3VycmVudGx5IGltcGxlbWVudGVkXG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdkdXBsaWNhdGUtbm9kZScsIHV1aWQpLnRoZW4oKHJlc3VsdDogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICBuZXdVdWlkOiByZXN1bHQudXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdOb2RlIGR1cGxpY2F0ZWQgc3VjY2Vzc2Z1bGx5J1xuICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZGV0ZWN0Tm9kZVR5cGUodXVpZDogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKGFzeW5jIChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IG5vZGVJbmZvUmVzcG9uc2UgPSBhd2FpdCB0aGlzLmdldE5vZGVJbmZvKHV1aWQpO1xuICAgICAgICAgICAgICAgIGlmICghbm9kZUluZm9SZXNwb25zZS5zdWNjZXNzIHx8ICFub2RlSW5mb1Jlc3BvbnNlLmRhdGEpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKCdGYWlsZWQgdG8gZ2V0IG5vZGUgaW5mb3JtYXRpb24nKSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBjb25zdCBub2RlSW5mbyA9IG5vZGVJbmZvUmVzcG9uc2UuZGF0YTtcbiAgICAgICAgICAgICAgICBjb25zdCBpczJEID0gdGhpcy5pczJETm9kZShub2RlSW5mbyk7XG4gICAgICAgICAgICAgICAgY29uc3QgY29tcG9uZW50cyA9IG5vZGVJbmZvLmNvbXBvbmVudHMgfHwgW107XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgLy8gQ29sbGVjdCBkZXRlY3Rpb24gcmVhc29uc1xuICAgICAgICAgICAgICAgIGNvbnN0IGRldGVjdGlvblJlYXNvbnM6IHN0cmluZ1tdID0gW107XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgLy8gQ2hlY2sgZm9yIDJEIGNvbXBvbmVudHNcbiAgICAgICAgICAgICAgICBjb25zdCB0d29EQ29tcG9uZW50cyA9IGNvbXBvbmVudHMuZmlsdGVyKChjb21wOiBhbnkpID0+IFxuICAgICAgICAgICAgICAgICAgICBjb21wLnR5cGUgJiYgKFxuICAgICAgICAgICAgICAgICAgICAgICAgY29tcC50eXBlLmluY2x1ZGVzKCdjYy5TcHJpdGUnKSB8fFxuICAgICAgICAgICAgICAgICAgICAgICAgY29tcC50eXBlLmluY2x1ZGVzKCdjYy5MYWJlbCcpIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICBjb21wLnR5cGUuaW5jbHVkZXMoJ2NjLkJ1dHRvbicpIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICBjb21wLnR5cGUuaW5jbHVkZXMoJ2NjLkxheW91dCcpIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICBjb21wLnR5cGUuaW5jbHVkZXMoJ2NjLldpZGdldCcpIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICBjb21wLnR5cGUuaW5jbHVkZXMoJ2NjLk1hc2snKSB8fFxuICAgICAgICAgICAgICAgICAgICAgICAgY29tcC50eXBlLmluY2x1ZGVzKCdjYy5HcmFwaGljcycpXG4gICAgICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIC8vIENoZWNrIGZvciAzRCBjb21wb25lbnRzXG4gICAgICAgICAgICAgICAgY29uc3QgdGhyZWVEQ29tcG9uZW50cyA9IGNvbXBvbmVudHMuZmlsdGVyKChjb21wOiBhbnkpID0+XG4gICAgICAgICAgICAgICAgICAgIGNvbXAudHlwZSAmJiAoXG4gICAgICAgICAgICAgICAgICAgICAgICBjb21wLnR5cGUuaW5jbHVkZXMoJ2NjLk1lc2hSZW5kZXJlcicpIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICBjb21wLnR5cGUuaW5jbHVkZXMoJ2NjLkNhbWVyYScpIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICBjb21wLnR5cGUuaW5jbHVkZXMoJ2NjLkxpZ2h0JykgfHxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbXAudHlwZS5pbmNsdWRlcygnY2MuRGlyZWN0aW9uYWxMaWdodCcpIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICBjb21wLnR5cGUuaW5jbHVkZXMoJ2NjLlBvaW50TGlnaHQnKSB8fFxuICAgICAgICAgICAgICAgICAgICAgICAgY29tcC50eXBlLmluY2x1ZGVzKCdjYy5TcG90TGlnaHQnKVxuICAgICAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgICAgIGlmICh0d29EQ29tcG9uZW50cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGRldGVjdGlvblJlYXNvbnMucHVzaChgSGFzIDJEIGNvbXBvbmVudHM6ICR7dHdvRENvbXBvbmVudHMubWFwKChjOiBhbnkpID0+IGMudHlwZSkuam9pbignLCAnKX1gKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaWYgKHRocmVlRENvbXBvbmVudHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICBkZXRlY3Rpb25SZWFzb25zLnB1c2goYEhhcyAzRCBjb21wb25lbnRzOiAke3RocmVlRENvbXBvbmVudHMubWFwKChjOiBhbnkpID0+IGMudHlwZSkuam9pbignLCAnKX1gKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgLy8gQ2hlY2sgcG9zaXRpb24gZm9yIGhldXJpc3RpY1xuICAgICAgICAgICAgICAgIGNvbnN0IHBvc2l0aW9uID0gbm9kZUluZm8ucG9zaXRpb247XG4gICAgICAgICAgICAgICAgaWYgKHBvc2l0aW9uICYmIE1hdGguYWJzKHBvc2l0aW9uLnopIDwgMC4wMDEpIHtcbiAgICAgICAgICAgICAgICAgICAgZGV0ZWN0aW9uUmVhc29ucy5wdXNoKCdaIHBvc2l0aW9uIGlzIH4wIChsaWtlbHkgMkQpJyk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwb3NpdGlvbiAmJiBNYXRoLmFicyhwb3NpdGlvbi56KSA+IDAuMDAxKSB7XG4gICAgICAgICAgICAgICAgICAgIGRldGVjdGlvblJlYXNvbnMucHVzaChgWiBwb3NpdGlvbiBpcyAke3Bvc2l0aW9uLnp9IChsaWtlbHkgM0QpYCk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKGRldGVjdGlvblJlYXNvbnMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGRldGVjdGlvblJlYXNvbnMucHVzaCgnTm8gc3BlY2lmaWMgaW5kaWNhdG9ycyBmb3VuZCwgZGVmYXVsdGluZyBiYXNlZCBvbiBoZXVyaXN0aWNzJyk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICBub2RlVXVpZDogdXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG5vZGVOYW1lOiBub2RlSW5mby5uYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgbm9kZVR5cGU6IGlzMkQgPyAnMkQnIDogJzNEJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGRldGVjdGlvblJlYXNvbnM6IGRldGVjdGlvblJlYXNvbnMsXG4gICAgICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRzOiBjb21wb25lbnRzLm1hcCgoY29tcDogYW55KSA9PiAoe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6IGNvbXAudHlwZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYXRlZ29yeTogdGhpcy5nZXRDb21wb25lbnRDYXRlZ29yeShjb21wLnR5cGUpXG4gICAgICAgICAgICAgICAgICAgICAgICB9KSksXG4gICAgICAgICAgICAgICAgICAgICAgICBwb3NpdGlvbjogbm9kZUluZm8ucG9zaXRpb24sXG4gICAgICAgICAgICAgICAgICAgICAgICB0cmFuc2Zvcm1Db25zdHJhaW50czoge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBvc2l0aW9uOiBpczJEID8gJ3gsIHkgb25seSAoeiBpZ25vcmVkKScgOiAneCwgeSwgeiBhbGwgdXNlZCcsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcm90YXRpb246IGlzMkQgPyAneiBvbmx5ICh4LCB5IGlnbm9yZWQpJyA6ICd4LCB5LCB6IGFsbCB1c2VkJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzY2FsZTogaXMyRCA/ICd4LCB5IG1haW4sIHogdHlwaWNhbGx5IDEnIDogJ3gsIHksIHogYWxsIHVzZWQnXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGBGYWlsZWQgdG8gZGV0ZWN0IG5vZGUgdHlwZTogJHtlcnIubWVzc2FnZX1gKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgZ2V0Q29tcG9uZW50Q2F0ZWdvcnkoY29tcG9uZW50VHlwZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgICAgICAgaWYgKCFjb21wb25lbnRUeXBlKSByZXR1cm4gJ3Vua25vd24nO1xuICAgICAgICBcbiAgICAgICAgaWYgKGNvbXBvbmVudFR5cGUuaW5jbHVkZXMoJ2NjLlNwcml0ZScpIHx8IGNvbXBvbmVudFR5cGUuaW5jbHVkZXMoJ2NjLkxhYmVsJykgfHwgXG4gICAgICAgICAgICBjb21wb25lbnRUeXBlLmluY2x1ZGVzKCdjYy5CdXR0b24nKSB8fCBjb21wb25lbnRUeXBlLmluY2x1ZGVzKCdjYy5MYXlvdXQnKSB8fFxuICAgICAgICAgICAgY29tcG9uZW50VHlwZS5pbmNsdWRlcygnY2MuV2lkZ2V0JykgfHwgY29tcG9uZW50VHlwZS5pbmNsdWRlcygnY2MuTWFzaycpIHx8XG4gICAgICAgICAgICBjb21wb25lbnRUeXBlLmluY2x1ZGVzKCdjYy5HcmFwaGljcycpKSB7XG4gICAgICAgICAgICByZXR1cm4gJzJEJztcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgaWYgKGNvbXBvbmVudFR5cGUuaW5jbHVkZXMoJ2NjLk1lc2hSZW5kZXJlcicpIHx8IGNvbXBvbmVudFR5cGUuaW5jbHVkZXMoJ2NjLkNhbWVyYScpIHx8XG4gICAgICAgICAgICBjb21wb25lbnRUeXBlLmluY2x1ZGVzKCdjYy5MaWdodCcpIHx8IGNvbXBvbmVudFR5cGUuaW5jbHVkZXMoJ2NjLkRpcmVjdGlvbmFsTGlnaHQnKSB8fFxuICAgICAgICAgICAgY29tcG9uZW50VHlwZS5pbmNsdWRlcygnY2MuUG9pbnRMaWdodCcpIHx8IGNvbXBvbmVudFR5cGUuaW5jbHVkZXMoJ2NjLlNwb3RMaWdodCcpKSB7XG4gICAgICAgICAgICByZXR1cm4gJzNEJztcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgcmV0dXJuICdnZW5lcmljJztcbiAgICB9XG59XG4iXX0=