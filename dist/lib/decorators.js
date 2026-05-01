"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.mcpTool = mcpTool;
exports.defineToolsFromDecorators = defineToolsFromDecorators;
const define_tools_1 = require("./define-tools");
const DECORATED_TOOLS_KEY = Symbol('mcpToolDefs');
/**
 * Decorate a class method as an MCP tool. Stage-2 decorator signature
 * (matching the project's `experimentalDecorators: true` tsconfig).
 */
function mcpTool(opts) {
    return function (target, propertyKey, descriptor) {
        var _a;
        if (!descriptor || typeof descriptor.value !== 'function') {
            throw new Error(`@mcpTool can only decorate methods (got ${String(propertyKey)})`);
        }
        // `target` is the prototype for instance methods; the metadata
        // is attached to the constructor so subclasses don't pollute
        // each other.
        const ctor = target.constructor;
        if (!Object.prototype.hasOwnProperty.call(ctor, DECORATED_TOOLS_KEY)) {
            // Inherit from parent class chain by copying parent metadata
            // first, then appending. This lets a subclass extend a
            // decorated base without losing the base tools.
            const inherited = (_a = ctor[DECORATED_TOOLS_KEY]) !== null && _a !== void 0 ? _a : [];
            ctor[DECORATED_TOOLS_KEY] = [...inherited];
        }
        ctor[DECORATED_TOOLS_KEY].push({
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
function defineToolsFromDecorators(instance) {
    var _a;
    const ctor = instance.constructor;
    const metas = (_a = ctor[DECORATED_TOOLS_KEY]) !== null && _a !== void 0 ? _a : [];
    const defs = metas.map(m => ({
        name: m.name,
        description: m.description,
        inputSchema: m.inputSchema,
        handler: async (args) => {
            const fn = instance[m.methodKey];
            if (typeof fn !== 'function') {
                throw new Error(`@mcpTool: method '${String(m.methodKey)}' missing on instance`);
            }
            return fn.call(instance, args);
        },
    }));
    return (0, define_tools_1.defineTools)(defs);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVjb3JhdG9ycy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NvdXJjZS9saWIvZGVjb3JhdG9ycy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQW9DRzs7QUF5QkgsMEJBdUJDO0FBUUQsOERBZ0JDO0FBckVELGlEQUFzRDtBQVV0RCxNQUFNLG1CQUFtQixHQUFHLE1BQU0sQ0FBQyxhQUFhLENBQUMsQ0FBQztBQVFsRDs7O0dBR0c7QUFDSCxTQUFnQixPQUFPLENBQUMsSUFBb0I7SUFDeEMsT0FBTyxVQUFVLE1BQVcsRUFBRSxXQUE0QixFQUFFLFVBQThCOztRQUN0RixJQUFJLENBQUMsVUFBVSxJQUFJLE9BQU8sVUFBVSxDQUFDLEtBQUssS0FBSyxVQUFVLEVBQUUsQ0FBQztZQUN4RCxNQUFNLElBQUksS0FBSyxDQUFDLDJDQUEyQyxNQUFNLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3ZGLENBQUM7UUFDRCwrREFBK0Q7UUFDL0QsNkRBQTZEO1FBQzdELGNBQWM7UUFDZCxNQUFNLElBQUksR0FBUSxNQUFNLENBQUMsV0FBVyxDQUFDO1FBQ3JDLElBQUksQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLG1CQUFtQixDQUFDLEVBQUUsQ0FBQztZQUNuRSw2REFBNkQ7WUFDN0QsdURBQXVEO1lBQ3ZELGdEQUFnRDtZQUNoRCxNQUFNLFNBQVMsR0FBd0IsTUFBQyxJQUFJLENBQUMsbUJBQW1CLENBQXFDLG1DQUFJLEVBQUUsQ0FBQztZQUM1RyxJQUFJLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLEdBQUcsU0FBUyxDQUFDLENBQUM7UUFDL0MsQ0FBQztRQUNBLElBQUksQ0FBQyxtQkFBbUIsQ0FBeUIsQ0FBQyxJQUFJLENBQUM7WUFDcEQsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJO1lBQ2YsV0FBVyxFQUFFLElBQUksQ0FBQyxXQUFXO1lBQzdCLFdBQVcsRUFBRSxJQUFJLENBQUMsV0FBVztZQUM3QixTQUFTLEVBQUUsV0FBVztTQUN6QixDQUFDLENBQUM7SUFDUCxDQUFDLENBQUM7QUFDTixDQUFDO0FBRUQ7Ozs7O0dBS0c7QUFDSCxTQUFnQix5QkFBeUIsQ0FBQyxRQUFhOztJQUNuRCxNQUFNLElBQUksR0FBRyxRQUFRLENBQUMsV0FBVyxDQUFDO0lBQ2xDLE1BQU0sS0FBSyxHQUF3QixNQUFDLElBQUksQ0FBQyxtQkFBbUIsQ0FBcUMsbUNBQUksRUFBRSxDQUFDO0lBQ3hHLE1BQU0sSUFBSSxHQUFjLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ3BDLElBQUksRUFBRSxDQUFDLENBQUMsSUFBSTtRQUNaLFdBQVcsRUFBRSxDQUFDLENBQUMsV0FBVztRQUMxQixXQUFXLEVBQUUsQ0FBQyxDQUFDLFdBQVc7UUFDMUIsT0FBTyxFQUFFLEtBQUssRUFBRSxJQUFTLEVBQXlCLEVBQUU7WUFDaEQsTUFBTSxFQUFFLEdBQUksUUFBZ0IsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDMUMsSUFBSSxPQUFPLEVBQUUsS0FBSyxVQUFVLEVBQUUsQ0FBQztnQkFDM0IsTUFBTSxJQUFJLEtBQUssQ0FBQyxxQkFBcUIsTUFBTSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsdUJBQXVCLENBQUMsQ0FBQztZQUNyRixDQUFDO1lBQ0QsT0FBTyxFQUFFLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNuQyxDQUFDO0tBQ0osQ0FBQyxDQUFDLENBQUM7SUFDSixPQUFPLElBQUEsMEJBQVcsRUFBQyxJQUFJLENBQUMsQ0FBQztBQUM3QixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAbWNwVG9vbCDigJQgY2xhc3MtbWV0aG9kIGRlY29yYXRvciB0aGF0IHJlZ2lzdGVycyBhIHRvb2wgd2l0aCB0aGVcbiAqIGRlZmluZVRvb2xzLWNvbXBhdGlibGUgcmVnaXN0cnkgd2l0aG91dCBgcmVmbGVjdC1tZXRhZGF0YWAuXG4gKlxuICogVXNhZ2U6XG4gKlxuICogICBjbGFzcyBJbnNwZWN0b3JUb29scyBpbXBsZW1lbnRzIFRvb2xFeGVjdXRvciB7XG4gKiAgICAgICBwcml2YXRlIHJlYWRvbmx5IGV4ZWMgPSBkZWZpbmVUb29sc0Zyb21EZWNvcmF0b3JzKHRoaXMpO1xuICogICAgICAgZ2V0VG9vbHMoKSB7IHJldHVybiB0aGlzLmV4ZWMuZ2V0VG9vbHMoKTsgfVxuICogICAgICAgZXhlY3V0ZShuLCBhKSB7IHJldHVybiB0aGlzLmV4ZWMuZXhlY3V0ZShuLCBhKTsgfVxuICpcbiAqICAgICAgIEBtY3BUb29sKHtcbiAqICAgICAgICAgICBuYW1lOiAnaW5zcGVjdG9yX2dldF9pbnN0YW5jZV9kZWZpbml0aW9uJyxcbiAqICAgICAgICAgICBkZXNjcmlwdGlvbjogJ0dlbmVyYXRlIFR5cGVTY3JpcHQgY2xhc3MgZGVmaW5pdGlvbiAuLi4nLFxuICogICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7IHJlZmVyZW5jZTogaW5zdGFuY2VSZWZlcmVuY2VTY2hlbWEgfSksXG4gKiAgICAgICB9KVxuICogICAgICAgYXN5bmMgZ2V0SW5zdGFuY2VEZWZpbml0aW9uKGFyZ3M6IHsgcmVmZXJlbmNlOiBJbnN0YW5jZVJlZmVyZW5jZSB9KSB7XG4gKiAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogeyB0c0RlZmluaXRpb246ICcuLi4nIH0gfTtcbiAqICAgICAgIH1cbiAqICAgfVxuICpcbiAqIEltcGxlbWVudGF0aW9uIG5vdGVzOlxuICogLSBTdG9yZXMgbWV0YWRhdGEgb24gdGhlICpjb25zdHJ1Y3RvciogKG5vdCB0aGUgcHJvdG90eXBlKSBrZXllZCBieVxuICogICBhIFN5bWJvbCBzbyBkaWZmZXJlbnQgY2xhc3NlcyBkb24ndCBjb2xsaWRlIGFuZCBpbmhlcml0YW5jZSB3YWxrc1xuICogICB0aGUgcHJvdG90eXBlIGNoYWluIG5hdHVyYWxseS5cbiAqIC0gQ2FwdHVyZXMgdGhlIG1ldGhvZCB0aHJvdWdoIGBkZXNjcmlwdG9yLnZhbHVlYCBhdCBkZWNvcmF0aW9uIHRpbWUuXG4gKiAgIFRoaXMgaXMgdGhlIHNhbWUgdHJpY2sgY29jb3MtY29kZS1tb2RlIGBAdXRjcFRvb2xgIHVzZXM7IG5vXG4gKiAgIGByZWZsZWN0LW1ldGFkYXRhYCBwb2x5ZmlsbCBpcyBuZWVkZWQgKFRTNSsgc3VwcG9ydHMgc3RhZ2UtMlxuICogICBkZWNvcmF0b3JzIHdoZW4gYGV4cGVyaW1lbnRhbERlY29yYXRvcnNgIGlzIG9uLCB3aGljaCBvdXJcbiAqICAgdHNjb25maWcgaGFzIHNldCkuXG4gKiAtIGBkZWZpbmVUb29sc0Zyb21EZWNvcmF0b3JzKGluc3RhbmNlKWAgaW5zdGFudGlhdGVzIGhhbmRsZXJzIHdpdGhcbiAqICAgYHRoaXNgIGJvdW5kIHRvIHRoZSBsaXZlIGluc3RhbmNlIHNvIHRoZSBvcmlnaW5hbCBgdGhpcy5mb28oKWBcbiAqICAgc2VtYW50aWNzIGluc2lkZSBkZWNvcmF0ZWQgbWV0aG9kcyBjb250aW51ZSB0byB3b3JrLlxuICpcbiAqIFJlZmVyZW5jZTogY29jb3MtY29kZS1tb2RlIChSb21hUm9nb3YpIC9cbiAqIGRvY3MvcmVzZWFyY2gvcmVwb3MvY29jb3MtY29kZS1tb2RlLm1kIMKnMyAoXCJAdXRjcFRvb2wgZGVjb3JhdG9yXCIpLlxuICovXG5cbmltcG9ydCB7IHogfSBmcm9tICcuL3NjaGVtYSc7XG5pbXBvcnQgeyBUb29sRGVmLCBkZWZpbmVUb29scyB9IGZyb20gJy4vZGVmaW5lLXRvb2xzJztcbmltcG9ydCB0eXBlIHsgVG9vbEV4ZWN1dG9yLCBUb29sUmVzcG9uc2UgfSBmcm9tICcuLi90eXBlcyc7XG5cbmludGVyZmFjZSBEZWNvcmF0ZWRUb29sTWV0YSB7XG4gICAgbmFtZTogc3RyaW5nO1xuICAgIGRlc2NyaXB0aW9uOiBzdHJpbmc7XG4gICAgaW5wdXRTY2hlbWE6IHouWm9kVHlwZUFueTtcbiAgICBtZXRob2RLZXk6IHN0cmluZyB8IHN5bWJvbDtcbn1cblxuY29uc3QgREVDT1JBVEVEX1RPT0xTX0tFWSA9IFN5bWJvbCgnbWNwVG9vbERlZnMnKTtcblxuZXhwb3J0IGludGVyZmFjZSBNY3BUb29sT3B0aW9ucyB7XG4gICAgbmFtZTogc3RyaW5nO1xuICAgIGRlc2NyaXB0aW9uOiBzdHJpbmc7XG4gICAgaW5wdXRTY2hlbWE6IHouWm9kVHlwZUFueTtcbn1cblxuLyoqXG4gKiBEZWNvcmF0ZSBhIGNsYXNzIG1ldGhvZCBhcyBhbiBNQ1AgdG9vbC4gU3RhZ2UtMiBkZWNvcmF0b3Igc2lnbmF0dXJlXG4gKiAobWF0Y2hpbmcgdGhlIHByb2plY3QncyBgZXhwZXJpbWVudGFsRGVjb3JhdG9yczogdHJ1ZWAgdHNjb25maWcpLlxuICovXG5leHBvcnQgZnVuY3Rpb24gbWNwVG9vbChvcHRzOiBNY3BUb29sT3B0aW9ucyk6IE1ldGhvZERlY29yYXRvciB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uICh0YXJnZXQ6IGFueSwgcHJvcGVydHlLZXk6IHN0cmluZyB8IHN5bWJvbCwgZGVzY3JpcHRvcjogUHJvcGVydHlEZXNjcmlwdG9yKTogdm9pZCB7XG4gICAgICAgIGlmICghZGVzY3JpcHRvciB8fCB0eXBlb2YgZGVzY3JpcHRvci52YWx1ZSAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBAbWNwVG9vbCBjYW4gb25seSBkZWNvcmF0ZSBtZXRob2RzIChnb3QgJHtTdHJpbmcocHJvcGVydHlLZXkpfSlgKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBgdGFyZ2V0YCBpcyB0aGUgcHJvdG90eXBlIGZvciBpbnN0YW5jZSBtZXRob2RzOyB0aGUgbWV0YWRhdGFcbiAgICAgICAgLy8gaXMgYXR0YWNoZWQgdG8gdGhlIGNvbnN0cnVjdG9yIHNvIHN1YmNsYXNzZXMgZG9uJ3QgcG9sbHV0ZVxuICAgICAgICAvLyBlYWNoIG90aGVyLlxuICAgICAgICBjb25zdCBjdG9yOiBhbnkgPSB0YXJnZXQuY29uc3RydWN0b3I7XG4gICAgICAgIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGN0b3IsIERFQ09SQVRFRF9UT09MU19LRVkpKSB7XG4gICAgICAgICAgICAvLyBJbmhlcml0IGZyb20gcGFyZW50IGNsYXNzIGNoYWluIGJ5IGNvcHlpbmcgcGFyZW50IG1ldGFkYXRhXG4gICAgICAgICAgICAvLyBmaXJzdCwgdGhlbiBhcHBlbmRpbmcuIFRoaXMgbGV0cyBhIHN1YmNsYXNzIGV4dGVuZCBhXG4gICAgICAgICAgICAvLyBkZWNvcmF0ZWQgYmFzZSB3aXRob3V0IGxvc2luZyB0aGUgYmFzZSB0b29scy5cbiAgICAgICAgICAgIGNvbnN0IGluaGVyaXRlZDogRGVjb3JhdGVkVG9vbE1ldGFbXSA9IChjdG9yW0RFQ09SQVRFRF9UT09MU19LRVldIGFzIERlY29yYXRlZFRvb2xNZXRhW10gfCB1bmRlZmluZWQpID8/IFtdO1xuICAgICAgICAgICAgY3RvcltERUNPUkFURURfVE9PTFNfS0VZXSA9IFsuLi5pbmhlcml0ZWRdO1xuICAgICAgICB9XG4gICAgICAgIChjdG9yW0RFQ09SQVRFRF9UT09MU19LRVldIGFzIERlY29yYXRlZFRvb2xNZXRhW10pLnB1c2goe1xuICAgICAgICAgICAgbmFtZTogb3B0cy5uYW1lLFxuICAgICAgICAgICAgZGVzY3JpcHRpb246IG9wdHMuZGVzY3JpcHRpb24sXG4gICAgICAgICAgICBpbnB1dFNjaGVtYTogb3B0cy5pbnB1dFNjaGVtYSxcbiAgICAgICAgICAgIG1ldGhvZEtleTogcHJvcGVydHlLZXksXG4gICAgICAgIH0pO1xuICAgIH07XG59XG5cbi8qKlxuICogQnVpbGQgYSBkZWZpbmVUb29scy1jb21wYXRpYmxlIFRvb2xFeGVjdXRvciBmb3IgYW4gaW5zdGFuY2Ugd2hvc2VcbiAqIG1ldGhvZHMgd2VyZSBkZWNvcmF0ZWQgd2l0aCBgQG1jcFRvb2xgLiBQYXNzIGB0aGlzYCBmcm9tIGluc2lkZVxuICogdGhlIGNvbnN0cnVjdG9yIHNvIHRoZSByZXR1cm5lZCBleGVjdXRvcidzIGhhbmRsZXJzIGNsb3NlIG92ZXJcbiAqIHRoZSBsaXZlIGluc3RhbmNlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZGVmaW5lVG9vbHNGcm9tRGVjb3JhdG9ycyhpbnN0YW5jZTogYW55KTogVG9vbEV4ZWN1dG9yIHtcbiAgICBjb25zdCBjdG9yID0gaW5zdGFuY2UuY29uc3RydWN0b3I7XG4gICAgY29uc3QgbWV0YXM6IERlY29yYXRlZFRvb2xNZXRhW10gPSAoY3RvcltERUNPUkFURURfVE9PTFNfS0VZXSBhcyBEZWNvcmF0ZWRUb29sTWV0YVtdIHwgdW5kZWZpbmVkKSA/PyBbXTtcbiAgICBjb25zdCBkZWZzOiBUb29sRGVmW10gPSBtZXRhcy5tYXAobSA9PiAoe1xuICAgICAgICBuYW1lOiBtLm5hbWUsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBtLmRlc2NyaXB0aW9uLFxuICAgICAgICBpbnB1dFNjaGVtYTogbS5pbnB1dFNjaGVtYSxcbiAgICAgICAgaGFuZGxlcjogYXN5bmMgKGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiA9PiB7XG4gICAgICAgICAgICBjb25zdCBmbiA9IChpbnN0YW5jZSBhcyBhbnkpW20ubWV0aG9kS2V5XTtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgZm4gIT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEBtY3BUb29sOiBtZXRob2QgJyR7U3RyaW5nKG0ubWV0aG9kS2V5KX0nIG1pc3Npbmcgb24gaW5zdGFuY2VgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBmbi5jYWxsKGluc3RhbmNlLCBhcmdzKTtcbiAgICAgICAgfSxcbiAgICB9KSk7XG4gICAgcmV0dXJuIGRlZmluZVRvb2xzKGRlZnMpO1xufVxuIl19