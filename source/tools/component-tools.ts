import { ToolDefinition, ToolResponse, ToolExecutor, ComponentInfo } from '../types';
import { debugLog } from '../lib/log';
import { z, toInputSchema, validateArgs } from '../lib/schema';
import { runSceneMethod, runSceneMethodAsToolResponse } from '../lib/scene-bridge';

/**
 * Force the editor's serialization model to re-pull a component dump
 * from runtime. CLAUDE.md Landmine #11: scene-script `arr.push` mutations
 * only touch the runtime; the model that `save-scene` writes to disk is
 * only updated when changes flow through the editor's set-property
 * channel.
 *
 * Calling `set-property` from inside scene-script doesn't propagate (the
 * scene-process IPC short-circuits). The nudge must come from host side.
 *
 * The set-property channel for component properties uses a node-rooted
 * path: `uuid = nodeUuid`, `path = __comps__.<index>.<property>`. We
 * query the node, locate the matching component, and set `enabled` to
 * its current value (no-op semantically, forces sync).
 *
 * Lookup precedence:
 *   1. `componentUuid` (precise — disambiguates multiple same-type
 *      components on the same node).
 *   2. `componentType` fallback if uuid wasn't supplied or didn't
 *      match (covers tests / older callers).
 *
 * `enabledValue` is read defensively because the `query-node` dump shape
 * varies across Cocos versions: properties can be flat (`comp.enabled`)
 * or nested (`comp.value.enabled.value`). We try nested first, fall
 * back to flat — matches the pattern used by `getComponents`.
 *
 * Best-effort: failures are swallowed because the runtime mutation
 * already happened — only persistence to disk is at stake.
 */
async function nudgeEditorModel(
    nodeUuid: string,
    componentType: string,
    componentUuid?: string,
): Promise<void> {
    try {
        const nodeData: any = await Editor.Message.request('scene', 'query-node', nodeUuid);
        const comps: any[] = nodeData?.__comps__ ?? [];
        let idx = -1;
        if (componentUuid) {
            idx = comps.findIndex(c => (c?.uuid?.value ?? c?.uuid) === componentUuid);
        }
        if (idx === -1) {
            idx = comps.findIndex(c => (c?.__type__ || c?.cid || c?.type) === componentType);
        }
        if (idx === -1) return;
        const raw = comps[idx];
        const enabledValue: boolean =
            raw?.value?.enabled?.value !== undefined
                ? raw.value.enabled.value !== false
                : raw?.enabled !== false;
        await Editor.Message.request('scene', 'set-property', {
            uuid: nodeUuid,
            path: `__comps__.${idx}.enabled`,
            dump: { value: enabledValue },
        });
    } catch (err) {
        debugLog('[ComponentTools] nudge set-property failed (non-fatal):', err);
    }
}

const setComponentPropertyValueDescription =
    'Property value - Use the corresponding data format based on propertyType:\n\n' +
    '📝 Basic Data Types:\n' +
    '• string: "Hello World" (text string)\n' +
    '• number/integer/float: 42 or 3.14 (numeric value)\n' +
    '• boolean: true or false (boolean value)\n\n' +
    '🎨 Color Type:\n' +
    '• color: {"r":255,"g":0,"b":0,"a":255} (RGBA values, range 0-255)\n' +
    '  - Alternative: "#FF0000" (hexadecimal format)\n' +
    '  - Transparency: a value controls opacity, 255 = fully opaque, 0 = fully transparent\n\n' +
    '📐 Vector and Size Types:\n' +
    '• vec2: {"x":100,"y":50} (2D vector)\n' +
    '• vec3: {"x":1,"y":2,"z":3} (3D vector)\n' +
    '• size: {"width":100,"height":50} (size dimensions)\n\n' +
    '🔗 Reference Types (using UUID strings):\n' +
    '• node: "target-node-uuid" (node reference)\n' +
    '  How to get: Use get_all_nodes or find_node_by_name to get node UUIDs\n' +
    '• component: "target-node-uuid" (component reference)\n' +
    '  How it works: \n' +
    '    1. Provide the UUID of the NODE that contains the target component\n' +
    '    2. System auto-detects required component type from property metadata\n' +
    '    3. Finds the component on target node and gets its scene __id__\n' +
    '    4. Sets reference using the scene __id__ (not node UUID)\n' +
    '  Example: value="label-node-uuid" will find cc.Label and use its scene ID\n' +
    '• spriteFrame: "spriteframe-uuid" (sprite frame asset)\n' +
    '  How to get: Check asset database or use asset browser\n' +
    '• prefab: "prefab-uuid" (prefab asset)\n' +
    '  How to get: Check asset database or use asset browser\n' +
    '• asset: "asset-uuid" (generic asset reference)\n' +
    '  How to get: Check asset database or use asset browser\n\n' +
    '📋 Array Types:\n' +
    '• nodeArray: ["uuid1","uuid2"] (array of node UUIDs)\n' +
    '• colorArray: [{"r":255,"g":0,"b":0,"a":255}] (array of colors)\n' +
    '• numberArray: [1,2,3,4,5] (array of numbers)\n' +
    '• stringArray: ["item1","item2"] (array of strings)';

const setComponentPropertyPropertyDescription =
    'Property name - The property to set. Common properties include:\n' +
    '• cc.Label: string (text content), fontSize (font size), color (text color)\n' +
    '• cc.Sprite: spriteFrame (sprite frame), color (tint color), sizeMode (size mode)\n' +
    '• cc.Button: normalColor (normal color), pressedColor (pressed color), target (target node)\n' +
    '• cc.UITransform: contentSize (content size), anchorPoint (anchor point)\n' +
    '• Custom Scripts: Based on properties defined in the script';

const componentSchemas = {
    add_component: z.object({
        nodeUuid: z.string().describe('Target node UUID. REQUIRED: You must specify the exact node to add the component to. Use get_all_nodes or find_node_by_name to get the UUID of the desired node.'),
        componentType: z.string().describe('Component type (e.g., cc.Sprite, cc.Label, cc.Button)'),
    }),
    remove_component: z.object({
        nodeUuid: z.string().describe('Node UUID'),
        componentType: z.string().describe('Component cid (type field from getComponents). Do NOT use script name or class name. Example: "cc.Sprite" or "9b4a7ueT9xD6aRE+AlOusy1"'),
    }),
    get_components: z.object({
        nodeUuid: z.string().describe('Node UUID'),
    }),
    get_component_info: z.object({
        nodeUuid: z.string().describe('Node UUID'),
        componentType: z.string().describe('Component type to get info for'),
    }),
    set_component_property: z.object({
        nodeUuid: z.string().describe('Target node UUID - Must specify the node to operate on'),
        // No enum on componentType — custom scripts must be allowed.
        componentType: z.string().describe('Component type - Can be built-in components (e.g., cc.Label) or custom script components (e.g., MyScript). If unsure about component type, use get_components first to retrieve all components on the node.'),
        property: z.string().describe(setComponentPropertyPropertyDescription),
        propertyType: z.enum([
            'string', 'number', 'boolean', 'integer', 'float',
            'color', 'vec2', 'vec3', 'size',
            'node', 'component', 'spriteFrame', 'prefab', 'asset',
            'nodeArray', 'colorArray', 'numberArray', 'stringArray',
        ]).describe('Property type - Must explicitly specify the property data type for correct value conversion and validation'),
        value: z.any().describe(setComponentPropertyValueDescription),
    }),
    attach_script: z.object({
        nodeUuid: z.string().describe('Node UUID'),
        scriptPath: z.string().describe('Script asset path (e.g., db://assets/scripts/MyScript.ts)'),
    }),
    get_available_components: z.object({
        category: z.enum(['all', 'renderer', 'ui', 'physics', 'animation', 'audio']).default('all').describe('Component category filter'),
    }),
    add_event_handler: z.object({
        nodeUuid: z.string().describe('Node UUID owning the component (e.g. the Button node)'),
        componentType: z.string().default('cc.Button').describe('Component class name; defaults to cc.Button'),
        eventArrayProperty: z.string().default('clickEvents').describe('Component property holding the EventHandler array (cc.Button.clickEvents, cc.Toggle.checkEvents, …)'),
        targetNodeUuid: z.string().describe('Node UUID where the callback component lives (most often the same as nodeUuid)'),
        componentName: z.string().describe('Class name (cc-class) of the script that owns the callback method'),
        handler: z.string().describe('Method name on the target component, e.g. "onClick"'),
        customEventData: z.string().optional().describe('Optional string passed back when the event fires'),
    }),
    remove_event_handler: z.object({
        nodeUuid: z.string().describe('Node UUID owning the component'),
        componentType: z.string().default('cc.Button').describe('Component class name'),
        eventArrayProperty: z.string().default('clickEvents').describe('EventHandler array property name'),
        index: z.number().int().min(0).optional().describe('Zero-based index to remove. Takes precedence over targetNodeUuid/handler matching when provided.'),
        targetNodeUuid: z.string().optional().describe('Match handlers whose target node has this UUID'),
        handler: z.string().optional().describe('Match handlers with this method name'),
    }),
    list_event_handlers: z.object({
        nodeUuid: z.string().describe('Node UUID owning the component'),
        componentType: z.string().default('cc.Button').describe('Component class name'),
        eventArrayProperty: z.string().default('clickEvents').describe('EventHandler array property name'),
    }),
} as const;

