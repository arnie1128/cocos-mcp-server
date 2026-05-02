// In-memory single-flight command queue between the MCP server (host) and the
// GameDebugClient (running in cocos preview / browser). Mirrors harady's
// cocos-creator-mcp queue (mcp-server.ts:52-73), with three additions:
//
//   1. Single-flight mutex: a second `queueGameCommand()` while one is
//      pending fails fast instead of overwriting. The harady design lets
//      the second command silently overwrite the first, which is OK for
//      sequential MCP tool calls but breaks when multiple sessions race.
//   2. Last-poll timestamp tracked so /game/status can report whether a
//      GameDebugClient appears connected (polled within 2× pollInterval).
//   3. Stale-result guard: setCommandResult is rejected if the result id
//      doesn't match the currently-pending command id. Prevents a slow
//      client response from leaking into the next command's await.
//
// Single-flight is enforced at queue time, not at await time — keeping the
// state machine simple. State diagram:
//
//   idle ──queueGameCommand──▶ pending ──setCommandResult──▶ resolved ──awaitCommandResult──▶ idle
//                              │
//                              └──awaitCommandResult timeout──▶ idle (result discarded)

const POLL_TIMESTAMP_FRESH_MS = 2000;

export interface GameCommand {
    id: string;
    type: string;
    args?: any;
    queuedAt: string;
}

export interface GameCommandResult {
    id: string;
    success: boolean;
    data?: any;
    error?: string;
}

export interface GameClientStatus {
    connected: boolean;
    lastPollAt: string | null;
    queued: boolean;
    pendingCommandId: string | null;
}

let _pending: GameCommand | null = null;
let _result: GameCommandResult | null = null;
let _idCounter = 0;
let _lastPollAt: number | null = null;

export function queueGameCommand(type: string, args?: any): { ok: true; id: string } | { ok: false; error: string } {
    if (_pending) {
        return { ok: false, error: `Another game command is already in flight (id=${_pending.id} type=${_pending.type}). Wait for it to complete or time out.` };
    }
    const id = `cmd_${++_idCounter}_${Date.now()}`;
    _pending = { id, type, args, queuedAt: new Date().toISOString() };
    _result = null;
    return { ok: true, id };
}

export function consumePendingCommand(): GameCommand | null {
    _lastPollAt = Date.now();
    const cmd = _pending;
    return cmd;
}

export function setCommandResult(r: GameCommandResult): { ok: boolean; reason?: string } {
    if (!_pending) {
        return { ok: false, reason: 'no command pending' };
    }
    if (r.id !== _pending.id) {
        return { ok: false, reason: `result id ${r.id} does not match pending ${_pending.id}` };
    }
    _result = r;
    return { ok: true };
}

export async function awaitCommandResult(id: string, timeoutMs: number): Promise<{ ok: true; result: GameCommandResult } | { ok: false; error: string }> {
    const start = Date.now();
    const POLL_INTERVAL_MS = 100;
    while (Date.now() - start < timeoutMs) {
        if (_result && _result.id === id) {
            const r = _result;
            _pending = null;
            _result = null;
            return { ok: true, result: r };
        }
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    if (_pending && _pending.id === id) {
        _pending = null;
        _result = null;
    }
    return { ok: false, error: `Game did not respond within ${timeoutMs}ms. Is GameDebugClient running and polling /game/command? Check GET /game/status for client liveness.` };
}

export function getClientStatus(): GameClientStatus {
    const fresh = _lastPollAt !== null && (Date.now() - _lastPollAt) < POLL_TIMESTAMP_FRESH_MS;
    return {
        connected: fresh,
        lastPollAt: _lastPollAt ? new Date(_lastPollAt).toISOString() : null,
        queued: _pending !== null,
        pendingCommandId: _pending?.id ?? null,
    };
}

export function resetForTest(): void {
    _pending = null;
    _result = null;
    _idCounter = 0;
    _lastPollAt = null;
}
