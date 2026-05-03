/**
 * Unwrap a Cocos dump field that may be returned as either nested
 * `{ value: T }` form or flat `T` form.
 *
 * `scene/query-node` and `scene/query-node-tree` are inconsistent across
 * Cocos versions and component types. Use this for ordinary dual-form dump
 * reads, but keep bespoke reads where both shapes must be inspected
 * simultaneously (for example the `enabled` nudge landmine).
 */
export function dumpUnwrap<T>(dump: { value?: T } | T | null | undefined): T | undefined;
export function dumpUnwrap<T>(dump: { value?: T } | T | null | undefined, fallback: T): T;
export function dumpUnwrap<T>(dump: { value?: T } | T | null | undefined, fallback?: T): T | undefined {
    if (dump && typeof dump === 'object' && 'value' in dump && (dump as { value?: T }).value !== undefined) {
        return (dump as { value?: T }).value;
    }
    return dump === undefined || dump === null ? fallback : dump as T;
}
