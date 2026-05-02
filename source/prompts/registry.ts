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

export interface PromptDescriptor {
    name: string;
    description: string;
    arguments: Array<{ name: string; description: string; required?: boolean }>;
}

export interface PromptMessage {
    role: 'user' | 'assistant';
    content: { type: 'text'; text: string };
}

export interface PromptContent {
    description: string;
    messages: PromptMessage[];
}

export interface ProjectContext {
    projectName: string;
    projectPath: string;
}

interface PromptDef {
    name: string;
    listDescription: string;
    body: string;
}

const PROMPT_DEFS: PromptDef[] = [
    {
        name: 'fix_script_errors',
        listDescription: 'Diagnose and fix TypeScript errors in the project. Default to execute_javascript; switch to specialist tools (run_script_diagnostics, get_script_diagnostic_context, screenshot) only when they are clearly the better primitive.',
        body:
            'In `core` mode, assume `execute_javascript` is the default first tool. Start with `context="editor"` for diagnosis, local file edits, asset-db workflows, and orchestration; switch to `context="scene"` only when runtime or scene state must be inspected directly.\n\n' +
            'Only use specialist tools when they are strictly better primitives:\n' +
            '- `debug_run_script_diagnostics` + `debug_get_script_diagnostic_context` for TypeScript errors (after `debug_wait_compile`)\n' +
            '- `resources/read cocos://docs/landmines` for landmine context when a tool surprises you\n' +
            '- `debug_screenshot` for visual verification after UI/scene fixes\n\n' +
            'Avoid hopping across many narrow tools when one `execute_javascript` call can inspect, decide, and act. Patch the smallest safe regions, refresh assets via the file-editor tools (which auto-trigger asset-db refresh), and verify the project returns to a healthy state with a final `debug_run_script_diagnostics`.',
    },
    {
        name: 'create_playable_prototype',
        listDescription: 'Build a small playable prototype in the project. Default to execute_javascript; reach for specialist tools only for asset lookup, scene opening, or visual proof.',
        body:
            'In `core` mode, treat `execute_javascript` as the primary tool for almost the entire workflow. Use `context="scene"` for node, component, UI, animation, and runtime orchestration; use `context="editor"` only when editor-side automation, file work, or asset-db access is required.\n\n' +
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
        body:
            'In `core` mode, start with `execute_javascript`, usually with `context="scene"`, and keep it as the main tool unless a specialist tool is clearly superior. Use it to inspect hierarchy, nodes, components, prefab instances, cameras, animations, and runtime state in one place.\n\n' +
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
        body:
            'In `core` mode, begin with `execute_javascript` and assume it will handle nearly all inspection and repair. Use `context="scene"` for hierarchy, node, component, and UI wiring repair; use `context="editor"` only when file edits, asset-db access, or editor-side orchestration is required.\n\n' +
            'Workflow:\n' +
            '1. `inspector_get_instance_definition` on each target node so you know its property shape before writing.\n' +
            '2. `execute_javascript` to scan for missing references, scattered children, or unbound event handlers.\n' +
            '3. `set_component_property` / `node_set_node_properties` / `component_add_event_handler` to repair (these are the precise primitives — prefer over execute_javascript for property writes that need set-property channel propagation, see Landmine #11).\n' +
            '4. `animation_set_clip` if a cc.Animation\'s defaultClip / playOnLoad needs wiring.\n' +
            '5. `debug_screenshot` for visual proof.\n\n' +
            'Inspect the target structure, identify missing references or expected children, and repair them with the smallest safe change rather than scattering work across many narrow tools.',
    },
    {
        name: 'discover_then_act_workflow',
        listDescription: 'Three-step pattern (cocos-code-mode reference): query scene tree → read instance type definition → write properties by exact name. Prevents AI from guessing property names against the live cocos schema.',
        body:
            'Cocos-code-mode established a "discover, then act" architecture: AI never guesses property names — it queries the live cocos dump for the real type definition first. Use this template when about to mutate any node or component property in an unfamiliar scene.\n\n' +
            'The three required steps:\n' +
            '1. **Query scene tree** — `node_get_node_tree` (or `scene_advanced_*`) to locate the target node UUID. If you only know a name, `node_find_nodes` can resolve it.\n' +
            '2. **Read instance TS definition** — `inspector_get_instance_definition({ reference: { id: <uuid> } })` returns a TypeScript class declaration with the exact property names, types, `@property` decorators (min/max/unit/tooltip), enums, and nested struct types as the live cocos editor sees them. Pair with `inspector_get_common_types_definition` if you need Vec3/Color/etc shapes inlined.\n' +
            '3. **Write by exact name** — `component_set_component_property` / `node_set_node_property` / `node_set_node_transform` using the names you just read. Do NOT invent property names; the inspector output is the source of truth.\n\n' +
            'When the property write is for a component array (event handler, clip, child), follow Landmine #11 — go through scene-script + nudge from host side via `set-property` on `__comps__.<idx>.<prop>` rather than direct array push.\n\n' +
            'When in doubt, fall back to `execute_javascript({context:"scene"})` to read both the dump and the resulting state in one round-trip.',
    },
];

export class PromptRegistry {
    private getContext: () => ProjectContext;

    constructor(getContext: () => ProjectContext) {
        this.getContext = getContext;
    }

    list(): PromptDescriptor[] {
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
    get(name: string): PromptContent | null {
        const def = PROMPT_DEFS.find(d => d.name === name);
        if (!def) return null;
        const ctx = this.getContext();
        const header =
            `Target Cocos project: ${ctx.projectName}\n` +
            `Project path: ${ctx.projectPath}\n\n`;
        const fullText = header + def.body;
        return {
            description: fullText,
            messages: [{ role: 'user', content: { type: 'text', text: fullText } }],
        };
    }

    /** Names of currently registered templates — used by the not-found error. */
    knownNames(): string[] {
        return PROMPT_DEFS.map(d => d.name);
    }
}

export function createPromptRegistry(getContext: () => ProjectContext): PromptRegistry {
    return new PromptRegistry(getContext);
}
