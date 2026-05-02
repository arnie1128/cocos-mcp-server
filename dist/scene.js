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
const CAPTURE_MAX_ENTRIES = 500;
const CAPTURE_MAX_BYTES = 64 * 1024;
const _captureSlots = [];
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
function _appendBounded(slot, entry) {
    if (slot.truncated)
        return;
    const entryBytes = entry.message.length + 32; // ~level + ts overhead
    if (slot.entries.length >= CAPTURE_MAX_ENTRIES || slot.bytes + entryBytes > CAPTURE_MAX_BYTES) {
        slot.truncated = true;
        slot.entries.push({ level: 'warn', message: '[capture truncated — exceeded entry/byte cap]', ts: Date.now() });
        return;
    }
    slot.entries.push(entry);
    slot.bytes += entryBytes;
}
function _topSlot() {
    return _captureSlots.length > 0 ? _captureSlots[_captureSlots.length - 1] : null;
}
function _ensureConsoleHook() {
    if (_origConsole)
        return;
    _origConsole = { log: console.log, warn: console.warn, error: console.error };
    const make = (level, orig) => (...a) => {
        const slot = _topSlot();
        if (slot) {
            const message = _formatArgs(a);
            _appendBounded(slot, { level, message, ts: Date.now() });
        }
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
    if (_captureSlots.length > 0 || !_origConsole)
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
        const slot = {
            token: Symbol('mcp-capture'),
            entries: [],
            bytes: 0,
            truncated: false,
        };
        _captureSlots.push(slot);
        _ensureConsoleHook();
        try {
            const fn = exports.methods[methodName];
            if (typeof fn !== 'function') {
                return {
                    success: false,
                    error: `runWithCapture: method ${methodName} not found`,
                    capturedLogs: slot.entries,
                };
            }
            try {
                const result = await fn(...(methodArgs !== null && methodArgs !== void 0 ? methodArgs : []));
                if (result && typeof result === 'object' && !Array.isArray(result)) {
                    return Object.assign(Object.assign({}, result), { capturedLogs: (_a = result.capturedLogs) !== null && _a !== void 0 ? _a : slot.entries });
                }
                return { success: true, data: result, capturedLogs: slot.entries };
            }
            catch (err) {
                return {
                    success: false,
                    error: (_b = err === null || err === void 0 ? void 0 : err.message) !== null && _b !== void 0 ? _b : String(err),
                    capturedLogs: slot.entries,
                };
            }
        }
        finally {
            const idx = _captureSlots.findIndex(s => s.token === slot.token);
            if (idx >= 0)
                _captureSlots.splice(idx, 1);
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
            // v2.4.9 review fix (claude + codex 🟡): use indexOf on the
            // resolved anim instance directly. The previous metadata-string
            // lookup (constructor.name / __classname__ / _cid) was fragile
            // against custom subclasses (cc.SkeletalAnimation, user-derived
            // cc.Animation). getComponent('cc.Animation') resolves subclasses
            // correctly; matching by reference is the canonical way to find
            // the same instance's slot in __comps__.
            const anim = node.getComponent('cc.Animation');
            if (!anim) {
                return { success: false, error: `Node ${nodeUuid} has no cc.Animation component` };
            }
            const components = ((_b = (_a = node._components) !== null && _a !== void 0 ? _a : node.components) !== null && _b !== void 0 ? _b : []);
            const compIndex = components.indexOf(anim);
            if (compIndex === -1) {
                return { success: false, error: `Node ${nodeUuid} cc.Animation component not found in __comps__ array (cocos editor inconsistency).` };
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NlbmUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zb3VyY2Uvc2NlbmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsK0JBQTRCO0FBQzVCLE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUEsV0FBSSxFQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLGNBQWMsQ0FBQyxDQUFDLENBQUM7QUFxQnpELFNBQVMsZUFBZTs7SUFDcEIsSUFBSSxPQUFPLEdBQUcsS0FBSyxXQUFXLElBQUksR0FBRyxLQUFLLElBQUksRUFBRSxDQUFDO1FBQzdDLE9BQU8sRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSw2RUFBNkUsRUFBRSxDQUFDO0lBQy9HLENBQUM7SUFDRCxNQUFNLFVBQVUsR0FBb0M7UUFDaEQsR0FBRyxDQUFDLE1BQU07UUFDVixNQUFBLEdBQUcsQ0FBQyxrQkFBa0IsMENBQUUsUUFBUTtRQUNoQyxHQUFHLENBQUMsa0JBQThDO0tBQ3JELENBQUM7SUFDRixnRUFBZ0U7SUFDaEUsK0RBQStEO0lBQy9ELE1BQU0sUUFBUSxHQUE4QixDQUFDLGNBQWMsRUFBRSxhQUFhLEVBQUUsWUFBWSxFQUFFLGNBQWMsRUFBRSxlQUFlLENBQUMsQ0FBQztJQUMzSCxLQUFLLE1BQU0sU0FBUyxJQUFJLFVBQVUsRUFBRSxDQUFDO1FBQ2pDLElBQUksU0FBUyxJQUFJLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxPQUFRLFNBQWlCLENBQUMsQ0FBQyxDQUFDLEtBQUssVUFBVSxDQUFDLEVBQUUsQ0FBQztZQUNoRixPQUFPLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLENBQUM7UUFDMUMsQ0FBQztJQUNMLENBQUM7SUFDRCxPQUFPO1FBQ0gsRUFBRSxFQUFFLEtBQUs7UUFDVCxLQUFLLEVBQUUseUtBQXlLO0tBQ25MLENBQUM7QUFDTixDQUFD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QUFBLE1BQUEsSUFBSSxDQUFDLFdBQVcsMENBQUUsSUFBSSxtQ0FBSSxJQUFJO29CQUNsRCxpQkFBaUIsRUFBRSxJQUFJLENBQUMsVUFBVSxLQUFLLElBQUk7aUJBQzlDO2FBQ0osQ0FBQztRQUNOLENBQUM7UUFBQyxPQUFPLEtBQVUsRUFBRSxDQUFDO1lBQ2xCLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxNQUFBLEtBQUssYUFBTCxLQUFLLHVCQUFMLEtBQUssQ0FBRSxPQUFPLG1DQUFJLE1BQU0sQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1FBQ3RFLENBQUM7SUFDTCxDQUFDO0NBRUosQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGpvaW4gfSBmcm9tICdwYXRoJztcbm1vZHVsZS5wYXRocy5wdXNoKGpvaW4oRWRpdG9yLkFwcC5wYXRoLCAnbm9kZV9tb2R1bGVzJykpO1xuXG4vLyBgY2NlYCBpcyBpbmplY3RlZCBieSBDb2NvcyBFZGl0b3IgaW50byB0aGUgc2NlbmUtc2NyaXB0IGdsb2JhbCBzY29wZS5cbi8vIEl0IGlzIG5vdCBkZWNsYXJlZCBpbiBgQGNvY29zL2NyZWF0b3ItdHlwZXNgIGV4cG9ydHM7IGRlY2xhcmUgYSBtaW5pbWFsXG4vLyBydW50aW1lIHNoYXBlIGp1c3QgZm9yIHdoYXQgd2UgdG91Y2ggaGVyZSBzbyBUeXBlU2NyaXB0IHN0YXlzIHN0cmljdC5cbmRlY2xhcmUgY29uc3QgY2NlOiB1bmRlZmluZWQgfCB7XG4gICAgUHJlZmFiPzogUHJlZmFiRmFjYWRlO1xuICAgIFNjZW5lRmFjYWRlTWFuYWdlcj86IHsgaW5zdGFuY2U/OiBQcmVmYWJGYWNhZGUgfSAmIFByZWZhYkZhY2FkZTtcbn07XG5cbmludGVyZmFjZSBQcmVmYWJGYWNhZGUge1xuICAgIGNyZWF0ZVByZWZhYihub2RlVXVpZDogc3RyaW5nLCB1cmw6IHN0cmluZyk6IFByb21pc2U8YW55PjtcbiAgICBhcHBseVByZWZhYihub2RlVXVpZDogc3RyaW5nKTogUHJvbWlzZTxhbnk+O1xuICAgIGxpbmtQcmVmYWIobm9kZVV1aWQ6IHN0cmluZywgYXNzZXRVdWlkOiBzdHJpbmcpOiBhbnk7XG4gICAgdW5saW5rUHJlZmFiKG5vZGVVdWlkOiBzdHJpbmcsIHJlbW92ZU5lc3RlZDogYm9vbGVhbik6IGFueTtcbiAgICBnZXRQcmVmYWJEYXRhKG5vZGVVdWlkOiBzdHJpbmcpOiBhbnk7XG4gICAgcmVzdG9yZVByZWZhYj8odXVpZDogc3RyaW5nLCBhc3NldFV1aWQ6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj47XG59XG5cbnR5cGUgRmFjYWRlTG9va3VwID0geyBvazogdHJ1ZTsgdmFsdWU6IFByZWZhYkZhY2FkZSB9IHwgeyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmcgfTtcblxuZnVuY3Rpb24gZ2V0UHJlZmFiRmFjYWRlKCk6IEZhY2FkZUxvb2t1cCB7XG4gICAgaWYgKHR5cGVvZiBjY2UgPT09ICd1bmRlZmluZWQnIHx8IGNjZSA9PT0gbnVsbCkge1xuICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiAnY2NlIGdsb2JhbCBpcyBub3QgYXZhaWxhYmxlOyB0aGlzIG1ldGhvZCBtdXN0IHJ1biBpbiBhIHNjZW5lLXNjcmlwdCBjb250ZXh0JyB9O1xuICAgIH1cbiAgICBjb25zdCBjYW5kaWRhdGVzOiBBcnJheTxQcmVmYWJGYWNhZGUgfCB1bmRlZmluZWQ+ID0gW1xuICAgICAgICBjY2UuUHJlZmFiLFxuICAgICAgICBjY2UuU2NlbmVGYWNhZGVNYW5hZ2VyPy5pbnN0YW5jZSxcbiAgICAgICAgY2NlLlNjZW5lRmFjYWRlTWFuYWdlciBhcyBQcmVmYWJGYWNhZGUgfCB1bmRlZmluZWQsXG4gICAgXTtcbiAgICAvLyBFbnN1cmUgdGhlIGNhbmRpZGF0ZSBleHBvc2VzIGV2ZXJ5IGZhY2FkZSBtZXRob2Qgd2UgbWF5IGNhbGw7XG4gICAgLy8gYSBwYXJ0aWFsIGNhbmRpZGF0ZSB3b3VsZCBjcmFzaCBhdCB0aGUgZmlyc3QgbWlzc2luZyBtZXRob2QuXG4gICAgY29uc3QgcmVxdWlyZWQ6IEFycmF5PGtleW9mIFByZWZhYkZhY2FkZT4gPSBbJ2NyZWF0ZVByZWZhYicsICdhcHBseVByZWZhYicsICdsaW5rUHJlZmFiJywgJ3VubGlua1ByZWZhYicsICdnZXRQcmVmYWJEYXRhJ107XG4gICAgZm9yIChjb25zdCBjYW5kaWRhdGUgb2YgY2FuZGlkYXRlcykge1xuICAgICAgICBpZiAoY2FuZGlkYXRlICYmIHJlcXVpcmVkLmV2ZXJ5KG0gPT4gdHlwZW9mIChjYW5kaWRhdGUgYXMgYW55KVttXSA9PT0gJ2Z1bmN0aW9uJykpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiB0cnVlLCB2YWx1ZTogY2FuZGlkYXRlIH07XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgICAgb2s6IGZhbHNlLFxuICAgICAgICBlcnJvcjogJ05vIGNvbXBsZXRlIHByZWZhYiBmYWNhZGUgZm91bmQgb24gY2NlIChjY2UuUHJlZmFiIC8gY2NlLlNjZW5lRmFjYWRlTWFuYWdlcikuIENvY29zIGVkaXRvciBidWlsZCBtYXkgbm90IGV4cG9zZSB0aGUgZXhwZWN0ZWQgbWFuYWdlciBvciBvbmx5IGV4cG9zZXMgYSBwYXJ0aWFsIHN1cmZhY2UuJyxcbiAgICB9O1xufVxuXG50eXBlIENvbXBvbmVudExvb2t1cCA9XG4gICAgfCB7IG9rOiB0cnVlOyBzY2VuZTogYW55OyBub2RlOiBhbnk7IGNvbXBvbmVudDogYW55IH1cbiAgICB8IHsgb2s6IGZhbHNlOyBlcnJvcjogc3RyaW5nIH07XG5cbmZ1bmN0aW9uIGZpbmROb2RlQnlVdWlkRGVlcChyb290OiBhbnksIHV1aWQ6IHN0cmluZyk6IGFueSB7XG4gICAgaWYgKCFyb290KSByZXR1cm4gbnVsbDtcbiAgICBpZiAocm9vdC5faWQgPT09IHV1aWQgfHwgcm9vdC51dWlkID09PSB1dWlkKSByZXR1cm4gcm9vdDtcbiAgICBjb25zdCBjaGlsZHJlbiA9IHJvb3QuY2hpbGRyZW4gPz8gcm9vdC5fY2hpbGRyZW4gPz8gW107XG4gICAgZm9yIChjb25zdCBjaGlsZCBvZiBjaGlsZHJlbikge1xuICAgICAgICBjb25zdCBoaXQgPSBmaW5kTm9kZUJ5VXVpZERlZXAoY2hpbGQsIHV1aWQpO1xuICAgICAgICBpZiAoaGl0KSByZXR1cm4gaGl0O1xuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gcmVzb2x2ZUNvbXBvbmVudENvbnRleHQobm9kZVV1aWQ6IHN0cmluZywgY29tcG9uZW50VHlwZTogc3RyaW5nKTogQ29tcG9uZW50TG9va3VwIHtcbiAgICBjb25zdCB7IGRpcmVjdG9yLCBqcyB9ID0gcmVxdWlyZSgnY2MnKTtcbiAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgaWYgKCFzY2VuZSkge1xuICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiAnTm8gYWN0aXZlIHNjZW5lJyB9O1xuICAgIH1cbiAgICAvLyBzY2VuZS5nZXRDaGlsZEJ5VXVpZCBvbmx5IHdhbGtzIGRpcmVjdCBjaGlsZHJlbjsgdXNlIGRlcHRoLWZpcnN0IHNlYXJjaC5cbiAgICBjb25zdCBub2RlID0gZmluZE5vZGVCeVV1aWREZWVwKHNjZW5lLCBub2RlVXVpZCk7XG4gICAgaWYgKCFub2RlKSB7XG4gICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGBOb2RlIHdpdGggVVVJRCAke25vZGVVdWlkfSBub3QgZm91bmRgIH07XG4gICAgfVxuICAgIGNvbnN0IENvbXBvbmVudENsYXNzID0ganMuZ2V0Q2xhc3NCeU5hbWUoY29tcG9uZW50VHlwZSk7XG4gICAgaWYgKCFDb21wb25lbnRDbGFzcykge1xuICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBgQ29tcG9uZW50IHR5cGUgJHtjb21wb25lbnRUeXBlfSBub3QgZm91bmRgIH07XG4gICAgfVxuICAgIGNvbnN0IGNvbXBvbmVudCA9IG5vZGUuZ2V0Q29tcG9uZW50KENvbXBvbmVudENsYXNzKTtcbiAgICBpZiAoIWNvbXBvbmVudCkge1xuICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBgQ29tcG9uZW50ICR7Y29tcG9uZW50VHlwZX0gbm90IGZvdW5kIG9uIG5vZGVgIH07XG4gICAgfVxuICAgIHJldHVybiB7IG9rOiB0cnVlLCBzY2VuZSwgbm9kZSwgY29tcG9uZW50IH07XG59XG5cbmZ1bmN0aW9uIHNlcmlhbGl6ZUV2ZW50SGFuZGxlcihlaDogYW55KSB7XG4gICAgaWYgKCFlaCkgcmV0dXJuIG51bGw7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgdGFyZ2V0VXVpZDogZWgudGFyZ2V0Py51dWlkID8/IG51bGwsXG4gICAgICAgIHRhcmdldE5hbWU6IGVoLnRhcmdldD8ubmFtZSA/PyBudWxsLFxuICAgICAgICBjb21wb25lbnQ6IGVoLmNvbXBvbmVudCA/PyBlaC5fY29tcG9uZW50TmFtZSA/PyBudWxsLFxuICAgICAgICBoYW5kbGVyOiBlaC5oYW5kbGVyID8/IG51bGwsXG4gICAgICAgIGN1c3RvbUV2ZW50RGF0YTogZWguY3VzdG9tRXZlbnREYXRhID8/ICcnLFxuICAgIH07XG59XG5cbi8vIHYyLjQuOCBBMyArIHYyLjQuOSByZXZpZXcgZml4OiBzY2VuZS1zaWRlIGxvZyBjYXB0dXJlIChSb21hUm9nb3Zcbi8vIHBhdHRlcm4gYWRhcHRlZCkuXG4vL1xuLy8gQ29uY3VycmVuY3kgbW9kZWwg4oCUIHYyLjQuOSAoY2xhdWRlICsgY29kZXgg8J+foSk6XG4vLyAgIFRoZSB2Mi40LjggaW1wbGVtZW50YXRpb24gcHVzaGVkIGVhY2ggY2FsbCdzIGNhcHR1cmUgYXJyYXkgb250byBhXG4vLyAgIHN0YWNrIGFuZCBmYW5uZWQgZXZlcnkgY29uc29sZS5sb2cgdG8gQUxMIGFjdGl2ZSBhcnJheXMsIHdoaWNoXG4vLyAgIG1lYW50IG92ZXJsYXBwaW5nIHJ1blNjZW5lTWV0aG9kIGNhbGxzIGxlYWtlZCBsb2cgZW50cmllcyBhY3Jvc3Ncbi8vICAgZWFjaCBvdGhlcidzIHJlc3VsdHMuIFJlYWwgcmlzayB3YXMgbG93IGluIHNpbmdsZS1jbGllbnQgc2V0dXBzIGJ1dFxuLy8gICB0aGUgZG9jLWNvbW1lbnQgY2xhaW1lZCBpc29sYXRpb24gdGhhdCBkaWRuJ3QgZXhpc3QuXG4vL1xuLy8gICB2Mi40LjkgZml4ZXMgdGhpcyB3aXRoIGNvb3BlcmF0aXZlIGFzeW5jLXRva2VuIHRyYWNraW5nOiBlYWNoIGNhbGxcbi8vICAgZ2V0cyBhIFN5bWJvbCB0b2tlbjsgd2UgbWFpbnRhaW4gYSBcImN1cnJlbnRcIiB0b2tlbiAodG9wIG9mIHN0YWNrKVxuLy8gICB0aGF0IHRoZSBjb25zb2xlIGhvb2sgdXNlcyB0byBhdHRyaWJ1dGUgZW50cmllcy4gQ29uY3VycmVudCBjYWxsc1xuLy8gICBhcmUgc3RpbGwgcG9zc2libGUgYmVjYXVzZSBjb2NvcydzIElQQyBkaXNwYXRjaGVyIGlzIHNpbmdsZS10aHJlYWRlZFxuLy8gICBwZXIgc2NlbmUtc2NyaXB0IHBhY2thZ2Ug4oCUIHRoZXkgb3ZlcmxhcCBvbmx5IHZpYSBgYXdhaXRgIGJvdW5kYXJpZXNcbi8vICAgaW5zaWRlIHRoZSBpbm5lciBtZXRob2QuIEJldHdlZW4gYXdhaXRzLCBvbmx5IE9ORSBjYWxsIGhvbGRzIHRoZVxuLy8gICBhY3RpdmUgdG9rZW47IGxvZ3MgZW1pdHRlZCBpbiB0aGF0IHdpbmRvdyBnbyB0byB0aGF0IGNhbGwgb25seS5cbi8vXG4vLyBCb3VuZCDigJQgdjIuNC45IChjbGF1ZGUgKyBjb2RleCDwn5+hKTpcbi8vICAgQ2FwIGVudHJpZXMgcGVyIGNhcHR1cmUgKGRlZmF1bHQgNTAwKSBhbmQgdG90YWwgYnl0ZXMgKGRlZmF1bHRcbi8vICAgNjQgS0IpIHRvIHByZXZlbnQgYSBub2lzeSBzY2VuZS1zY3JpcHQgZnJvbSBibG93aW5nIG1lbW9yeSBvclxuLy8gICBpbmZsYXRpbmcgdGhlIElQQyBlbnZlbG9wZS4gRXhjZXNzIGVudHJpZXMgYXJlIGRyb3BwZWQgYW5kIGEgZmluYWxcbi8vICAgYHsgbGV2ZWw6ICd3YXJuJywgbWVzc2FnZTogJ1tjYXB0dXJlIHRydW5jYXRlZF0nLCB0cyB9YCBtYXJrZXIgaXNcbi8vICAgYXBwZW5kZWQgb25jZS5cbnR5cGUgQ2FwdHVyZWRFbnRyeSA9IHsgbGV2ZWw6ICdsb2cnIHwgJ3dhcm4nIHwgJ2Vycm9yJzsgbWVzc2FnZTogc3RyaW5nOyB0czogbnVtYmVyIH07XG50eXBlIENvbnNvbGVTbmFwc2hvdCA9IHsgbG9nOiB0eXBlb2YgY29uc29sZS5sb2c7IHdhcm46IHR5cGVvZiBjb25zb2xlLndhcm47IGVycm9yOiB0eXBlb2YgY29uc29sZS5lcnJvciB9O1xuXG5pbnRlcmZhY2UgQ2FwdHVyZVNsb3Qge1xuICAgIHRva2VuOiBzeW1ib2w7XG4gICAgZW50cmllczogQ2FwdHVyZWRFbnRyeVtdO1xuICAgIGJ5dGVzOiBudW1iZXI7XG4gICAgdHJ1bmNhdGVkOiBib29sZWFuO1xufVxuXG5jb25zdCBDQVBUVVJFX01BWF9FTlRSSUVTID0gNTAwO1xuY29uc3QgQ0FQVFVSRV9NQVhfQllURVMgPSA2NCAqIDEwMjQ7XG5jb25zdCBfY2FwdHVyZVNsb3RzOiBDYXB0dXJlU2xvdFtdID0gW107XG5sZXQgX29yaWdDb25zb2xlOiBDb25zb2xlU25hcHNob3QgfCBudWxsID0gbnVsbDtcblxuZnVuY3Rpb24gX2Zvcm1hdEFyZ3MoYTogdW5rbm93bltdKTogc3RyaW5nIHtcbiAgICByZXR1cm4gYVxuICAgICAgICAubWFwKHggPT4ge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiB4ID09PSAnc3RyaW5nJykgcmV0dXJuIHg7XG4gICAgICAgICAgICB0cnkgeyByZXR1cm4gSlNPTi5zdHJpbmdpZnkoeCk7IH0gY2F0Y2ggeyByZXR1cm4gU3RyaW5nKHgpOyB9XG4gICAgICAgIH0pXG4gICAgICAgIC5qb2luKCcgJyk7XG59XG5cbmZ1bmN0aW9uIF9hcHBlbmRCb3VuZGVkKHNsb3Q6IENhcHR1cmVTbG90LCBlbnRyeTogQ2FwdHVyZWRFbnRyeSk6IHZvaWQge1xuICAgIGlmIChzbG90LnRydW5jYXRlZCkgcmV0dXJuO1xuICAgIGNvbnN0IGVudHJ5Qnl0ZXMgPSBlbnRyeS5tZXNzYWdlLmxlbmd0aCArIDMyOyAvLyB+bGV2ZWwgKyB0cyBvdmVyaGVhZFxuICAgIGlmIChzbG90LmVudHJpZXMubGVuZ3RoID49IENBUFRVUkVfTUFYX0VOVFJJRVMgfHwgc2xvdC5ieXRlcyArIGVudHJ5Qnl0ZXMgPiBDQVBUVVJFX01BWF9CWVRFUykge1xuICAgICAgICBzbG90LnRydW5jYXRlZCA9IHRydWU7XG4gICAgICAgIHNsb3QuZW50cmllcy5wdXNoKHsgbGV2ZWw6ICd3YXJuJywgbWVzc2FnZTogJ1tjYXB0dXJlIHRydW5jYXRlZCDigJQgZXhjZWVkZWQgZW50cnkvYnl0ZSBjYXBdJywgdHM6IERhdGUubm93KCkgfSk7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgc2xvdC5lbnRyaWVzLnB1c2goZW50cnkpO1xuICAgIHNsb3QuYnl0ZXMgKz0gZW50cnlCeXRlcztcbn1cblxuZnVuY3Rpb24gX3RvcFNsb3QoKTogQ2FwdHVyZVNsb3QgfCBudWxsIHtcbiAgICByZXR1cm4gX2NhcHR1cmVTbG90cy5sZW5ndGggPiAwID8gX2NhcHR1cmVTbG90c1tfY2FwdHVyZVNsb3RzLmxlbmd0aCAtIDFdIDogbnVsbDtcbn1cblxuZnVuY3Rpb24gX2Vuc3VyZUNvbnNvbGVIb29rKCk6IHZvaWQge1xuICAgIGlmIChfb3JpZ0NvbnNvbGUpIHJldHVybjtcbiAgICBfb3JpZ0NvbnNvbGUgPSB7IGxvZzogY29uc29sZS5sb2csIHdhcm46IGNvbnNvbGUud2FybiwgZXJyb3I6IGNvbnNvbGUuZXJyb3IgfTtcbiAgICBjb25zdCBtYWtlID0gKGxldmVsOiBDYXB0dXJlZEVudHJ5WydsZXZlbCddLCBvcmlnOiAoLi4uYTogYW55W10pID0+IHZvaWQpID0+XG4gICAgICAgICguLi5hOiBhbnlbXSk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgY29uc3Qgc2xvdCA9IF90b3BTbG90KCk7XG4gICAgICAgICAgICBpZiAoc2xvdCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IG1lc3NhZ2UgPSBfZm9ybWF0QXJncyhhKTtcbiAgICAgICAgICAgICAgICBfYXBwZW5kQm91bmRlZChzbG90LCB7IGxldmVsLCBtZXNzYWdlLCB0czogRGF0ZS5ub3coKSB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRyeSB7IG9yaWcuYXBwbHkoY29uc29sZSwgYSk7IH0gY2F0Y2ggeyAvKiBzd2FsbG93ICovIH1cbiAgICAgICAgfTtcbiAgICBjb25zb2xlLmxvZyA9IG1ha2UoJ2xvZycsIF9vcmlnQ29uc29sZS5sb2cpO1xuICAgIGNvbnNvbGUud2FybiA9IG1ha2UoJ3dhcm4nLCBfb3JpZ0NvbnNvbGUud2Fybik7XG4gICAgY29uc29sZS5lcnJvciA9IG1ha2UoJ2Vycm9yJywgX29yaWdDb25zb2xlLmVycm9yKTtcbn1cblxuZnVuY3Rpb24gX21heWJlVW5ob29rQ29uc29sZSgpOiB2b2lkIHtcbiAgICBpZiAoX2NhcHR1cmVTbG90cy5sZW5ndGggPiAwIHx8ICFfb3JpZ0NvbnNvbGUpIHJldHVybjtcbiAgICBjb25zb2xlLmxvZyA9IF9vcmlnQ29uc29sZS5sb2c7XG4gICAgY29uc29sZS53YXJuID0gX29yaWdDb25zb2xlLndhcm47XG4gICAgY29uc29sZS5lcnJvciA9IF9vcmlnQ29uc29sZS5lcnJvcjtcbiAgICBfb3JpZ0NvbnNvbGUgPSBudWxsO1xufVxuXG5leHBvcnQgY29uc3QgbWV0aG9kczogeyBba2V5OiBzdHJpbmddOiAoLi4uYW55OiBhbnkpID0+IGFueSB9ID0ge1xuICAgIC8qKlxuICAgICAqIHYyLjQuOCBBMzogaW52b2tlIGFub3RoZXIgc2NlbmUtc2NyaXB0IG1ldGhvZCBieSBuYW1lLCBjYXB0dXJpbmdcbiAgICAgKiBjb25zb2xlLntsb2csd2FybixlcnJvcn0gZHVyaW5nIHRoZSBjYWxsIGFuZCByZXR1cm5pbmcgY2FwdHVyZWRMb2dzXG4gICAgICogYWxvbmdzaWRlIHRoZSBtZXRob2QncyBub3JtYWwgcmV0dXJuIGVudmVsb3BlLiBTaW5nbGUgcm91bmQtdHJpcC5cbiAgICAgKlxuICAgICAqIEJlaGF2aW91cjpcbiAgICAgKiAgLSBJZiBgbWV0aG9kTmFtZWAgZG9lcyBub3QgZXhpc3QsIHJldHVybnNcbiAgICAgKiAgICBgeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IFwiLi4uXCIgLCBjYXB0dXJlZExvZ3M6IFtdIH1gIChlbXB0eSkuXG4gICAgICogIC0gSWYgdGhlIGlubmVyIG1ldGhvZCB0aHJvd3MsIHRoZSB0aHJvdyBpcyBjYXVnaHQgYW5kIGNvbnZlcnRlZCB0b1xuICAgICAqICAgIGB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvciwgY2FwdHVyZWRMb2dzIH1gIHNvIHRoZSBob3N0IGFsd2F5cyBzZWVzXG4gICAgICogICAgYSBzdHJ1Y3R1cmVkIGVudmVsb3BlIHBsdXMgdGhlIGxvZ3MgdGhhdCByYW4gdXAgdG8gdGhlIHRocm93LlxuICAgICAqICAtIElmIHRoZSBpbm5lciBtZXRob2QgcmV0dXJucyBhbiBvYmplY3QsIGNhcHR1cmVkTG9ncyBpcyBtZXJnZWRcbiAgICAgKiAgICBhbG9uZ3NpZGUgaXRzIGtleXMgd2l0aG91dCBvdmVyd3JpdGluZyAod2UgdXNlIGA/PyBjYXB0dXJlc2BcbiAgICAgKiAgICBzZW1hbnRpY3M6IG9ubHkgc2V0IGlmIG5vdCBhbHJlYWR5IHByZXNlbnQpLlxuICAgICAqL1xuICAgIGFzeW5jIHJ1bldpdGhDYXB0dXJlKG1ldGhvZE5hbWU6IHN0cmluZywgbWV0aG9kQXJncz86IHVua25vd25bXSkge1xuICAgICAgICBjb25zdCBzbG90OiBDYXB0dXJlU2xvdCA9IHtcbiAgICAgICAgICAgIHRva2VuOiBTeW1ib2woJ21jcC1jYXB0dXJlJyksXG4gICAgICAgICAgICBlbnRyaWVzOiBbXSxcbiAgICAgICAgICAgIGJ5dGVzOiAwLFxuICAgICAgICAgICAgdHJ1bmNhdGVkOiBmYWxzZSxcbiAgICAgICAgfTtcbiAgICAgICAgX2NhcHR1cmVTbG90cy5wdXNoKHNsb3QpO1xuICAgICAgICBfZW5zdXJlQ29uc29sZUhvb2soKTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGZuID0gbWV0aG9kc1ttZXRob2ROYW1lXTtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgZm4gIT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGBydW5XaXRoQ2FwdHVyZTogbWV0aG9kICR7bWV0aG9kTmFtZX0gbm90IGZvdW5kYCxcbiAgICAgICAgICAgICAgICAgICAgY2FwdHVyZWRMb2dzOiBzbG90LmVudHJpZXMsXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZm4oLi4uKG1ldGhvZEFyZ3MgPz8gW10pKTtcbiAgICAgICAgICAgICAgICBpZiAocmVzdWx0ICYmIHR5cGVvZiByZXN1bHQgPT09ICdvYmplY3QnICYmICFBcnJheS5pc0FycmF5KHJlc3VsdCkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgLi4ucmVzdWx0LCBjYXB0dXJlZExvZ3M6IChyZXN1bHQgYXMgYW55KS5jYXB0dXJlZExvZ3MgPz8gc2xvdC5lbnRyaWVzIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IHJlc3VsdCwgY2FwdHVyZWRMb2dzOiBzbG90LmVudHJpZXMgfTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIGVycm9yOiBlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVyciksXG4gICAgICAgICAgICAgICAgICAgIGNhcHR1cmVkTG9nczogc2xvdC5lbnRyaWVzLFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICBjb25zdCBpZHggPSBfY2FwdHVyZVNsb3RzLmZpbmRJbmRleChzID0+IHMudG9rZW4gPT09IHNsb3QudG9rZW4pO1xuICAgICAgICAgICAgaWYgKGlkeCA+PSAwKSBfY2FwdHVyZVNsb3RzLnNwbGljZShpZHgsIDEpO1xuICAgICAgICAgICAgX21heWJlVW5ob29rQ29uc29sZSgpO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEFkZCBjb21wb25lbnQgdG8gYSBub2RlXG4gICAgICovXG4gICAgYWRkQ29tcG9uZW50VG9Ob2RlKG5vZGVVdWlkOiBzdHJpbmcsIGNvbXBvbmVudFR5cGU6IHN0cmluZykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgeyBkaXJlY3RvciwganMgfSA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgICAgICBpZiAoIXNjZW5lKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnTm8gYWN0aXZlIHNjZW5lJyB9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBGaW5kIG5vZGUgYnkgVVVJRFxuICAgICAgICAgICAgY29uc3Qgbm9kZSA9IHNjZW5lLmdldENoaWxkQnlVdWlkKG5vZGVVdWlkKTtcbiAgICAgICAgICAgIGlmICghbm9kZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYE5vZGUgd2l0aCBVVUlEICR7bm9kZVV1aWR9IG5vdCBmb3VuZGAgfTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gR2V0IGNvbXBvbmVudCBjbGFzc1xuICAgICAgICAgICAgY29uc3QgQ29tcG9uZW50Q2xhc3MgPSBqcy5nZXRDbGFzc0J5TmFtZShjb21wb25lbnRUeXBlKTtcbiAgICAgICAgICAgIGlmICghQ29tcG9uZW50Q2xhc3MpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBDb21wb25lbnQgdHlwZSAke2NvbXBvbmVudFR5cGV9IG5vdCBmb3VuZGAgfTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gQWRkIGNvbXBvbmVudFxuICAgICAgICAgICAgY29uc3QgY29tcG9uZW50ID0gbm9kZS5hZGRDb21wb25lbnQoQ29tcG9uZW50Q2xhc3MpO1xuICAgICAgICAgICAgcmV0dXJuIHsgXG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSwgXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogYENvbXBvbmVudCAke2NvbXBvbmVudFR5cGV9IGFkZGVkIHN1Y2Nlc3NmdWxseWAsXG4gICAgICAgICAgICAgICAgZGF0YTogeyBjb21wb25lbnRJZDogY29tcG9uZW50LnV1aWQgfVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvci5tZXNzYWdlIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQ3JlYXRlIGEgbmV3IG5vZGVcbiAgICAgKi9cbiAgICBjcmVhdGVOb2RlKG5hbWU6IHN0cmluZywgcGFyZW50VXVpZD86IHN0cmluZykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgeyBkaXJlY3RvciwgTm9kZSB9ID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICAgICAgICAgIGlmICghc2NlbmUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdObyBhY3RpdmUgc2NlbmUnIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IG5vZGUgPSBuZXcgTm9kZShuYW1lKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgaWYgKHBhcmVudFV1aWQpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBwYXJlbnQgPSBzY2VuZS5nZXRDaGlsZEJ5VXVpZChwYXJlbnRVdWlkKTtcbiAgICAgICAgICAgICAgICBpZiAocGFyZW50KSB7XG4gICAgICAgICAgICAgICAgICAgIHBhcmVudC5hZGRDaGlsZChub2RlKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBzY2VuZS5hZGRDaGlsZChub2RlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHNjZW5lLmFkZENoaWxkKG5vZGUpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4geyBcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLCBcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiBgTm9kZSAke25hbWV9IGNyZWF0ZWQgc3VjY2Vzc2Z1bGx5YCxcbiAgICAgICAgICAgICAgICBkYXRhOiB7IHV1aWQ6IG5vZGUudXVpZCwgbmFtZTogbm9kZS5uYW1lIH1cbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3IubWVzc2FnZSB9O1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEdldCBub2RlIGluZm9ybWF0aW9uXG4gICAgICovXG4gICAgZ2V0Tm9kZUluZm8obm9kZVV1aWQ6IHN0cmluZykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgeyBkaXJlY3RvciB9ID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICAgICAgICAgIGlmICghc2NlbmUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdObyBhY3RpdmUgc2NlbmUnIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IG5vZGUgPSBzY2VuZS5nZXRDaGlsZEJ5VXVpZChub2RlVXVpZCk7XG4gICAgICAgICAgICBpZiAoIW5vZGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBOb2RlIHdpdGggVVVJRCAke25vZGVVdWlkfSBub3QgZm91bmRgIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIHV1aWQ6IG5vZGUudXVpZCxcbiAgICAgICAgICAgICAgICAgICAgbmFtZTogbm9kZS5uYW1lLFxuICAgICAgICAgICAgICAgICAgICBhY3RpdmU6IG5vZGUuYWN0aXZlLFxuICAgICAgICAgICAgICAgICAgICBwb3NpdGlvbjogbm9kZS5wb3NpdGlvbixcbiAgICAgICAgICAgICAgICAgICAgcm90YXRpb246IG5vZGUucm90YXRpb24sXG4gICAgICAgICAgICAgICAgICAgIHNjYWxlOiBub2RlLnNjYWxlLFxuICAgICAgICAgICAgICAgICAgICBwYXJlbnQ6IG5vZGUucGFyZW50Py51dWlkLFxuICAgICAgICAgICAgICAgICAgICBjaGlsZHJlbjogbm9kZS5jaGlsZHJlbi5tYXAoKGNoaWxkOiBhbnkpID0+IGNoaWxkLnV1aWQpLFxuICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRzOiBub2RlLmNvbXBvbmVudHMubWFwKChjb21wOiBhbnkpID0+ICh7XG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiBjb21wLmNvbnN0cnVjdG9yLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBlbmFibGVkOiBjb21wLmVuYWJsZWRcbiAgICAgICAgICAgICAgICAgICAgfSkpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvci5tZXNzYWdlIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogR2V0IGFsbCBub2RlcyBpbiBzY2VuZVxuICAgICAqL1xuICAgIGdldEFsbE5vZGVzKCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgeyBkaXJlY3RvciB9ID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICAgICAgICAgIGlmICghc2NlbmUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdObyBhY3RpdmUgc2NlbmUnIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IG5vZGVzOiBhbnlbXSA9IFtdO1xuICAgICAgICAgICAgY29uc3QgY29sbGVjdE5vZGVzID0gKG5vZGU6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIG5vZGVzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICB1dWlkOiBub2RlLnV1aWQsXG4gICAgICAgICAgICAgICAgICAgIG5hbWU6IG5vZGUubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgYWN0aXZlOiBub2RlLmFjdGl2ZSxcbiAgICAgICAgICAgICAgICAgICAgcGFyZW50OiBub2RlLnBhcmVudD8udXVpZFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIG5vZGUuY2hpbGRyZW4uZm9yRWFjaCgoY2hpbGQ6IGFueSkgPT4gY29sbGVjdE5vZGVzKGNoaWxkKSk7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBzY2VuZS5jaGlsZHJlbi5mb3JFYWNoKChjaGlsZDogYW55KSA9PiBjb2xsZWN0Tm9kZXMoY2hpbGQpKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogbm9kZXMgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvci5tZXNzYWdlIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogRmluZCBub2RlIGJ5IG5hbWVcbiAgICAgKi9cbiAgICBmaW5kTm9kZUJ5TmFtZShuYW1lOiBzdHJpbmcpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IgfSA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgICAgICBpZiAoIXNjZW5lKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnTm8gYWN0aXZlIHNjZW5lJyB9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBub2RlID0gc2NlbmUuZ2V0Q2hpbGRCeU5hbWUobmFtZSk7XG4gICAgICAgICAgICBpZiAoIW5vZGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBOb2RlIHdpdGggbmFtZSAke25hbWV9IG5vdCBmb3VuZGAgfTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgdXVpZDogbm9kZS51dWlkLFxuICAgICAgICAgICAgICAgICAgICBuYW1lOiBub2RlLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgIGFjdGl2ZTogbm9kZS5hY3RpdmUsXG4gICAgICAgICAgICAgICAgICAgIHBvc2l0aW9uOiBub2RlLnBvc2l0aW9uXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvci5tZXNzYWdlIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogR2V0IGN1cnJlbnQgc2NlbmUgaW5mb3JtYXRpb25cbiAgICAgKi9cbiAgICBnZXRDdXJyZW50U2NlbmVJbmZvKCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgeyBkaXJlY3RvciB9ID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICAgICAgICAgIGlmICghc2NlbmUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdObyBhY3RpdmUgc2NlbmUnIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIG5hbWU6IHNjZW5lLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgIHV1aWQ6IHNjZW5lLnV1aWQsXG4gICAgICAgICAgICAgICAgICAgIG5vZGVDb3VudDogc2NlbmUuY2hpbGRyZW4ubGVuZ3RoXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvci5tZXNzYWdlIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogU2V0IG5vZGUgcHJvcGVydHlcbiAgICAgKi9cbiAgICBzZXROb2RlUHJvcGVydHkobm9kZVV1aWQ6IHN0cmluZywgcHJvcGVydHk6IHN0cmluZywgdmFsdWU6IGFueSkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgeyBkaXJlY3RvciB9ID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICAgICAgICAgIGlmICghc2NlbmUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdObyBhY3RpdmUgc2NlbmUnIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IG5vZGUgPSBzY2VuZS5nZXRDaGlsZEJ5VXVpZChub2RlVXVpZCk7XG4gICAgICAgICAgICBpZiAoIW5vZGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBOb2RlIHdpdGggVVVJRCAke25vZGVVdWlkfSBub3QgZm91bmRgIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIOioree9ruWxrOaAp1xuICAgICAgICAgICAgaWYgKHByb3BlcnR5ID09PSAncG9zaXRpb24nKSB7XG4gICAgICAgICAgICAgICAgbm9kZS5zZXRQb3NpdGlvbih2YWx1ZS54IHx8IDAsIHZhbHVlLnkgfHwgMCwgdmFsdWUueiB8fCAwKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHkgPT09ICdyb3RhdGlvbicpIHtcbiAgICAgICAgICAgICAgICBub2RlLnNldFJvdGF0aW9uRnJvbUV1bGVyKHZhbHVlLnggfHwgMCwgdmFsdWUueSB8fCAwLCB2YWx1ZS56IHx8IDApO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eSA9PT0gJ3NjYWxlJykge1xuICAgICAgICAgICAgICAgIG5vZGUuc2V0U2NhbGUodmFsdWUueCB8fCAxLCB2YWx1ZS55IHx8IDEsIHZhbHVlLnogfHwgMSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5ID09PSAnYWN0aXZlJykge1xuICAgICAgICAgICAgICAgIG5vZGUuYWN0aXZlID0gdmFsdWU7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5ID09PSAnbmFtZScpIHtcbiAgICAgICAgICAgICAgICBub2RlLm5hbWUgPSB2YWx1ZTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8g5ZiX6Kmm55u05o6l6Kit572u5bGs5oCnXG4gICAgICAgICAgICAgICAgKG5vZGUgYXMgYW55KVtwcm9wZXJ0eV0gPSB2YWx1ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHsgXG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSwgXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogYFByb3BlcnR5ICcke3Byb3BlcnR5fScgdXBkYXRlZCBzdWNjZXNzZnVsbHlgIFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvci5tZXNzYWdlIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogR2V0IHNjZW5lIGhpZXJhcmNoeVxuICAgICAqL1xuICAgIGdldFNjZW5lSGllcmFyY2h5KGluY2x1ZGVDb21wb25lbnRzOiBib29sZWFuID0gZmFsc2UpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IgfSA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgICAgICBpZiAoIXNjZW5lKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnTm8gYWN0aXZlIHNjZW5lJyB9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBwcm9jZXNzTm9kZSA9IChub2RlOiBhbnkpOiBhbnkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdDogYW55ID0ge1xuICAgICAgICAgICAgICAgICAgICBuYW1lOiBub2RlLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgIHV1aWQ6IG5vZGUudXVpZCxcbiAgICAgICAgICAgICAgICAgICAgYWN0aXZlOiBub2RlLmFjdGl2ZSxcbiAgICAgICAgICAgICAgICAgICAgY2hpbGRyZW46IFtdXG4gICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgIGlmIChpbmNsdWRlQ29tcG9uZW50cykge1xuICAgICAgICAgICAgICAgICAgICByZXN1bHQuY29tcG9uZW50cyA9IG5vZGUuY29tcG9uZW50cy5tYXAoKGNvbXA6IGFueSkgPT4gKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6IGNvbXAuY29uc3RydWN0b3IubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGVuYWJsZWQ6IGNvbXAuZW5hYmxlZFxuICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKG5vZGUuY2hpbGRyZW4gJiYgbm9kZS5jaGlsZHJlbi5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdC5jaGlsZHJlbiA9IG5vZGUuY2hpbGRyZW4ubWFwKChjaGlsZDogYW55KSA9PiBwcm9jZXNzTm9kZShjaGlsZCkpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBjb25zdCBoaWVyYXJjaHkgPSBzY2VuZS5jaGlsZHJlbi5tYXAoKGNoaWxkOiBhbnkpID0+IHByb2Nlc3NOb2RlKGNoaWxkKSk7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBkYXRhOiBoaWVyYXJjaHkgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvci5tZXNzYWdlIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQ3JlYXRlIHByZWZhYiBhc3NldCBmcm9tIGEgbm9kZSB2aWEgdGhlIG9mZmljaWFsIHNjZW5lIGZhY2FkZS5cbiAgICAgKlxuICAgICAqIFJvdXRlcyB0aHJvdWdoIGBjY2UuUHJlZmFiLmNyZWF0ZVByZWZhYmAgKHRoZSBDb2NvcyBlZGl0b3IgcHJlZmFiXG4gICAgICogbWFuYWdlciBleHBvc2VkIGluIHNjZW5lLXNjcmlwdCBjb250ZXh0KS4gVGhlIHVybCBhY2NlcHRzIGJvdGhcbiAgICAgKiBgZGI6Ly9hc3NldHMvLi4uYCBhbmQgYWJzb2x1dGUgZmlsZXN5c3RlbSBwYXRocyBpbiBkaWZmZXJlbnQgZWRpdG9yXG4gICAgICogYnVpbGRzLCBzbyB3ZSB0cnkgYm90aCBzaGFwZXMgYW5kIHN1cmZhY2Ugd2hpY2hldmVyIGZhaWxzLlxuICAgICAqL1xuICAgIGFzeW5jIGNyZWF0ZVByZWZhYkZyb21Ob2RlKG5vZGVVdWlkOiBzdHJpbmcsIHVybDogc3RyaW5nKSB7XG4gICAgICAgIGNvbnN0IHByZWZhYk1nciA9IGdldFByZWZhYkZhY2FkZSgpO1xuICAgICAgICBpZiAoIXByZWZhYk1nci5vaykge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBwcmVmYWJNZ3IuZXJyb3IgfTtcbiAgICAgICAgfVxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgdHJpZXM6IHN0cmluZ1tdID0gW107XG4gICAgICAgICAgICAvLyBQcmVmZXIgZGI6Ly8gZm9ybSAobWF0Y2hlcyBhc3NldC1kYiBxdWVyeSByZXN1bHRzKSBhbmQgZmFsbFxuICAgICAgICAgICAgLy8gYmFjayB0byB3aGF0ZXZlciB0aGUgY2FsbGVyIHBhc3NlZCB2ZXJiYXRpbS5cbiAgICAgICAgICAgIGNvbnN0IGRiVXJsID0gdXJsLnN0YXJ0c1dpdGgoJ2RiOi8vJykgPyB1cmwgOiBgZGI6Ly9hc3NldHMvJHt1cmwucmVwbGFjZSgvXlxcLysvLCAnJyl9YDtcbiAgICAgICAgICAgIHRyaWVzLnB1c2goZGJVcmwpO1xuICAgICAgICAgICAgaWYgKGRiVXJsICE9PSB1cmwpIHtcbiAgICAgICAgICAgICAgICB0cmllcy5wdXNoKHVybCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IGVycm9yczogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIHRyaWVzKSB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgcHJlZmFiTWdyLnZhbHVlLmNyZWF0ZVByZWZhYihub2RlVXVpZCwgY2FuZGlkYXRlKTtcbiAgICAgICAgICAgICAgICAgICAgLy8gY2NlLlByZWZhYi5jcmVhdGVQcmVmYWIgcmVwdXJwb3NlcyB0aGUgc291cmNlIG5vZGUgaW50byBhXG4gICAgICAgICAgICAgICAgICAgIC8vIHByZWZhYiBpbnN0YW5jZSB3aXRoIGEgZnJlc2ggVVVJRCwgc28gdGhlIGNhbGxlci1zdXBwbGllZFxuICAgICAgICAgICAgICAgICAgICAvLyBub2RlVXVpZCBpcyBubyBsb25nZXIgdmFsaWQuIFJlc29sdmUgdGhlIG5ldyBVVUlEIGJ5XG4gICAgICAgICAgICAgICAgICAgIC8vIHF1ZXJ5aW5nIG5vZGVzIHRoYXQgcmVmZXJlbmNlIHRoZSBmcmVzaGx5IG1pbnRlZCBhc3NldC5cbiAgICAgICAgICAgICAgICAgICAgbGV0IGFzc2V0VXVpZDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgcmVzdWx0ID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXNzZXRVdWlkID0gcmVzdWx0O1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHJlc3VsdCAmJiB0eXBlb2YgcmVzdWx0ID09PSAnb2JqZWN0JyAmJiB0eXBlb2YgKHJlc3VsdCBhcyBhbnkpLnV1aWQgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhc3NldFV1aWQgPSAocmVzdWx0IGFzIGFueSkudXVpZDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBsZXQgaW5zdGFuY2VOb2RlVXVpZDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgIGlmIChhc3NldFV1aWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgaW5zdGFuY2VzOiBhbnkgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1ub2Rlcy1ieS1hc3NldC11dWlkJywgYXNzZXRVdWlkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShpbnN0YW5jZXMpICYmIGluc3RhbmNlcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIE5ld2x5LWNyZWF0ZWQgcHJlZmFiIGluc3RhbmNlIGlzIHR5cGljYWxseSB0aGVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gbGFzdCBlbnRyeS4gQ2F2ZWF0OiBpZiB0aGUgc2FtZSBhc3NldCBhbHJlYWR5XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGhhZCBpbnN0YW5jZXMgaW4gdGhlIHNjZW5lLCBcImxhc3RcIiBwaWNrcyBvbmVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gb2YgdGhlbSByYXRoZXIgdGhhbiB0aGUgbmV3IG9uZS4gVGhlIGVkaXRvclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBhcHBlYXJzIHRvIHJldHVybiBjcmVhdGlvbiBvcmRlciwgYnV0IHRoZSBBUElcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gaXMgdW5kb2N1bWVudGVkOyBjYWxsZXJzIHJlcXVpcmluZyBzdHJpY3RcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gaWRlbnRpZmljYXRpb24gc2hvdWxkIHNuYXBzaG90IGJlZm9yZSBjYWxsaW5nLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbnN0YW5jZU5vZGVVdWlkID0gaW5zdGFuY2VzW2luc3RhbmNlcy5sZW5ndGggLSAxXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBOb24tZmF0YWw6IHRoZSBhc3NldCB3YXMgY3JlYXRlZCBlaXRoZXIgd2F5LlxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHVybDogY2FuZGlkYXRlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNvdXJjZU5vZGVVdWlkOiBub2RlVXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcmVmYWJBc3NldFV1aWQ6IGFzc2V0VXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbnN0YW5jZU5vZGVVdWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJhdzogcmVzdWx0LFxuICAgICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgICAgICAgICBlcnJvcnMucHVzaChgJHtjYW5kaWRhdGV9OiAke2Vycj8ubWVzc2FnZSA/PyBlcnJ9YCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBlcnJvcjogYGNjZS5QcmVmYWIuY3JlYXRlUHJlZmFiIGZhaWxlZDogJHtlcnJvcnMuam9pbignOyAnKX1gLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvcj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyb3IpIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogUHVzaCBwcmVmYWIgaW5zdGFuY2UgZWRpdHMgYmFjayB0byB0aGUgcHJlZmFiIGFzc2V0LlxuICAgICAqIFdyYXBzIHNjZW5lIGZhY2FkZSBgYXBwbHlQcmVmYWIobm9kZVV1aWQpYC5cbiAgICAgKi9cbiAgICBhc3luYyBhcHBseVByZWZhYihub2RlVXVpZDogc3RyaW5nKSB7XG4gICAgICAgIGNvbnN0IHByZWZhYk1nciA9IGdldFByZWZhYkZhY2FkZSgpO1xuICAgICAgICBpZiAoIXByZWZhYk1nci5vaykge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBwcmVmYWJNZ3IuZXJyb3IgfTtcbiAgICAgICAgfVxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gTm90ZTogZmFjYWRlUmV0dXJuIGZyb20gY2NlLlNjZW5lRmFjYWRlLmFwcGx5UHJlZmFiIGlzIG9ic2VydmVkXG4gICAgICAgICAgICAvLyB0byBiZSBgZmFsc2VgIGV2ZW4gd2hlbiB0aGUgYXBwbHkgZ2VudWluZWx5IHdyaXRlcyB0byBkaXNrXG4gICAgICAgICAgICAvLyAodmVyaWZpZWQgZHVyaW5nIFA0IHYyLjEuMCByZWFsLWVkaXRvciB0ZXN0aW5nKS4gVHJlYXRcbiAgICAgICAgICAgIC8vIFwibm8gZXhjZXB0aW9uIHRocm93blwiIGFzIHN1Y2Nlc3MgYW5kIHN1cmZhY2UgdGhlIHJhdyByZXR1cm5cbiAgICAgICAgICAgIC8vIHZhbHVlIGFzIG1ldGFkYXRhIG9ubHkuXG4gICAgICAgICAgICBjb25zdCBmYWNhZGVSZXR1cm4gPSBhd2FpdCBwcmVmYWJNZ3IudmFsdWUuYXBwbHlQcmVmYWIobm9kZVV1aWQpO1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogeyBmYWNhZGVSZXR1cm4sIG5vZGVVdWlkIH0gfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvcj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyb3IpIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQ29ubmVjdCBhIHJlZ3VsYXIgbm9kZSB0byBhIHByZWZhYiBhc3NldCAobGluaykuXG4gICAgICogV3JhcHMgc2NlbmUgZmFjYWRlIGBsaW5rUHJlZmFiKG5vZGVVdWlkLCBhc3NldFV1aWQpYC5cbiAgICAgKi9cbiAgICBhc3luYyBsaW5rUHJlZmFiKG5vZGVVdWlkOiBzdHJpbmcsIGFzc2V0VXVpZDogc3RyaW5nKSB7XG4gICAgICAgIGNvbnN0IHByZWZhYk1nciA9IGdldFByZWZhYkZhY2FkZSgpO1xuICAgICAgICBpZiAoIXByZWZhYk1nci5vaykge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBwcmVmYWJNZ3IuZXJyb3IgfTtcbiAgICAgICAgfVxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgcHJlZmFiTWdyLnZhbHVlLmxpbmtQcmVmYWIobm9kZVV1aWQsIGFzc2V0VXVpZCk7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBkYXRhOiB7IGxpbmtlZDogcmVzdWx0LCBub2RlVXVpZCwgYXNzZXRVdWlkIH0gfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvcj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyb3IpIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQnJlYWsgdGhlIHByZWZhYiBjb25uZWN0aW9uIG9uIGEgbm9kZS5cbiAgICAgKiBXcmFwcyBzY2VuZSBmYWNhZGUgYHVubGlua1ByZWZhYihub2RlVXVpZCwgcmVtb3ZlTmVzdGVkKWAuXG4gICAgICovXG4gICAgYXN5bmMgdW5saW5rUHJlZmFiKG5vZGVVdWlkOiBzdHJpbmcsIHJlbW92ZU5lc3RlZDogYm9vbGVhbikge1xuICAgICAgICBjb25zdCBwcmVmYWJNZ3IgPSBnZXRQcmVmYWJGYWNhZGUoKTtcbiAgICAgICAgaWYgKCFwcmVmYWJNZ3Iub2spIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogcHJlZmFiTWdyLmVycm9yIH07XG4gICAgICAgIH1cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHByZWZhYk1nci52YWx1ZS51bmxpbmtQcmVmYWIobm9kZVV1aWQsIHJlbW92ZU5lc3RlZCk7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBkYXRhOiB7IHVubGlua2VkOiByZXN1bHQsIG5vZGVVdWlkLCByZW1vdmVOZXN0ZWQgfSB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycm9yPy5tZXNzYWdlID8/IFN0cmluZyhlcnJvcikgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBSZWFkIHRoZSBwcmVmYWIgZHVtcCBmb3IgYSBwcmVmYWIgaW5zdGFuY2Ugbm9kZS5cbiAgICAgKiBXcmFwcyBzY2VuZSBmYWNhZGUgYGdldFByZWZhYkRhdGEobm9kZVV1aWQpYC5cbiAgICAgKi9cbiAgICBnZXRQcmVmYWJEYXRhKG5vZGVVdWlkOiBzdHJpbmcpIHtcbiAgICAgICAgY29uc3QgcHJlZmFiTWdyID0gZ2V0UHJlZmFiRmFjYWRlKCk7XG4gICAgICAgIGlmICghcHJlZmFiTWdyLm9rKSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHByZWZhYk1nci5lcnJvciB9O1xuICAgICAgICB9XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBkYXRhID0gcHJlZmFiTWdyLnZhbHVlLmdldFByZWZhYkRhdGEobm9kZVV1aWQpO1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZGF0YSB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycm9yPy5tZXNzYWdlID8/IFN0cmluZyhlcnJvcikgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBBcHBlbmQgYSBjYy5FdmVudEhhbmRsZXIgZW50cnkgdG8gYSBjb21wb25lbnQncyBldmVudCBhcnJheVxuICAgICAqIChlLmcuIGNjLkJ1dHRvbi5jbGlja0V2ZW50cywgY2MuVG9nZ2xlLmNoZWNrRXZlbnRzKS5cbiAgICAgKlxuICAgICAqIFBlcnNpc3RlbmNlIG5vdGUgKENMQVVERS5tZCBMYW5kbWluZSAjMTEpOiBzY2VuZS1zY3JpcHQgYGFyci5wdXNoYFxuICAgICAqIG9ubHkgbXV0YXRlcyB0aGUgcnVudGltZSBjYy5Db21wb25lbnQgaW5zdGFuY2U7IHRoZSBlZGl0b3Inc1xuICAgICAqIHNlcmlhbGl6YXRpb24gbW9kZWwgKHdoYXQgYHNhdmUtc2NlbmVgIHdyaXRlcyB0byBkaXNrKSBkb2VzIG5vdCBzZWVcbiAgICAgKiB0aGUgY2hhbmdlLiBUaGUgaG9zdC1zaWRlIGNhbGxlciAoYGNvbXBvbmVudC10b29scy50c2ApIGlzXG4gICAgICogcmVzcG9uc2libGUgZm9yIG51ZGdpbmcgdGhlIG1vZGVsIGFmdGVyd2FyZHMgdmlhIGEgbm8tb3BcbiAgICAgKiBgc2V0LXByb3BlcnR5YCBvbiBhIGNvbXBvbmVudCBmaWVsZCDigJQgY2FsbGluZyBgc2V0LXByb3BlcnR5YCBmcm9tXG4gICAgICogaGVyZSBkb2Vzbid0IHByb3BhZ2F0ZSAoc2NlbmUtcHJvY2VzcyBJUEMgc2hvcnQtY2lyY3VpdHMgYW5kXG4gICAgICogc2tpcHMgdGhlIG1vZGVsIHN5bmMpLiBXZSBzdXJmYWNlIGBjb21wb25lbnRVdWlkYCBhbmRcbiAgICAgKiBgY29tcG9uZW50RW5hYmxlZGAgc28gdGhlIGNhbGxlciBoYXMgd2hhdCBpdCBuZWVkcy5cbiAgICAgKi9cbiAgICBhZGRFdmVudEhhbmRsZXIoXG4gICAgICAgIG5vZGVVdWlkOiBzdHJpbmcsXG4gICAgICAgIGNvbXBvbmVudFR5cGU6IHN0cmluZyxcbiAgICAgICAgZXZlbnRBcnJheVByb3BlcnR5OiBzdHJpbmcsXG4gICAgICAgIHRhcmdldFV1aWQ6IHN0cmluZyxcbiAgICAgICAgY29tcG9uZW50TmFtZTogc3RyaW5nLFxuICAgICAgICBoYW5kbGVyOiBzdHJpbmcsXG4gICAgICAgIGN1c3RvbUV2ZW50RGF0YT86IHN0cmluZyxcbiAgICApIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGNjID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IGN0eCA9IHJlc29sdmVDb21wb25lbnRDb250ZXh0KG5vZGVVdWlkLCBjb21wb25lbnRUeXBlKTtcbiAgICAgICAgICAgIGlmICghY3R4Lm9rKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBjdHguZXJyb3IgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHRhcmdldE5vZGUgPSBmaW5kTm9kZUJ5VXVpZERlZXAoY3R4LnNjZW5lLCB0YXJnZXRVdWlkKTtcbiAgICAgICAgICAgIGlmICghdGFyZ2V0Tm9kZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYFRhcmdldCBub2RlIHdpdGggVVVJRCAke3RhcmdldFV1aWR9IG5vdCBmb3VuZGAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGFyciA9IGN0eC5jb21wb25lbnRbZXZlbnRBcnJheVByb3BlcnR5XTtcbiAgICAgICAgICAgIGlmICghQXJyYXkuaXNBcnJheShhcnIpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgUHJvcGVydHkgJyR7ZXZlbnRBcnJheVByb3BlcnR5fScgb24gJHtjb21wb25lbnRUeXBlfSBpcyBub3QgYW4gYXJyYXkgKGdvdCAke3R5cGVvZiBhcnJ9KWAgfTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgZWggPSBuZXcgY2MuRXZlbnRIYW5kbGVyKCk7XG4gICAgICAgICAgICBlaC50YXJnZXQgPSB0YXJnZXROb2RlO1xuICAgICAgICAgICAgZWguY29tcG9uZW50ID0gY29tcG9uZW50TmFtZTtcbiAgICAgICAgICAgIGVoLmhhbmRsZXIgPSBoYW5kbGVyO1xuICAgICAgICAgICAgZWguY3VzdG9tRXZlbnREYXRhID0gY3VzdG9tRXZlbnREYXRhID8/ICcnO1xuICAgICAgICAgICAgYXJyLnB1c2goZWgpO1xuXG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5zZW5kKCdzY2VuZScsICdzbmFwc2hvdCcpO1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgaW5kZXg6IGFyci5sZW5ndGggLSAxLFxuICAgICAgICAgICAgICAgICAgICBjb3VudDogYXJyLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50VXVpZDogY3R4LmNvbXBvbmVudC51dWlkLFxuICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRFbmFibGVkOiBjdHguY29tcG9uZW50LmVuYWJsZWQgIT09IGZhbHNlLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycm9yPy5tZXNzYWdlID8/IFN0cmluZyhlcnJvcikgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBSZW1vdmUgYSBjYy5FdmVudEhhbmRsZXIgZW50cnkgYnkgaW5kZXgsIG9yIGJ5IG1hdGNoaW5nXG4gICAgICogKHRhcmdldFV1aWQsIGhhbmRsZXIpIHBhaXIuIElmIGJvdGggYXJlIHByb3ZpZGVkLCBpbmRleCB3aW5zLlxuICAgICAqXG4gICAgICogU2VlIGFkZEV2ZW50SGFuZGxlciBmb3IgdGhlIHBlcnNpc3RlbmNlIG5vdGUuIENhbGxlciBtdXN0IGZvbGxvdyB1cFxuICAgICAqIHdpdGggYSBob3N0LXNpZGUgYHNldC1wcm9wZXJ0eWAgbnVkZ2UgdXNpbmcgdGhlIHJldHVybmVkXG4gICAgICogYGNvbXBvbmVudFV1aWRgIC8gYGNvbXBvbmVudEVuYWJsZWRgIHRvIG1ha2UgdGhlIGNoYW5nZSB2aXNpYmxlIHRvXG4gICAgICogYHNhdmUtc2NlbmVgLlxuICAgICAqL1xuICAgIHJlbW92ZUV2ZW50SGFuZGxlcihcbiAgICAgICAgbm9kZVV1aWQ6IHN0cmluZyxcbiAgICAgICAgY29tcG9uZW50VHlwZTogc3RyaW5nLFxuICAgICAgICBldmVudEFycmF5UHJvcGVydHk6IHN0cmluZyxcbiAgICAgICAgaW5kZXg6IG51bWJlciB8IG51bGwsXG4gICAgICAgIHRhcmdldFV1aWQ6IHN0cmluZyB8IG51bGwsXG4gICAgICAgIGhhbmRsZXI6IHN0cmluZyB8IG51bGwsXG4gICAgKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBjdHggPSByZXNvbHZlQ29tcG9uZW50Q29udGV4dChub2RlVXVpZCwgY29tcG9uZW50VHlwZSk7XG4gICAgICAgICAgICBpZiAoIWN0eC5vaykge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogY3R4LmVycm9yIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBhcnIgPSBjdHguY29tcG9uZW50W2V2ZW50QXJyYXlQcm9wZXJ0eV07XG4gICAgICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkoYXJyKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYFByb3BlcnR5ICcke2V2ZW50QXJyYXlQcm9wZXJ0eX0nIG9uICR7Y29tcG9uZW50VHlwZX0gaXMgbm90IGFuIGFycmF5YCB9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBUcmltIGFyb3VuZCBjb21wYXJpc29ucyBzbyBjYWxsZXJzIHBhc3NpbmcgVVVJRHMgLyBoYW5kbGVyXG4gICAgICAgICAgICAvLyBuYW1lcyB3aXRoIGxlYWRpbmcvdHJhaWxpbmcgd2hpdGVzcGFjZSAoTExNIHRvb2wgYXJncyBvZnRlblxuICAgICAgICAgICAgLy8gY29tZSB3aXRoIHN0cmF5IHNwYWNlcykgc3RpbGwgZmluZCBhIG1hdGNoLiBDcnVjaWFsOiB0aGVcbiAgICAgICAgICAgIC8vIG91dGVyIGd1YXJkIHRlc3RzIHRoZSAqdHJpbW1lZCogdmFsdWVzIHRvbyDigJQgb3RoZXJ3aXNlIGFcbiAgICAgICAgICAgIC8vIHdoaXRlc3BhY2Utb25seSB0YXJnZXRVdWlkL2hhbmRsZXIgd291bGQgcGFzcyBhcyB0cnV0aHksXG4gICAgICAgICAgICAvLyBjb2xsYXBzZSB0byBudWxsIGFmdGVyIHRyaW0sIGFuZCB0aGUgcHJlZGljYXRlIHdvdWxkIG1hdGNoXG4gICAgICAgICAgICAvLyBldmVyeSBlbnRyeSB2YWN1b3VzbHksIHNpbGVudGx5IGRlbGV0aW5nIGFyclswXS5cbiAgICAgICAgICAgIGNvbnN0IHRhcmdldFV1aWROb3JtID0gdGFyZ2V0VXVpZD8udHJpbSgpIHx8IG51bGw7XG4gICAgICAgICAgICBjb25zdCBoYW5kbGVyTm9ybSA9IGhhbmRsZXI/LnRyaW0oKSB8fCBudWxsO1xuICAgICAgICAgICAgbGV0IHJlbW92ZUF0ID0gLTE7XG4gICAgICAgICAgICBpZiAodHlwZW9mIGluZGV4ID09PSAnbnVtYmVyJyAmJiBpbmRleCA+PSAwKSB7XG4gICAgICAgICAgICAgICAgcmVtb3ZlQXQgPSBpbmRleDtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodGFyZ2V0VXVpZE5vcm0gfHwgaGFuZGxlck5vcm0pIHtcbiAgICAgICAgICAgICAgICByZW1vdmVBdCA9IGFyci5maW5kSW5kZXgoKGVoOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZWhUYXJnZXRVdWlkID0gdHlwZW9mIGVoPy50YXJnZXQ/LnV1aWQgPT09ICdzdHJpbmcnID8gZWgudGFyZ2V0LnV1aWQudHJpbSgpIDogZWg/LnRhcmdldD8udXVpZDtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZWhIYW5kbGVyID0gdHlwZW9mIGVoPy5oYW5kbGVyID09PSAnc3RyaW5nJyA/IGVoLmhhbmRsZXIudHJpbSgpIDogZWg/LmhhbmRsZXI7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG1hdGNoZXNUYXJnZXQgPSAhdGFyZ2V0VXVpZE5vcm0gfHwgZWhUYXJnZXRVdWlkID09PSB0YXJnZXRVdWlkTm9ybTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbWF0Y2hlc0hhbmRsZXIgPSAhaGFuZGxlck5vcm0gfHwgZWhIYW5kbGVyID09PSBoYW5kbGVyTm9ybTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG1hdGNoZXNUYXJnZXQgJiYgbWF0Y2hlc0hhbmRsZXI7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocmVtb3ZlQXQgPCAwIHx8IHJlbW92ZUF0ID49IGFyci5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdObyBtYXRjaGluZyBldmVudCBoYW5kbGVyIHRvIHJlbW92ZScgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHJlbW92ZWQgPSBhcnIuc3BsaWNlKHJlbW92ZUF0LCAxKVswXTtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnNlbmQoJ3NjZW5lJywgJ3NuYXBzaG90Jyk7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICBpbmRleDogcmVtb3ZlQXQsXG4gICAgICAgICAgICAgICAgICAgIHJlbWFpbmluZzogYXJyLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgcmVtb3ZlZDogc2VyaWFsaXplRXZlbnRIYW5kbGVyKHJlbW92ZWQpLFxuICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRVdWlkOiBjdHguY29tcG9uZW50LnV1aWQsXG4gICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudEVuYWJsZWQ6IGN0eC5jb21wb25lbnQuZW5hYmxlZCAhPT0gZmFsc2UsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3I/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycm9yKSB9O1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEluc3BlY3QgYSBjb21wb25lbnQncyBFdmVudEhhbmRsZXIgYXJyYXkgKHJlYWQtb25seSkuXG4gICAgICovXG4gICAgbGlzdEV2ZW50SGFuZGxlcnMobm9kZVV1aWQ6IHN0cmluZywgY29tcG9uZW50VHlwZTogc3RyaW5nLCBldmVudEFycmF5UHJvcGVydHk6IHN0cmluZykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgY3R4ID0gcmVzb2x2ZUNvbXBvbmVudENvbnRleHQobm9kZVV1aWQsIGNvbXBvbmVudFR5cGUpO1xuICAgICAgICAgICAgaWYgKCFjdHgub2spIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGN0eC5lcnJvciB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgYXJyID0gY3R4LmNvbXBvbmVudFtldmVudEFycmF5UHJvcGVydHldO1xuICAgICAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KGFycikpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBQcm9wZXJ0eSAnJHtldmVudEFycmF5UHJvcGVydHl9JyBvbiAke2NvbXBvbmVudFR5cGV9IGlzIG5vdCBhbiBhcnJheWAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIGNvdW50OiBhcnIubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICBoYW5kbGVyczogYXJyLm1hcChzZXJpYWxpemVFdmVudEhhbmRsZXIpLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycm9yPy5tZXNzYWdlID8/IFN0cmluZyhlcnJvcikgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiB2Mi40LjggQTI6IGNjLkFuaW1hdGlvbiBkcml2ZXJzIOKAlCBzZWUgc291cmNlL3Rvb2xzL2FuaW1hdGlvbi10b29scy50cy5cbiAgICAgKiBJbXBsZW1lbnRhdGlvbiBub3RlOiBjb2NvcyBleHBvc2VzIHRoZSBlbmdpbmUncyBgY2MuQW5pbWF0aW9uYCAoYW5kXG4gICAgICogaXRzIHN1Yi1jbGFzc2VzIHZpYSBganMuZ2V0Q2xhc3NCeU5hbWVgKS4gV2UgdXNlIHRoZSBydW50aW1lIEFQSVxuICAgICAqIChgZ2V0Q29tcG9uZW50KCdjYy5BbmltYXRpb24nKWApIHJhdGhlciB0aGFuIHRoZSBlZGl0b3IncyBzZXQtcHJvcGVydHlcbiAgICAgKiBjaGFubmVsIGJlY2F1c2UgdGhlIGxhdHRlciB3b3VsZCBvbmx5IHBlcnNpc3QgZGVmYXVsdENsaXAgLyBwbGF5T25Mb2FkXG4gICAgICogYnV0IGNhbm5vdCB0cmlnZ2VyIHBsYXkoKS9zdG9wKCkg4oCUIHRob3NlIGFyZSBydW50aW1lIG1ldGhvZHMgb25seS5cbiAgICAgKi9cbiAgICBnZXRBbmltYXRpb25DbGlwcyhub2RlVXVpZDogc3RyaW5nKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCB7IGRpcmVjdG9yIH0gPSByZXF1aXJlKCdjYycpO1xuICAgICAgICAgICAgY29uc3Qgc2NlbmUgPSBkaXJlY3Rvci5nZXRTY2VuZSgpO1xuICAgICAgICAgICAgaWYgKCFzY2VuZSkgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnTm8gYWN0aXZlIHNjZW5lJyB9O1xuICAgICAgICAgICAgY29uc3Qgbm9kZSA9IGZpbmROb2RlQnlVdWlkRGVlcChzY2VuZSwgbm9kZVV1aWQpO1xuICAgICAgICAgICAgaWYgKCFub2RlKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBOb2RlICR7bm9kZVV1aWR9IG5vdCBmb3VuZGAgfTtcbiAgICAgICAgICAgIGNvbnN0IGFuaW0gPSBub2RlLmdldENvbXBvbmVudCgnY2MuQW5pbWF0aW9uJyk7XG4gICAgICAgICAgICBpZiAoIWFuaW0pIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBOb2RlICR7bm9kZVV1aWR9IGhhcyBubyBjYy5BbmltYXRpb24gY29tcG9uZW50YCB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgY2xpcHM6IGFueVtdID0gYW5pbS5jbGlwcyA/PyBbXTtcbiAgICAgICAgICAgIGNvbnN0IGRlZmF1bHRDbGlwTmFtZSA9IGFuaW0uZGVmYXVsdENsaXA/Lm5hbWUgPz8gbnVsbDtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIG5vZGVVdWlkLFxuICAgICAgICAgICAgICAgICAgICBub2RlTmFtZTogbm9kZS5uYW1lLFxuICAgICAgICAgICAgICAgICAgICBkZWZhdWx0Q2xpcDogZGVmYXVsdENsaXBOYW1lLFxuICAgICAgICAgICAgICAgICAgICBwbGF5T25Mb2FkOiBhbmltLnBsYXlPbkxvYWQgPT09IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIGNsaXBzOiBjbGlwcy5maWx0ZXIoYyA9PiBjKS5tYXAoYyA9PiAoe1xuICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogYy5uYW1lID8/IG51bGwsXG4gICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiBjLl91dWlkID8/IGMudXVpZCA/PyBudWxsLFxuICAgICAgICAgICAgICAgICAgICAgICAgZHVyYXRpb246IHR5cGVvZiBjLmR1cmF0aW9uID09PSAnbnVtYmVyJyA/IGMuZHVyYXRpb24gOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICAgICAgd3JhcE1vZGU6IGMud3JhcE1vZGUgPz8gbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgfSkpLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycm9yPy5tZXNzYWdlID8/IFN0cmluZyhlcnJvcikgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICBwbGF5QW5pbWF0aW9uKG5vZGVVdWlkOiBzdHJpbmcsIGNsaXBOYW1lPzogc3RyaW5nKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCB7IGRpcmVjdG9yIH0gPSByZXF1aXJlKCdjYycpO1xuICAgICAgICAgICAgY29uc3Qgc2NlbmUgPSBkaXJlY3Rvci5nZXRTY2VuZSgpO1xuICAgICAgICAgICAgaWYgKCFzY2VuZSkgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnTm8gYWN0aXZlIHNjZW5lJyB9O1xuICAgICAgICAgICAgY29uc3Qgbm9kZSA9IGZpbmROb2RlQnlVdWlkRGVlcChzY2VuZSwgbm9kZVV1aWQpO1xuICAgICAgICAgICAgaWYgKCFub2RlKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBOb2RlICR7bm9kZVV1aWR9IG5vdCBmb3VuZGAgfTtcbiAgICAgICAgICAgIGNvbnN0IGFuaW0gPSBub2RlLmdldENvbXBvbmVudCgnY2MuQW5pbWF0aW9uJyk7XG4gICAgICAgICAgICBpZiAoIWFuaW0pIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBOb2RlICR7bm9kZVV1aWR9IGhhcyBubyBjYy5BbmltYXRpb24gY29tcG9uZW50YCB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGNsaXBOYW1lKSB7XG4gICAgICAgICAgICAgICAgLy8gVmFsaWRhdGUgY2xpcCBleGlzdHMgYmVmb3JlIGNhbGxpbmcgcGxheSgpIOKAlCBjYy5BbmltYXRpb24ucGxheVxuICAgICAgICAgICAgICAgIC8vIHNpbGVudGx5IGRvZXMgbm90aGluZyBvbiB1bmtub3duIG5hbWVzIHdoaWNoIHdvdWxkIG1hc2tcbiAgICAgICAgICAgICAgICAvLyB0eXBvcyBpbiBBSS1nZW5lcmF0ZWQgY2FsbHMuXG4gICAgICAgICAgICAgICAgY29uc3Qga25vd24gPSAoYW5pbS5jbGlwcyA/PyBbXSkuc29tZSgoYzogYW55KSA9PiBjPy5uYW1lID09PSBjbGlwTmFtZSk7XG4gICAgICAgICAgICAgICAgaWYgKCFrbm93biAmJiAoYW5pbS5kZWZhdWx0Q2xpcD8ubmFtZSAhPT0gY2xpcE5hbWUpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yOiBgQ2xpcCAnJHtjbGlwTmFtZX0nIGlzIG5vdCByZWdpc3RlcmVkIG9uIHRoaXMgQW5pbWF0aW9uLiBLbm93bjogJHsoYW5pbS5jbGlwcyA/PyBbXSkubWFwKChjOiBhbnkpID0+IGM/Lm5hbWUpLmZpbHRlcihCb29sZWFuKS5qb2luKCcsICcpIHx8ICcobm9uZSknfS5gLFxuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBhbmltLnBsYXkoY2xpcE5hbWUpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBpZiAoIWFuaW0uZGVmYXVsdENsaXApIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnTm8gY2xpcE5hbWUgZ2l2ZW4gYW5kIG5vIGRlZmF1bHRDbGlwIGNvbmZpZ3VyZWQnIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGFuaW0ucGxheSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBQbGF5aW5nICcke2NsaXBOYW1lID8/IGFuaW0uZGVmYXVsdENsaXA/Lm5hbWV9JyBvbiAke25vZGUubmFtZX1gLFxuICAgICAgICAgICAgICAgIGRhdGE6IHsgbm9kZVV1aWQsIGNsaXBOYW1lOiBjbGlwTmFtZSA/PyBhbmltLmRlZmF1bHRDbGlwPy5uYW1lID8/IG51bGwgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3I/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycm9yKSB9O1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIHN0b3BBbmltYXRpb24obm9kZVV1aWQ6IHN0cmluZykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgeyBkaXJlY3RvciB9ID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICAgICAgICAgIGlmICghc2NlbmUpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ05vIGFjdGl2ZSBzY2VuZScgfTtcbiAgICAgICAgICAgIGNvbnN0IG5vZGUgPSBmaW5kTm9kZUJ5VXVpZERlZXAoc2NlbmUsIG5vZGVVdWlkKTtcbiAgICAgICAgICAgIGlmICghbm9kZSkgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgTm9kZSAke25vZGVVdWlkfSBub3QgZm91bmRgIH07XG4gICAgICAgICAgICBjb25zdCBhbmltID0gbm9kZS5nZXRDb21wb25lbnQoJ2NjLkFuaW1hdGlvbicpO1xuICAgICAgICAgICAgaWYgKCFhbmltKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgTm9kZSAke25vZGVVdWlkfSBoYXMgbm8gY2MuQW5pbWF0aW9uIGNvbXBvbmVudGAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGFuaW0uc3RvcCgpO1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgbWVzc2FnZTogYFN0b3BwZWQgYW5pbWF0aW9uIG9uICR7bm9kZS5uYW1lfWAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvcj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyb3IpIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogUmVzb2x2ZSBhIGNsaXAgbmFtZSDihpIgYXNzZXQgdXVpZCBvbiBhIG5vZGUncyBjYy5BbmltYXRpb24uIFJldHVybnNcbiAgICAgKiB0aGUgbWF0Y2hpbmcgY2xpcCdzIGBfdXVpZGAgYWxvbmcgd2l0aCB0aGUgY2MuQW5pbWF0aW9uIGNvbXBvbmVudFxuICAgICAqIGluZGV4IGluc2lkZSBgX19jb21wc19fYCwgYm90aCBvZiB3aGljaCB0aGUgaG9zdC1zaWRlXG4gICAgICogYW5pbWF0aW9uX3NldF9jbGlwIGhhbmRsZXIgbmVlZHMgdG8gaXNzdWUgYHNldC1wcm9wZXJ0eWAgd3JpdGVzLlxuICAgICAqXG4gICAgICogV2h5IGhvc3Qtc2lkZSBkb2VzIHRoZSBhY3R1YWwgd3JpdGU6IExhbmRtaW5lICMxMSDigJQgc2NhbGFyXG4gICAgICogcHJvcGVydHkgd3JpdGVzIHZpYSB0aGUgZWRpdG9yJ3Mgc2V0LXByb3BlcnR5IGNoYW5uZWwgcHJvcGFnYXRlXG4gICAgICogdG8gdGhlIHNlcmlhbGl6YXRpb24gbW9kZWwgaW1tZWRpYXRlbHkuIERpcmVjdCBydW50aW1lIG11dGF0aW9uXG4gICAgICogKGBhbmltLmRlZmF1bHRDbGlwID0geGApIG9ubHkgdXBkYXRlcyBsYXllciAoYSkgYW5kIG1heSBub3RcbiAgICAgKiBwZXJzaXN0IG9uIHNhdmVfc2NlbmUuIFNvIHNjZW5lLXNjcmlwdCByZXR1cm5zIHRoZSBtZXRhZGF0YTsgaG9zdFxuICAgICAqIGRvZXMgdGhlIHBlcnNpc3RlbmNlLlxuICAgICAqL1xuICAgIHF1ZXJ5QW5pbWF0aW9uU2V0VGFyZ2V0cyhub2RlVXVpZDogc3RyaW5nLCBjbGlwTmFtZTogc3RyaW5nIHwgbnVsbCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgeyBkaXJlY3RvciB9ID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICAgICAgICAgIGlmICghc2NlbmUpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ05vIGFjdGl2ZSBzY2VuZScgfTtcbiAgICAgICAgICAgIGNvbnN0IG5vZGUgPSBmaW5kTm9kZUJ5VXVpZERlZXAoc2NlbmUsIG5vZGVVdWlkKTtcbiAgICAgICAgICAgIGlmICghbm9kZSkgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgTm9kZSAke25vZGVVdWlkfSBub3QgZm91bmRgIH07XG4gICAgICAgICAgICAvLyB2Mi40LjkgcmV2aWV3IGZpeCAoY2xhdWRlICsgY29kZXgg8J+foSk6IHVzZSBpbmRleE9mIG9uIHRoZVxuICAgICAgICAgICAgLy8gcmVzb2x2ZWQgYW5pbSBpbnN0YW5jZSBkaXJlY3RseS4gVGhlIHByZXZpb3VzIG1ldGFkYXRhLXN0cmluZ1xuICAgICAgICAgICAgLy8gbG9va3VwIChjb25zdHJ1Y3Rvci5uYW1lIC8gX19jbGFzc25hbWVfXyAvIF9jaWQpIHdhcyBmcmFnaWxlXG4gICAgICAgICAgICAvLyBhZ2FpbnN0IGN1c3RvbSBzdWJjbGFzc2VzIChjYy5Ta2VsZXRhbEFuaW1hdGlvbiwgdXNlci1kZXJpdmVkXG4gICAgICAgICAgICAvLyBjYy5BbmltYXRpb24pLiBnZXRDb21wb25lbnQoJ2NjLkFuaW1hdGlvbicpIHJlc29sdmVzIHN1YmNsYXNzZXNcbiAgICAgICAgICAgIC8vIGNvcnJlY3RseTsgbWF0Y2hpbmcgYnkgcmVmZXJlbmNlIGlzIHRoZSBjYW5vbmljYWwgd2F5IHRvIGZpbmRcbiAgICAgICAgICAgIC8vIHRoZSBzYW1lIGluc3RhbmNlJ3Mgc2xvdCBpbiBfX2NvbXBzX18uXG4gICAgICAgICAgICBjb25zdCBhbmltID0gbm9kZS5nZXRDb21wb25lbnQoJ2NjLkFuaW1hdGlvbicpO1xuICAgICAgICAgICAgaWYgKCFhbmltKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgTm9kZSAke25vZGVVdWlkfSBoYXMgbm8gY2MuQW5pbWF0aW9uIGNvbXBvbmVudGAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGNvbXBvbmVudHM6IGFueVtdID0gKG5vZGUuX2NvbXBvbmVudHMgPz8gbm9kZS5jb21wb25lbnRzID8/IFtdKTtcbiAgICAgICAgICAgIGNvbnN0IGNvbXBJbmRleCA9IGNvbXBvbmVudHMuaW5kZXhPZihhbmltKTtcbiAgICAgICAgICAgIGlmIChjb21wSW5kZXggPT09IC0xKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgTm9kZSAke25vZGVVdWlkfSBjYy5BbmltYXRpb24gY29tcG9uZW50IG5vdCBmb3VuZCBpbiBfX2NvbXBzX18gYXJyYXkgKGNvY29zIGVkaXRvciBpbmNvbnNpc3RlbmN5KS5gIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBsZXQgY2xpcFV1aWQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICAgICAgICAgICAgaWYgKGNsaXBOYW1lICE9PSBudWxsICYmIGNsaXBOYW1lICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBjbGlwID0gKGFuaW0uY2xpcHMgPz8gW10pLmZpbmQoKGM6IGFueSkgPT4gYz8ubmFtZSA9PT0gY2xpcE5hbWUpO1xuICAgICAgICAgICAgICAgIGlmICghY2xpcCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgICAgICBlcnJvcjogYENsaXAgJyR7Y2xpcE5hbWV9JyBpcyBub3QgcmVnaXN0ZXJlZCBvbiB0aGlzIEFuaW1hdGlvbi4gS25vd246ICR7KGFuaW0uY2xpcHMgPz8gW10pLm1hcCgoYzogYW55KSA9PiBjPy5uYW1lKS5maWx0ZXIoQm9vbGVhbikuam9pbignLCAnKSB8fCAnKG5vbmUpJ30uYCxcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2xpcFV1aWQgPSBjbGlwLl91dWlkID8/IGNsaXAudXVpZCA/PyBudWxsO1xuICAgICAgICAgICAgICAgIGlmICghY2xpcFV1aWQpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgQ2xpcCAnJHtjbGlwTmFtZX0nIGhhcyBubyBhc3NldCB1dWlkOyBjYW5ub3QgcGVyc2lzdCBhcyBkZWZhdWx0Q2xpcC5gIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50SW5kZXg6IGNvbXBJbmRleCxcbiAgICAgICAgICAgICAgICAgICAgY2xpcFV1aWQsXG4gICAgICAgICAgICAgICAgICAgIGN1cnJlbnREZWZhdWx0Q2xpcDogYW5pbS5kZWZhdWx0Q2xpcD8ubmFtZSA/PyBudWxsLFxuICAgICAgICAgICAgICAgICAgICBjdXJyZW50UGxheU9uTG9hZDogYW5pbS5wbGF5T25Mb2FkID09PSB0cnVlLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycm9yPy5tZXNzYWdlID8/IFN0cmluZyhlcnJvcikgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cbn07Il19