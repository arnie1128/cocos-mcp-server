"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.methods = void 0;
const path_1 = require("path");
const response_1 = require("./lib/response");
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
                return (0, response_1.fail)('No active scene');
            }
            // Find node by UUID
            const node = scene.getChildByUuid(nodeUuid);
            if (!node) {
                return (0, response_1.fail)(`Node with UUID ${nodeUuid} not found`);
            }
            // Get component class
            const ComponentClass = js.getClassByName(componentType);
            if (!ComponentClass) {
                return (0, response_1.fail)(`Component type ${componentType} not found`);
            }
            // Add component
            const component = node.addComponent(ComponentClass);
            return (0, response_1.ok)({ componentId: component.uuid }, `Component ${componentType} added successfully`);
        }
        catch (error) {
            return (0, response_1.fail)(error.message);
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
                return (0, response_1.fail)('No active scene');
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
            return (0, response_1.ok)({ uuid: node.uuid, name: node.name }, `Node ${name} created successfully`);
        }
        catch (error) {
            return (0, response_1.fail)(error.message);
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
                return (0, response_1.fail)('No active scene');
            }
            const node = scene.getChildByUuid(nodeUuid);
            if (!node) {
                return (0, response_1.fail)(`Node with UUID ${nodeUuid} not found`);
            }
            return (0, response_1.ok)({
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
            });
        }
        catch (error) {
            return (0, response_1.fail)(error.message);
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
                return (0, response_1.fail)('No active scene');
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
            return (0, response_1.ok)(nodes);
        }
        catch (error) {
            return (0, response_1.fail)(error.message);
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
                return (0, response_1.fail)('No active scene');
            }
            const node = scene.getChildByName(name);
            if (!node) {
                return (0, response_1.fail)(`Node with name ${name} not found`);
            }
            return (0, response_1.ok)({
                uuid: node.uuid,
                name: node.name,
                active: node.active,
                position: node.position
            });
        }
        catch (error) {
            return (0, response_1.fail)(error.message);
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
                return (0, response_1.fail)('No active scene');
            }
            return (0, response_1.ok)({
                name: scene.name,
                uuid: scene.uuid,
                nodeCount: scene.children.length
            });
        }
        catch (error) {
            return (0, response_1.fail)(error.message);
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
                return (0, response_1.fail)('No active scene');
            }
            const node = scene.getChildByUuid(nodeUuid);
            if (!node) {
                return (0, response_1.fail)(`Node with UUID ${nodeUuid} not found`);
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
            return (0, response_1.ok)(undefined, `Property '${property}' updated successfully`);
        }
        catch (error) {
            return (0, response_1.fail)(error.message);
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
                return (0, response_1.fail)('No active scene');
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
            return (0, response_1.ok)(hierarchy);
        }
        catch (error) {
            return (0, response_1.fail)(error.message);
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
            return (0, response_1.fail)(prefabMgr.error);
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
                    return (0, response_1.ok)({
                        url: candidate,
                        sourceNodeUuid: nodeUuid,
                        prefabAssetUuid: assetUuid,
                        instanceNodeUuid,
                        raw: result,
                    });
                }
                catch (err) {
                    errors.push(`${candidate}: ${(_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : err}`);
                }
            }
            return (0, response_1.fail)(`cce.Prefab.createPrefab failed: ${errors.join('; ')}`);
        }
        catch (error) {
            return (0, response_1.fail)((_b = error === null || error === void 0 ? void 0 : error.message) !== null && _b !== void 0 ? _b : String(error));
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
            return (0, response_1.fail)(prefabMgr.error);
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
            return (0, response_1.ok)({ facadeReturn, nodeUuid });
        }
        catch (error) {
            return (0, response_1.fail)((_a = error === null || error === void 0 ? void 0 : error.message) !== null && _a !== void 0 ? _a : String(error));
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
            return (0, response_1.fail)(prefabMgr.error);
        }
        try {
            const result = await prefabMgr.value.linkPrefab(nodeUuid, assetUuid);
            return (0, response_1.ok)({ linked: result, nodeUuid, assetUuid });
        }
        catch (error) {
            return (0, response_1.fail)((_a = error === null || error === void 0 ? void 0 : error.message) !== null && _a !== void 0 ? _a : String(error));
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
            return (0, response_1.fail)(prefabMgr.error);
        }
        try {
            const result = await prefabMgr.value.unlinkPrefab(nodeUuid, removeNested);
            return (0, response_1.ok)({ unlinked: result, nodeUuid, removeNested });
        }
        catch (error) {
            return (0, response_1.fail)((_a = error === null || error === void 0 ? void 0 : error.message) !== null && _a !== void 0 ? _a : String(error));
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
            return (0, response_1.fail)(prefabMgr.error);
        }
        try {
            const data = prefabMgr.value.getPrefabData(nodeUuid);
            return (0, response_1.ok)(data);
        }
        catch (error) {
            return (0, response_1.fail)((_a = error === null || error === void 0 ? void 0 : error.message) !== null && _a !== void 0 ? _a : String(error));
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NlbmUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zb3VyY2Uvc2NlbmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsK0JBQTRCO0FBQzVCLDZDQUEwQztBQUMxQyxNQUFNLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFBLFdBQUksRUFBQyxNQUFNLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxjQUFjLENBQUMsQ0FBQyxDQUFDO0FBcUJ6RCxTQUFTLGVBQWU7O0lBQ3BCLElBQUksT0FBTyxHQUFHLEtBQUssV0FBVyxJQUFJLEdBQUcsS0FBSyxJQUFJLEVBQUUsQ0FBQztRQUM3QyxPQUFPLEVBQUUsRUFBRSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsNkVBQTZFLEVBQUUsQ0FBQztJQUMvRyxDQUFDO0lBQ0QsTUFBTSxVQUFVLEdBQW9DO1FBQ2hELEdBQUcsQ0FBQyxNQUFNO1FBQ1YsTUFBQSxHQUFHLENBQUMsa0JBQWtCLDBDQUFFLFFBQVE7UUFDaEMsR0FBRyxDQUFDLGtCQUE4QztLQUNyRCxDQUFDO0lBQ0YsZ0VBQWdFO0lBQ2hFLCtEQUErRDtJQUMvRCxNQUFNLFFBQVEsR0FBOEIsQ0FBQyxjQUFjLEVBQUUsYUFBYSxFQUFFLFlBQVksRUFBRSxjQUFjLEVBQUUsZUFBZSxDQUFDLENBQUM7SUFDM0gsS0FBSyxNQUFNLFNBQVMsSUFBSSxVQUFVLEVBQUUsQ0FBQztRQUNqQyxJQUFJLFNBQVMsSUFBSSxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsT0FBUSxTQUFpQixDQUFDLENBQUMsQ0FBQyxLQUFLLFVBQVUsQ0FBQyxFQUFFLENBQUM7WUFDaEYsT0FBTyxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRSxDQUFDO1FBQzFDLENBQUM7SUFDTCxDQUFDO0lBQ0QsT0FBTztRQUNILEVBQUUsRUFBRSxLQUFLO1FBQ1QsS0FBSyxFQUFFLHlLQUF5SztLQUNuTCxD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QUVKLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBqb2luIH0gZnJvbSAncGF0aCc7XG5pbXBvcnQgeyBvaywgZmFpbCB9IGZyb20gJy4vbGliL3Jlc3BvbnNlJztcbm1vZHVsZS5wYXRocy5wdXNoKGpvaW4oRWRpdG9yLkFwcC5wYXRoLCAnbm9kZV9tb2R1bGVzJykpO1xuXG4vLyBgY2NlYCBpcyBpbmplY3RlZCBieSBDb2NvcyBFZGl0b3IgaW50byB0aGUgc2NlbmUtc2NyaXB0IGdsb2JhbCBzY29wZS5cbi8vIEl0IGlzIG5vdCBkZWNsYXJlZCBpbiBgQGNvY29zL2NyZWF0b3ItdHlwZXNgIGV4cG9ydHM7IGRlY2xhcmUgYSBtaW5pbWFsXG4vLyBydW50aW1lIHNoYXBlIGp1c3QgZm9yIHdoYXQgd2UgdG91Y2ggaGVyZSBzbyBUeXBlU2NyaXB0IHN0YXlzIHN0cmljdC5cbmRlY2xhcmUgY29uc3QgY2NlOiB1bmRlZmluZWQgfCB7XG4gICAgUHJlZmFiPzogUHJlZmFiRmFjYWRlO1xuICAgIFNjZW5lRmFjYWRlTWFuYWdlcj86IHsgaW5zdGFuY2U/OiBQcmVmYWJGYWNhZGUgfSAmIFByZWZhYkZhY2FkZTtcbn07XG5cbmludGVyZmFjZSBQcmVmYWJGYWNhZGUge1xuICAgIGNyZWF0ZVByZWZhYihub2RlVXVpZDogc3RyaW5nLCB1cmw6IHN0cmluZyk6IFByb21pc2U8YW55PjtcbiAgICBhcHBseVByZWZhYihub2RlVXVpZDogc3RyaW5nKTogUHJvbWlzZTxhbnk+O1xuICAgIGxpbmtQcmVmYWIobm9kZVV1aWQ6IHN0cmluZywgYXNzZXRVdWlkOiBzdHJpbmcpOiBhbnk7XG4gICAgdW5saW5rUHJlZmFiKG5vZGVVdWlkOiBzdHJpbmcsIHJlbW92ZU5lc3RlZDogYm9vbGVhbik6IGFueTtcbiAgICBnZXRQcmVmYWJEYXRhKG5vZGVVdWlkOiBzdHJpbmcpOiBhbnk7XG4gICAgcmVzdG9yZVByZWZhYj8odXVpZDogc3RyaW5nLCBhc3NldFV1aWQ6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj47XG59XG5cbnR5cGUgRmFjYWRlTG9va3VwID0geyBvazogdHJ1ZTsgdmFsdWU6IFByZWZhYkZhY2FkZSB9IHwgeyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmcgfTtcblxuZnVuY3Rpb24gZ2V0UHJlZmFiRmFjYWRlKCk6IEZhY2FkZUxvb2t1cCB7XG4gICAgaWYgKHR5cGVvZiBjY2UgPT09ICd1bmRlZmluZWQnIHx8IGNjZSA9PT0gbnVsbCkge1xuICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiAnY2NlIGdsb2JhbCBpcyBub3QgYXZhaWxhYmxlOyB0aGlzIG1ldGhvZCBtdXN0IHJ1biBpbiBhIHNjZW5lLXNjcmlwdCBjb250ZXh0JyB9O1xuICAgIH1cbiAgICBjb25zdCBjYW5kaWRhdGVzOiBBcnJheTxQcmVmYWJGYWNhZGUgfCB1bmRlZmluZWQ+ID0gW1xuICAgICAgICBjY2UuUHJlZmFiLFxuICAgICAgICBjY2UuU2NlbmVGYWNhZGVNYW5hZ2VyPy5pbnN0YW5jZSxcbiAgICAgICAgY2NlLlNjZW5lRmFjYWRlTWFuYWdlciBhcyBQcmVmYWJGYWNhZGUgfCB1bmRlZmluZWQsXG4gICAgXTtcbiAgICAvLyBFbnN1cmUgdGhlIGNhbmRpZGF0ZSBleHBvc2VzIGV2ZXJ5IGZhY2FkZSBtZXRob2Qgd2UgbWF5IGNhbGw7XG4gICAgLy8gYSBwYXJ0aWFsIGNhbmRpZGF0ZSB3b3VsZCBjcmFzaCBhdCB0aGUgZmlyc3QgbWlzc2luZyBtZXRob2QuXG4gICAgY29uc3QgcmVxdWlyZWQ6IEFycmF5PGtleW9mIFByZWZhYkZhY2FkZT4gPSBbJ2NyZWF0ZVByZWZhYicsICdhcHBseVByZWZhYicsICdsaW5rUHJlZmFiJywgJ3VubGlua1ByZWZhYicsICdnZXRQcmVmYWJEYXRhJ107XG4gICAgZm9yIChjb25zdCBjYW5kaWRhdGUgb2YgY2FuZGlkYXRlcykge1xuICAgICAgICBpZiAoY2FuZGlkYXRlICYmIHJlcXVpcmVkLmV2ZXJ5KG0gPT4gdHlwZW9mIChjYW5kaWRhdGUgYXMgYW55KVttXSA9PT0gJ2Z1bmN0aW9uJykpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiB0cnVlLCB2YWx1ZTogY2FuZGlkYXRlIH07XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgICAgb2s6IGZhbHNlLFxuICAgICAgICBlcnJvcjogJ05vIGNvbXBsZXRlIHByZWZhYiBmYWNhZGUgZm91bmQgb24gY2NlIChjY2UuUHJlZmFiIC8gY2NlLlNjZW5lRmFjYWRlTWFuYWdlcikuIENvY29zIGVkaXRvciBidWlsZCBtYXkgbm90IGV4cG9zZSB0aGUgZXhwZWN0ZWQgbWFuYWdlciBvciBvbmx5IGV4cG9zZXMgYSBwYXJ0aWFsIHN1cmZhY2UuJyxcbiAgICB9O1xufVxuXG50eXBlIENvbXBvbmVudExvb2t1cCA9XG4gICAgfCB7IG9rOiB0cnVlOyBzY2VuZTogYW55OyBub2RlOiBhbnk7IGNvbXBvbmVudDogYW55IH1cbiAgICB8IHsgb2s6IGZhbHNlOyBlcnJvcjogc3RyaW5nIH07XG5cbmZ1bmN0aW9uIGZpbmROb2RlQnlVdWlkRGVlcChyb290OiBhbnksIHV1aWQ6IHN0cmluZyk6IGFueSB7XG4gICAgaWYgKCFyb290KSByZXR1cm4gbnVsbDtcbiAgICBpZiAocm9vdC5faWQgPT09IHV1aWQgfHwgcm9vdC51dWlkID09PSB1dWlkKSByZXR1cm4gcm9vdDtcbiAgICBjb25zdCBjaGlsZHJlbiA9IHJvb3QuY2hpbGRyZW4gPz8gcm9vdC5fY2hpbGRyZW4gPz8gW107XG4gICAgZm9yIChjb25zdCBjaGlsZCBvZiBjaGlsZHJlbikge1xuICAgICAgICBjb25zdCBoaXQgPSBmaW5kTm9kZUJ5VXVpZERlZXAoY2hpbGQsIHV1aWQpO1xuICAgICAgICBpZiAoaGl0KSByZXR1cm4gaGl0O1xuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gcmVzb2x2ZUNvbXBvbmVudENvbnRleHQobm9kZVV1aWQ6IHN0cmluZywgY29tcG9uZW50VHlwZTogc3RyaW5nKTogQ29tcG9uZW50TG9va3VwIHtcbiAgICBjb25zdCB7IGRpcmVjdG9yLCBqcyB9ID0gcmVxdWlyZSgnY2MnKTtcbiAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgaWYgKCFzY2VuZSkge1xuICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiAnTm8gYWN0aXZlIHNjZW5lJyB9O1xuICAgIH1cbiAgICAvLyBzY2VuZS5nZXRDaGlsZEJ5VXVpZCBvbmx5IHdhbGtzIGRpcmVjdCBjaGlsZHJlbjsgdXNlIGRlcHRoLWZpcnN0IHNlYXJjaC5cbiAgICBjb25zdCBub2RlID0gZmluZE5vZGVCeVV1aWREZWVwKHNjZW5lLCBub2RlVXVpZCk7XG4gICAgaWYgKCFub2RlKSB7XG4gICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGBOb2RlIHdpdGggVVVJRCAke25vZGVVdWlkfSBub3QgZm91bmRgIH07XG4gICAgfVxuICAgIGNvbnN0IENvbXBvbmVudENsYXNzID0ganMuZ2V0Q2xhc3NCeU5hbWUoY29tcG9uZW50VHlwZSk7XG4gICAgaWYgKCFDb21wb25lbnRDbGFzcykge1xuICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBgQ29tcG9uZW50IHR5cGUgJHtjb21wb25lbnRUeXBlfSBub3QgZm91bmRgIH07XG4gICAgfVxuICAgIGNvbnN0IGNvbXBvbmVudCA9IG5vZGUuZ2V0Q29tcG9uZW50KENvbXBvbmVudENsYXNzKTtcbiAgICBpZiAoIWNvbXBvbmVudCkge1xuICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBgQ29tcG9uZW50ICR7Y29tcG9uZW50VHlwZX0gbm90IGZvdW5kIG9uIG5vZGVgIH07XG4gICAgfVxuICAgIHJldHVybiB7IG9rOiB0cnVlLCBzY2VuZSwgbm9kZSwgY29tcG9uZW50IH07XG59XG5cbmZ1bmN0aW9uIHNlcmlhbGl6ZUV2ZW50SGFuZGxlcihlaDogYW55KSB7XG4gICAgaWYgKCFlaCkgcmV0dXJuIG51bGw7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgdGFyZ2V0VXVpZDogZWgudGFyZ2V0Py51dWlkID8/IG51bGwsXG4gICAgICAgIHRhcmdldE5hbWU6IGVoLnRhcmdldD8ubmFtZSA/PyBudWxsLFxuICAgICAgICBjb21wb25lbnQ6IGVoLmNvbXBvbmVudCA/PyBlaC5fY29tcG9uZW50TmFtZSA/PyBudWxsLFxuICAgICAgICBoYW5kbGVyOiBlaC5oYW5kbGVyID8/IG51bGwsXG4gICAgICAgIGN1c3RvbUV2ZW50RGF0YTogZWguY3VzdG9tRXZlbnREYXRhID8/ICcnLFxuICAgIH07XG59XG5cbi8vIHYyLjQuOCBBMyArIHYyLjQuOSArIHYyLjQuMTAgcmV2aWV3IGZpeDogc2NlbmUtc2lkZSBsb2cgY2FwdHVyZVxuLy8gKFJvbWFSb2dvdiBwYXR0ZXJuIGFkYXB0ZWQpLlxuLy9cbi8vIENvbmN1cnJlbmN5IG1vZGVsIOKAlCB2Mi40LjEwIChjbGF1ZGUgKyBjb2RleCDwn5S0IHJvdW5kLTIpOlxuLy8gICB2Mi40LjggZmFubmVkIGV2ZXJ5IGNvbnNvbGUubG9nIHRvIEFMTCBhY3RpdmUgY2FwdHVyZSBhcnJheXMuXG4vLyAgIHYyLjQuOSBhdHRlbXB0ZWQgdG8gaXNvbGF0ZSB2aWEgX3RvcFNsb3QoKSAoY3VycmVudCB0b3Agb2Ygc3RhY2spXG4vLyAgIGJ1dCB0aGF0IG9ubHkgd29ya2VkIGZvciBzdHJpY3RseSBMSUZPLW5lc3RlZCBjYWxsczsgdHdvIGNhbGxzXG4vLyAgIHRoYXQgaW50ZXJsZWF2ZSB2aWEgYGF3YWl0YCBjb3VsZCBzdGlsbCBtaXNhdHRyaWJ1dGUgKGNhbGwgQVxuLy8gICBhd2FpdHMsIEIgcHVzaGVzIGl0cyBzbG90LCBBJ3MgcG9zdC1hd2FpdCBsb2dzIHdvdWxkIHJvdXRlIHRvIEIpLlxuLy8gICB2Mi40LjEwIHVzZXMgTm9kZSdzIGJ1aWx0LWluIGBBc3luY0xvY2FsU3RvcmFnZWAgc28gZWFjaCBjYWxsJ3Ncbi8vICAgbG9naWNhbCBhc3luYyBjaGFpbiBrZWVwcyBpdHMgT1dOIHNsb3QgcmVnYXJkbGVzcyBvZiBzdGFjayBvcmRlci5cbi8vICAgV2hlbiBjb25zb2xlLmxvZyBmaXJlcywgdGhlIGhvb2sgcmVhZHMgQUxTLmdldFN0b3JlKCkg4oCUIHdoaWNoIGlzXG4vLyAgIGJvdW5kIHRvIHRoZSBvcmlnaW5hdGluZyBjYWxsJ3MgYXN5bmMgY29udGV4dCDigJQgYW5kIHdyaXRlcyB0aGVyZS5cbi8vXG4vLyBCb3VuZCDigJQgdjIuNC45IChjbGF1ZGUgKyBjb2RleCDwn5+hKTpcbi8vICAgQ2FwIGVudHJpZXMgcGVyIGNhcHR1cmUgKGRlZmF1bHQgNTAwKSBhbmQgdG90YWwgYnl0ZXMgKGRlZmF1bHRcbi8vICAgNjQgS0IpLiBFeGNlc3MgZW50cmllcyBhcmUgZHJvcHBlZDsgYSBzaW5nbGUgYFtjYXB0dXJlIHRydW5jYXRlZF1gXG4vLyAgIG1hcmtlciBpcyBhcHBlbmRlZCBvbmNlLiB2Mi40LjEwOiBtYXJrZXIgYnl0ZXMgY291bnRlZCBhZ2FpbnN0XG4vLyAgIHRoZSBjYXAgKGNvZGV4IHJvdW5kLTIg8J+foSkgc28gdGhlIHNsb3QncyBieXRlcyBmaWVsZCBzdGF5c1xuLy8gICBtb25vdG9uaWNhbGx5IGFjY3VyYXRlLlxuLy9cbi8vIEhvb2sgbGlmZWN5Y2xlOlxuLy8gICBUaGUgY29uc29sZSBob29rIGlzIGluc3RhbGxlZCBvbiBmaXJzdCBgcnVuV2l0aENhcHR1cmVgIGludm9jYXRpb25cbi8vICAgYW5kIHVuaW5zdGFsbGVkIHdoZW4gbm8gc2xvdCBpcyBhY3RpdmUuIEVhY2ggaW52b2NhdGlvbiBgYWxzLnJ1bigpYHNcbi8vICAgd2l0aCBpdHMgc2xvdCwgc28gdGhlIGhvb2sganVzdCByZWFkcyB0aGUgc3RvcmUuIFdlIHN0aWxsIGtlZXBcbi8vICAgYF9hY3RpdmVTbG90Q291bnRgIGFzIGEgcmVmY291bnQgdG8ga25vdyB3aGVuIHRvIHVuaG9vayAoQUxTXG4vLyAgIGRvZXNuJ3QgZXhwb3NlIHN0b3JlIGNvdW50IGRpcmVjdGx5KS5cbmltcG9ydCB7IEFzeW5jTG9jYWxTdG9yYWdlIH0gZnJvbSAnYXN5bmNfaG9va3MnO1xuXG50eXBlIENhcHR1cmVkRW50cnkgPSB7IGxldmVsOiAnbG9nJyB8ICd3YXJuJyB8ICdlcnJvcic7IG1lc3NhZ2U6IHN0cmluZzsgdHM6IG51bWJlciB9O1xudHlwZSBDb25zb2xlU25hcHNob3QgPSB7IGxvZzogdHlwZW9mIGNvbnNvbGUubG9nOyB3YXJuOiB0eXBlb2YgY29uc29sZS53YXJuOyBlcnJvcjogdHlwZW9mIGNvbnNvbGUuZXJyb3IgfTtcblxuaW50ZXJmYWNlIENhcHR1cmVTbG90IHtcbiAgICBlbnRyaWVzOiBDYXB0dXJlZEVudHJ5W107XG4gICAgYnl0ZXM6IG51bWJlcjtcbiAgICB0cnVuY2F0ZWQ6IGJvb2xlYW47XG59XG5cbmNvbnN0IENBUFRVUkVfTUFYX0VOVFJJRVMgPSA1MDA7XG5jb25zdCBDQVBUVVJFX01BWF9CWVRFUyA9IDY0ICogMTAyNDtcbmNvbnN0IF9jYXB0dXJlQUxTID0gbmV3IEFzeW5jTG9jYWxTdG9yYWdlPENhcHR1cmVTbG90PigpO1xubGV0IF9hY3RpdmVTbG90Q291bnQgPSAwO1xubGV0IF9vcmlnQ29uc29sZTogQ29uc29sZVNuYXBzaG90IHwgbnVsbCA9IG51bGw7XG5cbmZ1bmN0aW9uIF9mb3JtYXRBcmdzKGE6IHVua25vd25bXSk6IHN0cmluZyB7XG4gICAgcmV0dXJuIGFcbiAgICAgICAgLm1hcCh4ID0+IHtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgeCA9PT0gJ3N0cmluZycpIHJldHVybiB4O1xuICAgICAgICAgICAgdHJ5IHsgcmV0dXJuIEpTT04uc3RyaW5naWZ5KHgpOyB9IGNhdGNoIHsgcmV0dXJuIFN0cmluZyh4KTsgfVxuICAgICAgICB9KVxuICAgICAgICAuam9pbignICcpO1xufVxuXG5mdW5jdGlvbiBfYXBwZW5kQm91bmRlZChzbG90OiBDYXB0dXJlU2xvdCwgZW50cnk6IENhcHR1cmVkRW50cnkpOiB2b2lkIHtcbiAgICBpZiAoc2xvdC50cnVuY2F0ZWQpIHJldHVybjtcbiAgICBjb25zdCBlbnRyeUJ5dGVzID0gZW50cnkubWVzc2FnZS5sZW5ndGggKyAzMjsgLy8gfmxldmVsICsgdHMgb3ZlcmhlYWRcbiAgICBpZiAoc2xvdC5lbnRyaWVzLmxlbmd0aCA+PSBDQVBUVVJFX01BWF9FTlRSSUVTIHx8IHNsb3QuYnl0ZXMgKyBlbnRyeUJ5dGVzID4gQ0FQVFVSRV9NQVhfQllURVMpIHtcbiAgICAgICAgc2xvdC50cnVuY2F0ZWQgPSB0cnVlO1xuICAgICAgICBjb25zdCBtYXJrZXI6IENhcHR1cmVkRW50cnkgPSB7IGxldmVsOiAnd2FybicsIG1lc3NhZ2U6ICdbY2FwdHVyZSB0cnVuY2F0ZWQg4oCUIGV4Y2VlZGVkIGVudHJ5L2J5dGUgY2FwXScsIHRzOiBEYXRlLm5vdygpIH07XG4gICAgICAgIHNsb3QuZW50cmllcy5wdXNoKG1hcmtlcik7XG4gICAgICAgIC8vIHYyLjQuMTAgY29kZXggcm91bmQtMiDwn5+hOiB0cmFjayBtYXJrZXIgYnl0ZXMgdG9vIHNvIGNhcCBhY2NvdW50aW5nXG4gICAgICAgIC8vIHN0YXlzIGFjY3VyYXRlIGV2ZW4gdGhvdWdoIG5vIGZ1cnRoZXIgYXBwZW5kcyB3aWxsIGZvbGxvdy5cbiAgICAgICAgc2xvdC5ieXRlcyArPSBtYXJrZXIubWVzc2FnZS5sZW5ndGggKyAzMjtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBzbG90LmVudHJpZXMucHVzaChlbnRyeSk7XG4gICAgc2xvdC5ieXRlcyArPSBlbnRyeUJ5dGVzO1xufVxuXG5mdW5jdGlvbiBfZW5zdXJlQ29uc29sZUhvb2soKTogdm9pZCB7XG4gICAgaWYgKF9vcmlnQ29uc29sZSkgcmV0dXJuO1xuICAgIF9vcmlnQ29uc29sZSA9IHsgbG9nOiBjb25zb2xlLmxvZywgd2FybjogY29uc29sZS53YXJuLCBlcnJvcjogY29uc29sZS5lcnJvciB9O1xuICAgIGNvbnN0IG1ha2UgPSAobGV2ZWw6IENhcHR1cmVkRW50cnlbJ2xldmVsJ10sIG9yaWc6ICguLi5hOiBhbnlbXSkgPT4gdm9pZCkgPT5cbiAgICAgICAgKC4uLmE6IGFueVtdKTogdm9pZCA9PiB7XG4gICAgICAgICAgICBjb25zdCBzbG90ID0gX2NhcHR1cmVBTFMuZ2V0U3RvcmUoKTtcbiAgICAgICAgICAgIGlmIChzbG90KSB7XG4gICAgICAgICAgICAgICAgY29uc3QgbWVzc2FnZSA9IF9mb3JtYXRBcmdzKGEpO1xuICAgICAgICAgICAgICAgIF9hcHBlbmRCb3VuZGVkKHNsb3QsIHsgbGV2ZWwsIG1lc3NhZ2UsIHRzOiBEYXRlLm5vdygpIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdHJ5IHsgb3JpZy5hcHBseShjb25zb2xlLCBhKTsgfSBjYXRjaCB7IC8qIHN3YWxsb3cgKi8gfVxuICAgICAgICB9O1xuICAgIGNvbnNvbGUubG9nID0gbWFrZSgnbG9nJywgX29yaWdDb25zb2xlLmxvZyk7XG4gICAgY29uc29sZS53YXJuID0gbWFrZSgnd2FybicsIF9vcmlnQ29uc29sZS53YXJuKTtcbiAgICBjb25zb2xlLmVycm9yID0gbWFrZSgnZXJyb3InLCBfb3JpZ0NvbnNvbGUuZXJyb3IpO1xufVxuXG5mdW5jdGlvbiBfbWF5YmVVbmhvb2tDb25zb2xlKCk6IHZvaWQge1xuICAgIGlmIChfYWN0aXZlU2xvdENvdW50ID4gMCB8fCAhX29yaWdDb25zb2xlKSByZXR1cm47XG4gICAgY29uc29sZS5sb2cgPSBfb3JpZ0NvbnNvbGUubG9nO1xuICAgIGNvbnNvbGUud2FybiA9IF9vcmlnQ29uc29sZS53YXJuO1xuICAgIGNvbnNvbGUuZXJyb3IgPSBfb3JpZ0NvbnNvbGUuZXJyb3I7XG4gICAgX29yaWdDb25zb2xlID0gbnVsbDtcbn1cblxuZXhwb3J0IGNvbnN0IG1ldGhvZHM6IHsgW2tleTogc3RyaW5nXTogKC4uLmFueTogYW55KSA9PiBhbnkgfSA9IHtcbiAgICAvKipcbiAgICAgKiB2Mi40LjggQTM6IGludm9rZSBhbm90aGVyIHNjZW5lLXNjcmlwdCBtZXRob2QgYnkgbmFtZSwgY2FwdHVyaW5nXG4gICAgICogY29uc29sZS57bG9nLHdhcm4sZXJyb3J9IGR1cmluZyB0aGUgY2FsbCBhbmQgcmV0dXJuaW5nIGNhcHR1cmVkTG9nc1xuICAgICAqIGFsb25nc2lkZSB0aGUgbWV0aG9kJ3Mgbm9ybWFsIHJldHVybiBlbnZlbG9wZS4gU2luZ2xlIHJvdW5kLXRyaXAuXG4gICAgICpcbiAgICAgKiBCZWhhdmlvdXI6XG4gICAgICogIC0gSWYgYG1ldGhvZE5hbWVgIGRvZXMgbm90IGV4aXN0LCByZXR1cm5zXG4gICAgICogICAgYHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBcIi4uLlwiICwgY2FwdHVyZWRMb2dzOiBbXSB9YCAoZW1wdHkpLlxuICAgICAqICAtIElmIHRoZSBpbm5lciBtZXRob2QgdGhyb3dzLCB0aGUgdGhyb3cgaXMgY2F1Z2h0IGFuZCBjb252ZXJ0ZWQgdG9cbiAgICAgKiAgICBgeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3IsIGNhcHR1cmVkTG9ncyB9YCBzbyB0aGUgaG9zdCBhbHdheXMgc2Vlc1xuICAgICAqICAgIGEgc3RydWN0dXJlZCBlbnZlbG9wZSBwbHVzIHRoZSBsb2dzIHRoYXQgcmFuIHVwIHRvIHRoZSB0aHJvdy5cbiAgICAgKiAgLSBJZiB0aGUgaW5uZXIgbWV0aG9kIHJldHVybnMgYW4gb2JqZWN0LCBjYXB0dXJlZExvZ3MgaXMgbWVyZ2VkXG4gICAgICogICAgYWxvbmdzaWRlIGl0cyBrZXlzIHdpdGhvdXQgb3ZlcndyaXRpbmcgKHdlIHVzZSBgPz8gY2FwdHVyZXNgXG4gICAgICogICAgc2VtYW50aWNzOiBvbmx5IHNldCBpZiBub3QgYWxyZWFkeSBwcmVzZW50KS5cbiAgICAgKi9cbiAgICBhc3luYyBydW5XaXRoQ2FwdHVyZShtZXRob2ROYW1lOiBzdHJpbmcsIG1ldGhvZEFyZ3M/OiB1bmtub3duW10pIHtcbiAgICAgICAgY29uc3Qgc2xvdDogQ2FwdHVyZVNsb3QgPSB7XG4gICAgICAgICAgICBlbnRyaWVzOiBbXSxcbiAgICAgICAgICAgIGJ5dGVzOiAwLFxuICAgICAgICAgICAgdHJ1bmNhdGVkOiBmYWxzZSxcbiAgICAgICAgfTtcbiAgICAgICAgLy8gdjIuNC4xMSByb3VuZC0zIGNvZGV4IPCflLQgKyBjbGF1ZGUg8J+foSArIGdlbWluaSDwn5+hOiBrZWVwIGluY3JlbWVudFxuICAgICAgICAvLyBPVVRTSURFIHRoZSB0cnkgKG51bWVyaWMgYCs9IDFgIGlzIGluZmFsbGlibGUsIG11c3QgcGFpciAxOjEgd2l0aFxuICAgICAgICAvLyBmaW5hbGx5IGRlY3JlbWVudCksIGJ1dCBtb3ZlIF9lbnN1cmVDb25zb2xlSG9vayBJTlNJREUgc28gYVxuICAgICAgICAvLyB0aHJvdyB0aGVyZSAodG9kYXk6IHB1cmUgYXNzaWdubWVudHMsIHNvIHNhZmU7IGRlZmVuc2l2ZSBhZ2FpbnN0XG4gICAgICAgIC8vIGZ1dHVyZSBncm93dGgpIGNhbm5vdCBsZWFrIHRoZSByZWZjb3VudCBhbmQgbGVhdmUgdGhlIGNvbnNvbGVcbiAgICAgICAgLy8gaG9vayBpbnN0YWxsZWQgZm9yZXZlci5cbiAgICAgICAgX2FjdGl2ZVNsb3RDb3VudCArPSAxO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgX2Vuc3VyZUNvbnNvbGVIb29rKCk7XG4gICAgICAgICAgICAvLyB2Mi40LjEwIHJvdW5kLTIgY29kZXgg8J+UtCArIGNsYXVkZSDwn5+hICsgZ2VtaW5pIPCfn6E6IEFzeW5jTG9jYWxTdG9yYWdlXG4gICAgICAgICAgICAvLyBiaW5kcyBgc2xvdGAgdG8gdGhpcyBjYWxsJ3MgbG9naWNhbCBhc3luYyBjb250ZXh0LCBzbyBhbnlcbiAgICAgICAgICAgIC8vIGNvbnNvbGUubG9nIGVtaXR0ZWQgYnkgdGhlIGlubmVyIG1ldGhvZCAob3IgYW55IGRlc2NlbmRhbnRcbiAgICAgICAgICAgIC8vIG1pY3JvdGFzaywgZXZlbiBhZnRlciBgYXdhaXRgIGJvdW5kYXJpZXMgd2hlbiBvdGhlciBjYWxscyBhcmVcbiAgICAgICAgICAgIC8vIGFsc28gYWN0aXZlKSByb3V0ZXMgdG8gVEhJUyBzbG90IOKAlCBub3Qgd2hpY2hldmVyIHdhc1xuICAgICAgICAgICAgLy8gdG9wLW9mLXN0YWNrIGF0IHRoZSBtb21lbnQgdGhlIGxvZyBmaXJlZC4gRWxpbWluYXRlc1xuICAgICAgICAgICAgLy8gY3Jvc3MtY2FsbCBsZWFrYWdlIGZyb20gaW50ZXJsZWF2ZWQgYXN5bmMgcnVucy5cbiAgICAgICAgICAgIHJldHVybiBhd2FpdCBfY2FwdHVyZUFMUy5ydW4oc2xvdCwgYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGZuID0gbWV0aG9kc1ttZXRob2ROYW1lXTtcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGZuICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yOiBgcnVuV2l0aENhcHR1cmU6IG1ldGhvZCAke21ldGhvZE5hbWV9IG5vdCBmb3VuZGAsXG4gICAgICAgICAgICAgICAgICAgICAgICBjYXB0dXJlZExvZ3M6IHNsb3QuZW50cmllcyxcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZm4oLi4uKG1ldGhvZEFyZ3MgPz8gW10pKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdCAmJiB0eXBlb2YgcmVzdWx0ID09PSAnb2JqZWN0JyAmJiAhQXJyYXkuaXNBcnJheShyZXN1bHQpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4geyAuLi5yZXN1bHQsIGNhcHR1cmVkTG9nczogKHJlc3VsdCBhcyBhbnkpLmNhcHR1cmVkTG9ncyA/PyBzbG90LmVudHJpZXMgfTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBkYXRhOiByZXN1bHQsIGNhcHR1cmVkTG9nczogc2xvdC5lbnRyaWVzIH07XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhcHR1cmVkTG9nczogc2xvdC5lbnRyaWVzLFxuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgICAgX2FjdGl2ZVNsb3RDb3VudCA9IE1hdGgubWF4KDAsIF9hY3RpdmVTbG90Q291bnQgLSAxKTtcbiAgICAgICAgICAgIF9tYXliZVVuaG9va0NvbnNvbGUoKTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBBZGQgY29tcG9uZW50IHRvIGEgbm9kZVxuICAgICAqL1xuICAgIGFkZENvbXBvbmVudFRvTm9kZShub2RlVXVpZDogc3RyaW5nLCBjb21wb25lbnRUeXBlOiBzdHJpbmcpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IsIGpzIH0gPSByZXF1aXJlKCdjYycpO1xuICAgICAgICAgICAgY29uc3Qgc2NlbmUgPSBkaXJlY3Rvci5nZXRTY2VuZSgpO1xuICAgICAgICAgICAgaWYgKCFzY2VuZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKCdObyBhY3RpdmUgc2NlbmUnKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gRmluZCBub2RlIGJ5IFVVSURcbiAgICAgICAgICAgIGNvbnN0IG5vZGUgPSBzY2VuZS5nZXRDaGlsZEJ5VXVpZChub2RlVXVpZCk7XG4gICAgICAgICAgICBpZiAoIW5vZGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFpbChgTm9kZSB3aXRoIFVVSUQgJHtub2RlVXVpZH0gbm90IGZvdW5kYCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIEdldCBjb21wb25lbnQgY2xhc3NcbiAgICAgICAgICAgIGNvbnN0IENvbXBvbmVudENsYXNzID0ganMuZ2V0Q2xhc3NCeU5hbWUoY29tcG9uZW50VHlwZSk7XG4gICAgICAgICAgICBpZiAoIUNvbXBvbmVudENsYXNzKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoYENvbXBvbmVudCB0eXBlICR7Y29tcG9uZW50VHlwZX0gbm90IGZvdW5kYCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIEFkZCBjb21wb25lbnRcbiAgICAgICAgICAgIGNvbnN0IGNvbXBvbmVudCA9IG5vZGUuYWRkQ29tcG9uZW50KENvbXBvbmVudENsYXNzKTtcbiAgICAgICAgICAgIHJldHVybiBvayh7IGNvbXBvbmVudElkOiBjb21wb25lbnQudXVpZCB9LCBgQ29tcG9uZW50ICR7Y29tcG9uZW50VHlwZX0gYWRkZWQgc3VjY2Vzc2Z1bGx5YCk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGVycm9yLm1lc3NhZ2UpO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIENyZWF0ZSBhIG5ldyBub2RlXG4gICAgICovXG4gICAgY3JlYXRlTm9kZShuYW1lOiBzdHJpbmcsIHBhcmVudFV1aWQ/OiBzdHJpbmcpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IsIE5vZGUgfSA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgICAgICBpZiAoIXNjZW5lKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ05vIGFjdGl2ZSBzY2VuZScpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBub2RlID0gbmV3IE5vZGUobmFtZSk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmIChwYXJlbnRVdWlkKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcGFyZW50ID0gc2NlbmUuZ2V0Q2hpbGRCeVV1aWQocGFyZW50VXVpZCk7XG4gICAgICAgICAgICAgICAgaWYgKHBhcmVudCkge1xuICAgICAgICAgICAgICAgICAgICBwYXJlbnQuYWRkQ2hpbGQobm9kZSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgc2NlbmUuYWRkQ2hpbGQobm9kZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBzY2VuZS5hZGRDaGlsZChub2RlKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIG9rKHsgdXVpZDogbm9kZS51dWlkLCBuYW1lOiBub2RlLm5hbWUgfSwgYE5vZGUgJHtuYW1lfSBjcmVhdGVkIHN1Y2Nlc3NmdWxseWApO1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChlcnJvci5tZXNzYWdlKTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBHZXQgbm9kZSBpbmZvcm1hdGlvblxuICAgICAqL1xuICAgIGdldE5vZGVJbmZvKG5vZGVVdWlkOiBzdHJpbmcpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IgfSA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgICAgICBpZiAoIXNjZW5lKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ05vIGFjdGl2ZSBzY2VuZScpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBub2RlID0gc2NlbmUuZ2V0Q2hpbGRCeVV1aWQobm9kZVV1aWQpO1xuICAgICAgICAgICAgaWYgKCFub2RlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoYE5vZGUgd2l0aCBVVUlEICR7bm9kZVV1aWR9IG5vdCBmb3VuZGApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gb2soe1xuICAgICAgICAgICAgICAgIHV1aWQ6IG5vZGUudXVpZCxcbiAgICAgICAgICAgICAgICBuYW1lOiBub2RlLm5hbWUsXG4gICAgICAgICAgICAgICAgYWN0aXZlOiBub2RlLmFjdGl2ZSxcbiAgICAgICAgICAgICAgICBwb3NpdGlvbjogbm9kZS5wb3NpdGlvbixcbiAgICAgICAgICAgICAgICByb3RhdGlvbjogbm9kZS5yb3RhdGlvbixcbiAgICAgICAgICAgICAgICBzY2FsZTogbm9kZS5zY2FsZSxcbiAgICAgICAgICAgICAgICBwYXJlbnQ6IG5vZGUucGFyZW50Py51dWlkLFxuICAgICAgICAgICAgICAgIGNoaWxkcmVuOiBub2RlLmNoaWxkcmVuLm1hcCgoY2hpbGQ6IGFueSkgPT4gY2hpbGQudXVpZCksXG4gICAgICAgICAgICAgICAgY29tcG9uZW50czogbm9kZS5jb21wb25lbnRzLm1hcCgoY29tcDogYW55KSA9PiAoe1xuICAgICAgICAgICAgICAgICAgICB0eXBlOiBjb21wLmNvbnN0cnVjdG9yLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgIGVuYWJsZWQ6IGNvbXAuZW5hYmxlZFxuICAgICAgICAgICAgICAgIH0pKVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGVycm9yLm1lc3NhZ2UpO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEdldCBhbGwgbm9kZXMgaW4gc2NlbmVcbiAgICAgKi9cbiAgICBnZXRBbGxOb2RlcygpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IgfSA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgICAgICBpZiAoIXNjZW5lKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ05vIGFjdGl2ZSBzY2VuZScpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBub2RlczogYW55W10gPSBbXTtcbiAgICAgICAgICAgIGNvbnN0IGNvbGxlY3ROb2RlcyA9IChub2RlOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBub2Rlcy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgdXVpZDogbm9kZS51dWlkLFxuICAgICAgICAgICAgICAgICAgICBuYW1lOiBub2RlLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgIGFjdGl2ZTogbm9kZS5hY3RpdmUsXG4gICAgICAgICAgICAgICAgICAgIHBhcmVudDogbm9kZS5wYXJlbnQ/LnV1aWRcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBub2RlLmNoaWxkcmVuLmZvckVhY2goKGNoaWxkOiBhbnkpID0+IGNvbGxlY3ROb2RlcyhjaGlsZCkpO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgc2NlbmUuY2hpbGRyZW4uZm9yRWFjaCgoY2hpbGQ6IGFueSkgPT4gY29sbGVjdE5vZGVzKGNoaWxkKSk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHJldHVybiBvayhub2Rlcyk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGVycm9yLm1lc3NhZ2UpO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEZpbmQgbm9kZSBieSBuYW1lXG4gICAgICovXG4gICAgZmluZE5vZGVCeU5hbWUobmFtZTogc3RyaW5nKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCB7IGRpcmVjdG9yIH0gPSByZXF1aXJlKCdjYycpO1xuICAgICAgICAgICAgY29uc3Qgc2NlbmUgPSBkaXJlY3Rvci5nZXRTY2VuZSgpO1xuICAgICAgICAgICAgaWYgKCFzY2VuZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKCdObyBhY3RpdmUgc2NlbmUnKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3Qgbm9kZSA9IHNjZW5lLmdldENoaWxkQnlOYW1lKG5hbWUpO1xuICAgICAgICAgICAgaWYgKCFub2RlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoYE5vZGUgd2l0aCBuYW1lICR7bmFtZX0gbm90IGZvdW5kYCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgdXVpZDogbm9kZS51dWlkLFxuICAgICAgICAgICAgICAgIG5hbWU6IG5vZGUubmFtZSxcbiAgICAgICAgICAgICAgICBhY3RpdmU6IG5vZGUuYWN0aXZlLFxuICAgICAgICAgICAgICAgIHBvc2l0aW9uOiBub2RlLnBvc2l0aW9uXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoZXJyb3IubWVzc2FnZSk7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogR2V0IGN1cnJlbnQgc2NlbmUgaW5mb3JtYXRpb25cbiAgICAgKi9cbiAgICBnZXRDdXJyZW50U2NlbmVJbmZvKCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgeyBkaXJlY3RvciB9ID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICAgICAgICAgIGlmICghc2NlbmUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFpbCgnTm8gYWN0aXZlIHNjZW5lJyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgbmFtZTogc2NlbmUubmFtZSxcbiAgICAgICAgICAgICAgICB1dWlkOiBzY2VuZS51dWlkLFxuICAgICAgICAgICAgICAgIG5vZGVDb3VudDogc2NlbmUuY2hpbGRyZW4ubGVuZ3RoXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoZXJyb3IubWVzc2FnZSk7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogU2V0IG5vZGUgcHJvcGVydHlcbiAgICAgKi9cbiAgICBzZXROb2RlUHJvcGVydHkobm9kZVV1aWQ6IHN0cmluZywgcHJvcGVydHk6IHN0cmluZywgdmFsdWU6IGFueSkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgeyBkaXJlY3RvciB9ID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICAgICAgICAgIGlmICghc2NlbmUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFpbCgnTm8gYWN0aXZlIHNjZW5lJyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IG5vZGUgPSBzY2VuZS5nZXRDaGlsZEJ5VXVpZChub2RlVXVpZCk7XG4gICAgICAgICAgICBpZiAoIW5vZGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFpbChgTm9kZSB3aXRoIFVVSUQgJHtub2RlVXVpZH0gbm90IGZvdW5kYCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIOioree9ruWxrOaAp1xuICAgICAgICAgICAgaWYgKHByb3BlcnR5ID09PSAncG9zaXRpb24nKSB7XG4gICAgICAgICAgICAgICAgbm9kZS5zZXRQb3NpdGlvbih2YWx1ZS54IHx8IDAsIHZhbHVlLnkgfHwgMCwgdmFsdWUueiB8fCAwKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHkgPT09ICdyb3RhdGlvbicpIHtcbiAgICAgICAgICAgICAgICBub2RlLnNldFJvdGF0aW9uRnJvbUV1bGVyKHZhbHVlLnggfHwgMCwgdmFsdWUueSB8fCAwLCB2YWx1ZS56IHx8IDApO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eSA9PT0gJ3NjYWxlJykge1xuICAgICAgICAgICAgICAgIG5vZGUuc2V0U2NhbGUodmFsdWUueCB8fCAxLCB2YWx1ZS55IHx8IDEsIHZhbHVlLnogfHwgMSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5ID09PSAnYWN0aXZlJykge1xuICAgICAgICAgICAgICAgIG5vZGUuYWN0aXZlID0gdmFsdWU7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5ID09PSAnbmFtZScpIHtcbiAgICAgICAgICAgICAgICBub2RlLm5hbWUgPSB2YWx1ZTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8g5ZiX6Kmm55u05o6l6Kit572u5bGs5oCnXG4gICAgICAgICAgICAgICAgKG5vZGUgYXMgYW55KVtwcm9wZXJ0eV0gPSB2YWx1ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIG9rKHVuZGVmaW5lZCwgYFByb3BlcnR5ICcke3Byb3BlcnR5fScgdXBkYXRlZCBzdWNjZXNzZnVsbHlgKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoZXJyb3IubWVzc2FnZSk7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogR2V0IHNjZW5lIGhpZXJhcmNoeVxuICAgICAqL1xuICAgIGdldFNjZW5lSGllcmFyY2h5KGluY2x1ZGVDb21wb25lbnRzOiBib29sZWFuID0gZmFsc2UpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IgfSA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgICAgICBpZiAoIXNjZW5lKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ05vIGFjdGl2ZSBzY2VuZScpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBwcm9jZXNzTm9kZSA9IChub2RlOiBhbnkpOiBhbnkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdDogYW55ID0ge1xuICAgICAgICAgICAgICAgICAgICBuYW1lOiBub2RlLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgIHV1aWQ6IG5vZGUudXVpZCxcbiAgICAgICAgICAgICAgICAgICAgYWN0aXZlOiBub2RlLmFjdGl2ZSxcbiAgICAgICAgICAgICAgICAgICAgY2hpbGRyZW46IFtdXG4gICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgIGlmIChpbmNsdWRlQ29tcG9uZW50cykge1xuICAgICAgICAgICAgICAgICAgICByZXN1bHQuY29tcG9uZW50cyA9IG5vZGUuY29tcG9uZW50cy5tYXAoKGNvbXA6IGFueSkgPT4gKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6IGNvbXAuY29uc3RydWN0b3IubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGVuYWJsZWQ6IGNvbXAuZW5hYmxlZFxuICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKG5vZGUuY2hpbGRyZW4gJiYgbm9kZS5jaGlsZHJlbi5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdC5jaGlsZHJlbiA9IG5vZGUuY2hpbGRyZW4ubWFwKChjaGlsZDogYW55KSA9PiBwcm9jZXNzTm9kZShjaGlsZCkpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBjb25zdCBoaWVyYXJjaHkgPSBzY2VuZS5jaGlsZHJlbi5tYXAoKGNoaWxkOiBhbnkpID0+IHByb2Nlc3NOb2RlKGNoaWxkKSk7XG4gICAgICAgICAgICByZXR1cm4gb2soaGllcmFyY2h5KTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoZXJyb3IubWVzc2FnZSk7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQ3JlYXRlIHByZWZhYiBhc3NldCBmcm9tIGEgbm9kZSB2aWEgdGhlIG9mZmljaWFsIHNjZW5lIGZhY2FkZS5cbiAgICAgKlxuICAgICAqIFJvdXRlcyB0aHJvdWdoIGBjY2UuUHJlZmFiLmNyZWF0ZVByZWZhYmAgKHRoZSBDb2NvcyBlZGl0b3IgcHJlZmFiXG4gICAgICogbWFuYWdlciBleHBvc2VkIGluIHNjZW5lLXNjcmlwdCBjb250ZXh0KS4gVGhlIHVybCBhY2NlcHRzIGJvdGhcbiAgICAgKiBgZGI6Ly9hc3NldHMvLi4uYCBhbmQgYWJzb2x1dGUgZmlsZXN5c3RlbSBwYXRocyBpbiBkaWZmZXJlbnQgZWRpdG9yXG4gICAgICogYnVpbGRzLCBzbyB3ZSB0cnkgYm90aCBzaGFwZXMgYW5kIHN1cmZhY2Ugd2hpY2hldmVyIGZhaWxzLlxuICAgICAqL1xuICAgIGFzeW5jIGNyZWF0ZVByZWZhYkZyb21Ob2RlKG5vZGVVdWlkOiBzdHJpbmcsIHVybDogc3RyaW5nKSB7XG4gICAgICAgIGNvbnN0IHByZWZhYk1nciA9IGdldFByZWZhYkZhY2FkZSgpO1xuICAgICAgICBpZiAoIXByZWZhYk1nci5vaykge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwocHJlZmFiTWdyLmVycm9yKTtcbiAgICAgICAgfVxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgdHJpZXM6IHN0cmluZ1tdID0gW107XG4gICAgICAgICAgICAvLyBQcmVmZXIgZGI6Ly8gZm9ybSAobWF0Y2hlcyBhc3NldC1kYiBxdWVyeSByZXN1bHRzKSBhbmQgZmFsbFxuICAgICAgICAgICAgLy8gYmFjayB0byB3aGF0ZXZlciB0aGUgY2FsbGVyIHBhc3NlZCB2ZXJiYXRpbS5cbiAgICAgICAgICAgIGNvbnN0IGRiVXJsID0gdXJsLnN0YXJ0c1dpdGgoJ2RiOi8vJykgPyB1cmwgOiBgZGI6Ly9hc3NldHMvJHt1cmwucmVwbGFjZSgvXlxcLysvLCAnJyl9YDtcbiAgICAgICAgICAgIHRyaWVzLnB1c2goZGJVcmwpO1xuICAgICAgICAgICAgaWYgKGRiVXJsICE9PSB1cmwpIHtcbiAgICAgICAgICAgICAgICB0cmllcy5wdXNoKHVybCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IGVycm9yczogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIHRyaWVzKSB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgcHJlZmFiTWdyLnZhbHVlLmNyZWF0ZVByZWZhYihub2RlVXVpZCwgY2FuZGlkYXRlKTtcbiAgICAgICAgICAgICAgICAgICAgLy8gY2NlLlByZWZhYi5jcmVhdGVQcmVmYWIgcmVwdXJwb3NlcyB0aGUgc291cmNlIG5vZGUgaW50byBhXG4gICAgICAgICAgICAgICAgICAgIC8vIHByZWZhYiBpbnN0YW5jZSB3aXRoIGEgZnJlc2ggVVVJRCwgc28gdGhlIGNhbGxlci1zdXBwbGllZFxuICAgICAgICAgICAgICAgICAgICAvLyBub2RlVXVpZCBpcyBubyBsb25nZXIgdmFsaWQuIFJlc29sdmUgdGhlIG5ldyBVVUlEIGJ5XG4gICAgICAgICAgICAgICAgICAgIC8vIHF1ZXJ5aW5nIG5vZGVzIHRoYXQgcmVmZXJlbmNlIHRoZSBmcmVzaGx5IG1pbnRlZCBhc3NldC5cbiAgICAgICAgICAgICAgICAgICAgbGV0IGFzc2V0VXVpZDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgcmVzdWx0ID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXNzZXRVdWlkID0gcmVzdWx0O1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHJlc3VsdCAmJiB0eXBlb2YgcmVzdWx0ID09PSAnb2JqZWN0JyAmJiB0eXBlb2YgKHJlc3VsdCBhcyBhbnkpLnV1aWQgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhc3NldFV1aWQgPSAocmVzdWx0IGFzIGFueSkudXVpZDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBsZXQgaW5zdGFuY2VOb2RlVXVpZDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgIGlmIChhc3NldFV1aWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgaW5zdGFuY2VzOiBhbnkgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1ub2Rlcy1ieS1hc3NldC11dWlkJywgYXNzZXRVdWlkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShpbnN0YW5jZXMpICYmIGluc3RhbmNlcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIE5ld2x5LWNyZWF0ZWQgcHJlZmFiIGluc3RhbmNlIGlzIHR5cGljYWxseSB0aGVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gbGFzdCBlbnRyeS4gQ2F2ZWF0OiBpZiB0aGUgc2FtZSBhc3NldCBhbHJlYWR5XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGhhZCBpbnN0YW5jZXMgaW4gdGhlIHNjZW5lLCBcImxhc3RcIiBwaWNrcyBvbmVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gb2YgdGhlbSByYXRoZXIgdGhhbiB0aGUgbmV3IG9uZS4gVGhlIGVkaXRvclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBhcHBlYXJzIHRvIHJldHVybiBjcmVhdGlvbiBvcmRlciwgYnV0IHRoZSBBUElcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gaXMgdW5kb2N1bWVudGVkOyBjYWxsZXJzIHJlcXVpcmluZyBzdHJpY3RcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gaWRlbnRpZmljYXRpb24gc2hvdWxkIHNuYXBzaG90IGJlZm9yZSBjYWxsaW5nLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbnN0YW5jZU5vZGVVdWlkID0gaW5zdGFuY2VzW2luc3RhbmNlcy5sZW5ndGggLSAxXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBOb24tZmF0YWw6IHRoZSBhc3NldCB3YXMgY3JlYXRlZCBlaXRoZXIgd2F5LlxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICB1cmw6IGNhbmRpZGF0ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHNvdXJjZU5vZGVVdWlkOiBub2RlVXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHByZWZhYkFzc2V0VXVpZDogYXNzZXRVdWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgaW5zdGFuY2VOb2RlVXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHJhdzogcmVzdWx0LFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgICAgICAgICBlcnJvcnMucHVzaChgJHtjYW5kaWRhdGV9OiAke2Vycj8ubWVzc2FnZSA/PyBlcnJ9YCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGZhaWwoYGNjZS5QcmVmYWIuY3JlYXRlUHJlZmFiIGZhaWxlZDogJHtlcnJvcnMuam9pbignOyAnKX1gKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoZXJyb3I/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycm9yKSk7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogUHVzaCBwcmVmYWIgaW5zdGFuY2UgZWRpdHMgYmFjayB0byB0aGUgcHJlZmFiIGFzc2V0LlxuICAgICAqIFdyYXBzIHNjZW5lIGZhY2FkZSBgYXBwbHlQcmVmYWIobm9kZVV1aWQpYC5cbiAgICAgKi9cbiAgICBhc3luYyBhcHBseVByZWZhYihub2RlVXVpZDogc3RyaW5nKSB7XG4gICAgICAgIGNvbnN0IHByZWZhYk1nciA9IGdldFByZWZhYkZhY2FkZSgpO1xuICAgICAgICBpZiAoIXByZWZhYk1nci5vaykge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwocHJlZmFiTWdyLmVycm9yKTtcbiAgICAgICAgfVxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gTm90ZTogZmFjYWRlUmV0dXJuIGZyb20gY2NlLlNjZW5lRmFjYWRlTWFuYWdlci5hcHBseVByZWZhYiBpc1xuICAgICAgICAgICAgLy8gb2JzZXJ2ZWQgdG8gYmUgYGZhbHNlYCBldmVuIHdoZW4gdGhlIGFwcGx5IGdlbnVpbmVseSB3cml0ZXNcbiAgICAgICAgICAgIC8vIHRvIGRpc2sgKHZlcmlmaWVkIGR1cmluZyBQNCB2Mi4xLjAgcmVhbC1lZGl0b3IgdGVzdGluZykuXG4gICAgICAgICAgICAvLyBUcmVhdCBcIm5vIGV4Y2VwdGlvbiB0aHJvd25cIiBhcyBzdWNjZXNzIGFuZCBzdXJmYWNlIHRoZSByYXdcbiAgICAgICAgICAgIC8vIHJldHVybiB2YWx1ZSBhcyBtZXRhZGF0YSBvbmx5LlxuICAgICAgICAgICAgLy8gKHYyLjkueCBwb2xpc2gg4oCUIEdlbWluaSByMSBzaW5nbGUt8J+foSBmcm9tIHYyLjguMSByZXZpZXc6XG4gICAgICAgICAgICAvLyBjYW5vbmljYWwgbmFtZSBpcyBTY2VuZUZhY2FkZU1hbmFnZXI7IGNjZS5TY2VuZUZhY2FkZSBpc1xuICAgICAgICAgICAgLy8gdGhlIHR5cGUtZG9jIGFsaWFzLiBVc2UgU2NlbmVGYWNhZGVNYW5hZ2VyIHRocm91Z2hvdXRcbiAgICAgICAgICAgIC8vIGNvbW1lbnRzIHNvIHRoZSBydW50aW1lIGlkZW50aXR5IGlzIHVuYW1iaWd1b3VzLilcbiAgICAgICAgICAgIGNvbnN0IGZhY2FkZVJldHVybiA9IGF3YWl0IHByZWZhYk1nci52YWx1ZS5hcHBseVByZWZhYihub2RlVXVpZCk7XG4gICAgICAgICAgICByZXR1cm4gb2soeyBmYWNhZGVSZXR1cm4sIG5vZGVVdWlkIH0pO1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChlcnJvcj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyb3IpKTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBDb25uZWN0IGEgcmVndWxhciBub2RlIHRvIGEgcHJlZmFiIGFzc2V0IChsaW5rKS5cbiAgICAgKiBXcmFwcyBzY2VuZSBmYWNhZGUgYGxpbmtQcmVmYWIobm9kZVV1aWQsIGFzc2V0VXVpZClgLlxuICAgICAqL1xuICAgIGFzeW5jIGxpbmtQcmVmYWIobm9kZVV1aWQ6IHN0cmluZywgYXNzZXRVdWlkOiBzdHJpbmcpIHtcbiAgICAgICAgY29uc3QgcHJlZmFiTWdyID0gZ2V0UHJlZmFiRmFjYWRlKCk7XG4gICAgICAgIGlmICghcHJlZmFiTWdyLm9rKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChwcmVmYWJNZ3IuZXJyb3IpO1xuICAgICAgICB9XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBwcmVmYWJNZ3IudmFsdWUubGlua1ByZWZhYihub2RlVXVpZCwgYXNzZXRVdWlkKTtcbiAgICAgICAgICAgIHJldHVybiBvayh7IGxpbmtlZDogcmVzdWx0LCBub2RlVXVpZCwgYXNzZXRVdWlkIH0pO1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChlcnJvcj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyb3IpKTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBCcmVhayB0aGUgcHJlZmFiIGNvbm5lY3Rpb24gb24gYSBub2RlLlxuICAgICAqIFdyYXBzIHNjZW5lIGZhY2FkZSBgdW5saW5rUHJlZmFiKG5vZGVVdWlkLCByZW1vdmVOZXN0ZWQpYC5cbiAgICAgKi9cbiAgICBhc3luYyB1bmxpbmtQcmVmYWIobm9kZVV1aWQ6IHN0cmluZywgcmVtb3ZlTmVzdGVkOiBib29sZWFuKSB7XG4gICAgICAgIGNvbnN0IHByZWZhYk1nciA9IGdldFByZWZhYkZhY2FkZSgpO1xuICAgICAgICBpZiAoIXByZWZhYk1nci5vaykge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwocHJlZmFiTWdyLmVycm9yKTtcbiAgICAgICAgfVxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgcHJlZmFiTWdyLnZhbHVlLnVubGlua1ByZWZhYihub2RlVXVpZCwgcmVtb3ZlTmVzdGVkKTtcbiAgICAgICAgICAgIHJldHVybiBvayh7IHVubGlua2VkOiByZXN1bHQsIG5vZGVVdWlkLCByZW1vdmVOZXN0ZWQgfSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGVycm9yPy5tZXNzYWdlID8/IFN0cmluZyhlcnJvcikpO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFJlYWQgdGhlIHByZWZhYiBkdW1wIGZvciBhIHByZWZhYiBpbnN0YW5jZSBub2RlLlxuICAgICAqIFdyYXBzIHNjZW5lIGZhY2FkZSBgZ2V0UHJlZmFiRGF0YShub2RlVXVpZClgLlxuICAgICAqL1xuICAgIGdldFByZWZhYkRhdGEobm9kZVV1aWQ6IHN0cmluZykge1xuICAgICAgICBjb25zdCBwcmVmYWJNZ3IgPSBnZXRQcmVmYWJGYWNhZGUoKTtcbiAgICAgICAgaWYgKCFwcmVmYWJNZ3Iub2spIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKHByZWZhYk1nci5lcnJvcik7XG4gICAgICAgIH1cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGRhdGEgPSBwcmVmYWJNZ3IudmFsdWUuZ2V0UHJlZmFiRGF0YShub2RlVXVpZCk7XG4gICAgICAgICAgICByZXR1cm4gb2soZGF0YSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGVycm9yPy5tZXNzYWdlID8/IFN0cmluZyhlcnJvcikpO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEFwcGVuZCBhIGNjLkV2ZW50SGFuZGxlciBlbnRyeSB0byBhIGNvbXBvbmVudCdzIGV2ZW50IGFycmF5XG4gICAgICogKGUuZy4gY2MuQnV0dG9uLmNsaWNrRXZlbnRzLCBjYy5Ub2dnbGUuY2hlY2tFdmVudHMpLlxuICAgICAqXG4gICAgICogUGVyc2lzdGVuY2Ugbm90ZSAoQ0xBVURFLm1kIExhbmRtaW5lICMxMSk6IHNjZW5lLXNjcmlwdCBgYXJyLnB1c2hgXG4gICAgICogb25seSBtdXRhdGVzIHRoZSBydW50aW1lIGNjLkNvbXBvbmVudCBpbnN0YW5jZTsgdGhlIGVkaXRvcidzXG4gICAgICogc2VyaWFsaXphdGlvbiBtb2RlbCAod2hhdCBgc2F2ZS1zY2VuZWAgd3JpdGVzIHRvIGRpc2spIGRvZXMgbm90IHNlZVxuICAgICAqIHRoZSBjaGFuZ2UuIFRoZSBob3N0LXNpZGUgY2FsbGVyIChgY29tcG9uZW50LXRvb2xzLnRzYCkgaXNcbiAgICAgKiByZXNwb25zaWJsZSBmb3IgbnVkZ2luZyB0aGUgbW9kZWwgYWZ0ZXJ3YXJkcyB2aWEgYSBuby1vcFxuICAgICAqIGBzZXQtcHJvcGVydHlgIG9uIGEgY29tcG9uZW50IGZpZWxkIOKAlCBjYWxsaW5nIGBzZXQtcHJvcGVydHlgIGZyb21cbiAgICAgKiBoZXJlIGRvZXNuJ3QgcHJvcGFnYXRlIChzY2VuZS1wcm9jZXNzIElQQyBzaG9ydC1jaXJjdWl0cyBhbmRcbiAgICAgKiBza2lwcyB0aGUgbW9kZWwgc3luYykuIFdlIHN1cmZhY2UgYGNvbXBvbmVudFV1aWRgIGFuZFxuICAgICAqIGBjb21wb25lbnRFbmFibGVkYCBzbyB0aGUgY2FsbGVyIGhhcyB3aGF0IGl0IG5lZWRzLlxuICAgICAqL1xuICAgIGFkZEV2ZW50SGFuZGxlcihcbiAgICAgICAgbm9kZVV1aWQ6IHN0cmluZyxcbiAgICAgICAgY29tcG9uZW50VHlwZTogc3RyaW5nLFxuICAgICAgICBldmVudEFycmF5UHJvcGVydHk6IHN0cmluZyxcbiAgICAgICAgdGFyZ2V0VXVpZDogc3RyaW5nLFxuICAgICAgICBjb21wb25lbnROYW1lOiBzdHJpbmcsXG4gICAgICAgIGhhbmRsZXI6IHN0cmluZyxcbiAgICAgICAgY3VzdG9tRXZlbnREYXRhPzogc3RyaW5nLFxuICAgICkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgY2MgPSByZXF1aXJlKCdjYycpO1xuICAgICAgICAgICAgY29uc3QgY3R4ID0gcmVzb2x2ZUNvbXBvbmVudENvbnRleHQobm9kZVV1aWQsIGNvbXBvbmVudFR5cGUpO1xuICAgICAgICAgICAgaWYgKCFjdHgub2spIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGN0eC5lcnJvciB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgdGFyZ2V0Tm9kZSA9IGZpbmROb2RlQnlVdWlkRGVlcChjdHguc2NlbmUsIHRhcmdldFV1aWQpO1xuICAgICAgICAgICAgaWYgKCF0YXJnZXROb2RlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgVGFyZ2V0IG5vZGUgd2l0aCBVVUlEICR7dGFyZ2V0VXVpZH0gbm90IGZvdW5kYCB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgYXJyID0gY3R4LmNvbXBvbmVudFtldmVudEFycmF5UHJvcGVydHldO1xuICAgICAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KGFycikpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBQcm9wZXJ0eSAnJHtldmVudEFycmF5UHJvcGVydHl9JyBvbiAke2NvbXBvbmVudFR5cGV9IGlzIG5vdCBhbiBhcnJheSAoZ290ICR7dHlwZW9mIGFycn0pYCB9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBlaCA9IG5ldyBjYy5FdmVudEhhbmRsZXIoKTtcbiAgICAgICAgICAgIGVoLnRhcmdldCA9IHRhcmdldE5vZGU7XG4gICAgICAgICAgICBlaC5jb21wb25lbnQgPSBjb21wb25lbnROYW1lO1xuICAgICAgICAgICAgZWguaGFuZGxlciA9IGhhbmRsZXI7XG4gICAgICAgICAgICBlaC5jdXN0b21FdmVudERhdGEgPSBjdXN0b21FdmVudERhdGEgPz8gJyc7XG4gICAgICAgICAgICBhcnIucHVzaChlaCk7XG5cbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnNlbmQoJ3NjZW5lJywgJ3NuYXBzaG90Jyk7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICBpbmRleDogYXJyLmxlbmd0aCAtIDEsXG4gICAgICAgICAgICAgICAgICAgIGNvdW50OiBhcnIubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRVdWlkOiBjdHguY29tcG9uZW50LnV1aWQsXG4gICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudEVuYWJsZWQ6IGN0eC5jb21wb25lbnQuZW5hYmxlZCAhPT0gZmFsc2UsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3I/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycm9yKSB9O1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFJlbW92ZSBhIGNjLkV2ZW50SGFuZGxlciBlbnRyeSBieSBpbmRleCwgb3IgYnkgbWF0Y2hpbmdcbiAgICAgKiAodGFyZ2V0VXVpZCwgaGFuZGxlcikgcGFpci4gSWYgYm90aCBhcmUgcHJvdmlkZWQsIGluZGV4IHdpbnMuXG4gICAgICpcbiAgICAgKiBTZWUgYWRkRXZlbnRIYW5kbGVyIGZvciB0aGUgcGVyc2lzdGVuY2Ugbm90ZS4gQ2FsbGVyIG11c3QgZm9sbG93IHVwXG4gICAgICogd2l0aCBhIGhvc3Qtc2lkZSBgc2V0LXByb3BlcnR5YCBudWRnZSB1c2luZyB0aGUgcmV0dXJuZWRcbiAgICAgKiBgY29tcG9uZW50VXVpZGAgLyBgY29tcG9uZW50RW5hYmxlZGAgdG8gbWFrZSB0aGUgY2hhbmdlIHZpc2libGUgdG9cbiAgICAgKiBgc2F2ZS1zY2VuZWAuXG4gICAgICovXG4gICAgcmVtb3ZlRXZlbnRIYW5kbGVyKFxuICAgICAgICBub2RlVXVpZDogc3RyaW5nLFxuICAgICAgICBjb21wb25lbnRUeXBlOiBzdHJpbmcsXG4gICAgICAgIGV2ZW50QXJyYXlQcm9wZXJ0eTogc3RyaW5nLFxuICAgICAgICBpbmRleDogbnVtYmVyIHwgbnVsbCxcbiAgICAgICAgdGFyZ2V0VXVpZDogc3RyaW5nIHwgbnVsbCxcbiAgICAgICAgaGFuZGxlcjogc3RyaW5nIHwgbnVsbCxcbiAgICApIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGN0eCA9IHJlc29sdmVDb21wb25lbnRDb250ZXh0KG5vZGVVdWlkLCBjb21wb25lbnRUeXBlKTtcbiAgICAgICAgICAgIGlmICghY3R4Lm9rKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBjdHguZXJyb3IgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGFyciA9IGN0eC5jb21wb25lbnRbZXZlbnRBcnJheVByb3BlcnR5XTtcbiAgICAgICAgICAgIGlmICghQXJyYXkuaXNBcnJheShhcnIpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgUHJvcGVydHkgJyR7ZXZlbnRBcnJheVByb3BlcnR5fScgb24gJHtjb21wb25lbnRUeXBlfSBpcyBub3QgYW4gYXJyYXlgIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIFRyaW0gYXJvdW5kIGNvbXBhcmlzb25zIHNvIGNhbGxlcnMgcGFzc2luZyBVVUlEcyAvIGhhbmRsZXJcbiAgICAgICAgICAgIC8vIG5hbWVzIHdpdGggbGVhZGluZy90cmFpbGluZyB3aGl0ZXNwYWNlIChMTE0gdG9vbCBhcmdzIG9mdGVuXG4gICAgICAgICAgICAvLyBjb21lIHdpdGggc3RyYXkgc3BhY2VzKSBzdGlsbCBmaW5kIGEgbWF0Y2guIENydWNpYWw6IHRoZVxuICAgICAgICAgICAgLy8gb3V0ZXIgZ3VhcmQgdGVzdHMgdGhlICp0cmltbWVkKiB2YWx1ZXMgdG9vIOKAlCBvdGhlcndpc2UgYVxuICAgICAgICAgICAgLy8gd2hpdGVzcGFjZS1vbmx5IHRhcmdldFV1aWQvaGFuZGxlciB3b3VsZCBwYXNzIGFzIHRydXRoeSxcbiAgICAgICAgICAgIC8vIGNvbGxhcHNlIHRvIG51bGwgYWZ0ZXIgdHJpbSwgYW5kIHRoZSBwcmVkaWNhdGUgd291bGQgbWF0Y2hcbiAgICAgICAgICAgIC8vIGV2ZXJ5IGVudHJ5IHZhY3VvdXNseSwgc2lsZW50bHkgZGVsZXRpbmcgYXJyWzBdLlxuICAgICAgICAgICAgY29uc3QgdGFyZ2V0VXVpZE5vcm0gPSB0YXJnZXRVdWlkPy50cmltKCkgfHwgbnVsbDtcbiAgICAgICAgICAgIGNvbnN0IGhhbmRsZXJOb3JtID0gaGFuZGxlcj8udHJpbSgpIHx8IG51bGw7XG4gICAgICAgICAgICBsZXQgcmVtb3ZlQXQgPSAtMTtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgaW5kZXggPT09ICdudW1iZXInICYmIGluZGV4ID49IDApIHtcbiAgICAgICAgICAgICAgICByZW1vdmVBdCA9IGluZGV4O1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0YXJnZXRVdWlkTm9ybSB8fCBoYW5kbGVyTm9ybSkge1xuICAgICAgICAgICAgICAgIHJlbW92ZUF0ID0gYXJyLmZpbmRJbmRleCgoZWg6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBlaFRhcmdldFV1aWQgPSB0eXBlb2YgZWg/LnRhcmdldD8udXVpZCA9PT0gJ3N0cmluZycgPyBlaC50YXJnZXQudXVpZC50cmltKCkgOiBlaD8udGFyZ2V0Py51dWlkO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBlaEhhbmRsZXIgPSB0eXBlb2YgZWg/LmhhbmRsZXIgPT09ICdzdHJpbmcnID8gZWguaGFuZGxlci50cmltKCkgOiBlaD8uaGFuZGxlcjtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbWF0Y2hlc1RhcmdldCA9ICF0YXJnZXRVdWlkTm9ybSB8fCBlaFRhcmdldFV1aWQgPT09IHRhcmdldFV1aWROb3JtO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBtYXRjaGVzSGFuZGxlciA9ICFoYW5kbGVyTm9ybSB8fCBlaEhhbmRsZXIgPT09IGhhbmRsZXJOb3JtO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gbWF0Y2hlc1RhcmdldCAmJiBtYXRjaGVzSGFuZGxlcjtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChyZW1vdmVBdCA8IDAgfHwgcmVtb3ZlQXQgPj0gYXJyLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ05vIG1hdGNoaW5nIGV2ZW50IGhhbmRsZXIgdG8gcmVtb3ZlJyB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgcmVtb3ZlZCA9IGFyci5zcGxpY2UocmVtb3ZlQXQsIDEpWzBdO1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2Uuc2VuZCgnc2NlbmUnLCAnc25hcHNob3QnKTtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIGluZGV4OiByZW1vdmVBdCxcbiAgICAgICAgICAgICAgICAgICAgcmVtYWluaW5nOiBhcnIubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICByZW1vdmVkOiBzZXJpYWxpemVFdmVudEhhbmRsZXIocmVtb3ZlZCksXG4gICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudFV1aWQ6IGN0eC5jb21wb25lbnQudXVpZCxcbiAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50RW5hYmxlZDogY3R4LmNvbXBvbmVudC5lbmFibGVkICE9PSBmYWxzZSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvcj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyb3IpIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogSW5zcGVjdCBhIGNvbXBvbmVudCdzIEV2ZW50SGFuZGxlciBhcnJheSAocmVhZC1vbmx5KS5cbiAgICAgKi9cbiAgICBsaXN0RXZlbnRIYW5kbGVycyhub2RlVXVpZDogc3RyaW5nLCBjb21wb25lbnRUeXBlOiBzdHJpbmcsIGV2ZW50QXJyYXlQcm9wZXJ0eTogc3RyaW5nKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBjdHggPSByZXNvbHZlQ29tcG9uZW50Q29udGV4dChub2RlVXVpZCwgY29tcG9uZW50VHlwZSk7XG4gICAgICAgICAgICBpZiAoIWN0eC5vaykge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogY3R4LmVycm9yIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBhcnIgPSBjdHguY29tcG9uZW50W2V2ZW50QXJyYXlQcm9wZXJ0eV07XG4gICAgICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkoYXJyKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYFByb3BlcnR5ICcke2V2ZW50QXJyYXlQcm9wZXJ0eX0nIG9uICR7Y29tcG9uZW50VHlwZX0gaXMgbm90IGFuIGFycmF5YCB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgY291bnQ6IGFyci5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgIGhhbmRsZXJzOiBhcnIubWFwKHNlcmlhbGl6ZUV2ZW50SGFuZGxlciksXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3I/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycm9yKSB9O1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIHYyLjQuOCBBMjogY2MuQW5pbWF0aW9uIGRyaXZlcnMg4oCUIHNlZSBzb3VyY2UvdG9vbHMvYW5pbWF0aW9uLXRvb2xzLnRzLlxuICAgICAqIEltcGxlbWVudGF0aW9uIG5vdGU6IGNvY29zIGV4cG9zZXMgdGhlIGVuZ2luZSdzIGBjYy5BbmltYXRpb25gIChhbmRcbiAgICAgKiBpdHMgc3ViLWNsYXNzZXMgdmlhIGBqcy5nZXRDbGFzc0J5TmFtZWApLiBXZSB1c2UgdGhlIHJ1bnRpbWUgQVBJXG4gICAgICogKGBnZXRDb21wb25lbnQoJ2NjLkFuaW1hdGlvbicpYCkgcmF0aGVyIHRoYW4gdGhlIGVkaXRvcidzIHNldC1wcm9wZXJ0eVxuICAgICAqIGNoYW5uZWwgYmVjYXVzZSB0aGUgbGF0dGVyIHdvdWxkIG9ubHkgcGVyc2lzdCBkZWZhdWx0Q2xpcCAvIHBsYXlPbkxvYWRcbiAgICAgKiBidXQgY2Fubm90IHRyaWdnZXIgcGxheSgpL3N0b3AoKSDigJQgdGhvc2UgYXJlIHJ1bnRpbWUgbWV0aG9kcyBvbmx5LlxuICAgICAqL1xuICAgIGdldEFuaW1hdGlvbkNsaXBzKG5vZGVVdWlkOiBzdHJpbmcpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IgfSA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgICAgICBpZiAoIXNjZW5lKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdObyBhY3RpdmUgc2NlbmUnIH07XG4gICAgICAgICAgICBjb25zdCBub2RlID0gZmluZE5vZGVCeVV1aWREZWVwKHNjZW5lLCBub2RlVXVpZCk7XG4gICAgICAgICAgICBpZiAoIW5vZGUpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYE5vZGUgJHtub2RlVXVpZH0gbm90IGZvdW5kYCB9O1xuICAgICAgICAgICAgY29uc3QgYW5pbSA9IG5vZGUuZ2V0Q29tcG9uZW50KCdjYy5BbmltYXRpb24nKTtcbiAgICAgICAgICAgIGlmICghYW5pbSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYE5vZGUgJHtub2RlVXVpZH0gaGFzIG5vIGNjLkFuaW1hdGlvbiBjb21wb25lbnRgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBjbGlwczogYW55W10gPSBhbmltLmNsaXBzID8/IFtdO1xuICAgICAgICAgICAgY29uc3QgZGVmYXVsdENsaXBOYW1lID0gYW5pbS5kZWZhdWx0Q2xpcD8ubmFtZSA/PyBudWxsO1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgICAgIG5vZGVOYW1lOiBub2RlLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgIGRlZmF1bHRDbGlwOiBkZWZhdWx0Q2xpcE5hbWUsXG4gICAgICAgICAgICAgICAgICAgIHBsYXlPbkxvYWQ6IGFuaW0ucGxheU9uTG9hZCA9PT0gdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgY2xpcHM6IGNsaXBzLmZpbHRlcihjID0+IGMpLm1hcChjID0+ICh7XG4gICAgICAgICAgICAgICAgICAgICAgICBuYW1lOiBjLm5hbWUgPz8gbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IGMuX3V1aWQgPz8gYy51dWlkID8/IG51bGwsXG4gICAgICAgICAgICAgICAgICAgICAgICBkdXJhdGlvbjogdHlwZW9mIGMuZHVyYXRpb24gPT09ICdudW1iZXInID8gYy5kdXJhdGlvbiA6IG51bGwsXG4gICAgICAgICAgICAgICAgICAgICAgICB3cmFwTW9kZTogYy53cmFwTW9kZSA/PyBudWxsLFxuICAgICAgICAgICAgICAgICAgICB9KSksXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3I/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycm9yKSB9O1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIGxpc3RBbmltYXRpb25TdGF0ZXMobm9kZVV1aWQ6IHN0cmluZykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgeyBkaXJlY3RvciB9ID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICAgICAgICAgIGlmICghc2NlbmUpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ05vIGFjdGl2ZSBzY2VuZScgfTtcbiAgICAgICAgICAgIGNvbnN0IG5vZGUgPSBmaW5kTm9kZUJ5VXVpZERlZXAoc2NlbmUsIG5vZGVVdWlkKTtcbiAgICAgICAgICAgIGlmICghbm9kZSkgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgTm9kZSAke25vZGVVdWlkfSBub3QgZm91bmRgIH07XG4gICAgICAgICAgICBjb25zdCBhbmltID0gbm9kZS5nZXRDb21wb25lbnQoJ2NjLkFuaW1hdGlvbicpO1xuICAgICAgICAgICAgaWYgKCFhbmltKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgTm9kZSAke25vZGVVdWlkfSBoYXMgbm8gY2MuQW5pbWF0aW9uIGNvbXBvbmVudGAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGNsaXBzOiBhbnlbXSA9IHR5cGVvZiBhbmltLmdldEFuaW1hdGlvbkNsaXBzID09PSAnZnVuY3Rpb24nXG4gICAgICAgICAgICAgICAgPyBhbmltLmdldEFuaW1hdGlvbkNsaXBzKClcbiAgICAgICAgICAgICAgICA6IChhbmltLmNsaXBzID8/IFtdKTtcbiAgICAgICAgICAgIGNvbnN0IHN0YXRlcyA9IGNsaXBzXG4gICAgICAgICAgICAgICAgLmZpbHRlcigoY2xpcDogYW55KSA9PiBjbGlwPy5uYW1lKVxuICAgICAgICAgICAgICAgIC5tYXAoKGNsaXA6IGFueSkgPT4gYW5pbS5nZXRTdGF0ZShjbGlwLm5hbWUpKVxuICAgICAgICAgICAgICAgIC5maWx0ZXIoKHN0YXRlOiBhbnkpID0+IHN0YXRlKVxuICAgICAgICAgICAgICAgIC5tYXAoKHN0YXRlOiBhbnkpID0+ICh7XG4gICAgICAgICAgICAgICAgICAgIG5hbWU6IHN0YXRlLm5hbWUgPz8gbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgc3BlZWQ6IHR5cGVvZiBzdGF0ZS5zcGVlZCA9PT0gJ251bWJlcicgPyBzdGF0ZS5zcGVlZCA6IG51bGwsXG4gICAgICAgICAgICAgICAgICAgIHRvdGFsVGltZTogdHlwZW9mIHN0YXRlLnRvdGFsVGltZSA9PT0gJ251bWJlcicgPyBzdGF0ZS50b3RhbFRpbWUgOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICBjdXJyZW50VGltZTogdHlwZW9mIHN0YXRlLmN1cnJlbnRUaW1lID09PSAnbnVtYmVyJyA/IHN0YXRlLmN1cnJlbnRUaW1lIDogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgaXNQbGF5aW5nOiBzdGF0ZS5pc1BsYXlpbmcgPT09IHRydWUsXG4gICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogc3RhdGVzIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3I/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycm9yKSB9O1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIGdldEFuaW1hdGlvblN0YXRlSW5mbyhub2RlVXVpZDogc3RyaW5nLCBzdGF0ZU5hbWU6IHN0cmluZykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgeyBkaXJlY3RvciB9ID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICAgICAgICAgIGlmICghc2NlbmUpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ05vIGFjdGl2ZSBzY2VuZScgfTtcbiAgICAgICAgICAgIGNvbnN0IG5vZGUgPSBmaW5kTm9kZUJ5VXVpZERlZXAoc2NlbmUsIG5vZGVVdWlkKTtcbiAgICAgICAgICAgIGlmICghbm9kZSkgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgTm9kZSAke25vZGVVdWlkfSBub3QgZm91bmRgIH07XG4gICAgICAgICAgICBjb25zdCBhbmltID0gbm9kZS5nZXRDb21wb25lbnQoJ2NjLkFuaW1hdGlvbicpO1xuICAgICAgICAgICAgaWYgKCFhbmltKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgTm9kZSAke25vZGVVdWlkfSBoYXMgbm8gY2MuQW5pbWF0aW9uIGNvbXBvbmVudGAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHN0YXRlID0gYW5pbS5nZXRTdGF0ZShzdGF0ZU5hbWUpO1xuICAgICAgICAgICAgaWYgKCFzdGF0ZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYEFuaW1hdGlvbiBzdGF0ZSAnJHtzdGF0ZU5hbWV9JyBub3QgZm91bmRgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICBzcGVlZDogdHlwZW9mIHN0YXRlLnNwZWVkID09PSAnbnVtYmVyJyA/IHN0YXRlLnNwZWVkIDogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgaXNQbGF5aW5nOiBzdGF0ZS5pc1BsYXlpbmcgPT09IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIGN1cnJlbnRUaW1lOiB0eXBlb2Ygc3RhdGUuY3VycmVudFRpbWUgPT09ICdudW1iZXInID8gc3RhdGUuY3VycmVudFRpbWUgOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICB0b3RhbFRpbWU6IHR5cGVvZiBzdGF0ZS50b3RhbFRpbWUgPT09ICdudW1iZXInID8gc3RhdGUudG90YWxUaW1lIDogbnVsbCxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvcj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyb3IpIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgc2V0QW5pbWF0aW9uU3BlZWQobm9kZVV1aWQ6IHN0cmluZywgc3RhdGVOYW1lOiBzdHJpbmcsIHNwZWVkOiBudW1iZXIpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IgfSA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgICAgICBpZiAoIXNjZW5lKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdObyBhY3RpdmUgc2NlbmUnIH07XG4gICAgICAgICAgICBjb25zdCBub2RlID0gZmluZE5vZGVCeVV1aWREZWVwKHNjZW5lLCBub2RlVXVpZCk7XG4gICAgICAgICAgICBpZiAoIW5vZGUpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYE5vZGUgJHtub2RlVXVpZH0gbm90IGZvdW5kYCB9O1xuICAgICAgICAgICAgY29uc3QgYW5pbSA9IG5vZGUuZ2V0Q29tcG9uZW50KCdjYy5BbmltYXRpb24nKTtcbiAgICAgICAgICAgIGlmICghYW5pbSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYE5vZGUgJHtub2RlVXVpZH0gaGFzIG5vIGNjLkFuaW1hdGlvbiBjb21wb25lbnRgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBzdGF0ZSA9IGFuaW0uZ2V0U3RhdGUoc3RhdGVOYW1lKTtcbiAgICAgICAgICAgIGlmICghc3RhdGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBBbmltYXRpb24gc3RhdGUgJyR7c3RhdGVOYW1lfScgbm90IGZvdW5kYCB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc3RhdGUuc3BlZWQgPSBzcGVlZDtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIHNwZWVkOiBzdGF0ZS5zcGVlZCxcbiAgICAgICAgICAgICAgICAgICAgaXNQbGF5aW5nOiBzdGF0ZS5pc1BsYXlpbmcgPT09IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIGN1cnJlbnRUaW1lOiB0eXBlb2Ygc3RhdGUuY3VycmVudFRpbWUgPT09ICdudW1iZXInID8gc3RhdGUuY3VycmVudFRpbWUgOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICB0b3RhbFRpbWU6IHR5cGVvZiBzdGF0ZS50b3RhbFRpbWUgPT09ICdudW1iZXInID8gc3RhdGUudG90YWxUaW1lIDogbnVsbCxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvcj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyb3IpIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgY2hlY2tBbmltYXRpb25GaW5pc2hlZChub2RlVXVpZDogc3RyaW5nLCBzdGF0ZU5hbWU6IHN0cmluZykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgeyBkaXJlY3RvciB9ID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICAgICAgICAgIGlmICghc2NlbmUpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ05vIGFjdGl2ZSBzY2VuZScgfTtcbiAgICAgICAgICAgIGNvbnN0IG5vZGUgPSBmaW5kTm9kZUJ5VXVpZERlZXAoc2NlbmUsIG5vZGVVdWlkKTtcbiAgICAgICAgICAgIGlmICghbm9kZSkgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgTm9kZSAke25vZGVVdWlkfSBub3QgZm91bmRgIH07XG4gICAgICAgICAgICBjb25zdCBhbmltID0gbm9kZS5nZXRDb21wb25lbnQoJ2NjLkFuaW1hdGlvbicpO1xuICAgICAgICAgICAgaWYgKCFhbmltKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgTm9kZSAke25vZGVVdWlkfSBoYXMgbm8gY2MuQW5pbWF0aW9uIGNvbXBvbmVudGAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHN0YXRlID0gYW5pbS5nZXRTdGF0ZShzdGF0ZU5hbWUpO1xuICAgICAgICAgICAgaWYgKCFzdGF0ZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYEFuaW1hdGlvbiBzdGF0ZSAnJHtzdGF0ZU5hbWV9JyBub3QgZm91bmRgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBjdXJyZW50VGltZSA9IHR5cGVvZiBzdGF0ZS5jdXJyZW50VGltZSA9PT0gJ251bWJlcicgPyBzdGF0ZS5jdXJyZW50VGltZSA6IDA7XG4gICAgICAgICAgICBjb25zdCB0b3RhbFRpbWUgPSB0eXBlb2Ygc3RhdGUudG90YWxUaW1lID09PSAnbnVtYmVyJyA/IHN0YXRlLnRvdGFsVGltZSA6IDA7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBkYXRhOiB7IGZpbmlzaGVkOiBjdXJyZW50VGltZSA+PSB0b3RhbFRpbWUgfSB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycm9yPy5tZXNzYWdlID8/IFN0cmluZyhlcnJvcikgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICBwbGF5QW5pbWF0aW9uKG5vZGVVdWlkOiBzdHJpbmcsIGNsaXBOYW1lPzogc3RyaW5nKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCB7IGRpcmVjdG9yIH0gPSByZXF1aXJlKCdjYycpO1xuICAgICAgICAgICAgY29uc3Qgc2NlbmUgPSBkaXJlY3Rvci5nZXRTY2VuZSgpO1xuICAgICAgICAgICAgaWYgKCFzY2VuZSkgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnTm8gYWN0aXZlIHNjZW5lJyB9O1xuICAgICAgICAgICAgY29uc3Qgbm9kZSA9IGZpbmROb2RlQnlVdWlkRGVlcChzY2VuZSwgbm9kZVV1aWQpO1xuICAgICAgICAgICAgaWYgKCFub2RlKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBOb2RlICR7bm9kZVV1aWR9IG5vdCBmb3VuZGAgfTtcbiAgICAgICAgICAgIGNvbnN0IGFuaW0gPSBub2RlLmdldENvbXBvbmVudCgnY2MuQW5pbWF0aW9uJyk7XG4gICAgICAgICAgICBpZiAoIWFuaW0pIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBOb2RlICR7bm9kZVV1aWR9IGhhcyBubyBjYy5BbmltYXRpb24gY29tcG9uZW50YCB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGNsaXBOYW1lKSB7XG4gICAgICAgICAgICAgICAgLy8gVmFsaWRhdGUgY2xpcCBleGlzdHMgYmVmb3JlIGNhbGxpbmcgcGxheSgpIOKAlCBjYy5BbmltYXRpb24ucGxheVxuICAgICAgICAgICAgICAgIC8vIHNpbGVudGx5IGRvZXMgbm90aGluZyBvbiB1bmtub3duIG5hbWVzIHdoaWNoIHdvdWxkIG1hc2tcbiAgICAgICAgICAgICAgICAvLyB0eXBvcyBpbiBBSS1nZW5lcmF0ZWQgY2FsbHMuXG4gICAgICAgICAgICAgICAgY29uc3Qga25vd24gPSAoYW5pbS5jbGlwcyA/PyBbXSkuc29tZSgoYzogYW55KSA9PiBjPy5uYW1lID09PSBjbGlwTmFtZSk7XG4gICAgICAgICAgICAgICAgaWYgKCFrbm93biAmJiAoYW5pbS5kZWZhdWx0Q2xpcD8ubmFtZSAhPT0gY2xpcE5hbWUpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yOiBgQ2xpcCAnJHtjbGlwTmFtZX0nIGlzIG5vdCByZWdpc3RlcmVkIG9uIHRoaXMgQW5pbWF0aW9uLiBLbm93bjogJHsoYW5pbS5jbGlwcyA/PyBbXSkubWFwKChjOiBhbnkpID0+IGM/Lm5hbWUpLmZpbHRlcihCb29sZWFuKS5qb2luKCcsICcpIHx8ICcobm9uZSknfS5gLFxuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBhbmltLnBsYXkoY2xpcE5hbWUpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBpZiAoIWFuaW0uZGVmYXVsdENsaXApIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnTm8gY2xpcE5hbWUgZ2l2ZW4gYW5kIG5vIGRlZmF1bHRDbGlwIGNvbmZpZ3VyZWQnIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGFuaW0ucGxheSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBQbGF5aW5nICcke2NsaXBOYW1lID8/IGFuaW0uZGVmYXVsdENsaXA/Lm5hbWV9JyBvbiAke25vZGUubmFtZX1gLFxuICAgICAgICAgICAgICAgIGRhdGE6IHsgbm9kZVV1aWQsIGNsaXBOYW1lOiBjbGlwTmFtZSA/PyBhbmltLmRlZmF1bHRDbGlwPy5uYW1lID8/IG51bGwgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3I/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycm9yKSB9O1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIHN0b3BBbmltYXRpb24obm9kZVV1aWQ6IHN0cmluZykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgeyBkaXJlY3RvciB9ID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICAgICAgICAgIGlmICghc2NlbmUpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ05vIGFjdGl2ZSBzY2VuZScgfTtcbiAgICAgICAgICAgIGNvbnN0IG5vZGUgPSBmaW5kTm9kZUJ5VXVpZERlZXAoc2NlbmUsIG5vZGVVdWlkKTtcbiAgICAgICAgICAgIGlmICghbm9kZSkgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgTm9kZSAke25vZGVVdWlkfSBub3QgZm91bmRgIH07XG4gICAgICAgICAgICBjb25zdCBhbmltID0gbm9kZS5nZXRDb21wb25lbnQoJ2NjLkFuaW1hdGlvbicpO1xuICAgICAgICAgICAgaWYgKCFhbmltKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgTm9kZSAke25vZGVVdWlkfSBoYXMgbm8gY2MuQW5pbWF0aW9uIGNvbXBvbmVudGAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGFuaW0uc3RvcCgpO1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgbWVzc2FnZTogYFN0b3BwZWQgYW5pbWF0aW9uIG9uICR7bm9kZS5uYW1lfWAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvcj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyb3IpIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogUmVzb2x2ZSBhIGNsaXAgbmFtZSDihpIgYXNzZXQgdXVpZCBvbiBhIG5vZGUncyBjYy5BbmltYXRpb24uIFJldHVybnNcbiAgICAgKiB0aGUgbWF0Y2hpbmcgY2xpcCdzIGBfdXVpZGAgYWxvbmcgd2l0aCB0aGUgY2MuQW5pbWF0aW9uIGNvbXBvbmVudFxuICAgICAqIGluZGV4IGluc2lkZSBgX19jb21wc19fYCwgYm90aCBvZiB3aGljaCB0aGUgaG9zdC1zaWRlXG4gICAgICogYW5pbWF0aW9uX3NldF9jbGlwIGhhbmRsZXIgbmVlZHMgdG8gaXNzdWUgYHNldC1wcm9wZXJ0eWAgd3JpdGVzLlxuICAgICAqXG4gICAgICogV2h5IGhvc3Qtc2lkZSBkb2VzIHRoZSBhY3R1YWwgd3JpdGU6IExhbmRtaW5lICMxMSDigJQgc2NhbGFyXG4gICAgICogcHJvcGVydHkgd3JpdGVzIHZpYSB0aGUgZWRpdG9yJ3Mgc2V0LXByb3BlcnR5IGNoYW5uZWwgcHJvcGFnYXRlXG4gICAgICogdG8gdGhlIHNlcmlhbGl6YXRpb24gbW9kZWwgaW1tZWRpYXRlbHkuIERpcmVjdCBydW50aW1lIG11dGF0aW9uXG4gICAgICogKGBhbmltLmRlZmF1bHRDbGlwID0geGApIG9ubHkgdXBkYXRlcyBsYXllciAoYSkgYW5kIG1heSBub3RcbiAgICAgKiBwZXJzaXN0IG9uIHNhdmVfc2NlbmUuIFNvIHNjZW5lLXNjcmlwdCByZXR1cm5zIHRoZSBtZXRhZGF0YTsgaG9zdFxuICAgICAqIGRvZXMgdGhlIHBlcnNpc3RlbmNlLlxuICAgICAqL1xuICAgIHF1ZXJ5QW5pbWF0aW9uU2V0VGFyZ2V0cyhub2RlVXVpZDogc3RyaW5nLCBjbGlwTmFtZTogc3RyaW5nIHwgbnVsbCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgeyBkaXJlY3RvciB9ID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICAgICAgICAgIGlmICghc2NlbmUpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ05vIGFjdGl2ZSBzY2VuZScgfTtcbiAgICAgICAgICAgIGNvbnN0IG5vZGUgPSBmaW5kTm9kZUJ5VXVpZERlZXAoc2NlbmUsIG5vZGVVdWlkKTtcbiAgICAgICAgICAgIGlmICghbm9kZSkgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgTm9kZSAke25vZGVVdWlkfSBub3QgZm91bmRgIH07XG4gICAgICAgICAgICAvLyB2Mi40LjkgcmV2aWV3IGZpeCAoY2xhdWRlICsgY29kZXgg8J+foSk6IHVzZSBpbmRleE9mIG9uIHRoZVxuICAgICAgICAgICAgLy8gcmVzb2x2ZWQgYW5pbSBpbnN0YW5jZSBkaXJlY3RseS4gVGhlIHByZXZpb3VzIG1ldGFkYXRhLXN0cmluZ1xuICAgICAgICAgICAgLy8gbG9va3VwIChjb25zdHJ1Y3Rvci5uYW1lIC8gX19jbGFzc25hbWVfXyAvIF9jaWQpIHdhcyBmcmFnaWxlXG4gICAgICAgICAgICAvLyBhZ2FpbnN0IGN1c3RvbSBzdWJjbGFzc2VzIChjYy5Ta2VsZXRhbEFuaW1hdGlvbiwgdXNlci1kZXJpdmVkXG4gICAgICAgICAgICAvLyBjYy5BbmltYXRpb24pLiBnZXRDb21wb25lbnQoJ2NjLkFuaW1hdGlvbicpIHJlc29sdmVzIHN1YmNsYXNzZXNcbiAgICAgICAgICAgIC8vIGNvcnJlY3RseTsgbWF0Y2hpbmcgYnkgcmVmZXJlbmNlIGlzIHRoZSBjYW5vbmljYWwgd2F5IHRvIGZpbmRcbiAgICAgICAgICAgIC8vIHRoZSBzYW1lIGluc3RhbmNlJ3Mgc2xvdCBpbiBfX2NvbXBzX18uXG4gICAgICAgICAgICBjb25zdCBhbmltID0gbm9kZS5nZXRDb21wb25lbnQoJ2NjLkFuaW1hdGlvbicpO1xuICAgICAgICAgICAgaWYgKCFhbmltKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgTm9kZSAke25vZGVVdWlkfSBoYXMgbm8gY2MuQW5pbWF0aW9uIGNvbXBvbmVudGAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGNvbXBvbmVudHM6IGFueVtdID0gKG5vZGUuX2NvbXBvbmVudHMgPz8gbm9kZS5jb21wb25lbnRzID8/IFtdKTtcbiAgICAgICAgICAgIGNvbnN0IGNvbXBJbmRleCA9IGNvbXBvbmVudHMuaW5kZXhPZihhbmltKTtcbiAgICAgICAgICAgIGlmIChjb21wSW5kZXggPT09IC0xKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgTm9kZSAke25vZGVVdWlkfSBjYy5BbmltYXRpb24gY29tcG9uZW50IG5vdCBmb3VuZCBpbiBfX2NvbXBzX18gYXJyYXkgKGNvY29zIGVkaXRvciBpbmNvbnNpc3RlbmN5KS5gIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBsZXQgY2xpcFV1aWQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICAgICAgICAgICAgaWYgKGNsaXBOYW1lICE9PSBudWxsICYmIGNsaXBOYW1lICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBjbGlwID0gKGFuaW0uY2xpcHMgPz8gW10pLmZpbmQoKGM6IGFueSkgPT4gYz8ubmFtZSA9PT0gY2xpcE5hbWUpO1xuICAgICAgICAgICAgICAgIGlmICghY2xpcCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgICAgICBlcnJvcjogYENsaXAgJyR7Y2xpcE5hbWV9JyBpcyBub3QgcmVnaXN0ZXJlZCBvbiB0aGlzIEFuaW1hdGlvbi4gS25vd246ICR7KGFuaW0uY2xpcHMgPz8gW10pLm1hcCgoYzogYW55KSA9PiBjPy5uYW1lKS5maWx0ZXIoQm9vbGVhbikuam9pbignLCAnKSB8fCAnKG5vbmUpJ30uYCxcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2xpcFV1aWQgPSBjbGlwLl91dWlkID8/IGNsaXAudXVpZCA/PyBudWxsO1xuICAgICAgICAgICAgICAgIGlmICghY2xpcFV1aWQpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgQ2xpcCAnJHtjbGlwTmFtZX0nIGhhcyBubyBhc3NldCB1dWlkOyBjYW5ub3QgcGVyc2lzdCBhcyBkZWZhdWx0Q2xpcC5gIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50SW5kZXg6IGNvbXBJbmRleCxcbiAgICAgICAgICAgICAgICAgICAgY2xpcFV1aWQsXG4gICAgICAgICAgICAgICAgICAgIGN1cnJlbnREZWZhdWx0Q2xpcDogYW5pbS5kZWZhdWx0Q2xpcD8ubmFtZSA/PyBudWxsLFxuICAgICAgICAgICAgICAgICAgICBjdXJyZW50UGxheU9uTG9hZDogYW5pbS5wbGF5T25Mb2FkID09PSB0cnVlLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycm9yPy5tZXNzYWdlID8/IFN0cmluZyhlcnJvcikgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiB2Mi44LjAgVC1WMjgtMyAvIHYyLjguMiByZXRlc3QgZml4OiBlbnRlciAvIGV4aXQgUHJldmlldy1pbi1FZGl0b3JcbiAgICAgKiAoUElFKSBwbGF5IG1vZGUgcHJvZ3JhbW1hdGljYWxseS4gVXNlcyB0aGUgdHlwZWRcbiAgICAgKiBgY2hhbmdlUHJldmlld1BsYXlTdGF0ZShzdGF0ZTogYm9vbGVhbilgIG1ldGhvZCBkZWNsYXJlZCBvblxuICAgICAqIGBTY2VuZUZhY2FkZU1hbmFnZXJgIOKAlFxuICAgICAqIGBub2RlX21vZHVsZXMvQGNvY29zL2NyZWF0b3ItdHlwZXMvZWRpdG9yL3BhY2thZ2VzL3NjZW5lL0B0eXBlcy9jY2UvM2QvZmFjYWRlL3NjZW5lLWZhY2FkZS1tYW5hZ2VyLmQudHM6MjUwYC5cbiAgICAgKlxuICAgICAqIFBhcmFtZXRlcnM6XG4gICAgICogICBzdGF0ZSDigJQgdHJ1ZSB0byBzdGFydCBQSUUsIGZhbHNlIHRvIHN0b3AgYW5kIHJldHVybiB0byBzY2VuZSBtb2RlLlxuICAgICAqXG4gICAgICogKip2Mi44LjIgcmV0ZXN0IGZpbmRpbmcqKjogdjIuOC4wIGRpc3BhdGNoZWQgYWdhaW5zdCBgY2NlLlNjZW5lRmFjYWRlYFxuICAgICAqIChtYXRjaGluZyB0aGUgdHlwZS1kb2MgbmFtZSkgYnV0IGxpdmUgY29jb3MgZWRpdG9yIDMuOC54IGV4cG9zZXMgdGhlXG4gICAgICogcnVudGltZSBzaW5nbGV0b24gYXQgYGNjZS5TY2VuZUZhY2FkZU1hbmFnZXJgIChhbmQgLyBvclxuICAgICAqIGAuU2NlbmVGYWNhZGVNYW5hZ2VyLmluc3RhbmNlYCksIHNhbWUgY29udmVudGlvbiBhcyB0aGUgcHJlZmFiIHBhdGhcbiAgICAgKiB1c2VzIChzZWUgYGdldFByZWZhYkZhY2FkZWAgYWJvdmUpLiBQcm9iaW5nIGFsbCB0aHJlZSBjYW5kaWRhdGVzXG4gICAgICoga2VlcHMgdGhlIGNvZGUgcmVzaWxpZW50IGFjcm9zcyBjb2NvcyBidWlsZHMgd2hlcmUgdGhlIG5hbWVzcGFjZVxuICAgICAqIHNoYXBlIGRpZmZlcnMuXG4gICAgICpcbiAgICAgKiBUaGUgSEFORE9GRiBvcmlnaW5hbGx5IG5vdGVkIGBzY2VuZS9lZGl0b3ItcHJldmlldy1zZXQtcGxheWAgYXMgYW5cbiAgICAgKiB1bmRvY3VtZW50ZWQgRWRpdG9yLk1lc3NhZ2UgY2hhbm5lbDsgd2UgdXNlIHRoZSB0eXBlZCBmYWNhZGUgbWV0aG9kXG4gICAgICogaW5zdGVhZCBzbyB0aGUgY2FsbCBwYXRoIGlzIHR5cGUtY2hlY2tlZCBhZ2FpbnN0IGNyZWF0b3ItdHlwZXMgYW5kXG4gICAgICogbm90IHN1YmplY3QgdG8gc2lsZW50IHJlbW92YWwgYmV0d2VlbiBjb2NvcyB2ZXJzaW9ucy5cbiAgICAgKlxuICAgICAqIFJldHVybnMgdGhlIHN0YW5kYXJkIHNjZW5lLXNjcmlwdCBlbnZlbG9wZS4gUmVmZXJlbmNlcyB0aGVcbiAgICAgKiB0b3AtbGV2ZWwgYGNjZWAgZGVjbGFyYXRpb24gKG1hdGNoaW5nIHRoZSBwcmVmYWIgcGF0dGVybikgcmF0aGVyXG4gICAgICogdGhhbiByZWFjaGluZyB0aHJvdWdoIGBnbG9iYWxUaGlzYCBzbyB0aGUgcmVzb2x1dGlvbiBzZW1hbnRpY3NcbiAgICAgKiBtYXRjaCBvdGhlciBzY2VuZS1zY3JpcHQgbWV0aG9kcyBpbiB0aGlzIGZpbGUuXG4gICAgICovXG4gICAgYXN5bmMgY2hhbmdlUHJldmlld1BsYXlTdGF0ZShzdGF0ZTogYm9vbGVhbikge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBjY2UgPT09ICd1bmRlZmluZWQnIHx8IGNjZSA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICBlcnJvcjogJ2NjZSBnbG9iYWwgaXMgbm90IGF2YWlsYWJsZTsgdGhpcyBtZXRob2QgbXVzdCBydW4gaW4gYSBzY2VuZS1zY3JpcHQgY29udGV4dC4nLFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyB2Mi44LjI6IHByb2JlIHRoZSB0aHJlZSBjYW5kaWRhdGUgbG9jYXRpb25zIHRoZSBTY2VuZUZhY2FkZVxuICAgICAgICAgICAgLy8gc2luZ2xldG9uIGhhcyBiZWVuIG9ic2VydmVkIGF0IGFjcm9zcyBjb2NvcyBidWlsZHMuIFNhbWVcbiAgICAgICAgICAgIC8vIGNvbnZlbnRpb24gYXMgZ2V0UHJlZmFiRmFjYWRlLlxuICAgICAgICAgICAgY29uc3QgY2FuZGlkYXRlczogYW55W10gPSBbXG4gICAgICAgICAgICAgICAgKGNjZSBhcyBhbnkpLlNjZW5lRmFjYWRlLFxuICAgICAgICAgICAgICAgIChjY2UgYXMgYW55KS5TY2VuZUZhY2FkZU1hbmFnZXI/Lmluc3RhbmNlLFxuICAgICAgICAgICAgICAgIChjY2UgYXMgYW55KS5TY2VuZUZhY2FkZU1hbmFnZXIsXG4gICAgICAgICAgICBdO1xuICAgICAgICAgICAgY29uc3QgZmFjYWRlID0gY2FuZGlkYXRlcy5maW5kKFxuICAgICAgICAgICAgICAgIGMgPT4gYyAmJiB0eXBlb2YgYy5jaGFuZ2VQcmV2aWV3UGxheVN0YXRlID09PSAnZnVuY3Rpb24nLFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGlmICghZmFjYWRlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIGVycm9yOiAnTm8gU2NlbmVGYWNhZGUgd2l0aCBjaGFuZ2VQcmV2aWV3UGxheVN0YXRlIGZvdW5kIG9uIGNjZSAoY2NlLlNjZW5lRmFjYWRlIC8gY2NlLlNjZW5lRmFjYWRlTWFuYWdlciAvIC5pbnN0YW5jZSkuIENvY29zIHZlcnNpb24gbWF5IG5vdCBzdXBwb3J0IFBJRSBjb250cm9sIHZpYSB0aGlzIGZhY2FkZSDigJQgdXNlIHRoZSB0b29sYmFyIHBsYXkgYnV0dG9uIG1hbnVhbGx5LicsXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGF3YWl0IGZhY2FkZS5jaGFuZ2VQcmV2aWV3UGxheVN0YXRlKEJvb2xlYW4oc3RhdGUpKTtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7IHJlcXVlc3RlZFN0YXRlOiBCb29sZWFuKHN0YXRlKSB9LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvcj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyb3IpIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG59O1xuIl19