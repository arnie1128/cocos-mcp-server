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
                    return Object.assign(Object.assign({}, (0, response_1.fail)(`runWithCapture: method ${methodName} not found`)), { capturedLogs: slot.entries });
                }
                try {
                    const result = await fn(...(methodArgs !== null && methodArgs !== void 0 ? methodArgs : []));
                    if (result && typeof result === 'object' && !Array.isArray(result)) {
                        return Object.assign(Object.assign({}, result), { capturedLogs: (_a = result.capturedLogs) !== null && _a !== void 0 ? _a : slot.entries });
                    }
                    return Object.assign(Object.assign({}, (0, response_1.ok)(result)), { capturedLogs: slot.entries });
                }
                catch (err) {
                    return Object.assign(Object.assign({}, (0, response_1.fail)((_b = err === null || err === void 0 ? void 0 : err.message) !== null && _b !== void 0 ? _b : String(err))), { capturedLogs: slot.entries });
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
                return (0, response_1.fail)(ctx.error);
            }
            const targetNode = findNodeByUuidDeep(ctx.scene, targetUuid);
            if (!targetNode) {
                return (0, response_1.fail)(`Target node with UUID ${targetUuid} not found`);
            }
            const arr = ctx.component[eventArrayProperty];
            if (!Array.isArray(arr)) {
                return (0, response_1.fail)(`Property '${eventArrayProperty}' on ${componentType} is not an array (got ${typeof arr})`);
            }
            const eh = new cc.EventHandler();
            eh.target = targetNode;
            eh.component = componentName;
            eh.handler = handler;
            eh.customEventData = customEventData !== null && customEventData !== void 0 ? customEventData : '';
            arr.push(eh);
            Editor.Message.send('scene', 'snapshot');
            return (0, response_1.ok)({
                index: arr.length - 1,
                count: arr.length,
                componentUuid: ctx.component.uuid,
                componentEnabled: ctx.component.enabled !== false,
            });
        }
        catch (error) {
            return (0, response_1.fail)((_a = error === null || error === void 0 ? void 0 : error.message) !== null && _a !== void 0 ? _a : String(error));
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
                return (0, response_1.fail)(ctx.error);
            }
            const arr = ctx.component[eventArrayProperty];
            if (!Array.isArray(arr)) {
                return (0, response_1.fail)(`Property '${eventArrayProperty}' on ${componentType} is not an array`);
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
                return (0, response_1.fail)('No matching event handler to remove');
            }
            const removed = arr.splice(removeAt, 1)[0];
            Editor.Message.send('scene', 'snapshot');
            return (0, response_1.ok)({
                index: removeAt,
                remaining: arr.length,
                removed: serializeEventHandler(removed),
                componentUuid: ctx.component.uuid,
                componentEnabled: ctx.component.enabled !== false,
            });
        }
        catch (error) {
            return (0, response_1.fail)((_a = error === null || error === void 0 ? void 0 : error.message) !== null && _a !== void 0 ? _a : String(error));
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
                return (0, response_1.fail)(ctx.error);
            }
            const arr = ctx.component[eventArrayProperty];
            if (!Array.isArray(arr)) {
                return (0, response_1.fail)(`Property '${eventArrayProperty}' on ${componentType} is not an array`);
            }
            return (0, response_1.ok)({
                count: arr.length,
                handlers: arr.map(serializeEventHandler),
            });
        }
        catch (error) {
            return (0, response_1.fail)((_a = error === null || error === void 0 ? void 0 : error.message) !== null && _a !== void 0 ? _a : String(error));
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
                return (0, response_1.fail)('No active scene');
            const node = findNodeByUuidDeep(scene, nodeUuid);
            if (!node)
                return (0, response_1.fail)(`Node ${nodeUuid} not found`);
            const anim = node.getComponent('cc.Animation');
            if (!anim) {
                return (0, response_1.fail)(`Node ${nodeUuid} has no cc.Animation component`);
            }
            const clips = (_a = anim.clips) !== null && _a !== void 0 ? _a : [];
            const defaultClipName = (_c = (_b = anim.defaultClip) === null || _b === void 0 ? void 0 : _b.name) !== null && _c !== void 0 ? _c : null;
            return (0, response_1.ok)({
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
            });
        }
        catch (error) {
            return (0, response_1.fail)((_d = error === null || error === void 0 ? void 0 : error.message) !== null && _d !== void 0 ? _d : String(error));
        }
    },
    listAnimationStates(nodeUuid) {
        var _a, _b;
        try {
            const { director } = require('cc');
            const scene = director.getScene();
            if (!scene)
                return (0, response_1.fail)('No active scene');
            const node = findNodeByUuidDeep(scene, nodeUuid);
            if (!node)
                return (0, response_1.fail)(`Node ${nodeUuid} not found`);
            const anim = node.getComponent('cc.Animation');
            if (!anim) {
                return (0, response_1.fail)(`Node ${nodeUuid} has no cc.Animation component`);
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
            return (0, response_1.ok)(states);
        }
        catch (error) {
            return (0, response_1.fail)((_b = error === null || error === void 0 ? void 0 : error.message) !== null && _b !== void 0 ? _b : String(error));
        }
    },
    getAnimationStateInfo(nodeUuid, stateName) {
        var _a;
        try {
            const { director } = require('cc');
            const scene = director.getScene();
            if (!scene)
                return (0, response_1.fail)('No active scene');
            const node = findNodeByUuidDeep(scene, nodeUuid);
            if (!node)
                return (0, response_1.fail)(`Node ${nodeUuid} not found`);
            const anim = node.getComponent('cc.Animation');
            if (!anim) {
                return (0, response_1.fail)(`Node ${nodeUuid} has no cc.Animation component`);
            }
            const state = anim.getState(stateName);
            if (!state) {
                return (0, response_1.fail)(`Animation state '${stateName}' not found`);
            }
            return (0, response_1.ok)({
                speed: typeof state.speed === 'number' ? state.speed : null,
                isPlaying: state.isPlaying === true,
                currentTime: typeof state.currentTime === 'number' ? state.currentTime : null,
                totalTime: typeof state.totalTime === 'number' ? state.totalTime : null,
            });
        }
        catch (error) {
            return (0, response_1.fail)((_a = error === null || error === void 0 ? void 0 : error.message) !== null && _a !== void 0 ? _a : String(error));
        }
    },
    setAnimationSpeed(nodeUuid, stateName, speed) {
        var _a;
        try {
            const { director } = require('cc');
            const scene = director.getScene();
            if (!scene)
                return (0, response_1.fail)('No active scene');
            const node = findNodeByUuidDeep(scene, nodeUuid);
            if (!node)
                return (0, response_1.fail)(`Node ${nodeUuid} not found`);
            const anim = node.getComponent('cc.Animation');
            if (!anim) {
                return (0, response_1.fail)(`Node ${nodeUuid} has no cc.Animation component`);
            }
            const state = anim.getState(stateName);
            if (!state) {
                return (0, response_1.fail)(`Animation state '${stateName}' not found`);
            }
            state.speed = speed;
            return (0, response_1.ok)({
                speed: state.speed,
                isPlaying: state.isPlaying === true,
                currentTime: typeof state.currentTime === 'number' ? state.currentTime : null,
                totalTime: typeof state.totalTime === 'number' ? state.totalTime : null,
            });
        }
        catch (error) {
            return (0, response_1.fail)((_a = error === null || error === void 0 ? void 0 : error.message) !== null && _a !== void 0 ? _a : String(error));
        }
    },
    checkAnimationFinished(nodeUuid, stateName) {
        var _a;
        try {
            const { director } = require('cc');
            const scene = director.getScene();
            if (!scene)
                return (0, response_1.fail)('No active scene');
            const node = findNodeByUuidDeep(scene, nodeUuid);
            if (!node)
                return (0, response_1.fail)(`Node ${nodeUuid} not found`);
            const anim = node.getComponent('cc.Animation');
            if (!anim) {
                return (0, response_1.fail)(`Node ${nodeUuid} has no cc.Animation component`);
            }
            const state = anim.getState(stateName);
            if (!state) {
                return (0, response_1.fail)(`Animation state '${stateName}' not found`);
            }
            const currentTime = typeof state.currentTime === 'number' ? state.currentTime : 0;
            const totalTime = typeof state.totalTime === 'number' ? state.totalTime : 0;
            return (0, response_1.ok)({ finished: currentTime >= totalTime });
        }
        catch (error) {
            return (0, response_1.fail)((_a = error === null || error === void 0 ? void 0 : error.message) !== null && _a !== void 0 ? _a : String(error));
        }
    },
    playAnimation(nodeUuid, clipName) {
        var _a, _b, _c, _d, _e, _f, _g;
        try {
            const { director } = require('cc');
            const scene = director.getScene();
            if (!scene)
                return (0, response_1.fail)('No active scene');
            const node = findNodeByUuidDeep(scene, nodeUuid);
            if (!node)
                return (0, response_1.fail)(`Node ${nodeUuid} not found`);
            const anim = node.getComponent('cc.Animation');
            if (!anim) {
                return (0, response_1.fail)(`Node ${nodeUuid} has no cc.Animation component`);
            }
            if (clipName) {
                // Validate clip exists before calling play() — cc.Animation.play
                // silently does nothing on unknown names which would mask
                // typos in AI-generated calls.
                const known = ((_a = anim.clips) !== null && _a !== void 0 ? _a : []).some((c) => (c === null || c === void 0 ? void 0 : c.name) === clipName);
                if (!known && (((_b = anim.defaultClip) === null || _b === void 0 ? void 0 : _b.name) !== clipName)) {
                    return (0, response_1.fail)(`Clip '${clipName}' is not registered on this Animation. Known: ${((_c = anim.clips) !== null && _c !== void 0 ? _c : []).map((c) => c === null || c === void 0 ? void 0 : c.name).filter(Boolean).join(', ') || '(none)'}.`);
                }
                anim.play(clipName);
            }
            else {
                if (!anim.defaultClip) {
                    return (0, response_1.fail)('No clipName given and no defaultClip configured');
                }
                anim.play();
            }
            return (0, response_1.ok)({ nodeUuid, clipName: (_e = clipName !== null && clipName !== void 0 ? clipName : (_d = anim.defaultClip) === null || _d === void 0 ? void 0 : _d.name) !== null && _e !== void 0 ? _e : null }, `Playing '${clipName !== null && clipName !== void 0 ? clipName : (_f = anim.defaultClip) === null || _f === void 0 ? void 0 : _f.name}' on ${node.name}`);
        }
        catch (error) {
            return (0, response_1.fail)((_g = error === null || error === void 0 ? void 0 : error.message) !== null && _g !== void 0 ? _g : String(error));
        }
    },
    stopAnimation(nodeUuid) {
        var _a;
        try {
            const { director } = require('cc');
            const scene = director.getScene();
            if (!scene)
                return (0, response_1.fail)('No active scene');
            const node = findNodeByUuidDeep(scene, nodeUuid);
            if (!node)
                return (0, response_1.fail)(`Node ${nodeUuid} not found`);
            const anim = node.getComponent('cc.Animation');
            if (!anim) {
                return (0, response_1.fail)(`Node ${nodeUuid} has no cc.Animation component`);
            }
            anim.stop();
            return (0, response_1.ok)(undefined, `Stopped animation on ${node.name}`);
        }
        catch (error) {
            return (0, response_1.fail)((_a = error === null || error === void 0 ? void 0 : error.message) !== null && _a !== void 0 ? _a : String(error));
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
                return (0, response_1.fail)('No active scene');
            const node = findNodeByUuidDeep(scene, nodeUuid);
            if (!node)
                return (0, response_1.fail)(`Node ${nodeUuid} not found`);
            // v2.4.9 review fix (claude + codex 🟡): use indexOf on the
            // resolved anim instance directly. The previous metadata-string
            // lookup (constructor.name / __classname__ / _cid) was fragile
            // against custom subclasses (cc.SkeletalAnimation, user-derived
            // cc.Animation). getComponent('cc.Animation') resolves subclasses
            // correctly; matching by reference is the canonical way to find
            // the same instance's slot in __comps__.
            const anim = node.getComponent('cc.Animation');
            if (!anim) {
                return (0, response_1.fail)(`Node ${nodeUuid} has no cc.Animation component`);
            }
            const components = ((_b = (_a = node._components) !== null && _a !== void 0 ? _a : node.components) !== null && _b !== void 0 ? _b : []);
            const compIndex = components.indexOf(anim);
            if (compIndex === -1) {
                return (0, response_1.fail)(`Node ${nodeUuid} cc.Animation component not found in __comps__ array (cocos editor inconsistency).`);
            }
            let clipUuid = null;
            if (clipName !== null && clipName !== undefined) {
                const clip = ((_c = anim.clips) !== null && _c !== void 0 ? _c : []).find((c) => (c === null || c === void 0 ? void 0 : c.name) === clipName);
                if (!clip) {
                    return (0, response_1.fail)(`Clip '${clipName}' is not registered on this Animation. Known: ${((_d = anim.clips) !== null && _d !== void 0 ? _d : []).map((c) => c === null || c === void 0 ? void 0 : c.name).filter(Boolean).join(', ') || '(none)'}.`);
                }
                clipUuid = (_f = (_e = clip._uuid) !== null && _e !== void 0 ? _e : clip.uuid) !== null && _f !== void 0 ? _f : null;
                if (!clipUuid) {
                    return (0, response_1.fail)(`Clip '${clipName}' has no asset uuid; cannot persist as defaultClip.`);
                }
            }
            return (0, response_1.ok)({
                componentIndex: compIndex,
                clipUuid,
                currentDefaultClip: (_h = (_g = anim.defaultClip) === null || _g === void 0 ? void 0 : _g.name) !== null && _h !== void 0 ? _h : null,
                currentPlayOnLoad: anim.playOnLoad === true,
            });
        }
        catch (error) {
            return (0, response_1.fail)((_j = error === null || error === void 0 ? void 0 : error.message) !== null && _j !== void 0 ? _j : String(error));
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
                return (0, response_1.fail)('cce global is not available; this method must run in a scene-script context.');
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
                return (0, response_1.fail)('No SceneFacade with changePreviewPlayState found on cce (cce.SceneFacade / cce.SceneFacadeManager / .instance). Cocos version may not support PIE control via this facade — use the toolbar play button manually.');
            }
            await facade.changePreviewPlayState(Boolean(state));
            return (0, response_1.ok)({ requestedState: Boolean(state) });
        }
        catch (error) {
            return (0, response_1.fail)((_b = error === null || error === void 0 ? void 0 : error.message) !== null && _b !== void 0 ? _b : String(error));
        }
    },
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NlbmUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zb3VyY2Uvc2NlbmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsK0JBQTRCO0FBQzVCLDZDQUEwQztBQUMxQyxNQUFNLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFBLFdBQUksRUFBQyxNQUFNLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxjQUFjLENBQUMsQ0FBQyxDQUFDO0FBcUJ6RCxTQUFTLGVBQWU7O0lBQ3BCLElBQUksT0FBTyxHQUFHLEtBQUssV0FBVyxJQUFJLEdBQUcsS0FBSyxJQUFJLEVBQUUsQ0FBQztRQUM3QyxPQUFPLEVBQUUsRUFBRSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsNkVBQTZFLEVBQUUsQ0FBQztJQUMvRyxDQUFDO0lBQ0QsTUFBTSxVQUFVLEdBQW9DO1FBQ2hELEdBQUcsQ0FBQyxNQUFNO1FBQ1YsTUFBQSxHQUFHLENBQUMsa0JBQWtCLDBDQUFFLFFBQVE7UUFDaEMsR0FBRyxDQUFDLGtCQUE4QztLQUNyRCxDQUFDO0lBQ0YsZ0VBQWdFO0lBQ2hFLCtEQUErRDtJQUMvRCxNQUFNLFFBQVEsR0FBOEIsQ0FBQyxjQUFjLEVBQUUsYUFBYSxFQUFFLFlBQVksRUFBRSxjQUFjLEVBQUUsZUFBZSxDQUFDLENBQUM7SUFDM0gsS0FBSyxNQUFNLFNBQVMsSUFBSSxVQUFVLEVBQUUsQ0FBQztRQUNqQyxJQUFJLFNBQVMsSUFBSSxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsT0FBUSxTQUFpQixDQUFDLENBQUMsQ0FBQyxLQUFLLFVBQVUsQ0FBQyxFQUFFLENBQUM7WUFDaEYsT0FBTyxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRSxDQUFDO1FBQzFDLENBQUM7SUFDTCxDQUFDO0lBQ0QsT0FBTztRQUNILEVBQUUsRUFBRSxLQUFLO1FBQ1QsS0FBSyxFQUFFLHlLQUF5SztLQUNuTCxD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LENBQUMsTUFBTSxFQUFFLENBQUM7Z0JBQ1YsT0FBTyxJQUFBLGVBQUksRUFBQyxtTkFBbU4sQ0FBQyxDQUFDO1lBQ3JPLENBQUM7WUFDRCxNQUFNLE1BQU0sQ0FBQyxzQkFBc0IsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztZQUNwRCxPQUFPLElBQUEsYUFBRSxFQUFDLEVBQUUsY0FBYyxFQUFFLE9BQU8sQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDbEQsQ0FBQztRQUFDLE9BQU8sS0FBVSxFQUFFLENBQUM7WUFDbEIsT0FBTyxJQUFBLGVBQUksRUFBQyxNQUFBLEtBQUssYUFBTCxLQUFLLHVCQUFMLEtBQUssQ0FBRSxPQUFPLG1DQUFJLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBQ2pELENBQUM7SUFDTCxDQUFDO0NBRUosQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGpvaW4gfSBmcm9tICdwYXRoJztcbmltcG9ydCB7IG9rLCBmYWlsIH0gZnJvbSAnLi9saWIvcmVzcG9uc2UnO1xubW9kdWxlLnBhdGhzLnB1c2goam9pbihFZGl0b3IuQXBwLnBhdGgsICdub2RlX21vZHVsZXMnKSk7XG5cbi8vIGBjY2VgIGlzIGluamVjdGVkIGJ5IENvY29zIEVkaXRvciBpbnRvIHRoZSBzY2VuZS1zY3JpcHQgZ2xvYmFsIHNjb3BlLlxuLy8gSXQgaXMgbm90IGRlY2xhcmVkIGluIGBAY29jb3MvY3JlYXRvci10eXBlc2AgZXhwb3J0czsgZGVjbGFyZSBhIG1pbmltYWxcbi8vIHJ1bnRpbWUgc2hhcGUganVzdCBmb3Igd2hhdCB3ZSB0b3VjaCBoZXJlIHNvIFR5cGVTY3JpcHQgc3RheXMgc3RyaWN0LlxuZGVjbGFyZSBjb25zdCBjY2U6IHVuZGVmaW5lZCB8IHtcbiAgICBQcmVmYWI/OiBQcmVmYWJGYWNhZGU7XG4gICAgU2NlbmVGYWNhZGVNYW5hZ2VyPzogeyBpbnN0YW5jZT86IFByZWZhYkZhY2FkZSB9ICYgUHJlZmFiRmFjYWRlO1xufTtcblxuaW50ZXJmYWNlIFByZWZhYkZhY2FkZSB7XG4gICAgY3JlYXRlUHJlZmFiKG5vZGVVdWlkOiBzdHJpbmcsIHVybDogc3RyaW5nKTogUHJvbWlzZTxhbnk+O1xuICAgIGFwcGx5UHJlZmFiKG5vZGVVdWlkOiBzdHJpbmcpOiBQcm9taXNlPGFueT47XG4gICAgbGlua1ByZWZhYihub2RlVXVpZDogc3RyaW5nLCBhc3NldFV1aWQ6IHN0cmluZyk6IGFueTtcbiAgICB1bmxpbmtQcmVmYWIobm9kZVV1aWQ6IHN0cmluZywgcmVtb3ZlTmVzdGVkOiBib29sZWFuKTogYW55O1xuICAgIGdldFByZWZhYkRhdGEobm9kZVV1aWQ6IHN0cmluZyk6IGFueTtcbiAgICByZXN0b3JlUHJlZmFiPyh1dWlkOiBzdHJpbmcsIGFzc2V0VXVpZDogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPjtcbn1cblxudHlwZSBGYWNhZGVMb29rdXAgPSB7IG9rOiB0cnVlOyB2YWx1ZTogUHJlZmFiRmFjYWRlIH0gfCB7IG9rOiBmYWxzZTsgZXJyb3I6IHN0cmluZyB9O1xuXG5mdW5jdGlvbiBnZXRQcmVmYWJGYWNhZGUoKTogRmFjYWRlTG9va3VwIHtcbiAgICBpZiAodHlwZW9mIGNjZSA9PT0gJ3VuZGVmaW5lZCcgfHwgY2NlID09PSBudWxsKSB7XG4gICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6ICdjY2UgZ2xvYmFsIGlzIG5vdCBhdmFpbGFibGU7IHRoaXMgbWV0aG9kIG11c3QgcnVuIGluIGEgc2NlbmUtc2NyaXB0IGNvbnRleHQnIH07XG4gICAgfVxuICAgIGNvbnN0IGNhbmRpZGF0ZXM6IEFycmF5PFByZWZhYkZhY2FkZSB8IHVuZGVmaW5lZD4gPSBbXG4gICAgICAgIGNjZS5QcmVmYWIsXG4gICAgICAgIGNjZS5TY2VuZUZhY2FkZU1hbmFnZXI/Lmluc3RhbmNlLFxuICAgICAgICBjY2UuU2NlbmVGYWNhZGVNYW5hZ2VyIGFzIFByZWZhYkZhY2FkZSB8IHVuZGVmaW5lZCxcbiAgICBdO1xuICAgIC8vIEVuc3VyZSB0aGUgY2FuZGlkYXRlIGV4cG9zZXMgZXZlcnkgZmFjYWRlIG1ldGhvZCB3ZSBtYXkgY2FsbDtcbiAgICAvLyBhIHBhcnRpYWwgY2FuZGlkYXRlIHdvdWxkIGNyYXNoIGF0IHRoZSBmaXJzdCBtaXNzaW5nIG1ldGhvZC5cbiAgICBjb25zdCByZXF1aXJlZDogQXJyYXk8a2V5b2YgUHJlZmFiRmFjYWRlPiA9IFsnY3JlYXRlUHJlZmFiJywgJ2FwcGx5UHJlZmFiJywgJ2xpbmtQcmVmYWInLCAndW5saW5rUHJlZmFiJywgJ2dldFByZWZhYkRhdGEnXTtcbiAgICBmb3IgKGNvbnN0IGNhbmRpZGF0ZSBvZiBjYW5kaWRhdGVzKSB7XG4gICAgICAgIGlmIChjYW5kaWRhdGUgJiYgcmVxdWlyZWQuZXZlcnkobSA9PiB0eXBlb2YgKGNhbmRpZGF0ZSBhcyBhbnkpW21dID09PSAnZnVuY3Rpb24nKSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUsIHZhbHVlOiBjYW5kaWRhdGUgfTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4ge1xuICAgICAgICBvazogZmFsc2UsXG4gICAgICAgIGVycm9yOiAnTm8gY29tcGxldGUgcHJlZmFiIGZhY2FkZSBmb3VuZCBvbiBjY2UgKGNjZS5QcmVmYWIgLyBjY2UuU2NlbmVGYWNhZGVNYW5hZ2VyKS4gQ29jb3MgZWRpdG9yIGJ1aWxkIG1heSBub3QgZXhwb3NlIHRoZSBleHBlY3RlZCBtYW5hZ2VyIG9yIG9ubHkgZXhwb3NlcyBhIHBhcnRpYWwgc3VyZmFjZS4nLFxuICAgIH07XG59XG5cbnR5cGUgQ29tcG9uZW50TG9va3VwID1cbiAgICB8IHsgb2s6IHRydWU7IHNjZW5lOiBhbnk7IG5vZGU6IGFueTsgY29tcG9uZW50OiBhbnkgfVxuICAgIHwgeyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmcgfTtcblxuZnVuY3Rpb24gZmluZE5vZGVCeVV1aWREZWVwKHJvb3Q6IGFueSwgdXVpZDogc3RyaW5nKTogYW55IHtcbiAgICBpZiAoIXJvb3QpIHJldHVybiBudWxsO1xuICAgIGlmIChyb290Ll9pZCA9PT0gdXVpZCB8fCByb290LnV1aWQgPT09IHV1aWQpIHJldHVybiByb290O1xuICAgIGNvbnN0IGNoaWxkcmVuID0gcm9vdC5jaGlsZHJlbiA/PyByb290Ll9jaGlsZHJlbiA/PyBbXTtcbiAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIGNoaWxkcmVuKSB7XG4gICAgICAgIGNvbnN0IGhpdCA9IGZpbmROb2RlQnlVdWlkRGVlcChjaGlsZCwgdXVpZCk7XG4gICAgICAgIGlmIChoaXQpIHJldHVybiBoaXQ7XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiByZXNvbHZlQ29tcG9uZW50Q29udGV4dChub2RlVXVpZDogc3RyaW5nLCBjb21wb25lbnRUeXBlOiBzdHJpbmcpOiBDb21wb25lbnRMb29rdXAge1xuICAgIGNvbnN0IHsgZGlyZWN0b3IsIGpzIH0gPSByZXF1aXJlKCdjYycpO1xuICAgIGNvbnN0IHNjZW5lID0gZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICBpZiAoIXNjZW5lKSB7XG4gICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6ICdObyBhY3RpdmUgc2NlbmUnIH07XG4gICAgfVxuICAgIC8vIHNjZW5lLmdldENoaWxkQnlVdWlkIG9ubHkgd2Fsa3MgZGlyZWN0IGNoaWxkcmVuOyB1c2UgZGVwdGgtZmlyc3Qgc2VhcmNoLlxuICAgIGNvbnN0IG5vZGUgPSBmaW5kTm9kZUJ5VXVpZERlZXAoc2NlbmUsIG5vZGVVdWlkKTtcbiAgICBpZiAoIW5vZGUpIHtcbiAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogYE5vZGUgd2l0aCBVVUlEICR7bm9kZVV1aWR9IG5vdCBmb3VuZGAgfTtcbiAgICB9XG4gICAgY29uc3QgQ29tcG9uZW50Q2xhc3MgPSBqcy5nZXRDbGFzc0J5TmFtZShjb21wb25lbnRUeXBlKTtcbiAgICBpZiAoIUNvbXBvbmVudENsYXNzKSB7XG4gICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGBDb21wb25lbnQgdHlwZSAke2NvbXBvbmVudFR5cGV9IG5vdCBmb3VuZGAgfTtcbiAgICB9XG4gICAgY29uc3QgY29tcG9uZW50ID0gbm9kZS5nZXRDb21wb25lbnQoQ29tcG9uZW50Q2xhc3MpO1xuICAgIGlmICghY29tcG9uZW50KSB7XG4gICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGBDb21wb25lbnQgJHtjb21wb25lbnRUeXBlfSBub3QgZm91bmQgb24gbm9kZWAgfTtcbiAgICB9XG4gICAgcmV0dXJuIHsgb2s6IHRydWUsIHNjZW5lLCBub2RlLCBjb21wb25lbnQgfTtcbn1cblxuZnVuY3Rpb24gc2VyaWFsaXplRXZlbnRIYW5kbGVyKGVoOiBhbnkpIHtcbiAgICBpZiAoIWVoKSByZXR1cm4gbnVsbDtcbiAgICByZXR1cm4ge1xuICAgICAgICB0YXJnZXRVdWlkOiBlaC50YXJnZXQ/LnV1aWQgPz8gbnVsbCxcbiAgICAgICAgdGFyZ2V0TmFtZTogZWgudGFyZ2V0Py5uYW1lID8/IG51bGwsXG4gICAgICAgIGNvbXBvbmVudDogZWguY29tcG9uZW50ID8/IGVoLl9jb21wb25lbnROYW1lID8/IG51bGwsXG4gICAgICAgIGhhbmRsZXI6IGVoLmhhbmRsZXIgPz8gbnVsbCxcbiAgICAgICAgY3VzdG9tRXZlbnREYXRhOiBlaC5jdXN0b21FdmVudERhdGEgPz8gJycsXG4gICAgfTtcbn1cblxuLy8gdjIuNC44IEEzICsgdjIuNC45ICsgdjIuNC4xMCByZXZpZXcgZml4OiBzY2VuZS1zaWRlIGxvZyBjYXB0dXJlXG4vLyAoUm9tYVJvZ292IHBhdHRlcm4gYWRhcHRlZCkuXG4vL1xuLy8gQ29uY3VycmVuY3kgbW9kZWwg4oCUIHYyLjQuMTAgKGNsYXVkZSArIGNvZGV4IPCflLQgcm91bmQtMik6XG4vLyAgIHYyLjQuOCBmYW5uZWQgZXZlcnkgY29uc29sZS5sb2cgdG8gQUxMIGFjdGl2ZSBjYXB0dXJlIGFycmF5cy5cbi8vICAgdjIuNC45IGF0dGVtcHRlZCB0byBpc29sYXRlIHZpYSBfdG9wU2xvdCgpIChjdXJyZW50IHRvcCBvZiBzdGFjaylcbi8vICAgYnV0IHRoYXQgb25seSB3b3JrZWQgZm9yIHN0cmljdGx5IExJRk8tbmVzdGVkIGNhbGxzOyB0d28gY2FsbHNcbi8vICAgdGhhdCBpbnRlcmxlYXZlIHZpYSBgYXdhaXRgIGNvdWxkIHN0aWxsIG1pc2F0dHJpYnV0ZSAoY2FsbCBBXG4vLyAgIGF3YWl0cywgQiBwdXNoZXMgaXRzIHNsb3QsIEEncyBwb3N0LWF3YWl0IGxvZ3Mgd291bGQgcm91dGUgdG8gQikuXG4vLyAgIHYyLjQuMTAgdXNlcyBOb2RlJ3MgYnVpbHQtaW4gYEFzeW5jTG9jYWxTdG9yYWdlYCBzbyBlYWNoIGNhbGwnc1xuLy8gICBsb2dpY2FsIGFzeW5jIGNoYWluIGtlZXBzIGl0cyBPV04gc2xvdCByZWdhcmRsZXNzIG9mIHN0YWNrIG9yZGVyLlxuLy8gICBXaGVuIGNvbnNvbGUubG9nIGZpcmVzLCB0aGUgaG9vayByZWFkcyBBTFMuZ2V0U3RvcmUoKSDigJQgd2hpY2ggaXNcbi8vICAgYm91bmQgdG8gdGhlIG9yaWdpbmF0aW5nIGNhbGwncyBhc3luYyBjb250ZXh0IOKAlCBhbmQgd3JpdGVzIHRoZXJlLlxuLy9cbi8vIEJvdW5kIOKAlCB2Mi40LjkgKGNsYXVkZSArIGNvZGV4IPCfn6EpOlxuLy8gICBDYXAgZW50cmllcyBwZXIgY2FwdHVyZSAoZGVmYXVsdCA1MDApIGFuZCB0b3RhbCBieXRlcyAoZGVmYXVsdFxuLy8gICA2NCBLQikuIEV4Y2VzcyBlbnRyaWVzIGFyZSBkcm9wcGVkOyBhIHNpbmdsZSBgW2NhcHR1cmUgdHJ1bmNhdGVkXWBcbi8vICAgbWFya2VyIGlzIGFwcGVuZGVkIG9uY2UuIHYyLjQuMTA6IG1hcmtlciBieXRlcyBjb3VudGVkIGFnYWluc3Rcbi8vICAgdGhlIGNhcCAoY29kZXggcm91bmQtMiDwn5+hKSBzbyB0aGUgc2xvdCdzIGJ5dGVzIGZpZWxkIHN0YXlzXG4vLyAgIG1vbm90b25pY2FsbHkgYWNjdXJhdGUuXG4vL1xuLy8gSG9vayBsaWZlY3ljbGU6XG4vLyAgIFRoZSBjb25zb2xlIGhvb2sgaXMgaW5zdGFsbGVkIG9uIGZpcnN0IGBydW5XaXRoQ2FwdHVyZWAgaW52b2NhdGlvblxuLy8gICBhbmQgdW5pbnN0YWxsZWQgd2hlbiBubyBzbG90IGlzIGFjdGl2ZS4gRWFjaCBpbnZvY2F0aW9uIGBhbHMucnVuKClgc1xuLy8gICB3aXRoIGl0cyBzbG90LCBzbyB0aGUgaG9vayBqdXN0IHJlYWRzIHRoZSBzdG9yZS4gV2Ugc3RpbGwga2VlcFxuLy8gICBgX2FjdGl2ZVNsb3RDb3VudGAgYXMgYSByZWZjb3VudCB0byBrbm93IHdoZW4gdG8gdW5ob29rIChBTFNcbi8vICAgZG9lc24ndCBleHBvc2Ugc3RvcmUgY291bnQgZGlyZWN0bHkpLlxuaW1wb3J0IHsgQXN5bmNMb2NhbFN0b3JhZ2UgfSBmcm9tICdhc3luY19ob29rcyc7XG5cbnR5cGUgQ2FwdHVyZWRFbnRyeSA9IHsgbGV2ZWw6ICdsb2cnIHwgJ3dhcm4nIHwgJ2Vycm9yJzsgbWVzc2FnZTogc3RyaW5nOyB0czogbnVtYmVyIH07XG50eXBlIENvbnNvbGVTbmFwc2hvdCA9IHsgbG9nOiB0eXBlb2YgY29uc29sZS5sb2c7IHdhcm46IHR5cGVvZiBjb25zb2xlLndhcm47IGVycm9yOiB0eXBlb2YgY29uc29sZS5lcnJvciB9O1xuXG5pbnRlcmZhY2UgQ2FwdHVyZVNsb3Qge1xuICAgIGVudHJpZXM6IENhcHR1cmVkRW50cnlbXTtcbiAgICBieXRlczogbnVtYmVyO1xuICAgIHRydW5jYXRlZDogYm9vbGVhbjtcbn1cblxuY29uc3QgQ0FQVFVSRV9NQVhfRU5UUklFUyA9IDUwMDtcbmNvbnN0IENBUFRVUkVfTUFYX0JZVEVTID0gNjQgKiAxMDI0O1xuY29uc3QgX2NhcHR1cmVBTFMgPSBuZXcgQXN5bmNMb2NhbFN0b3JhZ2U8Q2FwdHVyZVNsb3Q+KCk7XG5sZXQgX2FjdGl2ZVNsb3RDb3VudCA9IDA7XG5sZXQgX29yaWdDb25zb2xlOiBDb25zb2xlU25hcHNob3QgfCBudWxsID0gbnVsbDtcblxuZnVuY3Rpb24gX2Zvcm1hdEFyZ3MoYTogdW5rbm93bltdKTogc3RyaW5nIHtcbiAgICByZXR1cm4gYVxuICAgICAgICAubWFwKHggPT4ge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiB4ID09PSAnc3RyaW5nJykgcmV0dXJuIHg7XG4gICAgICAgICAgICB0cnkgeyByZXR1cm4gSlNPTi5zdHJpbmdpZnkoeCk7IH0gY2F0Y2ggeyByZXR1cm4gU3RyaW5nKHgpOyB9XG4gICAgICAgIH0pXG4gICAgICAgIC5qb2luKCcgJyk7XG59XG5cbmZ1bmN0aW9uIF9hcHBlbmRCb3VuZGVkKHNsb3Q6IENhcHR1cmVTbG90LCBlbnRyeTogQ2FwdHVyZWRFbnRyeSk6IHZvaWQge1xuICAgIGlmIChzbG90LnRydW5jYXRlZCkgcmV0dXJuO1xuICAgIGNvbnN0IGVudHJ5Qnl0ZXMgPSBlbnRyeS5tZXNzYWdlLmxlbmd0aCArIDMyOyAvLyB+bGV2ZWwgKyB0cyBvdmVyaGVhZFxuICAgIGlmIChzbG90LmVudHJpZXMubGVuZ3RoID49IENBUFRVUkVfTUFYX0VOVFJJRVMgfHwgc2xvdC5ieXRlcyArIGVudHJ5Qnl0ZXMgPiBDQVBUVVJFX01BWF9CWVRFUykge1xuICAgICAgICBzbG90LnRydW5jYXRlZCA9IHRydWU7XG4gICAgICAgIGNvbnN0IG1hcmtlcjogQ2FwdHVyZWRFbnRyeSA9IHsgbGV2ZWw6ICd3YXJuJywgbWVzc2FnZTogJ1tjYXB0dXJlIHRydW5jYXRlZCDigJQgZXhjZWVkZWQgZW50cnkvYnl0ZSBjYXBdJywgdHM6IERhdGUubm93KCkgfTtcbiAgICAgICAgc2xvdC5lbnRyaWVzLnB1c2gobWFya2VyKTtcbiAgICAgICAgLy8gdjIuNC4xMCBjb2RleCByb3VuZC0yIPCfn6E6IHRyYWNrIG1hcmtlciBieXRlcyB0b28gc28gY2FwIGFjY291bnRpbmdcbiAgICAgICAgLy8gc3RheXMgYWNjdXJhdGUgZXZlbiB0aG91Z2ggbm8gZnVydGhlciBhcHBlbmRzIHdpbGwgZm9sbG93LlxuICAgICAgICBzbG90LmJ5dGVzICs9IG1hcmtlci5tZXNzYWdlLmxlbmd0aCArIDMyO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIHNsb3QuZW50cmllcy5wdXNoKGVudHJ5KTtcbiAgICBzbG90LmJ5dGVzICs9IGVudHJ5Qnl0ZXM7XG59XG5cbmZ1bmN0aW9uIF9lbnN1cmVDb25zb2xlSG9vaygpOiB2b2lkIHtcbiAgICBpZiAoX29yaWdDb25zb2xlKSByZXR1cm47XG4gICAgX29yaWdDb25zb2xlID0geyBsb2c6IGNvbnNvbGUubG9nLCB3YXJuOiBjb25zb2xlLndhcm4sIGVycm9yOiBjb25zb2xlLmVycm9yIH07XG4gICAgY29uc3QgbWFrZSA9IChsZXZlbDogQ2FwdHVyZWRFbnRyeVsnbGV2ZWwnXSwgb3JpZzogKC4uLmE6IGFueVtdKSA9PiB2b2lkKSA9PlxuICAgICAgICAoLi4uYTogYW55W10pOiB2b2lkID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHNsb3QgPSBfY2FwdHVyZUFMUy5nZXRTdG9yZSgpO1xuICAgICAgICAgICAgaWYgKHNsb3QpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBtZXNzYWdlID0gX2Zvcm1hdEFyZ3MoYSk7XG4gICAgICAgICAgICAgICAgX2FwcGVuZEJvdW5kZWQoc2xvdCwgeyBsZXZlbCwgbWVzc2FnZSwgdHM6IERhdGUubm93KCkgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0cnkgeyBvcmlnLmFwcGx5KGNvbnNvbGUsIGEpOyB9IGNhdGNoIHsgLyogc3dhbGxvdyAqLyB9XG4gICAgICAgIH07XG4gICAgY29uc29sZS5sb2cgPSBtYWtlKCdsb2cnLCBfb3JpZ0NvbnNvbGUubG9nKTtcbiAgICBjb25zb2xlLndhcm4gPSBtYWtlKCd3YXJuJywgX29yaWdDb25zb2xlLndhcm4pO1xuICAgIGNvbnNvbGUuZXJyb3IgPSBtYWtlKCdlcnJvcicsIF9vcmlnQ29uc29sZS5lcnJvcik7XG59XG5cbmZ1bmN0aW9uIF9tYXliZVVuaG9va0NvbnNvbGUoKTogdm9pZCB7XG4gICAgaWYgKF9hY3RpdmVTbG90Q291bnQgPiAwIHx8ICFfb3JpZ0NvbnNvbGUpIHJldHVybjtcbiAgICBjb25zb2xlLmxvZyA9IF9vcmlnQ29uc29sZS5sb2c7XG4gICAgY29uc29sZS53YXJuID0gX29yaWdDb25zb2xlLndhcm47XG4gICAgY29uc29sZS5lcnJvciA9IF9vcmlnQ29uc29sZS5lcnJvcjtcbiAgICBfb3JpZ0NvbnNvbGUgPSBudWxsO1xufVxuXG5leHBvcnQgY29uc3QgbWV0aG9kczogeyBba2V5OiBzdHJpbmddOiAoLi4uYW55OiBhbnkpID0+IGFueSB9ID0ge1xuICAgIC8qKlxuICAgICAqIHYyLjQuOCBBMzogaW52b2tlIGFub3RoZXIgc2NlbmUtc2NyaXB0IG1ldGhvZCBieSBuYW1lLCBjYXB0dXJpbmdcbiAgICAgKiBjb25zb2xlLntsb2csd2FybixlcnJvcn0gZHVyaW5nIHRoZSBjYWxsIGFuZCByZXR1cm5pbmcgY2FwdHVyZWRMb2dzXG4gICAgICogYWxvbmdzaWRlIHRoZSBtZXRob2QncyBub3JtYWwgcmV0dXJuIGVudmVsb3BlLiBTaW5nbGUgcm91bmQtdHJpcC5cbiAgICAgKlxuICAgICAqIEJlaGF2aW91cjpcbiAgICAgKiAgLSBJZiBgbWV0aG9kTmFtZWAgZG9lcyBub3QgZXhpc3QsIHJldHVybnNcbiAgICAgKiAgICBgeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IFwiLi4uXCIgLCBjYXB0dXJlZExvZ3M6IFtdIH1gIChlbXB0eSkuXG4gICAgICogIC0gSWYgdGhlIGlubmVyIG1ldGhvZCB0aHJvd3MsIHRoZSB0aHJvdyBpcyBjYXVnaHQgYW5kIGNvbnZlcnRlZCB0b1xuICAgICAqICAgIGB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvciwgY2FwdHVyZWRMb2dzIH1gIHNvIHRoZSBob3N0IGFsd2F5cyBzZWVzXG4gICAgICogICAgYSBzdHJ1Y3R1cmVkIGVudmVsb3BlIHBsdXMgdGhlIGxvZ3MgdGhhdCByYW4gdXAgdG8gdGhlIHRocm93LlxuICAgICAqICAtIElmIHRoZSBpbm5lciBtZXRob2QgcmV0dXJucyBhbiBvYmplY3QsIGNhcHR1cmVkTG9ncyBpcyBtZXJnZWRcbiAgICAgKiAgICBhbG9uZ3NpZGUgaXRzIGtleXMgd2l0aG91dCBvdmVyd3JpdGluZyAod2UgdXNlIGA/PyBjYXB0dXJlc2BcbiAgICAgKiAgICBzZW1hbnRpY3M6IG9ubHkgc2V0IGlmIG5vdCBhbHJlYWR5IHByZXNlbnQpLlxuICAgICAqL1xuICAgIGFzeW5jIHJ1bldpdGhDYXB0dXJlKG1ldGhvZE5hbWU6IHN0cmluZywgbWV0aG9kQXJncz86IHVua25vd25bXSkge1xuICAgICAgICBjb25zdCBzbG90OiBDYXB0dXJlU2xvdCA9IHtcbiAgICAgICAgICAgIGVudHJpZXM6IFtdLFxuICAgICAgICAgICAgYnl0ZXM6IDAsXG4gICAgICAgICAgICB0cnVuY2F0ZWQ6IGZhbHNlLFxuICAgICAgICB9O1xuICAgICAgICAvLyB2Mi40LjExIHJvdW5kLTMgY29kZXgg8J+UtCArIGNsYXVkZSDwn5+hICsgZ2VtaW5pIPCfn6E6IGtlZXAgaW5jcmVtZW50XG4gICAgICAgIC8vIE9VVFNJREUgdGhlIHRyeSAobnVtZXJpYyBgKz0gMWAgaXMgaW5mYWxsaWJsZSwgbXVzdCBwYWlyIDE6MSB3aXRoXG4gICAgICAgIC8vIGZpbmFsbHkgZGVjcmVtZW50KSwgYnV0IG1vdmUgX2Vuc3VyZUNvbnNvbGVIb29rIElOU0lERSBzbyBhXG4gICAgICAgIC8vIHRocm93IHRoZXJlICh0b2RheTogcHVyZSBhc3NpZ25tZW50cywgc28gc2FmZTsgZGVmZW5zaXZlIGFnYWluc3RcbiAgICAgICAgLy8gZnV0dXJlIGdyb3d0aCkgY2Fubm90IGxlYWsgdGhlIHJlZmNvdW50IGFuZCBsZWF2ZSB0aGUgY29uc29sZVxuICAgICAgICAvLyBob29rIGluc3RhbGxlZCBmb3JldmVyLlxuICAgICAgICBfYWN0aXZlU2xvdENvdW50ICs9IDE7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBfZW5zdXJlQ29uc29sZUhvb2soKTtcbiAgICAgICAgICAgIC8vIHYyLjQuMTAgcm91bmQtMiBjb2RleCDwn5S0ICsgY2xhdWRlIPCfn6EgKyBnZW1pbmkg8J+foTogQXN5bmNMb2NhbFN0b3JhZ2VcbiAgICAgICAgICAgIC8vIGJpbmRzIGBzbG90YCB0byB0aGlzIGNhbGwncyBsb2dpY2FsIGFzeW5jIGNvbnRleHQsIHNvIGFueVxuICAgICAgICAgICAgLy8gY29uc29sZS5sb2cgZW1pdHRlZCBieSB0aGUgaW5uZXIgbWV0aG9kIChvciBhbnkgZGVzY2VuZGFudFxuICAgICAgICAgICAgLy8gbWljcm90YXNrLCBldmVuIGFmdGVyIGBhd2FpdGAgYm91bmRhcmllcyB3aGVuIG90aGVyIGNhbGxzIGFyZVxuICAgICAgICAgICAgLy8gYWxzbyBhY3RpdmUpIHJvdXRlcyB0byBUSElTIHNsb3Qg4oCUIG5vdCB3aGljaGV2ZXIgd2FzXG4gICAgICAgICAgICAvLyB0b3Atb2Ytc3RhY2sgYXQgdGhlIG1vbWVudCB0aGUgbG9nIGZpcmVkLiBFbGltaW5hdGVzXG4gICAgICAgICAgICAvLyBjcm9zcy1jYWxsIGxlYWthZ2UgZnJvbSBpbnRlcmxlYXZlZCBhc3luYyBydW5zLlxuICAgICAgICAgICAgcmV0dXJuIGF3YWl0IF9jYXB0dXJlQUxTLnJ1bihzbG90LCBhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgZm4gPSBtZXRob2RzW21ldGhvZE5hbWVdO1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgZm4gIT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgLi4uZmFpbChgcnVuV2l0aENhcHR1cmU6IG1ldGhvZCAke21ldGhvZE5hbWV9IG5vdCBmb3VuZGApLCBjYXB0dXJlZExvZ3M6IHNsb3QuZW50cmllcyB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBmbiguLi4obWV0aG9kQXJncyA/PyBbXSkpO1xuICAgICAgICAgICAgICAgICAgICBpZiAocmVzdWx0ICYmIHR5cGVvZiByZXN1bHQgPT09ICdvYmplY3QnICYmICFBcnJheS5pc0FycmF5KHJlc3VsdCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB7IC4uLnJlc3VsdCwgY2FwdHVyZWRMb2dzOiAocmVzdWx0IGFzIGFueSkuY2FwdHVyZWRMb2dzID8/IHNsb3QuZW50cmllcyB9O1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7IC4uLm9rKHJlc3VsdCksIGNhcHR1cmVkTG9nczogc2xvdC5lbnRyaWVzIH07XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgLi4uZmFpbChlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycikpLCBjYXB0dXJlZExvZ3M6IHNsb3QuZW50cmllcyB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgICAgX2FjdGl2ZVNsb3RDb3VudCA9IE1hdGgubWF4KDAsIF9hY3RpdmVTbG90Q291bnQgLSAxKTtcbiAgICAgICAgICAgIF9tYXliZVVuaG9va0NvbnNvbGUoKTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBBZGQgY29tcG9uZW50IHRvIGEgbm9kZVxuICAgICAqL1xuICAgIGFkZENvbXBvbmVudFRvTm9kZShub2RlVXVpZDogc3RyaW5nLCBjb21wb25lbnRUeXBlOiBzdHJpbmcpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IsIGpzIH0gPSByZXF1aXJlKCdjYycpO1xuICAgICAgICAgICAgY29uc3Qgc2NlbmUgPSBkaXJlY3Rvci5nZXRTY2VuZSgpO1xuICAgICAgICAgICAgaWYgKCFzY2VuZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKCdObyBhY3RpdmUgc2NlbmUnKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gRmluZCBub2RlIGJ5IFVVSURcbiAgICAgICAgICAgIGNvbnN0IG5vZGUgPSBzY2VuZS5nZXRDaGlsZEJ5VXVpZChub2RlVXVpZCk7XG4gICAgICAgICAgICBpZiAoIW5vZGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFpbChgTm9kZSB3aXRoIFVVSUQgJHtub2RlVXVpZH0gbm90IGZvdW5kYCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIEdldCBjb21wb25lbnQgY2xhc3NcbiAgICAgICAgICAgIGNvbnN0IENvbXBvbmVudENsYXNzID0ganMuZ2V0Q2xhc3NCeU5hbWUoY29tcG9uZW50VHlwZSk7XG4gICAgICAgICAgICBpZiAoIUNvbXBvbmVudENsYXNzKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoYENvbXBvbmVudCB0eXBlICR7Y29tcG9uZW50VHlwZX0gbm90IGZvdW5kYCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIEFkZCBjb21wb25lbnRcbiAgICAgICAgICAgIGNvbnN0IGNvbXBvbmVudCA9IG5vZGUuYWRkQ29tcG9uZW50KENvbXBvbmVudENsYXNzKTtcbiAgICAgICAgICAgIHJldHVybiBvayh7IGNvbXBvbmVudElkOiBjb21wb25lbnQudXVpZCB9LCBgQ29tcG9uZW50ICR7Y29tcG9uZW50VHlwZX0gYWRkZWQgc3VjY2Vzc2Z1bGx5YCk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGVycm9yLm1lc3NhZ2UpO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIENyZWF0ZSBhIG5ldyBub2RlXG4gICAgICovXG4gICAgY3JlYXRlTm9kZShuYW1lOiBzdHJpbmcsIHBhcmVudFV1aWQ/OiBzdHJpbmcpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IsIE5vZGUgfSA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgICAgICBpZiAoIXNjZW5lKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ05vIGFjdGl2ZSBzY2VuZScpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBub2RlID0gbmV3IE5vZGUobmFtZSk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmIChwYXJlbnRVdWlkKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcGFyZW50ID0gc2NlbmUuZ2V0Q2hpbGRCeVV1aWQocGFyZW50VXVpZCk7XG4gICAgICAgICAgICAgICAgaWYgKHBhcmVudCkge1xuICAgICAgICAgICAgICAgICAgICBwYXJlbnQuYWRkQ2hpbGQobm9kZSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgc2NlbmUuYWRkQ2hpbGQobm9kZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBzY2VuZS5hZGRDaGlsZChub2RlKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIG9rKHsgdXVpZDogbm9kZS51dWlkLCBuYW1lOiBub2RlLm5hbWUgfSwgYE5vZGUgJHtuYW1lfSBjcmVhdGVkIHN1Y2Nlc3NmdWxseWApO1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChlcnJvci5tZXNzYWdlKTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBHZXQgbm9kZSBpbmZvcm1hdGlvblxuICAgICAqL1xuICAgIGdldE5vZGVJbmZvKG5vZGVVdWlkOiBzdHJpbmcpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IgfSA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgICAgICBpZiAoIXNjZW5lKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ05vIGFjdGl2ZSBzY2VuZScpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBub2RlID0gc2NlbmUuZ2V0Q2hpbGRCeVV1aWQobm9kZVV1aWQpO1xuICAgICAgICAgICAgaWYgKCFub2RlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoYE5vZGUgd2l0aCBVVUlEICR7bm9kZVV1aWR9IG5vdCBmb3VuZGApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gb2soe1xuICAgICAgICAgICAgICAgIHV1aWQ6IG5vZGUudXVpZCxcbiAgICAgICAgICAgICAgICBuYW1lOiBub2RlLm5hbWUsXG4gICAgICAgICAgICAgICAgYWN0aXZlOiBub2RlLmFjdGl2ZSxcbiAgICAgICAgICAgICAgICBwb3NpdGlvbjogbm9kZS5wb3NpdGlvbixcbiAgICAgICAgICAgICAgICByb3RhdGlvbjogbm9kZS5yb3RhdGlvbixcbiAgICAgICAgICAgICAgICBzY2FsZTogbm9kZS5zY2FsZSxcbiAgICAgICAgICAgICAgICBwYXJlbnQ6IG5vZGUucGFyZW50Py51dWlkLFxuICAgICAgICAgICAgICAgIGNoaWxkcmVuOiBub2RlLmNoaWxkcmVuLm1hcCgoY2hpbGQ6IGFueSkgPT4gY2hpbGQudXVpZCksXG4gICAgICAgICAgICAgICAgY29tcG9uZW50czogbm9kZS5jb21wb25lbnRzLm1hcCgoY29tcDogYW55KSA9PiAoe1xuICAgICAgICAgICAgICAgICAgICB0eXBlOiBjb21wLmNvbnN0cnVjdG9yLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgIGVuYWJsZWQ6IGNvbXAuZW5hYmxlZFxuICAgICAgICAgICAgICAgIH0pKVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGVycm9yLm1lc3NhZ2UpO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEdldCBhbGwgbm9kZXMgaW4gc2NlbmVcbiAgICAgKi9cbiAgICBnZXRBbGxOb2RlcygpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IgfSA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgICAgICBpZiAoIXNjZW5lKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ05vIGFjdGl2ZSBzY2VuZScpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBub2RlczogYW55W10gPSBbXTtcbiAgICAgICAgICAgIGNvbnN0IGNvbGxlY3ROb2RlcyA9IChub2RlOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBub2Rlcy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgdXVpZDogbm9kZS51dWlkLFxuICAgICAgICAgICAgICAgICAgICBuYW1lOiBub2RlLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgIGFjdGl2ZTogbm9kZS5hY3RpdmUsXG4gICAgICAgICAgICAgICAgICAgIHBhcmVudDogbm9kZS5wYXJlbnQ/LnV1aWRcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBub2RlLmNoaWxkcmVuLmZvckVhY2goKGNoaWxkOiBhbnkpID0+IGNvbGxlY3ROb2RlcyhjaGlsZCkpO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgc2NlbmUuY2hpbGRyZW4uZm9yRWFjaCgoY2hpbGQ6IGFueSkgPT4gY29sbGVjdE5vZGVzKGNoaWxkKSk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHJldHVybiBvayhub2Rlcyk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGVycm9yLm1lc3NhZ2UpO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEZpbmQgbm9kZSBieSBuYW1lXG4gICAgICovXG4gICAgZmluZE5vZGVCeU5hbWUobmFtZTogc3RyaW5nKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCB7IGRpcmVjdG9yIH0gPSByZXF1aXJlKCdjYycpO1xuICAgICAgICAgICAgY29uc3Qgc2NlbmUgPSBkaXJlY3Rvci5nZXRTY2VuZSgpO1xuICAgICAgICAgICAgaWYgKCFzY2VuZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKCdObyBhY3RpdmUgc2NlbmUnKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3Qgbm9kZSA9IHNjZW5lLmdldENoaWxkQnlOYW1lKG5hbWUpO1xuICAgICAgICAgICAgaWYgKCFub2RlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoYE5vZGUgd2l0aCBuYW1lICR7bmFtZX0gbm90IGZvdW5kYCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgdXVpZDogbm9kZS51dWlkLFxuICAgICAgICAgICAgICAgIG5hbWU6IG5vZGUubmFtZSxcbiAgICAgICAgICAgICAgICBhY3RpdmU6IG5vZGUuYWN0aXZlLFxuICAgICAgICAgICAgICAgIHBvc2l0aW9uOiBub2RlLnBvc2l0aW9uXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoZXJyb3IubWVzc2FnZSk7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogR2V0IGN1cnJlbnQgc2NlbmUgaW5mb3JtYXRpb25cbiAgICAgKi9cbiAgICBnZXRDdXJyZW50U2NlbmVJbmZvKCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgeyBkaXJlY3RvciB9ID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICAgICAgICAgIGlmICghc2NlbmUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFpbCgnTm8gYWN0aXZlIHNjZW5lJyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgbmFtZTogc2NlbmUubmFtZSxcbiAgICAgICAgICAgICAgICB1dWlkOiBzY2VuZS51dWlkLFxuICAgICAgICAgICAgICAgIG5vZGVDb3VudDogc2NlbmUuY2hpbGRyZW4ubGVuZ3RoXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoZXJyb3IubWVzc2FnZSk7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogU2V0IG5vZGUgcHJvcGVydHlcbiAgICAgKi9cbiAgICBzZXROb2RlUHJvcGVydHkobm9kZVV1aWQ6IHN0cmluZywgcHJvcGVydHk6IHN0cmluZywgdmFsdWU6IGFueSkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgeyBkaXJlY3RvciB9ID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICAgICAgICAgIGlmICghc2NlbmUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFpbCgnTm8gYWN0aXZlIHNjZW5lJyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IG5vZGUgPSBzY2VuZS5nZXRDaGlsZEJ5VXVpZChub2RlVXVpZCk7XG4gICAgICAgICAgICBpZiAoIW5vZGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFpbChgTm9kZSB3aXRoIFVVSUQgJHtub2RlVXVpZH0gbm90IGZvdW5kYCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIOioree9ruWxrOaAp1xuICAgICAgICAgICAgaWYgKHByb3BlcnR5ID09PSAncG9zaXRpb24nKSB7XG4gICAgICAgICAgICAgICAgbm9kZS5zZXRQb3NpdGlvbih2YWx1ZS54IHx8IDAsIHZhbHVlLnkgfHwgMCwgdmFsdWUueiB8fCAwKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHkgPT09ICdyb3RhdGlvbicpIHtcbiAgICAgICAgICAgICAgICBub2RlLnNldFJvdGF0aW9uRnJvbUV1bGVyKHZhbHVlLnggfHwgMCwgdmFsdWUueSB8fCAwLCB2YWx1ZS56IHx8IDApO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eSA9PT0gJ3NjYWxlJykge1xuICAgICAgICAgICAgICAgIG5vZGUuc2V0U2NhbGUodmFsdWUueCB8fCAxLCB2YWx1ZS55IHx8IDEsIHZhbHVlLnogfHwgMSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5ID09PSAnYWN0aXZlJykge1xuICAgICAgICAgICAgICAgIG5vZGUuYWN0aXZlID0gdmFsdWU7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5ID09PSAnbmFtZScpIHtcbiAgICAgICAgICAgICAgICBub2RlLm5hbWUgPSB2YWx1ZTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8g5ZiX6Kmm55u05o6l6Kit572u5bGs5oCnXG4gICAgICAgICAgICAgICAgKG5vZGUgYXMgYW55KVtwcm9wZXJ0eV0gPSB2YWx1ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIG9rKHVuZGVmaW5lZCwgYFByb3BlcnR5ICcke3Byb3BlcnR5fScgdXBkYXRlZCBzdWNjZXNzZnVsbHlgKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoZXJyb3IubWVzc2FnZSk7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogR2V0IHNjZW5lIGhpZXJhcmNoeVxuICAgICAqL1xuICAgIGdldFNjZW5lSGllcmFyY2h5KGluY2x1ZGVDb21wb25lbnRzOiBib29sZWFuID0gZmFsc2UpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IgfSA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgICAgICBpZiAoIXNjZW5lKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ05vIGFjdGl2ZSBzY2VuZScpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBwcm9jZXNzTm9kZSA9IChub2RlOiBhbnkpOiBhbnkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdDogYW55ID0ge1xuICAgICAgICAgICAgICAgICAgICBuYW1lOiBub2RlLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgIHV1aWQ6IG5vZGUudXVpZCxcbiAgICAgICAgICAgICAgICAgICAgYWN0aXZlOiBub2RlLmFjdGl2ZSxcbiAgICAgICAgICAgICAgICAgICAgY2hpbGRyZW46IFtdXG4gICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgIGlmIChpbmNsdWRlQ29tcG9uZW50cykge1xuICAgICAgICAgICAgICAgICAgICByZXN1bHQuY29tcG9uZW50cyA9IG5vZGUuY29tcG9uZW50cy5tYXAoKGNvbXA6IGFueSkgPT4gKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6IGNvbXAuY29uc3RydWN0b3IubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGVuYWJsZWQ6IGNvbXAuZW5hYmxlZFxuICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKG5vZGUuY2hpbGRyZW4gJiYgbm9kZS5jaGlsZHJlbi5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdC5jaGlsZHJlbiA9IG5vZGUuY2hpbGRyZW4ubWFwKChjaGlsZDogYW55KSA9PiBwcm9jZXNzTm9kZShjaGlsZCkpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBjb25zdCBoaWVyYXJjaHkgPSBzY2VuZS5jaGlsZHJlbi5tYXAoKGNoaWxkOiBhbnkpID0+IHByb2Nlc3NOb2RlKGNoaWxkKSk7XG4gICAgICAgICAgICByZXR1cm4gb2soaGllcmFyY2h5KTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoZXJyb3IubWVzc2FnZSk7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQ3JlYXRlIHByZWZhYiBhc3NldCBmcm9tIGEgbm9kZSB2aWEgdGhlIG9mZmljaWFsIHNjZW5lIGZhY2FkZS5cbiAgICAgKlxuICAgICAqIFJvdXRlcyB0aHJvdWdoIGBjY2UuUHJlZmFiLmNyZWF0ZVByZWZhYmAgKHRoZSBDb2NvcyBlZGl0b3IgcHJlZmFiXG4gICAgICogbWFuYWdlciBleHBvc2VkIGluIHNjZW5lLXNjcmlwdCBjb250ZXh0KS4gVGhlIHVybCBhY2NlcHRzIGJvdGhcbiAgICAgKiBgZGI6Ly9hc3NldHMvLi4uYCBhbmQgYWJzb2x1dGUgZmlsZXN5c3RlbSBwYXRocyBpbiBkaWZmZXJlbnQgZWRpdG9yXG4gICAgICogYnVpbGRzLCBzbyB3ZSB0cnkgYm90aCBzaGFwZXMgYW5kIHN1cmZhY2Ugd2hpY2hldmVyIGZhaWxzLlxuICAgICAqL1xuICAgIGFzeW5jIGNyZWF0ZVByZWZhYkZyb21Ob2RlKG5vZGVVdWlkOiBzdHJpbmcsIHVybDogc3RyaW5nKSB7XG4gICAgICAgIGNvbnN0IHByZWZhYk1nciA9IGdldFByZWZhYkZhY2FkZSgpO1xuICAgICAgICBpZiAoIXByZWZhYk1nci5vaykge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwocHJlZmFiTWdyLmVycm9yKTtcbiAgICAgICAgfVxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgdHJpZXM6IHN0cmluZ1tdID0gW107XG4gICAgICAgICAgICAvLyBQcmVmZXIgZGI6Ly8gZm9ybSAobWF0Y2hlcyBhc3NldC1kYiBxdWVyeSByZXN1bHRzKSBhbmQgZmFsbFxuICAgICAgICAgICAgLy8gYmFjayB0byB3aGF0ZXZlciB0aGUgY2FsbGVyIHBhc3NlZCB2ZXJiYXRpbS5cbiAgICAgICAgICAgIGNvbnN0IGRiVXJsID0gdXJsLnN0YXJ0c1dpdGgoJ2RiOi8vJykgPyB1cmwgOiBgZGI6Ly9hc3NldHMvJHt1cmwucmVwbGFjZSgvXlxcLysvLCAnJyl9YDtcbiAgICAgICAgICAgIHRyaWVzLnB1c2goZGJVcmwpO1xuICAgICAgICAgICAgaWYgKGRiVXJsICE9PSB1cmwpIHtcbiAgICAgICAgICAgICAgICB0cmllcy5wdXNoKHVybCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IGVycm9yczogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIHRyaWVzKSB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgcHJlZmFiTWdyLnZhbHVlLmNyZWF0ZVByZWZhYihub2RlVXVpZCwgY2FuZGlkYXRlKTtcbiAgICAgICAgICAgICAgICAgICAgLy8gY2NlLlByZWZhYi5jcmVhdGVQcmVmYWIgcmVwdXJwb3NlcyB0aGUgc291cmNlIG5vZGUgaW50byBhXG4gICAgICAgICAgICAgICAgICAgIC8vIHByZWZhYiBpbnN0YW5jZSB3aXRoIGEgZnJlc2ggVVVJRCwgc28gdGhlIGNhbGxlci1zdXBwbGllZFxuICAgICAgICAgICAgICAgICAgICAvLyBub2RlVXVpZCBpcyBubyBsb25nZXIgdmFsaWQuIFJlc29sdmUgdGhlIG5ldyBVVUlEIGJ5XG4gICAgICAgICAgICAgICAgICAgIC8vIHF1ZXJ5aW5nIG5vZGVzIHRoYXQgcmVmZXJlbmNlIHRoZSBmcmVzaGx5IG1pbnRlZCBhc3NldC5cbiAgICAgICAgICAgICAgICAgICAgbGV0IGFzc2V0VXVpZDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgcmVzdWx0ID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXNzZXRVdWlkID0gcmVzdWx0O1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHJlc3VsdCAmJiB0eXBlb2YgcmVzdWx0ID09PSAnb2JqZWN0JyAmJiB0eXBlb2YgKHJlc3VsdCBhcyBhbnkpLnV1aWQgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhc3NldFV1aWQgPSAocmVzdWx0IGFzIGFueSkudXVpZDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBsZXQgaW5zdGFuY2VOb2RlVXVpZDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgIGlmIChhc3NldFV1aWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgaW5zdGFuY2VzOiBhbnkgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1ub2Rlcy1ieS1hc3NldC11dWlkJywgYXNzZXRVdWlkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShpbnN0YW5jZXMpICYmIGluc3RhbmNlcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIE5ld2x5LWNyZWF0ZWQgcHJlZmFiIGluc3RhbmNlIGlzIHR5cGljYWxseSB0aGVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gbGFzdCBlbnRyeS4gQ2F2ZWF0OiBpZiB0aGUgc2FtZSBhc3NldCBhbHJlYWR5XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGhhZCBpbnN0YW5jZXMgaW4gdGhlIHNjZW5lLCBcImxhc3RcIiBwaWNrcyBvbmVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gb2YgdGhlbSByYXRoZXIgdGhhbiB0aGUgbmV3IG9uZS4gVGhlIGVkaXRvclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBhcHBlYXJzIHRvIHJldHVybiBjcmVhdGlvbiBvcmRlciwgYnV0IHRoZSBBUElcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gaXMgdW5kb2N1bWVudGVkOyBjYWxsZXJzIHJlcXVpcmluZyBzdHJpY3RcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gaWRlbnRpZmljYXRpb24gc2hvdWxkIHNuYXBzaG90IGJlZm9yZSBjYWxsaW5nLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbnN0YW5jZU5vZGVVdWlkID0gaW5zdGFuY2VzW2luc3RhbmNlcy5sZW5ndGggLSAxXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBOb24tZmF0YWw6IHRoZSBhc3NldCB3YXMgY3JlYXRlZCBlaXRoZXIgd2F5LlxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICB1cmw6IGNhbmRpZGF0ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHNvdXJjZU5vZGVVdWlkOiBub2RlVXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHByZWZhYkFzc2V0VXVpZDogYXNzZXRVdWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgaW5zdGFuY2VOb2RlVXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHJhdzogcmVzdWx0LFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgICAgICAgICBlcnJvcnMucHVzaChgJHtjYW5kaWRhdGV9OiAke2Vycj8ubWVzc2FnZSA/PyBlcnJ9YCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGZhaWwoYGNjZS5QcmVmYWIuY3JlYXRlUHJlZmFiIGZhaWxlZDogJHtlcnJvcnMuam9pbignOyAnKX1gKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoZXJyb3I/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycm9yKSk7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogUHVzaCBwcmVmYWIgaW5zdGFuY2UgZWRpdHMgYmFjayB0byB0aGUgcHJlZmFiIGFzc2V0LlxuICAgICAqIFdyYXBzIHNjZW5lIGZhY2FkZSBgYXBwbHlQcmVmYWIobm9kZVV1aWQpYC5cbiAgICAgKi9cbiAgICBhc3luYyBhcHBseVByZWZhYihub2RlVXVpZDogc3RyaW5nKSB7XG4gICAgICAgIGNvbnN0IHByZWZhYk1nciA9IGdldFByZWZhYkZhY2FkZSgpO1xuICAgICAgICBpZiAoIXByZWZhYk1nci5vaykge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwocHJlZmFiTWdyLmVycm9yKTtcbiAgICAgICAgfVxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gTm90ZTogZmFjYWRlUmV0dXJuIGZyb20gY2NlLlNjZW5lRmFjYWRlTWFuYWdlci5hcHBseVByZWZhYiBpc1xuICAgICAgICAgICAgLy8gb2JzZXJ2ZWQgdG8gYmUgYGZhbHNlYCBldmVuIHdoZW4gdGhlIGFwcGx5IGdlbnVpbmVseSB3cml0ZXNcbiAgICAgICAgICAgIC8vIHRvIGRpc2sgKHZlcmlmaWVkIGR1cmluZyBQNCB2Mi4xLjAgcmVhbC1lZGl0b3IgdGVzdGluZykuXG4gICAgICAgICAgICAvLyBUcmVhdCBcIm5vIGV4Y2VwdGlvbiB0aHJvd25cIiBhcyBzdWNjZXNzIGFuZCBzdXJmYWNlIHRoZSByYXdcbiAgICAgICAgICAgIC8vIHJldHVybiB2YWx1ZSBhcyBtZXRhZGF0YSBvbmx5LlxuICAgICAgICAgICAgLy8gKHYyLjkueCBwb2xpc2gg4oCUIEdlbWluaSByMSBzaW5nbGUt8J+foSBmcm9tIHYyLjguMSByZXZpZXc6XG4gICAgICAgICAgICAvLyBjYW5vbmljYWwgbmFtZSBpcyBTY2VuZUZhY2FkZU1hbmFnZXI7IGNjZS5TY2VuZUZhY2FkZSBpc1xuICAgICAgICAgICAgLy8gdGhlIHR5cGUtZG9jIGFsaWFzLiBVc2UgU2NlbmVGYWNhZGVNYW5hZ2VyIHRocm91Z2hvdXRcbiAgICAgICAgICAgIC8vIGNvbW1lbnRzIHNvIHRoZSBydW50aW1lIGlkZW50aXR5IGlzIHVuYW1iaWd1b3VzLilcbiAgICAgICAgICAgIGNvbnN0IGZhY2FkZVJldHVybiA9IGF3YWl0IHByZWZhYk1nci52YWx1ZS5hcHBseVByZWZhYihub2RlVXVpZCk7XG4gICAgICAgICAgICByZXR1cm4gb2soeyBmYWNhZGVSZXR1cm4sIG5vZGVVdWlkIH0pO1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChlcnJvcj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyb3IpKTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBDb25uZWN0IGEgcmVndWxhciBub2RlIHRvIGEgcHJlZmFiIGFzc2V0IChsaW5rKS5cbiAgICAgKiBXcmFwcyBzY2VuZSBmYWNhZGUgYGxpbmtQcmVmYWIobm9kZVV1aWQsIGFzc2V0VXVpZClgLlxuICAgICAqL1xuICAgIGFzeW5jIGxpbmtQcmVmYWIobm9kZVV1aWQ6IHN0cmluZywgYXNzZXRVdWlkOiBzdHJpbmcpIHtcbiAgICAgICAgY29uc3QgcHJlZmFiTWdyID0gZ2V0UHJlZmFiRmFjYWRlKCk7XG4gICAgICAgIGlmICghcHJlZmFiTWdyLm9rKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChwcmVmYWJNZ3IuZXJyb3IpO1xuICAgICAgICB9XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBwcmVmYWJNZ3IudmFsdWUubGlua1ByZWZhYihub2RlVXVpZCwgYXNzZXRVdWlkKTtcbiAgICAgICAgICAgIHJldHVybiBvayh7IGxpbmtlZDogcmVzdWx0LCBub2RlVXVpZCwgYXNzZXRVdWlkIH0pO1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChlcnJvcj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyb3IpKTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBCcmVhayB0aGUgcHJlZmFiIGNvbm5lY3Rpb24gb24gYSBub2RlLlxuICAgICAqIFdyYXBzIHNjZW5lIGZhY2FkZSBgdW5saW5rUHJlZmFiKG5vZGVVdWlkLCByZW1vdmVOZXN0ZWQpYC5cbiAgICAgKi9cbiAgICBhc3luYyB1bmxpbmtQcmVmYWIobm9kZVV1aWQ6IHN0cmluZywgcmVtb3ZlTmVzdGVkOiBib29sZWFuKSB7XG4gICAgICAgIGNvbnN0IHByZWZhYk1nciA9IGdldFByZWZhYkZhY2FkZSgpO1xuICAgICAgICBpZiAoIXByZWZhYk1nci5vaykge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwocHJlZmFiTWdyLmVycm9yKTtcbiAgICAgICAgfVxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgcHJlZmFiTWdyLnZhbHVlLnVubGlua1ByZWZhYihub2RlVXVpZCwgcmVtb3ZlTmVzdGVkKTtcbiAgICAgICAgICAgIHJldHVybiBvayh7IHVubGlua2VkOiByZXN1bHQsIG5vZGVVdWlkLCByZW1vdmVOZXN0ZWQgfSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGVycm9yPy5tZXNzYWdlID8/IFN0cmluZyhlcnJvcikpO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFJlYWQgdGhlIHByZWZhYiBkdW1wIGZvciBhIHByZWZhYiBpbnN0YW5jZSBub2RlLlxuICAgICAqIFdyYXBzIHNjZW5lIGZhY2FkZSBgZ2V0UHJlZmFiRGF0YShub2RlVXVpZClgLlxuICAgICAqL1xuICAgIGdldFByZWZhYkRhdGEobm9kZVV1aWQ6IHN0cmluZykge1xuICAgICAgICBjb25zdCBwcmVmYWJNZ3IgPSBnZXRQcmVmYWJGYWNhZGUoKTtcbiAgICAgICAgaWYgKCFwcmVmYWJNZ3Iub2spIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKHByZWZhYk1nci5lcnJvcik7XG4gICAgICAgIH1cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGRhdGEgPSBwcmVmYWJNZ3IudmFsdWUuZ2V0UHJlZmFiRGF0YShub2RlVXVpZCk7XG4gICAgICAgICAgICByZXR1cm4gb2soZGF0YSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGVycm9yPy5tZXNzYWdlID8/IFN0cmluZyhlcnJvcikpO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEFwcGVuZCBhIGNjLkV2ZW50SGFuZGxlciBlbnRyeSB0byBhIGNvbXBvbmVudCdzIGV2ZW50IGFycmF5XG4gICAgICogKGUuZy4gY2MuQnV0dG9uLmNsaWNrRXZlbnRzLCBjYy5Ub2dnbGUuY2hlY2tFdmVudHMpLlxuICAgICAqXG4gICAgICogUGVyc2lzdGVuY2Ugbm90ZSAoQ0xBVURFLm1kIExhbmRtaW5lICMxMSk6IHNjZW5lLXNjcmlwdCBgYXJyLnB1c2hgXG4gICAgICogb25seSBtdXRhdGVzIHRoZSBydW50aW1lIGNjLkNvbXBvbmVudCBpbnN0YW5jZTsgdGhlIGVkaXRvcidzXG4gICAgICogc2VyaWFsaXphdGlvbiBtb2RlbCAod2hhdCBgc2F2ZS1zY2VuZWAgd3JpdGVzIHRvIGRpc2spIGRvZXMgbm90IHNlZVxuICAgICAqIHRoZSBjaGFuZ2UuIFRoZSBob3N0LXNpZGUgY2FsbGVyIChgY29tcG9uZW50LXRvb2xzLnRzYCkgaXNcbiAgICAgKiByZXNwb25zaWJsZSBmb3IgbnVkZ2luZyB0aGUgbW9kZWwgYWZ0ZXJ3YXJkcyB2aWEgYSBuby1vcFxuICAgICAqIGBzZXQtcHJvcGVydHlgIG9uIGEgY29tcG9uZW50IGZpZWxkIOKAlCBjYWxsaW5nIGBzZXQtcHJvcGVydHlgIGZyb21cbiAgICAgKiBoZXJlIGRvZXNuJ3QgcHJvcGFnYXRlIChzY2VuZS1wcm9jZXNzIElQQyBzaG9ydC1jaXJjdWl0cyBhbmRcbiAgICAgKiBza2lwcyB0aGUgbW9kZWwgc3luYykuIFdlIHN1cmZhY2UgYGNvbXBvbmVudFV1aWRgIGFuZFxuICAgICAqIGBjb21wb25lbnRFbmFibGVkYCBzbyB0aGUgY2FsbGVyIGhhcyB3aGF0IGl0IG5lZWRzLlxuICAgICAqL1xuICAgIGFkZEV2ZW50SGFuZGxlcihcbiAgICAgICAgbm9kZVV1aWQ6IHN0cmluZyxcbiAgICAgICAgY29tcG9uZW50VHlwZTogc3RyaW5nLFxuICAgICAgICBldmVudEFycmF5UHJvcGVydHk6IHN0cmluZyxcbiAgICAgICAgdGFyZ2V0VXVpZDogc3RyaW5nLFxuICAgICAgICBjb21wb25lbnROYW1lOiBzdHJpbmcsXG4gICAgICAgIGhhbmRsZXI6IHN0cmluZyxcbiAgICAgICAgY3VzdG9tRXZlbnREYXRhPzogc3RyaW5nLFxuICAgICkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgY2MgPSByZXF1aXJlKCdjYycpO1xuICAgICAgICAgICAgY29uc3QgY3R4ID0gcmVzb2x2ZUNvbXBvbmVudENvbnRleHQobm9kZVV1aWQsIGNvbXBvbmVudFR5cGUpO1xuICAgICAgICAgICAgaWYgKCFjdHgub2spIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFpbChjdHguZXJyb3IpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgdGFyZ2V0Tm9kZSA9IGZpbmROb2RlQnlVdWlkRGVlcChjdHguc2NlbmUsIHRhcmdldFV1aWQpO1xuICAgICAgICAgICAgaWYgKCF0YXJnZXROb2RlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoYFRhcmdldCBub2RlIHdpdGggVVVJRCAke3RhcmdldFV1aWR9IG5vdCBmb3VuZGApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgYXJyID0gY3R4LmNvbXBvbmVudFtldmVudEFycmF5UHJvcGVydHldO1xuICAgICAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KGFycikpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFpbChgUHJvcGVydHkgJyR7ZXZlbnRBcnJheVByb3BlcnR5fScgb24gJHtjb21wb25lbnRUeXBlfSBpcyBub3QgYW4gYXJyYXkgKGdvdCAke3R5cGVvZiBhcnJ9KWApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBlaCA9IG5ldyBjYy5FdmVudEhhbmRsZXIoKTtcbiAgICAgICAgICAgIGVoLnRhcmdldCA9IHRhcmdldE5vZGU7XG4gICAgICAgICAgICBlaC5jb21wb25lbnQgPSBjb21wb25lbnROYW1lO1xuICAgICAgICAgICAgZWguaGFuZGxlciA9IGhhbmRsZXI7XG4gICAgICAgICAgICBlaC5jdXN0b21FdmVudERhdGEgPSBjdXN0b21FdmVudERhdGEgPz8gJyc7XG4gICAgICAgICAgICBhcnIucHVzaChlaCk7XG5cbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnNlbmQoJ3NjZW5lJywgJ3NuYXBzaG90Jyk7XG4gICAgICAgICAgICByZXR1cm4gb2soe1xuICAgICAgICAgICAgICAgICAgICBpbmRleDogYXJyLmxlbmd0aCAtIDEsXG4gICAgICAgICAgICAgICAgICAgIGNvdW50OiBhcnIubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRVdWlkOiBjdHguY29tcG9uZW50LnV1aWQsXG4gICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudEVuYWJsZWQ6IGN0eC5jb21wb25lbnQuZW5hYmxlZCAhPT0gZmFsc2UsXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGVycm9yPy5tZXNzYWdlID8/IFN0cmluZyhlcnJvcikpO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFJlbW92ZSBhIGNjLkV2ZW50SGFuZGxlciBlbnRyeSBieSBpbmRleCwgb3IgYnkgbWF0Y2hpbmdcbiAgICAgKiAodGFyZ2V0VXVpZCwgaGFuZGxlcikgcGFpci4gSWYgYm90aCBhcmUgcHJvdmlkZWQsIGluZGV4IHdpbnMuXG4gICAgICpcbiAgICAgKiBTZWUgYWRkRXZlbnRIYW5kbGVyIGZvciB0aGUgcGVyc2lzdGVuY2Ugbm90ZS4gQ2FsbGVyIG11c3QgZm9sbG93IHVwXG4gICAgICogd2l0aCBhIGhvc3Qtc2lkZSBgc2V0LXByb3BlcnR5YCBudWRnZSB1c2luZyB0aGUgcmV0dXJuZWRcbiAgICAgKiBgY29tcG9uZW50VXVpZGAgLyBgY29tcG9uZW50RW5hYmxlZGAgdG8gbWFrZSB0aGUgY2hhbmdlIHZpc2libGUgdG9cbiAgICAgKiBgc2F2ZS1zY2VuZWAuXG4gICAgICovXG4gICAgcmVtb3ZlRXZlbnRIYW5kbGVyKFxuICAgICAgICBub2RlVXVpZDogc3RyaW5nLFxuICAgICAgICBjb21wb25lbnRUeXBlOiBzdHJpbmcsXG4gICAgICAgIGV2ZW50QXJyYXlQcm9wZXJ0eTogc3RyaW5nLFxuICAgICAgICBpbmRleDogbnVtYmVyIHwgbnVsbCxcbiAgICAgICAgdGFyZ2V0VXVpZDogc3RyaW5nIHwgbnVsbCxcbiAgICAgICAgaGFuZGxlcjogc3RyaW5nIHwgbnVsbCxcbiAgICApIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGN0eCA9IHJlc29sdmVDb21wb25lbnRDb250ZXh0KG5vZGVVdWlkLCBjb21wb25lbnRUeXBlKTtcbiAgICAgICAgICAgIGlmICghY3R4Lm9rKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoY3R4LmVycm9yKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGFyciA9IGN0eC5jb21wb25lbnRbZXZlbnRBcnJheVByb3BlcnR5XTtcbiAgICAgICAgICAgIGlmICghQXJyYXkuaXNBcnJheShhcnIpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoYFByb3BlcnR5ICcke2V2ZW50QXJyYXlQcm9wZXJ0eX0nIG9uICR7Y29tcG9uZW50VHlwZX0gaXMgbm90IGFuIGFycmF5YCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIFRyaW0gYXJvdW5kIGNvbXBhcmlzb25zIHNvIGNhbGxlcnMgcGFzc2luZyBVVUlEcyAvIGhhbmRsZXJcbiAgICAgICAgICAgIC8vIG5hbWVzIHdpdGggbGVhZGluZy90cmFpbGluZyB3aGl0ZXNwYWNlIChMTE0gdG9vbCBhcmdzIG9mdGVuXG4gICAgICAgICAgICAvLyBjb21lIHdpdGggc3RyYXkgc3BhY2VzKSBzdGlsbCBmaW5kIGEgbWF0Y2guIENydWNpYWw6IHRoZVxuICAgICAgICAgICAgLy8gb3V0ZXIgZ3VhcmQgdGVzdHMgdGhlICp0cmltbWVkKiB2YWx1ZXMgdG9vIOKAlCBvdGhlcndpc2UgYVxuICAgICAgICAgICAgLy8gd2hpdGVzcGFjZS1vbmx5IHRhcmdldFV1aWQvaGFuZGxlciB3b3VsZCBwYXNzIGFzIHRydXRoeSxcbiAgICAgICAgICAgIC8vIGNvbGxhcHNlIHRvIG51bGwgYWZ0ZXIgdHJpbSwgYW5kIHRoZSBwcmVkaWNhdGUgd291bGQgbWF0Y2hcbiAgICAgICAgICAgIC8vIGV2ZXJ5IGVudHJ5IHZhY3VvdXNseSwgc2lsZW50bHkgZGVsZXRpbmcgYXJyWzBdLlxuICAgICAgICAgICAgY29uc3QgdGFyZ2V0VXVpZE5vcm0gPSB0YXJnZXRVdWlkPy50cmltKCkgfHwgbnVsbDtcbiAgICAgICAgICAgIGNvbnN0IGhhbmRsZXJOb3JtID0gaGFuZGxlcj8udHJpbSgpIHx8IG51bGw7XG4gICAgICAgICAgICBsZXQgcmVtb3ZlQXQgPSAtMTtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgaW5kZXggPT09ICdudW1iZXInICYmIGluZGV4ID49IDApIHtcbiAgICAgICAgICAgICAgICByZW1vdmVBdCA9IGluZGV4O1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0YXJnZXRVdWlkTm9ybSB8fCBoYW5kbGVyTm9ybSkge1xuICAgICAgICAgICAgICAgIHJlbW92ZUF0ID0gYXJyLmZpbmRJbmRleCgoZWg6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBlaFRhcmdldFV1aWQgPSB0eXBlb2YgZWg/LnRhcmdldD8udXVpZCA9PT0gJ3N0cmluZycgPyBlaC50YXJnZXQudXVpZC50cmltKCkgOiBlaD8udGFyZ2V0Py51dWlkO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBlaEhhbmRsZXIgPSB0eXBlb2YgZWg/LmhhbmRsZXIgPT09ICdzdHJpbmcnID8gZWguaGFuZGxlci50cmltKCkgOiBlaD8uaGFuZGxlcjtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbWF0Y2hlc1RhcmdldCA9ICF0YXJnZXRVdWlkTm9ybSB8fCBlaFRhcmdldFV1aWQgPT09IHRhcmdldFV1aWROb3JtO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBtYXRjaGVzSGFuZGxlciA9ICFoYW5kbGVyTm9ybSB8fCBlaEhhbmRsZXIgPT09IGhhbmRsZXJOb3JtO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gbWF0Y2hlc1RhcmdldCAmJiBtYXRjaGVzSGFuZGxlcjtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChyZW1vdmVBdCA8IDAgfHwgcmVtb3ZlQXQgPj0gYXJyLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKCdObyBtYXRjaGluZyBldmVudCBoYW5kbGVyIHRvIHJlbW92ZScpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgcmVtb3ZlZCA9IGFyci5zcGxpY2UocmVtb3ZlQXQsIDEpWzBdO1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2Uuc2VuZCgnc2NlbmUnLCAnc25hcHNob3QnKTtcbiAgICAgICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgICAgIGluZGV4OiByZW1vdmVBdCxcbiAgICAgICAgICAgICAgICAgICAgcmVtYWluaW5nOiBhcnIubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICByZW1vdmVkOiBzZXJpYWxpemVFdmVudEhhbmRsZXIocmVtb3ZlZCksXG4gICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudFV1aWQ6IGN0eC5jb21wb25lbnQudXVpZCxcbiAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50RW5hYmxlZDogY3R4LmNvbXBvbmVudC5lbmFibGVkICE9PSBmYWxzZSxcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoZXJyb3I/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycm9yKSk7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogSW5zcGVjdCBhIGNvbXBvbmVudCdzIEV2ZW50SGFuZGxlciBhcnJheSAocmVhZC1vbmx5KS5cbiAgICAgKi9cbiAgICBsaXN0RXZlbnRIYW5kbGVycyhub2RlVXVpZDogc3RyaW5nLCBjb21wb25lbnRUeXBlOiBzdHJpbmcsIGV2ZW50QXJyYXlQcm9wZXJ0eTogc3RyaW5nKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBjdHggPSByZXNvbHZlQ29tcG9uZW50Q29udGV4dChub2RlVXVpZCwgY29tcG9uZW50VHlwZSk7XG4gICAgICAgICAgICBpZiAoIWN0eC5vaykge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKGN0eC5lcnJvcik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBhcnIgPSBjdHguY29tcG9uZW50W2V2ZW50QXJyYXlQcm9wZXJ0eV07XG4gICAgICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkoYXJyKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKGBQcm9wZXJ0eSAnJHtldmVudEFycmF5UHJvcGVydHl9JyBvbiAke2NvbXBvbmVudFR5cGV9IGlzIG5vdCBhbiBhcnJheWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIG9rKHtcbiAgICAgICAgICAgICAgICAgICAgY291bnQ6IGFyci5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgIGhhbmRsZXJzOiBhcnIubWFwKHNlcmlhbGl6ZUV2ZW50SGFuZGxlciksXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGVycm9yPy5tZXNzYWdlID8/IFN0cmluZyhlcnJvcikpO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIHYyLjQuOCBBMjogY2MuQW5pbWF0aW9uIGRyaXZlcnMg4oCUIHNlZSBzb3VyY2UvdG9vbHMvYW5pbWF0aW9uLXRvb2xzLnRzLlxuICAgICAqIEltcGxlbWVudGF0aW9uIG5vdGU6IGNvY29zIGV4cG9zZXMgdGhlIGVuZ2luZSdzIGBjYy5BbmltYXRpb25gIChhbmRcbiAgICAgKiBpdHMgc3ViLWNsYXNzZXMgdmlhIGBqcy5nZXRDbGFzc0J5TmFtZWApLiBXZSB1c2UgdGhlIHJ1bnRpbWUgQVBJXG4gICAgICogKGBnZXRDb21wb25lbnQoJ2NjLkFuaW1hdGlvbicpYCkgcmF0aGVyIHRoYW4gdGhlIGVkaXRvcidzIHNldC1wcm9wZXJ0eVxuICAgICAqIGNoYW5uZWwgYmVjYXVzZSB0aGUgbGF0dGVyIHdvdWxkIG9ubHkgcGVyc2lzdCBkZWZhdWx0Q2xpcCAvIHBsYXlPbkxvYWRcbiAgICAgKiBidXQgY2Fubm90IHRyaWdnZXIgcGxheSgpL3N0b3AoKSDigJQgdGhvc2UgYXJlIHJ1bnRpbWUgbWV0aG9kcyBvbmx5LlxuICAgICAqL1xuICAgIGdldEFuaW1hdGlvbkNsaXBzKG5vZGVVdWlkOiBzdHJpbmcpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IgfSA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgICAgICBpZiAoIXNjZW5lKSByZXR1cm4gZmFpbCgnTm8gYWN0aXZlIHNjZW5lJyk7XG4gICAgICAgICAgICBjb25zdCBub2RlID0gZmluZE5vZGVCeVV1aWREZWVwKHNjZW5lLCBub2RlVXVpZCk7XG4gICAgICAgICAgICBpZiAoIW5vZGUpIHJldHVybiBmYWlsKGBOb2RlICR7bm9kZVV1aWR9IG5vdCBmb3VuZGApO1xuICAgICAgICAgICAgY29uc3QgYW5pbSA9IG5vZGUuZ2V0Q29tcG9uZW50KCdjYy5BbmltYXRpb24nKTtcbiAgICAgICAgICAgIGlmICghYW5pbSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKGBOb2RlICR7bm9kZVV1aWR9IGhhcyBubyBjYy5BbmltYXRpb24gY29tcG9uZW50YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBjbGlwczogYW55W10gPSBhbmltLmNsaXBzID8/IFtdO1xuICAgICAgICAgICAgY29uc3QgZGVmYXVsdENsaXBOYW1lID0gYW5pbS5kZWZhdWx0Q2xpcD8ubmFtZSA/PyBudWxsO1xuICAgICAgICAgICAgcmV0dXJuIG9rKHtcbiAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgICAgIG5vZGVOYW1lOiBub2RlLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgIGRlZmF1bHRDbGlwOiBkZWZhdWx0Q2xpcE5hbWUsXG4gICAgICAgICAgICAgICAgICAgIHBsYXlPbkxvYWQ6IGFuaW0ucGxheU9uTG9hZCA9PT0gdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgY2xpcHM6IGNsaXBzLmZpbHRlcihjID0+IGMpLm1hcChjID0+ICh7XG4gICAgICAgICAgICAgICAgICAgICAgICBuYW1lOiBjLm5hbWUgPz8gbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IGMuX3V1aWQgPz8gYy51dWlkID8/IG51bGwsXG4gICAgICAgICAgICAgICAgICAgICAgICBkdXJhdGlvbjogdHlwZW9mIGMuZHVyYXRpb24gPT09ICdudW1iZXInID8gYy5kdXJhdGlvbiA6IG51bGwsXG4gICAgICAgICAgICAgICAgICAgICAgICB3cmFwTW9kZTogYy53cmFwTW9kZSA/PyBudWxsLFxuICAgICAgICAgICAgICAgICAgICB9KSksXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGVycm9yPy5tZXNzYWdlID8/IFN0cmluZyhlcnJvcikpO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIGxpc3RBbmltYXRpb25TdGF0ZXMobm9kZVV1aWQ6IHN0cmluZykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgeyBkaXJlY3RvciB9ID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICAgICAgICAgIGlmICghc2NlbmUpIHJldHVybiBmYWlsKCdObyBhY3RpdmUgc2NlbmUnKTtcbiAgICAgICAgICAgIGNvbnN0IG5vZGUgPSBmaW5kTm9kZUJ5VXVpZERlZXAoc2NlbmUsIG5vZGVVdWlkKTtcbiAgICAgICAgICAgIGlmICghbm9kZSkgcmV0dXJuIGZhaWwoYE5vZGUgJHtub2RlVXVpZH0gbm90IGZvdW5kYCk7XG4gICAgICAgICAgICBjb25zdCBhbmltID0gbm9kZS5nZXRDb21wb25lbnQoJ2NjLkFuaW1hdGlvbicpO1xuICAgICAgICAgICAgaWYgKCFhbmltKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoYE5vZGUgJHtub2RlVXVpZH0gaGFzIG5vIGNjLkFuaW1hdGlvbiBjb21wb25lbnRgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGNsaXBzOiBhbnlbXSA9IHR5cGVvZiBhbmltLmdldEFuaW1hdGlvbkNsaXBzID09PSAnZnVuY3Rpb24nXG4gICAgICAgICAgICAgICAgPyBhbmltLmdldEFuaW1hdGlvbkNsaXBzKClcbiAgICAgICAgICAgICAgICA6IChhbmltLmNsaXBzID8/IFtdKTtcbiAgICAgICAgICAgIGNvbnN0IHN0YXRlcyA9IGNsaXBzXG4gICAgICAgICAgICAgICAgLmZpbHRlcigoY2xpcDogYW55KSA9PiBjbGlwPy5uYW1lKVxuICAgICAgICAgICAgICAgIC5tYXAoKGNsaXA6IGFueSkgPT4gYW5pbS5nZXRTdGF0ZShjbGlwLm5hbWUpKVxuICAgICAgICAgICAgICAgIC5maWx0ZXIoKHN0YXRlOiBhbnkpID0+IHN0YXRlKVxuICAgICAgICAgICAgICAgIC5tYXAoKHN0YXRlOiBhbnkpID0+ICh7XG4gICAgICAgICAgICAgICAgICAgIG5hbWU6IHN0YXRlLm5hbWUgPz8gbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgc3BlZWQ6IHR5cGVvZiBzdGF0ZS5zcGVlZCA9PT0gJ251bWJlcicgPyBzdGF0ZS5zcGVlZCA6IG51bGwsXG4gICAgICAgICAgICAgICAgICAgIHRvdGFsVGltZTogdHlwZW9mIHN0YXRlLnRvdGFsVGltZSA9PT0gJ251bWJlcicgPyBzdGF0ZS50b3RhbFRpbWUgOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICBjdXJyZW50VGltZTogdHlwZW9mIHN0YXRlLmN1cnJlbnRUaW1lID09PSAnbnVtYmVyJyA/IHN0YXRlLmN1cnJlbnRUaW1lIDogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgaXNQbGF5aW5nOiBzdGF0ZS5pc1BsYXlpbmcgPT09IHRydWUsXG4gICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgcmV0dXJuIG9rKHN0YXRlcyk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGVycm9yPy5tZXNzYWdlID8/IFN0cmluZyhlcnJvcikpO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIGdldEFuaW1hdGlvblN0YXRlSW5mbyhub2RlVXVpZDogc3RyaW5nLCBzdGF0ZU5hbWU6IHN0cmluZykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgeyBkaXJlY3RvciB9ID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICAgICAgICAgIGlmICghc2NlbmUpIHJldHVybiBmYWlsKCdObyBhY3RpdmUgc2NlbmUnKTtcbiAgICAgICAgICAgIGNvbnN0IG5vZGUgPSBmaW5kTm9kZUJ5VXVpZERlZXAoc2NlbmUsIG5vZGVVdWlkKTtcbiAgICAgICAgICAgIGlmICghbm9kZSkgcmV0dXJuIGZhaWwoYE5vZGUgJHtub2RlVXVpZH0gbm90IGZvdW5kYCk7XG4gICAgICAgICAgICBjb25zdCBhbmltID0gbm9kZS5nZXRDb21wb25lbnQoJ2NjLkFuaW1hdGlvbicpO1xuICAgICAgICAgICAgaWYgKCFhbmltKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoYE5vZGUgJHtub2RlVXVpZH0gaGFzIG5vIGNjLkFuaW1hdGlvbiBjb21wb25lbnRgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHN0YXRlID0gYW5pbS5nZXRTdGF0ZShzdGF0ZU5hbWUpO1xuICAgICAgICAgICAgaWYgKCFzdGF0ZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKGBBbmltYXRpb24gc3RhdGUgJyR7c3RhdGVOYW1lfScgbm90IGZvdW5kYCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gb2soe1xuICAgICAgICAgICAgICAgICAgICBzcGVlZDogdHlwZW9mIHN0YXRlLnNwZWVkID09PSAnbnVtYmVyJyA/IHN0YXRlLnNwZWVkIDogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgaXNQbGF5aW5nOiBzdGF0ZS5pc1BsYXlpbmcgPT09IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIGN1cnJlbnRUaW1lOiB0eXBlb2Ygc3RhdGUuY3VycmVudFRpbWUgPT09ICdudW1iZXInID8gc3RhdGUuY3VycmVudFRpbWUgOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICB0b3RhbFRpbWU6IHR5cGVvZiBzdGF0ZS50b3RhbFRpbWUgPT09ICdudW1iZXInID8gc3RhdGUudG90YWxUaW1lIDogbnVsbCxcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoZXJyb3I/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycm9yKSk7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgc2V0QW5pbWF0aW9uU3BlZWQobm9kZVV1aWQ6IHN0cmluZywgc3RhdGVOYW1lOiBzdHJpbmcsIHNwZWVkOiBudW1iZXIpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IgfSA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgICAgICBpZiAoIXNjZW5lKSByZXR1cm4gZmFpbCgnTm8gYWN0aXZlIHNjZW5lJyk7XG4gICAgICAgICAgICBjb25zdCBub2RlID0gZmluZE5vZGVCeVV1aWREZWVwKHNjZW5lLCBub2RlVXVpZCk7XG4gICAgICAgICAgICBpZiAoIW5vZGUpIHJldHVybiBmYWlsKGBOb2RlICR7bm9kZVV1aWR9IG5vdCBmb3VuZGApO1xuICAgICAgICAgICAgY29uc3QgYW5pbSA9IG5vZGUuZ2V0Q29tcG9uZW50KCdjYy5BbmltYXRpb24nKTtcbiAgICAgICAgICAgIGlmICghYW5pbSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKGBOb2RlICR7bm9kZVV1aWR9IGhhcyBubyBjYy5BbmltYXRpb24gY29tcG9uZW50YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBzdGF0ZSA9IGFuaW0uZ2V0U3RhdGUoc3RhdGVOYW1lKTtcbiAgICAgICAgICAgIGlmICghc3RhdGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFpbChgQW5pbWF0aW9uIHN0YXRlICcke3N0YXRlTmFtZX0nIG5vdCBmb3VuZGApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc3RhdGUuc3BlZWQgPSBzcGVlZDtcbiAgICAgICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgICAgIHNwZWVkOiBzdGF0ZS5zcGVlZCxcbiAgICAgICAgICAgICAgICAgICAgaXNQbGF5aW5nOiBzdGF0ZS5pc1BsYXlpbmcgPT09IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIGN1cnJlbnRUaW1lOiB0eXBlb2Ygc3RhdGUuY3VycmVudFRpbWUgPT09ICdudW1iZXInID8gc3RhdGUuY3VycmVudFRpbWUgOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICB0b3RhbFRpbWU6IHR5cGVvZiBzdGF0ZS50b3RhbFRpbWUgPT09ICdudW1iZXInID8gc3RhdGUudG90YWxUaW1lIDogbnVsbCxcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoZXJyb3I/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycm9yKSk7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgY2hlY2tBbmltYXRpb25GaW5pc2hlZChub2RlVXVpZDogc3RyaW5nLCBzdGF0ZU5hbWU6IHN0cmluZykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgeyBkaXJlY3RvciB9ID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICAgICAgICAgIGlmICghc2NlbmUpIHJldHVybiBmYWlsKCdObyBhY3RpdmUgc2NlbmUnKTtcbiAgICAgICAgICAgIGNvbnN0IG5vZGUgPSBmaW5kTm9kZUJ5VXVpZERlZXAoc2NlbmUsIG5vZGVVdWlkKTtcbiAgICAgICAgICAgIGlmICghbm9kZSkgcmV0dXJuIGZhaWwoYE5vZGUgJHtub2RlVXVpZH0gbm90IGZvdW5kYCk7XG4gICAgICAgICAgICBjb25zdCBhbmltID0gbm9kZS5nZXRDb21wb25lbnQoJ2NjLkFuaW1hdGlvbicpO1xuICAgICAgICAgICAgaWYgKCFhbmltKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoYE5vZGUgJHtub2RlVXVpZH0gaGFzIG5vIGNjLkFuaW1hdGlvbiBjb21wb25lbnRgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHN0YXRlID0gYW5pbS5nZXRTdGF0ZShzdGF0ZU5hbWUpO1xuICAgICAgICAgICAgaWYgKCFzdGF0ZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKGBBbmltYXRpb24gc3RhdGUgJyR7c3RhdGVOYW1lfScgbm90IGZvdW5kYCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBjdXJyZW50VGltZSA9IHR5cGVvZiBzdGF0ZS5jdXJyZW50VGltZSA9PT0gJ251bWJlcicgPyBzdGF0ZS5jdXJyZW50VGltZSA6IDA7XG4gICAgICAgICAgICBjb25zdCB0b3RhbFRpbWUgPSB0eXBlb2Ygc3RhdGUudG90YWxUaW1lID09PSAnbnVtYmVyJyA/IHN0YXRlLnRvdGFsVGltZSA6IDA7XG4gICAgICAgICAgICByZXR1cm4gb2soeyBmaW5pc2hlZDogY3VycmVudFRpbWUgPj0gdG90YWxUaW1lIH0pO1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChlcnJvcj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyb3IpKTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICBwbGF5QW5pbWF0aW9uKG5vZGVVdWlkOiBzdHJpbmcsIGNsaXBOYW1lPzogc3RyaW5nKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCB7IGRpcmVjdG9yIH0gPSByZXF1aXJlKCdjYycpO1xuICAgICAgICAgICAgY29uc3Qgc2NlbmUgPSBkaXJlY3Rvci5nZXRTY2VuZSgpO1xuICAgICAgICAgICAgaWYgKCFzY2VuZSkgcmV0dXJuIGZhaWwoJ05vIGFjdGl2ZSBzY2VuZScpO1xuICAgICAgICAgICAgY29uc3Qgbm9kZSA9IGZpbmROb2RlQnlVdWlkRGVlcChzY2VuZSwgbm9kZVV1aWQpO1xuICAgICAgICAgICAgaWYgKCFub2RlKSByZXR1cm4gZmFpbChgTm9kZSAke25vZGVVdWlkfSBub3QgZm91bmRgKTtcbiAgICAgICAgICAgIGNvbnN0IGFuaW0gPSBub2RlLmdldENvbXBvbmVudCgnY2MuQW5pbWF0aW9uJyk7XG4gICAgICAgICAgICBpZiAoIWFuaW0pIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFpbChgTm9kZSAke25vZGVVdWlkfSBoYXMgbm8gY2MuQW5pbWF0aW9uIGNvbXBvbmVudGApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGNsaXBOYW1lKSB7XG4gICAgICAgICAgICAgICAgLy8gVmFsaWRhdGUgY2xpcCBleGlzdHMgYmVmb3JlIGNhbGxpbmcgcGxheSgpIOKAlCBjYy5BbmltYXRpb24ucGxheVxuICAgICAgICAgICAgICAgIC8vIHNpbGVudGx5IGRvZXMgbm90aGluZyBvbiB1bmtub3duIG5hbWVzIHdoaWNoIHdvdWxkIG1hc2tcbiAgICAgICAgICAgICAgICAvLyB0eXBvcyBpbiBBSS1nZW5lcmF0ZWQgY2FsbHMuXG4gICAgICAgICAgICAgICAgY29uc3Qga25vd24gPSAoYW5pbS5jbGlwcyA/PyBbXSkuc29tZSgoYzogYW55KSA9PiBjPy5uYW1lID09PSBjbGlwTmFtZSk7XG4gICAgICAgICAgICAgICAgaWYgKCFrbm93biAmJiAoYW5pbS5kZWZhdWx0Q2xpcD8ubmFtZSAhPT0gY2xpcE5hbWUpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKGBDbGlwICcke2NsaXBOYW1lfScgaXMgbm90IHJlZ2lzdGVyZWQgb24gdGhpcyBBbmltYXRpb24uIEtub3duOiAkeyhhbmltLmNsaXBzID8/IFtdKS5tYXAoKGM6IGFueSkgPT4gYz8ubmFtZSkuZmlsdGVyKEJvb2xlYW4pLmpvaW4oJywgJykgfHwgJyhub25lKSd9LmApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBhbmltLnBsYXkoY2xpcE5hbWUpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBpZiAoIWFuaW0uZGVmYXVsdENsaXApIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ05vIGNsaXBOYW1lIGdpdmVuIGFuZCBubyBkZWZhdWx0Q2xpcCBjb25maWd1cmVkJyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGFuaW0ucGxheSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIG9rKHsgbm9kZVV1aWQsIGNsaXBOYW1lOiBjbGlwTmFtZSA/PyBhbmltLmRlZmF1bHRDbGlwPy5uYW1lID8/IG51bGwgfSwgYFBsYXlpbmcgJyR7Y2xpcE5hbWUgPz8gYW5pbS5kZWZhdWx0Q2xpcD8ubmFtZX0nIG9uICR7bm9kZS5uYW1lfWApO1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChlcnJvcj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyb3IpKTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICBzdG9wQW5pbWF0aW9uKG5vZGVVdWlkOiBzdHJpbmcpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IgfSA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgICAgICBpZiAoIXNjZW5lKSByZXR1cm4gZmFpbCgnTm8gYWN0aXZlIHNjZW5lJyk7XG4gICAgICAgICAgICBjb25zdCBub2RlID0gZmluZE5vZGVCeVV1aWREZWVwKHNjZW5lLCBub2RlVXVpZCk7XG4gICAgICAgICAgICBpZiAoIW5vZGUpIHJldHVybiBmYWlsKGBOb2RlICR7bm9kZVV1aWR9IG5vdCBmb3VuZGApO1xuICAgICAgICAgICAgY29uc3QgYW5pbSA9IG5vZGUuZ2V0Q29tcG9uZW50KCdjYy5BbmltYXRpb24nKTtcbiAgICAgICAgICAgIGlmICghYW5pbSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKGBOb2RlICR7bm9kZVV1aWR9IGhhcyBubyBjYy5BbmltYXRpb24gY29tcG9uZW50YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhbmltLnN0b3AoKTtcbiAgICAgICAgICAgIHJldHVybiBvayh1bmRlZmluZWQsIGBTdG9wcGVkIGFuaW1hdGlvbiBvbiAke25vZGUubmFtZX1gKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoZXJyb3I/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycm9yKSk7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogUmVzb2x2ZSBhIGNsaXAgbmFtZSDihpIgYXNzZXQgdXVpZCBvbiBhIG5vZGUncyBjYy5BbmltYXRpb24uIFJldHVybnNcbiAgICAgKiB0aGUgbWF0Y2hpbmcgY2xpcCdzIGBfdXVpZGAgYWxvbmcgd2l0aCB0aGUgY2MuQW5pbWF0aW9uIGNvbXBvbmVudFxuICAgICAqIGluZGV4IGluc2lkZSBgX19jb21wc19fYCwgYm90aCBvZiB3aGljaCB0aGUgaG9zdC1zaWRlXG4gICAgICogYW5pbWF0aW9uX3NldF9jbGlwIGhhbmRsZXIgbmVlZHMgdG8gaXNzdWUgYHNldC1wcm9wZXJ0eWAgd3JpdGVzLlxuICAgICAqXG4gICAgICogV2h5IGhvc3Qtc2lkZSBkb2VzIHRoZSBhY3R1YWwgd3JpdGU6IExhbmRtaW5lICMxMSDigJQgc2NhbGFyXG4gICAgICogcHJvcGVydHkgd3JpdGVzIHZpYSB0aGUgZWRpdG9yJ3Mgc2V0LXByb3BlcnR5IGNoYW5uZWwgcHJvcGFnYXRlXG4gICAgICogdG8gdGhlIHNlcmlhbGl6YXRpb24gbW9kZWwgaW1tZWRpYXRlbHkuIERpcmVjdCBydW50aW1lIG11dGF0aW9uXG4gICAgICogKGBhbmltLmRlZmF1bHRDbGlwID0geGApIG9ubHkgdXBkYXRlcyBsYXllciAoYSkgYW5kIG1heSBub3RcbiAgICAgKiBwZXJzaXN0IG9uIHNhdmVfc2NlbmUuIFNvIHNjZW5lLXNjcmlwdCByZXR1cm5zIHRoZSBtZXRhZGF0YTsgaG9zdFxuICAgICAqIGRvZXMgdGhlIHBlcnNpc3RlbmNlLlxuICAgICAqL1xuICAgIHF1ZXJ5QW5pbWF0aW9uU2V0VGFyZ2V0cyhub2RlVXVpZDogc3RyaW5nLCBjbGlwTmFtZTogc3RyaW5nIHwgbnVsbCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgeyBkaXJlY3RvciB9ID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICAgICAgICAgIGlmICghc2NlbmUpIHJldHVybiBmYWlsKCdObyBhY3RpdmUgc2NlbmUnKTtcbiAgICAgICAgICAgIGNvbnN0IG5vZGUgPSBmaW5kTm9kZUJ5VXVpZERlZXAoc2NlbmUsIG5vZGVVdWlkKTtcbiAgICAgICAgICAgIGlmICghbm9kZSkgcmV0dXJuIGZhaWwoYE5vZGUgJHtub2RlVXVpZH0gbm90IGZvdW5kYCk7XG4gICAgICAgICAgICAvLyB2Mi40LjkgcmV2aWV3IGZpeCAoY2xhdWRlICsgY29kZXgg8J+foSk6IHVzZSBpbmRleE9mIG9uIHRoZVxuICAgICAgICAgICAgLy8gcmVzb2x2ZWQgYW5pbSBpbnN0YW5jZSBkaXJlY3RseS4gVGhlIHByZXZpb3VzIG1ldGFkYXRhLXN0cmluZ1xuICAgICAgICAgICAgLy8gbG9va3VwIChjb25zdHJ1Y3Rvci5uYW1lIC8gX19jbGFzc25hbWVfXyAvIF9jaWQpIHdhcyBmcmFnaWxlXG4gICAgICAgICAgICAvLyBhZ2FpbnN0IGN1c3RvbSBzdWJjbGFzc2VzIChjYy5Ta2VsZXRhbEFuaW1hdGlvbiwgdXNlci1kZXJpdmVkXG4gICAgICAgICAgICAvLyBjYy5BbmltYXRpb24pLiBnZXRDb21wb25lbnQoJ2NjLkFuaW1hdGlvbicpIHJlc29sdmVzIHN1YmNsYXNzZXNcbiAgICAgICAgICAgIC8vIGNvcnJlY3RseTsgbWF0Y2hpbmcgYnkgcmVmZXJlbmNlIGlzIHRoZSBjYW5vbmljYWwgd2F5IHRvIGZpbmRcbiAgICAgICAgICAgIC8vIHRoZSBzYW1lIGluc3RhbmNlJ3Mgc2xvdCBpbiBfX2NvbXBzX18uXG4gICAgICAgICAgICBjb25zdCBhbmltID0gbm9kZS5nZXRDb21wb25lbnQoJ2NjLkFuaW1hdGlvbicpO1xuICAgICAgICAgICAgaWYgKCFhbmltKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoYE5vZGUgJHtub2RlVXVpZH0gaGFzIG5vIGNjLkFuaW1hdGlvbiBjb21wb25lbnRgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGNvbXBvbmVudHM6IGFueVtdID0gKG5vZGUuX2NvbXBvbmVudHMgPz8gbm9kZS5jb21wb25lbnRzID8/IFtdKTtcbiAgICAgICAgICAgIGNvbnN0IGNvbXBJbmRleCA9IGNvbXBvbmVudHMuaW5kZXhPZihhbmltKTtcbiAgICAgICAgICAgIGlmIChjb21wSW5kZXggPT09IC0xKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoYE5vZGUgJHtub2RlVXVpZH0gY2MuQW5pbWF0aW9uIGNvbXBvbmVudCBub3QgZm91bmQgaW4gX19jb21wc19fIGFycmF5IChjb2NvcyBlZGl0b3IgaW5jb25zaXN0ZW5jeSkuYCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBsZXQgY2xpcFV1aWQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICAgICAgICAgICAgaWYgKGNsaXBOYW1lICE9PSBudWxsICYmIGNsaXBOYW1lICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBjbGlwID0gKGFuaW0uY2xpcHMgPz8gW10pLmZpbmQoKGM6IGFueSkgPT4gYz8ubmFtZSA9PT0gY2xpcE5hbWUpO1xuICAgICAgICAgICAgICAgIGlmICghY2xpcCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFpbChgQ2xpcCAnJHtjbGlwTmFtZX0nIGlzIG5vdCByZWdpc3RlcmVkIG9uIHRoaXMgQW5pbWF0aW9uLiBLbm93bjogJHsoYW5pbS5jbGlwcyA/PyBbXSkubWFwKChjOiBhbnkpID0+IGM/Lm5hbWUpLmZpbHRlcihCb29sZWFuKS5qb2luKCcsICcpIHx8ICcobm9uZSknfS5gKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2xpcFV1aWQgPSBjbGlwLl91dWlkID8/IGNsaXAudXVpZCA/PyBudWxsO1xuICAgICAgICAgICAgICAgIGlmICghY2xpcFV1aWQpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoYENsaXAgJyR7Y2xpcE5hbWV9JyBoYXMgbm8gYXNzZXQgdXVpZDsgY2Fubm90IHBlcnNpc3QgYXMgZGVmYXVsdENsaXAuYCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIG9rKHtcbiAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50SW5kZXg6IGNvbXBJbmRleCxcbiAgICAgICAgICAgICAgICAgICAgY2xpcFV1aWQsXG4gICAgICAgICAgICAgICAgICAgIGN1cnJlbnREZWZhdWx0Q2xpcDogYW5pbS5kZWZhdWx0Q2xpcD8ubmFtZSA/PyBudWxsLFxuICAgICAgICAgICAgICAgICAgICBjdXJyZW50UGxheU9uTG9hZDogYW5pbS5wbGF5T25Mb2FkID09PSB0cnVlLFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChlcnJvcj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyb3IpKTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiB2Mi44LjAgVC1WMjgtMyAvIHYyLjguMiByZXRlc3QgZml4OiBlbnRlciAvIGV4aXQgUHJldmlldy1pbi1FZGl0b3JcbiAgICAgKiAoUElFKSBwbGF5IG1vZGUgcHJvZ3JhbW1hdGljYWxseS4gVXNlcyB0aGUgdHlwZWRcbiAgICAgKiBgY2hhbmdlUHJldmlld1BsYXlTdGF0ZShzdGF0ZTogYm9vbGVhbilgIG1ldGhvZCBkZWNsYXJlZCBvblxuICAgICAqIGBTY2VuZUZhY2FkZU1hbmFnZXJgIOKAlFxuICAgICAqIGBub2RlX21vZHVsZXMvQGNvY29zL2NyZWF0b3ItdHlwZXMvZWRpdG9yL3BhY2thZ2VzL3NjZW5lL0B0eXBlcy9jY2UvM2QvZmFjYWRlL3NjZW5lLWZhY2FkZS1tYW5hZ2VyLmQudHM6MjUwYC5cbiAgICAgKlxuICAgICAqIFBhcmFtZXRlcnM6XG4gICAgICogICBzdGF0ZSDigJQgdHJ1ZSB0byBzdGFydCBQSUUsIGZhbHNlIHRvIHN0b3AgYW5kIHJldHVybiB0byBzY2VuZSBtb2RlLlxuICAgICAqXG4gICAgICogKip2Mi44LjIgcmV0ZXN0IGZpbmRpbmcqKjogdjIuOC4wIGRpc3BhdGNoZWQgYWdhaW5zdCBgY2NlLlNjZW5lRmFjYWRlYFxuICAgICAqIChtYXRjaGluZyB0aGUgdHlwZS1kb2MgbmFtZSkgYnV0IGxpdmUgY29jb3MgZWRpdG9yIDMuOC54IGV4cG9zZXMgdGhlXG4gICAgICogcnVudGltZSBzaW5nbGV0b24gYXQgYGNjZS5TY2VuZUZhY2FkZU1hbmFnZXJgIChhbmQgLyBvclxuICAgICAqIGAuU2NlbmVGYWNhZGVNYW5hZ2VyLmluc3RhbmNlYCksIHNhbWUgY29udmVudGlvbiBhcyB0aGUgcHJlZmFiIHBhdGhcbiAgICAgKiB1c2VzIChzZWUgYGdldFByZWZhYkZhY2FkZWAgYWJvdmUpLiBQcm9iaW5nIGFsbCB0aHJlZSBjYW5kaWRhdGVzXG4gICAgICoga2VlcHMgdGhlIGNvZGUgcmVzaWxpZW50IGFjcm9zcyBjb2NvcyBidWlsZHMgd2hlcmUgdGhlIG5hbWVzcGFjZVxuICAgICAqIHNoYXBlIGRpZmZlcnMuXG4gICAgICpcbiAgICAgKiBUaGUgSEFORE9GRiBvcmlnaW5hbGx5IG5vdGVkIGBzY2VuZS9lZGl0b3ItcHJldmlldy1zZXQtcGxheWAgYXMgYW5cbiAgICAgKiB1bmRvY3VtZW50ZWQgRWRpdG9yLk1lc3NhZ2UgY2hhbm5lbDsgd2UgdXNlIHRoZSB0eXBlZCBmYWNhZGUgbWV0aG9kXG4gICAgICogaW5zdGVhZCBzbyB0aGUgY2FsbCBwYXRoIGlzIHR5cGUtY2hlY2tlZCBhZ2FpbnN0IGNyZWF0b3ItdHlwZXMgYW5kXG4gICAgICogbm90IHN1YmplY3QgdG8gc2lsZW50IHJlbW92YWwgYmV0d2VlbiBjb2NvcyB2ZXJzaW9ucy5cbiAgICAgKlxuICAgICAqIFJldHVybnMgdGhlIHN0YW5kYXJkIHNjZW5lLXNjcmlwdCBlbnZlbG9wZS4gUmVmZXJlbmNlcyB0aGVcbiAgICAgKiB0b3AtbGV2ZWwgYGNjZWAgZGVjbGFyYXRpb24gKG1hdGNoaW5nIHRoZSBwcmVmYWIgcGF0dGVybikgcmF0aGVyXG4gICAgICogdGhhbiByZWFjaGluZyB0aHJvdWdoIGBnbG9iYWxUaGlzYCBzbyB0aGUgcmVzb2x1dGlvbiBzZW1hbnRpY3NcbiAgICAgKiBtYXRjaCBvdGhlciBzY2VuZS1zY3JpcHQgbWV0aG9kcyBpbiB0aGlzIGZpbGUuXG4gICAgICovXG4gICAgYXN5bmMgY2hhbmdlUHJldmlld1BsYXlTdGF0ZShzdGF0ZTogYm9vbGVhbikge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBjY2UgPT09ICd1bmRlZmluZWQnIHx8IGNjZSA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKCdjY2UgZ2xvYmFsIGlzIG5vdCBhdmFpbGFibGU7IHRoaXMgbWV0aG9kIG11c3QgcnVuIGluIGEgc2NlbmUtc2NyaXB0IGNvbnRleHQuJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyB2Mi44LjI6IHByb2JlIHRoZSB0aHJlZSBjYW5kaWRhdGUgbG9jYXRpb25zIHRoZSBTY2VuZUZhY2FkZVxuICAgICAgICAgICAgLy8gc2luZ2xldG9uIGhhcyBiZWVuIG9ic2VydmVkIGF0IGFjcm9zcyBjb2NvcyBidWlsZHMuIFNhbWVcbiAgICAgICAgICAgIC8vIGNvbnZlbnRpb24gYXMgZ2V0UHJlZmFiRmFjYWRlLlxuICAgICAgICAgICAgY29uc3QgY2FuZGlkYXRlczogYW55W10gPSBbXG4gICAgICAgICAgICAgICAgKGNjZSBhcyBhbnkpLlNjZW5lRmFjYWRlLFxuICAgICAgICAgICAgICAgIChjY2UgYXMgYW55KS5TY2VuZUZhY2FkZU1hbmFnZXI/Lmluc3RhbmNlLFxuICAgICAgICAgICAgICAgIChjY2UgYXMgYW55KS5TY2VuZUZhY2FkZU1hbmFnZXIsXG4gICAgICAgICAgICBdO1xuICAgICAgICAgICAgY29uc3QgZmFjYWRlID0gY2FuZGlkYXRlcy5maW5kKFxuICAgICAgICAgICAgICAgIGMgPT4gYyAmJiB0eXBlb2YgYy5jaGFuZ2VQcmV2aWV3UGxheVN0YXRlID09PSAnZnVuY3Rpb24nLFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGlmICghZmFjYWRlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ05vIFNjZW5lRmFjYWRlIHdpdGggY2hhbmdlUHJldmlld1BsYXlTdGF0ZSBmb3VuZCBvbiBjY2UgKGNjZS5TY2VuZUZhY2FkZSAvIGNjZS5TY2VuZUZhY2FkZU1hbmFnZXIgLyAuaW5zdGFuY2UpLiBDb2NvcyB2ZXJzaW9uIG1heSBub3Qgc3VwcG9ydCBQSUUgY29udHJvbCB2aWEgdGhpcyBmYWNhZGUg4oCUIHVzZSB0aGUgdG9vbGJhciBwbGF5IGJ1dHRvbiBtYW51YWxseS4nKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGF3YWl0IGZhY2FkZS5jaGFuZ2VQcmV2aWV3UGxheVN0YXRlKEJvb2xlYW4oc3RhdGUpKTtcbiAgICAgICAgICAgIHJldHVybiBvayh7IHJlcXVlc3RlZFN0YXRlOiBCb29sZWFuKHN0YXRlKSB9KTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoZXJyb3I/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycm9yKSk7XG4gICAgICAgIH1cbiAgICB9LFxuXG59O1xuIl19