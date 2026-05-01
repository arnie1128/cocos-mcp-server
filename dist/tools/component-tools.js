"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ComponentTools = void 0;
const log_1 = require("../lib/log");
const schema_1 = require("../lib/schema");
const define_tools_1 = require("../lib/define-tools");
const scene_bridge_1 = require("../lib/scene-bridge");
const resolve_node_1 = require("../lib/resolve-node");
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
async function nudgeEditorModel(nodeUuid, componentType, componentUuid) {
    var _a, _b, _c;
    try {
        const nodeData = await Editor.Message.request('scene', 'query-node', nodeUuid);
        const comps = (_a = nodeData === null || nodeData === void 0 ? void 0 : nodeData.__comps__) !== null && _a !== void 0 ? _a : [];
        let idx = -1;
        if (componentUuid) {
            idx = comps.findIndex(c => { var _a, _b; return ((_b = (_a = c === null || c === void 0 ? void 0 : c.uuid) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : c === null || c === void 0 ? void 0 : c.uuid) === componentUuid; });
        }
        if (idx === -1) {
            idx = comps.findIndex(c => ((c === null || c === void 0 ? void 0 : c.__type__) || (c === null || c === void 0 ? void 0 : c.cid) || (c === null || c === void 0 ? void 0 : c.type)) === componentType);
        }
        if (idx === -1)
            return;
        const raw = comps[idx];
        const enabledValue = ((_c = (_b = raw === null || raw === void 0 ? void 0 : raw.value) === null || _b === void 0 ? void 0 : _b.enabled) === null || _c === void 0 ? void 0 : _c.value) !== undefined
            ? raw.value.enabled.value !== false
            : (raw === null || raw === void 0 ? void 0 : raw.enabled) !== false;
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
    '• node: "target-node-uuid" (cc.Node reference — property metadata type === "cc.Node")\n' +
    '  How to get: Use get_all_nodes or find_node_by_name to get node UUIDs\n' +
    '• component: "target-node-uuid" (cc.Component subclass reference — e.g. cc.Camera, cc.Sprite)\n' +
    '  ⚠️ Easy to confuse with "node": pick "component" whenever the property\n' +
    '     metadata expects a Component subclass, even though the value is still\n' +
    '     a NODE UUID (the server auto-resolves the component\'s scene __id__).\n' +
    '  Example — cc.Canvas.cameraComponent expects a cc.Camera ref:\n' +
    '     propertyType: "component", value: "<UUID of node that has cc.Camera>"\n' +
    '  Pitfall: passing propertyType: "node" for cameraComponent appears to\n' +
    '     succeed at the IPC layer but the reference never connects.\n' +
    '• spriteFrame: "spriteframe-uuid" (sprite frame asset)\n' +
    '  How to get: Check asset database or use asset browser\n' +
    '  ⚠️ Default cc.Sprite.sizeMode is TRIMMED (1), so assigning spriteFrame\n' +
    '     auto-resizes cc.UITransform.contentSize to the texture native size.\n' +
    '     Pass preserveContentSize: true to keep the node\'s current contentSize\n' +
    '     (the server pre-sets sizeMode to CUSTOM (0) before the assign).\n' +
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
    '• cc.Button: normalColor (normal color), pressedColor (pressed color), target (target node — propertyType: "node")\n' +
    '• cc.Canvas: cameraComponent (cc.Camera ref — propertyType: "component", value = node UUID hosting the camera)\n' +
    '• cc.UITransform: contentSize (content size), anchorPoint (anchor point)\n' +
    '• Custom Scripts: Based on properties defined in the script';
class ComponentTools {
    constructor() {
        const defs = [
            { name: 'add_component', description: 'Add a component to a specific node. Mutates scene; verify the component type or script class name first. Accepts nodeUuid OR nodeName (uuid wins).',
                inputSchema: schema_1.z.object({
                    nodeUuid: schema_1.z.string().optional().describe('Target node UUID. Provide this OR nodeName.'),
                    nodeName: schema_1.z.string().optional().describe('Target node name (depth-first first match). Used only when nodeUuid is omitted.'),
                    componentType: schema_1.z.string().describe('Component type to add, e.g. cc.Sprite, cc.Label, cc.Button, or a custom script class name.'),
                }),
                handler: async (a) => {
                    const r = await (0, resolve_node_1.resolveOrToolError)({ nodeUuid: a.nodeUuid, nodeName: a.nodeName });
                    if ('response' in r)
                        return r.response;
                    return this.addComponent(r.uuid, a.componentType);
                } },
            { name: 'remove_component', description: "Remove a component from a node. Mutates scene; componentType must be the cid/type returned by get_components, not a guessed script name.",
                inputSchema: schema_1.z.object({
                    nodeUuid: schema_1.z.string().describe('Node UUID that owns the component to remove.'),
                    componentType: schema_1.z.string().describe('Component cid (type field from getComponents). Do NOT use script name or class name. Example: "cc.Sprite" or "9b4a7ueT9xD6aRE+AlOusy1"'),
                }), handler: a => this.removeComponent(a.nodeUuid, a.componentType) },
            { name: 'get_components', description: 'List all components on a node with type/cid and basic properties. No mutation; use before remove_component or set_component_property.',
                inputSchema: schema_1.z.object({
                    nodeUuid: schema_1.z.string().describe('Node UUID whose components should be listed.'),
                }), handler: a => this.getComponents(a.nodeUuid) },
            { name: 'get_component_info', description: 'Read detailed data for one component on a node. No mutation; use to inspect property names and value shapes before editing.',
                inputSchema: schema_1.z.object({
                    nodeUuid: schema_1.z.string().describe('Node UUID that owns the component.'),
                    componentType: schema_1.z.string().describe('Component type/cid to inspect. Use get_components first if unsure.'),
                }), handler: a => this.getComponentInfo(a.nodeUuid, a.componentType) },
            { name: 'set_component_property', description: 'Set component property values for UI components or custom script components. Supports setting properties of built-in UI components (e.g., cc.Label, cc.Sprite) and custom script components. Accepts nodeUuid OR nodeName (uuid wins). Note: For node basic properties (name, active, layer, etc.), use set_node_property. For node transform properties (position, rotation, scale, etc.), use set_node_transform.',
                inputSchema: schema_1.z.object({
                    nodeUuid: schema_1.z.string().optional().describe('Target node UUID. Provide this OR nodeName.'),
                    nodeName: schema_1.z.string().optional().describe('Target node name (depth-first first match). Used only when nodeUuid is omitted.'),
                    componentType: schema_1.z.string().describe('Component type - Can be built-in components (e.g., cc.Label) or custom script components (e.g., MyScript). If unsure about component type, use get_components first to retrieve all components on the node.'),
                    property: schema_1.z.string().describe(setComponentPropertyPropertyDescription),
                    propertyType: schema_1.z.enum([
                        'string', 'number', 'boolean', 'integer', 'float',
                        'color', 'vec2', 'vec3', 'size',
                        'node', 'component', 'spriteFrame', 'prefab', 'asset',
                        'nodeArray', 'colorArray', 'numberArray', 'stringArray',
                    ]).describe('Property type - Must explicitly specify the property data type for correct value conversion and validation'),
                    value: schema_1.z.any().describe(setComponentPropertyValueDescription),
                    preserveContentSize: schema_1.z.boolean().default(false).describe('Sprite-specific workflow flag. Only honoured when componentType="cc.Sprite" and property="spriteFrame": before the assign, sets cc.Sprite.sizeMode to CUSTOM (0) so the engine does NOT overwrite cc.UITransform.contentSize with the texture\'s native dimensions. Use when building UI procedurally and the node\'s pre-set size must be kept; leave false (default) to keep cocos\' standard TRIMMED auto-fit behaviour.'),
                }),
                handler: async (a) => {
                    const r = await (0, resolve_node_1.resolveOrToolError)({ nodeUuid: a.nodeUuid, nodeName: a.nodeName });
                    if ('response' in r)
                        return r.response;
                    return this.setComponentProperty(Object.assign(Object.assign({}, a), { nodeUuid: r.uuid }));
                } },
            { name: 'attach_script', description: 'Attach a script asset as a component to a node. Mutates scene; use get_components afterward because custom scripts may appear as cid.',
                inputSchema: schema_1.z.object({
                    nodeUuid: schema_1.z.string().describe('Node UUID to attach the script component to.'),
                    scriptPath: schema_1.z.string().describe('Script asset db:// path, e.g. db://assets/scripts/MyScript.ts.'),
                }), handler: a => this.attachScript(a.nodeUuid, a.scriptPath) },
            { name: 'get_available_components', description: 'Return a curated built-in component type list by category. No scene query; custom project scripts are not discovered here.',
                inputSchema: schema_1.z.object({
                    category: schema_1.z.enum(['all', 'renderer', 'ui', 'physics', 'animation', 'audio']).default('all').describe('Component category filter for the built-in curated list.'),
                }), handler: a => this.getAvailableComponents(a.category) },
            { name: 'add_event_handler', description: 'Append a cc.EventHandler to a component event array and nudge the editor model for persistence. Mutates scene; use for Button/Toggle/Slider callbacks.',
                inputSchema: schema_1.z.object({
                    nodeUuid: schema_1.z.string().describe('Node UUID owning the component (e.g. the Button node)'),
                    componentType: schema_1.z.string().default('cc.Button').describe('Component class name; defaults to cc.Button'),
                    eventArrayProperty: schema_1.z.string().default('clickEvents').describe('Component property holding the EventHandler array (cc.Button.clickEvents, cc.Toggle.checkEvents, …)'),
                    targetNodeUuid: schema_1.z.string().describe('Node UUID where the callback component lives (most often the same as nodeUuid)'),
                    componentName: schema_1.z.string().describe('Class name (cc-class) of the script that owns the callback method'),
                    handler: schema_1.z.string().describe('Method name on the target component, e.g. "onClick"'),
                    customEventData: schema_1.z.string().optional().describe('Optional string passed back when the event fires'),
                }),
                handler: async (a) => {
                    var _a;
                    const resp = await (0, scene_bridge_1.runSceneMethodAsToolResponse)('addEventHandler', [
                        a.nodeUuid, a.componentType, a.eventArrayProperty,
                        a.targetNodeUuid, a.componentName, a.handler, a.customEventData,
                    ]);
                    if (resp.success) {
                        await nudgeEditorModel(a.nodeUuid, a.componentType, (_a = resp.data) === null || _a === void 0 ? void 0 : _a.componentUuid);
                    }
                    return resp;
                } },
            { name: 'remove_event_handler', description: 'Remove EventHandler entries by index or targetNodeUuid+handler match, then nudge the editor model for persistence. Mutates scene.',
                inputSchema: schema_1.z.object({
                    nodeUuid: schema_1.z.string().describe('Node UUID owning the component'),
                    componentType: schema_1.z.string().default('cc.Button').describe('Component class name'),
                    eventArrayProperty: schema_1.z.string().default('clickEvents').describe('EventHandler array property name'),
                    index: schema_1.z.number().int().min(0).optional().describe('Zero-based index to remove. Takes precedence over targetNodeUuid/handler matching when provided.'),
                    targetNodeUuid: schema_1.z.string().optional().describe('Match handlers whose target node has this UUID'),
                    handler: schema_1.z.string().optional().describe('Match handlers with this method name'),
                }),
                handler: async (a) => {
                    var _a, _b, _c, _d;
                    const resp = await (0, scene_bridge_1.runSceneMethodAsToolResponse)('removeEventHandler', [
                        a.nodeUuid, a.componentType, a.eventArrayProperty,
                        (_a = a.index) !== null && _a !== void 0 ? _a : null,
                        (_b = a.targetNodeUuid) !== null && _b !== void 0 ? _b : null,
                        (_c = a.handler) !== null && _c !== void 0 ? _c : null,
                    ]);
                    if (resp.success) {
                        await nudgeEditorModel(a.nodeUuid, a.componentType, (_d = resp.data) === null || _d === void 0 ? void 0 : _d.componentUuid);
                    }
                    return resp;
                } },
            { name: 'list_event_handlers', description: 'List EventHandler entries currently bound to a component event array. No mutation; use before remove_event_handler.',
                inputSchema: schema_1.z.object({
                    nodeUuid: schema_1.z.string().describe('Node UUID owning the component'),
                    componentType: schema_1.z.string().default('cc.Button').describe('Component class name'),
                    eventArrayProperty: schema_1.z.string().default('clickEvents').describe('EventHandler array property name'),
                }),
                handler: a => (0, scene_bridge_1.runSceneMethodAsToolResponse)('listEventHandlers', [
                    a.nodeUuid, a.componentType, a.eventArrayProperty,
                ]) },
        ];
        this.exec = (0, define_tools_1.defineTools)(defs);
    }
    getTools() { return this.exec.getTools(); }
    execute(toolName, args) { return this.exec.execute(toolName, args); }
    async addComponent(nodeUuid, componentType) {
        return new Promise(async (resolve) => {
            var _a;
            // Snapshot existing components so we can detect post-add additions
            // even when Cocos reports them under a cid (custom scripts) rather
            // than the class name the caller supplied.
            const beforeInfo = await this.getComponents(nodeUuid);
            const beforeList = beforeInfo.success && ((_a = beforeInfo.data) === null || _a === void 0 ? void 0 : _a.components) ? beforeInfo.data.components : [];
            const beforeTypes = new Set(beforeList.map((c) => c.type));
            const existingComponent = beforeList.find((comp) => comp.type === componentType);
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
                var _a;
                // 等待一段時間讓Editor完成組件添加
                await new Promise(r => setTimeout(r, 100));
                try {
                    const afterInfo = await this.getComponents(nodeUuid);
                    if (!afterInfo.success || !((_a = afterInfo.data) === null || _a === void 0 ? void 0 : _a.components)) {
                        resolve({
                            success: false,
                            error: `Failed to verify component addition: ${afterInfo.error || 'Unable to get node components'}`,
                        });
                        return;
                    }
                    const afterList = afterInfo.data.components;
                    // Strict match: built-in components like cc.Sprite show their
                    // class name in `type`. Hits the same shape the caller passed.
                    const addedComponent = afterList.find((comp) => comp.type === componentType);
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
                    const newEntries = afterList.filter((comp) => !beforeTypes.has(comp.type));
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
                        error: `Component '${componentType}' was not found on node after addition. Available components: ${afterList.map((c) => c.type).join(', ')}`,
                    });
                }
                catch (verifyError) {
                    resolve({
                        success: false,
                        error: `Failed to verify component addition: ${verifyError.message}`,
                    });
                }
            }).catch((err) => {
                // 備用方案：使用場景腳本
                (0, scene_bridge_1.runSceneMethod)('addComponentToNode', [nodeUuid, componentType]).then((result) => {
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
            // 1. 查找節點上的所有組件
            const allComponentsInfo = await this.getComponents(nodeUuid);
            if (!allComponentsInfo.success || !((_a = allComponentsInfo.data) === null || _a === void 0 ? void 0 : _a.components)) {
                resolve({ success: false, error: `Failed to get components for node '${nodeUuid}': ${allComponentsInfo.error}` });
                return;
            }
            // 2. 只查找type字段等於componentType的組件（即cid）
            const exists = allComponentsInfo.data.components.some((comp) => comp.type === componentType);
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
            // 優先嚐試直接使用 Editor API 查詢節點信息
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
                // 備用方案：使用場景腳本
                (0, scene_bridge_1.runSceneMethod)('getNodeInfo', [nodeUuid]).then((result) => {
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
            // 優先嚐試直接使用 Editor API 查詢節點信息
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
                // 備用方案：使用場景腳本
                (0, scene_bridge_1.runSceneMethod)('getNodeInfo', [nodeUuid]).then((result) => {
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
        // 檢查組件是否有 value 屬性，這通常包含實際的組件屬性
        if (component.value && typeof component.value === 'object') {
            (0, log_1.debugLog)(`[extractComponentProperties] Found component.value with properties:`, Object.keys(component.value));
            return component.value; // 直接返回 value 對象，它包含所有組件屬性
        }
        // 備用方案：從組件對象中直接提取屬性
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
                const availableTypes = [];
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
                // Step 3.5: propertyType vs metadata reference-kind preflight.
                // Catches the common pitfall where a cc.Component subclass field
                // (e.g. cc.Canvas.cameraComponent : cc.Camera) gets called with
                // propertyType: 'node' — the IPC silently accepts but the ref
                // never connects. We surface the right propertyType + value shape.
                const mismatch = this.detectPropertyTypeMismatch(propertyInfo, propertyType, nodeUuid, componentType, property);
                if (mismatch) {
                    resolve(mismatch);
                    return;
                }
                // Step 4: 處理屬性值和設置
                const originalValue = propertyInfo.originalValue;
                let processedValue;
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
                        }
                        else if (typeof value === 'object' && value !== null) {
                            // 對象格式：驗證並轉換RGBA值
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
                            // 組件引用需要特殊處理：通過節點UUID找到組件的__id__
                            processedValue = value; // 先保存節點UUID，後續會轉換為__id__
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
                // 用於驗證的實際期望值（對於組件引用需要特殊處理）
                let actualExpectedValue = processedValue;
                // Step 5: 構建屬性路徑（component index 已在 Step 2 捕獲）
                const rawComponentIndex = targetComponentIndex;
                let propertyPath = `__comps__.${rawComponentIndex}.${property}`;
                // 特殊處理資源類屬性
                if (propertyType === 'asset' || propertyType === 'spriteFrame' || propertyType === 'prefab' ||
                    (propertyInfo.type === 'asset' && propertyType === 'string')) {
                    (0, log_1.debugLog)(`[ComponentTools] Setting asset reference:`, {
                        value: processedValue,
                        property: property,
                        propertyType: propertyType,
                        path: propertyPath
                    });
                    // Workflow opt-in: when assigning cc.Sprite.spriteFrame and the
                    // caller wants the node's existing UITransform contentSize kept,
                    // pre-set sizeMode to CUSTOM (0). cocos' default TRIMMED would
                    // otherwise auto-resize contentSize to the texture's native
                    // dimensions on assign — usually unwanted when laying out UI
                    // procedurally with a chosen size.
                    if (args.preserveContentSize && componentType === 'cc.Sprite' && property === 'spriteFrame') {
                        try {
                            await Editor.Message.request('scene', 'set-property', {
                                uuid: nodeUuid,
                                path: `__comps__.${rawComponentIndex}.sizeMode`,
                                dump: { value: 0 },
                            });
                            (0, log_1.debugLog)('[ComponentTools] preserveContentSize: forced cc.Sprite.sizeMode=CUSTOM(0) before spriteFrame assign');
                        }
                        catch (preErr) {
                            console.warn('[ComponentTools] preserveContentSize pre-set failed (non-fatal):', preErr);
                        }
                    }
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
                    // 特殊處理顏色屬性，確保RGBA值正確
                    // Cocos Creator顏色值範圍是0-255
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
                }
                else if (propertyType === 'vec2' && processedValue && typeof processedValue === 'object') {
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
                }
                else if (propertyType === 'size' && processedValue && typeof processedValue === 'object') {
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
                }
                else if (propertyType === 'node' && processedValue && typeof processedValue === 'object' && 'uuid' in processedValue) {
                    // 特殊處理節點引用
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
                    // 特殊處理組件引用：通過節點UUID找到組件的__id__
                    const targetNodeUuid = processedValue;
                    (0, log_1.debugLog)(`[ComponentTools] Setting component reference - finding component on node: ${targetNodeUuid}`);
                    // 從當前組件的屬性元數據中獲取期望的組件類型
                    let expectedComponentType = '';
                    // 獲取當前組件的詳細信息，包括屬性元數據
                    const currentComponentInfo = await this.getComponentInfo(nodeUuid, componentType);
                    if (currentComponentInfo.success && ((_b = (_a = currentComponentInfo.data) === null || _a === void 0 ? void 0 : _a.properties) === null || _b === void 0 ? void 0 : _b[property])) {
                        const propertyMeta = currentComponentInfo.data.properties[property];
                        // 從屬性元數據中提取組件類型信息
                        if (propertyMeta && typeof propertyMeta === 'object') {
                            // 檢查是否有type字段指示組件類型
                            if (propertyMeta.type) {
                                expectedComponentType = propertyMeta.type;
                            }
                            else if (propertyMeta.ctor) {
                                // 有些屬性可能使用ctor字段
                                expectedComponentType = propertyMeta.ctor;
                            }
                            else if (propertyMeta.extends && Array.isArray(propertyMeta.extends)) {
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
                    (0, log_1.debugLog)(`[ComponentTools] Detected required component type: ${expectedComponentType} for property: ${property}`);
                    try {
                        // 獲取目標節點的組件信息
                        const targetNodeData = await Editor.Message.request('scene', 'query-node', targetNodeUuid);
                        if (!targetNodeData || !targetNodeData.__comps__) {
                            throw new Error(`Target node ${targetNodeUuid} not found or has no components`);
                        }
                        // 打印目標節點的組件概覽
                        (0, log_1.debugLog)(`[ComponentTools] Target node ${targetNodeUuid} has ${targetNodeData.__comps__.length} components:`);
                        targetNodeData.__comps__.forEach((comp, index) => {
                            const sceneId = comp.value && comp.value.uuid && comp.value.uuid.value ? comp.value.uuid.value : 'unknown';
                            (0, log_1.debugLog)(`[ComponentTools] Component ${index}: ${comp.type} (scene_id: ${sceneId})`);
                        });
                        // 查找對應的組件
                        let targetComponent = null;
                        let componentId = null;
                        // 在目標節點的_components數組中查找指定類型的組件
                        // 注意：__comps__和_components的索引是對應的
                        (0, log_1.debugLog)(`[ComponentTools] Searching for component type: ${expectedComponentType}`);
                        for (let i = 0; i < targetNodeData.__comps__.length; i++) {
                            const comp = targetNodeData.__comps__[i];
                            (0, log_1.debugLog)(`[ComponentTools] Checking component ${i}: type=${comp.type}, target=${expectedComponentType}`);
                            if (comp.type === expectedComponentType) {
                                targetComponent = comp;
                                (0, log_1.debugLog)(`[ComponentTools] Found matching component at index ${i}: ${comp.type}`);
                                // 從組件的value.uuid.value中獲取組件在場景中的ID
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
                            // 如果沒找到，列出可用組件讓用戶瞭解，顯示場景中的真實ID
                            const availableComponents = targetNodeData.__comps__.map((comp, index) => {
                                let sceneId = 'unknown';
                                // 從組件的value.uuid.value獲取場景ID
                                if (comp.value && comp.value.uuid && comp.value.uuid.value) {
                                    sceneId = comp.value.uuid.value;
                                }
                                return `${comp.type}(scene_id:${sceneId})`;
                            });
                            throw new Error(`Component type '${expectedComponentType}' not found on node ${targetNodeUuid}. Available components: ${availableComponents.join(', ')}`);
                        }
                        (0, log_1.debugLog)(`[ComponentTools] Found component ${expectedComponentType} with scene ID: ${componentId} on node ${targetNodeUuid}`);
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
                                value: { uuid: componentId }, // 使用對象格式，像節點/資源引用一樣
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
                    // 特殊處理節點數組 - 保持預處理的格式
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
                    // 特殊處理顏色數組
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
            // 從腳本路徑提取組件類名
            const scriptName = (_a = scriptPath.split('/').pop()) === null || _a === void 0 ? void 0 : _a.replace('.ts', '').replace('.js', '');
            if (!scriptName) {
                resolve({ success: false, error: 'Invalid script path' });
                return;
            }
            // 先查找節點上是否已存在該腳本組件
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
            // 首先嚐試直接使用腳本名稱作為組件類型
            Editor.Message.request('scene', 'create-component', {
                uuid: nodeUuid,
                component: scriptName // 使用腳本名稱而非UUID
            }).then(async (result) => {
                var _a;
                // 等待一段時間讓Editor完成組件添加
                await new Promise(resolve => setTimeout(resolve, 100));
                // 重新查詢節點信息驗證腳本是否真的添加成功
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
                // 備用方案：使用場景腳本
                (0, scene_bridge_1.runSceneMethod)('attachScript', [nodeUuid, scriptPath]).then((result) => {
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
        }
        catch (error) {
            console.warn(`[isValidPropertyDescriptor] Error checking property descriptor:`, error);
            return false;
        }
    }
    analyzeProperty(component, propertyName) {
        // 從複雜的組件結構中提取可用屬性
        const availableProperties = [];
        let propertyValue = undefined;
        let propertyExists = false;
        let metaType;
        let metaExtends;
        const captureMeta = (propInfo) => {
            if (!propInfo || typeof propInfo !== 'object')
                return;
            if (typeof propInfo.type === 'string')
                metaType = propInfo.type;
            if (Array.isArray(propInfo.extends)) {
                metaExtends = propInfo.extends.filter((s) => typeof s === 'string');
            }
        };
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
                        const propInfo = propData;
                        availableProperties.push(key);
                        if (key === propertyName) {
                            // 優先使用value屬性，如果沒有則使用propData本身
                            try {
                                const propKeys = Object.keys(propInfo);
                                propertyValue = propKeys.includes('value') ? propInfo.value : propInfo;
                            }
                            catch (error) {
                                // 如果檢查失敗，直接使用propInfo
                                propertyValue = propInfo;
                            }
                            captureMeta(propInfo);
                            propertyExists = true;
                        }
                    }
                }
            }
            else {
                // 備用方案：直接從properties查找
                for (const [key, propData] of Object.entries(component.properties)) {
                    if (this.isValidPropertyDescriptor(propData)) {
                        const propInfo = propData;
                        availableProperties.push(key);
                        if (key === propertyName) {
                            // 優先使用value屬性，如果沒有則使用propData本身
                            try {
                                const propKeys = Object.keys(propInfo);
                                propertyValue = propKeys.includes('value') ? propInfo.value : propInfo;
                            }
                            catch (error) {
                                // 如果檢查失敗，直接使用propInfo
                                propertyValue = propInfo;
                            }
                            captureMeta(propInfo);
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
                    // 檢查是否是節點引用（通過屬性名或__id__屬性判斷）
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
                    // 節點引用特徵
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
            originalValue: propertyValue,
            metaType,
            metaExtends,
        };
    }
    detectPropertyTypeMismatch(propertyInfo, propertyType, nodeUuid, componentType, property) {
        const { metaType, metaExtends } = propertyInfo;
        if (!metaType && (!metaExtends || metaExtends.length === 0))
            return null;
        const extendsList = metaExtends !== null && metaExtends !== void 0 ? metaExtends : [];
        const isNodeRef = metaType === 'cc.Node';
        const isComponentRef = !isNodeRef && extendsList.includes('cc.Component');
        const isAssetRef = !isNodeRef && !isComponentRef && extendsList.includes('cc.Asset');
        if (!isNodeRef && !isComponentRef && !isAssetRef)
            return null;
        const expectedKind = isNodeRef ? 'node' : isComponentRef ? 'component' : 'asset';
        const userKind = propertyType === 'spriteFrame' || propertyType === 'prefab' || propertyType === 'asset' ? 'asset'
            : propertyType === 'node' ? 'node'
                : propertyType === 'component' ? 'component'
                    : null;
        if (!userKind || userKind === expectedKind)
            return null;
        const expectedTypeName = metaType !== null && metaType !== void 0 ? metaType : '(unknown)';
        let suggestedPropertyType;
        let valueHint;
        if (isComponentRef) {
            suggestedPropertyType = 'component';
            valueHint = `the UUID of the NODE that hosts the ${expectedTypeName} component (the server resolves the component's scene __id__ for you)`;
        }
        else if (isNodeRef) {
            suggestedPropertyType = 'node';
            valueHint = "the target node's UUID";
        }
        else {
            suggestedPropertyType =
                expectedTypeName === 'cc.SpriteFrame' ? 'spriteFrame'
                    : expectedTypeName === 'cc.Prefab' ? 'prefab'
                        : 'asset';
            valueHint = `the asset UUID (type: ${expectedTypeName})`;
        }
        return {
            success: false,
            error: `propertyType mismatch: '${componentType}.${property}' is a ${expectedKind} reference (metadata type: ${expectedTypeName}), but you passed propertyType: '${propertyType}'.`,
            instruction: `Use propertyType: '${suggestedPropertyType}' with ${valueHint}.\nExample: set_component_property(nodeUuid="${nodeUuid}", componentType="${componentType}", property="${property}", propertyType="${suggestedPropertyType}", value="<uuid>")`,
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
                // 優化的顏色處理，支持多種輸入格式
                if (typeof inputValue === 'string') {
                    // 字符串格式：十六進制、顏色名稱、rgb()/rgba()
                    return this.parseColorString(inputValue);
                }
                else if (typeof inputValue === 'object' && inputValue !== null) {
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
                    }
                    catch (error) {
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
                    }
                    catch (error) {
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
                }
                else if (typeof inputValue === 'object' && inputValue !== null) {
                    // 如果已經是對象形式，返回UUID或完整對象
                    return inputValue.uuid || inputValue;
                }
                return originalValue;
            case 'asset':
                if (typeof inputValue === 'string') {
                    // 如果輸入是字符串路徑，轉換為asset對象
                    return { uuid: inputValue };
                }
                else if (typeof inputValue === 'object' && inputValue !== null) {
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
    parseColorString(colorStr) {
        const str = colorStr.trim();
        // 只支持十六進制格式 #RRGGBB 或 #RRGGBBAA
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
        // 如果不是有效的十六進制格式，返回錯誤提示
        throw new Error(`Invalid color format: "${colorStr}". Only hexadecimal format is supported (e.g., "#FF0000" or "#FF0000FF")`);
    }
    async verifyPropertyChange(nodeUuid, componentType, property, originalValue, expectedValue) {
        var _a, _b;
        (0, log_1.debugLog)(`[verifyPropertyChange] Starting verification for ${componentType}.${property}`);
        (0, log_1.debugLog)(`[verifyPropertyChange] Expected value:`, JSON.stringify(expectedValue));
        (0, log_1.debugLog)(`[verifyPropertyChange] Original value:`, JSON.stringify(originalValue));
        try {
            // 重新獲取組件信息進行驗證
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
                // 從屬性數據中提取實際值
                let actualValue = propertyData;
                (0, log_1.debugLog)(`[verifyPropertyChange] Initial actualValue:`, JSON.stringify(actualValue));
                if (propertyData && typeof propertyData === 'object' && 'value' in propertyData) {
                    actualValue = propertyData.value;
                    (0, log_1.debugLog)(`[verifyPropertyChange] Extracted actualValue from .value:`, JSON.stringify(actualValue));
                }
                else {
                    (0, log_1.debugLog)(`[verifyPropertyChange] No .value property found, using raw data`);
                }
                // 修復驗證邏輯：檢查實際值是否匹配期望值
                let verified = false;
                if (typeof expectedValue === 'object' && expectedValue !== null && 'uuid' in expectedValue) {
                    // 對於引用類型（節點/組件/資源），比較UUID
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
                    // 對於其他類型，直接比較值
                    (0, log_1.debugLog)(`[verifyPropertyChange] Value comparison:`);
                    (0, log_1.debugLog)(`  - Expected type: ${typeof expectedValue}`);
                    (0, log_1.debugLog)(`  - Actual type: ${typeof actualValue}`);
                    if (typeof actualValue === typeof expectedValue) {
                        if (typeof actualValue === 'object' && actualValue !== null && expectedValue !== null) {
                            // 對象類型的深度比較
                            verified = JSON.stringify(actualValue) === JSON.stringify(expectedValue);
                            (0, log_1.debugLog)(`  - Object comparison (JSON): ${verified}`);
                        }
                        else {
                            // 基本類型的直接比較
                            verified = actualValue === expectedValue;
                            (0, log_1.debugLog)(`  - Direct comparison: ${verified}`);
                        }
                    }
                    else {
                        // 類型不匹配時的特殊處理（如數字和字符串）
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
     * 檢測是否為節點屬性，如果是則重定向到對應的節點方法
     */
    async checkAndRedirectNodeProperties(args) {
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
        return null; // 不是節點屬性，繼續正常處理
    }
    /**
     * 生成組件建議信息
     */
    generateComponentSuggestion(requestedType, availableTypes, property) {
        // 檢查是否存在相似的組件類型
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
     * 快速驗證資源設置結果
     */
    async quickVerifyAsset(nodeUuid, componentType, property) {
        try {
            const rawNodeData = await Editor.Message.request('scene', 'query-node', nodeUuid);
            if (!rawNodeData || !rawNodeData.__comps__) {
                return null;
            }
            // 找到組件
            const component = rawNodeData.__comps__.find((comp) => {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tcG9uZW50LXRvb2xzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL3Rvb2xzL2NvbXBvbmVudC10b29scy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSxvQ0FBc0M7QUFDdEMsMENBQWtDO0FBQ2xDLHNEQUEyRDtBQUMzRCxzREFBbUY7QUFDbkYsc0RBQXlEO0FBRXpEOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBNEJHO0FBQ0gsS0FBSyxVQUFVLGdCQUFnQixDQUMzQixRQUFnQixFQUNoQixhQUFxQixFQUNyQixhQUFzQjs7SUFFdEIsSUFBSSxDQUFDO1FBQ0QsTUFBTSxRQUFRLEdBQVEsTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsWUFBWSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQ3BGLE1BQU0sS0FBSyxHQUFVLE1BQUEsUUFBUSxhQUFSLFFBQVEsdUJBQVIsUUFBUSxDQUFFLFNBQVMsbUNBQUksRUFBRSxDQUFDO1FBQy9DLElBQUksR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ2IsSUFBSSxhQUFhLEVBQUUsQ0FBQztZQUNoQixHQUFHLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxlQUFDLE9BQUEsQ0FBQyxNQUFBLE1BQUEsQ0FBQyxhQUFELENBQUMsdUJBQUQsQ0FBQyxDQUFFLElBQUksMENBQUUsS0FBSyxtQ0FBSSxDQUFDLGFBQUQsQ0FBQyx1QkFBRCxDQUFDLENBQUUsSUFBSSxDQUFDLEtBQUssYUFBYSxDQUFBLEVBQUEsQ0FBQyxDQUFDO1FBQzlFLENBQUM7UUFDRCxJQUFJLEdBQUcsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQ2IsR0FBRyxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUEsQ0FBQyxhQUFELENBQUMsdUJBQUQsQ0FBQyxDQUFFLFFBQVEsTUFBSSxD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QUUsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7Z0JBQzVDLE1BQU0sQ0FBQyxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztnQkFDNUMsTUFBTSxDQUFDLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUM1QyxPQUFPLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDO1lBQy9CLENBQUM7aUJBQU0sSUFBSSxHQUFHLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUMsWUFBWTtnQkFDdkMsTUFBTSxDQUFDLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUM1QyxNQUFNLENBQUMsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7Z0JBQzVDLE1BQU0sQ0FBQyxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztnQkFDNUMsTUFBTSxDQUFDLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUM1QyxPQUFPLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUM7WUFDMUIsQ0FBQztRQUNMLENBQUM7UUFFRCx1QkFBdUI7UUFDdkIsTUFBTSxJQUFJLEtBQUssQ0FBQywwQkFBMEIsUUFBUSwwRUFBMEUsQ0FBQyxDQUFDO0lBQ2xJLENBQUM7SUFFTyxLQUFLLENBQUMs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SUFBSSxDQUFDLENBQUMsSUFBUyxFQUFFLEVBQUU7Z0JBQ3ZELE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxRQUFRLElBQUksSUFBSSxDQUFDLEdBQUcsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDO2dCQUN4RCxPQUFPLFFBQVEsS0FBSyxhQUFhLENBQUM7WUFDdEMsQ0FBQyxDQUFDLENBQUM7WUFFSCxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7Z0JBQ2IsT0FBTyxJQUFJLENBQUM7WUFDaEIsQ0FBQztZQUVELFFBQVE7WUFDUixNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsMEJBQTBCLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDOUQsTUFBTSxZQUFZLEdBQUcsVUFBVSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBRTFDLElBQUksWUFBWSxJQUFJLE9BQU8sWUFBWSxLQUFLLFFBQVEsSUFBSSxPQUFPLElBQUksWUFBWSxFQUFFLENBQUM7Z0JBQzlFLE9BQU8sWUFBWSxDQUFDLEtBQUssQ0FBQztZQUM5QixDQUFDO2lCQUFNLENBQUM7Z0JBQ0osT0FBTyxZQUFZLENBQUM7WUFDeEIsQ0FBQztRQUNMLENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2IsT0FBTyxDQUFDLEtBQUssQ0FBQywyQkFBMkIsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUNsRCxPQUFPLElBQUksQ0FBQztRQUNoQixDQUFDO0lBQ0wsQ0FBQztDQUNKO0FBMXVERCx3Q0EwdURDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgVG9vbERlZmluaXRpb24sIFRvb2xSZXNwb25zZSwgVG9vbEV4ZWN1dG9yLCBDb21wb25lbnRJbmZvIH0gZnJvbSAnLi4vdHlwZXMnO1xuaW1wb3J0IHsgZGVidWdMb2cgfSBmcm9tICcuLi9saWIvbG9nJztcbmltcG9ydCB7IHogfSBmcm9tICcuLi9saWIvc2NoZW1hJztcbmltcG9ydCB7IGRlZmluZVRvb2xzLCBUb29sRGVmIH0gZnJvbSAnLi4vbGliL2RlZmluZS10b29scyc7XG5pbXBvcnQgeyBydW5TY2VuZU1ldGhvZCwgcnVuU2NlbmVNZXRob2RBc1Rvb2xSZXNwb25zZSB9IGZyb20gJy4uL2xpYi9zY2VuZS1icmlkZ2UnO1xuaW1wb3J0IHsgcmVzb2x2ZU9yVG9vbEVycm9yIH0gZnJvbSAnLi4vbGliL3Jlc29sdmUtbm9kZSc7XG5cbi8qKlxuICogRm9yY2UgdGhlIGVkaXRvcidzIHNlcmlhbGl6YXRpb24gbW9kZWwgdG8gcmUtcHVsbCBhIGNvbXBvbmVudCBkdW1wXG4gKiBmcm9tIHJ1bnRpbWUuIENMQVVERS5tZCBMYW5kbWluZSAjMTE6IHNjZW5lLXNjcmlwdCBgYXJyLnB1c2hgIG11dGF0aW9uc1xuICogb25seSB0b3VjaCB0aGUgcnVudGltZTsgdGhlIG1vZGVsIHRoYXQgYHNhdmUtc2NlbmVgIHdyaXRlcyB0byBkaXNrIGlzXG4gKiBvbmx5IHVwZGF0ZWQgd2hlbiBjaGFuZ2VzIGZsb3cgdGhyb3VnaCB0aGUgZWRpdG9yJ3Mgc2V0LXByb3BlcnR5XG4gKiBjaGFubmVsLlxuICpcbiAqIENhbGxpbmcgYHNldC1wcm9wZXJ0eWAgZnJvbSBpbnNpZGUgc2NlbmUtc2NyaXB0IGRvZXNuJ3QgcHJvcGFnYXRlICh0aGVcbiAqIHNjZW5lLXByb2Nlc3MgSVBDIHNob3J0LWNpcmN1aXRzKS4gVGhlIG51ZGdlIG11c3QgY29tZSBmcm9tIGhvc3Qgc2lkZS5cbiAqXG4gKiBUaGUgc2V0LXByb3BlcnR5IGNoYW5uZWwgZm9yIGNvbXBvbmVudCBwcm9wZXJ0aWVzIHVzZXMgYSBub2RlLXJvb3RlZFxuICogcGF0aDogYHV1aWQgPSBub2RlVXVpZGAsIGBwYXRoID0gX19jb21wc19fLjxpbmRleD4uPHByb3BlcnR5PmAuIFdlXG4gKiBxdWVyeSB0aGUgbm9kZSwgbG9jYXRlIHRoZSBtYXRjaGluZyBjb21wb25lbnQsIGFuZCBzZXQgYGVuYWJsZWRgIHRvXG4gKiBpdHMgY3VycmVudCB2YWx1ZSAobm8tb3Agc2VtYW50aWNhbGx5LCBmb3JjZXMgc3luYykuXG4gKlxuICogTG9va3VwIHByZWNlZGVuY2U6XG4gKiAgIDEuIGBjb21wb25lbnRVdWlkYCAocHJlY2lzZSDigJQgZGlzYW1iaWd1YXRlcyBtdWx0aXBsZSBzYW1lLXR5cGVcbiAqICAgICAgY29tcG9uZW50cyBvbiB0aGUgc2FtZSBub2RlKS5cbiAqICAgMi4gYGNvbXBvbmVudFR5cGVgIGZhbGxiYWNrIGlmIHV1aWQgd2Fzbid0IHN1cHBsaWVkIG9yIGRpZG4ndFxuICogICAgICBtYXRjaCAoY292ZXJzIHRlc3RzIC8gb2xkZXIgY2FsbGVycykuXG4gKlxuICogYGVuYWJsZWRWYWx1ZWAgaXMgcmVhZCBkZWZlbnNpdmVseSBiZWNhdXNlIHRoZSBgcXVlcnktbm9kZWAgZHVtcCBzaGFwZVxuICogdmFyaWVzIGFjcm9zcyBDb2NvcyB2ZXJzaW9uczogcHJvcGVydGllcyBjYW4gYmUgZmxhdCAoYGNvbXAuZW5hYmxlZGApXG4gKiBvciBuZXN0ZWQgKGBjb21wLnZhbHVlLmVuYWJsZWQudmFsdWVgKS4gV2UgdHJ5IG5lc3RlZCBmaXJzdCwgZmFsbFxuICogYmFjayB0byBmbGF0IOKAlCBtYXRjaGVzIHRoZSBwYXR0ZXJuIHVzZWQgYnkgYGdldENvbXBvbmVudHNgLlxuICpcbiAqIEJlc3QtZWZmb3J0OiBmYWlsdXJlcyBhcmUgc3dhbGxvd2VkIGJlY2F1c2UgdGhlIHJ1bnRpbWUgbXV0YXRpb25cbiAqIGFscmVhZHkgaGFwcGVuZWQg4oCUIG9ubHkgcGVyc2lzdGVuY2UgdG8gZGlzayBpcyBhdCBzdGFrZS5cbiAqL1xuYXN5bmMgZnVuY3Rpb24gbnVkZ2VFZGl0b3JNb2RlbChcbiAgICBub2RlVXVpZDogc3RyaW5nLFxuICAgIGNvbXBvbmVudFR5cGU6IHN0cmluZyxcbiAgICBjb21wb25lbnRVdWlkPzogc3RyaW5nLFxuKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3Qgbm9kZURhdGE6IGFueSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LW5vZGUnLCBub2RlVXVpZCk7XG4gICAgICAgIGNvbnN0IGNvbXBzOiBhbnlbXSA9IG5vZGVEYXRhPy5fX2NvbXBzX18gPz8gW107XG4gICAgICAgIGxldCBpZHggPSAtMTtcbiAgICAgICAgaWYgKGNvbXBvbmVudFV1aWQpIHtcbiAgICAgICAgICAgIGlkeCA9IGNvbXBzLmZpbmRJbmRleChjID0+IChjPy51dWlkPy52YWx1ZSA/PyBjPy51dWlkKSA9PT0gY29tcG9uZW50VXVpZCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGlkeCA9PT0gLTEpIHtcbiAgICAgICAgICAgIGlkeCA9IGNvbXBzLmZpbmRJbmRleChjID0+IChjPy5fX3R5cGVfXyB8fCBjPy5jaWQgfHwgYz8udHlwZSkgPT09IGNvbXBvbmVudFR5cGUpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChpZHggPT09IC0xKSByZXR1cm47XG4gICAgICAgIGNvbnN0IHJhdyA9IGNvbXBzW2lkeF07XG4gICAgICAgIGNvbnN0IGVuYWJsZWRWYWx1ZTogYm9vbGVhbiA9XG4gICAgICAgICAgICByYXc/LnZhbHVlPy5lbmFibGVkPy52YWx1ZSAhPT0gdW5kZWZpbmVkXG4gICAgICAgICAgICAgICAgPyByYXcudmFsdWUuZW5hYmxlZC52YWx1ZSAhPT0gZmFsc2VcbiAgICAgICAgICAgICAgICA6IHJhdz8uZW5hYmxlZCAhPT0gZmFsc2U7XG4gICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3NldC1wcm9wZXJ0eScsIHtcbiAgICAgICAgICAgIHV1aWQ6IG5vZGVVdWlkLFxuICAgICAgICAgICAgcGF0aDogYF9fY29tcHNfXy4ke2lkeH0uZW5hYmxlZGAsXG4gICAgICAgICAgICBkdW1wOiB7IHZhbHVlOiBlbmFibGVkVmFsdWUgfSxcbiAgICAgICAgfSk7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIGRlYnVnTG9nKCdbQ29tcG9uZW50VG9vbHNdIG51ZGdlIHNldC1wcm9wZXJ0eSBmYWlsZWQgKG5vbi1mYXRhbCk6JywgZXJyKTtcbiAgICB9XG59XG5cbmNvbnN0IHNldENvbXBvbmVudFByb3BlcnR5VmFsdWVEZXNjcmlwdGlvbiA9XG4gICAgJ1Byb3BlcnR5IHZhbHVlIC0gVXNlIHRoZSBjb3JyZXNwb25kaW5nIGRhdGEgZm9ybWF0IGJhc2VkIG9uIHByb3BlcnR5VHlwZTpcXG5cXG4nICtcbiAgICAn8J+TnSBCYXNpYyBEYXRhIFR5cGVzOlxcbicgK1xuICAgICfigKIgc3RyaW5nOiBcIkhlbGxvIFdvcmxkXCIgKHRleHQgc3RyaW5nKVxcbicgK1xuICAgICfigKIgbnVtYmVyL2ludGVnZXIvZmxvYXQ6IDQyIG9yIDMuMTQgKG51bWVyaWMgdmFsdWUpXFxuJyArXG4gICAgJ+KAoiBib29sZWFuOiB0cnVlIG9yIGZhbHNlIChib29sZWFuIHZhbHVlKVxcblxcbicgK1xuICAgICfwn46oIENvbG9yIFR5cGU6XFxuJyArXG4gICAgJ+KAoiBjb2xvcjoge1wiclwiOjI1NSxcImdcIjowLFwiYlwiOjAsXCJhXCI6MjU1fSAoUkdCQSB2YWx1ZXMsIHJhbmdlIDAtMjU1KVxcbicgK1xuICAgICcgIC0gQWx0ZXJuYXRpdmU6IFwiI0ZGMDAwMFwiIChoZXhhZGVjaW1hbCBmb3JtYXQpXFxuJyArXG4gICAgJyAgLSBUcmFuc3BhcmVuY3k6IGEgdmFsdWUgY29udHJvbHMgb3BhY2l0eSwgMjU1ID0gZnVsbHkgb3BhcXVlLCAwID0gZnVsbHkgdHJhbnNwYXJlbnRcXG5cXG4nICtcbiAgICAn8J+TkCBWZWN0b3IgYW5kIFNpemUgVHlwZXM6XFxuJyArXG4gICAgJ+KAoiB2ZWMyOiB7XCJ4XCI6MTAwLFwieVwiOjUwfSAoMkQgdmVjdG9yKVxcbicgK1xuICAgICfigKIgdmVjMzoge1wieFwiOjEsXCJ5XCI6MixcInpcIjozfSAoM0QgdmVjdG9yKVxcbicgK1xuICAgICfigKIgc2l6ZToge1wid2lkdGhcIjoxMDAsXCJoZWlnaHRcIjo1MH0gKHNpemUgZGltZW5zaW9ucylcXG5cXG4nICtcbiAgICAn8J+UlyBSZWZlcmVuY2UgVHlwZXMgKHVzaW5nIFVVSUQgc3RyaW5ncyk6XFxuJyArXG4gICAgJ+KAoiBub2RlOiBcInRhcmdldC1ub2RlLXV1aWRcIiAoY2MuTm9kZSByZWZlcmVuY2Ug4oCUIHByb3BlcnR5IG1ldGFkYXRhIHR5cGUgPT09IFwiY2MuTm9kZVwiKVxcbicgK1xuICAgICcgIEhvdyB0byBnZXQ6IFVzZSBnZXRfYWxsX25vZGVzIG9yIGZpbmRfbm9kZV9ieV9uYW1lIHRvIGdldCBub2RlIFVVSURzXFxuJyArXG4gICAgJ+KAoiBjb21wb25lbnQ6IFwidGFyZ2V0LW5vZGUtdXVpZFwiIChjYy5Db21wb25lbnQgc3ViY2xhc3MgcmVmZXJlbmNlIOKAlCBlLmcuIGNjLkNhbWVyYSwgY2MuU3ByaXRlKVxcbicgK1xuICAgICcgIOKaoO+4jyBFYXN5IHRvIGNvbmZ1c2Ugd2l0aCBcIm5vZGVcIjogcGljayBcImNvbXBvbmVudFwiIHdoZW5ldmVyIHRoZSBwcm9wZXJ0eVxcbicgK1xuICAgICcgICAgIG1ldGFkYXRhIGV4cGVjdHMgYSBDb21wb25lbnQgc3ViY2xhc3MsIGV2ZW4gdGhvdWdoIHRoZSB2YWx1ZSBpcyBzdGlsbFxcbicgK1xuICAgICcgICAgIGEgTk9ERSBVVUlEICh0aGUgc2VydmVyIGF1dG8tcmVzb2x2ZXMgdGhlIGNvbXBvbmVudFxcJ3Mgc2NlbmUgX19pZF9fKS5cXG4nICtcbiAgICAnICBFeGFtcGxlIOKAlCBjYy5DYW52YXMuY2FtZXJhQ29tcG9uZW50IGV4cGVjdHMgYSBjYy5DYW1lcmEgcmVmOlxcbicgK1xuICAgICcgICAgIHByb3BlcnR5VHlwZTogXCJjb21wb25lbnRcIiwgdmFsdWU6IFwiPFVVSUQgb2Ygbm9kZSB0aGF0IGhhcyBjYy5DYW1lcmE+XCJcXG4nICtcbiAgICAnICBQaXRmYWxsOiBwYXNzaW5nIHByb3BlcnR5VHlwZTogXCJub2RlXCIgZm9yIGNhbWVyYUNvbXBvbmVudCBhcHBlYXJzIHRvXFxuJyArXG4gICAgJyAgICAgc3VjY2VlZCBhdCB0aGUgSVBDIGxheWVyIGJ1dCB0aGUgcmVmZXJlbmNlIG5ldmVyIGNvbm5lY3RzLlxcbicgK1xuICAgICfigKIgc3ByaXRlRnJhbWU6IFwic3ByaXRlZnJhbWUtdXVpZFwiIChzcHJpdGUgZnJhbWUgYXNzZXQpXFxuJyArXG4gICAgJyAgSG93IHRvIGdldDogQ2hlY2sgYXNzZXQgZGF0YWJhc2Ugb3IgdXNlIGFzc2V0IGJyb3dzZXJcXG4nICtcbiAgICAnICDimqDvuI8gRGVmYXVsdCBjYy5TcHJpdGUuc2l6ZU1vZGUgaXMgVFJJTU1FRCAoMSksIHNvIGFzc2lnbmluZyBzcHJpdGVGcmFtZVxcbicgK1xuICAgICcgICAgIGF1dG8tcmVzaXplcyBjYy5VSVRyYW5zZm9ybS5jb250ZW50U2l6ZSB0byB0aGUgdGV4dHVyZSBuYXRpdmUgc2l6ZS5cXG4nICtcbiAgICAnICAgICBQYXNzIHByZXNlcnZlQ29udGVudFNpemU6IHRydWUgdG8ga2VlcCB0aGUgbm9kZVxcJ3MgY3VycmVudCBjb250ZW50U2l6ZVxcbicgK1xuICAgICcgICAgICh0aGUgc2VydmVyIHByZS1zZXRzIHNpemVNb2RlIHRvIENVU1RPTSAoMCkgYmVmb3JlIHRoZSBhc3NpZ24pLlxcbicgK1xuICAgICfigKIgcHJlZmFiOiBcInByZWZhYi11dWlkXCIgKHByZWZhYiBhc3NldClcXG4nICtcbiAgICAnICBIb3cgdG8gZ2V0OiBDaGVjayBhc3NldCBkYXRhYmFzZSBvciB1c2UgYXNzZXQgYnJvd3NlclxcbicgK1xuICAgICfigKIgYXNzZXQ6IFwiYXNzZXQtdXVpZFwiIChnZW5lcmljIGFzc2V0IHJlZmVyZW5jZSlcXG4nICtcbiAgICAnICBIb3cgdG8gZ2V0OiBDaGVjayBhc3NldCBkYXRhYmFzZSBvciB1c2UgYXNzZXQgYnJvd3NlclxcblxcbicgK1xuICAgICfwn5OLIEFycmF5IFR5cGVzOlxcbicgK1xuICAgICfigKIgbm9kZUFycmF5OiBbXCJ1dWlkMVwiLFwidXVpZDJcIl0gKGFycmF5IG9mIG5vZGUgVVVJRHMpXFxuJyArXG4gICAgJ+KAoiBjb2xvckFycmF5OiBbe1wiclwiOjI1NSxcImdcIjowLFwiYlwiOjAsXCJhXCI6MjU1fV0gKGFycmF5IG9mIGNvbG9ycylcXG4nICtcbiAgICAn4oCiIG51bWJlckFycmF5OiBbMSwyLDMsNCw1XSAoYXJyYXkgb2YgbnVtYmVycylcXG4nICtcbiAgICAn4oCiIHN0cmluZ0FycmF5OiBbXCJpdGVtMVwiLFwiaXRlbTJcIl0gKGFycmF5IG9mIHN0cmluZ3MpJztcblxuY29uc3Qgc2V0Q29tcG9uZW50UHJvcGVydHlQcm9wZXJ0eURlc2NyaXB0aW9uID1cbiAgICAnUHJvcGVydHkgbmFtZSAtIFRoZSBwcm9wZXJ0eSB0byBzZXQuIENvbW1vbiBwcm9wZXJ0aWVzIGluY2x1ZGU6XFxuJyArXG4gICAgJ+KAoiBjYy5MYWJlbDogc3RyaW5nICh0ZXh0IGNvbnRlbnQpLCBmb250U2l6ZSAoZm9udCBzaXplKSwgY29sb3IgKHRleHQgY29sb3IpXFxuJyArXG4gICAgJ+KAoiBjYy5TcHJpdGU6IHNwcml0ZUZyYW1lIChzcHJpdGUgZnJhbWUpLCBjb2xvciAodGludCBjb2xvciksIHNpemVNb2RlIChzaXplIG1vZGUpXFxuJyArXG4gICAgJ+KAoiBjYy5CdXR0b246IG5vcm1hbENvbG9yIChub3JtYWwgY29sb3IpLCBwcmVzc2VkQ29sb3IgKHByZXNzZWQgY29sb3IpLCB0YXJnZXQgKHRhcmdldCBub2RlIOKAlCBwcm9wZXJ0eVR5cGU6IFwibm9kZVwiKVxcbicgK1xuICAgICfigKIgY2MuQ2FudmFzOiBjYW1lcmFDb21wb25lbnQgKGNjLkNhbWVyYSByZWYg4oCUIHByb3BlcnR5VHlwZTogXCJjb21wb25lbnRcIiwgdmFsdWUgPSBub2RlIFVVSUQgaG9zdGluZyB0aGUgY2FtZXJhKVxcbicgK1xuICAgICfigKIgY2MuVUlUcmFuc2Zvcm06IGNvbnRlbnRTaXplIChjb250ZW50IHNpemUpLCBhbmNob3JQb2ludCAoYW5jaG9yIHBvaW50KVxcbicgK1xuICAgICfigKIgQ3VzdG9tIFNjcmlwdHM6IEJhc2VkIG9uIHByb3BlcnRpZXMgZGVmaW5lZCBpbiB0aGUgc2NyaXB0JztcblxuZXhwb3J0IGNsYXNzIENvbXBvbmVudFRvb2xzIGltcGxlbWVudHMgVG9vbEV4ZWN1dG9yIHtcbiAgICBwcml2YXRlIHJlYWRvbmx5IGV4ZWM6IFRvb2xFeGVjdXRvcjtcblxuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICBjb25zdCBkZWZzOiBUb29sRGVmW10gPSBbXG4gICAgICAgICAgICB7IG5hbWU6ICdhZGRfY29tcG9uZW50JywgZGVzY3JpcHRpb246ICdBZGQgYSBjb21wb25lbnQgdG8gYSBzcGVjaWZpYyBub2RlLiBNdXRhdGVzIHNjZW5lOyB2ZXJpZnkgdGhlIGNvbXBvbmVudCB0eXBlIG9yIHNjcmlwdCBjbGFzcyBuYW1lIGZpcnN0LiBBY2NlcHRzIG5vZGVVdWlkIE9SIG5vZGVOYW1lICh1dWlkIHdpbnMpLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnVGFyZ2V0IG5vZGUgVVVJRC4gUHJvdmlkZSB0aGlzIE9SIG5vZGVOYW1lLicpLFxuICAgICAgICAgICAgICAgICAgICBub2RlTmFtZTogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdUYXJnZXQgbm9kZSBuYW1lIChkZXB0aC1maXJzdCBmaXJzdCBtYXRjaCkuIFVzZWQgb25seSB3aGVuIG5vZGVVdWlkIGlzIG9taXR0ZWQuJyksXG4gICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudFR5cGU6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0NvbXBvbmVudCB0eXBlIHRvIGFkZCwgZS5nLiBjYy5TcHJpdGUsIGNjLkxhYmVsLCBjYy5CdXR0b24sIG9yIGEgY3VzdG9tIHNjcmlwdCBjbGFzcyBuYW1lLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGFzeW5jIGEgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCByID0gYXdhaXQgcmVzb2x2ZU9yVG9vbEVycm9yKHsgbm9kZVV1aWQ6IGEubm9kZVV1aWQsIG5vZGVOYW1lOiBhLm5vZGVOYW1lIH0pO1xuICAgICAgICAgICAgICAgICAgICBpZiAoJ3Jlc3BvbnNlJyBpbiByKSByZXR1cm4gci5yZXNwb25zZTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRkQ29tcG9uZW50KHIudXVpZCwgYS5jb21wb25lbnRUeXBlKTtcbiAgICAgICAgICAgICAgICB9IH0sXG4gICAgICAgICAgICB7IG5hbWU6ICdyZW1vdmVfY29tcG9uZW50JywgZGVzY3JpcHRpb246IFwiUmVtb3ZlIGEgY29tcG9uZW50IGZyb20gYSBub2RlLiBNdXRhdGVzIHNjZW5lOyBjb21wb25lbnRUeXBlIG11c3QgYmUgdGhlIGNpZC90eXBlIHJldHVybmVkIGJ5IGdldF9jb21wb25lbnRzLCBub3QgYSBndWVzc2VkIHNjcmlwdCBuYW1lLlwiLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIG5vZGVVdWlkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdOb2RlIFVVSUQgdGhhdCBvd25zIHRoZSBjb21wb25lbnQgdG8gcmVtb3ZlLicpLFxuICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRUeXBlOiB6LnN0cmluZygpLmRlc2NyaWJlKCdDb21wb25lbnQgY2lkICh0eXBlIGZpZWxkIGZyb20gZ2V0Q29tcG9uZW50cykuIERvIE5PVCB1c2Ugc2NyaXB0IG5hbWUgb3IgY2xhc3MgbmFtZS4gRXhhbXBsZTogXCJjYy5TcHJpdGVcIiBvciBcIjliNGE3dWVUOXhENmFSRStBbE91c3kxXCInKSxcbiAgICAgICAgICAgICAgICB9KSwgaGFuZGxlcjogYSA9PiB0aGlzLnJlbW92ZUNvbXBvbmVudChhLm5vZGVVdWlkLCBhLmNvbXBvbmVudFR5cGUpIH0sXG4gICAgICAgICAgICB7IG5hbWU6ICdnZXRfY29tcG9uZW50cycsIGRlc2NyaXB0aW9uOiAnTGlzdCBhbGwgY29tcG9uZW50cyBvbiBhIG5vZGUgd2l0aCB0eXBlL2NpZCBhbmQgYmFzaWMgcHJvcGVydGllcy4gTm8gbXV0YXRpb247IHVzZSBiZWZvcmUgcmVtb3ZlX2NvbXBvbmVudCBvciBzZXRfY29tcG9uZW50X3Byb3BlcnR5LicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ05vZGUgVVVJRCB3aG9zZSBjb21wb25lbnRzIHNob3VsZCBiZSBsaXN0ZWQuJyksXG4gICAgICAgICAgICAgICAgfSksIGhhbmRsZXI6IGEgPT4gdGhpcy5nZXRDb21wb25lbnRzKGEubm9kZVV1aWQpIH0sXG4gICAgICAgICAgICB7IG5hbWU6ICdnZXRfY29tcG9uZW50X2luZm8nLCBkZXNjcmlwdGlvbjogJ1JlYWQgZGV0YWlsZWQgZGF0YSBmb3Igb25lIGNvbXBvbmVudCBvbiBhIG5vZGUuIE5vIG11dGF0aW9uOyB1c2UgdG8gaW5zcGVjdCBwcm9wZXJ0eSBuYW1lcyBhbmQgdmFsdWUgc2hhcGVzIGJlZm9yZSBlZGl0aW5nLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ05vZGUgVVVJRCB0aGF0IG93bnMgdGhlIGNvbXBvbmVudC4nKSxcbiAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50VHlwZTogei5zdHJpbmcoKS5kZXNjcmliZSgnQ29tcG9uZW50IHR5cGUvY2lkIHRvIGluc3BlY3QuIFVzZSBnZXRfY29tcG9uZW50cyBmaXJzdCBpZiB1bnN1cmUuJyksXG4gICAgICAgICAgICAgICAgfSksIGhhbmRsZXI6IGEgPT4gdGhpcy5nZXRDb21wb25lbnRJbmZvKGEubm9kZVV1aWQsIGEuY29tcG9uZW50VHlwZSkgfSxcbiAgICAgICAgICAgIHsgbmFtZTogJ3NldF9jb21wb25lbnRfcHJvcGVydHknLCBkZXNjcmlwdGlvbjogJ1NldCBjb21wb25lbnQgcHJvcGVydHkgdmFsdWVzIGZvciBVSSBjb21wb25lbnRzIG9yIGN1c3RvbSBzY3JpcHQgY29tcG9uZW50cy4gU3VwcG9ydHMgc2V0dGluZyBwcm9wZXJ0aWVzIG9mIGJ1aWx0LWluIFVJIGNvbXBvbmVudHMgKGUuZy4sIGNjLkxhYmVsLCBjYy5TcHJpdGUpIGFuZCBjdXN0b20gc2NyaXB0IGNvbXBvbmVudHMuIEFjY2VwdHMgbm9kZVV1aWQgT1Igbm9kZU5hbWUgKHV1aWQgd2lucykuIE5vdGU6IEZvciBub2RlIGJhc2ljIHByb3BlcnRpZXMgKG5hbWUsIGFjdGl2ZSwgbGF5ZXIsIGV0Yy4pLCB1c2Ugc2V0X25vZGVfcHJvcGVydHkuIEZvciBub2RlIHRyYW5zZm9ybSBwcm9wZXJ0aWVzIChwb3NpdGlvbiwgcm90YXRpb24sIHNjYWxlLCBldGMuKSwgdXNlIHNldF9ub2RlX3RyYW5zZm9ybS4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIG5vZGVVdWlkOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1RhcmdldCBub2RlIFVVSUQuIFByb3ZpZGUgdGhpcyBPUiBub2RlTmFtZS4nKSxcbiAgICAgICAgICAgICAgICAgICAgbm9kZU5hbWU6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnVGFyZ2V0IG5vZGUgbmFtZSAoZGVwdGgtZmlyc3QgZmlyc3QgbWF0Y2gpLiBVc2VkIG9ubHkgd2hlbiBub2RlVXVpZCBpcyBvbWl0dGVkLicpLFxuICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRUeXBlOiB6LnN0cmluZygpLmRlc2NyaWJlKCdDb21wb25lbnQgdHlwZSAtIENhbiBiZSBidWlsdC1pbiBjb21wb25lbnRzIChlLmcuLCBjYy5MYWJlbCkgb3IgY3VzdG9tIHNjcmlwdCBjb21wb25lbnRzIChlLmcuLCBNeVNjcmlwdCkuIElmIHVuc3VyZSBhYm91dCBjb21wb25lbnQgdHlwZSwgdXNlIGdldF9jb21wb25lbnRzIGZpcnN0IHRvIHJldHJpZXZlIGFsbCBjb21wb25lbnRzIG9uIHRoZSBub2RlLicpLFxuICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0eTogei5zdHJpbmcoKS5kZXNjcmliZShzZXRDb21wb25lbnRQcm9wZXJ0eVByb3BlcnR5RGVzY3JpcHRpb24pLFxuICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0eVR5cGU6IHouZW51bShbXG4gICAgICAgICAgICAgICAgICAgICAgICAnc3RyaW5nJywgJ251bWJlcicsICdib29sZWFuJywgJ2ludGVnZXInLCAnZmxvYXQnLFxuICAgICAgICAgICAgICAgICAgICAgICAgJ2NvbG9yJywgJ3ZlYzInLCAndmVjMycsICdzaXplJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICdub2RlJywgJ2NvbXBvbmVudCcsICdzcHJpdGVGcmFtZScsICdwcmVmYWInLCAnYXNzZXQnLFxuICAgICAgICAgICAgICAgICAgICAgICAgJ25vZGVBcnJheScsICdjb2xvckFycmF5JywgJ251bWJlckFycmF5JywgJ3N0cmluZ0FycmF5JyxcbiAgICAgICAgICAgICAgICAgICAgXSkuZGVzY3JpYmUoJ1Byb3BlcnR5IHR5cGUgLSBNdXN0IGV4cGxpY2l0bHkgc3BlY2lmeSB0aGUgcHJvcGVydHkgZGF0YSB0eXBlIGZvciBjb3JyZWN0IHZhbHVlIGNvbnZlcnNpb24gYW5kIHZhbGlkYXRpb24nKSxcbiAgICAgICAgICAgICAgICAgICAgdmFsdWU6IHouYW55KCkuZGVzY3JpYmUoc2V0Q29tcG9uZW50UHJvcGVydHlWYWx1ZURlc2NyaXB0aW9uKSxcbiAgICAgICAgICAgICAgICAgICAgcHJlc2VydmVDb250ZW50U2l6ZTogei5ib29sZWFuKCkuZGVmYXVsdChmYWxzZSkuZGVzY3JpYmUoJ1Nwcml0ZS1zcGVjaWZpYyB3b3JrZmxvdyBmbGFnLiBPbmx5IGhvbm91cmVkIHdoZW4gY29tcG9uZW50VHlwZT1cImNjLlNwcml0ZVwiIGFuZCBwcm9wZXJ0eT1cInNwcml0ZUZyYW1lXCI6IGJlZm9yZSB0aGUgYXNzaWduLCBzZXRzIGNjLlNwcml0ZS5zaXplTW9kZSB0byBDVVNUT00gKDApIHNvIHRoZSBlbmdpbmUgZG9lcyBOT1Qgb3ZlcndyaXRlIGNjLlVJVHJhbnNmb3JtLmNvbnRlbnRTaXplIHdpdGggdGhlIHRleHR1cmVcXCdzIG5hdGl2ZSBkaW1lbnNpb25zLiBVc2Ugd2hlbiBidWlsZGluZyBVSSBwcm9jZWR1cmFsbHkgYW5kIHRoZSBub2RlXFwncyBwcmUtc2V0IHNpemUgbXVzdCBiZSBrZXB0OyBsZWF2ZSBmYWxzZSAoZGVmYXVsdCkgdG8ga2VlcCBjb2Nvc1xcJyBzdGFuZGFyZCBUUklNTUVEIGF1dG8tZml0IGJlaGF2aW91ci4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhc3luYyBhID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgciA9IGF3YWl0IHJlc29sdmVPclRvb2xFcnJvcih7IG5vZGVVdWlkOiBhLm5vZGVVdWlkLCBub2RlTmFtZTogYS5ub2RlTmFtZSB9KTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCdyZXNwb25zZScgaW4gcikgcmV0dXJuIHIucmVzcG9uc2U7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLnNldENvbXBvbmVudFByb3BlcnR5KHsgLi4uYSwgbm9kZVV1aWQ6IHIudXVpZCB9KTtcbiAgICAgICAgICAgICAgICB9IH0sXG4gICAgICAgICAgICB7IG5hbWU6ICdhdHRhY2hfc2NyaXB0JywgZGVzY3JpcHRpb246ICdBdHRhY2ggYSBzY3JpcHQgYXNzZXQgYXMgYSBjb21wb25lbnQgdG8gYSBub2RlLiBNdXRhdGVzIHNjZW5lOyB1c2UgZ2V0X2NvbXBvbmVudHMgYWZ0ZXJ3YXJkIGJlY2F1c2UgY3VzdG9tIHNjcmlwdHMgbWF5IGFwcGVhciBhcyBjaWQuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBub2RlVXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnTm9kZSBVVUlEIHRvIGF0dGFjaCB0aGUgc2NyaXB0IGNvbXBvbmVudCB0by4nKSxcbiAgICAgICAgICAgICAgICAgICAgc2NyaXB0UGF0aDogei5zdHJpbmcoKS5kZXNjcmliZSgnU2NyaXB0IGFzc2V0IGRiOi8vIHBhdGgsIGUuZy4gZGI6Ly9hc3NldHMvc2NyaXB0cy9NeVNjcmlwdC50cy4nKSxcbiAgICAgICAgICAgICAgICB9KSwgaGFuZGxlcjogYSA9PiB0aGlzLmF0dGFjaFNjcmlwdChhLm5vZGVVdWlkLCBhLnNjcmlwdFBhdGgpIH0sXG4gICAgICAgICAgICB7IG5hbWU6ICdnZXRfYXZhaWxhYmxlX2NvbXBvbmVudHMnLCBkZXNjcmlwdGlvbjogJ1JldHVybiBhIGN1cmF0ZWQgYnVpbHQtaW4gY29tcG9uZW50IHR5cGUgbGlzdCBieSBjYXRlZ29yeS4gTm8gc2NlbmUgcXVlcnk7IGN1c3RvbSBwcm9qZWN0IHNjcmlwdHMgYXJlIG5vdCBkaXNjb3ZlcmVkIGhlcmUuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBjYXRlZ29yeTogei5lbnVtKFsnYWxsJywgJ3JlbmRlcmVyJywgJ3VpJywgJ3BoeXNpY3MnLCAnYW5pbWF0aW9uJywgJ2F1ZGlvJ10pLmRlZmF1bHQoJ2FsbCcpLmRlc2NyaWJlKCdDb21wb25lbnQgY2F0ZWdvcnkgZmlsdGVyIGZvciB0aGUgYnVpbHQtaW4gY3VyYXRlZCBsaXN0LicpLFxuICAgICAgICAgICAgICAgIH0pLCBoYW5kbGVyOiBhID0+IHRoaXMuZ2V0QXZhaWxhYmxlQ29tcG9uZW50cyhhLmNhdGVnb3J5KSB9LFxuICAgICAgICAgICAgeyBuYW1lOiAnYWRkX2V2ZW50X2hhbmRsZXInLCBkZXNjcmlwdGlvbjogJ0FwcGVuZCBhIGNjLkV2ZW50SGFuZGxlciB0byBhIGNvbXBvbmVudCBldmVudCBhcnJheSBhbmQgbnVkZ2UgdGhlIGVkaXRvciBtb2RlbCBmb3IgcGVyc2lzdGVuY2UuIE11dGF0ZXMgc2NlbmU7IHVzZSBmb3IgQnV0dG9uL1RvZ2dsZS9TbGlkZXIgY2FsbGJhY2tzLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ05vZGUgVVVJRCBvd25pbmcgdGhlIGNvbXBvbmVudCAoZS5nLiB0aGUgQnV0dG9uIG5vZGUpJyksXG4gICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudFR5cGU6IHouc3RyaW5nKCkuZGVmYXVsdCgnY2MuQnV0dG9uJykuZGVzY3JpYmUoJ0NvbXBvbmVudCBjbGFzcyBuYW1lOyBkZWZhdWx0cyB0byBjYy5CdXR0b24nKSxcbiAgICAgICAgICAgICAgICAgICAgZXZlbnRBcnJheVByb3BlcnR5OiB6LnN0cmluZygpLmRlZmF1bHQoJ2NsaWNrRXZlbnRzJykuZGVzY3JpYmUoJ0NvbXBvbmVudCBwcm9wZXJ0eSBob2xkaW5nIHRoZSBFdmVudEhhbmRsZXIgYXJyYXkgKGNjLkJ1dHRvbi5jbGlja0V2ZW50cywgY2MuVG9nZ2xlLmNoZWNrRXZlbnRzLCDigKYpJyksXG4gICAgICAgICAgICAgICAgICAgIHRhcmdldE5vZGVVdWlkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdOb2RlIFVVSUQgd2hlcmUgdGhlIGNhbGxiYWNrIGNvbXBvbmVudCBsaXZlcyAobW9zdCBvZnRlbiB0aGUgc2FtZSBhcyBub2RlVXVpZCknKSxcbiAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50TmFtZTogei5zdHJpbmcoKS5kZXNjcmliZSgnQ2xhc3MgbmFtZSAoY2MtY2xhc3MpIG9mIHRoZSBzY3JpcHQgdGhhdCBvd25zIHRoZSBjYWxsYmFjayBtZXRob2QnKSxcbiAgICAgICAgICAgICAgICAgICAgaGFuZGxlcjogei5zdHJpbmcoKS5kZXNjcmliZSgnTWV0aG9kIG5hbWUgb24gdGhlIHRhcmdldCBjb21wb25lbnQsIGUuZy4gXCJvbkNsaWNrXCInKSxcbiAgICAgICAgICAgICAgICAgICAgY3VzdG9tRXZlbnREYXRhOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ09wdGlvbmFsIHN0cmluZyBwYXNzZWQgYmFjayB3aGVuIHRoZSBldmVudCBmaXJlcycpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGFzeW5jIGEgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCByZXNwID0gYXdhaXQgcnVuU2NlbmVNZXRob2RBc1Rvb2xSZXNwb25zZSgnYWRkRXZlbnRIYW5kbGVyJywgW1xuICAgICAgICAgICAgICAgICAgICAgICAgYS5ub2RlVXVpZCwgYS5jb21wb25lbnRUeXBlLCBhLmV2ZW50QXJyYXlQcm9wZXJ0eSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGEudGFyZ2V0Tm9kZVV1aWQsIGEuY29tcG9uZW50TmFtZSwgYS5oYW5kbGVyLCBhLmN1c3RvbUV2ZW50RGF0YSxcbiAgICAgICAgICAgICAgICAgICAgXSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChyZXNwLnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IG51ZGdlRWRpdG9yTW9kZWwoYS5ub2RlVXVpZCwgYS5jb21wb25lbnRUeXBlLCByZXNwLmRhdGE/LmNvbXBvbmVudFV1aWQpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiByZXNwO1xuICAgICAgICAgICAgICAgIH0gfSxcbiAgICAgICAgICAgIHsgbmFtZTogJ3JlbW92ZV9ldmVudF9oYW5kbGVyJywgZGVzY3JpcHRpb246ICdSZW1vdmUgRXZlbnRIYW5kbGVyIGVudHJpZXMgYnkgaW5kZXggb3IgdGFyZ2V0Tm9kZVV1aWQraGFuZGxlciBtYXRjaCwgdGhlbiBudWRnZSB0aGUgZWRpdG9yIG1vZGVsIGZvciBwZXJzaXN0ZW5jZS4gTXV0YXRlcyBzY2VuZS4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIG5vZGVVdWlkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdOb2RlIFVVSUQgb3duaW5nIHRoZSBjb21wb25lbnQnKSxcbiAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50VHlwZTogei5zdHJpbmcoKS5kZWZhdWx0KCdjYy5CdXR0b24nKS5kZXNjcmliZSgnQ29tcG9uZW50IGNsYXNzIG5hbWUnKSxcbiAgICAgICAgICAgICAgICAgICAgZXZlbnRBcnJheVByb3BlcnR5OiB6LnN0cmluZygpLmRlZmF1bHQoJ2NsaWNrRXZlbnRzJykuZGVzY3JpYmUoJ0V2ZW50SGFuZGxlciBhcnJheSBwcm9wZXJ0eSBuYW1lJyksXG4gICAgICAgICAgICAgICAgICAgIGluZGV4OiB6Lm51bWJlcigpLmludCgpLm1pbigwKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdaZXJvLWJhc2VkIGluZGV4IHRvIHJlbW92ZS4gVGFrZXMgcHJlY2VkZW5jZSBvdmVyIHRhcmdldE5vZGVVdWlkL2hhbmRsZXIgbWF0Y2hpbmcgd2hlbiBwcm92aWRlZC4nKSxcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0Tm9kZVV1aWQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnTWF0Y2ggaGFuZGxlcnMgd2hvc2UgdGFyZ2V0IG5vZGUgaGFzIHRoaXMgVVVJRCcpLFxuICAgICAgICAgICAgICAgICAgICBoYW5kbGVyOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ01hdGNoIGhhbmRsZXJzIHdpdGggdGhpcyBtZXRob2QgbmFtZScpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGFzeW5jIGEgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCByZXNwID0gYXdhaXQgcnVuU2NlbmVNZXRob2RBc1Rvb2xSZXNwb25zZSgncmVtb3ZlRXZlbnRIYW5kbGVyJywgW1xuICAgICAgICAgICAgICAgICAgICAgICAgYS5ub2RlVXVpZCwgYS5jb21wb25lbnRUeXBlLCBhLmV2ZW50QXJyYXlQcm9wZXJ0eSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGEuaW5kZXggPz8gbnVsbCwgYS50YXJnZXROb2RlVXVpZCA/PyBudWxsLCBhLmhhbmRsZXIgPz8gbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgXSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChyZXNwLnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IG51ZGdlRWRpdG9yTW9kZWwoYS5ub2RlVXVpZCwgYS5jb21wb25lbnRUeXBlLCByZXNwLmRhdGE/LmNvbXBvbmVudFV1aWQpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiByZXNwO1xuICAgICAgICAgICAgICAgIH0gfSxcbiAgICAgICAgICAgIHsgbmFtZTogJ2xpc3RfZXZlbnRfaGFuZGxlcnMnLCBkZXNjcmlwdGlvbjogJ0xpc3QgRXZlbnRIYW5kbGVyIGVudHJpZXMgY3VycmVudGx5IGJvdW5kIHRvIGEgY29tcG9uZW50IGV2ZW50IGFycmF5LiBObyBtdXRhdGlvbjsgdXNlIGJlZm9yZSByZW1vdmVfZXZlbnRfaGFuZGxlci4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIG5vZGVVdWlkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdOb2RlIFVVSUQgb3duaW5nIHRoZSBjb21wb25lbnQnKSxcbiAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50VHlwZTogei5zdHJpbmcoKS5kZWZhdWx0KCdjYy5CdXR0b24nKS5kZXNjcmliZSgnQ29tcG9uZW50IGNsYXNzIG5hbWUnKSxcbiAgICAgICAgICAgICAgICAgICAgZXZlbnRBcnJheVByb3BlcnR5OiB6LnN0cmluZygpLmRlZmF1bHQoJ2NsaWNrRXZlbnRzJykuZGVzY3JpYmUoJ0V2ZW50SGFuZGxlciBhcnJheSBwcm9wZXJ0eSBuYW1lJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiBydW5TY2VuZU1ldGhvZEFzVG9vbFJlc3BvbnNlKCdsaXN0RXZlbnRIYW5kbGVycycsIFtcbiAgICAgICAgICAgICAgICAgICAgYS5ub2RlVXVpZCwgYS5jb21wb25lbnRUeXBlLCBhLmV2ZW50QXJyYXlQcm9wZXJ0eSxcbiAgICAgICAgICAgICAgICBdKSB9LFxuICAgICAgICBdO1xuICAgICAgICB0aGlzLmV4ZWMgPSBkZWZpbmVUb29scyhkZWZzKTtcbiAgICB9XG5cbiAgICBnZXRUb29scygpOiBUb29sRGVmaW5pdGlvbltdIHsgcmV0dXJuIHRoaXMuZXhlYy5nZXRUb29scygpOyB9XG4gICAgZXhlY3V0ZSh0b29sTmFtZTogc3RyaW5nLCBhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4geyByZXR1cm4gdGhpcy5leGVjLmV4ZWN1dGUodG9vbE5hbWUsIGFyZ3MpOyB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGFkZENvbXBvbmVudChub2RlVXVpZDogc3RyaW5nLCBjb21wb25lbnRUeXBlOiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoYXN5bmMgKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIC8vIFNuYXBzaG90IGV4aXN0aW5nIGNvbXBvbmVudHMgc28gd2UgY2FuIGRldGVjdCBwb3N0LWFkZCBhZGRpdGlvbnNcbiAgICAgICAgICAgIC8vIGV2ZW4gd2hlbiBDb2NvcyByZXBvcnRzIHRoZW0gdW5kZXIgYSBjaWQgKGN1c3RvbSBzY3JpcHRzKSByYXRoZXJcbiAgICAgICAgICAgIC8vIHRoYW4gdGhlIGNsYXNzIG5hbWUgdGhlIGNhbGxlciBzdXBwbGllZC5cbiAgICAgICAgICAgIGNvbnN0IGJlZm9yZUluZm8gPSBhd2FpdCB0aGlzLmdldENvbXBvbmVudHMobm9kZVV1aWQpO1xuICAgICAgICAgICAgY29uc3QgYmVmb3JlTGlzdDogYW55W10gPSBiZWZvcmVJbmZvLnN1Y2Nlc3MgJiYgYmVmb3JlSW5mby5kYXRhPy5jb21wb25lbnRzID8gYmVmb3JlSW5mby5kYXRhLmNvbXBvbmVudHMgOiBbXTtcbiAgICAgICAgICAgIGNvbnN0IGJlZm9yZVR5cGVzID0gbmV3IFNldChiZWZvcmVMaXN0Lm1hcCgoYzogYW55KSA9PiBjLnR5cGUpKTtcblxuICAgICAgICAgICAgY29uc3QgZXhpc3RpbmdDb21wb25lbnQgPSBiZWZvcmVMaXN0LmZpbmQoKGNvbXA6IGFueSkgPT4gY29tcC50eXBlID09PSBjb21wb25lbnRUeXBlKTtcbiAgICAgICAgICAgIGlmIChleGlzdGluZ0NvbXBvbmVudCkge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgQ29tcG9uZW50ICcke2NvbXBvbmVudFR5cGV9JyBhbHJlYWR5IGV4aXN0cyBvbiBub2RlYCxcbiAgICAgICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRUeXBlLFxuICAgICAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50VmVyaWZpZWQ6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBleGlzdGluZzogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIOWYl+ippuebtOaOpeS9v+eUqCBFZGl0b3IgQVBJIOa3u+WKoOe1hOS7tlxuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnY3JlYXRlLWNvbXBvbmVudCcsIHtcbiAgICAgICAgICAgICAgICB1dWlkOiBub2RlVXVpZCxcbiAgICAgICAgICAgICAgICBjb21wb25lbnQ6IGNvbXBvbmVudFR5cGUsXG4gICAgICAgICAgICB9KS50aGVuKGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgICAvLyDnrYnlvoXkuIDmrrXmmYLplpPorpNFZGl0b3LlrozmiJDntYTku7bmt7vliqBcbiAgICAgICAgICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMTAwKSk7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYWZ0ZXJJbmZvID0gYXdhaXQgdGhpcy5nZXRDb21wb25lbnRzKG5vZGVVdWlkKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFhZnRlckluZm8uc3VjY2VzcyB8fCAhYWZ0ZXJJbmZvLmRhdGE/LmNvbXBvbmVudHMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yOiBgRmFpbGVkIHRvIHZlcmlmeSBjb21wb25lbnQgYWRkaXRpb246ICR7YWZ0ZXJJbmZvLmVycm9yIHx8ICdVbmFibGUgdG8gZ2V0IG5vZGUgY29tcG9uZW50cyd9YCxcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGFmdGVyTGlzdDogYW55W10gPSBhZnRlckluZm8uZGF0YS5jb21wb25lbnRzO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIFN0cmljdCBtYXRjaDogYnVpbHQtaW4gY29tcG9uZW50cyBsaWtlIGNjLlNwcml0ZSBzaG93IHRoZWlyXG4gICAgICAgICAgICAgICAgICAgIC8vIGNsYXNzIG5hbWUgaW4gYHR5cGVgLiBIaXRzIHRoZSBzYW1lIHNoYXBlIHRoZSBjYWxsZXIgcGFzc2VkLlxuICAgICAgICAgICAgICAgICAgICBjb25zdCBhZGRlZENvbXBvbmVudCA9IGFmdGVyTGlzdC5maW5kKChjb21wOiBhbnkpID0+IGNvbXAudHlwZSA9PT0gY29tcG9uZW50VHlwZSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChhZGRlZENvbXBvbmVudCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgQ29tcG9uZW50ICcke2NvbXBvbmVudFR5cGV9JyBhZGRlZCBzdWNjZXNzZnVsbHlgLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudFR5cGUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudFZlcmlmaWVkOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBleGlzdGluZzogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gTGVuaWVudCBmYWxsYmFjazogY3VzdG9tIHNjcmlwdHMgc3VyZmFjZSBhcyBhIGNpZCAoZS5nLlxuICAgICAgICAgICAgICAgICAgICAvLyBcIjliNGE3dWVUOXhENmFSRStBbE91c3kxXCIpIGluIF9fY29tcHNfXy50eXBlLCBub3QgYXMgdGhlXG4gICAgICAgICAgICAgICAgICAgIC8vIGNsYXNzIG5hbWUuIElmIHRoZSBjb21wb25lbnQgY291bnQgZ3JldywgYWNjZXB0IHRoZSBuZXdcbiAgICAgICAgICAgICAgICAgICAgLy8gZW50cnkgYXMgdGhlIG9uZSB3ZSBqdXN0IGFkZGVkLlxuICAgICAgICAgICAgICAgICAgICBjb25zdCBuZXdFbnRyaWVzID0gYWZ0ZXJMaXN0LmZpbHRlcigoY29tcDogYW55KSA9PiAhYmVmb3JlVHlwZXMuaGFzKGNvbXAudHlwZSkpO1xuICAgICAgICAgICAgICAgICAgICBpZiAobmV3RW50cmllcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCByZWdpc3RlcmVkQXMgPSBuZXdFbnRyaWVzWzBdLnR5cGU7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBDb21wb25lbnQgJyR7Y29tcG9uZW50VHlwZX0nIGFkZGVkIHN1Y2Nlc3NmdWxseSAocmVnaXN0ZXJlZCBhcyBjaWQgJyR7cmVnaXN0ZXJlZEFzfSc7IHRoaXMgaXMgbm9ybWFsIGZvciBjdXN0b20gc2NyaXB0cykuYCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5vZGVVdWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRUeXBlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZWdpc3RlcmVkQXMsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudFZlcmlmaWVkOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBleGlzdGluZzogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yOiBgQ29tcG9uZW50ICcke2NvbXBvbmVudFR5cGV9JyB3YXMgbm90IGZvdW5kIG9uIG5vZGUgYWZ0ZXIgYWRkaXRpb24uIEF2YWlsYWJsZSBjb21wb25lbnRzOiAke2FmdGVyTGlzdC5tYXAoKGM6IGFueSkgPT4gYy50eXBlKS5qb2luKCcsICcpfWAsXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKHZlcmlmeUVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yOiBgRmFpbGVkIHRvIHZlcmlmeSBjb21wb25lbnQgYWRkaXRpb246ICR7dmVyaWZ5RXJyb3IubWVzc2FnZX1gLFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIC8vIOWCmeeUqOaWueahiO+8muS9v+eUqOWgtOaZr+iFs+acrFxuICAgICAgICAgICAgICAgIHJ1blNjZW5lTWV0aG9kKCdhZGRDb21wb25lbnRUb05vZGUnLCBbbm9kZVV1aWQsIGNvbXBvbmVudFR5cGVdKS50aGVuKChyZXN1bHQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgfSkuY2F0Y2goKGVycjI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBEaXJlY3QgQVBJIGZhaWxlZDogJHtlcnIubWVzc2FnZX0sIFNjZW5lIHNjcmlwdCBmYWlsZWQ6ICR7ZXJyMi5tZXNzYWdlfWAgfSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyByZW1vdmVDb21wb25lbnQobm9kZVV1aWQ6IHN0cmluZywgY29tcG9uZW50VHlwZTogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKGFzeW5jIChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICAvLyAxLiDmn6Xmib7nr4Dpu57kuIrnmoTmiYDmnInntYTku7ZcbiAgICAgICAgICAgIGNvbnN0IGFsbENvbXBvbmVudHNJbmZvID0gYXdhaXQgdGhpcy5nZXRDb21wb25lbnRzKG5vZGVVdWlkKTtcbiAgICAgICAgICAgIGlmICghYWxsQ29tcG9uZW50c0luZm8uc3VjY2VzcyB8fCAhYWxsQ29tcG9uZW50c0luZm8uZGF0YT8uY29tcG9uZW50cykge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBGYWlsZWQgdG8gZ2V0IGNvbXBvbmVudHMgZm9yIG5vZGUgJyR7bm9kZVV1aWR9JzogJHthbGxDb21wb25lbnRzSW5mby5lcnJvcn1gIH0pO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIDIuIOWPquafpeaJvnR5cGXlrZfmrrXnrYnmlrxjb21wb25lbnRUeXBl55qE57WE5Lu277yI5Y2zY2lk77yJXG4gICAgICAgICAgICBjb25zdCBleGlzdHMgPSBhbGxDb21wb25lbnRzSW5mby5kYXRhLmNvbXBvbmVudHMuc29tZSgoY29tcDogYW55KSA9PiBjb21wLnR5cGUgPT09IGNvbXBvbmVudFR5cGUpO1xuICAgICAgICAgICAgaWYgKCFleGlzdHMpIHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgQ29tcG9uZW50IGNpZCAnJHtjb21wb25lbnRUeXBlfScgbm90IGZvdW5kIG9uIG5vZGUgJyR7bm9kZVV1aWR9Jy4g6KuL55SoZ2V0Q29tcG9uZW50c+eNsuWPlnR5cGXlrZfmrrXvvIhjaWTvvInkvZzngrpjb21wb25lbnRUeXBl44CCYCB9KTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyAzLiDlrpjmlrlBUEnnm7TmjqXnp7vpmaRcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncmVtb3ZlLWNvbXBvbmVudCcsIHtcbiAgICAgICAgICAgICAgICAgICAgdXVpZDogbm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudDogY29tcG9uZW50VHlwZVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIC8vIDQuIOWGjeafpeS4gOasoeeiuuiqjeaYr+WQpuenu+mZpFxuICAgICAgICAgICAgICAgIGNvbnN0IGFmdGVyUmVtb3ZlSW5mbyA9IGF3YWl0IHRoaXMuZ2V0Q29tcG9uZW50cyhub2RlVXVpZCk7XG4gICAgICAgICAgICAgICAgY29uc3Qgc3RpbGxFeGlzdHMgPSBhZnRlclJlbW92ZUluZm8uc3VjY2VzcyAmJiBhZnRlclJlbW92ZUluZm8uZGF0YT8uY29tcG9uZW50cz8uc29tZSgoY29tcDogYW55KSA9PiBjb21wLnR5cGUgPT09IGNvbXBvbmVudFR5cGUpO1xuICAgICAgICAgICAgICAgIGlmIChzdGlsbEV4aXN0cykge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgQ29tcG9uZW50IGNpZCAnJHtjb21wb25lbnRUeXBlfScgd2FzIG5vdCByZW1vdmVkIGZyb20gbm9kZSAnJHtub2RlVXVpZH0nLmAgfSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYENvbXBvbmVudCBjaWQgJyR7Y29tcG9uZW50VHlwZX0nIHJlbW92ZWQgc3VjY2Vzc2Z1bGx5IGZyb20gbm9kZSAnJHtub2RlVXVpZH0nYCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGRhdGE6IHsgbm9kZVV1aWQsIGNvbXBvbmVudFR5cGUgfVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBGYWlsZWQgdG8gcmVtb3ZlIGNvbXBvbmVudDogJHtlcnIubWVzc2FnZX1gIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldENvbXBvbmVudHMobm9kZVV1aWQ6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgLy8g5YSq5YWI5ZqQ6Kmm55u05o6l5L2/55SoIEVkaXRvciBBUEkg5p+l6Kmi56+A6bue5L+h5oGvXG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1ub2RlJywgbm9kZVV1aWQpLnRoZW4oKG5vZGVEYXRhOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAobm9kZURhdGEgJiYgbm9kZURhdGEuX19jb21wc19fKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbXBvbmVudHMgPSBub2RlRGF0YS5fX2NvbXBzX18ubWFwKChjb21wOiBhbnkpID0+ICh7XG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiBjb21wLl9fdHlwZV9fIHx8IGNvbXAuY2lkIHx8IGNvbXAudHlwZSB8fCAnVW5rbm93bicsXG4gICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiBjb21wLnV1aWQ/LnZhbHVlIHx8IGNvbXAudXVpZCB8fCBudWxsLFxuICAgICAgICAgICAgICAgICAgICAgICAgZW5hYmxlZDogY29tcC5lbmFibGVkICE9PSB1bmRlZmluZWQgPyBjb21wLmVuYWJsZWQgOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgcHJvcGVydGllczogdGhpcy5leHRyYWN0Q29tcG9uZW50UHJvcGVydGllcyhjb21wKVxuICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWQ6IG5vZGVVdWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudHM6IGNvbXBvbmVudHNcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ05vZGUgbm90IGZvdW5kIG9yIG5vIGNvbXBvbmVudHMgZGF0YScgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICAvLyDlgpnnlKjmlrnmoYjvvJrkvb/nlKjloLTmma/ohbPmnKxcbiAgICAgICAgICAgICAgICBydW5TY2VuZU1ldGhvZCgnZ2V0Tm9kZUluZm8nLCBbbm9kZVV1aWRdKS50aGVuKChyZXN1bHQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGF0YTogcmVzdWx0LmRhdGEuY29tcG9uZW50c1xuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KS5jYXRjaCgoZXJyMjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYERpcmVjdCBBUEkgZmFpbGVkOiAke2Vyci5tZXNzYWdlfSwgU2NlbmUgc2NyaXB0IGZhaWxlZDogJHtlcnIyLm1lc3NhZ2V9YCB9KTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldENvbXBvbmVudEluZm8obm9kZVV1aWQ6IHN0cmluZywgY29tcG9uZW50VHlwZTogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICAvLyDlhKrlhYjlmpDoqabnm7TmjqXkvb/nlKggRWRpdG9yIEFQSSDmn6XoqaLnr4Dpu57kv6Hmga9cbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LW5vZGUnLCBub2RlVXVpZCkudGhlbigobm9kZURhdGE6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChub2RlRGF0YSAmJiBub2RlRGF0YS5fX2NvbXBzX18pIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY29tcG9uZW50ID0gbm9kZURhdGEuX19jb21wc19fLmZpbmQoKGNvbXA6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY29tcFR5cGUgPSBjb21wLl9fdHlwZV9fIHx8IGNvbXAuY2lkIHx8IGNvbXAudHlwZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBjb21wVHlwZSA9PT0gY29tcG9uZW50VHlwZTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICBpZiAoY29tcG9uZW50KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWQ6IG5vZGVVdWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRUeXBlOiBjb21wb25lbnRUeXBlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbmFibGVkOiBjb21wb25lbnQuZW5hYmxlZCAhPT0gdW5kZWZpbmVkID8gY29tcG9uZW50LmVuYWJsZWQgOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0aWVzOiB0aGlzLmV4dHJhY3RDb21wb25lbnRQcm9wZXJ0aWVzKGNvbXBvbmVudClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBDb21wb25lbnQgJyR7Y29tcG9uZW50VHlwZX0nIG5vdCBmb3VuZCBvbiBub2RlYCB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdOb2RlIG5vdCBmb3VuZCBvciBubyBjb21wb25lbnRzIGRhdGEnIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgLy8g5YKZ55So5pa55qGI77ya5L2/55So5aC05pmv6IWz5pysXG4gICAgICAgICAgICAgICAgcnVuU2NlbmVNZXRob2QoJ2dldE5vZGVJbmZvJywgW25vZGVVdWlkXSkudGhlbigocmVzdWx0OiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdC5zdWNjZXNzICYmIHJlc3VsdC5kYXRhLmNvbXBvbmVudHMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbXBvbmVudCA9IHJlc3VsdC5kYXRhLmNvbXBvbmVudHMuZmluZCgoY29tcDogYW55KSA9PiBjb21wLnR5cGUgPT09IGNvbXBvbmVudFR5cGUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNvbXBvbmVudCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBub2RlVXVpZDogbm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRUeXBlOiBjb21wb25lbnRUeXBlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLi4uY29tcG9uZW50XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYENvbXBvbmVudCAnJHtjb21wb25lbnRUeXBlfScgbm90IGZvdW5kIG9uIG5vZGVgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogcmVzdWx0LmVycm9yIHx8ICdGYWlsZWQgdG8gZ2V0IGNvbXBvbmVudCBpbmZvJyB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pLmNhdGNoKChlcnIyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgRGlyZWN0IEFQSSBmYWlsZWQ6ICR7ZXJyLm1lc3NhZ2V9LCBTY2VuZSBzY3JpcHQgZmFpbGVkOiAke2VycjIubWVzc2FnZX1gIH0pO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgZXh0cmFjdENvbXBvbmVudFByb3BlcnRpZXMoY29tcG9uZW50OiBhbnkpOiBSZWNvcmQ8c3RyaW5nLCBhbnk+IHtcbiAgICAgICAgZGVidWdMb2coYFtleHRyYWN0Q29tcG9uZW50UHJvcGVydGllc10gUHJvY2Vzc2luZyBjb21wb25lbnQ6YCwgT2JqZWN0LmtleXMoY29tcG9uZW50KSk7XG4gICAgICAgIFxuICAgICAgICAvLyDmqqLmn6XntYTku7bmmK/lkKbmnIkgdmFsdWUg5bGs5oCn77yM6YCZ6YCa5bi45YyF5ZCr5a+m6Zqb55qE57WE5Lu25bGs5oCnXG4gICAgICAgIGlmIChjb21wb25lbnQudmFsdWUgJiYgdHlwZW9mIGNvbXBvbmVudC52YWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIGRlYnVnTG9nKGBbZXh0cmFjdENvbXBvbmVudFByb3BlcnRpZXNdIEZvdW5kIGNvbXBvbmVudC52YWx1ZSB3aXRoIHByb3BlcnRpZXM6YCwgT2JqZWN0LmtleXMoY29tcG9uZW50LnZhbHVlKSk7XG4gICAgICAgICAgICByZXR1cm4gY29tcG9uZW50LnZhbHVlOyAvLyDnm7TmjqXov5Tlm54gdmFsdWUg5bCN6LGh77yM5a6D5YyF5ZCr5omA5pyJ57WE5Lu25bGs5oCnXG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vIOWCmeeUqOaWueahiO+8muW+nue1hOS7tuWwjeixoeS4reebtOaOpeaPkOWPluWxrOaAp1xuICAgICAgICBjb25zdCBwcm9wZXJ0aWVzOiBSZWNvcmQ8c3RyaW5nLCBhbnk+ID0ge307XG4gICAgICAgIGNvbnN0IGV4Y2x1ZGVLZXlzID0gWydfX3R5cGVfXycsICdlbmFibGVkJywgJ25vZGUnLCAnX2lkJywgJ19fc2NyaXB0QXNzZXQnLCAndXVpZCcsICduYW1lJywgJ19uYW1lJywgJ19vYmpGbGFncycsICdfZW5hYmxlZCcsICd0eXBlJywgJ3JlYWRvbmx5JywgJ3Zpc2libGUnLCAnY2lkJywgJ2VkaXRvcicsICdleHRlbmRzJ107XG4gICAgICAgIFxuICAgICAgICBmb3IgKGNvbnN0IGtleSBpbiBjb21wb25lbnQpIHtcbiAgICAgICAgICAgIGlmICghZXhjbHVkZUtleXMuaW5jbHVkZXMoa2V5KSAmJiAha2V5LnN0YXJ0c1dpdGgoJ18nKSkge1xuICAgICAgICAgICAgICAgIGRlYnVnTG9nKGBbZXh0cmFjdENvbXBvbmVudFByb3BlcnRpZXNdIEZvdW5kIGRpcmVjdCBwcm9wZXJ0eSAnJHtrZXl9JzpgLCB0eXBlb2YgY29tcG9uZW50W2tleV0pO1xuICAgICAgICAgICAgICAgIHByb3BlcnRpZXNba2V5XSA9IGNvbXBvbmVudFtrZXldO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBkZWJ1Z0xvZyhgW2V4dHJhY3RDb21wb25lbnRQcm9wZXJ0aWVzXSBGaW5hbCBleHRyYWN0ZWQgcHJvcGVydGllczpgLCBPYmplY3Qua2V5cyhwcm9wZXJ0aWVzKSk7XG4gICAgICAgIHJldHVybiBwcm9wZXJ0aWVzO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZmluZENvbXBvbmVudFR5cGVCeVV1aWQoY29tcG9uZW50VXVpZDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XG4gICAgICAgIGRlYnVnTG9nKGBbZmluZENvbXBvbmVudFR5cGVCeVV1aWRdIFNlYXJjaGluZyBmb3IgY29tcG9uZW50IHR5cGUgd2l0aCBVVUlEOiAke2NvbXBvbmVudFV1aWR9YCk7XG4gICAgICAgIGlmICghY29tcG9uZW50VXVpZCkge1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IG5vZGVUcmVlID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktbm9kZS10cmVlJyk7XG4gICAgICAgICAgICBpZiAoIW5vZGVUcmVlKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS53YXJuKCdbZmluZENvbXBvbmVudFR5cGVCeVV1aWRdIEZhaWxlZCB0byBxdWVyeSBub2RlIHRyZWUuJyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IHF1ZXVlOiBhbnlbXSA9IFtub2RlVHJlZV07XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHdoaWxlIChxdWV1ZS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgY3VycmVudE5vZGVJbmZvID0gcXVldWUuc2hpZnQoKTtcbiAgICAgICAgICAgICAgICBpZiAoIWN1cnJlbnROb2RlSW5mbyB8fCAhY3VycmVudE5vZGVJbmZvLnV1aWQpIHtcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZnVsbE5vZGVEYXRhID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktbm9kZScsIGN1cnJlbnROb2RlSW5mby51dWlkKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGZ1bGxOb2RlRGF0YSAmJiBmdWxsTm9kZURhdGEuX19jb21wc19fKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGNvbXAgb2YgZnVsbE5vZGVEYXRhLl9fY29tcHNfXykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbXBBbnkgPSBjb21wIGFzIGFueTsgLy8gQ2FzdCB0byBhbnkgdG8gYWNjZXNzIGR5bmFtaWMgcHJvcGVydGllc1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIFRoZSBjb21wb25lbnQgVVVJRCBpcyBuZXN0ZWQgaW4gdGhlICd2YWx1ZScgcHJvcGVydHlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoY29tcEFueS51dWlkICYmIGNvbXBBbnkudXVpZC52YWx1ZSA9PT0gY29tcG9uZW50VXVpZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjb21wb25lbnRUeXBlID0gY29tcEFueS5fX3R5cGVfXztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYFtmaW5kQ29tcG9uZW50VHlwZUJ5VXVpZF0gRm91bmQgY29tcG9uZW50IHR5cGUgJyR7Y29tcG9uZW50VHlwZX0nIGZvciBVVUlEICR7Y29tcG9uZW50VXVpZH0gb24gbm9kZSAke2Z1bGxOb2RlRGF0YS5uYW1lPy52YWx1ZX1gKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNvbXBvbmVudFR5cGU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oYFtmaW5kQ29tcG9uZW50VHlwZUJ5VXVpZF0gQ291bGQgbm90IHF1ZXJ5IG5vZGUgJHtjdXJyZW50Tm9kZUluZm8udXVpZH06YCwgZSk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKGN1cnJlbnROb2RlSW5mby5jaGlsZHJlbikge1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIGN1cnJlbnROb2RlSW5mby5jaGlsZHJlbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgcXVldWUucHVzaChjaGlsZCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnNvbGUud2FybihgW2ZpbmRDb21wb25lbnRUeXBlQnlVdWlkXSBDb21wb25lbnQgd2l0aCBVVUlEICR7Y29tcG9uZW50VXVpZH0gbm90IGZvdW5kIGluIHNjZW5lIHRyZWUuYCk7XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYFtmaW5kQ29tcG9uZW50VHlwZUJ5VXVpZF0gRXJyb3Igd2hpbGUgc2VhcmNoaW5nIGZvciBjb21wb25lbnQgdHlwZTpgLCBlcnJvcik7XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgc2V0Q29tcG9uZW50UHJvcGVydHkoYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHsgbm9kZVV1aWQsIGNvbXBvbmVudFR5cGUsIHByb3BlcnR5LCBwcm9wZXJ0eVR5cGUsIHZhbHVlIH0gPSBhcmdzO1xuICAgICAgICBcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKGFzeW5jIChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGRlYnVnTG9nKGBbQ29tcG9uZW50VG9vbHNdIFNldHRpbmcgJHtjb21wb25lbnRUeXBlfS4ke3Byb3BlcnR5fSAodHlwZTogJHtwcm9wZXJ0eVR5cGV9KSA9ICR7SlNPTi5zdHJpbmdpZnkodmFsdWUpfSBvbiBub2RlICR7bm9kZVV1aWR9YCk7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgLy8gU3RlcCAwOiDmqqLmuKzmmK/lkKbngrrnr4Dpu57lsazmgKfvvIzlpoLmnpzmmK/liYfph43lrprlkJHliLDlsI3mh4nnmoTnr4Dpu57mlrnms5VcbiAgICAgICAgICAgICAgICBjb25zdCBub2RlUmVkaXJlY3RSZXN1bHQgPSBhd2FpdCB0aGlzLmNoZWNrQW5kUmVkaXJlY3ROb2RlUHJvcGVydGllcyhhcmdzKTtcbiAgICAgICAgICAgICAgICBpZiAobm9kZVJlZGlyZWN0UmVzdWx0KSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUobm9kZVJlZGlyZWN0UmVzdWx0KTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAvLyBTdGVwIDE6IOeNsuWPlue1hOS7tuS/oeaBr++8jOS9v+eUqOiIh2dldENvbXBvbmVudHPnm7jlkIznmoTmlrnms5VcbiAgICAgICAgICAgICAgICBjb25zdCBjb21wb25lbnRzUmVzcG9uc2UgPSBhd2FpdCB0aGlzLmdldENvbXBvbmVudHMobm9kZVV1aWQpO1xuICAgICAgICAgICAgICAgIGlmICghY29tcG9uZW50c1Jlc3BvbnNlLnN1Y2Nlc3MgfHwgIWNvbXBvbmVudHNSZXNwb25zZS5kYXRhKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgICAgICBlcnJvcjogYEZhaWxlZCB0byBnZXQgY29tcG9uZW50cyBmb3Igbm9kZSAnJHtub2RlVXVpZH0nOiAke2NvbXBvbmVudHNSZXNwb25zZS5lcnJvcn1gLFxuICAgICAgICAgICAgICAgICAgICAgICAgaW5zdHJ1Y3Rpb246IGBQbGVhc2UgdmVyaWZ5IHRoYXQgbm9kZSBVVUlEICcke25vZGVVdWlkfScgaXMgY29ycmVjdC4gVXNlIGdldF9hbGxfbm9kZXMgb3IgZmluZF9ub2RlX2J5X25hbWUgdG8gZ2V0IHRoZSBjb3JyZWN0IG5vZGUgVVVJRC5gXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGNvbnN0IGFsbENvbXBvbmVudHMgPSBjb21wb25lbnRzUmVzcG9uc2UuZGF0YS5jb21wb25lbnRzO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIC8vIFN0ZXAgMjog5p+l5om+55uu5qiZ57WE5Lu2XG4gICAgICAgICAgICAgICAgLy8gV2UgY2FwdHVyZSB0aGUgbWF0Y2hlZCBpbmRleCBoZXJlIHNvIFN0ZXAgNSBkb2Vzbid0IG5lZWQgYVxuICAgICAgICAgICAgICAgIC8vIHNlY29uZCBgc2NlbmUvcXVlcnktbm9kZWAgY2FsbDogZ2V0Q29tcG9uZW50cyBhYm92ZSBtYXBzXG4gICAgICAgICAgICAgICAgLy8gX19jb21wc19fIDE6MSAocHJlc2VydmVzIG9yZGVyKSBvbiB0aGUgZGlyZWN0IEFQSSBwYXRoLFxuICAgICAgICAgICAgICAgIC8vIHdoaWNoIGlzIHRoZSBvbmx5IHBhdGggdGhhdCB5aWVsZHMgYGRhdGEuY29tcG9uZW50c2AgaW5cbiAgICAgICAgICAgICAgICAvLyB0aGlzIHNoYXBlIOKAlCB0aGUgcnVuU2NlbmVNZXRob2QgZmFsbGJhY2sgcmV0dXJucyBhIGRpZmZlcmVudFxuICAgICAgICAgICAgICAgIC8vIHNoYXBlIHRoYXQgd291bGRuJ3QgcmVhY2ggaGVyZSB3aXRob3V0IGVycm9yaW5nIGVhcmxpZXIuXG4gICAgICAgICAgICAgICAgbGV0IHRhcmdldENvbXBvbmVudCA9IG51bGw7XG4gICAgICAgICAgICAgICAgbGV0IHRhcmdldENvbXBvbmVudEluZGV4ID0gLTE7XG4gICAgICAgICAgICAgICAgY29uc3QgYXZhaWxhYmxlVHlwZXM6IHN0cmluZ1tdID0gW107XG5cbiAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGFsbENvbXBvbmVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY29tcCA9IGFsbENvbXBvbmVudHNbaV07XG4gICAgICAgICAgICAgICAgICAgIGF2YWlsYWJsZVR5cGVzLnB1c2goY29tcC50eXBlKTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoY29tcC50eXBlID09PSBjb21wb25lbnRUeXBlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0YXJnZXRDb21wb25lbnQgPSBjb21wO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGFyZ2V0Q29tcG9uZW50SW5kZXggPSBpO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoIXRhcmdldENvbXBvbmVudCkge1xuICAgICAgICAgICAgICAgICAgICAvLyDmj5Dkvpvmm7ToqbPntLDnmoTpjK/oqqTkv6Hmga/lkozlu7rorbBcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaW5zdHJ1Y3Rpb24gPSB0aGlzLmdlbmVyYXRlQ29tcG9uZW50U3VnZ2VzdGlvbihjb21wb25lbnRUeXBlLCBhdmFpbGFibGVUeXBlcywgcHJvcGVydHkpO1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGBDb21wb25lbnQgJyR7Y29tcG9uZW50VHlwZX0nIG5vdCBmb3VuZCBvbiBub2RlLiBBdmFpbGFibGUgY29tcG9uZW50czogJHthdmFpbGFibGVUeXBlcy5qb2luKCcsICcpfWAsXG4gICAgICAgICAgICAgICAgICAgICAgICBpbnN0cnVjdGlvbjogaW5zdHJ1Y3Rpb25cbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgLy8gU3RlcCAzOiDoh6rli5XmqqLmuKzlkozovYnmj5vlsazmgKflgLxcbiAgICAgICAgICAgICAgICBsZXQgcHJvcGVydHlJbmZvO1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGRlYnVnTG9nKGBbQ29tcG9uZW50VG9vbHNdIEFuYWx5emluZyBwcm9wZXJ0eTogJHtwcm9wZXJ0eX1gKTtcbiAgICAgICAgICAgICAgICAgICAgcHJvcGVydHlJbmZvID0gdGhpcy5hbmFseXplUHJvcGVydHkodGFyZ2V0Q29tcG9uZW50LCBwcm9wZXJ0eSk7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoYW5hbHl6ZUVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgW0NvbXBvbmVudFRvb2xzXSBFcnJvciBpbiBhbmFseXplUHJvcGVydHk6YCwgYW5hbHl6ZUVycm9yKTtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yOiBgRmFpbGVkIHRvIGFuYWx5emUgcHJvcGVydHkgJyR7cHJvcGVydHl9JzogJHthbmFseXplRXJyb3IubWVzc2FnZX1gXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGlmICghcHJvcGVydHlJbmZvLmV4aXN0cykge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGBQcm9wZXJ0eSAnJHtwcm9wZXJ0eX0nIG5vdCBmb3VuZCBvbiBjb21wb25lbnQgJyR7Y29tcG9uZW50VHlwZX0nLiBBdmFpbGFibGUgcHJvcGVydGllczogJHtwcm9wZXJ0eUluZm8uYXZhaWxhYmxlUHJvcGVydGllcy5qb2luKCcsICcpfWBcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBTdGVwIDMuNTogcHJvcGVydHlUeXBlIHZzIG1ldGFkYXRhIHJlZmVyZW5jZS1raW5kIHByZWZsaWdodC5cbiAgICAgICAgICAgICAgICAvLyBDYXRjaGVzIHRoZSBjb21tb24gcGl0ZmFsbCB3aGVyZSBhIGNjLkNvbXBvbmVudCBzdWJjbGFzcyBmaWVsZFxuICAgICAgICAgICAgICAgIC8vIChlLmcuIGNjLkNhbnZhcy5jYW1lcmFDb21wb25lbnQgOiBjYy5DYW1lcmEpIGdldHMgY2FsbGVkIHdpdGhcbiAgICAgICAgICAgICAgICAvLyBwcm9wZXJ0eVR5cGU6ICdub2RlJyDigJQgdGhlIElQQyBzaWxlbnRseSBhY2NlcHRzIGJ1dCB0aGUgcmVmXG4gICAgICAgICAgICAgICAgLy8gbmV2ZXIgY29ubmVjdHMuIFdlIHN1cmZhY2UgdGhlIHJpZ2h0IHByb3BlcnR5VHlwZSArIHZhbHVlIHNoYXBlLlxuICAgICAgICAgICAgICAgIGNvbnN0IG1pc21hdGNoID0gdGhpcy5kZXRlY3RQcm9wZXJ0eVR5cGVNaXNtYXRjaChcbiAgICAgICAgICAgICAgICAgICAgcHJvcGVydHlJbmZvLFxuICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0eVR5cGUsXG4gICAgICAgICAgICAgICAgICAgIG5vZGVVdWlkLFxuICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRUeXBlLFxuICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0eSxcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIGlmIChtaXNtYXRjaCkge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKG1pc21hdGNoKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIFN0ZXAgNDog6JmV55CG5bGs5oCn5YC85ZKM6Kit572uXG4gICAgICAgICAgICAgICAgY29uc3Qgb3JpZ2luYWxWYWx1ZSA9IHByb3BlcnR5SW5mby5vcmlnaW5hbFZhbHVlO1xuICAgICAgICAgICAgICAgIGxldCBwcm9jZXNzZWRWYWx1ZTogYW55O1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIC8vIOagueaTmuaYjueiuueahHByb3BlcnR5VHlwZeiZleeQhuWxrOaAp+WAvFxuICAgICAgICAgICAgICAgIHN3aXRjaCAocHJvcGVydHlUeXBlKSB7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICAgICAgICAgICAgICAgICAgICBwcm9jZXNzZWRWYWx1ZSA9IFN0cmluZyh2YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgICAgICAgICAgICAgICAgY2FzZSAnaW50ZWdlcic6XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ2Zsb2F0JzpcbiAgICAgICAgICAgICAgICAgICAgICAgIHByb2Nlc3NlZFZhbHVlID0gTnVtYmVyKHZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBjYXNlICdib29sZWFuJzpcbiAgICAgICAgICAgICAgICAgICAgICAgIHByb2Nlc3NlZFZhbHVlID0gQm9vbGVhbih2YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgY2FzZSAnY29sb3InOlxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDlrZfnrKbkuLLmoLzlvI/vvJrmlK/mjIHljYHlha3pgLLliLbjgIHpoY/oibLlkI3nqLHjgIFyZ2IoKS9yZ2JhKClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9jZXNzZWRWYWx1ZSA9IHRoaXMucGFyc2VDb2xvclN0cmluZyh2YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDlsI3osaHmoLzlvI/vvJrpqZforYnkuKbovYnmj5tSR0JB5YC8XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvY2Vzc2VkVmFsdWUgPSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHI6IE1hdGgubWluKDI1NSwgTWF0aC5tYXgoMCwgTnVtYmVyKHZhbHVlLnIpIHx8IDApKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZzogTWF0aC5taW4oMjU1LCBNYXRoLm1heCgwLCBOdW1iZXIodmFsdWUuZykgfHwgMCkpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBiOiBNYXRoLm1pbigyNTUsIE1hdGgubWF4KDAsIE51bWJlcih2YWx1ZS5iKSB8fCAwKSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGE6IHZhbHVlLmEgIT09IHVuZGVmaW5lZCA/IE1hdGgubWluKDI1NSwgTWF0aC5tYXgoMCwgTnVtYmVyKHZhbHVlLmEpKSkgOiAyNTVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0NvbG9yIHZhbHVlIG11c3QgYmUgYW4gb2JqZWN0IHdpdGggciwgZywgYiBwcm9wZXJ0aWVzIG9yIGEgaGV4YWRlY2ltYWwgc3RyaW5nIChlLmcuLCBcIiNGRjAwMDBcIiknKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBjYXNlICd2ZWMyJzpcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvY2Vzc2VkVmFsdWUgPSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHg6IE51bWJlcih2YWx1ZS54KSB8fCAwLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB5OiBOdW1iZXIodmFsdWUueSkgfHwgMFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignVmVjMiB2YWx1ZSBtdXN0IGJlIGFuIG9iamVjdCB3aXRoIHgsIHkgcHJvcGVydGllcycpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ3ZlYzMnOlxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9jZXNzZWRWYWx1ZSA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgeDogTnVtYmVyKHZhbHVlLngpIHx8IDAsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHk6IE51bWJlcih2YWx1ZS55KSB8fCAwLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB6OiBOdW1iZXIodmFsdWUueikgfHwgMFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignVmVjMyB2YWx1ZSBtdXN0IGJlIGFuIG9iamVjdCB3aXRoIHgsIHksIHogcHJvcGVydGllcycpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ3NpemUnOlxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9jZXNzZWRWYWx1ZSA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgd2lkdGg6IE51bWJlcih2YWx1ZS53aWR0aCkgfHwgMCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaGVpZ2h0OiBOdW1iZXIodmFsdWUuaGVpZ2h0KSB8fCAwXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdTaXplIHZhbHVlIG11c3QgYmUgYW4gb2JqZWN0IHdpdGggd2lkdGgsIGhlaWdodCBwcm9wZXJ0aWVzJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgY2FzZSAnbm9kZSc6XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb2Nlc3NlZFZhbHVlID0geyB1dWlkOiB2YWx1ZSB9O1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vZGUgcmVmZXJlbmNlIHZhbHVlIG11c3QgYmUgYSBzdHJpbmcgVVVJRCcpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ2NvbXBvbmVudCc6XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOe1hOS7tuW8leeUqOmcgOimgeeJueauiuiZleeQhu+8mumAmumBjuevgOm7nlVVSUTmib7liLDntYTku7bnmoRfX2lkX19cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9jZXNzZWRWYWx1ZSA9IHZhbHVlOyAvLyDlhYjkv53lrZjnr4Dpu55VVUlE77yM5b6M57qM5pyD6L2J5o+b54K6X19pZF9fXG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignQ29tcG9uZW50IHJlZmVyZW5jZSB2YWx1ZSBtdXN0IGJlIGEgc3RyaW5nIChub2RlIFVVSUQgY29udGFpbmluZyB0aGUgdGFyZ2V0IGNvbXBvbmVudCknKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBjYXNlICdzcHJpdGVGcmFtZSc6XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ3ByZWZhYic6XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ2Fzc2V0JzpcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvY2Vzc2VkVmFsdWUgPSB7IHV1aWQ6IHZhbHVlIH07XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgJHtwcm9wZXJ0eVR5cGV9IHZhbHVlIG11c3QgYmUgYSBzdHJpbmcgVVVJRGApO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ25vZGVBcnJheSc6XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9jZXNzZWRWYWx1ZSA9IHZhbHVlLm1hcCgoaXRlbTogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgaXRlbSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB7IHV1aWQ6IGl0ZW0gfTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignTm9kZUFycmF5IGl0ZW1zIG11c3QgYmUgc3RyaW5nIFVVSURzJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdOb2RlQXJyYXkgdmFsdWUgbXVzdCBiZSBhbiBhcnJheScpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ2NvbG9yQXJyYXknOlxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvY2Vzc2VkVmFsdWUgPSB2YWx1ZS5tYXAoKGl0ZW06IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGl0ZW0gPT09ICdvYmplY3QnICYmIGl0ZW0gIT09IG51bGwgJiYgJ3InIGluIGl0ZW0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcjogTWF0aC5taW4oMjU1LCBNYXRoLm1heCgwLCBOdW1iZXIoaXRlbS5yKSB8fCAwKSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZzogTWF0aC5taW4oMjU1LCBNYXRoLm1heCgwLCBOdW1iZXIoaXRlbS5nKSB8fCAwKSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYjogTWF0aC5taW4oMjU1LCBNYXRoLm1heCgwLCBOdW1iZXIoaXRlbS5iKSB8fCAwKSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYTogaXRlbS5hICE9PSB1bmRlZmluZWQgPyBNYXRoLm1pbigyNTUsIE1hdGgubWF4KDAsIE51bWJlcihpdGVtLmEpKSkgOiAyNTVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4geyByOiAyNTUsIGc6IDI1NSwgYjogMjU1LCBhOiAyNTUgfTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0NvbG9yQXJyYXkgdmFsdWUgbXVzdCBiZSBhbiBhcnJheScpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ251bWJlckFycmF5JzpcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb2Nlc3NlZFZhbHVlID0gdmFsdWUubWFwKChpdGVtOiBhbnkpID0+IE51bWJlcihpdGVtKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignTnVtYmVyQXJyYXkgdmFsdWUgbXVzdCBiZSBhbiBhcnJheScpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ3N0cmluZ0FycmF5JzpcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb2Nlc3NlZFZhbHVlID0gdmFsdWUubWFwKChpdGVtOiBhbnkpID0+IFN0cmluZyhpdGVtKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignU3RyaW5nQXJyYXkgdmFsdWUgbXVzdCBiZSBhbiBhcnJheScpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVuc3VwcG9ydGVkIHByb3BlcnR5IHR5cGU6ICR7cHJvcGVydHlUeXBlfWApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgW0NvbXBvbmVudFRvb2xzXSBDb252ZXJ0aW5nIHZhbHVlOiAke0pTT04uc3RyaW5naWZ5KHZhbHVlKX0gLT4gJHtKU09OLnN0cmluZ2lmeShwcm9jZXNzZWRWYWx1ZSl9ICh0eXBlOiAke3Byb3BlcnR5VHlwZX0pYCk7XG4gICAgICAgICAgICAgICAgZGVidWdMb2coYFtDb21wb25lbnRUb29sc10gUHJvcGVydHkgYW5hbHlzaXMgcmVzdWx0OiBwcm9wZXJ0eUluZm8udHlwZT1cIiR7cHJvcGVydHlJbmZvLnR5cGV9XCIsIHByb3BlcnR5VHlwZT1cIiR7cHJvcGVydHlUeXBlfVwiYCk7XG4gICAgICAgICAgICAgICAgZGVidWdMb2coYFtDb21wb25lbnRUb29sc10gV2lsbCB1c2UgY29sb3Igc3BlY2lhbCBoYW5kbGluZzogJHtwcm9wZXJ0eVR5cGUgPT09ICdjb2xvcicgJiYgcHJvY2Vzc2VkVmFsdWUgJiYgdHlwZW9mIHByb2Nlc3NlZFZhbHVlID09PSAnb2JqZWN0J31gKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAvLyDnlKjmlrzpqZforYnnmoTlr6bpmpvmnJ/mnJvlgLzvvIjlsI3mlrzntYTku7blvJXnlKjpnIDopoHnibnmroromZXnkIbvvIlcbiAgICAgICAgICAgICAgICBsZXQgYWN0dWFsRXhwZWN0ZWRWYWx1ZSA9IHByb2Nlc3NlZFZhbHVlO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIC8vIFN0ZXAgNTog5qeL5bu65bGs5oCn6Lev5b6R77yIY29tcG9uZW50IGluZGV4IOW3suWcqCBTdGVwIDIg5o2V542y77yJXG4gICAgICAgICAgICAgICAgY29uc3QgcmF3Q29tcG9uZW50SW5kZXggPSB0YXJnZXRDb21wb25lbnRJbmRleDtcbiAgICAgICAgICAgICAgICBsZXQgcHJvcGVydHlQYXRoID0gYF9fY29tcHNfXy4ke3Jhd0NvbXBvbmVudEluZGV4fS4ke3Byb3BlcnR5fWA7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgLy8g54m55q6K6JmV55CG6LOH5rqQ6aGe5bGs5oCnXG4gICAgICAgICAgICAgICAgaWYgKHByb3BlcnR5VHlwZSA9PT0gJ2Fzc2V0JyB8fCBwcm9wZXJ0eVR5cGUgPT09ICdzcHJpdGVGcmFtZScgfHwgcHJvcGVydHlUeXBlID09PSAncHJlZmFiJyB8fFxuICAgICAgICAgICAgICAgICAgICAocHJvcGVydHlJbmZvLnR5cGUgPT09ICdhc3NldCcgJiYgcHJvcGVydHlUeXBlID09PSAnc3RyaW5nJykpIHtcblxuICAgICAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgW0NvbXBvbmVudFRvb2xzXSBTZXR0aW5nIGFzc2V0IHJlZmVyZW5jZTpgLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZTogcHJvY2Vzc2VkVmFsdWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0eTogcHJvcGVydHksXG4gICAgICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0eVR5cGU6IHByb3BlcnR5VHlwZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhdGg6IHByb3BlcnR5UGF0aFxuICAgICAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgICAgICAvLyBXb3JrZmxvdyBvcHQtaW46IHdoZW4gYXNzaWduaW5nIGNjLlNwcml0ZS5zcHJpdGVGcmFtZSBhbmQgdGhlXG4gICAgICAgICAgICAgICAgICAgIC8vIGNhbGxlciB3YW50cyB0aGUgbm9kZSdzIGV4aXN0aW5nIFVJVHJhbnNmb3JtIGNvbnRlbnRTaXplIGtlcHQsXG4gICAgICAgICAgICAgICAgICAgIC8vIHByZS1zZXQgc2l6ZU1vZGUgdG8gQ1VTVE9NICgwKS4gY29jb3MnIGRlZmF1bHQgVFJJTU1FRCB3b3VsZFxuICAgICAgICAgICAgICAgICAgICAvLyBvdGhlcndpc2UgYXV0by1yZXNpemUgY29udGVudFNpemUgdG8gdGhlIHRleHR1cmUncyBuYXRpdmVcbiAgICAgICAgICAgICAgICAgICAgLy8gZGltZW5zaW9ucyBvbiBhc3NpZ24g4oCUIHVzdWFsbHkgdW53YW50ZWQgd2hlbiBsYXlpbmcgb3V0IFVJXG4gICAgICAgICAgICAgICAgICAgIC8vIHByb2NlZHVyYWxseSB3aXRoIGEgY2hvc2VuIHNpemUuXG4gICAgICAgICAgICAgICAgICAgIGlmIChhcmdzLnByZXNlcnZlQ29udGVudFNpemUgJiYgY29tcG9uZW50VHlwZSA9PT0gJ2NjLlNwcml0ZScgJiYgcHJvcGVydHkgPT09ICdzcHJpdGVGcmFtZScpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnc2V0LXByb3BlcnR5Jywge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiBub2RlVXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcGF0aDogYF9fY29tcHNfXy4ke3Jhd0NvbXBvbmVudEluZGV4fS5zaXplTW9kZWAsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGR1bXA6IHsgdmFsdWU6IDAgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWJ1Z0xvZygnW0NvbXBvbmVudFRvb2xzXSBwcmVzZXJ2ZUNvbnRlbnRTaXplOiBmb3JjZWQgY2MuU3ByaXRlLnNpemVNb2RlPUNVU1RPTSgwKSBiZWZvcmUgc3ByaXRlRnJhbWUgYXNzaWduJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIChwcmVFcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oJ1tDb21wb25lbnRUb29sc10gcHJlc2VydmVDb250ZW50U2l6ZSBwcmUtc2V0IGZhaWxlZCAobm9uLWZhdGFsKTonLCBwcmVFcnIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gRGV0ZXJtaW5lIGFzc2V0IHR5cGUgYmFzZWQgb24gcHJvcGVydHkgbmFtZVxuICAgICAgICAgICAgICAgICAgICBsZXQgYXNzZXRUeXBlID0gJ2NjLlNwcml0ZUZyYW1lJzsgLy8gZGVmYXVsdFxuICAgICAgICAgICAgICAgICAgICBpZiAocHJvcGVydHkudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygndGV4dHVyZScpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhc3NldFR5cGUgPSAnY2MuVGV4dHVyZTJEJztcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdtYXRlcmlhbCcpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhc3NldFR5cGUgPSAnY2MuTWF0ZXJpYWwnO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5LnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ2ZvbnQnKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXNzZXRUeXBlID0gJ2NjLkZvbnQnO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5LnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ2NsaXAnKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXNzZXRUeXBlID0gJ2NjLkF1ZGlvQ2xpcCc7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlUeXBlID09PSAncHJlZmFiJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXNzZXRUeXBlID0gJ2NjLlByZWZhYic7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdzZXQtcHJvcGVydHknLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiBub2RlVXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhdGg6IHByb3BlcnR5UGF0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGR1bXA6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZTogcHJvY2Vzc2VkVmFsdWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogYXNzZXRUeXBlXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoY29tcG9uZW50VHlwZSA9PT0gJ2NjLlVJVHJhbnNmb3JtJyAmJiAocHJvcGVydHkgPT09ICdfY29udGVudFNpemUnIHx8IHByb3BlcnR5ID09PSAnY29udGVudFNpemUnKSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBTcGVjaWFsIGhhbmRsaW5nIGZvciBVSVRyYW5zZm9ybSBjb250ZW50U2l6ZSAtIHNldCB3aWR0aCBhbmQgaGVpZ2h0IHNlcGFyYXRlbHlcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgd2lkdGggPSBOdW1iZXIodmFsdWUud2lkdGgpIHx8IDEwMDtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaGVpZ2h0ID0gTnVtYmVyKHZhbHVlLmhlaWdodCkgfHwgMTAwO1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgLy8gU2V0IHdpZHRoIGZpcnN0XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3NldC1wcm9wZXJ0eScsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IG5vZGVVdWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgcGF0aDogYF9fY29tcHNfXy4ke3Jhd0NvbXBvbmVudEluZGV4fS53aWR0aGAsXG4gICAgICAgICAgICAgICAgICAgICAgICBkdW1wOiB7IHZhbHVlOiB3aWR0aCB9XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgLy8gVGhlbiBzZXQgaGVpZ2h0XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3NldC1wcm9wZXJ0eScsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IG5vZGVVdWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgcGF0aDogYF9fY29tcHNfXy4ke3Jhd0NvbXBvbmVudEluZGV4fS5oZWlnaHRgLFxuICAgICAgICAgICAgICAgICAgICAgICAgZHVtcDogeyB2YWx1ZTogaGVpZ2h0IH1cbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChjb21wb25lbnRUeXBlID09PSAnY2MuVUlUcmFuc2Zvcm0nICYmIChwcm9wZXJ0eSA9PT0gJ19hbmNob3JQb2ludCcgfHwgcHJvcGVydHkgPT09ICdhbmNob3JQb2ludCcpKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIFNwZWNpYWwgaGFuZGxpbmcgZm9yIFVJVHJhbnNmb3JtIGFuY2hvclBvaW50IC0gc2V0IGFuY2hvclggYW5kIGFuY2hvclkgc2VwYXJhdGVseVxuICAgICAgICAgICAgICAgICAgICBjb25zdCBhbmNob3JYID0gTnVtYmVyKHZhbHVlLngpIHx8IDAuNTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYW5jaG9yWSA9IE51bWJlcih2YWx1ZS55KSB8fCAwLjU7XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAvLyBTZXQgYW5jaG9yWCBmaXJzdFxuICAgICAgICAgICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdzZXQtcHJvcGVydHknLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiBub2RlVXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhdGg6IGBfX2NvbXBzX18uJHtyYXdDb21wb25lbnRJbmRleH0uYW5jaG9yWGAsXG4gICAgICAgICAgICAgICAgICAgICAgICBkdW1wOiB7IHZhbHVlOiBhbmNob3JYIH1cbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAvLyBUaGVuIHNldCBhbmNob3JZICBcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnc2V0LXByb3BlcnR5Jywge1xuICAgICAgICAgICAgICAgICAgICAgICAgdXVpZDogbm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBwYXRoOiBgX19jb21wc19fLiR7cmF3Q29tcG9uZW50SW5kZXh9LmFuY2hvcllgLFxuICAgICAgICAgICAgICAgICAgICAgICAgZHVtcDogeyB2YWx1ZTogYW5jaG9yWSB9XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlUeXBlID09PSAnY29sb3InICYmIHByb2Nlc3NlZFZhbHVlICYmIHR5cGVvZiBwcm9jZXNzZWRWYWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8g54m55q6K6JmV55CG6aGP6Imy5bGs5oCn77yM56K65L+dUkdCQeWAvOato+eiulxuICAgICAgICAgICAgICAgICAgICAvLyBDb2NvcyBDcmVhdG9y6aGP6Imy5YC856+E5ZyN5pivMC0yNTVcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY29sb3JWYWx1ZSA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHI6IE1hdGgubWluKDI1NSwgTWF0aC5tYXgoMCwgTnVtYmVyKHByb2Nlc3NlZFZhbHVlLnIpIHx8IDApKSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGc6IE1hdGgubWluKDI1NSwgTWF0aC5tYXgoMCwgTnVtYmVyKHByb2Nlc3NlZFZhbHVlLmcpIHx8IDApKSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGI6IE1hdGgubWluKDI1NSwgTWF0aC5tYXgoMCwgTnVtYmVyKHByb2Nlc3NlZFZhbHVlLmIpIHx8IDApKSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGE6IHByb2Nlc3NlZFZhbHVlLmEgIT09IHVuZGVmaW5lZCA/IE1hdGgubWluKDI1NSwgTWF0aC5tYXgoMCwgTnVtYmVyKHByb2Nlc3NlZFZhbHVlLmEpKSkgOiAyNTVcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIGRlYnVnTG9nKGBbQ29tcG9uZW50VG9vbHNdIFNldHRpbmcgY29sb3IgdmFsdWU6YCwgY29sb3JWYWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdzZXQtcHJvcGVydHknLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiBub2RlVXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhdGg6IHByb3BlcnR5UGF0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGR1bXA6IHsgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWU6IGNvbG9yVmFsdWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogJ2NjLkNvbG9yJ1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5VHlwZSA9PT0gJ3ZlYzMnICYmIHByb2Nlc3NlZFZhbHVlICYmIHR5cGVvZiBwcm9jZXNzZWRWYWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8g54m55q6K6JmV55CGVmVjM+WxrOaAp1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB2ZWMzVmFsdWUgPSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB4OiBOdW1iZXIocHJvY2Vzc2VkVmFsdWUueCkgfHwgMCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHk6IE51bWJlcihwcm9jZXNzZWRWYWx1ZS55KSB8fCAwLFxuICAgICAgICAgICAgICAgICAgICAgICAgejogTnVtYmVyKHByb2Nlc3NlZFZhbHVlLnopIHx8IDBcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3NldC1wcm9wZXJ0eScsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IG5vZGVVdWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgcGF0aDogcHJvcGVydHlQYXRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgZHVtcDogeyBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZTogdmVjM1ZhbHVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6ICdjYy5WZWMzJ1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5VHlwZSA9PT0gJ3ZlYzInICYmIHByb2Nlc3NlZFZhbHVlICYmIHR5cGVvZiBwcm9jZXNzZWRWYWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8g54m55q6K6JmV55CGVmVjMuWxrOaAp1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB2ZWMyVmFsdWUgPSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB4OiBOdW1iZXIocHJvY2Vzc2VkVmFsdWUueCkgfHwgMCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHk6IE51bWJlcihwcm9jZXNzZWRWYWx1ZS55KSB8fCAwXG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdzZXQtcHJvcGVydHknLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiBub2RlVXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhdGg6IHByb3BlcnR5UGF0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGR1bXA6IHsgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWU6IHZlYzJWYWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiAnY2MuVmVjMidcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eVR5cGUgPT09ICdzaXplJyAmJiBwcm9jZXNzZWRWYWx1ZSAmJiB0eXBlb2YgcHJvY2Vzc2VkVmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIOeJueauiuiZleeQhlNpemXlsazmgKdcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgc2l6ZVZhbHVlID0ge1xuICAgICAgICAgICAgICAgICAgICAgICAgd2lkdGg6IE51bWJlcihwcm9jZXNzZWRWYWx1ZS53aWR0aCkgfHwgMCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGhlaWdodDogTnVtYmVyKHByb2Nlc3NlZFZhbHVlLmhlaWdodCkgfHwgMFxuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnc2V0LXByb3BlcnR5Jywge1xuICAgICAgICAgICAgICAgICAgICAgICAgdXVpZDogbm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBwYXRoOiBwcm9wZXJ0eVBhdGgsXG4gICAgICAgICAgICAgICAgICAgICAgICBkdW1wOiB7IFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlOiBzaXplVmFsdWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogJ2NjLlNpemUnXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlUeXBlID09PSAnbm9kZScgJiYgcHJvY2Vzc2VkVmFsdWUgJiYgdHlwZW9mIHByb2Nlc3NlZFZhbHVlID09PSAnb2JqZWN0JyAmJiAndXVpZCcgaW4gcHJvY2Vzc2VkVmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8g54m55q6K6JmV55CG56+A6bue5byV55SoXG4gICAgICAgICAgICAgICAgICAgIGRlYnVnTG9nKGBbQ29tcG9uZW50VG9vbHNdIFNldHRpbmcgbm9kZSByZWZlcmVuY2Ugd2l0aCBVVUlEOiAke3Byb2Nlc3NlZFZhbHVlLnV1aWR9YCk7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3NldC1wcm9wZXJ0eScsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IG5vZGVVdWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgcGF0aDogcHJvcGVydHlQYXRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgZHVtcDogeyBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZTogcHJvY2Vzc2VkVmFsdWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogJ2NjLk5vZGUnXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlUeXBlID09PSAnY29tcG9uZW50JyAmJiB0eXBlb2YgcHJvY2Vzc2VkVmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIOeJueauiuiZleeQhue1hOS7tuW8leeUqO+8mumAmumBjuevgOm7nlVVSUTmib7liLDntYTku7bnmoRfX2lkX19cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdGFyZ2V0Tm9kZVV1aWQgPSBwcm9jZXNzZWRWYWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYFtDb21wb25lbnRUb29sc10gU2V0dGluZyBjb21wb25lbnQgcmVmZXJlbmNlIC0gZmluZGluZyBjb21wb25lbnQgb24gbm9kZTogJHt0YXJnZXROb2RlVXVpZH1gKTtcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIC8vIOW+nueVtuWJjee1hOS7tueahOWxrOaAp+WFg+aVuOaTmuS4reeNsuWPluacn+acm+eahOe1hOS7tumhnuWei1xuICAgICAgICAgICAgICAgICAgICBsZXQgZXhwZWN0ZWRDb21wb25lbnRUeXBlID0gJyc7XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAvLyDnjbLlj5bnlbbliY3ntYTku7bnmoToqbPntLDkv6Hmga/vvIzljIXmi6zlsazmgKflhYPmlbjmk5pcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY3VycmVudENvbXBvbmVudEluZm8gPSBhd2FpdCB0aGlzLmdldENvbXBvbmVudEluZm8obm9kZVV1aWQsIGNvbXBvbmVudFR5cGUpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoY3VycmVudENvbXBvbmVudEluZm8uc3VjY2VzcyAmJiBjdXJyZW50Q29tcG9uZW50SW5mby5kYXRhPy5wcm9wZXJ0aWVzPy5bcHJvcGVydHldKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBwcm9wZXJ0eU1ldGEgPSBjdXJyZW50Q29tcG9uZW50SW5mby5kYXRhLnByb3BlcnRpZXNbcHJvcGVydHldO1xuICAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyDlvp7lsazmgKflhYPmlbjmk5rkuK3mj5Dlj5bntYTku7bpoZ7lnovkv6Hmga9cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChwcm9wZXJ0eU1ldGEgJiYgdHlwZW9mIHByb3BlcnR5TWV0YSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDmqqLmn6XmmK/lkKbmnIl0eXBl5a2X5q615oyH56S657WE5Lu26aGe5Z6LXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHByb3BlcnR5TWV0YS50eXBlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4cGVjdGVkQ29tcG9uZW50VHlwZSA9IHByb3BlcnR5TWV0YS50eXBlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlNZXRhLmN0b3IpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5pyJ5Lqb5bGs5oCn5Y+v6IO95L2/55SoY3RvcuWtl+autVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBleHBlY3RlZENvbXBvbmVudFR5cGUgPSBwcm9wZXJ0eU1ldGEuY3RvcjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5TWV0YS5leHRlbmRzICYmIEFycmF5LmlzQXJyYXkocHJvcGVydHlNZXRhLmV4dGVuZHMpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOaqouafpWV4dGVuZHPmlbjntYTvvIzpgJrluLjnrKzkuIDlgIvmmK/mnIDlhbfpq5TnmoTpoZ7lnotcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBleHRlbmRUeXBlIG9mIHByb3BlcnR5TWV0YS5leHRlbmRzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoZXh0ZW5kVHlwZS5zdGFydHNXaXRoKCdjYy4nKSAmJiBleHRlbmRUeXBlICE9PSAnY2MuQ29tcG9uZW50JyAmJiBleHRlbmRUeXBlICE9PSAnY2MuT2JqZWN0Jykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4cGVjdGVkQ29tcG9uZW50VHlwZSA9IGV4dGVuZFR5cGU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIGlmICghZXhwZWN0ZWRDb21wb25lbnRUeXBlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVuYWJsZSB0byBkZXRlcm1pbmUgcmVxdWlyZWQgY29tcG9uZW50IHR5cGUgZm9yIHByb3BlcnR5ICcke3Byb3BlcnR5fScgb24gY29tcG9uZW50ICcke2NvbXBvbmVudFR5cGV9Jy4gUHJvcGVydHkgbWV0YWRhdGEgbWF5IG5vdCBjb250YWluIHR5cGUgaW5mb3JtYXRpb24uYCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIGRlYnVnTG9nKGBbQ29tcG9uZW50VG9vbHNdIERldGVjdGVkIHJlcXVpcmVkIGNvbXBvbmVudCB0eXBlOiAke2V4cGVjdGVkQ29tcG9uZW50VHlwZX0gZm9yIHByb3BlcnR5OiAke3Byb3BlcnR5fWApO1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIOeNsuWPluebruaomeevgOm7nueahOe1hOS7tuS/oeaBr1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgdGFyZ2V0Tm9kZURhdGEgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1ub2RlJywgdGFyZ2V0Tm9kZVV1aWQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCF0YXJnZXROb2RlRGF0YSB8fCAhdGFyZ2V0Tm9kZURhdGEuX19jb21wc19fKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBUYXJnZXQgbm9kZSAke3RhcmdldE5vZGVVdWlkfSBub3QgZm91bmQgb3IgaGFzIG5vIGNvbXBvbmVudHNgKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAgICAgLy8g5omT5Y2w55uu5qiZ56+A6bue55qE57WE5Lu25qaC6Ka9XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgW0NvbXBvbmVudFRvb2xzXSBUYXJnZXQgbm9kZSAke3RhcmdldE5vZGVVdWlkfSBoYXMgJHt0YXJnZXROb2RlRGF0YS5fX2NvbXBzX18ubGVuZ3RofSBjb21wb25lbnRzOmApO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGFyZ2V0Tm9kZURhdGEuX19jb21wc19fLmZvckVhY2goKGNvbXA6IGFueSwgaW5kZXg6IG51bWJlcikgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHNjZW5lSWQgPSBjb21wLnZhbHVlICYmIGNvbXAudmFsdWUudXVpZCAmJiBjb21wLnZhbHVlLnV1aWQudmFsdWUgPyBjb21wLnZhbHVlLnV1aWQudmFsdWUgOiAndW5rbm93bic7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYFtDb21wb25lbnRUb29sc10gQ29tcG9uZW50ICR7aW5kZXh9OiAke2NvbXAudHlwZX0gKHNjZW5lX2lkOiAke3NjZW5lSWR9KWApO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIOafpeaJvuWwjeaHieeahOe1hOS7tlxuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IHRhcmdldENvbXBvbmVudCA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgY29tcG9uZW50SWQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyDlnKjnm67mqJnnr4Dpu57nmoRfY29tcG9uZW50c+aVuOe1hOS4reafpeaJvuaMh+WumumhnuWei+eahOe1hOS7tlxuICAgICAgICAgICAgICAgICAgICAgICAgLy8g5rOo5oSP77yaX19jb21wc19f5ZKMX2NvbXBvbmVudHPnmoTntKLlvJXmmK/lsI3mh4nnmoRcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlYnVnTG9nKGBbQ29tcG9uZW50VG9vbHNdIFNlYXJjaGluZyBmb3IgY29tcG9uZW50IHR5cGU6ICR7ZXhwZWN0ZWRDb21wb25lbnRUeXBlfWApO1xuICAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRhcmdldE5vZGVEYXRhLl9fY29tcHNfXy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbXAgPSB0YXJnZXROb2RlRGF0YS5fX2NvbXBzX19baV0gYXMgYW55O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlYnVnTG9nKGBbQ29tcG9uZW50VG9vbHNdIENoZWNraW5nIGNvbXBvbmVudCAke2l9OiB0eXBlPSR7Y29tcC50eXBlfSwgdGFyZ2V0PSR7ZXhwZWN0ZWRDb21wb25lbnRUeXBlfWApO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjb21wLnR5cGUgPT09IGV4cGVjdGVkQ29tcG9uZW50VHlwZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0YXJnZXRDb21wb25lbnQgPSBjb21wO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgW0NvbXBvbmVudFRvb2xzXSBGb3VuZCBtYXRjaGluZyBjb21wb25lbnQgYXQgaW5kZXggJHtpfTogJHtjb21wLnR5cGV9YCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDlvp7ntYTku7bnmoR2YWx1ZS51dWlkLnZhbHVl5Lit542y5Y+W57WE5Lu25Zyo5aC05pmv5Lit55qESURcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNvbXAudmFsdWUgJiYgY29tcC52YWx1ZS51dWlkICYmIGNvbXAudmFsdWUudXVpZC52YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50SWQgPSBjb21wLnZhbHVlLnV1aWQudmFsdWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgW0NvbXBvbmVudFRvb2xzXSBHb3QgY29tcG9uZW50SWQgZnJvbSBjb21wLnZhbHVlLnV1aWQudmFsdWU6ICR7Y29tcG9uZW50SWR9YCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgW0NvbXBvbmVudFRvb2xzXSBDb21wb25lbnQgc3RydWN0dXJlOmAsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBoYXNWYWx1ZTogISFjb21wLnZhbHVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGhhc1V1aWQ6ICEhKGNvbXAudmFsdWUgJiYgY29tcC52YWx1ZS51dWlkKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBoYXNVdWlkVmFsdWU6ICEhKGNvbXAudmFsdWUgJiYgY29tcC52YWx1ZS51dWlkICYmIGNvbXAudmFsdWUudXVpZC52YWx1ZSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdXVpZFN0cnVjdHVyZTogY29tcC52YWx1ZSA/IGNvbXAudmFsdWUudXVpZCA6ICdObyB2YWx1ZSdcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmFibGUgdG8gZXh0cmFjdCBjb21wb25lbnQgSUQgZnJvbSBjb21wb25lbnQgc3RydWN0dXJlYCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCF0YXJnZXRDb21wb25lbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDlpoLmnpzmspLmib7liLDvvIzliJflh7rlj6/nlKjntYTku7borpPnlKjmiLbnnq3op6PvvIzpoa/npLrloLTmma/kuK3nmoTnnJ/lr6ZJRFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGF2YWlsYWJsZUNvbXBvbmVudHMgPSB0YXJnZXROb2RlRGF0YS5fX2NvbXBzX18ubWFwKChjb21wOiBhbnksIGluZGV4OiBudW1iZXIpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbGV0IHNjZW5lSWQgPSAndW5rbm93bic7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOW+nue1hOS7tueahHZhbHVlLnV1aWQudmFsdWXnjbLlj5bloLTmma9JRFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoY29tcC52YWx1ZSAmJiBjb21wLnZhbHVlLnV1aWQgJiYgY29tcC52YWx1ZS51dWlkLnZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzY2VuZUlkID0gY29tcC52YWx1ZS51dWlkLnZhbHVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBgJHtjb21wLnR5cGV9KHNjZW5lX2lkOiR7c2NlbmVJZH0pYDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYENvbXBvbmVudCB0eXBlICcke2V4cGVjdGVkQ29tcG9uZW50VHlwZX0nIG5vdCBmb3VuZCBvbiBub2RlICR7dGFyZ2V0Tm9kZVV1aWR9LiBBdmFpbGFibGUgY29tcG9uZW50czogJHthdmFpbGFibGVDb21wb25lbnRzLmpvaW4oJywgJyl9YCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlYnVnTG9nKGBbQ29tcG9uZW50VG9vbHNdIEZvdW5kIGNvbXBvbmVudCAke2V4cGVjdGVkQ29tcG9uZW50VHlwZX0gd2l0aCBzY2VuZSBJRDogJHtjb21wb25lbnRJZH0gb24gbm9kZSAke3RhcmdldE5vZGVVdWlkfWApO1xuICAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyDmm7TmlrDmnJ/mnJvlgLzngrrlr6bpmpvnmoTntYTku7ZJROWwjeixoeagvOW8j++8jOeUqOaWvOW+jOe6jOmpl+itiVxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNvbXBvbmVudElkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYWN0dWFsRXhwZWN0ZWRWYWx1ZSA9IHsgdXVpZDogY29tcG9uZW50SWQgfTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAgICAgLy8g5ZiX6Kmm5L2/55So6IiH56+A6bueL+izh+a6kOW8leeUqOebuOWQjOeahOagvOW8j++8mnt1dWlkOiBjb21wb25lbnRJZH1cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIOa4rOippueci+aYr+WQpuiDveato+eiuuioree9rue1hOS7tuW8leeUqFxuICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnc2V0LXByb3BlcnR5Jywge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IG5vZGVVdWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBhdGg6IHByb3BlcnR5UGF0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkdW1wOiB7IFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZTogeyB1dWlkOiBjb21wb25lbnRJZCB9LCAgLy8g5L2/55So5bCN6LGh5qC85byP77yM5YOP56+A6bueL+izh+a6kOW8leeUqOS4gOaoo1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiBleHBlY3RlZENvbXBvbmVudFR5cGVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgW0NvbXBvbmVudFRvb2xzXSBFcnJvciBzZXR0aW5nIGNvbXBvbmVudCByZWZlcmVuY2U6YCwgZXJyb3IpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5VHlwZSA9PT0gJ25vZGVBcnJheScgJiYgQXJyYXkuaXNBcnJheShwcm9jZXNzZWRWYWx1ZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8g54m55q6K6JmV55CG56+A6bue5pW457WEIC0g5L+d5oyB6aCQ6JmV55CG55qE5qC85byPXG4gICAgICAgICAgICAgICAgICAgIGRlYnVnTG9nKGBbQ29tcG9uZW50VG9vbHNdIFNldHRpbmcgbm9kZSBhcnJheTpgLCBwcm9jZXNzZWRWYWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdzZXQtcHJvcGVydHknLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiBub2RlVXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhdGg6IHByb3BlcnR5UGF0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGR1bXA6IHsgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWU6IHByb2Nlc3NlZFZhbHVlICAvLyDkv53mjIEgW3t1dWlkOiBcIi4uLlwifSwge3V1aWQ6IFwiLi4uXCJ9XSDmoLzlvI9cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eVR5cGUgPT09ICdjb2xvckFycmF5JyAmJiBBcnJheS5pc0FycmF5KHByb2Nlc3NlZFZhbHVlKSkge1xuICAgICAgICAgICAgICAgICAgICAvLyDnibnmroromZXnkIbpoY/oibLmlbjntYRcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY29sb3JBcnJheVZhbHVlID0gcHJvY2Vzc2VkVmFsdWUubWFwKChpdGVtOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpdGVtICYmIHR5cGVvZiBpdGVtID09PSAnb2JqZWN0JyAmJiAncicgaW4gaXRlbSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHI6IE1hdGgubWluKDI1NSwgTWF0aC5tYXgoMCwgTnVtYmVyKGl0ZW0ucikgfHwgMCkpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBnOiBNYXRoLm1pbigyNTUsIE1hdGgubWF4KDAsIE51bWJlcihpdGVtLmcpIHx8IDApKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYjogTWF0aC5taW4oMjU1LCBNYXRoLm1heCgwLCBOdW1iZXIoaXRlbS5iKSB8fCAwKSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGE6IGl0ZW0uYSAhPT0gdW5kZWZpbmVkID8gTWF0aC5taW4oMjU1LCBNYXRoLm1heCgwLCBOdW1iZXIoaXRlbS5hKSkpIDogMjU1XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgcjogMjU1LCBnOiAyNTUsIGI6IDI1NSwgYTogMjU1IH07XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnc2V0LXByb3BlcnR5Jywge1xuICAgICAgICAgICAgICAgICAgICAgICAgdXVpZDogbm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBwYXRoOiBwcm9wZXJ0eVBhdGgsXG4gICAgICAgICAgICAgICAgICAgICAgICBkdW1wOiB7IFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlOiBjb2xvckFycmF5VmFsdWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogJ2NjLkNvbG9yJ1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAvLyBOb3JtYWwgcHJvcGVydHkgc2V0dGluZyBmb3Igbm9uLWFzc2V0IHByb3BlcnRpZXNcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnc2V0LXByb3BlcnR5Jywge1xuICAgICAgICAgICAgICAgICAgICAgICAgdXVpZDogbm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBwYXRoOiBwcm9wZXJ0eVBhdGgsXG4gICAgICAgICAgICAgICAgICAgICAgICBkdW1wOiB7IHZhbHVlOiBwcm9jZXNzZWRWYWx1ZSB9XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAvLyBTdGVwIDU6IOetieW+hUVkaXRvcuWujOaIkOabtOaWsO+8jOeEtuW+jOmpl+itieioree9rue1kOaenFxuICAgICAgICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAyMDApKTsgLy8g562J5b6FMjAwbXPorpNFZGl0b3LlrozmiJDmm7TmlrBcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBjb25zdCB2ZXJpZmljYXRpb24gPSBhd2FpdCB0aGlzLnZlcmlmeVByb3BlcnR5Q2hhbmdlKG5vZGVVdWlkLCBjb21wb25lbnRUeXBlLCBwcm9wZXJ0eSwgb3JpZ2luYWxWYWx1ZSwgYWN0dWFsRXhwZWN0ZWRWYWx1ZSk7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBTdWNjZXNzZnVsbHkgc2V0ICR7Y29tcG9uZW50VHlwZX0uJHtwcm9wZXJ0eX1gLFxuICAgICAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBub2RlVXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudFR5cGUsXG4gICAgICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0eSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGFjdHVhbFZhbHVlOiB2ZXJpZmljYXRpb24uYWN0dWFsVmFsdWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBjaGFuZ2VWZXJpZmllZDogdmVyaWZpY2F0aW9uLnZlcmlmaWVkXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBbQ29tcG9uZW50VG9vbHNdIEVycm9yIHNldHRpbmcgcHJvcGVydHk6YCwgZXJyb3IpO1xuICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGBGYWlsZWQgdG8gc2V0IHByb3BlcnR5OiAke2Vycm9yLm1lc3NhZ2V9YFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cblxuICAgIHByaXZhdGUgYXN5bmMgYXR0YWNoU2NyaXB0KG5vZGVVdWlkOiBzdHJpbmcsIHNjcmlwdFBhdGg6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZShhc3luYyAocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgLy8g5b6e6IWz5pys6Lev5b6R5o+Q5Y+W57WE5Lu26aGe5ZCNXG4gICAgICAgICAgICBjb25zdCBzY3JpcHROYW1lID0gc2NyaXB0UGF0aC5zcGxpdCgnLycpLnBvcCgpPy5yZXBsYWNlKCcudHMnLCAnJykucmVwbGFjZSgnLmpzJywgJycpO1xuICAgICAgICAgICAgaWYgKCFzY3JpcHROYW1lKSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ0ludmFsaWQgc2NyaXB0IHBhdGgnIH0pO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIOWFiOafpeaJvuevgOm7nuS4iuaYr+WQpuW3suWtmOWcqOipsuiFs+acrOe1hOS7tlxuICAgICAgICAgICAgY29uc3QgYWxsQ29tcG9uZW50c0luZm8gPSBhd2FpdCB0aGlzLmdldENvbXBvbmVudHMobm9kZVV1aWQpO1xuICAgICAgICAgICAgaWYgKGFsbENvbXBvbmVudHNJbmZvLnN1Y2Nlc3MgJiYgYWxsQ29tcG9uZW50c0luZm8uZGF0YT8uY29tcG9uZW50cykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGV4aXN0aW5nU2NyaXB0ID0gYWxsQ29tcG9uZW50c0luZm8uZGF0YS5jb21wb25lbnRzLmZpbmQoKGNvbXA6IGFueSkgPT4gY29tcC50eXBlID09PSBzY3JpcHROYW1lKTtcbiAgICAgICAgICAgICAgICBpZiAoZXhpc3RpbmdTY3JpcHQpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYFNjcmlwdCAnJHtzY3JpcHROYW1lfScgYWxyZWFkeSBleGlzdHMgb24gbm9kZWAsXG4gICAgICAgICAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWQ6IG5vZGVVdWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudE5hbWU6IHNjcmlwdE5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZXhpc3Rpbmc6IHRydWVcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyDpppblhYjlmpDoqabnm7TmjqXkvb/nlKjohbPmnKzlkI3nqLHkvZzngrrntYTku7bpoZ7lnotcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ2NyZWF0ZS1jb21wb25lbnQnLCB7XG4gICAgICAgICAgICAgICAgdXVpZDogbm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgY29tcG9uZW50OiBzY3JpcHROYW1lICAvLyDkvb/nlKjohbPmnKzlkI3nqLHogIzpnZ5VVUlEXG4gICAgICAgICAgICB9KS50aGVuKGFzeW5jIChyZXN1bHQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIC8vIOetieW+heS4gOauteaZgumWk+iuk0VkaXRvcuWujOaIkOe1hOS7tua3u+WKoFxuICAgICAgICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxMDApKTtcbiAgICAgICAgICAgICAgICAvLyDph43mlrDmn6XoqaLnr4Dpu57kv6Hmga/pqZforYnohbPmnKzmmK/lkKbnnJ/nmoTmt7vliqDmiJDlip9cbiAgICAgICAgICAgICAgICBjb25zdCBhbGxDb21wb25lbnRzSW5mbzIgPSBhd2FpdCB0aGlzLmdldENvbXBvbmVudHMobm9kZVV1aWQpO1xuICAgICAgICAgICAgICAgIGlmIChhbGxDb21wb25lbnRzSW5mbzIuc3VjY2VzcyAmJiBhbGxDb21wb25lbnRzSW5mbzIuZGF0YT8uY29tcG9uZW50cykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBhZGRlZFNjcmlwdCA9IGFsbENvbXBvbmVudHNJbmZvMi5kYXRhLmNvbXBvbmVudHMuZmluZCgoY29tcDogYW55KSA9PiBjb21wLnR5cGUgPT09IHNjcmlwdE5hbWUpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoYWRkZWRTY3JpcHQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYFNjcmlwdCAnJHtzY3JpcHROYW1lfScgYXR0YWNoZWQgc3VjY2Vzc2Z1bGx5YCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5vZGVVdWlkOiBub2RlVXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50TmFtZTogc2NyaXB0TmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXhpc3Rpbmc6IGZhbHNlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlcnJvcjogYFNjcmlwdCAnJHtzY3JpcHROYW1lfScgd2FzIG5vdCBmb3VuZCBvbiBub2RlIGFmdGVyIGFkZGl0aW9uLiBBdmFpbGFibGUgY29tcG9uZW50czogJHthbGxDb21wb25lbnRzSW5mbzIuZGF0YS5jb21wb25lbnRzLm1hcCgoYzogYW55KSA9PiBjLnR5cGUpLmpvaW4oJywgJyl9YFxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGBGYWlsZWQgdG8gdmVyaWZ5IHNjcmlwdCBhZGRpdGlvbjogJHthbGxDb21wb25lbnRzSW5mbzIuZXJyb3IgfHwgJ1VuYWJsZSB0byBnZXQgbm9kZSBjb21wb25lbnRzJ31gXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgLy8g5YKZ55So5pa55qGI77ya5L2/55So5aC05pmv6IWz5pysXG4gICAgICAgICAgICAgICAgcnVuU2NlbmVNZXRob2QoJ2F0dGFjaFNjcmlwdCcsIFtub2RlVXVpZCwgc2NyaXB0UGF0aF0pLnRoZW4oKHJlc3VsdDogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICAgICAgICB9KS5jYXRjaCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoeyBcbiAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLCBcbiAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yOiBgRmFpbGVkIHRvIGF0dGFjaCBzY3JpcHQgJyR7c2NyaXB0TmFtZX0nOiAke2Vyci5tZXNzYWdlfWAsXG4gICAgICAgICAgICAgICAgICAgICAgICBpbnN0cnVjdGlvbjogJ1BsZWFzZSBlbnN1cmUgdGhlIHNjcmlwdCBpcyBwcm9wZXJseSBjb21waWxlZCBhbmQgZXhwb3J0ZWQgYXMgYSBDb21wb25lbnQgY2xhc3MuIFlvdSBjYW4gYWxzbyBtYW51YWxseSBhdHRhY2ggdGhlIHNjcmlwdCB0aHJvdWdoIHRoZSBQcm9wZXJ0aWVzIHBhbmVsIGluIHRoZSBlZGl0b3IuJ1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldEF2YWlsYWJsZUNvbXBvbmVudHMoY2F0ZWdvcnk6IHN0cmluZyA9ICdhbGwnKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgY29tcG9uZW50Q2F0ZWdvcmllczogUmVjb3JkPHN0cmluZywgc3RyaW5nW10+ID0ge1xuICAgICAgICAgICAgcmVuZGVyZXI6IFsnY2MuU3ByaXRlJywgJ2NjLkxhYmVsJywgJ2NjLlJpY2hUZXh0JywgJ2NjLk1hc2snLCAnY2MuR3JhcGhpY3MnXSxcbiAgICAgICAgICAgIHVpOiBbJ2NjLkJ1dHRvbicsICdjYy5Ub2dnbGUnLCAnY2MuU2xpZGVyJywgJ2NjLlNjcm9sbFZpZXcnLCAnY2MuRWRpdEJveCcsICdjYy5Qcm9ncmVzc0JhciddLFxuICAgICAgICAgICAgcGh5c2ljczogWydjYy5SaWdpZEJvZHkyRCcsICdjYy5Cb3hDb2xsaWRlcjJEJywgJ2NjLkNpcmNsZUNvbGxpZGVyMkQnLCAnY2MuUG9seWdvbkNvbGxpZGVyMkQnXSxcbiAgICAgICAgICAgIGFuaW1hdGlvbjogWydjYy5BbmltYXRpb24nLCAnY2MuQW5pbWF0aW9uQ2xpcCcsICdjYy5Ta2VsZXRhbEFuaW1hdGlvbiddLFxuICAgICAgICAgICAgYXVkaW86IFsnY2MuQXVkaW9Tb3VyY2UnXSxcbiAgICAgICAgICAgIGxheW91dDogWydjYy5MYXlvdXQnLCAnY2MuV2lkZ2V0JywgJ2NjLlBhZ2VWaWV3JywgJ2NjLlBhZ2VWaWV3SW5kaWNhdG9yJ10sXG4gICAgICAgICAgICBlZmZlY3RzOiBbJ2NjLk1vdGlvblN0cmVhaycsICdjYy5QYXJ0aWNsZVN5c3RlbTJEJ10sXG4gICAgICAgICAgICBjYW1lcmE6IFsnY2MuQ2FtZXJhJ10sXG4gICAgICAgICAgICBsaWdodDogWydjYy5MaWdodCcsICdjYy5EaXJlY3Rpb25hbExpZ2h0JywgJ2NjLlBvaW50TGlnaHQnLCAnY2MuU3BvdExpZ2h0J11cbiAgICAgICAgfTtcblxuICAgICAgICBsZXQgY29tcG9uZW50czogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgXG4gICAgICAgIGlmIChjYXRlZ29yeSA9PT0gJ2FsbCcpIHtcbiAgICAgICAgICAgIGZvciAoY29uc3QgY2F0IGluIGNvbXBvbmVudENhdGVnb3JpZXMpIHtcbiAgICAgICAgICAgICAgICBjb21wb25lbnRzID0gY29tcG9uZW50cy5jb25jYXQoY29tcG9uZW50Q2F0ZWdvcmllc1tjYXRdKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChjb21wb25lbnRDYXRlZ29yaWVzW2NhdGVnb3J5XSkge1xuICAgICAgICAgICAgY29tcG9uZW50cyA9IGNvbXBvbmVudENhdGVnb3JpZXNbY2F0ZWdvcnldO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgY2F0ZWdvcnk6IGNhdGVnb3J5LFxuICAgICAgICAgICAgICAgIGNvbXBvbmVudHM6IGNvbXBvbmVudHNcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGlzVmFsaWRQcm9wZXJ0eURlc2NyaXB0b3IocHJvcERhdGE6IGFueSk6IGJvb2xlYW4ge1xuICAgICAgICAvLyDmqqLmn6XmmK/lkKbmmK/mnInmlYjnmoTlsazmgKfmj4/ov7DlsI3osaFcbiAgICAgICAgaWYgKHR5cGVvZiBwcm9wRGF0YSAhPT0gJ29iamVjdCcgfHwgcHJvcERhdGEgPT09IG51bGwpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyhwcm9wRGF0YSk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIOmBv+WFjemBjeatt+ewoeWWrueahOaVuOWAvOWwjeixoe+8iOWmgiB7d2lkdGg6IDIwMCwgaGVpZ2h0OiAxNTB977yJXG4gICAgICAgICAgICBjb25zdCBpc1NpbXBsZVZhbHVlT2JqZWN0ID0ga2V5cy5ldmVyeShrZXkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHZhbHVlID0gcHJvcERhdGFba2V5XTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJyB8fCB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnIHx8IHR5cGVvZiB2YWx1ZSA9PT0gJ2Jvb2xlYW4nO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmIChpc1NpbXBsZVZhbHVlT2JqZWN0KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyDmqqLmn6XmmK/lkKbljIXlkKvlsazmgKfmj4/ov7DnrKbnmoTnibnlvrXlrZfmrrXvvIzkuI3kvb/nlKgnaW4n5pON5L2c56ymXG4gICAgICAgICAgICBjb25zdCBoYXNOYW1lID0ga2V5cy5pbmNsdWRlcygnbmFtZScpO1xuICAgICAgICAgICAgY29uc3QgaGFzVmFsdWUgPSBrZXlzLmluY2x1ZGVzKCd2YWx1ZScpO1xuICAgICAgICAgICAgY29uc3QgaGFzVHlwZSA9IGtleXMuaW5jbHVkZXMoJ3R5cGUnKTtcbiAgICAgICAgICAgIGNvbnN0IGhhc0Rpc3BsYXlOYW1lID0ga2V5cy5pbmNsdWRlcygnZGlzcGxheU5hbWUnKTtcbiAgICAgICAgICAgIGNvbnN0IGhhc1JlYWRvbmx5ID0ga2V5cy5pbmNsdWRlcygncmVhZG9ubHknKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8g5b+F6aCI5YyF5ZCrbmFtZeaIlnZhbHVl5a2X5q6177yM5LiU6YCa5bi46YKE5pyJdHlwZeWtl+autVxuICAgICAgICAgICAgY29uc3QgaGFzVmFsaWRTdHJ1Y3R1cmUgPSAoaGFzTmFtZSB8fCBoYXNWYWx1ZSkgJiYgKGhhc1R5cGUgfHwgaGFzRGlzcGxheU5hbWUgfHwgaGFzUmVhZG9ubHkpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyDpoY3lpJbmqqLmn6XvvJrlpoLmnpzmnIlkZWZhdWx05a2X5q615LiU57WQ5qeL6KSH6Zuc77yM6YG/5YWN5rex5bqm6YGN5q23XG4gICAgICAgICAgICBpZiAoa2V5cy5pbmNsdWRlcygnZGVmYXVsdCcpICYmIHByb3BEYXRhLmRlZmF1bHQgJiYgdHlwZW9mIHByb3BEYXRhLmRlZmF1bHQgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZGVmYXVsdEtleXMgPSBPYmplY3Qua2V5cyhwcm9wRGF0YS5kZWZhdWx0KTtcbiAgICAgICAgICAgICAgICBpZiAoZGVmYXVsdEtleXMuaW5jbHVkZXMoJ3ZhbHVlJykgJiYgdHlwZW9mIHByb3BEYXRhLmRlZmF1bHQudmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIOmAmeeoruaDheazgeS4i++8jOaIkeWAkeWPqui/lOWbnumgguWxpOWxrOaAp++8jOS4jea3seWFpemBjeatt2RlZmF1bHQudmFsdWVcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGhhc1ZhbGlkU3RydWN0dXJlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgcmV0dXJuIGhhc1ZhbGlkU3RydWN0dXJlO1xuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgY29uc29sZS53YXJuKGBbaXNWYWxpZFByb3BlcnR5RGVzY3JpcHRvcl0gRXJyb3IgY2hlY2tpbmcgcHJvcGVydHkgZGVzY3JpcHRvcjpgLCBlcnJvcik7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGFuYWx5emVQcm9wZXJ0eShjb21wb25lbnQ6IGFueSwgcHJvcGVydHlOYW1lOiBzdHJpbmcpOiB7IGV4aXN0czogYm9vbGVhbjsgdHlwZTogc3RyaW5nOyBhdmFpbGFibGVQcm9wZXJ0aWVzOiBzdHJpbmdbXTsgb3JpZ2luYWxWYWx1ZTogYW55OyBtZXRhVHlwZT86IHN0cmluZzsgbWV0YUV4dGVuZHM/OiBzdHJpbmdbXSB9IHtcbiAgICAgICAgLy8g5b6e6KSH6Zuc55qE57WE5Lu257WQ5qeL5Lit5o+Q5Y+W5Y+v55So5bGs5oCnXG4gICAgICAgIGNvbnN0IGF2YWlsYWJsZVByb3BlcnRpZXM6IHN0cmluZ1tdID0gW107XG4gICAgICAgIGxldCBwcm9wZXJ0eVZhbHVlOiBhbnkgPSB1bmRlZmluZWQ7XG4gICAgICAgIGxldCBwcm9wZXJ0eUV4aXN0cyA9IGZhbHNlO1xuICAgICAgICBsZXQgbWV0YVR5cGU6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICAgICAgbGV0IG1ldGFFeHRlbmRzOiBzdHJpbmdbXSB8IHVuZGVmaW5lZDtcblxuICAgICAgICBjb25zdCBjYXB0dXJlTWV0YSA9IChwcm9wSW5mbzogYW55KSA9PiB7XG4gICAgICAgICAgICBpZiAoIXByb3BJbmZvIHx8IHR5cGVvZiBwcm9wSW5mbyAhPT0gJ29iamVjdCcpIHJldHVybjtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgcHJvcEluZm8udHlwZSA9PT0gJ3N0cmluZycpIG1ldGFUeXBlID0gcHJvcEluZm8udHlwZTtcbiAgICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KHByb3BJbmZvLmV4dGVuZHMpKSB7XG4gICAgICAgICAgICAgICAgbWV0YUV4dGVuZHMgPSBwcm9wSW5mby5leHRlbmRzLmZpbHRlcigoczogYW55KSA9PiB0eXBlb2YgcyA9PT0gJ3N0cmluZycpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIC8vIOWYl+ippuWkmueoruaWueW8j+afpeaJvuWxrOaAp++8mlxuICAgICAgICAvLyAxLiDnm7TmjqXlsazmgKfoqKrllY9cbiAgICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChjb21wb25lbnQsIHByb3BlcnR5TmFtZSkpIHtcbiAgICAgICAgICAgIHByb3BlcnR5VmFsdWUgPSBjb21wb25lbnRbcHJvcGVydHlOYW1lXTtcbiAgICAgICAgICAgIHByb3BlcnR5RXhpc3RzID0gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIDIuIOW+nuW1jOWll+e1kOani+S4reafpeaJviAo5aaC5b6e5ris6Kmm5pW45pOa55yL5Yiw55qE6KSH6Zuc57WQ5qeLKVxuICAgICAgICBpZiAoIXByb3BlcnR5RXhpc3RzICYmIGNvbXBvbmVudC5wcm9wZXJ0aWVzICYmIHR5cGVvZiBjb21wb25lbnQucHJvcGVydGllcyA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIC8vIOmmluWFiOaqouafpXByb3BlcnRpZXMudmFsdWXmmK/lkKblrZjlnKjvvIjpgJnmmK/miJHlgJHlnKhnZXRDb21wb25lbnRz5Lit55yL5Yiw55qE57WQ5qeL77yJXG4gICAgICAgICAgICBpZiAoY29tcG9uZW50LnByb3BlcnRpZXMudmFsdWUgJiYgdHlwZW9mIGNvbXBvbmVudC5wcm9wZXJ0aWVzLnZhbHVlID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHZhbHVlT2JqID0gY29tcG9uZW50LnByb3BlcnRpZXMudmFsdWU7XG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCBba2V5LCBwcm9wRGF0YV0gb2YgT2JqZWN0LmVudHJpZXModmFsdWVPYmopKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIOaqouafpXByb3BEYXRh5piv5ZCm5piv5LiA5YCL5pyJ5pWI55qE5bGs5oCn5o+P6L+w5bCN6LGhXG4gICAgICAgICAgICAgICAgICAgIC8vIOeiuuS/nXByb3BEYXRh5piv5bCN6LGh5LiU5YyF5ZCr6aCQ5pyf55qE5bGs5oCn57WQ5qeLXG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLmlzVmFsaWRQcm9wZXJ0eURlc2NyaXB0b3IocHJvcERhdGEpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBwcm9wSW5mbyA9IHByb3BEYXRhIGFzIGFueTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGF2YWlsYWJsZVByb3BlcnRpZXMucHVzaChrZXkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGtleSA9PT0gcHJvcGVydHlOYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5YSq5YWI5L2/55SodmFsdWXlsazmgKfvvIzlpoLmnpzmspLmnInliYfkvb/nlKhwcm9wRGF0YeacrOi6q1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHByb3BLZXlzID0gT2JqZWN0LmtleXMocHJvcEluZm8pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0eVZhbHVlID0gcHJvcEtleXMuaW5jbHVkZXMoJ3ZhbHVlJykgPyBwcm9wSW5mby52YWx1ZSA6IHByb3BJbmZvO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOWmguaenOaqouafpeWkseaVl++8jOebtOaOpeS9v+eUqHByb3BJbmZvXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb3BlcnR5VmFsdWUgPSBwcm9wSW5mbztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2FwdHVyZU1ldGEocHJvcEluZm8pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb3BlcnR5RXhpc3RzID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8g5YKZ55So5pa55qGI77ya55u05o6l5b6ecHJvcGVydGllc+afpeaJvlxuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgW2tleSwgcHJvcERhdGFdIG9mIE9iamVjdC5lbnRyaWVzKGNvbXBvbmVudC5wcm9wZXJ0aWVzKSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5pc1ZhbGlkUHJvcGVydHlEZXNjcmlwdG9yKHByb3BEYXRhKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcHJvcEluZm8gPSBwcm9wRGF0YSBhcyBhbnk7XG4gICAgICAgICAgICAgICAgICAgICAgICBhdmFpbGFibGVQcm9wZXJ0aWVzLnB1c2goa2V5KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChrZXkgPT09IHByb3BlcnR5TmFtZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOWEquWFiOS9v+eUqHZhbHVl5bGs5oCn77yM5aaC5p6c5rKS5pyJ5YmH5L2/55SocHJvcERhdGHmnKzouqtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBwcm9wS2V5cyA9IE9iamVjdC5rZXlzKHByb3BJbmZvKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvcGVydHlWYWx1ZSA9IHByb3BLZXlzLmluY2x1ZGVzKCd2YWx1ZScpID8gcHJvcEluZm8udmFsdWUgOiBwcm9wSW5mbztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDlpoLmnpzmqqLmn6XlpLHmlZfvvIznm7TmjqXkvb/nlKhwcm9wSW5mb1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0eVZhbHVlID0gcHJvcEluZm87XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhcHR1cmVNZXRhKHByb3BJbmZvKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0eUV4aXN0cyA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vIDMuIOW+nuebtOaOpeWxrOaAp+S4reaPkOWPluewoeWWruWxrOaAp+WQjVxuICAgICAgICBpZiAoYXZhaWxhYmxlUHJvcGVydGllcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKGNvbXBvbmVudCkpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWtleS5zdGFydHNXaXRoKCdfJykgJiYgIVsnX190eXBlX18nLCAnY2lkJywgJ25vZGUnLCAndXVpZCcsICduYW1lJywgJ2VuYWJsZWQnLCAndHlwZScsICdyZWFkb25seScsICd2aXNpYmxlJ10uaW5jbHVkZXMoa2V5KSkge1xuICAgICAgICAgICAgICAgICAgICBhdmFpbGFibGVQcm9wZXJ0aWVzLnB1c2goa2V5KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGlmICghcHJvcGVydHlFeGlzdHMpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgZXhpc3RzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICB0eXBlOiAndW5rbm93bicsXG4gICAgICAgICAgICAgICAgYXZhaWxhYmxlUHJvcGVydGllcyxcbiAgICAgICAgICAgICAgICBvcmlnaW5hbFZhbHVlOiB1bmRlZmluZWRcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGxldCB0eXBlID0gJ3Vua25vd24nO1xuICAgICAgICBcbiAgICAgICAgLy8g5pm66IO96aGe5Z6L5qqi5risXG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KHByb3BlcnR5VmFsdWUpKSB7XG4gICAgICAgICAgICAvLyDmlbjntYTpoZ7lnovmqqLmuKxcbiAgICAgICAgICAgIGlmIChwcm9wZXJ0eU5hbWUudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnbm9kZScpKSB7XG4gICAgICAgICAgICAgICAgdHlwZSA9ICdub2RlQXJyYXknO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eU5hbWUudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnY29sb3InKSkge1xuICAgICAgICAgICAgICAgIHR5cGUgPSAnY29sb3JBcnJheSc7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHR5cGUgPSAnYXJyYXknO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBwcm9wZXJ0eVZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgLy8gQ2hlY2sgaWYgcHJvcGVydHkgbmFtZSBzdWdnZXN0cyBpdCdzIGFuIGFzc2V0XG4gICAgICAgICAgICBpZiAoWydzcHJpdGVGcmFtZScsICd0ZXh0dXJlJywgJ21hdGVyaWFsJywgJ2ZvbnQnLCAnY2xpcCcsICdwcmVmYWInXS5pbmNsdWRlcyhwcm9wZXJ0eU5hbWUudG9Mb3dlckNhc2UoKSkpIHtcbiAgICAgICAgICAgICAgICB0eXBlID0gJ2Fzc2V0JztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdHlwZSA9ICdzdHJpbmcnO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBwcm9wZXJ0eVZhbHVlID09PSAnbnVtYmVyJykge1xuICAgICAgICAgICAgdHlwZSA9ICdudW1iZXInO1xuICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBwcm9wZXJ0eVZhbHVlID09PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICAgIHR5cGUgPSAnYm9vbGVhbic7XG4gICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlWYWx1ZSAmJiB0eXBlb2YgcHJvcGVydHlWYWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3Qga2V5cyA9IE9iamVjdC5rZXlzKHByb3BlcnR5VmFsdWUpO1xuICAgICAgICAgICAgICAgIGlmIChrZXlzLmluY2x1ZGVzKCdyJykgJiYga2V5cy5pbmNsdWRlcygnZycpICYmIGtleXMuaW5jbHVkZXMoJ2InKSkge1xuICAgICAgICAgICAgICAgICAgICB0eXBlID0gJ2NvbG9yJztcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGtleXMuaW5jbHVkZXMoJ3gnKSAmJiBrZXlzLmluY2x1ZGVzKCd5JykpIHtcbiAgICAgICAgICAgICAgICAgICAgdHlwZSA9IHByb3BlcnR5VmFsdWUueiAhPT0gdW5kZWZpbmVkID8gJ3ZlYzMnIDogJ3ZlYzInO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoa2V5cy5pbmNsdWRlcygnd2lkdGgnKSAmJiBrZXlzLmluY2x1ZGVzKCdoZWlnaHQnKSkge1xuICAgICAgICAgICAgICAgICAgICB0eXBlID0gJ3NpemUnO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoa2V5cy5pbmNsdWRlcygndXVpZCcpIHx8IGtleXMuaW5jbHVkZXMoJ19fdXVpZF9fJykpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8g5qqi5p+l5piv5ZCm5piv56+A6bue5byV55So77yI6YCa6YGO5bGs5oCn5ZCN5oiWX19pZF9f5bGs5oCn5Yik5pa377yJXG4gICAgICAgICAgICAgICAgICAgIGlmIChwcm9wZXJ0eU5hbWUudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnbm9kZScpIHx8IFxuICAgICAgICAgICAgICAgICAgICAgICAgcHJvcGVydHlOYW1lLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ3RhcmdldCcpIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICBrZXlzLmluY2x1ZGVzKCdfX2lkX18nKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZSA9ICdub2RlJztcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGUgPSAnYXNzZXQnO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChrZXlzLmluY2x1ZGVzKCdfX2lkX18nKSkge1xuICAgICAgICAgICAgICAgICAgICAvLyDnr4Dpu57lvJXnlKjnibnlvrVcbiAgICAgICAgICAgICAgICAgICAgdHlwZSA9ICdub2RlJztcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB0eXBlID0gJ29iamVjdCc7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oYFthbmFseXplUHJvcGVydHldIEVycm9yIGNoZWNraW5nIHByb3BlcnR5IHR5cGUgZm9yOiAke0pTT04uc3RyaW5naWZ5KHByb3BlcnR5VmFsdWUpfWApO1xuICAgICAgICAgICAgICAgIHR5cGUgPSAnb2JqZWN0JztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eVZhbHVlID09PSBudWxsIHx8IHByb3BlcnR5VmFsdWUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgLy8gRm9yIG51bGwvdW5kZWZpbmVkIHZhbHVlcywgY2hlY2sgcHJvcGVydHkgbmFtZSB0byBkZXRlcm1pbmUgdHlwZVxuICAgICAgICAgICAgaWYgKFsnc3ByaXRlRnJhbWUnLCAndGV4dHVyZScsICdtYXRlcmlhbCcsICdmb250JywgJ2NsaXAnLCAncHJlZmFiJ10uaW5jbHVkZXMocHJvcGVydHlOYW1lLnRvTG93ZXJDYXNlKCkpKSB7XG4gICAgICAgICAgICAgICAgdHlwZSA9ICdhc3NldCc7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5TmFtZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdub2RlJykgfHwgXG4gICAgICAgICAgICAgICAgICAgICAgcHJvcGVydHlOYW1lLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ3RhcmdldCcpKSB7XG4gICAgICAgICAgICAgICAgdHlwZSA9ICdub2RlJztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlOYW1lLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ2NvbXBvbmVudCcpKSB7XG4gICAgICAgICAgICAgICAgdHlwZSA9ICdjb21wb25lbnQnO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0eXBlID0gJ3Vua25vd24nO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgZXhpc3RzOiB0cnVlLFxuICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICAgIGF2YWlsYWJsZVByb3BlcnRpZXMsXG4gICAgICAgICAgICBvcmlnaW5hbFZhbHVlOiBwcm9wZXJ0eVZhbHVlLFxuICAgICAgICAgICAgbWV0YVR5cGUsXG4gICAgICAgICAgICBtZXRhRXh0ZW5kcyxcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGRldGVjdFByb3BlcnR5VHlwZU1pc21hdGNoKFxuICAgICAgICBwcm9wZXJ0eUluZm86IHsgbWV0YVR5cGU/OiBzdHJpbmc7IG1ldGFFeHRlbmRzPzogc3RyaW5nW10gfSxcbiAgICAgICAgcHJvcGVydHlUeXBlOiBzdHJpbmcsXG4gICAgICAgIG5vZGVVdWlkOiBzdHJpbmcsXG4gICAgICAgIGNvbXBvbmVudFR5cGU6IHN0cmluZyxcbiAgICAgICAgcHJvcGVydHk6IHN0cmluZyxcbiAgICApOiBUb29sUmVzcG9uc2UgfCBudWxsIHtcbiAgICAgICAgY29uc3QgeyBtZXRhVHlwZSwgbWV0YUV4dGVuZHMgfSA9IHByb3BlcnR5SW5mbztcbiAgICAgICAgaWYgKCFtZXRhVHlwZSAmJiAoIW1ldGFFeHRlbmRzIHx8IG1ldGFFeHRlbmRzLmxlbmd0aCA9PT0gMCkpIHJldHVybiBudWxsO1xuXG4gICAgICAgIGNvbnN0IGV4dGVuZHNMaXN0ID0gbWV0YUV4dGVuZHMgPz8gW107XG4gICAgICAgIGNvbnN0IGlzTm9kZVJlZiA9IG1ldGFUeXBlID09PSAnY2MuTm9kZSc7XG4gICAgICAgIGNvbnN0IGlzQ29tcG9uZW50UmVmID0gIWlzTm9kZVJlZiAmJiBleHRlbmRzTGlzdC5pbmNsdWRlcygnY2MuQ29tcG9uZW50Jyk7XG4gICAgICAgIGNvbnN0IGlzQXNzZXRSZWYgPSAhaXNOb2RlUmVmICYmICFpc0NvbXBvbmVudFJlZiAmJiBleHRlbmRzTGlzdC5pbmNsdWRlcygnY2MuQXNzZXQnKTtcbiAgICAgICAgaWYgKCFpc05vZGVSZWYgJiYgIWlzQ29tcG9uZW50UmVmICYmICFpc0Fzc2V0UmVmKSByZXR1cm4gbnVsbDtcblxuICAgICAgICBjb25zdCBleHBlY3RlZEtpbmQgPSBpc05vZGVSZWYgPyAnbm9kZScgOiBpc0NvbXBvbmVudFJlZiA/ICdjb21wb25lbnQnIDogJ2Fzc2V0JztcbiAgICAgICAgY29uc3QgdXNlcktpbmQgPVxuICAgICAgICAgICAgcHJvcGVydHlUeXBlID09PSAnc3ByaXRlRnJhbWUnIHx8IHByb3BlcnR5VHlwZSA9PT0gJ3ByZWZhYicgfHwgcHJvcGVydHlUeXBlID09PSAnYXNzZXQnID8gJ2Fzc2V0J1xuICAgICAgICAgICAgOiBwcm9wZXJ0eVR5cGUgPT09ICdub2RlJyA/ICdub2RlJ1xuICAgICAgICAgICAgOiBwcm9wZXJ0eVR5cGUgPT09ICdjb21wb25lbnQnID8gJ2NvbXBvbmVudCdcbiAgICAgICAgICAgIDogbnVsbDtcbiAgICAgICAgaWYgKCF1c2VyS2luZCB8fCB1c2VyS2luZCA9PT0gZXhwZWN0ZWRLaW5kKSByZXR1cm4gbnVsbDtcblxuICAgICAgICBjb25zdCBleHBlY3RlZFR5cGVOYW1lID0gbWV0YVR5cGUgPz8gJyh1bmtub3duKSc7XG4gICAgICAgIGxldCBzdWdnZXN0ZWRQcm9wZXJ0eVR5cGU6IHN0cmluZztcbiAgICAgICAgbGV0IHZhbHVlSGludDogc3RyaW5nO1xuICAgICAgICBpZiAoaXNDb21wb25lbnRSZWYpIHtcbiAgICAgICAgICAgIHN1Z2dlc3RlZFByb3BlcnR5VHlwZSA9ICdjb21wb25lbnQnO1xuICAgICAgICAgICAgdmFsdWVIaW50ID0gYHRoZSBVVUlEIG9mIHRoZSBOT0RFIHRoYXQgaG9zdHMgdGhlICR7ZXhwZWN0ZWRUeXBlTmFtZX0gY29tcG9uZW50ICh0aGUgc2VydmVyIHJlc29sdmVzIHRoZSBjb21wb25lbnQncyBzY2VuZSBfX2lkX18gZm9yIHlvdSlgO1xuICAgICAgICB9IGVsc2UgaWYgKGlzTm9kZVJlZikge1xuICAgICAgICAgICAgc3VnZ2VzdGVkUHJvcGVydHlUeXBlID0gJ25vZGUnO1xuICAgICAgICAgICAgdmFsdWVIaW50ID0gXCJ0aGUgdGFyZ2V0IG5vZGUncyBVVUlEXCI7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzdWdnZXN0ZWRQcm9wZXJ0eVR5cGUgPVxuICAgICAgICAgICAgICAgIGV4cGVjdGVkVHlwZU5hbWUgPT09ICdjYy5TcHJpdGVGcmFtZScgPyAnc3ByaXRlRnJhbWUnXG4gICAgICAgICAgICAgICAgOiBleHBlY3RlZFR5cGVOYW1lID09PSAnY2MuUHJlZmFiJyA/ICdwcmVmYWInXG4gICAgICAgICAgICAgICAgOiAnYXNzZXQnO1xuICAgICAgICAgICAgdmFsdWVIaW50ID0gYHRoZSBhc3NldCBVVUlEICh0eXBlOiAke2V4cGVjdGVkVHlwZU5hbWV9KWA7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICBlcnJvcjogYHByb3BlcnR5VHlwZSBtaXNtYXRjaDogJyR7Y29tcG9uZW50VHlwZX0uJHtwcm9wZXJ0eX0nIGlzIGEgJHtleHBlY3RlZEtpbmR9IHJlZmVyZW5jZSAobWV0YWRhdGEgdHlwZTogJHtleHBlY3RlZFR5cGVOYW1lfSksIGJ1dCB5b3UgcGFzc2VkIHByb3BlcnR5VHlwZTogJyR7cHJvcGVydHlUeXBlfScuYCxcbiAgICAgICAgICAgIGluc3RydWN0aW9uOiBgVXNlIHByb3BlcnR5VHlwZTogJyR7c3VnZ2VzdGVkUHJvcGVydHlUeXBlfScgd2l0aCAke3ZhbHVlSGludH0uXFxuRXhhbXBsZTogc2V0X2NvbXBvbmVudF9wcm9wZXJ0eShub2RlVXVpZD1cIiR7bm9kZVV1aWR9XCIsIGNvbXBvbmVudFR5cGU9XCIke2NvbXBvbmVudFR5cGV9XCIsIHByb3BlcnR5PVwiJHtwcm9wZXJ0eX1cIiwgcHJvcGVydHlUeXBlPVwiJHtzdWdnZXN0ZWRQcm9wZXJ0eVR5cGV9XCIsIHZhbHVlPVwiPHV1aWQ+XCIpYCxcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHNtYXJ0Q29udmVydFZhbHVlKGlucHV0VmFsdWU6IGFueSwgcHJvcGVydHlJbmZvOiBhbnkpOiBhbnkge1xuICAgICAgICBjb25zdCB7IHR5cGUsIG9yaWdpbmFsVmFsdWUgfSA9IHByb3BlcnR5SW5mbztcbiAgICAgICAgXG4gICAgICAgIGRlYnVnTG9nKGBbc21hcnRDb252ZXJ0VmFsdWVdIENvbnZlcnRpbmcgJHtKU09OLnN0cmluZ2lmeShpbnB1dFZhbHVlKX0gdG8gdHlwZTogJHt0eXBlfWApO1xuICAgICAgICBcbiAgICAgICAgc3dpdGNoICh0eXBlKSB7XG4gICAgICAgICAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgICAgICAgICAgIHJldHVybiBTdHJpbmcoaW5wdXRWYWx1ZSk7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICBjYXNlICdudW1iZXInOlxuICAgICAgICAgICAgICAgIHJldHVybiBOdW1iZXIoaW5wdXRWYWx1ZSk7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICBjYXNlICdib29sZWFuJzpcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGlucHV0VmFsdWUgPT09ICdib29sZWFuJykgcmV0dXJuIGlucHV0VmFsdWU7XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBpbnB1dFZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gaW5wdXRWYWx1ZS50b0xvd2VyQ2FzZSgpID09PSAndHJ1ZScgfHwgaW5wdXRWYWx1ZSA9PT0gJzEnO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gQm9vbGVhbihpbnB1dFZhbHVlKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIGNhc2UgJ2NvbG9yJzpcbiAgICAgICAgICAgICAgICAvLyDlhKrljJbnmoTpoY/oibLomZXnkIbvvIzmlK/mjIHlpJrnqK7ovLjlhaXmoLzlvI9cbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGlucHV0VmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIOWtl+espuS4suagvOW8j++8muWNgeWFremAsuWItuOAgemhj+iJsuWQjeeoseOAgXJnYigpL3JnYmEoKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5wYXJzZUNvbG9yU3RyaW5nKGlucHV0VmFsdWUpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGlucHV0VmFsdWUgPT09ICdvYmplY3QnICYmIGlucHV0VmFsdWUgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGlucHV0S2V5cyA9IE9iamVjdC5rZXlzKGlucHV0VmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8g5aaC5p6c6Ly45YWl5piv6aGP6Imy5bCN6LGh77yM6amX6K2J5Lim6L2J5o+bXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoaW5wdXRLZXlzLmluY2x1ZGVzKCdyJykgfHwgaW5wdXRLZXlzLmluY2x1ZGVzKCdnJykgfHwgaW5wdXRLZXlzLmluY2x1ZGVzKCdiJykpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByOiBNYXRoLm1pbigyNTUsIE1hdGgubWF4KDAsIE51bWJlcihpbnB1dFZhbHVlLnIpIHx8IDApKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZzogTWF0aC5taW4oMjU1LCBNYXRoLm1heCgwLCBOdW1iZXIoaW5wdXRWYWx1ZS5nKSB8fCAwKSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGI6IE1hdGgubWluKDI1NSwgTWF0aC5tYXgoMCwgTnVtYmVyKGlucHV0VmFsdWUuYikgfHwgMCkpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhOiBpbnB1dFZhbHVlLmEgIT09IHVuZGVmaW5lZCA/IE1hdGgubWluKDI1NSwgTWF0aC5tYXgoMCwgTnVtYmVyKGlucHV0VmFsdWUuYSkpKSA6IDI1NVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oYFtzbWFydENvbnZlcnRWYWx1ZV0gSW52YWxpZCBjb2xvciBvYmplY3Q6ICR7SlNPTi5zdHJpbmdpZnkoaW5wdXRWYWx1ZSl9YCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgLy8g5aaC5p6c5pyJ5Y6f5YC877yM5L+d5oyB5Y6f5YC857WQ5qeL5Lim5pu05paw5o+Q5L6b55qE5YC8XG4gICAgICAgICAgICAgICAgaWYgKG9yaWdpbmFsVmFsdWUgJiYgdHlwZW9mIG9yaWdpbmFsVmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBpbnB1dEtleXMgPSB0eXBlb2YgaW5wdXRWYWx1ZSA9PT0gJ29iamVjdCcgJiYgaW5wdXRWYWx1ZSA/IE9iamVjdC5rZXlzKGlucHV0VmFsdWUpIDogW107XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHI6IGlucHV0S2V5cy5pbmNsdWRlcygncicpID8gTWF0aC5taW4oMjU1LCBNYXRoLm1heCgwLCBOdW1iZXIoaW5wdXRWYWx1ZS5yKSkpIDogKG9yaWdpbmFsVmFsdWUuciB8fCAyNTUpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGc6IGlucHV0S2V5cy5pbmNsdWRlcygnZycpID8gTWF0aC5taW4oMjU1LCBNYXRoLm1heCgwLCBOdW1iZXIoaW5wdXRWYWx1ZS5nKSkpIDogKG9yaWdpbmFsVmFsdWUuZyB8fCAyNTUpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGI6IGlucHV0S2V5cy5pbmNsdWRlcygnYicpID8gTWF0aC5taW4oMjU1LCBNYXRoLm1heCgwLCBOdW1iZXIoaW5wdXRWYWx1ZS5iKSkpIDogKG9yaWdpbmFsVmFsdWUuYiB8fCAyNTUpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGE6IGlucHV0S2V5cy5pbmNsdWRlcygnYScpID8gTWF0aC5taW4oMjU1LCBNYXRoLm1heCgwLCBOdW1iZXIoaW5wdXRWYWx1ZS5hKSkpIDogKG9yaWdpbmFsVmFsdWUuYSB8fCAyNTUpXG4gICAgICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS53YXJuKGBbc21hcnRDb252ZXJ0VmFsdWVdIEVycm9yIHByb2Nlc3NpbmcgY29sb3Igd2l0aCBvcmlnaW5hbCB2YWx1ZTogJHtlcnJvcn1gKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAvLyDpu5joqo3ov5Tlm57nmb3oibJcbiAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oYFtzbWFydENvbnZlcnRWYWx1ZV0gVXNpbmcgZGVmYXVsdCB3aGl0ZSBjb2xvciBmb3IgaW52YWxpZCBpbnB1dDogJHtKU09OLnN0cmluZ2lmeShpbnB1dFZhbHVlKX1gKTtcbiAgICAgICAgICAgICAgICByZXR1cm4geyByOiAyNTUsIGc6IDI1NSwgYjogMjU1LCBhOiAyNTUgfTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIGNhc2UgJ3ZlYzInOlxuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgaW5wdXRWYWx1ZSA9PT0gJ29iamVjdCcgJiYgaW5wdXRWYWx1ZSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgeDogTnVtYmVyKGlucHV0VmFsdWUueCkgfHwgb3JpZ2luYWxWYWx1ZS54IHx8IDAsXG4gICAgICAgICAgICAgICAgICAgICAgICB5OiBOdW1iZXIoaW5wdXRWYWx1ZS55KSB8fCBvcmlnaW5hbFZhbHVlLnkgfHwgMFxuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gb3JpZ2luYWxWYWx1ZTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIGNhc2UgJ3ZlYzMnOlxuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgaW5wdXRWYWx1ZSA9PT0gJ29iamVjdCcgJiYgaW5wdXRWYWx1ZSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgeDogTnVtYmVyKGlucHV0VmFsdWUueCkgfHwgb3JpZ2luYWxWYWx1ZS54IHx8IDAsXG4gICAgICAgICAgICAgICAgICAgICAgICB5OiBOdW1iZXIoaW5wdXRWYWx1ZS55KSB8fCBvcmlnaW5hbFZhbHVlLnkgfHwgMCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHo6IE51bWJlcihpbnB1dFZhbHVlLnopIHx8IG9yaWdpbmFsVmFsdWUueiB8fCAwXG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBvcmlnaW5hbFZhbHVlO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgY2FzZSAnc2l6ZSc6XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBpbnB1dFZhbHVlID09PSAnb2JqZWN0JyAmJiBpbnB1dFZhbHVlICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB3aWR0aDogTnVtYmVyKGlucHV0VmFsdWUud2lkdGgpIHx8IG9yaWdpbmFsVmFsdWUud2lkdGggfHwgMTAwLFxuICAgICAgICAgICAgICAgICAgICAgICAgaGVpZ2h0OiBOdW1iZXIoaW5wdXRWYWx1ZS5oZWlnaHQpIHx8IG9yaWdpbmFsVmFsdWUuaGVpZ2h0IHx8IDEwMFxuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gb3JpZ2luYWxWYWx1ZTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIGNhc2UgJ25vZGUnOlxuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgaW5wdXRWYWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8g56+A6bue5byV55So6ZyA6KaB54m55q6K6JmV55CGXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBpbnB1dFZhbHVlO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGlucHV0VmFsdWUgPT09ICdvYmplY3QnICYmIGlucHV0VmFsdWUgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8g5aaC5p6c5bey57aT5piv5bCN6LGh5b2i5byP77yM6L+U5ZueVVVJROaIluWujOaVtOWwjeixoVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gaW5wdXRWYWx1ZS51dWlkIHx8IGlucHV0VmFsdWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBvcmlnaW5hbFZhbHVlO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgY2FzZSAnYXNzZXQnOlxuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgaW5wdXRWYWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8g5aaC5p6c6Ly45YWl5piv5a2X56ym5Liy6Lev5b6R77yM6L2J5o+b54K6YXNzZXTlsI3osaFcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgdXVpZDogaW5wdXRWYWx1ZSB9O1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGlucHV0VmFsdWUgPT09ICdvYmplY3QnICYmIGlucHV0VmFsdWUgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGlucHV0VmFsdWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBvcmlnaW5hbFZhbHVlO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAvLyDlsI3mlrzmnKrnn6XpoZ7lnovvvIzlhJjph4/kv53mjIHljp/mnInntZDmp4tcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGlucHV0VmFsdWUgPT09IHR5cGVvZiBvcmlnaW5hbFZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBpbnB1dFZhbHVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gb3JpZ2luYWxWYWx1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgICAgICBwcml2YXRlIHBhcnNlQ29sb3JTdHJpbmcoY29sb3JTdHI6IHN0cmluZyk6IHsgcjogbnVtYmVyOyBnOiBudW1iZXI7IGI6IG51bWJlcjsgYTogbnVtYmVyIH0ge1xuICAgICAgICBjb25zdCBzdHIgPSBjb2xvclN0ci50cmltKCk7XG4gICAgICAgIFxuICAgICAgICAvLyDlj6rmlK/mjIHljYHlha3pgLLliLbmoLzlvI8gI1JSR0dCQiDmiJYgI1JSR0dCQkFBXG4gICAgICAgIGlmIChzdHIuc3RhcnRzV2l0aCgnIycpKSB7XG4gICAgICAgICAgICBpZiAoc3RyLmxlbmd0aCA9PT0gNykgeyAvLyAjUlJHR0JCXG4gICAgICAgICAgICAgICAgY29uc3QgciA9IHBhcnNlSW50KHN0ci5zdWJzdHJpbmcoMSwgMyksIDE2KTtcbiAgICAgICAgICAgICAgICBjb25zdCBnID0gcGFyc2VJbnQoc3RyLnN1YnN0cmluZygzLCA1KSwgMTYpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGIgPSBwYXJzZUludChzdHIuc3Vic3RyaW5nKDUsIDcpLCAxNik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgciwgZywgYiwgYTogMjU1IH07XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHN0ci5sZW5ndGggPT09IDkpIHsgLy8gI1JSR0dCQkFBXG4gICAgICAgICAgICAgICAgY29uc3QgciA9IHBhcnNlSW50KHN0ci5zdWJzdHJpbmcoMSwgMyksIDE2KTtcbiAgICAgICAgICAgICAgICBjb25zdCBnID0gcGFyc2VJbnQoc3RyLnN1YnN0cmluZygzLCA1KSwgMTYpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGIgPSBwYXJzZUludChzdHIuc3Vic3RyaW5nKDUsIDcpLCAxNik7XG4gICAgICAgICAgICAgICAgY29uc3QgYSA9IHBhcnNlSW50KHN0ci5zdWJzdHJpbmcoNywgOSksIDE2KTtcbiAgICAgICAgICAgICAgICByZXR1cm4geyByLCBnLCBiLCBhIH07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vIOWmguaenOS4jeaYr+acieaViOeahOWNgeWFremAsuWItuagvOW8j++8jOi/lOWbnumMr+iqpOaPkOekulxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgY29sb3IgZm9ybWF0OiBcIiR7Y29sb3JTdHJ9XCIuIE9ubHkgaGV4YWRlY2ltYWwgZm9ybWF0IGlzIHN1cHBvcnRlZCAoZS5nLiwgXCIjRkYwMDAwXCIgb3IgXCIjRkYwMDAwRkZcIilgKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHZlcmlmeVByb3BlcnR5Q2hhbmdlKG5vZGVVdWlkOiBzdHJpbmcsIGNvbXBvbmVudFR5cGU6IHN0cmluZywgcHJvcGVydHk6IHN0cmluZywgb3JpZ2luYWxWYWx1ZTogYW55LCBleHBlY3RlZFZhbHVlOiBhbnkpOiBQcm9taXNlPHsgdmVyaWZpZWQ6IGJvb2xlYW47IGFjdHVhbFZhbHVlOiBhbnk7IGZ1bGxEYXRhOiBhbnkgfT4ge1xuICAgICAgICBkZWJ1Z0xvZyhgW3ZlcmlmeVByb3BlcnR5Q2hhbmdlXSBTdGFydGluZyB2ZXJpZmljYXRpb24gZm9yICR7Y29tcG9uZW50VHlwZX0uJHtwcm9wZXJ0eX1gKTtcbiAgICAgICAgZGVidWdMb2coYFt2ZXJpZnlQcm9wZXJ0eUNoYW5nZV0gRXhwZWN0ZWQgdmFsdWU6YCwgSlNPTi5zdHJpbmdpZnkoZXhwZWN0ZWRWYWx1ZSkpO1xuICAgICAgICBkZWJ1Z0xvZyhgW3ZlcmlmeVByb3BlcnR5Q2hhbmdlXSBPcmlnaW5hbCB2YWx1ZTpgLCBKU09OLnN0cmluZ2lmeShvcmlnaW5hbFZhbHVlKSk7XG4gICAgICAgIFxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8g6YeN5paw542y5Y+W57WE5Lu25L+h5oGv6YCy6KGM6amX6K2JXG4gICAgICAgICAgICBkZWJ1Z0xvZyhgW3ZlcmlmeVByb3BlcnR5Q2hhbmdlXSBDYWxsaW5nIGdldENvbXBvbmVudEluZm8uLi5gKTtcbiAgICAgICAgICAgIGNvbnN0IGNvbXBvbmVudEluZm8gPSBhd2FpdCB0aGlzLmdldENvbXBvbmVudEluZm8obm9kZVV1aWQsIGNvbXBvbmVudFR5cGUpO1xuICAgICAgICAgICAgZGVidWdMb2coYFt2ZXJpZnlQcm9wZXJ0eUNoYW5nZV0gZ2V0Q29tcG9uZW50SW5mbyBzdWNjZXNzOmAsIGNvbXBvbmVudEluZm8uc3VjY2Vzcyk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGNvbnN0IGFsbENvbXBvbmVudHMgPSBhd2FpdCB0aGlzLmdldENvbXBvbmVudHMobm9kZVV1aWQpO1xuICAgICAgICAgICAgZGVidWdMb2coYFt2ZXJpZnlQcm9wZXJ0eUNoYW5nZV0gZ2V0Q29tcG9uZW50cyBzdWNjZXNzOmAsIGFsbENvbXBvbmVudHMuc3VjY2Vzcyk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmIChjb21wb25lbnRJbmZvLnN1Y2Nlc3MgJiYgY29tcG9uZW50SW5mby5kYXRhKSB7XG4gICAgICAgICAgICAgICAgZGVidWdMb2coYFt2ZXJpZnlQcm9wZXJ0eUNoYW5nZV0gQ29tcG9uZW50IGRhdGEgYXZhaWxhYmxlLCBleHRyYWN0aW5nIHByb3BlcnR5ICcke3Byb3BlcnR5fSdgKTtcbiAgICAgICAgICAgICAgICBjb25zdCBhbGxQcm9wZXJ0eU5hbWVzID0gT2JqZWN0LmtleXMoY29tcG9uZW50SW5mby5kYXRhLnByb3BlcnRpZXMgfHwge30pO1xuICAgICAgICAgICAgICAgIGRlYnVnTG9nKGBbdmVyaWZ5UHJvcGVydHlDaGFuZ2VdIEF2YWlsYWJsZSBwcm9wZXJ0aWVzOmAsIGFsbFByb3BlcnR5TmFtZXMpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHByb3BlcnR5RGF0YSA9IGNvbXBvbmVudEluZm8uZGF0YS5wcm9wZXJ0aWVzPy5bcHJvcGVydHldO1xuICAgICAgICAgICAgICAgIGRlYnVnTG9nKGBbdmVyaWZ5UHJvcGVydHlDaGFuZ2VdIFJhdyBwcm9wZXJ0eSBkYXRhIGZvciAnJHtwcm9wZXJ0eX0nOmAsIEpTT04uc3RyaW5naWZ5KHByb3BlcnR5RGF0YSkpO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIC8vIOW+nuWxrOaAp+aVuOaTmuS4reaPkOWPluWvpumam+WAvFxuICAgICAgICAgICAgICAgIGxldCBhY3R1YWxWYWx1ZSA9IHByb3BlcnR5RGF0YTtcbiAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgW3ZlcmlmeVByb3BlcnR5Q2hhbmdlXSBJbml0aWFsIGFjdHVhbFZhbHVlOmAsIEpTT04uc3RyaW5naWZ5KGFjdHVhbFZhbHVlKSk7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaWYgKHByb3BlcnR5RGF0YSAmJiB0eXBlb2YgcHJvcGVydHlEYXRhID09PSAnb2JqZWN0JyAmJiAndmFsdWUnIGluIHByb3BlcnR5RGF0YSkge1xuICAgICAgICAgICAgICAgICAgICBhY3R1YWxWYWx1ZSA9IHByb3BlcnR5RGF0YS52YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYFt2ZXJpZnlQcm9wZXJ0eUNoYW5nZV0gRXh0cmFjdGVkIGFjdHVhbFZhbHVlIGZyb20gLnZhbHVlOmAsIEpTT04uc3RyaW5naWZ5KGFjdHVhbFZhbHVlKSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYFt2ZXJpZnlQcm9wZXJ0eUNoYW5nZV0gTm8gLnZhbHVlIHByb3BlcnR5IGZvdW5kLCB1c2luZyByYXcgZGF0YWApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAvLyDkv67lvqnpqZforYnpgo/ovK/vvJrmqqLmn6Xlr6bpmpvlgLzmmK/lkKbljLnphY3mnJ/mnJvlgLxcbiAgICAgICAgICAgICAgICBsZXQgdmVyaWZpZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGV4cGVjdGVkVmFsdWUgPT09ICdvYmplY3QnICYmIGV4cGVjdGVkVmFsdWUgIT09IG51bGwgJiYgJ3V1aWQnIGluIGV4cGVjdGVkVmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8g5bCN5pa85byV55So6aGe5Z6L77yI56+A6bueL+e1hOS7ti/os4fmupDvvInvvIzmr5TovINVVUlEXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGFjdHVhbFV1aWQgPSBhY3R1YWxWYWx1ZSAmJiB0eXBlb2YgYWN0dWFsVmFsdWUgPT09ICdvYmplY3QnICYmICd1dWlkJyBpbiBhY3R1YWxWYWx1ZSA/IGFjdHVhbFZhbHVlLnV1aWQgOiAnJztcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZXhwZWN0ZWRVdWlkID0gZXhwZWN0ZWRWYWx1ZS51dWlkIHx8ICcnO1xuICAgICAgICAgICAgICAgICAgICB2ZXJpZmllZCA9IGFjdHVhbFV1aWQgPT09IGV4cGVjdGVkVXVpZCAmJiBleHBlY3RlZFV1aWQgIT09ICcnO1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYFt2ZXJpZnlQcm9wZXJ0eUNoYW5nZV0gUmVmZXJlbmNlIGNvbXBhcmlzb246YCk7XG4gICAgICAgICAgICAgICAgICAgIGRlYnVnTG9nKGAgIC0gRXhwZWN0ZWQgVVVJRDogXCIke2V4cGVjdGVkVXVpZH1cImApO1xuICAgICAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgICAtIEFjdHVhbCBVVUlEOiBcIiR7YWN0dWFsVXVpZH1cImApO1xuICAgICAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgICAtIFVVSUQgbWF0Y2g6ICR7YWN0dWFsVXVpZCA9PT0gZXhwZWN0ZWRVdWlkfWApO1xuICAgICAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgICAtIFVVSUQgbm90IGVtcHR5OiAke2V4cGVjdGVkVXVpZCAhPT0gJyd9YCk7XG4gICAgICAgICAgICAgICAgICAgIGRlYnVnTG9nKGAgIC0gRmluYWwgdmVyaWZpZWQ6ICR7dmVyaWZpZWR9YCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgLy8g5bCN5pa85YW25LuW6aGe5Z6L77yM55u05o6l5q+U6LyD5YC8XG4gICAgICAgICAgICAgICAgICAgIGRlYnVnTG9nKGBbdmVyaWZ5UHJvcGVydHlDaGFuZ2VdIFZhbHVlIGNvbXBhcmlzb246YCk7XG4gICAgICAgICAgICAgICAgICAgIGRlYnVnTG9nKGAgIC0gRXhwZWN0ZWQgdHlwZTogJHt0eXBlb2YgZXhwZWN0ZWRWYWx1ZX1gKTtcbiAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYCAgLSBBY3R1YWwgdHlwZTogJHt0eXBlb2YgYWN0dWFsVmFsdWV9YCk7XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGFjdHVhbFZhbHVlID09PSB0eXBlb2YgZXhwZWN0ZWRWYWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBhY3R1YWxWYWx1ZSA9PT0gJ29iamVjdCcgJiYgYWN0dWFsVmFsdWUgIT09IG51bGwgJiYgZXhwZWN0ZWRWYWx1ZSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOWwjeixoemhnuWei+eahOa3seW6puavlOi8g1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZlcmlmaWVkID0gSlNPTi5zdHJpbmdpZnkoYWN0dWFsVmFsdWUpID09PSBKU09OLnN0cmluZ2lmeShleHBlY3RlZFZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgICAtIE9iamVjdCBjb21wYXJpc29uIChKU09OKTogJHt2ZXJpZmllZH1gKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5Z+65pys6aGe5Z6L55qE55u05o6l5q+U6LyDXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmVyaWZpZWQgPSBhY3R1YWxWYWx1ZSA9PT0gZXhwZWN0ZWRWYWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgICAtIERpcmVjdCBjb21wYXJpc29uOiAke3ZlcmlmaWVkfWApO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8g6aGe5Z6L5LiN5Yy56YWN5pmC55qE54m55q6K6JmV55CG77yI5aaC5pW45a2X5ZKM5a2X56ym5Liy77yJXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBzdHJpbmdNYXRjaCA9IFN0cmluZyhhY3R1YWxWYWx1ZSkgPT09IFN0cmluZyhleHBlY3RlZFZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG51bWJlck1hdGNoID0gTnVtYmVyKGFjdHVhbFZhbHVlKSA9PT0gTnVtYmVyKGV4cGVjdGVkVmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdmVyaWZpZWQgPSBzdHJpbmdNYXRjaCB8fCBudW1iZXJNYXRjaDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlYnVnTG9nKGAgIC0gU3RyaW5nIG1hdGNoOiAke3N0cmluZ01hdGNofWApO1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYCAgLSBOdW1iZXIgbWF0Y2g6ICR7bnVtYmVyTWF0Y2h9YCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgICAtIFR5cGUgbWlzbWF0Y2ggdmVyaWZpZWQ6ICR7dmVyaWZpZWR9YCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgZGVidWdMb2coYFt2ZXJpZnlQcm9wZXJ0eUNoYW5nZV0gRmluYWwgdmVyaWZpY2F0aW9uIHJlc3VsdDogJHt2ZXJpZmllZH1gKTtcbiAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgW3ZlcmlmeVByb3BlcnR5Q2hhbmdlXSBGaW5hbCBhY3R1YWxWYWx1ZTpgLCBKU09OLnN0cmluZ2lmeShhY3R1YWxWYWx1ZSkpO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IHtcbiAgICAgICAgICAgICAgICAgICAgdmVyaWZpZWQsXG4gICAgICAgICAgICAgICAgICAgIGFjdHVhbFZhbHVlLFxuICAgICAgICAgICAgICAgICAgICBmdWxsRGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8g5Y+q6L+U5Zue5L+u5pS555qE5bGs5oCn5L+h5oGv77yM5LiN6L+U5Zue5a6M5pW057WE5Lu25pW45pOaXG4gICAgICAgICAgICAgICAgICAgICAgICBtb2RpZmllZFByb3BlcnR5OiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogcHJvcGVydHksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYmVmb3JlOiBvcmlnaW5hbFZhbHVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4cGVjdGVkOiBleHBlY3RlZFZhbHVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFjdHVhbDogYWN0dWFsVmFsdWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmVyaWZpZWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvcGVydHlNZXRhZGF0YTogcHJvcGVydHlEYXRhIC8vIOWPquWMheWQq+mAmeWAi+WxrOaAp+eahOWFg+aVuOaTmlxuICAgICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIOewoeWMlueahOe1hOS7tuS/oeaBr1xuICAgICAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50U3VtbWFyeToge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5vZGVVdWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudFR5cGUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdG90YWxQcm9wZXJ0aWVzOiBPYmplY3Qua2V5cyhjb21wb25lbnRJbmZvLmRhdGE/LnByb3BlcnRpZXMgfHwge30pLmxlbmd0aFxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgW3ZlcmlmeVByb3BlcnR5Q2hhbmdlXSBSZXR1cm5pbmcgcmVzdWx0OmAsIEpTT04uc3RyaW5naWZ5KHJlc3VsdCwgbnVsbCwgMikpO1xuICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGRlYnVnTG9nKGBbdmVyaWZ5UHJvcGVydHlDaGFuZ2VdIENvbXBvbmVudEluZm8gZmFpbGVkIG9yIG5vIGRhdGE6YCwgY29tcG9uZW50SW5mbyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdbdmVyaWZ5UHJvcGVydHlDaGFuZ2VdIFZlcmlmaWNhdGlvbiBmYWlsZWQgd2l0aCBlcnJvcjonLCBlcnJvcik7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdbdmVyaWZ5UHJvcGVydHlDaGFuZ2VdIEVycm9yIHN0YWNrOicsIGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5zdGFjayA6ICdObyBzdGFjayB0cmFjZScpO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBkZWJ1Z0xvZyhgW3ZlcmlmeVByb3BlcnR5Q2hhbmdlXSBSZXR1cm5pbmcgZmFsbGJhY2sgcmVzdWx0YCk7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICB2ZXJpZmllZDogZmFsc2UsXG4gICAgICAgICAgICBhY3R1YWxWYWx1ZTogdW5kZWZpbmVkLFxuICAgICAgICAgICAgZnVsbERhdGE6IG51bGxcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiDmqqLmuKzmmK/lkKbngrrnr4Dpu57lsazmgKfvvIzlpoLmnpzmmK/liYfph43lrprlkJHliLDlsI3mh4nnmoTnr4Dpu57mlrnms5VcbiAgICAgKi9cbiAgICBwcml2YXRlIGFzeW5jIGNoZWNrQW5kUmVkaXJlY3ROb2RlUHJvcGVydGllcyhhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZSB8IG51bGw+IHtcbiAgICAgICAgY29uc3QgeyBub2RlVXVpZCwgY29tcG9uZW50VHlwZSwgcHJvcGVydHksIHByb3BlcnR5VHlwZSwgdmFsdWUgfSA9IGFyZ3M7XG4gICAgICAgIFxuICAgICAgICAvLyDmqqLmuKzmmK/lkKbngrrnr4Dpu57ln7rnpI7lsazmgKfvvIjmh4noqbLkvb/nlKggc2V0X25vZGVfcHJvcGVydHnvvIlcbiAgICAgICAgY29uc3Qgbm9kZUJhc2ljUHJvcGVydGllcyA9IFtcbiAgICAgICAgICAgICduYW1lJywgJ2FjdGl2ZScsICdsYXllcicsICdtb2JpbGl0eScsICdwYXJlbnQnLCAnY2hpbGRyZW4nLCAnaGlkZUZsYWdzJ1xuICAgICAgICBdO1xuICAgICAgICBcbiAgICAgICAgLy8g5qqi5ris5piv5ZCm54K656+A6bue6K6K5o+b5bGs5oCn77yI5oeJ6Kmy5L2/55SoIHNldF9ub2RlX3RyYW5zZm9ybe+8iVxuICAgICAgICBjb25zdCBub2RlVHJhbnNmb3JtUHJvcGVydGllcyA9IFtcbiAgICAgICAgICAgICdwb3NpdGlvbicsICdyb3RhdGlvbicsICdzY2FsZScsICdldWxlckFuZ2xlcycsICdhbmdsZSdcbiAgICAgICAgXTtcbiAgICAgICAgXG4gICAgICAgIC8vIERldGVjdCBhdHRlbXB0cyB0byBzZXQgY2MuTm9kZSBwcm9wZXJ0aWVzIChjb21tb24gbWlzdGFrZSlcbiAgICAgICAgaWYgKGNvbXBvbmVudFR5cGUgPT09ICdjYy5Ob2RlJyB8fCBjb21wb25lbnRUeXBlID09PSAnTm9kZScpIHtcbiAgICAgICAgICAgIGlmIChub2RlQmFzaWNQcm9wZXJ0aWVzLmluY2x1ZGVzKHByb3BlcnR5KSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGBQcm9wZXJ0eSAnJHtwcm9wZXJ0eX0nIGlzIGEgbm9kZSBiYXNpYyBwcm9wZXJ0eSwgbm90IGEgY29tcG9uZW50IHByb3BlcnR5YCxcbiAgICAgICAgICAgICAgICAgICAgICBpbnN0cnVjdGlvbjogYFBsZWFzZSB1c2Ugc2V0X25vZGVfcHJvcGVydHkgbWV0aG9kIHRvIHNldCBub2RlIHByb3BlcnRpZXM6IHNldF9ub2RlX3Byb3BlcnR5KHV1aWQ9XCIke25vZGVVdWlkfVwiLCBwcm9wZXJ0eT1cIiR7cHJvcGVydHl9XCIsIHZhbHVlPSR7SlNPTi5zdHJpbmdpZnkodmFsdWUpfSlgXG4gICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICB9IGVsc2UgaWYgKG5vZGVUcmFuc2Zvcm1Qcm9wZXJ0aWVzLmluY2x1ZGVzKHByb3BlcnR5KSkge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgICBlcnJvcjogYFByb3BlcnR5ICcke3Byb3BlcnR5fScgaXMgYSBub2RlIHRyYW5zZm9ybSBwcm9wZXJ0eSwgbm90IGEgY29tcG9uZW50IHByb3BlcnR5YCxcbiAgICAgICAgICAgICAgICAgICAgICBpbnN0cnVjdGlvbjogYFBsZWFzZSB1c2Ugc2V0X25vZGVfdHJhbnNmb3JtIG1ldGhvZCB0byBzZXQgdHJhbnNmb3JtIHByb3BlcnRpZXM6IHNldF9ub2RlX3RyYW5zZm9ybSh1dWlkPVwiJHtub2RlVXVpZH1cIiwgJHtwcm9wZXJ0eX09JHtKU09OLnN0cmluZ2lmeSh2YWx1ZSl9KWBcbiAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgXG4gICAgICAgICAgLy8gRGV0ZWN0IGNvbW1vbiBpbmNvcnJlY3QgdXNhZ2VcbiAgICAgICAgICBpZiAobm9kZUJhc2ljUHJvcGVydGllcy5pbmNsdWRlcyhwcm9wZXJ0eSkgfHwgbm9kZVRyYW5zZm9ybVByb3BlcnRpZXMuaW5jbHVkZXMocHJvcGVydHkpKSB7XG4gICAgICAgICAgICAgIGNvbnN0IG1ldGhvZE5hbWUgPSBub2RlVHJhbnNmb3JtUHJvcGVydGllcy5pbmNsdWRlcyhwcm9wZXJ0eSkgPyAnc2V0X25vZGVfdHJhbnNmb3JtJyA6ICdzZXRfbm9kZV9wcm9wZXJ0eSc7XG4gICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgIGVycm9yOiBgUHJvcGVydHkgJyR7cHJvcGVydHl9JyBpcyBhIG5vZGUgcHJvcGVydHksIG5vdCBhIGNvbXBvbmVudCBwcm9wZXJ0eWAsXG4gICAgICAgICAgICAgICAgICBpbnN0cnVjdGlvbjogYFByb3BlcnR5ICcke3Byb3BlcnR5fScgc2hvdWxkIGJlIHNldCB1c2luZyAke21ldGhvZE5hbWV9IG1ldGhvZCwgbm90IHNldF9jb21wb25lbnRfcHJvcGVydHkuIFBsZWFzZSB1c2U6ICR7bWV0aG9kTmFtZX0odXVpZD1cIiR7bm9kZVV1aWR9XCIsICR7bm9kZVRyYW5zZm9ybVByb3BlcnRpZXMuaW5jbHVkZXMocHJvcGVydHkpID8gcHJvcGVydHkgOiBgcHJvcGVydHk9XCIke3Byb3BlcnR5fVwiYH09JHtKU09OLnN0cmluZ2lmeSh2YWx1ZSl9KWBcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICB9XG4gICAgICAgICAgXG4gICAgICAgICAgcmV0dXJuIG51bGw7IC8vIOS4jeaYr+evgOm7nuWxrOaAp++8jOe5vOe6jOato+W4uOiZleeQhlxuICAgICAgfVxuXG4gICAgICAvKipcbiAgICAgICAqIOeUn+aIkOe1hOS7tuW7uuitsOS/oeaBr1xuICAgICAgICovXG4gICAgICBwcml2YXRlIGdlbmVyYXRlQ29tcG9uZW50U3VnZ2VzdGlvbihyZXF1ZXN0ZWRUeXBlOiBzdHJpbmcsIGF2YWlsYWJsZVR5cGVzOiBzdHJpbmdbXSwgcHJvcGVydHk6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgICAgICAgLy8g5qqi5p+l5piv5ZCm5a2Y5Zyo55u45Ly855qE57WE5Lu26aGe5Z6LXG4gICAgICAgICAgY29uc3Qgc2ltaWxhclR5cGVzID0gYXZhaWxhYmxlVHlwZXMuZmlsdGVyKHR5cGUgPT4gXG4gICAgICAgICAgICAgIHR5cGUudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhyZXF1ZXN0ZWRUeXBlLnRvTG93ZXJDYXNlKCkpIHx8IFxuICAgICAgICAgICAgICByZXF1ZXN0ZWRUeXBlLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXModHlwZS50b0xvd2VyQ2FzZSgpKVxuICAgICAgICAgICk7XG4gICAgICAgICAgXG4gICAgICAgICAgbGV0IGluc3RydWN0aW9uID0gJyc7XG4gICAgICAgICAgXG4gICAgICAgICAgaWYgKHNpbWlsYXJUeXBlcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgIGluc3RydWN0aW9uICs9IGBcXG5cXG7wn5SNIEZvdW5kIHNpbWlsYXIgY29tcG9uZW50czogJHtzaW1pbGFyVHlwZXMuam9pbignLCAnKX1gO1xuICAgICAgICAgICAgICBpbnN0cnVjdGlvbiArPSBgXFxu8J+SoSBTdWdnZXN0aW9uOiBQZXJoYXBzIHlvdSBtZWFudCB0byBzZXQgdGhlICcke3NpbWlsYXJUeXBlc1swXX0nIGNvbXBvbmVudD9gO1xuICAgICAgICAgIH1cbiAgICAgICAgICBcbiAgICAgICAgICAvLyBSZWNvbW1lbmQgcG9zc2libGUgY29tcG9uZW50cyBiYXNlZCBvbiBwcm9wZXJ0eSBuYW1lXG4gICAgICAgICAgY29uc3QgcHJvcGVydHlUb0NvbXBvbmVudE1hcDogUmVjb3JkPHN0cmluZywgc3RyaW5nW10+ID0ge1xuICAgICAgICAgICAgICAnc3RyaW5nJzogWydjYy5MYWJlbCcsICdjYy5SaWNoVGV4dCcsICdjYy5FZGl0Qm94J10sXG4gICAgICAgICAgICAgICd0ZXh0JzogWydjYy5MYWJlbCcsICdjYy5SaWNoVGV4dCddLFxuICAgICAgICAgICAgICAnZm9udFNpemUnOiBbJ2NjLkxhYmVsJywgJ2NjLlJpY2hUZXh0J10sXG4gICAgICAgICAgICAgICdzcHJpdGVGcmFtZSc6IFsnY2MuU3ByaXRlJ10sXG4gICAgICAgICAgICAgICdjb2xvcic6IFsnY2MuTGFiZWwnLCAnY2MuU3ByaXRlJywgJ2NjLkdyYXBoaWNzJ10sXG4gICAgICAgICAgICAgICdub3JtYWxDb2xvcic6IFsnY2MuQnV0dG9uJ10sXG4gICAgICAgICAgICAgICdwcmVzc2VkQ29sb3InOiBbJ2NjLkJ1dHRvbiddLFxuICAgICAgICAgICAgICAndGFyZ2V0JzogWydjYy5CdXR0b24nXSxcbiAgICAgICAgICAgICAgJ2NvbnRlbnRTaXplJzogWydjYy5VSVRyYW5zZm9ybSddLFxuICAgICAgICAgICAgICAnYW5jaG9yUG9pbnQnOiBbJ2NjLlVJVHJhbnNmb3JtJ11cbiAgICAgICAgICB9O1xuICAgICAgICAgIFxuICAgICAgICAgIGNvbnN0IHJlY29tbWVuZGVkQ29tcG9uZW50cyA9IHByb3BlcnR5VG9Db21wb25lbnRNYXBbcHJvcGVydHldIHx8IFtdO1xuICAgICAgICAgIGNvbnN0IGF2YWlsYWJsZVJlY29tbWVuZGVkID0gcmVjb21tZW5kZWRDb21wb25lbnRzLmZpbHRlcihjb21wID0+IGF2YWlsYWJsZVR5cGVzLmluY2x1ZGVzKGNvbXApKTtcbiAgICAgICAgICBcbiAgICAgICAgICBpZiAoYXZhaWxhYmxlUmVjb21tZW5kZWQubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICBpbnN0cnVjdGlvbiArPSBgXFxuXFxu8J+OryBCYXNlZCBvbiBwcm9wZXJ0eSAnJHtwcm9wZXJ0eX0nLCByZWNvbW1lbmRlZCBjb21wb25lbnRzOiAke2F2YWlsYWJsZVJlY29tbWVuZGVkLmpvaW4oJywgJyl9YDtcbiAgICAgICAgICB9XG4gICAgICAgICAgXG4gICAgICAgICAgLy8gUHJvdmlkZSBvcGVyYXRpb24gc3VnZ2VzdGlvbnNcbiAgICAgICAgICBpbnN0cnVjdGlvbiArPSBgXFxuXFxu8J+TiyBTdWdnZXN0ZWQgQWN0aW9uczpgO1xuICAgICAgICAgIGluc3RydWN0aW9uICs9IGBcXG4xLiBVc2UgZ2V0X2NvbXBvbmVudHMobm9kZVV1aWQ9XCIke3JlcXVlc3RlZFR5cGUuaW5jbHVkZXMoJ3V1aWQnKSA/ICdZT1VSX05PREVfVVVJRCcgOiAnbm9kZVV1aWQnfVwiKSB0byB2aWV3IGFsbCBjb21wb25lbnRzIG9uIHRoZSBub2RlYDtcbiAgICAgICAgICBpbnN0cnVjdGlvbiArPSBgXFxuMi4gSWYgeW91IG5lZWQgdG8gYWRkIGEgY29tcG9uZW50LCB1c2UgYWRkX2NvbXBvbmVudChub2RlVXVpZD1cIi4uLlwiLCBjb21wb25lbnRUeXBlPVwiJHtyZXF1ZXN0ZWRUeXBlfVwiKWA7XG4gICAgICAgICAgaW5zdHJ1Y3Rpb24gKz0gYFxcbjMuIFZlcmlmeSB0aGF0IHRoZSBjb21wb25lbnQgdHlwZSBuYW1lIGlzIGNvcnJlY3QgKGNhc2Utc2Vuc2l0aXZlKWA7XG4gICAgICAgICAgXG4gICAgICAgICAgICAgICAgICByZXR1cm4gaW5zdHJ1Y3Rpb247XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICog5b+r6YCf6amX6K2J6LOH5rqQ6Kit572u57WQ5p6cXG4gICAgICovXG4gICAgcHJpdmF0ZSBhc3luYyBxdWlja1ZlcmlmeUFzc2V0KG5vZGVVdWlkOiBzdHJpbmcsIGNvbXBvbmVudFR5cGU6IHN0cmluZywgcHJvcGVydHk6IHN0cmluZyk6IFByb21pc2U8YW55PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByYXdOb2RlRGF0YSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LW5vZGUnLCBub2RlVXVpZCk7XG4gICAgICAgICAgICBpZiAoIXJhd05vZGVEYXRhIHx8ICFyYXdOb2RlRGF0YS5fX2NvbXBzX18pIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8g5om+5Yiw57WE5Lu2XG4gICAgICAgICAgICBjb25zdCBjb21wb25lbnQgPSByYXdOb2RlRGF0YS5fX2NvbXBzX18uZmluZCgoY29tcDogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgY29tcFR5cGUgPSBjb21wLl9fdHlwZV9fIHx8IGNvbXAuY2lkIHx8IGNvbXAudHlwZTtcbiAgICAgICAgICAgICAgICByZXR1cm4gY29tcFR5cGUgPT09IGNvbXBvbmVudFR5cGU7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgaWYgKCFjb21wb25lbnQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8g5o+Q5Y+W5bGs5oCn5YC8XG4gICAgICAgICAgICBjb25zdCBwcm9wZXJ0aWVzID0gdGhpcy5leHRyYWN0Q29tcG9uZW50UHJvcGVydGllcyhjb21wb25lbnQpO1xuICAgICAgICAgICAgY29uc3QgcHJvcGVydHlEYXRhID0gcHJvcGVydGllc1twcm9wZXJ0eV07XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmIChwcm9wZXJ0eURhdGEgJiYgdHlwZW9mIHByb3BlcnR5RGF0YSA9PT0gJ29iamVjdCcgJiYgJ3ZhbHVlJyBpbiBwcm9wZXJ0eURhdGEpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcHJvcGVydHlEYXRhLnZhbHVlO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcHJvcGVydHlEYXRhO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihgW3F1aWNrVmVyaWZ5QXNzZXRdIEVycm9yOmAsIGVycm9yKTtcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG4gICAgfVxufVxuIl19