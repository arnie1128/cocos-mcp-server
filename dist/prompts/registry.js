"use strict";
/**
 * MCP prompts registry — T-V25-4 (T-P3-2).
 *
 * 4 templates ported from FunplayAI funplay-cocos-mcp/lib/prompts.js
 * style. Each prompt:
 *   - bakes project name + path into the rendered text so AI sees
 *     concrete context, not placeholders.
 *   - guides the model toward `execute_javascript` (the v2.3.0
 *     primary tool) for compound operations and only falls back
 *     to specialist tools when they're clearly the better primitive
 *     (TypeScript diagnostics, screenshots, structured resource reads).
 *
 * Why prompts at all when we have rich tool descriptions:
 *   Common multi-step intents ("fix script errors", "validate this
 *   scene") would otherwise require AI to re-derive the workflow
 *   each turn. A single `prompts/get` returns the workflow plus
 *   project context in one shot. Claude Desktop surfaces these as
 *   slash-commands; other clients can fetch them ad-hoc.
 *
 * Templates have **no arguments** by design — they're fully baked.
 * If we add parameter-driven prompts later we'll extend the
 * `arguments` field and add per-template argument schemas.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PromptRegistry = void 0;
exports.createPromptRegistry = createPromptRegistry;
const PROMPT_DEFS = [
    {
        name: 'fix_script_errors',
        listDescription: 'Diagnose and fix TypeScript errors in the project. Default to execute_javascript; switch to specialist tools (run_script_diagnostics, get_script_diagnostic_context, screenshot) only when they are clearly the better primitive.',
        body: 'In `core` mode, assume `execute_javascript` is the default first tool. Start with `context="editor"` for diagnosis, local file edits, asset-db workflows, and orchestration; switch to `context="scene"` only when runtime or scene state must be inspected directly.\n\n' +
            'Only use specialist tools when they are strictly better primitives:\n' +
            '- `debug_run_script_diagnostics` + `debug_get_script_diagnostic_context` for TypeScript errors (after `debug_wait_compile`)\n' +
            '- `resources/read cocos://docs/landmines` for landmine context when a tool surprises you\n' +
            '- `debug_screenshot` for visual verification after UI/scene fixes\n\n' +
            'Avoid hopping across many narrow tools when one `execute_javascript` call can inspect, decide, and act. Patch the smallest safe regions, refresh assets via the file-editor tools (which auto-trigger asset-db refresh), and verify the project returns to a healthy state with a final `debug_run_script_diagnostics`.',
    },
    {
        name: 'create_playable_prototype',
        listDescription: 'Build a small playable prototype in the project. Default to execute_javascript; reach for specialist tools only for asset lookup, scene opening, or visual proof.',
        body: 'In `core` mode, treat `execute_javascript` as the primary tool for almost the entire workflow. Use `context="scene"` for node, component, UI, animation, and runtime orchestration; use `context="editor"` only when editor-side automation, file work, or asset-db access is required.\n\n' +
            'Reach for specialist tools only when they provide a clearly better primitive:\n' +
            '- `scene_open_scene` to load a target scene\n' +
            '- `project_get_assets` (or `resources/read cocos://assets{?type,folder}`) for exact asset identification\n' +
            '- `animation_*` tools when wiring `cc.Animation` clips + playOnLoad\n' +
            '- `debug_screenshot` / `debug_batch_screenshot` for visual proof\n\n' +
            'Build the prototype in a few high-leverage `execute_javascript` steps instead of many tiny tool calls, then verify with runtime state and screenshots.',
    },
    {
        name: 'scene_validation',
        listDescription: 'Validate the active scene\'s integrity (hierarchy, components, references). Default to execute_javascript; switch to specialist tools only for screenshots, structured reads, or diagnostics.',
        body: 'In `core` mode, start with `execute_javascript`, usually with `context="scene"`, and keep it as the main tool unless a specialist tool is clearly superior. Use it to inspect hierarchy, nodes, components, prefab instances, cameras, animations, and runtime state in one place.\n\n' +
            'Specialist tools worth using:\n' +
            '- `validation_validate_scene` for the curated health checks\n' +
            '- `resources/read cocos://scene/hierarchy` for a structured snapshot\n' +
            '- `inspector_get_instance_definition` to understand a node/component\'s property surface before mutating\n' +
            '- `debug_screenshot` for visual confirmation\n\n' +
            'Prefer a small number of high-signal validation steps over broad tool hopping. Report findings as actionable items: missing references, broken prefab links, hierarchy anomalies.',
    },
    {
        name: 'auto_wire_scene',
        listDescription: 'Auto-wire missing references / event handlers / Animation clips on the active scene. Default to execute_javascript; switch to specialist tools only for asset lookup, scene opening, diagnostics, or screenshots.',
        body: 'In `core` mode, begin with `execute_javascript` and assume it will handle nearly all inspection and repair. Use `context="scene"` for hierarchy, node, component, and UI wiring repair; use `context="editor"` only when file edits, asset-db access, or editor-side orchestration is required.\n\n' +
            'Workflow:\n' +
            '1. `inspector_get_instance_definition` on each target node so you know its property shape before writing.\n' +
            '2. `execute_javascript` to scan for missing references, scattered children, or unbound event handlers.\n' +
            '3. `set_component_property` / `node_set_node_properties` / `component_add_event_handler` to repair (these are the precise primitives — prefer over execute_javascript for property writes that need set-property channel propagation, see Landmine #11).\n' +
            '4. `animation_set_clip` if a cc.Animation\'s defaultClip / playOnLoad needs wiring.\n' +
            '5. `debug_screenshot` for visual proof.\n\n' +
            'Inspect the target structure, identify missing references or expected children, and repair them with the smallest safe change rather than scattering work across many narrow tools.',
    },
];
class PromptRegistry {
    constructor(getContext) {
        this.getContext = getContext;
    }
    list() {
        return PROMPT_DEFS.map(def => ({
            name: def.name,
            description: def.listDescription,
            arguments: [],
        }));
    }
    /**
     * Returns rendered prompt content, or `null` when the name is unknown.
     * Caller (mcp-server-sdk.ts) maps `null` to a JSON-RPC error so MCP
     * clients see a proper `-32602 Invalid params` instead of a successful
     * "Prompt not found" body that masquerades as real prompt text.
     * (v2.5.1 round-1 review fix: codex 🔴 + claude 🟡.)
     */
    get(name) {
        const def = PROMPT_DEFS.find(d => d.name === name);
        if (!def)
            return null;
        const ctx = this.getContext();
        const header = `Target Cocos project: ${ctx.projectName}\n` +
            `Project path: ${ctx.projectPath}\n\n`;
        const fullText = header + def.body;
        return {
            description: fullText,
            messages: [{ role: 'user', content: { type: 'text', text: fullText } }],
        };
    }
    /** Names of currently registered templates — used by the not-found error. */
    knownNames() {
        return PROMPT_DEFS.map(d => d.name);
    }
}
exports.PromptRegistry = PromptRegistry;
function createPromptRegistry(getContext) {
    return new PromptRegistry(getContext);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVnaXN0cnkuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvcHJvbXB0cy9yZWdpc3RyeS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FzQkc7OztBQTBISCxvREFFQztBQS9GRCxNQUFNLFdBQVcsR0FBZ0I7SUFDN0I7UUFDSSxJQUFJLEVBQUUsbUJBQW1CO1FBQ3pCLGVBQWUsRUFBRSxtT0FBbU87UUFDcFAsSUFBSSxFQUNBLDJRQUEyUTtZQUMzUSx1RUFBdUU7WUFDdkUsK0hBQStIO1lBQy9ILDRGQUE0RjtZQUM1Rix1RUFBdUU7WUFDdkUseVRBQXlUO0tBQ2hVO0lBQ0Q7UUFDSSxJQUFJLEVBQUUsMkJBQTJCO1FBQ2pDLGVBQWUsRUFBRSxtS0FBbUs7UUFDcEwsSUFBSSxFQUNBLDZSQUE2UjtZQUM3UixpRkFBaUY7WUFDakYsK0NBQStDO1lBQy9DLDRHQUE0RztZQUM1Ryx1RUFBdUU7WUFDdkUsc0VBQXNFO1lBQ3RFLHdKQUF3SjtLQUMvSjtJQUNEO1FBQ0ksSUFBSSxFQUFFLGtCQUFrQjtRQUN4QixlQUFlLEVBQUUsK0xBQStMO1FBQ2hOLElBQUksRUFDQSx3UkFBd1I7WUFDeFIsaUNBQWlDO1lBQ2pDLCtEQUErRDtZQUMvRCx3RUFBd0U7WUFDeEUsNEdBQTRHO1lBQzVHLGtEQUFrRDtZQUNsRCxtTEFBbUw7S0FDMUw7SUFDRDtRQUNJLElBQUksRUFBRSxpQkFBaUI7UUFDdkIsZUFBZSxFQUFFLG1OQUFtTjtRQUNwTyxJQUFJLEVBQ0EscVNBQXFTO1lBQ3JTLGFBQWE7WUFDYiw2R0FBNkc7WUFDN0csMEdBQTBHO1lBQzFHLDRQQUE0UDtZQUM1UCx1RkFBdUY7WUFDdkYsNkNBQTZDO1lBQzdDLHFMQUFxTDtLQUM1TDtDQUNKLENBQUM7QUFFRixNQUFhLGNBQWM7SUFHdkIsWUFBWSxVQUFnQztRQUN4QyxJQUFJLENBQUMsVUFBVSxHQUFHLFVBQVUsQ0FBQztJQUNqQyxDQUFDO0lBRUQsSUFBSTtRQUNBLE9BQU8sV0FBVyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDM0IsSUFBSSxFQUFFLEdBQUcsQ0FBQyxJQUFJO1lBQ2QsV0FBVyxFQUFFLEdBQUcsQ0FBQyxlQUFlO1lBQ2hDLFNBQVMsRUFBRSxFQUFFO1NBQ2hCLENBQUMsQ0FBQyxDQUFDO0lBQ1IsQ0FBQztJQUVEOzs7Ozs7T0FNRztJQUNILEdBQUcsQ0FBQyxJQUFZO1FBQ1osTUFBTSxHQUFHLEdBQUcsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssSUFBSSxDQUFDLENBQUM7UUFDbkQsSUFBSSxDQUFDLEdBQUc7WUFBRSxPQUFPLElBQUksQ0FBQztRQUN0QixNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7UUFDOUIsTUFBTSxNQUFNLEdBQ1IseUJBQXlCLEdBQUcsQ0FBQyxXQUFXLElBQUk7WUFDNUMsaUJBQWlCLEdBQUcsQ0FBQyxXQUFXLE1BQU0sQ0FBQztRQUMzQyxNQUFNLFFBQVEsR0FBRyxNQUFNLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQztRQUNuQyxPQUFPO1lBQ0gsV0FBVyxFQUFFLFFBQVE7WUFDckIsUUFBUSxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLE9BQU8sRUFBRSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxFQUFFLENBQUM7U0FDMUUsQ0FBQztJQUNOLENBQUM7SUFFRCw2RUFBNkU7SUFDN0UsVUFBVTtRQUNOLE9BQU8sV0FBVyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUN4QyxDQUFDO0NBQ0o7QUF4Q0Qsd0NBd0NDO0FBRUQsU0FBZ0Isb0JBQW9CLENBQUMsVUFBZ0M7SUFDakUsT0FBTyxJQUFJLGNBQWMsQ0FBQyxVQUFVLENBQUMsQ0FBQztBQUMxQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBNQ1AgcHJvbXB0cyByZWdpc3RyeSDigJQgVC1WMjUtNCAoVC1QMy0yKS5cbiAqXG4gKiA0IHRlbXBsYXRlcyBwb3J0ZWQgZnJvbSBGdW5wbGF5QUkgZnVucGxheS1jb2Nvcy1tY3AvbGliL3Byb21wdHMuanNcbiAqIHN0eWxlLiBFYWNoIHByb21wdDpcbiAqICAgLSBiYWtlcyBwcm9qZWN0IG5hbWUgKyBwYXRoIGludG8gdGhlIHJlbmRlcmVkIHRleHQgc28gQUkgc2Vlc1xuICogICAgIGNvbmNyZXRlIGNvbnRleHQsIG5vdCBwbGFjZWhvbGRlcnMuXG4gKiAgIC0gZ3VpZGVzIHRoZSBtb2RlbCB0b3dhcmQgYGV4ZWN1dGVfamF2YXNjcmlwdGAgKHRoZSB2Mi4zLjBcbiAqICAgICBwcmltYXJ5IHRvb2wpIGZvciBjb21wb3VuZCBvcGVyYXRpb25zIGFuZCBvbmx5IGZhbGxzIGJhY2tcbiAqICAgICB0byBzcGVjaWFsaXN0IHRvb2xzIHdoZW4gdGhleSdyZSBjbGVhcmx5IHRoZSBiZXR0ZXIgcHJpbWl0aXZlXG4gKiAgICAgKFR5cGVTY3JpcHQgZGlhZ25vc3RpY3MsIHNjcmVlbnNob3RzLCBzdHJ1Y3R1cmVkIHJlc291cmNlIHJlYWRzKS5cbiAqXG4gKiBXaHkgcHJvbXB0cyBhdCBhbGwgd2hlbiB3ZSBoYXZlIHJpY2ggdG9vbCBkZXNjcmlwdGlvbnM6XG4gKiAgIENvbW1vbiBtdWx0aS1zdGVwIGludGVudHMgKFwiZml4IHNjcmlwdCBlcnJvcnNcIiwgXCJ2YWxpZGF0ZSB0aGlzXG4gKiAgIHNjZW5lXCIpIHdvdWxkIG90aGVyd2lzZSByZXF1aXJlIEFJIHRvIHJlLWRlcml2ZSB0aGUgd29ya2Zsb3dcbiAqICAgZWFjaCB0dXJuLiBBIHNpbmdsZSBgcHJvbXB0cy9nZXRgIHJldHVybnMgdGhlIHdvcmtmbG93IHBsdXNcbiAqICAgcHJvamVjdCBjb250ZXh0IGluIG9uZSBzaG90LiBDbGF1ZGUgRGVza3RvcCBzdXJmYWNlcyB0aGVzZSBhc1xuICogICBzbGFzaC1jb21tYW5kczsgb3RoZXIgY2xpZW50cyBjYW4gZmV0Y2ggdGhlbSBhZC1ob2MuXG4gKlxuICogVGVtcGxhdGVzIGhhdmUgKipubyBhcmd1bWVudHMqKiBieSBkZXNpZ24g4oCUIHRoZXkncmUgZnVsbHkgYmFrZWQuXG4gKiBJZiB3ZSBhZGQgcGFyYW1ldGVyLWRyaXZlbiBwcm9tcHRzIGxhdGVyIHdlJ2xsIGV4dGVuZCB0aGVcbiAqIGBhcmd1bWVudHNgIGZpZWxkIGFuZCBhZGQgcGVyLXRlbXBsYXRlIGFyZ3VtZW50IHNjaGVtYXMuXG4gKi9cblxuZXhwb3J0IGludGVyZmFjZSBQcm9tcHREZXNjcmlwdG9yIHtcbiAgICBuYW1lOiBzdHJpbmc7XG4gICAgZGVzY3JpcHRpb246IHN0cmluZztcbiAgICBhcmd1bWVudHM6IEFycmF5PHsgbmFtZTogc3RyaW5nOyBkZXNjcmlwdGlvbjogc3RyaW5nOyByZXF1aXJlZD86IGJvb2xlYW4gfT47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJvbXB0TWVzc2FnZSB7XG4gICAgcm9sZTogJ3VzZXInIHwgJ2Fzc2lzdGFudCc7XG4gICAgY29udGVudDogeyB0eXBlOiAndGV4dCc7IHRleHQ6IHN0cmluZyB9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByb21wdENvbnRlbnQge1xuICAgIGRlc2NyaXB0aW9uOiBzdHJpbmc7XG4gICAgbWVzc2FnZXM6IFByb21wdE1lc3NhZ2VbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQcm9qZWN0Q29udGV4dCB7XG4gICAgcHJvamVjdE5hbWU6IHN0cmluZztcbiAgICBwcm9qZWN0UGF0aDogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgUHJvbXB0RGVmIHtcbiAgICBuYW1lOiBzdHJpbmc7XG4gICAgbGlzdERlc2NyaXB0aW9uOiBzdHJpbmc7XG4gICAgYm9keTogc3RyaW5nO1xufVxuXG5jb25zdCBQUk9NUFRfREVGUzogUHJvbXB0RGVmW10gPSBbXG4gICAge1xuICAgICAgICBuYW1lOiAnZml4X3NjcmlwdF9lcnJvcnMnLFxuICAgICAgICBsaXN0RGVzY3JpcHRpb246ICdEaWFnbm9zZSBhbmQgZml4IFR5cGVTY3JpcHQgZXJyb3JzIGluIHRoZSBwcm9qZWN0LiBEZWZhdWx0IHRvIGV4ZWN1dGVfamF2YXNjcmlwdDsgc3dpdGNoIHRvIHNwZWNpYWxpc3QgdG9vbHMgKHJ1bl9zY3JpcHRfZGlhZ25vc3RpY3MsIGdldF9zY3JpcHRfZGlhZ25vc3RpY19jb250ZXh0LCBzY3JlZW5zaG90KSBvbmx5IHdoZW4gdGhleSBhcmUgY2xlYXJseSB0aGUgYmV0dGVyIHByaW1pdGl2ZS4nLFxuICAgICAgICBib2R5OlxuICAgICAgICAgICAgJ0luIGBjb3JlYCBtb2RlLCBhc3N1bWUgYGV4ZWN1dGVfamF2YXNjcmlwdGAgaXMgdGhlIGRlZmF1bHQgZmlyc3QgdG9vbC4gU3RhcnQgd2l0aCBgY29udGV4dD1cImVkaXRvclwiYCBmb3IgZGlhZ25vc2lzLCBsb2NhbCBmaWxlIGVkaXRzLCBhc3NldC1kYiB3b3JrZmxvd3MsIGFuZCBvcmNoZXN0cmF0aW9uOyBzd2l0Y2ggdG8gYGNvbnRleHQ9XCJzY2VuZVwiYCBvbmx5IHdoZW4gcnVudGltZSBvciBzY2VuZSBzdGF0ZSBtdXN0IGJlIGluc3BlY3RlZCBkaXJlY3RseS5cXG5cXG4nICtcbiAgICAgICAgICAgICdPbmx5IHVzZSBzcGVjaWFsaXN0IHRvb2xzIHdoZW4gdGhleSBhcmUgc3RyaWN0bHkgYmV0dGVyIHByaW1pdGl2ZXM6XFxuJyArXG4gICAgICAgICAgICAnLSBgZGVidWdfcnVuX3NjcmlwdF9kaWFnbm9zdGljc2AgKyBgZGVidWdfZ2V0X3NjcmlwdF9kaWFnbm9zdGljX2NvbnRleHRgIGZvciBUeXBlU2NyaXB0IGVycm9ycyAoYWZ0ZXIgYGRlYnVnX3dhaXRfY29tcGlsZWApXFxuJyArXG4gICAgICAgICAgICAnLSBgcmVzb3VyY2VzL3JlYWQgY29jb3M6Ly9kb2NzL2xhbmRtaW5lc2AgZm9yIGxhbmRtaW5lIGNvbnRleHQgd2hlbiBhIHRvb2wgc3VycHJpc2VzIHlvdVxcbicgK1xuICAgICAgICAgICAgJy0gYGRlYnVnX3NjcmVlbnNob3RgIGZvciB2aXN1YWwgdmVyaWZpY2F0aW9uIGFmdGVyIFVJL3NjZW5lIGZpeGVzXFxuXFxuJyArXG4gICAgICAgICAgICAnQXZvaWQgaG9wcGluZyBhY3Jvc3MgbWFueSBuYXJyb3cgdG9vbHMgd2hlbiBvbmUgYGV4ZWN1dGVfamF2YXNjcmlwdGAgY2FsbCBjYW4gaW5zcGVjdCwgZGVjaWRlLCBhbmQgYWN0LiBQYXRjaCB0aGUgc21hbGxlc3Qgc2FmZSByZWdpb25zLCByZWZyZXNoIGFzc2V0cyB2aWEgdGhlIGZpbGUtZWRpdG9yIHRvb2xzICh3aGljaCBhdXRvLXRyaWdnZXIgYXNzZXQtZGIgcmVmcmVzaCksIGFuZCB2ZXJpZnkgdGhlIHByb2plY3QgcmV0dXJucyB0byBhIGhlYWx0aHkgc3RhdGUgd2l0aCBhIGZpbmFsIGBkZWJ1Z19ydW5fc2NyaXB0X2RpYWdub3N0aWNzYC4nLFxuICAgIH0sXG4gICAge1xuICAgICAgICBuYW1lOiAnY3JlYXRlX3BsYXlhYmxlX3Byb3RvdHlwZScsXG4gICAgICAgIGxpc3REZXNjcmlwdGlvbjogJ0J1aWxkIGEgc21hbGwgcGxheWFibGUgcHJvdG90eXBlIGluIHRoZSBwcm9qZWN0LiBEZWZhdWx0IHRvIGV4ZWN1dGVfamF2YXNjcmlwdDsgcmVhY2ggZm9yIHNwZWNpYWxpc3QgdG9vbHMgb25seSBmb3IgYXNzZXQgbG9va3VwLCBzY2VuZSBvcGVuaW5nLCBvciB2aXN1YWwgcHJvb2YuJyxcbiAgICAgICAgYm9keTpcbiAgICAgICAgICAgICdJbiBgY29yZWAgbW9kZSwgdHJlYXQgYGV4ZWN1dGVfamF2YXNjcmlwdGAgYXMgdGhlIHByaW1hcnkgdG9vbCBmb3IgYWxtb3N0IHRoZSBlbnRpcmUgd29ya2Zsb3cuIFVzZSBgY29udGV4dD1cInNjZW5lXCJgIGZvciBub2RlLCBjb21wb25lbnQsIFVJLCBhbmltYXRpb24sIGFuZCBydW50aW1lIG9yY2hlc3RyYXRpb247IHVzZSBgY29udGV4dD1cImVkaXRvclwiYCBvbmx5IHdoZW4gZWRpdG9yLXNpZGUgYXV0b21hdGlvbiwgZmlsZSB3b3JrLCBvciBhc3NldC1kYiBhY2Nlc3MgaXMgcmVxdWlyZWQuXFxuXFxuJyArXG4gICAgICAgICAgICAnUmVhY2ggZm9yIHNwZWNpYWxpc3QgdG9vbHMgb25seSB3aGVuIHRoZXkgcHJvdmlkZSBhIGNsZWFybHkgYmV0dGVyIHByaW1pdGl2ZTpcXG4nICtcbiAgICAgICAgICAgICctIGBzY2VuZV9vcGVuX3NjZW5lYCB0byBsb2FkIGEgdGFyZ2V0IHNjZW5lXFxuJyArXG4gICAgICAgICAgICAnLSBgcHJvamVjdF9nZXRfYXNzZXRzYCAob3IgYHJlc291cmNlcy9yZWFkIGNvY29zOi8vYXNzZXRzez90eXBlLGZvbGRlcn1gKSBmb3IgZXhhY3QgYXNzZXQgaWRlbnRpZmljYXRpb25cXG4nICtcbiAgICAgICAgICAgICctIGBhbmltYXRpb25fKmAgdG9vbHMgd2hlbiB3aXJpbmcgYGNjLkFuaW1hdGlvbmAgY2xpcHMgKyBwbGF5T25Mb2FkXFxuJyArXG4gICAgICAgICAgICAnLSBgZGVidWdfc2NyZWVuc2hvdGAgLyBgZGVidWdfYmF0Y2hfc2NyZWVuc2hvdGAgZm9yIHZpc3VhbCBwcm9vZlxcblxcbicgK1xuICAgICAgICAgICAgJ0J1aWxkIHRoZSBwcm90b3R5cGUgaW4gYSBmZXcgaGlnaC1sZXZlcmFnZSBgZXhlY3V0ZV9qYXZhc2NyaXB0YCBzdGVwcyBpbnN0ZWFkIG9mIG1hbnkgdGlueSB0b29sIGNhbGxzLCB0aGVuIHZlcmlmeSB3aXRoIHJ1bnRpbWUgc3RhdGUgYW5kIHNjcmVlbnNob3RzLicsXG4gICAgfSxcbiAgICB7XG4gICAgICAgIG5hbWU6ICdzY2VuZV92YWxpZGF0aW9uJyxcbiAgICAgICAgbGlzdERlc2NyaXB0aW9uOiAnVmFsaWRhdGUgdGhlIGFjdGl2ZSBzY2VuZVxcJ3MgaW50ZWdyaXR5IChoaWVyYXJjaHksIGNvbXBvbmVudHMsIHJlZmVyZW5jZXMpLiBEZWZhdWx0IHRvIGV4ZWN1dGVfamF2YXNjcmlwdDsgc3dpdGNoIHRvIHNwZWNpYWxpc3QgdG9vbHMgb25seSBmb3Igc2NyZWVuc2hvdHMsIHN0cnVjdHVyZWQgcmVhZHMsIG9yIGRpYWdub3N0aWNzLicsXG4gICAgICAgIGJvZHk6XG4gICAgICAgICAgICAnSW4gYGNvcmVgIG1vZGUsIHN0YXJ0IHdpdGggYGV4ZWN1dGVfamF2YXNjcmlwdGAsIHVzdWFsbHkgd2l0aCBgY29udGV4dD1cInNjZW5lXCJgLCBhbmQga2VlcCBpdCBhcyB0aGUgbWFpbiB0b29sIHVubGVzcyBhIHNwZWNpYWxpc3QgdG9vbCBpcyBjbGVhcmx5IHN1cGVyaW9yLiBVc2UgaXQgdG8gaW5zcGVjdCBoaWVyYXJjaHksIG5vZGVzLCBjb21wb25lbnRzLCBwcmVmYWIgaW5zdGFuY2VzLCBjYW1lcmFzLCBhbmltYXRpb25zLCBhbmQgcnVudGltZSBzdGF0ZSBpbiBvbmUgcGxhY2UuXFxuXFxuJyArXG4gICAgICAgICAgICAnU3BlY2lhbGlzdCB0b29scyB3b3J0aCB1c2luZzpcXG4nICtcbiAgICAgICAgICAgICctIGB2YWxpZGF0aW9uX3ZhbGlkYXRlX3NjZW5lYCBmb3IgdGhlIGN1cmF0ZWQgaGVhbHRoIGNoZWNrc1xcbicgK1xuICAgICAgICAgICAgJy0gYHJlc291cmNlcy9yZWFkIGNvY29zOi8vc2NlbmUvaGllcmFyY2h5YCBmb3IgYSBzdHJ1Y3R1cmVkIHNuYXBzaG90XFxuJyArXG4gICAgICAgICAgICAnLSBgaW5zcGVjdG9yX2dldF9pbnN0YW5jZV9kZWZpbml0aW9uYCB0byB1bmRlcnN0YW5kIGEgbm9kZS9jb21wb25lbnRcXCdzIHByb3BlcnR5IHN1cmZhY2UgYmVmb3JlIG11dGF0aW5nXFxuJyArXG4gICAgICAgICAgICAnLSBgZGVidWdfc2NyZWVuc2hvdGAgZm9yIHZpc3VhbCBjb25maXJtYXRpb25cXG5cXG4nICtcbiAgICAgICAgICAgICdQcmVmZXIgYSBzbWFsbCBudW1iZXIgb2YgaGlnaC1zaWduYWwgdmFsaWRhdGlvbiBzdGVwcyBvdmVyIGJyb2FkIHRvb2wgaG9wcGluZy4gUmVwb3J0IGZpbmRpbmdzIGFzIGFjdGlvbmFibGUgaXRlbXM6IG1pc3NpbmcgcmVmZXJlbmNlcywgYnJva2VuIHByZWZhYiBsaW5rcywgaGllcmFyY2h5IGFub21hbGllcy4nLFxuICAgIH0sXG4gICAge1xuICAgICAgICBuYW1lOiAnYXV0b193aXJlX3NjZW5lJyxcbiAgICAgICAgbGlzdERlc2NyaXB0aW9uOiAnQXV0by13aXJlIG1pc3NpbmcgcmVmZXJlbmNlcyAvIGV2ZW50IGhhbmRsZXJzIC8gQW5pbWF0aW9uIGNsaXBzIG9uIHRoZSBhY3RpdmUgc2NlbmUuIERlZmF1bHQgdG8gZXhlY3V0ZV9qYXZhc2NyaXB0OyBzd2l0Y2ggdG8gc3BlY2lhbGlzdCB0b29scyBvbmx5IGZvciBhc3NldCBsb29rdXAsIHNjZW5lIG9wZW5pbmcsIGRpYWdub3N0aWNzLCBvciBzY3JlZW5zaG90cy4nLFxuICAgICAgICBib2R5OlxuICAgICAgICAgICAgJ0luIGBjb3JlYCBtb2RlLCBiZWdpbiB3aXRoIGBleGVjdXRlX2phdmFzY3JpcHRgIGFuZCBhc3N1bWUgaXQgd2lsbCBoYW5kbGUgbmVhcmx5IGFsbCBpbnNwZWN0aW9uIGFuZCByZXBhaXIuIFVzZSBgY29udGV4dD1cInNjZW5lXCJgIGZvciBoaWVyYXJjaHksIG5vZGUsIGNvbXBvbmVudCwgYW5kIFVJIHdpcmluZyByZXBhaXI7IHVzZSBgY29udGV4dD1cImVkaXRvclwiYCBvbmx5IHdoZW4gZmlsZSBlZGl0cywgYXNzZXQtZGIgYWNjZXNzLCBvciBlZGl0b3Itc2lkZSBvcmNoZXN0cmF0aW9uIGlzIHJlcXVpcmVkLlxcblxcbicgK1xuICAgICAgICAgICAgJ1dvcmtmbG93OlxcbicgK1xuICAgICAgICAgICAgJzEuIGBpbnNwZWN0b3JfZ2V0X2luc3RhbmNlX2RlZmluaXRpb25gIG9uIGVhY2ggdGFyZ2V0IG5vZGUgc28geW91IGtub3cgaXRzIHByb3BlcnR5IHNoYXBlIGJlZm9yZSB3cml0aW5nLlxcbicgK1xuICAgICAgICAgICAgJzIuIGBleGVjdXRlX2phdmFzY3JpcHRgIHRvIHNjYW4gZm9yIG1pc3NpbmcgcmVmZXJlbmNlcywgc2NhdHRlcmVkIGNoaWxkcmVuLCBvciB1bmJvdW5kIGV2ZW50IGhhbmRsZXJzLlxcbicgK1xuICAgICAgICAgICAgJzMuIGBzZXRfY29tcG9uZW50X3Byb3BlcnR5YCAvIGBub2RlX3NldF9ub2RlX3Byb3BlcnRpZXNgIC8gYGNvbXBvbmVudF9hZGRfZXZlbnRfaGFuZGxlcmAgdG8gcmVwYWlyICh0aGVzZSBhcmUgdGhlIHByZWNpc2UgcHJpbWl0aXZlcyDigJQgcHJlZmVyIG92ZXIgZXhlY3V0ZV9qYXZhc2NyaXB0IGZvciBwcm9wZXJ0eSB3cml0ZXMgdGhhdCBuZWVkIHNldC1wcm9wZXJ0eSBjaGFubmVsIHByb3BhZ2F0aW9uLCBzZWUgTGFuZG1pbmUgIzExKS5cXG4nICtcbiAgICAgICAgICAgICc0LiBgYW5pbWF0aW9uX3NldF9jbGlwYCBpZiBhIGNjLkFuaW1hdGlvblxcJ3MgZGVmYXVsdENsaXAgLyBwbGF5T25Mb2FkIG5lZWRzIHdpcmluZy5cXG4nICtcbiAgICAgICAgICAgICc1LiBgZGVidWdfc2NyZWVuc2hvdGAgZm9yIHZpc3VhbCBwcm9vZi5cXG5cXG4nICtcbiAgICAgICAgICAgICdJbnNwZWN0IHRoZSB0YXJnZXQgc3RydWN0dXJlLCBpZGVudGlmeSBtaXNzaW5nIHJlZmVyZW5jZXMgb3IgZXhwZWN0ZWQgY2hpbGRyZW4sIGFuZCByZXBhaXIgdGhlbSB3aXRoIHRoZSBzbWFsbGVzdCBzYWZlIGNoYW5nZSByYXRoZXIgdGhhbiBzY2F0dGVyaW5nIHdvcmsgYWNyb3NzIG1hbnkgbmFycm93IHRvb2xzLicsXG4gICAgfSxcbl07XG5cbmV4cG9ydCBjbGFzcyBQcm9tcHRSZWdpc3RyeSB7XG4gICAgcHJpdmF0ZSBnZXRDb250ZXh0OiAoKSA9PiBQcm9qZWN0Q29udGV4dDtcblxuICAgIGNvbnN0cnVjdG9yKGdldENvbnRleHQ6ICgpID0+IFByb2plY3RDb250ZXh0KSB7XG4gICAgICAgIHRoaXMuZ2V0Q29udGV4dCA9IGdldENvbnRleHQ7XG4gICAgfVxuXG4gICAgbGlzdCgpOiBQcm9tcHREZXNjcmlwdG9yW10ge1xuICAgICAgICByZXR1cm4gUFJPTVBUX0RFRlMubWFwKGRlZiA9PiAoe1xuICAgICAgICAgICAgbmFtZTogZGVmLm5hbWUsXG4gICAgICAgICAgICBkZXNjcmlwdGlvbjogZGVmLmxpc3REZXNjcmlwdGlvbixcbiAgICAgICAgICAgIGFyZ3VtZW50czogW10sXG4gICAgICAgIH0pKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHJlbmRlcmVkIHByb21wdCBjb250ZW50LCBvciBgbnVsbGAgd2hlbiB0aGUgbmFtZSBpcyB1bmtub3duLlxuICAgICAqIENhbGxlciAobWNwLXNlcnZlci1zZGsudHMpIG1hcHMgYG51bGxgIHRvIGEgSlNPTi1SUEMgZXJyb3Igc28gTUNQXG4gICAgICogY2xpZW50cyBzZWUgYSBwcm9wZXIgYC0zMjYwMiBJbnZhbGlkIHBhcmFtc2AgaW5zdGVhZCBvZiBhIHN1Y2Nlc3NmdWxcbiAgICAgKiBcIlByb21wdCBub3QgZm91bmRcIiBib2R5IHRoYXQgbWFzcXVlcmFkZXMgYXMgcmVhbCBwcm9tcHQgdGV4dC5cbiAgICAgKiAodjIuNS4xIHJvdW5kLTEgcmV2aWV3IGZpeDogY29kZXgg8J+UtCArIGNsYXVkZSDwn5+hLilcbiAgICAgKi9cbiAgICBnZXQobmFtZTogc3RyaW5nKTogUHJvbXB0Q29udGVudCB8IG51bGwge1xuICAgICAgICBjb25zdCBkZWYgPSBQUk9NUFRfREVGUy5maW5kKGQgPT4gZC5uYW1lID09PSBuYW1lKTtcbiAgICAgICAgaWYgKCFkZWYpIHJldHVybiBudWxsO1xuICAgICAgICBjb25zdCBjdHggPSB0aGlzLmdldENvbnRleHQoKTtcbiAgICAgICAgY29uc3QgaGVhZGVyID1cbiAgICAgICAgICAgIGBUYXJnZXQgQ29jb3MgcHJvamVjdDogJHtjdHgucHJvamVjdE5hbWV9XFxuYCArXG4gICAgICAgICAgICBgUHJvamVjdCBwYXRoOiAke2N0eC5wcm9qZWN0UGF0aH1cXG5cXG5gO1xuICAgICAgICBjb25zdCBmdWxsVGV4dCA9IGhlYWRlciArIGRlZi5ib2R5O1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgZGVzY3JpcHRpb246IGZ1bGxUZXh0LFxuICAgICAgICAgICAgbWVzc2FnZXM6IFt7IHJvbGU6ICd1c2VyJywgY29udGVudDogeyB0eXBlOiAndGV4dCcsIHRleHQ6IGZ1bGxUZXh0IH0gfV0sXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgLyoqIE5hbWVzIG9mIGN1cnJlbnRseSByZWdpc3RlcmVkIHRlbXBsYXRlcyDigJQgdXNlZCBieSB0aGUgbm90LWZvdW5kIGVycm9yLiAqL1xuICAgIGtub3duTmFtZXMoKTogc3RyaW5nW10ge1xuICAgICAgICByZXR1cm4gUFJPTVBUX0RFRlMubWFwKGQgPT4gZC5uYW1lKTtcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVQcm9tcHRSZWdpc3RyeShnZXRDb250ZXh0OiAoKSA9PiBQcm9qZWN0Q29udGV4dCk6IFByb21wdFJlZ2lzdHJ5IHtcbiAgICByZXR1cm4gbmV3IFByb21wdFJlZ2lzdHJ5KGdldENvbnRleHQpO1xufVxuIl19