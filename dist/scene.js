"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.methods = void 0;
const path_1 = require("path");
module.paths.push((0, path_1.join)(Editor.App.path, 'node_modules'));
function getPrefabFacade() {
    var _a;
    if (typeof cce === 'undefined' || cce === null) {
        return { ok: false, error: 'cce global is not available; this method must run in a scene-script context' };
    }
    const candidates = [
        cce.Prefab,
        (_a = cce.SceneFacadeManager) === null || _a === void 0 ? void 0 : _a.instance,
        cce.SceneFacadeManager,
    ];
    // Ensure the candidate exposes every facade method we may call;
    // a partial candidate would crash at the first missing method.
    const required = ['createPrefab', 'applyPrefab', 'linkPrefab', 'unlinkPrefab', 'getPrefabData'];
    for (const candidate of candidates) {
        if (candidate && required.every(m => typeof candidate[m] === 'function')) {
            return { ok: true, value: candidate };
        }
    }
    return {
        ok: false,
        error: 'No complete prefab facade found on cce (cce.Prefab / cce.SceneFacadeManager). Cocos editor build may not expose the expected manager or only exposes a partial surface.',
    };
}
function findNodeByUuidDeep(root, uuid) {
    var _a, _b;
    if (!root)
        return null;
    if (root._id === uuid || root.uuid === uuid)
        return root;
    const children = (_b = (_a = root.children) !== null && _a !== void 0 ? _a : root._children) !== null && _b !== void 0 ? _b : [];
    for (const child of children) {
        const hit = findNodeByUuidDeep(child, uuid);
        if (hit)
            return hit;
    }
    return null;
}
function resolveComponentContext(nodeUuid, componentType) {
    const { director, js } = require('cc');
    const scene = director.getScene();
    if (!scene) {
        return { ok: false, error: 'No active scene' };
    }
    // scene.getChildByUuid only walks direct children; use depth-first search.
    const node = findNodeByUuidDeep(scene, nodeUuid);
    if (!node) {
        return { ok: false, error: `Node with UUID ${nodeUuid} not found` };
    }
    const ComponentClass = js.getClassByName(componentType);
    if (!ComponentClass) {
        return { ok: false, error: `Component type ${componentType} not found` };
    }
    const component = node.getComponent(ComponentClass);
    if (!component) {
        return { ok: false, error: `Component ${componentType} not found on node` };
    }
    return { ok: true, scene, node, component };
}
/**
 * Nudge the editor's serialization model to re-pull the component dump
 * from runtime. Without this, scene-script mutations to a component's
 * internal state (e.g. `cc.Button.clickEvents.push(eh)`) never reach the
 * model that `save-scene` writes to disk — see CLAUDE.md Landmine #11.
 *
 * The trick: any `set-property` call to the component triggers the
 * model to re-sync. We pick `enabled` (defined on every cc.Component)
 * and write back the current value, which is a no-op semantically but
 * forces the sync. Best-effort — we swallow errors so the caller still
 * sees the runtime mutation it asked for.
 */
