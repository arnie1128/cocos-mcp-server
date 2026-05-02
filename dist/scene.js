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
// v2.4.8 A3 + v2.4.9 + v2.4.10 review fix: scene-side log capture
// (RomaRogov pattern adapted).
//
// Concurrency model — v2.4.10 (claude + codex 🔴 round-2):
//   v2.4.8 fanned every console.log to ALL active capture arrays.
//   v2.4.9 attempted to isolate via _topSlot() (current top of stack)
//   but that only worked for strictly LIFO-nested calls; two calls
//   that interleave via `await` could still misattribute (call A
//   awaits, B pushes its slot, A's post-await logs would route to B).
//   v2.4.10 uses Node's built-in `AsyncLocalStorage` so each call's
//   logical async chain keeps its OWN slot regardless of stack order.
//   When console.log fires, the hook reads ALS.getStore() — which is
//   bound to the originating call's async context — and writes there.
//
// Bound — v2.4.9 (claude + codex 🟡):
//   Cap entries per capture (default 500) and total bytes (default
//   64 KB). Excess entries are dropped; a single `[capture truncated]`
//   marker is appended once. v2.4.10: marker bytes counted against
//   the cap (codex round-2 🟡) so the slot's bytes field stays
//   monotonically accurate.
//
// Hook lifecycle:
//   The console hook is installed on first `runWithCapture` invocation
//   and uninstalled when no slot is active. Each invocation `als.run()`s
//   with its slot, so the hook just reads the store. We still keep
//   `_activeSlotCount` as a refcount to know when to unhook (ALS
//   doesn't expose store count directly).
const async_hooks_1 = require("async_hooks");
const CAPTURE_MAX_ENTRIES = 500;
const CAPTURE_MAX_BYTES = 64 * 1024;
const _captureALS = new async_hooks_1.AsyncLocalStorage();
let _activeSlotCount = 0;
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
        const marker = { level: 'warn', message: '[capture truncated — exceeded entry/byte cap]', ts: Date.now() };
        slot.entries.push(marker);
        // v2.4.10 codex round-2 🟡: track marker bytes too so cap accounting
        // stays accurate even though no further appends will follow.
        slot.bytes += marker.message.length + 32;
        return;
    }
    slot.entries.push(entry);
    slot.bytes += entryBytes;
}
function _ensureConsoleHook() {
    if (_origConsole)
        return;
    _origConsole = { log: console.log, warn: console.warn, error: console.error };
    const make = (level, orig) => (...a) => {
        const slot = _captureALS.getStore();
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
    if (_activeSlotCount > 0 || !_origConsole)
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
        const slot = {
            entries: [],
            bytes: 0,
            truncated: false,
        };
        // v2.4.11 round-3 codex 🔴 + claude 🟡 + gemini 🟡: keep increment
        // OUTSIDE the try (numeric `+= 1` is infallible, must pair 1:1 with
        // finally decrement), but move _ensureConsoleHook INSIDE so a
        // throw there (today: pure assignments, so safe; defensive against
        // future growth) cannot leak the refcount and leave the console
        // hook installed forever.
        _activeSlotCount += 1;
        try {
            _ensureConsoleHook();
            // v2.4.10 round-2 codex 🔴 + claude 🟡 + gemini 🟡: AsyncLocalStorage
            // binds `slot` to this call's logical async context, so any
            // console.log emitted by the inner method (or any descendant
            // microtask, even after `await` boundaries when other calls are
            // also active) routes to THIS slot — not whichever was
            // top-of-stack at the moment the log fired. Eliminates
            // cross-call leakage from interleaved async runs.
            return await _captureALS.run(slot, async () => {
                var _a, _b;
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
            });
        }
        finally {
            _activeSlotCount = Math.max(0, _activeSlotCount - 1);
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
            // Note: facadeReturn from cce.SceneFacadeManager.applyPrefab is
            // observed to be `false` even when the apply genuinely writes
            // to disk (verified during P4 v2.1.0 real-editor testing).
            // Treat "no exception thrown" as success and surface the raw
            // return value as metadata only.
            // (v2.9.x polish — Gemini r1 single-🟡 from v2.8.1 review:
            // canonical name is SceneFacadeManager; cce.SceneFacade is
            // the type-doc alias. Use SceneFacadeManager throughout
            // comments so the runtime identity is unambiguous.)
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
    listAnimationStates(nodeUuid) {
        var _a, _b;
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
            const clips = typeof anim.getAnimationClips === 'function'
                ? anim.getAnimationClips()
                : ((_a = anim.clips) !== null && _a !== void 0 ? _a : []);
            const states = clips
                .filter((clip) => clip === null || clip === void 0 ? void 0 : clip.name)
                .map((clip) => anim.getState(clip.name))
                .filter((state) => state)
                .map((state) => {
                var _a;
                return ({
                    name: (_a = state.name) !== null && _a !== void 0 ? _a : null,
                    speed: typeof state.speed === 'number' ? state.speed : null,
                    totalTime: typeof state.totalTime === 'number' ? state.totalTime : null,
                    currentTime: typeof state.currentTime === 'number' ? state.currentTime : null,
                    isPlaying: state.isPlaying === true,
                });
            });
            return { success: true, data: states };
        }
        catch (error) {
            return { success: false, error: (_b = error === null || error === void 0 ? void 0 : error.message) !== null && _b !== void 0 ? _b : String(error) };
        }
    },
    getAnimationStateInfo(nodeUuid, stateName) {
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
            const state = anim.getState(stateName);
            if (!state) {
                return { success: false, error: `Animation state '${stateName}' not found` };
            }
            return {
                success: true,
                data: {
                    speed: typeof state.speed === 'number' ? state.speed : null,
                    isPlaying: state.isPlaying === true,
                    currentTime: typeof state.currentTime === 'number' ? state.currentTime : null,
                    totalTime: typeof state.totalTime === 'number' ? state.totalTime : null,
                },
            };
        }
        catch (error) {
            return { success: false, error: (_a = error === null || error === void 0 ? void 0 : error.message) !== null && _a !== void 0 ? _a : String(error) };
        }
    },
    setAnimationSpeed(nodeUuid, stateName, speed) {
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
            const state = anim.getState(stateName);
            if (!state) {
                return { success: false, error: `Animation state '${stateName}' not found` };
            }
            state.speed = speed;
            return {
                success: true,
                data: {
                    speed: state.speed,
                    isPlaying: state.isPlaying === true,
                    currentTime: typeof state.currentTime === 'number' ? state.currentTime : null,
                    totalTime: typeof state.totalTime === 'number' ? state.totalTime : null,
                },
            };
        }
        catch (error) {
            return { success: false, error: (_a = error === null || error === void 0 ? void 0 : error.message) !== null && _a !== void 0 ? _a : String(error) };
        }
    },
    checkAnimationFinished(nodeUuid, stateName) {
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
            const state = anim.getState(stateName);
            if (!state) {
                return { success: false, error: `Animation state '${stateName}' not found` };
            }
            const currentTime = typeof state.currentTime === 'number' ? state.currentTime : 0;
            const totalTime = typeof state.totalTime === 'number' ? state.totalTime : 0;
            return { success: true, data: { finished: currentTime >= totalTime } };
        }
        catch (error) {
            return { success: false, error: (_a = error === null || error === void 0 ? void 0 : error.message) !== null && _a !== void 0 ? _a : String(error) };
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
    /**
     * v2.8.0 T-V28-3 / v2.8.2 retest fix: enter / exit Preview-in-Editor
     * (PIE) play mode programmatically. Uses the typed
     * `changePreviewPlayState(state: boolean)` method declared on
     * `SceneFacadeManager` —
     * `node_modules/@cocos/creator-types/editor/packages/scene/@types/cce/3d/facade/scene-facade-manager.d.ts:250`.
     *
     * Parameters:
     *   state — true to start PIE, false to stop and return to scene mode.
     *
     * **v2.8.2 retest finding**: v2.8.0 dispatched against `cce.SceneFacade`
     * (matching the type-doc name) but live cocos editor 3.8.x exposes the
     * runtime singleton at `cce.SceneFacadeManager` (and / or
     * `.SceneFacadeManager.instance`), same convention as the prefab path
     * uses (see `getPrefabFacade` above). Probing all three candidates
     * keeps the code resilient across cocos builds where the namespace
     * shape differs.
     *
     * The HANDOFF originally noted `scene/editor-preview-set-play` as an
     * undocumented Editor.Message channel; we use the typed facade method
     * instead so the call path is type-checked against creator-types and
     * not subject to silent removal between cocos versions.
     *
     * Returns the standard scene-script envelope. References the
     * top-level `cce` declaration (matching the prefab pattern) rather
     * than reaching through `globalThis` so the resolution semantics
     * match other scene-script methods in this file.
     */
    async changePreviewPlayState(state) {
        var _a, _b;
        try {
            if (typeof cce === 'undefined' || cce === null) {
                return {
                    success: false,
                    error: 'cce global is not available; this method must run in a scene-script context.',
                };
            }
            // v2.8.2: probe the three candidate locations the SceneFacade
            // singleton has been observed at across cocos builds. Same
            // convention as getPrefabFacade.
            const candidates = [
                cce.SceneFacade,
                (_a = cce.SceneFacadeManager) === null || _a === void 0 ? void 0 : _a.instance,
                cce.SceneFacadeManager,
            ];
            const facade = candidates.find(c => c && typeof c.changePreviewPlayState === 'function');
            if (!facade) {
                return {
                    success: false,
                    error: 'No SceneFacade with changePreviewPlayState found on cce (cce.SceneFacade / cce.SceneFacadeManager / .instance). Cocos version may not support PIE control via this facade — use the toolbar play button manually.',
                };
            }
            await facade.changePreviewPlayState(Boolean(state));
            return {
                success: true,
                data: { requestedState: Boolean(state) },
            };
        }
        catch (error) {
            return { success: false, error: (_b = error === null || error === void 0 ? void 0 : error.message) !== null && _b !== void 0 ? _b : String(error) };
        }
    },
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NlbmUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zb3VyY2Uvc2NlbmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsK0JBQTRCO0FBQzVCLE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUEsV0FBSSxFQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLGNBQWMsQ0FBQyxDQUFDLENBQUM7QUFxQnpELFNBQVMsZUFBZTs7SUFDcEIsSUFBSSxPQUFPLEdBQUcsS0FBSyxXQUFXLElBQUksR0FBRyxLQUFLLElBQUksRUFBRSxDQUFDO1FBQzdDLE9BQU8sRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSw2RUFBNkUsRUFBRSxDQUFDO0lBQy9HLENBQUM7SUFDRCxNQUFNLFVBQVUsR0FBb0M7UUFDaEQsR0FBRyxDQUFDLE1BQU07UUFDVixNQUFBLEdBQUcsQ0FBQyxrQkFBa0IsMENBQUUsUUFBUTtRQUNoQyxHQUFHLENBQUMsa0JBQThDO0tBQ3JELENBQUM7SUFDRixnRUFBZ0U7SUFDaEUsK0RBQStEO0lBQy9ELE1BQU0sUUFBUSxHQUE4QixDQUFDLGNBQWMsRUFBRSxhQUFhLEVBQUUsWUFBWSxFQUFFLGNBQWMsRUFBRSxlQUFlLENBQUMsQ0FBQztJQUMzSCxLQUFLLE1BQU0sU0FBUyxJQUFJLFVBQVUsRUFBRSxDQUFDO1FBQ2pDLElBQUksU0FBUyxJQUFJLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxPQUFRLFNBQWlCLENBQUMsQ0FBQyxDQUFDLEtBQUssVUFBVSxDQUFDLEVBQUUsQ0FBQztZQUNoRixPQUFPLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLENBQUM7UUFDMUMsQ0FBQztJQUNMLENBQUM7SUFDRCxPQUFPO1FBQ0gsRUFBRSxFQUFFLEtBQUs7UUFDVCxLQUFLLEVBQUUseUtBQXlLO0tBQ25MLENBQUM7QUFDTixDQUFDO0FBTUQsU0FBUyxrQkFBa0IsQ0FBQyxJQUFTLEVBQUUsSUFBWTs7SUFDL0MsSUFBSSxDQUFDLElBQUk7UUFBRSxPQUFPLElBQUksQ0FBQztJQUN2QixJQUFJLElBQUksQ0FBQyxHQUFHLEtBQUssSUFBSSxJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssSUFBSTtRQUFFLE9BQU8sSUFBSSxDQUFDO0lBQ3pELE1BQU0sUUFBUSxHQUFHLE1BQUEsTUFBQSxJQUFJLENBQUMsUUFBUSxtQ0FBSSxJQUFJLENBQUMsU0FBUyxtQ0FBSSxFQUFFLENBQUM7SUFDdkQsS0FBSyxNQUFNLEtBQUssSUFBSSxRQUFRLEVBQUUsQ0FBQztRQUMzQixNQUFNLEdBQUcsR0FBRyxrQkFBa0IsQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDNUMsSUFBSSxHQUFHO1lBQUUsT0FBTyxHQUFHLENBQUM7SUFDeEIsQ0FBQztJQUNELE9BQU8sSUFBSSxDQUFDO0FBQ2hCLENBQUM7QUFFRCxTQUFTLHVCQUF1QixDQUFDLFFBQWdCLEVBQUUsYUFBcUI7SUFDcEUsTUFBTSxFQUFFLFFBQVEsRUFBRSxFQUFFLEVBQUUsR0FBRyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDdkMsTUFBTSxLQUFLLEdBQUcsUUFBUSxDQUFDLFFBQVEsRUFBRSxDQUFDO0lBQ2xDLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNULE9BQU8sRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxpQkFBaUIsRUFBRSxDQUFDO0lBQ25ELENBQUM7SUFDRCwyRUFBMkU7SUFDM0UsTUFBTSxJQUFJLEdBQUcsa0JBQWtCLENBQUMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBQ2pELElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNSLE9BQU8sRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxrQkFBa0IsUUFBUSxZQUFZLEVBQUUsQ0FBQztJQUN4RSxDQUFDO0lBQ0QsTUFBTSxjQUFjLEdBQUcsRUFBRSxDQUFDLGNBQWMsQ0FBQyxhQUFhLENBQUMsQ0FBQztJQUN4RCxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7UUFDbEIsT0FBTyxFQUFFLEVBQUUsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLGtCQUFrQixhQUFhLFlBQVksRUFBRSxDQUFDO0lBQzdFLENBQUM7SUFDRCxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLGNBQWMsQ0FBQyxDQUFDO0lBQ3BELElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztRQUNiLE9BQU8sRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxhQUFhLGFBQWEsb0JBQW9CLEVBQUUsQ0FBQztJQUNoRixDQUFDO0lBQ0QsT0FBTyxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsQ0FBQztBQUNoRCxDQUFDO0FBRUQsU0FBUyxxQkFBcUIsQ0FBQyxFQUFPOztJQUNsQyxJQUFJLENBQUMsRUFBRTtRQUFFLE9BQU8sSUFBSSxDQUFDO0lBQ3JCLE9BQU87UUFDSCxVQUFVLEVBQUUsTUFBQSxNQUFBLEVBQUUsQ0FBQyxNQUFNLDBDQUFFLElBQUksbUNBQUksSUFBSTtRQUNuQyxVQUFVLEVBQUUsTUFBQSxNQUFBLEVBQUUsQ0FBQyxNQUFNLDBDQUFFLElBQUksbUNBQUksSUFBSTtRQUNuQyxTQUFTLEVBQUUsTUFBQSxNQUFBLEVBQUUsQ0FBQyxTQUFTLG1DQUFJLEVBQUUsQ0FBQyxjQUFjLG1DQUFJLElBQUk7UUFDcEQsT0FBTyxFQUFFLE1BQUEsRUFBRSxDQUFDLE9BQU8sbUNBQUksSUFBSTtRQUMzQixlQUFlLEVBQUUsTUFBQSxFQUFFLENBQUMsZUFBZSxtQ0FBSSxFQUFFO0tBQzVDLENBQUM7QUFDTixDQUFDO0FBRUQsa0VBQWtFO0FBQ2xFLCtCQUErQjtBQUMvQixFQUFFO0FBQ0YsMkRBQTJEO0FBQzNELGtFQUFrRTtBQUNsRSxzRUFBc0U7QUFDdEUsbUVBQW1FO0FBQ25FLGlFQUFpRTtBQUNqRSxzRUFBc0U7QUFDdEUsb0VBQW9FO0FBQ3BFLHNFQUFzRTtBQUN0RSxxRUFBcUU7QUFDckUsc0VBQXNFO0FBQ3RFLEVBQUU7QUFDRixzQ0FBc0M7QUFDdEMsbUVBQW1FO0FBQ25FLHVFQUF1RTtBQUN2RSxtRUFBbUU7QUFDbkUsK0RBQStEO0FBQy9ELDRCQUE0QjtBQUM1QixFQUFFO0FBQ0Ysa0JBQWtCO0FBQ2xCLHVFQUF1RTtBQUN2RSx5RUFBeUU7QUFDekUsbUVBQW1FO0FBQ25FLGlFQUFpRTtBQUNqRSwwQ0FBMEM7QUFDMUMsNkNBQWdEO0FBV2hELE1BQU0sbUJBQW1CLEdBQUcsR0FBRyxDQUFDO0FBQ2hDLE1BQU0saUJBQWlCLEdBQUcsRUFBRSxHQUFHLElBQUksQ0FBQztBQUNwQyxNQUFNLFdBQVcsR0FBRyxJQUFJLCtCQUFpQixFQUFlLENBQUM7QUFDekQsSUFBSSxnQkFBZ0IsR0FBRyxDQUFDLENBQUM7QUFDekIsSUFBSSxZQUFZLEdBQTJCLElBQUksQ0FBQztBQUVoRCxTQUFTLFdBQVcsQ0FBQyxDQUFZO0lBQzdCLE9BQU8sQ0FBQztTQUNILEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRTtRQUNMLElBQUksT0FBTyxDQUFDLEtBQUssUUFBUTtZQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQ3BDLElBQUksQ0FBQztZQUFDLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUFDLENBQUM7UUFBQyxXQUFNLENBQUM7WUFBQyxPQUFPLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUFDLENBQUM7SUFDakUsQ0FBQyxDQUFDO1NBQ0QsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQ25CLENBQUM7QUFFRCxTQUFTLGNBQWMsQ0FBQyxJQUFpQixFQUFFLEtBQW9CO0lBQzNELElBQUksSUFBSSxDQUFDLFNBQVM7UUFBRSxPQUFPO0lBQzNCLE1BQU0sVUFBVSxHQUFHLEtBQUssQ0FBQyxPQUFPLENBQUMsTUFBTSxHQUFHLEVBQUUsQ0FBQyxDQUFDLHVCQUF1QjtJQUNyRSxJQUFJLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxJQUFJLG1CQUFtQixJQUFJLElBQUksQ0FBQyxLQUFLLEdBQUcsVUFBVSxHQUFHLGlCQUFpQixFQUFFLENBQUM7UUFDNUYsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUM7UUFDdEIsTUFBTSxNQUFNLEdBQWtCLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsK0NBQStDLEVBQUUsRUFBRSxFQUFFLElBQUksQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDO1FBQzFILElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQzFCLHFFQUFxRTtRQUNyRSw2REFBNkQ7UUFDN0QsSUFBSSxDQUFDLEtBQUssSUFBSSxNQUFNLENBQUMsT0FBTyxDQUFDLE1BQU0sR0FBRyxFQUFFLENBQUM7UUFDekMsT0FBTztJQUNYLENBQUM7SUFDRCxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUN6QixJQUFJLENBQUMsS0FBSyxJQUFJLFVBQVUsQ0FBQztBQUM3QixDQUFDO0FBRUQsU0FBUyxrQkFBa0I7SUFDdkIsSUFBSSxZQUFZO1FBQUUsT0FBTztJQUN6QixZQUFZLEdBQUcsRUFBRSxHQUFHLEVBQUUsT0FBTyxDQUFDLEdBQUcsRUFBRSxJQUFJLEVBQUUsT0FBTyxDQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsT0FBTyxDQUFDLEtBQUssRUFBRSxDQUFDO0lBQzlFLE1BQU0sSUFBSSxHQUFHLENBQUMsS0FBNkIsRUFBRSxJQUEyQixFQUFFLEVBQUUsQ0FDeEUsQ0FBQyxHQUFHLENBQVEsRUFBUSxFQUFFO1FBQ2xCLE1BQU0sSUFBSSxHQUFHLFdBQVcsQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUNwQyxJQUFJLElBQUksRUFBRSxDQUFDO1lBQ1AsTUFBTSxPQUFPLEdBQUcsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQy9CLGNBQWMsQ0FBQyxJQUFJLEVBQUUsRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLEVBQUUsRUFBRSxJQUFJLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQzdELENBQUM7UUFDRCxJQUFJLENBQUM7WUFBQyxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUFDLENBQUM7UUFBQyxRQUFRLGFBQWEsSUFBZixDQUFDLENBQUMsYUFBYSxDQUFDLENBQUM7SUFDM0QsQ0FBQyxDQUFDO0lBQ04sT0FBTyxDQUFDLEdBQUcsR0FBRyxJQUFJLENBQUMsS0FBSyxFQUFFLFlBQVksQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUM1QyxPQUFPLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxNQUFNLEVBQUUsWUFBWSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQy9DLE9BQU8sQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLE9BQU8sRUFBRSxZQUFZLENBQUMsS0FBSyxDQUFDLENBQUM7QUFDdEQsQ0FBQztBQUVELFNBQVMsbUJBQW1CO0lBQ3hCLElBQUksZ0JBQWdCLEdBQUcsQ0FBQyxJQUFJLENBQUMsWUFBWTtRQUFFLE9BQU87SUFDbEQsT0FBTyxDQUFDLEdBQUcsR0FBRyxZQUFZLENBQUMsR0FBRyxDQUFDO0lBQy9CLE9BQU8sQ0FBQyxJQUFJLEdBQUcsWUFBWSxDQUFDLElBQUksQ0FBQztJQUNqQyxPQUFPLENBQUMsS0FBSyxHQUFHLFlBQVksQ0FBQyxLQUFLLENBQUM7SUFDbkMsWUFBWSxHQUFHLElBQUksQ0FBQztBQUN4QixDQUFDO0FBRVksUUFBQSxPQUFPLEdBQTRDO0lBQzVEOzs7Ozs7Ozs7Ozs7OztPQWNHO0lBQ0gsS0FBSyxDQUFDLGNBQWMsQ0FBQyxVQUFrQixFQUFFLFVBQXNCO1FBQzNELE1BQU0sSUFBSSxHQUFnQjtZQUN0QixPQUFPLEVBQUUsRUFBRTtZQUNYLEtBQUssRUFBRSxDQUFDO1lBQ1IsU0FBUyxFQUFFLEtBQUs7U0FDbkIsQ0FBQztRQUNGLG1FQUFtRTtRQUNuRSxvRUFBb0U7UUFDcEUsOERBQThEO1FBQzlELG1FQUFtRTtRQUNuRSxnRUFBZ0U7UUFDaEUsMEJBQTBCO1FBQzFCLGdCQUFnQixJQUFJLENBQUMsQ0FBQztRQUN0QixJQUFJLENBQUM7WUFDRCxrQkFBa0IsRUFBRSxDQUFDO1lBQ3JCLHNFQUFzRTtZQUN0RSw0REFBNEQ7WUFDNUQsNkRBQTZEO1lBQzdELGdFQUFnRTtZQUNoRSx1REFBdUQ7WUFDdkQsdURBQXVEO1lBQ3ZELGtEQUFrRDtZQUNsRCxPQUFPLE1BQU0sV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsS0FBSyxJQUFJLEVBQUU7O2dCQUMxQyxNQUFNLEVBQUUsR0FBRyxlQUFPLENBQUMsVUFBVSxDQUFDLENBQUM7Z0JBQy9CLElBQUksT0FBTyxFQUFFLEtBQUssVUFBVSxFQUFFLENBQUM7b0JBQzNCLE9BQU87d0JBQ0gsT0FBTyxFQUFFLEtBQUs7d0JBQ2QsS0FBSyxFQUFFLDBCQUEwQixVQUFVLFlBQVk7d0JBQ3ZELFlBQVksRUFBRSxJQUFJLENBQUMsT0FBTztxQkFDN0IsQ0FBQztnQkFDTixDQUFDO2dCQUNELElBQUksQ0FBQztvQkFDRCxNQUFNLE1BQU0sR0FBRyxNQUFNLEVBQUUsQ0FBQyxHQUFHLENBQUMsVUFBVSxhQUFWLFVBQVUsY0FBVixVQUFVLEdBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztvQkFDL0MsSUFBSSxNQUFNLElBQUksT0FBTyxNQUFNLEtBQUssUUFBUSxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO3dCQUNqRSx1Q0FBWSxNQUFNLEtBQUUsWUFBWSxFQUFFLE1BQUMsTUFBYyxDQUFDLFlBQVksbUNBQUksSUFBSSxDQUFDLE9BQU8sSUFBRztvQkFDckYsQ0FBQztvQkFDRCxPQUFPLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLFlBQVksRUFBRSxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7Z0JBQ3ZFLENBQUM7Z0JBQUMsT0FBTyxHQUFRLEVBQUUsQ0FBQztvQkFDaEIsT0FBTzt3QkFDSCxPQUFPLEVBQUUsS0FBSzt3QkFDZCxLQUFLLEVBQUUsTUFBQSxHQUFHLGFBQUgsR0FBRyx1QkFBSCxHQUFHLENBQUUsT0FBTyxtQ0FBSSxNQUFNLENBQUMsR0FBRyxDQUFDO3dCQUNsQyxZQUFZLEVBQUUsSUFBSSxDQUFDLE9BQU87cUJBQzdCLENBQUM7Z0JBQ04sQ0FBQztZQUNMLENBQUMsQ0FBQyxDQUFDO1FBQ1AsQ0FBQztnQkFBUyxDQUFDO1lBQ1AsZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsZ0JBQWdCLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFDckQsbUJBQW1CLEVBQUUsQ0FBQztRQUMxQixDQUFDO0lBQ0wsQ0FBQztJQUVEOztPQUVHO0lBQ0gsa0JBQWtCLENBQUMsUUFBZ0IsRUFBRSxhQUFxQjtRQUN0RCxJQUFJLENBQUM7WUFDRCxNQUFNLEVBQUUsUUFBUSxFQUFFLEVBQUUsRUFBRSxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUN2QyxNQUFNLEtBQUssR0FBRyxRQUFRLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDbEMsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUNULE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxpQkFBaUIsRUFBRSxDQUFDO1lBQ3hELENBQUM7WUFFRCxvQkFBb0I7WUFDcEIsTUFBTSxJQUFJLEdBQUcsS0FBSyxDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUM1QyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQ1IsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLGtCQUFrQixRQUFRLFlBQVksRUFBRSxDQUFDO1lBQzdFLENBQUM7WUFFRCxzQkFBc0I7WUFDdEIsTUFBTSxjQUFjLEdBQUcsRUFBRSxDQUFDLGNBQWMsQ0FBQyxhQUFhLENBQUMsQ0FBQztZQUN4RCxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7Z0JBQ2xCLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxrQkFBa0IsYUFBYSxZQUFZLEVBQUUsQ0FBQztZQUNsRixDQUFDO1lBRUQsZ0JBQWdCO1lBQ2hCLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsY0FBYyxDQUFDLENBQUM7WUFDcEQsT0FBTztnQkFDSCxPQUFPLEVBQUUsSUFBSTtnQkFDYixPQUFPLEVBQUUsYUFBYSxhQUFhLHFCQUFxQjtnQkFDeEQsSUFBSSxFQUFFLEVBQUUsV0FBVyxFQUFFLFNBQVMsQ0FBQyxJQUFJLEVBQUU7YUFDeEMsQ0FBQztRQUNOLENBQUM7UUFBQyxPQUFPLEtBQVUsRUFBRSxDQUFDO1lBQ2xCLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDcEQsQ0FBQztJQUNMLENBQUM7SUFFRDs7T0FFRztJQUNILFVBQVUsQ0FBQyxJQUFZLEVBQUUsVUFBbUI7UUFDeEMsSUFBSSxDQUFDO1lBQ0QsTUFBTSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsR0FBRyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDekMsTUFBTSxLQUFLLEdBQUcsUUFBUSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ2xDLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDVCxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsaUJBQWlCLEVBQUUsQ0FBQztZQUN4RCxDQUFDO1lBRUQsTUFBTSxJQUFJLEdBQUcsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7WUFFNUIsSUFBSSxVQUFVLEVBQUUsQ0FBQztnQkFDYixNQUFNLE1BQU0sR0FBRyxLQUFLLENBQUMsY0FBYyxDQUFDLFVBQVUsQ0FBQyxDQUFDO2dCQUNoRCxJQUFJLE1BQU0sRUFBRSxDQUFDO29CQUNULE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQzFCLENBQUM7cUJBQU0sQ0FBQztvQkFDSixLQUFLLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUN6QixDQUFDO1lBQ0wsQ0FBQztpQkFBTSxDQUFDO2dCQUNKLEtBQUssQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDekIsQ0FBQztZQUVELE9BQU87Z0JBQ0gsT0FBTyxFQUFFLElBQUk7Z0JBQ2IsT0FBTyxFQUFFLFFBQVEsSUFBSSx1QkFBdUI7Z0JBQzVDLElBQUksRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSSxFQUFFO2FBQzdDLENBQUM7UUFDTixDQUFDO1FBQUMsT0FBTyxLQUFVLEVBQUUsQ0FBQztZQUNsQixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ3BELENBQUM7SUFDTCxDQUFDO0lBRUQ7O09BRUc7SUFDSCxXQUFXLENBQUMsUUFBZ0I7O1FBQ3hCLElBQUksQ0FBQztZQUNELE1BQU0sRUFBRSxRQUFRLEVBQUUsR0FBRyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDbkMsTUFBTSxLQUFLLEdBQUcsUUFBUSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ2xDLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDVCxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsaUJBQWlCLEVBQUUsQ0FBQztZQUN4RCxDQUFDO1lBRUQsTUFBTSxJQUFJLEdBQUcsS0FBSyxDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUM1QyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQ1IsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLGtCQUFrQixRQUFRLFlBQVksRUFBRSxDQUFDO1lBQzdFLENBQUM7WUFFRCxPQUFPO2dCQUNILE9BQU8sRUFBRSxJQUFJO2dCQUNiLElBQUksRUFBRTtvQkFDRixJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUk7b0JBQ2YsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJO29CQUNmLE1BQU0sRUFBRSxJQUFJLENBQUMsTUFBTTtvQkFDbkIsUUFBUSxFQUFFLElBQUksQ0FBQyxRQUFRO29CQUN2QixRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVE7b0JBQ3ZCLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSztvQkFDakIsTUFBTSxFQUFFLE1BQUEsSUFBSSxDQUFDLE1BQU0sMENBQUUsSUFBSTtvQkFDekIsUUFBUSxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBVSxFQUFFLEVBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDO29CQUN2RCxVQUFVLEVBQUUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFTLEVBQUUsRUFBRSxDQUFDLENBQUM7d0JBQzVDLElBQUksRUFBRSxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUk7d0JBQzNCLE9BQU8sRUFBRSxJQUFJLENBQUMsT0FBTztxQkFDeEIsQ0FBQyxDQUFDO2lCQUNOO2FBQ0osQ0FBQztRQUNOLENBQUM7UUFBQyxPQUFPLEtBQVUsRUFBRSxDQUFDO1lBQ2xCLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDcEQsQ0FBQztJQUNMLENBQUM7SUFFRDs7T0FFRztJQUNILFdBQVc7UUFDUCxJQUFJLENBQUM7WUFDRCxNQUFNLEVBQUUsUUFBUSxFQUFFLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ25DLE1BQU0sS0FBSyxHQUFHLFFBQVEsQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNsQyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7Z0JBQ1QsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLGlCQUFpQixFQUFFLENBQUM7WUFDeEQsQ0FBQztZQUVELE1BQU0sS0FBSyxHQUFVLEVBQUUsQ0FBQztZQUN4QixNQUFNLFlBQVksR0FBRyxDQUFDLElBQVMsRUFBRSxFQUFFOztnQkFDL0IsS0FBSyxDQUFDLElBQUksQ0FBQztvQkFDUCxJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUk7b0JBQ2YsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJO29CQUNmLE1BQU0sRUFBRSxJQUFJLENBQUMsTUFBTTtvQkFDbkIsTUFBTSxFQUFFLE1BQUEsSUFBSSxDQUFDLE1BQU0sMENBQUUsSUFBSTtpQkFDNUIsQ0FBQyxDQUFDO2dCQUVILElBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsS0FBVSxFQUFFLEVBQUUsQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztZQUMvRCxDQUFDLENBQUM7WUFFRixLQUFLLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLEtBQVUsRUFBRSxFQUFFLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7WUFFNUQsT0FBTyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxDQUFDO1FBQzFDLENBQUM7UUFBQyxPQUFPLEtBQVUsRUFBRSxDQUFDO1lBQ2xCLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDcEQsQ0FBQztJQUNMLENBQUM7SUFFRDs7T0FFRztJQUNILGNBQWMsQ0FBQyxJQUFZO1FBQ3ZCLElBQUksQ0FBQztZQUNELE1BQU0sRUFBRSxRQUFRLEVBQUUsR0FBRyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDbkMsTUFBTSxLQUFLLEdBQUcsUUFBUSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ2xDLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDVCxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsaUJBQWlCLEVBQUUsQ0FBQztZQUN4RCxDQUFDO1lBRUQsTUFBTSxJQUFJLEdBQUcsS0FBSyxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUN4QyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQ1IsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLGtCQUFrQixJQUFJLFlBQVksRUFBRSxDQUFDO1lBQ3pFLENBQUM7WUFFRCxPQUFPO2dCQUNILE9BQU8sRUFBRSxJQUFJO2dCQUNiLElBQUksRUFBRTtvQkFDRixJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUk7b0JBQ2YsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJO29CQUNmLE1BQU0sRUFBRSxJQUFJLENBQUMsTUFBTTtvQkFDbkIsUUFBUSxFQUFFLElBQUksQ0FBQyxRQUFRO2lCQUMxQjthQUNKLENBQUM7UUFDTixDQUFDO1FBQUMsT0FBTyxLQUFVLEVBQUUsQ0FBQztZQUNsQixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ3BELENBQUM7SUFDTCxDQUFDO0lBRUQ7O09BRUc7SUFDSCxtQkFBbUI7UUFDZixJQUFJLENBQUM7WUFDRCxNQUFNLEVBQUUsUUFBUSxFQUFFLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ25DLE1BQU0sS0FBSyxHQUFHLFFBQVEsQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNsQyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7Z0JBQ1QsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLGlCQUFpQixFQUFFLENBQUM7WUFDeEQsQ0FBQztZQUVELE9BQU87Z0JBQ0gsT0FBTyxFQUFFLElBQUk7Z0JBQ2IsSUFBSSxFQUFFO29CQUNGLElBQUksRUFBRSxLQUFLLENBQUMsSUFBSTtvQkFDaEIsSUFBSSxFQUFFLEtBQUssQ0FBQyxJQUFJO29CQUNoQixTQUFTLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxNQUFNO2lCQUNuQzthQUNKLENBQUM7UUFDTixDQUFDO1FBQUMsT0FBTyxLQUFVLEVBQUUsQ0FBQztZQUNsQixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ3BELENBQUM7SUFDTCxDQUFDO0lBRUQ7O09BRUc7SUFDSCxlQUFlLENBQUMsUUFBZ0IsRUFBRSxRQUFnQixFQUFFLEtBQVU7UUFDMUQsSUFBSSxDQUFDO1lBQ0QsTUFBTSxFQUFFLFFBQVEsRUFBRSxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNuQyxNQUFNLEtBQUssR0FBRyxRQUFRLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDbEMsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUNULE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxpQkFBaUIsRUFBRSxDQUFDO1lBQ3hELENBQUM7WUFFRCxNQUFNLElBQUksR0FBRyxLQUFLLENBQUMsY0FBYyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQzVDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDUixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsa0JBQWtCLFFBQVEsWUFBWSxFQUFFLENBQUM7WUFDN0UsQ0FBQztZQUVELE9BQU87WUFDUCxJQUFJLFFBQVEsS0FBSyxVQUFVLEVBQUUsQ0FBQztnQkFDMUIsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1lBQy9ELENBQUM7aUJBQU0sSUFBSSxRQUFRLEtBQUssVUFBVSxFQUFFLENBQUM7Z0JBQ2pDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxLQUFLLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1lBQ3hFLENBQUM7aUJBQU0sSUFBSSxRQUFRLEtBQUssT0FBTyxFQUFFLENBQUM7Z0JBQzlCLElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUM1RCxDQUFDO2lCQUFNLElBQUksUUFBUSxLQUFLLFFBQVEsRUFBRSxDQUFDO2dCQUMvQixJQUFJLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQztZQUN4QixDQUFDO2lCQUFNLElBQUksUUFBUSxLQUFLLE1BQU0sRUFBRSxDQUFDO2dCQUM3QixJQUFJLENBQUMsSUFBSSxHQUFHLEtBQUssQ0FBQztZQUN0QixDQUFDO2lCQUFNLENBQUM7Z0JBQ0osV0FBVztnQkFDVixJQUFZLENBQUMsUUFBUSxDQUFDLEdBQUcsS0FBSyxDQUFDO1lBQ3BDLENBQUM7WUFFRCxPQUFPO2dCQUNILE9BQU8sRUFBRSxJQUFJO2dCQUNiLE9BQU8sRUFBRSxhQUFhLFFBQVEsd0JBQXdCO2FBQ3pELENBQUM7UUFDTixDQUFDO1FBQUMsT0FBTyxLQUFVLEVBQUUsQ0FBQztZQUNsQixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ3BELENBQUM7SUFDTCxDQUFDO0lBRUQ7O09BRUc7SUFDSCxpQkFBaUIsQ0FBQyxvQkFBNkIsS0FBSztRQUNoRCxJQUFJLENBQUM7WUFDRCxNQUFNLEVBQUUsUUFBUSxFQUFFLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ25DLE1BQU0sS0FBSyxHQUFHLFFBQVEsQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNsQyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7Z0JBQ1QsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLGlCQUFpQixFQUFFLENBQUM7WUFDeEQsQ0FBQztZQUVELE1BQU0sV0FBVyxHQUFHLENBQUMsSUFBUyxFQUFPLEVBQUU7Z0JBQ25DLE1BQU0sTUFBTSxHQUFRO29CQUNoQixJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUk7b0JBQ2YsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJO29CQUNmLE1BQU0sRUFBRSxJQUFJLENBQUMsTUFBTTtvQkFDbkIsUUFBUSxFQUFFLEVBQUU7aUJBQ2YsQ0FBQztnQkFFRixJQUFJLGlCQUFpQixFQUFFLENBQUM7b0JBQ3BCLE1BQU0sQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFTLEVBQUUsRUFBRSxDQUFDLENBQUM7d0JBQ3BELElBQUksRUFBRSxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUk7d0JBQzNCLE9BQU8sRUFBRSxJQUFJLENBQUMsT0FBTztxQkFDeEIsQ0FBQyxDQUFDLENBQUM7Z0JBQ1IsQ0FBQztnQkFFRCxJQUFJLElBQUksQ0FBQyxRQUFRLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7b0JBQzVDLE1BQU0sQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxLQUFVLEVBQUUsRUFBRSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO2dCQUM1RSxDQUFDO2dCQUVELE9BQU8sTUFBTSxDQUFDO1lBQ2xCLENBQUMsQ0FBQztZQUVGLE1BQU0sU0FBUyxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBVSxFQUFFLEVBQUUsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztZQUN6RSxPQUFPLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLENBQUM7UUFDOUMsQ0FBQztRQUFDLE9BQU8sS0FBVSxFQUFFLENBQUM7WUFDbEIsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNwRCxDQUFDO0lBQ0wsQ0FBQztJQUVEOzs7Ozs7O09BT0c7SUFDSCxLQUFLLENBQUMsb0JBQW9CLENBQUMsUUFBZ0IsRUFBRSxHQUFXOztRQUNwRCxNQUFNLFNBQVMsR0FBRyxlQUFlLEVBQUUsQ0FBQztRQUNwQyxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2hCLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxTQUFTLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDdEQsQ0FBQztRQUNELElBQUksQ0FBQztZQUNELE1BQU0sS0FBSyxHQUFhLEVBQUUsQ0FBQztZQUMzQiw4REFBOEQ7WUFDOUQsK0NBQStDO1lBQy9DLE1BQU0sS0FBSyxHQUFHLEdBQUcsQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsZUFBZSxHQUFHLENBQUMsT0FBTyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDO1lBQ3ZGLEtBQUssQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDbEIsSUFBSSxLQUFLLEtBQUssR0FBRyxFQUFFLENBQUM7Z0JBQ2hCLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDcEIsQ0FBQztZQUVELE1BQU0sTUFBTSxHQUFhLEVBQUUsQ0FBQztZQUM1QixLQUFLLE1BQU0sU0FBUyxJQUFJLEtBQUssRUFBRSxDQUFDO2dCQUM1QixJQUFJLENBQUM7b0JBQ0QsTUFBTSxNQUFNLEdBQUcsTUFBTSxTQUFTLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQyxRQUFRLEVBQUUsU0FBUyxDQUFDLENBQUM7b0JBQ3ZFLDREQUE0RDtvQkFDNUQsNERBQTREO29CQUM1RCx1REFBdUQ7b0JBQ3ZELDBEQUEwRDtvQkFDMUQsSUFBSSxTQUFTLEdBQWtCLElBQUksQ0FBQztvQkFDcEMsSUFBSSxPQUFPLE1BQU0sS0FBSyxRQUFRLEVBQUUsQ0FBQzt3QkFDN0IsU0FBUyxHQUFHLE1BQU0sQ0FBQztvQkFDdkIsQ0FBQzt5QkFBTSxJQUFJLE1BQU0sSUFBSSxPQUFPLE1BQU0sS0FBSyxRQUFRLElBQUksT0FBUSxNQUFjLENBQUMsSUFBSSxLQUFLLFFBQVEsRUFBRSxDQUFDO3dCQUMxRixTQUFTLEdBQUksTUFBYyxDQUFDLElBQUksQ0FBQztvQkFDckMsQ0FBQztvQkFDRCxJQUFJLGdCQUFnQixHQUFrQixJQUFJLENBQUM7b0JBQzNDLElBQUksU0FBUyxFQUFFLENBQUM7d0JBQ1osSUFBSSxDQUFDOzRCQUNELE1BQU0sU0FBUyxHQUFRLE1BQU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLDJCQUEyQixFQUFFLFNBQVMsQ0FBQyxDQUFDOzRCQUNyRyxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLElBQUksU0FBUyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztnQ0FDbkQsaURBQWlEO2dDQUNqRCxnREFBZ0Q7Z0NBQ2hELCtDQUErQztnQ0FDL0MsOENBQThDO2dDQUM5QyxnREFBZ0Q7Z0NBQ2hELDRDQUE0QztnQ0FDNUMsaURBQWlEO2dDQUNqRCxnQkFBZ0IsR0FBRyxTQUFTLENBQUMsU0FBUyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQzs0QkFDdkQsQ0FBQzt3QkFDTCxDQUFDO3dCQUFDLFdBQU0sQ0FBQzs0QkFDTCwrQ0FBK0M7d0JBQ25ELENBQUM7b0JBQ0wsQ0FBQztvQkFDRCxPQUFPO3dCQUNILE9BQU8sRUFBRSxJQUFJO3dCQUNiLElBQUksRUFBRTs0QkFDRixHQUFHLEVBQUUsU0FBUzs0QkFDZCxjQUFjLEVBQUUsUUFBUTs0QkFDeEIsZUFBZSxFQUFFLFNBQVM7NEJBQzFCLGdCQUFnQjs0QkFDaEIsR0FBRyxFQUFFLE1BQU07eUJBQ2Q7cUJBQ0osQ0FBQztnQkFDTixDQUFDO2dCQUFDLE9BQU8sR0FBUSxFQUFFLENBQUM7b0JBQ2hCLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxTQUFTLEtBQUssTUFBQSxHQUFHLGFBQUgsR0FBRyx1QkFBSCxHQUFHLENBQUUsT0FBTyxtQ0FBSSxHQUFHLEVBQUUsQ0FBQyxDQUFDO2dCQUN4RCxDQUFDO1lBQ0wsQ0FBQztZQUNELE9BQU87Z0JBQ0gsT0FBTyxFQUFFLEtBQUs7Z0JBQ2QsS0FBSyxFQUFFLG1DQUFtQyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFO2FBQ2hFLENBQUM7UUFDTixDQUFDO1FBQUMsT0FBTyxLQUFVLEVBQUUsQ0FBQztZQUNsQixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsTUFBQSxLQUFLLGFBQUwsS0FBSyx1QkFBTCxLQUFLLENBQUUsT0FBTyxtQ0FBSSxNQUFNLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztRQUN0RSxDQUFDO0lBQ0wsQ0FBQztJQUVEOzs7T0FHRztJQUNILEtBQUssQ0FBQyxXQUFXLENBQUMsUUFBZ0I7O1FBQzlCLE1BQU0sU0FBUyxHQUFHLGVBQWUsRUFBRSxDQUFDO1FBQ3BDLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDaEIsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLFNBQVMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUN0RCxDQUFDO1FBQ0QsSUFBSSxDQUFDO1lBQ0QsZ0VBQWdFO1lBQ2hFLDhEQUE4RDtZQUM5RCwyREFBMkQ7WUFDM0QsNkRBQTZEO1lBQzdELGlDQUFpQztZQUNqQywyREFBMkQ7WUFDM0QsMkRBQTJEO1lBQzNELHdEQUF3RDtZQUN4RCxvREFBb0Q7WUFDcEQsTUFBTSxZQUFZLEdBQUcsTUFBTSxTQUFTLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUNqRSxPQUFPLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsRUFBRSxZQUFZLEVBQUUsUUFBUSxFQUFFLEVBQUUsQ0FBQztRQUMvRCxDQUFDO1FBQUMsT0FBTyxLQUFVLEVBQUUsQ0FBQztZQUNsQixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsTUFBQSxLQUFLLGFBQUwsS0FBSyx1QkFBTCxLQUFLLENBQUUsT0FBTyxtQ0FBSSxNQUFNLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztRQUN0RSxDQUFDO0lBQ0wsQ0FBQztJQUVEOzs7T0FHRztJQUNILEtBQUssQ0FBQyxVQUFVLENBQUMsUUFBZ0IsRUFBRSxTQUFpQjs7UUFDaEQsTUFBTSxTQUFTLEdBQUcsZUFBZSxFQUFFLENBQUM7UUFDcEMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNoQixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsU0FBUyxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ3RELENBQUM7UUFDRCxJQUFJLENBQUM7WUFDRCxNQUFNLE1BQU0sR0FBRyxNQUFNLFNBQVMsQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLFFBQVEsRUFBRSxTQUFTLENBQUMsQ0FBQztZQUNyRSxPQUFPLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsRUFBRSxDQUFDO1FBQzVFLENBQUM7UUFBQyxPQUFPLEtBQVUsRUFBRSxDQUFDO1lBQ2xCLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxNQUFBLEtBQUssYUFBTCxLQUFLLHVCQUFMLEtBQUssQ0FBRSxPQUFPLG1DQUFJLE1BQU0sQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1FBQ3RFLENBQUM7SUFDTCxDQUFDO0lBRUQ7OztPQUdHO0lBQ0gsS0FBSyxDQUFDLFlBQVksQ0FBQyxRQUFnQixFQUFFLFlBQXFCOztRQUN0RCxNQUFNLFNBQVMsR0FBRyxlQUFlLEVBQUUsQ0FBQztRQUNwQyxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2hCLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxTQUFTLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDdEQsQ0FBQztRQUNELElBQUksQ0FBQztZQUNELE1BQU0sTUFBTSxHQUFHLE1BQU0sU0FBUyxDQUFDLEtBQUssQ0FBQyxZQUFZLENBQUMsUUFBUSxFQUFFLFlBQVksQ0FBQyxDQUFDO1lBQzFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFLFlBQVksRUFBRSxFQUFFLENBQUM7UUFDakYsQ0FBQztRQUFDLE9BQU8sS0FBVSxFQUFFLENBQUM7WUFDbEIsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLE1BQUEsS0FBSyxhQUFMLEtBQUssdUJBQUwsS0FBSyxDQUFFLE9BQU8sbUNBQUksTUFBTSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7UUFDdEUsQ0FBQztJQUNMLENBQUM7SUFFRDs7O09BR0c7SUFDSCxhQUFhLENBQUMsUUFBZ0I7O1FBQzFCLE1BQU0sU0FBUyxHQUFHLGVBQWUsRUFBRSxDQUFDO1FBQ3BDLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDaEIsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLFNBQVMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUN0RCxDQUFDO1FBQ0QsSUFBSSxDQUFDO1lBQ0QsTUFBTSxJQUFJLEdBQUcsU0FBUyxDQUFDLEtBQUssQ0FBQyxhQUFhLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDckQsT0FBTyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLENBQUM7UUFDbkMsQ0FBQztRQUFDLE9BQU8sS0FBVSxFQUFFLENBQUM7WUFDbEIsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLE1BQUEsS0FBSyxhQUFMLEtBQUssdUJBQUwsS0FBSyxDQUFFLE9BQU8sbUNBQUksTUFBTSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7UUFDdEUsQ0FBQztJQUNMLENBQUM7SUFFRDs7Ozs7Ozs7Ozs7OztPQWFHO0lBQ0gsZUFBZSxDQUNYLFFBQWdCLEVBQ2hCLGFBQXFCLEVBQ3JCLGtCQUEwQixFQUMxQixVQUFrQixFQUNsQixhQUFxQixFQUNyQixPQUFlLEVBQ2YsZUFBd0I7O1FBRXhCLElBQUksQ0FBQztZQUNELE1BQU0sRUFBRSxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUN6QixNQUFNLEdBQUcsR0FBRyx1QkFBdUIsQ0FBQyxRQUFRLEVBQUUsYUFBYSxDQUFDLENBQUM7WUFDN0QsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEVBQUUsQ0FBQztnQkFDVixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsR0FBRyxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ2hELENBQUM7WUFDRCxNQUFNLFVBQVUsR0FBRyxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLFVBQVUsQ0FBQyxDQUFDO1lBQzdELElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztnQkFDZCxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUseUJBQXlCLFVBQVUsWUFBWSxFQUFFLENBQUM7WUFDdEYsQ0FBQztZQUNELE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxTQUFTLENBQUMsa0JBQWtCLENBQUMsQ0FBQztZQUM5QyxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUN0QixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsYUFBYSxrQkFBa0IsUUFBUSxhQUFhLHlCQUF5QixPQUFPLEdBQUcsR0FBRyxFQUFFLENBQUM7WUFDakksQ0FBQztZQUVELE1BQU0sRUFBRSxHQUFHLElBQUksRUFBRSxDQUFDLFlBQVksRUFBRSxDQUFDO1lBQ2pDLEVBQUUsQ0FBQyxNQUFNLEdBQUcsVUFBVSxDQUFDO1lBQ3ZCLEVBQUUsQ0FBQyxTQUFTLEdBQUcsYUFBYSxDQUFDO1lBQzdCLEVBQUUsQ0FBQyxPQUFPLEdBQUcsT0FBTyxDQUFDO1lBQ3JCLEVBQUUsQ0FBQyxlQUFlLEdBQUcsZUFBZSxhQUFmLGVBQWUsY0FBZixlQUFlLEdBQUksRUFBRSxDQUFDO1lBQzNDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7WUFFYixNQUFNLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsVUFBVSxDQUFDLENBQUM7WUFDekMsT0FBTztnQkFDSCxPQUFPLEVBQUUsSUFBSTtnQkFDYixJQUFJLEVBQUU7b0JBQ0YsS0FBSyxFQUFFLEdBQUcsQ0FBQyxNQUFNLEdBQUcsQ0FBQztvQkFDckIsS0FBSyxFQUFFLEdBQUcsQ0FBQyxNQUFNO29CQUNqQixhQUFhLEVBQUUsR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJO29CQUNqQyxnQkFBZ0IsRUFBRSxHQUFHLENBQUMsU0FBUyxDQUFDLE9BQU8sS0FBSyxLQUFLO2lCQUNwRDthQUNKLENBQUM7UUFDTixDQUFDO1FBQUMsT0FBTyxLQUFVLEVBQUUsQ0FBQztZQUNsQixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsTUFBQSxLQUFLLGFBQUwsS0FBSyx1QkFBTCxLQUFLLENBQUUsT0FBTyxtQ0FBSSxNQUFNLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztRQUN0RSxDQUFDO0lBQ0wsQ0FBQztJQUVEOzs7Ozs7OztPQVFHO0lBQ0gsa0JBQWtCLENBQ2QsUUFBZ0IsRUFDaEIsYUFBcUIsRUFDckIsa0JBQTBCLEVBQzFCLEtBQW9CLEVBQ3BCLFVBQXlCLEVBQ3pCLE9BQXNCOztRQUV0QixJQUFJLENBQUM7WUFDRCxNQUFNLEdBQUcsR0FBRyx1QkFBdUIsQ0FBQyxRQUFRLEVBQUUsYUFBYSxDQUFDLENBQUM7WUFDN0QsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEVBQUUsQ0FBQztnQkFDVixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsR0FBRyxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ2hELENBQUM7WUFDRCxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsU0FBUyxDQUFDLGtCQUFrQixDQUFDLENBQUM7WUFDOUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDdEIsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLGFBQWEsa0JBQWtCLFFBQVEsYUFBYSxrQkFBa0IsRUFBRSxDQUFDO1lBQzdHLENBQUM7WUFFRCw2REFBNkQ7WUFDN0QsOERBQThEO1lBQzlELDJEQUEyRDtZQUMzRCwyREFBMkQ7WUFDM0QsMkRBQTJEO1lBQzNELDZEQUE2RDtZQUM3RCxtREFBbUQ7WUFDbkQsTUFBTSxjQUFjLEdBQUcsQ0FBQSxVQUFVLGFBQVYsVUFBVSx1QkFBVixVQUFVLENBQUUsSUFBSSxFQUFFLEtBQUksSUFBSSxDQUFDO1lBQ2xELE1BQU0sV0FBVyxHQUFHLENBQUEsT0FBTyxhQUFQLE9BQU8sdUJBQVAsT0FBTyxDQUFFLElBQUksRUFBRSxLQUFJLElBQUksQ0FBQztZQUM1QyxJQUFJLFFBQVEsR0FBRyxDQUFDLENBQUMsQ0FBQztZQUNsQixJQUFJLE9BQU8sS0FBSyxLQUFLLFFBQVEsSUFBSSxLQUFLLElBQUksQ0FBQyxFQUFFLENBQUM7Z0JBQzFDLFFBQVEsR0FBRyxLQUFLLENBQUM7WUFDckIsQ0FBQztpQkFBTSxJQUFJLGNBQWMsSUFBSSxXQUFXLEVBQUUsQ0FBQztnQkFDdkMsUUFBUSxHQUFHLEdBQUcsQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFPLEVBQUUsRUFBRTs7b0JBQ2pDLE1BQU0sWUFBWSxHQUFHLE9BQU8sQ0FBQSxNQUFBLEVBQUUsYUFBRixFQUFFLHVCQUFGLEVBQUUsQ0FBRSxNQUFNLDBDQUFFLElBQUksQ0FBQSxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQUEsRUFBRSxhQUFGLEVBQUUsdUJBQUYsRUFBRSxDQUFFLE1BQU0sMENBQUUsSUFBSSxDQUFDO29CQUNyRyxNQUFNLFNBQVMsR0FBRyxPQUFPLENBQUEsRUFBRSxhQUFGLEVBQUUsdUJBQUYsRUFBRSxDQUFFLE9BQU8sQ0FBQSxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxhQUFGLEVBQUUsdUJBQUYsRUFBRSxDQUFFLE9BQU8sQ0FBQztvQkFDcEYsTUFBTSxhQUFhLEdBQUcsQ0FBQyxjQUFjLElBQUksWUFBWSxLQUFLLGNBQWMsQ0FBQztvQkFDekUsTUFBTSxjQUFjLEdBQUcsQ0FBQyxXQUFXLElBQUksU0FBUyxLQUFLLFdBQVcsQ0FBQztvQkFDakUsT0FBTyxhQUFhLElBQUksY0FBYyxDQUFDO2dCQUMzQyxDQUFDLENBQUMsQ0FBQztZQUNQLENBQUM7WUFDRCxJQUFJLFFBQVEsR0FBRyxDQUFDLElBQUksUUFBUSxJQUFJLEdBQUcsQ0FBQyxNQUFNLEVBQUUsQ0FBQztnQkFDekMsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLHFDQUFxQyxFQUFFLENBQUM7WUFDNUUsQ0FBQztZQUNELE1BQU0sT0FBTyxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzNDLE1BQU0sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxVQUFVLENBQUMsQ0FBQztZQUN6QyxPQUFPO2dCQUNILE9BQU8sRUFBRSxJQUFJO2dCQUNiLElBQUksRUFBRTtvQkFDRixLQUFLLEVBQUUsUUFBUTtvQkFDZixTQUFTLEVBQUUsR0FBRyxDQUFDLE1BQU07b0JBQ3JCLE9BQU8sRUFBRSxxQkFBcUIsQ0FBQyxPQUFPLENBQUM7b0JBQ3ZDLGFBQWEsRUFBRSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUk7b0JBQ2pDLGdCQUFnQixFQUFFLEdBQUcsQ0FBQyxTQUFTLENBQUMsT0FBTyxLQUFLLEtBQUs7aUJBQ3BEO2FBQ0osQ0FBQztRQUNOLENBQUM7UUFBQyxPQUFPLEtBQVUsRUFBRSxDQUFDO1lBQ2xCLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxNQUFBLEtBQUssYUFBTCxLQUFLLHVCQUFMLEtBQUssQ0FBRSxPQUFPLG1DQUFJLE1BQU0sQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1FBQ3RFLENBQUM7SUFDTCxDQUFDO0lBRUQ7O09BRUc7SUFDSCxpQkFBaUIsQ0FBQyxRQUFnQixFQUFFLGFBQXFCLEVBQUUsa0JBQTBCOztRQUNqRixJQUFJLENBQUM7WUFDRCxNQUFNLEdBQUcsR0FBRyx1QkFBdUIsQ0FBQyxRQUFRLEVBQUUsYUFBYSxDQUFDLENBQUM7WUFDN0QsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEVBQUUsQ0FBQztnQkFDVixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsR0FBRyxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ2hELENBQUM7WUFDRCxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsU0FBUyxDQUFDLGtCQUFrQixDQUFDLENBQUM7WUFDOUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDdEIsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLGFBQWEsa0JBQWtCLFFBQVEsYUFBYSxrQkFBa0IsRUFBRSxDQUFDO1lBQzdHLENBQUM7WUFDRCxPQUFPO2dCQUNILE9BQU8sRUFBRSxJQUFJO2dCQUNiLElBQUksRUFBRTtvQkFDRixLQUFLLEVBQUUsR0FBRyxDQUFDLE1BQU07b0JBQ2pCLFFBQVEsRUFBRSxHQUFHLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDO2lCQUMzQzthQUNKLENBQUM7UUFDTixDQUFDO1FBQUMsT0FBTyxLQUFVLEVBQUUsQ0FBQztZQUNsQixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsTUFBQSxLQUFLLGFBQUwsS0FBSyx1QkFBTCxLQUFLLENBQUUsT0FBTyxtQ0FBSSxNQUFNLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztRQUN0RSxDQUFDO0lBQ0wsQ0FBQztJQUVEOzs7Ozs7O09BT0c7SUFDSCxpQkFBaUIsQ0FBQyxRQUFnQjs7UUFDOUIsSUFBSSxDQUFDO1lBQ0QsTUFBTSxFQUFFLFFBQVEsRUFBRSxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNuQyxNQUFNLEtBQUssR0FBRyxRQUFRLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDbEMsSUFBSSxDQUFDLEtBQUs7Z0JBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLGlCQUFpQixFQUFFLENBQUM7WUFDaEUsTUFBTSxJQUFJLEdBQUcsa0JBQWtCLENBQUMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxDQUFDO1lBQ2pELElBQUksQ0FBQyxJQUFJO2dCQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxRQUFRLFFBQVEsWUFBWSxFQUFFLENBQUM7WUFDMUUsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxjQUFjLENBQUMsQ0FBQztZQUMvQyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQ1IsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLFFBQVEsUUFBUSxnQ0FBZ0MsRUFBRSxDQUFDO1lBQ3ZGLENBQUM7WUFDRCxNQUFNLEtBQUssR0FBVSxNQUFBLElBQUksQ0FBQyxLQUFLLG1DQUFJLEVBQUUsQ0FBQztZQUN0QyxNQUFNLGVBQWUsR0FBRyxNQUFBLE1BQUEsSUFBSSxDQUFDLFdBQVcsMENBQUUsSUFBSSxtQ0FBSSxJQUFJLENBQUM7WUFDdkQsT0FBTztnQkFDSCxPQUFPLEVBQUUsSUFBSTtnQkFDYixJQUFJLEVBQUU7b0JBQ0YsUUFBUTtvQkFDUixRQUFRLEVBQUUsSUFBSSxDQUFDLElBQUk7b0JBQ25CLFdBQVcsRUFBRSxlQUFlO29CQUM1QixVQUFVLEVBQUUsSUFBSSxDQUFDLFVBQVUsS0FBSyxJQUFJO29CQUNwQyxLQUFLLEVBQUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRTs7d0JBQUMsT0FBQSxDQUFDOzRCQUNsQyxJQUFJLEVBQUUsTUFBQSxDQUFDLENBQUMsSUFBSSxtQ0FBSSxJQUFJOzRCQUNwQixJQUFJLEVBQUUsTUFBQSxNQUFBLENBQUMsQ0FBQyxLQUFLLG1DQUFJLENBQUMsQ0FBQyxJQUFJLG1DQUFJLElBQUk7NEJBQy9CLFFBQVEsRUFBRSxPQUFPLENBQUMsQ0FBQyxRQUFRLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxJQUFJOzRCQUM1RCxRQUFRLEVBQUUsTUFBQSxDQUFDLENBQUMsUUFBUSxtQ0FBSSxJQUFJO3lCQUMvQixDQUFDLENBQUE7cUJBQUEsQ0FBQztpQkFDTjthQUNKLENBQUM7UUFDTixDQUFDO1FBQUMsT0FBTyxLQUFVLEVBQUUsQ0FBQztZQUNsQixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsTUFBQSxLQUFLLGFBQUwsS0FBSyx1QkFBTCxLQUFLLENBQUUsT0FBTyxtQ0FBSSxNQUFNLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztRQUN0RSxDQUFDO0lBQ0wsQ0FBQztJQUVELG1CQUFtQixDQUFDLFFBQWdCOztRQUNoQyxJQUFJLENBQUM7WUFDRCxNQUFNLEVBQUUsUUFBUSxFQUFFLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ25DLE1BQU0sS0FBSyxHQUFHLFFBQVEsQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNsQyxJQUFJLENBQUMsS0FBSztnQkFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsaUJBQWlCLEVBQUUsQ0FBQztZQUNoRSxNQUFNLElBQUksR0FBRyxrQkFBa0IsQ0FBQyxLQUFLLEVBQUUsUUFBUSxDQUFDLENBQUM7WUFDakQsSUFBSSxDQUFDLElBQUk7Z0JBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLFFBQVEsUUFBUSxZQUFZLEVBQUUsQ0FBQztZQUMxRSxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLGNBQWMsQ0FBQyxDQUFDO1lBQy9DLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDUixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsUUFBUSxRQUFRLGdDQUFnQyxFQUFFLENBQUM7WUFDdkYsQ0FBQztZQUNELE1BQU0sS0FBSyxHQUFVLE9BQU8sSUFBSSxDQUFDLGlCQUFpQixLQUFLLFVBQVU7Z0JBQzdELENBQUMsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLEVBQUU7Z0JBQzFCLENBQUMsQ0FBQyxDQUFDLE1BQUEsSUFBSSxDQUFDLEtBQUssbUNBQUksRUFBRSxDQUFDLENBQUM7WUFDekIsTUFBTSxNQUFNLEdBQUcsS0FBSztpQkFDZixNQUFNLENBQUMsQ0FBQyxJQUFTLEVBQUUsRUFBRSxDQUFDLElBQUksYUFBSixJQUFJLHVCQUFKLElBQUksQ0FBRSxJQUFJLENBQUM7aUJBQ2pDLEdBQUcsQ0FBQyxDQUFDLElBQVMsRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7aUJBQzVDLE1BQU0sQ0FBQyxDQUFDLEtBQVUsRUFBRSxFQUFFLENBQUMsS0FBSyxDQUFDO2lCQUM3QixHQUFHLENBQUMsQ0FBQyxLQUFVLEVBQUUsRUFBRTs7Z0JBQUMsT0FBQSxDQUFDO29CQUNsQixJQUFJLEVBQUUsTUFBQSxLQUFLLENBQUMsSUFBSSxtQ0FBSSxJQUFJO29CQUN4QixLQUFLLEVBQUUsT0FBTyxLQUFLLENBQUMsS0FBSyxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsSUFBSTtvQkFDM0QsU0FBUyxFQUFFLE9BQU8sS0FBSyxDQUFDLFNBQVMsS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLElBQUk7b0JBQ3ZFLFdBQVcsRUFBRSxPQUFPLEtBQUssQ0FBQyxXQUFXLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxJQUFJO29CQUM3RSxTQUFTLEVBQUUsS0FBSyxDQUFDLFNBQVMsS0FBSyxJQUFJO2lCQUN0QyxDQUFDLENBQUE7YUFBQSxDQUFDLENBQUM7WUFDUixPQUFPLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLENBQUM7UUFDM0MsQ0FBQztRQUFDLE9BQU8sS0FBVSxFQUFFLENBQUM7WUFDbEIsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLE1BQUEsS0FBSyxhQUFMLEtBQUssdUJBQUwsS0FBSyxDQUFFLE9BQU8sbUNBQUksTUFBTSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7UUFDdEUsQ0FBQztJQUNMLENBQUM7SUFFRCxxQkFBcUIsQ0FBQyxRQUFnQixFQUFFLFNBQWlCOztRQUNyRCxJQUFJLENBQUM7WUFDRCxNQUFNLEVBQUUsUUFBUSxFQUFFLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ25DLE1BQU0sS0FBSyxHQUFHLFFBQVEsQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNsQyxJQUFJLENBQUMsS0FBSztnQkFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsaUJBQWlCLEVBQUUsQ0FBQztZQUNoRSxNQUFNLElBQUksR0FBRyxrQkFBa0IsQ0FBQyxLQUFLLEVBQUUsUUFBUSxDQUFDLENBQUM7WUFDakQsSUFBSSxDQUFDLElBQUk7Z0JBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLFFBQVEsUUFBUSxZQUFZLEVBQUUsQ0FBQztZQUMxRSxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLGNBQWMsQ0FBQyxDQUFDO1lBQy9DLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDUixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsUUFBUSxRQUFRLGdDQUFnQyxFQUFFLENBQUM7WUFDdkYsQ0FBQztZQUNELE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDdkMsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUNULE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxvQkFBb0IsU0FBUyxhQUFhLEVBQUUsQ0FBQztZQUNqRixDQUFDO1lBQ0QsT0FBTztnQkFDSCxPQUFPLEVBQUUsSUFBSTtnQkFDYixJQUFJLEVBQUU7b0JBQ0YsS0FBSyxFQUFFLE9BQU8sS0FBSyxDQUFDLEtBQUssS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLElBQUk7b0JBQzNELFNBQVMsRUFBRSxLQUFLLENBQUMsU0FBUyxLQUFLLElBQUk7b0JBQ25DLFdBQVcsRUFBRSxPQUFPLEtBQUssQ0FBQyxXQUFXLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxJQUFJO29CQUM3RSxTQUFTLEVBQUUsT0FBTyxLQUFLLENBQUMsU0FBUyxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsSUFBSTtpQkFDMUU7YUFDSixDQUFDO1FBQ04sQ0FBQztRQUFDLE9BQU8sS0FBVSxFQUFFLENBQUM7WUFDbEIsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLE1BQUEsS0FBSyxhQUFMLEtBQUssdUJBQUwsS0FBSyxDQUFFLE9BQU8sbUNBQUksTUFBTSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7UUFDdEUsQ0FBQztJQUNMLENBQUM7SUFFRCxpQkFBaUIsQ0FBQyxRQUFnQixFQUFFLFNBQWlCLEVBQUUsS0FBYTs7UUFDaEUsSUFBSSxDQUFDO1lBQ0QsTUFBTSxFQUFFLFFBQVEsRUFBRSxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNuQyxNQUFNLEtBQUssR0FBRyxRQUFRLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDbEMsSUFBSSxDQUFDLEtBQUs7Z0JBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLGlCQUFpQixFQUFFLENBQUM7WUFDaEUsTUFBTSxJQUFJLEdBQUcsa0JBQWtCLENBQUMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxDQUFDO1lBQ2pELElBQUksQ0FBQyxJQUFJO2dCQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxRQUFRLFFBQVEsWUFBWSxFQUFFLENBQUM7WUFDMUUsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxjQUFjLENBQUMsQ0FBQztZQUMvQyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQ1IsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLFFBQVEsUUFBUSxnQ0FBZ0MsRUFBRSxDQUFDO1lBQ3ZGLENBQUM7WUFDRCxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQ3ZDLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDVCxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsb0JBQW9CLFNBQVMsYUFBYSxFQUFFLENBQUM7WUFDakYsQ0FBQztZQUNELEtBQUssQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO1lBQ3BCLE9BQU87Z0JBQ0gsT0FBTyxFQUFFLElBQUk7Z0JBQ2IsSUFBSSxFQUFFO29CQUNGLEtBQUssRUFBRSxLQUFLLENBQUMsS0FBSztvQkFDbEIsU0FBUyxFQUFFLEtBQUssQ0FBQyxTQUFTLEtBQUssSUFBSTtvQkFDbkMsV0FBVyxFQUFFLE9BQU8sS0FBSyxDQUFDLFdBQVcsS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLElBQUk7b0JBQzdFLFNBQVMsRUFBRSxPQUFPLEtBQUssQ0FBQyxTQUFTLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxJQUFJO2lCQUMxRTthQUNKLENBQUM7UUFDTixDQUFDO1FBQUMsT0FBTyxLQUFVLEVBQUUsQ0FBQztZQUNsQixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsTUFBQSxLQUFLLGFBQUwsS0FBSyx1QkFBTCxLQUFLLENBQUUsT0FBTyxtQ0FBSSxNQUFNLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztRQUN0RSxDQUFDO0lBQ0wsQ0FBQztJQUVELHNCQUFzQixDQUFDLFFBQWdCLEVBQUUsU0FBaUI7O1FBQ3RELElBQUksQ0FBQztZQUNELE1BQU0sRUFBRSxRQUFRLEVBQUUsR0FBRyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDbkMsTUFBTSxLQUFLLEdBQUcsUUFBUSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ2xDLElBQUksQ0FBQyxLQUFLO2dCQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxpQkFBaUIsRUFBRSxDQUFDO1lBQ2hFLE1BQU0sSUFBSSxHQUFHLGtCQUFrQixDQUFDLEtBQUssRUFBRSxRQUFRLENBQUMsQ0FBQztZQUNqRCxJQUFJLENBQUMsSUFBSTtnQkFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsUUFBUSxRQUFRLFlBQVksRUFBRSxDQUFDO1lBQzFFLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsY0FBYyxDQUFDLENBQUM7WUFDL0MsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUNSLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxRQUFRLFFBQVEsZ0NBQWdDLEVBQUUsQ0FBQztZQUN2RixDQUFDO1lBQ0QsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUN2QyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7Z0JBQ1QsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLG9CQUFvQixTQUFTLGFBQWEsRUFBRSxDQUFDO1lBQ2pGLENBQUM7WUFDRCxNQUFNLFdBQVcsR0FBRyxPQUFPLEtBQUssQ0FBQyxXQUFXLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDbEYsTUFBTSxTQUFTLEdBQUcsT0FBTyxLQUFLLENBQUMsU0FBUyxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzVFLE9BQU8sRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxFQUFFLFFBQVEsRUFBRSxXQUFXLElBQUksU0FBUyxFQUFFLEVBQUUsQ0FBQztRQUMzRSxDQUFDO1FBQUMsT0FBTyxLQUFVLEVBQUUsQ0FBQztZQUNsQixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsTUFBQSxLQUFLLGFBQUwsS0FBSyx1QkFBTCxLQUFLLENBQUUsT0FBTyxtQ0FBSSxNQUFNLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztRQUN0RSxDQUFDO0lBQ0wsQ0FBQztJQUVELGFBQWEsQ0FBQyxRQUFnQixFQUFFLFFBQWlCOztRQUM3QyxJQUFJLENBQUM7WUFDRCxNQUFNLEVBQUUsUUFBUSxFQUFFLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ25DLE1BQU0sS0FBSyxHQUFHLFFBQVEsQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNsQyxJQUFJLENBQUMsS0FBSztnQkFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsaUJBQWlCLEVBQUUsQ0FBQztZQUNoRSxNQUFNLElBQUksR0FBRyxrQkFBa0IsQ0FBQyxLQUFLLEVBQUUsUUFBUSxDQUFDLENBQUM7WUFDakQsSUFBSSxDQUFDLElBQUk7Z0JBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLFFBQVEsUUFBUSxZQUFZLEVBQUUsQ0FBQztZQUMxRSxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLGNBQWMsQ0FBQyxDQUFDO1lBQy9DLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDUixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsUUFBUSxRQUFRLGdDQUFnQyxFQUFFLENBQUM7WUFDdkYsQ0FBQztZQUNELElBQUksUUFBUSxFQUFFLENBQUM7Z0JBQ1gsaUVBQWlFO2dCQUNqRSwwREFBMEQ7Z0JBQzFELCtCQUErQjtnQkFDL0IsTUFBTSxLQUFLLEdBQUcsQ0FBQyxNQUFBLElBQUksQ0FBQyxLQUFLLG1DQUFJLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQU0sRUFBRSxFQUFFLENBQUMsQ0FBQSxDQUFDLGFBQUQsQ0FBQyx1QkFBRCxDQUFDLENBQUUsSUFBSSxNQUFLLFFBQVEsQ0FBQyxDQUFDO2dCQUN4RSxJQUFJLENBQUMsS0FBSyxJQUFJLENBQUMsQ0FBQSxNQUFBLElBQUksQ0FBQyxXQUFXLDBDQUFFLElBQUksTUFBSyxRQUFRLENBQUMsRUFBRSxDQUFDO29CQUNsRCxPQUFPO3dCQUNILE9BQU8sRUFBRSxLQUFLO3dCQUNkLEtBQUssRUFBRSxTQUFTLFFBQVEsaURBQWlELENBQUMsTUFBQSxJQUFJLENBQUMsS0FBSyxtQ0FBSSxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFNLEVBQUUsRUFBRSxDQUFDLENBQUMsYUFBRCxDQUFDLHVCQUFELENBQUMsQ0FBRSxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLFFBQVEsR0FBRztxQkFDakssQ0FBQztnQkFDTixDQUFDO2dCQUNELElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDeEIsQ0FBQztpQkFBTSxDQUFDO2dCQUNKLElBQUksQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7b0JBQ3BCLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxpREFBaUQsRUFBRSxDQUFDO2dCQUN4RixDQUFDO2dCQUNELElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNoQixDQUFDO1lBQ0QsT0FBTztnQkFDSCxPQUFPLEVBQUUsSUFBSTtnQkFDYixPQUFPLEVBQUUsWUFBWSxRQUFRLGFBQVIsUUFBUSxjQUFSLFFBQVEsR0FBSSxNQUFBLElBQUksQ0FBQyxXQUFXLDBDQUFFLElBQUksUUFBUSxJQUFJLENBQUMsSUFBSSxFQUFFO2dCQUMxRSxJQUFJLEVBQUUsRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLE1BQUEsUUFBUSxhQUFSLFFBQVEsY0FBUixRQUFRLEdBQUksTUFBQSxJQUFJLENBQUMsV0FBVywwQ0FBRSxJQUFJLG1DQUFJLElBQUksRUFBRTthQUMzRSxDQUFDO1FBQ04sQ0FBQztRQUFDLE9BQU8sS0FBVSxFQUFFLENBQUM7WUFDbEIsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLE1BQUEsS0FBSyxhQUFMLEtBQUssdUJBQUwsS0FBSyxDQUFFLE9BQU8sbUNBQUksTUFBTSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7UUFDdEUsQ0FBQztJQUNMLENBQUM7SUFFRCxhQUFhLENBQUMsUUFBZ0I7O1FBQzFCLElBQUksQ0FBQztZQUNELE1BQU0sRUFBRSxRQUFRLEVBQUUsR0FBRyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDbkMsTUFBTSxLQUFLLEdBQUcsUUFBUSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ2xDLElBQUksQ0FBQyxLQUFLO2dCQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxpQkFBaUIsRUFBRSxDQUFDO1lBQ2hFLE1BQU0sSUFBSSxHQUFHLGtCQUFrQixDQUFDLEtBQUssRUFBRSxRQUFRLENBQUMsQ0FBQztZQUNqRCxJQUFJLENBQUMsSUFBSTtnQkFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsUUFBUSxRQUFRLFlBQVksRUFBRSxDQUFDO1lBQzFFLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsY0FBYyxDQUFDLENBQUM7WUFDL0MsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUNSLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxRQUFRLFFBQVEsZ0NBQWdDLEVBQUUsQ0FBQztZQUN2RixDQUFDO1lBQ0QsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ1osT0FBTyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLHdCQUF3QixJQUFJLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQztRQUMzRSxDQUFDO1FBQUMsT0FBTyxLQUFVLEVBQUUsQ0FBQztZQUNsQixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsTUFBQSxLQUFLLGFBQUwsS0FBSyx1QkFBTCxLQUFLLENBQUUsT0FBTyxtQ0FBSSxNQUFNLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztRQUN0RSxDQUFDO0lBQ0wsQ0FBQztJQUVEOzs7Ozs7Ozs7Ozs7T0FZRztJQUNILHdCQUF3QixDQUFDLFFBQWdCLEVBQUUsUUFBdUI7O1FBQzlELElBQUksQ0FBQztZQUNELE1BQU0sRUFBRSxRQUFRLEVBQUUsR0FBRyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDbkMsTUFBTSxLQUFLLEdBQUcsUUFBUSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ2xDLElBQUksQ0FBQyxLQUFLO2dCQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxpQkFBaUIsRUFBRSxDQUFDO1lBQ2hFLE1BQU0sSUFBSSxHQUFHLGtCQUFrQixDQUFDLEtBQUssRUFBRSxRQUFRLENBQUMsQ0FBQztZQUNqRCxJQUFJLENBQUMsSUFBSTtnQkFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsUUFBUSxRQUFRLFlBQVksRUFBRSxDQUFDO1lBQzFFLDREQUE0RDtZQUM1RCxnRUFBZ0U7WUFDaEUsK0RBQStEO1lBQy9ELGdFQUFnRTtZQUNoRSxrRUFBa0U7WUFDbEUsZ0VBQWdFO1lBQ2hFLHlDQUF5QztZQUN6QyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLGNBQWMsQ0FBQyxDQUFDO1lBQy9DLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDUixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsUUFBUSxRQUFRLGdDQUFnQyxFQUFFLENBQUM7WUFDdkYsQ0FBQztZQUNELE1BQU0sVUFBVSxHQUFVLENBQUMsTUFBQSxNQUFBLElBQUksQ0FBQyxXQUFXLG1DQUFJLElBQUksQ0FBQyxVQUFVLG1DQUFJLEVBQUUsQ0FBQyxDQUFDO1lBQ3RFLE1BQU0sU0FBUyxHQUFHLFVBQVUsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDM0MsSUFBSSxTQUFTLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQztnQkFDbkIsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLFFBQVEsUUFBUSxvRkFBb0YsRUFBRSxDQUFDO1lBQzNJLENBQUM7WUFDRCxJQUFJLFFBQVEsR0FBa0IsSUFBSSxDQUFDO1lBQ25DLElBQUksUUFBUSxLQUFLLElBQUksSUFBSSxRQUFRLEtBQUssU0FBUyxFQUFFLENBQUM7Z0JBQzlDLE1BQU0sSUFBSSxHQUFHLENBQUMsTUFBQSxJQUFJLENBQUMsS0FBSyxtQ0FBSSxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFNLEVBQUUsRUFBRSxDQUFDLENBQUEsQ0FBQyxhQUFELENBQUMsdUJBQUQsQ0FBQyxDQUFFLElBQUksTUFBSyxRQUFRLENBQUMsQ0FBQztnQkFDdkUsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO29CQUNSLE9BQU87d0JBQ0gsT0FBTyxFQUFFLEtBQUs7d0JBQ2QsS0FBSyxFQUFFLFNBQVMsUUFBUSxpREFBaUQsQ0FBQyxNQUFBLElBQUksQ0FBQyxLQUFLLG1DQUFJLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQU0sRUFBRSxFQUFFLENBQUMsQ0FBQyxhQUFELENBQUMsdUJBQUQsQ0FBQyxDQUFFLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksUUFBUSxHQUFHO3FCQUNqSyxDQUFDO2dCQUNOLENBQUM7Z0JBQ0QsUUFBUSxHQUFHLE1BQUEsTUFBQSxJQUFJLENBQUMsS0FBSyxtQ0FBSSxJQUFJLENBQUMsSUFBSSxtQ0FBSSxJQUFJLENBQUM7Z0JBQzNDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztvQkFDWixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsU0FBUyxRQUFRLHFEQUFxRCxFQUFFLENBQUM7Z0JBQzdHLENBQUM7WUFDTCxDQUFDO1lBQ0QsT0FBTztnQkFDSCxPQUFPLEVBQUUsSUFBSTtnQkFDYixJQUFJLEVBQUU7b0JBQ0YsY0FBYyxFQUFFLFNBQVM7b0JBQ3pCLFFBQVE7b0JBQ1Isa0JBQWtCLEVBQUUsTUFBQSxNQUFBLElBQUksQ0FBQyxXQUFXLDBDQUFFLElBQUksbUNBQUksSUFBSTtvQkFDbEQsaUJBQWlCLEVBQUUsSUFBSSxDQUFDLFVBQVUsS0FBSyxJQUFJO2lCQUM5QzthQUNKLENBQUM7UUFDTixDQUFDO1FBQUMsT0FBTyxLQUFVLEVBQUUsQ0FBQztZQUNsQixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsTUFBQSxLQUFLLGFBQUwsS0FBSyx1QkFBTCxLQUFLLENBQUUsT0FBTyxtQ0FBSSxNQUFNLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztRQUN0RSxDQUFDO0lBQ0wsQ0FBQztJQUVEOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7T0EyQkc7SUFDSCxLQUFLLENBQUMsc0JBQXNCLENBQUMsS0FBYzs7UUFDdkMsSUFBSSxDQUFDO1lBQ0QsSUFBSSxPQUFPLEdBQUcsS0FBSyxXQUFXLElBQUksR0FBRyxLQUFLLElBQUksRUFBRSxDQUFDO2dCQUM3QyxPQUFPO29CQUNILE9BQU8sRUFBRSxLQUFLO29CQUNkLEtBQUssRUFBRSw4RUFBOEU7aUJBQ3hGLENBQUM7WUFDTixDQUFDO1lBQ0QsOERBQThEO1lBQzlELDJEQUEyRDtZQUMzRCxpQ0FBaUM7WUFDakMsTUFBTSxVQUFVLEdBQVU7Z0JBQ3JCLEdBQVcsQ0FBQyxXQUFXO2dCQUN4QixNQUFDLEdBQVcsQ0FBQyxrQkFBa0IsMENBQUUsUUFBUTtnQkFDeEMsR0FBVyxDQUFDLGtCQUFrQjthQUNsQyxDQUFDO1lBQ0YsTUFBTSxNQUFNLEdBQUcsVUFBVSxDQUFDLElBQUksQ0FDMUIsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUksT0FBTyxDQUFDLENBQUMsc0JBQXNCLEtBQUssVUFBVSxDQUMzRCxDQUFDO1lBQ0YsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO2dCQUNWLE9BQU87b0JBQ0gsT0FBTyxFQUFFLEtBQUs7b0JBQ2QsS0FBSyxFQUFFLG1OQUFtTjtpQkFDN04sQ0FBQztZQUNOLENBQUM7WUFDRCxNQUFNLE1BQU0sQ0FBQyxzQkFBc0IsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztZQUNwRCxPQUFPO2dCQUNILE9BQU8sRUFBRSxJQUFJO2dCQUNiLElBQUksRUFBRSxFQUFFLGNBQWMsRUFBRSxPQUFPLENBQUMsS0FBSyxDQUFDLEVBQUU7YUFDM0MsQ0FBQztRQUNOLENBQUM7UUFBQyxPQUFPLEtBQVUsRUFBRSxDQUFDO1lBQ2xCLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxNQUFBLEtBQUssYUFBTCxLQUFLLHVCQUFMLEtBQUssQ0FBRSxPQUFPLG1DQUFJLE1BQU0sQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1FBQ3RFLENBQUM7SUFDTCxDQUFDO0NBRUosQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGpvaW4gfSBmcm9tICdwYXRoJztcbm1vZHVsZS5wYXRocy5wdXNoKGpvaW4oRWRpdG9yLkFwcC5wYXRoLCAnbm9kZV9tb2R1bGVzJykpO1xuXG4vLyBgY2NlYCBpcyBpbmplY3RlZCBieSBDb2NvcyBFZGl0b3IgaW50byB0aGUgc2NlbmUtc2NyaXB0IGdsb2JhbCBzY29wZS5cbi8vIEl0IGlzIG5vdCBkZWNsYXJlZCBpbiBgQGNvY29zL2NyZWF0b3ItdHlwZXNgIGV4cG9ydHM7IGRlY2xhcmUgYSBtaW5pbWFsXG4vLyBydW50aW1lIHNoYXBlIGp1c3QgZm9yIHdoYXQgd2UgdG91Y2ggaGVyZSBzbyBUeXBlU2NyaXB0IHN0YXlzIHN0cmljdC5cbmRlY2xhcmUgY29uc3QgY2NlOiB1bmRlZmluZWQgfCB7XG4gICAgUHJlZmFiPzogUHJlZmFiRmFjYWRlO1xuICAgIFNjZW5lRmFjYWRlTWFuYWdlcj86IHsgaW5zdGFuY2U/OiBQcmVmYWJGYWNhZGUgfSAmIFByZWZhYkZhY2FkZTtcbn07XG5cbmludGVyZmFjZSBQcmVmYWJGYWNhZGUge1xuICAgIGNyZWF0ZVByZWZhYihub2RlVXVpZDogc3RyaW5nLCB1cmw6IHN0cmluZyk6IFByb21pc2U8YW55PjtcbiAgICBhcHBseVByZWZhYihub2RlVXVpZDogc3RyaW5nKTogUHJvbWlzZTxhbnk+O1xuICAgIGxpbmtQcmVmYWIobm9kZVV1aWQ6IHN0cmluZywgYXNzZXRVdWlkOiBzdHJpbmcpOiBhbnk7XG4gICAgdW5saW5rUHJlZmFiKG5vZGVVdWlkOiBzdHJpbmcsIHJlbW92ZU5lc3RlZDogYm9vbGVhbik6IGFueTtcbiAgICBnZXRQcmVmYWJEYXRhKG5vZGVVdWlkOiBzdHJpbmcpOiBhbnk7XG4gICAgcmVzdG9yZVByZWZhYj8odXVpZDogc3RyaW5nLCBhc3NldFV1aWQ6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj47XG59XG5cbnR5cGUgRmFjYWRlTG9va3VwID0geyBvazogdHJ1ZTsgdmFsdWU6IFByZWZhYkZhY2FkZSB9IHwgeyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmcgfTtcblxuZnVuY3Rpb24gZ2V0UHJlZmFiRmFjYWRlKCk6IEZhY2FkZUxvb2t1cCB7XG4gICAgaWYgKHR5cGVvZiBjY2UgPT09ICd1bmRlZmluZWQnIHx8IGNjZSA9PT0gbnVsbCkge1xuICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiAnY2NlIGdsb2JhbCBpcyBub3QgYXZhaWxhYmxlOyB0aGlzIG1ldGhvZCBtdXN0IHJ1biBpbiBhIHNjZW5lLXNjcmlwdCBjb250ZXh0JyB9O1xuICAgIH1cbiAgICBjb25zdCBjYW5kaWRhdGVzOiBBcnJheTxQcmVmYWJGYWNhZGUgfCB1bmRlZmluZWQ+ID0gW1xuICAgICAgICBjY2UuUHJlZmFiLFxuICAgICAgICBjY2UuU2NlbmVGYWNhZGVNYW5hZ2VyPy5pbnN0YW5jZSxcbiAgICAgICAgY2NlLlNjZW5lRmFjYWRlTWFuYWdlciBhcyBQcmVmYWJGYWNhZGUgfCB1bmRlZmluZWQsXG4gICAgXTtcbiAgICAvLyBFbnN1cmUgdGhlIGNhbmRpZGF0ZSBleHBvc2VzIGV2ZXJ5IGZhY2FkZSBtZXRob2Qgd2UgbWF5IGNhbGw7XG4gICAgLy8gYSBwYXJ0aWFsIGNhbmRpZGF0ZSB3b3VsZCBjcmFzaCBhdCB0aGUgZmlyc3QgbWlzc2luZyBtZXRob2QuXG4gICAgY29uc3QgcmVxdWlyZWQ6IEFycmF5PGtleW9mIFByZWZhYkZhY2FkZT4gPSBbJ2NyZWF0ZVByZWZhYicsICdhcHBseVByZWZhYicsICdsaW5rUHJlZmFiJywgJ3VubGlua1ByZWZhYicsICdnZXRQcmVmYWJEYXRhJ107XG4gICAgZm9yIChjb25zdCBjYW5kaWRhdGUgb2YgY2FuZGlkYXRlcykge1xuICAgICAgICBpZiAoY2FuZGlkYXRlICYmIHJlcXVpcmVkLmV2ZXJ5KG0gPT4gdHlwZW9mIChjYW5kaWRhdGUgYXMgYW55KVttXSA9PT0gJ2Z1bmN0aW9uJykpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiB0cnVlLCB2YWx1ZTogY2FuZGlkYXRlIH07XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgICAgb2s6IGZhbHNlLFxuICAgICAgICBlcnJvcjogJ05vIGNvbXBsZXRlIHByZWZhYiBmYWNhZGUgZm91bmQgb24gY2NlIChjY2UuUHJlZmFiIC8gY2NlLlNjZW5lRmFjYWRlTWFuYWdlcikuIENvY29zIGVkaXRvciBidWlsZCBtYXkgbm90IGV4cG9zZSB0aGUgZXhwZWN0ZWQgbWFuYWdlciBvciBvbmx5IGV4cG9zZXMgYSBwYXJ0aWFsIHN1cmZhY2UuJyxcbiAgICB9O1xufVxuXG50eXBlIENvbXBvbmVudExvb2t1cCA9XG4gICAgfCB7IG9rOiB0cnVlOyBzY2VuZTogYW55OyBub2RlOiBhbnk7IGNvbXBvbmVudDogYW55IH1cbiAgICB8IHsgb2s6IGZhbHNlOyBlcnJvcjogc3RyaW5nIH07XG5cbmZ1bmN0aW9uIGZpbmROb2RlQnlVdWlkRGVlcChyb290OiBhbnksIHV1aWQ6IHN0cmluZyk6IGFueSB7XG4gICAgaWYgKCFyb290KSByZXR1cm4gbnVsbDtcbiAgICBpZiAocm9vdC5faWQgPT09IHV1aWQgfHwgcm9vdC51dWlkID09PSB1dWlkKSByZXR1cm4gcm9vdDtcbiAgICBjb25zdCBjaGlsZHJlbiA9IHJvb3QuY2hpbGRyZW4gPz8gcm9vdC5fY2hpbGRyZW4gPz8gW107XG4gICAgZm9yIChjb25zdCBjaGlsZCBvZiBjaGlsZHJlbikge1xuICAgICAgICBjb25zdCBoaXQgPSBmaW5kTm9kZUJ5VXVpZERlZXAoY2hpbGQsIHV1aWQpO1xuICAgICAgICBpZiAoaGl0KSByZXR1cm4gaGl0O1xuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gcmVzb2x2ZUNvbXBvbmVudENvbnRleHQobm9kZVV1aWQ6IHN0cmluZywgY29tcG9uZW50VHlwZTogc3RyaW5nKTogQ29tcG9uZW50TG9va3VwIHtcbiAgICBjb25zdCB7IGRpcmVjdG9yLCBqcyB9ID0gcmVxdWlyZSgnY2MnKTtcbiAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgaWYgKCFzY2VuZSkge1xuICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiAnTm8gYWN0aXZlIHNjZW5lJyB9O1xuICAgIH1cbiAgICAvLyBzY2VuZS5nZXRDaGlsZEJ5VXVpZCBvbmx5IHdhbGtzIGRpcmVjdCBjaGlsZHJlbjsgdXNlIGRlcHRoLWZpcnN0IHNlYXJjaC5cbiAgICBjb25zdCBub2RlID0gZmluZE5vZGVCeVV1aWREZWVwKHNjZW5lLCBub2RlVXVpZCk7XG4gICAgaWYgKCFub2RlKSB7XG4gICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGBOb2RlIHdpdGggVVVJRCAke25vZGVVdWlkfSBub3QgZm91bmRgIH07XG4gICAgfVxuICAgIGNvbnN0IENvbXBvbmVudENsYXNzID0ganMuZ2V0Q2xhc3NCeU5hbWUoY29tcG9uZW50VHlwZSk7XG4gICAgaWYgKCFDb21wb25lbnRDbGFzcykge1xuICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBgQ29tcG9uZW50IHR5cGUgJHtjb21wb25lbnRUeXBlfSBub3QgZm91bmRgIH07XG4gICAgfVxuICAgIGNvbnN0IGNvbXBvbmVudCA9IG5vZGUuZ2V0Q29tcG9uZW50KENvbXBvbmVudENsYXNzKTtcbiAgICBpZiAoIWNvbXBvbmVudCkge1xuICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBgQ29tcG9uZW50ICR7Y29tcG9uZW50VHlwZX0gbm90IGZvdW5kIG9uIG5vZGVgIH07XG4gICAgfVxuICAgIHJldHVybiB7IG9rOiB0cnVlLCBzY2VuZSwgbm9kZSwgY29tcG9uZW50IH07XG59XG5cbmZ1bmN0aW9uIHNlcmlhbGl6ZUV2ZW50SGFuZGxlcihlaDogYW55KSB7XG4gICAgaWYgKCFlaCkgcmV0dXJuIG51bGw7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgdGFyZ2V0VXVpZDogZWgudGFyZ2V0Py51dWlkID8/IG51bGwsXG4gICAgICAgIHRhcmdldE5hbWU6IGVoLnRhcmdldD8ubmFtZSA/PyBudWxsLFxuICAgICAgICBjb21wb25lbnQ6IGVoLmNvbXBvbmVudCA/PyBlaC5fY29tcG9uZW50TmFtZSA/PyBudWxsLFxuICAgICAgICBoYW5kbGVyOiBlaC5oYW5kbGVyID8/IG51bGwsXG4gICAgICAgIGN1c3RvbUV2ZW50RGF0YTogZWguY3VzdG9tRXZlbnREYXRhID8/ICcnLFxuICAgIH07XG59XG5cbi8vIHYyLjQuOCBBMyArIHYyLjQuOSArIHYyLjQuMTAgcmV2aWV3IGZpeDogc2NlbmUtc2lkZSBsb2cgY2FwdHVyZVxuLy8gKFJvbWFSb2dvdiBwYXR0ZXJuIGFkYXB0ZWQpLlxuLy9cbi8vIENvbmN1cnJlbmN5IG1vZGVsIOKAlCB2Mi40LjEwIChjbGF1ZGUgKyBjb2RleCDwn5S0IHJvdW5kLTIpOlxuLy8gICB2Mi40LjggZmFubmVkIGV2ZXJ5IGNvbnNvbGUubG9nIHRvIEFMTCBhY3RpdmUgY2FwdHVyZSBhcnJheXMuXG4vLyAgIHYyLjQuOSBhdHRlbXB0ZWQgdG8gaXNvbGF0ZSB2aWEgX3RvcFNsb3QoKSAoY3VycmVudCB0b3Agb2Ygc3RhY2spXG4vLyAgIGJ1dCB0aGF0IG9ubHkgd29ya2VkIGZvciBzdHJpY3RseSBMSUZPLW5lc3RlZCBjYWxsczsgdHdvIGNhbGxzXG4vLyAgIHRoYXQgaW50ZXJsZWF2ZSB2aWEgYGF3YWl0YCBjb3VsZCBzdGlsbCBtaXNhdHRyaWJ1dGUgKGNhbGwgQVxuLy8gICBhd2FpdHMsIEIgcHVzaGVzIGl0cyBzbG90LCBBJ3MgcG9zdC1hd2FpdCBsb2dzIHdvdWxkIHJvdXRlIHRvIEIpLlxuLy8gICB2Mi40LjEwIHVzZXMgTm9kZSdzIGJ1aWx0LWluIGBBc3luY0xvY2FsU3RvcmFnZWAgc28gZWFjaCBjYWxsJ3Ncbi8vICAgbG9naWNhbCBhc3luYyBjaGFpbiBrZWVwcyBpdHMgT1dOIHNsb3QgcmVnYXJkbGVzcyBvZiBzdGFjayBvcmRlci5cbi8vICAgV2hlbiBjb25zb2xlLmxvZyBmaXJlcywgdGhlIGhvb2sgcmVhZHMgQUxTLmdldFN0b3JlKCkg4oCUIHdoaWNoIGlzXG4vLyAgIGJvdW5kIHRvIHRoZSBvcmlnaW5hdGluZyBjYWxsJ3MgYXN5bmMgY29udGV4dCDigJQgYW5kIHdyaXRlcyB0aGVyZS5cbi8vXG4vLyBCb3VuZCDigJQgdjIuNC45IChjbGF1ZGUgKyBjb2RleCDwn5+hKTpcbi8vICAgQ2FwIGVudHJpZXMgcGVyIGNhcHR1cmUgKGRlZmF1bHQgNTAwKSBhbmQgdG90YWwgYnl0ZXMgKGRlZmF1bHRcbi8vICAgNjQgS0IpLiBFeGNlc3MgZW50cmllcyBhcmUgZHJvcHBlZDsgYSBzaW5nbGUgYFtjYXB0dXJlIHRydW5jYXRlZF1gXG4vLyAgIG1hcmtlciBpcyBhcHBlbmRlZCBvbmNlLiB2Mi40LjEwOiBtYXJrZXIgYnl0ZXMgY291bnRlZCBhZ2FpbnN0XG4vLyAgIHRoZSBjYXAgKGNvZGV4IHJvdW5kLTIg8J+foSkgc28gdGhlIHNsb3QncyBieXRlcyBmaWVsZCBzdGF5c1xuLy8gICBtb25vdG9uaWNhbGx5IGFjY3VyYXRlLlxuLy9cbi8vIEhvb2sgbGlmZWN5Y2xlOlxuLy8gICBUaGUgY29uc29sZSBob29rIGlzIGluc3RhbGxlZCBvbiBmaXJzdCBgcnVuV2l0aENhcHR1cmVgIGludm9jYXRpb25cbi8vICAgYW5kIHVuaW5zdGFsbGVkIHdoZW4gbm8gc2xvdCBpcyBhY3RpdmUuIEVhY2ggaW52b2NhdGlvbiBgYWxzLnJ1bigpYHNcbi8vICAgd2l0aCBpdHMgc2xvdCwgc28gdGhlIGhvb2sganVzdCByZWFkcyB0aGUgc3RvcmUuIFdlIHN0aWxsIGtlZXBcbi8vICAgYF9hY3RpdmVTbG90Q291bnRgIGFzIGEgcmVmY291bnQgdG8ga25vdyB3aGVuIHRvIHVuaG9vayAoQUxTXG4vLyAgIGRvZXNuJ3QgZXhwb3NlIHN0b3JlIGNvdW50IGRpcmVjdGx5KS5cbmltcG9ydCB7IEFzeW5jTG9jYWxTdG9yYWdlIH0gZnJvbSAnYXN5bmNfaG9va3MnO1xuXG50eXBlIENhcHR1cmVkRW50cnkgPSB7IGxldmVsOiAnbG9nJyB8ICd3YXJuJyB8ICdlcnJvcic7IG1lc3NhZ2U6IHN0cmluZzsgdHM6IG51bWJlciB9O1xudHlwZSBDb25zb2xlU25hcHNob3QgPSB7IGxvZzogdHlwZW9mIGNvbnNvbGUubG9nOyB3YXJuOiB0eXBlb2YgY29uc29sZS53YXJuOyBlcnJvcjogdHlwZW9mIGNvbnNvbGUuZXJyb3IgfTtcblxuaW50ZXJmYWNlIENhcHR1cmVTbG90IHtcbiAgICBlbnRyaWVzOiBDYXB0dXJlZEVudHJ5W107XG4gICAgYnl0ZXM6IG51bWJlcjtcbiAgICB0cnVuY2F0ZWQ6IGJvb2xlYW47XG59XG5cbmNvbnN0IENBUFRVUkVfTUFYX0VOVFJJRVMgPSA1MDA7XG5jb25zdCBDQVBUVVJFX01BWF9CWVRFUyA9IDY0ICogMTAyNDtcbmNvbnN0IF9jYXB0dXJlQUxTID0gbmV3IEFzeW5jTG9jYWxTdG9yYWdlPENhcHR1cmVTbG90PigpO1xubGV0IF9hY3RpdmVTbG90Q291bnQgPSAwO1xubGV0IF9vcmlnQ29uc29sZTogQ29uc29sZVNuYXBzaG90IHwgbnVsbCA9IG51bGw7XG5cbmZ1bmN0aW9uIF9mb3JtYXRBcmdzKGE6IHVua25vd25bXSk6IHN0cmluZyB7XG4gICAgcmV0dXJuIGFcbiAgICAgICAgLm1hcCh4ID0+IHtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgeCA9PT0gJ3N0cmluZycpIHJldHVybiB4O1xuICAgICAgICAgICAgdHJ5IHsgcmV0dXJuIEpTT04uc3RyaW5naWZ5KHgpOyB9IGNhdGNoIHsgcmV0dXJuIFN0cmluZyh4KTsgfVxuICAgICAgICB9KVxuICAgICAgICAuam9pbignICcpO1xufVxuXG5mdW5jdGlvbiBfYXBwZW5kQm91bmRlZChzbG90OiBDYXB0dXJlU2xvdCwgZW50cnk6IENhcHR1cmVkRW50cnkpOiB2b2lkIHtcbiAgICBpZiAoc2xvdC50cnVuY2F0ZWQpIHJldHVybjtcbiAgICBjb25zdCBlbnRyeUJ5dGVzID0gZW50cnkubWVzc2FnZS5sZW5ndGggKyAzMjsgLy8gfmxldmVsICsgdHMgb3ZlcmhlYWRcbiAgICBpZiAoc2xvdC5lbnRyaWVzLmxlbmd0aCA+PSBDQVBUVVJFX01BWF9FTlRSSUVTIHx8IHNsb3QuYnl0ZXMgKyBlbnRyeUJ5dGVzID4gQ0FQVFVSRV9NQVhfQllURVMpIHtcbiAgICAgICAgc2xvdC50cnVuY2F0ZWQgPSB0cnVlO1xuICAgICAgICBjb25zdCBtYXJrZXI6IENhcHR1cmVkRW50cnkgPSB7IGxldmVsOiAnd2FybicsIG1lc3NhZ2U6ICdbY2FwdHVyZSB0cnVuY2F0ZWQg4oCUIGV4Y2VlZGVkIGVudHJ5L2J5dGUgY2FwXScsIHRzOiBEYXRlLm5vdygpIH07XG4gICAgICAgIHNsb3QuZW50cmllcy5wdXNoKG1hcmtlcik7XG4gICAgICAgIC8vIHYyLjQuMTAgY29kZXggcm91bmQtMiDwn5+hOiB0cmFjayBtYXJrZXIgYnl0ZXMgdG9vIHNvIGNhcCBhY2NvdW50aW5nXG4gICAgICAgIC8vIHN0YXlzIGFjY3VyYXRlIGV2ZW4gdGhvdWdoIG5vIGZ1cnRoZXIgYXBwZW5kcyB3aWxsIGZvbGxvdy5cbiAgICAgICAgc2xvdC5ieXRlcyArPSBtYXJrZXIubWVzc2FnZS5sZW5ndGggKyAzMjtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBzbG90LmVudHJpZXMucHVzaChlbnRyeSk7XG4gICAgc2xvdC5ieXRlcyArPSBlbnRyeUJ5dGVzO1xufVxuXG5mdW5jdGlvbiBfZW5zdXJlQ29uc29sZUhvb2soKTogdm9pZCB7XG4gICAgaWYgKF9vcmlnQ29uc29sZSkgcmV0dXJuO1xuICAgIF9vcmlnQ29uc29sZSA9IHsgbG9nOiBjb25zb2xlLmxvZywgd2FybjogY29uc29sZS53YXJuLCBlcnJvcjogY29uc29sZS5lcnJvciB9O1xuICAgIGNvbnN0IG1ha2UgPSAobGV2ZWw6IENhcHR1cmVkRW50cnlbJ2xldmVsJ10sIG9yaWc6ICguLi5hOiBhbnlbXSkgPT4gdm9pZCkgPT5cbiAgICAgICAgKC4uLmE6IGFueVtdKTogdm9pZCA9PiB7XG4gICAgICAgICAgICBjb25zdCBzbG90ID0gX2NhcHR1cmVBTFMuZ2V0U3RvcmUoKTtcbiAgICAgICAgICAgIGlmIChzbG90KSB7XG4gICAgICAgICAgICAgICAgY29uc3QgbWVzc2FnZSA9IF9mb3JtYXRBcmdzKGEpO1xuICAgICAgICAgICAgICAgIF9hcHBlbmRCb3VuZGVkKHNsb3QsIHsgbGV2ZWwsIG1lc3NhZ2UsIHRzOiBEYXRlLm5vdygpIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdHJ5IHsgb3JpZy5hcHBseShjb25zb2xlLCBhKTsgfSBjYXRjaCB7IC8qIHN3YWxsb3cgKi8gfVxuICAgICAgICB9O1xuICAgIGNvbnNvbGUubG9nID0gbWFrZSgnbG9nJywgX29yaWdDb25zb2xlLmxvZyk7XG4gICAgY29uc29sZS53YXJuID0gbWFrZSgnd2FybicsIF9vcmlnQ29uc29sZS53YXJuKTtcbiAgICBjb25zb2xlLmVycm9yID0gbWFrZSgnZXJyb3InLCBfb3JpZ0NvbnNvbGUuZXJyb3IpO1xufVxuXG5mdW5jdGlvbiBfbWF5YmVVbmhvb2tDb25zb2xlKCk6IHZvaWQge1xuICAgIGlmIChfYWN0aXZlU2xvdENvdW50ID4gMCB8fCAhX29yaWdDb25zb2xlKSByZXR1cm47XG4gICAgY29uc29sZS5sb2cgPSBfb3JpZ0NvbnNvbGUubG9nO1xuICAgIGNvbnNvbGUud2FybiA9IF9vcmlnQ29uc29sZS53YXJuO1xuICAgIGNvbnNvbGUuZXJyb3IgPSBfb3JpZ0NvbnNvbGUuZXJyb3I7XG4gICAgX29yaWdDb25zb2xlID0gbnVsbDtcbn1cblxuZXhwb3J0IGNvbnN0IG1ldGhvZHM6IHsgW2tleTogc3RyaW5nXTogKC4uLmFueTogYW55KSA9PiBhbnkgfSA9IHtcbiAgICAvKipcbiAgICAgKiB2Mi40LjggQTM6IGludm9rZSBhbm90aGVyIHNjZW5lLXNjcmlwdCBtZXRob2QgYnkgbmFtZSwgY2FwdHVyaW5nXG4gICAgICogY29uc29sZS57bG9nLHdhcm4sZXJyb3J9IGR1cmluZyB0aGUgY2FsbCBhbmQgcmV0dXJuaW5nIGNhcHR1cmVkTG9nc1xuICAgICAqIGFsb25nc2lkZSB0aGUgbWV0aG9kJ3Mgbm9ybWFsIHJldHVybiBlbnZlbG9wZS4gU2luZ2xlIHJvdW5kLXRyaXAuXG4gICAgICpcbiAgICAgKiBCZWhhdmlvdXI6XG4gICAgICogIC0gSWYgYG1ldGhvZE5hbWVgIGRvZXMgbm90IGV4aXN0LCByZXR1cm5zXG4gICAgICogICAgYHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBcIi4uLlwiICwgY2FwdHVyZWRMb2dzOiBbXSB9YCAoZW1wdHkpLlxuICAgICAqICAtIElmIHRoZSBpbm5lciBtZXRob2QgdGhyb3dzLCB0aGUgdGhyb3cgaXMgY2F1Z2h0IGFuZCBjb252ZXJ0ZWQgdG9cbiAgICAgKiAgICBgeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3IsIGNhcHR1cmVkTG9ncyB9YCBzbyB0aGUgaG9zdCBhbHdheXMgc2Vlc1xuICAgICAqICAgIGEgc3RydWN0dXJlZCBlbnZlbG9wZSBwbHVzIHRoZSBsb2dzIHRoYXQgcmFuIHVwIHRvIHRoZSB0aHJvdy5cbiAgICAgKiAgLSBJZiB0aGUgaW5uZXIgbWV0aG9kIHJldHVybnMgYW4gb2JqZWN0LCBjYXB0dXJlZExvZ3MgaXMgbWVyZ2VkXG4gICAgICogICAgYWxvbmdzaWRlIGl0cyBrZXlzIHdpdGhvdXQgb3ZlcndyaXRpbmcgKHdlIHVzZSBgPz8gY2FwdHVyZXNgXG4gICAgICogICAgc2VtYW50aWNzOiBvbmx5IHNldCBpZiBub3QgYWxyZWFkeSBwcmVzZW50KS5cbiAgICAgKi9cbiAgICBhc3luYyBydW5XaXRoQ2FwdHVyZShtZXRob2ROYW1lOiBzdHJpbmcsIG1ldGhvZEFyZ3M/OiB1bmtub3duW10pIHtcbiAgICAgICAgY29uc3Qgc2xvdDogQ2FwdHVyZVNsb3QgPSB7XG4gICAgICAgICAgICBlbnRyaWVzOiBbXSxcbiAgICAgICAgICAgIGJ5dGVzOiAwLFxuICAgICAgICAgICAgdHJ1bmNhdGVkOiBmYWxzZSxcbiAgICAgICAgfTtcbiAgICAgICAgLy8gdjIuNC4xMSByb3VuZC0zIGNvZGV4IPCflLQgKyBjbGF1ZGUg8J+foSArIGdlbWluaSDwn5+hOiBrZWVwIGluY3JlbWVudFxuICAgICAgICAvLyBPVVRTSURFIHRoZSB0cnkgKG51bWVyaWMgYCs9IDFgIGlzIGluZmFsbGlibGUsIG11c3QgcGFpciAxOjEgd2l0aFxuICAgICAgICAvLyBmaW5hbGx5IGRlY3JlbWVudCksIGJ1dCBtb3ZlIF9lbnN1cmVDb25zb2xlSG9vayBJTlNJREUgc28gYVxuICAgICAgICAvLyB0aHJvdyB0aGVyZSAodG9kYXk6IHB1cmUgYXNzaWdubWVudHMsIHNvIHNhZmU7IGRlZmVuc2l2ZSBhZ2FpbnN0XG4gICAgICAgIC8vIGZ1dHVyZSBncm93dGgpIGNhbm5vdCBsZWFrIHRoZSByZWZjb3VudCBhbmQgbGVhdmUgdGhlIGNvbnNvbGVcbiAgICAgICAgLy8gaG9vayBpbnN0YWxsZWQgZm9yZXZlci5cbiAgICAgICAgX2FjdGl2ZVNsb3RDb3VudCArPSAxO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgX2Vuc3VyZUNvbnNvbGVIb29rKCk7XG4gICAgICAgICAgICAvLyB2Mi40LjEwIHJvdW5kLTIgY29kZXgg8J+UtCArIGNsYXVkZSDwn5+hICsgZ2VtaW5pIPCfn6E6IEFzeW5jTG9jYWxTdG9yYWdlXG4gICAgICAgICAgICAvLyBiaW5kcyBgc2xvdGAgdG8gdGhpcyBjYWxsJ3MgbG9naWNhbCBhc3luYyBjb250ZXh0LCBzbyBhbnlcbiAgICAgICAgICAgIC8vIGNvbnNvbGUubG9nIGVtaXR0ZWQgYnkgdGhlIGlubmVyIG1ldGhvZCAob3IgYW55IGRlc2NlbmRhbnRcbiAgICAgICAgICAgIC8vIG1pY3JvdGFzaywgZXZlbiBhZnRlciBgYXdhaXRgIGJvdW5kYXJpZXMgd2hlbiBvdGhlciBjYWxscyBhcmVcbiAgICAgICAgICAgIC8vIGFsc28gYWN0aXZlKSByb3V0ZXMgdG8gVEhJUyBzbG90IOKAlCBub3Qgd2hpY2hldmVyIHdhc1xuICAgICAgICAgICAgLy8gdG9wLW9mLXN0YWNrIGF0IHRoZSBtb21lbnQgdGhlIGxvZyBmaXJlZC4gRWxpbWluYXRlc1xuICAgICAgICAgICAgLy8gY3Jvc3MtY2FsbCBsZWFrYWdlIGZyb20gaW50ZXJsZWF2ZWQgYXN5bmMgcnVucy5cbiAgICAgICAgICAgIHJldHVybiBhd2FpdCBfY2FwdHVyZUFMUy5ydW4oc2xvdCwgYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGZuID0gbWV0aG9kc1ttZXRob2ROYW1lXTtcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGZuICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yOiBgcnVuV2l0aENhcHR1cmU6IG1ldGhvZCAke21ldGhvZE5hbWV9IG5vdCBmb3VuZGAsXG4gICAgICAgICAgICAgICAgICAgICAgICBjYXB0dXJlZExvZ3M6IHNsb3QuZW50cmllcyxcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZm4oLi4uKG1ldGhvZEFyZ3MgPz8gW10pKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdCAmJiB0eXBlb2YgcmVzdWx0ID09PSAnb2JqZWN0JyAmJiAhQXJyYXkuaXNBcnJheShyZXN1bHQpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4geyAuLi5yZXN1bHQsIGNhcHR1cmVkTG9nczogKHJlc3VsdCBhcyBhbnkpLmNhcHR1cmVkTG9ncyA/PyBzbG90LmVudHJpZXMgfTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBkYXRhOiByZXN1bHQsIGNhcHR1cmVkTG9nczogc2xvdC5lbnRyaWVzIH07XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhcHR1cmVkTG9nczogc2xvdC5lbnRyaWVzLFxuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgICAgX2FjdGl2ZVNsb3RDb3VudCA9IE1hdGgubWF4KDAsIF9hY3RpdmVTbG90Q291bnQgLSAxKTtcbiAgICAgICAgICAgIF9tYXliZVVuaG9va0NvbnNvbGUoKTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBBZGQgY29tcG9uZW50IHRvIGEgbm9kZVxuICAgICAqL1xuICAgIGFkZENvbXBvbmVudFRvTm9kZShub2RlVXVpZDogc3RyaW5nLCBjb21wb25lbnRUeXBlOiBzdHJpbmcpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IsIGpzIH0gPSByZXF1aXJlKCdjYycpO1xuICAgICAgICAgICAgY29uc3Qgc2NlbmUgPSBkaXJlY3Rvci5nZXRTY2VuZSgpO1xuICAgICAgICAgICAgaWYgKCFzY2VuZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ05vIGFjdGl2ZSBzY2VuZScgfTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gRmluZCBub2RlIGJ5IFVVSURcbiAgICAgICAgICAgIGNvbnN0IG5vZGUgPSBzY2VuZS5nZXRDaGlsZEJ5VXVpZChub2RlVXVpZCk7XG4gICAgICAgICAgICBpZiAoIW5vZGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBOb2RlIHdpdGggVVVJRCAke25vZGVVdWlkfSBub3QgZm91bmRgIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIEdldCBjb21wb25lbnQgY2xhc3NcbiAgICAgICAgICAgIGNvbnN0IENvbXBvbmVudENsYXNzID0ganMuZ2V0Q2xhc3NCeU5hbWUoY29tcG9uZW50VHlwZSk7XG4gICAgICAgICAgICBpZiAoIUNvbXBvbmVudENsYXNzKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgQ29tcG9uZW50IHR5cGUgJHtjb21wb25lbnRUeXBlfSBub3QgZm91bmRgIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIEFkZCBjb21wb25lbnRcbiAgICAgICAgICAgIGNvbnN0IGNvbXBvbmVudCA9IG5vZGUuYWRkQ29tcG9uZW50KENvbXBvbmVudENsYXNzKTtcbiAgICAgICAgICAgIHJldHVybiB7IFxuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsIFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBDb21wb25lbnQgJHtjb21wb25lbnRUeXBlfSBhZGRlZCBzdWNjZXNzZnVsbHlgLFxuICAgICAgICAgICAgICAgIGRhdGE6IHsgY29tcG9uZW50SWQ6IGNvbXBvbmVudC51dWlkIH1cbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3IubWVzc2FnZSB9O1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIENyZWF0ZSBhIG5ldyBub2RlXG4gICAgICovXG4gICAgY3JlYXRlTm9kZShuYW1lOiBzdHJpbmcsIHBhcmVudFV1aWQ/OiBzdHJpbmcpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IsIE5vZGUgfSA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgICAgICBpZiAoIXNjZW5lKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnTm8gYWN0aXZlIHNjZW5lJyB9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBub2RlID0gbmV3IE5vZGUobmFtZSk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmIChwYXJlbnRVdWlkKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcGFyZW50ID0gc2NlbmUuZ2V0Q2hpbGRCeVV1aWQocGFyZW50VXVpZCk7XG4gICAgICAgICAgICAgICAgaWYgKHBhcmVudCkge1xuICAgICAgICAgICAgICAgICAgICBwYXJlbnQuYWRkQ2hpbGQobm9kZSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgc2NlbmUuYWRkQ2hpbGQobm9kZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBzY2VuZS5hZGRDaGlsZChub2RlKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHsgXG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSwgXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogYE5vZGUgJHtuYW1lfSBjcmVhdGVkIHN1Y2Nlc3NmdWxseWAsXG4gICAgICAgICAgICAgICAgZGF0YTogeyB1dWlkOiBub2RlLnV1aWQsIG5hbWU6IG5vZGUubmFtZSB9XG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycm9yLm1lc3NhZ2UgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBHZXQgbm9kZSBpbmZvcm1hdGlvblxuICAgICAqL1xuICAgIGdldE5vZGVJbmZvKG5vZGVVdWlkOiBzdHJpbmcpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IgfSA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgICAgICBpZiAoIXNjZW5lKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnTm8gYWN0aXZlIHNjZW5lJyB9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBub2RlID0gc2NlbmUuZ2V0Q2hpbGRCeVV1aWQobm9kZVV1aWQpO1xuICAgICAgICAgICAgaWYgKCFub2RlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgTm9kZSB3aXRoIFVVSUQgJHtub2RlVXVpZH0gbm90IGZvdW5kYCB9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICB1dWlkOiBub2RlLnV1aWQsXG4gICAgICAgICAgICAgICAgICAgIG5hbWU6IG5vZGUubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgYWN0aXZlOiBub2RlLmFjdGl2ZSxcbiAgICAgICAgICAgICAgICAgICAgcG9zaXRpb246IG5vZGUucG9zaXRpb24sXG4gICAgICAgICAgICAgICAgICAgIHJvdGF0aW9uOiBub2RlLnJvdGF0aW9uLFxuICAgICAgICAgICAgICAgICAgICBzY2FsZTogbm9kZS5zY2FsZSxcbiAgICAgICAgICAgICAgICAgICAgcGFyZW50OiBub2RlLnBhcmVudD8udXVpZCxcbiAgICAgICAgICAgICAgICAgICAgY2hpbGRyZW46IG5vZGUuY2hpbGRyZW4ubWFwKChjaGlsZDogYW55KSA9PiBjaGlsZC51dWlkKSxcbiAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50czogbm9kZS5jb21wb25lbnRzLm1hcCgoY29tcDogYW55KSA9PiAoe1xuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogY29tcC5jb25zdHJ1Y3Rvci5uYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgZW5hYmxlZDogY29tcC5lbmFibGVkXG4gICAgICAgICAgICAgICAgICAgIH0pKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3IubWVzc2FnZSB9O1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEdldCBhbGwgbm9kZXMgaW4gc2NlbmVcbiAgICAgKi9cbiAgICBnZXRBbGxOb2RlcygpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IgfSA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgICAgICBpZiAoIXNjZW5lKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnTm8gYWN0aXZlIHNjZW5lJyB9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBub2RlczogYW55W10gPSBbXTtcbiAgICAgICAgICAgIGNvbnN0IGNvbGxlY3ROb2RlcyA9IChub2RlOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBub2Rlcy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgdXVpZDogbm9kZS51dWlkLFxuICAgICAgICAgICAgICAgICAgICBuYW1lOiBub2RlLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgIGFjdGl2ZTogbm9kZS5hY3RpdmUsXG4gICAgICAgICAgICAgICAgICAgIHBhcmVudDogbm9kZS5wYXJlbnQ/LnV1aWRcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBub2RlLmNoaWxkcmVuLmZvckVhY2goKGNoaWxkOiBhbnkpID0+IGNvbGxlY3ROb2RlcyhjaGlsZCkpO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgc2NlbmUuY2hpbGRyZW4uZm9yRWFjaCgoY2hpbGQ6IGFueSkgPT4gY29sbGVjdE5vZGVzKGNoaWxkKSk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IG5vZGVzIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3IubWVzc2FnZSB9O1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEZpbmQgbm9kZSBieSBuYW1lXG4gICAgICovXG4gICAgZmluZE5vZGVCeU5hbWUobmFtZTogc3RyaW5nKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCB7IGRpcmVjdG9yIH0gPSByZXF1aXJlKCdjYycpO1xuICAgICAgICAgICAgY29uc3Qgc2NlbmUgPSBkaXJlY3Rvci5nZXRTY2VuZSgpO1xuICAgICAgICAgICAgaWYgKCFzY2VuZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ05vIGFjdGl2ZSBzY2VuZScgfTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3Qgbm9kZSA9IHNjZW5lLmdldENoaWxkQnlOYW1lKG5hbWUpO1xuICAgICAgICAgICAgaWYgKCFub2RlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgTm9kZSB3aXRoIG5hbWUgJHtuYW1lfSBub3QgZm91bmRgIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIHV1aWQ6IG5vZGUudXVpZCxcbiAgICAgICAgICAgICAgICAgICAgbmFtZTogbm9kZS5uYW1lLFxuICAgICAgICAgICAgICAgICAgICBhY3RpdmU6IG5vZGUuYWN0aXZlLFxuICAgICAgICAgICAgICAgICAgICBwb3NpdGlvbjogbm9kZS5wb3NpdGlvblxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3IubWVzc2FnZSB9O1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEdldCBjdXJyZW50IHNjZW5lIGluZm9ybWF0aW9uXG4gICAgICovXG4gICAgZ2V0Q3VycmVudFNjZW5lSW5mbygpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IgfSA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgICAgICBpZiAoIXNjZW5lKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnTm8gYWN0aXZlIHNjZW5lJyB9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICBuYW1lOiBzY2VuZS5uYW1lLFxuICAgICAgICAgICAgICAgICAgICB1dWlkOiBzY2VuZS51dWlkLFxuICAgICAgICAgICAgICAgICAgICBub2RlQ291bnQ6IHNjZW5lLmNoaWxkcmVuLmxlbmd0aFxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3IubWVzc2FnZSB9O1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFNldCBub2RlIHByb3BlcnR5XG4gICAgICovXG4gICAgc2V0Tm9kZVByb3BlcnR5KG5vZGVVdWlkOiBzdHJpbmcsIHByb3BlcnR5OiBzdHJpbmcsIHZhbHVlOiBhbnkpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IgfSA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgICAgICBpZiAoIXNjZW5lKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnTm8gYWN0aXZlIHNjZW5lJyB9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBub2RlID0gc2NlbmUuZ2V0Q2hpbGRCeVV1aWQobm9kZVV1aWQpO1xuICAgICAgICAgICAgaWYgKCFub2RlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgTm9kZSB3aXRoIFVVSUQgJHtub2RlVXVpZH0gbm90IGZvdW5kYCB9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyDoqK3nva7lsazmgKdcbiAgICAgICAgICAgIGlmIChwcm9wZXJ0eSA9PT0gJ3Bvc2l0aW9uJykge1xuICAgICAgICAgICAgICAgIG5vZGUuc2V0UG9zaXRpb24odmFsdWUueCB8fCAwLCB2YWx1ZS55IHx8IDAsIHZhbHVlLnogfHwgMCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5ID09PSAncm90YXRpb24nKSB7XG4gICAgICAgICAgICAgICAgbm9kZS5zZXRSb3RhdGlvbkZyb21FdWxlcih2YWx1ZS54IHx8IDAsIHZhbHVlLnkgfHwgMCwgdmFsdWUueiB8fCAwKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHkgPT09ICdzY2FsZScpIHtcbiAgICAgICAgICAgICAgICBub2RlLnNldFNjYWxlKHZhbHVlLnggfHwgMSwgdmFsdWUueSB8fCAxLCB2YWx1ZS56IHx8IDEpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eSA9PT0gJ2FjdGl2ZScpIHtcbiAgICAgICAgICAgICAgICBub2RlLmFjdGl2ZSA9IHZhbHVlO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eSA9PT0gJ25hbWUnKSB7XG4gICAgICAgICAgICAgICAgbm9kZS5uYW1lID0gdmFsdWU7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIOWYl+ippuebtOaOpeioree9ruWxrOaAp1xuICAgICAgICAgICAgICAgIChub2RlIGFzIGFueSlbcHJvcGVydHldID0gdmFsdWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB7IFxuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsIFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBQcm9wZXJ0eSAnJHtwcm9wZXJ0eX0nIHVwZGF0ZWQgc3VjY2Vzc2Z1bGx5YCBcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3IubWVzc2FnZSB9O1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEdldCBzY2VuZSBoaWVyYXJjaHlcbiAgICAgKi9cbiAgICBnZXRTY2VuZUhpZXJhcmNoeShpbmNsdWRlQ29tcG9uZW50czogYm9vbGVhbiA9IGZhbHNlKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCB7IGRpcmVjdG9yIH0gPSByZXF1aXJlKCdjYycpO1xuICAgICAgICAgICAgY29uc3Qgc2NlbmUgPSBkaXJlY3Rvci5nZXRTY2VuZSgpO1xuICAgICAgICAgICAgaWYgKCFzY2VuZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ05vIGFjdGl2ZSBzY2VuZScgfTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgcHJvY2Vzc05vZGUgPSAobm9kZTogYW55KTogYW55ID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQ6IGFueSA9IHtcbiAgICAgICAgICAgICAgICAgICAgbmFtZTogbm9kZS5uYW1lLFxuICAgICAgICAgICAgICAgICAgICB1dWlkOiBub2RlLnV1aWQsXG4gICAgICAgICAgICAgICAgICAgIGFjdGl2ZTogbm9kZS5hY3RpdmUsXG4gICAgICAgICAgICAgICAgICAgIGNoaWxkcmVuOiBbXVxuICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgICBpZiAoaW5jbHVkZUNvbXBvbmVudHMpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0LmNvbXBvbmVudHMgPSBub2RlLmNvbXBvbmVudHMubWFwKChjb21wOiBhbnkpID0+ICh7XG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiBjb21wLmNvbnN0cnVjdG9yLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBlbmFibGVkOiBjb21wLmVuYWJsZWRcbiAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChub2RlLmNoaWxkcmVuICYmIG5vZGUuY2hpbGRyZW4ubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICByZXN1bHQuY2hpbGRyZW4gPSBub2RlLmNoaWxkcmVuLm1hcCgoY2hpbGQ6IGFueSkgPT4gcHJvY2Vzc05vZGUoY2hpbGQpKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgY29uc3QgaGllcmFyY2h5ID0gc2NlbmUuY2hpbGRyZW4ubWFwKChjaGlsZDogYW55KSA9PiBwcm9jZXNzTm9kZShjaGlsZCkpO1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogaGllcmFyY2h5IH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3IubWVzc2FnZSB9O1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIENyZWF0ZSBwcmVmYWIgYXNzZXQgZnJvbSBhIG5vZGUgdmlhIHRoZSBvZmZpY2lhbCBzY2VuZSBmYWNhZGUuXG4gICAgICpcbiAgICAgKiBSb3V0ZXMgdGhyb3VnaCBgY2NlLlByZWZhYi5jcmVhdGVQcmVmYWJgICh0aGUgQ29jb3MgZWRpdG9yIHByZWZhYlxuICAgICAqIG1hbmFnZXIgZXhwb3NlZCBpbiBzY2VuZS1zY3JpcHQgY29udGV4dCkuIFRoZSB1cmwgYWNjZXB0cyBib3RoXG4gICAgICogYGRiOi8vYXNzZXRzLy4uLmAgYW5kIGFic29sdXRlIGZpbGVzeXN0ZW0gcGF0aHMgaW4gZGlmZmVyZW50IGVkaXRvclxuICAgICAqIGJ1aWxkcywgc28gd2UgdHJ5IGJvdGggc2hhcGVzIGFuZCBzdXJmYWNlIHdoaWNoZXZlciBmYWlscy5cbiAgICAgKi9cbiAgICBhc3luYyBjcmVhdGVQcmVmYWJGcm9tTm9kZShub2RlVXVpZDogc3RyaW5nLCB1cmw6IHN0cmluZykge1xuICAgICAgICBjb25zdCBwcmVmYWJNZ3IgPSBnZXRQcmVmYWJGYWNhZGUoKTtcbiAgICAgICAgaWYgKCFwcmVmYWJNZ3Iub2spIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogcHJlZmFiTWdyLmVycm9yIH07XG4gICAgICAgIH1cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHRyaWVzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICAgICAgLy8gUHJlZmVyIGRiOi8vIGZvcm0gKG1hdGNoZXMgYXNzZXQtZGIgcXVlcnkgcmVzdWx0cykgYW5kIGZhbGxcbiAgICAgICAgICAgIC8vIGJhY2sgdG8gd2hhdGV2ZXIgdGhlIGNhbGxlciBwYXNzZWQgdmVyYmF0aW0uXG4gICAgICAgICAgICBjb25zdCBkYlVybCA9IHVybC5zdGFydHNXaXRoKCdkYjovLycpID8gdXJsIDogYGRiOi8vYXNzZXRzLyR7dXJsLnJlcGxhY2UoL15cXC8rLywgJycpfWA7XG4gICAgICAgICAgICB0cmllcy5wdXNoKGRiVXJsKTtcbiAgICAgICAgICAgIGlmIChkYlVybCAhPT0gdXJsKSB7XG4gICAgICAgICAgICAgICAgdHJpZXMucHVzaCh1cmwpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBlcnJvcnM6IHN0cmluZ1tdID0gW107XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGNhbmRpZGF0ZSBvZiB0cmllcykge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHByZWZhYk1nci52YWx1ZS5jcmVhdGVQcmVmYWIobm9kZVV1aWQsIGNhbmRpZGF0ZSk7XG4gICAgICAgICAgICAgICAgICAgIC8vIGNjZS5QcmVmYWIuY3JlYXRlUHJlZmFiIHJlcHVycG9zZXMgdGhlIHNvdXJjZSBub2RlIGludG8gYVxuICAgICAgICAgICAgICAgICAgICAvLyBwcmVmYWIgaW5zdGFuY2Ugd2l0aCBhIGZyZXNoIFVVSUQsIHNvIHRoZSBjYWxsZXItc3VwcGxpZWRcbiAgICAgICAgICAgICAgICAgICAgLy8gbm9kZVV1aWQgaXMgbm8gbG9uZ2VyIHZhbGlkLiBSZXNvbHZlIHRoZSBuZXcgVVVJRCBieVxuICAgICAgICAgICAgICAgICAgICAvLyBxdWVyeWluZyBub2RlcyB0aGF0IHJlZmVyZW5jZSB0aGUgZnJlc2hseSBtaW50ZWQgYXNzZXQuXG4gICAgICAgICAgICAgICAgICAgIGxldCBhc3NldFV1aWQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICAgICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHJlc3VsdCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFzc2V0VXVpZCA9IHJlc3VsdDtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChyZXN1bHQgJiYgdHlwZW9mIHJlc3VsdCA9PT0gJ29iamVjdCcgJiYgdHlwZW9mIChyZXN1bHQgYXMgYW55KS51dWlkID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXNzZXRVdWlkID0gKHJlc3VsdCBhcyBhbnkpLnV1aWQ7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgbGV0IGluc3RhbmNlTm9kZVV1aWQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICAgICAgICAgICAgICAgICAgICBpZiAoYXNzZXRVdWlkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGluc3RhbmNlczogYW55ID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktbm9kZXMtYnktYXNzZXQtdXVpZCcsIGFzc2V0VXVpZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoaW5zdGFuY2VzKSAmJiBpbnN0YW5jZXMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBOZXdseS1jcmVhdGVkIHByZWZhYiBpbnN0YW5jZSBpcyB0eXBpY2FsbHkgdGhlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGxhc3QgZW50cnkuIENhdmVhdDogaWYgdGhlIHNhbWUgYXNzZXQgYWxyZWFkeVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBoYWQgaW5zdGFuY2VzIGluIHRoZSBzY2VuZSwgXCJsYXN0XCIgcGlja3Mgb25lXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIG9mIHRoZW0gcmF0aGVyIHRoYW4gdGhlIG5ldyBvbmUuIFRoZSBlZGl0b3JcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gYXBwZWFycyB0byByZXR1cm4gY3JlYXRpb24gb3JkZXIsIGJ1dCB0aGUgQVBJXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGlzIHVuZG9jdW1lbnRlZDsgY2FsbGVycyByZXF1aXJpbmcgc3RyaWN0XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGlkZW50aWZpY2F0aW9uIHNob3VsZCBzbmFwc2hvdCBiZWZvcmUgY2FsbGluZy5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaW5zdGFuY2VOb2RlVXVpZCA9IGluc3RhbmNlc1tpbnN0YW5jZXMubGVuZ3RoIC0gMV07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gTm9uLWZhdGFsOiB0aGUgYXNzZXQgd2FzIGNyZWF0ZWQgZWl0aGVyIHdheS5cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB1cmw6IGNhbmRpZGF0ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzb3VyY2VOb2RlVXVpZDogbm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJlZmFiQXNzZXRVdWlkOiBhc3NldFV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaW5zdGFuY2VOb2RlVXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByYXc6IHJlc3VsdCxcbiAgICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgICAgICAgICAgZXJyb3JzLnB1c2goYCR7Y2FuZGlkYXRlfTogJHtlcnI/Lm1lc3NhZ2UgPz8gZXJyfWApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgZXJyb3I6IGBjY2UuUHJlZmFiLmNyZWF0ZVByZWZhYiBmYWlsZWQ6ICR7ZXJyb3JzLmpvaW4oJzsgJyl9YCxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3I/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycm9yKSB9O1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFB1c2ggcHJlZmFiIGluc3RhbmNlIGVkaXRzIGJhY2sgdG8gdGhlIHByZWZhYiBhc3NldC5cbiAgICAgKiBXcmFwcyBzY2VuZSBmYWNhZGUgYGFwcGx5UHJlZmFiKG5vZGVVdWlkKWAuXG4gICAgICovXG4gICAgYXN5bmMgYXBwbHlQcmVmYWIobm9kZVV1aWQ6IHN0cmluZykge1xuICAgICAgICBjb25zdCBwcmVmYWJNZ3IgPSBnZXRQcmVmYWJGYWNhZGUoKTtcbiAgICAgICAgaWYgKCFwcmVmYWJNZ3Iub2spIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogcHJlZmFiTWdyLmVycm9yIH07XG4gICAgICAgIH1cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIE5vdGU6IGZhY2FkZVJldHVybiBmcm9tIGNjZS5TY2VuZUZhY2FkZU1hbmFnZXIuYXBwbHlQcmVmYWIgaXNcbiAgICAgICAgICAgIC8vIG9ic2VydmVkIHRvIGJlIGBmYWxzZWAgZXZlbiB3aGVuIHRoZSBhcHBseSBnZW51aW5lbHkgd3JpdGVzXG4gICAgICAgICAgICAvLyB0byBkaXNrICh2ZXJpZmllZCBkdXJpbmcgUDQgdjIuMS4wIHJlYWwtZWRpdG9yIHRlc3RpbmcpLlxuICAgICAgICAgICAgLy8gVHJlYXQgXCJubyBleGNlcHRpb24gdGhyb3duXCIgYXMgc3VjY2VzcyBhbmQgc3VyZmFjZSB0aGUgcmF3XG4gICAgICAgICAgICAvLyByZXR1cm4gdmFsdWUgYXMgbWV0YWRhdGEgb25seS5cbiAgICAgICAgICAgIC8vICh2Mi45LnggcG9saXNoIOKAlCBHZW1pbmkgcjEgc2luZ2xlLfCfn6EgZnJvbSB2Mi44LjEgcmV2aWV3OlxuICAgICAgICAgICAgLy8gY2Fub25pY2FsIG5hbWUgaXMgU2NlbmVGYWNhZGVNYW5hZ2VyOyBjY2UuU2NlbmVGYWNhZGUgaXNcbiAgICAgICAgICAgIC8vIHRoZSB0eXBlLWRvYyBhbGlhcy4gVXNlIFNjZW5lRmFjYWRlTWFuYWdlciB0aHJvdWdob3V0XG4gICAgICAgICAgICAvLyBjb21tZW50cyBzbyB0aGUgcnVudGltZSBpZGVudGl0eSBpcyB1bmFtYmlndW91cy4pXG4gICAgICAgICAgICBjb25zdCBmYWNhZGVSZXR1cm4gPSBhd2FpdCBwcmVmYWJNZ3IudmFsdWUuYXBwbHlQcmVmYWIobm9kZVV1aWQpO1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogeyBmYWNhZGVSZXR1cm4sIG5vZGVVdWlkIH0gfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvcj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyb3IpIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQ29ubmVjdCBhIHJlZ3VsYXIgbm9kZSB0byBhIHByZWZhYiBhc3NldCAobGluaykuXG4gICAgICogV3JhcHMgc2NlbmUgZmFjYWRlIGBsaW5rUHJlZmFiKG5vZGVVdWlkLCBhc3NldFV1aWQpYC5cbiAgICAgKi9cbiAgICBhc3luYyBsaW5rUHJlZmFiKG5vZGVVdWlkOiBzdHJpbmcsIGFzc2V0VXVpZDogc3RyaW5nKSB7XG4gICAgICAgIGNvbnN0IHByZWZhYk1nciA9IGdldFByZWZhYkZhY2FkZSgpO1xuICAgICAgICBpZiAoIXByZWZhYk1nci5vaykge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBwcmVmYWJNZ3IuZXJyb3IgfTtcbiAgICAgICAgfVxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgcHJlZmFiTWdyLnZhbHVlLmxpbmtQcmVmYWIobm9kZVV1aWQsIGFzc2V0VXVpZCk7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBkYXRhOiB7IGxpbmtlZDogcmVzdWx0LCBub2RlVXVpZCwgYXNzZXRVdWlkIH0gfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvcj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyb3IpIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQnJlYWsgdGhlIHByZWZhYiBjb25uZWN0aW9uIG9uIGEgbm9kZS5cbiAgICAgKiBXcmFwcyBzY2VuZSBmYWNhZGUgYHVubGlua1ByZWZhYihub2RlVXVpZCwgcmVtb3ZlTmVzdGVkKWAuXG4gICAgICovXG4gICAgYXN5bmMgdW5saW5rUHJlZmFiKG5vZGVVdWlkOiBzdHJpbmcsIHJlbW92ZU5lc3RlZDogYm9vbGVhbikge1xuICAgICAgICBjb25zdCBwcmVmYWJNZ3IgPSBnZXRQcmVmYWJGYWNhZGUoKTtcbiAgICAgICAgaWYgKCFwcmVmYWJNZ3Iub2spIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogcHJlZmFiTWdyLmVycm9yIH07XG4gICAgICAgIH1cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHByZWZhYk1nci52YWx1ZS51bmxpbmtQcmVmYWIobm9kZVV1aWQsIHJlbW92ZU5lc3RlZCk7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBkYXRhOiB7IHVubGlua2VkOiByZXN1bHQsIG5vZGVVdWlkLCByZW1vdmVOZXN0ZWQgfSB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycm9yPy5tZXNzYWdlID8/IFN0cmluZyhlcnJvcikgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBSZWFkIHRoZSBwcmVmYWIgZHVtcCBmb3IgYSBwcmVmYWIgaW5zdGFuY2Ugbm9kZS5cbiAgICAgKiBXcmFwcyBzY2VuZSBmYWNhZGUgYGdldFByZWZhYkRhdGEobm9kZVV1aWQpYC5cbiAgICAgKi9cbiAgICBnZXRQcmVmYWJEYXRhKG5vZGVVdWlkOiBzdHJpbmcpIHtcbiAgICAgICAgY29uc3QgcHJlZmFiTWdyID0gZ2V0UHJlZmFiRmFjYWRlKCk7XG4gICAgICAgIGlmICghcHJlZmFiTWdyLm9rKSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHByZWZhYk1nci5lcnJvciB9O1xuICAgICAgICB9XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBkYXRhID0gcHJlZmFiTWdyLnZhbHVlLmdldFByZWZhYkRhdGEobm9kZVV1aWQpO1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZGF0YSB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycm9yPy5tZXNzYWdlID8/IFN0cmluZyhlcnJvcikgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBBcHBlbmQgYSBjYy5FdmVudEhhbmRsZXIgZW50cnkgdG8gYSBjb21wb25lbnQncyBldmVudCBhcnJheVxuICAgICAqIChlLmcuIGNjLkJ1dHRvbi5jbGlja0V2ZW50cywgY2MuVG9nZ2xlLmNoZWNrRXZlbnRzKS5cbiAgICAgKlxuICAgICAqIFBlcnNpc3RlbmNlIG5vdGUgKENMQVVERS5tZCBMYW5kbWluZSAjMTEpOiBzY2VuZS1zY3JpcHQgYGFyci5wdXNoYFxuICAgICAqIG9ubHkgbXV0YXRlcyB0aGUgcnVudGltZSBjYy5Db21wb25lbnQgaW5zdGFuY2U7IHRoZSBlZGl0b3Inc1xuICAgICAqIHNlcmlhbGl6YXRpb24gbW9kZWwgKHdoYXQgYHNhdmUtc2NlbmVgIHdyaXRlcyB0byBkaXNrKSBkb2VzIG5vdCBzZWVcbiAgICAgKiB0aGUgY2hhbmdlLiBUaGUgaG9zdC1zaWRlIGNhbGxlciAoYGNvbXBvbmVudC10b29scy50c2ApIGlzXG4gICAgICogcmVzcG9uc2libGUgZm9yIG51ZGdpbmcgdGhlIG1vZGVsIGFmdGVyd2FyZHMgdmlhIGEgbm8tb3BcbiAgICAgKiBgc2V0LXByb3BlcnR5YCBvbiBhIGNvbXBvbmVudCBmaWVsZCDigJQgY2FsbGluZyBgc2V0LXByb3BlcnR5YCBmcm9tXG4gICAgICogaGVyZSBkb2Vzbid0IHByb3BhZ2F0ZSAoc2NlbmUtcHJvY2VzcyBJUEMgc2hvcnQtY2lyY3VpdHMgYW5kXG4gICAgICogc2tpcHMgdGhlIG1vZGVsIHN5bmMpLiBXZSBzdXJmYWNlIGBjb21wb25lbnRVdWlkYCBhbmRcbiAgICAgKiBgY29tcG9uZW50RW5hYmxlZGAgc28gdGhlIGNhbGxlciBoYXMgd2hhdCBpdCBuZWVkcy5cbiAgICAgKi9cbiAgICBhZGRFdmVudEhhbmRsZXIoXG4gICAgICAgIG5vZGVVdWlkOiBzdHJpbmcsXG4gICAgICAgIGNvbXBvbmVudFR5cGU6IHN0cmluZyxcbiAgICAgICAgZXZlbnRBcnJheVByb3BlcnR5OiBzdHJpbmcsXG4gICAgICAgIHRhcmdldFV1aWQ6IHN0cmluZyxcbiAgICAgICAgY29tcG9uZW50TmFtZTogc3RyaW5nLFxuICAgICAgICBoYW5kbGVyOiBzdHJpbmcsXG4gICAgICAgIGN1c3RvbUV2ZW50RGF0YT86IHN0cmluZyxcbiAgICApIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGNjID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IGN0eCA9IHJlc29sdmVDb21wb25lbnRDb250ZXh0KG5vZGVVdWlkLCBjb21wb25lbnRUeXBlKTtcbiAgICAgICAgICAgIGlmICghY3R4Lm9rKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBjdHguZXJyb3IgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHRhcmdldE5vZGUgPSBmaW5kTm9kZUJ5VXVpZERlZXAoY3R4LnNjZW5lLCB0YXJnZXRVdWlkKTtcbiAgICAgICAgICAgIGlmICghdGFyZ2V0Tm9kZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYFRhcmdldCBub2RlIHdpdGggVVVJRCAke3RhcmdldFV1aWR9IG5vdCBmb3VuZGAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGFyciA9IGN0eC5jb21wb25lbnRbZXZlbnRBcnJheVByb3BlcnR5XTtcbiAgICAgICAgICAgIGlmICghQXJyYXkuaXNBcnJheShhcnIpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgUHJvcGVydHkgJyR7ZXZlbnRBcnJheVByb3BlcnR5fScgb24gJHtjb21wb25lbnRUeXBlfSBpcyBub3QgYW4gYXJyYXkgKGdvdCAke3R5cGVvZiBhcnJ9KWAgfTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgZWggPSBuZXcgY2MuRXZlbnRIYW5kbGVyKCk7XG4gICAgICAgICAgICBlaC50YXJnZXQgPSB0YXJnZXROb2RlO1xuICAgICAgICAgICAgZWguY29tcG9uZW50ID0gY29tcG9uZW50TmFtZTtcbiAgICAgICAgICAgIGVoLmhhbmRsZXIgPSBoYW5kbGVyO1xuICAgICAgICAgICAgZWguY3VzdG9tRXZlbnREYXRhID0gY3VzdG9tRXZlbnREYXRhID8/ICcnO1xuICAgICAgICAgICAgYXJyLnB1c2goZWgpO1xuXG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5zZW5kKCdzY2VuZScsICdzbmFwc2hvdCcpO1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgaW5kZXg6IGFyci5sZW5ndGggLSAxLFxuICAgICAgICAgICAgICAgICAgICBjb3VudDogYXJyLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50VXVpZDogY3R4LmNvbXBvbmVudC51dWlkLFxuICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRFbmFibGVkOiBjdHguY29tcG9uZW50LmVuYWJsZWQgIT09IGZhbHNlLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycm9yPy5tZXNzYWdlID8/IFN0cmluZyhlcnJvcikgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBSZW1vdmUgYSBjYy5FdmVudEhhbmRsZXIgZW50cnkgYnkgaW5kZXgsIG9yIGJ5IG1hdGNoaW5nXG4gICAgICogKHRhcmdldFV1aWQsIGhhbmRsZXIpIHBhaXIuIElmIGJvdGggYXJlIHByb3ZpZGVkLCBpbmRleCB3aW5zLlxuICAgICAqXG4gICAgICogU2VlIGFkZEV2ZW50SGFuZGxlciBmb3IgdGhlIHBlcnNpc3RlbmNlIG5vdGUuIENhbGxlciBtdXN0IGZvbGxvdyB1cFxuICAgICAqIHdpdGggYSBob3N0LXNpZGUgYHNldC1wcm9wZXJ0eWAgbnVkZ2UgdXNpbmcgdGhlIHJldHVybmVkXG4gICAgICogYGNvbXBvbmVudFV1aWRgIC8gYGNvbXBvbmVudEVuYWJsZWRgIHRvIG1ha2UgdGhlIGNoYW5nZSB2aXNpYmxlIHRvXG4gICAgICogYHNhdmUtc2NlbmVgLlxuICAgICAqL1xuICAgIHJlbW92ZUV2ZW50SGFuZGxlcihcbiAgICAgICAgbm9kZVV1aWQ6IHN0cmluZyxcbiAgICAgICAgY29tcG9uZW50VHlwZTogc3RyaW5nLFxuICAgICAgICBldmVudEFycmF5UHJvcGVydHk6IHN0cmluZyxcbiAgICAgICAgaW5kZXg6IG51bWJlciB8IG51bGwsXG4gICAgICAgIHRhcmdldFV1aWQ6IHN0cmluZyB8IG51bGwsXG4gICAgICAgIGhhbmRsZXI6IHN0cmluZyB8IG51bGwsXG4gICAgKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBjdHggPSByZXNvbHZlQ29tcG9uZW50Q29udGV4dChub2RlVXVpZCwgY29tcG9uZW50VHlwZSk7XG4gICAgICAgICAgICBpZiAoIWN0eC5vaykge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogY3R4LmVycm9yIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBhcnIgPSBjdHguY29tcG9uZW50W2V2ZW50QXJyYXlQcm9wZXJ0eV07XG4gICAgICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkoYXJyKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYFByb3BlcnR5ICcke2V2ZW50QXJyYXlQcm9wZXJ0eX0nIG9uICR7Y29tcG9uZW50VHlwZX0gaXMgbm90IGFuIGFycmF5YCB9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBUcmltIGFyb3VuZCBjb21wYXJpc29ucyBzbyBjYWxsZXJzIHBhc3NpbmcgVVVJRHMgLyBoYW5kbGVyXG4gICAgICAgICAgICAvLyBuYW1lcyB3aXRoIGxlYWRpbmcvdHJhaWxpbmcgd2hpdGVzcGFjZSAoTExNIHRvb2wgYXJncyBvZnRlblxuICAgICAgICAgICAgLy8gY29tZSB3aXRoIHN0cmF5IHNwYWNlcykgc3RpbGwgZmluZCBhIG1hdGNoLiBDcnVjaWFsOiB0aGVcbiAgICAgICAgICAgIC8vIG91dGVyIGd1YXJkIHRlc3RzIHRoZSAqdHJpbW1lZCogdmFsdWVzIHRvbyDigJQgb3RoZXJ3aXNlIGFcbiAgICAgICAgICAgIC8vIHdoaXRlc3BhY2Utb25seSB0YXJnZXRVdWlkL2hhbmRsZXIgd291bGQgcGFzcyBhcyB0cnV0aHksXG4gICAgICAgICAgICAvLyBjb2xsYXBzZSB0byBudWxsIGFmdGVyIHRyaW0sIGFuZCB0aGUgcHJlZGljYXRlIHdvdWxkIG1hdGNoXG4gICAgICAgICAgICAvLyBldmVyeSBlbnRyeSB2YWN1b3VzbHksIHNpbGVudGx5IGRlbGV0aW5nIGFyclswXS5cbiAgICAgICAgICAgIGNvbnN0IHRhcmdldFV1aWROb3JtID0gdGFyZ2V0VXVpZD8udHJpbSgpIHx8IG51bGw7XG4gICAgICAgICAgICBjb25zdCBoYW5kbGVyTm9ybSA9IGhhbmRsZXI/LnRyaW0oKSB8fCBudWxsO1xuICAgICAgICAgICAgbGV0IHJlbW92ZUF0ID0gLTE7XG4gICAgICAgICAgICBpZiAodHlwZW9mIGluZGV4ID09PSAnbnVtYmVyJyAmJiBpbmRleCA+PSAwKSB7XG4gICAgICAgICAgICAgICAgcmVtb3ZlQXQgPSBpbmRleDtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodGFyZ2V0VXVpZE5vcm0gfHwgaGFuZGxlck5vcm0pIHtcbiAgICAgICAgICAgICAgICByZW1vdmVBdCA9IGFyci5maW5kSW5kZXgoKGVoOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZWhUYXJnZXRVdWlkID0gdHlwZW9mIGVoPy50YXJnZXQ/LnV1aWQgPT09ICdzdHJpbmcnID8gZWgudGFyZ2V0LnV1aWQudHJpbSgpIDogZWg/LnRhcmdldD8udXVpZDtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZWhIYW5kbGVyID0gdHlwZW9mIGVoPy5oYW5kbGVyID09PSAnc3RyaW5nJyA/IGVoLmhhbmRsZXIudHJpbSgpIDogZWg/LmhhbmRsZXI7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG1hdGNoZXNUYXJnZXQgPSAhdGFyZ2V0VXVpZE5vcm0gfHwgZWhUYXJnZXRVdWlkID09PSB0YXJnZXRVdWlkTm9ybTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbWF0Y2hlc0hhbmRsZXIgPSAhaGFuZGxlck5vcm0gfHwgZWhIYW5kbGVyID09PSBoYW5kbGVyTm9ybTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG1hdGNoZXNUYXJnZXQgJiYgbWF0Y2hlc0hhbmRsZXI7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocmVtb3ZlQXQgPCAwIHx8IHJlbW92ZUF0ID49IGFyci5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdObyBtYXRjaGluZyBldmVudCBoYW5kbGVyIHRvIHJlbW92ZScgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHJlbW92ZWQgPSBhcnIuc3BsaWNlKHJlbW92ZUF0LCAxKVswXTtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnNlbmQoJ3NjZW5lJywgJ3NuYXBzaG90Jyk7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICBpbmRleDogcmVtb3ZlQXQsXG4gICAgICAgICAgICAgICAgICAgIHJlbWFpbmluZzogYXJyLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgcmVtb3ZlZDogc2VyaWFsaXplRXZlbnRIYW5kbGVyKHJlbW92ZWQpLFxuICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRVdWlkOiBjdHguY29tcG9uZW50LnV1aWQsXG4gICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudEVuYWJsZWQ6IGN0eC5jb21wb25lbnQuZW5hYmxlZCAhPT0gZmFsc2UsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3I/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycm9yKSB9O1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEluc3BlY3QgYSBjb21wb25lbnQncyBFdmVudEhhbmRsZXIgYXJyYXkgKHJlYWQtb25seSkuXG4gICAgICovXG4gICAgbGlzdEV2ZW50SGFuZGxlcnMobm9kZVV1aWQ6IHN0cmluZywgY29tcG9uZW50VHlwZTogc3RyaW5nLCBldmVudEFycmF5UHJvcGVydHk6IHN0cmluZykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgY3R4ID0gcmVzb2x2ZUNvbXBvbmVudENvbnRleHQobm9kZVV1aWQsIGNvbXBvbmVudFR5cGUpO1xuICAgICAgICAgICAgaWYgKCFjdHgub2spIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGN0eC5lcnJvciB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgYXJyID0gY3R4LmNvbXBvbmVudFtldmVudEFycmF5UHJvcGVydHldO1xuICAgICAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KGFycikpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBQcm9wZXJ0eSAnJHtldmVudEFycmF5UHJvcGVydHl9JyBvbiAke2NvbXBvbmVudFR5cGV9IGlzIG5vdCBhbiBhcnJheWAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIGNvdW50OiBhcnIubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICBoYW5kbGVyczogYXJyLm1hcChzZXJpYWxpemVFdmVudEhhbmRsZXIpLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycm9yPy5tZXNzYWdlID8/IFN0cmluZyhlcnJvcikgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiB2Mi40LjggQTI6IGNjLkFuaW1hdGlvbiBkcml2ZXJzIOKAlCBzZWUgc291cmNlL3Rvb2xzL2FuaW1hdGlvbi10b29scy50cy5cbiAgICAgKiBJbXBsZW1lbnRhdGlvbiBub3RlOiBjb2NvcyBleHBvc2VzIHRoZSBlbmdpbmUncyBgY2MuQW5pbWF0aW9uYCAoYW5kXG4gICAgICogaXRzIHN1Yi1jbGFzc2VzIHZpYSBganMuZ2V0Q2xhc3NCeU5hbWVgKS4gV2UgdXNlIHRoZSBydW50aW1lIEFQSVxuICAgICAqIChgZ2V0Q29tcG9uZW50KCdjYy5BbmltYXRpb24nKWApIHJhdGhlciB0aGFuIHRoZSBlZGl0b3IncyBzZXQtcHJvcGVydHlcbiAgICAgKiBjaGFubmVsIGJlY2F1c2UgdGhlIGxhdHRlciB3b3VsZCBvbmx5IHBlcnNpc3QgZGVmYXVsdENsaXAgLyBwbGF5T25Mb2FkXG4gICAgICogYnV0IGNhbm5vdCB0cmlnZ2VyIHBsYXkoKS9zdG9wKCkg4oCUIHRob3NlIGFyZSBydW50aW1lIG1ldGhvZHMgb25seS5cbiAgICAgKi9cbiAgICBnZXRBbmltYXRpb25DbGlwcyhub2RlVXVpZDogc3RyaW5nKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCB7IGRpcmVjdG9yIH0gPSByZXF1aXJlKCdjYycpO1xuICAgICAgICAgICAgY29uc3Qgc2NlbmUgPSBkaXJlY3Rvci5nZXRTY2VuZSgpO1xuICAgICAgICAgICAgaWYgKCFzY2VuZSkgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnTm8gYWN0aXZlIHNjZW5lJyB9O1xuICAgICAgICAgICAgY29uc3Qgbm9kZSA9IGZpbmROb2RlQnlVdWlkRGVlcChzY2VuZSwgbm9kZVV1aWQpO1xuICAgICAgICAgICAgaWYgKCFub2RlKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBOb2RlICR7bm9kZVV1aWR9IG5vdCBmb3VuZGAgfTtcbiAgICAgICAgICAgIGNvbnN0IGFuaW0gPSBub2RlLmdldENvbXBvbmVudCgnY2MuQW5pbWF0aW9uJyk7XG4gICAgICAgICAgICBpZiAoIWFuaW0pIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBOb2RlICR7bm9kZVV1aWR9IGhhcyBubyBjYy5BbmltYXRpb24gY29tcG9uZW50YCB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgY2xpcHM6IGFueVtdID0gYW5pbS5jbGlwcyA/PyBbXTtcbiAgICAgICAgICAgIGNvbnN0IGRlZmF1bHRDbGlwTmFtZSA9IGFuaW0uZGVmYXVsdENsaXA/Lm5hbWUgPz8gbnVsbDtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIG5vZGVVdWlkLFxuICAgICAgICAgICAgICAgICAgICBub2RlTmFtZTogbm9kZS5uYW1lLFxuICAgICAgICAgICAgICAgICAgICBkZWZhdWx0Q2xpcDogZGVmYXVsdENsaXBOYW1lLFxuICAgICAgICAgICAgICAgICAgICBwbGF5T25Mb2FkOiBhbmltLnBsYXlPbkxvYWQgPT09IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIGNsaXBzOiBjbGlwcy5maWx0ZXIoYyA9PiBjKS5tYXAoYyA9PiAoe1xuICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogYy5uYW1lID8/IG51bGwsXG4gICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiBjLl91dWlkID8/IGMudXVpZCA/PyBudWxsLFxuICAgICAgICAgICAgICAgICAgICAgICAgZHVyYXRpb246IHR5cGVvZiBjLmR1cmF0aW9uID09PSAnbnVtYmVyJyA/IGMuZHVyYXRpb24gOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICAgICAgd3JhcE1vZGU6IGMud3JhcE1vZGUgPz8gbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgfSkpLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycm9yPy5tZXNzYWdlID8/IFN0cmluZyhlcnJvcikgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICBsaXN0QW5pbWF0aW9uU3RhdGVzKG5vZGVVdWlkOiBzdHJpbmcpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IgfSA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgICAgICBpZiAoIXNjZW5lKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdObyBhY3RpdmUgc2NlbmUnIH07XG4gICAgICAgICAgICBjb25zdCBub2RlID0gZmluZE5vZGVCeVV1aWREZWVwKHNjZW5lLCBub2RlVXVpZCk7XG4gICAgICAgICAgICBpZiAoIW5vZGUpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYE5vZGUgJHtub2RlVXVpZH0gbm90IGZvdW5kYCB9O1xuICAgICAgICAgICAgY29uc3QgYW5pbSA9IG5vZGUuZ2V0Q29tcG9uZW50KCdjYy5BbmltYXRpb24nKTtcbiAgICAgICAgICAgIGlmICghYW5pbSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYE5vZGUgJHtub2RlVXVpZH0gaGFzIG5vIGNjLkFuaW1hdGlvbiBjb21wb25lbnRgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBjbGlwczogYW55W10gPSB0eXBlb2YgYW5pbS5nZXRBbmltYXRpb25DbGlwcyA9PT0gJ2Z1bmN0aW9uJ1xuICAgICAgICAgICAgICAgID8gYW5pbS5nZXRBbmltYXRpb25DbGlwcygpXG4gICAgICAgICAgICAgICAgOiAoYW5pbS5jbGlwcyA/PyBbXSk7XG4gICAgICAgICAgICBjb25zdCBzdGF0ZXMgPSBjbGlwc1xuICAgICAgICAgICAgICAgIC5maWx0ZXIoKGNsaXA6IGFueSkgPT4gY2xpcD8ubmFtZSlcbiAgICAgICAgICAgICAgICAubWFwKChjbGlwOiBhbnkpID0+IGFuaW0uZ2V0U3RhdGUoY2xpcC5uYW1lKSlcbiAgICAgICAgICAgICAgICAuZmlsdGVyKChzdGF0ZTogYW55KSA9PiBzdGF0ZSlcbiAgICAgICAgICAgICAgICAubWFwKChzdGF0ZTogYW55KSA9PiAoe1xuICAgICAgICAgICAgICAgICAgICBuYW1lOiBzdGF0ZS5uYW1lID8/IG51bGwsXG4gICAgICAgICAgICAgICAgICAgIHNwZWVkOiB0eXBlb2Ygc3RhdGUuc3BlZWQgPT09ICdudW1iZXInID8gc3RhdGUuc3BlZWQgOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICB0b3RhbFRpbWU6IHR5cGVvZiBzdGF0ZS50b3RhbFRpbWUgPT09ICdudW1iZXInID8gc3RhdGUudG90YWxUaW1lIDogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgY3VycmVudFRpbWU6IHR5cGVvZiBzdGF0ZS5jdXJyZW50VGltZSA9PT0gJ251bWJlcicgPyBzdGF0ZS5jdXJyZW50VGltZSA6IG51bGwsXG4gICAgICAgICAgICAgICAgICAgIGlzUGxheWluZzogc3RhdGUuaXNQbGF5aW5nID09PSB0cnVlLFxuICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IHN0YXRlcyB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycm9yPy5tZXNzYWdlID8/IFN0cmluZyhlcnJvcikgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICBnZXRBbmltYXRpb25TdGF0ZUluZm8obm9kZVV1aWQ6IHN0cmluZywgc3RhdGVOYW1lOiBzdHJpbmcpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IgfSA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgICAgICBpZiAoIXNjZW5lKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdObyBhY3RpdmUgc2NlbmUnIH07XG4gICAgICAgICAgICBjb25zdCBub2RlID0gZmluZE5vZGVCeVV1aWREZWVwKHNjZW5lLCBub2RlVXVpZCk7XG4gICAgICAgICAgICBpZiAoIW5vZGUpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYE5vZGUgJHtub2RlVXVpZH0gbm90IGZvdW5kYCB9O1xuICAgICAgICAgICAgY29uc3QgYW5pbSA9IG5vZGUuZ2V0Q29tcG9uZW50KCdjYy5BbmltYXRpb24nKTtcbiAgICAgICAgICAgIGlmICghYW5pbSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYE5vZGUgJHtub2RlVXVpZH0gaGFzIG5vIGNjLkFuaW1hdGlvbiBjb21wb25lbnRgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBzdGF0ZSA9IGFuaW0uZ2V0U3RhdGUoc3RhdGVOYW1lKTtcbiAgICAgICAgICAgIGlmICghc3RhdGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBBbmltYXRpb24gc3RhdGUgJyR7c3RhdGVOYW1lfScgbm90IGZvdW5kYCB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgc3BlZWQ6IHR5cGVvZiBzdGF0ZS5zcGVlZCA9PT0gJ251bWJlcicgPyBzdGF0ZS5zcGVlZCA6IG51bGwsXG4gICAgICAgICAgICAgICAgICAgIGlzUGxheWluZzogc3RhdGUuaXNQbGF5aW5nID09PSB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBjdXJyZW50VGltZTogdHlwZW9mIHN0YXRlLmN1cnJlbnRUaW1lID09PSAnbnVtYmVyJyA/IHN0YXRlLmN1cnJlbnRUaW1lIDogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgdG90YWxUaW1lOiB0eXBlb2Ygc3RhdGUudG90YWxUaW1lID09PSAnbnVtYmVyJyA/IHN0YXRlLnRvdGFsVGltZSA6IG51bGwsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3I/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycm9yKSB9O1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIHNldEFuaW1hdGlvblNwZWVkKG5vZGVVdWlkOiBzdHJpbmcsIHN0YXRlTmFtZTogc3RyaW5nLCBzcGVlZDogbnVtYmVyKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCB7IGRpcmVjdG9yIH0gPSByZXF1aXJlKCdjYycpO1xuICAgICAgICAgICAgY29uc3Qgc2NlbmUgPSBkaXJlY3Rvci5nZXRTY2VuZSgpO1xuICAgICAgICAgICAgaWYgKCFzY2VuZSkgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnTm8gYWN0aXZlIHNjZW5lJyB9O1xuICAgICAgICAgICAgY29uc3Qgbm9kZSA9IGZpbmROb2RlQnlVdWlkRGVlcChzY2VuZSwgbm9kZVV1aWQpO1xuICAgICAgICAgICAgaWYgKCFub2RlKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBOb2RlICR7bm9kZVV1aWR9IG5vdCBmb3VuZGAgfTtcbiAgICAgICAgICAgIGNvbnN0IGFuaW0gPSBub2RlLmdldENvbXBvbmVudCgnY2MuQW5pbWF0aW9uJyk7XG4gICAgICAgICAgICBpZiAoIWFuaW0pIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBOb2RlICR7bm9kZVV1aWR9IGhhcyBubyBjYy5BbmltYXRpb24gY29tcG9uZW50YCB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3Qgc3RhdGUgPSBhbmltLmdldFN0YXRlKHN0YXRlTmFtZSk7XG4gICAgICAgICAgICBpZiAoIXN0YXRlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgQW5pbWF0aW9uIHN0YXRlICcke3N0YXRlTmFtZX0nIG5vdCBmb3VuZGAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHN0YXRlLnNwZWVkID0gc3BlZWQ7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICBzcGVlZDogc3RhdGUuc3BlZWQsXG4gICAgICAgICAgICAgICAgICAgIGlzUGxheWluZzogc3RhdGUuaXNQbGF5aW5nID09PSB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBjdXJyZW50VGltZTogdHlwZW9mIHN0YXRlLmN1cnJlbnRUaW1lID09PSAnbnVtYmVyJyA/IHN0YXRlLmN1cnJlbnRUaW1lIDogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgdG90YWxUaW1lOiB0eXBlb2Ygc3RhdGUudG90YWxUaW1lID09PSAnbnVtYmVyJyA/IHN0YXRlLnRvdGFsVGltZSA6IG51bGwsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3I/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycm9yKSB9O1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIGNoZWNrQW5pbWF0aW9uRmluaXNoZWQobm9kZVV1aWQ6IHN0cmluZywgc3RhdGVOYW1lOiBzdHJpbmcpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IgfSA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgICAgICBpZiAoIXNjZW5lKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdObyBhY3RpdmUgc2NlbmUnIH07XG4gICAgICAgICAgICBjb25zdCBub2RlID0gZmluZE5vZGVCeVV1aWREZWVwKHNjZW5lLCBub2RlVXVpZCk7XG4gICAgICAgICAgICBpZiAoIW5vZGUpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYE5vZGUgJHtub2RlVXVpZH0gbm90IGZvdW5kYCB9O1xuICAgICAgICAgICAgY29uc3QgYW5pbSA9IG5vZGUuZ2V0Q29tcG9uZW50KCdjYy5BbmltYXRpb24nKTtcbiAgICAgICAgICAgIGlmICghYW5pbSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYE5vZGUgJHtub2RlVXVpZH0gaGFzIG5vIGNjLkFuaW1hdGlvbiBjb21wb25lbnRgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBzdGF0ZSA9IGFuaW0uZ2V0U3RhdGUoc3RhdGVOYW1lKTtcbiAgICAgICAgICAgIGlmICghc3RhdGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBBbmltYXRpb24gc3RhdGUgJyR7c3RhdGVOYW1lfScgbm90IGZvdW5kYCB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgY3VycmVudFRpbWUgPSB0eXBlb2Ygc3RhdGUuY3VycmVudFRpbWUgPT09ICdudW1iZXInID8gc3RhdGUuY3VycmVudFRpbWUgOiAwO1xuICAgICAgICAgICAgY29uc3QgdG90YWxUaW1lID0gdHlwZW9mIHN0YXRlLnRvdGFsVGltZSA9PT0gJ251bWJlcicgPyBzdGF0ZS50b3RhbFRpbWUgOiAwO1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogeyBmaW5pc2hlZDogY3VycmVudFRpbWUgPj0gdG90YWxUaW1lIH0gfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvcj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyb3IpIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgcGxheUFuaW1hdGlvbihub2RlVXVpZDogc3RyaW5nLCBjbGlwTmFtZT86IHN0cmluZykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgeyBkaXJlY3RvciB9ID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICAgICAgICAgIGlmICghc2NlbmUpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ05vIGFjdGl2ZSBzY2VuZScgfTtcbiAgICAgICAgICAgIGNvbnN0IG5vZGUgPSBmaW5kTm9kZUJ5VXVpZERlZXAoc2NlbmUsIG5vZGVVdWlkKTtcbiAgICAgICAgICAgIGlmICghbm9kZSkgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgTm9kZSAke25vZGVVdWlkfSBub3QgZm91bmRgIH07XG4gICAgICAgICAgICBjb25zdCBhbmltID0gbm9kZS5nZXRDb21wb25lbnQoJ2NjLkFuaW1hdGlvbicpO1xuICAgICAgICAgICAgaWYgKCFhbmltKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgTm9kZSAke25vZGVVdWlkfSBoYXMgbm8gY2MuQW5pbWF0aW9uIGNvbXBvbmVudGAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChjbGlwTmFtZSkge1xuICAgICAgICAgICAgICAgIC8vIFZhbGlkYXRlIGNsaXAgZXhpc3RzIGJlZm9yZSBjYWxsaW5nIHBsYXkoKSDigJQgY2MuQW5pbWF0aW9uLnBsYXlcbiAgICAgICAgICAgICAgICAvLyBzaWxlbnRseSBkb2VzIG5vdGhpbmcgb24gdW5rbm93biBuYW1lcyB3aGljaCB3b3VsZCBtYXNrXG4gICAgICAgICAgICAgICAgLy8gdHlwb3MgaW4gQUktZ2VuZXJhdGVkIGNhbGxzLlxuICAgICAgICAgICAgICAgIGNvbnN0IGtub3duID0gKGFuaW0uY2xpcHMgPz8gW10pLnNvbWUoKGM6IGFueSkgPT4gYz8ubmFtZSA9PT0gY2xpcE5hbWUpO1xuICAgICAgICAgICAgICAgIGlmICgha25vd24gJiYgKGFuaW0uZGVmYXVsdENsaXA/Lm5hbWUgIT09IGNsaXBOYW1lKSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgICAgICBlcnJvcjogYENsaXAgJyR7Y2xpcE5hbWV9JyBpcyBub3QgcmVnaXN0ZXJlZCBvbiB0aGlzIEFuaW1hdGlvbi4gS25vd246ICR7KGFuaW0uY2xpcHMgPz8gW10pLm1hcCgoYzogYW55KSA9PiBjPy5uYW1lKS5maWx0ZXIoQm9vbGVhbikuam9pbignLCAnKSB8fCAnKG5vbmUpJ30uYCxcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYW5pbS5wbGF5KGNsaXBOYW1lKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgaWYgKCFhbmltLmRlZmF1bHRDbGlwKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ05vIGNsaXBOYW1lIGdpdmVuIGFuZCBubyBkZWZhdWx0Q2xpcCBjb25maWd1cmVkJyB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBhbmltLnBsYXkoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiBgUGxheWluZyAnJHtjbGlwTmFtZSA/PyBhbmltLmRlZmF1bHRDbGlwPy5uYW1lfScgb24gJHtub2RlLm5hbWV9YCxcbiAgICAgICAgICAgICAgICBkYXRhOiB7IG5vZGVVdWlkLCBjbGlwTmFtZTogY2xpcE5hbWUgPz8gYW5pbS5kZWZhdWx0Q2xpcD8ubmFtZSA/PyBudWxsIH0sXG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycm9yPy5tZXNzYWdlID8/IFN0cmluZyhlcnJvcikgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICBzdG9wQW5pbWF0aW9uKG5vZGVVdWlkOiBzdHJpbmcpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IgfSA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgICAgICBpZiAoIXNjZW5lKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdObyBhY3RpdmUgc2NlbmUnIH07XG4gICAgICAgICAgICBjb25zdCBub2RlID0gZmluZE5vZGVCeVV1aWREZWVwKHNjZW5lLCBub2RlVXVpZCk7XG4gICAgICAgICAgICBpZiAoIW5vZGUpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYE5vZGUgJHtub2RlVXVpZH0gbm90IGZvdW5kYCB9O1xuICAgICAgICAgICAgY29uc3QgYW5pbSA9IG5vZGUuZ2V0Q29tcG9uZW50KCdjYy5BbmltYXRpb24nKTtcbiAgICAgICAgICAgIGlmICghYW5pbSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYE5vZGUgJHtub2RlVXVpZH0gaGFzIG5vIGNjLkFuaW1hdGlvbiBjb21wb25lbnRgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhbmltLnN0b3AoKTtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIG1lc3NhZ2U6IGBTdG9wcGVkIGFuaW1hdGlvbiBvbiAke25vZGUubmFtZX1gIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3I/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycm9yKSB9O1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFJlc29sdmUgYSBjbGlwIG5hbWUg4oaSIGFzc2V0IHV1aWQgb24gYSBub2RlJ3MgY2MuQW5pbWF0aW9uLiBSZXR1cm5zXG4gICAgICogdGhlIG1hdGNoaW5nIGNsaXAncyBgX3V1aWRgIGFsb25nIHdpdGggdGhlIGNjLkFuaW1hdGlvbiBjb21wb25lbnRcbiAgICAgKiBpbmRleCBpbnNpZGUgYF9fY29tcHNfX2AsIGJvdGggb2Ygd2hpY2ggdGhlIGhvc3Qtc2lkZVxuICAgICAqIGFuaW1hdGlvbl9zZXRfY2xpcCBoYW5kbGVyIG5lZWRzIHRvIGlzc3VlIGBzZXQtcHJvcGVydHlgIHdyaXRlcy5cbiAgICAgKlxuICAgICAqIFdoeSBob3N0LXNpZGUgZG9lcyB0aGUgYWN0dWFsIHdyaXRlOiBMYW5kbWluZSAjMTEg4oCUIHNjYWxhclxuICAgICAqIHByb3BlcnR5IHdyaXRlcyB2aWEgdGhlIGVkaXRvcidzIHNldC1wcm9wZXJ0eSBjaGFubmVsIHByb3BhZ2F0ZVxuICAgICAqIHRvIHRoZSBzZXJpYWxpemF0aW9uIG1vZGVsIGltbWVkaWF0ZWx5LiBEaXJlY3QgcnVudGltZSBtdXRhdGlvblxuICAgICAqIChgYW5pbS5kZWZhdWx0Q2xpcCA9IHhgKSBvbmx5IHVwZGF0ZXMgbGF5ZXIgKGEpIGFuZCBtYXkgbm90XG4gICAgICogcGVyc2lzdCBvbiBzYXZlX3NjZW5lLiBTbyBzY2VuZS1zY3JpcHQgcmV0dXJucyB0aGUgbWV0YWRhdGE7IGhvc3RcbiAgICAgKiBkb2VzIHRoZSBwZXJzaXN0ZW5jZS5cbiAgICAgKi9cbiAgICBxdWVyeUFuaW1hdGlvblNldFRhcmdldHMobm9kZVV1aWQ6IHN0cmluZywgY2xpcE5hbWU6IHN0cmluZyB8IG51bGwpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IgfSA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgICAgICBpZiAoIXNjZW5lKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdObyBhY3RpdmUgc2NlbmUnIH07XG4gICAgICAgICAgICBjb25zdCBub2RlID0gZmluZE5vZGVCeVV1aWREZWVwKHNjZW5lLCBub2RlVXVpZCk7XG4gICAgICAgICAgICBpZiAoIW5vZGUpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYE5vZGUgJHtub2RlVXVpZH0gbm90IGZvdW5kYCB9O1xuICAgICAgICAgICAgLy8gdjIuNC45IHJldmlldyBmaXggKGNsYXVkZSArIGNvZGV4IPCfn6EpOiB1c2UgaW5kZXhPZiBvbiB0aGVcbiAgICAgICAgICAgIC8vIHJlc29sdmVkIGFuaW0gaW5zdGFuY2UgZGlyZWN0bHkuIFRoZSBwcmV2aW91cyBtZXRhZGF0YS1zdHJpbmdcbiAgICAgICAgICAgIC8vIGxvb2t1cCAoY29uc3RydWN0b3IubmFtZSAvIF9fY2xhc3NuYW1lX18gLyBfY2lkKSB3YXMgZnJhZ2lsZVxuICAgICAgICAgICAgLy8gYWdhaW5zdCBjdXN0b20gc3ViY2xhc3NlcyAoY2MuU2tlbGV0YWxBbmltYXRpb24sIHVzZXItZGVyaXZlZFxuICAgICAgICAgICAgLy8gY2MuQW5pbWF0aW9uKS4gZ2V0Q29tcG9uZW50KCdjYy5BbmltYXRpb24nKSByZXNvbHZlcyBzdWJjbGFzc2VzXG4gICAgICAgICAgICAvLyBjb3JyZWN0bHk7IG1hdGNoaW5nIGJ5IHJlZmVyZW5jZSBpcyB0aGUgY2Fub25pY2FsIHdheSB0byBmaW5kXG4gICAgICAgICAgICAvLyB0aGUgc2FtZSBpbnN0YW5jZSdzIHNsb3QgaW4gX19jb21wc19fLlxuICAgICAgICAgICAgY29uc3QgYW5pbSA9IG5vZGUuZ2V0Q29tcG9uZW50KCdjYy5BbmltYXRpb24nKTtcbiAgICAgICAgICAgIGlmICghYW5pbSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYE5vZGUgJHtub2RlVXVpZH0gaGFzIG5vIGNjLkFuaW1hdGlvbiBjb21wb25lbnRgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBjb21wb25lbnRzOiBhbnlbXSA9IChub2RlLl9jb21wb25lbnRzID8/IG5vZGUuY29tcG9uZW50cyA/PyBbXSk7XG4gICAgICAgICAgICBjb25zdCBjb21wSW5kZXggPSBjb21wb25lbnRzLmluZGV4T2YoYW5pbSk7XG4gICAgICAgICAgICBpZiAoY29tcEluZGV4ID09PSAtMSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYE5vZGUgJHtub2RlVXVpZH0gY2MuQW5pbWF0aW9uIGNvbXBvbmVudCBub3QgZm91bmQgaW4gX19jb21wc19fIGFycmF5IChjb2NvcyBlZGl0b3IgaW5jb25zaXN0ZW5jeSkuYCB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbGV0IGNsaXBVdWlkOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgICAgICAgICAgIGlmIChjbGlwTmFtZSAhPT0gbnVsbCAmJiBjbGlwTmFtZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgY2xpcCA9IChhbmltLmNsaXBzID8/IFtdKS5maW5kKChjOiBhbnkpID0+IGM/Lm5hbWUgPT09IGNsaXBOYW1lKTtcbiAgICAgICAgICAgICAgICBpZiAoIWNsaXApIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGBDbGlwICcke2NsaXBOYW1lfScgaXMgbm90IHJlZ2lzdGVyZWQgb24gdGhpcyBBbmltYXRpb24uIEtub3duOiAkeyhhbmltLmNsaXBzID8/IFtdKS5tYXAoKGM6IGFueSkgPT4gYz8ubmFtZSkuZmlsdGVyKEJvb2xlYW4pLmpvaW4oJywgJykgfHwgJyhub25lKSd9LmAsXG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNsaXBVdWlkID0gY2xpcC5fdXVpZCA/PyBjbGlwLnV1aWQgPz8gbnVsbDtcbiAgICAgICAgICAgICAgICBpZiAoIWNsaXBVdWlkKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYENsaXAgJyR7Y2xpcE5hbWV9JyBoYXMgbm8gYXNzZXQgdXVpZDsgY2Fubm90IHBlcnNpc3QgYXMgZGVmYXVsdENsaXAuYCB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudEluZGV4OiBjb21wSW5kZXgsXG4gICAgICAgICAgICAgICAgICAgIGNsaXBVdWlkLFxuICAgICAgICAgICAgICAgICAgICBjdXJyZW50RGVmYXVsdENsaXA6IGFuaW0uZGVmYXVsdENsaXA/Lm5hbWUgPz8gbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgY3VycmVudFBsYXlPbkxvYWQ6IGFuaW0ucGxheU9uTG9hZCA9PT0gdHJ1ZSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvcj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyb3IpIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogdjIuOC4wIFQtVjI4LTMgLyB2Mi44LjIgcmV0ZXN0IGZpeDogZW50ZXIgLyBleGl0IFByZXZpZXctaW4tRWRpdG9yXG4gICAgICogKFBJRSkgcGxheSBtb2RlIHByb2dyYW1tYXRpY2FsbHkuIFVzZXMgdGhlIHR5cGVkXG4gICAgICogYGNoYW5nZVByZXZpZXdQbGF5U3RhdGUoc3RhdGU6IGJvb2xlYW4pYCBtZXRob2QgZGVjbGFyZWQgb25cbiAgICAgKiBgU2NlbmVGYWNhZGVNYW5hZ2VyYCDigJRcbiAgICAgKiBgbm9kZV9tb2R1bGVzL0Bjb2Nvcy9jcmVhdG9yLXR5cGVzL2VkaXRvci9wYWNrYWdlcy9zY2VuZS9AdHlwZXMvY2NlLzNkL2ZhY2FkZS9zY2VuZS1mYWNhZGUtbWFuYWdlci5kLnRzOjI1MGAuXG4gICAgICpcbiAgICAgKiBQYXJhbWV0ZXJzOlxuICAgICAqICAgc3RhdGUg4oCUIHRydWUgdG8gc3RhcnQgUElFLCBmYWxzZSB0byBzdG9wIGFuZCByZXR1cm4gdG8gc2NlbmUgbW9kZS5cbiAgICAgKlxuICAgICAqICoqdjIuOC4yIHJldGVzdCBmaW5kaW5nKio6IHYyLjguMCBkaXNwYXRjaGVkIGFnYWluc3QgYGNjZS5TY2VuZUZhY2FkZWBcbiAgICAgKiAobWF0Y2hpbmcgdGhlIHR5cGUtZG9jIG5hbWUpIGJ1dCBsaXZlIGNvY29zIGVkaXRvciAzLjgueCBleHBvc2VzIHRoZVxuICAgICAqIHJ1bnRpbWUgc2luZ2xldG9uIGF0IGBjY2UuU2NlbmVGYWNhZGVNYW5hZ2VyYCAoYW5kIC8gb3JcbiAgICAgKiBgLlNjZW5lRmFjYWRlTWFuYWdlci5pbnN0YW5jZWApLCBzYW1lIGNvbnZlbnRpb24gYXMgdGhlIHByZWZhYiBwYXRoXG4gICAgICogdXNlcyAoc2VlIGBnZXRQcmVmYWJGYWNhZGVgIGFib3ZlKS4gUHJvYmluZyBhbGwgdGhyZWUgY2FuZGlkYXRlc1xuICAgICAqIGtlZXBzIHRoZSBjb2RlIHJlc2lsaWVudCBhY3Jvc3MgY29jb3MgYnVpbGRzIHdoZXJlIHRoZSBuYW1lc3BhY2VcbiAgICAgKiBzaGFwZSBkaWZmZXJzLlxuICAgICAqXG4gICAgICogVGhlIEhBTkRPRkYgb3JpZ2luYWxseSBub3RlZCBgc2NlbmUvZWRpdG9yLXByZXZpZXctc2V0LXBsYXlgIGFzIGFuXG4gICAgICogdW5kb2N1bWVudGVkIEVkaXRvci5NZXNzYWdlIGNoYW5uZWw7IHdlIHVzZSB0aGUgdHlwZWQgZmFjYWRlIG1ldGhvZFxuICAgICAqIGluc3RlYWQgc28gdGhlIGNhbGwgcGF0aCBpcyB0eXBlLWNoZWNrZWQgYWdhaW5zdCBjcmVhdG9yLXR5cGVzIGFuZFxuICAgICAqIG5vdCBzdWJqZWN0IHRvIHNpbGVudCByZW1vdmFsIGJldHdlZW4gY29jb3MgdmVyc2lvbnMuXG4gICAgICpcbiAgICAgKiBSZXR1cm5zIHRoZSBzdGFuZGFyZCBzY2VuZS1zY3JpcHQgZW52ZWxvcGUuIFJlZmVyZW5jZXMgdGhlXG4gICAgICogdG9wLWxldmVsIGBjY2VgIGRlY2xhcmF0aW9uIChtYXRjaGluZyB0aGUgcHJlZmFiIHBhdHRlcm4pIHJhdGhlclxuICAgICAqIHRoYW4gcmVhY2hpbmcgdGhyb3VnaCBgZ2xvYmFsVGhpc2Agc28gdGhlIHJlc29sdXRpb24gc2VtYW50aWNzXG4gICAgICogbWF0Y2ggb3RoZXIgc2NlbmUtc2NyaXB0IG1ldGhvZHMgaW4gdGhpcyBmaWxlLlxuICAgICAqL1xuICAgIGFzeW5jIGNoYW5nZVByZXZpZXdQbGF5U3RhdGUoc3RhdGU6IGJvb2xlYW4pIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgY2NlID09PSAndW5kZWZpbmVkJyB8fCBjY2UgPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgZXJyb3I6ICdjY2UgZ2xvYmFsIGlzIG5vdCBhdmFpbGFibGU7IHRoaXMgbWV0aG9kIG11c3QgcnVuIGluIGEgc2NlbmUtc2NyaXB0IGNvbnRleHQuJyxcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gdjIuOC4yOiBwcm9iZSB0aGUgdGhyZWUgY2FuZGlkYXRlIGxvY2F0aW9ucyB0aGUgU2NlbmVGYWNhZGVcbiAgICAgICAgICAgIC8vIHNpbmdsZXRvbiBoYXMgYmVlbiBvYnNlcnZlZCBhdCBhY3Jvc3MgY29jb3MgYnVpbGRzLiBTYW1lXG4gICAgICAgICAgICAvLyBjb252ZW50aW9uIGFzIGdldFByZWZhYkZhY2FkZS5cbiAgICAgICAgICAgIGNvbnN0IGNhbmRpZGF0ZXM6IGFueVtdID0gW1xuICAgICAgICAgICAgICAgIChjY2UgYXMgYW55KS5TY2VuZUZhY2FkZSxcbiAgICAgICAgICAgICAgICAoY2NlIGFzIGFueSkuU2NlbmVGYWNhZGVNYW5hZ2VyPy5pbnN0YW5jZSxcbiAgICAgICAgICAgICAgICAoY2NlIGFzIGFueSkuU2NlbmVGYWNhZGVNYW5hZ2VyLFxuICAgICAgICAgICAgXTtcbiAgICAgICAgICAgIGNvbnN0IGZhY2FkZSA9IGNhbmRpZGF0ZXMuZmluZChcbiAgICAgICAgICAgICAgICBjID0+IGMgJiYgdHlwZW9mIGMuY2hhbmdlUHJldmlld1BsYXlTdGF0ZSA9PT0gJ2Z1bmN0aW9uJyxcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBpZiAoIWZhY2FkZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICBlcnJvcjogJ05vIFNjZW5lRmFjYWRlIHdpdGggY2hhbmdlUHJldmlld1BsYXlTdGF0ZSBmb3VuZCBvbiBjY2UgKGNjZS5TY2VuZUZhY2FkZSAvIGNjZS5TY2VuZUZhY2FkZU1hbmFnZXIgLyAuaW5zdGFuY2UpLiBDb2NvcyB2ZXJzaW9uIG1heSBub3Qgc3VwcG9ydCBQSUUgY29udHJvbCB2aWEgdGhpcyBmYWNhZGUg4oCUIHVzZSB0aGUgdG9vbGJhciBwbGF5IGJ1dHRvbiBtYW51YWxseS4nLFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhd2FpdCBmYWNhZGUuY2hhbmdlUHJldmlld1BsYXlTdGF0ZShCb29sZWFuKHN0YXRlKSk7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgZGF0YTogeyByZXF1ZXN0ZWRTdGF0ZTogQm9vbGVhbihzdGF0ZSkgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3I/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycm9yKSB9O1xuICAgICAgICB9XG4gICAgfSxcblxufTtcbiJdfQ==