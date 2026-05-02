/**
 * Helpers for invoking scene-script methods from the editor host process.
 *
 * `Editor.Message.request('scene', 'execute-scene-script', { name, method,
 * args })` is the only path through which extensions reach engine-level
 * APIs (instances of `cc.*`, the `cce.*` editor namespace). Centralising
 * the call site keeps the scene-script package name in one place and
 * lets the rest of the codebase call typed wrappers.
 */

import type { CapturedLogEntry, ToolResponse } from '../types';
import { isSceneLogCaptureEnabled } from './runtime-flags';

const PACKAGE_NAME = 'cocos-mcp-server';

export interface RunSceneMethodOptions {
    /**
     * v2.4.8 A3: when true (default), the call is routed through the
     * scene-side `runWithCapture` wrapper which monkey-patches
     * console.{log,warn,error} and returns capturedLogs. Pass `false`
     * to invoke the bare method (no extra envelope, no logs).
     *
     * The runtime flag `isSceneLogCaptureEnabled()` is the global gate;
     * even if `capture: true` is passed here, capture only happens when
     * the flag is also enabled.
     */
    capture?: boolean;
}

function dispatch<T>(name: string, method: string, args: unknown[]): Promise<T> {
    return Editor.Message.request('scene', 'execute-scene-script', {
        name,
        method,
        args,
    }) as Promise<T>;
}

/**
 * Invoke a scene-script method by name. Returns the raw result the method
 * resolved with — usually a `{ success, data?, error? }` envelope already.
 *
 * When scene log capture is enabled (default) and `opts.capture !== false`,
 * the call is wrapped through `runWithCapture` so the result envelope
 * carries `capturedLogs`. Existing callers don't need to change anything.
 */
export function runSceneMethod<T = unknown>(
    method: string,
    args: unknown[] = [],
    opts: RunSceneMethodOptions = {},
): Promise<T> {
    const wantCapture = (opts.capture ?? true) && isSceneLogCaptureEnabled();
    if (wantCapture) {
        return dispatch<T>(PACKAGE_NAME, 'runWithCapture', [method, args]);
    }
    return dispatch<T>(PACKAGE_NAME, method, args);
}

/**
 * Same as `runSceneMethod`, but coerces both transport and method-level
 * failures into a `ToolResponse`. Use this when the caller is itself a
 * tool handler that returns a ToolResponse directly.
 *
 * Note on capturedLogs: when scene log capture is on, the underlying
 * scene method's return envelope carries `capturedLogs` directly. We
 * copy that field onto the resulting ToolResponse so AI clients see
 * the cocos console output for this operation. The transport-level
 * catch path attaches an empty `capturedLogs` array to keep the field
 * shape stable — never `undefined` when capture is enabled.
 */
export async function runSceneMethodAsToolResponse(
    method: string,
    args: unknown[] = [],
    opts: RunSceneMethodOptions = {},
): Promise<ToolResponse> {
    const captureActive = (opts.capture ?? true) && isSceneLogCaptureEnabled();
    try {
        const result = await runSceneMethod<ToolResponse | any>(method, args, opts);
        if (result && typeof result === 'object' && 'success' in result) {
            const envelope = result as ToolResponse & { capturedLogs?: CapturedLogEntry[] };
            if (captureActive && envelope.capturedLogs === undefined) {
                envelope.capturedLogs = [];
            }
            return envelope;
        }
        return {
            success: true,
            data: result,
            ...(captureActive ? { capturedLogs: [] } : {}),
        };
    } catch (err: any) {
        return {
            success: false,
            error: `scene-script ${method} failed: ${err?.message ?? String(err)}`,
            ...(captureActive ? { capturedLogs: [] } : {}),
        };
    }
}
