"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findComponentIndexByType = findComponentIndexByType;
/**
 * findComponentIndexByType — locate a component on a query-node dump
 * by its type identifier.
 *
 * Cocos returns components with one of three identity fields populated
 * (__type__ for engine types, cid for project scripts, type as legacy
 * fallback). At most one is set per component, so an OR across all three
 * is equivalent to the various per-site variants found in the codebase.
 *
 * Returns -1 when not found, matching Array.findIndex semantics.
 */
function findComponentIndexByType(comps, type) {
    return comps.findIndex(c => (c === null || c === void 0 ? void 0 : c.__type__) === type || (c === null || c === void 0 ? void 0 : c.cid) === type || (c === null || c === void 0 ? void 0 : c.type) === type);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tcG9uZW50LWxvb2t1cC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NvdXJjZS9saWIvY29tcG9uZW50LWxvb2t1cC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQVdBLDREQUVDO0FBYkQ7Ozs7Ozs7Ozs7R0FVRztBQUNILFNBQWdCLHdCQUF3QixDQUFDLEtBQVksRUFBRSxJQUFZO0lBQy9ELE9BQU8sS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUEsQ0FBQyxhQUFELENBQUMsdUJBQUQsQ0FBQyxDQUFFLFFBQVEsTUFBSyxJQUFJLElBQUksQ0FBQSxDQUFDLGFBQUQsQ0FBQyx1QkFBRCxDQUFDLENBQUUsR0FBRyxNQUFLLElBQUksSUFBSSxDQUFBLENBQUMsYUFBRCxDQUFDLHVCQUFELENBQUMsQ0FBRSxJQUFJLE1BQUssSUFBSSxDQUFDLENBQUM7QUFDN0YsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogZmluZENvbXBvbmVudEluZGV4QnlUeXBlIOKAlCBsb2NhdGUgYSBjb21wb25lbnQgb24gYSBxdWVyeS1ub2RlIGR1bXBcbiAqIGJ5IGl0cyB0eXBlIGlkZW50aWZpZXIuXG4gKlxuICogQ29jb3MgcmV0dXJucyBjb21wb25lbnRzIHdpdGggb25lIG9mIHRocmVlIGlkZW50aXR5IGZpZWxkcyBwb3B1bGF0ZWRcbiAqIChfX3R5cGVfXyBmb3IgZW5naW5lIHR5cGVzLCBjaWQgZm9yIHByb2plY3Qgc2NyaXB0cywgdHlwZSBhcyBsZWdhY3lcbiAqIGZhbGxiYWNrKS4gQXQgbW9zdCBvbmUgaXMgc2V0IHBlciBjb21wb25lbnQsIHNvIGFuIE9SIGFjcm9zcyBhbGwgdGhyZWVcbiAqIGlzIGVxdWl2YWxlbnQgdG8gdGhlIHZhcmlvdXMgcGVyLXNpdGUgdmFyaWFudHMgZm91bmQgaW4gdGhlIGNvZGViYXNlLlxuICpcbiAqIFJldHVybnMgLTEgd2hlbiBub3QgZm91bmQsIG1hdGNoaW5nIEFycmF5LmZpbmRJbmRleCBzZW1hbnRpY3MuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmaW5kQ29tcG9uZW50SW5kZXhCeVR5cGUoY29tcHM6IGFueVtdLCB0eXBlOiBzdHJpbmcpOiBudW1iZXIge1xuICAgIHJldHVybiBjb21wcy5maW5kSW5kZXgoYyA9PiBjPy5fX3R5cGVfXyA9PT0gdHlwZSB8fCBjPy5jaWQgPT09IHR5cGUgfHwgYz8udHlwZSA9PT0gdHlwZSk7XG59XG4iXX0=