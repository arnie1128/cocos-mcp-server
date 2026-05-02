import type { ToolResponse } from '../types';

/** Build a success ToolResponse. */
export function ok(data?: unknown, message?: string): ToolResponse {
    const r: ToolResponse = { success: true };
    if (data !== undefined) r.data = data;
    if (message !== undefined) r.message = message;
    return r;
}

/** Build a failure ToolResponse. */
export function fail(error: string, data?: unknown): ToolResponse {
    const r: ToolResponse = { success: false, error };
    if (data !== undefined) r.data = data;
    return r;
}
