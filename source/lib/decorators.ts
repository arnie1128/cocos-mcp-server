/**
 * @mcpTool — class-method decorator that registers a tool with the
 * defineTools-compatible registry without `reflect-metadata`.
 *
 * Usage:
 *
 *   class InspectorTools implements ToolExecutor {
 *       private readonly exec = defineToolsFromDecorators(this);
 *       getTools() { return this.exec.getTools(); }
 *       execute(n, a) { return this.exec.execute(n, a); }
 *
 *       @mcpTool({
 *           name: 'inspector_get_instance_definition',
 *           description: 'Generate TypeScript class definition ...',
 *           inputSchema: z.object({ reference: instanceReferenceSchema }),
 *       })
 *       async getInstanceDefinition(args: { reference: InstanceReference }) {
 *           return { success: true, data: { tsDefinition: '...' } };
 *       }
 *   }
 *
 * Implementation notes:
 * - Stores metadata on the *constructor* (not the prototype) keyed by
 *   a Symbol so different classes don't collide and inheritance walks
 *   the prototype chain naturally.
 * - Captures the method through `descriptor.value` at decoration time.
 *   This is the same trick cocos-code-mode `@utcpTool` uses; no
 *   `reflect-metadata` polyfill is needed (TS5+ supports stage-2
 *   decorators when `experimentalDecorators` is on, which our
 *   tsconfig has set).
 * - `defineToolsFromDecorators(instance)` instantiates handlers with
 *   `this` bound to the live instance so the original `this.foo()`
 *   semantics inside decorated methods continue to work.
 *
 * Reference: cocos-code-mode (RomaRogov) /
 * docs/research/repos/cocos-code-mode.md §3 ("@utcpTool decorator").
 */

import { z } from './schema';
import { ToolDef, defineTools } from './define-tools';
import type { ToolExecutor, ToolResponse } from '../types';

interface DecoratedToolMeta {
    name: string;
    description: string;
    inputSchema: z.ZodTypeAny;
    methodKey: string | symbol;
}

const DECORATED_TOOLS_KEY = Symbol('mcpToolDefs');

export interface McpToolOptions {
    name: string;
    description: string;
    inputSchema: z.ZodTypeAny;
}

/**
 * Decorate a class method as an MCP tool. Stage-2 decorator signature
 * (matching the project's `experimentalDecorators: true` tsconfig).
 */
export function mcpTool(opts: McpToolOptions): MethodDecorator {
    return function (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor): void {
        if (!descriptor || typeof descriptor.value !== 'function') {
            throw new Error(`@mcpTool can only decorate methods (got ${String(propertyKey)})`);
        }
        // `target` is the prototype for instance methods; the metadata
        // is attached to the constructor so subclasses don't pollute
        // each other.
        const ctor: any = target.constructor;
        if (!Object.prototype.hasOwnProperty.call(ctor, DECORATED_TOOLS_KEY)) {
            // Inherit from parent class chain by copying parent metadata
            // first, then appending. This lets a subclass extend a
            // decorated base without losing the base tools.
            const inherited: DecoratedToolMeta[] = (ctor[DECORATED_TOOLS_KEY] as DecoratedToolMeta[] | undefined) ?? [];
            ctor[DECORATED_TOOLS_KEY] = [...inherited];
        }
        (ctor[DECORATED_TOOLS_KEY] as DecoratedToolMeta[]).push({
            name: opts.name,
            description: opts.description,
            inputSchema: opts.inputSchema,
            methodKey: propertyKey,
        });
    };
}

/**
 * Build a defineTools-compatible ToolExecutor for an instance whose
 * methods were decorated with `@mcpTool`. Pass `this` from inside
 * the constructor so the returned executor's handlers close over
 * the live instance.
 */
export function defineToolsFromDecorators(instance: any): ToolExecutor {
    const ctor = instance.constructor;
    const metas: DecoratedToolMeta[] = (ctor[DECORATED_TOOLS_KEY] as DecoratedToolMeta[] | undefined) ?? [];
    const defs: ToolDef[] = metas.map(m => ({
        name: m.name,
        description: m.description,
        inputSchema: m.inputSchema,
        handler: async (args: any): Promise<ToolResponse> => {
            const fn = (instance as any)[m.methodKey];
            if (typeof fn !== 'function') {
                throw new Error(`@mcpTool: method '${String(m.methodKey)}' missing on instance`);
            }
            return fn.call(instance, args);
        },
    }));
    return defineTools(defs);
}
