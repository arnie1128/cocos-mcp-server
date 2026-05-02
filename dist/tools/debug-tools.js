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
                description: 'Switch cocos preview mode programmatically via the typed Editor.Message preferences/set-config channel. Writes to preview.current.platform with the requested value. **This modifies the user\'s editor preferences** — by default requires confirm=true to avoid altering preferences accidentally. Pair with debug_get_preview_mode to read current value, switch, run a workflow, and (optionally) restore. Useful for AI-driven retest flows that need to validate behaviour across browser / gameView (embedded) / simulator destinations. Returns { previousMode, newMode, confirmed }.',
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
                description: 'Programmatically start or stop Preview-in-Editor (PIE) play mode. Wraps the typed cce.SceneFacade.changePreviewPlayState method (documented on SceneFacadeManager in @cocos/creator-types). preview_control(op="stop") returns to scene mode and is reliable. **WARNING — cocos 3.8.7 has an internal race in softReloadScene that fires regardless of preview mode** (verified embedded + browser; treat as engine-wide bug). The call returns success but cocos logs "Failed to refresh the current scene", PIE does NOT actually start, and the editor can freeze (spinning indicator) requiring user Ctrl+R recovery. See landmine #16 in CLAUDE.md. **Recommended alternatives**: (a) debug_capture_preview_screenshot(mode="embedded") in EDIT mode (no PIE start needed) — captures the editor gameview directly; (b) debug_game_command(type="screenshot") via GameDebugClient running in browser preview — uses runtime canvas, bypasses the engine race entirely. Use preview_control only when the start/stop side effect itself is the goal (and accept the freeze risk).',
                inputSchema: schema_1.z.object({
                    op: schema_1.z.enum(['start', 'stop']).describe('"start" enters PIE play mode (equivalent to clicking the toolbar play button). "stop" exits PIE play and returns to scene mode.'),
                }),
                handler: a => this.previewControl(a.op),
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
        const realDirNormalized = path.resolve(realDir);
        const realRootNormalized = path.resolve(realProjectRoot);
        const withinRoot = realDirNormalized === realRootNormalized
            || realDirNormalized.startsWith(realRootNormalized + path.sep);
        if (!withinRoot) {
            return { ok: false, error: `capture dir resolved outside the project root: ${realDirNormalized} not within ${realRootNormalized}` };
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
            const realParentNormalized = path.resolve(realParent);
            const realRootNormalized = path.resolve(realProjectRoot);
            const within = realParentNormalized === realRootNormalized
                || realParentNormalized.startsWith(realRootNormalized + path.sep);
            if (!within) {
                return {
                    ok: false,
                    error: `savePath resolved outside the project root: ${realParentNormalized} not within ${realRootNormalized}. Use a path inside <project>/ or omit savePath to auto-name into <project>/temp/mcp-captures.`,
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
    async previewControl(op) {
        var _a;
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
        return result;
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
            const absPath = path.isAbsolute(file) ? file : path.join(projectPath, file);
            // Path safety: ensure absolute path resolves under projectPath
            // to prevent reads outside the cocos project.
            //
            // v2.4.9 review fix (codex 🔴): plain path.resolve+startsWith only
            // catches `..` traversal — a SYMLINK inside the project pointing
            // outside is still readable because path.resolve doesn't follow
            // symlinks. Use fs.realpathSync on both sides so we compare the
            // real on-disk paths (Windows is case-insensitive; both sides go
            // through realpathSync so casing is normalised consistently).
            const resolvedRaw = path.resolve(absPath);
            const projectResolvedRaw = path.resolve(projectPath);
            let resolved;
            let projectResolved;
            try {
                resolved = fs.realpathSync.native(resolvedRaw);
            }
            catch (_c) {
                return { success: false, error: `get_script_diagnostic_context: file not found or unreadable: ${resolvedRaw}` };
            }
            try {
                projectResolved = fs.realpathSync.native(projectResolvedRaw);
            }
            catch (_d) {
                projectResolved = projectResolvedRaw;
            }
            // Case-insensitive comparison on Windows; sep guard against
            // /proj-foo vs /proj prefix confusion.
            const cmpResolved = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
            const cmpProject = process.platform === 'win32' ? projectResolved.toLowerCase() : projectResolved;
            if (!cmpResolved.startsWith(cmpProject + path.sep) && cmpResolved !== cmpProject) {
                return { success: false, error: `get_script_diagnostic_context: path ${resolved} resolves outside the project root (symlink-aware check)` };
            }
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
            return {
                success: true,
                message: `Read ${window.length} lines of context around ${path.relative(projectResolved, resolved)}:${line}`,
                data: {
                    file: path.relative(projectResolved, resolved),
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
// v2.6.1 review fix (codex 🔴 + claude W1): bound the legitimate range
// of a screenshot payload before decoding so a misbehaving / malicious
// client cannot fill disk by streaming arbitrary base64 bytes.
// 32 MB matches the global request-body cap in mcp-server-sdk.ts so
// the body would already 413 before reaching here, but a
// belt-and-braces check stays cheap.
DebugTools.MAX_GAME_SCREENSHOT_BYTES = 32 * 1024 * 1024;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWctdG9vbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvdG9vbHMvZGVidWctdG9vbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUEsd0RBQWtFO0FBQ2xFLDBDQUFrQztBQUNsQyxzREFBMkQ7QUFDM0QsMERBQTZFO0FBQzdFLGtFQUFrRztBQUNsRyxzREFBbUU7QUFDbkUsdUNBQXlCO0FBQ3pCLDJDQUE2QjtBQUU3QixNQUFhLFVBQVU7SUFHbkI7UUFDSSxNQUFNLElBQUksR0FBYztZQUNwQjtnQkFDSSxJQUFJLEVBQUUsZUFBZTtnQkFDckIsV0FBVyxFQUFFLDZEQUE2RDtnQkFDMUUsV0FBVyxFQUFFLFVBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO2dCQUN6QixPQUFPLEVBQUUsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLFlBQVksRUFBRTthQUNyQztZQUNEO2dCQUNJLElBQUksRUFBRSxvQkFBb0I7Z0JBQzFCLFdBQVcsRUFBRSx3V0FBd1c7Z0JBQ3JYLFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDO29CQUNsQixJQUFJLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyxnR0FBZ0csQ0FBQztvQkFDM0gsT0FBTyxFQUFFLFVBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxPQUFPLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUMsUUFBUSxDQUFDLHdVQUF3VSxDQUFDO2lCQUMzWSxDQUFDO2dCQUNGLE9BQU8sRUFBRSxDQUFDLENBQUMsRUFBRSxXQUFDLE9BQUEsSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsTUFBQSxDQUFDLENBQUMsT0FBTyxtQ0FBSSxPQUFPLENBQUMsQ0FBQSxFQUFBO2FBQ3JFO1lBQ0Q7Z0JBQ0ksSUFBSSxFQUFF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LGVBQWUsRUFBRSxRQUFRLENBQUM7b0JBQzlDLFlBQVksRUFBRSxRQUFRO29CQUN0QixVQUFVLEVBQUUsSUFBSTtvQkFDaEIsU0FBUyxFQUFFLEtBQUs7b0JBQ2hCLE9BQU8sRUFBRSxHQUFHO29CQUNaLFVBQVUsRUFBRSxRQUFRLENBQUMsTUFBTTtvQkFDM0IsS0FBSyxFQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUUsSUFBSSxFQUFFLEtBQUssR0FBRyxDQUFDLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztpQkFDOUQ7YUFDSixDQUFDO1FBQ04sQ0FBQztRQUFDLE9BQU8sR0FBUSxFQUFFLENBQUM7WUFDaEIsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLE1BQUEsR0FBRyxhQUFILEdBQUcsdUJBQUgsR0FBRyxDQUFFLE9BQU8sbUNBQUksTUFBTSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7UUFDbEUsQ0FBQztJQUNMLENBQUM7O0FBbGxETCxnQ0FtbERDO0FBektHLHVFQUF1RTtBQUN2RSx1RUFBdUU7QUFDdkUsK0RBQStEO0FBQy9ELG9FQUFvRTtBQUNwRSx5REFBeUQ7QUFDekQscUNBQXFDO0FBQ2Isb0NBQXlCLEdBQUcsRUFBRSxHQUFHLElBQUksR0FBRyxJQUFJLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBUb29sRGVmaW5pdGlvbiwgVG9vbFJlc3BvbnNlLCBUb29sRXhlY3V0b3IsIFBlcmZvcm1hbmNlU3RhdHMsIFZhbGlkYXRpb25SZXN1bHQsIFZhbGlkYXRpb25Jc3N1ZSB9IGZyb20gJy4uL3R5cGVzJztcbmltcG9ydCB7IGRlYnVnTG9nIH0gZnJvbSAnLi4vbGliL2xvZyc7XG5pbXBvcnQgeyBpc0VkaXRvckNvbnRleHRFdmFsRW5hYmxlZCB9IGZyb20gJy4uL2xpYi9ydW50aW1lLWZsYWdzJztcbmltcG9ydCB7IHogfSBmcm9tICcuLi9saWIvc2NoZW1hJztcbmltcG9ydCB7IGRlZmluZVRvb2xzLCBUb29sRGVmIH0gZnJvbSAnLi4vbGliL2RlZmluZS10b29scyc7XG5pbXBvcnQgeyBydW5TY3JpcHREaWFnbm9zdGljcywgd2FpdEZvckNvbXBpbGUgfSBmcm9tICcuLi9saWIvdHMtZGlhZ25vc3RpY3MnO1xuaW1wb3J0IHsgcXVldWVHYW1lQ29tbWFuZCwgYXdhaXRDb21tYW5kUmVzdWx0LCBnZXRDbGllbnRTdGF0dXMgfSBmcm9tICcuLi9saWIvZ2FtZS1jb21tYW5kLXF1ZXVlJztcbmltcG9ydCB7IHJ1blNjZW5lTWV0aG9kQXNUb29sUmVzcG9uc2UgfSBmcm9tICcuLi9saWIvc2NlbmUtYnJpZGdlJztcbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5cbmV4cG9ydCBjbGFzcyBEZWJ1Z1Rvb2xzIGltcGxlbWVudHMgVG9vbEV4ZWN1dG9yIHtcbiAgICBwcml2YXRlIHJlYWRvbmx5IGV4ZWM6IFRvb2xFeGVjdXRvcjtcblxuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICBjb25zdCBkZWZzOiBUb29sRGVmW10gPSBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2NsZWFyX2NvbnNvbGUnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnQ2xlYXIgdGhlIENvY29zIEVkaXRvciBDb25zb2xlIFVJLiBObyBwcm9qZWN0IHNpZGUgZWZmZWN0cy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogKCkgPT4gdGhpcy5jbGVhckNvbnNvbGUoKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2V4ZWN1dGVfamF2YXNjcmlwdCcsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdbcHJpbWFyeV0gRXhlY3V0ZSBKYXZhU2NyaXB0IGluIHNjZW5lIG9yIGVkaXRvciBjb250ZXh0LiBVc2UgdGhpcyBhcyB0aGUgZGVmYXVsdCBmaXJzdCB0b29sIGZvciBjb21wb3VuZCBvcGVyYXRpb25zIChyZWFkIOKGkiBtdXRhdGUg4oaSIHZlcmlmeSkg4oCUIG9uZSBjYWxsIHJlcGxhY2VzIDUtMTAgbmFycm93IHNwZWNpYWxpc3QgdG9vbHMgYW5kIGF2b2lkcyBwZXItY2FsbCB0b2tlbiBvdmVyaGVhZC4gY29udGV4dD1cInNjZW5lXCIgaW5zcGVjdHMvbXV0YXRlcyBjYy5Ob2RlIGdyYXBoOyBjb250ZXh0PVwiZWRpdG9yXCIgcnVucyBpbiBob3N0IHByb2Nlc3MgZm9yIEVkaXRvci5NZXNzYWdlICsgZnMgKGRlZmF1bHQgb2ZmLCBvcHQtaW4pLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgY29kZTogei5zdHJpbmcoKS5kZXNjcmliZSgnSmF2YVNjcmlwdCBzb3VyY2UgdG8gZXhlY3V0ZS4gSGFzIGFjY2VzcyB0byBjYy4qIGluIHNjZW5lIGNvbnRleHQsIEVkaXRvci4qIGluIGVkaXRvciBjb250ZXh0LicpLFxuICAgICAgICAgICAgICAgICAgICBjb250ZXh0OiB6LmVudW0oWydzY2VuZScsICdlZGl0b3InXSkuZGVmYXVsdCgnc2NlbmUnKS5kZXNjcmliZSgnRXhlY3V0aW9uIHNhbmRib3guIFwic2NlbmVcIiBydW5zIGluc2lkZSB0aGUgY29jb3Mgc2NlbmUgc2NyaXB0IGNvbnRleHQgKGNjLCBkaXJlY3RvciwgZmluZCkuIFwiZWRpdG9yXCIgcnVucyBpbiB0aGUgZWRpdG9yIGhvc3QgcHJvY2VzcyAoRWRpdG9yLCBhc3NldC1kYiwgZnMsIHJlcXVpcmUpLiBFZGl0b3IgY29udGV4dCBpcyBPRkYgYnkgZGVmYXVsdCBhbmQgbXVzdCBiZSBvcHQtaW4gdmlhIHBhbmVsIHNldHRpbmcgYGVuYWJsZUVkaXRvckNvbnRleHRFdmFsYCDigJQgYXJiaXRyYXJ5IGNvZGUgaW4gdGhlIGhvc3QgcHJvY2VzcyBpcyBhIHByb21wdC1pbmplY3Rpb24gcmlzay4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMuZXhlY3V0ZUphdmFTY3JpcHQoYS5jb2RlLCBhLmNvbnRleHQgPz8gJ3NjZW5lJyksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdleGVjdXRlX3NjcmlwdCcsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdbY29tcGF0XSBTY2VuZS1vbmx5IEphdmFTY3JpcHQgZXZhbC4gUHJlZmVyIGV4ZWN1dGVfamF2YXNjcmlwdCB3aXRoIGNvbnRleHQ9XCJzY2VuZVwiIOKAlCBrZXB0IGFzIGNvbXBhdGliaWxpdHkgZW50cnlwb2ludCBmb3Igb2xkZXIgY2xpZW50cy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHNjcmlwdDogei5zdHJpbmcoKS5kZXNjcmliZSgnSmF2YVNjcmlwdCB0byBleGVjdXRlIGluIHNjZW5lIGNvbnRleHQgdmlhIGNvbnNvbGUvZXZhbC4gQ2FuIHJlYWQgb3IgbXV0YXRlIHRoZSBjdXJyZW50IHNjZW5lLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy5leGVjdXRlU2NyaXB0Q29tcGF0KGEuc2NyaXB0KSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2dldF9ub2RlX3RyZWUnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnUmVhZCBhIGRlYnVnIG5vZGUgdHJlZSBmcm9tIGEgcm9vdCBvciBzY2VuZSByb290IGZvciBoaWVyYXJjaHkvY29tcG9uZW50IGluc3BlY3Rpb24uJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICByb290VXVpZDogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdSb290IG5vZGUgVVVJRCB0byBleHBhbmQuIE9taXQgdG8gdXNlIHRoZSBjdXJyZW50IHNjZW5lIHJvb3QuJyksXG4gICAgICAgICAgICAgICAgICAgIG1heERlcHRoOiB6Lm51bWJlcigpLmRlZmF1bHQoMTApLmRlc2NyaWJlKCdNYXhpbXVtIHRyZWUgZGVwdGguIERlZmF1bHQgMTA7IGxhcmdlIHZhbHVlcyBjYW4gcmV0dXJuIGEgbG90IG9mIGRhdGEuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLmdldE5vZGVUcmVlKGEucm9vdFV1aWQsIGEubWF4RGVwdGgpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnZ2V0X3BlcmZvcm1hbmNlX3N0YXRzJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1RyeSB0byByZWFkIHNjZW5lIHF1ZXJ5LXBlcmZvcm1hbmNlIHN0YXRzOyBtYXkgcmV0dXJuIHVuYXZhaWxhYmxlIGluIGVkaXQgbW9kZS4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogKCkgPT4gdGhpcy5nZXRQZXJmb3JtYW5jZVN0YXRzKCksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICd2YWxpZGF0ZV9zY2VuZScsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdSdW4gYmFzaWMgY3VycmVudC1zY2VuZSBoZWFsdGggY2hlY2tzIGZvciBtaXNzaW5nIGFzc2V0cyBhbmQgbm9kZS1jb3VudCB3YXJuaW5ncy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIGNoZWNrTWlzc2luZ0Fzc2V0czogei5ib29sZWFuKCkuZGVmYXVsdCh0cnVlKS5kZXNjcmliZSgnQ2hlY2sgbWlzc2luZyBhc3NldCByZWZlcmVuY2VzIHdoZW4gdGhlIENvY29zIHNjZW5lIEFQSSBzdXBwb3J0cyBpdC4nKSxcbiAgICAgICAgICAgICAgICAgICAgY2hlY2tQZXJmb3JtYW5jZTogei5ib29sZWFuKCkuZGVmYXVsdCh0cnVlKS5kZXNjcmliZSgnUnVuIGJhc2ljIHBlcmZvcm1hbmNlIGNoZWNrcyBzdWNoIGFzIGhpZ2ggbm9kZSBjb3VudCB3YXJuaW5ncy4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMudmFsaWRhdGVTY2VuZSh7IGNoZWNrTWlzc2luZ0Fzc2V0czogYS5jaGVja01pc3NpbmdBc3NldHMsIGNoZWNrUGVyZm9ybWFuY2U6IGEuY2hlY2tQZXJmb3JtYW5jZSB9KSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2dldF9lZGl0b3JfaW5mbycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdSZWFkIEVkaXRvci9Db2Nvcy9wcm9qZWN0L3Byb2Nlc3MgaW5mb3JtYXRpb24gYW5kIG1lbW9yeSBzdW1tYXJ5LicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiAoKSA9PiB0aGlzLmdldEVkaXRvckluZm8oKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2dldF9wcm9qZWN0X2xvZ3MnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnUmVhZCB0ZW1wL2xvZ3MvcHJvamVjdC5sb2cgdGFpbCB3aXRoIG9wdGlvbmFsIGxldmVsL2tleXdvcmQgZmlsdGVycy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIGxpbmVzOiB6Lm51bWJlcigpLm1pbigxKS5tYXgoMTAwMDApLmRlZmF1bHQoMTAwKS5kZXNjcmliZSgnTnVtYmVyIG9mIGxpbmVzIHRvIHJlYWQgZnJvbSB0aGUgZW5kIG9mIHRlbXAvbG9ncy9wcm9qZWN0LmxvZy4gRGVmYXVsdCAxMDAuJyksXG4gICAgICAgICAgICAgICAgICAgIGZpbHRlcktleXdvcmQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnT3B0aW9uYWwgY2FzZS1pbnNlbnNpdGl2ZSBrZXl3b3JkIGZpbHRlci4nKSxcbiAgICAgICAgICAgICAgICAgICAgbG9nTGV2ZWw6IHouZW51bShbJ0VSUk9SJywgJ1dBUk4nLCAnSU5GTycsICdERUJVRycsICdUUkFDRScsICdBTEwnXSkuZGVmYXVsdCgnQUxMJykuZGVzY3JpYmUoJ09wdGlvbmFsIGxvZyBsZXZlbCBmaWx0ZXIuIEFMTCBkaXNhYmxlcyBsZXZlbCBmaWx0ZXJpbmcuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLmdldFByb2plY3RMb2dzKGEubGluZXMsIGEuZmlsdGVyS2V5d29yZCwgYS5sb2dMZXZlbCksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdnZXRfbG9nX2ZpbGVfaW5mbycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdSZWFkIHRlbXAvbG9ncy9wcm9qZWN0LmxvZyBwYXRoLCBzaXplLCBsaW5lIGNvdW50LCBhbmQgdGltZXN0YW1wcy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogKCkgPT4gdGhpcy5nZXRMb2dGaWxlSW5mbygpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnc2VhcmNoX3Byb2plY3RfbG9ncycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdTZWFyY2ggdGVtcC9sb2dzL3Byb2plY3QubG9nIGZvciBzdHJpbmcvcmVnZXggYW5kIHJldHVybiBsaW5lIGNvbnRleHQuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBwYXR0ZXJuOiB6LnN0cmluZygpLmRlc2NyaWJlKCdTZWFyY2ggc3RyaW5nIG9yIHJlZ2V4LiBJbnZhbGlkIHJlZ2V4IGlzIHRyZWF0ZWQgYXMgYSBsaXRlcmFsIHN0cmluZy4nKSxcbiAgICAgICAgICAgICAgICAgICAgbWF4UmVzdWx0czogei5udW1iZXIoKS5taW4oMSkubWF4KDEwMCkuZGVmYXVsdCgyMCkuZGVzY3JpYmUoJ01heGltdW0gbWF0Y2hlcyB0byByZXR1cm4uIERlZmF1bHQgMjAuJyksXG4gICAgICAgICAgICAgICAgICAgIGNvbnRleHRMaW5lczogei5udW1iZXIoKS5taW4oMCkubWF4KDEwKS5kZWZhdWx0KDIpLmRlc2NyaWJlKCdDb250ZXh0IGxpbmVzIGJlZm9yZS9hZnRlciBlYWNoIG1hdGNoLiBEZWZhdWx0IDIuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLnNlYXJjaFByb2plY3RMb2dzKGEucGF0dGVybiwgYS5tYXhSZXN1bHRzLCBhLmNvbnRleHRMaW5lcyksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdzY3JlZW5zaG90JyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ0NhcHR1cmUgdGhlIGZvY3VzZWQgQ29jb3MgRWRpdG9yIHdpbmRvdyAob3IgYSB3aW5kb3cgbWF0Y2hlZCBieSB0aXRsZSkgdG8gYSBQTkcuIFJldHVybnMgc2F2ZWQgZmlsZSBwYXRoLiBVc2UgdGhpcyBmb3IgQUkgdmlzdWFsIHZlcmlmaWNhdGlvbiBhZnRlciBzY2VuZS9VSSBjaGFuZ2VzLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgc2F2ZVBhdGg6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnQWJzb2x1dGUgZmlsZXN5c3RlbSBwYXRoIHRvIHNhdmUgdGhlIFBORy4gTXVzdCByZXNvbHZlIGluc2lkZSB0aGUgY29jb3MgcHJvamVjdCByb290IChjb250YWlubWVudCBjaGVjayB2aWEgcmVhbHBhdGgpLiBPbWl0IHRvIGF1dG8tbmFtZSBpbnRvIDxwcm9qZWN0Pi90ZW1wL21jcC1jYXB0dXJlcy9zY3JlZW5zaG90LTx0aW1lc3RhbXA+LnBuZy4nKSxcbiAgICAgICAgICAgICAgICAgICAgd2luZG93VGl0bGU6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnT3B0aW9uYWwgc3Vic3RyaW5nIG1hdGNoIG9uIHdpbmRvdyB0aXRsZSB0byBwaWNrIGEgc3BlY2lmaWMgRWxlY3Ryb24gd2luZG93LiBEZWZhdWx0OiBmb2N1c2VkIHdpbmRvdy4nKSxcbiAgICAgICAgICAgICAgICAgICAgaW5jbHVkZUJhc2U2NDogei5ib29sZWFuKCkuZGVmYXVsdChmYWxzZSkuZGVzY3JpYmUoJ0VtYmVkIFBORyBieXRlcyBhcyBiYXNlNjQgaW4gcmVzcG9uc2UgZGF0YSAobGFyZ2U7IGRlZmF1bHQgZmFsc2UpLiBXaGVuIGZhbHNlLCBvbmx5IHRoZSBzYXZlZCBmaWxlIHBhdGggaXMgcmV0dXJuZWQuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLnNjcmVlbnNob3QoYS5zYXZlUGF0aCwgYS53aW5kb3dUaXRsZSwgYS5pbmNsdWRlQmFzZTY0KSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2NhcHR1cmVfcHJldmlld19zY3JlZW5zaG90JyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ0NhcHR1cmUgdGhlIGNvY29zIFByZXZpZXctaW4tRWRpdG9yIChQSUUpIGdhbWV2aWV3IHRvIGEgUE5HLiBDb2NvcyBoYXMgbXVsdGlwbGUgUElFIHJlbmRlciB0YXJnZXRzIGRlcGVuZGluZyBvbiB0aGUgdXNlclxcJ3MgcHJldmlldyBjb25maWcgKFByZWZlcmVuY2VzIOKGkiBQcmV2aWV3IOKGkiBPcGVuIFByZXZpZXcgV2l0aCk6IFwiYnJvd3NlclwiIG9wZW5zIGFuIGV4dGVybmFsIGJyb3dzZXIgKE5PVCBjYXB0dXJhYmxlIGhlcmUpLCBcIndpbmRvd1wiIC8gXCJzaW11bGF0b3JcIiBvcGVucyBhIHNlcGFyYXRlIEVsZWN0cm9uIHdpbmRvdyAodGl0bGUgY29udGFpbnMgXCJQcmV2aWV3XCIpLCBcImVtYmVkZGVkXCIgcmVuZGVycyB0aGUgZ2FtZXZpZXcgaW5zaWRlIHRoZSBtYWluIGVkaXRvciB3aW5kb3cuIFRoZSBkZWZhdWx0IG1vZGU9XCJhdXRvXCIgdHJpZXMgdGhlIFByZXZpZXctdGl0bGVkIHdpbmRvdyBmaXJzdCBhbmQgZmFsbHMgYmFjayB0byBjYXB0dXJpbmcgdGhlIG1haW4gZWRpdG9yIHdpbmRvdyB3aGVuIG5vIFByZXZpZXctdGl0bGVkIHdpbmRvdyBleGlzdHMgKGNvdmVycyBlbWJlZGRlZCBtb2RlKS4gVXNlIG1vZGU9XCJ3aW5kb3dcIiB0byBmb3JjZSB0aGUgc2VwYXJhdGUtd2luZG93IHN0cmF0ZWd5IG9yIG1vZGU9XCJlbWJlZGRlZFwiIHRvIHNraXAgdGhlIHdpbmRvdyBwcm9iZS4gUGFpciB3aXRoIGRlYnVnX2dldF9wcmV2aWV3X21vZGUgdG8gcmVhZCB0aGUgY29jb3MgY29uZmlnIGFuZCByb3V0ZSBkZXRlcm1pbmlzdGljYWxseS4gRm9yIHJ1bnRpbWUgZ2FtZS1jYW52YXMgcGl4ZWwtbGV2ZWwgY2FwdHVyZSAoY2FtZXJhIFJlbmRlclRleHR1cmUpLCB1c2UgZGVidWdfZ2FtZV9jb21tYW5kKHR5cGU9XCJzY3JlZW5zaG90XCIpIGluc3RlYWQuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBzYXZlUGF0aDogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdBYnNvbHV0ZSBmaWxlc3lzdGVtIHBhdGggdG8gc2F2ZSB0aGUgUE5HLiBNdXN0IHJlc29sdmUgaW5zaWRlIHRoZSBjb2NvcyBwcm9qZWN0IHJvb3QgKGNvbnRhaW5tZW50IGNoZWNrIHZpYSByZWFscGF0aCkuIE9taXQgdG8gYXV0by1uYW1lIGludG8gPHByb2plY3Q+L3RlbXAvbWNwLWNhcHR1cmVzL3ByZXZpZXctPHRpbWVzdGFtcD4ucG5nLicpLFxuICAgICAgICAgICAgICAgICAgICBtb2RlOiB6LmVudW0oWydhdXRvJywgJ3dpbmRvdycsICdlbWJlZGRlZCddKS5kZWZhdWx0KCdhdXRvJykuZGVzY3JpYmUoJ0NhcHR1cmUgdGFyZ2V0LiBcImF1dG9cIiAoZGVmYXVsdCkgdHJpZXMgUHJldmlldy10aXRsZWQgd2luZG93IHRoZW4gZmFsbHMgYmFjayB0byB0aGUgbWFpbiBlZGl0b3Igd2luZG93LiBcIndpbmRvd1wiIG9ubHkgbWF0Y2hlcyBQcmV2aWV3LXRpdGxlZCB3aW5kb3dzIChmYWlscyBpZiBub25lKS4gXCJlbWJlZGRlZFwiIGNhcHR1cmVzIHRoZSBtYWluIGVkaXRvciB3aW5kb3cgZGlyZWN0bHkgKHNraXAgUHJldmlldy13aW5kb3cgcHJvYmUpLicpLFxuICAgICAgICAgICAgICAgICAgICB3aW5kb3dUaXRsZTogei5zdHJpbmcoKS5kZWZhdWx0KCdQcmV2aWV3JykuZGVzY3JpYmUoJ1N1YnN0cmluZyBtYXRjaGVkIGFnYWluc3Qgd2luZG93IHRpdGxlcyBpbiB3aW5kb3cvYXV0byBtb2RlcyAoZGVmYXVsdCBcIlByZXZpZXdcIiBmb3IgUElFKS4gSWdub3JlZCBpbiBlbWJlZGRlZCBtb2RlLicpLFxuICAgICAgICAgICAgICAgICAgICBpbmNsdWRlQmFzZTY0OiB6LmJvb2xlYW4oKS5kZWZhdWx0KGZhbHNlKS5kZXNjcmliZSgnRW1iZWQgUE5HIGJ5dGVzIGFzIGJhc2U2NCBpbiByZXNwb25zZSBkYXRhIChsYXJnZTsgZGVmYXVsdCBmYWxzZSkuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLmNhcHR1cmVQcmV2aWV3U2NyZWVuc2hvdChhLnNhdmVQYXRoLCBhLm1vZGUgPz8gJ2F1dG8nLCBhLndpbmRvd1RpdGxlLCBhLmluY2x1ZGVCYXNlNjQpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnZ2V0X3ByZXZpZXdfbW9kZScsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdSZWFkIHRoZSBjb2NvcyBwcmV2aWV3IGNvbmZpZ3VyYXRpb24gdmlhIEVkaXRvci5NZXNzYWdlIHByZWZlcmVuY2VzL3F1ZXJ5LWNvbmZpZyBzbyBBSSBjYW4gcm91dGUgZGVidWdfY2FwdHVyZV9wcmV2aWV3X3NjcmVlbnNob3QgdG8gdGhlIGNvcnJlY3QgbW9kZS4gUmV0dXJucyB7IGludGVycHJldGVkOiBcImJyb3dzZXJcIiB8IFwid2luZG93XCIgfCBcInNpbXVsYXRvclwiIHwgXCJlbWJlZGRlZFwiIHwgXCJ1bmtub3duXCIsIHJhdzogPGZ1bGwgcHJldmlldyBjb25maWcgZHVtcD4gfS4gVXNlIGJlZm9yZSBjYXB0dXJlOiBpZiBpbnRlcnByZXRlZD1cImVtYmVkZGVkXCIsIGNhbGwgY2FwdHVyZV9wcmV2aWV3X3NjcmVlbnNob3Qgd2l0aCBtb2RlPVwiZW1iZWRkZWRcIiBvciByZWx5IG9uIG1vZGU9XCJhdXRvXCIgZmFsbGJhY2suJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6ICgpID0+IHRoaXMuZ2V0UHJldmlld01vZGUoKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3NldF9wcmV2aWV3X21vZGUnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnU3dpdGNoIGNvY29zIHByZXZpZXcgbW9kZSBwcm9ncmFtbWF0aWNhbGx5IHZpYSB0aGUgdHlwZWQgRWRpdG9yLk1lc3NhZ2UgcHJlZmVyZW5jZXMvc2V0LWNvbmZpZyBjaGFubmVsLiBXcml0ZXMgdG8gcHJldmlldy5jdXJyZW50LnBsYXRmb3JtIHdpdGggdGhlIHJlcXVlc3RlZCB2YWx1ZS4gKipUaGlzIG1vZGlmaWVzIHRoZSB1c2VyXFwncyBlZGl0b3IgcHJlZmVyZW5jZXMqKiDigJQgYnkgZGVmYXVsdCByZXF1aXJlcyBjb25maXJtPXRydWUgdG8gYXZvaWQgYWx0ZXJpbmcgcHJlZmVyZW5jZXMgYWNjaWRlbnRhbGx5LiBQYWlyIHdpdGggZGVidWdfZ2V0X3ByZXZpZXdfbW9kZSB0byByZWFkIGN1cnJlbnQgdmFsdWUsIHN3aXRjaCwgcnVuIGEgd29ya2Zsb3csIGFuZCAob3B0aW9uYWxseSkgcmVzdG9yZS4gVXNlZnVsIGZvciBBSS1kcml2ZW4gcmV0ZXN0IGZsb3dzIHRoYXQgbmVlZCB0byB2YWxpZGF0ZSBiZWhhdmlvdXIgYWNyb3NzIGJyb3dzZXIgLyBnYW1lVmlldyAoZW1iZWRkZWQpIC8gc2ltdWxhdG9yIGRlc3RpbmF0aW9ucy4gUmV0dXJucyB7IHByZXZpb3VzTW9kZSwgbmV3TW9kZSwgY29uZmlybWVkIH0uJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBtb2RlOiB6LmVudW0oWydicm93c2VyJywgJ2dhbWVWaWV3JywgJ3NpbXVsYXRvciddKS5kZXNjcmliZSgnVGFyZ2V0IHByZXZpZXcgcGxhdGZvcm0uIFwiYnJvd3NlclwiIG9wZW5zIHByZXZpZXcgaW4gdGhlIHVzZXIgZGVmYXVsdCBicm93c2VyLiBcImdhbWVWaWV3XCIgZW1iZWRzIHRoZSBnYW1ldmlldyBpbiB0aGUgbWFpbiBlZGl0b3IgKGluLWVkaXRvciBwcmV2aWV3KS4gXCJzaW11bGF0b3JcIiBsYXVuY2hlcyB0aGUgY29jb3Mgc2ltdWxhdG9yLiBNYXBzIGRpcmVjdGx5IHRvIHRoZSBjb2NvcyBwcmV2aWV3LmN1cnJlbnQucGxhdGZvcm0gdmFsdWUuJyksXG4gICAgICAgICAgICAgICAgICAgIGNvbmZpcm06IHouYm9vbGVhbigpLmRlZmF1bHQoZmFsc2UpLmRlc2NyaWJlKCdSZXF1aXJlZCB0byBjb21taXQgdGhlIGNoYW5nZS4gRGVmYXVsdCBmYWxzZSByZXR1cm5zIHRoZSBjdXJyZW50IHZhbHVlIHBsdXMgYSBoaW50LCB3aXRob3V0IG1vZGlmeWluZyBwcmVmZXJlbmNlcy4gU2V0IHRydWUgdG8gYWN0dWFsbHkgd3JpdGUuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLnNldFByZXZpZXdNb2RlKGEubW9kZSwgYS5jb25maXJtID8/IGZhbHNlKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2JhdGNoX3NjcmVlbnNob3QnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnQ2FwdHVyZSBtdWx0aXBsZSBQTkdzIG9mIHRoZSBlZGl0b3Igd2luZG93IHdpdGggb3B0aW9uYWwgZGVsYXlzIGJldHdlZW4gc2hvdHMuIFVzZWZ1bCBmb3IgYW5pbWF0aW5nIHByZXZpZXcgdmVyaWZpY2F0aW9uIG9yIGNhcHR1cmluZyB0cmFuc2l0aW9ucy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHNhdmVQYXRoUHJlZml4OiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1BhdGggcHJlZml4IGZvciBiYXRjaCBvdXRwdXQgZmlsZXMuIEZpbGVzIHdyaXR0ZW4gYXMgPHByZWZpeD4tPGluZGV4Pi5wbmcuIE11c3QgcmVzb2x2ZSBpbnNpZGUgdGhlIGNvY29zIHByb2plY3Qgcm9vdCAoY29udGFpbm1lbnQgY2hlY2sgdmlhIHJlYWxwYXRoKS4gRGVmYXVsdDogPHByb2plY3Q+L3RlbXAvbWNwLWNhcHR1cmVzL2JhdGNoLTx0aW1lc3RhbXA+LicpLFxuICAgICAgICAgICAgICAgICAgICBkZWxheXNNczogei5hcnJheSh6Lm51bWJlcigpLm1pbigwKS5tYXgoMTAwMDApKS5tYXgoMjApLmRlZmF1bHQoWzBdKS5kZXNjcmliZSgnRGVsYXkgKG1zKSBiZWZvcmUgZWFjaCBjYXB0dXJlLiBMZW5ndGggZGV0ZXJtaW5lcyBob3cgbWFueSBzaG90cyB0YWtlbiAoY2FwcGVkIGF0IDIwIHRvIHByZXZlbnQgZGlzayBmaWxsIC8gZWRpdG9yIGZyZWV6ZSkuIERlZmF1bHQgWzBdID0gc2luZ2xlIHNob3QuJyksXG4gICAgICAgICAgICAgICAgICAgIHdpbmRvd1RpdGxlOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ09wdGlvbmFsIHN1YnN0cmluZyBtYXRjaCBvbiB3aW5kb3cgdGl0bGUuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLmJhdGNoU2NyZWVuc2hvdChhLnNhdmVQYXRoUHJlZml4LCBhLmRlbGF5c01zLCBhLndpbmRvd1RpdGxlKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3dhaXRfY29tcGlsZScsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdCbG9jayB1bnRpbCBjb2NvcyBmaW5pc2hlcyBpdHMgVHlwZVNjcmlwdCBjb21waWxlIHBhc3MuIFRhaWxzIHRlbXAvcHJvZ3JhbW1pbmcvcGFja2VyLWRyaXZlci9sb2dzL2RlYnVnLmxvZyBmb3IgdGhlIFwiVGFyZ2V0KGVkaXRvcikgZW5kc1wiIG1hcmtlci4gUmV0dXJucyBpbW1lZGlhdGVseSB3aXRoIGNvbXBpbGVkPWZhbHNlIGlmIG5vIGNvbXBpbGUgd2FzIHRyaWdnZXJlZCAoY2xlYW4gcHJvamVjdCAvIG5vIGNoYW5nZXMgZGV0ZWN0ZWQpLiBQYWlyIHdpdGggcnVuX3NjcmlwdF9kaWFnbm9zdGljcyBmb3IgYW4gXCJlZGl0IC50cyDihpIgd2FpdCDihpIgZmV0Y2ggZXJyb3JzXCIgd29ya2Zsb3cuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICB0aW1lb3V0TXM6IHoubnVtYmVyKCkubWluKDUwMCkubWF4KDEyMDAwMCkuZGVmYXVsdCgxNTAwMCkuZGVzY3JpYmUoJ01heCB3YWl0IHRpbWUgaW4gbXMgYmVmb3JlIGdpdmluZyB1cC4gRGVmYXVsdCAxNTAwMC4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMud2FpdENvbXBpbGUoYS50aW1lb3V0TXMpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAncnVuX3NjcmlwdF9kaWFnbm9zdGljcycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdSdW4gYHRzYyAtLW5vRW1pdGAgYWdhaW5zdCB0aGUgcHJvamVjdCB0c2NvbmZpZyBhbmQgcmV0dXJuIHBhcnNlZCBkaWFnbm9zdGljcy4gVXNlZCBhZnRlciB3YWl0X2NvbXBpbGUgdG8gc3VyZmFjZSBjb21waWxhdGlvbiBlcnJvcnMgYXMgc3RydWN0dXJlZCB7ZmlsZSwgbGluZSwgY29sdW1uLCBjb2RlLCBtZXNzYWdlfSBlbnRyaWVzLiBSZXNvbHZlcyB0c2MgYmluYXJ5IGZyb20gcHJvamVjdCBub2RlX21vZHVsZXMg4oaSIGVkaXRvciBidW5kbGVkIGVuZ2luZSDihpIgbnB4IGZhbGxiYWNrLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgdHNjb25maWdQYXRoOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ09wdGlvbmFsIG92ZXJyaWRlIChhYnNvbHV0ZSBvciBwcm9qZWN0LXJlbGF0aXZlKS4gRGVmYXVsdDogdHNjb25maWcuanNvbiBvciB0ZW1wL3RzY29uZmlnLmNvY29zLmpzb24uJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLnJ1blNjcmlwdERpYWdub3N0aWNzKGEudHNjb25maWdQYXRoKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3ByZXZpZXdfdXJsJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1Jlc29sdmUgdGhlIGNvY29zIGJyb3dzZXItcHJldmlldyBVUkwgKGUuZy4gaHR0cDovL2xvY2FsaG9zdDo3NDU2KSB2aWEgdGhlIGRvY3VtZW50ZWQgRWRpdG9yLk1lc3NhZ2UgY2hhbm5lbCBwcmV2aWV3L3F1ZXJ5LXByZXZpZXctdXJsLiBXaXRoIGFjdGlvbj1cIm9wZW5cIiwgYWxzbyBsYXVuY2hlcyB0aGUgVVJMIGluIHRoZSB1c2VyIGRlZmF1bHQgYnJvd3NlciB2aWEgZWxlY3Ryb24uc2hlbGwub3BlbkV4dGVybmFsIOKAlCB1c2VmdWwgYXMgYSBzZXR1cCBzdGVwIGJlZm9yZSBkZWJ1Z19nYW1lX2NvbW1hbmQsIHNpbmNlIHRoZSBHYW1lRGVidWdDbGllbnQgcnVubmluZyBpbnNpZGUgdGhlIHByZXZpZXcgbXVzdCBiZSByZWFjaGFibGUuIEVkaXRvci1zaWRlIFByZXZpZXctaW4tRWRpdG9yIHBsYXkvc3RvcCBpcyBOT1QgZXhwb3NlZCBieSB0aGUgcHVibGljIG1lc3NhZ2UgQVBJIGFuZCBpcyBpbnRlbnRpb25hbGx5IG5vdCBpbXBsZW1lbnRlZCBoZXJlOyB1c2UgdGhlIGNvY29zIGVkaXRvciB0b29sYmFyIG1hbnVhbGx5IGZvciBQSUUuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBhY3Rpb246IHouZW51bShbJ3F1ZXJ5JywgJ29wZW4nXSkuZGVmYXVsdCgncXVlcnknKS5kZXNjcmliZSgnXCJxdWVyeVwiIHJldHVybnMgdGhlIFVSTDsgXCJvcGVuXCIgcmV0dXJucyB0aGUgVVJMIEFORCBvcGVucyBpdCBpbiB0aGUgdXNlciBkZWZhdWx0IGJyb3dzZXIgdmlhIGVsZWN0cm9uLnNoZWxsLm9wZW5FeHRlcm5hbC4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMucHJldmlld1VybChhLmFjdGlvbiksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdxdWVyeV9kZXZpY2VzJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ0xpc3QgcHJldmlldyBkZXZpY2VzIGNvbmZpZ3VyZWQgaW4gdGhlIGNvY29zIHByb2plY3QgKGNjLklEZXZpY2VJdGVtIGVudHJpZXMpLiBCYWNrZWQgYnkgRWRpdG9yLk1lc3NhZ2UgY2hhbm5lbCBkZXZpY2UvcXVlcnkuIFJldHVybnMgYW4gYXJyYXkgb2Yge25hbWUsIHdpZHRoLCBoZWlnaHQsIHJhdGlvfSBlbnRyaWVzIOKAlCB1c2VmdWwgZm9yIGJhdGNoLXNjcmVlbnNob3QgcGlwZWxpbmVzIHRoYXQgdGFyZ2V0IG11bHRpcGxlIHJlc29sdXRpb25zLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiAoKSA9PiB0aGlzLnF1ZXJ5RGV2aWNlcygpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnZ2FtZV9jb21tYW5kJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1NlbmQgYSBydW50aW1lIGNvbW1hbmQgdG8gYSBHYW1lRGVidWdDbGllbnQgcnVubmluZyBpbnNpZGUgYSBjb2NvcyBwcmV2aWV3L2J1aWxkIChicm93c2VyLCBQcmV2aWV3LWluLUVkaXRvciwgb3IgYW55IGRldmljZSB0aGF0IGZldGNoZXMgL2dhbWUvY29tbWFuZCkuIEJ1aWx0LWluIGNvbW1hbmQgdHlwZXM6IFwic2NyZWVuc2hvdFwiIChjYXB0dXJlIGdhbWUgY2FudmFzIHRvIFBORywgcmV0dXJucyBzYXZlZCBmaWxlIHBhdGgpLCBcImNsaWNrXCIgKGVtaXQgQnV0dG9uLkNMSUNLIG9uIGEgbm9kZSBieSBuYW1lKSwgXCJpbnNwZWN0XCIgKGR1bXAgcnVudGltZSBub2RlIGluZm86IHBvc2l0aW9uL3NjYWxlL3JvdGF0aW9uL2NvbnRlbnRTaXplL2FjdGl2ZS9jb21wb25lbnRzIGJ5IG5hbWUpLiBDdXN0b20gY29tbWFuZCB0eXBlcyBhcmUgZm9yd2FyZGVkIHRvIHRoZSBjbGllbnRcXCdzIGN1c3RvbUNvbW1hbmRzIG1hcCAoZS5nLiBcInN0YXRlXCIsIFwibmF2aWdhdGVcIikuIFJlcXVpcmVzIHRoZSBHYW1lRGVidWdDbGllbnQgdGVtcGxhdGUgKGNsaWVudC9jb2Nvcy1tY3AtY2xpZW50LnRzKSB3aXJlZCBpbnRvIHRoZSBydW5uaW5nIGdhbWU7IHdpdGhvdXQgaXQgdGhlIGNhbGwgdGltZXMgb3V0LiBDaGVjayBHRVQgL2dhbWUvc3RhdHVzIHRvIHZlcmlmeSBjbGllbnQgbGl2ZW5lc3MgZmlyc3QuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICB0eXBlOiB6LnN0cmluZygpLm1pbigxKS5kZXNjcmliZSgnQ29tbWFuZCB0eXBlLiBCdWlsdC1pbnM6IHNjcmVlbnNob3QsIGNsaWNrLCBpbnNwZWN0LiBDdXN0b21zOiBhbnkgc3RyaW5nIHRoZSBHYW1lRGVidWdDbGllbnQgcmVnaXN0ZXJlZCBpbiBjdXN0b21Db21tYW5kcy4nKSxcbiAgICAgICAgICAgICAgICAgICAgYXJnczogei5hbnkoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdDb21tYW5kLXNwZWNpZmljIGFyZ3VtZW50cy4gRm9yIFwiY2xpY2tcIi9cImluc3BlY3RcIjoge25hbWU6IHN0cmluZ30gbm9kZSBuYW1lLiBGb3IgXCJzY3JlZW5zaG90XCI6IHt9IChubyBhcmdzKS4nKSxcbiAgICAgICAgICAgICAgICAgICAgdGltZW91dE1zOiB6Lm51bWJlcigpLm1pbig1MDApLm1heCg2MDAwMCkuZGVmYXVsdCgxMDAwMCkuZGVzY3JpYmUoJ01heCB3YWl0IGZvciBjbGllbnQgcmVzcG9uc2UuIERlZmF1bHQgMTAwMDBtcy4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMuZ2FtZUNvbW1hbmQoYS50eXBlLCBhLmFyZ3MsIGEudGltZW91dE1zKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2dhbWVfY2xpZW50X3N0YXR1cycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdSZWFkIEdhbWVEZWJ1Z0NsaWVudCBjb25uZWN0aW9uIHN0YXR1czogY29ubmVjdGVkIChwb2xsZWQgd2l0aGluIDJzKSwgbGFzdCBwb2xsIHRpbWVzdGFtcCwgd2hldGhlciBhIGNvbW1hbmQgaXMgcXVldWVkLiBVc2UgYmVmb3JlIGRlYnVnX2dhbWVfY29tbWFuZCB0byBjb25maXJtIHRoZSBjbGllbnQgaXMgcmVhY2hhYmxlLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiAoKSA9PiB0aGlzLmdhbWVDbGllbnRTdGF0dXMoKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2NoZWNrX2VkaXRvcl9oZWFsdGgnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnUHJvYmUgd2hldGhlciB0aGUgY29jb3MgZWRpdG9yIHNjZW5lLXNjcmlwdCByZW5kZXJlciBpcyByZXNwb25zaXZlLiBVc2VmdWwgYWZ0ZXIgZGVidWdfcHJldmlld19jb250cm9sKHN0YXJ0KSDigJQgbGFuZG1pbmUgIzE2IGRvY3VtZW50cyB0aGF0IGNvY29zIDMuOC43IHNvbWV0aW1lcyBmcmVlemVzIHRoZSBzY2VuZS1zY3JpcHQgcmVuZGVyZXIgKHNwaW5uaW5nIGluZGljYXRvciwgQ3RybCtSIHJlcXVpcmVkKS4gU3RyYXRlZ3k6IHJ1biB0d28gcHJvYmVzIGluIHBhcmFsbGVsIOKAlCAoMSkgYSBmYXN0IG5vbi1zY2VuZSBjaGFubmVsIChkZXZpY2UvcXVlcnksIGdvZXMgdG8gbWFpbiBwcm9jZXNzKSBjb25maXJtcyB0aGUgZWRpdG9yIGhvc3QgaXMgYWxpdmU7ICgyKSBhIHNjZW5lLXNjcmlwdCBldmFsICgxKzEgdHJpdmlhbCBleHByZXNzaW9uIHZpYSBleGVjdXRlLXNjZW5lLXNjcmlwdCkgd2l0aCBhIHNob3J0IHRpbWVvdXQgKGRlZmF1bHQgMTUwMG1zKSBjb25maXJtcyB0aGUgc2NlbmUgcmVuZGVyZXIgaXMgcmVzcG9uc2l2ZS4gUmV0dXJucyB7IGhvc3RBbGl2ZSwgc2NlbmVBbGl2ZSwgc2NlbmVMYXRlbmN5TXMsIHN1Z2dlc3Rpb24gfS4gQUkgd29ya2Zsb3c6IGNhbGwgYWZ0ZXIgcHJldmlld19jb250cm9sKHN0YXJ0KTsgaWYgc2NlbmVBbGl2ZT1mYWxzZSwgc3VyZmFjZSBcImNvY29zIGVkaXRvciBsaWtlbHkgZnJvemVuIOKAlCBwcmVzcyBDdHJsK1JcIiBpbnN0ZWFkIG9mIGlzc3VpbmcgbW9yZSBzY2VuZS1ib3VuZCBjYWxscyB0aGF0IHdvdWxkIGhhbmcuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBzY2VuZVRpbWVvdXRNczogei5udW1iZXIoKS5taW4oMjAwKS5tYXgoMTAwMDApLmRlZmF1bHQoMTUwMCkuZGVzY3JpYmUoJ1RpbWVvdXQgZm9yIHRoZSBzY2VuZS1zY3JpcHQgcHJvYmUgaW4gbXMuIEJlbG93IHRoaXMgc2NlbmUgaXMgY29uc2lkZXJlZCBmcm96ZW4uIERlZmF1bHQgMTUwMG1zLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy5jaGVja0VkaXRvckhlYWx0aChhLnNjZW5lVGltZW91dE1zID8/IDE1MDApLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAncHJldmlld19jb250cm9sJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1Byb2dyYW1tYXRpY2FsbHkgc3RhcnQgb3Igc3RvcCBQcmV2aWV3LWluLUVkaXRvciAoUElFKSBwbGF5IG1vZGUuIFdyYXBzIHRoZSB0eXBlZCBjY2UuU2NlbmVGYWNhZGUuY2hhbmdlUHJldmlld1BsYXlTdGF0ZSBtZXRob2QgKGRvY3VtZW50ZWQgb24gU2NlbmVGYWNhZGVNYW5hZ2VyIGluIEBjb2Nvcy9jcmVhdG9yLXR5cGVzKS4gcHJldmlld19jb250cm9sKG9wPVwic3RvcFwiKSByZXR1cm5zIHRvIHNjZW5lIG1vZGUgYW5kIGlzIHJlbGlhYmxlLiAqKldBUk5JTkcg4oCUIGNvY29zIDMuOC43IGhhcyBhbiBpbnRlcm5hbCByYWNlIGluIHNvZnRSZWxvYWRTY2VuZSB0aGF0IGZpcmVzIHJlZ2FyZGxlc3Mgb2YgcHJldmlldyBtb2RlKiogKHZlcmlmaWVkIGVtYmVkZGVkICsgYnJvd3NlcjsgdHJlYXQgYXMgZW5naW5lLXdpZGUgYnVnKS4gVGhlIGNhbGwgcmV0dXJucyBzdWNjZXNzIGJ1dCBjb2NvcyBsb2dzIFwiRmFpbGVkIHRvIHJlZnJlc2ggdGhlIGN1cnJlbnQgc2NlbmVcIiwgUElFIGRvZXMgTk9UIGFjdHVhbGx5IHN0YXJ0LCBhbmQgdGhlIGVkaXRvciBjYW4gZnJlZXplIChzcGlubmluZyBpbmRpY2F0b3IpIHJlcXVpcmluZyB1c2VyIEN0cmwrUiByZWNvdmVyeS4gU2VlIGxhbmRtaW5lICMxNiBpbiBDTEFVREUubWQuICoqUmVjb21tZW5kZWQgYWx0ZXJuYXRpdmVzKio6IChhKSBkZWJ1Z19jYXB0dXJlX3ByZXZpZXdfc2NyZWVuc2hvdChtb2RlPVwiZW1iZWRkZWRcIikgaW4gRURJVCBtb2RlIChubyBQSUUgc3RhcnQgbmVlZGVkKSDigJQgY2FwdHVyZXMgdGhlIGVkaXRvciBnYW1ldmlldyBkaXJlY3RseTsgKGIpIGRlYnVnX2dhbWVfY29tbWFuZCh0eXBlPVwic2NyZWVuc2hvdFwiKSB2aWEgR2FtZURlYnVnQ2xpZW50IHJ1bm5pbmcgaW4gYnJvd3NlciBwcmV2aWV3IOKAlCB1c2VzIHJ1bnRpbWUgY2FudmFzLCBieXBhc3NlcyB0aGUgZW5naW5lIHJhY2UgZW50aXJlbHkuIFVzZSBwcmV2aWV3X2NvbnRyb2wgb25seSB3aGVuIHRoZSBzdGFydC9zdG9wIHNpZGUgZWZmZWN0IGl0c2VsZiBpcyB0aGUgZ29hbCAoYW5kIGFjY2VwdCB0aGUgZnJlZXplIHJpc2spLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgb3A6IHouZW51bShbJ3N0YXJ0JywgJ3N0b3AnXSkuZGVzY3JpYmUoJ1wic3RhcnRcIiBlbnRlcnMgUElFIHBsYXkgbW9kZSAoZXF1aXZhbGVudCB0byBjbGlja2luZyB0aGUgdG9vbGJhciBwbGF5IGJ1dHRvbikuIFwic3RvcFwiIGV4aXRzIFBJRSBwbGF5IGFuZCByZXR1cm5zIHRvIHNjZW5lIG1vZGUuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLnByZXZpZXdDb250cm9sKGEub3ApLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnZ2V0X3NjcmlwdF9kaWFnbm9zdGljX2NvbnRleHQnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnUmVhZCBhIHdpbmRvdyBvZiBzb3VyY2UgbGluZXMgYXJvdW5kIGEgZGlhZ25vc3RpYyBsb2NhdGlvbiBzbyBBSSBjYW4gcmVhZCB0aGUgb2ZmZW5kaW5nIGNvZGUgd2l0aG91dCBhIHNlcGFyYXRlIGZpbGUgcmVhZC4gUGFpciB3aXRoIHJ1bl9zY3JpcHRfZGlhZ25vc3RpY3M6IHBhc3MgZmlsZS9saW5lIGZyb20gZWFjaCBkaWFnbm9zdGljIHRvIGZldGNoIGNvbnRleHQuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBmaWxlOiB6LnN0cmluZygpLmRlc2NyaWJlKCdBYnNvbHV0ZSBvciBwcm9qZWN0LXJlbGF0aXZlIHBhdGggdG8gdGhlIHNvdXJjZSBmaWxlLiBEaWFnbm9zdGljcyBmcm9tIHJ1bl9zY3JpcHRfZGlhZ25vc3RpY3MgYWxyZWFkeSB1c2UgYSBwYXRoIHRzYyBlbWl0dGVkLCB3aGljaCBpcyBzdWl0YWJsZSBoZXJlLicpLFxuICAgICAgICAgICAgICAgICAgICBsaW5lOiB6Lm51bWJlcigpLm1pbigxKS5kZXNjcmliZSgnMS1iYXNlZCBsaW5lIG51bWJlciB0aGF0IHRoZSBkaWFnbm9zdGljIHBvaW50cyBhdC4nKSxcbiAgICAgICAgICAgICAgICAgICAgY29udGV4dExpbmVzOiB6Lm51bWJlcigpLm1pbigwKS5tYXgoNTApLmRlZmF1bHQoNSkuZGVzY3JpYmUoJ051bWJlciBvZiBsaW5lcyB0byBpbmNsdWRlIGJlZm9yZSBhbmQgYWZ0ZXIgdGhlIHRhcmdldCBsaW5lLiBEZWZhdWx0IDUgKMKxNSDihpIgMTEtbGluZSB3aW5kb3cpLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy5nZXRTY3JpcHREaWFnbm9zdGljQ29udGV4dChhLmZpbGUsIGEubGluZSwgYS5jb250ZXh0TGluZXMpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgXTtcbiAgICAgICAgdGhpcy5leGVjID0gZGVmaW5lVG9vbHMoZGVmcyk7XG4gICAgfVxuXG4gICAgZ2V0VG9vbHMoKTogVG9vbERlZmluaXRpb25bXSB7IHJldHVybiB0aGlzLmV4ZWMuZ2V0VG9vbHMoKTsgfVxuICAgIGV4ZWN1dGUodG9vbE5hbWU6IHN0cmluZywgYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHsgcmV0dXJuIHRoaXMuZXhlYy5leGVjdXRlKHRvb2xOYW1lLCBhcmdzKTsgfVxuXG4gICAgLy8gQ29tcGF0IHBhdGg6IHByZXNlcnZlIHRoZSBwcmUtdjIuMy4wIHJlc3BvbnNlIHNoYXBlXG4gICAgLy8ge3N1Y2Nlc3MsIGRhdGE6IHtyZXN1bHQsIG1lc3NhZ2U6ICdTY3JpcHQgZXhlY3V0ZWQgc3VjY2Vzc2Z1bGx5J319XG4gICAgLy8gc28gb2xkZXIgY2FsbGVycyByZWFkaW5nIGRhdGEubWVzc2FnZSBrZWVwIHdvcmtpbmcuXG4gICAgcHJpdmF0ZSBhc3luYyBleGVjdXRlU2NyaXB0Q29tcGF0KHNjcmlwdDogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3Qgb3V0ID0gYXdhaXQgdGhpcy5leGVjdXRlSmF2YVNjcmlwdChzY3JpcHQsICdzY2VuZScpO1xuICAgICAgICBpZiAob3V0LnN1Y2Nlc3MgJiYgb3V0LmRhdGEgJiYgJ3Jlc3VsdCcgaW4gb3V0LmRhdGEpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdDogb3V0LmRhdGEucmVzdWx0LFxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiAnU2NyaXB0IGV4ZWN1dGVkIHN1Y2Nlc3NmdWxseScsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG91dDtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGNsZWFyQ29uc29sZSgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gTm90ZTogRWRpdG9yLk1lc3NhZ2Uuc2VuZCBtYXkgbm90IHJldHVybiBhIHByb21pc2UgaW4gYWxsIHZlcnNpb25zXG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5zZW5kKCdjb25zb2xlJywgJ2NsZWFyJyk7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogJ0NvbnNvbGUgY2xlYXJlZCBzdWNjZXNzZnVsbHknXG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnIubWVzc2FnZSB9O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBleGVjdXRlSmF2YVNjcmlwdChjb2RlOiBzdHJpbmcsIGNvbnRleHQ6ICdzY2VuZScgfCAnZWRpdG9yJyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGlmIChjb250ZXh0ID09PSAnc2NlbmUnKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5leGVjdXRlSW5TY2VuZUNvbnRleHQoY29kZSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGNvbnRleHQgPT09ICdlZGl0b3InKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5leGVjdXRlSW5FZGl0b3JDb250ZXh0KGNvZGUpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYFVua25vd24gZXhlY3V0ZV9qYXZhc2NyaXB0IGNvbnRleHQ6ICR7Y29udGV4dH1gIH07XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBleGVjdXRlSW5TY2VuZUNvbnRleHQoY29kZTogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdleGVjdXRlLXNjZW5lLXNjcmlwdCcsIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnY29uc29sZScsXG4gICAgICAgICAgICAgICAgbWV0aG9kOiAnZXZhbCcsXG4gICAgICAgICAgICAgICAgYXJnczogW2NvZGVdXG4gICAgICAgICAgICB9KS50aGVuKChyZXN1bHQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb250ZXh0OiAnc2NlbmUnLFxuICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0OiByZXN1bHQsXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdTY2VuZSBzY3JpcHQgZXhlY3V0ZWQgc3VjY2Vzc2Z1bGx5J1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGV4ZWN1dGVJbkVkaXRvckNvbnRleHQoY29kZTogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgaWYgKCFpc0VkaXRvckNvbnRleHRFdmFsRW5hYmxlZCgpKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgIGVycm9yOiAnRWRpdG9yIGNvbnRleHQgZXZhbCBpcyBkaXNhYmxlZC4gRW5hYmxlIGBlbmFibGVFZGl0b3JDb250ZXh0RXZhbGAgaW4gTUNQIHNlcnZlciBzZXR0aW5ncyAocGFuZWwgVUkpIHRvIG9wdCBpbi4gVGhpcyBncmFudHMgQUktZ2VuZXJhdGVkIGNvZGUgYWNjZXNzIHRvIEVkaXRvci5NZXNzYWdlICsgTm9kZSBmcyBBUElzIGluIHRoZSBob3N0IHByb2Nlc3M7IG9ubHkgZW5hYmxlIHdoZW4geW91IHRydXN0IHRoZSB1cHN0cmVhbSBwcm9tcHQgc291cmNlLicsXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBXcmFwIGluIGFzeW5jIElJRkUgc28gQUkgY2FuIHVzZSB0b3AtbGV2ZWwgYXdhaXQgdHJhbnNwYXJlbnRseTtcbiAgICAgICAgICAgIC8vIGFsc28gZ2l2ZXMgdXMgYSBjbGVhbiBQcm9taXNlLWJhc2VkIHJldHVybiBwYXRoIHJlZ2FyZGxlc3Mgb2ZcbiAgICAgICAgICAgIC8vIHdoZXRoZXIgdGhlIHVzZXIgY29kZSByZXR1cm5zIGEgUHJvbWlzZSBvciBhIHN5bmMgdmFsdWUuXG4gICAgICAgICAgICBjb25zdCB3cmFwcGVkID0gYChhc3luYyAoKSA9PiB7ICR7Y29kZX0gXFxuIH0pKClgO1xuICAgICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWV2YWxcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0ICgwLCBldmFsKSh3cmFwcGVkKTtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRleHQ6ICdlZGl0b3InLFxuICAgICAgICAgICAgICAgICAgICByZXN1bHQ6IHJlc3VsdCxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdFZGl0b3Igc2NyaXB0IGV4ZWN1dGVkIHN1Y2Nlc3NmdWxseScsXG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBlcnJvcjogYEVkaXRvciBldmFsIGZhaWxlZDogJHtlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycil9YCxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldE5vZGVUcmVlKHJvb3RVdWlkPzogc3RyaW5nLCBtYXhEZXB0aDogbnVtYmVyID0gMTApOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGJ1aWxkVHJlZSA9IGFzeW5jIChub2RlVXVpZDogc3RyaW5nLCBkZXB0aDogbnVtYmVyID0gMCk6IFByb21pc2U8YW55PiA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGRlcHRoID49IG1heERlcHRoKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7IHRydW5jYXRlZDogdHJ1ZSB9O1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG5vZGVEYXRhID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktbm9kZScsIG5vZGVVdWlkKTtcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRyZWUgPSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiBub2RlRGF0YS51dWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogbm9kZURhdGEubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGFjdGl2ZTogbm9kZURhdGEuYWN0aXZlLFxuICAgICAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50czogKG5vZGVEYXRhIGFzIGFueSkuY29tcG9uZW50cyA/IChub2RlRGF0YSBhcyBhbnkpLmNvbXBvbmVudHMubWFwKChjOiBhbnkpID0+IGMuX190eXBlX18pIDogW10sXG4gICAgICAgICAgICAgICAgICAgICAgICBjaGlsZENvdW50OiBub2RlRGF0YS5jaGlsZHJlbiA/IG5vZGVEYXRhLmNoaWxkcmVuLmxlbmd0aCA6IDAsXG4gICAgICAgICAgICAgICAgICAgICAgICBjaGlsZHJlbjogW10gYXMgYW55W11cbiAgICAgICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAobm9kZURhdGEuY2hpbGRyZW4gJiYgbm9kZURhdGEuY2hpbGRyZW4ubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBjaGlsZElkIG9mIG5vZGVEYXRhLmNoaWxkcmVuKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY2hpbGRUcmVlID0gYXdhaXQgYnVpbGRUcmVlKGNoaWxkSWQsIGRlcHRoICsgMSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHJlZS5jaGlsZHJlbi5wdXNoKGNoaWxkVHJlZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJlZTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4geyBlcnJvcjogZXJyLm1lc3NhZ2UgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBpZiAocm9vdFV1aWQpIHtcbiAgICAgICAgICAgICAgICBidWlsZFRyZWUocm9vdFV1aWQpLnRoZW4odHJlZSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoeyBzdWNjZXNzOiB0cnVlLCBkYXRhOiB0cmVlIH0pO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1oaWVyYXJjaHknKS50aGVuKGFzeW5jIChoaWVyYXJjaHk6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB0cmVlcyA9IFtdO1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IHJvb3ROb2RlIG9mIGhpZXJhcmNoeS5jaGlsZHJlbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgdHJlZSA9IGF3YWl0IGJ1aWxkVHJlZShyb290Tm9kZS51dWlkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyZWVzLnB1c2godHJlZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IHRyZWVzIH0pO1xuICAgICAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVyci5tZXNzYWdlIH0pO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldFBlcmZvcm1hbmNlU3RhdHMoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1wZXJmb3JtYW5jZScpLnRoZW4oKHN0YXRzOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBwZXJmU3RhdHM6IFBlcmZvcm1hbmNlU3RhdHMgPSB7XG4gICAgICAgICAgICAgICAgICAgIG5vZGVDb3VudDogc3RhdHMubm9kZUNvdW50IHx8IDAsXG4gICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudENvdW50OiBzdGF0cy5jb21wb25lbnRDb3VudCB8fCAwLFxuICAgICAgICAgICAgICAgICAgICBkcmF3Q2FsbHM6IHN0YXRzLmRyYXdDYWxscyB8fCAwLFxuICAgICAgICAgICAgICAgICAgICB0cmlhbmdsZXM6IHN0YXRzLnRyaWFuZ2xlcyB8fCAwLFxuICAgICAgICAgICAgICAgICAgICBtZW1vcnk6IHN0YXRzLm1lbW9yeSB8fCB7fVxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IHBlcmZTdGF0cyB9KTtcbiAgICAgICAgICAgIH0pLmNhdGNoKCgpID0+IHtcbiAgICAgICAgICAgICAgICAvLyBGYWxsYmFjayB0byBiYXNpYyBzdGF0c1xuICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiAnUGVyZm9ybWFuY2Ugc3RhdHMgbm90IGF2YWlsYWJsZSBpbiBlZGl0IG1vZGUnXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHZhbGlkYXRlU2NlbmUob3B0aW9uczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgaXNzdWVzOiBWYWxpZGF0aW9uSXNzdWVbXSA9IFtdO1xuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBDaGVjayBmb3IgbWlzc2luZyBhc3NldHNcbiAgICAgICAgICAgIGlmIChvcHRpb25zLmNoZWNrTWlzc2luZ0Fzc2V0cykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGFzc2V0Q2hlY2sgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdjaGVjay1taXNzaW5nLWFzc2V0cycpO1xuICAgICAgICAgICAgICAgIGlmIChhc3NldENoZWNrICYmIGFzc2V0Q2hlY2subWlzc2luZykge1xuICAgICAgICAgICAgICAgICAgICBpc3N1ZXMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiAnZXJyb3InLFxuICAgICAgICAgICAgICAgICAgICAgICAgY2F0ZWdvcnk6ICdhc3NldHMnLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYEZvdW5kICR7YXNzZXRDaGVjay5taXNzaW5nLmxlbmd0aH0gbWlzc2luZyBhc3NldCByZWZlcmVuY2VzYCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGRldGFpbHM6IGFzc2V0Q2hlY2subWlzc2luZ1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIENoZWNrIGZvciBwZXJmb3JtYW5jZSBpc3N1ZXNcbiAgICAgICAgICAgIGlmIChvcHRpb25zLmNoZWNrUGVyZm9ybWFuY2UpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBoaWVyYXJjaHkgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1oaWVyYXJjaHknKTtcbiAgICAgICAgICAgICAgICBjb25zdCBub2RlQ291bnQgPSB0aGlzLmNvdW50Tm9kZXMoaGllcmFyY2h5LmNoaWxkcmVuKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpZiAobm9kZUNvdW50ID4gMTAwMCkge1xuICAgICAgICAgICAgICAgICAgICBpc3N1ZXMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiAnd2FybmluZycsXG4gICAgICAgICAgICAgICAgICAgICAgICBjYXRlZ29yeTogJ3BlcmZvcm1hbmNlJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBIaWdoIG5vZGUgY291bnQ6ICR7bm9kZUNvdW50fSBub2RlcyAocmVjb21tZW5kZWQgPCAxMDAwKWAsXG4gICAgICAgICAgICAgICAgICAgICAgICBzdWdnZXN0aW9uOiAnQ29uc2lkZXIgdXNpbmcgb2JqZWN0IHBvb2xpbmcgb3Igc2NlbmUgb3B0aW1pemF0aW9uJ1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdDogVmFsaWRhdGlvblJlc3VsdCA9IHtcbiAgICAgICAgICAgICAgICB2YWxpZDogaXNzdWVzLmxlbmd0aCA9PT0gMCxcbiAgICAgICAgICAgICAgICBpc3N1ZUNvdW50OiBpc3N1ZXMubGVuZ3RoLFxuICAgICAgICAgICAgICAgIGlzc3VlczogaXNzdWVzXG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBkYXRhOiByZXN1bHQgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyLm1lc3NhZ2UgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgY291bnROb2Rlcyhub2RlczogYW55W10pOiBudW1iZXIge1xuICAgICAgICBsZXQgY291bnQgPSBub2Rlcy5sZW5ndGg7XG4gICAgICAgIGZvciAoY29uc3Qgbm9kZSBvZiBub2Rlcykge1xuICAgICAgICAgICAgaWYgKG5vZGUuY2hpbGRyZW4pIHtcbiAgICAgICAgICAgICAgICBjb3VudCArPSB0aGlzLmNvdW50Tm9kZXMobm9kZS5jaGlsZHJlbik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGNvdW50O1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2V0RWRpdG9ySW5mbygpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBpbmZvID0ge1xuICAgICAgICAgICAgZWRpdG9yOiB7XG4gICAgICAgICAgICAgICAgdmVyc2lvbjogKEVkaXRvciBhcyBhbnkpLnZlcnNpb25zPy5lZGl0b3IgfHwgJ1Vua25vd24nLFxuICAgICAgICAgICAgICAgIGNvY29zVmVyc2lvbjogKEVkaXRvciBhcyBhbnkpLnZlcnNpb25zPy5jb2NvcyB8fCAnVW5rbm93bicsXG4gICAgICAgICAgICAgICAgcGxhdGZvcm06IHByb2Nlc3MucGxhdGZvcm0sXG4gICAgICAgICAgICAgICAgYXJjaDogcHJvY2Vzcy5hcmNoLFxuICAgICAgICAgICAgICAgIG5vZGVWZXJzaW9uOiBwcm9jZXNzLnZlcnNpb25cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBwcm9qZWN0OiB7XG4gICAgICAgICAgICAgICAgbmFtZTogRWRpdG9yLlByb2plY3QubmFtZSxcbiAgICAgICAgICAgICAgICBwYXRoOiBFZGl0b3IuUHJvamVjdC5wYXRoLFxuICAgICAgICAgICAgICAgIHV1aWQ6IEVkaXRvci5Qcm9qZWN0LnV1aWRcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBtZW1vcnk6IHByb2Nlc3MubWVtb3J5VXNhZ2UoKSxcbiAgICAgICAgICAgIHVwdGltZTogcHJvY2Vzcy51cHRpbWUoKVxuICAgICAgICB9O1xuXG4gICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IGluZm8gfTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHJlc29sdmVQcm9qZWN0TG9nUGF0aCgpOiB7IHBhdGg6IHN0cmluZyB9IHwgeyBlcnJvcjogc3RyaW5nIH0ge1xuICAgICAgICBpZiAoIUVkaXRvci5Qcm9qZWN0IHx8ICFFZGl0b3IuUHJvamVjdC5wYXRoKSB7XG4gICAgICAgICAgICByZXR1cm4geyBlcnJvcjogJ0VkaXRvci5Qcm9qZWN0LnBhdGggaXMgbm90IGF2YWlsYWJsZTsgY2Fubm90IGxvY2F0ZSBwcm9qZWN0IGxvZyBmaWxlLicgfTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBsb2dQYXRoID0gcGF0aC5qb2luKEVkaXRvci5Qcm9qZWN0LnBhdGgsICd0ZW1wL2xvZ3MvcHJvamVjdC5sb2cnKTtcbiAgICAgICAgaWYgKCFmcy5leGlzdHNTeW5jKGxvZ1BhdGgpKSB7XG4gICAgICAgICAgICByZXR1cm4geyBlcnJvcjogYFByb2plY3QgbG9nIGZpbGUgbm90IGZvdW5kIGF0ICR7bG9nUGF0aH1gIH07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgcGF0aDogbG9nUGF0aCB9O1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2V0UHJvamVjdExvZ3MobGluZXM6IG51bWJlciA9IDEwMCwgZmlsdGVyS2V5d29yZD86IHN0cmluZywgbG9nTGV2ZWw6IHN0cmluZyA9ICdBTEwnKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJlc29sdmVkID0gdGhpcy5yZXNvbHZlUHJvamVjdExvZ1BhdGgoKTtcbiAgICAgICAgICAgIGlmICgnZXJyb3InIGluIHJlc29sdmVkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiByZXNvbHZlZC5lcnJvciB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgbG9nRmlsZVBhdGggPSByZXNvbHZlZC5wYXRoO1xuXG4gICAgICAgICAgICAvLyBSZWFkIHRoZSBmaWxlIGNvbnRlbnRcbiAgICAgICAgICAgIGNvbnN0IGxvZ0NvbnRlbnQgPSBmcy5yZWFkRmlsZVN5bmMobG9nRmlsZVBhdGgsICd1dGY4Jyk7XG4gICAgICAgICAgICBjb25zdCBsb2dMaW5lcyA9IGxvZ0NvbnRlbnQuc3BsaXQoJ1xcbicpLmZpbHRlcihsaW5lID0+IGxpbmUudHJpbSgpICE9PSAnJyk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIEdldCB0aGUgbGFzdCBOIGxpbmVzXG4gICAgICAgICAgICBjb25zdCByZWNlbnRMaW5lcyA9IGxvZ0xpbmVzLnNsaWNlKC1saW5lcyk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIEFwcGx5IGZpbHRlcnNcbiAgICAgICAgICAgIGxldCBmaWx0ZXJlZExpbmVzID0gcmVjZW50TGluZXM7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIEZpbHRlciBieSBsb2cgbGV2ZWwgaWYgbm90ICdBTEwnXG4gICAgICAgICAgICBpZiAobG9nTGV2ZWwgIT09ICdBTEwnKSB7XG4gICAgICAgICAgICAgICAgZmlsdGVyZWRMaW5lcyA9IGZpbHRlcmVkTGluZXMuZmlsdGVyKGxpbmUgPT4gXG4gICAgICAgICAgICAgICAgICAgIGxpbmUuaW5jbHVkZXMoYFske2xvZ0xldmVsfV1gKSB8fCBsaW5lLmluY2x1ZGVzKGxvZ0xldmVsLnRvTG93ZXJDYXNlKCkpXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gRmlsdGVyIGJ5IGtleXdvcmQgaWYgcHJvdmlkZWRcbiAgICAgICAgICAgIGlmIChmaWx0ZXJLZXl3b3JkKSB7XG4gICAgICAgICAgICAgICAgZmlsdGVyZWRMaW5lcyA9IGZpbHRlcmVkTGluZXMuZmlsdGVyKGxpbmUgPT4gXG4gICAgICAgICAgICAgICAgICAgIGxpbmUudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhmaWx0ZXJLZXl3b3JkLnRvTG93ZXJDYXNlKCkpXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgdG90YWxMaW5lczogbG9nTGluZXMubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICByZXF1ZXN0ZWRMaW5lczogbGluZXMsXG4gICAgICAgICAgICAgICAgICAgIGZpbHRlcmVkTGluZXM6IGZpbHRlcmVkTGluZXMubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICBsb2dMZXZlbDogbG9nTGV2ZWwsXG4gICAgICAgICAgICAgICAgICAgIGZpbHRlcktleXdvcmQ6IGZpbHRlcktleXdvcmQgfHwgbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgbG9nczogZmlsdGVyZWRMaW5lcyxcbiAgICAgICAgICAgICAgICAgICAgbG9nRmlsZVBhdGg6IGxvZ0ZpbGVQYXRoXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBlcnJvcjogYEZhaWxlZCB0byByZWFkIHByb2plY3QgbG9nczogJHtlcnJvci5tZXNzYWdlfWBcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldExvZ0ZpbGVJbmZvKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByZXNvbHZlZCA9IHRoaXMucmVzb2x2ZVByb2plY3RMb2dQYXRoKCk7XG4gICAgICAgICAgICBpZiAoJ2Vycm9yJyBpbiByZXNvbHZlZCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogcmVzb2x2ZWQuZXJyb3IgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGxvZ0ZpbGVQYXRoID0gcmVzb2x2ZWQucGF0aDtcblxuICAgICAgICAgICAgY29uc3Qgc3RhdHMgPSBmcy5zdGF0U3luYyhsb2dGaWxlUGF0aCk7XG4gICAgICAgICAgICBjb25zdCBsb2dDb250ZW50ID0gZnMucmVhZEZpbGVTeW5jKGxvZ0ZpbGVQYXRoLCAndXRmOCcpO1xuICAgICAgICAgICAgY29uc3QgbGluZUNvdW50ID0gbG9nQ29udGVudC5zcGxpdCgnXFxuJykuZmlsdGVyKGxpbmUgPT4gbGluZS50cmltKCkgIT09ICcnKS5sZW5ndGg7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIGZpbGVQYXRoOiBsb2dGaWxlUGF0aCxcbiAgICAgICAgICAgICAgICAgICAgZmlsZVNpemU6IHN0YXRzLnNpemUsXG4gICAgICAgICAgICAgICAgICAgIGZpbGVTaXplRm9ybWF0dGVkOiB0aGlzLmZvcm1hdEZpbGVTaXplKHN0YXRzLnNpemUpLFxuICAgICAgICAgICAgICAgICAgICBsYXN0TW9kaWZpZWQ6IHN0YXRzLm10aW1lLnRvSVNPU3RyaW5nKCksXG4gICAgICAgICAgICAgICAgICAgIGxpbmVDb3VudDogbGluZUNvdW50LFxuICAgICAgICAgICAgICAgICAgICBjcmVhdGVkOiBzdGF0cy5iaXJ0aHRpbWUudG9JU09TdHJpbmcoKSxcbiAgICAgICAgICAgICAgICAgICAgYWNjZXNzaWJsZTogZnMuY29uc3RhbnRzLlJfT0tcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgIGVycm9yOiBgRmFpbGVkIHRvIGdldCBsb2cgZmlsZSBpbmZvOiAke2Vycm9yLm1lc3NhZ2V9YFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgc2VhcmNoUHJvamVjdExvZ3MocGF0dGVybjogc3RyaW5nLCBtYXhSZXN1bHRzOiBudW1iZXIgPSAyMCwgY29udGV4dExpbmVzOiBudW1iZXIgPSAyKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJlc29sdmVkID0gdGhpcy5yZXNvbHZlUHJvamVjdExvZ1BhdGgoKTtcbiAgICAgICAgICAgIGlmICgnZXJyb3InIGluIHJlc29sdmVkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiByZXNvbHZlZC5lcnJvciB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgbG9nRmlsZVBhdGggPSByZXNvbHZlZC5wYXRoO1xuXG4gICAgICAgICAgICBjb25zdCBsb2dDb250ZW50ID0gZnMucmVhZEZpbGVTeW5jKGxvZ0ZpbGVQYXRoLCAndXRmOCcpO1xuICAgICAgICAgICAgY29uc3QgbG9nTGluZXMgPSBsb2dDb250ZW50LnNwbGl0KCdcXG4nKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gQ3JlYXRlIHJlZ2V4IHBhdHRlcm4gKHN1cHBvcnQgYm90aCBzdHJpbmcgYW5kIHJlZ2V4IHBhdHRlcm5zKVxuICAgICAgICAgICAgbGV0IHJlZ2V4OiBSZWdFeHA7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHJlZ2V4ID0gbmV3IFJlZ0V4cChwYXR0ZXJuLCAnZ2knKTtcbiAgICAgICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgICAgIC8vIElmIHBhdHRlcm4gaXMgbm90IHZhbGlkIHJlZ2V4LCB0cmVhdCBhcyBsaXRlcmFsIHN0cmluZ1xuICAgICAgICAgICAgICAgIHJlZ2V4ID0gbmV3IFJlZ0V4cChwYXR0ZXJuLnJlcGxhY2UoL1suKis/XiR7fSgpfFtcXF1cXFxcXS9nLCAnXFxcXCQmJyksICdnaScpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICBjb25zdCBtYXRjaGVzOiBhbnlbXSA9IFtdO1xuICAgICAgICAgICAgbGV0IHJlc3VsdENvdW50ID0gMDtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBsb2dMaW5lcy5sZW5ndGggJiYgcmVzdWx0Q291bnQgPCBtYXhSZXN1bHRzOyBpKyspIHtcbiAgICAgICAgICAgICAgICBjb25zdCBsaW5lID0gbG9nTGluZXNbaV07XG4gICAgICAgICAgICAgICAgaWYgKHJlZ2V4LnRlc3QobGluZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gR2V0IGNvbnRleHQgbGluZXNcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY29udGV4dFN0YXJ0ID0gTWF0aC5tYXgoMCwgaSAtIGNvbnRleHRMaW5lcyk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbnRleHRFbmQgPSBNYXRoLm1pbihsb2dMaW5lcy5sZW5ndGggLSAxLCBpICsgY29udGV4dExpbmVzKTtcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbnRleHRMaW5lc0FycmF5ID0gW107XG4gICAgICAgICAgICAgICAgICAgIGZvciAobGV0IGogPSBjb250ZXh0U3RhcnQ7IGogPD0gY29udGV4dEVuZDsgaisrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb250ZXh0TGluZXNBcnJheS5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsaW5lTnVtYmVyOiBqICsgMSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb250ZW50OiBsb2dMaW5lc1tqXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpc01hdGNoOiBqID09PSBpXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgbWF0Y2hlcy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxpbmVOdW1iZXI6IGkgKyAxLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWF0Y2hlZExpbmU6IGxpbmUsXG4gICAgICAgICAgICAgICAgICAgICAgICBjb250ZXh0OiBjb250ZXh0TGluZXNBcnJheVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdENvdW50Kys7XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAvLyBSZXNldCByZWdleCBsYXN0SW5kZXggZm9yIGdsb2JhbCBzZWFyY2hcbiAgICAgICAgICAgICAgICAgICAgcmVnZXgubGFzdEluZGV4ID0gMDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIHBhdHRlcm46IHBhdHRlcm4sXG4gICAgICAgICAgICAgICAgICAgIHRvdGFsTWF0Y2hlczogbWF0Y2hlcy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgIG1heFJlc3VsdHM6IG1heFJlc3VsdHMsXG4gICAgICAgICAgICAgICAgICAgIGNvbnRleHRMaW5lczogY29udGV4dExpbmVzLFxuICAgICAgICAgICAgICAgICAgICBsb2dGaWxlUGF0aDogbG9nRmlsZVBhdGgsXG4gICAgICAgICAgICAgICAgICAgIG1hdGNoZXM6IG1hdGNoZXNcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgIGVycm9yOiBgRmFpbGVkIHRvIHNlYXJjaCBwcm9qZWN0IGxvZ3M6ICR7ZXJyb3IubWVzc2FnZX1gXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBmb3JtYXRGaWxlU2l6ZShieXRlczogbnVtYmVyKTogc3RyaW5nIHtcbiAgICAgICAgY29uc3QgdW5pdHMgPSBbJ0InLCAnS0InLCAnTUInLCAnR0InXTtcbiAgICAgICAgbGV0IHNpemUgPSBieXRlcztcbiAgICAgICAgbGV0IHVuaXRJbmRleCA9IDA7XG5cbiAgICAgICAgd2hpbGUgKHNpemUgPj0gMTAyNCAmJiB1bml0SW5kZXggPCB1bml0cy5sZW5ndGggLSAxKSB7XG4gICAgICAgICAgICBzaXplIC89IDEwMjQ7XG4gICAgICAgICAgICB1bml0SW5kZXgrKztcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBgJHtzaXplLnRvRml4ZWQoMil9ICR7dW5pdHNbdW5pdEluZGV4XX1gO1xuICAgIH1cblxuICAgIHByaXZhdGUgcGlja1dpbmRvdyh0aXRsZVN1YnN0cmluZz86IHN0cmluZyk6IGFueSB7XG4gICAgICAgIC8vIExhenkgcmVxdWlyZSBzbyB0aGF0IG5vbi1FbGVjdHJvbiBjb250ZXh0cyAoZS5nLiB1bml0IHRlc3RzLCBzbW9rZVxuICAgICAgICAvLyBzY3JpcHQgd2l0aCBzdHViIHJlZ2lzdHJ5KSBjYW4gc3RpbGwgaW1wb3J0IHRoaXMgbW9kdWxlLlxuICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLXZhci1yZXF1aXJlc1xuICAgICAgICBjb25zdCBlbGVjdHJvbiA9IHJlcXVpcmUoJ2VsZWN0cm9uJyk7XG4gICAgICAgIGNvbnN0IEJXID0gZWxlY3Ryb24uQnJvd3NlcldpbmRvdztcbiAgICAgICAgaWYgKCFCVykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdFbGVjdHJvbiBCcm93c2VyV2luZG93IEFQSSB1bmF2YWlsYWJsZTsgc2NyZWVuc2hvdCB0b29sIHJlcXVpcmVzIHJ1bm5pbmcgaW5zaWRlIENvY29zIGVkaXRvciBob3N0IHByb2Nlc3MuJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRpdGxlU3Vic3RyaW5nKSB7XG4gICAgICAgICAgICBjb25zdCBtYXRjaGVzID0gQlcuZ2V0QWxsV2luZG93cygpLmZpbHRlcigodzogYW55KSA9PlxuICAgICAgICAgICAgICAgIHcgJiYgIXcuaXNEZXN0cm95ZWQoKSAmJiAody5nZXRUaXRsZT8uKCkgfHwgJycpLmluY2x1ZGVzKHRpdGxlU3Vic3RyaW5nKSk7XG4gICAgICAgICAgICBpZiAobWF0Y2hlcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE5vIEVsZWN0cm9uIHdpbmRvdyB0aXRsZSBtYXRjaGVkIHN1YnN0cmluZzogJHt0aXRsZVN1YnN0cmluZ31gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBtYXRjaGVzWzBdO1xuICAgICAgICB9XG4gICAgICAgIC8vIHYyLjMuMSByZXZpZXcgZml4OiBmb2N1c2VkIHdpbmRvdyBtYXkgYmUgYSB0cmFuc2llbnQgcHJldmlldyBwb3B1cC5cbiAgICAgICAgLy8gUHJlZmVyIGEgbm9uLVByZXZpZXcgd2luZG93IHNvIGRlZmF1bHQgc2NyZWVuc2hvdHMgdGFyZ2V0IHRoZSBtYWluXG4gICAgICAgIC8vIGVkaXRvciBzdXJmYWNlLiBDYWxsZXIgY2FuIHN0aWxsIHBhc3MgdGl0bGVTdWJzdHJpbmc9J1ByZXZpZXcnIHRvXG4gICAgICAgIC8vIGV4cGxpY2l0bHkgdGFyZ2V0IHRoZSBwcmV2aWV3IHdoZW4gd2FudGVkLlxuICAgICAgICBjb25zdCBhbGw6IGFueVtdID0gQlcuZ2V0QWxsV2luZG93cygpLmZpbHRlcigodzogYW55KSA9PiB3ICYmICF3LmlzRGVzdHJveWVkKCkpO1xuICAgICAgICBpZiAoYWxsLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyBsaXZlIEVsZWN0cm9uIHdpbmRvd3M7IGNhbm5vdCBjYXB0dXJlIHNjcmVlbnNob3QuJyk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgaXNQcmV2aWV3ID0gKHc6IGFueSkgPT4gL3ByZXZpZXcvaS50ZXN0KHcuZ2V0VGl0bGU/LigpIHx8ICcnKTtcbiAgICAgICAgY29uc3Qgbm9uUHJldmlldyA9IGFsbC5maWx0ZXIoKHc6IGFueSkgPT4gIWlzUHJldmlldyh3KSk7XG4gICAgICAgIGNvbnN0IGZvY3VzZWQgPSBCVy5nZXRGb2N1c2VkV2luZG93Py4oKTtcbiAgICAgICAgaWYgKGZvY3VzZWQgJiYgIWZvY3VzZWQuaXNEZXN0cm95ZWQoKSAmJiAhaXNQcmV2aWV3KGZvY3VzZWQpKSByZXR1cm4gZm9jdXNlZDtcbiAgICAgICAgaWYgKG5vblByZXZpZXcubGVuZ3RoID4gMCkgcmV0dXJuIG5vblByZXZpZXdbMF07XG4gICAgICAgIHJldHVybiBhbGxbMF07XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBlbnN1cmVDYXB0dXJlRGlyKCk6IHsgb2s6IHRydWU7IGRpcjogc3RyaW5nIH0gfCB7IG9rOiBmYWxzZTsgZXJyb3I6IHN0cmluZyB9IHtcbiAgICAgICAgaWYgKCFFZGl0b3IuUHJvamVjdCB8fCAhRWRpdG9yLlByb2plY3QucGF0aCkge1xuICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogJ0VkaXRvci5Qcm9qZWN0LnBhdGggaXMgbm90IGF2YWlsYWJsZTsgY2Fubm90IHJlc29sdmUgY2FwdHVyZSBvdXRwdXQgZGlyZWN0b3J5LicgfTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBkaXIgPSBwYXRoLmpvaW4oRWRpdG9yLlByb2plY3QucGF0aCwgJ3RlbXAnLCAnbWNwLWNhcHR1cmVzJyk7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBmcy5ta2RpclN5bmMoZGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiB0cnVlLCBkaXIgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGBGYWlsZWQgdG8gY3JlYXRlIGNhcHR1cmUgZGlyOiAke2Vycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKX1gIH07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyB2Mi44LjAgVC1WMjgtMiAoY2FycnlvdmVyIGZyb20gdjIuNy4wIENvZGV4IHNpbmdsZS1yZXZpZXdlciDwn5+hKVxuICAgIC8vIOKGkiB2Mi44LjEgcm91bmQtMSBmaXggKENvZGV4IPCflLQgKyBDbGF1ZGUg8J+foSk6IHRoZSB2Mi44LjAgaGVscGVyXG4gICAgLy8gcmVhbHBhdGgnZCBgZGlyYCBhbmQgYHBhdGguZGlybmFtZShwYXRoLmpvaW4oZGlyLCBiYXNlbmFtZSkpYCBhbmRcbiAgICAvLyBjb21wYXJlZCB0aGUgdHdvIOKAlCBidXQgd2l0aCBhIGZpeGVkIGJhc2VuYW1lIHRob3NlIGV4cHJlc3Npb25zIGJvdGhcbiAgICAvLyBjb2xsYXBzZSB0byBgZGlyYCwgbWFraW5nIHRoZSBlcXVhbGl0eSBjaGVjayB0YXV0b2xvZ2ljYWwuIFRoZSBjaGVja1xuICAgIC8vIHByb3RlY3RlZCBub3RoaW5nIGlmIGA8cHJvamVjdD4vdGVtcC9tY3AtY2FwdHVyZXNgIGl0c2VsZiB3YXMgYVxuICAgIC8vIHN5bWxpbmsgdGhhdCBlc2NhcGVzIHRoZSBwcm9qZWN0IHRyZWUuXG4gICAgLy9cbiAgICAvLyBUcnVlIGVzY2FwZSBwcm90ZWN0aW9uIHJlcXVpcmVzIGFuY2hvcmluZyBhZ2FpbnN0IHRoZSBwcm9qZWN0IHJvb3QuXG4gICAgLy8gV2Ugbm93IHJlYWxwYXRoIEJPVEggdGhlIGNhcHR1cmUgZGlyIGFuZCBgRWRpdG9yLlByb2plY3QucGF0aGAgYW5kXG4gICAgLy8gcmVxdWlyZSB0aGUgcmVzb2x2ZWQgY2FwdHVyZSBkaXIgdG8gYmUgaW5zaWRlIHRoZSByZXNvbHZlZCBwcm9qZWN0XG4gICAgLy8gcm9vdCAoZXF1YWxpdHkgT1IgYHJlYWxEaXIuc3RhcnRzV2l0aChyZWFsUHJvamVjdFJvb3QgKyBzZXApYCkuXG4gICAgLy8gVGhlIGludHJhLWRpciBjaGVjayBpcyBrZXB0IGZvciBjaGVhcCBkZWZlbnNlLWluLWRlcHRoIGluIGNhc2UgYVxuICAgIC8vIGZ1dHVyZSBiYXNlbmFtZSBnZXRzIHRyYXZlcnNhbCBjaGFyYWN0ZXJzIHRocmVhZGVkIHRocm91Z2guXG4gICAgLy9cbiAgICAvLyBSZXR1cm5zIHsgb2s6IHRydWUsIGZpbGVQYXRoLCBkaXIgfSB3aGVuIHNhZmUgdG8gd3JpdGUsIG9yXG4gICAgLy8geyBvazogZmFsc2UsIGVycm9yIH0gd2l0aCB0aGUgc2FtZSBlcnJvciBlbnZlbG9wZSBzaGFwZSBhc1xuICAgIC8vIGVuc3VyZUNhcHR1cmVEaXIgc28gY2FsbGVycyBjYW4gZmFsbCB0aHJvdWdoIHRoZWlyIGV4aXN0aW5nXG4gICAgLy8gZXJyb3ItcmV0dXJuIHBhdHRlcm4uXG4gICAgcHJpdmF0ZSByZXNvbHZlQXV0b0NhcHR1cmVGaWxlKGJhc2VuYW1lOiBzdHJpbmcpOiB7IG9rOiB0cnVlOyBmaWxlUGF0aDogc3RyaW5nOyBkaXI6IHN0cmluZyB9IHwgeyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmcgfSB7XG4gICAgICAgIGNvbnN0IGRpclJlc3VsdCA9IHRoaXMuZW5zdXJlQ2FwdHVyZURpcigpO1xuICAgICAgICBpZiAoIWRpclJlc3VsdC5vaykgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogZGlyUmVzdWx0LmVycm9yIH07XG4gICAgICAgIGNvbnN0IHByb2plY3RQYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQgPSBFZGl0b3I/LlByb2plY3Q/LnBhdGg7XG4gICAgICAgIGlmICghcHJvamVjdFBhdGgpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6ICdFZGl0b3IuUHJvamVjdC5wYXRoIGlzIG5vdCBhdmFpbGFibGU7IGNhbm5vdCBhbmNob3IgY2FwdHVyZS1kaXIgY29udGFpbm1lbnQgY2hlY2suJyB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGZpbGVQYXRoID0gcGF0aC5qb2luKGRpclJlc3VsdC5kaXIsIGJhc2VuYW1lKTtcbiAgICAgICAgbGV0IHJlYWxEaXI6IHN0cmluZztcbiAgICAgICAgbGV0IHJlYWxQYXJlbnQ6IHN0cmluZztcbiAgICAgICAgbGV0IHJlYWxQcm9qZWN0Um9vdDogc3RyaW5nO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcnA6IGFueSA9IGZzLnJlYWxwYXRoU3luYyBhcyBhbnk7XG4gICAgICAgICAgICBjb25zdCByZXNvbHZlUmVhbCA9IHJwLm5hdGl2ZSA/PyBycDtcbiAgICAgICAgICAgIHJlYWxEaXIgPSByZXNvbHZlUmVhbChkaXJSZXN1bHQuZGlyKTtcbiAgICAgICAgICAgIHJlYWxQYXJlbnQgPSByZXNvbHZlUmVhbChwYXRoLmRpcm5hbWUoZmlsZVBhdGgpKTtcbiAgICAgICAgICAgIHJlYWxQcm9qZWN0Um9vdCA9IHJlc29sdmVSZWFsKHByb2plY3RQYXRoKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGBzY3JlZW5zaG90IHBhdGggcmVhbHBhdGggZmFpbGVkOiAke2Vycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKX1gIH07XG4gICAgICAgIH1cbiAgICAgICAgLy8gRGVmZW5zZS1pbi1kZXB0aDogcGFyZW50IG9mIHRoZSByZXNvbHZlZCBmaWxlIG11c3QgZXF1YWwgdGhlXG4gICAgICAgIC8vIHJlc29sdmVkIGNhcHR1cmUgZGlyIChjYXRjaGVzIGZ1dHVyZSBiYXNlbmFtZXMgdGhyZWFkaW5nIGAuLmApLlxuICAgICAgICBpZiAocGF0aC5yZXNvbHZlKHJlYWxQYXJlbnQpICE9PSBwYXRoLnJlc29sdmUocmVhbERpcikpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6ICdzY3JlZW5zaG90IHNhdmUgcGF0aCByZXNvbHZlZCBvdXRzaWRlIHRoZSBjYXB0dXJlIGRpcmVjdG9yeScgfTtcbiAgICAgICAgfVxuICAgICAgICAvLyBQcmltYXJ5IHByb3RlY3Rpb246IGNhcHR1cmUgZGlyIGl0c2VsZiBtdXN0IHJlc29sdmUgaW5zaWRlIHRoZVxuICAgICAgICAvLyBwcm9qZWN0IHJvb3QsIHNvIGEgc3ltbGluayBjaGFpbiBvbiBgdGVtcC9tY3AtY2FwdHVyZXNgIGNhbm5vdFxuICAgICAgICAvLyBwaXZvdCB3cml0ZXMgdG8gZS5nLiAvZXRjIG9yIEM6XFxXaW5kb3dzLlxuICAgICAgICBjb25zdCByZWFsRGlyTm9ybWFsaXplZCA9IHBhdGgucmVzb2x2ZShyZWFsRGlyKTtcbiAgICAgICAgY29uc3QgcmVhbFJvb3ROb3JtYWxpemVkID0gcGF0aC5yZXNvbHZlKHJlYWxQcm9qZWN0Um9vdCk7XG4gICAgICAgIGNvbnN0IHdpdGhpblJvb3QgPSByZWFsRGlyTm9ybWFsaXplZCA9PT0gcmVhbFJvb3ROb3JtYWxpemVkXG4gICAgICAgICAgICB8fCByZWFsRGlyTm9ybWFsaXplZC5zdGFydHNXaXRoKHJlYWxSb290Tm9ybWFsaXplZCArIHBhdGguc2VwKTtcbiAgICAgICAgaWYgKCF3aXRoaW5Sb290KSB7XG4gICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBgY2FwdHVyZSBkaXIgcmVzb2x2ZWQgb3V0c2lkZSB0aGUgcHJvamVjdCByb290OiAke3JlYWxEaXJOb3JtYWxpemVkfSBub3Qgd2l0aGluICR7cmVhbFJvb3ROb3JtYWxpemVkfWAgfTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSwgZmlsZVBhdGgsIGRpcjogZGlyUmVzdWx0LmRpciB9O1xuICAgIH1cblxuICAgIC8vIHYyLjguMSByb3VuZC0xIGZpeCAoR2VtaW5pIPCflLQgKyBDb2RleCDwn5+hKTogd2hlbiBjYWxsZXIgcGFzc2VzIGFuXG4gICAgLy8gZXhwbGljaXQgc2F2ZVBhdGggLyBzYXZlUGF0aFByZWZpeCwgd2Ugc3RpbGwgbmVlZCB0aGUgc2FtZSBwcm9qZWN0LVxuICAgIC8vIHJvb3QgY29udGFpbm1lbnQgZ3VhcmFudGVlIHRoYXQgcmVzb2x2ZUF1dG9DYXB0dXJlRmlsZSBnaXZlcyB0aGVcbiAgICAvLyBhdXRvLW5hbWVkIGJyYW5jaC4gQUktZ2VuZXJhdGVkIGFic29sdXRlIHBhdGhzIGNvdWxkIG90aGVyd2lzZVxuICAgIC8vIHdyaXRlIG91dHNpZGUgdGhlIHByb2plY3Qgcm9vdC5cbiAgICAvL1xuICAgIC8vIFRoZSBjaGVjayByZXNvbHZlcyB0aGUgcGFyZW50IGRpcmVjdG9yeSAodGhlIGZpbGUgaXRzZWxmIG1heSBub3RcbiAgICAvLyBleGlzdCB5ZXQpIGFuZCByZXF1aXJlcyBpdCB0byBiZSBpbnNpZGUgYHJlYWxwYXRoKEVkaXRvci5Qcm9qZWN0LnBhdGgpYC5cbiAgICBwcml2YXRlIGFzc2VydFNhdmVQYXRoV2l0aGluUHJvamVjdChzYXZlUGF0aDogc3RyaW5nKTogeyBvazogdHJ1ZTsgcmVzb2x2ZWRQYXRoOiBzdHJpbmcgfSB8IHsgb2s6IGZhbHNlOyBlcnJvcjogc3RyaW5nIH0ge1xuICAgICAgICBjb25zdCBwcm9qZWN0UGF0aDogc3RyaW5nIHwgdW5kZWZpbmVkID0gRWRpdG9yPy5Qcm9qZWN0Py5wYXRoO1xuICAgICAgICBpZiAoIXByb2plY3RQYXRoKSB7XG4gICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiAnRWRpdG9yLlByb2plY3QucGF0aCBpcyBub3QgYXZhaWxhYmxlOyBjYW5ub3QgdmFsaWRhdGUgZXhwbGljaXQgc2F2ZVBhdGguJyB9O1xuICAgICAgICB9XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBycDogYW55ID0gZnMucmVhbHBhdGhTeW5jIGFzIGFueTtcbiAgICAgICAgICAgIGNvbnN0IHJlc29sdmVSZWFsID0gcnAubmF0aXZlID8/IHJwO1xuICAgICAgICAgICAgY29uc3QgcmVhbFByb2plY3RSb290ID0gcmVzb2x2ZVJlYWwocHJvamVjdFBhdGgpO1xuICAgICAgICAgICAgLy8gdjIuOC4yIHJldGVzdCBmaXggKENvZGV4IHIyIPCfn6EgIzEpOiBhIHJlbGF0aXZlIHNhdmVQYXRoIHdvdWxkXG4gICAgICAgICAgICAvLyBtYWtlIGBwYXRoLmRpcm5hbWUoc2F2ZVBhdGgpYCBjb2xsYXBzZSB0byAnLicgYW5kIHJlc29sdmUgdG9cbiAgICAgICAgICAgIC8vIHRoZSBob3N0IHByb2Nlc3MgY3dkIChvZnRlbiBgPGVkaXRvci1pbnN0YWxsPi9Db2Nvc0Rhc2hib2FyZGApXG4gICAgICAgICAgICAvLyByYXRoZXIgdGhhbiB0aGUgcHJvamVjdCByb290LiBBbmNob3IgcmVsYXRpdmUgcGF0aHMgYWdhaW5zdFxuICAgICAgICAgICAgLy8gdGhlIHByb2plY3Qgcm9vdCBleHBsaWNpdGx5IHNvIHRoZSBBSSdzIGludHVpdGl2ZSBcInJlbGF0aXZlXG4gICAgICAgICAgICAvLyB0byBteSBwcm9qZWN0XCIgaW50ZXJwcmV0YXRpb24gaXMgd2hhdCB0aGUgY2hlY2sgZW5mb3JjZXMuXG4gICAgICAgICAgICBjb25zdCBhYnNvbHV0ZVNhdmVQYXRoID0gcGF0aC5pc0Fic29sdXRlKHNhdmVQYXRoKVxuICAgICAgICAgICAgICAgID8gc2F2ZVBhdGhcbiAgICAgICAgICAgICAgICA6IHBhdGgucmVzb2x2ZShwcm9qZWN0UGF0aCwgc2F2ZVBhdGgpO1xuICAgICAgICAgICAgY29uc3QgcGFyZW50ID0gcGF0aC5kaXJuYW1lKGFic29sdXRlU2F2ZVBhdGgpO1xuICAgICAgICAgICAgLy8gUGFyZW50IG11c3QgYWxyZWFkeSBleGlzdCBmb3IgcmVhbHBhdGg7IGlmIGl0IGRvZXNuJ3QsIHRoZVxuICAgICAgICAgICAgLy8gd3JpdGUgd291bGQgZmFpbCBhbnl3YXksIGJ1dCByZXR1cm4gYSBjbGVhcmVyIGVycm9yIGhlcmUuXG4gICAgICAgICAgICBsZXQgcmVhbFBhcmVudDogc3RyaW5nO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICByZWFsUGFyZW50ID0gcmVzb2x2ZVJlYWwocGFyZW50KTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogYHNhdmVQYXRoIHBhcmVudCBkaXIgbWlzc2luZyBvciB1bnJlYWRhYmxlOiAke2Vycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKX1gIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCByZWFsUGFyZW50Tm9ybWFsaXplZCA9IHBhdGgucmVzb2x2ZShyZWFsUGFyZW50KTtcbiAgICAgICAgICAgIGNvbnN0IHJlYWxSb290Tm9ybWFsaXplZCA9IHBhdGgucmVzb2x2ZShyZWFsUHJvamVjdFJvb3QpO1xuICAgICAgICAgICAgY29uc3Qgd2l0aGluID0gcmVhbFBhcmVudE5vcm1hbGl6ZWQgPT09IHJlYWxSb290Tm9ybWFsaXplZFxuICAgICAgICAgICAgICAgIHx8IHJlYWxQYXJlbnROb3JtYWxpemVkLnN0YXJ0c1dpdGgocmVhbFJvb3ROb3JtYWxpemVkICsgcGF0aC5zZXApO1xuICAgICAgICAgICAgaWYgKCF3aXRoaW4pIHtcbiAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICBvazogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIGVycm9yOiBgc2F2ZVBhdGggcmVzb2x2ZWQgb3V0c2lkZSB0aGUgcHJvamVjdCByb290OiAke3JlYWxQYXJlbnROb3JtYWxpemVkfSBub3Qgd2l0aGluICR7cmVhbFJvb3ROb3JtYWxpemVkfS4gVXNlIGEgcGF0aCBpbnNpZGUgPHByb2plY3Q+LyBvciBvbWl0IHNhdmVQYXRoIHRvIGF1dG8tbmFtZSBpbnRvIDxwcm9qZWN0Pi90ZW1wL21jcC1jYXB0dXJlcy5gLFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4geyBvazogdHJ1ZSwgcmVzb2x2ZWRQYXRoOiBhYnNvbHV0ZVNhdmVQYXRoIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBgc2F2ZVBhdGggcmVhbHBhdGggZmFpbGVkOiAke2Vycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKX1gIH07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHNjcmVlbnNob3Qoc2F2ZVBhdGg/OiBzdHJpbmcsIHdpbmRvd1RpdGxlPzogc3RyaW5nLCBpbmNsdWRlQmFzZTY0OiBib29sZWFuID0gZmFsc2UpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgbGV0IGZpbGVQYXRoID0gc2F2ZVBhdGg7XG4gICAgICAgICAgICBpZiAoIWZpbGVQYXRoKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVzb2x2ZWQgPSB0aGlzLnJlc29sdmVBdXRvQ2FwdHVyZUZpbGUoYHNjcmVlbnNob3QtJHtEYXRlLm5vdygpfS5wbmdgKTtcbiAgICAgICAgICAgICAgICBpZiAoIXJlc29sdmVkLm9rKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHJlc29sdmVkLmVycm9yIH07XG4gICAgICAgICAgICAgICAgZmlsZVBhdGggPSByZXNvbHZlZC5maWxlUGF0aDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gdjIuOC4xIHJvdW5kLTEgZml4IChHZW1pbmkg8J+UtCArIENvZGV4IPCfn6EpOiBleHBsaWNpdCBzYXZlUGF0aFxuICAgICAgICAgICAgICAgIC8vIGFsc28gZ2V0cyBjb250YWlubWVudC1jaGVja2VkLiBBSS1nZW5lcmF0ZWQgcGF0aHMgY291bGRcbiAgICAgICAgICAgICAgICAvLyBvdGhlcndpc2Ugd3JpdGUgb3V0c2lkZSB0aGUgcHJvamVjdCByb290LlxuICAgICAgICAgICAgICAgIC8vIHYyLjguMiByZXRlc3QgZml4OiB1c2UgdGhlIGhlbHBlcidzIHJlc29sdmVkUGF0aCBzbyBhXG4gICAgICAgICAgICAgICAgLy8gcmVsYXRpdmUgc2F2ZVBhdGggYWN0dWFsbHkgbGFuZHMgaW5zaWRlIHRoZSBwcm9qZWN0IHJvb3QuXG4gICAgICAgICAgICAgICAgY29uc3QgZ3VhcmQgPSB0aGlzLmFzc2VydFNhdmVQYXRoV2l0aGluUHJvamVjdChmaWxlUGF0aCk7XG4gICAgICAgICAgICAgICAgaWYgKCFndWFyZC5vaykgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBndWFyZC5lcnJvciB9O1xuICAgICAgICAgICAgICAgIGZpbGVQYXRoID0gZ3VhcmQucmVzb2x2ZWRQYXRoO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3Qgd2luID0gdGhpcy5waWNrV2luZG93KHdpbmRvd1RpdGxlKTtcbiAgICAgICAgICAgIGNvbnN0IGltYWdlID0gYXdhaXQgd2luLndlYkNvbnRlbnRzLmNhcHR1cmVQYWdlKCk7XG4gICAgICAgICAgICBjb25zdCBwbmc6IEJ1ZmZlciA9IGltYWdlLnRvUE5HKCk7XG4gICAgICAgICAgICBmcy53cml0ZUZpbGVTeW5jKGZpbGVQYXRoLCBwbmcpO1xuICAgICAgICAgICAgY29uc3QgZGF0YTogYW55ID0ge1xuICAgICAgICAgICAgICAgIGZpbGVQYXRoLFxuICAgICAgICAgICAgICAgIHNpemU6IHBuZy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgd2luZG93VGl0bGU6IHR5cGVvZiB3aW4uZ2V0VGl0bGUgPT09ICdmdW5jdGlvbicgPyB3aW4uZ2V0VGl0bGUoKSA6ICcnLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGlmIChpbmNsdWRlQmFzZTY0KSB7XG4gICAgICAgICAgICAgICAgZGF0YS5kYXRhVXJpID0gYGRhdGE6aW1hZ2UvcG5nO2Jhc2U2NCwke3BuZy50b1N0cmluZygnYmFzZTY0Jyl9YDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGEsIG1lc3NhZ2U6IGBTY3JlZW5zaG90IHNhdmVkIHRvICR7ZmlsZVBhdGh9YCB9O1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycikgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIHYyLjcuMCAjNDogUHJldmlldy13aW5kb3cgc2NyZWVuc2hvdC5cbiAgICAvLyB2Mi44LjMgVC1WMjgzLTE6IGV4dGVuZGVkIHRvIGhhbmRsZSBjb2NvcyBlbWJlZGRlZCBwcmV2aWV3IG1vZGUuXG4gICAgLy9cbiAgICAvLyBNb2RlIGRpc3BhdGNoOlxuICAgIC8vICAgLSBcIndpbmRvd1wiOiAgIHJlcXVpcmUgYSBQcmV2aWV3LXRpdGxlZCBCcm93c2VyV2luZG93OyBmYWlsIGlmIG5vbmUuXG4gICAgLy8gICAgICAgICAgICAgICAgIE9yaWdpbmFsIHYyLjcuMCBiZWhhdmlvdXIuIFVzZSB3aGVuIGNvY29zIHByZXZpZXdcbiAgICAvLyAgICAgICAgICAgICAgICAgY29uZmlnIGlzIFwid2luZG93XCIgLyBcInNpbXVsYXRvclwiIChzZXBhcmF0ZSB3aW5kb3cpLlxuICAgIC8vICAgLSBcImVtYmVkZGVkXCI6IHNraXAgdGhlIHdpbmRvdyBwcm9iZSBhbmQgY2FwdHVyZSB0aGUgbWFpbiBlZGl0b3JcbiAgICAvLyAgICAgICAgICAgICAgICAgQnJvd3NlcldpbmRvdyBkaXJlY3RseS4gVXNlIHdoZW4gY29jb3MgcHJldmlldyBjb25maWdcbiAgICAvLyAgICAgICAgICAgICAgICAgaXMgXCJlbWJlZGRlZFwiIChnYW1ldmlldyByZW5kZXJzIGluc2lkZSBtYWluIGVkaXRvcikuXG4gICAgLy8gICAtIFwiYXV0b1wiOiAgICAgdHJ5IFwid2luZG93XCIgZmlyc3Q7IGlmIG5vIFByZXZpZXctdGl0bGVkIHdpbmRvdyBpc1xuICAgIC8vICAgICAgICAgICAgICAgICBmb3VuZCwgZmFsbCBiYWNrIHRvIFwiZW1iZWRkZWRcIiBhbmQgc3VyZmFjZSBhIGhpbnRcbiAgICAvLyAgICAgICAgICAgICAgICAgaW4gdGhlIHJlc3BvbnNlIG1lc3NhZ2UuIERlZmF1bHQg4oCUIGtlZXBzIHRoZSBoYXBweVxuICAgIC8vICAgICAgICAgICAgICAgICBwYXRoIHdvcmtpbmcgd2l0aG91dCBjYWxsZXIga25vd2xlZGdlIG9mIGNvY29zXG4gICAgLy8gICAgICAgICAgICAgICAgIHByZXZpZXcgY29uZmlnLlxuICAgIC8vXG4gICAgLy8gQnJvd3Nlci1tb2RlIChQSUUgcmVuZGVyZWQgdG8gdXNlcidzIGV4dGVybmFsIGJyb3dzZXIgdmlhXG4gICAgLy8gc2hlbGwub3BlbkV4dGVybmFsKSBpcyBOT1QgY2FwdHVyYWJsZSBoZXJlIOKAlCB0aGUgcGFnZSBsaXZlcyBpblxuICAgIC8vIGEgbm9uLUVsZWN0cm9uIGJyb3dzZXIgcHJvY2Vzcy4gQUkgY2FuIGRldGVjdCB0aGlzIHZpYVxuICAgIC8vIGRlYnVnX2dldF9wcmV2aWV3X21vZGUgYW5kIHNraXAgdGhlIGNhbGwuXG4gICAgcHJpdmF0ZSBhc3luYyBjYXB0dXJlUHJldmlld1NjcmVlbnNob3QoXG4gICAgICAgIHNhdmVQYXRoPzogc3RyaW5nLFxuICAgICAgICBtb2RlOiAnYXV0bycgfCAnd2luZG93JyB8ICdlbWJlZGRlZCcgPSAnYXV0bycsXG4gICAgICAgIHdpbmRvd1RpdGxlOiBzdHJpbmcgPSAnUHJldmlldycsXG4gICAgICAgIGluY2x1ZGVCYXNlNjQ6IGJvb2xlYW4gPSBmYWxzZSxcbiAgICApOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby12YXItcmVxdWlyZXNcbiAgICAgICAgICAgIGNvbnN0IGVsZWN0cm9uID0gcmVxdWlyZSgnZWxlY3Ryb24nKTtcbiAgICAgICAgICAgIGNvbnN0IEJXID0gZWxlY3Ryb24uQnJvd3NlcldpbmRvdztcblxuICAgICAgICAgICAgLy8gUmVzb2x2ZSB0aGUgdGFyZ2V0IHdpbmRvdyBwZXIgbW9kZS5cbiAgICAgICAgICAgIGNvbnN0IHByb2JlV2luZG93TW9kZSA9ICgpOiB7IG9rOiB0cnVlOyB3aW46IGFueSB9IHwgeyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmc7IHZpc2libGVUaXRsZXM6IHN0cmluZ1tdIH0gPT4ge1xuICAgICAgICAgICAgICAgIC8vIHYyLjcuMSByZXZpZXcgZml4IChjbGF1ZGUg8J+foSArIGNvZGV4IPCfn6EpOiB3aXRoIHRoZSBkZWZhdWx0XG4gICAgICAgICAgICAgICAgLy8gd2luZG93VGl0bGU9J1ByZXZpZXcnIGEgQ2hpbmVzZSAvIGxvY2FsaXplZCBjb2NvcyBlZGl0b3JcbiAgICAgICAgICAgICAgICAvLyB3aG9zZSBtYWluIHdpbmRvdyB0aXRsZSBjb250YWlucyBcIlByZXZpZXdcIiAoZS5nLiBcIkNvY29zXG4gICAgICAgICAgICAgICAgLy8gQ3JlYXRvciBQcmV2aWV3IC0gPFByb2plY3ROYW1lPlwiKSB3b3VsZCBmYWxzZWx5IG1hdGNoLlxuICAgICAgICAgICAgICAgIC8vIERpc2FtYmlndWF0ZSBieSBleGNsdWRpbmcgYW55IHRpdGxlIHRoYXQgQUxTTyBjb250YWluc1xuICAgICAgICAgICAgICAgIC8vIFwiQ29jb3MgQ3JlYXRvclwiIHdoZW4gdGhlIGNhbGxlciBzdHVjayB3aXRoIHRoZSBkZWZhdWx0LlxuICAgICAgICAgICAgICAgIGNvbnN0IHVzaW5nRGVmYXVsdCA9IHdpbmRvd1RpdGxlID09PSAnUHJldmlldyc7XG4gICAgICAgICAgICAgICAgY29uc3QgYWxsVGl0bGVzOiBzdHJpbmdbXSA9IEJXPy5nZXRBbGxXaW5kb3dzPy4oKT8ubWFwKCh3OiBhbnkpID0+IHcuZ2V0VGl0bGU/LigpID8/ICcnKS5maWx0ZXIoQm9vbGVhbikgPz8gW107XG4gICAgICAgICAgICAgICAgY29uc3QgbWF0Y2hlcyA9IEJXPy5nZXRBbGxXaW5kb3dzPy4oKT8uZmlsdGVyKCh3OiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCF3IHx8IHcuaXNEZXN0cm95ZWQoKSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB0aXRsZSA9IHcuZ2V0VGl0bGU/LigpIHx8ICcnO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXRpdGxlLmluY2x1ZGVzKHdpbmRvd1RpdGxlKSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICBpZiAodXNpbmdEZWZhdWx0ICYmIC9Db2Nvc1xccypDcmVhdG9yL2kudGVzdCh0aXRsZSkpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgfSkgPz8gW107XG4gICAgICAgICAgICAgICAgaWYgKG1hdGNoZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGBObyBFbGVjdHJvbiB3aW5kb3cgdGl0bGUgY29udGFpbnMgXCIke3dpbmRvd1RpdGxlfVwiJHt1c2luZ0RlZmF1bHQgPyAnIChhbmQgaXMgbm90IHRoZSBtYWluIGVkaXRvciknIDogJyd9LmAsIHZpc2libGVUaXRsZXM6IGFsbFRpdGxlcyB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4geyBvazogdHJ1ZSwgd2luOiBtYXRjaGVzWzBdIH07XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBjb25zdCBwcm9iZUVtYmVkZGVkTW9kZSA9ICgpOiB7IG9rOiB0cnVlOyB3aW46IGFueSB9IHwgeyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmcgfSA9PiB7XG4gICAgICAgICAgICAgICAgLy8gRW1iZWRkZWQgUElFIHJlbmRlcnMgaW5zaWRlIHRoZSBtYWluIGVkaXRvciBCcm93c2VyV2luZG93LlxuICAgICAgICAgICAgICAgIC8vIFBpY2sgdGhlIHNhbWUgaGV1cmlzdGljIGFzIHBpY2tXaW5kb3coKTogcHJlZmVyIGEgbm9uLVxuICAgICAgICAgICAgICAgIC8vIFByZXZpZXcgd2luZG93LiBDb2NvcyBtYWluIGVkaXRvcidzIHRpdGxlIHR5cGljYWxseVxuICAgICAgICAgICAgICAgIC8vIGNvbnRhaW5zIFwiQ29jb3MgQ3JlYXRvclwiIOKAlCBtYXRjaCB0aGF0IHRvIGlkZW50aWZ5IGl0LlxuICAgICAgICAgICAgICAgIGNvbnN0IGFsbDogYW55W10gPSBCVz8uZ2V0QWxsV2luZG93cz8uKCk/LmZpbHRlcigodzogYW55KSA9PiB3ICYmICF3LmlzRGVzdHJveWVkKCkpID8/IFtdO1xuICAgICAgICAgICAgICAgIGlmIChhbGwubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6ICdObyBsaXZlIEVsZWN0cm9uIHdpbmRvd3MgYXZhaWxhYmxlOyBjYW5ub3QgY2FwdHVyZSBlbWJlZGRlZCBwcmV2aWV3LicgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgLy8gUHJlZmVyIHRoZSBlZGl0b3IgbWFpbiB3aW5kb3cgKHRpdGxlIGNvbnRhaW5zIFwiQ29jb3NcbiAgICAgICAgICAgICAgICAvLyBDcmVhdG9yXCIpIOKAlCB0aGF0J3Mgd2hlcmUgZW1iZWRkZWQgUElFIHJlbmRlcnMuXG4gICAgICAgICAgICAgICAgY29uc3QgZWRpdG9yID0gYWxsLmZpbmQoKHc6IGFueSkgPT4gL0NvY29zXFxzKkNyZWF0b3IvaS50ZXN0KHcuZ2V0VGl0bGU/LigpIHx8ICcnKSk7XG4gICAgICAgICAgICAgICAgaWYgKGVkaXRvcikgcmV0dXJuIHsgb2s6IHRydWUsIHdpbjogZWRpdG9yIH07XG4gICAgICAgICAgICAgICAgLy8gRmFsbGJhY2s6IGFueSBub24tRGV2VG9vbHMgLyBub24tV29ya2VyIC8gbm9uLUJsYW5rIHdpbmRvdy5cbiAgICAgICAgICAgICAgICBjb25zdCBjYW5kaWRhdGUgPSBhbGwuZmluZCgodzogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHQgPSB3LmdldFRpdGxlPy4oKSB8fCAnJztcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHQgJiYgIS9EZXZUb29sc3xXb3JrZXIgLXxeQmxhbmskLy50ZXN0KHQpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGlmIChjYW5kaWRhdGUpIHJldHVybiB7IG9rOiB0cnVlLCB3aW46IGNhbmRpZGF0ZSB9O1xuICAgICAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6ICdObyBzdWl0YWJsZSBlZGl0b3Igd2luZG93IGZvdW5kIGZvciBlbWJlZGRlZCBwcmV2aWV3IGNhcHR1cmUuJyB9O1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgbGV0IHdpbjogYW55ID0gbnVsbDtcbiAgICAgICAgICAgIGxldCBjYXB0dXJlTm90ZTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgICAgICAgICBsZXQgcmVzb2x2ZWRNb2RlOiAnd2luZG93JyB8ICdlbWJlZGRlZCcgPSAnd2luZG93JztcblxuICAgICAgICAgICAgaWYgKG1vZGUgPT09ICd3aW5kb3cnKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgciA9IHByb2JlV2luZG93TW9kZSgpO1xuICAgICAgICAgICAgICAgIGlmICghci5vaykge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgICAgICBlcnJvcjogYCR7ci5lcnJvcn0gTGF1bmNoIGNvY29zIHByZXZpZXcgZmlyc3QgdmlhIHRoZSB0b29sYmFyIHBsYXkgYnV0dG9uIG9yIHZpYSBkZWJ1Z19wcmV2aWV3X3VybChhY3Rpb249XCJvcGVuXCIpLiBJZiB5b3VyIGNvY29zIHByZXZpZXcgaXMgc2V0IHRvIFwiZW1iZWRkZWRcIiwgY2FsbCB0aGlzIHRvb2wgd2l0aCBtb2RlPVwiZW1iZWRkZWRcIiBvciBtb2RlPVwiYXV0b1wiLiBWaXNpYmxlIHdpbmRvdyB0aXRsZXM6ICR7ci52aXNpYmxlVGl0bGVzLmpvaW4oJywgJykgfHwgJyhub25lKSd9YCxcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgd2luID0gci53aW47XG4gICAgICAgICAgICAgICAgcmVzb2x2ZWRNb2RlID0gJ3dpbmRvdyc7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKG1vZGUgPT09ICdlbWJlZGRlZCcpIHtcbiAgICAgICAgICAgICAgICBjb25zdCByID0gcHJvYmVFbWJlZGRlZE1vZGUoKTtcbiAgICAgICAgICAgICAgICBpZiAoIXIub2spIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogci5lcnJvciB9O1xuICAgICAgICAgICAgICAgIHdpbiA9IHIud2luO1xuICAgICAgICAgICAgICAgIHJlc29sdmVkTW9kZSA9ICdlbWJlZGRlZCc7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIGF1dG9cbiAgICAgICAgICAgICAgICBjb25zdCB3ciA9IHByb2JlV2luZG93TW9kZSgpO1xuICAgICAgICAgICAgICAgIGlmICh3ci5vaykge1xuICAgICAgICAgICAgICAgICAgICB3aW4gPSB3ci53aW47XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmVkTW9kZSA9ICd3aW5kb3cnO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGVyID0gcHJvYmVFbWJlZGRlZE1vZGUoKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFlci5vaykge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlcnJvcjogYCR7d3IuZXJyb3J9ICR7ZXIuZXJyb3J9IExhdW5jaCBjb2NvcyBwcmV2aWV3IGZpcnN0IG9yIGNoZWNrIGRlYnVnX2dldF9wcmV2aWV3X21vZGUgdG8gc2VlIGhvdyBjb2NvcyBpcyBjb25maWd1cmVkLiBWaXNpYmxlIHdpbmRvdyB0aXRsZXM6ICR7d3IudmlzaWJsZVRpdGxlcy5qb2luKCcsICcpIHx8ICcobm9uZSknfWAsXG4gICAgICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHdpbiA9IGVyLndpbjtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZWRNb2RlID0gJ2VtYmVkZGVkJztcbiAgICAgICAgICAgICAgICAgICAgLy8gdjIuOC40IHJldGVzdCBmaW5kaW5nOiB3aGVuIGNvY29zIHByZXZpZXcgaXMgc2V0XG4gICAgICAgICAgICAgICAgICAgIC8vIHRvIFwiYnJvd3NlclwiLCBhdXRvLWZhbGxiYWNrIEFMU08gZ3JhYnMgdGhlIG1haW5cbiAgICAgICAgICAgICAgICAgICAgLy8gZWRpdG9yIHdpbmRvdyAoYmVjYXVzZSBubyBQcmV2aWV3LXRpdGxlZCB3aW5kb3dcbiAgICAgICAgICAgICAgICAgICAgLy8gZXhpc3RzKSDigJQgYnV0IGluIGJyb3dzZXIgbW9kZSB0aGUgYWN0dWFsIGdhbWV2aWV3XG4gICAgICAgICAgICAgICAgICAgIC8vIGxpdmVzIGluIHRoZSB1c2VyJ3MgZXh0ZXJuYWwgYnJvd3NlciwgTk9UIGluIHRoZVxuICAgICAgICAgICAgICAgICAgICAvLyBjYXB0dXJlZCBFbGVjdHJvbiB3aW5kb3cuIERvbid0IGNsYWltIFwiZW1iZWRkZWRcbiAgICAgICAgICAgICAgICAgICAgLy8gcHJldmlldyBtb2RlXCIg4oCUIHRoYXQncyBhIGd1ZXNzLCBhbmQgd3Jvbmcgd2hlblxuICAgICAgICAgICAgICAgICAgICAvLyB1c2VyIGlzIG9uIGJyb3dzZXIgY29uZmlnLiBQcm9iZSB0aGUgcmVhbCBjb25maWdcbiAgICAgICAgICAgICAgICAgICAgLy8gYW5kIHRhaWxvciB0aGUgaGludCBwZXIgbW9kZS5cbiAgICAgICAgICAgICAgICAgICAgbGV0IGFjdHVhbE1vZGU6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY2ZnOiBhbnkgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICdwcmVmZXJlbmNlcycsICdxdWVyeS1jb25maWcnIGFzIGFueSwgJ3ByZXZpZXcnIGFzIGFueSxcbiAgICAgICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBwbGF0Zm9ybSA9IGNmZz8ucHJldmlldz8uY3VycmVudD8ucGxhdGZvcm07XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHBsYXRmb3JtID09PSAnc3RyaW5nJykgYWN0dWFsTW9kZSA9IHBsYXRmb3JtO1xuICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGJlc3QtZWZmb3J0OyBmYWxsIHRocm91Z2ggd2l0aCBuZXV0cmFsIGhpbnRcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZiAoYWN0dWFsTW9kZSA9PT0gJ2Jyb3dzZXInKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXB0dXJlTm90ZSA9ICdObyBQcmV2aWV3LXRpdGxlZCB3aW5kb3cgZm91bmQ7IGNhcHR1cmVkIHRoZSBtYWluIGVkaXRvciB3aW5kb3cuIE5PVEU6IGNvY29zIHByZXZpZXcgaXMgc2V0IHRvIFwiYnJvd3NlclwiIOKAlCB0aGUgYWN0dWFsIHByZXZpZXcgY29udGVudCBpcyByZW5kZXJlZCBpbiB5b3VyIGV4dGVybmFsIGJyb3dzZXIgKE5PVCBpbiB0aGlzIGltYWdlKS4gRm9yIHJ1bnRpbWUgY2FudmFzIGNhcHR1cmUgaW4gYnJvd3NlciBtb2RlIHVzZSBkZWJ1Z19nYW1lX2NvbW1hbmQodHlwZT1cInNjcmVlbnNob3RcIikgdmlhIGEgR2FtZURlYnVnQ2xpZW50IHJ1bm5pbmcgb24gdGhlIGJyb3dzZXIgcHJldmlldyBwYWdlLic7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoYWN0dWFsTW9kZSA9PT0gJ2dhbWVWaWV3Jykge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FwdHVyZU5vdGUgPSAnTm8gUHJldmlldy10aXRsZWQgd2luZG93IGZvdW5kOyBjYXB0dXJlZCB0aGUgbWFpbiBlZGl0b3Igd2luZG93IChjb2NvcyBwcmV2aWV3IGlzIHNldCB0byBcImdhbWVWaWV3XCIgZW1iZWRkZWQg4oCUIHRoZSBlZGl0b3IgZ2FtZXZpZXcgSVMgd2hlcmUgcHJldmlldyByZW5kZXJzLCBzbyB0aGlzIGltYWdlIGlzIGNvcnJlY3QpLic7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoYWN0dWFsTW9kZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FwdHVyZU5vdGUgPSBgTm8gUHJldmlldy10aXRsZWQgd2luZG93IGZvdW5kOyBjYXB0dXJlZCB0aGUgbWFpbiBlZGl0b3Igd2luZG93LiBjb2NvcyBwcmV2aWV3IGlzIHNldCB0byBcIiR7YWN0dWFsTW9kZX1cIiDigJQgdmVyaWZ5IHRoaXMgaW1hZ2UgYWN0dWFsbHkgY29udGFpbnMgdGhlIGdhbWV2aWV3IHlvdSB3YW50ZWQ7IGZvciBydW50aW1lIGNhbnZhcyBjYXB0dXJlIHByZWZlciBkZWJ1Z19nYW1lX2NvbW1hbmQgdmlhIEdhbWVEZWJ1Z0NsaWVudC5gO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FwdHVyZU5vdGUgPSAnTm8gUHJldmlldy10aXRsZWQgd2luZG93IGZvdW5kOyBjYXB0dXJlZCB0aGUgbWFpbiBlZGl0b3Igd2luZG93LiBDb3VsZCBub3QgZGV0ZXJtaW5lIGNvY29zIHByZXZpZXcgbW9kZSAoZGVidWdfZ2V0X3ByZXZpZXdfbW9kZSBtaWdodCBnaXZlIG1vcmUgaW5mbykuIElmIHlvdXIgY29jb3MgcHJldmlldyBpcyBzZXQgdG8gXCJicm93c2VyXCIsIHRoZSBhY3R1YWwgcHJldmlldyBjb250ZW50IGlzIGluIHlvdXIgZXh0ZXJuYWwgYnJvd3NlciBhbmQgaXMgTk9UIGluIHRoaXMgaW1hZ2UuJztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgbGV0IGZpbGVQYXRoID0gc2F2ZVBhdGg7XG4gICAgICAgICAgICBpZiAoIWZpbGVQYXRoKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVzb2x2ZWQgPSB0aGlzLnJlc29sdmVBdXRvQ2FwdHVyZUZpbGUoYHByZXZpZXctJHtEYXRlLm5vdygpfS5wbmdgKTtcbiAgICAgICAgICAgICAgICBpZiAoIXJlc29sdmVkLm9rKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHJlc29sdmVkLmVycm9yIH07XG4gICAgICAgICAgICAgICAgZmlsZVBhdGggPSByZXNvbHZlZC5maWxlUGF0aDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gdjIuOC4xIHJvdW5kLTEgZml4IChHZW1pbmkg8J+UtCArIENvZGV4IPCfn6EpOiBleHBsaWNpdCBzYXZlUGF0aFxuICAgICAgICAgICAgICAgIC8vIGFsc28gZ2V0cyBjb250YWlubWVudC1jaGVja2VkLlxuICAgICAgICAgICAgICAgIC8vIHYyLjguMiByZXRlc3QgZml4OiB1c2UgcmVzb2x2ZWRQYXRoIGZvciByZWxhdGl2ZS1wYXRoIHN1cHBvcnQuXG4gICAgICAgICAgICAgICAgY29uc3QgZ3VhcmQgPSB0aGlzLmFzc2VydFNhdmVQYXRoV2l0aGluUHJvamVjdChmaWxlUGF0aCk7XG4gICAgICAgICAgICAgICAgaWYgKCFndWFyZC5vaykgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBndWFyZC5lcnJvciB9O1xuICAgICAgICAgICAgICAgIGZpbGVQYXRoID0gZ3VhcmQucmVzb2x2ZWRQYXRoO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgaW1hZ2UgPSBhd2FpdCB3aW4ud2ViQ29udGVudHMuY2FwdHVyZVBhZ2UoKTtcbiAgICAgICAgICAgIGNvbnN0IHBuZzogQnVmZmVyID0gaW1hZ2UudG9QTkcoKTtcbiAgICAgICAgICAgIGZzLndyaXRlRmlsZVN5bmMoZmlsZVBhdGgsIHBuZyk7XG4gICAgICAgICAgICBjb25zdCBkYXRhOiBhbnkgPSB7XG4gICAgICAgICAgICAgICAgZmlsZVBhdGgsXG4gICAgICAgICAgICAgICAgc2l6ZTogcG5nLmxlbmd0aCxcbiAgICAgICAgICAgICAgICB3aW5kb3dUaXRsZTogdHlwZW9mIHdpbi5nZXRUaXRsZSA9PT0gJ2Z1bmN0aW9uJyA/IHdpbi5nZXRUaXRsZSgpIDogJycsXG4gICAgICAgICAgICAgICAgbW9kZTogcmVzb2x2ZWRNb2RlLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGlmIChjYXB0dXJlTm90ZSkgZGF0YS5ub3RlID0gY2FwdHVyZU5vdGU7XG4gICAgICAgICAgICBpZiAoaW5jbHVkZUJhc2U2NCkge1xuICAgICAgICAgICAgICAgIGRhdGEuZGF0YVVyaSA9IGBkYXRhOmltYWdlL3BuZztiYXNlNjQsJHtwbmcudG9TdHJpbmcoJ2Jhc2U2NCcpfWA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBtZXNzYWdlID0gY2FwdHVyZU5vdGVcbiAgICAgICAgICAgICAgICA/IGBQcmV2aWV3IHNjcmVlbnNob3Qgc2F2ZWQgdG8gJHtmaWxlUGF0aH0gKCR7Y2FwdHVyZU5vdGV9KWBcbiAgICAgICAgICAgICAgICA6IGBQcmV2aWV3IHNjcmVlbnNob3Qgc2F2ZWQgdG8gJHtmaWxlUGF0aH0gKG1vZGU9JHtyZXNvbHZlZE1vZGV9KWA7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBkYXRhLCBtZXNzYWdlIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKSB9O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gdjIuOC4zIFQtVjI4My0yOiByZWFkIGNvY29zIHByZXZpZXcgY29uZmlnIHNvIEFJIGNhbiByb3V0ZVxuICAgIC8vIGNhcHR1cmVfcHJldmlld19zY3JlZW5zaG90IHRvIHRoZSBjb3JyZWN0IG1vZGUgd2l0aG91dCBndWVzc2luZy5cbiAgICAvLyBSZWFkcyB2aWEgRWRpdG9yLk1lc3NhZ2UgcHJlZmVyZW5jZXMvcXVlcnktY29uZmlnICh0eXBlZCBpblxuICAgIC8vIG5vZGVfbW9kdWxlcy9AY29jb3MvY3JlYXRvci10eXBlcy8uLi4vcHJlZmVyZW5jZXMvQHR5cGVzL21lc3NhZ2UuZC50cykuXG4gICAgLy9cbiAgICAvLyBXZSBkdW1wIHRoZSBmdWxsICdwcmV2aWV3JyBjYXRlZ29yeSwgdGhlbiB0cnkgdG8gaW50ZXJwcmV0IGEgZmV3XG4gICAgLy8gY29tbW9uIGtleXMgKCdvcGVuX3ByZXZpZXdfd2l0aCcsICdwcmV2aWV3X3dpdGgnLCAnc2ltdWxhdG9yJyxcbiAgICAvLyAnYnJvd3NlcicpIGludG8gYSBub3JtYWxpemVkIG1vZGUgbGFiZWwuIElmIGludGVycHJldGF0aW9uIGZhaWxzLFxuICAgIC8vIHdlIHN0aWxsIHJldHVybiB0aGUgcmF3IGNvbmZpZyBzbyB0aGUgQUkgY2FuIHJlYWQgaXQgZGlyZWN0bHkuXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRQcmV2aWV3TW9kZSgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gUHJvYmUgYXQgbW9kdWxlIGxldmVsIChubyBrZXkpIHRvIGdldCB0aGUgd2hvbGUgY2F0ZWdvcnkuXG4gICAgICAgICAgICBjb25zdCByYXc6IGFueSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3ByZWZlcmVuY2VzJywgJ3F1ZXJ5LWNvbmZpZycgYXMgYW55LCAncHJldmlldycgYXMgYW55KSBhcyBhbnk7XG4gICAgICAgICAgICBpZiAocmF3ID09PSB1bmRlZmluZWQgfHwgcmF3ID09PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIGVycm9yOiAncHJlZmVyZW5jZXMvcXVlcnktY29uZmlnIHJldHVybmVkIG51bGwgZm9yIFwicHJldmlld1wiIOKAlCBjb2NvcyBtYXkgbm90IGV4cG9zZSB0aGlzIGNhdGVnb3J5LCBvciB5b3VyIGJ1aWxkIGRpZmZlcnMgZnJvbSAzLjgueC4nLFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBIZXVyaXN0aWMgaW50ZXJwcmV0YXRpb24uXG4gICAgICAgICAgICAvLyB2Mi44LjMgcmV0ZXN0IGZpbmRpbmc6IGNvY29zIDMuOC43IGFjdHVhbGx5IHN0b3JlcyB0aGVcbiAgICAgICAgICAgIC8vIGFjdGl2ZSBtb2RlIGF0IGBwcmV2aWV3LmN1cnJlbnQucGxhdGZvcm1gIHdpdGggdmFsdWVcbiAgICAgICAgICAgIC8vIGBcImdhbWVWaWV3XCJgIChlbWJlZGRlZCksIGBcImJyb3dzZXJcImAsIG9yIGRldmljZSBuYW1lc1xuICAgICAgICAgICAgLy8gKHNpbXVsYXRvcikuIFRoZSBvcmlnaW5hbCBoZXVyaXN0aWMgb25seSBjaGVja2VkIGtleXMgbGlrZVxuICAgICAgICAgICAgLy8gYG9wZW5fcHJldmlld193aXRoYCAvIGBwcmV2aWV3X3dpdGhgIC8gYG9wZW5fd2l0aGAgLyBgbW9kZWBcbiAgICAgICAgICAgIC8vIGFuZCBtaXNzZWQgdGhlIGxpdmUga2V5LiBQcm9iZSBgY3VycmVudC5wbGF0Zm9ybWAgZmlyc3Q7XG4gICAgICAgICAgICAvLyBrZWVwIHRoZSBsZWdhY3kga2V5cyBhcyBmYWxsYmFjayBmb3Igb2xkZXIgY29jb3MgdmVyc2lvbnMuXG4gICAgICAgICAgICBjb25zdCBsb3dlciA9IChzOiBhbnkpID0+ICh0eXBlb2YgcyA9PT0gJ3N0cmluZycgPyBzLnRvTG93ZXJDYXNlKCkgOiAnJyk7XG4gICAgICAgICAgICBsZXQgaW50ZXJwcmV0ZWQ6ICdicm93c2VyJyB8ICd3aW5kb3cnIHwgJ3NpbXVsYXRvcicgfCAnZW1iZWRkZWQnIHwgJ3Vua25vd24nID0gJ3Vua25vd24nO1xuICAgICAgICAgICAgbGV0IGludGVycHJldGVkRnJvbUtleTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgICAgICAgICBjb25zdCBjbGFzc2lmeSA9ICh2OiBzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBsdiA9IGxvd2VyKHYpO1xuICAgICAgICAgICAgICAgIGlmIChsdi5pbmNsdWRlcygnYnJvd3NlcicpKSByZXR1cm4gJ2Jyb3dzZXInO1xuICAgICAgICAgICAgICAgIGlmIChsdi5pbmNsdWRlcygnc2ltdWxhdG9yJykpIHJldHVybiAnc2ltdWxhdG9yJztcbiAgICAgICAgICAgICAgICBpZiAobHYuaW5jbHVkZXMoJ2VtYmVkJykgfHwgbHYuaW5jbHVkZXMoJ2dhbWV2aWV3JykgfHwgbHYuaW5jbHVkZXMoJ2dhbWVfdmlldycpKSByZXR1cm4gJ2VtYmVkZGVkJztcbiAgICAgICAgICAgICAgICBpZiAobHYuaW5jbHVkZXMoJ3dpbmRvdycpKSByZXR1cm4gJ3dpbmRvdyc7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgY29uc3QgZGlnID0gKG9iajogYW55LCBwYXRoOiBzdHJpbmcpOiBhbnkgPT4ge1xuICAgICAgICAgICAgICAgIGlmICghb2JqIHx8IHR5cGVvZiBvYmogIT09ICdvYmplY3QnKSByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIGNvbnN0IHBhcnRzID0gcGF0aC5zcGxpdCgnLicpO1xuICAgICAgICAgICAgICAgIGxldCBjdXI6IGFueSA9IG9iajtcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IHAgb2YgcGFydHMpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFjdXIgfHwgdHlwZW9mIGN1ciAhPT0gJ29iamVjdCcpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgICAgIGlmIChwIGluIGN1cikge1xuICAgICAgICAgICAgICAgICAgICAgICAgY3VyID0gY3VyW3BdO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgLy8gVHJ5IG9uZSBsZXZlbCBvZiBuZXN0IChzb21ldGltZXMgdGhlIGNhdGVnb3J5IGR1bXBcbiAgICAgICAgICAgICAgICAgICAgLy8gbmVzdHMgdW5kZXIgYSBkZWZhdWx0LXByb3RvY29sIGJ1Y2tldCkuXG4gICAgICAgICAgICAgICAgICAgIGxldCBmb3VuZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IHYgb2YgT2JqZWN0LnZhbHVlcyhjdXIpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodiAmJiB0eXBlb2YgdiA9PT0gJ29iamVjdCcgJiYgcCBpbiAodiBhcyBhbnkpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY3VyID0gKHYgYXMgYW55KVtwXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb3VuZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYgKCFmb3VuZCkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIGN1cjtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBjb25zdCBwcm9iZUtleXMgPSBbXG4gICAgICAgICAgICAgICAgJ3ByZXZpZXcuY3VycmVudC5wbGF0Zm9ybScsXG4gICAgICAgICAgICAgICAgJ2N1cnJlbnQucGxhdGZvcm0nLFxuICAgICAgICAgICAgICAgICdwcmV2aWV3Lm9wZW5fcHJldmlld193aXRoJyxcbiAgICAgICAgICAgICAgICAnb3Blbl9wcmV2aWV3X3dpdGgnLFxuICAgICAgICAgICAgICAgICdwcmV2aWV3X3dpdGgnLFxuICAgICAgICAgICAgICAgICdvcGVuX3dpdGgnLFxuICAgICAgICAgICAgICAgICdtb2RlJyxcbiAgICAgICAgICAgIF07XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGsgb2YgcHJvYmVLZXlzKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdiA9IGRpZyhyYXcsIGspO1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgdiA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY2xzID0gY2xhc3NpZnkodik7XG4gICAgICAgICAgICAgICAgICAgIGlmIChjbHMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGludGVycHJldGVkID0gY2xzO1xuICAgICAgICAgICAgICAgICAgICAgICAgaW50ZXJwcmV0ZWRGcm9tS2V5ID0gYCR7a309JHt2fWA7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAvLyBOb24tZW1wdHkgc3RyaW5nIHRoYXQgZGlkbid0IG1hdGNoIGEga25vd24gbGFiZWwg4oaSXG4gICAgICAgICAgICAgICAgICAgIC8vIHJlY29yZCBhcyAnc2ltdWxhdG9yJyBjYW5kaWRhdGUgaWYgaXQgbG9va3MgbGlrZSBhXG4gICAgICAgICAgICAgICAgICAgIC8vIGRldmljZSBuYW1lIChlLmcuIFwiQXBwbGUgaVBob25lIDE0IFByb1wiKSwgb3RoZXJ3aXNlXG4gICAgICAgICAgICAgICAgICAgIC8vIGtlZXAgc2VhcmNoaW5nLlxuICAgICAgICAgICAgICAgICAgICBpZiAoL2lQaG9uZXxpUGFkfEhVQVdFSXxYaWFvbWl8U29ueXxBc3VzfE9QUE98SG9ub3J8Tm9raWF8TGVub3ZvfFNhbXN1bmd8R29vZ2xlfFBpeGVsL2kudGVzdCh2KSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaW50ZXJwcmV0ZWQgPSAnc2ltdWxhdG9yJztcbiAgICAgICAgICAgICAgICAgICAgICAgIGludGVycHJldGVkRnJvbUtleSA9IGAke2t9PSR7dn1gO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgZGF0YTogeyBpbnRlcnByZXRlZCwgaW50ZXJwcmV0ZWRGcm9tS2V5LCByYXcgfSxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiBpbnRlcnByZXRlZCA9PT0gJ3Vua25vd24nXG4gICAgICAgICAgICAgICAgICAgID8gJ1JlYWQgY29jb3MgcHJldmlldyBjb25maWcgYnV0IGNvdWxkIG5vdCBpbnRlcnByZXQgYSBtb2RlIGxhYmVsOyBpbnNwZWN0IGRhdGEucmF3IGFuZCBwYXNzIG1vZGU9IGV4cGxpY2l0bHkgdG8gY2FwdHVyZV9wcmV2aWV3X3NjcmVlbnNob3QuJ1xuICAgICAgICAgICAgICAgICAgICA6IGBjb2NvcyBwcmV2aWV3IGlzIGNvbmZpZ3VyZWQgYXMgXCIke2ludGVycHJldGVkfVwiIChmcm9tIGtleSBcIiR7aW50ZXJwcmV0ZWRGcm9tS2V5fVwiKS4gUGFzcyBtb2RlPVwiJHtpbnRlcnByZXRlZCA9PT0gJ2Jyb3dzZXInID8gJ3dpbmRvdycgOiBpbnRlcnByZXRlZH1cIiB0byBjYXB0dXJlX3ByZXZpZXdfc2NyZWVuc2hvdCwgb3IgcmVseSBvbiBtb2RlPVwiYXV0b1wiLmAsXG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgcHJlZmVyZW5jZXMvcXVlcnktY29uZmlnICdwcmV2aWV3JyBmYWlsZWQ6ICR7ZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpfWAgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIHYyLjkuMCBULVYyOS0yOiBjb3VudGVycGFydCB0byBnZXRQcmV2aWV3TW9kZS4gV3JpdGVzXG4gICAgLy8gcHJldmlldy5jdXJyZW50LnBsYXRmb3JtIHZpYSB0aGUgdHlwZWRcbiAgICAvLyBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdwcmVmZXJlbmNlcycsICdzZXQtY29uZmlnJywgLi4uKSBjaGFubmVsLlxuICAgIC8vXG4gICAgLy8gdjIuOS4wIHJldGVzdCBmaXg6IHRoZSBpbml0aWFsIGltcGxlbWVudGF0aW9uIHBhc3NlZFxuICAgIC8vICgncHJldmlldycsICdjdXJyZW50LnBsYXRmb3JtJywgdmFsdWUpIGFuZCByZXR1cm5lZCBzdWNjZXNzIGJ1dFxuICAgIC8vIHRoZSB3cml0ZSBkaWQgTk9UIHRha2UgZWZmZWN0IOKAlCBjb2NvcydzIHNldC1jb25maWcgZG9lc24ndCBzZWVtXG4gICAgLy8gdG8gc3VwcG9ydCBkb3QtcGF0aCBrZXlzLiBTdHJhdGVnaWVzIHRyaWVkIGluIG9yZGVyOlxuICAgIC8vICAgMS4gKCdwcmV2aWV3JywgJ2N1cnJlbnQnLCB7IHBsYXRmb3JtOiB2YWx1ZSB9KSAg4oCUIG5lc3RlZCBvYmplY3RcbiAgICAvLyAgIDIuICgncHJldmlldycsICdjdXJyZW50LnBsYXRmb3JtJywgdmFsdWUsICdnbG9iYWwnKSDigJQgZXhwbGljaXQgcHJvdG9jb2xcbiAgICAvLyAgIDMuICgncHJldmlldycsICdjdXJyZW50LnBsYXRmb3JtJywgdmFsdWUsICdsb2NhbCcpICDigJQgZXhwbGljaXQgcHJvdG9jb2xcbiAgICAvLyAgIDQuICgncHJldmlldycsICdjdXJyZW50LnBsYXRmb3JtJywgdmFsdWUpICAgICAgICAgIOKAlCBubyBwcm90b2NvbCAob3JpZ2luYWwpXG4gICAgLy8gRWFjaCBhdHRlbXB0IGlzIGZvbGxvd2VkIGJ5IGEgZnJlc2ggcXVlcnktY29uZmlnIHRvIHZlcmlmeSB0aGVcbiAgICAvLyB2YWx1ZSBhY3R1YWxseSBmbGlwcGVkLiBXZSByZXR1cm4gdGhlIHN0cmF0ZWd5IHRoYXQgd29ya2VkIHBsdXNcbiAgICAvLyB0aGUgcmF3IHNldC1jb25maWcgcmV0dXJuIGZvciBkaWFnbm9zdGljcy5cbiAgICAvL1xuICAgIC8vIENvbmZpcm0gZ2F0ZTogYGNvbmZpcm09ZmFsc2VgIChkZWZhdWx0KSBpcyBhIGRyeS1ydW4gdGhhdCByZXR1cm5zXG4gICAgLy8gdGhlIGN1cnJlbnQgdmFsdWUgKyBzdWdnZXN0ZWQgY2FsbC4gYGNvbmZpcm09dHJ1ZWAgYWN0dWFsbHlcbiAgICAvLyB3cml0ZXMuIFRoaXMgYXZvaWRzIEFJLWluZHVjZWQgcHJlZmVyZW5jZSBkcmlmdCB3aGVuIHRoZSBMTE0gaXNcbiAgICAvLyBleHBsb3JpbmcgdG9vbCBjYXBhYmlsaXRpZXMuXG4gICAgcHJpdmF0ZSBhc3luYyBzZXRQcmV2aWV3TW9kZShtb2RlOiAnYnJvd3NlcicgfCAnZ2FtZVZpZXcnIHwgJ3NpbXVsYXRvcicsIGNvbmZpcm06IGJvb2xlYW4pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcXVlcnlDdXJyZW50ID0gYXN5bmMgKCk6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4gPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGNmZzogYW55ID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgncHJlZmVyZW5jZXMnLCAncXVlcnktY29uZmlnJyBhcyBhbnksICdwcmV2aWV3JyBhcyBhbnkpIGFzIGFueTtcbiAgICAgICAgICAgICAgICByZXR1cm4gY2ZnPy5wcmV2aWV3Py5jdXJyZW50Py5wbGF0Zm9ybSA/PyBudWxsO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGNvbnN0IHByZXZpb3VzTW9kZSA9IGF3YWl0IHF1ZXJ5Q3VycmVudCgpO1xuICAgICAgICAgICAgaWYgKCFjb25maXJtKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgZGF0YTogeyBwcmV2aW91c01vZGUsIHJlcXVlc3RlZE1vZGU6IG1vZGUsIGNvbmZpcm1lZDogZmFsc2UgfSxcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYERyeSBydW4gb25seSDigJQgY3VycmVudCBjb2NvcyBwcmV2aWV3IG1vZGUgaXMgXCIke3ByZXZpb3VzTW9kZSA/PyAndW5rbm93bid9XCIsIHJlcXVlc3RlZCBcIiR7bW9kZX1cIi4gUmUtY2FsbCB3aXRoIGNvbmZpcm09dHJ1ZSB0byBhY3R1YWxseSBzd2l0Y2guIENhbGxlciBpcyByZXNwb25zaWJsZSBmb3IgcmVzdG9yaW5nIHRoZSBvcmlnaW5hbCBtb2RlIHdoZW4gZG9uZSBpZiBhcHByb3ByaWF0ZS5gLFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocHJldmlvdXNNb2RlID09PSBtb2RlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgZGF0YTogeyBwcmV2aW91c01vZGUsIG5ld01vZGU6IG1vZGUsIGNvbmZpcm1lZDogdHJ1ZSwgbm9PcDogdHJ1ZSB9LFxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgY29jb3MgcHJldmlldyBhbHJlYWR5IHNldCB0byBcIiR7bW9kZX1cIjsgbm8gY2hhbmdlIGFwcGxpZWQuYCxcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdHlwZSBTdHJhdGVneSA9IHsgaWQ6IHN0cmluZzsgcGF5bG9hZDogKCkgPT4gUHJvbWlzZTxhbnk+IH07XG4gICAgICAgICAgICBjb25zdCBzdHJhdGVnaWVzOiBTdHJhdGVneVtdID0gW1xuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgaWQ6IFwic2V0LWNvbmZpZygncHJldmlldycsJ2N1cnJlbnQnLHtwbGF0Zm9ybTp2YWx1ZX0pXCIsXG4gICAgICAgICAgICAgICAgICAgIHBheWxvYWQ6ICgpID0+IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoXG4gICAgICAgICAgICAgICAgICAgICAgICAncHJlZmVyZW5jZXMnLCAnc2V0LWNvbmZpZycgYXMgYW55LFxuICAgICAgICAgICAgICAgICAgICAgICAgJ3ByZXZpZXcnIGFzIGFueSwgJ2N1cnJlbnQnIGFzIGFueSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHsgcGxhdGZvcm06IG1vZGUgfSBhcyBhbnksXG4gICAgICAgICAgICAgICAgICAgICksXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIGlkOiBcInNldC1jb25maWcoJ3ByZXZpZXcnLCdjdXJyZW50LnBsYXRmb3JtJyx2YWx1ZSwnZ2xvYmFsJylcIixcbiAgICAgICAgICAgICAgICAgICAgcGF5bG9hZDogKCkgPT4gRWRpdG9yLk1lc3NhZ2UucmVxdWVzdChcbiAgICAgICAgICAgICAgICAgICAgICAgICdwcmVmZXJlbmNlcycsICdzZXQtY29uZmlnJyBhcyBhbnksXG4gICAgICAgICAgICAgICAgICAgICAgICAncHJldmlldycgYXMgYW55LCAnY3VycmVudC5wbGF0Zm9ybScgYXMgYW55LFxuICAgICAgICAgICAgICAgICAgICAgICAgbW9kZSBhcyBhbnksICdnbG9iYWwnIGFzIGFueSxcbiAgICAgICAgICAgICAgICAgICAgKSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgaWQ6IFwic2V0LWNvbmZpZygncHJldmlldycsJ2N1cnJlbnQucGxhdGZvcm0nLHZhbHVlLCdsb2NhbCcpXCIsXG4gICAgICAgICAgICAgICAgICAgIHBheWxvYWQ6ICgpID0+IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoXG4gICAgICAgICAgICAgICAgICAgICAgICAncHJlZmVyZW5jZXMnLCAnc2V0LWNvbmZpZycgYXMgYW55LFxuICAgICAgICAgICAgICAgICAgICAgICAgJ3ByZXZpZXcnIGFzIGFueSwgJ2N1cnJlbnQucGxhdGZvcm0nIGFzIGFueSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1vZGUgYXMgYW55LCAnbG9jYWwnIGFzIGFueSxcbiAgICAgICAgICAgICAgICAgICAgKSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgaWQ6IFwic2V0LWNvbmZpZygncHJldmlldycsJ2N1cnJlbnQucGxhdGZvcm0nLHZhbHVlKVwiLFxuICAgICAgICAgICAgICAgICAgICBwYXlsb2FkOiAoKSA9PiBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KFxuICAgICAgICAgICAgICAgICAgICAgICAgJ3ByZWZlcmVuY2VzJywgJ3NldC1jb25maWcnIGFzIGFueSxcbiAgICAgICAgICAgICAgICAgICAgICAgICdwcmV2aWV3JyBhcyBhbnksICdjdXJyZW50LnBsYXRmb3JtJyBhcyBhbnksXG4gICAgICAgICAgICAgICAgICAgICAgICBtb2RlIGFzIGFueSxcbiAgICAgICAgICAgICAgICAgICAgKSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgXTtcbiAgICAgICAgICAgIGNvbnN0IGF0dGVtcHRzOiBBcnJheTx7IHN0cmF0ZWd5OiBzdHJpbmc7IHNldFJlc3VsdDogYW55OyBvYnNlcnZlZE1vZGU6IHN0cmluZyB8IG51bGw7IG1hdGNoZWQ6IGJvb2xlYW47IGVycm9yPzogc3RyaW5nIH0+ID0gW107XG4gICAgICAgICAgICBsZXQgd2lubmVyOiB0eXBlb2YgYXR0ZW1wdHNbbnVtYmVyXSB8IG51bGwgPSBudWxsO1xuICAgICAgICAgICAgZm9yIChjb25zdCBzIG9mIHN0cmF0ZWdpZXMpIHtcbiAgICAgICAgICAgICAgICBsZXQgc2V0UmVzdWx0OiBhbnkgPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgbGV0IGVycm9yOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgc2V0UmVzdWx0ID0gYXdhaXQgcy5wYXlsb2FkKCk7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgICAgICAgICAgZXJyb3IgPSBlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IG9ic2VydmVkTW9kZSA9IGF3YWl0IHF1ZXJ5Q3VycmVudCgpO1xuICAgICAgICAgICAgICAgIGNvbnN0IG1hdGNoZWQgPSBvYnNlcnZlZE1vZGUgPT09IG1vZGU7XG4gICAgICAgICAgICAgICAgYXR0ZW1wdHMucHVzaCh7IHN0cmF0ZWd5OiBzLmlkLCBzZXRSZXN1bHQsIG9ic2VydmVkTW9kZSwgbWF0Y2hlZCwgZXJyb3IgfSk7XG4gICAgICAgICAgICAgICAgaWYgKG1hdGNoZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgd2lubmVyID0gYXR0ZW1wdHNbYXR0ZW1wdHMubGVuZ3RoIC0gMV07XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghd2lubmVyKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIGVycm9yOiBgc2V0LWNvbmZpZyBzdHJhdGVnaWVzIGFsbCBmYWlsZWQgdG8gZmxpcCBwcmV2aWV3LmN1cnJlbnQucGxhdGZvcm0gZnJvbSBcIiR7cHJldmlvdXNNb2RlID8/ICd1bmtub3duJ31cIiB0byBcIiR7bW9kZX1cIi4gVHJpZWQgNCBzaGFwZXM7IGNvY29zIHJldHVybmVkIHZhbHVlcyBidXQgdGhlIHJlYWQtYmFjayBuZXZlciBtYXRjaGVkIHRoZSByZXF1ZXN0ZWQgbW9kZS4gVGhlIHNldC1jb25maWcgY2hhbm5lbCBtYXkgaGF2ZSBjaGFuZ2VkIGluIHRoaXMgY29jb3MgYnVpbGQ7IHN3aXRjaCB2aWEgdGhlIGNvY29zIHByZXZpZXcgZHJvcGRvd24gbWFudWFsbHkgZm9yIG5vdyBhbmQgcmVwb3J0IHdoaWNoIHNoYXBlIHdvcmtzLmAsXG4gICAgICAgICAgICAgICAgICAgIGRhdGE6IHsgcHJldmlvdXNNb2RlLCByZXF1ZXN0ZWRNb2RlOiBtb2RlLCBhdHRlbXB0cyB9LFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgZGF0YTogeyBwcmV2aW91c01vZGUsIG5ld01vZGU6IG1vZGUsIGNvbmZpcm1lZDogdHJ1ZSwgc3RyYXRlZ3k6IHdpbm5lci5zdHJhdGVneSwgYXR0ZW1wdHMgfSxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiBgY29jb3MgcHJldmlldyBzd2l0Y2hlZDogXCIke3ByZXZpb3VzTW9kZSA/PyAndW5rbm93bid9XCIg4oaSIFwiJHttb2RlfVwiIHZpYSAke3dpbm5lci5zdHJhdGVneX0uIFJlc3RvcmUgdmlhIGRlYnVnX3NldF9wcmV2aWV3X21vZGUobW9kZT1cIiR7cHJldmlvdXNNb2RlID8/ICdicm93c2VyJ31cIiwgY29uZmlybT10cnVlKSB3aGVuIGRvbmUgaWYgbmVlZGVkLmAsXG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgcHJlZmVyZW5jZXMvc2V0LWNvbmZpZyAncHJldmlldycgZmFpbGVkOiAke2Vycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKX1gIH07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGJhdGNoU2NyZWVuc2hvdChzYXZlUGF0aFByZWZpeD86IHN0cmluZywgZGVsYXlzTXM6IG51bWJlcltdID0gWzBdLCB3aW5kb3dUaXRsZT86IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBsZXQgcHJlZml4ID0gc2F2ZVBhdGhQcmVmaXg7XG4gICAgICAgICAgICBpZiAoIXByZWZpeCkge1xuICAgICAgICAgICAgICAgIC8vIGJhc2VuYW1lIGlzIHRoZSBwcmVmaXggc3RlbTsgcGVyLWl0ZXJhdGlvbiBmaWxlcyBleHRlbmQgaXRcbiAgICAgICAgICAgICAgICAvLyB3aXRoIGAtJHtpfS5wbmdgLiBDb250YWlubWVudCBjaGVjayBvbiB0aGUgcHJlZml4IHBhdGggaXNcbiAgICAgICAgICAgICAgICAvLyBzdWZmaWNpZW50IGJlY2F1c2UgcGF0aC5qb2luIHByZXNlcnZlcyBkaXJuYW1lIGZvciBhbnlcbiAgICAgICAgICAgICAgICAvLyBzdWZmaXggdGhlIGxvb3AgYXBwZW5kcy5cbiAgICAgICAgICAgICAgICBjb25zdCByZXNvbHZlZCA9IHRoaXMucmVzb2x2ZUF1dG9DYXB0dXJlRmlsZShgYmF0Y2gtJHtEYXRlLm5vdygpfWApO1xuICAgICAgICAgICAgICAgIGlmICghcmVzb2x2ZWQub2spIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogcmVzb2x2ZWQuZXJyb3IgfTtcbiAgICAgICAgICAgICAgICBwcmVmaXggPSByZXNvbHZlZC5maWxlUGF0aDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gdjIuOC4xIHJvdW5kLTEgZml4IChHZW1pbmkg8J+UtCArIENvZGV4IPCfn6EpOiBleHBsaWNpdCBwcmVmaXhcbiAgICAgICAgICAgICAgICAvLyBhbHNvIGdldHMgY29udGFpbm1lbnQtY2hlY2tlZC4gV2UgY2hlY2sgdGhlIHByZWZpeCBwYXRoXG4gICAgICAgICAgICAgICAgLy8gaXRzZWxmIOKAlCBldmVyeSBlbWl0dGVkIGZpbGUgbGl2ZXMgaW4gdGhlIHNhbWUgZGlybmFtZS5cbiAgICAgICAgICAgICAgICAvLyB2Mi44LjIgcmV0ZXN0IGZpeDogdXNlIHJlc29sdmVkUGF0aCBmb3IgcmVsYXRpdmUtcHJlZml4IHN1cHBvcnQuXG4gICAgICAgICAgICAgICAgY29uc3QgZ3VhcmQgPSB0aGlzLmFzc2VydFNhdmVQYXRoV2l0aGluUHJvamVjdChwcmVmaXgpO1xuICAgICAgICAgICAgICAgIGlmICghZ3VhcmQub2spIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZ3VhcmQuZXJyb3IgfTtcbiAgICAgICAgICAgICAgICBwcmVmaXggPSBndWFyZC5yZXNvbHZlZFBhdGg7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCB3aW4gPSB0aGlzLnBpY2tXaW5kb3cod2luZG93VGl0bGUpO1xuICAgICAgICAgICAgY29uc3QgY2FwdHVyZXM6IGFueVtdID0gW107XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGRlbGF5c01zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZGVsYXkgPSBkZWxheXNNc1tpXTtcbiAgICAgICAgICAgICAgICBpZiAoZGVsYXkgPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCBkZWxheSkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBmaWxlUGF0aCA9IGAke3ByZWZpeH0tJHtpfS5wbmdgO1xuICAgICAgICAgICAgICAgIGNvbnN0IGltYWdlID0gYXdhaXQgd2luLndlYkNvbnRlbnRzLmNhcHR1cmVQYWdlKCk7XG4gICAgICAgICAgICAgICAgY29uc3QgcG5nOiBCdWZmZXIgPSBpbWFnZS50b1BORygpO1xuICAgICAgICAgICAgICAgIGZzLndyaXRlRmlsZVN5bmMoZmlsZVBhdGgsIHBuZyk7XG4gICAgICAgICAgICAgICAgY2FwdHVyZXMucHVzaCh7IGluZGV4OiBpLCBkZWxheU1zOiBkZWxheSwgZmlsZVBhdGgsIHNpemU6IHBuZy5sZW5ndGggfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICBjb3VudDogY2FwdHVyZXMubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICB3aW5kb3dUaXRsZTogdHlwZW9mIHdpbi5nZXRUaXRsZSA9PT0gJ2Z1bmN0aW9uJyA/IHdpbi5nZXRUaXRsZSgpIDogJycsXG4gICAgICAgICAgICAgICAgICAgIGNhcHR1cmVzLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogYENhcHR1cmVkICR7Y2FwdHVyZXMubGVuZ3RofSBzY3JlZW5zaG90c2AsXG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycikgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIHYyLjcuMCAjMzogcHJldmlldy11cmwgLyBxdWVyeS1kZXZpY2VzIGhhbmRsZXJzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gICAgcHJpdmF0ZSBhc3luYyBwcmV2aWV3VXJsKGFjdGlvbjogJ3F1ZXJ5JyB8ICdvcGVuJyA9ICdxdWVyeScpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgdXJsOiBzdHJpbmcgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdwcmV2aWV3JywgJ3F1ZXJ5LXByZXZpZXctdXJsJyBhcyBhbnkpIGFzIGFueTtcbiAgICAgICAgICAgIGlmICghdXJsIHx8IHR5cGVvZiB1cmwgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAncHJldmlldy9xdWVyeS1wcmV2aWV3LXVybCByZXR1cm5lZCBlbXB0eSByZXN1bHQ7IGNoZWNrIHRoYXQgY29jb3MgcHJldmlldyBzZXJ2ZXIgaXMgcnVubmluZycgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGRhdGE6IGFueSA9IHsgdXJsIH07XG4gICAgICAgICAgICBpZiAoYWN0aW9uID09PSAnb3BlbicpIHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAvLyBMYXp5IHJlcXVpcmUgc28gc21va2UgLyBub24tRWxlY3Ryb24gY29udGV4dHMgZG9uJ3QgZmF1bHRcbiAgICAgICAgICAgICAgICAgICAgLy8gb24gbWlzc2luZyBlbGVjdHJvbi5cbiAgICAgICAgICAgICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby12YXItcmVxdWlyZXNcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZWxlY3Ryb24gPSByZXF1aXJlKCdlbGVjdHJvbicpO1xuICAgICAgICAgICAgICAgICAgICAvLyB2Mi43LjEgcmV2aWV3IGZpeCAoY29kZXgg8J+foSArIGdlbWluaSDwn5+hKTogb3BlbkV4dGVybmFsXG4gICAgICAgICAgICAgICAgICAgIC8vIHJlc29sdmVzIHdoZW4gdGhlIE9TIGxhdW5jaGVyIGlzIGludm9rZWQsIG5vdCB3aGVuIHRoZVxuICAgICAgICAgICAgICAgICAgICAvLyBwYWdlIHJlbmRlcnMuIFVzZSBcImxhdW5jaFwiIHdvcmRpbmcgdG8gYXZvaWQgdGhlIEFJXG4gICAgICAgICAgICAgICAgICAgIC8vIG1pc3JlYWRpbmcgXCJvcGVuZWRcIiBhcyBhIGNvbmZpcm1lZCBwYWdlLWxvYWQuXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IGVsZWN0cm9uLnNoZWxsLm9wZW5FeHRlcm5hbCh1cmwpO1xuICAgICAgICAgICAgICAgICAgICBkYXRhLmxhdW5jaGVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgICAgICAgICBkYXRhLmxhdW5jaGVkID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIGRhdGEubGF1bmNoRXJyb3IgPSBlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gUmVmbGVjdCBhY3R1YWwgbGF1bmNoIG91dGNvbWUgaW4gdGhlIHRvcC1sZXZlbCBtZXNzYWdlIHNvIEFJXG4gICAgICAgICAgICAvLyBzZWVzIFwibGF1bmNoIGZhaWxlZFwiIGluc3RlYWQgb2YgbWlzbGVhZGluZyBcIk9wZW5lZCAuLi5cIiB3aGVuXG4gICAgICAgICAgICAvLyBvcGVuRXh0ZXJuYWwgdGhyZXcgKGdlbWluaSDwn5+hKS5cbiAgICAgICAgICAgIGNvbnN0IG1lc3NhZ2UgPSBhY3Rpb24gPT09ICdvcGVuJ1xuICAgICAgICAgICAgICAgID8gKGRhdGEubGF1bmNoZWRcbiAgICAgICAgICAgICAgICAgICAgPyBgTGF1bmNoZWQgJHt1cmx9IGluIGRlZmF1bHQgYnJvd3NlciAocGFnZSByZW5kZXIgbm90IGF3YWl0ZWQpYFxuICAgICAgICAgICAgICAgICAgICA6IGBSZXR1cm5lZCBVUkwgJHt1cmx9IGJ1dCBsYXVuY2ggZmFpbGVkOiAke2RhdGEubGF1bmNoRXJyb3J9YClcbiAgICAgICAgICAgICAgICA6IHVybDtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGEsIG1lc3NhZ2UgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpIH07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyB2Mi44LjAgVC1WMjgtMzogUElFIHBsYXkgLyBzdG9wLiBSb3V0ZXMgdGhyb3VnaCBzY2VuZS1zY3JpcHQgc28gdGhlXG4gICAgLy8gdHlwZWQgY2NlLlNjZW5lRmFjYWRlLmNoYW5nZVByZXZpZXdQbGF5U3RhdGUgaXMgcmVhY2hlZCB2aWEgdGhlXG4gICAgLy8gZG9jdW1lbnRlZCBleGVjdXRlLXNjZW5lLXNjcmlwdCBjaGFubmVsLlxuICAgIC8vXG4gICAgLy8gdjIuOC4zIFQtVjI4My0zIHJldGVzdCBmaW5kaW5nOiBjb2NvcyBzb21ldGltZXMgbG9nc1xuICAgIC8vIFwiRmFpbGVkIHRvIHJlZnJlc2ggdGhlIGN1cnJlbnQgc2NlbmVcIiBpbnNpZGUgY2hhbmdlUHJldmlld1BsYXlTdGF0ZVxuICAgIC8vIGV2ZW4gd2hlbiB0aGUgY2FsbCByZXR1cm5zIHdpdGhvdXQgdGhyb3dpbmcuIE9ic2VydmVkIGluIGNvY29zXG4gICAgLy8gMy44LjcgLyBlbWJlZGRlZCBwcmV2aWV3IG1vZGUuIFRoZSByb290IGNhdXNlIGlzIHVuY2xlYXIgKG1heVxuICAgIC8vIHJlbGF0ZSB0byBjdW11bGF0aXZlIHNjZW5lLWRpcnR5IC8gZW1iZWRkZWQtbW9kZSB0aW1pbmcgL1xuICAgIC8vIGluaXRpYWwtbG9hZCBjb21wbGFpbnQpLCBidXQgdGhlIHZpc2libGUgZWZmZWN0IGlzIHRoYXQgUElFIHN0YXRlXG4gICAgLy8gY2hhbmdlcyBpbmNvbXBsZXRlbHkuIFdlIG5vdyBTQ0FOIHRoZSBjYXB0dXJlZCBzY2VuZS1zY3JpcHQgbG9nc1xuICAgIC8vIGZvciB0aGF0IGVycm9yIHN0cmluZyBhbmQgc3VyZmFjZSBpdCB0byB0aGUgQUkgYXMgYSBzdHJ1Y3R1cmVkXG4gICAgLy8gd2FybmluZyBpbnN0ZWFkIG9mIGxldHRpbmcgaXQgaGlkZSBpbnNpZGUgZGF0YS5jYXB0dXJlZExvZ3MuXG4gICAgLy8gdjIuOS4wIFQtVjI5LTE6IGVkaXRvci1oZWFsdGggcHJvYmUuIERldGVjdHMgc2NlbmUtc2NyaXB0IGZyZWV6ZVxuICAgIC8vIGJ5IHJ1bm5pbmcgdHdvIHByb2JlcyBpbiBwYXJhbGxlbDpcbiAgICAvLyAgIC0gaG9zdCBwcm9iZTogRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnZGV2aWNlJywgJ3F1ZXJ5Jykg4oCUIGdvZXNcbiAgICAvLyAgICAgdG8gdGhlIGVkaXRvciBtYWluIHByb2Nlc3MsIE5PVCB0aGUgc2NlbmUtc2NyaXB0IHJlbmRlcmVyLlxuICAgIC8vICAgICBUaGlzIHN0YXlzIHJlc3BvbnNpdmUgZXZlbiB3aGVuIHNjZW5lIGlzIHdlZGdlZC5cbiAgICAvLyAgIC0gc2NlbmUgcHJvYmU6IGV4ZWN1dGUtc2NlbmUtc2NyaXB0IGludm9jYXRpb24gd2l0aCBhIHRyaXZpYWxcbiAgICAvLyAgICAgYGV2YWxFY2hvYCB0ZXN0ICh1c2VzIGFuIGV4aXN0aW5nIHNhZmUgc2NlbmUgbWV0aG9kLCB3aXRoXG4gICAgLy8gICAgIHdyYXBwaW5nIHRpbWVvdXQpLiBUaW1lcyBvdXQg4oaSIHNjZW5lLXNjcmlwdCBmcm96ZW4uXG4gICAgLy9cbiAgICAvLyBEZXNpZ25lZCBmb3IgdGhlIHBvc3QtcHJldmlld19jb250cm9sKHN0YXJ0KSBmcmVlemUgcGF0dGVybiBpblxuICAgIC8vIGxhbmRtaW5lICMxNjogQUkgY2FsbHMgcHJldmlld19jb250cm9sKHN0YXJ0KSwgdGhlblxuICAgIC8vIGNoZWNrX2VkaXRvcl9oZWFsdGgsIGFuZCBpZiBzY2VuZUFsaXZlPWZhbHNlIHN0b3BzIGlzc3VpbmcgbW9yZVxuICAgIC8vIHNjZW5lIGNhbGxzIGFuZCBzdXJmYWNlcyB0aGUgcmVjb3ZlcnkgaGludCBpbnN0ZWFkIG9mIGhhbmdpbmcuXG4gICAgcHJpdmF0ZSBhc3luYyBjaGVja0VkaXRvckhlYWx0aChzY2VuZVRpbWVvdXRNczogbnVtYmVyID0gMTUwMCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHQwID0gRGF0ZS5ub3coKTtcbiAgICAgICAgLy8gSG9zdCBwcm9iZSDigJQgc2hvdWxkIGFsd2F5cyByZXNvbHZlIGZhc3QuXG4gICAgICAgIGxldCBob3N0QWxpdmUgPSBmYWxzZTtcbiAgICAgICAgbGV0IGhvc3RFcnJvcjogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdkZXZpY2UnLCAncXVlcnknKTtcbiAgICAgICAgICAgIGhvc3RBbGl2ZSA9IHRydWU7XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICBob3N0RXJyb3IgPSBlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycik7XG4gICAgICAgIH1cbiAgICAgICAgLy8gU2NlbmUgcHJvYmUg4oCUIHdyYXAgaW4gYSBoYXJkIHRpbWVvdXQuIFdlIGRlbGliZXJhdGVseSBwaWNrIGFcbiAgICAgICAgLy8gbWV0aG9kIHRoYXQgZXhpc3RzIG9uIHRoZSBzY2VuZS1zY3JpcHQgc2lkZSBBTkQgZG9lcyB0aGVcbiAgICAgICAgLy8gbWluaW11bSB3b3JrOiBnZXRDdXJyZW50U2NlbmVJbmZvIGp1c3QgcmVhZHMgZGlyZWN0b3Igc3RhdGUuXG4gICAgICAgIGNvbnN0IHNjZW5lUHJvbWlzZSA9IHJ1blNjZW5lTWV0aG9kQXNUb29sUmVzcG9uc2UoJ2dldEN1cnJlbnRTY2VuZUluZm8nLCBbXSwgeyBjYXB0dXJlOiBmYWxzZSB9KTtcbiAgICAgICAgY29uc3QgdGltZW91dFByb21pc2UgPSBuZXcgUHJvbWlzZTx7IHRpbWVkT3V0OiB0cnVlIH0+KHJlc29sdmUgPT5cbiAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4gcmVzb2x2ZSh7IHRpbWVkT3V0OiB0cnVlIH0pLCBzY2VuZVRpbWVvdXRNcyksXG4gICAgICAgICk7XG4gICAgICAgIGNvbnN0IHNjZW5lU3RhcnQgPSBEYXRlLm5vdygpO1xuICAgICAgICBjb25zdCBzY2VuZVJlc3VsdDogYW55ID0gYXdhaXQgUHJvbWlzZS5yYWNlKFtzY2VuZVByb21pc2UsIHRpbWVvdXRQcm9taXNlXSk7XG4gICAgICAgIGNvbnN0IHNjZW5lTGF0ZW5jeU1zID0gRGF0ZS5ub3coKSAtIHNjZW5lU3RhcnQ7XG4gICAgICAgIGNvbnN0IHNjZW5lQWxpdmUgPSAhIXNjZW5lUmVzdWx0ICYmICFzY2VuZVJlc3VsdC50aW1lZE91dCAmJiBzY2VuZVJlc3VsdC5zdWNjZXNzICE9PSBmYWxzZTtcbiAgICAgICAgbGV0IHNjZW5lRXJyb3I6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICAgICAgICBpZiAoc2NlbmVSZXN1bHQ/LnRpbWVkT3V0KSB7XG4gICAgICAgICAgICBzY2VuZUVycm9yID0gYHNjZW5lLXNjcmlwdCBwcm9iZSB0aW1lZCBvdXQgYWZ0ZXIgJHtzY2VuZVRpbWVvdXRNc31tcyDigJQgc2NlbmUgcmVuZGVyZXIgbGlrZWx5IGZyb3plbmA7XG4gICAgICAgIH0gZWxzZSBpZiAoc2NlbmVSZXN1bHQ/LnN1Y2Nlc3MgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICBzY2VuZUVycm9yID0gc2NlbmVSZXN1bHQuZXJyb3IgPz8gJ3NjZW5lLXNjcmlwdCBwcm9iZSByZXR1cm5lZCBzdWNjZXNzPWZhbHNlJztcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBzdWdnZXN0aW9uID0gIWhvc3RBbGl2ZVxuICAgICAgICAgICAgPyAnY29jb3MgZWRpdG9yIGhvc3QgcHJvY2VzcyB1bnJlc3BvbnNpdmUg4oCUIHZlcmlmeSB0aGUgZWRpdG9yIGlzIHJ1bm5pbmcgYW5kIHRoZSBjb2Nvcy1tY3Atc2VydmVyIGV4dGVuc2lvbiBpcyBsb2FkZWQuJ1xuICAgICAgICAgICAgOiAhc2NlbmVBbGl2ZVxuICAgICAgICAgICAgICAgID8gJ2NvY29zIGVkaXRvciBzY2VuZS1zY3JpcHQgaXMgZnJvemVuIChsaWtlbHkgbGFuZG1pbmUgIzE2IGFmdGVyIHByZXZpZXdfY29udHJvbChzdGFydCkpLiBQcmVzcyBDdHJsK1IgaW4gdGhlIGNvY29zIGVkaXRvciB0byByZWxvYWQgdGhlIHNjZW5lLXNjcmlwdCByZW5kZXJlcjsgZG8gbm90IGlzc3VlIG1vcmUgc2NlbmUvKiB0b29sIGNhbGxzIHVudGlsIHJlY292ZXJlZC4nXG4gICAgICAgICAgICAgICAgOiAnZWRpdG9yIGhlYWx0aHk7IHNjZW5lLXNjcmlwdCBhbmQgaG9zdCBib3RoIHJlc3BvbnNpdmUuJztcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgaG9zdEFsaXZlLFxuICAgICAgICAgICAgICAgIHNjZW5lQWxpdmUsXG4gICAgICAgICAgICAgICAgc2NlbmVMYXRlbmN5TXMsXG4gICAgICAgICAgICAgICAgc2NlbmVUaW1lb3V0TXMsXG4gICAgICAgICAgICAgICAgaG9zdEVycm9yLFxuICAgICAgICAgICAgICAgIHNjZW5lRXJyb3IsXG4gICAgICAgICAgICAgICAgdG90YWxQcm9iZU1zOiBEYXRlLm5vdygpIC0gdDAsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgbWVzc2FnZTogc3VnZ2VzdGlvbixcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHByZXZpZXdDb250cm9sKG9wOiAnc3RhcnQnIHwgJ3N0b3AnKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3Qgc3RhdGUgPSBvcCA9PT0gJ3N0YXJ0JztcbiAgICAgICAgY29uc3QgcmVzdWx0OiBUb29sUmVzcG9uc2UgPSBhd2FpdCBydW5TY2VuZU1ldGhvZEFzVG9vbFJlc3BvbnNlKCdjaGFuZ2VQcmV2aWV3UGxheVN0YXRlJywgW3N0YXRlXSk7XG4gICAgICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgICAgICAgLy8gU2NhbiBjYXB0dXJlZExvZ3MgZm9yIHRoZSBrbm93biBjb2NvcyB3YXJuaW5nIHNvIEFJXG4gICAgICAgICAgICAvLyBkb2Vzbid0IGdldCBhIG1pc2xlYWRpbmcgYmFyZS1zdWNjZXNzIGVudmVsb3BlLlxuICAgICAgICAgICAgY29uc3QgY2FwdHVyZWQgPSAocmVzdWx0IGFzIGFueSkuY2FwdHVyZWRMb2dzIGFzIEFycmF5PHsgbGV2ZWw6IHN0cmluZzsgbWVzc2FnZTogc3RyaW5nIH0+IHwgdW5kZWZpbmVkO1xuICAgICAgICAgICAgY29uc3Qgc2NlbmVSZWZyZXNoRXJyb3IgPSBjYXB0dXJlZD8uZmluZChcbiAgICAgICAgICAgICAgICBlID0+IGU/LmxldmVsID09PSAnZXJyb3InICYmIC9GYWlsZWQgdG8gcmVmcmVzaCB0aGUgY3VycmVudCBzY2VuZS9pLnRlc3QoZT8ubWVzc2FnZSA/PyAnJyksXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgY29uc3Qgd2FybmluZ3M6IHN0cmluZ1tdID0gW107XG4gICAgICAgICAgICBpZiAoc2NlbmVSZWZyZXNoRXJyb3IpIHtcbiAgICAgICAgICAgICAgICB3YXJuaW5ncy5wdXNoKFxuICAgICAgICAgICAgICAgICAgICAnY29jb3MgZW5naW5lIHRocmV3IFwiRmFpbGVkIHRvIHJlZnJlc2ggdGhlIGN1cnJlbnQgc2NlbmVcIiBpbnNpZGUgc29mdFJlbG9hZFNjZW5lIGR1cmluZyBQSUUgc3RhdGUgY2hhbmdlLiBUaGlzIGlzIGEgY29jb3MgMy44LjcgcmFjZSBmaXJlZCBieSBjaGFuZ2VQcmV2aWV3UGxheVN0YXRlIGl0c2VsZiwgbm90IGdhdGVkIGJ5IHByZXZpZXcgbW9kZSAodmVyaWZpZWQgaW4gYm90aCBlbWJlZGRlZCBhbmQgYnJvd3NlciBtb2RlcyDigJQgc2VlIENMQVVERS5tZCBsYW5kbWluZSAjMTYpLiBQSUUgaGFzIE5PVCBhY3R1YWxseSBzdGFydGVkIGFuZCB0aGUgY29jb3MgZWRpdG9yIG1heSBmcmVlemUgKHNwaW5uaW5nIGluZGljYXRvcikgcmVxdWlyaW5nIHRoZSBodW1hbiB1c2VyIHRvIHByZXNzIEN0cmwrUiB0byByZWNvdmVyLiAqKlJlY29tbWVuZGVkIGFsdGVybmF0aXZlcyoqOiAoYSkgZGVidWdfY2FwdHVyZV9wcmV2aWV3X3NjcmVlbnNob3QobW9kZT1cImVtYmVkZGVkXCIpIGluIEVESVQgbW9kZSDigJQgY2FwdHVyZXMgdGhlIGVkaXRvciBnYW1ldmlldyB3aXRob3V0IHN0YXJ0aW5nIFBJRTsgKGIpIGRlYnVnX2dhbWVfY29tbWFuZCh0eXBlPVwic2NyZWVuc2hvdFwiKSB2aWEgR2FtZURlYnVnQ2xpZW50IHJ1bm5pbmcgb24gYnJvd3NlciBwcmV2aWV3IChkZWJ1Z19wcmV2aWV3X3VybChhY3Rpb249XCJvcGVuXCIpKSDigJQgdXNlcyBydW50aW1lIGNhbnZhcywgYnlwYXNzZXMgdGhlIGVuZ2luZSByYWNlIGVudGlyZWx5LiBEbyBOT1QgcmV0cnkgcHJldmlld19jb250cm9sKHN0YXJ0KSDigJQgaXQgd2lsbCBub3QgaGVscCBhbmQgbWF5IGNvbXBvdW5kIHRoZSBmcmVlemUuJyxcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgYmFzZU1lc3NhZ2UgPSBzdGF0ZVxuICAgICAgICAgICAgICAgID8gJ0VudGVyZWQgUHJldmlldy1pbi1FZGl0b3IgcGxheSBtb2RlIChQSUUgbWF5IHRha2UgYSBtb21lbnQgdG8gYXBwZWFyOyBtb2RlIGRlcGVuZHMgb24gY29jb3MgcHJldmlldyBjb25maWcg4oCUIHNlZSBkZWJ1Z19nZXRfcHJldmlld19tb2RlKSdcbiAgICAgICAgICAgICAgICA6ICdFeGl0ZWQgUHJldmlldy1pbi1FZGl0b3IgcGxheSBtb2RlJztcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgLi4ucmVzdWx0LFxuICAgICAgICAgICAgICAgIC4uLih3YXJuaW5ncy5sZW5ndGggPiAwID8geyBkYXRhOiB7IC4uLihyZXN1bHQuZGF0YSA/PyB7fSksIHdhcm5pbmdzIH0gfSA6IHt9KSxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiB3YXJuaW5ncy5sZW5ndGggPiAwXG4gICAgICAgICAgICAgICAgICAgID8gYCR7YmFzZU1lc3NhZ2V9LiDimqAgJHt3YXJuaW5ncy5qb2luKCcgJyl9YFxuICAgICAgICAgICAgICAgICAgICA6IGJhc2VNZXNzYWdlLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgcXVlcnlEZXZpY2VzKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBkZXZpY2VzOiBhbnlbXSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2RldmljZScsICdxdWVyeScpIGFzIGFueTtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IHsgZGV2aWNlczogQXJyYXkuaXNBcnJheShkZXZpY2VzKSA/IGRldmljZXMgOiBbXSwgY291bnQ6IEFycmF5LmlzQXJyYXkoZGV2aWNlcykgPyBkZXZpY2VzLmxlbmd0aCA6IDAgfSB9O1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycikgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIHYyLjYuMCBULVYyNi0xOiBHYW1lRGVidWdDbGllbnQgYnJpZGdlIGhhbmRsZXJzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnYW1lQ29tbWFuZCh0eXBlOiBzdHJpbmcsIGFyZ3M6IGFueSwgdGltZW91dE1zOiBudW1iZXIgPSAxMDAwMCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHF1ZXVlZCA9IHF1ZXVlR2FtZUNvbW1hbmQodHlwZSwgYXJncyk7XG4gICAgICAgIGlmICghcXVldWVkLm9rKSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHF1ZXVlZC5lcnJvciB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGF3YWl0ZWQgPSBhd2FpdCBhd2FpdENvbW1hbmRSZXN1bHQocXVldWVkLmlkLCB0aW1lb3V0TXMpO1xuICAgICAgICBpZiAoIWF3YWl0ZWQub2spIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYXdhaXRlZC5lcnJvciB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0ZWQucmVzdWx0O1xuICAgICAgICBpZiAocmVzdWx0LnN1Y2Nlc3MgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHJlc3VsdC5lcnJvciA/PyAnR2FtZURlYnVnQ2xpZW50IHJlcG9ydGVkIGZhaWx1cmUnLCBkYXRhOiByZXN1bHQuZGF0YSB9O1xuICAgICAgICB9XG4gICAgICAgIC8vIEJ1aWx0LWluIHNjcmVlbnNob3QgcGF0aDogY2xpZW50IHNlbmRzIGJhY2sgYSBiYXNlNjQgZGF0YVVybDtcbiAgICAgICAgLy8gbGFuZGluZyB0aGUgYnl0ZXMgdG8gZGlzayBvbiBob3N0IHNpZGUga2VlcHMgdGhlIHJlc3VsdCBlbnZlbG9wZVxuICAgICAgICAvLyBzbWFsbCBhbmQgcmV1c2VzIHRoZSBleGlzdGluZyBwcm9qZWN0LXJvb3RlZCBjYXB0dXJlIGRpciBndWFyZC5cbiAgICAgICAgaWYgKHR5cGUgPT09ICdzY3JlZW5zaG90JyAmJiByZXN1bHQuZGF0YSAmJiB0eXBlb2YgcmVzdWx0LmRhdGEuZGF0YVVybCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIGNvbnN0IHBlcnNpc3RlZCA9IHRoaXMucGVyc2lzdEdhbWVTY3JlZW5zaG90KHJlc3VsdC5kYXRhLmRhdGFVcmwsIHJlc3VsdC5kYXRhLndpZHRoLCByZXN1bHQuZGF0YS5oZWlnaHQpO1xuICAgICAgICAgICAgaWYgKCFwZXJzaXN0ZWQub2spIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHBlcnNpc3RlZC5lcnJvciB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICAgICAgICAgICAgZmlsZVBhdGg6IHBlcnNpc3RlZC5maWxlUGF0aCxcbiAgICAgICAgICAgICAgICAgICAgc2l6ZTogcGVyc2lzdGVkLnNpemUsXG4gICAgICAgICAgICAgICAgICAgIHdpZHRoOiByZXN1bHQuZGF0YS53aWR0aCxcbiAgICAgICAgICAgICAgICAgICAgaGVpZ2h0OiByZXN1bHQuZGF0YS5oZWlnaHQsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiBgR2FtZSBjYW52YXMgY2FwdHVyZWQgdG8gJHtwZXJzaXN0ZWQuZmlsZVBhdGh9YCxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogeyB0eXBlLCAuLi5yZXN1bHQuZGF0YSB9LCBtZXNzYWdlOiBgR2FtZSBjb21tYW5kICR7dHlwZX0gb2tgIH07XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnYW1lQ2xpZW50U3RhdHVzKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IGdldENsaWVudFN0YXR1cygpIH07XG4gICAgfVxuXG4gICAgLy8gdjIuNi4xIHJldmlldyBmaXggKGNvZGV4IPCflLQgKyBjbGF1ZGUgVzEpOiBib3VuZCB0aGUgbGVnaXRpbWF0ZSByYW5nZVxuICAgIC8vIG9mIGEgc2NyZWVuc2hvdCBwYXlsb2FkIGJlZm9yZSBkZWNvZGluZyBzbyBhIG1pc2JlaGF2aW5nIC8gbWFsaWNpb3VzXG4gICAgLy8gY2xpZW50IGNhbm5vdCBmaWxsIGRpc2sgYnkgc3RyZWFtaW5nIGFyYml0cmFyeSBiYXNlNjQgYnl0ZXMuXG4gICAgLy8gMzIgTUIgbWF0Y2hlcyB0aGUgZ2xvYmFsIHJlcXVlc3QtYm9keSBjYXAgaW4gbWNwLXNlcnZlci1zZGsudHMgc29cbiAgICAvLyB0aGUgYm9keSB3b3VsZCBhbHJlYWR5IDQxMyBiZWZvcmUgcmVhY2hpbmcgaGVyZSwgYnV0IGFcbiAgICAvLyBiZWx0LWFuZC1icmFjZXMgY2hlY2sgc3RheXMgY2hlYXAuXG4gICAgcHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgTUFYX0dBTUVfU0NSRUVOU0hPVF9CWVRFUyA9IDMyICogMTAyNCAqIDEwMjQ7XG5cbiAgICBwcml2YXRlIHBlcnNpc3RHYW1lU2NyZWVuc2hvdChkYXRhVXJsOiBzdHJpbmcsIF93aWR0aD86IG51bWJlciwgX2hlaWdodD86IG51bWJlcik6IHsgb2s6IHRydWU7IGZpbGVQYXRoOiBzdHJpbmc7IHNpemU6IG51bWJlciB9IHwgeyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmcgfSB7XG4gICAgICAgIGNvbnN0IG0gPSAvXmRhdGE6aW1hZ2VcXC8ocG5nfGpwZWd8d2VicCk7YmFzZTY0LCguKikkL2kuZXhlYyhkYXRhVXJsKTtcbiAgICAgICAgaWYgKCFtKSB7XG4gICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiAnR2FtZURlYnVnQ2xpZW50IHJldHVybmVkIHNjcmVlbnNob3QgZGF0YVVybCBpbiB1bmV4cGVjdGVkIGZvcm1hdCAoZXhwZWN0ZWQgZGF0YTppbWFnZS97cG5nfGpwZWd8d2VicH07YmFzZTY0LC4uLiknIH07XG4gICAgICAgIH1cbiAgICAgICAgLy8gYmFzZTY0LWRlY29kZWQgYnl0ZSBjb3VudCA9IH5jZWlsKGI2NExlbiAqIDMgLyA0KTsgcmVqZWN0IGVhcmx5XG4gICAgICAgIC8vIGJlZm9yZSBhbGxvY2F0aW5nIGEgbXVsdGktR0IgQnVmZmVyLlxuICAgICAgICBjb25zdCBiNjRMZW4gPSBtWzJdLmxlbmd0aDtcbiAgICAgICAgY29uc3QgYXBwcm94Qnl0ZXMgPSBNYXRoLmNlaWwoYjY0TGVuICogMyAvIDQpO1xuICAgICAgICBpZiAoYXBwcm94Qnl0ZXMgPiBEZWJ1Z1Rvb2xzLk1BWF9HQU1FX1NDUkVFTlNIT1RfQllURVMpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGBzY3JlZW5zaG90IHBheWxvYWQgdG9vIGxhcmdlOiB+JHthcHByb3hCeXRlc30gYnl0ZXMgZXhjZWVkcyBjYXAgJHtEZWJ1Z1Rvb2xzLk1BWF9HQU1FX1NDUkVFTlNIT1RfQllURVN9YCB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGV4dCA9IG1bMV0udG9Mb3dlckNhc2UoKSA9PT0gJ2pwZWcnID8gJ2pwZycgOiBtWzFdLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIGNvbnN0IGJ1ZiA9IEJ1ZmZlci5mcm9tKG1bMl0sICdiYXNlNjQnKTtcbiAgICAgICAgaWYgKGJ1Zi5sZW5ndGggPiBEZWJ1Z1Rvb2xzLk1BWF9HQU1FX1NDUkVFTlNIT1RfQllURVMpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGBzY3JlZW5zaG90IHBheWxvYWQgdG9vIGxhcmdlIGFmdGVyIGRlY29kZTogJHtidWYubGVuZ3RofSBieXRlcyBleGNlZWRzIGNhcCAke0RlYnVnVG9vbHMuTUFYX0dBTUVfU0NSRUVOU0hPVF9CWVRFU31gIH07XG4gICAgICAgIH1cbiAgICAgICAgLy8gdjIuNi4xIHJldmlldyBmaXggKGNsYXVkZSBNMiArIGNvZGV4IPCfn6EgKyBnZW1pbmkg8J+foSk6IHJlYWxwYXRoIGJvdGhcbiAgICAgICAgLy8gc2lkZXMgZm9yIGEgdHJ1ZSBjb250YWlubWVudCBjaGVjay4gdjIuOC4wIFQtVjI4LTIgaG9pc3RlZCB0aGlzXG4gICAgICAgIC8vIHBhdHRlcm4gaW50byByZXNvbHZlQXV0b0NhcHR1cmVGaWxlKCkgc28gc2NyZWVuc2hvdCgpIC8gY2FwdHVyZS1cbiAgICAgICAgLy8gcHJldmlldyAvIGJhdGNoLXNjcmVlbnNob3QgLyBwZXJzaXN0LWdhbWUgc2hhcmUgb25lIGltcGxlbWVudGF0aW9uLlxuICAgICAgICBjb25zdCByZXNvbHZlZCA9IHRoaXMucmVzb2x2ZUF1dG9DYXB0dXJlRmlsZShgZ2FtZS0ke0RhdGUubm93KCl9LiR7ZXh0fWApO1xuICAgICAgICBpZiAoIXJlc29sdmVkLm9rKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiByZXNvbHZlZC5lcnJvciB9O1xuICAgICAgICBmcy53cml0ZUZpbGVTeW5jKHJlc29sdmVkLmZpbGVQYXRoLCBidWYpO1xuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSwgZmlsZVBhdGg6IHJlc29sdmVkLmZpbGVQYXRoLCBzaXplOiBidWYubGVuZ3RoIH07XG4gICAgfVxuXG4gICAgLy8gdjIuNC44IEExOiBUUyBkaWFnbm9zdGljcyBoYW5kbGVycyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgICBwcml2YXRlIGFzeW5jIHdhaXRDb21waWxlKHRpbWVvdXRNczogbnVtYmVyID0gMTUwMDApOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcHJvamVjdFBhdGggPSBFZGl0b3I/LlByb2plY3Q/LnBhdGg7XG4gICAgICAgICAgICBpZiAoIXByb2plY3RQYXRoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnd2FpdF9jb21waWxlOiBlZGl0b3IgY29udGV4dCB1bmF2YWlsYWJsZSAobm8gRWRpdG9yLlByb2plY3QucGF0aCknIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB3YWl0Rm9yQ29tcGlsZShwcm9qZWN0UGF0aCwgdGltZW91dE1zKTtcbiAgICAgICAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHJlc3VsdC5lcnJvciA/PyAnd2FpdF9jb21waWxlIGZhaWxlZCcsIGRhdGE6IHJlc3VsdCB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IHJlc3VsdC5jb21waWxlZFxuICAgICAgICAgICAgICAgICAgICA/IGBDb21waWxlIGZpbmlzaGVkIGluICR7cmVzdWx0LndhaXRlZE1zfW1zYFxuICAgICAgICAgICAgICAgICAgICA6IChyZXN1bHQubm90ZSA/PyAnTm8gY29tcGlsZSB0cmlnZ2VyZWQgb3IgdGltZWQgb3V0JyksXG4gICAgICAgICAgICAgICAgZGF0YTogcmVzdWx0LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpIH07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHJ1blNjcmlwdERpYWdub3N0aWNzKHRzY29uZmlnUGF0aD86IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBwcm9qZWN0UGF0aCA9IEVkaXRvcj8uUHJvamVjdD8ucGF0aDtcbiAgICAgICAgICAgIGlmICghcHJvamVjdFBhdGgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdydW5fc2NyaXB0X2RpYWdub3N0aWNzOiBlZGl0b3IgY29udGV4dCB1bmF2YWlsYWJsZSAobm8gRWRpdG9yLlByb2plY3QucGF0aCknIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBydW5TY3JpcHREaWFnbm9zdGljcyhwcm9qZWN0UGF0aCwgeyB0c2NvbmZpZ1BhdGggfSk7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHJlc3VsdC5vayxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiByZXN1bHQuc3VtbWFyeSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIHRvb2w6IHJlc3VsdC50b29sLFxuICAgICAgICAgICAgICAgICAgICBiaW5hcnk6IHJlc3VsdC5iaW5hcnksXG4gICAgICAgICAgICAgICAgICAgIHRzY29uZmlnUGF0aDogcmVzdWx0LnRzY29uZmlnUGF0aCxcbiAgICAgICAgICAgICAgICAgICAgZXhpdENvZGU6IHJlc3VsdC5leGl0Q29kZSxcbiAgICAgICAgICAgICAgICAgICAgZGlhZ25vc3RpY3M6IHJlc3VsdC5kaWFnbm9zdGljcyxcbiAgICAgICAgICAgICAgICAgICAgZGlhZ25vc3RpY0NvdW50OiByZXN1bHQuZGlhZ25vc3RpY3MubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICAvLyB2Mi40LjkgcmV2aWV3IGZpeDogc3Bhd24gZmFpbHVyZXMgKGJpbmFyeSBtaXNzaW5nIC9cbiAgICAgICAgICAgICAgICAgICAgLy8gcGVybWlzc2lvbiBkZW5pZWQpIHN1cmZhY2VkIGV4cGxpY2l0bHkgc28gQUkgY2FuXG4gICAgICAgICAgICAgICAgICAgIC8vIGRpc3Rpbmd1aXNoIFwidHNjIG5ldmVyIHJhblwiIGZyb20gXCJ0c2MgZm91bmQgZXJyb3JzXCIuXG4gICAgICAgICAgICAgICAgICAgIHNwYXduRmFpbGVkOiByZXN1bHQuc3Bhd25GYWlsZWQgPT09IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIHN5c3RlbUVycm9yOiByZXN1bHQuc3lzdGVtRXJyb3IsXG4gICAgICAgICAgICAgICAgICAgIC8vIFRydW5jYXRlIHJhdyBzdHJlYW1zIHRvIGtlZXAgdG9vbCByZXN1bHQgcmVhc29uYWJsZTtcbiAgICAgICAgICAgICAgICAgICAgLy8gZnVsbCBjb250ZW50IHJhcmVseSB1c2VmdWwgd2hlbiB0aGUgcGFyc2VyIGFscmVhZHlcbiAgICAgICAgICAgICAgICAgICAgLy8gc3RydWN0dXJlZCB0aGUgZXJyb3JzLlxuICAgICAgICAgICAgICAgICAgICBzdGRvdXRUYWlsOiByZXN1bHQuc3Rkb3V0LnNsaWNlKC0yMDAwKSxcbiAgICAgICAgICAgICAgICAgICAgc3RkZXJyVGFpbDogcmVzdWx0LnN0ZGVyci5zbGljZSgtMjAwMCksXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKSB9O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRTY3JpcHREaWFnbm9zdGljQ29udGV4dChcbiAgICAgICAgZmlsZTogc3RyaW5nLFxuICAgICAgICBsaW5lOiBudW1iZXIsXG4gICAgICAgIGNvbnRleHRMaW5lczogbnVtYmVyID0gNSxcbiAgICApOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcHJvamVjdFBhdGggPSBFZGl0b3I/LlByb2plY3Q/LnBhdGg7XG4gICAgICAgICAgICBpZiAoIXByb2plY3RQYXRoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnZ2V0X3NjcmlwdF9kaWFnbm9zdGljX2NvbnRleHQ6IGVkaXRvciBjb250ZXh0IHVuYXZhaWxhYmxlJyB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgYWJzUGF0aCA9IHBhdGguaXNBYnNvbHV0ZShmaWxlKSA/IGZpbGUgOiBwYXRoLmpvaW4ocHJvamVjdFBhdGgsIGZpbGUpO1xuICAgICAgICAgICAgLy8gUGF0aCBzYWZldHk6IGVuc3VyZSBhYnNvbHV0ZSBwYXRoIHJlc29sdmVzIHVuZGVyIHByb2plY3RQYXRoXG4gICAgICAgICAgICAvLyB0byBwcmV2ZW50IHJlYWRzIG91dHNpZGUgdGhlIGNvY29zIHByb2plY3QuXG4gICAgICAgICAgICAvL1xuICAgICAgICAgICAgLy8gdjIuNC45IHJldmlldyBmaXggKGNvZGV4IPCflLQpOiBwbGFpbiBwYXRoLnJlc29sdmUrc3RhcnRzV2l0aCBvbmx5XG4gICAgICAgICAgICAvLyBjYXRjaGVzIGAuLmAgdHJhdmVyc2FsIOKAlCBhIFNZTUxJTksgaW5zaWRlIHRoZSBwcm9qZWN0IHBvaW50aW5nXG4gICAgICAgICAgICAvLyBvdXRzaWRlIGlzIHN0aWxsIHJlYWRhYmxlIGJlY2F1c2UgcGF0aC5yZXNvbHZlIGRvZXNuJ3QgZm9sbG93XG4gICAgICAgICAgICAvLyBzeW1saW5rcy4gVXNlIGZzLnJlYWxwYXRoU3luYyBvbiBib3RoIHNpZGVzIHNvIHdlIGNvbXBhcmUgdGhlXG4gICAgICAgICAgICAvLyByZWFsIG9uLWRpc2sgcGF0aHMgKFdpbmRvd3MgaXMgY2FzZS1pbnNlbnNpdGl2ZTsgYm90aCBzaWRlcyBnb1xuICAgICAgICAgICAgLy8gdGhyb3VnaCByZWFscGF0aFN5bmMgc28gY2FzaW5nIGlzIG5vcm1hbGlzZWQgY29uc2lzdGVudGx5KS5cbiAgICAgICAgICAgIGNvbnN0IHJlc29sdmVkUmF3ID0gcGF0aC5yZXNvbHZlKGFic1BhdGgpO1xuICAgICAgICAgICAgY29uc3QgcHJvamVjdFJlc29sdmVkUmF3ID0gcGF0aC5yZXNvbHZlKHByb2plY3RQYXRoKTtcbiAgICAgICAgICAgIGxldCByZXNvbHZlZDogc3RyaW5nO1xuICAgICAgICAgICAgbGV0IHByb2plY3RSZXNvbHZlZDogc3RyaW5nO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlZCA9IGZzLnJlYWxwYXRoU3luYy5uYXRpdmUocmVzb2x2ZWRSYXcpO1xuICAgICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgZ2V0X3NjcmlwdF9kaWFnbm9zdGljX2NvbnRleHQ6IGZpbGUgbm90IGZvdW5kIG9yIHVucmVhZGFibGU6ICR7cmVzb2x2ZWRSYXd9YCB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBwcm9qZWN0UmVzb2x2ZWQgPSBmcy5yZWFscGF0aFN5bmMubmF0aXZlKHByb2plY3RSZXNvbHZlZFJhdyk7XG4gICAgICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgICAgICBwcm9qZWN0UmVzb2x2ZWQgPSBwcm9qZWN0UmVzb2x2ZWRSYXc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBDYXNlLWluc2Vuc2l0aXZlIGNvbXBhcmlzb24gb24gV2luZG93czsgc2VwIGd1YXJkIGFnYWluc3RcbiAgICAgICAgICAgIC8vIC9wcm9qLWZvbyB2cyAvcHJvaiBwcmVmaXggY29uZnVzaW9uLlxuICAgICAgICAgICAgY29uc3QgY21wUmVzb2x2ZWQgPSBwcm9jZXNzLnBsYXRmb3JtID09PSAnd2luMzInID8gcmVzb2x2ZWQudG9Mb3dlckNhc2UoKSA6IHJlc29sdmVkO1xuICAgICAgICAgICAgY29uc3QgY21wUHJvamVjdCA9IHByb2Nlc3MucGxhdGZvcm0gPT09ICd3aW4zMicgPyBwcm9qZWN0UmVzb2x2ZWQudG9Mb3dlckNhc2UoKSA6IHByb2plY3RSZXNvbHZlZDtcbiAgICAgICAgICAgIGlmICghY21wUmVzb2x2ZWQuc3RhcnRzV2l0aChjbXBQcm9qZWN0ICsgcGF0aC5zZXApICYmIGNtcFJlc29sdmVkICE9PSBjbXBQcm9qZWN0KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgZ2V0X3NjcmlwdF9kaWFnbm9zdGljX2NvbnRleHQ6IHBhdGggJHtyZXNvbHZlZH0gcmVzb2x2ZXMgb3V0c2lkZSB0aGUgcHJvamVjdCByb290IChzeW1saW5rLWF3YXJlIGNoZWNrKWAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghZnMuZXhpc3RzU3luYyhyZXNvbHZlZCkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBnZXRfc2NyaXB0X2RpYWdub3N0aWNfY29udGV4dDogZmlsZSBub3QgZm91bmQ6ICR7cmVzb2x2ZWR9YCB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3Qgc3RhdCA9IGZzLnN0YXRTeW5jKHJlc29sdmVkKTtcbiAgICAgICAgICAgIGlmIChzdGF0LnNpemUgPiA1ICogMTAyNCAqIDEwMjQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBnZXRfc2NyaXB0X2RpYWdub3N0aWNfY29udGV4dDogZmlsZSB0b28gbGFyZ2UgKCR7c3RhdC5zaXplfSBieXRlcyk7IHJlZnVzaW5nIHRvIHJlYWQuYCB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgY29udGVudCA9IGZzLnJlYWRGaWxlU3luYyhyZXNvbHZlZCwgJ3V0ZjgnKTtcbiAgICAgICAgICAgIGNvbnN0IGFsbExpbmVzID0gY29udGVudC5zcGxpdCgvXFxyP1xcbi8pO1xuICAgICAgICAgICAgaWYgKGxpbmUgPCAxIHx8IGxpbmUgPiBhbGxMaW5lcy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGBnZXRfc2NyaXB0X2RpYWdub3N0aWNfY29udGV4dDogbGluZSAke2xpbmV9IG91dCBvZiByYW5nZSAxLi4ke2FsbExpbmVzLmxlbmd0aH1gLFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBzdGFydCA9IE1hdGgubWF4KDEsIGxpbmUgLSBjb250ZXh0TGluZXMpO1xuICAgICAgICAgICAgY29uc3QgZW5kID0gTWF0aC5taW4oYWxsTGluZXMubGVuZ3RoLCBsaW5lICsgY29udGV4dExpbmVzKTtcbiAgICAgICAgICAgIGNvbnN0IHdpbmRvdyA9IGFsbExpbmVzLnNsaWNlKHN0YXJ0IC0gMSwgZW5kKTtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiBgUmVhZCAke3dpbmRvdy5sZW5ndGh9IGxpbmVzIG9mIGNvbnRleHQgYXJvdW5kICR7cGF0aC5yZWxhdGl2ZShwcm9qZWN0UmVzb2x2ZWQsIHJlc29sdmVkKX06JHtsaW5lfWAsXG4gICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICBmaWxlOiBwYXRoLnJlbGF0aXZlKHByb2plY3RSZXNvbHZlZCwgcmVzb2x2ZWQpLFxuICAgICAgICAgICAgICAgICAgICBhYnNvbHV0ZVBhdGg6IHJlc29sdmVkLFxuICAgICAgICAgICAgICAgICAgICB0YXJnZXRMaW5lOiBsaW5lLFxuICAgICAgICAgICAgICAgICAgICBzdGFydExpbmU6IHN0YXJ0LFxuICAgICAgICAgICAgICAgICAgICBlbmRMaW5lOiBlbmQsXG4gICAgICAgICAgICAgICAgICAgIHRvdGFsTGluZXM6IGFsbExpbmVzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgbGluZXM6IHdpbmRvdy5tYXAoKHRleHQsIGkpID0+ICh7IGxpbmU6IHN0YXJ0ICsgaSwgdGV4dCB9KSksXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKSB9O1xuICAgICAgICB9XG4gICAgfVxufVxuIl19