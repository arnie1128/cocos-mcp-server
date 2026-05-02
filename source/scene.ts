import { join } from 'path';
import { ok, fail } from './lib/response';
module.paths.push(join(Editor.App.path, 'node_modules'));

// `cce` is injected by Cocos Editor into the scene-script global scope.
// It is not declared in `@cocos/creator-types` exports; declare a minimal
// runtime shape just for what we touch here so TypeScript stays strict.
declare const cce: undefined | {
    Prefab?: PrefabFacade;
    SceneFacadeManager?: { instance?: PrefabFacade } & PrefabFacade;
};

interface PrefabFacade {
    createPrefab(nodeUuid: string, url: string): Promise<any>;
    applyPrefab(nodeUuid: string): Promise<any>;
    linkPrefab(nodeUuid: string, assetUuid: string): any;
    unlinkPrefab(nodeUuid: string, removeNested: boolean): any;
    getPrefabData(nodeUuid: string): any;
    restorePrefab?(uuid: string, assetUuid: string): Promise<boolean>;
}

type FacadeLookup = { ok: true; value: PrefabFacade } | { ok: false; error: string };

function getPrefabFacade(): FacadeLookup {
    if (typeof cce === 'undefined' || cce === null) {
        return { ok: false, error: 'cce global is not available; this method must run in a scene-script context' };
    }
    const candidates: Array<PrefabFacade | undefined> = [
        cce.Prefab,
        cce.SceneFacadeManager?.instance,
        cce.SceneFacadeManager as PrefabFacade | undefined,
    ];
    // Ensure the candidate exposes every facade method we may call;
    // a partial candidate would crash at the first missing method.
    const required: Array<keyof PrefabFacade> = ['createPrefab', 'applyPrefab', 'linkPrefab', 'unlinkPrefab', 'getPrefabData'];
    for (const candidate of candidates) {
        if (candidate && required.every(m => typeof (candidate as any)[m] === 'function')) {
            return { ok: true, value: candidate };
        }
    }
    return {
        ok: false,
        error: 'No complete prefab facade found on cce (cce.Prefab / cce.SceneFacadeManager). Cocos editor build may not expose the expected manager or only exposes a partial surface.',
    };
}

type ComponentLookup =
    | { ok: true; scene: any; node: any; component: any }
    | { ok: false; error: string };

function findNodeByUuidDeep(root: any, uuid: string): any {
    if (!root) return null;
    if (root._id === uuid || root.uuid === uuid) return root;
    const children = root.children ?? root._children ?? [];
    for (const child of children) {
        const hit = findNodeByUuidDeep(child, uuid);
        if (hit) return hit;
    }
    return null;
}

