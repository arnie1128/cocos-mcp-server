"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ok = ok;
exports.fail = fail;
/** Build a success ToolResponse. */
function ok(data, message) {
    const r = { success: true };
    if (data !== undefined)
        r.data = data;
    if (message !== undefined)
        r.message = message;
    return r;
}
/** Build a failure ToolResponse. */
function fail(error, data) {
    const r = { success: false, error };
    if (data !== undefined)
        r.data = data;
    return r;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVzcG9uc2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvbGliL3Jlc3BvbnNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBR0EsZ0JBS0M7QUFHRCxvQkFJQztBQWJELG9DQUFvQztBQUNwQyxTQUFnQixFQUFFLENBQUMsSUFBYyxFQUFFLE9BQWdCO0lBQy9DLE1BQU0sQ0FBQyxHQUFpQixFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQztJQUMxQyxJQUFJLElBQUksS0FBSyxTQUFTO1FBQUUsQ0FBQyxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7SUFDdEMsSUFBSSxPQUFPLEtBQUssU0FBUztRQUFFLENBQUMsQ0FBQyxPQUFPLEdBQUcsT0FBTyxDQUFDO0lBQy9DLE9BQU8sQ0FBQyxDQUFDO0FBQ2IsQ0FBQztBQUVELG9DQUFvQztBQUNwQyxTQUFnQixJQUFJLENBQUMsS0FBYSxFQUFFLElBQWM7SUFDOUMsTUFBTSxDQUFDLEdBQWlCLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsQ0FBQztJQUNsRCxJQUFJLElBQUksS0FBSyxTQUFTO1FBQUUsQ0FBQyxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7SUFDdEMsT0FBTyxDQUFDLENBQUM7QUFDYixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHR5cGUgeyBUb29sUmVzcG9uc2UgfSBmcm9tICcuLi90eXBlcyc7XHJcblxyXG4vKiogQnVpbGQgYSBzdWNjZXNzIFRvb2xSZXNwb25zZS4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIG9rKGRhdGE/OiB1bmtub3duLCBtZXNzYWdlPzogc3RyaW5nKTogVG9vbFJlc3BvbnNlIHtcclxuICAgIGNvbnN0IHI6IFRvb2xSZXNwb25zZSA9IHsgc3VjY2VzczogdHJ1ZSB9O1xyXG4gICAgaWYgKGRhdGEgIT09IHVuZGVmaW5lZCkgci5kYXRhID0gZGF0YTtcclxuICAgIGlmIChtZXNzYWdlICE9PSB1bmRlZmluZWQpIHIubWVzc2FnZSA9IG1lc3NhZ2U7XHJcbiAgICByZXR1cm4gcjtcclxufVxyXG5cclxuLyoqIEJ1aWxkIGEgZmFpbHVyZSBUb29sUmVzcG9uc2UuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBmYWlsKGVycm9yOiBzdHJpbmcsIGRhdGE/OiB1bmtub3duKTogVG9vbFJlc3BvbnNlIHtcclxuICAgIGNvbnN0IHI6IFRvb2xSZXNwb25zZSA9IHsgc3VjY2VzczogZmFsc2UsIGVycm9yIH07XHJcbiAgICBpZiAoZGF0YSAhPT0gdW5kZWZpbmVkKSByLmRhdGEgPSBkYXRhO1xyXG4gICAgcmV0dXJuIHI7XHJcbn1cclxuIl19