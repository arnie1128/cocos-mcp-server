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
const PACKAGE_NAME = 'cocos-mcp-server';
/**
 * Invoke a scene-script method by name. Returns the raw result the method
 * resolved with — usually a `{ success, data?, error? }` envelope already.
 */
function runSceneMethod(method, args = []) {
    return Editor.Message.request('scene', 'execute-scene-script', {
        name: PACKAGE_NAME,
        method,
        args,
    });
}
/**
 * Same as `runSceneMethod`, but coerces both transport and method-level
 * failures into a `ToolResponse`. Use this when the caller is itself a
 * tool handler that returns a ToolResponse directly.
 */
async function runSceneMethodAsToolResponse(method, args = []) {
    var _a;
    try {
        const result = await runSceneMethod(method, args);
        if (result && typeof result === 'object' && 'success' in result) {
            return result;
        }
        return { success: true, data: result };
    }
    catch (err) {
        return {
            success: false,
            error: `scene-script ${method} failed: ${(_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : String(err)}`,
        };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NlbmUtYnJpZGdlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL2xpYi9zY2VuZS1icmlkZ2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7OztHQVFHOztBQVVILHdDQU1DO0FBT0Qsb0VBZ0JDO0FBbkNELE1BQU0sWUFBWSxHQUFHLGtCQUFrQixDQUFDO0FBRXhDOzs7R0FHRztBQUNILFNBQWdCLGNBQWMsQ0FBYyxNQUFjLEVBQUUsT0FBa0IsRUFBRTtJQUM1RSxPQUFPLE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBRSxzQkFBc0IsRUFBRTtRQUMzRCxJQUFJLEVBQUUsWUFBWTtRQUNsQixNQUFNO1FBQ04sSUFBSTtLQUNQLENBQWUsQ0FBQztBQUNyQixDQUFDO0FBRUQ7Ozs7R0FJRztBQUNJLEtBQUssVUFBVSw0QkFBNEIsQ0FDOUMsTUFBYyxFQUNkLE9BQWtCLEVBQUU7O0lBRXBCLElBQUksQ0FBQztRQUNELE1BQU0sTUFBTSxHQUFHLE1BQU0sY0FBYyxDQUFxQixNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDdEUsSUFBSSxNQUFNLElBQUksT0FBTyxNQUFNLEtBQUssUUFBUSxJQUFJLFNBQVMsSUFBSSxNQUFNLEVBQUUsQ0FBQztZQUM5RCxPQUFPLE1BQXNCLENBQUM7UUFDbEMsQ0FBQztRQUNELE9BQU8sRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsQ0FBQztJQUMzQyxDQUFDO0lBQUMsT0FBTyxHQUFRLEVBQUUsQ0FBQztRQUNoQixPQUFPO1lBQ0gsT0FBTyxFQUFFLEtBQUs7WUFDZCxLQUFLLEVBQUUsZ0JBQWdCLE1BQU0sWUFBWSxNQUFBLEdBQUcsYUFBSCxHQUFHLHVCQUFILEdBQUcsQ0FBRSxPQUFPLG1DQUFJLE1BQU0sQ0FBQyxHQUFHLENBQUMsRUFBRTtTQUN6RSxDQUFDO0lBQ04sQ0FBQztBQUNMLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEhlbHBlcnMgZm9yIGludm9raW5nIHNjZW5lLXNjcmlwdCBtZXRob2RzIGZyb20gdGhlIGVkaXRvciBob3N0IHByb2Nlc3MuXG4gKlxuICogYEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ2V4ZWN1dGUtc2NlbmUtc2NyaXB0JywgeyBuYW1lLCBtZXRob2QsXG4gKiBhcmdzIH0pYCBpcyB0aGUgb25seSBwYXRoIHRocm91Z2ggd2hpY2ggZXh0ZW5zaW9ucyByZWFjaCBlbmdpbmUtbGV2ZWxcbiAqIEFQSXMgKGluc3RhbmNlcyBvZiBgY2MuKmAsIHRoZSBgY2NlLipgIGVkaXRvciBuYW1lc3BhY2UpLiBDZW50cmFsaXNpbmdcbiAqIHRoZSBjYWxsIHNpdGUga2VlcHMgdGhlIHNjZW5lLXNjcmlwdCBwYWNrYWdlIG5hbWUgaW4gb25lIHBsYWNlIGFuZFxuICogbGV0cyB0aGUgcmVzdCBvZiB0aGUgY29kZWJhc2UgY2FsbCB0eXBlZCB3cmFwcGVycy5cbiAqL1xuXG5pbXBvcnQgdHlwZSB7IFRvb2xSZXNwb25zZSB9IGZyb20gJy4uL3R5cGVzJztcblxuY29uc3QgUEFDS0FHRV9OQU1FID0gJ2NvY29zLW1jcC1zZXJ2ZXInO1xuXG4vKipcbiAqIEludm9rZSBhIHNjZW5lLXNjcmlwdCBtZXRob2QgYnkgbmFtZS4gUmV0dXJucyB0aGUgcmF3IHJlc3VsdCB0aGUgbWV0aG9kXG4gKiByZXNvbHZlZCB3aXRoIOKAlCB1c3VhbGx5IGEgYHsgc3VjY2VzcywgZGF0YT8sIGVycm9yPyB9YCBlbnZlbG9wZSBhbHJlYWR5LlxuICovXG5leHBvcnQgZnVuY3Rpb24gcnVuU2NlbmVNZXRob2Q8VCA9IHVua25vd24+KG1ldGhvZDogc3RyaW5nLCBhcmdzOiB1bmtub3duW10gPSBbXSk6IFByb21pc2U8VD4ge1xuICAgIHJldHVybiBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdleGVjdXRlLXNjZW5lLXNjcmlwdCcsIHtcbiAgICAgICAgbmFtZTogUEFDS0FHRV9OQU1FLFxuICAgICAgICBtZXRob2QsXG4gICAgICAgIGFyZ3MsXG4gICAgfSkgYXMgUHJvbWlzZTxUPjtcbn1cblxuLyoqXG4gKiBTYW1lIGFzIGBydW5TY2VuZU1ldGhvZGAsIGJ1dCBjb2VyY2VzIGJvdGggdHJhbnNwb3J0IGFuZCBtZXRob2QtbGV2ZWxcbiAqIGZhaWx1cmVzIGludG8gYSBgVG9vbFJlc3BvbnNlYC4gVXNlIHRoaXMgd2hlbiB0aGUgY2FsbGVyIGlzIGl0c2VsZiBhXG4gKiB0b29sIGhhbmRsZXIgdGhhdCByZXR1cm5zIGEgVG9vbFJlc3BvbnNlIGRpcmVjdGx5LlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcnVuU2NlbmVNZXRob2RBc1Rvb2xSZXNwb25zZShcbiAgICBtZXRob2Q6IHN0cmluZyxcbiAgICBhcmdzOiB1bmtub3duW10gPSBbXSxcbik6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgcnVuU2NlbmVNZXRob2Q8VG9vbFJlc3BvbnNlIHwgYW55PihtZXRob2QsIGFyZ3MpO1xuICAgICAgICBpZiAocmVzdWx0ICYmIHR5cGVvZiByZXN1bHQgPT09ICdvYmplY3QnICYmICdzdWNjZXNzJyBpbiByZXN1bHQpIHtcbiAgICAgICAgICAgIHJldHVybiByZXN1bHQgYXMgVG9vbFJlc3BvbnNlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IHJlc3VsdCB9O1xuICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgIGVycm9yOiBgc2NlbmUtc2NyaXB0ICR7bWV0aG9kfSBmYWlsZWQ6ICR7ZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpfWAsXG4gICAgICAgIH07XG4gICAgfVxufVxuIl19