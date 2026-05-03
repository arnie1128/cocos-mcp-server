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
export function findComponentIndexByType(comps: any[], type: string): number {
    return comps.findIndex(c => c?.__type__ === type || c?.cid === type || c?.type === type);
}
