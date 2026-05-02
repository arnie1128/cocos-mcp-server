"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.queueGameCommand = queueGameCommand;
exports.consumePendingCommand = consumePendingCommand;
exports.setCommandResult = setCommandResult;
exports.awaitCommandResult = awaitCommandResult;
exports.getClientStatus = getClientStatus;
exports.resetForTest = resetForTest;
const POLL_TIMESTAMP_FRESH_MS = 5000;
let _pending = null;
let _result = null;
let _idCounter = 0;
let _lastPollAt = null;
function queueGameCommand(type, args) {
    if (_pending) {
        return { ok: false, error: `Another game command is already in flight (id=${_pending.cmd.id} type=${_pending.cmd.type}). Wait for it to complete or time out.` };
    }
    const id = `cmd_${++_idCounter}_${Date.now()}`;
    _pending = { cmd: { id, type, args, queuedAt: new Date().toISOString() }, claimed: false };
    _result = null;
    return { ok: true, id };
}
function consumePendingCommand() {
    _lastPollAt = Date.now();
    if (!_pending || _pending.claimed)
        return null;
    _pending.claimed = true;
    return _pending.cmd;
}
function setCommandResult(r) {
    if (!_pending) {
        return { ok: false, reason: 'no command pending' };
    }
    if (r.id !== _pending.cmd.id) {
        return { ok: false, reason: `result id ${r.id} does not match pending ${_pending.cmd.id}` };
    }
    _result = r;
    return { ok: true };
}
async function awaitCommandResult(id, timeoutMs) {
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
function getClientStatus() {
    var _a;
    const fresh = _lastPollAt !== null && (Date.now() - _lastPollAt) < POLL_TIMESTAMP_FRESH_MS;
    return {
        connected: fresh,
        lastPollAt: _lastPollAt ? new Date(_lastPollAt).toISOString() : null,
        queued: _pending !== null,
        pendingCommandId: (_a = _pending === null || _pending === void 0 ? void 0 : _pending.cmd.id) !== null && _a !== void 0 ? _a : null,
    };
}
function resetForTest() {
    _pending = null;
    _result = null;
    _idCounter = 0;
    _lastPollAt = null;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2FtZS1jb21tYW5kLXF1ZXVlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL2xpYi9nYW1lLWNvbW1hbmQtcXVldWUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBLDhFQUE4RTtBQUM5RSx5RUFBeUU7QUFDekUsc0VBQXNFO0FBQ3RFLG9EQUFvRDtBQUNwRCxFQUFFO0FBQ0YsdUVBQXVFO0FBQ3ZFLHlFQUF5RTtBQUN6RSx3RUFBd0U7QUFDeEUseUVBQXlFO0FBQ3pFLHdFQUF3RTtBQUN4RSx3REFBd0Q7QUFDeEQsaUNBQWlDO0FBQ2pDLHlFQUF5RTtBQUN6RSx1RUFBdUU7QUFDdkUsbUVBQW1FO0FBQ25FLHFFQUFxRTtBQUNyRSx5RUFBeUU7QUFDekUsc0VBQXNFO0FBQ3RFLGlFQUFpRTtBQUNqRSxFQUFFO0FBQ0YsaUJBQWlCO0FBQ2pCLEVBQUU7QUFDRixnRkFBZ0Y7QUFDaEYsbUVBQW1FO0FBQ25FLDZIQUE2SDtBQUM3SCxtRUFBbUU7QUFDbkUsMkhBQTJIOztBQW1DM0gsNENBUUM7QUFFRCxzREFLQztBQUVELDRDQVNDO0FBRUQsZ0RBc0JDO0FBRUQsMENBUUM7QUFFRCxvQ0FLQztBQXBHRCxNQUFNLHVCQUF1QixHQUFHLElBQUksQ0FBQztBQTRCckMsSUFBSSxRQUFRLEdBQXVCLElBQUksQ0FBQztBQUN4QyxJQUFJLE9BQU8sR0FBNkIsSUFBSSxDQUFDO0FBQzdDLElBQUksVUFBVSxHQUFHLENBQUMsQ0FBQztBQUNuQixJQUFJLFdBQVcsR0FBa0IsSUFBSSxDQUFDO0FBRXRDLFNBQWdCLGdCQUFnQixDQUFDLElBQVksRUFBRSxJQUFVO0lBQ3JELElBQUksUUFBUSxFQUFFLENBQUM7UUFDWCxPQUFPLEVBQUUsRUFBRSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsaURBQWlELFFBQVEsQ0FBQyxHQUFHLENBQUMsRUFBRSxTQUFTLFFBQVEsQ0FBQyxHQUFHLENBQUMsSUFBSSx5Q0FBeUMsRUFBRSxDQUFDO0lB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Q0gsU0FBUyxFQUFFLEtBQUs7UUFDaEIsVUFBVSxFQUFFLFdBQVcsQ0FBQyxDQUFDLENBQUMsSUFBSSxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUk7UUFDcEUsTUFBTSxFQUFFLFFBQVEsS0FBSyxJQUFJO1FBQ3pCLGdCQUFnQixFQUFFLE1BQUEsUUFBUSxhQUFSLFFBQVEsdUJBQVIsUUFBUSxDQUFFLEdBQUcsQ0FBQyxFQUFFLG1DQUFJLElBQUk7S0FDN0MsQ0FBQztBQUNOLENBQUM7QUFFRCxTQUFnQixZQUFZO0lBQ3hCLFFBQVEsR0FBRyxJQUFJLENBQUM7SUFDaEIsT0FBTyxHQUFHLElBQUksQ0FBQztJQUNmLFVBQVUsR0FBRyxDQUFDLENBQUM7SUFDZixXQUFXLEdBQUcsSUFBSSxDQUFDO0FBQ3ZCLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBJbi1tZW1vcnkgc2luZ2xlLWZsaWdodCBjb21tYW5kIHF1ZXVlIGJldHdlZW4gdGhlIE1DUCBzZXJ2ZXIgKGhvc3QpIGFuZCB0aGVcbi8vIEdhbWVEZWJ1Z0NsaWVudCAocnVubmluZyBpbiBjb2NvcyBwcmV2aWV3IC8gYnJvd3NlcikuIE1pcnJvcnMgaGFyYWR5J3Ncbi8vIGNvY29zLWNyZWF0b3ItbWNwIHF1ZXVlIChtY3Atc2VydmVyLnRzOjUyLTczKSwgd2l0aCB0aHJlZSBhZGRpdGlvbnNcbi8vIGhhcmRlbmVkIGR1cmluZyB2Mi42LjAg4oaSIHYyLjYuMSB0aHJlZS13YXkgcmV2aWV3OlxuLy9cbi8vICAgMS4gU2luZ2xlLWZsaWdodCBtdXRleDogYSBzZWNvbmQgYHF1ZXVlR2FtZUNvbW1hbmQoKWAgd2hpbGUgb25lIGlzXG4vLyAgICAgIHBlbmRpbmcgZmFpbHMgZmFzdCBpbnN0ZWFkIG9mIG92ZXJ3cml0aW5nLiBUaGUgaGFyYWR5IGRlc2lnbiBsZXRzXG4vLyAgICAgIHRoZSBzZWNvbmQgY29tbWFuZCBzaWxlbnRseSBvdmVyd3JpdGUgdGhlIGZpcnN0LCB3aGljaCBpcyBPSyBmb3Jcbi8vICAgICAgc2VxdWVudGlhbCBNQ1AgdG9vbCBjYWxscyBidXQgYnJlYWtzIHdoZW4gbXVsdGlwbGUgc2Vzc2lvbnMgcmFjZS5cbi8vICAgMi4gTGFzdC1wb2xsIHRpbWVzdGFtcCB0cmFja2VkIHNvIC9nYW1lL3N0YXR1cyBjYW4gcmVwb3J0IHdoZXRoZXIgYVxuLy8gICAgICBHYW1lRGVidWdDbGllbnQgYXBwZWFycyBjb25uZWN0ZWQgKHBvbGxlZCB3aXRoaW5cbi8vICAgICAgUE9MTF9USU1FU1RBTVBfRlJFU0hfTVMpLlxuLy8gICAzLiBTdGFsZS1yZXN1bHQgZ3VhcmQ6IHNldENvbW1hbmRSZXN1bHQgaXMgcmVqZWN0ZWQgaWYgdGhlIHJlc3VsdCBpZFxuLy8gICAgICBkb2Vzbid0IG1hdGNoIHRoZSBjdXJyZW50bHktcGVuZGluZyBjb21tYW5kIGlkLiBQcmV2ZW50cyBhIHNsb3dcbi8vICAgICAgY2xpZW50IHJlc3BvbnNlIGZyb20gbGVha2luZyBpbnRvIHRoZSBuZXh0IGNvbW1hbmQncyBhd2FpdC5cbi8vICAgNC4gQ2xhaW0tb24tY29uc3VtZSAodjIuNi4xIHJldmlldyBmaXgsIGNvZGV4IPCflLQpOiB0aGUgZmlyc3QgR0VUXG4vLyAgICAgIC9nYW1lL2NvbW1hbmQgY2xhaW1zIHRoZSBwZW5kaW5nIHNsb3Qg4oCUIHN1YnNlcXVlbnQgcG9sbHMgYmVmb3JlIGFcbi8vICAgICAgcmVzdWx0IGFycml2ZXMgc2VlIG51bGwsIHNvIHR3byBHYW1lRGVidWdDbGllbnQgaW5zdGFuY2VzIG9yIGFcbi8vICAgICAgcmVzdGFydGluZyBjbGllbnQgY2Fubm90IGRvdWJsZS1leGVjdXRlIHRoZSBzYW1lIGNvbW1hbmQuXG4vL1xuLy8gU3RhdGUgbWFjaGluZTpcbi8vXG4vLyAgIGlkbGUg4pSA4pSAcXVldWVHYW1lQ29tbWFuZOKUgOKUgOKWtiBwZW5kaW5nKHVuY2xhaW1lZCkg4pSA4pSAY29uc3VtZeKUgOKUgOKWtiBwZW5kaW5nKGNsYWltZWQpXG4vLyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICDilIJcbi8vICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIOKUnOKUgHNldENvbW1hbmRSZXN1bHTilIDilIDilrYgcmVzb2x2ZWQg4pSA4pSAYXdhaXRDb21tYW5kUmVzdWx04pSA4pSA4pa2IGlkbGVcbi8vICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIOKUglxuLy8gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg4pSU4pSAYXdhaXRDb21tYW5kUmVzdWx0IHRpbWVvdXTilIDilIDilrYgaWRsZSAoY2xhaW1lZCBzbG90IGZyZWVkKVxuXG5jb25zdCBQT0xMX1RJTUVTVEFNUF9GUkVTSF9NUyA9IDUwMDA7XG5cbmV4cG9ydCBpbnRlcmZhY2UgR2FtZUNvbW1hbmQge1xuICAgIGlkOiBzdHJpbmc7XG4gICAgdHlwZTogc3RyaW5nO1xuICAgIGFyZ3M/OiBhbnk7XG4gICAgcXVldWVkQXQ6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBHYW1lQ29tbWFuZFJlc3VsdCB7XG4gICAgaWQ6IHN0cmluZztcbiAgICBzdWNjZXNzOiBib29sZWFuO1xuICAgIGRhdGE/OiBhbnk7XG4gICAgZXJyb3I/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgR2FtZUNsaWVudFN0YXR1cyB7XG4gICAgY29ubmVjdGVkOiBib29sZWFuO1xuICAgIGxhc3RQb2xsQXQ6IHN0cmluZyB8IG51bGw7XG4gICAgcXVldWVkOiBib29sZWFuO1xuICAgIHBlbmRpbmdDb21tYW5kSWQ6IHN0cmluZyB8IG51bGw7XG59XG5cbmludGVyZmFjZSBQZW5kaW5nU2xvdCB7XG4gICAgY21kOiBHYW1lQ29tbWFuZDtcbiAgICBjbGFpbWVkOiBib29sZWFuO1xufVxuXG5sZXQgX3BlbmRpbmc6IFBlbmRpbmdTbG90IHwgbnVsbCA9IG51bGw7XG5sZXQgX3Jlc3VsdDogR2FtZUNvbW1hbmRSZXN1bHQgfCBudWxsID0gbnVsbDtcbmxldCBfaWRDb3VudGVyID0gMDtcbmxldCBfbGFzdFBvbGxBdDogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG5cbmV4cG9ydCBmdW5jdGlvbiBxdWV1ZUdhbWVDb21tYW5kKHR5cGU6IHN0cmluZywgYXJncz86IGFueSk6IHsgb2s6IHRydWU7IGlkOiBzdHJpbmcgfSB8IHsgb2s6IGZhbHNlOyBlcnJvcjogc3RyaW5nIH0ge1xuICAgIGlmIChfcGVuZGluZykge1xuICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBgQW5vdGhlciBnYW1lIGNvbW1hbmQgaXMgYWxyZWFkeSBpbiBmbGlnaHQgKGlkPSR7X3BlbmRpbmcuY21kLmlkfSB0eXBlPSR7X3BlbmRpbmcuY21kLnR5cGV9KS4gV2FpdCBmb3IgaXQgdG8gY29tcGxldGUgb3IgdGltZSBvdXQuYCB9O1xuICAgIH1cbiAgICBjb25zdCBpZCA9IGBjbWRfJHsrK19pZENvdW50ZXJ9XyR7RGF0ZS5ub3coKX1gO1xuICAgIF9wZW5kaW5nID0geyBjbWQ6IHsgaWQsIHR5cGUsIGFyZ3MsIHF1ZXVlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkgfSwgY2xhaW1lZDogZmFsc2UgfTtcbiAgICBfcmVzdWx0ID0gbnVsbDtcbiAgICByZXR1cm4geyBvazogdHJ1ZSwgaWQgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNvbnN1bWVQZW5kaW5nQ29tbWFuZCgpOiBHYW1lQ29tbWFuZCB8IG51bGwge1xuICAgIF9sYXN0UG9sbEF0ID0gRGF0ZS5ub3coKTtcbiAgICBpZiAoIV9wZW5kaW5nIHx8IF9wZW5kaW5nLmNsYWltZWQpIHJldHVybiBudWxsO1xuICAgIF9wZW5kaW5nLmNsYWltZWQgPSB0cnVlO1xuICAgIHJldHVybiBfcGVuZGluZy5jbWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzZXRDb21tYW5kUmVzdWx0KHI6IEdhbWVDb21tYW5kUmVzdWx0KTogeyBvazogYm9vbGVhbjsgcmVhc29uPzogc3RyaW5nIH0ge1xuICAgIGlmICghX3BlbmRpbmcpIHtcbiAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246ICdubyBjb21tYW5kIHBlbmRpbmcnIH07XG4gICAgfVxuICAgIGlmIChyLmlkICE9PSBfcGVuZGluZy5jbWQuaWQpIHtcbiAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246IGByZXN1bHQgaWQgJHtyLmlkfSBkb2VzIG5vdCBtYXRjaCBwZW5kaW5nICR7X3BlbmRpbmcuY21kLmlkfWAgfTtcbiAgICB9XG4gICAgX3Jlc3VsdCA9IHI7XG4gICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGF3YWl0Q29tbWFuZFJlc3VsdChpZDogc3RyaW5nLCB0aW1lb3V0TXM6IG51bWJlcik6IFByb21pc2U8eyBvazogdHJ1ZTsgcmVzdWx0OiBHYW1lQ29tbWFuZFJlc3VsdCB9IHwgeyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmcgfT4ge1xuICAgIGNvbnN0IHN0YXJ0ID0gRGF0ZS5ub3coKTtcbiAgICBjb25zdCBQT0xMX0lOVEVSVkFMX01TID0gMTAwO1xuICAgIHdoaWxlIChEYXRlLm5vdygpIC0gc3RhcnQgPCB0aW1lb3V0TXMpIHtcbiAgICAgICAgaWYgKF9yZXN1bHQgJiYgX3Jlc3VsdC5pZCA9PT0gaWQpIHtcbiAgICAgICAgICAgIGNvbnN0IHIgPSBfcmVzdWx0O1xuICAgICAgICAgICAgX3BlbmRpbmcgPSBudWxsO1xuICAgICAgICAgICAgX3Jlc3VsdCA9IG51bGw7XG4gICAgICAgICAgICByZXR1cm4geyBvazogdHJ1ZSwgcmVzdWx0OiByIH07XG4gICAgICAgIH1cbiAgICAgICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIFBPTExfSU5URVJWQUxfTVMpKTtcbiAgICB9XG4gICAgLy8gdjIuNi4xIHJldmlldyBmaXggKGNsYXVkZSBXMyk6IGNsZWFyIHRoZSBzbG90IGV2ZW4gd2hlbiBvdXIgaWQgbm9cbiAgICAvLyBsb25nZXIgbWF0Y2hlcyB0aGUgcGVuZGluZyBvbmUg4oCUIG90aGVyd2lzZSBhIHN0YWxlIGF3YWl0ZXIgaG9sZHNcbiAgICAvLyB0aGUgc2xvdCBmb3JldmVyIGFmdGVyIHNvbWUgb3RoZXIgY29kZSBwYXRoIHJlcGxhY2VkIGl0LiBDb21iaW5lZFxuICAgIC8vIHdpdGggdGhlIHF1ZXVlIHJlamVjdGluZyBjb25jdXJyZW50IGVucXVldWVzLCB0aGlzIG9ubHkgdHJpZ2dlcnNcbiAgICAvLyBpbiBwYXRob2xvZ2ljYWwgcmV1c2UgYnV0IGl0J3MgY2hlYXAgaW5zdXJhbmNlLlxuICAgIGlmIChfcGVuZGluZyAmJiBfcGVuZGluZy5jbWQuaWQgPT09IGlkKSB7XG4gICAgICAgIF9wZW5kaW5nID0gbnVsbDtcbiAgICAgICAgX3Jlc3VsdCA9IG51bGw7XG4gICAgfVxuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGBHYW1lIGRpZCBub3QgcmVzcG9uZCB3aXRoaW4gJHt0aW1lb3V0TXN9bXMuIElzIEdhbWVEZWJ1Z0NsaWVudCBydW5uaW5nIGFuZCBwb2xsaW5nIC9nYW1lL2NvbW1hbmQ/IENoZWNrIEdFVCAvZ2FtZS9zdGF0dXMgZm9yIGNsaWVudCBsaXZlbmVzcy5gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRDbGllbnRTdGF0dXMoKTogR2FtZUNsaWVudFN0YXR1cyB7XG4gICAgY29uc3QgZnJlc2ggPSBfbGFzdFBvbGxBdCAhPT0gbnVsbCAmJiAoRGF0ZS5ub3coKSAtIF9sYXN0UG9sbEF0KSA8IFBPTExfVElNRVNUQU1QX0ZSRVNIX01TO1xuICAgIHJldHVybiB7XG4gICAgICAgIGNvbm5lY3RlZDogZnJlc2gsXG4gICAgICAgIGxhc3RQb2xsQXQ6IF9sYXN0UG9sbEF0ID8gbmV3IERhdGUoX2xhc3RQb2xsQXQpLnRvSVNPU3RyaW5nKCkgOiBudWxsLFxuICAgICAgICBxdWV1ZWQ6IF9wZW5kaW5nICE9PSBudWxsLFxuICAgICAgICBwZW5kaW5nQ29tbWFuZElkOiBfcGVuZGluZz8uY21kLmlkID8/IG51bGwsXG4gICAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlc2V0Rm9yVGVzdCgpOiB2b2lkIHtcbiAgICBfcGVuZGluZyA9IG51bGw7XG4gICAgX3Jlc3VsdCA9IG51bGw7XG4gICAgX2lkQ291bnRlciA9IDA7XG4gICAgX2xhc3RQb2xsQXQgPSBudWxsO1xufVxuIl19