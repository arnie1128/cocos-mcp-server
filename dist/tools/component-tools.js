"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ComponentTools = void 0;
const response_1 = require("../lib/response");
const log_1 = require("../lib/log");
const schema_1 = require("../lib/schema");
const define_tools_1 = require("../lib/define-tools");
const scene_bridge_1 = require("../lib/scene-bridge");
const instance_reference_1 = require("../lib/instance-reference");
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
            { name: 'add_component', title: 'Add node component', description: '[specialist] Add a component to a node. Mutates scene; verify the component type or script class name first. Accepts reference={id,type} (preferred), nodeUuid, or nodeName.',
                inputSchema: schema_1.z.object({
                    reference: instance_reference_1.instanceReferenceSchema.optional().describe('InstanceReference {id,type} for the host node. Preferred form.'),
                    nodeUuid: schema_1.z.string().optional().describe('Target node UUID. Used when reference is omitted.'),
                    nodeName: schema_1.z.string().optional().describe('Target node name (depth-first first match). Used when reference and nodeUuid are omitted.'),
                    componentType: schema_1.z.string().describe('Component type to add, e.g. cc.Sprite, cc.Label, cc.Button, or a custom script class name.'),
                }),
                handler: async (a) => {
                    const r = await (0, instance_reference_1.resolveReference)({ reference: a.reference, nodeUuid: a.nodeUuid, nodeName: a.nodeName });
                    if ('response' in r)
                        return r.response;
                    return this.addComponent(r.uuid, a.componentType);
                } },
            { name: 'remove_component', title: 'Remove node component', description: "[specialist] Remove a component from a node. Mutates scene; componentType must be the cid/type returned by get_components, not a guessed script name.",
                inputSchema: schema_1.z.object({
                    nodeUuid: schema_1.z.string().describe('Node UUID that owns the component to remove.'),
                    componentType: schema_1.z.string().describe('Component cid (type field from getComponents). Do NOT use script name or class name. Example: "cc.Sprite" or "9b4a7ueT9xD6aRE+AlOusy1"'),
                }), handler: a => this.removeComponent(a.nodeUuid, a.componentType) },
            { name: 'get_components', title: 'List node components', description: '[specialist] List all components on a node. Includes type/cid and basic properties; use before remove_component or set_component_property.',
                inputSchema: schema_1.z.object({
                    nodeUuid: schema_1.z.string().describe('Node UUID whose components should be listed.'),
                }), handler: a => this.getComponents(a.nodeUuid) },
            { name: 'get_component_info', title: 'Read component info', description: '[specialist] Read detailed data for one component on a node. No mutation; use to inspect property names and value shapes before editing.',
                inputSchema: schema_1.z.object({
                    nodeUuid: schema_1.z.string().describe('Node UUID that owns the component.'),
                    componentType: schema_1.z.string().describe('Component type/cid to inspect. Use get_components first if unsure.'),
                }), handler: a => this.getComponentInfo(a.nodeUuid, a.componentType) },
            { name: 'set_component_property', title: 'Set component property', description: '[specialist] Set one property on a node component. Supports built-in UI and custom script components. Accepts reference={id,type} (preferred), nodeUuid, or nodeName. Note: For node basic properties (name, active, layer, etc.), use set_node_property. For node transform properties (position, rotation, scale, etc.), use set_node_transform.',
                inputSchema: schema_1.z.object({
                    reference: instance_reference_1.instanceReferenceSchema.optional().describe('InstanceReference {id,type} for the host node. Preferred form.'),
                    nodeUuid: schema_1.z.string().optional().describe('Target node UUID. Used when reference is omitted.'),
                    nodeName: schema_1.z.string().optional().describe('Target node name (depth-first first match). Used when reference and nodeUuid are omitted.'),
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
                    const r = await (0, instance_reference_1.resolveReference)({ reference: a.reference, nodeUuid: a.nodeUuid, nodeName: a.nodeName });
                    if ('response' in r)
                        return r.response;
                    return this.setComponentProperty(Object.assign(Object.assign({}, a), { nodeUuid: r.uuid }));
                } },
            { name: 'attach_script', title: 'Attach script component', description: '[specialist] Attach a script asset as a component to a node. Mutates scene; use get_components afterward because custom scripts may appear as cid.',
                inputSchema: schema_1.z.object({
                    nodeUuid: schema_1.z.string().describe('Node UUID to attach the script component to.'),
                    scriptPath: schema_1.z.string().describe('Script asset db:// path, e.g. db://assets/scripts/MyScript.ts.'),
                }), handler: a => this.attachScript(a.nodeUuid, a.scriptPath) },
            { name: 'get_available_components', title: 'List available components', description: '[specialist] List curated built-in component types by category. No scene query; custom project scripts are not discovered here.',
                inputSchema: schema_1.z.object({
                    category: schema_1.z.enum(['all', 'renderer', 'ui', 'physics', 'animation', 'audio']).default('all').describe('Component category filter for the built-in curated list.'),
                }), handler: a => this.getAvailableComponents(a.category) },
            { name: 'add_event_handler', title: 'Add event handler', description: '[specialist] Append a cc.EventHandler to a component event array. Nudges the editor model for persistence. Mutates scene; use for Button/Toggle/Slider callbacks.',
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
            { name: 'remove_event_handler', title: 'Remove event handler', description: '[specialist] Remove EventHandler entries from a component event array. Nudges the editor model for persistence. Mutates scene; match by index or targetNodeUuid+handler.',
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
            { name: 'list_event_handlers', title: 'List event handlers', description: '[specialist] List EventHandler entries on a component event array. No mutation; use before remove_event_handler.',
                inputSchema: schema_1.z.object({
                    nodeUuid: schema_1.z.string().describe('Node UUID owning the component'),
                    componentType: schema_1.z.string().default('cc.Button').describe('Component class name'),
                    eventArrayProperty: schema_1.z.string().default('clickEvents').describe('EventHandler array property name'),
                }),
                handler: a => (0, scene_bridge_1.runSceneMethodAsToolResponse)('listEventHandlers', [
                    a.nodeUuid, a.componentType, a.eventArrayProperty,
                ]) },
            { name: 'set_component_properties', title: 'Set component properties', description: '[specialist] Batch-set multiple properties on the same component in one tool call. Mutates scene; each property is written sequentially through set_component_property to share nodeUuid+componentType resolution. Returns per-entry success/error so partial failures are visible. Use when AI needs to set 3+ properties on a single component at once. Accepts reference={id,type} (preferred), nodeUuid, or nodeName.',
                inputSchema: schema_1.z.object({
                    reference: instance_reference_1.instanceReferenceSchema.optional().describe('InstanceReference {id,type} for the host node. Preferred form.'),
                    nodeUuid: schema_1.z.string().optional().describe('Target node UUID. Used when reference is omitted.'),
                    nodeName: schema_1.z.string().optional().describe('Target node name (depth-first first match). Used when reference and nodeUuid are omitted.'),
                    componentType: schema_1.z.string().describe('Component type/cid shared by all entries.'),
                    properties: schema_1.z.array(schema_1.z.object({
                        property: schema_1.z.string().describe('Property name on the component, e.g. fontSize, color, sizeMode.'),
                        propertyType: schema_1.z.enum([
                            'string', 'number', 'boolean', 'integer', 'float',
                            'color', 'vec2', 'vec3', 'size',
                            'node', 'component', 'spriteFrame', 'prefab', 'asset',
                            'nodeArray', 'colorArray', 'numberArray', 'stringArray',
                        ]).describe('Property data type for value conversion.'),
                        value: schema_1.z.any().describe('Property value matching propertyType.'),
                        preserveContentSize: schema_1.z.boolean().default(false).describe('See set_component_property; only honoured when componentType="cc.Sprite" and property="spriteFrame".'),
                    })).min(1).max(20).describe('Property entries. Capped at 20 per call.'),
                }),
                handler: async (a) => {
                    var _a, _b, _c;
                    const r = await (0, instance_reference_1.resolveReference)({ reference: a.reference, nodeUuid: a.nodeUuid, nodeName: a.nodeName });
                    if ('response' in r)
                        return r.response;
                    const results = [];
                    for (const entry of a.properties) {
                        const resp = await this.setComponentProperty({
                            nodeUuid: r.uuid,
                            componentType: a.componentType,
                            property: entry.property,
                            propertyType: entry.propertyType,
                            value: entry.value,
                            preserveContentSize: (_a = entry.preserveContentSize) !== null && _a !== void 0 ? _a : false,
                        });
                        results.push({
                            property: entry.property,
                            success: !!resp.success,
                            error: resp.success ? undefined : ((_c = (_b = resp.error) !== null && _b !== void 0 ? _b : resp.message) !== null && _c !== void 0 ? _c : 'unknown'),
                        });
                    }
                    const failed = results.filter(x => !x.success);
                    return {
                        success: failed.length === 0,
                        data: {
                            nodeUuid: r.uuid,
                            componentType: a.componentType,
                            total: results.length,
                            failedCount: failed.length,
                            results,
                        },
                        message: failed.length === 0
                            ? `Wrote ${results.length} component properties`
                            : `${failed.length}/${results.length} component property writes failed`,
                    };
                } },
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
                resolve((0, response_1.ok)({
                    nodeUuid,
                    componentType,
                    componentVerified: true,
                    existing: true,
                }, `Component '${componentType}' already exists on node`));
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
                        resolve((0, response_1.fail)(`Failed to verify component addition: ${afterInfo.error || 'Unable to get node components'}`));
                        return;
                    }
                    const afterList = afterInfo.data.components;
                    // Strict match: built-in components like cc.Sprite show their
                    // class name in `type`. Hits the same shape the caller passed.
                    const addedComponent = afterList.find((comp) => comp.type === componentType);
                    if (addedComponent) {
                        resolve((0, response_1.ok)({
                            nodeUuid,
                            componentType,
                            componentVerified: true,
                            existing: false,
                        }, `Component '${componentType}' added successfully`));
                        return;
                    }
                    // Lenient fallback: custom scripts surface as a cid (e.g.
                    // "9b4a7ueT9xD6aRE+AlOusy1") in __comps__.type, not as the
                    // class name. If the component count grew, accept the new
                    // entry as the one we just added.
                    const newEntries = afterList.filter((comp) => !beforeTypes.has(comp.type));
                    if (newEntries.length > 0) {
                        const registeredAs = newEntries[0].type;
                        resolve((0, response_1.ok)({
                            nodeUuid,
                            componentType,
                            registeredAs,
                            componentVerified: true,
                            existing: false,
                        }, `Component '${componentType}' added successfully (registered as cid '${registeredAs}'; this is normal for custom scripts).`));
                        return;
                    }
                    resolve((0, response_1.fail)(`Component '${componentType}' was not found on node after addition. Available components: ${afterList.map((c) => c.type).join(', ')}`));
                }
                catch (verifyError) {
                    resolve((0, response_1.fail)(`Failed to verify component addition: ${verifyError.message}`));
                }
            }).catch((err) => {
                // 備用方案：使用場景腳本
                (0, scene_bridge_1.runSceneMethod)('addComponentToNode', [nodeUuid, componentType]).then((result) => {
                    resolve(result);
                }).catch((err2) => {
                    resolve((0, response_1.fail)(`Direct API failed: ${err.message}, Scene script failed: ${err2.message}`));
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
                resolve((0, response_1.fail)(`Failed to get components for node '${nodeUuid}': ${allComponentsInfo.error}`));
                return;
            }
            // 2. 只查找type字段等於componentType的組件（即cid）
            const exists = allComponentsInfo.data.components.some((comp) => comp.type === componentType);
            if (!exists) {
                resolve((0, response_1.fail)(`Component cid '${componentType}' not found on node '${nodeUuid}'. 請用getComponents獲取type字段（cid）作為componentType。`));
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
                    resolve((0, response_1.fail)(`Component cid '${componentType}' was not removed from node '${nodeUuid}'.`));
                }
                else {
                    resolve((0, response_1.ok)({ nodeUuid, componentType }, `Component cid '${componentType}' removed successfully from node '${nodeUuid}'`));
                }
            }
            catch (err) {
                resolve((0, response_1.fail)(`Failed to remove component: ${err.message}`));
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
                    resolve((0, response_1.ok)({
                        nodeUuid: nodeUuid,
                        components: components
                    }));
                }
                else {
                    resolve((0, response_1.fail)('Node not found or no components data'));
                }
            }).catch((err) => {
                // 備用方案：使用場景腳本
                (0, scene_bridge_1.runSceneMethod)('getNodeInfo', [nodeUuid]).then((result) => {
                    if (result.success) {
                        resolve((0, response_1.ok)(result.data.components));
                    }
                    else {
                        resolve(result);
                    }
                }).catch((err2) => {
                    resolve((0, response_1.fail)(`Direct API failed: ${err.message}, Scene script failed: ${err2.message}`));
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
                        resolve((0, response_1.ok)({
                            nodeUuid: nodeUuid,
                            componentType: componentType,
                            enabled: component.enabled !== undefined ? component.enabled : true,
                            properties: this.extractComponentProperties(component)
                        }));
                    }
                    else {
                        resolve((0, response_1.fail)(`Component '${componentType}' not found on node`));
                    }
                }
                else {
                    resolve((0, response_1.fail)('Node not found or no components data'));
                }
            }).catch((err) => {
                // 備用方案：使用場景腳本
                (0, scene_bridge_1.runSceneMethod)('getNodeInfo', [nodeUuid]).then((result) => {
                    if (result.success && result.data.components) {
                        const component = result.data.components.find((comp) => comp.type === componentType);
                        if (component) {
                            resolve((0, response_1.ok)(Object.assign({ nodeUuid: nodeUuid, componentType: componentType }, component)));
                        }
                        else {
                            resolve((0, response_1.fail)(`Component '${componentType}' not found on node`));
                        }
                    }
                    else {
                        resolve((0, response_1.fail)(result.error || 'Failed to get component info'));
                    }
                }).catch((err2) => {
                    resolve((0, response_1.fail)(`Direct API failed: ${err.message}, Scene script failed: ${err2.message}`));
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
                    resolve((0, response_1.fail)(`Failed to analyze property '${property}': ${analyzeError.message}`));
                    return;
                }
                if (!propertyInfo.exists) {
                    resolve((0, response_1.fail)(`Property '${property}' not found on component '${componentType}'. Available properties: ${propertyInfo.availableProperties.join(', ')}`));
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
                resolve((0, response_1.ok)({
                    nodeUuid,
                    componentType,
                    property,
                    actualValue: verification.actualValue,
                    changeVerified: verification.verified
                }, `Successfully set ${componentType}.${property}`));
            }
            catch (error) {
                console.error(`[ComponentTools] Error setting property:`, error);
                resolve((0, response_1.fail)(`Failed to set property: ${error.message}`));
            }
        });
    }
    async attachScript(nodeUuid, scriptPath) {
        return new Promise(async (resolve) => {
            var _a, _b;
            // 從腳本路徑提取組件類名
            const scriptName = (_a = scriptPath.split('/').pop()) === null || _a === void 0 ? void 0 : _a.replace('.ts', '').replace('.js', '');
            if (!scriptName) {
                resolve((0, response_1.fail)('Invalid script path'));
                return;
            }
            // 先查找節點上是否已存在該腳本組件
            const allComponentsInfo = await this.getComponents(nodeUuid);
            if (allComponentsInfo.success && ((_b = allComponentsInfo.data) === null || _b === void 0 ? void 0 : _b.components)) {
                const existingScript = allComponentsInfo.data.components.find((comp) => comp.type === scriptName);
                if (existingScript) {
                    resolve((0, response_1.ok)({
                        nodeUuid: nodeUuid,
                        componentName: scriptName,
                        existing: true
                    }, `Script '${scriptName}' already exists on node`));
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
                        resolve((0, response_1.ok)({
                            nodeUuid: nodeUuid,
                            componentName: scriptName,
                            existing: false
                        }, `Script '${scriptName}' attached successfully`));
                    }
                    else {
                        resolve((0, response_1.fail)(`Script '${scriptName}' was not found on node after addition. Available components: ${allComponentsInfo2.data.components.map((c) => c.type).join(', ')}`));
                    }
                }
                else {
                    resolve((0, response_1.fail)(`Failed to verify script addition: ${allComponentsInfo2.error || 'Unable to get node components'}`));
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
        return (0, response_1.ok)({
            category: category,
            components: components
        });
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tcG9uZW50LXRvb2xzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL3Rvb2xzL2NvbXBvbmVudC10b29scy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSw4Q0FBMkM7QUFFM0Msb0NBQXNDO0FBQ3RDLDBDQUFrQztBQUNsQyxzREFBMkQ7QUFDM0Qsc0RBQW1GO0FBRW5GLGtFQUFzRjtBQUV0Rjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQTRCRztBQUNILEtBQUssVUFBVSxnQkFBZ0IsQ0FDM0IsUUFBZ0IsRUFDaEIsYUFBcUIsRUFDckIsYUFBc0I7O0lBRXRCLElBQUksQ0FBQztRQUNELE1BQU0sUUFBUSxHQUFRLE1BQU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLFlBQVksRUFBRSxRQUFRLENBQUMsQ0FBQztRQUNwRixNQUFNLEtBQUssR0FBVSxNQUFBLFFBQVEsYUFBUixRQUFRLHVCQUFSLFFBQVEsQ0FBRSxTQUFTLG1DQUFJLEVBQUUsQ0FBQztRQUMvQyxJQUFJLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUNiLElBQUksYUFBYSxFQUFFLENBQUM7WUFDaEIsR0FBRyxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUUsZUFBQyxPQUFBLENBQUMsTUFBQSxNQUFBLENBQUMsYUFBRCxDQUFDLHVCQUFELENBQUMsQ0FBRSxJQUFJLDBDQUFFLEtBQUssbUNBQUksQ0FBQyxhQUFELENBQUMsdUJBQUQsQ0FBQyxDQUFFLElBQUksQ0FBQyxLQUFLLGFBQWEsQ0FBQSxFQUFBLENBQUMsQ0FBQztRQUM5RSxDQUFDO1FBQ0QsSUFBSSxHQUFHLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQztZQUNiLEdBQUcsR0FBRyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFBLENBQUMsYUFBRCxDQUFDLHVCQUFELENBQUMsQ0FB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LE1BQU0sR0FBRyxHQUFHLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUU1QixnQ0FBZ0M7UUFDaEMsSUFBSSxHQUFHLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDdEIsSUFBSSxHQUFHLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUMsVUFBVTtnQkFDOUIsTUFBTSxDQUFDLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUM1QyxNQUFNLENBQUMsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7Z0JBQzVDLE1BQU0sQ0FBQyxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztnQkFDNUMsT0FBTyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQztZQUMvQixDQUFDO2lCQUFNLElBQUksR0FBRyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDLFlBQVk7Z0JBQ3ZDLE1BQU0sQ0FBQyxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztnQkFDNUMsTUFBTSxDQUFDLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUM1QyxNQUFNLENBQUMsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7Z0JBQzVDLE1BQU0sQ0FBQyxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsU0FBUyxD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YWlsIH0gZnJvbSAnLi4vbGliL3Jlc3BvbnNlJztcbmltcG9ydCB7IFRvb2xEZWZpbml0aW9uLCBUb29sUmVzcG9uc2UsIFRvb2xFeGVjdXRvciwgQ29tcG9uZW50SW5mbyB9IGZyb20gJy4uL3R5cGVzJztcbmltcG9ydCB7IGRlYnVnTG9nIH0gZnJvbSAnLi4vbGliL2xvZyc7XG5pbXBvcnQgeyB6IH0gZnJvbSAnLi4vbGliL3NjaGVtYSc7XG5pbXBvcnQgeyBkZWZpbmVUb29scywgVG9vbERlZiB9IGZyb20gJy4uL2xpYi9kZWZpbmUtdG9vbHMnO1xuaW1wb3J0IHsgcnVuU2NlbmVNZXRob2QsIHJ1blNjZW5lTWV0aG9kQXNUb29sUmVzcG9uc2UgfSBmcm9tICcuLi9saWIvc2NlbmUtYnJpZGdlJztcbmltcG9ydCB7IHJlc29sdmVPclRvb2xFcnJvciB9IGZyb20gJy4uL2xpYi9yZXNvbHZlLW5vZGUnO1xuaW1wb3J0IHsgaW5zdGFuY2VSZWZlcmVuY2VTY2hlbWEsIHJlc29sdmVSZWZlcmVuY2UgfSBmcm9tICcuLi9saWIvaW5zdGFuY2UtcmVmZXJlbmNlJztcblxuLyoqXG4gKiBGb3JjZSB0aGUgZWRpdG9yJ3Mgc2VyaWFsaXphdGlvbiBtb2RlbCB0byByZS1wdWxsIGEgY29tcG9uZW50IGR1bXBcbiAqIGZyb20gcnVudGltZS4gQ0xBVURFLm1kIExhbmRtaW5lICMxMTogc2NlbmUtc2NyaXB0IGBhcnIucHVzaGAgbXV0YXRpb25zXG4gKiBvbmx5IHRvdWNoIHRoZSBydW50aW1lOyB0aGUgbW9kZWwgdGhhdCBgc2F2ZS1zY2VuZWAgd3JpdGVzIHRvIGRpc2sgaXNcbiAqIG9ubHkgdXBkYXRlZCB3aGVuIGNoYW5nZXMgZmxvdyB0aHJvdWdoIHRoZSBlZGl0b3IncyBzZXQtcHJvcGVydHlcbiAqIGNoYW5uZWwuXG4gKlxuICogQ2FsbGluZyBgc2V0LXByb3BlcnR5YCBmcm9tIGluc2lkZSBzY2VuZS1zY3JpcHQgZG9lc24ndCBwcm9wYWdhdGUgKHRoZVxuICogc2NlbmUtcHJvY2VzcyBJUEMgc2hvcnQtY2lyY3VpdHMpLiBUaGUgbnVkZ2UgbXVzdCBjb21lIGZyb20gaG9zdCBzaWRlLlxuICpcbiAqIFRoZSBzZXQtcHJvcGVydHkgY2hhbm5lbCBmb3IgY29tcG9uZW50IHByb3BlcnRpZXMgdXNlcyBhIG5vZGUtcm9vdGVkXG4gKiBwYXRoOiBgdXVpZCA9IG5vZGVVdWlkYCwgYHBhdGggPSBfX2NvbXBzX18uPGluZGV4Pi48cHJvcGVydHk+YC4gV2VcbiAqIHF1ZXJ5IHRoZSBub2RlLCBsb2NhdGUgdGhlIG1hdGNoaW5nIGNvbXBvbmVudCwgYW5kIHNldCBgZW5hYmxlZGAgdG9cbiAqIGl0cyBjdXJyZW50IHZhbHVlIChuby1vcCBzZW1hbnRpY2FsbHksIGZvcmNlcyBzeW5jKS5cbiAqXG4gKiBMb29rdXAgcHJlY2VkZW5jZTpcbiAqICAgMS4gYGNvbXBvbmVudFV1aWRgIChwcmVjaXNlIOKAlCBkaXNhbWJpZ3VhdGVzIG11bHRpcGxlIHNhbWUtdHlwZVxuICogICAgICBjb21wb25lbnRzIG9uIHRoZSBzYW1lIG5vZGUpLlxuICogICAyLiBgY29tcG9uZW50VHlwZWAgZmFsbGJhY2sgaWYgdXVpZCB3YXNuJ3Qgc3VwcGxpZWQgb3IgZGlkbid0XG4gKiAgICAgIG1hdGNoIChjb3ZlcnMgdGVzdHMgLyBvbGRlciBjYWxsZXJzKS5cbiAqXG4gKiBgZW5hYmxlZFZhbHVlYCBpcyByZWFkIGRlZmVuc2l2ZWx5IGJlY2F1c2UgdGhlIGBxdWVyeS1ub2RlYCBkdW1wIHNoYXBlXG4gKiB2YXJpZXMgYWNyb3NzIENvY29zIHZlcnNpb25zOiBwcm9wZXJ0aWVzIGNhbiBiZSBmbGF0IChgY29tcC5lbmFibGVkYClcbiAqIG9yIG5lc3RlZCAoYGNvbXAudmFsdWUuZW5hYmxlZC52YWx1ZWApLiBXZSB0cnkgbmVzdGVkIGZpcnN0LCBmYWxsXG4gKiBiYWNrIHRvIGZsYXQg4oCUIG1hdGNoZXMgdGhlIHBhdHRlcm4gdXNlZCBieSBgZ2V0Q29tcG9uZW50c2AuXG4gKlxuICogQmVzdC1lZmZvcnQ6IGZhaWx1cmVzIGFyZSBzd2FsbG93ZWQgYmVjYXVzZSB0aGUgcnVudGltZSBtdXRhdGlvblxuICogYWxyZWFkeSBoYXBwZW5lZCDigJQgb25seSBwZXJzaXN0ZW5jZSB0byBkaXNrIGlzIGF0IHN0YWtlLlxuICovXG5hc3luYyBmdW5jdGlvbiBudWRnZUVkaXRvck1vZGVsKFxuICAgIG5vZGVVdWlkOiBzdHJpbmcsXG4gICAgY29tcG9uZW50VHlwZTogc3RyaW5nLFxuICAgIGNvbXBvbmVudFV1aWQ/OiBzdHJpbmcsXG4pOiBQcm9taXNlPHZvaWQ+IHtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCBub2RlRGF0YTogYW55ID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktbm9kZScsIG5vZGVVdWlkKTtcbiAgICAgICAgY29uc3QgY29tcHM6IGFueVtdID0gbm9kZURhdGE/Ll9fY29tcHNfXyA/PyBbXTtcbiAgICAgICAgbGV0IGlkeCA9IC0xO1xuICAgICAgICBpZiAoY29tcG9uZW50VXVpZCkge1xuICAgICAgICAgICAgaWR4ID0gY29tcHMuZmluZEluZGV4KGMgPT4gKGM/LnV1aWQ/LnZhbHVlID8/IGM/LnV1aWQpID09PSBjb21wb25lbnRVdWlkKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoaWR4ID09PSAtMSkge1xuICAgICAgICAgICAgaWR4ID0gY29tcHMuZmluZEluZGV4KGMgPT4gKGM/Ll9fdHlwZV9fIHx8IGM/LmNpZCB8fCBjPy50eXBlKSA9PT0gY29tcG9uZW50VHlwZSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGlkeCA9PT0gLTEpIHJldHVybjtcbiAgICAgICAgY29uc3QgcmF3ID0gY29tcHNbaWR4XTtcbiAgICAgICAgY29uc3QgZW5hYmxlZFZhbHVlOiBib29sZWFuID1cbiAgICAgICAgICAgIHJhdz8udmFsdWU/LmVuYWJsZWQ/LnZhbHVlICE9PSB1bmRlZmluZWRcbiAgICAgICAgICAgICAgICA/IHJhdy52YWx1ZS5lbmFibGVkLnZhbHVlICE9PSBmYWxzZVxuICAgICAgICAgICAgICAgIDogcmF3Py5lbmFibGVkICE9PSBmYWxzZTtcbiAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnc2V0LXByb3BlcnR5Jywge1xuICAgICAgICAgICAgdXVpZDogbm9kZVV1aWQsXG4gICAgICAgICAgICBwYXRoOiBgX19jb21wc19fLiR7aWR4fS5lbmFibGVkYCxcbiAgICAgICAgICAgIGR1bXA6IHsgdmFsdWU6IGVuYWJsZWRWYWx1ZSB9LFxuICAgICAgICB9KTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgZGVidWdMb2coJ1tDb21wb25lbnRUb29sc10gbnVkZ2Ugc2V0LXByb3BlcnR5IGZhaWxlZCAobm9uLWZhdGFsKTonLCBlcnIpO1xuICAgIH1cbn1cblxuY29uc3Qgc2V0Q29tcG9uZW50UHJvcGVydHlWYWx1ZURlc2NyaXB0aW9uID1cbiAgICAnUHJvcGVydHkgdmFsdWUgLSBVc2UgdGhlIGNvcnJlc3BvbmRpbmcgZGF0YSBmb3JtYXQgYmFzZWQgb24gcHJvcGVydHlUeXBlOlxcblxcbicgK1xuICAgICfwn5OdIEJhc2ljIERhdGEgVHlwZXM6XFxuJyArXG4gICAgJ+KAoiBzdHJpbmc6IFwiSGVsbG8gV29ybGRcIiAodGV4dCBzdHJpbmcpXFxuJyArXG4gICAgJ+KAoiBudW1iZXIvaW50ZWdlci9mbG9hdDogNDIgb3IgMy4xNCAobnVtZXJpYyB2YWx1ZSlcXG4nICtcbiAgICAn4oCiIGJvb2xlYW46IHRydWUgb3IgZmFsc2UgKGJvb2xlYW4gdmFsdWUpXFxuXFxuJyArXG4gICAgJ/CfjqggQ29sb3IgVHlwZTpcXG4nICtcbiAgICAn4oCiIGNvbG9yOiB7XCJyXCI6MjU1LFwiZ1wiOjAsXCJiXCI6MCxcImFcIjoyNTV9IChSR0JBIHZhbHVlcywgcmFuZ2UgMC0yNTUpXFxuJyArXG4gICAgJyAgLSBBbHRlcm5hdGl2ZTogXCIjRkYwMDAwXCIgKGhleGFkZWNpbWFsIGZvcm1hdClcXG4nICtcbiAgICAnICAtIFRyYW5zcGFyZW5jeTogYSB2YWx1ZSBjb250cm9scyBvcGFjaXR5LCAyNTUgPSBmdWxseSBvcGFxdWUsIDAgPSBmdWxseSB0cmFuc3BhcmVudFxcblxcbicgK1xuICAgICfwn5OQIFZlY3RvciBhbmQgU2l6ZSBUeXBlczpcXG4nICtcbiAgICAn4oCiIHZlYzI6IHtcInhcIjoxMDAsXCJ5XCI6NTB9ICgyRCB2ZWN0b3IpXFxuJyArXG4gICAgJ+KAoiB2ZWMzOiB7XCJ4XCI6MSxcInlcIjoyLFwielwiOjN9ICgzRCB2ZWN0b3IpXFxuJyArXG4gICAgJ+KAoiBzaXplOiB7XCJ3aWR0aFwiOjEwMCxcImhlaWdodFwiOjUwfSAoc2l6ZSBkaW1lbnNpb25zKVxcblxcbicgK1xuICAgICfwn5SXIFJlZmVyZW5jZSBUeXBlcyAodXNpbmcgVVVJRCBzdHJpbmdzKTpcXG4nICtcbiAgICAn4oCiIG5vZGU6IFwidGFyZ2V0LW5vZGUtdXVpZFwiIChjYy5Ob2RlIHJlZmVyZW5jZSDigJQgcHJvcGVydHkgbWV0YWRhdGEgdHlwZSA9PT0gXCJjYy5Ob2RlXCIpXFxuJyArXG4gICAgJyAgSG93IHRvIGdldDogVXNlIGdldF9hbGxfbm9kZXMgb3IgZmluZF9ub2RlX2J5X25hbWUgdG8gZ2V0IG5vZGUgVVVJRHNcXG4nICtcbiAgICAn4oCiIGNvbXBvbmVudDogXCJ0YXJnZXQtbm9kZS11dWlkXCIgKGNjLkNvbXBvbmVudCBzdWJjbGFzcyByZWZlcmVuY2Ug4oCUIGUuZy4gY2MuQ2FtZXJhLCBjYy5TcHJpdGUpXFxuJyArXG4gICAgJyAg4pqg77iPIEVhc3kgdG8gY29uZnVzZSB3aXRoIFwibm9kZVwiOiBwaWNrIFwiY29tcG9uZW50XCIgd2hlbmV2ZXIgdGhlIHByb3BlcnR5XFxuJyArXG4gICAgJyAgICAgbWV0YWRhdGEgZXhwZWN0cyBhIENvbXBvbmVudCBzdWJjbGFzcywgZXZlbiB0aG91Z2ggdGhlIHZhbHVlIGlzIHN0aWxsXFxuJyArXG4gICAgJyAgICAgYSBOT0RFIFVVSUQgKHRoZSBzZXJ2ZXIgYXV0by1yZXNvbHZlcyB0aGUgY29tcG9uZW50XFwncyBzY2VuZSBfX2lkX18pLlxcbicgK1xuICAgICcgIEV4YW1wbGUg4oCUIGNjLkNhbnZhcy5jYW1lcmFDb21wb25lbnQgZXhwZWN0cyBhIGNjLkNhbWVyYSByZWY6XFxuJyArXG4gICAgJyAgICAgcHJvcGVydHlUeXBlOiBcImNvbXBvbmVudFwiLCB2YWx1ZTogXCI8VVVJRCBvZiBub2RlIHRoYXQgaGFzIGNjLkNhbWVyYT5cIlxcbicgK1xuICAgICcgIFBpdGZhbGw6IHBhc3NpbmcgcHJvcGVydHlUeXBlOiBcIm5vZGVcIiBmb3IgY2FtZXJhQ29tcG9uZW50IGFwcGVhcnMgdG9cXG4nICtcbiAgICAnICAgICBzdWNjZWVkIGF0IHRoZSBJUEMgbGF5ZXIgYnV0IHRoZSByZWZlcmVuY2UgbmV2ZXIgY29ubmVjdHMuXFxuJyArXG4gICAgJ+KAoiBzcHJpdGVGcmFtZTogXCJzcHJpdGVmcmFtZS11dWlkXCIgKHNwcml0ZSBmcmFtZSBhc3NldClcXG4nICtcbiAgICAnICBIb3cgdG8gZ2V0OiBDaGVjayBhc3NldCBkYXRhYmFzZSBvciB1c2UgYXNzZXQgYnJvd3NlclxcbicgK1xuICAgICcgIOKaoO+4jyBEZWZhdWx0IGNjLlNwcml0ZS5zaXplTW9kZSBpcyBUUklNTUVEICgxKSwgc28gYXNzaWduaW5nIHNwcml0ZUZyYW1lXFxuJyArXG4gICAgJyAgICAgYXV0by1yZXNpemVzIGNjLlVJVHJhbnNmb3JtLmNvbnRlbnRTaXplIHRvIHRoZSB0ZXh0dXJlIG5hdGl2ZSBzaXplLlxcbicgK1xuICAgICcgICAgIFBhc3MgcHJlc2VydmVDb250ZW50U2l6ZTogdHJ1ZSB0byBrZWVwIHRoZSBub2RlXFwncyBjdXJyZW50IGNvbnRlbnRTaXplXFxuJyArXG4gICAgJyAgICAgKHRoZSBzZXJ2ZXIgcHJlLXNldHMgc2l6ZU1vZGUgdG8gQ1VTVE9NICgwKSBiZWZvcmUgdGhlIGFzc2lnbikuXFxuJyArXG4gICAgJ+KAoiBwcmVmYWI6IFwicHJlZmFiLXV1aWRcIiAocHJlZmFiIGFzc2V0KVxcbicgK1xuICAgICcgIEhvdyB0byBnZXQ6IENoZWNrIGFzc2V0IGRhdGFiYXNlIG9yIHVzZSBhc3NldCBicm93c2VyXFxuJyArXG4gICAgJ+KAoiBhc3NldDogXCJhc3NldC11dWlkXCIgKGdlbmVyaWMgYXNzZXQgcmVmZXJlbmNlKVxcbicgK1xuICAgICcgIEhvdyB0byBnZXQ6IENoZWNrIGFzc2V0IGRhdGFiYXNlIG9yIHVzZSBhc3NldCBicm93c2VyXFxuXFxuJyArXG4gICAgJ/Cfk4sgQXJyYXkgVHlwZXM6XFxuJyArXG4gICAgJ+KAoiBub2RlQXJyYXk6IFtcInV1aWQxXCIsXCJ1dWlkMlwiXSAoYXJyYXkgb2Ygbm9kZSBVVUlEcylcXG4nICtcbiAgICAn4oCiIGNvbG9yQXJyYXk6IFt7XCJyXCI6MjU1LFwiZ1wiOjAsXCJiXCI6MCxcImFcIjoyNTV9XSAoYXJyYXkgb2YgY29sb3JzKVxcbicgK1xuICAgICfigKIgbnVtYmVyQXJyYXk6IFsxLDIsMyw0LDVdIChhcnJheSBvZiBudW1iZXJzKVxcbicgK1xuICAgICfigKIgc3RyaW5nQXJyYXk6IFtcIml0ZW0xXCIsXCJpdGVtMlwiXSAoYXJyYXkgb2Ygc3RyaW5ncyknO1xuXG5jb25zdCBzZXRDb21wb25lbnRQcm9wZXJ0eVByb3BlcnR5RGVzY3JpcHRpb24gPVxuICAgICdQcm9wZXJ0eSBuYW1lIC0gVGhlIHByb3BlcnR5IHRvIHNldC4gQ29tbW9uIHByb3BlcnRpZXMgaW5jbHVkZTpcXG4nICtcbiAgICAn4oCiIGNjLkxhYmVsOiBzdHJpbmcgKHRleHQgY29udGVudCksIGZvbnRTaXplIChmb250IHNpemUpLCBjb2xvciAodGV4dCBjb2xvcilcXG4nICtcbiAgICAn4oCiIGNjLlNwcml0ZTogc3ByaXRlRnJhbWUgKHNwcml0ZSBmcmFtZSksIGNvbG9yICh0aW50IGNvbG9yKSwgc2l6ZU1vZGUgKHNpemUgbW9kZSlcXG4nICtcbiAgICAn4oCiIGNjLkJ1dHRvbjogbm9ybWFsQ29sb3IgKG5vcm1hbCBjb2xvciksIHByZXNzZWRDb2xvciAocHJlc3NlZCBjb2xvciksIHRhcmdldCAodGFyZ2V0IG5vZGUg4oCUIHByb3BlcnR5VHlwZTogXCJub2RlXCIpXFxuJyArXG4gICAgJ+KAoiBjYy5DYW52YXM6IGNhbWVyYUNvbXBvbmVudCAoY2MuQ2FtZXJhIHJlZiDigJQgcHJvcGVydHlUeXBlOiBcImNvbXBvbmVudFwiLCB2YWx1ZSA9IG5vZGUgVVVJRCBob3N0aW5nIHRoZSBjYW1lcmEpXFxuJyArXG4gICAgJ+KAoiBjYy5VSVRyYW5zZm9ybTogY29udGVudFNpemUgKGNvbnRlbnQgc2l6ZSksIGFuY2hvclBvaW50IChhbmNob3IgcG9pbnQpXFxuJyArXG4gICAgJ+KAoiBDdXN0b20gU2NyaXB0czogQmFzZWQgb24gcHJvcGVydGllcyBkZWZpbmVkIGluIHRoZSBzY3JpcHQnO1xuXG5leHBvcnQgY2xhc3MgQ29tcG9uZW50VG9vbHMgaW1wbGVtZW50cyBUb29sRXhlY3V0b3Ige1xuICAgIHByaXZhdGUgcmVhZG9ubHkgZXhlYzogVG9vbEV4ZWN1dG9yO1xuXG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIGNvbnN0IGRlZnM6IFRvb2xEZWZbXSA9IFtcbiAgICAgICAgICAgIHsgbmFtZTogJ2FkZF9jb21wb25lbnQnLCB0aXRsZTogJ0FkZCBub2RlIGNvbXBvbmVudCcsIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIEFkZCBhIGNvbXBvbmVudCB0byBhIG5vZGUuIE11dGF0ZXMgc2NlbmU7IHZlcmlmeSB0aGUgY29tcG9uZW50IHR5cGUgb3Igc2NyaXB0IGNsYXNzIG5hbWUgZmlyc3QuIEFjY2VwdHMgcmVmZXJlbmNlPXtpZCx0eXBlfSAocHJlZmVycmVkKSwgbm9kZVV1aWQsIG9yIG5vZGVOYW1lLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgcmVmZXJlbmNlOiBpbnN0YW5jZVJlZmVyZW5jZVNjaGVtYS5vcHRpb25hbCgpLmRlc2NyaWJlKCdJbnN0YW5jZVJlZmVyZW5jZSB7aWQsdHlwZX0gZm9yIHRoZSBob3N0IG5vZGUuIFByZWZlcnJlZCBmb3JtLicpLFxuICAgICAgICAgICAgICAgICAgICBub2RlVXVpZDogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdUYXJnZXQgbm9kZSBVVUlELiBVc2VkIHdoZW4gcmVmZXJlbmNlIGlzIG9taXR0ZWQuJyksXG4gICAgICAgICAgICAgICAgICAgIG5vZGVOYW1lOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1RhcmdldCBub2RlIG5hbWUgKGRlcHRoLWZpcnN0IGZpcnN0IG1hdGNoKS4gVXNlZCB3aGVuIHJlZmVyZW5jZSBhbmQgbm9kZVV1aWQgYXJlIG9taXR0ZWQuJyksXG4gICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudFR5cGU6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0NvbXBvbmVudCB0eXBlIHRvIGFkZCwgZS5nLiBjYy5TcHJpdGUsIGNjLkxhYmVsLCBjYy5CdXR0b24sIG9yIGEgY3VzdG9tIHNjcmlwdCBjbGFzcyBuYW1lLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGFzeW5jIGEgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCByID0gYXdhaXQgcmVzb2x2ZVJlZmVyZW5jZSh7IHJlZmVyZW5jZTogYS5yZWZlcmVuY2UsIG5vZGVVdWlkOiBhLm5vZGVVdWlkLCBub2RlTmFtZTogYS5ub2RlTmFtZSB9KTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCdyZXNwb25zZScgaW4gcikgcmV0dXJuIHIucmVzcG9uc2U7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkZENvbXBvbmVudChyLnV1aWQsIGEuY29tcG9uZW50VHlwZSk7XG4gICAgICAgICAgICAgICAgfSB9LFxuICAgICAgICAgICAgeyBuYW1lOiAncmVtb3ZlX2NvbXBvbmVudCcsIHRpdGxlOiAnUmVtb3ZlIG5vZGUgY29tcG9uZW50JywgZGVzY3JpcHRpb246IFwiW3NwZWNpYWxpc3RdIFJlbW92ZSBhIGNvbXBvbmVudCBmcm9tIGEgbm9kZS4gTXV0YXRlcyBzY2VuZTsgY29tcG9uZW50VHlwZSBtdXN0IGJlIHRoZSBjaWQvdHlwZSByZXR1cm5lZCBieSBnZXRfY29tcG9uZW50cywgbm90IGEgZ3Vlc3NlZCBzY3JpcHQgbmFtZS5cIixcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBub2RlVXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnTm9kZSBVVUlEIHRoYXQgb3ducyB0aGUgY29tcG9uZW50IHRvIHJlbW92ZS4nKSxcbiAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50VHlwZTogei5zdHJpbmcoKS5kZXNjcmliZSgnQ29tcG9uZW50IGNpZCAodHlwZSBmaWVsZCBmcm9tIGdldENvbXBvbmVudHMpLiBEbyBOT1QgdXNlIHNjcmlwdCBuYW1lIG9yIGNsYXNzIG5hbWUuIEV4YW1wbGU6IFwiY2MuU3ByaXRlXCIgb3IgXCI5YjRhN3VlVDl4RDZhUkUrQWxPdXN5MVwiJyksXG4gICAgICAgICAgICAgICAgfSksIGhhbmRsZXI6IGEgPT4gdGhpcy5yZW1vdmVDb21wb25lbnQoYS5ub2RlVXVpZCwgYS5jb21wb25lbnRUeXBlKSB9LFxuICAgICAgICAgICAgeyBuYW1lOiAnZ2V0X2NvbXBvbmVudHMnLCB0aXRsZTogJ0xpc3Qgbm9kZSBjb21wb25lbnRzJywgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gTGlzdCBhbGwgY29tcG9uZW50cyBvbiBhIG5vZGUuIEluY2x1ZGVzIHR5cGUvY2lkIGFuZCBiYXNpYyBwcm9wZXJ0aWVzOyB1c2UgYmVmb3JlIHJlbW92ZV9jb21wb25lbnQgb3Igc2V0X2NvbXBvbmVudF9wcm9wZXJ0eS4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIG5vZGVVdWlkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdOb2RlIFVVSUQgd2hvc2UgY29tcG9uZW50cyBzaG91bGQgYmUgbGlzdGVkLicpLFxuICAgICAgICAgICAgICAgIH0pLCBoYW5kbGVyOiBhID0+IHRoaXMuZ2V0Q29tcG9uZW50cyhhLm5vZGVVdWlkKSB9LFxuICAgICAgICAgICAgeyBuYW1lOiAnZ2V0X2NvbXBvbmVudF9pbmZvJywgdGl0bGU6ICdSZWFkIGNvbXBvbmVudCBpbmZvJywgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gUmVhZCBkZXRhaWxlZCBkYXRhIGZvciBvbmUgY29tcG9uZW50IG9uIGEgbm9kZS4gTm8gbXV0YXRpb247IHVzZSB0byBpbnNwZWN0IHByb3BlcnR5IG5hbWVzIGFuZCB2YWx1ZSBzaGFwZXMgYmVmb3JlIGVkaXRpbmcuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBub2RlVXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnTm9kZSBVVUlEIHRoYXQgb3ducyB0aGUgY29tcG9uZW50LicpLFxuICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRUeXBlOiB6LnN0cmluZygpLmRlc2NyaWJlKCdDb21wb25lbnQgdHlwZS9jaWQgdG8gaW5zcGVjdC4gVXNlIGdldF9jb21wb25lbnRzIGZpcnN0IGlmIHVuc3VyZS4nKSxcbiAgICAgICAgICAgICAgICB9KSwgaGFuZGxlcjogYSA9PiB0aGlzLmdldENvbXBvbmVudEluZm8oYS5ub2RlVXVpZCwgYS5jb21wb25lbnRUeXBlKSB9LFxuICAgICAgICAgICAgeyBuYW1lOiAnc2V0X2NvbXBvbmVudF9wcm9wZXJ0eScsIHRpdGxlOiAnU2V0IGNvbXBvbmVudCBwcm9wZXJ0eScsIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFNldCBvbmUgcHJvcGVydHkgb24gYSBub2RlIGNvbXBvbmVudC4gU3VwcG9ydHMgYnVpbHQtaW4gVUkgYW5kIGN1c3RvbSBzY3JpcHQgY29tcG9uZW50cy4gQWNjZXB0cyByZWZlcmVuY2U9e2lkLHR5cGV9IChwcmVmZXJyZWQpLCBub2RlVXVpZCwgb3Igbm9kZU5hbWUuIE5vdGU6IEZvciBub2RlIGJhc2ljIHByb3BlcnRpZXMgKG5hbWUsIGFjdGl2ZSwgbGF5ZXIsIGV0Yy4pLCB1c2Ugc2V0X25vZGVfcHJvcGVydHkuIEZvciBub2RlIHRyYW5zZm9ybSBwcm9wZXJ0aWVzIChwb3NpdGlvbiwgcm90YXRpb24sIHNjYWxlLCBldGMuKSwgdXNlIHNldF9ub2RlX3RyYW5zZm9ybS4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHJlZmVyZW5jZTogaW5zdGFuY2VSZWZlcmVuY2VTY2hlbWEub3B0aW9uYWwoKS5kZXNjcmliZSgnSW5zdGFuY2VSZWZlcmVuY2Uge2lkLHR5cGV9IGZvciB0aGUgaG9zdCBub2RlLiBQcmVmZXJyZWQgZm9ybS4nKSxcbiAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnVGFyZ2V0IG5vZGUgVVVJRC4gVXNlZCB3aGVuIHJlZmVyZW5jZSBpcyBvbWl0dGVkLicpLFxuICAgICAgICAgICAgICAgICAgICBub2RlTmFtZTogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdUYXJnZXQgbm9kZSBuYW1lIChkZXB0aC1maXJzdCBmaXJzdCBtYXRjaCkuIFVzZWQgd2hlbiByZWZlcmVuY2UgYW5kIG5vZGVVdWlkIGFyZSBvbWl0dGVkLicpLFxuICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRUeXBlOiB6LnN0cmluZygpLmRlc2NyaWJlKCdDb21wb25lbnQgdHlwZSAtIENhbiBiZSBidWlsdC1pbiBjb21wb25lbnRzIChlLmcuLCBjYy5MYWJlbCkgb3IgY3VzdG9tIHNjcmlwdCBjb21wb25lbnRzIChlLmcuLCBNeVNjcmlwdCkuIElmIHVuc3VyZSBhYm91dCBjb21wb25lbnQgdHlwZSwgdXNlIGdldF9jb21wb25lbnRzIGZpcnN0IHRvIHJldHJpZXZlIGFsbCBjb21wb25lbnRzIG9uIHRoZSBub2RlLicpLFxuICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0eTogei5zdHJpbmcoKS5kZXNjcmliZShzZXRDb21wb25lbnRQcm9wZXJ0eVByb3BlcnR5RGVzY3JpcHRpb24pLFxuICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0eVR5cGU6IHouZW51bShbXG4gICAgICAgICAgICAgICAgICAgICAgICAnc3RyaW5nJywgJ251bWJlcicsICdib29sZWFuJywgJ2ludGVnZXInLCAnZmxvYXQnLFxuICAgICAgICAgICAgICAgICAgICAgICAgJ2NvbG9yJywgJ3ZlYzInLCAndmVjMycsICdzaXplJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICdub2RlJywgJ2NvbXBvbmVudCcsICdzcHJpdGVGcmFtZScsICdwcmVmYWInLCAnYXNzZXQnLFxuICAgICAgICAgICAgICAgICAgICAgICAgJ25vZGVBcnJheScsICdjb2xvckFycmF5JywgJ251bWJlckFycmF5JywgJ3N0cmluZ0FycmF5JyxcbiAgICAgICAgICAgICAgICAgICAgXSkuZGVzY3JpYmUoJ1Byb3BlcnR5IHR5cGUgLSBNdXN0IGV4cGxpY2l0bHkgc3BlY2lmeSB0aGUgcHJvcGVydHkgZGF0YSB0eXBlIGZvciBjb3JyZWN0IHZhbHVlIGNvbnZlcnNpb24gYW5kIHZhbGlkYXRpb24nKSxcbiAgICAgICAgICAgICAgICAgICAgdmFsdWU6IHouYW55KCkuZGVzY3JpYmUoc2V0Q29tcG9uZW50UHJvcGVydHlWYWx1ZURlc2NyaXB0aW9uKSxcbiAgICAgICAgICAgICAgICAgICAgcHJlc2VydmVDb250ZW50U2l6ZTogei5ib29sZWFuKCkuZGVmYXVsdChmYWxzZSkuZGVzY3JpYmUoJ1Nwcml0ZS1zcGVjaWZpYyB3b3JrZmxvdyBmbGFnLiBPbmx5IGhvbm91cmVkIHdoZW4gY29tcG9uZW50VHlwZT1cImNjLlNwcml0ZVwiIGFuZCBwcm9wZXJ0eT1cInNwcml0ZUZyYW1lXCI6IGJlZm9yZSB0aGUgYXNzaWduLCBzZXRzIGNjLlNwcml0ZS5zaXplTW9kZSB0byBDVVNUT00gKDApIHNvIHRoZSBlbmdpbmUgZG9lcyBOT1Qgb3ZlcndyaXRlIGNjLlVJVHJhbnNmb3JtLmNvbnRlbnRTaXplIHdpdGggdGhlIHRleHR1cmVcXCdzIG5hdGl2ZSBkaW1lbnNpb25zLiBVc2Ugd2hlbiBidWlsZGluZyBVSSBwcm9jZWR1cmFsbHkgYW5kIHRoZSBub2RlXFwncyBwcmUtc2V0IHNpemUgbXVzdCBiZSBrZXB0OyBsZWF2ZSBmYWxzZSAoZGVmYXVsdCkgdG8ga2VlcCBjb2Nvc1xcJyBzdGFuZGFyZCBUUklNTUVEIGF1dG8tZml0IGJlaGF2aW91ci4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhc3luYyBhID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgciA9IGF3YWl0IHJlc29sdmVSZWZlcmVuY2UoeyByZWZlcmVuY2U6IGEucmVmZXJlbmNlLCBub2RlVXVpZDogYS5ub2RlVXVpZCwgbm9kZU5hbWU6IGEubm9kZU5hbWUgfSk7XG4gICAgICAgICAgICAgICAgICAgIGlmICgncmVzcG9uc2UnIGluIHIpIHJldHVybiByLnJlc3BvbnNlO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5zZXRDb21wb25lbnRQcm9wZXJ0eSh7IC4uLmEsIG5vZGVVdWlkOiByLnV1aWQgfSk7XG4gICAgICAgICAgICAgICAgfSB9LFxuICAgICAgICAgICAgeyBuYW1lOiAnYXR0YWNoX3NjcmlwdCcsIHRpdGxlOiAnQXR0YWNoIHNjcmlwdCBjb21wb25lbnQnLCBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBBdHRhY2ggYSBzY3JpcHQgYXNzZXQgYXMgYSBjb21wb25lbnQgdG8gYSBub2RlLiBNdXRhdGVzIHNjZW5lOyB1c2UgZ2V0X2NvbXBvbmVudHMgYWZ0ZXJ3YXJkIGJlY2F1c2UgY3VzdG9tIHNjcmlwdHMgbWF5IGFwcGVhciBhcyBjaWQuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBub2RlVXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnTm9kZSBVVUlEIHRvIGF0dGFjaCB0aGUgc2NyaXB0IGNvbXBvbmVudCB0by4nKSxcbiAgICAgICAgICAgICAgICAgICAgc2NyaXB0UGF0aDogei5zdHJpbmcoKS5kZXNjcmliZSgnU2NyaXB0IGFzc2V0IGRiOi8vIHBhdGgsIGUuZy4gZGI6Ly9hc3NldHMvc2NyaXB0cy9NeVNjcmlwdC50cy4nKSxcbiAgICAgICAgICAgICAgICB9KSwgaGFuZGxlcjogYSA9PiB0aGlzLmF0dGFjaFNjcmlwdChhLm5vZGVVdWlkLCBhLnNjcmlwdFBhdGgpIH0sXG4gICAgICAgICAgICB7IG5hbWU6ICdnZXRfYXZhaWxhYmxlX2NvbXBvbmVudHMnLCB0aXRsZTogJ0xpc3QgYXZhaWxhYmxlIGNvbXBvbmVudHMnLCBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBMaXN0IGN1cmF0ZWQgYnVpbHQtaW4gY29tcG9uZW50IHR5cGVzIGJ5IGNhdGVnb3J5LiBObyBzY2VuZSBxdWVyeTsgY3VzdG9tIHByb2plY3Qgc2NyaXB0cyBhcmUgbm90IGRpc2NvdmVyZWQgaGVyZS4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIGNhdGVnb3J5OiB6LmVudW0oWydhbGwnLCAncmVuZGVyZXInLCAndWknLCAncGh5c2ljcycsICdhbmltYXRpb24nLCAnYXVkaW8nXSkuZGVmYXVsdCgnYWxsJykuZGVzY3JpYmUoJ0NvbXBvbmVudCBjYXRlZ29yeSBmaWx0ZXIgZm9yIHRoZSBidWlsdC1pbiBjdXJhdGVkIGxpc3QuJyksXG4gICAgICAgICAgICAgICAgfSksIGhhbmRsZXI6IGEgPT4gdGhpcy5nZXRBdmFpbGFibGVDb21wb25lbnRzKGEuY2F0ZWdvcnkpIH0sXG4gICAgICAgICAgICB7IG5hbWU6ICdhZGRfZXZlbnRfaGFuZGxlcicsIHRpdGxlOiAnQWRkIGV2ZW50IGhhbmRsZXInLCBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBBcHBlbmQgYSBjYy5FdmVudEhhbmRsZXIgdG8gYSBjb21wb25lbnQgZXZlbnQgYXJyYXkuIE51ZGdlcyB0aGUgZWRpdG9yIG1vZGVsIGZvciBwZXJzaXN0ZW5jZS4gTXV0YXRlcyBzY2VuZTsgdXNlIGZvciBCdXR0b24vVG9nZ2xlL1NsaWRlciBjYWxsYmFja3MuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBub2RlVXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnTm9kZSBVVUlEIG93bmluZyB0aGUgY29tcG9uZW50IChlLmcuIHRoZSBCdXR0b24gbm9kZSknKSxcbiAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50VHlwZTogei5zdHJpbmcoKS5kZWZhdWx0KCdjYy5CdXR0b24nKS5kZXNjcmliZSgnQ29tcG9uZW50IGNsYXNzIG5hbWU7IGRlZmF1bHRzIHRvIGNjLkJ1dHRvbicpLFxuICAgICAgICAgICAgICAgICAgICBldmVudEFycmF5UHJvcGVydHk6IHouc3RyaW5nKCkuZGVmYXVsdCgnY2xpY2tFdmVudHMnKS5kZXNjcmliZSgnQ29tcG9uZW50IHByb3BlcnR5IGhvbGRpbmcgdGhlIEV2ZW50SGFuZGxlciBhcnJheSAoY2MuQnV0dG9uLmNsaWNrRXZlbnRzLCBjYy5Ub2dnbGUuY2hlY2tFdmVudHMsIOKApiknKSxcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0Tm9kZVV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ05vZGUgVVVJRCB3aGVyZSB0aGUgY2FsbGJhY2sgY29tcG9uZW50IGxpdmVzIChtb3N0IG9mdGVuIHRoZSBzYW1lIGFzIG5vZGVVdWlkKScpLFxuICAgICAgICAgICAgICAgICAgICBjb21wb25lbnROYW1lOiB6LnN0cmluZygpLmRlc2NyaWJlKCdDbGFzcyBuYW1lIChjYy1jbGFzcykgb2YgdGhlIHNjcmlwdCB0aGF0IG93bnMgdGhlIGNhbGxiYWNrIG1ldGhvZCcpLFxuICAgICAgICAgICAgICAgICAgICBoYW5kbGVyOiB6LnN0cmluZygpLmRlc2NyaWJlKCdNZXRob2QgbmFtZSBvbiB0aGUgdGFyZ2V0IGNvbXBvbmVudCwgZS5nLiBcIm9uQ2xpY2tcIicpLFxuICAgICAgICAgICAgICAgICAgICBjdXN0b21FdmVudERhdGE6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnT3B0aW9uYWwgc3RyaW5nIHBhc3NlZCBiYWNrIHdoZW4gdGhlIGV2ZW50IGZpcmVzJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYXN5bmMgYSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlc3AgPSBhd2FpdCBydW5TY2VuZU1ldGhvZEFzVG9vbFJlc3BvbnNlKCdhZGRFdmVudEhhbmRsZXInLCBbXG4gICAgICAgICAgICAgICAgICAgICAgICBhLm5vZGVVdWlkLCBhLmNvbXBvbmVudFR5cGUsIGEuZXZlbnRBcnJheVByb3BlcnR5LFxuICAgICAgICAgICAgICAgICAgICAgICAgYS50YXJnZXROb2RlVXVpZCwgYS5jb21wb25lbnROYW1lLCBhLmhhbmRsZXIsIGEuY3VzdG9tRXZlbnREYXRhLFxuICAgICAgICAgICAgICAgICAgICBdKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3Auc3VjY2Vzcykge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgbnVkZ2VFZGl0b3JNb2RlbChhLm5vZGVVdWlkLCBhLmNvbXBvbmVudFR5cGUsIHJlc3AuZGF0YT8uY29tcG9uZW50VXVpZCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlc3A7XG4gICAgICAgICAgICAgICAgfSB9LFxuICAgICAgICAgICAgeyBuYW1lOiAncmVtb3ZlX2V2ZW50X2hhbmRsZXInLCB0aXRsZTogJ1JlbW92ZSBldmVudCBoYW5kbGVyJywgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gUmVtb3ZlIEV2ZW50SGFuZGxlciBlbnRyaWVzIGZyb20gYSBjb21wb25lbnQgZXZlbnQgYXJyYXkuIE51ZGdlcyB0aGUgZWRpdG9yIG1vZGVsIGZvciBwZXJzaXN0ZW5jZS4gTXV0YXRlcyBzY2VuZTsgbWF0Y2ggYnkgaW5kZXggb3IgdGFyZ2V0Tm9kZVV1aWQraGFuZGxlci4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIG5vZGVVdWlkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdOb2RlIFVVSUQgb3duaW5nIHRoZSBjb21wb25lbnQnKSxcbiAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50VHlwZTogei5zdHJpbmcoKS5kZWZhdWx0KCdjYy5CdXR0b24nKS5kZXNjcmliZSgnQ29tcG9uZW50IGNsYXNzIG5hbWUnKSxcbiAgICAgICAgICAgICAgICAgICAgZXZlbnRBcnJheVByb3BlcnR5OiB6LnN0cmluZygpLmRlZmF1bHQoJ2NsaWNrRXZlbnRzJykuZGVzY3JpYmUoJ0V2ZW50SGFuZGxlciBhcnJheSBwcm9wZXJ0eSBuYW1lJyksXG4gICAgICAgICAgICAgICAgICAgIGluZGV4OiB6Lm51bWJlcigpLmludCgpLm1pbigwKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdaZXJvLWJhc2VkIGluZGV4IHRvIHJlbW92ZS4gVGFrZXMgcHJlY2VkZW5jZSBvdmVyIHRhcmdldE5vZGVVdWlkL2hhbmRsZXIgbWF0Y2hpbmcgd2hlbiBwcm92aWRlZC4nKSxcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0Tm9kZVV1aWQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnTWF0Y2ggaGFuZGxlcnMgd2hvc2UgdGFyZ2V0IG5vZGUgaGFzIHRoaXMgVVVJRCcpLFxuICAgICAgICAgICAgICAgICAgICBoYW5kbGVyOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ01hdGNoIGhhbmRsZXJzIHdpdGggdGhpcyBtZXRob2QgbmFtZScpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGFzeW5jIGEgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCByZXNwID0gYXdhaXQgcnVuU2NlbmVNZXRob2RBc1Rvb2xSZXNwb25zZSgncmVtb3ZlRXZlbnRIYW5kbGVyJywgW1xuICAgICAgICAgICAgICAgICAgICAgICAgYS5ub2RlVXVpZCwgYS5jb21wb25lbnRUeXBlLCBhLmV2ZW50QXJyYXlQcm9wZXJ0eSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGEuaW5kZXggPz8gbnVsbCwgYS50YXJnZXROb2RlVXVpZCA/PyBudWxsLCBhLmhhbmRsZXIgPz8gbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgXSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChyZXNwLnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IG51ZGdlRWRpdG9yTW9kZWwoYS5ub2RlVXVpZCwgYS5jb21wb25lbnRUeXBlLCByZXNwLmRhdGE/LmNvbXBvbmVudFV1aWQpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiByZXNwO1xuICAgICAgICAgICAgICAgIH0gfSxcbiAgICAgICAgICAgIHsgbmFtZTogJ2xpc3RfZXZlbnRfaGFuZGxlcnMnLCB0aXRsZTogJ0xpc3QgZXZlbnQgaGFuZGxlcnMnLCBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBMaXN0IEV2ZW50SGFuZGxlciBlbnRyaWVzIG9uIGEgY29tcG9uZW50IGV2ZW50IGFycmF5LiBObyBtdXRhdGlvbjsgdXNlIGJlZm9yZSByZW1vdmVfZXZlbnRfaGFuZGxlci4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIG5vZGVVdWlkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdOb2RlIFVVSUQgb3duaW5nIHRoZSBjb21wb25lbnQnKSxcbiAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50VHlwZTogei5zdHJpbmcoKS5kZWZhdWx0KCdjYy5CdXR0b24nKS5kZXNjcmliZSgnQ29tcG9uZW50IGNsYXNzIG5hbWUnKSxcbiAgICAgICAgICAgICAgICAgICAgZXZlbnRBcnJheVByb3BlcnR5OiB6LnN0cmluZygpLmRlZmF1bHQoJ2NsaWNrRXZlbnRzJykuZGVzY3JpYmUoJ0V2ZW50SGFuZGxlciBhcnJheSBwcm9wZXJ0eSBuYW1lJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiBydW5TY2VuZU1ldGhvZEFzVG9vbFJlc3BvbnNlKCdsaXN0RXZlbnRIYW5kbGVycycsIFtcbiAgICAgICAgICAgICAgICAgICAgYS5ub2RlVXVpZCwgYS5jb21wb25lbnRUeXBlLCBhLmV2ZW50QXJyYXlQcm9wZXJ0eSxcbiAgICAgICAgICAgICAgICBdKSB9LFxuICAgICAgICAgICAgeyBuYW1lOiAnc2V0X2NvbXBvbmVudF9wcm9wZXJ0aWVzJywgdGl0bGU6ICdTZXQgY29tcG9uZW50IHByb3BlcnRpZXMnLCBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBCYXRjaC1zZXQgbXVsdGlwbGUgcHJvcGVydGllcyBvbiB0aGUgc2FtZSBjb21wb25lbnQgaW4gb25lIHRvb2wgY2FsbC4gTXV0YXRlcyBzY2VuZTsgZWFjaCBwcm9wZXJ0eSBpcyB3cml0dGVuIHNlcXVlbnRpYWxseSB0aHJvdWdoIHNldF9jb21wb25lbnRfcHJvcGVydHkgdG8gc2hhcmUgbm9kZVV1aWQrY29tcG9uZW50VHlwZSByZXNvbHV0aW9uLiBSZXR1cm5zIHBlci1lbnRyeSBzdWNjZXNzL2Vycm9yIHNvIHBhcnRpYWwgZmFpbHVyZXMgYXJlIHZpc2libGUuIFVzZSB3aGVuIEFJIG5lZWRzIHRvIHNldCAzKyBwcm9wZXJ0aWVzIG9uIGEgc2luZ2xlIGNvbXBvbmVudCBhdCBvbmNlLiBBY2NlcHRzIHJlZmVyZW5jZT17aWQsdHlwZX0gKHByZWZlcnJlZCksIG5vZGVVdWlkLCBvciBub2RlTmFtZS4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHJlZmVyZW5jZTogaW5zdGFuY2VSZWZlcmVuY2VTY2hlbWEub3B0aW9uYWwoKS5kZXNjcmliZSgnSW5zdGFuY2VSZWZlcmVuY2Uge2lkLHR5cGV9IGZvciB0aGUgaG9zdCBub2RlLiBQcmVmZXJyZWQgZm9ybS4nKSxcbiAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnVGFyZ2V0IG5vZGUgVVVJRC4gVXNlZCB3aGVuIHJlZmVyZW5jZSBpcyBvbWl0dGVkLicpLFxuICAgICAgICAgICAgICAgICAgICBub2RlTmFtZTogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdUYXJnZXQgbm9kZSBuYW1lIChkZXB0aC1maXJzdCBmaXJzdCBtYXRjaCkuIFVzZWQgd2hlbiByZWZlcmVuY2UgYW5kIG5vZGVVdWlkIGFyZSBvbWl0dGVkLicpLFxuICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRUeXBlOiB6LnN0cmluZygpLmRlc2NyaWJlKCdDb21wb25lbnQgdHlwZS9jaWQgc2hhcmVkIGJ5IGFsbCBlbnRyaWVzLicpLFxuICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0aWVzOiB6LmFycmF5KHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHByb3BlcnR5OiB6LnN0cmluZygpLmRlc2NyaWJlKCdQcm9wZXJ0eSBuYW1lIG9uIHRoZSBjb21wb25lbnQsIGUuZy4gZm9udFNpemUsIGNvbG9yLCBzaXplTW9kZS4nKSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHByb3BlcnR5VHlwZTogei5lbnVtKFtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAnc3RyaW5nJywgJ251bWJlcicsICdib29sZWFuJywgJ2ludGVnZXInLCAnZmxvYXQnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICdjb2xvcicsICd2ZWMyJywgJ3ZlYzMnLCAnc2l6ZScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgJ25vZGUnLCAnY29tcG9uZW50JywgJ3Nwcml0ZUZyYW1lJywgJ3ByZWZhYicsICdhc3NldCcsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgJ25vZGVBcnJheScsICdjb2xvckFycmF5JywgJ251bWJlckFycmF5JywgJ3N0cmluZ0FycmF5JyxcbiAgICAgICAgICAgICAgICAgICAgICAgIF0pLmRlc2NyaWJlKCdQcm9wZXJ0eSBkYXRhIHR5cGUgZm9yIHZhbHVlIGNvbnZlcnNpb24uJyksXG4gICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZTogei5hbnkoKS5kZXNjcmliZSgnUHJvcGVydHkgdmFsdWUgbWF0Y2hpbmcgcHJvcGVydHlUeXBlLicpLFxuICAgICAgICAgICAgICAgICAgICAgICAgcHJlc2VydmVDb250ZW50U2l6ZTogei5ib29sZWFuKCkuZGVmYXVsdChmYWxzZSkuZGVzY3JpYmUoJ1NlZSBzZXRfY29tcG9uZW50X3Byb3BlcnR5OyBvbmx5IGhvbm91cmVkIHdoZW4gY29tcG9uZW50VHlwZT1cImNjLlNwcml0ZVwiIGFuZCBwcm9wZXJ0eT1cInNwcml0ZUZyYW1lXCIuJyksXG4gICAgICAgICAgICAgICAgICAgIH0pKS5taW4oMSkubWF4KDIwKS5kZXNjcmliZSgnUHJvcGVydHkgZW50cmllcy4gQ2FwcGVkIGF0IDIwIHBlciBjYWxsLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGFzeW5jIGEgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCByID0gYXdhaXQgcmVzb2x2ZVJlZmVyZW5jZSh7IHJlZmVyZW5jZTogYS5yZWZlcmVuY2UsIG5vZGVVdWlkOiBhLm5vZGVVdWlkLCBub2RlTmFtZTogYS5ub2RlTmFtZSB9KTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCdyZXNwb25zZScgaW4gcikgcmV0dXJuIHIucmVzcG9uc2U7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdHM6IEFycmF5PHsgcHJvcGVydHk6IHN0cmluZzsgc3VjY2VzczogYm9vbGVhbjsgZXJyb3I/OiBzdHJpbmcgfT4gPSBbXTtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBlbnRyeSBvZiBhLnByb3BlcnRpZXMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlc3AgPSBhd2FpdCB0aGlzLnNldENvbXBvbmVudFByb3BlcnR5KHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBub2RlVXVpZDogci51dWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudFR5cGU6IGEuY29tcG9uZW50VHlwZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0eTogZW50cnkucHJvcGVydHksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvcGVydHlUeXBlOiBlbnRyeS5wcm9wZXJ0eVR5cGUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWU6IGVudHJ5LnZhbHVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByZXNlcnZlQ29udGVudFNpemU6IGVudHJ5LnByZXNlcnZlQ29udGVudFNpemUgPz8gZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdHMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvcGVydHk6IGVudHJ5LnByb3BlcnR5LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6ICEhcmVzcC5zdWNjZXNzLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yOiByZXNwLnN1Y2Nlc3MgPyB1bmRlZmluZWQgOiAocmVzcC5lcnJvciA/PyByZXNwLm1lc3NhZ2UgPz8gJ3Vua25vd24nKSxcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGZhaWxlZCA9IHJlc3VsdHMuZmlsdGVyKHggPT4gIXguc3VjY2Vzcyk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWlsZWQubGVuZ3RoID09PSAwLFxuICAgICAgICAgICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5vZGVVdWlkOiByLnV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50VHlwZTogYS5jb21wb25lbnRUeXBlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRvdGFsOiByZXN1bHRzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmYWlsZWRDb3VudDogZmFpbGVkLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXN1bHRzLFxuICAgICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGZhaWxlZC5sZW5ndGggPT09IDBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA/IGBXcm90ZSAke3Jlc3VsdHMubGVuZ3RofSBjb21wb25lbnQgcHJvcGVydGllc2BcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA6IGAke2ZhaWxlZC5sZW5ndGh9LyR7cmVzdWx0cy5sZW5ndGh9IGNvbXBvbmVudCBwcm9wZXJ0eSB3cml0ZXMgZmFpbGVkYCxcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICB9IH0sXG4gICAgICAgIF07XG4gICAgICAgIHRoaXMuZXhlYyA9IGRlZmluZVRvb2xzKGRlZnMpO1xuICAgIH1cblxuICAgIGdldFRvb2xzKCk6IFRvb2xEZWZpbml0aW9uW10geyByZXR1cm4gdGhpcy5leGVjLmdldFRvb2xzKCk7IH1cbiAgICBleGVjdXRlKHRvb2xOYW1lOiBzdHJpbmcsIGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7IHJldHVybiB0aGlzLmV4ZWMuZXhlY3V0ZSh0b29sTmFtZSwgYXJncyk7IH1cblxuICAgIHByaXZhdGUgYXN5bmMgYWRkQ29tcG9uZW50KG5vZGVVdWlkOiBzdHJpbmcsIGNvbXBvbmVudFR5cGU6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZShhc3luYyAocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgLy8gU25hcHNob3QgZXhpc3RpbmcgY29tcG9uZW50cyBzbyB3ZSBjYW4gZGV0ZWN0IHBvc3QtYWRkIGFkZGl0aW9uc1xuICAgICAgICAgICAgLy8gZXZlbiB3aGVuIENvY29zIHJlcG9ydHMgdGhlbSB1bmRlciBhIGNpZCAoY3VzdG9tIHNjcmlwdHMpIHJhdGhlclxuICAgICAgICAgICAgLy8gdGhhbiB0aGUgY2xhc3MgbmFtZSB0aGUgY2FsbGVyIHN1cHBsaWVkLlxuICAgICAgICAgICAgY29uc3QgYmVmb3JlSW5mbyA9IGF3YWl0IHRoaXMuZ2V0Q29tcG9uZW50cyhub2RlVXVpZCk7XG4gICAgICAgICAgICBjb25zdCBiZWZvcmVMaXN0OiBhbnlbXSA9IGJlZm9yZUluZm8uc3VjY2VzcyAmJiBiZWZvcmVJbmZvLmRhdGE/LmNvbXBvbmVudHMgPyBiZWZvcmVJbmZvLmRhdGEuY29tcG9uZW50cyA6IFtdO1xuICAgICAgICAgICAgY29uc3QgYmVmb3JlVHlwZXMgPSBuZXcgU2V0KGJlZm9yZUxpc3QubWFwKChjOiBhbnkpID0+IGMudHlwZSkpO1xuXG4gICAgICAgICAgICBjb25zdCBleGlzdGluZ0NvbXBvbmVudCA9IGJlZm9yZUxpc3QuZmluZCgoY29tcDogYW55KSA9PiBjb21wLnR5cGUgPT09IGNvbXBvbmVudFR5cGUpO1xuICAgICAgICAgICAgaWYgKGV4aXN0aW5nQ29tcG9uZW50KSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICBub2RlVXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudFR5cGUsXG4gICAgICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRWZXJpZmllZDogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGV4aXN0aW5nOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICB9LCBgQ29tcG9uZW50ICcke2NvbXBvbmVudFR5cGV9JyBhbHJlYWR5IGV4aXN0cyBvbiBub2RlYCkpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8g5ZiX6Kmm55u05o6l5L2/55SoIEVkaXRvciBBUEkg5re75Yqg57WE5Lu2XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdjcmVhdGUtY29tcG9uZW50Jywge1xuICAgICAgICAgICAgICAgIHV1aWQ6IG5vZGVVdWlkLFxuICAgICAgICAgICAgICAgIGNvbXBvbmVudDogY29tcG9uZW50VHlwZSxcbiAgICAgICAgICAgIH0pLnRoZW4oYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgICAgIC8vIOetieW+heS4gOauteaZgumWk+iuk0VkaXRvcuWujOaIkOe1hOS7tua3u+WKoFxuICAgICAgICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAxMDApKTtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBhZnRlckluZm8gPSBhd2FpdCB0aGlzLmdldENvbXBvbmVudHMobm9kZVV1aWQpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIWFmdGVySW5mby5zdWNjZXNzIHx8ICFhZnRlckluZm8uZGF0YT8uY29tcG9uZW50cykge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGBGYWlsZWQgdG8gdmVyaWZ5IGNvbXBvbmVudCBhZGRpdGlvbjogJHthZnRlckluZm8uZXJyb3IgfHwgJ1VuYWJsZSB0byBnZXQgbm9kZSBjb21wb25lbnRzJ31gKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYWZ0ZXJMaXN0OiBhbnlbXSA9IGFmdGVySW5mby5kYXRhLmNvbXBvbmVudHM7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gU3RyaWN0IG1hdGNoOiBidWlsdC1pbiBjb21wb25lbnRzIGxpa2UgY2MuU3ByaXRlIHNob3cgdGhlaXJcbiAgICAgICAgICAgICAgICAgICAgLy8gY2xhc3MgbmFtZSBpbiBgdHlwZWAuIEhpdHMgdGhlIHNhbWUgc2hhcGUgdGhlIGNhbGxlciBwYXNzZWQuXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGFkZGVkQ29tcG9uZW50ID0gYWZ0ZXJMaXN0LmZpbmQoKGNvbXA6IGFueSkgPT4gY29tcC50eXBlID09PSBjb21wb25lbnRUeXBlKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGFkZGVkQ29tcG9uZW50KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudFR5cGUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudFZlcmlmaWVkOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBleGlzdGluZzogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSwgYENvbXBvbmVudCAnJHtjb21wb25lbnRUeXBlfScgYWRkZWQgc3VjY2Vzc2Z1bGx5YCkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gTGVuaWVudCBmYWxsYmFjazogY3VzdG9tIHNjcmlwdHMgc3VyZmFjZSBhcyBhIGNpZCAoZS5nLlxuICAgICAgICAgICAgICAgICAgICAvLyBcIjliNGE3dWVUOXhENmFSRStBbE91c3kxXCIpIGluIF9fY29tcHNfXy50eXBlLCBub3QgYXMgdGhlXG4gICAgICAgICAgICAgICAgICAgIC8vIGNsYXNzIG5hbWUuIElmIHRoZSBjb21wb25lbnQgY291bnQgZ3JldywgYWNjZXB0IHRoZSBuZXdcbiAgICAgICAgICAgICAgICAgICAgLy8gZW50cnkgYXMgdGhlIG9uZSB3ZSBqdXN0IGFkZGVkLlxuICAgICAgICAgICAgICAgICAgICBjb25zdCBuZXdFbnRyaWVzID0gYWZ0ZXJMaXN0LmZpbHRlcigoY29tcDogYW55KSA9PiAhYmVmb3JlVHlwZXMuaGFzKGNvbXAudHlwZSkpO1xuICAgICAgICAgICAgICAgICAgICBpZiAobmV3RW50cmllcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCByZWdpc3RlcmVkQXMgPSBuZXdFbnRyaWVzWzBdLnR5cGU7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudFR5cGUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlZ2lzdGVyZWRBcyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50VmVyaWZpZWQ6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4aXN0aW5nOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9LCBgQ29tcG9uZW50ICcke2NvbXBvbmVudFR5cGV9JyBhZGRlZCBzdWNjZXNzZnVsbHkgKHJlZ2lzdGVyZWQgYXMgY2lkICcke3JlZ2lzdGVyZWRBc30nOyB0aGlzIGlzIG5vcm1hbCBmb3IgY3VzdG9tIHNjcmlwdHMpLmApKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChgQ29tcG9uZW50ICcke2NvbXBvbmVudFR5cGV9JyB3YXMgbm90IGZvdW5kIG9uIG5vZGUgYWZ0ZXIgYWRkaXRpb24uIEF2YWlsYWJsZSBjb21wb25lbnRzOiAke2FmdGVyTGlzdC5tYXAoKGM6IGFueSkgPT4gYy50eXBlKS5qb2luKCcsICcpfWApKTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoICh2ZXJpZnlFcnJvcjogYW55KSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChgRmFpbGVkIHRvIHZlcmlmeSBjb21wb25lbnQgYWRkaXRpb246ICR7dmVyaWZ5RXJyb3IubWVzc2FnZX1gKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICAvLyDlgpnnlKjmlrnmoYjvvJrkvb/nlKjloLTmma/ohbPmnKxcbiAgICAgICAgICAgICAgICBydW5TY2VuZU1ldGhvZCgnYWRkQ29tcG9uZW50VG9Ob2RlJywgW25vZGVVdWlkLCBjb21wb25lbnRUeXBlXSkudGhlbigocmVzdWx0OiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgICAgICAgIH0pLmNhdGNoKChlcnIyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoYERpcmVjdCBBUEkgZmFpbGVkOiAke2Vyci5tZXNzYWdlfSwgU2NlbmUgc2NyaXB0IGZhaWxlZDogJHtlcnIyLm1lc3NhZ2V9YCkpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgcmVtb3ZlQ29tcG9uZW50KG5vZGVVdWlkOiBzdHJpbmcsIGNvbXBvbmVudFR5cGU6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZShhc3luYyAocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgLy8gMS4g5p+l5om+56+A6bue5LiK55qE5omA5pyJ57WE5Lu2XG4gICAgICAgICAgICBjb25zdCBhbGxDb21wb25lbnRzSW5mbyA9IGF3YWl0IHRoaXMuZ2V0Q29tcG9uZW50cyhub2RlVXVpZCk7XG4gICAgICAgICAgICBpZiAoIWFsbENvbXBvbmVudHNJbmZvLnN1Y2Nlc3MgfHwgIWFsbENvbXBvbmVudHNJbmZvLmRhdGE/LmNvbXBvbmVudHMpIHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoYEZhaWxlZCB0byBnZXQgY29tcG9uZW50cyBmb3Igbm9kZSAnJHtub2RlVXVpZH0nOiAke2FsbENvbXBvbmVudHNJbmZvLmVycm9yfWApKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyAyLiDlj6rmn6Xmib50eXBl5a2X5q61562J5pa8Y29tcG9uZW50VHlwZeeahOe1hOS7tu+8iOWNs2NpZO+8iVxuICAgICAgICAgICAgY29uc3QgZXhpc3RzID0gYWxsQ29tcG9uZW50c0luZm8uZGF0YS5jb21wb25lbnRzLnNvbWUoKGNvbXA6IGFueSkgPT4gY29tcC50eXBlID09PSBjb21wb25lbnRUeXBlKTtcbiAgICAgICAgICAgIGlmICghZXhpc3RzKSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGBDb21wb25lbnQgY2lkICcke2NvbXBvbmVudFR5cGV9JyBub3QgZm91bmQgb24gbm9kZSAnJHtub2RlVXVpZH0nLiDoq4vnlKhnZXRDb21wb25lbnRz542y5Y+WdHlwZeWtl+aute+8iGNpZO+8ieS9nOeCumNvbXBvbmVudFR5cGXjgIJgKSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gMy4g5a6Y5pa5QVBJ55u05o6l56e76ZmkXG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3JlbW92ZS1jb21wb25lbnQnLCB7XG4gICAgICAgICAgICAgICAgICAgIHV1aWQ6IG5vZGVVdWlkLFxuICAgICAgICAgICAgICAgICAgICBjb21wb25lbnQ6IGNvbXBvbmVudFR5cGVcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAvLyA0LiDlho3mn6XkuIDmrKHnorroqo3mmK/lkKbnp7vpmaRcbiAgICAgICAgICAgICAgICBjb25zdCBhZnRlclJlbW92ZUluZm8gPSBhd2FpdCB0aGlzLmdldENvbXBvbmVudHMobm9kZVV1aWQpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHN0aWxsRXhpc3RzID0gYWZ0ZXJSZW1vdmVJbmZvLnN1Y2Nlc3MgJiYgYWZ0ZXJSZW1vdmVJbmZvLmRhdGE/LmNvbXBvbmVudHM/LnNvbWUoKGNvbXA6IGFueSkgPT4gY29tcC50eXBlID09PSBjb21wb25lbnRUeXBlKTtcbiAgICAgICAgICAgICAgICBpZiAoc3RpbGxFeGlzdHMpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGBDb21wb25lbnQgY2lkICcke2NvbXBvbmVudFR5cGV9JyB3YXMgbm90IHJlbW92ZWQgZnJvbSBub2RlICcke25vZGVVdWlkfScuYCkpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUob2soeyBub2RlVXVpZCwgY29tcG9uZW50VHlwZSB9LCBgQ29tcG9uZW50IGNpZCAnJHtjb21wb25lbnRUeXBlfScgcmVtb3ZlZCBzdWNjZXNzZnVsbHkgZnJvbSBub2RlICcke25vZGVVdWlkfSdgKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoYEZhaWxlZCB0byByZW1vdmUgY29tcG9uZW50OiAke2Vyci5tZXNzYWdlfWApKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRDb21wb25lbnRzKG5vZGVVdWlkOiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIC8vIOWEquWFiOWakOippuebtOaOpeS9v+eUqCBFZGl0b3IgQVBJIOafpeipouevgOm7nuS/oeaBr1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktbm9kZScsIG5vZGVVdWlkKS50aGVuKChub2RlRGF0YTogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKG5vZGVEYXRhICYmIG5vZGVEYXRhLl9fY29tcHNfXykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjb21wb25lbnRzID0gbm9kZURhdGEuX19jb21wc19fLm1hcCgoY29tcDogYW55KSA9PiAoe1xuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogY29tcC5fX3R5cGVfXyB8fCBjb21wLmNpZCB8fCBjb21wLnR5cGUgfHwgJ1Vua25vd24nLFxuICAgICAgICAgICAgICAgICAgICAgICAgdXVpZDogY29tcC51dWlkPy52YWx1ZSB8fCBjb21wLnV1aWQgfHwgbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGVuYWJsZWQ6IGNvbXAuZW5hYmxlZCAhPT0gdW5kZWZpbmVkID8gY29tcC5lbmFibGVkIDogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHByb3BlcnRpZXM6IHRoaXMuZXh0cmFjdENvbXBvbmVudFByb3BlcnRpZXMoY29tcClcbiAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWQ6IG5vZGVVdWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudHM6IGNvbXBvbmVudHNcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoJ05vZGUgbm90IGZvdW5kIG9yIG5vIGNvbXBvbmVudHMgZGF0YScpKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIC8vIOWCmeeUqOaWueahiO+8muS9v+eUqOWgtOaZr+iFs+acrFxuICAgICAgICAgICAgICAgIHJ1blNjZW5lTWV0aG9kKCdnZXROb2RlSW5mbycsIFtub2RlVXVpZF0pLnRoZW4oKHJlc3VsdDogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShvayhyZXN1bHQuZGF0YS5jb21wb25lbnRzKSk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KS5jYXRjaCgoZXJyMjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGBEaXJlY3QgQVBJIGZhaWxlZDogJHtlcnIubWVzc2FnZX0sIFNjZW5lIHNjcmlwdCBmYWlsZWQ6ICR7ZXJyMi5tZXNzYWdlfWApKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldENvbXBvbmVudEluZm8obm9kZVV1aWQ6IHN0cmluZywgY29tcG9uZW50VHlwZTogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICAvLyDlhKrlhYjlmpDoqabnm7TmjqXkvb/nlKggRWRpdG9yIEFQSSDmn6XoqaLnr4Dpu57kv6Hmga9cbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LW5vZGUnLCBub2RlVXVpZCkudGhlbigobm9kZURhdGE6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChub2RlRGF0YSAmJiBub2RlRGF0YS5fX2NvbXBzX18pIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY29tcG9uZW50ID0gbm9kZURhdGEuX19jb21wc19fLmZpbmQoKGNvbXA6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY29tcFR5cGUgPSBjb21wLl9fdHlwZV9fIHx8IGNvbXAuY2lkIHx8IGNvbXAudHlwZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBjb21wVHlwZSA9PT0gY29tcG9uZW50VHlwZTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICBpZiAoY29tcG9uZW50KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWQ6IG5vZGVVdWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRUeXBlOiBjb21wb25lbnRUeXBlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbmFibGVkOiBjb21wb25lbnQuZW5hYmxlZCAhPT0gdW5kZWZpbmVkID8gY29tcG9uZW50LmVuYWJsZWQgOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0aWVzOiB0aGlzLmV4dHJhY3RDb21wb25lbnRQcm9wZXJ0aWVzKGNvbXBvbmVudClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoYENvbXBvbmVudCAnJHtjb21wb25lbnRUeXBlfScgbm90IGZvdW5kIG9uIG5vZGVgKSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoJ05vZGUgbm90IGZvdW5kIG9yIG5vIGNvbXBvbmVudHMgZGF0YScpKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIC8vIOWCmeeUqOaWueahiO+8muS9v+eUqOWgtOaZr+iFs+acrFxuICAgICAgICAgICAgICAgIHJ1blNjZW5lTWV0aG9kKCdnZXROb2RlSW5mbycsIFtub2RlVXVpZF0pLnRoZW4oKHJlc3VsdDogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChyZXN1bHQuc3VjY2VzcyAmJiByZXN1bHQuZGF0YS5jb21wb25lbnRzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjb21wb25lbnQgPSByZXN1bHQuZGF0YS5jb21wb25lbnRzLmZpbmQoKGNvbXA6IGFueSkgPT4gY29tcC50eXBlID09PSBjb21wb25lbnRUeXBlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjb21wb25lbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5vZGVVdWlkOiBub2RlVXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudFR5cGU6IGNvbXBvbmVudFR5cGUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAuLi5jb21wb25lbnRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoYENvbXBvbmVudCAnJHtjb21wb25lbnRUeXBlfScgbm90IGZvdW5kIG9uIG5vZGVgKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwocmVzdWx0LmVycm9yIHx8ICdGYWlsZWQgdG8gZ2V0IGNvbXBvbmVudCBpbmZvJykpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSkuY2F0Y2goKGVycjI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChgRGlyZWN0IEFQSSBmYWlsZWQ6ICR7ZXJyLm1lc3NhZ2V9LCBTY2VuZSBzY3JpcHQgZmFpbGVkOiAke2VycjIubWVzc2FnZX1gKSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBleHRyYWN0Q29tcG9uZW50UHJvcGVydGllcyhjb21wb25lbnQ6IGFueSk6IFJlY29yZDxzdHJpbmcsIGFueT4ge1xuICAgICAgICBkZWJ1Z0xvZyhgW2V4dHJhY3RDb21wb25lbnRQcm9wZXJ0aWVzXSBQcm9jZXNzaW5nIGNvbXBvbmVudDpgLCBPYmplY3Qua2V5cyhjb21wb25lbnQpKTtcbiAgICAgICAgXG4gICAgICAgIC8vIOaqouafpee1hOS7tuaYr+WQpuaciSB2YWx1ZSDlsazmgKfvvIzpgJnpgJrluLjljIXlkKvlr6bpmpvnmoTntYTku7blsazmgKdcbiAgICAgICAgaWYgKGNvbXBvbmVudC52YWx1ZSAmJiB0eXBlb2YgY29tcG9uZW50LnZhbHVlID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgZGVidWdMb2coYFtleHRyYWN0Q29tcG9uZW50UHJvcGVydGllc10gRm91bmQgY29tcG9uZW50LnZhbHVlIHdpdGggcHJvcGVydGllczpgLCBPYmplY3Qua2V5cyhjb21wb25lbnQudmFsdWUpKTtcbiAgICAgICAgICAgIHJldHVybiBjb21wb25lbnQudmFsdWU7IC8vIOebtOaOpei/lOWbniB2YWx1ZSDlsI3osaHvvIzlroPljIXlkKvmiYDmnInntYTku7blsazmgKdcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgLy8g5YKZ55So5pa55qGI77ya5b6e57WE5Lu25bCN6LGh5Lit55u05o6l5o+Q5Y+W5bGs5oCnXG4gICAgICAgIGNvbnN0IHByb3BlcnRpZXM6IFJlY29yZDxzdHJpbmcsIGFueT4gPSB7fTtcbiAgICAgICAgY29uc3QgZXhjbHVkZUtleXMgPSBbJ19fdHlwZV9fJywgJ2VuYWJsZWQnLCAnbm9kZScsICdfaWQnLCAnX19zY3JpcHRBc3NldCcsICd1dWlkJywgJ25hbWUnLCAnX25hbWUnLCAnX29iakZsYWdzJywgJ19lbmFibGVkJywgJ3R5cGUnLCAncmVhZG9ubHknLCAndmlzaWJsZScsICdjaWQnLCAnZWRpdG9yJywgJ2V4dGVuZHMnXTtcbiAgICAgICAgXG4gICAgICAgIGZvciAoY29uc3Qga2V5IGluIGNvbXBvbmVudCkge1xuICAgICAgICAgICAgaWYgKCFleGNsdWRlS2V5cy5pbmNsdWRlcyhrZXkpICYmICFrZXkuc3RhcnRzV2l0aCgnXycpKSB7XG4gICAgICAgICAgICAgICAgZGVidWdMb2coYFtleHRyYWN0Q29tcG9uZW50UHJvcGVydGllc10gRm91bmQgZGlyZWN0IHByb3BlcnR5ICcke2tleX0nOmAsIHR5cGVvZiBjb21wb25lbnRba2V5XSk7XG4gICAgICAgICAgICAgICAgcHJvcGVydGllc1trZXldID0gY29tcG9uZW50W2tleV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGRlYnVnTG9nKGBbZXh0cmFjdENvbXBvbmVudFByb3BlcnRpZXNdIEZpbmFsIGV4dHJhY3RlZCBwcm9wZXJ0aWVzOmAsIE9iamVjdC5rZXlzKHByb3BlcnRpZXMpKTtcbiAgICAgICAgcmV0dXJuIHByb3BlcnRpZXM7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBmaW5kQ29tcG9uZW50VHlwZUJ5VXVpZChjb21wb25lbnRVdWlkOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZyB8IG51bGw+IHtcbiAgICAgICAgZGVidWdMb2coYFtmaW5kQ29tcG9uZW50VHlwZUJ5VXVpZF0gU2VhcmNoaW5nIGZvciBjb21wb25lbnQgdHlwZSB3aXRoIFVVSUQ6ICR7Y29tcG9uZW50VXVpZH1gKTtcbiAgICAgICAgaWYgKCFjb21wb25lbnRVdWlkKSB7XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3Qgbm9kZVRyZWUgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1ub2RlLXRyZWUnKTtcbiAgICAgICAgICAgIGlmICghbm9kZVRyZWUpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oJ1tmaW5kQ29tcG9uZW50VHlwZUJ5VXVpZF0gRmFpbGVkIHRvIHF1ZXJ5IG5vZGUgdHJlZS4nKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgcXVldWU6IGFueVtdID0gW25vZGVUcmVlXTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgd2hpbGUgKHF1ZXVlLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICBjb25zdCBjdXJyZW50Tm9kZUluZm8gPSBxdWV1ZS5zaGlmdCgpO1xuICAgICAgICAgICAgICAgIGlmICghY3VycmVudE5vZGVJbmZvIHx8ICFjdXJyZW50Tm9kZUluZm8udXVpZCkge1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBmdWxsTm9kZURhdGEgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1ub2RlJywgY3VycmVudE5vZGVJbmZvLnV1aWQpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoZnVsbE5vZGVEYXRhICYmIGZ1bGxOb2RlRGF0YS5fX2NvbXBzX18pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAoY29uc3QgY29tcCBvZiBmdWxsTm9kZURhdGEuX19jb21wc19fKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY29tcEFueSA9IGNvbXAgYXMgYW55OyAvLyBDYXN0IHRvIGFueSB0byBhY2Nlc3MgZHluYW1pYyBwcm9wZXJ0aWVzXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gVGhlIGNvbXBvbmVudCBVVUlEIGlzIG5lc3RlZCBpbiB0aGUgJ3ZhbHVlJyBwcm9wZXJ0eVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjb21wQW55LnV1aWQgJiYgY29tcEFueS51dWlkLnZhbHVlID09PSBjb21wb25lbnRVdWlkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbXBvbmVudFR5cGUgPSBjb21wQW55Ll9fdHlwZV9fO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgW2ZpbmRDb21wb25lbnRUeXBlQnlVdWlkXSBGb3VuZCBjb21wb25lbnQgdHlwZSAnJHtjb21wb25lbnRUeXBlfScgZm9yIFVVSUQgJHtjb21wb25lbnRVdWlkfSBvbiBub2RlICR7ZnVsbE5vZGVEYXRhLm5hbWU/LnZhbHVlfWApO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gY29tcG9uZW50VHlwZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybihgW2ZpbmRDb21wb25lbnRUeXBlQnlVdWlkXSBDb3VsZCBub3QgcXVlcnkgbm9kZSAke2N1cnJlbnROb2RlSW5mby51dWlkfTpgLCBlKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoY3VycmVudE5vZGVJbmZvLmNoaWxkcmVuKSB7XG4gICAgICAgICAgICAgICAgICAgIGZvciAoY29uc3QgY2hpbGQgb2YgY3VycmVudE5vZGVJbmZvLmNoaWxkcmVuKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBxdWV1ZS5wdXNoKGNoaWxkKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc29sZS53YXJuKGBbZmluZENvbXBvbmVudFR5cGVCeVV1aWRdIENvbXBvbmVudCB3aXRoIFVVSUQgJHtjb21wb25lbnRVdWlkfSBub3QgZm91bmQgaW4gc2NlbmUgdHJlZS5gKTtcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihgW2ZpbmRDb21wb25lbnRUeXBlQnlVdWlkXSBFcnJvciB3aGlsZSBzZWFyY2hpbmcgZm9yIGNvbXBvbmVudCB0eXBlOmAsIGVycm9yKTtcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBzZXRDb21wb25lbnRQcm9wZXJ0eShhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgeyBub2RlVXVpZCwgY29tcG9uZW50VHlwZSwgcHJvcGVydHksIHByb3BlcnR5VHlwZSwgdmFsdWUgfSA9IGFyZ3M7XG4gICAgICAgIFxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoYXN5bmMgKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgZGVidWdMb2coYFtDb21wb25lbnRUb29sc10gU2V0dGluZyAke2NvbXBvbmVudFR5cGV9LiR7cHJvcGVydHl9ICh0eXBlOiAke3Byb3BlcnR5VHlwZX0pID0gJHtKU09OLnN0cmluZ2lmeSh2YWx1ZSl9IG9uIG5vZGUgJHtub2RlVXVpZH1gKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAvLyBTdGVwIDA6IOaqoua4rOaYr+WQpueCuuevgOm7nuWxrOaAp++8jOWmguaenOaYr+WJh+mHjeWumuWQkeWIsOWwjeaHieeahOevgOm7nuaWueazlVxuICAgICAgICAgICAgICAgIGNvbnN0IG5vZGVSZWRpcmVjdFJlc3VsdCA9IGF3YWl0IHRoaXMuY2hlY2tBbmRSZWRpcmVjdE5vZGVQcm9wZXJ0aWVzKGFyZ3MpO1xuICAgICAgICAgICAgICAgIGlmIChub2RlUmVkaXJlY3RSZXN1bHQpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShub2RlUmVkaXJlY3RSZXN1bHQpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIC8vIFN0ZXAgMTog542y5Y+W57WE5Lu25L+h5oGv77yM5L2/55So6IiHZ2V0Q29tcG9uZW50c+ebuOWQjOeahOaWueazlVxuICAgICAgICAgICAgICAgIGNvbnN0IGNvbXBvbmVudHNSZXNwb25zZSA9IGF3YWl0IHRoaXMuZ2V0Q29tcG9uZW50cyhub2RlVXVpZCk7XG4gICAgICAgICAgICAgICAgaWYgKCFjb21wb25lbnRzUmVzcG9uc2Uuc3VjY2VzcyB8fCAhY29tcG9uZW50c1Jlc3BvbnNlLmRhdGEpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yOiBgRmFpbGVkIHRvIGdldCBjb21wb25lbnRzIGZvciBub2RlICcke25vZGVVdWlkfSc6ICR7Y29tcG9uZW50c1Jlc3BvbnNlLmVycm9yfWAsXG4gICAgICAgICAgICAgICAgICAgICAgICBpbnN0cnVjdGlvbjogYFBsZWFzZSB2ZXJpZnkgdGhhdCBub2RlIFVVSUQgJyR7bm9kZVV1aWR9JyBpcyBjb3JyZWN0LiBVc2UgZ2V0X2FsbF9ub2RlcyBvciBmaW5kX25vZGVfYnlfbmFtZSB0byBnZXQgdGhlIGNvcnJlY3Qgbm9kZSBVVUlELmBcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgY29uc3QgYWxsQ29tcG9uZW50cyA9IGNvbXBvbmVudHNSZXNwb25zZS5kYXRhLmNvbXBvbmVudHM7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgLy8gU3RlcCAyOiDmn6Xmib7nm67mqJnntYTku7ZcbiAgICAgICAgICAgICAgICAvLyBXZSBjYXB0dXJlIHRoZSBtYXRjaGVkIGluZGV4IGhlcmUgc28gU3RlcCA1IGRvZXNuJ3QgbmVlZCBhXG4gICAgICAgICAgICAgICAgLy8gc2Vjb25kIGBzY2VuZS9xdWVyeS1ub2RlYCBjYWxsOiBnZXRDb21wb25lbnRzIGFib3ZlIG1hcHNcbiAgICAgICAgICAgICAgICAvLyBfX2NvbXBzX18gMToxIChwcmVzZXJ2ZXMgb3JkZXIpIG9uIHRoZSBkaXJlY3QgQVBJIHBhdGgsXG4gICAgICAgICAgICAgICAgLy8gd2hpY2ggaXMgdGhlIG9ubHkgcGF0aCB0aGF0IHlpZWxkcyBgZGF0YS5jb21wb25lbnRzYCBpblxuICAgICAgICAgICAgICAgIC8vIHRoaXMgc2hhcGUg4oCUIHRoZSBydW5TY2VuZU1ldGhvZCBmYWxsYmFjayByZXR1cm5zIGEgZGlmZmVyZW50XG4gICAgICAgICAgICAgICAgLy8gc2hhcGUgdGhhdCB3b3VsZG4ndCByZWFjaCBoZXJlIHdpdGhvdXQgZXJyb3JpbmcgZWFybGllci5cbiAgICAgICAgICAgICAgICBsZXQgdGFyZ2V0Q29tcG9uZW50ID0gbnVsbDtcbiAgICAgICAgICAgICAgICBsZXQgdGFyZ2V0Q29tcG9uZW50SW5kZXggPSAtMTtcbiAgICAgICAgICAgICAgICBjb25zdCBhdmFpbGFibGVUeXBlczogc3RyaW5nW10gPSBbXTtcblxuICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYWxsQ29tcG9uZW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjb21wID0gYWxsQ29tcG9uZW50c1tpXTtcbiAgICAgICAgICAgICAgICAgICAgYXZhaWxhYmxlVHlwZXMucHVzaChjb21wLnR5cGUpO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChjb21wLnR5cGUgPT09IGNvbXBvbmVudFR5cGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRhcmdldENvbXBvbmVudCA9IGNvbXA7XG4gICAgICAgICAgICAgICAgICAgICAgICB0YXJnZXRDb21wb25lbnRJbmRleCA9IGk7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICghdGFyZ2V0Q29tcG9uZW50KSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIOaPkOS+m+abtOips+e0sOeahOmMr+iqpOS/oeaBr+WSjOW7uuitsFxuICAgICAgICAgICAgICAgICAgICBjb25zdCBpbnN0cnVjdGlvbiA9IHRoaXMuZ2VuZXJhdGVDb21wb25lbnRTdWdnZXN0aW9uKGNvbXBvbmVudFR5cGUsIGF2YWlsYWJsZVR5cGVzLCBwcm9wZXJ0eSk7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgICAgICBlcnJvcjogYENvbXBvbmVudCAnJHtjb21wb25lbnRUeXBlfScgbm90IGZvdW5kIG9uIG5vZGUuIEF2YWlsYWJsZSBjb21wb25lbnRzOiAke2F2YWlsYWJsZVR5cGVzLmpvaW4oJywgJyl9YCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGluc3RydWN0aW9uOiBpbnN0cnVjdGlvblxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAvLyBTdGVwIDM6IOiHquWLleaqoua4rOWSjOi9ieaPm+WxrOaAp+WAvFxuICAgICAgICAgICAgICAgIGxldCBwcm9wZXJ0eUluZm87XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYFtDb21wb25lbnRUb29sc10gQW5hbHl6aW5nIHByb3BlcnR5OiAke3Byb3BlcnR5fWApO1xuICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0eUluZm8gPSB0aGlzLmFuYWx5emVQcm9wZXJ0eSh0YXJnZXRDb21wb25lbnQsIHByb3BlcnR5KTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChhbmFseXplRXJyb3I6IGFueSkge1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBbQ29tcG9uZW50VG9vbHNdIEVycm9yIGluIGFuYWx5emVQcm9wZXJ0eTpgLCBhbmFseXplRXJyb3IpO1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoYEZhaWxlZCB0byBhbmFseXplIHByb3BlcnR5ICcke3Byb3BlcnR5fSc6ICR7YW5hbHl6ZUVycm9yLm1lc3NhZ2V9YCkpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGlmICghcHJvcGVydHlJbmZvLmV4aXN0cykge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoYFByb3BlcnR5ICcke3Byb3BlcnR5fScgbm90IGZvdW5kIG9uIGNvbXBvbmVudCAnJHtjb21wb25lbnRUeXBlfScuIEF2YWlsYWJsZSBwcm9wZXJ0aWVzOiAke3Byb3BlcnR5SW5mby5hdmFpbGFibGVQcm9wZXJ0aWVzLmpvaW4oJywgJyl9YCkpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gU3RlcCAzLjU6IHByb3BlcnR5VHlwZSB2cyBtZXRhZGF0YSByZWZlcmVuY2Uta2luZCBwcmVmbGlnaHQuXG4gICAgICAgICAgICAgICAgLy8gQ2F0Y2hlcyB0aGUgY29tbW9uIHBpdGZhbGwgd2hlcmUgYSBjYy5Db21wb25lbnQgc3ViY2xhc3MgZmllbGRcbiAgICAgICAgICAgICAgICAvLyAoZS5nLiBjYy5DYW52YXMuY2FtZXJhQ29tcG9uZW50IDogY2MuQ2FtZXJhKSBnZXRzIGNhbGxlZCB3aXRoXG4gICAgICAgICAgICAgICAgLy8gcHJvcGVydHlUeXBlOiAnbm9kZScg4oCUIHRoZSBJUEMgc2lsZW50bHkgYWNjZXB0cyBidXQgdGhlIHJlZlxuICAgICAgICAgICAgICAgIC8vIG5ldmVyIGNvbm5lY3RzLiBXZSBzdXJmYWNlIHRoZSByaWdodCBwcm9wZXJ0eVR5cGUgKyB2YWx1ZSBzaGFwZS5cbiAgICAgICAgICAgICAgICBjb25zdCBtaXNtYXRjaCA9IHRoaXMuZGV0ZWN0UHJvcGVydHlUeXBlTWlzbWF0Y2goXG4gICAgICAgICAgICAgICAgICAgIHByb3BlcnR5SW5mbyxcbiAgICAgICAgICAgICAgICAgICAgcHJvcGVydHlUeXBlLFxuICAgICAgICAgICAgICAgICAgICBub2RlVXVpZCxcbiAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50VHlwZSxcbiAgICAgICAgICAgICAgICAgICAgcHJvcGVydHksXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICBpZiAobWlzbWF0Y2gpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShtaXNtYXRjaCk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBTdGVwIDQ6IOiZleeQhuWxrOaAp+WAvOWSjOioree9rlxuICAgICAgICAgICAgICAgIGNvbnN0IG9yaWdpbmFsVmFsdWUgPSBwcm9wZXJ0eUluZm8ub3JpZ2luYWxWYWx1ZTtcbiAgICAgICAgICAgICAgICBsZXQgcHJvY2Vzc2VkVmFsdWU6IGFueTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAvLyDmoLnmk5rmmI7norrnmoRwcm9wZXJ0eVR5cGXomZXnkIblsazmgKflgLxcbiAgICAgICAgICAgICAgICBzd2l0Y2ggKHByb3BlcnR5VHlwZSkge1xuICAgICAgICAgICAgICAgICAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgICAgICAgICAgICAgICAgICAgcHJvY2Vzc2VkVmFsdWUgPSBTdHJpbmcodmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ251bWJlcic6XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ2ludGVnZXInOlxuICAgICAgICAgICAgICAgICAgICBjYXNlICdmbG9hdCc6XG4gICAgICAgICAgICAgICAgICAgICAgICBwcm9jZXNzZWRWYWx1ZSA9IE51bWJlcih2YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICAgICAgICAgICAgICAgICAgICBwcm9jZXNzZWRWYWx1ZSA9IEJvb2xlYW4odmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ2NvbG9yJzpcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5a2X56ym5Liy5qC85byP77ya5pSv5oyB5Y2B5YWt6YCy5Yi244CB6aGP6Imy5ZCN56ix44CBcmdiKCkvcmdiYSgpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvY2Vzc2VkVmFsdWUgPSB0aGlzLnBhcnNlQ29sb3JTdHJpbmcodmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5bCN6LGh5qC85byP77ya6amX6K2J5Lim6L2J5o+bUkdCQeWAvFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb2Nlc3NlZFZhbHVlID0ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByOiBNYXRoLm1pbigyNTUsIE1hdGgubWF4KDAsIE51bWJlcih2YWx1ZS5yKSB8fCAwKSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGc6IE1hdGgubWluKDI1NSwgTWF0aC5tYXgoMCwgTnVtYmVyKHZhbHVlLmcpIHx8IDApKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYjogTWF0aC5taW4oMjU1LCBNYXRoLm1heCgwLCBOdW1iZXIodmFsdWUuYikgfHwgMCkpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhOiB2YWx1ZS5hICE9PSB1bmRlZmluZWQgPyBNYXRoLm1pbigyNTUsIE1hdGgubWF4KDAsIE51bWJlcih2YWx1ZS5hKSkpIDogMjU1XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdDb2xvciB2YWx1ZSBtdXN0IGJlIGFuIG9iamVjdCB3aXRoIHIsIGcsIGIgcHJvcGVydGllcyBvciBhIGhleGFkZWNpbWFsIHN0cmluZyAoZS5nLiwgXCIjRkYwMDAwXCIpJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgY2FzZSAndmVjMic6XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb2Nlc3NlZFZhbHVlID0ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB4OiBOdW1iZXIodmFsdWUueCkgfHwgMCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgeTogTnVtYmVyKHZhbHVlLnkpIHx8IDBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1ZlYzIgdmFsdWUgbXVzdCBiZSBhbiBvYmplY3Qgd2l0aCB4LCB5IHByb3BlcnRpZXMnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBjYXNlICd2ZWMzJzpcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvY2Vzc2VkVmFsdWUgPSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHg6IE51bWJlcih2YWx1ZS54KSB8fCAwLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB5OiBOdW1iZXIodmFsdWUueSkgfHwgMCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgejogTnVtYmVyKHZhbHVlLnopIHx8IDBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1ZlYzMgdmFsdWUgbXVzdCBiZSBhbiBvYmplY3Qgd2l0aCB4LCB5LCB6IHByb3BlcnRpZXMnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBjYXNlICdzaXplJzpcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvY2Vzc2VkVmFsdWUgPSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHdpZHRoOiBOdW1iZXIodmFsdWUud2lkdGgpIHx8IDAsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGhlaWdodDogTnVtYmVyKHZhbHVlLmhlaWdodCkgfHwgMFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignU2l6ZSB2YWx1ZSBtdXN0IGJlIGFuIG9iamVjdCB3aXRoIHdpZHRoLCBoZWlnaHQgcHJvcGVydGllcycpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ25vZGUnOlxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9jZXNzZWRWYWx1ZSA9IHsgdXVpZDogdmFsdWUgfTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdOb2RlIHJlZmVyZW5jZSB2YWx1ZSBtdXN0IGJlIGEgc3RyaW5nIFVVSUQnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBjYXNlICdjb21wb25lbnQnOlxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDntYTku7blvJXnlKjpnIDopoHnibnmroromZXnkIbvvJrpgJrpgY7nr4Dpu55VVUlE5om+5Yiw57WE5Lu255qEX19pZF9fXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvY2Vzc2VkVmFsdWUgPSB2YWx1ZTsgLy8g5YWI5L+d5a2Y56+A6bueVVVJRO+8jOW+jOe6jOacg+i9ieaPm+eCul9faWRfX1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0NvbXBvbmVudCByZWZlcmVuY2UgdmFsdWUgbXVzdCBiZSBhIHN0cmluZyAobm9kZSBVVUlEIGNvbnRhaW5pbmcgdGhlIHRhcmdldCBjb21wb25lbnQpJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgY2FzZSAnc3ByaXRlRnJhbWUnOlxuICAgICAgICAgICAgICAgICAgICBjYXNlICdwcmVmYWInOlxuICAgICAgICAgICAgICAgICAgICBjYXNlICdhc3NldCc6XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb2Nlc3NlZFZhbHVlID0geyB1dWlkOiB2YWx1ZSB9O1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYCR7cHJvcGVydHlUeXBlfSB2YWx1ZSBtdXN0IGJlIGEgc3RyaW5nIFVVSURgKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBjYXNlICdub2RlQXJyYXknOlxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvY2Vzc2VkVmFsdWUgPSB2YWx1ZS5tYXAoKGl0ZW06IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGl0ZW0gPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4geyB1dWlkOiBpdGVtIH07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vZGVBcnJheSBpdGVtcyBtdXN0IGJlIHN0cmluZyBVVUlEcycpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignTm9kZUFycmF5IHZhbHVlIG11c3QgYmUgYW4gYXJyYXknKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBjYXNlICdjb2xvckFycmF5JzpcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb2Nlc3NlZFZhbHVlID0gdmFsdWUubWFwKChpdGVtOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBpdGVtID09PSAnb2JqZWN0JyAmJiBpdGVtICE9PSBudWxsICYmICdyJyBpbiBpdGVtKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHI6IE1hdGgubWluKDI1NSwgTWF0aC5tYXgoMCwgTnVtYmVyKGl0ZW0ucikgfHwgMCkpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGc6IE1hdGgubWluKDI1NSwgTWF0aC5tYXgoMCwgTnVtYmVyKGl0ZW0uZykgfHwgMCkpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGI6IE1hdGgubWluKDI1NSwgTWF0aC5tYXgoMCwgTnVtYmVyKGl0ZW0uYikgfHwgMCkpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGE6IGl0ZW0uYSAhPT0gdW5kZWZpbmVkID8gTWF0aC5taW4oMjU1LCBNYXRoLm1heCgwLCBOdW1iZXIoaXRlbS5hKSkpIDogMjU1XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgcjogMjU1LCBnOiAyNTUsIGI6IDI1NSwgYTogMjU1IH07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdDb2xvckFycmF5IHZhbHVlIG11c3QgYmUgYW4gYXJyYXknKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBjYXNlICdudW1iZXJBcnJheSc6XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9jZXNzZWRWYWx1ZSA9IHZhbHVlLm1hcCgoaXRlbTogYW55KSA9PiBOdW1iZXIoaXRlbSkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ051bWJlckFycmF5IHZhbHVlIG11c3QgYmUgYW4gYXJyYXknKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBjYXNlICdzdHJpbmdBcnJheSc6XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9jZXNzZWRWYWx1ZSA9IHZhbHVlLm1hcCgoaXRlbTogYW55KSA9PiBTdHJpbmcoaXRlbSkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1N0cmluZ0FycmF5IHZhbHVlIG11c3QgYmUgYW4gYXJyYXknKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbnN1cHBvcnRlZCBwcm9wZXJ0eSB0eXBlOiAke3Byb3BlcnR5VHlwZX1gKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgZGVidWdMb2coYFtDb21wb25lbnRUb29sc10gQ29udmVydGluZyB2YWx1ZTogJHtKU09OLnN0cmluZ2lmeSh2YWx1ZSl9IC0+ICR7SlNPTi5zdHJpbmdpZnkocHJvY2Vzc2VkVmFsdWUpfSAodHlwZTogJHtwcm9wZXJ0eVR5cGV9KWApO1xuICAgICAgICAgICAgICAgIGRlYnVnTG9nKGBbQ29tcG9uZW50VG9vbHNdIFByb3BlcnR5IGFuYWx5c2lzIHJlc3VsdDogcHJvcGVydHlJbmZvLnR5cGU9XCIke3Byb3BlcnR5SW5mby50eXBlfVwiLCBwcm9wZXJ0eVR5cGU9XCIke3Byb3BlcnR5VHlwZX1cImApO1xuICAgICAgICAgICAgICAgIGRlYnVnTG9nKGBbQ29tcG9uZW50VG9vbHNdIFdpbGwgdXNlIGNvbG9yIHNwZWNpYWwgaGFuZGxpbmc6ICR7cHJvcGVydHlUeXBlID09PSAnY29sb3InICYmIHByb2Nlc3NlZFZhbHVlICYmIHR5cGVvZiBwcm9jZXNzZWRWYWx1ZSA9PT0gJ29iamVjdCd9YCk7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgLy8g55So5pa86amX6K2J55qE5a+m6Zqb5pyf5pyb5YC877yI5bCN5pa857WE5Lu25byV55So6ZyA6KaB54m55q6K6JmV55CG77yJXG4gICAgICAgICAgICAgICAgbGV0IGFjdHVhbEV4cGVjdGVkVmFsdWUgPSBwcm9jZXNzZWRWYWx1ZTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAvLyBTdGVwIDU6IOani+W7uuWxrOaAp+i3r+W+ke+8iGNvbXBvbmVudCBpbmRleCDlt7LlnKggU3RlcCAyIOaNleeNsu+8iVxuICAgICAgICAgICAgICAgIGNvbnN0IHJhd0NvbXBvbmVudEluZGV4ID0gdGFyZ2V0Q29tcG9uZW50SW5kZXg7XG4gICAgICAgICAgICAgICAgbGV0IHByb3BlcnR5UGF0aCA9IGBfX2NvbXBzX18uJHtyYXdDb21wb25lbnRJbmRleH0uJHtwcm9wZXJ0eX1gO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIC8vIOeJueauiuiZleeQhuizh+a6kOmhnuWxrOaAp1xuICAgICAgICAgICAgICAgIGlmIChwcm9wZXJ0eVR5cGUgPT09ICdhc3NldCcgfHwgcHJvcGVydHlUeXBlID09PSAnc3ByaXRlRnJhbWUnIHx8IHByb3BlcnR5VHlwZSA9PT0gJ3ByZWZhYicgfHxcbiAgICAgICAgICAgICAgICAgICAgKHByb3BlcnR5SW5mby50eXBlID09PSAnYXNzZXQnICYmIHByb3BlcnR5VHlwZSA9PT0gJ3N0cmluZycpKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYFtDb21wb25lbnRUb29sc10gU2V0dGluZyBhc3NldCByZWZlcmVuY2U6YCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWU6IHByb2Nlc3NlZFZhbHVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgcHJvcGVydHk6IHByb3BlcnR5LFxuICAgICAgICAgICAgICAgICAgICAgICAgcHJvcGVydHlUeXBlOiBwcm9wZXJ0eVR5cGUsXG4gICAgICAgICAgICAgICAgICAgICAgICBwYXRoOiBwcm9wZXJ0eVBhdGhcbiAgICAgICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gV29ya2Zsb3cgb3B0LWluOiB3aGVuIGFzc2lnbmluZyBjYy5TcHJpdGUuc3ByaXRlRnJhbWUgYW5kIHRoZVxuICAgICAgICAgICAgICAgICAgICAvLyBjYWxsZXIgd2FudHMgdGhlIG5vZGUncyBleGlzdGluZyBVSVRyYW5zZm9ybSBjb250ZW50U2l6ZSBrZXB0LFxuICAgICAgICAgICAgICAgICAgICAvLyBwcmUtc2V0IHNpemVNb2RlIHRvIENVU1RPTSAoMCkuIGNvY29zJyBkZWZhdWx0IFRSSU1NRUQgd291bGRcbiAgICAgICAgICAgICAgICAgICAgLy8gb3RoZXJ3aXNlIGF1dG8tcmVzaXplIGNvbnRlbnRTaXplIHRvIHRoZSB0ZXh0dXJlJ3MgbmF0aXZlXG4gICAgICAgICAgICAgICAgICAgIC8vIGRpbWVuc2lvbnMgb24gYXNzaWduIOKAlCB1c3VhbGx5IHVud2FudGVkIHdoZW4gbGF5aW5nIG91dCBVSVxuICAgICAgICAgICAgICAgICAgICAvLyBwcm9jZWR1cmFsbHkgd2l0aCBhIGNob3NlbiBzaXplLlxuICAgICAgICAgICAgICAgICAgICBpZiAoYXJncy5wcmVzZXJ2ZUNvbnRlbnRTaXplICYmIGNvbXBvbmVudFR5cGUgPT09ICdjYy5TcHJpdGUnICYmIHByb3BlcnR5ID09PSAnc3ByaXRlRnJhbWUnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3NldC1wcm9wZXJ0eScsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdXVpZDogbm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBhdGg6IGBfX2NvbXBzX18uJHtyYXdDb21wb25lbnRJbmRleH0uc2l6ZU1vZGVgLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkdW1wOiB7IHZhbHVlOiAwIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coJ1tDb21wb25lbnRUb29sc10gcHJlc2VydmVDb250ZW50U2l6ZTogZm9yY2VkIGNjLlNwcml0ZS5zaXplTW9kZT1DVVNUT00oMCkgYmVmb3JlIHNwcml0ZUZyYW1lIGFzc2lnbicpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAocHJlRXJyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS53YXJuKCdbQ29tcG9uZW50VG9vbHNdIHByZXNlcnZlQ29udGVudFNpemUgcHJlLXNldCBmYWlsZWQgKG5vbi1mYXRhbCk6JywgcHJlRXJyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIERldGVybWluZSBhc3NldCB0eXBlIGJhc2VkIG9uIHByb3BlcnR5IG5hbWVcbiAgICAgICAgICAgICAgICAgICAgbGV0IGFzc2V0VHlwZSA9ICdjYy5TcHJpdGVGcmFtZSc7IC8vIGRlZmF1bHRcbiAgICAgICAgICAgICAgICAgICAgaWYgKHByb3BlcnR5LnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ3RleHR1cmUnKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXNzZXRUeXBlID0gJ2NjLlRleHR1cmUyRCc7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHkudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnbWF0ZXJpYWwnKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXNzZXRUeXBlID0gJ2NjLk1hdGVyaWFsJztcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdmb250JykpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFzc2V0VHlwZSA9ICdjYy5Gb250JztcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdjbGlwJykpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFzc2V0VHlwZSA9ICdjYy5BdWRpb0NsaXAnO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5VHlwZSA9PT0gJ3ByZWZhYicpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFzc2V0VHlwZSA9ICdjYy5QcmVmYWInO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnc2V0LXByb3BlcnR5Jywge1xuICAgICAgICAgICAgICAgICAgICAgICAgdXVpZDogbm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBwYXRoOiBwcm9wZXJ0eVBhdGgsXG4gICAgICAgICAgICAgICAgICAgICAgICBkdW1wOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWU6IHByb2Nlc3NlZFZhbHVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6IGFzc2V0VHlwZVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGNvbXBvbmVudFR5cGUgPT09ICdjYy5VSVRyYW5zZm9ybScgJiYgKHByb3BlcnR5ID09PSAnX2NvbnRlbnRTaXplJyB8fCBwcm9wZXJ0eSA9PT0gJ2NvbnRlbnRTaXplJykpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gU3BlY2lhbCBoYW5kbGluZyBmb3IgVUlUcmFuc2Zvcm0gY29udGVudFNpemUgLSBzZXQgd2lkdGggYW5kIGhlaWdodCBzZXBhcmF0ZWx5XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHdpZHRoID0gTnVtYmVyKHZhbHVlLndpZHRoKSB8fCAxMDA7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGhlaWdodCA9IE51bWJlcih2YWx1ZS5oZWlnaHQpIHx8IDEwMDtcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIC8vIFNldCB3aWR0aCBmaXJzdFxuICAgICAgICAgICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdzZXQtcHJvcGVydHknLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiBub2RlVXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhdGg6IGBfX2NvbXBzX18uJHtyYXdDb21wb25lbnRJbmRleH0ud2lkdGhgLFxuICAgICAgICAgICAgICAgICAgICAgICAgZHVtcDogeyB2YWx1ZTogd2lkdGggfVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIC8vIFRoZW4gc2V0IGhlaWdodFxuICAgICAgICAgICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdzZXQtcHJvcGVydHknLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiBub2RlVXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhdGg6IGBfX2NvbXBzX18uJHtyYXdDb21wb25lbnRJbmRleH0uaGVpZ2h0YCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGR1bXA6IHsgdmFsdWU6IGhlaWdodCB9XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoY29tcG9uZW50VHlwZSA9PT0gJ2NjLlVJVHJhbnNmb3JtJyAmJiAocHJvcGVydHkgPT09ICdfYW5jaG9yUG9pbnQnIHx8IHByb3BlcnR5ID09PSAnYW5jaG9yUG9pbnQnKSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBTcGVjaWFsIGhhbmRsaW5nIGZvciBVSVRyYW5zZm9ybSBhbmNob3JQb2ludCAtIHNldCBhbmNob3JYIGFuZCBhbmNob3JZIHNlcGFyYXRlbHlcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYW5jaG9yWCA9IE51bWJlcih2YWx1ZS54KSB8fCAwLjU7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGFuY2hvclkgPSBOdW1iZXIodmFsdWUueSkgfHwgMC41O1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgLy8gU2V0IGFuY2hvclggZmlyc3RcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnc2V0LXByb3BlcnR5Jywge1xuICAgICAgICAgICAgICAgICAgICAgICAgdXVpZDogbm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBwYXRoOiBgX19jb21wc19fLiR7cmF3Q29tcG9uZW50SW5kZXh9LmFuY2hvclhgLFxuICAgICAgICAgICAgICAgICAgICAgICAgZHVtcDogeyB2YWx1ZTogYW5jaG9yWCB9XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgLy8gVGhlbiBzZXQgYW5jaG9yWSAgXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3NldC1wcm9wZXJ0eScsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IG5vZGVVdWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgcGF0aDogYF9fY29tcHNfXy4ke3Jhd0NvbXBvbmVudEluZGV4fS5hbmNob3JZYCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGR1bXA6IHsgdmFsdWU6IGFuY2hvclkgfVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5VHlwZSA9PT0gJ2NvbG9yJyAmJiBwcm9jZXNzZWRWYWx1ZSAmJiB0eXBlb2YgcHJvY2Vzc2VkVmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIOeJueauiuiZleeQhumhj+iJsuWxrOaAp++8jOeiuuS/nVJHQkHlgLzmraPnorpcbiAgICAgICAgICAgICAgICAgICAgLy8gQ29jb3MgQ3JlYXRvcumhj+iJsuWAvOevhOWcjeaYrzAtMjU1XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbG9yVmFsdWUgPSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByOiBNYXRoLm1pbigyNTUsIE1hdGgubWF4KDAsIE51bWJlcihwcm9jZXNzZWRWYWx1ZS5yKSB8fCAwKSksXG4gICAgICAgICAgICAgICAgICAgICAgICBnOiBNYXRoLm1pbigyNTUsIE1hdGgubWF4KDAsIE51bWJlcihwcm9jZXNzZWRWYWx1ZS5nKSB8fCAwKSksXG4gICAgICAgICAgICAgICAgICAgICAgICBiOiBNYXRoLm1pbigyNTUsIE1hdGgubWF4KDAsIE51bWJlcihwcm9jZXNzZWRWYWx1ZS5iKSB8fCAwKSksXG4gICAgICAgICAgICAgICAgICAgICAgICBhOiBwcm9jZXNzZWRWYWx1ZS5hICE9PSB1bmRlZmluZWQgPyBNYXRoLm1pbigyNTUsIE1hdGgubWF4KDAsIE51bWJlcihwcm9jZXNzZWRWYWx1ZS5hKSkpIDogMjU1XG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgW0NvbXBvbmVudFRvb2xzXSBTZXR0aW5nIGNvbG9yIHZhbHVlOmAsIGNvbG9yVmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnc2V0LXByb3BlcnR5Jywge1xuICAgICAgICAgICAgICAgICAgICAgICAgdXVpZDogbm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBwYXRoOiBwcm9wZXJ0eVBhdGgsXG4gICAgICAgICAgICAgICAgICAgICAgICBkdW1wOiB7IFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlOiBjb2xvclZhbHVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6ICdjYy5Db2xvcidcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eVR5cGUgPT09ICd2ZWMzJyAmJiBwcm9jZXNzZWRWYWx1ZSAmJiB0eXBlb2YgcHJvY2Vzc2VkVmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIOeJueauiuiZleeQhlZlYzPlsazmgKdcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdmVjM1ZhbHVlID0ge1xuICAgICAgICAgICAgICAgICAgICAgICAgeDogTnVtYmVyKHByb2Nlc3NlZFZhbHVlLngpIHx8IDAsXG4gICAgICAgICAgICAgICAgICAgICAgICB5OiBOdW1iZXIocHJvY2Vzc2VkVmFsdWUueSkgfHwgMCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHo6IE51bWJlcihwcm9jZXNzZWRWYWx1ZS56KSB8fCAwXG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdzZXQtcHJvcGVydHknLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiBub2RlVXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhdGg6IHByb3BlcnR5UGF0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGR1bXA6IHsgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWU6IHZlYzNWYWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiAnY2MuVmVjMydcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eVR5cGUgPT09ICd2ZWMyJyAmJiBwcm9jZXNzZWRWYWx1ZSAmJiB0eXBlb2YgcHJvY2Vzc2VkVmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIOeJueauiuiZleeQhlZlYzLlsazmgKdcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdmVjMlZhbHVlID0ge1xuICAgICAgICAgICAgICAgICAgICAgICAgeDogTnVtYmVyKHByb2Nlc3NlZFZhbHVlLngpIHx8IDAsXG4gICAgICAgICAgICAgICAgICAgICAgICB5OiBOdW1iZXIocHJvY2Vzc2VkVmFsdWUueSkgfHwgMFxuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnc2V0LXByb3BlcnR5Jywge1xuICAgICAgICAgICAgICAgICAgICAgICAgdXVpZDogbm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBwYXRoOiBwcm9wZXJ0eVBhdGgsXG4gICAgICAgICAgICAgICAgICAgICAgICBkdW1wOiB7IFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlOiB2ZWMyVmFsdWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogJ2NjLlZlYzInXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlUeXBlID09PSAnc2l6ZScgJiYgcHJvY2Vzc2VkVmFsdWUgJiYgdHlwZW9mIHByb2Nlc3NlZFZhbHVlID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgICAgICAgICAvLyDnibnmroromZXnkIZTaXpl5bGs5oCnXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHNpemVWYWx1ZSA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdpZHRoOiBOdW1iZXIocHJvY2Vzc2VkVmFsdWUud2lkdGgpIHx8IDAsXG4gICAgICAgICAgICAgICAgICAgICAgICBoZWlnaHQ6IE51bWJlcihwcm9jZXNzZWRWYWx1ZS5oZWlnaHQpIHx8IDBcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3NldC1wcm9wZXJ0eScsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IG5vZGVVdWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgcGF0aDogcHJvcGVydHlQYXRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgZHVtcDogeyBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZTogc2l6ZVZhbHVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6ICdjYy5TaXplJ1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5VHlwZSA9PT0gJ25vZGUnICYmIHByb2Nlc3NlZFZhbHVlICYmIHR5cGVvZiBwcm9jZXNzZWRWYWx1ZSA9PT0gJ29iamVjdCcgJiYgJ3V1aWQnIGluIHByb2Nlc3NlZFZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIOeJueauiuiZleeQhuevgOm7nuW8leeUqFxuICAgICAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgW0NvbXBvbmVudFRvb2xzXSBTZXR0aW5nIG5vZGUgcmVmZXJlbmNlIHdpdGggVVVJRDogJHtwcm9jZXNzZWRWYWx1ZS51dWlkfWApO1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdzZXQtcHJvcGVydHknLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiBub2RlVXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhdGg6IHByb3BlcnR5UGF0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGR1bXA6IHsgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWU6IHByb2Nlc3NlZFZhbHVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6ICdjYy5Ob2RlJ1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5VHlwZSA9PT0gJ2NvbXBvbmVudCcgJiYgdHlwZW9mIHByb2Nlc3NlZFZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgICAgICAvLyDnibnmroromZXnkIbntYTku7blvJXnlKjvvJrpgJrpgY7nr4Dpu55VVUlE5om+5Yiw57WE5Lu255qEX19pZF9fXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRhcmdldE5vZGVVdWlkID0gcHJvY2Vzc2VkVmFsdWU7XG4gICAgICAgICAgICAgICAgICAgIGRlYnVnTG9nKGBbQ29tcG9uZW50VG9vbHNdIFNldHRpbmcgY29tcG9uZW50IHJlZmVyZW5jZSAtIGZpbmRpbmcgY29tcG9uZW50IG9uIG5vZGU6ICR7dGFyZ2V0Tm9kZVV1aWR9YCk7XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAvLyDlvp7nlbbliY3ntYTku7bnmoTlsazmgKflhYPmlbjmk5rkuK3njbLlj5bmnJ/mnJvnmoTntYTku7bpoZ7lnotcbiAgICAgICAgICAgICAgICAgICAgbGV0IGV4cGVjdGVkQ29tcG9uZW50VHlwZSA9ICcnO1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgLy8g542y5Y+W55W25YmN57WE5Lu255qE6Kmz57Sw5L+h5oGv77yM5YyF5ous5bGs5oCn5YWD5pW45pOaXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGN1cnJlbnRDb21wb25lbnRJbmZvID0gYXdhaXQgdGhpcy5nZXRDb21wb25lbnRJbmZvKG5vZGVVdWlkLCBjb21wb25lbnRUeXBlKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGN1cnJlbnRDb21wb25lbnRJbmZvLnN1Y2Nlc3MgJiYgY3VycmVudENvbXBvbmVudEluZm8uZGF0YT8ucHJvcGVydGllcz8uW3Byb3BlcnR5XSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcHJvcGVydHlNZXRhID0gY3VycmVudENvbXBvbmVudEluZm8uZGF0YS5wcm9wZXJ0aWVzW3Byb3BlcnR5XTtcbiAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAgICAgLy8g5b6e5bGs5oCn5YWD5pW45pOa5Lit5o+Q5Y+W57WE5Lu26aGe5Z6L5L+h5oGvXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocHJvcGVydHlNZXRhICYmIHR5cGVvZiBwcm9wZXJ0eU1ldGEgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5qqi5p+l5piv5ZCm5pyJdHlwZeWtl+auteaMh+ekuue1hOS7tumhnuWei1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChwcm9wZXJ0eU1ldGEudHlwZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBleHBlY3RlZENvbXBvbmVudFR5cGUgPSBwcm9wZXJ0eU1ldGEudHlwZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5TWV0YS5jdG9yKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOacieS6m+WxrOaAp+WPr+iDveS9v+eUqGN0b3LlrZfmrrVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXhwZWN0ZWRDb21wb25lbnRUeXBlID0gcHJvcGVydHlNZXRhLmN0b3I7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eU1ldGEuZXh0ZW5kcyAmJiBBcnJheS5pc0FycmF5KHByb3BlcnR5TWV0YS5leHRlbmRzKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDmqqLmn6VleHRlbmRz5pW457WE77yM6YCa5bi456ys5LiA5YCL5piv5pyA5YW36auU55qE6aGe5Z6LXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvciAoY29uc3QgZXh0ZW5kVHlwZSBvZiBwcm9wZXJ0eU1ldGEuZXh0ZW5kcykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGV4dGVuZFR5cGUuc3RhcnRzV2l0aCgnY2MuJykgJiYgZXh0ZW5kVHlwZSAhPT0gJ2NjLkNvbXBvbmVudCcgJiYgZXh0ZW5kVHlwZSAhPT0gJ2NjLk9iamVjdCcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBleHBlY3RlZENvbXBvbmVudFR5cGUgPSBleHRlbmRUeXBlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICBpZiAoIWV4cGVjdGVkQ29tcG9uZW50VHlwZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmFibGUgdG8gZGV0ZXJtaW5lIHJlcXVpcmVkIGNvbXBvbmVudCB0eXBlIGZvciBwcm9wZXJ0eSAnJHtwcm9wZXJ0eX0nIG9uIGNvbXBvbmVudCAnJHtjb21wb25lbnRUeXBlfScuIFByb3BlcnR5IG1ldGFkYXRhIG1heSBub3QgY29udGFpbiB0eXBlIGluZm9ybWF0aW9uLmApO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgW0NvbXBvbmVudFRvb2xzXSBEZXRlY3RlZCByZXF1aXJlZCBjb21wb25lbnQgdHlwZTogJHtleHBlY3RlZENvbXBvbmVudFR5cGV9IGZvciBwcm9wZXJ0eTogJHtwcm9wZXJ0eX1gKTtcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyDnjbLlj5bnm67mqJnnr4Dpu57nmoTntYTku7bkv6Hmga9cbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHRhcmdldE5vZGVEYXRhID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktbm9kZScsIHRhcmdldE5vZGVVdWlkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghdGFyZ2V0Tm9kZURhdGEgfHwgIXRhcmdldE5vZGVEYXRhLl9fY29tcHNfXykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVGFyZ2V0IG5vZGUgJHt0YXJnZXROb2RlVXVpZH0gbm90IGZvdW5kIG9yIGhhcyBubyBjb21wb25lbnRzYCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIOaJk+WNsOebruaomeevgOm7nueahOe1hOS7tuamguimvVxuICAgICAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYFtDb21wb25lbnRUb29sc10gVGFyZ2V0IG5vZGUgJHt0YXJnZXROb2RlVXVpZH0gaGFzICR7dGFyZ2V0Tm9kZURhdGEuX19jb21wc19fLmxlbmd0aH0gY29tcG9uZW50czpgKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRhcmdldE5vZGVEYXRhLl9fY29tcHNfXy5mb3JFYWNoKChjb21wOiBhbnksIGluZGV4OiBudW1iZXIpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBzY2VuZUlkID0gY29tcC52YWx1ZSAmJiBjb21wLnZhbHVlLnV1aWQgJiYgY29tcC52YWx1ZS51dWlkLnZhbHVlID8gY29tcC52YWx1ZS51dWlkLnZhbHVlIDogJ3Vua25vd24nO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlYnVnTG9nKGBbQ29tcG9uZW50VG9vbHNdIENvbXBvbmVudCAke2luZGV4fTogJHtjb21wLnR5cGV9IChzY2VuZV9pZDogJHtzY2VuZUlkfSlgKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyDmn6Xmib7lsI3mh4nnmoTntYTku7ZcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCB0YXJnZXRDb21wb25lbnQgPSBudWxsO1xuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IGNvbXBvbmVudElkOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAgICAgLy8g5Zyo55uu5qiZ56+A6bue55qEX2NvbXBvbmVudHPmlbjntYTkuK3mn6Xmib7mjIflrprpoZ7lnovnmoTntYTku7ZcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIOazqOaEj++8ml9fY29tcHNfX+WSjF9jb21wb25lbnRz55qE57Si5byV5piv5bCN5oeJ55qEXG4gICAgICAgICAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgW0NvbXBvbmVudFRvb2xzXSBTZWFyY2hpbmcgZm9yIGNvbXBvbmVudCB0eXBlOiAke2V4cGVjdGVkQ29tcG9uZW50VHlwZX1gKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0YXJnZXROb2RlRGF0YS5fX2NvbXBzX18ubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjb21wID0gdGFyZ2V0Tm9kZURhdGEuX19jb21wc19fW2ldIGFzIGFueTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgW0NvbXBvbmVudFRvb2xzXSBDaGVja2luZyBjb21wb25lbnQgJHtpfTogdHlwZT0ke2NvbXAudHlwZX0sIHRhcmdldD0ke2V4cGVjdGVkQ29tcG9uZW50VHlwZX1gKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoY29tcC50eXBlID09PSBleHBlY3RlZENvbXBvbmVudFR5cGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGFyZ2V0Q29tcG9uZW50ID0gY29tcDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYFtDb21wb25lbnRUb29sc10gRm91bmQgbWF0Y2hpbmcgY29tcG9uZW50IGF0IGluZGV4ICR7aX06ICR7Y29tcC50eXBlfWApO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5b6e57WE5Lu255qEdmFsdWUudXVpZC52YWx1ZeS4reeNsuWPlue1hOS7tuWcqOWgtOaZr+S4reeahElEXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjb21wLnZhbHVlICYmIGNvbXAudmFsdWUudXVpZCAmJiBjb21wLnZhbHVlLnV1aWQudmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudElkID0gY29tcC52YWx1ZS51dWlkLnZhbHVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYFtDb21wb25lbnRUb29sc10gR290IGNvbXBvbmVudElkIGZyb20gY29tcC52YWx1ZS51dWlkLnZhbHVlOiAke2NvbXBvbmVudElkfWApO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYFtDb21wb25lbnRUb29sc10gQ29tcG9uZW50IHN0cnVjdHVyZTpgLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaGFzVmFsdWU6ICEhY29tcC52YWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBoYXNVdWlkOiAhIShjb21wLnZhbHVlICYmIGNvbXAudmFsdWUudXVpZCksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaGFzVXVpZFZhbHVlOiAhIShjb21wLnZhbHVlICYmIGNvbXAudmFsdWUudXVpZCAmJiBjb21wLnZhbHVlLnV1aWQudmFsdWUpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHV1aWRTdHJ1Y3R1cmU6IGNvbXAudmFsdWUgPyBjb21wLnZhbHVlLnV1aWQgOiAnTm8gdmFsdWUnXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5hYmxlIHRvIGV4dHJhY3QgY29tcG9uZW50IElEIGZyb20gY29tcG9uZW50IHN0cnVjdHVyZWApO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghdGFyZ2V0Q29tcG9uZW50KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5aaC5p6c5rKS5om+5Yiw77yM5YiX5Ye65Y+v55So57WE5Lu26K6T55So5oi2556t6Kej77yM6aGv56S65aC05pmv5Lit55qE55yf5a+mSURcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBhdmFpbGFibGVDb21wb25lbnRzID0gdGFyZ2V0Tm9kZURhdGEuX19jb21wc19fLm1hcCgoY29tcDogYW55LCBpbmRleDogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxldCBzY2VuZUlkID0gJ3Vua25vd24nO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDlvp7ntYTku7bnmoR2YWx1ZS51dWlkLnZhbHVl542y5Y+W5aC05pmvSURcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNvbXAudmFsdWUgJiYgY29tcC52YWx1ZS51dWlkICYmIGNvbXAudmFsdWUudXVpZC52YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2NlbmVJZCA9IGNvbXAudmFsdWUudXVpZC52YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gYCR7Y29tcC50eXBlfShzY2VuZV9pZDoke3NjZW5lSWR9KWA7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDb21wb25lbnQgdHlwZSAnJHtleHBlY3RlZENvbXBvbmVudFR5cGV9JyBub3QgZm91bmQgb24gbm9kZSAke3RhcmdldE5vZGVVdWlkfS4gQXZhaWxhYmxlIGNvbXBvbmVudHM6ICR7YXZhaWxhYmxlQ29tcG9uZW50cy5qb2luKCcsICcpfWApO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgW0NvbXBvbmVudFRvb2xzXSBGb3VuZCBjb21wb25lbnQgJHtleHBlY3RlZENvbXBvbmVudFR5cGV9IHdpdGggc2NlbmUgSUQ6ICR7Y29tcG9uZW50SWR9IG9uIG5vZGUgJHt0YXJnZXROb2RlVXVpZH1gKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAgICAgLy8g5pu05paw5pyf5pyb5YC854K65a+m6Zqb55qE57WE5Lu2SUTlsI3osaHmoLzlvI/vvIznlKjmlrzlvoznuozpqZforYlcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjb21wb25lbnRJZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFjdHVhbEV4cGVjdGVkVmFsdWUgPSB7IHV1aWQ6IGNvbXBvbmVudElkIH07XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIOWYl+ippuS9v+eUqOiIh+evgOm7ni/os4fmupDlvJXnlKjnm7jlkIznmoTmoLzlvI/vvJp7dXVpZDogY29tcG9uZW50SWR9XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyDmuKzoqabnnIvmmK/lkKbog73mraPnorroqK3nva7ntYTku7blvJXnlKhcbiAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3NldC1wcm9wZXJ0eScsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiBub2RlVXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwYXRoOiBwcm9wZXJ0eVBhdGgsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZHVtcDogeyBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWU6IHsgdXVpZDogY29tcG9uZW50SWQgfSwgIC8vIOS9v+eUqOWwjeixoeagvOW8j++8jOWDj+evgOm7ni/os4fmupDlvJXnlKjkuIDmqKNcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogZXhwZWN0ZWRDb21wb25lbnRUeXBlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYFtDb21wb25lbnRUb29sc10gRXJyb3Igc2V0dGluZyBjb21wb25lbnQgcmVmZXJlbmNlOmAsIGVycm9yKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eVR5cGUgPT09ICdub2RlQXJyYXknICYmIEFycmF5LmlzQXJyYXkocHJvY2Vzc2VkVmFsdWUpKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIOeJueauiuiZleeQhuevgOm7nuaVuOe1hCAtIOS/neaMgemgkOiZleeQhueahOagvOW8j1xuICAgICAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgW0NvbXBvbmVudFRvb2xzXSBTZXR0aW5nIG5vZGUgYXJyYXk6YCwgcHJvY2Vzc2VkVmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnc2V0LXByb3BlcnR5Jywge1xuICAgICAgICAgICAgICAgICAgICAgICAgdXVpZDogbm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBwYXRoOiBwcm9wZXJ0eVBhdGgsXG4gICAgICAgICAgICAgICAgICAgICAgICBkdW1wOiB7IFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlOiBwcm9jZXNzZWRWYWx1ZSAgLy8g5L+d5oyBIFt7dXVpZDogXCIuLi5cIn0sIHt1dWlkOiBcIi4uLlwifV0g5qC85byPXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlUeXBlID09PSAnY29sb3JBcnJheScgJiYgQXJyYXkuaXNBcnJheShwcm9jZXNzZWRWYWx1ZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8g54m55q6K6JmV55CG6aGP6Imy5pW457WEXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbG9yQXJyYXlWYWx1ZSA9IHByb2Nlc3NlZFZhbHVlLm1hcCgoaXRlbTogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoaXRlbSAmJiB0eXBlb2YgaXRlbSA9PT0gJ29iamVjdCcgJiYgJ3InIGluIGl0ZW0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByOiBNYXRoLm1pbigyNTUsIE1hdGgubWF4KDAsIE51bWJlcihpdGVtLnIpIHx8IDApKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZzogTWF0aC5taW4oMjU1LCBNYXRoLm1heCgwLCBOdW1iZXIoaXRlbS5nKSB8fCAwKSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGI6IE1hdGgubWluKDI1NSwgTWF0aC5tYXgoMCwgTnVtYmVyKGl0ZW0uYikgfHwgMCkpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhOiBpdGVtLmEgIT09IHVuZGVmaW5lZCA/IE1hdGgubWluKDI1NSwgTWF0aC5tYXgoMCwgTnVtYmVyKGl0ZW0uYSkpKSA6IDI1NVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB7IHI6IDI1NSwgZzogMjU1LCBiOiAyNTUsIGE6IDI1NSB9O1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3NldC1wcm9wZXJ0eScsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IG5vZGVVdWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgcGF0aDogcHJvcGVydHlQYXRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgZHVtcDogeyBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZTogY29sb3JBcnJheVZhbHVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6ICdjYy5Db2xvcidcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gTm9ybWFsIHByb3BlcnR5IHNldHRpbmcgZm9yIG5vbi1hc3NldCBwcm9wZXJ0aWVzXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3NldC1wcm9wZXJ0eScsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IG5vZGVVdWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgcGF0aDogcHJvcGVydHlQYXRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgZHVtcDogeyB2YWx1ZTogcHJvY2Vzc2VkVmFsdWUgfVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgLy8gU3RlcCA1OiDnrYnlvoVFZGl0b3LlrozmiJDmm7TmlrDvvIznhLblvozpqZforYnoqK3nva7ntZDmnpxcbiAgICAgICAgICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMjAwKSk7IC8vIOetieW+hTIwMG1z6K6TRWRpdG9y5a6M5oiQ5pu05pawXG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgY29uc3QgdmVyaWZpY2F0aW9uID0gYXdhaXQgdGhpcy52ZXJpZnlQcm9wZXJ0eUNoYW5nZShub2RlVXVpZCwgY29tcG9uZW50VHlwZSwgcHJvcGVydHksIG9yaWdpbmFsVmFsdWUsIGFjdHVhbEV4cGVjdGVkVmFsdWUpO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRUeXBlLFxuICAgICAgICAgICAgICAgICAgICAgICAgcHJvcGVydHksXG4gICAgICAgICAgICAgICAgICAgICAgICBhY3R1YWxWYWx1ZTogdmVyaWZpY2F0aW9uLmFjdHVhbFZhbHVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgY2hhbmdlVmVyaWZpZWQ6IHZlcmlmaWNhdGlvbi52ZXJpZmllZFxuICAgICAgICAgICAgICAgICAgICB9LCBgU3VjY2Vzc2Z1bGx5IHNldCAke2NvbXBvbmVudFR5cGV9LiR7cHJvcGVydHl9YCkpO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYFtDb21wb25lbnRUb29sc10gRXJyb3Igc2V0dGluZyBwcm9wZXJ0eTpgLCBlcnJvcik7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGBGYWlsZWQgdG8gc2V0IHByb3BlcnR5OiAke2Vycm9yLm1lc3NhZ2V9YCkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cblxuICAgIHByaXZhdGUgYXN5bmMgYXR0YWNoU2NyaXB0KG5vZGVVdWlkOiBzdHJpbmcsIHNjcmlwdFBhdGg6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZShhc3luYyAocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgLy8g5b6e6IWz5pys6Lev5b6R5o+Q5Y+W57WE5Lu26aGe5ZCNXG4gICAgICAgICAgICBjb25zdCBzY3JpcHROYW1lID0gc2NyaXB0UGF0aC5zcGxpdCgnLycpLnBvcCgpPy5yZXBsYWNlKCcudHMnLCAnJykucmVwbGFjZSgnLmpzJywgJycpO1xuICAgICAgICAgICAgaWYgKCFzY3JpcHROYW1lKSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKCdJbnZhbGlkIHNjcmlwdCBwYXRoJykpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIOWFiOafpeaJvuevgOm7nuS4iuaYr+WQpuW3suWtmOWcqOipsuiFs+acrOe1hOS7tlxuICAgICAgICAgICAgY29uc3QgYWxsQ29tcG9uZW50c0luZm8gPSBhd2FpdCB0aGlzLmdldENvbXBvbmVudHMobm9kZVV1aWQpO1xuICAgICAgICAgICAgaWYgKGFsbENvbXBvbmVudHNJbmZvLnN1Y2Nlc3MgJiYgYWxsQ29tcG9uZW50c0luZm8uZGF0YT8uY29tcG9uZW50cykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGV4aXN0aW5nU2NyaXB0ID0gYWxsQ29tcG9uZW50c0luZm8uZGF0YS5jb21wb25lbnRzLmZpbmQoKGNvbXA6IGFueSkgPT4gY29tcC50eXBlID09PSBzY3JpcHROYW1lKTtcbiAgICAgICAgICAgICAgICBpZiAoZXhpc3RpbmdTY3JpcHQpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWQ6IG5vZGVVdWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudE5hbWU6IHNjcmlwdE5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZXhpc3Rpbmc6IHRydWVcbiAgICAgICAgICAgICAgICAgICAgICAgIH0sIGBTY3JpcHQgJyR7c2NyaXB0TmFtZX0nIGFscmVhZHkgZXhpc3RzIG9uIG5vZGVgKSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyDpppblhYjlmpDoqabnm7TmjqXkvb/nlKjohbPmnKzlkI3nqLHkvZzngrrntYTku7bpoZ7lnotcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ2NyZWF0ZS1jb21wb25lbnQnLCB7XG4gICAgICAgICAgICAgICAgdXVpZDogbm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgY29tcG9uZW50OiBzY3JpcHROYW1lICAvLyDkvb/nlKjohbPmnKzlkI3nqLHogIzpnZ5VVUlEXG4gICAgICAgICAgICB9KS50aGVuKGFzeW5jIChyZXN1bHQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIC8vIOetieW+heS4gOauteaZgumWk+iuk0VkaXRvcuWujOaIkOe1hOS7tua3u+WKoFxuICAgICAgICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxMDApKTtcbiAgICAgICAgICAgICAgICAvLyDph43mlrDmn6XoqaLnr4Dpu57kv6Hmga/pqZforYnohbPmnKzmmK/lkKbnnJ/nmoTmt7vliqDmiJDlip9cbiAgICAgICAgICAgICAgICBjb25zdCBhbGxDb21wb25lbnRzSW5mbzIgPSBhd2FpdCB0aGlzLmdldENvbXBvbmVudHMobm9kZVV1aWQpO1xuICAgICAgICAgICAgICAgIGlmIChhbGxDb21wb25lbnRzSW5mbzIuc3VjY2VzcyAmJiBhbGxDb21wb25lbnRzSW5mbzIuZGF0YT8uY29tcG9uZW50cykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBhZGRlZFNjcmlwdCA9IGFsbENvbXBvbmVudHNJbmZvMi5kYXRhLmNvbXBvbmVudHMuZmluZCgoY29tcDogYW55KSA9PiBjb21wLnR5cGUgPT09IHNjcmlwdE5hbWUpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoYWRkZWRTY3JpcHQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBub2RlVXVpZDogbm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudE5hbWU6IHNjcmlwdE5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4aXN0aW5nOiBmYWxzZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0sIGBTY3JpcHQgJyR7c2NyaXB0TmFtZX0nIGF0dGFjaGVkIHN1Y2Nlc3NmdWxseWApKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChgU2NyaXB0ICcke3NjcmlwdE5hbWV9JyB3YXMgbm90IGZvdW5kIG9uIG5vZGUgYWZ0ZXIgYWRkaXRpb24uIEF2YWlsYWJsZSBjb21wb25lbnRzOiAke2FsbENvbXBvbmVudHNJbmZvMi5kYXRhLmNvbXBvbmVudHMubWFwKChjOiBhbnkpID0+IGMudHlwZSkuam9pbignLCAnKX1gKSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoYEZhaWxlZCB0byB2ZXJpZnkgc2NyaXB0IGFkZGl0aW9uOiAke2FsbENvbXBvbmVudHNJbmZvMi5lcnJvciB8fCAnVW5hYmxlIHRvIGdldCBub2RlIGNvbXBvbmVudHMnfWApKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIC8vIOWCmeeUqOaWueahiO+8muS9v+eUqOWgtOaZr+iFs+acrFxuICAgICAgICAgICAgICAgIHJ1blNjZW5lTWV0aG9kKCdhdHRhY2hTY3JpcHQnLCBbbm9kZVV1aWQsIHNjcmlwdFBhdGhdKS50aGVuKChyZXN1bHQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgfSkuY2F0Y2goKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHsgXG4gICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSwgXG4gICAgICAgICAgICAgICAgICAgICAgICBlcnJvcjogYEZhaWxlZCB0byBhdHRhY2ggc2NyaXB0ICcke3NjcmlwdE5hbWV9JzogJHtlcnIubWVzc2FnZX1gLFxuICAgICAgICAgICAgICAgICAgICAgICAgaW5zdHJ1Y3Rpb246ICdQbGVhc2UgZW5zdXJlIHRoZSBzY3JpcHQgaXMgcHJvcGVybHkgY29tcGlsZWQgYW5kIGV4cG9ydGVkIGFzIGEgQ29tcG9uZW50IGNsYXNzLiBZb3UgY2FuIGFsc28gbWFudWFsbHkgYXR0YWNoIHRoZSBzY3JpcHQgdGhyb3VnaCB0aGUgUHJvcGVydGllcyBwYW5lbCBpbiB0aGUgZWRpdG9yLidcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRBdmFpbGFibGVDb21wb25lbnRzKGNhdGVnb3J5OiBzdHJpbmcgPSAnYWxsJyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IGNvbXBvbmVudENhdGVnb3JpZXM6IFJlY29yZDxzdHJpbmcsIHN0cmluZ1tdPiA9IHtcbiAgICAgICAgICAgIHJlbmRlcmVyOiBbJ2NjLlNwcml0ZScsICdjYy5MYWJlbCcsICdjYy5SaWNoVGV4dCcsICdjYy5NYXNrJywgJ2NjLkdyYXBoaWNzJ10sXG4gICAgICAgICAgICB1aTogWydjYy5CdXR0b24nLCAnY2MuVG9nZ2xlJywgJ2NjLlNsaWRlcicsICdjYy5TY3JvbGxWaWV3JywgJ2NjLkVkaXRCb3gnLCAnY2MuUHJvZ3Jlc3NCYXInXSxcbiAgICAgICAgICAgIHBoeXNpY3M6IFsnY2MuUmlnaWRCb2R5MkQnLCAnY2MuQm94Q29sbGlkZXIyRCcsICdjYy5DaXJjbGVDb2xsaWRlcjJEJywgJ2NjLlBvbHlnb25Db2xsaWRlcjJEJ10sXG4gICAgICAgICAgICBhbmltYXRpb246IFsnY2MuQW5pbWF0aW9uJywgJ2NjLkFuaW1hdGlvbkNsaXAnLCAnY2MuU2tlbGV0YWxBbmltYXRpb24nXSxcbiAgICAgICAgICAgIGF1ZGlvOiBbJ2NjLkF1ZGlvU291cmNlJ10sXG4gICAgICAgICAgICBsYXlvdXQ6IFsnY2MuTGF5b3V0JywgJ2NjLldpZGdldCcsICdjYy5QYWdlVmlldycsICdjYy5QYWdlVmlld0luZGljYXRvciddLFxuICAgICAgICAgICAgZWZmZWN0czogWydjYy5Nb3Rpb25TdHJlYWsnLCAnY2MuUGFydGljbGVTeXN0ZW0yRCddLFxuICAgICAgICAgICAgY2FtZXJhOiBbJ2NjLkNhbWVyYSddLFxuICAgICAgICAgICAgbGlnaHQ6IFsnY2MuTGlnaHQnLCAnY2MuRGlyZWN0aW9uYWxMaWdodCcsICdjYy5Qb2ludExpZ2h0JywgJ2NjLlNwb3RMaWdodCddXG4gICAgICAgIH07XG5cbiAgICAgICAgbGV0IGNvbXBvbmVudHM6IHN0cmluZ1tdID0gW107XG4gICAgICAgIFxuICAgICAgICBpZiAoY2F0ZWdvcnkgPT09ICdhbGwnKSB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGNhdCBpbiBjb21wb25lbnRDYXRlZ29yaWVzKSB7XG4gICAgICAgICAgICAgICAgY29tcG9uZW50cyA9IGNvbXBvbmVudHMuY29uY2F0KGNvbXBvbmVudENhdGVnb3JpZXNbY2F0XSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoY29tcG9uZW50Q2F0ZWdvcmllc1tjYXRlZ29yeV0pIHtcbiAgICAgICAgICAgIGNvbXBvbmVudHMgPSBjb21wb25lbnRDYXRlZ29yaWVzW2NhdGVnb3J5XTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgY2F0ZWdvcnk6IGNhdGVnb3J5LFxuICAgICAgICAgICAgICAgIGNvbXBvbmVudHM6IGNvbXBvbmVudHNcbiAgICAgICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgaXNWYWxpZFByb3BlcnR5RGVzY3JpcHRvcihwcm9wRGF0YTogYW55KTogYm9vbGVhbiB7XG4gICAgICAgIC8vIOaqouafpeaYr+WQpuaYr+acieaViOeahOWxrOaAp+aPj+i/sOWwjeixoVxuICAgICAgICBpZiAodHlwZW9mIHByb3BEYXRhICE9PSAnb2JqZWN0JyB8fCBwcm9wRGF0YSA9PT0gbnVsbCkge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3Qga2V5cyA9IE9iamVjdC5rZXlzKHByb3BEYXRhKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8g6YG/5YWN6YGN5q2357Ch5Zau55qE5pW45YC85bCN6LGh77yI5aaCIHt3aWR0aDogMjAwLCBoZWlnaHQ6IDE1MH3vvIlcbiAgICAgICAgICAgIGNvbnN0IGlzU2ltcGxlVmFsdWVPYmplY3QgPSBrZXlzLmV2ZXJ5KGtleSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgdmFsdWUgPSBwcm9wRGF0YVtrZXldO1xuICAgICAgICAgICAgICAgIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInIHx8IHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgfHwgdHlwZW9mIHZhbHVlID09PSAnYm9vbGVhbic7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgaWYgKGlzU2ltcGxlVmFsdWVPYmplY3QpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIOaqouafpeaYr+WQpuWMheWQq+WxrOaAp+aPj+i/sOespueahOeJueW+teWtl+aute+8jOS4jeS9v+eUqCdpbifmk43kvZznrKZcbiAgICAgICAgICAgIGNvbnN0IGhhc05hbWUgPSBrZXlzLmluY2x1ZGVzKCduYW1lJyk7XG4gICAgICAgICAgICBjb25zdCBoYXNWYWx1ZSA9IGtleXMuaW5jbHVkZXMoJ3ZhbHVlJyk7XG4gICAgICAgICAgICBjb25zdCBoYXNUeXBlID0ga2V5cy5pbmNsdWRlcygndHlwZScpO1xuICAgICAgICAgICAgY29uc3QgaGFzRGlzcGxheU5hbWUgPSBrZXlzLmluY2x1ZGVzKCdkaXNwbGF5TmFtZScpO1xuICAgICAgICAgICAgY29uc3QgaGFzUmVhZG9ubHkgPSBrZXlzLmluY2x1ZGVzKCdyZWFkb25seScpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyDlv4XpoIjljIXlkKtuYW1l5oiWdmFsdWXlrZfmrrXvvIzkuJTpgJrluLjpgoTmnIl0eXBl5a2X5q61XG4gICAgICAgICAgICBjb25zdCBoYXNWYWxpZFN0cnVjdHVyZSA9IChoYXNOYW1lIHx8IGhhc1ZhbHVlKSAmJiAoaGFzVHlwZSB8fCBoYXNEaXNwbGF5TmFtZSB8fCBoYXNSZWFkb25seSk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIOmhjeWkluaqouafpe+8muWmguaenOaciWRlZmF1bHTlrZfmrrXkuJTntZDmp4vopIfpm5zvvIzpgb/lhY3mt7HluqbpgY3mrbdcbiAgICAgICAgICAgIGlmIChrZXlzLmluY2x1ZGVzKCdkZWZhdWx0JykgJiYgcHJvcERhdGEuZGVmYXVsdCAmJiB0eXBlb2YgcHJvcERhdGEuZGVmYXVsdCA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBkZWZhdWx0S2V5cyA9IE9iamVjdC5rZXlzKHByb3BEYXRhLmRlZmF1bHQpO1xuICAgICAgICAgICAgICAgIGlmIChkZWZhdWx0S2V5cy5pbmNsdWRlcygndmFsdWUnKSAmJiB0eXBlb2YgcHJvcERhdGEuZGVmYXVsdC52YWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8g6YCZ56iu5oOF5rOB5LiL77yM5oiR5YCR5Y+q6L+U5Zue6aCC5bGk5bGs5oCn77yM5LiN5rex5YWl6YGN5q23ZGVmYXVsdC52YWx1ZVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gaGFzVmFsaWRTdHJ1Y3R1cmU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICByZXR1cm4gaGFzVmFsaWRTdHJ1Y3R1cmU7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oYFtpc1ZhbGlkUHJvcGVydHlEZXNjcmlwdG9yXSBFcnJvciBjaGVja2luZyBwcm9wZXJ0eSBkZXNjcmlwdG9yOmAsIGVycm9yKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYW5hbHl6ZVByb3BlcnR5KGNvbXBvbmVudDogYW55LCBwcm9wZXJ0eU5hbWU6IHN0cmluZyk6IHsgZXhpc3RzOiBib29sZWFuOyB0eXBlOiBzdHJpbmc7IGF2YWlsYWJsZVByb3BlcnRpZXM6IHN0cmluZ1tdOyBvcmlnaW5hbFZhbHVlOiBhbnk7IG1ldGFUeXBlPzogc3RyaW5nOyBtZXRhRXh0ZW5kcz86IHN0cmluZ1tdIH0ge1xuICAgICAgICAvLyDlvp7opIfpm5znmoTntYTku7bntZDmp4vkuK3mj5Dlj5blj6/nlKjlsazmgKdcbiAgICAgICAgY29uc3QgYXZhaWxhYmxlUHJvcGVydGllczogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgbGV0IHByb3BlcnR5VmFsdWU6IGFueSA9IHVuZGVmaW5lZDtcbiAgICAgICAgbGV0IHByb3BlcnR5RXhpc3RzID0gZmFsc2U7XG4gICAgICAgIGxldCBtZXRhVHlwZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICAgICAgICBsZXQgbWV0YUV4dGVuZHM6IHN0cmluZ1tdIHwgdW5kZWZpbmVkO1xuXG4gICAgICAgIGNvbnN0IGNhcHR1cmVNZXRhID0gKHByb3BJbmZvOiBhbnkpID0+IHtcbiAgICAgICAgICAgIGlmICghcHJvcEluZm8gfHwgdHlwZW9mIHByb3BJbmZvICE9PSAnb2JqZWN0JykgcmV0dXJuO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBwcm9wSW5mby50eXBlID09PSAnc3RyaW5nJykgbWV0YVR5cGUgPSBwcm9wSW5mby50eXBlO1xuICAgICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkocHJvcEluZm8uZXh0ZW5kcykpIHtcbiAgICAgICAgICAgICAgICBtZXRhRXh0ZW5kcyA9IHByb3BJbmZvLmV4dGVuZHMuZmlsdGVyKChzOiBhbnkpID0+IHR5cGVvZiBzID09PSAnc3RyaW5nJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgLy8g5ZiX6Kmm5aSa56iu5pa55byP5p+l5om+5bGs5oCn77yaXG4gICAgICAgIC8vIDEuIOebtOaOpeWxrOaAp+ioquWVj1xuICAgICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGNvbXBvbmVudCwgcHJvcGVydHlOYW1lKSkge1xuICAgICAgICAgICAgcHJvcGVydHlWYWx1ZSA9IGNvbXBvbmVudFtwcm9wZXJ0eU5hbWVdO1xuICAgICAgICAgICAgcHJvcGVydHlFeGlzdHMgPSB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gMi4g5b6e5bWM5aWX57WQ5qeL5Lit5p+l5om+ICjlpoLlvp7muKzoqabmlbjmk5rnnIvliLDnmoTopIfpm5zntZDmp4spXG4gICAgICAgIGlmICghcHJvcGVydHlFeGlzdHMgJiYgY29tcG9uZW50LnByb3BlcnRpZXMgJiYgdHlwZW9mIGNvbXBvbmVudC5wcm9wZXJ0aWVzID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgLy8g6aaW5YWI5qqi5p+lcHJvcGVydGllcy52YWx1ZeaYr+WQpuWtmOWcqO+8iOmAmeaYr+aIkeWAkeWcqGdldENvbXBvbmVudHPkuK3nnIvliLDnmoTntZDmp4vvvIlcbiAgICAgICAgICAgIGlmIChjb21wb25lbnQucHJvcGVydGllcy52YWx1ZSAmJiB0eXBlb2YgY29tcG9uZW50LnByb3BlcnRpZXMudmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdmFsdWVPYmogPSBjb21wb25lbnQucHJvcGVydGllcy52YWx1ZTtcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IFtrZXksIHByb3BEYXRhXSBvZiBPYmplY3QuZW50cmllcyh2YWx1ZU9iaikpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8g5qqi5p+lcHJvcERhdGHmmK/lkKbmmK/kuIDlgIvmnInmlYjnmoTlsazmgKfmj4/ov7DlsI3osaFcbiAgICAgICAgICAgICAgICAgICAgLy8g56K65L+dcHJvcERhdGHmmK/lsI3osaHkuJTljIXlkKvpoJDmnJ/nmoTlsazmgKfntZDmp4tcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuaXNWYWxpZFByb3BlcnR5RGVzY3JpcHRvcihwcm9wRGF0YSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHByb3BJbmZvID0gcHJvcERhdGEgYXMgYW55O1xuICAgICAgICAgICAgICAgICAgICAgICAgYXZhaWxhYmxlUHJvcGVydGllcy5wdXNoKGtleSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoa2V5ID09PSBwcm9wZXJ0eU5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDlhKrlhYjkvb/nlKh2YWx1ZeWxrOaAp++8jOWmguaenOaykuacieWJh+S9v+eUqHByb3BEYXRh5pys6LqrXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcHJvcEtleXMgPSBPYmplY3Qua2V5cyhwcm9wSW5mbyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb3BlcnR5VmFsdWUgPSBwcm9wS2V5cy5pbmNsdWRlcygndmFsdWUnKSA/IHByb3BJbmZvLnZhbHVlIDogcHJvcEluZm87XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5aaC5p6c5qqi5p+l5aSx5pWX77yM55u05o6l5L2/55SocHJvcEluZm9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvcGVydHlWYWx1ZSA9IHByb3BJbmZvO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYXB0dXJlTWV0YShwcm9wSW5mbyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvcGVydHlFeGlzdHMgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyDlgpnnlKjmlrnmoYjvvJrnm7TmjqXlvp5wcm9wZXJ0aWVz5p+l5om+XG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCBba2V5LCBwcm9wRGF0YV0gb2YgT2JqZWN0LmVudHJpZXMoY29tcG9uZW50LnByb3BlcnRpZXMpKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLmlzVmFsaWRQcm9wZXJ0eURlc2NyaXB0b3IocHJvcERhdGEpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBwcm9wSW5mbyA9IHByb3BEYXRhIGFzIGFueTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGF2YWlsYWJsZVByb3BlcnRpZXMucHVzaChrZXkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGtleSA9PT0gcHJvcGVydHlOYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5YSq5YWI5L2/55SodmFsdWXlsazmgKfvvIzlpoLmnpzmspLmnInliYfkvb/nlKhwcm9wRGF0YeacrOi6q1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHByb3BLZXlzID0gT2JqZWN0LmtleXMocHJvcEluZm8pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0eVZhbHVlID0gcHJvcEtleXMuaW5jbHVkZXMoJ3ZhbHVlJykgPyBwcm9wSW5mby52YWx1ZSA6IHByb3BJbmZvO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOWmguaenOaqouafpeWkseaVl++8jOebtOaOpeS9v+eUqHByb3BJbmZvXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb3BlcnR5VmFsdWUgPSBwcm9wSW5mbztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2FwdHVyZU1ldGEocHJvcEluZm8pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb3BlcnR5RXhpc3RzID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgLy8gMy4g5b6e55u05o6l5bGs5oCn5Lit5o+Q5Y+W57Ch5Zau5bGs5oCn5ZCNXG4gICAgICAgIGlmIChhdmFpbGFibGVQcm9wZXJ0aWVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMoY29tcG9uZW50KSkge1xuICAgICAgICAgICAgICAgIGlmICgha2V5LnN0YXJ0c1dpdGgoJ18nKSAmJiAhWydfX3R5cGVfXycsICdjaWQnLCAnbm9kZScsICd1dWlkJywgJ25hbWUnLCAnZW5hYmxlZCcsICd0eXBlJywgJ3JlYWRvbmx5JywgJ3Zpc2libGUnXS5pbmNsdWRlcyhrZXkpKSB7XG4gICAgICAgICAgICAgICAgICAgIGF2YWlsYWJsZVByb3BlcnRpZXMucHVzaChrZXkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgaWYgKCFwcm9wZXJ0eUV4aXN0cykge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBleGlzdHM6IGZhbHNlLFxuICAgICAgICAgICAgICAgIHR5cGU6ICd1bmtub3duJyxcbiAgICAgICAgICAgICAgICBhdmFpbGFibGVQcm9wZXJ0aWVzLFxuICAgICAgICAgICAgICAgIG9yaWdpbmFsVmFsdWU6IHVuZGVmaW5lZFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgbGV0IHR5cGUgPSAndW5rbm93bic7XG4gICAgICAgIFxuICAgICAgICAvLyDmmbrog73poZ7lnovmqqLmuKxcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkocHJvcGVydHlWYWx1ZSkpIHtcbiAgICAgICAgICAgIC8vIOaVuOe1hOmhnuWei+aqoua4rFxuICAgICAgICAgICAgaWYgKHByb3BlcnR5TmFtZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdub2RlJykpIHtcbiAgICAgICAgICAgICAgICB0eXBlID0gJ25vZGVBcnJheSc7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5TmFtZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdjb2xvcicpKSB7XG4gICAgICAgICAgICAgICAgdHlwZSA9ICdjb2xvckFycmF5JztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdHlwZSA9ICdhcnJheSc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIHByb3BlcnR5VmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAvLyBDaGVjayBpZiBwcm9wZXJ0eSBuYW1lIHN1Z2dlc3RzIGl0J3MgYW4gYXNzZXRcbiAgICAgICAgICAgIGlmIChbJ3Nwcml0ZUZyYW1lJywgJ3RleHR1cmUnLCAnbWF0ZXJpYWwnLCAnZm9udCcsICdjbGlwJywgJ3ByZWZhYiddLmluY2x1ZGVzKHByb3BlcnR5TmFtZS50b0xvd2VyQ2FzZSgpKSkge1xuICAgICAgICAgICAgICAgIHR5cGUgPSAnYXNzZXQnO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0eXBlID0gJ3N0cmluZyc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIHByb3BlcnR5VmFsdWUgPT09ICdudW1iZXInKSB7XG4gICAgICAgICAgICB0eXBlID0gJ251bWJlcic7XG4gICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIHByb3BlcnR5VmFsdWUgPT09ICdib29sZWFuJykge1xuICAgICAgICAgICAgdHlwZSA9ICdib29sZWFuJztcbiAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eVZhbHVlICYmIHR5cGVvZiBwcm9wZXJ0eVZhbHVlID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCBrZXlzID0gT2JqZWN0LmtleXMocHJvcGVydHlWYWx1ZSk7XG4gICAgICAgICAgICAgICAgaWYgKGtleXMuaW5jbHVkZXMoJ3InKSAmJiBrZXlzLmluY2x1ZGVzKCdnJykgJiYga2V5cy5pbmNsdWRlcygnYicpKSB7XG4gICAgICAgICAgICAgICAgICAgIHR5cGUgPSAnY29sb3InO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoa2V5cy5pbmNsdWRlcygneCcpICYmIGtleXMuaW5jbHVkZXMoJ3knKSkge1xuICAgICAgICAgICAgICAgICAgICB0eXBlID0gcHJvcGVydHlWYWx1ZS56ICE9PSB1bmRlZmluZWQgPyAndmVjMycgOiAndmVjMic7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChrZXlzLmluY2x1ZGVzKCd3aWR0aCcpICYmIGtleXMuaW5jbHVkZXMoJ2hlaWdodCcpKSB7XG4gICAgICAgICAgICAgICAgICAgIHR5cGUgPSAnc2l6ZSc7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChrZXlzLmluY2x1ZGVzKCd1dWlkJykgfHwga2V5cy5pbmNsdWRlcygnX191dWlkX18nKSkge1xuICAgICAgICAgICAgICAgICAgICAvLyDmqqLmn6XmmK/lkKbmmK/nr4Dpu57lvJXnlKjvvIjpgJrpgY7lsazmgKflkI3miJZfX2lkX1/lsazmgKfliKTmlrfvvIlcbiAgICAgICAgICAgICAgICAgICAgaWYgKHByb3BlcnR5TmFtZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdub2RlJykgfHwgXG4gICAgICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0eU5hbWUudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygndGFyZ2V0JykgfHxcbiAgICAgICAgICAgICAgICAgICAgICAgIGtleXMuaW5jbHVkZXMoJ19faWRfXycpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlID0gJ25vZGUnO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZSA9ICdhc3NldCc7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGtleXMuaW5jbHVkZXMoJ19faWRfXycpKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIOevgOm7nuW8leeUqOeJueW+tVxuICAgICAgICAgICAgICAgICAgICB0eXBlID0gJ25vZGUnO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHR5cGUgPSAnb2JqZWN0JztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybihgW2FuYWx5emVQcm9wZXJ0eV0gRXJyb3IgY2hlY2tpbmcgcHJvcGVydHkgdHlwZSBmb3I6ICR7SlNPTi5zdHJpbmdpZnkocHJvcGVydHlWYWx1ZSl9YCk7XG4gICAgICAgICAgICAgICAgdHlwZSA9ICdvYmplY3QnO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5VmFsdWUgPT09IG51bGwgfHwgcHJvcGVydHlWYWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAvLyBGb3IgbnVsbC91bmRlZmluZWQgdmFsdWVzLCBjaGVjayBwcm9wZXJ0eSBuYW1lIHRvIGRldGVybWluZSB0eXBlXG4gICAgICAgICAgICBpZiAoWydzcHJpdGVGcmFtZScsICd0ZXh0dXJlJywgJ21hdGVyaWFsJywgJ2ZvbnQnLCAnY2xpcCcsICdwcmVmYWInXS5pbmNsdWRlcyhwcm9wZXJ0eU5hbWUudG9Mb3dlckNhc2UoKSkpIHtcbiAgICAgICAgICAgICAgICB0eXBlID0gJ2Fzc2V0JztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlOYW1lLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ25vZGUnKSB8fCBcbiAgICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0eU5hbWUudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygndGFyZ2V0JykpIHtcbiAgICAgICAgICAgICAgICB0eXBlID0gJ25vZGUnO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eU5hbWUudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnY29tcG9uZW50JykpIHtcbiAgICAgICAgICAgICAgICB0eXBlID0gJ2NvbXBvbmVudCc7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHR5cGUgPSAndW5rbm93bic7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBleGlzdHM6IHRydWUsXG4gICAgICAgICAgICB0eXBlLFxuICAgICAgICAgICAgYXZhaWxhYmxlUHJvcGVydGllcyxcbiAgICAgICAgICAgIG9yaWdpbmFsVmFsdWU6IHByb3BlcnR5VmFsdWUsXG4gICAgICAgICAgICBtZXRhVHlwZSxcbiAgICAgICAgICAgIG1ldGFFeHRlbmRzLFxuICAgICAgICB9O1xuICAgIH1cblxuICAgIHByaXZhdGUgZGV0ZWN0UHJvcGVydHlUeXBlTWlzbWF0Y2goXG4gICAgICAgIHByb3BlcnR5SW5mbzogeyBtZXRhVHlwZT86IHN0cmluZzsgbWV0YUV4dGVuZHM/OiBzdHJpbmdbXSB9LFxuICAgICAgICBwcm9wZXJ0eVR5cGU6IHN0cmluZyxcbiAgICAgICAgbm9kZVV1aWQ6IHN0cmluZyxcbiAgICAgICAgY29tcG9uZW50VHlwZTogc3RyaW5nLFxuICAgICAgICBwcm9wZXJ0eTogc3RyaW5nLFxuICAgICk6IFRvb2xSZXNwb25zZSB8IG51bGwge1xuICAgICAgICBjb25zdCB7IG1ldGFUeXBlLCBtZXRhRXh0ZW5kcyB9ID0gcHJvcGVydHlJbmZvO1xuICAgICAgICBpZiAoIW1ldGFUeXBlICYmICghbWV0YUV4dGVuZHMgfHwgbWV0YUV4dGVuZHMubGVuZ3RoID09PSAwKSkgcmV0dXJuIG51bGw7XG5cbiAgICAgICAgY29uc3QgZXh0ZW5kc0xpc3QgPSBtZXRhRXh0ZW5kcyA/PyBbXTtcbiAgICAgICAgY29uc3QgaXNOb2RlUmVmID0gbWV0YVR5cGUgPT09ICdjYy5Ob2RlJztcbiAgICAgICAgY29uc3QgaXNDb21wb25lbnRSZWYgPSAhaXNOb2RlUmVmICYmIGV4dGVuZHNMaXN0LmluY2x1ZGVzKCdjYy5Db21wb25lbnQnKTtcbiAgICAgICAgY29uc3QgaXNBc3NldFJlZiA9ICFpc05vZGVSZWYgJiYgIWlzQ29tcG9uZW50UmVmICYmIGV4dGVuZHNMaXN0LmluY2x1ZGVzKCdjYy5Bc3NldCcpO1xuICAgICAgICBpZiAoIWlzTm9kZVJlZiAmJiAhaXNDb21wb25lbnRSZWYgJiYgIWlzQXNzZXRSZWYpIHJldHVybiBudWxsO1xuXG4gICAgICAgIGNvbnN0IGV4cGVjdGVkS2luZCA9IGlzTm9kZVJlZiA/ICdub2RlJyA6IGlzQ29tcG9uZW50UmVmID8gJ2NvbXBvbmVudCcgOiAnYXNzZXQnO1xuICAgICAgICBjb25zdCB1c2VyS2luZCA9XG4gICAgICAgICAgICBwcm9wZXJ0eVR5cGUgPT09ICdzcHJpdGVGcmFtZScgfHwgcHJvcGVydHlUeXBlID09PSAncHJlZmFiJyB8fCBwcm9wZXJ0eVR5cGUgPT09ICdhc3NldCcgPyAnYXNzZXQnXG4gICAgICAgICAgICA6IHByb3BlcnR5VHlwZSA9PT0gJ25vZGUnID8gJ25vZGUnXG4gICAgICAgICAgICA6IHByb3BlcnR5VHlwZSA9PT0gJ2NvbXBvbmVudCcgPyAnY29tcG9uZW50J1xuICAgICAgICAgICAgOiBudWxsO1xuICAgICAgICBpZiAoIXVzZXJLaW5kIHx8IHVzZXJLaW5kID09PSBleHBlY3RlZEtpbmQpIHJldHVybiBudWxsO1xuXG4gICAgICAgIGNvbnN0IGV4cGVjdGVkVHlwZU5hbWUgPSBtZXRhVHlwZSA/PyAnKHVua25vd24pJztcbiAgICAgICAgbGV0IHN1Z2dlc3RlZFByb3BlcnR5VHlwZTogc3RyaW5nO1xuICAgICAgICBsZXQgdmFsdWVIaW50OiBzdHJpbmc7XG4gICAgICAgIGlmIChpc0NvbXBvbmVudFJlZikge1xuICAgICAgICAgICAgc3VnZ2VzdGVkUHJvcGVydHlUeXBlID0gJ2NvbXBvbmVudCc7XG4gICAgICAgICAgICB2YWx1ZUhpbnQgPSBgdGhlIFVVSUQgb2YgdGhlIE5PREUgdGhhdCBob3N0cyB0aGUgJHtleHBlY3RlZFR5cGVOYW1lfSBjb21wb25lbnQgKHRoZSBzZXJ2ZXIgcmVzb2x2ZXMgdGhlIGNvbXBvbmVudCdzIHNjZW5lIF9faWRfXyBmb3IgeW91KWA7XG4gICAgICAgIH0gZWxzZSBpZiAoaXNOb2RlUmVmKSB7XG4gICAgICAgICAgICBzdWdnZXN0ZWRQcm9wZXJ0eVR5cGUgPSAnbm9kZSc7XG4gICAgICAgICAgICB2YWx1ZUhpbnQgPSBcInRoZSB0YXJnZXQgbm9kZSdzIFVVSURcIjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHN1Z2dlc3RlZFByb3BlcnR5VHlwZSA9XG4gICAgICAgICAgICAgICAgZXhwZWN0ZWRUeXBlTmFtZSA9PT0gJ2NjLlNwcml0ZUZyYW1lJyA/ICdzcHJpdGVGcmFtZSdcbiAgICAgICAgICAgICAgICA6IGV4cGVjdGVkVHlwZU5hbWUgPT09ICdjYy5QcmVmYWInID8gJ3ByZWZhYidcbiAgICAgICAgICAgICAgICA6ICdhc3NldCc7XG4gICAgICAgICAgICB2YWx1ZUhpbnQgPSBgdGhlIGFzc2V0IFVVSUQgKHR5cGU6ICR7ZXhwZWN0ZWRUeXBlTmFtZX0pYDtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgIGVycm9yOiBgcHJvcGVydHlUeXBlIG1pc21hdGNoOiAnJHtjb21wb25lbnRUeXBlfS4ke3Byb3BlcnR5fScgaXMgYSAke2V4cGVjdGVkS2luZH0gcmVmZXJlbmNlIChtZXRhZGF0YSB0eXBlOiAke2V4cGVjdGVkVHlwZU5hbWV9KSwgYnV0IHlvdSBwYXNzZWQgcHJvcGVydHlUeXBlOiAnJHtwcm9wZXJ0eVR5cGV9Jy5gLFxuICAgICAgICAgICAgaW5zdHJ1Y3Rpb246IGBVc2UgcHJvcGVydHlUeXBlOiAnJHtzdWdnZXN0ZWRQcm9wZXJ0eVR5cGV9JyB3aXRoICR7dmFsdWVIaW50fS5cXG5FeGFtcGxlOiBzZXRfY29tcG9uZW50X3Byb3BlcnR5KG5vZGVVdWlkPVwiJHtub2RlVXVpZH1cIiwgY29tcG9uZW50VHlwZT1cIiR7Y29tcG9uZW50VHlwZX1cIiwgcHJvcGVydHk9XCIke3Byb3BlcnR5fVwiLCBwcm9wZXJ0eVR5cGU9XCIke3N1Z2dlc3RlZFByb3BlcnR5VHlwZX1cIiwgdmFsdWU9XCI8dXVpZD5cIilgLFxuICAgICAgICB9O1xuICAgIH1cblxuICAgIHByaXZhdGUgc21hcnRDb252ZXJ0VmFsdWUoaW5wdXRWYWx1ZTogYW55LCBwcm9wZXJ0eUluZm86IGFueSk6IGFueSB7XG4gICAgICAgIGNvbnN0IHsgdHlwZSwgb3JpZ2luYWxWYWx1ZSB9ID0gcHJvcGVydHlJbmZvO1xuICAgICAgICBcbiAgICAgICAgZGVidWdMb2coYFtzbWFydENvbnZlcnRWYWx1ZV0gQ29udmVydGluZyAke0pTT04uc3RyaW5naWZ5KGlucHV0VmFsdWUpfSB0byB0eXBlOiAke3R5cGV9YCk7XG4gICAgICAgIFxuICAgICAgICBzd2l0Y2ggKHR5cGUpIHtcbiAgICAgICAgICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIFN0cmluZyhpbnB1dFZhbHVlKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIGNhc2UgJ251bWJlcic6XG4gICAgICAgICAgICAgICAgcmV0dXJuIE51bWJlcihpbnB1dFZhbHVlKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgaW5wdXRWYWx1ZSA9PT0gJ2Jvb2xlYW4nKSByZXR1cm4gaW5wdXRWYWx1ZTtcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGlucHV0VmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBpbnB1dFZhbHVlLnRvTG93ZXJDYXNlKCkgPT09ICd0cnVlJyB8fCBpbnB1dFZhbHVlID09PSAnMSc7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBCb29sZWFuKGlucHV0VmFsdWUpO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgY2FzZSAnY29sb3InOlxuICAgICAgICAgICAgICAgIC8vIOWEquWMlueahOmhj+iJsuiZleeQhu+8jOaUr+aMgeWkmueorui8uOWFpeagvOW8j1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgaW5wdXRWYWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8g5a2X56ym5Liy5qC85byP77ya5Y2B5YWt6YCy5Yi244CB6aGP6Imy5ZCN56ix44CBcmdiKCkvcmdiYSgpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLnBhcnNlQ29sb3JTdHJpbmcoaW5wdXRWYWx1ZSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgaW5wdXRWYWx1ZSA9PT0gJ29iamVjdCcgJiYgaW5wdXRWYWx1ZSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgaW5wdXRLZXlzID0gT2JqZWN0LmtleXMoaW5wdXRWYWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyDlpoLmnpzovLjlhaXmmK/poY/oibLlsI3osaHvvIzpqZforYnkuKbovYnmj5tcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpbnB1dEtleXMuaW5jbHVkZXMoJ3InKSB8fCBpbnB1dEtleXMuaW5jbHVkZXMoJ2cnKSB8fCBpbnB1dEtleXMuaW5jbHVkZXMoJ2InKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHI6IE1hdGgubWluKDI1NSwgTWF0aC5tYXgoMCwgTnVtYmVyKGlucHV0VmFsdWUucikgfHwgMCkpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBnOiBNYXRoLm1pbigyNTUsIE1hdGgubWF4KDAsIE51bWJlcihpbnB1dFZhbHVlLmcpIHx8IDApKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYjogTWF0aC5taW4oMjU1LCBNYXRoLm1heCgwLCBOdW1iZXIoaW5wdXRWYWx1ZS5iKSB8fCAwKSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGE6IGlucHV0VmFsdWUuYSAhPT0gdW5kZWZpbmVkID8gTWF0aC5taW4oMjU1LCBNYXRoLm1heCgwLCBOdW1iZXIoaW5wdXRWYWx1ZS5hKSkpIDogMjU1XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybihgW3NtYXJ0Q29udmVydFZhbHVlXSBJbnZhbGlkIGNvbG9yIG9iamVjdDogJHtKU09OLnN0cmluZ2lmeShpbnB1dFZhbHVlKX1gKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAvLyDlpoLmnpzmnInljp/lgLzvvIzkv53mjIHljp/lgLzntZDmp4vkuKbmm7TmlrDmj5DkvpvnmoTlgLxcbiAgICAgICAgICAgICAgICBpZiAob3JpZ2luYWxWYWx1ZSAmJiB0eXBlb2Ygb3JpZ2luYWxWYWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGlucHV0S2V5cyA9IHR5cGVvZiBpbnB1dFZhbHVlID09PSAnb2JqZWN0JyAmJiBpbnB1dFZhbHVlID8gT2JqZWN0LmtleXMoaW5wdXRWYWx1ZSkgOiBbXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcjogaW5wdXRLZXlzLmluY2x1ZGVzKCdyJykgPyBNYXRoLm1pbigyNTUsIE1hdGgubWF4KDAsIE51bWJlcihpbnB1dFZhbHVlLnIpKSkgOiAob3JpZ2luYWxWYWx1ZS5yIHx8IDI1NSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZzogaW5wdXRLZXlzLmluY2x1ZGVzKCdnJykgPyBNYXRoLm1pbigyNTUsIE1hdGgubWF4KDAsIE51bWJlcihpbnB1dFZhbHVlLmcpKSkgOiAob3JpZ2luYWxWYWx1ZS5nIHx8IDI1NSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYjogaW5wdXRLZXlzLmluY2x1ZGVzKCdiJykgPyBNYXRoLm1pbigyNTUsIE1hdGgubWF4KDAsIE51bWJlcihpbnB1dFZhbHVlLmIpKSkgOiAob3JpZ2luYWxWYWx1ZS5iIHx8IDI1NSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYTogaW5wdXRLZXlzLmluY2x1ZGVzKCdhJykgPyBNYXRoLm1pbigyNTUsIE1hdGgubWF4KDAsIE51bWJlcihpbnB1dFZhbHVlLmEpKSkgOiAob3JpZ2luYWxWYWx1ZS5hIHx8IDI1NSlcbiAgICAgICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oYFtzbWFydENvbnZlcnRWYWx1ZV0gRXJyb3IgcHJvY2Vzc2luZyBjb2xvciB3aXRoIG9yaWdpbmFsIHZhbHVlOiAke2Vycm9yfWApO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIC8vIOm7mOiqjei/lOWbnueZveiJslxuICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybihgW3NtYXJ0Q29udmVydFZhbHVlXSBVc2luZyBkZWZhdWx0IHdoaXRlIGNvbG9yIGZvciBpbnZhbGlkIGlucHV0OiAke0pTT04uc3RyaW5naWZ5KGlucHV0VmFsdWUpfWApO1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHI6IDI1NSwgZzogMjU1LCBiOiAyNTUsIGE6IDI1NSB9O1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgY2FzZSAndmVjMic6XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBpbnB1dFZhbHVlID09PSAnb2JqZWN0JyAmJiBpbnB1dFZhbHVlICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB4OiBOdW1iZXIoaW5wdXRWYWx1ZS54KSB8fCBvcmlnaW5hbFZhbHVlLnggfHwgMCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHk6IE51bWJlcihpbnB1dFZhbHVlLnkpIHx8IG9yaWdpbmFsVmFsdWUueSB8fCAwXG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBvcmlnaW5hbFZhbHVlO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgY2FzZSAndmVjMyc6XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBpbnB1dFZhbHVlID09PSAnb2JqZWN0JyAmJiBpbnB1dFZhbHVlICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB4OiBOdW1iZXIoaW5wdXRWYWx1ZS54KSB8fCBvcmlnaW5hbFZhbHVlLnggfHwgMCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHk6IE51bWJlcihpbnB1dFZhbHVlLnkpIHx8IG9yaWdpbmFsVmFsdWUueSB8fCAwLFxuICAgICAgICAgICAgICAgICAgICAgICAgejogTnVtYmVyKGlucHV0VmFsdWUueikgfHwgb3JpZ2luYWxWYWx1ZS56IHx8IDBcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIG9yaWdpbmFsVmFsdWU7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICBjYXNlICdzaXplJzpcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGlucHV0VmFsdWUgPT09ICdvYmplY3QnICYmIGlucHV0VmFsdWUgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdpZHRoOiBOdW1iZXIoaW5wdXRWYWx1ZS53aWR0aCkgfHwgb3JpZ2luYWxWYWx1ZS53aWR0aCB8fCAxMDAsXG4gICAgICAgICAgICAgICAgICAgICAgICBoZWlnaHQ6IE51bWJlcihpbnB1dFZhbHVlLmhlaWdodCkgfHwgb3JpZ2luYWxWYWx1ZS5oZWlnaHQgfHwgMTAwXG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBvcmlnaW5hbFZhbHVlO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgY2FzZSAnbm9kZSc6XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBpbnB1dFZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgICAgICAvLyDnr4Dpu57lvJXnlKjpnIDopoHnibnmroromZXnkIZcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGlucHV0VmFsdWU7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgaW5wdXRWYWx1ZSA9PT0gJ29iamVjdCcgJiYgaW5wdXRWYWx1ZSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICAvLyDlpoLmnpzlt7LntpPmmK/lsI3osaHlvaLlvI/vvIzov5Tlm55VVUlE5oiW5a6M5pW05bCN6LGhXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBpbnB1dFZhbHVlLnV1aWQgfHwgaW5wdXRWYWx1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIG9yaWdpbmFsVmFsdWU7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICBjYXNlICdhc3NldCc6XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBpbnB1dFZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgICAgICAvLyDlpoLmnpzovLjlhaXmmK/lrZfnrKbkuLLot6/lvpHvvIzovYnmj5vngrphc3NldOWwjeixoVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4geyB1dWlkOiBpbnB1dFZhbHVlIH07XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgaW5wdXRWYWx1ZSA9PT0gJ29iamVjdCcgJiYgaW5wdXRWYWx1ZSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gaW5wdXRWYWx1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIG9yaWdpbmFsVmFsdWU7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIC8vIOWwjeaWvOacquefpemhnuWei++8jOWEmOmHj+S/neaMgeWOn+aciee1kOani1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgaW5wdXRWYWx1ZSA9PT0gdHlwZW9mIG9yaWdpbmFsVmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGlucHV0VmFsdWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBvcmlnaW5hbFZhbHVlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgICAgIHByaXZhdGUgcGFyc2VDb2xvclN0cmluZyhjb2xvclN0cjogc3RyaW5nKTogeyByOiBudW1iZXI7IGc6IG51bWJlcjsgYjogbnVtYmVyOyBhOiBudW1iZXIgfSB7XG4gICAgICAgIGNvbnN0IHN0ciA9IGNvbG9yU3RyLnRyaW0oKTtcbiAgICAgICAgXG4gICAgICAgIC8vIOWPquaUr+aMgeWNgeWFremAsuWItuagvOW8jyAjUlJHR0JCIOaIliAjUlJHR0JCQUFcbiAgICAgICAgaWYgKHN0ci5zdGFydHNXaXRoKCcjJykpIHtcbiAgICAgICAgICAgIGlmIChzdHIubGVuZ3RoID09PSA3KSB7IC8vICNSUkdHQkJcbiAgICAgICAgICAgICAgICBjb25zdCByID0gcGFyc2VJbnQoc3RyLnN1YnN0cmluZygxLCAzKSwgMTYpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGcgPSBwYXJzZUludChzdHIuc3Vic3RyaW5nKDMsIDUpLCAxNik7XG4gICAgICAgICAgICAgICAgY29uc3QgYiA9IHBhcnNlSW50KHN0ci5zdWJzdHJpbmcoNSwgNyksIDE2KTtcbiAgICAgICAgICAgICAgICByZXR1cm4geyByLCBnLCBiLCBhOiAyNTUgfTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoc3RyLmxlbmd0aCA9PT0gOSkgeyAvLyAjUlJHR0JCQUFcbiAgICAgICAgICAgICAgICBjb25zdCByID0gcGFyc2VJbnQoc3RyLnN1YnN0cmluZygxLCAzKSwgMTYpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGcgPSBwYXJzZUludChzdHIuc3Vic3RyaW5nKDMsIDUpLCAxNik7XG4gICAgICAgICAgICAgICAgY29uc3QgYiA9IHBhcnNlSW50KHN0ci5zdWJzdHJpbmcoNSwgNyksIDE2KTtcbiAgICAgICAgICAgICAgICBjb25zdCBhID0gcGFyc2VJbnQoc3RyLnN1YnN0cmluZyg3LCA5KSwgMTYpO1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHIsIGcsIGIsIGEgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgLy8g5aaC5p6c5LiN5piv5pyJ5pWI55qE5Y2B5YWt6YCy5Yi25qC85byP77yM6L+U5Zue6Yyv6Kqk5o+Q56S6XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBjb2xvciBmb3JtYXQ6IFwiJHtjb2xvclN0cn1cIi4gT25seSBoZXhhZGVjaW1hbCBmb3JtYXQgaXMgc3VwcG9ydGVkIChlLmcuLCBcIiNGRjAwMDBcIiBvciBcIiNGRjAwMDBGRlwiKWApO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgdmVyaWZ5UHJvcGVydHlDaGFuZ2Uobm9kZVV1aWQ6IHN0cmluZywgY29tcG9uZW50VHlwZTogc3RyaW5nLCBwcm9wZXJ0eTogc3RyaW5nLCBvcmlnaW5hbFZhbHVlOiBhbnksIGV4cGVjdGVkVmFsdWU6IGFueSk6IFByb21pc2U8eyB2ZXJpZmllZDogYm9vbGVhbjsgYWN0dWFsVmFsdWU6IGFueTsgZnVsbERhdGE6IGFueSB9PiB7XG4gICAgICAgIGRlYnVnTG9nKGBbdmVyaWZ5UHJvcGVydHlDaGFuZ2VdIFN0YXJ0aW5nIHZlcmlmaWNhdGlvbiBmb3IgJHtjb21wb25lbnRUeXBlfS4ke3Byb3BlcnR5fWApO1xuICAgICAgICBkZWJ1Z0xvZyhgW3ZlcmlmeVByb3BlcnR5Q2hhbmdlXSBFeHBlY3RlZCB2YWx1ZTpgLCBKU09OLnN0cmluZ2lmeShleHBlY3RlZFZhbHVlKSk7XG4gICAgICAgIGRlYnVnTG9nKGBbdmVyaWZ5UHJvcGVydHlDaGFuZ2VdIE9yaWdpbmFsIHZhbHVlOmAsIEpTT04uc3RyaW5naWZ5KG9yaWdpbmFsVmFsdWUpKTtcbiAgICAgICAgXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyDph43mlrDnjbLlj5bntYTku7bkv6Hmga/pgLLooYzpqZforYlcbiAgICAgICAgICAgIGRlYnVnTG9nKGBbdmVyaWZ5UHJvcGVydHlDaGFuZ2VdIENhbGxpbmcgZ2V0Q29tcG9uZW50SW5mby4uLmApO1xuICAgICAgICAgICAgY29uc3QgY29tcG9uZW50SW5mbyA9IGF3YWl0IHRoaXMuZ2V0Q29tcG9uZW50SW5mbyhub2RlVXVpZCwgY29tcG9uZW50VHlwZSk7XG4gICAgICAgICAgICBkZWJ1Z0xvZyhgW3ZlcmlmeVByb3BlcnR5Q2hhbmdlXSBnZXRDb21wb25lbnRJbmZvIHN1Y2Nlc3M6YCwgY29tcG9uZW50SW5mby5zdWNjZXNzKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgY29uc3QgYWxsQ29tcG9uZW50cyA9IGF3YWl0IHRoaXMuZ2V0Q29tcG9uZW50cyhub2RlVXVpZCk7XG4gICAgICAgICAgICBkZWJ1Z0xvZyhgW3ZlcmlmeVByb3BlcnR5Q2hhbmdlXSBnZXRDb21wb25lbnRzIHN1Y2Nlc3M6YCwgYWxsQ29tcG9uZW50cy5zdWNjZXNzKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgaWYgKGNvbXBvbmVudEluZm8uc3VjY2VzcyAmJiBjb21wb25lbnRJbmZvLmRhdGEpIHtcbiAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgW3ZlcmlmeVByb3BlcnR5Q2hhbmdlXSBDb21wb25lbnQgZGF0YSBhdmFpbGFibGUsIGV4dHJhY3RpbmcgcHJvcGVydHkgJyR7cHJvcGVydHl9J2ApO1xuICAgICAgICAgICAgICAgIGNvbnN0IGFsbFByb3BlcnR5TmFtZXMgPSBPYmplY3Qua2V5cyhjb21wb25lbnRJbmZvLmRhdGEucHJvcGVydGllcyB8fCB7fSk7XG4gICAgICAgICAgICAgICAgZGVidWdMb2coYFt2ZXJpZnlQcm9wZXJ0eUNoYW5nZV0gQXZhaWxhYmxlIHByb3BlcnRpZXM6YCwgYWxsUHJvcGVydHlOYW1lcyk7XG4gICAgICAgICAgICAgICAgY29uc3QgcHJvcGVydHlEYXRhID0gY29tcG9uZW50SW5mby5kYXRhLnByb3BlcnRpZXM/Lltwcm9wZXJ0eV07XG4gICAgICAgICAgICAgICAgZGVidWdMb2coYFt2ZXJpZnlQcm9wZXJ0eUNoYW5nZV0gUmF3IHByb3BlcnR5IGRhdGEgZm9yICcke3Byb3BlcnR5fSc6YCwgSlNPTi5zdHJpbmdpZnkocHJvcGVydHlEYXRhKSk7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgLy8g5b6e5bGs5oCn5pW45pOa5Lit5o+Q5Y+W5a+m6Zqb5YC8XG4gICAgICAgICAgICAgICAgbGV0IGFjdHVhbFZhbHVlID0gcHJvcGVydHlEYXRhO1xuICAgICAgICAgICAgICAgIGRlYnVnTG9nKGBbdmVyaWZ5UHJvcGVydHlDaGFuZ2VdIEluaXRpYWwgYWN0dWFsVmFsdWU6YCwgSlNPTi5zdHJpbmdpZnkoYWN0dWFsVmFsdWUpKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpZiAocHJvcGVydHlEYXRhICYmIHR5cGVvZiBwcm9wZXJ0eURhdGEgPT09ICdvYmplY3QnICYmICd2YWx1ZScgaW4gcHJvcGVydHlEYXRhKSB7XG4gICAgICAgICAgICAgICAgICAgIGFjdHVhbFZhbHVlID0gcHJvcGVydHlEYXRhLnZhbHVlO1xuICAgICAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgW3ZlcmlmeVByb3BlcnR5Q2hhbmdlXSBFeHRyYWN0ZWQgYWN0dWFsVmFsdWUgZnJvbSAudmFsdWU6YCwgSlNPTi5zdHJpbmdpZnkoYWN0dWFsVmFsdWUpKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgW3ZlcmlmeVByb3BlcnR5Q2hhbmdlXSBObyAudmFsdWUgcHJvcGVydHkgZm91bmQsIHVzaW5nIHJhdyBkYXRhYCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIC8vIOS/ruW+qempl+itiemCj+i8r++8muaqouafpeWvpumam+WAvOaYr+WQpuWMuemFjeacn+acm+WAvFxuICAgICAgICAgICAgICAgIGxldCB2ZXJpZmllZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgZXhwZWN0ZWRWYWx1ZSA9PT0gJ29iamVjdCcgJiYgZXhwZWN0ZWRWYWx1ZSAhPT0gbnVsbCAmJiAndXVpZCcgaW4gZXhwZWN0ZWRWYWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICAvLyDlsI3mlrzlvJXnlKjpoZ7lnovvvIjnr4Dpu54v57WE5Lu2L+izh+a6kO+8ie+8jOavlOi8g1VVSURcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYWN0dWFsVXVpZCA9IGFjdHVhbFZhbHVlICYmIHR5cGVvZiBhY3R1YWxWYWx1ZSA9PT0gJ29iamVjdCcgJiYgJ3V1aWQnIGluIGFjdHVhbFZhbHVlID8gYWN0dWFsVmFsdWUudXVpZCA6ICcnO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBleHBlY3RlZFV1aWQgPSBleHBlY3RlZFZhbHVlLnV1aWQgfHwgJyc7XG4gICAgICAgICAgICAgICAgICAgIHZlcmlmaWVkID0gYWN0dWFsVXVpZCA9PT0gZXhwZWN0ZWRVdWlkICYmIGV4cGVjdGVkVXVpZCAhPT0gJyc7XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgW3ZlcmlmeVByb3BlcnR5Q2hhbmdlXSBSZWZlcmVuY2UgY29tcGFyaXNvbjpgKTtcbiAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYCAgLSBFeHBlY3RlZCBVVUlEOiBcIiR7ZXhwZWN0ZWRVdWlkfVwiYCk7XG4gICAgICAgICAgICAgICAgICAgIGRlYnVnTG9nKGAgIC0gQWN0dWFsIFVVSUQ6IFwiJHthY3R1YWxVdWlkfVwiYCk7XG4gICAgICAgICAgICAgICAgICAgIGRlYnVnTG9nKGAgIC0gVVVJRCBtYXRjaDogJHthY3R1YWxVdWlkID09PSBleHBlY3RlZFV1aWR9YCk7XG4gICAgICAgICAgICAgICAgICAgIGRlYnVnTG9nKGAgIC0gVVVJRCBub3QgZW1wdHk6ICR7ZXhwZWN0ZWRVdWlkICE9PSAnJ31gKTtcbiAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYCAgLSBGaW5hbCB2ZXJpZmllZDogJHt2ZXJpZmllZH1gKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAvLyDlsI3mlrzlhbbku5bpoZ7lnovvvIznm7TmjqXmr5TovIPlgLxcbiAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYFt2ZXJpZnlQcm9wZXJ0eUNoYW5nZV0gVmFsdWUgY29tcGFyaXNvbjpgKTtcbiAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYCAgLSBFeHBlY3RlZCB0eXBlOiAke3R5cGVvZiBleHBlY3RlZFZhbHVlfWApO1xuICAgICAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgICAtIEFjdHVhbCB0eXBlOiAke3R5cGVvZiBhY3R1YWxWYWx1ZX1gKTtcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgYWN0dWFsVmFsdWUgPT09IHR5cGVvZiBleHBlY3RlZFZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGFjdHVhbFZhbHVlID09PSAnb2JqZWN0JyAmJiBhY3R1YWxWYWx1ZSAhPT0gbnVsbCAmJiBleHBlY3RlZFZhbHVlICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5bCN6LGh6aGe5Z6L55qE5rex5bqm5q+U6LyDXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmVyaWZpZWQgPSBKU09OLnN0cmluZ2lmeShhY3R1YWxWYWx1ZSkgPT09IEpTT04uc3RyaW5naWZ5KGV4cGVjdGVkVmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlYnVnTG9nKGAgIC0gT2JqZWN0IGNvbXBhcmlzb24gKEpTT04pOiAke3ZlcmlmaWVkfWApO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDln7rmnKzpoZ7lnovnmoTnm7TmjqXmr5TovINcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2ZXJpZmllZCA9IGFjdHVhbFZhbHVlID09PSBleHBlY3RlZFZhbHVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlYnVnTG9nKGAgIC0gRGlyZWN0IGNvbXBhcmlzb246ICR7dmVyaWZpZWR9YCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyDpoZ7lnovkuI3ljLnphY3mmYLnmoTnibnmroromZXnkIbvvIjlpoLmlbjlrZflkozlrZfnrKbkuLLvvIlcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHN0cmluZ01hdGNoID0gU3RyaW5nKGFjdHVhbFZhbHVlKSA9PT0gU3RyaW5nKGV4cGVjdGVkVmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbnVtYmVyTWF0Y2ggPSBOdW1iZXIoYWN0dWFsVmFsdWUpID09PSBOdW1iZXIoZXhwZWN0ZWRWYWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB2ZXJpZmllZCA9IHN0cmluZ01hdGNoIHx8IG51bWJlck1hdGNoO1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYCAgLSBTdHJpbmcgbWF0Y2g6ICR7c3RyaW5nTWF0Y2h9YCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgICAtIE51bWJlciBtYXRjaDogJHtudW1iZXJNYXRjaH1gKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlYnVnTG9nKGAgIC0gVHlwZSBtaXNtYXRjaCB2ZXJpZmllZDogJHt2ZXJpZmllZH1gKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgW3ZlcmlmeVByb3BlcnR5Q2hhbmdlXSBGaW5hbCB2ZXJpZmljYXRpb24gcmVzdWx0OiAke3ZlcmlmaWVkfWApO1xuICAgICAgICAgICAgICAgIGRlYnVnTG9nKGBbdmVyaWZ5UHJvcGVydHlDaGFuZ2VdIEZpbmFsIGFjdHVhbFZhbHVlOmAsIEpTT04uc3RyaW5naWZ5KGFjdHVhbFZhbHVlKSk7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0ge1xuICAgICAgICAgICAgICAgICAgICB2ZXJpZmllZCxcbiAgICAgICAgICAgICAgICAgICAgYWN0dWFsVmFsdWUsXG4gICAgICAgICAgICAgICAgICAgIGZ1bGxEYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyDlj6rov5Tlm57kv67mlLnnmoTlsazmgKfkv6Hmga/vvIzkuI3ov5Tlm57lrozmlbTntYTku7bmlbjmk5pcbiAgICAgICAgICAgICAgICAgICAgICAgIG1vZGlmaWVkUHJvcGVydHk6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBuYW1lOiBwcm9wZXJ0eSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBiZWZvcmU6IG9yaWdpbmFsVmFsdWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZXhwZWN0ZWQ6IGV4cGVjdGVkVmFsdWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYWN0dWFsOiBhY3R1YWxWYWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2ZXJpZmllZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0eU1ldGFkYXRhOiBwcm9wZXJ0eURhdGEgLy8g5Y+q5YyF5ZCr6YCZ5YCL5bGs5oCn55qE5YWD5pW45pOaXG4gICAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgLy8g57Ch5YyW55qE57WE5Lu25L+h5oGvXG4gICAgICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRTdW1tYXJ5OiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50VHlwZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0b3RhbFByb3BlcnRpZXM6IE9iamVjdC5rZXlzKGNvbXBvbmVudEluZm8uZGF0YT8ucHJvcGVydGllcyB8fCB7fSkubGVuZ3RoXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGRlYnVnTG9nKGBbdmVyaWZ5UHJvcGVydHlDaGFuZ2VdIFJldHVybmluZyByZXN1bHQ6YCwgSlNPTi5zdHJpbmdpZnkocmVzdWx0LCBudWxsLCAyKSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZGVidWdMb2coYFt2ZXJpZnlQcm9wZXJ0eUNoYW5nZV0gQ29tcG9uZW50SW5mbyBmYWlsZWQgb3Igbm8gZGF0YTpgLCBjb21wb25lbnRJbmZvKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ1t2ZXJpZnlQcm9wZXJ0eUNoYW5nZV0gVmVyaWZpY2F0aW9uIGZhaWxlZCB3aXRoIGVycm9yOicsIGVycm9yKTtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ1t2ZXJpZnlQcm9wZXJ0eUNoYW5nZV0gRXJyb3Igc3RhY2s6JywgZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLnN0YWNrIDogJ05vIHN0YWNrIHRyYWNlJyk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGRlYnVnTG9nKGBbdmVyaWZ5UHJvcGVydHlDaGFuZ2VdIFJldHVybmluZyBmYWxsYmFjayByZXN1bHRgKTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHZlcmlmaWVkOiBmYWxzZSxcbiAgICAgICAgICAgIGFjdHVhbFZhbHVlOiB1bmRlZmluZWQsXG4gICAgICAgICAgICBmdWxsRGF0YTogbnVsbFxuICAgICAgICB9O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIOaqoua4rOaYr+WQpueCuuevgOm7nuWxrOaAp++8jOWmguaenOaYr+WJh+mHjeWumuWQkeWIsOWwjeaHieeahOevgOm7nuaWueazlVxuICAgICAqL1xuICAgIHByaXZhdGUgYXN5bmMgY2hlY2tBbmRSZWRpcmVjdE5vZGVQcm9wZXJ0aWVzKGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlIHwgbnVsbD4ge1xuICAgICAgICBjb25zdCB7IG5vZGVVdWlkLCBjb21wb25lbnRUeXBlLCBwcm9wZXJ0eSwgcHJvcGVydHlUeXBlLCB2YWx1ZSB9ID0gYXJncztcbiAgICAgICAgXG4gICAgICAgIC8vIOaqoua4rOaYr+WQpueCuuevgOm7nuWfuuekjuWxrOaAp++8iOaHieipsuS9v+eUqCBzZXRfbm9kZV9wcm9wZXJ0ee+8iVxuICAgICAgICBjb25zdCBub2RlQmFzaWNQcm9wZXJ0aWVzID0gW1xuICAgICAgICAgICAgJ25hbWUnLCAnYWN0aXZlJywgJ2xheWVyJywgJ21vYmlsaXR5JywgJ3BhcmVudCcsICdjaGlsZHJlbicsICdoaWRlRmxhZ3MnXG4gICAgICAgIF07XG4gICAgICAgIFxuICAgICAgICAvLyDmqqLmuKzmmK/lkKbngrrnr4Dpu57orormj5vlsazmgKfvvIjmh4noqbLkvb/nlKggc2V0X25vZGVfdHJhbnNmb3Jt77yJXG4gICAgICAgIGNvbnN0IG5vZGVUcmFuc2Zvcm1Qcm9wZXJ0aWVzID0gW1xuICAgICAgICAgICAgJ3Bvc2l0aW9uJywgJ3JvdGF0aW9uJywgJ3NjYWxlJywgJ2V1bGVyQW5nbGVzJywgJ2FuZ2xlJ1xuICAgICAgICBdO1xuICAgICAgICBcbiAgICAgICAgLy8gRGV0ZWN0IGF0dGVtcHRzIHRvIHNldCBjYy5Ob2RlIHByb3BlcnRpZXMgKGNvbW1vbiBtaXN0YWtlKVxuICAgICAgICBpZiAoY29tcG9uZW50VHlwZSA9PT0gJ2NjLk5vZGUnIHx8IGNvbXBvbmVudFR5cGUgPT09ICdOb2RlJykge1xuICAgICAgICAgICAgaWYgKG5vZGVCYXNpY1Byb3BlcnRpZXMuaW5jbHVkZXMocHJvcGVydHkpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlcnJvcjogYFByb3BlcnR5ICcke3Byb3BlcnR5fScgaXMgYSBub2RlIGJhc2ljIHByb3BlcnR5LCBub3QgYSBjb21wb25lbnQgcHJvcGVydHlgLFxuICAgICAgICAgICAgICAgICAgICAgIGluc3RydWN0aW9uOiBgUGxlYXNlIHVzZSBzZXRfbm9kZV9wcm9wZXJ0eSBtZXRob2QgdG8gc2V0IG5vZGUgcHJvcGVydGllczogc2V0X25vZGVfcHJvcGVydHkodXVpZD1cIiR7bm9kZVV1aWR9XCIsIHByb3BlcnR5PVwiJHtwcm9wZXJ0eX1cIiwgdmFsdWU9JHtKU09OLnN0cmluZ2lmeSh2YWx1ZSl9KWBcbiAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAobm9kZVRyYW5zZm9ybVByb3BlcnRpZXMuaW5jbHVkZXMocHJvcGVydHkpKSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICAgIGVycm9yOiBgUHJvcGVydHkgJyR7cHJvcGVydHl9JyBpcyBhIG5vZGUgdHJhbnNmb3JtIHByb3BlcnR5LCBub3QgYSBjb21wb25lbnQgcHJvcGVydHlgLFxuICAgICAgICAgICAgICAgICAgICAgIGluc3RydWN0aW9uOiBgUGxlYXNlIHVzZSBzZXRfbm9kZV90cmFuc2Zvcm0gbWV0aG9kIHRvIHNldCB0cmFuc2Zvcm0gcHJvcGVydGllczogc2V0X25vZGVfdHJhbnNmb3JtKHV1aWQ9XCIke25vZGVVdWlkfVwiLCAke3Byb3BlcnR5fT0ke0pTT04uc3RyaW5naWZ5KHZhbHVlKX0pYFxuICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBcbiAgICAgICAgICAvLyBEZXRlY3QgY29tbW9uIGluY29ycmVjdCB1c2FnZVxuICAgICAgICAgIGlmIChub2RlQmFzaWNQcm9wZXJ0aWVzLmluY2x1ZGVzKHByb3BlcnR5KSB8fCBub2RlVHJhbnNmb3JtUHJvcGVydGllcy5pbmNsdWRlcyhwcm9wZXJ0eSkpIHtcbiAgICAgICAgICAgICAgY29uc3QgbWV0aG9kTmFtZSA9IG5vZGVUcmFuc2Zvcm1Qcm9wZXJ0aWVzLmluY2x1ZGVzKHByb3BlcnR5KSA/ICdzZXRfbm9kZV90cmFuc2Zvcm0nIDogJ3NldF9ub2RlX3Byb3BlcnR5JztcbiAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgZXJyb3I6IGBQcm9wZXJ0eSAnJHtwcm9wZXJ0eX0nIGlzIGEgbm9kZSBwcm9wZXJ0eSwgbm90IGEgY29tcG9uZW50IHByb3BlcnR5YCxcbiAgICAgICAgICAgICAgICAgIGluc3RydWN0aW9uOiBgUHJvcGVydHkgJyR7cHJvcGVydHl9JyBzaG91bGQgYmUgc2V0IHVzaW5nICR7bWV0aG9kTmFtZX0gbWV0aG9kLCBub3Qgc2V0X2NvbXBvbmVudF9wcm9wZXJ0eS4gUGxlYXNlIHVzZTogJHttZXRob2ROYW1lfSh1dWlkPVwiJHtub2RlVXVpZH1cIiwgJHtub2RlVHJhbnNmb3JtUHJvcGVydGllcy5pbmNsdWRlcyhwcm9wZXJ0eSkgPyBwcm9wZXJ0eSA6IGBwcm9wZXJ0eT1cIiR7cHJvcGVydHl9XCJgfT0ke0pTT04uc3RyaW5naWZ5KHZhbHVlKX0pYFxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgIH1cbiAgICAgICAgICBcbiAgICAgICAgICByZXR1cm4gbnVsbDsgLy8g5LiN5piv56+A6bue5bGs5oCn77yM57m857qM5q2j5bi46JmV55CGXG4gICAgICB9XG5cbiAgICAgIC8qKlxuICAgICAgICog55Sf5oiQ57WE5Lu25bu66K2w5L+h5oGvXG4gICAgICAgKi9cbiAgICAgIHByaXZhdGUgZ2VuZXJhdGVDb21wb25lbnRTdWdnZXN0aW9uKHJlcXVlc3RlZFR5cGU6IHN0cmluZywgYXZhaWxhYmxlVHlwZXM6IHN0cmluZ1tdLCBwcm9wZXJ0eTogc3RyaW5nKTogc3RyaW5nIHtcbiAgICAgICAgICAvLyDmqqLmn6XmmK/lkKblrZjlnKjnm7jkvLznmoTntYTku7bpoZ7lnotcbiAgICAgICAgICBjb25zdCBzaW1pbGFyVHlwZXMgPSBhdmFpbGFibGVUeXBlcy5maWx0ZXIodHlwZSA9PiBcbiAgICAgICAgICAgICAgdHlwZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHJlcXVlc3RlZFR5cGUudG9Mb3dlckNhc2UoKSkgfHwgXG4gICAgICAgICAgICAgIHJlcXVlc3RlZFR5cGUudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyh0eXBlLnRvTG93ZXJDYXNlKCkpXG4gICAgICAgICAgKTtcbiAgICAgICAgICBcbiAgICAgICAgICBsZXQgaW5zdHJ1Y3Rpb24gPSAnJztcbiAgICAgICAgICBcbiAgICAgICAgICBpZiAoc2ltaWxhclR5cGVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgaW5zdHJ1Y3Rpb24gKz0gYFxcblxcbvCflI0gRm91bmQgc2ltaWxhciBjb21wb25lbnRzOiAke3NpbWlsYXJUeXBlcy5qb2luKCcsICcpfWA7XG4gICAgICAgICAgICAgIGluc3RydWN0aW9uICs9IGBcXG7wn5KhIFN1Z2dlc3Rpb246IFBlcmhhcHMgeW91IG1lYW50IHRvIHNldCB0aGUgJyR7c2ltaWxhclR5cGVzWzBdfScgY29tcG9uZW50P2A7XG4gICAgICAgICAgfVxuICAgICAgICAgIFxuICAgICAgICAgIC8vIFJlY29tbWVuZCBwb3NzaWJsZSBjb21wb25lbnRzIGJhc2VkIG9uIHByb3BlcnR5IG5hbWVcbiAgICAgICAgICBjb25zdCBwcm9wZXJ0eVRvQ29tcG9uZW50TWFwOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmdbXT4gPSB7XG4gICAgICAgICAgICAgICdzdHJpbmcnOiBbJ2NjLkxhYmVsJywgJ2NjLlJpY2hUZXh0JywgJ2NjLkVkaXRCb3gnXSxcbiAgICAgICAgICAgICAgJ3RleHQnOiBbJ2NjLkxhYmVsJywgJ2NjLlJpY2hUZXh0J10sXG4gICAgICAgICAgICAgICdmb250U2l6ZSc6IFsnY2MuTGFiZWwnLCAnY2MuUmljaFRleHQnXSxcbiAgICAgICAgICAgICAgJ3Nwcml0ZUZyYW1lJzogWydjYy5TcHJpdGUnXSxcbiAgICAgICAgICAgICAgJ2NvbG9yJzogWydjYy5MYWJlbCcsICdjYy5TcHJpdGUnLCAnY2MuR3JhcGhpY3MnXSxcbiAgICAgICAgICAgICAgJ25vcm1hbENvbG9yJzogWydjYy5CdXR0b24nXSxcbiAgICAgICAgICAgICAgJ3ByZXNzZWRDb2xvcic6IFsnY2MuQnV0dG9uJ10sXG4gICAgICAgICAgICAgICd0YXJnZXQnOiBbJ2NjLkJ1dHRvbiddLFxuICAgICAgICAgICAgICAnY29udGVudFNpemUnOiBbJ2NjLlVJVHJhbnNmb3JtJ10sXG4gICAgICAgICAgICAgICdhbmNob3JQb2ludCc6IFsnY2MuVUlUcmFuc2Zvcm0nXVxuICAgICAgICAgIH07XG4gICAgICAgICAgXG4gICAgICAgICAgY29uc3QgcmVjb21tZW5kZWRDb21wb25lbnRzID0gcHJvcGVydHlUb0NvbXBvbmVudE1hcFtwcm9wZXJ0eV0gfHwgW107XG4gICAgICAgICAgY29uc3QgYXZhaWxhYmxlUmVjb21tZW5kZWQgPSByZWNvbW1lbmRlZENvbXBvbmVudHMuZmlsdGVyKGNvbXAgPT4gYXZhaWxhYmxlVHlwZXMuaW5jbHVkZXMoY29tcCkpO1xuICAgICAgICAgIFxuICAgICAgICAgIGlmIChhdmFpbGFibGVSZWNvbW1lbmRlZC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgIGluc3RydWN0aW9uICs9IGBcXG5cXG7wn46vIEJhc2VkIG9uIHByb3BlcnR5ICcke3Byb3BlcnR5fScsIHJlY29tbWVuZGVkIGNvbXBvbmVudHM6ICR7YXZhaWxhYmxlUmVjb21tZW5kZWQuam9pbignLCAnKX1gO1xuICAgICAgICAgIH1cbiAgICAgICAgICBcbiAgICAgICAgICAvLyBQcm92aWRlIG9wZXJhdGlvbiBzdWdnZXN0aW9uc1xuICAgICAgICAgIGluc3RydWN0aW9uICs9IGBcXG5cXG7wn5OLIFN1Z2dlc3RlZCBBY3Rpb25zOmA7XG4gICAgICAgICAgaW5zdHJ1Y3Rpb24gKz0gYFxcbjEuIFVzZSBnZXRfY29tcG9uZW50cyhub2RlVXVpZD1cIiR7cmVxdWVzdGVkVHlwZS5pbmNsdWRlcygndXVpZCcpID8gJ1lPVVJfTk9ERV9VVUlEJyA6ICdub2RlVXVpZCd9XCIpIHRvIHZpZXcgYWxsIGNvbXBvbmVudHMgb24gdGhlIG5vZGVgO1xuICAgICAgICAgIGluc3RydWN0aW9uICs9IGBcXG4yLiBJZiB5b3UgbmVlZCB0byBhZGQgYSBjb21wb25lbnQsIHVzZSBhZGRfY29tcG9uZW50KG5vZGVVdWlkPVwiLi4uXCIsIGNvbXBvbmVudFR5cGU9XCIke3JlcXVlc3RlZFR5cGV9XCIpYDtcbiAgICAgICAgICBpbnN0cnVjdGlvbiArPSBgXFxuMy4gVmVyaWZ5IHRoYXQgdGhlIGNvbXBvbmVudCB0eXBlIG5hbWUgaXMgY29ycmVjdCAoY2FzZS1zZW5zaXRpdmUpYDtcbiAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgIHJldHVybiBpbnN0cnVjdGlvbjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiDlv6vpgJ/pqZforYnos4fmupDoqK3nva7ntZDmnpxcbiAgICAgKi9cbiAgICBwcml2YXRlIGFzeW5jIHF1aWNrVmVyaWZ5QXNzZXQobm9kZVV1aWQ6IHN0cmluZywgY29tcG9uZW50VHlwZTogc3RyaW5nLCBwcm9wZXJ0eTogc3RyaW5nKTogUHJvbWlzZTxhbnk+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJhd05vZGVEYXRhID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktbm9kZScsIG5vZGVVdWlkKTtcbiAgICAgICAgICAgIGlmICghcmF3Tm9kZURhdGEgfHwgIXJhd05vZGVEYXRhLl9fY29tcHNfXykge1xuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyDmib7liLDntYTku7ZcbiAgICAgICAgICAgIGNvbnN0IGNvbXBvbmVudCA9IHJhd05vZGVEYXRhLl9fY29tcHNfXy5maW5kKChjb21wOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBjb21wVHlwZSA9IGNvbXAuX190eXBlX18gfHwgY29tcC5jaWQgfHwgY29tcC50eXBlO1xuICAgICAgICAgICAgICAgIHJldHVybiBjb21wVHlwZSA9PT0gY29tcG9uZW50VHlwZTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZiAoIWNvbXBvbmVudCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyDmj5Dlj5blsazmgKflgLxcbiAgICAgICAgICAgIGNvbnN0IHByb3BlcnRpZXMgPSB0aGlzLmV4dHJhY3RDb21wb25lbnRQcm9wZXJ0aWVzKGNvbXBvbmVudCk7XG4gICAgICAgICAgICBjb25zdCBwcm9wZXJ0eURhdGEgPSBwcm9wZXJ0aWVzW3Byb3BlcnR5XTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgaWYgKHByb3BlcnR5RGF0YSAmJiB0eXBlb2YgcHJvcGVydHlEYXRhID09PSAnb2JqZWN0JyAmJiAndmFsdWUnIGluIHByb3BlcnR5RGF0YSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBwcm9wZXJ0eURhdGEudmFsdWU7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBwcm9wZXJ0eURhdGE7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKGBbcXVpY2tWZXJpZnlBc3NldF0gRXJyb3I6YCwgZXJyb3IpO1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cbiAgICB9XG59XG4iXX0=