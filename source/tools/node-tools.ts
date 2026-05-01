import { ToolDefinition, ToolResponse, ToolExecutor, NodeInfo } from '../types';
import { ComponentTools } from './component-tools';
import { debugLog } from '../lib/log';
import { z } from '../lib/schema';
import { defineTools, ToolDef } from '../lib/define-tools';
import { runSceneMethod } from '../lib/scene-bridge';

// vec3 used by create_node's initialTransform — original schema had no
// per-axis description and no required marker, so axes are plain optional numbers.
const vec3Schema = z.object({
    x: z.number().optional(),
    y: z.number().optional(),
    z: z.number().optional(),
});

// Standard cc.Layers bit values. Custom user-defined layers go through the
// numeric branch of the create_node `layer` arg, so this list only enumerates
// the engine-shipped presets.
const LAYER_PRESETS = {
    DEFAULT: 1073741824,        // 1 << 30
    UI_2D: 33554432,            // 1 << 25
    SCENE_GIZMO: 16777216,      // 1 << 24
    UI_3D: 8388608,             // 1 << 23
    EDITOR: 4194304,            // 1 << 22
    GIZMOS: 2097152,            // 1 << 21
    IGNORE_RAYCAST: 1048576,    // 1 << 20
    PROFILER: 268435456,        // 1 << 28
} as const;
type LayerPreset = keyof typeof LAYER_PRESETS;

// set_node_transform has axis-specific descriptions per channel; rebuild each
// inline so the per-axis text matches the original hand-written schema exactly.
const transformPositionSchema = z.object({
    x: z.number().optional(),
    y: z.number().optional(),
    z: z.number().optional().describe('Z coordinate. Ignored/normalized for 2D nodes.'),
});

const transformRotationSchema = z.object({
    x: z.number().optional().describe('X euler rotation. Ignored/normalized for 2D nodes.'),
    y: z.number().optional().describe('Y euler rotation. Ignored/normalized for 2D nodes.'),
    z: z.number().optional().describe('Z euler rotation. Main rotation axis for 2D nodes.'),
});

const transformScaleSchema = z.object({
    x: z.number().optional(),
    y: z.number().optional(),
    z: z.number().optional().describe('Z scale. Usually 1 for 2D nodes.'),
});

export class NodeTools implements ToolExecutor {
    private componentTools = new ComponentTools();
    private readonly exec: ToolExecutor;

