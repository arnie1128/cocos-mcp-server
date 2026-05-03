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
function serializeNodeTree(node, nodes, visited = new Set()) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q;
    const uuid = (_a = node === null || node === void 0 ? void 0 : node.uuid) !== null && _a !== void 0 ? _a : node === null || node === void 0 ? void 0 : node._id;
    if (typeof uuid !== 'string')
        return;
    if (visited.has(uuid))
        return;
    visited.add(uuid);
    const children = (_c = (_b = node.children) !== null && _b !== void 0 ? _b : node._children) !== null && _c !== void 0 ? _c : [];
    const position = (_f = (_d = node.position) !== null && _d !== void 0 ? _d : (_e = node.getPosition) === null || _e === void 0 ? void 0 : _e.call(node)) !== null && _f !== void 0 ? _f : {};
    const rotation = (_j = (_g = node.rotation) !== null && _g !== void 0 ? _g : (_h = node.getRotation) === null || _h === void 0 ? void 0 : _h.call(node)) !== null && _j !== void 0 ? _j : {};
    const scale = (_m = (_k = node.scale) !== null && _k !== void 0 ? _k : (_l = node.getScale) === null || _l === void 0 ? void 0 : _l.call(node)) !== null && _m !== void 0 ? _m : {};
    const components = (_p = (_o = node.components) !== null && _o !== void 0 ? _o : node._components) !== null && _p !== void 0 ? _p : [];
    nodes[uuid] = {
        uuid,
        name: (_q = node.name) !== null && _q !== void 0 ? _q : '',
        active: node.active !== false,
        position: {
            x: typeof position.x === 'number' ? position.x : 0,
            y: typeof position.y === 'number' ? position.y : 0,
            z: typeof position.z === 'number' ? position.z : 0,
        },
        rotation: {
            x: typeof rotation.x === 'number' ? rotation.x : 0,
            y: typeof rotation.y === 'number' ? rotation.y : 0,
            z: typeof rotation.z === 'number' ? rotation.z : 0,
            w: typeof rotation.w === 'number' ? rotation.w : 1,
        },
        scale: {
            x: typeof scale.x === 'number' ? scale.x : 1,
            y: typeof scale.y === 'number' ? scale.y : 1,
            z: typeof scale.z === 'number' ? scale.z : 1,
        },
        components: components.map((comp) => {
            var _a, _b, _c, _d;
            return ({
                type: (_d = (_c = (_b = (_a = comp === null || comp === void 0 ? void 0 : comp.constructor) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : comp === null || comp === void 0 ? void 0 : comp.__classname__) !== null && _c !== void 0 ? _c : comp === null || comp === void 0 ? void 0 : comp._cid) !== null && _d !== void 0 ? _d : 'Unknown',
                enabled: (comp === null || comp === void 0 ? void 0 : comp.enabled) !== false,
            });
        }),
        childUuids: children
            .map((child) => { var _a; return (_a = child === null || child === void 0 ? void 0 : child.uuid) !== null && _a !== void 0 ? _a : child === null || child === void 0 ? void 0 : child._id; })
            .filter((id) => typeof id === 'string'),
    };
    for (const child of children) {
        serializeNodeTree(child, nodes, visited);
    }
}
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
    takeSceneSnapshot() {
        var _a, _b, _c, _d;
        try {
            const { director } = require('cc');
            const scene = director.getScene();
            if (!scene) {
                return (0, response_1.fail)('No active scene');
            }
            const nodes = {};
            const children = (_b = (_a = scene.children) !== null && _a !== void 0 ? _a : scene._children) !== null && _b !== void 0 ? _b : [];
            for (const child of children) {
                serializeNodeTree(child, nodes);
            }
            return (0, response_1.ok)({
                sceneName: (_c = scene.name) !== null && _c !== void 0 ? _c : '',
                rootUuids: children.map((child) => child.uuid).filter((uuid) => typeof uuid === 'string'),
                nodes,
            });
        }
        catch (error) {
            return (0, response_1.fail)((_d = error === null || error === void 0 ? void 0 : error.message) !== null && _d !== void 0 ? _d : String(error));
        }
    },
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NlbmUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zb3VyY2Uvc2NlbmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsK0JBQTRCO0FBQzVCLDZDQUEwQztBQUMxQyxNQUFNLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFBLFdBQUksRUFBQyxNQUFNLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxjQUFjLENBQUMsQ0FBQyxDQUFDO0FBcUJ6RCxTQUFTLGVBQWU7O0lBQ3BCLElBQUksT0FBTyxHQUFHLEtBQUssV0FBVyxJQUFJLEdBQUcsS0FBSyxJQUFJLEVBQUUsQ0FBQztRQUM3QyxPQUFPLEVBQUUsRUFBRSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsNkVBQTZFLEVBQUUsQ0FBQztJQUMvRyxDQUFDO0lBQ0QsTUFBTSxVQUFVLEdBQW9DO1FBQ2hELEdBQUcsQ0FBQyxNQUFNO1FBQ1YsTUFBQSxHQUFHLENBQUMsa0JBQWtCLDBDQUFFLFFBQVE7UUFDaEMsR0FBRyxDQUFDLGtCQUE4QztLQUNyRCxDQUFDO0lBQ0YsZ0VBQWdFO0lBQ2hFLCtEQUErRDtJQUMvRCxNQUFNLFFBQVEsR0FBOEIsQ0FBQyxjQUFjLEVBQUUsYUFBYSxFQUFFLFlBQVksRUFBRSxjQUFjLEVBQUUsZUFBZSxDQUFDLENBQUM7SUFDM0gsS0FBSyxNQUFNLFNBQVMsSUFBSSxVQUFVLEVBQUUsQ0FBQztRQUNqQyxJQUFJLFNBQVMsSUFBSSxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsT0FBUSxTQUFpQixDQUFDLENBQUMsQ0FBQyxLQUFLLFVBQVUsQ0FBQyxFQUFFLENBQUM7WUFDaEYsT0FBTyxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRSxDQUFDO1FBQzFDLENBQUM7SUFDTCxDQUFDO0lBQ0QsT0FBTztRQUNILEVBQUUsRUFBRSxLQUFLO1FBQ1QsS0FBSyxFQUFFLHlLQUF5SztLQUNuTCxD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QUFjLEVBQUUsT0FBTyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNsRCxDQUFDO1FBQUMsT0FBTyxLQUFVLEVBQUUsQ0FBQztZQUNsQixPQUFPLElBQUEsZUFBSSxFQUFDLE1BQUEsS0FBSyxhQUFMLEtBQUssdUJBQUwsS0FBSyxDQUFFLE9BQU8sbUNBQUksTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFDakQsQ0FBQztJQUNMLENBQUM7Q0FFSixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgam9pbiB9IGZyb20gJ3BhdGgnO1xuaW1wb3J0IHsgb2ssIGZhaWwgfSBmcm9tICcuL2xpYi9yZXNwb25zZSc7XG5tb2R1bGUucGF0aHMucHVzaChqb2luKEVkaXRvci5BcHAucGF0aCwgJ25vZGVfbW9kdWxlcycpKTtcblxuLy8gYGNjZWAgaXMgaW5qZWN0ZWQgYnkgQ29jb3MgRWRpdG9yIGludG8gdGhlIHNjZW5lLXNjcmlwdCBnbG9iYWwgc2NvcGUuXG4vLyBJdCBpcyBub3QgZGVjbGFyZWQgaW4gYEBjb2Nvcy9jcmVhdG9yLXR5cGVzYCBleHBvcnRzOyBkZWNsYXJlIGEgbWluaW1hbFxuLy8gcnVudGltZSBzaGFwZSBqdXN0IGZvciB3aGF0IHdlIHRvdWNoIGhlcmUgc28gVHlwZVNjcmlwdCBzdGF5cyBzdHJpY3QuXG5kZWNsYXJlIGNvbnN0IGNjZTogdW5kZWZpbmVkIHwge1xuICAgIFByZWZhYj86IFByZWZhYkZhY2FkZTtcbiAgICBTY2VuZUZhY2FkZU1hbmFnZXI/OiB7IGluc3RhbmNlPzogUHJlZmFiRmFjYWRlIH0gJiBQcmVmYWJGYWNhZGU7XG59O1xuXG5pbnRlcmZhY2UgUHJlZmFiRmFjYWRlIHtcbiAgICBjcmVhdGVQcmVmYWIobm9kZVV1aWQ6IHN0cmluZywgdXJsOiBzdHJpbmcpOiBQcm9taXNlPGFueT47XG4gICAgYXBwbHlQcmVmYWIobm9kZVV1aWQ6IHN0cmluZyk6IFByb21pc2U8YW55PjtcbiAgICBsaW5rUHJlZmFiKG5vZGVVdWlkOiBzdHJpbmcsIGFzc2V0VXVpZDogc3RyaW5nKTogYW55O1xuICAgIHVubGlua1ByZWZhYihub2RlVXVpZDogc3RyaW5nLCByZW1vdmVOZXN0ZWQ6IGJvb2xlYW4pOiBhbnk7XG4gICAgZ2V0UHJlZmFiRGF0YShub2RlVXVpZDogc3RyaW5nKTogYW55O1xuICAgIHJlc3RvcmVQcmVmYWI/KHV1aWQ6IHN0cmluZywgYXNzZXRVdWlkOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+O1xufVxuXG50eXBlIEZhY2FkZUxvb2t1cCA9IHsgb2s6IHRydWU7IHZhbHVlOiBQcmVmYWJGYWNhZGUgfSB8IHsgb2s6IGZhbHNlOyBlcnJvcjogc3RyaW5nIH07XG5cbmZ1bmN0aW9uIGdldFByZWZhYkZhY2FkZSgpOiBGYWNhZGVMb29rdXAge1xuICAgIGlmICh0eXBlb2YgY2NlID09PSAndW5kZWZpbmVkJyB8fCBjY2UgPT09IG51bGwpIHtcbiAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogJ2NjZSBnbG9iYWwgaXMgbm90IGF2YWlsYWJsZTsgdGhpcyBtZXRob2QgbXVzdCBydW4gaW4gYSBzY2VuZS1zY3JpcHQgY29udGV4dCcgfTtcbiAgICB9XG4gICAgY29uc3QgY2FuZGlkYXRlczogQXJyYXk8UHJlZmFiRmFjYWRlIHwgdW5kZWZpbmVkPiA9IFtcbiAgICAgICAgY2NlLlByZWZhYixcbiAgICAgICAgY2NlLlNjZW5lRmFjYWRlTWFuYWdlcj8uaW5zdGFuY2UsXG4gICAgICAgIGNjZS5TY2VuZUZhY2FkZU1hbmFnZXIgYXMgUHJlZmFiRmFjYWRlIHwgdW5kZWZpbmVkLFxuICAgIF07XG4gICAgLy8gRW5zdXJlIHRoZSBjYW5kaWRhdGUgZXhwb3NlcyBldmVyeSBmYWNhZGUgbWV0aG9kIHdlIG1heSBjYWxsO1xuICAgIC8vIGEgcGFydGlhbCBjYW5kaWRhdGUgd291bGQgY3Jhc2ggYXQgdGhlIGZpcnN0IG1pc3NpbmcgbWV0aG9kLlxuICAgIGNvbnN0IHJlcXVpcmVkOiBBcnJheTxrZXlvZiBQcmVmYWJGYWNhZGU+ID0gWydjcmVhdGVQcmVmYWInLCAnYXBwbHlQcmVmYWInLCAnbGlua1ByZWZhYicsICd1bmxpbmtQcmVmYWInLCAnZ2V0UHJlZmFiRGF0YSddO1xuICAgIGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIGNhbmRpZGF0ZXMpIHtcbiAgICAgICAgaWYgKGNhbmRpZGF0ZSAmJiByZXF1aXJlZC5ldmVyeShtID0+IHR5cGVvZiAoY2FuZGlkYXRlIGFzIGFueSlbbV0gPT09ICdmdW5jdGlvbicpKSB7XG4gICAgICAgICAgICByZXR1cm4geyBvazogdHJ1ZSwgdmFsdWU6IGNhbmRpZGF0ZSB9O1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiB7XG4gICAgICAgIG9rOiBmYWxzZSxcbiAgICAgICAgZXJyb3I6ICdObyBjb21wbGV0ZSBwcmVmYWIgZmFjYWRlIGZvdW5kIG9uIGNjZSAoY2NlLlByZWZhYiAvIGNjZS5TY2VuZUZhY2FkZU1hbmFnZXIpLiBDb2NvcyBlZGl0b3IgYnVpbGQgbWF5IG5vdCBleHBvc2UgdGhlIGV4cGVjdGVkIG1hbmFnZXIgb3Igb25seSBleHBvc2VzIGEgcGFydGlhbCBzdXJmYWNlLicsXG4gICAgfTtcbn1cblxudHlwZSBDb21wb25lbnRMb29rdXAgPVxuICAgIHwgeyBvazogdHJ1ZTsgc2NlbmU6IGFueTsgbm9kZTogYW55OyBjb21wb25lbnQ6IGFueSB9XG4gICAgfCB7IG9rOiBmYWxzZTsgZXJyb3I6IHN0cmluZyB9O1xuXG5mdW5jdGlvbiBmaW5kTm9kZUJ5VXVpZERlZXAocm9vdDogYW55LCB1dWlkOiBzdHJpbmcpOiBhbnkge1xuICAgIGlmICghcm9vdCkgcmV0dXJuIG51bGw7XG4gICAgaWYgKHJvb3QuX2lkID09PSB1dWlkIHx8IHJvb3QudXVpZCA9PT0gdXVpZCkgcmV0dXJuIHJvb3Q7XG4gICAgY29uc3QgY2hpbGRyZW4gPSByb290LmNoaWxkcmVuID8/IHJvb3QuX2NoaWxkcmVuID8/IFtdO1xuICAgIGZvciAoY29uc3QgY2hpbGQgb2YgY2hpbGRyZW4pIHtcbiAgICAgICAgY29uc3QgaGl0ID0gZmluZE5vZGVCeVV1aWREZWVwKGNoaWxkLCB1dWlkKTtcbiAgICAgICAgaWYgKGhpdCkgcmV0dXJuIGhpdDtcbiAgICB9XG4gICAgcmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIHJlc29sdmVDb21wb25lbnRDb250ZXh0KG5vZGVVdWlkOiBzdHJpbmcsIGNvbXBvbmVudFR5cGU6IHN0cmluZyk6IENvbXBvbmVudExvb2t1cCB7XG4gICAgY29uc3QgeyBkaXJlY3RvciwganMgfSA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgY29uc3Qgc2NlbmUgPSBkaXJlY3Rvci5nZXRTY2VuZSgpO1xuICAgIGlmICghc2NlbmUpIHtcbiAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogJ05vIGFjdGl2ZSBzY2VuZScgfTtcbiAgICB9XG4gICAgLy8gc2NlbmUuZ2V0Q2hpbGRCeVV1aWQgb25seSB3YWxrcyBkaXJlY3QgY2hpbGRyZW47IHVzZSBkZXB0aC1maXJzdCBzZWFyY2guXG4gICAgY29uc3Qgbm9kZSA9IGZpbmROb2RlQnlVdWlkRGVlcChzY2VuZSwgbm9kZVV1aWQpO1xuICAgIGlmICghbm9kZSkge1xuICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBgTm9kZSB3aXRoIFVVSUQgJHtub2RlVXVpZH0gbm90IGZvdW5kYCB9O1xuICAgIH1cbiAgICBjb25zdCBDb21wb25lbnRDbGFzcyA9IGpzLmdldENsYXNzQnlOYW1lKGNvbXBvbmVudFR5cGUpO1xuICAgIGlmICghQ29tcG9uZW50Q2xhc3MpIHtcbiAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogYENvbXBvbmVudCB0eXBlICR7Y29tcG9uZW50VHlwZX0gbm90IGZvdW5kYCB9O1xuICAgIH1cbiAgICBjb25zdCBjb21wb25lbnQgPSBub2RlLmdldENvbXBvbmVudChDb21wb25lbnRDbGFzcyk7XG4gICAgaWYgKCFjb21wb25lbnQpIHtcbiAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogYENvbXBvbmVudCAke2NvbXBvbmVudFR5cGV9IG5vdCBmb3VuZCBvbiBub2RlYCB9O1xuICAgIH1cbiAgICByZXR1cm4geyBvazogdHJ1ZSwgc2NlbmUsIG5vZGUsIGNvbXBvbmVudCB9O1xufVxuXG5mdW5jdGlvbiBzZXJpYWxpemVFdmVudEhhbmRsZXIoZWg6IGFueSkge1xuICAgIGlmICghZWgpIHJldHVybiBudWxsO1xuICAgIHJldHVybiB7XG4gICAgICAgIHRhcmdldFV1aWQ6IGVoLnRhcmdldD8udXVpZCA/PyBudWxsLFxuICAgICAgICB0YXJnZXROYW1lOiBlaC50YXJnZXQ/Lm5hbWUgPz8gbnVsbCxcbiAgICAgICAgY29tcG9uZW50OiBlaC5jb21wb25lbnQgPz8gZWguX2NvbXBvbmVudE5hbWUgPz8gbnVsbCxcbiAgICAgICAgaGFuZGxlcjogZWguaGFuZGxlciA/PyBudWxsLFxuICAgICAgICBjdXN0b21FdmVudERhdGE6IGVoLmN1c3RvbUV2ZW50RGF0YSA/PyAnJyxcbiAgICB9O1xufVxuXG4vLyB2Mi40LjggQTMgKyB2Mi40LjkgKyB2Mi40LjEwIHJldmlldyBmaXg6IHNjZW5lLXNpZGUgbG9nIGNhcHR1cmVcbi8vIChSb21hUm9nb3YgcGF0dGVybiBhZGFwdGVkKS5cbi8vXG4vLyBDb25jdXJyZW5jeSBtb2RlbCDigJQgdjIuNC4xMCAoY2xhdWRlICsgY29kZXgg8J+UtCByb3VuZC0yKTpcbi8vICAgdjIuNC44IGZhbm5lZCBldmVyeSBjb25zb2xlLmxvZyB0byBBTEwgYWN0aXZlIGNhcHR1cmUgYXJyYXlzLlxuLy8gICB2Mi40LjkgYXR0ZW1wdGVkIHRvIGlzb2xhdGUgdmlhIF90b3BTbG90KCkgKGN1cnJlbnQgdG9wIG9mIHN0YWNrKVxuLy8gICBidXQgdGhhdCBvbmx5IHdvcmtlZCBmb3Igc3RyaWN0bHkgTElGTy1uZXN0ZWQgY2FsbHM7IHR3byBjYWxsc1xuLy8gICB0aGF0IGludGVybGVhdmUgdmlhIGBhd2FpdGAgY291bGQgc3RpbGwgbWlzYXR0cmlidXRlIChjYWxsIEFcbi8vICAgYXdhaXRzLCBCIHB1c2hlcyBpdHMgc2xvdCwgQSdzIHBvc3QtYXdhaXQgbG9ncyB3b3VsZCByb3V0ZSB0byBCKS5cbi8vICAgdjIuNC4xMCB1c2VzIE5vZGUncyBidWlsdC1pbiBgQXN5bmNMb2NhbFN0b3JhZ2VgIHNvIGVhY2ggY2FsbCdzXG4vLyAgIGxvZ2ljYWwgYXN5bmMgY2hhaW4ga2VlcHMgaXRzIE9XTiBzbG90IHJlZ2FyZGxlc3Mgb2Ygc3RhY2sgb3JkZXIuXG4vLyAgIFdoZW4gY29uc29sZS5sb2cgZmlyZXMsIHRoZSBob29rIHJlYWRzIEFMUy5nZXRTdG9yZSgpIOKAlCB3aGljaCBpc1xuLy8gICBib3VuZCB0byB0aGUgb3JpZ2luYXRpbmcgY2FsbCdzIGFzeW5jIGNvbnRleHQg4oCUIGFuZCB3cml0ZXMgdGhlcmUuXG4vL1xuLy8gQm91bmQg4oCUIHYyLjQuOSAoY2xhdWRlICsgY29kZXgg8J+foSk6XG4vLyAgIENhcCBlbnRyaWVzIHBlciBjYXB0dXJlIChkZWZhdWx0IDUwMCkgYW5kIHRvdGFsIGJ5dGVzIChkZWZhdWx0XG4vLyAgIDY0IEtCKS4gRXhjZXNzIGVudHJpZXMgYXJlIGRyb3BwZWQ7IGEgc2luZ2xlIGBbY2FwdHVyZSB0cnVuY2F0ZWRdYFxuLy8gICBtYXJrZXIgaXMgYXBwZW5kZWQgb25jZS4gdjIuNC4xMDogbWFya2VyIGJ5dGVzIGNvdW50ZWQgYWdhaW5zdFxuLy8gICB0aGUgY2FwIChjb2RleCByb3VuZC0yIPCfn6EpIHNvIHRoZSBzbG90J3MgYnl0ZXMgZmllbGQgc3RheXNcbi8vICAgbW9ub3RvbmljYWxseSBhY2N1cmF0ZS5cbi8vXG4vLyBIb29rIGxpZmVjeWNsZTpcbi8vICAgVGhlIGNvbnNvbGUgaG9vayBpcyBpbnN0YWxsZWQgb24gZmlyc3QgYHJ1bldpdGhDYXB0dXJlYCBpbnZvY2F0aW9uXG4vLyAgIGFuZCB1bmluc3RhbGxlZCB3aGVuIG5vIHNsb3QgaXMgYWN0aXZlLiBFYWNoIGludm9jYXRpb24gYGFscy5ydW4oKWBzXG4vLyAgIHdpdGggaXRzIHNsb3QsIHNvIHRoZSBob29rIGp1c3QgcmVhZHMgdGhlIHN0b3JlLiBXZSBzdGlsbCBrZWVwXG4vLyAgIGBfYWN0aXZlU2xvdENvdW50YCBhcyBhIHJlZmNvdW50IHRvIGtub3cgd2hlbiB0byB1bmhvb2sgKEFMU1xuLy8gICBkb2Vzbid0IGV4cG9zZSBzdG9yZSBjb3VudCBkaXJlY3RseSkuXG5pbXBvcnQgeyBBc3luY0xvY2FsU3RvcmFnZSB9IGZyb20gJ2FzeW5jX2hvb2tzJztcblxudHlwZSBDYXB0dXJlZEVudHJ5ID0geyBsZXZlbDogJ2xvZycgfCAnd2FybicgfCAnZXJyb3InOyBtZXNzYWdlOiBzdHJpbmc7IHRzOiBudW1iZXIgfTtcbnR5cGUgQ29uc29sZVNuYXBzaG90ID0geyBsb2c6IHR5cGVvZiBjb25zb2xlLmxvZzsgd2FybjogdHlwZW9mIGNvbnNvbGUud2FybjsgZXJyb3I6IHR5cGVvZiBjb25zb2xlLmVycm9yIH07XG5cbmludGVyZmFjZSBDYXB0dXJlU2xvdCB7XG4gICAgZW50cmllczogQ2FwdHVyZWRFbnRyeVtdO1xuICAgIGJ5dGVzOiBudW1iZXI7XG4gICAgdHJ1bmNhdGVkOiBib29sZWFuO1xufVxuXG5pbnRlcmZhY2UgU25hcHNob3ROb2RlIHtcbiAgICB1dWlkOiBzdHJpbmc7XG4gICAgbmFtZTogc3RyaW5nO1xuICAgIGFjdGl2ZTogYm9vbGVhbjtcbiAgICBwb3NpdGlvbjogeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgejogbnVtYmVyIH07XG4gICAgcm90YXRpb246IHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHo6IG51bWJlcjsgdzogbnVtYmVyIH07XG4gICAgc2NhbGU6IHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHo6IG51bWJlciB9O1xuICAgIGNvbXBvbmVudHM6IEFycmF5PHsgdHlwZTogc3RyaW5nOyBlbmFibGVkOiBib29sZWFuIH0+O1xuICAgIGNoaWxkVXVpZHM6IHN0cmluZ1tdO1xufVxuXG5mdW5jdGlvbiBzZXJpYWxpemVOb2RlVHJlZShub2RlOiBhbnksIG5vZGVzOiBSZWNvcmQ8c3RyaW5nLCBTbmFwc2hvdE5vZGU+LCB2aXNpdGVkID0gbmV3IFNldDxzdHJpbmc+KCkpOiB2b2lkIHtcbiAgICBjb25zdCB1dWlkID0gbm9kZT8udXVpZCA/PyBub2RlPy5faWQ7XG4gICAgaWYgKHR5cGVvZiB1dWlkICE9PSAnc3RyaW5nJykgcmV0dXJuO1xuICAgIGlmICh2aXNpdGVkLmhhcyh1dWlkKSkgcmV0dXJuO1xuICAgIHZpc2l0ZWQuYWRkKHV1aWQpO1xuXG4gICAgY29uc3QgY2hpbGRyZW4gPSBub2RlLmNoaWxkcmVuID8/IG5vZGUuX2NoaWxkcmVuID8/IFtdO1xuICAgIGNvbnN0IHBvc2l0aW9uID0gbm9kZS5wb3NpdGlvbiA/PyBub2RlLmdldFBvc2l0aW9uPy4oKSA/PyB7fTtcbiAgICBjb25zdCByb3RhdGlvbiA9IG5vZGUucm90YXRpb24gPz8gbm9kZS5nZXRSb3RhdGlvbj8uKCkgPz8ge307XG4gICAgY29uc3Qgc2NhbGUgPSBub2RlLnNjYWxlID8/IG5vZGUuZ2V0U2NhbGU/LigpID8/IHt9O1xuICAgIGNvbnN0IGNvbXBvbmVudHMgPSBub2RlLmNvbXBvbmVudHMgPz8gbm9kZS5fY29tcG9uZW50cyA/PyBbXTtcblxuICAgIG5vZGVzW3V1aWRdID0ge1xuICAgICAgICB1dWlkLFxuICAgICAgICBuYW1lOiBub2RlLm5hbWUgPz8gJycsXG4gICAgICAgIGFjdGl2ZTogbm9kZS5hY3RpdmUgIT09IGZhbHNlLFxuICAgICAgICBwb3NpdGlvbjoge1xuICAgICAgICAgICAgeDogdHlwZW9mIHBvc2l0aW9uLnggPT09ICdudW1iZXInID8gcG9zaXRpb24ueCA6IDAsXG4gICAgICAgICAgICB5OiB0eXBlb2YgcG9zaXRpb24ueSA9PT0gJ251bWJlcicgPyBwb3NpdGlvbi55IDogMCxcbiAgICAgICAgICAgIHo6IHR5cGVvZiBwb3NpdGlvbi56ID09PSAnbnVtYmVyJyA/IHBvc2l0aW9uLnogOiAwLFxuICAgICAgICB9LFxuICAgICAgICByb3RhdGlvbjoge1xuICAgICAgICAgICAgeDogdHlwZW9mIHJvdGF0aW9uLnggPT09ICdudW1iZXInID8gcm90YXRpb24ueCA6IDAsXG4gICAgICAgICAgICB5OiB0eXBlb2Ygcm90YXRpb24ueSA9PT0gJ251bWJlcicgPyByb3RhdGlvbi55IDogMCxcbiAgICAgICAgICAgIHo6IHR5cGVvZiByb3RhdGlvbi56ID09PSAnbnVtYmVyJyA/IHJvdGF0aW9uLnogOiAwLFxuICAgICAgICAgICAgdzogdHlwZW9mIHJvdGF0aW9uLncgPT09ICdudW1iZXInID8gcm90YXRpb24udyA6IDEsXG4gICAgICAgIH0sXG4gICAgICAgIHNjYWxlOiB7XG4gICAgICAgICAgICB4OiB0eXBlb2Ygc2NhbGUueCA9PT0gJ251bWJlcicgPyBzY2FsZS54IDogMSxcbiAgICAgICAgICAgIHk6IHR5cGVvZiBzY2FsZS55ID09PSAnbnVtYmVyJyA/IHNjYWxlLnkgOiAxLFxuICAgICAgICAgICAgejogdHlwZW9mIHNjYWxlLnogPT09ICdudW1iZXInID8gc2NhbGUueiA6IDEsXG4gICAgICAgIH0sXG4gICAgICAgIGNvbXBvbmVudHM6IGNvbXBvbmVudHMubWFwKChjb21wOiBhbnkpID0+ICh7XG4gICAgICAgICAgICB0eXBlOiBjb21wPy5jb25zdHJ1Y3Rvcj8ubmFtZSA/PyBjb21wPy5fX2NsYXNzbmFtZV9fID8/IGNvbXA/Ll9jaWQgPz8gJ1Vua25vd24nLFxuICAgICAgICAgICAgZW5hYmxlZDogY29tcD8uZW5hYmxlZCAhPT0gZmFsc2UsXG4gICAgICAgIH0pKSxcbiAgICAgICAgY2hpbGRVdWlkczogY2hpbGRyZW5cbiAgICAgICAgICAgIC5tYXAoKGNoaWxkOiBhbnkpID0+IGNoaWxkPy51dWlkID8/IGNoaWxkPy5faWQpXG4gICAgICAgICAgICAuZmlsdGVyKChpZDogYW55KSA9PiB0eXBlb2YgaWQgPT09ICdzdHJpbmcnKSxcbiAgICB9O1xuXG4gICAgZm9yIChjb25zdCBjaGlsZCBvZiBjaGlsZHJlbikge1xuICAgICAgICBzZXJpYWxpemVOb2RlVHJlZShjaGlsZCwgbm9kZXMsIHZpc2l0ZWQpO1xuICAgIH1cbn1cblxuY29uc3QgQ0FQVFVSRV9NQVhfRU5UUklFUyA9IDUwMDtcbmNvbnN0IENBUFRVUkVfTUFYX0JZVEVTID0gNjQgKiAxMDI0O1xuY29uc3QgX2NhcHR1cmVBTFMgPSBuZXcgQXN5bmNMb2NhbFN0b3JhZ2U8Q2FwdHVyZVNsb3Q+KCk7XG5sZXQgX2FjdGl2ZVNsb3RDb3VudCA9IDA7XG5sZXQgX29yaWdDb25zb2xlOiBDb25zb2xlU25hcHNob3QgfCBudWxsID0gbnVsbDtcblxuZnVuY3Rpb24gX2Zvcm1hdEFyZ3MoYTogdW5rbm93bltdKTogc3RyaW5nIHtcbiAgICByZXR1cm4gYVxuICAgICAgICAubWFwKHggPT4ge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiB4ID09PSAnc3RyaW5nJykgcmV0dXJuIHg7XG4gICAgICAgICAgICB0cnkgeyByZXR1cm4gSlNPTi5zdHJpbmdpZnkoeCk7IH0gY2F0Y2ggeyByZXR1cm4gU3RyaW5nKHgpOyB9XG4gICAgICAgIH0pXG4gICAgICAgIC5qb2luKCcgJyk7XG59XG5cbmZ1bmN0aW9uIF9hcHBlbmRCb3VuZGVkKHNsb3Q6IENhcHR1cmVTbG90LCBlbnRyeTogQ2FwdHVyZWRFbnRyeSk6IHZvaWQge1xuICAgIGlmIChzbG90LnRydW5jYXRlZCkgcmV0dXJuO1xuICAgIGNvbnN0IGVudHJ5Qnl0ZXMgPSBlbnRyeS5tZXNzYWdlLmxlbmd0aCArIDMyOyAvLyB+bGV2ZWwgKyB0cyBvdmVyaGVhZFxuICAgIGlmIChzbG90LmVudHJpZXMubGVuZ3RoID49IENBUFRVUkVfTUFYX0VOVFJJRVMgfHwgc2xvdC5ieXRlcyArIGVudHJ5Qnl0ZXMgPiBDQVBUVVJFX01BWF9CWVRFUykge1xuICAgICAgICBzbG90LnRydW5jYXRlZCA9IHRydWU7XG4gICAgICAgIGNvbnN0IG1hcmtlcjogQ2FwdHVyZWRFbnRyeSA9IHsgbGV2ZWw6ICd3YXJuJywgbWVzc2FnZTogJ1tjYXB0dXJlIHRydW5jYXRlZCDigJQgZXhjZWVkZWQgZW50cnkvYnl0ZSBjYXBdJywgdHM6IERhdGUubm93KCkgfTtcbiAgICAgICAgc2xvdC5lbnRyaWVzLnB1c2gobWFya2VyKTtcbiAgICAgICAgLy8gdjIuNC4xMCBjb2RleCByb3VuZC0yIPCfn6E6IHRyYWNrIG1hcmtlciBieXRlcyB0b28gc28gY2FwIGFjY291bnRpbmdcbiAgICAgICAgLy8gc3RheXMgYWNjdXJhdGUgZXZlbiB0aG91Z2ggbm8gZnVydGhlciBhcHBlbmRzIHdpbGwgZm9sbG93LlxuICAgICAgICBzbG90LmJ5dGVzICs9IG1hcmtlci5tZXNzYWdlLmxlbmd0aCArIDMyO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIHNsb3QuZW50cmllcy5wdXNoKGVudHJ5KTtcbiAgICBzbG90LmJ5dGVzICs9IGVudHJ5Qnl0ZXM7XG59XG5cbmZ1bmN0aW9uIF9lbnN1cmVDb25zb2xlSG9vaygpOiB2b2lkIHtcbiAgICBpZiAoX29yaWdDb25zb2xlKSByZXR1cm47XG4gICAgX29yaWdDb25zb2xlID0geyBsb2c6IGNvbnNvbGUubG9nLCB3YXJuOiBjb25zb2xlLndhcm4sIGVycm9yOiBjb25zb2xlLmVycm9yIH07XG4gICAgY29uc3QgbWFrZSA9IChsZXZlbDogQ2FwdHVyZWRFbnRyeVsnbGV2ZWwnXSwgb3JpZzogKC4uLmE6IGFueVtdKSA9PiB2b2lkKSA9PlxuICAgICAgICAoLi4uYTogYW55W10pOiB2b2lkID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHNsb3QgPSBfY2FwdHVyZUFMUy5nZXRTdG9yZSgpO1xuICAgICAgICAgICAgaWYgKHNsb3QpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBtZXNzYWdlID0gX2Zvcm1hdEFyZ3MoYSk7XG4gICAgICAgICAgICAgICAgX2FwcGVuZEJvdW5kZWQoc2xvdCwgeyBsZXZlbCwgbWVzc2FnZSwgdHM6IERhdGUubm93KCkgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0cnkgeyBvcmlnLmFwcGx5KGNvbnNvbGUsIGEpOyB9IGNhdGNoIHsgLyogc3dhbGxvdyAqLyB9XG4gICAgICAgIH07XG4gICAgY29uc29sZS5sb2cgPSBtYWtlKCdsb2cnLCBfb3JpZ0NvbnNvbGUubG9nKTtcbiAgICBjb25zb2xlLndhcm4gPSBtYWtlKCd3YXJuJywgX29yaWdDb25zb2xlLndhcm4pO1xuICAgIGNvbnNvbGUuZXJyb3IgPSBtYWtlKCdlcnJvcicsIF9vcmlnQ29uc29sZS5lcnJvcik7XG59XG5cbmZ1bmN0aW9uIF9tYXliZVVuaG9va0NvbnNvbGUoKTogdm9pZCB7XG4gICAgaWYgKF9hY3RpdmVTbG90Q291bnQgPiAwIHx8ICFfb3JpZ0NvbnNvbGUpIHJldHVybjtcbiAgICBjb25zb2xlLmxvZyA9IF9vcmlnQ29uc29sZS5sb2c7XG4gICAgY29uc29sZS53YXJuID0gX29yaWdDb25zb2xlLndhcm47XG4gICAgY29uc29sZS5lcnJvciA9IF9vcmlnQ29uc29sZS5lcnJvcjtcbiAgICBfb3JpZ0NvbnNvbGUgPSBudWxsO1xufVxuXG5leHBvcnQgY29uc3QgbWV0aG9kczogeyBba2V5OiBzdHJpbmddOiAoLi4uYW55OiBhbnkpID0+IGFueSB9ID0ge1xuICAgIHRha2VTY2VuZVNuYXBzaG90KCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgeyBkaXJlY3RvciB9ID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICAgICAgICAgIGlmICghc2NlbmUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFpbCgnTm8gYWN0aXZlIHNjZW5lJyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IG5vZGVzOiBSZWNvcmQ8c3RyaW5nLCBTbmFwc2hvdE5vZGU+ID0ge307XG4gICAgICAgICAgICBjb25zdCBjaGlsZHJlbiA9IHNjZW5lLmNoaWxkcmVuID8/IHNjZW5lLl9jaGlsZHJlbiA/PyBbXTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgY2hpbGQgb2YgY2hpbGRyZW4pIHtcbiAgICAgICAgICAgICAgICBzZXJpYWxpemVOb2RlVHJlZShjaGlsZCwgbm9kZXMpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gb2soe1xuICAgICAgICAgICAgICAgICAgICBzY2VuZU5hbWU6IHNjZW5lLm5hbWUgPz8gJycsXG4gICAgICAgICAgICAgICAgICAgIHJvb3RVdWlkczogY2hpbGRyZW4ubWFwKChjaGlsZDogYW55KSA9PiBjaGlsZC51dWlkKS5maWx0ZXIoKHV1aWQ6IGFueSkgPT4gdHlwZW9mIHV1aWQgPT09ICdzdHJpbmcnKSxcbiAgICAgICAgICAgICAgICAgICAgbm9kZXMsXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGVycm9yPy5tZXNzYWdlID8/IFN0cmluZyhlcnJvcikpO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIHYyLjQuOCBBMzogaW52b2tlIGFub3RoZXIgc2NlbmUtc2NyaXB0IG1ldGhvZCBieSBuYW1lLCBjYXB0dXJpbmdcbiAgICAgKiBjb25zb2xlLntsb2csd2FybixlcnJvcn0gZHVyaW5nIHRoZSBjYWxsIGFuZCByZXR1cm5pbmcgY2FwdHVyZWRMb2dzXG4gICAgICogYWxvbmdzaWRlIHRoZSBtZXRob2QncyBub3JtYWwgcmV0dXJuIGVudmVsb3BlLiBTaW5nbGUgcm91bmQtdHJpcC5cbiAgICAgKlxuICAgICAqIEJlaGF2aW91cjpcbiAgICAgKiAgLSBJZiBgbWV0aG9kTmFtZWAgZG9lcyBub3QgZXhpc3QsIHJldHVybnNcbiAgICAgKiAgICBgeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IFwiLi4uXCIgLCBjYXB0dXJlZExvZ3M6IFtdIH1gIChlbXB0eSkuXG4gICAgICogIC0gSWYgdGhlIGlubmVyIG1ldGhvZCB0aHJvd3MsIHRoZSB0aHJvdyBpcyBjYXVnaHQgYW5kIGNvbnZlcnRlZCB0b1xuICAgICAqICAgIGB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvciwgY2FwdHVyZWRMb2dzIH1gIHNvIHRoZSBob3N0IGFsd2F5cyBzZWVzXG4gICAgICogICAgYSBzdHJ1Y3R1cmVkIGVudmVsb3BlIHBsdXMgdGhlIGxvZ3MgdGhhdCByYW4gdXAgdG8gdGhlIHRocm93LlxuICAgICAqICAtIElmIHRoZSBpbm5lciBtZXRob2QgcmV0dXJucyBhbiBvYmplY3QsIGNhcHR1cmVkTG9ncyBpcyBtZXJnZWRcbiAgICAgKiAgICBhbG9uZ3NpZGUgaXRzIGtleXMgd2l0aG91dCBvdmVyd3JpdGluZyAod2UgdXNlIGA/PyBjYXB0dXJlc2BcbiAgICAgKiAgICBzZW1hbnRpY3M6IG9ubHkgc2V0IGlmIG5vdCBhbHJlYWR5IHByZXNlbnQpLlxuICAgICAqL1xuICAgIGFzeW5jIHJ1bldpdGhDYXB0dXJlKG1ldGhvZE5hbWU6IHN0cmluZywgbWV0aG9kQXJncz86IHVua25vd25bXSkge1xuICAgICAgICBjb25zdCBzbG90OiBDYXB0dXJlU2xvdCA9IHtcbiAgICAgICAgICAgIGVudHJpZXM6IFtdLFxuICAgICAgICAgICAgYnl0ZXM6IDAsXG4gICAgICAgICAgICB0cnVuY2F0ZWQ6IGZhbHNlLFxuICAgICAgICB9O1xuICAgICAgICAvLyB2Mi40LjExIHJvdW5kLTMgY29kZXgg8J+UtCArIGNsYXVkZSDwn5+hICsgZ2VtaW5pIPCfn6E6IGtlZXAgaW5jcmVtZW50XG4gICAgICAgIC8vIE9VVFNJREUgdGhlIHRyeSAobnVtZXJpYyBgKz0gMWAgaXMgaW5mYWxsaWJsZSwgbXVzdCBwYWlyIDE6MSB3aXRoXG4gICAgICAgIC8vIGZpbmFsbHkgZGVjcmVtZW50KSwgYnV0IG1vdmUgX2Vuc3VyZUNvbnNvbGVIb29rIElOU0lERSBzbyBhXG4gICAgICAgIC8vIHRocm93IHRoZXJlICh0b2RheTogcHVyZSBhc3NpZ25tZW50cywgc28gc2FmZTsgZGVmZW5zaXZlIGFnYWluc3RcbiAgICAgICAgLy8gZnV0dXJlIGdyb3d0aCkgY2Fubm90IGxlYWsgdGhlIHJlZmNvdW50IGFuZCBsZWF2ZSB0aGUgY29uc29sZVxuICAgICAgICAvLyBob29rIGluc3RhbGxlZCBmb3JldmVyLlxuICAgICAgICBfYWN0aXZlU2xvdENvdW50ICs9IDE7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBfZW5zdXJlQ29uc29sZUhvb2soKTtcbiAgICAgICAgICAgIC8vIHYyLjQuMTAgcm91bmQtMiBjb2RleCDwn5S0ICsgY2xhdWRlIPCfn6EgKyBnZW1pbmkg8J+foTogQXN5bmNMb2NhbFN0b3JhZ2VcbiAgICAgICAgICAgIC8vIGJpbmRzIGBzbG90YCB0byB0aGlzIGNhbGwncyBsb2dpY2FsIGFzeW5jIGNvbnRleHQsIHNvIGFueVxuICAgICAgICAgICAgLy8gY29uc29sZS5sb2cgZW1pdHRlZCBieSB0aGUgaW5uZXIgbWV0aG9kIChvciBhbnkgZGVzY2VuZGFudFxuICAgICAgICAgICAgLy8gbWljcm90YXNrLCBldmVuIGFmdGVyIGBhd2FpdGAgYm91bmRhcmllcyB3aGVuIG90aGVyIGNhbGxzIGFyZVxuICAgICAgICAgICAgLy8gYWxzbyBhY3RpdmUpIHJvdXRlcyB0byBUSElTIHNsb3Qg4oCUIG5vdCB3aGljaGV2ZXIgd2FzXG4gICAgICAgICAgICAvLyB0b3Atb2Ytc3RhY2sgYXQgdGhlIG1vbWVudCB0aGUgbG9nIGZpcmVkLiBFbGltaW5hdGVzXG4gICAgICAgICAgICAvLyBjcm9zcy1jYWxsIGxlYWthZ2UgZnJvbSBpbnRlcmxlYXZlZCBhc3luYyBydW5zLlxuICAgICAgICAgICAgcmV0dXJuIGF3YWl0IF9jYXB0dXJlQUxTLnJ1bihzbG90LCBhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgZm4gPSBtZXRob2RzW21ldGhvZE5hbWVdO1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgZm4gIT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgLi4uZmFpbChgcnVuV2l0aENhcHR1cmU6IG1ldGhvZCAke21ldGhvZE5hbWV9IG5vdCBmb3VuZGApLCBjYXB0dXJlZExvZ3M6IHNsb3QuZW50cmllcyB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBmbiguLi4obWV0aG9kQXJncyA/PyBbXSkpO1xuICAgICAgICAgICAgICAgICAgICBpZiAocmVzdWx0ICYmIHR5cGVvZiByZXN1bHQgPT09ICdvYmplY3QnICYmICFBcnJheS5pc0FycmF5KHJlc3VsdCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB7IC4uLnJlc3VsdCwgY2FwdHVyZWRMb2dzOiAocmVzdWx0IGFzIGFueSkuY2FwdHVyZWRMb2dzID8/IHNsb3QuZW50cmllcyB9O1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7IC4uLm9rKHJlc3VsdCksIGNhcHR1cmVkTG9nczogc2xvdC5lbnRyaWVzIH07XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgLi4uZmFpbChlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycikpLCBjYXB0dXJlZExvZ3M6IHNsb3QuZW50cmllcyB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgICAgX2FjdGl2ZVNsb3RDb3VudCA9IE1hdGgubWF4KDAsIF9hY3RpdmVTbG90Q291bnQgLSAxKTtcbiAgICAgICAgICAgIF9tYXliZVVuaG9va0NvbnNvbGUoKTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBBZGQgY29tcG9uZW50IHRvIGEgbm9kZVxuICAgICAqL1xuICAgIGFkZENvbXBvbmVudFRvTm9kZShub2RlVXVpZDogc3RyaW5nLCBjb21wb25lbnRUeXBlOiBzdHJpbmcpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IsIGpzIH0gPSByZXF1aXJlKCdjYycpO1xuICAgICAgICAgICAgY29uc3Qgc2NlbmUgPSBkaXJlY3Rvci5nZXRTY2VuZSgpO1xuICAgICAgICAgICAgaWYgKCFzY2VuZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKCdObyBhY3RpdmUgc2NlbmUnKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gRmluZCBub2RlIGJ5IFVVSURcbiAgICAgICAgICAgIGNvbnN0IG5vZGUgPSBzY2VuZS5nZXRDaGlsZEJ5VXVpZChub2RlVXVpZCk7XG4gICAgICAgICAgICBpZiAoIW5vZGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFpbChgTm9kZSB3aXRoIFVVSUQgJHtub2RlVXVpZH0gbm90IGZvdW5kYCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIEdldCBjb21wb25lbnQgY2xhc3NcbiAgICAgICAgICAgIGNvbnN0IENvbXBvbmVudENsYXNzID0ganMuZ2V0Q2xhc3NCeU5hbWUoY29tcG9uZW50VHlwZSk7XG4gICAgICAgICAgICBpZiAoIUNvbXBvbmVudENsYXNzKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoYENvbXBvbmVudCB0eXBlICR7Y29tcG9uZW50VHlwZX0gbm90IGZvdW5kYCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIEFkZCBjb21wb25lbnRcbiAgICAgICAgICAgIGNvbnN0IGNvbXBvbmVudCA9IG5vZGUuYWRkQ29tcG9uZW50KENvbXBvbmVudENsYXNzKTtcbiAgICAgICAgICAgIHJldHVybiBvayh7IGNvbXBvbmVudElkOiBjb21wb25lbnQudXVpZCB9LCBgQ29tcG9uZW50ICR7Y29tcG9uZW50VHlwZX0gYWRkZWQgc3VjY2Vzc2Z1bGx5YCk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGVycm9yLm1lc3NhZ2UpO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIENyZWF0ZSBhIG5ldyBub2RlXG4gICAgICovXG4gICAgY3JlYXRlTm9kZShuYW1lOiBzdHJpbmcsIHBhcmVudFV1aWQ/OiBzdHJpbmcpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IsIE5vZGUgfSA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgICAgICBpZiAoIXNjZW5lKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ05vIGFjdGl2ZSBzY2VuZScpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBub2RlID0gbmV3IE5vZGUobmFtZSk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmIChwYXJlbnRVdWlkKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcGFyZW50ID0gc2NlbmUuZ2V0Q2hpbGRCeVV1aWQocGFyZW50VXVpZCk7XG4gICAgICAgICAgICAgICAgaWYgKHBhcmVudCkge1xuICAgICAgICAgICAgICAgICAgICBwYXJlbnQuYWRkQ2hpbGQobm9kZSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgc2NlbmUuYWRkQ2hpbGQobm9kZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBzY2VuZS5hZGRDaGlsZChub2RlKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIG9rKHsgdXVpZDogbm9kZS51dWlkLCBuYW1lOiBub2RlLm5hbWUgfSwgYE5vZGUgJHtuYW1lfSBjcmVhdGVkIHN1Y2Nlc3NmdWxseWApO1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChlcnJvci5tZXNzYWdlKTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBHZXQgbm9kZSBpbmZvcm1hdGlvblxuICAgICAqL1xuICAgIGdldE5vZGVJbmZvKG5vZGVVdWlkOiBzdHJpbmcpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IgfSA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgICAgICBpZiAoIXNjZW5lKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ05vIGFjdGl2ZSBzY2VuZScpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBub2RlID0gc2NlbmUuZ2V0Q2hpbGRCeVV1aWQobm9kZVV1aWQpO1xuICAgICAgICAgICAgaWYgKCFub2RlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoYE5vZGUgd2l0aCBVVUlEICR7bm9kZVV1aWR9IG5vdCBmb3VuZGApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gb2soe1xuICAgICAgICAgICAgICAgIHV1aWQ6IG5vZGUudXVpZCxcbiAgICAgICAgICAgICAgICBuYW1lOiBub2RlLm5hbWUsXG4gICAgICAgICAgICAgICAgYWN0aXZlOiBub2RlLmFjdGl2ZSxcbiAgICAgICAgICAgICAgICBwb3NpdGlvbjogbm9kZS5wb3NpdGlvbixcbiAgICAgICAgICAgICAgICByb3RhdGlvbjogbm9kZS5yb3RhdGlvbixcbiAgICAgICAgICAgICAgICBzY2FsZTogbm9kZS5zY2FsZSxcbiAgICAgICAgICAgICAgICBwYXJlbnQ6IG5vZGUucGFyZW50Py51dWlkLFxuICAgICAgICAgICAgICAgIGNoaWxkcmVuOiBub2RlLmNoaWxkcmVuLm1hcCgoY2hpbGQ6IGFueSkgPT4gY2hpbGQudXVpZCksXG4gICAgICAgICAgICAgICAgY29tcG9uZW50czogbm9kZS5jb21wb25lbnRzLm1hcCgoY29tcDogYW55KSA9PiAoe1xuICAgICAgICAgICAgICAgICAgICB0eXBlOiBjb21wLmNvbnN0cnVjdG9yLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgIGVuYWJsZWQ6IGNvbXAuZW5hYmxlZFxuICAgICAgICAgICAgICAgIH0pKVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGVycm9yLm1lc3NhZ2UpO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEdldCBhbGwgbm9kZXMgaW4gc2NlbmVcbiAgICAgKi9cbiAgICBnZXRBbGxOb2RlcygpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IgfSA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgICAgICBpZiAoIXNjZW5lKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ05vIGFjdGl2ZSBzY2VuZScpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBub2RlczogYW55W10gPSBbXTtcbiAgICAgICAgICAgIGNvbnN0IGNvbGxlY3ROb2RlcyA9IChub2RlOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBub2Rlcy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgdXVpZDogbm9kZS51dWlkLFxuICAgICAgICAgICAgICAgICAgICBuYW1lOiBub2RlLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgIGFjdGl2ZTogbm9kZS5hY3RpdmUsXG4gICAgICAgICAgICAgICAgICAgIHBhcmVudDogbm9kZS5wYXJlbnQ/LnV1aWRcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBub2RlLmNoaWxkcmVuLmZvckVhY2goKGNoaWxkOiBhbnkpID0+IGNvbGxlY3ROb2RlcyhjaGlsZCkpO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgc2NlbmUuY2hpbGRyZW4uZm9yRWFjaCgoY2hpbGQ6IGFueSkgPT4gY29sbGVjdE5vZGVzKGNoaWxkKSk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHJldHVybiBvayhub2Rlcyk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGVycm9yLm1lc3NhZ2UpO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEZpbmQgbm9kZSBieSBuYW1lXG4gICAgICovXG4gICAgZmluZE5vZGVCeU5hbWUobmFtZTogc3RyaW5nKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCB7IGRpcmVjdG9yIH0gPSByZXF1aXJlKCdjYycpO1xuICAgICAgICAgICAgY29uc3Qgc2NlbmUgPSBkaXJlY3Rvci5nZXRTY2VuZSgpO1xuICAgICAgICAgICAgaWYgKCFzY2VuZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKCdObyBhY3RpdmUgc2NlbmUnKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3Qgbm9kZSA9IHNjZW5lLmdldENoaWxkQnlOYW1lKG5hbWUpO1xuICAgICAgICAgICAgaWYgKCFub2RlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoYE5vZGUgd2l0aCBuYW1lICR7bmFtZX0gbm90IGZvdW5kYCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgdXVpZDogbm9kZS51dWlkLFxuICAgICAgICAgICAgICAgIG5hbWU6IG5vZGUubmFtZSxcbiAgICAgICAgICAgICAgICBhY3RpdmU6IG5vZGUuYWN0aXZlLFxuICAgICAgICAgICAgICAgIHBvc2l0aW9uOiBub2RlLnBvc2l0aW9uXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoZXJyb3IubWVzc2FnZSk7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogR2V0IGN1cnJlbnQgc2NlbmUgaW5mb3JtYXRpb25cbiAgICAgKi9cbiAgICBnZXRDdXJyZW50U2NlbmVJbmZvKCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgeyBkaXJlY3RvciB9ID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICAgICAgICAgIGlmICghc2NlbmUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFpbCgnTm8gYWN0aXZlIHNjZW5lJyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgbmFtZTogc2NlbmUubmFtZSxcbiAgICAgICAgICAgICAgICB1dWlkOiBzY2VuZS51dWlkLFxuICAgICAgICAgICAgICAgIG5vZGVDb3VudDogc2NlbmUuY2hpbGRyZW4ubGVuZ3RoXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoZXJyb3IubWVzc2FnZSk7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogU2V0IG5vZGUgcHJvcGVydHlcbiAgICAgKi9cbiAgICBzZXROb2RlUHJvcGVydHkobm9kZVV1aWQ6IHN0cmluZywgcHJvcGVydHk6IHN0cmluZywgdmFsdWU6IGFueSkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgeyBkaXJlY3RvciB9ID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICAgICAgICAgIGlmICghc2NlbmUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFpbCgnTm8gYWN0aXZlIHNjZW5lJyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IG5vZGUgPSBzY2VuZS5nZXRDaGlsZEJ5VXVpZChub2RlVXVpZCk7XG4gICAgICAgICAgICBpZiAoIW5vZGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFpbChgTm9kZSB3aXRoIFVVSUQgJHtub2RlVXVpZH0gbm90IGZvdW5kYCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIOioree9ruWxrOaAp1xuICAgICAgICAgICAgaWYgKHByb3BlcnR5ID09PSAncG9zaXRpb24nKSB7XG4gICAgICAgICAgICAgICAgbm9kZS5zZXRQb3NpdGlvbih2YWx1ZS54IHx8IDAsIHZhbHVlLnkgfHwgMCwgdmFsdWUueiB8fCAwKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHkgPT09ICdyb3RhdGlvbicpIHtcbiAgICAgICAgICAgICAgICBub2RlLnNldFJvdGF0aW9uRnJvbUV1bGVyKHZhbHVlLnggfHwgMCwgdmFsdWUueSB8fCAwLCB2YWx1ZS56IHx8IDApO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eSA9PT0gJ3NjYWxlJykge1xuICAgICAgICAgICAgICAgIG5vZGUuc2V0U2NhbGUodmFsdWUueCB8fCAxLCB2YWx1ZS55IHx8IDEsIHZhbHVlLnogfHwgMSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5ID09PSAnYWN0aXZlJykge1xuICAgICAgICAgICAgICAgIG5vZGUuYWN0aXZlID0gdmFsdWU7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5ID09PSAnbmFtZScpIHtcbiAgICAgICAgICAgICAgICBub2RlLm5hbWUgPSB2YWx1ZTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8g5ZiX6Kmm55u05o6l6Kit572u5bGs5oCnXG4gICAgICAgICAgICAgICAgKG5vZGUgYXMgYW55KVtwcm9wZXJ0eV0gPSB2YWx1ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIG9rKHVuZGVmaW5lZCwgYFByb3BlcnR5ICcke3Byb3BlcnR5fScgdXBkYXRlZCBzdWNjZXNzZnVsbHlgKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoZXJyb3IubWVzc2FnZSk7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogR2V0IHNjZW5lIGhpZXJhcmNoeVxuICAgICAqL1xuICAgIGdldFNjZW5lSGllcmFyY2h5KGluY2x1ZGVDb21wb25lbnRzOiBib29sZWFuID0gZmFsc2UpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IgfSA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgICAgICBpZiAoIXNjZW5lKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ05vIGFjdGl2ZSBzY2VuZScpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBwcm9jZXNzTm9kZSA9IChub2RlOiBhbnkpOiBhbnkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdDogYW55ID0ge1xuICAgICAgICAgICAgICAgICAgICBuYW1lOiBub2RlLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgIHV1aWQ6IG5vZGUudXVpZCxcbiAgICAgICAgICAgICAgICAgICAgYWN0aXZlOiBub2RlLmFjdGl2ZSxcbiAgICAgICAgICAgICAgICAgICAgY2hpbGRyZW46IFtdXG4gICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgIGlmIChpbmNsdWRlQ29tcG9uZW50cykge1xuICAgICAgICAgICAgICAgICAgICByZXN1bHQuY29tcG9uZW50cyA9IG5vZGUuY29tcG9uZW50cy5tYXAoKGNvbXA6IGFueSkgPT4gKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6IGNvbXAuY29uc3RydWN0b3IubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGVuYWJsZWQ6IGNvbXAuZW5hYmxlZFxuICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKG5vZGUuY2hpbGRyZW4gJiYgbm9kZS5jaGlsZHJlbi5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdC5jaGlsZHJlbiA9IG5vZGUuY2hpbGRyZW4ubWFwKChjaGlsZDogYW55KSA9PiBwcm9jZXNzTm9kZShjaGlsZCkpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBjb25zdCBoaWVyYXJjaHkgPSBzY2VuZS5jaGlsZHJlbi5tYXAoKGNoaWxkOiBhbnkpID0+IHByb2Nlc3NOb2RlKGNoaWxkKSk7XG4gICAgICAgICAgICByZXR1cm4gb2soaGllcmFyY2h5KTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoZXJyb3IubWVzc2FnZSk7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQ3JlYXRlIHByZWZhYiBhc3NldCBmcm9tIGEgbm9kZSB2aWEgdGhlIG9mZmljaWFsIHNjZW5lIGZhY2FkZS5cbiAgICAgKlxuICAgICAqIFJvdXRlcyB0aHJvdWdoIGBjY2UuUHJlZmFiLmNyZWF0ZVByZWZhYmAgKHRoZSBDb2NvcyBlZGl0b3IgcHJlZmFiXG4gICAgICogbWFuYWdlciBleHBvc2VkIGluIHNjZW5lLXNjcmlwdCBjb250ZXh0KS4gVGhlIHVybCBhY2NlcHRzIGJvdGhcbiAgICAgKiBgZGI6Ly9hc3NldHMvLi4uYCBhbmQgYWJzb2x1dGUgZmlsZXN5c3RlbSBwYXRocyBpbiBkaWZmZXJlbnQgZWRpdG9yXG4gICAgICogYnVpbGRzLCBzbyB3ZSB0cnkgYm90aCBzaGFwZXMgYW5kIHN1cmZhY2Ugd2hpY2hldmVyIGZhaWxzLlxuICAgICAqL1xuICAgIGFzeW5jIGNyZWF0ZVByZWZhYkZyb21Ob2RlKG5vZGVVdWlkOiBzdHJpbmcsIHVybDogc3RyaW5nKSB7XG4gICAgICAgIGNvbnN0IHByZWZhYk1nciA9IGdldFByZWZhYkZhY2FkZSgpO1xuICAgICAgICBpZiAoIXByZWZhYk1nci5vaykge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwocHJlZmFiTWdyLmVycm9yKTtcbiAgICAgICAgfVxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgdHJpZXM6IHN0cmluZ1tdID0gW107XG4gICAgICAgICAgICAvLyBQcmVmZXIgZGI6Ly8gZm9ybSAobWF0Y2hlcyBhc3NldC1kYiBxdWVyeSByZXN1bHRzKSBhbmQgZmFsbFxuICAgICAgICAgICAgLy8gYmFjayB0byB3aGF0ZXZlciB0aGUgY2FsbGVyIHBhc3NlZCB2ZXJiYXRpbS5cbiAgICAgICAgICAgIGNvbnN0IGRiVXJsID0gdXJsLnN0YXJ0c1dpdGgoJ2RiOi8vJykgPyB1cmwgOiBgZGI6Ly9hc3NldHMvJHt1cmwucmVwbGFjZSgvXlxcLysvLCAnJyl9YDtcbiAgICAgICAgICAgIHRyaWVzLnB1c2goZGJVcmwpO1xuICAgICAgICAgICAgaWYgKGRiVXJsICE9PSB1cmwpIHtcbiAgICAgICAgICAgICAgICB0cmllcy5wdXNoKHVybCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IGVycm9yczogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIHRyaWVzKSB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgcHJlZmFiTWdyLnZhbHVlLmNyZWF0ZVByZWZhYihub2RlVXVpZCwgY2FuZGlkYXRlKTtcbiAgICAgICAgICAgICAgICAgICAgLy8gY2NlLlByZWZhYi5jcmVhdGVQcmVmYWIgcmVwdXJwb3NlcyB0aGUgc291cmNlIG5vZGUgaW50byBhXG4gICAgICAgICAgICAgICAgICAgIC8vIHByZWZhYiBpbnN0YW5jZSB3aXRoIGEgZnJlc2ggVVVJRCwgc28gdGhlIGNhbGxlci1zdXBwbGllZFxuICAgICAgICAgICAgICAgICAgICAvLyBub2RlVXVpZCBpcyBubyBsb25nZXIgdmFsaWQuIFJlc29sdmUgdGhlIG5ldyBVVUlEIGJ5XG4gICAgICAgICAgICAgICAgICAgIC8vIHF1ZXJ5aW5nIG5vZGVzIHRoYXQgcmVmZXJlbmNlIHRoZSBmcmVzaGx5IG1pbnRlZCBhc3NldC5cbiAgICAgICAgICAgICAgICAgICAgbGV0IGFzc2V0VXVpZDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgcmVzdWx0ID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXNzZXRVdWlkID0gcmVzdWx0O1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHJlc3VsdCAmJiB0eXBlb2YgcmVzdWx0ID09PSAnb2JqZWN0JyAmJiB0eXBlb2YgKHJlc3VsdCBhcyBhbnkpLnV1aWQgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhc3NldFV1aWQgPSAocmVzdWx0IGFzIGFueSkudXVpZDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBsZXQgaW5zdGFuY2VOb2RlVXVpZDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgIGlmIChhc3NldFV1aWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgaW5zdGFuY2VzOiBhbnkgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1ub2Rlcy1ieS1hc3NldC11dWlkJywgYXNzZXRVdWlkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShpbnN0YW5jZXMpICYmIGluc3RhbmNlcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIE5ld2x5LWNyZWF0ZWQgcHJlZmFiIGluc3RhbmNlIGlzIHR5cGljYWxseSB0aGVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gbGFzdCBlbnRyeS4gQ2F2ZWF0OiBpZiB0aGUgc2FtZSBhc3NldCBhbHJlYWR5XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGhhZCBpbnN0YW5jZXMgaW4gdGhlIHNjZW5lLCBcImxhc3RcIiBwaWNrcyBvbmVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gb2YgdGhlbSByYXRoZXIgdGhhbiB0aGUgbmV3IG9uZS4gVGhlIGVkaXRvclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBhcHBlYXJzIHRvIHJldHVybiBjcmVhdGlvbiBvcmRlciwgYnV0IHRoZSBBUElcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gaXMgdW5kb2N1bWVudGVkOyBjYWxsZXJzIHJlcXVpcmluZyBzdHJpY3RcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gaWRlbnRpZmljYXRpb24gc2hvdWxkIHNuYXBzaG90IGJlZm9yZSBjYWxsaW5nLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbnN0YW5jZU5vZGVVdWlkID0gaW5zdGFuY2VzW2luc3RhbmNlcy5sZW5ndGggLSAxXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBOb24tZmF0YWw6IHRoZSBhc3NldCB3YXMgY3JlYXRlZCBlaXRoZXIgd2F5LlxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICB1cmw6IGNhbmRpZGF0ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHNvdXJjZU5vZGVVdWlkOiBub2RlVXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHByZWZhYkFzc2V0VXVpZDogYXNzZXRVdWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgaW5zdGFuY2VOb2RlVXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHJhdzogcmVzdWx0LFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgICAgICAgICBlcnJvcnMucHVzaChgJHtjYW5kaWRhdGV9OiAke2Vycj8ubWVzc2FnZSA/PyBlcnJ9YCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGZhaWwoYGNjZS5QcmVmYWIuY3JlYXRlUHJlZmFiIGZhaWxlZDogJHtlcnJvcnMuam9pbignOyAnKX1gKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoZXJyb3I/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycm9yKSk7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogUHVzaCBwcmVmYWIgaW5zdGFuY2UgZWRpdHMgYmFjayB0byB0aGUgcHJlZmFiIGFzc2V0LlxuICAgICAqIFdyYXBzIHNjZW5lIGZhY2FkZSBgYXBwbHlQcmVmYWIobm9kZVV1aWQpYC5cbiAgICAgKi9cbiAgICBhc3luYyBhcHBseVByZWZhYihub2RlVXVpZDogc3RyaW5nKSB7XG4gICAgICAgIGNvbnN0IHByZWZhYk1nciA9IGdldFByZWZhYkZhY2FkZSgpO1xuICAgICAgICBpZiAoIXByZWZhYk1nci5vaykge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwocHJlZmFiTWdyLmVycm9yKTtcbiAgICAgICAgfVxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gTm90ZTogZmFjYWRlUmV0dXJuIGZyb20gY2NlLlNjZW5lRmFjYWRlTWFuYWdlci5hcHBseVByZWZhYiBpc1xuICAgICAgICAgICAgLy8gb2JzZXJ2ZWQgdG8gYmUgYGZhbHNlYCBldmVuIHdoZW4gdGhlIGFwcGx5IGdlbnVpbmVseSB3cml0ZXNcbiAgICAgICAgICAgIC8vIHRvIGRpc2sgKHZlcmlmaWVkIGR1cmluZyBQNCB2Mi4xLjAgcmVhbC1lZGl0b3IgdGVzdGluZykuXG4gICAgICAgICAgICAvLyBUcmVhdCBcIm5vIGV4Y2VwdGlvbiB0aHJvd25cIiBhcyBzdWNjZXNzIGFuZCBzdXJmYWNlIHRoZSByYXdcbiAgICAgICAgICAgIC8vIHJldHVybiB2YWx1ZSBhcyBtZXRhZGF0YSBvbmx5LlxuICAgICAgICAgICAgLy8gKHYyLjkueCBwb2xpc2gg4oCUIEdlbWluaSByMSBzaW5nbGUt8J+foSBmcm9tIHYyLjguMSByZXZpZXc6XG4gICAgICAgICAgICAvLyBjYW5vbmljYWwgbmFtZSBpcyBTY2VuZUZhY2FkZU1hbmFnZXI7IGNjZS5TY2VuZUZhY2FkZSBpc1xuICAgICAgICAgICAgLy8gdGhlIHR5cGUtZG9jIGFsaWFzLiBVc2UgU2NlbmVGYWNhZGVNYW5hZ2VyIHRocm91Z2hvdXRcbiAgICAgICAgICAgIC8vIGNvbW1lbnRzIHNvIHRoZSBydW50aW1lIGlkZW50aXR5IGlzIHVuYW1iaWd1b3VzLilcbiAgICAgICAgICAgIGNvbnN0IGZhY2FkZVJldHVybiA9IGF3YWl0IHByZWZhYk1nci52YWx1ZS5hcHBseVByZWZhYihub2RlVXVpZCk7XG4gICAgICAgICAgICByZXR1cm4gb2soeyBmYWNhZGVSZXR1cm4sIG5vZGVVdWlkIH0pO1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChlcnJvcj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyb3IpKTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBDb25uZWN0IGEgcmVndWxhciBub2RlIHRvIGEgcHJlZmFiIGFzc2V0IChsaW5rKS5cbiAgICAgKiBXcmFwcyBzY2VuZSBmYWNhZGUgYGxpbmtQcmVmYWIobm9kZVV1aWQsIGFzc2V0VXVpZClgLlxuICAgICAqL1xuICAgIGFzeW5jIGxpbmtQcmVmYWIobm9kZVV1aWQ6IHN0cmluZywgYXNzZXRVdWlkOiBzdHJpbmcpIHtcbiAgICAgICAgY29uc3QgcHJlZmFiTWdyID0gZ2V0UHJlZmFiRmFjYWRlKCk7XG4gICAgICAgIGlmICghcHJlZmFiTWdyLm9rKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChwcmVmYWJNZ3IuZXJyb3IpO1xuICAgICAgICB9XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBwcmVmYWJNZ3IudmFsdWUubGlua1ByZWZhYihub2RlVXVpZCwgYXNzZXRVdWlkKTtcbiAgICAgICAgICAgIHJldHVybiBvayh7IGxpbmtlZDogcmVzdWx0LCBub2RlVXVpZCwgYXNzZXRVdWlkIH0pO1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChlcnJvcj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyb3IpKTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBCcmVhayB0aGUgcHJlZmFiIGNvbm5lY3Rpb24gb24gYSBub2RlLlxuICAgICAqIFdyYXBzIHNjZW5lIGZhY2FkZSBgdW5saW5rUHJlZmFiKG5vZGVVdWlkLCByZW1vdmVOZXN0ZWQpYC5cbiAgICAgKi9cbiAgICBhc3luYyB1bmxpbmtQcmVmYWIobm9kZVV1aWQ6IHN0cmluZywgcmVtb3ZlTmVzdGVkOiBib29sZWFuKSB7XG4gICAgICAgIGNvbnN0IHByZWZhYk1nciA9IGdldFByZWZhYkZhY2FkZSgpO1xuICAgICAgICBpZiAoIXByZWZhYk1nci5vaykge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwocHJlZmFiTWdyLmVycm9yKTtcbiAgICAgICAgfVxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgcHJlZmFiTWdyLnZhbHVlLnVubGlua1ByZWZhYihub2RlVXVpZCwgcmVtb3ZlTmVzdGVkKTtcbiAgICAgICAgICAgIHJldHVybiBvayh7IHVubGlua2VkOiByZXN1bHQsIG5vZGVVdWlkLCByZW1vdmVOZXN0ZWQgfSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGVycm9yPy5tZXNzYWdlID8/IFN0cmluZyhlcnJvcikpO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFJlYWQgdGhlIHByZWZhYiBkdW1wIGZvciBhIHByZWZhYiBpbnN0YW5jZSBub2RlLlxuICAgICAqIFdyYXBzIHNjZW5lIGZhY2FkZSBgZ2V0UHJlZmFiRGF0YShub2RlVXVpZClgLlxuICAgICAqL1xuICAgIGdldFByZWZhYkRhdGEobm9kZVV1aWQ6IHN0cmluZykge1xuICAgICAgICBjb25zdCBwcmVmYWJNZ3IgPSBnZXRQcmVmYWJGYWNhZGUoKTtcbiAgICAgICAgaWYgKCFwcmVmYWJNZ3Iub2spIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKHByZWZhYk1nci5lcnJvcik7XG4gICAgICAgIH1cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGRhdGEgPSBwcmVmYWJNZ3IudmFsdWUuZ2V0UHJlZmFiRGF0YShub2RlVXVpZCk7XG4gICAgICAgICAgICByZXR1cm4gb2soZGF0YSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGVycm9yPy5tZXNzYWdlID8/IFN0cmluZyhlcnJvcikpO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEFwcGVuZCBhIGNjLkV2ZW50SGFuZGxlciBlbnRyeSB0byBhIGNvbXBvbmVudCdzIGV2ZW50IGFycmF5XG4gICAgICogKGUuZy4gY2MuQnV0dG9uLmNsaWNrRXZlbnRzLCBjYy5Ub2dnbGUuY2hlY2tFdmVudHMpLlxuICAgICAqXG4gICAgICogUGVyc2lzdGVuY2Ugbm90ZSAoQ0xBVURFLm1kIExhbmRtaW5lICMxMSk6IHNjZW5lLXNjcmlwdCBgYXJyLnB1c2hgXG4gICAgICogb25seSBtdXRhdGVzIHRoZSBydW50aW1lIGNjLkNvbXBvbmVudCBpbnN0YW5jZTsgdGhlIGVkaXRvcidzXG4gICAgICogc2VyaWFsaXphdGlvbiBtb2RlbCAod2hhdCBgc2F2ZS1zY2VuZWAgd3JpdGVzIHRvIGRpc2spIGRvZXMgbm90IHNlZVxuICAgICAqIHRoZSBjaGFuZ2UuIFRoZSBob3N0LXNpZGUgY2FsbGVyIChgY29tcG9uZW50LXRvb2xzLnRzYCkgaXNcbiAgICAgKiByZXNwb25zaWJsZSBmb3IgbnVkZ2luZyB0aGUgbW9kZWwgYWZ0ZXJ3YXJkcyB2aWEgYSBuby1vcFxuICAgICAqIGBzZXQtcHJvcGVydHlgIG9uIGEgY29tcG9uZW50IGZpZWxkIOKAlCBjYWxsaW5nIGBzZXQtcHJvcGVydHlgIGZyb21cbiAgICAgKiBoZXJlIGRvZXNuJ3QgcHJvcGFnYXRlIChzY2VuZS1wcm9jZXNzIElQQyBzaG9ydC1jaXJjdWl0cyBhbmRcbiAgICAgKiBza2lwcyB0aGUgbW9kZWwgc3luYykuIFdlIHN1cmZhY2UgYGNvbXBvbmVudFV1aWRgIGFuZFxuICAgICAqIGBjb21wb25lbnRFbmFibGVkYCBzbyB0aGUgY2FsbGVyIGhhcyB3aGF0IGl0IG5lZWRzLlxuICAgICAqL1xuICAgIGFkZEV2ZW50SGFuZGxlcihcbiAgICAgICAgbm9kZVV1aWQ6IHN0cmluZyxcbiAgICAgICAgY29tcG9uZW50VHlwZTogc3RyaW5nLFxuICAgICAgICBldmVudEFycmF5UHJvcGVydHk6IHN0cmluZyxcbiAgICAgICAgdGFyZ2V0VXVpZDogc3RyaW5nLFxuICAgICAgICBjb21wb25lbnROYW1lOiBzdHJpbmcsXG4gICAgICAgIGhhbmRsZXI6IHN0cmluZyxcbiAgICAgICAgY3VzdG9tRXZlbnREYXRhPzogc3RyaW5nLFxuICAgICkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgY2MgPSByZXF1aXJlKCdjYycpO1xuICAgICAgICAgICAgY29uc3QgY3R4ID0gcmVzb2x2ZUNvbXBvbmVudENvbnRleHQobm9kZVV1aWQsIGNvbXBvbmVudFR5cGUpO1xuICAgICAgICAgICAgaWYgKCFjdHgub2spIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFpbChjdHguZXJyb3IpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgdGFyZ2V0Tm9kZSA9IGZpbmROb2RlQnlVdWlkRGVlcChjdHguc2NlbmUsIHRhcmdldFV1aWQpO1xuICAgICAgICAgICAgaWYgKCF0YXJnZXROb2RlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoYFRhcmdldCBub2RlIHdpdGggVVVJRCAke3RhcmdldFV1aWR9IG5vdCBmb3VuZGApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgYXJyID0gY3R4LmNvbXBvbmVudFtldmVudEFycmF5UHJvcGVydHldO1xuICAgICAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KGFycikpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFpbChgUHJvcGVydHkgJyR7ZXZlbnRBcnJheVByb3BlcnR5fScgb24gJHtjb21wb25lbnRUeXBlfSBpcyBub3QgYW4gYXJyYXkgKGdvdCAke3R5cGVvZiBhcnJ9KWApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBlaCA9IG5ldyBjYy5FdmVudEhhbmRsZXIoKTtcbiAgICAgICAgICAgIGVoLnRhcmdldCA9IHRhcmdldE5vZGU7XG4gICAgICAgICAgICBlaC5jb21wb25lbnQgPSBjb21wb25lbnROYW1lO1xuICAgICAgICAgICAgZWguaGFuZGxlciA9IGhhbmRsZXI7XG4gICAgICAgICAgICBlaC5jdXN0b21FdmVudERhdGEgPSBjdXN0b21FdmVudERhdGEgPz8gJyc7XG4gICAgICAgICAgICBhcnIucHVzaChlaCk7XG5cbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnNlbmQoJ3NjZW5lJywgJ3NuYXBzaG90Jyk7XG4gICAgICAgICAgICByZXR1cm4gb2soe1xuICAgICAgICAgICAgICAgICAgICBpbmRleDogYXJyLmxlbmd0aCAtIDEsXG4gICAgICAgICAgICAgICAgICAgIGNvdW50OiBhcnIubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRVdWlkOiBjdHguY29tcG9uZW50LnV1aWQsXG4gICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudEVuYWJsZWQ6IGN0eC5jb21wb25lbnQuZW5hYmxlZCAhPT0gZmFsc2UsXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGVycm9yPy5tZXNzYWdlID8/IFN0cmluZyhlcnJvcikpO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFJlbW92ZSBhIGNjLkV2ZW50SGFuZGxlciBlbnRyeSBieSBpbmRleCwgb3IgYnkgbWF0Y2hpbmdcbiAgICAgKiAodGFyZ2V0VXVpZCwgaGFuZGxlcikgcGFpci4gSWYgYm90aCBhcmUgcHJvdmlkZWQsIGluZGV4IHdpbnMuXG4gICAgICpcbiAgICAgKiBTZWUgYWRkRXZlbnRIYW5kbGVyIGZvciB0aGUgcGVyc2lzdGVuY2Ugbm90ZS4gQ2FsbGVyIG11c3QgZm9sbG93IHVwXG4gICAgICogd2l0aCBhIGhvc3Qtc2lkZSBgc2V0LXByb3BlcnR5YCBudWRnZSB1c2luZyB0aGUgcmV0dXJuZWRcbiAgICAgKiBgY29tcG9uZW50VXVpZGAgLyBgY29tcG9uZW50RW5hYmxlZGAgdG8gbWFrZSB0aGUgY2hhbmdlIHZpc2libGUgdG9cbiAgICAgKiBgc2F2ZS1zY2VuZWAuXG4gICAgICovXG4gICAgcmVtb3ZlRXZlbnRIYW5kbGVyKFxuICAgICAgICBub2RlVXVpZDogc3RyaW5nLFxuICAgICAgICBjb21wb25lbnRUeXBlOiBzdHJpbmcsXG4gICAgICAgIGV2ZW50QXJyYXlQcm9wZXJ0eTogc3RyaW5nLFxuICAgICAgICBpbmRleDogbnVtYmVyIHwgbnVsbCxcbiAgICAgICAgdGFyZ2V0VXVpZDogc3RyaW5nIHwgbnVsbCxcbiAgICAgICAgaGFuZGxlcjogc3RyaW5nIHwgbnVsbCxcbiAgICApIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGN0eCA9IHJlc29sdmVDb21wb25lbnRDb250ZXh0KG5vZGVVdWlkLCBjb21wb25lbnRUeXBlKTtcbiAgICAgICAgICAgIGlmICghY3R4Lm9rKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoY3R4LmVycm9yKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGFyciA9IGN0eC5jb21wb25lbnRbZXZlbnRBcnJheVByb3BlcnR5XTtcbiAgICAgICAgICAgIGlmICghQXJyYXkuaXNBcnJheShhcnIpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoYFByb3BlcnR5ICcke2V2ZW50QXJyYXlQcm9wZXJ0eX0nIG9uICR7Y29tcG9uZW50VHlwZX0gaXMgbm90IGFuIGFycmF5YCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIFRyaW0gYXJvdW5kIGNvbXBhcmlzb25zIHNvIGNhbGxlcnMgcGFzc2luZyBVVUlEcyAvIGhhbmRsZXJcbiAgICAgICAgICAgIC8vIG5hbWVzIHdpdGggbGVhZGluZy90cmFpbGluZyB3aGl0ZXNwYWNlIChMTE0gdG9vbCBhcmdzIG9mdGVuXG4gICAgICAgICAgICAvLyBjb21lIHdpdGggc3RyYXkgc3BhY2VzKSBzdGlsbCBmaW5kIGEgbWF0Y2guIENydWNpYWw6IHRoZVxuICAgICAgICAgICAgLy8gb3V0ZXIgZ3VhcmQgdGVzdHMgdGhlICp0cmltbWVkKiB2YWx1ZXMgdG9vIOKAlCBvdGhlcndpc2UgYVxuICAgICAgICAgICAgLy8gd2hpdGVzcGFjZS1vbmx5IHRhcmdldFV1aWQvaGFuZGxlciB3b3VsZCBwYXNzIGFzIHRydXRoeSxcbiAgICAgICAgICAgIC8vIGNvbGxhcHNlIHRvIG51bGwgYWZ0ZXIgdHJpbSwgYW5kIHRoZSBwcmVkaWNhdGUgd291bGQgbWF0Y2hcbiAgICAgICAgICAgIC8vIGV2ZXJ5IGVudHJ5IHZhY3VvdXNseSwgc2lsZW50bHkgZGVsZXRpbmcgYXJyWzBdLlxuICAgICAgICAgICAgY29uc3QgdGFyZ2V0VXVpZE5vcm0gPSB0YXJnZXRVdWlkPy50cmltKCkgfHwgbnVsbDtcbiAgICAgICAgICAgIGNvbnN0IGhhbmRsZXJOb3JtID0gaGFuZGxlcj8udHJpbSgpIHx8IG51bGw7XG4gICAgICAgICAgICBsZXQgcmVtb3ZlQXQgPSAtMTtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgaW5kZXggPT09ICdudW1iZXInICYmIGluZGV4ID49IDApIHtcbiAgICAgICAgICAgICAgICByZW1vdmVBdCA9IGluZGV4O1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0YXJnZXRVdWlkTm9ybSB8fCBoYW5kbGVyTm9ybSkge1xuICAgICAgICAgICAgICAgIHJlbW92ZUF0ID0gYXJyLmZpbmRJbmRleCgoZWg6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBlaFRhcmdldFV1aWQgPSB0eXBlb2YgZWg/LnRhcmdldD8udXVpZCA9PT0gJ3N0cmluZycgPyBlaC50YXJnZXQudXVpZC50cmltKCkgOiBlaD8udGFyZ2V0Py51dWlkO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBlaEhhbmRsZXIgPSB0eXBlb2YgZWg/LmhhbmRsZXIgPT09ICdzdHJpbmcnID8gZWguaGFuZGxlci50cmltKCkgOiBlaD8uaGFuZGxlcjtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbWF0Y2hlc1RhcmdldCA9ICF0YXJnZXRVdWlkTm9ybSB8fCBlaFRhcmdldFV1aWQgPT09IHRhcmdldFV1aWROb3JtO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBtYXRjaGVzSGFuZGxlciA9ICFoYW5kbGVyTm9ybSB8fCBlaEhhbmRsZXIgPT09IGhhbmRsZXJOb3JtO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gbWF0Y2hlc1RhcmdldCAmJiBtYXRjaGVzSGFuZGxlcjtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChyZW1vdmVBdCA8IDAgfHwgcmVtb3ZlQXQgPj0gYXJyLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKCdObyBtYXRjaGluZyBldmVudCBoYW5kbGVyIHRvIHJlbW92ZScpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgcmVtb3ZlZCA9IGFyci5zcGxpY2UocmVtb3ZlQXQsIDEpWzBdO1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2Uuc2VuZCgnc2NlbmUnLCAnc25hcHNob3QnKTtcbiAgICAgICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgICAgIGluZGV4OiByZW1vdmVBdCxcbiAgICAgICAgICAgICAgICAgICAgcmVtYWluaW5nOiBhcnIubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICByZW1vdmVkOiBzZXJpYWxpemVFdmVudEhhbmRsZXIocmVtb3ZlZCksXG4gICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudFV1aWQ6IGN0eC5jb21wb25lbnQudXVpZCxcbiAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50RW5hYmxlZDogY3R4LmNvbXBvbmVudC5lbmFibGVkICE9PSBmYWxzZSxcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoZXJyb3I/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycm9yKSk7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogSW5zcGVjdCBhIGNvbXBvbmVudCdzIEV2ZW50SGFuZGxlciBhcnJheSAocmVhZC1vbmx5KS5cbiAgICAgKi9cbiAgICBsaXN0RXZlbnRIYW5kbGVycyhub2RlVXVpZDogc3RyaW5nLCBjb21wb25lbnRUeXBlOiBzdHJpbmcsIGV2ZW50QXJyYXlQcm9wZXJ0eTogc3RyaW5nKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBjdHggPSByZXNvbHZlQ29tcG9uZW50Q29udGV4dChub2RlVXVpZCwgY29tcG9uZW50VHlwZSk7XG4gICAgICAgICAgICBpZiAoIWN0eC5vaykge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKGN0eC5lcnJvcik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBhcnIgPSBjdHguY29tcG9uZW50W2V2ZW50QXJyYXlQcm9wZXJ0eV07XG4gICAgICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkoYXJyKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKGBQcm9wZXJ0eSAnJHtldmVudEFycmF5UHJvcGVydHl9JyBvbiAke2NvbXBvbmVudFR5cGV9IGlzIG5vdCBhbiBhcnJheWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIG9rKHtcbiAgICAgICAgICAgICAgICAgICAgY291bnQ6IGFyci5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgIGhhbmRsZXJzOiBhcnIubWFwKHNlcmlhbGl6ZUV2ZW50SGFuZGxlciksXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGVycm9yPy5tZXNzYWdlID8/IFN0cmluZyhlcnJvcikpO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIHYyLjQuOCBBMjogY2MuQW5pbWF0aW9uIGRyaXZlcnMg4oCUIHNlZSBzb3VyY2UvdG9vbHMvYW5pbWF0aW9uLXRvb2xzLnRzLlxuICAgICAqIEltcGxlbWVudGF0aW9uIG5vdGU6IGNvY29zIGV4cG9zZXMgdGhlIGVuZ2luZSdzIGBjYy5BbmltYXRpb25gIChhbmRcbiAgICAgKiBpdHMgc3ViLWNsYXNzZXMgdmlhIGBqcy5nZXRDbGFzc0J5TmFtZWApLiBXZSB1c2UgdGhlIHJ1bnRpbWUgQVBJXG4gICAgICogKGBnZXRDb21wb25lbnQoJ2NjLkFuaW1hdGlvbicpYCkgcmF0aGVyIHRoYW4gdGhlIGVkaXRvcidzIHNldC1wcm9wZXJ0eVxuICAgICAqIGNoYW5uZWwgYmVjYXVzZSB0aGUgbGF0dGVyIHdvdWxkIG9ubHkgcGVyc2lzdCBkZWZhdWx0Q2xpcCAvIHBsYXlPbkxvYWRcbiAgICAgKiBidXQgY2Fubm90IHRyaWdnZXIgcGxheSgpL3N0b3AoKSDigJQgdGhvc2UgYXJlIHJ1bnRpbWUgbWV0aG9kcyBvbmx5LlxuICAgICAqL1xuICAgIGdldEFuaW1hdGlvbkNsaXBzKG5vZGVVdWlkOiBzdHJpbmcpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IgfSA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgICAgICBpZiAoIXNjZW5lKSByZXR1cm4gZmFpbCgnTm8gYWN0aXZlIHNjZW5lJyk7XG4gICAgICAgICAgICBjb25zdCBub2RlID0gZmluZE5vZGVCeVV1aWREZWVwKHNjZW5lLCBub2RlVXVpZCk7XG4gICAgICAgICAgICBpZiAoIW5vZGUpIHJldHVybiBmYWlsKGBOb2RlICR7bm9kZVV1aWR9IG5vdCBmb3VuZGApO1xuICAgICAgICAgICAgY29uc3QgYW5pbSA9IG5vZGUuZ2V0Q29tcG9uZW50KCdjYy5BbmltYXRpb24nKTtcbiAgICAgICAgICAgIGlmICghYW5pbSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKGBOb2RlICR7bm9kZVV1aWR9IGhhcyBubyBjYy5BbmltYXRpb24gY29tcG9uZW50YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBjbGlwczogYW55W10gPSBhbmltLmNsaXBzID8/IFtdO1xuICAgICAgICAgICAgY29uc3QgZGVmYXVsdENsaXBOYW1lID0gYW5pbS5kZWZhdWx0Q2xpcD8ubmFtZSA/PyBudWxsO1xuICAgICAgICAgICAgcmV0dXJuIG9rKHtcbiAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgICAgIG5vZGVOYW1lOiBub2RlLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgIGRlZmF1bHRDbGlwOiBkZWZhdWx0Q2xpcE5hbWUsXG4gICAgICAgICAgICAgICAgICAgIHBsYXlPbkxvYWQ6IGFuaW0ucGxheU9uTG9hZCA9PT0gdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgY2xpcHM6IGNsaXBzLmZpbHRlcihjID0+IGMpLm1hcChjID0+ICh7XG4gICAgICAgICAgICAgICAgICAgICAgICBuYW1lOiBjLm5hbWUgPz8gbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IGMuX3V1aWQgPz8gYy51dWlkID8/IG51bGwsXG4gICAgICAgICAgICAgICAgICAgICAgICBkdXJhdGlvbjogdHlwZW9mIGMuZHVyYXRpb24gPT09ICdudW1iZXInID8gYy5kdXJhdGlvbiA6IG51bGwsXG4gICAgICAgICAgICAgICAgICAgICAgICB3cmFwTW9kZTogYy53cmFwTW9kZSA/PyBudWxsLFxuICAgICAgICAgICAgICAgICAgICB9KSksXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGVycm9yPy5tZXNzYWdlID8/IFN0cmluZyhlcnJvcikpO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIGxpc3RBbmltYXRpb25TdGF0ZXMobm9kZVV1aWQ6IHN0cmluZykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgeyBkaXJlY3RvciB9ID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICAgICAgICAgIGlmICghc2NlbmUpIHJldHVybiBmYWlsKCdObyBhY3RpdmUgc2NlbmUnKTtcbiAgICAgICAgICAgIGNvbnN0IG5vZGUgPSBmaW5kTm9kZUJ5VXVpZERlZXAoc2NlbmUsIG5vZGVVdWlkKTtcbiAgICAgICAgICAgIGlmICghbm9kZSkgcmV0dXJuIGZhaWwoYE5vZGUgJHtub2RlVXVpZH0gbm90IGZvdW5kYCk7XG4gICAgICAgICAgICBjb25zdCBhbmltID0gbm9kZS5nZXRDb21wb25lbnQoJ2NjLkFuaW1hdGlvbicpO1xuICAgICAgICAgICAgaWYgKCFhbmltKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoYE5vZGUgJHtub2RlVXVpZH0gaGFzIG5vIGNjLkFuaW1hdGlvbiBjb21wb25lbnRgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGNsaXBzOiBhbnlbXSA9IHR5cGVvZiBhbmltLmdldEFuaW1hdGlvbkNsaXBzID09PSAnZnVuY3Rpb24nXG4gICAgICAgICAgICAgICAgPyBhbmltLmdldEFuaW1hdGlvbkNsaXBzKClcbiAgICAgICAgICAgICAgICA6IChhbmltLmNsaXBzID8/IFtdKTtcbiAgICAgICAgICAgIGNvbnN0IHN0YXRlcyA9IGNsaXBzXG4gICAgICAgICAgICAgICAgLmZpbHRlcigoY2xpcDogYW55KSA9PiBjbGlwPy5uYW1lKVxuICAgICAgICAgICAgICAgIC5tYXAoKGNsaXA6IGFueSkgPT4gYW5pbS5nZXRTdGF0ZShjbGlwLm5hbWUpKVxuICAgICAgICAgICAgICAgIC5maWx0ZXIoKHN0YXRlOiBhbnkpID0+IHN0YXRlKVxuICAgICAgICAgICAgICAgIC5tYXAoKHN0YXRlOiBhbnkpID0+ICh7XG4gICAgICAgICAgICAgICAgICAgIG5hbWU6IHN0YXRlLm5hbWUgPz8gbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgc3BlZWQ6IHR5cGVvZiBzdGF0ZS5zcGVlZCA9PT0gJ251bWJlcicgPyBzdGF0ZS5zcGVlZCA6IG51bGwsXG4gICAgICAgICAgICAgICAgICAgIHRvdGFsVGltZTogdHlwZW9mIHN0YXRlLnRvdGFsVGltZSA9PT0gJ251bWJlcicgPyBzdGF0ZS50b3RhbFRpbWUgOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICBjdXJyZW50VGltZTogdHlwZW9mIHN0YXRlLmN1cnJlbnRUaW1lID09PSAnbnVtYmVyJyA/IHN0YXRlLmN1cnJlbnRUaW1lIDogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgaXNQbGF5aW5nOiBzdGF0ZS5pc1BsYXlpbmcgPT09IHRydWUsXG4gICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgcmV0dXJuIG9rKHN0YXRlcyk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGVycm9yPy5tZXNzYWdlID8/IFN0cmluZyhlcnJvcikpO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIGdldEFuaW1hdGlvblN0YXRlSW5mbyhub2RlVXVpZDogc3RyaW5nLCBzdGF0ZU5hbWU6IHN0cmluZykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgeyBkaXJlY3RvciB9ID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICAgICAgICAgIGlmICghc2NlbmUpIHJldHVybiBmYWlsKCdObyBhY3RpdmUgc2NlbmUnKTtcbiAgICAgICAgICAgIGNvbnN0IG5vZGUgPSBmaW5kTm9kZUJ5VXVpZERlZXAoc2NlbmUsIG5vZGVVdWlkKTtcbiAgICAgICAgICAgIGlmICghbm9kZSkgcmV0dXJuIGZhaWwoYE5vZGUgJHtub2RlVXVpZH0gbm90IGZvdW5kYCk7XG4gICAgICAgICAgICBjb25zdCBhbmltID0gbm9kZS5nZXRDb21wb25lbnQoJ2NjLkFuaW1hdGlvbicpO1xuICAgICAgICAgICAgaWYgKCFhbmltKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoYE5vZGUgJHtub2RlVXVpZH0gaGFzIG5vIGNjLkFuaW1hdGlvbiBjb21wb25lbnRgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHN0YXRlID0gYW5pbS5nZXRTdGF0ZShzdGF0ZU5hbWUpO1xuICAgICAgICAgICAgaWYgKCFzdGF0ZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKGBBbmltYXRpb24gc3RhdGUgJyR7c3RhdGVOYW1lfScgbm90IGZvdW5kYCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gb2soe1xuICAgICAgICAgICAgICAgICAgICBzcGVlZDogdHlwZW9mIHN0YXRlLnNwZWVkID09PSAnbnVtYmVyJyA/IHN0YXRlLnNwZWVkIDogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgaXNQbGF5aW5nOiBzdGF0ZS5pc1BsYXlpbmcgPT09IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIGN1cnJlbnRUaW1lOiB0eXBlb2Ygc3RhdGUuY3VycmVudFRpbWUgPT09ICdudW1iZXInID8gc3RhdGUuY3VycmVudFRpbWUgOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICB0b3RhbFRpbWU6IHR5cGVvZiBzdGF0ZS50b3RhbFRpbWUgPT09ICdudW1iZXInID8gc3RhdGUudG90YWxUaW1lIDogbnVsbCxcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoZXJyb3I/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycm9yKSk7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgc2V0QW5pbWF0aW9uU3BlZWQobm9kZVV1aWQ6IHN0cmluZywgc3RhdGVOYW1lOiBzdHJpbmcsIHNwZWVkOiBudW1iZXIpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IgfSA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgICAgICBpZiAoIXNjZW5lKSByZXR1cm4gZmFpbCgnTm8gYWN0aXZlIHNjZW5lJyk7XG4gICAgICAgICAgICBjb25zdCBub2RlID0gZmluZE5vZGVCeVV1aWREZWVwKHNjZW5lLCBub2RlVXVpZCk7XG4gICAgICAgICAgICBpZiAoIW5vZGUpIHJldHVybiBmYWlsKGBOb2RlICR7bm9kZVV1aWR9IG5vdCBmb3VuZGApO1xuICAgICAgICAgICAgY29uc3QgYW5pbSA9IG5vZGUuZ2V0Q29tcG9uZW50KCdjYy5BbmltYXRpb24nKTtcbiAgICAgICAgICAgIGlmICghYW5pbSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKGBOb2RlICR7bm9kZVV1aWR9IGhhcyBubyBjYy5BbmltYXRpb24gY29tcG9uZW50YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBzdGF0ZSA9IGFuaW0uZ2V0U3RhdGUoc3RhdGVOYW1lKTtcbiAgICAgICAgICAgIGlmICghc3RhdGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFpbChgQW5pbWF0aW9uIHN0YXRlICcke3N0YXRlTmFtZX0nIG5vdCBmb3VuZGApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc3RhdGUuc3BlZWQgPSBzcGVlZDtcbiAgICAgICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgICAgIHNwZWVkOiBzdGF0ZS5zcGVlZCxcbiAgICAgICAgICAgICAgICAgICAgaXNQbGF5aW5nOiBzdGF0ZS5pc1BsYXlpbmcgPT09IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIGN1cnJlbnRUaW1lOiB0eXBlb2Ygc3RhdGUuY3VycmVudFRpbWUgPT09ICdudW1iZXInID8gc3RhdGUuY3VycmVudFRpbWUgOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICB0b3RhbFRpbWU6IHR5cGVvZiBzdGF0ZS50b3RhbFRpbWUgPT09ICdudW1iZXInID8gc3RhdGUudG90YWxUaW1lIDogbnVsbCxcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoZXJyb3I/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycm9yKSk7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgY2hlY2tBbmltYXRpb25GaW5pc2hlZChub2RlVXVpZDogc3RyaW5nLCBzdGF0ZU5hbWU6IHN0cmluZykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgeyBkaXJlY3RvciB9ID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICAgICAgICAgIGlmICghc2NlbmUpIHJldHVybiBmYWlsKCdObyBhY3RpdmUgc2NlbmUnKTtcbiAgICAgICAgICAgIGNvbnN0IG5vZGUgPSBmaW5kTm9kZUJ5VXVpZERlZXAoc2NlbmUsIG5vZGVVdWlkKTtcbiAgICAgICAgICAgIGlmICghbm9kZSkgcmV0dXJuIGZhaWwoYE5vZGUgJHtub2RlVXVpZH0gbm90IGZvdW5kYCk7XG4gICAgICAgICAgICBjb25zdCBhbmltID0gbm9kZS5nZXRDb21wb25lbnQoJ2NjLkFuaW1hdGlvbicpO1xuICAgICAgICAgICAgaWYgKCFhbmltKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoYE5vZGUgJHtub2RlVXVpZH0gaGFzIG5vIGNjLkFuaW1hdGlvbiBjb21wb25lbnRgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHN0YXRlID0gYW5pbS5nZXRTdGF0ZShzdGF0ZU5hbWUpO1xuICAgICAgICAgICAgaWYgKCFzdGF0ZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKGBBbmltYXRpb24gc3RhdGUgJyR7c3RhdGVOYW1lfScgbm90IGZvdW5kYCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBjdXJyZW50VGltZSA9IHR5cGVvZiBzdGF0ZS5jdXJyZW50VGltZSA9PT0gJ251bWJlcicgPyBzdGF0ZS5jdXJyZW50VGltZSA6IDA7XG4gICAgICAgICAgICBjb25zdCB0b3RhbFRpbWUgPSB0eXBlb2Ygc3RhdGUudG90YWxUaW1lID09PSAnbnVtYmVyJyA/IHN0YXRlLnRvdGFsVGltZSA6IDA7XG4gICAgICAgICAgICByZXR1cm4gb2soeyBmaW5pc2hlZDogY3VycmVudFRpbWUgPj0gdG90YWxUaW1lIH0pO1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChlcnJvcj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyb3IpKTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICBwbGF5QW5pbWF0aW9uKG5vZGVVdWlkOiBzdHJpbmcsIGNsaXBOYW1lPzogc3RyaW5nKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCB7IGRpcmVjdG9yIH0gPSByZXF1aXJlKCdjYycpO1xuICAgICAgICAgICAgY29uc3Qgc2NlbmUgPSBkaXJlY3Rvci5nZXRTY2VuZSgpO1xuICAgICAgICAgICAgaWYgKCFzY2VuZSkgcmV0dXJuIGZhaWwoJ05vIGFjdGl2ZSBzY2VuZScpO1xuICAgICAgICAgICAgY29uc3Qgbm9kZSA9IGZpbmROb2RlQnlVdWlkRGVlcChzY2VuZSwgbm9kZVV1aWQpO1xuICAgICAgICAgICAgaWYgKCFub2RlKSByZXR1cm4gZmFpbChgTm9kZSAke25vZGVVdWlkfSBub3QgZm91bmRgKTtcbiAgICAgICAgICAgIGNvbnN0IGFuaW0gPSBub2RlLmdldENvbXBvbmVudCgnY2MuQW5pbWF0aW9uJyk7XG4gICAgICAgICAgICBpZiAoIWFuaW0pIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFpbChgTm9kZSAke25vZGVVdWlkfSBoYXMgbm8gY2MuQW5pbWF0aW9uIGNvbXBvbmVudGApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGNsaXBOYW1lKSB7XG4gICAgICAgICAgICAgICAgLy8gVmFsaWRhdGUgY2xpcCBleGlzdHMgYmVmb3JlIGNhbGxpbmcgcGxheSgpIOKAlCBjYy5BbmltYXRpb24ucGxheVxuICAgICAgICAgICAgICAgIC8vIHNpbGVudGx5IGRvZXMgbm90aGluZyBvbiB1bmtub3duIG5hbWVzIHdoaWNoIHdvdWxkIG1hc2tcbiAgICAgICAgICAgICAgICAvLyB0eXBvcyBpbiBBSS1nZW5lcmF0ZWQgY2FsbHMuXG4gICAgICAgICAgICAgICAgY29uc3Qga25vd24gPSAoYW5pbS5jbGlwcyA/PyBbXSkuc29tZSgoYzogYW55KSA9PiBjPy5uYW1lID09PSBjbGlwTmFtZSk7XG4gICAgICAgICAgICAgICAgaWYgKCFrbm93biAmJiAoYW5pbS5kZWZhdWx0Q2xpcD8ubmFtZSAhPT0gY2xpcE5hbWUpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKGBDbGlwICcke2NsaXBOYW1lfScgaXMgbm90IHJlZ2lzdGVyZWQgb24gdGhpcyBBbmltYXRpb24uIEtub3duOiAkeyhhbmltLmNsaXBzID8/IFtdKS5tYXAoKGM6IGFueSkgPT4gYz8ubmFtZSkuZmlsdGVyKEJvb2xlYW4pLmpvaW4oJywgJykgfHwgJyhub25lKSd9LmApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBhbmltLnBsYXkoY2xpcE5hbWUpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBpZiAoIWFuaW0uZGVmYXVsdENsaXApIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ05vIGNsaXBOYW1lIGdpdmVuIGFuZCBubyBkZWZhdWx0Q2xpcCBjb25maWd1cmVkJyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGFuaW0ucGxheSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIG9rKHsgbm9kZVV1aWQsIGNsaXBOYW1lOiBjbGlwTmFtZSA/PyBhbmltLmRlZmF1bHRDbGlwPy5uYW1lID8/IG51bGwgfSwgYFBsYXlpbmcgJyR7Y2xpcE5hbWUgPz8gYW5pbS5kZWZhdWx0Q2xpcD8ubmFtZX0nIG9uICR7bm9kZS5uYW1lfWApO1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChlcnJvcj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyb3IpKTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICBzdG9wQW5pbWF0aW9uKG5vZGVVdWlkOiBzdHJpbmcpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IgfSA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgICAgICBpZiAoIXNjZW5lKSByZXR1cm4gZmFpbCgnTm8gYWN0aXZlIHNjZW5lJyk7XG4gICAgICAgICAgICBjb25zdCBub2RlID0gZmluZE5vZGVCeVV1aWREZWVwKHNjZW5lLCBub2RlVXVpZCk7XG4gICAgICAgICAgICBpZiAoIW5vZGUpIHJldHVybiBmYWlsKGBOb2RlICR7bm9kZVV1aWR9IG5vdCBmb3VuZGApO1xuICAgICAgICAgICAgY29uc3QgYW5pbSA9IG5vZGUuZ2V0Q29tcG9uZW50KCdjYy5BbmltYXRpb24nKTtcbiAgICAgICAgICAgIGlmICghYW5pbSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKGBOb2RlICR7bm9kZVV1aWR9IGhhcyBubyBjYy5BbmltYXRpb24gY29tcG9uZW50YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhbmltLnN0b3AoKTtcbiAgICAgICAgICAgIHJldHVybiBvayh1bmRlZmluZWQsIGBTdG9wcGVkIGFuaW1hdGlvbiBvbiAke25vZGUubmFtZX1gKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoZXJyb3I/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycm9yKSk7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogUmVzb2x2ZSBhIGNsaXAgbmFtZSDihpIgYXNzZXQgdXVpZCBvbiBhIG5vZGUncyBjYy5BbmltYXRpb24uIFJldHVybnNcbiAgICAgKiB0aGUgbWF0Y2hpbmcgY2xpcCdzIGBfdXVpZGAgYWxvbmcgd2l0aCB0aGUgY2MuQW5pbWF0aW9uIGNvbXBvbmVudFxuICAgICAqIGluZGV4IGluc2lkZSBgX19jb21wc19fYCwgYm90aCBvZiB3aGljaCB0aGUgaG9zdC1zaWRlXG4gICAgICogYW5pbWF0aW9uX3NldF9jbGlwIGhhbmRsZXIgbmVlZHMgdG8gaXNzdWUgYHNldC1wcm9wZXJ0eWAgd3JpdGVzLlxuICAgICAqXG4gICAgICogV2h5IGhvc3Qtc2lkZSBkb2VzIHRoZSBhY3R1YWwgd3JpdGU6IExhbmRtaW5lICMxMSDigJQgc2NhbGFyXG4gICAgICogcHJvcGVydHkgd3JpdGVzIHZpYSB0aGUgZWRpdG9yJ3Mgc2V0LXByb3BlcnR5IGNoYW5uZWwgcHJvcGFnYXRlXG4gICAgICogdG8gdGhlIHNlcmlhbGl6YXRpb24gbW9kZWwgaW1tZWRpYXRlbHkuIERpcmVjdCBydW50aW1lIG11dGF0aW9uXG4gICAgICogKGBhbmltLmRlZmF1bHRDbGlwID0geGApIG9ubHkgdXBkYXRlcyBsYXllciAoYSkgYW5kIG1heSBub3RcbiAgICAgKiBwZXJzaXN0IG9uIHNhdmVfc2NlbmUuIFNvIHNjZW5lLXNjcmlwdCByZXR1cm5zIHRoZSBtZXRhZGF0YTsgaG9zdFxuICAgICAqIGRvZXMgdGhlIHBlcnNpc3RlbmNlLlxuICAgICAqL1xuICAgIHF1ZXJ5QW5pbWF0aW9uU2V0VGFyZ2V0cyhub2RlVXVpZDogc3RyaW5nLCBjbGlwTmFtZTogc3RyaW5nIHwgbnVsbCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgeyBkaXJlY3RvciB9ID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICAgICAgICAgIGlmICghc2NlbmUpIHJldHVybiBmYWlsKCdObyBhY3RpdmUgc2NlbmUnKTtcbiAgICAgICAgICAgIGNvbnN0IG5vZGUgPSBmaW5kTm9kZUJ5VXVpZERlZXAoc2NlbmUsIG5vZGVVdWlkKTtcbiAgICAgICAgICAgIGlmICghbm9kZSkgcmV0dXJuIGZhaWwoYE5vZGUgJHtub2RlVXVpZH0gbm90IGZvdW5kYCk7XG4gICAgICAgICAgICAvLyB2Mi40LjkgcmV2aWV3IGZpeCAoY2xhdWRlICsgY29kZXgg8J+foSk6IHVzZSBpbmRleE9mIG9uIHRoZVxuICAgICAgICAgICAgLy8gcmVzb2x2ZWQgYW5pbSBpbnN0YW5jZSBkaXJlY3RseS4gVGhlIHByZXZpb3VzIG1ldGFkYXRhLXN0cmluZ1xuICAgICAgICAgICAgLy8gbG9va3VwIChjb25zdHJ1Y3Rvci5uYW1lIC8gX19jbGFzc25hbWVfXyAvIF9jaWQpIHdhcyBmcmFnaWxlXG4gICAgICAgICAgICAvLyBhZ2FpbnN0IGN1c3RvbSBzdWJjbGFzc2VzIChjYy5Ta2VsZXRhbEFuaW1hdGlvbiwgdXNlci1kZXJpdmVkXG4gICAgICAgICAgICAvLyBjYy5BbmltYXRpb24pLiBnZXRDb21wb25lbnQoJ2NjLkFuaW1hdGlvbicpIHJlc29sdmVzIHN1YmNsYXNzZXNcbiAgICAgICAgICAgIC8vIGNvcnJlY3RseTsgbWF0Y2hpbmcgYnkgcmVmZXJlbmNlIGlzIHRoZSBjYW5vbmljYWwgd2F5IHRvIGZpbmRcbiAgICAgICAgICAgIC8vIHRoZSBzYW1lIGluc3RhbmNlJ3Mgc2xvdCBpbiBfX2NvbXBzX18uXG4gICAgICAgICAgICBjb25zdCBhbmltID0gbm9kZS5nZXRDb21wb25lbnQoJ2NjLkFuaW1hdGlvbicpO1xuICAgICAgICAgICAgaWYgKCFhbmltKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoYE5vZGUgJHtub2RlVXVpZH0gaGFzIG5vIGNjLkFuaW1hdGlvbiBjb21wb25lbnRgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGNvbXBvbmVudHM6IGFueVtdID0gKG5vZGUuX2NvbXBvbmVudHMgPz8gbm9kZS5jb21wb25lbnRzID8/IFtdKTtcbiAgICAgICAgICAgIGNvbnN0IGNvbXBJbmRleCA9IGNvbXBvbmVudHMuaW5kZXhPZihhbmltKTtcbiAgICAgICAgICAgIGlmIChjb21wSW5kZXggPT09IC0xKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoYE5vZGUgJHtub2RlVXVpZH0gY2MuQW5pbWF0aW9uIGNvbXBvbmVudCBub3QgZm91bmQgaW4gX19jb21wc19fIGFycmF5IChjb2NvcyBlZGl0b3IgaW5jb25zaXN0ZW5jeSkuYCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBsZXQgY2xpcFV1aWQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICAgICAgICAgICAgaWYgKGNsaXBOYW1lICE9PSBudWxsICYmIGNsaXBOYW1lICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBjbGlwID0gKGFuaW0uY2xpcHMgPz8gW10pLmZpbmQoKGM6IGFueSkgPT4gYz8ubmFtZSA9PT0gY2xpcE5hbWUpO1xuICAgICAgICAgICAgICAgIGlmICghY2xpcCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFpbChgQ2xpcCAnJHtjbGlwTmFtZX0nIGlzIG5vdCByZWdpc3RlcmVkIG9uIHRoaXMgQW5pbWF0aW9uLiBLbm93bjogJHsoYW5pbS5jbGlwcyA/PyBbXSkubWFwKChjOiBhbnkpID0+IGM/Lm5hbWUpLmZpbHRlcihCb29sZWFuKS5qb2luKCcsICcpIHx8ICcobm9uZSknfS5gKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2xpcFV1aWQgPSBjbGlwLl91dWlkID8/IGNsaXAudXVpZCA/PyBudWxsO1xuICAgICAgICAgICAgICAgIGlmICghY2xpcFV1aWQpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoYENsaXAgJyR7Y2xpcE5hbWV9JyBoYXMgbm8gYXNzZXQgdXVpZDsgY2Fubm90IHBlcnNpc3QgYXMgZGVmYXVsdENsaXAuYCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIG9rKHtcbiAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50SW5kZXg6IGNvbXBJbmRleCxcbiAgICAgICAgICAgICAgICAgICAgY2xpcFV1aWQsXG4gICAgICAgICAgICAgICAgICAgIGN1cnJlbnREZWZhdWx0Q2xpcDogYW5pbS5kZWZhdWx0Q2xpcD8ubmFtZSA/PyBudWxsLFxuICAgICAgICAgICAgICAgICAgICBjdXJyZW50UGxheU9uTG9hZDogYW5pbS5wbGF5T25Mb2FkID09PSB0cnVlLFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChlcnJvcj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyb3IpKTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiB2Mi44LjAgVC1WMjgtMyAvIHYyLjguMiByZXRlc3QgZml4OiBlbnRlciAvIGV4aXQgUHJldmlldy1pbi1FZGl0b3JcbiAgICAgKiAoUElFKSBwbGF5IG1vZGUgcHJvZ3JhbW1hdGljYWxseS4gVXNlcyB0aGUgdHlwZWRcbiAgICAgKiBgY2hhbmdlUHJldmlld1BsYXlTdGF0ZShzdGF0ZTogYm9vbGVhbilgIG1ldGhvZCBkZWNsYXJlZCBvblxuICAgICAqIGBTY2VuZUZhY2FkZU1hbmFnZXJgIOKAlFxuICAgICAqIGBub2RlX21vZHVsZXMvQGNvY29zL2NyZWF0b3ItdHlwZXMvZWRpdG9yL3BhY2thZ2VzL3NjZW5lL0B0eXBlcy9jY2UvM2QvZmFjYWRlL3NjZW5lLWZhY2FkZS1tYW5hZ2VyLmQudHM6MjUwYC5cbiAgICAgKlxuICAgICAqIFBhcmFtZXRlcnM6XG4gICAgICogICBzdGF0ZSDigJQgdHJ1ZSB0byBzdGFydCBQSUUsIGZhbHNlIHRvIHN0b3AgYW5kIHJldHVybiB0byBzY2VuZSBtb2RlLlxuICAgICAqXG4gICAgICogKip2Mi44LjIgcmV0ZXN0IGZpbmRpbmcqKjogdjIuOC4wIGRpc3BhdGNoZWQgYWdhaW5zdCBgY2NlLlNjZW5lRmFjYWRlYFxuICAgICAqIChtYXRjaGluZyB0aGUgdHlwZS1kb2MgbmFtZSkgYnV0IGxpdmUgY29jb3MgZWRpdG9yIDMuOC54IGV4cG9zZXMgdGhlXG4gICAgICogcnVudGltZSBzaW5nbGV0b24gYXQgYGNjZS5TY2VuZUZhY2FkZU1hbmFnZXJgIChhbmQgLyBvclxuICAgICAqIGAuU2NlbmVGYWNhZGVNYW5hZ2VyLmluc3RhbmNlYCksIHNhbWUgY29udmVudGlvbiBhcyB0aGUgcHJlZmFiIHBhdGhcbiAgICAgKiB1c2VzIChzZWUgYGdldFByZWZhYkZhY2FkZWAgYWJvdmUpLiBQcm9iaW5nIGFsbCB0aHJlZSBjYW5kaWRhdGVzXG4gICAgICoga2VlcHMgdGhlIGNvZGUgcmVzaWxpZW50IGFjcm9zcyBjb2NvcyBidWlsZHMgd2hlcmUgdGhlIG5hbWVzcGFjZVxuICAgICAqIHNoYXBlIGRpZmZlcnMuXG4gICAgICpcbiAgICAgKiBUaGUgSEFORE9GRiBvcmlnaW5hbGx5IG5vdGVkIGBzY2VuZS9lZGl0b3ItcHJldmlldy1zZXQtcGxheWAgYXMgYW5cbiAgICAgKiB1bmRvY3VtZW50ZWQgRWRpdG9yLk1lc3NhZ2UgY2hhbm5lbDsgd2UgdXNlIHRoZSB0eXBlZCBmYWNhZGUgbWV0aG9kXG4gICAgICogaW5zdGVhZCBzbyB0aGUgY2FsbCBwYXRoIGlzIHR5cGUtY2hlY2tlZCBhZ2FpbnN0IGNyZWF0b3ItdHlwZXMgYW5kXG4gICAgICogbm90IHN1YmplY3QgdG8gc2lsZW50IHJlbW92YWwgYmV0d2VlbiBjb2NvcyB2ZXJzaW9ucy5cbiAgICAgKlxuICAgICAqIFJldHVybnMgdGhlIHN0YW5kYXJkIHNjZW5lLXNjcmlwdCBlbnZlbG9wZS4gUmVmZXJlbmNlcyB0aGVcbiAgICAgKiB0b3AtbGV2ZWwgYGNjZWAgZGVjbGFyYXRpb24gKG1hdGNoaW5nIHRoZSBwcmVmYWIgcGF0dGVybikgcmF0aGVyXG4gICAgICogdGhhbiByZWFjaGluZyB0aHJvdWdoIGBnbG9iYWxUaGlzYCBzbyB0aGUgcmVzb2x1dGlvbiBzZW1hbnRpY3NcbiAgICAgKiBtYXRjaCBvdGhlciBzY2VuZS1zY3JpcHQgbWV0aG9kcyBpbiB0aGlzIGZpbGUuXG4gICAgICovXG4gICAgYXN5bmMgY2hhbmdlUHJldmlld1BsYXlTdGF0ZShzdGF0ZTogYm9vbGVhbikge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBjY2UgPT09ICd1bmRlZmluZWQnIHx8IGNjZSA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKCdjY2UgZ2xvYmFsIGlzIG5vdCBhdmFpbGFibGU7IHRoaXMgbWV0aG9kIG11c3QgcnVuIGluIGEgc2NlbmUtc2NyaXB0IGNvbnRleHQuJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyB2Mi44LjI6IHByb2JlIHRoZSB0aHJlZSBjYW5kaWRhdGUgbG9jYXRpb25zIHRoZSBTY2VuZUZhY2FkZVxuICAgICAgICAgICAgLy8gc2luZ2xldG9uIGhhcyBiZWVuIG9ic2VydmVkIGF0IGFjcm9zcyBjb2NvcyBidWlsZHMuIFNhbWVcbiAgICAgICAgICAgIC8vIGNvbnZlbnRpb24gYXMgZ2V0UHJlZmFiRmFjYWRlLlxuICAgICAgICAgICAgY29uc3QgY2FuZGlkYXRlczogYW55W10gPSBbXG4gICAgICAgICAgICAgICAgKGNjZSBhcyBhbnkpLlNjZW5lRmFjYWRlLFxuICAgICAgICAgICAgICAgIChjY2UgYXMgYW55KS5TY2VuZUZhY2FkZU1hbmFnZXI/Lmluc3RhbmNlLFxuICAgICAgICAgICAgICAgIChjY2UgYXMgYW55KS5TY2VuZUZhY2FkZU1hbmFnZXIsXG4gICAgICAgICAgICBdO1xuICAgICAgICAgICAgY29uc3QgZmFjYWRlID0gY2FuZGlkYXRlcy5maW5kKFxuICAgICAgICAgICAgICAgIGMgPT4gYyAmJiB0eXBlb2YgYy5jaGFuZ2VQcmV2aWV3UGxheVN0YXRlID09PSAnZnVuY3Rpb24nLFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGlmICghZmFjYWRlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ05vIFNjZW5lRmFjYWRlIHdpdGggY2hhbmdlUHJldmlld1BsYXlTdGF0ZSBmb3VuZCBvbiBjY2UgKGNjZS5TY2VuZUZhY2FkZSAvIGNjZS5TY2VuZUZhY2FkZU1hbmFnZXIgLyAuaW5zdGFuY2UpLiBDb2NvcyB2ZXJzaW9uIG1heSBub3Qgc3VwcG9ydCBQSUUgY29udHJvbCB2aWEgdGhpcyBmYWNhZGUg4oCUIHVzZSB0aGUgdG9vbGJhciBwbGF5IGJ1dHRvbiBtYW51YWxseS4nKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGF3YWl0IGZhY2FkZS5jaGFuZ2VQcmV2aWV3UGxheVN0YXRlKEJvb2xlYW4oc3RhdGUpKTtcbiAgICAgICAgICAgIHJldHVybiBvayh7IHJlcXVlc3RlZFN0YXRlOiBCb29sZWFuKHN0YXRlKSB9KTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoZXJyb3I/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycm9yKSk7XG4gICAgICAgIH1cbiAgICB9LFxuXG59O1xuIl19