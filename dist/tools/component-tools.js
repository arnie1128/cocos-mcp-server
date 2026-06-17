"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ComponentTools = void 0;
const response_1 = require("../lib/response");
const log_1 = require("../lib/log");
const schema_1 = require("../lib/schema");
const decorators_1 = require("../lib/decorators");
const scene_bridge_1 = require("../lib/scene-bridge");
const instance_reference_1 = require("../lib/instance-reference");
const ccclass_extractor_1 = require("../lib/ccclass-extractor");
const component_lookup_1 = require("../lib/component-lookup");
const dump_unwrap_1 = require("../lib/dump-unwrap");
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
        this.exec = (0, decorators_1.defineToolsFromDecorators)(this);
    }
    getTools() { return this.exec.getTools(); }
    execute(toolName, args) { return this.exec.execute(toolName, args); }
    async addComponent(a) {
        const r = await (0, instance_reference_1.resolveReference)({ reference: a.reference, nodeUuid: a.nodeUuid, nodeName: a.nodeName });
        if ('response' in r)
            return r.response;
        return this.addComponentImpl(r.uuid, a.componentType);
    }
    async removeComponent(a) {
        return this.removeComponentImpl(a.nodeUuid, a.componentType);
    }
    async getComponents(a) {
        return this.getComponentsImpl(a.nodeUuid);
    }
    async getComponentInfo(a) {
        return this.getComponentInfoImpl(a.nodeUuid, a.componentType);
    }
    async autoBindComponent(a) {
        var _a, _b;
        const dump = await Editor.Message.request('scene', 'query-node', a.nodeUuid);
        if (!dump) {
            return (0, response_1.fail)('node not found');
        }
        const comps = (_a = dump.__comps__) !== null && _a !== void 0 ? _a : [];
        const componentIndex = (0, component_lookup_1.findComponentIndexByType)(comps, a.componentType);
        if (componentIndex === -1) {
            return (0, response_1.fail)('component not found');
        }
        const component = comps[componentIndex];
        const properties = (component === null || component === void 0 ? void 0 : component.value) && typeof component.value === 'object' ? component.value : component;
        const skippedTypes = new Set([
            'String', 'Boolean', 'Integer', 'Float', 'Number', 'Enum', 'BitMask',
            'cc.Vec2', 'cc.Vec3', 'cc.Vec4', 'cc.Color', 'cc.Rect', 'cc.Size',
            'cc.Quat', 'cc.Mat3', 'cc.Mat4',
        ]);
        const referenceProps = Object.entries(properties !== null && properties !== void 0 ? properties : {})
            .filter(([propName, entry]) => {
            if (propName.startsWith('__'))
                return false;
            if (!entry || typeof entry !== 'object')
                return false;
            if (!entry.type || typeof entry.type !== 'string')
                return false;
            if (skippedTypes.has(entry.type))
                return false;
            if (!a.force && entry.value !== null && entry.value !== undefined)
                return false;
            return entry.type === 'cc.Node' || entry.type.length > 0;
        })
            .map(([property, entry]) => ({ property, entry }));
        const tree = await Editor.Message.request('scene', 'query-node-tree');
        const sceneNodes = [];
        const stack = tree ? [tree] : [];
        while (stack.length > 0) {
            const node = stack.pop();
            if (!node)
                continue;
            if (typeof node.uuid === 'string' && typeof node.name === 'string') {
                sceneNodes.push({ uuid: node.uuid, name: node.name });
            }
            if (Array.isArray(node.children)) {
                for (let i = node.children.length - 1; i >= 0; i--) {
                    stack.push(node.children[i]);
                }
            }
        }
        const bound = [];
        const skipped = [];
        for (const { property, entry } of referenceProps) {
            const matchedNode = a.mode === 'fuzzy'
                ? sceneNodes.find(node => node.name.toLowerCase().includes(property.toLowerCase()))
                : sceneNodes.find(node => node.name === property);
            if (!matchedNode) {
                skipped.push({ property, reason: 'no matching node found' });
                continue;
            }
            try {
                await Editor.Message.request('scene', 'set-property', {
                    uuid: a.nodeUuid,
                    path: '__comps__.' + componentIndex + '.' + property,
                    dump: { type: entry.type, value: { __uuid__: matchedNode.uuid } },
                });
                bound.push({
                    property,
                    matchedNodeUuid: matchedNode.uuid,
                    matchedNodeName: matchedNode.name,
                });
            }
            catch (err) {
                skipped.push({ property, reason: (_b = err === null || err === void 0 ? void 0 : err.message) !== null && _b !== void 0 ? _b : String(err) });
            }
        }
        return (0, response_1.ok)({
            total: referenceProps.length,
            bound,
            skipped,
        }, `Bound ${bound.length}/${referenceProps.length} references`);
    }
    async setComponentPropertyTool(a) {
        const r = await (0, instance_reference_1.resolveReference)({ reference: a.reference, nodeUuid: a.nodeUuid, nodeName: a.nodeName });
        if ('response' in r)
            return r.response;
        return this.setComponentProperty(Object.assign(Object.assign({}, a), { nodeUuid: r.uuid }));
    }
    async attachScript(a) {
        return this.attachScriptImpl(a.nodeUuid, a.scriptPath);
    }
    async resolveScriptClass(a) {
        var _a;
        try {
            const result = await (0, ccclass_extractor_1.resolveCcclassFromAsset)(a.script);
            const response = (0, response_1.ok)({
                classNames: result.classNames,
                assetPath: result.assetPath,
                assetUuid: result.assetUuid,
                assetUrl: result.assetUrl,
            });
            if (result.classNames.length === 0) {
                response.warning = 'No @ccclass("ClassName") decorator was found in this script.';
            }
            else if (result.classNames.length > 1) {
                response.warning = `Multiple @ccclass decorators found: ${result.classNames.join(', ')}`;
            }
            return response;
        }
        catch (err) {
            return (0, response_1.fail)((_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : String(err));
        }
    }
    async getAvailableComponents(a) {
        return this.getAvailableComponentsImpl(a.category);
    }
    async addEventHandler(a) {
        var _a;
        const resp = await (0, scene_bridge_1.runSceneMethodAsToolResponse)('addEventHandler', [
            a.nodeUuid, a.componentType, a.eventArrayProperty,
            a.targetNodeUuid, a.componentName, a.handler, a.customEventData,
        ]);
        if (resp.success) {
            await nudgeEditorModel(a.nodeUuid, a.componentType, (_a = resp.data) === null || _a === void 0 ? void 0 : _a.componentUuid);
        }
        return resp;
    }
    async removeEventHandler(a) {
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
    }
    async listEventHandlers(a) {
        return (0, scene_bridge_1.runSceneMethodAsToolResponse)('listEventHandlers', [
            a.nodeUuid, a.componentType, a.eventArrayProperty,
        ]);
    }
    async setComponentProperties(a) {
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
    }
    async addComponentImpl(nodeUuid, componentType) {
        return new Promise(async (resolve) => {
            var _a;
            // Snapshot existing components so we can detect post-add additions
            // even when Cocos reports them under a cid (custom scripts) rather
            // than the class name the caller supplied.
            const beforeInfo = await this.getComponentsImpl(nodeUuid);
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
                    const afterInfo = await this.getComponentsImpl(nodeUuid);
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
    async removeComponentImpl(nodeUuid, componentType) {
        var _a, _b, _c, _d, _e, _f;
        // 1. 查找節點上的所有組件
        const allComponentsInfo = await this.getComponentsImpl(nodeUuid);
        if (!allComponentsInfo.success || !((_a = allComponentsInfo.data) === null || _a === void 0 ? void 0 : _a.components)) {
            return (0, response_1.fail)(`Failed to get components for node '${nodeUuid}': ${allComponentsInfo.error}`);
        }
        // 2. 查找 type 字段等於 componentType（即 cid）的組件，並取其「組件 uuid」
        const matched = allComponentsInfo.data.components.find((comp) => comp.type === componentType);
        if (!matched) {
            return (0, response_1.fail)(`Component cid '${componentType}' not found on node '${nodeUuid}'. 請用getComponents獲取type字段（cid）作為componentType。`);
        }
        // Cocos 3.8 的 remove-component 需要「組件自身的 uuid」，不是節點 uuid。
        const componentUuid = (_b = matched.uuid) !== null && _b !== void 0 ? _b : (_d = (_c = matched.properties) === null || _c === void 0 ? void 0 : _c.uuid) === null || _d === void 0 ? void 0 : _d.value;
        if (!componentUuid) {
            return (0, response_1.fail)(`Could not resolve component uuid for cid '${componentType}' on node '${nodeUuid}'.`);
        }
        // 3. 官方API直接移除（傳組件 uuid）
        try {
            await Editor.Message.request('scene', 'remove-component', {
                uuid: componentUuid,
            });
            // 4. 再查一次確認是否移除
            const afterRemoveInfo = await this.getComponentsImpl(nodeUuid);
            const stillExists = afterRemoveInfo.success && ((_f = (_e = afterRemoveInfo.data) === null || _e === void 0 ? void 0 : _e.components) === null || _f === void 0 ? void 0 : _f.some((comp) => comp.type === componentType));
            if (stillExists) {
                return (0, response_1.fail)(`Component cid '${componentType}' was not removed from node '${nodeUuid}'.`);
            }
            else {
                return (0, response_1.ok)({ nodeUuid, componentType }, `Component cid '${componentType}' removed successfully from node '${nodeUuid}'`);
            }
        }
        catch (err) {
            return (0, response_1.fail)(`Failed to remove component: ${err.message}`);
        }
    }
    async getComponentsImpl(nodeUuid) {
        return new Promise((resolve) => {
            // 優先嚐試直接使用 Editor API 查詢節點信息
            Editor.Message.request('scene', 'query-node', nodeUuid).then((nodeData) => {
                if (nodeData && nodeData.__comps__) {
                    const components = nodeData.__comps__.map((comp) => {
                        var _a, _b;
                        return ({
                            type: comp.__type__ || comp.cid || comp.type || 'Unknown',
                            // query-node 的組件 uuid 位於 comp.value.uuid（dump 形式），
                            // 舊版直接讀 comp.uuid 永遠為 null；兩種形態都涵蓋。
                            uuid: (0, dump_unwrap_1.dumpUnwrap)((_b = (_a = comp.value) === null || _a === void 0 ? void 0 : _a.uuid) !== null && _b !== void 0 ? _b : comp.uuid, null),
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
    async getComponentInfoImpl(nodeUuid, componentType) {
        return new Promise((resolve) => {
            // 優先嚐試直接使用 Editor API 查詢節點信息
            Editor.Message.request('scene', 'query-node', nodeUuid).then((nodeData) => {
                if (nodeData && nodeData.__comps__) {
                    const componentIndex = (0, component_lookup_1.findComponentIndexByType)(nodeData.__comps__, componentType);
                    const component = componentIndex === -1 ? null : nodeData.__comps__[componentIndex];
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
                        const componentIndex = (0, component_lookup_1.findComponentIndexByType)(result.data.components, componentType);
                        const component = componentIndex === -1 ? null : result.data.components[componentIndex];
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
        var _a, _b;
        const { nodeUuid, componentType, property, propertyType, value } = args;
        try {
            (0, log_1.debugLog)(`[ComponentTools] Setting ${componentType}.${property} (type: ${propertyType}) = ${JSON.stringify(value)} on node ${nodeUuid}`);
            // Step 0: 檢測是否為節點屬性，如果是則重定向到對應的節點方法
            const nodeRedirectResult = await this.checkAndRedirectNodeProperties(args);
            if (nodeRedirectResult) {
                return nodeRedirectResult;
            }
            // Step 1: 獲取組件信息，使用與getComponents相同的方法
            const componentsResponse = await this.getComponentsImpl(nodeUuid);
            if (!componentsResponse.success || !componentsResponse.data) {
                return {
                    success: false,
                    error: `Failed to get components for node '${nodeUuid}': ${componentsResponse.error}`,
                    instruction: `Please verify that node UUID '${nodeUuid}' is correct. Use get_all_nodes or find_node_by_name to get the correct node UUID.`
                };
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
            for (const comp of allComponents) {
                availableTypes.push(comp.type);
            }
            targetComponentIndex = (0, component_lookup_1.findComponentIndexByType)(allComponents, componentType);
            targetComponent = targetComponentIndex === -1 ? null : allComponents[targetComponentIndex];
            if (!targetComponent) {
                // 提供更詳細的錯誤信息和建議
                const instruction = this.generateComponentSuggestion(componentType, availableTypes, property);
                return {
                    success: false,
                    error: `Component '${componentType}' not found on node. Available components: ${availableTypes.join(', ')}`,
                    instruction: instruction
                };
            }
            // Step 3: 自動檢測和轉換屬性值
            let propertyInfo;
            try {
                (0, log_1.debugLog)(`[ComponentTools] Analyzing property: ${property}`);
                propertyInfo = this.analyzeProperty(targetComponent, property);
            }
            catch (analyzeError) {
                console.error(`[ComponentTools] Error in analyzeProperty:`, analyzeError);
                return (0, response_1.fail)(`Failed to analyze property '${property}': ${analyzeError.message}`);
            }
            if (!propertyInfo.exists) {
                return (0, response_1.fail)(`Property '${property}' not found on component '${componentType}'. Available properties: ${propertyInfo.availableProperties.join(', ')}`);
            }
            // Step 3.5: propertyType vs metadata reference-kind preflight.
            // Catches the common pitfall where a cc.Component subclass field
            // (e.g. cc.Canvas.cameraComponent : cc.Camera) gets called with
            // propertyType: 'node' — the IPC silently accepts but the ref
            // never connects. We surface the right propertyType + value shape.
            const mismatch = this.detectPropertyTypeMismatch(propertyInfo, propertyType, nodeUuid, componentType, property);
            if (mismatch) {
                return mismatch;
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
                const currentComponentInfo = await this.getComponentInfoImpl(nodeUuid, componentType);
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
            return (0, response_1.ok)({
                nodeUuid,
                componentType,
                property,
                actualValue: verification.actualValue,
                changeVerified: verification.verified
            }, `Successfully set ${componentType}.${property}`);
        }
        catch (error) {
            console.error(`[ComponentTools] Error setting property:`, error);
            return (0, response_1.fail)(`Failed to set property: ${error.message}`);
        }
    }
    async attachScriptImpl(nodeUuid, scriptPath) {
        return new Promise(async (resolve) => {
            var _a, _b;
            // 從腳本路徑提取組件類名
            const scriptName = (_a = scriptPath.split('/').pop()) === null || _a === void 0 ? void 0 : _a.replace('.ts', '').replace('.js', '');
            if (!scriptName) {
                resolve((0, response_1.fail)('Invalid script path'));
                return;
            }
            // 先查找節點上是否已存在該腳本組件
            const allComponentsInfo = await this.getComponentsImpl(nodeUuid);
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
                const allComponentsInfo2 = await this.getComponentsImpl(nodeUuid);
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
    async getAvailableComponentsImpl(category = 'all') {
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
            const componentInfo = await this.getComponentInfoImpl(nodeUuid, componentType);
            (0, log_1.debugLog)(`[verifyPropertyChange] getComponentInfo success:`, componentInfo.success);
            const allComponents = await this.getComponentsImpl(nodeUuid);
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
            const componentIndex = (0, component_lookup_1.findComponentIndexByType)(rawNodeData.__comps__, componentType);
            const component = componentIndex === -1 ? null : rawNodeData.__comps__[componentIndex];
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
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'add_component',
        title: 'Add node component',
        description: '[specialist] Add a component to a node. Mutates scene; verify the component type or script class name first. Accepts reference={id,type} (preferred), nodeUuid, or nodeName.',
        inputSchema: schema_1.z.object({
            reference: instance_reference_1.instanceReferenceSchema.optional().describe('InstanceReference {id,type} for the host node. Preferred form.'),
            nodeUuid: schema_1.z.string().optional().describe('Target node UUID. Used when reference is omitted.'),
            nodeName: schema_1.z.string().optional().describe('Target node name (depth-first first match). Used when reference and nodeUuid are omitted.'),
            componentType: schema_1.z.string().describe('Component type to add, e.g. cc.Sprite, cc.Label, cc.Button, or a custom script class name.'),
        }),
    })
], ComponentTools.prototype, "addComponent", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'remove_component',
        title: 'Remove node component',
        description: "[specialist] Remove a component from a node. Mutates scene; componentType must be the cid/type returned by get_components, not a guessed script name.",
        inputSchema: schema_1.z.object({
            nodeUuid: schema_1.z.string().describe('Node UUID that owns the component to remove.'),
            componentType: schema_1.z.string().describe('Component cid (type field from getComponents). Do NOT use script name or class name. Example: "cc.Sprite" or "9b4a7ueT9xD6aRE+AlOusy1"'),
        }),
    })
], ComponentTools.prototype, "removeComponent", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'get_components',
        title: 'List node components',
        description: '[specialist] List all components on a node. Includes type/cid and basic properties; use before remove_component or set_component_property.',
        inputSchema: schema_1.z.object({
            nodeUuid: schema_1.z.string().describe('Node UUID whose components should be listed.'),
        }),
    })
], ComponentTools.prototype, "getComponents", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'get_component_info',
        title: 'Read component info',
        description: '[specialist] Read detailed data for one component on a node. No mutation; use to inspect property names and value shapes before editing.',
        inputSchema: schema_1.z.object({
            nodeUuid: schema_1.z.string().describe('Node UUID that owns the component.'),
            componentType: schema_1.z.string().describe('Component type/cid to inspect. Use get_components first if unsure.'),
        }),
    })
], ComponentTools.prototype, "getComponentInfo", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'auto_bind',
        title: 'Auto-bind component references',
        description: '[specialist] Walk a script component\'s @property reference fields and bind each to a matching scene node by name. strict mode requires exact case-sensitive name; fuzzy mode matches case-insensitive substring. force=false skips already-bound fields.',
        inputSchema: schema_1.z.object({
            nodeUuid: schema_1.z.string().describe('Node UUID that owns the script component.'),
            componentType: schema_1.z.string().describe('Component type or cid (from get_components). E.g. "MyScript" or a cid string.'),
            mode: schema_1.z.enum(['strict', 'fuzzy']).default('strict').describe('strict=exact case-sensitive name match; fuzzy=case-insensitive substring match.'),
            force: schema_1.z.boolean().default(false).describe('If false, skip properties that already have a non-null bound value. If true, overwrite.'),
        }),
    })
], ComponentTools.prototype, "autoBindComponent", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'set_component_property',
        title: 'Set component property',
        description: '[specialist] Set one property on a node component. Supports built-in UI and custom script components. Accepts reference={id,type} (preferred), nodeUuid, or nodeName. Note: For node basic properties (name, active, layer, etc.), use set_node_property. For node transform properties (position, rotation, scale, etc.), use set_node_transform.',
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
    })
], ComponentTools.prototype, "setComponentPropertyTool", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'attach_script',
        title: 'Attach script component',
        description: '[specialist] Attach a script asset as a component to a node. Mutates scene; use get_components afterward because custom scripts may appear as cid.',
        inputSchema: schema_1.z.object({
            nodeUuid: schema_1.z.string().describe('Node UUID to attach the script component to.'),
            scriptPath: schema_1.z.string().describe('Script asset db:// path, e.g. db://assets/scripts/MyScript.ts.'),
        }),
    })
], ComponentTools.prototype, "attachScript", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'resolve_script_class',
        title: 'Resolve script class name',
        description: '[specialist] Resolve a Cocos TypeScript script asset URL or UUID to @ccclass class names. Use before add_component, add_event_handler, or other calls that need a custom script class name.',
        inputSchema: schema_1.z.object({
            script: schema_1.z.string().describe('Script asset db:// URL or asset UUID, e.g. db://assets/scripts/MyScript.ts.'),
        }),
    })
], ComponentTools.prototype, "resolveScriptClass", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'get_available_components',
        title: 'List available components',
        description: '[specialist] List curated built-in component types by category. No scene query; custom project scripts are not discovered here.',
        inputSchema: schema_1.z.object({
            category: schema_1.z.enum(['all', 'renderer', 'ui', 'physics', 'animation', 'audio']).default('all').describe('Component category filter for the built-in curated list.'),
        }),
    })
], ComponentTools.prototype, "getAvailableComponents", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'add_event_handler',
        title: 'Add event handler',
        description: '[specialist] Append a cc.EventHandler to a component event array. Nudges the editor model for persistence. Mutates scene; use for Button/Toggle/Slider callbacks.',
        inputSchema: schema_1.z.object({
            nodeUuid: schema_1.z.string().describe('Node UUID owning the component (e.g. the Button node)'),
            componentType: schema_1.z.string().default('cc.Button').describe('Component class name; defaults to cc.Button'),
            eventArrayProperty: schema_1.z.string().default('clickEvents').describe('Component property holding the EventHandler array (cc.Button.clickEvents, cc.Toggle.checkEvents, …)'),
            targetNodeUuid: schema_1.z.string().describe('Node UUID where the callback component lives (most often the same as nodeUuid)'),
            componentName: schema_1.z.string().describe('Class name (cc-class) of the script that owns the callback method'),
            handler: schema_1.z.string().describe('Method name on the target component, e.g. "onClick"'),
            customEventData: schema_1.z.string().optional().describe('Optional string passed back when the event fires'),
        }),
    })
], ComponentTools.prototype, "addEventHandler", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'remove_event_handler',
        title: 'Remove event handler',
        description: '[specialist] Remove EventHandler entries from a component event array. Nudges the editor model for persistence. Mutates scene; match by index or targetNodeUuid+handler.',
        inputSchema: schema_1.z.object({
            nodeUuid: schema_1.z.string().describe('Node UUID owning the component'),
            componentType: schema_1.z.string().default('cc.Button').describe('Component class name'),
            eventArrayProperty: schema_1.z.string().default('clickEvents').describe('EventHandler array property name'),
            index: schema_1.z.number().int().min(0).optional().describe('Zero-based index to remove. Takes precedence over targetNodeUuid/handler matching when provided.'),
            targetNodeUuid: schema_1.z.string().optional().describe('Match handlers whose target node has this UUID'),
            handler: schema_1.z.string().optional().describe('Match handlers with this method name'),
        }),
    })
], ComponentTools.prototype, "removeEventHandler", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'list_event_handlers',
        title: 'List event handlers',
        description: '[specialist] List EventHandler entries on a component event array. No mutation; use before remove_event_handler.',
        inputSchema: schema_1.z.object({
            nodeUuid: schema_1.z.string().describe('Node UUID owning the component'),
            componentType: schema_1.z.string().default('cc.Button').describe('Component class name'),
            eventArrayProperty: schema_1.z.string().default('clickEvents').describe('EventHandler array property name'),
        }),
    })
], ComponentTools.prototype, "listEventHandlers", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'set_component_properties',
        title: 'Set component properties',
        description: '[specialist] Batch-set multiple properties on the same component in one tool call. Mutates scene; each property is written sequentially through set_component_property to share nodeUuid+componentType resolution. Returns per-entry success/error so partial failures are visible. Use when AI needs to set 3+ properties on a single component at once. Accepts reference={id,type} (preferred), nodeUuid, or nodeName.',
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
    })
], ComponentTools.prototype, "setComponentProperties", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tcG9uZW50LXRvb2xzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL3Rvb2xzL2NvbXBvbmVudC10b29scy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7QUFBQSw4Q0FBMkM7QUFFM0Msb0NBQXNDO0FBQ3RDLDBDQUFrQztBQUNsQyxrREFBdUU7QUFDdkUsc0RBQW1GO0FBRW5GLGtFQUFzRjtBQUN0RixnRUFBbUU7QUFDbkUsOERBQW1FO0FBQ25FLG9EQUFnRDtBQUVoRDs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQTRCRztBQUNILEtBQUssVUFBVSxnQkFBZ0IsQ0FDM0IsUUFBZ0IsRUFDaEIsYUFBcUIsRUFDckIsYUFBc0I7O0lBRXRCLElBQUksQ0FBQztRQUNELE1BQU0sUUFBUSxHQUFRLE1BQU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLFlBQVksRUFBRSxRQUFRLENBQUMsQ0FBQztRQUNwRixNQUFNLEtBQUssR0FBVSxNQUFBLFFBQVEsYUFBUixRQUFRLHVCQUFSLFFBQVEsQ0FBRSxTQUFTLG1DQUFJLEVBQUUsQ0FBQztRQUMvQyxJQUFJLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUNiLElBQUksYUFBYSxFQUFFLENBQUM7WUFDaEIsR0FBRyxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUUsZUFBQyxPQUFBLENBQUMsTUFBQSxNQUFBLENBQUMsYUFBRCxDQUFDLHVCQUFELENBQUMsQ0FBRSxJQUFJLDBDQUFFLEtBQUssbUNBQUksQ0FBQyxhQUFELENBQUMsdUJBQUQsQ0FBQyxDQUFFLElBQUksQ0FBQyxLQUFLLGFBQWEsQ0FBQSxFQUFBLENBQUMsQ0FBQztRQUM5RSxDQUFDO1FBQ0QsSUFBSSxHQUFHLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQztZQUNiLEdBQUcsR0FBRyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxFQUFF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QUFHLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUU1QixnQ0FBZ0M7UUFDaEMsSUFBSSxHQUFHLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDdEIsSUFBSSxHQUFHLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUMsVUFBVTtnQkFDOUIsTUFBTSxDQUFDLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUM1QyxNQUFNLENBQUMsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7Z0JBQzVDLE1BQU0sQ0FBQyxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztnQkFDNUMsT0FBTyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQztZQUMvQixDQUFDO2lCQUFNLElBQUksR0FBRyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDLFlBQVk7Z0JBQ3ZDLE1BQU0sQ0FBQyxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztnQkFDNUMsTUFBTSxDQUFDLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUM1QyxNQUFNLENBQUMsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7Z0JBQzVDLE1BQU0sQ0FBQyxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLENBQUMsRUFB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QUM3RixRQUFRLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsRUFBRSxDQUFDLFFBQVEsQ0FBQywyRkFBMkYsQ0FBQztZQUNySSxhQUFhLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQywyQ0FBMkMsQ0FBQztZQUMvRSxVQUFVLEVBQUUsVUFBQyxDQUFDLEtBQUssQ0FBQyxVQUFDLENBQUMsTUFBTSxDQUFDO2dCQUN6QixRQUFRLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyxpRUFBaUUsQ0FBQztnQkFDaEcsWUFBWSxFQUFFLFVBQUMsQ0FBQyxJQUFJLENBQUM7b0JBQ2pCLFFBQVEsRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxPQUFPO29CQUNqRCxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxNQUFNO29CQUMvQixNQUFNLEVBQUUsV0FBVyxFQUFFLGFBQWEsRUFBRSxRQUFRLEVBQUUsT0FBTztvQkFDckQsV0FBVyxFQUFFLFlBQVksRUFBRSxhQUFhLEVBQUUsYUFBYTtpQkFDMUQsQ0FBQyxDQUFDLFFBQVEsQ0FBQywwQ0FBMEMsQ0FBQztnQkFDdkQsS0FBSyxFQUFFLFVBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxRQUFRLENBQUMsdUNBQXVDLENBQUM7Z0JBQ2hFLG1CQUFtQixFQUFFLFVBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUMsUUFBUSxDQUFDLHNHQUFzRyxDQUFDO2FBQ25LLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLDBDQUEwQyxDQUFDO1NBQzFFLENBQUM7S0FDTCxDQUFDOzREQWtDRCIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IG9rLCBmYWlsIH0gZnJvbSAnLi4vbGliL3Jlc3BvbnNlJztcbmltcG9ydCB0eXBlIHsgVG9vbERlZmluaXRpb24sIFRvb2xSZXNwb25zZSwgVG9vbEV4ZWN1dG9yLCBDb21wb25lbnRJbmZvIH0gZnJvbSAnLi4vdHlwZXMnO1xuaW1wb3J0IHsgZGVidWdMb2cgfSBmcm9tICcuLi9saWIvbG9nJztcbmltcG9ydCB7IHogfSBmcm9tICcuLi9saWIvc2NoZW1hJztcbmltcG9ydCB7IG1jcFRvb2wsIGRlZmluZVRvb2xzRnJvbURlY29yYXRvcnMgfSBmcm9tICcuLi9saWIvZGVjb3JhdG9ycyc7XG5pbXBvcnQgeyBydW5TY2VuZU1ldGhvZCwgcnVuU2NlbmVNZXRob2RBc1Rvb2xSZXNwb25zZSB9IGZyb20gJy4uL2xpYi9zY2VuZS1icmlkZ2UnO1xuaW1wb3J0IHsgcmVzb2x2ZU9yVG9vbEVycm9yIH0gZnJvbSAnLi4vbGliL3Jlc29sdmUtbm9kZSc7XG5pbXBvcnQgeyBpbnN0YW5jZVJlZmVyZW5jZVNjaGVtYSwgcmVzb2x2ZVJlZmVyZW5jZSB9IGZyb20gJy4uL2xpYi9pbnN0YW5jZS1yZWZlcmVuY2UnO1xuaW1wb3J0IHsgcmVzb2x2ZUNjY2xhc3NGcm9tQXNzZXQgfSBmcm9tICcuLi9saWIvY2NjbGFzcy1leHRyYWN0b3InO1xuaW1wb3J0IHsgZmluZENvbXBvbmVudEluZGV4QnlUeXBlIH0gZnJvbSAnLi4vbGliL2NvbXBvbmVudC1sb29rdXAnO1xuaW1wb3J0IHsgZHVtcFVud3JhcCB9IGZyb20gJy4uL2xpYi9kdW1wLXVud3JhcCc7XG5cbi8qKlxuICogRm9yY2UgdGhlIGVkaXRvcidzIHNlcmlhbGl6YXRpb24gbW9kZWwgdG8gcmUtcHVsbCBhIGNvbXBvbmVudCBkdW1wXG4gKiBmcm9tIHJ1bnRpbWUuIENMQVVERS5tZCBMYW5kbWluZSAjMTE6IHNjZW5lLXNjcmlwdCBgYXJyLnB1c2hgIG11dGF0aW9uc1xuICogb25seSB0b3VjaCB0aGUgcnVudGltZTsgdGhlIG1vZGVsIHRoYXQgYHNhdmUtc2NlbmVgIHdyaXRlcyB0byBkaXNrIGlzXG4gKiBvbmx5IHVwZGF0ZWQgd2hlbiBjaGFuZ2VzIGZsb3cgdGhyb3VnaCB0aGUgZWRpdG9yJ3Mgc2V0LXByb3BlcnR5XG4gKiBjaGFubmVsLlxuICpcbiAqIENhbGxpbmcgYHNldC1wcm9wZXJ0eWAgZnJvbSBpbnNpZGUgc2NlbmUtc2NyaXB0IGRvZXNuJ3QgcHJvcGFnYXRlICh0aGVcbiAqIHNjZW5lLXByb2Nlc3MgSVBDIHNob3J0LWNpcmN1aXRzKS4gVGhlIG51ZGdlIG11c3QgY29tZSBmcm9tIGhvc3Qgc2lkZS5cbiAqXG4gKiBUaGUgc2V0LXByb3BlcnR5IGNoYW5uZWwgZm9yIGNvbXBvbmVudCBwcm9wZXJ0aWVzIHVzZXMgYSBub2RlLXJvb3RlZFxuICogcGF0aDogYHV1aWQgPSBub2RlVXVpZGAsIGBwYXRoID0gX19jb21wc19fLjxpbmRleD4uPHByb3BlcnR5PmAuIFdlXG4gKiBxdWVyeSB0aGUgbm9kZSwgbG9jYXRlIHRoZSBtYXRjaGluZyBjb21wb25lbnQsIGFuZCBzZXQgYGVuYWJsZWRgIHRvXG4gKiBpdHMgY3VycmVudCB2YWx1ZSAobm8tb3Agc2VtYW50aWNhbGx5LCBmb3JjZXMgc3luYykuXG4gKlxuICogTG9va3VwIHByZWNlZGVuY2U6XG4gKiAgIDEuIGBjb21wb25lbnRVdWlkYCAocHJlY2lzZSDigJQgZGlzYW1iaWd1YXRlcyBtdWx0aXBsZSBzYW1lLXR5cGVcbiAqICAgICAgY29tcG9uZW50cyBvbiB0aGUgc2FtZSBub2RlKS5cbiAqICAgMi4gYGNvbXBvbmVudFR5cGVgIGZhbGxiYWNrIGlmIHV1aWQgd2Fzbid0IHN1cHBsaWVkIG9yIGRpZG4ndFxuICogICAgICBtYXRjaCAoY292ZXJzIHRlc3RzIC8gb2xkZXIgY2FsbGVycykuXG4gKlxuICogYGVuYWJsZWRWYWx1ZWAgaXMgcmVhZCBkZWZlbnNpdmVseSBiZWNhdXNlIHRoZSBgcXVlcnktbm9kZWAgZHVtcCBzaGFwZVxuICogdmFyaWVzIGFjcm9zcyBDb2NvcyB2ZXJzaW9uczogcHJvcGVydGllcyBjYW4gYmUgZmxhdCAoYGNvbXAuZW5hYmxlZGApXG4gKiBvciBuZXN0ZWQgKGBjb21wLnZhbHVlLmVuYWJsZWQudmFsdWVgKS4gV2UgdHJ5IG5lc3RlZCBmaXJzdCwgZmFsbFxuICogYmFjayB0byBmbGF0IOKAlCBtYXRjaGVzIHRoZSBwYXR0ZXJuIHVzZWQgYnkgYGdldENvbXBvbmVudHNgLlxuICpcbiAqIEJlc3QtZWZmb3J0OiBmYWlsdXJlcyBhcmUgc3dhbGxvd2VkIGJlY2F1c2UgdGhlIHJ1bnRpbWUgbXV0YXRpb25cbiAqIGFscmVhZHkgaGFwcGVuZWQg4oCUIG9ubHkgcGVyc2lzdGVuY2UgdG8gZGlzayBpcyBhdCBzdGFrZS5cbiAqL1xuYXN5bmMgZnVuY3Rpb24gbnVkZ2VFZGl0b3JNb2RlbChcbiAgICBub2RlVXVpZDogc3RyaW5nLFxuICAgIGNvbXBvbmVudFR5cGU6IHN0cmluZyxcbiAgICBjb21wb25lbnRVdWlkPzogc3RyaW5nLFxuKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3Qgbm9kZURhdGE6IGFueSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LW5vZGUnLCBub2RlVXVpZCk7XG4gICAgICAgIGNvbnN0IGNvbXBzOiBhbnlbXSA9IG5vZGVEYXRhPy5fX2NvbXBzX18gPz8gW107XG4gICAgICAgIGxldCBpZHggPSAtMTtcbiAgICAgICAgaWYgKGNvbXBvbmVudFV1aWQpIHtcbiAgICAgICAgICAgIGlkeCA9IGNvbXBzLmZpbmRJbmRleChjID0+IChjPy51dWlkPy52YWx1ZSA/PyBjPy51dWlkKSA9PT0gY29tcG9uZW50VXVpZCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGlkeCA9PT0gLTEpIHtcbiAgICAgICAgICAgIGlkeCA9IGNvbXBzLmZpbmRJbmRleChjID0+IChjPy5fX3R5cGVfXyB8fCBjPy5jaWQgfHwgYz8udHlwZSkgPT09IGNvbXBvbmVudFR5cGUpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChpZHggPT09IC0xKSByZXR1cm47XG4gICAgICAgIGNvbnN0IHJhdyA9IGNvbXBzW2lkeF07XG4gICAgICAgIGNvbnN0IGVuYWJsZWRWYWx1ZTogYm9vbGVhbiA9XG4gICAgICAgICAgICByYXc/LnZhbHVlPy5lbmFibGVkPy52YWx1ZSAhPT0gdW5kZWZpbmVkXG4gICAgICAgICAgICAgICAgPyByYXcudmFsdWUuZW5hYmxlZC52YWx1ZSAhPT0gZmFsc2VcbiAgICAgICAgICAgICAgICA6IHJhdz8uZW5hYmxlZCAhPT0gZmFsc2U7XG4gICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3NldC1wcm9wZXJ0eScsIHtcbiAgICAgICAgICAgIHV1aWQ6IG5vZGVVdWlkLFxuICAgICAgICAgICAgcGF0aDogYF9fY29tcHNfXy4ke2lkeH0uZW5hYmxlZGAsXG4gICAgICAgICAgICBkdW1wOiB7IHZhbHVlOiBlbmFibGVkVmFsdWUgfSxcbiAgICAgICAgfSk7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIGRlYnVnTG9nKCdbQ29tcG9uZW50VG9vbHNdIG51ZGdlIHNldC1wcm9wZXJ0eSBmYWlsZWQgKG5vbi1mYXRhbCk6JywgZXJyKTtcbiAgICB9XG59XG5cbmNvbnN0IHNldENvbXBvbmVudFByb3BlcnR5VmFsdWVEZXNjcmlwdGlvbiA9XG4gICAgJ1Byb3BlcnR5IHZhbHVlIC0gVXNlIHRoZSBjb3JyZXNwb25kaW5nIGRhdGEgZm9ybWF0IGJhc2VkIG9uIHByb3BlcnR5VHlwZTpcXG5cXG4nICtcbiAgICAn8J+TnSBCYXNpYyBEYXRhIFR5cGVzOlxcbicgK1xuICAgICfigKIgc3RyaW5nOiBcIkhlbGxvIFdvcmxkXCIgKHRleHQgc3RyaW5nKVxcbicgK1xuICAgICfigKIgbnVtYmVyL2ludGVnZXIvZmxvYXQ6IDQyIG9yIDMuMTQgKG51bWVyaWMgdmFsdWUpXFxuJyArXG4gICAgJ+KAoiBib29sZWFuOiB0cnVlIG9yIGZhbHNlIChib29sZWFuIHZhbHVlKVxcblxcbicgK1xuICAgICfwn46oIENvbG9yIFR5cGU6XFxuJyArXG4gICAgJ+KAoiBjb2xvcjoge1wiclwiOjI1NSxcImdcIjowLFwiYlwiOjAsXCJhXCI6MjU1fSAoUkdCQSB2YWx1ZXMsIHJhbmdlIDAtMjU1KVxcbicgK1xuICAgICcgIC0gQWx0ZXJuYXRpdmU6IFwiI0ZGMDAwMFwiIChoZXhhZGVjaW1hbCBmb3JtYXQpXFxuJyArXG4gICAgJyAgLSBUcmFuc3BhcmVuY3k6IGEgdmFsdWUgY29udHJvbHMgb3BhY2l0eSwgMjU1ID0gZnVsbHkgb3BhcXVlLCAwID0gZnVsbHkgdHJhbnNwYXJlbnRcXG5cXG4nICtcbiAgICAn8J+TkCBWZWN0b3IgYW5kIFNpemUgVHlwZXM6XFxuJyArXG4gICAgJ+KAoiB2ZWMyOiB7XCJ4XCI6MTAwLFwieVwiOjUwfSAoMkQgdmVjdG9yKVxcbicgK1xuICAgICfigKIgdmVjMzoge1wieFwiOjEsXCJ5XCI6MixcInpcIjozfSAoM0QgdmVjdG9yKVxcbicgK1xuICAgICfigKIgc2l6ZToge1wid2lkdGhcIjoxMDAsXCJoZWlnaHRcIjo1MH0gKHNpemUgZGltZW5zaW9ucylcXG5cXG4nICtcbiAgICAn8J+UlyBSZWZlcmVuY2UgVHlwZXMgKHVzaW5nIFVVSUQgc3RyaW5ncyk6XFxuJyArXG4gICAgJ+KAoiBub2RlOiBcInRhcmdldC1ub2RlLXV1aWRcIiAoY2MuTm9kZSByZWZlcmVuY2Ug4oCUIHByb3BlcnR5IG1ldGFkYXRhIHR5cGUgPT09IFwiY2MuTm9kZVwiKVxcbicgK1xuICAgICcgIEhvdyB0byBnZXQ6IFVzZSBnZXRfYWxsX25vZGVzIG9yIGZpbmRfbm9kZV9ieV9uYW1lIHRvIGdldCBub2RlIFVVSURzXFxuJyArXG4gICAgJ+KAoiBjb21wb25lbnQ6IFwidGFyZ2V0LW5vZGUtdXVpZFwiIChjYy5Db21wb25lbnQgc3ViY2xhc3MgcmVmZXJlbmNlIOKAlCBlLmcuIGNjLkNhbWVyYSwgY2MuU3ByaXRlKVxcbicgK1xuICAgICcgIOKaoO+4jyBFYXN5IHRvIGNvbmZ1c2Ugd2l0aCBcIm5vZGVcIjogcGljayBcImNvbXBvbmVudFwiIHdoZW5ldmVyIHRoZSBwcm9wZXJ0eVxcbicgK1xuICAgICcgICAgIG1ldGFkYXRhIGV4cGVjdHMgYSBDb21wb25lbnQgc3ViY2xhc3MsIGV2ZW4gdGhvdWdoIHRoZSB2YWx1ZSBpcyBzdGlsbFxcbicgK1xuICAgICcgICAgIGEgTk9ERSBVVUlEICh0aGUgc2VydmVyIGF1dG8tcmVzb2x2ZXMgdGhlIGNvbXBvbmVudFxcJ3Mgc2NlbmUgX19pZF9fKS5cXG4nICtcbiAgICAnICBFeGFtcGxlIOKAlCBjYy5DYW52YXMuY2FtZXJhQ29tcG9uZW50IGV4cGVjdHMgYSBjYy5DYW1lcmEgcmVmOlxcbicgK1xuICAgICcgICAgIHByb3BlcnR5VHlwZTogXCJjb21wb25lbnRcIiwgdmFsdWU6IFwiPFVVSUQgb2Ygbm9kZSB0aGF0IGhhcyBjYy5DYW1lcmE+XCJcXG4nICtcbiAgICAnICBQaXRmYWxsOiBwYXNzaW5nIHByb3BlcnR5VHlwZTogXCJub2RlXCIgZm9yIGNhbWVyYUNvbXBvbmVudCBhcHBlYXJzIHRvXFxuJyArXG4gICAgJyAgICAgc3VjY2VlZCBhdCB0aGUgSVBDIGxheWVyIGJ1dCB0aGUgcmVmZXJlbmNlIG5ldmVyIGNvbm5lY3RzLlxcbicgK1xuICAgICfigKIgc3ByaXRlRnJhbWU6IFwic3ByaXRlZnJhbWUtdXVpZFwiIChzcHJpdGUgZnJhbWUgYXNzZXQpXFxuJyArXG4gICAgJyAgSG93IHRvIGdldDogQ2hlY2sgYXNzZXQgZGF0YWJhc2Ugb3IgdXNlIGFzc2V0IGJyb3dzZXJcXG4nICtcbiAgICAnICDimqDvuI8gRGVmYXVsdCBjYy5TcHJpdGUuc2l6ZU1vZGUgaXMgVFJJTU1FRCAoMSksIHNvIGFzc2lnbmluZyBzcHJpdGVGcmFtZVxcbicgK1xuICAgICcgICAgIGF1dG8tcmVzaXplcyBjYy5VSVRyYW5zZm9ybS5jb250ZW50U2l6ZSB0byB0aGUgdGV4dHVyZSBuYXRpdmUgc2l6ZS5cXG4nICtcbiAgICAnICAgICBQYXNzIHByZXNlcnZlQ29udGVudFNpemU6IHRydWUgdG8ga2VlcCB0aGUgbm9kZVxcJ3MgY3VycmVudCBjb250ZW50U2l6ZVxcbicgK1xuICAgICcgICAgICh0aGUgc2VydmVyIHByZS1zZXRzIHNpemVNb2RlIHRvIENVU1RPTSAoMCkgYmVmb3JlIHRoZSBhc3NpZ24pLlxcbicgK1xuICAgICfigKIgcHJlZmFiOiBcInByZWZhYi11dWlkXCIgKHByZWZhYiBhc3NldClcXG4nICtcbiAgICAnICBIb3cgdG8gZ2V0OiBDaGVjayBhc3NldCBkYXRhYmFzZSBvciB1c2UgYXNzZXQgYnJvd3NlclxcbicgK1xuICAgICfigKIgYXNzZXQ6IFwiYXNzZXQtdXVpZFwiIChnZW5lcmljIGFzc2V0IHJlZmVyZW5jZSlcXG4nICtcbiAgICAnICBIb3cgdG8gZ2V0OiBDaGVjayBhc3NldCBkYXRhYmFzZSBvciB1c2UgYXNzZXQgYnJvd3NlclxcblxcbicgK1xuICAgICfwn5OLIEFycmF5IFR5cGVzOlxcbicgK1xuICAgICfigKIgbm9kZUFycmF5OiBbXCJ1dWlkMVwiLFwidXVpZDJcIl0gKGFycmF5IG9mIG5vZGUgVVVJRHMpXFxuJyArXG4gICAgJ+KAoiBjb2xvckFycmF5OiBbe1wiclwiOjI1NSxcImdcIjowLFwiYlwiOjAsXCJhXCI6MjU1fV0gKGFycmF5IG9mIGNvbG9ycylcXG4nICtcbiAgICAn4oCiIG51bWJlckFycmF5OiBbMSwyLDMsNCw1XSAoYXJyYXkgb2YgbnVtYmVycylcXG4nICtcbiAgICAn4oCiIHN0cmluZ0FycmF5OiBbXCJpdGVtMVwiLFwiaXRlbTJcIl0gKGFycmF5IG9mIHN0cmluZ3MpJztcblxuY29uc3Qgc2V0Q29tcG9uZW50UHJvcGVydHlQcm9wZXJ0eURlc2NyaXB0aW9uID1cbiAgICAnUHJvcGVydHkgbmFtZSAtIFRoZSBwcm9wZXJ0eSB0byBzZXQuIENvbW1vbiBwcm9wZXJ0aWVzIGluY2x1ZGU6XFxuJyArXG4gICAgJ+KAoiBjYy5MYWJlbDogc3RyaW5nICh0ZXh0IGNvbnRlbnQpLCBmb250U2l6ZSAoZm9udCBzaXplKSwgY29sb3IgKHRleHQgY29sb3IpXFxuJyArXG4gICAgJ+KAoiBjYy5TcHJpdGU6IHNwcml0ZUZyYW1lIChzcHJpdGUgZnJhbWUpLCBjb2xvciAodGludCBjb2xvciksIHNpemVNb2RlIChzaXplIG1vZGUpXFxuJyArXG4gICAgJ+KAoiBjYy5CdXR0b246IG5vcm1hbENvbG9yIChub3JtYWwgY29sb3IpLCBwcmVzc2VkQ29sb3IgKHByZXNzZWQgY29sb3IpLCB0YXJnZXQgKHRhcmdldCBub2RlIOKAlCBwcm9wZXJ0eVR5cGU6IFwibm9kZVwiKVxcbicgK1xuICAgICfigKIgY2MuQ2FudmFzOiBjYW1lcmFDb21wb25lbnQgKGNjLkNhbWVyYSByZWYg4oCUIHByb3BlcnR5VHlwZTogXCJjb21wb25lbnRcIiwgdmFsdWUgPSBub2RlIFVVSUQgaG9zdGluZyB0aGUgY2FtZXJhKVxcbicgK1xuICAgICfigKIgY2MuVUlUcmFuc2Zvcm06IGNvbnRlbnRTaXplIChjb250ZW50IHNpemUpLCBhbmNob3JQb2ludCAoYW5jaG9yIHBvaW50KVxcbicgK1xuICAgICfigKIgQ3VzdG9tIFNjcmlwdHM6IEJhc2VkIG9uIHByb3BlcnRpZXMgZGVmaW5lZCBpbiB0aGUgc2NyaXB0JztcblxuZXhwb3J0IGNsYXNzIENvbXBvbmVudFRvb2xzIGltcGxlbWVudHMgVG9vbEV4ZWN1dG9yIHtcbiAgICBwcml2YXRlIHJlYWRvbmx5IGV4ZWM6IFRvb2xFeGVjdXRvcjtcblxuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICB0aGlzLmV4ZWMgPSBkZWZpbmVUb29sc0Zyb21EZWNvcmF0b3JzKHRoaXMpO1xuICAgIH1cblxuICAgIGdldFRvb2xzKCk6IFRvb2xEZWZpbml0aW9uW10geyByZXR1cm4gdGhpcy5leGVjLmdldFRvb2xzKCk7IH1cbiAgICBleGVjdXRlKHRvb2xOYW1lOiBzdHJpbmcsIGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7IHJldHVybiB0aGlzLmV4ZWMuZXhlY3V0ZSh0b29sTmFtZSwgYXJncyk7IH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ2FkZF9jb21wb25lbnQnLFxuICAgICAgICB0aXRsZTogJ0FkZCBub2RlIGNvbXBvbmVudCcsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIEFkZCBhIGNvbXBvbmVudCB0byBhIG5vZGUuIE11dGF0ZXMgc2NlbmU7IHZlcmlmeSB0aGUgY29tcG9uZW50IHR5cGUgb3Igc2NyaXB0IGNsYXNzIG5hbWUgZmlyc3QuIEFjY2VwdHMgcmVmZXJlbmNlPXtpZCx0eXBlfSAocHJlZmVycmVkKSwgbm9kZVV1aWQsIG9yIG5vZGVOYW1lLicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICByZWZlcmVuY2U6IGluc3RhbmNlUmVmZXJlbmNlU2NoZW1hLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0luc3RhbmNlUmVmZXJlbmNlIHtpZCx0eXBlfSBmb3IgdGhlIGhvc3Qgbm9kZS4gUHJlZmVycmVkIGZvcm0uJyksXG4gICAgICAgICAgICBub2RlVXVpZDogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdUYXJnZXQgbm9kZSBVVUlELiBVc2VkIHdoZW4gcmVmZXJlbmNlIGlzIG9taXR0ZWQuJyksXG4gICAgICAgICAgICBub2RlTmFtZTogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdUYXJnZXQgbm9kZSBuYW1lIChkZXB0aC1maXJzdCBmaXJzdCBtYXRjaCkuIFVzZWQgd2hlbiByZWZlcmVuY2UgYW5kIG5vZGVVdWlkIGFyZSBvbWl0dGVkLicpLFxuICAgICAgICAgICAgY29tcG9uZW50VHlwZTogei5zdHJpbmcoKS5kZXNjcmliZSgnQ29tcG9uZW50IHR5cGUgdG8gYWRkLCBlLmcuIGNjLlNwcml0ZSwgY2MuTGFiZWwsIGNjLkJ1dHRvbiwgb3IgYSBjdXN0b20gc2NyaXB0IGNsYXNzIG5hbWUuJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgYWRkQ29tcG9uZW50KGE6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHIgPSBhd2FpdCByZXNvbHZlUmVmZXJlbmNlKHsgcmVmZXJlbmNlOiBhLnJlZmVyZW5jZSwgbm9kZVV1aWQ6IGEubm9kZVV1aWQsIG5vZGVOYW1lOiBhLm5vZGVOYW1lIH0pO1xuICAgICAgICBpZiAoJ3Jlc3BvbnNlJyBpbiByKSByZXR1cm4gci5yZXNwb25zZTtcbiAgICAgICAgcmV0dXJuIHRoaXMuYWRkQ29tcG9uZW50SW1wbChyLnV1aWQsIGEuY29tcG9uZW50VHlwZSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAncmVtb3ZlX2NvbXBvbmVudCcsXG4gICAgICAgIHRpdGxlOiAnUmVtb3ZlIG5vZGUgY29tcG9uZW50JyxcbiAgICAgICAgZGVzY3JpcHRpb246IFwiW3NwZWNpYWxpc3RdIFJlbW92ZSBhIGNvbXBvbmVudCBmcm9tIGEgbm9kZS4gTXV0YXRlcyBzY2VuZTsgY29tcG9uZW50VHlwZSBtdXN0IGJlIHRoZSBjaWQvdHlwZSByZXR1cm5lZCBieSBnZXRfY29tcG9uZW50cywgbm90IGEgZ3Vlc3NlZCBzY3JpcHQgbmFtZS5cIixcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIG5vZGVVdWlkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdOb2RlIFVVSUQgdGhhdCBvd25zIHRoZSBjb21wb25lbnQgdG8gcmVtb3ZlLicpLFxuICAgICAgICAgICAgY29tcG9uZW50VHlwZTogei5zdHJpbmcoKS5kZXNjcmliZSgnQ29tcG9uZW50IGNpZCAodHlwZSBmaWVsZCBmcm9tIGdldENvbXBvbmVudHMpLiBEbyBOT1QgdXNlIHNjcmlwdCBuYW1lIG9yIGNsYXNzIG5hbWUuIEV4YW1wbGU6IFwiY2MuU3ByaXRlXCIgb3IgXCI5YjRhN3VlVDl4RDZhUkUrQWxPdXN5MVwiJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgcmVtb3ZlQ29tcG9uZW50KGE6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLnJlbW92ZUNvbXBvbmVudEltcGwoYS5ub2RlVXVpZCwgYS5jb21wb25lbnRUeXBlKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdnZXRfY29tcG9uZW50cycsXG4gICAgICAgIHRpdGxlOiAnTGlzdCBub2RlIGNvbXBvbmVudHMnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBMaXN0IGFsbCBjb21wb25lbnRzIG9uIGEgbm9kZS4gSW5jbHVkZXMgdHlwZS9jaWQgYW5kIGJhc2ljIHByb3BlcnRpZXM7IHVzZSBiZWZvcmUgcmVtb3ZlX2NvbXBvbmVudCBvciBzZXRfY29tcG9uZW50X3Byb3BlcnR5LicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICBub2RlVXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnTm9kZSBVVUlEIHdob3NlIGNvbXBvbmVudHMgc2hvdWxkIGJlIGxpc3RlZC4nKSxcbiAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBnZXRDb21wb25lbnRzKGE6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldENvbXBvbmVudHNJbXBsKGEubm9kZVV1aWQpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ2dldF9jb21wb25lbnRfaW5mbycsXG4gICAgICAgIHRpdGxlOiAnUmVhZCBjb21wb25lbnQgaW5mbycsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFJlYWQgZGV0YWlsZWQgZGF0YSBmb3Igb25lIGNvbXBvbmVudCBvbiBhIG5vZGUuIE5vIG11dGF0aW9uOyB1c2UgdG8gaW5zcGVjdCBwcm9wZXJ0eSBuYW1lcyBhbmQgdmFsdWUgc2hhcGVzIGJlZm9yZSBlZGl0aW5nLicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICBub2RlVXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnTm9kZSBVVUlEIHRoYXQgb3ducyB0aGUgY29tcG9uZW50LicpLFxuICAgICAgICAgICAgY29tcG9uZW50VHlwZTogei5zdHJpbmcoKS5kZXNjcmliZSgnQ29tcG9uZW50IHR5cGUvY2lkIHRvIGluc3BlY3QuIFVzZSBnZXRfY29tcG9uZW50cyBmaXJzdCBpZiB1bnN1cmUuJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgZ2V0Q29tcG9uZW50SW5mbyhhOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRDb21wb25lbnRJbmZvSW1wbChhLm5vZGVVdWlkLCBhLmNvbXBvbmVudFR5cGUpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ2F1dG9fYmluZCcsXG4gICAgICAgIHRpdGxlOiAnQXV0by1iaW5kIGNvbXBvbmVudCByZWZlcmVuY2VzJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gV2FsayBhIHNjcmlwdCBjb21wb25lbnRcXCdzIEBwcm9wZXJ0eSByZWZlcmVuY2UgZmllbGRzIGFuZCBiaW5kIGVhY2ggdG8gYSBtYXRjaGluZyBzY2VuZSBub2RlIGJ5IG5hbWUuIHN0cmljdCBtb2RlIHJlcXVpcmVzIGV4YWN0IGNhc2Utc2Vuc2l0aXZlIG5hbWU7IGZ1enp5IG1vZGUgbWF0Y2hlcyBjYXNlLWluc2Vuc2l0aXZlIHN1YnN0cmluZy4gZm9yY2U9ZmFsc2Ugc2tpcHMgYWxyZWFkeS1ib3VuZCBmaWVsZHMuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIG5vZGVVdWlkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdOb2RlIFVVSUQgdGhhdCBvd25zIHRoZSBzY3JpcHQgY29tcG9uZW50LicpLFxuICAgICAgICAgICAgY29tcG9uZW50VHlwZTogei5zdHJpbmcoKS5kZXNjcmliZSgnQ29tcG9uZW50IHR5cGUgb3IgY2lkIChmcm9tIGdldF9jb21wb25lbnRzKS4gRS5nLiBcIk15U2NyaXB0XCIgb3IgYSBjaWQgc3RyaW5nLicpLFxuICAgICAgICAgICAgbW9kZTogei5lbnVtKFsnc3RyaWN0JywgJ2Z1enp5J10pLmRlZmF1bHQoJ3N0cmljdCcpLmRlc2NyaWJlKCdzdHJpY3Q9ZXhhY3QgY2FzZS1zZW5zaXRpdmUgbmFtZSBtYXRjaDsgZnV6enk9Y2FzZS1pbnNlbnNpdGl2ZSBzdWJzdHJpbmcgbWF0Y2guJyksXG4gICAgICAgICAgICBmb3JjZTogei5ib29sZWFuKCkuZGVmYXVsdChmYWxzZSkuZGVzY3JpYmUoJ0lmIGZhbHNlLCBza2lwIHByb3BlcnRpZXMgdGhhdCBhbHJlYWR5IGhhdmUgYSBub24tbnVsbCBib3VuZCB2YWx1ZS4gSWYgdHJ1ZSwgb3ZlcndyaXRlLicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIGF1dG9CaW5kQ29tcG9uZW50KGE6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IGR1bXA6IGFueSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LW5vZGUnLCBhLm5vZGVVdWlkKTtcbiAgICAgICAgaWYgKCFkdW1wKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbCgnbm9kZSBub3QgZm91bmQnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGNvbXBzOiBhbnlbXSA9IGR1bXAuX19jb21wc19fID8/IFtdO1xuICAgICAgICBjb25zdCBjb21wb25lbnRJbmRleCA9IGZpbmRDb21wb25lbnRJbmRleEJ5VHlwZShjb21wcywgYS5jb21wb25lbnRUeXBlKTtcbiAgICAgICAgaWYgKGNvbXBvbmVudEluZGV4ID09PSAtMSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ2NvbXBvbmVudCBub3QgZm91bmQnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGNvbXBvbmVudCA9IGNvbXBzW2NvbXBvbmVudEluZGV4XTtcbiAgICAgICAgY29uc3QgcHJvcGVydGllcyA9IGNvbXBvbmVudD8udmFsdWUgJiYgdHlwZW9mIGNvbXBvbmVudC52YWx1ZSA9PT0gJ29iamVjdCcgPyBjb21wb25lbnQudmFsdWUgOiBjb21wb25lbnQ7XG4gICAgICAgIGNvbnN0IHNraXBwZWRUeXBlcyA9IG5ldyBTZXQoW1xuICAgICAgICAgICAgJ1N0cmluZycsICdCb29sZWFuJywgJ0ludGVnZXInLCAnRmxvYXQnLCAnTnVtYmVyJywgJ0VudW0nLCAnQml0TWFzaycsXG4gICAgICAgICAgICAnY2MuVmVjMicsICdjYy5WZWMzJywgJ2NjLlZlYzQnLCAnY2MuQ29sb3InLCAnY2MuUmVjdCcsICdjYy5TaXplJyxcbiAgICAgICAgICAgICdjYy5RdWF0JywgJ2NjLk1hdDMnLCAnY2MuTWF0NCcsXG4gICAgICAgIF0pO1xuICAgICAgICBjb25zdCByZWZlcmVuY2VQcm9wcyA9IE9iamVjdC5lbnRyaWVzKHByb3BlcnRpZXMgPz8ge30pXG4gICAgICAgICAgICAuZmlsdGVyKChbcHJvcE5hbWUsIGVudHJ5XTogW3N0cmluZywgYW55XSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChwcm9wTmFtZS5zdGFydHNXaXRoKCdfXycpKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgaWYgKCFlbnRyeSB8fCB0eXBlb2YgZW50cnkgIT09ICdvYmplY3QnKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgaWYgKCFlbnRyeS50eXBlIHx8IHR5cGVvZiBlbnRyeS50eXBlICE9PSAnc3RyaW5nJykgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIGlmIChza2lwcGVkVHlwZXMuaGFzKGVudHJ5LnR5cGUpKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgaWYgKCFhLmZvcmNlICYmIGVudHJ5LnZhbHVlICE9PSBudWxsICYmIGVudHJ5LnZhbHVlICE9PSB1bmRlZmluZWQpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICByZXR1cm4gZW50cnkudHlwZSA9PT0gJ2NjLk5vZGUnIHx8IGVudHJ5LnR5cGUubGVuZ3RoID4gMDtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAubWFwKChbcHJvcGVydHksIGVudHJ5XTogW3N0cmluZywgYW55XSkgPT4gKHsgcHJvcGVydHksIGVudHJ5IH0pKTtcblxuICAgICAgICBjb25zdCB0cmVlOiBhbnkgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1ub2RlLXRyZWUnKTtcbiAgICAgICAgY29uc3Qgc2NlbmVOb2RlczogQXJyYXk8eyB1dWlkOiBzdHJpbmc7IG5hbWU6IHN0cmluZyB9PiA9IFtdO1xuICAgICAgICBjb25zdCBzdGFjazogYW55W10gPSB0cmVlID8gW3RyZWVdIDogW107XG4gICAgICAgIHdoaWxlIChzdGFjay5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBjb25zdCBub2RlID0gc3RhY2sucG9wKCk7XG4gICAgICAgICAgICBpZiAoIW5vZGUpIGNvbnRpbnVlO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBub2RlLnV1aWQgPT09ICdzdHJpbmcnICYmIHR5cGVvZiBub2RlLm5hbWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgc2NlbmVOb2Rlcy5wdXNoKHsgdXVpZDogbm9kZS51dWlkLCBuYW1lOiBub2RlLm5hbWUgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShub2RlLmNoaWxkcmVuKSkge1xuICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSBub2RlLmNoaWxkcmVuLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAgICAgICAgICAgICAgIHN0YWNrLnB1c2gobm9kZS5jaGlsZHJlbltpXSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgYm91bmQ6IEFycmF5PHsgcHJvcGVydHk6IHN0cmluZzsgbWF0Y2hlZE5vZGVVdWlkOiBzdHJpbmc7IG1hdGNoZWROb2RlTmFtZTogc3RyaW5nIH0+ID0gW107XG4gICAgICAgIGNvbnN0IHNraXBwZWQ6IEFycmF5PHsgcHJvcGVydHk6IHN0cmluZzsgcmVhc29uOiBzdHJpbmcgfT4gPSBbXTtcblxuICAgICAgICBmb3IgKGNvbnN0IHsgcHJvcGVydHksIGVudHJ5IH0gb2YgcmVmZXJlbmNlUHJvcHMpIHtcbiAgICAgICAgICAgIGNvbnN0IG1hdGNoZWROb2RlID0gYS5tb2RlID09PSAnZnV6enknXG4gICAgICAgICAgICAgICAgPyBzY2VuZU5vZGVzLmZpbmQobm9kZSA9PiBub2RlLm5hbWUudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhwcm9wZXJ0eS50b0xvd2VyQ2FzZSgpKSlcbiAgICAgICAgICAgICAgICA6IHNjZW5lTm9kZXMuZmluZChub2RlID0+IG5vZGUubmFtZSA9PT0gcHJvcGVydHkpO1xuXG4gICAgICAgICAgICBpZiAoIW1hdGNoZWROb2RlKSB7XG4gICAgICAgICAgICAgICAgc2tpcHBlZC5wdXNoKHsgcHJvcGVydHksIHJlYXNvbjogJ25vIG1hdGNoaW5nIG5vZGUgZm91bmQnIH0pO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3NldC1wcm9wZXJ0eScsIHtcbiAgICAgICAgICAgICAgICAgICAgdXVpZDogYS5ub2RlVXVpZCxcbiAgICAgICAgICAgICAgICAgICAgcGF0aDogJ19fY29tcHNfXy4nICsgY29tcG9uZW50SW5kZXggKyAnLicgKyBwcm9wZXJ0eSxcbiAgICAgICAgICAgICAgICAgICAgZHVtcDogeyB0eXBlOiBlbnRyeS50eXBlLCB2YWx1ZTogeyBfX3V1aWRfXzogbWF0Y2hlZE5vZGUudXVpZCB9IH0sXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgYm91bmQucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgIHByb3BlcnR5LFxuICAgICAgICAgICAgICAgICAgICBtYXRjaGVkTm9kZVV1aWQ6IG1hdGNoZWROb2RlLnV1aWQsXG4gICAgICAgICAgICAgICAgICAgIG1hdGNoZWROb2RlTmFtZTogbWF0Y2hlZE5vZGUubmFtZSxcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICAgICAgc2tpcHBlZC5wdXNoKHsgcHJvcGVydHksIHJlYXNvbjogZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG9rKHtcbiAgICAgICAgICAgIHRvdGFsOiByZWZlcmVuY2VQcm9wcy5sZW5ndGgsXG4gICAgICAgICAgICBib3VuZCxcbiAgICAgICAgICAgIHNraXBwZWQsXG4gICAgICAgIH0sIGBCb3VuZCAke2JvdW5kLmxlbmd0aH0vJHtyZWZlcmVuY2VQcm9wcy5sZW5ndGh9IHJlZmVyZW5jZXNgKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdzZXRfY29tcG9uZW50X3Byb3BlcnR5JyxcbiAgICAgICAgdGl0bGU6ICdTZXQgY29tcG9uZW50IHByb3BlcnR5JyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gU2V0IG9uZSBwcm9wZXJ0eSBvbiBhIG5vZGUgY29tcG9uZW50LiBTdXBwb3J0cyBidWlsdC1pbiBVSSBhbmQgY3VzdG9tIHNjcmlwdCBjb21wb25lbnRzLiBBY2NlcHRzIHJlZmVyZW5jZT17aWQsdHlwZX0gKHByZWZlcnJlZCksIG5vZGVVdWlkLCBvciBub2RlTmFtZS4gTm90ZTogRm9yIG5vZGUgYmFzaWMgcHJvcGVydGllcyAobmFtZSwgYWN0aXZlLCBsYXllciwgZXRjLiksIHVzZSBzZXRfbm9kZV9wcm9wZXJ0eS4gRm9yIG5vZGUgdHJhbnNmb3JtIHByb3BlcnRpZXMgKHBvc2l0aW9uLCByb3RhdGlvbiwgc2NhbGUsIGV0Yy4pLCB1c2Ugc2V0X25vZGVfdHJhbnNmb3JtLicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICByZWZlcmVuY2U6IGluc3RhbmNlUmVmZXJlbmNlU2NoZW1hLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0luc3RhbmNlUmVmZXJlbmNlIHtpZCx0eXBlfSBmb3IgdGhlIGhvc3Qgbm9kZS4gUHJlZmVycmVkIGZvcm0uJyksXG4gICAgICAgICAgICBub2RlVXVpZDogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdUYXJnZXQgbm9kZSBVVUlELiBVc2VkIHdoZW4gcmVmZXJlbmNlIGlzIG9taXR0ZWQuJyksXG4gICAgICAgICAgICBub2RlTmFtZTogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdUYXJnZXQgbm9kZSBuYW1lIChkZXB0aC1maXJzdCBmaXJzdCBtYXRjaCkuIFVzZWQgd2hlbiByZWZlcmVuY2UgYW5kIG5vZGVVdWlkIGFyZSBvbWl0dGVkLicpLFxuICAgICAgICAgICAgY29tcG9uZW50VHlwZTogei5zdHJpbmcoKS5kZXNjcmliZSgnQ29tcG9uZW50IHR5cGUgLSBDYW4gYmUgYnVpbHQtaW4gY29tcG9uZW50cyAoZS5nLiwgY2MuTGFiZWwpIG9yIGN1c3RvbSBzY3JpcHQgY29tcG9uZW50cyAoZS5nLiwgTXlTY3JpcHQpLiBJZiB1bnN1cmUgYWJvdXQgY29tcG9uZW50IHR5cGUsIHVzZSBnZXRfY29tcG9uZW50cyBmaXJzdCB0byByZXRyaWV2ZSBhbGwgY29tcG9uZW50cyBvbiB0aGUgbm9kZS4nKSxcbiAgICAgICAgICAgIHByb3BlcnR5OiB6LnN0cmluZygpLmRlc2NyaWJlKHNldENvbXBvbmVudFByb3BlcnR5UHJvcGVydHlEZXNjcmlwdGlvbiksXG4gICAgICAgICAgICBwcm9wZXJ0eVR5cGU6IHouZW51bShbXG4gICAgICAgICAgICAgICAgJ3N0cmluZycsICdudW1iZXInLCAnYm9vbGVhbicsICdpbnRlZ2VyJywgJ2Zsb2F0JyxcbiAgICAgICAgICAgICAgICAnY29sb3InLCAndmVjMicsICd2ZWMzJywgJ3NpemUnLFxuICAgICAgICAgICAgICAgICdub2RlJywgJ2NvbXBvbmVudCcsICdzcHJpdGVGcmFtZScsICdwcmVmYWInLCAnYXNzZXQnLFxuICAgICAgICAgICAgICAgICdub2RlQXJyYXknLCAnY29sb3JBcnJheScsICdudW1iZXJBcnJheScsICdzdHJpbmdBcnJheScsXG4gICAgICAgICAgICBdKS5kZXNjcmliZSgnUHJvcGVydHkgdHlwZSAtIE11c3QgZXhwbGljaXRseSBzcGVjaWZ5IHRoZSBwcm9wZXJ0eSBkYXRhIHR5cGUgZm9yIGNvcnJlY3QgdmFsdWUgY29udmVyc2lvbiBhbmQgdmFsaWRhdGlvbicpLFxuICAgICAgICAgICAgdmFsdWU6IHouYW55KCkuZGVzY3JpYmUoc2V0Q29tcG9uZW50UHJvcGVydHlWYWx1ZURlc2NyaXB0aW9uKSxcbiAgICAgICAgICAgIHByZXNlcnZlQ29udGVudFNpemU6IHouYm9vbGVhbigpLmRlZmF1bHQoZmFsc2UpLmRlc2NyaWJlKCdTcHJpdGUtc3BlY2lmaWMgd29ya2Zsb3cgZmxhZy4gT25seSBob25vdXJlZCB3aGVuIGNvbXBvbmVudFR5cGU9XCJjYy5TcHJpdGVcIiBhbmQgcHJvcGVydHk9XCJzcHJpdGVGcmFtZVwiOiBiZWZvcmUgdGhlIGFzc2lnbiwgc2V0cyBjYy5TcHJpdGUuc2l6ZU1vZGUgdG8gQ1VTVE9NICgwKSBzbyB0aGUgZW5naW5lIGRvZXMgTk9UIG92ZXJ3cml0ZSBjYy5VSVRyYW5zZm9ybS5jb250ZW50U2l6ZSB3aXRoIHRoZSB0ZXh0dXJlXFwncyBuYXRpdmUgZGltZW5zaW9ucy4gVXNlIHdoZW4gYnVpbGRpbmcgVUkgcHJvY2VkdXJhbGx5IGFuZCB0aGUgbm9kZVxcJ3MgcHJlLXNldCBzaXplIG11c3QgYmUga2VwdDsgbGVhdmUgZmFsc2UgKGRlZmF1bHQpIHRvIGtlZXAgY29jb3NcXCcgc3RhbmRhcmQgVFJJTU1FRCBhdXRvLWZpdCBiZWhhdmlvdXIuJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgc2V0Q29tcG9uZW50UHJvcGVydHlUb29sKGE6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHIgPSBhd2FpdCByZXNvbHZlUmVmZXJlbmNlKHsgcmVmZXJlbmNlOiBhLnJlZmVyZW5jZSwgbm9kZVV1aWQ6IGEubm9kZVV1aWQsIG5vZGVOYW1lOiBhLm5vZGVOYW1lIH0pO1xuICAgICAgICBpZiAoJ3Jlc3BvbnNlJyBpbiByKSByZXR1cm4gci5yZXNwb25zZTtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2V0Q29tcG9uZW50UHJvcGVydHkoeyAuLi5hLCBub2RlVXVpZDogci51dWlkIH0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ2F0dGFjaF9zY3JpcHQnLFxuICAgICAgICB0aXRsZTogJ0F0dGFjaCBzY3JpcHQgY29tcG9uZW50JyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gQXR0YWNoIGEgc2NyaXB0IGFzc2V0IGFzIGEgY29tcG9uZW50IHRvIGEgbm9kZS4gTXV0YXRlcyBzY2VuZTsgdXNlIGdldF9jb21wb25lbnRzIGFmdGVyd2FyZCBiZWNhdXNlIGN1c3RvbSBzY3JpcHRzIG1heSBhcHBlYXIgYXMgY2lkLicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICBub2RlVXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnTm9kZSBVVUlEIHRvIGF0dGFjaCB0aGUgc2NyaXB0IGNvbXBvbmVudCB0by4nKSxcbiAgICAgICAgICAgIHNjcmlwdFBhdGg6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1NjcmlwdCBhc3NldCBkYjovLyBwYXRoLCBlLmcuIGRiOi8vYXNzZXRzL3NjcmlwdHMvTXlTY3JpcHQudHMuJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgYXR0YWNoU2NyaXB0KGE6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLmF0dGFjaFNjcmlwdEltcGwoYS5ub2RlVXVpZCwgYS5zY3JpcHRQYXRoKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdyZXNvbHZlX3NjcmlwdF9jbGFzcycsXG4gICAgICAgIHRpdGxlOiAnUmVzb2x2ZSBzY3JpcHQgY2xhc3MgbmFtZScsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFJlc29sdmUgYSBDb2NvcyBUeXBlU2NyaXB0IHNjcmlwdCBhc3NldCBVUkwgb3IgVVVJRCB0byBAY2NjbGFzcyBjbGFzcyBuYW1lcy4gVXNlIGJlZm9yZSBhZGRfY29tcG9uZW50LCBhZGRfZXZlbnRfaGFuZGxlciwgb3Igb3RoZXIgY2FsbHMgdGhhdCBuZWVkIGEgY3VzdG9tIHNjcmlwdCBjbGFzcyBuYW1lLicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICBzY3JpcHQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1NjcmlwdCBhc3NldCBkYjovLyBVUkwgb3IgYXNzZXQgVVVJRCwgZS5nLiBkYjovL2Fzc2V0cy9zY3JpcHRzL015U2NyaXB0LnRzLicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIHJlc29sdmVTY3JpcHRDbGFzcyhhOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgcmVzb2x2ZUNjY2xhc3NGcm9tQXNzZXQoYS5zY3JpcHQpO1xuICAgICAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBvayh7XG4gICAgICAgICAgICAgICAgY2xhc3NOYW1lczogcmVzdWx0LmNsYXNzTmFtZXMsXG4gICAgICAgICAgICAgICAgYXNzZXRQYXRoOiByZXN1bHQuYXNzZXRQYXRoLFxuICAgICAgICAgICAgICAgIGFzc2V0VXVpZDogcmVzdWx0LmFzc2V0VXVpZCxcbiAgICAgICAgICAgICAgICBhc3NldFVybDogcmVzdWx0LmFzc2V0VXJsLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBpZiAocmVzdWx0LmNsYXNzTmFtZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgcmVzcG9uc2Uud2FybmluZyA9ICdObyBAY2NjbGFzcyhcIkNsYXNzTmFtZVwiKSBkZWNvcmF0b3Igd2FzIGZvdW5kIGluIHRoaXMgc2NyaXB0Lic7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHJlc3VsdC5jbGFzc05hbWVzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAgICAgICByZXNwb25zZS53YXJuaW5nID0gYE11bHRpcGxlIEBjY2NsYXNzIGRlY29yYXRvcnMgZm91bmQ6ICR7cmVzdWx0LmNsYXNzTmFtZXMuam9pbignLCAnKX1gO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHJlc3BvbnNlO1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ2dldF9hdmFpbGFibGVfY29tcG9uZW50cycsXG4gICAgICAgIHRpdGxlOiAnTGlzdCBhdmFpbGFibGUgY29tcG9uZW50cycsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIExpc3QgY3VyYXRlZCBidWlsdC1pbiBjb21wb25lbnQgdHlwZXMgYnkgY2F0ZWdvcnkuIE5vIHNjZW5lIHF1ZXJ5OyBjdXN0b20gcHJvamVjdCBzY3JpcHRzIGFyZSBub3QgZGlzY292ZXJlZCBoZXJlLicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICBjYXRlZ29yeTogei5lbnVtKFsnYWxsJywgJ3JlbmRlcmVyJywgJ3VpJywgJ3BoeXNpY3MnLCAnYW5pbWF0aW9uJywgJ2F1ZGlvJ10pLmRlZmF1bHQoJ2FsbCcpLmRlc2NyaWJlKCdDb21wb25lbnQgY2F0ZWdvcnkgZmlsdGVyIGZvciB0aGUgYnVpbHQtaW4gY3VyYXRlZCBsaXN0LicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIGdldEF2YWlsYWJsZUNvbXBvbmVudHMoYTogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0QXZhaWxhYmxlQ29tcG9uZW50c0ltcGwoYS5jYXRlZ29yeSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnYWRkX2V2ZW50X2hhbmRsZXInLFxuICAgICAgICB0aXRsZTogJ0FkZCBldmVudCBoYW5kbGVyJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gQXBwZW5kIGEgY2MuRXZlbnRIYW5kbGVyIHRvIGEgY29tcG9uZW50IGV2ZW50IGFycmF5LiBOdWRnZXMgdGhlIGVkaXRvciBtb2RlbCBmb3IgcGVyc2lzdGVuY2UuIE11dGF0ZXMgc2NlbmU7IHVzZSBmb3IgQnV0dG9uL1RvZ2dsZS9TbGlkZXIgY2FsbGJhY2tzLicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICBub2RlVXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnTm9kZSBVVUlEIG93bmluZyB0aGUgY29tcG9uZW50IChlLmcuIHRoZSBCdXR0b24gbm9kZSknKSxcbiAgICAgICAgICAgIGNvbXBvbmVudFR5cGU6IHouc3RyaW5nKCkuZGVmYXVsdCgnY2MuQnV0dG9uJykuZGVzY3JpYmUoJ0NvbXBvbmVudCBjbGFzcyBuYW1lOyBkZWZhdWx0cyB0byBjYy5CdXR0b24nKSxcbiAgICAgICAgICAgIGV2ZW50QXJyYXlQcm9wZXJ0eTogei5zdHJpbmcoKS5kZWZhdWx0KCdjbGlja0V2ZW50cycpLmRlc2NyaWJlKCdDb21wb25lbnQgcHJvcGVydHkgaG9sZGluZyB0aGUgRXZlbnRIYW5kbGVyIGFycmF5IChjYy5CdXR0b24uY2xpY2tFdmVudHMsIGNjLlRvZ2dsZS5jaGVja0V2ZW50cywg4oCmKScpLFxuICAgICAgICAgICAgdGFyZ2V0Tm9kZVV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ05vZGUgVVVJRCB3aGVyZSB0aGUgY2FsbGJhY2sgY29tcG9uZW50IGxpdmVzIChtb3N0IG9mdGVuIHRoZSBzYW1lIGFzIG5vZGVVdWlkKScpLFxuICAgICAgICAgICAgY29tcG9uZW50TmFtZTogei5zdHJpbmcoKS5kZXNjcmliZSgnQ2xhc3MgbmFtZSAoY2MtY2xhc3MpIG9mIHRoZSBzY3JpcHQgdGhhdCBvd25zIHRoZSBjYWxsYmFjayBtZXRob2QnKSxcbiAgICAgICAgICAgIGhhbmRsZXI6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ01ldGhvZCBuYW1lIG9uIHRoZSB0YXJnZXQgY29tcG9uZW50LCBlLmcuIFwib25DbGlja1wiJyksXG4gICAgICAgICAgICBjdXN0b21FdmVudERhdGE6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnT3B0aW9uYWwgc3RyaW5nIHBhc3NlZCBiYWNrIHdoZW4gdGhlIGV2ZW50IGZpcmVzJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgYWRkRXZlbnRIYW5kbGVyKGE6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHJlc3AgPSBhd2FpdCBydW5TY2VuZU1ldGhvZEFzVG9vbFJlc3BvbnNlKCdhZGRFdmVudEhhbmRsZXInLCBbXG4gICAgICAgICAgICBhLm5vZGVVdWlkLCBhLmNvbXBvbmVudFR5cGUsIGEuZXZlbnRBcnJheVByb3BlcnR5LFxuICAgICAgICAgICAgYS50YXJnZXROb2RlVXVpZCwgYS5jb21wb25lbnROYW1lLCBhLmhhbmRsZXIsIGEuY3VzdG9tRXZlbnREYXRhLFxuICAgICAgICBdKTtcbiAgICAgICAgaWYgKHJlc3Auc3VjY2Vzcykge1xuICAgICAgICAgICAgYXdhaXQgbnVkZ2VFZGl0b3JNb2RlbChhLm5vZGVVdWlkLCBhLmNvbXBvbmVudFR5cGUsIHJlc3AuZGF0YT8uY29tcG9uZW50VXVpZCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3A7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAncmVtb3ZlX2V2ZW50X2hhbmRsZXInLFxuICAgICAgICB0aXRsZTogJ1JlbW92ZSBldmVudCBoYW5kbGVyJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gUmVtb3ZlIEV2ZW50SGFuZGxlciBlbnRyaWVzIGZyb20gYSBjb21wb25lbnQgZXZlbnQgYXJyYXkuIE51ZGdlcyB0aGUgZWRpdG9yIG1vZGVsIGZvciBwZXJzaXN0ZW5jZS4gTXV0YXRlcyBzY2VuZTsgbWF0Y2ggYnkgaW5kZXggb3IgdGFyZ2V0Tm9kZVV1aWQraGFuZGxlci4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgbm9kZVV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ05vZGUgVVVJRCBvd25pbmcgdGhlIGNvbXBvbmVudCcpLFxuICAgICAgICAgICAgY29tcG9uZW50VHlwZTogei5zdHJpbmcoKS5kZWZhdWx0KCdjYy5CdXR0b24nKS5kZXNjcmliZSgnQ29tcG9uZW50IGNsYXNzIG5hbWUnKSxcbiAgICAgICAgICAgIGV2ZW50QXJyYXlQcm9wZXJ0eTogei5zdHJpbmcoKS5kZWZhdWx0KCdjbGlja0V2ZW50cycpLmRlc2NyaWJlKCdFdmVudEhhbmRsZXIgYXJyYXkgcHJvcGVydHkgbmFtZScpLFxuICAgICAgICAgICAgaW5kZXg6IHoubnVtYmVyKCkuaW50KCkubWluKDApLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1plcm8tYmFzZWQgaW5kZXggdG8gcmVtb3ZlLiBUYWtlcyBwcmVjZWRlbmNlIG92ZXIgdGFyZ2V0Tm9kZVV1aWQvaGFuZGxlciBtYXRjaGluZyB3aGVuIHByb3ZpZGVkLicpLFxuICAgICAgICAgICAgdGFyZ2V0Tm9kZVV1aWQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnTWF0Y2ggaGFuZGxlcnMgd2hvc2UgdGFyZ2V0IG5vZGUgaGFzIHRoaXMgVVVJRCcpLFxuICAgICAgICAgICAgaGFuZGxlcjogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdNYXRjaCBoYW5kbGVycyB3aXRoIHRoaXMgbWV0aG9kIG5hbWUnKSxcbiAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyByZW1vdmVFdmVudEhhbmRsZXIoYTogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgcmVzcCA9IGF3YWl0IHJ1blNjZW5lTWV0aG9kQXNUb29sUmVzcG9uc2UoJ3JlbW92ZUV2ZW50SGFuZGxlcicsIFtcbiAgICAgICAgICAgIGEubm9kZVV1aWQsIGEuY29tcG9uZW50VHlwZSwgYS5ldmVudEFycmF5UHJvcGVydHksXG4gICAgICAgICAgICBhLmluZGV4ID8/IG51bGwsIGEudGFyZ2V0Tm9kZVV1aWQgPz8gbnVsbCwgYS5oYW5kbGVyID8/IG51bGwsXG4gICAgICAgIF0pO1xuICAgICAgICBpZiAocmVzcC5zdWNjZXNzKSB7XG4gICAgICAgICAgICBhd2FpdCBudWRnZUVkaXRvck1vZGVsKGEubm9kZVV1aWQsIGEuY29tcG9uZW50VHlwZSwgcmVzcC5kYXRhPy5jb21wb25lbnRVdWlkKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzcDtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdsaXN0X2V2ZW50X2hhbmRsZXJzJyxcbiAgICAgICAgdGl0bGU6ICdMaXN0IGV2ZW50IGhhbmRsZXJzJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gTGlzdCBFdmVudEhhbmRsZXIgZW50cmllcyBvbiBhIGNvbXBvbmVudCBldmVudCBhcnJheS4gTm8gbXV0YXRpb247IHVzZSBiZWZvcmUgcmVtb3ZlX2V2ZW50X2hhbmRsZXIuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIG5vZGVVdWlkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdOb2RlIFVVSUQgb3duaW5nIHRoZSBjb21wb25lbnQnKSxcbiAgICAgICAgICAgIGNvbXBvbmVudFR5cGU6IHouc3RyaW5nKCkuZGVmYXVsdCgnY2MuQnV0dG9uJykuZGVzY3JpYmUoJ0NvbXBvbmVudCBjbGFzcyBuYW1lJyksXG4gICAgICAgICAgICBldmVudEFycmF5UHJvcGVydHk6IHouc3RyaW5nKCkuZGVmYXVsdCgnY2xpY2tFdmVudHMnKS5kZXNjcmliZSgnRXZlbnRIYW5kbGVyIGFycmF5IHByb3BlcnR5IG5hbWUnKSxcbiAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBsaXN0RXZlbnRIYW5kbGVycyhhOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gcnVuU2NlbmVNZXRob2RBc1Rvb2xSZXNwb25zZSgnbGlzdEV2ZW50SGFuZGxlcnMnLCBbXG4gICAgICAgICAgICBhLm5vZGVVdWlkLCBhLmNvbXBvbmVudFR5cGUsIGEuZXZlbnRBcnJheVByb3BlcnR5LFxuICAgICAgICBdKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdzZXRfY29tcG9uZW50X3Byb3BlcnRpZXMnLFxuICAgICAgICB0aXRsZTogJ1NldCBjb21wb25lbnQgcHJvcGVydGllcycsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIEJhdGNoLXNldCBtdWx0aXBsZSBwcm9wZXJ0aWVzIG9uIHRoZSBzYW1lIGNvbXBvbmVudCBpbiBvbmUgdG9vbCBjYWxsLiBNdXRhdGVzIHNjZW5lOyBlYWNoIHByb3BlcnR5IGlzIHdyaXR0ZW4gc2VxdWVudGlhbGx5IHRocm91Z2ggc2V0X2NvbXBvbmVudF9wcm9wZXJ0eSB0byBzaGFyZSBub2RlVXVpZCtjb21wb25lbnRUeXBlIHJlc29sdXRpb24uIFJldHVybnMgcGVyLWVudHJ5IHN1Y2Nlc3MvZXJyb3Igc28gcGFydGlhbCBmYWlsdXJlcyBhcmUgdmlzaWJsZS4gVXNlIHdoZW4gQUkgbmVlZHMgdG8gc2V0IDMrIHByb3BlcnRpZXMgb24gYSBzaW5nbGUgY29tcG9uZW50IGF0IG9uY2UuIEFjY2VwdHMgcmVmZXJlbmNlPXtpZCx0eXBlfSAocHJlZmVycmVkKSwgbm9kZVV1aWQsIG9yIG5vZGVOYW1lLicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICByZWZlcmVuY2U6IGluc3RhbmNlUmVmZXJlbmNlU2NoZW1hLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0luc3RhbmNlUmVmZXJlbmNlIHtpZCx0eXBlfSBmb3IgdGhlIGhvc3Qgbm9kZS4gUHJlZmVycmVkIGZvcm0uJyksXG4gICAgICAgICAgICBub2RlVXVpZDogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdUYXJnZXQgbm9kZSBVVUlELiBVc2VkIHdoZW4gcmVmZXJlbmNlIGlzIG9taXR0ZWQuJyksXG4gICAgICAgICAgICBub2RlTmFtZTogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdUYXJnZXQgbm9kZSBuYW1lIChkZXB0aC1maXJzdCBmaXJzdCBtYXRjaCkuIFVzZWQgd2hlbiByZWZlcmVuY2UgYW5kIG5vZGVVdWlkIGFyZSBvbWl0dGVkLicpLFxuICAgICAgICAgICAgY29tcG9uZW50VHlwZTogei5zdHJpbmcoKS5kZXNjcmliZSgnQ29tcG9uZW50IHR5cGUvY2lkIHNoYXJlZCBieSBhbGwgZW50cmllcy4nKSxcbiAgICAgICAgICAgIHByb3BlcnRpZXM6IHouYXJyYXkoei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgIHByb3BlcnR5OiB6LnN0cmluZygpLmRlc2NyaWJlKCdQcm9wZXJ0eSBuYW1lIG9uIHRoZSBjb21wb25lbnQsIGUuZy4gZm9udFNpemUsIGNvbG9yLCBzaXplTW9kZS4nKSxcbiAgICAgICAgICAgICAgICBwcm9wZXJ0eVR5cGU6IHouZW51bShbXG4gICAgICAgICAgICAgICAgICAgICdzdHJpbmcnLCAnbnVtYmVyJywgJ2Jvb2xlYW4nLCAnaW50ZWdlcicsICdmbG9hdCcsXG4gICAgICAgICAgICAgICAgICAgICdjb2xvcicsICd2ZWMyJywgJ3ZlYzMnLCAnc2l6ZScsXG4gICAgICAgICAgICAgICAgICAgICdub2RlJywgJ2NvbXBvbmVudCcsICdzcHJpdGVGcmFtZScsICdwcmVmYWInLCAnYXNzZXQnLFxuICAgICAgICAgICAgICAgICAgICAnbm9kZUFycmF5JywgJ2NvbG9yQXJyYXknLCAnbnVtYmVyQXJyYXknLCAnc3RyaW5nQXJyYXknLFxuICAgICAgICAgICAgICAgIF0pLmRlc2NyaWJlKCdQcm9wZXJ0eSBkYXRhIHR5cGUgZm9yIHZhbHVlIGNvbnZlcnNpb24uJyksXG4gICAgICAgICAgICAgICAgdmFsdWU6IHouYW55KCkuZGVzY3JpYmUoJ1Byb3BlcnR5IHZhbHVlIG1hdGNoaW5nIHByb3BlcnR5VHlwZS4nKSxcbiAgICAgICAgICAgICAgICBwcmVzZXJ2ZUNvbnRlbnRTaXplOiB6LmJvb2xlYW4oKS5kZWZhdWx0KGZhbHNlKS5kZXNjcmliZSgnU2VlIHNldF9jb21wb25lbnRfcHJvcGVydHk7IG9ubHkgaG9ub3VyZWQgd2hlbiBjb21wb25lbnRUeXBlPVwiY2MuU3ByaXRlXCIgYW5kIHByb3BlcnR5PVwic3ByaXRlRnJhbWVcIi4nKSxcbiAgICAgICAgICAgIH0pKS5taW4oMSkubWF4KDIwKS5kZXNjcmliZSgnUHJvcGVydHkgZW50cmllcy4gQ2FwcGVkIGF0IDIwIHBlciBjYWxsLicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIHNldENvbXBvbmVudFByb3BlcnRpZXMoYTogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgciA9IGF3YWl0IHJlc29sdmVSZWZlcmVuY2UoeyByZWZlcmVuY2U6IGEucmVmZXJlbmNlLCBub2RlVXVpZDogYS5ub2RlVXVpZCwgbm9kZU5hbWU6IGEubm9kZU5hbWUgfSk7XG4gICAgICAgIGlmICgncmVzcG9uc2UnIGluIHIpIHJldHVybiByLnJlc3BvbnNlO1xuICAgICAgICBjb25zdCByZXN1bHRzOiBBcnJheTx7IHByb3BlcnR5OiBzdHJpbmc7IHN1Y2Nlc3M6IGJvb2xlYW47IGVycm9yPzogc3RyaW5nIH0+ID0gW107XG4gICAgICAgIGZvciAoY29uc3QgZW50cnkgb2YgYS5wcm9wZXJ0aWVzKSB7XG4gICAgICAgICAgICBjb25zdCByZXNwID0gYXdhaXQgdGhpcy5zZXRDb21wb25lbnRQcm9wZXJ0eSh7XG4gICAgICAgICAgICAgICAgbm9kZVV1aWQ6IHIudXVpZCxcbiAgICAgICAgICAgICAgICBjb21wb25lbnRUeXBlOiBhLmNvbXBvbmVudFR5cGUsXG4gICAgICAgICAgICAgICAgcHJvcGVydHk6IGVudHJ5LnByb3BlcnR5LFxuICAgICAgICAgICAgICAgIHByb3BlcnR5VHlwZTogZW50cnkucHJvcGVydHlUeXBlLFxuICAgICAgICAgICAgICAgIHZhbHVlOiBlbnRyeS52YWx1ZSxcbiAgICAgICAgICAgICAgICBwcmVzZXJ2ZUNvbnRlbnRTaXplOiBlbnRyeS5wcmVzZXJ2ZUNvbnRlbnRTaXplID8/IGZhbHNlLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXN1bHRzLnB1c2goe1xuICAgICAgICAgICAgICAgIHByb3BlcnR5OiBlbnRyeS5wcm9wZXJ0eSxcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiAhIXJlc3Auc3VjY2VzcyxcbiAgICAgICAgICAgICAgICBlcnJvcjogcmVzcC5zdWNjZXNzID8gdW5kZWZpbmVkIDogKHJlc3AuZXJyb3IgPz8gcmVzcC5tZXNzYWdlID8/ICd1bmtub3duJyksXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBmYWlsZWQgPSByZXN1bHRzLmZpbHRlcih4ID0+ICF4LnN1Y2Nlc3MpO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgc3VjY2VzczogZmFpbGVkLmxlbmd0aCA9PT0gMCxcbiAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICBub2RlVXVpZDogci51dWlkLFxuICAgICAgICAgICAgICAgIGNvbXBvbmVudFR5cGU6IGEuY29tcG9uZW50VHlwZSxcbiAgICAgICAgICAgICAgICB0b3RhbDogcmVzdWx0cy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgZmFpbGVkQ291bnQ6IGZhaWxlZC5sZW5ndGgsXG4gICAgICAgICAgICAgICAgcmVzdWx0cyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBtZXNzYWdlOiBmYWlsZWQubGVuZ3RoID09PSAwXG4gICAgICAgICAgICAgICAgPyBgV3JvdGUgJHtyZXN1bHRzLmxlbmd0aH0gY29tcG9uZW50IHByb3BlcnRpZXNgXG4gICAgICAgICAgICAgICAgOiBgJHtmYWlsZWQubGVuZ3RofS8ke3Jlc3VsdHMubGVuZ3RofSBjb21wb25lbnQgcHJvcGVydHkgd3JpdGVzIGZhaWxlZGAsXG4gICAgICAgIH07XG4gICAgfVxuICAgIHByaXZhdGUgYXN5bmMgYWRkQ29tcG9uZW50SW1wbChub2RlVXVpZDogc3RyaW5nLCBjb21wb25lbnRUeXBlOiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoYXN5bmMgKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIC8vIFNuYXBzaG90IGV4aXN0aW5nIGNvbXBvbmVudHMgc28gd2UgY2FuIGRldGVjdCBwb3N0LWFkZCBhZGRpdGlvbnNcbiAgICAgICAgICAgIC8vIGV2ZW4gd2hlbiBDb2NvcyByZXBvcnRzIHRoZW0gdW5kZXIgYSBjaWQgKGN1c3RvbSBzY3JpcHRzKSByYXRoZXJcbiAgICAgICAgICAgIC8vIHRoYW4gdGhlIGNsYXNzIG5hbWUgdGhlIGNhbGxlciBzdXBwbGllZC5cbiAgICAgICAgICAgIGNvbnN0IGJlZm9yZUluZm8gPSBhd2FpdCB0aGlzLmdldENvbXBvbmVudHNJbXBsKG5vZGVVdWlkKTtcbiAgICAgICAgICAgIGNvbnN0IGJlZm9yZUxpc3Q6IGFueVtdID0gYmVmb3JlSW5mby5zdWNjZXNzICYmIGJlZm9yZUluZm8uZGF0YT8uY29tcG9uZW50cyA/IGJlZm9yZUluZm8uZGF0YS5jb21wb25lbnRzIDogW107XG4gICAgICAgICAgICBjb25zdCBiZWZvcmVUeXBlcyA9IG5ldyBTZXQoYmVmb3JlTGlzdC5tYXAoKGM6IGFueSkgPT4gYy50eXBlKSk7XG5cbiAgICAgICAgICAgIGNvbnN0IGV4aXN0aW5nQ29tcG9uZW50ID0gYmVmb3JlTGlzdC5maW5kKChjb21wOiBhbnkpID0+IGNvbXAudHlwZSA9PT0gY29tcG9uZW50VHlwZSk7XG4gICAgICAgICAgICBpZiAoZXhpc3RpbmdDb21wb25lbnQpIHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG5vZGVVdWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50VHlwZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudFZlcmlmaWVkOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgZXhpc3Rpbmc6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIH0sIGBDb21wb25lbnQgJyR7Y29tcG9uZW50VHlwZX0nIGFscmVhZHkgZXhpc3RzIG9uIG5vZGVgKSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyDlmJfoqabnm7TmjqXkvb/nlKggRWRpdG9yIEFQSSDmt7vliqDntYTku7ZcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ2NyZWF0ZS1jb21wb25lbnQnLCB7XG4gICAgICAgICAgICAgICAgdXVpZDogbm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgY29tcG9uZW50OiBjb21wb25lbnRUeXBlLFxuICAgICAgICAgICAgfSkudGhlbihhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgICAgLy8g562J5b6F5LiA5q615pmC6ZaT6K6TRWRpdG9y5a6M5oiQ57WE5Lu25re75YqgXG4gICAgICAgICAgICAgICAgYXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDEwMCkpO1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGFmdGVySW5mbyA9IGF3YWl0IHRoaXMuZ2V0Q29tcG9uZW50c0ltcGwobm9kZVV1aWQpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIWFmdGVySW5mby5zdWNjZXNzIHx8ICFhZnRlckluZm8uZGF0YT8uY29tcG9uZW50cykge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGBGYWlsZWQgdG8gdmVyaWZ5IGNvbXBvbmVudCBhZGRpdGlvbjogJHthZnRlckluZm8uZXJyb3IgfHwgJ1VuYWJsZSB0byBnZXQgbm9kZSBjb21wb25lbnRzJ31gKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYWZ0ZXJMaXN0OiBhbnlbXSA9IGFmdGVySW5mby5kYXRhLmNvbXBvbmVudHM7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gU3RyaWN0IG1hdGNoOiBidWlsdC1pbiBjb21wb25lbnRzIGxpa2UgY2MuU3ByaXRlIHNob3cgdGhlaXJcbiAgICAgICAgICAgICAgICAgICAgLy8gY2xhc3MgbmFtZSBpbiBgdHlwZWAuIEhpdHMgdGhlIHNhbWUgc2hhcGUgdGhlIGNhbGxlciBwYXNzZWQuXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGFkZGVkQ29tcG9uZW50ID0gYWZ0ZXJMaXN0LmZpbmQoKGNvbXA6IGFueSkgPT4gY29tcC50eXBlID09PSBjb21wb25lbnRUeXBlKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGFkZGVkQ29tcG9uZW50KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudFR5cGUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudFZlcmlmaWVkOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBleGlzdGluZzogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSwgYENvbXBvbmVudCAnJHtjb21wb25lbnRUeXBlfScgYWRkZWQgc3VjY2Vzc2Z1bGx5YCkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gTGVuaWVudCBmYWxsYmFjazogY3VzdG9tIHNjcmlwdHMgc3VyZmFjZSBhcyBhIGNpZCAoZS5nLlxuICAgICAgICAgICAgICAgICAgICAvLyBcIjliNGE3dWVUOXhENmFSRStBbE91c3kxXCIpIGluIF9fY29tcHNfXy50eXBlLCBub3QgYXMgdGhlXG4gICAgICAgICAgICAgICAgICAgIC8vIGNsYXNzIG5hbWUuIElmIHRoZSBjb21wb25lbnQgY291bnQgZ3JldywgYWNjZXB0IHRoZSBuZXdcbiAgICAgICAgICAgICAgICAgICAgLy8gZW50cnkgYXMgdGhlIG9uZSB3ZSBqdXN0IGFkZGVkLlxuICAgICAgICAgICAgICAgICAgICBjb25zdCBuZXdFbnRyaWVzID0gYWZ0ZXJMaXN0LmZpbHRlcigoY29tcDogYW55KSA9PiAhYmVmb3JlVHlwZXMuaGFzKGNvbXAudHlwZSkpO1xuICAgICAgICAgICAgICAgICAgICBpZiAobmV3RW50cmllcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCByZWdpc3RlcmVkQXMgPSBuZXdFbnRyaWVzWzBdLnR5cGU7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudFR5cGUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlZ2lzdGVyZWRBcyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50VmVyaWZpZWQ6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4aXN0aW5nOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9LCBgQ29tcG9uZW50ICcke2NvbXBvbmVudFR5cGV9JyBhZGRlZCBzdWNjZXNzZnVsbHkgKHJlZ2lzdGVyZWQgYXMgY2lkICcke3JlZ2lzdGVyZWRBc30nOyB0aGlzIGlzIG5vcm1hbCBmb3IgY3VzdG9tIHNjcmlwdHMpLmApKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChgQ29tcG9uZW50ICcke2NvbXBvbmVudFR5cGV9JyB3YXMgbm90IGZvdW5kIG9uIG5vZGUgYWZ0ZXIgYWRkaXRpb24uIEF2YWlsYWJsZSBjb21wb25lbnRzOiAke2FmdGVyTGlzdC5tYXAoKGM6IGFueSkgPT4gYy50eXBlKS5qb2luKCcsICcpfWApKTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoICh2ZXJpZnlFcnJvcjogYW55KSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChgRmFpbGVkIHRvIHZlcmlmeSBjb21wb25lbnQgYWRkaXRpb246ICR7dmVyaWZ5RXJyb3IubWVzc2FnZX1gKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICAvLyDlgpnnlKjmlrnmoYjvvJrkvb/nlKjloLTmma/ohbPmnKxcbiAgICAgICAgICAgICAgICBydW5TY2VuZU1ldGhvZCgnYWRkQ29tcG9uZW50VG9Ob2RlJywgW25vZGVVdWlkLCBjb21wb25lbnRUeXBlXSkudGhlbigocmVzdWx0OiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgICAgICAgIH0pLmNhdGNoKChlcnIyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoYERpcmVjdCBBUEkgZmFpbGVkOiAke2Vyci5tZXNzYWdlfSwgU2NlbmUgc2NyaXB0IGZhaWxlZDogJHtlcnIyLm1lc3NhZ2V9YCkpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgcmVtb3ZlQ29tcG9uZW50SW1wbChub2RlVXVpZDogc3RyaW5nLCBjb21wb25lbnRUeXBlOiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICAvLyAxLiDmn6Xmib7nr4Dpu57kuIrnmoTmiYDmnInntYTku7ZcbiAgICAgICAgY29uc3QgYWxsQ29tcG9uZW50c0luZm8gPSBhd2FpdCB0aGlzLmdldENvbXBvbmVudHNJbXBsKG5vZGVVdWlkKTtcbiAgICAgICAgaWYgKCFhbGxDb21wb25lbnRzSW5mby5zdWNjZXNzIHx8ICFhbGxDb21wb25lbnRzSW5mby5kYXRhPy5jb21wb25lbnRzKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChgRmFpbGVkIHRvIGdldCBjb21wb25lbnRzIGZvciBub2RlICcke25vZGVVdWlkfSc6ICR7YWxsQ29tcG9uZW50c0luZm8uZXJyb3J9YCk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gMi4g5p+l5om+IHR5cGUg5a2X5q61562J5pa8IGNvbXBvbmVudFR5cGXvvIjljbMgY2lk77yJ55qE57WE5Lu277yM5Lim5Y+W5YW244CM57WE5Lu2IHV1aWTjgI1cbiAgICAgICAgY29uc3QgbWF0Y2hlZCA9IGFsbENvbXBvbmVudHNJbmZvLmRhdGEuY29tcG9uZW50cy5maW5kKChjb21wOiBhbnkpID0+IGNvbXAudHlwZSA9PT0gY29tcG9uZW50VHlwZSk7XG4gICAgICAgIGlmICghbWF0Y2hlZCkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoYENvbXBvbmVudCBjaWQgJyR7Y29tcG9uZW50VHlwZX0nIG5vdCBmb3VuZCBvbiBub2RlICcke25vZGVVdWlkfScuIOiri+eUqGdldENvbXBvbmVudHPnjbLlj5Z0eXBl5a2X5q6177yIY2lk77yJ5L2c54K6Y29tcG9uZW50VHlwZeOAgmApO1xuICAgICAgICB9XG4gICAgICAgIC8vIENvY29zIDMuOCDnmoQgcmVtb3ZlLWNvbXBvbmVudCDpnIDopoHjgIzntYTku7boh6rouqvnmoQgdXVpZOOAje+8jOS4jeaYr+evgOm7niB1dWlk44CCXG4gICAgICAgIGNvbnN0IGNvbXBvbmVudFV1aWQgPSBtYXRjaGVkLnV1aWQgPz8gbWF0Y2hlZC5wcm9wZXJ0aWVzPy51dWlkPy52YWx1ZTtcbiAgICAgICAgaWYgKCFjb21wb25lbnRVdWlkKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChgQ291bGQgbm90IHJlc29sdmUgY29tcG9uZW50IHV1aWQgZm9yIGNpZCAnJHtjb21wb25lbnRUeXBlfScgb24gbm9kZSAnJHtub2RlVXVpZH0nLmApO1xuICAgICAgICB9XG4gICAgICAgIC8vIDMuIOWumOaWuUFQSeebtOaOpeenu+mZpO+8iOWCs+e1hOS7tiB1dWlk77yJXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdyZW1vdmUtY29tcG9uZW50Jywge1xuICAgICAgICAgICAgICAgIHV1aWQ6IGNvbXBvbmVudFV1aWQsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIC8vIDQuIOWGjeafpeS4gOasoeeiuuiqjeaYr+WQpuenu+mZpFxuICAgICAgICAgICAgY29uc3QgYWZ0ZXJSZW1vdmVJbmZvID0gYXdhaXQgdGhpcy5nZXRDb21wb25lbnRzSW1wbChub2RlVXVpZCk7XG4gICAgICAgICAgICBjb25zdCBzdGlsbEV4aXN0cyA9IGFmdGVyUmVtb3ZlSW5mby5zdWNjZXNzICYmIGFmdGVyUmVtb3ZlSW5mby5kYXRhPy5jb21wb25lbnRzPy5zb21lKChjb21wOiBhbnkpID0+IGNvbXAudHlwZSA9PT0gY29tcG9uZW50VHlwZSk7XG4gICAgICAgICAgICBpZiAoc3RpbGxFeGlzdHMpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFpbChgQ29tcG9uZW50IGNpZCAnJHtjb21wb25lbnRUeXBlfScgd2FzIG5vdCByZW1vdmVkIGZyb20gbm9kZSAnJHtub2RlVXVpZH0nLmApO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gb2soeyBub2RlVXVpZCwgY29tcG9uZW50VHlwZSB9LCBgQ29tcG9uZW50IGNpZCAnJHtjb21wb25lbnRUeXBlfScgcmVtb3ZlZCBzdWNjZXNzZnVsbHkgZnJvbSBub2RlICcke25vZGVVdWlkfSdgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGBGYWlsZWQgdG8gcmVtb3ZlIGNvbXBvbmVudDogJHtlcnIubWVzc2FnZX1gKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2V0Q29tcG9uZW50c0ltcGwobm9kZVV1aWQ6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgLy8g5YSq5YWI5ZqQ6Kmm55u05o6l5L2/55SoIEVkaXRvciBBUEkg5p+l6Kmi56+A6bue5L+h5oGvXG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1ub2RlJywgbm9kZVV1aWQpLnRoZW4oKG5vZGVEYXRhOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAobm9kZURhdGEgJiYgbm9kZURhdGEuX19jb21wc19fKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbXBvbmVudHMgPSBub2RlRGF0YS5fX2NvbXBzX18ubWFwKChjb21wOiBhbnkpID0+ICh7XG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiBjb21wLl9fdHlwZV9fIHx8IGNvbXAuY2lkIHx8IGNvbXAudHlwZSB8fCAnVW5rbm93bicsXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBxdWVyeS1ub2RlIOeahOe1hOS7tiB1dWlkIOS9jeaWvCBjb21wLnZhbHVlLnV1aWTvvIhkdW1wIOW9ouW8j++8ie+8jFxuICAgICAgICAgICAgICAgICAgICAgICAgLy8g6IiK54mI55u05o6l6K6AIGNvbXAudXVpZCDmsLjpgaDngrogbnVsbO+8m+WFqeeoruW9ouaFi+mDvea2teiTi+OAglxuICAgICAgICAgICAgICAgICAgICAgICAgdXVpZDogZHVtcFVud3JhcChjb21wLnZhbHVlPy51dWlkID8/IGNvbXAudXVpZCwgbnVsbCksXG4gICAgICAgICAgICAgICAgICAgICAgICBlbmFibGVkOiBjb21wLmVuYWJsZWQgIT09IHVuZGVmaW5lZCA/IGNvbXAuZW5hYmxlZCA6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0aWVzOiB0aGlzLmV4dHJhY3RDb21wb25lbnRQcm9wZXJ0aWVzKGNvbXApXG4gICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5vZGVVdWlkOiBub2RlVXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRzOiBjb21wb25lbnRzXG4gICAgICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKCdOb2RlIG5vdCBmb3VuZCBvciBubyBjb21wb25lbnRzIGRhdGEnKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICAvLyDlgpnnlKjmlrnmoYjvvJrkvb/nlKjloLTmma/ohbPmnKxcbiAgICAgICAgICAgICAgICBydW5TY2VuZU1ldGhvZCgnZ2V0Tm9kZUluZm8nLCBbbm9kZVV1aWRdKS50aGVuKChyZXN1bHQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUob2socmVzdWx0LmRhdGEuY29tcG9uZW50cykpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSkuY2F0Y2goKGVycjI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChgRGlyZWN0IEFQSSBmYWlsZWQ6ICR7ZXJyLm1lc3NhZ2V9LCBTY2VuZSBzY3JpcHQgZmFpbGVkOiAke2VycjIubWVzc2FnZX1gKSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRDb21wb25lbnRJbmZvSW1wbChub2RlVXVpZDogc3RyaW5nLCBjb21wb25lbnRUeXBlOiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIC8vIOWEquWFiOWakOippuebtOaOpeS9v+eUqCBFZGl0b3IgQVBJIOafpeipouevgOm7nuS/oeaBr1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktbm9kZScsIG5vZGVVdWlkKS50aGVuKChub2RlRGF0YTogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKG5vZGVEYXRhICYmIG5vZGVEYXRhLl9fY29tcHNfXykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjb21wb25lbnRJbmRleCA9IGZpbmRDb21wb25lbnRJbmRleEJ5VHlwZShub2RlRGF0YS5fX2NvbXBzX18sIGNvbXBvbmVudFR5cGUpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjb21wb25lbnQgPSBjb21wb25lbnRJbmRleCA9PT0gLTEgPyBudWxsIDogbm9kZURhdGEuX19jb21wc19fW2NvbXBvbmVudEluZGV4XTtcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIGlmIChjb21wb25lbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBub2RlVXVpZDogbm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudFR5cGU6IGNvbXBvbmVudFR5cGUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVuYWJsZWQ6IGNvbXBvbmVudC5lbmFibGVkICE9PSB1bmRlZmluZWQgPyBjb21wb25lbnQuZW5hYmxlZCA6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb3BlcnRpZXM6IHRoaXMuZXh0cmFjdENvbXBvbmVudFByb3BlcnRpZXMoY29tcG9uZW50KVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChgQ29tcG9uZW50ICcke2NvbXBvbmVudFR5cGV9JyBub3QgZm91bmQgb24gbm9kZWApKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbCgnTm9kZSBub3QgZm91bmQgb3Igbm8gY29tcG9uZW50cyBkYXRhJykpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgLy8g5YKZ55So5pa55qGI77ya5L2/55So5aC05pmv6IWz5pysXG4gICAgICAgICAgICAgICAgcnVuU2NlbmVNZXRob2QoJ2dldE5vZGVJbmZvJywgW25vZGVVdWlkXSkudGhlbigocmVzdWx0OiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdC5zdWNjZXNzICYmIHJlc3VsdC5kYXRhLmNvbXBvbmVudHMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbXBvbmVudEluZGV4ID0gZmluZENvbXBvbmVudEluZGV4QnlUeXBlKHJlc3VsdC5kYXRhLmNvbXBvbmVudHMsIGNvbXBvbmVudFR5cGUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY29tcG9uZW50ID0gY29tcG9uZW50SW5kZXggPT09IC0xID8gbnVsbCA6IHJlc3VsdC5kYXRhLmNvbXBvbmVudHNbY29tcG9uZW50SW5kZXhdO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNvbXBvbmVudCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWQ6IG5vZGVVdWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50VHlwZTogY29tcG9uZW50VHlwZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC4uLmNvbXBvbmVudFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChgQ29tcG9uZW50ICcke2NvbXBvbmVudFR5cGV9JyBub3QgZm91bmQgb24gbm9kZWApKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChyZXN1bHQuZXJyb3IgfHwgJ0ZhaWxlZCB0byBnZXQgY29tcG9uZW50IGluZm8nKSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KS5jYXRjaCgoZXJyMjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGBEaXJlY3QgQVBJIGZhaWxlZDogJHtlcnIubWVzc2FnZX0sIFNjZW5lIHNjcmlwdCBmYWlsZWQ6ICR7ZXJyMi5tZXNzYWdlfWApKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGV4dHJhY3RDb21wb25lbnRQcm9wZXJ0aWVzKGNvbXBvbmVudDogYW55KTogUmVjb3JkPHN0cmluZywgYW55PiB7XG4gICAgICAgIGRlYnVnTG9nKGBbZXh0cmFjdENvbXBvbmVudFByb3BlcnRpZXNdIFByb2Nlc3NpbmcgY29tcG9uZW50OmAsIE9iamVjdC5rZXlzKGNvbXBvbmVudCkpO1xuICAgICAgICBcbiAgICAgICAgLy8g5qqi5p+l57WE5Lu25piv5ZCm5pyJIHZhbHVlIOWxrOaAp++8jOmAmemAmuW4uOWMheWQq+Wvpumam+eahOe1hOS7tuWxrOaAp1xuICAgICAgICBpZiAoY29tcG9uZW50LnZhbHVlICYmIHR5cGVvZiBjb21wb25lbnQudmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICBkZWJ1Z0xvZyhgW2V4dHJhY3RDb21wb25lbnRQcm9wZXJ0aWVzXSBGb3VuZCBjb21wb25lbnQudmFsdWUgd2l0aCBwcm9wZXJ0aWVzOmAsIE9iamVjdC5rZXlzKGNvbXBvbmVudC52YWx1ZSkpO1xuICAgICAgICAgICAgcmV0dXJuIGNvbXBvbmVudC52YWx1ZTsgLy8g55u05o6l6L+U5ZueIHZhbHVlIOWwjeixoe+8jOWug+WMheWQq+aJgOaciee1hOS7tuWxrOaAp1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAvLyDlgpnnlKjmlrnmoYjvvJrlvp7ntYTku7blsI3osaHkuK3nm7TmjqXmj5Dlj5blsazmgKdcbiAgICAgICAgY29uc3QgcHJvcGVydGllczogUmVjb3JkPHN0cmluZywgYW55PiA9IHt9O1xuICAgICAgICBjb25zdCBleGNsdWRlS2V5cyA9IFsnX190eXBlX18nLCAnZW5hYmxlZCcsICdub2RlJywgJ19pZCcsICdfX3NjcmlwdEFzc2V0JywgJ3V1aWQnLCAnbmFtZScsICdfbmFtZScsICdfb2JqRmxhZ3MnLCAnX2VuYWJsZWQnLCAndHlwZScsICdyZWFkb25seScsICd2aXNpYmxlJywgJ2NpZCcsICdlZGl0b3InLCAnZXh0ZW5kcyddO1xuICAgICAgICBcbiAgICAgICAgZm9yIChjb25zdCBrZXkgaW4gY29tcG9uZW50KSB7XG4gICAgICAgICAgICBpZiAoIWV4Y2x1ZGVLZXlzLmluY2x1ZGVzKGtleSkgJiYgIWtleS5zdGFydHNXaXRoKCdfJykpIHtcbiAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgW2V4dHJhY3RDb21wb25lbnRQcm9wZXJ0aWVzXSBGb3VuZCBkaXJlY3QgcHJvcGVydHkgJyR7a2V5fSc6YCwgdHlwZW9mIGNvbXBvbmVudFtrZXldKTtcbiAgICAgICAgICAgICAgICBwcm9wZXJ0aWVzW2tleV0gPSBjb21wb25lbnRba2V5XTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgZGVidWdMb2coYFtleHRyYWN0Q29tcG9uZW50UHJvcGVydGllc10gRmluYWwgZXh0cmFjdGVkIHByb3BlcnRpZXM6YCwgT2JqZWN0LmtleXMocHJvcGVydGllcykpO1xuICAgICAgICByZXR1cm4gcHJvcGVydGllcztcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGZpbmRDb21wb25lbnRUeXBlQnlVdWlkKGNvbXBvbmVudFV1aWQ6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4ge1xuICAgICAgICBkZWJ1Z0xvZyhgW2ZpbmRDb21wb25lbnRUeXBlQnlVdWlkXSBTZWFyY2hpbmcgZm9yIGNvbXBvbmVudCB0eXBlIHdpdGggVVVJRDogJHtjb21wb25lbnRVdWlkfWApO1xuICAgICAgICBpZiAoIWNvbXBvbmVudFV1aWQpIHtcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBub2RlVHJlZSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LW5vZGUtdHJlZScpO1xuICAgICAgICAgICAgaWYgKCFub2RlVHJlZSkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybignW2ZpbmRDb21wb25lbnRUeXBlQnlVdWlkXSBGYWlsZWQgdG8gcXVlcnkgbm9kZSB0cmVlLicpO1xuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBxdWV1ZTogYW55W10gPSBbbm9kZVRyZWVdO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICB3aGlsZSAocXVldWUubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGN1cnJlbnROb2RlSW5mbyA9IHF1ZXVlLnNoaWZ0KCk7XG4gICAgICAgICAgICAgICAgaWYgKCFjdXJyZW50Tm9kZUluZm8gfHwgIWN1cnJlbnROb2RlSW5mby51dWlkKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGZ1bGxOb2RlRGF0YSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LW5vZGUnLCBjdXJyZW50Tm9kZUluZm8udXVpZCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChmdWxsTm9kZURhdGEgJiYgZnVsbE5vZGVEYXRhLl9fY29tcHNfXykge1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBjb21wIG9mIGZ1bGxOb2RlRGF0YS5fX2NvbXBzX18pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjb21wQW55ID0gY29tcCBhcyBhbnk7IC8vIENhc3QgdG8gYW55IHRvIGFjY2VzcyBkeW5hbWljIHByb3BlcnRpZXNcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBUaGUgY29tcG9uZW50IFVVSUQgaXMgbmVzdGVkIGluIHRoZSAndmFsdWUnIHByb3BlcnR5XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNvbXBBbnkudXVpZCAmJiBjb21wQW55LnV1aWQudmFsdWUgPT09IGNvbXBvbmVudFV1aWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY29tcG9uZW50VHlwZSA9IGNvbXBBbnkuX190eXBlX187XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlYnVnTG9nKGBbZmluZENvbXBvbmVudFR5cGVCeVV1aWRdIEZvdW5kIGNvbXBvbmVudCB0eXBlICcke2NvbXBvbmVudFR5cGV9JyBmb3IgVVVJRCAke2NvbXBvbmVudFV1aWR9IG9uIG5vZGUgJHtmdWxsTm9kZURhdGEubmFtZT8udmFsdWV9YCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBjb21wb25lbnRUeXBlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS53YXJuKGBbZmluZENvbXBvbmVudFR5cGVCeVV1aWRdIENvdWxkIG5vdCBxdWVyeSBub2RlICR7Y3VycmVudE5vZGVJbmZvLnV1aWR9OmAsIGUpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChjdXJyZW50Tm9kZUluZm8uY2hpbGRyZW4pIHtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBjaGlsZCBvZiBjdXJyZW50Tm9kZUluZm8uY2hpbGRyZW4pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHF1ZXVlLnB1c2goY2hpbGQpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oYFtmaW5kQ29tcG9uZW50VHlwZUJ5VXVpZF0gQ29tcG9uZW50IHdpdGggVVVJRCAke2NvbXBvbmVudFV1aWR9IG5vdCBmb3VuZCBpbiBzY2VuZSB0cmVlLmApO1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKGBbZmluZENvbXBvbmVudFR5cGVCeVV1aWRdIEVycm9yIHdoaWxlIHNlYXJjaGluZyBmb3IgY29tcG9uZW50IHR5cGU6YCwgZXJyb3IpO1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHNldENvbXBvbmVudFByb3BlcnR5KGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB7IG5vZGVVdWlkLCBjb21wb25lbnRUeXBlLCBwcm9wZXJ0eSwgcHJvcGVydHlUeXBlLCB2YWx1ZSB9ID0gYXJncztcbiAgICAgICAgXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgZGVidWdMb2coYFtDb21wb25lbnRUb29sc10gU2V0dGluZyAke2NvbXBvbmVudFR5cGV9LiR7cHJvcGVydHl9ICh0eXBlOiAke3Byb3BlcnR5VHlwZX0pID0gJHtKU09OLnN0cmluZ2lmeSh2YWx1ZSl9IG9uIG5vZGUgJHtub2RlVXVpZH1gKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAvLyBTdGVwIDA6IOaqoua4rOaYr+WQpueCuuevgOm7nuWxrOaAp++8jOWmguaenOaYr+WJh+mHjeWumuWQkeWIsOWwjeaHieeahOevgOm7nuaWueazlVxuICAgICAgICAgICAgICAgIGNvbnN0IG5vZGVSZWRpcmVjdFJlc3VsdCA9IGF3YWl0IHRoaXMuY2hlY2tBbmRSZWRpcmVjdE5vZGVQcm9wZXJ0aWVzKGFyZ3MpO1xuICAgICAgICAgICAgICAgIGlmIChub2RlUmVkaXJlY3RSZXN1bHQpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG5vZGVSZWRpcmVjdFJlc3VsdDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgLy8gU3RlcCAxOiDnjbLlj5bntYTku7bkv6Hmga/vvIzkvb/nlKjoiIdnZXRDb21wb25lbnRz55u45ZCM55qE5pa55rOVXG4gICAgICAgICAgICAgICAgY29uc3QgY29tcG9uZW50c1Jlc3BvbnNlID0gYXdhaXQgdGhpcy5nZXRDb21wb25lbnRzSW1wbChub2RlVXVpZCk7XG4gICAgICAgICAgICAgICAgaWYgKCFjb21wb25lbnRzUmVzcG9uc2Uuc3VjY2VzcyB8fCAhY29tcG9uZW50c1Jlc3BvbnNlLmRhdGEpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGBGYWlsZWQgdG8gZ2V0IGNvbXBvbmVudHMgZm9yIG5vZGUgJyR7bm9kZVV1aWR9JzogJHtjb21wb25lbnRzUmVzcG9uc2UuZXJyb3J9YCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGluc3RydWN0aW9uOiBgUGxlYXNlIHZlcmlmeSB0aGF0IG5vZGUgVVVJRCAnJHtub2RlVXVpZH0nIGlzIGNvcnJlY3QuIFVzZSBnZXRfYWxsX25vZGVzIG9yIGZpbmRfbm9kZV9ieV9uYW1lIHRvIGdldCB0aGUgY29ycmVjdCBub2RlIFVVSUQuYFxuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBjb25zdCBhbGxDb21wb25lbnRzID0gY29tcG9uZW50c1Jlc3BvbnNlLmRhdGEuY29tcG9uZW50cztcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAvLyBTdGVwIDI6IOafpeaJvuebruaomee1hOS7tlxuICAgICAgICAgICAgICAgIC8vIFdlIGNhcHR1cmUgdGhlIG1hdGNoZWQgaW5kZXggaGVyZSBzbyBTdGVwIDUgZG9lc24ndCBuZWVkIGFcbiAgICAgICAgICAgICAgICAvLyBzZWNvbmQgYHNjZW5lL3F1ZXJ5LW5vZGVgIGNhbGw6IGdldENvbXBvbmVudHMgYWJvdmUgbWFwc1xuICAgICAgICAgICAgICAgIC8vIF9fY29tcHNfXyAxOjEgKHByZXNlcnZlcyBvcmRlcikgb24gdGhlIGRpcmVjdCBBUEkgcGF0aCxcbiAgICAgICAgICAgICAgICAvLyB3aGljaCBpcyB0aGUgb25seSBwYXRoIHRoYXQgeWllbGRzIGBkYXRhLmNvbXBvbmVudHNgIGluXG4gICAgICAgICAgICAgICAgLy8gdGhpcyBzaGFwZSDigJQgdGhlIHJ1blNjZW5lTWV0aG9kIGZhbGxiYWNrIHJldHVybnMgYSBkaWZmZXJlbnRcbiAgICAgICAgICAgICAgICAvLyBzaGFwZSB0aGF0IHdvdWxkbid0IHJlYWNoIGhlcmUgd2l0aG91dCBlcnJvcmluZyBlYXJsaWVyLlxuICAgICAgICAgICAgICAgIGxldCB0YXJnZXRDb21wb25lbnQgPSBudWxsO1xuICAgICAgICAgICAgICAgIGxldCB0YXJnZXRDb21wb25lbnRJbmRleCA9IC0xO1xuICAgICAgICAgICAgICAgIGNvbnN0IGF2YWlsYWJsZVR5cGVzOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCBjb21wIG9mIGFsbENvbXBvbmVudHMpIHtcbiAgICAgICAgICAgICAgICAgICAgYXZhaWxhYmxlVHlwZXMucHVzaChjb21wLnR5cGUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0YXJnZXRDb21wb25lbnRJbmRleCA9IGZpbmRDb21wb25lbnRJbmRleEJ5VHlwZShhbGxDb21wb25lbnRzLCBjb21wb25lbnRUeXBlKTtcbiAgICAgICAgICAgICAgICB0YXJnZXRDb21wb25lbnQgPSB0YXJnZXRDb21wb25lbnRJbmRleCA9PT0gLTEgPyBudWxsIDogYWxsQ29tcG9uZW50c1t0YXJnZXRDb21wb25lbnRJbmRleF07XG5cbiAgICAgICAgICAgICAgICBpZiAoIXRhcmdldENvbXBvbmVudCkge1xuICAgICAgICAgICAgICAgICAgICAvLyDmj5Dkvpvmm7ToqbPntLDnmoTpjK/oqqTkv6Hmga/lkozlu7rorbBcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaW5zdHJ1Y3Rpb24gPSB0aGlzLmdlbmVyYXRlQ29tcG9uZW50U3VnZ2VzdGlvbihjb21wb25lbnRUeXBlLCBhdmFpbGFibGVUeXBlcywgcHJvcGVydHkpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgICAgICBlcnJvcjogYENvbXBvbmVudCAnJHtjb21wb25lbnRUeXBlfScgbm90IGZvdW5kIG9uIG5vZGUuIEF2YWlsYWJsZSBjb21wb25lbnRzOiAke2F2YWlsYWJsZVR5cGVzLmpvaW4oJywgJyl9YCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGluc3RydWN0aW9uOiBpbnN0cnVjdGlvblxuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAvLyBTdGVwIDM6IOiHquWLleaqoua4rOWSjOi9ieaPm+WxrOaAp+WAvFxuICAgICAgICAgICAgICAgIGxldCBwcm9wZXJ0eUluZm87XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYFtDb21wb25lbnRUb29sc10gQW5hbHl6aW5nIHByb3BlcnR5OiAke3Byb3BlcnR5fWApO1xuICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0eUluZm8gPSB0aGlzLmFuYWx5emVQcm9wZXJ0eSh0YXJnZXRDb21wb25lbnQsIHByb3BlcnR5KTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChhbmFseXplRXJyb3I6IGFueSkge1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBbQ29tcG9uZW50VG9vbHNdIEVycm9yIGluIGFuYWx5emVQcm9wZXJ0eTpgLCBhbmFseXplRXJyb3IpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFpbChgRmFpbGVkIHRvIGFuYWx5emUgcHJvcGVydHkgJyR7cHJvcGVydHl9JzogJHthbmFseXplRXJyb3IubWVzc2FnZX1gKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaWYgKCFwcm9wZXJ0eUluZm8uZXhpc3RzKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKGBQcm9wZXJ0eSAnJHtwcm9wZXJ0eX0nIG5vdCBmb3VuZCBvbiBjb21wb25lbnQgJyR7Y29tcG9uZW50VHlwZX0nLiBBdmFpbGFibGUgcHJvcGVydGllczogJHtwcm9wZXJ0eUluZm8uYXZhaWxhYmxlUHJvcGVydGllcy5qb2luKCcsICcpfWApO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIFN0ZXAgMy41OiBwcm9wZXJ0eVR5cGUgdnMgbWV0YWRhdGEgcmVmZXJlbmNlLWtpbmQgcHJlZmxpZ2h0LlxuICAgICAgICAgICAgICAgIC8vIENhdGNoZXMgdGhlIGNvbW1vbiBwaXRmYWxsIHdoZXJlIGEgY2MuQ29tcG9uZW50IHN1YmNsYXNzIGZpZWxkXG4gICAgICAgICAgICAgICAgLy8gKGUuZy4gY2MuQ2FudmFzLmNhbWVyYUNvbXBvbmVudCA6IGNjLkNhbWVyYSkgZ2V0cyBjYWxsZWQgd2l0aFxuICAgICAgICAgICAgICAgIC8vIHByb3BlcnR5VHlwZTogJ25vZGUnIOKAlCB0aGUgSVBDIHNpbGVudGx5IGFjY2VwdHMgYnV0IHRoZSByZWZcbiAgICAgICAgICAgICAgICAvLyBuZXZlciBjb25uZWN0cy4gV2Ugc3VyZmFjZSB0aGUgcmlnaHQgcHJvcGVydHlUeXBlICsgdmFsdWUgc2hhcGUuXG4gICAgICAgICAgICAgICAgY29uc3QgbWlzbWF0Y2ggPSB0aGlzLmRldGVjdFByb3BlcnR5VHlwZU1pc21hdGNoKFxuICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0eUluZm8sXG4gICAgICAgICAgICAgICAgICAgIHByb3BlcnR5VHlwZSxcbiAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudFR5cGUsXG4gICAgICAgICAgICAgICAgICAgIHByb3BlcnR5LFxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgaWYgKG1pc21hdGNoKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBtaXNtYXRjaDtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBTdGVwIDQ6IOiZleeQhuWxrOaAp+WAvOWSjOioree9rlxuICAgICAgICAgICAgICAgIGNvbnN0IG9yaWdpbmFsVmFsdWUgPSBwcm9wZXJ0eUluZm8ub3JpZ2luYWxWYWx1ZTtcbiAgICAgICAgICAgICAgICBsZXQgcHJvY2Vzc2VkVmFsdWU6IGFueTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAvLyDmoLnmk5rmmI7norrnmoRwcm9wZXJ0eVR5cGXomZXnkIblsazmgKflgLxcbiAgICAgICAgICAgICAgICBzd2l0Y2ggKHByb3BlcnR5VHlwZSkge1xuICAgICAgICAgICAgICAgICAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgICAgICAgICAgICAgICAgICAgcHJvY2Vzc2VkVmFsdWUgPSBTdHJpbmcodmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ251bWJlcic6XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ2ludGVnZXInOlxuICAgICAgICAgICAgICAgICAgICBjYXNlICdmbG9hdCc6XG4gICAgICAgICAgICAgICAgICAgICAgICBwcm9jZXNzZWRWYWx1ZSA9IE51bWJlcih2YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICAgICAgICAgICAgICAgICAgICBwcm9jZXNzZWRWYWx1ZSA9IEJvb2xlYW4odmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ2NvbG9yJzpcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5a2X56ym5Liy5qC85byP77ya5pSv5oyB5Y2B5YWt6YCy5Yi244CB6aGP6Imy5ZCN56ix44CBcmdiKCkvcmdiYSgpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvY2Vzc2VkVmFsdWUgPSB0aGlzLnBhcnNlQ29sb3JTdHJpbmcodmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5bCN6LGh5qC85byP77ya6amX6K2J5Lim6L2J5o+bUkdCQeWAvFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb2Nlc3NlZFZhbHVlID0ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByOiBNYXRoLm1pbigyNTUsIE1hdGgubWF4KDAsIE51bWJlcih2YWx1ZS5yKSB8fCAwKSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGc6IE1hdGgubWluKDI1NSwgTWF0aC5tYXgoMCwgTnVtYmVyKHZhbHVlLmcpIHx8IDApKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYjogTWF0aC5taW4oMjU1LCBNYXRoLm1heCgwLCBOdW1iZXIodmFsdWUuYikgfHwgMCkpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhOiB2YWx1ZS5hICE9PSB1bmRlZmluZWQgPyBNYXRoLm1pbigyNTUsIE1hdGgubWF4KDAsIE51bWJlcih2YWx1ZS5hKSkpIDogMjU1XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdDb2xvciB2YWx1ZSBtdXN0IGJlIGFuIG9iamVjdCB3aXRoIHIsIGcsIGIgcHJvcGVydGllcyBvciBhIGhleGFkZWNpbWFsIHN0cmluZyAoZS5nLiwgXCIjRkYwMDAwXCIpJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgY2FzZSAndmVjMic6XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb2Nlc3NlZFZhbHVlID0ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB4OiBOdW1iZXIodmFsdWUueCkgfHwgMCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgeTogTnVtYmVyKHZhbHVlLnkpIHx8IDBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1ZlYzIgdmFsdWUgbXVzdCBiZSBhbiBvYmplY3Qgd2l0aCB4LCB5IHByb3BlcnRpZXMnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBjYXNlICd2ZWMzJzpcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvY2Vzc2VkVmFsdWUgPSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHg6IE51bWJlcih2YWx1ZS54KSB8fCAwLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB5OiBOdW1iZXIodmFsdWUueSkgfHwgMCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgejogTnVtYmVyKHZhbHVlLnopIHx8IDBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1ZlYzMgdmFsdWUgbXVzdCBiZSBhbiBvYmplY3Qgd2l0aCB4LCB5LCB6IHByb3BlcnRpZXMnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBjYXNlICdzaXplJzpcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvY2Vzc2VkVmFsdWUgPSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHdpZHRoOiBOdW1iZXIodmFsdWUud2lkdGgpIHx8IDAsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGhlaWdodDogTnVtYmVyKHZhbHVlLmhlaWdodCkgfHwgMFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignU2l6ZSB2YWx1ZSBtdXN0IGJlIGFuIG9iamVjdCB3aXRoIHdpZHRoLCBoZWlnaHQgcHJvcGVydGllcycpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ25vZGUnOlxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9jZXNzZWRWYWx1ZSA9IHsgdXVpZDogdmFsdWUgfTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdOb2RlIHJlZmVyZW5jZSB2YWx1ZSBtdXN0IGJlIGEgc3RyaW5nIFVVSUQnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBjYXNlICdjb21wb25lbnQnOlxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDntYTku7blvJXnlKjpnIDopoHnibnmroromZXnkIbvvJrpgJrpgY7nr4Dpu55VVUlE5om+5Yiw57WE5Lu255qEX19pZF9fXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvY2Vzc2VkVmFsdWUgPSB2YWx1ZTsgLy8g5YWI5L+d5a2Y56+A6bueVVVJRO+8jOW+jOe6jOacg+i9ieaPm+eCul9faWRfX1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0NvbXBvbmVudCByZWZlcmVuY2UgdmFsdWUgbXVzdCBiZSBhIHN0cmluZyAobm9kZSBVVUlEIGNvbnRhaW5pbmcgdGhlIHRhcmdldCBjb21wb25lbnQpJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgY2FzZSAnc3ByaXRlRnJhbWUnOlxuICAgICAgICAgICAgICAgICAgICBjYXNlICdwcmVmYWInOlxuICAgICAgICAgICAgICAgICAgICBjYXNlICdhc3NldCc6XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb2Nlc3NlZFZhbHVlID0geyB1dWlkOiB2YWx1ZSB9O1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYCR7cHJvcGVydHlUeXBlfSB2YWx1ZSBtdXN0IGJlIGEgc3RyaW5nIFVVSURgKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBjYXNlICdub2RlQXJyYXknOlxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvY2Vzc2VkVmFsdWUgPSB2YWx1ZS5tYXAoKGl0ZW06IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGl0ZW0gPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4geyB1dWlkOiBpdGVtIH07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vZGVBcnJheSBpdGVtcyBtdXN0IGJlIHN0cmluZyBVVUlEcycpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignTm9kZUFycmF5IHZhbHVlIG11c3QgYmUgYW4gYXJyYXknKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBjYXNlICdjb2xvckFycmF5JzpcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb2Nlc3NlZFZhbHVlID0gdmFsdWUubWFwKChpdGVtOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBpdGVtID09PSAnb2JqZWN0JyAmJiBpdGVtICE9PSBudWxsICYmICdyJyBpbiBpdGVtKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHI6IE1hdGgubWluKDI1NSwgTWF0aC5tYXgoMCwgTnVtYmVyKGl0ZW0ucikgfHwgMCkpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGc6IE1hdGgubWluKDI1NSwgTWF0aC5tYXgoMCwgTnVtYmVyKGl0ZW0uZykgfHwgMCkpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGI6IE1hdGgubWluKDI1NSwgTWF0aC5tYXgoMCwgTnVtYmVyKGl0ZW0uYikgfHwgMCkpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGE6IGl0ZW0uYSAhPT0gdW5kZWZpbmVkID8gTWF0aC5taW4oMjU1LCBNYXRoLm1heCgwLCBOdW1iZXIoaXRlbS5hKSkpIDogMjU1XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgcjogMjU1LCBnOiAyNTUsIGI6IDI1NSwgYTogMjU1IH07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdDb2xvckFycmF5IHZhbHVlIG11c3QgYmUgYW4gYXJyYXknKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBjYXNlICdudW1iZXJBcnJheSc6XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9jZXNzZWRWYWx1ZSA9IHZhbHVlLm1hcCgoaXRlbTogYW55KSA9PiBOdW1iZXIoaXRlbSkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ051bWJlckFycmF5IHZhbHVlIG11c3QgYmUgYW4gYXJyYXknKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBjYXNlICdzdHJpbmdBcnJheSc6XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9jZXNzZWRWYWx1ZSA9IHZhbHVlLm1hcCgoaXRlbTogYW55KSA9PiBTdHJpbmcoaXRlbSkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1N0cmluZ0FycmF5IHZhbHVlIG11c3QgYmUgYW4gYXJyYXknKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbnN1cHBvcnRlZCBwcm9wZXJ0eSB0eXBlOiAke3Byb3BlcnR5VHlwZX1gKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgZGVidWdMb2coYFtDb21wb25lbnRUb29sc10gQ29udmVydGluZyB2YWx1ZTogJHtKU09OLnN0cmluZ2lmeSh2YWx1ZSl9IC0+ICR7SlNPTi5zdHJpbmdpZnkocHJvY2Vzc2VkVmFsdWUpfSAodHlwZTogJHtwcm9wZXJ0eVR5cGV9KWApO1xuICAgICAgICAgICAgICAgIGRlYnVnTG9nKGBbQ29tcG9uZW50VG9vbHNdIFByb3BlcnR5IGFuYWx5c2lzIHJlc3VsdDogcHJvcGVydHlJbmZvLnR5cGU9XCIke3Byb3BlcnR5SW5mby50eXBlfVwiLCBwcm9wZXJ0eVR5cGU9XCIke3Byb3BlcnR5VHlwZX1cImApO1xuICAgICAgICAgICAgICAgIGRlYnVnTG9nKGBbQ29tcG9uZW50VG9vbHNdIFdpbGwgdXNlIGNvbG9yIHNwZWNpYWwgaGFuZGxpbmc6ICR7cHJvcGVydHlUeXBlID09PSAnY29sb3InICYmIHByb2Nlc3NlZFZhbHVlICYmIHR5cGVvZiBwcm9jZXNzZWRWYWx1ZSA9PT0gJ29iamVjdCd9YCk7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgLy8g55So5pa86amX6K2J55qE5a+m6Zqb5pyf5pyb5YC877yI5bCN5pa857WE5Lu25byV55So6ZyA6KaB54m55q6K6JmV55CG77yJXG4gICAgICAgICAgICAgICAgbGV0IGFjdHVhbEV4cGVjdGVkVmFsdWUgPSBwcm9jZXNzZWRWYWx1ZTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAvLyBTdGVwIDU6IOani+W7uuWxrOaAp+i3r+W+ke+8iGNvbXBvbmVudCBpbmRleCDlt7LlnKggU3RlcCAyIOaNleeNsu+8iVxuICAgICAgICAgICAgICAgIGNvbnN0IHJhd0NvbXBvbmVudEluZGV4ID0gdGFyZ2V0Q29tcG9uZW50SW5kZXg7XG4gICAgICAgICAgICAgICAgbGV0IHByb3BlcnR5UGF0aCA9IGBfX2NvbXBzX18uJHtyYXdDb21wb25lbnRJbmRleH0uJHtwcm9wZXJ0eX1gO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIC8vIOeJueauiuiZleeQhuizh+a6kOmhnuWxrOaAp1xuICAgICAgICAgICAgICAgIGlmIChwcm9wZXJ0eVR5cGUgPT09ICdhc3NldCcgfHwgcHJvcGVydHlUeXBlID09PSAnc3ByaXRlRnJhbWUnIHx8IHByb3BlcnR5VHlwZSA9PT0gJ3ByZWZhYicgfHxcbiAgICAgICAgICAgICAgICAgICAgKHByb3BlcnR5SW5mby50eXBlID09PSAnYXNzZXQnICYmIHByb3BlcnR5VHlwZSA9PT0gJ3N0cmluZycpKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYFtDb21wb25lbnRUb29sc10gU2V0dGluZyBhc3NldCByZWZlcmVuY2U6YCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWU6IHByb2Nlc3NlZFZhbHVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgcHJvcGVydHk6IHByb3BlcnR5LFxuICAgICAgICAgICAgICAgICAgICAgICAgcHJvcGVydHlUeXBlOiBwcm9wZXJ0eVR5cGUsXG4gICAgICAgICAgICAgICAgICAgICAgICBwYXRoOiBwcm9wZXJ0eVBhdGhcbiAgICAgICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gV29ya2Zsb3cgb3B0LWluOiB3aGVuIGFzc2lnbmluZyBjYy5TcHJpdGUuc3ByaXRlRnJhbWUgYW5kIHRoZVxuICAgICAgICAgICAgICAgICAgICAvLyBjYWxsZXIgd2FudHMgdGhlIG5vZGUncyBleGlzdGluZyBVSVRyYW5zZm9ybSBjb250ZW50U2l6ZSBrZXB0LFxuICAgICAgICAgICAgICAgICAgICAvLyBwcmUtc2V0IHNpemVNb2RlIHRvIENVU1RPTSAoMCkuIGNvY29zJyBkZWZhdWx0IFRSSU1NRUQgd291bGRcbiAgICAgICAgICAgICAgICAgICAgLy8gb3RoZXJ3aXNlIGF1dG8tcmVzaXplIGNvbnRlbnRTaXplIHRvIHRoZSB0ZXh0dXJlJ3MgbmF0aXZlXG4gICAgICAgICAgICAgICAgICAgIC8vIGRpbWVuc2lvbnMgb24gYXNzaWduIOKAlCB1c3VhbGx5IHVud2FudGVkIHdoZW4gbGF5aW5nIG91dCBVSVxuICAgICAgICAgICAgICAgICAgICAvLyBwcm9jZWR1cmFsbHkgd2l0aCBhIGNob3NlbiBzaXplLlxuICAgICAgICAgICAgICAgICAgICBpZiAoYXJncy5wcmVzZXJ2ZUNvbnRlbnRTaXplICYmIGNvbXBvbmVudFR5cGUgPT09ICdjYy5TcHJpdGUnICYmIHByb3BlcnR5ID09PSAnc3ByaXRlRnJhbWUnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3NldC1wcm9wZXJ0eScsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdXVpZDogbm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBhdGg6IGBfX2NvbXBzX18uJHtyYXdDb21wb25lbnRJbmRleH0uc2l6ZU1vZGVgLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkdW1wOiB7IHZhbHVlOiAwIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coJ1tDb21wb25lbnRUb29sc10gcHJlc2VydmVDb250ZW50U2l6ZTogZm9yY2VkIGNjLlNwcml0ZS5zaXplTW9kZT1DVVNUT00oMCkgYmVmb3JlIHNwcml0ZUZyYW1lIGFzc2lnbicpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAocHJlRXJyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS53YXJuKCdbQ29tcG9uZW50VG9vbHNdIHByZXNlcnZlQ29udGVudFNpemUgcHJlLXNldCBmYWlsZWQgKG5vbi1mYXRhbCk6JywgcHJlRXJyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIERldGVybWluZSBhc3NldCB0eXBlIGJhc2VkIG9uIHByb3BlcnR5IG5hbWVcbiAgICAgICAgICAgICAgICAgICAgbGV0IGFzc2V0VHlwZSA9ICdjYy5TcHJpdGVGcmFtZSc7IC8vIGRlZmF1bHRcbiAgICAgICAgICAgICAgICAgICAgaWYgKHByb3BlcnR5LnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ3RleHR1cmUnKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXNzZXRUeXBlID0gJ2NjLlRleHR1cmUyRCc7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHkudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnbWF0ZXJpYWwnKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXNzZXRUeXBlID0gJ2NjLk1hdGVyaWFsJztcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdmb250JykpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFzc2V0VHlwZSA9ICdjYy5Gb250JztcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdjbGlwJykpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFzc2V0VHlwZSA9ICdjYy5BdWRpb0NsaXAnO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5VHlwZSA9PT0gJ3ByZWZhYicpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFzc2V0VHlwZSA9ICdjYy5QcmVmYWInO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnc2V0LXByb3BlcnR5Jywge1xuICAgICAgICAgICAgICAgICAgICAgICAgdXVpZDogbm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBwYXRoOiBwcm9wZXJ0eVBhdGgsXG4gICAgICAgICAgICAgICAgICAgICAgICBkdW1wOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWU6IHByb2Nlc3NlZFZhbHVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6IGFzc2V0VHlwZVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGNvbXBvbmVudFR5cGUgPT09ICdjYy5VSVRyYW5zZm9ybScgJiYgKHByb3BlcnR5ID09PSAnX2NvbnRlbnRTaXplJyB8fCBwcm9wZXJ0eSA9PT0gJ2NvbnRlbnRTaXplJykpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gU3BlY2lhbCBoYW5kbGluZyBmb3IgVUlUcmFuc2Zvcm0gY29udGVudFNpemUgLSBzZXQgd2lkdGggYW5kIGhlaWdodCBzZXBhcmF0ZWx5XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHdpZHRoID0gTnVtYmVyKHZhbHVlLndpZHRoKSB8fCAxMDA7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGhlaWdodCA9IE51bWJlcih2YWx1ZS5oZWlnaHQpIHx8IDEwMDtcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIC8vIFNldCB3aWR0aCBmaXJzdFxuICAgICAgICAgICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdzZXQtcHJvcGVydHknLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiBub2RlVXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhdGg6IGBfX2NvbXBzX18uJHtyYXdDb21wb25lbnRJbmRleH0ud2lkdGhgLFxuICAgICAgICAgICAgICAgICAgICAgICAgZHVtcDogeyB2YWx1ZTogd2lkdGggfVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIC8vIFRoZW4gc2V0IGhlaWdodFxuICAgICAgICAgICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdzZXQtcHJvcGVydHknLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiBub2RlVXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhdGg6IGBfX2NvbXBzX18uJHtyYXdDb21wb25lbnRJbmRleH0uaGVpZ2h0YCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGR1bXA6IHsgdmFsdWU6IGhlaWdodCB9XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoY29tcG9uZW50VHlwZSA9PT0gJ2NjLlVJVHJhbnNmb3JtJyAmJiAocHJvcGVydHkgPT09ICdfYW5jaG9yUG9pbnQnIHx8IHByb3BlcnR5ID09PSAnYW5jaG9yUG9pbnQnKSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBTcGVjaWFsIGhhbmRsaW5nIGZvciBVSVRyYW5zZm9ybSBhbmNob3JQb2ludCAtIHNldCBhbmNob3JYIGFuZCBhbmNob3JZIHNlcGFyYXRlbHlcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYW5jaG9yWCA9IE51bWJlcih2YWx1ZS54KSB8fCAwLjU7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGFuY2hvclkgPSBOdW1iZXIodmFsdWUueSkgfHwgMC41O1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgLy8gU2V0IGFuY2hvclggZmlyc3RcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnc2V0LXByb3BlcnR5Jywge1xuICAgICAgICAgICAgICAgICAgICAgICAgdXVpZDogbm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBwYXRoOiBgX19jb21wc19fLiR7cmF3Q29tcG9uZW50SW5kZXh9LmFuY2hvclhgLFxuICAgICAgICAgICAgICAgICAgICAgICAgZHVtcDogeyB2YWx1ZTogYW5jaG9yWCB9XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgLy8gVGhlbiBzZXQgYW5jaG9yWSAgXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3NldC1wcm9wZXJ0eScsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IG5vZGVVdWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgcGF0aDogYF9fY29tcHNfXy4ke3Jhd0NvbXBvbmVudEluZGV4fS5hbmNob3JZYCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGR1bXA6IHsgdmFsdWU6IGFuY2hvclkgfVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5VHlwZSA9PT0gJ2NvbG9yJyAmJiBwcm9jZXNzZWRWYWx1ZSAmJiB0eXBlb2YgcHJvY2Vzc2VkVmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIOeJueauiuiZleeQhumhj+iJsuWxrOaAp++8jOeiuuS/nVJHQkHlgLzmraPnorpcbiAgICAgICAgICAgICAgICAgICAgLy8gQ29jb3MgQ3JlYXRvcumhj+iJsuWAvOevhOWcjeaYrzAtMjU1XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbG9yVmFsdWUgPSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByOiBNYXRoLm1pbigyNTUsIE1hdGgubWF4KDAsIE51bWJlcihwcm9jZXNzZWRWYWx1ZS5yKSB8fCAwKSksXG4gICAgICAgICAgICAgICAgICAgICAgICBnOiBNYXRoLm1pbigyNTUsIE1hdGgubWF4KDAsIE51bWJlcihwcm9jZXNzZWRWYWx1ZS5nKSB8fCAwKSksXG4gICAgICAgICAgICAgICAgICAgICAgICBiOiBNYXRoLm1pbigyNTUsIE1hdGgubWF4KDAsIE51bWJlcihwcm9jZXNzZWRWYWx1ZS5iKSB8fCAwKSksXG4gICAgICAgICAgICAgICAgICAgICAgICBhOiBwcm9jZXNzZWRWYWx1ZS5hICE9PSB1bmRlZmluZWQgPyBNYXRoLm1pbigyNTUsIE1hdGgubWF4KDAsIE51bWJlcihwcm9jZXNzZWRWYWx1ZS5hKSkpIDogMjU1XG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgW0NvbXBvbmVudFRvb2xzXSBTZXR0aW5nIGNvbG9yIHZhbHVlOmAsIGNvbG9yVmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnc2V0LXByb3BlcnR5Jywge1xuICAgICAgICAgICAgICAgICAgICAgICAgdXVpZDogbm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBwYXRoOiBwcm9wZXJ0eVBhdGgsXG4gICAgICAgICAgICAgICAgICAgICAgICBkdW1wOiB7IFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlOiBjb2xvclZhbHVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6ICdjYy5Db2xvcidcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eVR5cGUgPT09ICd2ZWMzJyAmJiBwcm9jZXNzZWRWYWx1ZSAmJiB0eXBlb2YgcHJvY2Vzc2VkVmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIOeJueauiuiZleeQhlZlYzPlsazmgKdcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdmVjM1ZhbHVlID0ge1xuICAgICAgICAgICAgICAgICAgICAgICAgeDogTnVtYmVyKHByb2Nlc3NlZFZhbHVlLngpIHx8IDAsXG4gICAgICAgICAgICAgICAgICAgICAgICB5OiBOdW1iZXIocHJvY2Vzc2VkVmFsdWUueSkgfHwgMCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHo6IE51bWJlcihwcm9jZXNzZWRWYWx1ZS56KSB8fCAwXG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdzZXQtcHJvcGVydHknLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiBub2RlVXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhdGg6IHByb3BlcnR5UGF0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGR1bXA6IHsgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWU6IHZlYzNWYWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiAnY2MuVmVjMydcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eVR5cGUgPT09ICd2ZWMyJyAmJiBwcm9jZXNzZWRWYWx1ZSAmJiB0eXBlb2YgcHJvY2Vzc2VkVmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIOeJueauiuiZleeQhlZlYzLlsazmgKdcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdmVjMlZhbHVlID0ge1xuICAgICAgICAgICAgICAgICAgICAgICAgeDogTnVtYmVyKHByb2Nlc3NlZFZhbHVlLngpIHx8IDAsXG4gICAgICAgICAgICAgICAgICAgICAgICB5OiBOdW1iZXIocHJvY2Vzc2VkVmFsdWUueSkgfHwgMFxuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnc2V0LXByb3BlcnR5Jywge1xuICAgICAgICAgICAgICAgICAgICAgICAgdXVpZDogbm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBwYXRoOiBwcm9wZXJ0eVBhdGgsXG4gICAgICAgICAgICAgICAgICAgICAgICBkdW1wOiB7IFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlOiB2ZWMyVmFsdWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogJ2NjLlZlYzInXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlUeXBlID09PSAnc2l6ZScgJiYgcHJvY2Vzc2VkVmFsdWUgJiYgdHlwZW9mIHByb2Nlc3NlZFZhbHVlID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgICAgICAgICAvLyDnibnmroromZXnkIZTaXpl5bGs5oCnXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHNpemVWYWx1ZSA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdpZHRoOiBOdW1iZXIocHJvY2Vzc2VkVmFsdWUud2lkdGgpIHx8IDAsXG4gICAgICAgICAgICAgICAgICAgICAgICBoZWlnaHQ6IE51bWJlcihwcm9jZXNzZWRWYWx1ZS5oZWlnaHQpIHx8IDBcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3NldC1wcm9wZXJ0eScsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IG5vZGVVdWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgcGF0aDogcHJvcGVydHlQYXRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgZHVtcDogeyBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZTogc2l6ZVZhbHVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6ICdjYy5TaXplJ1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5VHlwZSA9PT0gJ25vZGUnICYmIHByb2Nlc3NlZFZhbHVlICYmIHR5cGVvZiBwcm9jZXNzZWRWYWx1ZSA9PT0gJ29iamVjdCcgJiYgJ3V1aWQnIGluIHByb2Nlc3NlZFZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIOeJueauiuiZleeQhuevgOm7nuW8leeUqFxuICAgICAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgW0NvbXBvbmVudFRvb2xzXSBTZXR0aW5nIG5vZGUgcmVmZXJlbmNlIHdpdGggVVVJRDogJHtwcm9jZXNzZWRWYWx1ZS51dWlkfWApO1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdzZXQtcHJvcGVydHknLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiBub2RlVXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhdGg6IHByb3BlcnR5UGF0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGR1bXA6IHsgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWU6IHByb2Nlc3NlZFZhbHVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6ICdjYy5Ob2RlJ1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5VHlwZSA9PT0gJ2NvbXBvbmVudCcgJiYgdHlwZW9mIHByb2Nlc3NlZFZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgICAgICAvLyDnibnmroromZXnkIbntYTku7blvJXnlKjvvJrpgJrpgY7nr4Dpu55VVUlE5om+5Yiw57WE5Lu255qEX19pZF9fXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRhcmdldE5vZGVVdWlkID0gcHJvY2Vzc2VkVmFsdWU7XG4gICAgICAgICAgICAgICAgICAgIGRlYnVnTG9nKGBbQ29tcG9uZW50VG9vbHNdIFNldHRpbmcgY29tcG9uZW50IHJlZmVyZW5jZSAtIGZpbmRpbmcgY29tcG9uZW50IG9uIG5vZGU6ICR7dGFyZ2V0Tm9kZVV1aWR9YCk7XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAvLyDlvp7nlbbliY3ntYTku7bnmoTlsazmgKflhYPmlbjmk5rkuK3njbLlj5bmnJ/mnJvnmoTntYTku7bpoZ7lnotcbiAgICAgICAgICAgICAgICAgICAgbGV0IGV4cGVjdGVkQ29tcG9uZW50VHlwZSA9ICcnO1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgLy8g542y5Y+W55W25YmN57WE5Lu255qE6Kmz57Sw5L+h5oGv77yM5YyF5ous5bGs5oCn5YWD5pW45pOaXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGN1cnJlbnRDb21wb25lbnRJbmZvID0gYXdhaXQgdGhpcy5nZXRDb21wb25lbnRJbmZvSW1wbChub2RlVXVpZCwgY29tcG9uZW50VHlwZSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChjdXJyZW50Q29tcG9uZW50SW5mby5zdWNjZXNzICYmIGN1cnJlbnRDb21wb25lbnRJbmZvLmRhdGE/LnByb3BlcnRpZXM/Lltwcm9wZXJ0eV0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHByb3BlcnR5TWV0YSA9IGN1cnJlbnRDb21wb25lbnRJbmZvLmRhdGEucHJvcGVydGllc1twcm9wZXJ0eV07XG4gICAgICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIOW+nuWxrOaAp+WFg+aVuOaTmuS4reaPkOWPlue1hOS7tumhnuWei+S/oeaBr1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHByb3BlcnR5TWV0YSAmJiB0eXBlb2YgcHJvcGVydHlNZXRhID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOaqouafpeaYr+WQpuaciXR5cGXlrZfmrrXmjIfnpLrntYTku7bpoZ7lnotcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAocHJvcGVydHlNZXRhLnR5cGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXhwZWN0ZWRDb21wb25lbnRUeXBlID0gcHJvcGVydHlNZXRhLnR5cGU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eU1ldGEuY3Rvcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDmnInkupvlsazmgKflj6/og73kvb/nlKhjdG9y5a2X5q61XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4cGVjdGVkQ29tcG9uZW50VHlwZSA9IHByb3BlcnR5TWV0YS5jdG9yO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlNZXRhLmV4dGVuZHMgJiYgQXJyYXkuaXNBcnJheShwcm9wZXJ0eU1ldGEuZXh0ZW5kcykpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5qqi5p+lZXh0ZW5kc+aVuOe1hO+8jOmAmuW4uOesrOS4gOWAi+aYr+acgOWFt+mrlOeahOmhnuWei1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGV4dGVuZFR5cGUgb2YgcHJvcGVydHlNZXRhLmV4dGVuZHMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChleHRlbmRUeXBlLnN0YXJ0c1dpdGgoJ2NjLicpICYmIGV4dGVuZFR5cGUgIT09ICdjYy5Db21wb25lbnQnICYmIGV4dGVuZFR5cGUgIT09ICdjYy5PYmplY3QnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXhwZWN0ZWRDb21wb25lbnRUeXBlID0gZXh0ZW5kVHlwZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFleHBlY3RlZENvbXBvbmVudFR5cGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5hYmxlIHRvIGRldGVybWluZSByZXF1aXJlZCBjb21wb25lbnQgdHlwZSBmb3IgcHJvcGVydHkgJyR7cHJvcGVydHl9JyBvbiBjb21wb25lbnQgJyR7Y29tcG9uZW50VHlwZX0nLiBQcm9wZXJ0eSBtZXRhZGF0YSBtYXkgbm90IGNvbnRhaW4gdHlwZSBpbmZvcm1hdGlvbi5gKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYFtDb21wb25lbnRUb29sc10gRGV0ZWN0ZWQgcmVxdWlyZWQgY29tcG9uZW50IHR5cGU6ICR7ZXhwZWN0ZWRDb21wb25lbnRUeXBlfSBmb3IgcHJvcGVydHk6ICR7cHJvcGVydHl9YCk7XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8g542y5Y+W55uu5qiZ56+A6bue55qE57WE5Lu25L+h5oGvXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB0YXJnZXROb2RlRGF0YSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LW5vZGUnLCB0YXJnZXROb2RlVXVpZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXRhcmdldE5vZGVEYXRhIHx8ICF0YXJnZXROb2RlRGF0YS5fX2NvbXBzX18pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFRhcmdldCBub2RlICR7dGFyZ2V0Tm9kZVV1aWR9IG5vdCBmb3VuZCBvciBoYXMgbm8gY29tcG9uZW50c2ApO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyDmiZPljbDnm67mqJnnr4Dpu57nmoTntYTku7bmpoLopr1cbiAgICAgICAgICAgICAgICAgICAgICAgIGRlYnVnTG9nKGBbQ29tcG9uZW50VG9vbHNdIFRhcmdldCBub2RlICR7dGFyZ2V0Tm9kZVV1aWR9IGhhcyAke3RhcmdldE5vZGVEYXRhLl9fY29tcHNfXy5sZW5ndGh9IGNvbXBvbmVudHM6YCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB0YXJnZXROb2RlRGF0YS5fX2NvbXBzX18uZm9yRWFjaCgoY29tcDogYW55LCBpbmRleDogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgc2NlbmVJZCA9IGNvbXAudmFsdWUgJiYgY29tcC52YWx1ZS51dWlkICYmIGNvbXAudmFsdWUudXVpZC52YWx1ZSA/IGNvbXAudmFsdWUudXVpZC52YWx1ZSA6ICd1bmtub3duJztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgW0NvbXBvbmVudFRvb2xzXSBDb21wb25lbnQgJHtpbmRleH06ICR7Y29tcC50eXBlfSAoc2NlbmVfaWQ6ICR7c2NlbmVJZH0pYCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAgICAgLy8g5p+l5om+5bCN5oeJ55qE57WE5Lu2XG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgdGFyZ2V0Q29tcG9uZW50ID0gbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCBjb21wb25lbnRJZDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIOWcqOebruaomeevgOm7nueahF9jb21wb25lbnRz5pW457WE5Lit5p+l5om+5oyH5a6a6aGe5Z6L55qE57WE5Lu2XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyDms6jmhI/vvJpfX2NvbXBzX1/lkoxfY29tcG9uZW50c+eahOe0ouW8leaYr+WwjeaHieeahFxuICAgICAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYFtDb21wb25lbnRUb29sc10gU2VhcmNoaW5nIGZvciBjb21wb25lbnQgdHlwZTogJHtleHBlY3RlZENvbXBvbmVudFR5cGV9YCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGFyZ2V0Tm9kZURhdGEuX19jb21wc19fLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY29tcCA9IHRhcmdldE5vZGVEYXRhLl9fY29tcHNfX1tpXSBhcyBhbnk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYFtDb21wb25lbnRUb29sc10gQ2hlY2tpbmcgY29tcG9uZW50ICR7aX06IHR5cGU9JHtjb21wLnR5cGV9LCB0YXJnZXQ9JHtleHBlY3RlZENvbXBvbmVudFR5cGV9YCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNvbXAudHlwZSA9PT0gZXhwZWN0ZWRDb21wb25lbnRUeXBlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRhcmdldENvbXBvbmVudCA9IGNvbXA7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlYnVnTG9nKGBbQ29tcG9uZW50VG9vbHNdIEZvdW5kIG1hdGNoaW5nIGNvbXBvbmVudCBhdCBpbmRleCAke2l9OiAke2NvbXAudHlwZX1gKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOW+nue1hOS7tueahHZhbHVlLnV1aWQudmFsdWXkuK3njbLlj5bntYTku7blnKjloLTmma/kuK3nmoRJRFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoY29tcC52YWx1ZSAmJiBjb21wLnZhbHVlLnV1aWQgJiYgY29tcC52YWx1ZS51dWlkLnZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRJZCA9IGNvbXAudmFsdWUudXVpZC52YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlYnVnTG9nKGBbQ29tcG9uZW50VG9vbHNdIEdvdCBjb21wb25lbnRJZCBmcm9tIGNvbXAudmFsdWUudXVpZC52YWx1ZTogJHtjb21wb25lbnRJZH1gKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlYnVnTG9nKGBbQ29tcG9uZW50VG9vbHNdIENvbXBvbmVudCBzdHJ1Y3R1cmU6YCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGhhc1ZhbHVlOiAhIWNvbXAudmFsdWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaGFzVXVpZDogISEoY29tcC52YWx1ZSAmJiBjb21wLnZhbHVlLnV1aWQpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGhhc1V1aWRWYWx1ZTogISEoY29tcC52YWx1ZSAmJiBjb21wLnZhbHVlLnV1aWQgJiYgY29tcC52YWx1ZS51dWlkLnZhbHVlKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB1dWlkU3RydWN0dXJlOiBjb21wLnZhbHVlID8gY29tcC52YWx1ZS51dWlkIDogJ05vIHZhbHVlJ1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVuYWJsZSB0byBleHRyYWN0IGNvbXBvbmVudCBJRCBmcm9tIGNvbXBvbmVudCBzdHJ1Y3R1cmVgKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXRhcmdldENvbXBvbmVudCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOWmguaenOaykuaJvuWIsO+8jOWIl+WHuuWPr+eUqOe1hOS7tuiuk+eUqOaItueereino++8jOmhr+ekuuWgtOaZr+S4reeahOecn+WvpklEXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgYXZhaWxhYmxlQ29tcG9uZW50cyA9IHRhcmdldE5vZGVEYXRhLl9fY29tcHNfXy5tYXAoKGNvbXA6IGFueSwgaW5kZXg6IG51bWJlcikgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsZXQgc2NlbmVJZCA9ICd1bmtub3duJztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5b6e57WE5Lu255qEdmFsdWUudXVpZC52YWx1ZeeNsuWPluWgtOaZr0lEXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjb21wLnZhbHVlICYmIGNvbXAudmFsdWUudXVpZCAmJiBjb21wLnZhbHVlLnV1aWQudmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNjZW5lSWQgPSBjb21wLnZhbHVlLnV1aWQudmFsdWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGAke2NvbXAudHlwZX0oc2NlbmVfaWQ6JHtzY2VuZUlkfSlgO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgQ29tcG9uZW50IHR5cGUgJyR7ZXhwZWN0ZWRDb21wb25lbnRUeXBlfScgbm90IGZvdW5kIG9uIG5vZGUgJHt0YXJnZXROb2RlVXVpZH0uIEF2YWlsYWJsZSBjb21wb25lbnRzOiAke2F2YWlsYWJsZUNvbXBvbmVudHMuam9pbignLCAnKX1gKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYFtDb21wb25lbnRUb29sc10gRm91bmQgY29tcG9uZW50ICR7ZXhwZWN0ZWRDb21wb25lbnRUeXBlfSB3aXRoIHNjZW5lIElEOiAke2NvbXBvbmVudElkfSBvbiBub2RlICR7dGFyZ2V0Tm9kZVV1aWR9YCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIOabtOaWsOacn+acm+WAvOeCuuWvpumam+eahOe1hOS7tklE5bCN6LGh5qC85byP77yM55So5pa85b6M57qM6amX6K2JXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoY29tcG9uZW50SWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBhY3R1YWxFeHBlY3RlZFZhbHVlID0geyB1dWlkOiBjb21wb25lbnRJZCB9O1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyDlmJfoqabkvb/nlKjoiIfnr4Dpu54v6LOH5rqQ5byV55So55u45ZCM55qE5qC85byP77yae3V1aWQ6IGNvbXBvbmVudElkfVxuICAgICAgICAgICAgICAgICAgICAgICAgLy8g5ris6Kmm55yL5piv5ZCm6IO95q2j56K66Kit572u57WE5Lu25byV55SoXG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdzZXQtcHJvcGVydHknLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdXVpZDogbm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcGF0aDogcHJvcGVydHlQYXRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGR1bXA6IHsgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlOiB7IHV1aWQ6IGNvbXBvbmVudElkIH0sICAvLyDkvb/nlKjlsI3osaHmoLzlvI/vvIzlg4/nr4Dpu54v6LOH5rqQ5byV55So5LiA5qijXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6IGV4cGVjdGVkQ29tcG9uZW50VHlwZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBbQ29tcG9uZW50VG9vbHNdIEVycm9yIHNldHRpbmcgY29tcG9uZW50IHJlZmVyZW5jZTpgLCBlcnJvcik7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlUeXBlID09PSAnbm9kZUFycmF5JyAmJiBBcnJheS5pc0FycmF5KHByb2Nlc3NlZFZhbHVlKSkge1xuICAgICAgICAgICAgICAgICAgICAvLyDnibnmroromZXnkIbnr4Dpu57mlbjntYQgLSDkv53mjIHpoJDomZXnkIbnmoTmoLzlvI9cbiAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYFtDb21wb25lbnRUb29sc10gU2V0dGluZyBub2RlIGFycmF5OmAsIHByb2Nlc3NlZFZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3NldC1wcm9wZXJ0eScsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IG5vZGVVdWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgcGF0aDogcHJvcGVydHlQYXRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgZHVtcDogeyBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZTogcHJvY2Vzc2VkVmFsdWUgIC8vIOS/neaMgSBbe3V1aWQ6IFwiLi4uXCJ9LCB7dXVpZDogXCIuLi5cIn1dIOagvOW8j1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5VHlwZSA9PT0gJ2NvbG9yQXJyYXknICYmIEFycmF5LmlzQXJyYXkocHJvY2Vzc2VkVmFsdWUpKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIOeJueauiuiZleeQhumhj+iJsuaVuOe1hFxuICAgICAgICAgICAgICAgICAgICBjb25zdCBjb2xvckFycmF5VmFsdWUgPSBwcm9jZXNzZWRWYWx1ZS5tYXAoKGl0ZW06IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGl0ZW0gJiYgdHlwZW9mIGl0ZW0gPT09ICdvYmplY3QnICYmICdyJyBpbiBpdGVtKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcjogTWF0aC5taW4oMjU1LCBNYXRoLm1heCgwLCBOdW1iZXIoaXRlbS5yKSB8fCAwKSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGc6IE1hdGgubWluKDI1NSwgTWF0aC5tYXgoMCwgTnVtYmVyKGl0ZW0uZykgfHwgMCkpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBiOiBNYXRoLm1pbigyNTUsIE1hdGgubWF4KDAsIE51bWJlcihpdGVtLmIpIHx8IDApKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYTogaXRlbS5hICE9PSB1bmRlZmluZWQgPyBNYXRoLm1pbigyNTUsIE1hdGgubWF4KDAsIE51bWJlcihpdGVtLmEpKSkgOiAyNTVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4geyByOiAyNTUsIGc6IDI1NSwgYjogMjU1LCBhOiAyNTUgfTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdzZXQtcHJvcGVydHknLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiBub2RlVXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhdGg6IHByb3BlcnR5UGF0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGR1bXA6IHsgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWU6IGNvbG9yQXJyYXlWYWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiAnY2MuQ29sb3InXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIE5vcm1hbCBwcm9wZXJ0eSBzZXR0aW5nIGZvciBub24tYXNzZXQgcHJvcGVydGllc1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdzZXQtcHJvcGVydHknLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiBub2RlVXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhdGg6IHByb3BlcnR5UGF0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGR1bXA6IHsgdmFsdWU6IHByb2Nlc3NlZFZhbHVlIH1cbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIC8vIFN0ZXAgNTog562J5b6FRWRpdG9y5a6M5oiQ5pu05paw77yM54S25b6M6amX6K2J6Kit572u57WQ5p6cXG4gICAgICAgICAgICAgICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDIwMCkpOyAvLyDnrYnlvoUyMDBtc+iuk0VkaXRvcuWujOaIkOabtOaWsFxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGNvbnN0IHZlcmlmaWNhdGlvbiA9IGF3YWl0IHRoaXMudmVyaWZ5UHJvcGVydHlDaGFuZ2Uobm9kZVV1aWQsIGNvbXBvbmVudFR5cGUsIHByb3BlcnR5LCBvcmlnaW5hbFZhbHVlLCBhY3R1YWxFeHBlY3RlZFZhbHVlKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICByZXR1cm4gb2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRUeXBlLFxuICAgICAgICAgICAgICAgICAgICAgICAgcHJvcGVydHksXG4gICAgICAgICAgICAgICAgICAgICAgICBhY3R1YWxWYWx1ZTogdmVyaWZpY2F0aW9uLmFjdHVhbFZhbHVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgY2hhbmdlVmVyaWZpZWQ6IHZlcmlmaWNhdGlvbi52ZXJpZmllZFxuICAgICAgICAgICAgICAgICAgICB9LCBgU3VjY2Vzc2Z1bGx5IHNldCAke2NvbXBvbmVudFR5cGV9LiR7cHJvcGVydHl9YCk7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgW0NvbXBvbmVudFRvb2xzXSBFcnJvciBzZXR0aW5nIHByb3BlcnR5OmAsIGVycm9yKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFpbChgRmFpbGVkIHRvIHNldCBwcm9wZXJ0eTogJHtlcnJvci5tZXNzYWdlfWApO1xuICAgICAgICAgICAgfVxuICAgIH1cblxuXG4gICAgcHJpdmF0ZSBhc3luYyBhdHRhY2hTY3JpcHRJbXBsKG5vZGVVdWlkOiBzdHJpbmcsIHNjcmlwdFBhdGg6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZShhc3luYyAocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgLy8g5b6e6IWz5pys6Lev5b6R5o+Q5Y+W57WE5Lu26aGe5ZCNXG4gICAgICAgICAgICBjb25zdCBzY3JpcHROYW1lID0gc2NyaXB0UGF0aC5zcGxpdCgnLycpLnBvcCgpPy5yZXBsYWNlKCcudHMnLCAnJykucmVwbGFjZSgnLmpzJywgJycpO1xuICAgICAgICAgICAgaWYgKCFzY3JpcHROYW1lKSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKCdJbnZhbGlkIHNjcmlwdCBwYXRoJykpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIOWFiOafpeaJvuevgOm7nuS4iuaYr+WQpuW3suWtmOWcqOipsuiFs+acrOe1hOS7tlxuICAgICAgICAgICAgY29uc3QgYWxsQ29tcG9uZW50c0luZm8gPSBhd2FpdCB0aGlzLmdldENvbXBvbmVudHNJbXBsKG5vZGVVdWlkKTtcbiAgICAgICAgICAgIGlmIChhbGxDb21wb25lbnRzSW5mby5zdWNjZXNzICYmIGFsbENvbXBvbmVudHNJbmZvLmRhdGE/LmNvbXBvbmVudHMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBleGlzdGluZ1NjcmlwdCA9IGFsbENvbXBvbmVudHNJbmZvLmRhdGEuY29tcG9uZW50cy5maW5kKChjb21wOiBhbnkpID0+IGNvbXAudHlwZSA9PT0gc2NyaXB0TmFtZSk7XG4gICAgICAgICAgICAgICAgaWYgKGV4aXN0aW5nU2NyaXB0KSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5vZGVVdWlkOiBub2RlVXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb21wb25lbnROYW1lOiBzY3JpcHROYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4aXN0aW5nOiB0cnVlXG4gICAgICAgICAgICAgICAgICAgICAgICB9LCBgU2NyaXB0ICcke3NjcmlwdE5hbWV9JyBhbHJlYWR5IGV4aXN0cyBvbiBub2RlYCkpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8g6aaW5YWI5ZqQ6Kmm55u05o6l5L2/55So6IWz5pys5ZCN56ix5L2c54K657WE5Lu26aGe5Z6LXG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdjcmVhdGUtY29tcG9uZW50Jywge1xuICAgICAgICAgICAgICAgIHV1aWQ6IG5vZGVVdWlkLFxuICAgICAgICAgICAgICAgIGNvbXBvbmVudDogc2NyaXB0TmFtZSAgLy8g5L2/55So6IWz5pys5ZCN56ix6ICM6Z2eVVVJRFxuICAgICAgICAgICAgfSkudGhlbihhc3luYyAocmVzdWx0OiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAvLyDnrYnlvoXkuIDmrrXmmYLplpPorpNFZGl0b3LlrozmiJDntYTku7bmt7vliqBcbiAgICAgICAgICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMTAwKSk7XG4gICAgICAgICAgICAgICAgLy8g6YeN5paw5p+l6Kmi56+A6bue5L+h5oGv6amX6K2J6IWz5pys5piv5ZCm55yf55qE5re75Yqg5oiQ5YqfXG4gICAgICAgICAgICAgICAgY29uc3QgYWxsQ29tcG9uZW50c0luZm8yID0gYXdhaXQgdGhpcy5nZXRDb21wb25lbnRzSW1wbChub2RlVXVpZCk7XG4gICAgICAgICAgICAgICAgaWYgKGFsbENvbXBvbmVudHNJbmZvMi5zdWNjZXNzICYmIGFsbENvbXBvbmVudHNJbmZvMi5kYXRhPy5jb21wb25lbnRzKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGFkZGVkU2NyaXB0ID0gYWxsQ29tcG9uZW50c0luZm8yLmRhdGEuY29tcG9uZW50cy5maW5kKChjb21wOiBhbnkpID0+IGNvbXAudHlwZSA9PT0gc2NyaXB0TmFtZSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChhZGRlZFNjcmlwdCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5vZGVVdWlkOiBub2RlVXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50TmFtZTogc2NyaXB0TmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXhpc3Rpbmc6IGZhbHNlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSwgYFNjcmlwdCAnJHtzY3JpcHROYW1lfScgYXR0YWNoZWQgc3VjY2Vzc2Z1bGx5YCkpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGBTY3JpcHQgJyR7c2NyaXB0TmFtZX0nIHdhcyBub3QgZm91bmQgb24gbm9kZSBhZnRlciBhZGRpdGlvbi4gQXZhaWxhYmxlIGNvbXBvbmVudHM6ICR7YWxsQ29tcG9uZW50c0luZm8yLmRhdGEuY29tcG9uZW50cy5tYXAoKGM6IGFueSkgPT4gYy50eXBlKS5qb2luKCcsICcpfWApKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChgRmFpbGVkIHRvIHZlcmlmeSBzY3JpcHQgYWRkaXRpb246ICR7YWxsQ29tcG9uZW50c0luZm8yLmVycm9yIHx8ICdVbmFibGUgdG8gZ2V0IG5vZGUgY29tcG9uZW50cyd9YCkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgLy8g5YKZ55So5pa55qGI77ya5L2/55So5aC05pmv6IWz5pysXG4gICAgICAgICAgICAgICAgcnVuU2NlbmVNZXRob2QoJ2F0dGFjaFNjcmlwdCcsIFtub2RlVXVpZCwgc2NyaXB0UGF0aF0pLnRoZW4oKHJlc3VsdDogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICAgICAgICB9KS5jYXRjaCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoeyBcbiAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLCBcbiAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yOiBgRmFpbGVkIHRvIGF0dGFjaCBzY3JpcHQgJyR7c2NyaXB0TmFtZX0nOiAke2Vyci5tZXNzYWdlfWAsXG4gICAgICAgICAgICAgICAgICAgICAgICBpbnN0cnVjdGlvbjogJ1BsZWFzZSBlbnN1cmUgdGhlIHNjcmlwdCBpcyBwcm9wZXJseSBjb21waWxlZCBhbmQgZXhwb3J0ZWQgYXMgYSBDb21wb25lbnQgY2xhc3MuIFlvdSBjYW4gYWxzbyBtYW51YWxseSBhdHRhY2ggdGhlIHNjcmlwdCB0aHJvdWdoIHRoZSBQcm9wZXJ0aWVzIHBhbmVsIGluIHRoZSBlZGl0b3IuJ1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldEF2YWlsYWJsZUNvbXBvbmVudHNJbXBsKGNhdGVnb3J5OiBzdHJpbmcgPSAnYWxsJyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IGNvbXBvbmVudENhdGVnb3JpZXM6IFJlY29yZDxzdHJpbmcsIHN0cmluZ1tdPiA9IHtcbiAgICAgICAgICAgIHJlbmRlcmVyOiBbJ2NjLlNwcml0ZScsICdjYy5MYWJlbCcsICdjYy5SaWNoVGV4dCcsICdjYy5NYXNrJywgJ2NjLkdyYXBoaWNzJ10sXG4gICAgICAgICAgICB1aTogWydjYy5CdXR0b24nLCAnY2MuVG9nZ2xlJywgJ2NjLlNsaWRlcicsICdjYy5TY3JvbGxWaWV3JywgJ2NjLkVkaXRCb3gnLCAnY2MuUHJvZ3Jlc3NCYXInXSxcbiAgICAgICAgICAgIHBoeXNpY3M6IFsnY2MuUmlnaWRCb2R5MkQnLCAnY2MuQm94Q29sbGlkZXIyRCcsICdjYy5DaXJjbGVDb2xsaWRlcjJEJywgJ2NjLlBvbHlnb25Db2xsaWRlcjJEJ10sXG4gICAgICAgICAgICBhbmltYXRpb246IFsnY2MuQW5pbWF0aW9uJywgJ2NjLkFuaW1hdGlvbkNsaXAnLCAnY2MuU2tlbGV0YWxBbmltYXRpb24nXSxcbiAgICAgICAgICAgIGF1ZGlvOiBbJ2NjLkF1ZGlvU291cmNlJ10sXG4gICAgICAgICAgICBsYXlvdXQ6IFsnY2MuTGF5b3V0JywgJ2NjLldpZGdldCcsICdjYy5QYWdlVmlldycsICdjYy5QYWdlVmlld0luZGljYXRvciddLFxuICAgICAgICAgICAgZWZmZWN0czogWydjYy5Nb3Rpb25TdHJlYWsnLCAnY2MuUGFydGljbGVTeXN0ZW0yRCddLFxuICAgICAgICAgICAgY2FtZXJhOiBbJ2NjLkNhbWVyYSddLFxuICAgICAgICAgICAgbGlnaHQ6IFsnY2MuTGlnaHQnLCAnY2MuRGlyZWN0aW9uYWxMaWdodCcsICdjYy5Qb2ludExpZ2h0JywgJ2NjLlNwb3RMaWdodCddXG4gICAgICAgIH07XG5cbiAgICAgICAgbGV0IGNvbXBvbmVudHM6IHN0cmluZ1tdID0gW107XG4gICAgICAgIFxuICAgICAgICBpZiAoY2F0ZWdvcnkgPT09ICdhbGwnKSB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGNhdCBpbiBjb21wb25lbnRDYXRlZ29yaWVzKSB7XG4gICAgICAgICAgICAgICAgY29tcG9uZW50cyA9IGNvbXBvbmVudHMuY29uY2F0KGNvbXBvbmVudENhdGVnb3JpZXNbY2F0XSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoY29tcG9uZW50Q2F0ZWdvcmllc1tjYXRlZ29yeV0pIHtcbiAgICAgICAgICAgIGNvbXBvbmVudHMgPSBjb21wb25lbnRDYXRlZ29yaWVzW2NhdGVnb3J5XTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgY2F0ZWdvcnk6IGNhdGVnb3J5LFxuICAgICAgICAgICAgICAgIGNvbXBvbmVudHM6IGNvbXBvbmVudHNcbiAgICAgICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgaXNWYWxpZFByb3BlcnR5RGVzY3JpcHRvcihwcm9wRGF0YTogYW55KTogYm9vbGVhbiB7XG4gICAgICAgIC8vIOaqouafpeaYr+WQpuaYr+acieaViOeahOWxrOaAp+aPj+i/sOWwjeixoVxuICAgICAgICBpZiAodHlwZW9mIHByb3BEYXRhICE9PSAnb2JqZWN0JyB8fCBwcm9wRGF0YSA9PT0gbnVsbCkge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3Qga2V5cyA9IE9iamVjdC5rZXlzKHByb3BEYXRhKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8g6YG/5YWN6YGN5q2357Ch5Zau55qE5pW45YC85bCN6LGh77yI5aaCIHt3aWR0aDogMjAwLCBoZWlnaHQ6IDE1MH3vvIlcbiAgICAgICAgICAgIGNvbnN0IGlzU2ltcGxlVmFsdWVPYmplY3QgPSBrZXlzLmV2ZXJ5KGtleSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgdmFsdWUgPSBwcm9wRGF0YVtrZXldO1xuICAgICAgICAgICAgICAgIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInIHx8IHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgfHwgdHlwZW9mIHZhbHVlID09PSAnYm9vbGVhbic7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgaWYgKGlzU2ltcGxlVmFsdWVPYmplY3QpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIOaqouafpeaYr+WQpuWMheWQq+WxrOaAp+aPj+i/sOespueahOeJueW+teWtl+aute+8jOS4jeS9v+eUqCdpbifmk43kvZznrKZcbiAgICAgICAgICAgIGNvbnN0IGhhc05hbWUgPSBrZXlzLmluY2x1ZGVzKCduYW1lJyk7XG4gICAgICAgICAgICBjb25zdCBoYXNWYWx1ZSA9IGtleXMuaW5jbHVkZXMoJ3ZhbHVlJyk7XG4gICAgICAgICAgICBjb25zdCBoYXNUeXBlID0ga2V5cy5pbmNsdWRlcygndHlwZScpO1xuICAgICAgICAgICAgY29uc3QgaGFzRGlzcGxheU5hbWUgPSBrZXlzLmluY2x1ZGVzKCdkaXNwbGF5TmFtZScpO1xuICAgICAgICAgICAgY29uc3QgaGFzUmVhZG9ubHkgPSBrZXlzLmluY2x1ZGVzKCdyZWFkb25seScpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyDlv4XpoIjljIXlkKtuYW1l5oiWdmFsdWXlrZfmrrXvvIzkuJTpgJrluLjpgoTmnIl0eXBl5a2X5q61XG4gICAgICAgICAgICBjb25zdCBoYXNWYWxpZFN0cnVjdHVyZSA9IChoYXNOYW1lIHx8IGhhc1ZhbHVlKSAmJiAoaGFzVHlwZSB8fCBoYXNEaXNwbGF5TmFtZSB8fCBoYXNSZWFkb25seSk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIOmhjeWkluaqouafpe+8muWmguaenOaciWRlZmF1bHTlrZfmrrXkuJTntZDmp4vopIfpm5zvvIzpgb/lhY3mt7HluqbpgY3mrbdcbiAgICAgICAgICAgIGlmIChrZXlzLmluY2x1ZGVzKCdkZWZhdWx0JykgJiYgcHJvcERhdGEuZGVmYXVsdCAmJiB0eXBlb2YgcHJvcERhdGEuZGVmYXVsdCA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBkZWZhdWx0S2V5cyA9IE9iamVjdC5rZXlzKHByb3BEYXRhLmRlZmF1bHQpO1xuICAgICAgICAgICAgICAgIGlmIChkZWZhdWx0S2V5cy5pbmNsdWRlcygndmFsdWUnKSAmJiB0eXBlb2YgcHJvcERhdGEuZGVmYXVsdC52YWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8g6YCZ56iu5oOF5rOB5LiL77yM5oiR5YCR5Y+q6L+U5Zue6aCC5bGk5bGs5oCn77yM5LiN5rex5YWl6YGN5q23ZGVmYXVsdC52YWx1ZVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gaGFzVmFsaWRTdHJ1Y3R1cmU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICByZXR1cm4gaGFzVmFsaWRTdHJ1Y3R1cmU7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oYFtpc1ZhbGlkUHJvcGVydHlEZXNjcmlwdG9yXSBFcnJvciBjaGVja2luZyBwcm9wZXJ0eSBkZXNjcmlwdG9yOmAsIGVycm9yKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYW5hbHl6ZVByb3BlcnR5KGNvbXBvbmVudDogYW55LCBwcm9wZXJ0eU5hbWU6IHN0cmluZyk6IHsgZXhpc3RzOiBib29sZWFuOyB0eXBlOiBzdHJpbmc7IGF2YWlsYWJsZVByb3BlcnRpZXM6IHN0cmluZ1tdOyBvcmlnaW5hbFZhbHVlOiBhbnk7IG1ldGFUeXBlPzogc3RyaW5nOyBtZXRhRXh0ZW5kcz86IHN0cmluZ1tdIH0ge1xuICAgICAgICAvLyDlvp7opIfpm5znmoTntYTku7bntZDmp4vkuK3mj5Dlj5blj6/nlKjlsazmgKdcbiAgICAgICAgY29uc3QgYXZhaWxhYmxlUHJvcGVydGllczogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgbGV0IHByb3BlcnR5VmFsdWU6IGFueSA9IHVuZGVmaW5lZDtcbiAgICAgICAgbGV0IHByb3BlcnR5RXhpc3RzID0gZmFsc2U7XG4gICAgICAgIGxldCBtZXRhVHlwZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICAgICAgICBsZXQgbWV0YUV4dGVuZHM6IHN0cmluZ1tdIHwgdW5kZWZpbmVkO1xuXG4gICAgICAgIGNvbnN0IGNhcHR1cmVNZXRhID0gKHByb3BJbmZvOiBhbnkpID0+IHtcbiAgICAgICAgICAgIGlmICghcHJvcEluZm8gfHwgdHlwZW9mIHByb3BJbmZvICE9PSAnb2JqZWN0JykgcmV0dXJuO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBwcm9wSW5mby50eXBlID09PSAnc3RyaW5nJykgbWV0YVR5cGUgPSBwcm9wSW5mby50eXBlO1xuICAgICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkocHJvcEluZm8uZXh0ZW5kcykpIHtcbiAgICAgICAgICAgICAgICBtZXRhRXh0ZW5kcyA9IHByb3BJbmZvLmV4dGVuZHMuZmlsdGVyKChzOiBhbnkpID0+IHR5cGVvZiBzID09PSAnc3RyaW5nJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgLy8g5ZiX6Kmm5aSa56iu5pa55byP5p+l5om+5bGs5oCn77yaXG4gICAgICAgIC8vIDEuIOebtOaOpeWxrOaAp+ioquWVj1xuICAgICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGNvbXBvbmVudCwgcHJvcGVydHlOYW1lKSkge1xuICAgICAgICAgICAgcHJvcGVydHlWYWx1ZSA9IGNvbXBvbmVudFtwcm9wZXJ0eU5hbWVdO1xuICAgICAgICAgICAgcHJvcGVydHlFeGlzdHMgPSB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gMi4g5b6e5bWM5aWX57WQ5qeL5Lit5p+l5om+ICjlpoLlvp7muKzoqabmlbjmk5rnnIvliLDnmoTopIfpm5zntZDmp4spXG4gICAgICAgIGlmICghcHJvcGVydHlFeGlzdHMgJiYgY29tcG9uZW50LnByb3BlcnRpZXMgJiYgdHlwZW9mIGNvbXBvbmVudC5wcm9wZXJ0aWVzID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgLy8g6aaW5YWI5qqi5p+lcHJvcGVydGllcy52YWx1ZeaYr+WQpuWtmOWcqO+8iOmAmeaYr+aIkeWAkeWcqGdldENvbXBvbmVudHPkuK3nnIvliLDnmoTntZDmp4vvvIlcbiAgICAgICAgICAgIGlmIChjb21wb25lbnQucHJvcGVydGllcy52YWx1ZSAmJiB0eXBlb2YgY29tcG9uZW50LnByb3BlcnRpZXMudmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdmFsdWVPYmogPSBjb21wb25lbnQucHJvcGVydGllcy52YWx1ZTtcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IFtrZXksIHByb3BEYXRhXSBvZiBPYmplY3QuZW50cmllcyh2YWx1ZU9iaikpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8g5qqi5p+lcHJvcERhdGHmmK/lkKbmmK/kuIDlgIvmnInmlYjnmoTlsazmgKfmj4/ov7DlsI3osaFcbiAgICAgICAgICAgICAgICAgICAgLy8g56K65L+dcHJvcERhdGHmmK/lsI3osaHkuJTljIXlkKvpoJDmnJ/nmoTlsazmgKfntZDmp4tcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuaXNWYWxpZFByb3BlcnR5RGVzY3JpcHRvcihwcm9wRGF0YSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHByb3BJbmZvID0gcHJvcERhdGEgYXMgYW55O1xuICAgICAgICAgICAgICAgICAgICAgICAgYXZhaWxhYmxlUHJvcGVydGllcy5wdXNoKGtleSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoa2V5ID09PSBwcm9wZXJ0eU5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDlhKrlhYjkvb/nlKh2YWx1ZeWxrOaAp++8jOWmguaenOaykuacieWJh+S9v+eUqHByb3BEYXRh5pys6LqrXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcHJvcEtleXMgPSBPYmplY3Qua2V5cyhwcm9wSW5mbyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb3BlcnR5VmFsdWUgPSBwcm9wS2V5cy5pbmNsdWRlcygndmFsdWUnKSA/IHByb3BJbmZvLnZhbHVlIDogcHJvcEluZm87XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5aaC5p6c5qqi5p+l5aSx5pWX77yM55u05o6l5L2/55SocHJvcEluZm9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvcGVydHlWYWx1ZSA9IHByb3BJbmZvO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYXB0dXJlTWV0YShwcm9wSW5mbyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvcGVydHlFeGlzdHMgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyDlgpnnlKjmlrnmoYjvvJrnm7TmjqXlvp5wcm9wZXJ0aWVz5p+l5om+XG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCBba2V5LCBwcm9wRGF0YV0gb2YgT2JqZWN0LmVudHJpZXMoY29tcG9uZW50LnByb3BlcnRpZXMpKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLmlzVmFsaWRQcm9wZXJ0eURlc2NyaXB0b3IocHJvcERhdGEpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBwcm9wSW5mbyA9IHByb3BEYXRhIGFzIGFueTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGF2YWlsYWJsZVByb3BlcnRpZXMucHVzaChrZXkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGtleSA9PT0gcHJvcGVydHlOYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5YSq5YWI5L2/55SodmFsdWXlsazmgKfvvIzlpoLmnpzmspLmnInliYfkvb/nlKhwcm9wRGF0YeacrOi6q1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHByb3BLZXlzID0gT2JqZWN0LmtleXMocHJvcEluZm8pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0eVZhbHVlID0gcHJvcEtleXMuaW5jbHVkZXMoJ3ZhbHVlJykgPyBwcm9wSW5mby52YWx1ZSA6IHByb3BJbmZvO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOWmguaenOaqouafpeWkseaVl++8jOebtOaOpeS9v+eUqHByb3BJbmZvXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb3BlcnR5VmFsdWUgPSBwcm9wSW5mbztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2FwdHVyZU1ldGEocHJvcEluZm8pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb3BlcnR5RXhpc3RzID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgLy8gMy4g5b6e55u05o6l5bGs5oCn5Lit5o+Q5Y+W57Ch5Zau5bGs5oCn5ZCNXG4gICAgICAgIGlmIChhdmFpbGFibGVQcm9wZXJ0aWVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMoY29tcG9uZW50KSkge1xuICAgICAgICAgICAgICAgIGlmICgha2V5LnN0YXJ0c1dpdGgoJ18nKSAmJiAhWydfX3R5cGVfXycsICdjaWQnLCAnbm9kZScsICd1dWlkJywgJ25hbWUnLCAnZW5hYmxlZCcsICd0eXBlJywgJ3JlYWRvbmx5JywgJ3Zpc2libGUnXS5pbmNsdWRlcyhrZXkpKSB7XG4gICAgICAgICAgICAgICAgICAgIGF2YWlsYWJsZVByb3BlcnRpZXMucHVzaChrZXkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgaWYgKCFwcm9wZXJ0eUV4aXN0cykge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBleGlzdHM6IGZhbHNlLFxuICAgICAgICAgICAgICAgIHR5cGU6ICd1bmtub3duJyxcbiAgICAgICAgICAgICAgICBhdmFpbGFibGVQcm9wZXJ0aWVzLFxuICAgICAgICAgICAgICAgIG9yaWdpbmFsVmFsdWU6IHVuZGVmaW5lZFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgbGV0IHR5cGUgPSAndW5rbm93bic7XG4gICAgICAgIFxuICAgICAgICAvLyDmmbrog73poZ7lnovmqqLmuKxcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkocHJvcGVydHlWYWx1ZSkpIHtcbiAgICAgICAgICAgIC8vIOaVuOe1hOmhnuWei+aqoua4rFxuICAgICAgICAgICAgaWYgKHByb3BlcnR5TmFtZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdub2RlJykpIHtcbiAgICAgICAgICAgICAgICB0eXBlID0gJ25vZGVBcnJheSc7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5TmFtZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdjb2xvcicpKSB7XG4gICAgICAgICAgICAgICAgdHlwZSA9ICdjb2xvckFycmF5JztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdHlwZSA9ICdhcnJheSc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIHByb3BlcnR5VmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAvLyBDaGVjayBpZiBwcm9wZXJ0eSBuYW1lIHN1Z2dlc3RzIGl0J3MgYW4gYXNzZXRcbiAgICAgICAgICAgIGlmIChbJ3Nwcml0ZUZyYW1lJywgJ3RleHR1cmUnLCAnbWF0ZXJpYWwnLCAnZm9udCcsICdjbGlwJywgJ3ByZWZhYiddLmluY2x1ZGVzKHByb3BlcnR5TmFtZS50b0xvd2VyQ2FzZSgpKSkge1xuICAgICAgICAgICAgICAgIHR5cGUgPSAnYXNzZXQnO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0eXBlID0gJ3N0cmluZyc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIHByb3BlcnR5VmFsdWUgPT09ICdudW1iZXInKSB7XG4gICAgICAgICAgICB0eXBlID0gJ251bWJlcic7XG4gICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIHByb3BlcnR5VmFsdWUgPT09ICdib29sZWFuJykge1xuICAgICAgICAgICAgdHlwZSA9ICdib29sZWFuJztcbiAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eVZhbHVlICYmIHR5cGVvZiBwcm9wZXJ0eVZhbHVlID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCBrZXlzID0gT2JqZWN0LmtleXMocHJvcGVydHlWYWx1ZSk7XG4gICAgICAgICAgICAgICAgaWYgKGtleXMuaW5jbHVkZXMoJ3InKSAmJiBrZXlzLmluY2x1ZGVzKCdnJykgJiYga2V5cy5pbmNsdWRlcygnYicpKSB7XG4gICAgICAgICAgICAgICAgICAgIHR5cGUgPSAnY29sb3InO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoa2V5cy5pbmNsdWRlcygneCcpICYmIGtleXMuaW5jbHVkZXMoJ3knKSkge1xuICAgICAgICAgICAgICAgICAgICB0eXBlID0gcHJvcGVydHlWYWx1ZS56ICE9PSB1bmRlZmluZWQgPyAndmVjMycgOiAndmVjMic7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChrZXlzLmluY2x1ZGVzKCd3aWR0aCcpICYmIGtleXMuaW5jbHVkZXMoJ2hlaWdodCcpKSB7XG4gICAgICAgICAgICAgICAgICAgIHR5cGUgPSAnc2l6ZSc7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChrZXlzLmluY2x1ZGVzKCd1dWlkJykgfHwga2V5cy5pbmNsdWRlcygnX191dWlkX18nKSkge1xuICAgICAgICAgICAgICAgICAgICAvLyDmqqLmn6XmmK/lkKbmmK/nr4Dpu57lvJXnlKjvvIjpgJrpgY7lsazmgKflkI3miJZfX2lkX1/lsazmgKfliKTmlrfvvIlcbiAgICAgICAgICAgICAgICAgICAgaWYgKHByb3BlcnR5TmFtZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdub2RlJykgfHwgXG4gICAgICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0eU5hbWUudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygndGFyZ2V0JykgfHxcbiAgICAgICAgICAgICAgICAgICAgICAgIGtleXMuaW5jbHVkZXMoJ19faWRfXycpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlID0gJ25vZGUnO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZSA9ICdhc3NldCc7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGtleXMuaW5jbHVkZXMoJ19faWRfXycpKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIOevgOm7nuW8leeUqOeJueW+tVxuICAgICAgICAgICAgICAgICAgICB0eXBlID0gJ25vZGUnO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHR5cGUgPSAnb2JqZWN0JztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybihgW2FuYWx5emVQcm9wZXJ0eV0gRXJyb3IgY2hlY2tpbmcgcHJvcGVydHkgdHlwZSBmb3I6ICR7SlNPTi5zdHJpbmdpZnkocHJvcGVydHlWYWx1ZSl9YCk7XG4gICAgICAgICAgICAgICAgdHlwZSA9ICdvYmplY3QnO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5VmFsdWUgPT09IG51bGwgfHwgcHJvcGVydHlWYWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAvLyBGb3IgbnVsbC91bmRlZmluZWQgdmFsdWVzLCBjaGVjayBwcm9wZXJ0eSBuYW1lIHRvIGRldGVybWluZSB0eXBlXG4gICAgICAgICAgICBpZiAoWydzcHJpdGVGcmFtZScsICd0ZXh0dXJlJywgJ21hdGVyaWFsJywgJ2ZvbnQnLCAnY2xpcCcsICdwcmVmYWInXS5pbmNsdWRlcyhwcm9wZXJ0eU5hbWUudG9Mb3dlckNhc2UoKSkpIHtcbiAgICAgICAgICAgICAgICB0eXBlID0gJ2Fzc2V0JztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlOYW1lLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ25vZGUnKSB8fCBcbiAgICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0eU5hbWUudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygndGFyZ2V0JykpIHtcbiAgICAgICAgICAgICAgICB0eXBlID0gJ25vZGUnO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eU5hbWUudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnY29tcG9uZW50JykpIHtcbiAgICAgICAgICAgICAgICB0eXBlID0gJ2NvbXBvbmVudCc7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHR5cGUgPSAndW5rbm93bic7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBleGlzdHM6IHRydWUsXG4gICAgICAgICAgICB0eXBlLFxuICAgICAgICAgICAgYXZhaWxhYmxlUHJvcGVydGllcyxcbiAgICAgICAgICAgIG9yaWdpbmFsVmFsdWU6IHByb3BlcnR5VmFsdWUsXG4gICAgICAgICAgICBtZXRhVHlwZSxcbiAgICAgICAgICAgIG1ldGFFeHRlbmRzLFxuICAgICAgICB9O1xuICAgIH1cblxuICAgIHByaXZhdGUgZGV0ZWN0UHJvcGVydHlUeXBlTWlzbWF0Y2goXG4gICAgICAgIHByb3BlcnR5SW5mbzogeyBtZXRhVHlwZT86IHN0cmluZzsgbWV0YUV4dGVuZHM/OiBzdHJpbmdbXSB9LFxuICAgICAgICBwcm9wZXJ0eVR5cGU6IHN0cmluZyxcbiAgICAgICAgbm9kZVV1aWQ6IHN0cmluZyxcbiAgICAgICAgY29tcG9uZW50VHlwZTogc3RyaW5nLFxuICAgICAgICBwcm9wZXJ0eTogc3RyaW5nLFxuICAgICk6IFRvb2xSZXNwb25zZSB8IG51bGwge1xuICAgICAgICBjb25zdCB7IG1ldGFUeXBlLCBtZXRhRXh0ZW5kcyB9ID0gcHJvcGVydHlJbmZvO1xuICAgICAgICBpZiAoIW1ldGFUeXBlICYmICghbWV0YUV4dGVuZHMgfHwgbWV0YUV4dGVuZHMubGVuZ3RoID09PSAwKSkgcmV0dXJuIG51bGw7XG5cbiAgICAgICAgY29uc3QgZXh0ZW5kc0xpc3QgPSBtZXRhRXh0ZW5kcyA/PyBbXTtcbiAgICAgICAgY29uc3QgaXNOb2RlUmVmID0gbWV0YVR5cGUgPT09ICdjYy5Ob2RlJztcbiAgICAgICAgY29uc3QgaXNDb21wb25lbnRSZWYgPSAhaXNOb2RlUmVmICYmIGV4dGVuZHNMaXN0LmluY2x1ZGVzKCdjYy5Db21wb25lbnQnKTtcbiAgICAgICAgY29uc3QgaXNBc3NldFJlZiA9ICFpc05vZGVSZWYgJiYgIWlzQ29tcG9uZW50UmVmICYmIGV4dGVuZHNMaXN0LmluY2x1ZGVzKCdjYy5Bc3NldCcpO1xuICAgICAgICBpZiAoIWlzTm9kZVJlZiAmJiAhaXNDb21wb25lbnRSZWYgJiYgIWlzQXNzZXRSZWYpIHJldHVybiBudWxsO1xuXG4gICAgICAgIGNvbnN0IGV4cGVjdGVkS2luZCA9IGlzTm9kZVJlZiA/ICdub2RlJyA6IGlzQ29tcG9uZW50UmVmID8gJ2NvbXBvbmVudCcgOiAnYXNzZXQnO1xuICAgICAgICBjb25zdCB1c2VyS2luZCA9XG4gICAgICAgICAgICBwcm9wZXJ0eVR5cGUgPT09ICdzcHJpdGVGcmFtZScgfHwgcHJvcGVydHlUeXBlID09PSAncHJlZmFiJyB8fCBwcm9wZXJ0eVR5cGUgPT09ICdhc3NldCcgPyAnYXNzZXQnXG4gICAgICAgICAgICA6IHByb3BlcnR5VHlwZSA9PT0gJ25vZGUnID8gJ25vZGUnXG4gICAgICAgICAgICA6IHByb3BlcnR5VHlwZSA9PT0gJ2NvbXBvbmVudCcgPyAnY29tcG9uZW50J1xuICAgICAgICAgICAgOiBudWxsO1xuICAgICAgICBpZiAoIXVzZXJLaW5kIHx8IHVzZXJLaW5kID09PSBleHBlY3RlZEtpbmQpIHJldHVybiBudWxsO1xuXG4gICAgICAgIGNvbnN0IGV4cGVjdGVkVHlwZU5hbWUgPSBtZXRhVHlwZSA/PyAnKHVua25vd24pJztcbiAgICAgICAgbGV0IHN1Z2dlc3RlZFByb3BlcnR5VHlwZTogc3RyaW5nO1xuICAgICAgICBsZXQgdmFsdWVIaW50OiBzdHJpbmc7XG4gICAgICAgIGlmIChpc0NvbXBvbmVudFJlZikge1xuICAgICAgICAgICAgc3VnZ2VzdGVkUHJvcGVydHlUeXBlID0gJ2NvbXBvbmVudCc7XG4gICAgICAgICAgICB2YWx1ZUhpbnQgPSBgdGhlIFVVSUQgb2YgdGhlIE5PREUgdGhhdCBob3N0cyB0aGUgJHtleHBlY3RlZFR5cGVOYW1lfSBjb21wb25lbnQgKHRoZSBzZXJ2ZXIgcmVzb2x2ZXMgdGhlIGNvbXBvbmVudCdzIHNjZW5lIF9faWRfXyBmb3IgeW91KWA7XG4gICAgICAgIH0gZWxzZSBpZiAoaXNOb2RlUmVmKSB7XG4gICAgICAgICAgICBzdWdnZXN0ZWRQcm9wZXJ0eVR5cGUgPSAnbm9kZSc7XG4gICAgICAgICAgICB2YWx1ZUhpbnQgPSBcInRoZSB0YXJnZXQgbm9kZSdzIFVVSURcIjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHN1Z2dlc3RlZFByb3BlcnR5VHlwZSA9XG4gICAgICAgICAgICAgICAgZXhwZWN0ZWRUeXBlTmFtZSA9PT0gJ2NjLlNwcml0ZUZyYW1lJyA/ICdzcHJpdGVGcmFtZSdcbiAgICAgICAgICAgICAgICA6IGV4cGVjdGVkVHlwZU5hbWUgPT09ICdjYy5QcmVmYWInID8gJ3ByZWZhYidcbiAgICAgICAgICAgICAgICA6ICdhc3NldCc7XG4gICAgICAgICAgICB2YWx1ZUhpbnQgPSBgdGhlIGFzc2V0IFVVSUQgKHR5cGU6ICR7ZXhwZWN0ZWRUeXBlTmFtZX0pYDtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgIGVycm9yOiBgcHJvcGVydHlUeXBlIG1pc21hdGNoOiAnJHtjb21wb25lbnRUeXBlfS4ke3Byb3BlcnR5fScgaXMgYSAke2V4cGVjdGVkS2luZH0gcmVmZXJlbmNlIChtZXRhZGF0YSB0eXBlOiAke2V4cGVjdGVkVHlwZU5hbWV9KSwgYnV0IHlvdSBwYXNzZWQgcHJvcGVydHlUeXBlOiAnJHtwcm9wZXJ0eVR5cGV9Jy5gLFxuICAgICAgICAgICAgaW5zdHJ1Y3Rpb246IGBVc2UgcHJvcGVydHlUeXBlOiAnJHtzdWdnZXN0ZWRQcm9wZXJ0eVR5cGV9JyB3aXRoICR7dmFsdWVIaW50fS5cXG5FeGFtcGxlOiBzZXRfY29tcG9uZW50X3Byb3BlcnR5KG5vZGVVdWlkPVwiJHtub2RlVXVpZH1cIiwgY29tcG9uZW50VHlwZT1cIiR7Y29tcG9uZW50VHlwZX1cIiwgcHJvcGVydHk9XCIke3Byb3BlcnR5fVwiLCBwcm9wZXJ0eVR5cGU9XCIke3N1Z2dlc3RlZFByb3BlcnR5VHlwZX1cIiwgdmFsdWU9XCI8dXVpZD5cIilgLFxuICAgICAgICB9O1xuICAgIH1cblxuICAgIHByaXZhdGUgc21hcnRDb252ZXJ0VmFsdWUoaW5wdXRWYWx1ZTogYW55LCBwcm9wZXJ0eUluZm86IGFueSk6IGFueSB7XG4gICAgICAgIGNvbnN0IHsgdHlwZSwgb3JpZ2luYWxWYWx1ZSB9ID0gcHJvcGVydHlJbmZvO1xuICAgICAgICBcbiAgICAgICAgZGVidWdMb2coYFtzbWFydENvbnZlcnRWYWx1ZV0gQ29udmVydGluZyAke0pTT04uc3RyaW5naWZ5KGlucHV0VmFsdWUpfSB0byB0eXBlOiAke3R5cGV9YCk7XG4gICAgICAgIFxuICAgICAgICBzd2l0Y2ggKHR5cGUpIHtcbiAgICAgICAgICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIFN0cmluZyhpbnB1dFZhbHVlKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIGNhc2UgJ251bWJlcic6XG4gICAgICAgICAgICAgICAgcmV0dXJuIE51bWJlcihpbnB1dFZhbHVlKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgaW5wdXRWYWx1ZSA9PT0gJ2Jvb2xlYW4nKSByZXR1cm4gaW5wdXRWYWx1ZTtcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGlucHV0VmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBpbnB1dFZhbHVlLnRvTG93ZXJDYXNlKCkgPT09ICd0cnVlJyB8fCBpbnB1dFZhbHVlID09PSAnMSc7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBCb29sZWFuKGlucHV0VmFsdWUpO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgY2FzZSAnY29sb3InOlxuICAgICAgICAgICAgICAgIC8vIOWEquWMlueahOmhj+iJsuiZleeQhu+8jOaUr+aMgeWkmueorui8uOWFpeagvOW8j1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgaW5wdXRWYWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8g5a2X56ym5Liy5qC85byP77ya5Y2B5YWt6YCy5Yi244CB6aGP6Imy5ZCN56ix44CBcmdiKCkvcmdiYSgpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLnBhcnNlQ29sb3JTdHJpbmcoaW5wdXRWYWx1ZSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgaW5wdXRWYWx1ZSA9PT0gJ29iamVjdCcgJiYgaW5wdXRWYWx1ZSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgaW5wdXRLZXlzID0gT2JqZWN0LmtleXMoaW5wdXRWYWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyDlpoLmnpzovLjlhaXmmK/poY/oibLlsI3osaHvvIzpqZforYnkuKbovYnmj5tcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpbnB1dEtleXMuaW5jbHVkZXMoJ3InKSB8fCBpbnB1dEtleXMuaW5jbHVkZXMoJ2cnKSB8fCBpbnB1dEtleXMuaW5jbHVkZXMoJ2InKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHI6IE1hdGgubWluKDI1NSwgTWF0aC5tYXgoMCwgTnVtYmVyKGlucHV0VmFsdWUucikgfHwgMCkpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBnOiBNYXRoLm1pbigyNTUsIE1hdGgubWF4KDAsIE51bWJlcihpbnB1dFZhbHVlLmcpIHx8IDApKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYjogTWF0aC5taW4oMjU1LCBNYXRoLm1heCgwLCBOdW1iZXIoaW5wdXRWYWx1ZS5iKSB8fCAwKSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGE6IGlucHV0VmFsdWUuYSAhPT0gdW5kZWZpbmVkID8gTWF0aC5taW4oMjU1LCBNYXRoLm1heCgwLCBOdW1iZXIoaW5wdXRWYWx1ZS5hKSkpIDogMjU1XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybihgW3NtYXJ0Q29udmVydFZhbHVlXSBJbnZhbGlkIGNvbG9yIG9iamVjdDogJHtKU09OLnN0cmluZ2lmeShpbnB1dFZhbHVlKX1gKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAvLyDlpoLmnpzmnInljp/lgLzvvIzkv53mjIHljp/lgLzntZDmp4vkuKbmm7TmlrDmj5DkvpvnmoTlgLxcbiAgICAgICAgICAgICAgICBpZiAob3JpZ2luYWxWYWx1ZSAmJiB0eXBlb2Ygb3JpZ2luYWxWYWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGlucHV0S2V5cyA9IHR5cGVvZiBpbnB1dFZhbHVlID09PSAnb2JqZWN0JyAmJiBpbnB1dFZhbHVlID8gT2JqZWN0LmtleXMoaW5wdXRWYWx1ZSkgOiBbXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcjogaW5wdXRLZXlzLmluY2x1ZGVzKCdyJykgPyBNYXRoLm1pbigyNTUsIE1hdGgubWF4KDAsIE51bWJlcihpbnB1dFZhbHVlLnIpKSkgOiAob3JpZ2luYWxWYWx1ZS5yIHx8IDI1NSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZzogaW5wdXRLZXlzLmluY2x1ZGVzKCdnJykgPyBNYXRoLm1pbigyNTUsIE1hdGgubWF4KDAsIE51bWJlcihpbnB1dFZhbHVlLmcpKSkgOiAob3JpZ2luYWxWYWx1ZS5nIHx8IDI1NSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYjogaW5wdXRLZXlzLmluY2x1ZGVzKCdiJykgPyBNYXRoLm1pbigyNTUsIE1hdGgubWF4KDAsIE51bWJlcihpbnB1dFZhbHVlLmIpKSkgOiAob3JpZ2luYWxWYWx1ZS5iIHx8IDI1NSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYTogaW5wdXRLZXlzLmluY2x1ZGVzKCdhJykgPyBNYXRoLm1pbigyNTUsIE1hdGgubWF4KDAsIE51bWJlcihpbnB1dFZhbHVlLmEpKSkgOiAob3JpZ2luYWxWYWx1ZS5hIHx8IDI1NSlcbiAgICAgICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oYFtzbWFydENvbnZlcnRWYWx1ZV0gRXJyb3IgcHJvY2Vzc2luZyBjb2xvciB3aXRoIG9yaWdpbmFsIHZhbHVlOiAke2Vycm9yfWApO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIC8vIOm7mOiqjei/lOWbnueZveiJslxuICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybihgW3NtYXJ0Q29udmVydFZhbHVlXSBVc2luZyBkZWZhdWx0IHdoaXRlIGNvbG9yIGZvciBpbnZhbGlkIGlucHV0OiAke0pTT04uc3RyaW5naWZ5KGlucHV0VmFsdWUpfWApO1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHI6IDI1NSwgZzogMjU1LCBiOiAyNTUsIGE6IDI1NSB9O1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgY2FzZSAndmVjMic6XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBpbnB1dFZhbHVlID09PSAnb2JqZWN0JyAmJiBpbnB1dFZhbHVlICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB4OiBOdW1iZXIoaW5wdXRWYWx1ZS54KSB8fCBvcmlnaW5hbFZhbHVlLnggfHwgMCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHk6IE51bWJlcihpbnB1dFZhbHVlLnkpIHx8IG9yaWdpbmFsVmFsdWUueSB8fCAwXG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBvcmlnaW5hbFZhbHVlO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgY2FzZSAndmVjMyc6XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBpbnB1dFZhbHVlID09PSAnb2JqZWN0JyAmJiBpbnB1dFZhbHVlICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB4OiBOdW1iZXIoaW5wdXRWYWx1ZS54KSB8fCBvcmlnaW5hbFZhbHVlLnggfHwgMCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHk6IE51bWJlcihpbnB1dFZhbHVlLnkpIHx8IG9yaWdpbmFsVmFsdWUueSB8fCAwLFxuICAgICAgICAgICAgICAgICAgICAgICAgejogTnVtYmVyKGlucHV0VmFsdWUueikgfHwgb3JpZ2luYWxWYWx1ZS56IHx8IDBcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIG9yaWdpbmFsVmFsdWU7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICBjYXNlICdzaXplJzpcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGlucHV0VmFsdWUgPT09ICdvYmplY3QnICYmIGlucHV0VmFsdWUgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdpZHRoOiBOdW1iZXIoaW5wdXRWYWx1ZS53aWR0aCkgfHwgb3JpZ2luYWxWYWx1ZS53aWR0aCB8fCAxMDAsXG4gICAgICAgICAgICAgICAgICAgICAgICBoZWlnaHQ6IE51bWJlcihpbnB1dFZhbHVlLmhlaWdodCkgfHwgb3JpZ2luYWxWYWx1ZS5oZWlnaHQgfHwgMTAwXG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBvcmlnaW5hbFZhbHVlO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgY2FzZSAnbm9kZSc6XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBpbnB1dFZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgICAgICAvLyDnr4Dpu57lvJXnlKjpnIDopoHnibnmroromZXnkIZcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGlucHV0VmFsdWU7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgaW5wdXRWYWx1ZSA9PT0gJ29iamVjdCcgJiYgaW5wdXRWYWx1ZSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICAvLyDlpoLmnpzlt7LntpPmmK/lsI3osaHlvaLlvI/vvIzov5Tlm55VVUlE5oiW5a6M5pW05bCN6LGhXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBpbnB1dFZhbHVlLnV1aWQgfHwgaW5wdXRWYWx1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIG9yaWdpbmFsVmFsdWU7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICBjYXNlICdhc3NldCc6XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBpbnB1dFZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgICAgICAvLyDlpoLmnpzovLjlhaXmmK/lrZfnrKbkuLLot6/lvpHvvIzovYnmj5vngrphc3NldOWwjeixoVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4geyB1dWlkOiBpbnB1dFZhbHVlIH07XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgaW5wdXRWYWx1ZSA9PT0gJ29iamVjdCcgJiYgaW5wdXRWYWx1ZSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gaW5wdXRWYWx1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIG9yaWdpbmFsVmFsdWU7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIC8vIOWwjeaWvOacquefpemhnuWei++8jOWEmOmHj+S/neaMgeWOn+aciee1kOani1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgaW5wdXRWYWx1ZSA9PT0gdHlwZW9mIG9yaWdpbmFsVmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGlucHV0VmFsdWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBvcmlnaW5hbFZhbHVlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgICAgIHByaXZhdGUgcGFyc2VDb2xvclN0cmluZyhjb2xvclN0cjogc3RyaW5nKTogeyByOiBudW1iZXI7IGc6IG51bWJlcjsgYjogbnVtYmVyOyBhOiBudW1iZXIgfSB7XG4gICAgICAgIGNvbnN0IHN0ciA9IGNvbG9yU3RyLnRyaW0oKTtcbiAgICAgICAgXG4gICAgICAgIC8vIOWPquaUr+aMgeWNgeWFremAsuWItuagvOW8jyAjUlJHR0JCIOaIliAjUlJHR0JCQUFcbiAgICAgICAgaWYgKHN0ci5zdGFydHNXaXRoKCcjJykpIHtcbiAgICAgICAgICAgIGlmIChzdHIubGVuZ3RoID09PSA3KSB7IC8vICNSUkdHQkJcbiAgICAgICAgICAgICAgICBjb25zdCByID0gcGFyc2VJbnQoc3RyLnN1YnN0cmluZygxLCAzKSwgMTYpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGcgPSBwYXJzZUludChzdHIuc3Vic3RyaW5nKDMsIDUpLCAxNik7XG4gICAgICAgICAgICAgICAgY29uc3QgYiA9IHBhcnNlSW50KHN0ci5zdWJzdHJpbmcoNSwgNyksIDE2KTtcbiAgICAgICAgICAgICAgICByZXR1cm4geyByLCBnLCBiLCBhOiAyNTUgfTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoc3RyLmxlbmd0aCA9PT0gOSkgeyAvLyAjUlJHR0JCQUFcbiAgICAgICAgICAgICAgICBjb25zdCByID0gcGFyc2VJbnQoc3RyLnN1YnN0cmluZygxLCAzKSwgMTYpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGcgPSBwYXJzZUludChzdHIuc3Vic3RyaW5nKDMsIDUpLCAxNik7XG4gICAgICAgICAgICAgICAgY29uc3QgYiA9IHBhcnNlSW50KHN0ci5zdWJzdHJpbmcoNSwgNyksIDE2KTtcbiAgICAgICAgICAgICAgICBjb25zdCBhID0gcGFyc2VJbnQoc3RyLnN1YnN0cmluZyg3LCA5KSwgMTYpO1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHIsIGcsIGIsIGEgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgLy8g5aaC5p6c5LiN5piv5pyJ5pWI55qE5Y2B5YWt6YCy5Yi25qC85byP77yM6L+U5Zue6Yyv6Kqk5o+Q56S6XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBjb2xvciBmb3JtYXQ6IFwiJHtjb2xvclN0cn1cIi4gT25seSBoZXhhZGVjaW1hbCBmb3JtYXQgaXMgc3VwcG9ydGVkIChlLmcuLCBcIiNGRjAwMDBcIiBvciBcIiNGRjAwMDBGRlwiKWApO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgdmVyaWZ5UHJvcGVydHlDaGFuZ2Uobm9kZVV1aWQ6IHN0cmluZywgY29tcG9uZW50VHlwZTogc3RyaW5nLCBwcm9wZXJ0eTogc3RyaW5nLCBvcmlnaW5hbFZhbHVlOiBhbnksIGV4cGVjdGVkVmFsdWU6IGFueSk6IFByb21pc2U8eyB2ZXJpZmllZDogYm9vbGVhbjsgYWN0dWFsVmFsdWU6IGFueTsgZnVsbERhdGE6IGFueSB9PiB7XG4gICAgICAgIGRlYnVnTG9nKGBbdmVyaWZ5UHJvcGVydHlDaGFuZ2VdIFN0YXJ0aW5nIHZlcmlmaWNhdGlvbiBmb3IgJHtjb21wb25lbnRUeXBlfS4ke3Byb3BlcnR5fWApO1xuICAgICAgICBkZWJ1Z0xvZyhgW3ZlcmlmeVByb3BlcnR5Q2hhbmdlXSBFeHBlY3RlZCB2YWx1ZTpgLCBKU09OLnN0cmluZ2lmeShleHBlY3RlZFZhbHVlKSk7XG4gICAgICAgIGRlYnVnTG9nKGBbdmVyaWZ5UHJvcGVydHlDaGFuZ2VdIE9yaWdpbmFsIHZhbHVlOmAsIEpTT04uc3RyaW5naWZ5KG9yaWdpbmFsVmFsdWUpKTtcbiAgICAgICAgXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyDph43mlrDnjbLlj5bntYTku7bkv6Hmga/pgLLooYzpqZforYlcbiAgICAgICAgICAgIGRlYnVnTG9nKGBbdmVyaWZ5UHJvcGVydHlDaGFuZ2VdIENhbGxpbmcgZ2V0Q29tcG9uZW50SW5mby4uLmApO1xuICAgICAgICAgICAgY29uc3QgY29tcG9uZW50SW5mbyA9IGF3YWl0IHRoaXMuZ2V0Q29tcG9uZW50SW5mb0ltcGwobm9kZVV1aWQsIGNvbXBvbmVudFR5cGUpO1xuICAgICAgICAgICAgZGVidWdMb2coYFt2ZXJpZnlQcm9wZXJ0eUNoYW5nZV0gZ2V0Q29tcG9uZW50SW5mbyBzdWNjZXNzOmAsIGNvbXBvbmVudEluZm8uc3VjY2Vzcyk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGNvbnN0IGFsbENvbXBvbmVudHMgPSBhd2FpdCB0aGlzLmdldENvbXBvbmVudHNJbXBsKG5vZGVVdWlkKTtcbiAgICAgICAgICAgIGRlYnVnTG9nKGBbdmVyaWZ5UHJvcGVydHlDaGFuZ2VdIGdldENvbXBvbmVudHMgc3VjY2VzczpgLCBhbGxDb21wb25lbnRzLnN1Y2Nlc3MpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZiAoY29tcG9uZW50SW5mby5zdWNjZXNzICYmIGNvbXBvbmVudEluZm8uZGF0YSkge1xuICAgICAgICAgICAgICAgIGRlYnVnTG9nKGBbdmVyaWZ5UHJvcGVydHlDaGFuZ2VdIENvbXBvbmVudCBkYXRhIGF2YWlsYWJsZSwgZXh0cmFjdGluZyBwcm9wZXJ0eSAnJHtwcm9wZXJ0eX0nYCk7XG4gICAgICAgICAgICAgICAgY29uc3QgYWxsUHJvcGVydHlOYW1lcyA9IE9iamVjdC5rZXlzKGNvbXBvbmVudEluZm8uZGF0YS5wcm9wZXJ0aWVzIHx8IHt9KTtcbiAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgW3ZlcmlmeVByb3BlcnR5Q2hhbmdlXSBBdmFpbGFibGUgcHJvcGVydGllczpgLCBhbGxQcm9wZXJ0eU5hbWVzKTtcbiAgICAgICAgICAgICAgICBjb25zdCBwcm9wZXJ0eURhdGEgPSBjb21wb25lbnRJbmZvLmRhdGEucHJvcGVydGllcz8uW3Byb3BlcnR5XTtcbiAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgW3ZlcmlmeVByb3BlcnR5Q2hhbmdlXSBSYXcgcHJvcGVydHkgZGF0YSBmb3IgJyR7cHJvcGVydHl9JzpgLCBKU09OLnN0cmluZ2lmeShwcm9wZXJ0eURhdGEpKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAvLyDlvp7lsazmgKfmlbjmk5rkuK3mj5Dlj5blr6bpmpvlgLxcbiAgICAgICAgICAgICAgICBsZXQgYWN0dWFsVmFsdWUgPSBwcm9wZXJ0eURhdGE7XG4gICAgICAgICAgICAgICAgZGVidWdMb2coYFt2ZXJpZnlQcm9wZXJ0eUNoYW5nZV0gSW5pdGlhbCBhY3R1YWxWYWx1ZTpgLCBKU09OLnN0cmluZ2lmeShhY3R1YWxWYWx1ZSkpO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGlmIChwcm9wZXJ0eURhdGEgJiYgdHlwZW9mIHByb3BlcnR5RGF0YSA9PT0gJ29iamVjdCcgJiYgJ3ZhbHVlJyBpbiBwcm9wZXJ0eURhdGEpIHtcbiAgICAgICAgICAgICAgICAgICAgYWN0dWFsVmFsdWUgPSBwcm9wZXJ0eURhdGEudmFsdWU7XG4gICAgICAgICAgICAgICAgICAgIGRlYnVnTG9nKGBbdmVyaWZ5UHJvcGVydHlDaGFuZ2VdIEV4dHJhY3RlZCBhY3R1YWxWYWx1ZSBmcm9tIC52YWx1ZTpgLCBKU09OLnN0cmluZ2lmeShhY3R1YWxWYWx1ZSkpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGRlYnVnTG9nKGBbdmVyaWZ5UHJvcGVydHlDaGFuZ2VdIE5vIC52YWx1ZSBwcm9wZXJ0eSBmb3VuZCwgdXNpbmcgcmF3IGRhdGFgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgLy8g5L+u5b6p6amX6K2J6YKP6Lyv77ya5qqi5p+l5a+m6Zqb5YC85piv5ZCm5Yy56YWN5pyf5pyb5YC8XG4gICAgICAgICAgICAgICAgbGV0IHZlcmlmaWVkID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBleHBlY3RlZFZhbHVlID09PSAnb2JqZWN0JyAmJiBleHBlY3RlZFZhbHVlICE9PSBudWxsICYmICd1dWlkJyBpbiBleHBlY3RlZFZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIOWwjeaWvOW8leeUqOmhnuWei++8iOevgOm7ni/ntYTku7Yv6LOH5rqQ77yJ77yM5q+U6LyDVVVJRFxuICAgICAgICAgICAgICAgICAgICBjb25zdCBhY3R1YWxVdWlkID0gYWN0dWFsVmFsdWUgJiYgdHlwZW9mIGFjdHVhbFZhbHVlID09PSAnb2JqZWN0JyAmJiAndXVpZCcgaW4gYWN0dWFsVmFsdWUgPyBhY3R1YWxWYWx1ZS51dWlkIDogJyc7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGV4cGVjdGVkVXVpZCA9IGV4cGVjdGVkVmFsdWUudXVpZCB8fCAnJztcbiAgICAgICAgICAgICAgICAgICAgdmVyaWZpZWQgPSBhY3R1YWxVdWlkID09PSBleHBlY3RlZFV1aWQgJiYgZXhwZWN0ZWRVdWlkICE9PSAnJztcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIGRlYnVnTG9nKGBbdmVyaWZ5UHJvcGVydHlDaGFuZ2VdIFJlZmVyZW5jZSBjb21wYXJpc29uOmApO1xuICAgICAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgICAtIEV4cGVjdGVkIFVVSUQ6IFwiJHtleHBlY3RlZFV1aWR9XCJgKTtcbiAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYCAgLSBBY3R1YWwgVVVJRDogXCIke2FjdHVhbFV1aWR9XCJgKTtcbiAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYCAgLSBVVUlEIG1hdGNoOiAke2FjdHVhbFV1aWQgPT09IGV4cGVjdGVkVXVpZH1gKTtcbiAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYCAgLSBVVUlEIG5vdCBlbXB0eTogJHtleHBlY3RlZFV1aWQgIT09ICcnfWApO1xuICAgICAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgICAtIEZpbmFsIHZlcmlmaWVkOiAke3ZlcmlmaWVkfWApO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIOWwjeaWvOWFtuS7lumhnuWei++8jOebtOaOpeavlOi8g+WAvFxuICAgICAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgW3ZlcmlmeVByb3BlcnR5Q2hhbmdlXSBWYWx1ZSBjb21wYXJpc29uOmApO1xuICAgICAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgICAtIEV4cGVjdGVkIHR5cGU6ICR7dHlwZW9mIGV4cGVjdGVkVmFsdWV9YCk7XG4gICAgICAgICAgICAgICAgICAgIGRlYnVnTG9nKGAgIC0gQWN0dWFsIHR5cGU6ICR7dHlwZW9mIGFjdHVhbFZhbHVlfWApO1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBhY3R1YWxWYWx1ZSA9PT0gdHlwZW9mIGV4cGVjdGVkVmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgYWN0dWFsVmFsdWUgPT09ICdvYmplY3QnICYmIGFjdHVhbFZhbHVlICE9PSBudWxsICYmIGV4cGVjdGVkVmFsdWUgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDlsI3osaHpoZ7lnovnmoTmt7Hluqbmr5TovINcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2ZXJpZmllZCA9IEpTT04uc3RyaW5naWZ5KGFjdHVhbFZhbHVlKSA9PT0gSlNPTi5zdHJpbmdpZnkoZXhwZWN0ZWRWYWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYCAgLSBPYmplY3QgY29tcGFyaXNvbiAoSlNPTik6ICR7dmVyaWZpZWR9YCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOWfuuacrOmhnuWei+eahOebtOaOpeavlOi8g1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZlcmlmaWVkID0gYWN0dWFsVmFsdWUgPT09IGV4cGVjdGVkVmFsdWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYCAgLSBEaXJlY3QgY29tcGFyaXNvbjogJHt2ZXJpZmllZH1gKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIOmhnuWei+S4jeWMuemFjeaZgueahOeJueauiuiZleeQhu+8iOWmguaVuOWtl+WSjOWtl+espuS4su+8iVxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgc3RyaW5nTWF0Y2ggPSBTdHJpbmcoYWN0dWFsVmFsdWUpID09PSBTdHJpbmcoZXhwZWN0ZWRWYWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBudW1iZXJNYXRjaCA9IE51bWJlcihhY3R1YWxWYWx1ZSkgPT09IE51bWJlcihleHBlY3RlZFZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZlcmlmaWVkID0gc3RyaW5nTWF0Y2ggfHwgbnVtYmVyTWF0Y2g7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgICAtIFN0cmluZyBtYXRjaDogJHtzdHJpbmdNYXRjaH1gKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlYnVnTG9nKGAgIC0gTnVtYmVyIG1hdGNoOiAke251bWJlck1hdGNofWApO1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYCAgLSBUeXBlIG1pc21hdGNoIHZlcmlmaWVkOiAke3ZlcmlmaWVkfWApO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGRlYnVnTG9nKGBbdmVyaWZ5UHJvcGVydHlDaGFuZ2VdIEZpbmFsIHZlcmlmaWNhdGlvbiByZXN1bHQ6ICR7dmVyaWZpZWR9YCk7XG4gICAgICAgICAgICAgICAgZGVidWdMb2coYFt2ZXJpZnlQcm9wZXJ0eUNoYW5nZV0gRmluYWwgYWN0dWFsVmFsdWU6YCwgSlNPTi5zdHJpbmdpZnkoYWN0dWFsVmFsdWUpKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSB7XG4gICAgICAgICAgICAgICAgICAgIHZlcmlmaWVkLFxuICAgICAgICAgICAgICAgICAgICBhY3R1YWxWYWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgZnVsbERhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIOWPqui/lOWbnuS/ruaUueeahOWxrOaAp+S/oeaBr++8jOS4jei/lOWbnuWujOaVtOe1hOS7tuaVuOaTmlxuICAgICAgICAgICAgICAgICAgICAgICAgbW9kaWZpZWRQcm9wZXJ0eToge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5hbWU6IHByb3BlcnR5LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJlZm9yZTogb3JpZ2luYWxWYWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBleHBlY3RlZDogZXhwZWN0ZWRWYWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBhY3R1YWw6IGFjdHVhbFZhbHVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZlcmlmaWVkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb3BlcnR5TWV0YWRhdGE6IHByb3BlcnR5RGF0YSAvLyDlj6rljIXlkKvpgJnlgIvlsazmgKfnmoTlhYPmlbjmk5pcbiAgICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyDnsKHljJbnmoTntYTku7bkv6Hmga9cbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudFN1bW1hcnk6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBub2RlVXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRUeXBlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRvdGFsUHJvcGVydGllczogT2JqZWN0LmtleXMoY29tcG9uZW50SW5mby5kYXRhPy5wcm9wZXJ0aWVzIHx8IHt9KS5sZW5ndGhcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgZGVidWdMb2coYFt2ZXJpZnlQcm9wZXJ0eUNoYW5nZV0gUmV0dXJuaW5nIHJlc3VsdDpgLCBKU09OLnN0cmluZ2lmeShyZXN1bHQsIG51bGwsIDIpKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBkZWJ1Z0xvZyhgW3ZlcmlmeVByb3BlcnR5Q2hhbmdlXSBDb21wb25lbnRJbmZvIGZhaWxlZCBvciBubyBkYXRhOmAsIGNvbXBvbmVudEluZm8pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcignW3ZlcmlmeVByb3BlcnR5Q2hhbmdlXSBWZXJpZmljYXRpb24gZmFpbGVkIHdpdGggZXJyb3I6JywgZXJyb3IpO1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcignW3ZlcmlmeVByb3BlcnR5Q2hhbmdlXSBFcnJvciBzdGFjazonLCBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3Iuc3RhY2sgOiAnTm8gc3RhY2sgdHJhY2UnKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgZGVidWdMb2coYFt2ZXJpZnlQcm9wZXJ0eUNoYW5nZV0gUmV0dXJuaW5nIGZhbGxiYWNrIHJlc3VsdGApO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgdmVyaWZpZWQ6IGZhbHNlLFxuICAgICAgICAgICAgYWN0dWFsVmFsdWU6IHVuZGVmaW5lZCxcbiAgICAgICAgICAgIGZ1bGxEYXRhOiBudWxsXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICog5qqi5ris5piv5ZCm54K656+A6bue5bGs5oCn77yM5aaC5p6c5piv5YmH6YeN5a6a5ZCR5Yiw5bCN5oeJ55qE56+A6bue5pa55rOVXG4gICAgICovXG4gICAgcHJpdmF0ZSBhc3luYyBjaGVja0FuZFJlZGlyZWN0Tm9kZVByb3BlcnRpZXMoYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2UgfCBudWxsPiB7XG4gICAgICAgIGNvbnN0IHsgbm9kZVV1aWQsIGNvbXBvbmVudFR5cGUsIHByb3BlcnR5LCBwcm9wZXJ0eVR5cGUsIHZhbHVlIH0gPSBhcmdzO1xuICAgICAgICBcbiAgICAgICAgLy8g5qqi5ris5piv5ZCm54K656+A6bue5Z+656SO5bGs5oCn77yI5oeJ6Kmy5L2/55SoIHNldF9ub2RlX3Byb3BlcnR577yJXG4gICAgICAgIGNvbnN0IG5vZGVCYXNpY1Byb3BlcnRpZXMgPSBbXG4gICAgICAgICAgICAnbmFtZScsICdhY3RpdmUnLCAnbGF5ZXInLCAnbW9iaWxpdHknLCAncGFyZW50JywgJ2NoaWxkcmVuJywgJ2hpZGVGbGFncydcbiAgICAgICAgXTtcbiAgICAgICAgXG4gICAgICAgIC8vIOaqoua4rOaYr+WQpueCuuevgOm7nuiuiuaPm+WxrOaAp++8iOaHieipsuS9v+eUqCBzZXRfbm9kZV90cmFuc2Zvcm3vvIlcbiAgICAgICAgY29uc3Qgbm9kZVRyYW5zZm9ybVByb3BlcnRpZXMgPSBbXG4gICAgICAgICAgICAncG9zaXRpb24nLCAncm90YXRpb24nLCAnc2NhbGUnLCAnZXVsZXJBbmdsZXMnLCAnYW5nbGUnXG4gICAgICAgIF07XG4gICAgICAgIFxuICAgICAgICAvLyBEZXRlY3QgYXR0ZW1wdHMgdG8gc2V0IGNjLk5vZGUgcHJvcGVydGllcyAoY29tbW9uIG1pc3Rha2UpXG4gICAgICAgIGlmIChjb21wb25lbnRUeXBlID09PSAnY2MuTm9kZScgfHwgY29tcG9uZW50VHlwZSA9PT0gJ05vZGUnKSB7XG4gICAgICAgICAgICBpZiAobm9kZUJhc2ljUHJvcGVydGllcy5pbmNsdWRlcyhwcm9wZXJ0eSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yOiBgUHJvcGVydHkgJyR7cHJvcGVydHl9JyBpcyBhIG5vZGUgYmFzaWMgcHJvcGVydHksIG5vdCBhIGNvbXBvbmVudCBwcm9wZXJ0eWAsXG4gICAgICAgICAgICAgICAgICAgICAgaW5zdHJ1Y3Rpb246IGBQbGVhc2UgdXNlIHNldF9ub2RlX3Byb3BlcnR5IG1ldGhvZCB0byBzZXQgbm9kZSBwcm9wZXJ0aWVzOiBzZXRfbm9kZV9wcm9wZXJ0eSh1dWlkPVwiJHtub2RlVXVpZH1cIiwgcHJvcGVydHk9XCIke3Byb3BlcnR5fVwiLCB2YWx1ZT0ke0pTT04uc3RyaW5naWZ5KHZhbHVlKX0pYFxuICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgfSBlbHNlIGlmIChub2RlVHJhbnNmb3JtUHJvcGVydGllcy5pbmNsdWRlcyhwcm9wZXJ0eSkpIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGBQcm9wZXJ0eSAnJHtwcm9wZXJ0eX0nIGlzIGEgbm9kZSB0cmFuc2Zvcm0gcHJvcGVydHksIG5vdCBhIGNvbXBvbmVudCBwcm9wZXJ0eWAsXG4gICAgICAgICAgICAgICAgICAgICAgaW5zdHJ1Y3Rpb246IGBQbGVhc2UgdXNlIHNldF9ub2RlX3RyYW5zZm9ybSBtZXRob2QgdG8gc2V0IHRyYW5zZm9ybSBwcm9wZXJ0aWVzOiBzZXRfbm9kZV90cmFuc2Zvcm0odXVpZD1cIiR7bm9kZVV1aWR9XCIsICR7cHJvcGVydHl9PSR7SlNPTi5zdHJpbmdpZnkodmFsdWUpfSlgXG4gICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIFxuICAgICAgICAgIC8vIERldGVjdCBjb21tb24gaW5jb3JyZWN0IHVzYWdlXG4gICAgICAgICAgaWYgKG5vZGVCYXNpY1Byb3BlcnRpZXMuaW5jbHVkZXMocHJvcGVydHkpIHx8IG5vZGVUcmFuc2Zvcm1Qcm9wZXJ0aWVzLmluY2x1ZGVzKHByb3BlcnR5KSkge1xuICAgICAgICAgICAgICBjb25zdCBtZXRob2ROYW1lID0gbm9kZVRyYW5zZm9ybVByb3BlcnRpZXMuaW5jbHVkZXMocHJvcGVydHkpID8gJ3NldF9ub2RlX3RyYW5zZm9ybScgOiAnc2V0X25vZGVfcHJvcGVydHknO1xuICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgICBlcnJvcjogYFByb3BlcnR5ICcke3Byb3BlcnR5fScgaXMgYSBub2RlIHByb3BlcnR5LCBub3QgYSBjb21wb25lbnQgcHJvcGVydHlgLFxuICAgICAgICAgICAgICAgICAgaW5zdHJ1Y3Rpb246IGBQcm9wZXJ0eSAnJHtwcm9wZXJ0eX0nIHNob3VsZCBiZSBzZXQgdXNpbmcgJHttZXRob2ROYW1lfSBtZXRob2QsIG5vdCBzZXRfY29tcG9uZW50X3Byb3BlcnR5LiBQbGVhc2UgdXNlOiAke21ldGhvZE5hbWV9KHV1aWQ9XCIke25vZGVVdWlkfVwiLCAke25vZGVUcmFuc2Zvcm1Qcm9wZXJ0aWVzLmluY2x1ZGVzKHByb3BlcnR5KSA/IHByb3BlcnR5IDogYHByb3BlcnR5PVwiJHtwcm9wZXJ0eX1cImB9PSR7SlNPTi5zdHJpbmdpZnkodmFsdWUpfSlgXG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgfVxuICAgICAgICAgIFxuICAgICAgICAgIHJldHVybiBudWxsOyAvLyDkuI3mmK/nr4Dpu57lsazmgKfvvIznubznuozmraPluLjomZXnkIZcbiAgICAgIH1cblxuICAgICAgLyoqXG4gICAgICAgKiDnlJ/miJDntYTku7blu7rorbDkv6Hmga9cbiAgICAgICAqL1xuICAgICAgcHJpdmF0ZSBnZW5lcmF0ZUNvbXBvbmVudFN1Z2dlc3Rpb24ocmVxdWVzdGVkVHlwZTogc3RyaW5nLCBhdmFpbGFibGVUeXBlczogc3RyaW5nW10sIHByb3BlcnR5OiBzdHJpbmcpOiBzdHJpbmcge1xuICAgICAgICAgIC8vIOaqouafpeaYr+WQpuWtmOWcqOebuOS8vOeahOe1hOS7tumhnuWei1xuICAgICAgICAgIGNvbnN0IHNpbWlsYXJUeXBlcyA9IGF2YWlsYWJsZVR5cGVzLmZpbHRlcih0eXBlID0+IFxuICAgICAgICAgICAgICB0eXBlLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMocmVxdWVzdGVkVHlwZS50b0xvd2VyQ2FzZSgpKSB8fCBcbiAgICAgICAgICAgICAgcmVxdWVzdGVkVHlwZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHR5cGUudG9Mb3dlckNhc2UoKSlcbiAgICAgICAgICApO1xuICAgICAgICAgIFxuICAgICAgICAgIGxldCBpbnN0cnVjdGlvbiA9ICcnO1xuICAgICAgICAgIFxuICAgICAgICAgIGlmIChzaW1pbGFyVHlwZXMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICBpbnN0cnVjdGlvbiArPSBgXFxuXFxu8J+UjSBGb3VuZCBzaW1pbGFyIGNvbXBvbmVudHM6ICR7c2ltaWxhclR5cGVzLmpvaW4oJywgJyl9YDtcbiAgICAgICAgICAgICAgaW5zdHJ1Y3Rpb24gKz0gYFxcbvCfkqEgU3VnZ2VzdGlvbjogUGVyaGFwcyB5b3UgbWVhbnQgdG8gc2V0IHRoZSAnJHtzaW1pbGFyVHlwZXNbMF19JyBjb21wb25lbnQ/YDtcbiAgICAgICAgICB9XG4gICAgICAgICAgXG4gICAgICAgICAgLy8gUmVjb21tZW5kIHBvc3NpYmxlIGNvbXBvbmVudHMgYmFzZWQgb24gcHJvcGVydHkgbmFtZVxuICAgICAgICAgIGNvbnN0IHByb3BlcnR5VG9Db21wb25lbnRNYXA6IFJlY29yZDxzdHJpbmcsIHN0cmluZ1tdPiA9IHtcbiAgICAgICAgICAgICAgJ3N0cmluZyc6IFsnY2MuTGFiZWwnLCAnY2MuUmljaFRleHQnLCAnY2MuRWRpdEJveCddLFxuICAgICAgICAgICAgICAndGV4dCc6IFsnY2MuTGFiZWwnLCAnY2MuUmljaFRleHQnXSxcbiAgICAgICAgICAgICAgJ2ZvbnRTaXplJzogWydjYy5MYWJlbCcsICdjYy5SaWNoVGV4dCddLFxuICAgICAgICAgICAgICAnc3ByaXRlRnJhbWUnOiBbJ2NjLlNwcml0ZSddLFxuICAgICAgICAgICAgICAnY29sb3InOiBbJ2NjLkxhYmVsJywgJ2NjLlNwcml0ZScsICdjYy5HcmFwaGljcyddLFxuICAgICAgICAgICAgICAnbm9ybWFsQ29sb3InOiBbJ2NjLkJ1dHRvbiddLFxuICAgICAgICAgICAgICAncHJlc3NlZENvbG9yJzogWydjYy5CdXR0b24nXSxcbiAgICAgICAgICAgICAgJ3RhcmdldCc6IFsnY2MuQnV0dG9uJ10sXG4gICAgICAgICAgICAgICdjb250ZW50U2l6ZSc6IFsnY2MuVUlUcmFuc2Zvcm0nXSxcbiAgICAgICAgICAgICAgJ2FuY2hvclBvaW50JzogWydjYy5VSVRyYW5zZm9ybSddXG4gICAgICAgICAgfTtcbiAgICAgICAgICBcbiAgICAgICAgICBjb25zdCByZWNvbW1lbmRlZENvbXBvbmVudHMgPSBwcm9wZXJ0eVRvQ29tcG9uZW50TWFwW3Byb3BlcnR5XSB8fCBbXTtcbiAgICAgICAgICBjb25zdCBhdmFpbGFibGVSZWNvbW1lbmRlZCA9IHJlY29tbWVuZGVkQ29tcG9uZW50cy5maWx0ZXIoY29tcCA9PiBhdmFpbGFibGVUeXBlcy5pbmNsdWRlcyhjb21wKSk7XG4gICAgICAgICAgXG4gICAgICAgICAgaWYgKGF2YWlsYWJsZVJlY29tbWVuZGVkLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgaW5zdHJ1Y3Rpb24gKz0gYFxcblxcbvCfjq8gQmFzZWQgb24gcHJvcGVydHkgJyR7cHJvcGVydHl9JywgcmVjb21tZW5kZWQgY29tcG9uZW50czogJHthdmFpbGFibGVSZWNvbW1lbmRlZC5qb2luKCcsICcpfWA7XG4gICAgICAgICAgfVxuICAgICAgICAgIFxuICAgICAgICAgIC8vIFByb3ZpZGUgb3BlcmF0aW9uIHN1Z2dlc3Rpb25zXG4gICAgICAgICAgaW5zdHJ1Y3Rpb24gKz0gYFxcblxcbvCfk4sgU3VnZ2VzdGVkIEFjdGlvbnM6YDtcbiAgICAgICAgICBpbnN0cnVjdGlvbiArPSBgXFxuMS4gVXNlIGdldF9jb21wb25lbnRzKG5vZGVVdWlkPVwiJHtyZXF1ZXN0ZWRUeXBlLmluY2x1ZGVzKCd1dWlkJykgPyAnWU9VUl9OT0RFX1VVSUQnIDogJ25vZGVVdWlkJ31cIikgdG8gdmlldyBhbGwgY29tcG9uZW50cyBvbiB0aGUgbm9kZWA7XG4gICAgICAgICAgaW5zdHJ1Y3Rpb24gKz0gYFxcbjIuIElmIHlvdSBuZWVkIHRvIGFkZCBhIGNvbXBvbmVudCwgdXNlIGFkZF9jb21wb25lbnQobm9kZVV1aWQ9XCIuLi5cIiwgY29tcG9uZW50VHlwZT1cIiR7cmVxdWVzdGVkVHlwZX1cIilgO1xuICAgICAgICAgIGluc3RydWN0aW9uICs9IGBcXG4zLiBWZXJpZnkgdGhhdCB0aGUgY29tcG9uZW50IHR5cGUgbmFtZSBpcyBjb3JyZWN0IChjYXNlLXNlbnNpdGl2ZSlgO1xuICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgcmV0dXJuIGluc3RydWN0aW9uO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIOW/q+mAn+mpl+itieizh+a6kOioree9rue1kOaenFxuICAgICAqL1xuICAgIHByaXZhdGUgYXN5bmMgcXVpY2tWZXJpZnlBc3NldChub2RlVXVpZDogc3RyaW5nLCBjb21wb25lbnRUeXBlOiBzdHJpbmcsIHByb3BlcnR5OiBzdHJpbmcpOiBQcm9taXNlPGFueT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcmF3Tm9kZURhdGEgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1ub2RlJywgbm9kZVV1aWQpO1xuICAgICAgICAgICAgaWYgKCFyYXdOb2RlRGF0YSB8fCAhcmF3Tm9kZURhdGEuX19jb21wc19fKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIOaJvuWIsOe1hOS7tlxuICAgICAgICAgICAgY29uc3QgY29tcG9uZW50SW5kZXggPSBmaW5kQ29tcG9uZW50SW5kZXhCeVR5cGUocmF3Tm9kZURhdGEuX19jb21wc19fLCBjb21wb25lbnRUeXBlKTtcbiAgICAgICAgICAgIGNvbnN0IGNvbXBvbmVudCA9IGNvbXBvbmVudEluZGV4ID09PSAtMSA/IG51bGwgOiByYXdOb2RlRGF0YS5fX2NvbXBzX19bY29tcG9uZW50SW5kZXhdO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZiAoIWNvbXBvbmVudCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyDmj5Dlj5blsazmgKflgLxcbiAgICAgICAgICAgIGNvbnN0IHByb3BlcnRpZXMgPSB0aGlzLmV4dHJhY3RDb21wb25lbnRQcm9wZXJ0aWVzKGNvbXBvbmVudCk7XG4gICAgICAgICAgICBjb25zdCBwcm9wZXJ0eURhdGEgPSBwcm9wZXJ0aWVzW3Byb3BlcnR5XTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgaWYgKHByb3BlcnR5RGF0YSAmJiB0eXBlb2YgcHJvcGVydHlEYXRhID09PSAnb2JqZWN0JyAmJiAndmFsdWUnIGluIHByb3BlcnR5RGF0YSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBwcm9wZXJ0eURhdGEudmFsdWU7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBwcm9wZXJ0eURhdGE7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKGBbcXVpY2tWZXJpZnlBc3NldF0gRXJyb3I6YCwgZXJyb3IpO1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cbiAgICB9XG59XG4iXX0=