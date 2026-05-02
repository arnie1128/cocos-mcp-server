"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports._BROADCAST_TO_URIS_FOR_TEST = exports.BroadcastBridge = void 0;
const log_1 = require("./log");
/**
 * Cocos broadcast message → list of cocos:// resource URIs that should
 * be invalidated on that broadcast. Conservative on purpose: prefer
 * over-notifying than missing changes (clients re-read on receive
 * which is a cheap tools/call, not expensive). Tighten as we observe
 * the real event density via probe-broadcast.js + user feedback.
 */
const BROADCAST_TO_URIS = {
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
function getProtected() {
    var _a;
    try {
        // `Editor.Message.__protected__` per @cocos/creator-types
        const proto = (_a = Editor === null || Editor === void 0 ? void 0 : Editor.Message) === null || _a === void 0 ? void 0 : _a.__protected__;
        if (proto && typeof proto.addBroadcastListener === 'function')
            return proto;
    }
    catch ( /* swallow — Editor might not exist outside editor host */_b) { /* swallow — Editor might not exist outside editor host */ }
    return null;
}
class BroadcastBridge {
    constructor() {
        this.listeners = new Map();
        this.pending = new Map();
        this.debounceMs = 1000;
        this.dispatch = null;
        this.started = false;
    }
    setDebounceMs(ms) {
        if (ms < 0 || !Number.isFinite(ms))
            return;
        this.debounceMs = ms;
    }
    isStarted() {
        return this.started;
    }
    start(dispatch) {
        var _a;
        if (this.started)
            return;
        const proto = getProtected();
        if (!proto || !proto.addBroadcastListener) {
            log_1.logger.warn('[BroadcastBridge] Editor.Message.__protected__.addBroadcastListener unavailable; resources/subscribe push disabled. Tools still work; clients must poll.');
            return;
        }
        this.dispatch = dispatch;
        for (const [message, uris] of Object.entries(BROADCAST_TO_URIS)) {
            const fn = (..._args) => {
                for (const uri of uris)
                    this.scheduleNotify(uri);
            };
            try {
                proto.addBroadcastListener(message, fn);
                this.listeners.set(message, fn);
            }
            catch (err) {
                log_1.logger.warn(`[BroadcastBridge] addBroadcastListener(${message}) failed:`, (_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : err);
            }
        }
        this.started = true;
        log_1.logger.info(`[BroadcastBridge] registered ${this.listeners.size} broadcast listeners (debounce ${this.debounceMs}ms/URI)`);
    }
    stop() {
        var _a, _b;
        if (!this.started)
            return;
        const proto = getProtected();
        for (const [message, fn] of this.listeners.entries()) {
            try {
                (_a = proto === null || proto === void 0 ? void 0 : proto.removeBroadcastListener) === null || _a === void 0 ? void 0 : _a.call(proto, message, fn);
            }
            catch (err) {
                log_1.logger.debug(`[BroadcastBridge] removeBroadcastListener(${message}) failed:`, (_b = err === null || err === void 0 ? void 0 : err.message) !== null && _b !== void 0 ? _b : err);
            }
        }
        this.listeners.clear();
        for (const t of this.pending.values())
            clearTimeout(t);
        this.pending.clear();
        this.dispatch = null;
        this.started = false;
        log_1.logger.debug('[BroadcastBridge] stopped');
    }
    scheduleNotify(uri) {
        var _a;
        if (this.pending.has(uri))
            return; // already scheduled in this window
        const t = setTimeout(() => {
            var _a;
            this.pending.delete(uri);
            const cb = this.dispatch;
            if (!cb)
                return;
            try {
                cb(uri);
            }
            catch (err) {
                log_1.logger.warn(`[BroadcastBridge] dispatch failed for ${uri}:`, (_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : err);
            }
        }, this.debounceMs);
        // unref so the bridge timer doesn't block process teardown if
        // stop() somehow doesn't run before the timer fires.
        (_a = t.unref) === null || _a === void 0 ? void 0 : _a.call(t);
        this.pending.set(uri, t);
    }
}
exports.BroadcastBridge = BroadcastBridge;
// Exposed for tests / introspection — not used by the runtime.
exports._BROADCAST_TO_URIS_FOR_TEST = BROADCAST_TO_URIS;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvYWRjYXN0LWJyaWRnZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NvdXJjZS9saWIvYnJvYWRjYXN0LWJyaWRnZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBZ0NHOzs7QUFFSCwrQkFBK0I7QUFJL0I7Ozs7OztHQU1HO0FBQ0gsTUFBTSxpQkFBaUIsR0FBNkI7SUFDaEQsa0RBQWtEO0lBQ2xELG1CQUFtQixFQUFFLENBQUMsdUJBQXVCLEVBQUUseUJBQXlCLENBQUM7SUFDekUsb0JBQW9CLEVBQUUsQ0FBQyx5QkFBeUIsQ0FBQztJQUNqRCxzQkFBc0IsRUFBRSxDQUFDLHlCQUF5QixDQUFDO0lBQ25ELGFBQWEsRUFBRSxDQUFDLHVCQUF1QixFQUFFLHlCQUF5QixDQUFDO0lBQ25FLGFBQWEsRUFBRSxDQUFDLHVCQUF1QixFQUFFLHlCQUF5QixDQUFDO0lBQ25FLGtCQUFrQixFQUFFO1FBQ2hCLHVCQUF1QjtRQUN2Qix5QkFBeUI7UUFDekIsb0JBQW9CO1FBQ3BCLGlCQUFpQjtRQUNqQixnQkFBZ0I7S0FDbkI7SUFDRCwrREFBK0Q7SUFDL0QsK0RBQStEO0lBQy9ELG9CQUFvQixFQUFFLENBQUMsZ0JBQWdCLEVBQUUsaUJBQWlCLEVBQUUsb0JBQW9CLENBQUM7SUFDakYsdUJBQXVCLEVBQUUsQ0FBQyxnQkFBZ0IsRUFBRSxpQkFBaUIsRUFBRSxvQkFBb0IsQ0FBQztJQUNwRix1QkFBdUIsRUFBRSxDQUFDLGdCQUFnQixFQUFFLGlCQUFpQixFQUFFLG9CQUFvQixDQUFDO0NBQ3ZGLENBQUM7QUFPRixTQUFTLFlBQVk7O0lBQ2pCLElBQUksQ0FBQztRQUNELDBEQUEwRDtRQUMxRCxNQUFNLEtBQUssR0FBRyxNQUFDLE1BQWMsYUFBZCxNQUFNLHVCQUFOLE1BQU0sQ0FBVSxPQUFPLDBDQUFFLGFBQWEsQ0FBQztRQUN0RCxJQUFJLEtBQUssSUFBSSxPQUFPLEtB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QUEsQ0FBQyxDQUFDLEtBQUssaURBQUksQ0FBQztRQUNaLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUM3QixDQUFDO0NBQ0o7QUF2RUQsMENBdUVDO0FBRUQsK0RBQStEO0FBQ2xELFFBQUEsMkJBQTJCLEdBQUcsaUJBQWlCLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIGJyb2FkY2FzdC1icmlkZ2Ug4oCUIHRyYW5zbGF0ZSBjb2NvcyBlZGl0b3IgSVBDIGJyb2FkY2FzdCBldmVudHNcbiAqIGludG8gTUNQIGBub3RpZmljYXRpb25zL3Jlc291cmNlcy91cGRhdGVkYCBwdXNoIG5vdGlmaWNhdGlvbnMuXG4gKlxuICogTGlmZWN5Y2xlOlxuICogICAtIGBzdGFydChkaXNwYXRjaClgIHJlZ2lzdGVycyBsaXN0ZW5lcnMgb25cbiAqICAgICBgRWRpdG9yLk1lc3NhZ2UuX19wcm90ZWN0ZWRfXy5hZGRCcm9hZGNhc3RMaXN0ZW5lcmAgZm9yIGEgZml4ZWRcbiAqICAgICBzZXQgb2YgXCJpbnRlcmVzdGluZ1wiIG1lc3NhZ2UgdHlwZXMgYW5kIHdpcmVzIGVhY2ggdG8gb25lIG9yXG4gKiAgICAgbW9yZSBjb2NvczovLyByZXNvdXJjZSBVUklzIHZpYSBCUk9BRENBU1RfVE9fVVJJUy5cbiAqICAgLSBXaGVuIGEgYnJvYWRjYXN0IGZpcmVzLCB0aGUgYnJpZGdlIHNjaGVkdWxlcyBhIHBlci1VUklcbiAqICAgICBkZWJvdW5jZWQgbm90aWZpY2F0aW9uIChkZWZhdWx0IDEwMDAgbXMpIOKAlCB0aGUgYWN0dWFsIGRpc3BhdGNoXG4gKiAgICAgY2FsbGJhY2sgaXMgaW52b2tlZCBhdCBtb3N0IG9uY2UgcGVyIFVSSSBwZXIgZGVib3VuY2Ugd2luZG93LlxuICogICAtIGBzdG9wKClgIHJlbW92ZXMgYWxsIGxpc3RlbmVycyBhbmQgY2FuY2VscyBwZW5kaW5nIHRpbWVycy5cbiAqXG4gKiBXaHkgbm90IHN1YnNjcmliZSBieSBVUkk/XG4gKiAgIENvY29zIGJyb2FkY2FzdHMgZG9uJ3QgY2FycnkgcmVzb3VyY2UgZ3JhbnVsYXJpdHksIHNvIG9uZVxuICogICBgc2NlbmU6Y2hhbmdlLW5vZGVgIGV2ZW50IG1hcHMgdG8gbXVsdGlwbGUgVVJJcyAoY3VycmVudCBzY2VuZVxuICogICBzdW1tYXJ5ICsgaGllcmFyY2h5KS4gVGhlIG1hcHBpbmcgaXMgb25lLXRvLW1hbnkgYW5kIGxpdmVzIGluXG4gKiAgIEJST0FEQ0FTVF9UT19VUklTLiBUaGUgTUNQU2VydmVyJ3Mgbm90aWZ5IHBhdGggaXMgcmVzcG9uc2libGVcbiAqICAgZm9yIGZpbHRlcmluZyBVUklzIGFnYWluc3QgcGVyLXNlc3Npb24gc3Vic2NyaXB0aW9uIHNldHMuXG4gKlxuICogRGVib3VuY2UgcmF0aW9uYWxlOlxuICogICBUaGUgcGxhbiBjYWxsZWQgZm9yIHByb2JlLWJyb2FkY2FzdC5qcyB0byBpbmZvcm0gdGhlIHdpbmRvdztcbiAqICAgd2l0aG91dCB0aGF0IGRhdGEsIDEgcy9VUkkgaXMgdGhlIGNvbnNlcnZhdGl2ZSBkZWZhdWx0LiBXb3JzdFxuICogICBjYXNlIChkcmFnLWF0LTYwZnBzKSBjb2xsYXBzZXMgdG8gMSBwdXNoL3NlYy9VUkkuIFR1bmFibGUgdmlhXG4gKiAgIGBzZXREZWJvdW5jZU1zKClgIGlmIHByb2JlIGRhdGEgc2hvd3MgYSBkaWZmZXJlbnQgc3dlZXQgc3BvdC5cbiAqXG4gKiBFZGl0b3IgQVBJOlxuICogICBgRWRpdG9yLk1lc3NhZ2UuX19wcm90ZWN0ZWRfXy5hZGRCcm9hZGNhc3RMaXN0ZW5lcihtZXNzYWdlLCBmbilgXG4gKiAgIHBlciBgQGNvY29zL2NyZWF0b3ItdHlwZXMvZWRpdG9yL3Byb3RlY3RlZC5kLnRzYC4gRmFsbCB0aHJvdWdoXG4gKiAgIHRvIGEgbm8tb3Agd2hlbiBgX19wcm90ZWN0ZWRfX2AgaXNuJ3QgZXhwb3NlZCAoZS5nLiBoZWFkbGVzc1xuICogICBzbW9rZSB0ZXN0cyBydW4gb3V0c2lkZSB0aGUgZWRpdG9yIGhvc3QpLlxuICovXG5cbmltcG9ydCB7IGxvZ2dlciB9IGZyb20gJy4vbG9nJztcblxuZXhwb3J0IHR5cGUgUmVzb3VyY2VVcGRhdGVkRGlzcGF0Y2ggPSAodXJpOiBzdHJpbmcpID0+IHZvaWQ7XG5cbi8qKlxuICogQ29jb3MgYnJvYWRjYXN0IG1lc3NhZ2Ug4oaSIGxpc3Qgb2YgY29jb3M6Ly8gcmVzb3VyY2UgVVJJcyB0aGF0IHNob3VsZFxuICogYmUgaW52YWxpZGF0ZWQgb24gdGhhdCBicm9hZGNhc3QuIENvbnNlcnZhdGl2ZSBvbiBwdXJwb3NlOiBwcmVmZXJcbiAqIG92ZXItbm90aWZ5aW5nIHRoYW4gbWlzc2luZyBjaGFuZ2VzIChjbGllbnRzIHJlLXJlYWQgb24gcmVjZWl2ZVxuICogd2hpY2ggaXMgYSBjaGVhcCB0b29scy9jYWxsLCBub3QgZXhwZW5zaXZlKS4gVGlnaHRlbiBhcyB3ZSBvYnNlcnZlXG4gKiB0aGUgcmVhbCBldmVudCBkZW5zaXR5IHZpYSBwcm9iZS1icm9hZGNhc3QuanMgKyB1c2VyIGZlZWRiYWNrLlxuICovXG5jb25zdCBCUk9BRENBU1RfVE9fVVJJUzogUmVjb3JkPHN0cmluZywgc3RyaW5nW10+ID0ge1xuICAgIC8vIFNjZW5lIG11dGF0aW9uIOKAlCBjdXJyZW50ICsgaGllcmFyY2h5IGludmFsaWRhdGVcbiAgICAnc2NlbmU6Y2hhbmdlLW5vZGUnOiBbJ2NvY29zOi8vc2NlbmUvY3VycmVudCcsICdjb2NvczovL3NjZW5lL2hpZXJhcmNoeSddLFxuICAgICdzY2VuZTpzZWxlY3Qtbm9kZXMnOiBbJ2NvY29zOi8vc2NlbmUvaGllcmFyY2h5J10sXG4gICAgJ3NjZW5lOnVuc2VsZWN0LW5vZGVzJzogWydjb2NvczovL3NjZW5lL2hpZXJhcmNoeSddLFxuICAgICdzY2VuZTpyZWFkeSc6IFsnY29jb3M6Ly9zY2VuZS9jdXJyZW50JywgJ2NvY29zOi8vc2NlbmUvaGllcmFyY2h5J10sXG4gICAgJ3NjZW5lOmNsb3NlJzogWydjb2NvczovL3NjZW5lL2N1cnJlbnQnLCAnY29jb3M6Ly9zY2VuZS9oaWVyYXJjaHknXSxcbiAgICAnc2NlbmU6c2F2ZS1hc3NldCc6IFtcbiAgICAgICAgJ2NvY29zOi8vc2NlbmUvY3VycmVudCcsXG4gICAgICAgICdjb2NvczovL3NjZW5lL2hpZXJhcmNoeScsXG4gICAgICAgICdjb2NvczovL3NjZW5lL2xpc3QnLFxuICAgICAgICAnY29jb3M6Ly9wcmVmYWJzJyxcbiAgICAgICAgJ2NvY29zOi8vYXNzZXRzJyxcbiAgICBdLFxuICAgIC8vIEFzc2V0IERCIGNodXJuIOKAlCBhbnl0aGluZyB0aGF0IHRvdWNoZXMgZmlsZXMgaW52YWxpZGF0ZXMgdGhlXG4gICAgLy8gZ2VuZXJpYyBhc3NldCBsaXN0IGFuZCB0aGUgcHJlZmFiL3NjZW5lLWxpc3QgZmlsdGVyZWQgdmlld3MuXG4gICAgJ2Fzc2V0LWRiOmFzc2V0LWFkZCc6IFsnY29jb3M6Ly9hc3NldHMnLCAnY29jb3M6Ly9wcmVmYWJzJywgJ2NvY29zOi8vc2NlbmUvbGlzdCddLFxuICAgICdhc3NldC1kYjphc3NldC1jaGFuZ2UnOiBbJ2NvY29zOi8vYXNzZXRzJywgJ2NvY29zOi8vcHJlZmFicycsICdjb2NvczovL3NjZW5lL2xpc3QnXSxcbiAgICAnYXNzZXQtZGI6YXNzZXQtZGVsZXRlJzogWydjb2NvczovL2Fzc2V0cycsICdjb2NvczovL3ByZWZhYnMnLCAnY29jb3M6Ly9zY2VuZS9saXN0J10sXG59O1xuXG5pbnRlcmZhY2UgUHJvdGVjdGVkTWVzc2FnZSB7XG4gICAgYWRkQnJvYWRjYXN0TGlzdGVuZXI/OiAobWVzc2FnZTogc3RyaW5nLCBmdW5jOiBGdW5jdGlvbikgPT4gdm9pZDtcbiAgICByZW1vdmVCcm9hZGNhc3RMaXN0ZW5lcj86IChtZXNzYWdlOiBzdHJpbmcsIGZ1bmM6IEZ1bmN0aW9uKSA9PiB2b2lkO1xufVxuXG5mdW5jdGlvbiBnZXRQcm90ZWN0ZWQoKTogUHJvdGVjdGVkTWVzc2FnZSB8IG51bGwge1xuICAgIHRyeSB7XG4gICAgICAgIC8vIGBFZGl0b3IuTWVzc2FnZS5fX3Byb3RlY3RlZF9fYCBwZXIgQGNvY29zL2NyZWF0b3ItdHlwZXNcbiAgICAgICAgY29uc3QgcHJvdG8gPSAoRWRpdG9yIGFzIGFueSk/Lk1lc3NhZ2U/Ll9fcHJvdGVjdGVkX187XG4gICAgICAgIGlmIChwcm90byAmJiB0eXBlb2YgcHJvdG8uYWRkQnJvYWRjYXN0TGlzdGVuZXIgPT09ICdmdW5jdGlvbicpIHJldHVybiBwcm90bztcbiAgICB9IGNhdGNoIHsgLyogc3dhbGxvdyDigJQgRWRpdG9yIG1pZ2h0IG5vdCBleGlzdCBvdXRzaWRlIGVkaXRvciBob3N0ICovIH1cbiAgICByZXR1cm4gbnVsbDtcbn1cblxuZXhwb3J0IGNsYXNzIEJyb2FkY2FzdEJyaWRnZSB7XG4gICAgcHJpdmF0ZSBsaXN0ZW5lcnM6IE1hcDxzdHJpbmcsIEZ1bmN0aW9uPiA9IG5ldyBNYXAoKTtcbiAgICBwcml2YXRlIHBlbmRpbmc6IE1hcDxzdHJpbmcsIE5vZGVKUy5UaW1lb3V0PiA9IG5ldyBNYXAoKTtcbiAgICBwcml2YXRlIGRlYm91bmNlTXMgPSAxMDAwO1xuICAgIHByaXZhdGUgZGlzcGF0Y2g6IFJlc291cmNlVXBkYXRlZERpc3BhdGNoIHwgbnVsbCA9IG51bGw7XG4gICAgcHJpdmF0ZSBzdGFydGVkID0gZmFsc2U7XG5cbiAgICBzZXREZWJvdW5jZU1zKG1zOiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgaWYgKG1zIDwgMCB8fCAhTnVtYmVyLmlzRmluaXRlKG1zKSkgcmV0dXJuO1xuICAgICAgICB0aGlzLmRlYm91bmNlTXMgPSBtcztcbiAgICB9XG5cbiAgICBpc1N0YXJ0ZWQoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLnN0YXJ0ZWQ7XG4gICAgfVxuXG4gICAgc3RhcnQoZGlzcGF0Y2g6IFJlc291cmNlVXBkYXRlZERpc3BhdGNoKTogdm9pZCB7XG4gICAgICAgIGlmICh0aGlzLnN0YXJ0ZWQpIHJldHVybjtcbiAgICAgICAgY29uc3QgcHJvdG8gPSBnZXRQcm90ZWN0ZWQoKTtcbiAgICAgICAgaWYgKCFwcm90byB8fCAhcHJvdG8uYWRkQnJvYWRjYXN0TGlzdGVuZXIpIHtcbiAgICAgICAgICAgIGxvZ2dlci53YXJuKCdbQnJvYWRjYXN0QnJpZGdlXSBFZGl0b3IuTWVzc2FnZS5fX3Byb3RlY3RlZF9fLmFkZEJyb2FkY2FzdExpc3RlbmVyIHVuYXZhaWxhYmxlOyByZXNvdXJjZXMvc3Vic2NyaWJlIHB1c2ggZGlzYWJsZWQuIFRvb2xzIHN0aWxsIHdvcms7IGNsaWVudHMgbXVzdCBwb2xsLicpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuZGlzcGF0Y2ggPSBkaXNwYXRjaDtcbiAgICAgICAgZm9yIChjb25zdCBbbWVzc2FnZSwgdXJpc10gb2YgT2JqZWN0LmVudHJpZXMoQlJPQURDQVNUX1RPX1VSSVMpKSB7XG4gICAgICAgICAgICBjb25zdCBmbiA9ICguLi5fYXJnczogdW5rbm93bltdKSA9PiB7XG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCB1cmkgb2YgdXJpcykgdGhpcy5zY2hlZHVsZU5vdGlmeSh1cmkpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgcHJvdG8uYWRkQnJvYWRjYXN0TGlzdGVuZXIobWVzc2FnZSwgZm4pO1xuICAgICAgICAgICAgICAgIHRoaXMubGlzdGVuZXJzLnNldChtZXNzYWdlLCBmbik7XG4gICAgICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgICAgIGxvZ2dlci53YXJuKGBbQnJvYWRjYXN0QnJpZGdlXSBhZGRCcm9hZGNhc3RMaXN0ZW5lcigke21lc3NhZ2V9KSBmYWlsZWQ6YCwgZXJyPy5tZXNzYWdlID8/IGVycik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5zdGFydGVkID0gdHJ1ZTtcbiAgICAgICAgbG9nZ2VyLmluZm8oYFtCcm9hZGNhc3RCcmlkZ2VdIHJlZ2lzdGVyZWQgJHt0aGlzLmxpc3RlbmVycy5zaXplfSBicm9hZGNhc3QgbGlzdGVuZXJzIChkZWJvdW5jZSAke3RoaXMuZGVib3VuY2VNc31tcy9VUkkpYCk7XG4gICAgfVxuXG4gICAgc3RvcCgpOiB2b2lkIHtcbiAgICAgICAgaWYgKCF0aGlzLnN0YXJ0ZWQpIHJldHVybjtcbiAgICAgICAgY29uc3QgcHJvdG8gPSBnZXRQcm90ZWN0ZWQoKTtcbiAgICAgICAgZm9yIChjb25zdCBbbWVzc2FnZSwgZm5dIG9mIHRoaXMubGlzdGVuZXJzLmVudHJpZXMoKSkge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBwcm90bz8ucmVtb3ZlQnJvYWRjYXN0TGlzdGVuZXI/LihtZXNzYWdlLCBmbik7XG4gICAgICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgICAgIGxvZ2dlci5kZWJ1ZyhgW0Jyb2FkY2FzdEJyaWRnZV0gcmVtb3ZlQnJvYWRjYXN0TGlzdGVuZXIoJHttZXNzYWdlfSkgZmFpbGVkOmAsIGVycj8ubWVzc2FnZSA/PyBlcnIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHRoaXMubGlzdGVuZXJzLmNsZWFyKCk7XG4gICAgICAgIGZvciAoY29uc3QgdCBvZiB0aGlzLnBlbmRpbmcudmFsdWVzKCkpIGNsZWFyVGltZW91dCh0KTtcbiAgICAgICAgdGhpcy5wZW5kaW5nLmNsZWFyKCk7XG4gICAgICAgIHRoaXMuZGlzcGF0Y2ggPSBudWxsO1xuICAgICAgICB0aGlzLnN0YXJ0ZWQgPSBmYWxzZTtcbiAgICAgICAgbG9nZ2VyLmRlYnVnKCdbQnJvYWRjYXN0QnJpZGdlXSBzdG9wcGVkJyk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBzY2hlZHVsZU5vdGlmeSh1cmk6IHN0cmluZyk6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy5wZW5kaW5nLmhhcyh1cmkpKSByZXR1cm47IC8vIGFscmVhZHkgc2NoZWR1bGVkIGluIHRoaXMgd2luZG93XG4gICAgICAgIGNvbnN0IHQgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICAgIHRoaXMucGVuZGluZy5kZWxldGUodXJpKTtcbiAgICAgICAgICAgIGNvbnN0IGNiID0gdGhpcy5kaXNwYXRjaDtcbiAgICAgICAgICAgIGlmICghY2IpIHJldHVybjtcbiAgICAgICAgICAgIHRyeSB7IGNiKHVyaSk7IH1cbiAgICAgICAgICAgIGNhdGNoIChlcnI6IGFueSkgeyBsb2dnZXIud2FybihgW0Jyb2FkY2FzdEJyaWRnZV0gZGlzcGF0Y2ggZmFpbGVkIGZvciAke3VyaX06YCwgZXJyPy5tZXNzYWdlID8/IGVycik7IH1cbiAgICAgICAgfSwgdGhpcy5kZWJvdW5jZU1zKTtcbiAgICAgICAgLy8gdW5yZWYgc28gdGhlIGJyaWRnZSB0aW1lciBkb2Vzbid0IGJsb2NrIHByb2Nlc3MgdGVhcmRvd24gaWZcbiAgICAgICAgLy8gc3RvcCgpIHNvbWVob3cgZG9lc24ndCBydW4gYmVmb3JlIHRoZSB0aW1lciBmaXJlcy5cbiAgICAgICAgdC51bnJlZj8uKCk7XG4gICAgICAgIHRoaXMucGVuZGluZy5zZXQodXJpLCB0KTtcbiAgICB9XG59XG5cbi8vIEV4cG9zZWQgZm9yIHRlc3RzIC8gaW50cm9zcGVjdGlvbiDigJQgbm90IHVzZWQgYnkgdGhlIHJ1bnRpbWUuXG5leHBvcnQgY29uc3QgX0JST0FEQ0FTVF9UT19VUklTX0ZPUl9URVNUID0gQlJPQURDQVNUX1RPX1VSSVM7XG4iXX0=