    constructor() {
        const defs: ToolDef[] = [
            { name: 'create_node', description: 'Create a node in current scene; supports empty, components, or prefab/asset instance. Provide parentUuid for predictable placement.',
                inputSchema: z.object({
                    name: z.string().describe('New node name. The response returns the created UUID.'),
                    parentUuid: z.string().optional().describe('Parent node UUID. Strongly recommended; omit only when creating at scene root.'),
                    nodeType: z.enum(['Node', '2DNode', '3DNode']).default('Node').describe('Empty-node type hint. Usually unnecessary when instantiating from assetUuid/assetPath.'),
                    siblingIndex: z.number().default(-1).describe('Sibling index under the parent. -1 means append.'),
                    assetUuid: z.string().optional().describe('Asset UUID to instantiate from, e.g. prefab UUID. Creates an asset instance instead of an empty node.'),
                    assetPath: z.string().optional().describe('db:// asset path to instantiate from. Alternative to assetUuid; resolved before create-node.'),
                    components: z.array(z.string()).optional().describe('Component types to add after creation, e.g. ["cc.Sprite","cc.Button"].'),
                    unlinkPrefab: z.boolean().default(false).describe('When instantiating a prefab, immediately unlink it into a regular node. Default false preserves prefab link.'),
                    keepWorldTransform: z.boolean().default(false).describe('Preserve world transform while parenting/creating when Cocos supports it.'),
                    layer: z.union([
                        z.enum(['DEFAULT', 'UI_2D', 'UI_3D', 'SCENE_GIZMO', 'EDITOR', 'GIZMOS', 'IGNORE_RAYCAST', 'PROFILER']),
                        z.number().int().nonnegative(),
                    ]).optional().describe('Node layer (cc.Layers). Accepts preset name (e.g. "UI_2D") or raw bitmask number. If omitted: auto-detected — UI_2D when any ancestor has cc.Canvas (so UI camera renders the new node), otherwise leaves the create-node default (DEFAULT). Required for UI nodes under Canvas; without it the node is invisible to the UI camera.'),
                    initialTransform: z.object({
                        position: vec3Schema.optional(),
                        rotation: vec3Schema.optional(),
                        scale: vec3Schema.optional(),
                    }).optional().describe('Initial transform applied after create-node via set_node_transform.'),
                }), handler: a => this.createNode(a) },
            { name: 'get_node_info', description: 'Read one node by UUID, including transform, children, and component summary. No mutation.',
                inputSchema: z.object({
                    uuid: z.string().describe('Node UUID to inspect.'),
                }), handler: a => this.getNodeInfo(a.uuid) },
            { name: 'find_nodes', description: 'Search current-scene nodes by name pattern and return multiple matches. No mutation; use when names may be duplicated.',
                inputSchema: z.object({
                    pattern: z.string().describe('Node name search pattern. Partial match unless exactMatch=true.'),
                    exactMatch: z.boolean().default(false).describe('Require exact node name match. Default false.'),
                }), handler: a => this.findNodes(a.pattern, a.exactMatch) },
            { name: 'find_node_by_name', description: 'Find the first node with an exact name. No mutation; only safe when the name is unique enough.',
                inputSchema: z.object({
                    name: z.string().describe('Exact node name to find. Returns the first match only.'),
                }), handler: a => this.findNodeByName(a.name) },
            { name: 'get_all_nodes', description: 'List all current-scene nodes with name/uuid/type/path; primary source for nodeUuid/parentUuid.',
                inputSchema: z.object({}), handler: () => this.getAllNodes() },
            { name: 'set_node_property', description: 'Write a node property path. Mutates scene; use for active/name/layer. Prefer set_node_transform for position/rotation/scale.',
                inputSchema: z.object({
                    uuid: z.string().describe('Node UUID to modify.'),
                    property: z.string().describe('Node property path, e.g. active, name, layer. Prefer set_node_transform for position/rotation/scale.'),
                    value: z.any().describe('Value to write; must match the Cocos dump shape for the property path.'),
                }), handler: a => this.setNodeProperty(a.uuid, a.property, a.value) },
            { name: 'set_node_transform', description: 'Write position/rotation/scale with 2D/3D normalization; mutates scene.',
                inputSchema: z.object({
                    uuid: z.string().describe('Node UUID whose transform should be changed.'),
                    position: transformPositionSchema.optional().describe('Local position. 2D nodes mainly use x/y; 3D nodes use x/y/z.'),
                    rotation: transformRotationSchema.optional().describe('Local euler rotation. 2D nodes mainly use z; 3D nodes use x/y/z.'),
                    scale: transformScaleSchema.optional().describe('Local scale. 2D nodes mainly use x/y and usually keep z=1.'),
                }), handler: a => this.setNodeTransform(a) },
            { name: 'delete_node', description: 'Delete a node from the current scene. Mutates scene and removes children; verify UUID first.',
                inputSchema: z.object({
                    uuid: z.string().describe('Node UUID to delete. Children are removed with the node.'),
                }), handler: a => this.deleteNode(a.uuid) },
            { name: 'move_node', description: 'Reparent a node under a new parent. Mutates scene; current implementation does not preserve world transform.',
                inputSchema: z.object({
                    nodeUuid: z.string().describe('Node UUID to reparent.'),
                    newParentUuid: z.string().describe('New parent node UUID.'),
                    siblingIndex: z.number().default(-1).describe('Sibling index under the new parent. Currently advisory; move uses set-parent.'),
                }), handler: a => this.moveNode(a.nodeUuid, a.newParentUuid, a.siblingIndex) },
            { name: 'duplicate_node', description: 'Duplicate a node and return the new UUID. Mutates scene; child inclusion follows Cocos duplicate-node behavior.',
                inputSchema: z.object({
                    uuid: z.string().describe('Node UUID to duplicate.'),
                    includeChildren: z.boolean().default(true).describe('Whether children should be included; actual behavior follows Cocos duplicate-node.'),
                }), handler: a => this.duplicateNode(a.uuid, a.includeChildren) },
            { name: 'detect_node_type', description: 'Heuristically classify a node as 2D or 3D from components/transform. No mutation; helps choose transform semantics.',
                inputSchema: z.object({
                    uuid: z.string().describe('Node UUID to classify as 2D or 3D by heuristic.'),
                }), handler: a => this.detectNodeType(a.uuid) },
        ];
        this.exec = defineTools(defs);
    }

