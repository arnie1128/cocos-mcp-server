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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWctdG9vbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvdG9vbHMvZGVidWctdG9vbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUEsd0RBQWtFO0FBQ2xFLDBDQUFrQztBQUNsQyxzREFBMkQ7QUFDM0QsMERBQTZFO0FBQzdFLGtFQUFrRztBQUNsRyxzREFBbUU7QUFDbkUsdUNBQXlCO0FBQ3pCLDJDQUE2QjtBQUU3QixNQUFhLFVBQVU7SUFHbkI7UUFDSSxNQUFNLElBQUksR0FBYztZQUNwQjtnQkFDSSxJQUFJLEVBQUUsZUFBZTtnQkFDckIsV0FBVyxFQUFFLDZEQUE2RDtnQkFDMUUsV0FBVyxFQUFFLFVBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO2dCQUN6QixPQUFPLEVBQUUsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLFlBQVksRUFBRTthQUNyQztZQUNEO2dCQUNJLElBQUksRUFBRSxvQkFBb0I7Z0JBQzFCLFdBQVcsRUFBRSx3V0FBd1c7Z0JBQ3JYLFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDO29CQUNsQixJQUFJLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyxnR0FBZ0csQ0FBQztvQkFDM0gsT0FBTyxFQUFFLFVBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxPQUFPLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUMsUUFBUSxDQUFDLHdVQUF3VSxDQUFDO2lCQUMzWSxDQUFDO2dCQUNGLE9BQU8sRUFBRSxDQUFDLENBQUMsRUFBRSxXQUFDLE9BQUEsSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsTUFBQSxDQUFDLENBQUMsT0FBTyxtQ0FBSSxPQUFPLENBQUMsQ0FBQSxFQUFBO2FBQ3JFO1lBQ0Q7Z0JBQ0ksSUFBSSxFQUFF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LElBQUksRUFBRSxDQUFDLENBQUM7aUJBQzlEO2FBQ0osQ0FBQztRQUNOLENBQUM7UUFBQyxPQUFPLEdBQVEsRUFBRSxDQUFDO1lBQ2hCLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxNQUFBLEdBQUcsYUFBSCxHQUFHLHVCQUFILEdBQUcsQ0FBRSxPQUFPLG1DQUFJLE1BQU0sQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO1FBQ2xFLENBQUM7SUFDTCxDQUFDOztBQXI1Q0wsZ0NBczVDQztBQXpLRyx1RUFBdUU7QUFDdkUsdUVBQXVFO0FBQ3ZFLCtEQUErRDtBQUMvRCxvRUFBb0U7QUFDcEUseURBQXlEO0FBQ3pELHFDQUFxQztBQUNiLG9DQUF5QixHQUFHLEVBQUUsR0FBRyxJQUFJLEdBQUcsSUFBSSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgVG9vbERlZmluaXRpb24sIFRvb2xSZXNwb25zZSwgVG9vbEV4ZWN1dG9yLCBQZXJmb3JtYW5jZVN0YXRzLCBWYWxpZGF0aW9uUmVzdWx0LCBWYWxpZGF0aW9uSXNzdWUgfSBmcm9tICcuLi90eXBlcyc7XG5pbXBvcnQgeyBkZWJ1Z0xvZyB9IGZyb20gJy4uL2xpYi9sb2cnO1xuaW1wb3J0IHsgaXNFZGl0b3JDb250ZXh0RXZhbEVuYWJsZWQgfSBmcm9tICcuLi9saWIvcnVudGltZS1mbGFncyc7XG5pbXBvcnQgeyB6IH0gZnJvbSAnLi4vbGliL3NjaGVtYSc7XG5pbXBvcnQgeyBkZWZpbmVUb29scywgVG9vbERlZiB9IGZyb20gJy4uL2xpYi9kZWZpbmUtdG9vbHMnO1xuaW1wb3J0IHsgcnVuU2NyaXB0RGlhZ25vc3RpY3MsIHdhaXRGb3JDb21waWxlIH0gZnJvbSAnLi4vbGliL3RzLWRpYWdub3N0aWNzJztcbmltcG9ydCB7IHF1ZXVlR2FtZUNvbW1hbmQsIGF3YWl0Q29tbWFuZFJlc3VsdCwgZ2V0Q2xpZW50U3RhdHVzIH0gZnJvbSAnLi4vbGliL2dhbWUtY29tbWFuZC1xdWV1ZSc7XG5pbXBvcnQgeyBydW5TY2VuZU1ldGhvZEFzVG9vbFJlc3BvbnNlIH0gZnJvbSAnLi4vbGliL3NjZW5lLWJyaWRnZSc7XG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuXG5leHBvcnQgY2xhc3MgRGVidWdUb29scyBpbXBsZW1lbnRzIFRvb2xFeGVjdXRvciB7XG4gICAgcHJpdmF0ZSByZWFkb25seSBleGVjOiBUb29sRXhlY3V0b3I7XG5cbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgY29uc3QgZGVmczogVG9vbERlZltdID0gW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdjbGVhcl9jb25zb2xlJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ0NsZWFyIHRoZSBDb2NvcyBFZGl0b3IgQ29uc29sZSBVSS4gTm8gcHJvamVjdCBzaWRlIGVmZmVjdHMuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6ICgpID0+IHRoaXMuY2xlYXJDb25zb2xlKCksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdleGVjdXRlX2phdmFzY3JpcHQnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnW3ByaW1hcnldIEV4ZWN1dGUgSmF2YVNjcmlwdCBpbiBzY2VuZSBvciBlZGl0b3IgY29udGV4dC4gVXNlIHRoaXMgYXMgdGhlIGRlZmF1bHQgZmlyc3QgdG9vbCBmb3IgY29tcG91bmQgb3BlcmF0aW9ucyAocmVhZCDihpIgbXV0YXRlIOKGkiB2ZXJpZnkpIOKAlCBvbmUgY2FsbCByZXBsYWNlcyA1LTEwIG5hcnJvdyBzcGVjaWFsaXN0IHRvb2xzIGFuZCBhdm9pZHMgcGVyLWNhbGwgdG9rZW4gb3ZlcmhlYWQuIGNvbnRleHQ9XCJzY2VuZVwiIGluc3BlY3RzL211dGF0ZXMgY2MuTm9kZSBncmFwaDsgY29udGV4dD1cImVkaXRvclwiIHJ1bnMgaW4gaG9zdCBwcm9jZXNzIGZvciBFZGl0b3IuTWVzc2FnZSArIGZzIChkZWZhdWx0IG9mZiwgb3B0LWluKS4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIGNvZGU6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0phdmFTY3JpcHQgc291cmNlIHRvIGV4ZWN1dGUuIEhhcyBhY2Nlc3MgdG8gY2MuKiBpbiBzY2VuZSBjb250ZXh0LCBFZGl0b3IuKiBpbiBlZGl0b3IgY29udGV4dC4nKSxcbiAgICAgICAgICAgICAgICAgICAgY29udGV4dDogei5lbnVtKFsnc2NlbmUnLCAnZWRpdG9yJ10pLmRlZmF1bHQoJ3NjZW5lJykuZGVzY3JpYmUoJ0V4ZWN1dGlvbiBzYW5kYm94LiBcInNjZW5lXCIgcnVucyBpbnNpZGUgdGhlIGNvY29zIHNjZW5lIHNjcmlwdCBjb250ZXh0IChjYywgZGlyZWN0b3IsIGZpbmQpLiBcImVkaXRvclwiIHJ1bnMgaW4gdGhlIGVkaXRvciBob3N0IHByb2Nlc3MgKEVkaXRvciwgYXNzZXQtZGIsIGZzLCByZXF1aXJlKS4gRWRpdG9yIGNvbnRleHQgaXMgT0ZGIGJ5IGRlZmF1bHQgYW5kIG11c3QgYmUgb3B0LWluIHZpYSBwYW5lbCBzZXR0aW5nIGBlbmFibGVFZGl0b3JDb250ZXh0RXZhbGAg4oCUIGFyYml0cmFyeSBjb2RlIGluIHRoZSBob3N0IHByb2Nlc3MgaXMgYSBwcm9tcHQtaW5qZWN0aW9uIHJpc2suJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLmV4ZWN1dGVKYXZhU2NyaXB0KGEuY29kZSwgYS5jb250ZXh0ID8/ICdzY2VuZScpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnZXhlY3V0ZV9zY3JpcHQnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnW2NvbXBhdF0gU2NlbmUtb25seSBKYXZhU2NyaXB0IGV2YWwuIFByZWZlciBleGVjdXRlX2phdmFzY3JpcHQgd2l0aCBjb250ZXh0PVwic2NlbmVcIiDigJQga2VwdCBhcyBjb21wYXRpYmlsaXR5IGVudHJ5cG9pbnQgZm9yIG9sZGVyIGNsaWVudHMuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBzY3JpcHQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0phdmFTY3JpcHQgdG8gZXhlY3V0ZSBpbiBzY2VuZSBjb250ZXh0IHZpYSBjb25zb2xlL2V2YWwuIENhbiByZWFkIG9yIG11dGF0ZSB0aGUgY3VycmVudCBzY2VuZS4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMuZXhlY3V0ZVNjcmlwdENvbXBhdChhLnNjcmlwdCksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdnZXRfbm9kZV90cmVlJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1JlYWQgYSBkZWJ1ZyBub2RlIHRyZWUgZnJvbSBhIHJvb3Qgb3Igc2NlbmUgcm9vdCBmb3IgaGllcmFyY2h5L2NvbXBvbmVudCBpbnNwZWN0aW9uLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgcm9vdFV1aWQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnUm9vdCBub2RlIFVVSUQgdG8gZXhwYW5kLiBPbWl0IHRvIHVzZSB0aGUgY3VycmVudCBzY2VuZSByb290LicpLFxuICAgICAgICAgICAgICAgICAgICBtYXhEZXB0aDogei5udW1iZXIoKS5kZWZhdWx0KDEwKS5kZXNjcmliZSgnTWF4aW11bSB0cmVlIGRlcHRoLiBEZWZhdWx0IDEwOyBsYXJnZSB2YWx1ZXMgY2FuIHJldHVybiBhIGxvdCBvZiBkYXRhLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy5nZXROb2RlVHJlZShhLnJvb3RVdWlkLCBhLm1heERlcHRoKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2dldF9wZXJmb3JtYW5jZV9zdGF0cycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdUcnkgdG8gcmVhZCBzY2VuZSBxdWVyeS1wZXJmb3JtYW5jZSBzdGF0czsgbWF5IHJldHVybiB1bmF2YWlsYWJsZSBpbiBlZGl0IG1vZGUuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6ICgpID0+IHRoaXMuZ2V0UGVyZm9ybWFuY2VTdGF0cygpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAndmFsaWRhdGVfc2NlbmUnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnUnVuIGJhc2ljIGN1cnJlbnQtc2NlbmUgaGVhbHRoIGNoZWNrcyBmb3IgbWlzc2luZyBhc3NldHMgYW5kIG5vZGUtY291bnQgd2FybmluZ3MuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBjaGVja01pc3NpbmdBc3NldHM6IHouYm9vbGVhbigpLmRlZmF1bHQodHJ1ZSkuZGVzY3JpYmUoJ0NoZWNrIG1pc3NpbmcgYXNzZXQgcmVmZXJlbmNlcyB3aGVuIHRoZSBDb2NvcyBzY2VuZSBBUEkgc3VwcG9ydHMgaXQuJyksXG4gICAgICAgICAgICAgICAgICAgIGNoZWNrUGVyZm9ybWFuY2U6IHouYm9vbGVhbigpLmRlZmF1bHQodHJ1ZSkuZGVzY3JpYmUoJ1J1biBiYXNpYyBwZXJmb3JtYW5jZSBjaGVja3Mgc3VjaCBhcyBoaWdoIG5vZGUgY291bnQgd2FybmluZ3MuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLnZhbGlkYXRlU2NlbmUoeyBjaGVja01pc3NpbmdBc3NldHM6IGEuY2hlY2tNaXNzaW5nQXNzZXRzLCBjaGVja1BlcmZvcm1hbmNlOiBhLmNoZWNrUGVyZm9ybWFuY2UgfSksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdnZXRfZWRpdG9yX2luZm8nLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnUmVhZCBFZGl0b3IvQ29jb3MvcHJvamVjdC9wcm9jZXNzIGluZm9ybWF0aW9uIGFuZCBtZW1vcnkgc3VtbWFyeS4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogKCkgPT4gdGhpcy5nZXRFZGl0b3JJbmZvKCksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdnZXRfcHJvamVjdF9sb2dzJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1JlYWQgdGVtcC9sb2dzL3Byb2plY3QubG9nIHRhaWwgd2l0aCBvcHRpb25hbCBsZXZlbC9rZXl3b3JkIGZpbHRlcnMuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBsaW5lczogei5udW1iZXIoKS5taW4oMSkubWF4KDEwMDAwKS5kZWZhdWx0KDEwMCkuZGVzY3JpYmUoJ051bWJlciBvZiBsaW5lcyB0byByZWFkIGZyb20gdGhlIGVuZCBvZiB0ZW1wL2xvZ3MvcHJvamVjdC5sb2cuIERlZmF1bHQgMTAwLicpLFxuICAgICAgICAgICAgICAgICAgICBmaWx0ZXJLZXl3b3JkOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ09wdGlvbmFsIGNhc2UtaW5zZW5zaXRpdmUga2V5d29yZCBmaWx0ZXIuJyksXG4gICAgICAgICAgICAgICAgICAgIGxvZ0xldmVsOiB6LmVudW0oWydFUlJPUicsICdXQVJOJywgJ0lORk8nLCAnREVCVUcnLCAnVFJBQ0UnLCAnQUxMJ10pLmRlZmF1bHQoJ0FMTCcpLmRlc2NyaWJlKCdPcHRpb25hbCBsb2cgbGV2ZWwgZmlsdGVyLiBBTEwgZGlzYWJsZXMgbGV2ZWwgZmlsdGVyaW5nLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy5nZXRQcm9qZWN0TG9ncyhhLmxpbmVzLCBhLmZpbHRlcktleXdvcmQsIGEubG9nTGV2ZWwpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnZ2V0X2xvZ19maWxlX2luZm8nLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnUmVhZCB0ZW1wL2xvZ3MvcHJvamVjdC5sb2cgcGF0aCwgc2l6ZSwgbGluZSBjb3VudCwgYW5kIHRpbWVzdGFtcHMuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6ICgpID0+IHRoaXMuZ2V0TG9nRmlsZUluZm8oKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3NlYXJjaF9wcm9qZWN0X2xvZ3MnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnU2VhcmNoIHRlbXAvbG9ncy9wcm9qZWN0LmxvZyBmb3Igc3RyaW5nL3JlZ2V4IGFuZCByZXR1cm4gbGluZSBjb250ZXh0LicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgcGF0dGVybjogei5zdHJpbmcoKS5kZXNjcmliZSgnU2VhcmNoIHN0cmluZyBvciByZWdleC4gSW52YWxpZCByZWdleCBpcyB0cmVhdGVkIGFzIGEgbGl0ZXJhbCBzdHJpbmcuJyksXG4gICAgICAgICAgICAgICAgICAgIG1heFJlc3VsdHM6IHoubnVtYmVyKCkubWluKDEpLm1heCgxMDApLmRlZmF1bHQoMjApLmRlc2NyaWJlKCdNYXhpbXVtIG1hdGNoZXMgdG8gcmV0dXJuLiBEZWZhdWx0IDIwLicpLFxuICAgICAgICAgICAgICAgICAgICBjb250ZXh0TGluZXM6IHoubnVtYmVyKCkubWluKDApLm1heCgxMCkuZGVmYXVsdCgyKS5kZXNjcmliZSgnQ29udGV4dCBsaW5lcyBiZWZvcmUvYWZ0ZXIgZWFjaCBtYXRjaC4gRGVmYXVsdCAyLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy5zZWFyY2hQcm9qZWN0TG9ncyhhLnBhdHRlcm4sIGEubWF4UmVzdWx0cywgYS5jb250ZXh0TGluZXMpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnc2NyZWVuc2hvdCcsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdDYXB0dXJlIHRoZSBmb2N1c2VkIENvY29zIEVkaXRvciB3aW5kb3cgKG9yIGEgd2luZG93IG1hdGNoZWQgYnkgdGl0bGUpIHRvIGEgUE5HLiBSZXR1cm5zIHNhdmVkIGZpbGUgcGF0aC4gVXNlIHRoaXMgZm9yIEFJIHZpc3VhbCB2ZXJpZmljYXRpb24gYWZ0ZXIgc2NlbmUvVUkgY2hhbmdlcy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHNhdmVQYXRoOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0Fic29sdXRlIGZpbGVzeXN0ZW0gcGF0aCB0byBzYXZlIHRoZSBQTkcuIE11c3QgcmVzb2x2ZSBpbnNpZGUgdGhlIGNvY29zIHByb2plY3Qgcm9vdCAoY29udGFpbm1lbnQgY2hlY2sgdmlhIHJlYWxwYXRoKS4gT21pdCB0byBhdXRvLW5hbWUgaW50byA8cHJvamVjdD4vdGVtcC9tY3AtY2FwdHVyZXMvc2NyZWVuc2hvdC08dGltZXN0YW1wPi5wbmcuJyksXG4gICAgICAgICAgICAgICAgICAgIHdpbmRvd1RpdGxlOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ09wdGlvbmFsIHN1YnN0cmluZyBtYXRjaCBvbiB3aW5kb3cgdGl0bGUgdG8gcGljayBhIHNwZWNpZmljIEVsZWN0cm9uIHdpbmRvdy4gRGVmYXVsdDogZm9jdXNlZCB3aW5kb3cuJyksXG4gICAgICAgICAgICAgICAgICAgIGluY2x1ZGVCYXNlNjQ6IHouYm9vbGVhbigpLmRlZmF1bHQoZmFsc2UpLmRlc2NyaWJlKCdFbWJlZCBQTkcgYnl0ZXMgYXMgYmFzZTY0IGluIHJlc3BvbnNlIGRhdGEgKGxhcmdlOyBkZWZhdWx0IGZhbHNlKS4gV2hlbiBmYWxzZSwgb25seSB0aGUgc2F2ZWQgZmlsZSBwYXRoIGlzIHJldHVybmVkLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy5zY3JlZW5zaG90KGEuc2F2ZVBhdGgsIGEud2luZG93VGl0bGUsIGEuaW5jbHVkZUJhc2U2NCksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdjYXB0dXJlX3ByZXZpZXdfc2NyZWVuc2hvdCcsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdDYXB0dXJlIHRoZSBjb2NvcyBQcmV2aWV3LWluLUVkaXRvciAoUElFKSBnYW1ldmlldyB0byBhIFBORy4gQ29jb3MgaGFzIG11bHRpcGxlIFBJRSByZW5kZXIgdGFyZ2V0cyBkZXBlbmRpbmcgb24gdGhlIHVzZXJcXCdzIHByZXZpZXcgY29uZmlnIChQcmVmZXJlbmNlcyDihpIgUHJldmlldyDihpIgT3BlbiBQcmV2aWV3IFdpdGgpOiBcImJyb3dzZXJcIiBvcGVucyBhbiBleHRlcm5hbCBicm93c2VyIChOT1QgY2FwdHVyYWJsZSBoZXJlKSwgXCJ3aW5kb3dcIiAvIFwic2ltdWxhdG9yXCIgb3BlbnMgYSBzZXBhcmF0ZSBFbGVjdHJvbiB3aW5kb3cgKHRpdGxlIGNvbnRhaW5zIFwiUHJldmlld1wiKSwgXCJlbWJlZGRlZFwiIHJlbmRlcnMgdGhlIGdhbWV2aWV3IGluc2lkZSB0aGUgbWFpbiBlZGl0b3Igd2luZG93LiBUaGUgZGVmYXVsdCBtb2RlPVwiYXV0b1wiIHRyaWVzIHRoZSBQcmV2aWV3LXRpdGxlZCB3aW5kb3cgZmlyc3QgYW5kIGZhbGxzIGJhY2sgdG8gY2FwdHVyaW5nIHRoZSBtYWluIGVkaXRvciB3aW5kb3cgd2hlbiBubyBQcmV2aWV3LXRpdGxlZCB3aW5kb3cgZXhpc3RzIChjb3ZlcnMgZW1iZWRkZWQgbW9kZSkuIFVzZSBtb2RlPVwid2luZG93XCIgdG8gZm9yY2UgdGhlIHNlcGFyYXRlLXdpbmRvdyBzdHJhdGVneSBvciBtb2RlPVwiZW1iZWRkZWRcIiB0byBza2lwIHRoZSB3aW5kb3cgcHJvYmUuIFBhaXIgd2l0aCBkZWJ1Z19nZXRfcHJldmlld19tb2RlIHRvIHJlYWQgdGhlIGNvY29zIGNvbmZpZyBhbmQgcm91dGUgZGV0ZXJtaW5pc3RpY2FsbHkuIEZvciBydW50aW1lIGdhbWUtY2FudmFzIHBpeGVsLWxldmVsIGNhcHR1cmUgKGNhbWVyYSBSZW5kZXJUZXh0dXJlKSwgdXNlIGRlYnVnX2dhbWVfY29tbWFuZCh0eXBlPVwic2NyZWVuc2hvdFwiKSBpbnN0ZWFkLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgc2F2ZVBhdGg6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnQWJzb2x1dGUgZmlsZXN5c3RlbSBwYXRoIHRvIHNhdmUgdGhlIFBORy4gTXVzdCByZXNvbHZlIGluc2lkZSB0aGUgY29jb3MgcHJvamVjdCByb290IChjb250YWlubWVudCBjaGVjayB2aWEgcmVhbHBhdGgpLiBPbWl0IHRvIGF1dG8tbmFtZSBpbnRvIDxwcm9qZWN0Pi90ZW1wL21jcC1jYXB0dXJlcy9wcmV2aWV3LTx0aW1lc3RhbXA+LnBuZy4nKSxcbiAgICAgICAgICAgICAgICAgICAgbW9kZTogei5lbnVtKFsnYXV0bycsICd3aW5kb3cnLCAnZW1iZWRkZWQnXSkuZGVmYXVsdCgnYXV0bycpLmRlc2NyaWJlKCdDYXB0dXJlIHRhcmdldC4gXCJhdXRvXCIgKGRlZmF1bHQpIHRyaWVzIFByZXZpZXctdGl0bGVkIHdpbmRvdyB0aGVuIGZhbGxzIGJhY2sgdG8gdGhlIG1haW4gZWRpdG9yIHdpbmRvdy4gXCJ3aW5kb3dcIiBvbmx5IG1hdGNoZXMgUHJldmlldy10aXRsZWQgd2luZG93cyAoZmFpbHMgaWYgbm9uZSkuIFwiZW1iZWRkZWRcIiBjYXB0dXJlcyB0aGUgbWFpbiBlZGl0b3Igd2luZG93IGRpcmVjdGx5IChza2lwIFByZXZpZXctd2luZG93IHByb2JlKS4nKSxcbiAgICAgICAgICAgICAgICAgICAgd2luZG93VGl0bGU6IHouc3RyaW5nKCkuZGVmYXVsdCgnUHJldmlldycpLmRlc2NyaWJlKCdTdWJzdHJpbmcgbWF0Y2hlZCBhZ2FpbnN0IHdpbmRvdyB0aXRsZXMgaW4gd2luZG93L2F1dG8gbW9kZXMgKGRlZmF1bHQgXCJQcmV2aWV3XCIgZm9yIFBJRSkuIElnbm9yZWQgaW4gZW1iZWRkZWQgbW9kZS4nKSxcbiAgICAgICAgICAgICAgICAgICAgaW5jbHVkZUJhc2U2NDogei5ib29sZWFuKCkuZGVmYXVsdChmYWxzZSkuZGVzY3JpYmUoJ0VtYmVkIFBORyBieXRlcyBhcyBiYXNlNjQgaW4gcmVzcG9uc2UgZGF0YSAobGFyZ2U7IGRlZmF1bHQgZmFsc2UpLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy5jYXB0dXJlUHJldmlld1NjcmVlbnNob3QoYS5zYXZlUGF0aCwgYS5tb2RlID8/ICdhdXRvJywgYS53aW5kb3dUaXRsZSwgYS5pbmNsdWRlQmFzZTY0KSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2dldF9wcmV2aWV3X21vZGUnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnUmVhZCB0aGUgY29jb3MgcHJldmlldyBjb25maWd1cmF0aW9uIHZpYSBFZGl0b3IuTWVzc2FnZSBwcmVmZXJlbmNlcy9xdWVyeS1jb25maWcgc28gQUkgY2FuIHJvdXRlIGRlYnVnX2NhcHR1cmVfcHJldmlld19zY3JlZW5zaG90IHRvIHRoZSBjb3JyZWN0IG1vZGUuIFJldHVybnMgeyBpbnRlcnByZXRlZDogXCJicm93c2VyXCIgfCBcIndpbmRvd1wiIHwgXCJzaW11bGF0b3JcIiB8IFwiZW1iZWRkZWRcIiB8IFwidW5rbm93blwiLCByYXc6IDxmdWxsIHByZXZpZXcgY29uZmlnIGR1bXA+IH0uIFVzZSBiZWZvcmUgY2FwdHVyZTogaWYgaW50ZXJwcmV0ZWQ9XCJlbWJlZGRlZFwiLCBjYWxsIGNhcHR1cmVfcHJldmlld19zY3JlZW5zaG90IHdpdGggbW9kZT1cImVtYmVkZGVkXCIgb3IgcmVseSBvbiBtb2RlPVwiYXV0b1wiIGZhbGxiYWNrLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiAoKSA9PiB0aGlzLmdldFByZXZpZXdNb2RlKCksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdiYXRjaF9zY3JlZW5zaG90JyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ0NhcHR1cmUgbXVsdGlwbGUgUE5HcyBvZiB0aGUgZWRpdG9yIHdpbmRvdyB3aXRoIG9wdGlvbmFsIGRlbGF5cyBiZXR3ZWVuIHNob3RzLiBVc2VmdWwgZm9yIGFuaW1hdGluZyBwcmV2aWV3IHZlcmlmaWNhdGlvbiBvciBjYXB0dXJpbmcgdHJhbnNpdGlvbnMuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBzYXZlUGF0aFByZWZpeDogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdQYXRoIHByZWZpeCBmb3IgYmF0Y2ggb3V0cHV0IGZpbGVzLiBGaWxlcyB3cml0dGVuIGFzIDxwcmVmaXg+LTxpbmRleD4ucG5nLiBNdXN0IHJlc29sdmUgaW5zaWRlIHRoZSBjb2NvcyBwcm9qZWN0IHJvb3QgKGNvbnRhaW5tZW50IGNoZWNrIHZpYSByZWFscGF0aCkuIERlZmF1bHQ6IDxwcm9qZWN0Pi90ZW1wL21jcC1jYXB0dXJlcy9iYXRjaC08dGltZXN0YW1wPi4nKSxcbiAgICAgICAgICAgICAgICAgICAgZGVsYXlzTXM6IHouYXJyYXkoei5udW1iZXIoKS5taW4oMCkubWF4KDEwMDAwKSkubWF4KDIwKS5kZWZhdWx0KFswXSkuZGVzY3JpYmUoJ0RlbGF5IChtcykgYmVmb3JlIGVhY2ggY2FwdHVyZS4gTGVuZ3RoIGRldGVybWluZXMgaG93IG1hbnkgc2hvdHMgdGFrZW4gKGNhcHBlZCBhdCAyMCB0byBwcmV2ZW50IGRpc2sgZmlsbCAvIGVkaXRvciBmcmVlemUpLiBEZWZhdWx0IFswXSA9IHNpbmdsZSBzaG90LicpLFxuICAgICAgICAgICAgICAgICAgICB3aW5kb3dUaXRsZTogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdPcHRpb25hbCBzdWJzdHJpbmcgbWF0Y2ggb24gd2luZG93IHRpdGxlLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy5iYXRjaFNjcmVlbnNob3QoYS5zYXZlUGF0aFByZWZpeCwgYS5kZWxheXNNcywgYS53aW5kb3dUaXRsZSksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICd3YWl0X2NvbXBpbGUnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnQmxvY2sgdW50aWwgY29jb3MgZmluaXNoZXMgaXRzIFR5cGVTY3JpcHQgY29tcGlsZSBwYXNzLiBUYWlscyB0ZW1wL3Byb2dyYW1taW5nL3BhY2tlci1kcml2ZXIvbG9ncy9kZWJ1Zy5sb2cgZm9yIHRoZSBcIlRhcmdldChlZGl0b3IpIGVuZHNcIiBtYXJrZXIuIFJldHVybnMgaW1tZWRpYXRlbHkgd2l0aCBjb21waWxlZD1mYWxzZSBpZiBubyBjb21waWxlIHdhcyB0cmlnZ2VyZWQgKGNsZWFuIHByb2plY3QgLyBubyBjaGFuZ2VzIGRldGVjdGVkKS4gUGFpciB3aXRoIHJ1bl9zY3JpcHRfZGlhZ25vc3RpY3MgZm9yIGFuIFwiZWRpdCAudHMg4oaSIHdhaXQg4oaSIGZldGNoIGVycm9yc1wiIHdvcmtmbG93LicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgdGltZW91dE1zOiB6Lm51bWJlcigpLm1pbig1MDApLm1heCgxMjAwMDApLmRlZmF1bHQoMTUwMDApLmRlc2NyaWJlKCdNYXggd2FpdCB0aW1lIGluIG1zIGJlZm9yZSBnaXZpbmcgdXAuIERlZmF1bHQgMTUwMDAuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLndhaXRDb21waWxlKGEudGltZW91dE1zKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3J1bl9zY3JpcHRfZGlhZ25vc3RpY3MnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnUnVuIGB0c2MgLS1ub0VtaXRgIGFnYWluc3QgdGhlIHByb2plY3QgdHNjb25maWcgYW5kIHJldHVybiBwYXJzZWQgZGlhZ25vc3RpY3MuIFVzZWQgYWZ0ZXIgd2FpdF9jb21waWxlIHRvIHN1cmZhY2UgY29tcGlsYXRpb24gZXJyb3JzIGFzIHN0cnVjdHVyZWQge2ZpbGUsIGxpbmUsIGNvbHVtbiwgY29kZSwgbWVzc2FnZX0gZW50cmllcy4gUmVzb2x2ZXMgdHNjIGJpbmFyeSBmcm9tIHByb2plY3Qgbm9kZV9tb2R1bGVzIOKGkiBlZGl0b3IgYnVuZGxlZCBlbmdpbmUg4oaSIG5weCBmYWxsYmFjay4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHRzY29uZmlnUGF0aDogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdPcHRpb25hbCBvdmVycmlkZSAoYWJzb2x1dGUgb3IgcHJvamVjdC1yZWxhdGl2ZSkuIERlZmF1bHQ6IHRzY29uZmlnLmpzb24gb3IgdGVtcC90c2NvbmZpZy5jb2Nvcy5qc29uLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy5ydW5TY3JpcHREaWFnbm9zdGljcyhhLnRzY29uZmlnUGF0aCksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdwcmV2aWV3X3VybCcsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdSZXNvbHZlIHRoZSBjb2NvcyBicm93c2VyLXByZXZpZXcgVVJMIChlLmcuIGh0dHA6Ly9sb2NhbGhvc3Q6NzQ1NikgdmlhIHRoZSBkb2N1bWVudGVkIEVkaXRvci5NZXNzYWdlIGNoYW5uZWwgcHJldmlldy9xdWVyeS1wcmV2aWV3LXVybC4gV2l0aCBhY3Rpb249XCJvcGVuXCIsIGFsc28gbGF1bmNoZXMgdGhlIFVSTCBpbiB0aGUgdXNlciBkZWZhdWx0IGJyb3dzZXIgdmlhIGVsZWN0cm9uLnNoZWxsLm9wZW5FeHRlcm5hbCDigJQgdXNlZnVsIGFzIGEgc2V0dXAgc3RlcCBiZWZvcmUgZGVidWdfZ2FtZV9jb21tYW5kLCBzaW5jZSB0aGUgR2FtZURlYnVnQ2xpZW50IHJ1bm5pbmcgaW5zaWRlIHRoZSBwcmV2aWV3IG11c3QgYmUgcmVhY2hhYmxlLiBFZGl0b3Itc2lkZSBQcmV2aWV3LWluLUVkaXRvciBwbGF5L3N0b3AgaXMgTk9UIGV4cG9zZWQgYnkgdGhlIHB1YmxpYyBtZXNzYWdlIEFQSSBhbmQgaXMgaW50ZW50aW9uYWxseSBub3QgaW1wbGVtZW50ZWQgaGVyZTsgdXNlIHRoZSBjb2NvcyBlZGl0b3IgdG9vbGJhciBtYW51YWxseSBmb3IgUElFLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgYWN0aW9uOiB6LmVudW0oWydxdWVyeScsICdvcGVuJ10pLmRlZmF1bHQoJ3F1ZXJ5JykuZGVzY3JpYmUoJ1wicXVlcnlcIiByZXR1cm5zIHRoZSBVUkw7IFwib3BlblwiIHJldHVybnMgdGhlIFVSTCBBTkQgb3BlbnMgaXQgaW4gdGhlIHVzZXIgZGVmYXVsdCBicm93c2VyIHZpYSBlbGVjdHJvbi5zaGVsbC5vcGVuRXh0ZXJuYWwuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLnByZXZpZXdVcmwoYS5hY3Rpb24pLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAncXVlcnlfZGV2aWNlcycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdMaXN0IHByZXZpZXcgZGV2aWNlcyBjb25maWd1cmVkIGluIHRoZSBjb2NvcyBwcm9qZWN0IChjYy5JRGV2aWNlSXRlbSBlbnRyaWVzKS4gQmFja2VkIGJ5IEVkaXRvci5NZXNzYWdlIGNoYW5uZWwgZGV2aWNlL3F1ZXJ5LiBSZXR1cm5zIGFuIGFycmF5IG9mIHtuYW1lLCB3aWR0aCwgaGVpZ2h0LCByYXRpb30gZW50cmllcyDigJQgdXNlZnVsIGZvciBiYXRjaC1zY3JlZW5zaG90IHBpcGVsaW5lcyB0aGF0IHRhcmdldCBtdWx0aXBsZSByZXNvbHV0aW9ucy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogKCkgPT4gdGhpcy5xdWVyeURldmljZXMoKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2dhbWVfY29tbWFuZCcsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdTZW5kIGEgcnVudGltZSBjb21tYW5kIHRvIGEgR2FtZURlYnVnQ2xpZW50IHJ1bm5pbmcgaW5zaWRlIGEgY29jb3MgcHJldmlldy9idWlsZCAoYnJvd3NlciwgUHJldmlldy1pbi1FZGl0b3IsIG9yIGFueSBkZXZpY2UgdGhhdCBmZXRjaGVzIC9nYW1lL2NvbW1hbmQpLiBCdWlsdC1pbiBjb21tYW5kIHR5cGVzOiBcInNjcmVlbnNob3RcIiAoY2FwdHVyZSBnYW1lIGNhbnZhcyB0byBQTkcsIHJldHVybnMgc2F2ZWQgZmlsZSBwYXRoKSwgXCJjbGlja1wiIChlbWl0IEJ1dHRvbi5DTElDSyBvbiBhIG5vZGUgYnkgbmFtZSksIFwiaW5zcGVjdFwiIChkdW1wIHJ1bnRpbWUgbm9kZSBpbmZvOiBwb3NpdGlvbi9zY2FsZS9yb3RhdGlvbi9jb250ZW50U2l6ZS9hY3RpdmUvY29tcG9uZW50cyBieSBuYW1lKS4gQ3VzdG9tIGNvbW1hbmQgdHlwZXMgYXJlIGZvcndhcmRlZCB0byB0aGUgY2xpZW50XFwncyBjdXN0b21Db21tYW5kcyBtYXAgKGUuZy4gXCJzdGF0ZVwiLCBcIm5hdmlnYXRlXCIpLiBSZXF1aXJlcyB0aGUgR2FtZURlYnVnQ2xpZW50IHRlbXBsYXRlIChjbGllbnQvY29jb3MtbWNwLWNsaWVudC50cykgd2lyZWQgaW50byB0aGUgcnVubmluZyBnYW1lOyB3aXRob3V0IGl0IHRoZSBjYWxsIHRpbWVzIG91dC4gQ2hlY2sgR0VUIC9nYW1lL3N0YXR1cyB0byB2ZXJpZnkgY2xpZW50IGxpdmVuZXNzIGZpcnN0LicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogei5zdHJpbmcoKS5taW4oMSkuZGVzY3JpYmUoJ0NvbW1hbmQgdHlwZS4gQnVpbHQtaW5zOiBzY3JlZW5zaG90LCBjbGljaywgaW5zcGVjdC4gQ3VzdG9tczogYW55IHN0cmluZyB0aGUgR2FtZURlYnVnQ2xpZW50IHJlZ2lzdGVyZWQgaW4gY3VzdG9tQ29tbWFuZHMuJyksXG4gICAgICAgICAgICAgICAgICAgIGFyZ3M6IHouYW55KCkub3B0aW9uYWwoKS5kZXNjcmliZSgnQ29tbWFuZC1zcGVjaWZpYyBhcmd1bWVudHMuIEZvciBcImNsaWNrXCIvXCJpbnNwZWN0XCI6IHtuYW1lOiBzdHJpbmd9IG5vZGUgbmFtZS4gRm9yIFwic2NyZWVuc2hvdFwiOiB7fSAobm8gYXJncykuJyksXG4gICAgICAgICAgICAgICAgICAgIHRpbWVvdXRNczogei5udW1iZXIoKS5taW4oNTAwKS5tYXgoNjAwMDApLmRlZmF1bHQoMTAwMDApLmRlc2NyaWJlKCdNYXggd2FpdCBmb3IgY2xpZW50IHJlc3BvbnNlLiBEZWZhdWx0IDEwMDAwbXMuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLmdhbWVDb21tYW5kKGEudHlwZSwgYS5hcmdzLCBhLnRpbWVvdXRNcyksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdnYW1lX2NsaWVudF9zdGF0dXMnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnUmVhZCBHYW1lRGVidWdDbGllbnQgY29ubmVjdGlvbiBzdGF0dXM6IGNvbm5lY3RlZCAocG9sbGVkIHdpdGhpbiAycyksIGxhc3QgcG9sbCB0aW1lc3RhbXAsIHdoZXRoZXIgYSBjb21tYW5kIGlzIHF1ZXVlZC4gVXNlIGJlZm9yZSBkZWJ1Z19nYW1lX2NvbW1hbmQgdG8gY29uZmlybSB0aGUgY2xpZW50IGlzIHJlYWNoYWJsZS4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogKCkgPT4gdGhpcy5nYW1lQ2xpZW50U3RhdHVzKCksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdwcmV2aWV3X2NvbnRyb2wnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnUHJvZ3JhbW1hdGljYWxseSBzdGFydCBvciBzdG9wIFByZXZpZXctaW4tRWRpdG9yIChQSUUpIHBsYXkgbW9kZS4gV3JhcHMgdGhlIHR5cGVkIGNjZS5TY2VuZUZhY2FkZS5jaGFuZ2VQcmV2aWV3UGxheVN0YXRlIG1ldGhvZCAoZG9jdW1lbnRlZCBvbiBTY2VuZUZhY2FkZU1hbmFnZXIgaW4gQGNvY29zL2NyZWF0b3ItdHlwZXMpLiBwcmV2aWV3X2NvbnRyb2wob3A9XCJzdG9wXCIpIHJldHVybnMgdG8gc2NlbmUgbW9kZSBhbmQgaXMgcmVsaWFibGUuICoqV0FSTklORyDigJQgY29jb3MgMy44LjcgaGFzIGFuIGludGVybmFsIHJhY2UgaW4gc29mdFJlbG9hZFNjZW5lIHRoYXQgZmlyZXMgcmVnYXJkbGVzcyBvZiBwcmV2aWV3IG1vZGUqKiAodmVyaWZpZWQgZW1iZWRkZWQgKyBicm93c2VyOyB0cmVhdCBhcyBlbmdpbmUtd2lkZSBidWcpLiBUaGUgY2FsbCByZXR1cm5zIHN1Y2Nlc3MgYnV0IGNvY29zIGxvZ3MgXCJGYWlsZWQgdG8gcmVmcmVzaCB0aGUgY3VycmVudCBzY2VuZVwiLCBQSUUgZG9lcyBOT1QgYWN0dWFsbHkgc3RhcnQsIGFuZCB0aGUgZWRpdG9yIGNhbiBmcmVlemUgKHNwaW5uaW5nIGluZGljYXRvcikgcmVxdWlyaW5nIHVzZXIgQ3RybCtSIHJlY292ZXJ5LiBTZWUgbGFuZG1pbmUgIzE2IGluIENMQVVERS5tZC4gKipSZWNvbW1lbmRlZCBhbHRlcm5hdGl2ZXMqKjogKGEpIGRlYnVnX2NhcHR1cmVfcHJldmlld19zY3JlZW5zaG90KG1vZGU9XCJlbWJlZGRlZFwiKSBpbiBFRElUIG1vZGUgKG5vIFBJRSBzdGFydCBuZWVkZWQpIOKAlCBjYXB0dXJlcyB0aGUgZWRpdG9yIGdhbWV2aWV3IGRpcmVjdGx5OyAoYikgZGVidWdfZ2FtZV9jb21tYW5kKHR5cGU9XCJzY3JlZW5zaG90XCIpIHZpYSBHYW1lRGVidWdDbGllbnQgcnVubmluZyBpbiBicm93c2VyIHByZXZpZXcg4oCUIHVzZXMgcnVudGltZSBjYW52YXMsIGJ5cGFzc2VzIHRoZSBlbmdpbmUgcmFjZSBlbnRpcmVseS4gVXNlIHByZXZpZXdfY29udHJvbCBvbmx5IHdoZW4gdGhlIHN0YXJ0L3N0b3Agc2lkZSBlZmZlY3QgaXRzZWxmIGlzIHRoZSBnb2FsIChhbmQgYWNjZXB0IHRoZSBmcmVlemUgcmlzaykuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBvcDogei5lbnVtKFsnc3RhcnQnLCAnc3RvcCddKS5kZXNjcmliZSgnXCJzdGFydFwiIGVudGVycyBQSUUgcGxheSBtb2RlIChlcXVpdmFsZW50IHRvIGNsaWNraW5nIHRoZSB0b29sYmFyIHBsYXkgYnV0dG9uKS4gXCJzdG9wXCIgZXhpdHMgUElFIHBsYXkgYW5kIHJldHVybnMgdG8gc2NlbmUgbW9kZS4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMucHJldmlld0NvbnRyb2woYS5vcCksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdnZXRfc2NyaXB0X2RpYWdub3N0aWNfY29udGV4dCcsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdSZWFkIGEgd2luZG93IG9mIHNvdXJjZSBsaW5lcyBhcm91bmQgYSBkaWFnbm9zdGljIGxvY2F0aW9uIHNvIEFJIGNhbiByZWFkIHRoZSBvZmZlbmRpbmcgY29kZSB3aXRob3V0IGEgc2VwYXJhdGUgZmlsZSByZWFkLiBQYWlyIHdpdGggcnVuX3NjcmlwdF9kaWFnbm9zdGljczogcGFzcyBmaWxlL2xpbmUgZnJvbSBlYWNoIGRpYWdub3N0aWMgdG8gZmV0Y2ggY29udGV4dC4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIGZpbGU6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0Fic29sdXRlIG9yIHByb2plY3QtcmVsYXRpdmUgcGF0aCB0byB0aGUgc291cmNlIGZpbGUuIERpYWdub3N0aWNzIGZyb20gcnVuX3NjcmlwdF9kaWFnbm9zdGljcyBhbHJlYWR5IHVzZSBhIHBhdGggdHNjIGVtaXR0ZWQsIHdoaWNoIGlzIHN1aXRhYmxlIGhlcmUuJyksXG4gICAgICAgICAgICAgICAgICAgIGxpbmU6IHoubnVtYmVyKCkubWluKDEpLmRlc2NyaWJlKCcxLWJhc2VkIGxpbmUgbnVtYmVyIHRoYXQgdGhlIGRpYWdub3N0aWMgcG9pbnRzIGF0LicpLFxuICAgICAgICAgICAgICAgICAgICBjb250ZXh0TGluZXM6IHoubnVtYmVyKCkubWluKDApLm1heCg1MCkuZGVmYXVsdCg1KS5kZXNjcmliZSgnTnVtYmVyIG9mIGxpbmVzIHRvIGluY2x1ZGUgYmVmb3JlIGFuZCBhZnRlciB0aGUgdGFyZ2V0IGxpbmUuIERlZmF1bHQgNSAowrE1IOKGkiAxMS1saW5lIHdpbmRvdykuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLmdldFNjcmlwdERpYWdub3N0aWNDb250ZXh0KGEuZmlsZSwgYS5saW5lLCBhLmNvbnRleHRMaW5lcyksXG4gICAgICAgICAgICB9LFxuICAgICAgICBdO1xuICAgICAgICB0aGlzLmV4ZWMgPSBkZWZpbmVUb29scyhkZWZzKTtcbiAgICB9XG5cbiAgICBnZXRUb29scygpOiBUb29sRGVmaW5pdGlvbltdIHsgcmV0dXJuIHRoaXMuZXhlYy5nZXRUb29scygpOyB9XG4gICAgZXhlY3V0ZSh0b29sTmFtZTogc3RyaW5nLCBhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4geyByZXR1cm4gdGhpcy5leGVjLmV4ZWN1dGUodG9vbE5hbWUsIGFyZ3MpOyB9XG5cbiAgICAvLyBDb21wYXQgcGF0aDogcHJlc2VydmUgdGhlIHByZS12Mi4zLjAgcmVzcG9uc2Ugc2hhcGVcbiAgICAvLyB7c3VjY2VzcywgZGF0YToge3Jlc3VsdCwgbWVzc2FnZTogJ1NjcmlwdCBleGVjdXRlZCBzdWNjZXNzZnVsbHknfX1cbiAgICAvLyBzbyBvbGRlciBjYWxsZXJzIHJlYWRpbmcgZGF0YS5tZXNzYWdlIGtlZXAgd29ya2luZy5cbiAgICBwcml2YXRlIGFzeW5jIGV4ZWN1dGVTY3JpcHRDb21wYXQoc2NyaXB0OiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBvdXQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVKYXZhU2NyaXB0KHNjcmlwdCwgJ3NjZW5lJyk7XG4gICAgICAgIGlmIChvdXQuc3VjY2VzcyAmJiBvdXQuZGF0YSAmJiAncmVzdWx0JyBpbiBvdXQuZGF0YSkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0OiBvdXQuZGF0YS5yZXN1bHQsXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdTY3JpcHQgZXhlY3V0ZWQgc3VjY2Vzc2Z1bGx5JyxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gb3V0O1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgY2xlYXJDb25zb2xlKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBOb3RlOiBFZGl0b3IuTWVzc2FnZS5zZW5kIG1heSBub3QgcmV0dXJuIGEgcHJvbWlzZSBpbiBhbGwgdmVyc2lvbnNcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnNlbmQoJ2NvbnNvbGUnLCAnY2xlYXInKTtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiAnQ29uc29sZSBjbGVhcmVkIHN1Y2Nlc3NmdWxseSdcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVyci5tZXNzYWdlIH07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGV4ZWN1dGVKYXZhU2NyaXB0KGNvZGU6IHN0cmluZywgY29udGV4dDogJ3NjZW5lJyB8ICdlZGl0b3InKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgaWYgKGNvbnRleHQgPT09ICdzY2VuZScpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmV4ZWN1dGVJblNjZW5lQ29udGV4dChjb2RlKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoY29udGV4dCA9PT0gJ2VkaXRvcicpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmV4ZWN1dGVJbkVkaXRvckNvbnRleHQoY29kZSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgVW5rbm93biBleGVjdXRlX2phdmFzY3JpcHQgY29udGV4dDogJHtjb250ZXh0fWAgfTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGV4ZWN1dGVJblNjZW5lQ29udGV4dChjb2RlOiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ2V4ZWN1dGUtc2NlbmUtc2NyaXB0Jywge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdjb25zb2xlJyxcbiAgICAgICAgICAgICAgICBtZXRob2Q6ICdldmFsJyxcbiAgICAgICAgICAgICAgICBhcmdzOiBbY29kZV1cbiAgICAgICAgICAgIH0pLnRoZW4oKHJlc3VsdDogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRleHQ6ICdzY2VuZScsXG4gICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQ6IHJlc3VsdCxcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogJ1NjZW5lIHNjcmlwdCBleGVjdXRlZCBzdWNjZXNzZnVsbHknXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVyci5tZXNzYWdlIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZXhlY3V0ZUluRWRpdG9yQ29udGV4dChjb2RlOiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBpZiAoIWlzRWRpdG9yQ29udGV4dEV2YWxFbmFibGVkKCkpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgZXJyb3I6ICdFZGl0b3IgY29udGV4dCBldmFsIGlzIGRpc2FibGVkLiBFbmFibGUgYGVuYWJsZUVkaXRvckNvbnRleHRFdmFsYCBpbiBNQ1Agc2VydmVyIHNldHRpbmdzIChwYW5lbCBVSSkgdG8gb3B0IGluLiBUaGlzIGdyYW50cyBBSS1nZW5lcmF0ZWQgY29kZSBhY2Nlc3MgdG8gRWRpdG9yLk1lc3NhZ2UgKyBOb2RlIGZzIEFQSXMgaW4gdGhlIGhvc3QgcHJvY2Vzczsgb25seSBlbmFibGUgd2hlbiB5b3UgdHJ1c3QgdGhlIHVwc3RyZWFtIHByb21wdCBzb3VyY2UuJyxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIFdyYXAgaW4gYXN5bmMgSUlGRSBzbyBBSSBjYW4gdXNlIHRvcC1sZXZlbCBhd2FpdCB0cmFuc3BhcmVudGx5O1xuICAgICAgICAgICAgLy8gYWxzbyBnaXZlcyB1cyBhIGNsZWFuIFByb21pc2UtYmFzZWQgcmV0dXJuIHBhdGggcmVnYXJkbGVzcyBvZlxuICAgICAgICAgICAgLy8gd2hldGhlciB0aGUgdXNlciBjb2RlIHJldHVybnMgYSBQcm9taXNlIG9yIGEgc3luYyB2YWx1ZS5cbiAgICAgICAgICAgIGNvbnN0IHdyYXBwZWQgPSBgKGFzeW5jICgpID0+IHsgJHtjb2RlfSBcXG4gfSkoKWA7XG4gICAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tZXZhbFxuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgKDAsIGV2YWwpKHdyYXBwZWQpO1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgY29udGV4dDogJ2VkaXRvcicsXG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdDogcmVzdWx0LFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogJ0VkaXRvciBzY3JpcHQgZXhlY3V0ZWQgc3VjY2Vzc2Z1bGx5JyxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgIGVycm9yOiBgRWRpdG9yIGV2YWwgZmFpbGVkOiAke2Vycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKX1gLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2V0Tm9kZVRyZWUocm9vdFV1aWQ/OiBzdHJpbmcsIG1heERlcHRoOiBudW1iZXIgPSAxMCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgYnVpbGRUcmVlID0gYXN5bmMgKG5vZGVVdWlkOiBzdHJpbmcsIGRlcHRoOiBudW1iZXIgPSAwKTogUHJvbWlzZTxhbnk+ID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZGVwdGggPj0gbWF4RGVwdGgpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgdHJ1bmNhdGVkOiB0cnVlIH07XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgbm9kZURhdGEgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1ub2RlJywgbm9kZVV1aWQpO1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdHJlZSA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IG5vZGVEYXRhLnV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBuYW1lOiBub2RlRGF0YS5uYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgYWN0aXZlOiBub2RlRGF0YS5hY3RpdmUsXG4gICAgICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRzOiAobm9kZURhdGEgYXMgYW55KS5jb21wb25lbnRzID8gKG5vZGVEYXRhIGFzIGFueSkuY29tcG9uZW50cy5tYXAoKGM6IGFueSkgPT4gYy5fX3R5cGVfXykgOiBbXSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNoaWxkQ291bnQ6IG5vZGVEYXRhLmNoaWxkcmVuID8gbm9kZURhdGEuY2hpbGRyZW4ubGVuZ3RoIDogMCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNoaWxkcmVuOiBbXSBhcyBhbnlbXVxuICAgICAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChub2RlRGF0YS5jaGlsZHJlbiAmJiBub2RlRGF0YS5jaGlsZHJlbi5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGNoaWxkSWQgb2Ygbm9kZURhdGEuY2hpbGRyZW4pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjaGlsZFRyZWUgPSBhd2FpdCBidWlsZFRyZWUoY2hpbGRJZCwgZGVwdGggKyAxKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0cmVlLmNoaWxkcmVuLnB1c2goY2hpbGRUcmVlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0cmVlO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7IGVycm9yOiBlcnIubWVzc2FnZSB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGlmIChyb290VXVpZCkge1xuICAgICAgICAgICAgICAgIGJ1aWxkVHJlZShyb290VXVpZCkudGhlbih0cmVlID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IHRyZWUgfSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LWhpZXJhcmNoeScpLnRoZW4oYXN5bmMgKGhpZXJhcmNoeTogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRyZWVzID0gW107XG4gICAgICAgICAgICAgICAgICAgIGZvciAoY29uc3Qgcm9vdE5vZGUgb2YgaGllcmFyY2h5LmNoaWxkcmVuKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB0cmVlID0gYXdhaXQgYnVpbGRUcmVlKHJvb3ROb2RlLnV1aWQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdHJlZXMucHVzaCh0cmVlKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogdHJlZXMgfSk7XG4gICAgICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2V0UGVyZm9ybWFuY2VTdGF0cygpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LXBlcmZvcm1hbmNlJykudGhlbigoc3RhdHM6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHBlcmZTdGF0czogUGVyZm9ybWFuY2VTdGF0cyA9IHtcbiAgICAgICAgICAgICAgICAgICAgbm9kZUNvdW50OiBzdGF0cy5ub2RlQ291bnQgfHwgMCxcbiAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50Q291bnQ6IHN0YXRzLmNvbXBvbmVudENvdW50IHx8IDAsXG4gICAgICAgICAgICAgICAgICAgIGRyYXdDYWxsczogc3RhdHMuZHJhd0NhbGxzIHx8IDAsXG4gICAgICAgICAgICAgICAgICAgIHRyaWFuZ2xlczogc3RhdHMudHJpYW5nbGVzIHx8IDAsXG4gICAgICAgICAgICAgICAgICAgIG1lbW9yeTogc3RhdHMubWVtb3J5IHx8IHt9XG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogcGVyZlN0YXRzIH0pO1xuICAgICAgICAgICAgfSkuY2F0Y2goKCkgPT4ge1xuICAgICAgICAgICAgICAgIC8vIEZhbGxiYWNrIHRvIGJhc2ljIHN0YXRzXG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdQZXJmb3JtYW5jZSBzdGF0cyBub3QgYXZhaWxhYmxlIGluIGVkaXQgbW9kZSdcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgdmFsaWRhdGVTY2VuZShvcHRpb25zOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBpc3N1ZXM6IFZhbGlkYXRpb25Jc3N1ZVtdID0gW107XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIENoZWNrIGZvciBtaXNzaW5nIGFzc2V0c1xuICAgICAgICAgICAgaWYgKG9wdGlvbnMuY2hlY2tNaXNzaW5nQXNzZXRzKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgYXNzZXRDaGVjayA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ2NoZWNrLW1pc3NpbmctYXNzZXRzJyk7XG4gICAgICAgICAgICAgICAgaWYgKGFzc2V0Q2hlY2sgJiYgYXNzZXRDaGVjay5taXNzaW5nKSB7XG4gICAgICAgICAgICAgICAgICAgIGlzc3Vlcy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6ICdlcnJvcicsXG4gICAgICAgICAgICAgICAgICAgICAgICBjYXRlZ29yeTogJ2Fzc2V0cycsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgRm91bmQgJHthc3NldENoZWNrLm1pc3NpbmcubGVuZ3RofSBtaXNzaW5nIGFzc2V0IHJlZmVyZW5jZXNgLFxuICAgICAgICAgICAgICAgICAgICAgICAgZGV0YWlsczogYXNzZXRDaGVjay5taXNzaW5nXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gQ2hlY2sgZm9yIHBlcmZvcm1hbmNlIGlzc3Vlc1xuICAgICAgICAgICAgaWYgKG9wdGlvbnMuY2hlY2tQZXJmb3JtYW5jZSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGhpZXJhcmNoeSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LWhpZXJhcmNoeScpO1xuICAgICAgICAgICAgICAgIGNvbnN0IG5vZGVDb3VudCA9IHRoaXMuY291bnROb2RlcyhoaWVyYXJjaHkuY2hpbGRyZW4pO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGlmIChub2RlQ291bnQgPiAxMDAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGlzc3Vlcy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6ICd3YXJuaW5nJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhdGVnb3J5OiAncGVyZm9ybWFuY2UnLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYEhpZ2ggbm9kZSBjb3VudDogJHtub2RlQ291bnR9IG5vZGVzIChyZWNvbW1lbmRlZCA8IDEwMDApYCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHN1Z2dlc3Rpb246ICdDb25zaWRlciB1c2luZyBvYmplY3QgcG9vbGluZyBvciBzY2VuZSBvcHRpbWl6YXRpb24nXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgcmVzdWx0OiBWYWxpZGF0aW9uUmVzdWx0ID0ge1xuICAgICAgICAgICAgICAgIHZhbGlkOiBpc3N1ZXMubGVuZ3RoID09PSAwLFxuICAgICAgICAgICAgICAgIGlzc3VlQ291bnQ6IGlzc3Vlcy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgaXNzdWVzOiBpc3N1ZXNcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IHJlc3VsdCB9O1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnIubWVzc2FnZSB9O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBjb3VudE5vZGVzKG5vZGVzOiBhbnlbXSk6IG51bWJlciB7XG4gICAgICAgIGxldCBjb3VudCA9IG5vZGVzLmxlbmd0aDtcbiAgICAgICAgZm9yIChjb25zdCBub2RlIG9mIG5vZGVzKSB7XG4gICAgICAgICAgICBpZiAobm9kZS5jaGlsZHJlbikge1xuICAgICAgICAgICAgICAgIGNvdW50ICs9IHRoaXMuY291bnROb2Rlcyhub2RlLmNoaWxkcmVuKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gY291bnQ7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRFZGl0b3JJbmZvKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IGluZm8gPSB7XG4gICAgICAgICAgICBlZGl0b3I6IHtcbiAgICAgICAgICAgICAgICB2ZXJzaW9uOiAoRWRpdG9yIGFzIGFueSkudmVyc2lvbnM/LmVkaXRvciB8fCAnVW5rbm93bicsXG4gICAgICAgICAgICAgICAgY29jb3NWZXJzaW9uOiAoRWRpdG9yIGFzIGFueSkudmVyc2lvbnM/LmNvY29zIHx8ICdVbmtub3duJyxcbiAgICAgICAgICAgICAgICBwbGF0Zm9ybTogcHJvY2Vzcy5wbGF0Zm9ybSxcbiAgICAgICAgICAgICAgICBhcmNoOiBwcm9jZXNzLmFyY2gsXG4gICAgICAgICAgICAgICAgbm9kZVZlcnNpb246IHByb2Nlc3MudmVyc2lvblxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHByb2plY3Q6IHtcbiAgICAgICAgICAgICAgICBuYW1lOiBFZGl0b3IuUHJvamVjdC5uYW1lLFxuICAgICAgICAgICAgICAgIHBhdGg6IEVkaXRvci5Qcm9qZWN0LnBhdGgsXG4gICAgICAgICAgICAgICAgdXVpZDogRWRpdG9yLlByb2plY3QudXVpZFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIG1lbW9yeTogcHJvY2Vzcy5tZW1vcnlVc2FnZSgpLFxuICAgICAgICAgICAgdXB0aW1lOiBwcm9jZXNzLnVwdGltZSgpXG4gICAgICAgIH07XG5cbiAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogaW5mbyB9O1xuICAgIH1cblxuICAgIHByaXZhdGUgcmVzb2x2ZVByb2plY3RMb2dQYXRoKCk6IHsgcGF0aDogc3RyaW5nIH0gfCB7IGVycm9yOiBzdHJpbmcgfSB7XG4gICAgICAgIGlmICghRWRpdG9yLlByb2plY3QgfHwgIUVkaXRvci5Qcm9qZWN0LnBhdGgpIHtcbiAgICAgICAgICAgIHJldHVybiB7IGVycm9yOiAnRWRpdG9yLlByb2plY3QucGF0aCBpcyBub3QgYXZhaWxhYmxlOyBjYW5ub3QgbG9jYXRlIHByb2plY3QgbG9nIGZpbGUuJyB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGxvZ1BhdGggPSBwYXRoLmpvaW4oRWRpdG9yLlByb2plY3QucGF0aCwgJ3RlbXAvbG9ncy9wcm9qZWN0LmxvZycpO1xuICAgICAgICBpZiAoIWZzLmV4aXN0c1N5bmMobG9nUGF0aCkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IGVycm9yOiBgUHJvamVjdCBsb2cgZmlsZSBub3QgZm91bmQgYXQgJHtsb2dQYXRofWAgfTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4geyBwYXRoOiBsb2dQYXRoIH07XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRQcm9qZWN0TG9ncyhsaW5lczogbnVtYmVyID0gMTAwLCBmaWx0ZXJLZXl3b3JkPzogc3RyaW5nLCBsb2dMZXZlbDogc3RyaW5nID0gJ0FMTCcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcmVzb2x2ZWQgPSB0aGlzLnJlc29sdmVQcm9qZWN0TG9nUGF0aCgpO1xuICAgICAgICAgICAgaWYgKCdlcnJvcicgaW4gcmVzb2x2ZWQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHJlc29sdmVkLmVycm9yIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBsb2dGaWxlUGF0aCA9IHJlc29sdmVkLnBhdGg7XG5cbiAgICAgICAgICAgIC8vIFJlYWQgdGhlIGZpbGUgY29udGVudFxuICAgICAgICAgICAgY29uc3QgbG9nQ29udGVudCA9IGZzLnJlYWRGaWxlU3luYyhsb2dGaWxlUGF0aCwgJ3V0ZjgnKTtcbiAgICAgICAgICAgIGNvbnN0IGxvZ0xpbmVzID0gbG9nQ29udGVudC5zcGxpdCgnXFxuJykuZmlsdGVyKGxpbmUgPT4gbGluZS50cmltKCkgIT09ICcnKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gR2V0IHRoZSBsYXN0IE4gbGluZXNcbiAgICAgICAgICAgIGNvbnN0IHJlY2VudExpbmVzID0gbG9nTGluZXMuc2xpY2UoLWxpbmVzKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gQXBwbHkgZmlsdGVyc1xuICAgICAgICAgICAgbGV0IGZpbHRlcmVkTGluZXMgPSByZWNlbnRMaW5lcztcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gRmlsdGVyIGJ5IGxvZyBsZXZlbCBpZiBub3QgJ0FMTCdcbiAgICAgICAgICAgIGlmIChsb2dMZXZlbCAhPT0gJ0FMTCcpIHtcbiAgICAgICAgICAgICAgICBmaWx0ZXJlZExpbmVzID0gZmlsdGVyZWRMaW5lcy5maWx0ZXIobGluZSA9PiBcbiAgICAgICAgICAgICAgICAgICAgbGluZS5pbmNsdWRlcyhgWyR7bG9nTGV2ZWx9XWApIHx8IGxpbmUuaW5jbHVkZXMobG9nTGV2ZWwudG9Mb3dlckNhc2UoKSlcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBGaWx0ZXIgYnkga2V5d29yZCBpZiBwcm92aWRlZFxuICAgICAgICAgICAgaWYgKGZpbHRlcktleXdvcmQpIHtcbiAgICAgICAgICAgICAgICBmaWx0ZXJlZExpbmVzID0gZmlsdGVyZWRMaW5lcy5maWx0ZXIobGluZSA9PiBcbiAgICAgICAgICAgICAgICAgICAgbGluZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKGZpbHRlcktleXdvcmQudG9Mb3dlckNhc2UoKSlcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICB0b3RhbExpbmVzOiBsb2dMaW5lcy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgIHJlcXVlc3RlZExpbmVzOiBsaW5lcyxcbiAgICAgICAgICAgICAgICAgICAgZmlsdGVyZWRMaW5lczogZmlsdGVyZWRMaW5lcy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgIGxvZ0xldmVsOiBsb2dMZXZlbCxcbiAgICAgICAgICAgICAgICAgICAgZmlsdGVyS2V5d29yZDogZmlsdGVyS2V5d29yZCB8fCBudWxsLFxuICAgICAgICAgICAgICAgICAgICBsb2dzOiBmaWx0ZXJlZExpbmVzLFxuICAgICAgICAgICAgICAgICAgICBsb2dGaWxlUGF0aDogbG9nRmlsZVBhdGhcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgIGVycm9yOiBgRmFpbGVkIHRvIHJlYWQgcHJvamVjdCBsb2dzOiAke2Vycm9yLm1lc3NhZ2V9YFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2V0TG9nRmlsZUluZm8oKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJlc29sdmVkID0gdGhpcy5yZXNvbHZlUHJvamVjdExvZ1BhdGgoKTtcbiAgICAgICAgICAgIGlmICgnZXJyb3InIGluIHJlc29sdmVkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiByZXNvbHZlZC5lcnJvciB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgbG9nRmlsZVBhdGggPSByZXNvbHZlZC5wYXRoO1xuXG4gICAgICAgICAgICBjb25zdCBzdGF0cyA9IGZzLnN0YXRTeW5jKGxvZ0ZpbGVQYXRoKTtcbiAgICAgICAgICAgIGNvbnN0IGxvZ0NvbnRlbnQgPSBmcy5yZWFkRmlsZVN5bmMobG9nRmlsZVBhdGgsICd1dGY4Jyk7XG4gICAgICAgICAgICBjb25zdCBsaW5lQ291bnQgPSBsb2dDb250ZW50LnNwbGl0KCdcXG4nKS5maWx0ZXIobGluZSA9PiBsaW5lLnRyaW0oKSAhPT0gJycpLmxlbmd0aDtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgZmlsZVBhdGg6IGxvZ0ZpbGVQYXRoLFxuICAgICAgICAgICAgICAgICAgICBmaWxlU2l6ZTogc3RhdHMuc2l6ZSxcbiAgICAgICAgICAgICAgICAgICAgZmlsZVNpemVGb3JtYXR0ZWQ6IHRoaXMuZm9ybWF0RmlsZVNpemUoc3RhdHMuc2l6ZSksXG4gICAgICAgICAgICAgICAgICAgIGxhc3RNb2RpZmllZDogc3RhdHMubXRpbWUudG9JU09TdHJpbmcoKSxcbiAgICAgICAgICAgICAgICAgICAgbGluZUNvdW50OiBsaW5lQ291bnQsXG4gICAgICAgICAgICAgICAgICAgIGNyZWF0ZWQ6IHN0YXRzLmJpcnRodGltZS50b0lTT1N0cmluZygpLFxuICAgICAgICAgICAgICAgICAgICBhY2Nlc3NpYmxlOiBmcy5jb25zdGFudHMuUl9PS1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgZXJyb3I6IGBGYWlsZWQgdG8gZ2V0IGxvZyBmaWxlIGluZm86ICR7ZXJyb3IubWVzc2FnZX1gXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBzZWFyY2hQcm9qZWN0TG9ncyhwYXR0ZXJuOiBzdHJpbmcsIG1heFJlc3VsdHM6IG51bWJlciA9IDIwLCBjb250ZXh0TGluZXM6IG51bWJlciA9IDIpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcmVzb2x2ZWQgPSB0aGlzLnJlc29sdmVQcm9qZWN0TG9nUGF0aCgpO1xuICAgICAgICAgICAgaWYgKCdlcnJvcicgaW4gcmVzb2x2ZWQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHJlc29sdmVkLmVycm9yIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBsb2dGaWxlUGF0aCA9IHJlc29sdmVkLnBhdGg7XG5cbiAgICAgICAgICAgIGNvbnN0IGxvZ0NvbnRlbnQgPSBmcy5yZWFkRmlsZVN5bmMobG9nRmlsZVBhdGgsICd1dGY4Jyk7XG4gICAgICAgICAgICBjb25zdCBsb2dMaW5lcyA9IGxvZ0NvbnRlbnQuc3BsaXQoJ1xcbicpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBDcmVhdGUgcmVnZXggcGF0dGVybiAoc3VwcG9ydCBib3RoIHN0cmluZyBhbmQgcmVnZXggcGF0dGVybnMpXG4gICAgICAgICAgICBsZXQgcmVnZXg6IFJlZ0V4cDtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgcmVnZXggPSBuZXcgUmVnRXhwKHBhdHRlcm4sICdnaScpO1xuICAgICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICAgICAgLy8gSWYgcGF0dGVybiBpcyBub3QgdmFsaWQgcmVnZXgsIHRyZWF0IGFzIGxpdGVyYWwgc3RyaW5nXG4gICAgICAgICAgICAgICAgcmVnZXggPSBuZXcgUmVnRXhwKHBhdHRlcm4ucmVwbGFjZSgvWy4qKz9eJHt9KCl8W1xcXVxcXFxdL2csICdcXFxcJCYnKSwgJ2dpJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGNvbnN0IG1hdGNoZXM6IGFueVtdID0gW107XG4gICAgICAgICAgICBsZXQgcmVzdWx0Q291bnQgPSAwO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGxvZ0xpbmVzLmxlbmd0aCAmJiByZXN1bHRDb3VudCA8IG1heFJlc3VsdHM7IGkrKykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGxpbmUgPSBsb2dMaW5lc1tpXTtcbiAgICAgICAgICAgICAgICBpZiAocmVnZXgudGVzdChsaW5lKSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBHZXQgY29udGV4dCBsaW5lc1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjb250ZXh0U3RhcnQgPSBNYXRoLm1heCgwLCBpIC0gY29udGV4dExpbmVzKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY29udGV4dEVuZCA9IE1hdGgubWluKGxvZ0xpbmVzLmxlbmd0aCAtIDEsIGkgKyBjb250ZXh0TGluZXMpO1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY29udGV4dExpbmVzQXJyYXkgPSBbXTtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaiA9IGNvbnRleHRTdGFydDsgaiA8PSBjb250ZXh0RW5kOyBqKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRleHRMaW5lc0FycmF5LnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxpbmVOdW1iZXI6IGogKyAxLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRlbnQ6IGxvZ0xpbmVzW2pdLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlzTWF0Y2g6IGogPT09IGlcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICBtYXRjaGVzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgbGluZU51bWJlcjogaSArIDEsXG4gICAgICAgICAgICAgICAgICAgICAgICBtYXRjaGVkTGluZTogbGluZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRleHQ6IGNvbnRleHRMaW5lc0FycmF5XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0Q291bnQrKztcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIC8vIFJlc2V0IHJlZ2V4IGxhc3RJbmRleCBmb3IgZ2xvYmFsIHNlYXJjaFxuICAgICAgICAgICAgICAgICAgICByZWdleC5sYXN0SW5kZXggPSAwO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgcGF0dGVybjogcGF0dGVybixcbiAgICAgICAgICAgICAgICAgICAgdG90YWxNYXRjaGVzOiBtYXRjaGVzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgbWF4UmVzdWx0czogbWF4UmVzdWx0cyxcbiAgICAgICAgICAgICAgICAgICAgY29udGV4dExpbmVzOiBjb250ZXh0TGluZXMsXG4gICAgICAgICAgICAgICAgICAgIGxvZ0ZpbGVQYXRoOiBsb2dGaWxlUGF0aCxcbiAgICAgICAgICAgICAgICAgICAgbWF0Y2hlczogbWF0Y2hlc1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgZXJyb3I6IGBGYWlsZWQgdG8gc2VhcmNoIHByb2plY3QgbG9nczogJHtlcnJvci5tZXNzYWdlfWBcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGZvcm1hdEZpbGVTaXplKGJ5dGVzOiBudW1iZXIpOiBzdHJpbmcge1xuICAgICAgICBjb25zdCB1bml0cyA9IFsnQicsICdLQicsICdNQicsICdHQiddO1xuICAgICAgICBsZXQgc2l6ZSA9IGJ5dGVzO1xuICAgICAgICBsZXQgdW5pdEluZGV4ID0gMDtcblxuICAgICAgICB3aGlsZSAoc2l6ZSA+PSAxMDI0ICYmIHVuaXRJbmRleCA8IHVuaXRzLmxlbmd0aCAtIDEpIHtcbiAgICAgICAgICAgIHNpemUgLz0gMTAyNDtcbiAgICAgICAgICAgIHVuaXRJbmRleCsrO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGAke3NpemUudG9GaXhlZCgyKX0gJHt1bml0c1t1bml0SW5kZXhdfWA7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBwaWNrV2luZG93KHRpdGxlU3Vic3RyaW5nPzogc3RyaW5nKTogYW55IHtcbiAgICAgICAgLy8gTGF6eSByZXF1aXJlIHNvIHRoYXQgbm9uLUVsZWN0cm9uIGNvbnRleHRzIChlLmcuIHVuaXQgdGVzdHMsIHNtb2tlXG4gICAgICAgIC8vIHNjcmlwdCB3aXRoIHN0dWIgcmVnaXN0cnkpIGNhbiBzdGlsbCBpbXBvcnQgdGhpcyBtb2R1bGUuXG4gICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tdmFyLXJlcXVpcmVzXG4gICAgICAgIGNvbnN0IGVsZWN0cm9uID0gcmVxdWlyZSgnZWxlY3Ryb24nKTtcbiAgICAgICAgY29uc3QgQlcgPSBlbGVjdHJvbi5Ccm93c2VyV2luZG93O1xuICAgICAgICBpZiAoIUJXKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0VsZWN0cm9uIEJyb3dzZXJXaW5kb3cgQVBJIHVuYXZhaWxhYmxlOyBzY3JlZW5zaG90IHRvb2wgcmVxdWlyZXMgcnVubmluZyBpbnNpZGUgQ29jb3MgZWRpdG9yIGhvc3QgcHJvY2Vzcy4nKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGl0bGVTdWJzdHJpbmcpIHtcbiAgICAgICAgICAgIGNvbnN0IG1hdGNoZXMgPSBCVy5nZXRBbGxXaW5kb3dzKCkuZmlsdGVyKCh3OiBhbnkpID0+XG4gICAgICAgICAgICAgICAgdyAmJiAhdy5pc0Rlc3Ryb3llZCgpICYmICh3LmdldFRpdGxlPy4oKSB8fCAnJykuaW5jbHVkZXModGl0bGVTdWJzdHJpbmcpKTtcbiAgICAgICAgICAgIGlmIChtYXRjaGVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgTm8gRWxlY3Ryb24gd2luZG93IHRpdGxlIG1hdGNoZWQgc3Vic3RyaW5nOiAke3RpdGxlU3Vic3RyaW5nfWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIG1hdGNoZXNbMF07XG4gICAgICAgIH1cbiAgICAgICAgLy8gdjIuMy4xIHJldmlldyBmaXg6IGZvY3VzZWQgd2luZG93IG1heSBiZSBhIHRyYW5zaWVudCBwcmV2aWV3IHBvcHVwLlxuICAgICAgICAvLyBQcmVmZXIgYSBub24tUHJldmlldyB3aW5kb3cgc28gZGVmYXVsdCBzY3JlZW5zaG90cyB0YXJnZXQgdGhlIG1haW5cbiAgICAgICAgLy8gZWRpdG9yIHN1cmZhY2UuIENhbGxlciBjYW4gc3RpbGwgcGFzcyB0aXRsZVN1YnN0cmluZz0nUHJldmlldycgdG9cbiAgICAgICAgLy8gZXhwbGljaXRseSB0YXJnZXQgdGhlIHByZXZpZXcgd2hlbiB3YW50ZWQuXG4gICAgICAgIGNvbnN0IGFsbDogYW55W10gPSBCVy5nZXRBbGxXaW5kb3dzKCkuZmlsdGVyKCh3OiBhbnkpID0+IHcgJiYgIXcuaXNEZXN0cm95ZWQoKSk7XG4gICAgICAgIGlmIChhbGwubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIGxpdmUgRWxlY3Ryb24gd2luZG93czsgY2Fubm90IGNhcHR1cmUgc2NyZWVuc2hvdC4nKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBpc1ByZXZpZXcgPSAodzogYW55KSA9PiAvcHJldmlldy9pLnRlc3Qody5nZXRUaXRsZT8uKCkgfHwgJycpO1xuICAgICAgICBjb25zdCBub25QcmV2aWV3ID0gYWxsLmZpbHRlcigodzogYW55KSA9PiAhaXNQcmV2aWV3KHcpKTtcbiAgICAgICAgY29uc3QgZm9jdXNlZCA9IEJXLmdldEZvY3VzZWRXaW5kb3c/LigpO1xuICAgICAgICBpZiAoZm9jdXNlZCAmJiAhZm9jdXNlZC5pc0Rlc3Ryb3llZCgpICYmICFpc1ByZXZpZXcoZm9jdXNlZCkpIHJldHVybiBmb2N1c2VkO1xuICAgICAgICBpZiAobm9uUHJldmlldy5sZW5ndGggPiAwKSByZXR1cm4gbm9uUHJldmlld1swXTtcbiAgICAgICAgcmV0dXJuIGFsbFswXTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGVuc3VyZUNhcHR1cmVEaXIoKTogeyBvazogdHJ1ZTsgZGlyOiBzdHJpbmcgfSB8IHsgb2s6IGZhbHNlOyBlcnJvcjogc3RyaW5nIH0ge1xuICAgICAgICBpZiAoIUVkaXRvci5Qcm9qZWN0IHx8ICFFZGl0b3IuUHJvamVjdC5wYXRoKSB7XG4gICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiAnRWRpdG9yLlByb2plY3QucGF0aCBpcyBub3QgYXZhaWxhYmxlOyBjYW5ub3QgcmVzb2x2ZSBjYXB0dXJlIG91dHB1dCBkaXJlY3RvcnkuJyB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGRpciA9IHBhdGguam9pbihFZGl0b3IuUHJvamVjdC5wYXRoLCAndGVtcCcsICdtY3AtY2FwdHVyZXMnKTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGZzLm1rZGlyU3luYyhkaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgICAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUsIGRpciB9O1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogYEZhaWxlZCB0byBjcmVhdGUgY2FwdHVyZSBkaXI6ICR7ZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpfWAgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIHYyLjguMCBULVYyOC0yIChjYXJyeW92ZXIgZnJvbSB2Mi43LjAgQ29kZXggc2luZ2xlLXJldmlld2VyIPCfn6EpXG4gICAgLy8g4oaSIHYyLjguMSByb3VuZC0xIGZpeCAoQ29kZXgg8J+UtCArIENsYXVkZSDwn5+hKTogdGhlIHYyLjguMCBoZWxwZXJcbiAgICAvLyByZWFscGF0aCdkIGBkaXJgIGFuZCBgcGF0aC5kaXJuYW1lKHBhdGguam9pbihkaXIsIGJhc2VuYW1lKSlgIGFuZFxuICAgIC8vIGNvbXBhcmVkIHRoZSB0d28g4oCUIGJ1dCB3aXRoIGEgZml4ZWQgYmFzZW5hbWUgdGhvc2UgZXhwcmVzc2lvbnMgYm90aFxuICAgIC8vIGNvbGxhcHNlIHRvIGBkaXJgLCBtYWtpbmcgdGhlIGVxdWFsaXR5IGNoZWNrIHRhdXRvbG9naWNhbC4gVGhlIGNoZWNrXG4gICAgLy8gcHJvdGVjdGVkIG5vdGhpbmcgaWYgYDxwcm9qZWN0Pi90ZW1wL21jcC1jYXB0dXJlc2AgaXRzZWxmIHdhcyBhXG4gICAgLy8gc3ltbGluayB0aGF0IGVzY2FwZXMgdGhlIHByb2plY3QgdHJlZS5cbiAgICAvL1xuICAgIC8vIFRydWUgZXNjYXBlIHByb3RlY3Rpb24gcmVxdWlyZXMgYW5jaG9yaW5nIGFnYWluc3QgdGhlIHByb2plY3Qgcm9vdC5cbiAgICAvLyBXZSBub3cgcmVhbHBhdGggQk9USCB0aGUgY2FwdHVyZSBkaXIgYW5kIGBFZGl0b3IuUHJvamVjdC5wYXRoYCBhbmRcbiAgICAvLyByZXF1aXJlIHRoZSByZXNvbHZlZCBjYXB0dXJlIGRpciB0byBiZSBpbnNpZGUgdGhlIHJlc29sdmVkIHByb2plY3RcbiAgICAvLyByb290IChlcXVhbGl0eSBPUiBgcmVhbERpci5zdGFydHNXaXRoKHJlYWxQcm9qZWN0Um9vdCArIHNlcClgKS5cbiAgICAvLyBUaGUgaW50cmEtZGlyIGNoZWNrIGlzIGtlcHQgZm9yIGNoZWFwIGRlZmVuc2UtaW4tZGVwdGggaW4gY2FzZSBhXG4gICAgLy8gZnV0dXJlIGJhc2VuYW1lIGdldHMgdHJhdmVyc2FsIGNoYXJhY3RlcnMgdGhyZWFkZWQgdGhyb3VnaC5cbiAgICAvL1xuICAgIC8vIFJldHVybnMgeyBvazogdHJ1ZSwgZmlsZVBhdGgsIGRpciB9IHdoZW4gc2FmZSB0byB3cml0ZSwgb3JcbiAgICAvLyB7IG9rOiBmYWxzZSwgZXJyb3IgfSB3aXRoIHRoZSBzYW1lIGVycm9yIGVudmVsb3BlIHNoYXBlIGFzXG4gICAgLy8gZW5zdXJlQ2FwdHVyZURpciBzbyBjYWxsZXJzIGNhbiBmYWxsIHRocm91Z2ggdGhlaXIgZXhpc3RpbmdcbiAgICAvLyBlcnJvci1yZXR1cm4gcGF0dGVybi5cbiAgICBwcml2YXRlIHJlc29sdmVBdXRvQ2FwdHVyZUZpbGUoYmFzZW5hbWU6IHN0cmluZyk6IHsgb2s6IHRydWU7IGZpbGVQYXRoOiBzdHJpbmc7IGRpcjogc3RyaW5nIH0gfCB7IG9rOiBmYWxzZTsgZXJyb3I6IHN0cmluZyB9IHtcbiAgICAgICAgY29uc3QgZGlyUmVzdWx0ID0gdGhpcy5lbnN1cmVDYXB0dXJlRGlyKCk7XG4gICAgICAgIGlmICghZGlyUmVzdWx0Lm9rKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBkaXJSZXN1bHQuZXJyb3IgfTtcbiAgICAgICAgY29uc3QgcHJvamVjdFBhdGg6IHN0cmluZyB8IHVuZGVmaW5lZCA9IEVkaXRvcj8uUHJvamVjdD8ucGF0aDtcbiAgICAgICAgaWYgKCFwcm9qZWN0UGF0aCkge1xuICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogJ0VkaXRvci5Qcm9qZWN0LnBhdGggaXMgbm90IGF2YWlsYWJsZTsgY2Fubm90IGFuY2hvciBjYXB0dXJlLWRpciBjb250YWlubWVudCBjaGVjay4nIH07XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZmlsZVBhdGggPSBwYXRoLmpvaW4oZGlyUmVzdWx0LmRpciwgYmFzZW5hbWUpO1xuICAgICAgICBsZXQgcmVhbERpcjogc3RyaW5nO1xuICAgICAgICBsZXQgcmVhbFBhcmVudDogc3RyaW5nO1xuICAgICAgICBsZXQgcmVhbFByb2plY3RSb290OiBzdHJpbmc7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBycDogYW55ID0gZnMucmVhbHBhdGhTeW5jIGFzIGFueTtcbiAgICAgICAgICAgIGNvbnN0IHJlc29sdmVSZWFsID0gcnAubmF0aXZlID8/IHJwO1xuICAgICAgICAgICAgcmVhbERpciA9IHJlc29sdmVSZWFsKGRpclJlc3VsdC5kaXIpO1xuICAgICAgICAgICAgcmVhbFBhcmVudCA9IHJlc29sdmVSZWFsKHBhdGguZGlybmFtZShmaWxlUGF0aCkpO1xuICAgICAgICAgICAgcmVhbFByb2plY3RSb290ID0gcmVzb2x2ZVJlYWwocHJvamVjdFBhdGgpO1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogYHNjcmVlbnNob3QgcGF0aCByZWFscGF0aCBmYWlsZWQ6ICR7ZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpfWAgfTtcbiAgICAgICAgfVxuICAgICAgICAvLyBEZWZlbnNlLWluLWRlcHRoOiBwYXJlbnQgb2YgdGhlIHJlc29sdmVkIGZpbGUgbXVzdCBlcXVhbCB0aGVcbiAgICAgICAgLy8gcmVzb2x2ZWQgY2FwdHVyZSBkaXIgKGNhdGNoZXMgZnV0dXJlIGJhc2VuYW1lcyB0aHJlYWRpbmcgYC4uYCkuXG4gICAgICAgIGlmIChwYXRoLnJlc29sdmUocmVhbFBhcmVudCkgIT09IHBhdGgucmVzb2x2ZShyZWFsRGlyKSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogJ3NjcmVlbnNob3Qgc2F2ZSBwYXRoIHJlc29sdmVkIG91dHNpZGUgdGhlIGNhcHR1cmUgZGlyZWN0b3J5JyB9O1xuICAgICAgICB9XG4gICAgICAgIC8vIFByaW1hcnkgcHJvdGVjdGlvbjogY2FwdHVyZSBkaXIgaXRzZWxmIG11c3QgcmVzb2x2ZSBpbnNpZGUgdGhlXG4gICAgICAgIC8vIHByb2plY3Qgcm9vdCwgc28gYSBzeW1saW5rIGNoYWluIG9uIGB0ZW1wL21jcC1jYXB0dXJlc2AgY2Fubm90XG4gICAgICAgIC8vIHBpdm90IHdyaXRlcyB0byBlLmcuIC9ldGMgb3IgQzpcXFdpbmRvd3MuXG4gICAgICAgIGNvbnN0IHJlYWxEaXJOb3JtYWxpemVkID0gcGF0aC5yZXNvbHZlKHJlYWxEaXIpO1xuICAgICAgICBjb25zdCByZWFsUm9vdE5vcm1hbGl6ZWQgPSBwYXRoLnJlc29sdmUocmVhbFByb2plY3RSb290KTtcbiAgICAgICAgY29uc3Qgd2l0aGluUm9vdCA9IHJlYWxEaXJOb3JtYWxpemVkID09PSByZWFsUm9vdE5vcm1hbGl6ZWRcbiAgICAgICAgICAgIHx8IHJlYWxEaXJOb3JtYWxpemVkLnN0YXJ0c1dpdGgocmVhbFJvb3ROb3JtYWxpemVkICsgcGF0aC5zZXApO1xuICAgICAgICBpZiAoIXdpdGhpblJvb3QpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGBjYXB0dXJlIGRpciByZXNvbHZlZCBvdXRzaWRlIHRoZSBwcm9qZWN0IHJvb3Q6ICR7cmVhbERpck5vcm1hbGl6ZWR9IG5vdCB3aXRoaW4gJHtyZWFsUm9vdE5vcm1hbGl6ZWR9YCB9O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7IG9rOiB0cnVlLCBmaWxlUGF0aCwgZGlyOiBkaXJSZXN1bHQuZGlyIH07XG4gICAgfVxuXG4gICAgLy8gdjIuOC4xIHJvdW5kLTEgZml4IChHZW1pbmkg8J+UtCArIENvZGV4IPCfn6EpOiB3aGVuIGNhbGxlciBwYXNzZXMgYW5cbiAgICAvLyBleHBsaWNpdCBzYXZlUGF0aCAvIHNhdmVQYXRoUHJlZml4LCB3ZSBzdGlsbCBuZWVkIHRoZSBzYW1lIHByb2plY3QtXG4gICAgLy8gcm9vdCBjb250YWlubWVudCBndWFyYW50ZWUgdGhhdCByZXNvbHZlQXV0b0NhcHR1cmVGaWxlIGdpdmVzIHRoZVxuICAgIC8vIGF1dG8tbmFtZWQgYnJhbmNoLiBBSS1nZW5lcmF0ZWQgYWJzb2x1dGUgcGF0aHMgY291bGQgb3RoZXJ3aXNlXG4gICAgLy8gd3JpdGUgb3V0c2lkZSB0aGUgcHJvamVjdCByb290LlxuICAgIC8vXG4gICAgLy8gVGhlIGNoZWNrIHJlc29sdmVzIHRoZSBwYXJlbnQgZGlyZWN0b3J5ICh0aGUgZmlsZSBpdHNlbGYgbWF5IG5vdFxuICAgIC8vIGV4aXN0IHlldCkgYW5kIHJlcXVpcmVzIGl0IHRvIGJlIGluc2lkZSBgcmVhbHBhdGgoRWRpdG9yLlByb2plY3QucGF0aClgLlxuICAgIHByaXZhdGUgYXNzZXJ0U2F2ZVBhdGhXaXRoaW5Qcm9qZWN0KHNhdmVQYXRoOiBzdHJpbmcpOiB7IG9rOiB0cnVlOyByZXNvbHZlZFBhdGg6IHN0cmluZyB9IHwgeyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmcgfSB7XG4gICAgICAgIGNvbnN0IHByb2plY3RQYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQgPSBFZGl0b3I/LlByb2plY3Q/LnBhdGg7XG4gICAgICAgIGlmICghcHJvamVjdFBhdGgpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6ICdFZGl0b3IuUHJvamVjdC5wYXRoIGlzIG5vdCBhdmFpbGFibGU7IGNhbm5vdCB2YWxpZGF0ZSBleHBsaWNpdCBzYXZlUGF0aC4nIH07XG4gICAgICAgIH1cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJwOiBhbnkgPSBmcy5yZWFscGF0aFN5bmMgYXMgYW55O1xuICAgICAgICAgICAgY29uc3QgcmVzb2x2ZVJlYWwgPSBycC5uYXRpdmUgPz8gcnA7XG4gICAgICAgICAgICBjb25zdCByZWFsUHJvamVjdFJvb3QgPSByZXNvbHZlUmVhbChwcm9qZWN0UGF0aCk7XG4gICAgICAgICAgICAvLyB2Mi44LjIgcmV0ZXN0IGZpeCAoQ29kZXggcjIg8J+foSAjMSk6IGEgcmVsYXRpdmUgc2F2ZVBhdGggd291bGRcbiAgICAgICAgICAgIC8vIG1ha2UgYHBhdGguZGlybmFtZShzYXZlUGF0aClgIGNvbGxhcHNlIHRvICcuJyBhbmQgcmVzb2x2ZSB0b1xuICAgICAgICAgICAgLy8gdGhlIGhvc3QgcHJvY2VzcyBjd2QgKG9mdGVuIGA8ZWRpdG9yLWluc3RhbGw+L0NvY29zRGFzaGJvYXJkYClcbiAgICAgICAgICAgIC8vIHJhdGhlciB0aGFuIHRoZSBwcm9qZWN0IHJvb3QuIEFuY2hvciByZWxhdGl2ZSBwYXRocyBhZ2FpbnN0XG4gICAgICAgICAgICAvLyB0aGUgcHJvamVjdCByb290IGV4cGxpY2l0bHkgc28gdGhlIEFJJ3MgaW50dWl0aXZlIFwicmVsYXRpdmVcbiAgICAgICAgICAgIC8vIHRvIG15IHByb2plY3RcIiBpbnRlcnByZXRhdGlvbiBpcyB3aGF0IHRoZSBjaGVjayBlbmZvcmNlcy5cbiAgICAgICAgICAgIGNvbnN0IGFic29sdXRlU2F2ZVBhdGggPSBwYXRoLmlzQWJzb2x1dGUoc2F2ZVBhdGgpXG4gICAgICAgICAgICAgICAgPyBzYXZlUGF0aFxuICAgICAgICAgICAgICAgIDogcGF0aC5yZXNvbHZlKHByb2plY3RQYXRoLCBzYXZlUGF0aCk7XG4gICAgICAgICAgICBjb25zdCBwYXJlbnQgPSBwYXRoLmRpcm5hbWUoYWJzb2x1dGVTYXZlUGF0aCk7XG4gICAgICAgICAgICAvLyBQYXJlbnQgbXVzdCBhbHJlYWR5IGV4aXN0IGZvciByZWFscGF0aDsgaWYgaXQgZG9lc24ndCwgdGhlXG4gICAgICAgICAgICAvLyB3cml0ZSB3b3VsZCBmYWlsIGFueXdheSwgYnV0IHJldHVybiBhIGNsZWFyZXIgZXJyb3IgaGVyZS5cbiAgICAgICAgICAgIGxldCByZWFsUGFyZW50OiBzdHJpbmc7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHJlYWxQYXJlbnQgPSByZXNvbHZlUmVhbChwYXJlbnQpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBgc2F2ZVBhdGggcGFyZW50IGRpciBtaXNzaW5nIG9yIHVucmVhZGFibGU6ICR7ZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpfWAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHJlYWxQYXJlbnROb3JtYWxpemVkID0gcGF0aC5yZXNvbHZlKHJlYWxQYXJlbnQpO1xuICAgICAgICAgICAgY29uc3QgcmVhbFJvb3ROb3JtYWxpemVkID0gcGF0aC5yZXNvbHZlKHJlYWxQcm9qZWN0Um9vdCk7XG4gICAgICAgICAgICBjb25zdCB3aXRoaW4gPSByZWFsUGFyZW50Tm9ybWFsaXplZCA9PT0gcmVhbFJvb3ROb3JtYWxpemVkXG4gICAgICAgICAgICAgICAgfHwgcmVhbFBhcmVudE5vcm1hbGl6ZWQuc3RhcnRzV2l0aChyZWFsUm9vdE5vcm1hbGl6ZWQgKyBwYXRoLnNlcCk7XG4gICAgICAgICAgICBpZiAoIXdpdGhpbikge1xuICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgIG9rOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGBzYXZlUGF0aCByZXNvbHZlZCBvdXRzaWRlIHRoZSBwcm9qZWN0IHJvb3Q6ICR7cmVhbFBhcmVudE5vcm1hbGl6ZWR9IG5vdCB3aXRoaW4gJHtyZWFsUm9vdE5vcm1hbGl6ZWR9LiBVc2UgYSBwYXRoIGluc2lkZSA8cHJvamVjdD4vIG9yIG9taXQgc2F2ZVBhdGggdG8gYXV0by1uYW1lIGludG8gPHByb2plY3Q+L3RlbXAvbWNwLWNhcHR1cmVzLmAsXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB7IG9rOiB0cnVlLCByZXNvbHZlZFBhdGg6IGFic29sdXRlU2F2ZVBhdGggfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGBzYXZlUGF0aCByZWFscGF0aCBmYWlsZWQ6ICR7ZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpfWAgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgc2NyZWVuc2hvdChzYXZlUGF0aD86IHN0cmluZywgd2luZG93VGl0bGU/OiBzdHJpbmcsIGluY2x1ZGVCYXNlNjQ6IGJvb2xlYW4gPSBmYWxzZSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBsZXQgZmlsZVBhdGggPSBzYXZlUGF0aDtcbiAgICAgICAgICAgIGlmICghZmlsZVBhdGgpIHtcbiAgICAgICAgICAgICAgICBjb25zdCByZXNvbHZlZCA9IHRoaXMucmVzb2x2ZUF1dG9DYXB0dXJlRmlsZShgc2NyZWVuc2hvdC0ke0RhdGUubm93KCl9LnBuZ2ApO1xuICAgICAgICAgICAgICAgIGlmICghcmVzb2x2ZWQub2spIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogcmVzb2x2ZWQuZXJyb3IgfTtcbiAgICAgICAgICAgICAgICBmaWxlUGF0aCA9IHJlc29sdmVkLmZpbGVQYXRoO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyB2Mi44LjEgcm91bmQtMSBmaXggKEdlbWluaSDwn5S0ICsgQ29kZXgg8J+foSk6IGV4cGxpY2l0IHNhdmVQYXRoXG4gICAgICAgICAgICAgICAgLy8gYWxzbyBnZXRzIGNvbnRhaW5tZW50LWNoZWNrZWQuIEFJLWdlbmVyYXRlZCBwYXRocyBjb3VsZFxuICAgICAgICAgICAgICAgIC8vIG90aGVyd2lzZSB3cml0ZSBvdXRzaWRlIHRoZSBwcm9qZWN0IHJvb3QuXG4gICAgICAgICAgICAgICAgLy8gdjIuOC4yIHJldGVzdCBmaXg6IHVzZSB0aGUgaGVscGVyJ3MgcmVzb2x2ZWRQYXRoIHNvIGFcbiAgICAgICAgICAgICAgICAvLyByZWxhdGl2ZSBzYXZlUGF0aCBhY3R1YWxseSBsYW5kcyBpbnNpZGUgdGhlIHByb2plY3Qgcm9vdC5cbiAgICAgICAgICAgICAgICBjb25zdCBndWFyZCA9IHRoaXMuYXNzZXJ0U2F2ZVBhdGhXaXRoaW5Qcm9qZWN0KGZpbGVQYXRoKTtcbiAgICAgICAgICAgICAgICBpZiAoIWd1YXJkLm9rKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGd1YXJkLmVycm9yIH07XG4gICAgICAgICAgICAgICAgZmlsZVBhdGggPSBndWFyZC5yZXNvbHZlZFBhdGg7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCB3aW4gPSB0aGlzLnBpY2tXaW5kb3cod2luZG93VGl0bGUpO1xuICAgICAgICAgICAgY29uc3QgaW1hZ2UgPSBhd2FpdCB3aW4ud2ViQ29udGVudHMuY2FwdHVyZVBhZ2UoKTtcbiAgICAgICAgICAgIGNvbnN0IHBuZzogQnVmZmVyID0gaW1hZ2UudG9QTkcoKTtcbiAgICAgICAgICAgIGZzLndyaXRlRmlsZVN5bmMoZmlsZVBhdGgsIHBuZyk7XG4gICAgICAgICAgICBjb25zdCBkYXRhOiBhbnkgPSB7XG4gICAgICAgICAgICAgICAgZmlsZVBhdGgsXG4gICAgICAgICAgICAgICAgc2l6ZTogcG5nLmxlbmd0aCxcbiAgICAgICAgICAgICAgICB3aW5kb3dUaXRsZTogdHlwZW9mIHdpbi5nZXRUaXRsZSA9PT0gJ2Z1bmN0aW9uJyA/IHdpbi5nZXRUaXRsZSgpIDogJycsXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgaWYgKGluY2x1ZGVCYXNlNjQpIHtcbiAgICAgICAgICAgICAgICBkYXRhLmRhdGFVcmkgPSBgZGF0YTppbWFnZS9wbmc7YmFzZTY0LCR7cG5nLnRvU3RyaW5nKCdiYXNlNjQnKX1gO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZGF0YSwgbWVzc2FnZTogYFNjcmVlbnNob3Qgc2F2ZWQgdG8gJHtmaWxlUGF0aH1gIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKSB9O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gdjIuNy4wICM0OiBQcmV2aWV3LXdpbmRvdyBzY3JlZW5zaG90LlxuICAgIC8vIHYyLjguMyBULVYyODMtMTogZXh0ZW5kZWQgdG8gaGFuZGxlIGNvY29zIGVtYmVkZGVkIHByZXZpZXcgbW9kZS5cbiAgICAvL1xuICAgIC8vIE1vZGUgZGlzcGF0Y2g6XG4gICAgLy8gICAtIFwid2luZG93XCI6ICAgcmVxdWlyZSBhIFByZXZpZXctdGl0bGVkIEJyb3dzZXJXaW5kb3c7IGZhaWwgaWYgbm9uZS5cbiAgICAvLyAgICAgICAgICAgICAgICAgT3JpZ2luYWwgdjIuNy4wIGJlaGF2aW91ci4gVXNlIHdoZW4gY29jb3MgcHJldmlld1xuICAgIC8vICAgICAgICAgICAgICAgICBjb25maWcgaXMgXCJ3aW5kb3dcIiAvIFwic2ltdWxhdG9yXCIgKHNlcGFyYXRlIHdpbmRvdykuXG4gICAgLy8gICAtIFwiZW1iZWRkZWRcIjogc2tpcCB0aGUgd2luZG93IHByb2JlIGFuZCBjYXB0dXJlIHRoZSBtYWluIGVkaXRvclxuICAgIC8vICAgICAgICAgICAgICAgICBCcm93c2VyV2luZG93IGRpcmVjdGx5LiBVc2Ugd2hlbiBjb2NvcyBwcmV2aWV3IGNvbmZpZ1xuICAgIC8vICAgICAgICAgICAgICAgICBpcyBcImVtYmVkZGVkXCIgKGdhbWV2aWV3IHJlbmRlcnMgaW5zaWRlIG1haW4gZWRpdG9yKS5cbiAgICAvLyAgIC0gXCJhdXRvXCI6ICAgICB0cnkgXCJ3aW5kb3dcIiBmaXJzdDsgaWYgbm8gUHJldmlldy10aXRsZWQgd2luZG93IGlzXG4gICAgLy8gICAgICAgICAgICAgICAgIGZvdW5kLCBmYWxsIGJhY2sgdG8gXCJlbWJlZGRlZFwiIGFuZCBzdXJmYWNlIGEgaGludFxuICAgIC8vICAgICAgICAgICAgICAgICBpbiB0aGUgcmVzcG9uc2UgbWVzc2FnZS4gRGVmYXVsdCDigJQga2VlcHMgdGhlIGhhcHB5XG4gICAgLy8gICAgICAgICAgICAgICAgIHBhdGggd29ya2luZyB3aXRob3V0IGNhbGxlciBrbm93bGVkZ2Ugb2YgY29jb3NcbiAgICAvLyAgICAgICAgICAgICAgICAgcHJldmlldyBjb25maWcuXG4gICAgLy9cbiAgICAvLyBCcm93c2VyLW1vZGUgKFBJRSByZW5kZXJlZCB0byB1c2VyJ3MgZXh0ZXJuYWwgYnJvd3NlciB2aWFcbiAgICAvLyBzaGVsbC5vcGVuRXh0ZXJuYWwpIGlzIE5PVCBjYXB0dXJhYmxlIGhlcmUg4oCUIHRoZSBwYWdlIGxpdmVzIGluXG4gICAgLy8gYSBub24tRWxlY3Ryb24gYnJvd3NlciBwcm9jZXNzLiBBSSBjYW4gZGV0ZWN0IHRoaXMgdmlhXG4gICAgLy8gZGVidWdfZ2V0X3ByZXZpZXdfbW9kZSBhbmQgc2tpcCB0aGUgY2FsbC5cbiAgICBwcml2YXRlIGFzeW5jIGNhcHR1cmVQcmV2aWV3U2NyZWVuc2hvdChcbiAgICAgICAgc2F2ZVBhdGg/OiBzdHJpbmcsXG4gICAgICAgIG1vZGU6ICdhdXRvJyB8ICd3aW5kb3cnIHwgJ2VtYmVkZGVkJyA9ICdhdXRvJyxcbiAgICAgICAgd2luZG93VGl0bGU6IHN0cmluZyA9ICdQcmV2aWV3JyxcbiAgICAgICAgaW5jbHVkZUJhc2U2NDogYm9vbGVhbiA9IGZhbHNlLFxuICAgICk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLXZhci1yZXF1aXJlc1xuICAgICAgICAgICAgY29uc3QgZWxlY3Ryb24gPSByZXF1aXJlKCdlbGVjdHJvbicpO1xuICAgICAgICAgICAgY29uc3QgQlcgPSBlbGVjdHJvbi5Ccm93c2VyV2luZG93O1xuXG4gICAgICAgICAgICAvLyBSZXNvbHZlIHRoZSB0YXJnZXQgd2luZG93IHBlciBtb2RlLlxuICAgICAgICAgICAgY29uc3QgcHJvYmVXaW5kb3dNb2RlID0gKCk6IHsgb2s6IHRydWU7IHdpbjogYW55IH0gfCB7IG9rOiBmYWxzZTsgZXJyb3I6IHN0cmluZzsgdmlzaWJsZVRpdGxlczogc3RyaW5nW10gfSA9PiB7XG4gICAgICAgICAgICAgICAgLy8gdjIuNy4xIHJldmlldyBmaXggKGNsYXVkZSDwn5+hICsgY29kZXgg8J+foSk6IHdpdGggdGhlIGRlZmF1bHRcbiAgICAgICAgICAgICAgICAvLyB3aW5kb3dUaXRsZT0nUHJldmlldycgYSBDaGluZXNlIC8gbG9jYWxpemVkIGNvY29zIGVkaXRvclxuICAgICAgICAgICAgICAgIC8vIHdob3NlIG1haW4gd2luZG93IHRpdGxlIGNvbnRhaW5zIFwiUHJldmlld1wiIChlLmcuIFwiQ29jb3NcbiAgICAgICAgICAgICAgICAvLyBDcmVhdG9yIFByZXZpZXcgLSA8UHJvamVjdE5hbWU+XCIpIHdvdWxkIGZhbHNlbHkgbWF0Y2guXG4gICAgICAgICAgICAgICAgLy8gRGlzYW1iaWd1YXRlIGJ5IGV4Y2x1ZGluZyBhbnkgdGl0bGUgdGhhdCBBTFNPIGNvbnRhaW5zXG4gICAgICAgICAgICAgICAgLy8gXCJDb2NvcyBDcmVhdG9yXCIgd2hlbiB0aGUgY2FsbGVyIHN0dWNrIHdpdGggdGhlIGRlZmF1bHQuXG4gICAgICAgICAgICAgICAgY29uc3QgdXNpbmdEZWZhdWx0ID0gd2luZG93VGl0bGUgPT09ICdQcmV2aWV3JztcbiAgICAgICAgICAgICAgICBjb25zdCBhbGxUaXRsZXM6IHN0cmluZ1tdID0gQlc/LmdldEFsbFdpbmRvd3M/LigpPy5tYXAoKHc6IGFueSkgPT4gdy5nZXRUaXRsZT8uKCkgPz8gJycpLmZpbHRlcihCb29sZWFuKSA/PyBbXTtcbiAgICAgICAgICAgICAgICBjb25zdCBtYXRjaGVzID0gQlc/LmdldEFsbFdpbmRvd3M/LigpPy5maWx0ZXIoKHc6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXcgfHwgdy5pc0Rlc3Ryb3llZCgpKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRpdGxlID0gdy5nZXRUaXRsZT8uKCkgfHwgJyc7XG4gICAgICAgICAgICAgICAgICAgIGlmICghdGl0bGUuaW5jbHVkZXMod2luZG93VGl0bGUpKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIGlmICh1c2luZ0RlZmF1bHQgJiYgL0NvY29zXFxzKkNyZWF0b3IvaS50ZXN0KHRpdGxlKSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9KSA/PyBbXTtcbiAgICAgICAgICAgICAgICBpZiAobWF0Y2hlcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogYE5vIEVsZWN0cm9uIHdpbmRvdyB0aXRsZSBjb250YWlucyBcIiR7d2luZG93VGl0bGV9XCIke3VzaW5nRGVmYXVsdCA/ICcgKGFuZCBpcyBub3QgdGhlIG1haW4gZWRpdG9yKScgOiAnJ30uYCwgdmlzaWJsZVRpdGxlczogYWxsVGl0bGVzIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiB7IG9rOiB0cnVlLCB3aW46IG1hdGNoZXNbMF0gfTtcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGNvbnN0IHByb2JlRW1iZWRkZWRNb2RlID0gKCk6IHsgb2s6IHRydWU7IHdpbjogYW55IH0gfCB7IG9rOiBmYWxzZTsgZXJyb3I6IHN0cmluZyB9ID0+IHtcbiAgICAgICAgICAgICAgICAvLyBFbWJlZGRlZCBQSUUgcmVuZGVycyBpbnNpZGUgdGhlIG1haW4gZWRpdG9yIEJyb3dzZXJXaW5kb3cuXG4gICAgICAgICAgICAgICAgLy8gUGljayB0aGUgc2FtZSBoZXVyaXN0aWMgYXMgcGlja1dpbmRvdygpOiBwcmVmZXIgYSBub24tXG4gICAgICAgICAgICAgICAgLy8gUHJldmlldyB3aW5kb3cuIENvY29zIG1haW4gZWRpdG9yJ3MgdGl0bGUgdHlwaWNhbGx5XG4gICAgICAgICAgICAgICAgLy8gY29udGFpbnMgXCJDb2NvcyBDcmVhdG9yXCIg4oCUIG1hdGNoIHRoYXQgdG8gaWRlbnRpZnkgaXQuXG4gICAgICAgICAgICAgICAgY29uc3QgYWxsOiBhbnlbXSA9IEJXPy5nZXRBbGxXaW5kb3dzPy4oKT8uZmlsdGVyKCh3OiBhbnkpID0+IHcgJiYgIXcuaXNEZXN0cm95ZWQoKSkgPz8gW107XG4gICAgICAgICAgICAgICAgaWYgKGFsbC5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogJ05vIGxpdmUgRWxlY3Ryb24gd2luZG93cyBhdmFpbGFibGU7IGNhbm5vdCBjYXB0dXJlIGVtYmVkZGVkIHByZXZpZXcuJyB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAvLyBQcmVmZXIgdGhlIGVkaXRvciBtYWluIHdpbmRvdyAodGl0bGUgY29udGFpbnMgXCJDb2Nvc1xuICAgICAgICAgICAgICAgIC8vIENyZWF0b3JcIikg4oCUIHRoYXQncyB3aGVyZSBlbWJlZGRlZCBQSUUgcmVuZGVycy5cbiAgICAgICAgICAgICAgICBjb25zdCBlZGl0b3IgPSBhbGwuZmluZCgodzogYW55KSA9PiAvQ29jb3NcXHMqQ3JlYXRvci9pLnRlc3Qody5nZXRUaXRsZT8uKCkgfHwgJycpKTtcbiAgICAgICAgICAgICAgICBpZiAoZWRpdG9yKSByZXR1cm4geyBvazogdHJ1ZSwgd2luOiBlZGl0b3IgfTtcbiAgICAgICAgICAgICAgICAvLyBGYWxsYmFjazogYW55IG5vbi1EZXZUb29scyAvIG5vbi1Xb3JrZXIgLyBub24tQmxhbmsgd2luZG93LlxuICAgICAgICAgICAgICAgIGNvbnN0IGNhbmRpZGF0ZSA9IGFsbC5maW5kKCh3OiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdCA9IHcuZ2V0VGl0bGU/LigpIHx8ICcnO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdCAmJiAhL0RldlRvb2xzfFdvcmtlciAtfF5CbGFuayQvLnRlc3QodCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgaWYgKGNhbmRpZGF0ZSkgcmV0dXJuIHsgb2s6IHRydWUsIHdpbjogY2FuZGlkYXRlIH07XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogJ05vIHN1aXRhYmxlIGVkaXRvciB3aW5kb3cgZm91bmQgZm9yIGVtYmVkZGVkIHByZXZpZXcgY2FwdHVyZS4nIH07XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBsZXQgd2luOiBhbnkgPSBudWxsO1xuICAgICAgICAgICAgbGV0IGNhcHR1cmVOb3RlOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgICAgICAgICAgIGxldCByZXNvbHZlZE1vZGU6ICd3aW5kb3cnIHwgJ2VtYmVkZGVkJyA9ICd3aW5kb3cnO1xuXG4gICAgICAgICAgICBpZiAobW9kZSA9PT0gJ3dpbmRvdycpIHtcbiAgICAgICAgICAgICAgICBjb25zdCByID0gcHJvYmVXaW5kb3dNb2RlKCk7XG4gICAgICAgICAgICAgICAgaWYgKCFyLm9rKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yOiBgJHtyLmVycm9yfSBMYXVuY2ggY29jb3MgcHJldmlldyBmaXJzdCB2aWEgdGhlIHRvb2xiYXIgcGxheSBidXR0b24gb3IgdmlhIGRlYnVnX3ByZXZpZXdfdXJsKGFjdGlvbj1cIm9wZW5cIikuIElmIHlvdXIgY29jb3MgcHJldmlldyBpcyBzZXQgdG8gXCJlbWJlZGRlZFwiLCBjYWxsIHRoaXMgdG9vbCB3aXRoIG1vZGU9XCJlbWJlZGRlZFwiIG9yIG1vZGU9XCJhdXRvXCIuIFZpc2libGUgd2luZG93IHRpdGxlczogJHtyLnZpc2libGVUaXRsZXMuam9pbignLCAnKSB8fCAnKG5vbmUpJ31gLFxuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB3aW4gPSByLndpbjtcbiAgICAgICAgICAgICAgICByZXNvbHZlZE1vZGUgPSAnd2luZG93JztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAobW9kZSA9PT0gJ2VtYmVkZGVkJykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHIgPSBwcm9iZUVtYmVkZGVkTW9kZSgpO1xuICAgICAgICAgICAgICAgIGlmICghci5vaykgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiByLmVycm9yIH07XG4gICAgICAgICAgICAgICAgd2luID0gci53aW47XG4gICAgICAgICAgICAgICAgcmVzb2x2ZWRNb2RlID0gJ2VtYmVkZGVkJztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gYXV0b1xuICAgICAgICAgICAgICAgIGNvbnN0IHdyID0gcHJvYmVXaW5kb3dNb2RlKCk7XG4gICAgICAgICAgICAgICAgaWYgKHdyLm9rKSB7XG4gICAgICAgICAgICAgICAgICAgIHdpbiA9IHdyLndpbjtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZWRNb2RlID0gJ3dpbmRvdyc7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZXIgPSBwcm9iZUVtYmVkZGVkTW9kZSgpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIWVyLm9rKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yOiBgJHt3ci5lcnJvcn0gJHtlci5lcnJvcn0gTGF1bmNoIGNvY29zIHByZXZpZXcgZmlyc3Qgb3IgY2hlY2sgZGVidWdfZ2V0X3ByZXZpZXdfbW9kZSB0byBzZWUgaG93IGNvY29zIGlzIGNvbmZpZ3VyZWQuIFZpc2libGUgd2luZG93IHRpdGxlczogJHt3ci52aXNpYmxlVGl0bGVzLmpvaW4oJywgJykgfHwgJyhub25lKSd9YCxcbiAgICAgICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgd2luID0gZXIud2luO1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlZE1vZGUgPSAnZW1iZWRkZWQnO1xuICAgICAgICAgICAgICAgICAgICAvLyB2Mi44LjQgcmV0ZXN0IGZpbmRpbmc6IHdoZW4gY29jb3MgcHJldmlldyBpcyBzZXRcbiAgICAgICAgICAgICAgICAgICAgLy8gdG8gXCJicm93c2VyXCIsIGF1dG8tZmFsbGJhY2sgQUxTTyBncmFicyB0aGUgbWFpblxuICAgICAgICAgICAgICAgICAgICAvLyBlZGl0b3Igd2luZG93IChiZWNhdXNlIG5vIFByZXZpZXctdGl0bGVkIHdpbmRvd1xuICAgICAgICAgICAgICAgICAgICAvLyBleGlzdHMpIOKAlCBidXQgaW4gYnJvd3NlciBtb2RlIHRoZSBhY3R1YWwgZ2FtZXZpZXdcbiAgICAgICAgICAgICAgICAgICAgLy8gbGl2ZXMgaW4gdGhlIHVzZXIncyBleHRlcm5hbCBicm93c2VyLCBOT1QgaW4gdGhlXG4gICAgICAgICAgICAgICAgICAgIC8vIGNhcHR1cmVkIEVsZWN0cm9uIHdpbmRvdy4gRG9uJ3QgY2xhaW0gXCJlbWJlZGRlZFxuICAgICAgICAgICAgICAgICAgICAvLyBwcmV2aWV3IG1vZGVcIiDigJQgdGhhdCdzIGEgZ3Vlc3MsIGFuZCB3cm9uZyB3aGVuXG4gICAgICAgICAgICAgICAgICAgIC8vIHVzZXIgaXMgb24gYnJvd3NlciBjb25maWcuIFByb2JlIHRoZSByZWFsIGNvbmZpZ1xuICAgICAgICAgICAgICAgICAgICAvLyBhbmQgdGFpbG9yIHRoZSBoaW50IHBlciBtb2RlLlxuICAgICAgICAgICAgICAgICAgICBsZXQgYWN0dWFsTW9kZTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjZmc6IGFueSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgJ3ByZWZlcmVuY2VzJywgJ3F1ZXJ5LWNvbmZpZycgYXMgYW55LCAncHJldmlldycgYXMgYW55LFxuICAgICAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHBsYXRmb3JtID0gY2ZnPy5wcmV2aWV3Py5jdXJyZW50Py5wbGF0Zm9ybTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgcGxhdGZvcm0gPT09ICdzdHJpbmcnKSBhY3R1YWxNb2RlID0gcGxhdGZvcm07XG4gICAgICAgICAgICAgICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gYmVzdC1lZmZvcnQ7IGZhbGwgdGhyb3VnaCB3aXRoIG5ldXRyYWwgaGludFxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGlmIChhY3R1YWxNb2RlID09PSAnYnJvd3NlcicpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhcHR1cmVOb3RlID0gJ05vIFByZXZpZXctdGl0bGVkIHdpbmRvdyBmb3VuZDsgY2FwdHVyZWQgdGhlIG1haW4gZWRpdG9yIHdpbmRvdy4gTk9URTogY29jb3MgcHJldmlldyBpcyBzZXQgdG8gXCJicm93c2VyXCIg4oCUIHRoZSBhY3R1YWwgcHJldmlldyBjb250ZW50IGlzIHJlbmRlcmVkIGluIHlvdXIgZXh0ZXJuYWwgYnJvd3NlciAoTk9UIGluIHRoaXMgaW1hZ2UpLiBGb3IgcnVudGltZSBjYW52YXMgY2FwdHVyZSBpbiBicm93c2VyIG1vZGUgdXNlIGRlYnVnX2dhbWVfY29tbWFuZCh0eXBlPVwic2NyZWVuc2hvdFwiKSB2aWEgYSBHYW1lRGVidWdDbGllbnQgcnVubmluZyBvbiB0aGUgYnJvd3NlciBwcmV2aWV3IHBhZ2UuJztcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChhY3R1YWxNb2RlID09PSAnZ2FtZVZpZXcnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXB0dXJlTm90ZSA9ICdObyBQcmV2aWV3LXRpdGxlZCB3aW5kb3cgZm91bmQ7IGNhcHR1cmVkIHRoZSBtYWluIGVkaXRvciB3aW5kb3cgKGNvY29zIHByZXZpZXcgaXMgc2V0IHRvIFwiZ2FtZVZpZXdcIiBlbWJlZGRlZCDigJQgdGhlIGVkaXRvciBnYW1ldmlldyBJUyB3aGVyZSBwcmV2aWV3IHJlbmRlcnMsIHNvIHRoaXMgaW1hZ2UgaXMgY29ycmVjdCkuJztcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChhY3R1YWxNb2RlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXB0dXJlTm90ZSA9IGBObyBQcmV2aWV3LXRpdGxlZCB3aW5kb3cgZm91bmQ7IGNhcHR1cmVkIHRoZSBtYWluIGVkaXRvciB3aW5kb3cuIGNvY29zIHByZXZpZXcgaXMgc2V0IHRvIFwiJHthY3R1YWxNb2RlfVwiIOKAlCB2ZXJpZnkgdGhpcyBpbWFnZSBhY3R1YWxseSBjb250YWlucyB0aGUgZ2FtZXZpZXcgeW91IHdhbnRlZDsgZm9yIHJ1bnRpbWUgY2FudmFzIGNhcHR1cmUgcHJlZmVyIGRlYnVnX2dhbWVfY29tbWFuZCB2aWEgR2FtZURlYnVnQ2xpZW50LmA7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXB0dXJlTm90ZSA9ICdObyBQcmV2aWV3LXRpdGxlZCB3aW5kb3cgZm91bmQ7IGNhcHR1cmVkIHRoZSBtYWluIGVkaXRvciB3aW5kb3cuIENvdWxkIG5vdCBkZXRlcm1pbmUgY29jb3MgcHJldmlldyBtb2RlIChkZWJ1Z19nZXRfcHJldmlld19tb2RlIG1pZ2h0IGdpdmUgbW9yZSBpbmZvKS4gSWYgeW91ciBjb2NvcyBwcmV2aWV3IGlzIHNldCB0byBcImJyb3dzZXJcIiwgdGhlIGFjdHVhbCBwcmV2aWV3IGNvbnRlbnQgaXMgaW4geW91ciBleHRlcm5hbCBicm93c2VyIGFuZCBpcyBOT1QgaW4gdGhpcyBpbWFnZS4nO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBsZXQgZmlsZVBhdGggPSBzYXZlUGF0aDtcbiAgICAgICAgICAgIGlmICghZmlsZVBhdGgpIHtcbiAgICAgICAgICAgICAgICBjb25zdCByZXNvbHZlZCA9IHRoaXMucmVzb2x2ZUF1dG9DYXB0dXJlRmlsZShgcHJldmlldy0ke0RhdGUubm93KCl9LnBuZ2ApO1xuICAgICAgICAgICAgICAgIGlmICghcmVzb2x2ZWQub2spIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogcmVzb2x2ZWQuZXJyb3IgfTtcbiAgICAgICAgICAgICAgICBmaWxlUGF0aCA9IHJlc29sdmVkLmZpbGVQYXRoO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyB2Mi44LjEgcm91bmQtMSBmaXggKEdlbWluaSDwn5S0ICsgQ29kZXgg8J+foSk6IGV4cGxpY2l0IHNhdmVQYXRoXG4gICAgICAgICAgICAgICAgLy8gYWxzbyBnZXRzIGNvbnRhaW5tZW50LWNoZWNrZWQuXG4gICAgICAgICAgICAgICAgLy8gdjIuOC4yIHJldGVzdCBmaXg6IHVzZSByZXNvbHZlZFBhdGggZm9yIHJlbGF0aXZlLXBhdGggc3VwcG9ydC5cbiAgICAgICAgICAgICAgICBjb25zdCBndWFyZCA9IHRoaXMuYXNzZXJ0U2F2ZVBhdGhXaXRoaW5Qcm9qZWN0KGZpbGVQYXRoKTtcbiAgICAgICAgICAgICAgICBpZiAoIWd1YXJkLm9rKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGd1YXJkLmVycm9yIH07XG4gICAgICAgICAgICAgICAgZmlsZVBhdGggPSBndWFyZC5yZXNvbHZlZFBhdGg7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBpbWFnZSA9IGF3YWl0IHdpbi53ZWJDb250ZW50cy5jYXB0dXJlUGFnZSgpO1xuICAgICAgICAgICAgY29uc3QgcG5nOiBCdWZmZXIgPSBpbWFnZS50b1BORygpO1xuICAgICAgICAgICAgZnMud3JpdGVGaWxlU3luYyhmaWxlUGF0aCwgcG5nKTtcbiAgICAgICAgICAgIGNvbnN0IGRhdGE6IGFueSA9IHtcbiAgICAgICAgICAgICAgICBmaWxlUGF0aCxcbiAgICAgICAgICAgICAgICBzaXplOiBwbmcubGVuZ3RoLFxuICAgICAgICAgICAgICAgIHdpbmRvd1RpdGxlOiB0eXBlb2Ygd2luLmdldFRpdGxlID09PSAnZnVuY3Rpb24nID8gd2luLmdldFRpdGxlKCkgOiAnJyxcbiAgICAgICAgICAgICAgICBtb2RlOiByZXNvbHZlZE1vZGUsXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgaWYgKGNhcHR1cmVOb3RlKSBkYXRhLm5vdGUgPSBjYXB0dXJlTm90ZTtcbiAgICAgICAgICAgIGlmIChpbmNsdWRlQmFzZTY0KSB7XG4gICAgICAgICAgICAgICAgZGF0YS5kYXRhVXJpID0gYGRhdGE6aW1hZ2UvcG5nO2Jhc2U2NCwke3BuZy50b1N0cmluZygnYmFzZTY0Jyl9YDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IG1lc3NhZ2UgPSBjYXB0dXJlTm90ZVxuICAgICAgICAgICAgICAgID8gYFByZXZpZXcgc2NyZWVuc2hvdCBzYXZlZCB0byAke2ZpbGVQYXRofSAoJHtjYXB0dXJlTm90ZX0pYFxuICAgICAgICAgICAgICAgIDogYFByZXZpZXcgc2NyZWVuc2hvdCBzYXZlZCB0byAke2ZpbGVQYXRofSAobW9kZT0ke3Jlc29sdmVkTW9kZX0pYDtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGEsIG1lc3NhZ2UgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpIH07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyB2Mi44LjMgVC1WMjgzLTI6IHJlYWQgY29jb3MgcHJldmlldyBjb25maWcgc28gQUkgY2FuIHJvdXRlXG4gICAgLy8gY2FwdHVyZV9wcmV2aWV3X3NjcmVlbnNob3QgdG8gdGhlIGNvcnJlY3QgbW9kZSB3aXRob3V0IGd1ZXNzaW5nLlxuICAgIC8vIFJlYWRzIHZpYSBFZGl0b3IuTWVzc2FnZSBwcmVmZXJlbmNlcy9xdWVyeS1jb25maWcgKHR5cGVkIGluXG4gICAgLy8gbm9kZV9tb2R1bGVzL0Bjb2Nvcy9jcmVhdG9yLXR5cGVzLy4uLi9wcmVmZXJlbmNlcy9AdHlwZXMvbWVzc2FnZS5kLnRzKS5cbiAgICAvL1xuICAgIC8vIFdlIGR1bXAgdGhlIGZ1bGwgJ3ByZXZpZXcnIGNhdGVnb3J5LCB0aGVuIHRyeSB0byBpbnRlcnByZXQgYSBmZXdcbiAgICAvLyBjb21tb24ga2V5cyAoJ29wZW5fcHJldmlld193aXRoJywgJ3ByZXZpZXdfd2l0aCcsICdzaW11bGF0b3InLFxuICAgIC8vICdicm93c2VyJykgaW50byBhIG5vcm1hbGl6ZWQgbW9kZSBsYWJlbC4gSWYgaW50ZXJwcmV0YXRpb24gZmFpbHMsXG4gICAgLy8gd2Ugc3RpbGwgcmV0dXJuIHRoZSByYXcgY29uZmlnIHNvIHRoZSBBSSBjYW4gcmVhZCBpdCBkaXJlY3RseS5cbiAgICBwcml2YXRlIGFzeW5jIGdldFByZXZpZXdNb2RlKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBQcm9iZSBhdCBtb2R1bGUgbGV2ZWwgKG5vIGtleSkgdG8gZ2V0IHRoZSB3aG9sZSBjYXRlZ29yeS5cbiAgICAgICAgICAgIGNvbnN0IHJhdzogYW55ID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgncHJlZmVyZW5jZXMnLCAncXVlcnktY29uZmlnJyBhcyBhbnksICdwcmV2aWV3JyBhcyBhbnkpIGFzIGFueTtcbiAgICAgICAgICAgIGlmIChyYXcgPT09IHVuZGVmaW5lZCB8fCByYXcgPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgZXJyb3I6ICdwcmVmZXJlbmNlcy9xdWVyeS1jb25maWcgcmV0dXJuZWQgbnVsbCBmb3IgXCJwcmV2aWV3XCIg4oCUIGNvY29zIG1heSBub3QgZXhwb3NlIHRoaXMgY2F0ZWdvcnksIG9yIHlvdXIgYnVpbGQgZGlmZmVycyBmcm9tIDMuOC54LicsXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIEhldXJpc3RpYyBpbnRlcnByZXRhdGlvbi5cbiAgICAgICAgICAgIC8vIHYyLjguMyByZXRlc3QgZmluZGluZzogY29jb3MgMy44LjcgYWN0dWFsbHkgc3RvcmVzIHRoZVxuICAgICAgICAgICAgLy8gYWN0aXZlIG1vZGUgYXQgYHByZXZpZXcuY3VycmVudC5wbGF0Zm9ybWAgd2l0aCB2YWx1ZVxuICAgICAgICAgICAgLy8gYFwiZ2FtZVZpZXdcImAgKGVtYmVkZGVkKSwgYFwiYnJvd3NlclwiYCwgb3IgZGV2aWNlIG5hbWVzXG4gICAgICAgICAgICAvLyAoc2ltdWxhdG9yKS4gVGhlIG9yaWdpbmFsIGhldXJpc3RpYyBvbmx5IGNoZWNrZWQga2V5cyBsaWtlXG4gICAgICAgICAgICAvLyBgb3Blbl9wcmV2aWV3X3dpdGhgIC8gYHByZXZpZXdfd2l0aGAgLyBgb3Blbl93aXRoYCAvIGBtb2RlYFxuICAgICAgICAgICAgLy8gYW5kIG1pc3NlZCB0aGUgbGl2ZSBrZXkuIFByb2JlIGBjdXJyZW50LnBsYXRmb3JtYCBmaXJzdDtcbiAgICAgICAgICAgIC8vIGtlZXAgdGhlIGxlZ2FjeSBrZXlzIGFzIGZhbGxiYWNrIGZvciBvbGRlciBjb2NvcyB2ZXJzaW9ucy5cbiAgICAgICAgICAgIGNvbnN0IGxvd2VyID0gKHM6IGFueSkgPT4gKHR5cGVvZiBzID09PSAnc3RyaW5nJyA/IHMudG9Mb3dlckNhc2UoKSA6ICcnKTtcbiAgICAgICAgICAgIGxldCBpbnRlcnByZXRlZDogJ2Jyb3dzZXInIHwgJ3dpbmRvdycgfCAnc2ltdWxhdG9yJyB8ICdlbWJlZGRlZCcgfCAndW5rbm93bicgPSAndW5rbm93bic7XG4gICAgICAgICAgICBsZXQgaW50ZXJwcmV0ZWRGcm9tS2V5OiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgICAgICAgICAgIGNvbnN0IGNsYXNzaWZ5ID0gKHY6IHN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGx2ID0gbG93ZXIodik7XG4gICAgICAgICAgICAgICAgaWYgKGx2LmluY2x1ZGVzKCdicm93c2VyJykpIHJldHVybiAnYnJvd3Nlcic7XG4gICAgICAgICAgICAgICAgaWYgKGx2LmluY2x1ZGVzKCdzaW11bGF0b3InKSkgcmV0dXJuICdzaW11bGF0b3InO1xuICAgICAgICAgICAgICAgIGlmIChsdi5pbmNsdWRlcygnZW1iZWQnKSB8fCBsdi5pbmNsdWRlcygnZ2FtZXZpZXcnKSB8fCBsdi5pbmNsdWRlcygnZ2FtZV92aWV3JykpIHJldHVybiAnZW1iZWRkZWQnO1xuICAgICAgICAgICAgICAgIGlmIChsdi5pbmNsdWRlcygnd2luZG93JykpIHJldHVybiAnd2luZG93JztcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBjb25zdCBkaWcgPSAob2JqOiBhbnksIHBhdGg6IHN0cmluZyk6IGFueSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKCFvYmogfHwgdHlwZW9mIG9iaiAhPT0gJ29iamVjdCcpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgY29uc3QgcGFydHMgPSBwYXRoLnNwbGl0KCcuJyk7XG4gICAgICAgICAgICAgICAgbGV0IGN1cjogYW55ID0gb2JqO1xuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgcCBvZiBwYXJ0cykge1xuICAgICAgICAgICAgICAgICAgICBpZiAoIWN1ciB8fCB0eXBlb2YgY3VyICE9PSAnb2JqZWN0JykgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHAgaW4gY3VyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjdXIgPSBjdXJbcF07XG4gICAgICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAvLyBUcnkgb25lIGxldmVsIG9mIG5lc3QgKHNvbWV0aW1lcyB0aGUgY2F0ZWdvcnkgZHVtcFxuICAgICAgICAgICAgICAgICAgICAvLyBuZXN0cyB1bmRlciBhIGRlZmF1bHQtcHJvdG9jb2wgYnVja2V0KS5cbiAgICAgICAgICAgICAgICAgICAgbGV0IGZvdW5kID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIGZvciAoY29uc3QgdiBvZiBPYmplY3QudmFsdWVzKGN1cikpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh2ICYmIHR5cGVvZiB2ID09PSAnb2JqZWN0JyAmJiBwIGluICh2IGFzIGFueSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjdXIgPSAodiBhcyBhbnkpW3BdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvdW5kID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZiAoIWZvdW5kKSByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gY3VyO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGNvbnN0IHByb2JlS2V5cyA9IFtcbiAgICAgICAgICAgICAgICAncHJldmlldy5jdXJyZW50LnBsYXRmb3JtJyxcbiAgICAgICAgICAgICAgICAnY3VycmVudC5wbGF0Zm9ybScsXG4gICAgICAgICAgICAgICAgJ3ByZXZpZXcub3Blbl9wcmV2aWV3X3dpdGgnLFxuICAgICAgICAgICAgICAgICdvcGVuX3ByZXZpZXdfd2l0aCcsXG4gICAgICAgICAgICAgICAgJ3ByZXZpZXdfd2l0aCcsXG4gICAgICAgICAgICAgICAgJ29wZW5fd2l0aCcsXG4gICAgICAgICAgICAgICAgJ21vZGUnLFxuICAgICAgICAgICAgXTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgayBvZiBwcm9iZUtleXMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB2ID0gZGlnKHJhdywgayk7XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiB2ID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjbHMgPSBjbGFzc2lmeSh2KTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNscykge1xuICAgICAgICAgICAgICAgICAgICAgICAgaW50ZXJwcmV0ZWQgPSBjbHM7XG4gICAgICAgICAgICAgICAgICAgICAgICBpbnRlcnByZXRlZEZyb21LZXkgPSBgJHtrfT0ke3Z9YDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIC8vIE5vbi1lbXB0eSBzdHJpbmcgdGhhdCBkaWRuJ3QgbWF0Y2ggYSBrbm93biBsYWJlbCDihpJcbiAgICAgICAgICAgICAgICAgICAgLy8gcmVjb3JkIGFzICdzaW11bGF0b3InIGNhbmRpZGF0ZSBpZiBpdCBsb29rcyBsaWtlIGFcbiAgICAgICAgICAgICAgICAgICAgLy8gZGV2aWNlIG5hbWUgKGUuZy4gXCJBcHBsZSBpUGhvbmUgMTQgUHJvXCIpLCBvdGhlcndpc2VcbiAgICAgICAgICAgICAgICAgICAgLy8ga2VlcCBzZWFyY2hpbmcuXG4gICAgICAgICAgICAgICAgICAgIGlmICgvaVBob25lfGlQYWR8SFVBV0VJfFhpYW9taXxTb255fEFzdXN8T1BQT3xIb25vcnxOb2tpYXxMZW5vdm98U2Ftc3VuZ3xHb29nbGV8UGl4ZWwvaS50ZXN0KHYpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpbnRlcnByZXRlZCA9ICdzaW11bGF0b3InO1xuICAgICAgICAgICAgICAgICAgICAgICAgaW50ZXJwcmV0ZWRGcm9tS2V5ID0gYCR7a309JHt2fWA7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7IGludGVycHJldGVkLCBpbnRlcnByZXRlZEZyb21LZXksIHJhdyB9LFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGludGVycHJldGVkID09PSAndW5rbm93bidcbiAgICAgICAgICAgICAgICAgICAgPyAnUmVhZCBjb2NvcyBwcmV2aWV3IGNvbmZpZyBidXQgY291bGQgbm90IGludGVycHJldCBhIG1vZGUgbGFiZWw7IGluc3BlY3QgZGF0YS5yYXcgYW5kIHBhc3MgbW9kZT0gZXhwbGljaXRseSB0byBjYXB0dXJlX3ByZXZpZXdfc2NyZWVuc2hvdC4nXG4gICAgICAgICAgICAgICAgICAgIDogYGNvY29zIHByZXZpZXcgaXMgY29uZmlndXJlZCBhcyBcIiR7aW50ZXJwcmV0ZWR9XCIgKGZyb20ga2V5IFwiJHtpbnRlcnByZXRlZEZyb21LZXl9XCIpLiBQYXNzIG1vZGU9XCIke2ludGVycHJldGVkID09PSAnYnJvd3NlcicgPyAnd2luZG93JyA6IGludGVycHJldGVkfVwiIHRvIGNhcHR1cmVfcHJldmlld19zY3JlZW5zaG90LCBvciByZWx5IG9uIG1vZGU9XCJhdXRvXCIuYCxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBwcmVmZXJlbmNlcy9xdWVyeS1jb25maWcgJ3ByZXZpZXcnIGZhaWxlZDogJHtlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycil9YCB9O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBiYXRjaFNjcmVlbnNob3Qoc2F2ZVBhdGhQcmVmaXg/OiBzdHJpbmcsIGRlbGF5c01zOiBudW1iZXJbXSA9IFswXSwgd2luZG93VGl0bGU/OiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgbGV0IHByZWZpeCA9IHNhdmVQYXRoUHJlZml4O1xuICAgICAgICAgICAgaWYgKCFwcmVmaXgpIHtcbiAgICAgICAgICAgICAgICAvLyBiYXNlbmFtZSBpcyB0aGUgcHJlZml4IHN0ZW07IHBlci1pdGVyYXRpb24gZmlsZXMgZXh0ZW5kIGl0XG4gICAgICAgICAgICAgICAgLy8gd2l0aCBgLSR7aX0ucG5nYC4gQ29udGFpbm1lbnQgY2hlY2sgb24gdGhlIHByZWZpeCBwYXRoIGlzXG4gICAgICAgICAgICAgICAgLy8gc3VmZmljaWVudCBiZWNhdXNlIHBhdGguam9pbiBwcmVzZXJ2ZXMgZGlybmFtZSBmb3IgYW55XG4gICAgICAgICAgICAgICAgLy8gc3VmZml4IHRoZSBsb29wIGFwcGVuZHMuXG4gICAgICAgICAgICAgICAgY29uc3QgcmVzb2x2ZWQgPSB0aGlzLnJlc29sdmVBdXRvQ2FwdHVyZUZpbGUoYGJhdGNoLSR7RGF0ZS5ub3coKX1gKTtcbiAgICAgICAgICAgICAgICBpZiAoIXJlc29sdmVkLm9rKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHJlc29sdmVkLmVycm9yIH07XG4gICAgICAgICAgICAgICAgcHJlZml4ID0gcmVzb2x2ZWQuZmlsZVBhdGg7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIHYyLjguMSByb3VuZC0xIGZpeCAoR2VtaW5pIPCflLQgKyBDb2RleCDwn5+hKTogZXhwbGljaXQgcHJlZml4XG4gICAgICAgICAgICAgICAgLy8gYWxzbyBnZXRzIGNvbnRhaW5tZW50LWNoZWNrZWQuIFdlIGNoZWNrIHRoZSBwcmVmaXggcGF0aFxuICAgICAgICAgICAgICAgIC8vIGl0c2VsZiDigJQgZXZlcnkgZW1pdHRlZCBmaWxlIGxpdmVzIGluIHRoZSBzYW1lIGRpcm5hbWUuXG4gICAgICAgICAgICAgICAgLy8gdjIuOC4yIHJldGVzdCBmaXg6IHVzZSByZXNvbHZlZFBhdGggZm9yIHJlbGF0aXZlLXByZWZpeCBzdXBwb3J0LlxuICAgICAgICAgICAgICAgIGNvbnN0IGd1YXJkID0gdGhpcy5hc3NlcnRTYXZlUGF0aFdpdGhpblByb2plY3QocHJlZml4KTtcbiAgICAgICAgICAgICAgICBpZiAoIWd1YXJkLm9rKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGd1YXJkLmVycm9yIH07XG4gICAgICAgICAgICAgICAgcHJlZml4ID0gZ3VhcmQucmVzb2x2ZWRQYXRoO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3Qgd2luID0gdGhpcy5waWNrV2luZG93KHdpbmRvd1RpdGxlKTtcbiAgICAgICAgICAgIGNvbnN0IGNhcHR1cmVzOiBhbnlbXSA9IFtdO1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBkZWxheXNNcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGRlbGF5ID0gZGVsYXlzTXNbaV07XG4gICAgICAgICAgICAgICAgaWYgKGRlbGF5ID4gMCkge1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgZGVsYXkpKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29uc3QgZmlsZVBhdGggPSBgJHtwcmVmaXh9LSR7aX0ucG5nYDtcbiAgICAgICAgICAgICAgICBjb25zdCBpbWFnZSA9IGF3YWl0IHdpbi53ZWJDb250ZW50cy5jYXB0dXJlUGFnZSgpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHBuZzogQnVmZmVyID0gaW1hZ2UudG9QTkcoKTtcbiAgICAgICAgICAgICAgICBmcy53cml0ZUZpbGVTeW5jKGZpbGVQYXRoLCBwbmcpO1xuICAgICAgICAgICAgICAgIGNhcHR1cmVzLnB1c2goeyBpbmRleDogaSwgZGVsYXlNczogZGVsYXksIGZpbGVQYXRoLCBzaXplOiBwbmcubGVuZ3RoIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgY291bnQ6IGNhcHR1cmVzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgd2luZG93VGl0bGU6IHR5cGVvZiB3aW4uZ2V0VGl0bGUgPT09ICdmdW5jdGlvbicgPyB3aW4uZ2V0VGl0bGUoKSA6ICcnLFxuICAgICAgICAgICAgICAgICAgICBjYXB0dXJlcyxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBDYXB0dXJlZCAke2NhcHR1cmVzLmxlbmd0aH0gc2NyZWVuc2hvdHNgLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpIH07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyB2Mi43LjAgIzM6IHByZXZpZXctdXJsIC8gcXVlcnktZGV2aWNlcyBoYW5kbGVycyAtLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICAgIHByaXZhdGUgYXN5bmMgcHJldmlld1VybChhY3Rpb246ICdxdWVyeScgfCAnb3BlbicgPSAncXVlcnknKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHVybDogc3RyaW5nID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgncHJldmlldycsICdxdWVyeS1wcmV2aWV3LXVybCcgYXMgYW55KSBhcyBhbnk7XG4gICAgICAgICAgICBpZiAoIXVybCB8fCB0eXBlb2YgdXJsICE9PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ3ByZXZpZXcvcXVlcnktcHJldmlldy11cmwgcmV0dXJuZWQgZW1wdHkgcmVzdWx0OyBjaGVjayB0aGF0IGNvY29zIHByZXZpZXcgc2VydmVyIGlzIHJ1bm5pbmcnIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBkYXRhOiBhbnkgPSB7IHVybCB9O1xuICAgICAgICAgICAgaWYgKGFjdGlvbiA9PT0gJ29wZW4nKSB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgLy8gTGF6eSByZXF1aXJlIHNvIHNtb2tlIC8gbm9uLUVsZWN0cm9uIGNvbnRleHRzIGRvbid0IGZhdWx0XG4gICAgICAgICAgICAgICAgICAgIC8vIG9uIG1pc3NpbmcgZWxlY3Ryb24uXG4gICAgICAgICAgICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tdmFyLXJlcXVpcmVzXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGVsZWN0cm9uID0gcmVxdWlyZSgnZWxlY3Ryb24nKTtcbiAgICAgICAgICAgICAgICAgICAgLy8gdjIuNy4xIHJldmlldyBmaXggKGNvZGV4IPCfn6EgKyBnZW1pbmkg8J+foSk6IG9wZW5FeHRlcm5hbFxuICAgICAgICAgICAgICAgICAgICAvLyByZXNvbHZlcyB3aGVuIHRoZSBPUyBsYXVuY2hlciBpcyBpbnZva2VkLCBub3Qgd2hlbiB0aGVcbiAgICAgICAgICAgICAgICAgICAgLy8gcGFnZSByZW5kZXJzLiBVc2UgXCJsYXVuY2hcIiB3b3JkaW5nIHRvIGF2b2lkIHRoZSBBSVxuICAgICAgICAgICAgICAgICAgICAvLyBtaXNyZWFkaW5nIFwib3BlbmVkXCIgYXMgYSBjb25maXJtZWQgcGFnZS1sb2FkLlxuICAgICAgICAgICAgICAgICAgICBhd2FpdCBlbGVjdHJvbi5zaGVsbC5vcGVuRXh0ZXJuYWwodXJsKTtcbiAgICAgICAgICAgICAgICAgICAgZGF0YS5sYXVuY2hlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgICAgICAgICAgZGF0YS5sYXVuY2hlZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICBkYXRhLmxhdW5jaEVycm9yID0gZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIFJlZmxlY3QgYWN0dWFsIGxhdW5jaCBvdXRjb21lIGluIHRoZSB0b3AtbGV2ZWwgbWVzc2FnZSBzbyBBSVxuICAgICAgICAgICAgLy8gc2VlcyBcImxhdW5jaCBmYWlsZWRcIiBpbnN0ZWFkIG9mIG1pc2xlYWRpbmcgXCJPcGVuZWQgLi4uXCIgd2hlblxuICAgICAgICAgICAgLy8gb3BlbkV4dGVybmFsIHRocmV3IChnZW1pbmkg8J+foSkuXG4gICAgICAgICAgICBjb25zdCBtZXNzYWdlID0gYWN0aW9uID09PSAnb3BlbidcbiAgICAgICAgICAgICAgICA/IChkYXRhLmxhdW5jaGVkXG4gICAgICAgICAgICAgICAgICAgID8gYExhdW5jaGVkICR7dXJsfSBpbiBkZWZhdWx0IGJyb3dzZXIgKHBhZ2UgcmVuZGVyIG5vdCBhd2FpdGVkKWBcbiAgICAgICAgICAgICAgICAgICAgOiBgUmV0dXJuZWQgVVJMICR7dXJsfSBidXQgbGF1bmNoIGZhaWxlZDogJHtkYXRhLmxhdW5jaEVycm9yfWApXG4gICAgICAgICAgICAgICAgOiB1cmw7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBkYXRhLCBtZXNzYWdlIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKSB9O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gdjIuOC4wIFQtVjI4LTM6IFBJRSBwbGF5IC8gc3RvcC4gUm91dGVzIHRocm91Z2ggc2NlbmUtc2NyaXB0IHNvIHRoZVxuICAgIC8vIHR5cGVkIGNjZS5TY2VuZUZhY2FkZS5jaGFuZ2VQcmV2aWV3UGxheVN0YXRlIGlzIHJlYWNoZWQgdmlhIHRoZVxuICAgIC8vIGRvY3VtZW50ZWQgZXhlY3V0ZS1zY2VuZS1zY3JpcHQgY2hhbm5lbC5cbiAgICAvL1xuICAgIC8vIHYyLjguMyBULVYyODMtMyByZXRlc3QgZmluZGluZzogY29jb3Mgc29tZXRpbWVzIGxvZ3NcbiAgICAvLyBcIkZhaWxlZCB0byByZWZyZXNoIHRoZSBjdXJyZW50IHNjZW5lXCIgaW5zaWRlIGNoYW5nZVByZXZpZXdQbGF5U3RhdGVcbiAgICAvLyBldmVuIHdoZW4gdGhlIGNhbGwgcmV0dXJucyB3aXRob3V0IHRocm93aW5nLiBPYnNlcnZlZCBpbiBjb2Nvc1xuICAgIC8vIDMuOC43IC8gZW1iZWRkZWQgcHJldmlldyBtb2RlLiBUaGUgcm9vdCBjYXVzZSBpcyB1bmNsZWFyIChtYXlcbiAgICAvLyByZWxhdGUgdG8gY3VtdWxhdGl2ZSBzY2VuZS1kaXJ0eSAvIGVtYmVkZGVkLW1vZGUgdGltaW5nIC9cbiAgICAvLyBpbml0aWFsLWxvYWQgY29tcGxhaW50KSwgYnV0IHRoZSB2aXNpYmxlIGVmZmVjdCBpcyB0aGF0IFBJRSBzdGF0ZVxuICAgIC8vIGNoYW5nZXMgaW5jb21wbGV0ZWx5LiBXZSBub3cgU0NBTiB0aGUgY2FwdHVyZWQgc2NlbmUtc2NyaXB0IGxvZ3NcbiAgICAvLyBmb3IgdGhhdCBlcnJvciBzdHJpbmcgYW5kIHN1cmZhY2UgaXQgdG8gdGhlIEFJIGFzIGEgc3RydWN0dXJlZFxuICAgIC8vIHdhcm5pbmcgaW5zdGVhZCBvZiBsZXR0aW5nIGl0IGhpZGUgaW5zaWRlIGRhdGEuY2FwdHVyZWRMb2dzLlxuICAgIHByaXZhdGUgYXN5bmMgcHJldmlld0NvbnRyb2wob3A6ICdzdGFydCcgfCAnc3RvcCcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBzdGF0ZSA9IG9wID09PSAnc3RhcnQnO1xuICAgICAgICBjb25zdCByZXN1bHQ6IFRvb2xSZXNwb25zZSA9IGF3YWl0IHJ1blNjZW5lTWV0aG9kQXNUb29sUmVzcG9uc2UoJ2NoYW5nZVByZXZpZXdQbGF5U3RhdGUnLCBbc3RhdGVdKTtcbiAgICAgICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICAgICAgICAvLyBTY2FuIGNhcHR1cmVkTG9ncyBmb3IgdGhlIGtub3duIGNvY29zIHdhcm5pbmcgc28gQUlcbiAgICAgICAgICAgIC8vIGRvZXNuJ3QgZ2V0IGEgbWlzbGVhZGluZyBiYXJlLXN1Y2Nlc3MgZW52ZWxvcGUuXG4gICAgICAgICAgICBjb25zdCBjYXB0dXJlZCA9IChyZXN1bHQgYXMgYW55KS5jYXB0dXJlZExvZ3MgYXMgQXJyYXk8eyBsZXZlbDogc3RyaW5nOyBtZXNzYWdlOiBzdHJpbmcgfT4gfCB1bmRlZmluZWQ7XG4gICAgICAgICAgICBjb25zdCBzY2VuZVJlZnJlc2hFcnJvciA9IGNhcHR1cmVkPy5maW5kKFxuICAgICAgICAgICAgICAgIGUgPT4gZT8ubGV2ZWwgPT09ICdlcnJvcicgJiYgL0ZhaWxlZCB0byByZWZyZXNoIHRoZSBjdXJyZW50IHNjZW5lL2kudGVzdChlPy5tZXNzYWdlID8/ICcnKSxcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBjb25zdCB3YXJuaW5nczogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgICAgIGlmIChzY2VuZVJlZnJlc2hFcnJvcikge1xuICAgICAgICAgICAgICAgIHdhcm5pbmdzLnB1c2goXG4gICAgICAgICAgICAgICAgICAgICdjb2NvcyBlbmdpbmUgdGhyZXcgXCJGYWlsZWQgdG8gcmVmcmVzaCB0aGUgY3VycmVudCBzY2VuZVwiIGluc2lkZSBzb2Z0UmVsb2FkU2NlbmUgZHVyaW5nIFBJRSBzdGF0ZSBjaGFuZ2UuIFRoaXMgaXMgYSBjb2NvcyAzLjguNyByYWNlIGZpcmVkIGJ5IGNoYW5nZVByZXZpZXdQbGF5U3RhdGUgaXRzZWxmLCBub3QgZ2F0ZWQgYnkgcHJldmlldyBtb2RlICh2ZXJpZmllZCBpbiBib3RoIGVtYmVkZGVkIGFuZCBicm93c2VyIG1vZGVzIOKAlCBzZWUgQ0xBVURFLm1kIGxhbmRtaW5lICMxNikuIFBJRSBoYXMgTk9UIGFjdHVhbGx5IHN0YXJ0ZWQgYW5kIHRoZSBjb2NvcyBlZGl0b3IgbWF5IGZyZWV6ZSAoc3Bpbm5pbmcgaW5kaWNhdG9yKSByZXF1aXJpbmcgdGhlIGh1bWFuIHVzZXIgdG8gcHJlc3MgQ3RybCtSIHRvIHJlY292ZXIuICoqUmVjb21tZW5kZWQgYWx0ZXJuYXRpdmVzKio6IChhKSBkZWJ1Z19jYXB0dXJlX3ByZXZpZXdfc2NyZWVuc2hvdChtb2RlPVwiZW1iZWRkZWRcIikgaW4gRURJVCBtb2RlIOKAlCBjYXB0dXJlcyB0aGUgZWRpdG9yIGdhbWV2aWV3IHdpdGhvdXQgc3RhcnRpbmcgUElFOyAoYikgZGVidWdfZ2FtZV9jb21tYW5kKHR5cGU9XCJzY3JlZW5zaG90XCIpIHZpYSBHYW1lRGVidWdDbGllbnQgcnVubmluZyBvbiBicm93c2VyIHByZXZpZXcgKGRlYnVnX3ByZXZpZXdfdXJsKGFjdGlvbj1cIm9wZW5cIikpIOKAlCB1c2VzIHJ1bnRpbWUgY2FudmFzLCBieXBhc3NlcyB0aGUgZW5naW5lIHJhY2UgZW50aXJlbHkuIERvIE5PVCByZXRyeSBwcmV2aWV3X2NvbnRyb2woc3RhcnQpIOKAlCBpdCB3aWxsIG5vdCBoZWxwIGFuZCBtYXkgY29tcG91bmQgdGhlIGZyZWV6ZS4nLFxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBiYXNlTWVzc2FnZSA9IHN0YXRlXG4gICAgICAgICAgICAgICAgPyAnRW50ZXJlZCBQcmV2aWV3LWluLUVkaXRvciBwbGF5IG1vZGUgKFBJRSBtYXkgdGFrZSBhIG1vbWVudCB0byBhcHBlYXI7IG1vZGUgZGVwZW5kcyBvbiBjb2NvcyBwcmV2aWV3IGNvbmZpZyDigJQgc2VlIGRlYnVnX2dldF9wcmV2aWV3X21vZGUpJ1xuICAgICAgICAgICAgICAgIDogJ0V4aXRlZCBQcmV2aWV3LWluLUVkaXRvciBwbGF5IG1vZGUnO1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAuLi5yZXN1bHQsXG4gICAgICAgICAgICAgICAgLi4uKHdhcm5pbmdzLmxlbmd0aCA+IDAgPyB7IGRhdGE6IHsgLi4uKHJlc3VsdC5kYXRhID8/IHt9KSwgd2FybmluZ3MgfSB9IDoge30pLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IHdhcm5pbmdzLmxlbmd0aCA+IDBcbiAgICAgICAgICAgICAgICAgICAgPyBgJHtiYXNlTWVzc2FnZX0uIOKaoCAke3dhcm5pbmdzLmpvaW4oJyAnKX1gXG4gICAgICAgICAgICAgICAgICAgIDogYmFzZU1lc3NhZ2UsXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBxdWVyeURldmljZXMoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGRldmljZXM6IGFueVtdID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnZGV2aWNlJywgJ3F1ZXJ5JykgYXMgYW55O1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogeyBkZXZpY2VzOiBBcnJheS5pc0FycmF5KGRldmljZXMpID8gZGV2aWNlcyA6IFtdLCBjb3VudDogQXJyYXkuaXNBcnJheShkZXZpY2VzKSA/IGRldmljZXMubGVuZ3RoIDogMCB9IH07XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKSB9O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gdjIuNi4wIFQtVjI2LTE6IEdhbWVEZWJ1Z0NsaWVudCBicmlkZ2UgaGFuZGxlcnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgICBwcml2YXRlIGFzeW5jIGdhbWVDb21tYW5kKHR5cGU6IHN0cmluZywgYXJnczogYW55LCB0aW1lb3V0TXM6IG51bWJlciA9IDEwMDAwKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgcXVldWVkID0gcXVldWVHYW1lQ29tbWFuZCh0eXBlLCBhcmdzKTtcbiAgICAgICAgaWYgKCFxdWV1ZWQub2spIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogcXVldWVkLmVycm9yIH07XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgYXdhaXRlZCA9IGF3YWl0IGF3YWl0Q29tbWFuZFJlc3VsdChxdWV1ZWQuaWQsIHRpbWVvdXRNcyk7XG4gICAgICAgIGlmICghYXdhaXRlZC5vaykge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBhd2FpdGVkLmVycm9yIH07XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXRlZC5yZXN1bHQ7XG4gICAgICAgIGlmIChyZXN1bHQuc3VjY2VzcyA9PT0gZmFsc2UpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogcmVzdWx0LmVycm9yID8/ICdHYW1lRGVidWdDbGllbnQgcmVwb3J0ZWQgZmFpbHVyZScsIGRhdGE6IHJlc3VsdC5kYXRhIH07XG4gICAgICAgIH1cbiAgICAgICAgLy8gQnVpbHQtaW4gc2NyZWVuc2hvdCBwYXRoOiBjbGllbnQgc2VuZHMgYmFjayBhIGJhc2U2NCBkYXRhVXJsO1xuICAgICAgICAvLyBsYW5kaW5nIHRoZSBieXRlcyB0byBkaXNrIG9uIGhvc3Qgc2lkZSBrZWVwcyB0aGUgcmVzdWx0IGVudmVsb3BlXG4gICAgICAgIC8vIHNtYWxsIGFuZCByZXVzZXMgdGhlIGV4aXN0aW5nIHByb2plY3Qtcm9vdGVkIGNhcHR1cmUgZGlyIGd1YXJkLlxuICAgICAgICBpZiAodHlwZSA9PT0gJ3NjcmVlbnNob3QnICYmIHJlc3VsdC5kYXRhICYmIHR5cGVvZiByZXN1bHQuZGF0YS5kYXRhVXJsID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgY29uc3QgcGVyc2lzdGVkID0gdGhpcy5wZXJzaXN0R2FtZVNjcmVlbnNob3QocmVzdWx0LmRhdGEuZGF0YVVybCwgcmVzdWx0LmRhdGEud2lkdGgsIHJlc3VsdC5kYXRhLmhlaWdodCk7XG4gICAgICAgICAgICBpZiAoIXBlcnNpc3RlZC5vaykge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogcGVyc2lzdGVkLmVycm9yIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICB0eXBlLFxuICAgICAgICAgICAgICAgICAgICBmaWxlUGF0aDogcGVyc2lzdGVkLmZpbGVQYXRoLFxuICAgICAgICAgICAgICAgICAgICBzaXplOiBwZXJzaXN0ZWQuc2l6ZSxcbiAgICAgICAgICAgICAgICAgICAgd2lkdGg6IHJlc3VsdC5kYXRhLndpZHRoLFxuICAgICAgICAgICAgICAgICAgICBoZWlnaHQ6IHJlc3VsdC5kYXRhLmhlaWdodCxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBHYW1lIGNhbnZhcyBjYXB0dXJlZCB0byAke3BlcnNpc3RlZC5maWxlUGF0aH1gLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBkYXRhOiB7IHR5cGUsIC4uLnJlc3VsdC5kYXRhIH0sIG1lc3NhZ2U6IGBHYW1lIGNvbW1hbmQgJHt0eXBlfSBva2AgfTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdhbWVDbGllbnRTdGF0dXMoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogZ2V0Q2xpZW50U3RhdHVzKCkgfTtcbiAgICB9XG5cbiAgICAvLyB2Mi42LjEgcmV2aWV3IGZpeCAoY29kZXgg8J+UtCArIGNsYXVkZSBXMSk6IGJvdW5kIHRoZSBsZWdpdGltYXRlIHJhbmdlXG4gICAgLy8gb2YgYSBzY3JlZW5zaG90IHBheWxvYWQgYmVmb3JlIGRlY29kaW5nIHNvIGEgbWlzYmVoYXZpbmcgLyBtYWxpY2lvdXNcbiAgICAvLyBjbGllbnQgY2Fubm90IGZpbGwgZGlzayBieSBzdHJlYW1pbmcgYXJiaXRyYXJ5IGJhc2U2NCBieXRlcy5cbiAgICAvLyAzMiBNQiBtYXRjaGVzIHRoZSBnbG9iYWwgcmVxdWVzdC1ib2R5IGNhcCBpbiBtY3Atc2VydmVyLXNkay50cyBzb1xuICAgIC8vIHRoZSBib2R5IHdvdWxkIGFscmVhZHkgNDEzIGJlZm9yZSByZWFjaGluZyBoZXJlLCBidXQgYVxuICAgIC8vIGJlbHQtYW5kLWJyYWNlcyBjaGVjayBzdGF5cyBjaGVhcC5cbiAgICBwcml2YXRlIHN0YXRpYyByZWFkb25seSBNQVhfR0FNRV9TQ1JFRU5TSE9UX0JZVEVTID0gMzIgKiAxMDI0ICogMTAyNDtcblxuICAgIHByaXZhdGUgcGVyc2lzdEdhbWVTY3JlZW5zaG90KGRhdGFVcmw6IHN0cmluZywgX3dpZHRoPzogbnVtYmVyLCBfaGVpZ2h0PzogbnVtYmVyKTogeyBvazogdHJ1ZTsgZmlsZVBhdGg6IHN0cmluZzsgc2l6ZTogbnVtYmVyIH0gfCB7IG9rOiBmYWxzZTsgZXJyb3I6IHN0cmluZyB9IHtcbiAgICAgICAgY29uc3QgbSA9IC9eZGF0YTppbWFnZVxcLyhwbmd8anBlZ3x3ZWJwKTtiYXNlNjQsKC4qKSQvaS5leGVjKGRhdGFVcmwpO1xuICAgICAgICBpZiAoIW0pIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6ICdHYW1lRGVidWdDbGllbnQgcmV0dXJuZWQgc2NyZWVuc2hvdCBkYXRhVXJsIGluIHVuZXhwZWN0ZWQgZm9ybWF0IChleHBlY3RlZCBkYXRhOmltYWdlL3twbmd8anBlZ3x3ZWJwfTtiYXNlNjQsLi4uKScgfTtcbiAgICAgICAgfVxuICAgICAgICAvLyBiYXNlNjQtZGVjb2RlZCBieXRlIGNvdW50ID0gfmNlaWwoYjY0TGVuICogMyAvIDQpOyByZWplY3QgZWFybHlcbiAgICAgICAgLy8gYmVmb3JlIGFsbG9jYXRpbmcgYSBtdWx0aS1HQiBCdWZmZXIuXG4gICAgICAgIGNvbnN0IGI2NExlbiA9IG1bMl0ubGVuZ3RoO1xuICAgICAgICBjb25zdCBhcHByb3hCeXRlcyA9IE1hdGguY2VpbChiNjRMZW4gKiAzIC8gNCk7XG4gICAgICAgIGlmIChhcHByb3hCeXRlcyA+IERlYnVnVG9vbHMuTUFYX0dBTUVfU0NSRUVOU0hPVF9CWVRFUykge1xuICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogYHNjcmVlbnNob3QgcGF5bG9hZCB0b28gbGFyZ2U6IH4ke2FwcHJveEJ5dGVzfSBieXRlcyBleGNlZWRzIGNhcCAke0RlYnVnVG9vbHMuTUFYX0dBTUVfU0NSRUVOU0hPVF9CWVRFU31gIH07XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZXh0ID0gbVsxXS50b0xvd2VyQ2FzZSgpID09PSAnanBlZycgPyAnanBnJyA6IG1bMV0udG9Mb3dlckNhc2UoKTtcbiAgICAgICAgY29uc3QgYnVmID0gQnVmZmVyLmZyb20obVsyXSwgJ2Jhc2U2NCcpO1xuICAgICAgICBpZiAoYnVmLmxlbmd0aCA+IERlYnVnVG9vbHMuTUFYX0dBTUVfU0NSRUVOU0hPVF9CWVRFUykge1xuICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogYHNjcmVlbnNob3QgcGF5bG9hZCB0b28gbGFyZ2UgYWZ0ZXIgZGVjb2RlOiAke2J1Zi5sZW5ndGh9IGJ5dGVzIGV4Y2VlZHMgY2FwICR7RGVidWdUb29scy5NQVhfR0FNRV9TQ1JFRU5TSE9UX0JZVEVTfWAgfTtcbiAgICAgICAgfVxuICAgICAgICAvLyB2Mi42LjEgcmV2aWV3IGZpeCAoY2xhdWRlIE0yICsgY29kZXgg8J+foSArIGdlbWluaSDwn5+hKTogcmVhbHBhdGggYm90aFxuICAgICAgICAvLyBzaWRlcyBmb3IgYSB0cnVlIGNvbnRhaW5tZW50IGNoZWNrLiB2Mi44LjAgVC1WMjgtMiBob2lzdGVkIHRoaXNcbiAgICAgICAgLy8gcGF0dGVybiBpbnRvIHJlc29sdmVBdXRvQ2FwdHVyZUZpbGUoKSBzbyBzY3JlZW5zaG90KCkgLyBjYXB0dXJlLVxuICAgICAgICAvLyBwcmV2aWV3IC8gYmF0Y2gtc2NyZWVuc2hvdCAvIHBlcnNpc3QtZ2FtZSBzaGFyZSBvbmUgaW1wbGVtZW50YXRpb24uXG4gICAgICAgIGNvbnN0IHJlc29sdmVkID0gdGhpcy5yZXNvbHZlQXV0b0NhcHR1cmVGaWxlKGBnYW1lLSR7RGF0ZS5ub3coKX0uJHtleHR9YCk7XG4gICAgICAgIGlmICghcmVzb2x2ZWQub2spIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IHJlc29sdmVkLmVycm9yIH07XG4gICAgICAgIGZzLndyaXRlRmlsZVN5bmMocmVzb2x2ZWQuZmlsZVBhdGgsIGJ1Zik7XG4gICAgICAgIHJldHVybiB7IG9rOiB0cnVlLCBmaWxlUGF0aDogcmVzb2x2ZWQuZmlsZVBhdGgsIHNpemU6IGJ1Zi5sZW5ndGggfTtcbiAgICB9XG5cbiAgICAvLyB2Mi40LjggQTE6IFRTIGRpYWdub3N0aWNzIGhhbmRsZXJzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICAgIHByaXZhdGUgYXN5bmMgd2FpdENvbXBpbGUodGltZW91dE1zOiBudW1iZXIgPSAxNTAwMCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBwcm9qZWN0UGF0aCA9IEVkaXRvcj8uUHJvamVjdD8ucGF0aDtcbiAgICAgICAgICAgIGlmICghcHJvamVjdFBhdGgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICd3YWl0X2NvbXBpbGU6IGVkaXRvciBjb250ZXh0IHVuYXZhaWxhYmxlIChubyBFZGl0b3IuUHJvamVjdC5wYXRoKScgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHdhaXRGb3JDb21waWxlKHByb2plY3RQYXRoLCB0aW1lb3V0TXMpO1xuICAgICAgICAgICAgaWYgKCFyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogcmVzdWx0LmVycm9yID8/ICd3YWl0X2NvbXBpbGUgZmFpbGVkJywgZGF0YTogcmVzdWx0IH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogcmVzdWx0LmNvbXBpbGVkXG4gICAgICAgICAgICAgICAgICAgID8gYENvbXBpbGUgZmluaXNoZWQgaW4gJHtyZXN1bHQud2FpdGVkTXN9bXNgXG4gICAgICAgICAgICAgICAgICAgIDogKHJlc3VsdC5ub3RlID8/ICdObyBjb21waWxlIHRyaWdnZXJlZCBvciB0aW1lZCBvdXQnKSxcbiAgICAgICAgICAgICAgICBkYXRhOiByZXN1bHQsXG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycikgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgcnVuU2NyaXB0RGlhZ25vc3RpY3ModHNjb25maWdQYXRoPzogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHByb2plY3RQYXRoID0gRWRpdG9yPy5Qcm9qZWN0Py5wYXRoO1xuICAgICAgICAgICAgaWYgKCFwcm9qZWN0UGF0aCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ3J1bl9zY3JpcHRfZGlhZ25vc3RpY3M6IGVkaXRvciBjb250ZXh0IHVuYXZhaWxhYmxlIChubyBFZGl0b3IuUHJvamVjdC5wYXRoKScgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJ1blNjcmlwdERpYWdub3N0aWNzKHByb2plY3RQYXRoLCB7IHRzY29uZmlnUGF0aCB9KTtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogcmVzdWx0Lm9rLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IHJlc3VsdC5zdW1tYXJ5LFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgdG9vbDogcmVzdWx0LnRvb2wsXG4gICAgICAgICAgICAgICAgICAgIGJpbmFyeTogcmVzdWx0LmJpbmFyeSxcbiAgICAgICAgICAgICAgICAgICAgdHNjb25maWdQYXRoOiByZXN1bHQudHNjb25maWdQYXRoLFxuICAgICAgICAgICAgICAgICAgICBleGl0Q29kZTogcmVzdWx0LmV4aXRDb2RlLFxuICAgICAgICAgICAgICAgICAgICBkaWFnbm9zdGljczogcmVzdWx0LmRpYWdub3N0aWNzLFxuICAgICAgICAgICAgICAgICAgICBkaWFnbm9zdGljQ291bnQ6IHJlc3VsdC5kaWFnbm9zdGljcy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgIC8vIHYyLjQuOSByZXZpZXcgZml4OiBzcGF3biBmYWlsdXJlcyAoYmluYXJ5IG1pc3NpbmcgL1xuICAgICAgICAgICAgICAgICAgICAvLyBwZXJtaXNzaW9uIGRlbmllZCkgc3VyZmFjZWQgZXhwbGljaXRseSBzbyBBSSBjYW5cbiAgICAgICAgICAgICAgICAgICAgLy8gZGlzdGluZ3Vpc2ggXCJ0c2MgbmV2ZXIgcmFuXCIgZnJvbSBcInRzYyBmb3VuZCBlcnJvcnNcIi5cbiAgICAgICAgICAgICAgICAgICAgc3Bhd25GYWlsZWQ6IHJlc3VsdC5zcGF3bkZhaWxlZCA9PT0gdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgc3lzdGVtRXJyb3I6IHJlc3VsdC5zeXN0ZW1FcnJvcixcbiAgICAgICAgICAgICAgICAgICAgLy8gVHJ1bmNhdGUgcmF3IHN0cmVhbXMgdG8ga2VlcCB0b29sIHJlc3VsdCByZWFzb25hYmxlO1xuICAgICAgICAgICAgICAgICAgICAvLyBmdWxsIGNvbnRlbnQgcmFyZWx5IHVzZWZ1bCB3aGVuIHRoZSBwYXJzZXIgYWxyZWFkeVxuICAgICAgICAgICAgICAgICAgICAvLyBzdHJ1Y3R1cmVkIHRoZSBlcnJvcnMuXG4gICAgICAgICAgICAgICAgICAgIHN0ZG91dFRhaWw6IHJlc3VsdC5zdGRvdXQuc2xpY2UoLTIwMDApLFxuICAgICAgICAgICAgICAgICAgICBzdGRlcnJUYWlsOiByZXN1bHQuc3RkZXJyLnNsaWNlKC0yMDAwKSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpIH07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldFNjcmlwdERpYWdub3N0aWNDb250ZXh0KFxuICAgICAgICBmaWxlOiBzdHJpbmcsXG4gICAgICAgIGxpbmU6IG51bWJlcixcbiAgICAgICAgY29udGV4dExpbmVzOiBudW1iZXIgPSA1LFxuICAgICk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBwcm9qZWN0UGF0aCA9IEVkaXRvcj8uUHJvamVjdD8ucGF0aDtcbiAgICAgICAgICAgIGlmICghcHJvamVjdFBhdGgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdnZXRfc2NyaXB0X2RpYWdub3N0aWNfY29udGV4dDogZWRpdG9yIGNvbnRleHQgdW5hdmFpbGFibGUnIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBhYnNQYXRoID0gcGF0aC5pc0Fic29sdXRlKGZpbGUpID8gZmlsZSA6IHBhdGguam9pbihwcm9qZWN0UGF0aCwgZmlsZSk7XG4gICAgICAgICAgICAvLyBQYXRoIHNhZmV0eTogZW5zdXJlIGFic29sdXRlIHBhdGggcmVzb2x2ZXMgdW5kZXIgcHJvamVjdFBhdGhcbiAgICAgICAgICAgIC8vIHRvIHByZXZlbnQgcmVhZHMgb3V0c2lkZSB0aGUgY29jb3MgcHJvamVjdC5cbiAgICAgICAgICAgIC8vXG4gICAgICAgICAgICAvLyB2Mi40LjkgcmV2aWV3IGZpeCAoY29kZXgg8J+UtCk6IHBsYWluIHBhdGgucmVzb2x2ZStzdGFydHNXaXRoIG9ubHlcbiAgICAgICAgICAgIC8vIGNhdGNoZXMgYC4uYCB0cmF2ZXJzYWwg4oCUIGEgU1lNTElOSyBpbnNpZGUgdGhlIHByb2plY3QgcG9pbnRpbmdcbiAgICAgICAgICAgIC8vIG91dHNpZGUgaXMgc3RpbGwgcmVhZGFibGUgYmVjYXVzZSBwYXRoLnJlc29sdmUgZG9lc24ndCBmb2xsb3dcbiAgICAgICAgICAgIC8vIHN5bWxpbmtzLiBVc2UgZnMucmVhbHBhdGhTeW5jIG9uIGJvdGggc2lkZXMgc28gd2UgY29tcGFyZSB0aGVcbiAgICAgICAgICAgIC8vIHJlYWwgb24tZGlzayBwYXRocyAoV2luZG93cyBpcyBjYXNlLWluc2Vuc2l0aXZlOyBib3RoIHNpZGVzIGdvXG4gICAgICAgICAgICAvLyB0aHJvdWdoIHJlYWxwYXRoU3luYyBzbyBjYXNpbmcgaXMgbm9ybWFsaXNlZCBjb25zaXN0ZW50bHkpLlxuICAgICAgICAgICAgY29uc3QgcmVzb2x2ZWRSYXcgPSBwYXRoLnJlc29sdmUoYWJzUGF0aCk7XG4gICAgICAgICAgICBjb25zdCBwcm9qZWN0UmVzb2x2ZWRSYXcgPSBwYXRoLnJlc29sdmUocHJvamVjdFBhdGgpO1xuICAgICAgICAgICAgbGV0IHJlc29sdmVkOiBzdHJpbmc7XG4gICAgICAgICAgICBsZXQgcHJvamVjdFJlc29sdmVkOiBzdHJpbmc7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHJlc29sdmVkID0gZnMucmVhbHBhdGhTeW5jLm5hdGl2ZShyZXNvbHZlZFJhdyk7XG4gICAgICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBnZXRfc2NyaXB0X2RpYWdub3N0aWNfY29udGV4dDogZmlsZSBub3QgZm91bmQgb3IgdW5yZWFkYWJsZTogJHtyZXNvbHZlZFJhd31gIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHByb2plY3RSZXNvbHZlZCA9IGZzLnJlYWxwYXRoU3luYy5uYXRpdmUocHJvamVjdFJlc29sdmVkUmF3KTtcbiAgICAgICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgICAgIHByb2plY3RSZXNvbHZlZCA9IHByb2plY3RSZXNvbHZlZFJhdztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIENhc2UtaW5zZW5zaXRpdmUgY29tcGFyaXNvbiBvbiBXaW5kb3dzOyBzZXAgZ3VhcmQgYWdhaW5zdFxuICAgICAgICAgICAgLy8gL3Byb2otZm9vIHZzIC9wcm9qIHByZWZpeCBjb25mdXNpb24uXG4gICAgICAgICAgICBjb25zdCBjbXBSZXNvbHZlZCA9IHByb2Nlc3MucGxhdGZvcm0gPT09ICd3aW4zMicgPyByZXNvbHZlZC50b0xvd2VyQ2FzZSgpIDogcmVzb2x2ZWQ7XG4gICAgICAgICAgICBjb25zdCBjbXBQcm9qZWN0ID0gcHJvY2Vzcy5wbGF0Zm9ybSA9PT0gJ3dpbjMyJyA/IHByb2plY3RSZXNvbHZlZC50b0xvd2VyQ2FzZSgpIDogcHJvamVjdFJlc29sdmVkO1xuICAgICAgICAgICAgaWYgKCFjbXBSZXNvbHZlZC5zdGFydHNXaXRoKGNtcFByb2plY3QgKyBwYXRoLnNlcCkgJiYgY21wUmVzb2x2ZWQgIT09IGNtcFByb2plY3QpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBnZXRfc2NyaXB0X2RpYWdub3N0aWNfY29udGV4dDogcGF0aCAke3Jlc29sdmVkfSByZXNvbHZlcyBvdXRzaWRlIHRoZSBwcm9qZWN0IHJvb3QgKHN5bWxpbmstYXdhcmUgY2hlY2spYCB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFmcy5leGlzdHNTeW5jKHJlc29sdmVkKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYGdldF9zY3JpcHRfZGlhZ25vc3RpY19jb250ZXh0OiBmaWxlIG5vdCBmb3VuZDogJHtyZXNvbHZlZH1gIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBzdGF0ID0gZnMuc3RhdFN5bmMocmVzb2x2ZWQpO1xuICAgICAgICAgICAgaWYgKHN0YXQuc2l6ZSA+IDUgKiAxMDI0ICogMTAyNCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYGdldF9zY3JpcHRfZGlhZ25vc3RpY19jb250ZXh0OiBmaWxlIHRvbyBsYXJnZSAoJHtzdGF0LnNpemV9IGJ5dGVzKTsgcmVmdXNpbmcgdG8gcmVhZC5gIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBjb250ZW50ID0gZnMucmVhZEZpbGVTeW5jKHJlc29sdmVkLCAndXRmOCcpO1xuICAgICAgICAgICAgY29uc3QgYWxsTGluZXMgPSBjb250ZW50LnNwbGl0KC9cXHI/XFxuLyk7XG4gICAgICAgICAgICBpZiAobGluZSA8IDEgfHwgbGluZSA+IGFsbExpbmVzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICBlcnJvcjogYGdldF9zY3JpcHRfZGlhZ25vc3RpY19jb250ZXh0OiBsaW5lICR7bGluZX0gb3V0IG9mIHJhbmdlIDEuLiR7YWxsTGluZXMubGVuZ3RofWAsXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHN0YXJ0ID0gTWF0aC5tYXgoMSwgbGluZSAtIGNvbnRleHRMaW5lcyk7XG4gICAgICAgICAgICBjb25zdCBlbmQgPSBNYXRoLm1pbihhbGxMaW5lcy5sZW5ndGgsIGxpbmUgKyBjb250ZXh0TGluZXMpO1xuICAgICAgICAgICAgY29uc3Qgd2luZG93ID0gYWxsTGluZXMuc2xpY2Uoc3RhcnQgLSAxLCBlbmQpO1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBSZWFkICR7d2luZG93Lmxlbmd0aH0gbGluZXMgb2YgY29udGV4dCBhcm91bmQgJHtwYXRoLnJlbGF0aXZlKHByb2plY3RSZXNvbHZlZCwgcmVzb2x2ZWQpfToke2xpbmV9YCxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIGZpbGU6IHBhdGgucmVsYXRpdmUocHJvamVjdFJlc29sdmVkLCByZXNvbHZlZCksXG4gICAgICAgICAgICAgICAgICAgIGFic29sdXRlUGF0aDogcmVzb2x2ZWQsXG4gICAgICAgICAgICAgICAgICAgIHRhcmdldExpbmU6IGxpbmUsXG4gICAgICAgICAgICAgICAgICAgIHN0YXJ0TGluZTogc3RhcnQsXG4gICAgICAgICAgICAgICAgICAgIGVuZExpbmU6IGVuZCxcbiAgICAgICAgICAgICAgICAgICAgdG90YWxMaW5lczogYWxsTGluZXMubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICBsaW5lczogd2luZG93Lm1hcCgodGV4dCwgaSkgPT4gKHsgbGluZTogc3RhcnQgKyBpLCB0ZXh0IH0pKSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpIH07XG4gICAgICAgIH1cbiAgICB9XG59XG4iXX0=