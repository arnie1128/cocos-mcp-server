/**
 * broadcast-bridge — translate cocos editor IPC broadcast events
 * into MCP `notifications/resources/updated` push notifications.
 *
 * Lifecycle:
 *   - `start(dispatch)` registers listeners on
 *     `Editor.Message.__protected__.addBroadcastListener` for a fixed
 *     set of "interesting" message types and wires each to one or
 *     more cocos:// resource URIs via BROADCAST_TO_URIS.
 *   - When a broadcast fires, the bridge schedules a per-URI
 *     debounced notification (default 1000 ms) — the actual dispatch
 *     callback is invoked at most once per URI per debounce window.
 *   - `stop()` removes all listeners and cancels pending timers.
 *
 * Why not subscribe by URI?
 *   Cocos broadcasts don't carry resource granularity, so one
 *   `scene:change-node` event maps to multiple URIs (current scene
 *   summary + hierarchy). The mapping is one-to-many and lives in
 *   BROADCAST_TO_URIS. The MCPServer's notify path is responsible
 *   for filtering URIs against per-session subscription sets.
 *
 * Debounce rationale:
 *   The plan called for probe-broadcast.js to inform the window;
 *   without that data, 1 s/URI is the conservative default. Worst
 *   case (drag-at-60fps) collapses to 1 push/sec/URI. Tunable via
 *   `setDebounceMs()` if probe data shows a different sweet spot.
 *
 * Editor API:
 *   `Editor.Message.__protected__.addBroadcastListener(message, fn)`
 *   per `@cocos/creator-types/editor/protected.d.ts`. Fall through
 *   to a no-op when `__protected__` isn't exposed (e.g. headless
 *   smoke tests run outside the editor host).
 */

import { logger } from './log';

export type ResourceUpdatedDispatch = (uri: string) => void;

/**
 * Cocos broadcast message → list of cocos:// resource URIs that should
 * be invalidated on that broadcast. Conservative on purpose: prefer
 * over-notifying than missing changes (clients re-read on receive
 * which is a cheap tools/call, not expensive). Tighten as we observe
 * the real event density via probe-broadcast.js + user feedback.
 */
const BROADCAST_TO_URIS: Record<string, string[]> = {
    // Scene mutation — current + hierarchy invalidate
    'scene:change-node': ['cocos://scene/current', 'cocos://scene/hierarchy'],
    'scene:select-nodes': ['cocos://scene/hierarchy'],
    'scene:unselect-nodes': ['cocos://scene/hierarchy'],
    'scene:ready': ['cocos://scene/current', 'cocos://scene/hierarchy'],
    'scene:close': ['cocos://scene/current', 'cocos://scene/hierarchy'],
    'scene:save-asset': [
        'cocos://scene/current',
        'cocos://scene/hierarchy',
        'cocos://scene/list',
        'cocos://prefabs',
        'cocos://assets',
    ],
    // Asset DB churn — anything that touches files invalidates the
    // generic asset list and the prefab/scene-list filtered views.
    'asset-db:asset-add': ['cocos://assets', 'cocos://prefabs', 'cocos://scene/list'],
    'asset-db:asset-change': ['cocos://assets', 'cocos://prefabs', 'cocos://scene/list'],
    'asset-db:asset-delete': ['cocos://assets', 'cocos://prefabs', 'cocos://scene/list'],
};

interface ProtectedMessage {
    addBroadcastListener?: (message: string, func: Function) => void;
    removeBroadcastListener?: (message: string, func: Function) => void;
}

function getProtected(): ProtectedMessage | null {
    try {
        // `Editor.Message.__protected__` per @cocos/creator-types
        const proto = (Editor as any)?.Message?.__protected__;
        if (proto && typeof proto.addBroadcastListener === 'function') return proto;
    } catch { /* swallow — Editor might not exist outside editor host */ }
    return null;
}

export class BroadcastBridge {
    private listeners: Map<string, Function> = new Map();
    private pending: Map<string, NodeJS.Timeout> = new Map();
    private debounceMs = 1000;
    private dispatch: ResourceUpdatedDispatch | null = null;
    private started = false;

    setDebounceMs(ms: number): void {
        if (ms < 0 || !Number.isFinite(ms)) return;
        this.debounceMs = ms;
    }

    isStarted(): boolean {
        return this.started;
    }

    start(dispatch: ResourceUpdatedDispatch): void {
        if (this.started) return;
        const proto = getProtected();
        if (!proto || !proto.addBroadcastListener) {
            logger.warn('[BroadcastBridge] Editor.Message.__protected__.addBroadcastListener unavailable; resources/subscribe push disabled. Tools still work; clients must poll.');
            return;
        }
        this.dispatch = dispatch;
        for (const [message, uris] of Object.entries(BROADCAST_TO_URIS)) {
            const fn = (..._args: unknown[]) => {
                for (const uri of uris) this.scheduleNotify(uri);
            };
            try {
                proto.addBroadcastListener(message, fn);
                this.listeners.set(message, fn);
            } catch (err: any) {
                logger.warn(`[BroadcastBridge] addBroadcastListener(${message}) failed:`, err?.message ?? err);
            }
        }
        this.started = true;
        logger.info(`[BroadcastBridge] registered ${this.listeners.size} broadcast listeners (debounce ${this.debounceMs}ms/URI)`);
    }

    stop(): void {
        if (!this.started) return;
        const proto = getProtected();
        for (const [message, fn] of this.listeners.entries()) {
            try {
                proto?.removeBroadcastListener?.(message, fn);
            } catch (err: any) {
                logger.debug(`[BroadcastBridge] removeBroadcastListener(${message}) failed:`, err?.message ?? err);
            }
        }
        this.listeners.clear();
        for (const t of this.pending.values()) clearTimeout(t);
        this.pending.clear();
        this.dispatch = null;
        this.started = false;
        logger.debug('[BroadcastBridge] stopped');
    }

    private scheduleNotify(uri: string): void {
        if (this.pending.has(uri)) return; // already scheduled in this window
        const t = setTimeout(() => {
            this.pending.delete(uri);
            const cb = this.dispatch;
            if (!cb) return;
            try { cb(uri); }
            catch (err: any) { logger.warn(`[BroadcastBridge] dispatch failed for ${uri}:`, err?.message ?? err); }
        }, this.debounceMs);
        // unref so the bridge timer doesn't block process teardown if
        // stop() somehow doesn't run before the timer fires.
        t.unref?.();
        this.pending.set(uri, t);
    }
}

// Exposed for tests / introspection — not used by the runtime.
export const _BROADCAST_TO_URIS_FOR_TEST = BROADCAST_TO_URIS;
