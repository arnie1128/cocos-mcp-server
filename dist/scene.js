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
        // v2.4.11 round-3 codex 🔴 + claude 🟡 + gemini 🟡: increment INSIDE
        // the try so _ensureConsoleHook throwing (today: pure assignments,
        // so safe; defensive against future growth) cannot leak the
        // refcount and leave the console hook installed forever.
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NlbmUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zb3VyY2Uvc2NlbmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsK0JBQTRCO0FBQzVCLE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUEsV0FBSSxFQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLGNBQWMsQ0FBQyxDQUFDLENBQUM7QUFxQnpELFNBQVMsZUFBZTs7SUFDcEIsSUFBSSxPQUFPLEdBQUcsS0FBSyxXQUFXLElBQUksR0FBRyxLQUFLLElBQUksRUFBRSxDQUFDO1FBQzdDLE9BQU8sRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSw2RUFBNkUsRUFBRSxDQUFDO0lBQy9HLENBQUM7SUFDRCxNQUFNLFVBQVUsR0FBb0M7UUFDaEQsR0FBRyxDQUFDLE1BQU07UUFDVixNQUFBLEdBQUcsQ0FBQyxrQkFBa0IsMENBQUUsUUFBUTtRQUNoQyxHQUFHLENBQUMsa0JBQThDO0tBQ3JELENBQUM7SUFDRixnRUFBZ0U7SUFDaEUsK0RBQStEO0lBQy9ELE1BQU0sUUFBUSxHQUE4QixDQUFDLGNBQWMsRUFBRSxhQUFhLEVBQUUsWUFBWSxFQUFFLGNBQWMsRUFBRSxlQUFlLENBQUMsQ0FBQztJQUMzSCxLQUFLLE1BQU0sU0FBUyxJQUFJLFVBQVUsRUFBRSxDQUFDO1FBQ2pDLElBQUksU0FBUyxJQUFJLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxPQUFRLFNBQWlCLENBQUMsQ0FBQyxDQUFDLEtBQUssVUFBVSxDQUFDLEVBQUUsQ0FBQztZQUNoRixPQUFPLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLENBQUM7UUFDMUMsQ0FBQztJQUNMLENBQUM7SUFDRCxPQUFPO1FBQ0gsRUFBRSxFQUFFLEtBQUs7UUFDVCxLQUFLLEVBQUUseUtBQXlLO0tBQ25MLENBQUM7QUFDTixDQUFD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QUFDLENBQU0sRUFBRSxFQUFFLENBQUMsQ0FBQyxhQUFELENBQUMsdUJBQUQsQ0FBQyxDQUFFLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksUUFBUSxHQUFHO3FCQUNqSyxDQUFDO2dCQUNOLENBQUM7Z0JBQ0QsUUFBUSxHQUFHLE1BQUEsTUFBQSxJQUFJLENBQUMsS0FBSyxtQ0FBSSxJQUFJLENBQUMsSUFBSSxtQ0FBSSxJQUFJLENBQUM7Z0JBQzNDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztvQkFDWixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsU0FBUyxRQUFRLHFEQUFxRCxFQUFFLENBQUM7Z0JBQzdHLENBQUM7WUFDTCxDQUFDO1lBQ0QsT0FBTztnQkFDSCxPQUFPLEVBQUUsSUFBSTtnQkFDYixJQUFJLEVBQUU7b0JBQ0YsY0FBYyxFQUFFLFNBQVM7b0JBQ3pCLFFBQVE7b0JBQ1Isa0JBQWtCLEVBQUUsTUFBQSxNQUFBLElBQUksQ0FBQyxXQUFXLDBDQUFFLElBQUksbUNBQUksSUFBSTtvQkFDbEQsaUJBQWlCLEVBQUUsSUFBSSxDQUFDLFVBQVUsS0FBSyxJQUFJO2lCQUM5QzthQUNKLENBQUM7UUFDTixDQUFDO1FBQUMsT0FBTyxLQUFVLEVBQUUsQ0FBQztZQUNsQixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsTUFBQSxLQUFLLGFBQUwsS0FBSyx1QkFBTCxLQUFLLENBQUUsT0FBTyxtQ0FBSSxNQUFNLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztRQUN0RSxDQUFDO0lBQ0wsQ0FBQztDQUVKLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBqb2luIH0gZnJvbSAncGF0aCc7XG5tb2R1bGUucGF0aHMucHVzaChqb2luKEVkaXRvci5BcHAucGF0aCwgJ25vZGVfbW9kdWxlcycpKTtcblxuLy8gYGNjZWAgaXMgaW5qZWN0ZWQgYnkgQ29jb3MgRWRpdG9yIGludG8gdGhlIHNjZW5lLXNjcmlwdCBnbG9iYWwgc2NvcGUuXG4vLyBJdCBpcyBub3QgZGVjbGFyZWQgaW4gYEBjb2Nvcy9jcmVhdG9yLXR5cGVzYCBleHBvcnRzOyBkZWNsYXJlIGEgbWluaW1hbFxuLy8gcnVudGltZSBzaGFwZSBqdXN0IGZvciB3aGF0IHdlIHRvdWNoIGhlcmUgc28gVHlwZVNjcmlwdCBzdGF5cyBzdHJpY3QuXG5kZWNsYXJlIGNvbnN0IGNjZTogdW5kZWZpbmVkIHwge1xuICAgIFByZWZhYj86IFByZWZhYkZhY2FkZTtcbiAgICBTY2VuZUZhY2FkZU1hbmFnZXI/OiB7IGluc3RhbmNlPzogUHJlZmFiRmFjYWRlIH0gJiBQcmVmYWJGYWNhZGU7XG59O1xuXG5pbnRlcmZhY2UgUHJlZmFiRmFjYWRlIHtcbiAgICBjcmVhdGVQcmVmYWIobm9kZVV1aWQ6IHN0cmluZywgdXJsOiBzdHJpbmcpOiBQcm9taXNlPGFueT47XG4gICAgYXBwbHlQcmVmYWIobm9kZVV1aWQ6IHN0cmluZyk6IFByb21pc2U8YW55PjtcbiAgICBsaW5rUHJlZmFiKG5vZGVVdWlkOiBzdHJpbmcsIGFzc2V0VXVpZDogc3RyaW5nKTogYW55O1xuICAgIHVubGlua1ByZWZhYihub2RlVXVpZDogc3RyaW5nLCByZW1vdmVOZXN0ZWQ6IGJvb2xlYW4pOiBhbnk7XG4gICAgZ2V0UHJlZmFiRGF0YShub2RlVXVpZDogc3RyaW5nKTogYW55O1xuICAgIHJlc3RvcmVQcmVmYWI/KHV1aWQ6IHN0cmluZywgYXNzZXRVdWlkOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+O1xufVxuXG50eXBlIEZhY2FkZUxvb2t1cCA9IHsgb2s6IHRydWU7IHZhbHVlOiBQcmVmYWJGYWNhZGUgfSB8IHsgb2s6IGZhbHNlOyBlcnJvcjogc3RyaW5nIH07XG5cbmZ1bmN0aW9uIGdldFByZWZhYkZhY2FkZSgpOiBGYWNhZGVMb29rdXAge1xuICAgIGlmICh0eXBlb2YgY2NlID09PSAndW5kZWZpbmVkJyB8fCBjY2UgPT09IG51bGwpIHtcbiAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogJ2NjZSBnbG9iYWwgaXMgbm90IGF2YWlsYWJsZTsgdGhpcyBtZXRob2QgbXVzdCBydW4gaW4gYSBzY2VuZS1zY3JpcHQgY29udGV4dCcgfTtcbiAgICB9XG4gICAgY29uc3QgY2FuZGlkYXRlczogQXJyYXk8UHJlZmFiRmFjYWRlIHwgdW5kZWZpbmVkPiA9IFtcbiAgICAgICAgY2NlLlByZWZhYixcbiAgICAgICAgY2NlLlNjZW5lRmFjYWRlTWFuYWdlcj8uaW5zdGFuY2UsXG4gICAgICAgIGNjZS5TY2VuZUZhY2FkZU1hbmFnZXIgYXMgUHJlZmFiRmFjYWRlIHwgdW5kZWZpbmVkLFxuICAgIF07XG4gICAgLy8gRW5zdXJlIHRoZSBjYW5kaWRhdGUgZXhwb3NlcyBldmVyeSBmYWNhZGUgbWV0aG9kIHdlIG1heSBjYWxsO1xuICAgIC8vIGEgcGFydGlhbCBjYW5kaWRhdGUgd291bGQgY3Jhc2ggYXQgdGhlIGZpcnN0IG1pc3NpbmcgbWV0aG9kLlxuICAgIGNvbnN0IHJlcXVpcmVkOiBBcnJheTxrZXlvZiBQcmVmYWJGYWNhZGU+ID0gWydjcmVhdGVQcmVmYWInLCAnYXBwbHlQcmVmYWInLCAnbGlua1ByZWZhYicsICd1bmxpbmtQcmVmYWInLCAnZ2V0UHJlZmFiRGF0YSddO1xuICAgIGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIGNhbmRpZGF0ZXMpIHtcbiAgICAgICAgaWYgKGNhbmRpZGF0ZSAmJiByZXF1aXJlZC5ldmVyeShtID0+IHR5cGVvZiAoY2FuZGlkYXRlIGFzIGFueSlbbV0gPT09ICdmdW5jdGlvbicpKSB7XG4gICAgICAgICAgICByZXR1cm4geyBvazogdHJ1ZSwgdmFsdWU6IGNhbmRpZGF0ZSB9O1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiB7XG4gICAgICAgIG9rOiBmYWxzZSxcbiAgICAgICAgZXJyb3I6ICdObyBjb21wbGV0ZSBwcmVmYWIgZmFjYWRlIGZvdW5kIG9uIGNjZSAoY2NlLlByZWZhYiAvIGNjZS5TY2VuZUZhY2FkZU1hbmFnZXIpLiBDb2NvcyBlZGl0b3IgYnVpbGQgbWF5IG5vdCBleHBvc2UgdGhlIGV4cGVjdGVkIG1hbmFnZXIgb3Igb25seSBleHBvc2VzIGEgcGFydGlhbCBzdXJmYWNlLicsXG4gICAgfTtcbn1cblxudHlwZSBDb21wb25lbnRMb29rdXAgPVxuICAgIHwgeyBvazogdHJ1ZTsgc2NlbmU6IGFueTsgbm9kZTogYW55OyBjb21wb25lbnQ6IGFueSB9XG4gICAgfCB7IG9rOiBmYWxzZTsgZXJyb3I6IHN0cmluZyB9O1xuXG5mdW5jdGlvbiBmaW5kTm9kZUJ5VXVpZERlZXAocm9vdDogYW55LCB1dWlkOiBzdHJpbmcpOiBhbnkge1xuICAgIGlmICghcm9vdCkgcmV0dXJuIG51bGw7XG4gICAgaWYgKHJvb3QuX2lkID09PSB1dWlkIHx8IHJvb3QudXVpZCA9PT0gdXVpZCkgcmV0dXJuIHJvb3Q7XG4gICAgY29uc3QgY2hpbGRyZW4gPSByb290LmNoaWxkcmVuID8/IHJvb3QuX2NoaWxkcmVuID8/IFtdO1xuICAgIGZvciAoY29uc3QgY2hpbGQgb2YgY2hpbGRyZW4pIHtcbiAgICAgICAgY29uc3QgaGl0ID0gZmluZE5vZGVCeVV1aWREZWVwKGNoaWxkLCB1dWlkKTtcbiAgICAgICAgaWYgKGhpdCkgcmV0dXJuIGhpdDtcbiAgICB9XG4gICAgcmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIHJlc29sdmVDb21wb25lbnRDb250ZXh0KG5vZGVVdWlkOiBzdHJpbmcsIGNvbXBvbmVudFR5cGU6IHN0cmluZyk6IENvbXBvbmVudExvb2t1cCB7XG4gICAgY29uc3QgeyBkaXJlY3RvciwganMgfSA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgY29uc3Qgc2NlbmUgPSBkaXJlY3Rvci5nZXRTY2VuZSgpO1xuICAgIGlmICghc2NlbmUpIHtcbiAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogJ05vIGFjdGl2ZSBzY2VuZScgfTtcbiAgICB9XG4gICAgLy8gc2NlbmUuZ2V0Q2hpbGRCeVV1aWQgb25seSB3YWxrcyBkaXJlY3QgY2hpbGRyZW47IHVzZSBkZXB0aC1maXJzdCBzZWFyY2guXG4gICAgY29uc3Qgbm9kZSA9IGZpbmROb2RlQnlVdWlkRGVlcChzY2VuZSwgbm9kZVV1aWQpO1xuICAgIGlmICghbm9kZSkge1xuICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBgTm9kZSB3aXRoIFVVSUQgJHtub2RlVXVpZH0gbm90IGZvdW5kYCB9O1xuICAgIH1cbiAgICBjb25zdCBDb21wb25lbnRDbGFzcyA9IGpzLmdldENsYXNzQnlOYW1lKGNvbXBvbmVudFR5cGUpO1xuICAgIGlmICghQ29tcG9uZW50Q2xhc3MpIHtcbiAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogYENvbXBvbmVudCB0eXBlICR7Y29tcG9uZW50VHlwZX0gbm90IGZvdW5kYCB9O1xuICAgIH1cbiAgICBjb25zdCBjb21wb25lbnQgPSBub2RlLmdldENvbXBvbmVudChDb21wb25lbnRDbGFzcyk7XG4gICAgaWYgKCFjb21wb25lbnQpIHtcbiAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogYENvbXBvbmVudCAke2NvbXBvbmVudFR5cGV9IG5vdCBmb3VuZCBvbiBub2RlYCB9O1xuICAgIH1cbiAgICByZXR1cm4geyBvazogdHJ1ZSwgc2NlbmUsIG5vZGUsIGNvbXBvbmVudCB9O1xufVxuXG5mdW5jdGlvbiBzZXJpYWxpemVFdmVudEhhbmRsZXIoZWg6IGFueSkge1xuICAgIGlmICghZWgpIHJldHVybiBudWxsO1xuICAgIHJldHVybiB7XG4gICAgICAgIHRhcmdldFV1aWQ6IGVoLnRhcmdldD8udXVpZCA/PyBudWxsLFxuICAgICAgICB0YXJnZXROYW1lOiBlaC50YXJnZXQ/Lm5hbWUgPz8gbnVsbCxcbiAgICAgICAgY29tcG9uZW50OiBlaC5jb21wb25lbnQgPz8gZWguX2NvbXBvbmVudE5hbWUgPz8gbnVsbCxcbiAgICAgICAgaGFuZGxlcjogZWguaGFuZGxlciA/PyBudWxsLFxuICAgICAgICBjdXN0b21FdmVudERhdGE6IGVoLmN1c3RvbUV2ZW50RGF0YSA/PyAnJyxcbiAgICB9O1xufVxuXG4vLyB2Mi40LjggQTMgKyB2Mi40LjkgKyB2Mi40LjEwIHJldmlldyBmaXg6IHNjZW5lLXNpZGUgbG9nIGNhcHR1cmVcbi8vIChSb21hUm9nb3YgcGF0dGVybiBhZGFwdGVkKS5cbi8vXG4vLyBDb25jdXJyZW5jeSBtb2RlbCDigJQgdjIuNC4xMCAoY2xhdWRlICsgY29kZXgg8J+UtCByb3VuZC0yKTpcbi8vICAgdjIuNC44IGZhbm5lZCBldmVyeSBjb25zb2xlLmxvZyB0byBBTEwgYWN0aXZlIGNhcHR1cmUgYXJyYXlzLlxuLy8gICB2Mi40LjkgYXR0ZW1wdGVkIHRvIGlzb2xhdGUgdmlhIF90b3BTbG90KCkgKGN1cnJlbnQgdG9wIG9mIHN0YWNrKVxuLy8gICBidXQgdGhhdCBvbmx5IHdvcmtlZCBmb3Igc3RyaWN0bHkgTElGTy1uZXN0ZWQgY2FsbHM7IHR3byBjYWxsc1xuLy8gICB0aGF0IGludGVybGVhdmUgdmlhIGBhd2FpdGAgY291bGQgc3RpbGwgbWlzYXR0cmlidXRlIChjYWxsIEFcbi8vICAgYXdhaXRzLCBCIHB1c2hlcyBpdHMgc2xvdCwgQSdzIHBvc3QtYXdhaXQgbG9ncyB3b3VsZCByb3V0ZSB0byBCKS5cbi8vICAgdjIuNC4xMCB1c2VzIE5vZGUncyBidWlsdC1pbiBgQXN5bmNMb2NhbFN0b3JhZ2VgIHNvIGVhY2ggY2FsbCdzXG4vLyAgIGxvZ2ljYWwgYXN5bmMgY2hhaW4ga2VlcHMgaXRzIE9XTiBzbG90IHJlZ2FyZGxlc3Mgb2Ygc3RhY2sgb3JkZXIuXG4vLyAgIFdoZW4gY29uc29sZS5sb2cgZmlyZXMsIHRoZSBob29rIHJlYWRzIEFMUy5nZXRTdG9yZSgpIOKAlCB3aGljaCBpc1xuLy8gICBib3VuZCB0byB0aGUgb3JpZ2luYXRpbmcgY2FsbCdzIGFzeW5jIGNvbnRleHQg4oCUIGFuZCB3cml0ZXMgdGhlcmUuXG4vL1xuLy8gQm91bmQg4oCUIHYyLjQuOSAoY2xhdWRlICsgY29kZXgg8J+foSk6XG4vLyAgIENhcCBlbnRyaWVzIHBlciBjYXB0dXJlIChkZWZhdWx0IDUwMCkgYW5kIHRvdGFsIGJ5dGVzIChkZWZhdWx0XG4vLyAgIDY0IEtCKS4gRXhjZXNzIGVudHJpZXMgYXJlIGRyb3BwZWQ7IGEgc2luZ2xlIGBbY2FwdHVyZSB0cnVuY2F0ZWRdYFxuLy8gICBtYXJrZXIgaXMgYXBwZW5kZWQgb25jZS4gdjIuNC4xMDogbWFya2VyIGJ5dGVzIGNvdW50ZWQgYWdhaW5zdFxuLy8gICB0aGUgY2FwIChjb2RleCByb3VuZC0yIPCfn6EpIHNvIHRoZSBzbG90J3MgYnl0ZXMgZmllbGQgc3RheXNcbi8vICAgbW9ub3RvbmljYWxseSBhY2N1cmF0ZS5cbi8vXG4vLyBIb29rIGxpZmVjeWNsZTpcbi8vICAgVGhlIGNvbnNvbGUgaG9vayBpcyBpbnN0YWxsZWQgb24gZmlyc3QgYHJ1bldpdGhDYXB0dXJlYCBpbnZvY2F0aW9uXG4vLyAgIGFuZCB1bmluc3RhbGxlZCB3aGVuIG5vIHNsb3QgaXMgYWN0aXZlLiBFYWNoIGludm9jYXRpb24gYGFscy5ydW4oKWBzXG4vLyAgIHdpdGggaXRzIHNsb3QsIHNvIHRoZSBob29rIGp1c3QgcmVhZHMgdGhlIHN0b3JlLiBXZSBzdGlsbCBrZWVwXG4vLyAgIGBfYWN0aXZlU2xvdENvdW50YCBhcyBhIHJlZmNvdW50IHRvIGtub3cgd2hlbiB0byB1bmhvb2sgKEFMU1xuLy8gICBkb2Vzbid0IGV4cG9zZSBzdG9yZSBjb3VudCBkaXJlY3RseSkuXG5pbXBvcnQgeyBBc3luY0xvY2FsU3RvcmFnZSB9IGZyb20gJ2FzeW5jX2hvb2tzJztcblxudHlwZSBDYXB0dXJlZEVudHJ5ID0geyBsZXZlbDogJ2xvZycgfCAnd2FybicgfCAnZXJyb3InOyBtZXNzYWdlOiBzdHJpbmc7IHRzOiBudW1iZXIgfTtcbnR5cGUgQ29uc29sZVNuYXBzaG90ID0geyBsb2c6IHR5cGVvZiBjb25zb2xlLmxvZzsgd2FybjogdHlwZW9mIGNvbnNvbGUud2FybjsgZXJyb3I6IHR5cGVvZiBjb25zb2xlLmVycm9yIH07XG5cbmludGVyZmFjZSBDYXB0dXJlU2xvdCB7XG4gICAgZW50cmllczogQ2FwdHVyZWRFbnRyeVtdO1xuICAgIGJ5dGVzOiBudW1iZXI7XG4gICAgdHJ1bmNhdGVkOiBib29sZWFuO1xufVxuXG5jb25zdCBDQVBUVVJFX01BWF9FTlRSSUVTID0gNTAwO1xuY29uc3QgQ0FQVFVSRV9NQVhfQllURVMgPSA2NCAqIDEwMjQ7XG5jb25zdCBfY2FwdHVyZUFMUyA9IG5ldyBBc3luY0xvY2FsU3RvcmFnZTxDYXB0dXJlU2xvdD4oKTtcbmxldCBfYWN0aXZlU2xvdENvdW50ID0gMDtcbmxldCBfb3JpZ0NvbnNvbGU6IENvbnNvbGVTbmFwc2hvdCB8IG51bGwgPSBudWxsO1xuXG5mdW5jdGlvbiBfZm9ybWF0QXJncyhhOiB1bmtub3duW10pOiBzdHJpbmcge1xuICAgIHJldHVybiBhXG4gICAgICAgIC5tYXAoeCA9PiB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIHggPT09ICdzdHJpbmcnKSByZXR1cm4geDtcbiAgICAgICAgICAgIHRyeSB7IHJldHVybiBKU09OLnN0cmluZ2lmeSh4KTsgfSBjYXRjaCB7IHJldHVybiBTdHJpbmcoeCk7IH1cbiAgICAgICAgfSlcbiAgICAgICAgLmpvaW4oJyAnKTtcbn1cblxuZnVuY3Rpb24gX2FwcGVuZEJvdW5kZWQoc2xvdDogQ2FwdHVyZVNsb3QsIGVudHJ5OiBDYXB0dXJlZEVudHJ5KTogdm9pZCB7XG4gICAgaWYgKHNsb3QudHJ1bmNhdGVkKSByZXR1cm47XG4gICAgY29uc3QgZW50cnlCeXRlcyA9IGVudHJ5Lm1lc3NhZ2UubGVuZ3RoICsgMzI7IC8vIH5sZXZlbCArIHRzIG92ZXJoZWFkXG4gICAgaWYgKHNsb3QuZW50cmllcy5sZW5ndGggPj0gQ0FQVFVSRV9NQVhfRU5UUklFUyB8fCBzbG90LmJ5dGVzICsgZW50cnlCeXRlcyA+IENBUFRVUkVfTUFYX0JZVEVTKSB7XG4gICAgICAgIHNsb3QudHJ1bmNhdGVkID0gdHJ1ZTtcbiAgICAgICAgY29uc3QgbWFya2VyOiBDYXB0dXJlZEVudHJ5ID0geyBsZXZlbDogJ3dhcm4nLCBtZXNzYWdlOiAnW2NhcHR1cmUgdHJ1bmNhdGVkIOKAlCBleGNlZWRlZCBlbnRyeS9ieXRlIGNhcF0nLCB0czogRGF0ZS5ub3coKSB9O1xuICAgICAgICBzbG90LmVudHJpZXMucHVzaChtYXJrZXIpO1xuICAgICAgICAvLyB2Mi40LjEwIGNvZGV4IHJvdW5kLTIg8J+foTogdHJhY2sgbWFya2VyIGJ5dGVzIHRvbyBzbyBjYXAgYWNjb3VudGluZ1xuICAgICAgICAvLyBzdGF5cyBhY2N1cmF0ZSBldmVuIHRob3VnaCBubyBmdXJ0aGVyIGFwcGVuZHMgd2lsbCBmb2xsb3cuXG4gICAgICAgIHNsb3QuYnl0ZXMgKz0gbWFya2VyLm1lc3NhZ2UubGVuZ3RoICsgMzI7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgc2xvdC5lbnRyaWVzLnB1c2goZW50cnkpO1xuICAgIHNsb3QuYnl0ZXMgKz0gZW50cnlCeXRlcztcbn1cblxuZnVuY3Rpb24gX2Vuc3VyZUNvbnNvbGVIb29rKCk6IHZvaWQge1xuICAgIGlmIChfb3JpZ0NvbnNvbGUpIHJldHVybjtcbiAgICBfb3JpZ0NvbnNvbGUgPSB7IGxvZzogY29uc29sZS5sb2csIHdhcm46IGNvbnNvbGUud2FybiwgZXJyb3I6IGNvbnNvbGUuZXJyb3IgfTtcbiAgICBjb25zdCBtYWtlID0gKGxldmVsOiBDYXB0dXJlZEVudHJ5WydsZXZlbCddLCBvcmlnOiAoLi4uYTogYW55W10pID0+IHZvaWQpID0+XG4gICAgICAgICguLi5hOiBhbnlbXSk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgY29uc3Qgc2xvdCA9IF9jYXB0dXJlQUxTLmdldFN0b3JlKCk7XG4gICAgICAgICAgICBpZiAoc2xvdCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IG1lc3NhZ2UgPSBfZm9ybWF0QXJncyhhKTtcbiAgICAgICAgICAgICAgICBfYXBwZW5kQm91bmRlZChzbG90LCB7IGxldmVsLCBtZXNzYWdlLCB0czogRGF0ZS5ub3coKSB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRyeSB7IG9yaWcuYXBwbHkoY29uc29sZSwgYSk7IH0gY2F0Y2ggeyAvKiBzd2FsbG93ICovIH1cbiAgICAgICAgfTtcbiAgICBjb25zb2xlLmxvZyA9IG1ha2UoJ2xvZycsIF9vcmlnQ29uc29sZS5sb2cpO1xuICAgIGNvbnNvbGUud2FybiA9IG1ha2UoJ3dhcm4nLCBfb3JpZ0NvbnNvbGUud2Fybik7XG4gICAgY29uc29sZS5lcnJvciA9IG1ha2UoJ2Vycm9yJywgX29yaWdDb25zb2xlLmVycm9yKTtcbn1cblxuZnVuY3Rpb24gX21heWJlVW5ob29rQ29uc29sZSgpOiB2b2lkIHtcbiAgICBpZiAoX2FjdGl2ZVNsb3RDb3VudCA+IDAgfHwgIV9vcmlnQ29uc29sZSkgcmV0dXJuO1xuICAgIGNvbnNvbGUubG9nID0gX29yaWdDb25zb2xlLmxvZztcbiAgICBjb25zb2xlLndhcm4gPSBfb3JpZ0NvbnNvbGUud2FybjtcbiAgICBjb25zb2xlLmVycm9yID0gX29yaWdDb25zb2xlLmVycm9yO1xuICAgIF9vcmlnQ29uc29sZSA9IG51bGw7XG59XG5cbmV4cG9ydCBjb25zdCBtZXRob2RzOiB7IFtrZXk6IHN0cmluZ106ICguLi5hbnk6IGFueSkgPT4gYW55IH0gPSB7XG4gICAgLyoqXG4gICAgICogdjIuNC44IEEzOiBpbnZva2UgYW5vdGhlciBzY2VuZS1zY3JpcHQgbWV0aG9kIGJ5IG5hbWUsIGNhcHR1cmluZ1xuICAgICAqIGNvbnNvbGUue2xvZyx3YXJuLGVycm9yfSBkdXJpbmcgdGhlIGNhbGwgYW5kIHJldHVybmluZyBjYXB0dXJlZExvZ3NcbiAgICAgKiBhbG9uZ3NpZGUgdGhlIG1ldGhvZCdzIG5vcm1hbCByZXR1cm4gZW52ZWxvcGUuIFNpbmdsZSByb3VuZC10cmlwLlxuICAgICAqXG4gICAgICogQmVoYXZpb3VyOlxuICAgICAqICAtIElmIGBtZXRob2ROYW1lYCBkb2VzIG5vdCBleGlzdCwgcmV0dXJuc1xuICAgICAqICAgIGB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogXCIuLi5cIiAsIGNhcHR1cmVkTG9nczogW10gfWAgKGVtcHR5KS5cbiAgICAgKiAgLSBJZiB0aGUgaW5uZXIgbWV0aG9kIHRocm93cywgdGhlIHRocm93IGlzIGNhdWdodCBhbmQgY29udmVydGVkIHRvXG4gICAgICogICAgYHsgc3VjY2VzczogZmFsc2UsIGVycm9yLCBjYXB0dXJlZExvZ3MgfWAgc28gdGhlIGhvc3QgYWx3YXlzIHNlZXNcbiAgICAgKiAgICBhIHN0cnVjdHVyZWQgZW52ZWxvcGUgcGx1cyB0aGUgbG9ncyB0aGF0IHJhbiB1cCB0byB0aGUgdGhyb3cuXG4gICAgICogIC0gSWYgdGhlIGlubmVyIG1ldGhvZCByZXR1cm5zIGFuIG9iamVjdCwgY2FwdHVyZWRMb2dzIGlzIG1lcmdlZFxuICAgICAqICAgIGFsb25nc2lkZSBpdHMga2V5cyB3aXRob3V0IG92ZXJ3cml0aW5nICh3ZSB1c2UgYD8/IGNhcHR1cmVzYFxuICAgICAqICAgIHNlbWFudGljczogb25seSBzZXQgaWYgbm90IGFscmVhZHkgcHJlc2VudCkuXG4gICAgICovXG4gICAgYXN5bmMgcnVuV2l0aENhcHR1cmUobWV0aG9kTmFtZTogc3RyaW5nLCBtZXRob2RBcmdzPzogdW5rbm93bltdKSB7XG4gICAgICAgIGNvbnN0IHNsb3Q6IENhcHR1cmVTbG90ID0ge1xuICAgICAgICAgICAgZW50cmllczogW10sXG4gICAgICAgICAgICBieXRlczogMCxcbiAgICAgICAgICAgIHRydW5jYXRlZDogZmFsc2UsXG4gICAgICAgIH07XG4gICAgICAgIC8vIHYyLjQuMTEgcm91bmQtMyBjb2RleCDwn5S0ICsgY2xhdWRlIPCfn6EgKyBnZW1pbmkg8J+foTogaW5jcmVtZW50IElOU0lERVxuICAgICAgICAvLyB0aGUgdHJ5IHNvIF9lbnN1cmVDb25zb2xlSG9vayB0aHJvd2luZyAodG9kYXk6IHB1cmUgYXNzaWdubWVudHMsXG4gICAgICAgIC8vIHNvIHNhZmU7IGRlZmVuc2l2ZSBhZ2FpbnN0IGZ1dHVyZSBncm93dGgpIGNhbm5vdCBsZWFrIHRoZVxuICAgICAgICAvLyByZWZjb3VudCBhbmQgbGVhdmUgdGhlIGNvbnNvbGUgaG9vayBpbnN0YWxsZWQgZm9yZXZlci5cbiAgICAgICAgX2FjdGl2ZVNsb3RDb3VudCArPSAxO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgX2Vuc3VyZUNvbnNvbGVIb29rKCk7XG4gICAgICAgICAgICAvLyB2Mi40LjEwIHJvdW5kLTIgY29kZXgg8J+UtCArIGNsYXVkZSDwn5+hICsgZ2VtaW5pIPCfn6E6IEFzeW5jTG9jYWxTdG9yYWdlXG4gICAgICAgICAgICAvLyBiaW5kcyBgc2xvdGAgdG8gdGhpcyBjYWxsJ3MgbG9naWNhbCBhc3luYyBjb250ZXh0LCBzbyBhbnlcbiAgICAgICAgICAgIC8vIGNvbnNvbGUubG9nIGVtaXR0ZWQgYnkgdGhlIGlubmVyIG1ldGhvZCAob3IgYW55IGRlc2NlbmRhbnRcbiAgICAgICAgICAgIC8vIG1pY3JvdGFzaywgZXZlbiBhZnRlciBgYXdhaXRgIGJvdW5kYXJpZXMgd2hlbiBvdGhlciBjYWxscyBhcmVcbiAgICAgICAgICAgIC8vIGFsc28gYWN0aXZlKSByb3V0ZXMgdG8gVEhJUyBzbG90IOKAlCBub3Qgd2hpY2hldmVyIHdhc1xuICAgICAgICAgICAgLy8gdG9wLW9mLXN0YWNrIGF0IHRoZSBtb21lbnQgdGhlIGxvZyBmaXJlZC4gRWxpbWluYXRlc1xuICAgICAgICAgICAgLy8gY3Jvc3MtY2FsbCBsZWFrYWdlIGZyb20gaW50ZXJsZWF2ZWQgYXN5bmMgcnVucy5cbiAgICAgICAgICAgIHJldHVybiBhd2FpdCBfY2FwdHVyZUFMUy5ydW4oc2xvdCwgYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGZuID0gbWV0aG9kc1ttZXRob2ROYW1lXTtcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGZuICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yOiBgcnVuV2l0aENhcHR1cmU6IG1ldGhvZCAke21ldGhvZE5hbWV9IG5vdCBmb3VuZGAsXG4gICAgICAgICAgICAgICAgICAgICAgICBjYXB0dXJlZExvZ3M6IHNsb3QuZW50cmllcyxcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZm4oLi4uKG1ldGhvZEFyZ3MgPz8gW10pKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdCAmJiB0eXBlb2YgcmVzdWx0ID09PSAnb2JqZWN0JyAmJiAhQXJyYXkuaXNBcnJheShyZXN1bHQpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4geyAuLi5yZXN1bHQsIGNhcHR1cmVkTG9nczogKHJlc3VsdCBhcyBhbnkpLmNhcHR1cmVkTG9ncyA/PyBzbG90LmVudHJpZXMgfTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBkYXRhOiByZXN1bHQsIGNhcHR1cmVkTG9nczogc2xvdC5lbnRyaWVzIH07XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhcHR1cmVkTG9nczogc2xvdC5lbnRyaWVzLFxuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgICAgX2FjdGl2ZVNsb3RDb3VudCA9IE1hdGgubWF4KDAsIF9hY3RpdmVTbG90Q291bnQgLSAxKTtcbiAgICAgICAgICAgIF9tYXliZVVuaG9va0NvbnNvbGUoKTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBBZGQgY29tcG9uZW50IHRvIGEgbm9kZVxuICAgICAqL1xuICAgIGFkZENvbXBvbmVudFRvTm9kZShub2RlVXVpZDogc3RyaW5nLCBjb21wb25lbnRUeXBlOiBzdHJpbmcpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IsIGpzIH0gPSByZXF1aXJlKCdjYycpO1xuICAgICAgICAgICAgY29uc3Qgc2NlbmUgPSBkaXJlY3Rvci5nZXRTY2VuZSgpO1xuICAgICAgICAgICAgaWYgKCFzY2VuZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ05vIGFjdGl2ZSBzY2VuZScgfTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gRmluZCBub2RlIGJ5IFVVSURcbiAgICAgICAgICAgIGNvbnN0IG5vZGUgPSBzY2VuZS5nZXRDaGlsZEJ5VXVpZChub2RlVXVpZCk7XG4gICAgICAgICAgICBpZiAoIW5vZGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBOb2RlIHdpdGggVVVJRCAke25vZGVVdWlkfSBub3QgZm91bmRgIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIEdldCBjb21wb25lbnQgY2xhc3NcbiAgICAgICAgICAgIGNvbnN0IENvbXBvbmVudENsYXNzID0ganMuZ2V0Q2xhc3NCeU5hbWUoY29tcG9uZW50VHlwZSk7XG4gICAgICAgICAgICBpZiAoIUNvbXBvbmVudENsYXNzKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgQ29tcG9uZW50IHR5cGUgJHtjb21wb25lbnRUeXBlfSBub3QgZm91bmRgIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIEFkZCBjb21wb25lbnRcbiAgICAgICAgICAgIGNvbnN0IGNvbXBvbmVudCA9IG5vZGUuYWRkQ29tcG9uZW50KENvbXBvbmVudENsYXNzKTtcbiAgICAgICAgICAgIHJldHVybiB7IFxuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsIFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBDb21wb25lbnQgJHtjb21wb25lbnRUeXBlfSBhZGRlZCBzdWNjZXNzZnVsbHlgLFxuICAgICAgICAgICAgICAgIGRhdGE6IHsgY29tcG9uZW50SWQ6IGNvbXBvbmVudC51dWlkIH1cbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3IubWVzc2FnZSB9O1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIENyZWF0ZSBhIG5ldyBub2RlXG4gICAgICovXG4gICAgY3JlYXRlTm9kZShuYW1lOiBzdHJpbmcsIHBhcmVudFV1aWQ/OiBzdHJpbmcpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IsIE5vZGUgfSA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgICAgICBpZiAoIXNjZW5lKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnTm8gYWN0aXZlIHNjZW5lJyB9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBub2RlID0gbmV3IE5vZGUobmFtZSk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmIChwYXJlbnRVdWlkKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcGFyZW50ID0gc2NlbmUuZ2V0Q2hpbGRCeVV1aWQocGFyZW50VXVpZCk7XG4gICAgICAgICAgICAgICAgaWYgKHBhcmVudCkge1xuICAgICAgICAgICAgICAgICAgICBwYXJlbnQuYWRkQ2hpbGQobm9kZSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgc2NlbmUuYWRkQ2hpbGQobm9kZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBzY2VuZS5hZGRDaGlsZChub2RlKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHsgXG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSwgXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogYE5vZGUgJHtuYW1lfSBjcmVhdGVkIHN1Y2Nlc3NmdWxseWAsXG4gICAgICAgICAgICAgICAgZGF0YTogeyB1dWlkOiBub2RlLnV1aWQsIG5hbWU6IG5vZGUubmFtZSB9XG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycm9yLm1lc3NhZ2UgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBHZXQgbm9kZSBpbmZvcm1hdGlvblxuICAgICAqL1xuICAgIGdldE5vZGVJbmZvKG5vZGVVdWlkOiBzdHJpbmcpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IgfSA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgICAgICBpZiAoIXNjZW5lKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnTm8gYWN0aXZlIHNjZW5lJyB9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBub2RlID0gc2NlbmUuZ2V0Q2hpbGRCeVV1aWQobm9kZVV1aWQpO1xuICAgICAgICAgICAgaWYgKCFub2RlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgTm9kZSB3aXRoIFVVSUQgJHtub2RlVXVpZH0gbm90IGZvdW5kYCB9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICB1dWlkOiBub2RlLnV1aWQsXG4gICAgICAgICAgICAgICAgICAgIG5hbWU6IG5vZGUubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgYWN0aXZlOiBub2RlLmFjdGl2ZSxcbiAgICAgICAgICAgICAgICAgICAgcG9zaXRpb246IG5vZGUucG9zaXRpb24sXG4gICAgICAgICAgICAgICAgICAgIHJvdGF0aW9uOiBub2RlLnJvdGF0aW9uLFxuICAgICAgICAgICAgICAgICAgICBzY2FsZTogbm9kZS5zY2FsZSxcbiAgICAgICAgICAgICAgICAgICAgcGFyZW50OiBub2RlLnBhcmVudD8udXVpZCxcbiAgICAgICAgICAgICAgICAgICAgY2hpbGRyZW46IG5vZGUuY2hpbGRyZW4ubWFwKChjaGlsZDogYW55KSA9PiBjaGlsZC51dWlkKSxcbiAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50czogbm9kZS5jb21wb25lbnRzLm1hcCgoY29tcDogYW55KSA9PiAoe1xuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogY29tcC5jb25zdHJ1Y3Rvci5uYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgZW5hYmxlZDogY29tcC5lbmFibGVkXG4gICAgICAgICAgICAgICAgICAgIH0pKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3IubWVzc2FnZSB9O1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEdldCBhbGwgbm9kZXMgaW4gc2NlbmVcbiAgICAgKi9cbiAgICBnZXRBbGxOb2RlcygpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IgfSA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgICAgICBpZiAoIXNjZW5lKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnTm8gYWN0aXZlIHNjZW5lJyB9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBub2RlczogYW55W10gPSBbXTtcbiAgICAgICAgICAgIGNvbnN0IGNvbGxlY3ROb2RlcyA9IChub2RlOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBub2Rlcy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgdXVpZDogbm9kZS51dWlkLFxuICAgICAgICAgICAgICAgICAgICBuYW1lOiBub2RlLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgIGFjdGl2ZTogbm9kZS5hY3RpdmUsXG4gICAgICAgICAgICAgICAgICAgIHBhcmVudDogbm9kZS5wYXJlbnQ/LnV1aWRcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBub2RlLmNoaWxkcmVuLmZvckVhY2goKGNoaWxkOiBhbnkpID0+IGNvbGxlY3ROb2RlcyhjaGlsZCkpO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgc2NlbmUuY2hpbGRyZW4uZm9yRWFjaCgoY2hpbGQ6IGFueSkgPT4gY29sbGVjdE5vZGVzKGNoaWxkKSk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IG5vZGVzIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3IubWVzc2FnZSB9O1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEZpbmQgbm9kZSBieSBuYW1lXG4gICAgICovXG4gICAgZmluZE5vZGVCeU5hbWUobmFtZTogc3RyaW5nKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCB7IGRpcmVjdG9yIH0gPSByZXF1aXJlKCdjYycpO1xuICAgICAgICAgICAgY29uc3Qgc2NlbmUgPSBkaXJlY3Rvci5nZXRTY2VuZSgpO1xuICAgICAgICAgICAgaWYgKCFzY2VuZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ05vIGFjdGl2ZSBzY2VuZScgfTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3Qgbm9kZSA9IHNjZW5lLmdldENoaWxkQnlOYW1lKG5hbWUpO1xuICAgICAgICAgICAgaWYgKCFub2RlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgTm9kZSB3aXRoIG5hbWUgJHtuYW1lfSBub3QgZm91bmRgIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIHV1aWQ6IG5vZGUudXVpZCxcbiAgICAgICAgICAgICAgICAgICAgbmFtZTogbm9kZS5uYW1lLFxuICAgICAgICAgICAgICAgICAgICBhY3RpdmU6IG5vZGUuYWN0aXZlLFxuICAgICAgICAgICAgICAgICAgICBwb3NpdGlvbjogbm9kZS5wb3NpdGlvblxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3IubWVzc2FnZSB9O1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEdldCBjdXJyZW50IHNjZW5lIGluZm9ybWF0aW9uXG4gICAgICovXG4gICAgZ2V0Q3VycmVudFNjZW5lSW5mbygpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IgfSA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgICAgICBpZiAoIXNjZW5lKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnTm8gYWN0aXZlIHNjZW5lJyB9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICBuYW1lOiBzY2VuZS5uYW1lLFxuICAgICAgICAgICAgICAgICAgICB1dWlkOiBzY2VuZS51dWlkLFxuICAgICAgICAgICAgICAgICAgICBub2RlQ291bnQ6IHNjZW5lLmNoaWxkcmVuLmxlbmd0aFxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3IubWVzc2FnZSB9O1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFNldCBub2RlIHByb3BlcnR5XG4gICAgICovXG4gICAgc2V0Tm9kZVByb3BlcnR5KG5vZGVVdWlkOiBzdHJpbmcsIHByb3BlcnR5OiBzdHJpbmcsIHZhbHVlOiBhbnkpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IgfSA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgICAgICBpZiAoIXNjZW5lKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnTm8gYWN0aXZlIHNjZW5lJyB9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBub2RlID0gc2NlbmUuZ2V0Q2hpbGRCeVV1aWQobm9kZVV1aWQpO1xuICAgICAgICAgICAgaWYgKCFub2RlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgTm9kZSB3aXRoIFVVSUQgJHtub2RlVXVpZH0gbm90IGZvdW5kYCB9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyDoqK3nva7lsazmgKdcbiAgICAgICAgICAgIGlmIChwcm9wZXJ0eSA9PT0gJ3Bvc2l0aW9uJykge1xuICAgICAgICAgICAgICAgIG5vZGUuc2V0UG9zaXRpb24odmFsdWUueCB8fCAwLCB2YWx1ZS55IHx8IDAsIHZhbHVlLnogfHwgMCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5ID09PSAncm90YXRpb24nKSB7XG4gICAgICAgICAgICAgICAgbm9kZS5zZXRSb3RhdGlvbkZyb21FdWxlcih2YWx1ZS54IHx8IDAsIHZhbHVlLnkgfHwgMCwgdmFsdWUueiB8fCAwKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHkgPT09ICdzY2FsZScpIHtcbiAgICAgICAgICAgICAgICBub2RlLnNldFNjYWxlKHZhbHVlLnggfHwgMSwgdmFsdWUueSB8fCAxLCB2YWx1ZS56IHx8IDEpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eSA9PT0gJ2FjdGl2ZScpIHtcbiAgICAgICAgICAgICAgICBub2RlLmFjdGl2ZSA9IHZhbHVlO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eSA9PT0gJ25hbWUnKSB7XG4gICAgICAgICAgICAgICAgbm9kZS5uYW1lID0gdmFsdWU7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIOWYl+ippuebtOaOpeioree9ruWxrOaAp1xuICAgICAgICAgICAgICAgIChub2RlIGFzIGFueSlbcHJvcGVydHldID0gdmFsdWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB7IFxuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsIFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBQcm9wZXJ0eSAnJHtwcm9wZXJ0eX0nIHVwZGF0ZWQgc3VjY2Vzc2Z1bGx5YCBcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3IubWVzc2FnZSB9O1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEdldCBzY2VuZSBoaWVyYXJjaHlcbiAgICAgKi9cbiAgICBnZXRTY2VuZUhpZXJhcmNoeShpbmNsdWRlQ29tcG9uZW50czogYm9vbGVhbiA9IGZhbHNlKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCB7IGRpcmVjdG9yIH0gPSByZXF1aXJlKCdjYycpO1xuICAgICAgICAgICAgY29uc3Qgc2NlbmUgPSBkaXJlY3Rvci5nZXRTY2VuZSgpO1xuICAgICAgICAgICAgaWYgKCFzY2VuZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ05vIGFjdGl2ZSBzY2VuZScgfTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgcHJvY2Vzc05vZGUgPSAobm9kZTogYW55KTogYW55ID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQ6IGFueSA9IHtcbiAgICAgICAgICAgICAgICAgICAgbmFtZTogbm9kZS5uYW1lLFxuICAgICAgICAgICAgICAgICAgICB1dWlkOiBub2RlLnV1aWQsXG4gICAgICAgICAgICAgICAgICAgIGFjdGl2ZTogbm9kZS5hY3RpdmUsXG4gICAgICAgICAgICAgICAgICAgIGNoaWxkcmVuOiBbXVxuICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgICBpZiAoaW5jbHVkZUNvbXBvbmVudHMpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0LmNvbXBvbmVudHMgPSBub2RlLmNvbXBvbmVudHMubWFwKChjb21wOiBhbnkpID0+ICh7XG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiBjb21wLmNvbnN0cnVjdG9yLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBlbmFibGVkOiBjb21wLmVuYWJsZWRcbiAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChub2RlLmNoaWxkcmVuICYmIG5vZGUuY2hpbGRyZW4ubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICByZXN1bHQuY2hpbGRyZW4gPSBub2RlLmNoaWxkcmVuLm1hcCgoY2hpbGQ6IGFueSkgPT4gcHJvY2Vzc05vZGUoY2hpbGQpKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgY29uc3QgaGllcmFyY2h5ID0gc2NlbmUuY2hpbGRyZW4ubWFwKChjaGlsZDogYW55KSA9PiBwcm9jZXNzTm9kZShjaGlsZCkpO1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogaGllcmFyY2h5IH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3IubWVzc2FnZSB9O1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIENyZWF0ZSBwcmVmYWIgYXNzZXQgZnJvbSBhIG5vZGUgdmlhIHRoZSBvZmZpY2lhbCBzY2VuZSBmYWNhZGUuXG4gICAgICpcbiAgICAgKiBSb3V0ZXMgdGhyb3VnaCBgY2NlLlByZWZhYi5jcmVhdGVQcmVmYWJgICh0aGUgQ29jb3MgZWRpdG9yIHByZWZhYlxuICAgICAqIG1hbmFnZXIgZXhwb3NlZCBpbiBzY2VuZS1zY3JpcHQgY29udGV4dCkuIFRoZSB1cmwgYWNjZXB0cyBib3RoXG4gICAgICogYGRiOi8vYXNzZXRzLy4uLmAgYW5kIGFic29sdXRlIGZpbGVzeXN0ZW0gcGF0aHMgaW4gZGlmZmVyZW50IGVkaXRvclxuICAgICAqIGJ1aWxkcywgc28gd2UgdHJ5IGJvdGggc2hhcGVzIGFuZCBzdXJmYWNlIHdoaWNoZXZlciBmYWlscy5cbiAgICAgKi9cbiAgICBhc3luYyBjcmVhdGVQcmVmYWJGcm9tTm9kZShub2RlVXVpZDogc3RyaW5nLCB1cmw6IHN0cmluZykge1xuICAgICAgICBjb25zdCBwcmVmYWJNZ3IgPSBnZXRQcmVmYWJGYWNhZGUoKTtcbiAgICAgICAgaWYgKCFwcmVmYWJNZ3Iub2spIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogcHJlZmFiTWdyLmVycm9yIH07XG4gICAgICAgIH1cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHRyaWVzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICAgICAgLy8gUHJlZmVyIGRiOi8vIGZvcm0gKG1hdGNoZXMgYXNzZXQtZGIgcXVlcnkgcmVzdWx0cykgYW5kIGZhbGxcbiAgICAgICAgICAgIC8vIGJhY2sgdG8gd2hhdGV2ZXIgdGhlIGNhbGxlciBwYXNzZWQgdmVyYmF0aW0uXG4gICAgICAgICAgICBjb25zdCBkYlVybCA9IHVybC5zdGFydHNXaXRoKCdkYjovLycpID8gdXJsIDogYGRiOi8vYXNzZXRzLyR7dXJsLnJlcGxhY2UoL15cXC8rLywgJycpfWA7XG4gICAgICAgICAgICB0cmllcy5wdXNoKGRiVXJsKTtcbiAgICAgICAgICAgIGlmIChkYlVybCAhPT0gdXJsKSB7XG4gICAgICAgICAgICAgICAgdHJpZXMucHVzaCh1cmwpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBlcnJvcnM6IHN0cmluZ1tdID0gW107XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGNhbmRpZGF0ZSBvZiB0cmllcykge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHByZWZhYk1nci52YWx1ZS5jcmVhdGVQcmVmYWIobm9kZVV1aWQsIGNhbmRpZGF0ZSk7XG4gICAgICAgICAgICAgICAgICAgIC8vIGNjZS5QcmVmYWIuY3JlYXRlUHJlZmFiIHJlcHVycG9zZXMgdGhlIHNvdXJjZSBub2RlIGludG8gYVxuICAgICAgICAgICAgICAgICAgICAvLyBwcmVmYWIgaW5zdGFuY2Ugd2l0aCBhIGZyZXNoIFVVSUQsIHNvIHRoZSBjYWxsZXItc3VwcGxpZWRcbiAgICAgICAgICAgICAgICAgICAgLy8gbm9kZVV1aWQgaXMgbm8gbG9uZ2VyIHZhbGlkLiBSZXNvbHZlIHRoZSBuZXcgVVVJRCBieVxuICAgICAgICAgICAgICAgICAgICAvLyBxdWVyeWluZyBub2RlcyB0aGF0IHJlZmVyZW5jZSB0aGUgZnJlc2hseSBtaW50ZWQgYXNzZXQuXG4gICAgICAgICAgICAgICAgICAgIGxldCBhc3NldFV1aWQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICAgICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHJlc3VsdCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFzc2V0VXVpZCA9IHJlc3VsdDtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChyZXN1bHQgJiYgdHlwZW9mIHJlc3VsdCA9PT0gJ29iamVjdCcgJiYgdHlwZW9mIChyZXN1bHQgYXMgYW55KS51dWlkID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXNzZXRVdWlkID0gKHJlc3VsdCBhcyBhbnkpLnV1aWQ7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgbGV0IGluc3RhbmNlTm9kZVV1aWQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICAgICAgICAgICAgICAgICAgICBpZiAoYXNzZXRVdWlkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGluc3RhbmNlczogYW55ID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktbm9kZXMtYnktYXNzZXQtdXVpZCcsIGFzc2V0VXVpZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoaW5zdGFuY2VzKSAmJiBpbnN0YW5jZXMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBOZXdseS1jcmVhdGVkIHByZWZhYiBpbnN0YW5jZSBpcyB0eXBpY2FsbHkgdGhlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGxhc3QgZW50cnkuIENhdmVhdDogaWYgdGhlIHNhbWUgYXNzZXQgYWxyZWFkeVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBoYWQgaW5zdGFuY2VzIGluIHRoZSBzY2VuZSwgXCJsYXN0XCIgcGlja3Mgb25lXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIG9mIHRoZW0gcmF0aGVyIHRoYW4gdGhlIG5ldyBvbmUuIFRoZSBlZGl0b3JcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gYXBwZWFycyB0byByZXR1cm4gY3JlYXRpb24gb3JkZXIsIGJ1dCB0aGUgQVBJXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGlzIHVuZG9jdW1lbnRlZDsgY2FsbGVycyByZXF1aXJpbmcgc3RyaWN0XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGlkZW50aWZpY2F0aW9uIHNob3VsZCBzbmFwc2hvdCBiZWZvcmUgY2FsbGluZy5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaW5zdGFuY2VOb2RlVXVpZCA9IGluc3RhbmNlc1tpbnN0YW5jZXMubGVuZ3RoIC0gMV07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gTm9uLWZhdGFsOiB0aGUgYXNzZXQgd2FzIGNyZWF0ZWQgZWl0aGVyIHdheS5cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB1cmw6IGNhbmRpZGF0ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzb3VyY2VOb2RlVXVpZDogbm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJlZmFiQXNzZXRVdWlkOiBhc3NldFV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaW5zdGFuY2VOb2RlVXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByYXc6IHJlc3VsdCxcbiAgICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgICAgICAgICAgZXJyb3JzLnB1c2goYCR7Y2FuZGlkYXRlfTogJHtlcnI/Lm1lc3NhZ2UgPz8gZXJyfWApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgZXJyb3I6IGBjY2UuUHJlZmFiLmNyZWF0ZVByZWZhYiBmYWlsZWQ6ICR7ZXJyb3JzLmpvaW4oJzsgJyl9YCxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3I/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycm9yKSB9O1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFB1c2ggcHJlZmFiIGluc3RhbmNlIGVkaXRzIGJhY2sgdG8gdGhlIHByZWZhYiBhc3NldC5cbiAgICAgKiBXcmFwcyBzY2VuZSBmYWNhZGUgYGFwcGx5UHJlZmFiKG5vZGVVdWlkKWAuXG4gICAgICovXG4gICAgYXN5bmMgYXBwbHlQcmVmYWIobm9kZVV1aWQ6IHN0cmluZykge1xuICAgICAgICBjb25zdCBwcmVmYWJNZ3IgPSBnZXRQcmVmYWJGYWNhZGUoKTtcbiAgICAgICAgaWYgKCFwcmVmYWJNZ3Iub2spIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogcHJlZmFiTWdyLmVycm9yIH07XG4gICAgICAgIH1cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIE5vdGU6IGZhY2FkZVJldHVybiBmcm9tIGNjZS5TY2VuZUZhY2FkZS5hcHBseVByZWZhYiBpcyBvYnNlcnZlZFxuICAgICAgICAgICAgLy8gdG8gYmUgYGZhbHNlYCBldmVuIHdoZW4gdGhlIGFwcGx5IGdlbnVpbmVseSB3cml0ZXMgdG8gZGlza1xuICAgICAgICAgICAgLy8gKHZlcmlmaWVkIGR1cmluZyBQNCB2Mi4xLjAgcmVhbC1lZGl0b3IgdGVzdGluZykuIFRyZWF0XG4gICAgICAgICAgICAvLyBcIm5vIGV4Y2VwdGlvbiB0aHJvd25cIiBhcyBzdWNjZXNzIGFuZCBzdXJmYWNlIHRoZSByYXcgcmV0dXJuXG4gICAgICAgICAgICAvLyB2YWx1ZSBhcyBtZXRhZGF0YSBvbmx5LlxuICAgICAgICAgICAgY29uc3QgZmFjYWRlUmV0dXJuID0gYXdhaXQgcHJlZmFiTWdyLnZhbHVlLmFwcGx5UHJlZmFiKG5vZGVVdWlkKTtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IHsgZmFjYWRlUmV0dXJuLCBub2RlVXVpZCB9IH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3I/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycm9yKSB9O1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIENvbm5lY3QgYSByZWd1bGFyIG5vZGUgdG8gYSBwcmVmYWIgYXNzZXQgKGxpbmspLlxuICAgICAqIFdyYXBzIHNjZW5lIGZhY2FkZSBgbGlua1ByZWZhYihub2RlVXVpZCwgYXNzZXRVdWlkKWAuXG4gICAgICovXG4gICAgYXN5bmMgbGlua1ByZWZhYihub2RlVXVpZDogc3RyaW5nLCBhc3NldFV1aWQ6IHN0cmluZykge1xuICAgICAgICBjb25zdCBwcmVmYWJNZ3IgPSBnZXRQcmVmYWJGYWNhZGUoKTtcbiAgICAgICAgaWYgKCFwcmVmYWJNZ3Iub2spIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogcHJlZmFiTWdyLmVycm9yIH07XG4gICAgICAgIH1cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHByZWZhYk1nci52YWx1ZS5saW5rUHJlZmFiKG5vZGVVdWlkLCBhc3NldFV1aWQpO1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogeyBsaW5rZWQ6IHJlc3VsdCwgbm9kZVV1aWQsIGFzc2V0VXVpZCB9IH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3I/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycm9yKSB9O1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEJyZWFrIHRoZSBwcmVmYWIgY29ubmVjdGlvbiBvbiBhIG5vZGUuXG4gICAgICogV3JhcHMgc2NlbmUgZmFjYWRlIGB1bmxpbmtQcmVmYWIobm9kZVV1aWQsIHJlbW92ZU5lc3RlZClgLlxuICAgICAqL1xuICAgIGFzeW5jIHVubGlua1ByZWZhYihub2RlVXVpZDogc3RyaW5nLCByZW1vdmVOZXN0ZWQ6IGJvb2xlYW4pIHtcbiAgICAgICAgY29uc3QgcHJlZmFiTWdyID0gZ2V0UHJlZmFiRmFjYWRlKCk7XG4gICAgICAgIGlmICghcHJlZmFiTWdyLm9rKSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHByZWZhYk1nci5lcnJvciB9O1xuICAgICAgICB9XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBwcmVmYWJNZ3IudmFsdWUudW5saW5rUHJlZmFiKG5vZGVVdWlkLCByZW1vdmVOZXN0ZWQpO1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogeyB1bmxpbmtlZDogcmVzdWx0LCBub2RlVXVpZCwgcmVtb3ZlTmVzdGVkIH0gfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvcj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyb3IpIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogUmVhZCB0aGUgcHJlZmFiIGR1bXAgZm9yIGEgcHJlZmFiIGluc3RhbmNlIG5vZGUuXG4gICAgICogV3JhcHMgc2NlbmUgZmFjYWRlIGBnZXRQcmVmYWJEYXRhKG5vZGVVdWlkKWAuXG4gICAgICovXG4gICAgZ2V0UHJlZmFiRGF0YShub2RlVXVpZDogc3RyaW5nKSB7XG4gICAgICAgIGNvbnN0IHByZWZhYk1nciA9IGdldFByZWZhYkZhY2FkZSgpO1xuICAgICAgICBpZiAoIXByZWZhYk1nci5vaykge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBwcmVmYWJNZ3IuZXJyb3IgfTtcbiAgICAgICAgfVxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgZGF0YSA9IHByZWZhYk1nci52YWx1ZS5nZXRQcmVmYWJEYXRhKG5vZGVVdWlkKTtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGEgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvcj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyb3IpIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQXBwZW5kIGEgY2MuRXZlbnRIYW5kbGVyIGVudHJ5IHRvIGEgY29tcG9uZW50J3MgZXZlbnQgYXJyYXlcbiAgICAgKiAoZS5nLiBjYy5CdXR0b24uY2xpY2tFdmVudHMsIGNjLlRvZ2dsZS5jaGVja0V2ZW50cykuXG4gICAgICpcbiAgICAgKiBQZXJzaXN0ZW5jZSBub3RlIChDTEFVREUubWQgTGFuZG1pbmUgIzExKTogc2NlbmUtc2NyaXB0IGBhcnIucHVzaGBcbiAgICAgKiBvbmx5IG11dGF0ZXMgdGhlIHJ1bnRpbWUgY2MuQ29tcG9uZW50IGluc3RhbmNlOyB0aGUgZWRpdG9yJ3NcbiAgICAgKiBzZXJpYWxpemF0aW9uIG1vZGVsICh3aGF0IGBzYXZlLXNjZW5lYCB3cml0ZXMgdG8gZGlzaykgZG9lcyBub3Qgc2VlXG4gICAgICogdGhlIGNoYW5nZS4gVGhlIGhvc3Qtc2lkZSBjYWxsZXIgKGBjb21wb25lbnQtdG9vbHMudHNgKSBpc1xuICAgICAqIHJlc3BvbnNpYmxlIGZvciBudWRnaW5nIHRoZSBtb2RlbCBhZnRlcndhcmRzIHZpYSBhIG5vLW9wXG4gICAgICogYHNldC1wcm9wZXJ0eWAgb24gYSBjb21wb25lbnQgZmllbGQg4oCUIGNhbGxpbmcgYHNldC1wcm9wZXJ0eWAgZnJvbVxuICAgICAqIGhlcmUgZG9lc24ndCBwcm9wYWdhdGUgKHNjZW5lLXByb2Nlc3MgSVBDIHNob3J0LWNpcmN1aXRzIGFuZFxuICAgICAqIHNraXBzIHRoZSBtb2RlbCBzeW5jKS4gV2Ugc3VyZmFjZSBgY29tcG9uZW50VXVpZGAgYW5kXG4gICAgICogYGNvbXBvbmVudEVuYWJsZWRgIHNvIHRoZSBjYWxsZXIgaGFzIHdoYXQgaXQgbmVlZHMuXG4gICAgICovXG4gICAgYWRkRXZlbnRIYW5kbGVyKFxuICAgICAgICBub2RlVXVpZDogc3RyaW5nLFxuICAgICAgICBjb21wb25lbnRUeXBlOiBzdHJpbmcsXG4gICAgICAgIGV2ZW50QXJyYXlQcm9wZXJ0eTogc3RyaW5nLFxuICAgICAgICB0YXJnZXRVdWlkOiBzdHJpbmcsXG4gICAgICAgIGNvbXBvbmVudE5hbWU6IHN0cmluZyxcbiAgICAgICAgaGFuZGxlcjogc3RyaW5nLFxuICAgICAgICBjdXN0b21FdmVudERhdGE/OiBzdHJpbmcsXG4gICAgKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBjYyA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCBjdHggPSByZXNvbHZlQ29tcG9uZW50Q29udGV4dChub2RlVXVpZCwgY29tcG9uZW50VHlwZSk7XG4gICAgICAgICAgICBpZiAoIWN0eC5vaykge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogY3R4LmVycm9yIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCB0YXJnZXROb2RlID0gZmluZE5vZGVCeVV1aWREZWVwKGN0eC5zY2VuZSwgdGFyZ2V0VXVpZCk7XG4gICAgICAgICAgICBpZiAoIXRhcmdldE5vZGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBUYXJnZXQgbm9kZSB3aXRoIFVVSUQgJHt0YXJnZXRVdWlkfSBub3QgZm91bmRgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBhcnIgPSBjdHguY29tcG9uZW50W2V2ZW50QXJyYXlQcm9wZXJ0eV07XG4gICAgICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkoYXJyKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYFByb3BlcnR5ICcke2V2ZW50QXJyYXlQcm9wZXJ0eX0nIG9uICR7Y29tcG9uZW50VHlwZX0gaXMgbm90IGFuIGFycmF5IChnb3QgJHt0eXBlb2YgYXJyfSlgIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IGVoID0gbmV3IGNjLkV2ZW50SGFuZGxlcigpO1xuICAgICAgICAgICAgZWgudGFyZ2V0ID0gdGFyZ2V0Tm9kZTtcbiAgICAgICAgICAgIGVoLmNvbXBvbmVudCA9IGNvbXBvbmVudE5hbWU7XG4gICAgICAgICAgICBlaC5oYW5kbGVyID0gaGFuZGxlcjtcbiAgICAgICAgICAgIGVoLmN1c3RvbUV2ZW50RGF0YSA9IGN1c3RvbUV2ZW50RGF0YSA/PyAnJztcbiAgICAgICAgICAgIGFyci5wdXNoKGVoKTtcblxuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2Uuc2VuZCgnc2NlbmUnLCAnc25hcHNob3QnKTtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIGluZGV4OiBhcnIubGVuZ3RoIC0gMSxcbiAgICAgICAgICAgICAgICAgICAgY291bnQ6IGFyci5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudFV1aWQ6IGN0eC5jb21wb25lbnQudXVpZCxcbiAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50RW5hYmxlZDogY3R4LmNvbXBvbmVudC5lbmFibGVkICE9PSBmYWxzZSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvcj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyb3IpIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogUmVtb3ZlIGEgY2MuRXZlbnRIYW5kbGVyIGVudHJ5IGJ5IGluZGV4LCBvciBieSBtYXRjaGluZ1xuICAgICAqICh0YXJnZXRVdWlkLCBoYW5kbGVyKSBwYWlyLiBJZiBib3RoIGFyZSBwcm92aWRlZCwgaW5kZXggd2lucy5cbiAgICAgKlxuICAgICAqIFNlZSBhZGRFdmVudEhhbmRsZXIgZm9yIHRoZSBwZXJzaXN0ZW5jZSBub3RlLiBDYWxsZXIgbXVzdCBmb2xsb3cgdXBcbiAgICAgKiB3aXRoIGEgaG9zdC1zaWRlIGBzZXQtcHJvcGVydHlgIG51ZGdlIHVzaW5nIHRoZSByZXR1cm5lZFxuICAgICAqIGBjb21wb25lbnRVdWlkYCAvIGBjb21wb25lbnRFbmFibGVkYCB0byBtYWtlIHRoZSBjaGFuZ2UgdmlzaWJsZSB0b1xuICAgICAqIGBzYXZlLXNjZW5lYC5cbiAgICAgKi9cbiAgICByZW1vdmVFdmVudEhhbmRsZXIoXG4gICAgICAgIG5vZGVVdWlkOiBzdHJpbmcsXG4gICAgICAgIGNvbXBvbmVudFR5cGU6IHN0cmluZyxcbiAgICAgICAgZXZlbnRBcnJheVByb3BlcnR5OiBzdHJpbmcsXG4gICAgICAgIGluZGV4OiBudW1iZXIgfCBudWxsLFxuICAgICAgICB0YXJnZXRVdWlkOiBzdHJpbmcgfCBudWxsLFxuICAgICAgICBoYW5kbGVyOiBzdHJpbmcgfCBudWxsLFxuICAgICkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgY3R4ID0gcmVzb2x2ZUNvbXBvbmVudENvbnRleHQobm9kZVV1aWQsIGNvbXBvbmVudFR5cGUpO1xuICAgICAgICAgICAgaWYgKCFjdHgub2spIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGN0eC5lcnJvciB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgYXJyID0gY3R4LmNvbXBvbmVudFtldmVudEFycmF5UHJvcGVydHldO1xuICAgICAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KGFycikpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBQcm9wZXJ0eSAnJHtldmVudEFycmF5UHJvcGVydHl9JyBvbiAke2NvbXBvbmVudFR5cGV9IGlzIG5vdCBhbiBhcnJheWAgfTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gVHJpbSBhcm91bmQgY29tcGFyaXNvbnMgc28gY2FsbGVycyBwYXNzaW5nIFVVSURzIC8gaGFuZGxlclxuICAgICAgICAgICAgLy8gbmFtZXMgd2l0aCBsZWFkaW5nL3RyYWlsaW5nIHdoaXRlc3BhY2UgKExMTSB0b29sIGFyZ3Mgb2Z0ZW5cbiAgICAgICAgICAgIC8vIGNvbWUgd2l0aCBzdHJheSBzcGFjZXMpIHN0aWxsIGZpbmQgYSBtYXRjaC4gQ3J1Y2lhbDogdGhlXG4gICAgICAgICAgICAvLyBvdXRlciBndWFyZCB0ZXN0cyB0aGUgKnRyaW1tZWQqIHZhbHVlcyB0b28g4oCUIG90aGVyd2lzZSBhXG4gICAgICAgICAgICAvLyB3aGl0ZXNwYWNlLW9ubHkgdGFyZ2V0VXVpZC9oYW5kbGVyIHdvdWxkIHBhc3MgYXMgdHJ1dGh5LFxuICAgICAgICAgICAgLy8gY29sbGFwc2UgdG8gbnVsbCBhZnRlciB0cmltLCBhbmQgdGhlIHByZWRpY2F0ZSB3b3VsZCBtYXRjaFxuICAgICAgICAgICAgLy8gZXZlcnkgZW50cnkgdmFjdW91c2x5LCBzaWxlbnRseSBkZWxldGluZyBhcnJbMF0uXG4gICAgICAgICAgICBjb25zdCB0YXJnZXRVdWlkTm9ybSA9IHRhcmdldFV1aWQ/LnRyaW0oKSB8fCBudWxsO1xuICAgICAgICAgICAgY29uc3QgaGFuZGxlck5vcm0gPSBoYW5kbGVyPy50cmltKCkgfHwgbnVsbDtcbiAgICAgICAgICAgIGxldCByZW1vdmVBdCA9IC0xO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBpbmRleCA9PT0gJ251bWJlcicgJiYgaW5kZXggPj0gMCkge1xuICAgICAgICAgICAgICAgIHJlbW92ZUF0ID0gaW5kZXg7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRhcmdldFV1aWROb3JtIHx8IGhhbmRsZXJOb3JtKSB7XG4gICAgICAgICAgICAgICAgcmVtb3ZlQXQgPSBhcnIuZmluZEluZGV4KChlaDogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGVoVGFyZ2V0VXVpZCA9IHR5cGVvZiBlaD8udGFyZ2V0Py51dWlkID09PSAnc3RyaW5nJyA/IGVoLnRhcmdldC51dWlkLnRyaW0oKSA6IGVoPy50YXJnZXQ/LnV1aWQ7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGVoSGFuZGxlciA9IHR5cGVvZiBlaD8uaGFuZGxlciA9PT0gJ3N0cmluZycgPyBlaC5oYW5kbGVyLnRyaW0oKSA6IGVoPy5oYW5kbGVyO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBtYXRjaGVzVGFyZ2V0ID0gIXRhcmdldFV1aWROb3JtIHx8IGVoVGFyZ2V0VXVpZCA9PT0gdGFyZ2V0VXVpZE5vcm07XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG1hdGNoZXNIYW5kbGVyID0gIWhhbmRsZXJOb3JtIHx8IGVoSGFuZGxlciA9PT0gaGFuZGxlck5vcm07XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBtYXRjaGVzVGFyZ2V0ICYmIG1hdGNoZXNIYW5kbGVyO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHJlbW92ZUF0IDwgMCB8fCByZW1vdmVBdCA+PSBhcnIubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnTm8gbWF0Y2hpbmcgZXZlbnQgaGFuZGxlciB0byByZW1vdmUnIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCByZW1vdmVkID0gYXJyLnNwbGljZShyZW1vdmVBdCwgMSlbMF07XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5zZW5kKCdzY2VuZScsICdzbmFwc2hvdCcpO1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgaW5kZXg6IHJlbW92ZUF0LFxuICAgICAgICAgICAgICAgICAgICByZW1haW5pbmc6IGFyci5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgIHJlbW92ZWQ6IHNlcmlhbGl6ZUV2ZW50SGFuZGxlcihyZW1vdmVkKSxcbiAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50VXVpZDogY3R4LmNvbXBvbmVudC51dWlkLFxuICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRFbmFibGVkOiBjdHguY29tcG9uZW50LmVuYWJsZWQgIT09IGZhbHNlLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycm9yPy5tZXNzYWdlID8/IFN0cmluZyhlcnJvcikgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBJbnNwZWN0IGEgY29tcG9uZW50J3MgRXZlbnRIYW5kbGVyIGFycmF5IChyZWFkLW9ubHkpLlxuICAgICAqL1xuICAgIGxpc3RFdmVudEhhbmRsZXJzKG5vZGVVdWlkOiBzdHJpbmcsIGNvbXBvbmVudFR5cGU6IHN0cmluZywgZXZlbnRBcnJheVByb3BlcnR5OiBzdHJpbmcpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGN0eCA9IHJlc29sdmVDb21wb25lbnRDb250ZXh0KG5vZGVVdWlkLCBjb21wb25lbnRUeXBlKTtcbiAgICAgICAgICAgIGlmICghY3R4Lm9rKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBjdHguZXJyb3IgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGFyciA9IGN0eC5jb21wb25lbnRbZXZlbnRBcnJheVByb3BlcnR5XTtcbiAgICAgICAgICAgIGlmICghQXJyYXkuaXNBcnJheShhcnIpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgUHJvcGVydHkgJyR7ZXZlbnRBcnJheVByb3BlcnR5fScgb24gJHtjb21wb25lbnRUeXBlfSBpcyBub3QgYW4gYXJyYXlgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICBjb3VudDogYXJyLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgaGFuZGxlcnM6IGFyci5tYXAoc2VyaWFsaXplRXZlbnRIYW5kbGVyKSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvcj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyb3IpIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogdjIuNC44IEEyOiBjYy5BbmltYXRpb24gZHJpdmVycyDigJQgc2VlIHNvdXJjZS90b29scy9hbmltYXRpb24tdG9vbHMudHMuXG4gICAgICogSW1wbGVtZW50YXRpb24gbm90ZTogY29jb3MgZXhwb3NlcyB0aGUgZW5naW5lJ3MgYGNjLkFuaW1hdGlvbmAgKGFuZFxuICAgICAqIGl0cyBzdWItY2xhc3NlcyB2aWEgYGpzLmdldENsYXNzQnlOYW1lYCkuIFdlIHVzZSB0aGUgcnVudGltZSBBUElcbiAgICAgKiAoYGdldENvbXBvbmVudCgnY2MuQW5pbWF0aW9uJylgKSByYXRoZXIgdGhhbiB0aGUgZWRpdG9yJ3Mgc2V0LXByb3BlcnR5XG4gICAgICogY2hhbm5lbCBiZWNhdXNlIHRoZSBsYXR0ZXIgd291bGQgb25seSBwZXJzaXN0IGRlZmF1bHRDbGlwIC8gcGxheU9uTG9hZFxuICAgICAqIGJ1dCBjYW5ub3QgdHJpZ2dlciBwbGF5KCkvc3RvcCgpIOKAlCB0aG9zZSBhcmUgcnVudGltZSBtZXRob2RzIG9ubHkuXG4gICAgICovXG4gICAgZ2V0QW5pbWF0aW9uQ2xpcHMobm9kZVV1aWQ6IHN0cmluZykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgeyBkaXJlY3RvciB9ID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICAgICAgICAgIGlmICghc2NlbmUpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ05vIGFjdGl2ZSBzY2VuZScgfTtcbiAgICAgICAgICAgIGNvbnN0IG5vZGUgPSBmaW5kTm9kZUJ5VXVpZERlZXAoc2NlbmUsIG5vZGVVdWlkKTtcbiAgICAgICAgICAgIGlmICghbm9kZSkgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgTm9kZSAke25vZGVVdWlkfSBub3QgZm91bmRgIH07XG4gICAgICAgICAgICBjb25zdCBhbmltID0gbm9kZS5nZXRDb21wb25lbnQoJ2NjLkFuaW1hdGlvbicpO1xuICAgICAgICAgICAgaWYgKCFhbmltKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgTm9kZSAke25vZGVVdWlkfSBoYXMgbm8gY2MuQW5pbWF0aW9uIGNvbXBvbmVudGAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGNsaXBzOiBhbnlbXSA9IGFuaW0uY2xpcHMgPz8gW107XG4gICAgICAgICAgICBjb25zdCBkZWZhdWx0Q2xpcE5hbWUgPSBhbmltLmRlZmF1bHRDbGlwPy5uYW1lID8/IG51bGw7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICBub2RlVXVpZCxcbiAgICAgICAgICAgICAgICAgICAgbm9kZU5hbWU6IG5vZGUubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgZGVmYXVsdENsaXA6IGRlZmF1bHRDbGlwTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgcGxheU9uTG9hZDogYW5pbS5wbGF5T25Mb2FkID09PSB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBjbGlwczogY2xpcHMuZmlsdGVyKGMgPT4gYykubWFwKGMgPT4gKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG5hbWU6IGMubmFtZSA/PyBudWxsLFxuICAgICAgICAgICAgICAgICAgICAgICAgdXVpZDogYy5fdXVpZCA/PyBjLnV1aWQgPz8gbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGR1cmF0aW9uOiB0eXBlb2YgYy5kdXJhdGlvbiA9PT0gJ251bWJlcicgPyBjLmR1cmF0aW9uIDogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHdyYXBNb2RlOiBjLndyYXBNb2RlID8/IG51bGwsXG4gICAgICAgICAgICAgICAgICAgIH0pKSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvcj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyb3IpIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgcGxheUFuaW1hdGlvbihub2RlVXVpZDogc3RyaW5nLCBjbGlwTmFtZT86IHN0cmluZykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgeyBkaXJlY3RvciB9ID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICAgICAgICAgIGlmICghc2NlbmUpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ05vIGFjdGl2ZSBzY2VuZScgfTtcbiAgICAgICAgICAgIGNvbnN0IG5vZGUgPSBmaW5kTm9kZUJ5VXVpZERlZXAoc2NlbmUsIG5vZGVVdWlkKTtcbiAgICAgICAgICAgIGlmICghbm9kZSkgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgTm9kZSAke25vZGVVdWlkfSBub3QgZm91bmRgIH07XG4gICAgICAgICAgICBjb25zdCBhbmltID0gbm9kZS5nZXRDb21wb25lbnQoJ2NjLkFuaW1hdGlvbicpO1xuICAgICAgICAgICAgaWYgKCFhbmltKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgTm9kZSAke25vZGVVdWlkfSBoYXMgbm8gY2MuQW5pbWF0aW9uIGNvbXBvbmVudGAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChjbGlwTmFtZSkge1xuICAgICAgICAgICAgICAgIC8vIFZhbGlkYXRlIGNsaXAgZXhpc3RzIGJlZm9yZSBjYWxsaW5nIHBsYXkoKSDigJQgY2MuQW5pbWF0aW9uLnBsYXlcbiAgICAgICAgICAgICAgICAvLyBzaWxlbnRseSBkb2VzIG5vdGhpbmcgb24gdW5rbm93biBuYW1lcyB3aGljaCB3b3VsZCBtYXNrXG4gICAgICAgICAgICAgICAgLy8gdHlwb3MgaW4gQUktZ2VuZXJhdGVkIGNhbGxzLlxuICAgICAgICAgICAgICAgIGNvbnN0IGtub3duID0gKGFuaW0uY2xpcHMgPz8gW10pLnNvbWUoKGM6IGFueSkgPT4gYz8ubmFtZSA9PT0gY2xpcE5hbWUpO1xuICAgICAgICAgICAgICAgIGlmICgha25vd24gJiYgKGFuaW0uZGVmYXVsdENsaXA/Lm5hbWUgIT09IGNsaXBOYW1lKSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgICAgICBlcnJvcjogYENsaXAgJyR7Y2xpcE5hbWV9JyBpcyBub3QgcmVnaXN0ZXJlZCBvbiB0aGlzIEFuaW1hdGlvbi4gS25vd246ICR7KGFuaW0uY2xpcHMgPz8gW10pLm1hcCgoYzogYW55KSA9PiBjPy5uYW1lKS5maWx0ZXIoQm9vbGVhbikuam9pbignLCAnKSB8fCAnKG5vbmUpJ30uYCxcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYW5pbS5wbGF5KGNsaXBOYW1lKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgaWYgKCFhbmltLmRlZmF1bHRDbGlwKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ05vIGNsaXBOYW1lIGdpdmVuIGFuZCBubyBkZWZhdWx0Q2xpcCBjb25maWd1cmVkJyB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBhbmltLnBsYXkoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiBgUGxheWluZyAnJHtjbGlwTmFtZSA/PyBhbmltLmRlZmF1bHRDbGlwPy5uYW1lfScgb24gJHtub2RlLm5hbWV9YCxcbiAgICAgICAgICAgICAgICBkYXRhOiB7IG5vZGVVdWlkLCBjbGlwTmFtZTogY2xpcE5hbWUgPz8gYW5pbS5kZWZhdWx0Q2xpcD8ubmFtZSA/PyBudWxsIH0sXG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycm9yPy5tZXNzYWdlID8/IFN0cmluZyhlcnJvcikgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICBzdG9wQW5pbWF0aW9uKG5vZGVVdWlkOiBzdHJpbmcpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IgfSA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgICAgICBpZiAoIXNjZW5lKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdObyBhY3RpdmUgc2NlbmUnIH07XG4gICAgICAgICAgICBjb25zdCBub2RlID0gZmluZE5vZGVCeVV1aWREZWVwKHNjZW5lLCBub2RlVXVpZCk7XG4gICAgICAgICAgICBpZiAoIW5vZGUpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYE5vZGUgJHtub2RlVXVpZH0gbm90IGZvdW5kYCB9O1xuICAgICAgICAgICAgY29uc3QgYW5pbSA9IG5vZGUuZ2V0Q29tcG9uZW50KCdjYy5BbmltYXRpb24nKTtcbiAgICAgICAgICAgIGlmICghYW5pbSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYE5vZGUgJHtub2RlVXVpZH0gaGFzIG5vIGNjLkFuaW1hdGlvbiBjb21wb25lbnRgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhbmltLnN0b3AoKTtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIG1lc3NhZ2U6IGBTdG9wcGVkIGFuaW1hdGlvbiBvbiAke25vZGUubmFtZX1gIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3I/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycm9yKSB9O1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFJlc29sdmUgYSBjbGlwIG5hbWUg4oaSIGFzc2V0IHV1aWQgb24gYSBub2RlJ3MgY2MuQW5pbWF0aW9uLiBSZXR1cm5zXG4gICAgICogdGhlIG1hdGNoaW5nIGNsaXAncyBgX3V1aWRgIGFsb25nIHdpdGggdGhlIGNjLkFuaW1hdGlvbiBjb21wb25lbnRcbiAgICAgKiBpbmRleCBpbnNpZGUgYF9fY29tcHNfX2AsIGJvdGggb2Ygd2hpY2ggdGhlIGhvc3Qtc2lkZVxuICAgICAqIGFuaW1hdGlvbl9zZXRfY2xpcCBoYW5kbGVyIG5lZWRzIHRvIGlzc3VlIGBzZXQtcHJvcGVydHlgIHdyaXRlcy5cbiAgICAgKlxuICAgICAqIFdoeSBob3N0LXNpZGUgZG9lcyB0aGUgYWN0dWFsIHdyaXRlOiBMYW5kbWluZSAjMTEg4oCUIHNjYWxhclxuICAgICAqIHByb3BlcnR5IHdyaXRlcyB2aWEgdGhlIGVkaXRvcidzIHNldC1wcm9wZXJ0eSBjaGFubmVsIHByb3BhZ2F0ZVxuICAgICAqIHRvIHRoZSBzZXJpYWxpemF0aW9uIG1vZGVsIGltbWVkaWF0ZWx5LiBEaXJlY3QgcnVudGltZSBtdXRhdGlvblxuICAgICAqIChgYW5pbS5kZWZhdWx0Q2xpcCA9IHhgKSBvbmx5IHVwZGF0ZXMgbGF5ZXIgKGEpIGFuZCBtYXkgbm90XG4gICAgICogcGVyc2lzdCBvbiBzYXZlX3NjZW5lLiBTbyBzY2VuZS1zY3JpcHQgcmV0dXJucyB0aGUgbWV0YWRhdGE7IGhvc3RcbiAgICAgKiBkb2VzIHRoZSBwZXJzaXN0ZW5jZS5cbiAgICAgKi9cbiAgICBxdWVyeUFuaW1hdGlvblNldFRhcmdldHMobm9kZVV1aWQ6IHN0cmluZywgY2xpcE5hbWU6IHN0cmluZyB8IG51bGwpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IgfSA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgICAgICBpZiAoIXNjZW5lKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdObyBhY3RpdmUgc2NlbmUnIH07XG4gICAgICAgICAgICBjb25zdCBub2RlID0gZmluZE5vZGVCeVV1aWREZWVwKHNjZW5lLCBub2RlVXVpZCk7XG4gICAgICAgICAgICBpZiAoIW5vZGUpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYE5vZGUgJHtub2RlVXVpZH0gbm90IGZvdW5kYCB9O1xuICAgICAgICAgICAgLy8gdjIuNC45IHJldmlldyBmaXggKGNsYXVkZSArIGNvZGV4IPCfn6EpOiB1c2UgaW5kZXhPZiBvbiB0aGVcbiAgICAgICAgICAgIC8vIHJlc29sdmVkIGFuaW0gaW5zdGFuY2UgZGlyZWN0bHkuIFRoZSBwcmV2aW91cyBtZXRhZGF0YS1zdHJpbmdcbiAgICAgICAgICAgIC8vIGxvb2t1cCAoY29uc3RydWN0b3IubmFtZSAvIF9fY2xhc3NuYW1lX18gLyBfY2lkKSB3YXMgZnJhZ2lsZVxuICAgICAgICAgICAgLy8gYWdhaW5zdCBjdXN0b20gc3ViY2xhc3NlcyAoY2MuU2tlbGV0YWxBbmltYXRpb24sIHVzZXItZGVyaXZlZFxuICAgICAgICAgICAgLy8gY2MuQW5pbWF0aW9uKS4gZ2V0Q29tcG9uZW50KCdjYy5BbmltYXRpb24nKSByZXNvbHZlcyBzdWJjbGFzc2VzXG4gICAgICAgICAgICAvLyBjb3JyZWN0bHk7IG1hdGNoaW5nIGJ5IHJlZmVyZW5jZSBpcyB0aGUgY2Fub25pY2FsIHdheSB0byBmaW5kXG4gICAgICAgICAgICAvLyB0aGUgc2FtZSBpbnN0YW5jZSdzIHNsb3QgaW4gX19jb21wc19fLlxuICAgICAgICAgICAgY29uc3QgYW5pbSA9IG5vZGUuZ2V0Q29tcG9uZW50KCdjYy5BbmltYXRpb24nKTtcbiAgICAgICAgICAgIGlmICghYW5pbSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYE5vZGUgJHtub2RlVXVpZH0gaGFzIG5vIGNjLkFuaW1hdGlvbiBjb21wb25lbnRgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBjb21wb25lbnRzOiBhbnlbXSA9IChub2RlLl9jb21wb25lbnRzID8/IG5vZGUuY29tcG9uZW50cyA/PyBbXSk7XG4gICAgICAgICAgICBjb25zdCBjb21wSW5kZXggPSBjb21wb25lbnRzLmluZGV4T2YoYW5pbSk7XG4gICAgICAgICAgICBpZiAoY29tcEluZGV4ID09PSAtMSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYE5vZGUgJHtub2RlVXVpZH0gY2MuQW5pbWF0aW9uIGNvbXBvbmVudCBub3QgZm91bmQgaW4gX19jb21wc19fIGFycmF5IChjb2NvcyBlZGl0b3IgaW5jb25zaXN0ZW5jeSkuYCB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbGV0IGNsaXBVdWlkOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgICAgICAgICAgIGlmIChjbGlwTmFtZSAhPT0gbnVsbCAmJiBjbGlwTmFtZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgY2xpcCA9IChhbmltLmNsaXBzID8/IFtdKS5maW5kKChjOiBhbnkpID0+IGM/Lm5hbWUgPT09IGNsaXBOYW1lKTtcbiAgICAgICAgICAgICAgICBpZiAoIWNsaXApIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGBDbGlwICcke2NsaXBOYW1lfScgaXMgbm90IHJlZ2lzdGVyZWQgb24gdGhpcyBBbmltYXRpb24uIEtub3duOiAkeyhhbmltLmNsaXBzID8/IFtdKS5tYXAoKGM6IGFueSkgPT4gYz8ubmFtZSkuZmlsdGVyKEJvb2xlYW4pLmpvaW4oJywgJykgfHwgJyhub25lKSd9LmAsXG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNsaXBVdWlkID0gY2xpcC5fdXVpZCA/PyBjbGlwLnV1aWQgPz8gbnVsbDtcbiAgICAgICAgICAgICAgICBpZiAoIWNsaXBVdWlkKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYENsaXAgJyR7Y2xpcE5hbWV9JyBoYXMgbm8gYXNzZXQgdXVpZDsgY2Fubm90IHBlcnNpc3QgYXMgZGVmYXVsdENsaXAuYCB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudEluZGV4OiBjb21wSW5kZXgsXG4gICAgICAgICAgICAgICAgICAgIGNsaXBVdWlkLFxuICAgICAgICAgICAgICAgICAgICBjdXJyZW50RGVmYXVsdENsaXA6IGFuaW0uZGVmYXVsdENsaXA/Lm5hbWUgPz8gbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgY3VycmVudFBsYXlPbkxvYWQ6IGFuaW0ucGxheU9uTG9hZCA9PT0gdHJ1ZSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvcj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyb3IpIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG59OyJdfQ==