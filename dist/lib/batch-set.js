"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.batchSetProperties = batchSetProperties;
/**
 * Run set-property in parallel for every entry. Returns a ToolResponse
 * whose `success` is true only if all entries succeeded; partial results
 * are always available in `data.results` so callers can inspect which
 * entries failed.
 */
async function batchSetProperties(uuid, entries) {
    if (!Array.isArray(entries) || entries.length === 0) {
        return { success: false, error: 'batch-set: entries[] must be a non-empty array' };
    }
    const settled = await Promise.allSettled(entries.map(e => Editor.Message.request('scene', 'set-property', {
        uuid,
        path: e.path,
        dump: { value: e.value },
    })));
    const results = settled.map((s, i) => {
        var _a, _b;
        if (s.status === 'fulfilled') {
            return { path: entries[i].path, success: true };
        }
        return {
            path: entries[i].path,
            success: false,
            error: (_b = (_a = s.reason) === null || _a === void 0 ? void 0 : _a.message) !== null && _b !== void 0 ? _b : String(s.reason),
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmF0Y2gtc2V0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL2xpYi9iYXRjaC1zZXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7Ozs7Ozs7Ozs7O0dBZ0JHOztBQXVCSCxnREEwQ0M7QUFoREQ7Ozs7O0dBS0c7QUFDSSxLQUFLLFVBQVUsa0JBQWtCLENBQ3BDLElBQVksRUFDWixPQUF3QjtJQUV4QixJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsSUFBSSxPQUFPLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO1FBQ2xELE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxnREFBZ0QsRUFBRSxDQUFDO0lBQ3ZGLENBQUM7SUFFRCxNQUFNLE9BQU8sR0FBRyxNQUFNLE9BQU8sQ0FBQyxVQUFVLENBQ3BDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FDWixNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsY0FBYyxFQUFFO1FBQzVDLElBQUk7UUFDSixJQUFJLEVBQUUsQ0FBQyxDQUFDLElBQUk7UUFDWixJQUFJLEVBQUUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDLEtBQUssRUFBRTtLQUMzQixDQUFDLENBQ0wsQ0FDSixDQUFDO0lBRUYsTUFBTSxPQUFPLEdBQXFCLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUU7O1FBQ25ELElBQUksQ0FBQyxDQUFDLE1BQU0sS0FBSyxXQUFXLEVBQUUsQ0FBQztZQUMzQixPQUFPLEVBQUUsSUFBSSxFQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxDQUFDO1FBQ3BELENBQUM7UUFDRCxPQUFPO1lBQ0gsSUFBSSxFQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJO1lBQ3JCLE9BQU8sRUFBRSxLQUFLO1lBQ2QsS0FBSyxFQUFFLE1BQUEsTUFBQSxDQUFDLENBQUMsTUFBTSwwQ0FBRSxPQUFPLG1DQUFJLE1BQU0sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDO1NBQy9DLENBQUM7SUFDTixDQUFDLENBQUMsQ0FBQztJQUVILE1BQU0sTUFBTSxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUMvQyxPQUFPO1FBQ0gsT0FBTyxFQUFFLE1BQU0sQ0FBQyxNQUFNLEtBQUssQ0FBQztRQUM1QixJQUFJLEVBQUU7WUFDRixJQUFJO1lBQ0osS0FBSyxFQUFFLE9BQU8sQ0FBQyxNQUFNO1lBQ3JCLFdBQVcsRUFBRSxNQUFNLENBQUMsTUFBTTtZQUMxQixPQUFPO1NBQ1Y7UUFDRCxPQUFPLEVBQUUsTUFBTSxDQUFDLE1BQU0sS0FBSyxDQUFDO1lBQ3hCLENBQUMsQ0FBQyxTQUFTLE9BQU8sQ0FBQyxNQUFNLGFBQWE7WUFDdEMsQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDLE1BQU0sSUFBSSxPQUFPLENBQUMsTUFBTSx5QkFBeUI7S0FDcEUsQ0FBQztBQUNOLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIGJhdGNoLXNldCDigJQgd3JpdGUgbXVsdGlwbGUgcHJvcGVydGllcyBpbiBvbmUgcm91bmQtdHJpcC5cbiAqXG4gKiBSZXBsYWNlcyBOIHNlcXVlbnRpYWwgYHNldC1wcm9wZXJ0eWAgSVBDIGNhbGxzIHdpdGggYSBwYXJhbGxlbGlzZWQgYmF0Y2guXG4gKiBFYWNoIGVudHJ5IGlzIGB7cGF0aCwgdmFsdWV9YCByb290ZWQgYXQgdGhlIHNhbWUgbm9kZSB1dWlkOyB0aGUgYmF0Y2hcbiAqIGlzc3VlcyBgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnc2V0LXByb3BlcnR5JywgLi4uKWAgZm9yIGV2ZXJ5XG4gKiBlbnRyeSBjb25jdXJyZW50bHkgYW5kIHdhaXRzIGZvciBhbGwgdG8gZmluaXNoLlxuICpcbiAqIEZhaWx1cmUgc2VtYW50aWNzOiBwZXItZW50cnkuIFRoZSByZXN1bHQgcmVwb3J0cyBlYWNoIGVudHJ5J3NcbiAqIHN1Y2Nlc3MvZXJyb3Igc28gdGhlIGNhbGxlciBjYW4gc2VlIHBhcnRpYWwgZmFpbHVyZXMgcmF0aGVyIHRoYW4gb25lXG4gKiBvcGFxdWUgXCJiYXRjaCBmYWlsZWRcIiBtZXNzYWdlLiBgc3VjY2Vzc2AgYXQgdGhlIHRvcCBsZXZlbCBpcyB0cnVlIG9ubHlcbiAqIGlmIGV2ZXJ5IGVudHJ5IHN1Y2NlZWRlZC5cbiAqXG4gKiBSZWZlcmVuY2U6IGNvY29zLWNyZWF0b3ItbWNwIChoYXJhZHkpIGJhdGNoIHByb3BlcnR5IHdyaXRlXG4gKiAoYHByb3BlcnRpZXM6IFt7cHJvcGVydHksIHZhbHVlfV1gIGFycmF5IG1vZGUpLiBTZWVcbiAqIGRvY3MvcmVzZWFyY2gvcmVwb3MvY29jb3MtY3JlYXRvci1tY3AubWQgwqczLlxuICovXG5cbmltcG9ydCB0eXBlIHsgVG9vbFJlc3BvbnNlIH0gZnJvbSAnLi4vdHlwZXMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIEJhdGNoU2V0RW50cnkge1xuICAgIC8qKiBQcm9wZXJ0eSBwYXRoIHBhc3NlZCBhcyBgcGF0aGAgdG8gc2NlbmUvc2V0LXByb3BlcnR5IChlLmcuIGBwb3NpdGlvbmAsIGBfX2NvbXBzX18uMC5lbmFibGVkYCkuICovXG4gICAgcGF0aDogc3RyaW5nO1xuICAgIC8qKiBWYWx1ZSBwYXNzZWQgdW5kZXIgYGR1bXAudmFsdWVgLiBTaGFwZSBtdXN0IG1hdGNoIHRoZSBwcm9wZXJ0eSdzIENvY29zIGR1bXAgc2hhcGUuICovXG4gICAgdmFsdWU6IGFueTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBCYXRjaFNldFJlc3VsdCB7XG4gICAgcGF0aDogc3RyaW5nO1xuICAgIHN1Y2Nlc3M6IGJvb2xlYW47XG4gICAgZXJyb3I/OiBzdHJpbmc7XG59XG5cbi8qKlxuICogUnVuIHNldC1wcm9wZXJ0eSBpbiBwYXJhbGxlbCBmb3IgZXZlcnkgZW50cnkuIFJldHVybnMgYSBUb29sUmVzcG9uc2VcbiAqIHdob3NlIGBzdWNjZXNzYCBpcyB0cnVlIG9ubHkgaWYgYWxsIGVudHJpZXMgc3VjY2VlZGVkOyBwYXJ0aWFsIHJlc3VsdHNcbiAqIGFyZSBhbHdheXMgYXZhaWxhYmxlIGluIGBkYXRhLnJlc3VsdHNgIHNvIGNhbGxlcnMgY2FuIGluc3BlY3Qgd2hpY2hcbiAqIGVudHJpZXMgZmFpbGVkLlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gYmF0Y2hTZXRQcm9wZXJ0aWVzKFxuICAgIHV1aWQ6IHN0cmluZyxcbiAgICBlbnRyaWVzOiBCYXRjaFNldEVudHJ5W10sXG4pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgIGlmICghQXJyYXkuaXNBcnJheShlbnRyaWVzKSB8fCBlbnRyaWVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdiYXRjaC1zZXQ6IGVudHJpZXNbXSBtdXN0IGJlIGEgbm9uLWVtcHR5IGFycmF5JyB9O1xuICAgIH1cblxuICAgIGNvbnN0IHNldHRsZWQgPSBhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQoXG4gICAgICAgIGVudHJpZXMubWFwKGUgPT5cbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3NldC1wcm9wZXJ0eScsIHtcbiAgICAgICAgICAgICAgICB1dWlkLFxuICAgICAgICAgICAgICAgIHBhdGg6IGUucGF0aCxcbiAgICAgICAgICAgICAgICBkdW1wOiB7IHZhbHVlOiBlLnZhbHVlIH0sXG4gICAgICAgICAgICB9KVxuICAgICAgICApXG4gICAgKTtcblxuICAgIGNvbnN0IHJlc3VsdHM6IEJhdGNoU2V0UmVzdWx0W10gPSBzZXR0bGVkLm1hcCgocywgaSkgPT4ge1xuICAgICAgICBpZiAocy5zdGF0dXMgPT09ICdmdWxmaWxsZWQnKSB7XG4gICAgICAgICAgICByZXR1cm4geyBwYXRoOiBlbnRyaWVzW2ldLnBhdGgsIHN1Y2Nlc3M6IHRydWUgfTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgcGF0aDogZW50cmllc1tpXS5wYXRoLFxuICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICBlcnJvcjogcy5yZWFzb24/Lm1lc3NhZ2UgPz8gU3RyaW5nKHMucmVhc29uKSxcbiAgICAgICAgfTtcbiAgICB9KTtcblxuICAgIGNvbnN0IGZhaWxlZCA9IHJlc3VsdHMuZmlsdGVyKHIgPT4gIXIuc3VjY2Vzcyk7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgc3VjY2VzczogZmFpbGVkLmxlbmd0aCA9PT0gMCxcbiAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgdXVpZCxcbiAgICAgICAgICAgIHRvdGFsOiByZXN1bHRzLmxlbmd0aCxcbiAgICAgICAgICAgIGZhaWxlZENvdW50OiBmYWlsZWQubGVuZ3RoLFxuICAgICAgICAgICAgcmVzdWx0cyxcbiAgICAgICAgfSxcbiAgICAgICAgbWVzc2FnZTogZmFpbGVkLmxlbmd0aCA9PT0gMFxuICAgICAgICAgICAgPyBgV3JvdGUgJHtyZXN1bHRzLmxlbmd0aH0gcHJvcGVydGllc2BcbiAgICAgICAgICAgIDogYCR7ZmFpbGVkLmxlbmd0aH0vJHtyZXN1bHRzLmxlbmd0aH0gcHJvcGVydHkgd3JpdGVzIGZhaWxlZGAsXG4gICAgfTtcbn1cbiJdfQ==