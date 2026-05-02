"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DebugTools = void 0;
const runtime_flags_1 = require("../lib/runtime-flags");
const schema_1 = require("../lib/schema");
const define_tools_1 = require("../lib/define-tools");
const ts_diagnostics_1 = require("../lib/ts-diagnostics");
const game_command_queue_1 = require("../lib/game-command-queue");
const scene_bridge_1 = require("../lib/scene-bridge");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// v2.9.x polish: containment helper that handles drive-root edges
// (C:\), prefix-collision (C:\foo vs C:\foobar), and cross-volume paths
// (D:\... when root is C:\). Uses path.relative which returns a relative
// expression — if the result starts with `..` or is absolute, the
// candidate is outside the root.
//
// TOCTOU note (Codex r1 + Gemini r1 single-🟡 from v2.8.1 review,
// reviewed v2.9.x and accepted as residual risk): there is a small
// race window between realpathSync containment check and the
// subsequent writeFileSync — a malicious symlink swap during that
// window could escape. Full mitigation needs O_NOFOLLOW which Node's
// fs API doesn't expose directly. Given this is a local dev tool, not
// a network-facing service, and the attack window is microseconds,
// the risk is accepted for now. A future v2.x patch could add
// `fs.openSync(filePath, 'wx')` for AUTO-named paths only (caller-
// provided savePath needs overwrite semantics). Don't rely on
// containment for security-critical writes.
function isPathWithinRoot(candidate, root) {
    const candAbs = path.resolve(candidate);
    const rootAbs = path.resolve(root);
    if (candAbs === rootAbs)
        return true;
    const rel = path.relative(rootAbs, candAbs);
    if (!rel)
        return true; // identical
    if (rel.startsWith('..'))
        return false; // outside root
    if (path.isAbsolute(rel))
        return false; // different drive
    return true;
}
class DebugTools {
    constructor() {
        const defs = [
            {
                name: 'clear_console',
                description: 'Clear the Cocos Editor Console UI. No project side effects.',
                inputSchema: schema_1.z.object({}),
                handler: () => this.clearConsole(),
            },
            {
                name: 'execute_javascript',
                description: '[primary] Execute JavaScript in scene or editor context. Use this as the default first tool for compound operations (read → mutate → verify) — one call replaces 5-10 narrow specialist tools and avoids per-call token overhead. context="scene" inspects/mutates cc.Node graph; context="editor" runs in host process for Editor.Message + fs (default off, opt-in).',
                inputSchema: schema_1.z.object({
                    code: schema_1.z.string().describe('JavaScript source to execute. Has access to cc.* in scene context, Editor.* in editor context.'),
                    context: schema_1.z.enum(['scene', 'editor']).default('scene').describe('Execution sandbox. "scene" runs inside the cocos scene script context (cc, director, find). "editor" runs in the editor host process (Editor, asset-db, fs, require). Editor context is OFF by default and must be opt-in via panel setting `enableEditorContextEval` — arbitrary code in the host process is a prompt-injection risk.'),
                }),
                handler: a => { var _a; return this.executeJavaScript(a.code, (_a = a.context) !== null && _a !== void 0 ? _a : 'scene'); },
            },
            {
                name: 'execute_script',
                description: '[compat] Scene-only JavaScript eval. Prefer execute_javascript with context="scene" — kept as compatibility entrypoint for older clients.',
                inputSchema: schema_1.z.object({
                    script: schema_1.z.string().describe('JavaScript to execute in scene context via console/eval. Can read or mutate the current scene.'),
                }),
                handler: a => this.executeScriptCompat(a.script),
            },
            {
                name: 'get_node_tree',
                description: 'Read a debug node tree from a root or scene root for hierarchy/component inspection.',
                inputSchema: schema_1.z.object({
                    rootUuid: schema_1.z.string().optional().describe('Root node UUID to expand. Omit to use the current scene root.'),
                    maxDepth: schema_1.z.number().default(10).describe('Maximum tree depth. Default 10; large values can return a lot of data.'),
                }),
                handler: a => this.getNodeTree(a.rootUuid, a.maxDepth),
            },
            {
                name: 'get_performance_stats',
                description: 'Try to read scene query-performance stats; may return unavailable in edit mode.',
                inputSchema: schema_1.z.object({}),
                handler: () => this.getPerformanceStats(),
            },
            {
                name: 'validate_scene',
                description: 'Run basic current-scene health checks for missing assets and node-count warnings.',
                inputSchema: schema_1.z.object({
                    checkMissingAssets: schema_1.z.boolean().default(true).describe('Check missing asset references when the Cocos scene API supports it.'),
                    checkPerformance: schema_1.z.boolean().default(true).describe('Run basic performance checks such as high node count warnings.'),
                }),
                handler: a => this.validateScene({ checkMissingAssets: a.checkMissingAssets, checkPerformance: a.checkPerformance }),
            },
            {
                name: 'get_editor_info',
                description: 'Read Editor/Cocos/project/process information and memory summary.',
                inputSchema: schema_1.z.object({}),
                handler: () => this.getEditorInfo(),
            },
            {
                name: 'get_project_logs',
                description: 'Read temp/logs/project.log tail with optional level/keyword filters.',
                inputSchema: schema_1.z.object({
                    lines: schema_1.z.number().min(1).max(10000).default(100).describe('Number of lines to read from the end of temp/logs/project.log. Default 100.'),
                    filterKeyword: schema_1.z.string().optional().describe('Optional case-insensitive keyword filter.'),
                    logLevel: schema_1.z.enum(['ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE', 'ALL']).default('ALL').describe('Optional log level filter. ALL disables level filtering.'),
                }),
                handler: a => this.getProjectLogs(a.lines, a.filterKeyword, a.logLevel),
            },
            {
                name: 'get_log_file_info',
                description: 'Read temp/logs/project.log path, size, line count, and timestamps.',
                inputSchema: schema_1.z.object({}),
                handler: () => this.getLogFileInfo(),
            },
            {
                name: 'search_project_logs',
                description: 'Search temp/logs/project.log for string/regex and return line context.',
                inputSchema: schema_1.z.object({
                    pattern: schema_1.z.string().describe('Search string or regex. Invalid regex is treated as a literal string.'),
                    maxResults: schema_1.z.number().min(1).max(100).default(20).describe('Maximum matches to return. Default 20.'),
                    contextLines: schema_1.z.number().min(0).max(10).default(2).describe('Context lines before/after each match. Default 2.'),
                }),
                handler: a => this.searchProjectLogs(a.pattern, a.maxResults, a.contextLines),
            },
            {
                name: 'screenshot',
                description: 'Capture the focused Cocos Editor window (or a window matched by title) to a PNG. Returns saved file path. Use this for AI visual verification after scene/UI changes.',
                inputSchema: schema_1.z.object({
                    savePath: schema_1.z.string().optional().describe('Absolute filesystem path to save the PNG. Must resolve inside the cocos project root (containment check via realpath). Omit to auto-name into <project>/temp/mcp-captures/screenshot-<timestamp>.png.'),
                    windowTitle: schema_1.z.string().optional().describe('Optional substring match on window title to pick a specific Electron window. Default: focused window.'),
                    includeBase64: schema_1.z.boolean().default(false).describe('Embed PNG bytes as base64 in response data (large; default false). When false, only the saved file path is returned.'),
                }),
                handler: a => this.screenshot(a.savePath, a.windowTitle, a.includeBase64),
            },
            {
                name: 'capture_preview_screenshot',
                description: 'Capture the cocos Preview-in-Editor (PIE) gameview to a PNG. Cocos has multiple PIE render targets depending on the user\'s preview config (Preferences → Preview → Open Preview With): "browser" opens an external browser (NOT capturable here), "window" / "simulator" opens a separate Electron window (title contains "Preview"), "embedded" renders the gameview inside the main editor window. The default mode="auto" tries the Preview-titled window first and falls back to capturing the main editor window when no Preview-titled window exists (covers embedded mode). Use mode="window" to force the separate-window strategy or mode="embedded" to skip the window probe. Pair with debug_get_preview_mode to read the cocos config and route deterministically. For runtime game-canvas pixel-level capture (camera RenderTexture), use debug_game_command(type="screenshot") instead.',
                inputSchema: schema_1.z.object({
                    savePath: schema_1.z.string().optional().describe('Absolute filesystem path to save the PNG. Must resolve inside the cocos project root (containment check via realpath). Omit to auto-name into <project>/temp/mcp-captures/preview-<timestamp>.png.'),
                    mode: schema_1.z.enum(['auto', 'window', 'embedded']).default('auto').describe('Capture target. "auto" (default) tries Preview-titled window then falls back to the main editor window. "window" only matches Preview-titled windows (fails if none). "embedded" captures the main editor window directly (skip Preview-window probe).'),
                    windowTitle: schema_1.z.string().default('Preview').describe('Substring matched against window titles in window/auto modes (default "Preview" for PIE). Ignored in embedded mode.'),
                    includeBase64: schema_1.z.boolean().default(false).describe('Embed PNG bytes as base64 in response data (large; default false).'),
                }),
                handler: a => { var _a; return this.capturePreviewScreenshot(a.savePath, (_a = a.mode) !== null && _a !== void 0 ? _a : 'auto', a.windowTitle, a.includeBase64); },
            },
            {
                name: 'get_preview_mode',
                description: 'Read the cocos preview configuration via Editor.Message preferences/query-config so AI can route debug_capture_preview_screenshot to the correct mode. Returns { interpreted: "browser" | "window" | "simulator" | "embedded" | "unknown", raw: <full preview config dump> }. Use before capture: if interpreted="embedded", call capture_preview_screenshot with mode="embedded" or rely on mode="auto" fallback.',
                inputSchema: schema_1.z.object({}),
                handler: () => this.getPreviewMode(),
            },
            {
                name: 'set_preview_mode',
                description: '⚠ EXPERIMENTAL — does NOT actually flip cocos 3.8.7 preview mode (verified live v2.9.1, see landmine #17). Switch cocos preview mode programmatically via the typed Editor.Message preferences/set-config channel. v2.9.1 attempts 4 known shapes (nested object / dot-path with global/local protocol / no protocol) and verifies via read-back; all 4 silently no-op on cocos 3.8.7 — set-config returns truthy but preview.current.platform is never persisted, suggesting cocos treats this as a readonly category or derives current.platform from non-prefs runtime state. Tool still useful for diagnostics: data.attempts records every shape tried and its read-back observation. For now, switch the preview mode via the cocos dropdown manually. Pending reference-project comparison (v2.9 candidate) to find the correct write path.',
                inputSchema: schema_1.z.object({
                    mode: schema_1.z.enum(['browser', 'gameView', 'simulator']).describe('Target preview platform. "browser" opens preview in the user default browser. "gameView" embeds the gameview in the main editor (in-editor preview). "simulator" launches the cocos simulator. Maps directly to the cocos preview.current.platform value.'),
                    confirm: schema_1.z.boolean().default(false).describe('Required to commit the change. Default false returns the current value plus a hint, without modifying preferences. Set true to actually write.'),
                }),
                handler: a => { var _a; return this.setPreviewMode(a.mode, (_a = a.confirm) !== null && _a !== void 0 ? _a : false); },
            },
            {
                name: 'batch_screenshot',
                description: 'Capture multiple PNGs of the editor window with optional delays between shots. Useful for animating preview verification or capturing transitions.',
                inputSchema: schema_1.z.object({
                    savePathPrefix: schema_1.z.string().optional().describe('Path prefix for batch output files. Files written as <prefix>-<index>.png. Must resolve inside the cocos project root (containment check via realpath). Default: <project>/temp/mcp-captures/batch-<timestamp>.'),
                    delaysMs: schema_1.z.array(schema_1.z.number().min(0).max(10000)).max(20).default([0]).describe('Delay (ms) before each capture. Length determines how many shots taken (capped at 20 to prevent disk fill / editor freeze). Default [0] = single shot.'),
                    windowTitle: schema_1.z.string().optional().describe('Optional substring match on window title.'),
                }),
                handler: a => this.batchScreenshot(a.savePathPrefix, a.delaysMs, a.windowTitle),
            },
            {
                name: 'wait_compile',
                description: 'Block until cocos finishes its TypeScript compile pass. Tails temp/programming/packer-driver/logs/debug.log for the "Target(editor) ends" marker. Returns immediately with compiled=false if no compile was triggered (clean project / no changes detected). Pair with run_script_diagnostics for an "edit .ts → wait → fetch errors" workflow.',
                inputSchema: schema_1.z.object({
                    timeoutMs: schema_1.z.number().min(500).max(120000).default(15000).describe('Max wait time in ms before giving up. Default 15000.'),
                }),
                handler: a => this.waitCompile(a.timeoutMs),
            },
            {
                name: 'run_script_diagnostics',
                description: 'Run `tsc --noEmit` against the project tsconfig and return parsed diagnostics. Used after wait_compile to surface compilation errors as structured {file, line, column, code, message} entries. Resolves tsc binary from project node_modules → editor bundled engine → npx fallback.',
                inputSchema: schema_1.z.object({
                    tsconfigPath: schema_1.z.string().optional().describe('Optional override (absolute or project-relative). Default: tsconfig.json or temp/tsconfig.cocos.json.'),
                }),
                handler: a => this.runScriptDiagnostics(a.tsconfigPath),
            },
            {
                name: 'preview_url',
                description: 'Resolve the cocos browser-preview URL (e.g. http://localhost:7456) via the documented Editor.Message channel preview/query-preview-url. With action="open", also launches the URL in the user default browser via electron.shell.openExternal — useful as a setup step before debug_game_command, since the GameDebugClient running inside the preview must be reachable. Editor-side Preview-in-Editor play/stop is NOT exposed by the public message API and is intentionally not implemented here; use the cocos editor toolbar manually for PIE.',
                inputSchema: schema_1.z.object({
                    action: schema_1.z.enum(['query', 'open']).default('query').describe('"query" returns the URL; "open" returns the URL AND opens it in the user default browser via electron.shell.openExternal.'),
                }),
                handler: a => this.previewUrl(a.action),
            },
            {
                name: 'query_devices',
                description: 'List preview devices configured in the cocos project (cc.IDeviceItem entries). Backed by Editor.Message channel device/query. Returns an array of {name, width, height, ratio} entries — useful for batch-screenshot pipelines that target multiple resolutions.',
                inputSchema: schema_1.z.object({}),
                handler: () => this.queryDevices(),
            },
            {
                name: 'game_command',
                description: 'Send a runtime command to a GameDebugClient running inside a cocos preview/build (browser, Preview-in-Editor, or any device that fetches /game/command). Built-in command types: "screenshot" (capture game canvas to PNG, returns saved file path), "click" (emit Button.CLICK on a node by name), "inspect" (dump runtime node info: position/scale/rotation/contentSize/active/components by name). Custom command types are forwarded to the client\'s customCommands map (e.g. "state", "navigate"). Requires the GameDebugClient template (client/cocos-mcp-client.ts) wired into the running game; without it the call times out. Check GET /game/status to verify client liveness first.',
                inputSchema: schema_1.z.object({
                    type: schema_1.z.string().min(1).describe('Command type. Built-ins: screenshot, click, inspect. Customs: any string the GameDebugClient registered in customCommands.'),
                    args: schema_1.z.any().optional().describe('Command-specific arguments. For "click"/"inspect": {name: string} node name. For "screenshot": {} (no args).'),
                    timeoutMs: schema_1.z.number().min(500).max(60000).default(10000).describe('Max wait for client response. Default 10000ms.'),
                }),
                handler: a => this.gameCommand(a.type, a.args, a.timeoutMs),
            },
            {
                name: 'game_client_status',
                description: 'Read GameDebugClient connection status: connected (polled within 2s), last poll timestamp, whether a command is queued. Use before debug_game_command to confirm the client is reachable.',
                inputSchema: schema_1.z.object({}),
                handler: () => this.gameClientStatus(),
            },
            {
                name: 'check_editor_health',
                description: 'Probe whether the cocos editor scene-script renderer is responsive. Useful after debug_preview_control(start) — landmine #16 documents that cocos 3.8.7 sometimes freezes the scene-script renderer (spinning indicator, Ctrl+R required). Strategy: run two probes in parallel — (1) a fast non-scene channel (device/query, goes to main process) confirms the editor host is alive; (2) a scene-script eval (1+1 trivial expression via execute-scene-script) with a short timeout (default 1500ms) confirms the scene renderer is responsive. Returns { hostAlive, sceneAlive, sceneLatencyMs, suggestion }. AI workflow: call after preview_control(start); if sceneAlive=false, surface "cocos editor likely frozen — press Ctrl+R" instead of issuing more scene-bound calls that would hang.',
                inputSchema: schema_1.z.object({
                    sceneTimeoutMs: schema_1.z.number().min(200).max(10000).default(1500).describe('Timeout for the scene-script probe in ms. Below this scene is considered frozen. Default 1500ms.'),
                }),
                handler: a => { var _a; return this.checkEditorHealth((_a = a.sceneTimeoutMs) !== null && _a !== void 0 ? _a : 1500); },
            },
            {
                name: 'preview_control',
                description: '⚠ PARKED — known to freeze cocos 3.8.7 (landmine #16). Programmatically start or stop Preview-in-Editor (PIE) play mode. Wraps the typed cce.SceneFacadeManager.changePreviewPlayState method. **start hits a cocos 3.8.7 softReloadScene race** that returns success but freezes the editor (spinning indicator, Ctrl+R required to recover). Verified in both embedded and browser preview modes. **stop is safe** and reliable. To prevent accidental triggering, start now requires explicit `acknowledgeFreezeRisk: true`. **Recommended alternatives instead of start**: (a) debug_capture_preview_screenshot(mode="embedded") in EDIT mode — no PIE needed; (b) debug_game_command(type="screenshot") via GameDebugClient on browser preview. Pending v2.9 reference-project comparison to find a safer call path.',
                inputSchema: schema_1.z.object({
                    op: schema_1.z.enum(['start', 'stop']).describe('"start" enters PIE play mode (equivalent to clicking the toolbar play button) — REQUIRES acknowledgeFreezeRisk=true on cocos 3.8.7 due to landmine #16. "stop" exits PIE play and returns to scene mode (always safe).'),
                    acknowledgeFreezeRisk: schema_1.z.boolean().default(false).describe('Required to be true for op="start" on cocos 3.8.7 due to landmine #16 (softReloadScene race that freezes the editor). Set true ONLY when the human user has explicitly accepted the risk and is prepared to press Ctrl+R if the editor freezes. Ignored for op="stop" which is reliable.'),
                }),
                handler: a => { var _a; return this.previewControl(a.op, (_a = a.acknowledgeFreezeRisk) !== null && _a !== void 0 ? _a : false); },
            },
            {
                name: 'get_script_diagnostic_context',
                description: 'Read a window of source lines around a diagnostic location so AI can read the offending code without a separate file read. Pair with run_script_diagnostics: pass file/line from each diagnostic to fetch context.',
                inputSchema: schema_1.z.object({
                    file: schema_1.z.string().describe('Absolute or project-relative path to the source file. Diagnostics from run_script_diagnostics already use a path tsc emitted, which is suitable here.'),
                    line: schema_1.z.number().min(1).describe('1-based line number that the diagnostic points at.'),
                    contextLines: schema_1.z.number().min(0).max(50).default(5).describe('Number of lines to include before and after the target line. Default 5 (±5 → 11-line window).'),
                }),
                handler: a => this.getScriptDiagnosticContext(a.file, a.line, a.contextLines),
            },
        ];
        this.exec = (0, define_tools_1.defineTools)(defs);
    }
    getTools() { return this.exec.getTools(); }
    execute(toolName, args) { return this.exec.execute(toolName, args); }
    // Compat path: preserve the pre-v2.3.0 response shape
    // {success, data: {result, message: 'Script executed successfully'}}
    // so older callers reading data.message keep working.
    async executeScriptCompat(script) {
        const out = await this.executeJavaScript(script, 'scene');
        if (out.success && out.data && 'result' in out.data) {
            return {
                success: true,
                data: {
                    result: out.data.result,
                    message: 'Script executed successfully',
                },
            };
        }
        return out;
    }
    async clearConsole() {
        try {
            // Note: Editor.Message.send may not return a promise in all versions
            Editor.Message.send('console', 'clear');
            return {
                success: true,
                message: 'Console cleared successfully'
            };
        }
        catch (err) {
            return { success: false, error: err.message };
        }
    }
    async executeJavaScript(code, context) {
        if (context === 'scene') {
            return this.executeInSceneContext(code);
        }
        if (context === 'editor') {
            return this.executeInEditorContext(code);
        }
        return { success: false, error: `Unknown execute_javascript context: ${context}` };
    }
    executeInSceneContext(code) {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'execute-scene-script', {
                name: 'console',
                method: 'eval',
                args: [code]
            }).then((result) => {
                resolve({
                    success: true,
                    data: {
                        context: 'scene',
                        result: result,
                    },
                    message: 'Scene script executed successfully'
                });
            }).catch((err) => {
                resolve({ success: false, error: err.message });
            });
        });
    }
    async executeInEditorContext(code) {
        var _a;
        if (!(0, runtime_flags_1.isEditorContextEvalEnabled)()) {
            return {
                success: false,
                error: 'Editor context eval is disabled. Enable `enableEditorContextEval` in MCP server settings (panel UI) to opt in. This grants AI-generated code access to Editor.Message + Node fs APIs in the host process; only enable when you trust the upstream prompt source.',
            };
        }
        try {
            // Wrap in async IIFE so AI can use top-level await transparently;
            // also gives us a clean Promise-based return path regardless of
            // whether the user code returns a Promise or a sync value.
            const wrapped = `(async () => { ${code} \n })()`;
            // eslint-disable-next-line no-eval
            const result = await (0, eval)(wrapped);
            return {
                success: true,
                data: {
                    context: 'editor',
                    result: result,
                },
                message: 'Editor script executed successfully',
            };
        }
        catch (err) {
            return {
                success: false,
                error: `Editor eval failed: ${(_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : String(err)}`,
            };
        }
    }
    async getNodeTree(rootUuid, maxDepth = 10) {
        return new Promise((resolve) => {
            const buildTree = async (nodeUuid, depth = 0) => {
                if (depth >= maxDepth) {
                    return { truncated: true };
                }
                try {
                    const nodeData = await Editor.Message.request('scene', 'query-node', nodeUuid);
                    const tree = {
                        uuid: nodeData.uuid,
                        name: nodeData.name,
                        active: nodeData.active,
                        components: nodeData.components ? nodeData.components.map((c) => c.__type__) : [],
                        childCount: nodeData.children ? nodeData.children.length : 0,
                        children: []
                    };
                    if (nodeData.children && nodeData.children.length > 0) {
                        for (const childId of nodeData.children) {
                            const childTree = await buildTree(childId, depth + 1);
                            tree.children.push(childTree);
                        }
                    }
                    return tree;
                }
                catch (err) {
                    return { error: err.message };
                }
            };
            if (rootUuid) {
                buildTree(rootUuid).then(tree => {
                    resolve({ success: true, data: tree });
                });
            }
            else {
                Editor.Message.request('scene', 'query-hierarchy').then(async (hierarchy) => {
                    const trees = [];
                    for (const rootNode of hierarchy.children) {
                        const tree = await buildTree(rootNode.uuid);
                        trees.push(tree);
                    }
                    resolve({ success: true, data: trees });
                }).catch((err) => {
                    resolve({ success: false, error: err.message });
                });
            }
        });
    }
    async getPerformanceStats() {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'query-performance').then((stats) => {
                const perfStats = {
                    nodeCount: stats.nodeCount || 0,
                    componentCount: stats.componentCount || 0,
                    drawCalls: stats.drawCalls || 0,
                    triangles: stats.triangles || 0,
                    memory: stats.memory || {}
                };
                resolve({ success: true, data: perfStats });
            }).catch(() => {
                // Fallback to basic stats
                resolve({
                    success: true,
                    data: {
                        message: 'Performance stats not available in edit mode'
                    }
                });
            });
        });
    }
    async validateScene(options) {
        const issues = [];
        try {
            // Check for missing assets
            if (options.checkMissingAssets) {
                const assetCheck = await Editor.Message.request('scene', 'check-missing-assets');
                if (assetCheck && assetCheck.missing) {
                    issues.push({
                        type: 'error',
                        category: 'assets',
                        message: `Found ${assetCheck.missing.length} missing asset references`,
                        details: assetCheck.missing
                    });
                }
            }
            // Check for performance issues
            if (options.checkPerformance) {
                const hierarchy = await Editor.Message.request('scene', 'query-hierarchy');
                const nodeCount = this.countNodes(hierarchy.children);
                if (nodeCount > 1000) {
                    issues.push({
                        type: 'warning',
                        category: 'performance',
                        message: `High node count: ${nodeCount} nodes (recommended < 1000)`,
                        suggestion: 'Consider using object pooling or scene optimization'
                    });
                }
            }
            const result = {
                valid: issues.length === 0,
                issueCount: issues.length,
                issues: issues
            };
            return { success: true, data: result };
        }
        catch (err) {
            return { success: false, error: err.message };
        }
    }
    countNodes(nodes) {
        let count = nodes.length;
        for (const node of nodes) {
            if (node.children) {
                count += this.countNodes(node.children);
            }
        }
        return count;
    }
    async getEditorInfo() {
        var _a, _b;
        const info = {
            editor: {
                version: ((_a = Editor.versions) === null || _a === void 0 ? void 0 : _a.editor) || 'Unknown',
                cocosVersion: ((_b = Editor.versions) === null || _b === void 0 ? void 0 : _b.cocos) || 'Unknown',
                platform: process.platform,
                arch: process.arch,
                nodeVersion: process.version
            },
            project: {
                name: Editor.Project.name,
                path: Editor.Project.path,
                uuid: Editor.Project.uuid
            },
            memory: process.memoryUsage(),
            uptime: process.uptime()
        };
        return { success: true, data: info };
    }
    resolveProjectLogPath() {
        if (!Editor.Project || !Editor.Project.path) {
            return { error: 'Editor.Project.path is not available; cannot locate project log file.' };
        }
        const logPath = path.join(Editor.Project.path, 'temp/logs/project.log');
        if (!fs.existsSync(logPath)) {
            return { error: `Project log file not found at ${logPath}` };
        }
        return { path: logPath };
    }
    async getProjectLogs(lines = 100, filterKeyword, logLevel = 'ALL') {
        try {
            const resolved = this.resolveProjectLogPath();
            if ('error' in resolved) {
                return { success: false, error: resolved.error };
            }
            const logFilePath = resolved.path;
            // Read the file content
            const logContent = fs.readFileSync(logFilePath, 'utf8');
            const logLines = logContent.split('\n').filter(line => line.trim() !== '');
            // Get the last N lines
            const recentLines = logLines.slice(-lines);
            // Apply filters
            let filteredLines = recentLines;
            // Filter by log level if not 'ALL'
            if (logLevel !== 'ALL') {
                filteredLines = filteredLines.filter(line => line.includes(`[${logLevel}]`) || line.includes(logLevel.toLowerCase()));
            }
            // Filter by keyword if provided
            if (filterKeyword) {
                filteredLines = filteredLines.filter(line => line.toLowerCase().includes(filterKeyword.toLowerCase()));
            }
            return {
                success: true,
                data: {
                    totalLines: logLines.length,
                    requestedLines: lines,
                    filteredLines: filteredLines.length,
                    logLevel: logLevel,
                    filterKeyword: filterKeyword || null,
                    logs: filteredLines,
                    logFilePath: logFilePath
                }
            };
        }
        catch (error) {
            return {
                success: false,
                error: `Failed to read project logs: ${error.message}`
            };
        }
    }
    async getLogFileInfo() {
        try {
            const resolved = this.resolveProjectLogPath();
            if ('error' in resolved) {
                return { success: false, error: resolved.error };
            }
            const logFilePath = resolved.path;
            const stats = fs.statSync(logFilePath);
            const logContent = fs.readFileSync(logFilePath, 'utf8');
            const lineCount = logContent.split('\n').filter(line => line.trim() !== '').length;
            return {
                success: true,
                data: {
                    filePath: logFilePath,
                    fileSize: stats.size,
                    fileSizeFormatted: this.formatFileSize(stats.size),
                    lastModified: stats.mtime.toISOString(),
                    lineCount: lineCount,
                    created: stats.birthtime.toISOString(),
                    accessible: fs.constants.R_OK
                }
            };
        }
        catch (error) {
            return {
                success: false,
                error: `Failed to get log file info: ${error.message}`
            };
        }
    }
    async searchProjectLogs(pattern, maxResults = 20, contextLines = 2) {
        try {
            const resolved = this.resolveProjectLogPath();
            if ('error' in resolved) {
                return { success: false, error: resolved.error };
            }
            const logFilePath = resolved.path;
            const logContent = fs.readFileSync(logFilePath, 'utf8');
            const logLines = logContent.split('\n');
            // Create regex pattern (support both string and regex patterns)
            let regex;
            try {
                regex = new RegExp(pattern, 'gi');
            }
            catch (_a) {
                // If pattern is not valid regex, treat as literal string
                regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
            }
            const matches = [];
            let resultCount = 0;
            for (let i = 0; i < logLines.length && resultCount < maxResults; i++) {
                const line = logLines[i];
                if (regex.test(line)) {
                    // Get context lines
                    const contextStart = Math.max(0, i - contextLines);
                    const contextEnd = Math.min(logLines.length - 1, i + contextLines);
                    const contextLinesArray = [];
                    for (let j = contextStart; j <= contextEnd; j++) {
                        contextLinesArray.push({
                            lineNumber: j + 1,
                            content: logLines[j],
                            isMatch: j === i
                        });
                    }
                    matches.push({
                        lineNumber: i + 1,
                        matchedLine: line,
                        context: contextLinesArray
                    });
                    resultCount++;
                    // Reset regex lastIndex for global search
                    regex.lastIndex = 0;
                }
            }
            return {
                success: true,
                data: {
                    pattern: pattern,
                    totalMatches: matches.length,
                    maxResults: maxResults,
                    contextLines: contextLines,
                    logFilePath: logFilePath,
                    matches: matches
                }
            };
        }
        catch (error) {
            return {
                success: false,
                error: `Failed to search project logs: ${error.message}`
            };
        }
    }
    formatFileSize(bytes) {
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        return `${size.toFixed(2)} ${units[unitIndex]}`;
    }
    pickWindow(titleSubstring) {
        var _a;
        // Lazy require so that non-Electron contexts (e.g. unit tests, smoke
        // script with stub registry) can still import this module.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const electron = require('electron');
        const BW = electron.BrowserWindow;
        if (!BW) {
            throw new Error('Electron BrowserWindow API unavailable; screenshot tool requires running inside Cocos editor host process.');
        }
        if (titleSubstring) {
            const matches = BW.getAllWindows().filter((w) => { var _a; return w && !w.isDestroyed() && (((_a = w.getTitle) === null || _a === void 0 ? void 0 : _a.call(w)) || '').includes(titleSubstring); });
            if (matches.length === 0) {
                throw new Error(`No Electron window title matched substring: ${titleSubstring}`);
            }
            return matches[0];
        }
        // v2.3.1 review fix: focused window may be a transient preview popup.
        // Prefer a non-Preview window so default screenshots target the main
        // editor surface. Caller can still pass titleSubstring='Preview' to
        // explicitly target the preview when wanted.
        const all = BW.getAllWindows().filter((w) => w && !w.isDestroyed());
        if (all.length === 0) {
            throw new Error('No live Electron windows; cannot capture screenshot.');
        }
        const isPreview = (w) => { var _a; return /preview/i.test(((_a = w.getTitle) === null || _a === void 0 ? void 0 : _a.call(w)) || ''); };
        const nonPreview = all.filter((w) => !isPreview(w));
        const focused = (_a = BW.getFocusedWindow) === null || _a === void 0 ? void 0 : _a.call(BW);
        if (focused && !focused.isDestroyed() && !isPreview(focused))
            return focused;
        if (nonPreview.length > 0)
            return nonPreview[0];
        return all[0];
    }
    ensureCaptureDir() {
        var _a;
        if (!Editor.Project || !Editor.Project.path) {
            return { ok: false, error: 'Editor.Project.path is not available; cannot resolve capture output directory.' };
        }
        const dir = path.join(Editor.Project.path, 'temp', 'mcp-captures');
        try {
            fs.mkdirSync(dir, { recursive: true });
            return { ok: true, dir };
        }
        catch (err) {
            return { ok: false, error: `Failed to create capture dir: ${(_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : String(err)}` };
        }
    }
    // v2.8.0 T-V28-2 (carryover from v2.7.0 Codex single-reviewer 🟡)
    // → v2.8.1 round-1 fix (Codex 🔴 + Claude 🟡): the v2.8.0 helper
    // realpath'd `dir` and `path.dirname(path.join(dir, basename))` and
    // compared the two — but with a fixed basename those expressions both
    // collapse to `dir`, making the equality check tautological. The check
    // protected nothing if `<project>/temp/mcp-captures` itself was a
    // symlink that escapes the project tree.
    //
    // True escape protection requires anchoring against the project root.
    // We now realpath BOTH the capture dir and `Editor.Project.path` and
    // require the resolved capture dir to be inside the resolved project
    // root (equality OR `realDir.startsWith(realProjectRoot + sep)`).
    // The intra-dir check is kept for cheap defense-in-depth in case a
    // future basename gets traversal characters threaded through.
    //
    // Returns { ok: true, filePath, dir } when safe to write, or
    // { ok: false, error } with the same error envelope shape as
    // ensureCaptureDir so callers can fall through their existing
    // error-return pattern.
    resolveAutoCaptureFile(basename) {
        var _a, _b, _c;
        const dirResult = this.ensureCaptureDir();
        if (!dirResult.ok)
            return { ok: false, error: dirResult.error };
        const projectPath = (_a = Editor === null || Editor === void 0 ? void 0 : Editor.Project) === null || _a === void 0 ? void 0 : _a.path;
        if (!projectPath) {
            return { ok: false, error: 'Editor.Project.path is not available; cannot anchor capture-dir containment check.' };
        }
        const filePath = path.join(dirResult.dir, basename);
        let realDir;
        let realParent;
        let realProjectRoot;
        try {
            const rp = fs.realpathSync;
            const resolveReal = (_b = rp.native) !== null && _b !== void 0 ? _b : rp;
            realDir = resolveReal(dirResult.dir);
            realParent = resolveReal(path.dirname(filePath));
            realProjectRoot = resolveReal(projectPath);
        }
        catch (err) {
            return { ok: false, error: `screenshot path realpath failed: ${(_c = err === null || err === void 0 ? void 0 : err.message) !== null && _c !== void 0 ? _c : String(err)}` };
        }
        // Defense-in-depth: parent of the resolved file must equal the
        // resolved capture dir (catches future basenames threading `..`).
        if (path.resolve(realParent) !== path.resolve(realDir)) {
            return { ok: false, error: 'screenshot save path resolved outside the capture directory' };
        }
        // Primary protection: capture dir itself must resolve inside the
        // project root, so a symlink chain on `temp/mcp-captures` cannot
        // pivot writes to e.g. /etc or C:\Windows.
        // v2.9.x polish (Codex r2 single-🟡 from v2.8.1 review): use
        // path.relative instead of `root + path.sep` prefix check —
        // when root is a drive root (`C:\`), path.resolve normalises it
        // to `C:\\` and `path.sep` adds another `\`, producing `C:\\\\`
        // which a candidate like `C:\\foo` does not match. path.relative
        // also handles the C:\foo vs C:\foobar prefix-collision case.
        if (!isPathWithinRoot(realDir, realProjectRoot)) {
            return { ok: false, error: `capture dir resolved outside the project root: ${path.resolve(realDir)} not within ${path.resolve(realProjectRoot)}` };
        }
        return { ok: true, filePath, dir: dirResult.dir };
    }
    // v2.8.1 round-1 fix (Gemini 🔴 + Codex 🟡): when caller passes an
    // explicit savePath / savePathPrefix, we still need the same project-
    // root containment guarantee that resolveAutoCaptureFile gives the
    // auto-named branch. AI-generated absolute paths could otherwise
    // write outside the project root.
    //
    // The check resolves the parent directory (the file itself may not
    // exist yet) and requires it to be inside `realpath(Editor.Project.path)`.
    assertSavePathWithinProject(savePath) {
        var _a, _b, _c, _d;
        const projectPath = (_a = Editor === null || Editor === void 0 ? void 0 : Editor.Project) === null || _a === void 0 ? void 0 : _a.path;
        if (!projectPath) {
            return { ok: false, error: 'Editor.Project.path is not available; cannot validate explicit savePath.' };
        }
        try {
            const rp = fs.realpathSync;
            const resolveReal = (_b = rp.native) !== null && _b !== void 0 ? _b : rp;
            const realProjectRoot = resolveReal(projectPath);
            // v2.8.2 retest fix (Codex r2 🟡 #1): a relative savePath would
            // make `path.dirname(savePath)` collapse to '.' and resolve to
            // the host process cwd (often `<editor-install>/CocosDashboard`)
            // rather than the project root. Anchor relative paths against
            // the project root explicitly so the AI's intuitive "relative
            // to my project" interpretation is what the check enforces.
            const absoluteSavePath = path.isAbsolute(savePath)
                ? savePath
                : path.resolve(projectPath, savePath);
            const parent = path.dirname(absoluteSavePath);
            // Parent must already exist for realpath; if it doesn't, the
            // write would fail anyway, but return a clearer error here.
            let realParent;
            try {
                realParent = resolveReal(parent);
            }
            catch (err) {
                return { ok: false, error: `savePath parent dir missing or unreadable: ${(_c = err === null || err === void 0 ? void 0 : err.message) !== null && _c !== void 0 ? _c : String(err)}` };
            }
            // v2.9.x polish (Codex r2 single-🟡 from v2.8.1 review): same
            // path.relative-based containment as resolveAutoCaptureFile.
            if (!isPathWithinRoot(realParent, realProjectRoot)) {
                return {
                    ok: false,
                    error: `savePath resolved outside the project root: ${path.resolve(realParent)} not within ${path.resolve(realProjectRoot)}. Use a path inside <project>/ or omit savePath to auto-name into <project>/temp/mcp-captures.`,
                };
            }
            return { ok: true, resolvedPath: absoluteSavePath };
        }
        catch (err) {
            return { ok: false, error: `savePath realpath failed: ${(_d = err === null || err === void 0 ? void 0 : err.message) !== null && _d !== void 0 ? _d : String(err)}` };
        }
    }
    async screenshot(savePath, windowTitle, includeBase64 = false) {
        var _a;
        try {
            let filePath = savePath;
            if (!filePath) {
                const resolved = this.resolveAutoCaptureFile(`screenshot-${Date.now()}.png`);
                if (!resolved.ok)
                    return { success: false, error: resolved.error };
                filePath = resolved.filePath;
            }
            else {
                // v2.8.1 round-1 fix (Gemini 🔴 + Codex 🟡): explicit savePath
                // also gets containment-checked. AI-generated paths could
                // otherwise write outside the project root.
                // v2.8.2 retest fix: use the helper's resolvedPath so a
                // relative savePath actually lands inside the project root.
                const guard = this.assertSavePathWithinProject(filePath);
                if (!guard.ok)
                    return { success: false, error: guard.error };
                filePath = guard.resolvedPath;
            }
            const win = this.pickWindow(windowTitle);
            const image = await win.webContents.capturePage();
            const png = image.toPNG();
            fs.writeFileSync(filePath, png);
            const data = {
                filePath,
                size: png.length,
                windowTitle: typeof win.getTitle === 'function' ? win.getTitle() : '',
            };
            if (includeBase64) {
                data.dataUri = `data:image/png;base64,${png.toString('base64')}`;
            }
            return { success: true, data, message: `Screenshot saved to ${filePath}` };
        }
        catch (err) {
            return { success: false, error: (_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : String(err) };
        }
    }
    // v2.7.0 #4: Preview-window screenshot.
    // v2.8.3 T-V283-1: extended to handle cocos embedded preview mode.
    //
    // Mode dispatch:
    //   - "window":   require a Preview-titled BrowserWindow; fail if none.
    //                 Original v2.7.0 behaviour. Use when cocos preview
    //                 config is "window" / "simulator" (separate window).
    //   - "embedded": skip the window probe and capture the main editor
    //                 BrowserWindow directly. Use when cocos preview config
    //                 is "embedded" (gameview renders inside main editor).
    //   - "auto":     try "window" first; if no Preview-titled window is
    //                 found, fall back to "embedded" and surface a hint
    //                 in the response message. Default — keeps the happy
    //                 path working without caller knowledge of cocos
    //                 preview config.
    //
    // Browser-mode (PIE rendered to user's external browser via
    // shell.openExternal) is NOT capturable here — the page lives in
    // a non-Electron browser process. AI can detect this via
    // debug_get_preview_mode and skip the call.
    async capturePreviewScreenshot(savePath, mode = 'auto', windowTitle = 'Preview', includeBase64 = false) {
        var _a, _b, _c;
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const electron = require('electron');
            const BW = electron.BrowserWindow;
            // Resolve the target window per mode.
            const probeWindowMode = () => {
                var _a, _b, _c, _d, _e, _f;
                // v2.7.1 review fix (claude 🟡 + codex 🟡): with the default
                // windowTitle='Preview' a Chinese / localized cocos editor
                // whose main window title contains "Preview" (e.g. "Cocos
                // Creator Preview - <ProjectName>") would falsely match.
                // Disambiguate by excluding any title that ALSO contains
                // "Cocos Creator" when the caller stuck with the default.
                const usingDefault = windowTitle === 'Preview';
                const allTitles = (_c = (_b = (_a = BW === null || BW === void 0 ? void 0 : BW.getAllWindows) === null || _a === void 0 ? void 0 : _a.call(BW)) === null || _b === void 0 ? void 0 : _b.map((w) => { var _a, _b; return (_b = (_a = w.getTitle) === null || _a === void 0 ? void 0 : _a.call(w)) !== null && _b !== void 0 ? _b : ''; }).filter(Boolean)) !== null && _c !== void 0 ? _c : [];
                const matches = (_f = (_e = (_d = BW === null || BW === void 0 ? void 0 : BW.getAllWindows) === null || _d === void 0 ? void 0 : _d.call(BW)) === null || _e === void 0 ? void 0 : _e.filter((w) => {
                    var _a;
                    if (!w || w.isDestroyed())
                        return false;
                    const title = ((_a = w.getTitle) === null || _a === void 0 ? void 0 : _a.call(w)) || '';
                    if (!title.includes(windowTitle))
                        return false;
                    if (usingDefault && /Cocos\s*Creator/i.test(title))
                        return false;
                    return true;
                })) !== null && _f !== void 0 ? _f : [];
                if (matches.length === 0) {
                    return { ok: false, error: `No Electron window title contains "${windowTitle}"${usingDefault ? ' (and is not the main editor)' : ''}.`, visibleTitles: allTitles };
                }
                return { ok: true, win: matches[0] };
            };
            const probeEmbeddedMode = () => {
                var _a, _b, _c;
                // Embedded PIE renders inside the main editor BrowserWindow.
                // Pick the same heuristic as pickWindow(): prefer a non-
                // Preview window. Cocos main editor's title typically
                // contains "Cocos Creator" — match that to identify it.
                const all = (_c = (_b = (_a = BW === null || BW === void 0 ? void 0 : BW.getAllWindows) === null || _a === void 0 ? void 0 : _a.call(BW)) === null || _b === void 0 ? void 0 : _b.filter((w) => w && !w.isDestroyed())) !== null && _c !== void 0 ? _c : [];
                if (all.length === 0) {
                    return { ok: false, error: 'No live Electron windows available; cannot capture embedded preview.' };
                }
                // Prefer the editor main window (title contains "Cocos
                // Creator") — that's where embedded PIE renders.
                const editor = all.find((w) => { var _a; return /Cocos\s*Creator/i.test(((_a = w.getTitle) === null || _a === void 0 ? void 0 : _a.call(w)) || ''); });
                if (editor)
                    return { ok: true, win: editor };
                // Fallback: any non-DevTools / non-Worker / non-Blank window.
                const candidate = all.find((w) => {
                    var _a;
                    const t = ((_a = w.getTitle) === null || _a === void 0 ? void 0 : _a.call(w)) || '';
                    return t && !/DevTools|Worker -|^Blank$/.test(t);
                });
                if (candidate)
                    return { ok: true, win: candidate };
                return { ok: false, error: 'No suitable editor window found for embedded preview capture.' };
            };
            let win = null;
            let captureNote = null;
            let resolvedMode = 'window';
            if (mode === 'window') {
                const r = probeWindowMode();
                if (!r.ok) {
                    return {
                        success: false,
                        error: `${r.error} Launch cocos preview first via the toolbar play button or via debug_preview_url(action="open"). If your cocos preview is set to "embedded", call this tool with mode="embedded" or mode="auto". Visible window titles: ${r.visibleTitles.join(', ') || '(none)'}`,
                    };
                }
                win = r.win;
                resolvedMode = 'window';
            }
            else if (mode === 'embedded') {
                const r = probeEmbeddedMode();
                if (!r.ok)
                    return { success: false, error: r.error };
                win = r.win;
                resolvedMode = 'embedded';
            }
            else {
                // auto
                const wr = probeWindowMode();
                if (wr.ok) {
                    win = wr.win;
                    resolvedMode = 'window';
                }
                else {
                    const er = probeEmbeddedMode();
                    if (!er.ok) {
                        return {
                            success: false,
                            error: `${wr.error} ${er.error} Launch cocos preview first or check debug_get_preview_mode to see how cocos is configured. Visible window titles: ${wr.visibleTitles.join(', ') || '(none)'}`,
                        };
                    }
                    win = er.win;
                    resolvedMode = 'embedded';
                    // v2.8.4 retest finding: when cocos preview is set
                    // to "browser", auto-fallback ALSO grabs the main
                    // editor window (because no Preview-titled window
                    // exists) — but in browser mode the actual gameview
                    // lives in the user's external browser, NOT in the
                    // captured Electron window. Don't claim "embedded
                    // preview mode" — that's a guess, and wrong when
                    // user is on browser config. Probe the real config
                    // and tailor the hint per mode.
                    let actualMode = null;
                    try {
                        const cfg = await Editor.Message.request('preferences', 'query-config', 'preview');
                        const platform = (_b = (_a = cfg === null || cfg === void 0 ? void 0 : cfg.preview) === null || _a === void 0 ? void 0 : _a.current) === null || _b === void 0 ? void 0 : _b.platform;
                        if (typeof platform === 'string')
                            actualMode = platform;
                    }
                    catch (_d) {
                        // best-effort; fall through with neutral hint
                    }
                    if (actualMode === 'browser') {
                        captureNote = 'No Preview-titled window found; captured the main editor window. NOTE: cocos preview is set to "browser" — the actual preview content is rendered in your external browser (NOT in this image). For runtime canvas capture in browser mode use debug_game_command(type="screenshot") via a GameDebugClient running on the browser preview page.';
                    }
                    else if (actualMode === 'gameView') {
                        captureNote = 'No Preview-titled window found; captured the main editor window (cocos preview is set to "gameView" embedded — the editor gameview IS where preview renders, so this image is correct).';
                    }
                    else if (actualMode) {
                        captureNote = `No Preview-titled window found; captured the main editor window. cocos preview is set to "${actualMode}" — verify this image actually contains the gameview you wanted; for runtime canvas capture prefer debug_game_command via GameDebugClient.`;
                    }
                    else {
                        captureNote = 'No Preview-titled window found; captured the main editor window. Could not determine cocos preview mode (debug_get_preview_mode might give more info). If your cocos preview is set to "browser", the actual preview content is in your external browser and is NOT in this image.';
                    }
                }
            }
            let filePath = savePath;
            if (!filePath) {
                const resolved = this.resolveAutoCaptureFile(`preview-${Date.now()}.png`);
                if (!resolved.ok)
                    return { success: false, error: resolved.error };
                filePath = resolved.filePath;
            }
            else {
                // v2.8.1 round-1 fix (Gemini 🔴 + Codex 🟡): explicit savePath
                // also gets containment-checked.
                // v2.8.2 retest fix: use resolvedPath for relative-path support.
                const guard = this.assertSavePathWithinProject(filePath);
                if (!guard.ok)
                    return { success: false, error: guard.error };
                filePath = guard.resolvedPath;
            }
            const image = await win.webContents.capturePage();
            const png = image.toPNG();
            fs.writeFileSync(filePath, png);
            const data = {
                filePath,
                size: png.length,
                windowTitle: typeof win.getTitle === 'function' ? win.getTitle() : '',
                mode: resolvedMode,
            };
            if (captureNote)
                data.note = captureNote;
            if (includeBase64) {
                data.dataUri = `data:image/png;base64,${png.toString('base64')}`;
            }
            const message = captureNote
                ? `Preview screenshot saved to ${filePath} (${captureNote})`
                : `Preview screenshot saved to ${filePath} (mode=${resolvedMode})`;
            return { success: true, data, message };
        }
        catch (err) {
            return { success: false, error: (_c = err === null || err === void 0 ? void 0 : err.message) !== null && _c !== void 0 ? _c : String(err) };
        }
    }
    // v2.8.3 T-V283-2: read cocos preview config so AI can route
    // capture_preview_screenshot to the correct mode without guessing.
    // Reads via Editor.Message preferences/query-config (typed in
    // node_modules/@cocos/creator-types/.../preferences/@types/message.d.ts).
    //
    // We dump the full 'preview' category, then try to interpret a few
    // common keys ('open_preview_with', 'preview_with', 'simulator',
    // 'browser') into a normalized mode label. If interpretation fails,
    // we still return the raw config so the AI can read it directly.
    async getPreviewMode() {
        var _a;
        try {
            // Probe at module level (no key) to get the whole category.
            const raw = await Editor.Message.request('preferences', 'query-config', 'preview');
            if (raw === undefined || raw === null) {
                return {
                    success: false,
                    error: 'preferences/query-config returned null for "preview" — cocos may not expose this category, or your build differs from 3.8.x.',
                };
            }
            // Heuristic interpretation.
            // v2.8.3 retest finding: cocos 3.8.7 actually stores the
            // active mode at `preview.current.platform` with value
            // `"gameView"` (embedded), `"browser"`, or device names
            // (simulator). The original heuristic only checked keys like
            // `open_preview_with` / `preview_with` / `open_with` / `mode`
            // and missed the live key. Probe `current.platform` first;
            // keep the legacy keys as fallback for older cocos versions.
            const lower = (s) => (typeof s === 'string' ? s.toLowerCase() : '');
            let interpreted = 'unknown';
            let interpretedFromKey = null;
            const classify = (v) => {
                const lv = lower(v);
                if (lv.includes('browser'))
                    return 'browser';
                if (lv.includes('simulator'))
                    return 'simulator';
                if (lv.includes('embed') || lv.includes('gameview') || lv.includes('game_view'))
                    return 'embedded';
                if (lv.includes('window'))
                    return 'window';
                return null;
            };
            const dig = (obj, path) => {
                if (!obj || typeof obj !== 'object')
                    return undefined;
                const parts = path.split('.');
                let cur = obj;
                for (const p of parts) {
                    if (!cur || typeof cur !== 'object')
                        return undefined;
                    if (p in cur) {
                        cur = cur[p];
                        continue;
                    }
                    // Try one level of nest (sometimes the category dump
                    // nests under a default-protocol bucket).
                    let found = false;
                    for (const v of Object.values(cur)) {
                        if (v && typeof v === 'object' && p in v) {
                            cur = v[p];
                            found = true;
                            break;
                        }
                    }
                    if (!found)
                        return undefined;
                }
                return cur;
            };
            const probeKeys = [
                'preview.current.platform',
                'current.platform',
                'preview.open_preview_with',
                'open_preview_with',
                'preview_with',
                'open_with',
                'mode',
            ];
            for (const k of probeKeys) {
                const v = dig(raw, k);
                if (typeof v === 'string') {
                    const cls = classify(v);
                    if (cls) {
                        interpreted = cls;
                        interpretedFromKey = `${k}=${v}`;
                        break;
                    }
                    // Non-empty string that didn't match a known label →
                    // record as 'simulator' candidate if it looks like a
                    // device name (e.g. "Apple iPhone 14 Pro"), otherwise
                    // keep searching.
                    if (/iPhone|iPad|HUAWEI|Xiaomi|Sony|Asus|OPPO|Honor|Nokia|Lenovo|Samsung|Google|Pixel/i.test(v)) {
                        interpreted = 'simulator';
                        interpretedFromKey = `${k}=${v}`;
                        break;
                    }
                }
            }
            return {
                success: true,
                data: { interpreted, interpretedFromKey, raw },
                message: interpreted === 'unknown'
                    ? 'Read cocos preview config but could not interpret a mode label; inspect data.raw and pass mode= explicitly to capture_preview_screenshot.'
                    : `cocos preview is configured as "${interpreted}" (from key "${interpretedFromKey}"). Pass mode="${interpreted === 'browser' ? 'window' : interpreted}" to capture_preview_screenshot, or rely on mode="auto".`,
            };
        }
        catch (err) {
            return { success: false, error: `preferences/query-config 'preview' failed: ${(_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : String(err)}` };
        }
    }
    // v2.9.0 T-V29-2: counterpart to getPreviewMode. Writes
    // preview.current.platform via the typed
    // Editor.Message.request('preferences', 'set-config', ...) channel.
    //
    // v2.9.0 retest fix: the initial implementation passed
    // ('preview', 'current.platform', value) and returned success but
    // the write did NOT take effect — cocos's set-config doesn't seem
    // to support dot-path keys. Strategies tried in order:
    //   1. ('preview', 'current', { platform: value })  — nested object
    //   2. ('preview', 'current.platform', value, 'global') — explicit protocol
    //   3. ('preview', 'current.platform', value, 'local')  — explicit protocol
    //   4. ('preview', 'current.platform', value)          — no protocol (original)
    // Each attempt is followed by a fresh query-config to verify the
    // value actually flipped. We return the strategy that worked plus
    // the raw set-config return for diagnostics.
    //
    // Confirm gate: `confirm=false` (default) is a dry-run that returns
    // the current value + suggested call. `confirm=true` actually
    // writes. This avoids AI-induced preference drift when the LLM is
    // exploring tool capabilities.
    async setPreviewMode(mode, confirm) {
        var _a, _b;
        try {
            const queryCurrent = async () => {
                var _a, _b, _c;
                const cfg = await Editor.Message.request('preferences', 'query-config', 'preview');
                return (_c = (_b = (_a = cfg === null || cfg === void 0 ? void 0 : cfg.preview) === null || _a === void 0 ? void 0 : _a.current) === null || _b === void 0 ? void 0 : _b.platform) !== null && _c !== void 0 ? _c : null;
            };
            const previousMode = await queryCurrent();
            if (!confirm) {
                return {
                    success: true,
                    data: { previousMode, requestedMode: mode, confirmed: false },
                    message: `Dry run only — current cocos preview mode is "${previousMode !== null && previousMode !== void 0 ? previousMode : 'unknown'}", requested "${mode}". Re-call with confirm=true to actually switch. Caller is responsible for restoring the original mode when done if appropriate.`,
                };
            }
            if (previousMode === mode) {
                return {
                    success: true,
                    data: { previousMode, newMode: mode, confirmed: true, noOp: true },
                    message: `cocos preview already set to "${mode}"; no change applied.`,
                };
            }
            const strategies = [
                {
                    id: "set-config('preview','current',{platform:value})",
                    payload: () => Editor.Message.request('preferences', 'set-config', 'preview', 'current', { platform: mode }),
                },
                {
                    id: "set-config('preview','current.platform',value,'global')",
                    payload: () => Editor.Message.request('preferences', 'set-config', 'preview', 'current.platform', mode, 'global'),
                },
                {
                    id: "set-config('preview','current.platform',value,'local')",
                    payload: () => Editor.Message.request('preferences', 'set-config', 'preview', 'current.platform', mode, 'local'),
                },
                {
                    id: "set-config('preview','current.platform',value)",
                    payload: () => Editor.Message.request('preferences', 'set-config', 'preview', 'current.platform', mode),
                },
            ];
            const attempts = [];
            let winner = null;
            for (const s of strategies) {
                let setResult = undefined;
                let error;
                try {
                    setResult = await s.payload();
                }
                catch (err) {
                    error = (_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : String(err);
                }
                const observedMode = await queryCurrent();
                const matched = observedMode === mode;
                attempts.push({ strategy: s.id, setResult, observedMode, matched, error });
                if (matched) {
                    winner = attempts[attempts.length - 1];
                    break;
                }
            }
            if (!winner) {
                return {
                    success: false,
                    error: `set-config strategies all failed to flip preview.current.platform from "${previousMode !== null && previousMode !== void 0 ? previousMode : 'unknown'}" to "${mode}". Tried 4 shapes; cocos returned values but the read-back never matched the requested mode. The set-config channel may have changed in this cocos build; switch via the cocos preview dropdown manually for now and report which shape works.`,
                    data: { previousMode, requestedMode: mode, attempts },
                };
            }
            return {
                success: true,
                data: { previousMode, newMode: mode, confirmed: true, strategy: winner.strategy, attempts },
                message: `cocos preview switched: "${previousMode !== null && previousMode !== void 0 ? previousMode : 'unknown'}" → "${mode}" via ${winner.strategy}. Restore via debug_set_preview_mode(mode="${previousMode !== null && previousMode !== void 0 ? previousMode : 'browser'}", confirm=true) when done if needed.`,
            };
        }
        catch (err) {
            return { success: false, error: `preferences/set-config 'preview' failed: ${(_b = err === null || err === void 0 ? void 0 : err.message) !== null && _b !== void 0 ? _b : String(err)}` };
        }
    }
    async batchScreenshot(savePathPrefix, delaysMs = [0], windowTitle) {
        var _a;
        try {
            let prefix = savePathPrefix;
            if (!prefix) {
                // basename is the prefix stem; per-iteration files extend it
                // with `-${i}.png`. Containment check on the prefix path is
                // sufficient because path.join preserves dirname for any
                // suffix the loop appends.
                const resolved = this.resolveAutoCaptureFile(`batch-${Date.now()}`);
                if (!resolved.ok)
                    return { success: false, error: resolved.error };
                prefix = resolved.filePath;
            }
            else {
                // v2.8.1 round-1 fix (Gemini 🔴 + Codex 🟡): explicit prefix
                // also gets containment-checked. We check the prefix path
                // itself — every emitted file lives in the same dirname.
                // v2.8.2 retest fix: use resolvedPath for relative-prefix support.
                const guard = this.assertSavePathWithinProject(prefix);
                if (!guard.ok)
                    return { success: false, error: guard.error };
                prefix = guard.resolvedPath;
            }
            const win = this.pickWindow(windowTitle);
            const captures = [];
            for (let i = 0; i < delaysMs.length; i++) {
                const delay = delaysMs[i];
                if (delay > 0) {
                    await new Promise(r => setTimeout(r, delay));
                }
                const filePath = `${prefix}-${i}.png`;
                const image = await win.webContents.capturePage();
                const png = image.toPNG();
                fs.writeFileSync(filePath, png);
                captures.push({ index: i, delayMs: delay, filePath, size: png.length });
            }
            return {
                success: true,
                data: {
                    count: captures.length,
                    windowTitle: typeof win.getTitle === 'function' ? win.getTitle() : '',
                    captures,
                },
                message: `Captured ${captures.length} screenshots`,
            };
        }
        catch (err) {
            return { success: false, error: (_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : String(err) };
        }
    }
    // v2.7.0 #3: preview-url / query-devices handlers ---------------------
    async previewUrl(action = 'query') {
        var _a, _b;
        try {
            const url = await Editor.Message.request('preview', 'query-preview-url');
            if (!url || typeof url !== 'string') {
                return { success: false, error: 'preview/query-preview-url returned empty result; check that cocos preview server is running' };
            }
            const data = { url };
            if (action === 'open') {
                try {
                    // Lazy require so smoke / non-Electron contexts don't fault
                    // on missing electron.
                    // eslint-disable-next-line @typescript-eslint/no-var-requires
                    const electron = require('electron');
                    // v2.7.1 review fix (codex 🟡 + gemini 🟡): openExternal
                    // resolves when the OS launcher is invoked, not when the
                    // page renders. Use "launch" wording to avoid the AI
                    // misreading "opened" as a confirmed page-load.
                    await electron.shell.openExternal(url);
                    data.launched = true;
                }
                catch (err) {
                    data.launched = false;
                    data.launchError = (_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : String(err);
                }
            }
            // Reflect actual launch outcome in the top-level message so AI
            // sees "launch failed" instead of misleading "Opened ..." when
            // openExternal threw (gemini 🟡).
            const message = action === 'open'
                ? (data.launched
                    ? `Launched ${url} in default browser (page render not awaited)`
                    : `Returned URL ${url} but launch failed: ${data.launchError}`)
                : url;
            return { success: true, data, message };
        }
        catch (err) {
            return { success: false, error: (_b = err === null || err === void 0 ? void 0 : err.message) !== null && _b !== void 0 ? _b : String(err) };
        }
    }
    // v2.8.0 T-V28-3: PIE play / stop. Routes through scene-script so the
    // typed cce.SceneFacade.changePreviewPlayState is reached via the
    // documented execute-scene-script channel.
    //
    // v2.8.3 T-V283-3 retest finding: cocos sometimes logs
    // "Failed to refresh the current scene" inside changePreviewPlayState
    // even when the call returns without throwing. Observed in cocos
    // 3.8.7 / embedded preview mode. The root cause is unclear (may
    // relate to cumulative scene-dirty / embedded-mode timing /
    // initial-load complaint), but the visible effect is that PIE state
    // changes incompletely. We now SCAN the captured scene-script logs
    // for that error string and surface it to the AI as a structured
    // warning instead of letting it hide inside data.capturedLogs.
    // v2.9.0 T-V29-1: editor-health probe. Detects scene-script freeze
    // by running two probes in parallel:
    //   - host probe: Editor.Message.request('device', 'query') — goes
    //     to the editor main process, NOT the scene-script renderer.
    //     This stays responsive even when scene is wedged.
    //   - scene probe: execute-scene-script invocation with a trivial
    //     `evalEcho` test (uses an existing safe scene method, with
    //     wrapping timeout). Times out → scene-script frozen.
    //
    // Designed for the post-preview_control(start) freeze pattern in
    // landmine #16: AI calls preview_control(start), then
    // check_editor_health, and if sceneAlive=false stops issuing more
    // scene calls and surfaces the recovery hint instead of hanging.
    async checkEditorHealth(sceneTimeoutMs = 1500) {
        var _a, _b;
        const t0 = Date.now();
        // Host probe — should always resolve fast.
        let hostAlive = false;
        let hostError = null;
        try {
            await Editor.Message.request('device', 'query');
            hostAlive = true;
        }
        catch (err) {
            hostError = (_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : String(err);
        }
        // Scene probe — wrap in a hard timeout. We deliberately pick a
        // method that exists on the scene-script side AND does the
        // minimum work: getCurrentSceneInfo just reads director state.
        const scenePromise = (0, scene_bridge_1.runSceneMethodAsToolResponse)('getCurrentSceneInfo', [], { capture: false });
        const timeoutPromise = new Promise(resolve => setTimeout(() => resolve({ timedOut: true }), sceneTimeoutMs));
        const sceneStart = Date.now();
        const sceneResult = await Promise.race([scenePromise, timeoutPromise]);
        const sceneLatencyMs = Date.now() - sceneStart;
        const sceneAlive = !!sceneResult && !sceneResult.timedOut && sceneResult.success !== false;
        let sceneError = null;
        if (sceneResult === null || sceneResult === void 0 ? void 0 : sceneResult.timedOut) {
            sceneError = `scene-script probe timed out after ${sceneTimeoutMs}ms — scene renderer likely frozen`;
        }
        else if ((sceneResult === null || sceneResult === void 0 ? void 0 : sceneResult.success) === false) {
            sceneError = (_b = sceneResult.error) !== null && _b !== void 0 ? _b : 'scene-script probe returned success=false';
        }
        const suggestion = !hostAlive
            ? 'cocos editor host process unresponsive — verify the editor is running and the cocos-mcp-server extension is loaded.'
            : !sceneAlive
                ? 'cocos editor scene-script is frozen (likely landmine #16 after preview_control(start)). Press Ctrl+R in the cocos editor to reload the scene-script renderer; do not issue more scene/* tool calls until recovered.'
                : 'editor healthy; scene-script and host both responsive.';
        return {
            success: true,
            data: {
                hostAlive,
                sceneAlive,
                sceneLatencyMs,
                sceneTimeoutMs,
                hostError,
                sceneError,
                totalProbeMs: Date.now() - t0,
            },
            message: suggestion,
        };
    }
    async previewControl(op, acknowledgeFreezeRisk = false) {
        // v2.9.x park gate: op="start" is known to freeze cocos 3.8.7
        // (landmine #16). Refuse unless the caller has explicitly
        // acknowledged the risk. op="stop" is always safe — bypass the
        // gate so callers can recover from a half-applied state.
        if (op === 'start' && !acknowledgeFreezeRisk) {
            return {
                success: false,
                error: 'debug_preview_control(op="start") is parked due to landmine #16 — the cocos 3.8.7 softReloadScene race freezes the editor regardless of preview mode (verified embedded + browser). To proceed anyway, re-call with acknowledgeFreezeRisk=true AND ensure the human user is prepared to press Ctrl+R in cocos if the editor freezes. **Strongly preferred alternatives**: (a) debug_capture_preview_screenshot(mode="embedded") in EDIT mode (no PIE needed); (b) debug_game_command(type="screenshot") via GameDebugClient on browser preview. Pending v2.9 reference-project comparison.',
            };
        }
        if (DebugTools.previewControlInFlight) {
            return {
                success: false,
                error: 'Another debug_preview_control call is already in flight. PIE state changes go through cocos\' SceneFacadeFSM and double-firing during the in-flight window risks compounding the landmine #16 freeze. Wait for the previous call to resolve, then retry.',
            };
        }
        DebugTools.previewControlInFlight = true;
        try {
            return await this.previewControlInner(op);
        }
        finally {
            DebugTools.previewControlInFlight = false;
        }
    }
    async previewControlInner(op) {
        var _a, _b;
        const state = op === 'start';
        const result = await (0, scene_bridge_1.runSceneMethodAsToolResponse)('changePreviewPlayState', [state]);
        if (result.success) {
            // Scan capturedLogs for the known cocos warning so AI
            // doesn't get a misleading bare-success envelope.
            const captured = result.capturedLogs;
            const sceneRefreshError = captured === null || captured === void 0 ? void 0 : captured.find(e => { var _a; return (e === null || e === void 0 ? void 0 : e.level) === 'error' && /Failed to refresh the current scene/i.test((_a = e === null || e === void 0 ? void 0 : e.message) !== null && _a !== void 0 ? _a : ''); });
            const warnings = [];
            if (sceneRefreshError) {
                warnings.push('cocos engine threw "Failed to refresh the current scene" inside softReloadScene during PIE state change. This is a cocos 3.8.7 race fired by changePreviewPlayState itself, not gated by preview mode (verified in both embedded and browser modes — see CLAUDE.md landmine #16). PIE has NOT actually started and the cocos editor may freeze (spinning indicator) requiring the human user to press Ctrl+R to recover. **Recommended alternatives**: (a) debug_capture_preview_screenshot(mode="embedded") in EDIT mode — captures the editor gameview without starting PIE; (b) debug_game_command(type="screenshot") via GameDebugClient running on browser preview (debug_preview_url(action="open")) — uses runtime canvas, bypasses the engine race entirely. Do NOT retry preview_control(start) — it will not help and may compound the freeze.');
            }
            const baseMessage = state
                ? 'Entered Preview-in-Editor play mode (PIE may take a moment to appear; mode depends on cocos preview config — see debug_get_preview_mode)'
                : 'Exited Preview-in-Editor play mode';
            return Object.assign(Object.assign(Object.assign({}, result), (warnings.length > 0 ? { data: Object.assign(Object.assign({}, ((_a = result.data) !== null && _a !== void 0 ? _a : {})), { warnings }) } : {})), { message: warnings.length > 0
                    ? `${baseMessage}. ⚠ ${warnings.join(' ')}`
                    : baseMessage });
        }
        // v2.9.x polish (Claude r1 single-🟡 from v2.8.1 review):
        // failure-branch was returning the bridge's envelope verbatim
        // without a message field, while success branch carried a clear
        // message. Add a symmetric message so streaming AI clients see
        // a consistent envelope shape on both paths.
        return Object.assign(Object.assign({}, result), { message: (_b = result.message) !== null && _b !== void 0 ? _b : `Failed to ${op} Preview-in-Editor play mode — see error.` });
    }
    async queryDevices() {
        var _a;
        try {
            const devices = await Editor.Message.request('device', 'query');
            return { success: true, data: { devices: Array.isArray(devices) ? devices : [], count: Array.isArray(devices) ? devices.length : 0 } };
        }
        catch (err) {
            return { success: false, error: (_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : String(err) };
        }
    }
    // v2.6.0 T-V26-1: GameDebugClient bridge handlers ---------------------
    async gameCommand(type, args, timeoutMs = 10000) {
        var _a;
        const queued = (0, game_command_queue_1.queueGameCommand)(type, args);
        if (!queued.ok) {
            return { success: false, error: queued.error };
        }
        const awaited = await (0, game_command_queue_1.awaitCommandResult)(queued.id, timeoutMs);
        if (!awaited.ok) {
            return { success: false, error: awaited.error };
        }
        const result = awaited.result;
        if (result.success === false) {
            return { success: false, error: (_a = result.error) !== null && _a !== void 0 ? _a : 'GameDebugClient reported failure', data: result.data };
        }
        // Built-in screenshot path: client sends back a base64 dataUrl;
        // landing the bytes to disk on host side keeps the result envelope
        // small and reuses the existing project-rooted capture dir guard.
        if (type === 'screenshot' && result.data && typeof result.data.dataUrl === 'string') {
            const persisted = this.persistGameScreenshot(result.data.dataUrl, result.data.width, result.data.height);
            if (!persisted.ok) {
                return { success: false, error: persisted.error };
            }
            return {
                success: true,
                data: {
                    type,
                    filePath: persisted.filePath,
                    size: persisted.size,
                    width: result.data.width,
                    height: result.data.height,
                },
                message: `Game canvas captured to ${persisted.filePath}`,
            };
        }
        return { success: true, data: Object.assign({ type }, result.data), message: `Game command ${type} ok` };
    }
    async gameClientStatus() {
        return { success: true, data: (0, game_command_queue_1.getClientStatus)() };
    }
    persistGameScreenshot(dataUrl, _width, _height) {
        const m = /^data:image\/(png|jpeg|webp);base64,(.*)$/i.exec(dataUrl);
        if (!m) {
            return { ok: false, error: 'GameDebugClient returned screenshot dataUrl in unexpected format (expected data:image/{png|jpeg|webp};base64,...)' };
        }
        // base64-decoded byte count = ~ceil(b64Len * 3 / 4); reject early
        // before allocating a multi-GB Buffer.
        const b64Len = m[2].length;
        const approxBytes = Math.ceil(b64Len * 3 / 4);
        if (approxBytes > DebugTools.MAX_GAME_SCREENSHOT_BYTES) {
            return { ok: false, error: `screenshot payload too large: ~${approxBytes} bytes exceeds cap ${DebugTools.MAX_GAME_SCREENSHOT_BYTES}` };
        }
        const ext = m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase();
        const buf = Buffer.from(m[2], 'base64');
        if (buf.length > DebugTools.MAX_GAME_SCREENSHOT_BYTES) {
            return { ok: false, error: `screenshot payload too large after decode: ${buf.length} bytes exceeds cap ${DebugTools.MAX_GAME_SCREENSHOT_BYTES}` };
        }
        // v2.6.1 review fix (claude M2 + codex 🟡 + gemini 🟡): realpath both
        // sides for a true containment check. v2.8.0 T-V28-2 hoisted this
        // pattern into resolveAutoCaptureFile() so screenshot() / capture-
        // preview / batch-screenshot / persist-game share one implementation.
        const resolved = this.resolveAutoCaptureFile(`game-${Date.now()}.${ext}`);
        if (!resolved.ok)
            return { ok: false, error: resolved.error };
        fs.writeFileSync(resolved.filePath, buf);
        return { ok: true, filePath: resolved.filePath, size: buf.length };
    }
    // v2.4.8 A1: TS diagnostics handlers ----------------------------------
    async waitCompile(timeoutMs = 15000) {
        var _a, _b, _c, _d;
        try {
            const projectPath = (_a = Editor === null || Editor === void 0 ? void 0 : Editor.Project) === null || _a === void 0 ? void 0 : _a.path;
            if (!projectPath) {
                return { success: false, error: 'wait_compile: editor context unavailable (no Editor.Project.path)' };
            }
            const result = await (0, ts_diagnostics_1.waitForCompile)(projectPath, timeoutMs);
            if (!result.success) {
                return { success: false, error: (_b = result.error) !== null && _b !== void 0 ? _b : 'wait_compile failed', data: result };
            }
            return {
                success: true,
                message: result.compiled
                    ? `Compile finished in ${result.waitedMs}ms`
                    : ((_c = result.note) !== null && _c !== void 0 ? _c : 'No compile triggered or timed out'),
                data: result,
            };
        }
        catch (err) {
            return { success: false, error: (_d = err === null || err === void 0 ? void 0 : err.message) !== null && _d !== void 0 ? _d : String(err) };
        }
    }
    async runScriptDiagnostics(tsconfigPath) {
        var _a, _b;
        try {
            const projectPath = (_a = Editor === null || Editor === void 0 ? void 0 : Editor.Project) === null || _a === void 0 ? void 0 : _a.path;
            if (!projectPath) {
                return { success: false, error: 'run_script_diagnostics: editor context unavailable (no Editor.Project.path)' };
            }
            const result = await (0, ts_diagnostics_1.runScriptDiagnostics)(projectPath, { tsconfigPath });
            return {
                success: result.ok,
                message: result.summary,
                data: {
                    tool: result.tool,
                    binary: result.binary,
                    tsconfigPath: result.tsconfigPath,
                    exitCode: result.exitCode,
                    diagnostics: result.diagnostics,
                    diagnosticCount: result.diagnostics.length,
                    // v2.4.9 review fix: spawn failures (binary missing /
                    // permission denied) surfaced explicitly so AI can
                    // distinguish "tsc never ran" from "tsc found errors".
                    spawnFailed: result.spawnFailed === true,
                    systemError: result.systemError,
                    // Truncate raw streams to keep tool result reasonable;
                    // full content rarely useful when the parser already
                    // structured the errors.
                    stdoutTail: result.stdout.slice(-2000),
                    stderrTail: result.stderr.slice(-2000),
                },
            };
        }
        catch (err) {
            return { success: false, error: (_b = err === null || err === void 0 ? void 0 : err.message) !== null && _b !== void 0 ? _b : String(err) };
        }
    }
    async getScriptDiagnosticContext(file, line, contextLines = 5) {
        var _a, _b;
        try {
            const projectPath = (_a = Editor === null || Editor === void 0 ? void 0 : Editor.Project) === null || _a === void 0 ? void 0 : _a.path;
            if (!projectPath) {
                return { success: false, error: 'get_script_diagnostic_context: editor context unavailable' };
            }
            // v2.9.x polish (Gemini r2 single-🟡 from v2.8.1 review): converge
            // on assertSavePathWithinProject. The previous bespoke realpath
            // + toLowerCase + path.sep check is functionally subsumed by the
            // shared helper (which itself moved to the path.relative-based
            // isPathWithinRoot in v2.9.x polish #1, handling drive-root and
            // prefix-collision edges uniformly).
            const guard = this.assertSavePathWithinProject(file);
            if (!guard.ok) {
                return { success: false, error: `get_script_diagnostic_context: ${guard.error}` };
            }
            const resolved = guard.resolvedPath;
            if (!fs.existsSync(resolved)) {
                return { success: false, error: `get_script_diagnostic_context: file not found: ${resolved}` };
            }
            const stat = fs.statSync(resolved);
            if (stat.size > 5 * 1024 * 1024) {
                return { success: false, error: `get_script_diagnostic_context: file too large (${stat.size} bytes); refusing to read.` };
            }
            const content = fs.readFileSync(resolved, 'utf8');
            const allLines = content.split(/\r?\n/);
            if (line < 1 || line > allLines.length) {
                return {
                    success: false,
                    error: `get_script_diagnostic_context: line ${line} out of range 1..${allLines.length}`,
                };
            }
            const start = Math.max(1, line - contextLines);
            const end = Math.min(allLines.length, line + contextLines);
            const window = allLines.slice(start - 1, end);
            const projectResolvedNorm = path.resolve(projectPath);
            return {
                success: true,
                message: `Read ${window.length} lines of context around ${path.relative(projectResolvedNorm, resolved)}:${line}`,
                data: {
                    file: path.relative(projectResolvedNorm, resolved),
                    absolutePath: resolved,
                    targetLine: line,
                    startLine: start,
                    endLine: end,
                    totalLines: allLines.length,
                    lines: window.map((text, i) => ({ line: start + i, text })),
                },
            };
        }
        catch (err) {
            return { success: false, error: (_b = err === null || err === void 0 ? void 0 : err.message) !== null && _b !== void 0 ? _b : String(err) };
        }
    }
}
exports.DebugTools = DebugTools;
// v2.9.x polish (Codex r1 single-🟡 from v2.8.1 review): module-level
// in-flight guard prevents AI workflows from firing two PIE state
// changes concurrently. The cocos engine race in landmine #16 makes
// double-fire particularly dangerous — the second call would hit
// a partially-initialised PreviewSceneFacade. Reject overlap.
DebugTools.previewControlInFlight = false;
// v2.6.1 review fix (codex 🔴 + claude W1): bound the legitimate range
// of a screenshot payload before decoding so a misbehaving / malicious
// client cannot fill disk by streaming arbitrary base64 bytes.
// 32 MB matches the global request-body cap in mcp-server-sdk.ts so
// the body would already 413 before reaching here, but a
// belt-and-braces check stays cheap.
DebugTools.MAX_GAME_SCREENSHOT_BYTES = 32 * 1024 * 1024;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWctdG9vbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvdG9vbHMvZGVidWctdG9vbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUEsd0RBQWtFO0FBQ2xFLDBDQUFrQztBQUNsQyxzREFBMkQ7QUFDM0QsMERBQTZFO0FBQzdFLGtFQUFrRztBQUNsRyxzREFBbUU7QUFDbkUsdUNBQXlCO0FBQ3pCLDJDQUE2QjtBQUU3QixrRUFBa0U7QUFDbEUsd0VBQXdFO0FBQ3hFLHlFQUF5RTtBQUN6RSxrRUFBa0U7QUFDbEUsaUNBQWlDO0FBQ2pDLEVBQUU7QUFDRixrRUFBa0U7QUFDbEUsbUVBQW1FO0FBQ25FLDZEQUE2RDtBQUM3RCxrRUFBa0U7QUFDbEUscUVBQXFFO0FBQ3JFLHNFQUFzRTtBQUN0RSxtRUFBbUU7QUFDbkUsOERBQThEO0FBQzlELG1FQUFtRTtBQUNuRSw4REFBOEQ7QUFDOUQsNENBQTRDO0FBQzVDLFNBQVMsZ0JBQWdCLENBQUMsU0FBaUIsRUFBRSxJQUFZO0lBQ3JELE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDeEMsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNuQyxJQUFJLE9BQU8sS0FBSyxPQUFPO1FBQUUsT0FBTyxJQUFJLENBQUM7SUFDckMsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFDNUMsSUFBSSxDQUFDLEdBQUc7UUFBRSxPQUFPLElBQUksQ0FBQyxDQUF5QixZQUFZO0lBQzNELElBQUksR0FBRyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUM7UUFBRSxPQUFPLEtBQUssQ0FBQyxDQUFRLGVBQWU7SUFDOUQsSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLEdB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QUssRUFBRSxNQUFBLEdBQUcsYUFBSCxHQUFHLHVCQUFILEdBQUcsQ0FBRSxPQUFPLG1DQUFJLE1BQU0sQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO1FBQ2xFLENBQUM7SUFDTCxDQUFDOztBQXhtREwsZ0NBeW1EQztBQS9RRyxzRUFBc0U7QUFDdEUsa0VBQWtFO0FBQ2xFLG9FQUFvRTtBQUNwRSxpRUFBaUU7QUFDakUsOERBQThEO0FBQy9DLGlDQUFzQixHQUFHLEtBQUssQ0FBQztBQW9IOUMsdUVBQXVFO0FBQ3ZFLHVFQUF1RTtBQUN2RSwrREFBK0Q7QUFDL0Qsb0VBQW9FO0FBQ3BFLHlEQUF5RDtBQUN6RCxxQ0FBcUM7QUFDYixvQ0FBeUIsR0FBRyxFQUFFLEdBQUcsSUFBSSxHQUFHLElBQUksQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFRvb2xEZWZpbml0aW9uLCBUb29sUmVzcG9uc2UsIFRvb2xFeGVjdXRvciwgUGVyZm9ybWFuY2VTdGF0cywgVmFsaWRhdGlvblJlc3VsdCwgVmFsaWRhdGlvbklzc3VlIH0gZnJvbSAnLi4vdHlwZXMnO1xuaW1wb3J0IHsgZGVidWdMb2cgfSBmcm9tICcuLi9saWIvbG9nJztcbmltcG9ydCB7IGlzRWRpdG9yQ29udGV4dEV2YWxFbmFibGVkIH0gZnJvbSAnLi4vbGliL3J1bnRpbWUtZmxhZ3MnO1xuaW1wb3J0IHsgeiB9IGZyb20gJy4uL2xpYi9zY2hlbWEnO1xuaW1wb3J0IHsgZGVmaW5lVG9vbHMsIFRvb2xEZWYgfSBmcm9tICcuLi9saWIvZGVmaW5lLXRvb2xzJztcbmltcG9ydCB7IHJ1blNjcmlwdERpYWdub3N0aWNzLCB3YWl0Rm9yQ29tcGlsZSB9IGZyb20gJy4uL2xpYi90cy1kaWFnbm9zdGljcyc7XG5pbXBvcnQgeyBxdWV1ZUdhbWVDb21tYW5kLCBhd2FpdENvbW1hbmRSZXN1bHQsIGdldENsaWVudFN0YXR1cyB9IGZyb20gJy4uL2xpYi9nYW1lLWNvbW1hbmQtcXVldWUnO1xuaW1wb3J0IHsgcnVuU2NlbmVNZXRob2RBc1Rvb2xSZXNwb25zZSB9IGZyb20gJy4uL2xpYi9zY2VuZS1icmlkZ2UnO1xuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcblxuLy8gdjIuOS54IHBvbGlzaDogY29udGFpbm1lbnQgaGVscGVyIHRoYXQgaGFuZGxlcyBkcml2ZS1yb290IGVkZ2VzXG4vLyAoQzpcXCksIHByZWZpeC1jb2xsaXNpb24gKEM6XFxmb28gdnMgQzpcXGZvb2JhciksIGFuZCBjcm9zcy12b2x1bWUgcGF0aHNcbi8vIChEOlxcLi4uIHdoZW4gcm9vdCBpcyBDOlxcKS4gVXNlcyBwYXRoLnJlbGF0aXZlIHdoaWNoIHJldHVybnMgYSByZWxhdGl2ZVxuLy8gZXhwcmVzc2lvbiDigJQgaWYgdGhlIHJlc3VsdCBzdGFydHMgd2l0aCBgLi5gIG9yIGlzIGFic29sdXRlLCB0aGVcbi8vIGNhbmRpZGF0ZSBpcyBvdXRzaWRlIHRoZSByb290LlxuLy9cbi8vIFRPQ1RPVSBub3RlIChDb2RleCByMSArIEdlbWluaSByMSBzaW5nbGUt8J+foSBmcm9tIHYyLjguMSByZXZpZXcsXG4vLyByZXZpZXdlZCB2Mi45LnggYW5kIGFjY2VwdGVkIGFzIHJlc2lkdWFsIHJpc2spOiB0aGVyZSBpcyBhIHNtYWxsXG4vLyByYWNlIHdpbmRvdyBiZXR3ZWVuIHJlYWxwYXRoU3luYyBjb250YWlubWVudCBjaGVjayBhbmQgdGhlXG4vLyBzdWJzZXF1ZW50IHdyaXRlRmlsZVN5bmMg4oCUIGEgbWFsaWNpb3VzIHN5bWxpbmsgc3dhcCBkdXJpbmcgdGhhdFxuLy8gd2luZG93IGNvdWxkIGVzY2FwZS4gRnVsbCBtaXRpZ2F0aW9uIG5lZWRzIE9fTk9GT0xMT1cgd2hpY2ggTm9kZSdzXG4vLyBmcyBBUEkgZG9lc24ndCBleHBvc2UgZGlyZWN0bHkuIEdpdmVuIHRoaXMgaXMgYSBsb2NhbCBkZXYgdG9vbCwgbm90XG4vLyBhIG5ldHdvcmstZmFjaW5nIHNlcnZpY2UsIGFuZCB0aGUgYXR0YWNrIHdpbmRvdyBpcyBtaWNyb3NlY29uZHMsXG4vLyB0aGUgcmlzayBpcyBhY2NlcHRlZCBmb3Igbm93LiBBIGZ1dHVyZSB2Mi54IHBhdGNoIGNvdWxkIGFkZFxuLy8gYGZzLm9wZW5TeW5jKGZpbGVQYXRoLCAnd3gnKWAgZm9yIEFVVE8tbmFtZWQgcGF0aHMgb25seSAoY2FsbGVyLVxuLy8gcHJvdmlkZWQgc2F2ZVBhdGggbmVlZHMgb3ZlcndyaXRlIHNlbWFudGljcykuIERvbid0IHJlbHkgb25cbi8vIGNvbnRhaW5tZW50IGZvciBzZWN1cml0eS1jcml0aWNhbCB3cml0ZXMuXG5mdW5jdGlvbiBpc1BhdGhXaXRoaW5Sb290KGNhbmRpZGF0ZTogc3RyaW5nLCByb290OiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICBjb25zdCBjYW5kQWJzID0gcGF0aC5yZXNvbHZlKGNhbmRpZGF0ZSk7XG4gICAgY29uc3Qgcm9vdEFicyA9IHBhdGgucmVzb2x2ZShyb290KTtcbiAgICBpZiAoY2FuZEFicyA9PT0gcm9vdEFicykgcmV0dXJuIHRydWU7XG4gICAgY29uc3QgcmVsID0gcGF0aC5yZWxhdGl2ZShyb290QWJzLCBjYW5kQWJzKTtcbiAgICBpZiAoIXJlbCkgcmV0dXJuIHRydWU7ICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGlkZW50aWNhbFxuICAgIGlmIChyZWwuc3RhcnRzV2l0aCgnLi4nKSkgcmV0dXJuIGZhbHNlOyAgICAgICAgLy8gb3V0c2lkZSByb290XG4gICAgaWYgKHBhdGguaXNBYnNvbHV0ZShyZWwpKSByZXR1cm4gZmFsc2U7ICAgICAgICAvLyBkaWZmZXJlbnQgZHJpdmVcbiAgICByZXR1cm4gdHJ1ZTtcbn1cblxuZXhwb3J0IGNsYXNzIERlYnVnVG9vbHMgaW1wbGVtZW50cyBUb29sRXhlY3V0b3Ige1xuICAgIHByaXZhdGUgcmVhZG9ubHkgZXhlYzogVG9vbEV4ZWN1dG9yO1xuXG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIGNvbnN0IGRlZnM6IFRvb2xEZWZbXSA9IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnY2xlYXJfY29uc29sZScsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdDbGVhciB0aGUgQ29jb3MgRWRpdG9yIENvbnNvbGUgVUkuIE5vIHByb2plY3Qgc2lkZSBlZmZlY3RzLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiAoKSA9PiB0aGlzLmNsZWFyQ29uc29sZSgpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnZXhlY3V0ZV9qYXZhc2NyaXB0JyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1twcmltYXJ5XSBFeGVjdXRlIEphdmFTY3JpcHQgaW4gc2NlbmUgb3IgZWRpdG9yIGNvbnRleHQuIFVzZSB0aGlzIGFzIHRoZSBkZWZhdWx0IGZpcnN0IHRvb2wgZm9yIGNvbXBvdW5kIG9wZXJhdGlvbnMgKHJlYWQg4oaSIG11dGF0ZSDihpIgdmVyaWZ5KSDigJQgb25lIGNhbGwgcmVwbGFjZXMgNS0xMCBuYXJyb3cgc3BlY2lhbGlzdCB0b29scyBhbmQgYXZvaWRzIHBlci1jYWxsIHRva2VuIG92ZXJoZWFkLiBjb250ZXh0PVwic2NlbmVcIiBpbnNwZWN0cy9tdXRhdGVzIGNjLk5vZGUgZ3JhcGg7IGNvbnRleHQ9XCJlZGl0b3JcIiBydW5zIGluIGhvc3QgcHJvY2VzcyBmb3IgRWRpdG9yLk1lc3NhZ2UgKyBmcyAoZGVmYXVsdCBvZmYsIG9wdC1pbikuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBjb2RlOiB6LnN0cmluZygpLmRlc2NyaWJlKCdKYXZhU2NyaXB0IHNvdXJjZSB0byBleGVjdXRlLiBIYXMgYWNjZXNzIHRvIGNjLiogaW4gc2NlbmUgY29udGV4dCwgRWRpdG9yLiogaW4gZWRpdG9yIGNvbnRleHQuJyksXG4gICAgICAgICAgICAgICAgICAgIGNvbnRleHQ6IHouZW51bShbJ3NjZW5lJywgJ2VkaXRvciddKS5kZWZhdWx0KCdzY2VuZScpLmRlc2NyaWJlKCdFeGVjdXRpb24gc2FuZGJveC4gXCJzY2VuZVwiIHJ1bnMgaW5zaWRlIHRoZSBjb2NvcyBzY2VuZSBzY3JpcHQgY29udGV4dCAoY2MsIGRpcmVjdG9yLCBmaW5kKS4gXCJlZGl0b3JcIiBydW5zIGluIHRoZSBlZGl0b3IgaG9zdCBwcm9jZXNzIChFZGl0b3IsIGFzc2V0LWRiLCBmcywgcmVxdWlyZSkuIEVkaXRvciBjb250ZXh0IGlzIE9GRiBieSBkZWZhdWx0IGFuZCBtdXN0IGJlIG9wdC1pbiB2aWEgcGFuZWwgc2V0dGluZyBgZW5hYmxlRWRpdG9yQ29udGV4dEV2YWxgIOKAlCBhcmJpdHJhcnkgY29kZSBpbiB0aGUgaG9zdCBwcm9jZXNzIGlzIGEgcHJvbXB0LWluamVjdGlvbiByaXNrLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy5leGVjdXRlSmF2YVNjcmlwdChhLmNvZGUsIGEuY29udGV4dCA/PyAnc2NlbmUnKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2V4ZWN1dGVfc2NyaXB0JyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1tjb21wYXRdIFNjZW5lLW9ubHkgSmF2YVNjcmlwdCBldmFsLiBQcmVmZXIgZXhlY3V0ZV9qYXZhc2NyaXB0IHdpdGggY29udGV4dD1cInNjZW5lXCIg4oCUIGtlcHQgYXMgY29tcGF0aWJpbGl0eSBlbnRyeXBvaW50IGZvciBvbGRlciBjbGllbnRzLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgc2NyaXB0OiB6LnN0cmluZygpLmRlc2NyaWJlKCdKYXZhU2NyaXB0IHRvIGV4ZWN1dGUgaW4gc2NlbmUgY29udGV4dCB2aWEgY29uc29sZS9ldmFsLiBDYW4gcmVhZCBvciBtdXRhdGUgdGhlIGN1cnJlbnQgc2NlbmUuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLmV4ZWN1dGVTY3JpcHRDb21wYXQoYS5zY3JpcHQpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnZ2V0X25vZGVfdHJlZScsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdSZWFkIGEgZGVidWcgbm9kZSB0cmVlIGZyb20gYSByb290IG9yIHNjZW5lIHJvb3QgZm9yIGhpZXJhcmNoeS9jb21wb25lbnQgaW5zcGVjdGlvbi4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHJvb3RVdWlkOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1Jvb3Qgbm9kZSBVVUlEIHRvIGV4cGFuZC4gT21pdCB0byB1c2UgdGhlIGN1cnJlbnQgc2NlbmUgcm9vdC4nKSxcbiAgICAgICAgICAgICAgICAgICAgbWF4RGVwdGg6IHoubnVtYmVyKCkuZGVmYXVsdCgxMCkuZGVzY3JpYmUoJ01heGltdW0gdHJlZSBkZXB0aC4gRGVmYXVsdCAxMDsgbGFyZ2UgdmFsdWVzIGNhbiByZXR1cm4gYSBsb3Qgb2YgZGF0YS4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMuZ2V0Tm9kZVRyZWUoYS5yb290VXVpZCwgYS5tYXhEZXB0aCksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdnZXRfcGVyZm9ybWFuY2Vfc3RhdHMnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnVHJ5IHRvIHJlYWQgc2NlbmUgcXVlcnktcGVyZm9ybWFuY2Ugc3RhdHM7IG1heSByZXR1cm4gdW5hdmFpbGFibGUgaW4gZWRpdCBtb2RlLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiAoKSA9PiB0aGlzLmdldFBlcmZvcm1hbmNlU3RhdHMoKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3ZhbGlkYXRlX3NjZW5lJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1J1biBiYXNpYyBjdXJyZW50LXNjZW5lIGhlYWx0aCBjaGVja3MgZm9yIG1pc3NpbmcgYXNzZXRzIGFuZCBub2RlLWNvdW50IHdhcm5pbmdzLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgY2hlY2tNaXNzaW5nQXNzZXRzOiB6LmJvb2xlYW4oKS5kZWZhdWx0KHRydWUpLmRlc2NyaWJlKCdDaGVjayBtaXNzaW5nIGFzc2V0IHJlZmVyZW5jZXMgd2hlbiB0aGUgQ29jb3Mgc2NlbmUgQVBJIHN1cHBvcnRzIGl0LicpLFxuICAgICAgICAgICAgICAgICAgICBjaGVja1BlcmZvcm1hbmNlOiB6LmJvb2xlYW4oKS5kZWZhdWx0KHRydWUpLmRlc2NyaWJlKCdSdW4gYmFzaWMgcGVyZm9ybWFuY2UgY2hlY2tzIHN1Y2ggYXMgaGlnaCBub2RlIGNvdW50IHdhcm5pbmdzLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy52YWxpZGF0ZVNjZW5lKHsgY2hlY2tNaXNzaW5nQXNzZXRzOiBhLmNoZWNrTWlzc2luZ0Fzc2V0cywgY2hlY2tQZXJmb3JtYW5jZTogYS5jaGVja1BlcmZvcm1hbmNlIH0pLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnZ2V0X2VkaXRvcl9pbmZvJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1JlYWQgRWRpdG9yL0NvY29zL3Byb2plY3QvcHJvY2VzcyBpbmZvcm1hdGlvbiBhbmQgbWVtb3J5IHN1bW1hcnkuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6ICgpID0+IHRoaXMuZ2V0RWRpdG9ySW5mbygpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnZ2V0X3Byb2plY3RfbG9ncycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdSZWFkIHRlbXAvbG9ncy9wcm9qZWN0LmxvZyB0YWlsIHdpdGggb3B0aW9uYWwgbGV2ZWwva2V5d29yZCBmaWx0ZXJzLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgbGluZXM6IHoubnVtYmVyKCkubWluKDEpLm1heCgxMDAwMCkuZGVmYXVsdCgxMDApLmRlc2NyaWJlKCdOdW1iZXIgb2YgbGluZXMgdG8gcmVhZCBmcm9tIHRoZSBlbmQgb2YgdGVtcC9sb2dzL3Byb2plY3QubG9nLiBEZWZhdWx0IDEwMC4nKSxcbiAgICAgICAgICAgICAgICAgICAgZmlsdGVyS2V5d29yZDogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdPcHRpb25hbCBjYXNlLWluc2Vuc2l0aXZlIGtleXdvcmQgZmlsdGVyLicpLFxuICAgICAgICAgICAgICAgICAgICBsb2dMZXZlbDogei5lbnVtKFsnRVJST1InLCAnV0FSTicsICdJTkZPJywgJ0RFQlVHJywgJ1RSQUNFJywgJ0FMTCddKS5kZWZhdWx0KCdBTEwnKS5kZXNjcmliZSgnT3B0aW9uYWwgbG9nIGxldmVsIGZpbHRlci4gQUxMIGRpc2FibGVzIGxldmVsIGZpbHRlcmluZy4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMuZ2V0UHJvamVjdExvZ3MoYS5saW5lcywgYS5maWx0ZXJLZXl3b3JkLCBhLmxvZ0xldmVsKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2dldF9sb2dfZmlsZV9pbmZvJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1JlYWQgdGVtcC9sb2dzL3Byb2plY3QubG9nIHBhdGgsIHNpemUsIGxpbmUgY291bnQsIGFuZCB0aW1lc3RhbXBzLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiAoKSA9PiB0aGlzLmdldExvZ0ZpbGVJbmZvKCksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdzZWFyY2hfcHJvamVjdF9sb2dzJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1NlYXJjaCB0ZW1wL2xvZ3MvcHJvamVjdC5sb2cgZm9yIHN0cmluZy9yZWdleCBhbmQgcmV0dXJuIGxpbmUgY29udGV4dC4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHBhdHRlcm46IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1NlYXJjaCBzdHJpbmcgb3IgcmVnZXguIEludmFsaWQgcmVnZXggaXMgdHJlYXRlZCBhcyBhIGxpdGVyYWwgc3RyaW5nLicpLFxuICAgICAgICAgICAgICAgICAgICBtYXhSZXN1bHRzOiB6Lm51bWJlcigpLm1pbigxKS5tYXgoMTAwKS5kZWZhdWx0KDIwKS5kZXNjcmliZSgnTWF4aW11bSBtYXRjaGVzIHRvIHJldHVybi4gRGVmYXVsdCAyMC4nKSxcbiAgICAgICAgICAgICAgICAgICAgY29udGV4dExpbmVzOiB6Lm51bWJlcigpLm1pbigwKS5tYXgoMTApLmRlZmF1bHQoMikuZGVzY3JpYmUoJ0NvbnRleHQgbGluZXMgYmVmb3JlL2FmdGVyIGVhY2ggbWF0Y2guIERlZmF1bHQgMi4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMuc2VhcmNoUHJvamVjdExvZ3MoYS5wYXR0ZXJuLCBhLm1heFJlc3VsdHMsIGEuY29udGV4dExpbmVzKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3NjcmVlbnNob3QnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnQ2FwdHVyZSB0aGUgZm9jdXNlZCBDb2NvcyBFZGl0b3Igd2luZG93IChvciBhIHdpbmRvdyBtYXRjaGVkIGJ5IHRpdGxlKSB0byBhIFBORy4gUmV0dXJucyBzYXZlZCBmaWxlIHBhdGguIFVzZSB0aGlzIGZvciBBSSB2aXN1YWwgdmVyaWZpY2F0aW9uIGFmdGVyIHNjZW5lL1VJIGNoYW5nZXMuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBzYXZlUGF0aDogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdBYnNvbHV0ZSBmaWxlc3lzdGVtIHBhdGggdG8gc2F2ZSB0aGUgUE5HLiBNdXN0IHJlc29sdmUgaW5zaWRlIHRoZSBjb2NvcyBwcm9qZWN0IHJvb3QgKGNvbnRhaW5tZW50IGNoZWNrIHZpYSByZWFscGF0aCkuIE9taXQgdG8gYXV0by1uYW1lIGludG8gPHByb2plY3Q+L3RlbXAvbWNwLWNhcHR1cmVzL3NjcmVlbnNob3QtPHRpbWVzdGFtcD4ucG5nLicpLFxuICAgICAgICAgICAgICAgICAgICB3aW5kb3dUaXRsZTogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdPcHRpb25hbCBzdWJzdHJpbmcgbWF0Y2ggb24gd2luZG93IHRpdGxlIHRvIHBpY2sgYSBzcGVjaWZpYyBFbGVjdHJvbiB3aW5kb3cuIERlZmF1bHQ6IGZvY3VzZWQgd2luZG93LicpLFxuICAgICAgICAgICAgICAgICAgICBpbmNsdWRlQmFzZTY0OiB6LmJvb2xlYW4oKS5kZWZhdWx0KGZhbHNlKS5kZXNjcmliZSgnRW1iZWQgUE5HIGJ5dGVzIGFzIGJhc2U2NCBpbiByZXNwb25zZSBkYXRhIChsYXJnZTsgZGVmYXVsdCBmYWxzZSkuIFdoZW4gZmFsc2UsIG9ubHkgdGhlIHNhdmVkIGZpbGUgcGF0aCBpcyByZXR1cm5lZC4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMuc2NyZWVuc2hvdChhLnNhdmVQYXRoLCBhLndpbmRvd1RpdGxlLCBhLmluY2x1ZGVCYXNlNjQpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnY2FwdHVyZV9wcmV2aWV3X3NjcmVlbnNob3QnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnQ2FwdHVyZSB0aGUgY29jb3MgUHJldmlldy1pbi1FZGl0b3IgKFBJRSkgZ2FtZXZpZXcgdG8gYSBQTkcuIENvY29zIGhhcyBtdWx0aXBsZSBQSUUgcmVuZGVyIHRhcmdldHMgZGVwZW5kaW5nIG9uIHRoZSB1c2VyXFwncyBwcmV2aWV3IGNvbmZpZyAoUHJlZmVyZW5jZXMg4oaSIFByZXZpZXcg4oaSIE9wZW4gUHJldmlldyBXaXRoKTogXCJicm93c2VyXCIgb3BlbnMgYW4gZXh0ZXJuYWwgYnJvd3NlciAoTk9UIGNhcHR1cmFibGUgaGVyZSksIFwid2luZG93XCIgLyBcInNpbXVsYXRvclwiIG9wZW5zIGEgc2VwYXJhdGUgRWxlY3Ryb24gd2luZG93ICh0aXRsZSBjb250YWlucyBcIlByZXZpZXdcIiksIFwiZW1iZWRkZWRcIiByZW5kZXJzIHRoZSBnYW1ldmlldyBpbnNpZGUgdGhlIG1haW4gZWRpdG9yIHdpbmRvdy4gVGhlIGRlZmF1bHQgbW9kZT1cImF1dG9cIiB0cmllcyB0aGUgUHJldmlldy10aXRsZWQgd2luZG93IGZpcnN0IGFuZCBmYWxscyBiYWNrIHRvIGNhcHR1cmluZyB0aGUgbWFpbiBlZGl0b3Igd2luZG93IHdoZW4gbm8gUHJldmlldy10aXRsZWQgd2luZG93IGV4aXN0cyAoY292ZXJzIGVtYmVkZGVkIG1vZGUpLiBVc2UgbW9kZT1cIndpbmRvd1wiIHRvIGZvcmNlIHRoZSBzZXBhcmF0ZS13aW5kb3cgc3RyYXRlZ3kgb3IgbW9kZT1cImVtYmVkZGVkXCIgdG8gc2tpcCB0aGUgd2luZG93IHByb2JlLiBQYWlyIHdpdGggZGVidWdfZ2V0X3ByZXZpZXdfbW9kZSB0byByZWFkIHRoZSBjb2NvcyBjb25maWcgYW5kIHJvdXRlIGRldGVybWluaXN0aWNhbGx5LiBGb3IgcnVudGltZSBnYW1lLWNhbnZhcyBwaXhlbC1sZXZlbCBjYXB0dXJlIChjYW1lcmEgUmVuZGVyVGV4dHVyZSksIHVzZSBkZWJ1Z19nYW1lX2NvbW1hbmQodHlwZT1cInNjcmVlbnNob3RcIikgaW5zdGVhZC4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHNhdmVQYXRoOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0Fic29sdXRlIGZpbGVzeXN0ZW0gcGF0aCB0byBzYXZlIHRoZSBQTkcuIE11c3QgcmVzb2x2ZSBpbnNpZGUgdGhlIGNvY29zIHByb2plY3Qgcm9vdCAoY29udGFpbm1lbnQgY2hlY2sgdmlhIHJlYWxwYXRoKS4gT21pdCB0byBhdXRvLW5hbWUgaW50byA8cHJvamVjdD4vdGVtcC9tY3AtY2FwdHVyZXMvcHJldmlldy08dGltZXN0YW1wPi5wbmcuJyksXG4gICAgICAgICAgICAgICAgICAgIG1vZGU6IHouZW51bShbJ2F1dG8nLCAnd2luZG93JywgJ2VtYmVkZGVkJ10pLmRlZmF1bHQoJ2F1dG8nKS5kZXNjcmliZSgnQ2FwdHVyZSB0YXJnZXQuIFwiYXV0b1wiIChkZWZhdWx0KSB0cmllcyBQcmV2aWV3LXRpdGxlZCB3aW5kb3cgdGhlbiBmYWxscyBiYWNrIHRvIHRoZSBtYWluIGVkaXRvciB3aW5kb3cuIFwid2luZG93XCIgb25seSBtYXRjaGVzIFByZXZpZXctdGl0bGVkIHdpbmRvd3MgKGZhaWxzIGlmIG5vbmUpLiBcImVtYmVkZGVkXCIgY2FwdHVyZXMgdGhlIG1haW4gZWRpdG9yIHdpbmRvdyBkaXJlY3RseSAoc2tpcCBQcmV2aWV3LXdpbmRvdyBwcm9iZSkuJyksXG4gICAgICAgICAgICAgICAgICAgIHdpbmRvd1RpdGxlOiB6LnN0cmluZygpLmRlZmF1bHQoJ1ByZXZpZXcnKS5kZXNjcmliZSgnU3Vic3RyaW5nIG1hdGNoZWQgYWdhaW5zdCB3aW5kb3cgdGl0bGVzIGluIHdpbmRvdy9hdXRvIG1vZGVzIChkZWZhdWx0IFwiUHJldmlld1wiIGZvciBQSUUpLiBJZ25vcmVkIGluIGVtYmVkZGVkIG1vZGUuJyksXG4gICAgICAgICAgICAgICAgICAgIGluY2x1ZGVCYXNlNjQ6IHouYm9vbGVhbigpLmRlZmF1bHQoZmFsc2UpLmRlc2NyaWJlKCdFbWJlZCBQTkcgYnl0ZXMgYXMgYmFzZTY0IGluIHJlc3BvbnNlIGRhdGEgKGxhcmdlOyBkZWZhdWx0IGZhbHNlKS4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMuY2FwdHVyZVByZXZpZXdTY3JlZW5zaG90KGEuc2F2ZVBhdGgsIGEubW9kZSA/PyAnYXV0bycsIGEud2luZG93VGl0bGUsIGEuaW5jbHVkZUJhc2U2NCksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdnZXRfcHJldmlld19tb2RlJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1JlYWQgdGhlIGNvY29zIHByZXZpZXcgY29uZmlndXJhdGlvbiB2aWEgRWRpdG9yLk1lc3NhZ2UgcHJlZmVyZW5jZXMvcXVlcnktY29uZmlnIHNvIEFJIGNhbiByb3V0ZSBkZWJ1Z19jYXB0dXJlX3ByZXZpZXdfc2NyZWVuc2hvdCB0byB0aGUgY29ycmVjdCBtb2RlLiBSZXR1cm5zIHsgaW50ZXJwcmV0ZWQ6IFwiYnJvd3NlclwiIHwgXCJ3aW5kb3dcIiB8IFwic2ltdWxhdG9yXCIgfCBcImVtYmVkZGVkXCIgfCBcInVua25vd25cIiwgcmF3OiA8ZnVsbCBwcmV2aWV3IGNvbmZpZyBkdW1wPiB9LiBVc2UgYmVmb3JlIGNhcHR1cmU6IGlmIGludGVycHJldGVkPVwiZW1iZWRkZWRcIiwgY2FsbCBjYXB0dXJlX3ByZXZpZXdfc2NyZWVuc2hvdCB3aXRoIG1vZGU9XCJlbWJlZGRlZFwiIG9yIHJlbHkgb24gbW9kZT1cImF1dG9cIiBmYWxsYmFjay4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogKCkgPT4gdGhpcy5nZXRQcmV2aWV3TW9kZSgpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnc2V0X3ByZXZpZXdfbW9kZScsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICfimqAgRVhQRVJJTUVOVEFMIOKAlCBkb2VzIE5PVCBhY3R1YWxseSBmbGlwIGNvY29zIDMuOC43IHByZXZpZXcgbW9kZSAodmVyaWZpZWQgbGl2ZSB2Mi45LjEsIHNlZSBsYW5kbWluZSAjMTcpLiBTd2l0Y2ggY29jb3MgcHJldmlldyBtb2RlIHByb2dyYW1tYXRpY2FsbHkgdmlhIHRoZSB0eXBlZCBFZGl0b3IuTWVzc2FnZSBwcmVmZXJlbmNlcy9zZXQtY29uZmlnIGNoYW5uZWwuIHYyLjkuMSBhdHRlbXB0cyA0IGtub3duIHNoYXBlcyAobmVzdGVkIG9iamVjdCAvIGRvdC1wYXRoIHdpdGggZ2xvYmFsL2xvY2FsIHByb3RvY29sIC8gbm8gcHJvdG9jb2wpIGFuZCB2ZXJpZmllcyB2aWEgcmVhZC1iYWNrOyBhbGwgNCBzaWxlbnRseSBuby1vcCBvbiBjb2NvcyAzLjguNyDigJQgc2V0LWNvbmZpZyByZXR1cm5zIHRydXRoeSBidXQgcHJldmlldy5jdXJyZW50LnBsYXRmb3JtIGlzIG5ldmVyIHBlcnNpc3RlZCwgc3VnZ2VzdGluZyBjb2NvcyB0cmVhdHMgdGhpcyBhcyBhIHJlYWRvbmx5IGNhdGVnb3J5IG9yIGRlcml2ZXMgY3VycmVudC5wbGF0Zm9ybSBmcm9tIG5vbi1wcmVmcyBydW50aW1lIHN0YXRlLiBUb29sIHN0aWxsIHVzZWZ1bCBmb3IgZGlhZ25vc3RpY3M6IGRhdGEuYXR0ZW1wdHMgcmVjb3JkcyBldmVyeSBzaGFwZSB0cmllZCBhbmQgaXRzIHJlYWQtYmFjayBvYnNlcnZhdGlvbi4gRm9yIG5vdywgc3dpdGNoIHRoZSBwcmV2aWV3IG1vZGUgdmlhIHRoZSBjb2NvcyBkcm9wZG93biBtYW51YWxseS4gUGVuZGluZyByZWZlcmVuY2UtcHJvamVjdCBjb21wYXJpc29uICh2Mi45IGNhbmRpZGF0ZSkgdG8gZmluZCB0aGUgY29ycmVjdCB3cml0ZSBwYXRoLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgbW9kZTogei5lbnVtKFsnYnJvd3NlcicsICdnYW1lVmlldycsICdzaW11bGF0b3InXSkuZGVzY3JpYmUoJ1RhcmdldCBwcmV2aWV3IHBsYXRmb3JtLiBcImJyb3dzZXJcIiBvcGVucyBwcmV2aWV3IGluIHRoZSB1c2VyIGRlZmF1bHQgYnJvd3Nlci4gXCJnYW1lVmlld1wiIGVtYmVkcyB0aGUgZ2FtZXZpZXcgaW4gdGhlIG1haW4gZWRpdG9yIChpbi1lZGl0b3IgcHJldmlldykuIFwic2ltdWxhdG9yXCIgbGF1bmNoZXMgdGhlIGNvY29zIHNpbXVsYXRvci4gTWFwcyBkaXJlY3RseSB0byB0aGUgY29jb3MgcHJldmlldy5jdXJyZW50LnBsYXRmb3JtIHZhbHVlLicpLFxuICAgICAgICAgICAgICAgICAgICBjb25maXJtOiB6LmJvb2xlYW4oKS5kZWZhdWx0KGZhbHNlKS5kZXNjcmliZSgnUmVxdWlyZWQgdG8gY29tbWl0IHRoZSBjaGFuZ2UuIERlZmF1bHQgZmFsc2UgcmV0dXJucyB0aGUgY3VycmVudCB2YWx1ZSBwbHVzIGEgaGludCwgd2l0aG91dCBtb2RpZnlpbmcgcHJlZmVyZW5jZXMuIFNldCB0cnVlIHRvIGFjdHVhbGx5IHdyaXRlLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy5zZXRQcmV2aWV3TW9kZShhLm1vZGUsIGEuY29uZmlybSA/PyBmYWxzZSksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdiYXRjaF9zY3JlZW5zaG90JyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ0NhcHR1cmUgbXVsdGlwbGUgUE5HcyBvZiB0aGUgZWRpdG9yIHdpbmRvdyB3aXRoIG9wdGlvbmFsIGRlbGF5cyBiZXR3ZWVuIHNob3RzLiBVc2VmdWwgZm9yIGFuaW1hdGluZyBwcmV2aWV3IHZlcmlmaWNhdGlvbiBvciBjYXB0dXJpbmcgdHJhbnNpdGlvbnMuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBzYXZlUGF0aFByZWZpeDogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdQYXRoIHByZWZpeCBmb3IgYmF0Y2ggb3V0cHV0IGZpbGVzLiBGaWxlcyB3cml0dGVuIGFzIDxwcmVmaXg+LTxpbmRleD4ucG5nLiBNdXN0IHJlc29sdmUgaW5zaWRlIHRoZSBjb2NvcyBwcm9qZWN0IHJvb3QgKGNvbnRhaW5tZW50IGNoZWNrIHZpYSByZWFscGF0aCkuIERlZmF1bHQ6IDxwcm9qZWN0Pi90ZW1wL21jcC1jYXB0dXJlcy9iYXRjaC08dGltZXN0YW1wPi4nKSxcbiAgICAgICAgICAgICAgICAgICAgZGVsYXlzTXM6IHouYXJyYXkoei5udW1iZXIoKS5taW4oMCkubWF4KDEwMDAwKSkubWF4KDIwKS5kZWZhdWx0KFswXSkuZGVzY3JpYmUoJ0RlbGF5IChtcykgYmVmb3JlIGVhY2ggY2FwdHVyZS4gTGVuZ3RoIGRldGVybWluZXMgaG93IG1hbnkgc2hvdHMgdGFrZW4gKGNhcHBlZCBhdCAyMCB0byBwcmV2ZW50IGRpc2sgZmlsbCAvIGVkaXRvciBmcmVlemUpLiBEZWZhdWx0IFswXSA9IHNpbmdsZSBzaG90LicpLFxuICAgICAgICAgICAgICAgICAgICB3aW5kb3dUaXRsZTogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdPcHRpb25hbCBzdWJzdHJpbmcgbWF0Y2ggb24gd2luZG93IHRpdGxlLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy5iYXRjaFNjcmVlbnNob3QoYS5zYXZlUGF0aFByZWZpeCwgYS5kZWxheXNNcywgYS53aW5kb3dUaXRsZSksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICd3YWl0X2NvbXBpbGUnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnQmxvY2sgdW50aWwgY29jb3MgZmluaXNoZXMgaXRzIFR5cGVTY3JpcHQgY29tcGlsZSBwYXNzLiBUYWlscyB0ZW1wL3Byb2dyYW1taW5nL3BhY2tlci1kcml2ZXIvbG9ncy9kZWJ1Zy5sb2cgZm9yIHRoZSBcIlRhcmdldChlZGl0b3IpIGVuZHNcIiBtYXJrZXIuIFJldHVybnMgaW1tZWRpYXRlbHkgd2l0aCBjb21waWxlZD1mYWxzZSBpZiBubyBjb21waWxlIHdhcyB0cmlnZ2VyZWQgKGNsZWFuIHByb2plY3QgLyBubyBjaGFuZ2VzIGRldGVjdGVkKS4gUGFpciB3aXRoIHJ1bl9zY3JpcHRfZGlhZ25vc3RpY3MgZm9yIGFuIFwiZWRpdCAudHMg4oaSIHdhaXQg4oaSIGZldGNoIGVycm9yc1wiIHdvcmtmbG93LicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgdGltZW91dE1zOiB6Lm51bWJlcigpLm1pbig1MDApLm1heCgxMjAwMDApLmRlZmF1bHQoMTUwMDApLmRlc2NyaWJlKCdNYXggd2FpdCB0aW1lIGluIG1zIGJlZm9yZSBnaXZpbmcgdXAuIERlZmF1bHQgMTUwMDAuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLndhaXRDb21waWxlKGEudGltZW91dE1zKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3J1bl9zY3JpcHRfZGlhZ25vc3RpY3MnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnUnVuIGB0c2MgLS1ub0VtaXRgIGFnYWluc3QgdGhlIHByb2plY3QgdHNjb25maWcgYW5kIHJldHVybiBwYXJzZWQgZGlhZ25vc3RpY3MuIFVzZWQgYWZ0ZXIgd2FpdF9jb21waWxlIHRvIHN1cmZhY2UgY29tcGlsYXRpb24gZXJyb3JzIGFzIHN0cnVjdHVyZWQge2ZpbGUsIGxpbmUsIGNvbHVtbiwgY29kZSwgbWVzc2FnZX0gZW50cmllcy4gUmVzb2x2ZXMgdHNjIGJpbmFyeSBmcm9tIHByb2plY3Qgbm9kZV9tb2R1bGVzIOKGkiBlZGl0b3IgYnVuZGxlZCBlbmdpbmUg4oaSIG5weCBmYWxsYmFjay4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHRzY29uZmlnUGF0aDogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdPcHRpb25hbCBvdmVycmlkZSAoYWJzb2x1dGUgb3IgcHJvamVjdC1yZWxhdGl2ZSkuIERlZmF1bHQ6IHRzY29uZmlnLmpzb24gb3IgdGVtcC90c2NvbmZpZy5jb2Nvcy5qc29uLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy5ydW5TY3JpcHREaWFnbm9zdGljcyhhLnRzY29uZmlnUGF0aCksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdwcmV2aWV3X3VybCcsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdSZXNvbHZlIHRoZSBjb2NvcyBicm93c2VyLXByZXZpZXcgVVJMIChlLmcuIGh0dHA6Ly9sb2NhbGhvc3Q6NzQ1NikgdmlhIHRoZSBkb2N1bWVudGVkIEVkaXRvci5NZXNzYWdlIGNoYW5uZWwgcHJldmlldy9xdWVyeS1wcmV2aWV3LXVybC4gV2l0aCBhY3Rpb249XCJvcGVuXCIsIGFsc28gbGF1bmNoZXMgdGhlIFVSTCBpbiB0aGUgdXNlciBkZWZhdWx0IGJyb3dzZXIgdmlhIGVsZWN0cm9uLnNoZWxsLm9wZW5FeHRlcm5hbCDigJQgdXNlZnVsIGFzIGEgc2V0dXAgc3RlcCBiZWZvcmUgZGVidWdfZ2FtZV9jb21tYW5kLCBzaW5jZSB0aGUgR2FtZURlYnVnQ2xpZW50IHJ1bm5pbmcgaW5zaWRlIHRoZSBwcmV2aWV3IG11c3QgYmUgcmVhY2hhYmxlLiBFZGl0b3Itc2lkZSBQcmV2aWV3LWluLUVkaXRvciBwbGF5L3N0b3AgaXMgTk9UIGV4cG9zZWQgYnkgdGhlIHB1YmxpYyBtZXNzYWdlIEFQSSBhbmQgaXMgaW50ZW50aW9uYWxseSBub3QgaW1wbGVtZW50ZWQgaGVyZTsgdXNlIHRoZSBjb2NvcyBlZGl0b3IgdG9vbGJhciBtYW51YWxseSBmb3IgUElFLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgYWN0aW9uOiB6LmVudW0oWydxdWVyeScsICdvcGVuJ10pLmRlZmF1bHQoJ3F1ZXJ5JykuZGVzY3JpYmUoJ1wicXVlcnlcIiByZXR1cm5zIHRoZSBVUkw7IFwib3BlblwiIHJldHVybnMgdGhlIFVSTCBBTkQgb3BlbnMgaXQgaW4gdGhlIHVzZXIgZGVmYXVsdCBicm93c2VyIHZpYSBlbGVjdHJvbi5zaGVsbC5vcGVuRXh0ZXJuYWwuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLnByZXZpZXdVcmwoYS5hY3Rpb24pLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAncXVlcnlfZGV2aWNlcycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdMaXN0IHByZXZpZXcgZGV2aWNlcyBjb25maWd1cmVkIGluIHRoZSBjb2NvcyBwcm9qZWN0IChjYy5JRGV2aWNlSXRlbSBlbnRyaWVzKS4gQmFja2VkIGJ5IEVkaXRvci5NZXNzYWdlIGNoYW5uZWwgZGV2aWNlL3F1ZXJ5LiBSZXR1cm5zIGFuIGFycmF5IG9mIHtuYW1lLCB3aWR0aCwgaGVpZ2h0LCByYXRpb30gZW50cmllcyDigJQgdXNlZnVsIGZvciBiYXRjaC1zY3JlZW5zaG90IHBpcGVsaW5lcyB0aGF0IHRhcmdldCBtdWx0aXBsZSByZXNvbHV0aW9ucy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogKCkgPT4gdGhpcy5xdWVyeURldmljZXMoKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2dhbWVfY29tbWFuZCcsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdTZW5kIGEgcnVudGltZSBjb21tYW5kIHRvIGEgR2FtZURlYnVnQ2xpZW50IHJ1bm5pbmcgaW5zaWRlIGEgY29jb3MgcHJldmlldy9idWlsZCAoYnJvd3NlciwgUHJldmlldy1pbi1FZGl0b3IsIG9yIGFueSBkZXZpY2UgdGhhdCBmZXRjaGVzIC9nYW1lL2NvbW1hbmQpLiBCdWlsdC1pbiBjb21tYW5kIHR5cGVzOiBcInNjcmVlbnNob3RcIiAoY2FwdHVyZSBnYW1lIGNhbnZhcyB0byBQTkcsIHJldHVybnMgc2F2ZWQgZmlsZSBwYXRoKSwgXCJjbGlja1wiIChlbWl0IEJ1dHRvbi5DTElDSyBvbiBhIG5vZGUgYnkgbmFtZSksIFwiaW5zcGVjdFwiIChkdW1wIHJ1bnRpbWUgbm9kZSBpbmZvOiBwb3NpdGlvbi9zY2FsZS9yb3RhdGlvbi9jb250ZW50U2l6ZS9hY3RpdmUvY29tcG9uZW50cyBieSBuYW1lKS4gQ3VzdG9tIGNvbW1hbmQgdHlwZXMgYXJlIGZvcndhcmRlZCB0byB0aGUgY2xpZW50XFwncyBjdXN0b21Db21tYW5kcyBtYXAgKGUuZy4gXCJzdGF0ZVwiLCBcIm5hdmlnYXRlXCIpLiBSZXF1aXJlcyB0aGUgR2FtZURlYnVnQ2xpZW50IHRlbXBsYXRlIChjbGllbnQvY29jb3MtbWNwLWNsaWVudC50cykgd2lyZWQgaW50byB0aGUgcnVubmluZyBnYW1lOyB3aXRob3V0IGl0IHRoZSBjYWxsIHRpbWVzIG91dC4gQ2hlY2sgR0VUIC9nYW1lL3N0YXR1cyB0byB2ZXJpZnkgY2xpZW50IGxpdmVuZXNzIGZpcnN0LicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogei5zdHJpbmcoKS5taW4oMSkuZGVzY3JpYmUoJ0NvbW1hbmQgdHlwZS4gQnVpbHQtaW5zOiBzY3JlZW5zaG90LCBjbGljaywgaW5zcGVjdC4gQ3VzdG9tczogYW55IHN0cmluZyB0aGUgR2FtZURlYnVnQ2xpZW50IHJlZ2lzdGVyZWQgaW4gY3VzdG9tQ29tbWFuZHMuJyksXG4gICAgICAgICAgICAgICAgICAgIGFyZ3M6IHouYW55KCkub3B0aW9uYWwoKS5kZXNjcmliZSgnQ29tbWFuZC1zcGVjaWZpYyBhcmd1bWVudHMuIEZvciBcImNsaWNrXCIvXCJpbnNwZWN0XCI6IHtuYW1lOiBzdHJpbmd9IG5vZGUgbmFtZS4gRm9yIFwic2NyZWVuc2hvdFwiOiB7fSAobm8gYXJncykuJyksXG4gICAgICAgICAgICAgICAgICAgIHRpbWVvdXRNczogei5udW1iZXIoKS5taW4oNTAwKS5tYXgoNjAwMDApLmRlZmF1bHQoMTAwMDApLmRlc2NyaWJlKCdNYXggd2FpdCBmb3IgY2xpZW50IHJlc3BvbnNlLiBEZWZhdWx0IDEwMDAwbXMuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLmdhbWVDb21tYW5kKGEudHlwZSwgYS5hcmdzLCBhLnRpbWVvdXRNcyksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdnYW1lX2NsaWVudF9zdGF0dXMnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnUmVhZCBHYW1lRGVidWdDbGllbnQgY29ubmVjdGlvbiBzdGF0dXM6IGNvbm5lY3RlZCAocG9sbGVkIHdpdGhpbiAycyksIGxhc3QgcG9sbCB0aW1lc3RhbXAsIHdoZXRoZXIgYSBjb21tYW5kIGlzIHF1ZXVlZC4gVXNlIGJlZm9yZSBkZWJ1Z19nYW1lX2NvbW1hbmQgdG8gY29uZmlybSB0aGUgY2xpZW50IGlzIHJlYWNoYWJsZS4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogKCkgPT4gdGhpcy5nYW1lQ2xpZW50U3RhdHVzKCksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdjaGVja19lZGl0b3JfaGVhbHRoJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1Byb2JlIHdoZXRoZXIgdGhlIGNvY29zIGVkaXRvciBzY2VuZS1zY3JpcHQgcmVuZGVyZXIgaXMgcmVzcG9uc2l2ZS4gVXNlZnVsIGFmdGVyIGRlYnVnX3ByZXZpZXdfY29udHJvbChzdGFydCkg4oCUIGxhbmRtaW5lICMxNiBkb2N1bWVudHMgdGhhdCBjb2NvcyAzLjguNyBzb21ldGltZXMgZnJlZXplcyB0aGUgc2NlbmUtc2NyaXB0IHJlbmRlcmVyIChzcGlubmluZyBpbmRpY2F0b3IsIEN0cmwrUiByZXF1aXJlZCkuIFN0cmF0ZWd5OiBydW4gdHdvIHByb2JlcyBpbiBwYXJhbGxlbCDigJQgKDEpIGEgZmFzdCBub24tc2NlbmUgY2hhbm5lbCAoZGV2aWNlL3F1ZXJ5LCBnb2VzIHRvIG1haW4gcHJvY2VzcykgY29uZmlybXMgdGhlIGVkaXRvciBob3N0IGlzIGFsaXZlOyAoMikgYSBzY2VuZS1zY3JpcHQgZXZhbCAoMSsxIHRyaXZpYWwgZXhwcmVzc2lvbiB2aWEgZXhlY3V0ZS1zY2VuZS1zY3JpcHQpIHdpdGggYSBzaG9ydCB0aW1lb3V0IChkZWZhdWx0IDE1MDBtcykgY29uZmlybXMgdGhlIHNjZW5lIHJlbmRlcmVyIGlzIHJlc3BvbnNpdmUuIFJldHVybnMgeyBob3N0QWxpdmUsIHNjZW5lQWxpdmUsIHNjZW5lTGF0ZW5jeU1zLCBzdWdnZXN0aW9uIH0uIEFJIHdvcmtmbG93OiBjYWxsIGFmdGVyIHByZXZpZXdfY29udHJvbChzdGFydCk7IGlmIHNjZW5lQWxpdmU9ZmFsc2UsIHN1cmZhY2UgXCJjb2NvcyBlZGl0b3IgbGlrZWx5IGZyb3plbiDigJQgcHJlc3MgQ3RybCtSXCIgaW5zdGVhZCBvZiBpc3N1aW5nIG1vcmUgc2NlbmUtYm91bmQgY2FsbHMgdGhhdCB3b3VsZCBoYW5nLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgc2NlbmVUaW1lb3V0TXM6IHoubnVtYmVyKCkubWluKDIwMCkubWF4KDEwMDAwKS5kZWZhdWx0KDE1MDApLmRlc2NyaWJlKCdUaW1lb3V0IGZvciB0aGUgc2NlbmUtc2NyaXB0IHByb2JlIGluIG1zLiBCZWxvdyB0aGlzIHNjZW5lIGlzIGNvbnNpZGVyZWQgZnJvemVuLiBEZWZhdWx0IDE1MDBtcy4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMuY2hlY2tFZGl0b3JIZWFsdGgoYS5zY2VuZVRpbWVvdXRNcyA/PyAxNTAwKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3ByZXZpZXdfY29udHJvbCcsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICfimqAgUEFSS0VEIOKAlCBrbm93biB0byBmcmVlemUgY29jb3MgMy44LjcgKGxhbmRtaW5lICMxNikuIFByb2dyYW1tYXRpY2FsbHkgc3RhcnQgb3Igc3RvcCBQcmV2aWV3LWluLUVkaXRvciAoUElFKSBwbGF5IG1vZGUuIFdyYXBzIHRoZSB0eXBlZCBjY2UuU2NlbmVGYWNhZGVNYW5hZ2VyLmNoYW5nZVByZXZpZXdQbGF5U3RhdGUgbWV0aG9kLiAqKnN0YXJ0IGhpdHMgYSBjb2NvcyAzLjguNyBzb2Z0UmVsb2FkU2NlbmUgcmFjZSoqIHRoYXQgcmV0dXJucyBzdWNjZXNzIGJ1dCBmcmVlemVzIHRoZSBlZGl0b3IgKHNwaW5uaW5nIGluZGljYXRvciwgQ3RybCtSIHJlcXVpcmVkIHRvIHJlY292ZXIpLiBWZXJpZmllZCBpbiBib3RoIGVtYmVkZGVkIGFuZCBicm93c2VyIHByZXZpZXcgbW9kZXMuICoqc3RvcCBpcyBzYWZlKiogYW5kIHJlbGlhYmxlLiBUbyBwcmV2ZW50IGFjY2lkZW50YWwgdHJpZ2dlcmluZywgc3RhcnQgbm93IHJlcXVpcmVzIGV4cGxpY2l0IGBhY2tub3dsZWRnZUZyZWV6ZVJpc2s6IHRydWVgLiAqKlJlY29tbWVuZGVkIGFsdGVybmF0aXZlcyBpbnN0ZWFkIG9mIHN0YXJ0Kio6IChhKSBkZWJ1Z19jYXB0dXJlX3ByZXZpZXdfc2NyZWVuc2hvdChtb2RlPVwiZW1iZWRkZWRcIikgaW4gRURJVCBtb2RlIOKAlCBubyBQSUUgbmVlZGVkOyAoYikgZGVidWdfZ2FtZV9jb21tYW5kKHR5cGU9XCJzY3JlZW5zaG90XCIpIHZpYSBHYW1lRGVidWdDbGllbnQgb24gYnJvd3NlciBwcmV2aWV3LiBQZW5kaW5nIHYyLjkgcmVmZXJlbmNlLXByb2plY3QgY29tcGFyaXNvbiB0byBmaW5kIGEgc2FmZXIgY2FsbCBwYXRoLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgb3A6IHouZW51bShbJ3N0YXJ0JywgJ3N0b3AnXSkuZGVzY3JpYmUoJ1wic3RhcnRcIiBlbnRlcnMgUElFIHBsYXkgbW9kZSAoZXF1aXZhbGVudCB0byBjbGlja2luZyB0aGUgdG9vbGJhciBwbGF5IGJ1dHRvbikg4oCUIFJFUVVJUkVTIGFja25vd2xlZGdlRnJlZXplUmlzaz10cnVlIG9uIGNvY29zIDMuOC43IGR1ZSB0byBsYW5kbWluZSAjMTYuIFwic3RvcFwiIGV4aXRzIFBJRSBwbGF5IGFuZCByZXR1cm5zIHRvIHNjZW5lIG1vZGUgKGFsd2F5cyBzYWZlKS4nKSxcbiAgICAgICAgICAgICAgICAgICAgYWNrbm93bGVkZ2VGcmVlemVSaXNrOiB6LmJvb2xlYW4oKS5kZWZhdWx0KGZhbHNlKS5kZXNjcmliZSgnUmVxdWlyZWQgdG8gYmUgdHJ1ZSBmb3Igb3A9XCJzdGFydFwiIG9uIGNvY29zIDMuOC43IGR1ZSB0byBsYW5kbWluZSAjMTYgKHNvZnRSZWxvYWRTY2VuZSByYWNlIHRoYXQgZnJlZXplcyB0aGUgZWRpdG9yKS4gU2V0IHRydWUgT05MWSB3aGVuIHRoZSBodW1hbiB1c2VyIGhhcyBleHBsaWNpdGx5IGFjY2VwdGVkIHRoZSByaXNrIGFuZCBpcyBwcmVwYXJlZCB0byBwcmVzcyBDdHJsK1IgaWYgdGhlIGVkaXRvciBmcmVlemVzLiBJZ25vcmVkIGZvciBvcD1cInN0b3BcIiB3aGljaCBpcyByZWxpYWJsZS4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMucHJldmlld0NvbnRyb2woYS5vcCwgYS5hY2tub3dsZWRnZUZyZWV6ZVJpc2sgPz8gZmFsc2UpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnZ2V0X3NjcmlwdF9kaWFnbm9zdGljX2NvbnRleHQnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnUmVhZCBhIHdpbmRvdyBvZiBzb3VyY2UgbGluZXMgYXJvdW5kIGEgZGlhZ25vc3RpYyBsb2NhdGlvbiBzbyBBSSBjYW4gcmVhZCB0aGUgb2ZmZW5kaW5nIGNvZGUgd2l0aG91dCBhIHNlcGFyYXRlIGZpbGUgcmVhZC4gUGFpciB3aXRoIHJ1bl9zY3JpcHRfZGlhZ25vc3RpY3M6IHBhc3MgZmlsZS9saW5lIGZyb20gZWFjaCBkaWFnbm9zdGljIHRvIGZldGNoIGNvbnRleHQuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBmaWxlOiB6LnN0cmluZygpLmRlc2NyaWJlKCdBYnNvbHV0ZSBvciBwcm9qZWN0LXJlbGF0aXZlIHBhdGggdG8gdGhlIHNvdXJjZSBmaWxlLiBEaWFnbm9zdGljcyBmcm9tIHJ1bl9zY3JpcHRfZGlhZ25vc3RpY3MgYWxyZWFkeSB1c2UgYSBwYXRoIHRzYyBlbWl0dGVkLCB3aGljaCBpcyBzdWl0YWJsZSBoZXJlLicpLFxuICAgICAgICAgICAgICAgICAgICBsaW5lOiB6Lm51bWJlcigpLm1pbigxKS5kZXNjcmliZSgnMS1iYXNlZCBsaW5lIG51bWJlciB0aGF0IHRoZSBkaWFnbm9zdGljIHBvaW50cyBhdC4nKSxcbiAgICAgICAgICAgICAgICAgICAgY29udGV4dExpbmVzOiB6Lm51bWJlcigpLm1pbigwKS5tYXgoNTApLmRlZmF1bHQoNSkuZGVzY3JpYmUoJ051bWJlciBvZiBsaW5lcyB0byBpbmNsdWRlIGJlZm9yZSBhbmQgYWZ0ZXIgdGhlIHRhcmdldCBsaW5lLiBEZWZhdWx0IDUgKMKxNSDihpIgMTEtbGluZSB3aW5kb3cpLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy5nZXRTY3JpcHREaWFnbm9zdGljQ29udGV4dChhLmZpbGUsIGEubGluZSwgYS5jb250ZXh0TGluZXMpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgXTtcbiAgICAgICAgdGhpcy5leGVjID0gZGVmaW5lVG9vbHMoZGVmcyk7XG4gICAgfVxuXG4gICAgZ2V0VG9vbHMoKTogVG9vbERlZmluaXRpb25bXSB7IHJldHVybiB0aGlzLmV4ZWMuZ2V0VG9vbHMoKTsgfVxuICAgIGV4ZWN1dGUodG9vbE5hbWU6IHN0cmluZywgYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHsgcmV0dXJuIHRoaXMuZXhlYy5leGVjdXRlKHRvb2xOYW1lLCBhcmdzKTsgfVxuXG4gICAgLy8gQ29tcGF0IHBhdGg6IHByZXNlcnZlIHRoZSBwcmUtdjIuMy4wIHJlc3BvbnNlIHNoYXBlXG4gICAgLy8ge3N1Y2Nlc3MsIGRhdGE6IHtyZXN1bHQsIG1lc3NhZ2U6ICdTY3JpcHQgZXhlY3V0ZWQgc3VjY2Vzc2Z1bGx5J319XG4gICAgLy8gc28gb2xkZXIgY2FsbGVycyByZWFkaW5nIGRhdGEubWVzc2FnZSBrZWVwIHdvcmtpbmcuXG4gICAgcHJpdmF0ZSBhc3luYyBleGVjdXRlU2NyaXB0Q29tcGF0KHNjcmlwdDogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3Qgb3V0ID0gYXdhaXQgdGhpcy5leGVjdXRlSmF2YVNjcmlwdChzY3JpcHQsICdzY2VuZScpO1xuICAgICAgICBpZiAob3V0LnN1Y2Nlc3MgJiYgb3V0LmRhdGEgJiYgJ3Jlc3VsdCcgaW4gb3V0LmRhdGEpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdDogb3V0LmRhdGEucmVzdWx0LFxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiAnU2NyaXB0IGV4ZWN1dGVkIHN1Y2Nlc3NmdWxseScsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG91dDtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGNsZWFyQ29uc29sZSgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gTm90ZTogRWRpdG9yLk1lc3NhZ2Uuc2VuZCBtYXkgbm90IHJldHVybiBhIHByb21pc2UgaW4gYWxsIHZlcnNpb25zXG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5zZW5kKCdjb25zb2xlJywgJ2NsZWFyJyk7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogJ0NvbnNvbGUgY2xlYXJlZCBzdWNjZXNzZnVsbHknXG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnIubWVzc2FnZSB9O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBleGVjdXRlSmF2YVNjcmlwdChjb2RlOiBzdHJpbmcsIGNvbnRleHQ6ICdzY2VuZScgfCAnZWRpdG9yJyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGlmIChjb250ZXh0ID09PSAnc2NlbmUnKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5leGVjdXRlSW5TY2VuZUNvbnRleHQoY29kZSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGNvbnRleHQgPT09ICdlZGl0b3InKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5leGVjdXRlSW5FZGl0b3JDb250ZXh0KGNvZGUpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYFVua25vd24gZXhlY3V0ZV9qYXZhc2NyaXB0IGNvbnRleHQ6ICR7Y29udGV4dH1gIH07XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBleGVjdXRlSW5TY2VuZUNvbnRleHQoY29kZTogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdleGVjdXRlLXNjZW5lLXNjcmlwdCcsIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnY29uc29sZScsXG4gICAgICAgICAgICAgICAgbWV0aG9kOiAnZXZhbCcsXG4gICAgICAgICAgICAgICAgYXJnczogW2NvZGVdXG4gICAgICAgICAgICB9KS50aGVuKChyZXN1bHQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb250ZXh0OiAnc2NlbmUnLFxuICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0OiByZXN1bHQsXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdTY2VuZSBzY3JpcHQgZXhlY3V0ZWQgc3VjY2Vzc2Z1bGx5J1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGV4ZWN1dGVJbkVkaXRvckNvbnRleHQoY29kZTogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgaWYgKCFpc0VkaXRvckNvbnRleHRFdmFsRW5hYmxlZCgpKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgIGVycm9yOiAnRWRpdG9yIGNvbnRleHQgZXZhbCBpcyBkaXNhYmxlZC4gRW5hYmxlIGBlbmFibGVFZGl0b3JDb250ZXh0RXZhbGAgaW4gTUNQIHNlcnZlciBzZXR0aW5ncyAocGFuZWwgVUkpIHRvIG9wdCBpbi4gVGhpcyBncmFudHMgQUktZ2VuZXJhdGVkIGNvZGUgYWNjZXNzIHRvIEVkaXRvci5NZXNzYWdlICsgTm9kZSBmcyBBUElzIGluIHRoZSBob3N0IHByb2Nlc3M7IG9ubHkgZW5hYmxlIHdoZW4geW91IHRydXN0IHRoZSB1cHN0cmVhbSBwcm9tcHQgc291cmNlLicsXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBXcmFwIGluIGFzeW5jIElJRkUgc28gQUkgY2FuIHVzZSB0b3AtbGV2ZWwgYXdhaXQgdHJhbnNwYXJlbnRseTtcbiAgICAgICAgICAgIC8vIGFsc28gZ2l2ZXMgdXMgYSBjbGVhbiBQcm9taXNlLWJhc2VkIHJldHVybiBwYXRoIHJlZ2FyZGxlc3Mgb2ZcbiAgICAgICAgICAgIC8vIHdoZXRoZXIgdGhlIHVzZXIgY29kZSByZXR1cm5zIGEgUHJvbWlzZSBvciBhIHN5bmMgdmFsdWUuXG4gICAgICAgICAgICBjb25zdCB3cmFwcGVkID0gYChhc3luYyAoKSA9PiB7ICR7Y29kZX0gXFxuIH0pKClgO1xuICAgICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWV2YWxcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0ICgwLCBldmFsKSh3cmFwcGVkKTtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRleHQ6ICdlZGl0b3InLFxuICAgICAgICAgICAgICAgICAgICByZXN1bHQ6IHJlc3VsdCxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdFZGl0b3Igc2NyaXB0IGV4ZWN1dGVkIHN1Y2Nlc3NmdWxseScsXG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBlcnJvcjogYEVkaXRvciBldmFsIGZhaWxlZDogJHtlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycil9YCxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldE5vZGVUcmVlKHJvb3RVdWlkPzogc3RyaW5nLCBtYXhEZXB0aDogbnVtYmVyID0gMTApOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGJ1aWxkVHJlZSA9IGFzeW5jIChub2RlVXVpZDogc3RyaW5nLCBkZXB0aDogbnVtYmVyID0gMCk6IFByb21pc2U8YW55PiA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGRlcHRoID49IG1heERlcHRoKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7IHRydW5jYXRlZDogdHJ1ZSB9O1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG5vZGVEYXRhID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktbm9kZScsIG5vZGVVdWlkKTtcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRyZWUgPSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiBub2RlRGF0YS51dWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogbm9kZURhdGEubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGFjdGl2ZTogbm9kZURhdGEuYWN0aXZlLFxuICAgICAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50czogKG5vZGVEYXRhIGFzIGFueSkuY29tcG9uZW50cyA/IChub2RlRGF0YSBhcyBhbnkpLmNvbXBvbmVudHMubWFwKChjOiBhbnkpID0+IGMuX190eXBlX18pIDogW10sXG4gICAgICAgICAgICAgICAgICAgICAgICBjaGlsZENvdW50OiBub2RlRGF0YS5jaGlsZHJlbiA/IG5vZGVEYXRhLmNoaWxkcmVuLmxlbmd0aCA6IDAsXG4gICAgICAgICAgICAgICAgICAgICAgICBjaGlsZHJlbjogW10gYXMgYW55W11cbiAgICAgICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAobm9kZURhdGEuY2hpbGRyZW4gJiYgbm9kZURhdGEuY2hpbGRyZW4ubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBjaGlsZElkIG9mIG5vZGVEYXRhLmNoaWxkcmVuKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY2hpbGRUcmVlID0gYXdhaXQgYnVpbGRUcmVlKGNoaWxkSWQsIGRlcHRoICsgMSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHJlZS5jaGlsZHJlbi5wdXNoKGNoaWxkVHJlZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJlZTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4geyBlcnJvcjogZXJyLm1lc3NhZ2UgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBpZiAocm9vdFV1aWQpIHtcbiAgICAgICAgICAgICAgICBidWlsZFRyZWUocm9vdFV1aWQpLnRoZW4odHJlZSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoeyBzdWNjZXNzOiB0cnVlLCBkYXRhOiB0cmVlIH0pO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1oaWVyYXJjaHknKS50aGVuKGFzeW5jIChoaWVyYXJjaHk6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB0cmVlcyA9IFtdO1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IHJvb3ROb2RlIG9mIGhpZXJhcmNoeS5jaGlsZHJlbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgdHJlZSA9IGF3YWl0IGJ1aWxkVHJlZShyb290Tm9kZS51dWlkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyZWVzLnB1c2godHJlZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IHRyZWVzIH0pO1xuICAgICAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVyci5tZXNzYWdlIH0pO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldFBlcmZvcm1hbmNlU3RhdHMoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1wZXJmb3JtYW5jZScpLnRoZW4oKHN0YXRzOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBwZXJmU3RhdHM6IFBlcmZvcm1hbmNlU3RhdHMgPSB7XG4gICAgICAgICAgICAgICAgICAgIG5vZGVDb3VudDogc3RhdHMubm9kZUNvdW50IHx8IDAsXG4gICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudENvdW50OiBzdGF0cy5jb21wb25lbnRDb3VudCB8fCAwLFxuICAgICAgICAgICAgICAgICAgICBkcmF3Q2FsbHM6IHN0YXRzLmRyYXdDYWxscyB8fCAwLFxuICAgICAgICAgICAgICAgICAgICB0cmlhbmdsZXM6IHN0YXRzLnRyaWFuZ2xlcyB8fCAwLFxuICAgICAgICAgICAgICAgICAgICBtZW1vcnk6IHN0YXRzLm1lbW9yeSB8fCB7fVxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IHBlcmZTdGF0cyB9KTtcbiAgICAgICAgICAgIH0pLmNhdGNoKCgpID0+IHtcbiAgICAgICAgICAgICAgICAvLyBGYWxsYmFjayB0byBiYXNpYyBzdGF0c1xuICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiAnUGVyZm9ybWFuY2Ugc3RhdHMgbm90IGF2YWlsYWJsZSBpbiBlZGl0IG1vZGUnXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHZhbGlkYXRlU2NlbmUob3B0aW9uczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgaXNzdWVzOiBWYWxpZGF0aW9uSXNzdWVbXSA9IFtdO1xuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBDaGVjayBmb3IgbWlzc2luZyBhc3NldHNcbiAgICAgICAgICAgIGlmIChvcHRpb25zLmNoZWNrTWlzc2luZ0Fzc2V0cykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGFzc2V0Q2hlY2sgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdjaGVjay1taXNzaW5nLWFzc2V0cycpO1xuICAgICAgICAgICAgICAgIGlmIChhc3NldENoZWNrICYmIGFzc2V0Q2hlY2subWlzc2luZykge1xuICAgICAgICAgICAgICAgICAgICBpc3N1ZXMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiAnZXJyb3InLFxuICAgICAgICAgICAgICAgICAgICAgICAgY2F0ZWdvcnk6ICdhc3NldHMnLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYEZvdW5kICR7YXNzZXRDaGVjay5taXNzaW5nLmxlbmd0aH0gbWlzc2luZyBhc3NldCByZWZlcmVuY2VzYCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGRldGFpbHM6IGFzc2V0Q2hlY2subWlzc2luZ1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIENoZWNrIGZvciBwZXJmb3JtYW5jZSBpc3N1ZXNcbiAgICAgICAgICAgIGlmIChvcHRpb25zLmNoZWNrUGVyZm9ybWFuY2UpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBoaWVyYXJjaHkgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1oaWVyYXJjaHknKTtcbiAgICAgICAgICAgICAgICBjb25zdCBub2RlQ291bnQgPSB0aGlzLmNvdW50Tm9kZXMoaGllcmFyY2h5LmNoaWxkcmVuKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpZiAobm9kZUNvdW50ID4gMTAwMCkge1xuICAgICAgICAgICAgICAgICAgICBpc3N1ZXMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiAnd2FybmluZycsXG4gICAgICAgICAgICAgICAgICAgICAgICBjYXRlZ29yeTogJ3BlcmZvcm1hbmNlJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBIaWdoIG5vZGUgY291bnQ6ICR7bm9kZUNvdW50fSBub2RlcyAocmVjb21tZW5kZWQgPCAxMDAwKWAsXG4gICAgICAgICAgICAgICAgICAgICAgICBzdWdnZXN0aW9uOiAnQ29uc2lkZXIgdXNpbmcgb2JqZWN0IHBvb2xpbmcgb3Igc2NlbmUgb3B0aW1pemF0aW9uJ1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdDogVmFsaWRhdGlvblJlc3VsdCA9IHtcbiAgICAgICAgICAgICAgICB2YWxpZDogaXNzdWVzLmxlbmd0aCA9PT0gMCxcbiAgICAgICAgICAgICAgICBpc3N1ZUNvdW50OiBpc3N1ZXMubGVuZ3RoLFxuICAgICAgICAgICAgICAgIGlzc3VlczogaXNzdWVzXG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBkYXRhOiByZXN1bHQgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyLm1lc3NhZ2UgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgY291bnROb2Rlcyhub2RlczogYW55W10pOiBudW1iZXIge1xuICAgICAgICBsZXQgY291bnQgPSBub2Rlcy5sZW5ndGg7XG4gICAgICAgIGZvciAoY29uc3Qgbm9kZSBvZiBub2Rlcykge1xuICAgICAgICAgICAgaWYgKG5vZGUuY2hpbGRyZW4pIHtcbiAgICAgICAgICAgICAgICBjb3VudCArPSB0aGlzLmNvdW50Tm9kZXMobm9kZS5jaGlsZHJlbik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGNvdW50O1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2V0RWRpdG9ySW5mbygpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBpbmZvID0ge1xuICAgICAgICAgICAgZWRpdG9yOiB7XG4gICAgICAgICAgICAgICAgdmVyc2lvbjogKEVkaXRvciBhcyBhbnkpLnZlcnNpb25zPy5lZGl0b3IgfHwgJ1Vua25vd24nLFxuICAgICAgICAgICAgICAgIGNvY29zVmVyc2lvbjogKEVkaXRvciBhcyBhbnkpLnZlcnNpb25zPy5jb2NvcyB8fCAnVW5rbm93bicsXG4gICAgICAgICAgICAgICAgcGxhdGZvcm06IHByb2Nlc3MucGxhdGZvcm0sXG4gICAgICAgICAgICAgICAgYXJjaDogcHJvY2Vzcy5hcmNoLFxuICAgICAgICAgICAgICAgIG5vZGVWZXJzaW9uOiBwcm9jZXNzLnZlcnNpb25cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBwcm9qZWN0OiB7XG4gICAgICAgICAgICAgICAgbmFtZTogRWRpdG9yLlByb2plY3QubmFtZSxcbiAgICAgICAgICAgICAgICBwYXRoOiBFZGl0b3IuUHJvamVjdC5wYXRoLFxuICAgICAgICAgICAgICAgIHV1aWQ6IEVkaXRvci5Qcm9qZWN0LnV1aWRcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBtZW1vcnk6IHByb2Nlc3MubWVtb3J5VXNhZ2UoKSxcbiAgICAgICAgICAgIHVwdGltZTogcHJvY2Vzcy51cHRpbWUoKVxuICAgICAgICB9O1xuXG4gICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IGluZm8gfTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHJlc29sdmVQcm9qZWN0TG9nUGF0aCgpOiB7IHBhdGg6IHN0cmluZyB9IHwgeyBlcnJvcjogc3RyaW5nIH0ge1xuICAgICAgICBpZiAoIUVkaXRvci5Qcm9qZWN0IHx8ICFFZGl0b3IuUHJvamVjdC5wYXRoKSB7XG4gICAgICAgICAgICByZXR1cm4geyBlcnJvcjogJ0VkaXRvci5Qcm9qZWN0LnBhdGggaXMgbm90IGF2YWlsYWJsZTsgY2Fubm90IGxvY2F0ZSBwcm9qZWN0IGxvZyBmaWxlLicgfTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBsb2dQYXRoID0gcGF0aC5qb2luKEVkaXRvci5Qcm9qZWN0LnBhdGgsICd0ZW1wL2xvZ3MvcHJvamVjdC5sb2cnKTtcbiAgICAgICAgaWYgKCFmcy5leGlzdHNTeW5jKGxvZ1BhdGgpKSB7XG4gICAgICAgICAgICByZXR1cm4geyBlcnJvcjogYFByb2plY3QgbG9nIGZpbGUgbm90IGZvdW5kIGF0ICR7bG9nUGF0aH1gIH07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgcGF0aDogbG9nUGF0aCB9O1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2V0UHJvamVjdExvZ3MobGluZXM6IG51bWJlciA9IDEwMCwgZmlsdGVyS2V5d29yZD86IHN0cmluZywgbG9nTGV2ZWw6IHN0cmluZyA9ICdBTEwnKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJlc29sdmVkID0gdGhpcy5yZXNvbHZlUHJvamVjdExvZ1BhdGgoKTtcbiAgICAgICAgICAgIGlmICgnZXJyb3InIGluIHJlc29sdmVkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiByZXNvbHZlZC5lcnJvciB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgbG9nRmlsZVBhdGggPSByZXNvbHZlZC5wYXRoO1xuXG4gICAgICAgICAgICAvLyBSZWFkIHRoZSBmaWxlIGNvbnRlbnRcbiAgICAgICAgICAgIGNvbnN0IGxvZ0NvbnRlbnQgPSBmcy5yZWFkRmlsZVN5bmMobG9nRmlsZVBhdGgsICd1dGY4Jyk7XG4gICAgICAgICAgICBjb25zdCBsb2dMaW5lcyA9IGxvZ0NvbnRlbnQuc3BsaXQoJ1xcbicpLmZpbHRlcihsaW5lID0+IGxpbmUudHJpbSgpICE9PSAnJyk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIEdldCB0aGUgbGFzdCBOIGxpbmVzXG4gICAgICAgICAgICBjb25zdCByZWNlbnRMaW5lcyA9IGxvZ0xpbmVzLnNsaWNlKC1saW5lcyk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIEFwcGx5IGZpbHRlcnNcbiAgICAgICAgICAgIGxldCBmaWx0ZXJlZExpbmVzID0gcmVjZW50TGluZXM7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIEZpbHRlciBieSBsb2cgbGV2ZWwgaWYgbm90ICdBTEwnXG4gICAgICAgICAgICBpZiAobG9nTGV2ZWwgIT09ICdBTEwnKSB7XG4gICAgICAgICAgICAgICAgZmlsdGVyZWRMaW5lcyA9IGZpbHRlcmVkTGluZXMuZmlsdGVyKGxpbmUgPT4gXG4gICAgICAgICAgICAgICAgICAgIGxpbmUuaW5jbHVkZXMoYFske2xvZ0xldmVsfV1gKSB8fCBsaW5lLmluY2x1ZGVzKGxvZ0xldmVsLnRvTG93ZXJDYXNlKCkpXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gRmlsdGVyIGJ5IGtleXdvcmQgaWYgcHJvdmlkZWRcbiAgICAgICAgICAgIGlmIChmaWx0ZXJLZXl3b3JkKSB7XG4gICAgICAgICAgICAgICAgZmlsdGVyZWRMaW5lcyA9IGZpbHRlcmVkTGluZXMuZmlsdGVyKGxpbmUgPT4gXG4gICAgICAgICAgICAgICAgICAgIGxpbmUudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhmaWx0ZXJLZXl3b3JkLnRvTG93ZXJDYXNlKCkpXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgdG90YWxMaW5lczogbG9nTGluZXMubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICByZXF1ZXN0ZWRMaW5lczogbGluZXMsXG4gICAgICAgICAgICAgICAgICAgIGZpbHRlcmVkTGluZXM6IGZpbHRlcmVkTGluZXMubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICBsb2dMZXZlbDogbG9nTGV2ZWwsXG4gICAgICAgICAgICAgICAgICAgIGZpbHRlcktleXdvcmQ6IGZpbHRlcktleXdvcmQgfHwgbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgbG9nczogZmlsdGVyZWRMaW5lcyxcbiAgICAgICAgICAgICAgICAgICAgbG9nRmlsZVBhdGg6IGxvZ0ZpbGVQYXRoXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBlcnJvcjogYEZhaWxlZCB0byByZWFkIHByb2plY3QgbG9nczogJHtlcnJvci5tZXNzYWdlfWBcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldExvZ0ZpbGVJbmZvKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByZXNvbHZlZCA9IHRoaXMucmVzb2x2ZVByb2plY3RMb2dQYXRoKCk7XG4gICAgICAgICAgICBpZiAoJ2Vycm9yJyBpbiByZXNvbHZlZCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogcmVzb2x2ZWQuZXJyb3IgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGxvZ0ZpbGVQYXRoID0gcmVzb2x2ZWQucGF0aDtcblxuICAgICAgICAgICAgY29uc3Qgc3RhdHMgPSBmcy5zdGF0U3luYyhsb2dGaWxlUGF0aCk7XG4gICAgICAgICAgICBjb25zdCBsb2dDb250ZW50ID0gZnMucmVhZEZpbGVTeW5jKGxvZ0ZpbGVQYXRoLCAndXRmOCcpO1xuICAgICAgICAgICAgY29uc3QgbGluZUNvdW50ID0gbG9nQ29udGVudC5zcGxpdCgnXFxuJykuZmlsdGVyKGxpbmUgPT4gbGluZS50cmltKCkgIT09ICcnKS5sZW5ndGg7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIGZpbGVQYXRoOiBsb2dGaWxlUGF0aCxcbiAgICAgICAgICAgICAgICAgICAgZmlsZVNpemU6IHN0YXRzLnNpemUsXG4gICAgICAgICAgICAgICAgICAgIGZpbGVTaXplRm9ybWF0dGVkOiB0aGlzLmZvcm1hdEZpbGVTaXplKHN0YXRzLnNpemUpLFxuICAgICAgICAgICAgICAgICAgICBsYXN0TW9kaWZpZWQ6IHN0YXRzLm10aW1lLnRvSVNPU3RyaW5nKCksXG4gICAgICAgICAgICAgICAgICAgIGxpbmVDb3VudDogbGluZUNvdW50LFxuICAgICAgICAgICAgICAgICAgICBjcmVhdGVkOiBzdGF0cy5iaXJ0aHRpbWUudG9JU09TdHJpbmcoKSxcbiAgICAgICAgICAgICAgICAgICAgYWNjZXNzaWJsZTogZnMuY29uc3RhbnRzLlJfT0tcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgIGVycm9yOiBgRmFpbGVkIHRvIGdldCBsb2cgZmlsZSBpbmZvOiAke2Vycm9yLm1lc3NhZ2V9YFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgc2VhcmNoUHJvamVjdExvZ3MocGF0dGVybjogc3RyaW5nLCBtYXhSZXN1bHRzOiBudW1iZXIgPSAyMCwgY29udGV4dExpbmVzOiBudW1iZXIgPSAyKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJlc29sdmVkID0gdGhpcy5yZXNvbHZlUHJvamVjdExvZ1BhdGgoKTtcbiAgICAgICAgICAgIGlmICgnZXJyb3InIGluIHJlc29sdmVkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiByZXNvbHZlZC5lcnJvciB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgbG9nRmlsZVBhdGggPSByZXNvbHZlZC5wYXRoO1xuXG4gICAgICAgICAgICBjb25zdCBsb2dDb250ZW50ID0gZnMucmVhZEZpbGVTeW5jKGxvZ0ZpbGVQYXRoLCAndXRmOCcpO1xuICAgICAgICAgICAgY29uc3QgbG9nTGluZXMgPSBsb2dDb250ZW50LnNwbGl0KCdcXG4nKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gQ3JlYXRlIHJlZ2V4IHBhdHRlcm4gKHN1cHBvcnQgYm90aCBzdHJpbmcgYW5kIHJlZ2V4IHBhdHRlcm5zKVxuICAgICAgICAgICAgbGV0IHJlZ2V4OiBSZWdFeHA7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHJlZ2V4ID0gbmV3IFJlZ0V4cChwYXR0ZXJuLCAnZ2knKTtcbiAgICAgICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgICAgIC8vIElmIHBhdHRlcm4gaXMgbm90IHZhbGlkIHJlZ2V4LCB0cmVhdCBhcyBsaXRlcmFsIHN0cmluZ1xuICAgICAgICAgICAgICAgIHJlZ2V4ID0gbmV3IFJlZ0V4cChwYXR0ZXJuLnJlcGxhY2UoL1suKis/XiR7fSgpfFtcXF1cXFxcXS9nLCAnXFxcXCQmJyksICdnaScpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICBjb25zdCBtYXRjaGVzOiBhbnlbXSA9IFtdO1xuICAgICAgICAgICAgbGV0IHJlc3VsdENvdW50ID0gMDtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBsb2dMaW5lcy5sZW5ndGggJiYgcmVzdWx0Q291bnQgPCBtYXhSZXN1bHRzOyBpKyspIHtcbiAgICAgICAgICAgICAgICBjb25zdCBsaW5lID0gbG9nTGluZXNbaV07XG4gICAgICAgICAgICAgICAgaWYgKHJlZ2V4LnRlc3QobGluZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gR2V0IGNvbnRleHQgbGluZXNcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY29udGV4dFN0YXJ0ID0gTWF0aC5tYXgoMCwgaSAtIGNvbnRleHRMaW5lcyk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbnRleHRFbmQgPSBNYXRoLm1pbihsb2dMaW5lcy5sZW5ndGggLSAxLCBpICsgY29udGV4dExpbmVzKTtcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbnRleHRMaW5lc0FycmF5ID0gW107XG4gICAgICAgICAgICAgICAgICAgIGZvciAobGV0IGogPSBjb250ZXh0U3RhcnQ7IGogPD0gY29udGV4dEVuZDsgaisrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb250ZXh0TGluZXNBcnJheS5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsaW5lTnVtYmVyOiBqICsgMSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb250ZW50OiBsb2dMaW5lc1tqXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpc01hdGNoOiBqID09PSBpXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgbWF0Y2hlcy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxpbmVOdW1iZXI6IGkgKyAxLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWF0Y2hlZExpbmU6IGxpbmUsXG4gICAgICAgICAgICAgICAgICAgICAgICBjb250ZXh0OiBjb250ZXh0TGluZXNBcnJheVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdENvdW50Kys7XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAvLyBSZXNldCByZWdleCBsYXN0SW5kZXggZm9yIGdsb2JhbCBzZWFyY2hcbiAgICAgICAgICAgICAgICAgICAgcmVnZXgubGFzdEluZGV4ID0gMDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIHBhdHRlcm46IHBhdHRlcm4sXG4gICAgICAgICAgICAgICAgICAgIHRvdGFsTWF0Y2hlczogbWF0Y2hlcy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgIG1heFJlc3VsdHM6IG1heFJlc3VsdHMsXG4gICAgICAgICAgICAgICAgICAgIGNvbnRleHRMaW5lczogY29udGV4dExpbmVzLFxuICAgICAgICAgICAgICAgICAgICBsb2dGaWxlUGF0aDogbG9nRmlsZVBhdGgsXG4gICAgICAgICAgICAgICAgICAgIG1hdGNoZXM6IG1hdGNoZXNcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgIGVycm9yOiBgRmFpbGVkIHRvIHNlYXJjaCBwcm9qZWN0IGxvZ3M6ICR7ZXJyb3IubWVzc2FnZX1gXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBmb3JtYXRGaWxlU2l6ZShieXRlczogbnVtYmVyKTogc3RyaW5nIHtcbiAgICAgICAgY29uc3QgdW5pdHMgPSBbJ0InLCAnS0InLCAnTUInLCAnR0InXTtcbiAgICAgICAgbGV0IHNpemUgPSBieXRlcztcbiAgICAgICAgbGV0IHVuaXRJbmRleCA9IDA7XG5cbiAgICAgICAgd2hpbGUgKHNpemUgPj0gMTAyNCAmJiB1bml0SW5kZXggPCB1bml0cy5sZW5ndGggLSAxKSB7XG4gICAgICAgICAgICBzaXplIC89IDEwMjQ7XG4gICAgICAgICAgICB1bml0SW5kZXgrKztcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBgJHtzaXplLnRvRml4ZWQoMil9ICR7dW5pdHNbdW5pdEluZGV4XX1gO1xuICAgIH1cblxuICAgIHByaXZhdGUgcGlja1dpbmRvdyh0aXRsZVN1YnN0cmluZz86IHN0cmluZyk6IGFueSB7XG4gICAgICAgIC8vIExhenkgcmVxdWlyZSBzbyB0aGF0IG5vbi1FbGVjdHJvbiBjb250ZXh0cyAoZS5nLiB1bml0IHRlc3RzLCBzbW9rZVxuICAgICAgICAvLyBzY3JpcHQgd2l0aCBzdHViIHJlZ2lzdHJ5KSBjYW4gc3RpbGwgaW1wb3J0IHRoaXMgbW9kdWxlLlxuICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLXZhci1yZXF1aXJlc1xuICAgICAgICBjb25zdCBlbGVjdHJvbiA9IHJlcXVpcmUoJ2VsZWN0cm9uJyk7XG4gICAgICAgIGNvbnN0IEJXID0gZWxlY3Ryb24uQnJvd3NlcldpbmRvdztcbiAgICAgICAgaWYgKCFCVykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdFbGVjdHJvbiBCcm93c2VyV2luZG93IEFQSSB1bmF2YWlsYWJsZTsgc2NyZWVuc2hvdCB0b29sIHJlcXVpcmVzIHJ1bm5pbmcgaW5zaWRlIENvY29zIGVkaXRvciBob3N0IHByb2Nlc3MuJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRpdGxlU3Vic3RyaW5nKSB7XG4gICAgICAgICAgICBjb25zdCBtYXRjaGVzID0gQlcuZ2V0QWxsV2luZG93cygpLmZpbHRlcigodzogYW55KSA9PlxuICAgICAgICAgICAgICAgIHcgJiYgIXcuaXNEZXN0cm95ZWQoKSAmJiAody5nZXRUaXRsZT8uKCkgfHwgJycpLmluY2x1ZGVzKHRpdGxlU3Vic3RyaW5nKSk7XG4gICAgICAgICAgICBpZiAobWF0Y2hlcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE5vIEVsZWN0cm9uIHdpbmRvdyB0aXRsZSBtYXRjaGVkIHN1YnN0cmluZzogJHt0aXRsZVN1YnN0cmluZ31gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBtYXRjaGVzWzBdO1xuICAgICAgICB9XG4gICAgICAgIC8vIHYyLjMuMSByZXZpZXcgZml4OiBmb2N1c2VkIHdpbmRvdyBtYXkgYmUgYSB0cmFuc2llbnQgcHJldmlldyBwb3B1cC5cbiAgICAgICAgLy8gUHJlZmVyIGEgbm9uLVByZXZpZXcgd2luZG93IHNvIGRlZmF1bHQgc2NyZWVuc2hvdHMgdGFyZ2V0IHRoZSBtYWluXG4gICAgICAgIC8vIGVkaXRvciBzdXJmYWNlLiBDYWxsZXIgY2FuIHN0aWxsIHBhc3MgdGl0bGVTdWJzdHJpbmc9J1ByZXZpZXcnIHRvXG4gICAgICAgIC8vIGV4cGxpY2l0bHkgdGFyZ2V0IHRoZSBwcmV2aWV3IHdoZW4gd2FudGVkLlxuICAgICAgICBjb25zdCBhbGw6IGFueVtdID0gQlcuZ2V0QWxsV2luZG93cygpLmZpbHRlcigodzogYW55KSA9PiB3ICYmICF3LmlzRGVzdHJveWVkKCkpO1xuICAgICAgICBpZiAoYWxsLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyBsaXZlIEVsZWN0cm9uIHdpbmRvd3M7IGNhbm5vdCBjYXB0dXJlIHNjcmVlbnNob3QuJyk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgaXNQcmV2aWV3ID0gKHc6IGFueSkgPT4gL3ByZXZpZXcvaS50ZXN0KHcuZ2V0VGl0bGU/LigpIHx8ICcnKTtcbiAgICAgICAgY29uc3Qgbm9uUHJldmlldyA9IGFsbC5maWx0ZXIoKHc6IGFueSkgPT4gIWlzUHJldmlldyh3KSk7XG4gICAgICAgIGNvbnN0IGZvY3VzZWQgPSBCVy5nZXRGb2N1c2VkV2luZG93Py4oKTtcbiAgICAgICAgaWYgKGZvY3VzZWQgJiYgIWZvY3VzZWQuaXNEZXN0cm95ZWQoKSAmJiAhaXNQcmV2aWV3KGZvY3VzZWQpKSByZXR1cm4gZm9jdXNlZDtcbiAgICAgICAgaWYgKG5vblByZXZpZXcubGVuZ3RoID4gMCkgcmV0dXJuIG5vblByZXZpZXdbMF07XG4gICAgICAgIHJldHVybiBhbGxbMF07XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBlbnN1cmVDYXB0dXJlRGlyKCk6IHsgb2s6IHRydWU7IGRpcjogc3RyaW5nIH0gfCB7IG9rOiBmYWxzZTsgZXJyb3I6IHN0cmluZyB9IHtcbiAgICAgICAgaWYgKCFFZGl0b3IuUHJvamVjdCB8fCAhRWRpdG9yLlByb2plY3QucGF0aCkge1xuICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogJ0VkaXRvci5Qcm9qZWN0LnBhdGggaXMgbm90IGF2YWlsYWJsZTsgY2Fubm90IHJlc29sdmUgY2FwdHVyZSBvdXRwdXQgZGlyZWN0b3J5LicgfTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBkaXIgPSBwYXRoLmpvaW4oRWRpdG9yLlByb2plY3QucGF0aCwgJ3RlbXAnLCAnbWNwLWNhcHR1cmVzJyk7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBmcy5ta2RpclN5bmMoZGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiB0cnVlLCBkaXIgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGBGYWlsZWQgdG8gY3JlYXRlIGNhcHR1cmUgZGlyOiAke2Vycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKX1gIH07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyB2Mi44LjAgVC1WMjgtMiAoY2FycnlvdmVyIGZyb20gdjIuNy4wIENvZGV4IHNpbmdsZS1yZXZpZXdlciDwn5+hKVxuICAgIC8vIOKGkiB2Mi44LjEgcm91bmQtMSBmaXggKENvZGV4IPCflLQgKyBDbGF1ZGUg8J+foSk6IHRoZSB2Mi44LjAgaGVscGVyXG4gICAgLy8gcmVhbHBhdGgnZCBgZGlyYCBhbmQgYHBhdGguZGlybmFtZShwYXRoLmpvaW4oZGlyLCBiYXNlbmFtZSkpYCBhbmRcbiAgICAvLyBjb21wYXJlZCB0aGUgdHdvIOKAlCBidXQgd2l0aCBhIGZpeGVkIGJhc2VuYW1lIHRob3NlIGV4cHJlc3Npb25zIGJvdGhcbiAgICAvLyBjb2xsYXBzZSB0byBgZGlyYCwgbWFraW5nIHRoZSBlcXVhbGl0eSBjaGVjayB0YXV0b2xvZ2ljYWwuIFRoZSBjaGVja1xuICAgIC8vIHByb3RlY3RlZCBub3RoaW5nIGlmIGA8cHJvamVjdD4vdGVtcC9tY3AtY2FwdHVyZXNgIGl0c2VsZiB3YXMgYVxuICAgIC8vIHN5bWxpbmsgdGhhdCBlc2NhcGVzIHRoZSBwcm9qZWN0IHRyZWUuXG4gICAgLy9cbiAgICAvLyBUcnVlIGVzY2FwZSBwcm90ZWN0aW9uIHJlcXVpcmVzIGFuY2hvcmluZyBhZ2FpbnN0IHRoZSBwcm9qZWN0IHJvb3QuXG4gICAgLy8gV2Ugbm93IHJlYWxwYXRoIEJPVEggdGhlIGNhcHR1cmUgZGlyIGFuZCBgRWRpdG9yLlByb2plY3QucGF0aGAgYW5kXG4gICAgLy8gcmVxdWlyZSB0aGUgcmVzb2x2ZWQgY2FwdHVyZSBkaXIgdG8gYmUgaW5zaWRlIHRoZSByZXNvbHZlZCBwcm9qZWN0XG4gICAgLy8gcm9vdCAoZXF1YWxpdHkgT1IgYHJlYWxEaXIuc3RhcnRzV2l0aChyZWFsUHJvamVjdFJvb3QgKyBzZXApYCkuXG4gICAgLy8gVGhlIGludHJhLWRpciBjaGVjayBpcyBrZXB0IGZvciBjaGVhcCBkZWZlbnNlLWluLWRlcHRoIGluIGNhc2UgYVxuICAgIC8vIGZ1dHVyZSBiYXNlbmFtZSBnZXRzIHRyYXZlcnNhbCBjaGFyYWN0ZXJzIHRocmVhZGVkIHRocm91Z2guXG4gICAgLy9cbiAgICAvLyBSZXR1cm5zIHsgb2s6IHRydWUsIGZpbGVQYXRoLCBkaXIgfSB3aGVuIHNhZmUgdG8gd3JpdGUsIG9yXG4gICAgLy8geyBvazogZmFsc2UsIGVycm9yIH0gd2l0aCB0aGUgc2FtZSBlcnJvciBlbnZlbG9wZSBzaGFwZSBhc1xuICAgIC8vIGVuc3VyZUNhcHR1cmVEaXIgc28gY2FsbGVycyBjYW4gZmFsbCB0aHJvdWdoIHRoZWlyIGV4aXN0aW5nXG4gICAgLy8gZXJyb3ItcmV0dXJuIHBhdHRlcm4uXG4gICAgcHJpdmF0ZSByZXNvbHZlQXV0b0NhcHR1cmVGaWxlKGJhc2VuYW1lOiBzdHJpbmcpOiB7IG9rOiB0cnVlOyBmaWxlUGF0aDogc3RyaW5nOyBkaXI6IHN0cmluZyB9IHwgeyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmcgfSB7XG4gICAgICAgIGNvbnN0IGRpclJlc3VsdCA9IHRoaXMuZW5zdXJlQ2FwdHVyZURpcigpO1xuICAgICAgICBpZiAoIWRpclJlc3VsdC5vaykgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogZGlyUmVzdWx0LmVycm9yIH07XG4gICAgICAgIGNvbnN0IHByb2plY3RQYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQgPSBFZGl0b3I/LlByb2plY3Q/LnBhdGg7XG4gICAgICAgIGlmICghcHJvamVjdFBhdGgpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6ICdFZGl0b3IuUHJvamVjdC5wYXRoIGlzIG5vdCBhdmFpbGFibGU7IGNhbm5vdCBhbmNob3IgY2FwdHVyZS1kaXIgY29udGFpbm1lbnQgY2hlY2suJyB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGZpbGVQYXRoID0gcGF0aC5qb2luKGRpclJlc3VsdC5kaXIsIGJhc2VuYW1lKTtcbiAgICAgICAgbGV0IHJlYWxEaXI6IHN0cmluZztcbiAgICAgICAgbGV0IHJlYWxQYXJlbnQ6IHN0cmluZztcbiAgICAgICAgbGV0IHJlYWxQcm9qZWN0Um9vdDogc3RyaW5nO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcnA6IGFueSA9IGZzLnJlYWxwYXRoU3luYyBhcyBhbnk7XG4gICAgICAgICAgICBjb25zdCByZXNvbHZlUmVhbCA9IHJwLm5hdGl2ZSA/PyBycDtcbiAgICAgICAgICAgIHJlYWxEaXIgPSByZXNvbHZlUmVhbChkaXJSZXN1bHQuZGlyKTtcbiAgICAgICAgICAgIHJlYWxQYXJlbnQgPSByZXNvbHZlUmVhbChwYXRoLmRpcm5hbWUoZmlsZVBhdGgpKTtcbiAgICAgICAgICAgIHJlYWxQcm9qZWN0Um9vdCA9IHJlc29sdmVSZWFsKHByb2plY3RQYXRoKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGBzY3JlZW5zaG90IHBhdGggcmVhbHBhdGggZmFpbGVkOiAke2Vycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKX1gIH07XG4gICAgICAgIH1cbiAgICAgICAgLy8gRGVmZW5zZS1pbi1kZXB0aDogcGFyZW50IG9mIHRoZSByZXNvbHZlZCBmaWxlIG11c3QgZXF1YWwgdGhlXG4gICAgICAgIC8vIHJlc29sdmVkIGNhcHR1cmUgZGlyIChjYXRjaGVzIGZ1dHVyZSBiYXNlbmFtZXMgdGhyZWFkaW5nIGAuLmApLlxuICAgICAgICBpZiAocGF0aC5yZXNvbHZlKHJlYWxQYXJlbnQpICE9PSBwYXRoLnJlc29sdmUocmVhbERpcikpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6ICdzY3JlZW5zaG90IHNhdmUgcGF0aCByZXNvbHZlZCBvdXRzaWRlIHRoZSBjYXB0dXJlIGRpcmVjdG9yeScgfTtcbiAgICAgICAgfVxuICAgICAgICAvLyBQcmltYXJ5IHByb3RlY3Rpb246IGNhcHR1cmUgZGlyIGl0c2VsZiBtdXN0IHJlc29sdmUgaW5zaWRlIHRoZVxuICAgICAgICAvLyBwcm9qZWN0IHJvb3QsIHNvIGEgc3ltbGluayBjaGFpbiBvbiBgdGVtcC9tY3AtY2FwdHVyZXNgIGNhbm5vdFxuICAgICAgICAvLyBwaXZvdCB3cml0ZXMgdG8gZS5nLiAvZXRjIG9yIEM6XFxXaW5kb3dzLlxuICAgICAgICAvLyB2Mi45LnggcG9saXNoIChDb2RleCByMiBzaW5nbGUt8J+foSBmcm9tIHYyLjguMSByZXZpZXcpOiB1c2VcbiAgICAgICAgLy8gcGF0aC5yZWxhdGl2ZSBpbnN0ZWFkIG9mIGByb290ICsgcGF0aC5zZXBgIHByZWZpeCBjaGVjayDigJRcbiAgICAgICAgLy8gd2hlbiByb290IGlzIGEgZHJpdmUgcm9vdCAoYEM6XFxgKSwgcGF0aC5yZXNvbHZlIG5vcm1hbGlzZXMgaXRcbiAgICAgICAgLy8gdG8gYEM6XFxcXGAgYW5kIGBwYXRoLnNlcGAgYWRkcyBhbm90aGVyIGBcXGAsIHByb2R1Y2luZyBgQzpcXFxcXFxcXGBcbiAgICAgICAgLy8gd2hpY2ggYSBjYW5kaWRhdGUgbGlrZSBgQzpcXFxcZm9vYCBkb2VzIG5vdCBtYXRjaC4gcGF0aC5yZWxhdGl2ZVxuICAgICAgICAvLyBhbHNvIGhhbmRsZXMgdGhlIEM6XFxmb28gdnMgQzpcXGZvb2JhciBwcmVmaXgtY29sbGlzaW9uIGNhc2UuXG4gICAgICAgIGlmICghaXNQYXRoV2l0aGluUm9vdChyZWFsRGlyLCByZWFsUHJvamVjdFJvb3QpKSB7XG4gICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBgY2FwdHVyZSBkaXIgcmVzb2x2ZWQgb3V0c2lkZSB0aGUgcHJvamVjdCByb290OiAke3BhdGgucmVzb2x2ZShyZWFsRGlyKX0gbm90IHdpdGhpbiAke3BhdGgucmVzb2x2ZShyZWFsUHJvamVjdFJvb3QpfWAgfTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSwgZmlsZVBhdGgsIGRpcjogZGlyUmVzdWx0LmRpciB9O1xuICAgIH1cblxuICAgIC8vIHYyLjguMSByb3VuZC0xIGZpeCAoR2VtaW5pIPCflLQgKyBDb2RleCDwn5+hKTogd2hlbiBjYWxsZXIgcGFzc2VzIGFuXG4gICAgLy8gZXhwbGljaXQgc2F2ZVBhdGggLyBzYXZlUGF0aFByZWZpeCwgd2Ugc3RpbGwgbmVlZCB0aGUgc2FtZSBwcm9qZWN0LVxuICAgIC8vIHJvb3QgY29udGFpbm1lbnQgZ3VhcmFudGVlIHRoYXQgcmVzb2x2ZUF1dG9DYXB0dXJlRmlsZSBnaXZlcyB0aGVcbiAgICAvLyBhdXRvLW5hbWVkIGJyYW5jaC4gQUktZ2VuZXJhdGVkIGFic29sdXRlIHBhdGhzIGNvdWxkIG90aGVyd2lzZVxuICAgIC8vIHdyaXRlIG91dHNpZGUgdGhlIHByb2plY3Qgcm9vdC5cbiAgICAvL1xuICAgIC8vIFRoZSBjaGVjayByZXNvbHZlcyB0aGUgcGFyZW50IGRpcmVjdG9yeSAodGhlIGZpbGUgaXRzZWxmIG1heSBub3RcbiAgICAvLyBleGlzdCB5ZXQpIGFuZCByZXF1aXJlcyBpdCB0byBiZSBpbnNpZGUgYHJlYWxwYXRoKEVkaXRvci5Qcm9qZWN0LnBhdGgpYC5cbiAgICBwcml2YXRlIGFzc2VydFNhdmVQYXRoV2l0aGluUHJvamVjdChzYXZlUGF0aDogc3RyaW5nKTogeyBvazogdHJ1ZTsgcmVzb2x2ZWRQYXRoOiBzdHJpbmcgfSB8IHsgb2s6IGZhbHNlOyBlcnJvcjogc3RyaW5nIH0ge1xuICAgICAgICBjb25zdCBwcm9qZWN0UGF0aDogc3RyaW5nIHwgdW5kZWZpbmVkID0gRWRpdG9yPy5Qcm9qZWN0Py5wYXRoO1xuICAgICAgICBpZiAoIXByb2plY3RQYXRoKSB7XG4gICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiAnRWRpdG9yLlByb2plY3QucGF0aCBpcyBub3QgYXZhaWxhYmxlOyBjYW5ub3QgdmFsaWRhdGUgZXhwbGljaXQgc2F2ZVBhdGguJyB9O1xuICAgICAgICB9XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBycDogYW55ID0gZnMucmVhbHBhdGhTeW5jIGFzIGFueTtcbiAgICAgICAgICAgIGNvbnN0IHJlc29sdmVSZWFsID0gcnAubmF0aXZlID8/IHJwO1xuICAgICAgICAgICAgY29uc3QgcmVhbFByb2plY3RSb290ID0gcmVzb2x2ZVJlYWwocHJvamVjdFBhdGgpO1xuICAgICAgICAgICAgLy8gdjIuOC4yIHJldGVzdCBmaXggKENvZGV4IHIyIPCfn6EgIzEpOiBhIHJlbGF0aXZlIHNhdmVQYXRoIHdvdWxkXG4gICAgICAgICAgICAvLyBtYWtlIGBwYXRoLmRpcm5hbWUoc2F2ZVBhdGgpYCBjb2xsYXBzZSB0byAnLicgYW5kIHJlc29sdmUgdG9cbiAgICAgICAgICAgIC8vIHRoZSBob3N0IHByb2Nlc3MgY3dkIChvZnRlbiBgPGVkaXRvci1pbnN0YWxsPi9Db2Nvc0Rhc2hib2FyZGApXG4gICAgICAgICAgICAvLyByYXRoZXIgdGhhbiB0aGUgcHJvamVjdCByb290LiBBbmNob3IgcmVsYXRpdmUgcGF0aHMgYWdhaW5zdFxuICAgICAgICAgICAgLy8gdGhlIHByb2plY3Qgcm9vdCBleHBsaWNpdGx5IHNvIHRoZSBBSSdzIGludHVpdGl2ZSBcInJlbGF0aXZlXG4gICAgICAgICAgICAvLyB0byBteSBwcm9qZWN0XCIgaW50ZXJwcmV0YXRpb24gaXMgd2hhdCB0aGUgY2hlY2sgZW5mb3JjZXMuXG4gICAgICAgICAgICBjb25zdCBhYnNvbHV0ZVNhdmVQYXRoID0gcGF0aC5pc0Fic29sdXRlKHNhdmVQYXRoKVxuICAgICAgICAgICAgICAgID8gc2F2ZVBhdGhcbiAgICAgICAgICAgICAgICA6IHBhdGgucmVzb2x2ZShwcm9qZWN0UGF0aCwgc2F2ZVBhdGgpO1xuICAgICAgICAgICAgY29uc3QgcGFyZW50ID0gcGF0aC5kaXJuYW1lKGFic29sdXRlU2F2ZVBhdGgpO1xuICAgICAgICAgICAgLy8gUGFyZW50IG11c3QgYWxyZWFkeSBleGlzdCBmb3IgcmVhbHBhdGg7IGlmIGl0IGRvZXNuJ3QsIHRoZVxuICAgICAgICAgICAgLy8gd3JpdGUgd291bGQgZmFpbCBhbnl3YXksIGJ1dCByZXR1cm4gYSBjbGVhcmVyIGVycm9yIGhlcmUuXG4gICAgICAgICAgICBsZXQgcmVhbFBhcmVudDogc3RyaW5nO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICByZWFsUGFyZW50ID0gcmVzb2x2ZVJlYWwocGFyZW50KTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogYHNhdmVQYXRoIHBhcmVudCBkaXIgbWlzc2luZyBvciB1bnJlYWRhYmxlOiAke2Vycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKX1gIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyB2Mi45LnggcG9saXNoIChDb2RleCByMiBzaW5nbGUt8J+foSBmcm9tIHYyLjguMSByZXZpZXcpOiBzYW1lXG4gICAgICAgICAgICAvLyBwYXRoLnJlbGF0aXZlLWJhc2VkIGNvbnRhaW5tZW50IGFzIHJlc29sdmVBdXRvQ2FwdHVyZUZpbGUuXG4gICAgICAgICAgICBpZiAoIWlzUGF0aFdpdGhpblJvb3QocmVhbFBhcmVudCwgcmVhbFByb2plY3RSb290KSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgIG9rOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGBzYXZlUGF0aCByZXNvbHZlZCBvdXRzaWRlIHRoZSBwcm9qZWN0IHJvb3Q6ICR7cGF0aC5yZXNvbHZlKHJlYWxQYXJlbnQpfSBub3Qgd2l0aGluICR7cGF0aC5yZXNvbHZlKHJlYWxQcm9qZWN0Um9vdCl9LiBVc2UgYSBwYXRoIGluc2lkZSA8cHJvamVjdD4vIG9yIG9taXQgc2F2ZVBhdGggdG8gYXV0by1uYW1lIGludG8gPHByb2plY3Q+L3RlbXAvbWNwLWNhcHR1cmVzLmAsXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB7IG9rOiB0cnVlLCByZXNvbHZlZFBhdGg6IGFic29sdXRlU2F2ZVBhdGggfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGBzYXZlUGF0aCByZWFscGF0aCBmYWlsZWQ6ICR7ZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpfWAgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgc2NyZWVuc2hvdChzYXZlUGF0aD86IHN0cmluZywgd2luZG93VGl0bGU/OiBzdHJpbmcsIGluY2x1ZGVCYXNlNjQ6IGJvb2xlYW4gPSBmYWxzZSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBsZXQgZmlsZVBhdGggPSBzYXZlUGF0aDtcbiAgICAgICAgICAgIGlmICghZmlsZVBhdGgpIHtcbiAgICAgICAgICAgICAgICBjb25zdCByZXNvbHZlZCA9IHRoaXMucmVzb2x2ZUF1dG9DYXB0dXJlRmlsZShgc2NyZWVuc2hvdC0ke0RhdGUubm93KCl9LnBuZ2ApO1xuICAgICAgICAgICAgICAgIGlmICghcmVzb2x2ZWQub2spIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogcmVzb2x2ZWQuZXJyb3IgfTtcbiAgICAgICAgICAgICAgICBmaWxlUGF0aCA9IHJlc29sdmVkLmZpbGVQYXRoO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyB2Mi44LjEgcm91bmQtMSBmaXggKEdlbWluaSDwn5S0ICsgQ29kZXgg8J+foSk6IGV4cGxpY2l0IHNhdmVQYXRoXG4gICAgICAgICAgICAgICAgLy8gYWxzbyBnZXRzIGNvbnRhaW5tZW50LWNoZWNrZWQuIEFJLWdlbmVyYXRlZCBwYXRocyBjb3VsZFxuICAgICAgICAgICAgICAgIC8vIG90aGVyd2lzZSB3cml0ZSBvdXRzaWRlIHRoZSBwcm9qZWN0IHJvb3QuXG4gICAgICAgICAgICAgICAgLy8gdjIuOC4yIHJldGVzdCBmaXg6IHVzZSB0aGUgaGVscGVyJ3MgcmVzb2x2ZWRQYXRoIHNvIGFcbiAgICAgICAgICAgICAgICAvLyByZWxhdGl2ZSBzYXZlUGF0aCBhY3R1YWxseSBsYW5kcyBpbnNpZGUgdGhlIHByb2plY3Qgcm9vdC5cbiAgICAgICAgICAgICAgICBjb25zdCBndWFyZCA9IHRoaXMuYXNzZXJ0U2F2ZVBhdGhXaXRoaW5Qcm9qZWN0KGZpbGVQYXRoKTtcbiAgICAgICAgICAgICAgICBpZiAoIWd1YXJkLm9rKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGd1YXJkLmVycm9yIH07XG4gICAgICAgICAgICAgICAgZmlsZVBhdGggPSBndWFyZC5yZXNvbHZlZFBhdGg7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCB3aW4gPSB0aGlzLnBpY2tXaW5kb3cod2luZG93VGl0bGUpO1xuICAgICAgICAgICAgY29uc3QgaW1hZ2UgPSBhd2FpdCB3aW4ud2ViQ29udGVudHMuY2FwdHVyZVBhZ2UoKTtcbiAgICAgICAgICAgIGNvbnN0IHBuZzogQnVmZmVyID0gaW1hZ2UudG9QTkcoKTtcbiAgICAgICAgICAgIGZzLndyaXRlRmlsZVN5bmMoZmlsZVBhdGgsIHBuZyk7XG4gICAgICAgICAgICBjb25zdCBkYXRhOiBhbnkgPSB7XG4gICAgICAgICAgICAgICAgZmlsZVBhdGgsXG4gICAgICAgICAgICAgICAgc2l6ZTogcG5nLmxlbmd0aCxcbiAgICAgICAgICAgICAgICB3aW5kb3dUaXRsZTogdHlwZW9mIHdpbi5nZXRUaXRsZSA9PT0gJ2Z1bmN0aW9uJyA/IHdpbi5nZXRUaXRsZSgpIDogJycsXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgaWYgKGluY2x1ZGVCYXNlNjQpIHtcbiAgICAgICAgICAgICAgICBkYXRhLmRhdGFVcmkgPSBgZGF0YTppbWFnZS9wbmc7YmFzZTY0LCR7cG5nLnRvU3RyaW5nKCdiYXNlNjQnKX1gO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZGF0YSwgbWVzc2FnZTogYFNjcmVlbnNob3Qgc2F2ZWQgdG8gJHtmaWxlUGF0aH1gIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKSB9O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gdjIuNy4wICM0OiBQcmV2aWV3LXdpbmRvdyBzY3JlZW5zaG90LlxuICAgIC8vIHYyLjguMyBULVYyODMtMTogZXh0ZW5kZWQgdG8gaGFuZGxlIGNvY29zIGVtYmVkZGVkIHByZXZpZXcgbW9kZS5cbiAgICAvL1xuICAgIC8vIE1vZGUgZGlzcGF0Y2g6XG4gICAgLy8gICAtIFwid2luZG93XCI6ICAgcmVxdWlyZSBhIFByZXZpZXctdGl0bGVkIEJyb3dzZXJXaW5kb3c7IGZhaWwgaWYgbm9uZS5cbiAgICAvLyAgICAgICAgICAgICAgICAgT3JpZ2luYWwgdjIuNy4wIGJlaGF2aW91ci4gVXNlIHdoZW4gY29jb3MgcHJldmlld1xuICAgIC8vICAgICAgICAgICAgICAgICBjb25maWcgaXMgXCJ3aW5kb3dcIiAvIFwic2ltdWxhdG9yXCIgKHNlcGFyYXRlIHdpbmRvdykuXG4gICAgLy8gICAtIFwiZW1iZWRkZWRcIjogc2tpcCB0aGUgd2luZG93IHByb2JlIGFuZCBjYXB0dXJlIHRoZSBtYWluIGVkaXRvclxuICAgIC8vICAgICAgICAgICAgICAgICBCcm93c2VyV2luZG93IGRpcmVjdGx5LiBVc2Ugd2hlbiBjb2NvcyBwcmV2aWV3IGNvbmZpZ1xuICAgIC8vICAgICAgICAgICAgICAgICBpcyBcImVtYmVkZGVkXCIgKGdhbWV2aWV3IHJlbmRlcnMgaW5zaWRlIG1haW4gZWRpdG9yKS5cbiAgICAvLyAgIC0gXCJhdXRvXCI6ICAgICB0cnkgXCJ3aW5kb3dcIiBmaXJzdDsgaWYgbm8gUHJldmlldy10aXRsZWQgd2luZG93IGlzXG4gICAgLy8gICAgICAgICAgICAgICAgIGZvdW5kLCBmYWxsIGJhY2sgdG8gXCJlbWJlZGRlZFwiIGFuZCBzdXJmYWNlIGEgaGludFxuICAgIC8vICAgICAgICAgICAgICAgICBpbiB0aGUgcmVzcG9uc2UgbWVzc2FnZS4gRGVmYXVsdCDigJQga2VlcHMgdGhlIGhhcHB5XG4gICAgLy8gICAgICAgICAgICAgICAgIHBhdGggd29ya2luZyB3aXRob3V0IGNhbGxlciBrbm93bGVkZ2Ugb2YgY29jb3NcbiAgICAvLyAgICAgICAgICAgICAgICAgcHJldmlldyBjb25maWcuXG4gICAgLy9cbiAgICAvLyBCcm93c2VyLW1vZGUgKFBJRSByZW5kZXJlZCB0byB1c2VyJ3MgZXh0ZXJuYWwgYnJvd3NlciB2aWFcbiAgICAvLyBzaGVsbC5vcGVuRXh0ZXJuYWwpIGlzIE5PVCBjYXB0dXJhYmxlIGhlcmUg4oCUIHRoZSBwYWdlIGxpdmVzIGluXG4gICAgLy8gYSBub24tRWxlY3Ryb24gYnJvd3NlciBwcm9jZXNzLiBBSSBjYW4gZGV0ZWN0IHRoaXMgdmlhXG4gICAgLy8gZGVidWdfZ2V0X3ByZXZpZXdfbW9kZSBhbmQgc2tpcCB0aGUgY2FsbC5cbiAgICBwcml2YXRlIGFzeW5jIGNhcHR1cmVQcmV2aWV3U2NyZWVuc2hvdChcbiAgICAgICAgc2F2ZVBhdGg/OiBzdHJpbmcsXG4gICAgICAgIG1vZGU6ICdhdXRvJyB8ICd3aW5kb3cnIHwgJ2VtYmVkZGVkJyA9ICdhdXRvJyxcbiAgICAgICAgd2luZG93VGl0bGU6IHN0cmluZyA9ICdQcmV2aWV3JyxcbiAgICAgICAgaW5jbHVkZUJhc2U2NDogYm9vbGVhbiA9IGZhbHNlLFxuICAgICk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLXZhci1yZXF1aXJlc1xuICAgICAgICAgICAgY29uc3QgZWxlY3Ryb24gPSByZXF1aXJlKCdlbGVjdHJvbicpO1xuICAgICAgICAgICAgY29uc3QgQlcgPSBlbGVjdHJvbi5Ccm93c2VyV2luZG93O1xuXG4gICAgICAgICAgICAvLyBSZXNvbHZlIHRoZSB0YXJnZXQgd2luZG93IHBlciBtb2RlLlxuICAgICAgICAgICAgY29uc3QgcHJvYmVXaW5kb3dNb2RlID0gKCk6IHsgb2s6IHRydWU7IHdpbjogYW55IH0gfCB7IG9rOiBmYWxzZTsgZXJyb3I6IHN0cmluZzsgdmlzaWJsZVRpdGxlczogc3RyaW5nW10gfSA9PiB7XG4gICAgICAgICAgICAgICAgLy8gdjIuNy4xIHJldmlldyBmaXggKGNsYXVkZSDwn5+hICsgY29kZXgg8J+foSk6IHdpdGggdGhlIGRlZmF1bHRcbiAgICAgICAgICAgICAgICAvLyB3aW5kb3dUaXRsZT0nUHJldmlldycgYSBDaGluZXNlIC8gbG9jYWxpemVkIGNvY29zIGVkaXRvclxuICAgICAgICAgICAgICAgIC8vIHdob3NlIG1haW4gd2luZG93IHRpdGxlIGNvbnRhaW5zIFwiUHJldmlld1wiIChlLmcuIFwiQ29jb3NcbiAgICAgICAgICAgICAgICAvLyBDcmVhdG9yIFByZXZpZXcgLSA8UHJvamVjdE5hbWU+XCIpIHdvdWxkIGZhbHNlbHkgbWF0Y2guXG4gICAgICAgICAgICAgICAgLy8gRGlzYW1iaWd1YXRlIGJ5IGV4Y2x1ZGluZyBhbnkgdGl0bGUgdGhhdCBBTFNPIGNvbnRhaW5zXG4gICAgICAgICAgICAgICAgLy8gXCJDb2NvcyBDcmVhdG9yXCIgd2hlbiB0aGUgY2FsbGVyIHN0dWNrIHdpdGggdGhlIGRlZmF1bHQuXG4gICAgICAgICAgICAgICAgY29uc3QgdXNpbmdEZWZhdWx0ID0gd2luZG93VGl0bGUgPT09ICdQcmV2aWV3JztcbiAgICAgICAgICAgICAgICBjb25zdCBhbGxUaXRsZXM6IHN0cmluZ1tdID0gQlc/LmdldEFsbFdpbmRvd3M/LigpPy5tYXAoKHc6IGFueSkgPT4gdy5nZXRUaXRsZT8uKCkgPz8gJycpLmZpbHRlcihCb29sZWFuKSA/PyBbXTtcbiAgICAgICAgICAgICAgICBjb25zdCBtYXRjaGVzID0gQlc/LmdldEFsbFdpbmRvd3M/LigpPy5maWx0ZXIoKHc6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXcgfHwgdy5pc0Rlc3Ryb3llZCgpKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRpdGxlID0gdy5nZXRUaXRsZT8uKCkgfHwgJyc7XG4gICAgICAgICAgICAgICAgICAgIGlmICghdGl0bGUuaW5jbHVkZXMod2luZG93VGl0bGUpKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIGlmICh1c2luZ0RlZmF1bHQgJiYgL0NvY29zXFxzKkNyZWF0b3IvaS50ZXN0KHRpdGxlKSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9KSA/PyBbXTtcbiAgICAgICAgICAgICAgICBpZiAobWF0Y2hlcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogYE5vIEVsZWN0cm9uIHdpbmRvdyB0aXRsZSBjb250YWlucyBcIiR7d2luZG93VGl0bGV9XCIke3VzaW5nRGVmYXVsdCA/ICcgKGFuZCBpcyBub3QgdGhlIG1haW4gZWRpdG9yKScgOiAnJ30uYCwgdmlzaWJsZVRpdGxlczogYWxsVGl0bGVzIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiB7IG9rOiB0cnVlLCB3aW46IG1hdGNoZXNbMF0gfTtcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGNvbnN0IHByb2JlRW1iZWRkZWRNb2RlID0gKCk6IHsgb2s6IHRydWU7IHdpbjogYW55IH0gfCB7IG9rOiBmYWxzZTsgZXJyb3I6IHN0cmluZyB9ID0+IHtcbiAgICAgICAgICAgICAgICAvLyBFbWJlZGRlZCBQSUUgcmVuZGVycyBpbnNpZGUgdGhlIG1haW4gZWRpdG9yIEJyb3dzZXJXaW5kb3cuXG4gICAgICAgICAgICAgICAgLy8gUGljayB0aGUgc2FtZSBoZXVyaXN0aWMgYXMgcGlja1dpbmRvdygpOiBwcmVmZXIgYSBub24tXG4gICAgICAgICAgICAgICAgLy8gUHJldmlldyB3aW5kb3cuIENvY29zIG1haW4gZWRpdG9yJ3MgdGl0bGUgdHlwaWNhbGx5XG4gICAgICAgICAgICAgICAgLy8gY29udGFpbnMgXCJDb2NvcyBDcmVhdG9yXCIg4oCUIG1hdGNoIHRoYXQgdG8gaWRlbnRpZnkgaXQuXG4gICAgICAgICAgICAgICAgY29uc3QgYWxsOiBhbnlbXSA9IEJXPy5nZXRBbGxXaW5kb3dzPy4oKT8uZmlsdGVyKCh3OiBhbnkpID0+IHcgJiYgIXcuaXNEZXN0cm95ZWQoKSkgPz8gW107XG4gICAgICAgICAgICAgICAgaWYgKGFsbC5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogJ05vIGxpdmUgRWxlY3Ryb24gd2luZG93cyBhdmFpbGFibGU7IGNhbm5vdCBjYXB0dXJlIGVtYmVkZGVkIHByZXZpZXcuJyB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAvLyBQcmVmZXIgdGhlIGVkaXRvciBtYWluIHdpbmRvdyAodGl0bGUgY29udGFpbnMgXCJDb2Nvc1xuICAgICAgICAgICAgICAgIC8vIENyZWF0b3JcIikg4oCUIHRoYXQncyB3aGVyZSBlbWJlZGRlZCBQSUUgcmVuZGVycy5cbiAgICAgICAgICAgICAgICBjb25zdCBlZGl0b3IgPSBhbGwuZmluZCgodzogYW55KSA9PiAvQ29jb3NcXHMqQ3JlYXRvci9pLnRlc3Qody5nZXRUaXRsZT8uKCkgfHwgJycpKTtcbiAgICAgICAgICAgICAgICBpZiAoZWRpdG9yKSByZXR1cm4geyBvazogdHJ1ZSwgd2luOiBlZGl0b3IgfTtcbiAgICAgICAgICAgICAgICAvLyBGYWxsYmFjazogYW55IG5vbi1EZXZUb29scyAvIG5vbi1Xb3JrZXIgLyBub24tQmxhbmsgd2luZG93LlxuICAgICAgICAgICAgICAgIGNvbnN0IGNhbmRpZGF0ZSA9IGFsbC5maW5kKCh3OiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdCA9IHcuZ2V0VGl0bGU/LigpIHx8ICcnO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdCAmJiAhL0RldlRvb2xzfFdvcmtlciAtfF5CbGFuayQvLnRlc3QodCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgaWYgKGNhbmRpZGF0ZSkgcmV0dXJuIHsgb2s6IHRydWUsIHdpbjogY2FuZGlkYXRlIH07XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogJ05vIHN1aXRhYmxlIGVkaXRvciB3aW5kb3cgZm91bmQgZm9yIGVtYmVkZGVkIHByZXZpZXcgY2FwdHVyZS4nIH07XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBsZXQgd2luOiBhbnkgPSBudWxsO1xuICAgICAgICAgICAgbGV0IGNhcHR1cmVOb3RlOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgICAgICAgICAgIGxldCByZXNvbHZlZE1vZGU6ICd3aW5kb3cnIHwgJ2VtYmVkZGVkJyA9ICd3aW5kb3cnO1xuXG4gICAgICAgICAgICBpZiAobW9kZSA9PT0gJ3dpbmRvdycpIHtcbiAgICAgICAgICAgICAgICBjb25zdCByID0gcHJvYmVXaW5kb3dNb2RlKCk7XG4gICAgICAgICAgICAgICAgaWYgKCFyLm9rKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yOiBgJHtyLmVycm9yfSBMYXVuY2ggY29jb3MgcHJldmlldyBmaXJzdCB2aWEgdGhlIHRvb2xiYXIgcGxheSBidXR0b24gb3IgdmlhIGRlYnVnX3ByZXZpZXdfdXJsKGFjdGlvbj1cIm9wZW5cIikuIElmIHlvdXIgY29jb3MgcHJldmlldyBpcyBzZXQgdG8gXCJlbWJlZGRlZFwiLCBjYWxsIHRoaXMgdG9vbCB3aXRoIG1vZGU9XCJlbWJlZGRlZFwiIG9yIG1vZGU9XCJhdXRvXCIuIFZpc2libGUgd2luZG93IHRpdGxlczogJHtyLnZpc2libGVUaXRsZXMuam9pbignLCAnKSB8fCAnKG5vbmUpJ31gLFxuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB3aW4gPSByLndpbjtcbiAgICAgICAgICAgICAgICByZXNvbHZlZE1vZGUgPSAnd2luZG93JztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAobW9kZSA9PT0gJ2VtYmVkZGVkJykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHIgPSBwcm9iZUVtYmVkZGVkTW9kZSgpO1xuICAgICAgICAgICAgICAgIGlmICghci5vaykgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiByLmVycm9yIH07XG4gICAgICAgICAgICAgICAgd2luID0gci53aW47XG4gICAgICAgICAgICAgICAgcmVzb2x2ZWRNb2RlID0gJ2VtYmVkZGVkJztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gYXV0b1xuICAgICAgICAgICAgICAgIGNvbnN0IHdyID0gcHJvYmVXaW5kb3dNb2RlKCk7XG4gICAgICAgICAgICAgICAgaWYgKHdyLm9rKSB7XG4gICAgICAgICAgICAgICAgICAgIHdpbiA9IHdyLndpbjtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZWRNb2RlID0gJ3dpbmRvdyc7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZXIgPSBwcm9iZUVtYmVkZGVkTW9kZSgpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIWVyLm9rKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yOiBgJHt3ci5lcnJvcn0gJHtlci5lcnJvcn0gTGF1bmNoIGNvY29zIHByZXZpZXcgZmlyc3Qgb3IgY2hlY2sgZGVidWdfZ2V0X3ByZXZpZXdfbW9kZSB0byBzZWUgaG93IGNvY29zIGlzIGNvbmZpZ3VyZWQuIFZpc2libGUgd2luZG93IHRpdGxlczogJHt3ci52aXNpYmxlVGl0bGVzLmpvaW4oJywgJykgfHwgJyhub25lKSd9YCxcbiAgICAgICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgd2luID0gZXIud2luO1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlZE1vZGUgPSAnZW1iZWRkZWQnO1xuICAgICAgICAgICAgICAgICAgICAvLyB2Mi44LjQgcmV0ZXN0IGZpbmRpbmc6IHdoZW4gY29jb3MgcHJldmlldyBpcyBzZXRcbiAgICAgICAgICAgICAgICAgICAgLy8gdG8gXCJicm93c2VyXCIsIGF1dG8tZmFsbGJhY2sgQUxTTyBncmFicyB0aGUgbWFpblxuICAgICAgICAgICAgICAgICAgICAvLyBlZGl0b3Igd2luZG93IChiZWNhdXNlIG5vIFByZXZpZXctdGl0bGVkIHdpbmRvd1xuICAgICAgICAgICAgICAgICAgICAvLyBleGlzdHMpIOKAlCBidXQgaW4gYnJvd3NlciBtb2RlIHRoZSBhY3R1YWwgZ2FtZXZpZXdcbiAgICAgICAgICAgICAgICAgICAgLy8gbGl2ZXMgaW4gdGhlIHVzZXIncyBleHRlcm5hbCBicm93c2VyLCBOT1QgaW4gdGhlXG4gICAgICAgICAgICAgICAgICAgIC8vIGNhcHR1cmVkIEVsZWN0cm9uIHdpbmRvdy4gRG9uJ3QgY2xhaW0gXCJlbWJlZGRlZFxuICAgICAgICAgICAgICAgICAgICAvLyBwcmV2aWV3IG1vZGVcIiDigJQgdGhhdCdzIGEgZ3Vlc3MsIGFuZCB3cm9uZyB3aGVuXG4gICAgICAgICAgICAgICAgICAgIC8vIHVzZXIgaXMgb24gYnJvd3NlciBjb25maWcuIFByb2JlIHRoZSByZWFsIGNvbmZpZ1xuICAgICAgICAgICAgICAgICAgICAvLyBhbmQgdGFpbG9yIHRoZSBoaW50IHBlciBtb2RlLlxuICAgICAgICAgICAgICAgICAgICBsZXQgYWN0dWFsTW9kZTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjZmc6IGFueSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgJ3ByZWZlcmVuY2VzJywgJ3F1ZXJ5LWNvbmZpZycgYXMgYW55LCAncHJldmlldycgYXMgYW55LFxuICAgICAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHBsYXRmb3JtID0gY2ZnPy5wcmV2aWV3Py5jdXJyZW50Py5wbGF0Zm9ybTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgcGxhdGZvcm0gPT09ICdzdHJpbmcnKSBhY3R1YWxNb2RlID0gcGxhdGZvcm07XG4gICAgICAgICAgICAgICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gYmVzdC1lZmZvcnQ7IGZhbGwgdGhyb3VnaCB3aXRoIG5ldXRyYWwgaGludFxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGlmIChhY3R1YWxNb2RlID09PSAnYnJvd3NlcicpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhcHR1cmVOb3RlID0gJ05vIFByZXZpZXctdGl0bGVkIHdpbmRvdyBmb3VuZDsgY2FwdHVyZWQgdGhlIG1haW4gZWRpdG9yIHdpbmRvdy4gTk9URTogY29jb3MgcHJldmlldyBpcyBzZXQgdG8gXCJicm93c2VyXCIg4oCUIHRoZSBhY3R1YWwgcHJldmlldyBjb250ZW50IGlzIHJlbmRlcmVkIGluIHlvdXIgZXh0ZXJuYWwgYnJvd3NlciAoTk9UIGluIHRoaXMgaW1hZ2UpLiBGb3IgcnVudGltZSBjYW52YXMgY2FwdHVyZSBpbiBicm93c2VyIG1vZGUgdXNlIGRlYnVnX2dhbWVfY29tbWFuZCh0eXBlPVwic2NyZWVuc2hvdFwiKSB2aWEgYSBHYW1lRGVidWdDbGllbnQgcnVubmluZyBvbiB0aGUgYnJvd3NlciBwcmV2aWV3IHBhZ2UuJztcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChhY3R1YWxNb2RlID09PSAnZ2FtZVZpZXcnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXB0dXJlTm90ZSA9ICdObyBQcmV2aWV3LXRpdGxlZCB3aW5kb3cgZm91bmQ7IGNhcHR1cmVkIHRoZSBtYWluIGVkaXRvciB3aW5kb3cgKGNvY29zIHByZXZpZXcgaXMgc2V0IHRvIFwiZ2FtZVZpZXdcIiBlbWJlZGRlZCDigJQgdGhlIGVkaXRvciBnYW1ldmlldyBJUyB3aGVyZSBwcmV2aWV3IHJlbmRlcnMsIHNvIHRoaXMgaW1hZ2UgaXMgY29ycmVjdCkuJztcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChhY3R1YWxNb2RlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXB0dXJlTm90ZSA9IGBObyBQcmV2aWV3LXRpdGxlZCB3aW5kb3cgZm91bmQ7IGNhcHR1cmVkIHRoZSBtYWluIGVkaXRvciB3aW5kb3cuIGNvY29zIHByZXZpZXcgaXMgc2V0IHRvIFwiJHthY3R1YWxNb2RlfVwiIOKAlCB2ZXJpZnkgdGhpcyBpbWFnZSBhY3R1YWxseSBjb250YWlucyB0aGUgZ2FtZXZpZXcgeW91IHdhbnRlZDsgZm9yIHJ1bnRpbWUgY2FudmFzIGNhcHR1cmUgcHJlZmVyIGRlYnVnX2dhbWVfY29tbWFuZCB2aWEgR2FtZURlYnVnQ2xpZW50LmA7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXB0dXJlTm90ZSA9ICdObyBQcmV2aWV3LXRpdGxlZCB3aW5kb3cgZm91bmQ7IGNhcHR1cmVkIHRoZSBtYWluIGVkaXRvciB3aW5kb3cuIENvdWxkIG5vdCBkZXRlcm1pbmUgY29jb3MgcHJldmlldyBtb2RlIChkZWJ1Z19nZXRfcHJldmlld19tb2RlIG1pZ2h0IGdpdmUgbW9yZSBpbmZvKS4gSWYgeW91ciBjb2NvcyBwcmV2aWV3IGlzIHNldCB0byBcImJyb3dzZXJcIiwgdGhlIGFjdHVhbCBwcmV2aWV3IGNvbnRlbnQgaXMgaW4geW91ciBleHRlcm5hbCBicm93c2VyIGFuZCBpcyBOT1QgaW4gdGhpcyBpbWFnZS4nO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBsZXQgZmlsZVBhdGggPSBzYXZlUGF0aDtcbiAgICAgICAgICAgIGlmICghZmlsZVBhdGgpIHtcbiAgICAgICAgICAgICAgICBjb25zdCByZXNvbHZlZCA9IHRoaXMucmVzb2x2ZUF1dG9DYXB0dXJlRmlsZShgcHJldmlldy0ke0RhdGUubm93KCl9LnBuZ2ApO1xuICAgICAgICAgICAgICAgIGlmICghcmVzb2x2ZWQub2spIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogcmVzb2x2ZWQuZXJyb3IgfTtcbiAgICAgICAgICAgICAgICBmaWxlUGF0aCA9IHJlc29sdmVkLmZpbGVQYXRoO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyB2Mi44LjEgcm91bmQtMSBmaXggKEdlbWluaSDwn5S0ICsgQ29kZXgg8J+foSk6IGV4cGxpY2l0IHNhdmVQYXRoXG4gICAgICAgICAgICAgICAgLy8gYWxzbyBnZXRzIGNvbnRhaW5tZW50LWNoZWNrZWQuXG4gICAgICAgICAgICAgICAgLy8gdjIuOC4yIHJldGVzdCBmaXg6IHVzZSByZXNvbHZlZFBhdGggZm9yIHJlbGF0aXZlLXBhdGggc3VwcG9ydC5cbiAgICAgICAgICAgICAgICBjb25zdCBndWFyZCA9IHRoaXMuYXNzZXJ0U2F2ZVBhdGhXaXRoaW5Qcm9qZWN0KGZpbGVQYXRoKTtcbiAgICAgICAgICAgICAgICBpZiAoIWd1YXJkLm9rKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGd1YXJkLmVycm9yIH07XG4gICAgICAgICAgICAgICAgZmlsZVBhdGggPSBndWFyZC5yZXNvbHZlZFBhdGg7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBpbWFnZSA9IGF3YWl0IHdpbi53ZWJDb250ZW50cy5jYXB0dXJlUGFnZSgpO1xuICAgICAgICAgICAgY29uc3QgcG5nOiBCdWZmZXIgPSBpbWFnZS50b1BORygpO1xuICAgICAgICAgICAgZnMud3JpdGVGaWxlU3luYyhmaWxlUGF0aCwgcG5nKTtcbiAgICAgICAgICAgIGNvbnN0IGRhdGE6IGFueSA9IHtcbiAgICAgICAgICAgICAgICBmaWxlUGF0aCxcbiAgICAgICAgICAgICAgICBzaXplOiBwbmcubGVuZ3RoLFxuICAgICAgICAgICAgICAgIHdpbmRvd1RpdGxlOiB0eXBlb2Ygd2luLmdldFRpdGxlID09PSAnZnVuY3Rpb24nID8gd2luLmdldFRpdGxlKCkgOiAnJyxcbiAgICAgICAgICAgICAgICBtb2RlOiByZXNvbHZlZE1vZGUsXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgaWYgKGNhcHR1cmVOb3RlKSBkYXRhLm5vdGUgPSBjYXB0dXJlTm90ZTtcbiAgICAgICAgICAgIGlmIChpbmNsdWRlQmFzZTY0KSB7XG4gICAgICAgICAgICAgICAgZGF0YS5kYXRhVXJpID0gYGRhdGE6aW1hZ2UvcG5nO2Jhc2U2NCwke3BuZy50b1N0cmluZygnYmFzZTY0Jyl9YDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IG1lc3NhZ2UgPSBjYXB0dXJlTm90ZVxuICAgICAgICAgICAgICAgID8gYFByZXZpZXcgc2NyZWVuc2hvdCBzYXZlZCB0byAke2ZpbGVQYXRofSAoJHtjYXB0dXJlTm90ZX0pYFxuICAgICAgICAgICAgICAgIDogYFByZXZpZXcgc2NyZWVuc2hvdCBzYXZlZCB0byAke2ZpbGVQYXRofSAobW9kZT0ke3Jlc29sdmVkTW9kZX0pYDtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGEsIG1lc3NhZ2UgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpIH07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyB2Mi44LjMgVC1WMjgzLTI6IHJlYWQgY29jb3MgcHJldmlldyBjb25maWcgc28gQUkgY2FuIHJvdXRlXG4gICAgLy8gY2FwdHVyZV9wcmV2aWV3X3NjcmVlbnNob3QgdG8gdGhlIGNvcnJlY3QgbW9kZSB3aXRob3V0IGd1ZXNzaW5nLlxuICAgIC8vIFJlYWRzIHZpYSBFZGl0b3IuTWVzc2FnZSBwcmVmZXJlbmNlcy9xdWVyeS1jb25maWcgKHR5cGVkIGluXG4gICAgLy8gbm9kZV9tb2R1bGVzL0Bjb2Nvcy9jcmVhdG9yLXR5cGVzLy4uLi9wcmVmZXJlbmNlcy9AdHlwZXMvbWVzc2FnZS5kLnRzKS5cbiAgICAvL1xuICAgIC8vIFdlIGR1bXAgdGhlIGZ1bGwgJ3ByZXZpZXcnIGNhdGVnb3J5LCB0aGVuIHRyeSB0byBpbnRlcnByZXQgYSBmZXdcbiAgICAvLyBjb21tb24ga2V5cyAoJ29wZW5fcHJldmlld193aXRoJywgJ3ByZXZpZXdfd2l0aCcsICdzaW11bGF0b3InLFxuICAgIC8vICdicm93c2VyJykgaW50byBhIG5vcm1hbGl6ZWQgbW9kZSBsYWJlbC4gSWYgaW50ZXJwcmV0YXRpb24gZmFpbHMsXG4gICAgLy8gd2Ugc3RpbGwgcmV0dXJuIHRoZSByYXcgY29uZmlnIHNvIHRoZSBBSSBjYW4gcmVhZCBpdCBkaXJlY3RseS5cbiAgICBwcml2YXRlIGFzeW5jIGdldFByZXZpZXdNb2RlKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBQcm9iZSBhdCBtb2R1bGUgbGV2ZWwgKG5vIGtleSkgdG8gZ2V0IHRoZSB3aG9sZSBjYXRlZ29yeS5cbiAgICAgICAgICAgIGNvbnN0IHJhdzogYW55ID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgncHJlZmVyZW5jZXMnLCAncXVlcnktY29uZmlnJyBhcyBhbnksICdwcmV2aWV3JyBhcyBhbnkpIGFzIGFueTtcbiAgICAgICAgICAgIGlmIChyYXcgPT09IHVuZGVmaW5lZCB8fCByYXcgPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgZXJyb3I6ICdwcmVmZXJlbmNlcy9xdWVyeS1jb25maWcgcmV0dXJuZWQgbnVsbCBmb3IgXCJwcmV2aWV3XCIg4oCUIGNvY29zIG1heSBub3QgZXhwb3NlIHRoaXMgY2F0ZWdvcnksIG9yIHlvdXIgYnVpbGQgZGlmZmVycyBmcm9tIDMuOC54LicsXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIEhldXJpc3RpYyBpbnRlcnByZXRhdGlvbi5cbiAgICAgICAgICAgIC8vIHYyLjguMyByZXRlc3QgZmluZGluZzogY29jb3MgMy44LjcgYWN0dWFsbHkgc3RvcmVzIHRoZVxuICAgICAgICAgICAgLy8gYWN0aXZlIG1vZGUgYXQgYHByZXZpZXcuY3VycmVudC5wbGF0Zm9ybWAgd2l0aCB2YWx1ZVxuICAgICAgICAgICAgLy8gYFwiZ2FtZVZpZXdcImAgKGVtYmVkZGVkKSwgYFwiYnJvd3NlclwiYCwgb3IgZGV2aWNlIG5hbWVzXG4gICAgICAgICAgICAvLyAoc2ltdWxhdG9yKS4gVGhlIG9yaWdpbmFsIGhldXJpc3RpYyBvbmx5IGNoZWNrZWQga2V5cyBsaWtlXG4gICAgICAgICAgICAvLyBgb3Blbl9wcmV2aWV3X3dpdGhgIC8gYHByZXZpZXdfd2l0aGAgLyBgb3Blbl93aXRoYCAvIGBtb2RlYFxuICAgICAgICAgICAgLy8gYW5kIG1pc3NlZCB0aGUgbGl2ZSBrZXkuIFByb2JlIGBjdXJyZW50LnBsYXRmb3JtYCBmaXJzdDtcbiAgICAgICAgICAgIC8vIGtlZXAgdGhlIGxlZ2FjeSBrZXlzIGFzIGZhbGxiYWNrIGZvciBvbGRlciBjb2NvcyB2ZXJzaW9ucy5cbiAgICAgICAgICAgIGNvbnN0IGxvd2VyID0gKHM6IGFueSkgPT4gKHR5cGVvZiBzID09PSAnc3RyaW5nJyA/IHMudG9Mb3dlckNhc2UoKSA6ICcnKTtcbiAgICAgICAgICAgIGxldCBpbnRlcnByZXRlZDogJ2Jyb3dzZXInIHwgJ3dpbmRvdycgfCAnc2ltdWxhdG9yJyB8ICdlbWJlZGRlZCcgfCAndW5rbm93bicgPSAndW5rbm93bic7XG4gICAgICAgICAgICBsZXQgaW50ZXJwcmV0ZWRGcm9tS2V5OiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgICAgICAgICAgIGNvbnN0IGNsYXNzaWZ5ID0gKHY6IHN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGx2ID0gbG93ZXIodik7XG4gICAgICAgICAgICAgICAgaWYgKGx2LmluY2x1ZGVzKCdicm93c2VyJykpIHJldHVybiAnYnJvd3Nlcic7XG4gICAgICAgICAgICAgICAgaWYgKGx2LmluY2x1ZGVzKCdzaW11bGF0b3InKSkgcmV0dXJuICdzaW11bGF0b3InO1xuICAgICAgICAgICAgICAgIGlmIChsdi5pbmNsdWRlcygnZW1iZWQnKSB8fCBsdi5pbmNsdWRlcygnZ2FtZXZpZXcnKSB8fCBsdi5pbmNsdWRlcygnZ2FtZV92aWV3JykpIHJldHVybiAnZW1iZWRkZWQnO1xuICAgICAgICAgICAgICAgIGlmIChsdi5pbmNsdWRlcygnd2luZG93JykpIHJldHVybiAnd2luZG93JztcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBjb25zdCBkaWcgPSAob2JqOiBhbnksIHBhdGg6IHN0cmluZyk6IGFueSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKCFvYmogfHwgdHlwZW9mIG9iaiAhPT0gJ29iamVjdCcpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgY29uc3QgcGFydHMgPSBwYXRoLnNwbGl0KCcuJyk7XG4gICAgICAgICAgICAgICAgbGV0IGN1cjogYW55ID0gb2JqO1xuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgcCBvZiBwYXJ0cykge1xuICAgICAgICAgICAgICAgICAgICBpZiAoIWN1ciB8fCB0eXBlb2YgY3VyICE9PSAnb2JqZWN0JykgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHAgaW4gY3VyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjdXIgPSBjdXJbcF07XG4gICAgICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAvLyBUcnkgb25lIGxldmVsIG9mIG5lc3QgKHNvbWV0aW1lcyB0aGUgY2F0ZWdvcnkgZHVtcFxuICAgICAgICAgICAgICAgICAgICAvLyBuZXN0cyB1bmRlciBhIGRlZmF1bHQtcHJvdG9jb2wgYnVja2V0KS5cbiAgICAgICAgICAgICAgICAgICAgbGV0IGZvdW5kID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIGZvciAoY29uc3QgdiBvZiBPYmplY3QudmFsdWVzKGN1cikpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh2ICYmIHR5cGVvZiB2ID09PSAnb2JqZWN0JyAmJiBwIGluICh2IGFzIGFueSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjdXIgPSAodiBhcyBhbnkpW3BdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvdW5kID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZiAoIWZvdW5kKSByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gY3VyO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGNvbnN0IHByb2JlS2V5cyA9IFtcbiAgICAgICAgICAgICAgICAncHJldmlldy5jdXJyZW50LnBsYXRmb3JtJyxcbiAgICAgICAgICAgICAgICAnY3VycmVudC5wbGF0Zm9ybScsXG4gICAgICAgICAgICAgICAgJ3ByZXZpZXcub3Blbl9wcmV2aWV3X3dpdGgnLFxuICAgICAgICAgICAgICAgICdvcGVuX3ByZXZpZXdfd2l0aCcsXG4gICAgICAgICAgICAgICAgJ3ByZXZpZXdfd2l0aCcsXG4gICAgICAgICAgICAgICAgJ29wZW5fd2l0aCcsXG4gICAgICAgICAgICAgICAgJ21vZGUnLFxuICAgICAgICAgICAgXTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgayBvZiBwcm9iZUtleXMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB2ID0gZGlnKHJhdywgayk7XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiB2ID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjbHMgPSBjbGFzc2lmeSh2KTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNscykge1xuICAgICAgICAgICAgICAgICAgICAgICAgaW50ZXJwcmV0ZWQgPSBjbHM7XG4gICAgICAgICAgICAgICAgICAgICAgICBpbnRlcnByZXRlZEZyb21LZXkgPSBgJHtrfT0ke3Z9YDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIC8vIE5vbi1lbXB0eSBzdHJpbmcgdGhhdCBkaWRuJ3QgbWF0Y2ggYSBrbm93biBsYWJlbCDihpJcbiAgICAgICAgICAgICAgICAgICAgLy8gcmVjb3JkIGFzICdzaW11bGF0b3InIGNhbmRpZGF0ZSBpZiBpdCBsb29rcyBsaWtlIGFcbiAgICAgICAgICAgICAgICAgICAgLy8gZGV2aWNlIG5hbWUgKGUuZy4gXCJBcHBsZSBpUGhvbmUgMTQgUHJvXCIpLCBvdGhlcndpc2VcbiAgICAgICAgICAgICAgICAgICAgLy8ga2VlcCBzZWFyY2hpbmcuXG4gICAgICAgICAgICAgICAgICAgIGlmICgvaVBob25lfGlQYWR8SFVBV0VJfFhpYW9taXxTb255fEFzdXN8T1BQT3xIb25vcnxOb2tpYXxMZW5vdm98U2Ftc3VuZ3xHb29nbGV8UGl4ZWwvaS50ZXN0KHYpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpbnRlcnByZXRlZCA9ICdzaW11bGF0b3InO1xuICAgICAgICAgICAgICAgICAgICAgICAgaW50ZXJwcmV0ZWRGcm9tS2V5ID0gYCR7a309JHt2fWA7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7IGludGVycHJldGVkLCBpbnRlcnByZXRlZEZyb21LZXksIHJhdyB9LFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGludGVycHJldGVkID09PSAndW5rbm93bidcbiAgICAgICAgICAgICAgICAgICAgPyAnUmVhZCBjb2NvcyBwcmV2aWV3IGNvbmZpZyBidXQgY291bGQgbm90IGludGVycHJldCBhIG1vZGUgbGFiZWw7IGluc3BlY3QgZGF0YS5yYXcgYW5kIHBhc3MgbW9kZT0gZXhwbGljaXRseSB0byBjYXB0dXJlX3ByZXZpZXdfc2NyZWVuc2hvdC4nXG4gICAgICAgICAgICAgICAgICAgIDogYGNvY29zIHByZXZpZXcgaXMgY29uZmlndXJlZCBhcyBcIiR7aW50ZXJwcmV0ZWR9XCIgKGZyb20ga2V5IFwiJHtpbnRlcnByZXRlZEZyb21LZXl9XCIpLiBQYXNzIG1vZGU9XCIke2ludGVycHJldGVkID09PSAnYnJvd3NlcicgPyAnd2luZG93JyA6IGludGVycHJldGVkfVwiIHRvIGNhcHR1cmVfcHJldmlld19zY3JlZW5zaG90LCBvciByZWx5IG9uIG1vZGU9XCJhdXRvXCIuYCxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBwcmVmZXJlbmNlcy9xdWVyeS1jb25maWcgJ3ByZXZpZXcnIGZhaWxlZDogJHtlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycil9YCB9O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gdjIuOS4wIFQtVjI5LTI6IGNvdW50ZXJwYXJ0IHRvIGdldFByZXZpZXdNb2RlLiBXcml0ZXNcbiAgICAvLyBwcmV2aWV3LmN1cnJlbnQucGxhdGZvcm0gdmlhIHRoZSB0eXBlZFxuICAgIC8vIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3ByZWZlcmVuY2VzJywgJ3NldC1jb25maWcnLCAuLi4pIGNoYW5uZWwuXG4gICAgLy9cbiAgICAvLyB2Mi45LjAgcmV0ZXN0IGZpeDogdGhlIGluaXRpYWwgaW1wbGVtZW50YXRpb24gcGFzc2VkXG4gICAgLy8gKCdwcmV2aWV3JywgJ2N1cnJlbnQucGxhdGZvcm0nLCB2YWx1ZSkgYW5kIHJldHVybmVkIHN1Y2Nlc3MgYnV0XG4gICAgLy8gdGhlIHdyaXRlIGRpZCBOT1QgdGFrZSBlZmZlY3Qg4oCUIGNvY29zJ3Mgc2V0LWNvbmZpZyBkb2Vzbid0IHNlZW1cbiAgICAvLyB0byBzdXBwb3J0IGRvdC1wYXRoIGtleXMuIFN0cmF0ZWdpZXMgdHJpZWQgaW4gb3JkZXI6XG4gICAgLy8gICAxLiAoJ3ByZXZpZXcnLCAnY3VycmVudCcsIHsgcGxhdGZvcm06IHZhbHVlIH0pICDigJQgbmVzdGVkIG9iamVjdFxuICAgIC8vICAgMi4gKCdwcmV2aWV3JywgJ2N1cnJlbnQucGxhdGZvcm0nLCB2YWx1ZSwgJ2dsb2JhbCcpIOKAlCBleHBsaWNpdCBwcm90b2NvbFxuICAgIC8vICAgMy4gKCdwcmV2aWV3JywgJ2N1cnJlbnQucGxhdGZvcm0nLCB2YWx1ZSwgJ2xvY2FsJykgIOKAlCBleHBsaWNpdCBwcm90b2NvbFxuICAgIC8vICAgNC4gKCdwcmV2aWV3JywgJ2N1cnJlbnQucGxhdGZvcm0nLCB2YWx1ZSkgICAgICAgICAg4oCUIG5vIHByb3RvY29sIChvcmlnaW5hbClcbiAgICAvLyBFYWNoIGF0dGVtcHQgaXMgZm9sbG93ZWQgYnkgYSBmcmVzaCBxdWVyeS1jb25maWcgdG8gdmVyaWZ5IHRoZVxuICAgIC8vIHZhbHVlIGFjdHVhbGx5IGZsaXBwZWQuIFdlIHJldHVybiB0aGUgc3RyYXRlZ3kgdGhhdCB3b3JrZWQgcGx1c1xuICAgIC8vIHRoZSByYXcgc2V0LWNvbmZpZyByZXR1cm4gZm9yIGRpYWdub3N0aWNzLlxuICAgIC8vXG4gICAgLy8gQ29uZmlybSBnYXRlOiBgY29uZmlybT1mYWxzZWAgKGRlZmF1bHQpIGlzIGEgZHJ5LXJ1biB0aGF0IHJldHVybnNcbiAgICAvLyB0aGUgY3VycmVudCB2YWx1ZSArIHN1Z2dlc3RlZCBjYWxsLiBgY29uZmlybT10cnVlYCBhY3R1YWxseVxuICAgIC8vIHdyaXRlcy4gVGhpcyBhdm9pZHMgQUktaW5kdWNlZCBwcmVmZXJlbmNlIGRyaWZ0IHdoZW4gdGhlIExMTSBpc1xuICAgIC8vIGV4cGxvcmluZyB0b29sIGNhcGFiaWxpdGllcy5cbiAgICBwcml2YXRlIGFzeW5jIHNldFByZXZpZXdNb2RlKG1vZGU6ICdicm93c2VyJyB8ICdnYW1lVmlldycgfCAnc2ltdWxhdG9yJywgY29uZmlybTogYm9vbGVhbik6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBxdWVyeUN1cnJlbnQgPSBhc3luYyAoKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgY2ZnOiBhbnkgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdwcmVmZXJlbmNlcycsICdxdWVyeS1jb25maWcnIGFzIGFueSwgJ3ByZXZpZXcnIGFzIGFueSkgYXMgYW55O1xuICAgICAgICAgICAgICAgIHJldHVybiBjZmc/LnByZXZpZXc/LmN1cnJlbnQ/LnBsYXRmb3JtID8/IG51bGw7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgY29uc3QgcHJldmlvdXNNb2RlID0gYXdhaXQgcXVlcnlDdXJyZW50KCk7XG4gICAgICAgICAgICBpZiAoIWNvbmZpcm0pIHtcbiAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBkYXRhOiB7IHByZXZpb3VzTW9kZSwgcmVxdWVzdGVkTW9kZTogbW9kZSwgY29uZmlybWVkOiBmYWxzZSB9LFxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgRHJ5IHJ1biBvbmx5IOKAlCBjdXJyZW50IGNvY29zIHByZXZpZXcgbW9kZSBpcyBcIiR7cHJldmlvdXNNb2RlID8/ICd1bmtub3duJ31cIiwgcmVxdWVzdGVkIFwiJHttb2RlfVwiLiBSZS1jYWxsIHdpdGggY29uZmlybT10cnVlIHRvIGFjdHVhbGx5IHN3aXRjaC4gQ2FsbGVyIGlzIHJlc3BvbnNpYmxlIGZvciByZXN0b3JpbmcgdGhlIG9yaWdpbmFsIG1vZGUgd2hlbiBkb25lIGlmIGFwcHJvcHJpYXRlLmAsXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChwcmV2aW91c01vZGUgPT09IG1vZGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBkYXRhOiB7IHByZXZpb3VzTW9kZSwgbmV3TW9kZTogbW9kZSwgY29uZmlybWVkOiB0cnVlLCBub09wOiB0cnVlIH0sXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBjb2NvcyBwcmV2aWV3IGFscmVhZHkgc2V0IHRvIFwiJHttb2RlfVwiOyBubyBjaGFuZ2UgYXBwbGllZC5gLFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0eXBlIFN0cmF0ZWd5ID0geyBpZDogc3RyaW5nOyBwYXlsb2FkOiAoKSA9PiBQcm9taXNlPGFueT4gfTtcbiAgICAgICAgICAgIGNvbnN0IHN0cmF0ZWdpZXM6IFN0cmF0ZWd5W10gPSBbXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBpZDogXCJzZXQtY29uZmlnKCdwcmV2aWV3JywnY3VycmVudCcse3BsYXRmb3JtOnZhbHVlfSlcIixcbiAgICAgICAgICAgICAgICAgICAgcGF5bG9hZDogKCkgPT4gRWRpdG9yLk1lc3NhZ2UucmVxdWVzdChcbiAgICAgICAgICAgICAgICAgICAgICAgICdwcmVmZXJlbmNlcycsICdzZXQtY29uZmlnJyBhcyBhbnksXG4gICAgICAgICAgICAgICAgICAgICAgICAncHJldmlldycgYXMgYW55LCAnY3VycmVudCcgYXMgYW55LFxuICAgICAgICAgICAgICAgICAgICAgICAgeyBwbGF0Zm9ybTogbW9kZSB9IGFzIGFueSxcbiAgICAgICAgICAgICAgICAgICAgKSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgaWQ6IFwic2V0LWNvbmZpZygncHJldmlldycsJ2N1cnJlbnQucGxhdGZvcm0nLHZhbHVlLCdnbG9iYWwnKVwiLFxuICAgICAgICAgICAgICAgICAgICBwYXlsb2FkOiAoKSA9PiBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KFxuICAgICAgICAgICAgICAgICAgICAgICAgJ3ByZWZlcmVuY2VzJywgJ3NldC1jb25maWcnIGFzIGFueSxcbiAgICAgICAgICAgICAgICAgICAgICAgICdwcmV2aWV3JyBhcyBhbnksICdjdXJyZW50LnBsYXRmb3JtJyBhcyBhbnksXG4gICAgICAgICAgICAgICAgICAgICAgICBtb2RlIGFzIGFueSwgJ2dsb2JhbCcgYXMgYW55LFxuICAgICAgICAgICAgICAgICAgICApLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBpZDogXCJzZXQtY29uZmlnKCdwcmV2aWV3JywnY3VycmVudC5wbGF0Zm9ybScsdmFsdWUsJ2xvY2FsJylcIixcbiAgICAgICAgICAgICAgICAgICAgcGF5bG9hZDogKCkgPT4gRWRpdG9yLk1lc3NhZ2UucmVxdWVzdChcbiAgICAgICAgICAgICAgICAgICAgICAgICdwcmVmZXJlbmNlcycsICdzZXQtY29uZmlnJyBhcyBhbnksXG4gICAgICAgICAgICAgICAgICAgICAgICAncHJldmlldycgYXMgYW55LCAnY3VycmVudC5wbGF0Zm9ybScgYXMgYW55LFxuICAgICAgICAgICAgICAgICAgICAgICAgbW9kZSBhcyBhbnksICdsb2NhbCcgYXMgYW55LFxuICAgICAgICAgICAgICAgICAgICApLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBpZDogXCJzZXQtY29uZmlnKCdwcmV2aWV3JywnY3VycmVudC5wbGF0Zm9ybScsdmFsdWUpXCIsXG4gICAgICAgICAgICAgICAgICAgIHBheWxvYWQ6ICgpID0+IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoXG4gICAgICAgICAgICAgICAgICAgICAgICAncHJlZmVyZW5jZXMnLCAnc2V0LWNvbmZpZycgYXMgYW55LFxuICAgICAgICAgICAgICAgICAgICAgICAgJ3ByZXZpZXcnIGFzIGFueSwgJ2N1cnJlbnQucGxhdGZvcm0nIGFzIGFueSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1vZGUgYXMgYW55LFxuICAgICAgICAgICAgICAgICAgICApLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBdO1xuICAgICAgICAgICAgY29uc3QgYXR0ZW1wdHM6IEFycmF5PHsgc3RyYXRlZ3k6IHN0cmluZzsgc2V0UmVzdWx0OiBhbnk7IG9ic2VydmVkTW9kZTogc3RyaW5nIHwgbnVsbDsgbWF0Y2hlZDogYm9vbGVhbjsgZXJyb3I/OiBzdHJpbmcgfT4gPSBbXTtcbiAgICAgICAgICAgIGxldCB3aW5uZXI6IHR5cGVvZiBhdHRlbXB0c1tudW1iZXJdIHwgbnVsbCA9IG51bGw7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHMgb2Ygc3RyYXRlZ2llcykge1xuICAgICAgICAgICAgICAgIGxldCBzZXRSZXN1bHQ6IGFueSA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICBsZXQgZXJyb3I6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBzZXRSZXN1bHQgPSBhd2FpdCBzLnBheWxvYWQoKTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgICAgICAgICBlcnJvciA9IGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29uc3Qgb2JzZXJ2ZWRNb2RlID0gYXdhaXQgcXVlcnlDdXJyZW50KCk7XG4gICAgICAgICAgICAgICAgY29uc3QgbWF0Y2hlZCA9IG9ic2VydmVkTW9kZSA9PT0gbW9kZTtcbiAgICAgICAgICAgICAgICBhdHRlbXB0cy5wdXNoKHsgc3RyYXRlZ3k6IHMuaWQsIHNldFJlc3VsdCwgb2JzZXJ2ZWRNb2RlLCBtYXRjaGVkLCBlcnJvciB9KTtcbiAgICAgICAgICAgICAgICBpZiAobWF0Y2hlZCkge1xuICAgICAgICAgICAgICAgICAgICB3aW5uZXIgPSBhdHRlbXB0c1thdHRlbXB0cy5sZW5ndGggLSAxXTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCF3aW5uZXIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGBzZXQtY29uZmlnIHN0cmF0ZWdpZXMgYWxsIGZhaWxlZCB0byBmbGlwIHByZXZpZXcuY3VycmVudC5wbGF0Zm9ybSBmcm9tIFwiJHtwcmV2aW91c01vZGUgPz8gJ3Vua25vd24nfVwiIHRvIFwiJHttb2RlfVwiLiBUcmllZCA0IHNoYXBlczsgY29jb3MgcmV0dXJuZWQgdmFsdWVzIGJ1dCB0aGUgcmVhZC1iYWNrIG5ldmVyIG1hdGNoZWQgdGhlIHJlcXVlc3RlZCBtb2RlLiBUaGUgc2V0LWNvbmZpZyBjaGFubmVsIG1heSBoYXZlIGNoYW5nZWQgaW4gdGhpcyBjb2NvcyBidWlsZDsgc3dpdGNoIHZpYSB0aGUgY29jb3MgcHJldmlldyBkcm9wZG93biBtYW51YWxseSBmb3Igbm93IGFuZCByZXBvcnQgd2hpY2ggc2hhcGUgd29ya3MuYCxcbiAgICAgICAgICAgICAgICAgICAgZGF0YTogeyBwcmV2aW91c01vZGUsIHJlcXVlc3RlZE1vZGU6IG1vZGUsIGF0dGVtcHRzIH0sXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7IHByZXZpb3VzTW9kZSwgbmV3TW9kZTogbW9kZSwgY29uZmlybWVkOiB0cnVlLCBzdHJhdGVneTogd2lubmVyLnN0cmF0ZWd5LCBhdHRlbXB0cyB9LFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBjb2NvcyBwcmV2aWV3IHN3aXRjaGVkOiBcIiR7cHJldmlvdXNNb2RlID8/ICd1bmtub3duJ31cIiDihpIgXCIke21vZGV9XCIgdmlhICR7d2lubmVyLnN0cmF0ZWd5fS4gUmVzdG9yZSB2aWEgZGVidWdfc2V0X3ByZXZpZXdfbW9kZShtb2RlPVwiJHtwcmV2aW91c01vZGUgPz8gJ2Jyb3dzZXInfVwiLCBjb25maXJtPXRydWUpIHdoZW4gZG9uZSBpZiBuZWVkZWQuYCxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBwcmVmZXJlbmNlcy9zZXQtY29uZmlnICdwcmV2aWV3JyBmYWlsZWQ6ICR7ZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpfWAgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgYmF0Y2hTY3JlZW5zaG90KHNhdmVQYXRoUHJlZml4Pzogc3RyaW5nLCBkZWxheXNNczogbnVtYmVyW10gPSBbMF0sIHdpbmRvd1RpdGxlPzogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGxldCBwcmVmaXggPSBzYXZlUGF0aFByZWZpeDtcbiAgICAgICAgICAgIGlmICghcHJlZml4KSB7XG4gICAgICAgICAgICAgICAgLy8gYmFzZW5hbWUgaXMgdGhlIHByZWZpeCBzdGVtOyBwZXItaXRlcmF0aW9uIGZpbGVzIGV4dGVuZCBpdFxuICAgICAgICAgICAgICAgIC8vIHdpdGggYC0ke2l9LnBuZ2AuIENvbnRhaW5tZW50IGNoZWNrIG9uIHRoZSBwcmVmaXggcGF0aCBpc1xuICAgICAgICAgICAgICAgIC8vIHN1ZmZpY2llbnQgYmVjYXVzZSBwYXRoLmpvaW4gcHJlc2VydmVzIGRpcm5hbWUgZm9yIGFueVxuICAgICAgICAgICAgICAgIC8vIHN1ZmZpeCB0aGUgbG9vcCBhcHBlbmRzLlxuICAgICAgICAgICAgICAgIGNvbnN0IHJlc29sdmVkID0gdGhpcy5yZXNvbHZlQXV0b0NhcHR1cmVGaWxlKGBiYXRjaC0ke0RhdGUubm93KCl9YCk7XG4gICAgICAgICAgICAgICAgaWYgKCFyZXNvbHZlZC5vaykgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiByZXNvbHZlZC5lcnJvciB9O1xuICAgICAgICAgICAgICAgIHByZWZpeCA9IHJlc29sdmVkLmZpbGVQYXRoO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyB2Mi44LjEgcm91bmQtMSBmaXggKEdlbWluaSDwn5S0ICsgQ29kZXgg8J+foSk6IGV4cGxpY2l0IHByZWZpeFxuICAgICAgICAgICAgICAgIC8vIGFsc28gZ2V0cyBjb250YWlubWVudC1jaGVja2VkLiBXZSBjaGVjayB0aGUgcHJlZml4IHBhdGhcbiAgICAgICAgICAgICAgICAvLyBpdHNlbGYg4oCUIGV2ZXJ5IGVtaXR0ZWQgZmlsZSBsaXZlcyBpbiB0aGUgc2FtZSBkaXJuYW1lLlxuICAgICAgICAgICAgICAgIC8vIHYyLjguMiByZXRlc3QgZml4OiB1c2UgcmVzb2x2ZWRQYXRoIGZvciByZWxhdGl2ZS1wcmVmaXggc3VwcG9ydC5cbiAgICAgICAgICAgICAgICBjb25zdCBndWFyZCA9IHRoaXMuYXNzZXJ0U2F2ZVBhdGhXaXRoaW5Qcm9qZWN0KHByZWZpeCk7XG4gICAgICAgICAgICAgICAgaWYgKCFndWFyZC5vaykgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBndWFyZC5lcnJvciB9O1xuICAgICAgICAgICAgICAgIHByZWZpeCA9IGd1YXJkLnJlc29sdmVkUGF0aDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHdpbiA9IHRoaXMucGlja1dpbmRvdyh3aW5kb3dUaXRsZSk7XG4gICAgICAgICAgICBjb25zdCBjYXB0dXJlczogYW55W10gPSBbXTtcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZGVsYXlzTXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICBjb25zdCBkZWxheSA9IGRlbGF5c01zW2ldO1xuICAgICAgICAgICAgICAgIGlmIChkZWxheSA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIGRlbGF5KSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IGZpbGVQYXRoID0gYCR7cHJlZml4fS0ke2l9LnBuZ2A7XG4gICAgICAgICAgICAgICAgY29uc3QgaW1hZ2UgPSBhd2FpdCB3aW4ud2ViQ29udGVudHMuY2FwdHVyZVBhZ2UoKTtcbiAgICAgICAgICAgICAgICBjb25zdCBwbmc6IEJ1ZmZlciA9IGltYWdlLnRvUE5HKCk7XG4gICAgICAgICAgICAgICAgZnMud3JpdGVGaWxlU3luYyhmaWxlUGF0aCwgcG5nKTtcbiAgICAgICAgICAgICAgICBjYXB0dXJlcy5wdXNoKHsgaW5kZXg6IGksIGRlbGF5TXM6IGRlbGF5LCBmaWxlUGF0aCwgc2l6ZTogcG5nLmxlbmd0aCB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIGNvdW50OiBjYXB0dXJlcy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgIHdpbmRvd1RpdGxlOiB0eXBlb2Ygd2luLmdldFRpdGxlID09PSAnZnVuY3Rpb24nID8gd2luLmdldFRpdGxlKCkgOiAnJyxcbiAgICAgICAgICAgICAgICAgICAgY2FwdHVyZXMsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiBgQ2FwdHVyZWQgJHtjYXB0dXJlcy5sZW5ndGh9IHNjcmVlbnNob3RzYCxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKSB9O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gdjIuNy4wICMzOiBwcmV2aWV3LXVybCAvIHF1ZXJ5LWRldmljZXMgaGFuZGxlcnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgICBwcml2YXRlIGFzeW5jIHByZXZpZXdVcmwoYWN0aW9uOiAncXVlcnknIHwgJ29wZW4nID0gJ3F1ZXJ5Jyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCB1cmw6IHN0cmluZyA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3ByZXZpZXcnLCAncXVlcnktcHJldmlldy11cmwnIGFzIGFueSkgYXMgYW55O1xuICAgICAgICAgICAgaWYgKCF1cmwgfHwgdHlwZW9mIHVybCAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdwcmV2aWV3L3F1ZXJ5LXByZXZpZXctdXJsIHJldHVybmVkIGVtcHR5IHJlc3VsdDsgY2hlY2sgdGhhdCBjb2NvcyBwcmV2aWV3IHNlcnZlciBpcyBydW5uaW5nJyB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgZGF0YTogYW55ID0geyB1cmwgfTtcbiAgICAgICAgICAgIGlmIChhY3Rpb24gPT09ICdvcGVuJykge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIExhenkgcmVxdWlyZSBzbyBzbW9rZSAvIG5vbi1FbGVjdHJvbiBjb250ZXh0cyBkb24ndCBmYXVsdFxuICAgICAgICAgICAgICAgICAgICAvLyBvbiBtaXNzaW5nIGVsZWN0cm9uLlxuICAgICAgICAgICAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLXZhci1yZXF1aXJlc1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBlbGVjdHJvbiA9IHJlcXVpcmUoJ2VsZWN0cm9uJyk7XG4gICAgICAgICAgICAgICAgICAgIC8vIHYyLjcuMSByZXZpZXcgZml4IChjb2RleCDwn5+hICsgZ2VtaW5pIPCfn6EpOiBvcGVuRXh0ZXJuYWxcbiAgICAgICAgICAgICAgICAgICAgLy8gcmVzb2x2ZXMgd2hlbiB0aGUgT1MgbGF1bmNoZXIgaXMgaW52b2tlZCwgbm90IHdoZW4gdGhlXG4gICAgICAgICAgICAgICAgICAgIC8vIHBhZ2UgcmVuZGVycy4gVXNlIFwibGF1bmNoXCIgd29yZGluZyB0byBhdm9pZCB0aGUgQUlcbiAgICAgICAgICAgICAgICAgICAgLy8gbWlzcmVhZGluZyBcIm9wZW5lZFwiIGFzIGEgY29uZmlybWVkIHBhZ2UtbG9hZC5cbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgZWxlY3Ryb24uc2hlbGwub3BlbkV4dGVybmFsKHVybCk7XG4gICAgICAgICAgICAgICAgICAgIGRhdGEubGF1bmNoZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICAgICAgICAgIGRhdGEubGF1bmNoZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgZGF0YS5sYXVuY2hFcnJvciA9IGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBSZWZsZWN0IGFjdHVhbCBsYXVuY2ggb3V0Y29tZSBpbiB0aGUgdG9wLWxldmVsIG1lc3NhZ2Ugc28gQUlcbiAgICAgICAgICAgIC8vIHNlZXMgXCJsYXVuY2ggZmFpbGVkXCIgaW5zdGVhZCBvZiBtaXNsZWFkaW5nIFwiT3BlbmVkIC4uLlwiIHdoZW5cbiAgICAgICAgICAgIC8vIG9wZW5FeHRlcm5hbCB0aHJldyAoZ2VtaW5pIPCfn6EpLlxuICAgICAgICAgICAgY29uc3QgbWVzc2FnZSA9IGFjdGlvbiA9PT0gJ29wZW4nXG4gICAgICAgICAgICAgICAgPyAoZGF0YS5sYXVuY2hlZFxuICAgICAgICAgICAgICAgICAgICA/IGBMYXVuY2hlZCAke3VybH0gaW4gZGVmYXVsdCBicm93c2VyIChwYWdlIHJlbmRlciBub3QgYXdhaXRlZClgXG4gICAgICAgICAgICAgICAgICAgIDogYFJldHVybmVkIFVSTCAke3VybH0gYnV0IGxhdW5jaCBmYWlsZWQ6ICR7ZGF0YS5sYXVuY2hFcnJvcn1gKVxuICAgICAgICAgICAgICAgIDogdXJsO1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZGF0YSwgbWVzc2FnZSB9O1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycikgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIHYyLjguMCBULVYyOC0zOiBQSUUgcGxheSAvIHN0b3AuIFJvdXRlcyB0aHJvdWdoIHNjZW5lLXNjcmlwdCBzbyB0aGVcbiAgICAvLyB0eXBlZCBjY2UuU2NlbmVGYWNhZGUuY2hhbmdlUHJldmlld1BsYXlTdGF0ZSBpcyByZWFjaGVkIHZpYSB0aGVcbiAgICAvLyBkb2N1bWVudGVkIGV4ZWN1dGUtc2NlbmUtc2NyaXB0IGNoYW5uZWwuXG4gICAgLy9cbiAgICAvLyB2Mi44LjMgVC1WMjgzLTMgcmV0ZXN0IGZpbmRpbmc6IGNvY29zIHNvbWV0aW1lcyBsb2dzXG4gICAgLy8gXCJGYWlsZWQgdG8gcmVmcmVzaCB0aGUgY3VycmVudCBzY2VuZVwiIGluc2lkZSBjaGFuZ2VQcmV2aWV3UGxheVN0YXRlXG4gICAgLy8gZXZlbiB3aGVuIHRoZSBjYWxsIHJldHVybnMgd2l0aG91dCB0aHJvd2luZy4gT2JzZXJ2ZWQgaW4gY29jb3NcbiAgICAvLyAzLjguNyAvIGVtYmVkZGVkIHByZXZpZXcgbW9kZS4gVGhlIHJvb3QgY2F1c2UgaXMgdW5jbGVhciAobWF5XG4gICAgLy8gcmVsYXRlIHRvIGN1bXVsYXRpdmUgc2NlbmUtZGlydHkgLyBlbWJlZGRlZC1tb2RlIHRpbWluZyAvXG4gICAgLy8gaW5pdGlhbC1sb2FkIGNvbXBsYWludCksIGJ1dCB0aGUgdmlzaWJsZSBlZmZlY3QgaXMgdGhhdCBQSUUgc3RhdGVcbiAgICAvLyBjaGFuZ2VzIGluY29tcGxldGVseS4gV2Ugbm93IFNDQU4gdGhlIGNhcHR1cmVkIHNjZW5lLXNjcmlwdCBsb2dzXG4gICAgLy8gZm9yIHRoYXQgZXJyb3Igc3RyaW5nIGFuZCBzdXJmYWNlIGl0IHRvIHRoZSBBSSBhcyBhIHN0cnVjdHVyZWRcbiAgICAvLyB3YXJuaW5nIGluc3RlYWQgb2YgbGV0dGluZyBpdCBoaWRlIGluc2lkZSBkYXRhLmNhcHR1cmVkTG9ncy5cbiAgICAvLyB2Mi45LjAgVC1WMjktMTogZWRpdG9yLWhlYWx0aCBwcm9iZS4gRGV0ZWN0cyBzY2VuZS1zY3JpcHQgZnJlZXplXG4gICAgLy8gYnkgcnVubmluZyB0d28gcHJvYmVzIGluIHBhcmFsbGVsOlxuICAgIC8vICAgLSBob3N0IHByb2JlOiBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdkZXZpY2UnLCAncXVlcnknKSDigJQgZ29lc1xuICAgIC8vICAgICB0byB0aGUgZWRpdG9yIG1haW4gcHJvY2VzcywgTk9UIHRoZSBzY2VuZS1zY3JpcHQgcmVuZGVyZXIuXG4gICAgLy8gICAgIFRoaXMgc3RheXMgcmVzcG9uc2l2ZSBldmVuIHdoZW4gc2NlbmUgaXMgd2VkZ2VkLlxuICAgIC8vICAgLSBzY2VuZSBwcm9iZTogZXhlY3V0ZS1zY2VuZS1zY3JpcHQgaW52b2NhdGlvbiB3aXRoIGEgdHJpdmlhbFxuICAgIC8vICAgICBgZXZhbEVjaG9gIHRlc3QgKHVzZXMgYW4gZXhpc3Rpbmcgc2FmZSBzY2VuZSBtZXRob2QsIHdpdGhcbiAgICAvLyAgICAgd3JhcHBpbmcgdGltZW91dCkuIFRpbWVzIG91dCDihpIgc2NlbmUtc2NyaXB0IGZyb3plbi5cbiAgICAvL1xuICAgIC8vIERlc2lnbmVkIGZvciB0aGUgcG9zdC1wcmV2aWV3X2NvbnRyb2woc3RhcnQpIGZyZWV6ZSBwYXR0ZXJuIGluXG4gICAgLy8gbGFuZG1pbmUgIzE2OiBBSSBjYWxscyBwcmV2aWV3X2NvbnRyb2woc3RhcnQpLCB0aGVuXG4gICAgLy8gY2hlY2tfZWRpdG9yX2hlYWx0aCwgYW5kIGlmIHNjZW5lQWxpdmU9ZmFsc2Ugc3RvcHMgaXNzdWluZyBtb3JlXG4gICAgLy8gc2NlbmUgY2FsbHMgYW5kIHN1cmZhY2VzIHRoZSByZWNvdmVyeSBoaW50IGluc3RlYWQgb2YgaGFuZ2luZy5cbiAgICBwcml2YXRlIGFzeW5jIGNoZWNrRWRpdG9ySGVhbHRoKHNjZW5lVGltZW91dE1zOiBudW1iZXIgPSAxNTAwKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgdDAgPSBEYXRlLm5vdygpO1xuICAgICAgICAvLyBIb3N0IHByb2JlIOKAlCBzaG91bGQgYWx3YXlzIHJlc29sdmUgZmFzdC5cbiAgICAgICAgbGV0IGhvc3RBbGl2ZSA9IGZhbHNlO1xuICAgICAgICBsZXQgaG9zdEVycm9yOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2RldmljZScsICdxdWVyeScpO1xuICAgICAgICAgICAgaG9zdEFsaXZlID0gdHJ1ZTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIGhvc3RFcnJvciA9IGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBTY2VuZSBwcm9iZSDigJQgd3JhcCBpbiBhIGhhcmQgdGltZW91dC4gV2UgZGVsaWJlcmF0ZWx5IHBpY2sgYVxuICAgICAgICAvLyBtZXRob2QgdGhhdCBleGlzdHMgb24gdGhlIHNjZW5lLXNjcmlwdCBzaWRlIEFORCBkb2VzIHRoZVxuICAgICAgICAvLyBtaW5pbXVtIHdvcms6IGdldEN1cnJlbnRTY2VuZUluZm8ganVzdCByZWFkcyBkaXJlY3RvciBzdGF0ZS5cbiAgICAgICAgY29uc3Qgc2NlbmVQcm9taXNlID0gcnVuU2NlbmVNZXRob2RBc1Rvb2xSZXNwb25zZSgnZ2V0Q3VycmVudFNjZW5lSW5mbycsIFtdLCB7IGNhcHR1cmU6IGZhbHNlIH0pO1xuICAgICAgICBjb25zdCB0aW1lb3V0UHJvbWlzZSA9IG5ldyBQcm9taXNlPHsgdGltZWRPdXQ6IHRydWUgfT4ocmVzb2x2ZSA9PlxuICAgICAgICAgICAgc2V0VGltZW91dCgoKSA9PiByZXNvbHZlKHsgdGltZWRPdXQ6IHRydWUgfSksIHNjZW5lVGltZW91dE1zKSxcbiAgICAgICAgKTtcbiAgICAgICAgY29uc3Qgc2NlbmVTdGFydCA9IERhdGUubm93KCk7XG4gICAgICAgIGNvbnN0IHNjZW5lUmVzdWx0OiBhbnkgPSBhd2FpdCBQcm9taXNlLnJhY2UoW3NjZW5lUHJvbWlzZSwgdGltZW91dFByb21pc2VdKTtcbiAgICAgICAgY29uc3Qgc2NlbmVMYXRlbmN5TXMgPSBEYXRlLm5vdygpIC0gc2NlbmVTdGFydDtcbiAgICAgICAgY29uc3Qgc2NlbmVBbGl2ZSA9ICEhc2NlbmVSZXN1bHQgJiYgIXNjZW5lUmVzdWx0LnRpbWVkT3V0ICYmIHNjZW5lUmVzdWx0LnN1Y2Nlc3MgIT09IGZhbHNlO1xuICAgICAgICBsZXQgc2NlbmVFcnJvcjogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgICAgIGlmIChzY2VuZVJlc3VsdD8udGltZWRPdXQpIHtcbiAgICAgICAgICAgIHNjZW5lRXJyb3IgPSBgc2NlbmUtc2NyaXB0IHByb2JlIHRpbWVkIG91dCBhZnRlciAke3NjZW5lVGltZW91dE1zfW1zIOKAlCBzY2VuZSByZW5kZXJlciBsaWtlbHkgZnJvemVuYDtcbiAgICAgICAgfSBlbHNlIGlmIChzY2VuZVJlc3VsdD8uc3VjY2VzcyA9PT0gZmFsc2UpIHtcbiAgICAgICAgICAgIHNjZW5lRXJyb3IgPSBzY2VuZVJlc3VsdC5lcnJvciA/PyAnc2NlbmUtc2NyaXB0IHByb2JlIHJldHVybmVkIHN1Y2Nlc3M9ZmFsc2UnO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHN1Z2dlc3Rpb24gPSAhaG9zdEFsaXZlXG4gICAgICAgICAgICA/ICdjb2NvcyBlZGl0b3IgaG9zdCBwcm9jZXNzIHVucmVzcG9uc2l2ZSDigJQgdmVyaWZ5IHRoZSBlZGl0b3IgaXMgcnVubmluZyBhbmQgdGhlIGNvY29zLW1jcC1zZXJ2ZXIgZXh0ZW5zaW9uIGlzIGxvYWRlZC4nXG4gICAgICAgICAgICA6ICFzY2VuZUFsaXZlXG4gICAgICAgICAgICAgICAgPyAnY29jb3MgZWRpdG9yIHNjZW5lLXNjcmlwdCBpcyBmcm96ZW4gKGxpa2VseSBsYW5kbWluZSAjMTYgYWZ0ZXIgcHJldmlld19jb250cm9sKHN0YXJ0KSkuIFByZXNzIEN0cmwrUiBpbiB0aGUgY29jb3MgZWRpdG9yIHRvIHJlbG9hZCB0aGUgc2NlbmUtc2NyaXB0IHJlbmRlcmVyOyBkbyBub3QgaXNzdWUgbW9yZSBzY2VuZS8qIHRvb2wgY2FsbHMgdW50aWwgcmVjb3ZlcmVkLidcbiAgICAgICAgICAgICAgICA6ICdlZGl0b3IgaGVhbHRoeTsgc2NlbmUtc2NyaXB0IGFuZCBob3N0IGJvdGggcmVzcG9uc2l2ZS4nO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICBob3N0QWxpdmUsXG4gICAgICAgICAgICAgICAgc2NlbmVBbGl2ZSxcbiAgICAgICAgICAgICAgICBzY2VuZUxhdGVuY3lNcyxcbiAgICAgICAgICAgICAgICBzY2VuZVRpbWVvdXRNcyxcbiAgICAgICAgICAgICAgICBob3N0RXJyb3IsXG4gICAgICAgICAgICAgICAgc2NlbmVFcnJvcixcbiAgICAgICAgICAgICAgICB0b3RhbFByb2JlTXM6IERhdGUubm93KCkgLSB0MCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBtZXNzYWdlOiBzdWdnZXN0aW9uLFxuICAgICAgICB9O1xuICAgIH1cblxuICAgIC8vIHYyLjkueCBwb2xpc2ggKENvZGV4IHIxIHNpbmdsZS3wn5+hIGZyb20gdjIuOC4xIHJldmlldyk6IG1vZHVsZS1sZXZlbFxuICAgIC8vIGluLWZsaWdodCBndWFyZCBwcmV2ZW50cyBBSSB3b3JrZmxvd3MgZnJvbSBmaXJpbmcgdHdvIFBJRSBzdGF0ZVxuICAgIC8vIGNoYW5nZXMgY29uY3VycmVudGx5LiBUaGUgY29jb3MgZW5naW5lIHJhY2UgaW4gbGFuZG1pbmUgIzE2IG1ha2VzXG4gICAgLy8gZG91YmxlLWZpcmUgcGFydGljdWxhcmx5IGRhbmdlcm91cyDigJQgdGhlIHNlY29uZCBjYWxsIHdvdWxkIGhpdFxuICAgIC8vIGEgcGFydGlhbGx5LWluaXRpYWxpc2VkIFByZXZpZXdTY2VuZUZhY2FkZS4gUmVqZWN0IG92ZXJsYXAuXG4gICAgcHJpdmF0ZSBzdGF0aWMgcHJldmlld0NvbnRyb2xJbkZsaWdodCA9IGZhbHNlO1xuXG4gICAgcHJpdmF0ZSBhc3luYyBwcmV2aWV3Q29udHJvbChvcDogJ3N0YXJ0JyB8ICdzdG9wJywgYWNrbm93bGVkZ2VGcmVlemVSaXNrOiBib29sZWFuID0gZmFsc2UpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICAvLyB2Mi45LnggcGFyayBnYXRlOiBvcD1cInN0YXJ0XCIgaXMga25vd24gdG8gZnJlZXplIGNvY29zIDMuOC43XG4gICAgICAgIC8vIChsYW5kbWluZSAjMTYpLiBSZWZ1c2UgdW5sZXNzIHRoZSBjYWxsZXIgaGFzIGV4cGxpY2l0bHlcbiAgICAgICAgLy8gYWNrbm93bGVkZ2VkIHRoZSByaXNrLiBvcD1cInN0b3BcIiBpcyBhbHdheXMgc2FmZSDigJQgYnlwYXNzIHRoZVxuICAgICAgICAvLyBnYXRlIHNvIGNhbGxlcnMgY2FuIHJlY292ZXIgZnJvbSBhIGhhbGYtYXBwbGllZCBzdGF0ZS5cbiAgICAgICAgaWYgKG9wID09PSAnc3RhcnQnICYmICFhY2tub3dsZWRnZUZyZWV6ZVJpc2spIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgZXJyb3I6ICdkZWJ1Z19wcmV2aWV3X2NvbnRyb2wob3A9XCJzdGFydFwiKSBpcyBwYXJrZWQgZHVlIHRvIGxhbmRtaW5lICMxNiDigJQgdGhlIGNvY29zIDMuOC43IHNvZnRSZWxvYWRTY2VuZSByYWNlIGZyZWV6ZXMgdGhlIGVkaXRvciByZWdhcmRsZXNzIG9mIHByZXZpZXcgbW9kZSAodmVyaWZpZWQgZW1iZWRkZWQgKyBicm93c2VyKS4gVG8gcHJvY2VlZCBhbnl3YXksIHJlLWNhbGwgd2l0aCBhY2tub3dsZWRnZUZyZWV6ZVJpc2s9dHJ1ZSBBTkQgZW5zdXJlIHRoZSBodW1hbiB1c2VyIGlzIHByZXBhcmVkIHRvIHByZXNzIEN0cmwrUiBpbiBjb2NvcyBpZiB0aGUgZWRpdG9yIGZyZWV6ZXMuICoqU3Ryb25nbHkgcHJlZmVycmVkIGFsdGVybmF0aXZlcyoqOiAoYSkgZGVidWdfY2FwdHVyZV9wcmV2aWV3X3NjcmVlbnNob3QobW9kZT1cImVtYmVkZGVkXCIpIGluIEVESVQgbW9kZSAobm8gUElFIG5lZWRlZCk7IChiKSBkZWJ1Z19nYW1lX2NvbW1hbmQodHlwZT1cInNjcmVlbnNob3RcIikgdmlhIEdhbWVEZWJ1Z0NsaWVudCBvbiBicm93c2VyIHByZXZpZXcuIFBlbmRpbmcgdjIuOSByZWZlcmVuY2UtcHJvamVjdCBjb21wYXJpc29uLicsXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIGlmIChEZWJ1Z1Rvb2xzLnByZXZpZXdDb250cm9sSW5GbGlnaHQpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgZXJyb3I6ICdBbm90aGVyIGRlYnVnX3ByZXZpZXdfY29udHJvbCBjYWxsIGlzIGFscmVhZHkgaW4gZmxpZ2h0LiBQSUUgc3RhdGUgY2hhbmdlcyBnbyB0aHJvdWdoIGNvY29zXFwnIFNjZW5lRmFjYWRlRlNNIGFuZCBkb3VibGUtZmlyaW5nIGR1cmluZyB0aGUgaW4tZmxpZ2h0IHdpbmRvdyByaXNrcyBjb21wb3VuZGluZyB0aGUgbGFuZG1pbmUgIzE2IGZyZWV6ZS4gV2FpdCBmb3IgdGhlIHByZXZpb3VzIGNhbGwgdG8gcmVzb2x2ZSwgdGhlbiByZXRyeS4nLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICBEZWJ1Z1Rvb2xzLnByZXZpZXdDb250cm9sSW5GbGlnaHQgPSB0cnVlO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMucHJldmlld0NvbnRyb2xJbm5lcihvcCk7XG4gICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICBEZWJ1Z1Rvb2xzLnByZXZpZXdDb250cm9sSW5GbGlnaHQgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgcHJldmlld0NvbnRyb2xJbm5lcihvcDogJ3N0YXJ0JyB8ICdzdG9wJyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHN0YXRlID0gb3AgPT09ICdzdGFydCc7XG4gICAgICAgIGNvbnN0IHJlc3VsdDogVG9vbFJlc3BvbnNlID0gYXdhaXQgcnVuU2NlbmVNZXRob2RBc1Rvb2xSZXNwb25zZSgnY2hhbmdlUHJldmlld1BsYXlTdGF0ZScsIFtzdGF0ZV0pO1xuICAgICAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgIC8vIFNjYW4gY2FwdHVyZWRMb2dzIGZvciB0aGUga25vd24gY29jb3Mgd2FybmluZyBzbyBBSVxuICAgICAgICAgICAgLy8gZG9lc24ndCBnZXQgYSBtaXNsZWFkaW5nIGJhcmUtc3VjY2VzcyBlbnZlbG9wZS5cbiAgICAgICAgICAgIGNvbnN0IGNhcHR1cmVkID0gKHJlc3VsdCBhcyBhbnkpLmNhcHR1cmVkTG9ncyBhcyBBcnJheTx7IGxldmVsOiBzdHJpbmc7IG1lc3NhZ2U6IHN0cmluZyB9PiB8IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lUmVmcmVzaEVycm9yID0gY2FwdHVyZWQ/LmZpbmQoXG4gICAgICAgICAgICAgICAgZSA9PiBlPy5sZXZlbCA9PT0gJ2Vycm9yJyAmJiAvRmFpbGVkIHRvIHJlZnJlc2ggdGhlIGN1cnJlbnQgc2NlbmUvaS50ZXN0KGU/Lm1lc3NhZ2UgPz8gJycpLFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGNvbnN0IHdhcm5pbmdzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICAgICAgaWYgKHNjZW5lUmVmcmVzaEVycm9yKSB7XG4gICAgICAgICAgICAgICAgd2FybmluZ3MucHVzaChcbiAgICAgICAgICAgICAgICAgICAgJ2NvY29zIGVuZ2luZSB0aHJldyBcIkZhaWxlZCB0byByZWZyZXNoIHRoZSBjdXJyZW50IHNjZW5lXCIgaW5zaWRlIHNvZnRSZWxvYWRTY2VuZSBkdXJpbmcgUElFIHN0YXRlIGNoYW5nZS4gVGhpcyBpcyBhIGNvY29zIDMuOC43IHJhY2UgZmlyZWQgYnkgY2hhbmdlUHJldmlld1BsYXlTdGF0ZSBpdHNlbGYsIG5vdCBnYXRlZCBieSBwcmV2aWV3IG1vZGUgKHZlcmlmaWVkIGluIGJvdGggZW1iZWRkZWQgYW5kIGJyb3dzZXIgbW9kZXMg4oCUIHNlZSBDTEFVREUubWQgbGFuZG1pbmUgIzE2KS4gUElFIGhhcyBOT1QgYWN0dWFsbHkgc3RhcnRlZCBhbmQgdGhlIGNvY29zIGVkaXRvciBtYXkgZnJlZXplIChzcGlubmluZyBpbmRpY2F0b3IpIHJlcXVpcmluZyB0aGUgaHVtYW4gdXNlciB0byBwcmVzcyBDdHJsK1IgdG8gcmVjb3Zlci4gKipSZWNvbW1lbmRlZCBhbHRlcm5hdGl2ZXMqKjogKGEpIGRlYnVnX2NhcHR1cmVfcHJldmlld19zY3JlZW5zaG90KG1vZGU9XCJlbWJlZGRlZFwiKSBpbiBFRElUIG1vZGUg4oCUIGNhcHR1cmVzIHRoZSBlZGl0b3IgZ2FtZXZpZXcgd2l0aG91dCBzdGFydGluZyBQSUU7IChiKSBkZWJ1Z19nYW1lX2NvbW1hbmQodHlwZT1cInNjcmVlbnNob3RcIikgdmlhIEdhbWVEZWJ1Z0NsaWVudCBydW5uaW5nIG9uIGJyb3dzZXIgcHJldmlldyAoZGVidWdfcHJldmlld191cmwoYWN0aW9uPVwib3BlblwiKSkg4oCUIHVzZXMgcnVudGltZSBjYW52YXMsIGJ5cGFzc2VzIHRoZSBlbmdpbmUgcmFjZSBlbnRpcmVseS4gRG8gTk9UIHJldHJ5IHByZXZpZXdfY29udHJvbChzdGFydCkg4oCUIGl0IHdpbGwgbm90IGhlbHAgYW5kIG1heSBjb21wb3VuZCB0aGUgZnJlZXplLicsXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGJhc2VNZXNzYWdlID0gc3RhdGVcbiAgICAgICAgICAgICAgICA/ICdFbnRlcmVkIFByZXZpZXctaW4tRWRpdG9yIHBsYXkgbW9kZSAoUElFIG1heSB0YWtlIGEgbW9tZW50IHRvIGFwcGVhcjsgbW9kZSBkZXBlbmRzIG9uIGNvY29zIHByZXZpZXcgY29uZmlnIOKAlCBzZWUgZGVidWdfZ2V0X3ByZXZpZXdfbW9kZSknXG4gICAgICAgICAgICAgICAgOiAnRXhpdGVkIFByZXZpZXctaW4tRWRpdG9yIHBsYXkgbW9kZSc7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIC4uLnJlc3VsdCxcbiAgICAgICAgICAgICAgICAuLi4od2FybmluZ3MubGVuZ3RoID4gMCA/IHsgZGF0YTogeyAuLi4ocmVzdWx0LmRhdGEgPz8ge30pLCB3YXJuaW5ncyB9IH0gOiB7fSksXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogd2FybmluZ3MubGVuZ3RoID4gMFxuICAgICAgICAgICAgICAgICAgICA/IGAke2Jhc2VNZXNzYWdlfS4g4pqgICR7d2FybmluZ3Muam9pbignICcpfWBcbiAgICAgICAgICAgICAgICAgICAgOiBiYXNlTWVzc2FnZSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgLy8gdjIuOS54IHBvbGlzaCAoQ2xhdWRlIHIxIHNpbmdsZS3wn5+hIGZyb20gdjIuOC4xIHJldmlldyk6XG4gICAgICAgIC8vIGZhaWx1cmUtYnJhbmNoIHdhcyByZXR1cm5pbmcgdGhlIGJyaWRnZSdzIGVudmVsb3BlIHZlcmJhdGltXG4gICAgICAgIC8vIHdpdGhvdXQgYSBtZXNzYWdlIGZpZWxkLCB3aGlsZSBzdWNjZXNzIGJyYW5jaCBjYXJyaWVkIGEgY2xlYXJcbiAgICAgICAgLy8gbWVzc2FnZS4gQWRkIGEgc3ltbWV0cmljIG1lc3NhZ2Ugc28gc3RyZWFtaW5nIEFJIGNsaWVudHMgc2VlXG4gICAgICAgIC8vIGEgY29uc2lzdGVudCBlbnZlbG9wZSBzaGFwZSBvbiBib3RoIHBhdGhzLlxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgLi4ucmVzdWx0LFxuICAgICAgICAgICAgbWVzc2FnZTogcmVzdWx0Lm1lc3NhZ2UgPz8gYEZhaWxlZCB0byAke29wfSBQcmV2aWV3LWluLUVkaXRvciBwbGF5IG1vZGUg4oCUIHNlZSBlcnJvci5gLFxuICAgICAgICB9O1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgcXVlcnlEZXZpY2VzKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBkZXZpY2VzOiBhbnlbXSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2RldmljZScsICdxdWVyeScpIGFzIGFueTtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IHsgZGV2aWNlczogQXJyYXkuaXNBcnJheShkZXZpY2VzKSA/IGRldmljZXMgOiBbXSwgY291bnQ6IEFycmF5LmlzQXJyYXkoZGV2aWNlcykgPyBkZXZpY2VzLmxlbmd0aCA6IDAgfSB9O1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycikgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIHYyLjYuMCBULVYyNi0xOiBHYW1lRGVidWdDbGllbnQgYnJpZGdlIGhhbmRsZXJzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnYW1lQ29tbWFuZCh0eXBlOiBzdHJpbmcsIGFyZ3M6IGFueSwgdGltZW91dE1zOiBudW1iZXIgPSAxMDAwMCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHF1ZXVlZCA9IHF1ZXVlR2FtZUNvbW1hbmQodHlwZSwgYXJncyk7XG4gICAgICAgIGlmICghcXVldWVkLm9rKSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHF1ZXVlZC5lcnJvciB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGF3YWl0ZWQgPSBhd2FpdCBhd2FpdENvbW1hbmRSZXN1bHQocXVldWVkLmlkLCB0aW1lb3V0TXMpO1xuICAgICAgICBpZiAoIWF3YWl0ZWQub2spIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYXdhaXRlZC5lcnJvciB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0ZWQucmVzdWx0O1xuICAgICAgICBpZiAocmVzdWx0LnN1Y2Nlc3MgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHJlc3VsdC5lcnJvciA/PyAnR2FtZURlYnVnQ2xpZW50IHJlcG9ydGVkIGZhaWx1cmUnLCBkYXRhOiByZXN1bHQuZGF0YSB9O1xuICAgICAgICB9XG4gICAgICAgIC8vIEJ1aWx0LWluIHNjcmVlbnNob3QgcGF0aDogY2xpZW50IHNlbmRzIGJhY2sgYSBiYXNlNjQgZGF0YVVybDtcbiAgICAgICAgLy8gbGFuZGluZyB0aGUgYnl0ZXMgdG8gZGlzayBvbiBob3N0IHNpZGUga2VlcHMgdGhlIHJlc3VsdCBlbnZlbG9wZVxuICAgICAgICAvLyBzbWFsbCBhbmQgcmV1c2VzIHRoZSBleGlzdGluZyBwcm9qZWN0LXJvb3RlZCBjYXB0dXJlIGRpciBndWFyZC5cbiAgICAgICAgaWYgKHR5cGUgPT09ICdzY3JlZW5zaG90JyAmJiByZXN1bHQuZGF0YSAmJiB0eXBlb2YgcmVzdWx0LmRhdGEuZGF0YVVybCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIGNvbnN0IHBlcnNpc3RlZCA9IHRoaXMucGVyc2lzdEdhbWVTY3JlZW5zaG90KHJlc3VsdC5kYXRhLmRhdGFVcmwsIHJlc3VsdC5kYXRhLndpZHRoLCByZXN1bHQuZGF0YS5oZWlnaHQpO1xuICAgICAgICAgICAgaWYgKCFwZXJzaXN0ZWQub2spIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHBlcnNpc3RlZC5lcnJvciB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICAgICAgICAgICAgZmlsZVBhdGg6IHBlcnNpc3RlZC5maWxlUGF0aCxcbiAgICAgICAgICAgICAgICAgICAgc2l6ZTogcGVyc2lzdGVkLnNpemUsXG4gICAgICAgICAgICAgICAgICAgIHdpZHRoOiByZXN1bHQuZGF0YS53aWR0aCxcbiAgICAgICAgICAgICAgICAgICAgaGVpZ2h0OiByZXN1bHQuZGF0YS5oZWlnaHQsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiBgR2FtZSBjYW52YXMgY2FwdHVyZWQgdG8gJHtwZXJzaXN0ZWQuZmlsZVBhdGh9YCxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogeyB0eXBlLCAuLi5yZXN1bHQuZGF0YSB9LCBtZXNzYWdlOiBgR2FtZSBjb21tYW5kICR7dHlwZX0gb2tgIH07XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnYW1lQ2xpZW50U3RhdHVzKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IGdldENsaWVudFN0YXR1cygpIH07XG4gICAgfVxuXG4gICAgLy8gdjIuNi4xIHJldmlldyBmaXggKGNvZGV4IPCflLQgKyBjbGF1ZGUgVzEpOiBib3VuZCB0aGUgbGVnaXRpbWF0ZSByYW5nZVxuICAgIC8vIG9mIGEgc2NyZWVuc2hvdCBwYXlsb2FkIGJlZm9yZSBkZWNvZGluZyBzbyBhIG1pc2JlaGF2aW5nIC8gbWFsaWNpb3VzXG4gICAgLy8gY2xpZW50IGNhbm5vdCBmaWxsIGRpc2sgYnkgc3RyZWFtaW5nIGFyYml0cmFyeSBiYXNlNjQgYnl0ZXMuXG4gICAgLy8gMzIgTUIgbWF0Y2hlcyB0aGUgZ2xvYmFsIHJlcXVlc3QtYm9keSBjYXAgaW4gbWNwLXNlcnZlci1zZGsudHMgc29cbiAgICAvLyB0aGUgYm9keSB3b3VsZCBhbHJlYWR5IDQxMyBiZWZvcmUgcmVhY2hpbmcgaGVyZSwgYnV0IGFcbiAgICAvLyBiZWx0LWFuZC1icmFjZXMgY2hlY2sgc3RheXMgY2hlYXAuXG4gICAgcHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgTUFYX0dBTUVfU0NSRUVOU0hPVF9CWVRFUyA9IDMyICogMTAyNCAqIDEwMjQ7XG5cbiAgICBwcml2YXRlIHBlcnNpc3RHYW1lU2NyZWVuc2hvdChkYXRhVXJsOiBzdHJpbmcsIF93aWR0aD86IG51bWJlciwgX2hlaWdodD86IG51bWJlcik6IHsgb2s6IHRydWU7IGZpbGVQYXRoOiBzdHJpbmc7IHNpemU6IG51bWJlciB9IHwgeyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmcgfSB7XG4gICAgICAgIGNvbnN0IG0gPSAvXmRhdGE6aW1hZ2VcXC8ocG5nfGpwZWd8d2VicCk7YmFzZTY0LCguKikkL2kuZXhlYyhkYXRhVXJsKTtcbiAgICAgICAgaWYgKCFtKSB7XG4gICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiAnR2FtZURlYnVnQ2xpZW50IHJldHVybmVkIHNjcmVlbnNob3QgZGF0YVVybCBpbiB1bmV4cGVjdGVkIGZvcm1hdCAoZXhwZWN0ZWQgZGF0YTppbWFnZS97cG5nfGpwZWd8d2VicH07YmFzZTY0LC4uLiknIH07XG4gICAgICAgIH1cbiAgICAgICAgLy8gYmFzZTY0LWRlY29kZWQgYnl0ZSBjb3VudCA9IH5jZWlsKGI2NExlbiAqIDMgLyA0KTsgcmVqZWN0IGVhcmx5XG4gICAgICAgIC8vIGJlZm9yZSBhbGxvY2F0aW5nIGEgbXVsdGktR0IgQnVmZmVyLlxuICAgICAgICBjb25zdCBiNjRMZW4gPSBtWzJdLmxlbmd0aDtcbiAgICAgICAgY29uc3QgYXBwcm94Qnl0ZXMgPSBNYXRoLmNlaWwoYjY0TGVuICogMyAvIDQpO1xuICAgICAgICBpZiAoYXBwcm94Qnl0ZXMgPiBEZWJ1Z1Rvb2xzLk1BWF9HQU1FX1NDUkVFTlNIT1RfQllURVMpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGBzY3JlZW5zaG90IHBheWxvYWQgdG9vIGxhcmdlOiB+JHthcHByb3hCeXRlc30gYnl0ZXMgZXhjZWVkcyBjYXAgJHtEZWJ1Z1Rvb2xzLk1BWF9HQU1FX1NDUkVFTlNIT1RfQllURVN9YCB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGV4dCA9IG1bMV0udG9Mb3dlckNhc2UoKSA9PT0gJ2pwZWcnID8gJ2pwZycgOiBtWzFdLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIGNvbnN0IGJ1ZiA9IEJ1ZmZlci5mcm9tKG1bMl0sICdiYXNlNjQnKTtcbiAgICAgICAgaWYgKGJ1Zi5sZW5ndGggPiBEZWJ1Z1Rvb2xzLk1BWF9HQU1FX1NDUkVFTlNIT1RfQllURVMpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGBzY3JlZW5zaG90IHBheWxvYWQgdG9vIGxhcmdlIGFmdGVyIGRlY29kZTogJHtidWYubGVuZ3RofSBieXRlcyBleGNlZWRzIGNhcCAke0RlYnVnVG9vbHMuTUFYX0dBTUVfU0NSRUVOU0hPVF9CWVRFU31gIH07XG4gICAgICAgIH1cbiAgICAgICAgLy8gdjIuNi4xIHJldmlldyBmaXggKGNsYXVkZSBNMiArIGNvZGV4IPCfn6EgKyBnZW1pbmkg8J+foSk6IHJlYWxwYXRoIGJvdGhcbiAgICAgICAgLy8gc2lkZXMgZm9yIGEgdHJ1ZSBjb250YWlubWVudCBjaGVjay4gdjIuOC4wIFQtVjI4LTIgaG9pc3RlZCB0aGlzXG4gICAgICAgIC8vIHBhdHRlcm4gaW50byByZXNvbHZlQXV0b0NhcHR1cmVGaWxlKCkgc28gc2NyZWVuc2hvdCgpIC8gY2FwdHVyZS1cbiAgICAgICAgLy8gcHJldmlldyAvIGJhdGNoLXNjcmVlbnNob3QgLyBwZXJzaXN0LWdhbWUgc2hhcmUgb25lIGltcGxlbWVudGF0aW9uLlxuICAgICAgICBjb25zdCByZXNvbHZlZCA9IHRoaXMucmVzb2x2ZUF1dG9DYXB0dXJlRmlsZShgZ2FtZS0ke0RhdGUubm93KCl9LiR7ZXh0fWApO1xuICAgICAgICBpZiAoIXJlc29sdmVkLm9rKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiByZXNvbHZlZC5lcnJvciB9O1xuICAgICAgICBmcy53cml0ZUZpbGVTeW5jKHJlc29sdmVkLmZpbGVQYXRoLCBidWYpO1xuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSwgZmlsZVBhdGg6IHJlc29sdmVkLmZpbGVQYXRoLCBzaXplOiBidWYubGVuZ3RoIH07XG4gICAgfVxuXG4gICAgLy8gdjIuNC44IEExOiBUUyBkaWFnbm9zdGljcyBoYW5kbGVycyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgICBwcml2YXRlIGFzeW5jIHdhaXRDb21waWxlKHRpbWVvdXRNczogbnVtYmVyID0gMTUwMDApOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcHJvamVjdFBhdGggPSBFZGl0b3I/LlByb2plY3Q/LnBhdGg7XG4gICAgICAgICAgICBpZiAoIXByb2plY3RQYXRoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnd2FpdF9jb21waWxlOiBlZGl0b3IgY29udGV4dCB1bmF2YWlsYWJsZSAobm8gRWRpdG9yLlByb2plY3QucGF0aCknIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB3YWl0Rm9yQ29tcGlsZShwcm9qZWN0UGF0aCwgdGltZW91dE1zKTtcbiAgICAgICAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHJlc3VsdC5lcnJvciA/PyAnd2FpdF9jb21waWxlIGZhaWxlZCcsIGRhdGE6IHJlc3VsdCB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IHJlc3VsdC5jb21waWxlZFxuICAgICAgICAgICAgICAgICAgICA/IGBDb21waWxlIGZpbmlzaGVkIGluICR7cmVzdWx0LndhaXRlZE1zfW1zYFxuICAgICAgICAgICAgICAgICAgICA6IChyZXN1bHQubm90ZSA/PyAnTm8gY29tcGlsZSB0cmlnZ2VyZWQgb3IgdGltZWQgb3V0JyksXG4gICAgICAgICAgICAgICAgZGF0YTogcmVzdWx0LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpIH07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHJ1blNjcmlwdERpYWdub3N0aWNzKHRzY29uZmlnUGF0aD86IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBwcm9qZWN0UGF0aCA9IEVkaXRvcj8uUHJvamVjdD8ucGF0aDtcbiAgICAgICAgICAgIGlmICghcHJvamVjdFBhdGgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdydW5fc2NyaXB0X2RpYWdub3N0aWNzOiBlZGl0b3IgY29udGV4dCB1bmF2YWlsYWJsZSAobm8gRWRpdG9yLlByb2plY3QucGF0aCknIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBydW5TY3JpcHREaWFnbm9zdGljcyhwcm9qZWN0UGF0aCwgeyB0c2NvbmZpZ1BhdGggfSk7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHJlc3VsdC5vayxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiByZXN1bHQuc3VtbWFyeSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIHRvb2w6IHJlc3VsdC50b29sLFxuICAgICAgICAgICAgICAgICAgICBiaW5hcnk6IHJlc3VsdC5iaW5hcnksXG4gICAgICAgICAgICAgICAgICAgIHRzY29uZmlnUGF0aDogcmVzdWx0LnRzY29uZmlnUGF0aCxcbiAgICAgICAgICAgICAgICAgICAgZXhpdENvZGU6IHJlc3VsdC5leGl0Q29kZSxcbiAgICAgICAgICAgICAgICAgICAgZGlhZ25vc3RpY3M6IHJlc3VsdC5kaWFnbm9zdGljcyxcbiAgICAgICAgICAgICAgICAgICAgZGlhZ25vc3RpY0NvdW50OiByZXN1bHQuZGlhZ25vc3RpY3MubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICAvLyB2Mi40LjkgcmV2aWV3IGZpeDogc3Bhd24gZmFpbHVyZXMgKGJpbmFyeSBtaXNzaW5nIC9cbiAgICAgICAgICAgICAgICAgICAgLy8gcGVybWlzc2lvbiBkZW5pZWQpIHN1cmZhY2VkIGV4cGxpY2l0bHkgc28gQUkgY2FuXG4gICAgICAgICAgICAgICAgICAgIC8vIGRpc3Rpbmd1aXNoIFwidHNjIG5ldmVyIHJhblwiIGZyb20gXCJ0c2MgZm91bmQgZXJyb3JzXCIuXG4gICAgICAgICAgICAgICAgICAgIHNwYXduRmFpbGVkOiByZXN1bHQuc3Bhd25GYWlsZWQgPT09IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIHN5c3RlbUVycm9yOiByZXN1bHQuc3lzdGVtRXJyb3IsXG4gICAgICAgICAgICAgICAgICAgIC8vIFRydW5jYXRlIHJhdyBzdHJlYW1zIHRvIGtlZXAgdG9vbCByZXN1bHQgcmVhc29uYWJsZTtcbiAgICAgICAgICAgICAgICAgICAgLy8gZnVsbCBjb250ZW50IHJhcmVseSB1c2VmdWwgd2hlbiB0aGUgcGFyc2VyIGFscmVhZHlcbiAgICAgICAgICAgICAgICAgICAgLy8gc3RydWN0dXJlZCB0aGUgZXJyb3JzLlxuICAgICAgICAgICAgICAgICAgICBzdGRvdXRUYWlsOiByZXN1bHQuc3Rkb3V0LnNsaWNlKC0yMDAwKSxcbiAgICAgICAgICAgICAgICAgICAgc3RkZXJyVGFpbDogcmVzdWx0LnN0ZGVyci5zbGljZSgtMjAwMCksXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKSB9O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRTY3JpcHREaWFnbm9zdGljQ29udGV4dChcbiAgICAgICAgZmlsZTogc3RyaW5nLFxuICAgICAgICBsaW5lOiBudW1iZXIsXG4gICAgICAgIGNvbnRleHRMaW5lczogbnVtYmVyID0gNSxcbiAgICApOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcHJvamVjdFBhdGggPSBFZGl0b3I/LlByb2plY3Q/LnBhdGg7XG4gICAgICAgICAgICBpZiAoIXByb2plY3RQYXRoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnZ2V0X3NjcmlwdF9kaWFnbm9zdGljX2NvbnRleHQ6IGVkaXRvciBjb250ZXh0IHVuYXZhaWxhYmxlJyB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gdjIuOS54IHBvbGlzaCAoR2VtaW5pIHIyIHNpbmdsZS3wn5+hIGZyb20gdjIuOC4xIHJldmlldyk6IGNvbnZlcmdlXG4gICAgICAgICAgICAvLyBvbiBhc3NlcnRTYXZlUGF0aFdpdGhpblByb2plY3QuIFRoZSBwcmV2aW91cyBiZXNwb2tlIHJlYWxwYXRoXG4gICAgICAgICAgICAvLyArIHRvTG93ZXJDYXNlICsgcGF0aC5zZXAgY2hlY2sgaXMgZnVuY3Rpb25hbGx5IHN1YnN1bWVkIGJ5IHRoZVxuICAgICAgICAgICAgLy8gc2hhcmVkIGhlbHBlciAod2hpY2ggaXRzZWxmIG1vdmVkIHRvIHRoZSBwYXRoLnJlbGF0aXZlLWJhc2VkXG4gICAgICAgICAgICAvLyBpc1BhdGhXaXRoaW5Sb290IGluIHYyLjkueCBwb2xpc2ggIzEsIGhhbmRsaW5nIGRyaXZlLXJvb3QgYW5kXG4gICAgICAgICAgICAvLyBwcmVmaXgtY29sbGlzaW9uIGVkZ2VzIHVuaWZvcm1seSkuXG4gICAgICAgICAgICBjb25zdCBndWFyZCA9IHRoaXMuYXNzZXJ0U2F2ZVBhdGhXaXRoaW5Qcm9qZWN0KGZpbGUpO1xuICAgICAgICAgICAgaWYgKCFndWFyZC5vaykge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYGdldF9zY3JpcHRfZGlhZ25vc3RpY19jb250ZXh0OiAke2d1YXJkLmVycm9yfWAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHJlc29sdmVkID0gZ3VhcmQucmVzb2x2ZWRQYXRoO1xuICAgICAgICAgICAgaWYgKCFmcy5leGlzdHNTeW5jKHJlc29sdmVkKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYGdldF9zY3JpcHRfZGlhZ25vc3RpY19jb250ZXh0OiBmaWxlIG5vdCBmb3VuZDogJHtyZXNvbHZlZH1gIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBzdGF0ID0gZnMuc3RhdFN5bmMocmVzb2x2ZWQpO1xuICAgICAgICAgICAgaWYgKHN0YXQuc2l6ZSA+IDUgKiAxMDI0ICogMTAyNCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYGdldF9zY3JpcHRfZGlhZ25vc3RpY19jb250ZXh0OiBmaWxlIHRvbyBsYXJnZSAoJHtzdGF0LnNpemV9IGJ5dGVzKTsgcmVmdXNpbmcgdG8gcmVhZC5gIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBjb250ZW50ID0gZnMucmVhZEZpbGVTeW5jKHJlc29sdmVkLCAndXRmOCcpO1xuICAgICAgICAgICAgY29uc3QgYWxsTGluZXMgPSBjb250ZW50LnNwbGl0KC9cXHI/XFxuLyk7XG4gICAgICAgICAgICBpZiAobGluZSA8IDEgfHwgbGluZSA+IGFsbExpbmVzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICBlcnJvcjogYGdldF9zY3JpcHRfZGlhZ25vc3RpY19jb250ZXh0OiBsaW5lICR7bGluZX0gb3V0IG9mIHJhbmdlIDEuLiR7YWxsTGluZXMubGVuZ3RofWAsXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHN0YXJ0ID0gTWF0aC5tYXgoMSwgbGluZSAtIGNvbnRleHRMaW5lcyk7XG4gICAgICAgICAgICBjb25zdCBlbmQgPSBNYXRoLm1pbihhbGxMaW5lcy5sZW5ndGgsIGxpbmUgKyBjb250ZXh0TGluZXMpO1xuICAgICAgICAgICAgY29uc3Qgd2luZG93ID0gYWxsTGluZXMuc2xpY2Uoc3RhcnQgLSAxLCBlbmQpO1xuICAgICAgICAgICAgY29uc3QgcHJvamVjdFJlc29sdmVkTm9ybSA9IHBhdGgucmVzb2x2ZShwcm9qZWN0UGF0aCk7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogYFJlYWQgJHt3aW5kb3cubGVuZ3RofSBsaW5lcyBvZiBjb250ZXh0IGFyb3VuZCAke3BhdGgucmVsYXRpdmUocHJvamVjdFJlc29sdmVkTm9ybSwgcmVzb2x2ZWQpfToke2xpbmV9YCxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIGZpbGU6IHBhdGgucmVsYXRpdmUocHJvamVjdFJlc29sdmVkTm9ybSwgcmVzb2x2ZWQpLFxuICAgICAgICAgICAgICAgICAgICBhYnNvbHV0ZVBhdGg6IHJlc29sdmVkLFxuICAgICAgICAgICAgICAgICAgICB0YXJnZXRMaW5lOiBsaW5lLFxuICAgICAgICAgICAgICAgICAgICBzdGFydExpbmU6IHN0YXJ0LFxuICAgICAgICAgICAgICAgICAgICBlbmRMaW5lOiBlbmQsXG4gICAgICAgICAgICAgICAgICAgIHRvdGFsTGluZXM6IGFsbExpbmVzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgbGluZXM6IHdpbmRvdy5tYXAoKHRleHQsIGkpID0+ICh7IGxpbmU6IHN0YXJ0ICsgaSwgdGV4dCB9KSksXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKSB9O1xuICAgICAgICB9XG4gICAgfVxufVxuIl19