async function nudgeComponentSerializationModel(component) {
    try {
        await Editor.Message.request('scene', 'set-property', {
            uuid: component.uuid,
            path: 'enabled',
            dump: { value: component.enabled !== false },
        });
    }
    catch (_a) {
        // best-effort
    }
}
function serializeEventHandler(eh) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    if (!eh)
        return null;
    return {
        targetUuid: (_b = (_a = eh.target) === null || _a === void 0 ? void 0 : _a.uuid) !== null && _b !== void 0 ? _b : null,
        targetName: (_d = (_c = eh.target) === null || _c === void 0 ? void 0 : _c.name) !== null && _d !== void 0 ? _d : null,
        component: (_f = (_e = eh.component) !== null && _e !== void 0 ? _e : eh._componentName) !== null && _f !== void 0 ? _f : null,
        handler: (_g = eh.handler) !== null && _g !== void 0 ? _g : null,
        customEventData: (_h = eh.customEventData) !== null && _h !== void 0 ? _h : '',
    };
}
exports.methods = {
    /**
     * Create a new scene
     */
    createNewScene() {
        try {
            const { director, Scene } = require('cc');
            const scene = new Scene();
            scene.name = 'New Scene';
            director.runScene(scene);
            return { success: true, message: 'New scene created successfully' };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    },
    /**
     * Add component to a node
     */
    addComponentToNode(nodeUuid, componentType) {
        try {
            const { director, js } = require('cc');
            const scene = director.getScene();
            if (!scene) {
                return { success: false, error: 'No active scene' };
            }
            // Find node by UUID
            const node = scene.getChildByUuid(nodeUuid);
            if (!node) {
                return { success: false, error: `Node with UUID ${nodeUuid} not found` };
            }
            // Get component class
            const ComponentClass = js.getClassByName(componentType);
            if (!ComponentClass) {
                return { success: false, error: `Component type ${componentType} not found` };
            }
            // Add component
            const component = node.addComponent(ComponentClass);
            return {
                success: true,
                message: `Component ${componentType} added successfully`,
                data: { componentId: component.uuid }
            };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    },
    /**
     * Remove component from a node
     */
    removeComponentFromNode(nodeUuid, componentType) {
        try {
            const { director, js } = require('cc');
            const scene = director.getScene();
            if (!scene) {
                return { success: false, error: 'No active scene' };
            }
            const node = scene.getChildByUuid(nodeUuid);
            if (!node) {
                return { success: false, error: `Node with UUID ${nodeUuid} not found` };
            }
            const ComponentClass = js.getClassByName(componentType);
            if (!ComponentClass) {
                return { success: false, error: `Component type ${componentType} not found` };
            }
            const component = node.getComponent(ComponentClass);
            if (!component) {
                return { success: false, error: `Component ${componentType} not found on node` };
            }
            node.removeComponent(component);
            return { success: true, message: `Component ${componentType} removed successfully` };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    },
    /**
     * Create a new node
     */
    createNode(name, parentUuid) {
        try {
            const { director, Node } = require('cc');
            const scene = director.getScene();
            if (!scene) {
                return { success: false, error: 'No active scene' };
            }
            const node = new Node(name);
            if (parentUuid) {
                const parent = scene.getChildByUuid(parentUuid);
                if (parent) {
                    parent.addChild(node);
                }
                else {
                    scene.addChild(node);
                }
            }
            else {
                scene.addChild(node);
            }
            return {
                success: true,
                message: `Node ${name} created successfully`,
                data: { uuid: node.uuid, name: node.name }
            };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    },
    /**
     * Get node information
     */
    getNodeInfo(nodeUuid) {
        var _a;
        try {
            const { director } = require('cc');
            const scene = director.getScene();
            if (!scene) {
                return { success: false, error: 'No active scene' };
            }
            const node = scene.getChildByUuid(nodeUuid);
            if (!node) {
                return { success: false, error: `Node with UUID ${nodeUuid} not found` };
            }
            return {
                success: true,
                data: {
                    uuid: node.uuid,
                    name: node.name,
                    active: node.active,
                    position: node.position,
                    rotation: node.rotation,
                    scale: node.scale,
                    parent: (_a = node.parent) === null || _a === void 0 ? void 0 : _a.uuid,
                    children: node.children.map((child) => child.uuid),
                    components: node.components.map((comp) => ({
                        type: comp.constructor.name,
                        enabled: comp.enabled
                    }))
                }
            };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    },
    /**
     * Get all nodes in scene
     */
    getAllNodes() {
        try {
            const { director } = require('cc');
            const scene = director.getScene();
            if (!scene) {
                return { success: false, error: 'No active scene' };
            }
            const nodes = [];
            const collectNodes = (node) => {
                var _a;
                nodes.push({
                    uuid: node.uuid,
                    name: node.name,
                    active: node.active,
                    parent: (_a = node.parent) === null || _a === void 0 ? void 0 : _a.uuid
                });
                node.children.forEach((child) => collectNodes(child));
            };
            scene.children.forEach((child) => collectNodes(child));
            return { success: true, data: nodes };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    },
    /**
     * Find node by name
     */
    findNodeByName(name) {
        try {
            const { director } = require('cc');
            const scene = director.getScene();
            if (!scene) {
                return { success: false, error: 'No active scene' };
            }
            const node = scene.getChildByName(name);
            if (!node) {
                return { success: false, error: `Node with name ${name} not found` };
            }
            return {
                success: true,
                data: {
                    uuid: node.uuid,
                    name: node.name,
                    active: node.active,
                    position: node.position
                }
            };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    },
    /**
     * Get current scene information
     */
    getCurrentSceneInfo() {
        try {
            const { director } = require('cc');
            const scene = director.getScene();
            if (!scene) {
                return { success: false, error: 'No active scene' };
            }
            return {
                success: true,
                data: {
                    name: scene.name,
                    uuid: scene.uuid,
                    nodeCount: scene.children.length
                }
            };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    },
    /**
     * Set node property
     */
    setNodeProperty(nodeUuid, property, value) {
        try {
            const { director } = require('cc');
            const scene = director.getScene();
            if (!scene) {
                return { success: false, error: 'No active scene' };
            }
            const node = scene.getChildByUuid(nodeUuid);
            if (!node) {
                return { success: false, error: `Node with UUID ${nodeUuid} not found` };
            }
            // 设置属性
            if (property === 'position') {
                node.setPosition(value.x || 0, value.y || 0, value.z || 0);
            }
            else if (property === 'rotation') {
                node.setRotationFromEuler(value.x || 0, value.y || 0, value.z || 0);
            }
            else if (property === 'scale') {
                node.setScale(value.x || 1, value.y || 1, value.z || 1);
            }
            else if (property === 'active') {
                node.active = value;
            }
            else if (property === 'name') {
                node.name = value;
            }
            else {
                // 尝试直接设置属性
                node[property] = value;
            }
            return {
                success: true,
                message: `Property '${property}' updated successfully`
            };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    },
    /**
     * Get scene hierarchy
     */
    getSceneHierarchy(includeComponents = false) {
        try {
            const { director } = require('cc');
            const scene = director.getScene();
            if (!scene) {
                return { success: false, error: 'No active scene' };
            }
            const processNode = (node) => {
                const result = {
                    name: node.name,
                    uuid: node.uuid,
                    active: node.active,
                    children: []
                };
                if (includeComponents) {
                    result.components = node.components.map((comp) => ({
                        type: comp.constructor.name,
                        enabled: comp.enabled
                    }));
                }
                if (node.children && node.children.length > 0) {
                    result.children = node.children.map((child) => processNode(child));
                }
                return result;
            };
            const hierarchy = scene.children.map((child) => processNode(child));
            return { success: true, data: hierarchy };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    },
    /**
     * Create prefab asset from a node via the official scene facade.
     *
     * Routes through `cce.Prefab.createPrefab` (the Cocos editor prefab
     * manager exposed in scene-script context). The url accepts both
     * `db://assets/...` and absolute filesystem paths in different editor
     * builds, so we try both shapes and surface whichever fails.
     */
    async createPrefabFromNode(nodeUuid, url) {
        var _a, _b;
        const prefabMgr = getPrefabFacade();
        if (!prefabMgr.ok) {
            return { success: false, error: prefabMgr.error };
        }
        try {
            const tries = [];
            // Prefer db:// form (matches asset-db query results) and fall
            // back to whatever the caller passed verbatim.
            const dbUrl = url.startsWith('db://') ? url : `db://assets/${url.replace(/^\/+/, '')}`;
            tries.push(dbUrl);
            if (dbUrl !== url) {
                tries.push(url);
            }
            const errors = [];
            for (const candidate of tries) {
                try {
                    const result = await prefabMgr.value.createPrefab(nodeUuid, candidate);
                    // cce.Prefab.createPrefab repurposes the source node into a
                    // prefab instance with a fresh UUID, so the caller-supplied
                    // nodeUuid is no longer valid. Resolve the new UUID by
                    // querying nodes that reference the freshly minted asset.
                    let assetUuid = null;
                    if (typeof result === 'string') {
                        assetUuid = result;
                    }
                    else if (result && typeof result === 'object' && typeof result.uuid === 'string') {
                        assetUuid = result.uuid;
                    }
                    let instanceNodeUuid = null;
                    if (assetUuid) {
                        try {
                            const instances = await Editor.Message.request('scene', 'query-nodes-by-asset-uuid', assetUuid);
                            if (Array.isArray(instances) && instances.length > 0) {
                                // Newly-created prefab instance is typically the
                                // last entry. Caveat: if the same asset already
                                // had instances in the scene, "last" picks one
                                // of them rather than the new one. The editor
                                // appears to return creation order, but the API
                                // is undocumented; callers requiring strict
                                // identification should snapshot before calling.
                                instanceNodeUuid = instances[instances.length - 1];
                            }
                        }
                        catch (_c) {
                            // Non-fatal: the asset was created either way.
                        }
                    }
                    return {
                        success: true,
                        data: {
                            url: candidate,
                            sourceNodeUuid: nodeUuid,
                            prefabAssetUuid: assetUuid,
                            instanceNodeUuid,
                            raw: result,
                        },
                    };
                }
                catch (err) {
                    errors.push(`${candidate}: ${(_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : err}`);
                }
            }
            return {
                success: false,
                error: `cce.Prefab.createPrefab failed: ${errors.join('; ')}`,
            };
        }
        catch (error) {
            return { success: false, error: (_b = error === null || error === void 0 ? void 0 : error.message) !== null && _b !== void 0 ? _b : String(error) };
        }
    },
    /**
     * Push prefab instance edits back to the prefab asset.
     * Wraps scene facade `applyPrefab(nodeUuid)`.
     */
    async applyPrefab(nodeUuid) {
        var _a;
        const prefabMgr = getPrefabFacade();
        if (!prefabMgr.ok) {
            return { success: false, error: prefabMgr.error };
        }
        try {
            // Note: facadeReturn from cce.SceneFacade.applyPrefab is observed
            // to be `false` even when the apply genuinely writes to disk
            // (verified during P4 v2.1.0 real-editor testing). Treat
            // "no exception thrown" as success and surface the raw return
            // value as metadata only.
            const facadeReturn = await prefabMgr.value.applyPrefab(nodeUuid);
            return { success: true, data: { facadeReturn, nodeUuid } };
        }
        catch (error) {
            return { success: false, error: (_a = error === null || error === void 0 ? void 0 : error.message) !== null && _a !== void 0 ? _a : String(error) };
        }
    },
    /**
     * Connect a regular node to a prefab asset (link).
     * Wraps scene facade `linkPrefab(nodeUuid, assetUuid)`.
     */
    async linkPrefab(nodeUuid, assetUuid) {
        var _a;
        const prefabMgr = getPrefabFacade();
        if (!prefabMgr.ok) {
            return { success: false, error: prefabMgr.error };
        }
        try {
            const result = await prefabMgr.value.linkPrefab(nodeUuid, assetUuid);
            return { success: true, data: { linked: result, nodeUuid, assetUuid } };
        }
        catch (error) {
            return { success: false, error: (_a = error === null || error === void 0 ? void 0 : error.message) !== null && _a !== void 0 ? _a : String(error) };
        }
    },
    /**
     * Break the prefab connection on a node.
     * Wraps scene facade `unlinkPrefab(nodeUuid, removeNested)`.
     */
    async unlinkPrefab(nodeUuid, removeNested) {
        var _a;
        const prefabMgr = getPrefabFacade();
        if (!prefabMgr.ok) {
            return { success: false, error: prefabMgr.error };
        }
        try {
            const result = await prefabMgr.value.unlinkPrefab(nodeUuid, removeNested);
            return { success: true, data: { unlinked: result, nodeUuid, removeNested } };
        }
        catch (error) {
            return { success: false, error: (_a = error === null || error === void 0 ? void 0 : error.message) !== null && _a !== void 0 ? _a : String(error) };
        }
    },
    /**
     * Read the prefab dump for a prefab instance node.
     * Wraps scene facade `getPrefabData(nodeUuid)`.
     */
    getPrefabData(nodeUuid) {
        var _a;
        const prefabMgr = getPrefabFacade();
        if (!prefabMgr.ok) {
            return { success: false, error: prefabMgr.error };
        }
        try {
            const data = prefabMgr.value.getPrefabData(nodeUuid);
            return { success: true, data };
        }
        catch (error) {
            return { success: false, error: (_a = error === null || error === void 0 ? void 0 : error.message) !== null && _a !== void 0 ? _a : String(error) };
        }
    },
    /**
     * Append a cc.EventHandler entry to a component's event array
     * (e.g. cc.Button.clickEvents, cc.Toggle.checkEvents).
     *
     * Sets both `component` and `_componentName` because cocos-engine
     * issue #16517 reports that runtime-pushed EventHandlers don't
     * dispatch unless `_componentName` is populated on 3.8.x.
     *
     * Persistence note (CLAUDE.md Landmine #11): scene-script `arr.push`
     * only mutates the runtime cc.Component instance; the editor's
     * serialization model (what `save-scene` writes to disk) does not see
     * the change. After mutating, we issue a no-op `set-property` on
     * `enabled` with its current value to nudge the editor to re-pull
     * the component dump from runtime, which makes the array change
     * visible to `save-scene`.
     */
    async addEventHandler(nodeUuid, componentType, eventArrayProperty, targetUuid, componentName, handler, customEventData) {
        var _a;
        try {
            const cc = require('cc');
            const ctx = resolveComponentContext(nodeUuid, componentType);
            if (!ctx.ok) {
                return { success: false, error: ctx.error };
            }
            const targetNode = findNodeByUuidDeep(ctx.scene, targetUuid);
            if (!targetNode) {
                return { success: false, error: `Target node with UUID ${targetUuid} not found` };
            }
            const arr = ctx.component[eventArrayProperty];
            if (!Array.isArray(arr)) {
                return { success: false, error: `Property '${eventArrayProperty}' on ${componentType} is not an array (got ${typeof arr})` };
            }
            const eh = new cc.EventHandler();
            eh.target = targetNode;
            eh.component = componentName;
            // Workaround for cocos-engine#16517: dispatcher reads
            // _componentName, not component, in 3.8.x runtime path.
            eh._componentName = componentName;
            eh.handler = handler;
            eh.customEventData = customEventData !== null && customEventData !== void 0 ? customEventData : '';
            arr.push(eh);
            Editor.Message.send('scene', 'snapshot');
            await nudgeComponentSerializationModel(ctx.component);
            return {
                success: true,
                data: {
                    index: arr.length - 1,
                    count: arr.length,
                },
            };
        }
        catch (error) {
            return { success: false, error: (_a = error === null || error === void 0 ? void 0 : error.message) !== null && _a !== void 0 ? _a : String(error) };
        }
    },
    /**
     * Remove a cc.EventHandler entry by index, or by matching
     * (targetUuid, handler) pair. If both are provided, index wins.
     *
     * See addEventHandler for the persistence note explaining the
     * `nudgeComponentSerializationModel` follow-up.
     */
    async removeEventHandler(nodeUuid, componentType, eventArrayProperty, index, targetUuid, handler) {
        var _a;
        try {
            const ctx = resolveComponentContext(nodeUuid, componentType);
            if (!ctx.ok) {
                return { success: false, error: ctx.error };
            }
            const arr = ctx.component[eventArrayProperty];
            if (!Array.isArray(arr)) {
                return { success: false, error: `Property '${eventArrayProperty}' on ${componentType} is not an array` };
            }
            let removeAt = -1;
            if (typeof index === 'number' && index >= 0) {
                removeAt = index;
            }
            else if (targetUuid || handler) {
                removeAt = arr.findIndex((eh) => {
                    var _a;
                    const ehTargetUuid = (_a = eh === null || eh === void 0 ? void 0 : eh.target) === null || _a === void 0 ? void 0 : _a.uuid;
                    const matchesTarget = !targetUuid || ehTargetUuid === targetUuid;
                    const matchesHandler = !handler || (eh === null || eh === void 0 ? void 0 : eh.handler) === handler;
                    return matchesTarget && matchesHandler;
                });
            }
            if (removeAt < 0 || removeAt >= arr.length) {
                return { success: false, error: 'No matching event handler to remove' };
            }
            const removed = arr.splice(removeAt, 1)[0];
            Editor.Message.send('scene', 'snapshot');
            await nudgeComponentSerializationModel(ctx.component);
            return {
                success: true,
                data: {
                    index: removeAt,
                    remaining: arr.length,
                    removed: serializeEventHandler(removed),
                },
            };
        }
        catch (error) {
            return { success: false, error: (_a = error === null || error === void 0 ? void 0 : error.message) !== null && _a !== void 0 ? _a : String(error) };
        }
    },
    /**
     * Inspect a component's EventHandler array (read-only).
     */
    listEventHandlers(nodeUuid, componentType, eventArrayProperty) {
        var _a;
        try {
            const ctx = resolveComponentContext(nodeUuid, componentType);
            if (!ctx.ok) {
                return { success: false, error: ctx.error };
            }
            const arr = ctx.component[eventArrayProperty];
            if (!Array.isArray(arr)) {
                return { success: false, error: `Property '${eventArrayProperty}' on ${componentType} is not an array` };
            }
            return {
                success: true,
                data: {
                    count: arr.length,
                    handlers: arr.map(serializeEventHandler),
                },
            };
        }
        catch (error) {
            return { success: false, error: (_a = error === null || error === void 0 ? void 0 : error.message) !== null && _a !== void 0 ? _a : String(error) };
        }
    },
    /**
     * Set component property
     */
    setComponentProperty(nodeUuid, componentType, property, value) {
        try {
            const { director, js } = require('cc');
            const scene = director.getScene();
            if (!scene) {
                return { success: false, error: 'No active scene' };
            }
            const node = scene.getChildByUuid(nodeUuid);
            if (!node) {
                return { success: false, error: `Node with UUID ${nodeUuid} not found` };
            }
            const ComponentClass = js.getClassByName(componentType);
            if (!ComponentClass) {
                return { success: false, error: `Component type ${componentType} not found` };
            }
            const component = node.getComponent(ComponentClass);
            if (!component) {
                return { success: false, error: `Component ${componentType} not found on node` };
            }
            // 针对常见属性做特殊处理
            if (property === 'spriteFrame' && componentType === 'cc.Sprite') {
                // 支持 value 为 uuid 或资源路径
                if (typeof value === 'string') {
                    // 先尝试按 uuid 查找
                    const assetManager = require('cc').assetManager;
                    assetManager.resources.load(value, require('cc').SpriteFrame, (err, spriteFrame) => {
                        if (!err && spriteFrame) {
                            component.spriteFrame = spriteFrame;
                        }
                        else {
                            // 尝试通过 uuid 加载
                            assetManager.loadAny({ uuid: value }, (err2, asset) => {
                                if (!err2 && asset) {
                                    component.spriteFrame = asset;
                                }
                                else {
                                    // 直接赋值（兼容已传入资源对象）
                                    component.spriteFrame = value;
                                }
                            });
                        }
                    });
                }
                else {
                    component.spriteFrame = value;
                }
            }
            else if (property === 'material' && (componentType === 'cc.Sprite' || componentType === 'cc.MeshRenderer')) {
                // 支持 value 为 uuid 或资源路径
                if (typeof value === 'string') {
                    const assetManager = require('cc').assetManager;
                    assetManager.resources.load(value, require('cc').Material, (err, material) => {
                        if (!err && material) {
                            component.material = material;
                        }
                        else {
                            assetManager.loadAny({ uuid: value }, (err2, asset) => {
                                if (!err2 && asset) {
                                    component.material = asset;
                                }
                                else {
                                    component.material = value;
                                }
                            });
                        }
                    });
                }
                else {
                    component.material = value;
                }
            }
            else if (property === 'string' && (componentType === 'cc.Label' || componentType === 'cc.RichText')) {
                component.string = value;
            }
            else {
                component[property] = value;
            }
            // 可选：刷新 Inspector
            // Editor.Message.send('scene', 'snapshot');
            return { success: true, message: `Component property '${property}' updated successfully` };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    }
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NlbmUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zb3VyY2Uvc2NlbmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsK0JBQTRCO0FBQzVCLE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUEsV0FBSSxFQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLGNBQWMsQ0FBQyxDQUFDLENBQUM7QUFxQnpELFNBQVMsZUFBZTs7SUFDcEIsSUFBSSxPQUFPLEdBQUcsS0FBSyxXQUFXLElBQUksR0FBRyxLQUFLLElBQUksRUFBRSxDQUFDO1FBQzdDLE9BQU8sRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSw2RUFBNkUsRUFBRSxDQUFDO0lBQy9HLENBQUM7SUFDRCxNQUFNLFVBQVUsR0FBb0M7UUFDaEQsR0FBRyxDQUFDLE1BQU07UUFDVixNQUFBLEdBQUcsQ0FBQyxrQkFBa0IsMENBQUUsUUFBUTtRQUNoQyxHQUFHLENBQUMsa0JBQThDO0tBQ3JELENBQUM7SUFDRixnRUFBZ0U7SUFDaEUsK0RBQStEO0lBQy9ELE1BQU0sUUFBUSxHQUE4QixDQUFDLGNBQWMsRUFBRSxhQUFhLEVBQUUsWUFBWSxFQUFFLGNBQWMsRUFBRSxlQUFlLENBQUMsQ0FBQztJQUMzSCxLQUFLLE1BQU0sU0FBUyxJQUFJLFVBQVUsRUFBRSxDQUFDO1FBQ2pDLElBQUksU0FBUyxJQUFJLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxPQUFRLFNBQWlCLENBQUMsQ0FBQyxDQUFDLEtBQUssVUFBVSxDQUFDLEVBQUUsQ0FBQztZQUNoRixPQUFPLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLENBQUM7UUFDMUMsQ0FBQztJQUNMLENBQUM7SUFDRCxPQUFPO1FBQ0gsRUFBRSxFQUFFLEtBQUs7UUFDVCxLQUFLLEVBQUUseUtBQXlLO0tBQ25MLENBQUM7QUFDTixDQUFD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b250ZW50IjpbImltcG9ydCB7IGpvaW4gfSBmcm9tICdwYXRoJztcbm1vZHVsZS5wYXRocy5wdXNoKGpvaW4oRWRpdG9yLkFwcC5wYXRoLCAnbm9kZV9tb2R1bGVzJykpO1xuXG4vLyBgY2NlYCBpcyBpbmplY3RlZCBieSBDb2NvcyBFZGl0b3IgaW50byB0aGUgc2NlbmUtc2NyaXB0IGdsb2JhbCBzY29wZS5cbi8vIEl0IGlzIG5vdCBkZWNsYXJlZCBpbiBgQGNvY29zL2NyZWF0b3ItdHlwZXNgIGV4cG9ydHM7IGRlY2xhcmUgYSBtaW5pbWFsXG4vLyBydW50aW1lIHNoYXBlIGp1c3QgZm9yIHdoYXQgd2UgdG91Y2ggaGVyZSBzbyBUeXBlU2NyaXB0IHN0YXlzIHN0cmljdC5cbmRlY2xhcmUgY29uc3QgY2NlOiB1bmRlZmluZWQgfCB7XG4gICAgUHJlZmFiPzogUHJlZmFiRmFjYWRlO1xuICAgIFNjZW5lRmFjYWRlTWFuYWdlcj86IHsgaW5zdGFuY2U/OiBQcmVmYWJGYWNhZGUgfSAmIFByZWZhYkZhY2FkZTtcbn07XG5cbmludGVyZmFjZSBQcmVmYWJGYWNhZGUge1xuICAgIGNyZWF0ZVByZWZhYihub2RlVXVpZDogc3RyaW5nLCB1cmw6IHN0cmluZyk6IFByb21pc2U8YW55PjtcbiAgICBhcHBseVByZWZhYihub2RlVXVpZDogc3RyaW5nKTogUHJvbWlzZTxhbnk+O1xuICAgIGxpbmtQcmVmYWIobm9kZVV1aWQ6IHN0cmluZywgYXNzZXRVdWlkOiBzdHJpbmcpOiBhbnk7XG4gICAgdW5saW5rUHJlZmFiKG5vZGVVdWlkOiBzdHJpbmcsIHJlbW92ZU5lc3RlZDogYm9vbGVhbik6IGFueTtcbiAgICBnZXRQcmVmYWJEYXRhKG5vZGVVdWlkOiBzdHJpbmcpOiBhbnk7XG4gICAgcmVzdG9yZVByZWZhYj8odXVpZDogc3RyaW5nLCBhc3NldFV1aWQ6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj47XG59XG5cbnR5cGUgRmFjYWRlTG9va3VwID0geyBvazogdHJ1ZTsgdmFsdWU6IFByZWZhYkZhY2FkZSB9IHwgeyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmcgfTtcblxuZnVuY3Rpb24gZ2V0UHJlZmFiRmFjYWRlKCk6IEZhY2FkZUxvb2t1cCB7XG4gICAgaWYgKHR5cGVvZiBjY2UgPT09ICd1bmRlZmluZWQnIHx8IGNjZSA9PT0gbnVsbCkge1xuICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiAnY2NlIGdsb2JhbCBpcyBub3QgYXZhaWxhYmxlOyB0aGlzIG1ldGhvZCBtdXN0IHJ1biBpbiBhIHNjZW5lLXNjcmlwdCBjb250ZXh0JyB9O1xuICAgIH1cbiAgICBjb25zdCBjYW5kaWRhdGVzOiBBcnJheTxQcmVmYWJGYWNhZGUgfCB1bmRlZmluZWQ+ID0gW1xuICAgICAgICBjY2UuUHJlZmFiLFxuICAgICAgICBjY2UuU2NlbmVGYWNhZGVNYW5hZ2VyPy5pbnN0YW5jZSxcbiAgICAgICAgY2NlLlNjZW5lRmFjYWRlTWFuYWdlciBhcyBQcmVmYWJGYWNhZGUgfCB1bmRlZmluZWQsXG4gICAgXTtcbiAgICAvLyBFbnN1cmUgdGhlIGNhbmRpZGF0ZSBleHBvc2VzIGV2ZXJ5IGZhY2FkZSBtZXRob2Qgd2UgbWF5IGNhbGw7XG4gICAgLy8gYSBwYXJ0aWFsIGNhbmRpZGF0ZSB3b3VsZCBjcmFzaCBhdCB0aGUgZmlyc3QgbWlzc2luZyBtZXRob2QuXG4gICAgY29uc3QgcmVxdWlyZWQ6IEFycmF5PGtleW9mIFByZWZhYkZhY2FkZT4gPSBbJ2NyZWF0ZVByZWZhYicsICdhcHBseVByZWZhYicsICdsaW5rUHJlZmFiJywgJ3VubGlua1ByZWZhYicsICdnZXRQcmVmYWJEYXRhJ107XG4gICAgZm9yIChjb25zdCBjYW5kaWRhdGUgb2YgY2FuZGlkYXRlcykge1xuICAgICAgICBpZiAoY2FuZGlkYXRlICYmIHJlcXVpcmVkLmV2ZXJ5KG0gPT4gdHlwZW9mIChjYW5kaWRhdGUgYXMgYW55KVttXSA9PT0gJ2Z1bmN0aW9uJykpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiB0cnVlLCB2YWx1ZTogY2FuZGlkYXRlIH07XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgICAgb2s6IGZhbHNlLFxuICAgICAgICBlcnJvcjogJ05vIGNvbXBsZXRlIHByZWZhYiBmYWNhZGUgZm91bmQgb24gY2NlIChjY2UuUHJlZmFiIC8gY2NlLlNjZW5lRmFjYWRlTWFuYWdlcikuIENvY29zIGVkaXRvciBidWlsZCBtYXkgbm90IGV4cG9zZSB0aGUgZXhwZWN0ZWQgbWFuYWdlciBvciBvbmx5IGV4cG9zZXMgYSBwYXJ0aWFsIHN1cmZhY2UuJyxcbiAgICB9O1xufVxuXG50eXBlIENvbXBvbmVudExvb2t1cCA9XG4gICAgfCB7IG9rOiB0cnVlOyBzY2VuZTogYW55OyBub2RlOiBhbnk7IGNvbXBvbmVudDogYW55IH1cbiAgICB8IHsgb2s6IGZhbHNlOyBlcnJvcjogc3RyaW5nIH07XG5cbmZ1bmN0aW9uIGZpbmROb2RlQnlVdWlkRGVlcChyb290OiBhbnksIHV1aWQ6IHN0cmluZyk6IGFueSB7XG4gICAgaWYgKCFyb290KSByZXR1cm4gbnVsbDtcbiAgICBpZiAocm9vdC5faWQgPT09IHV1aWQgfHwgcm9vdC51dWlkID09PSB1dWlkKSByZXR1cm4gcm9vdDtcbiAgICBjb25zdCBjaGlsZHJlbiA9IHJvb3QuY2hpbGRyZW4gPz8gcm9vdC5fY2hpbGRyZW4gPz8gW107XG4gICAgZm9yIChjb25zdCBjaGlsZCBvZiBjaGlsZHJlbikge1xuICAgICAgICBjb25zdCBoaXQgPSBmaW5kTm9kZUJ5VXVpZERlZXAoY2hpbGQsIHV1aWQpO1xuICAgICAgICBpZiAoaGl0KSByZXR1cm4gaGl0O1xuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gcmVzb2x2ZUNvbXBvbmVudENvbnRleHQobm9kZVV1aWQ6IHN0cmluZywgY29tcG9uZW50VHlwZTogc3RyaW5nKTogQ29tcG9uZW50TG9va3VwIHtcbiAgICBjb25zdCB7IGRpcmVjdG9yLCBqcyB9ID0gcmVxdWlyZSgnY2MnKTtcbiAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgaWYgKCFzY2VuZSkge1xuICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiAnTm8gYWN0aXZlIHNjZW5lJyB9O1xuICAgIH1cbiAgICAvLyBzY2VuZS5nZXRDaGlsZEJ5VXVpZCBvbmx5IHdhbGtzIGRpcmVjdCBjaGlsZHJlbjsgdXNlIGRlcHRoLWZpcnN0IHNlYXJjaC5cbiAgICBjb25zdCBub2RlID0gZmluZE5vZGVCeVV1aWREZWVwKHNjZW5lLCBub2RlVXVpZCk7XG4gICAgaWYgKCFub2RlKSB7XG4gICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGBOb2RlIHdpdGggVVVJRCAke25vZGVVdWlkfSBub3QgZm91bmRgIH07XG4gICAgfVxuICAgIGNvbnN0IENvbXBvbmVudENsYXNzID0ganMuZ2V0Q2xhc3NCeU5hbWUoY29tcG9uZW50VHlwZSk7XG4gICAgaWYgKCFDb21wb25lbnRDbGFzcykge1xuICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBgQ29tcG9uZW50IHR5cGUgJHtjb21wb25lbnRUeXBlfSBub3QgZm91bmRgIH07XG4gICAgfVxuICAgIGNvbnN0IGNvbXBvbmVudCA9IG5vZGUuZ2V0Q29tcG9uZW50KENvbXBvbmVudENsYXNzKTtcbiAgICBpZiAoIWNvbXBvbmVudCkge1xuICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBgQ29tcG9uZW50ICR7Y29tcG9uZW50VHlwZX0gbm90IGZvdW5kIG9uIG5vZGVgIH07XG4gICAgfVxuICAgIHJldHVybiB7IG9rOiB0cnVlLCBzY2VuZSwgbm9kZSwgY29tcG9uZW50IH07XG59XG5cbi8qKlxuICogTnVkZ2UgdGhlIGVkaXRvcidzIHNlcmlhbGl6YXRpb24gbW9kZWwgdG8gcmUtcHVsbCB0aGUgY29tcG9uZW50IGR1bXBcbiAqIGZyb20gcnVudGltZS4gV2l0aG91dCB0aGlzLCBzY2VuZS1zY3JpcHQgbXV0YXRpb25zIHRvIGEgY29tcG9uZW50J3NcbiAqIGludGVybmFsIHN0YXRlIChlLmcuIGBjYy5CdXR0b24uY2xpY2tFdmVudHMucHVzaChlaClgKSBuZXZlciByZWFjaCB0aGVcbiAqIG1vZGVsIHRoYXQgYHNhdmUtc2NlbmVgIHdyaXRlcyB0byBkaXNrIOKAlCBzZWUgQ0xBVURFLm1kIExhbmRtaW5lICMxMS5cbiAqXG4gKiBUaGUgdHJpY2s6IGFueSBgc2V0LXByb3BlcnR5YCBjYWxsIHRvIHRoZSBjb21wb25lbnQgdHJpZ2dlcnMgdGhlXG4gKiBtb2RlbCB0byByZS1zeW5jLiBXZSBwaWNrIGBlbmFibGVkYCAoZGVmaW5lZCBvbiBldmVyeSBjYy5Db21wb25lbnQpXG4gKiBhbmQgd3JpdGUgYmFjayB0aGUgY3VycmVudCB2YWx1ZSwgd2hpY2ggaXMgYSBuby1vcCBzZW1hbnRpY2FsbHkgYnV0XG4gKiBmb3JjZXMgdGhlIHN5bmMuIEJlc3QtZWZmb3J0IOKAlCB3ZSBzd2FsbG93IGVycm9ycyBzbyB0aGUgY2FsbGVyIHN0aWxsXG4gKiBzZWVzIHRoZSBydW50aW1lIG11dGF0aW9uIGl0IGFza2VkIGZvci5cbiAqL1xuYXN5bmMgZnVuY3Rpb24gbnVkZ2VDb21wb25lbnRTZXJpYWxpemF0aW9uTW9kZWwoY29tcG9uZW50OiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICB0cnkge1xuICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdzZXQtcHJvcGVydHknLCB7XG4gICAgICAgICAgICB1dWlkOiBjb21wb25lbnQudXVpZCxcbiAgICAgICAgICAgIHBhdGg6ICdlbmFibGVkJyxcbiAgICAgICAgICAgIGR1bXA6IHsgdmFsdWU6IGNvbXBvbmVudC5lbmFibGVkICE9PSBmYWxzZSB9LFxuICAgICAgICB9KTtcbiAgICB9IGNhdGNoIHtcbiAgICAgICAgLy8gYmVzdC1lZmZvcnRcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHNlcmlhbGl6ZUV2ZW50SGFuZGxlcihlaDogYW55KSB7XG4gICAgaWYgKCFlaCkgcmV0dXJuIG51bGw7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgdGFyZ2V0VXVpZDogZWgudGFyZ2V0Py51dWlkID8/IG51bGwsXG4gICAgICAgIHRhcmdldE5hbWU6IGVoLnRhcmdldD8ubmFtZSA/PyBudWxsLFxuICAgICAgICBjb21wb25lbnQ6IGVoLmNvbXBvbmVudCA/PyBlaC5fY29tcG9uZW50TmFtZSA/PyBudWxsLFxuICAgICAgICBoYW5kbGVyOiBlaC5oYW5kbGVyID8/IG51bGwsXG4gICAgICAgIGN1c3RvbUV2ZW50RGF0YTogZWguY3VzdG9tRXZlbnREYXRhID8/ICcnLFxuICAgIH07XG59XG5cbmV4cG9ydCBjb25zdCBtZXRob2RzOiB7IFtrZXk6IHN0cmluZ106ICguLi5hbnk6IGFueSkgPT4gYW55IH0gPSB7XG4gICAgLyoqXG4gICAgICogQ3JlYXRlIGEgbmV3IHNjZW5lXG4gICAgICovXG4gICAgY3JlYXRlTmV3U2NlbmUoKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCB7IGRpcmVjdG9yLCBTY2VuZSB9ID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gbmV3IFNjZW5lKCk7XG4gICAgICAgICAgICBzY2VuZS5uYW1lID0gJ05ldyBTY2VuZSc7XG4gICAgICAgICAgICBkaXJlY3Rvci5ydW5TY2VuZShzY2VuZSk7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBtZXNzYWdlOiAnTmV3IHNjZW5lIGNyZWF0ZWQgc3VjY2Vzc2Z1bGx5JyB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycm9yLm1lc3NhZ2UgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBBZGQgY29tcG9uZW50IHRvIGEgbm9kZVxuICAgICAqL1xuICAgIGFkZENvbXBvbmVudFRvTm9kZShub2RlVXVpZDogc3RyaW5nLCBjb21wb25lbnRUeXBlOiBzdHJpbmcpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IsIGpzIH0gPSByZXF1aXJlKCdjYycpO1xuICAgICAgICAgICAgY29uc3Qgc2NlbmUgPSBkaXJlY3Rvci5nZXRTY2VuZSgpO1xuICAgICAgICAgICAgaWYgKCFzY2VuZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ05vIGFjdGl2ZSBzY2VuZScgfTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gRmluZCBub2RlIGJ5IFVVSURcbiAgICAgICAgICAgIGNvbnN0IG5vZGUgPSBzY2VuZS5nZXRDaGlsZEJ5VXVpZChub2RlVXVpZCk7XG4gICAgICAgICAgICBpZiAoIW5vZGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBOb2RlIHdpdGggVVVJRCAke25vZGVVdWlkfSBub3QgZm91bmRgIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIEdldCBjb21wb25lbnQgY2xhc3NcbiAgICAgICAgICAgIGNvbnN0IENvbXBvbmVudENsYXNzID0ganMuZ2V0Q2xhc3NCeU5hbWUoY29tcG9uZW50VHlwZSk7XG4gICAgICAgICAgICBpZiAoIUNvbXBvbmVudENsYXNzKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgQ29tcG9uZW50IHR5cGUgJHtjb21wb25lbnRUeXBlfSBub3QgZm91bmRgIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIEFkZCBjb21wb25lbnRcbiAgICAgICAgICAgIGNvbnN0IGNvbXBvbmVudCA9IG5vZGUuYWRkQ29tcG9uZW50KENvbXBvbmVudENsYXNzKTtcbiAgICAgICAgICAgIHJldHVybiB7IFxuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsIFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBDb21wb25lbnQgJHtjb21wb25lbnRUeXBlfSBhZGRlZCBzdWNjZXNzZnVsbHlgLFxuICAgICAgICAgICAgICAgIGRhdGE6IHsgY29tcG9uZW50SWQ6IGNvbXBvbmVudC51dWlkIH1cbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3IubWVzc2FnZSB9O1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFJlbW92ZSBjb21wb25lbnQgZnJvbSBhIG5vZGVcbiAgICAgKi9cbiAgICByZW1vdmVDb21wb25lbnRGcm9tTm9kZShub2RlVXVpZDogc3RyaW5nLCBjb21wb25lbnRUeXBlOiBzdHJpbmcpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IsIGpzIH0gPSByZXF1aXJlKCdjYycpO1xuICAgICAgICAgICAgY29uc3Qgc2NlbmUgPSBkaXJlY3Rvci5nZXRTY2VuZSgpO1xuICAgICAgICAgICAgaWYgKCFzY2VuZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ05vIGFjdGl2ZSBzY2VuZScgfTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3Qgbm9kZSA9IHNjZW5lLmdldENoaWxkQnlVdWlkKG5vZGVVdWlkKTtcbiAgICAgICAgICAgIGlmICghbm9kZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYE5vZGUgd2l0aCBVVUlEICR7bm9kZVV1aWR9IG5vdCBmb3VuZGAgfTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgQ29tcG9uZW50Q2xhc3MgPSBqcy5nZXRDbGFzc0J5TmFtZShjb21wb25lbnRUeXBlKTtcbiAgICAgICAgICAgIGlmICghQ29tcG9uZW50Q2xhc3MpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBDb21wb25lbnQgdHlwZSAke2NvbXBvbmVudFR5cGV9IG5vdCBmb3VuZGAgfTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgY29tcG9uZW50ID0gbm9kZS5nZXRDb21wb25lbnQoQ29tcG9uZW50Q2xhc3MpO1xuICAgICAgICAgICAgaWYgKCFjb21wb25lbnQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBDb21wb25lbnQgJHtjb21wb25lbnRUeXBlfSBub3QgZm91bmQgb24gbm9kZWAgfTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgbm9kZS5yZW1vdmVDb21wb25lbnQoY29tcG9uZW50KTtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIG1lc3NhZ2U6IGBDb21wb25lbnQgJHtjb21wb25lbnRUeXBlfSByZW1vdmVkIHN1Y2Nlc3NmdWxseWAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvci5tZXNzYWdlIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQ3JlYXRlIGEgbmV3IG5vZGVcbiAgICAgKi9cbiAgICBjcmVhdGVOb2RlKG5hbWU6IHN0cmluZywgcGFyZW50VXVpZD86IHN0cmluZykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgeyBkaXJlY3RvciwgTm9kZSB9ID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICAgICAgICAgIGlmICghc2NlbmUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdObyBhY3RpdmUgc2NlbmUnIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IG5vZGUgPSBuZXcgTm9kZShuYW1lKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgaWYgKHBhcmVudFV1aWQpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBwYXJlbnQgPSBzY2VuZS5nZXRDaGlsZEJ5VXVpZChwYXJlbnRVdWlkKTtcbiAgICAgICAgICAgICAgICBpZiAocGFyZW50KSB7XG4gICAgICAgICAgICAgICAgICAgIHBhcmVudC5hZGRDaGlsZChub2RlKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBzY2VuZS5hZGRDaGlsZChub2RlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHNjZW5lLmFkZENoaWxkKG5vZGUpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4geyBcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLCBcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiBgTm9kZSAke25hbWV9IGNyZWF0ZWQgc3VjY2Vzc2Z1bGx5YCxcbiAgICAgICAgICAgICAgICBkYXRhOiB7IHV1aWQ6IG5vZGUudXVpZCwgbmFtZTogbm9kZS5uYW1lIH1cbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3IubWVzc2FnZSB9O1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEdldCBub2RlIGluZm9ybWF0aW9uXG4gICAgICovXG4gICAgZ2V0Tm9kZUluZm8obm9kZVV1aWQ6IHN0cmluZykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgeyBkaXJlY3RvciB9ID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICAgICAgICAgIGlmICghc2NlbmUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdObyBhY3RpdmUgc2NlbmUnIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IG5vZGUgPSBzY2VuZS5nZXRDaGlsZEJ5VXVpZChub2RlVXVpZCk7XG4gICAgICAgICAgICBpZiAoIW5vZGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBOb2RlIHdpdGggVVVJRCAke25vZGVVdWlkfSBub3QgZm91bmRgIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIHV1aWQ6IG5vZGUudXVpZCxcbiAgICAgICAgICAgICAgICAgICAgbmFtZTogbm9kZS5uYW1lLFxuICAgICAgICAgICAgICAgICAgICBhY3RpdmU6IG5vZGUuYWN0aXZlLFxuICAgICAgICAgICAgICAgICAgICBwb3NpdGlvbjogbm9kZS5wb3NpdGlvbixcbiAgICAgICAgICAgICAgICAgICAgcm90YXRpb246IG5vZGUucm90YXRpb24sXG4gICAgICAgICAgICAgICAgICAgIHNjYWxlOiBub2RlLnNjYWxlLFxuICAgICAgICAgICAgICAgICAgICBwYXJlbnQ6IG5vZGUucGFyZW50Py51dWlkLFxuICAgICAgICAgICAgICAgICAgICBjaGlsZHJlbjogbm9kZS5jaGlsZHJlbi5tYXAoKGNoaWxkOiBhbnkpID0+IGNoaWxkLnV1aWQpLFxuICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRzOiBub2RlLmNvbXBvbmVudHMubWFwKChjb21wOiBhbnkpID0+ICh7XG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiBjb21wLmNvbnN0cnVjdG9yLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBlbmFibGVkOiBjb21wLmVuYWJsZWRcbiAgICAgICAgICAgICAgICAgICAgfSkpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvci5tZXNzYWdlIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogR2V0IGFsbCBub2RlcyBpbiBzY2VuZVxuICAgICAqL1xuICAgIGdldEFsbE5vZGVzKCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgeyBkaXJlY3RvciB9ID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICAgICAgICAgIGlmICghc2NlbmUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdObyBhY3RpdmUgc2NlbmUnIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IG5vZGVzOiBhbnlbXSA9IFtdO1xuICAgICAgICAgICAgY29uc3QgY29sbGVjdE5vZGVzID0gKG5vZGU6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIG5vZGVzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICB1dWlkOiBub2RlLnV1aWQsXG4gICAgICAgICAgICAgICAgICAgIG5hbWU6IG5vZGUubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgYWN0aXZlOiBub2RlLmFjdGl2ZSxcbiAgICAgICAgICAgICAgICAgICAgcGFyZW50OiBub2RlLnBhcmVudD8udXVpZFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIG5vZGUuY2hpbGRyZW4uZm9yRWFjaCgoY2hpbGQ6IGFueSkgPT4gY29sbGVjdE5vZGVzKGNoaWxkKSk7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBzY2VuZS5jaGlsZHJlbi5mb3JFYWNoKChjaGlsZDogYW55KSA9PiBjb2xsZWN0Tm9kZXMoY2hpbGQpKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogbm9kZXMgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvci5tZXNzYWdlIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogRmluZCBub2RlIGJ5IG5hbWVcbiAgICAgKi9cbiAgICBmaW5kTm9kZUJ5TmFtZShuYW1lOiBzdHJpbmcpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IgfSA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgICAgICBpZiAoIXNjZW5lKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnTm8gYWN0aXZlIHNjZW5lJyB9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBub2RlID0gc2NlbmUuZ2V0Q2hpbGRCeU5hbWUobmFtZSk7XG4gICAgICAgICAgICBpZiAoIW5vZGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBOb2RlIHdpdGggbmFtZSAke25hbWV9IG5vdCBmb3VuZGAgfTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgdXVpZDogbm9kZS51dWlkLFxuICAgICAgICAgICAgICAgICAgICBuYW1lOiBub2RlLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgIGFjdGl2ZTogbm9kZS5hY3RpdmUsXG4gICAgICAgICAgICAgICAgICAgIHBvc2l0aW9uOiBub2RlLnBvc2l0aW9uXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvci5tZXNzYWdlIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogR2V0IGN1cnJlbnQgc2NlbmUgaW5mb3JtYXRpb25cbiAgICAgKi9cbiAgICBnZXRDdXJyZW50U2NlbmVJbmZvKCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgeyBkaXJlY3RvciB9ID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICAgICAgICAgIGlmICghc2NlbmUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdObyBhY3RpdmUgc2NlbmUnIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIG5hbWU6IHNjZW5lLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgIHV1aWQ6IHNjZW5lLnV1aWQsXG4gICAgICAgICAgICAgICAgICAgIG5vZGVDb3VudDogc2NlbmUuY2hpbGRyZW4ubGVuZ3RoXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvci5tZXNzYWdlIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogU2V0IG5vZGUgcHJvcGVydHlcbiAgICAgKi9cbiAgICBzZXROb2RlUHJvcGVydHkobm9kZVV1aWQ6IHN0cmluZywgcHJvcGVydHk6IHN0cmluZywgdmFsdWU6IGFueSkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgeyBkaXJlY3RvciB9ID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICAgICAgICAgIGlmICghc2NlbmUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdObyBhY3RpdmUgc2NlbmUnIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IG5vZGUgPSBzY2VuZS5nZXRDaGlsZEJ5VXVpZChub2RlVXVpZCk7XG4gICAgICAgICAgICBpZiAoIW5vZGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBOb2RlIHdpdGggVVVJRCAke25vZGVVdWlkfSBub3QgZm91bmRgIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIOiuvue9ruWxnuaAp1xuICAgICAgICAgICAgaWYgKHByb3BlcnR5ID09PSAncG9zaXRpb24nKSB7XG4gICAgICAgICAgICAgICAgbm9kZS5zZXRQb3NpdGlvbih2YWx1ZS54IHx8IDAsIHZhbHVlLnkgfHwgMCwgdmFsdWUueiB8fCAwKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHkgPT09ICdyb3RhdGlvbicpIHtcbiAgICAgICAgICAgICAgICBub2RlLnNldFJvdGF0aW9uRnJvbUV1bGVyKHZhbHVlLnggfHwgMCwgdmFsdWUueSB8fCAwLCB2YWx1ZS56IHx8IDApO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eSA9PT0gJ3NjYWxlJykge1xuICAgICAgICAgICAgICAgIG5vZGUuc2V0U2NhbGUodmFsdWUueCB8fCAxLCB2YWx1ZS55IHx8IDEsIHZhbHVlLnogfHwgMSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5ID09PSAnYWN0aXZlJykge1xuICAgICAgICAgICAgICAgIG5vZGUuYWN0aXZlID0gdmFsdWU7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5ID09PSAnbmFtZScpIHtcbiAgICAgICAgICAgICAgICBub2RlLm5hbWUgPSB2YWx1ZTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8g5bCd6K+V55u05o6l6K6+572u5bGe5oCnXG4gICAgICAgICAgICAgICAgKG5vZGUgYXMgYW55KVtwcm9wZXJ0eV0gPSB2YWx1ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHsgXG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSwgXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogYFByb3BlcnR5ICcke3Byb3BlcnR5fScgdXBkYXRlZCBzdWNjZXNzZnVsbHlgIFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvci5tZXNzYWdlIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogR2V0IHNjZW5lIGhpZXJhcmNoeVxuICAgICAqL1xuICAgIGdldFNjZW5lSGllcmFyY2h5KGluY2x1ZGVDb21wb25lbnRzOiBib29sZWFuID0gZmFsc2UpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IgfSA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgICAgICBpZiAoIXNjZW5lKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnTm8gYWN0aXZlIHNjZW5lJyB9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBwcm9jZXNzTm9kZSA9IChub2RlOiBhbnkpOiBhbnkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdDogYW55ID0ge1xuICAgICAgICAgICAgICAgICAgICBuYW1lOiBub2RlLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgIHV1aWQ6IG5vZGUudXVpZCxcbiAgICAgICAgICAgICAgICAgICAgYWN0aXZlOiBub2RlLmFjdGl2ZSxcbiAgICAgICAgICAgICAgICAgICAgY2hpbGRyZW46IFtdXG4gICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgIGlmIChpbmNsdWRlQ29tcG9uZW50cykge1xuICAgICAgICAgICAgICAgICAgICByZXN1bHQuY29tcG9uZW50cyA9IG5vZGUuY29tcG9uZW50cy5tYXAoKGNvbXA6IGFueSkgPT4gKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6IGNvbXAuY29uc3RydWN0b3IubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGVuYWJsZWQ6IGNvbXAuZW5hYmxlZFxuICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKG5vZGUuY2hpbGRyZW4gJiYgbm9kZS5jaGlsZHJlbi5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdC5jaGlsZHJlbiA9IG5vZGUuY2hpbGRyZW4ubWFwKChjaGlsZDogYW55KSA9PiBwcm9jZXNzTm9kZShjaGlsZCkpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBjb25zdCBoaWVyYXJjaHkgPSBzY2VuZS5jaGlsZHJlbi5tYXAoKGNoaWxkOiBhbnkpID0+IHByb2Nlc3NOb2RlKGNoaWxkKSk7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBkYXRhOiBoaWVyYXJjaHkgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvci5tZXNzYWdlIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQ3JlYXRlIHByZWZhYiBhc3NldCBmcm9tIGEgbm9kZSB2aWEgdGhlIG9mZmljaWFsIHNjZW5lIGZhY2FkZS5cbiAgICAgKlxuICAgICAqIFJvdXRlcyB0aHJvdWdoIGBjY2UuUHJlZmFiLmNyZWF0ZVByZWZhYmAgKHRoZSBDb2NvcyBlZGl0b3IgcHJlZmFiXG4gICAgICogbWFuYWdlciBleHBvc2VkIGluIHNjZW5lLXNjcmlwdCBjb250ZXh0KS4gVGhlIHVybCBhY2NlcHRzIGJvdGhcbiAgICAgKiBgZGI6Ly9hc3NldHMvLi4uYCBhbmQgYWJzb2x1dGUgZmlsZXN5c3RlbSBwYXRocyBpbiBkaWZmZXJlbnQgZWRpdG9yXG4gICAgICogYnVpbGRzLCBzbyB3ZSB0cnkgYm90aCBzaGFwZXMgYW5kIHN1cmZhY2Ugd2hpY2hldmVyIGZhaWxzLlxuICAgICAqL1xuICAgIGFzeW5jIGNyZWF0ZVByZWZhYkZyb21Ob2RlKG5vZGVVdWlkOiBzdHJpbmcsIHVybDogc3RyaW5nKSB7XG4gICAgICAgIGNvbnN0IHByZWZhYk1nciA9IGdldFByZWZhYkZhY2FkZSgpO1xuICAgICAgICBpZiAoIXByZWZhYk1nci5vaykge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBwcmVmYWJNZ3IuZXJyb3IgfTtcbiAgICAgICAgfVxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgdHJpZXM6IHN0cmluZ1tdID0gW107XG4gICAgICAgICAgICAvLyBQcmVmZXIgZGI6Ly8gZm9ybSAobWF0Y2hlcyBhc3NldC1kYiBxdWVyeSByZXN1bHRzKSBhbmQgZmFsbFxuICAgICAgICAgICAgLy8gYmFjayB0byB3aGF0ZXZlciB0aGUgY2FsbGVyIHBhc3NlZCB2ZXJiYXRpbS5cbiAgICAgICAgICAgIGNvbnN0IGRiVXJsID0gdXJsLnN0YXJ0c1dpdGgoJ2RiOi8vJykgPyB1cmwgOiBgZGI6Ly9hc3NldHMvJHt1cmwucmVwbGFjZSgvXlxcLysvLCAnJyl9YDtcbiAgICAgICAgICAgIHRyaWVzLnB1c2goZGJVcmwpO1xuICAgICAgICAgICAgaWYgKGRiVXJsICE9PSB1cmwpIHtcbiAgICAgICAgICAgICAgICB0cmllcy5wdXNoKHVybCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IGVycm9yczogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIHRyaWVzKSB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgcHJlZmFiTWdyLnZhbHVlLmNyZWF0ZVByZWZhYihub2RlVXVpZCwgY2FuZGlkYXRlKTtcbiAgICAgICAgICAgICAgICAgICAgLy8gY2NlLlByZWZhYi5jcmVhdGVQcmVmYWIgcmVwdXJwb3NlcyB0aGUgc291cmNlIG5vZGUgaW50byBhXG4gICAgICAgICAgICAgICAgICAgIC8vIHByZWZhYiBpbnN0YW5jZSB3aXRoIGEgZnJlc2ggVVVJRCwgc28gdGhlIGNhbGxlci1zdXBwbGllZFxuICAgICAgICAgICAgICAgICAgICAvLyBub2RlVXVpZCBpcyBubyBsb25nZXIgdmFsaWQuIFJlc29sdmUgdGhlIG5ldyBVVUlEIGJ5XG4gICAgICAgICAgICAgICAgICAgIC8vIHF1ZXJ5aW5nIG5vZGVzIHRoYXQgcmVmZXJlbmNlIHRoZSBmcmVzaGx5IG1pbnRlZCBhc3NldC5cbiAgICAgICAgICAgICAgICAgICAgbGV0IGFzc2V0VXVpZDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgcmVzdWx0ID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXNzZXRVdWlkID0gcmVzdWx0O1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHJlc3VsdCAmJiB0eXBlb2YgcmVzdWx0ID09PSAnb2JqZWN0JyAmJiB0eXBlb2YgKHJlc3VsdCBhcyBhbnkpLnV1aWQgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhc3NldFV1aWQgPSAocmVzdWx0IGFzIGFueSkudXVpZDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBsZXQgaW5zdGFuY2VOb2RlVXVpZDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgIGlmIChhc3NldFV1aWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgaW5zdGFuY2VzOiBhbnkgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1ub2Rlcy1ieS1hc3NldC11dWlkJywgYXNzZXRVdWlkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShpbnN0YW5jZXMpICYmIGluc3RhbmNlcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIE5ld2x5LWNyZWF0ZWQgcHJlZmFiIGluc3RhbmNlIGlzIHR5cGljYWxseSB0aGVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gbGFzdCBlbnRyeS4gQ2F2ZWF0OiBpZiB0aGUgc2FtZSBhc3NldCBhbHJlYWR5XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGhhZCBpbnN0YW5jZXMgaW4gdGhlIHNjZW5lLCBcImxhc3RcIiBwaWNrcyBvbmVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gb2YgdGhlbSByYXRoZXIgdGhhbiB0aGUgbmV3IG9uZS4gVGhlIGVkaXRvclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBhcHBlYXJzIHRvIHJldHVybiBjcmVhdGlvbiBvcmRlciwgYnV0IHRoZSBBUElcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gaXMgdW5kb2N1bWVudGVkOyBjYWxsZXJzIHJlcXVpcmluZyBzdHJpY3RcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gaWRlbnRpZmljYXRpb24gc2hvdWxkIHNuYXBzaG90IGJlZm9yZSBjYWxsaW5nLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbnN0YW5jZU5vZGVVdWlkID0gaW5zdGFuY2VzW2luc3RhbmNlcy5sZW5ndGggLSAxXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBOb24tZmF0YWw6IHRoZSBhc3NldCB3YXMgY3JlYXRlZCBlaXRoZXIgd2F5LlxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHVybDogY2FuZGlkYXRlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNvdXJjZU5vZGVVdWlkOiBub2RlVXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcmVmYWJBc3NldFV1aWQ6IGFzc2V0VXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbnN0YW5jZU5vZGVVdWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJhdzogcmVzdWx0LFxuICAgICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgICAgICAgICBlcnJvcnMucHVzaChgJHtjYW5kaWRhdGV9OiAke2Vycj8ubWVzc2FnZSA/PyBlcnJ9YCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBlcnJvcjogYGNjZS5QcmVmYWIuY3JlYXRlUHJlZmFiIGZhaWxlZDogJHtlcnJvcnMuam9pbignOyAnKX1gLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvcj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyb3IpIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogUHVzaCBwcmVmYWIgaW5zdGFuY2UgZWRpdHMgYmFjayB0byB0aGUgcHJlZmFiIGFzc2V0LlxuICAgICAqIFdyYXBzIHNjZW5lIGZhY2FkZSBgYXBwbHlQcmVmYWIobm9kZVV1aWQpYC5cbiAgICAgKi9cbiAgICBhc3luYyBhcHBseVByZWZhYihub2RlVXVpZDogc3RyaW5nKSB7XG4gICAgICAgIGNvbnN0IHByZWZhYk1nciA9IGdldFByZWZhYkZhY2FkZSgpO1xuICAgICAgICBpZiAoIXByZWZhYk1nci5vaykge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBwcmVmYWJNZ3IuZXJyb3IgfTtcbiAgICAgICAgfVxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gTm90ZTogZmFjYWRlUmV0dXJuIGZyb20gY2NlLlNjZW5lRmFjYWRlLmFwcGx5UHJlZmFiIGlzIG9ic2VydmVkXG4gICAgICAgICAgICAvLyB0byBiZSBgZmFsc2VgIGV2ZW4gd2hlbiB0aGUgYXBwbHkgZ2VudWluZWx5IHdyaXRlcyB0byBkaXNrXG4gICAgICAgICAgICAvLyAodmVyaWZpZWQgZHVyaW5nIFA0IHYyLjEuMCByZWFsLWVkaXRvciB0ZXN0aW5nKS4gVHJlYXRcbiAgICAgICAgICAgIC8vIFwibm8gZXhjZXB0aW9uIHRocm93blwiIGFzIHN1Y2Nlc3MgYW5kIHN1cmZhY2UgdGhlIHJhdyByZXR1cm5cbiAgICAgICAgICAgIC8vIHZhbHVlIGFzIG1ldGFkYXRhIG9ubHkuXG4gICAgICAgICAgICBjb25zdCBmYWNhZGVSZXR1cm4gPSBhd2FpdCBwcmVmYWJNZ3IudmFsdWUuYXBwbHlQcmVmYWIobm9kZVV1aWQpO1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogeyBmYWNhZGVSZXR1cm4sIG5vZGVVdWlkIH0gfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvcj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyb3IpIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQ29ubmVjdCBhIHJlZ3VsYXIgbm9kZSB0byBhIHByZWZhYiBhc3NldCAobGluaykuXG4gICAgICogV3JhcHMgc2NlbmUgZmFjYWRlIGBsaW5rUHJlZmFiKG5vZGVVdWlkLCBhc3NldFV1aWQpYC5cbiAgICAgKi9cbiAgICBhc3luYyBsaW5rUHJlZmFiKG5vZGVVdWlkOiBzdHJpbmcsIGFzc2V0VXVpZDogc3RyaW5nKSB7XG4gICAgICAgIGNvbnN0IHByZWZhYk1nciA9IGdldFByZWZhYkZhY2FkZSgpO1xuICAgICAgICBpZiAoIXByZWZhYk1nci5vaykge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBwcmVmYWJNZ3IuZXJyb3IgfTtcbiAgICAgICAgfVxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgcHJlZmFiTWdyLnZhbHVlLmxpbmtQcmVmYWIobm9kZVV1aWQsIGFzc2V0VXVpZCk7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBkYXRhOiB7IGxpbmtlZDogcmVzdWx0LCBub2RlVXVpZCwgYXNzZXRVdWlkIH0gfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvcj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyb3IpIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQnJlYWsgdGhlIHByZWZhYiBjb25uZWN0aW9uIG9uIGEgbm9kZS5cbiAgICAgKiBXcmFwcyBzY2VuZSBmYWNhZGUgYHVubGlua1ByZWZhYihub2RlVXVpZCwgcmVtb3ZlTmVzdGVkKWAuXG4gICAgICovXG4gICAgYXN5bmMgdW5saW5rUHJlZmFiKG5vZGVVdWlkOiBzdHJpbmcsIHJlbW92ZU5lc3RlZDogYm9vbGVhbikge1xuICAgICAgICBjb25zdCBwcmVmYWJNZ3IgPSBnZXRQcmVmYWJGYWNhZGUoKTtcbiAgICAgICAgaWYgKCFwcmVmYWJNZ3Iub2spIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogcHJlZmFiTWdyLmVycm9yIH07XG4gICAgICAgIH1cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHByZWZhYk1nci52YWx1ZS51bmxpbmtQcmVmYWIobm9kZVV1aWQsIHJlbW92ZU5lc3RlZCk7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBkYXRhOiB7IHVubGlua2VkOiByZXN1bHQsIG5vZGVVdWlkLCByZW1vdmVOZXN0ZWQgfSB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycm9yPy5tZXNzYWdlID8/IFN0cmluZyhlcnJvcikgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBSZWFkIHRoZSBwcmVmYWIgZHVtcCBmb3IgYSBwcmVmYWIgaW5zdGFuY2Ugbm9kZS5cbiAgICAgKiBXcmFwcyBzY2VuZSBmYWNhZGUgYGdldFByZWZhYkRhdGEobm9kZVV1aWQpYC5cbiAgICAgKi9cbiAgICBnZXRQcmVmYWJEYXRhKG5vZGVVdWlkOiBzdHJpbmcpIHtcbiAgICAgICAgY29uc3QgcHJlZmFiTWdyID0gZ2V0UHJlZmFiRmFjYWRlKCk7XG4gICAgICAgIGlmICghcHJlZmFiTWdyLm9rKSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHByZWZhYk1nci5lcnJvciB9O1xuICAgICAgICB9XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBkYXRhID0gcHJlZmFiTWdyLnZhbHVlLmdldFByZWZhYkRhdGEobm9kZVV1aWQpO1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZGF0YSB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycm9yPy5tZXNzYWdlID8/IFN0cmluZyhlcnJvcikgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBBcHBlbmQgYSBjYy5FdmVudEhhbmRsZXIgZW50cnkgdG8gYSBjb21wb25lbnQncyBldmVudCBhcnJheVxuICAgICAqIChlLmcuIGNjLkJ1dHRvbi5jbGlja0V2ZW50cywgY2MuVG9nZ2xlLmNoZWNrRXZlbnRzKS5cbiAgICAgKlxuICAgICAqIFNldHMgYm90aCBgY29tcG9uZW50YCBhbmQgYF9jb21wb25lbnROYW1lYCBiZWNhdXNlIGNvY29zLWVuZ2luZVxuICAgICAqIGlzc3VlICMxNjUxNyByZXBvcnRzIHRoYXQgcnVudGltZS1wdXNoZWQgRXZlbnRIYW5kbGVycyBkb24ndFxuICAgICAqIGRpc3BhdGNoIHVubGVzcyBgX2NvbXBvbmVudE5hbWVgIGlzIHBvcHVsYXRlZCBvbiAzLjgueC5cbiAgICAgKlxuICAgICAqIFBlcnNpc3RlbmNlIG5vdGUgKENMQVVERS5tZCBMYW5kbWluZSAjMTEpOiBzY2VuZS1zY3JpcHQgYGFyci5wdXNoYFxuICAgICAqIG9ubHkgbXV0YXRlcyB0aGUgcnVudGltZSBjYy5Db21wb25lbnQgaW5zdGFuY2U7IHRoZSBlZGl0b3Inc1xuICAgICAqIHNlcmlhbGl6YXRpb24gbW9kZWwgKHdoYXQgYHNhdmUtc2NlbmVgIHdyaXRlcyB0byBkaXNrKSBkb2VzIG5vdCBzZWVcbiAgICAgKiB0aGUgY2hhbmdlLiBBZnRlciBtdXRhdGluZywgd2UgaXNzdWUgYSBuby1vcCBgc2V0LXByb3BlcnR5YCBvblxuICAgICAqIGBlbmFibGVkYCB3aXRoIGl0cyBjdXJyZW50IHZhbHVlIHRvIG51ZGdlIHRoZSBlZGl0b3IgdG8gcmUtcHVsbFxuICAgICAqIHRoZSBjb21wb25lbnQgZHVtcCBmcm9tIHJ1bnRpbWUsIHdoaWNoIG1ha2VzIHRoZSBhcnJheSBjaGFuZ2VcbiAgICAgKiB2aXNpYmxlIHRvIGBzYXZlLXNjZW5lYC5cbiAgICAgKi9cbiAgICBhc3luYyBhZGRFdmVudEhhbmRsZXIoXG4gICAgICAgIG5vZGVVdWlkOiBzdHJpbmcsXG4gICAgICAgIGNvbXBvbmVudFR5cGU6IHN0cmluZyxcbiAgICAgICAgZXZlbnRBcnJheVByb3BlcnR5OiBzdHJpbmcsXG4gICAgICAgIHRhcmdldFV1aWQ6IHN0cmluZyxcbiAgICAgICAgY29tcG9uZW50TmFtZTogc3RyaW5nLFxuICAgICAgICBoYW5kbGVyOiBzdHJpbmcsXG4gICAgICAgIGN1c3RvbUV2ZW50RGF0YT86IHN0cmluZyxcbiAgICApIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGNjID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IGN0eCA9IHJlc29sdmVDb21wb25lbnRDb250ZXh0KG5vZGVVdWlkLCBjb21wb25lbnRUeXBlKTtcbiAgICAgICAgICAgIGlmICghY3R4Lm9rKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBjdHguZXJyb3IgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHRhcmdldE5vZGUgPSBmaW5kTm9kZUJ5VXVpZERlZXAoY3R4LnNjZW5lLCB0YXJnZXRVdWlkKTtcbiAgICAgICAgICAgIGlmICghdGFyZ2V0Tm9kZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYFRhcmdldCBub2RlIHdpdGggVVVJRCAke3RhcmdldFV1aWR9IG5vdCBmb3VuZGAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGFyciA9IGN0eC5jb21wb25lbnRbZXZlbnRBcnJheVByb3BlcnR5XTtcbiAgICAgICAgICAgIGlmICghQXJyYXkuaXNBcnJheShhcnIpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgUHJvcGVydHkgJyR7ZXZlbnRBcnJheVByb3BlcnR5fScgb24gJHtjb21wb25lbnRUeXBlfSBpcyBub3QgYW4gYXJyYXkgKGdvdCAke3R5cGVvZiBhcnJ9KWAgfTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgZWggPSBuZXcgY2MuRXZlbnRIYW5kbGVyKCk7XG4gICAgICAgICAgICBlaC50YXJnZXQgPSB0YXJnZXROb2RlO1xuICAgICAgICAgICAgZWguY29tcG9uZW50ID0gY29tcG9uZW50TmFtZTtcbiAgICAgICAgICAgIC8vIFdvcmthcm91bmQgZm9yIGNvY29zLWVuZ2luZSMxNjUxNzogZGlzcGF0Y2hlciByZWFkc1xuICAgICAgICAgICAgLy8gX2NvbXBvbmVudE5hbWUsIG5vdCBjb21wb25lbnQsIGluIDMuOC54IHJ1bnRpbWUgcGF0aC5cbiAgICAgICAgICAgIChlaCBhcyBhbnkpLl9jb21wb25lbnROYW1lID0gY29tcG9uZW50TmFtZTtcbiAgICAgICAgICAgIGVoLmhhbmRsZXIgPSBoYW5kbGVyO1xuICAgICAgICAgICAgZWguY3VzdG9tRXZlbnREYXRhID0gY3VzdG9tRXZlbnREYXRhID8/ICcnO1xuICAgICAgICAgICAgYXJyLnB1c2goZWgpO1xuXG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5zZW5kKCdzY2VuZScsICdzbmFwc2hvdCcpO1xuICAgICAgICAgICAgYXdhaXQgbnVkZ2VDb21wb25lbnRTZXJpYWxpemF0aW9uTW9kZWwoY3R4LmNvbXBvbmVudCk7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICBpbmRleDogYXJyLmxlbmd0aCAtIDEsXG4gICAgICAgICAgICAgICAgICAgIGNvdW50OiBhcnIubGVuZ3RoLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycm9yPy5tZXNzYWdlID8/IFN0cmluZyhlcnJvcikgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBSZW1vdmUgYSBjYy5FdmVudEhhbmRsZXIgZW50cnkgYnkgaW5kZXgsIG9yIGJ5IG1hdGNoaW5nXG4gICAgICogKHRhcmdldFV1aWQsIGhhbmRsZXIpIHBhaXIuIElmIGJvdGggYXJlIHByb3ZpZGVkLCBpbmRleCB3aW5zLlxuICAgICAqXG4gICAgICogU2VlIGFkZEV2ZW50SGFuZGxlciBmb3IgdGhlIHBlcnNpc3RlbmNlIG5vdGUgZXhwbGFpbmluZyB0aGVcbiAgICAgKiBgbnVkZ2VDb21wb25lbnRTZXJpYWxpemF0aW9uTW9kZWxgIGZvbGxvdy11cC5cbiAgICAgKi9cbiAgICBhc3luYyByZW1vdmVFdmVudEhhbmRsZXIoXG4gICAgICAgIG5vZGVVdWlkOiBzdHJpbmcsXG4gICAgICAgIGNvbXBvbmVudFR5cGU6IHN0cmluZyxcbiAgICAgICAgZXZlbnRBcnJheVByb3BlcnR5OiBzdHJpbmcsXG4gICAgICAgIGluZGV4OiBudW1iZXIgfCBudWxsLFxuICAgICAgICB0YXJnZXRVdWlkOiBzdHJpbmcgfCBudWxsLFxuICAgICAgICBoYW5kbGVyOiBzdHJpbmcgfCBudWxsLFxuICAgICkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgY3R4ID0gcmVzb2x2ZUNvbXBvbmVudENvbnRleHQobm9kZVV1aWQsIGNvbXBvbmVudFR5cGUpO1xuICAgICAgICAgICAgaWYgKCFjdHgub2spIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGN0eC5lcnJvciB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgYXJyID0gY3R4LmNvbXBvbmVudFtldmVudEFycmF5UHJvcGVydHldO1xuICAgICAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KGFycikpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBQcm9wZXJ0eSAnJHtldmVudEFycmF5UHJvcGVydHl9JyBvbiAke2NvbXBvbmVudFR5cGV9IGlzIG5vdCBhbiBhcnJheWAgfTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgbGV0IHJlbW92ZUF0ID0gLTE7XG4gICAgICAgICAgICBpZiAodHlwZW9mIGluZGV4ID09PSAnbnVtYmVyJyAmJiBpbmRleCA+PSAwKSB7XG4gICAgICAgICAgICAgICAgcmVtb3ZlQXQgPSBpbmRleDtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodGFyZ2V0VXVpZCB8fCBoYW5kbGVyKSB7XG4gICAgICAgICAgICAgICAgcmVtb3ZlQXQgPSBhcnIuZmluZEluZGV4KChlaDogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGVoVGFyZ2V0VXVpZCA9IGVoPy50YXJnZXQ/LnV1aWQ7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG1hdGNoZXNUYXJnZXQgPSAhdGFyZ2V0VXVpZCB8fCBlaFRhcmdldFV1aWQgPT09IHRhcmdldFV1aWQ7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG1hdGNoZXNIYW5kbGVyID0gIWhhbmRsZXIgfHwgZWg/LmhhbmRsZXIgPT09IGhhbmRsZXI7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBtYXRjaGVzVGFyZ2V0ICYmIG1hdGNoZXNIYW5kbGVyO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHJlbW92ZUF0IDwgMCB8fCByZW1vdmVBdCA+PSBhcnIubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnTm8gbWF0Y2hpbmcgZXZlbnQgaGFuZGxlciB0byByZW1vdmUnIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCByZW1vdmVkID0gYXJyLnNwbGljZShyZW1vdmVBdCwgMSlbMF07XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5zZW5kKCdzY2VuZScsICdzbmFwc2hvdCcpO1xuICAgICAgICAgICAgYXdhaXQgbnVkZ2VDb21wb25lbnRTZXJpYWxpemF0aW9uTW9kZWwoY3R4LmNvbXBvbmVudCk7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICBpbmRleDogcmVtb3ZlQXQsXG4gICAgICAgICAgICAgICAgICAgIHJlbWFpbmluZzogYXJyLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgcmVtb3ZlZDogc2VyaWFsaXplRXZlbnRIYW5kbGVyKHJlbW92ZWQpLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycm9yPy5tZXNzYWdlID8/IFN0cmluZyhlcnJvcikgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBJbnNwZWN0IGEgY29tcG9uZW50J3MgRXZlbnRIYW5kbGVyIGFycmF5IChyZWFkLW9ubHkpLlxuICAgICAqL1xuICAgIGxpc3RFdmVudEhhbmRsZXJzKG5vZGVVdWlkOiBzdHJpbmcsIGNvbXBvbmVudFR5cGU6IHN0cmluZywgZXZlbnRBcnJheVByb3BlcnR5OiBzdHJpbmcpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGN0eCA9IHJlc29sdmVDb21wb25lbnRDb250ZXh0KG5vZGVVdWlkLCBjb21wb25lbnRUeXBlKTtcbiAgICAgICAgICAgIGlmICghY3R4Lm9rKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBjdHguZXJyb3IgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGFyciA9IGN0eC5jb21wb25lbnRbZXZlbnRBcnJheVByb3BlcnR5XTtcbiAgICAgICAgICAgIGlmICghQXJyYXkuaXNBcnJheShhcnIpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgUHJvcGVydHkgJyR7ZXZlbnRBcnJheVByb3BlcnR5fScgb24gJHtjb21wb25lbnRUeXBlfSBpcyBub3QgYW4gYXJyYXlgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICBjb3VudDogYXJyLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgaGFuZGxlcnM6IGFyci5tYXAoc2VyaWFsaXplRXZlbnRIYW5kbGVyKSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvcj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyb3IpIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogU2V0IGNvbXBvbmVudCBwcm9wZXJ0eVxuICAgICAqL1xuICAgIHNldENvbXBvbmVudFByb3BlcnR5KG5vZGVVdWlkOiBzdHJpbmcsIGNvbXBvbmVudFR5cGU6IHN0cmluZywgcHJvcGVydHk6IHN0cmluZywgdmFsdWU6IGFueSkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgeyBkaXJlY3RvciwganMgfSA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgICAgICBpZiAoIXNjZW5lKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnTm8gYWN0aXZlIHNjZW5lJyB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3Qgbm9kZSA9IHNjZW5lLmdldENoaWxkQnlVdWlkKG5vZGVVdWlkKTtcbiAgICAgICAgICAgIGlmICghbm9kZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYE5vZGUgd2l0aCBVVUlEICR7bm9kZVV1aWR9IG5vdCBmb3VuZGAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IENvbXBvbmVudENsYXNzID0ganMuZ2V0Q2xhc3NCeU5hbWUoY29tcG9uZW50VHlwZSk7XG4gICAgICAgICAgICBpZiAoIUNvbXBvbmVudENsYXNzKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgQ29tcG9uZW50IHR5cGUgJHtjb21wb25lbnRUeXBlfSBub3QgZm91bmRgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBjb21wb25lbnQgPSBub2RlLmdldENvbXBvbmVudChDb21wb25lbnRDbGFzcyk7XG4gICAgICAgICAgICBpZiAoIWNvbXBvbmVudCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYENvbXBvbmVudCAke2NvbXBvbmVudFR5cGV9IG5vdCBmb3VuZCBvbiBub2RlYCB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8g6ZKI5a+55bi46KeB5bGe5oCn5YGa54m55q6K5aSE55CGXG4gICAgICAgICAgICBpZiAocHJvcGVydHkgPT09ICdzcHJpdGVGcmFtZScgJiYgY29tcG9uZW50VHlwZSA9PT0gJ2NjLlNwcml0ZScpIHtcbiAgICAgICAgICAgICAgICAvLyDmlK/mjIEgdmFsdWUg5Li6IHV1aWQg5oiW6LWE5rqQ6Lev5b6EXG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8g5YWI5bCd6K+V5oyJIHV1aWQg5p+l5om+XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGFzc2V0TWFuYWdlciA9IHJlcXVpcmUoJ2NjJykuYXNzZXRNYW5hZ2VyO1xuICAgICAgICAgICAgICAgICAgICBhc3NldE1hbmFnZXIucmVzb3VyY2VzLmxvYWQodmFsdWUsIHJlcXVpcmUoJ2NjJykuU3ByaXRlRnJhbWUsIChlcnI6IGFueSwgc3ByaXRlRnJhbWU6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFlcnIgJiYgc3ByaXRlRnJhbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb21wb25lbnQuc3ByaXRlRnJhbWUgPSBzcHJpdGVGcmFtZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5bCd6K+V6YCa6L+HIHV1aWQg5Yqg6L29XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYXNzZXRNYW5hZ2VyLmxvYWRBbnkoeyB1dWlkOiB2YWx1ZSB9LCAoZXJyMjogYW55LCBhc3NldDogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghZXJyMiAmJiBhc3NldCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50LnNwcml0ZUZyYW1lID0gYXNzZXQ7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDnm7TmjqXotYvlgLzvvIjlhbzlrrnlt7LkvKDlhaXotYTmupDlr7nosaHvvIlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudC5zcHJpdGVGcmFtZSA9IHZhbHVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudC5zcHJpdGVGcmFtZSA9IHZhbHVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHkgPT09ICdtYXRlcmlhbCcgJiYgKGNvbXBvbmVudFR5cGUgPT09ICdjYy5TcHJpdGUnIHx8IGNvbXBvbmVudFR5cGUgPT09ICdjYy5NZXNoUmVuZGVyZXInKSkge1xuICAgICAgICAgICAgICAgIC8vIOaUr+aMgSB2YWx1ZSDkuLogdXVpZCDmiJbotYTmupDot6/lvoRcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBhc3NldE1hbmFnZXIgPSByZXF1aXJlKCdjYycpLmFzc2V0TWFuYWdlcjtcbiAgICAgICAgICAgICAgICAgICAgYXNzZXRNYW5hZ2VyLnJlc291cmNlcy5sb2FkKHZhbHVlLCByZXF1aXJlKCdjYycpLk1hdGVyaWFsLCAoZXJyOiBhbnksIG1hdGVyaWFsOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghZXJyICYmIG1hdGVyaWFsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50Lm1hdGVyaWFsID0gbWF0ZXJpYWw7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFzc2V0TWFuYWdlci5sb2FkQW55KHsgdXVpZDogdmFsdWUgfSwgKGVycjI6IGFueSwgYXNzZXQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIWVycjIgJiYgYXNzZXQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudC5tYXRlcmlhbCA9IGFzc2V0O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50Lm1hdGVyaWFsID0gdmFsdWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50Lm1hdGVyaWFsID0gdmFsdWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eSA9PT0gJ3N0cmluZycgJiYgKGNvbXBvbmVudFR5cGUgPT09ICdjYy5MYWJlbCcgfHwgY29tcG9uZW50VHlwZSA9PT0gJ2NjLlJpY2hUZXh0JykpIHtcbiAgICAgICAgICAgICAgICBjb21wb25lbnQuc3RyaW5nID0gdmFsdWU7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbXBvbmVudFtwcm9wZXJ0eV0gPSB2YWx1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIOWPr+mAie+8muWIt+aWsCBJbnNwZWN0b3JcbiAgICAgICAgICAgIC8vIEVkaXRvci5NZXNzYWdlLnNlbmQoJ3NjZW5lJywgJ3NuYXBzaG90Jyk7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBtZXNzYWdlOiBgQ29tcG9uZW50IHByb3BlcnR5ICcke3Byb3BlcnR5fScgdXBkYXRlZCBzdWNjZXNzZnVsbHlgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3IubWVzc2FnZSB9O1xuICAgICAgICB9XG4gICAgfVxufTsiXX0=