function resolveComponentContext(nodeUuid: string, componentType: string): ComponentLookup {
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

function serializeEventHandler(eh: any) {
    if (!eh) return null;
    return {
        targetUuid: eh.target?.uuid ?? null,
        targetName: eh.target?.name ?? null,
        component: eh.component ?? eh._componentName ?? null,
        handler: eh.handler ?? null,
        customEventData: eh.customEventData ?? '',
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
import { AsyncLocalStorage } from 'async_hooks';

type CapturedEntry = { level: 'log' | 'warn' | 'error'; message: string; ts: number };
type ConsoleSnapshot = { log: typeof console.log; warn: typeof console.warn; error: typeof console.error };

interface CaptureSlot {
    entries: CapturedEntry[];
    bytes: number;
    truncated: boolean;
}

const CAPTURE_MAX_ENTRIES = 500;
const CAPTURE_MAX_BYTES = 64 * 1024;
const _captureALS = new AsyncLocalStorage<CaptureSlot>();
let _activeSlotCount = 0;
let _origConsole: ConsoleSnapshot | null = null;

function _formatArgs(a: unknown[]): string {
    return a
        .map(x => {
            if (typeof x === 'string') return x;
            try { return JSON.stringify(x); } catch { return String(x); }
        })
        .join(' ');
}

function _appendBounded(slot: CaptureSlot, entry: CapturedEntry): void {
    if (slot.truncated) return;
    const entryBytes = entry.message.length + 32; // ~level + ts overhead
    if (slot.entries.length >= CAPTURE_MAX_ENTRIES || slot.bytes + entryBytes > CAPTURE_MAX_BYTES) {
        slot.truncated = true;
        const marker: CapturedEntry = { level: 'warn', message: '[capture truncated — exceeded entry/byte cap]', ts: Date.now() };
        slot.entries.push(marker);
        // v2.4.10 codex round-2 🟡: track marker bytes too so cap accounting
        // stays accurate even though no further appends will follow.
        slot.bytes += marker.message.length + 32;
        return;
    }
    slot.entries.push(entry);
    slot.bytes += entryBytes;
}

function _ensureConsoleHook(): void {
    if (_origConsole) return;
    _origConsole = { log: console.log, warn: console.warn, error: console.error };
    const make = (level: CapturedEntry['level'], orig: (...a: any[]) => void) =>
        (...a: any[]): void => {
            const slot = _captureALS.getStore();
            if (slot) {
                const message = _formatArgs(a);
                _appendBounded(slot, { level, message, ts: Date.now() });
            }
            try { orig.apply(console, a); } catch { /* swallow */ }
        };
    console.log = make('log', _origConsole.log);
    console.warn = make('warn', _origConsole.warn);
    console.error = make('error', _origConsole.error);
}

function _maybeUnhookConsole(): void {
    if (_activeSlotCount > 0 || !_origConsole) return;
    console.log = _origConsole.log;
    console.warn = _origConsole.warn;
    console.error = _origConsole.error;
    _origConsole = null;
}

export const methods: { [key: string]: (...any: any) => any } = {
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
    async runWithCapture(methodName: string, methodArgs?: unknown[]) {
        const slot: CaptureSlot = {
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
                const fn = methods[methodName];
                if (typeof fn !== 'function') {
                    return { ...fail(`runWithCapture: method ${methodName} not found`), capturedLogs: slot.entries };
                }
                try {
                    const result = await fn(...(methodArgs ?? []));
                    if (result && typeof result === 'object' && !Array.isArray(result)) {
                        return { ...result, capturedLogs: (result as any).capturedLogs ?? slot.entries };
                    }
                    return { ...ok(result), capturedLogs: slot.entries };
                } catch (err: any) {
                    return { ...fail(err?.message ?? String(err)), capturedLogs: slot.entries };
                }
            });
        } finally {
            _activeSlotCount = Math.max(0, _activeSlotCount - 1);
            _maybeUnhookConsole();
        }
    },

    /**
     * Add component to a node
     */
    addComponentToNode(nodeUuid: string, componentType: string) {
        try {
            const { director, js } = require('cc');
            const scene = director.getScene();
            if (!scene) {
                return fail('No active scene');
            }

            // Find node by UUID
            const node = scene.getChildByUuid(nodeUuid);
            if (!node) {
                return fail(`Node with UUID ${nodeUuid} not found`);
            }

            // Get component class
            const ComponentClass = js.getClassByName(componentType);
            if (!ComponentClass) {
                return fail(`Component type ${componentType} not found`);
            }

            // Add component
            const component = node.addComponent(ComponentClass);
            return ok({ componentId: component.uuid }, `Component ${componentType} added successfully`);
        } catch (error: any) {
            return fail(error.message);
        }
    },

    /**
     * Create a new node
     */
    createNode(name: string, parentUuid?: string) {
        try {
            const { director, Node } = require('cc');
            const scene = director.getScene();
            if (!scene) {
                return fail('No active scene');
            }

            const node = new Node(name);
            
            if (parentUuid) {
                const parent = scene.getChildByUuid(parentUuid);
                if (parent) {
                    parent.addChild(node);
                } else {
                    scene.addChild(node);
                }
            } else {
                scene.addChild(node);
            }

            return ok({ uuid: node.uuid, name: node.name }, `Node ${name} created successfully`);
        } catch (error: any) {
            return fail(error.message);
        }
    },

    /**
     * Get node information
     */
    getNodeInfo(nodeUuid: string) {
        try {
            const { director } = require('cc');
            const scene = director.getScene();
            if (!scene) {
                return fail('No active scene');
            }

            const node = scene.getChildByUuid(nodeUuid);
            if (!node) {
                return fail(`Node with UUID ${nodeUuid} not found`);
            }

            return ok({
                uuid: node.uuid,
                name: node.name,
                active: node.active,
                position: node.position,
                rotation: node.rotation,
                scale: node.scale,
                parent: node.parent?.uuid,
                children: node.children.map((child: any) => child.uuid),
                components: node.components.map((comp: any) => ({
                    type: comp.constructor.name,
                    enabled: comp.enabled
                }))
            });
        } catch (error: any) {
            return fail(error.message);
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
                return fail('No active scene');
            }

            const nodes: any[] = [];
            const collectNodes = (node: any) => {
                nodes.push({
                    uuid: node.uuid,
                    name: node.name,
                    active: node.active,
                    parent: node.parent?.uuid
                });
                
                node.children.forEach((child: any) => collectNodes(child));
            };

            scene.children.forEach((child: any) => collectNodes(child));
            
            return ok(nodes);
        } catch (error: any) {
            return fail(error.message);
        }
    },

    /**
     * Find node by name
     */
    findNodeByName(name: string) {
        try {
            const { director } = require('cc');
            const scene = director.getScene();
            if (!scene) {
                return fail('No active scene');
            }

            const node = scene.getChildByName(name);
            if (!node) {
                return fail(`Node with name ${name} not found`);
            }

            return ok({
                uuid: node.uuid,
                name: node.name,
                active: node.active,
                position: node.position
            });
        } catch (error: any) {
            return fail(error.message);
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
                return fail('No active scene');
            }

            return ok({
                name: scene.name,
                uuid: scene.uuid,
                nodeCount: scene.children.length
            });
        } catch (error: any) {
            return fail(error.message);
        }
    },

    /**
     * Set node property
     */
    setNodeProperty(nodeUuid: string, property: string, value: any) {
        try {
            const { director } = require('cc');
            const scene = director.getScene();
            if (!scene) {
                return fail('No active scene');
            }

            const node = scene.getChildByUuid(nodeUuid);
            if (!node) {
                return fail(`Node with UUID ${nodeUuid} not found`);
            }

            // 設置屬性
            if (property === 'position') {
                node.setPosition(value.x || 0, value.y || 0, value.z || 0);
            } else if (property === 'rotation') {
                node.setRotationFromEuler(value.x || 0, value.y || 0, value.z || 0);
            } else if (property === 'scale') {
                node.setScale(value.x || 1, value.y || 1, value.z || 1);
            } else if (property === 'active') {
                node.active = value;
            } else if (property === 'name') {
                node.name = value;
            } else {
                // 嘗試直接設置屬性
                (node as any)[property] = value;
            }

            return ok(undefined, `Property '${property}' updated successfully`);
        } catch (error: any) {
            return fail(error.message);
        }
    },

    /**
     * Get scene hierarchy
     */
    getSceneHierarchy(includeComponents: boolean = false) {
        try {
            const { director } = require('cc');
            const scene = director.getScene();
            if (!scene) {
                return fail('No active scene');
            }

            const processNode = (node: any): any => {
                const result: any = {
                    name: node.name,
                    uuid: node.uuid,
                    active: node.active,
                    children: []
                };

                if (includeComponents) {
                    result.components = node.components.map((comp: any) => ({
                        type: comp.constructor.name,
                        enabled: comp.enabled
                    }));
                }

                if (node.children && node.children.length > 0) {
                    result.children = node.children.map((child: any) => processNode(child));
                }

                return result;
            };

            const hierarchy = scene.children.map((child: any) => processNode(child));
            return ok(hierarchy);
        } catch (error: any) {
            return fail(error.message);
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
    async createPrefabFromNode(nodeUuid: string, url: string) {
        const prefabMgr = getPrefabFacade();
        if (!prefabMgr.ok) {
            return fail(prefabMgr.error);
        }
        try {
            const tries: string[] = [];
            // Prefer db:// form (matches asset-db query results) and fall
            // back to whatever the caller passed verbatim.
            const dbUrl = url.startsWith('db://') ? url : `db://assets/${url.replace(/^\/+/, '')}`;
            tries.push(dbUrl);
            if (dbUrl !== url) {
                tries.push(url);
            }

            const errors: string[] = [];
            for (const candidate of tries) {
                try {
                    const result = await prefabMgr.value.createPrefab(nodeUuid, candidate);
                    // cce.Prefab.createPrefab repurposes the source node into a
                    // prefab instance with a fresh UUID, so the caller-supplied
                    // nodeUuid is no longer valid. Resolve the new UUID by
                    // querying nodes that reference the freshly minted asset.
                    let assetUuid: string | null = null;
                    if (typeof result === 'string') {
                        assetUuid = result;
                    } else if (result && typeof result === 'object' && typeof (result as any).uuid === 'string') {
                        assetUuid = (result as any).uuid;
                    }
                    let instanceNodeUuid: string | null = null;
                    if (assetUuid) {
                        try {
                            const instances: any = await Editor.Message.request('scene', 'query-nodes-by-asset-uuid', assetUuid);
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
                        } catch {
                            // Non-fatal: the asset was created either way.
                        }
                    }
                    return ok({
                        url: candidate,
                        sourceNodeUuid: nodeUuid,
                        prefabAssetUuid: assetUuid,
                        instanceNodeUuid,
                        raw: result,
                    });
                } catch (err: any) {
                    errors.push(`${candidate}: ${err?.message ?? err}`);
                }
            }
            return fail(`cce.Prefab.createPrefab failed: ${errors.join('; ')}`);
        } catch (error: any) {
            return fail(error?.message ?? String(error));
        }
    },

    /**
     * Push prefab instance edits back to the prefab asset.
     * Wraps scene facade `applyPrefab(nodeUuid)`.
     */
    async applyPrefab(nodeUuid: string) {
        const prefabMgr = getPrefabFacade();
        if (!prefabMgr.ok) {
            return fail(prefabMgr.error);
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
            return ok({ facadeReturn, nodeUuid });
        } catch (error: any) {
            return fail(error?.message ?? String(error));
        }
    },

    /**
     * Connect a regular node to a prefab asset (link).
     * Wraps scene facade `linkPrefab(nodeUuid, assetUuid)`.
     */
    async linkPrefab(nodeUuid: string, assetUuid: string) {
        const prefabMgr = getPrefabFacade();
        if (!prefabMgr.ok) {
            return fail(prefabMgr.error);
        }
        try {
            const result = await prefabMgr.value.linkPrefab(nodeUuid, assetUuid);
            return ok({ linked: result, nodeUuid, assetUuid });
        } catch (error: any) {
            return fail(error?.message ?? String(error));
        }
    },

    /**
     * Break the prefab connection on a node.
     * Wraps scene facade `unlinkPrefab(nodeUuid, removeNested)`.
     */
    async unlinkPrefab(nodeUuid: string, removeNested: boolean) {
        const prefabMgr = getPrefabFacade();
        if (!prefabMgr.ok) {
            return fail(prefabMgr.error);
        }
        try {
            const result = await prefabMgr.value.unlinkPrefab(nodeUuid, removeNested);
            return ok({ unlinked: result, nodeUuid, removeNested });
        } catch (error: any) {
            return fail(error?.message ?? String(error));
        }
    },

    /**
     * Read the prefab dump for a prefab instance node.
     * Wraps scene facade `getPrefabData(nodeUuid)`.
     */
    getPrefabData(nodeUuid: string) {
        const prefabMgr = getPrefabFacade();
        if (!prefabMgr.ok) {
            return fail(prefabMgr.error);
        }
        try {
            const data = prefabMgr.value.getPrefabData(nodeUuid);
            return ok(data);
        } catch (error: any) {
            return fail(error?.message ?? String(error));
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
    addEventHandler(
        nodeUuid: string,
        componentType: string,
        eventArrayProperty: string,
        targetUuid: string,
        componentName: string,
        handler: string,
        customEventData?: string,
    ) {
        try {
            const cc = require('cc');
            const ctx = resolveComponentContext(nodeUuid, componentType);
            if (!ctx.ok) {
                return fail(ctx.error);
            }
            const targetNode = findNodeByUuidDeep(ctx.scene, targetUuid);
            if (!targetNode) {
                return fail(`Target node with UUID ${targetUuid} not found`);
            }
            const arr = ctx.component[eventArrayProperty];
            if (!Array.isArray(arr)) {
                return fail(`Property '${eventArrayProperty}' on ${componentType} is not an array (got ${typeof arr})`);
            }

            const eh = new cc.EventHandler();
            eh.target = targetNode;
            eh.component = componentName;
            eh.handler = handler;
            eh.customEventData = customEventData ?? '';
            arr.push(eh);

            Editor.Message.send('scene', 'snapshot');
            return ok({
                    index: arr.length - 1,
                    count: arr.length,
                    componentUuid: ctx.component.uuid,
                    componentEnabled: ctx.component.enabled !== false,
                });
        } catch (error: any) {
            return fail(error?.message ?? String(error));
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
    removeEventHandler(
        nodeUuid: string,
        componentType: string,
        eventArrayProperty: string,
        index: number | null,
        targetUuid: string | null,
        handler: string | null,
    ) {
        try {
            const ctx = resolveComponentContext(nodeUuid, componentType);
            if (!ctx.ok) {
                return fail(ctx.error);
            }
            const arr = ctx.component[eventArrayProperty];
            if (!Array.isArray(arr)) {
                return fail(`Property '${eventArrayProperty}' on ${componentType} is not an array`);
            }

            // Trim around comparisons so callers passing UUIDs / handler
            // names with leading/trailing whitespace (LLM tool args often
            // come with stray spaces) still find a match. Crucial: the
            // outer guard tests the *trimmed* values too — otherwise a
            // whitespace-only targetUuid/handler would pass as truthy,
            // collapse to null after trim, and the predicate would match
            // every entry vacuously, silently deleting arr[0].
            const targetUuidNorm = targetUuid?.trim() || null;
            const handlerNorm = handler?.trim() || null;
            let removeAt = -1;
            if (typeof index === 'number' && index >= 0) {
                removeAt = index;
            } else if (targetUuidNorm || handlerNorm) {
                removeAt = arr.findIndex((eh: any) => {
                    const ehTargetUuid = typeof eh?.target?.uuid === 'string' ? eh.target.uuid.trim() : eh?.target?.uuid;
                    const ehHandler = typeof eh?.handler === 'string' ? eh.handler.trim() : eh?.handler;
                    const matchesTarget = !targetUuidNorm || ehTargetUuid === targetUuidNorm;
                    const matchesHandler = !handlerNorm || ehHandler === handlerNorm;
                    return matchesTarget && matchesHandler;
                });
            }
            if (removeAt < 0 || removeAt >= arr.length) {
                return fail('No matching event handler to remove');
            }
            const removed = arr.splice(removeAt, 1)[0];
            Editor.Message.send('scene', 'snapshot');
            return ok({
                    index: removeAt,
                    remaining: arr.length,
                    removed: serializeEventHandler(removed),
                    componentUuid: ctx.component.uuid,
                    componentEnabled: ctx.component.enabled !== false,
                });
        } catch (error: any) {
            return fail(error?.message ?? String(error));
        }
    },

    /**
     * Inspect a component's EventHandler array (read-only).
     */
    listEventHandlers(nodeUuid: string, componentType: string, eventArrayProperty: string) {
        try {
            const ctx = resolveComponentContext(nodeUuid, componentType);
            if (!ctx.ok) {
                return fail(ctx.error);
            }
            const arr = ctx.component[eventArrayProperty];
            if (!Array.isArray(arr)) {
                return fail(`Property '${eventArrayProperty}' on ${componentType} is not an array`);
            }
            return ok({
                    count: arr.length,
                    handlers: arr.map(serializeEventHandler),
                });
        } catch (error: any) {
            return fail(error?.message ?? String(error));
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
    getAnimationClips(nodeUuid: string) {
        try {
            const { director } = require('cc');
            const scene = director.getScene();
            if (!scene) return fail('No active scene');
            const node = findNodeByUuidDeep(scene, nodeUuid);
            if (!node) return fail(`Node ${nodeUuid} not found`);
            const anim = node.getComponent('cc.Animation');
            if (!anim) {
                return fail(`Node ${nodeUuid} has no cc.Animation component`);
            }
            const clips: any[] = anim.clips ?? [];
            const defaultClipName = anim.defaultClip?.name ?? null;
            return ok({
                    nodeUuid,
                    nodeName: node.name,
                    defaultClip: defaultClipName,
                    playOnLoad: anim.playOnLoad === true,
                    clips: clips.filter(c => c).map(c => ({
                        name: c.name ?? null,
                        uuid: c._uuid ?? c.uuid ?? null,
                        duration: typeof c.duration === 'number' ? c.duration : null,
                        wrapMode: c.wrapMode ?? null,
                    })),
                });
        } catch (error: any) {
            return fail(error?.message ?? String(error));
        }
    },

    listAnimationStates(nodeUuid: string) {
        try {
            const { director } = require('cc');
            const scene = director.getScene();
            if (!scene) return fail('No active scene');
            const node = findNodeByUuidDeep(scene, nodeUuid);
            if (!node) return fail(`Node ${nodeUuid} not found`);
            const anim = node.getComponent('cc.Animation');
            if (!anim) {
                return fail(`Node ${nodeUuid} has no cc.Animation component`);
            }
            const clips: any[] = typeof anim.getAnimationClips === 'function'
                ? anim.getAnimationClips()
                : (anim.clips ?? []);
            const states = clips
                .filter((clip: any) => clip?.name)
                .map((clip: any) => anim.getState(clip.name))
                .filter((state: any) => state)
                .map((state: any) => ({
                    name: state.name ?? null,
                    speed: typeof state.speed === 'number' ? state.speed : null,
                    totalTime: typeof state.totalTime === 'number' ? state.totalTime : null,
                    currentTime: typeof state.currentTime === 'number' ? state.currentTime : null,
                    isPlaying: state.isPlaying === true,
                }));
            return ok(states);
        } catch (error: any) {
            return fail(error?.message ?? String(error));
        }
    },

    getAnimationStateInfo(nodeUuid: string, stateName: string) {
        try {
            const { director } = require('cc');
            const scene = director.getScene();
            if (!scene) return fail('No active scene');
            const node = findNodeByUuidDeep(scene, nodeUuid);
            if (!node) return fail(`Node ${nodeUuid} not found`);
            const anim = node.getComponent('cc.Animation');
            if (!anim) {
                return fail(`Node ${nodeUuid} has no cc.Animation component`);
            }
            const state = anim.getState(stateName);
            if (!state) {
                return fail(`Animation state '${stateName}' not found`);
            }
            return ok({
                    speed: typeof state.speed === 'number' ? state.speed : null,
                    isPlaying: state.isPlaying === true,
                    currentTime: typeof state.currentTime === 'number' ? state.currentTime : null,
                    totalTime: typeof state.totalTime === 'number' ? state.totalTime : null,
                });
        } catch (error: any) {
            return fail(error?.message ?? String(error));
        }
    },

    setAnimationSpeed(nodeUuid: string, stateName: string, speed: number) {
        try {
            const { director } = require('cc');
            const scene = director.getScene();
            if (!scene) return fail('No active scene');
            const node = findNodeByUuidDeep(scene, nodeUuid);
            if (!node) return fail(`Node ${nodeUuid} not found`);
            const anim = node.getComponent('cc.Animation');
            if (!anim) {
                return fail(`Node ${nodeUuid} has no cc.Animation component`);
            }
            const state = anim.getState(stateName);
            if (!state) {
                return fail(`Animation state '${stateName}' not found`);
            }
            state.speed = speed;
            return ok({
                    speed: state.speed,
                    isPlaying: state.isPlaying === true,
                    currentTime: typeof state.currentTime === 'number' ? state.currentTime : null,
                    totalTime: typeof state.totalTime === 'number' ? state.totalTime : null,
                });
        } catch (error: any) {
            return fail(error?.message ?? String(error));
        }
    },

    checkAnimationFinished(nodeUuid: string, stateName: string) {
        try {
            const { director } = require('cc');
            const scene = director.getScene();
            if (!scene) return fail('No active scene');
            const node = findNodeByUuidDeep(scene, nodeUuid);
            if (!node) return fail(`Node ${nodeUuid} not found`);
            const anim = node.getComponent('cc.Animation');
            if (!anim) {
                return fail(`Node ${nodeUuid} has no cc.Animation component`);
            }
            const state = anim.getState(stateName);
            if (!state) {
                return fail(`Animation state '${stateName}' not found`);
            }
            const currentTime = typeof state.currentTime === 'number' ? state.currentTime : 0;
            const totalTime = typeof state.totalTime === 'number' ? state.totalTime : 0;
            return ok({ finished: currentTime >= totalTime });
        } catch (error: any) {
            return fail(error?.message ?? String(error));
        }
    },

    playAnimation(nodeUuid: string, clipName?: string) {
        try {
            const { director } = require('cc');
            const scene = director.getScene();
            if (!scene) return fail('No active scene');
            const node = findNodeByUuidDeep(scene, nodeUuid);
            if (!node) return fail(`Node ${nodeUuid} not found`);
            const anim = node.getComponent('cc.Animation');
            if (!anim) {
                return fail(`Node ${nodeUuid} has no cc.Animation component`);
            }
            if (clipName) {
                // Validate clip exists before calling play() — cc.Animation.play
                // silently does nothing on unknown names which would mask
                // typos in AI-generated calls.
                const known = (anim.clips ?? []).some((c: any) => c?.name === clipName);
                if (!known && (anim.defaultClip?.name !== clipName)) {
                    return fail(`Clip '${clipName}' is not registered on this Animation. Known: ${(anim.clips ?? []).map((c: any) => c?.name).filter(Boolean).join(', ') || '(none)'}.`);
                }
                anim.play(clipName);
            } else {
                if (!anim.defaultClip) {
                    return fail('No clipName given and no defaultClip configured');
                }
                anim.play();
            }
            return ok({ nodeUuid, clipName: clipName ?? anim.defaultClip?.name ?? null }, `Playing '${clipName ?? anim.defaultClip?.name}' on ${node.name}`);
        } catch (error: any) {
            return fail(error?.message ?? String(error));
        }
    },

    stopAnimation(nodeUuid: string) {
        try {
            const { director } = require('cc');
            const scene = director.getScene();
            if (!scene) return fail('No active scene');
            const node = findNodeByUuidDeep(scene, nodeUuid);
            if (!node) return fail(`Node ${nodeUuid} not found`);
            const anim = node.getComponent('cc.Animation');
            if (!anim) {
                return fail(`Node ${nodeUuid} has no cc.Animation component`);
            }
            anim.stop();
            return ok(undefined, `Stopped animation on ${node.name}`);
        } catch (error: any) {
            return fail(error?.message ?? String(error));
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
    queryAnimationSetTargets(nodeUuid: string, clipName: string | null) {
        try {
            const { director } = require('cc');
            const scene = director.getScene();
            if (!scene) return fail('No active scene');
            const node = findNodeByUuidDeep(scene, nodeUuid);
            if (!node) return fail(`Node ${nodeUuid} not found`);
            // v2.4.9 review fix (claude + codex 🟡): use indexOf on the
            // resolved anim instance directly. The previous metadata-string
            // lookup (constructor.name / __classname__ / _cid) was fragile
            // against custom subclasses (cc.SkeletalAnimation, user-derived
            // cc.Animation). getComponent('cc.Animation') resolves subclasses
            // correctly; matching by reference is the canonical way to find
            // the same instance's slot in __comps__.
            const anim = node.getComponent('cc.Animation');
            if (!anim) {
                return fail(`Node ${nodeUuid} has no cc.Animation component`);
            }
            const components: any[] = (node._components ?? node.components ?? []);
            const compIndex = components.indexOf(anim);
            if (compIndex === -1) {
                return fail(`Node ${nodeUuid} cc.Animation component not found in __comps__ array (cocos editor inconsistency).`);
            }
            let clipUuid: string | null = null;
            if (clipName !== null && clipName !== undefined) {
                const clip = (anim.clips ?? []).find((c: any) => c?.name === clipName);
                if (!clip) {
                    return fail(`Clip '${clipName}' is not registered on this Animation. Known: ${(anim.clips ?? []).map((c: any) => c?.name).filter(Boolean).join(', ') || '(none)'}.`);
                }
                clipUuid = clip._uuid ?? clip.uuid ?? null;
                if (!clipUuid) {
                    return fail(`Clip '${clipName}' has no asset uuid; cannot persist as defaultClip.`);
                }
            }
            return ok({
                    componentIndex: compIndex,
                    clipUuid,
                    currentDefaultClip: anim.defaultClip?.name ?? null,
                    currentPlayOnLoad: anim.playOnLoad === true,
                });
        } catch (error: any) {
            return fail(error?.message ?? String(error));
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
    async changePreviewPlayState(state: boolean) {
        try {
            if (typeof cce === 'undefined' || cce === null) {
                return fail('cce global is not available; this method must run in a scene-script context.');
            }
            // v2.8.2: probe the three candidate locations the SceneFacade
            // singleton has been observed at across cocos builds. Same
            // convention as getPrefabFacade.
            const candidates: any[] = [
                (cce as any).SceneFacade,
                (cce as any).SceneFacadeManager?.instance,
                (cce as any).SceneFacadeManager,
            ];
            const facade = candidates.find(
                c => c && typeof c.changePreviewPlayState === 'function',
            );
            if (!facade) {
                return fail('No SceneFacade with changePreviewPlayState found on cce (cce.SceneFacade / cce.SceneFacadeManager / .instance). Cocos version may not support PIE control via this facade — use the toolbar play button manually.');
            }
            await facade.changePreviewPlayState(Boolean(state));
            return ok({ requestedState: Boolean(state) });
        } catch (error: any) {
            return fail(error?.message ?? String(error));
        }
    },

};
