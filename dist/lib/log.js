"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
exports.setDebugLogEnabled = setDebugLogEnabled;
exports.debugLog = debugLog;
let _enableDebug = false;
function setDebugLogEnabled(enable) {
    _enableDebug = enable;
}
exports.logger = {
    debug: (...args) => {
        if (_enableDebug) {
            console.log(...args);
        }
    },
    info: (...args) => {
        console.log(...args);
    },
    warn: (...args) => {
        console.warn(...args);
    },
    error: (...args) => {
        console.error(...args);
    },
};
// Backwards-compatible alias from P0 — prefer logger.debug for new code.
function debugLog(...args) {
    exports.logger.debug(...args);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibG9nLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL2xpYi9sb2cudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBRUEsZ0RBRUM7QUFvQkQsNEJBRUM7QUExQkQsSUFBSSxZQUFZLEdBQUcsS0FBSyxDQUFDO0FBRXpCLFNBQWdCLGtCQUFrQixDQUFDLE1BQWU7SUFDOUMsWUFBWSxHQUFHLE1BQU0sQ0FBQztBQUMxQixDQUFDO0FBRVksUUFBQSxNQUFNLEdBQUc7SUFDbEIsS0FBSyxFQUFFLENBQUMsR0FBRyxJQUFXLEVBQVEsRUFBRTtRQUM1QixJQUFJLFlBQVksRUFBRSxDQUFDO1lBQ2YsT0FBTyxDQUFDLEdBQUcsQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDO1FBQ3pCLENBQUM7SUFDTCxDQUFDO0lBQ0QsSUFBSSxFQUFFLENBQUMsR0FBRyxJQUFXLEVBQVEsRUFBRTtRQUMzQixPQUFPLENBQUMsR0FBRyxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUM7SUFDekIsQ0FBQztJQUNELElBQUksRUFBRSxDQUFDLEdBQUcsSUFBVyxFQUFRLEVBQUU7UUFDM0IsT0FBTyxDQUFDLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDO0lBQzFCLENBQUM7SUFDRCxLQUFLLEVBQUUsQ0FBQyxHQUFHLElBQVcsRUFBUSxFQUFFO1FBQzVCLE9BQU8sQ0FBQyxLQUFLLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQztJQUMzQixDQUFDO0NBQ0osQ0FBQztBQUVGLHlFQUF5RTtBQUN6RSxTQUFnQixRQUFRLENBQUMsR0FBRyxJQUFXO0lBQ25DLGNBQU0sQ0FBQyxLQUFLLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQztBQUMxQixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsibGV0IF9lbmFibGVEZWJ1ZyA9IGZhbHNlO1xuXG5leHBvcnQgZnVuY3Rpb24gc2V0RGVidWdMb2dFbmFibGVkKGVuYWJsZTogYm9vbGVhbik6IHZvaWQge1xuICAgIF9lbmFibGVEZWJ1ZyA9IGVuYWJsZTtcbn1cblxuZXhwb3J0IGNvbnN0IGxvZ2dlciA9IHtcbiAgICBkZWJ1ZzogKC4uLmFyZ3M6IGFueVtdKTogdm9pZCA9PiB7XG4gICAgICAgIGlmIChfZW5hYmxlRGVidWcpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKC4uLmFyZ3MpO1xuICAgICAgICB9XG4gICAgfSxcbiAgICBpbmZvOiAoLi4uYXJnczogYW55W10pOiB2b2lkID0+IHtcbiAgICAgICAgY29uc29sZS5sb2coLi4uYXJncyk7XG4gICAgfSxcbiAgICB3YXJuOiAoLi4uYXJnczogYW55W10pOiB2b2lkID0+IHtcbiAgICAgICAgY29uc29sZS53YXJuKC4uLmFyZ3MpO1xuICAgIH0sXG4gICAgZXJyb3I6ICguLi5hcmdzOiBhbnlbXSk6IHZvaWQgPT4ge1xuICAgICAgICBjb25zb2xlLmVycm9yKC4uLmFyZ3MpO1xuICAgIH0sXG59O1xuXG4vLyBCYWNrd2FyZHMtY29tcGF0aWJsZSBhbGlhcyBmcm9tIFAwIOKAlCBwcmVmZXIgbG9nZ2VyLmRlYnVnIGZvciBuZXcgY29kZS5cbmV4cG9ydCBmdW5jdGlvbiBkZWJ1Z0xvZyguLi5hcmdzOiBhbnlbXSk6IHZvaWQge1xuICAgIGxvZ2dlci5kZWJ1ZyguLi5hcmdzKTtcbn1cbiJdfQ==