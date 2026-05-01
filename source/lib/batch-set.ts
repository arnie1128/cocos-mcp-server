/**
 * batch-set — write multiple properties on the same node in one tool call.
 *
 * Each entry is `{path, value}` rooted at the same node uuid; the batch
 * issues `Editor.Message.request('scene', 'set-property', ...)` for every
 * entry **sequentially** (serial await) so:
 *   - Cocos undo recordings stay one-step-per-write rather than racing.
 *   - The editor serialization model (Landmine #11) sees writes in the
 *     order the caller specified.
 *   - Duplicate or overlapping paths produce a defined "last write wins"
 *     instead of "whichever IPC reply landed last".
 *
 * v2.4.1 review fix (gemini + codex + claude): the v2.4.0 implementation
 * used `Promise.allSettled` which fires every set-property concurrently.
 * Two same-node concurrent writes have no ordering guarantee in cocos
 * scene IPC, and overlapping-path entries (e.g. `position` and
 * `position.x`) produced undefined final state. Sequential is slower
 * but correct; v2.5+ may revisit if a verified safe scene/set-properties
 * channel becomes available.
 *
 * Failure semantics: per-entry. `success` at the top level is true only
 * if every entry succeeded; the per-entry result list is always
 * returned in `data.results` so callers can inspect partial failures.
 *
 * Path collision check: pre-flight only. Two entries with byte-equal
 * paths reject with a duplicate-path error; truly nested overlap
 * (`position` and `position.x`) is allowed but warned in the response.
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

export async function batchSetProperties(
    uuid: string,
    entries: BatchSetEntry[],
): Promise<ToolResponse> {
    if (!Array.isArray(entries) || entries.length === 0) {
        return { success: false, error: 'batch-set: entries[] must be a non-empty array' };
    }

    // Reject byte-equal duplicate paths up-front. Overlap (`a` vs `a.b`)
    // is permitted but flagged as a warning so the caller can audit.
    const dupCheck = new Set<string>();
    const dups: string[] = [];
    for (const e of entries) {
        if (dupCheck.has(e.path)) dups.push(e.path);
        dupCheck.add(e.path);
    }
    if (dups.length > 0) {
        return {
            success: false,
            error: `batch-set: duplicate path(s) in entries: ${[...new Set(dups)].join(', ')}. Each path must appear at most once per call.`,
        };
    }
    const overlaps: string[] = [];
    const sortedPaths = [...dupCheck].sort();
    for (let i = 0; i < sortedPaths.length; i++) {
        for (let j = i + 1; j < sortedPaths.length; j++) {
            const a = sortedPaths[i];
            const b = sortedPaths[j];
            if (b.startsWith(a + '.') || b.startsWith(a + '[')) {
                overlaps.push(`${a} ⊃ ${b}`);
            }
        }
    }

    const results: BatchSetResult[] = [];
    for (const e of entries) {
        try {
            await Editor.Message.request('scene', 'set-property', {
                uuid,
                path: e.path,
                dump: { value: e.value },
            });
            results.push({ path: e.path, success: true });
        } catch (err: any) {
            results.push({
                path: e.path,
                success: false,
                error: err?.message ?? String(err),
            });
        }
    }

    const failed = results.filter(r => !r.success);
    const response: ToolResponse = {
        success: failed.length === 0,
        data: {
            uuid,
            total: results.length,
            failedCount: failed.length,
            results,
        },
        message: failed.length === 0
            ? `Wrote ${results.length} properties (sequential)`
            : `${failed.length}/${results.length} property writes failed`,
    };
    if (overlaps.length > 0) {
        response.warning = `Overlapping path(s) in this batch: ${overlaps.join(', ')}. Sequential order applied; later writes may shadow earlier ones.`;
    }
    return response;
}
