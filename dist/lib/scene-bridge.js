"use strict";
/**
 * Helpers for invoking scene-script methods from the editor host process.
 *
 * `Editor.Message.request('scene', 'execute-scene-script', { name, method,
 * args })` is the only path through which extensions reach engine-level
 * APIs (instances of `cc.*`, the `cce.*` editor namespace). Centralising
 * the call site keeps the scene-script package name in one place and
 * lets the rest of the codebase call typed wrappers.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.runSceneMethod = runSceneMethod;
exports.runSceneMethodAsToolResponse = runSceneMethodAsToolResponse;
const runtime_flags_1 = require("./runtime-flags");
const PACKAGE_NAME = 'cocos-mcp-server';
function dispatch(name, method, args) {
    return Editor.Message.request('scene', 'execute-scene-script', {
        name,
        method,
        args,
    });
}
/**
 * Invoke a scene-script method by name. Returns the raw result the method
 * resolved with — usually a `{ success, data?, error? }` envelope already.
 *
 * When scene log capture is enabled (default) and `opts.capture !== false`,
 * the call is wrapped through `runWithCapture` so the result envelope
 * carries `capturedLogs`. Existing callers don't need to change anything.
 */
function runSceneMethod(method, args = [], opts = {}) {
    var _a;
    const wantCapture = ((_a = opts.capture) !== null && _a !== void 0 ? _a : true) && (0, runtime_flags_1.isSceneLogCaptureEnabled)();
    if (wantCapture) {
        return dispatch(PACKAGE_NAME, 'runWithCapture', [method, args]);
    }
    return dispatch(PACKAGE_NAME, method, args);
}
/**
 * Same as `runSceneMethod`, but coerces both transport and method-level
 * failures into a `ToolResponse`. Use this when the caller is itself a
 * tool handler that returns a ToolResponse directly.
 *
 * Note on capturedLogs: when scene log capture is on, the underlying
 * scene method's return envelope carries `capturedLogs` directly. We
 * copy that field onto the resulting ToolResponse so AI clients see
 * the cocos console output for this operation. The transport-level
 * catch path attaches an empty `capturedLogs` array to keep the field
 * shape stable — never `undefined` when capture is enabled.
 */
