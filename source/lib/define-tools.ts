/**
 * defineTools — flatten a tool category into a single declarative array
 * `[{name, description, inputSchema, handler}, ...]` and wrap it as a
 * `ToolExecutor`.
 *
 * Replaces the v2.3.x three-layer pattern (separate `*Schemas` map,
 * `*ToolMeta` map, and a `class ... { execute() { switch ... } }`) which
 * forced contributors to keep three sites in sync per tool. With the
 * declarative form a new tool is a single object literal in one place.
 */

import { ToolDefinition, ToolResponse, ToolExecutor } from '../types';
import { z, toInputSchema, validateArgs } from './schema';

export interface ToolDef {
    /** Tool name (without category prefix). */
    name: string;
    /** Optional short human-readable title for docs / tool UIs. */
    title?: string;
    /** Tool description shown in tools/list. */
    description: string;
    /** Zod input schema. Validation runs before the handler. */
    inputSchema: z.ZodTypeAny;
    /**
     * Handler — receives validated args, returns a ToolResponse. Typed as
     * `any` because heterogeneous schemas in a single array can't carry
     * per-element zod inference; runtime safety is provided by validateArgs.
     * Use `defineTool({...})` if you want per-tool zod-inferred argument
     * types in the handler signature.
     */
    handler: (args: any) => Promise<ToolResponse>;
}

/**
 * Helper for declaring a single tool with full zod-inferred handler args.
 * Useful when defining tools outside an array literal where the inferred
 * `args` type would otherwise be lost.
 */
export function defineTool<S extends z.ZodTypeAny>(def: {
    name: string;
    title?: string;
    description: string;
    inputSchema: S;
    handler: (args: z.infer<S>) => Promise<ToolResponse>;
}): ToolDef {
    return def as unknown as ToolDef;
}

export function defineTools(defs: ReadonlyArray<ToolDef>): ToolExecutor {
    const byName = new Map<string, ToolDef>();
    for (const def of defs) {
        if (byName.has(def.name)) {
            throw new Error(`defineTools: duplicate tool name '${def.name}'`);
        }
        byName.set(def.name, def);
    }
    return {
        getTools(): ToolDefinition[] {
            return defs.map(d => ({
                name: d.name,
                description: d.description,
                annotations: d.title ? { title: d.title } : undefined,
                inputSchema: toInputSchema(d.inputSchema),
            }));
        },
        async execute(toolName: string, args: any): Promise<ToolResponse> {
            const def = byName.get(toolName);
            if (!def) {
                throw new Error(`Unknown tool: ${toolName}`);
            }
            const validation = validateArgs(def.inputSchema, args ?? {});
            if (!validation.ok) {
                return validation.response;
            }
            try {
                return await def.handler(validation.data);
            } catch (err: any) {
                return {
                    success: false,
                    error: err?.message ?? String(err),
                };
            }
        },
    };
}
