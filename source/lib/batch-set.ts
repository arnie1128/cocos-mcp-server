/**
 * batch-set — write multiple properties in one round-trip.
 *
 * Replaces N sequential `set-property` IPC calls with a parallelised batch.
 * Each entry is `{path, value}` rooted at the same node uuid; the batch
 * issues `Editor.Message.request('scene', 'set-property', ...)` for every
 * entry concurrently and waits for all to finish.
 *
 * Failure semantics: per-entry. The result reports each entry's
 * success/error so the caller can see partial failures rather than one
 * opaque "batch failed" message. `success` at the top level is true only
 * if every entry succeeded.
 *
 * Reference: cocos-creator-mcp (harady) batch property write
 * (`properties: [{property, value}]` array mode). See
 * docs/research/repos/cocos-creator-mcp.md §3.
 */

import type { ToolResponse } from '../types';

export interface BatchSetEntry {
    /** Property path passed as `path` to scene/set-property (e.g. `position`, `__comps__.0.enabled`). */
    path: string;
    /** Value passed under `dump.value`. Shape must match the property's Cocos dump shape. */
    value: any;
}

export interface BatchSetResult {
    path: string;
    success: boolean;
    error?: string;
}

/**
 * Run set-property in parallel for every entry. Returns a ToolResponse
 * whose `success` is true only if all entries succeeded; partial results
 * are always available in `data.results` so callers can inspect which
 * entries failed.
 */
export async function batchSetProperties(
    uuid: string,
    entries: BatchSetEntry[],
): Promise<ToolResponse> {
    if (!Array.isArray(entries) || entries.length === 0) {
        return { success: false, error: 'batch-set: entries[] must be a non-empty array' };
    }

    const settled = await Promise.allSettled(
        entries.map(e =>
            Editor.Message.request('scene', 'set-property', {
                uuid,
                path: e.path,
                dump: { value: e.value },
            })
        )
    );

    const results: BatchSetResult[] = settled.map((s, i) => {
        if (s.status === 'fulfilled') {
            return { path: entries[i].path, success: true };
        }
        return {
            path: entries[i].path,
            success: false,
            error: s.reason?.message ?? String(s.reason),
        };
    });

    const failed = results.filter(r => !r.success);
    return {
        success: failed.length === 0,
        data: {
            uuid,
            total: results.length,
            failedCount: failed.length,
            results,
        },
        message: failed.length === 0
            ? `Wrote ${results.length} properties`
            : `${failed.length}/${results.length} property writes failed`,
    };
}
