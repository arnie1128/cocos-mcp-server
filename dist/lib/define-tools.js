"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.defineTool = defineTool;
exports.defineTools = defineTools;
const schema_1 = require("./schema");
/**
 * Helper for declaring a single tool with full zod-inferred handler args.
 * Useful when defining tools outside an array literal where the inferred
 * `args` type would otherwise be lost.
 */
function defineTool(def) {
    return def;
}
function defineTools(defs) {
    const byName = new Map();
    for (const def of defs) {
        if (byName.has(def.name)) {
            throw new Error(`defineTools: duplicate tool name '${def.name}'`);
        }
        byName.set(def.name, def);
    }
    return {
        getTools() {
            return defs.map(d => ({
                name: d.name,
                description: d.description,
                inputSchema: (0, schema_1.toInputSchema)(d.inputSchema),
            }));
        },
        async execute(toolName, args) {
            var _a;
            const def = byName.get(toolName);
            if (!def) {
                throw new Error(`Unknown tool: ${toolName}`);
            }
            const validation = (0, schema_1.validateArgs)(def.inputSchema, args !== null && args !== void 0 ? args : {});
            if (!validation.ok) {
                return validation.response;
            }
            try {
                return await def.handler(validation.data);
            }
            catch (err) {
                return {
                    success: false,
                    error: (_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : String(err),
                };
            }
        },
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVmaW5lLXRvb2xzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL2xpYi9kZWZpbmUtdG9vbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7Ozs7R0FTRzs7QUEyQkgsZ0NBT0M7QUFFRCxrQ0FtQ0M7QUFwRUQscUNBQTBEO0FBbUIxRDs7OztHQUlHO0FBQ0gsU0FBZ0IsVUFBVSxDQUF5QixHQUtsRDtJQUNHLE9BQU8sR0FBeUIsQ0FBQztBQUNyQyxDQUFDO0FBRUQsU0FBZ0IsV0FBVyxDQUFDLElBQTRCO0lBQ3BELE1BQU0sTUFBTSxHQUFHLElBQUksR0FBRyxFQUFtQixDQUFDO0lBQzFDLEtBQUssTUFBTSxHQUFHLElBQUksSUFBSSxFQUFFLENBQUM7UUFDckIsSUFBSSxNQUFNLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO1lBQ3ZCLE1BQU0sSUFBSSxLQUFLLENBQUMscUNBQXFDLEdBQUcsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxDQUFDO1FBQ3RFLENBQUM7UUFDRCxNQUFNLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDOUIsQ0FBQztJQUNELE9BQU87UUFDSCxRQUFRO1lBQ0osT0FBTyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDbEIsSUFBSSxFQUFFLENBQUMsQ0FBQyxJQUFJO2dCQUNaLFdBQVcsRUFBRSxDQUFDLENBQUMsV0FBVztnQkFDMUIsV0FBVyxFQUFFLElBQUEsc0JBQWEsRUFBQyxDQUFDLENBQUMsV0FBVyxDQUFDO2FBQzVDLENBQUMsQ0FBQyxDQUFDO1FBQ1IsQ0FBQztRQUNELEtBQUssQ0FBQyxPQUFPLENBQUMsUUFBZ0IsRUFBRSxJQUFTOztZQUNyQyxNQUFNLEdBQUcsR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQ2pDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztnQkFDUCxNQUFNLElBQUksS0FBSyxDQUFDLGlCQUFpQixRQUFRLEVBQUUsQ0FBQyxDQUFDO1lBQ2pELENBQUM7WUFDRCxNQUFNLFVBQVUsR0FBRyxJQUFBLHFCQUFZLEVBQUMsR0FBRyxDQUFDLFdBQVcsRUFBRSxJQUFJLGFBQUosSUFBSSxjQUFKLElBQUksR0FBSSxFQUFFLENBQUMsQ0FBQztZQUM3RCxJQUFJLENBQUMsVUFBVSxDQUFDLEVBQUUsRUFBRSxDQUFDO2dCQUNqQixPQUFPLFVBQVUsQ0FBQyxRQUFRLENBQUM7WUFDL0IsQ0FBQztZQUNELElBQUksQ0FBQztnQkFDRCxPQUFPLE1BQU0sR0FBRyxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDOUMsQ0FBQztZQUFDLE9BQU8sR0FBUSxFQUFFLENBQUM7Z0JBQ2hCLE9BQU87b0JBQ0gsT0FBTyxFQUFFLEtBQUs7b0JBQ2QsS0FBSyxFQUFFLE1BQUEsR0FBRyxhQUFILEdBQUcsdUJBQUgsR0FBRyxDQUFFLE9BQU8sbUNBQUksTUFBTSxDQUFDLEdBQUcsQ0FBQztpQkFDckMsQ0FBQztZQUNOLENBQUM7UUFDTCxDQUFDO0tBQ0osQ0FBQztBQUNOLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIGRlZmluZVRvb2xzIOKAlCBmbGF0dGVuIGEgdG9vbCBjYXRlZ29yeSBpbnRvIGEgc2luZ2xlIGRlY2xhcmF0aXZlIGFycmF5XG4gKiBgW3tuYW1lLCBkZXNjcmlwdGlvbiwgaW5wdXRTY2hlbWEsIGhhbmRsZXJ9LCAuLi5dYCBhbmQgd3JhcCBpdCBhcyBhXG4gKiBgVG9vbEV4ZWN1dG9yYC5cbiAqXG4gKiBSZXBsYWNlcyB0aGUgdjIuMy54IHRocmVlLWxheWVyIHBhdHRlcm4gKHNlcGFyYXRlIGAqU2NoZW1hc2AgbWFwLFxuICogYCpUb29sTWV0YWAgbWFwLCBhbmQgYSBgY2xhc3MgLi4uIHsgZXhlY3V0ZSgpIHsgc3dpdGNoIC4uLiB9IH1gKSB3aGljaFxuICogZm9yY2VkIGNvbnRyaWJ1dG9ycyB0byBrZWVwIHRocmVlIHNpdGVzIGluIHN5bmMgcGVyIHRvb2wuIFdpdGggdGhlXG4gKiBkZWNsYXJhdGl2ZSBmb3JtIGEgbmV3IHRvb2wgaXMgYSBzaW5nbGUgb2JqZWN0IGxpdGVyYWwgaW4gb25lIHBsYWNlLlxuICovXG5cbmltcG9ydCB7IFRvb2xEZWZpbml0aW9uLCBUb29sUmVzcG9uc2UsIFRvb2xFeGVjdXRvciB9IGZyb20gJy4uL3R5cGVzJztcbmltcG9ydCB7IHosIHRvSW5wdXRTY2hlbWEsIHZhbGlkYXRlQXJncyB9IGZyb20gJy4vc2NoZW1hJztcblxuZXhwb3J0IGludGVyZmFjZSBUb29sRGVmIHtcbiAgICAvKiogVG9vbCBuYW1lICh3aXRob3V0IGNhdGVnb3J5IHByZWZpeCkuICovXG4gICAgbmFtZTogc3RyaW5nO1xuICAgIC8qKiBUb29sIGRlc2NyaXB0aW9uIHNob3duIGluIHRvb2xzL2xpc3QuICovXG4gICAgZGVzY3JpcHRpb246IHN0cmluZztcbiAgICAvKiogWm9kIGlucHV0IHNjaGVtYS4gVmFsaWRhdGlvbiBydW5zIGJlZm9yZSB0aGUgaGFuZGxlci4gKi9cbiAgICBpbnB1dFNjaGVtYTogei5ab2RUeXBlQW55O1xuICAgIC8qKlxuICAgICAqIEhhbmRsZXIg4oCUIHJlY2VpdmVzIHZhbGlkYXRlZCBhcmdzLCByZXR1cm5zIGEgVG9vbFJlc3BvbnNlLiBUeXBlZCBhc1xuICAgICAqIGBhbnlgIGJlY2F1c2UgaGV0ZXJvZ2VuZW91cyBzY2hlbWFzIGluIGEgc2luZ2xlIGFycmF5IGNhbid0IGNhcnJ5XG4gICAgICogcGVyLWVsZW1lbnQgem9kIGluZmVyZW5jZTsgcnVudGltZSBzYWZldHkgaXMgcHJvdmlkZWQgYnkgdmFsaWRhdGVBcmdzLlxuICAgICAqIFVzZSBgZGVmaW5lVG9vbCh7Li4ufSlgIGlmIHlvdSB3YW50IHBlci10b29sIHpvZC1pbmZlcnJlZCBhcmd1bWVudFxuICAgICAqIHR5cGVzIGluIHRoZSBoYW5kbGVyIHNpZ25hdHVyZS5cbiAgICAgKi9cbiAgICBoYW5kbGVyOiAoYXJnczogYW55KSA9PiBQcm9taXNlPFRvb2xSZXNwb25zZT47XG59XG5cbi8qKlxuICogSGVscGVyIGZvciBkZWNsYXJpbmcgYSBzaW5nbGUgdG9vbCB3aXRoIGZ1bGwgem9kLWluZmVycmVkIGhhbmRsZXIgYXJncy5cbiAqIFVzZWZ1bCB3aGVuIGRlZmluaW5nIHRvb2xzIG91dHNpZGUgYW4gYXJyYXkgbGl0ZXJhbCB3aGVyZSB0aGUgaW5mZXJyZWRcbiAqIGBhcmdzYCB0eXBlIHdvdWxkIG90aGVyd2lzZSBiZSBsb3N0LlxuICovXG5leHBvcnQgZnVuY3Rpb24gZGVmaW5lVG9vbDxTIGV4dGVuZHMgei5ab2RUeXBlQW55PihkZWY6IHtcbiAgICBuYW1lOiBzdHJpbmc7XG4gICAgZGVzY3JpcHRpb246IHN0cmluZztcbiAgICBpbnB1dFNjaGVtYTogUztcbiAgICBoYW5kbGVyOiAoYXJnczogei5pbmZlcjxTPikgPT4gUHJvbWlzZTxUb29sUmVzcG9uc2U+O1xufSk6IFRvb2xEZWYge1xuICAgIHJldHVybiBkZWYgYXMgdW5rbm93biBhcyBUb29sRGVmO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVmaW5lVG9vbHMoZGVmczogUmVhZG9ubHlBcnJheTxUb29sRGVmPik6IFRvb2xFeGVjdXRvciB7XG4gICAgY29uc3QgYnlOYW1lID0gbmV3IE1hcDxzdHJpbmcsIFRvb2xEZWY+KCk7XG4gICAgZm9yIChjb25zdCBkZWYgb2YgZGVmcykge1xuICAgICAgICBpZiAoYnlOYW1lLmhhcyhkZWYubmFtZSkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgZGVmaW5lVG9vbHM6IGR1cGxpY2F0ZSB0b29sIG5hbWUgJyR7ZGVmLm5hbWV9J2ApO1xuICAgICAgICB9XG4gICAgICAgIGJ5TmFtZS5zZXQoZGVmLm5hbWUsIGRlZik7XG4gICAgfVxuICAgIHJldHVybiB7XG4gICAgICAgIGdldFRvb2xzKCk6IFRvb2xEZWZpbml0aW9uW10ge1xuICAgICAgICAgICAgcmV0dXJuIGRlZnMubWFwKGQgPT4gKHtcbiAgICAgICAgICAgICAgICBuYW1lOiBkLm5hbWUsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246IGQuZGVzY3JpcHRpb24sXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHRvSW5wdXRTY2hlbWEoZC5pbnB1dFNjaGVtYSksXG4gICAgICAgICAgICB9KSk7XG4gICAgICAgIH0sXG4gICAgICAgIGFzeW5jIGV4ZWN1dGUodG9vbE5hbWU6IHN0cmluZywgYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgICAgIGNvbnN0IGRlZiA9IGJ5TmFtZS5nZXQodG9vbE5hbWUpO1xuICAgICAgICAgICAgaWYgKCFkZWYpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gdG9vbDogJHt0b29sTmFtZX1gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHZhbGlkYXRpb24gPSB2YWxpZGF0ZUFyZ3MoZGVmLmlucHV0U2NoZW1hLCBhcmdzID8/IHt9KTtcbiAgICAgICAgICAgIGlmICghdmFsaWRhdGlvbi5vaykge1xuICAgICAgICAgICAgICAgIHJldHVybiB2YWxpZGF0aW9uLnJlc3BvbnNlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gYXdhaXQgZGVmLmhhbmRsZXIodmFsaWRhdGlvbi5kYXRhKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIGVycm9yOiBlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVyciksXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICB9O1xufVxuIl19