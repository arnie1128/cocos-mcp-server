import { z } from 'zod';
import { ToolResponse } from '../types';

/**
 * Convert a zod schema into the JSON Schema shape that MCP `tools/list` expects.
 * Uses zod 4's built-in `z.toJSONSchema`, then post-processes to match the
 * hand-written schema style we still have in legacy tool files: drop
 * `$schema`, remove `additionalProperties: false` recursively, and pull
 * default-valued fields out of `required` (zod 4 keeps them in `required`
 * because defaults satisfy the constraint, but the legacy schemas mark them
 * optional — Claude treats `required` as "must pass" so we mirror that).
 */
export function toInputSchema(schema: z.ZodType<any>): any {
    const json: any = z.toJSONSchema(schema, { target: 'draft-7' });
    delete json.$schema;
    relaxJsonSchema(json);
    return json;
}

function relaxJsonSchema(node: any): void {
    if (!node || typeof node !== 'object') {
        return;
    }
    if (node.type === 'object') {
        delete node.additionalProperties;
        const properties = node.properties || {};
        if (Array.isArray(node.required)) {
            node.required = node.required.filter((key: string) => {
                const prop = properties[key];
                return !prop || !Object.prototype.hasOwnProperty.call(prop, 'default');
            });
            if (node.required.length === 0) {
                delete node.required;
            }
        }
        for (const key of Object.keys(properties)) {
            relaxJsonSchema(properties[key]);
        }
    } else if (node.type === 'array' && node.items) {
        relaxJsonSchema(node.items);
    }
}

/**
 * Validate tool arguments with a zod schema. On success returns parsed args
 * (with defaults applied); on failure returns a ToolResponse error so callers
 * can early-return without throwing. The data is typed as `any` because most
 * call sites use a union schema looked up by tool name — preserving precise
 * inference there would require per-call generic narrowing that TS cannot do.
 */
export function validateArgs(
    schema: z.ZodType<any>,
    args: unknown,
): { ok: true; data: any } | { ok: false; response: ToolResponse } {
    const parsed = schema.safeParse(args);
    if (parsed.success) {
        return { ok: true, data: parsed.data };
    }
    const issues = parsed.error.issues
        .map(i => `${i.path.join('.') || '<root>'}: ${i.message}`)
        .join('; ');
    return {
        ok: false,
        response: { success: false, error: `Invalid arguments: ${issues}` },
    };
}

export { z };
