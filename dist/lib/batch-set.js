"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.batchSetProperties = batchSetProperties;
async function batchSetProperties(uuid, entries) {
    var _a;
    if (!Array.isArray(entries) || entries.length === 0) {
        return { success: false, error: 'batch-set: entries[] must be a non-empty array' };
    }
    // Reject byte-equal duplicate paths up-front. Overlap (`a` vs `a.b`)
    // is permitted but flagged as a warning so the caller can audit.
    const dupCheck = new Set();
    const dups = [];
    for (const e of entries) {
        if (dupCheck.has(e.path))
            dups.push(e.path);
        dupCheck.add(e.path);
    }
    if (dups.length > 0) {
        return {
            success: false,
            error: `batch-set: duplicate path(s) in entries: ${[...new Set(dups)].join(', ')}. Each path must appear at most once per call.`,
        };
    }
    const overlaps = [];
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
    const results = [];
    for (const e of entries) {
        try {
            await Editor.Message.request('scene', 'set-property', {
                uuid,
                path: e.path,
                dump: { value: e.value },
            });
            results.push({ path: e.path, success: true });
        }
        catch (err) {
            results.push({
                path: e.path,
                success: false,
                error: (_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : String(err),
            });
        }
    }
    const failed = results.filter(r => !r.success);
    const response = {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmF0Y2gtc2V0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL2xpYi9iYXRjaC1zZXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBK0JHOztBQWlCSCxnREFxRUM7QUFyRU0sS0FBSyxVQUFVLGtCQUFrQixDQUNwQyxJQUFZLEVBQ1osT0FBd0I7O0lBRXhCLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxJQUFJLE9BQU8sQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7UUFDbEQsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLGdEQUFnRCxFQUFFLENBQUM7SUFDdkYsQ0FBQztJQUVELHFFQUFxRTtJQUNyRSxpRUFBaUU7SUFDakUsTUFBTSxRQUFRLEdBQUcsSUFBSSxHQUFHLEVBQVUsQ0FBQztJQUNuQyxNQUFNLElBQUksR0FBYSxFQUFFLENBQUM7SUFDMUIsS0FBSyxNQUFNLENBQUMsSUFBSSxPQUFPLEVBQUUsQ0FBQztRQUN0QixJQUFJLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQztZQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzVDLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3pCLENBQUM7SUFDRCxJQUFJLElBQUksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7UUFDbEIsT0FBTztZQUNILE9BQU8sRUFBRSxLQUFLO1lBQ2QsS0FBSyxFQUFFLDRDQUE0QyxDQUFDLEdBQUcsSUFBSSxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLGdEQUFnRDtTQUNuSSxDQUFDO0lBQ04sQ0FBQztJQUNELE1BQU0sUUFBUSxHQUFhLEVBQUUsQ0FBQztJQUM5QixNQUFNLFdBQVcsR0FBRyxDQUFDLEdBQUcsUUFBUSxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDekMsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLFdBQVcsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztRQUMxQyxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLFdBQVcsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUM5QyxNQUFNLENBQUMsR0FBRyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDekIsTUFBTSxDQUFDLEdBQUcsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3pCLElBQUksQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLEdBQUcsR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDakQsUUFBUSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ2pDLENBQUM7UUFDTCxDQUFDO0lBQ0wsQ0FBQztJQUVELE1BQU0sT0FBTyxHQUFxQixFQUFFLENBQUM7SUFDckMsS0FBSyxNQUFNLENBQUMsSUFBSSxPQUFPLEVBQUUsQ0FBQztRQUN0QixJQUFJLENBQUM7WUFDRCxNQUFNLE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBRSxjQUFjLEVBQUU7Z0JBQ2xELElBQUk7Z0JBQ0osSUFBSSxFQUFFLENBQUMsQ0FBQyxJQUFJO2dCQUNaLElBQUksRUFBRSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUMsS0FBSyxFQUFFO2FBQzNCLENBQUMsQ0FBQztZQUNILE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLElBQUksRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUNsRCxDQUFDO1FBQUMsT0FBTyxHQUFRLEVBQUUsQ0FBQztZQUNoQixPQUFPLENBQUMsSUFBSSxDQUFDO2dCQUNULElBQUksRUFBRSxDQUFDLENBQUMsSUFBSTtnQkFDWixPQUFPLEVBQUUsS0FBSztnQkFDZCxLQUFLLEVBQUUsTUFBQSxHQUFHLGFBQUgsR0FBRyx1QkFBSCxHQUFHLENBQUUsT0FBTyxtQ0FBSSxNQUFNLENBQUMsR0FBRyxDQUFDO2FBQ3JDLENBQUMsQ0FBQztRQUNQLENBQUM7SUFDTCxDQUFDO0lBRUQsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQy9DLE1BQU0sUUFBUSxHQUFpQjtRQUMzQixPQUFPLEVBQUUsTUFBTSxDQUFDLE1BQU0sS0FBSyxDQUFDO1FBQzVCLElBQUksRUFBRTtZQUNGLElBQUk7WUFDSixLQUFLLEVBQUUsT0FBTyxDQUFDLE1BQU07WUFDckIsV0FBVyxFQUFFLE1BQU0sQ0FBQyxNQUFNO1lBQzFCLE9BQU87U0FDVjtRQUNELE9BQU8sRUFBRSxNQUFNLENBQUMsTUFBTSxLQUFLLENBQUM7WUFDeEIsQ0FBQyxDQUFDLFNBQVMsT0FBTyxDQUFDLE1BQU0sMEJBQTBCO1lBQ25ELENBQUMsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxNQUFNLElBQUksT0FBTyxDQUFDLE1BQU0seUJBQXlCO0tBQ3BFLENBQUM7SUFDRixJQUFJLFFBQVEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7UUFDdEIsUUFBUSxDQUFDLE9BQU8sR0FBRyxzQ0FBc0MsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsbUVBQW1FLENBQUM7SUFDcEosQ0FBQztJQUNELE9BQU8sUUFBUSxDQUFDO0FBQ3BCLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIGJhdGNoLXNldCDigJQgd3JpdGUgbXVsdGlwbGUgcHJvcGVydGllcyBvbiB0aGUgc2FtZSBub2RlIGluIG9uZSB0b29sIGNhbGwuXG4gKlxuICogRWFjaCBlbnRyeSBpcyBge3BhdGgsIHZhbHVlfWAgcm9vdGVkIGF0IHRoZSBzYW1lIG5vZGUgdXVpZDsgdGhlIGJhdGNoXG4gKiBpc3N1ZXMgYEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3NldC1wcm9wZXJ0eScsIC4uLilgIGZvciBldmVyeVxuICogZW50cnkgKipzZXF1ZW50aWFsbHkqKiAoc2VyaWFsIGF3YWl0KSBzbzpcbiAqICAgLSBDb2NvcyB1bmRvIHJlY29yZGluZ3Mgc3RheSBvbmUtc3RlcC1wZXItd3JpdGUgcmF0aGVyIHRoYW4gcmFjaW5nLlxuICogICAtIFRoZSBlZGl0b3Igc2VyaWFsaXphdGlvbiBtb2RlbCAoTGFuZG1pbmUgIzExKSBzZWVzIHdyaXRlcyBpbiB0aGVcbiAqICAgICBvcmRlciB0aGUgY2FsbGVyIHNwZWNpZmllZC5cbiAqICAgLSBEdXBsaWNhdGUgb3Igb3ZlcmxhcHBpbmcgcGF0aHMgcHJvZHVjZSBhIGRlZmluZWQgXCJsYXN0IHdyaXRlIHdpbnNcIlxuICogICAgIGluc3RlYWQgb2YgXCJ3aGljaGV2ZXIgSVBDIHJlcGx5IGxhbmRlZCBsYXN0XCIuXG4gKlxuICogdjIuNC4xIHJldmlldyBmaXggKGdlbWluaSArIGNvZGV4ICsgY2xhdWRlKTogdGhlIHYyLjQuMCBpbXBsZW1lbnRhdGlvblxuICogdXNlZCBgUHJvbWlzZS5hbGxTZXR0bGVkYCB3aGljaCBmaXJlcyBldmVyeSBzZXQtcHJvcGVydHkgY29uY3VycmVudGx5LlxuICogVHdvIHNhbWUtbm9kZSBjb25jdXJyZW50IHdyaXRlcyBoYXZlIG5vIG9yZGVyaW5nIGd1YXJhbnRlZSBpbiBjb2Nvc1xuICogc2NlbmUgSVBDLCBhbmQgb3ZlcmxhcHBpbmctcGF0aCBlbnRyaWVzIChlLmcuIGBwb3NpdGlvbmAgYW5kXG4gKiBgcG9zaXRpb24ueGApIHByb2R1Y2VkIHVuZGVmaW5lZCBmaW5hbCBzdGF0ZS4gU2VxdWVudGlhbCBpcyBzbG93ZXJcbiAqIGJ1dCBjb3JyZWN0OyB2Mi41KyBtYXkgcmV2aXNpdCBpZiBhIHZlcmlmaWVkIHNhZmUgc2NlbmUvc2V0LXByb3BlcnRpZXNcbiAqIGNoYW5uZWwgYmVjb21lcyBhdmFpbGFibGUuXG4gKlxuICogRmFpbHVyZSBzZW1hbnRpY3M6IHBlci1lbnRyeS4gYHN1Y2Nlc3NgIGF0IHRoZSB0b3AgbGV2ZWwgaXMgdHJ1ZSBvbmx5XG4gKiBpZiBldmVyeSBlbnRyeSBzdWNjZWVkZWQ7IHRoZSBwZXItZW50cnkgcmVzdWx0IGxpc3QgaXMgYWx3YXlzXG4gKiByZXR1cm5lZCBpbiBgZGF0YS5yZXN1bHRzYCBzbyBjYWxsZXJzIGNhbiBpbnNwZWN0IHBhcnRpYWwgZmFpbHVyZXMuXG4gKlxuICogUGF0aCBjb2xsaXNpb24gY2hlY2s6IHByZS1mbGlnaHQgb25seS4gVHdvIGVudHJpZXMgd2l0aCBieXRlLWVxdWFsXG4gKiBwYXRocyByZWplY3Qgd2l0aCBhIGR1cGxpY2F0ZS1wYXRoIGVycm9yOyB0cnVseSBuZXN0ZWQgb3ZlcmxhcFxuICogKGBwb3NpdGlvbmAgYW5kIGBwb3NpdGlvbi54YCkgaXMgYWxsb3dlZCBidXQgd2FybmVkIGluIHRoZSByZXNwb25zZS5cbiAqXG4gKiBSZWZlcmVuY2U6IGNvY29zLWNyZWF0b3ItbWNwIChoYXJhZHkpIGJhdGNoIHByb3BlcnR5IHdyaXRlXG4gKiAoYHByb3BlcnRpZXM6IFt7cHJvcGVydHksIHZhbHVlfV1gIGFycmF5IG1vZGUpLiBTZWVcbiAqIGRvY3MvcmVzZWFyY2gvcmVwb3MvY29jb3MtY3JlYXRvci1tY3AubWQgwqczLlxuICovXG5cbmltcG9ydCB0eXBlIHsgVG9vbFJlc3BvbnNlIH0gZnJvbSAnLi4vdHlwZXMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIEJhdGNoU2V0RW50cnkge1xuICAgIC8qKiBQcm9wZXJ0eSBwYXRoIHBhc3NlZCBhcyBgcGF0aGAgdG8gc2NlbmUvc2V0LXByb3BlcnR5IChlLmcuIGBwb3NpdGlvbmAsIGBfX2NvbXBzX18uMC5lbmFibGVkYCkuICovXG4gICAgcGF0aDogc3RyaW5nO1xuICAgIC8qKiBWYWx1ZSBwYXNzZWQgdW5kZXIgYGR1bXAudmFsdWVgLiBTaGFwZSBtdXN0IG1hdGNoIHRoZSBwcm9wZXJ0eSdzIENvY29zIGR1bXAgc2hhcGUuICovXG4gICAgdmFsdWU6IGFueTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBCYXRjaFNldFJlc3VsdCB7XG4gICAgcGF0aDogc3RyaW5nO1xuICAgIHN1Y2Nlc3M6IGJvb2xlYW47XG4gICAgZXJyb3I/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBiYXRjaFNldFByb3BlcnRpZXMoXG4gICAgdXVpZDogc3RyaW5nLFxuICAgIGVudHJpZXM6IEJhdGNoU2V0RW50cnlbXSxcbik6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGVudHJpZXMpIHx8IGVudHJpZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ2JhdGNoLXNldDogZW50cmllc1tdIG11c3QgYmUgYSBub24tZW1wdHkgYXJyYXknIH07XG4gICAgfVxuXG4gICAgLy8gUmVqZWN0IGJ5dGUtZXF1YWwgZHVwbGljYXRlIHBhdGhzIHVwLWZyb250LiBPdmVybGFwIChgYWAgdnMgYGEuYmApXG4gICAgLy8gaXMgcGVybWl0dGVkIGJ1dCBmbGFnZ2VkIGFzIGEgd2FybmluZyBzbyB0aGUgY2FsbGVyIGNhbiBhdWRpdC5cbiAgICBjb25zdCBkdXBDaGVjayA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAgIGNvbnN0IGR1cHM6IHN0cmluZ1tdID0gW107XG4gICAgZm9yIChjb25zdCBlIG9mIGVudHJpZXMpIHtcbiAgICAgICAgaWYgKGR1cENoZWNrLmhhcyhlLnBhdGgpKSBkdXBzLnB1c2goZS5wYXRoKTtcbiAgICAgICAgZHVwQ2hlY2suYWRkKGUucGF0aCk7XG4gICAgfVxuICAgIGlmIChkdXBzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgZXJyb3I6IGBiYXRjaC1zZXQ6IGR1cGxpY2F0ZSBwYXRoKHMpIGluIGVudHJpZXM6ICR7Wy4uLm5ldyBTZXQoZHVwcyldLmpvaW4oJywgJyl9LiBFYWNoIHBhdGggbXVzdCBhcHBlYXIgYXQgbW9zdCBvbmNlIHBlciBjYWxsLmAsXG4gICAgICAgIH07XG4gICAgfVxuICAgIGNvbnN0IG92ZXJsYXBzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGNvbnN0IHNvcnRlZFBhdGhzID0gWy4uLmR1cENoZWNrXS5zb3J0KCk7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzb3J0ZWRQYXRocy5sZW5ndGg7IGkrKykge1xuICAgICAgICBmb3IgKGxldCBqID0gaSArIDE7IGogPCBzb3J0ZWRQYXRocy5sZW5ndGg7IGorKykge1xuICAgICAgICAgICAgY29uc3QgYSA9IHNvcnRlZFBhdGhzW2ldO1xuICAgICAgICAgICAgY29uc3QgYiA9IHNvcnRlZFBhdGhzW2pdO1xuICAgICAgICAgICAgaWYgKGIuc3RhcnRzV2l0aChhICsgJy4nKSB8fCBiLnN0YXJ0c1dpdGgoYSArICdbJykpIHtcbiAgICAgICAgICAgICAgICBvdmVybGFwcy5wdXNoKGAke2F9IOKKgyAke2J9YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCByZXN1bHRzOiBCYXRjaFNldFJlc3VsdFtdID0gW107XG4gICAgZm9yIChjb25zdCBlIG9mIGVudHJpZXMpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3NldC1wcm9wZXJ0eScsIHtcbiAgICAgICAgICAgICAgICB1dWlkLFxuICAgICAgICAgICAgICAgIHBhdGg6IGUucGF0aCxcbiAgICAgICAgICAgICAgICBkdW1wOiB7IHZhbHVlOiBlLnZhbHVlIH0sXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJlc3VsdHMucHVzaCh7IHBhdGg6IGUucGF0aCwgc3VjY2VzczogdHJ1ZSB9KTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJlc3VsdHMucHVzaCh7XG4gICAgICAgICAgICAgICAgcGF0aDogZS5wYXRoLFxuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgIGVycm9yOiBlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVyciksXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IGZhaWxlZCA9IHJlc3VsdHMuZmlsdGVyKHIgPT4gIXIuc3VjY2Vzcyk7XG4gICAgY29uc3QgcmVzcG9uc2U6IFRvb2xSZXNwb25zZSA9IHtcbiAgICAgICAgc3VjY2VzczogZmFpbGVkLmxlbmd0aCA9PT0gMCxcbiAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgdXVpZCxcbiAgICAgICAgICAgIHRvdGFsOiByZXN1bHRzLmxlbmd0aCxcbiAgICAgICAgICAgIGZhaWxlZENvdW50OiBmYWlsZWQubGVuZ3RoLFxuICAgICAgICAgICAgcmVzdWx0cyxcbiAgICAgICAgfSxcbiAgICAgICAgbWVzc2FnZTogZmFpbGVkLmxlbmd0aCA9PT0gMFxuICAgICAgICAgICAgPyBgV3JvdGUgJHtyZXN1bHRzLmxlbmd0aH0gcHJvcGVydGllcyAoc2VxdWVudGlhbClgXG4gICAgICAgICAgICA6IGAke2ZhaWxlZC5sZW5ndGh9LyR7cmVzdWx0cy5sZW5ndGh9IHByb3BlcnR5IHdyaXRlcyBmYWlsZWRgLFxuICAgIH07XG4gICAgaWYgKG92ZXJsYXBzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgcmVzcG9uc2Uud2FybmluZyA9IGBPdmVybGFwcGluZyBwYXRoKHMpIGluIHRoaXMgYmF0Y2g6ICR7b3ZlcmxhcHMuam9pbignLCAnKX0uIFNlcXVlbnRpYWwgb3JkZXIgYXBwbGllZDsgbGF0ZXIgd3JpdGVzIG1heSBzaGFkb3cgZWFybGllciBvbmVzLmA7XG4gICAgfVxuICAgIHJldHVybiByZXNwb25zZTtcbn1cbiJdfQ==