const componentToolMeta: Record<keyof typeof componentSchemas, string> = {
    add_component: 'Add a component to a specific node. IMPORTANT: You must provide the nodeUuid parameter to specify which node to add the component to.',
    remove_component: "Remove a component from a node. componentType must be the component's classId (cid, i.e. the type field from getComponents), not the script name or class name. Use getComponents to get the correct cid.",
    get_components: 'Get all components of a node',
    get_component_info: 'Get specific component information',
    set_component_property: 'Set component property values for UI components or custom script components. Supports setting properties of built-in UI components (e.g., cc.Label, cc.Sprite) and custom script components. Note: For node basic properties (name, active, layer, etc.), use set_node_property. For node transform properties (position, rotation, scale, etc.), use set_node_transform.',
    attach_script: 'Attach a script component to a node',
    get_available_components: 'Get list of available component types',
    add_event_handler: 'Append a cc.EventHandler entry to a component event array (default: cc.Button.clickEvents). Use this to wire onClick / onCheck / onValueChanged callbacks.',
    remove_event_handler: 'Remove an EventHandler entry by index, or by matching targetNodeUuid + handler name.',
    list_event_handlers: 'List EventHandler entries currently bound to a component event array.',
};

export class ComponentTools implements ToolExecutor {
    getTools(): ToolDefinition[] {
        return (Object.keys(componentSchemas) as Array<keyof typeof componentSchemas>).map(name => ({
            name,
            description: componentToolMeta[name],
            inputSchema: toInputSchema(componentSchemas[name]),
        }));
    }

    async execute(toolName: string, args: any): Promise<ToolResponse> {
        const schemaName = toolName as keyof typeof componentSchemas;
        const schema = componentSchemas[schemaName];
        if (!schema) {
            throw new Error(`Unknown tool: ${toolName}`);
        }
        const validation = validateArgs(schema, args ?? {});
        if (!validation.ok) {
            return validation.response;
        }
        const a = validation.data as any;

        switch (schemaName) {
            case 'add_component':
                return await this.addComponent(a.nodeUuid, a.componentType);
            case 'remove_component':
                return await this.removeComponent(a.nodeUuid, a.componentType);
            case 'get_components':
                return await this.getComponents(a.nodeUuid);
            case 'get_component_info':
                return await this.getComponentInfo(a.nodeUuid, a.componentType);
            case 'set_component_property':
                return await this.setComponentProperty(a);
            case 'attach_script':
                return await this.attachScript(a.nodeUuid, a.scriptPath);
            case 'get_available_components':
                return await this.getAvailableComponents(a.category);
            case 'add_event_handler': {
                const resp = await runSceneMethodAsToolResponse('addEventHandler', [
                    a.nodeUuid,
                    a.componentType,
                    a.eventArrayProperty,
                    a.targetNodeUuid,
                    a.componentName,
                    a.handler,
                    a.customEventData,
                ]);
                if (resp.success) {
                    await nudgeEditorModel(a.nodeUuid, a.componentType, resp.data?.componentUuid);
                }
                return resp;
            }
            case 'remove_event_handler': {
                const resp = await runSceneMethodAsToolResponse('removeEventHandler', [
                    a.nodeUuid,
                    a.componentType,
                    a.eventArrayProperty,
                    a.index ?? null,
                    a.targetNodeUuid ?? null,
                    a.handler ?? null,
                ]);
                if (resp.success) {
                    await nudgeEditorModel(a.nodeUuid, a.componentType, resp.data?.componentUuid);
                }
                return resp;
            }
            case 'list_event_handlers':
                return await runSceneMethodAsToolResponse('listEventHandlers', [
                    a.nodeUuid,
                    a.componentType,
                    a.eventArrayProperty,
                ]);
        }
    }

    private async addComponent(nodeUuid: string, componentType: string): Promise<ToolResponse> {
        return new Promise(async (resolve) => {
            // Snapshot existing components so we can detect post-add additions
            // even when Cocos reports them under a cid (custom scripts) rather
            // than the class name the caller supplied.
            const beforeInfo = await this.getComponents(nodeUuid);
            const beforeList: any[] = beforeInfo.success && beforeInfo.data?.components ? beforeInfo.data.components : [];
            const beforeTypes = new Set(beforeList.map((c: any) => c.type));

            const existingComponent = beforeList.find((comp: any) => comp.type === componentType);
            if (existingComponent) {
                resolve({
                    success: true,
                    message: `Component '${componentType}' already exists on node`,
                    data: {
                        nodeUuid,
                        componentType,
                        componentVerified: true,
                        existing: true,
                    },
                });
                return;
            }

            // 嘗試直接使用 Editor API 添加組件
            Editor.Message.request('scene', 'create-component', {
                uuid: nodeUuid,
                component: componentType,
            }).then(async () => {
                // 等待一段時間讓Editor完成組件添加
                await new Promise(r => setTimeout(r, 100));
                try {
                    const afterInfo = await this.getComponents(nodeUuid);
                    if (!afterInfo.success || !afterInfo.data?.components) {
                        resolve({
                            success: false,
                            error: `Failed to verify component addition: ${afterInfo.error || 'Unable to get node components'}`,
                        });
                        return;
                    }
                    const afterList: any[] = afterInfo.data.components;

                    // Strict match: built-in components like cc.Sprite show their
                    // class name in `type`. Hits the same shape the caller passed.
                    const addedComponent = afterList.find((comp: any) => comp.type === componentType);
                    if (addedComponent) {
                        resolve({
                            success: true,
                            message: `Component '${componentType}' added successfully`,
                            data: {
                                nodeUuid,
                                componentType,
                                componentVerified: true,
                                existing: false,
                            },
                        });
                        return;
                    }

                    // Lenient fallback: custom scripts surface as a cid (e.g.
                    // "9b4a7ueT9xD6aRE+AlOusy1") in __comps__.type, not as the
                    // class name. If the component count grew, accept the new
                    // entry as the one we just added.
                    const newEntries = afterList.filter((comp: any) => !beforeTypes.has(comp.type));
                    if (newEntries.length > 0) {
                        const registeredAs = newEntries[0].type;
                        resolve({
                            success: true,
                            message: `Component '${componentType}' added successfully (registered as cid '${registeredAs}'; this is normal for custom scripts).`,
                            data: {
                                nodeUuid,
                                componentType,
                                registeredAs,
                                componentVerified: true,
                                existing: false,
                            },
                        });
                        return;
                    }

                    resolve({
                        success: false,
                        error: `Component '${componentType}' was not found on node after addition. Available components: ${afterList.map((c: any) => c.type).join(', ')}`,
                    });
                } catch (verifyError: any) {
                    resolve({
                        success: false,
                        error: `Failed to verify component addition: ${verifyError.message}`,
                    });
                }
            }).catch((err: Error) => {
                // 備用方案：使用場景腳本
                runSceneMethod('addComponentToNode', [nodeUuid, componentType]).then((result: any) => {
                    resolve(result);
                }).catch((err2: Error) => {
                    resolve({ success: false, error: `Direct API failed: ${err.message}, Scene script failed: ${err2.message}` });
                });
            });
        });
    }

    private async removeComponent(nodeUuid: string, componentType: string): Promise<ToolResponse> {
        return new Promise(async (resolve) => {
            // 1. 查找節點上的所有組件
            const allComponentsInfo = await this.getComponents(nodeUuid);
            if (!allComponentsInfo.success || !allComponentsInfo.data?.components) {
                resolve({ success: false, error: `Failed to get components for node '${nodeUuid}': ${allComponentsInfo.error}` });
                return;
            }
            // 2. 只查找type字段等於componentType的組件（即cid）
            const exists = allComponentsInfo.data.components.some((comp: any) => comp.type === componentType);
            if (!exists) {
                resolve({ success: false, error: `Component cid '${componentType}' not found on node '${nodeUuid}'. 請用getComponents獲取type字段（cid）作為componentType。` });
                return;
            }
            // 3. 官方API直接移除
            try {
                await Editor.Message.request('scene', 'remove-component', {
                    uuid: nodeUuid,
                    component: componentType
                });
                // 4. 再查一次確認是否移除
                const afterRemoveInfo = await this.getComponents(nodeUuid);
                const stillExists = afterRemoveInfo.success && afterRemoveInfo.data?.components?.some((comp: any) => comp.type === componentType);
                if (stillExists) {
                    resolve({ success: false, error: `Component cid '${componentType}' was not removed from node '${nodeUuid}'.` });
                } else {
                    resolve({
                        success: true,
                        message: `Component cid '${componentType}' removed successfully from node '${nodeUuid}'`,
                        data: { nodeUuid, componentType }
                    });
                }
            } catch (err: any) {
                resolve({ success: false, error: `Failed to remove component: ${err.message}` });
            }
        });
    }

