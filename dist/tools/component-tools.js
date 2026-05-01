"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ComponentTools = void 0;
const log_1 = require("../lib/log");
const schema_1 = require("../lib/schema");
const scene_bridge_1 = require("../lib/scene-bridge");
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
 * query the node, locate the matching component index, and set
 * `enabled` to its current value (no-op semantically, forces sync).
 *
 * Best-effort: failures are swallowed because the runtime mutation
 * already happened — only persistence to disk is at stake.
 */
async function nudgeEditorModel(nodeUuid, componentType) {
    var _a, _b, _c, _d;
    try {
        const nodeData = await Editor.Message.request('scene', 'query-node', nodeUuid);
        const comps = (_a = nodeData === null || nodeData === void 0 ? void 0 : nodeData.__comps__) !== null && _a !== void 0 ? _a : [];
        const idx = comps.findIndex(c => ((c === null || c === void 0 ? void 0 : c.__type__) || (c === null || c === void 0 ? void 0 : c.cid) || (c === null || c === void 0 ? void 0 : c.type)) === componentType);
        if (idx === -1)
            return;
        const enabledValue = ((_d = (_c = (_b = comps[idx]) === null || _b === void 0 ? void 0 : _b.value) === null || _c === void 0 ? void 0 : _c.enabled) === null || _d === void 0 ? void 0 : _d.value) !== false;
        await Editor.Message.request('scene', 'set-property', {
            uuid: nodeUuid,
            path: `__comps__.${idx}.enabled`,
            dump: { value: enabledValue },
        });
    }
    catch (err) {
        (0, log_1.debugLog)('[ComponentTools] nudge set-property failed (non-fatal):', err);
    }
}
const setComponentPropertyValueDescription = 'Property value - Use the corresponding data format based on propertyType:\n\n' +
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
const setComponentPropertyPropertyDescription = 'Property name - The property to set. Common properties include:\n' +
    '• cc.Label: string (text content), fontSize (font size), color (text color)\n' +
    '• cc.Sprite: spriteFrame (sprite frame), color (tint color), sizeMode (size mode)\n' +
    '• cc.Button: normalColor (normal color), pressedColor (pressed color), target (target node)\n' +
    '• cc.UITransform: contentSize (content size), anchorPoint (anchor point)\n' +
    '• Custom Scripts: Based on properties defined in the script';
