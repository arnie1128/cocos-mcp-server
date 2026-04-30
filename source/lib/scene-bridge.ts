/**
 * Helpers for invoking scene-script methods from the editor host process.
 *
 * `Editor.Message.request('scene', 'execute-scene-script', { name, method,
 * args })` is the only path through which extensions reach engine-level
 * APIs (instances of `cc.*`, the `cce.*` editor namespace). Centralising
 * the call site keeps the scene-script package name in one place and
 * lets the rest of the codebase call typed wrappers.
 */

import type { ToolResponse } from '../types';

const PACKAGE_NAME = 'cocos-mcp-server';

/**
 * Invoke a scene-script method by name. Returns the raw result the method
 * resolved with — usually a `{ success, data?, error? }` envelope already.
 */
export function runSceneMethod<T = unknown>(method: string, args: unknown[] = []): Promise<T> {
    return Editor.Message.request('scene', 'execute-scene-script', {
        name: PACKAGE_NAME,
        method,
        args,
    }) as Promise<T>;
}

/**
 * Same as `runSceneMethod`, but coerces both transport and method-level
 * failures into a `ToolResponse`. Use this when the caller is itself a
 * tool handler that returns a ToolResponse directly.
 */
export async function runSceneMethodAsToolResponse(
    method: string,
    args: unknown[] = [],
): Promise<ToolResponse> {
    try {
        const result = await runSceneMethod<ToolResponse | any>(method, args);
        if (result && typeof result === 'object' && 'success' in result) {
            return result as ToolResponse;
        }
        return { success: true, data: result };
    } catch (err: any) {
        return {
            success: false,
            error: `scene-script ${method} failed: ${err?.message ?? String(err)}`,
        };
    }
}
