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
     * Persistence note (CLAUDE.md Landmine #11): scene-script `arr.push`
     * only mutates the runtime cc.Component instance; the editor's
     * serialization model (what `save-scene` writes to disk) does not see
     * the change. The host-side caller (`component-tools.ts`) is
     * responsible for nudging the model afterwards via a no-op
     * `set-property` on a component field — calling `set-property` from
     * here doesn't propagate (scene-process IPC short-circuits and
     * skips the model sync). We surface `componentUuid` and
     * `componentEnabled` so the caller has what it needs.
     */
    addEventHandler(nodeUuid, componentType, eventArrayProperty, targetUuid, componentName, handler, customEventData) {
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
            eh.handler = handler;
            eh.customEventData = customEventData !== null && customEventData !== void 0 ? customEventData : '';
            arr.push(eh);
            Editor.Message.send('scene', 'snapshot');
            return {
                success: true,
                data: {
                    index: arr.length - 1,
                    count: arr.length,
                    componentUuid: ctx.component.uuid,
                    componentEnabled: ctx.component.enabled !== false,
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
     * See addEventHandler for the persistence note. Caller must follow up
     * with a host-side `set-property` nudge using the returned
     * `componentUuid` / `componentEnabled` to make the change visible to
     * `save-scene`.
     */
    removeEventHandler(nodeUuid, componentType, eventArrayProperty, index, targetUuid, handler) {
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
                // Trim around comparisons so callers passing UUIDs / handler
                // names with leading/trailing whitespace (LLM tool args often
                // come with stray spaces) still find a match.
                const targetUuidNorm = (targetUuid === null || targetUuid === void 0 ? void 0 : targetUuid.trim()) || null;
                const handlerNorm = (handler === null || handler === void 0 ? void 0 : handler.trim()) || null;
                removeAt = arr.findIndex((eh) => {
                    var _a, _b;
                    const ehTargetUuid = typeof ((_a = eh === null || eh === void 0 ? void 0 : eh.target) === null || _a === void 0 ? void 0 : _a.uuid) === 'string' ? eh.target.uuid.trim() : (_b = eh === null || eh === void 0 ? void 0 : eh.target) === null || _b === void 0 ? void 0 : _b.uuid;
                    const ehHandler = typeof (eh === null || eh === void 0 ? void 0 : eh.handler) === 'string' ? eh.handler.trim() : eh === null || eh === void 0 ? void 0 : eh.handler;
                    const matchesTarget = !targetUuidNorm || ehTargetUuid === targetUuidNorm;
                    const matchesHandler = !handlerNorm || ehHandler === handlerNorm;
                    return matchesTarget && matchesHandler;
                });
            }
            if (removeAt < 0 || removeAt >= arr.length) {
                return { success: false, error: 'No matching event handler to remove' };
            }
            const removed = arr.splice(removeAt, 1)[0];
            Editor.Message.send('scene', 'snapshot');
            return {
                success: true,
                data: {
                    index: removeAt,
                    remaining: arr.length,
                    removed: serializeEventHandler(removed),
                    componentUuid: ctx.component.uuid,
                    componentEnabled: ctx.component.enabled !== false,
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
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NlbmUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zb3VyY2Uvc2NlbmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsK0JBQTRCO0FBQzVCLE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUEsV0FBSSxFQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLGNBQWMsQ0FBQyxDQUFDLENBQUM7QUFxQnpELFNBQVMsZUFBZTs7SUFDcEIsSUFBSSxPQUFPLEdBQUcsS0FBSyxXQUFXLElBQUksR0FBRyxLQUFLLElBQUksRUFBRSxDQUFDO1FBQzdDLE9BQU8sRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSw2RUFBNkUsRUFBRSxDQUFDO0lBQy9HLENBQUM7SUFDRCxNQUFNLFVBQVUsR0FBb0M7UUFDaEQsR0FBRyxDQUFDLE1BQU07UUFDVixNQUFBLEdBQUcsQ0FBQyxrQkFBa0IsMENBQUUsUUFBUTtRQUNoQyxHQUFHLENBQUMsa0JBQThDO0tBQ3JELENBQUM7SUFDRixnRUFBZ0U7SUFDaEUsK0RBQStEO0lBQy9ELE1BQU0sUUFBUSxHQUE4QixDQUFDLGNBQWMsRUFBRSxhQUFhLEVBQUUsWUFBWSxFQUFFLGNBQWMsRUFBRSxlQUFlLENBQUMsQ0FBQztJQUMzSCxLQUFLLE1BQU0sU0FBUyxJQUFJLFVBQVUsRUFBRSxDQUFDO1FBQ2pDLElBQUksU0FBUyxJQUFJLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxPQUFRLFNBQWlCLENBQUMsQ0FBQyxDQUFDLEtBQUssVUFBVSxDQUFDLEVBQUUsQ0FBQztZQUNoRixPQUFPLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLENBQUM7UUFDMUMsQ0FBQztJQUNMLENBQUM7SUFDRCxPQUFPO1FBQ0gsRUFBRSxFQUFFLEtBQUs7UUFDVCxLQUFLLEVBQUUseUtBQXlLO0tBQ25MLENBQUM7QUFDTixDQUFD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QUUsQ0FBQztnQkFDdEIsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLGFBQWEsa0JBQWtCLFFBQVEsYUFBYSxrQkFBa0IsRUFBRSxDQUFDO1lBQzdHLENBQUM7WUFDRCxPQUFPO2dCQUNILE9BQU8sRUFBRSxJQUFJO2dCQUNiLElBQUksRUFBRTtvQkFDRixLQUFLLEVBQUUsR0FBRyxDQUFDLE1BQU07b0JBQ2pCLFFBQVEsRUFBRSxHQUFHLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDO2lCQUMzQzthQUNKLENBQUM7UUFDTixDQUFDO1FBQUMsT0FBTyxLQUFVLEVBQUUsQ0FBQztZQUNsQixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsTUFBQSxLQUFLLGFBQUwsS0FBSyx1QkFBTCxLQUFLLENBQUUsT0FBTyxtQ0FBSSxNQUFNLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztRQUN0RSxDQUFDO0lBQ0wsQ0FBQztDQUVKLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBqb2luIH0gZnJvbSAncGF0aCc7XG5tb2R1bGUucGF0aHMucHVzaChqb2luKEVkaXRvci5BcHAucGF0aCwgJ25vZGVfbW9kdWxlcycpKTtcblxuLy8gYGNjZWAgaXMgaW5qZWN0ZWQgYnkgQ29jb3MgRWRpdG9yIGludG8gdGhlIHNjZW5lLXNjcmlwdCBnbG9iYWwgc2NvcGUuXG4vLyBJdCBpcyBub3QgZGVjbGFyZWQgaW4gYEBjb2Nvcy9jcmVhdG9yLXR5cGVzYCBleHBvcnRzOyBkZWNsYXJlIGEgbWluaW1hbFxuLy8gcnVudGltZSBzaGFwZSBqdXN0IGZvciB3aGF0IHdlIHRvdWNoIGhlcmUgc28gVHlwZVNjcmlwdCBzdGF5cyBzdHJpY3QuXG5kZWNsYXJlIGNvbnN0IGNjZTogdW5kZWZpbmVkIHwge1xuICAgIFByZWZhYj86IFByZWZhYkZhY2FkZTtcbiAgICBTY2VuZUZhY2FkZU1hbmFnZXI/OiB7IGluc3RhbmNlPzogUHJlZmFiRmFjYWRlIH0gJiBQcmVmYWJGYWNhZGU7XG59O1xuXG5pbnRlcmZhY2UgUHJlZmFiRmFjYWRlIHtcbiAgICBjcmVhdGVQcmVmYWIobm9kZVV1aWQ6IHN0cmluZywgdXJsOiBzdHJpbmcpOiBQcm9taXNlPGFueT47XG4gICAgYXBwbHlQcmVmYWIobm9kZVV1aWQ6IHN0cmluZyk6IFByb21pc2U8YW55PjtcbiAgICBsaW5rUHJlZmFiKG5vZGVVdWlkOiBzdHJpbmcsIGFzc2V0VXVpZDogc3RyaW5nKTogYW55O1xuICAgIHVubGlua1ByZWZhYihub2RlVXVpZDogc3RyaW5nLCByZW1vdmVOZXN0ZWQ6IGJvb2xlYW4pOiBhbnk7XG4gICAgZ2V0UHJlZmFiRGF0YShub2RlVXVpZDogc3RyaW5nKTogYW55O1xuICAgIHJlc3RvcmVQcmVmYWI/KHV1aWQ6IHN0cmluZywgYXNzZXRVdWlkOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+O1xufVxuXG50eXBlIEZhY2FkZUxvb2t1cCA9IHsgb2s6IHRydWU7IHZhbHVlOiBQcmVmYWJGYWNhZGUgfSB8IHsgb2s6IGZhbHNlOyBlcnJvcjogc3RyaW5nIH07XG5cbmZ1bmN0aW9uIGdldFByZWZhYkZhY2FkZSgpOiBGYWNhZGVMb29rdXAge1xuICAgIGlmICh0eXBlb2YgY2NlID09PSAndW5kZWZpbmVkJyB8fCBjY2UgPT09IG51bGwpIHtcbiAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogJ2NjZSBnbG9iYWwgaXMgbm90IGF2YWlsYWJsZTsgdGhpcyBtZXRob2QgbXVzdCBydW4gaW4gYSBzY2VuZS1zY3JpcHQgY29udGV4dCcgfTtcbiAgICB9XG4gICAgY29uc3QgY2FuZGlkYXRlczogQXJyYXk8UHJlZmFiRmFjYWRlIHwgdW5kZWZpbmVkPiA9IFtcbiAgICAgICAgY2NlLlByZWZhYixcbiAgICAgICAgY2NlLlNjZW5lRmFjYWRlTWFuYWdlcj8uaW5zdGFuY2UsXG4gICAgICAgIGNjZS5TY2VuZUZhY2FkZU1hbmFnZXIgYXMgUHJlZmFiRmFjYWRlIHwgdW5kZWZpbmVkLFxuICAgIF07XG4gICAgLy8gRW5zdXJlIHRoZSBjYW5kaWRhdGUgZXhwb3NlcyBldmVyeSBmYWNhZGUgbWV0aG9kIHdlIG1heSBjYWxsO1xuICAgIC8vIGEgcGFydGlhbCBjYW5kaWRhdGUgd291bGQgY3Jhc2ggYXQgdGhlIGZpcnN0IG1pc3NpbmcgbWV0aG9kLlxuICAgIGNvbnN0IHJlcXVpcmVkOiBBcnJheTxrZXlvZiBQcmVmYWJGYWNhZGU+ID0gWydjcmVhdGVQcmVmYWInLCAnYXBwbHlQcmVmYWInLCAnbGlua1ByZWZhYicsICd1bmxpbmtQcmVmYWInLCAnZ2V0UHJlZmFiRGF0YSddO1xuICAgIGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIGNhbmRpZGF0ZXMpIHtcbiAgICAgICAgaWYgKGNhbmRpZGF0ZSAmJiByZXF1aXJlZC5ldmVyeShtID0+IHR5cGVvZiAoY2FuZGlkYXRlIGFzIGFueSlbbV0gPT09ICdmdW5jdGlvbicpKSB7XG4gICAgICAgICAgICByZXR1cm4geyBvazogdHJ1ZSwgdmFsdWU6IGNhbmRpZGF0ZSB9O1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiB7XG4gICAgICAgIG9rOiBmYWxzZSxcbiAgICAgICAgZXJyb3I6ICdObyBjb21wbGV0ZSBwcmVmYWIgZmFjYWRlIGZvdW5kIG9uIGNjZSAoY2NlLlByZWZhYiAvIGNjZS5TY2VuZUZhY2FkZU1hbmFnZXIpLiBDb2NvcyBlZGl0b3IgYnVpbGQgbWF5IG5vdCBleHBvc2UgdGhlIGV4cGVjdGVkIG1hbmFnZXIgb3Igb25seSBleHBvc2VzIGEgcGFydGlhbCBzdXJmYWNlLicsXG4gICAgfTtcbn1cblxudHlwZSBDb21wb25lbnRMb29rdXAgPVxuICAgIHwgeyBvazogdHJ1ZTsgc2NlbmU6IGFueTsgbm9kZTogYW55OyBjb21wb25lbnQ6IGFueSB9XG4gICAgfCB7IG9rOiBmYWxzZTsgZXJyb3I6IHN0cmluZyB9O1xuXG5mdW5jdGlvbiBmaW5kTm9kZUJ5VXVpZERlZXAocm9vdDogYW55LCB1dWlkOiBzdHJpbmcpOiBhbnkge1xuICAgIGlmICghcm9vdCkgcmV0dXJuIG51bGw7XG4gICAgaWYgKHJvb3QuX2lkID09PSB1dWlkIHx8IHJvb3QudXVpZCA9PT0gdXVpZCkgcmV0dXJuIHJvb3Q7XG4gICAgY29uc3QgY2hpbGRyZW4gPSByb290LmNoaWxkcmVuID8/IHJvb3QuX2NoaWxkcmVuID8/IFtdO1xuICAgIGZvciAoY29uc3QgY2hpbGQgb2YgY2hpbGRyZW4pIHtcbiAgICAgICAgY29uc3QgaGl0ID0gZmluZE5vZGVCeVV1aWREZWVwKGNoaWxkLCB1dWlkKTtcbiAgICAgICAgaWYgKGhpdCkgcmV0dXJuIGhpdDtcbiAgICB9XG4gICAgcmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIHJlc29sdmVDb21wb25lbnRDb250ZXh0KG5vZGVVdWlkOiBzdHJpbmcsIGNvbXBvbmVudFR5cGU6IHN0cmluZyk6IENvbXBvbmVudExvb2t1cCB7XG4gICAgY29uc3QgeyBkaXJlY3RvciwganMgfSA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgY29uc3Qgc2NlbmUgPSBkaXJlY3Rvci5nZXRTY2VuZSgpO1xuICAgIGlmICghc2NlbmUpIHtcbiAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogJ05vIGFjdGl2ZSBzY2VuZScgfTtcbiAgICB9XG4gICAgLy8gc2NlbmUuZ2V0Q2hpbGRCeVV1aWQgb25seSB3YWxrcyBkaXJlY3QgY2hpbGRyZW47IHVzZSBkZXB0aC1maXJzdCBzZWFyY2guXG4gICAgY29uc3Qgbm9kZSA9IGZpbmROb2RlQnlVdWlkRGVlcChzY2VuZSwgbm9kZVV1aWQpO1xuICAgIGlmICghbm9kZSkge1xuICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBgTm9kZSB3aXRoIFVVSUQgJHtub2RlVXVpZH0gbm90IGZvdW5kYCB9O1xuICAgIH1cbiAgICBjb25zdCBDb21wb25lbnRDbGFzcyA9IGpzLmdldENsYXNzQnlOYW1lKGNvbXBvbmVudFR5cGUpO1xuICAgIGlmICghQ29tcG9uZW50Q2xhc3MpIHtcbiAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogYENvbXBvbmVudCB0eXBlICR7Y29tcG9uZW50VHlwZX0gbm90IGZvdW5kYCB9O1xuICAgIH1cbiAgICBjb25zdCBjb21wb25lbnQgPSBub2RlLmdldENvbXBvbmVudChDb21wb25lbnRDbGFzcyk7XG4gICAgaWYgKCFjb21wb25lbnQpIHtcbiAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogYENvbXBvbmVudCAke2NvbXBvbmVudFR5cGV9IG5vdCBmb3VuZCBvbiBub2RlYCB9O1xuICAgIH1cbiAgICByZXR1cm4geyBvazogdHJ1ZSwgc2NlbmUsIG5vZGUsIGNvbXBvbmVudCB9O1xufVxuXG5mdW5jdGlvbiBzZXJpYWxpemVFdmVudEhhbmRsZXIoZWg6IGFueSkge1xuICAgIGlmICghZWgpIHJldHVybiBudWxsO1xuICAgIHJldHVybiB7XG4gICAgICAgIHRhcmdldFV1aWQ6IGVoLnRhcmdldD8udXVpZCA/PyBudWxsLFxuICAgICAgICB0YXJnZXROYW1lOiBlaC50YXJnZXQ/Lm5hbWUgPz8gbnVsbCxcbiAgICAgICAgY29tcG9uZW50OiBlaC5jb21wb25lbnQgPz8gZWguX2NvbXBvbmVudE5hbWUgPz8gbnVsbCxcbiAgICAgICAgaGFuZGxlcjogZWguaGFuZGxlciA/PyBudWxsLFxuICAgICAgICBjdXN0b21FdmVudERhdGE6IGVoLmN1c3RvbUV2ZW50RGF0YSA/PyAnJyxcbiAgICB9O1xufVxuXG5leHBvcnQgY29uc3QgbWV0aG9kczogeyBba2V5OiBzdHJpbmddOiAoLi4uYW55OiBhbnkpID0+IGFueSB9ID0ge1xuICAgIC8qKlxuICAgICAqIEFkZCBjb21wb25lbnQgdG8gYSBub2RlXG4gICAgICovXG4gICAgYWRkQ29tcG9uZW50VG9Ob2RlKG5vZGVVdWlkOiBzdHJpbmcsIGNvbXBvbmVudFR5cGU6IHN0cmluZykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgeyBkaXJlY3RvciwganMgfSA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgICAgICBpZiAoIXNjZW5lKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnTm8gYWN0aXZlIHNjZW5lJyB9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBGaW5kIG5vZGUgYnkgVVVJRFxuICAgICAgICAgICAgY29uc3Qgbm9kZSA9IHNjZW5lLmdldENoaWxkQnlVdWlkKG5vZGVVdWlkKTtcbiAgICAgICAgICAgIGlmICghbm9kZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYE5vZGUgd2l0aCBVVUlEICR7bm9kZVV1aWR9IG5vdCBmb3VuZGAgfTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gR2V0IGNvbXBvbmVudCBjbGFzc1xuICAgICAgICAgICAgY29uc3QgQ29tcG9uZW50Q2xhc3MgPSBqcy5nZXRDbGFzc0J5TmFtZShjb21wb25lbnRUeXBlKTtcbiAgICAgICAgICAgIGlmICghQ29tcG9uZW50Q2xhc3MpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBDb21wb25lbnQgdHlwZSAke2NvbXBvbmVudFR5cGV9IG5vdCBmb3VuZGAgfTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gQWRkIGNvbXBvbmVudFxuICAgICAgICAgICAgY29uc3QgY29tcG9uZW50ID0gbm9kZS5hZGRDb21wb25lbnQoQ29tcG9uZW50Q2xhc3MpO1xuICAgICAgICAgICAgcmV0dXJuIHsgXG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSwgXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogYENvbXBvbmVudCAke2NvbXBvbmVudFR5cGV9IGFkZGVkIHN1Y2Nlc3NmdWxseWAsXG4gICAgICAgICAgICAgICAgZGF0YTogeyBjb21wb25lbnRJZDogY29tcG9uZW50LnV1aWQgfVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvci5tZXNzYWdlIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQ3JlYXRlIGEgbmV3IG5vZGVcbiAgICAgKi9cbiAgICBjcmVhdGVOb2RlKG5hbWU6IHN0cmluZywgcGFyZW50VXVpZD86IHN0cmluZykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgeyBkaXJlY3RvciwgTm9kZSB9ID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICAgICAgICAgIGlmICghc2NlbmUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdObyBhY3RpdmUgc2NlbmUnIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IG5vZGUgPSBuZXcgTm9kZShuYW1lKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgaWYgKHBhcmVudFV1aWQpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBwYXJlbnQgPSBzY2VuZS5nZXRDaGlsZEJ5VXVpZChwYXJlbnRVdWlkKTtcbiAgICAgICAgICAgICAgICBpZiAocGFyZW50KSB7XG4gICAgICAgICAgICAgICAgICAgIHBhcmVudC5hZGRDaGlsZChub2RlKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBzY2VuZS5hZGRDaGlsZChub2RlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHNjZW5lLmFkZENoaWxkKG5vZGUpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4geyBcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLCBcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiBgTm9kZSAke25hbWV9IGNyZWF0ZWQgc3VjY2Vzc2Z1bGx5YCxcbiAgICAgICAgICAgICAgICBkYXRhOiB7IHV1aWQ6IG5vZGUudXVpZCwgbmFtZTogbm9kZS5uYW1lIH1cbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3IubWVzc2FnZSB9O1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEdldCBub2RlIGluZm9ybWF0aW9uXG4gICAgICovXG4gICAgZ2V0Tm9kZUluZm8obm9kZVV1aWQ6IHN0cmluZykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgeyBkaXJlY3RvciB9ID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICAgICAgICAgIGlmICghc2NlbmUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdObyBhY3RpdmUgc2NlbmUnIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IG5vZGUgPSBzY2VuZS5nZXRDaGlsZEJ5VXVpZChub2RlVXVpZCk7XG4gICAgICAgICAgICBpZiAoIW5vZGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBOb2RlIHdpdGggVVVJRCAke25vZGVVdWlkfSBub3QgZm91bmRgIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIHV1aWQ6IG5vZGUudXVpZCxcbiAgICAgICAgICAgICAgICAgICAgbmFtZTogbm9kZS5uYW1lLFxuICAgICAgICAgICAgICAgICAgICBhY3RpdmU6IG5vZGUuYWN0aXZlLFxuICAgICAgICAgICAgICAgICAgICBwb3NpdGlvbjogbm9kZS5wb3NpdGlvbixcbiAgICAgICAgICAgICAgICAgICAgcm90YXRpb246IG5vZGUucm90YXRpb24sXG4gICAgICAgICAgICAgICAgICAgIHNjYWxlOiBub2RlLnNjYWxlLFxuICAgICAgICAgICAgICAgICAgICBwYXJlbnQ6IG5vZGUucGFyZW50Py51dWlkLFxuICAgICAgICAgICAgICAgICAgICBjaGlsZHJlbjogbm9kZS5jaGlsZHJlbi5tYXAoKGNoaWxkOiBhbnkpID0+IGNoaWxkLnV1aWQpLFxuICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRzOiBub2RlLmNvbXBvbmVudHMubWFwKChjb21wOiBhbnkpID0+ICh7XG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiBjb21wLmNvbnN0cnVjdG9yLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBlbmFibGVkOiBjb21wLmVuYWJsZWRcbiAgICAgICAgICAgICAgICAgICAgfSkpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvci5tZXNzYWdlIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogR2V0IGFsbCBub2RlcyBpbiBzY2VuZVxuICAgICAqL1xuICAgIGdldEFsbE5vZGVzKCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgeyBkaXJlY3RvciB9ID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICAgICAgICAgIGlmICghc2NlbmUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdObyBhY3RpdmUgc2NlbmUnIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IG5vZGVzOiBhbnlbXSA9IFtdO1xuICAgICAgICAgICAgY29uc3QgY29sbGVjdE5vZGVzID0gKG5vZGU6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIG5vZGVzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICB1dWlkOiBub2RlLnV1aWQsXG4gICAgICAgICAgICAgICAgICAgIG5hbWU6IG5vZGUubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgYWN0aXZlOiBub2RlLmFjdGl2ZSxcbiAgICAgICAgICAgICAgICAgICAgcGFyZW50OiBub2RlLnBhcmVudD8udXVpZFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIG5vZGUuY2hpbGRyZW4uZm9yRWFjaCgoY2hpbGQ6IGFueSkgPT4gY29sbGVjdE5vZGVzKGNoaWxkKSk7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBzY2VuZS5jaGlsZHJlbi5mb3JFYWNoKChjaGlsZDogYW55KSA9PiBjb2xsZWN0Tm9kZXMoY2hpbGQpKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogbm9kZXMgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvci5tZXNzYWdlIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogRmluZCBub2RlIGJ5IG5hbWVcbiAgICAgKi9cbiAgICBmaW5kTm9kZUJ5TmFtZShuYW1lOiBzdHJpbmcpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IgfSA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgICAgICBpZiAoIXNjZW5lKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnTm8gYWN0aXZlIHNjZW5lJyB9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBub2RlID0gc2NlbmUuZ2V0Q2hpbGRCeU5hbWUobmFtZSk7XG4gICAgICAgICAgICBpZiAoIW5vZGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBOb2RlIHdpdGggbmFtZSAke25hbWV9IG5vdCBmb3VuZGAgfTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgdXVpZDogbm9kZS51dWlkLFxuICAgICAgICAgICAgICAgICAgICBuYW1lOiBub2RlLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgIGFjdGl2ZTogbm9kZS5hY3RpdmUsXG4gICAgICAgICAgICAgICAgICAgIHBvc2l0aW9uOiBub2RlLnBvc2l0aW9uXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvci5tZXNzYWdlIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogR2V0IGN1cnJlbnQgc2NlbmUgaW5mb3JtYXRpb25cbiAgICAgKi9cbiAgICBnZXRDdXJyZW50U2NlbmVJbmZvKCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgeyBkaXJlY3RvciB9ID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICAgICAgICAgIGlmICghc2NlbmUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdObyBhY3RpdmUgc2NlbmUnIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIG5hbWU6IHNjZW5lLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgIHV1aWQ6IHNjZW5lLnV1aWQsXG4gICAgICAgICAgICAgICAgICAgIG5vZGVDb3VudDogc2NlbmUuY2hpbGRyZW4ubGVuZ3RoXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvci5tZXNzYWdlIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogU2V0IG5vZGUgcHJvcGVydHlcbiAgICAgKi9cbiAgICBzZXROb2RlUHJvcGVydHkobm9kZVV1aWQ6IHN0cmluZywgcHJvcGVydHk6IHN0cmluZywgdmFsdWU6IGFueSkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgeyBkaXJlY3RvciB9ID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICAgICAgICAgIGlmICghc2NlbmUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdObyBhY3RpdmUgc2NlbmUnIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IG5vZGUgPSBzY2VuZS5nZXRDaGlsZEJ5VXVpZChub2RlVXVpZCk7XG4gICAgICAgICAgICBpZiAoIW5vZGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBOb2RlIHdpdGggVVVJRCAke25vZGVVdWlkfSBub3QgZm91bmRgIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIOiuvue9ruWxnuaAp1xuICAgICAgICAgICAgaWYgKHByb3BlcnR5ID09PSAncG9zaXRpb24nKSB7XG4gICAgICAgICAgICAgICAgbm9kZS5zZXRQb3NpdGlvbih2YWx1ZS54IHx8IDAsIHZhbHVlLnkgfHwgMCwgdmFsdWUueiB8fCAwKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHkgPT09ICdyb3RhdGlvbicpIHtcbiAgICAgICAgICAgICAgICBub2RlLnNldFJvdGF0aW9uRnJvbUV1bGVyKHZhbHVlLnggfHwgMCwgdmFsdWUueSB8fCAwLCB2YWx1ZS56IHx8IDApO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eSA9PT0gJ3NjYWxlJykge1xuICAgICAgICAgICAgICAgIG5vZGUuc2V0U2NhbGUodmFsdWUueCB8fCAxLCB2YWx1ZS55IHx8IDEsIHZhbHVlLnogfHwgMSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5ID09PSAnYWN0aXZlJykge1xuICAgICAgICAgICAgICAgIG5vZGUuYWN0aXZlID0gdmFsdWU7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5ID09PSAnbmFtZScpIHtcbiAgICAgICAgICAgICAgICBub2RlLm5hbWUgPSB2YWx1ZTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8g5bCd6K+V55u05o6l6K6+572u5bGe5oCnXG4gICAgICAgICAgICAgICAgKG5vZGUgYXMgYW55KVtwcm9wZXJ0eV0gPSB2YWx1ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHsgXG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSwgXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogYFByb3BlcnR5ICcke3Byb3BlcnR5fScgdXBkYXRlZCBzdWNjZXNzZnVsbHlgIFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvci5tZXNzYWdlIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogR2V0IHNjZW5lIGhpZXJhcmNoeVxuICAgICAqL1xuICAgIGdldFNjZW5lSGllcmFyY2h5KGluY2x1ZGVDb21wb25lbnRzOiBib29sZWFuID0gZmFsc2UpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IgfSA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgICAgICBpZiAoIXNjZW5lKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnTm8gYWN0aXZlIHNjZW5lJyB9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBwcm9jZXNzTm9kZSA9IChub2RlOiBhbnkpOiBhbnkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdDogYW55ID0ge1xuICAgICAgICAgICAgICAgICAgICBuYW1lOiBub2RlLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgIHV1aWQ6IG5vZGUudXVpZCxcbiAgICAgICAgICAgICAgICAgICAgYWN0aXZlOiBub2RlLmFjdGl2ZSxcbiAgICAgICAgICAgICAgICAgICAgY2hpbGRyZW46IFtdXG4gICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgIGlmIChpbmNsdWRlQ29tcG9uZW50cykge1xuICAgICAgICAgICAgICAgICAgICByZXN1bHQuY29tcG9uZW50cyA9IG5vZGUuY29tcG9uZW50cy5tYXAoKGNvbXA6IGFueSkgPT4gKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6IGNvbXAuY29uc3RydWN0b3IubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGVuYWJsZWQ6IGNvbXAuZW5hYmxlZFxuICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKG5vZGUuY2hpbGRyZW4gJiYgbm9kZS5jaGlsZHJlbi5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdC5jaGlsZHJlbiA9IG5vZGUuY2hpbGRyZW4ubWFwKChjaGlsZDogYW55KSA9PiBwcm9jZXNzTm9kZShjaGlsZCkpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBjb25zdCBoaWVyYXJjaHkgPSBzY2VuZS5jaGlsZHJlbi5tYXAoKGNoaWxkOiBhbnkpID0+IHByb2Nlc3NOb2RlKGNoaWxkKSk7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBkYXRhOiBoaWVyYXJjaHkgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvci5tZXNzYWdlIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQ3JlYXRlIHByZWZhYiBhc3NldCBmcm9tIGEgbm9kZSB2aWEgdGhlIG9mZmljaWFsIHNjZW5lIGZhY2FkZS5cbiAgICAgKlxuICAgICAqIFJvdXRlcyB0aHJvdWdoIGBjY2UuUHJlZmFiLmNyZWF0ZVByZWZhYmAgKHRoZSBDb2NvcyBlZGl0b3IgcHJlZmFiXG4gICAgICogbWFuYWdlciBleHBvc2VkIGluIHNjZW5lLXNjcmlwdCBjb250ZXh0KS4gVGhlIHVybCBhY2NlcHRzIGJvdGhcbiAgICAgKiBgZGI6Ly9hc3NldHMvLi4uYCBhbmQgYWJzb2x1dGUgZmlsZXN5c3RlbSBwYXRocyBpbiBkaWZmZXJlbnQgZWRpdG9yXG4gICAgICogYnVpbGRzLCBzbyB3ZSB0cnkgYm90aCBzaGFwZXMgYW5kIHN1cmZhY2Ugd2hpY2hldmVyIGZhaWxzLlxuICAgICAqL1xuICAgIGFzeW5jIGNyZWF0ZVByZWZhYkZyb21Ob2RlKG5vZGVVdWlkOiBzdHJpbmcsIHVybDogc3RyaW5nKSB7XG4gICAgICAgIGNvbnN0IHByZWZhYk1nciA9IGdldFByZWZhYkZhY2FkZSgpO1xuICAgICAgICBpZiAoIXByZWZhYk1nci5vaykge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBwcmVmYWJNZ3IuZXJyb3IgfTtcbiAgICAgICAgfVxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgdHJpZXM6IHN0cmluZ1tdID0gW107XG4gICAgICAgICAgICAvLyBQcmVmZXIgZGI6Ly8gZm9ybSAobWF0Y2hlcyBhc3NldC1kYiBxdWVyeSByZXN1bHRzKSBhbmQgZmFsbFxuICAgICAgICAgICAgLy8gYmFjayB0byB3aGF0ZXZlciB0aGUgY2FsbGVyIHBhc3NlZCB2ZXJiYXRpbS5cbiAgICAgICAgICAgIGNvbnN0IGRiVXJsID0gdXJsLnN0YXJ0c1dpdGgoJ2RiOi8vJykgPyB1cmwgOiBgZGI6Ly9hc3NldHMvJHt1cmwucmVwbGFjZSgvXlxcLysvLCAnJyl9YDtcbiAgICAgICAgICAgIHRyaWVzLnB1c2goZGJVcmwpO1xuICAgICAgICAgICAgaWYgKGRiVXJsICE9PSB1cmwpIHtcbiAgICAgICAgICAgICAgICB0cmllcy5wdXNoKHVybCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IGVycm9yczogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIHRyaWVzKSB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgcHJlZmFiTWdyLnZhbHVlLmNyZWF0ZVByZWZhYihub2RlVXVpZCwgY2FuZGlkYXRlKTtcbiAgICAgICAgICAgICAgICAgICAgLy8gY2NlLlByZWZhYi5jcmVhdGVQcmVmYWIgcmVwdXJwb3NlcyB0aGUgc291cmNlIG5vZGUgaW50byBhXG4gICAgICAgICAgICAgICAgICAgIC8vIHByZWZhYiBpbnN0YW5jZSB3aXRoIGEgZnJlc2ggVVVJRCwgc28gdGhlIGNhbGxlci1zdXBwbGllZFxuICAgICAgICAgICAgICAgICAgICAvLyBub2RlVXVpZCBpcyBubyBsb25nZXIgdmFsaWQuIFJlc29sdmUgdGhlIG5ldyBVVUlEIGJ5XG4gICAgICAgICAgICAgICAgICAgIC8vIHF1ZXJ5aW5nIG5vZGVzIHRoYXQgcmVmZXJlbmNlIHRoZSBmcmVzaGx5IG1pbnRlZCBhc3NldC5cbiAgICAgICAgICAgICAgICAgICAgbGV0IGFzc2V0VXVpZDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgcmVzdWx0ID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXNzZXRVdWlkID0gcmVzdWx0O1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHJlc3VsdCAmJiB0eXBlb2YgcmVzdWx0ID09PSAnb2JqZWN0JyAmJiB0eXBlb2YgKHJlc3VsdCBhcyBhbnkpLnV1aWQgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhc3NldFV1aWQgPSAocmVzdWx0IGFzIGFueSkudXVpZDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBsZXQgaW5zdGFuY2VOb2RlVXVpZDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgIGlmIChhc3NldFV1aWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgaW5zdGFuY2VzOiBhbnkgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1ub2Rlcy1ieS1hc3NldC11dWlkJywgYXNzZXRVdWlkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShpbnN0YW5jZXMpICYmIGluc3RhbmNlcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIE5ld2x5LWNyZWF0ZWQgcHJlZmFiIGluc3RhbmNlIGlzIHR5cGljYWxseSB0aGVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gbGFzdCBlbnRyeS4gQ2F2ZWF0OiBpZiB0aGUgc2FtZSBhc3NldCBhbHJlYWR5XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGhhZCBpbnN0YW5jZXMgaW4gdGhlIHNjZW5lLCBcImxhc3RcIiBwaWNrcyBvbmVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gb2YgdGhlbSByYXRoZXIgdGhhbiB0aGUgbmV3IG9uZS4gVGhlIGVkaXRvclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBhcHBlYXJzIHRvIHJldHVybiBjcmVhdGlvbiBvcmRlciwgYnV0IHRoZSBBUElcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gaXMgdW5kb2N1bWVudGVkOyBjYWxsZXJzIHJlcXVpcmluZyBzdHJpY3RcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gaWRlbnRpZmljYXRpb24gc2hvdWxkIHNuYXBzaG90IGJlZm9yZSBjYWxsaW5nLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbnN0YW5jZU5vZGVVdWlkID0gaW5zdGFuY2VzW2luc3RhbmNlcy5sZW5ndGggLSAxXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBOb24tZmF0YWw6IHRoZSBhc3NldCB3YXMgY3JlYXRlZCBlaXRoZXIgd2F5LlxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHVybDogY2FuZGlkYXRlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNvdXJjZU5vZGVVdWlkOiBub2RlVXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcmVmYWJBc3NldFV1aWQ6IGFzc2V0VXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbnN0YW5jZU5vZGVVdWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJhdzogcmVzdWx0LFxuICAgICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgICAgICAgICBlcnJvcnMucHVzaChgJHtjYW5kaWRhdGV9OiAke2Vycj8ubWVzc2FnZSA/PyBlcnJ9YCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBlcnJvcjogYGNjZS5QcmVmYWIuY3JlYXRlUHJlZmFiIGZhaWxlZDogJHtlcnJvcnMuam9pbignOyAnKX1gLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvcj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyb3IpIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogUHVzaCBwcmVmYWIgaW5zdGFuY2UgZWRpdHMgYmFjayB0byB0aGUgcHJlZmFiIGFzc2V0LlxuICAgICAqIFdyYXBzIHNjZW5lIGZhY2FkZSBgYXBwbHlQcmVmYWIobm9kZVV1aWQpYC5cbiAgICAgKi9cbiAgICBhc3luYyBhcHBseVByZWZhYihub2RlVXVpZDogc3RyaW5nKSB7XG4gICAgICAgIGNvbnN0IHByZWZhYk1nciA9IGdldFByZWZhYkZhY2FkZSgpO1xuICAgICAgICBpZiAoIXByZWZhYk1nci5vaykge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBwcmVmYWJNZ3IuZXJyb3IgfTtcbiAgICAgICAgfVxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gTm90ZTogZmFjYWRlUmV0dXJuIGZyb20gY2NlLlNjZW5lRmFjYWRlLmFwcGx5UHJlZmFiIGlzIG9ic2VydmVkXG4gICAgICAgICAgICAvLyB0byBiZSBgZmFsc2VgIGV2ZW4gd2hlbiB0aGUgYXBwbHkgZ2VudWluZWx5IHdyaXRlcyB0byBkaXNrXG4gICAgICAgICAgICAvLyAodmVyaWZpZWQgZHVyaW5nIFA0IHYyLjEuMCByZWFsLWVkaXRvciB0ZXN0aW5nKS4gVHJlYXRcbiAgICAgICAgICAgIC8vIFwibm8gZXhjZXB0aW9uIHRocm93blwiIGFzIHN1Y2Nlc3MgYW5kIHN1cmZhY2UgdGhlIHJhdyByZXR1cm5cbiAgICAgICAgICAgIC8vIHZhbHVlIGFzIG1ldGFkYXRhIG9ubHkuXG4gICAgICAgICAgICBjb25zdCBmYWNhZGVSZXR1cm4gPSBhd2FpdCBwcmVmYWJNZ3IudmFsdWUuYXBwbHlQcmVmYWIobm9kZVV1aWQpO1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogeyBmYWNhZGVSZXR1cm4sIG5vZGVVdWlkIH0gfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvcj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyb3IpIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQ29ubmVjdCBhIHJlZ3VsYXIgbm9kZSB0byBhIHByZWZhYiBhc3NldCAobGluaykuXG4gICAgICogV3JhcHMgc2NlbmUgZmFjYWRlIGBsaW5rUHJlZmFiKG5vZGVVdWlkLCBhc3NldFV1aWQpYC5cbiAgICAgKi9cbiAgICBhc3luYyBsaW5rUHJlZmFiKG5vZGVVdWlkOiBzdHJpbmcsIGFzc2V0VXVpZDogc3RyaW5nKSB7XG4gICAgICAgIGNvbnN0IHByZWZhYk1nciA9IGdldFByZWZhYkZhY2FkZSgpO1xuICAgICAgICBpZiAoIXByZWZhYk1nci5vaykge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBwcmVmYWJNZ3IuZXJyb3IgfTtcbiAgICAgICAgfVxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgcHJlZmFiTWdyLnZhbHVlLmxpbmtQcmVmYWIobm9kZVV1aWQsIGFzc2V0VXVpZCk7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBkYXRhOiB7IGxpbmtlZDogcmVzdWx0LCBub2RlVXVpZCwgYXNzZXRVdWlkIH0gfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvcj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyb3IpIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQnJlYWsgdGhlIHByZWZhYiBjb25uZWN0aW9uIG9uIGEgbm9kZS5cbiAgICAgKiBXcmFwcyBzY2VuZSBmYWNhZGUgYHVubGlua1ByZWZhYihub2RlVXVpZCwgcmVtb3ZlTmVzdGVkKWAuXG4gICAgICovXG4gICAgYXN5bmMgdW5saW5rUHJlZmFiKG5vZGVVdWlkOiBzdHJpbmcsIHJlbW92ZU5lc3RlZDogYm9vbGVhbikge1xuICAgICAgICBjb25zdCBwcmVmYWJNZ3IgPSBnZXRQcmVmYWJGYWNhZGUoKTtcbiAgICAgICAgaWYgKCFwcmVmYWJNZ3Iub2spIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogcHJlZmFiTWdyLmVycm9yIH07XG4gICAgICAgIH1cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHByZWZhYk1nci52YWx1ZS51bmxpbmtQcmVmYWIobm9kZVV1aWQsIHJlbW92ZU5lc3RlZCk7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBkYXRhOiB7IHVubGlua2VkOiByZXN1bHQsIG5vZGVVdWlkLCByZW1vdmVOZXN0ZWQgfSB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycm9yPy5tZXNzYWdlID8/IFN0cmluZyhlcnJvcikgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBSZWFkIHRoZSBwcmVmYWIgZHVtcCBmb3IgYSBwcmVmYWIgaW5zdGFuY2Ugbm9kZS5cbiAgICAgKiBXcmFwcyBzY2VuZSBmYWNhZGUgYGdldFByZWZhYkRhdGEobm9kZVV1aWQpYC5cbiAgICAgKi9cbiAgICBnZXRQcmVmYWJEYXRhKG5vZGVVdWlkOiBzdHJpbmcpIHtcbiAgICAgICAgY29uc3QgcHJlZmFiTWdyID0gZ2V0UHJlZmFiRmFjYWRlKCk7XG4gICAgICAgIGlmICghcHJlZmFiTWdyLm9rKSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHByZWZhYk1nci5lcnJvciB9O1xuICAgICAgICB9XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBkYXRhID0gcHJlZmFiTWdyLnZhbHVlLmdldFByZWZhYkRhdGEobm9kZVV1aWQpO1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZGF0YSB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycm9yPy5tZXNzYWdlID8/IFN0cmluZyhlcnJvcikgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBBcHBlbmQgYSBjYy5FdmVudEhhbmRsZXIgZW50cnkgdG8gYSBjb21wb25lbnQncyBldmVudCBhcnJheVxuICAgICAqIChlLmcuIGNjLkJ1dHRvbi5jbGlja0V2ZW50cywgY2MuVG9nZ2xlLmNoZWNrRXZlbnRzKS5cbiAgICAgKlxuICAgICAqIFBlcnNpc3RlbmNlIG5vdGUgKENMQVVERS5tZCBMYW5kbWluZSAjMTEpOiBzY2VuZS1zY3JpcHQgYGFyci5wdXNoYFxuICAgICAqIG9ubHkgbXV0YXRlcyB0aGUgcnVudGltZSBjYy5Db21wb25lbnQgaW5zdGFuY2U7IHRoZSBlZGl0b3Inc1xuICAgICAqIHNlcmlhbGl6YXRpb24gbW9kZWwgKHdoYXQgYHNhdmUtc2NlbmVgIHdyaXRlcyB0byBkaXNrKSBkb2VzIG5vdCBzZWVcbiAgICAgKiB0aGUgY2hhbmdlLiBUaGUgaG9zdC1zaWRlIGNhbGxlciAoYGNvbXBvbmVudC10b29scy50c2ApIGlzXG4gICAgICogcmVzcG9uc2libGUgZm9yIG51ZGdpbmcgdGhlIG1vZGVsIGFmdGVyd2FyZHMgdmlhIGEgbm8tb3BcbiAgICAgKiBgc2V0LXByb3BlcnR5YCBvbiBhIGNvbXBvbmVudCBmaWVsZCDigJQgY2FsbGluZyBgc2V0LXByb3BlcnR5YCBmcm9tXG4gICAgICogaGVyZSBkb2Vzbid0IHByb3BhZ2F0ZSAoc2NlbmUtcHJvY2VzcyBJUEMgc2hvcnQtY2lyY3VpdHMgYW5kXG4gICAgICogc2tpcHMgdGhlIG1vZGVsIHN5bmMpLiBXZSBzdXJmYWNlIGBjb21wb25lbnRVdWlkYCBhbmRcbiAgICAgKiBgY29tcG9uZW50RW5hYmxlZGAgc28gdGhlIGNhbGxlciBoYXMgd2hhdCBpdCBuZWVkcy5cbiAgICAgKi9cbiAgICBhZGRFdmVudEhhbmRsZXIoXG4gICAgICAgIG5vZGVVdWlkOiBzdHJpbmcsXG4gICAgICAgIGNvbXBvbmVudFR5cGU6IHN0cmluZyxcbiAgICAgICAgZXZlbnRBcnJheVByb3BlcnR5OiBzdHJpbmcsXG4gICAgICAgIHRhcmdldFV1aWQ6IHN0cmluZyxcbiAgICAgICAgY29tcG9uZW50TmFtZTogc3RyaW5nLFxuICAgICAgICBoYW5kbGVyOiBzdHJpbmcsXG4gICAgICAgIGN1c3RvbUV2ZW50RGF0YT86IHN0cmluZyxcbiAgICApIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGNjID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IGN0eCA9IHJlc29sdmVDb21wb25lbnRDb250ZXh0KG5vZGVVdWlkLCBjb21wb25lbnRUeXBlKTtcbiAgICAgICAgICAgIGlmICghY3R4Lm9rKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBjdHguZXJyb3IgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHRhcmdldE5vZGUgPSBmaW5kTm9kZUJ5VXVpZERlZXAoY3R4LnNjZW5lLCB0YXJnZXRVdWlkKTtcbiAgICAgICAgICAgIGlmICghdGFyZ2V0Tm9kZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYFRhcmdldCBub2RlIHdpdGggVVVJRCAke3RhcmdldFV1aWR9IG5vdCBmb3VuZGAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGFyciA9IGN0eC5jb21wb25lbnRbZXZlbnRBcnJheVByb3BlcnR5XTtcbiAgICAgICAgICAgIGlmICghQXJyYXkuaXNBcnJheShhcnIpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgUHJvcGVydHkgJyR7ZXZlbnRBcnJheVByb3BlcnR5fScgb24gJHtjb21wb25lbnRUeXBlfSBpcyBub3QgYW4gYXJyYXkgKGdvdCAke3R5cGVvZiBhcnJ9KWAgfTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgZWggPSBuZXcgY2MuRXZlbnRIYW5kbGVyKCk7XG4gICAgICAgICAgICBlaC50YXJnZXQgPSB0YXJnZXROb2RlO1xuICAgICAgICAgICAgZWguY29tcG9uZW50ID0gY29tcG9uZW50TmFtZTtcbiAgICAgICAgICAgIGVoLmhhbmRsZXIgPSBoYW5kbGVyO1xuICAgICAgICAgICAgZWguY3VzdG9tRXZlbnREYXRhID0gY3VzdG9tRXZlbnREYXRhID8/ICcnO1xuICAgICAgICAgICAgYXJyLnB1c2goZWgpO1xuXG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5zZW5kKCdzY2VuZScsICdzbmFwc2hvdCcpO1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgaW5kZXg6IGFyci5sZW5ndGggLSAxLFxuICAgICAgICAgICAgICAgICAgICBjb3VudDogYXJyLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50VXVpZDogY3R4LmNvbXBvbmVudC51dWlkLFxuICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRFbmFibGVkOiBjdHguY29tcG9uZW50LmVuYWJsZWQgIT09IGZhbHNlLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycm9yPy5tZXNzYWdlID8/IFN0cmluZyhlcnJvcikgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBSZW1vdmUgYSBjYy5FdmVudEhhbmRsZXIgZW50cnkgYnkgaW5kZXgsIG9yIGJ5IG1hdGNoaW5nXG4gICAgICogKHRhcmdldFV1aWQsIGhhbmRsZXIpIHBhaXIuIElmIGJvdGggYXJlIHByb3ZpZGVkLCBpbmRleCB3aW5zLlxuICAgICAqXG4gICAgICogU2VlIGFkZEV2ZW50SGFuZGxlciBmb3IgdGhlIHBlcnNpc3RlbmNlIG5vdGUuIENhbGxlciBtdXN0IGZvbGxvdyB1cFxuICAgICAqIHdpdGggYSBob3N0LXNpZGUgYHNldC1wcm9wZXJ0eWAgbnVkZ2UgdXNpbmcgdGhlIHJldHVybmVkXG4gICAgICogYGNvbXBvbmVudFV1aWRgIC8gYGNvbXBvbmVudEVuYWJsZWRgIHRvIG1ha2UgdGhlIGNoYW5nZSB2aXNpYmxlIHRvXG4gICAgICogYHNhdmUtc2NlbmVgLlxuICAgICAqL1xuICAgIHJlbW92ZUV2ZW50SGFuZGxlcihcbiAgICAgICAgbm9kZVV1aWQ6IHN0cmluZyxcbiAgICAgICAgY29tcG9uZW50VHlwZTogc3RyaW5nLFxuICAgICAgICBldmVudEFycmF5UHJvcGVydHk6IHN0cmluZyxcbiAgICAgICAgaW5kZXg6IG51bWJlciB8IG51bGwsXG4gICAgICAgIHRhcmdldFV1aWQ6IHN0cmluZyB8IG51bGwsXG4gICAgICAgIGhhbmRsZXI6IHN0cmluZyB8IG51bGwsXG4gICAgKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBjdHggPSByZXNvbHZlQ29tcG9uZW50Q29udGV4dChub2RlVXVpZCwgY29tcG9uZW50VHlwZSk7XG4gICAgICAgICAgICBpZiAoIWN0eC5vaykge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogY3R4LmVycm9yIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBhcnIgPSBjdHguY29tcG9uZW50W2V2ZW50QXJyYXlQcm9wZXJ0eV07XG4gICAgICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkoYXJyKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYFByb3BlcnR5ICcke2V2ZW50QXJyYXlQcm9wZXJ0eX0nIG9uICR7Y29tcG9uZW50VHlwZX0gaXMgbm90IGFuIGFycmF5YCB9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBsZXQgcmVtb3ZlQXQgPSAtMTtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgaW5kZXggPT09ICdudW1iZXInICYmIGluZGV4ID49IDApIHtcbiAgICAgICAgICAgICAgICByZW1vdmVBdCA9IGluZGV4O1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0YXJnZXRVdWlkIHx8IGhhbmRsZXIpIHtcbiAgICAgICAgICAgICAgICAvLyBUcmltIGFyb3VuZCBjb21wYXJpc29ucyBzbyBjYWxsZXJzIHBhc3NpbmcgVVVJRHMgLyBoYW5kbGVyXG4gICAgICAgICAgICAgICAgLy8gbmFtZXMgd2l0aCBsZWFkaW5nL3RyYWlsaW5nIHdoaXRlc3BhY2UgKExMTSB0b29sIGFyZ3Mgb2Z0ZW5cbiAgICAgICAgICAgICAgICAvLyBjb21lIHdpdGggc3RyYXkgc3BhY2VzKSBzdGlsbCBmaW5kIGEgbWF0Y2guXG4gICAgICAgICAgICAgICAgY29uc3QgdGFyZ2V0VXVpZE5vcm0gPSB0YXJnZXRVdWlkPy50cmltKCkgfHwgbnVsbDtcbiAgICAgICAgICAgICAgICBjb25zdCBoYW5kbGVyTm9ybSA9IGhhbmRsZXI/LnRyaW0oKSB8fCBudWxsO1xuICAgICAgICAgICAgICAgIHJlbW92ZUF0ID0gYXJyLmZpbmRJbmRleCgoZWg6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBlaFRhcmdldFV1aWQgPSB0eXBlb2YgZWg/LnRhcmdldD8udXVpZCA9PT0gJ3N0cmluZycgPyBlaC50YXJnZXQudXVpZC50cmltKCkgOiBlaD8udGFyZ2V0Py51dWlkO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBlaEhhbmRsZXIgPSB0eXBlb2YgZWg/LmhhbmRsZXIgPT09ICdzdHJpbmcnID8gZWguaGFuZGxlci50cmltKCkgOiBlaD8uaGFuZGxlcjtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbWF0Y2hlc1RhcmdldCA9ICF0YXJnZXRVdWlkTm9ybSB8fCBlaFRhcmdldFV1aWQgPT09IHRhcmdldFV1aWROb3JtO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBtYXRjaGVzSGFuZGxlciA9ICFoYW5kbGVyTm9ybSB8fCBlaEhhbmRsZXIgPT09IGhhbmRsZXJOb3JtO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gbWF0Y2hlc1RhcmdldCAmJiBtYXRjaGVzSGFuZGxlcjtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChyZW1vdmVBdCA8IDAgfHwgcmVtb3ZlQXQgPj0gYXJyLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ05vIG1hdGNoaW5nIGV2ZW50IGhhbmRsZXIgdG8gcmVtb3ZlJyB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgcmVtb3ZlZCA9IGFyci5zcGxpY2UocmVtb3ZlQXQsIDEpWzBdO1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2Uuc2VuZCgnc2NlbmUnLCAnc25hcHNob3QnKTtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIGluZGV4OiByZW1vdmVBdCxcbiAgICAgICAgICAgICAgICAgICAgcmVtYWluaW5nOiBhcnIubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICByZW1vdmVkOiBzZXJpYWxpemVFdmVudEhhbmRsZXIocmVtb3ZlZCksXG4gICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudFV1aWQ6IGN0eC5jb21wb25lbnQudXVpZCxcbiAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50RW5hYmxlZDogY3R4LmNvbXBvbmVudC5lbmFibGVkICE9PSBmYWxzZSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvcj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyb3IpIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogSW5zcGVjdCBhIGNvbXBvbmVudCdzIEV2ZW50SGFuZGxlciBhcnJheSAocmVhZC1vbmx5KS5cbiAgICAgKi9cbiAgICBsaXN0RXZlbnRIYW5kbGVycyhub2RlVXVpZDogc3RyaW5nLCBjb21wb25lbnRUeXBlOiBzdHJpbmcsIGV2ZW50QXJyYXlQcm9wZXJ0eTogc3RyaW5nKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBjdHggPSByZXNvbHZlQ29tcG9uZW50Q29udGV4dChub2RlVXVpZCwgY29tcG9uZW50VHlwZSk7XG4gICAgICAgICAgICBpZiAoIWN0eC5vaykge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogY3R4LmVycm9yIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBhcnIgPSBjdHguY29tcG9uZW50W2V2ZW50QXJyYXlQcm9wZXJ0eV07XG4gICAgICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkoYXJyKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYFByb3BlcnR5ICcke2V2ZW50QXJyYXlQcm9wZXJ0eX0nIG9uICR7Y29tcG9uZW50VHlwZX0gaXMgbm90IGFuIGFycmF5YCB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgY291bnQ6IGFyci5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgIGhhbmRsZXJzOiBhcnIubWFwKHNlcmlhbGl6ZUV2ZW50SGFuZGxlciksXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3I/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycm9yKSB9O1xuICAgICAgICB9XG4gICAgfSxcblxufTsiXX0=