const componentSchemas = {
    add_component: schema_1.z.object({
        nodeUuid: schema_1.z.string().describe('Target node UUID. REQUIRED: You must specify the exact node to add the component to. Use get_all_nodes or find_node_by_name to get the UUID of the desired node.'),
        componentType: schema_1.z.string().describe('Component type (e.g., cc.Sprite, cc.Label, cc.Button)'),
    }),
    remove_component: schema_1.z.object({
        nodeUuid: schema_1.z.string().describe('Node UUID'),
        componentType: schema_1.z.string().describe('Component cid (type field from getComponents). Do NOT use script name or class name. Example: "cc.Sprite" or "9b4a7ueT9xD6aRE+AlOusy1"'),
    }),
    get_components: schema_1.z.object({
        nodeUuid: schema_1.z.string().describe('Node UUID'),
    }),
    get_component_info: schema_1.z.object({
        nodeUuid: schema_1.z.string().describe('Node UUID'),
        componentType: schema_1.z.string().describe('Component type to get info for'),
    }),
    set_component_property: schema_1.z.object({
        nodeUuid: schema_1.z.string().describe('Target node UUID - Must specify the node to operate on'),
        // No enum on componentType — custom scripts must be allowed.
        componentType: schema_1.z.string().describe('Component type - Can be built-in components (e.g., cc.Label) or custom script components (e.g., MyScript). If unsure about component type, use get_components first to retrieve all components on the node.'),
        property: schema_1.z.string().describe(setComponentPropertyPropertyDescription),
        propertyType: schema_1.z.enum([
            'string', 'number', 'boolean', 'integer', 'float',
            'color', 'vec2', 'vec3', 'size',
            'node', 'component', 'spriteFrame', 'prefab', 'asset',
            'nodeArray', 'colorArray', 'numberArray', 'stringArray',
        ]).describe('Property type - Must explicitly specify the property data type for correct value conversion and validation'),
        value: schema_1.z.any().describe(setComponentPropertyValueDescription),
    }),
    attach_script: schema_1.z.object({
        nodeUuid: schema_1.z.string().describe('Node UUID'),
        scriptPath: schema_1.z.string().describe('Script asset path (e.g., db://assets/scripts/MyScript.ts)'),
    }),
    get_available_components: schema_1.z.object({
        category: schema_1.z.enum(['all', 'renderer', 'ui', 'physics', 'animation', 'audio']).default('all').describe('Component category filter'),
    }),
    add_event_handler: schema_1.z.object({
        nodeUuid: schema_1.z.string().describe('Node UUID owning the component (e.g. the Button node)'),
        componentType: schema_1.z.string().default('cc.Button').describe('Component class name; defaults to cc.Button'),
        eventArrayProperty: schema_1.z.string().default('clickEvents').describe('Component property holding the EventHandler array (cc.Button.clickEvents, cc.Toggle.checkEvents, …)'),
        targetNodeUuid: schema_1.z.string().describe('Node UUID where the callback component lives (most often the same as nodeUuid)'),
        componentName: schema_1.z.string().describe('Class name (cc-class) of the script that owns the callback method'),
        handler: schema_1.z.string().describe('Method name on the target component, e.g. "onClick"'),
        customEventData: schema_1.z.string().optional().describe('Optional string passed back when the event fires'),
    }),
    remove_event_handler: schema_1.z.object({
        nodeUuid: schema_1.z.string().describe('Node UUID owning the component'),
        componentType: schema_1.z.string().default('cc.Button').describe('Component class name'),
        eventArrayProperty: schema_1.z.string().default('clickEvents').describe('EventHandler array property name'),
        index: schema_1.z.number().int().min(0).optional().describe('Zero-based index to remove. Takes precedence over targetNodeUuid/handler matching when provided.'),
        targetNodeUuid: schema_1.z.string().optional().describe('Match handlers whose target node has this UUID'),
        handler: schema_1.z.string().optional().describe('Match handlers with this method name'),
    }),
    list_event_handlers: schema_1.z.object({
        nodeUuid: schema_1.z.string().describe('Node UUID owning the component'),
        componentType: schema_1.z.string().default('cc.Button').describe('Component class name'),
        eventArrayProperty: schema_1.z.string().default('clickEvents').describe('EventHandler array property name'),
    }),
};
const componentToolMeta = {
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
class ComponentTools {
    getTools() {
        return Object.keys(componentSchemas).map(name => ({
            name,
            description: componentToolMeta[name],
            inputSchema: (0, schema_1.toInputSchema)(componentSchemas[name]),
        }));
    }
    async execute(toolName, args) {
        var _a, _b, _c;
        const schemaName = toolName;
        const schema = componentSchemas[schemaName];
        if (!schema) {
            throw new Error(`Unknown tool: ${toolName}`);
        }
        const validation = (0, schema_1.validateArgs)(schema, args !== null && args !== void 0 ? args : {});
        if (!validation.ok) {
            return validation.response;
        }
        const a = validation.data;
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
                const resp = await (0, scene_bridge_1.runSceneMethodAsToolResponse)('addEventHandler', [
                    a.nodeUuid,
                    a.componentType,
                    a.eventArrayProperty,
                    a.targetNodeUuid,
                    a.componentName,
                    a.handler,
                    a.customEventData,
                ]);
                if (resp.success)
                    await nudgeEditorModel(a.nodeUuid, a.componentType);
                return resp;
            }
            case 'remove_event_handler': {
                const resp = await (0, scene_bridge_1.runSceneMethodAsToolResponse)('removeEventHandler', [
                    a.nodeUuid,
                    a.componentType,
                    a.eventArrayProperty,
                    (_a = a.index) !== null && _a !== void 0 ? _a : null,
                    (_b = a.targetNodeUuid) !== null && _b !== void 0 ? _b : null,
                    (_c = a.handler) !== null && _c !== void 0 ? _c : null,
                ]);
                if (resp.success)
                    await nudgeEditorModel(a.nodeUuid, a.componentType);
                return resp;
            }
            case 'list_event_handlers':
                return await (0, scene_bridge_1.runSceneMethodAsToolResponse)('listEventHandlers', [
                    a.nodeUuid,
                    a.componentType,
                    a.eventArrayProperty,
                ]);
        }
    }
    async addComponent(nodeUuid, componentType) {
        return new Promise(async (resolve) => {
            var _a;
            // 先查找节点上是否已存在该组件
            const allComponentsInfo = await this.getComponents(nodeUuid);
            if (allComponentsInfo.success && ((_a = allComponentsInfo.data) === null || _a === void 0 ? void 0 : _a.components)) {
                const existingComponent = allComponentsInfo.data.components.find((comp) => comp.type === componentType);
                if (existingComponent) {
                    resolve({
                        success: true,
                        message: `Component '${componentType}' already exists on node`,
                        data: {
                            nodeUuid: nodeUuid,
                            componentType: componentType,
                            componentVerified: true,
                            existing: true
                        }
                    });
                    return;
                }
            }
            // 尝试直接使用 Editor API 添加组件
            Editor.Message.request('scene', 'create-component', {
                uuid: nodeUuid,
                component: componentType
            }).then(async (result) => {
                var _a;
                // 等待一段时间让Editor完成组件添加
                await new Promise(resolve => setTimeout(resolve, 100));
                // 重新查询节点信息验证组件是否真的添加成功
                try {
                    const allComponentsInfo2 = await this.getComponents(nodeUuid);
                    if (allComponentsInfo2.success && ((_a = allComponentsInfo2.data) === null || _a === void 0 ? void 0 : _a.components)) {
                        const addedComponent = allComponentsInfo2.data.components.find((comp) => comp.type === componentType);
                        if (addedComponent) {
                            resolve({
                                success: true,
                                message: `Component '${componentType}' added successfully`,
                                data: {
                                    nodeUuid: nodeUuid,
                                    componentType: componentType,
                                    componentVerified: true,
                                    existing: false
                                }
                            });
                        }
                        else {
                            resolve({
                                success: false,
                                error: `Component '${componentType}' was not found on node after addition. Available components: ${allComponentsInfo2.data.components.map((c) => c.type).join(', ')}`
                            });
                        }
                    }
                    else {
                        resolve({
                            success: false,
                            error: `Failed to verify component addition: ${allComponentsInfo2.error || 'Unable to get node components'}`
                        });
                    }
                }
                catch (verifyError) {
                    resolve({
                        success: false,
                        error: `Failed to verify component addition: ${verifyError.message}`
                    });
                }
            }).catch((err) => {
                // 备用方案：使用场景脚本
                const options = {
                    name: 'cocos-mcp-server',
                    method: 'addComponentToNode',
                    args: [nodeUuid, componentType]
                };
                Editor.Message.request('scene', 'execute-scene-script', options).then((result) => {
                    resolve(result);
                }).catch((err2) => {
                    resolve({ success: false, error: `Direct API failed: ${err.message}, Scene script failed: ${err2.message}` });
                });
            });
        });
    }
    async removeComponent(nodeUuid, componentType) {
        return new Promise(async (resolve) => {
            var _a, _b, _c;
            // 1. 查找节点上的所有组件
            const allComponentsInfo = await this.getComponents(nodeUuid);
            if (!allComponentsInfo.success || !((_a = allComponentsInfo.data) === null || _a === void 0 ? void 0 : _a.components)) {
                resolve({ success: false, error: `Failed to get components for node '${nodeUuid}': ${allComponentsInfo.error}` });
                return;
            }
            // 2. 只查找type字段等于componentType的组件（即cid）
            const exists = allComponentsInfo.data.components.some((comp) => comp.type === componentType);
            if (!exists) {
                resolve({ success: false, error: `Component cid '${componentType}' not found on node '${nodeUuid}'. 请用getComponents获取type字段（cid）作为componentType。` });
                return;
            }
            // 3. 官方API直接移除
            try {
                await Editor.Message.request('scene', 'remove-component', {
                    uuid: nodeUuid,
                    component: componentType
                });
                // 4. 再查一次确认是否移除
                const afterRemoveInfo = await this.getComponents(nodeUuid);
                const stillExists = afterRemoveInfo.success && ((_c = (_b = afterRemoveInfo.data) === null || _b === void 0 ? void 0 : _b.components) === null || _c === void 0 ? void 0 : _c.some((comp) => comp.type === componentType));
                if (stillExists) {
                    resolve({ success: false, error: `Component cid '${componentType}' was not removed from node '${nodeUuid}'.` });
                }
                else {
                    resolve({
                        success: true,
                        message: `Component cid '${componentType}' removed successfully from node '${nodeUuid}'`,
                        data: { nodeUuid, componentType }
                    });
                }
            }
            catch (err) {
                resolve({ success: false, error: `Failed to remove component: ${err.message}` });
            }
        });
    }
    async getComponents(nodeUuid) {
        return new Promise((resolve) => {
            // 优先尝试直接使用 Editor API 查询节点信息
            Editor.Message.request('scene', 'query-node', nodeUuid).then((nodeData) => {
                if (nodeData && nodeData.__comps__) {
                    const components = nodeData.__comps__.map((comp) => {
                        var _a;
                        return ({
                            type: comp.__type__ || comp.cid || comp.type || 'Unknown',
                            uuid: ((_a = comp.uuid) === null || _a === void 0 ? void 0 : _a.value) || comp.uuid || null,
                            enabled: comp.enabled !== undefined ? comp.enabled : true,
                            properties: this.extractComponentProperties(comp)
                        });
                    });
                    resolve({
                        success: true,
                        data: {
                            nodeUuid: nodeUuid,
                            components: components
                        }
                    });
                }
                else {
                    resolve({ success: false, error: 'Node not found or no components data' });
                }
            }).catch((err) => {
                // 备用方案：使用场景脚本
                const options = {
                    name: 'cocos-mcp-server',
                    method: 'getNodeInfo',
                    args: [nodeUuid]
                };
                Editor.Message.request('scene', 'execute-scene-script', options).then((result) => {
                    if (result.success) {
                        resolve({
                            success: true,
                            data: result.data.components
                        });
                    }
                    else {
                        resolve(result);
                    }
                }).catch((err2) => {
                    resolve({ success: false, error: `Direct API failed: ${err.message}, Scene script failed: ${err2.message}` });
                });
            });
        });
    }
    async getComponentInfo(nodeUuid, componentType) {
        return new Promise((resolve) => {
            // 优先尝试直接使用 Editor API 查询节点信息
            Editor.Message.request('scene', 'query-node', nodeUuid).then((nodeData) => {
                if (nodeData && nodeData.__comps__) {
                    const component = nodeData.__comps__.find((comp) => {
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
                    }
                    else {
                        resolve({ success: false, error: `Component '${componentType}' not found on node` });
                    }
                }
                else {
                    resolve({ success: false, error: 'Node not found or no components data' });
                }
            }).catch((err) => {
                // 备用方案：使用场景脚本
                const options = {
                    name: 'cocos-mcp-server',
                    method: 'getNodeInfo',
                    args: [nodeUuid]
                };
                Editor.Message.request('scene', 'execute-scene-script', options).then((result) => {
                    if (result.success && result.data.components) {
                        const component = result.data.components.find((comp) => comp.type === componentType);
                        if (component) {
                            resolve({
                                success: true,
                                data: Object.assign({ nodeUuid: nodeUuid, componentType: componentType }, component)
                            });
                        }
                        else {
                            resolve({ success: false, error: `Component '${componentType}' not found on node` });
                        }
                    }
                    else {
                        resolve({ success: false, error: result.error || 'Failed to get component info' });
                    }
                }).catch((err2) => {
                    resolve({ success: false, error: `Direct API failed: ${err.message}, Scene script failed: ${err2.message}` });
                });
            });
        });
    }
    extractComponentProperties(component) {
        (0, log_1.debugLog)(`[extractComponentProperties] Processing component:`, Object.keys(component));
        // 检查组件是否有 value 属性，这通常包含实际的组件属性
        if (component.value && typeof component.value === 'object') {
            (0, log_1.debugLog)(`[extractComponentProperties] Found component.value with properties:`, Object.keys(component.value));
            return component.value; // 直接返回 value 对象，它包含所有组件属性
        }
        // 备用方案：从组件对象中直接提取属性
        const properties = {};
        const excludeKeys = ['__type__', 'enabled', 'node', '_id', '__scriptAsset', 'uuid', 'name', '_name', '_objFlags', '_enabled', 'type', 'readonly', 'visible', 'cid', 'editor', 'extends'];
        for (const key in component) {
            if (!excludeKeys.includes(key) && !key.startsWith('_')) {
                (0, log_1.debugLog)(`[extractComponentProperties] Found direct property '${key}':`, typeof component[key]);
                properties[key] = component[key];
            }
        }
        (0, log_1.debugLog)(`[extractComponentProperties] Final extracted properties:`, Object.keys(properties));
        return properties;
    }
    async findComponentTypeByUuid(componentUuid) {
        var _a;
        (0, log_1.debugLog)(`[findComponentTypeByUuid] Searching for component type with UUID: ${componentUuid}`);
        if (!componentUuid) {
            return null;
        }
        try {
            const nodeTree = await Editor.Message.request('scene', 'query-node-tree');
            if (!nodeTree) {
                console.warn('[findComponentTypeByUuid] Failed to query node tree.');
                return null;
            }
            const queue = [nodeTree];
            while (queue.length > 0) {
                const currentNodeInfo = queue.shift();
                if (!currentNodeInfo || !currentNodeInfo.uuid) {
                    continue;
                }
                try {
                    const fullNodeData = await Editor.Message.request('scene', 'query-node', currentNodeInfo.uuid);
                    if (fullNodeData && fullNodeData.__comps__) {
                        for (const comp of fullNodeData.__comps__) {
                            const compAny = comp; // Cast to any to access dynamic properties
                            // The component UUID is nested in the 'value' property
                            if (compAny.uuid && compAny.uuid.value === componentUuid) {
                                const componentType = compAny.__type__;
                                (0, log_1.debugLog)(`[findComponentTypeByUuid] Found component type '${componentType}' for UUID ${componentUuid} on node ${(_a = fullNodeData.name) === null || _a === void 0 ? void 0 : _a.value}`);
                                return componentType;
                            }
                        }
                    }
                }
                catch (e) {
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
        }
        catch (error) {
            console.error(`[findComponentTypeByUuid] Error while searching for component type:`, error);
            return null;
        }
    }
    async setComponentProperty(args) {
        const { nodeUuid, componentType, property, propertyType, value } = args;
        return new Promise(async (resolve) => {
            var _a, _b;
            try {
                (0, log_1.debugLog)(`[ComponentTools] Setting ${componentType}.${property} (type: ${propertyType}) = ${JSON.stringify(value)} on node ${nodeUuid}`);
                // Step 0: 检测是否为节点属性，如果是则重定向到对应的节点方法
                const nodeRedirectResult = await this.checkAndRedirectNodeProperties(args);
                if (nodeRedirectResult) {
                    resolve(nodeRedirectResult);
                    return;
                }
                // Step 1: 获取组件信息，使用与getComponents相同的方法
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
                // Step 2: 查找目标组件
                let targetComponent = null;
                const availableTypes = [];
                for (let i = 0; i < allComponents.length; i++) {
                    const comp = allComponents[i];
                    availableTypes.push(comp.type);
                    if (comp.type === componentType) {
                        targetComponent = comp;
                        break;
                    }
                }
                if (!targetComponent) {
                    // 提供更详细的错误信息和建议
                    const instruction = this.generateComponentSuggestion(componentType, availableTypes, property);
                    resolve({
                        success: false,
                        error: `Component '${componentType}' not found on node. Available components: ${availableTypes.join(', ')}`,
                        instruction: instruction
                    });
                    return;
                }
                // Step 3: 自动检测和转换属性值
                let propertyInfo;
                try {
                    (0, log_1.debugLog)(`[ComponentTools] Analyzing property: ${property}`);
                    propertyInfo = this.analyzeProperty(targetComponent, property);
                }
                catch (analyzeError) {
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
                // Step 4: 处理属性值和设置
                const originalValue = propertyInfo.originalValue;
                let processedValue;
                // 根据明确的propertyType处理属性值
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
                            // 字符串格式：支持十六进制、颜色名称、rgb()/rgba()
                            processedValue = this.parseColorString(value);
                        }
                        else if (typeof value === 'object' && value !== null) {
                            // 对象格式：验证并转换RGBA值
                            processedValue = {
                                r: Math.min(255, Math.max(0, Number(value.r) || 0)),
                                g: Math.min(255, Math.max(0, Number(value.g) || 0)),
                                b: Math.min(255, Math.max(0, Number(value.b) || 0)),
                                a: value.a !== undefined ? Math.min(255, Math.max(0, Number(value.a))) : 255
                            };
                        }
                        else {
                            throw new Error('Color value must be an object with r, g, b properties or a hexadecimal string (e.g., "#FF0000")');
                        }
                        break;
                    case 'vec2':
                        if (typeof value === 'object' && value !== null) {
                            processedValue = {
                                x: Number(value.x) || 0,
                                y: Number(value.y) || 0
                            };
                        }
                        else {
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
                        }
                        else {
                            throw new Error('Vec3 value must be an object with x, y, z properties');
                        }
                        break;
                    case 'size':
                        if (typeof value === 'object' && value !== null) {
                            processedValue = {
                                width: Number(value.width) || 0,
                                height: Number(value.height) || 0
                            };
                        }
                        else {
                            throw new Error('Size value must be an object with width, height properties');
                        }
                        break;
                    case 'node':
                        if (typeof value === 'string') {
                            processedValue = { uuid: value };
                        }
                        else {
                            throw new Error('Node reference value must be a string UUID');
                        }
                        break;
                    case 'component':
                        if (typeof value === 'string') {
                            // 组件引用需要特殊处理：通过节点UUID找到组件的__id__
                            processedValue = value; // 先保存节点UUID，后续会转换为__id__
                        }
                        else {
                            throw new Error('Component reference value must be a string (node UUID containing the target component)');
                        }
                        break;
                    case 'spriteFrame':
                    case 'prefab':
                    case 'asset':
                        if (typeof value === 'string') {
                            processedValue = { uuid: value };
                        }
                        else {
                            throw new Error(`${propertyType} value must be a string UUID`);
                        }
                        break;
                    case 'nodeArray':
                        if (Array.isArray(value)) {
                            processedValue = value.map((item) => {
                                if (typeof item === 'string') {
                                    return { uuid: item };
                                }
                                else {
                                    throw new Error('NodeArray items must be string UUIDs');
                                }
                            });
                        }
                        else {
                            throw new Error('NodeArray value must be an array');
                        }
                        break;
                    case 'colorArray':
                        if (Array.isArray(value)) {
                            processedValue = value.map((item) => {
                                if (typeof item === 'object' && item !== null && 'r' in item) {
                                    return {
                                        r: Math.min(255, Math.max(0, Number(item.r) || 0)),
                                        g: Math.min(255, Math.max(0, Number(item.g) || 0)),
                                        b: Math.min(255, Math.max(0, Number(item.b) || 0)),
                                        a: item.a !== undefined ? Math.min(255, Math.max(0, Number(item.a))) : 255
                                    };
                                }
                                else {
                                    return { r: 255, g: 255, b: 255, a: 255 };
                                }
                            });
                        }
                        else {
                            throw new Error('ColorArray value must be an array');
                        }
                        break;
                    case 'numberArray':
                        if (Array.isArray(value)) {
                            processedValue = value.map((item) => Number(item));
                        }
                        else {
                            throw new Error('NumberArray value must be an array');
                        }
                        break;
                    case 'stringArray':
                        if (Array.isArray(value)) {
                            processedValue = value.map((item) => String(item));
                        }
                        else {
                            throw new Error('StringArray value must be an array');
                        }
                        break;
                    default:
                        throw new Error(`Unsupported property type: ${propertyType}`);
                }
                (0, log_1.debugLog)(`[ComponentTools] Converting value: ${JSON.stringify(value)} -> ${JSON.stringify(processedValue)} (type: ${propertyType})`);
                (0, log_1.debugLog)(`[ComponentTools] Property analysis result: propertyInfo.type="${propertyInfo.type}", propertyType="${propertyType}"`);
                (0, log_1.debugLog)(`[ComponentTools] Will use color special handling: ${propertyType === 'color' && processedValue && typeof processedValue === 'object'}`);
                // 用于验证的实际期望值（对于组件引用需要特殊处理）
                let actualExpectedValue = processedValue;
                // Step 5: 获取原始节点数据来构建正确的路径
                const rawNodeData = await Editor.Message.request('scene', 'query-node', nodeUuid);
                if (!rawNodeData || !rawNodeData.__comps__) {
                    resolve({
                        success: false,
                        error: `Failed to get raw node data for property setting`
                    });
                    return;
                }
                // 找到原始组件的索引
                let rawComponentIndex = -1;
                for (let i = 0; i < rawNodeData.__comps__.length; i++) {
                    const comp = rawNodeData.__comps__[i];
                    const compType = comp.__type__ || comp.cid || comp.type || 'Unknown';
                    if (compType === componentType) {
                        rawComponentIndex = i;
                        break;
                    }
                }
                if (rawComponentIndex === -1) {
                    resolve({
                        success: false,
                        error: `Could not find component index for setting property`
                    });
                    return;
                }
                // 构建正确的属性路径
                let propertyPath = `__comps__.${rawComponentIndex}.${property}`;
                // 特殊处理资源类属性
                if (propertyType === 'asset' || propertyType === 'spriteFrame' || propertyType === 'prefab' ||
                    (propertyInfo.type === 'asset' && propertyType === 'string')) {
                    (0, log_1.debugLog)(`[ComponentTools] Setting asset reference:`, {
                        value: processedValue,
                        property: property,
                        propertyType: propertyType,
                        path: propertyPath
                    });
                    // Determine asset type based on property name
                    let assetType = 'cc.SpriteFrame'; // default
                    if (property.toLowerCase().includes('texture')) {
                        assetType = 'cc.Texture2D';
                    }
                    else if (property.toLowerCase().includes('material')) {
                        assetType = 'cc.Material';
                    }
                    else if (property.toLowerCase().includes('font')) {
                        assetType = 'cc.Font';
                    }
                    else if (property.toLowerCase().includes('clip')) {
                        assetType = 'cc.AudioClip';
                    }
                    else if (propertyType === 'prefab') {
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
                }
                else if (componentType === 'cc.UITransform' && (property === '_contentSize' || property === 'contentSize')) {
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
                }
                else if (componentType === 'cc.UITransform' && (property === '_anchorPoint' || property === 'anchorPoint')) {
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
                }
                else if (propertyType === 'color' && processedValue && typeof processedValue === 'object') {
                    // 特殊处理颜色属性，确保RGBA值正确
                    // Cocos Creator颜色值范围是0-255
                    const colorValue = {
                        r: Math.min(255, Math.max(0, Number(processedValue.r) || 0)),
                        g: Math.min(255, Math.max(0, Number(processedValue.g) || 0)),
                        b: Math.min(255, Math.max(0, Number(processedValue.b) || 0)),
                        a: processedValue.a !== undefined ? Math.min(255, Math.max(0, Number(processedValue.a))) : 255
                    };
                    (0, log_1.debugLog)(`[ComponentTools] Setting color value:`, colorValue);
                    await Editor.Message.request('scene', 'set-property', {
                        uuid: nodeUuid,
                        path: propertyPath,
                        dump: {
                            value: colorValue,
                            type: 'cc.Color'
                        }
                    });
                }
                else if (propertyType === 'vec3' && processedValue && typeof processedValue === 'object') {
                    // 特殊处理Vec3属性
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
                }
                else if (propertyType === 'vec2' && processedValue && typeof processedValue === 'object') {
                    // 特殊处理Vec2属性
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
                }
                else if (propertyType === 'size' && processedValue && typeof processedValue === 'object') {
                    // 特殊处理Size属性
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
                }
                else if (propertyType === 'node' && processedValue && typeof processedValue === 'object' && 'uuid' in processedValue) {
                    // 特殊处理节点引用
                    (0, log_1.debugLog)(`[ComponentTools] Setting node reference with UUID: ${processedValue.uuid}`);
                    await Editor.Message.request('scene', 'set-property', {
                        uuid: nodeUuid,
                        path: propertyPath,
                        dump: {
                            value: processedValue,
                            type: 'cc.Node'
                        }
                    });
                }
                else if (propertyType === 'component' && typeof processedValue === 'string') {
                    // 特殊处理组件引用：通过节点UUID找到组件的__id__
                    const targetNodeUuid = processedValue;
                    (0, log_1.debugLog)(`[ComponentTools] Setting component reference - finding component on node: ${targetNodeUuid}`);
                    // 从当前组件的属性元数据中获取期望的组件类型
                    let expectedComponentType = '';
                    // 获取当前组件的详细信息，包括属性元数据
                    const currentComponentInfo = await this.getComponentInfo(nodeUuid, componentType);
                    if (currentComponentInfo.success && ((_b = (_a = currentComponentInfo.data) === null || _a === void 0 ? void 0 : _a.properties) === null || _b === void 0 ? void 0 : _b[property])) {
                        const propertyMeta = currentComponentInfo.data.properties[property];
                        // 从属性元数据中提取组件类型信息
                        if (propertyMeta && typeof propertyMeta === 'object') {
                            // 检查是否有type字段指示组件类型
                            if (propertyMeta.type) {
                                expectedComponentType = propertyMeta.type;
                            }
                            else if (propertyMeta.ctor) {
                                // 有些属性可能使用ctor字段
                                expectedComponentType = propertyMeta.ctor;
                            }
                            else if (propertyMeta.extends && Array.isArray(propertyMeta.extends)) {
                                // 检查extends数组，通常第一个是最具体的类型
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
                    (0, log_1.debugLog)(`[ComponentTools] Detected required component type: ${expectedComponentType} for property: ${property}`);
                    try {
                        // 获取目标节点的组件信息
                        const targetNodeData = await Editor.Message.request('scene', 'query-node', targetNodeUuid);
                        if (!targetNodeData || !targetNodeData.__comps__) {
                            throw new Error(`Target node ${targetNodeUuid} not found or has no components`);
                        }
                        // 打印目标节点的组件概览
                        (0, log_1.debugLog)(`[ComponentTools] Target node ${targetNodeUuid} has ${targetNodeData.__comps__.length} components:`);
                        targetNodeData.__comps__.forEach((comp, index) => {
                            const sceneId = comp.value && comp.value.uuid && comp.value.uuid.value ? comp.value.uuid.value : 'unknown';
                            (0, log_1.debugLog)(`[ComponentTools] Component ${index}: ${comp.type} (scene_id: ${sceneId})`);
                        });
                        // 查找对应的组件
                        let targetComponent = null;
                        let componentId = null;
                        // 在目标节点的_components数组中查找指定类型的组件
                        // 注意：__comps__和_components的索引是对应的
                        (0, log_1.debugLog)(`[ComponentTools] Searching for component type: ${expectedComponentType}`);
                        for (let i = 0; i < targetNodeData.__comps__.length; i++) {
                            const comp = targetNodeData.__comps__[i];
                            (0, log_1.debugLog)(`[ComponentTools] Checking component ${i}: type=${comp.type}, target=${expectedComponentType}`);
                            if (comp.type === expectedComponentType) {
                                targetComponent = comp;
                                (0, log_1.debugLog)(`[ComponentTools] Found matching component at index ${i}: ${comp.type}`);
                                // 从组件的value.uuid.value中获取组件在场景中的ID
                                if (comp.value && comp.value.uuid && comp.value.uuid.value) {
                                    componentId = comp.value.uuid.value;
                                    (0, log_1.debugLog)(`[ComponentTools] Got componentId from comp.value.uuid.value: ${componentId}`);
                                }
                                else {
                                    (0, log_1.debugLog)(`[ComponentTools] Component structure:`, {
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
                            // 如果没找到，列出可用组件让用户了解，显示场景中的真实ID
                            const availableComponents = targetNodeData.__comps__.map((comp, index) => {
                                let sceneId = 'unknown';
                                // 从组件的value.uuid.value获取场景ID
                                if (comp.value && comp.value.uuid && comp.value.uuid.value) {
                                    sceneId = comp.value.uuid.value;
                                }
                                return `${comp.type}(scene_id:${sceneId})`;
                            });
                            throw new Error(`Component type '${expectedComponentType}' not found on node ${targetNodeUuid}. Available components: ${availableComponents.join(', ')}`);
                        }
                        (0, log_1.debugLog)(`[ComponentTools] Found component ${expectedComponentType} with scene ID: ${componentId} on node ${targetNodeUuid}`);
                        // 更新期望值为实际的组件ID对象格式，用于后续验证
                        if (componentId) {
                            actualExpectedValue = { uuid: componentId };
                        }
                        // 尝试使用与节点/资源引用相同的格式：{uuid: componentId}
                        // 测试看是否能正确设置组件引用
                        await Editor.Message.request('scene', 'set-property', {
                            uuid: nodeUuid,
                            path: propertyPath,
                            dump: {
                                value: { uuid: componentId }, // 使用对象格式，像节点/资源引用一样
                                type: expectedComponentType
                            }
                        });
                    }
                    catch (error) {
                        console.error(`[ComponentTools] Error setting component reference:`, error);
                        throw error;
                    }
                }
                else if (propertyType === 'nodeArray' && Array.isArray(processedValue)) {
                    // 特殊处理节点数组 - 保持预处理的格式
                    (0, log_1.debugLog)(`[ComponentTools] Setting node array:`, processedValue);
                    await Editor.Message.request('scene', 'set-property', {
                        uuid: nodeUuid,
                        path: propertyPath,
                        dump: {
                            value: processedValue // 保持 [{uuid: "..."}, {uuid: "..."}] 格式
                        }
                    });
                }
                else if (propertyType === 'colorArray' && Array.isArray(processedValue)) {
                    // 特殊处理颜色数组
                    const colorArrayValue = processedValue.map((item) => {
                        if (item && typeof item === 'object' && 'r' in item) {
                            return {
                                r: Math.min(255, Math.max(0, Number(item.r) || 0)),
                                g: Math.min(255, Math.max(0, Number(item.g) || 0)),
                                b: Math.min(255, Math.max(0, Number(item.b) || 0)),
                                a: item.a !== undefined ? Math.min(255, Math.max(0, Number(item.a))) : 255
                            };
                        }
                        else {
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
                }
                else {
                    // Normal property setting for non-asset properties
                    await Editor.Message.request('scene', 'set-property', {
                        uuid: nodeUuid,
                        path: propertyPath,
                        dump: { value: processedValue }
                    });
                }
                // Step 5: 等待Editor完成更新，然后验证设置结果
                await new Promise(resolve => setTimeout(resolve, 200)); // 等待200ms让Editor完成更新
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
            }
            catch (error) {
                console.error(`[ComponentTools] Error setting property:`, error);
                resolve({
                    success: false,
                    error: `Failed to set property: ${error.message}`
                });
            }
        });
    }
    async attachScript(nodeUuid, scriptPath) {
        return new Promise(async (resolve) => {
            var _a, _b;
            // 从脚本路径提取组件类名
            const scriptName = (_a = scriptPath.split('/').pop()) === null || _a === void 0 ? void 0 : _a.replace('.ts', '').replace('.js', '');
            if (!scriptName) {
                resolve({ success: false, error: 'Invalid script path' });
                return;
            }
            // 先查找节点上是否已存在该脚本组件
            const allComponentsInfo = await this.getComponents(nodeUuid);
            if (allComponentsInfo.success && ((_b = allComponentsInfo.data) === null || _b === void 0 ? void 0 : _b.components)) {
                const existingScript = allComponentsInfo.data.components.find((comp) => comp.type === scriptName);
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
            // 首先尝试直接使用脚本名称作为组件类型
            Editor.Message.request('scene', 'create-component', {
                uuid: nodeUuid,
                component: scriptName // 使用脚本名称而非UUID
            }).then(async (result) => {
                var _a;
                // 等待一段时间让Editor完成组件添加
                await new Promise(resolve => setTimeout(resolve, 100));
                // 重新查询节点信息验证脚本是否真的添加成功
                const allComponentsInfo2 = await this.getComponents(nodeUuid);
                if (allComponentsInfo2.success && ((_a = allComponentsInfo2.data) === null || _a === void 0 ? void 0 : _a.components)) {
                    const addedScript = allComponentsInfo2.data.components.find((comp) => comp.type === scriptName);
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
                    }
                    else {
                        resolve({
                            success: false,
                            error: `Script '${scriptName}' was not found on node after addition. Available components: ${allComponentsInfo2.data.components.map((c) => c.type).join(', ')}`
                        });
                    }
                }
                else {
                    resolve({
                        success: false,
                        error: `Failed to verify script addition: ${allComponentsInfo2.error || 'Unable to get node components'}`
                    });
                }
            }).catch((err) => {
                // 备用方案：使用场景脚本
                const options = {
                    name: 'cocos-mcp-server',
                    method: 'attachScript',
                    args: [nodeUuid, scriptPath]
                };
                Editor.Message.request('scene', 'execute-scene-script', options).then((result) => {
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
    async getAvailableComponents(category = 'all') {
        const componentCategories = {
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
        let components = [];
        if (category === 'all') {
            for (const cat in componentCategories) {
                components = components.concat(componentCategories[cat]);
            }
        }
        else if (componentCategories[category]) {
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
    isValidPropertyDescriptor(propData) {
        // 检查是否是有效的属性描述对象
        if (typeof propData !== 'object' || propData === null) {
            return false;
        }
        try {
            const keys = Object.keys(propData);
            // 避免遍历简单的数值对象（如 {width: 200, height: 150}）
            const isSimpleValueObject = keys.every(key => {
                const value = propData[key];
                return typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean';
            });
            if (isSimpleValueObject) {
                return false;
            }
            // 检查是否包含属性描述符的特征字段，不使用'in'操作符
            const hasName = keys.includes('name');
            const hasValue = keys.includes('value');
            const hasType = keys.includes('type');
            const hasDisplayName = keys.includes('displayName');
            const hasReadonly = keys.includes('readonly');
            // 必须包含name或value字段，且通常还有type字段
            const hasValidStructure = (hasName || hasValue) && (hasType || hasDisplayName || hasReadonly);
            // 额外检查：如果有default字段且结构复杂，避免深度遍历
            if (keys.includes('default') && propData.default && typeof propData.default === 'object') {
                const defaultKeys = Object.keys(propData.default);
                if (defaultKeys.includes('value') && typeof propData.default.value === 'object') {
                    // 这种情况下，我们只返回顶层属性，不深入遍历default.value
                    return hasValidStructure;
                }
            }
            return hasValidStructure;
        }
        catch (error) {
            console.warn(`[isValidPropertyDescriptor] Error checking property descriptor:`, error);
            return false;
        }
    }
    analyzeProperty(component, propertyName) {
        // 从复杂的组件结构中提取可用属性
        const availableProperties = [];
        let propertyValue = undefined;
        let propertyExists = false;
        // 尝试多种方式查找属性：
        // 1. 直接属性访问
        if (Object.prototype.hasOwnProperty.call(component, propertyName)) {
            propertyValue = component[propertyName];
            propertyExists = true;
        }
        // 2. 从嵌套结构中查找 (如从测试数据看到的复杂结构)
        if (!propertyExists && component.properties && typeof component.properties === 'object') {
            // 首先检查properties.value是否存在（这是我们在getComponents中看到的结构）
            if (component.properties.value && typeof component.properties.value === 'object') {
                const valueObj = component.properties.value;
                for (const [key, propData] of Object.entries(valueObj)) {
                    // 检查propData是否是一个有效的属性描述对象
                    // 确保propData是对象且包含预期的属性结构
                    if (this.isValidPropertyDescriptor(propData)) {
                        const propInfo = propData;
                        availableProperties.push(key);
                        if (key === propertyName) {
                            // 优先使用value属性，如果没有则使用propData本身
                            try {
                                const propKeys = Object.keys(propInfo);
                                propertyValue = propKeys.includes('value') ? propInfo.value : propInfo;
                            }
                            catch (error) {
                                // 如果检查失败，直接使用propInfo
                                propertyValue = propInfo;
                            }
                            propertyExists = true;
                        }
                    }
                }
            }
            else {
                // 备用方案：直接从properties查找
                for (const [key, propData] of Object.entries(component.properties)) {
                    if (this.isValidPropertyDescriptor(propData)) {
                        const propInfo = propData;
                        availableProperties.push(key);
                        if (key === propertyName) {
                            // 优先使用value属性，如果没有则使用propData本身
                            try {
                                const propKeys = Object.keys(propInfo);
                                propertyValue = propKeys.includes('value') ? propInfo.value : propInfo;
                            }
                            catch (error) {
                                // 如果检查失败，直接使用propInfo
                                propertyValue = propInfo;
                            }
                            propertyExists = true;
                        }
                    }
                }
            }
        }
        // 3. 从直接属性中提取简单属性名
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
        // 智能类型检测
        if (Array.isArray(propertyValue)) {
            // 数组类型检测
            if (propertyName.toLowerCase().includes('node')) {
                type = 'nodeArray';
            }
            else if (propertyName.toLowerCase().includes('color')) {
                type = 'colorArray';
            }
            else {
                type = 'array';
            }
        }
        else if (typeof propertyValue === 'string') {
            // Check if property name suggests it's an asset
            if (['spriteFrame', 'texture', 'material', 'font', 'clip', 'prefab'].includes(propertyName.toLowerCase())) {
                type = 'asset';
            }
            else {
                type = 'string';
            }
        }
        else if (typeof propertyValue === 'number') {
            type = 'number';
        }
        else if (typeof propertyValue === 'boolean') {
            type = 'boolean';
        }
        else if (propertyValue && typeof propertyValue === 'object') {
            try {
                const keys = Object.keys(propertyValue);
                if (keys.includes('r') && keys.includes('g') && keys.includes('b')) {
                    type = 'color';
                }
                else if (keys.includes('x') && keys.includes('y')) {
                    type = propertyValue.z !== undefined ? 'vec3' : 'vec2';
                }
                else if (keys.includes('width') && keys.includes('height')) {
                    type = 'size';
                }
                else if (keys.includes('uuid') || keys.includes('__uuid__')) {
                    // 检查是否是节点引用（通过属性名或__id__属性判断）
                    if (propertyName.toLowerCase().includes('node') ||
                        propertyName.toLowerCase().includes('target') ||
                        keys.includes('__id__')) {
                        type = 'node';
                    }
                    else {
                        type = 'asset';
                    }
                }
                else if (keys.includes('__id__')) {
                    // 节点引用特征
                    type = 'node';
                }
                else {
                    type = 'object';
                }
            }
            catch (error) {
                console.warn(`[analyzeProperty] Error checking property type for: ${JSON.stringify(propertyValue)}`);
                type = 'object';
            }
        }
        else if (propertyValue === null || propertyValue === undefined) {
            // For null/undefined values, check property name to determine type
            if (['spriteFrame', 'texture', 'material', 'font', 'clip', 'prefab'].includes(propertyName.toLowerCase())) {
                type = 'asset';
            }
            else if (propertyName.toLowerCase().includes('node') ||
                propertyName.toLowerCase().includes('target')) {
                type = 'node';
            }
            else if (propertyName.toLowerCase().includes('component')) {
                type = 'component';
            }
            else {
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
    smartConvertValue(inputValue, propertyInfo) {
        const { type, originalValue } = propertyInfo;
        (0, log_1.debugLog)(`[smartConvertValue] Converting ${JSON.stringify(inputValue)} to type: ${type}`);
        switch (type) {
            case 'string':
                return String(inputValue);
            case 'number':
                return Number(inputValue);
            case 'boolean':
                if (typeof inputValue === 'boolean')
                    return inputValue;
                if (typeof inputValue === 'string') {
                    return inputValue.toLowerCase() === 'true' || inputValue === '1';
                }
                return Boolean(inputValue);
            case 'color':
                // 优化的颜色处理，支持多种输入格式
                if (typeof inputValue === 'string') {
                    // 字符串格式：十六进制、颜色名称、rgb()/rgba()
                    return this.parseColorString(inputValue);
                }
                else if (typeof inputValue === 'object' && inputValue !== null) {
                    try {
                        const inputKeys = Object.keys(inputValue);
                        // 如果输入是颜色对象，验证并转换
                        if (inputKeys.includes('r') || inputKeys.includes('g') || inputKeys.includes('b')) {
                            return {
                                r: Math.min(255, Math.max(0, Number(inputValue.r) || 0)),
                                g: Math.min(255, Math.max(0, Number(inputValue.g) || 0)),
                                b: Math.min(255, Math.max(0, Number(inputValue.b) || 0)),
                                a: inputValue.a !== undefined ? Math.min(255, Math.max(0, Number(inputValue.a))) : 255
                            };
                        }
                    }
                    catch (error) {
                        console.warn(`[smartConvertValue] Invalid color object: ${JSON.stringify(inputValue)}`);
                    }
                }
                // 如果有原值，保持原值结构并更新提供的值
                if (originalValue && typeof originalValue === 'object') {
                    try {
                        const inputKeys = typeof inputValue === 'object' && inputValue ? Object.keys(inputValue) : [];
                        return {
                            r: inputKeys.includes('r') ? Math.min(255, Math.max(0, Number(inputValue.r))) : (originalValue.r || 255),
                            g: inputKeys.includes('g') ? Math.min(255, Math.max(0, Number(inputValue.g))) : (originalValue.g || 255),
                            b: inputKeys.includes('b') ? Math.min(255, Math.max(0, Number(inputValue.b))) : (originalValue.b || 255),
                            a: inputKeys.includes('a') ? Math.min(255, Math.max(0, Number(inputValue.a))) : (originalValue.a || 255)
                        };
                    }
                    catch (error) {
                        console.warn(`[smartConvertValue] Error processing color with original value: ${error}`);
                    }
                }
                // 默认返回白色
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
                    // 节点引用需要特殊处理
                    return inputValue;
                }
                else if (typeof inputValue === 'object' && inputValue !== null) {
                    // 如果已经是对象形式，返回UUID或完整对象
                    return inputValue.uuid || inputValue;
                }
                return originalValue;
            case 'asset':
                if (typeof inputValue === 'string') {
                    // 如果输入是字符串路径，转换为asset对象
                    return { uuid: inputValue };
                }
                else if (typeof inputValue === 'object' && inputValue !== null) {
                    return inputValue;
                }
                return originalValue;
            default:
                // 对于未知类型，尽量保持原有结构
                if (typeof inputValue === typeof originalValue) {
                    return inputValue;
                }
                return originalValue;
        }
    }
    parseColorString(colorStr) {
        const str = colorStr.trim();
        // 只支持十六进制格式 #RRGGBB 或 #RRGGBBAA
        if (str.startsWith('#')) {
            if (str.length === 7) { // #RRGGBB
                const r = parseInt(str.substring(1, 3), 16);
                const g = parseInt(str.substring(3, 5), 16);
                const b = parseInt(str.substring(5, 7), 16);
                return { r, g, b, a: 255 };
            }
            else if (str.length === 9) { // #RRGGBBAA
                const r = parseInt(str.substring(1, 3), 16);
                const g = parseInt(str.substring(3, 5), 16);
                const b = parseInt(str.substring(5, 7), 16);
                const a = parseInt(str.substring(7, 9), 16);
                return { r, g, b, a };
            }
        }
        // 如果不是有效的十六进制格式，返回错误提示
        throw new Error(`Invalid color format: "${colorStr}". Only hexadecimal format is supported (e.g., "#FF0000" or "#FF0000FF")`);
    }
    async verifyPropertyChange(nodeUuid, componentType, property, originalValue, expectedValue) {
        var _a, _b;
        (0, log_1.debugLog)(`[verifyPropertyChange] Starting verification for ${componentType}.${property}`);
        (0, log_1.debugLog)(`[verifyPropertyChange] Expected value:`, JSON.stringify(expectedValue));
        (0, log_1.debugLog)(`[verifyPropertyChange] Original value:`, JSON.stringify(originalValue));
        try {
            // 重新获取组件信息进行验证
            (0, log_1.debugLog)(`[verifyPropertyChange] Calling getComponentInfo...`);
            const componentInfo = await this.getComponentInfo(nodeUuid, componentType);
            (0, log_1.debugLog)(`[verifyPropertyChange] getComponentInfo success:`, componentInfo.success);
            const allComponents = await this.getComponents(nodeUuid);
            (0, log_1.debugLog)(`[verifyPropertyChange] getComponents success:`, allComponents.success);
            if (componentInfo.success && componentInfo.data) {
                (0, log_1.debugLog)(`[verifyPropertyChange] Component data available, extracting property '${property}'`);
                const allPropertyNames = Object.keys(componentInfo.data.properties || {});
                (0, log_1.debugLog)(`[verifyPropertyChange] Available properties:`, allPropertyNames);
                const propertyData = (_a = componentInfo.data.properties) === null || _a === void 0 ? void 0 : _a[property];
                (0, log_1.debugLog)(`[verifyPropertyChange] Raw property data for '${property}':`, JSON.stringify(propertyData));
                // 从属性数据中提取实际值
                let actualValue = propertyData;
                (0, log_1.debugLog)(`[verifyPropertyChange] Initial actualValue:`, JSON.stringify(actualValue));
                if (propertyData && typeof propertyData === 'object' && 'value' in propertyData) {
                    actualValue = propertyData.value;
                    (0, log_1.debugLog)(`[verifyPropertyChange] Extracted actualValue from .value:`, JSON.stringify(actualValue));
                }
                else {
                    (0, log_1.debugLog)(`[verifyPropertyChange] No .value property found, using raw data`);
                }
                // 修复验证逻辑：检查实际值是否匹配期望值
                let verified = false;
                if (typeof expectedValue === 'object' && expectedValue !== null && 'uuid' in expectedValue) {
                    // 对于引用类型（节点/组件/资源），比较UUID
                    const actualUuid = actualValue && typeof actualValue === 'object' && 'uuid' in actualValue ? actualValue.uuid : '';
                    const expectedUuid = expectedValue.uuid || '';
                    verified = actualUuid === expectedUuid && expectedUuid !== '';
                    (0, log_1.debugLog)(`[verifyPropertyChange] Reference comparison:`);
                    (0, log_1.debugLog)(`  - Expected UUID: "${expectedUuid}"`);
                    (0, log_1.debugLog)(`  - Actual UUID: "${actualUuid}"`);
                    (0, log_1.debugLog)(`  - UUID match: ${actualUuid === expectedUuid}`);
                    (0, log_1.debugLog)(`  - UUID not empty: ${expectedUuid !== ''}`);
                    (0, log_1.debugLog)(`  - Final verified: ${verified}`);
                }
                else {
                    // 对于其他类型，直接比较值
                    (0, log_1.debugLog)(`[verifyPropertyChange] Value comparison:`);
                    (0, log_1.debugLog)(`  - Expected type: ${typeof expectedValue}`);
                    (0, log_1.debugLog)(`  - Actual type: ${typeof actualValue}`);
                    if (typeof actualValue === typeof expectedValue) {
                        if (typeof actualValue === 'object' && actualValue !== null && expectedValue !== null) {
                            // 对象类型的深度比较
                            verified = JSON.stringify(actualValue) === JSON.stringify(expectedValue);
                            (0, log_1.debugLog)(`  - Object comparison (JSON): ${verified}`);
                        }
                        else {
                            // 基本类型的直接比较
                            verified = actualValue === expectedValue;
                            (0, log_1.debugLog)(`  - Direct comparison: ${verified}`);
                        }
                    }
                    else {
                        // 类型不匹配时的特殊处理（如数字和字符串）
                        const stringMatch = String(actualValue) === String(expectedValue);
                        const numberMatch = Number(actualValue) === Number(expectedValue);
                        verified = stringMatch || numberMatch;
                        (0, log_1.debugLog)(`  - String match: ${stringMatch}`);
                        (0, log_1.debugLog)(`  - Number match: ${numberMatch}`);
                        (0, log_1.debugLog)(`  - Type mismatch verified: ${verified}`);
                    }
                }
                (0, log_1.debugLog)(`[verifyPropertyChange] Final verification result: ${verified}`);
                (0, log_1.debugLog)(`[verifyPropertyChange] Final actualValue:`, JSON.stringify(actualValue));
                const result = {
                    verified,
                    actualValue,
                    fullData: {
                        // 只返回修改的属性信息，不返回完整组件数据
                        modifiedProperty: {
                            name: property,
                            before: originalValue,
                            expected: expectedValue,
                            actual: actualValue,
                            verified,
                            propertyMetadata: propertyData // 只包含这个属性的元数据
                        },
                        // 简化的组件信息
                        componentSummary: {
                            nodeUuid,
                            componentType,
                            totalProperties: Object.keys(((_b = componentInfo.data) === null || _b === void 0 ? void 0 : _b.properties) || {}).length
                        }
                    }
                };
                (0, log_1.debugLog)(`[verifyPropertyChange] Returning result:`, JSON.stringify(result, null, 2));
                return result;
            }
            else {
                (0, log_1.debugLog)(`[verifyPropertyChange] ComponentInfo failed or no data:`, componentInfo);
            }
        }
        catch (error) {
            console.error('[verifyPropertyChange] Verification failed with error:', error);
            console.error('[verifyPropertyChange] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
        }
        (0, log_1.debugLog)(`[verifyPropertyChange] Returning fallback result`);
        return {
            verified: false,
            actualValue: undefined,
            fullData: null
        };
    }
    /**
     * 检测是否为节点属性，如果是则重定向到对应的节点方法
     */
    async checkAndRedirectNodeProperties(args) {
        const { nodeUuid, componentType, property, propertyType, value } = args;
        // 检测是否为节点基础属性（应该使用 set_node_property）
        const nodeBasicProperties = [
            'name', 'active', 'layer', 'mobility', 'parent', 'children', 'hideFlags'
        ];
        // 检测是否为节点变换属性（应该使用 set_node_transform）
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
            }
            else if (nodeTransformProperties.includes(property)) {
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
        return null; // 不是节点属性，继续正常处理
    }
    /**
     * 生成组件建议信息
     */
    generateComponentSuggestion(requestedType, availableTypes, property) {
        // 检查是否存在相似的组件类型
        const similarTypes = availableTypes.filter(type => type.toLowerCase().includes(requestedType.toLowerCase()) ||
            requestedType.toLowerCase().includes(type.toLowerCase()));
        let instruction = '';
        if (similarTypes.length > 0) {
            instruction += `\n\n🔍 Found similar components: ${similarTypes.join(', ')}`;
            instruction += `\n💡 Suggestion: Perhaps you meant to set the '${similarTypes[0]}' component?`;
        }
        // Recommend possible components based on property name
        const propertyToComponentMap = {
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
     * 快速验证资源设置结果
     */
    async quickVerifyAsset(nodeUuid, componentType, property) {
        try {
            const rawNodeData = await Editor.Message.request('scene', 'query-node', nodeUuid);
            if (!rawNodeData || !rawNodeData.__comps__) {
                return null;
            }
            // 找到组件
            const component = rawNodeData.__comps__.find((comp) => {
                const compType = comp.__type__ || comp.cid || comp.type;
                return compType === componentType;
            });
            if (!component) {
                return null;
            }
            // 提取属性值
            const properties = this.extractComponentProperties(component);
            const propertyData = properties[property];
            if (propertyData && typeof propertyData === 'object' && 'value' in propertyData) {
                return propertyData.value;
            }
            else {
                return propertyData;
            }
        }
        catch (error) {
            console.error(`[quickVerifyAsset] Error:`, error);
            return null;
        }
    }
}
exports.ComponentTools = ComponentTools;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tcG9uZW50LXRvb2xzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL3Rvb2xzL2NvbXBvbmVudC10b29scy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSxvQ0FBc0M7QUFDdEMsMENBQStEO0FBQy9ELHNEQUFtRTtBQUVuRTs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FpQkc7QUFDSCxLQUFLLFVBQVUsZ0JBQWdCLENBQUMsUUFBZ0IsRUFBRSxhQUFxQjs7SUFDbkUsSUFBSSxDQUFDO1FBQ0QsTUFBTSxRQUFRLEdBQVEsTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsWUFBWSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQ3BGLE1BQU0sS0FBSyxHQUFVLE1BQUEsUUFBUSxhQUFSLFFBQVEsdUJBQVIsUUFBUSxDQUFFLFNBQVMsbUNBQUksRUFBRSxDQUFDO1FBQy9DLE1BQU0sR0FBRyxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUEsQ0FBQyxhQUFELENBQUMsdUJBQUQsQ0FBQyxDQUFFLFFBQVEsTUFBSSxDQUFDLGFBQUQsQ0FBQyx1QkFBRCxDQUFDLENBQUUsR0FBRyxDQUFBLEtBQUksQ0FBQyxhQUFELENBQUMsdUJBQUQsQ0FBQyxDQUFFLElBQUksQ0FBQSxDQUFDLEtBQUssYUFBYSxDQUFDLENBQUM7UUFDdkYsSUFBSSxHQUFHLEtBQUssQ0FBQyxDQUFDO1lBQUUsT0FBTztRQUN2QixNQUFNLFlBQVksR0FBWSxDQUFBLE1BQUEsTUFBQSxNQUFBLEtBQUssQ0FBQyxHQUFHLENBQUMsMENBQUUsS0FBSywwQ0FBRSxPQUFPLDBDQUFFLEtBQUssTUFBSyxLQUFLLENBQUM7UUFDMUUsTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsY0FBYyxFQUFFO1lBQ2xELElBQUksRUFBRSxRQUFRO1lBQ2QsSUFBSSxFQUFF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Q3hELE9BQU8sUUFBUSxLQUFLLGFBQWEsQ0FBQztZQUN0QyxDQUFDLENBQUMsQ0FBQztZQUVILElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztnQkFDYixPQUFPLElBQUksQ0FBQztZQUNoQixDQUFDO1lBRUQsUUFBUTtZQUNSLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUM5RCxNQUFNLFlBQVksR0FBRyxVQUFVLENBQUMsUUFBUSxDQUFDLENBQUM7WUFFMUMsSUFBSSxZQUFZLElBQUksT0FBTyxZQUFZLEtBQUssUUFBUSxJQUFJLE9BQU8sSUFBSSxZQUFZLEVBQUUsQ0FBQztnQkFDOUUsT0FBTyxZQUFZLENBQUMsS0FBSyxDQUFDO1lBQzlCLENBQUM7aUJBQU0sQ0FBQztnQkFDSixPQUFPLFlBQVksQ0FBQztZQUN4QixDQUFDO1FBQ0wsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDYixPQUFPLENBQUMsS0FBSyxDQUFDLDJCQUEyQixFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ2xELE9BQU8sSUFBSSxDQUFDO1FBQ2hCLENBQUM7SUFDTCxDQUFDO0NBQ0o7QUF6bURELHdDQXltREMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBUb29sRGVmaW5pdGlvbiwgVG9vbFJlc3BvbnNlLCBUb29sRXhlY3V0b3IsIENvbXBvbmVudEluZm8gfSBmcm9tICcuLi90eXBlcyc7XG5pbXBvcnQgeyBkZWJ1Z0xvZyB9IGZyb20gJy4uL2xpYi9sb2cnO1xuaW1wb3J0IHsgeiwgdG9JbnB1dFNjaGVtYSwgdmFsaWRhdGVBcmdzIH0gZnJvbSAnLi4vbGliL3NjaGVtYSc7XG5pbXBvcnQgeyBydW5TY2VuZU1ldGhvZEFzVG9vbFJlc3BvbnNlIH0gZnJvbSAnLi4vbGliL3NjZW5lLWJyaWRnZSc7XG5cbi8qKlxuICogRm9yY2UgdGhlIGVkaXRvcidzIHNlcmlhbGl6YXRpb24gbW9kZWwgdG8gcmUtcHVsbCBhIGNvbXBvbmVudCBkdW1wXG4gKiBmcm9tIHJ1bnRpbWUuIENMQVVERS5tZCBMYW5kbWluZSAjMTE6IHNjZW5lLXNjcmlwdCBgYXJyLnB1c2hgIG11dGF0aW9uc1xuICogb25seSB0b3VjaCB0aGUgcnVudGltZTsgdGhlIG1vZGVsIHRoYXQgYHNhdmUtc2NlbmVgIHdyaXRlcyB0byBkaXNrIGlzXG4gKiBvbmx5IHVwZGF0ZWQgd2hlbiBjaGFuZ2VzIGZsb3cgdGhyb3VnaCB0aGUgZWRpdG9yJ3Mgc2V0LXByb3BlcnR5XG4gKiBjaGFubmVsLlxuICpcbiAqIENhbGxpbmcgYHNldC1wcm9wZXJ0eWAgZnJvbSBpbnNpZGUgc2NlbmUtc2NyaXB0IGRvZXNuJ3QgcHJvcGFnYXRlICh0aGVcbiAqIHNjZW5lLXByb2Nlc3MgSVBDIHNob3J0LWNpcmN1aXRzKS4gVGhlIG51ZGdlIG11c3QgY29tZSBmcm9tIGhvc3Qgc2lkZS5cbiAqXG4gKiBUaGUgc2V0LXByb3BlcnR5IGNoYW5uZWwgZm9yIGNvbXBvbmVudCBwcm9wZXJ0aWVzIHVzZXMgYSBub2RlLXJvb3RlZFxuICogcGF0aDogYHV1aWQgPSBub2RlVXVpZGAsIGBwYXRoID0gX19jb21wc19fLjxpbmRleD4uPHByb3BlcnR5PmAuIFdlXG4gKiBxdWVyeSB0aGUgbm9kZSwgbG9jYXRlIHRoZSBtYXRjaGluZyBjb21wb25lbnQgaW5kZXgsIGFuZCBzZXRcbiAqIGBlbmFibGVkYCB0byBpdHMgY3VycmVudCB2YWx1ZSAobm8tb3Agc2VtYW50aWNhbGx5LCBmb3JjZXMgc3luYykuXG4gKlxuICogQmVzdC1lZmZvcnQ6IGZhaWx1cmVzIGFyZSBzd2FsbG93ZWQgYmVjYXVzZSB0aGUgcnVudGltZSBtdXRhdGlvblxuICogYWxyZWFkeSBoYXBwZW5lZCDigJQgb25seSBwZXJzaXN0ZW5jZSB0byBkaXNrIGlzIGF0IHN0YWtlLlxuICovXG5hc3luYyBmdW5jdGlvbiBudWRnZUVkaXRvck1vZGVsKG5vZGVVdWlkOiBzdHJpbmcsIGNvbXBvbmVudFR5cGU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IG5vZGVEYXRhOiBhbnkgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1ub2RlJywgbm9kZVV1aWQpO1xuICAgICAgICBjb25zdCBjb21wczogYW55W10gPSBub2RlRGF0YT8uX19jb21wc19fID8/IFtdO1xuICAgICAgICBjb25zdCBpZHggPSBjb21wcy5maW5kSW5kZXgoYyA9PiAoYz8uX190eXBlX18gfHwgYz8uY2lkIHx8IGM/LnR5cGUpID09PSBjb21wb25lbnRUeXBlKTtcbiAgICAgICAgaWYgKGlkeCA9PT0gLTEpIHJldHVybjtcbiAgICAgICAgY29uc3QgZW5hYmxlZFZhbHVlOiBib29sZWFuID0gY29tcHNbaWR4XT8udmFsdWU/LmVuYWJsZWQ/LnZhbHVlICE9PSBmYWxzZTtcbiAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnc2V0LXByb3BlcnR5Jywge1xuICAgICAgICAgICAgdXVpZDogbm9kZVV1aWQsXG4gICAgICAgICAgICBwYXRoOiBgX19jb21wc19fLiR7aWR4fS5lbmFibGVkYCxcbiAgICAgICAgICAgIGR1bXA6IHsgdmFsdWU6IGVuYWJsZWRWYWx1ZSB9LFxuICAgICAgICB9KTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgZGVidWdMb2coJ1tDb21wb25lbnRUb29sc10gbnVkZ2Ugc2V0LXByb3BlcnR5IGZhaWxlZCAobm9uLWZhdGFsKTonLCBlcnIpO1xuICAgIH1cbn1cblxuY29uc3Qgc2V0Q29tcG9uZW50UHJvcGVydHlWYWx1ZURlc2NyaXB0aW9uID1cbiAgICAnUHJvcGVydHkgdmFsdWUgLSBVc2UgdGhlIGNvcnJlc3BvbmRpbmcgZGF0YSBmb3JtYXQgYmFzZWQgb24gcHJvcGVydHlUeXBlOlxcblxcbicgK1xuICAgICfwn5OdIEJhc2ljIERhdGEgVHlwZXM6XFxuJyArXG4gICAgJ+KAoiBzdHJpbmc6IFwiSGVsbG8gV29ybGRcIiAodGV4dCBzdHJpbmcpXFxuJyArXG4gICAgJ+KAoiBudW1iZXIvaW50ZWdlci9mbG9hdDogNDIgb3IgMy4xNCAobnVtZXJpYyB2YWx1ZSlcXG4nICtcbiAgICAn4oCiIGJvb2xlYW46IHRydWUgb3IgZmFsc2UgKGJvb2xlYW4gdmFsdWUpXFxuXFxuJyArXG4gICAgJ/CfjqggQ29sb3IgVHlwZTpcXG4nICtcbiAgICAn4oCiIGNvbG9yOiB7XCJyXCI6MjU1LFwiZ1wiOjAsXCJiXCI6MCxcImFcIjoyNTV9IChSR0JBIHZhbHVlcywgcmFuZ2UgMC0yNTUpXFxuJyArXG4gICAgJyAgLSBBbHRlcm5hdGl2ZTogXCIjRkYwMDAwXCIgKGhleGFkZWNpbWFsIGZvcm1hdClcXG4nICtcbiAgICAnICAtIFRyYW5zcGFyZW5jeTogYSB2YWx1ZSBjb250cm9scyBvcGFjaXR5LCAyNTUgPSBmdWxseSBvcGFxdWUsIDAgPSBmdWxseSB0cmFuc3BhcmVudFxcblxcbicgK1xuICAgICfwn5OQIFZlY3RvciBhbmQgU2l6ZSBUeXBlczpcXG4nICtcbiAgICAn4oCiIHZlYzI6IHtcInhcIjoxMDAsXCJ5XCI6NTB9ICgyRCB2ZWN0b3IpXFxuJyArXG4gICAgJ+KAoiB2ZWMzOiB7XCJ4XCI6MSxcInlcIjoyLFwielwiOjN9ICgzRCB2ZWN0b3IpXFxuJyArXG4gICAgJ+KAoiBzaXplOiB7XCJ3aWR0aFwiOjEwMCxcImhlaWdodFwiOjUwfSAoc2l6ZSBkaW1lbnNpb25zKVxcblxcbicgK1xuICAgICfwn5SXIFJlZmVyZW5jZSBUeXBlcyAodXNpbmcgVVVJRCBzdHJpbmdzKTpcXG4nICtcbiAgICAn4oCiIG5vZGU6IFwidGFyZ2V0LW5vZGUtdXVpZFwiIChub2RlIHJlZmVyZW5jZSlcXG4nICtcbiAgICAnICBIb3cgdG8gZ2V0OiBVc2UgZ2V0X2FsbF9ub2RlcyBvciBmaW5kX25vZGVfYnlfbmFtZSB0byBnZXQgbm9kZSBVVUlEc1xcbicgK1xuICAgICfigKIgY29tcG9uZW50OiBcInRhcmdldC1ub2RlLXV1aWRcIiAoY29tcG9uZW50IHJlZmVyZW5jZSlcXG4nICtcbiAgICAnICBIb3cgaXQgd29ya3M6IFxcbicgK1xuICAgICcgICAgMS4gUHJvdmlkZSB0aGUgVVVJRCBvZiB0aGUgTk9ERSB0aGF0IGNvbnRhaW5zIHRoZSB0YXJnZXQgY29tcG9uZW50XFxuJyArXG4gICAgJyAgICAyLiBTeXN0ZW0gYXV0by1kZXRlY3RzIHJlcXVpcmVkIGNvbXBvbmVudCB0eXBlIGZyb20gcHJvcGVydHkgbWV0YWRhdGFcXG4nICtcbiAgICAnICAgIDMuIEZpbmRzIHRoZSBjb21wb25lbnQgb24gdGFyZ2V0IG5vZGUgYW5kIGdldHMgaXRzIHNjZW5lIF9faWRfX1xcbicgK1xuICAgICcgICAgNC4gU2V0cyByZWZlcmVuY2UgdXNpbmcgdGhlIHNjZW5lIF9faWRfXyAobm90IG5vZGUgVVVJRClcXG4nICtcbiAgICAnICBFeGFtcGxlOiB2YWx1ZT1cImxhYmVsLW5vZGUtdXVpZFwiIHdpbGwgZmluZCBjYy5MYWJlbCBhbmQgdXNlIGl0cyBzY2VuZSBJRFxcbicgK1xuICAgICfigKIgc3ByaXRlRnJhbWU6IFwic3ByaXRlZnJhbWUtdXVpZFwiIChzcHJpdGUgZnJhbWUgYXNzZXQpXFxuJyArXG4gICAgJyAgSG93IHRvIGdldDogQ2hlY2sgYXNzZXQgZGF0YWJhc2Ugb3IgdXNlIGFzc2V0IGJyb3dzZXJcXG4nICtcbiAgICAn4oCiIHByZWZhYjogXCJwcmVmYWItdXVpZFwiIChwcmVmYWIgYXNzZXQpXFxuJyArXG4gICAgJyAgSG93IHRvIGdldDogQ2hlY2sgYXNzZXQgZGF0YWJhc2Ugb3IgdXNlIGFzc2V0IGJyb3dzZXJcXG4nICtcbiAgICAn4oCiIGFzc2V0OiBcImFzc2V0LXV1aWRcIiAoZ2VuZXJpYyBhc3NldCByZWZlcmVuY2UpXFxuJyArXG4gICAgJyAgSG93IHRvIGdldDogQ2hlY2sgYXNzZXQgZGF0YWJhc2Ugb3IgdXNlIGFzc2V0IGJyb3dzZXJcXG5cXG4nICtcbiAgICAn8J+TiyBBcnJheSBUeXBlczpcXG4nICtcbiAgICAn4oCiIG5vZGVBcnJheTogW1widXVpZDFcIixcInV1aWQyXCJdIChhcnJheSBvZiBub2RlIFVVSURzKVxcbicgK1xuICAgICfigKIgY29sb3JBcnJheTogW3tcInJcIjoyNTUsXCJnXCI6MCxcImJcIjowLFwiYVwiOjI1NX1dIChhcnJheSBvZiBjb2xvcnMpXFxuJyArXG4gICAgJ+KAoiBudW1iZXJBcnJheTogWzEsMiwzLDQsNV0gKGFycmF5IG9mIG51bWJlcnMpXFxuJyArXG4gICAgJ+KAoiBzdHJpbmdBcnJheTogW1wiaXRlbTFcIixcIml0ZW0yXCJdIChhcnJheSBvZiBzdHJpbmdzKSc7XG5cbmNvbnN0IHNldENvbXBvbmVudFByb3BlcnR5UHJvcGVydHlEZXNjcmlwdGlvbiA9XG4gICAgJ1Byb3BlcnR5IG5hbWUgLSBUaGUgcHJvcGVydHkgdG8gc2V0LiBDb21tb24gcHJvcGVydGllcyBpbmNsdWRlOlxcbicgK1xuICAgICfigKIgY2MuTGFiZWw6IHN0cmluZyAodGV4dCBjb250ZW50KSwgZm9udFNpemUgKGZvbnQgc2l6ZSksIGNvbG9yICh0ZXh0IGNvbG9yKVxcbicgK1xuICAgICfigKIgY2MuU3ByaXRlOiBzcHJpdGVGcmFtZSAoc3ByaXRlIGZyYW1lKSwgY29sb3IgKHRpbnQgY29sb3IpLCBzaXplTW9kZSAoc2l6ZSBtb2RlKVxcbicgK1xuICAgICfigKIgY2MuQnV0dG9uOiBub3JtYWxDb2xvciAobm9ybWFsIGNvbG9yKSwgcHJlc3NlZENvbG9yIChwcmVzc2VkIGNvbG9yKSwgdGFyZ2V0ICh0YXJnZXQgbm9kZSlcXG4nICtcbiAgICAn4oCiIGNjLlVJVHJhbnNmb3JtOiBjb250ZW50U2l6ZSAoY29udGVudCBzaXplKSwgYW5jaG9yUG9pbnQgKGFuY2hvciBwb2ludClcXG4nICtcbiAgICAn4oCiIEN1c3RvbSBTY3JpcHRzOiBCYXNlZCBvbiBwcm9wZXJ0aWVzIGRlZmluZWQgaW4gdGhlIHNjcmlwdCc7XG5cbmNvbnN0IGNvbXBvbmVudFNjaGVtYXMgPSB7XG4gICAgYWRkX2NvbXBvbmVudDogei5vYmplY3Qoe1xuICAgICAgICBub2RlVXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnVGFyZ2V0IG5vZGUgVVVJRC4gUkVRVUlSRUQ6IFlvdSBtdXN0IHNwZWNpZnkgdGhlIGV4YWN0IG5vZGUgdG8gYWRkIHRoZSBjb21wb25lbnQgdG8uIFVzZSBnZXRfYWxsX25vZGVzIG9yIGZpbmRfbm9kZV9ieV9uYW1lIHRvIGdldCB0aGUgVVVJRCBvZiB0aGUgZGVzaXJlZCBub2RlLicpLFxuICAgICAgICBjb21wb25lbnRUeXBlOiB6LnN0cmluZygpLmRlc2NyaWJlKCdDb21wb25lbnQgdHlwZSAoZS5nLiwgY2MuU3ByaXRlLCBjYy5MYWJlbCwgY2MuQnV0dG9uKScpLFxuICAgIH0pLFxuICAgIHJlbW92ZV9jb21wb25lbnQ6IHoub2JqZWN0KHtcbiAgICAgICAgbm9kZVV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ05vZGUgVVVJRCcpLFxuICAgICAgICBjb21wb25lbnRUeXBlOiB6LnN0cmluZygpLmRlc2NyaWJlKCdDb21wb25lbnQgY2lkICh0eXBlIGZpZWxkIGZyb20gZ2V0Q29tcG9uZW50cykuIERvIE5PVCB1c2Ugc2NyaXB0IG5hbWUgb3IgY2xhc3MgbmFtZS4gRXhhbXBsZTogXCJjYy5TcHJpdGVcIiBvciBcIjliNGE3dWVUOXhENmFSRStBbE91c3kxXCInKSxcbiAgICB9KSxcbiAgICBnZXRfY29tcG9uZW50czogei5vYmplY3Qoe1xuICAgICAgICBub2RlVXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnTm9kZSBVVUlEJyksXG4gICAgfSksXG4gICAgZ2V0X2NvbXBvbmVudF9pbmZvOiB6Lm9iamVjdCh7XG4gICAgICAgIG5vZGVVdWlkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdOb2RlIFVVSUQnKSxcbiAgICAgICAgY29tcG9uZW50VHlwZTogei5zdHJpbmcoKS5kZXNjcmliZSgnQ29tcG9uZW50IHR5cGUgdG8gZ2V0IGluZm8gZm9yJyksXG4gICAgfSksXG4gICAgc2V0X2NvbXBvbmVudF9wcm9wZXJ0eTogei5vYmplY3Qoe1xuICAgICAgICBub2RlVXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnVGFyZ2V0IG5vZGUgVVVJRCAtIE11c3Qgc3BlY2lmeSB0aGUgbm9kZSB0byBvcGVyYXRlIG9uJyksXG4gICAgICAgIC8vIE5vIGVudW0gb24gY29tcG9uZW50VHlwZSDigJQgY3VzdG9tIHNjcmlwdHMgbXVzdCBiZSBhbGxvd2VkLlxuICAgICAgICBjb21wb25lbnRUeXBlOiB6LnN0cmluZygpLmRlc2NyaWJlKCdDb21wb25lbnQgdHlwZSAtIENhbiBiZSBidWlsdC1pbiBjb21wb25lbnRzIChlLmcuLCBjYy5MYWJlbCkgb3IgY3VzdG9tIHNjcmlwdCBjb21wb25lbnRzIChlLmcuLCBNeVNjcmlwdCkuIElmIHVuc3VyZSBhYm91dCBjb21wb25lbnQgdHlwZSwgdXNlIGdldF9jb21wb25lbnRzIGZpcnN0IHRvIHJldHJpZXZlIGFsbCBjb21wb25lbnRzIG9uIHRoZSBub2RlLicpLFxuICAgICAgICBwcm9wZXJ0eTogei5zdHJpbmcoKS5kZXNjcmliZShzZXRDb21wb25lbnRQcm9wZXJ0eVByb3BlcnR5RGVzY3JpcHRpb24pLFxuICAgICAgICBwcm9wZXJ0eVR5cGU6IHouZW51bShbXG4gICAgICAgICAgICAnc3RyaW5nJywgJ251bWJlcicsICdib29sZWFuJywgJ2ludGVnZXInLCAnZmxvYXQnLFxuICAgICAgICAgICAgJ2NvbG9yJywgJ3ZlYzInLCAndmVjMycsICdzaXplJyxcbiAgICAgICAgICAgICdub2RlJywgJ2NvbXBvbmVudCcsICdzcHJpdGVGcmFtZScsICdwcmVmYWInLCAnYXNzZXQnLFxuICAgICAgICAgICAgJ25vZGVBcnJheScsICdjb2xvckFycmF5JywgJ251bWJlckFycmF5JywgJ3N0cmluZ0FycmF5JyxcbiAgICAgICAgXSkuZGVzY3JpYmUoJ1Byb3BlcnR5IHR5cGUgLSBNdXN0IGV4cGxpY2l0bHkgc3BlY2lmeSB0aGUgcHJvcGVydHkgZGF0YSB0eXBlIGZvciBjb3JyZWN0IHZhbHVlIGNvbnZlcnNpb24gYW5kIHZhbGlkYXRpb24nKSxcbiAgICAgICAgdmFsdWU6IHouYW55KCkuZGVzY3JpYmUoc2V0Q29tcG9uZW50UHJvcGVydHlWYWx1ZURlc2NyaXB0aW9uKSxcbiAgICB9KSxcbiAgICBhdHRhY2hfc2NyaXB0OiB6Lm9iamVjdCh7XG4gICAgICAgIG5vZGVVdWlkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdOb2RlIFVVSUQnKSxcbiAgICAgICAgc2NyaXB0UGF0aDogei5zdHJpbmcoKS5kZXNjcmliZSgnU2NyaXB0IGFzc2V0IHBhdGggKGUuZy4sIGRiOi8vYXNzZXRzL3NjcmlwdHMvTXlTY3JpcHQudHMpJyksXG4gICAgfSksXG4gICAgZ2V0X2F2YWlsYWJsZV9jb21wb25lbnRzOiB6Lm9iamVjdCh7XG4gICAgICAgIGNhdGVnb3J5OiB6LmVudW0oWydhbGwnLCAncmVuZGVyZXInLCAndWknLCAncGh5c2ljcycsICdhbmltYXRpb24nLCAnYXVkaW8nXSkuZGVmYXVsdCgnYWxsJykuZGVzY3JpYmUoJ0NvbXBvbmVudCBjYXRlZ29yeSBmaWx0ZXInKSxcbiAgICB9KSxcbiAgICBhZGRfZXZlbnRfaGFuZGxlcjogei5vYmplY3Qoe1xuICAgICAgICBub2RlVXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnTm9kZSBVVUlEIG93bmluZyB0aGUgY29tcG9uZW50IChlLmcuIHRoZSBCdXR0b24gbm9kZSknKSxcbiAgICAgICAgY29tcG9uZW50VHlwZTogei5zdHJpbmcoKS5kZWZhdWx0KCdjYy5CdXR0b24nKS5kZXNjcmliZSgnQ29tcG9uZW50IGNsYXNzIG5hbWU7IGRlZmF1bHRzIHRvIGNjLkJ1dHRvbicpLFxuICAgICAgICBldmVudEFycmF5UHJvcGVydHk6IHouc3RyaW5nKCkuZGVmYXVsdCgnY2xpY2tFdmVudHMnKS5kZXNjcmliZSgnQ29tcG9uZW50IHByb3BlcnR5IGhvbGRpbmcgdGhlIEV2ZW50SGFuZGxlciBhcnJheSAoY2MuQnV0dG9uLmNsaWNrRXZlbnRzLCBjYy5Ub2dnbGUuY2hlY2tFdmVudHMsIOKApiknKSxcbiAgICAgICAgdGFyZ2V0Tm9kZVV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ05vZGUgVVVJRCB3aGVyZSB0aGUgY2FsbGJhY2sgY29tcG9uZW50IGxpdmVzIChtb3N0IG9mdGVuIHRoZSBzYW1lIGFzIG5vZGVVdWlkKScpLFxuICAgICAgICBjb21wb25lbnROYW1lOiB6LnN0cmluZygpLmRlc2NyaWJlKCdDbGFzcyBuYW1lIChjYy1jbGFzcykgb2YgdGhlIHNjcmlwdCB0aGF0IG93bnMgdGhlIGNhbGxiYWNrIG1ldGhvZCcpLFxuICAgICAgICBoYW5kbGVyOiB6LnN0cmluZygpLmRlc2NyaWJlKCdNZXRob2QgbmFtZSBvbiB0aGUgdGFyZ2V0IGNvbXBvbmVudCwgZS5nLiBcIm9uQ2xpY2tcIicpLFxuICAgICAgICBjdXN0b21FdmVudERhdGE6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnT3B0aW9uYWwgc3RyaW5nIHBhc3NlZCBiYWNrIHdoZW4gdGhlIGV2ZW50IGZpcmVzJyksXG4gICAgfSksXG4gICAgcmVtb3ZlX2V2ZW50X2hhbmRsZXI6IHoub2JqZWN0KHtcbiAgICAgICAgbm9kZVV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ05vZGUgVVVJRCBvd25pbmcgdGhlIGNvbXBvbmVudCcpLFxuICAgICAgICBjb21wb25lbnRUeXBlOiB6LnN0cmluZygpLmRlZmF1bHQoJ2NjLkJ1dHRvbicpLmRlc2NyaWJlKCdDb21wb25lbnQgY2xhc3MgbmFtZScpLFxuICAgICAgICBldmVudEFycmF5UHJvcGVydHk6IHouc3RyaW5nKCkuZGVmYXVsdCgnY2xpY2tFdmVudHMnKS5kZXNjcmliZSgnRXZlbnRIYW5kbGVyIGFycmF5IHByb3BlcnR5IG5hbWUnKSxcbiAgICAgICAgaW5kZXg6IHoubnVtYmVyKCkuaW50KCkubWluKDApLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1plcm8tYmFzZWQgaW5kZXggdG8gcmVtb3ZlLiBUYWtlcyBwcmVjZWRlbmNlIG92ZXIgdGFyZ2V0Tm9kZVV1aWQvaGFuZGxlciBtYXRjaGluZyB3aGVuIHByb3ZpZGVkLicpLFxuICAgICAgICB0YXJnZXROb2RlVXVpZDogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdNYXRjaCBoYW5kbGVycyB3aG9zZSB0YXJnZXQgbm9kZSBoYXMgdGhpcyBVVUlEJyksXG4gICAgICAgIGhhbmRsZXI6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnTWF0Y2ggaGFuZGxlcnMgd2l0aCB0aGlzIG1ldGhvZCBuYW1lJyksXG4gICAgfSksXG4gICAgbGlzdF9ldmVudF9oYW5kbGVyczogei5vYmplY3Qoe1xuICAgICAgICBub2RlVXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnTm9kZSBVVUlEIG93bmluZyB0aGUgY29tcG9uZW50JyksXG4gICAgICAgIGNvbXBvbmVudFR5cGU6IHouc3RyaW5nKCkuZGVmYXVsdCgnY2MuQnV0dG9uJykuZGVzY3JpYmUoJ0NvbXBvbmVudCBjbGFzcyBuYW1lJyksXG4gICAgICAgIGV2ZW50QXJyYXlQcm9wZXJ0eTogei5zdHJpbmcoKS5kZWZhdWx0KCdjbGlja0V2ZW50cycpLmRlc2NyaWJlKCdFdmVudEhhbmRsZXIgYXJyYXkgcHJvcGVydHkgbmFtZScpLFxuICAgIH0pLFxufSBhcyBjb25zdDtcblxuY29uc3QgY29tcG9uZW50VG9vbE1ldGE6IFJlY29yZDxrZXlvZiB0eXBlb2YgY29tcG9uZW50U2NoZW1hcywgc3RyaW5nPiA9IHtcbiAgICBhZGRfY29tcG9uZW50OiAnQWRkIGEgY29tcG9uZW50IHRvIGEgc3BlY2lmaWMgbm9kZS4gSU1QT1JUQU5UOiBZb3UgbXVzdCBwcm92aWRlIHRoZSBub2RlVXVpZCBwYXJhbWV0ZXIgdG8gc3BlY2lmeSB3aGljaCBub2RlIHRvIGFkZCB0aGUgY29tcG9uZW50IHRvLicsXG4gICAgcmVtb3ZlX2NvbXBvbmVudDogXCJSZW1vdmUgYSBjb21wb25lbnQgZnJvbSBhIG5vZGUuIGNvbXBvbmVudFR5cGUgbXVzdCBiZSB0aGUgY29tcG9uZW50J3MgY2xhc3NJZCAoY2lkLCBpLmUuIHRoZSB0eXBlIGZpZWxkIGZyb20gZ2V0Q29tcG9uZW50cyksIG5vdCB0aGUgc2NyaXB0IG5hbWUgb3IgY2xhc3MgbmFtZS4gVXNlIGdldENvbXBvbmVudHMgdG8gZ2V0IHRoZSBjb3JyZWN0IGNpZC5cIixcbiAgICBnZXRfY29tcG9uZW50czogJ0dldCBhbGwgY29tcG9uZW50cyBvZiBhIG5vZGUnLFxuICAgIGdldF9jb21wb25lbnRfaW5mbzogJ0dldCBzcGVjaWZpYyBjb21wb25lbnQgaW5mb3JtYXRpb24nLFxuICAgIHNldF9jb21wb25lbnRfcHJvcGVydHk6ICdTZXQgY29tcG9uZW50IHByb3BlcnR5IHZhbHVlcyBmb3IgVUkgY29tcG9uZW50cyBvciBjdXN0b20gc2NyaXB0IGNvbXBvbmVudHMuIFN1cHBvcnRzIHNldHRpbmcgcHJvcGVydGllcyBvZiBidWlsdC1pbiBVSSBjb21wb25lbnRzIChlLmcuLCBjYy5MYWJlbCwgY2MuU3ByaXRlKSBhbmQgY3VzdG9tIHNjcmlwdCBjb21wb25lbnRzLiBOb3RlOiBGb3Igbm9kZSBiYXNpYyBwcm9wZXJ0aWVzIChuYW1lLCBhY3RpdmUsIGxheWVyLCBldGMuKSwgdXNlIHNldF9ub2RlX3Byb3BlcnR5LiBGb3Igbm9kZSB0cmFuc2Zvcm0gcHJvcGVydGllcyAocG9zaXRpb24sIHJvdGF0aW9uLCBzY2FsZSwgZXRjLiksIHVzZSBzZXRfbm9kZV90cmFuc2Zvcm0uJyxcbiAgICBhdHRhY2hfc2NyaXB0OiAnQXR0YWNoIGEgc2NyaXB0IGNvbXBvbmVudCB0byBhIG5vZGUnLFxuICAgIGdldF9hdmFpbGFibGVfY29tcG9uZW50czogJ0dldCBsaXN0IG9mIGF2YWlsYWJsZSBjb21wb25lbnQgdHlwZXMnLFxuICAgIGFkZF9ldmVudF9oYW5kbGVyOiAnQXBwZW5kIGEgY2MuRXZlbnRIYW5kbGVyIGVudHJ5IHRvIGEgY29tcG9uZW50IGV2ZW50IGFycmF5IChkZWZhdWx0OiBjYy5CdXR0b24uY2xpY2tFdmVudHMpLiBVc2UgdGhpcyB0byB3aXJlIG9uQ2xpY2sgLyBvbkNoZWNrIC8gb25WYWx1ZUNoYW5nZWQgY2FsbGJhY2tzLicsXG4gICAgcmVtb3ZlX2V2ZW50X2hhbmRsZXI6ICdSZW1vdmUgYW4gRXZlbnRIYW5kbGVyIGVudHJ5IGJ5IGluZGV4LCBvciBieSBtYXRjaGluZyB0YXJnZXROb2RlVXVpZCArIGhhbmRsZXIgbmFtZS4nLFxuICAgIGxpc3RfZXZlbnRfaGFuZGxlcnM6ICdMaXN0IEV2ZW50SGFuZGxlciBlbnRyaWVzIGN1cnJlbnRseSBib3VuZCB0byBhIGNvbXBvbmVudCBldmVudCBhcnJheS4nLFxufTtcblxuZXhwb3J0IGNsYXNzIENvbXBvbmVudFRvb2xzIGltcGxlbWVudHMgVG9vbEV4ZWN1dG9yIHtcbiAgICBnZXRUb29scygpOiBUb29sRGVmaW5pdGlvbltdIHtcbiAgICAgICAgcmV0dXJuIChPYmplY3Qua2V5cyhjb21wb25lbnRTY2hlbWFzKSBhcyBBcnJheTxrZXlvZiB0eXBlb2YgY29tcG9uZW50U2NoZW1hcz4pLm1hcChuYW1lID0+ICh7XG4gICAgICAgICAgICBuYW1lLFxuICAgICAgICAgICAgZGVzY3JpcHRpb246IGNvbXBvbmVudFRvb2xNZXRhW25hbWVdLFxuICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHRvSW5wdXRTY2hlbWEoY29tcG9uZW50U2NoZW1hc1tuYW1lXSksXG4gICAgICAgIH0pKTtcbiAgICB9XG5cbiAgICBhc3luYyBleGVjdXRlKHRvb2xOYW1lOiBzdHJpbmcsIGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHNjaGVtYU5hbWUgPSB0b29sTmFtZSBhcyBrZXlvZiB0eXBlb2YgY29tcG9uZW50U2NoZW1hcztcbiAgICAgICAgY29uc3Qgc2NoZW1hID0gY29tcG9uZW50U2NoZW1hc1tzY2hlbWFOYW1lXTtcbiAgICAgICAgaWYgKCFzY2hlbWEpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5rbm93biB0b29sOiAke3Rvb2xOYW1lfWApO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHZhbGlkYXRpb24gPSB2YWxpZGF0ZUFyZ3Moc2NoZW1hLCBhcmdzID8/IHt9KTtcbiAgICAgICAgaWYgKCF2YWxpZGF0aW9uLm9rKSB7XG4gICAgICAgICAgICByZXR1cm4gdmFsaWRhdGlvbi5yZXNwb25zZTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBhID0gdmFsaWRhdGlvbi5kYXRhIGFzIGFueTtcblxuICAgICAgICBzd2l0Y2ggKHNjaGVtYU5hbWUpIHtcbiAgICAgICAgICAgIGNhc2UgJ2FkZF9jb21wb25lbnQnOlxuICAgICAgICAgICAgICAgIHJldHVybiBhd2FpdCB0aGlzLmFkZENvbXBvbmVudChhLm5vZGVVdWlkLCBhLmNvbXBvbmVudFR5cGUpO1xuICAgICAgICAgICAgY2FzZSAncmVtb3ZlX2NvbXBvbmVudCc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMucmVtb3ZlQ29tcG9uZW50KGEubm9kZVV1aWQsIGEuY29tcG9uZW50VHlwZSk7XG4gICAgICAgICAgICBjYXNlICdnZXRfY29tcG9uZW50cyc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuZ2V0Q29tcG9uZW50cyhhLm5vZGVVdWlkKTtcbiAgICAgICAgICAgIGNhc2UgJ2dldF9jb21wb25lbnRfaW5mbyc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuZ2V0Q29tcG9uZW50SW5mbyhhLm5vZGVVdWlkLCBhLmNvbXBvbmVudFR5cGUpO1xuICAgICAgICAgICAgY2FzZSAnc2V0X2NvbXBvbmVudF9wcm9wZXJ0eSc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuc2V0Q29tcG9uZW50UHJvcGVydHkoYSk7XG4gICAgICAgICAgICBjYXNlICdhdHRhY2hfc2NyaXB0JzpcbiAgICAgICAgICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5hdHRhY2hTY3JpcHQoYS5ub2RlVXVpZCwgYS5zY3JpcHRQYXRoKTtcbiAgICAgICAgICAgIGNhc2UgJ2dldF9hdmFpbGFibGVfY29tcG9uZW50cyc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuZ2V0QXZhaWxhYmxlQ29tcG9uZW50cyhhLmNhdGVnb3J5KTtcbiAgICAgICAgICAgIGNhc2UgJ2FkZF9ldmVudF9oYW5kbGVyJzoge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlc3AgPSBhd2FpdCBydW5TY2VuZU1ldGhvZEFzVG9vbFJlc3BvbnNlKCdhZGRFdmVudEhhbmRsZXInLCBbXG4gICAgICAgICAgICAgICAgICAgIGEubm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgICAgIGEuY29tcG9uZW50VHlwZSxcbiAgICAgICAgICAgICAgICAgICAgYS5ldmVudEFycmF5UHJvcGVydHksXG4gICAgICAgICAgICAgICAgICAgIGEudGFyZ2V0Tm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgICAgIGEuY29tcG9uZW50TmFtZSxcbiAgICAgICAgICAgICAgICAgICAgYS5oYW5kbGVyLFxuICAgICAgICAgICAgICAgICAgICBhLmN1c3RvbUV2ZW50RGF0YSxcbiAgICAgICAgICAgICAgICBdKTtcbiAgICAgICAgICAgICAgICBpZiAocmVzcC5zdWNjZXNzKSBhd2FpdCBudWRnZUVkaXRvck1vZGVsKGEubm9kZVV1aWQsIGEuY29tcG9uZW50VHlwZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlc3A7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYXNlICdyZW1vdmVfZXZlbnRfaGFuZGxlcic6IHtcbiAgICAgICAgICAgICAgICBjb25zdCByZXNwID0gYXdhaXQgcnVuU2NlbmVNZXRob2RBc1Rvb2xSZXNwb25zZSgncmVtb3ZlRXZlbnRIYW5kbGVyJywgW1xuICAgICAgICAgICAgICAgICAgICBhLm5vZGVVdWlkLFxuICAgICAgICAgICAgICAgICAgICBhLmNvbXBvbmVudFR5cGUsXG4gICAgICAgICAgICAgICAgICAgIGEuZXZlbnRBcnJheVByb3BlcnR5LFxuICAgICAgICAgICAgICAgICAgICBhLmluZGV4ID8/IG51bGwsXG4gICAgICAgICAgICAgICAgICAgIGEudGFyZ2V0Tm9kZVV1aWQgPz8gbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgYS5oYW5kbGVyID8/IG51bGwsXG4gICAgICAgICAgICAgICAgXSk7XG4gICAgICAgICAgICAgICAgaWYgKHJlc3Auc3VjY2VzcykgYXdhaXQgbnVkZ2VFZGl0b3JNb2RlbChhLm5vZGVVdWlkLCBhLmNvbXBvbmVudFR5cGUpO1xuICAgICAgICAgICAgICAgIHJldHVybiByZXNwO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2FzZSAnbGlzdF9ldmVudF9oYW5kbGVycyc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGF3YWl0IHJ1blNjZW5lTWV0aG9kQXNUb29sUmVzcG9uc2UoJ2xpc3RFdmVudEhhbmRsZXJzJywgW1xuICAgICAgICAgICAgICAgICAgICBhLm5vZGVVdWlkLFxuICAgICAgICAgICAgICAgICAgICBhLmNvbXBvbmVudFR5cGUsXG4gICAgICAgICAgICAgICAgICAgIGEuZXZlbnRBcnJheVByb3BlcnR5LFxuICAgICAgICAgICAgICAgIF0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBhZGRDb21wb25lbnQobm9kZVV1aWQ6IHN0cmluZywgY29tcG9uZW50VHlwZTogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKGFzeW5jIChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICAvLyDlhYjmn6Xmib7oioLngrnkuIrmmK/lkKblt7LlrZjlnKjor6Xnu4Tku7ZcbiAgICAgICAgICAgIGNvbnN0IGFsbENvbXBvbmVudHNJbmZvID0gYXdhaXQgdGhpcy5nZXRDb21wb25lbnRzKG5vZGVVdWlkKTtcbiAgICAgICAgICAgIGlmIChhbGxDb21wb25lbnRzSW5mby5zdWNjZXNzICYmIGFsbENvbXBvbmVudHNJbmZvLmRhdGE/LmNvbXBvbmVudHMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBleGlzdGluZ0NvbXBvbmVudCA9IGFsbENvbXBvbmVudHNJbmZvLmRhdGEuY29tcG9uZW50cy5maW5kKChjb21wOiBhbnkpID0+IGNvbXAudHlwZSA9PT0gY29tcG9uZW50VHlwZSk7XG4gICAgICAgICAgICAgICAgaWYgKGV4aXN0aW5nQ29tcG9uZW50KSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBDb21wb25lbnQgJyR7Y29tcG9uZW50VHlwZX0nIGFscmVhZHkgZXhpc3RzIG9uIG5vZGVgLFxuICAgICAgICAgICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5vZGVVdWlkOiBub2RlVXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRUeXBlOiBjb21wb25lbnRUeXBlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudFZlcmlmaWVkOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4aXN0aW5nOiB0cnVlXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8g5bCd6K+V55u05o6l5L2/55SoIEVkaXRvciBBUEkg5re75Yqg57uE5Lu2XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdjcmVhdGUtY29tcG9uZW50Jywge1xuICAgICAgICAgICAgICAgIHV1aWQ6IG5vZGVVdWlkLFxuICAgICAgICAgICAgICAgIGNvbXBvbmVudDogY29tcG9uZW50VHlwZVxuICAgICAgICAgICAgfSkudGhlbihhc3luYyAocmVzdWx0OiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAvLyDnrYnlvoXkuIDmrrXml7bpl7TorqlFZGl0b3LlrozmiJDnu4Tku7bmt7vliqBcbiAgICAgICAgICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMTAwKSk7XG4gICAgICAgICAgICAgICAgLy8g6YeN5paw5p+l6K+i6IqC54K55L+h5oGv6aqM6K+B57uE5Lu25piv5ZCm55yf55qE5re75Yqg5oiQ5YqfXG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYWxsQ29tcG9uZW50c0luZm8yID0gYXdhaXQgdGhpcy5nZXRDb21wb25lbnRzKG5vZGVVdWlkKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGFsbENvbXBvbmVudHNJbmZvMi5zdWNjZXNzICYmIGFsbENvbXBvbmVudHNJbmZvMi5kYXRhPy5jb21wb25lbnRzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBhZGRlZENvbXBvbmVudCA9IGFsbENvbXBvbmVudHNJbmZvMi5kYXRhLmNvbXBvbmVudHMuZmluZCgoY29tcDogYW55KSA9PiBjb21wLnR5cGUgPT09IGNvbXBvbmVudFR5cGUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGFkZGVkQ29tcG9uZW50KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBDb21wb25lbnQgJyR7Y29tcG9uZW50VHlwZX0nIGFkZGVkIHN1Y2Nlc3NmdWxseWAsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5vZGVVdWlkOiBub2RlVXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudFR5cGU6IGNvbXBvbmVudFR5cGUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRWZXJpZmllZDogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4aXN0aW5nOiBmYWxzZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGBDb21wb25lbnQgJyR7Y29tcG9uZW50VHlwZX0nIHdhcyBub3QgZm91bmQgb24gbm9kZSBhZnRlciBhZGRpdGlvbi4gQXZhaWxhYmxlIGNvbXBvbmVudHM6ICR7YWxsQ29tcG9uZW50c0luZm8yLmRhdGEuY29tcG9uZW50cy5tYXAoKGM6IGFueSkgPT4gYy50eXBlKS5qb2luKCcsICcpfWBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yOiBgRmFpbGVkIHRvIHZlcmlmeSBjb21wb25lbnQgYWRkaXRpb246ICR7YWxsQ29tcG9uZW50c0luZm8yLmVycm9yIHx8ICdVbmFibGUgdG8gZ2V0IG5vZGUgY29tcG9uZW50cyd9YFxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGNhdGNoICh2ZXJpZnlFcnJvcjogYW55KSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgICAgICBlcnJvcjogYEZhaWxlZCB0byB2ZXJpZnkgY29tcG9uZW50IGFkZGl0aW9uOiAke3ZlcmlmeUVycm9yLm1lc3NhZ2V9YFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIC8vIOWkh+eUqOaWueahiO+8muS9v+eUqOWcuuaZr+iEmuacrFxuICAgICAgICAgICAgICAgIGNvbnN0IG9wdGlvbnMgPSB7XG4gICAgICAgICAgICAgICAgICAgIG5hbWU6ICdjb2Nvcy1tY3Atc2VydmVyJyxcbiAgICAgICAgICAgICAgICAgICAgbWV0aG9kOiAnYWRkQ29tcG9uZW50VG9Ob2RlJyxcbiAgICAgICAgICAgICAgICAgICAgYXJnczogW25vZGVVdWlkLCBjb21wb25lbnRUeXBlXVxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnZXhlY3V0ZS1zY2VuZS1zY3JpcHQnLCBvcHRpb25zKS50aGVuKChyZXN1bHQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgfSkuY2F0Y2goKGVycjI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBEaXJlY3QgQVBJIGZhaWxlZDogJHtlcnIubWVzc2FnZX0sIFNjZW5lIHNjcmlwdCBmYWlsZWQ6ICR7ZXJyMi5tZXNzYWdlfWAgfSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyByZW1vdmVDb21wb25lbnQobm9kZVV1aWQ6IHN0cmluZywgY29tcG9uZW50VHlwZTogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKGFzeW5jIChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICAvLyAxLiDmn6Xmib7oioLngrnkuIrnmoTmiYDmnInnu4Tku7ZcbiAgICAgICAgICAgIGNvbnN0IGFsbENvbXBvbmVudHNJbmZvID0gYXdhaXQgdGhpcy5nZXRDb21wb25lbnRzKG5vZGVVdWlkKTtcbiAgICAgICAgICAgIGlmICghYWxsQ29tcG9uZW50c0luZm8uc3VjY2VzcyB8fCAhYWxsQ29tcG9uZW50c0luZm8uZGF0YT8uY29tcG9uZW50cykge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBGYWlsZWQgdG8gZ2V0IGNvbXBvbmVudHMgZm9yIG5vZGUgJyR7bm9kZVV1aWR9JzogJHthbGxDb21wb25lbnRzSW5mby5lcnJvcn1gIH0pO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIDIuIOWPquafpeaJvnR5cGXlrZfmrrXnrYnkuo5jb21wb25lbnRUeXBl55qE57uE5Lu277yI5Y2zY2lk77yJXG4gICAgICAgICAgICBjb25zdCBleGlzdHMgPSBhbGxDb21wb25lbnRzSW5mby5kYXRhLmNvbXBvbmVudHMuc29tZSgoY29tcDogYW55KSA9PiBjb21wLnR5cGUgPT09IGNvbXBvbmVudFR5cGUpO1xuICAgICAgICAgICAgaWYgKCFleGlzdHMpIHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgQ29tcG9uZW50IGNpZCAnJHtjb21wb25lbnRUeXBlfScgbm90IGZvdW5kIG9uIG5vZGUgJyR7bm9kZVV1aWR9Jy4g6K+355SoZ2V0Q29tcG9uZW50c+iOt+WPlnR5cGXlrZfmrrXvvIhjaWTvvInkvZzkuLpjb21wb25lbnRUeXBl44CCYCB9KTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyAzLiDlrpjmlrlBUEnnm7TmjqXnp7vpmaRcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncmVtb3ZlLWNvbXBvbmVudCcsIHtcbiAgICAgICAgICAgICAgICAgICAgdXVpZDogbm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudDogY29tcG9uZW50VHlwZVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIC8vIDQuIOWGjeafpeS4gOasoeehruiupOaYr+WQpuenu+mZpFxuICAgICAgICAgICAgICAgIGNvbnN0IGFmdGVyUmVtb3ZlSW5mbyA9IGF3YWl0IHRoaXMuZ2V0Q29tcG9uZW50cyhub2RlVXVpZCk7XG4gICAgICAgICAgICAgICAgY29uc3Qgc3RpbGxFeGlzdHMgPSBhZnRlclJlbW92ZUluZm8uc3VjY2VzcyAmJiBhZnRlclJlbW92ZUluZm8uZGF0YT8uY29tcG9uZW50cz8uc29tZSgoY29tcDogYW55KSA9PiBjb21wLnR5cGUgPT09IGNvbXBvbmVudFR5cGUpO1xuICAgICAgICAgICAgICAgIGlmIChzdGlsbEV4aXN0cykge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgQ29tcG9uZW50IGNpZCAnJHtjb21wb25lbnRUeXBlfScgd2FzIG5vdCByZW1vdmVkIGZyb20gbm9kZSAnJHtub2RlVXVpZH0nLmAgfSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYENvbXBvbmVudCBjaWQgJyR7Y29tcG9uZW50VHlwZX0nIHJlbW92ZWQgc3VjY2Vzc2Z1bGx5IGZyb20gbm9kZSAnJHtub2RlVXVpZH0nYCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGRhdGE6IHsgbm9kZVV1aWQsIGNvbXBvbmVudFR5cGUgfVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBGYWlsZWQgdG8gcmVtb3ZlIGNvbXBvbmVudDogJHtlcnIubWVzc2FnZX1gIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldENvbXBvbmVudHMobm9kZVV1aWQ6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgLy8g5LyY5YWI5bCd6K+V55u05o6l5L2/55SoIEVkaXRvciBBUEkg5p+l6K+i6IqC54K55L+h5oGvXG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1ub2RlJywgbm9kZVV1aWQpLnRoZW4oKG5vZGVEYXRhOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAobm9kZURhdGEgJiYgbm9kZURhdGEuX19jb21wc19fKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbXBvbmVudHMgPSBub2RlRGF0YS5fX2NvbXBzX18ubWFwKChjb21wOiBhbnkpID0+ICh7XG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiBjb21wLl9fdHlwZV9fIHx8IGNvbXAuY2lkIHx8IGNvbXAudHlwZSB8fCAnVW5rbm93bicsXG4gICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiBjb21wLnV1aWQ/LnZhbHVlIHx8IGNvbXAudXVpZCB8fCBudWxsLFxuICAgICAgICAgICAgICAgICAgICAgICAgZW5hYmxlZDogY29tcC5lbmFibGVkICE9PSB1bmRlZmluZWQgPyBjb21wLmVuYWJsZWQgOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgcHJvcGVydGllczogdGhpcy5leHRyYWN0Q29tcG9uZW50UHJvcGVydGllcyhjb21wKVxuICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWQ6IG5vZGVVdWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudHM6IGNvbXBvbmVudHNcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ05vZGUgbm90IGZvdW5kIG9yIG5vIGNvbXBvbmVudHMgZGF0YScgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICAvLyDlpIfnlKjmlrnmoYjvvJrkvb/nlKjlnLrmma/ohJrmnKxcbiAgICAgICAgICAgICAgICBjb25zdCBvcHRpb25zID0ge1xuICAgICAgICAgICAgICAgICAgICBuYW1lOiAnY29jb3MtbWNwLXNlcnZlcicsXG4gICAgICAgICAgICAgICAgICAgIG1ldGhvZDogJ2dldE5vZGVJbmZvJyxcbiAgICAgICAgICAgICAgICAgICAgYXJnczogW25vZGVVdWlkXVxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnZXhlY3V0ZS1zY2VuZS1zY3JpcHQnLCBvcHRpb25zKS50aGVuKChyZXN1bHQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGF0YTogcmVzdWx0LmRhdGEuY29tcG9uZW50c1xuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KS5jYXRjaCgoZXJyMjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYERpcmVjdCBBUEkgZmFpbGVkOiAke2Vyci5tZXNzYWdlfSwgU2NlbmUgc2NyaXB0IGZhaWxlZDogJHtlcnIyLm1lc3NhZ2V9YCB9KTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldENvbXBvbmVudEluZm8obm9kZVV1aWQ6IHN0cmluZywgY29tcG9uZW50VHlwZTogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICAvLyDkvJjlhYjlsJ3or5Xnm7TmjqXkvb/nlKggRWRpdG9yIEFQSSDmn6Xor6LoioLngrnkv6Hmga9cbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LW5vZGUnLCBub2RlVXVpZCkudGhlbigobm9kZURhdGE6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChub2RlRGF0YSAmJiBub2RlRGF0YS5fX2NvbXBzX18pIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY29tcG9uZW50ID0gbm9kZURhdGEuX19jb21wc19fLmZpbmQoKGNvbXA6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY29tcFR5cGUgPSBjb21wLl9fdHlwZV9fIHx8IGNvbXAuY2lkIHx8IGNvbXAudHlwZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBjb21wVHlwZSA9PT0gY29tcG9uZW50VHlwZTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICBpZiAoY29tcG9uZW50KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWQ6IG5vZGVVdWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRUeXBlOiBjb21wb25lbnRUeXBlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbmFibGVkOiBjb21wb25lbnQuZW5hYmxlZCAhPT0gdW5kZWZpbmVkID8gY29tcG9uZW50LmVuYWJsZWQgOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0aWVzOiB0aGlzLmV4dHJhY3RDb21wb25lbnRQcm9wZXJ0aWVzKGNvbXBvbmVudClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBDb21wb25lbnQgJyR7Y29tcG9uZW50VHlwZX0nIG5vdCBmb3VuZCBvbiBub2RlYCB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdOb2RlIG5vdCBmb3VuZCBvciBubyBjb21wb25lbnRzIGRhdGEnIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgLy8g5aSH55So5pa55qGI77ya5L2/55So5Zy65pmv6ISa5pysXG4gICAgICAgICAgICAgICAgY29uc3Qgb3B0aW9ucyA9IHtcbiAgICAgICAgICAgICAgICAgICAgbmFtZTogJ2NvY29zLW1jcC1zZXJ2ZXInLFxuICAgICAgICAgICAgICAgICAgICBtZXRob2Q6ICdnZXROb2RlSW5mbycsXG4gICAgICAgICAgICAgICAgICAgIGFyZ3M6IFtub2RlVXVpZF1cbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ2V4ZWN1dGUtc2NlbmUtc2NyaXB0Jywgb3B0aW9ucykudGhlbigocmVzdWx0OiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdC5zdWNjZXNzICYmIHJlc3VsdC5kYXRhLmNvbXBvbmVudHMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbXBvbmVudCA9IHJlc3VsdC5kYXRhLmNvbXBvbmVudHMuZmluZCgoY29tcDogYW55KSA9PiBjb21wLnR5cGUgPT09IGNvbXBvbmVudFR5cGUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNvbXBvbmVudCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBub2RlVXVpZDogbm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRUeXBlOiBjb21wb25lbnRUeXBlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLi4uY29tcG9uZW50XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYENvbXBvbmVudCAnJHtjb21wb25lbnRUeXBlfScgbm90IGZvdW5kIG9uIG5vZGVgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogcmVzdWx0LmVycm9yIHx8ICdGYWlsZWQgdG8gZ2V0IGNvbXBvbmVudCBpbmZvJyB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pLmNhdGNoKChlcnIyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgRGlyZWN0IEFQSSBmYWlsZWQ6ICR7ZXJyLm1lc3NhZ2V9LCBTY2VuZSBzY3JpcHQgZmFpbGVkOiAke2VycjIubWVzc2FnZX1gIH0pO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgZXh0cmFjdENvbXBvbmVudFByb3BlcnRpZXMoY29tcG9uZW50OiBhbnkpOiBSZWNvcmQ8c3RyaW5nLCBhbnk+IHtcbiAgICAgICAgZGVidWdMb2coYFtleHRyYWN0Q29tcG9uZW50UHJvcGVydGllc10gUHJvY2Vzc2luZyBjb21wb25lbnQ6YCwgT2JqZWN0LmtleXMoY29tcG9uZW50KSk7XG4gICAgICAgIFxuICAgICAgICAvLyDmo4Dmn6Xnu4Tku7bmmK/lkKbmnIkgdmFsdWUg5bGe5oCn77yM6L+Z6YCa5bi45YyF5ZCr5a6e6ZmF55qE57uE5Lu25bGe5oCnXG4gICAgICAgIGlmIChjb21wb25lbnQudmFsdWUgJiYgdHlwZW9mIGNvbXBvbmVudC52YWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIGRlYnVnTG9nKGBbZXh0cmFjdENvbXBvbmVudFByb3BlcnRpZXNdIEZvdW5kIGNvbXBvbmVudC52YWx1ZSB3aXRoIHByb3BlcnRpZXM6YCwgT2JqZWN0LmtleXMoY29tcG9uZW50LnZhbHVlKSk7XG4gICAgICAgICAgICByZXR1cm4gY29tcG9uZW50LnZhbHVlOyAvLyDnm7TmjqXov5Tlm54gdmFsdWUg5a+56LGh77yM5a6D5YyF5ZCr5omA5pyJ57uE5Lu25bGe5oCnXG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vIOWkh+eUqOaWueahiO+8muS7jue7hOS7tuWvueixoeS4reebtOaOpeaPkOWPluWxnuaAp1xuICAgICAgICBjb25zdCBwcm9wZXJ0aWVzOiBSZWNvcmQ8c3RyaW5nLCBhbnk+ID0ge307XG4gICAgICAgIGNvbnN0IGV4Y2x1ZGVLZXlzID0gWydfX3R5cGVfXycsICdlbmFibGVkJywgJ25vZGUnLCAnX2lkJywgJ19fc2NyaXB0QXNzZXQnLCAndXVpZCcsICduYW1lJywgJ19uYW1lJywgJ19vYmpGbGFncycsICdfZW5hYmxlZCcsICd0eXBlJywgJ3JlYWRvbmx5JywgJ3Zpc2libGUnLCAnY2lkJywgJ2VkaXRvcicsICdleHRlbmRzJ107XG4gICAgICAgIFxuICAgICAgICBmb3IgKGNvbnN0IGtleSBpbiBjb21wb25lbnQpIHtcbiAgICAgICAgICAgIGlmICghZXhjbHVkZUtleXMuaW5jbHVkZXMoa2V5KSAmJiAha2V5LnN0YXJ0c1dpdGgoJ18nKSkge1xuICAgICAgICAgICAgICAgIGRlYnVnTG9nKGBbZXh0cmFjdENvbXBvbmVudFByb3BlcnRpZXNdIEZvdW5kIGRpcmVjdCBwcm9wZXJ0eSAnJHtrZXl9JzpgLCB0eXBlb2YgY29tcG9uZW50W2tleV0pO1xuICAgICAgICAgICAgICAgIHByb3BlcnRpZXNba2V5XSA9IGNvbXBvbmVudFtrZXldO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBkZWJ1Z0xvZyhgW2V4dHJhY3RDb21wb25lbnRQcm9wZXJ0aWVzXSBGaW5hbCBleHRyYWN0ZWQgcHJvcGVydGllczpgLCBPYmplY3Qua2V5cyhwcm9wZXJ0aWVzKSk7XG4gICAgICAgIHJldHVybiBwcm9wZXJ0aWVzO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZmluZENvbXBvbmVudFR5cGVCeVV1aWQoY29tcG9uZW50VXVpZDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XG4gICAgICAgIGRlYnVnTG9nKGBbZmluZENvbXBvbmVudFR5cGVCeVV1aWRdIFNlYXJjaGluZyBmb3IgY29tcG9uZW50IHR5cGUgd2l0aCBVVUlEOiAke2NvbXBvbmVudFV1aWR9YCk7XG4gICAgICAgIGlmICghY29tcG9uZW50VXVpZCkge1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IG5vZGVUcmVlID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktbm9kZS10cmVlJyk7XG4gICAgICAgICAgICBpZiAoIW5vZGVUcmVlKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS53YXJuKCdbZmluZENvbXBvbmVudFR5cGVCeVV1aWRdIEZhaWxlZCB0byBxdWVyeSBub2RlIHRyZWUuJyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IHF1ZXVlOiBhbnlbXSA9IFtub2RlVHJlZV07XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHdoaWxlIChxdWV1ZS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgY3VycmVudE5vZGVJbmZvID0gcXVldWUuc2hpZnQoKTtcbiAgICAgICAgICAgICAgICBpZiAoIWN1cnJlbnROb2RlSW5mbyB8fCAhY3VycmVudE5vZGVJbmZvLnV1aWQpIHtcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZnVsbE5vZGVEYXRhID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktbm9kZScsIGN1cnJlbnROb2RlSW5mby51dWlkKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGZ1bGxOb2RlRGF0YSAmJiBmdWxsTm9kZURhdGEuX19jb21wc19fKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGNvbXAgb2YgZnVsbE5vZGVEYXRhLl9fY29tcHNfXykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbXBBbnkgPSBjb21wIGFzIGFueTsgLy8gQ2FzdCB0byBhbnkgdG8gYWNjZXNzIGR5bmFtaWMgcHJvcGVydGllc1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIFRoZSBjb21wb25lbnQgVVVJRCBpcyBuZXN0ZWQgaW4gdGhlICd2YWx1ZScgcHJvcGVydHlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoY29tcEFueS51dWlkICYmIGNvbXBBbnkudXVpZC52YWx1ZSA9PT0gY29tcG9uZW50VXVpZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjb21wb25lbnRUeXBlID0gY29tcEFueS5fX3R5cGVfXztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYFtmaW5kQ29tcG9uZW50VHlwZUJ5VXVpZF0gRm91bmQgY29tcG9uZW50IHR5cGUgJyR7Y29tcG9uZW50VHlwZX0nIGZvciBVVUlEICR7Y29tcG9uZW50VXVpZH0gb24gbm9kZSAke2Z1bGxOb2RlRGF0YS5uYW1lPy52YWx1ZX1gKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNvbXBvbmVudFR5cGU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oYFtmaW5kQ29tcG9uZW50VHlwZUJ5VXVpZF0gQ291bGQgbm90IHF1ZXJ5IG5vZGUgJHtjdXJyZW50Tm9kZUluZm8udXVpZH06YCwgZSk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKGN1cnJlbnROb2RlSW5mby5jaGlsZHJlbikge1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIGN1cnJlbnROb2RlSW5mby5jaGlsZHJlbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgcXVldWUucHVzaChjaGlsZCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnNvbGUud2FybihgW2ZpbmRDb21wb25lbnRUeXBlQnlVdWlkXSBDb21wb25lbnQgd2l0aCBVVUlEICR7Y29tcG9uZW50VXVpZH0gbm90IGZvdW5kIGluIHNjZW5lIHRyZWUuYCk7XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYFtmaW5kQ29tcG9uZW50VHlwZUJ5VXVpZF0gRXJyb3Igd2hpbGUgc2VhcmNoaW5nIGZvciBjb21wb25lbnQgdHlwZTpgLCBlcnJvcik7XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgc2V0Q29tcG9uZW50UHJvcGVydHkoYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHsgbm9kZVV1aWQsIGNvbXBvbmVudFR5cGUsIHByb3BlcnR5LCBwcm9wZXJ0eVR5cGUsIHZhbHVlIH0gPSBhcmdzO1xuICAgICAgICBcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKGFzeW5jIChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGRlYnVnTG9nKGBbQ29tcG9uZW50VG9vbHNdIFNldHRpbmcgJHtjb21wb25lbnRUeXBlfS4ke3Byb3BlcnR5fSAodHlwZTogJHtwcm9wZXJ0eVR5cGV9KSA9ICR7SlNPTi5zdHJpbmdpZnkodmFsdWUpfSBvbiBub2RlICR7bm9kZVV1aWR9YCk7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgLy8gU3RlcCAwOiDmo4DmtYvmmK/lkKbkuLroioLngrnlsZ7mgKfvvIzlpoLmnpzmmK/liJnph43lrprlkJHliLDlr7nlupTnmoToioLngrnmlrnms5VcbiAgICAgICAgICAgICAgICBjb25zdCBub2RlUmVkaXJlY3RSZXN1bHQgPSBhd2FpdCB0aGlzLmNoZWNrQW5kUmVkaXJlY3ROb2RlUHJvcGVydGllcyhhcmdzKTtcbiAgICAgICAgICAgICAgICBpZiAobm9kZVJlZGlyZWN0UmVzdWx0KSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUobm9kZVJlZGlyZWN0UmVzdWx0KTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAvLyBTdGVwIDE6IOiOt+WPlue7hOS7tuS/oeaBr++8jOS9v+eUqOS4jmdldENvbXBvbmVudHPnm7jlkIznmoTmlrnms5VcbiAgICAgICAgICAgICAgICBjb25zdCBjb21wb25lbnRzUmVzcG9uc2UgPSBhd2FpdCB0aGlzLmdldENvbXBvbmVudHMobm9kZVV1aWQpO1xuICAgICAgICAgICAgICAgIGlmICghY29tcG9uZW50c1Jlc3BvbnNlLnN1Y2Nlc3MgfHwgIWNvbXBvbmVudHNSZXNwb25zZS5kYXRhKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgICAgICBlcnJvcjogYEZhaWxlZCB0byBnZXQgY29tcG9uZW50cyBmb3Igbm9kZSAnJHtub2RlVXVpZH0nOiAke2NvbXBvbmVudHNSZXNwb25zZS5lcnJvcn1gLFxuICAgICAgICAgICAgICAgICAgICAgICAgaW5zdHJ1Y3Rpb246IGBQbGVhc2UgdmVyaWZ5IHRoYXQgbm9kZSBVVUlEICcke25vZGVVdWlkfScgaXMgY29ycmVjdC4gVXNlIGdldF9hbGxfbm9kZXMgb3IgZmluZF9ub2RlX2J5X25hbWUgdG8gZ2V0IHRoZSBjb3JyZWN0IG5vZGUgVVVJRC5gXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGNvbnN0IGFsbENvbXBvbmVudHMgPSBjb21wb25lbnRzUmVzcG9uc2UuZGF0YS5jb21wb25lbnRzO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIC8vIFN0ZXAgMjog5p+l5om+55uu5qCH57uE5Lu2XG4gICAgICAgICAgICAgICAgbGV0IHRhcmdldENvbXBvbmVudCA9IG51bGw7XG4gICAgICAgICAgICAgICAgY29uc3QgYXZhaWxhYmxlVHlwZXM6IHN0cmluZ1tdID0gW107XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhbGxDb21wb25lbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbXAgPSBhbGxDb21wb25lbnRzW2ldO1xuICAgICAgICAgICAgICAgICAgICBhdmFpbGFibGVUeXBlcy5wdXNoKGNvbXAudHlwZSk7XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICBpZiAoY29tcC50eXBlID09PSBjb21wb25lbnRUeXBlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0YXJnZXRDb21wb25lbnQgPSBjb21wO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaWYgKCF0YXJnZXRDb21wb25lbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8g5o+Q5L6b5pu06K+m57uG55qE6ZSZ6K+v5L+h5oGv5ZKM5bu66K6uXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGluc3RydWN0aW9uID0gdGhpcy5nZW5lcmF0ZUNvbXBvbmVudFN1Z2dlc3Rpb24oY29tcG9uZW50VHlwZSwgYXZhaWxhYmxlVHlwZXMsIHByb3BlcnR5KTtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yOiBgQ29tcG9uZW50ICcke2NvbXBvbmVudFR5cGV9JyBub3QgZm91bmQgb24gbm9kZS4gQXZhaWxhYmxlIGNvbXBvbmVudHM6ICR7YXZhaWxhYmxlVHlwZXMuam9pbignLCAnKX1gLFxuICAgICAgICAgICAgICAgICAgICAgICAgaW5zdHJ1Y3Rpb246IGluc3RydWN0aW9uXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIC8vIFN0ZXAgMzog6Ieq5Yqo5qOA5rWL5ZKM6L2s5o2i5bGe5oCn5YC8XG4gICAgICAgICAgICAgICAgbGV0IHByb3BlcnR5SW5mbztcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgW0NvbXBvbmVudFRvb2xzXSBBbmFseXppbmcgcHJvcGVydHk6ICR7cHJvcGVydHl9YCk7XG4gICAgICAgICAgICAgICAgICAgIHByb3BlcnR5SW5mbyA9IHRoaXMuYW5hbHl6ZVByb3BlcnR5KHRhcmdldENvbXBvbmVudCwgcHJvcGVydHkpO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGFuYWx5emVFcnJvcjogYW55KSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYFtDb21wb25lbnRUb29sc10gRXJyb3IgaW4gYW5hbHl6ZVByb3BlcnR5OmAsIGFuYWx5emVFcnJvcik7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgICAgICBlcnJvcjogYEZhaWxlZCB0byBhbmFseXplIHByb3BlcnR5ICcke3Byb3BlcnR5fSc6ICR7YW5hbHl6ZUVycm9yLm1lc3NhZ2V9YFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpZiAoIXByb3BlcnR5SW5mby5leGlzdHMpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yOiBgUHJvcGVydHkgJyR7cHJvcGVydHl9JyBub3QgZm91bmQgb24gY29tcG9uZW50ICcke2NvbXBvbmVudFR5cGV9Jy4gQXZhaWxhYmxlIHByb3BlcnRpZXM6ICR7cHJvcGVydHlJbmZvLmF2YWlsYWJsZVByb3BlcnRpZXMuam9pbignLCAnKX1gXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIC8vIFN0ZXAgNDog5aSE55CG5bGe5oCn5YC85ZKM6K6+572uXG4gICAgICAgICAgICAgICAgY29uc3Qgb3JpZ2luYWxWYWx1ZSA9IHByb3BlcnR5SW5mby5vcmlnaW5hbFZhbHVlO1xuICAgICAgICAgICAgICAgIGxldCBwcm9jZXNzZWRWYWx1ZTogYW55O1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIC8vIOagueaNruaYjuehrueahHByb3BlcnR5VHlwZeWkhOeQhuWxnuaAp+WAvFxuICAgICAgICAgICAgICAgIHN3aXRjaCAocHJvcGVydHlUeXBlKSB7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICAgICAgICAgICAgICAgICAgICBwcm9jZXNzZWRWYWx1ZSA9IFN0cmluZyh2YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgICAgICAgICAgICAgICAgY2FzZSAnaW50ZWdlcic6XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ2Zsb2F0JzpcbiAgICAgICAgICAgICAgICAgICAgICAgIHByb2Nlc3NlZFZhbHVlID0gTnVtYmVyKHZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBjYXNlICdib29sZWFuJzpcbiAgICAgICAgICAgICAgICAgICAgICAgIHByb2Nlc3NlZFZhbHVlID0gQm9vbGVhbih2YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgY2FzZSAnY29sb3InOlxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDlrZfnrKbkuLLmoLzlvI/vvJrmlK/mjIHljYHlha3ov5vliLbjgIHpopzoibLlkI3np7DjgIFyZ2IoKS9yZ2JhKClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9jZXNzZWRWYWx1ZSA9IHRoaXMucGFyc2VDb2xvclN0cmluZyh2YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDlr7nosaHmoLzlvI/vvJrpqozor4HlubbovazmjaJSR0JB5YC8XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvY2Vzc2VkVmFsdWUgPSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHI6IE1hdGgubWluKDI1NSwgTWF0aC5tYXgoMCwgTnVtYmVyKHZhbHVlLnIpIHx8IDApKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZzogTWF0aC5taW4oMjU1LCBNYXRoLm1heCgwLCBOdW1iZXIodmFsdWUuZykgfHwgMCkpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBiOiBNYXRoLm1pbigyNTUsIE1hdGgubWF4KDAsIE51bWJlcih2YWx1ZS5iKSB8fCAwKSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGE6IHZhbHVlLmEgIT09IHVuZGVmaW5lZCA/IE1hdGgubWluKDI1NSwgTWF0aC5tYXgoMCwgTnVtYmVyKHZhbHVlLmEpKSkgOiAyNTVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0NvbG9yIHZhbHVlIG11c3QgYmUgYW4gb2JqZWN0IHdpdGggciwgZywgYiBwcm9wZXJ0aWVzIG9yIGEgaGV4YWRlY2ltYWwgc3RyaW5nIChlLmcuLCBcIiNGRjAwMDBcIiknKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBjYXNlICd2ZWMyJzpcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvY2Vzc2VkVmFsdWUgPSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHg6IE51bWJlcih2YWx1ZS54KSB8fCAwLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB5OiBOdW1iZXIodmFsdWUueSkgfHwgMFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignVmVjMiB2YWx1ZSBtdXN0IGJlIGFuIG9iamVjdCB3aXRoIHgsIHkgcHJvcGVydGllcycpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ3ZlYzMnOlxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9jZXNzZWRWYWx1ZSA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgeDogTnVtYmVyKHZhbHVlLngpIHx8IDAsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHk6IE51bWJlcih2YWx1ZS55KSB8fCAwLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB6OiBOdW1iZXIodmFsdWUueikgfHwgMFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignVmVjMyB2YWx1ZSBtdXN0IGJlIGFuIG9iamVjdCB3aXRoIHgsIHksIHogcHJvcGVydGllcycpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ3NpemUnOlxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9jZXNzZWRWYWx1ZSA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgd2lkdGg6IE51bWJlcih2YWx1ZS53aWR0aCkgfHwgMCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaGVpZ2h0OiBOdW1iZXIodmFsdWUuaGVpZ2h0KSB8fCAwXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdTaXplIHZhbHVlIG11c3QgYmUgYW4gb2JqZWN0IHdpdGggd2lkdGgsIGhlaWdodCBwcm9wZXJ0aWVzJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgY2FzZSAnbm9kZSc6XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb2Nlc3NlZFZhbHVlID0geyB1dWlkOiB2YWx1ZSB9O1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vZGUgcmVmZXJlbmNlIHZhbHVlIG11c3QgYmUgYSBzdHJpbmcgVVVJRCcpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ2NvbXBvbmVudCc6XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOe7hOS7tuW8leeUqOmcgOimgeeJueauiuWkhOeQhu+8mumAmui/h+iKgueCuVVVSUTmib7liLDnu4Tku7bnmoRfX2lkX19cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9jZXNzZWRWYWx1ZSA9IHZhbHVlOyAvLyDlhYjkv53lrZjoioLngrlVVUlE77yM5ZCO57ut5Lya6L2s5o2i5Li6X19pZF9fXG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignQ29tcG9uZW50IHJlZmVyZW5jZSB2YWx1ZSBtdXN0IGJlIGEgc3RyaW5nIChub2RlIFVVSUQgY29udGFpbmluZyB0aGUgdGFyZ2V0IGNvbXBvbmVudCknKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBjYXNlICdzcHJpdGVGcmFtZSc6XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ3ByZWZhYic6XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ2Fzc2V0JzpcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvY2Vzc2VkVmFsdWUgPSB7IHV1aWQ6IHZhbHVlIH07XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgJHtwcm9wZXJ0eVR5cGV9IHZhbHVlIG11c3QgYmUgYSBzdHJpbmcgVVVJRGApO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ25vZGVBcnJheSc6XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9jZXNzZWRWYWx1ZSA9IHZhbHVlLm1hcCgoaXRlbTogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgaXRlbSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB7IHV1aWQ6IGl0ZW0gfTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignTm9kZUFycmF5IGl0ZW1zIG11c3QgYmUgc3RyaW5nIFVVSURzJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdOb2RlQXJyYXkgdmFsdWUgbXVzdCBiZSBhbiBhcnJheScpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ2NvbG9yQXJyYXknOlxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvY2Vzc2VkVmFsdWUgPSB2YWx1ZS5tYXAoKGl0ZW06IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGl0ZW0gPT09ICdvYmplY3QnICYmIGl0ZW0gIT09IG51bGwgJiYgJ3InIGluIGl0ZW0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcjogTWF0aC5taW4oMjU1LCBNYXRoLm1heCgwLCBOdW1iZXIoaXRlbS5yKSB8fCAwKSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZzogTWF0aC5taW4oMjU1LCBNYXRoLm1heCgwLCBOdW1iZXIoaXRlbS5nKSB8fCAwKSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYjogTWF0aC5taW4oMjU1LCBNYXRoLm1heCgwLCBOdW1iZXIoaXRlbS5iKSB8fCAwKSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYTogaXRlbS5hICE9PSB1bmRlZmluZWQgPyBNYXRoLm1pbigyNTUsIE1hdGgubWF4KDAsIE51bWJlcihpdGVtLmEpKSkgOiAyNTVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4geyByOiAyNTUsIGc6IDI1NSwgYjogMjU1LCBhOiAyNTUgfTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0NvbG9yQXJyYXkgdmFsdWUgbXVzdCBiZSBhbiBhcnJheScpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ251bWJlckFycmF5JzpcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb2Nlc3NlZFZhbHVlID0gdmFsdWUubWFwKChpdGVtOiBhbnkpID0+IE51bWJlcihpdGVtKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignTnVtYmVyQXJyYXkgdmFsdWUgbXVzdCBiZSBhbiBhcnJheScpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ3N0cmluZ0FycmF5JzpcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb2Nlc3NlZFZhbHVlID0gdmFsdWUubWFwKChpdGVtOiBhbnkpID0+IFN0cmluZyhpdGVtKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignU3RyaW5nQXJyYXkgdmFsdWUgbXVzdCBiZSBhbiBhcnJheScpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVuc3VwcG9ydGVkIHByb3BlcnR5IHR5cGU6ICR7cHJvcGVydHlUeXBlfWApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgW0NvbXBvbmVudFRvb2xzXSBDb252ZXJ0aW5nIHZhbHVlOiAke0pTT04uc3RyaW5naWZ5KHZhbHVlKX0gLT4gJHtKU09OLnN0cmluZ2lmeShwcm9jZXNzZWRWYWx1ZSl9ICh0eXBlOiAke3Byb3BlcnR5VHlwZX0pYCk7XG4gICAgICAgICAgICAgICAgZGVidWdMb2coYFtDb21wb25lbnRUb29sc10gUHJvcGVydHkgYW5hbHlzaXMgcmVzdWx0OiBwcm9wZXJ0eUluZm8udHlwZT1cIiR7cHJvcGVydHlJbmZvLnR5cGV9XCIsIHByb3BlcnR5VHlwZT1cIiR7cHJvcGVydHlUeXBlfVwiYCk7XG4gICAgICAgICAgICAgICAgZGVidWdMb2coYFtDb21wb25lbnRUb29sc10gV2lsbCB1c2UgY29sb3Igc3BlY2lhbCBoYW5kbGluZzogJHtwcm9wZXJ0eVR5cGUgPT09ICdjb2xvcicgJiYgcHJvY2Vzc2VkVmFsdWUgJiYgdHlwZW9mIHByb2Nlc3NlZFZhbHVlID09PSAnb2JqZWN0J31gKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAvLyDnlKjkuo7pqozor4HnmoTlrp7pmYXmnJ/mnJvlgLzvvIjlr7nkuo7nu4Tku7blvJXnlKjpnIDopoHnibnmrorlpITnkIbvvIlcbiAgICAgICAgICAgICAgICBsZXQgYWN0dWFsRXhwZWN0ZWRWYWx1ZSA9IHByb2Nlc3NlZFZhbHVlO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIC8vIFN0ZXAgNTog6I635Y+W5Y6f5aeL6IqC54K55pWw5o2u5p2l5p6E5bu65q2j56Gu55qE6Lev5b6EXG4gICAgICAgICAgICAgICAgY29uc3QgcmF3Tm9kZURhdGEgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1ub2RlJywgbm9kZVV1aWQpO1xuICAgICAgICAgICAgICAgIGlmICghcmF3Tm9kZURhdGEgfHwgIXJhd05vZGVEYXRhLl9fY29tcHNfXykge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGBGYWlsZWQgdG8gZ2V0IHJhdyBub2RlIGRhdGEgZm9yIHByb3BlcnR5IHNldHRpbmdgXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIC8vIOaJvuWIsOWOn+Wni+e7hOS7tueahOe0ouW8lVxuICAgICAgICAgICAgICAgIGxldCByYXdDb21wb25lbnRJbmRleCA9IC0xO1xuICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcmF3Tm9kZURhdGEuX19jb21wc19fLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbXAgPSByYXdOb2RlRGF0YS5fX2NvbXBzX19baV0gYXMgYW55O1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjb21wVHlwZSA9IGNvbXAuX190eXBlX18gfHwgY29tcC5jaWQgfHwgY29tcC50eXBlIHx8ICdVbmtub3duJztcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNvbXBUeXBlID09PSBjb21wb25lbnRUeXBlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByYXdDb21wb25lbnRJbmRleCA9IGk7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpZiAocmF3Q29tcG9uZW50SW5kZXggPT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgICAgICBlcnJvcjogYENvdWxkIG5vdCBmaW5kIGNvbXBvbmVudCBpbmRleCBmb3Igc2V0dGluZyBwcm9wZXJ0eWBcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgLy8g5p6E5bu65q2j56Gu55qE5bGe5oCn6Lev5b6EXG4gICAgICAgICAgICAgICAgbGV0IHByb3BlcnR5UGF0aCA9IGBfX2NvbXBzX18uJHtyYXdDb21wb25lbnRJbmRleH0uJHtwcm9wZXJ0eX1gO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIC8vIOeJueauiuWkhOeQhui1hOa6kOexu+WxnuaAp1xuICAgICAgICAgICAgICAgIGlmIChwcm9wZXJ0eVR5cGUgPT09ICdhc3NldCcgfHwgcHJvcGVydHlUeXBlID09PSAnc3ByaXRlRnJhbWUnIHx8IHByb3BlcnR5VHlwZSA9PT0gJ3ByZWZhYicgfHwgXG4gICAgICAgICAgICAgICAgICAgIChwcm9wZXJ0eUluZm8udHlwZSA9PT0gJ2Fzc2V0JyAmJiBwcm9wZXJ0eVR5cGUgPT09ICdzdHJpbmcnKSkge1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYFtDb21wb25lbnRUb29sc10gU2V0dGluZyBhc3NldCByZWZlcmVuY2U6YCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWU6IHByb2Nlc3NlZFZhbHVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgcHJvcGVydHk6IHByb3BlcnR5LFxuICAgICAgICAgICAgICAgICAgICAgICAgcHJvcGVydHlUeXBlOiBwcm9wZXJ0eVR5cGUsXG4gICAgICAgICAgICAgICAgICAgICAgICBwYXRoOiBwcm9wZXJ0eVBhdGhcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAvLyBEZXRlcm1pbmUgYXNzZXQgdHlwZSBiYXNlZCBvbiBwcm9wZXJ0eSBuYW1lXG4gICAgICAgICAgICAgICAgICAgIGxldCBhc3NldFR5cGUgPSAnY2MuU3ByaXRlRnJhbWUnOyAvLyBkZWZhdWx0XG4gICAgICAgICAgICAgICAgICAgIGlmIChwcm9wZXJ0eS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCd0ZXh0dXJlJykpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFzc2V0VHlwZSA9ICdjYy5UZXh0dXJlMkQnO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5LnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ21hdGVyaWFsJykpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFzc2V0VHlwZSA9ICdjYy5NYXRlcmlhbCc7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHkudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnZm9udCcpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhc3NldFR5cGUgPSAnY2MuRm9udCc7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHkudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnY2xpcCcpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhc3NldFR5cGUgPSAnY2MuQXVkaW9DbGlwJztcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eVR5cGUgPT09ICdwcmVmYWInKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhc3NldFR5cGUgPSAnY2MuUHJlZmFiJztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnc2V0LXByb3BlcnR5Jywge1xuICAgICAgICAgICAgICAgICAgICAgICAgdXVpZDogbm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBwYXRoOiBwcm9wZXJ0eVBhdGgsXG4gICAgICAgICAgICAgICAgICAgICAgICBkdW1wOiB7IFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlOiBwcm9jZXNzZWRWYWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiBhc3NldFR5cGVcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChjb21wb25lbnRUeXBlID09PSAnY2MuVUlUcmFuc2Zvcm0nICYmIChwcm9wZXJ0eSA9PT0gJ19jb250ZW50U2l6ZScgfHwgcHJvcGVydHkgPT09ICdjb250ZW50U2l6ZScpKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIFNwZWNpYWwgaGFuZGxpbmcgZm9yIFVJVHJhbnNmb3JtIGNvbnRlbnRTaXplIC0gc2V0IHdpZHRoIGFuZCBoZWlnaHQgc2VwYXJhdGVseVxuICAgICAgICAgICAgICAgICAgICBjb25zdCB3aWR0aCA9IE51bWJlcih2YWx1ZS53aWR0aCkgfHwgMTAwO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBoZWlnaHQgPSBOdW1iZXIodmFsdWUuaGVpZ2h0KSB8fCAxMDA7XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAvLyBTZXQgd2lkdGggZmlyc3RcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnc2V0LXByb3BlcnR5Jywge1xuICAgICAgICAgICAgICAgICAgICAgICAgdXVpZDogbm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBwYXRoOiBgX19jb21wc19fLiR7cmF3Q29tcG9uZW50SW5kZXh9LndpZHRoYCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGR1bXA6IHsgdmFsdWU6IHdpZHRoIH1cbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAvLyBUaGVuIHNldCBoZWlnaHRcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnc2V0LXByb3BlcnR5Jywge1xuICAgICAgICAgICAgICAgICAgICAgICAgdXVpZDogbm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBwYXRoOiBgX19jb21wc19fLiR7cmF3Q29tcG9uZW50SW5kZXh9LmhlaWdodGAsXG4gICAgICAgICAgICAgICAgICAgICAgICBkdW1wOiB7IHZhbHVlOiBoZWlnaHQgfVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGNvbXBvbmVudFR5cGUgPT09ICdjYy5VSVRyYW5zZm9ybScgJiYgKHByb3BlcnR5ID09PSAnX2FuY2hvclBvaW50JyB8fCBwcm9wZXJ0eSA9PT0gJ2FuY2hvclBvaW50JykpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gU3BlY2lhbCBoYW5kbGluZyBmb3IgVUlUcmFuc2Zvcm0gYW5jaG9yUG9pbnQgLSBzZXQgYW5jaG9yWCBhbmQgYW5jaG9yWSBzZXBhcmF0ZWx5XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGFuY2hvclggPSBOdW1iZXIodmFsdWUueCkgfHwgMC41O1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBhbmNob3JZID0gTnVtYmVyKHZhbHVlLnkpIHx8IDAuNTtcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIC8vIFNldCBhbmNob3JYIGZpcnN0XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3NldC1wcm9wZXJ0eScsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IG5vZGVVdWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgcGF0aDogYF9fY29tcHNfXy4ke3Jhd0NvbXBvbmVudEluZGV4fS5hbmNob3JYYCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGR1bXA6IHsgdmFsdWU6IGFuY2hvclggfVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIC8vIFRoZW4gc2V0IGFuY2hvclkgIFxuICAgICAgICAgICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdzZXQtcHJvcGVydHknLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiBub2RlVXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhdGg6IGBfX2NvbXBzX18uJHtyYXdDb21wb25lbnRJbmRleH0uYW5jaG9yWWAsXG4gICAgICAgICAgICAgICAgICAgICAgICBkdW1wOiB7IHZhbHVlOiBhbmNob3JZIH1cbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eVR5cGUgPT09ICdjb2xvcicgJiYgcHJvY2Vzc2VkVmFsdWUgJiYgdHlwZW9mIHByb2Nlc3NlZFZhbHVlID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgICAgICAgICAvLyDnibnmrorlpITnkIbpopzoibLlsZ7mgKfvvIznoa7kv51SR0JB5YC85q2j56GuXG4gICAgICAgICAgICAgICAgICAgIC8vIENvY29zIENyZWF0b3LpopzoibLlgLzojIPlm7TmmK8wLTI1NVxuICAgICAgICAgICAgICAgICAgICBjb25zdCBjb2xvclZhbHVlID0ge1xuICAgICAgICAgICAgICAgICAgICAgICAgcjogTWF0aC5taW4oMjU1LCBNYXRoLm1heCgwLCBOdW1iZXIocHJvY2Vzc2VkVmFsdWUucikgfHwgMCkpLFxuICAgICAgICAgICAgICAgICAgICAgICAgZzogTWF0aC5taW4oMjU1LCBNYXRoLm1heCgwLCBOdW1iZXIocHJvY2Vzc2VkVmFsdWUuZykgfHwgMCkpLFxuICAgICAgICAgICAgICAgICAgICAgICAgYjogTWF0aC5taW4oMjU1LCBNYXRoLm1heCgwLCBOdW1iZXIocHJvY2Vzc2VkVmFsdWUuYikgfHwgMCkpLFxuICAgICAgICAgICAgICAgICAgICAgICAgYTogcHJvY2Vzc2VkVmFsdWUuYSAhPT0gdW5kZWZpbmVkID8gTWF0aC5taW4oMjU1LCBNYXRoLm1heCgwLCBOdW1iZXIocHJvY2Vzc2VkVmFsdWUuYSkpKSA6IDI1NVxuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYFtDb21wb25lbnRUb29sc10gU2V0dGluZyBjb2xvciB2YWx1ZTpgLCBjb2xvclZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3NldC1wcm9wZXJ0eScsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IG5vZGVVdWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgcGF0aDogcHJvcGVydHlQYXRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgZHVtcDogeyBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZTogY29sb3JWYWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiAnY2MuQ29sb3InXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlUeXBlID09PSAndmVjMycgJiYgcHJvY2Vzc2VkVmFsdWUgJiYgdHlwZW9mIHByb2Nlc3NlZFZhbHVlID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgICAgICAgICAvLyDnibnmrorlpITnkIZWZWMz5bGe5oCnXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHZlYzNWYWx1ZSA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHg6IE51bWJlcihwcm9jZXNzZWRWYWx1ZS54KSB8fCAwLFxuICAgICAgICAgICAgICAgICAgICAgICAgeTogTnVtYmVyKHByb2Nlc3NlZFZhbHVlLnkpIHx8IDAsXG4gICAgICAgICAgICAgICAgICAgICAgICB6OiBOdW1iZXIocHJvY2Vzc2VkVmFsdWUueikgfHwgMFxuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnc2V0LXByb3BlcnR5Jywge1xuICAgICAgICAgICAgICAgICAgICAgICAgdXVpZDogbm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBwYXRoOiBwcm9wZXJ0eVBhdGgsXG4gICAgICAgICAgICAgICAgICAgICAgICBkdW1wOiB7IFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlOiB2ZWMzVmFsdWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogJ2NjLlZlYzMnXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlUeXBlID09PSAndmVjMicgJiYgcHJvY2Vzc2VkVmFsdWUgJiYgdHlwZW9mIHByb2Nlc3NlZFZhbHVlID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgICAgICAgICAvLyDnibnmrorlpITnkIZWZWMy5bGe5oCnXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHZlYzJWYWx1ZSA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHg6IE51bWJlcihwcm9jZXNzZWRWYWx1ZS54KSB8fCAwLFxuICAgICAgICAgICAgICAgICAgICAgICAgeTogTnVtYmVyKHByb2Nlc3NlZFZhbHVlLnkpIHx8IDBcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3NldC1wcm9wZXJ0eScsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IG5vZGVVdWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgcGF0aDogcHJvcGVydHlQYXRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgZHVtcDogeyBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZTogdmVjMlZhbHVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6ICdjYy5WZWMyJ1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5VHlwZSA9PT0gJ3NpemUnICYmIHByb2Nlc3NlZFZhbHVlICYmIHR5cGVvZiBwcm9jZXNzZWRWYWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8g54m55q6K5aSE55CGU2l6ZeWxnuaAp1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBzaXplVmFsdWUgPSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB3aWR0aDogTnVtYmVyKHByb2Nlc3NlZFZhbHVlLndpZHRoKSB8fCAwLFxuICAgICAgICAgICAgICAgICAgICAgICAgaGVpZ2h0OiBOdW1iZXIocHJvY2Vzc2VkVmFsdWUuaGVpZ2h0KSB8fCAwXG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdzZXQtcHJvcGVydHknLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiBub2RlVXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhdGg6IHByb3BlcnR5UGF0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGR1bXA6IHsgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWU6IHNpemVWYWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiAnY2MuU2l6ZSdcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eVR5cGUgPT09ICdub2RlJyAmJiBwcm9jZXNzZWRWYWx1ZSAmJiB0eXBlb2YgcHJvY2Vzc2VkVmFsdWUgPT09ICdvYmplY3QnICYmICd1dWlkJyBpbiBwcm9jZXNzZWRWYWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICAvLyDnibnmrorlpITnkIboioLngrnlvJXnlKhcbiAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYFtDb21wb25lbnRUb29sc10gU2V0dGluZyBub2RlIHJlZmVyZW5jZSB3aXRoIFVVSUQ6ICR7cHJvY2Vzc2VkVmFsdWUudXVpZH1gKTtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnc2V0LXByb3BlcnR5Jywge1xuICAgICAgICAgICAgICAgICAgICAgICAgdXVpZDogbm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBwYXRoOiBwcm9wZXJ0eVBhdGgsXG4gICAgICAgICAgICAgICAgICAgICAgICBkdW1wOiB7IFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlOiBwcm9jZXNzZWRWYWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiAnY2MuTm9kZSdcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eVR5cGUgPT09ICdjb21wb25lbnQnICYmIHR5cGVvZiBwcm9jZXNzZWRWYWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8g54m55q6K5aSE55CG57uE5Lu25byV55So77ya6YCa6L+H6IqC54K5VVVJROaJvuWIsOe7hOS7tueahF9faWRfX1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB0YXJnZXROb2RlVXVpZCA9IHByb2Nlc3NlZFZhbHVlO1xuICAgICAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgW0NvbXBvbmVudFRvb2xzXSBTZXR0aW5nIGNvbXBvbmVudCByZWZlcmVuY2UgLSBmaW5kaW5nIGNvbXBvbmVudCBvbiBub2RlOiAke3RhcmdldE5vZGVVdWlkfWApO1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgLy8g5LuO5b2T5YmN57uE5Lu255qE5bGe5oCn5YWD5pWw5o2u5Lit6I635Y+W5pyf5pyb55qE57uE5Lu257G75Z6LXG4gICAgICAgICAgICAgICAgICAgIGxldCBleHBlY3RlZENvbXBvbmVudFR5cGUgPSAnJztcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIC8vIOiOt+WPluW9k+WJjee7hOS7tueahOivpue7huS/oeaBr++8jOWMheaLrOWxnuaAp+WFg+aVsOaNrlxuICAgICAgICAgICAgICAgICAgICBjb25zdCBjdXJyZW50Q29tcG9uZW50SW5mbyA9IGF3YWl0IHRoaXMuZ2V0Q29tcG9uZW50SW5mbyhub2RlVXVpZCwgY29tcG9uZW50VHlwZSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChjdXJyZW50Q29tcG9uZW50SW5mby5zdWNjZXNzICYmIGN1cnJlbnRDb21wb25lbnRJbmZvLmRhdGE/LnByb3BlcnRpZXM/Lltwcm9wZXJ0eV0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHByb3BlcnR5TWV0YSA9IGN1cnJlbnRDb21wb25lbnRJbmZvLmRhdGEucHJvcGVydGllc1twcm9wZXJ0eV07XG4gICAgICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIOS7juWxnuaAp+WFg+aVsOaNruS4reaPkOWPlue7hOS7tuexu+Wei+S/oeaBr1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHByb3BlcnR5TWV0YSAmJiB0eXBlb2YgcHJvcGVydHlNZXRhID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOajgOafpeaYr+WQpuaciXR5cGXlrZfmrrXmjIfnpLrnu4Tku7bnsbvlnotcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAocHJvcGVydHlNZXRhLnR5cGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXhwZWN0ZWRDb21wb25lbnRUeXBlID0gcHJvcGVydHlNZXRhLnR5cGU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eU1ldGEuY3Rvcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDmnInkupvlsZ7mgKflj6/og73kvb/nlKhjdG9y5a2X5q61XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4cGVjdGVkQ29tcG9uZW50VHlwZSA9IHByb3BlcnR5TWV0YS5jdG9yO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlNZXRhLmV4dGVuZHMgJiYgQXJyYXkuaXNBcnJheShwcm9wZXJ0eU1ldGEuZXh0ZW5kcykpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5qOA5p+lZXh0ZW5kc+aVsOe7hO+8jOmAmuW4uOesrOS4gOS4quaYr+acgOWFt+S9k+eahOexu+Wei1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGV4dGVuZFR5cGUgb2YgcHJvcGVydHlNZXRhLmV4dGVuZHMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChleHRlbmRUeXBlLnN0YXJ0c1dpdGgoJ2NjLicpICYmIGV4dGVuZFR5cGUgIT09ICdjYy5Db21wb25lbnQnICYmIGV4dGVuZFR5cGUgIT09ICdjYy5PYmplY3QnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXhwZWN0ZWRDb21wb25lbnRUeXBlID0gZXh0ZW5kVHlwZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFleHBlY3RlZENvbXBvbmVudFR5cGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5hYmxlIHRvIGRldGVybWluZSByZXF1aXJlZCBjb21wb25lbnQgdHlwZSBmb3IgcHJvcGVydHkgJyR7cHJvcGVydHl9JyBvbiBjb21wb25lbnQgJyR7Y29tcG9uZW50VHlwZX0nLiBQcm9wZXJ0eSBtZXRhZGF0YSBtYXkgbm90IGNvbnRhaW4gdHlwZSBpbmZvcm1hdGlvbi5gKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYFtDb21wb25lbnRUb29sc10gRGV0ZWN0ZWQgcmVxdWlyZWQgY29tcG9uZW50IHR5cGU6ICR7ZXhwZWN0ZWRDb21wb25lbnRUeXBlfSBmb3IgcHJvcGVydHk6ICR7cHJvcGVydHl9YCk7XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8g6I635Y+W55uu5qCH6IqC54K555qE57uE5Lu25L+h5oGvXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB0YXJnZXROb2RlRGF0YSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LW5vZGUnLCB0YXJnZXROb2RlVXVpZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXRhcmdldE5vZGVEYXRhIHx8ICF0YXJnZXROb2RlRGF0YS5fX2NvbXBzX18pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFRhcmdldCBub2RlICR7dGFyZ2V0Tm9kZVV1aWR9IG5vdCBmb3VuZCBvciBoYXMgbm8gY29tcG9uZW50c2ApO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyDmiZPljbDnm67moIfoioLngrnnmoTnu4Tku7bmpoLop4hcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlYnVnTG9nKGBbQ29tcG9uZW50VG9vbHNdIFRhcmdldCBub2RlICR7dGFyZ2V0Tm9kZVV1aWR9IGhhcyAke3RhcmdldE5vZGVEYXRhLl9fY29tcHNfXy5sZW5ndGh9IGNvbXBvbmVudHM6YCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB0YXJnZXROb2RlRGF0YS5fX2NvbXBzX18uZm9yRWFjaCgoY29tcDogYW55LCBpbmRleDogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgc2NlbmVJZCA9IGNvbXAudmFsdWUgJiYgY29tcC52YWx1ZS51dWlkICYmIGNvbXAudmFsdWUudXVpZC52YWx1ZSA/IGNvbXAudmFsdWUudXVpZC52YWx1ZSA6ICd1bmtub3duJztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgW0NvbXBvbmVudFRvb2xzXSBDb21wb25lbnQgJHtpbmRleH06ICR7Y29tcC50eXBlfSAoc2NlbmVfaWQ6ICR7c2NlbmVJZH0pYCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAgICAgLy8g5p+l5om+5a+55bqU55qE57uE5Lu2XG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgdGFyZ2V0Q29tcG9uZW50ID0gbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCBjb21wb25lbnRJZDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIOWcqOebruagh+iKgueCueeahF9jb21wb25lbnRz5pWw57uE5Lit5p+l5om+5oyH5a6a57G75Z6L55qE57uE5Lu2XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyDms6jmhI/vvJpfX2NvbXBzX1/lkoxfY29tcG9uZW50c+eahOe0ouW8leaYr+WvueW6lOeahFxuICAgICAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYFtDb21wb25lbnRUb29sc10gU2VhcmNoaW5nIGZvciBjb21wb25lbnQgdHlwZTogJHtleHBlY3RlZENvbXBvbmVudFR5cGV9YCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGFyZ2V0Tm9kZURhdGEuX19jb21wc19fLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY29tcCA9IHRhcmdldE5vZGVEYXRhLl9fY29tcHNfX1tpXSBhcyBhbnk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYFtDb21wb25lbnRUb29sc10gQ2hlY2tpbmcgY29tcG9uZW50ICR7aX06IHR5cGU9JHtjb21wLnR5cGV9LCB0YXJnZXQ9JHtleHBlY3RlZENvbXBvbmVudFR5cGV9YCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNvbXAudHlwZSA9PT0gZXhwZWN0ZWRDb21wb25lbnRUeXBlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRhcmdldENvbXBvbmVudCA9IGNvbXA7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlYnVnTG9nKGBbQ29tcG9uZW50VG9vbHNdIEZvdW5kIG1hdGNoaW5nIGNvbXBvbmVudCBhdCBpbmRleCAke2l9OiAke2NvbXAudHlwZX1gKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOS7jue7hOS7tueahHZhbHVlLnV1aWQudmFsdWXkuK3ojrflj5bnu4Tku7blnKjlnLrmma/kuK3nmoRJRFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoY29tcC52YWx1ZSAmJiBjb21wLnZhbHVlLnV1aWQgJiYgY29tcC52YWx1ZS51dWlkLnZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRJZCA9IGNvbXAudmFsdWUudXVpZC52YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlYnVnTG9nKGBbQ29tcG9uZW50VG9vbHNdIEdvdCBjb21wb25lbnRJZCBmcm9tIGNvbXAudmFsdWUudXVpZC52YWx1ZTogJHtjb21wb25lbnRJZH1gKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlYnVnTG9nKGBbQ29tcG9uZW50VG9vbHNdIENvbXBvbmVudCBzdHJ1Y3R1cmU6YCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGhhc1ZhbHVlOiAhIWNvbXAudmFsdWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaGFzVXVpZDogISEoY29tcC52YWx1ZSAmJiBjb21wLnZhbHVlLnV1aWQpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGhhc1V1aWRWYWx1ZTogISEoY29tcC52YWx1ZSAmJiBjb21wLnZhbHVlLnV1aWQgJiYgY29tcC52YWx1ZS51dWlkLnZhbHVlKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB1dWlkU3RydWN0dXJlOiBjb21wLnZhbHVlID8gY29tcC52YWx1ZS51dWlkIDogJ05vIHZhbHVlJ1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVuYWJsZSB0byBleHRyYWN0IGNvbXBvbmVudCBJRCBmcm9tIGNvbXBvbmVudCBzdHJ1Y3R1cmVgKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXRhcmdldENvbXBvbmVudCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOWmguaenOayoeaJvuWIsO+8jOWIl+WHuuWPr+eUqOe7hOS7tuiuqeeUqOaIt+S6huino++8jOaYvuekuuWcuuaZr+S4reeahOecn+WunklEXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgYXZhaWxhYmxlQ29tcG9uZW50cyA9IHRhcmdldE5vZGVEYXRhLl9fY29tcHNfXy5tYXAoKGNvbXA6IGFueSwgaW5kZXg6IG51bWJlcikgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsZXQgc2NlbmVJZCA9ICd1bmtub3duJztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5LuO57uE5Lu255qEdmFsdWUudXVpZC52YWx1ZeiOt+WPluWcuuaZr0lEXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjb21wLnZhbHVlICYmIGNvbXAudmFsdWUudXVpZCAmJiBjb21wLnZhbHVlLnV1aWQudmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNjZW5lSWQgPSBjb21wLnZhbHVlLnV1aWQudmFsdWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGAke2NvbXAudHlwZX0oc2NlbmVfaWQ6JHtzY2VuZUlkfSlgO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgQ29tcG9uZW50IHR5cGUgJyR7ZXhwZWN0ZWRDb21wb25lbnRUeXBlfScgbm90IGZvdW5kIG9uIG5vZGUgJHt0YXJnZXROb2RlVXVpZH0uIEF2YWlsYWJsZSBjb21wb25lbnRzOiAke2F2YWlsYWJsZUNvbXBvbmVudHMuam9pbignLCAnKX1gKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYFtDb21wb25lbnRUb29sc10gRm91bmQgY29tcG9uZW50ICR7ZXhwZWN0ZWRDb21wb25lbnRUeXBlfSB3aXRoIHNjZW5lIElEOiAke2NvbXBvbmVudElkfSBvbiBub2RlICR7dGFyZ2V0Tm9kZVV1aWR9YCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIOabtOaWsOacn+acm+WAvOS4uuWunumZheeahOe7hOS7tklE5a+56LGh5qC85byP77yM55So5LqO5ZCO57ut6aqM6K+BXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoY29tcG9uZW50SWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBhY3R1YWxFeHBlY3RlZFZhbHVlID0geyB1dWlkOiBjb21wb25lbnRJZCB9O1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyDlsJ3or5Xkvb/nlKjkuI7oioLngrkv6LWE5rqQ5byV55So55u45ZCM55qE5qC85byP77yae3V1aWQ6IGNvbXBvbmVudElkfVxuICAgICAgICAgICAgICAgICAgICAgICAgLy8g5rWL6K+V55yL5piv5ZCm6IO95q2j56Gu6K6+572u57uE5Lu25byV55SoXG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdzZXQtcHJvcGVydHknLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdXVpZDogbm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcGF0aDogcHJvcGVydHlQYXRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGR1bXA6IHsgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlOiB7IHV1aWQ6IGNvbXBvbmVudElkIH0sICAvLyDkvb/nlKjlr7nosaHmoLzlvI/vvIzlg4/oioLngrkv6LWE5rqQ5byV55So5LiA5qC3XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6IGV4cGVjdGVkQ29tcG9uZW50VHlwZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBbQ29tcG9uZW50VG9vbHNdIEVycm9yIHNldHRpbmcgY29tcG9uZW50IHJlZmVyZW5jZTpgLCBlcnJvcik7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlUeXBlID09PSAnbm9kZUFycmF5JyAmJiBBcnJheS5pc0FycmF5KHByb2Nlc3NlZFZhbHVlKSkge1xuICAgICAgICAgICAgICAgICAgICAvLyDnibnmrorlpITnkIboioLngrnmlbDnu4QgLSDkv53mjIHpooTlpITnkIbnmoTmoLzlvI9cbiAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYFtDb21wb25lbnRUb29sc10gU2V0dGluZyBub2RlIGFycmF5OmAsIHByb2Nlc3NlZFZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3NldC1wcm9wZXJ0eScsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IG5vZGVVdWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgcGF0aDogcHJvcGVydHlQYXRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgZHVtcDogeyBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZTogcHJvY2Vzc2VkVmFsdWUgIC8vIOS/neaMgSBbe3V1aWQ6IFwiLi4uXCJ9LCB7dXVpZDogXCIuLi5cIn1dIOagvOW8j1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5VHlwZSA9PT0gJ2NvbG9yQXJyYXknICYmIEFycmF5LmlzQXJyYXkocHJvY2Vzc2VkVmFsdWUpKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIOeJueauiuWkhOeQhuminOiJsuaVsOe7hFxuICAgICAgICAgICAgICAgICAgICBjb25zdCBjb2xvckFycmF5VmFsdWUgPSBwcm9jZXNzZWRWYWx1ZS5tYXAoKGl0ZW06IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGl0ZW0gJiYgdHlwZW9mIGl0ZW0gPT09ICdvYmplY3QnICYmICdyJyBpbiBpdGVtKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcjogTWF0aC5taW4oMjU1LCBNYXRoLm1heCgwLCBOdW1iZXIoaXRlbS5yKSB8fCAwKSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGc6IE1hdGgubWluKDI1NSwgTWF0aC5tYXgoMCwgTnVtYmVyKGl0ZW0uZykgfHwgMCkpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBiOiBNYXRoLm1pbigyNTUsIE1hdGgubWF4KDAsIE51bWJlcihpdGVtLmIpIHx8IDApKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYTogaXRlbS5hICE9PSB1bmRlZmluZWQgPyBNYXRoLm1pbigyNTUsIE1hdGgubWF4KDAsIE51bWJlcihpdGVtLmEpKSkgOiAyNTVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4geyByOiAyNTUsIGc6IDI1NSwgYjogMjU1LCBhOiAyNTUgfTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdzZXQtcHJvcGVydHknLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiBub2RlVXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhdGg6IHByb3BlcnR5UGF0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGR1bXA6IHsgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWU6IGNvbG9yQXJyYXlWYWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiAnY2MuQ29sb3InXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIE5vcm1hbCBwcm9wZXJ0eSBzZXR0aW5nIGZvciBub24tYXNzZXQgcHJvcGVydGllc1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdzZXQtcHJvcGVydHknLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiBub2RlVXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhdGg6IHByb3BlcnR5UGF0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGR1bXA6IHsgdmFsdWU6IHByb2Nlc3NlZFZhbHVlIH1cbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIC8vIFN0ZXAgNTog562J5b6FRWRpdG9y5a6M5oiQ5pu05paw77yM54S25ZCO6aqM6K+B6K6+572u57uT5p6cXG4gICAgICAgICAgICAgICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDIwMCkpOyAvLyDnrYnlvoUyMDBtc+iuqUVkaXRvcuWujOaIkOabtOaWsFxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGNvbnN0IHZlcmlmaWNhdGlvbiA9IGF3YWl0IHRoaXMudmVyaWZ5UHJvcGVydHlDaGFuZ2Uobm9kZVV1aWQsIGNvbXBvbmVudFR5cGUsIHByb3BlcnR5LCBvcmlnaW5hbFZhbHVlLCBhY3R1YWxFeHBlY3RlZFZhbHVlKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYFN1Y2Nlc3NmdWxseSBzZXQgJHtjb21wb25lbnRUeXBlfS4ke3Byb3BlcnR5fWAsXG4gICAgICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG5vZGVVdWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50VHlwZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHByb3BlcnR5LFxuICAgICAgICAgICAgICAgICAgICAgICAgYWN0dWFsVmFsdWU6IHZlcmlmaWNhdGlvbi5hY3R1YWxWYWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNoYW5nZVZlcmlmaWVkOiB2ZXJpZmljYXRpb24udmVyaWZpZWRcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYFtDb21wb25lbnRUb29sc10gRXJyb3Igc2V0dGluZyBwcm9wZXJ0eTpgLCBlcnJvcik7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICBlcnJvcjogYEZhaWxlZCB0byBzZXQgcHJvcGVydHk6ICR7ZXJyb3IubWVzc2FnZX1gXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuXG4gICAgcHJpdmF0ZSBhc3luYyBhdHRhY2hTY3JpcHQobm9kZVV1aWQ6IHN0cmluZywgc2NyaXB0UGF0aDogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKGFzeW5jIChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICAvLyDku47ohJrmnKzot6/lvoTmj5Dlj5bnu4Tku7bnsbvlkI1cbiAgICAgICAgICAgIGNvbnN0IHNjcmlwdE5hbWUgPSBzY3JpcHRQYXRoLnNwbGl0KCcvJykucG9wKCk/LnJlcGxhY2UoJy50cycsICcnKS5yZXBsYWNlKCcuanMnLCAnJyk7XG4gICAgICAgICAgICBpZiAoIXNjcmlwdE5hbWUpIHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnSW52YWxpZCBzY3JpcHQgcGF0aCcgfSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8g5YWI5p+l5om+6IqC54K55LiK5piv5ZCm5bey5a2Y5Zyo6K+l6ISa5pys57uE5Lu2XG4gICAgICAgICAgICBjb25zdCBhbGxDb21wb25lbnRzSW5mbyA9IGF3YWl0IHRoaXMuZ2V0Q29tcG9uZW50cyhub2RlVXVpZCk7XG4gICAgICAgICAgICBpZiAoYWxsQ29tcG9uZW50c0luZm8uc3VjY2VzcyAmJiBhbGxDb21wb25lbnRzSW5mby5kYXRhPy5jb21wb25lbnRzKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZXhpc3RpbmdTY3JpcHQgPSBhbGxDb21wb25lbnRzSW5mby5kYXRhLmNvbXBvbmVudHMuZmluZCgoY29tcDogYW55KSA9PiBjb21wLnR5cGUgPT09IHNjcmlwdE5hbWUpO1xuICAgICAgICAgICAgICAgIGlmIChleGlzdGluZ1NjcmlwdCkge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgU2NyaXB0ICcke3NjcmlwdE5hbWV9JyBhbHJlYWR5IGV4aXN0cyBvbiBub2RlYCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBub2RlVXVpZDogbm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50TmFtZTogc2NyaXB0TmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBleGlzdGluZzogdHJ1ZVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIOmmluWFiOWwneivleebtOaOpeS9v+eUqOiEmuacrOWQjeensOS9nOS4uue7hOS7tuexu+Wei1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnY3JlYXRlLWNvbXBvbmVudCcsIHtcbiAgICAgICAgICAgICAgICB1dWlkOiBub2RlVXVpZCxcbiAgICAgICAgICAgICAgICBjb21wb25lbnQ6IHNjcmlwdE5hbWUgIC8vIOS9v+eUqOiEmuacrOWQjeensOiAjOmdnlVVSURcbiAgICAgICAgICAgIH0pLnRoZW4oYXN5bmMgKHJlc3VsdDogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgLy8g562J5b6F5LiA5q615pe26Ze06K6pRWRpdG9y5a6M5oiQ57uE5Lu25re75YqgXG4gICAgICAgICAgICAgICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDEwMCkpO1xuICAgICAgICAgICAgICAgIC8vIOmHjeaWsOafpeivouiKgueCueS/oeaBr+mqjOivgeiEmuacrOaYr+WQpuecn+eahOa3u+WKoOaIkOWKn1xuICAgICAgICAgICAgICAgIGNvbnN0IGFsbENvbXBvbmVudHNJbmZvMiA9IGF3YWl0IHRoaXMuZ2V0Q29tcG9uZW50cyhub2RlVXVpZCk7XG4gICAgICAgICAgICAgICAgaWYgKGFsbENvbXBvbmVudHNJbmZvMi5zdWNjZXNzICYmIGFsbENvbXBvbmVudHNJbmZvMi5kYXRhPy5jb21wb25lbnRzKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGFkZGVkU2NyaXB0ID0gYWxsQ29tcG9uZW50c0luZm8yLmRhdGEuY29tcG9uZW50cy5maW5kKChjb21wOiBhbnkpID0+IGNvbXAudHlwZSA9PT0gc2NyaXB0TmFtZSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChhZGRlZFNjcmlwdCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgU2NyaXB0ICcke3NjcmlwdE5hbWV9JyBhdHRhY2hlZCBzdWNjZXNzZnVsbHlgLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWQ6IG5vZGVVdWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb21wb25lbnROYW1lOiBzY3JpcHROYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBleGlzdGluZzogZmFsc2VcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yOiBgU2NyaXB0ICcke3NjcmlwdE5hbWV9JyB3YXMgbm90IGZvdW5kIG9uIG5vZGUgYWZ0ZXIgYWRkaXRpb24uIEF2YWlsYWJsZSBjb21wb25lbnRzOiAke2FsbENvbXBvbmVudHNJbmZvMi5kYXRhLmNvbXBvbmVudHMubWFwKChjOiBhbnkpID0+IGMudHlwZSkuam9pbignLCAnKX1gXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgICAgICBlcnJvcjogYEZhaWxlZCB0byB2ZXJpZnkgc2NyaXB0IGFkZGl0aW9uOiAke2FsbENvbXBvbmVudHNJbmZvMi5lcnJvciB8fCAnVW5hYmxlIHRvIGdldCBub2RlIGNvbXBvbmVudHMnfWBcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICAvLyDlpIfnlKjmlrnmoYjvvJrkvb/nlKjlnLrmma/ohJrmnKxcbiAgICAgICAgICAgICAgICBjb25zdCBvcHRpb25zID0ge1xuICAgICAgICAgICAgICAgICAgICBuYW1lOiAnY29jb3MtbWNwLXNlcnZlcicsXG4gICAgICAgICAgICAgICAgICAgIG1ldGhvZDogJ2F0dGFjaFNjcmlwdCcsXG4gICAgICAgICAgICAgICAgICAgIGFyZ3M6IFtub2RlVXVpZCwgc2NyaXB0UGF0aF1cbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ2V4ZWN1dGUtc2NlbmUtc2NyaXB0Jywgb3B0aW9ucykudGhlbigocmVzdWx0OiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgICAgICAgIH0pLmNhdGNoKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7IFxuICAgICAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsIFxuICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGBGYWlsZWQgdG8gYXR0YWNoIHNjcmlwdCAnJHtzY3JpcHROYW1lfSc6ICR7ZXJyLm1lc3NhZ2V9YCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGluc3RydWN0aW9uOiAnUGxlYXNlIGVuc3VyZSB0aGUgc2NyaXB0IGlzIHByb3Blcmx5IGNvbXBpbGVkIGFuZCBleHBvcnRlZCBhcyBhIENvbXBvbmVudCBjbGFzcy4gWW91IGNhbiBhbHNvIG1hbnVhbGx5IGF0dGFjaCB0aGUgc2NyaXB0IHRocm91Z2ggdGhlIFByb3BlcnRpZXMgcGFuZWwgaW4gdGhlIGVkaXRvci4nXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2V0QXZhaWxhYmxlQ29tcG9uZW50cyhjYXRlZ29yeTogc3RyaW5nID0gJ2FsbCcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBjb21wb25lbnRDYXRlZ29yaWVzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmdbXT4gPSB7XG4gICAgICAgICAgICByZW5kZXJlcjogWydjYy5TcHJpdGUnLCAnY2MuTGFiZWwnLCAnY2MuUmljaFRleHQnLCAnY2MuTWFzaycsICdjYy5HcmFwaGljcyddLFxuICAgICAgICAgICAgdWk6IFsnY2MuQnV0dG9uJywgJ2NjLlRvZ2dsZScsICdjYy5TbGlkZXInLCAnY2MuU2Nyb2xsVmlldycsICdjYy5FZGl0Qm94JywgJ2NjLlByb2dyZXNzQmFyJ10sXG4gICAgICAgICAgICBwaHlzaWNzOiBbJ2NjLlJpZ2lkQm9keTJEJywgJ2NjLkJveENvbGxpZGVyMkQnLCAnY2MuQ2lyY2xlQ29sbGlkZXIyRCcsICdjYy5Qb2x5Z29uQ29sbGlkZXIyRCddLFxuICAgICAgICAgICAgYW5pbWF0aW9uOiBbJ2NjLkFuaW1hdGlvbicsICdjYy5BbmltYXRpb25DbGlwJywgJ2NjLlNrZWxldGFsQW5pbWF0aW9uJ10sXG4gICAgICAgICAgICBhdWRpbzogWydjYy5BdWRpb1NvdXJjZSddLFxuICAgICAgICAgICAgbGF5b3V0OiBbJ2NjLkxheW91dCcsICdjYy5XaWRnZXQnLCAnY2MuUGFnZVZpZXcnLCAnY2MuUGFnZVZpZXdJbmRpY2F0b3InXSxcbiAgICAgICAgICAgIGVmZmVjdHM6IFsnY2MuTW90aW9uU3RyZWFrJywgJ2NjLlBhcnRpY2xlU3lzdGVtMkQnXSxcbiAgICAgICAgICAgIGNhbWVyYTogWydjYy5DYW1lcmEnXSxcbiAgICAgICAgICAgIGxpZ2h0OiBbJ2NjLkxpZ2h0JywgJ2NjLkRpcmVjdGlvbmFsTGlnaHQnLCAnY2MuUG9pbnRMaWdodCcsICdjYy5TcG90TGlnaHQnXVxuICAgICAgICB9O1xuXG4gICAgICAgIGxldCBjb21wb25lbnRzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICBcbiAgICAgICAgaWYgKGNhdGVnb3J5ID09PSAnYWxsJykge1xuICAgICAgICAgICAgZm9yIChjb25zdCBjYXQgaW4gY29tcG9uZW50Q2F0ZWdvcmllcykge1xuICAgICAgICAgICAgICAgIGNvbXBvbmVudHMgPSBjb21wb25lbnRzLmNvbmNhdChjb21wb25lbnRDYXRlZ29yaWVzW2NhdF0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKGNvbXBvbmVudENhdGVnb3JpZXNbY2F0ZWdvcnldKSB7XG4gICAgICAgICAgICBjb21wb25lbnRzID0gY29tcG9uZW50Q2F0ZWdvcmllc1tjYXRlZ29yeV07XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICBjYXRlZ29yeTogY2F0ZWdvcnksXG4gICAgICAgICAgICAgICAgY29tcG9uZW50czogY29tcG9uZW50c1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgIH1cblxuICAgIHByaXZhdGUgaXNWYWxpZFByb3BlcnR5RGVzY3JpcHRvcihwcm9wRGF0YTogYW55KTogYm9vbGVhbiB7XG4gICAgICAgIC8vIOajgOafpeaYr+WQpuaYr+acieaViOeahOWxnuaAp+aPj+i/sOWvueixoVxuICAgICAgICBpZiAodHlwZW9mIHByb3BEYXRhICE9PSAnb2JqZWN0JyB8fCBwcm9wRGF0YSA9PT0gbnVsbCkge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3Qga2V5cyA9IE9iamVjdC5rZXlzKHByb3BEYXRhKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8g6YG/5YWN6YGN5Y6G566A5Y2V55qE5pWw5YC85a+56LGh77yI5aaCIHt3aWR0aDogMjAwLCBoZWlnaHQ6IDE1MH3vvIlcbiAgICAgICAgICAgIGNvbnN0IGlzU2ltcGxlVmFsdWVPYmplY3QgPSBrZXlzLmV2ZXJ5KGtleSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgdmFsdWUgPSBwcm9wRGF0YVtrZXldO1xuICAgICAgICAgICAgICAgIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInIHx8IHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgfHwgdHlwZW9mIHZhbHVlID09PSAnYm9vbGVhbic7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgaWYgKGlzU2ltcGxlVmFsdWVPYmplY3QpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIOajgOafpeaYr+WQpuWMheWQq+WxnuaAp+aPj+i/sOespueahOeJueW+geWtl+aute+8jOS4jeS9v+eUqCdpbifmk43kvZznrKZcbiAgICAgICAgICAgIGNvbnN0IGhhc05hbWUgPSBrZXlzLmluY2x1ZGVzKCduYW1lJyk7XG4gICAgICAgICAgICBjb25zdCBoYXNWYWx1ZSA9IGtleXMuaW5jbHVkZXMoJ3ZhbHVlJyk7XG4gICAgICAgICAgICBjb25zdCBoYXNUeXBlID0ga2V5cy5pbmNsdWRlcygndHlwZScpO1xuICAgICAgICAgICAgY29uc3QgaGFzRGlzcGxheU5hbWUgPSBrZXlzLmluY2x1ZGVzKCdkaXNwbGF5TmFtZScpO1xuICAgICAgICAgICAgY29uc3QgaGFzUmVhZG9ubHkgPSBrZXlzLmluY2x1ZGVzKCdyZWFkb25seScpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyDlv4XpobvljIXlkKtuYW1l5oiWdmFsdWXlrZfmrrXvvIzkuJTpgJrluLjov5jmnIl0eXBl5a2X5q61XG4gICAgICAgICAgICBjb25zdCBoYXNWYWxpZFN0cnVjdHVyZSA9IChoYXNOYW1lIHx8IGhhc1ZhbHVlKSAmJiAoaGFzVHlwZSB8fCBoYXNEaXNwbGF5TmFtZSB8fCBoYXNSZWFkb25seSk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIOmineWkluajgOafpe+8muWmguaenOaciWRlZmF1bHTlrZfmrrXkuJTnu5PmnoTlpI3mnYLvvIzpgb/lhY3mt7HluqbpgY3ljoZcbiAgICAgICAgICAgIGlmIChrZXlzLmluY2x1ZGVzKCdkZWZhdWx0JykgJiYgcHJvcERhdGEuZGVmYXVsdCAmJiB0eXBlb2YgcHJvcERhdGEuZGVmYXVsdCA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBkZWZhdWx0S2V5cyA9IE9iamVjdC5rZXlzKHByb3BEYXRhLmRlZmF1bHQpO1xuICAgICAgICAgICAgICAgIGlmIChkZWZhdWx0S2V5cy5pbmNsdWRlcygndmFsdWUnKSAmJiB0eXBlb2YgcHJvcERhdGEuZGVmYXVsdC52YWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8g6L+Z56eN5oOF5Ya15LiL77yM5oiR5Lus5Y+q6L+U5Zue6aG25bGC5bGe5oCn77yM5LiN5rex5YWl6YGN5Y6GZGVmYXVsdC52YWx1ZVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gaGFzVmFsaWRTdHJ1Y3R1cmU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICByZXR1cm4gaGFzVmFsaWRTdHJ1Y3R1cmU7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oYFtpc1ZhbGlkUHJvcGVydHlEZXNjcmlwdG9yXSBFcnJvciBjaGVja2luZyBwcm9wZXJ0eSBkZXNjcmlwdG9yOmAsIGVycm9yKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYW5hbHl6ZVByb3BlcnR5KGNvbXBvbmVudDogYW55LCBwcm9wZXJ0eU5hbWU6IHN0cmluZyk6IHsgZXhpc3RzOiBib29sZWFuOyB0eXBlOiBzdHJpbmc7IGF2YWlsYWJsZVByb3BlcnRpZXM6IHN0cmluZ1tdOyBvcmlnaW5hbFZhbHVlOiBhbnkgfSB7XG4gICAgICAgIC8vIOS7juWkjeadgueahOe7hOS7tue7k+aehOS4reaPkOWPluWPr+eUqOWxnuaAp1xuICAgICAgICBjb25zdCBhdmFpbGFibGVQcm9wZXJ0aWVzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICBsZXQgcHJvcGVydHlWYWx1ZTogYW55ID0gdW5kZWZpbmVkO1xuICAgICAgICBsZXQgcHJvcGVydHlFeGlzdHMgPSBmYWxzZTtcbiAgICAgICAgXG4gICAgICAgIC8vIOWwneivleWkmuenjeaWueW8j+afpeaJvuWxnuaAp++8mlxuICAgICAgICAvLyAxLiDnm7TmjqXlsZ7mgKforr/pl65cbiAgICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChjb21wb25lbnQsIHByb3BlcnR5TmFtZSkpIHtcbiAgICAgICAgICAgIHByb3BlcnR5VmFsdWUgPSBjb21wb25lbnRbcHJvcGVydHlOYW1lXTtcbiAgICAgICAgICAgIHByb3BlcnR5RXhpc3RzID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgLy8gMi4g5LuO5bWM5aWX57uT5p6E5Lit5p+l5om+ICjlpoLku47mtYvor5XmlbDmja7nnIvliLDnmoTlpI3mnYLnu5PmnoQpXG4gICAgICAgIGlmICghcHJvcGVydHlFeGlzdHMgJiYgY29tcG9uZW50LnByb3BlcnRpZXMgJiYgdHlwZW9mIGNvbXBvbmVudC5wcm9wZXJ0aWVzID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgLy8g6aaW5YWI5qOA5p+lcHJvcGVydGllcy52YWx1ZeaYr+WQpuWtmOWcqO+8iOi/meaYr+aIkeS7rOWcqGdldENvbXBvbmVudHPkuK3nnIvliLDnmoTnu5PmnoTvvIlcbiAgICAgICAgICAgIGlmIChjb21wb25lbnQucHJvcGVydGllcy52YWx1ZSAmJiB0eXBlb2YgY29tcG9uZW50LnByb3BlcnRpZXMudmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdmFsdWVPYmogPSBjb21wb25lbnQucHJvcGVydGllcy52YWx1ZTtcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IFtrZXksIHByb3BEYXRhXSBvZiBPYmplY3QuZW50cmllcyh2YWx1ZU9iaikpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8g5qOA5p+lcHJvcERhdGHmmK/lkKbmmK/kuIDkuKrmnInmlYjnmoTlsZ7mgKfmj4/ov7Dlr7nosaFcbiAgICAgICAgICAgICAgICAgICAgLy8g56Gu5L+dcHJvcERhdGHmmK/lr7nosaHkuJTljIXlkKvpooTmnJ/nmoTlsZ7mgKfnu5PmnoRcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuaXNWYWxpZFByb3BlcnR5RGVzY3JpcHRvcihwcm9wRGF0YSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHByb3BJbmZvID0gcHJvcERhdGEgYXMgYW55O1xuICAgICAgICAgICAgICAgICAgICAgICAgYXZhaWxhYmxlUHJvcGVydGllcy5wdXNoKGtleSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoa2V5ID09PSBwcm9wZXJ0eU5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDkvJjlhYjkvb/nlKh2YWx1ZeWxnuaAp++8jOWmguaenOayoeacieWImeS9v+eUqHByb3BEYXRh5pys6LqrXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcHJvcEtleXMgPSBPYmplY3Qua2V5cyhwcm9wSW5mbyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb3BlcnR5VmFsdWUgPSBwcm9wS2V5cy5pbmNsdWRlcygndmFsdWUnKSA/IHByb3BJbmZvLnZhbHVlIDogcHJvcEluZm87XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5aaC5p6c5qOA5p+l5aSx6LSl77yM55u05o6l5L2/55SocHJvcEluZm9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvcGVydHlWYWx1ZSA9IHByb3BJbmZvO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0eUV4aXN0cyA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIOWkh+eUqOaWueahiO+8muebtOaOpeS7jnByb3BlcnRpZXPmn6Xmib5cbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IFtrZXksIHByb3BEYXRhXSBvZiBPYmplY3QuZW50cmllcyhjb21wb25lbnQucHJvcGVydGllcykpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuaXNWYWxpZFByb3BlcnR5RGVzY3JpcHRvcihwcm9wRGF0YSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHByb3BJbmZvID0gcHJvcERhdGEgYXMgYW55O1xuICAgICAgICAgICAgICAgICAgICAgICAgYXZhaWxhYmxlUHJvcGVydGllcy5wdXNoKGtleSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoa2V5ID09PSBwcm9wZXJ0eU5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDkvJjlhYjkvb/nlKh2YWx1ZeWxnuaAp++8jOWmguaenOayoeacieWImeS9v+eUqHByb3BEYXRh5pys6LqrXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcHJvcEtleXMgPSBPYmplY3Qua2V5cyhwcm9wSW5mbyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb3BlcnR5VmFsdWUgPSBwcm9wS2V5cy5pbmNsdWRlcygndmFsdWUnKSA/IHByb3BJbmZvLnZhbHVlIDogcHJvcEluZm87XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5aaC5p6c5qOA5p+l5aSx6LSl77yM55u05o6l5L2/55SocHJvcEluZm9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvcGVydHlWYWx1ZSA9IHByb3BJbmZvO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0eUV4aXN0cyA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vIDMuIOS7juebtOaOpeWxnuaAp+S4reaPkOWPlueugOWNleWxnuaAp+WQjVxuICAgICAgICBpZiAoYXZhaWxhYmxlUHJvcGVydGllcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKGNvbXBvbmVudCkpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWtleS5zdGFydHNXaXRoKCdfJykgJiYgIVsnX190eXBlX18nLCAnY2lkJywgJ25vZGUnLCAndXVpZCcsICduYW1lJywgJ2VuYWJsZWQnLCAndHlwZScsICdyZWFkb25seScsICd2aXNpYmxlJ10uaW5jbHVkZXMoa2V5KSkge1xuICAgICAgICAgICAgICAgICAgICBhdmFpbGFibGVQcm9wZXJ0aWVzLnB1c2goa2V5KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGlmICghcHJvcGVydHlFeGlzdHMpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgZXhpc3RzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICB0eXBlOiAndW5rbm93bicsXG4gICAgICAgICAgICAgICAgYXZhaWxhYmxlUHJvcGVydGllcyxcbiAgICAgICAgICAgICAgICBvcmlnaW5hbFZhbHVlOiB1bmRlZmluZWRcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGxldCB0eXBlID0gJ3Vua25vd24nO1xuICAgICAgICBcbiAgICAgICAgLy8g5pm66IO957G75Z6L5qOA5rWLXG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KHByb3BlcnR5VmFsdWUpKSB7XG4gICAgICAgICAgICAvLyDmlbDnu4Tnsbvlnovmo4DmtYtcbiAgICAgICAgICAgIGlmIChwcm9wZXJ0eU5hbWUudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnbm9kZScpKSB7XG4gICAgICAgICAgICAgICAgdHlwZSA9ICdub2RlQXJyYXknO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eU5hbWUudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnY29sb3InKSkge1xuICAgICAgICAgICAgICAgIHR5cGUgPSAnY29sb3JBcnJheSc7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHR5cGUgPSAnYXJyYXknO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBwcm9wZXJ0eVZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgLy8gQ2hlY2sgaWYgcHJvcGVydHkgbmFtZSBzdWdnZXN0cyBpdCdzIGFuIGFzc2V0XG4gICAgICAgICAgICBpZiAoWydzcHJpdGVGcmFtZScsICd0ZXh0dXJlJywgJ21hdGVyaWFsJywgJ2ZvbnQnLCAnY2xpcCcsICdwcmVmYWInXS5pbmNsdWRlcyhwcm9wZXJ0eU5hbWUudG9Mb3dlckNhc2UoKSkpIHtcbiAgICAgICAgICAgICAgICB0eXBlID0gJ2Fzc2V0JztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdHlwZSA9ICdzdHJpbmcnO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBwcm9wZXJ0eVZhbHVlID09PSAnbnVtYmVyJykge1xuICAgICAgICAgICAgdHlwZSA9ICdudW1iZXInO1xuICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBwcm9wZXJ0eVZhbHVlID09PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICAgIHR5cGUgPSAnYm9vbGVhbic7XG4gICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlWYWx1ZSAmJiB0eXBlb2YgcHJvcGVydHlWYWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3Qga2V5cyA9IE9iamVjdC5rZXlzKHByb3BlcnR5VmFsdWUpO1xuICAgICAgICAgICAgICAgIGlmIChrZXlzLmluY2x1ZGVzKCdyJykgJiYga2V5cy5pbmNsdWRlcygnZycpICYmIGtleXMuaW5jbHVkZXMoJ2InKSkge1xuICAgICAgICAgICAgICAgICAgICB0eXBlID0gJ2NvbG9yJztcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGtleXMuaW5jbHVkZXMoJ3gnKSAmJiBrZXlzLmluY2x1ZGVzKCd5JykpIHtcbiAgICAgICAgICAgICAgICAgICAgdHlwZSA9IHByb3BlcnR5VmFsdWUueiAhPT0gdW5kZWZpbmVkID8gJ3ZlYzMnIDogJ3ZlYzInO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoa2V5cy5pbmNsdWRlcygnd2lkdGgnKSAmJiBrZXlzLmluY2x1ZGVzKCdoZWlnaHQnKSkge1xuICAgICAgICAgICAgICAgICAgICB0eXBlID0gJ3NpemUnO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoa2V5cy5pbmNsdWRlcygndXVpZCcpIHx8IGtleXMuaW5jbHVkZXMoJ19fdXVpZF9fJykpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8g5qOA5p+l5piv5ZCm5piv6IqC54K55byV55So77yI6YCa6L+H5bGe5oCn5ZCN5oiWX19pZF9f5bGe5oCn5Yik5pat77yJXG4gICAgICAgICAgICAgICAgICAgIGlmIChwcm9wZXJ0eU5hbWUudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnbm9kZScpIHx8IFxuICAgICAgICAgICAgICAgICAgICAgICAgcHJvcGVydHlOYW1lLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ3RhcmdldCcpIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICBrZXlzLmluY2x1ZGVzKCdfX2lkX18nKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZSA9ICdub2RlJztcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGUgPSAnYXNzZXQnO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChrZXlzLmluY2x1ZGVzKCdfX2lkX18nKSkge1xuICAgICAgICAgICAgICAgICAgICAvLyDoioLngrnlvJXnlKjnibnlvoFcbiAgICAgICAgICAgICAgICAgICAgdHlwZSA9ICdub2RlJztcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB0eXBlID0gJ29iamVjdCc7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oYFthbmFseXplUHJvcGVydHldIEVycm9yIGNoZWNraW5nIHByb3BlcnR5IHR5cGUgZm9yOiAke0pTT04uc3RyaW5naWZ5KHByb3BlcnR5VmFsdWUpfWApO1xuICAgICAgICAgICAgICAgIHR5cGUgPSAnb2JqZWN0JztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eVZhbHVlID09PSBudWxsIHx8IHByb3BlcnR5VmFsdWUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgLy8gRm9yIG51bGwvdW5kZWZpbmVkIHZhbHVlcywgY2hlY2sgcHJvcGVydHkgbmFtZSB0byBkZXRlcm1pbmUgdHlwZVxuICAgICAgICAgICAgaWYgKFsnc3ByaXRlRnJhbWUnLCAndGV4dHVyZScsICdtYXRlcmlhbCcsICdmb250JywgJ2NsaXAnLCAncHJlZmFiJ10uaW5jbHVkZXMocHJvcGVydHlOYW1lLnRvTG93ZXJDYXNlKCkpKSB7XG4gICAgICAgICAgICAgICAgdHlwZSA9ICdhc3NldCc7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5TmFtZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdub2RlJykgfHwgXG4gICAgICAgICAgICAgICAgICAgICAgcHJvcGVydHlOYW1lLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ3RhcmdldCcpKSB7XG4gICAgICAgICAgICAgICAgdHlwZSA9ICdub2RlJztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlOYW1lLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ2NvbXBvbmVudCcpKSB7XG4gICAgICAgICAgICAgICAgdHlwZSA9ICdjb21wb25lbnQnO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0eXBlID0gJ3Vua25vd24nO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgZXhpc3RzOiB0cnVlLFxuICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICAgIGF2YWlsYWJsZVByb3BlcnRpZXMsXG4gICAgICAgICAgICBvcmlnaW5hbFZhbHVlOiBwcm9wZXJ0eVZhbHVlXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBzbWFydENvbnZlcnRWYWx1ZShpbnB1dFZhbHVlOiBhbnksIHByb3BlcnR5SW5mbzogYW55KTogYW55IHtcbiAgICAgICAgY29uc3QgeyB0eXBlLCBvcmlnaW5hbFZhbHVlIH0gPSBwcm9wZXJ0eUluZm87XG4gICAgICAgIFxuICAgICAgICBkZWJ1Z0xvZyhgW3NtYXJ0Q29udmVydFZhbHVlXSBDb252ZXJ0aW5nICR7SlNPTi5zdHJpbmdpZnkoaW5wdXRWYWx1ZSl9IHRvIHR5cGU6ICR7dHlwZX1gKTtcbiAgICAgICAgXG4gICAgICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgICAgICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgICAgICAgICAgICByZXR1cm4gU3RyaW5nKGlucHV0VmFsdWUpO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgICAgICAgICAgICByZXR1cm4gTnVtYmVyKGlucHV0VmFsdWUpO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBpbnB1dFZhbHVlID09PSAnYm9vbGVhbicpIHJldHVybiBpbnB1dFZhbHVlO1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgaW5wdXRWYWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGlucHV0VmFsdWUudG9Mb3dlckNhc2UoKSA9PT0gJ3RydWUnIHx8IGlucHV0VmFsdWUgPT09ICcxJztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIEJvb2xlYW4oaW5wdXRWYWx1ZSk7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICBjYXNlICdjb2xvcic6XG4gICAgICAgICAgICAgICAgLy8g5LyY5YyW55qE6aKc6Imy5aSE55CG77yM5pSv5oyB5aSa56eN6L6T5YWl5qC85byPXG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBpbnB1dFZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgICAgICAvLyDlrZfnrKbkuLLmoLzlvI/vvJrljYHlha3ov5vliLbjgIHpopzoibLlkI3np7DjgIFyZ2IoKS9yZ2JhKClcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMucGFyc2VDb2xvclN0cmluZyhpbnB1dFZhbHVlKTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBpbnB1dFZhbHVlID09PSAnb2JqZWN0JyAmJiBpbnB1dFZhbHVlICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBpbnB1dEtleXMgPSBPYmplY3Qua2V5cyhpbnB1dFZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIOWmguaenOi+k+WFpeaYr+minOiJsuWvueixoe+8jOmqjOivgeW5tui9rOaNolxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGlucHV0S2V5cy5pbmNsdWRlcygncicpIHx8IGlucHV0S2V5cy5pbmNsdWRlcygnZycpIHx8IGlucHV0S2V5cy5pbmNsdWRlcygnYicpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcjogTWF0aC5taW4oMjU1LCBNYXRoLm1heCgwLCBOdW1iZXIoaW5wdXRWYWx1ZS5yKSB8fCAwKSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGc6IE1hdGgubWluKDI1NSwgTWF0aC5tYXgoMCwgTnVtYmVyKGlucHV0VmFsdWUuZykgfHwgMCkpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBiOiBNYXRoLm1pbigyNTUsIE1hdGgubWF4KDAsIE51bWJlcihpbnB1dFZhbHVlLmIpIHx8IDApKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYTogaW5wdXRWYWx1ZS5hICE9PSB1bmRlZmluZWQgPyBNYXRoLm1pbigyNTUsIE1hdGgubWF4KDAsIE51bWJlcihpbnB1dFZhbHVlLmEpKSkgOiAyNTVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS53YXJuKGBbc21hcnRDb252ZXJ0VmFsdWVdIEludmFsaWQgY29sb3Igb2JqZWN0OiAke0pTT04uc3RyaW5naWZ5KGlucHV0VmFsdWUpfWApO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIC8vIOWmguaenOacieWOn+WAvO+8jOS/neaMgeWOn+WAvOe7k+aehOW5tuabtOaWsOaPkOS+m+eahOWAvFxuICAgICAgICAgICAgICAgIGlmIChvcmlnaW5hbFZhbHVlICYmIHR5cGVvZiBvcmlnaW5hbFZhbHVlID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgaW5wdXRLZXlzID0gdHlwZW9mIGlucHV0VmFsdWUgPT09ICdvYmplY3QnICYmIGlucHV0VmFsdWUgPyBPYmplY3Qua2V5cyhpbnB1dFZhbHVlKSA6IFtdO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByOiBpbnB1dEtleXMuaW5jbHVkZXMoJ3InKSA/IE1hdGgubWluKDI1NSwgTWF0aC5tYXgoMCwgTnVtYmVyKGlucHV0VmFsdWUucikpKSA6IChvcmlnaW5hbFZhbHVlLnIgfHwgMjU1KSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBnOiBpbnB1dEtleXMuaW5jbHVkZXMoJ2cnKSA/IE1hdGgubWluKDI1NSwgTWF0aC5tYXgoMCwgTnVtYmVyKGlucHV0VmFsdWUuZykpKSA6IChvcmlnaW5hbFZhbHVlLmcgfHwgMjU1KSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBiOiBpbnB1dEtleXMuaW5jbHVkZXMoJ2InKSA/IE1hdGgubWluKDI1NSwgTWF0aC5tYXgoMCwgTnVtYmVyKGlucHV0VmFsdWUuYikpKSA6IChvcmlnaW5hbFZhbHVlLmIgfHwgMjU1KSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBhOiBpbnB1dEtleXMuaW5jbHVkZXMoJ2EnKSA/IE1hdGgubWluKDI1NSwgTWF0aC5tYXgoMCwgTnVtYmVyKGlucHV0VmFsdWUuYSkpKSA6IChvcmlnaW5hbFZhbHVlLmEgfHwgMjU1KVxuICAgICAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybihgW3NtYXJ0Q29udmVydFZhbHVlXSBFcnJvciBwcm9jZXNzaW5nIGNvbG9yIHdpdGggb3JpZ2luYWwgdmFsdWU6ICR7ZXJyb3J9YCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgLy8g6buY6K6k6L+U5Zue55m96ImyXG4gICAgICAgICAgICAgICAgY29uc29sZS53YXJuKGBbc21hcnRDb252ZXJ0VmFsdWVdIFVzaW5nIGRlZmF1bHQgd2hpdGUgY29sb3IgZm9yIGludmFsaWQgaW5wdXQ6ICR7SlNPTi5zdHJpbmdpZnkoaW5wdXRWYWx1ZSl9YCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgcjogMjU1LCBnOiAyNTUsIGI6IDI1NSwgYTogMjU1IH07XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICBjYXNlICd2ZWMyJzpcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGlucHV0VmFsdWUgPT09ICdvYmplY3QnICYmIGlucHV0VmFsdWUgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHg6IE51bWJlcihpbnB1dFZhbHVlLngpIHx8IG9yaWdpbmFsVmFsdWUueCB8fCAwLFxuICAgICAgICAgICAgICAgICAgICAgICAgeTogTnVtYmVyKGlucHV0VmFsdWUueSkgfHwgb3JpZ2luYWxWYWx1ZS55IHx8IDBcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIG9yaWdpbmFsVmFsdWU7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICBjYXNlICd2ZWMzJzpcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGlucHV0VmFsdWUgPT09ICdvYmplY3QnICYmIGlucHV0VmFsdWUgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHg6IE51bWJlcihpbnB1dFZhbHVlLngpIHx8IG9yaWdpbmFsVmFsdWUueCB8fCAwLFxuICAgICAgICAgICAgICAgICAgICAgICAgeTogTnVtYmVyKGlucHV0VmFsdWUueSkgfHwgb3JpZ2luYWxWYWx1ZS55IHx8IDAsXG4gICAgICAgICAgICAgICAgICAgICAgICB6OiBOdW1iZXIoaW5wdXRWYWx1ZS56KSB8fCBvcmlnaW5hbFZhbHVlLnogfHwgMFxuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gb3JpZ2luYWxWYWx1ZTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIGNhc2UgJ3NpemUnOlxuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgaW5wdXRWYWx1ZSA9PT0gJ29iamVjdCcgJiYgaW5wdXRWYWx1ZSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgd2lkdGg6IE51bWJlcihpbnB1dFZhbHVlLndpZHRoKSB8fCBvcmlnaW5hbFZhbHVlLndpZHRoIHx8IDEwMCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGhlaWdodDogTnVtYmVyKGlucHV0VmFsdWUuaGVpZ2h0KSB8fCBvcmlnaW5hbFZhbHVlLmhlaWdodCB8fCAxMDBcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIG9yaWdpbmFsVmFsdWU7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICBjYXNlICdub2RlJzpcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGlucHV0VmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIOiKgueCueW8leeUqOmcgOimgeeJueauiuWkhOeQhlxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gaW5wdXRWYWx1ZTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBpbnB1dFZhbHVlID09PSAnb2JqZWN0JyAmJiBpbnB1dFZhbHVlICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIOWmguaenOW3sue7j+aYr+WvueixoeW9ouW8j++8jOi/lOWbnlVVSUTmiJblrozmlbTlr7nosaFcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGlucHV0VmFsdWUudXVpZCB8fCBpbnB1dFZhbHVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gb3JpZ2luYWxWYWx1ZTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIGNhc2UgJ2Fzc2V0JzpcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGlucHV0VmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIOWmguaenOi+k+WFpeaYr+Wtl+espuS4sui3r+W+hO+8jOi9rOaNouS4umFzc2V05a+56LGhXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7IHV1aWQ6IGlucHV0VmFsdWUgfTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBpbnB1dFZhbHVlID09PSAnb2JqZWN0JyAmJiBpbnB1dFZhbHVlICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBpbnB1dFZhbHVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gb3JpZ2luYWxWYWx1ZTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgLy8g5a+55LqO5pyq55+l57G75Z6L77yM5bC96YeP5L+d5oyB5Y6f5pyJ57uT5p6EXG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBpbnB1dFZhbHVlID09PSB0eXBlb2Ygb3JpZ2luYWxWYWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gaW5wdXRWYWx1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIG9yaWdpbmFsVmFsdWU7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAgICAgcHJpdmF0ZSBwYXJzZUNvbG9yU3RyaW5nKGNvbG9yU3RyOiBzdHJpbmcpOiB7IHI6IG51bWJlcjsgZzogbnVtYmVyOyBiOiBudW1iZXI7IGE6IG51bWJlciB9IHtcbiAgICAgICAgY29uc3Qgc3RyID0gY29sb3JTdHIudHJpbSgpO1xuICAgICAgICBcbiAgICAgICAgLy8g5Y+q5pSv5oyB5Y2B5YWt6L+b5Yi25qC85byPICNSUkdHQkIg5oiWICNSUkdHQkJBQVxuICAgICAgICBpZiAoc3RyLnN0YXJ0c1dpdGgoJyMnKSkge1xuICAgICAgICAgICAgaWYgKHN0ci5sZW5ndGggPT09IDcpIHsgLy8gI1JSR0dCQlxuICAgICAgICAgICAgICAgIGNvbnN0IHIgPSBwYXJzZUludChzdHIuc3Vic3RyaW5nKDEsIDMpLCAxNik7XG4gICAgICAgICAgICAgICAgY29uc3QgZyA9IHBhcnNlSW50KHN0ci5zdWJzdHJpbmcoMywgNSksIDE2KTtcbiAgICAgICAgICAgICAgICBjb25zdCBiID0gcGFyc2VJbnQoc3RyLnN1YnN0cmluZyg1LCA3KSwgMTYpO1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHIsIGcsIGIsIGE6IDI1NSB9O1xuICAgICAgICAgICAgfSBlbHNlIGlmIChzdHIubGVuZ3RoID09PSA5KSB7IC8vICNSUkdHQkJBQVxuICAgICAgICAgICAgICAgIGNvbnN0IHIgPSBwYXJzZUludChzdHIuc3Vic3RyaW5nKDEsIDMpLCAxNik7XG4gICAgICAgICAgICAgICAgY29uc3QgZyA9IHBhcnNlSW50KHN0ci5zdWJzdHJpbmcoMywgNSksIDE2KTtcbiAgICAgICAgICAgICAgICBjb25zdCBiID0gcGFyc2VJbnQoc3RyLnN1YnN0cmluZyg1LCA3KSwgMTYpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGEgPSBwYXJzZUludChzdHIuc3Vic3RyaW5nKDcsIDkpLCAxNik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgciwgZywgYiwgYSB9O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAvLyDlpoLmnpzkuI3mmK/mnInmlYjnmoTljYHlha3ov5vliLbmoLzlvI/vvIzov5Tlm57plJnor6/mj5DnpLpcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIGNvbG9yIGZvcm1hdDogXCIke2NvbG9yU3RyfVwiLiBPbmx5IGhleGFkZWNpbWFsIGZvcm1hdCBpcyBzdXBwb3J0ZWQgKGUuZy4sIFwiI0ZGMDAwMFwiIG9yIFwiI0ZGMDAwMEZGXCIpYCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyB2ZXJpZnlQcm9wZXJ0eUNoYW5nZShub2RlVXVpZDogc3RyaW5nLCBjb21wb25lbnRUeXBlOiBzdHJpbmcsIHByb3BlcnR5OiBzdHJpbmcsIG9yaWdpbmFsVmFsdWU6IGFueSwgZXhwZWN0ZWRWYWx1ZTogYW55KTogUHJvbWlzZTx7IHZlcmlmaWVkOiBib29sZWFuOyBhY3R1YWxWYWx1ZTogYW55OyBmdWxsRGF0YTogYW55IH0+IHtcbiAgICAgICAgZGVidWdMb2coYFt2ZXJpZnlQcm9wZXJ0eUNoYW5nZV0gU3RhcnRpbmcgdmVyaWZpY2F0aW9uIGZvciAke2NvbXBvbmVudFR5cGV9LiR7cHJvcGVydHl9YCk7XG4gICAgICAgIGRlYnVnTG9nKGBbdmVyaWZ5UHJvcGVydHlDaGFuZ2VdIEV4cGVjdGVkIHZhbHVlOmAsIEpTT04uc3RyaW5naWZ5KGV4cGVjdGVkVmFsdWUpKTtcbiAgICAgICAgZGVidWdMb2coYFt2ZXJpZnlQcm9wZXJ0eUNoYW5nZV0gT3JpZ2luYWwgdmFsdWU6YCwgSlNPTi5zdHJpbmdpZnkob3JpZ2luYWxWYWx1ZSkpO1xuICAgICAgICBcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIOmHjeaWsOiOt+WPlue7hOS7tuS/oeaBr+i/m+ihjOmqjOivgVxuICAgICAgICAgICAgZGVidWdMb2coYFt2ZXJpZnlQcm9wZXJ0eUNoYW5nZV0gQ2FsbGluZyBnZXRDb21wb25lbnRJbmZvLi4uYCk7XG4gICAgICAgICAgICBjb25zdCBjb21wb25lbnRJbmZvID0gYXdhaXQgdGhpcy5nZXRDb21wb25lbnRJbmZvKG5vZGVVdWlkLCBjb21wb25lbnRUeXBlKTtcbiAgICAgICAgICAgIGRlYnVnTG9nKGBbdmVyaWZ5UHJvcGVydHlDaGFuZ2VdIGdldENvbXBvbmVudEluZm8gc3VjY2VzczpgLCBjb21wb25lbnRJbmZvLnN1Y2Nlc3MpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBjb25zdCBhbGxDb21wb25lbnRzID0gYXdhaXQgdGhpcy5nZXRDb21wb25lbnRzKG5vZGVVdWlkKTtcbiAgICAgICAgICAgIGRlYnVnTG9nKGBbdmVyaWZ5UHJvcGVydHlDaGFuZ2VdIGdldENvbXBvbmVudHMgc3VjY2VzczpgLCBhbGxDb21wb25lbnRzLnN1Y2Nlc3MpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZiAoY29tcG9uZW50SW5mby5zdWNjZXNzICYmIGNvbXBvbmVudEluZm8uZGF0YSkge1xuICAgICAgICAgICAgICAgIGRlYnVnTG9nKGBbdmVyaWZ5UHJvcGVydHlDaGFuZ2VdIENvbXBvbmVudCBkYXRhIGF2YWlsYWJsZSwgZXh0cmFjdGluZyBwcm9wZXJ0eSAnJHtwcm9wZXJ0eX0nYCk7XG4gICAgICAgICAgICAgICAgY29uc3QgYWxsUHJvcGVydHlOYW1lcyA9IE9iamVjdC5rZXlzKGNvbXBvbmVudEluZm8uZGF0YS5wcm9wZXJ0aWVzIHx8IHt9KTtcbiAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgW3ZlcmlmeVByb3BlcnR5Q2hhbmdlXSBBdmFpbGFibGUgcHJvcGVydGllczpgLCBhbGxQcm9wZXJ0eU5hbWVzKTtcbiAgICAgICAgICAgICAgICBjb25zdCBwcm9wZXJ0eURhdGEgPSBjb21wb25lbnRJbmZvLmRhdGEucHJvcGVydGllcz8uW3Byb3BlcnR5XTtcbiAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgW3ZlcmlmeVByb3BlcnR5Q2hhbmdlXSBSYXcgcHJvcGVydHkgZGF0YSBmb3IgJyR7cHJvcGVydHl9JzpgLCBKU09OLnN0cmluZ2lmeShwcm9wZXJ0eURhdGEpKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAvLyDku47lsZ7mgKfmlbDmja7kuK3mj5Dlj5blrp7pmYXlgLxcbiAgICAgICAgICAgICAgICBsZXQgYWN0dWFsVmFsdWUgPSBwcm9wZXJ0eURhdGE7XG4gICAgICAgICAgICAgICAgZGVidWdMb2coYFt2ZXJpZnlQcm9wZXJ0eUNoYW5nZV0gSW5pdGlhbCBhY3R1YWxWYWx1ZTpgLCBKU09OLnN0cmluZ2lmeShhY3R1YWxWYWx1ZSkpO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGlmIChwcm9wZXJ0eURhdGEgJiYgdHlwZW9mIHByb3BlcnR5RGF0YSA9PT0gJ29iamVjdCcgJiYgJ3ZhbHVlJyBpbiBwcm9wZXJ0eURhdGEpIHtcbiAgICAgICAgICAgICAgICAgICAgYWN0dWFsVmFsdWUgPSBwcm9wZXJ0eURhdGEudmFsdWU7XG4gICAgICAgICAgICAgICAgICAgIGRlYnVnTG9nKGBbdmVyaWZ5UHJvcGVydHlDaGFuZ2VdIEV4dHJhY3RlZCBhY3R1YWxWYWx1ZSBmcm9tIC52YWx1ZTpgLCBKU09OLnN0cmluZ2lmeShhY3R1YWxWYWx1ZSkpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGRlYnVnTG9nKGBbdmVyaWZ5UHJvcGVydHlDaGFuZ2VdIE5vIC52YWx1ZSBwcm9wZXJ0eSBmb3VuZCwgdXNpbmcgcmF3IGRhdGFgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgLy8g5L+u5aSN6aqM6K+B6YC76L6R77ya5qOA5p+l5a6e6ZmF5YC85piv5ZCm5Yy56YWN5pyf5pyb5YC8XG4gICAgICAgICAgICAgICAgbGV0IHZlcmlmaWVkID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBleHBlY3RlZFZhbHVlID09PSAnb2JqZWN0JyAmJiBleHBlY3RlZFZhbHVlICE9PSBudWxsICYmICd1dWlkJyBpbiBleHBlY3RlZFZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIOWvueS6juW8leeUqOexu+Wei++8iOiKgueCuS/nu4Tku7Yv6LWE5rqQ77yJ77yM5q+U6L6DVVVJRFxuICAgICAgICAgICAgICAgICAgICBjb25zdCBhY3R1YWxVdWlkID0gYWN0dWFsVmFsdWUgJiYgdHlwZW9mIGFjdHVhbFZhbHVlID09PSAnb2JqZWN0JyAmJiAndXVpZCcgaW4gYWN0dWFsVmFsdWUgPyBhY3R1YWxWYWx1ZS51dWlkIDogJyc7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGV4cGVjdGVkVXVpZCA9IGV4cGVjdGVkVmFsdWUudXVpZCB8fCAnJztcbiAgICAgICAgICAgICAgICAgICAgdmVyaWZpZWQgPSBhY3R1YWxVdWlkID09PSBleHBlY3RlZFV1aWQgJiYgZXhwZWN0ZWRVdWlkICE9PSAnJztcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIGRlYnVnTG9nKGBbdmVyaWZ5UHJvcGVydHlDaGFuZ2VdIFJlZmVyZW5jZSBjb21wYXJpc29uOmApO1xuICAgICAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgICAtIEV4cGVjdGVkIFVVSUQ6IFwiJHtleHBlY3RlZFV1aWR9XCJgKTtcbiAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYCAgLSBBY3R1YWwgVVVJRDogXCIke2FjdHVhbFV1aWR9XCJgKTtcbiAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYCAgLSBVVUlEIG1hdGNoOiAke2FjdHVhbFV1aWQgPT09IGV4cGVjdGVkVXVpZH1gKTtcbiAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYCAgLSBVVUlEIG5vdCBlbXB0eTogJHtleHBlY3RlZFV1aWQgIT09ICcnfWApO1xuICAgICAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgICAtIEZpbmFsIHZlcmlmaWVkOiAke3ZlcmlmaWVkfWApO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIOWvueS6juWFtuS7luexu+Wei++8jOebtOaOpeavlOi+g+WAvFxuICAgICAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgW3ZlcmlmeVByb3BlcnR5Q2hhbmdlXSBWYWx1ZSBjb21wYXJpc29uOmApO1xuICAgICAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgICAtIEV4cGVjdGVkIHR5cGU6ICR7dHlwZW9mIGV4cGVjdGVkVmFsdWV9YCk7XG4gICAgICAgICAgICAgICAgICAgIGRlYnVnTG9nKGAgIC0gQWN0dWFsIHR5cGU6ICR7dHlwZW9mIGFjdHVhbFZhbHVlfWApO1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBhY3R1YWxWYWx1ZSA9PT0gdHlwZW9mIGV4cGVjdGVkVmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgYWN0dWFsVmFsdWUgPT09ICdvYmplY3QnICYmIGFjdHVhbFZhbHVlICE9PSBudWxsICYmIGV4cGVjdGVkVmFsdWUgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDlr7nosaHnsbvlnovnmoTmt7Hluqbmr5TovoNcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2ZXJpZmllZCA9IEpTT04uc3RyaW5naWZ5KGFjdHVhbFZhbHVlKSA9PT0gSlNPTi5zdHJpbmdpZnkoZXhwZWN0ZWRWYWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYCAgLSBPYmplY3QgY29tcGFyaXNvbiAoSlNPTik6ICR7dmVyaWZpZWR9YCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOWfuuacrOexu+Wei+eahOebtOaOpeavlOi+g1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZlcmlmaWVkID0gYWN0dWFsVmFsdWUgPT09IGV4cGVjdGVkVmFsdWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYCAgLSBEaXJlY3QgY29tcGFyaXNvbjogJHt2ZXJpZmllZH1gKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIOexu+Wei+S4jeWMuemFjeaXtueahOeJueauiuWkhOeQhu+8iOWmguaVsOWtl+WSjOWtl+espuS4su+8iVxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgc3RyaW5nTWF0Y2ggPSBTdHJpbmcoYWN0dWFsVmFsdWUpID09PSBTdHJpbmcoZXhwZWN0ZWRWYWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBudW1iZXJNYXRjaCA9IE51bWJlcihhY3R1YWxWYWx1ZSkgPT09IE51bWJlcihleHBlY3RlZFZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZlcmlmaWVkID0gc3RyaW5nTWF0Y2ggfHwgbnVtYmVyTWF0Y2g7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgICAtIFN0cmluZyBtYXRjaDogJHtzdHJpbmdNYXRjaH1gKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlYnVnTG9nKGAgIC0gTnVtYmVyIG1hdGNoOiAke251bWJlck1hdGNofWApO1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYCAgLSBUeXBlIG1pc21hdGNoIHZlcmlmaWVkOiAke3ZlcmlmaWVkfWApO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGRlYnVnTG9nKGBbdmVyaWZ5UHJvcGVydHlDaGFuZ2VdIEZpbmFsIHZlcmlmaWNhdGlvbiByZXN1bHQ6ICR7dmVyaWZpZWR9YCk7XG4gICAgICAgICAgICAgICAgZGVidWdMb2coYFt2ZXJpZnlQcm9wZXJ0eUNoYW5nZV0gRmluYWwgYWN0dWFsVmFsdWU6YCwgSlNPTi5zdHJpbmdpZnkoYWN0dWFsVmFsdWUpKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSB7XG4gICAgICAgICAgICAgICAgICAgIHZlcmlmaWVkLFxuICAgICAgICAgICAgICAgICAgICBhY3R1YWxWYWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgZnVsbERhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIOWPqui/lOWbnuS/ruaUueeahOWxnuaAp+S/oeaBr++8jOS4jei/lOWbnuWujOaVtOe7hOS7tuaVsOaNrlxuICAgICAgICAgICAgICAgICAgICAgICAgbW9kaWZpZWRQcm9wZXJ0eToge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5hbWU6IHByb3BlcnR5LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJlZm9yZTogb3JpZ2luYWxWYWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBleHBlY3RlZDogZXhwZWN0ZWRWYWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBhY3R1YWw6IGFjdHVhbFZhbHVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZlcmlmaWVkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb3BlcnR5TWV0YWRhdGE6IHByb3BlcnR5RGF0YSAvLyDlj6rljIXlkKvov5nkuKrlsZ7mgKfnmoTlhYPmlbDmja5cbiAgICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyDnroDljJbnmoTnu4Tku7bkv6Hmga9cbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudFN1bW1hcnk6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBub2RlVXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRUeXBlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRvdGFsUHJvcGVydGllczogT2JqZWN0LmtleXMoY29tcG9uZW50SW5mby5kYXRhPy5wcm9wZXJ0aWVzIHx8IHt9KS5sZW5ndGhcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgZGVidWdMb2coYFt2ZXJpZnlQcm9wZXJ0eUNoYW5nZV0gUmV0dXJuaW5nIHJlc3VsdDpgLCBKU09OLnN0cmluZ2lmeShyZXN1bHQsIG51bGwsIDIpKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgW3ZlcmlmeVByb3BlcnR5Q2hhbmdlXSBDb21wb25lbnRJbmZvIGZhaWxlZCBvciBubyBkYXRhOmAsIGNvbXBvbmVudEluZm8pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcignW3ZlcmlmeVByb3BlcnR5Q2hhbmdlXSBWZXJpZmljYXRpb24gZmFpbGVkIHdpdGggZXJyb3I6JywgZXJyb3IpO1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcignW3ZlcmlmeVByb3BlcnR5Q2hhbmdlXSBFcnJvciBzdGFjazonLCBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3Iuc3RhY2sgOiAnTm8gc3RhY2sgdHJhY2UnKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgZGVidWdMb2coYFt2ZXJpZnlQcm9wZXJ0eUNoYW5nZV0gUmV0dXJuaW5nIGZhbGxiYWNrIHJlc3VsdGApO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgdmVyaWZpZWQ6IGZhbHNlLFxuICAgICAgICAgICAgYWN0dWFsVmFsdWU6IHVuZGVmaW5lZCxcbiAgICAgICAgICAgIGZ1bGxEYXRhOiBudWxsXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICog5qOA5rWL5piv5ZCm5Li66IqC54K55bGe5oCn77yM5aaC5p6c5piv5YiZ6YeN5a6a5ZCR5Yiw5a+55bqU55qE6IqC54K55pa55rOVXG4gICAgICovXG4gICAgcHJpdmF0ZSBhc3luYyBjaGVja0FuZFJlZGlyZWN0Tm9kZVByb3BlcnRpZXMoYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2UgfCBudWxsPiB7XG4gICAgICAgIGNvbnN0IHsgbm9kZVV1aWQsIGNvbXBvbmVudFR5cGUsIHByb3BlcnR5LCBwcm9wZXJ0eVR5cGUsIHZhbHVlIH0gPSBhcmdzO1xuICAgICAgICBcbiAgICAgICAgLy8g5qOA5rWL5piv5ZCm5Li66IqC54K55Z+656GA5bGe5oCn77yI5bqU6K+l5L2/55SoIHNldF9ub2RlX3Byb3BlcnR577yJXG4gICAgICAgIGNvbnN0IG5vZGVCYXNpY1Byb3BlcnRpZXMgPSBbXG4gICAgICAgICAgICAnbmFtZScsICdhY3RpdmUnLCAnbGF5ZXInLCAnbW9iaWxpdHknLCAncGFyZW50JywgJ2NoaWxkcmVuJywgJ2hpZGVGbGFncydcbiAgICAgICAgXTtcbiAgICAgICAgXG4gICAgICAgIC8vIOajgOa1i+aYr+WQpuS4uuiKgueCueWPmOaNouWxnuaAp++8iOW6lOivpeS9v+eUqCBzZXRfbm9kZV90cmFuc2Zvcm3vvIlcbiAgICAgICAgY29uc3Qgbm9kZVRyYW5zZm9ybVByb3BlcnRpZXMgPSBbXG4gICAgICAgICAgICAncG9zaXRpb24nLCAncm90YXRpb24nLCAnc2NhbGUnLCAnZXVsZXJBbmdsZXMnLCAnYW5nbGUnXG4gICAgICAgIF07XG4gICAgICAgIFxuICAgICAgICAvLyBEZXRlY3QgYXR0ZW1wdHMgdG8gc2V0IGNjLk5vZGUgcHJvcGVydGllcyAoY29tbW9uIG1pc3Rha2UpXG4gICAgICAgIGlmIChjb21wb25lbnRUeXBlID09PSAnY2MuTm9kZScgfHwgY29tcG9uZW50VHlwZSA9PT0gJ05vZGUnKSB7XG4gICAgICAgICAgICBpZiAobm9kZUJhc2ljUHJvcGVydGllcy5pbmNsdWRlcyhwcm9wZXJ0eSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yOiBgUHJvcGVydHkgJyR7cHJvcGVydHl9JyBpcyBhIG5vZGUgYmFzaWMgcHJvcGVydHksIG5vdCBhIGNvbXBvbmVudCBwcm9wZXJ0eWAsXG4gICAgICAgICAgICAgICAgICAgICAgaW5zdHJ1Y3Rpb246IGBQbGVhc2UgdXNlIHNldF9ub2RlX3Byb3BlcnR5IG1ldGhvZCB0byBzZXQgbm9kZSBwcm9wZXJ0aWVzOiBzZXRfbm9kZV9wcm9wZXJ0eSh1dWlkPVwiJHtub2RlVXVpZH1cIiwgcHJvcGVydHk9XCIke3Byb3BlcnR5fVwiLCB2YWx1ZT0ke0pTT04uc3RyaW5naWZ5KHZhbHVlKX0pYFxuICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgfSBlbHNlIGlmIChub2RlVHJhbnNmb3JtUHJvcGVydGllcy5pbmNsdWRlcyhwcm9wZXJ0eSkpIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGBQcm9wZXJ0eSAnJHtwcm9wZXJ0eX0nIGlzIGEgbm9kZSB0cmFuc2Zvcm0gcHJvcGVydHksIG5vdCBhIGNvbXBvbmVudCBwcm9wZXJ0eWAsXG4gICAgICAgICAgICAgICAgICAgICAgaW5zdHJ1Y3Rpb246IGBQbGVhc2UgdXNlIHNldF9ub2RlX3RyYW5zZm9ybSBtZXRob2QgdG8gc2V0IHRyYW5zZm9ybSBwcm9wZXJ0aWVzOiBzZXRfbm9kZV90cmFuc2Zvcm0odXVpZD1cIiR7bm9kZVV1aWR9XCIsICR7cHJvcGVydHl9PSR7SlNPTi5zdHJpbmdpZnkodmFsdWUpfSlgXG4gICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIFxuICAgICAgICAgIC8vIERldGVjdCBjb21tb24gaW5jb3JyZWN0IHVzYWdlXG4gICAgICAgICAgaWYgKG5vZGVCYXNpY1Byb3BlcnRpZXMuaW5jbHVkZXMocHJvcGVydHkpIHx8IG5vZGVUcmFuc2Zvcm1Qcm9wZXJ0aWVzLmluY2x1ZGVzKHByb3BlcnR5KSkge1xuICAgICAgICAgICAgICBjb25zdCBtZXRob2ROYW1lID0gbm9kZVRyYW5zZm9ybVByb3BlcnRpZXMuaW5jbHVkZXMocHJvcGVydHkpID8gJ3NldF9ub2RlX3RyYW5zZm9ybScgOiAnc2V0X25vZGVfcHJvcGVydHknO1xuICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgICBlcnJvcjogYFByb3BlcnR5ICcke3Byb3BlcnR5fScgaXMgYSBub2RlIHByb3BlcnR5LCBub3QgYSBjb21wb25lbnQgcHJvcGVydHlgLFxuICAgICAgICAgICAgICAgICAgaW5zdHJ1Y3Rpb246IGBQcm9wZXJ0eSAnJHtwcm9wZXJ0eX0nIHNob3VsZCBiZSBzZXQgdXNpbmcgJHttZXRob2ROYW1lfSBtZXRob2QsIG5vdCBzZXRfY29tcG9uZW50X3Byb3BlcnR5LiBQbGVhc2UgdXNlOiAke21ldGhvZE5hbWV9KHV1aWQ9XCIke25vZGVVdWlkfVwiLCAke25vZGVUcmFuc2Zvcm1Qcm9wZXJ0aWVzLmluY2x1ZGVzKHByb3BlcnR5KSA/IHByb3BlcnR5IDogYHByb3BlcnR5PVwiJHtwcm9wZXJ0eX1cImB9PSR7SlNPTi5zdHJpbmdpZnkodmFsdWUpfSlgXG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgfVxuICAgICAgICAgIFxuICAgICAgICAgIHJldHVybiBudWxsOyAvLyDkuI3mmK/oioLngrnlsZ7mgKfvvIznu6fnu63mraPluLjlpITnkIZcbiAgICAgIH1cblxuICAgICAgLyoqXG4gICAgICAgKiDnlJ/miJDnu4Tku7blu7rorq7kv6Hmga9cbiAgICAgICAqL1xuICAgICAgcHJpdmF0ZSBnZW5lcmF0ZUNvbXBvbmVudFN1Z2dlc3Rpb24ocmVxdWVzdGVkVHlwZTogc3RyaW5nLCBhdmFpbGFibGVUeXBlczogc3RyaW5nW10sIHByb3BlcnR5OiBzdHJpbmcpOiBzdHJpbmcge1xuICAgICAgICAgIC8vIOajgOafpeaYr+WQpuWtmOWcqOebuOS8vOeahOe7hOS7tuexu+Wei1xuICAgICAgICAgIGNvbnN0IHNpbWlsYXJUeXBlcyA9IGF2YWlsYWJsZVR5cGVzLmZpbHRlcih0eXBlID0+IFxuICAgICAgICAgICAgICB0eXBlLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMocmVxdWVzdGVkVHlwZS50b0xvd2VyQ2FzZSgpKSB8fCBcbiAgICAgICAgICAgICAgcmVxdWVzdGVkVHlwZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHR5cGUudG9Mb3dlckNhc2UoKSlcbiAgICAgICAgICApO1xuICAgICAgICAgIFxuICAgICAgICAgIGxldCBpbnN0cnVjdGlvbiA9ICcnO1xuICAgICAgICAgIFxuICAgICAgICAgIGlmIChzaW1pbGFyVHlwZXMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICBpbnN0cnVjdGlvbiArPSBgXFxuXFxu8J+UjSBGb3VuZCBzaW1pbGFyIGNvbXBvbmVudHM6ICR7c2ltaWxhclR5cGVzLmpvaW4oJywgJyl9YDtcbiAgICAgICAgICAgICAgaW5zdHJ1Y3Rpb24gKz0gYFxcbvCfkqEgU3VnZ2VzdGlvbjogUGVyaGFwcyB5b3UgbWVhbnQgdG8gc2V0IHRoZSAnJHtzaW1pbGFyVHlwZXNbMF19JyBjb21wb25lbnQ/YDtcbiAgICAgICAgICB9XG4gICAgICAgICAgXG4gICAgICAgICAgLy8gUmVjb21tZW5kIHBvc3NpYmxlIGNvbXBvbmVudHMgYmFzZWQgb24gcHJvcGVydHkgbmFtZVxuICAgICAgICAgIGNvbnN0IHByb3BlcnR5VG9Db21wb25lbnRNYXA6IFJlY29yZDxzdHJpbmcsIHN0cmluZ1tdPiA9IHtcbiAgICAgICAgICAgICAgJ3N0cmluZyc6IFsnY2MuTGFiZWwnLCAnY2MuUmljaFRleHQnLCAnY2MuRWRpdEJveCddLFxuICAgICAgICAgICAgICAndGV4dCc6IFsnY2MuTGFiZWwnLCAnY2MuUmljaFRleHQnXSxcbiAgICAgICAgICAgICAgJ2ZvbnRTaXplJzogWydjYy5MYWJlbCcsICdjYy5SaWNoVGV4dCddLFxuICAgICAgICAgICAgICAnc3ByaXRlRnJhbWUnOiBbJ2NjLlNwcml0ZSddLFxuICAgICAgICAgICAgICAnY29sb3InOiBbJ2NjLkxhYmVsJywgJ2NjLlNwcml0ZScsICdjYy5HcmFwaGljcyddLFxuICAgICAgICAgICAgICAnbm9ybWFsQ29sb3InOiBbJ2NjLkJ1dHRvbiddLFxuICAgICAgICAgICAgICAncHJlc3NlZENvbG9yJzogWydjYy5CdXR0b24nXSxcbiAgICAgICAgICAgICAgJ3RhcmdldCc6IFsnY2MuQnV0dG9uJ10sXG4gICAgICAgICAgICAgICdjb250ZW50U2l6ZSc6IFsnY2MuVUlUcmFuc2Zvcm0nXSxcbiAgICAgICAgICAgICAgJ2FuY2hvclBvaW50JzogWydjYy5VSVRyYW5zZm9ybSddXG4gICAgICAgICAgfTtcbiAgICAgICAgICBcbiAgICAgICAgICBjb25zdCByZWNvbW1lbmRlZENvbXBvbmVudHMgPSBwcm9wZXJ0eVRvQ29tcG9uZW50TWFwW3Byb3BlcnR5XSB8fCBbXTtcbiAgICAgICAgICBjb25zdCBhdmFpbGFibGVSZWNvbW1lbmRlZCA9IHJlY29tbWVuZGVkQ29tcG9uZW50cy5maWx0ZXIoY29tcCA9PiBhdmFpbGFibGVUeXBlcy5pbmNsdWRlcyhjb21wKSk7XG4gICAgICAgICAgXG4gICAgICAgICAgaWYgKGF2YWlsYWJsZVJlY29tbWVuZGVkLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgaW5zdHJ1Y3Rpb24gKz0gYFxcblxcbvCfjq8gQmFzZWQgb24gcHJvcGVydHkgJyR7cHJvcGVydHl9JywgcmVjb21tZW5kZWQgY29tcG9uZW50czogJHthdmFpbGFibGVSZWNvbW1lbmRlZC5qb2luKCcsICcpfWA7XG4gICAgICAgICAgfVxuICAgICAgICAgIFxuICAgICAgICAgIC8vIFByb3ZpZGUgb3BlcmF0aW9uIHN1Z2dlc3Rpb25zXG4gICAgICAgICAgaW5zdHJ1Y3Rpb24gKz0gYFxcblxcbvCfk4sgU3VnZ2VzdGVkIEFjdGlvbnM6YDtcbiAgICAgICAgICBpbnN0cnVjdGlvbiArPSBgXFxuMS4gVXNlIGdldF9jb21wb25lbnRzKG5vZGVVdWlkPVwiJHtyZXF1ZXN0ZWRUeXBlLmluY2x1ZGVzKCd1dWlkJykgPyAnWU9VUl9OT0RFX1VVSUQnIDogJ25vZGVVdWlkJ31cIikgdG8gdmlldyBhbGwgY29tcG9uZW50cyBvbiB0aGUgbm9kZWA7XG4gICAgICAgICAgaW5zdHJ1Y3Rpb24gKz0gYFxcbjIuIElmIHlvdSBuZWVkIHRvIGFkZCBhIGNvbXBvbmVudCwgdXNlIGFkZF9jb21wb25lbnQobm9kZVV1aWQ9XCIuLi5cIiwgY29tcG9uZW50VHlwZT1cIiR7cmVxdWVzdGVkVHlwZX1cIilgO1xuICAgICAgICAgIGluc3RydWN0aW9uICs9IGBcXG4zLiBWZXJpZnkgdGhhdCB0aGUgY29tcG9uZW50IHR5cGUgbmFtZSBpcyBjb3JyZWN0IChjYXNlLXNlbnNpdGl2ZSlgO1xuICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgcmV0dXJuIGluc3RydWN0aW9uO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIOW/q+mAn+mqjOivgei1hOa6kOiuvue9rue7k+aenFxuICAgICAqL1xuICAgIHByaXZhdGUgYXN5bmMgcXVpY2tWZXJpZnlBc3NldChub2RlVXVpZDogc3RyaW5nLCBjb21wb25lbnRUeXBlOiBzdHJpbmcsIHByb3BlcnR5OiBzdHJpbmcpOiBQcm9taXNlPGFueT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcmF3Tm9kZURhdGEgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1ub2RlJywgbm9kZVV1aWQpO1xuICAgICAgICAgICAgaWYgKCFyYXdOb2RlRGF0YSB8fCAhcmF3Tm9kZURhdGEuX19jb21wc19fKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIOaJvuWIsOe7hOS7tlxuICAgICAgICAgICAgY29uc3QgY29tcG9uZW50ID0gcmF3Tm9kZURhdGEuX19jb21wc19fLmZpbmQoKGNvbXA6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGNvbXBUeXBlID0gY29tcC5fX3R5cGVfXyB8fCBjb21wLmNpZCB8fCBjb21wLnR5cGU7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNvbXBUeXBlID09PSBjb21wb25lbnRUeXBlO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmICghY29tcG9uZW50KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIOaPkOWPluWxnuaAp+WAvFxuICAgICAgICAgICAgY29uc3QgcHJvcGVydGllcyA9IHRoaXMuZXh0cmFjdENvbXBvbmVudFByb3BlcnRpZXMoY29tcG9uZW50KTtcbiAgICAgICAgICAgIGNvbnN0IHByb3BlcnR5RGF0YSA9IHByb3BlcnRpZXNbcHJvcGVydHldO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZiAocHJvcGVydHlEYXRhICYmIHR5cGVvZiBwcm9wZXJ0eURhdGEgPT09ICdvYmplY3QnICYmICd2YWx1ZScgaW4gcHJvcGVydHlEYXRhKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHByb3BlcnR5RGF0YS52YWx1ZTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHByb3BlcnR5RGF0YTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYFtxdWlja1ZlcmlmeUFzc2V0XSBFcnJvcjpgLCBlcnJvcik7XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuICAgIH1cbn0iXX0=