    private async getComponents(nodeUuid: string): Promise<ToolResponse> {
        return new Promise((resolve) => {
            // 優先嚐試直接使用 Editor API 查詢節點信息
            Editor.Message.request('scene', 'query-node', nodeUuid).then((nodeData: any) => {
                if (nodeData && nodeData.__comps__) {
                    const components = nodeData.__comps__.map((comp: any) => ({
                        type: comp.__type__ || comp.cid || comp.type || 'Unknown',
                        uuid: comp.uuid?.value || comp.uuid || null,
                        enabled: comp.enabled !== undefined ? comp.enabled : true,
                        properties: this.extractComponentProperties(comp)
                    }));
                    
                    resolve({
                        success: true,
                        data: {
                            nodeUuid: nodeUuid,
                            components: components
                        }
                    });
                } else {
                    resolve({ success: false, error: 'Node not found or no components data' });
                }
            }).catch((err: Error) => {
                // 備用方案：使用場景腳本
                runSceneMethod('getNodeInfo', [nodeUuid]).then((result: any) => {
                    if (result.success) {
                        resolve({
                            success: true,
                            data: result.data.components
                        });
                    } else {
                        resolve(result);
                    }
                }).catch((err2: Error) => {
                    resolve({ success: false, error: `Direct API failed: ${err.message}, Scene script failed: ${err2.message}` });
                });
            });
        });
    }

    private async getComponentInfo(nodeUuid: string, componentType: string): Promise<ToolResponse> {
        return new Promise((resolve) => {
            // 優先嚐試直接使用 Editor API 查詢節點信息
            Editor.Message.request('scene', 'query-node', nodeUuid).then((nodeData: any) => {
                if (nodeData && nodeData.__comps__) {
                    const component = nodeData.__comps__.find((comp: any) => {
                        const compType = comp.__type__ || comp.cid || comp.type;
                        return compType === componentType;
                    });
                    
                    if (component) {
                        resolve({
                            success: true,
                            data: {
                                nodeUuid: nodeUuid,
                                componentType: componentType,
                                enabled: component.enabled !== undefined ? component.enabled : true,
                                properties: this.extractComponentProperties(component)
                            }
                        });
                    } else {
                        resolve({ success: false, error: `Component '${componentType}' not found on node` });
                    }
                } else {
                    resolve({ success: false, error: 'Node not found or no components data' });
                }
            }).catch((err: Error) => {
                // 備用方案：使用場景腳本
                runSceneMethod('getNodeInfo', [nodeUuid]).then((result: any) => {
                    if (result.success && result.data.components) {
                        const component = result.data.components.find((comp: any) => comp.type === componentType);
                        if (component) {
                            resolve({
                                success: true,
                                data: {
                                    nodeUuid: nodeUuid,
                                    componentType: componentType,
                                    ...component
                                }
                            });
                        } else {
                            resolve({ success: false, error: `Component '${componentType}' not found on node` });
                        }
                    } else {
                        resolve({ success: false, error: result.error || 'Failed to get component info' });
                    }
                }).catch((err2: Error) => {
                    resolve({ success: false, error: `Direct API failed: ${err.message}, Scene script failed: ${err2.message}` });
                });
            });
        });
    }

    private extractComponentProperties(component: any): Record<string, any> {
        debugLog(`[extractComponentProperties] Processing component:`, Object.keys(component));
        
        // 檢查組件是否有 value 屬性，這通常包含實際的組件屬性
        if (component.value && typeof component.value === 'object') {
            debugLog(`[extractComponentProperties] Found component.value with properties:`, Object.keys(component.value));
            return component.value; // 直接返回 value 對象，它包含所有組件屬性
        }
        
        // 備用方案：從組件對象中直接提取屬性
        const properties: Record<string, any> = {};
        const excludeKeys = ['__type__', 'enabled', 'node', '_id', '__scriptAsset', 'uuid', 'name', '_name', '_objFlags', '_enabled', 'type', 'readonly', 'visible', 'cid', 'editor', 'extends'];
        
        for (const key in component) {
            if (!excludeKeys.includes(key) && !key.startsWith('_')) {
                debugLog(`[extractComponentProperties] Found direct property '${key}':`, typeof component[key]);
                properties[key] = component[key];
            }
        }
        
        debugLog(`[extractComponentProperties] Final extracted properties:`, Object.keys(properties));
        return properties;
    }

    private async findComponentTypeByUuid(componentUuid: string): Promise<string | null> {
        debugLog(`[findComponentTypeByUuid] Searching for component type with UUID: ${componentUuid}`);
        if (!componentUuid) {
            return null;
        }
        try {
            const nodeTree = await Editor.Message.request('scene', 'query-node-tree');
            if (!nodeTree) {
                console.warn('[findComponentTypeByUuid] Failed to query node tree.');
                return null;
            }

            const queue: any[] = [nodeTree];
            
            while (queue.length > 0) {
                const currentNodeInfo = queue.shift();
                if (!currentNodeInfo || !currentNodeInfo.uuid) {
                    continue;
                }

                try {
                    const fullNodeData = await Editor.Message.request('scene', 'query-node', currentNodeInfo.uuid);
                    if (fullNodeData && fullNodeData.__comps__) {
                        for (const comp of fullNodeData.__comps__) {
                            const compAny = comp as any; // Cast to any to access dynamic properties
                            // The component UUID is nested in the 'value' property
                            if (compAny.uuid && compAny.uuid.value === componentUuid) {
                                const componentType = compAny.__type__;
                                debugLog(`[findComponentTypeByUuid] Found component type '${componentType}' for UUID ${componentUuid} on node ${fullNodeData.name?.value}`);
                                return componentType;
                            }
                        }
                    }
                } catch (e) {
                    console.warn(`[findComponentTypeByUuid] Could not query node ${currentNodeInfo.uuid}:`, e);
                }

                if (currentNodeInfo.children) {
                    for (const child of currentNodeInfo.children) {
                        queue.push(child);
                    }
                }
            }

            console.warn(`[findComponentTypeByUuid] Component with UUID ${componentUuid} not found in scene tree.`);
            return null;
        } catch (error) {
            console.error(`[findComponentTypeByUuid] Error while searching for component type:`, error);
            return null;
        }
    }