    getTools(): ToolDefinition[] { return this.exec.getTools(); }
    execute(toolName: string, args: any): Promise<ToolResponse> { return this.exec.execute(toolName, args); }

    private async createNode(args: any): Promise<ToolResponse> {
        return new Promise(async (resolve) => {
            try {
                let targetParentUuid = args.parentUuid;
                
                // 如果沒有提供父節點UUID，獲取場景根節點
                if (!targetParentUuid) {
                    try {
                        const sceneInfo = await Editor.Message.request('scene', 'query-node-tree');
                        if (sceneInfo && typeof sceneInfo === 'object' && !Array.isArray(sceneInfo) && Object.prototype.hasOwnProperty.call(sceneInfo, 'uuid')) {
                            targetParentUuid = (sceneInfo as any).uuid;
                            debugLog(`No parent specified, using scene root: ${targetParentUuid}`);
                        } else if (Array.isArray(sceneInfo) && sceneInfo.length > 0 && sceneInfo[0].uuid) {
                            targetParentUuid = sceneInfo[0].uuid;
                            debugLog(`No parent specified, using scene root: ${targetParentUuid}`);
                        } else {
                            const currentScene = await Editor.Message.request('scene', 'query-current-scene');
                            if (currentScene && currentScene.uuid) {
                                targetParentUuid = currentScene.uuid;
                            }
                        }
                    } catch (err) {
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
                            debugLog(`Asset path '${args.assetPath}' resolved to UUID: ${finalAssetUuid}`);
                        } else {
                            resolve({
                                success: false,
                                error: `Asset not found at path: ${args.assetPath}`
                            });
                            return;
                        }
                    } catch (err) {
                        resolve({
                            success: false,
                            error: `Failed to resolve asset path '${args.assetPath}': ${err}`
                        });
                        return;
                    }
                }

                // 構建create-node選項
                const createNodeOptions: any = {
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
                } else if (args.nodeType && args.nodeType !== 'Node' && !finalAssetUuid) {
                    // 只有在不從資源實例化時才添加nodeType組件
                    createNodeOptions.components = [args.nodeType];
                }

                // 保持世界變換
                if (args.keepWorldTransform) {
                    createNodeOptions.keepWorldTransform = true;
                }

                // 不使用dump參數處理初始變換，創建後使用set_node_transform設置

                debugLog('Creating node with options:', createNodeOptions);

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
                    } catch (err) {
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
                                    debugLog(`Component ${componentType} added successfully`);
                                } else {
                                    console.warn(`Failed to add component ${componentType}:`, result.error);
                                }
                            } catch (err) {
                                console.warn(`Failed to add component ${componentType}:`, err);
                            }
                        }
                    } catch (err) {
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
                        debugLog('Initial transform applied successfully');
                    } catch (err) {
                        console.warn('Failed to set initial transform:', err);
                    }
                }

                // 設定 layer（user-provided 或 auto-detect Canvas ancestor）
                let resolvedLayer: number | null = null;
                let layerSource: 'explicit' | 'auto-canvas' | 'default' = 'default';
                if (uuid) {
                    if (args.layer !== undefined && args.layer !== null) {
                        if (typeof args.layer === 'number') {
                            resolvedLayer = args.layer;
                            layerSource = 'explicit';
                        } else if (typeof args.layer === 'string') {
                            const preset = (LAYER_PRESETS as any)[args.layer] as number | undefined;
                            if (typeof preset !== 'number') {
                                resolve({
                                    success: false,
                                    error: `Unknown layer preset '${args.layer}'. Allowed: ${Object.keys(LAYER_PRESETS).join(', ')}, or pass a raw number.`,
                                });
                                return;
                            }
                            resolvedLayer = preset;
                            layerSource = 'explicit';
                        }
                    } else if (targetParentUuid) {
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
                            debugLog(`Applied layer ${resolvedLayer} (${layerSource}) to ${uuid}`);
                        } catch (err) {
                            console.warn('Failed to set layer:', err);
                        }
                    }
                }

                // 獲取創建後的節點信息進行驗證
                let verificationData: any = null;
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
                } catch (err) {
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

            } catch (err: any) {
                resolve({ 
                    success: false, 
                    error: `Failed to create node: ${err.message}. Args: ${JSON.stringify(args)}`
                });
            }
        });
    }

    // Walk up from `startUuid` (inclusive) checking for a component whose
    // __type__ matches `componentType`. Returns true if found anywhere in the
    // chain up to (but not including) the scene root. Bounded to 64 steps as
    // a safety stop in case of a malformed parent graph.
    private async ancestorHasComponent(startUuid: string, componentType: string): Promise<boolean> {
        let cursor: string | null = startUuid;
        for (let hops = 0; hops < 64 && cursor; hops++) {
            try {
                const data: any = await Editor.Message.request('scene', 'query-node', cursor);
                if (!data) return false;
                if (Array.isArray(data.__comps__)) {
                    for (const comp of data.__comps__) {
                        if (comp && (comp.__type__ === componentType || comp.type === componentType || comp.cid === componentType)) {
                            return true;
                        }
                    }
                }
                const parentUuid = data.parent?.value?.uuid ?? null;
                if (!parentUuid || parentUuid === cursor) return false;
                cursor = parentUuid;
            } catch {
                return false;
            }
        }
        return false;
    }

    private async getNodeInfo(uuid: string): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'query-node', uuid).then((nodeData: any) => {
                if (!nodeData) {
                    resolve({
                        success: false,
                        error: 'Node not found or invalid response'
                    });
                    return;
                }
                
                // 根據實際返回的數據結構解析節點信息
                const info: NodeInfo = {
                    uuid: nodeData.uuid?.value || uuid,
                    name: nodeData.name?.value || 'Unknown',
                    active: nodeData.active?.value !== undefined ? nodeData.active.value : true,
                    position: nodeData.position?.value || { x: 0, y: 0, z: 0 },
                    rotation: nodeData.rotation?.value || { x: 0, y: 0, z: 0 },
                    scale: nodeData.scale?.value || { x: 1, y: 1, z: 1 },
                    parent: nodeData.parent?.value?.uuid || null,
                    children: nodeData.children || [],
                    components: (nodeData.__comps__ || []).map((comp: any) => ({
                        type: comp.__type__ || 'Unknown',
                        enabled: comp.enabled !== undefined ? comp.enabled : true
                    })),
                    layer: nodeData.layer?.value || 1073741824,
                    mobility: nodeData.mobility?.value || 0
                };
                resolve({ success: true, data: info });
            }).catch((err: Error) => {
                resolve({ success: false, error: err.message });
            });
        });
    }

    private async findNodes(pattern: string, exactMatch: boolean = false): Promise<ToolResponse> {
        return new Promise((resolve) => {
            // Note: 'query-nodes-by-name' API doesn't exist in official documentation
            // Using tree traversal as primary approach
            Editor.Message.request('scene', 'query-node-tree').then((tree: any) => {
                const nodes: any[] = [];
                
                const searchTree = (node: any, currentPath: string = '') => {
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
                
                resolve({ success: true, data: nodes });
            }).catch((err: Error) => {
                // 備用方案：使用場景腳本
                runSceneMethod('findNodes', [pattern, exactMatch]).then((result: any) => {
                    resolve(result);
                }).catch((err2: Error) => {
                    resolve({ success: false, error: `Tree search failed: ${err.message}, Scene script failed: ${err2.message}` });
                });
            });
        });
    }

    private async findNodeByName(name: string): Promise<ToolResponse> {
        return new Promise((resolve) => {
            // 優先嚐試使用 Editor API 查詢節點樹並搜索
            Editor.Message.request('scene', 'query-node-tree').then((tree: any) => {
                const foundNode = this.searchNodeInTree(tree, name);
                if (foundNode) {
                    resolve({
                        success: true,
                        data: {
                            uuid: foundNode.uuid,
                            name: foundNode.name,
                            path: this.getNodePath(foundNode)
                        }
                    });
                } else {
                    resolve({ success: false, error: `Node '${name}' not found` });
                }
            }).catch((err: Error) => {
                // 備用方案：使用場景腳本
                runSceneMethod('findNodeByName', [name]).then((result: any) => {
                    resolve(result);
                }).catch((err2: Error) => {
                    resolve({ success: false, error: `Direct API failed: ${err.message}, Scene script failed: ${err2.message}` });
                });
            });
        });
    }

    private searchNodeInTree(node: any, targetName: string): any {
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

    private async getAllNodes(): Promise<ToolResponse> {
        return new Promise((resolve) => {
            // 嘗試查詢場景節點樹
            Editor.Message.request('scene', 'query-node-tree').then((tree: any) => {
                const nodes: any[] = [];
                
                const traverseTree = (node: any) => {
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
                
                resolve({
                    success: true,
                    data: {
                        totalNodes: nodes.length,
                        nodes: nodes
                    }
                });
            }).catch((err: Error) => {
                // 備用方案：使用場景腳本
                runSceneMethod('getAllNodes', []).then((result: any) => {
                    resolve(result);
                }).catch((err2: Error) => {
                    resolve({ success: false, error: `Direct API failed: ${err.message}, Scene script failed: ${err2.message}` });
                });
            });
        });
    }

    private getNodePath(node: any): string {
        const path = [node.name];
        let current = node.parent;
        while (current && current.name !== 'Canvas') {
            path.unshift(current.name);
            current = current.parent;
        }
        return path.join('/');
    }

    private async setNodeProperty(uuid: string, property: string, value: any): Promise<ToolResponse> {
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
                    resolve({
                        success: true,
                        message: `Property '${property}' updated successfully (verification failed)`
                    });
                });
            }).catch((err: Error) => {
                // 如果直接設置失敗，嘗試使用場景腳本
                runSceneMethod('setNodeProperty', [uuid, property, value]).then((result: any) => {
                    resolve(result);
                }).catch((err2: Error) => {
                    resolve({ success: false, error: `Direct API failed: ${err.message}, Scene script failed: ${err2.message}` });
                });
            });
        });
    }

    private async setNodeTransform(args: any): Promise<ToolResponse> {
        return new Promise(async (resolve) => {
            const { uuid, position, rotation, scale } = args;
            const updatePromises: Promise<any>[] = [];
            const updates: string[] = [];
            const warnings: string[] = [];
            
            try {
                // First get node info to determine if it's 2D or 3D
                const nodeInfoResponse = await this.getNodeInfo(uuid);
                if (!nodeInfoResponse.success || !nodeInfoResponse.data) {
                    resolve({ success: false, error: 'Failed to get node information' });
                    return;
                }
                
                const nodeInfo = nodeInfoResponse.data;
                const is2DNode = this.is2DNode(nodeInfo);
                
                if (position) {
                    const normalizedPosition = this.normalizeTransformValue(position, 'position', is2DNode);
                    if (normalizedPosition.warning) {
                        warnings.push(normalizedPosition.warning);
                    }
                    
                    updatePromises.push(
                        Editor.Message.request('scene', 'set-property', {
                            uuid: uuid,
                            path: 'position',
                            dump: { value: normalizedPosition.value }
                        })
                    );
                    updates.push('position');
                }
                
                if (rotation) {
                    const normalizedRotation = this.normalizeTransformValue(rotation, 'rotation', is2DNode);
                    if (normalizedRotation.warning) {
                        warnings.push(normalizedRotation.warning);
                    }
                    
                    updatePromises.push(
                        Editor.Message.request('scene', 'set-property', {
                            uuid: uuid,
                            path: 'rotation',
                            dump: { value: normalizedRotation.value }
                        })
                    );
                    updates.push('rotation');
                }
                
                if (scale) {
                    const normalizedScale = this.normalizeTransformValue(scale, 'scale', is2DNode);
                    if (normalizedScale.warning) {
                        warnings.push(normalizedScale.warning);
                    }
                    
                    updatePromises.push(
                        Editor.Message.request('scene', 'set-property', {
                            uuid: uuid,
                            path: 'scale',
                            dump: { value: normalizedScale.value }
                        })
                    );
                    updates.push('scale');
                }
                
                if (updatePromises.length === 0) {
                    resolve({ success: false, error: 'No transform properties specified' });
                    return;
                }
                
                await Promise.all(updatePromises);
                
                // Verify the changes by getting updated node info
                const updatedNodeInfo = await this.getNodeInfo(uuid);
                const response: any = {
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
                
            } catch (err: any) {
                resolve({ 
                    success: false, 
                    error: `Failed to update transform: ${err.message}` 
                });
            }
        });
    }

    private is2DNode(nodeInfo: any): boolean {
        // Check if node has 2D-specific components or is under Canvas
        const components = nodeInfo.components || [];
        
        // Check for common 2D components
        const has2DComponents = components.some((comp: any) => 
            comp.type && (
                comp.type.includes('cc.Sprite') ||
                comp.type.includes('cc.Label') ||
                comp.type.includes('cc.Button') ||
                comp.type.includes('cc.Layout') ||
                comp.type.includes('cc.Widget') ||
                comp.type.includes('cc.Mask') ||
                comp.type.includes('cc.Graphics')
            )
        );
        
        if (has2DComponents) {
            return true;
        }
        
        // Check for 3D-specific components  
        const has3DComponents = components.some((comp: any) =>
            comp.type && (
                comp.type.includes('cc.MeshRenderer') ||
                comp.type.includes('cc.Camera') ||
                comp.type.includes('cc.Light') ||
                comp.type.includes('cc.DirectionalLight') ||
                comp.type.includes('cc.PointLight') ||
                comp.type.includes('cc.SpotLight')
            )
        );
        
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

    private normalizeTransformValue(value: any, type: 'position' | 'rotation' | 'scale', is2D: boolean): { value: any, warning?: string } {
        const result = { ...value };
        let warning: string | undefined;
        
        if (is2D) {
            switch (type) {
                case 'position':
                    if (value.z !== undefined && Math.abs(value.z) > 0.001) {
                        warning = `2D node: z position (${value.z}) ignored, set to 0`;
                        result.z = 0;
                    } else if (value.z === undefined) {
                        result.z = 0;
                    }
                    break;
                    
                case 'rotation':
                    if ((value.x !== undefined && Math.abs(value.x) > 0.001) || 
                        (value.y !== undefined && Math.abs(value.y) > 0.001)) {
                        warning = `2D node: x,y rotations ignored, only z rotation applied`;
                        result.x = 0;
                        result.y = 0;
                    } else {
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
        } else {
            // 3D node - ensure all axes are defined
            result.x = result.x !== undefined ? result.x : (type === 'scale' ? 1 : 0);
            result.y = result.y !== undefined ? result.y : (type === 'scale' ? 1 : 0);
            result.z = result.z !== undefined ? result.z : (type === 'scale' ? 1 : 0);
        }
        
        return { value: result, warning };
    }

    private async deleteNode(uuid: string): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'remove-node', { uuid: uuid }).then(() => {
                resolve({
                    success: true,
                    message: 'Node deleted successfully'
                });
            }).catch((err: Error) => {
                resolve({ success: false, error: err.message });
            });
        });
    }

    private async moveNode(nodeUuid: string, newParentUuid: string, siblingIndex: number = -1): Promise<ToolResponse> {
        return new Promise((resolve) => {
            // Use correct set-parent API instead of move-node
            Editor.Message.request('scene', 'set-parent', {
                parent: newParentUuid,
                uuids: [nodeUuid],
                keepWorldTransform: false
            }).then(() => {
                resolve({
                    success: true,
                    message: 'Node moved successfully'
                });
            }).catch((err: Error) => {
                resolve({ success: false, error: err.message });
            });
        });
    }

    private async duplicateNode(uuid: string, includeChildren: boolean = true): Promise<ToolResponse> {
        return new Promise((resolve) => {
            // Note: includeChildren parameter is accepted for future use but not currently implemented
            Editor.Message.request('scene', 'duplicate-node', uuid).then((result: any) => {
                resolve({
                    success: true,
                    data: {
                        newUuid: result.uuid,
                        message: 'Node duplicated successfully'
                    }
                });
            }).catch((err: Error) => {
                resolve({ success: false, error: err.message });
            });
        });
    }

    private async detectNodeType(uuid: string): Promise<ToolResponse> {
        return new Promise(async (resolve) => {
            try {
                const nodeInfoResponse = await this.getNodeInfo(uuid);
                if (!nodeInfoResponse.success || !nodeInfoResponse.data) {
                    resolve({ success: false, error: 'Failed to get node information' });
                    return;
                }

                const nodeInfo = nodeInfoResponse.data;
                const is2D = this.is2DNode(nodeInfo);
                const components = nodeInfo.components || [];
                
                // Collect detection reasons
                const detectionReasons: string[] = [];
                
                // Check for 2D components
                const twoDComponents = components.filter((comp: any) => 
                    comp.type && (
                        comp.type.includes('cc.Sprite') ||
                        comp.type.includes('cc.Label') ||
                        comp.type.includes('cc.Button') ||
                        comp.type.includes('cc.Layout') ||
                        comp.type.includes('cc.Widget') ||
                        comp.type.includes('cc.Mask') ||
                        comp.type.includes('cc.Graphics')
                    )
                );
                
                // Check for 3D components
                const threeDComponents = components.filter((comp: any) =>
                    comp.type && (
                        comp.type.includes('cc.MeshRenderer') ||
                        comp.type.includes('cc.Camera') ||
                        comp.type.includes('cc.Light') ||
                        comp.type.includes('cc.DirectionalLight') ||
                        comp.type.includes('cc.PointLight') ||
                        comp.type.includes('cc.SpotLight')
                    )
                );

                if (twoDComponents.length > 0) {
                    detectionReasons.push(`Has 2D components: ${twoDComponents.map((c: any) => c.type).join(', ')}`);
                }
                
                if (threeDComponents.length > 0) {
                    detectionReasons.push(`Has 3D components: ${threeDComponents.map((c: any) => c.type).join(', ')}`);
                }
                
                // Check position for heuristic
                const position = nodeInfo.position;
                if (position && Math.abs(position.z) < 0.001) {
                    detectionReasons.push('Z position is ~0 (likely 2D)');
                } else if (position && Math.abs(position.z) > 0.001) {
                    detectionReasons.push(`Z position is ${position.z} (likely 3D)`);
                }

                if (detectionReasons.length === 0) {
                    detectionReasons.push('No specific indicators found, defaulting based on heuristics');
                }

                resolve({
                    success: true,
                    data: {
                        nodeUuid: uuid,
                        nodeName: nodeInfo.name,
                        nodeType: is2D ? '2D' : '3D',
                        detectionReasons: detectionReasons,
                        components: components.map((comp: any) => ({
                            type: comp.type,
                            category: this.getComponentCategory(comp.type)
                        })),
                        position: nodeInfo.position,
                        transformConstraints: {
                            position: is2D ? 'x, y only (z ignored)' : 'x, y, z all used',
                            rotation: is2D ? 'z only (x, y ignored)' : 'x, y, z all used',
                            scale: is2D ? 'x, y main, z typically 1' : 'x, y, z all used'
                        }
                    }
                });
                
            } catch (err: any) {
                resolve({ 
                    success: false, 
                    error: `Failed to detect node type: ${err.message}` 
                });
            }
        });
    }

    private getComponentCategory(componentType: string): string {
        if (!componentType) return 'unknown';
        
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