async function runSceneMethodAsToolResponse(method, args = [], opts = {}) {
    var _a, _b;
    const captureActive = ((_a = opts.capture) !== null && _a !== void 0 ? _a : true) && (0, runtime_flags_1.isSceneLogCaptureEnabled)();
    try {
        const result = await runSceneMethod(method, args, opts);
        if (result && typeof result === 'object' && 'success' in result) {
            const envelope = result;
            if (captureActive && envelope.capturedLogs === undefined) {
                envelope.capturedLogs = [];
            }
            return envelope;
        }
        return Object.assign({ success: true, data: result }, (captureActive ? { capturedLogs: [] } : {}));
    }
    catch (err) {
        return Object.assign({ success: false, error: `scene-script ${method} failed: ${(_b = err === null || err === void 0 ? void 0 : err.message) !== null && _b !== void 0 ? _b : String(err)}` }, (captureActive ? { capturedLogs: [] } : {}));
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NlbmUtYnJpZGdlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL2xpYi9zY2VuZS1icmlkZ2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7OztHQVFHOztBQXFDSCx3Q0FVQztBQWNELG9FQTJCQztBQXJGRCxtREFBMkQ7QUFFM0QsTUFBTSxZQUFZLEdBQUcsa0JBQWtCLENBQUM7QUFnQnhDLFNBQVMsUUFBUSxDQUFJLElBQVksRUFBRSxNQUFjLEVBQUUsSUFBZTtJQUM5RCxPQUFPLE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBRSxzQkFBc0IsRUFBRTtRQUMzRCxJQUFJO1FBQ0osTUFBTTtRQUNOLElBQUk7S0FDUCxDQUFlLENBQUM7QUFDckIsQ0FBQztBQUVEOzs7Ozs7O0dBT0c7QUFDSCxTQUFnQixjQUFjLENBQzFCLE1BQWMsRUFDZCxPQUFrQixFQUFFLEVBQ3BCLE9BQThCLEVBQUU7O0lBRWhDLE1BQU0sV0FBVyxHQUFHLENBQUMsTUFBQSxJQUFJLENBQUMsT0FBTyxtQ0FBSSxJQUFJLENBQUMsSUFBSSxJQUFBLHdDQUF3QixHQUFFLENBQUM7SUFDekUsSUFBSSxXQUFXLEVBQUUsQ0FBQztRQUNkLE9BQU8sUUFBUSxDQUFJLFlBQVksRUFBRSxnQkFBZ0IsRUFBRSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQ3ZFLENBQUM7SUFDRCxPQUFPLFFBQVEsQ0FBSSxZQUFZLEVBQUUsTUFBTSxFQUFFLElBQUksQ0FBQyxDQUFDO0FBQ25ELENBQUM7QUFFRDs7Ozs7Ozs7Ozs7R0FXRztBQUNJLEtBQUssVUFBVSw0QkFBNEIsQ0FDOUMsTUFBYyxFQUNkLE9BQWtCLEVBQUUsRUFDcEIsT0FBOEIsRUFBRTs7SUFFaEMsTUFBTSxhQUFhLEdBQUcsQ0FBQyxNQUFBLElBQUksQ0FBQyxPQUFPLG1DQUFJLElBQUksQ0FBQyxJQUFJLElBQUEsd0NBQXdCLEdBQUUsQ0FBQztJQUMzRSxJQUFJLENBQUM7UUFDRCxNQUFNLE1BQU0sR0FBRyxNQUFNLGNBQWMsQ0FBcUIsTUFBTSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztRQUM1RSxJQUFJLE1BQU0sSUFBSSxPQUFPLE1BQU0sS0FBSyxRQUFRLElBQUksU0FBUyxJQUFJLE1BQU0sRUFBRSxDQUFDO1lBQzlELE1BQU0sUUFBUSxHQUFHLE1BQThELENBQUM7WUFDaEYsSUFBSSxhQUFhLElBQUksUUFBUSxDQUFDLFlBQVksS0FBSyxTQUFTLEVBQUUsQ0FBQztnQkFDdkQsUUFBUSxDQUFDLFlBQVksR0FBRyxFQUFFLENBQUM7WUFDL0IsQ0FBQztZQUNELE9BQU8sUUFBUSxDQUFDO1FBQ3BCLENBQUM7UUFDRCx1QkFDSSxPQUFPLEVBQUUsSUFBSSxFQUNiLElBQUksRUFBRSxNQUFNLElBQ1QsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLEVBQUUsWUFBWSxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFDaEQ7SUFDTixDQUFDO0lBQUMsT0FBTyxHQUFRLEVBQUUsQ0FBQztRQUNoQix1QkFDSSxPQUFPLEVBQUUsS0FBSyxFQUNkLEtBQUssRUFBRSxnQkFBZ0IsTUFBTSxZQUFZLE1BQUEsR0FBRyxhQUFILEdBQUcsdUJBQUgsR0FBRyxDQUFFLE9BQU8sbUNBQUksTUFBTSxDQUFDLEdBQUcsQ0FBQyxFQUFFLElBQ25FLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxFQUFFLFlBQVksRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQ2hEO0lBQ04sQ0FBQztBQUNMLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEhlbHBlcnMgZm9yIGludm9raW5nIHNjZW5lLXNjcmlwdCBtZXRob2RzIGZyb20gdGhlIGVkaXRvciBob3N0IHByb2Nlc3MuXG4gKlxuICogYEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ2V4ZWN1dGUtc2NlbmUtc2NyaXB0JywgeyBuYW1lLCBtZXRob2QsXG4gKiBhcmdzIH0pYCBpcyB0aGUgb25seSBwYXRoIHRocm91Z2ggd2hpY2ggZXh0ZW5zaW9ucyByZWFjaCBlbmdpbmUtbGV2ZWxcbiAqIEFQSXMgKGluc3RhbmNlcyBvZiBgY2MuKmAsIHRoZSBgY2NlLipgIGVkaXRvciBuYW1lc3BhY2UpLiBDZW50cmFsaXNpbmdcbiAqIHRoZSBjYWxsIHNpdGUga2VlcHMgdGhlIHNjZW5lLXNjcmlwdCBwYWNrYWdlIG5hbWUgaW4gb25lIHBsYWNlIGFuZFxuICogbGV0cyB0aGUgcmVzdCBvZiB0aGUgY29kZWJhc2UgY2FsbCB0eXBlZCB3cmFwcGVycy5cbiAqL1xuXG5pbXBvcnQgdHlwZSB7IENhcHR1cmVkTG9nRW50cnksIFRvb2xSZXNwb25zZSB9IGZyb20gJy4uL3R5cGVzJztcbmltcG9ydCB7IGlzU2NlbmVMb2dDYXB0dXJlRW5hYmxlZCB9IGZyb20gJy4vcnVudGltZS1mbGFncyc7XG5cbmNvbnN0IFBBQ0tBR0VfTkFNRSA9ICdjb2Nvcy1tY3Atc2VydmVyJztcblxuZXhwb3J0IGludGVyZmFjZSBSdW5TY2VuZU1ldGhvZE9wdGlvbnMge1xuICAgIC8qKlxuICAgICAqIHYyLjQuOCBBMzogd2hlbiB0cnVlIChkZWZhdWx0KSwgdGhlIGNhbGwgaXMgcm91dGVkIHRocm91Z2ggdGhlXG4gICAgICogc2NlbmUtc2lkZSBgcnVuV2l0aENhcHR1cmVgIHdyYXBwZXIgd2hpY2ggbW9ua2V5LXBhdGNoZXNcbiAgICAgKiBjb25zb2xlLntsb2csd2FybixlcnJvcn0gYW5kIHJldHVybnMgY2FwdHVyZWRMb2dzLiBQYXNzIGBmYWxzZWBcbiAgICAgKiB0byBpbnZva2UgdGhlIGJhcmUgbWV0aG9kIChubyBleHRyYSBlbnZlbG9wZSwgbm8gbG9ncykuXG4gICAgICpcbiAgICAgKiBUaGUgcnVudGltZSBmbGFnIGBpc1NjZW5lTG9nQ2FwdHVyZUVuYWJsZWQoKWAgaXMgdGhlIGdsb2JhbCBnYXRlO1xuICAgICAqIGV2ZW4gaWYgYGNhcHR1cmU6IHRydWVgIGlzIHBhc3NlZCBoZXJlLCBjYXB0dXJlIG9ubHkgaGFwcGVucyB3aGVuXG4gICAgICogdGhlIGZsYWcgaXMgYWxzbyBlbmFibGVkLlxuICAgICAqL1xuICAgIGNhcHR1cmU/OiBib29sZWFuO1xufVxuXG5mdW5jdGlvbiBkaXNwYXRjaDxUPihuYW1lOiBzdHJpbmcsIG1ldGhvZDogc3RyaW5nLCBhcmdzOiB1bmtub3duW10pOiBQcm9taXNlPFQ+IHtcbiAgICByZXR1cm4gRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnZXhlY3V0ZS1zY2VuZS1zY3JpcHQnLCB7XG4gICAgICAgIG5hbWUsXG4gICAgICAgIG1ldGhvZCxcbiAgICAgICAgYXJncyxcbiAgICB9KSBhcyBQcm9taXNlPFQ+O1xufVxuXG4vKipcbiAqIEludm9rZSBhIHNjZW5lLXNjcmlwdCBtZXRob2QgYnkgbmFtZS4gUmV0dXJucyB0aGUgcmF3IHJlc3VsdCB0aGUgbWV0aG9kXG4gKiByZXNvbHZlZCB3aXRoIOKAlCB1c3VhbGx5IGEgYHsgc3VjY2VzcywgZGF0YT8sIGVycm9yPyB9YCBlbnZlbG9wZSBhbHJlYWR5LlxuICpcbiAqIFdoZW4gc2NlbmUgbG9nIGNhcHR1cmUgaXMgZW5hYmxlZCAoZGVmYXVsdCkgYW5kIGBvcHRzLmNhcHR1cmUgIT09IGZhbHNlYCxcbiAqIHRoZSBjYWxsIGlzIHdyYXBwZWQgdGhyb3VnaCBgcnVuV2l0aENhcHR1cmVgIHNvIHRoZSByZXN1bHQgZW52ZWxvcGVcbiAqIGNhcnJpZXMgYGNhcHR1cmVkTG9nc2AuIEV4aXN0aW5nIGNhbGxlcnMgZG9uJ3QgbmVlZCB0byBjaGFuZ2UgYW55dGhpbmcuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBydW5TY2VuZU1ldGhvZDxUID0gdW5rbm93bj4oXG4gICAgbWV0aG9kOiBzdHJpbmcsXG4gICAgYXJnczogdW5rbm93bltdID0gW10sXG4gICAgb3B0czogUnVuU2NlbmVNZXRob2RPcHRpb25zID0ge30sXG4pOiBQcm9taXNlPFQ+IHtcbiAgICBjb25zdCB3YW50Q2FwdHVyZSA9IChvcHRzLmNhcHR1cmUgPz8gdHJ1ZSkgJiYgaXNTY2VuZUxvZ0NhcHR1cmVFbmFibGVkKCk7XG4gICAgaWYgKHdhbnRDYXB0dXJlKSB7XG4gICAgICAgIHJldHVybiBkaXNwYXRjaDxUPihQQUNLQUdFX05BTUUsICdydW5XaXRoQ2FwdHVyZScsIFttZXRob2QsIGFyZ3NdKTtcbiAgICB9XG4gICAgcmV0dXJuIGRpc3BhdGNoPFQ+KFBBQ0tBR0VfTkFNRSwgbWV0aG9kLCBhcmdzKTtcbn1cblxuLyoqXG4gKiBTYW1lIGFzIGBydW5TY2VuZU1ldGhvZGAsIGJ1dCBjb2VyY2VzIGJvdGggdHJhbnNwb3J0IGFuZCBtZXRob2QtbGV2ZWxcbiAqIGZhaWx1cmVzIGludG8gYSBgVG9vbFJlc3BvbnNlYC4gVXNlIHRoaXMgd2hlbiB0aGUgY2FsbGVyIGlzIGl0c2VsZiBhXG4gKiB0b29sIGhhbmRsZXIgdGhhdCByZXR1cm5zIGEgVG9vbFJlc3BvbnNlIGRpcmVjdGx5LlxuICpcbiAqIE5vdGUgb24gY2FwdHVyZWRMb2dzOiB3aGVuIHNjZW5lIGxvZyBjYXB0dXJlIGlzIG9uLCB0aGUgdW5kZXJseWluZ1xuICogc2NlbmUgbWV0aG9kJ3MgcmV0dXJuIGVudmVsb3BlIGNhcnJpZXMgYGNhcHR1cmVkTG9nc2AgZGlyZWN0bHkuIFdlXG4gKiBjb3B5IHRoYXQgZmllbGQgb250byB0aGUgcmVzdWx0aW5nIFRvb2xSZXNwb25zZSBzbyBBSSBjbGllbnRzIHNlZVxuICogdGhlIGNvY29zIGNvbnNvbGUgb3V0cHV0IGZvciB0aGlzIG9wZXJhdGlvbi4gVGhlIHRyYW5zcG9ydC1sZXZlbFxuICogY2F0Y2ggcGF0aCBhdHRhY2hlcyBhbiBlbXB0eSBgY2FwdHVyZWRMb2dzYCBhcnJheSB0byBrZWVwIHRoZSBmaWVsZFxuICogc2hhcGUgc3RhYmxlIOKAlCBuZXZlciBgdW5kZWZpbmVkYCB3aGVuIGNhcHR1cmUgaXMgZW5hYmxlZC5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJ1blNjZW5lTWV0aG9kQXNUb29sUmVzcG9uc2UoXG4gICAgbWV0aG9kOiBzdHJpbmcsXG4gICAgYXJnczogdW5rbm93bltdID0gW10sXG4gICAgb3B0czogUnVuU2NlbmVNZXRob2RPcHRpb25zID0ge30sXG4pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgIGNvbnN0IGNhcHR1cmVBY3RpdmUgPSAob3B0cy5jYXB0dXJlID8/IHRydWUpICYmIGlzU2NlbmVMb2dDYXB0dXJlRW5hYmxlZCgpO1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJ1blNjZW5lTWV0aG9kPFRvb2xSZXNwb25zZSB8IGFueT4obWV0aG9kLCBhcmdzLCBvcHRzKTtcbiAgICAgICAgaWYgKHJlc3VsdCAmJiB0eXBlb2YgcmVzdWx0ID09PSAnb2JqZWN0JyAmJiAnc3VjY2VzcycgaW4gcmVzdWx0KSB7XG4gICAgICAgICAgICBjb25zdCBlbnZlbG9wZSA9IHJlc3VsdCBhcyBUb29sUmVzcG9uc2UgJiB7IGNhcHR1cmVkTG9ncz86IENhcHR1cmVkTG9nRW50cnlbXSB9O1xuICAgICAgICAgICAgaWYgKGNhcHR1cmVBY3RpdmUgJiYgZW52ZWxvcGUuY2FwdHVyZWRMb2dzID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBlbnZlbG9wZS5jYXB0dXJlZExvZ3MgPSBbXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBlbnZlbG9wZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgIGRhdGE6IHJlc3VsdCxcbiAgICAgICAgICAgIC4uLihjYXB0dXJlQWN0aXZlID8geyBjYXB0dXJlZExvZ3M6IFtdIH0gOiB7fSksXG4gICAgICAgIH07XG4gICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgZXJyb3I6IGBzY2VuZS1zY3JpcHQgJHttZXRob2R9IGZhaWxlZDogJHtlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycil9YCxcbiAgICAgICAgICAgIC4uLihjYXB0dXJlQWN0aXZlID8geyBjYXB0dXJlZExvZ3M6IFtdIH0gOiB7fSksXG4gICAgICAgIH07XG4gICAgfVxufVxuIl19