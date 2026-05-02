// In-memory single-flight command queue between the MCP server (host) and the
// GameDebugClient (running in cocos preview / browser). Mirrors harady's
// cocos-creator-mcp queue (mcp-server.ts:52-73), with three additions
// hardened during v2.6.0 → v2.6.1 three-way review:
//
//   1. Single-flight mutex: a second `queueGameCommand()` while one is
//      pending fails fast instead of overwriting. The harady design lets
//      the second command silently overwrite the first, which is OK for
//      sequential MCP tool calls but breaks when multiple sessions race.
//   2. Last-poll timestamp tracked so /game/status can report whether a
//      GameDebugClient appears connected (polled within
//      POLL_TIMESTAMP_FRESH_MS).
//   3. Stale-result guard: setCommandResult is rejected if the result id
//      doesn't match the currently-pending command id. Prevents a slow
//      client response from leaking into the next command's await.
//   4. Claim-on-consume (v2.6.1 review fix, codex 🔴): the first GET
//      /game/command claims the pending slot — subsequent polls before a
//      result arrives see null, so two GameDebugClient instances or a
//      restarting client cannot double-execute the same command.
//
// State machine:
//
//   idle ──queueGameCommand──▶ pending(unclaimed) ──consume──▶ pending(claimed)
//                                                                │
//                                                                ├─setCommandResult──▶ resolved ──awaitCommandResult──▶ idle
//                                                                │
//                                                                └─awaitCommandResult timeout──▶ idle (claimed slot freed)

const POLL_TIMESTAMP_FRESH_MS = 5000;

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

interface PendingSlot {
    cmd: GameCommand;
    claimed: boolean;
}

let _pending: PendingSlot | null = null;
let _result: GameCommandResult | null = null;
let _idCounter = 0;
let _lastPollAt: number | null = null;

export function queueGameCommand(type: string, args?: any): { ok: true; id: string } | { ok: false; error: string } {
    if (_pending) {
        return { ok: false, error: `Another game command is already in flight (id=${_pending.cmd.id} type=${_pending.cmd.type}). Wait for it to complete or time out.` };
    }
    const id = `cmd_${++_idCounter}_${Date.now()}`;
    _pending = { cmd: { id, type, args, queuedAt: new Date().toISOString() }, claimed: false };
    _result = null;
    return { ok: true, id };
}

export function consumePendingCommand(): GameCommand | null {
    _lastPollAt = Date.now();
    if (!_pending || _pending.claimed) return null;
    _pending.claimed = true;
    return _pending.cmd;
}

export function setCommandResult(r: GameCommandResult): { ok: boolean; reason?: string } {
    if (!_pending) {
        return { ok: false, reason: 'no command pending' };
    }
    if (r.id !== _pending.cmd.id) {
        return { ok: false, reason: `result id ${r.id} does not match pending ${_pending.cmd.id}` };
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
    // v2.6.1 review fix (claude W3): clear the slot even when our id no
    // longer matches the pending one — otherwise a stale awaiter holds
    // the slot forever after some other code path replaced it. Combined
    // with the queue rejecting concurrent enqueues, this only triggers
    // in pathological reuse but it's cheap insurance.
    if (_pending && _pending.cmd.id === id) {
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
        pendingCommandId: _pending?.cmd.id ?? null,
    };
}

export function resetForTest(): void {
    _pending = null;
    _result = null;
    _idCounter = 0;
    _lastPollAt = null;
}
