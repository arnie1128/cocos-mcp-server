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
const _captureStack = [];
let _origConsole = null;
function _formatArgs(a) {
    return a
        .map(x => {
        if (typeof x === 'string')
            return x;
        try {
            return JSON.stringify(x);
        }
        catch (_a) {
            return String(x);
        }
    })
        .join(' ');
}
function _ensureConsoleHook() {
    if (_origConsole)
        return;
    _origConsole = { log: console.log, warn: console.warn, error: console.error };
    const make = (level, orig) => (...a) => {
        const message = _formatArgs(a);
        const ts = Date.now();
        for (const arr of _captureStack)
            arr.push({ level, message, ts });
        try {
            orig.apply(console, a);
        }
        catch ( /* swallow */_a) { /* swallow */ }
    };
    console.log = make('log', _origConsole.log);
    console.warn = make('warn', _origConsole.warn);
    console.error = make('error', _origConsole.error);
}
function _maybeUnhookConsole() {
    if (_captureStack.length > 0 || !_origConsole)
        return;
    console.log = _origConsole.log;
    console.warn = _origConsole.warn;
    console.error = _origConsole.error;
    _origConsole = null;
}
exports.methods = {
    /**
     * v2.4.8 A3: invoke another scene-script method by name, capturing
     * console.{log,warn,error} during the call and returning capturedLogs
     * alongside the method's normal return envelope. Single round-trip.
     *
     * Behaviour:
     *  - If `methodName` does not exist, returns
     *    `{ success: false, error: "..." , capturedLogs: [] }` (empty).
     *  - If the inner method throws, the throw is caught and converted to
     *    `{ success: false, error, capturedLogs }` so the host always sees
     *    a structured envelope plus the logs that ran up to the throw.
     *  - If the inner method returns an object, capturedLogs is merged
     *    alongside its keys without overwriting (we use `?? captures`
     *    semantics: only set if not already present).
     */
    async runWithCapture(methodName, methodArgs) {
        var _a, _b;
        const captures = [];
        _captureStack.push(captures);
        _ensureConsoleHook();
        try {
            const fn = exports.methods[methodName];
            if (typeof fn !== 'function') {
                return {
                    success: false,
                    error: `runWithCapture: method ${methodName} not found`,
                    capturedLogs: captures,
                };
            }
            try {
                const result = await fn(...(methodArgs !== null && methodArgs !== void 0 ? methodArgs : []));
                if (result && typeof result === 'object' && !Array.isArray(result)) {
                    return Object.assign(Object.assign({}, result), { capturedLogs: (_a = result.capturedLogs) !== null && _a !== void 0 ? _a : captures });
                }
                return { success: true, data: result, capturedLogs: captures };
            }
            catch (err) {
                return {
                    success: false,
                    error: (_b = err === null || err === void 0 ? void 0 : err.message) !== null && _b !== void 0 ? _b : String(err),
                    capturedLogs: captures,
                };
            }
        }
        finally {
            const idx = _captureStack.indexOf(captures);
            if (idx >= 0)
                _captureStack.splice(idx, 1);
            _maybeUnhookConsole();
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
            // 設置屬性
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
                // 嘗試直接設置屬性
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
            // Trim around comparisons so callers passing UUIDs / handler
            // names with leading/trailing whitespace (LLM tool args often
            // come with stray spaces) still find a match. Crucial: the
            // outer guard tests the *trimmed* values too — otherwise a
            // whitespace-only targetUuid/handler would pass as truthy,
            // collapse to null after trim, and the predicate would match
            // every entry vacuously, silently deleting arr[0].
            const targetUuidNorm = (targetUuid === null || targetUuid === void 0 ? void 0 : targetUuid.trim()) || null;
            const handlerNorm = (handler === null || handler === void 0 ? void 0 : handler.trim()) || null;
            let removeAt = -1;
            if (typeof index === 'number' && index >= 0) {
                removeAt = index;
            }
            else if (targetUuidNorm || handlerNorm) {
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
    /**
     * v2.4.8 A2: cc.Animation drivers — see source/tools/animation-tools.ts.
     * Implementation note: cocos exposes the engine's `cc.Animation` (and
     * its sub-classes via `js.getClassByName`). We use the runtime API
     * (`getComponent('cc.Animation')`) rather than the editor's set-property
     * channel because the latter would only persist defaultClip / playOnLoad
     * but cannot trigger play()/stop() — those are runtime methods only.
     */
    getAnimationClips(nodeUuid) {
        var _a, _b, _c, _d;
        try {
            const { director } = require('cc');
            const scene = director.getScene();
            if (!scene)
                return { success: false, error: 'No active scene' };
            const node = findNodeByUuidDeep(scene, nodeUuid);
            if (!node)
                return { success: false, error: `Node ${nodeUuid} not found` };
            const anim = node.getComponent('cc.Animation');
            if (!anim) {
                return { success: false, error: `Node ${nodeUuid} has no cc.Animation component` };
            }
            const clips = (_a = anim.clips) !== null && _a !== void 0 ? _a : [];
            const defaultClipName = (_c = (_b = anim.defaultClip) === null || _b === void 0 ? void 0 : _b.name) !== null && _c !== void 0 ? _c : null;
            return {
                success: true,
                data: {
                    nodeUuid,
                    nodeName: node.name,
                    defaultClip: defaultClipName,
                    playOnLoad: anim.playOnLoad === true,
                    clips: clips.filter(c => c).map(c => {
                        var _a, _b, _c, _d;
                        return ({
                            name: (_a = c.name) !== null && _a !== void 0 ? _a : null,
                            uuid: (_c = (_b = c._uuid) !== null && _b !== void 0 ? _b : c.uuid) !== null && _c !== void 0 ? _c : null,
                            duration: typeof c.duration === 'number' ? c.duration : null,
                            wrapMode: (_d = c.wrapMode) !== null && _d !== void 0 ? _d : null,
                        });
                    }),
                },
            };
        }
        catch (error) {
            return { success: false, error: (_d = error === null || error === void 0 ? void 0 : error.message) !== null && _d !== void 0 ? _d : String(error) };
        }
    },
    playAnimation(nodeUuid, clipName) {
        var _a, _b, _c, _d, _e, _f, _g;
        try {
            const { director } = require('cc');
            const scene = director.getScene();
            if (!scene)
                return { success: false, error: 'No active scene' };
            const node = findNodeByUuidDeep(scene, nodeUuid);
            if (!node)
                return { success: false, error: `Node ${nodeUuid} not found` };
            const anim = node.getComponent('cc.Animation');
            if (!anim) {
                return { success: false, error: `Node ${nodeUuid} has no cc.Animation component` };
            }
            if (clipName) {
                // Validate clip exists before calling play() — cc.Animation.play
                // silently does nothing on unknown names which would mask
                // typos in AI-generated calls.
                const known = ((_a = anim.clips) !== null && _a !== void 0 ? _a : []).some((c) => (c === null || c === void 0 ? void 0 : c.name) === clipName);
                if (!known && (((_b = anim.defaultClip) === null || _b === void 0 ? void 0 : _b.name) !== clipName)) {
                    return {
                        success: false,
                        error: `Clip '${clipName}' is not registered on this Animation. Known: ${((_c = anim.clips) !== null && _c !== void 0 ? _c : []).map((c) => c === null || c === void 0 ? void 0 : c.name).filter(Boolean).join(', ') || '(none)'}.`,
                    };
                }
                anim.play(clipName);
            }
            else {
                if (!anim.defaultClip) {
                    return { success: false, error: 'No clipName given and no defaultClip configured' };
                }
                anim.play();
            }
            return {
                success: true,
                message: `Playing '${clipName !== null && clipName !== void 0 ? clipName : (_d = anim.defaultClip) === null || _d === void 0 ? void 0 : _d.name}' on ${node.name}`,
                data: { nodeUuid, clipName: (_f = clipName !== null && clipName !== void 0 ? clipName : (_e = anim.defaultClip) === null || _e === void 0 ? void 0 : _e.name) !== null && _f !== void 0 ? _f : null },
            };
        }
        catch (error) {
            return { success: false, error: (_g = error === null || error === void 0 ? void 0 : error.message) !== null && _g !== void 0 ? _g : String(error) };
        }
    },
    stopAnimation(nodeUuid) {
        var _a;
        try {
            const { director } = require('cc');
            const scene = director.getScene();
            if (!scene)
                return { success: false, error: 'No active scene' };
            const node = findNodeByUuidDeep(scene, nodeUuid);
            if (!node)
                return { success: false, error: `Node ${nodeUuid} not found` };
            const anim = node.getComponent('cc.Animation');
            if (!anim) {
                return { success: false, error: `Node ${nodeUuid} has no cc.Animation component` };
            }
            anim.stop();
            return { success: true, message: `Stopped animation on ${node.name}` };
        }
        catch (error) {
            return { success: false, error: (_a = error === null || error === void 0 ? void 0 : error.message) !== null && _a !== void 0 ? _a : String(error) };
        }
    },
    /**
     * Resolve a clip name → asset uuid on a node's cc.Animation. Returns
     * the matching clip's `_uuid` along with the cc.Animation component
     * index inside `__comps__`, both of which the host-side
     * animation_set_clip handler needs to issue `set-property` writes.
     *
     * Why host-side does the actual write: Landmine #11 — scalar
     * property writes via the editor's set-property channel propagate
     * to the serialization model immediately. Direct runtime mutation
     * (`anim.defaultClip = x`) only updates layer (a) and may not
     * persist on save_scene. So scene-script returns the metadata; host
     * does the persistence.
     */
    queryAnimationSetTargets(nodeUuid, clipName) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        try {
            const { director } = require('cc');
            const scene = director.getScene();
            if (!scene)
                return { success: false, error: 'No active scene' };
            const node = findNodeByUuidDeep(scene, nodeUuid);
            if (!node)
                return { success: false, error: `Node ${nodeUuid} not found` };
            const components = ((_b = (_a = node._components) !== null && _a !== void 0 ? _a : node.components) !== null && _b !== void 0 ? _b : []);
            const compIndex = components.findIndex(c => { var _a; return ((_a = c === null || c === void 0 ? void 0 : c.constructor) === null || _a === void 0 ? void 0 : _a.name) === 'Animation' || (c === null || c === void 0 ? void 0 : c.__classname__) === 'cc.Animation' || (c === null || c === void 0 ? void 0 : c._cid) === 'cc.Animation'; });
            const anim = node.getComponent('cc.Animation');
            if (!anim || compIndex === -1) {
                return { success: false, error: `Node ${nodeUuid} has no cc.Animation component` };
            }
            let clipUuid = null;
            if (clipName !== null && clipName !== undefined) {
                const clip = ((_c = anim.clips) !== null && _c !== void 0 ? _c : []).find((c) => (c === null || c === void 0 ? void 0 : c.name) === clipName);
                if (!clip) {
                    return {
                        success: false,
                        error: `Clip '${clipName}' is not registered on this Animation. Known: ${((_d = anim.clips) !== null && _d !== void 0 ? _d : []).map((c) => c === null || c === void 0 ? void 0 : c.name).filter(Boolean).join(', ') || '(none)'}.`,
                    };
                }
                clipUuid = (_f = (_e = clip._uuid) !== null && _e !== void 0 ? _e : clip.uuid) !== null && _f !== void 0 ? _f : null;
                if (!clipUuid) {
                    return { success: false, error: `Clip '${clipName}' has no asset uuid; cannot persist as defaultClip.` };
                }
            }
            return {
                success: true,
                data: {
                    componentIndex: compIndex,
                    clipUuid,
                    currentDefaultClip: (_h = (_g = anim.defaultClip) === null || _g === void 0 ? void 0 : _g.name) !== null && _h !== void 0 ? _h : null,
                    currentPlayOnLoad: anim.playOnLoad === true,
                },
            };
        }
        catch (error) {
            return { success: false, error: (_j = error === null || error === void 0 ? void 0 : error.message) !== null && _j !== void 0 ? _j : String(error) };
        }
    },
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NlbmUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zb3VyY2Uvc2NlbmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsK0JBQTRCO0FBQzVCLE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUEsV0FBSSxFQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLGNBQWMsQ0FBQyxDQUFDLENBQUM7QUFxQnpELFNBQVMsZUFBZTs7SUFDcEIsSUFBSSxPQUFPLEdBQUcsS0FBSyxXQUFXLElBQUksR0FBRyxLQUFLLElBQUksRUFBRSxDQUFDO1FBQzdDLE9BQU8sRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSw2RUFBNkUsRUFBRSxDQUFDO0lBQy9HLENBQUM7SUFDRCxNQUFNLFVBQVUsR0FBb0M7UUFDaEQsR0FBRyxDQUFDLE1BQU07UUFDVixNQUFBLEdBQUcsQ0FBQyxrQkFBa0IsMENBQUUsUUFBUTtRQUNoQyxHQUFHLENBQUMsa0JBQThDO0tBQ3JELENBQUM7SUFDRixnRUFBZ0U7SUFDaEUsK0RBQStEO0lBQy9ELE1BQU0sUUFBUSxHQUE4QixDQUFDLGNBQWMsRUFBRSxhQUFhLEVBQUUsWUFBWSxFQUFFLGNBQWMsRUFBRSxlQUFlLENBQUMsQ0FBQztJQUMzSCxLQUFLLE1BQU0sU0FBUyxJQUFJLFVBQVUsRUFBRSxDQUFDO1FBQ2pDLElBQUksU0FBUyxJQUFJLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxPQUFRLFNBQWlCLENBQUMsQ0FBQyxDQUFDLEtBQUssVUFBVSxDQUFDLEVBQUUsQ0FBQztZQUNoRixPQUFPLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLENBQUM7UUFDMUMsQ0FBQztJQUNMLENBQUM7SUFDRCxPQUFPO1FBQ0gsRUFBRSxFQUFFLEtBQUs7UUFDVCxLQUFLLEVBQUUseUtBQXlLO0tBQ25MLENBQUM7QUFDTixDQUFD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LG1DQUFJLElBQUk7b0JBQ2xELGlCQUFpQixFQUFFLElBQUksQ0FBQyxVQUFVLEtBQUssSUFBSTtpQkFDOUM7YUFDSixDQUFDO1FBQ04sQ0FBQztRQUFDLE9BQU8sS0FBVSxFQUFFLENBQUM7WUFDbEIsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLE1BQUEsS0FBSyxhQUFMLEtBQUssdUJBQUwsS0FBSyxDQUFFLE9BQU8sbUNBQUksTUFBTSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7UUFDdEUsQ0FBQztJQUNMLENBQUM7Q0FFSixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgam9pbiB9IGZyb20gJ3BhdGgnO1xubW9kdWxlLnBhdGhzLnB1c2goam9pbihFZGl0b3IuQXBwLnBhdGgsICdub2RlX21vZHVsZXMnKSk7XG5cbi8vIGBjY2VgIGlzIGluamVjdGVkIGJ5IENvY29zIEVkaXRvciBpbnRvIHRoZSBzY2VuZS1zY3JpcHQgZ2xvYmFsIHNjb3BlLlxuLy8gSXQgaXMgbm90IGRlY2xhcmVkIGluIGBAY29jb3MvY3JlYXRvci10eXBlc2AgZXhwb3J0czsgZGVjbGFyZSBhIG1pbmltYWxcbi8vIHJ1bnRpbWUgc2hhcGUganVzdCBmb3Igd2hhdCB3ZSB0b3VjaCBoZXJlIHNvIFR5cGVTY3JpcHQgc3RheXMgc3RyaWN0LlxuZGVjbGFyZSBjb25zdCBjY2U6IHVuZGVmaW5lZCB8IHtcbiAgICBQcmVmYWI/OiBQcmVmYWJGYWNhZGU7XG4gICAgU2NlbmVGYWNhZGVNYW5hZ2VyPzogeyBpbnN0YW5jZT86IFByZWZhYkZhY2FkZSB9ICYgUHJlZmFiRmFjYWRlO1xufTtcblxuaW50ZXJmYWNlIFByZWZhYkZhY2FkZSB7XG4gICAgY3JlYXRlUHJlZmFiKG5vZGVVdWlkOiBzdHJpbmcsIHVybDogc3RyaW5nKTogUHJvbWlzZTxhbnk+O1xuICAgIGFwcGx5UHJlZmFiKG5vZGVVdWlkOiBzdHJpbmcpOiBQcm9taXNlPGFueT47XG4gICAgbGlua1ByZWZhYihub2RlVXVpZDogc3RyaW5nLCBhc3NldFV1aWQ6IHN0cmluZyk6IGFueTtcbiAgICB1bmxpbmtQcmVmYWIobm9kZVV1aWQ6IHN0cmluZywgcmVtb3ZlTmVzdGVkOiBib29sZWFuKTogYW55O1xuICAgIGdldFByZWZhYkRhdGEobm9kZVV1aWQ6IHN0cmluZyk6IGFueTtcbiAgICByZXN0b3JlUHJlZmFiPyh1dWlkOiBzdHJpbmcsIGFzc2V0VXVpZDogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPjtcbn1cblxudHlwZSBGYWNhZGVMb29rdXAgPSB7IG9rOiB0cnVlOyB2YWx1ZTogUHJlZmFiRmFjYWRlIH0gfCB7IG9rOiBmYWxzZTsgZXJyb3I6IHN0cmluZyB9O1xuXG5mdW5jdGlvbiBnZXRQcmVmYWJGYWNhZGUoKTogRmFjYWRlTG9va3VwIHtcbiAgICBpZiAodHlwZW9mIGNjZSA9PT0gJ3VuZGVmaW5lZCcgfHwgY2NlID09PSBudWxsKSB7XG4gICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6ICdjY2UgZ2xvYmFsIGlzIG5vdCBhdmFpbGFibGU7IHRoaXMgbWV0aG9kIG11c3QgcnVuIGluIGEgc2NlbmUtc2NyaXB0IGNvbnRleHQnIH07XG4gICAgfVxuICAgIGNvbnN0IGNhbmRpZGF0ZXM6IEFycmF5PFByZWZhYkZhY2FkZSB8IHVuZGVmaW5lZD4gPSBbXG4gICAgICAgIGNjZS5QcmVmYWIsXG4gICAgICAgIGNjZS5TY2VuZUZhY2FkZU1hbmFnZXI/Lmluc3RhbmNlLFxuICAgICAgICBjY2UuU2NlbmVGYWNhZGVNYW5hZ2VyIGFzIFByZWZhYkZhY2FkZSB8IHVuZGVmaW5lZCxcbiAgICBdO1xuICAgIC8vIEVuc3VyZSB0aGUgY2FuZGlkYXRlIGV4cG9zZXMgZXZlcnkgZmFjYWRlIG1ldGhvZCB3ZSBtYXkgY2FsbDtcbiAgICAvLyBhIHBhcnRpYWwgY2FuZGlkYXRlIHdvdWxkIGNyYXNoIGF0IHRoZSBmaXJzdCBtaXNzaW5nIG1ldGhvZC5cbiAgICBjb25zdCByZXF1aXJlZDogQXJyYXk8a2V5b2YgUHJlZmFiRmFjYWRlPiA9IFsnY3JlYXRlUHJlZmFiJywgJ2FwcGx5UHJlZmFiJywgJ2xpbmtQcmVmYWInLCAndW5saW5rUHJlZmFiJywgJ2dldFByZWZhYkRhdGEnXTtcbiAgICBmb3IgKGNvbnN0IGNhbmRpZGF0ZSBvZiBjYW5kaWRhdGVzKSB7XG4gICAgICAgIGlmIChjYW5kaWRhdGUgJiYgcmVxdWlyZWQuZXZlcnkobSA9PiB0eXBlb2YgKGNhbmRpZGF0ZSBhcyBhbnkpW21dID09PSAnZnVuY3Rpb24nKSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUsIHZhbHVlOiBjYW5kaWRhdGUgfTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4ge1xuICAgICAgICBvazogZmFsc2UsXG4gICAgICAgIGVycm9yOiAnTm8gY29tcGxldGUgcHJlZmFiIGZhY2FkZSBmb3VuZCBvbiBjY2UgKGNjZS5QcmVmYWIgLyBjY2UuU2NlbmVGYWNhZGVNYW5hZ2VyKS4gQ29jb3MgZWRpdG9yIGJ1aWxkIG1heSBub3QgZXhwb3NlIHRoZSBleHBlY3RlZCBtYW5hZ2VyIG9yIG9ubHkgZXhwb3NlcyBhIHBhcnRpYWwgc3VyZmFjZS4nLFxuICAgIH07XG59XG5cbnR5cGUgQ29tcG9uZW50TG9va3VwID1cbiAgICB8IHsgb2s6IHRydWU7IHNjZW5lOiBhbnk7IG5vZGU6IGFueTsgY29tcG9uZW50OiBhbnkgfVxuICAgIHwgeyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmcgfTtcblxuZnVuY3Rpb24gZmluZE5vZGVCeVV1aWREZWVwKHJvb3Q6IGFueSwgdXVpZDogc3RyaW5nKTogYW55IHtcbiAgICBpZiAoIXJvb3QpIHJldHVybiBudWxsO1xuICAgIGlmIChyb290Ll9pZCA9PT0gdXVpZCB8fCByb290LnV1aWQgPT09IHV1aWQpIHJldHVybiByb290O1xuICAgIGNvbnN0IGNoaWxkcmVuID0gcm9vdC5jaGlsZHJlbiA/PyByb290Ll9jaGlsZHJlbiA/PyBbXTtcbiAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIGNoaWxkcmVuKSB7XG4gICAgICAgIGNvbnN0IGhpdCA9IGZpbmROb2RlQnlVdWlkRGVlcChjaGlsZCwgdXVpZCk7XG4gICAgICAgIGlmIChoaXQpIHJldHVybiBoaXQ7XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiByZXNvbHZlQ29tcG9uZW50Q29udGV4dChub2RlVXVpZDogc3RyaW5nLCBjb21wb25lbnRUeXBlOiBzdHJpbmcpOiBDb21wb25lbnRMb29rdXAge1xuICAgIGNvbnN0IHsgZGlyZWN0b3IsIGpzIH0gPSByZXF1aXJlKCdjYycpO1xuICAgIGNvbnN0IHNjZW5lID0gZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICBpZiAoIXNjZW5lKSB7XG4gICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6ICdObyBhY3RpdmUgc2NlbmUnIH07XG4gICAgfVxuICAgIC8vIHNjZW5lLmdldENoaWxkQnlVdWlkIG9ubHkgd2Fsa3MgZGlyZWN0IGNoaWxkcmVuOyB1c2UgZGVwdGgtZmlyc3Qgc2VhcmNoLlxuICAgIGNvbnN0IG5vZGUgPSBmaW5kTm9kZUJ5VXVpZERlZXAoc2NlbmUsIG5vZGVVdWlkKTtcbiAgICBpZiAoIW5vZGUpIHtcbiAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogYE5vZGUgd2l0aCBVVUlEICR7bm9kZVV1aWR9IG5vdCBmb3VuZGAgfTtcbiAgICB9XG4gICAgY29uc3QgQ29tcG9uZW50Q2xhc3MgPSBqcy5nZXRDbGFzc0J5TmFtZShjb21wb25lbnRUeXBlKTtcbiAgICBpZiAoIUNvbXBvbmVudENsYXNzKSB7XG4gICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGBDb21wb25lbnQgdHlwZSAke2NvbXBvbmVudFR5cGV9IG5vdCBmb3VuZGAgfTtcbiAgICB9XG4gICAgY29uc3QgY29tcG9uZW50ID0gbm9kZS5nZXRDb21wb25lbnQoQ29tcG9uZW50Q2xhc3MpO1xuICAgIGlmICghY29tcG9uZW50KSB7XG4gICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGBDb21wb25lbnQgJHtjb21wb25lbnRUeXBlfSBub3QgZm91bmQgb24gbm9kZWAgfTtcbiAgICB9XG4gICAgcmV0dXJuIHsgb2s6IHRydWUsIHNjZW5lLCBub2RlLCBjb21wb25lbnQgfTtcbn1cblxuZnVuY3Rpb24gc2VyaWFsaXplRXZlbnRIYW5kbGVyKGVoOiBhbnkpIHtcbiAgICBpZiAoIWVoKSByZXR1cm4gbnVsbDtcbiAgICByZXR1cm4ge1xuICAgICAgICB0YXJnZXRVdWlkOiBlaC50YXJnZXQ/LnV1aWQgPz8gbnVsbCxcbiAgICAgICAgdGFyZ2V0TmFtZTogZWgudGFyZ2V0Py5uYW1lID8/IG51bGwsXG4gICAgICAgIGNvbXBvbmVudDogZWguY29tcG9uZW50ID8/IGVoLl9jb21wb25lbnROYW1lID8/IG51bGwsXG4gICAgICAgIGhhbmRsZXI6IGVoLmhhbmRsZXIgPz8gbnVsbCxcbiAgICAgICAgY3VzdG9tRXZlbnREYXRhOiBlaC5jdXN0b21FdmVudERhdGEgPz8gJycsXG4gICAgfTtcbn1cblxuLy8gdjIuNC44IEEzOiBzY2VuZS1zaWRlIGxvZyBjYXB0dXJlIChSb21hUm9nb3YgcGF0dGVybiBhZGFwdGVkKS5cbi8vIFN0YWNrLWJhc2VkIHNvIGNvbmN1cnJlbnQgcnVuU2NlbmVNZXRob2QgY2FsbHMgZWFjaCBnZXQgYW4gaXNvbGF0ZWRcbi8vIGNhcHR1cmUgYXJyYXk7IHRoZSBjb25zb2xlIGhvb2sgaXMgaW5zdGFsbGVkIG9uY2UgYW5kIHdyaXRlcyB0byBldmVyeVxuLy8gYWN0aXZlIGNhcHR1cmUgYXJyYXkgb24gdGhlIHN0YWNrLiBXaGVuIHRoZSBsYXN0IGNhbGwgcG9wcywgdGhlIGhvb2tcbi8vIGlzIHJlbW92ZWQgc28gbm9uLU1DUCBzY2VuZSBhY3Rpdml0eSBsb2dzIHRocm91Z2ggbm9ybWFsbHkgYWdhaW4uXG50eXBlIENhcHR1cmVkRW50cnkgPSB7IGxldmVsOiAnbG9nJyB8ICd3YXJuJyB8ICdlcnJvcic7IG1lc3NhZ2U6IHN0cmluZzsgdHM6IG51bWJlciB9O1xudHlwZSBDb25zb2xlU25hcHNob3QgPSB7IGxvZzogdHlwZW9mIGNvbnNvbGUubG9nOyB3YXJuOiB0eXBlb2YgY29uc29sZS53YXJuOyBlcnJvcjogdHlwZW9mIGNvbnNvbGUuZXJyb3IgfTtcblxuY29uc3QgX2NhcHR1cmVTdGFjazogQ2FwdHVyZWRFbnRyeVtdW10gPSBbXTtcbmxldCBfb3JpZ0NvbnNvbGU6IENvbnNvbGVTbmFwc2hvdCB8IG51bGwgPSBudWxsO1xuXG5mdW5jdGlvbiBfZm9ybWF0QXJncyhhOiB1bmtub3duW10pOiBzdHJpbmcge1xuICAgIHJldHVybiBhXG4gICAgICAgIC5tYXAoeCA9PiB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIHggPT09ICdzdHJpbmcnKSByZXR1cm4geDtcbiAgICAgICAgICAgIHRyeSB7IHJldHVybiBKU09OLnN0cmluZ2lmeSh4KTsgfSBjYXRjaCB7IHJldHVybiBTdHJpbmcoeCk7IH1cbiAgICAgICAgfSlcbiAgICAgICAgLmpvaW4oJyAnKTtcbn1cblxuZnVuY3Rpb24gX2Vuc3VyZUNvbnNvbGVIb29rKCk6IHZvaWQge1xuICAgIGlmIChfb3JpZ0NvbnNvbGUpIHJldHVybjtcbiAgICBfb3JpZ0NvbnNvbGUgPSB7IGxvZzogY29uc29sZS5sb2csIHdhcm46IGNvbnNvbGUud2FybiwgZXJyb3I6IGNvbnNvbGUuZXJyb3IgfTtcbiAgICBjb25zdCBtYWtlID0gKGxldmVsOiBDYXB0dXJlZEVudHJ5WydsZXZlbCddLCBvcmlnOiAoLi4uYTogYW55W10pID0+IHZvaWQpID0+XG4gICAgICAgICguLi5hOiBhbnlbXSk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgY29uc3QgbWVzc2FnZSA9IF9mb3JtYXRBcmdzKGEpO1xuICAgICAgICAgICAgY29uc3QgdHMgPSBEYXRlLm5vdygpO1xuICAgICAgICAgICAgZm9yIChjb25zdCBhcnIgb2YgX2NhcHR1cmVTdGFjaykgYXJyLnB1c2goeyBsZXZlbCwgbWVzc2FnZSwgdHMgfSk7XG4gICAgICAgICAgICB0cnkgeyBvcmlnLmFwcGx5KGNvbnNvbGUsIGEpOyB9IGNhdGNoIHsgLyogc3dhbGxvdyAqLyB9XG4gICAgICAgIH07XG4gICAgY29uc29sZS5sb2cgPSBtYWtlKCdsb2cnLCBfb3JpZ0NvbnNvbGUubG9nKTtcbiAgICBjb25zb2xlLndhcm4gPSBtYWtlKCd3YXJuJywgX29yaWdDb25zb2xlLndhcm4pO1xuICAgIGNvbnNvbGUuZXJyb3IgPSBtYWtlKCdlcnJvcicsIF9vcmlnQ29uc29sZS5lcnJvcik7XG59XG5cbmZ1bmN0aW9uIF9tYXliZVVuaG9va0NvbnNvbGUoKTogdm9pZCB7XG4gICAgaWYgKF9jYXB0dXJlU3RhY2subGVuZ3RoID4gMCB8fCAhX29yaWdDb25zb2xlKSByZXR1cm47XG4gICAgY29uc29sZS5sb2cgPSBfb3JpZ0NvbnNvbGUubG9nO1xuICAgIGNvbnNvbGUud2FybiA9IF9vcmlnQ29uc29sZS53YXJuO1xuICAgIGNvbnNvbGUuZXJyb3IgPSBfb3JpZ0NvbnNvbGUuZXJyb3I7XG4gICAgX29yaWdDb25zb2xlID0gbnVsbDtcbn1cblxuZXhwb3J0IGNvbnN0IG1ldGhvZHM6IHsgW2tleTogc3RyaW5nXTogKC4uLmFueTogYW55KSA9PiBhbnkgfSA9IHtcbiAgICAvKipcbiAgICAgKiB2Mi40LjggQTM6IGludm9rZSBhbm90aGVyIHNjZW5lLXNjcmlwdCBtZXRob2QgYnkgbmFtZSwgY2FwdHVyaW5nXG4gICAgICogY29uc29sZS57bG9nLHdhcm4sZXJyb3J9IGR1cmluZyB0aGUgY2FsbCBhbmQgcmV0dXJuaW5nIGNhcHR1cmVkTG9nc1xuICAgICAqIGFsb25nc2lkZSB0aGUgbWV0aG9kJ3Mgbm9ybWFsIHJldHVybiBlbnZlbG9wZS4gU2luZ2xlIHJvdW5kLXRyaXAuXG4gICAgICpcbiAgICAgKiBCZWhhdmlvdXI6XG4gICAgICogIC0gSWYgYG1ldGhvZE5hbWVgIGRvZXMgbm90IGV4aXN0LCByZXR1cm5zXG4gICAgICogICAgYHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBcIi4uLlwiICwgY2FwdHVyZWRMb2dzOiBbXSB9YCAoZW1wdHkpLlxuICAgICAqICAtIElmIHRoZSBpbm5lciBtZXRob2QgdGhyb3dzLCB0aGUgdGhyb3cgaXMgY2F1Z2h0IGFuZCBjb252ZXJ0ZWQgdG9cbiAgICAgKiAgICBgeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3IsIGNhcHR1cmVkTG9ncyB9YCBzbyB0aGUgaG9zdCBhbHdheXMgc2Vlc1xuICAgICAqICAgIGEgc3RydWN0dXJlZCBlbnZlbG9wZSBwbHVzIHRoZSBsb2dzIHRoYXQgcmFuIHVwIHRvIHRoZSB0aHJvdy5cbiAgICAgKiAgLSBJZiB0aGUgaW5uZXIgbWV0aG9kIHJldHVybnMgYW4gb2JqZWN0LCBjYXB0dXJlZExvZ3MgaXMgbWVyZ2VkXG4gICAgICogICAgYWxvbmdzaWRlIGl0cyBrZXlzIHdpdGhvdXQgb3ZlcndyaXRpbmcgKHdlIHVzZSBgPz8gY2FwdHVyZXNgXG4gICAgICogICAgc2VtYW50aWNzOiBvbmx5IHNldCBpZiBub3QgYWxyZWFkeSBwcmVzZW50KS5cbiAgICAgKi9cbiAgICBhc3luYyBydW5XaXRoQ2FwdHVyZShtZXRob2ROYW1lOiBzdHJpbmcsIG1ldGhvZEFyZ3M/OiB1bmtub3duW10pIHtcbiAgICAgICAgY29uc3QgY2FwdHVyZXM6IENhcHR1cmVkRW50cnlbXSA9IFtdO1xuICAgICAgICBfY2FwdHVyZVN0YWNrLnB1c2goY2FwdHVyZXMpO1xuICAgICAgICBfZW5zdXJlQ29uc29sZUhvb2soKTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGZuID0gbWV0aG9kc1ttZXRob2ROYW1lXTtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgZm4gIT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGBydW5XaXRoQ2FwdHVyZTogbWV0aG9kICR7bWV0aG9kTmFtZX0gbm90IGZvdW5kYCxcbiAgICAgICAgICAgICAgICAgICAgY2FwdHVyZWRMb2dzOiBjYXB0dXJlcyxcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBmbiguLi4obWV0aG9kQXJncyA/PyBbXSkpO1xuICAgICAgICAgICAgICAgIGlmIChyZXN1bHQgJiYgdHlwZW9mIHJlc3VsdCA9PT0gJ29iamVjdCcgJiYgIUFycmF5LmlzQXJyYXkocmVzdWx0KSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4geyAuLi5yZXN1bHQsIGNhcHR1cmVkTG9nczogKHJlc3VsdCBhcyBhbnkpLmNhcHR1cmVkTG9ncyA/PyBjYXB0dXJlcyB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBkYXRhOiByZXN1bHQsIGNhcHR1cmVkTG9nczogY2FwdHVyZXMgfTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIGVycm9yOiBlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVyciksXG4gICAgICAgICAgICAgICAgICAgIGNhcHR1cmVkTG9nczogY2FwdHVyZXMsXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgIGNvbnN0IGlkeCA9IF9jYXB0dXJlU3RhY2suaW5kZXhPZihjYXB0dXJlcyk7XG4gICAgICAgICAgICBpZiAoaWR4ID49IDApIF9jYXB0dXJlU3RhY2suc3BsaWNlKGlkeCwgMSk7XG4gICAgICAgICAgICBfbWF5YmVVbmhvb2tDb25zb2xlKCk7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQWRkIGNvbXBvbmVudCB0byBhIG5vZGVcbiAgICAgKi9cbiAgICBhZGRDb21wb25lbnRUb05vZGUobm9kZVV1aWQ6IHN0cmluZywgY29tcG9uZW50VHlwZTogc3RyaW5nKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCB7IGRpcmVjdG9yLCBqcyB9ID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICAgICAgICAgIGlmICghc2NlbmUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdObyBhY3RpdmUgc2NlbmUnIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIEZpbmQgbm9kZSBieSBVVUlEXG4gICAgICAgICAgICBjb25zdCBub2RlID0gc2NlbmUuZ2V0Q2hpbGRCeVV1aWQobm9kZVV1aWQpO1xuICAgICAgICAgICAgaWYgKCFub2RlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgTm9kZSB3aXRoIFVVSUQgJHtub2RlVXVpZH0gbm90IGZvdW5kYCB9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBHZXQgY29tcG9uZW50IGNsYXNzXG4gICAgICAgICAgICBjb25zdCBDb21wb25lbnRDbGFzcyA9IGpzLmdldENsYXNzQnlOYW1lKGNvbXBvbmVudFR5cGUpO1xuICAgICAgICAgICAgaWYgKCFDb21wb25lbnRDbGFzcykge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYENvbXBvbmVudCB0eXBlICR7Y29tcG9uZW50VHlwZX0gbm90IGZvdW5kYCB9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBBZGQgY29tcG9uZW50XG4gICAgICAgICAgICBjb25zdCBjb21wb25lbnQgPSBub2RlLmFkZENvbXBvbmVudChDb21wb25lbnRDbGFzcyk7XG4gICAgICAgICAgICByZXR1cm4geyBcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLCBcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiBgQ29tcG9uZW50ICR7Y29tcG9uZW50VHlwZX0gYWRkZWQgc3VjY2Vzc2Z1bGx5YCxcbiAgICAgICAgICAgICAgICBkYXRhOiB7IGNvbXBvbmVudElkOiBjb21wb25lbnQudXVpZCB9XG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycm9yLm1lc3NhZ2UgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBDcmVhdGUgYSBuZXcgbm9kZVxuICAgICAqL1xuICAgIGNyZWF0ZU5vZGUobmFtZTogc3RyaW5nLCBwYXJlbnRVdWlkPzogc3RyaW5nKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCB7IGRpcmVjdG9yLCBOb2RlIH0gPSByZXF1aXJlKCdjYycpO1xuICAgICAgICAgICAgY29uc3Qgc2NlbmUgPSBkaXJlY3Rvci5nZXRTY2VuZSgpO1xuICAgICAgICAgICAgaWYgKCFzY2VuZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ05vIGFjdGl2ZSBzY2VuZScgfTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3Qgbm9kZSA9IG5ldyBOb2RlKG5hbWUpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZiAocGFyZW50VXVpZCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHBhcmVudCA9IHNjZW5lLmdldENoaWxkQnlVdWlkKHBhcmVudFV1aWQpO1xuICAgICAgICAgICAgICAgIGlmIChwYXJlbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgcGFyZW50LmFkZENoaWxkKG5vZGUpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHNjZW5lLmFkZENoaWxkKG5vZGUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgc2NlbmUuYWRkQ2hpbGQobm9kZSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB7IFxuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsIFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBOb2RlICR7bmFtZX0gY3JlYXRlZCBzdWNjZXNzZnVsbHlgLFxuICAgICAgICAgICAgICAgIGRhdGE6IHsgdXVpZDogbm9kZS51dWlkLCBuYW1lOiBub2RlLm5hbWUgfVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvci5tZXNzYWdlIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogR2V0IG5vZGUgaW5mb3JtYXRpb25cbiAgICAgKi9cbiAgICBnZXROb2RlSW5mbyhub2RlVXVpZDogc3RyaW5nKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCB7IGRpcmVjdG9yIH0gPSByZXF1aXJlKCdjYycpO1xuICAgICAgICAgICAgY29uc3Qgc2NlbmUgPSBkaXJlY3Rvci5nZXRTY2VuZSgpO1xuICAgICAgICAgICAgaWYgKCFzY2VuZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ05vIGFjdGl2ZSBzY2VuZScgfTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3Qgbm9kZSA9IHNjZW5lLmdldENoaWxkQnlVdWlkKG5vZGVVdWlkKTtcbiAgICAgICAgICAgIGlmICghbm9kZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYE5vZGUgd2l0aCBVVUlEICR7bm9kZVV1aWR9IG5vdCBmb3VuZGAgfTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgdXVpZDogbm9kZS51dWlkLFxuICAgICAgICAgICAgICAgICAgICBuYW1lOiBub2RlLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgIGFjdGl2ZTogbm9kZS5hY3RpdmUsXG4gICAgICAgICAgICAgICAgICAgIHBvc2l0aW9uOiBub2RlLnBvc2l0aW9uLFxuICAgICAgICAgICAgICAgICAgICByb3RhdGlvbjogbm9kZS5yb3RhdGlvbixcbiAgICAgICAgICAgICAgICAgICAgc2NhbGU6IG5vZGUuc2NhbGUsXG4gICAgICAgICAgICAgICAgICAgIHBhcmVudDogbm9kZS5wYXJlbnQ/LnV1aWQsXG4gICAgICAgICAgICAgICAgICAgIGNoaWxkcmVuOiBub2RlLmNoaWxkcmVuLm1hcCgoY2hpbGQ6IGFueSkgPT4gY2hpbGQudXVpZCksXG4gICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudHM6IG5vZGUuY29tcG9uZW50cy5tYXAoKGNvbXA6IGFueSkgPT4gKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6IGNvbXAuY29uc3RydWN0b3IubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGVuYWJsZWQ6IGNvbXAuZW5hYmxlZFxuICAgICAgICAgICAgICAgICAgICB9KSlcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycm9yLm1lc3NhZ2UgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBHZXQgYWxsIG5vZGVzIGluIHNjZW5lXG4gICAgICovXG4gICAgZ2V0QWxsTm9kZXMoKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCB7IGRpcmVjdG9yIH0gPSByZXF1aXJlKCdjYycpO1xuICAgICAgICAgICAgY29uc3Qgc2NlbmUgPSBkaXJlY3Rvci5nZXRTY2VuZSgpO1xuICAgICAgICAgICAgaWYgKCFzY2VuZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ05vIGFjdGl2ZSBzY2VuZScgfTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3Qgbm9kZXM6IGFueVtdID0gW107XG4gICAgICAgICAgICBjb25zdCBjb2xsZWN0Tm9kZXMgPSAobm9kZTogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgbm9kZXMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgIHV1aWQ6IG5vZGUudXVpZCxcbiAgICAgICAgICAgICAgICAgICAgbmFtZTogbm9kZS5uYW1lLFxuICAgICAgICAgICAgICAgICAgICBhY3RpdmU6IG5vZGUuYWN0aXZlLFxuICAgICAgICAgICAgICAgICAgICBwYXJlbnQ6IG5vZGUucGFyZW50Py51dWlkXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgbm9kZS5jaGlsZHJlbi5mb3JFYWNoKChjaGlsZDogYW55KSA9PiBjb2xsZWN0Tm9kZXMoY2hpbGQpKTtcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIHNjZW5lLmNoaWxkcmVuLmZvckVhY2goKGNoaWxkOiBhbnkpID0+IGNvbGxlY3ROb2RlcyhjaGlsZCkpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBkYXRhOiBub2RlcyB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycm9yLm1lc3NhZ2UgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBGaW5kIG5vZGUgYnkgbmFtZVxuICAgICAqL1xuICAgIGZpbmROb2RlQnlOYW1lKG5hbWU6IHN0cmluZykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgeyBkaXJlY3RvciB9ID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICAgICAgICAgIGlmICghc2NlbmUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdObyBhY3RpdmUgc2NlbmUnIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IG5vZGUgPSBzY2VuZS5nZXRDaGlsZEJ5TmFtZShuYW1lKTtcbiAgICAgICAgICAgIGlmICghbm9kZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYE5vZGUgd2l0aCBuYW1lICR7bmFtZX0gbm90IGZvdW5kYCB9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICB1dWlkOiBub2RlLnV1aWQsXG4gICAgICAgICAgICAgICAgICAgIG5hbWU6IG5vZGUubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgYWN0aXZlOiBub2RlLmFjdGl2ZSxcbiAgICAgICAgICAgICAgICAgICAgcG9zaXRpb246IG5vZGUucG9zaXRpb25cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycm9yLm1lc3NhZ2UgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBHZXQgY3VycmVudCBzY2VuZSBpbmZvcm1hdGlvblxuICAgICAqL1xuICAgIGdldEN1cnJlbnRTY2VuZUluZm8oKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCB7IGRpcmVjdG9yIH0gPSByZXF1aXJlKCdjYycpO1xuICAgICAgICAgICAgY29uc3Qgc2NlbmUgPSBkaXJlY3Rvci5nZXRTY2VuZSgpO1xuICAgICAgICAgICAgaWYgKCFzY2VuZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ05vIGFjdGl2ZSBzY2VuZScgfTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgbmFtZTogc2NlbmUubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgdXVpZDogc2NlbmUudXVpZCxcbiAgICAgICAgICAgICAgICAgICAgbm9kZUNvdW50OiBzY2VuZS5jaGlsZHJlbi5sZW5ndGhcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycm9yLm1lc3NhZ2UgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBTZXQgbm9kZSBwcm9wZXJ0eVxuICAgICAqL1xuICAgIHNldE5vZGVQcm9wZXJ0eShub2RlVXVpZDogc3RyaW5nLCBwcm9wZXJ0eTogc3RyaW5nLCB2YWx1ZTogYW55KSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCB7IGRpcmVjdG9yIH0gPSByZXF1aXJlKCdjYycpO1xuICAgICAgICAgICAgY29uc3Qgc2NlbmUgPSBkaXJlY3Rvci5nZXRTY2VuZSgpO1xuICAgICAgICAgICAgaWYgKCFzY2VuZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ05vIGFjdGl2ZSBzY2VuZScgfTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3Qgbm9kZSA9IHNjZW5lLmdldENoaWxkQnlVdWlkKG5vZGVVdWlkKTtcbiAgICAgICAgICAgIGlmICghbm9kZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYE5vZGUgd2l0aCBVVUlEICR7bm9kZVV1aWR9IG5vdCBmb3VuZGAgfTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8g6Kit572u5bGs5oCnXG4gICAgICAgICAgICBpZiAocHJvcGVydHkgPT09ICdwb3NpdGlvbicpIHtcbiAgICAgICAgICAgICAgICBub2RlLnNldFBvc2l0aW9uKHZhbHVlLnggfHwgMCwgdmFsdWUueSB8fCAwLCB2YWx1ZS56IHx8IDApO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eSA9PT0gJ3JvdGF0aW9uJykge1xuICAgICAgICAgICAgICAgIG5vZGUuc2V0Um90YXRpb25Gcm9tRXVsZXIodmFsdWUueCB8fCAwLCB2YWx1ZS55IHx8IDAsIHZhbHVlLnogfHwgMCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5ID09PSAnc2NhbGUnKSB7XG4gICAgICAgICAgICAgICAgbm9kZS5zZXRTY2FsZSh2YWx1ZS54IHx8IDEsIHZhbHVlLnkgfHwgMSwgdmFsdWUueiB8fCAxKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHkgPT09ICdhY3RpdmUnKSB7XG4gICAgICAgICAgICAgICAgbm9kZS5hY3RpdmUgPSB2YWx1ZTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHkgPT09ICduYW1lJykge1xuICAgICAgICAgICAgICAgIG5vZGUubmFtZSA9IHZhbHVlO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyDlmJfoqabnm7TmjqXoqK3nva7lsazmgKdcbiAgICAgICAgICAgICAgICAobm9kZSBhcyBhbnkpW3Byb3BlcnR5XSA9IHZhbHVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4geyBcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLCBcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiBgUHJvcGVydHkgJyR7cHJvcGVydHl9JyB1cGRhdGVkIHN1Y2Nlc3NmdWxseWAgXG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycm9yLm1lc3NhZ2UgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBHZXQgc2NlbmUgaGllcmFyY2h5XG4gICAgICovXG4gICAgZ2V0U2NlbmVIaWVyYXJjaHkoaW5jbHVkZUNvbXBvbmVudHM6IGJvb2xlYW4gPSBmYWxzZSkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgeyBkaXJlY3RvciB9ID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICAgICAgICAgIGlmICghc2NlbmUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdObyBhY3RpdmUgc2NlbmUnIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IHByb2Nlc3NOb2RlID0gKG5vZGU6IGFueSk6IGFueSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0OiBhbnkgPSB7XG4gICAgICAgICAgICAgICAgICAgIG5hbWU6IG5vZGUubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgdXVpZDogbm9kZS51dWlkLFxuICAgICAgICAgICAgICAgICAgICBhY3RpdmU6IG5vZGUuYWN0aXZlLFxuICAgICAgICAgICAgICAgICAgICBjaGlsZHJlbjogW11cbiAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgaWYgKGluY2x1ZGVDb21wb25lbnRzKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdC5jb21wb25lbnRzID0gbm9kZS5jb21wb25lbnRzLm1hcCgoY29tcDogYW55KSA9PiAoe1xuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogY29tcC5jb25zdHJ1Y3Rvci5uYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgZW5hYmxlZDogY29tcC5lbmFibGVkXG4gICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAobm9kZS5jaGlsZHJlbiAmJiBub2RlLmNoaWxkcmVuLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0LmNoaWxkcmVuID0gbm9kZS5jaGlsZHJlbi5tYXAoKGNoaWxkOiBhbnkpID0+IHByb2Nlc3NOb2RlKGNoaWxkKSk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGNvbnN0IGhpZXJhcmNoeSA9IHNjZW5lLmNoaWxkcmVuLm1hcCgoY2hpbGQ6IGFueSkgPT4gcHJvY2Vzc05vZGUoY2hpbGQpKTtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IGhpZXJhcmNoeSB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycm9yLm1lc3NhZ2UgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBDcmVhdGUgcHJlZmFiIGFzc2V0IGZyb20gYSBub2RlIHZpYSB0aGUgb2ZmaWNpYWwgc2NlbmUgZmFjYWRlLlxuICAgICAqXG4gICAgICogUm91dGVzIHRocm91Z2ggYGNjZS5QcmVmYWIuY3JlYXRlUHJlZmFiYCAodGhlIENvY29zIGVkaXRvciBwcmVmYWJcbiAgICAgKiBtYW5hZ2VyIGV4cG9zZWQgaW4gc2NlbmUtc2NyaXB0IGNvbnRleHQpLiBUaGUgdXJsIGFjY2VwdHMgYm90aFxuICAgICAqIGBkYjovL2Fzc2V0cy8uLi5gIGFuZCBhYnNvbHV0ZSBmaWxlc3lzdGVtIHBhdGhzIGluIGRpZmZlcmVudCBlZGl0b3JcbiAgICAgKiBidWlsZHMsIHNvIHdlIHRyeSBib3RoIHNoYXBlcyBhbmQgc3VyZmFjZSB3aGljaGV2ZXIgZmFpbHMuXG4gICAgICovXG4gICAgYXN5bmMgY3JlYXRlUHJlZmFiRnJvbU5vZGUobm9kZVV1aWQ6IHN0cmluZywgdXJsOiBzdHJpbmcpIHtcbiAgICAgICAgY29uc3QgcHJlZmFiTWdyID0gZ2V0UHJlZmFiRmFjYWRlKCk7XG4gICAgICAgIGlmICghcHJlZmFiTWdyLm9rKSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHByZWZhYk1nci5lcnJvciB9O1xuICAgICAgICB9XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCB0cmllczogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgICAgIC8vIFByZWZlciBkYjovLyBmb3JtIChtYXRjaGVzIGFzc2V0LWRiIHF1ZXJ5IHJlc3VsdHMpIGFuZCBmYWxsXG4gICAgICAgICAgICAvLyBiYWNrIHRvIHdoYXRldmVyIHRoZSBjYWxsZXIgcGFzc2VkIHZlcmJhdGltLlxuICAgICAgICAgICAgY29uc3QgZGJVcmwgPSB1cmwuc3RhcnRzV2l0aCgnZGI6Ly8nKSA/IHVybCA6IGBkYjovL2Fzc2V0cy8ke3VybC5yZXBsYWNlKC9eXFwvKy8sICcnKX1gO1xuICAgICAgICAgICAgdHJpZXMucHVzaChkYlVybCk7XG4gICAgICAgICAgICBpZiAoZGJVcmwgIT09IHVybCkge1xuICAgICAgICAgICAgICAgIHRyaWVzLnB1c2godXJsKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgZXJyb3JzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICAgICAgZm9yIChjb25zdCBjYW5kaWRhdGUgb2YgdHJpZXMpIHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBwcmVmYWJNZ3IudmFsdWUuY3JlYXRlUHJlZmFiKG5vZGVVdWlkLCBjYW5kaWRhdGUpO1xuICAgICAgICAgICAgICAgICAgICAvLyBjY2UuUHJlZmFiLmNyZWF0ZVByZWZhYiByZXB1cnBvc2VzIHRoZSBzb3VyY2Ugbm9kZSBpbnRvIGFcbiAgICAgICAgICAgICAgICAgICAgLy8gcHJlZmFiIGluc3RhbmNlIHdpdGggYSBmcmVzaCBVVUlELCBzbyB0aGUgY2FsbGVyLXN1cHBsaWVkXG4gICAgICAgICAgICAgICAgICAgIC8vIG5vZGVVdWlkIGlzIG5vIGxvbmdlciB2YWxpZC4gUmVzb2x2ZSB0aGUgbmV3IFVVSUQgYnlcbiAgICAgICAgICAgICAgICAgICAgLy8gcXVlcnlpbmcgbm9kZXMgdGhhdCByZWZlcmVuY2UgdGhlIGZyZXNobHkgbWludGVkIGFzc2V0LlxuICAgICAgICAgICAgICAgICAgICBsZXQgYXNzZXRVdWlkOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiByZXN1bHQgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhc3NldFV1aWQgPSByZXN1bHQ7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocmVzdWx0ICYmIHR5cGVvZiByZXN1bHQgPT09ICdvYmplY3QnICYmIHR5cGVvZiAocmVzdWx0IGFzIGFueSkudXVpZCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFzc2V0VXVpZCA9IChyZXN1bHQgYXMgYW55KS51dWlkO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGxldCBpbnN0YW5jZU5vZGVVdWlkOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGFzc2V0VXVpZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBpbnN0YW5jZXM6IGFueSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LW5vZGVzLWJ5LWFzc2V0LXV1aWQnLCBhc3NldFV1aWQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KGluc3RhbmNlcykgJiYgaW5zdGFuY2VzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gTmV3bHktY3JlYXRlZCBwcmVmYWIgaW5zdGFuY2UgaXMgdHlwaWNhbGx5IHRoZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBsYXN0IGVudHJ5LiBDYXZlYXQ6IGlmIHRoZSBzYW1lIGFzc2V0IGFscmVhZHlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gaGFkIGluc3RhbmNlcyBpbiB0aGUgc2NlbmUsIFwibGFzdFwiIHBpY2tzIG9uZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBvZiB0aGVtIHJhdGhlciB0aGFuIHRoZSBuZXcgb25lLiBUaGUgZWRpdG9yXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGFwcGVhcnMgdG8gcmV0dXJuIGNyZWF0aW9uIG9yZGVyLCBidXQgdGhlIEFQSVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBpcyB1bmRvY3VtZW50ZWQ7IGNhbGxlcnMgcmVxdWlyaW5nIHN0cmljdFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBpZGVudGlmaWNhdGlvbiBzaG91bGQgc25hcHNob3QgYmVmb3JlIGNhbGxpbmcuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGluc3RhbmNlTm9kZVV1aWQgPSBpbnN0YW5jZXNbaW5zdGFuY2VzLmxlbmd0aCAtIDFdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIE5vbi1mYXRhbDogdGhlIGFzc2V0IHdhcyBjcmVhdGVkIGVpdGhlciB3YXkuXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdXJsOiBjYW5kaWRhdGUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc291cmNlTm9kZVV1aWQ6IG5vZGVVdWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByZWZhYkFzc2V0VXVpZDogYXNzZXRVdWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGluc3RhbmNlTm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmF3OiByZXN1bHQsXG4gICAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICAgICAgICAgIGVycm9ycy5wdXNoKGAke2NhbmRpZGF0ZX06ICR7ZXJyPy5tZXNzYWdlID8/IGVycn1gKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgIGVycm9yOiBgY2NlLlByZWZhYi5jcmVhdGVQcmVmYWIgZmFpbGVkOiAke2Vycm9ycy5qb2luKCc7ICcpfWAsXG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycm9yPy5tZXNzYWdlID8/IFN0cmluZyhlcnJvcikgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBQdXNoIHByZWZhYiBpbnN0YW5jZSBlZGl0cyBiYWNrIHRvIHRoZSBwcmVmYWIgYXNzZXQuXG4gICAgICogV3JhcHMgc2NlbmUgZmFjYWRlIGBhcHBseVByZWZhYihub2RlVXVpZClgLlxuICAgICAqL1xuICAgIGFzeW5jIGFwcGx5UHJlZmFiKG5vZGVVdWlkOiBzdHJpbmcpIHtcbiAgICAgICAgY29uc3QgcHJlZmFiTWdyID0gZ2V0UHJlZmFiRmFjYWRlKCk7XG4gICAgICAgIGlmICghcHJlZmFiTWdyLm9rKSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHByZWZhYk1nci5lcnJvciB9O1xuICAgICAgICB9XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBOb3RlOiBmYWNhZGVSZXR1cm4gZnJvbSBjY2UuU2NlbmVGYWNhZGUuYXBwbHlQcmVmYWIgaXMgb2JzZXJ2ZWRcbiAgICAgICAgICAgIC8vIHRvIGJlIGBmYWxzZWAgZXZlbiB3aGVuIHRoZSBhcHBseSBnZW51aW5lbHkgd3JpdGVzIHRvIGRpc2tcbiAgICAgICAgICAgIC8vICh2ZXJpZmllZCBkdXJpbmcgUDQgdjIuMS4wIHJlYWwtZWRpdG9yIHRlc3RpbmcpLiBUcmVhdFxuICAgICAgICAgICAgLy8gXCJubyBleGNlcHRpb24gdGhyb3duXCIgYXMgc3VjY2VzcyBhbmQgc3VyZmFjZSB0aGUgcmF3IHJldHVyblxuICAgICAgICAgICAgLy8gdmFsdWUgYXMgbWV0YWRhdGEgb25seS5cbiAgICAgICAgICAgIGNvbnN0IGZhY2FkZVJldHVybiA9IGF3YWl0IHByZWZhYk1nci52YWx1ZS5hcHBseVByZWZhYihub2RlVXVpZCk7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBkYXRhOiB7IGZhY2FkZVJldHVybiwgbm9kZVV1aWQgfSB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycm9yPy5tZXNzYWdlID8/IFN0cmluZyhlcnJvcikgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBDb25uZWN0IGEgcmVndWxhciBub2RlIHRvIGEgcHJlZmFiIGFzc2V0IChsaW5rKS5cbiAgICAgKiBXcmFwcyBzY2VuZSBmYWNhZGUgYGxpbmtQcmVmYWIobm9kZVV1aWQsIGFzc2V0VXVpZClgLlxuICAgICAqL1xuICAgIGFzeW5jIGxpbmtQcmVmYWIobm9kZVV1aWQ6IHN0cmluZywgYXNzZXRVdWlkOiBzdHJpbmcpIHtcbiAgICAgICAgY29uc3QgcHJlZmFiTWdyID0gZ2V0UHJlZmFiRmFjYWRlKCk7XG4gICAgICAgIGlmICghcHJlZmFiTWdyLm9rKSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHByZWZhYk1nci5lcnJvciB9O1xuICAgICAgICB9XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBwcmVmYWJNZ3IudmFsdWUubGlua1ByZWZhYihub2RlVXVpZCwgYXNzZXRVdWlkKTtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IHsgbGlua2VkOiByZXN1bHQsIG5vZGVVdWlkLCBhc3NldFV1aWQgfSB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycm9yPy5tZXNzYWdlID8/IFN0cmluZyhlcnJvcikgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBCcmVhayB0aGUgcHJlZmFiIGNvbm5lY3Rpb24gb24gYSBub2RlLlxuICAgICAqIFdyYXBzIHNjZW5lIGZhY2FkZSBgdW5saW5rUHJlZmFiKG5vZGVVdWlkLCByZW1vdmVOZXN0ZWQpYC5cbiAgICAgKi9cbiAgICBhc3luYyB1bmxpbmtQcmVmYWIobm9kZVV1aWQ6IHN0cmluZywgcmVtb3ZlTmVzdGVkOiBib29sZWFuKSB7XG4gICAgICAgIGNvbnN0IHByZWZhYk1nciA9IGdldFByZWZhYkZhY2FkZSgpO1xuICAgICAgICBpZiAoIXByZWZhYk1nci5vaykge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBwcmVmYWJNZ3IuZXJyb3IgfTtcbiAgICAgICAgfVxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgcHJlZmFiTWdyLnZhbHVlLnVubGlua1ByZWZhYihub2RlVXVpZCwgcmVtb3ZlTmVzdGVkKTtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IHsgdW5saW5rZWQ6IHJlc3VsdCwgbm9kZVV1aWQsIHJlbW92ZU5lc3RlZCB9IH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3I/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycm9yKSB9O1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFJlYWQgdGhlIHByZWZhYiBkdW1wIGZvciBhIHByZWZhYiBpbnN0YW5jZSBub2RlLlxuICAgICAqIFdyYXBzIHNjZW5lIGZhY2FkZSBgZ2V0UHJlZmFiRGF0YShub2RlVXVpZClgLlxuICAgICAqL1xuICAgIGdldFByZWZhYkRhdGEobm9kZVV1aWQ6IHN0cmluZykge1xuICAgICAgICBjb25zdCBwcmVmYWJNZ3IgPSBnZXRQcmVmYWJGYWNhZGUoKTtcbiAgICAgICAgaWYgKCFwcmVmYWJNZ3Iub2spIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogcHJlZmFiTWdyLmVycm9yIH07XG4gICAgICAgIH1cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGRhdGEgPSBwcmVmYWJNZ3IudmFsdWUuZ2V0UHJlZmFiRGF0YShub2RlVXVpZCk7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBkYXRhIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3I/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycm9yKSB9O1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEFwcGVuZCBhIGNjLkV2ZW50SGFuZGxlciBlbnRyeSB0byBhIGNvbXBvbmVudCdzIGV2ZW50IGFycmF5XG4gICAgICogKGUuZy4gY2MuQnV0dG9uLmNsaWNrRXZlbnRzLCBjYy5Ub2dnbGUuY2hlY2tFdmVudHMpLlxuICAgICAqXG4gICAgICogUGVyc2lzdGVuY2Ugbm90ZSAoQ0xBVURFLm1kIExhbmRtaW5lICMxMSk6IHNjZW5lLXNjcmlwdCBgYXJyLnB1c2hgXG4gICAgICogb25seSBtdXRhdGVzIHRoZSBydW50aW1lIGNjLkNvbXBvbmVudCBpbnN0YW5jZTsgdGhlIGVkaXRvcidzXG4gICAgICogc2VyaWFsaXphdGlvbiBtb2RlbCAod2hhdCBgc2F2ZS1zY2VuZWAgd3JpdGVzIHRvIGRpc2spIGRvZXMgbm90IHNlZVxuICAgICAqIHRoZSBjaGFuZ2UuIFRoZSBob3N0LXNpZGUgY2FsbGVyIChgY29tcG9uZW50LXRvb2xzLnRzYCkgaXNcbiAgICAgKiByZXNwb25zaWJsZSBmb3IgbnVkZ2luZyB0aGUgbW9kZWwgYWZ0ZXJ3YXJkcyB2aWEgYSBuby1vcFxuICAgICAqIGBzZXQtcHJvcGVydHlgIG9uIGEgY29tcG9uZW50IGZpZWxkIOKAlCBjYWxsaW5nIGBzZXQtcHJvcGVydHlgIGZyb21cbiAgICAgKiBoZXJlIGRvZXNuJ3QgcHJvcGFnYXRlIChzY2VuZS1wcm9jZXNzIElQQyBzaG9ydC1jaXJjdWl0cyBhbmRcbiAgICAgKiBza2lwcyB0aGUgbW9kZWwgc3luYykuIFdlIHN1cmZhY2UgYGNvbXBvbmVudFV1aWRgIGFuZFxuICAgICAqIGBjb21wb25lbnRFbmFibGVkYCBzbyB0aGUgY2FsbGVyIGhhcyB3aGF0IGl0IG5lZWRzLlxuICAgICAqL1xuICAgIGFkZEV2ZW50SGFuZGxlcihcbiAgICAgICAgbm9kZVV1aWQ6IHN0cmluZyxcbiAgICAgICAgY29tcG9uZW50VHlwZTogc3RyaW5nLFxuICAgICAgICBldmVudEFycmF5UHJvcGVydHk6IHN0cmluZyxcbiAgICAgICAgdGFyZ2V0VXVpZDogc3RyaW5nLFxuICAgICAgICBjb21wb25lbnROYW1lOiBzdHJpbmcsXG4gICAgICAgIGhhbmRsZXI6IHN0cmluZyxcbiAgICAgICAgY3VzdG9tRXZlbnREYXRhPzogc3RyaW5nLFxuICAgICkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgY2MgPSByZXF1aXJlKCdjYycpO1xuICAgICAgICAgICAgY29uc3QgY3R4ID0gcmVzb2x2ZUNvbXBvbmVudENvbnRleHQobm9kZVV1aWQsIGNvbXBvbmVudFR5cGUpO1xuICAgICAgICAgICAgaWYgKCFjdHgub2spIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGN0eC5lcnJvciB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgdGFyZ2V0Tm9kZSA9IGZpbmROb2RlQnlVdWlkRGVlcChjdHguc2NlbmUsIHRhcmdldFV1aWQpO1xuICAgICAgICAgICAgaWYgKCF0YXJnZXROb2RlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgVGFyZ2V0IG5vZGUgd2l0aCBVVUlEICR7dGFyZ2V0VXVpZH0gbm90IGZvdW5kYCB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgYXJyID0gY3R4LmNvbXBvbmVudFtldmVudEFycmF5UHJvcGVydHldO1xuICAgICAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KGFycikpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBQcm9wZXJ0eSAnJHtldmVudEFycmF5UHJvcGVydHl9JyBvbiAke2NvbXBvbmVudFR5cGV9IGlzIG5vdCBhbiBhcnJheSAoZ290ICR7dHlwZW9mIGFycn0pYCB9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBlaCA9IG5ldyBjYy5FdmVudEhhbmRsZXIoKTtcbiAgICAgICAgICAgIGVoLnRhcmdldCA9IHRhcmdldE5vZGU7XG4gICAgICAgICAgICBlaC5jb21wb25lbnQgPSBjb21wb25lbnROYW1lO1xuICAgICAgICAgICAgZWguaGFuZGxlciA9IGhhbmRsZXI7XG4gICAgICAgICAgICBlaC5jdXN0b21FdmVudERhdGEgPSBjdXN0b21FdmVudERhdGEgPz8gJyc7XG4gICAgICAgICAgICBhcnIucHVzaChlaCk7XG5cbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnNlbmQoJ3NjZW5lJywgJ3NuYXBzaG90Jyk7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICBpbmRleDogYXJyLmxlbmd0aCAtIDEsXG4gICAgICAgICAgICAgICAgICAgIGNvdW50OiBhcnIubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRVdWlkOiBjdHguY29tcG9uZW50LnV1aWQsXG4gICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudEVuYWJsZWQ6IGN0eC5jb21wb25lbnQuZW5hYmxlZCAhPT0gZmFsc2UsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3I/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycm9yKSB9O1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFJlbW92ZSBhIGNjLkV2ZW50SGFuZGxlciBlbnRyeSBieSBpbmRleCwgb3IgYnkgbWF0Y2hpbmdcbiAgICAgKiAodGFyZ2V0VXVpZCwgaGFuZGxlcikgcGFpci4gSWYgYm90aCBhcmUgcHJvdmlkZWQsIGluZGV4IHdpbnMuXG4gICAgICpcbiAgICAgKiBTZWUgYWRkRXZlbnRIYW5kbGVyIGZvciB0aGUgcGVyc2lzdGVuY2Ugbm90ZS4gQ2FsbGVyIG11c3QgZm9sbG93IHVwXG4gICAgICogd2l0aCBhIGhvc3Qtc2lkZSBgc2V0LXByb3BlcnR5YCBudWRnZSB1c2luZyB0aGUgcmV0dXJuZWRcbiAgICAgKiBgY29tcG9uZW50VXVpZGAgLyBgY29tcG9uZW50RW5hYmxlZGAgdG8gbWFrZSB0aGUgY2hhbmdlIHZpc2libGUgdG9cbiAgICAgKiBgc2F2ZS1zY2VuZWAuXG4gICAgICovXG4gICAgcmVtb3ZlRXZlbnRIYW5kbGVyKFxuICAgICAgICBub2RlVXVpZDogc3RyaW5nLFxuICAgICAgICBjb21wb25lbnRUeXBlOiBzdHJpbmcsXG4gICAgICAgIGV2ZW50QXJyYXlQcm9wZXJ0eTogc3RyaW5nLFxuICAgICAgICBpbmRleDogbnVtYmVyIHwgbnVsbCxcbiAgICAgICAgdGFyZ2V0VXVpZDogc3RyaW5nIHwgbnVsbCxcbiAgICAgICAgaGFuZGxlcjogc3RyaW5nIHwgbnVsbCxcbiAgICApIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGN0eCA9IHJlc29sdmVDb21wb25lbnRDb250ZXh0KG5vZGVVdWlkLCBjb21wb25lbnRUeXBlKTtcbiAgICAgICAgICAgIGlmICghY3R4Lm9rKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBjdHguZXJyb3IgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGFyciA9IGN0eC5jb21wb25lbnRbZXZlbnRBcnJheVByb3BlcnR5XTtcbiAgICAgICAgICAgIGlmICghQXJyYXkuaXNBcnJheShhcnIpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgUHJvcGVydHkgJyR7ZXZlbnRBcnJheVByb3BlcnR5fScgb24gJHtjb21wb25lbnRUeXBlfSBpcyBub3QgYW4gYXJyYXlgIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIFRyaW0gYXJvdW5kIGNvbXBhcmlzb25zIHNvIGNhbGxlcnMgcGFzc2luZyBVVUlEcyAvIGhhbmRsZXJcbiAgICAgICAgICAgIC8vIG5hbWVzIHdpdGggbGVhZGluZy90cmFpbGluZyB3aGl0ZXNwYWNlIChMTE0gdG9vbCBhcmdzIG9mdGVuXG4gICAgICAgICAgICAvLyBjb21lIHdpdGggc3RyYXkgc3BhY2VzKSBzdGlsbCBmaW5kIGEgbWF0Y2guIENydWNpYWw6IHRoZVxuICAgICAgICAgICAgLy8gb3V0ZXIgZ3VhcmQgdGVzdHMgdGhlICp0cmltbWVkKiB2YWx1ZXMgdG9vIOKAlCBvdGhlcndpc2UgYVxuICAgICAgICAgICAgLy8gd2hpdGVzcGFjZS1vbmx5IHRhcmdldFV1aWQvaGFuZGxlciB3b3VsZCBwYXNzIGFzIHRydXRoeSxcbiAgICAgICAgICAgIC8vIGNvbGxhcHNlIHRvIG51bGwgYWZ0ZXIgdHJpbSwgYW5kIHRoZSBwcmVkaWNhdGUgd291bGQgbWF0Y2hcbiAgICAgICAgICAgIC8vIGV2ZXJ5IGVudHJ5IHZhY3VvdXNseSwgc2lsZW50bHkgZGVsZXRpbmcgYXJyWzBdLlxuICAgICAgICAgICAgY29uc3QgdGFyZ2V0VXVpZE5vcm0gPSB0YXJnZXRVdWlkPy50cmltKCkgfHwgbnVsbDtcbiAgICAgICAgICAgIGNvbnN0IGhhbmRsZXJOb3JtID0gaGFuZGxlcj8udHJpbSgpIHx8IG51bGw7XG4gICAgICAgICAgICBsZXQgcmVtb3ZlQXQgPSAtMTtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgaW5kZXggPT09ICdudW1iZXInICYmIGluZGV4ID49IDApIHtcbiAgICAgICAgICAgICAgICByZW1vdmVBdCA9IGluZGV4O1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0YXJnZXRVdWlkTm9ybSB8fCBoYW5kbGVyTm9ybSkge1xuICAgICAgICAgICAgICAgIHJlbW92ZUF0ID0gYXJyLmZpbmRJbmRleCgoZWg6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBlaFRhcmdldFV1aWQgPSB0eXBlb2YgZWg/LnRhcmdldD8udXVpZCA9PT0gJ3N0cmluZycgPyBlaC50YXJnZXQudXVpZC50cmltKCkgOiBlaD8udGFyZ2V0Py51dWlkO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBlaEhhbmRsZXIgPSB0eXBlb2YgZWg/LmhhbmRsZXIgPT09ICdzdHJpbmcnID8gZWguaGFuZGxlci50cmltKCkgOiBlaD8uaGFuZGxlcjtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbWF0Y2hlc1RhcmdldCA9ICF0YXJnZXRVdWlkTm9ybSB8fCBlaFRhcmdldFV1aWQgPT09IHRhcmdldFV1aWROb3JtO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBtYXRjaGVzSGFuZGxlciA9ICFoYW5kbGVyTm9ybSB8fCBlaEhhbmRsZXIgPT09IGhhbmRsZXJOb3JtO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gbWF0Y2hlc1RhcmdldCAmJiBtYXRjaGVzSGFuZGxlcjtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChyZW1vdmVBdCA8IDAgfHwgcmVtb3ZlQXQgPj0gYXJyLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ05vIG1hdGNoaW5nIGV2ZW50IGhhbmRsZXIgdG8gcmVtb3ZlJyB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgcmVtb3ZlZCA9IGFyci5zcGxpY2UocmVtb3ZlQXQsIDEpWzBdO1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2Uuc2VuZCgnc2NlbmUnLCAnc25hcHNob3QnKTtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIGluZGV4OiByZW1vdmVBdCxcbiAgICAgICAgICAgICAgICAgICAgcmVtYWluaW5nOiBhcnIubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICByZW1vdmVkOiBzZXJpYWxpemVFdmVudEhhbmRsZXIocmVtb3ZlZCksXG4gICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudFV1aWQ6IGN0eC5jb21wb25lbnQudXVpZCxcbiAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50RW5hYmxlZDogY3R4LmNvbXBvbmVudC5lbmFibGVkICE9PSBmYWxzZSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvcj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyb3IpIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogSW5zcGVjdCBhIGNvbXBvbmVudCdzIEV2ZW50SGFuZGxlciBhcnJheSAocmVhZC1vbmx5KS5cbiAgICAgKi9cbiAgICBsaXN0RXZlbnRIYW5kbGVycyhub2RlVXVpZDogc3RyaW5nLCBjb21wb25lbnRUeXBlOiBzdHJpbmcsIGV2ZW50QXJyYXlQcm9wZXJ0eTogc3RyaW5nKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBjdHggPSByZXNvbHZlQ29tcG9uZW50Q29udGV4dChub2RlVXVpZCwgY29tcG9uZW50VHlwZSk7XG4gICAgICAgICAgICBpZiAoIWN0eC5vaykge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogY3R4LmVycm9yIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBhcnIgPSBjdHguY29tcG9uZW50W2V2ZW50QXJyYXlQcm9wZXJ0eV07XG4gICAgICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkoYXJyKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYFByb3BlcnR5ICcke2V2ZW50QXJyYXlQcm9wZXJ0eX0nIG9uICR7Y29tcG9uZW50VHlwZX0gaXMgbm90IGFuIGFycmF5YCB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgY291bnQ6IGFyci5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgIGhhbmRsZXJzOiBhcnIubWFwKHNlcmlhbGl6ZUV2ZW50SGFuZGxlciksXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3I/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycm9yKSB9O1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIHYyLjQuOCBBMjogY2MuQW5pbWF0aW9uIGRyaXZlcnMg4oCUIHNlZSBzb3VyY2UvdG9vbHMvYW5pbWF0aW9uLXRvb2xzLnRzLlxuICAgICAqIEltcGxlbWVudGF0aW9uIG5vdGU6IGNvY29zIGV4cG9zZXMgdGhlIGVuZ2luZSdzIGBjYy5BbmltYXRpb25gIChhbmRcbiAgICAgKiBpdHMgc3ViLWNsYXNzZXMgdmlhIGBqcy5nZXRDbGFzc0J5TmFtZWApLiBXZSB1c2UgdGhlIHJ1bnRpbWUgQVBJXG4gICAgICogKGBnZXRDb21wb25lbnQoJ2NjLkFuaW1hdGlvbicpYCkgcmF0aGVyIHRoYW4gdGhlIGVkaXRvcidzIHNldC1wcm9wZXJ0eVxuICAgICAqIGNoYW5uZWwgYmVjYXVzZSB0aGUgbGF0dGVyIHdvdWxkIG9ubHkgcGVyc2lzdCBkZWZhdWx0Q2xpcCAvIHBsYXlPbkxvYWRcbiAgICAgKiBidXQgY2Fubm90IHRyaWdnZXIgcGxheSgpL3N0b3AoKSDigJQgdGhvc2UgYXJlIHJ1bnRpbWUgbWV0aG9kcyBvbmx5LlxuICAgICAqL1xuICAgIGdldEFuaW1hdGlvbkNsaXBzKG5vZGVVdWlkOiBzdHJpbmcpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IgfSA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgICAgICBpZiAoIXNjZW5lKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdObyBhY3RpdmUgc2NlbmUnIH07XG4gICAgICAgICAgICBjb25zdCBub2RlID0gZmluZE5vZGVCeVV1aWREZWVwKHNjZW5lLCBub2RlVXVpZCk7XG4gICAgICAgICAgICBpZiAoIW5vZGUpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYE5vZGUgJHtub2RlVXVpZH0gbm90IGZvdW5kYCB9O1xuICAgICAgICAgICAgY29uc3QgYW5pbSA9IG5vZGUuZ2V0Q29tcG9uZW50KCdjYy5BbmltYXRpb24nKTtcbiAgICAgICAgICAgIGlmICghYW5pbSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYE5vZGUgJHtub2RlVXVpZH0gaGFzIG5vIGNjLkFuaW1hdGlvbiBjb21wb25lbnRgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBjbGlwczogYW55W10gPSBhbmltLmNsaXBzID8/IFtdO1xuICAgICAgICAgICAgY29uc3QgZGVmYXVsdENsaXBOYW1lID0gYW5pbS5kZWZhdWx0Q2xpcD8ubmFtZSA/PyBudWxsO1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgICAgIG5vZGVOYW1lOiBub2RlLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgIGRlZmF1bHRDbGlwOiBkZWZhdWx0Q2xpcE5hbWUsXG4gICAgICAgICAgICAgICAgICAgIHBsYXlPbkxvYWQ6IGFuaW0ucGxheU9uTG9hZCA9PT0gdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgY2xpcHM6IGNsaXBzLmZpbHRlcihjID0+IGMpLm1hcChjID0+ICh7XG4gICAgICAgICAgICAgICAgICAgICAgICBuYW1lOiBjLm5hbWUgPz8gbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IGMuX3V1aWQgPz8gYy51dWlkID8/IG51bGwsXG4gICAgICAgICAgICAgICAgICAgICAgICBkdXJhdGlvbjogdHlwZW9mIGMuZHVyYXRpb24gPT09ICdudW1iZXInID8gYy5kdXJhdGlvbiA6IG51bGwsXG4gICAgICAgICAgICAgICAgICAgICAgICB3cmFwTW9kZTogYy53cmFwTW9kZSA/PyBudWxsLFxuICAgICAgICAgICAgICAgICAgICB9KSksXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3I/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycm9yKSB9O1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIHBsYXlBbmltYXRpb24obm9kZVV1aWQ6IHN0cmluZywgY2xpcE5hbWU/OiBzdHJpbmcpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IgfSA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgICAgICBpZiAoIXNjZW5lKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdObyBhY3RpdmUgc2NlbmUnIH07XG4gICAgICAgICAgICBjb25zdCBub2RlID0gZmluZE5vZGVCeVV1aWREZWVwKHNjZW5lLCBub2RlVXVpZCk7XG4gICAgICAgICAgICBpZiAoIW5vZGUpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYE5vZGUgJHtub2RlVXVpZH0gbm90IGZvdW5kYCB9O1xuICAgICAgICAgICAgY29uc3QgYW5pbSA9IG5vZGUuZ2V0Q29tcG9uZW50KCdjYy5BbmltYXRpb24nKTtcbiAgICAgICAgICAgIGlmICghYW5pbSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYE5vZGUgJHtub2RlVXVpZH0gaGFzIG5vIGNjLkFuaW1hdGlvbiBjb21wb25lbnRgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoY2xpcE5hbWUpIHtcbiAgICAgICAgICAgICAgICAvLyBWYWxpZGF0ZSBjbGlwIGV4aXN0cyBiZWZvcmUgY2FsbGluZyBwbGF5KCkg4oCUIGNjLkFuaW1hdGlvbi5wbGF5XG4gICAgICAgICAgICAgICAgLy8gc2lsZW50bHkgZG9lcyBub3RoaW5nIG9uIHVua25vd24gbmFtZXMgd2hpY2ggd291bGQgbWFza1xuICAgICAgICAgICAgICAgIC8vIHR5cG9zIGluIEFJLWdlbmVyYXRlZCBjYWxscy5cbiAgICAgICAgICAgICAgICBjb25zdCBrbm93biA9IChhbmltLmNsaXBzID8/IFtdKS5zb21lKChjOiBhbnkpID0+IGM/Lm5hbWUgPT09IGNsaXBOYW1lKTtcbiAgICAgICAgICAgICAgICBpZiAoIWtub3duICYmIChhbmltLmRlZmF1bHRDbGlwPy5uYW1lICE9PSBjbGlwTmFtZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGBDbGlwICcke2NsaXBOYW1lfScgaXMgbm90IHJlZ2lzdGVyZWQgb24gdGhpcyBBbmltYXRpb24uIEtub3duOiAkeyhhbmltLmNsaXBzID8/IFtdKS5tYXAoKGM6IGFueSkgPT4gYz8ubmFtZSkuZmlsdGVyKEJvb2xlYW4pLmpvaW4oJywgJykgfHwgJyhub25lKSd9LmAsXG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGFuaW0ucGxheShjbGlwTmFtZSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGlmICghYW5pbS5kZWZhdWx0Q2xpcCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdObyBjbGlwTmFtZSBnaXZlbiBhbmQgbm8gZGVmYXVsdENsaXAgY29uZmlndXJlZCcgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYW5pbS5wbGF5KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogYFBsYXlpbmcgJyR7Y2xpcE5hbWUgPz8gYW5pbS5kZWZhdWx0Q2xpcD8ubmFtZX0nIG9uICR7bm9kZS5uYW1lfWAsXG4gICAgICAgICAgICAgICAgZGF0YTogeyBub2RlVXVpZCwgY2xpcE5hbWU6IGNsaXBOYW1lID8/IGFuaW0uZGVmYXVsdENsaXA/Lm5hbWUgPz8gbnVsbCB9LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvcj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyb3IpIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgc3RvcEFuaW1hdGlvbihub2RlVXVpZDogc3RyaW5nKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCB7IGRpcmVjdG9yIH0gPSByZXF1aXJlKCdjYycpO1xuICAgICAgICAgICAgY29uc3Qgc2NlbmUgPSBkaXJlY3Rvci5nZXRTY2VuZSgpO1xuICAgICAgICAgICAgaWYgKCFzY2VuZSkgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnTm8gYWN0aXZlIHNjZW5lJyB9O1xuICAgICAgICAgICAgY29uc3Qgbm9kZSA9IGZpbmROb2RlQnlVdWlkRGVlcChzY2VuZSwgbm9kZVV1aWQpO1xuICAgICAgICAgICAgaWYgKCFub2RlKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBOb2RlICR7bm9kZVV1aWR9IG5vdCBmb3VuZGAgfTtcbiAgICAgICAgICAgIGNvbnN0IGFuaW0gPSBub2RlLmdldENvbXBvbmVudCgnY2MuQW5pbWF0aW9uJyk7XG4gICAgICAgICAgICBpZiAoIWFuaW0pIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBOb2RlICR7bm9kZVV1aWR9IGhhcyBubyBjYy5BbmltYXRpb24gY29tcG9uZW50YCB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYW5pbS5zdG9wKCk7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBtZXNzYWdlOiBgU3RvcHBlZCBhbmltYXRpb24gb24gJHtub2RlLm5hbWV9YCB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycm9yPy5tZXNzYWdlID8/IFN0cmluZyhlcnJvcikgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBSZXNvbHZlIGEgY2xpcCBuYW1lIOKGkiBhc3NldCB1dWlkIG9uIGEgbm9kZSdzIGNjLkFuaW1hdGlvbi4gUmV0dXJuc1xuICAgICAqIHRoZSBtYXRjaGluZyBjbGlwJ3MgYF91dWlkYCBhbG9uZyB3aXRoIHRoZSBjYy5BbmltYXRpb24gY29tcG9uZW50XG4gICAgICogaW5kZXggaW5zaWRlIGBfX2NvbXBzX19gLCBib3RoIG9mIHdoaWNoIHRoZSBob3N0LXNpZGVcbiAgICAgKiBhbmltYXRpb25fc2V0X2NsaXAgaGFuZGxlciBuZWVkcyB0byBpc3N1ZSBgc2V0LXByb3BlcnR5YCB3cml0ZXMuXG4gICAgICpcbiAgICAgKiBXaHkgaG9zdC1zaWRlIGRvZXMgdGhlIGFjdHVhbCB3cml0ZTogTGFuZG1pbmUgIzExIOKAlCBzY2FsYXJcbiAgICAgKiBwcm9wZXJ0eSB3cml0ZXMgdmlhIHRoZSBlZGl0b3IncyBzZXQtcHJvcGVydHkgY2hhbm5lbCBwcm9wYWdhdGVcbiAgICAgKiB0byB0aGUgc2VyaWFsaXphdGlvbiBtb2RlbCBpbW1lZGlhdGVseS4gRGlyZWN0IHJ1bnRpbWUgbXV0YXRpb25cbiAgICAgKiAoYGFuaW0uZGVmYXVsdENsaXAgPSB4YCkgb25seSB1cGRhdGVzIGxheWVyIChhKSBhbmQgbWF5IG5vdFxuICAgICAqIHBlcnNpc3Qgb24gc2F2ZV9zY2VuZS4gU28gc2NlbmUtc2NyaXB0IHJldHVybnMgdGhlIG1ldGFkYXRhOyBob3N0XG4gICAgICogZG9lcyB0aGUgcGVyc2lzdGVuY2UuXG4gICAgICovXG4gICAgcXVlcnlBbmltYXRpb25TZXRUYXJnZXRzKG5vZGVVdWlkOiBzdHJpbmcsIGNsaXBOYW1lOiBzdHJpbmcgfCBudWxsKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCB7IGRpcmVjdG9yIH0gPSByZXF1aXJlKCdjYycpO1xuICAgICAgICAgICAgY29uc3Qgc2NlbmUgPSBkaXJlY3Rvci5nZXRTY2VuZSgpO1xuICAgICAgICAgICAgaWYgKCFzY2VuZSkgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnTm8gYWN0aXZlIHNjZW5lJyB9O1xuICAgICAgICAgICAgY29uc3Qgbm9kZSA9IGZpbmROb2RlQnlVdWlkRGVlcChzY2VuZSwgbm9kZVV1aWQpO1xuICAgICAgICAgICAgaWYgKCFub2RlKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBOb2RlICR7bm9kZVV1aWR9IG5vdCBmb3VuZGAgfTtcbiAgICAgICAgICAgIGNvbnN0IGNvbXBvbmVudHM6IGFueVtdID0gKG5vZGUuX2NvbXBvbmVudHMgPz8gbm9kZS5jb21wb25lbnRzID8/IFtdKTtcbiAgICAgICAgICAgIGNvbnN0IGNvbXBJbmRleCA9IGNvbXBvbmVudHMuZmluZEluZGV4KGMgPT4gYz8uY29uc3RydWN0b3I/Lm5hbWUgPT09ICdBbmltYXRpb24nIHx8IGM/Ll9fY2xhc3NuYW1lX18gPT09ICdjYy5BbmltYXRpb24nIHx8IGM/Ll9jaWQgPT09ICdjYy5BbmltYXRpb24nKTtcbiAgICAgICAgICAgIGNvbnN0IGFuaW0gPSBub2RlLmdldENvbXBvbmVudCgnY2MuQW5pbWF0aW9uJyk7XG4gICAgICAgICAgICBpZiAoIWFuaW0gfHwgY29tcEluZGV4ID09PSAtMSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYE5vZGUgJHtub2RlVXVpZH0gaGFzIG5vIGNjLkFuaW1hdGlvbiBjb21wb25lbnRgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBsZXQgY2xpcFV1aWQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICAgICAgICAgICAgaWYgKGNsaXBOYW1lICE9PSBudWxsICYmIGNsaXBOYW1lICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBjbGlwID0gKGFuaW0uY2xpcHMgPz8gW10pLmZpbmQoKGM6IGFueSkgPT4gYz8ubmFtZSA9PT0gY2xpcE5hbWUpO1xuICAgICAgICAgICAgICAgIGlmICghY2xpcCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgICAgICBlcnJvcjogYENsaXAgJyR7Y2xpcE5hbWV9JyBpcyBub3QgcmVnaXN0ZXJlZCBvbiB0aGlzIEFuaW1hdGlvbi4gS25vd246ICR7KGFuaW0uY2xpcHMgPz8gW10pLm1hcCgoYzogYW55KSA9PiBjPy5uYW1lKS5maWx0ZXIoQm9vbGVhbikuam9pbignLCAnKSB8fCAnKG5vbmUpJ30uYCxcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2xpcFV1aWQgPSBjbGlwLl91dWlkID8/IGNsaXAudXVpZCA/PyBudWxsO1xuICAgICAgICAgICAgICAgIGlmICghY2xpcFV1aWQpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgQ2xpcCAnJHtjbGlwTmFtZX0nIGhhcyBubyBhc3NldCB1dWlkOyBjYW5ub3QgcGVyc2lzdCBhcyBkZWZhdWx0Q2xpcC5gIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50SW5kZXg6IGNvbXBJbmRleCxcbiAgICAgICAgICAgICAgICAgICAgY2xpcFV1aWQsXG4gICAgICAgICAgICAgICAgICAgIGN1cnJlbnREZWZhdWx0Q2xpcDogYW5pbS5kZWZhdWx0Q2xpcD8ubmFtZSA/PyBudWxsLFxuICAgICAgICAgICAgICAgICAgICBjdXJyZW50UGxheU9uTG9hZDogYW5pbS5wbGF5T25Mb2FkID09PSB0cnVlLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycm9yPy5tZXNzYWdlID8/IFN0cmluZyhlcnJvcikgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cbn07Il19