    private async setComponentProperty(args: any): Promise<ToolResponse> {
                        const { nodeUuid, componentType, property, propertyType, value } = args;
        
        return new Promise(async (resolve) => {
            try {
                debugLog(`[ComponentTools] Setting ${componentType}.${property} (type: ${propertyType}) = ${JSON.stringify(value)} on node ${nodeUuid}`);
                
                // Step 0: 檢測是否為節點屬性，如果是則重定向到對應的節點方法
                const nodeRedirectResult = await this.checkAndRedirectNodeProperties(args);
                if (nodeRedirectResult) {
                    resolve(nodeRedirectResult);
                    return;
                }
                
                // Step 1: 獲取組件信息，使用與getComponents相同的方法
                const componentsResponse = await this.getComponents(nodeUuid);
                if (!componentsResponse.success || !componentsResponse.data) {
                    resolve({
                        success: false,
                        error: `Failed to get components for node '${nodeUuid}': ${componentsResponse.error}`,
                        instruction: `Please verify that node UUID '${nodeUuid}' is correct. Use get_all_nodes or find_node_by_name to get the correct node UUID.`
                    });
                    return;
                }
                
                const allComponents = componentsResponse.data.components;
                
                // Step 2: 查找目標組件
                // We capture the matched index here so Step 5 doesn't need a
                // second `scene/query-node` call: getComponents above maps
                // __comps__ 1:1 (preserves order) on the direct API path,
                // which is the only path that yields `data.components` in
                // this shape — the runSceneMethod fallback returns a different
                // shape that wouldn't reach here without erroring earlier.
                let targetComponent = null;
                let targetComponentIndex = -1;
                const availableTypes: string[] = [];

                for (let i = 0; i < allComponents.length; i++) {
                    const comp = allComponents[i];
                    availableTypes.push(comp.type);

                    if (comp.type === componentType) {
                        targetComponent = comp;
                        targetComponentIndex = i;
                        break;
                    }
                }

                if (!targetComponent) {
                    // 提供更詳細的錯誤信息和建議
                    const instruction = this.generateComponentSuggestion(componentType, availableTypes, property);
                    resolve({
                        success: false,
                        error: `Component '${componentType}' not found on node. Available components: ${availableTypes.join(', ')}`,
                        instruction: instruction
                    });
                    return;
                }
                
                // Step 3: 自動檢測和轉換屬性值
                let propertyInfo;
                try {
                    debugLog(`[ComponentTools] Analyzing property: ${property}`);
                    propertyInfo = this.analyzeProperty(targetComponent, property);
                } catch (analyzeError: any) {
                    console.error(`[ComponentTools] Error in analyzeProperty:`, analyzeError);
                    resolve({
                        success: false,
                        error: `Failed to analyze property '${property}': ${analyzeError.message}`
                    });
                    return;
                }
                
                if (!propertyInfo.exists) {
                    resolve({
                        success: false,
                        error: `Property '${property}' not found on component '${componentType}'. Available properties: ${propertyInfo.availableProperties.join(', ')}`
                    });
                    return;
                }
                
                // Step 4: 處理屬性值和設置
                const originalValue = propertyInfo.originalValue;
                let processedValue: any;
                
                // 根據明確的propertyType處理屬性值
                switch (propertyType) {
                    case 'string':
                        processedValue = String(value);
                        break;
                    case 'number':
                    case 'integer':
                    case 'float':
                        processedValue = Number(value);
                        break;
                    case 'boolean':
                        processedValue = Boolean(value);
                        break;
                    case 'color':
                        if (typeof value === 'string') {
                            // 字符串格式：支持十六進制、顏色名稱、rgb()/rgba()
                            processedValue = this.parseColorString(value);
                        } else if (typeof value === 'object' && value !== null) {
                            // 對象格式：驗證並轉換RGBA值
                            processedValue = {
                                r: Math.min(255, Math.max(0, Number(value.r) || 0)),
                                g: Math.min(255, Math.max(0, Number(value.g) || 0)),
                                b: Math.min(255, Math.max(0, Number(value.b) || 0)),
                                a: value.a !== undefined ? Math.min(255, Math.max(0, Number(value.a))) : 255
                            };
                        } else {
                            throw new Error('Color value must be an object with r, g, b properties or a hexadecimal string (e.g., "#FF0000")');
                        }
                        break;
                    case 'vec2':
                        if (typeof value === 'object' && value !== null) {
                            processedValue = {
                                x: Number(value.x) || 0,
                                y: Number(value.y) || 0
                            };
                        } else {
                            throw new Error('Vec2 value must be an object with x, y properties');
                        }
                        break;
                    case 'vec3':
                        if (typeof value === 'object' && value !== null) {
                            processedValue = {
                                x: Number(value.x) || 0,
                                y: Number(value.y) || 0,
                                z: Number(value.z) || 0
                            };
                        } else {
                            throw new Error('Vec3 value must be an object with x, y, z properties');
                        }
                        break;
                    case 'size':
                        if (typeof value === 'object' && value !== null) {
                            processedValue = {
                                width: Number(value.width) || 0,
                                height: Number(value.height) || 0
                            };
                        } else {
                            throw new Error('Size value must be an object with width, height properties');
                        }
                        break;
                    case 'node':
                        if (typeof value === 'string') {
                            processedValue = { uuid: value };
                        } else {
                            throw new Error('Node reference value must be a string UUID');
                        }
                        break;
                    case 'component':
                        if (typeof value === 'string') {
                            // 組件引用需要特殊處理：通過節點UUID找到組件的__id__
                            processedValue = value; // 先保存節點UUID，後續會轉換為__id__
                        } else {
                            throw new Error('Component reference value must be a string (node UUID containing the target component)');
                        }
                        break;
                    case 'spriteFrame':
                    case 'prefab':
                    case 'asset':
                        if (typeof value === 'string') {
                            processedValue = { uuid: value };
                        } else {
                            throw new Error(`${propertyType} value must be a string UUID`);
                        }
                        break;
                    case 'nodeArray':
                        if (Array.isArray(value)) {
                            processedValue = value.map((item: any) => {
                                if (typeof item === 'string') {
                                    return { uuid: item };
                                } else {
                                    throw new Error('NodeArray items must be string UUIDs');
                                }
                            });
                        } else {
                            throw new Error('NodeArray value must be an array');
                        }
                        break;
                    case 'colorArray':
                        if (Array.isArray(value)) {
                            processedValue = value.map((item: any) => {
                                if (typeof item === 'object' && item !== null && 'r' in item) {
                                    return {
                                        r: Math.min(255, Math.max(0, Number(item.r) || 0)),
                                        g: Math.min(255, Math.max(0, Number(item.g) || 0)),
                                        b: Math.min(255, Math.max(0, Number(item.b) || 0)),
                                        a: item.a !== undefined ? Math.min(255, Math.max(0, Number(item.a))) : 255
                                    };
                                } else {
                                    return { r: 255, g: 255, b: 255, a: 255 };
                                }
                            });
                        } else {
                            throw new Error('ColorArray value must be an array');
                        }
                        break;
                    case 'numberArray':
                        if (Array.isArray(value)) {
                            processedValue = value.map((item: any) => Number(item));
                        } else {
                            throw new Error('NumberArray value must be an array');
                        }
                        break;
                    case 'stringArray':
                        if (Array.isArray(value)) {
                            processedValue = value.map((item: any) => String(item));
                        } else {
                            throw new Error('StringArray value must be an array');
                        }
                        break;
                    default:
                        throw new Error(`Unsupported property type: ${propertyType}`);
                }
                
                debugLog(`[ComponentTools] Converting value: ${JSON.stringify(value)} -> ${JSON.stringify(processedValue)} (type: ${propertyType})`);
                debugLog(`[ComponentTools] Property analysis result: propertyInfo.type="${propertyInfo.type}", propertyType="${propertyType}"`);
                debugLog(`[ComponentTools] Will use color special handling: ${propertyType === 'color' && processedValue && typeof processedValue === 'object'}`);
                
                // 用於驗證的實際期望值（對於組件引用需要特殊處理）
                let actualExpectedValue = processedValue;
                
                // Step 5: 構建屬性路徑（component index 已在 Step 2 捕獲）
                const rawComponentIndex = targetComponentIndex;
                let propertyPath = `__comps__.${rawComponentIndex}.${property}`;
                
                // 特殊處理資源類屬性
                if (propertyType === 'asset' || propertyType === 'spriteFrame' || propertyType === 'prefab' || 
                    (propertyInfo.type === 'asset' && propertyType === 'string')) {
                    
                    debugLog(`[ComponentTools] Setting asset reference:`, {
                        value: processedValue,
                        property: property,
                        propertyType: propertyType,
                        path: propertyPath
                    });
                    
                    // Determine asset type based on property name
                    let assetType = 'cc.SpriteFrame'; // default
                    if (property.toLowerCase().includes('texture')) {
                        assetType = 'cc.Texture2D';
                    } else if (property.toLowerCase().includes('material')) {
                        assetType = 'cc.Material';
                    } else if (property.toLowerCase().includes('font')) {
                        assetType = 'cc.Font';
                    } else if (property.toLowerCase().includes('clip')) {
                        assetType = 'cc.AudioClip';
                    } else if (propertyType === 'prefab') {
                        assetType = 'cc.Prefab';
                    }
                    
                    await Editor.Message.request('scene', 'set-property', {
                        uuid: nodeUuid,
                        path: propertyPath,
                        dump: { 
                            value: processedValue,
                            type: assetType
                        }
                    });
                } else if (componentType === 'cc.UITransform' && (property === '_contentSize' || property === 'contentSize')) {
                    // Special handling for UITransform contentSize - set width and height separately
                    const width = Number(value.width) || 100;
                    const height = Number(value.height) || 100;
                    
                    // Set width first
                    await Editor.Message.request('scene', 'set-property', {
                        uuid: nodeUuid,
                        path: `__comps__.${rawComponentIndex}.width`,
                        dump: { value: width }
                    });
                    
                    // Then set height
                    await Editor.Message.request('scene', 'set-property', {
                        uuid: nodeUuid,
                        path: `__comps__.${rawComponentIndex}.height`,
                        dump: { value: height }
                    });
                } else if (componentType === 'cc.UITransform' && (property === '_anchorPoint' || property === 'anchorPoint')) {
                    // Special handling for UITransform anchorPoint - set anchorX and anchorY separately
                    const anchorX = Number(value.x) || 0.5;
                    const anchorY = Number(value.y) || 0.5;
                    
                    // Set anchorX first
                    await Editor.Message.request('scene', 'set-property', {
                        uuid: nodeUuid,
                        path: `__comps__.${rawComponentIndex}.anchorX`,
                        dump: { value: anchorX }
                    });
                    
                    // Then set anchorY  
                    await Editor.Message.request('scene', 'set-property', {
                        uuid: nodeUuid,
                        path: `__comps__.${rawComponentIndex}.anchorY`,
                        dump: { value: anchorY }
                    });
                } else if (propertyType === 'color' && processedValue && typeof processedValue === 'object') {
                    // 特殊處理顏色屬性，確保RGBA值正確
                    // Cocos Creator顏色值範圍是0-255
                    const colorValue = {
                        r: Math.min(255, Math.max(0, Number(processedValue.r) || 0)),
                        g: Math.min(255, Math.max(0, Number(processedValue.g) || 0)),
                        b: Math.min(255, Math.max(0, Number(processedValue.b) || 0)),
                        a: processedValue.a !== undefined ? Math.min(255, Math.max(0, Number(processedValue.a))) : 255
                    };
                    
                    debugLog(`[ComponentTools] Setting color value:`, colorValue);
                    
                    await Editor.Message.request('scene', 'set-property', {
                        uuid: nodeUuid,
                        path: propertyPath,
                        dump: { 
                            value: colorValue,
                            type: 'cc.Color'
                        }
                    });
                } else if (propertyType === 'vec3' && processedValue && typeof processedValue === 'object') {
                    // 特殊處理Vec3屬性
                    const vec3Value = {
                        x: Number(processedValue.x) || 0,
                        y: Number(processedValue.y) || 0,
                        z: Number(processedValue.z) || 0
                    };
                    
                    await Editor.Message.request('scene', 'set-property', {
                        uuid: nodeUuid,
                        path: propertyPath,
                        dump: { 
                            value: vec3Value,
                            type: 'cc.Vec3'
                        }
                    });
                } else if (propertyType === 'vec2' && processedValue && typeof processedValue === 'object') {
                    // 特殊處理Vec2屬性
                    const vec2Value = {
                        x: Number(processedValue.x) || 0,
                        y: Number(processedValue.y) || 0
                    };
                    
                    await Editor.Message.request('scene', 'set-property', {
                        uuid: nodeUuid,
                        path: propertyPath,
                        dump: { 
                            value: vec2Value,
                            type: 'cc.Vec2'
                        }
                    });
                } else if (propertyType === 'size' && processedValue && typeof processedValue === 'object') {
                    // 特殊處理Size屬性
                    const sizeValue = {
                        width: Number(processedValue.width) || 0,
                        height: Number(processedValue.height) || 0
                    };
                    
                    await Editor.Message.request('scene', 'set-property', {
                        uuid: nodeUuid,
                        path: propertyPath,
                        dump: { 
                            value: sizeValue,
                            type: 'cc.Size'
                        }
                    });
                } else if (propertyType === 'node' && processedValue && typeof processedValue === 'object' && 'uuid' in processedValue) {
                    // 特殊處理節點引用
                    debugLog(`[ComponentTools] Setting node reference with UUID: ${processedValue.uuid}`);
                    await Editor.Message.request('scene', 'set-property', {
                        uuid: nodeUuid,
                        path: propertyPath,
                        dump: { 
                            value: processedValue,
                            type: 'cc.Node'
                        }
                    });
                } else if (propertyType === 'component' && typeof processedValue === 'string') {
                    // 特殊處理組件引用：通過節點UUID找到組件的__id__
                    const targetNodeUuid = processedValue;
                    debugLog(`[ComponentTools] Setting component reference - finding component on node: ${targetNodeUuid}`);
                    
                    // 從當前組件的屬性元數據中獲取期望的組件類型
                    let expectedComponentType = '';
                    
                    // 獲取當前組件的詳細信息，包括屬性元數據
                    const currentComponentInfo = await this.getComponentInfo(nodeUuid, componentType);
                    if (currentComponentInfo.success && currentComponentInfo.data?.properties?.[property]) {
                        const propertyMeta = currentComponentInfo.data.properties[property];
                        
                        // 從屬性元數據中提取組件類型信息
                        if (propertyMeta && typeof propertyMeta === 'object') {
                            // 檢查是否有type字段指示組件類型
                            if (propertyMeta.type) {
                                expectedComponentType = propertyMeta.type;
                            } else if (propertyMeta.ctor) {
                                // 有些屬性可能使用ctor字段
                                expectedComponentType = propertyMeta.ctor;
                            } else if (propertyMeta.extends && Array.isArray(propertyMeta.extends)) {
                                // 檢查extends數組，通常第一個是最具體的類型
                                for (const extendType of propertyMeta.extends) {
                                    if (extendType.startsWith('cc.') && extendType !== 'cc.Component' && extendType !== 'cc.Object') {
                                        expectedComponentType = extendType;
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    
                    if (!expectedComponentType) {
                        throw new Error(`Unable to determine required component type for property '${property}' on component '${componentType}'. Property metadata may not contain type information.`);
                    }
                    
                    debugLog(`[ComponentTools] Detected required component type: ${expectedComponentType} for property: ${property}`);
                    
                    try {
                        // 獲取目標節點的組件信息
                        const targetNodeData = await Editor.Message.request('scene', 'query-node', targetNodeUuid);
                        if (!targetNodeData || !targetNodeData.__comps__) {
                            throw new Error(`Target node ${targetNodeUuid} not found or has no components`);
                        }
                        
                        // 打印目標節點的組件概覽
                        debugLog(`[ComponentTools] Target node ${targetNodeUuid} has ${targetNodeData.__comps__.length} components:`);
                        targetNodeData.__comps__.forEach((comp: any, index: number) => {
                            const sceneId = comp.value && comp.value.uuid && comp.value.uuid.value ? comp.value.uuid.value : 'unknown';
                            debugLog(`[ComponentTools] Component ${index}: ${comp.type} (scene_id: ${sceneId})`);
                        });
                        
                        // 查找對應的組件
                        let targetComponent = null;
                        let componentId: string | null = null;
                        
                        // 在目標節點的_components數組中查找指定類型的組件
                        // 注意：__comps__和_components的索引是對應的
                        debugLog(`[ComponentTools] Searching for component type: ${expectedComponentType}`);
                        
                        for (let i = 0; i < targetNodeData.__comps__.length; i++) {
                            const comp = targetNodeData.__comps__[i] as any;
                            debugLog(`[ComponentTools] Checking component ${i}: type=${comp.type}, target=${expectedComponentType}`);
                            
                            if (comp.type === expectedComponentType) {
                                targetComponent = comp;
                                debugLog(`[ComponentTools] Found matching component at index ${i}: ${comp.type}`);
                                
                                // 從組件的value.uuid.value中獲取組件在場景中的ID
                                if (comp.value && comp.value.uuid && comp.value.uuid.value) {
                                    componentId = comp.value.uuid.value;
                                    debugLog(`[ComponentTools] Got componentId from comp.value.uuid.value: ${componentId}`);
                                } else {
                                    debugLog(`[ComponentTools] Component structure:`, {
                                        hasValue: !!comp.value,
                                        hasUuid: !!(comp.value && comp.value.uuid),
                                        hasUuidValue: !!(comp.value && comp.value.uuid && comp.value.uuid.value),
                                        uuidStructure: comp.value ? comp.value.uuid : 'No value'
                                    });
                                    throw new Error(`Unable to extract component ID from component structure`);
                                }
                                
                                break;
                            }
                        }
                        
                        if (!targetComponent) {
                            // 如果沒找到，列出可用組件讓用戶瞭解，顯示場景中的真實ID
                            const availableComponents = targetNodeData.__comps__.map((comp: any, index: number) => {
                                let sceneId = 'unknown';
                                // 從組件的value.uuid.value獲取場景ID
                                if (comp.value && comp.value.uuid && comp.value.uuid.value) {
                                    sceneId = comp.value.uuid.value;
                                }
                                return `${comp.type}(scene_id:${sceneId})`;
                            });
                            throw new Error(`Component type '${expectedComponentType}' not found on node ${targetNodeUuid}. Available components: ${availableComponents.join(', ')}`);
                        }
                        
                        debugLog(`[ComponentTools] Found component ${expectedComponentType} with scene ID: ${componentId} on node ${targetNodeUuid}`);
                        
                        // 更新期望值為實際的組件ID對象格式，用於後續驗證
                        if (componentId) {
                            actualExpectedValue = { uuid: componentId };
                        }
                        
                        // 嘗試使用與節點/資源引用相同的格式：{uuid: componentId}
                        // 測試看是否能正確設置組件引用
                        await Editor.Message.request('scene', 'set-property', {
                            uuid: nodeUuid,
                            path: propertyPath,
                            dump: { 
                                value: { uuid: componentId },  // 使用對象格式，像節點/資源引用一樣
                                type: expectedComponentType
                            }
                        });
                        
                    } catch (error) {
                        console.error(`[ComponentTools] Error setting component reference:`, error);
                        throw error;
                    }
                } else if (propertyType === 'nodeArray' && Array.isArray(processedValue)) {
                    // 特殊處理節點數組 - 保持預處理的格式
                    debugLog(`[ComponentTools] Setting node array:`, processedValue);
                    
                    await Editor.Message.request('scene', 'set-property', {
                        uuid: nodeUuid,
                        path: propertyPath,
                        dump: { 
                            value: processedValue  // 保持 [{uuid: "..."}, {uuid: "..."}] 格式
                        }
                    });
                } else if (propertyType === 'colorArray' && Array.isArray(processedValue)) {
                    // 特殊處理顏色數組
                    const colorArrayValue = processedValue.map((item: any) => {
                        if (item && typeof item === 'object' && 'r' in item) {
                            return {
                                r: Math.min(255, Math.max(0, Number(item.r) || 0)),
                                g: Math.min(255, Math.max(0, Number(item.g) || 0)),
                                b: Math.min(255, Math.max(0, Number(item.b) || 0)),
                                a: item.a !== undefined ? Math.min(255, Math.max(0, Number(item.a))) : 255
                            };
                        } else {
                            return { r: 255, g: 255, b: 255, a: 255 };
                        }
                    });
                    
                    await Editor.Message.request('scene', 'set-property', {
                        uuid: nodeUuid,
                        path: propertyPath,
                        dump: { 
                            value: colorArrayValue,
                            type: 'cc.Color'
                        }
                    });
                } else {
                    // Normal property setting for non-asset properties
                    await Editor.Message.request('scene', 'set-property', {
                        uuid: nodeUuid,
                        path: propertyPath,
                        dump: { value: processedValue }
                    });
                }
                
                // Step 5: 等待Editor完成更新，然後驗證設置結果
                await new Promise(resolve => setTimeout(resolve, 200)); // 等待200ms讓Editor完成更新
                
                const verification = await this.verifyPropertyChange(nodeUuid, componentType, property, originalValue, actualExpectedValue);
                
                resolve({
                    success: true,
                    message: `Successfully set ${componentType}.${property}`,
                    data: {
                        nodeUuid,
                        componentType,
                        property,
                        actualValue: verification.actualValue,
                        changeVerified: verification.verified
                    }
                });
                
            } catch (error: any) {
                console.error(`[ComponentTools] Error setting property:`, error);
                resolve({
                    success: false,
                    error: `Failed to set property: ${error.message}`
                });
            }
        });
    }


    private async attachScript(nodeUuid: string, scriptPath: string): Promise<ToolResponse> {
        return new Promise(async (resolve) => {
            // 從腳本路徑提取組件類名
            const scriptName = scriptPath.split('/').pop()?.replace('.ts', '').replace('.js', '');
            if (!scriptName) {
                resolve({ success: false, error: 'Invalid script path' });
                return;
            }
            // 先查找節點上是否已存在該腳本組件
            const allComponentsInfo = await this.getComponents(nodeUuid);
            if (allComponentsInfo.success && allComponentsInfo.data?.components) {
                const existingScript = allComponentsInfo.data.components.find((comp: any) => comp.type === scriptName);
                if (existingScript) {
                    resolve({
                        success: true,
                        message: `Script '${scriptName}' already exists on node`,
                        data: {
                            nodeUuid: nodeUuid,
                            componentName: scriptName,
                            existing: true
                        }
                    });
                    return;
                }
            }
            // 首先嚐試直接使用腳本名稱作為組件類型
            Editor.Message.request('scene', 'create-component', {
                uuid: nodeUuid,
                component: scriptName  // 使用腳本名稱而非UUID
            }).then(async (result: any) => {
                // 等待一段時間讓Editor完成組件添加
                await new Promise(resolve => setTimeout(resolve, 100));
                // 重新查詢節點信息驗證腳本是否真的添加成功
                const allComponentsInfo2 = await this.getComponents(nodeUuid);
                if (allComponentsInfo2.success && allComponentsInfo2.data?.components) {
                    const addedScript = allComponentsInfo2.data.components.find((comp: any) => comp.type === scriptName);
                    if (addedScript) {
                        resolve({
                            success: true,
                            message: `Script '${scriptName}' attached successfully`,
                            data: {
                                nodeUuid: nodeUuid,
                                componentName: scriptName,
                                existing: false
                            }
                        });
                    } else {
                        resolve({
                            success: false,
                            error: `Script '${scriptName}' was not found on node after addition. Available components: ${allComponentsInfo2.data.components.map((c: any) => c.type).join(', ')}`
                        });
                    }
                } else {
                    resolve({
                        success: false,
                        error: `Failed to verify script addition: ${allComponentsInfo2.error || 'Unable to get node components'}`
                    });
                }
            }).catch((err: Error) => {
                // 備用方案：使用場景腳本
                runSceneMethod('attachScript', [nodeUuid, scriptPath]).then((result: any) => {
                    resolve(result);
                }).catch(() => {
                    resolve({ 
                        success: false, 
                        error: `Failed to attach script '${scriptName}': ${err.message}`,
                        instruction: 'Please ensure the script is properly compiled and exported as a Component class. You can also manually attach the script through the Properties panel in the editor.'
                    });
                });
            });
        });
    }

    private async getAvailableComponents(category: string = 'all'): Promise<ToolResponse> {
        const componentCategories: Record<string, string[]> = {
            renderer: ['cc.Sprite', 'cc.Label', 'cc.RichText', 'cc.Mask', 'cc.Graphics'],
            ui: ['cc.Button', 'cc.Toggle', 'cc.Slider', 'cc.ScrollView', 'cc.EditBox', 'cc.ProgressBar'],
            physics: ['cc.RigidBody2D', 'cc.BoxCollider2D', 'cc.CircleCollider2D', 'cc.PolygonCollider2D'],
            animation: ['cc.Animation', 'cc.AnimationClip', 'cc.SkeletalAnimation'],
            audio: ['cc.AudioSource'],
            layout: ['cc.Layout', 'cc.Widget', 'cc.PageView', 'cc.PageViewIndicator'],
            effects: ['cc.MotionStreak', 'cc.ParticleSystem2D'],
            camera: ['cc.Camera'],
            light: ['cc.Light', 'cc.DirectionalLight', 'cc.PointLight', 'cc.SpotLight']
        };

        let components: string[] = [];
        
        if (category === 'all') {
            for (const cat in componentCategories) {
                components = components.concat(componentCategories[cat]);
            }
        } else if (componentCategories[category]) {
            components = componentCategories[category];
        }

        return {
            success: true,
            data: {
                category: category,
                components: components
            }
        };
    }

    private isValidPropertyDescriptor(propData: any): boolean {
        // 檢查是否是有效的屬性描述對象
        if (typeof propData !== 'object' || propData === null) {
            return false;
        }
        
        try {
            const keys = Object.keys(propData);
            
            // 避免遍歷簡單的數值對象（如 {width: 200, height: 150}）
            const isSimpleValueObject = keys.every(key => {
                const value = propData[key];
                return typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean';
            });
            
            if (isSimpleValueObject) {
                return false;
            }
            
            // 檢查是否包含屬性描述符的特徵字段，不使用'in'操作符
            const hasName = keys.includes('name');
            const hasValue = keys.includes('value');
            const hasType = keys.includes('type');
            const hasDisplayName = keys.includes('displayName');
            const hasReadonly = keys.includes('readonly');
            
            // 必須包含name或value字段，且通常還有type字段
            const hasValidStructure = (hasName || hasValue) && (hasType || hasDisplayName || hasReadonly);
            
            // 額外檢查：如果有default字段且結構複雜，避免深度遍歷
            if (keys.includes('default') && propData.default && typeof propData.default === 'object') {
                const defaultKeys = Object.keys(propData.default);
                if (defaultKeys.includes('value') && typeof propData.default.value === 'object') {
                    // 這種情況下，我們只返回頂層屬性，不深入遍歷default.value
                    return hasValidStructure;
                }
            }
            
            return hasValidStructure;
        } catch (error) {
            console.warn(`[isValidPropertyDescriptor] Error checking property descriptor:`, error);
            return false;
        }
    }

    private analyzeProperty(component: any, propertyName: string): { exists: boolean; type: string; availableProperties: string[]; originalValue: any } {
        // 從複雜的組件結構中提取可用屬性
        const availableProperties: string[] = [];
        let propertyValue: any = undefined;
        let propertyExists = false;
        
        // 嘗試多種方式查找屬性：
        // 1. 直接屬性訪問
        if (Object.prototype.hasOwnProperty.call(component, propertyName)) {
            propertyValue = component[propertyName];
            propertyExists = true;
        }
        
        // 2. 從嵌套結構中查找 (如從測試數據看到的複雜結構)
        if (!propertyExists && component.properties && typeof component.properties === 'object') {
            // 首先檢查properties.value是否存在（這是我們在getComponents中看到的結構）
            if (component.properties.value && typeof component.properties.value === 'object') {
                const valueObj = component.properties.value;
                for (const [key, propData] of Object.entries(valueObj)) {
                    // 檢查propData是否是一個有效的屬性描述對象
                    // 確保propData是對象且包含預期的屬性結構
                    if (this.isValidPropertyDescriptor(propData)) {
                        const propInfo = propData as any;
                        availableProperties.push(key);
                        if (key === propertyName) {
                            // 優先使用value屬性，如果沒有則使用propData本身
                            try {
                                const propKeys = Object.keys(propInfo);
                                propertyValue = propKeys.includes('value') ? propInfo.value : propInfo;
                            } catch (error) {
                                // 如果檢查失敗，直接使用propInfo
                                propertyValue = propInfo;
                            }
                            propertyExists = true;
                        }
                    }
                }
            } else {
                // 備用方案：直接從properties查找
                for (const [key, propData] of Object.entries(component.properties)) {
                    if (this.isValidPropertyDescriptor(propData)) {
                        const propInfo = propData as any;
                        availableProperties.push(key);
                        if (key === propertyName) {
                            // 優先使用value屬性，如果沒有則使用propData本身
                            try {
                                const propKeys = Object.keys(propInfo);
                                propertyValue = propKeys.includes('value') ? propInfo.value : propInfo;
                            } catch (error) {
                                // 如果檢查失敗，直接使用propInfo
                                propertyValue = propInfo;
                            }
                            propertyExists = true;
                        }
                    }
                }
            }
        }
        
        // 3. 從直接屬性中提取簡單屬性名
        if (availableProperties.length === 0) {
            for (const key of Object.keys(component)) {
                if (!key.startsWith('_') && !['__type__', 'cid', 'node', 'uuid', 'name', 'enabled', 'type', 'readonly', 'visible'].includes(key)) {
                    availableProperties.push(key);
                }
            }
        }
        
        if (!propertyExists) {
            return {
                exists: false,
                type: 'unknown',
                availableProperties,
                originalValue: undefined
            };
        }
        
        let type = 'unknown';
        
        // 智能類型檢測
        if (Array.isArray(propertyValue)) {
            // 數組類型檢測
            if (propertyName.toLowerCase().includes('node')) {
                type = 'nodeArray';
            } else if (propertyName.toLowerCase().includes('color')) {
                type = 'colorArray';
            } else {
                type = 'array';
            }
        } else if (typeof propertyValue === 'string') {
            // Check if property name suggests it's an asset
            if (['spriteFrame', 'texture', 'material', 'font', 'clip', 'prefab'].includes(propertyName.toLowerCase())) {
                type = 'asset';
            } else {
                type = 'string';
            }
        } else if (typeof propertyValue === 'number') {
            type = 'number';
        } else if (typeof propertyValue === 'boolean') {
            type = 'boolean';
        } else if (propertyValue && typeof propertyValue === 'object') {
            try {
                const keys = Object.keys(propertyValue);
                if (keys.includes('r') && keys.includes('g') && keys.includes('b')) {
                    type = 'color';
                } else if (keys.includes('x') && keys.includes('y')) {
                    type = propertyValue.z !== undefined ? 'vec3' : 'vec2';
                } else if (keys.includes('width') && keys.includes('height')) {
                    type = 'size';
                } else if (keys.includes('uuid') || keys.includes('__uuid__')) {
                    // 檢查是否是節點引用（通過屬性名或__id__屬性判斷）
                    if (propertyName.toLowerCase().includes('node') || 
                        propertyName.toLowerCase().includes('target') ||
                        keys.includes('__id__')) {
                        type = 'node';
                    } else {
                        type = 'asset';
                    }
                } else if (keys.includes('__id__')) {
                    // 節點引用特徵
                    type = 'node';
                } else {
                    type = 'object';
                }
            } catch (error) {
                console.warn(`[analyzeProperty] Error checking property type for: ${JSON.stringify(propertyValue)}`);
                type = 'object';
            }
        } else if (propertyValue === null || propertyValue === undefined) {
            // For null/undefined values, check property name to determine type
            if (['spriteFrame', 'texture', 'material', 'font', 'clip', 'prefab'].includes(propertyName.toLowerCase())) {
                type = 'asset';
            } else if (propertyName.toLowerCase().includes('node') || 
                      propertyName.toLowerCase().includes('target')) {
                type = 'node';
            } else if (propertyName.toLowerCase().includes('component')) {
                type = 'component';
            } else {
                type = 'unknown';
            }
        }
        
        return {
            exists: true,
            type,
            availableProperties,
            originalValue: propertyValue
        };
    }

    private smartConvertValue(inputValue: any, propertyInfo: any): any {
        const { type, originalValue } = propertyInfo;
        
        debugLog(`[smartConvertValue] Converting ${JSON.stringify(inputValue)} to type: ${type}`);
        
        switch (type) {
            case 'string':
                return String(inputValue);
                
            case 'number':
                return Number(inputValue);
                
            case 'boolean':
                if (typeof inputValue === 'boolean') return inputValue;
                if (typeof inputValue === 'string') {
                    return inputValue.toLowerCase() === 'true' || inputValue === '1';
                }
                return Boolean(inputValue);
                
            case 'color':
                // 優化的顏色處理，支持多種輸入格式
                if (typeof inputValue === 'string') {
                    // 字符串格式：十六進制、顏色名稱、rgb()/rgba()
                    return this.parseColorString(inputValue);
                } else if (typeof inputValue === 'object' && inputValue !== null) {
                    try {
                        const inputKeys = Object.keys(inputValue);
                        // 如果輸入是顏色對象，驗證並轉換
                        if (inputKeys.includes('r') || inputKeys.includes('g') || inputKeys.includes('b')) {
                            return {
                                r: Math.min(255, Math.max(0, Number(inputValue.r) || 0)),
                                g: Math.min(255, Math.max(0, Number(inputValue.g) || 0)),
                                b: Math.min(255, Math.max(0, Number(inputValue.b) || 0)),
                                a: inputValue.a !== undefined ? Math.min(255, Math.max(0, Number(inputValue.a))) : 255
                            };
                        }
                    } catch (error) {
                        console.warn(`[smartConvertValue] Invalid color object: ${JSON.stringify(inputValue)}`);
                    }
                }
                // 如果有原值，保持原值結構並更新提供的值
                if (originalValue && typeof originalValue === 'object') {
                    try {
                        const inputKeys = typeof inputValue === 'object' && inputValue ? Object.keys(inputValue) : [];
                        return {
                            r: inputKeys.includes('r') ? Math.min(255, Math.max(0, Number(inputValue.r))) : (originalValue.r || 255),
                            g: inputKeys.includes('g') ? Math.min(255, Math.max(0, Number(inputValue.g))) : (originalValue.g || 255),
                            b: inputKeys.includes('b') ? Math.min(255, Math.max(0, Number(inputValue.b))) : (originalValue.b || 255),
                            a: inputKeys.includes('a') ? Math.min(255, Math.max(0, Number(inputValue.a))) : (originalValue.a || 255)
                        };
                    } catch (error) {
                        console.warn(`[smartConvertValue] Error processing color with original value: ${error}`);
                    }
                }
                // 默認返回白色
                console.warn(`[smartConvertValue] Using default white color for invalid input: ${JSON.stringify(inputValue)}`);
                return { r: 255, g: 255, b: 255, a: 255 };
                
            case 'vec2':
                if (typeof inputValue === 'object' && inputValue !== null) {
                    return {
                        x: Number(inputValue.x) || originalValue.x || 0,
                        y: Number(inputValue.y) || originalValue.y || 0
                    };
                }
                return originalValue;
                
            case 'vec3':
                if (typeof inputValue === 'object' && inputValue !== null) {
                    return {
                        x: Number(inputValue.x) || originalValue.x || 0,
                        y: Number(inputValue.y) || originalValue.y || 0,
                        z: Number(inputValue.z) || originalValue.z || 0
                    };
                }
                return originalValue;
                
            case 'size':
                if (typeof inputValue === 'object' && inputValue !== null) {
                    return {
                        width: Number(inputValue.width) || originalValue.width || 100,
                        height: Number(inputValue.height) || originalValue.height || 100
                    };
                }
                return originalValue;
                
            case 'node':
                if (typeof inputValue === 'string') {
                    // 節點引用需要特殊處理
                    return inputValue;
                } else if (typeof inputValue === 'object' && inputValue !== null) {
                    // 如果已經是對象形式，返回UUID或完整對象
                    return inputValue.uuid || inputValue;
                }
                return originalValue;
                
            case 'asset':
                if (typeof inputValue === 'string') {
                    // 如果輸入是字符串路徑，轉換為asset對象
                    return { uuid: inputValue };
                } else if (typeof inputValue === 'object' && inputValue !== null) {
                    return inputValue;
                }
                return originalValue;
                
            default:
                // 對於未知類型，儘量保持原有結構
                if (typeof inputValue === typeof originalValue) {
                    return inputValue;
                }
                return originalValue;
        }
    }

        private parseColorString(colorStr: string): { r: number; g: number; b: number; a: number } {
        const str = colorStr.trim();
        
        // 只支持十六進制格式 #RRGGBB 或 #RRGGBBAA
        if (str.startsWith('#')) {
            if (str.length === 7) { // #RRGGBB
                const r = parseInt(str.substring(1, 3), 16);
                const g = parseInt(str.substring(3, 5), 16);
                const b = parseInt(str.substring(5, 7), 16);
                return { r, g, b, a: 255 };
            } else if (str.length === 9) { // #RRGGBBAA
                const r = parseInt(str.substring(1, 3), 16);
                const g = parseInt(str.substring(3, 5), 16);
                const b = parseInt(str.substring(5, 7), 16);
                const a = parseInt(str.substring(7, 9), 16);
                return { r, g, b, a };
            }
        }
        
        // 如果不是有效的十六進制格式，返回錯誤提示
        throw new Error(`Invalid color format: "${colorStr}". Only hexadecimal format is supported (e.g., "#FF0000" or "#FF0000FF")`);
    }

    private async verifyPropertyChange(nodeUuid: string, componentType: string, property: string, originalValue: any, expectedValue: any): Promise<{ verified: boolean; actualValue: any; fullData: any }> {
        debugLog(`[verifyPropertyChange] Starting verification for ${componentType}.${property}`);
        debugLog(`[verifyPropertyChange] Expected value:`, JSON.stringify(expectedValue));
        debugLog(`[verifyPropertyChange] Original value:`, JSON.stringify(originalValue));
        
        try {
            // 重新獲取組件信息進行驗證
            debugLog(`[verifyPropertyChange] Calling getComponentInfo...`);
            const componentInfo = await this.getComponentInfo(nodeUuid, componentType);
            debugLog(`[verifyPropertyChange] getComponentInfo success:`, componentInfo.success);
            
            const allComponents = await this.getComponents(nodeUuid);
            debugLog(`[verifyPropertyChange] getComponents success:`, allComponents.success);
            
            if (componentInfo.success && componentInfo.data) {
                debugLog(`[verifyPropertyChange] Component data available, extracting property '${property}'`);
                const allPropertyNames = Object.keys(componentInfo.data.properties || {});
                debugLog(`[verifyPropertyChange] Available properties:`, allPropertyNames);
                const propertyData = componentInfo.data.properties?.[property];
                debugLog(`[verifyPropertyChange] Raw property data for '${property}':`, JSON.stringify(propertyData));
                
                // 從屬性數據中提取實際值
                let actualValue = propertyData;
                debugLog(`[verifyPropertyChange] Initial actualValue:`, JSON.stringify(actualValue));
                
                if (propertyData && typeof propertyData === 'object' && 'value' in propertyData) {
                    actualValue = propertyData.value;
                    debugLog(`[verifyPropertyChange] Extracted actualValue from .value:`, JSON.stringify(actualValue));
                } else {
                    debugLog(`[verifyPropertyChange] No .value property found, using raw data`);
                }
                
                // 修復驗證邏輯：檢查實際值是否匹配期望值
                let verified = false;
                
                if (typeof expectedValue === 'object' && expectedValue !== null && 'uuid' in expectedValue) {
                    // 對於引用類型（節點/組件/資源），比較UUID
                    const actualUuid = actualValue && typeof actualValue === 'object' && 'uuid' in actualValue ? actualValue.uuid : '';
                    const expectedUuid = expectedValue.uuid || '';
                    verified = actualUuid === expectedUuid && expectedUuid !== '';
                    
                    debugLog(`[verifyPropertyChange] Reference comparison:`);
                    debugLog(`  - Expected UUID: "${expectedUuid}"`);
                    debugLog(`  - Actual UUID: "${actualUuid}"`);
                    debugLog(`  - UUID match: ${actualUuid === expectedUuid}`);
                    debugLog(`  - UUID not empty: ${expectedUuid !== ''}`);
                    debugLog(`  - Final verified: ${verified}`);
                } else {
                    // 對於其他類型，直接比較值
                    debugLog(`[verifyPropertyChange] Value comparison:`);
                    debugLog(`  - Expected type: ${typeof expectedValue}`);
                    debugLog(`  - Actual type: ${typeof actualValue}`);
                    
                    if (typeof actualValue === typeof expectedValue) {
                        if (typeof actualValue === 'object' && actualValue !== null && expectedValue !== null) {
                            // 對象類型的深度比較
                            verified = JSON.stringify(actualValue) === JSON.stringify(expectedValue);
                            debugLog(`  - Object comparison (JSON): ${verified}`);
                        } else {
                            // 基本類型的直接比較
                            verified = actualValue === expectedValue;
                            debugLog(`  - Direct comparison: ${verified}`);
                        }
                    } else {
                        // 類型不匹配時的特殊處理（如數字和字符串）
                        const stringMatch = String(actualValue) === String(expectedValue);
                        const numberMatch = Number(actualValue) === Number(expectedValue);
                        verified = stringMatch || numberMatch;
                        debugLog(`  - String match: ${stringMatch}`);
                        debugLog(`  - Number match: ${numberMatch}`);
                        debugLog(`  - Type mismatch verified: ${verified}`);
                    }
                }
                
                debugLog(`[verifyPropertyChange] Final verification result: ${verified}`);
                debugLog(`[verifyPropertyChange] Final actualValue:`, JSON.stringify(actualValue));
                
                const result = {
                    verified,
                    actualValue,
                    fullData: {
                        // 只返回修改的屬性信息，不返回完整組件數據
                        modifiedProperty: {
                            name: property,
                            before: originalValue,
                            expected: expectedValue,
                            actual: actualValue,
                            verified,
                            propertyMetadata: propertyData // 只包含這個屬性的元數據
                        },
                        // 簡化的組件信息
                        componentSummary: {
                            nodeUuid,
                            componentType,
                            totalProperties: Object.keys(componentInfo.data?.properties || {}).length
                        }
                    }
                };
                
                debugLog(`[verifyPropertyChange] Returning result:`, JSON.stringify(result, null, 2));
                return result;
            } else {
                debugLog(`[verifyPropertyChange] ComponentInfo failed or no data:`, componentInfo);
            }
        } catch (error) {
            console.error('[verifyPropertyChange] Verification failed with error:', error);
            console.error('[verifyPropertyChange] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
        }
        
        debugLog(`[verifyPropertyChange] Returning fallback result`);
        return {
            verified: false,
            actualValue: undefined,
            fullData: null
        };
    }

    /**
     * 檢測是否為節點屬性，如果是則重定向到對應的節點方法
     */
    private async checkAndRedirectNodeProperties(args: any): Promise<ToolResponse | null> {
        const { nodeUuid, componentType, property, propertyType, value } = args;
        
        // 檢測是否為節點基礎屬性（應該使用 set_node_property）
        const nodeBasicProperties = [
            'name', 'active', 'layer', 'mobility', 'parent', 'children', 'hideFlags'
        ];
        
        // 檢測是否為節點變換屬性（應該使用 set_node_transform）
        const nodeTransformProperties = [
            'position', 'rotation', 'scale', 'eulerAngles', 'angle'
        ];
        
        // Detect attempts to set cc.Node properties (common mistake)
        if (componentType === 'cc.Node' || componentType === 'Node') {
            if (nodeBasicProperties.includes(property)) {
                return {
                    success: false,
                                          error: `Property '${property}' is a node basic property, not a component property`,
                      instruction: `Please use set_node_property method to set node properties: set_node_property(uuid="${nodeUuid}", property="${property}", value=${JSON.stringify(value)})`
                  };
              } else if (nodeTransformProperties.includes(property)) {
                  return {
                      success: false,
                      error: `Property '${property}' is a node transform property, not a component property`,
                      instruction: `Please use set_node_transform method to set transform properties: set_node_transform(uuid="${nodeUuid}", ${property}=${JSON.stringify(value)})`
                  };
              }
          }
          
          // Detect common incorrect usage
          if (nodeBasicProperties.includes(property) || nodeTransformProperties.includes(property)) {
              const methodName = nodeTransformProperties.includes(property) ? 'set_node_transform' : 'set_node_property';
              return {
                  success: false,
                  error: `Property '${property}' is a node property, not a component property`,
                  instruction: `Property '${property}' should be set using ${methodName} method, not set_component_property. Please use: ${methodName}(uuid="${nodeUuid}", ${nodeTransformProperties.includes(property) ? property : `property="${property}"`}=${JSON.stringify(value)})`
              };
          }
          
          return null; // 不是節點屬性，繼續正常處理
      }

      /**
       * 生成組件建議信息
       */
      private generateComponentSuggestion(requestedType: string, availableTypes: string[], property: string): string {
          // 檢查是否存在相似的組件類型
          const similarTypes = availableTypes.filter(type => 
              type.toLowerCase().includes(requestedType.toLowerCase()) || 
              requestedType.toLowerCase().includes(type.toLowerCase())
          );
          
          let instruction = '';
          
          if (similarTypes.length > 0) {
              instruction += `\n\n🔍 Found similar components: ${similarTypes.join(', ')}`;
              instruction += `\n💡 Suggestion: Perhaps you meant to set the '${similarTypes[0]}' component?`;
          }
          
          // Recommend possible components based on property name
          const propertyToComponentMap: Record<string, string[]> = {
              'string': ['cc.Label', 'cc.RichText', 'cc.EditBox'],
              'text': ['cc.Label', 'cc.RichText'],
              'fontSize': ['cc.Label', 'cc.RichText'],
              'spriteFrame': ['cc.Sprite'],
              'color': ['cc.Label', 'cc.Sprite', 'cc.Graphics'],
              'normalColor': ['cc.Button'],
              'pressedColor': ['cc.Button'],
              'target': ['cc.Button'],
              'contentSize': ['cc.UITransform'],
              'anchorPoint': ['cc.UITransform']
          };
          
          const recommendedComponents = propertyToComponentMap[property] || [];
          const availableRecommended = recommendedComponents.filter(comp => availableTypes.includes(comp));
          
          if (availableRecommended.length > 0) {
              instruction += `\n\n🎯 Based on property '${property}', recommended components: ${availableRecommended.join(', ')}`;
          }
          
          // Provide operation suggestions
          instruction += `\n\n📋 Suggested Actions:`;
          instruction += `\n1. Use get_components(nodeUuid="${requestedType.includes('uuid') ? 'YOUR_NODE_UUID' : 'nodeUuid'}") to view all components on the node`;
          instruction += `\n2. If you need to add a component, use add_component(nodeUuid="...", componentType="${requestedType}")`;
          instruction += `\n3. Verify that the component type name is correct (case-sensitive)`;
          
                  return instruction;
    }

    /**
     * 快速驗證資源設置結果
     */
    private async quickVerifyAsset(nodeUuid: string, componentType: string, property: string): Promise<any> {
        try {
            const rawNodeData = await Editor.Message.request('scene', 'query-node', nodeUuid);
            if (!rawNodeData || !rawNodeData.__comps__) {
                return null;
            }
            
            // 找到組件
            const component = rawNodeData.__comps__.find((comp: any) => {
                const compType = comp.__type__ || comp.cid || comp.type;
                return compType === componentType;
            });
            
            if (!component) {
                return null;
            }
            
            // 提取屬性值
            const properties = this.extractComponentProperties(component);
            const propertyData = properties[property];
            
            if (propertyData && typeof propertyData === 'object' && 'value' in propertyData) {
                return propertyData.value;
            } else {
                return propertyData;
            }
        } catch (error) {
            console.error(`[quickVerifyAsset] Error:`, error);
            return null;
        }
    }
}