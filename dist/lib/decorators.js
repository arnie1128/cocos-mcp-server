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
            title: opts.title,
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
        title: m.title,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVjb3JhdG9ycy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NvdXJjZS9saWIvZGVjb3JhdG9ycy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQW9DRzs7QUEyQkgsMEJBd0JDO0FBUUQsOERBaUJDO0FBekVELGlEQUFzRDtBQVd0RCxNQUFNLG1CQUFtQixHQUFHLE1BQU0sQ0FBQyxhQUFhLENBQUMsQ0FBQztBQVNsRDs7O0dBR0c7QUFDSCxTQUFnQixPQUFPLENBQUMsSUFBb0I7SUFDeEMsT0FBTyxVQUFVLE1BQVcsRUFBRSxXQUE0QixFQUFFLFVBQThCOztRQUN0RixJQUFJLENBQUMsVUFBVSxJQUFJLE9BQU8sVUFBVSxDQUFDLEtBQUssS0FBSyxVQUFVLEVBQUUsQ0FBQztZQUN4RCxNQUFNLElBQUksS0FBSyxDQUFDLDJDQUEyQyxNQUFNLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3ZGLENBQUM7UUFDRCwrREFBK0Q7UUFDL0QsNkRBQTZEO1FBQzdELGNBQWM7UUFDZCxNQUFNLElBQUksR0FBUSxNQUFNLENBQUMsV0FBVyxDQUFDO1FBQ3JDLElBQUksQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLG1CQUFtQixDQUFDLEVBQUUsQ0FBQztZQUNuRSw2REFBNkQ7WUFDN0QsdURBQXVEO1lBQ3ZELGdEQUFnRDtZQUNoRCxNQUFNLFNBQVMsR0FBd0IsTUFBQyxJQUFJLENBQUMsbUJBQW1CLENBQXFDLG1DQUFJLEVBQUUsQ0FBQztZQUM1RyxJQUFJLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLEdBQUcsU0FBUyxDQUFDLENBQUM7UUFDL0MsQ0FBQztRQUNBLElBQUksQ0FBQyxtQkFBbUIsQ0FBeUIsQ0FBQyxJQUFJLENBQUM7WUFDcEQsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJO1lBQ2YsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLO1lBQ2pCLFdBQVcsRUFBRSxJQUFJLENBQUMsV0FBVztZQUM3QixXQUFXLEVBQUUsSUFBSSxDQUFDLFdBQVc7WUFDN0IsU0FBUyxFQUFFLFdBQVc7U0FDekIsQ0FBQyxDQUFDO0lBQ1AsQ0FBQyxDQUFDO0FBQ04sQ0FBQztBQUVEOzs7OztHQUtHO0FBQ0gsU0FBZ0IseUJBQXlCLENBQUMsUUFBYTs7SUFDbkQsTUFBTSxJQUFJLEdBQUcsUUFBUSxDQUFDLFdBQVcsQ0FBQztJQUNsQyxNQUFNLEtBQUssR0FBd0IsTUFBQyxJQUFJLENBQUMsbUJBQW1CLENBQXFDLG1DQUFJLEVBQUUsQ0FBQztJQUN4RyxNQUFNLElBQUksR0FBYyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNwQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLElBQUk7UUFDWixLQUFLLEVBQUUsQ0FBQyxDQUFDLEtBQUs7UUFDZCxXQUFXLEVBQUUsQ0FBQyxDQUFDLFdBQVc7UUFDMUIsV0FBVyxFQUFFLENBQUMsQ0FBQyxXQUFXO1FBQzFCLE9BQU8sRUFBRSxLQUFLLEVBQUUsSUFBUyxFQUF5QixFQUFFO1lBQ2hELE1BQU0sRUFBRSxHQUFJLFFBQWdCLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQzFDLElBQUksT0FBTyxFQUFFLEtBQUssVUFBVSxFQUFFLENBQUM7Z0JBQzNCLE1BQU0sSUFBSSxLQUFLLENBQUMscUJBQXFCLE1BQU0sQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLHVCQUF1QixDQUFDLENBQUM7WUFDckYsQ0FBQztZQUNELE9BQU8sRUFBRSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDbkMsQ0FBQztLQUNKLENBQUMsQ0FBQyxDQUFDO0lBQ0osT0FBTyxJQUFBLDBCQUFXLEVBQUMsSUFBSSxDQUFDLENBQUM7QUFDN0IsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQG1jcFRvb2wg4oCUIGNsYXNzLW1ldGhvZCBkZWNvcmF0b3IgdGhhdCByZWdpc3RlcnMgYSB0b29sIHdpdGggdGhlXG4gKiBkZWZpbmVUb29scy1jb21wYXRpYmxlIHJlZ2lzdHJ5IHdpdGhvdXQgYHJlZmxlY3QtbWV0YWRhdGFgLlxuICpcbiAqIFVzYWdlOlxuICpcbiAqICAgY2xhc3MgSW5zcGVjdG9yVG9vbHMgaW1wbGVtZW50cyBUb29sRXhlY3V0b3Ige1xuICogICAgICAgcHJpdmF0ZSByZWFkb25seSBleGVjID0gZGVmaW5lVG9vbHNGcm9tRGVjb3JhdG9ycyh0aGlzKTtcbiAqICAgICAgIGdldFRvb2xzKCkgeyByZXR1cm4gdGhpcy5leGVjLmdldFRvb2xzKCk7IH1cbiAqICAgICAgIGV4ZWN1dGUobiwgYSkgeyByZXR1cm4gdGhpcy5leGVjLmV4ZWN1dGUobiwgYSk7IH1cbiAqXG4gKiAgICAgICBAbWNwVG9vbCh7XG4gKiAgICAgICAgICAgbmFtZTogJ2luc3BlY3Rvcl9nZXRfaW5zdGFuY2VfZGVmaW5pdGlvbicsXG4gKiAgICAgICAgICAgZGVzY3JpcHRpb246ICdHZW5lcmF0ZSBUeXBlU2NyaXB0IGNsYXNzIGRlZmluaXRpb24gLi4uJyxcbiAqICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3QoeyByZWZlcmVuY2U6IGluc3RhbmNlUmVmZXJlbmNlU2NoZW1hIH0pLFxuICogICAgICAgfSlcbiAqICAgICAgIGFzeW5jIGdldEluc3RhbmNlRGVmaW5pdGlvbihhcmdzOiB7IHJlZmVyZW5jZTogSW5zdGFuY2VSZWZlcmVuY2UgfSkge1xuICogICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IHsgdHNEZWZpbml0aW9uOiAnLi4uJyB9IH07XG4gKiAgICAgICB9XG4gKiAgIH1cbiAqXG4gKiBJbXBsZW1lbnRhdGlvbiBub3RlczpcbiAqIC0gU3RvcmVzIG1ldGFkYXRhIG9uIHRoZSAqY29uc3RydWN0b3IqIChub3QgdGhlIHByb3RvdHlwZSkga2V5ZWQgYnlcbiAqICAgYSBTeW1ib2wgc28gZGlmZmVyZW50IGNsYXNzZXMgZG9uJ3QgY29sbGlkZSBhbmQgaW5oZXJpdGFuY2Ugd2Fsa3NcbiAqICAgdGhlIHByb3RvdHlwZSBjaGFpbiBuYXR1cmFsbHkuXG4gKiAtIENhcHR1cmVzIHRoZSBtZXRob2QgdGhyb3VnaCBgZGVzY3JpcHRvci52YWx1ZWAgYXQgZGVjb3JhdGlvbiB0aW1lLlxuICogICBUaGlzIGlzIHRoZSBzYW1lIHRyaWNrIGNvY29zLWNvZGUtbW9kZSBgQHV0Y3BUb29sYCB1c2VzOyBub1xuICogICBgcmVmbGVjdC1tZXRhZGF0YWAgcG9seWZpbGwgaXMgbmVlZGVkIChUUzUrIHN1cHBvcnRzIHN0YWdlLTJcbiAqICAgZGVjb3JhdG9ycyB3aGVuIGBleHBlcmltZW50YWxEZWNvcmF0b3JzYCBpcyBvbiwgd2hpY2ggb3VyXG4gKiAgIHRzY29uZmlnIGhhcyBzZXQpLlxuICogLSBgZGVmaW5lVG9vbHNGcm9tRGVjb3JhdG9ycyhpbnN0YW5jZSlgIGluc3RhbnRpYXRlcyBoYW5kbGVycyB3aXRoXG4gKiAgIGB0aGlzYCBib3VuZCB0byB0aGUgbGl2ZSBpbnN0YW5jZSBzbyB0aGUgb3JpZ2luYWwgYHRoaXMuZm9vKClgXG4gKiAgIHNlbWFudGljcyBpbnNpZGUgZGVjb3JhdGVkIG1ldGhvZHMgY29udGludWUgdG8gd29yay5cbiAqXG4gKiBSZWZlcmVuY2U6IGNvY29zLWNvZGUtbW9kZSAoUm9tYVJvZ292KSAvXG4gKiBkb2NzL3Jlc2VhcmNoL3JlcG9zL2NvY29zLWNvZGUtbW9kZS5tZCDCpzMgKFwiQHV0Y3BUb29sIGRlY29yYXRvclwiKS5cbiAqL1xuXG5pbXBvcnQgeyB6IH0gZnJvbSAnLi9zY2hlbWEnO1xuaW1wb3J0IHsgVG9vbERlZiwgZGVmaW5lVG9vbHMgfSBmcm9tICcuL2RlZmluZS10b29scyc7XG5pbXBvcnQgdHlwZSB7IFRvb2xFeGVjdXRvciwgVG9vbFJlc3BvbnNlIH0gZnJvbSAnLi4vdHlwZXMnO1xuXG5pbnRlcmZhY2UgRGVjb3JhdGVkVG9vbE1ldGEge1xuICAgIG5hbWU6IHN0cmluZztcbiAgICB0aXRsZT86IHN0cmluZztcbiAgICBkZXNjcmlwdGlvbjogc3RyaW5nO1xuICAgIGlucHV0U2NoZW1hOiB6LlpvZFR5cGVBbnk7XG4gICAgbWV0aG9kS2V5OiBzdHJpbmcgfCBzeW1ib2w7XG59XG5cbmNvbnN0IERFQ09SQVRFRF9UT09MU19LRVkgPSBTeW1ib2woJ21jcFRvb2xEZWZzJyk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWNwVG9vbE9wdGlvbnMge1xuICAgIG5hbWU6IHN0cmluZztcbiAgICB0aXRsZT86IHN0cmluZztcbiAgICBkZXNjcmlwdGlvbjogc3RyaW5nO1xuICAgIGlucHV0U2NoZW1hOiB6LlpvZFR5cGVBbnk7XG59XG5cbi8qKlxuICogRGVjb3JhdGUgYSBjbGFzcyBtZXRob2QgYXMgYW4gTUNQIHRvb2wuIFN0YWdlLTIgZGVjb3JhdG9yIHNpZ25hdHVyZVxuICogKG1hdGNoaW5nIHRoZSBwcm9qZWN0J3MgYGV4cGVyaW1lbnRhbERlY29yYXRvcnM6IHRydWVgIHRzY29uZmlnKS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG1jcFRvb2wob3B0czogTWNwVG9vbE9wdGlvbnMpOiBNZXRob2REZWNvcmF0b3Ige1xuICAgIHJldHVybiBmdW5jdGlvbiAodGFyZ2V0OiBhbnksIHByb3BlcnR5S2V5OiBzdHJpbmcgfCBzeW1ib2wsIGRlc2NyaXB0b3I6IFByb3BlcnR5RGVzY3JpcHRvcik6IHZvaWQge1xuICAgICAgICBpZiAoIWRlc2NyaXB0b3IgfHwgdHlwZW9mIGRlc2NyaXB0b3IudmFsdWUgIT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgQG1jcFRvb2wgY2FuIG9ubHkgZGVjb3JhdGUgbWV0aG9kcyAoZ290ICR7U3RyaW5nKHByb3BlcnR5S2V5KX0pYCk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gYHRhcmdldGAgaXMgdGhlIHByb3RvdHlwZSBmb3IgaW5zdGFuY2UgbWV0aG9kczsgdGhlIG1ldGFkYXRhXG4gICAgICAgIC8vIGlzIGF0dGFjaGVkIHRvIHRoZSBjb25zdHJ1Y3RvciBzbyBzdWJjbGFzc2VzIGRvbid0IHBvbGx1dGVcbiAgICAgICAgLy8gZWFjaCBvdGhlci5cbiAgICAgICAgY29uc3QgY3RvcjogYW55ID0gdGFyZ2V0LmNvbnN0cnVjdG9yO1xuICAgICAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChjdG9yLCBERUNPUkFURURfVE9PTFNfS0VZKSkge1xuICAgICAgICAgICAgLy8gSW5oZXJpdCBmcm9tIHBhcmVudCBjbGFzcyBjaGFpbiBieSBjb3B5aW5nIHBhcmVudCBtZXRhZGF0YVxuICAgICAgICAgICAgLy8gZmlyc3QsIHRoZW4gYXBwZW5kaW5nLiBUaGlzIGxldHMgYSBzdWJjbGFzcyBleHRlbmQgYVxuICAgICAgICAgICAgLy8gZGVjb3JhdGVkIGJhc2Ugd2l0aG91dCBsb3NpbmcgdGhlIGJhc2UgdG9vbHMuXG4gICAgICAgICAgICBjb25zdCBpbmhlcml0ZWQ6IERlY29yYXRlZFRvb2xNZXRhW10gPSAoY3RvcltERUNPUkFURURfVE9PTFNfS0VZXSBhcyBEZWNvcmF0ZWRUb29sTWV0YVtdIHwgdW5kZWZpbmVkKSA/PyBbXTtcbiAgICAgICAgICAgIGN0b3JbREVDT1JBVEVEX1RPT0xTX0tFWV0gPSBbLi4uaW5oZXJpdGVkXTtcbiAgICAgICAgfVxuICAgICAgICAoY3RvcltERUNPUkFURURfVE9PTFNfS0VZXSBhcyBEZWNvcmF0ZWRUb29sTWV0YVtdKS5wdXNoKHtcbiAgICAgICAgICAgIG5hbWU6IG9wdHMubmFtZSxcbiAgICAgICAgICAgIHRpdGxlOiBvcHRzLnRpdGxlLFxuICAgICAgICAgICAgZGVzY3JpcHRpb246IG9wdHMuZGVzY3JpcHRpb24sXG4gICAgICAgICAgICBpbnB1dFNjaGVtYTogb3B0cy5pbnB1dFNjaGVtYSxcbiAgICAgICAgICAgIG1ldGhvZEtleTogcHJvcGVydHlLZXksXG4gICAgICAgIH0pO1xuICAgIH07XG59XG5cbi8qKlxuICogQnVpbGQgYSBkZWZpbmVUb29scy1jb21wYXRpYmxlIFRvb2xFeGVjdXRvciBmb3IgYW4gaW5zdGFuY2Ugd2hvc2VcbiAqIG1ldGhvZHMgd2VyZSBkZWNvcmF0ZWQgd2l0aCBgQG1jcFRvb2xgLiBQYXNzIGB0aGlzYCBmcm9tIGluc2lkZVxuICogdGhlIGNvbnN0cnVjdG9yIHNvIHRoZSByZXR1cm5lZCBleGVjdXRvcidzIGhhbmRsZXJzIGNsb3NlIG92ZXJcbiAqIHRoZSBsaXZlIGluc3RhbmNlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZGVmaW5lVG9vbHNGcm9tRGVjb3JhdG9ycyhpbnN0YW5jZTogYW55KTogVG9vbEV4ZWN1dG9yIHtcbiAgICBjb25zdCBjdG9yID0gaW5zdGFuY2UuY29uc3RydWN0b3I7XG4gICAgY29uc3QgbWV0YXM6IERlY29yYXRlZFRvb2xNZXRhW10gPSAoY3RvcltERUNPUkFURURfVE9PTFNfS0VZXSBhcyBEZWNvcmF0ZWRUb29sTWV0YVtdIHwgdW5kZWZpbmVkKSA/PyBbXTtcbiAgICBjb25zdCBkZWZzOiBUb29sRGVmW10gPSBtZXRhcy5tYXAobSA9PiAoe1xuICAgICAgICBuYW1lOiBtLm5hbWUsXG4gICAgICAgIHRpdGxlOiBtLnRpdGxlLFxuICAgICAgICBkZXNjcmlwdGlvbjogbS5kZXNjcmlwdGlvbixcbiAgICAgICAgaW5wdXRTY2hlbWE6IG0uaW5wdXRTY2hlbWEsXG4gICAgICAgIGhhbmRsZXI6IGFzeW5jIChhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4gPT4ge1xuICAgICAgICAgICAgY29uc3QgZm4gPSAoaW5zdGFuY2UgYXMgYW55KVttLm1ldGhvZEtleV07XG4gICAgICAgICAgICBpZiAodHlwZW9mIGZuICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBAbWNwVG9vbDogbWV0aG9kICcke1N0cmluZyhtLm1ldGhvZEtleSl9JyBtaXNzaW5nIG9uIGluc3RhbmNlYCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gZm4uY2FsbChpbnN0YW5jZSwgYXJncyk7XG4gICAgICAgIH0sXG4gICAgfSkpO1xuICAgIHJldHVybiBkZWZpbmVUb29scyhkZWZzKTtcbn1cbiJdfQ==