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
                description: 'Programmatically start or stop Preview-in-Editor (PIE) play mode. Wraps the typed cce.SceneFacade.changePreviewPlayState method (documented on SceneFacadeManager in @cocos/creator-types). Pair with debug_capture_preview_screenshot: call preview_control(op="start") to enter play mode, wait for the PIE window to appear, then capture. preview_control(op="stop") returns to scene mode. Implementation routes through scene-script (execute-scene-script → scene-side changePreviewPlayState handler) so the call is type-checked against creator-types and not subject to silent removal between cocos versions.',
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
        var _a;
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
                    captureNote = 'No Preview-titled window found; fell back to capturing the main editor window (embedded preview mode). Use debug_get_preview_mode to confirm cocos preview config.';
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
            return { success: false, error: (_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : String(err) };
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
                warnings.push('cocos editor logged "Failed to refresh the current scene" during PIE state change. PIE may not have fully started — verify with a follow-up debug_capture_preview_screenshot. Common workaround: ensure the active scene is saved (use scene_save_scene) before calling preview_control(start).');
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWctdG9vbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvdG9vbHMvZGVidWctdG9vbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUEsd0RBQWtFO0FBQ2xFLDBDQUFrQztBQUNsQyxzREFBMkQ7QUFDM0QsMERBQTZFO0FBQzdFLGtFQUFrRztBQUNsRyxzREFBbUU7QUFDbkUsdUNBQXlCO0FBQ3pCLDJDQUE2QjtBQUU3QixNQUFhLFVBQVU7SUFHbkI7UUFDSSxNQUFNLElBQUksR0FBYztZQUNwQjtnQkFDSSxJQUFJLEVBQUUsZUFBZTtnQkFDckIsV0FBVyxFQUFFLDZEQUE2RDtnQkFDMUUsV0FBVyxFQUFFLFVBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO2dCQUN6QixPQUFPLEVBQUUsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLFlBQVksRUFBRTthQUNyQztZQUNEO2dCQUNJLElBQUksRUFBRSxvQkFBb0I7Z0JBQzFCLFdBQVcsRUFBRSx3V0FBd1c7Z0JBQ3JYLFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDO29CQUNsQixJQUFJLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyxnR0FBZ0csQ0FBQztvQkFDM0gsT0FBTyxFQUFFLFVBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxPQUFPLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUMsUUFBUSxDQUFDLHdVQUF3VSxDQUFDO2lCQUMzWSxDQUFDO2dCQUNGLE9BQU8sRUFBRSxDQUFDLENBQUMsRUFBRSxXQUFDLE9BQUEsSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsTUFBQSxDQUFDLENBQUMsT0FBTyxtQ0FBSSxPQUFPLENBQUMsQ0FBQSxFQUFBO2FBQ3JFO1lBQ0Q7Z0JBQ0ksSUFBSSxFQUFF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QUs7b0JBQ2hCLE9BQU8sRUFBRSxHQUFHO29CQUNaLFVBQVUsRUFBRSxRQUFRLENBQUMsTUFBTTtvQkFDM0IsS0FBSyxFQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUUsSUFBSSxFQUFFLEtBQUssR0FBRyxDQUFDLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztpQkFDOUQ7YUFDSixDQUFDO1FBQ04sQ0FBQztRQUFDLE9BQU8sR0FBUSxFQUFFLENBQUM7WUFDaEIsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLE1BQUEsR0FBRyxhQUFILEdBQUcsdUJBQUgsR0FBRyxDQUFFLE9BQU8sbUNBQUksTUFBTSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7UUFDbEUsQ0FBQztJQUNMLENBQUM7O0FBMTNDTCxnQ0EyM0NDO0FBektHLHVFQUF1RTtBQUN2RSx1RUFBdUU7QUFDdkUsK0RBQStEO0FBQy9ELG9FQUFvRTtBQUNwRSx5REFBeUQ7QUFDekQscUNBQXFDO0FBQ2Isb0NBQXlCLEdBQUcsRUFBRSxHQUFHLElBQUksR0FBRyxJQUFJLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBUb29sRGVmaW5pdGlvbiwgVG9vbFJlc3BvbnNlLCBUb29sRXhlY3V0b3IsIFBlcmZvcm1hbmNlU3RhdHMsIFZhbGlkYXRpb25SZXN1bHQsIFZhbGlkYXRpb25Jc3N1ZSB9IGZyb20gJy4uL3R5cGVzJztcbmltcG9ydCB7IGRlYnVnTG9nIH0gZnJvbSAnLi4vbGliL2xvZyc7XG5pbXBvcnQgeyBpc0VkaXRvckNvbnRleHRFdmFsRW5hYmxlZCB9IGZyb20gJy4uL2xpYi9ydW50aW1lLWZsYWdzJztcbmltcG9ydCB7IHogfSBmcm9tICcuLi9saWIvc2NoZW1hJztcbmltcG9ydCB7IGRlZmluZVRvb2xzLCBUb29sRGVmIH0gZnJvbSAnLi4vbGliL2RlZmluZS10b29scyc7XG5pbXBvcnQgeyBydW5TY3JpcHREaWFnbm9zdGljcywgd2FpdEZvckNvbXBpbGUgfSBmcm9tICcuLi9saWIvdHMtZGlhZ25vc3RpY3MnO1xuaW1wb3J0IHsgcXVldWVHYW1lQ29tbWFuZCwgYXdhaXRDb21tYW5kUmVzdWx0LCBnZXRDbGllbnRTdGF0dXMgfSBmcm9tICcuLi9saWIvZ2FtZS1jb21tYW5kLXF1ZXVlJztcbmltcG9ydCB7IHJ1blNjZW5lTWV0aG9kQXNUb29sUmVzcG9uc2UgfSBmcm9tICcuLi9saWIvc2NlbmUtYnJpZGdlJztcbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5cbmV4cG9ydCBjbGFzcyBEZWJ1Z1Rvb2xzIGltcGxlbWVudHMgVG9vbEV4ZWN1dG9yIHtcbiAgICBwcml2YXRlIHJlYWRvbmx5IGV4ZWM6IFRvb2xFeGVjdXRvcjtcblxuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICBjb25zdCBkZWZzOiBUb29sRGVmW10gPSBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2NsZWFyX2NvbnNvbGUnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnQ2xlYXIgdGhlIENvY29zIEVkaXRvciBDb25zb2xlIFVJLiBObyBwcm9qZWN0IHNpZGUgZWZmZWN0cy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogKCkgPT4gdGhpcy5jbGVhckNvbnNvbGUoKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2V4ZWN1dGVfamF2YXNjcmlwdCcsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdbcHJpbWFyeV0gRXhlY3V0ZSBKYXZhU2NyaXB0IGluIHNjZW5lIG9yIGVkaXRvciBjb250ZXh0LiBVc2UgdGhpcyBhcyB0aGUgZGVmYXVsdCBmaXJzdCB0b29sIGZvciBjb21wb3VuZCBvcGVyYXRpb25zIChyZWFkIOKGkiBtdXRhdGUg4oaSIHZlcmlmeSkg4oCUIG9uZSBjYWxsIHJlcGxhY2VzIDUtMTAgbmFycm93IHNwZWNpYWxpc3QgdG9vbHMgYW5kIGF2b2lkcyBwZXItY2FsbCB0b2tlbiBvdmVyaGVhZC4gY29udGV4dD1cInNjZW5lXCIgaW5zcGVjdHMvbXV0YXRlcyBjYy5Ob2RlIGdyYXBoOyBjb250ZXh0PVwiZWRpdG9yXCIgcnVucyBpbiBob3N0IHByb2Nlc3MgZm9yIEVkaXRvci5NZXNzYWdlICsgZnMgKGRlZmF1bHQgb2ZmLCBvcHQtaW4pLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgY29kZTogei5zdHJpbmcoKS5kZXNjcmliZSgnSmF2YVNjcmlwdCBzb3VyY2UgdG8gZXhlY3V0ZS4gSGFzIGFjY2VzcyB0byBjYy4qIGluIHNjZW5lIGNvbnRleHQsIEVkaXRvci4qIGluIGVkaXRvciBjb250ZXh0LicpLFxuICAgICAgICAgICAgICAgICAgICBjb250ZXh0OiB6LmVudW0oWydzY2VuZScsICdlZGl0b3InXSkuZGVmYXVsdCgnc2NlbmUnKS5kZXNjcmliZSgnRXhlY3V0aW9uIHNhbmRib3guIFwic2NlbmVcIiBydW5zIGluc2lkZSB0aGUgY29jb3Mgc2NlbmUgc2NyaXB0IGNvbnRleHQgKGNjLCBkaXJlY3RvciwgZmluZCkuIFwiZWRpdG9yXCIgcnVucyBpbiB0aGUgZWRpdG9yIGhvc3QgcHJvY2VzcyAoRWRpdG9yLCBhc3NldC1kYiwgZnMsIHJlcXVpcmUpLiBFZGl0b3IgY29udGV4dCBpcyBPRkYgYnkgZGVmYXVsdCBhbmQgbXVzdCBiZSBvcHQtaW4gdmlhIHBhbmVsIHNldHRpbmcgYGVuYWJsZUVkaXRvckNvbnRleHRFdmFsYCDigJQgYXJiaXRyYXJ5IGNvZGUgaW4gdGhlIGhvc3QgcHJvY2VzcyBpcyBhIHByb21wdC1pbmplY3Rpb24gcmlzay4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMuZXhlY3V0ZUphdmFTY3JpcHQoYS5jb2RlLCBhLmNvbnRleHQgPz8gJ3NjZW5lJyksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdleGVjdXRlX3NjcmlwdCcsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdbY29tcGF0XSBTY2VuZS1vbmx5IEphdmFTY3JpcHQgZXZhbC4gUHJlZmVyIGV4ZWN1dGVfamF2YXNjcmlwdCB3aXRoIGNvbnRleHQ9XCJzY2VuZVwiIOKAlCBrZXB0IGFzIGNvbXBhdGliaWxpdHkgZW50cnlwb2ludCBmb3Igb2xkZXIgY2xpZW50cy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHNjcmlwdDogei5zdHJpbmcoKS5kZXNjcmliZSgnSmF2YVNjcmlwdCB0byBleGVjdXRlIGluIHNjZW5lIGNvbnRleHQgdmlhIGNvbnNvbGUvZXZhbC4gQ2FuIHJlYWQgb3IgbXV0YXRlIHRoZSBjdXJyZW50IHNjZW5lLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy5leGVjdXRlU2NyaXB0Q29tcGF0KGEuc2NyaXB0KSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2dldF9ub2RlX3RyZWUnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnUmVhZCBhIGRlYnVnIG5vZGUgdHJlZSBmcm9tIGEgcm9vdCBvciBzY2VuZSByb290IGZvciBoaWVyYXJjaHkvY29tcG9uZW50IGluc3BlY3Rpb24uJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICByb290VXVpZDogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdSb290IG5vZGUgVVVJRCB0byBleHBhbmQuIE9taXQgdG8gdXNlIHRoZSBjdXJyZW50IHNjZW5lIHJvb3QuJyksXG4gICAgICAgICAgICAgICAgICAgIG1heERlcHRoOiB6Lm51bWJlcigpLmRlZmF1bHQoMTApLmRlc2NyaWJlKCdNYXhpbXVtIHRyZWUgZGVwdGguIERlZmF1bHQgMTA7IGxhcmdlIHZhbHVlcyBjYW4gcmV0dXJuIGEgbG90IG9mIGRhdGEuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLmdldE5vZGVUcmVlKGEucm9vdFV1aWQsIGEubWF4RGVwdGgpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnZ2V0X3BlcmZvcm1hbmNlX3N0YXRzJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1RyeSB0byByZWFkIHNjZW5lIHF1ZXJ5LXBlcmZvcm1hbmNlIHN0YXRzOyBtYXkgcmV0dXJuIHVuYXZhaWxhYmxlIGluIGVkaXQgbW9kZS4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogKCkgPT4gdGhpcy5nZXRQZXJmb3JtYW5jZVN0YXRzKCksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICd2YWxpZGF0ZV9zY2VuZScsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdSdW4gYmFzaWMgY3VycmVudC1zY2VuZSBoZWFsdGggY2hlY2tzIGZvciBtaXNzaW5nIGFzc2V0cyBhbmQgbm9kZS1jb3VudCB3YXJuaW5ncy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIGNoZWNrTWlzc2luZ0Fzc2V0czogei5ib29sZWFuKCkuZGVmYXVsdCh0cnVlKS5kZXNjcmliZSgnQ2hlY2sgbWlzc2luZyBhc3NldCByZWZlcmVuY2VzIHdoZW4gdGhlIENvY29zIHNjZW5lIEFQSSBzdXBwb3J0cyBpdC4nKSxcbiAgICAgICAgICAgICAgICAgICAgY2hlY2tQZXJmb3JtYW5jZTogei5ib29sZWFuKCkuZGVmYXVsdCh0cnVlKS5kZXNjcmliZSgnUnVuIGJhc2ljIHBlcmZvcm1hbmNlIGNoZWNrcyBzdWNoIGFzIGhpZ2ggbm9kZSBjb3VudCB3YXJuaW5ncy4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMudmFsaWRhdGVTY2VuZSh7IGNoZWNrTWlzc2luZ0Fzc2V0czogYS5jaGVja01pc3NpbmdBc3NldHMsIGNoZWNrUGVyZm9ybWFuY2U6IGEuY2hlY2tQZXJmb3JtYW5jZSB9KSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2dldF9lZGl0b3JfaW5mbycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdSZWFkIEVkaXRvci9Db2Nvcy9wcm9qZWN0L3Byb2Nlc3MgaW5mb3JtYXRpb24gYW5kIG1lbW9yeSBzdW1tYXJ5LicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiAoKSA9PiB0aGlzLmdldEVkaXRvckluZm8oKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2dldF9wcm9qZWN0X2xvZ3MnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnUmVhZCB0ZW1wL2xvZ3MvcHJvamVjdC5sb2cgdGFpbCB3aXRoIG9wdGlvbmFsIGxldmVsL2tleXdvcmQgZmlsdGVycy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIGxpbmVzOiB6Lm51bWJlcigpLm1pbigxKS5tYXgoMTAwMDApLmRlZmF1bHQoMTAwKS5kZXNjcmliZSgnTnVtYmVyIG9mIGxpbmVzIHRvIHJlYWQgZnJvbSB0aGUgZW5kIG9mIHRlbXAvbG9ncy9wcm9qZWN0LmxvZy4gRGVmYXVsdCAxMDAuJyksXG4gICAgICAgICAgICAgICAgICAgIGZpbHRlcktleXdvcmQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnT3B0aW9uYWwgY2FzZS1pbnNlbnNpdGl2ZSBrZXl3b3JkIGZpbHRlci4nKSxcbiAgICAgICAgICAgICAgICAgICAgbG9nTGV2ZWw6IHouZW51bShbJ0VSUk9SJywgJ1dBUk4nLCAnSU5GTycsICdERUJVRycsICdUUkFDRScsICdBTEwnXSkuZGVmYXVsdCgnQUxMJykuZGVzY3JpYmUoJ09wdGlvbmFsIGxvZyBsZXZlbCBmaWx0ZXIuIEFMTCBkaXNhYmxlcyBsZXZlbCBmaWx0ZXJpbmcuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLmdldFByb2plY3RMb2dzKGEubGluZXMsIGEuZmlsdGVyS2V5d29yZCwgYS5sb2dMZXZlbCksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdnZXRfbG9nX2ZpbGVfaW5mbycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdSZWFkIHRlbXAvbG9ncy9wcm9qZWN0LmxvZyBwYXRoLCBzaXplLCBsaW5lIGNvdW50LCBhbmQgdGltZXN0YW1wcy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogKCkgPT4gdGhpcy5nZXRMb2dGaWxlSW5mbygpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnc2VhcmNoX3Byb2plY3RfbG9ncycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdTZWFyY2ggdGVtcC9sb2dzL3Byb2plY3QubG9nIGZvciBzdHJpbmcvcmVnZXggYW5kIHJldHVybiBsaW5lIGNvbnRleHQuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBwYXR0ZXJuOiB6LnN0cmluZygpLmRlc2NyaWJlKCdTZWFyY2ggc3RyaW5nIG9yIHJlZ2V4LiBJbnZhbGlkIHJlZ2V4IGlzIHRyZWF0ZWQgYXMgYSBsaXRlcmFsIHN0cmluZy4nKSxcbiAgICAgICAgICAgICAgICAgICAgbWF4UmVzdWx0czogei5udW1iZXIoKS5taW4oMSkubWF4KDEwMCkuZGVmYXVsdCgyMCkuZGVzY3JpYmUoJ01heGltdW0gbWF0Y2hlcyB0byByZXR1cm4uIERlZmF1bHQgMjAuJyksXG4gICAgICAgICAgICAgICAgICAgIGNvbnRleHRMaW5lczogei5udW1iZXIoKS5taW4oMCkubWF4KDEwKS5kZWZhdWx0KDIpLmRlc2NyaWJlKCdDb250ZXh0IGxpbmVzIGJlZm9yZS9hZnRlciBlYWNoIG1hdGNoLiBEZWZhdWx0IDIuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLnNlYXJjaFByb2plY3RMb2dzKGEucGF0dGVybiwgYS5tYXhSZXN1bHRzLCBhLmNvbnRleHRMaW5lcyksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdzY3JlZW5zaG90JyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ0NhcHR1cmUgdGhlIGZvY3VzZWQgQ29jb3MgRWRpdG9yIHdpbmRvdyAob3IgYSB3aW5kb3cgbWF0Y2hlZCBieSB0aXRsZSkgdG8gYSBQTkcuIFJldHVybnMgc2F2ZWQgZmlsZSBwYXRoLiBVc2UgdGhpcyBmb3IgQUkgdmlzdWFsIHZlcmlmaWNhdGlvbiBhZnRlciBzY2VuZS9VSSBjaGFuZ2VzLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgc2F2ZVBhdGg6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnQWJzb2x1dGUgZmlsZXN5c3RlbSBwYXRoIHRvIHNhdmUgdGhlIFBORy4gTXVzdCByZXNvbHZlIGluc2lkZSB0aGUgY29jb3MgcHJvamVjdCByb290IChjb250YWlubWVudCBjaGVjayB2aWEgcmVhbHBhdGgpLiBPbWl0IHRvIGF1dG8tbmFtZSBpbnRvIDxwcm9qZWN0Pi90ZW1wL21jcC1jYXB0dXJlcy9zY3JlZW5zaG90LTx0aW1lc3RhbXA+LnBuZy4nKSxcbiAgICAgICAgICAgICAgICAgICAgd2luZG93VGl0bGU6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnT3B0aW9uYWwgc3Vic3RyaW5nIG1hdGNoIG9uIHdpbmRvdyB0aXRsZSB0byBwaWNrIGEgc3BlY2lmaWMgRWxlY3Ryb24gd2luZG93LiBEZWZhdWx0OiBmb2N1c2VkIHdpbmRvdy4nKSxcbiAgICAgICAgICAgICAgICAgICAgaW5jbHVkZUJhc2U2NDogei5ib29sZWFuKCkuZGVmYXVsdChmYWxzZSkuZGVzY3JpYmUoJ0VtYmVkIFBORyBieXRlcyBhcyBiYXNlNjQgaW4gcmVzcG9uc2UgZGF0YSAobGFyZ2U7IGRlZmF1bHQgZmFsc2UpLiBXaGVuIGZhbHNlLCBvbmx5IHRoZSBzYXZlZCBmaWxlIHBhdGggaXMgcmV0dXJuZWQuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLnNjcmVlbnNob3QoYS5zYXZlUGF0aCwgYS53aW5kb3dUaXRsZSwgYS5pbmNsdWRlQmFzZTY0KSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2NhcHR1cmVfcHJldmlld19zY3JlZW5zaG90JyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ0NhcHR1cmUgdGhlIGNvY29zIFByZXZpZXctaW4tRWRpdG9yIChQSUUpIGdhbWV2aWV3IHRvIGEgUE5HLiBDb2NvcyBoYXMgbXVsdGlwbGUgUElFIHJlbmRlciB0YXJnZXRzIGRlcGVuZGluZyBvbiB0aGUgdXNlclxcJ3MgcHJldmlldyBjb25maWcgKFByZWZlcmVuY2VzIOKGkiBQcmV2aWV3IOKGkiBPcGVuIFByZXZpZXcgV2l0aCk6IFwiYnJvd3NlclwiIG9wZW5zIGFuIGV4dGVybmFsIGJyb3dzZXIgKE5PVCBjYXB0dXJhYmxlIGhlcmUpLCBcIndpbmRvd1wiIC8gXCJzaW11bGF0b3JcIiBvcGVucyBhIHNlcGFyYXRlIEVsZWN0cm9uIHdpbmRvdyAodGl0bGUgY29udGFpbnMgXCJQcmV2aWV3XCIpLCBcImVtYmVkZGVkXCIgcmVuZGVycyB0aGUgZ2FtZXZpZXcgaW5zaWRlIHRoZSBtYWluIGVkaXRvciB3aW5kb3cuIFRoZSBkZWZhdWx0IG1vZGU9XCJhdXRvXCIgdHJpZXMgdGhlIFByZXZpZXctdGl0bGVkIHdpbmRvdyBmaXJzdCBhbmQgZmFsbHMgYmFjayB0byBjYXB0dXJpbmcgdGhlIG1haW4gZWRpdG9yIHdpbmRvdyB3aGVuIG5vIFByZXZpZXctdGl0bGVkIHdpbmRvdyBleGlzdHMgKGNvdmVycyBlbWJlZGRlZCBtb2RlKS4gVXNlIG1vZGU9XCJ3aW5kb3dcIiB0byBmb3JjZSB0aGUgc2VwYXJhdGUtd2luZG93IHN0cmF0ZWd5IG9yIG1vZGU9XCJlbWJlZGRlZFwiIHRvIHNraXAgdGhlIHdpbmRvdyBwcm9iZS4gUGFpciB3aXRoIGRlYnVnX2dldF9wcmV2aWV3X21vZGUgdG8gcmVhZCB0aGUgY29jb3MgY29uZmlnIGFuZCByb3V0ZSBkZXRlcm1pbmlzdGljYWxseS4gRm9yIHJ1bnRpbWUgZ2FtZS1jYW52YXMgcGl4ZWwtbGV2ZWwgY2FwdHVyZSAoY2FtZXJhIFJlbmRlclRleHR1cmUpLCB1c2UgZGVidWdfZ2FtZV9jb21tYW5kKHR5cGU9XCJzY3JlZW5zaG90XCIpIGluc3RlYWQuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBzYXZlUGF0aDogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdBYnNvbHV0ZSBmaWxlc3lzdGVtIHBhdGggdG8gc2F2ZSB0aGUgUE5HLiBNdXN0IHJlc29sdmUgaW5zaWRlIHRoZSBjb2NvcyBwcm9qZWN0IHJvb3QgKGNvbnRhaW5tZW50IGNoZWNrIHZpYSByZWFscGF0aCkuIE9taXQgdG8gYXV0by1uYW1lIGludG8gPHByb2plY3Q+L3RlbXAvbWNwLWNhcHR1cmVzL3ByZXZpZXctPHRpbWVzdGFtcD4ucG5nLicpLFxuICAgICAgICAgICAgICAgICAgICBtb2RlOiB6LmVudW0oWydhdXRvJywgJ3dpbmRvdycsICdlbWJlZGRlZCddKS5kZWZhdWx0KCdhdXRvJykuZGVzY3JpYmUoJ0NhcHR1cmUgdGFyZ2V0LiBcImF1dG9cIiAoZGVmYXVsdCkgdHJpZXMgUHJldmlldy10aXRsZWQgd2luZG93IHRoZW4gZmFsbHMgYmFjayB0byB0aGUgbWFpbiBlZGl0b3Igd2luZG93LiBcIndpbmRvd1wiIG9ubHkgbWF0Y2hlcyBQcmV2aWV3LXRpdGxlZCB3aW5kb3dzIChmYWlscyBpZiBub25lKS4gXCJlbWJlZGRlZFwiIGNhcHR1cmVzIHRoZSBtYWluIGVkaXRvciB3aW5kb3cgZGlyZWN0bHkgKHNraXAgUHJldmlldy13aW5kb3cgcHJvYmUpLicpLFxuICAgICAgICAgICAgICAgICAgICB3aW5kb3dUaXRsZTogei5zdHJpbmcoKS5kZWZhdWx0KCdQcmV2aWV3JykuZGVzY3JpYmUoJ1N1YnN0cmluZyBtYXRjaGVkIGFnYWluc3Qgd2luZG93IHRpdGxlcyBpbiB3aW5kb3cvYXV0byBtb2RlcyAoZGVmYXVsdCBcIlByZXZpZXdcIiBmb3IgUElFKS4gSWdub3JlZCBpbiBlbWJlZGRlZCBtb2RlLicpLFxuICAgICAgICAgICAgICAgICAgICBpbmNsdWRlQmFzZTY0OiB6LmJvb2xlYW4oKS5kZWZhdWx0KGZhbHNlKS5kZXNjcmliZSgnRW1iZWQgUE5HIGJ5dGVzIGFzIGJhc2U2NCBpbiByZXNwb25zZSBkYXRhIChsYXJnZTsgZGVmYXVsdCBmYWxzZSkuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLmNhcHR1cmVQcmV2aWV3U2NyZWVuc2hvdChhLnNhdmVQYXRoLCBhLm1vZGUgPz8gJ2F1dG8nLCBhLndpbmRvd1RpdGxlLCBhLmluY2x1ZGVCYXNlNjQpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnZ2V0X3ByZXZpZXdfbW9kZScsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdSZWFkIHRoZSBjb2NvcyBwcmV2aWV3IGNvbmZpZ3VyYXRpb24gdmlhIEVkaXRvci5NZXNzYWdlIHByZWZlcmVuY2VzL3F1ZXJ5LWNvbmZpZyBzbyBBSSBjYW4gcm91dGUgZGVidWdfY2FwdHVyZV9wcmV2aWV3X3NjcmVlbnNob3QgdG8gdGhlIGNvcnJlY3QgbW9kZS4gUmV0dXJucyB7IGludGVycHJldGVkOiBcImJyb3dzZXJcIiB8IFwid2luZG93XCIgfCBcInNpbXVsYXRvclwiIHwgXCJlbWJlZGRlZFwiIHwgXCJ1bmtub3duXCIsIHJhdzogPGZ1bGwgcHJldmlldyBjb25maWcgZHVtcD4gfS4gVXNlIGJlZm9yZSBjYXB0dXJlOiBpZiBpbnRlcnByZXRlZD1cImVtYmVkZGVkXCIsIGNhbGwgY2FwdHVyZV9wcmV2aWV3X3NjcmVlbnNob3Qgd2l0aCBtb2RlPVwiZW1iZWRkZWRcIiBvciByZWx5IG9uIG1vZGU9XCJhdXRvXCIgZmFsbGJhY2suJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6ICgpID0+IHRoaXMuZ2V0UHJldmlld01vZGUoKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2JhdGNoX3NjcmVlbnNob3QnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnQ2FwdHVyZSBtdWx0aXBsZSBQTkdzIG9mIHRoZSBlZGl0b3Igd2luZG93IHdpdGggb3B0aW9uYWwgZGVsYXlzIGJldHdlZW4gc2hvdHMuIFVzZWZ1bCBmb3IgYW5pbWF0aW5nIHByZXZpZXcgdmVyaWZpY2F0aW9uIG9yIGNhcHR1cmluZyB0cmFuc2l0aW9ucy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHNhdmVQYXRoUHJlZml4OiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1BhdGggcHJlZml4IGZvciBiYXRjaCBvdXRwdXQgZmlsZXMuIEZpbGVzIHdyaXR0ZW4gYXMgPHByZWZpeD4tPGluZGV4Pi5wbmcuIE11c3QgcmVzb2x2ZSBpbnNpZGUgdGhlIGNvY29zIHByb2plY3Qgcm9vdCAoY29udGFpbm1lbnQgY2hlY2sgdmlhIHJlYWxwYXRoKS4gRGVmYXVsdDogPHByb2plY3Q+L3RlbXAvbWNwLWNhcHR1cmVzL2JhdGNoLTx0aW1lc3RhbXA+LicpLFxuICAgICAgICAgICAgICAgICAgICBkZWxheXNNczogei5hcnJheSh6Lm51bWJlcigpLm1pbigwKS5tYXgoMTAwMDApKS5tYXgoMjApLmRlZmF1bHQoWzBdKS5kZXNjcmliZSgnRGVsYXkgKG1zKSBiZWZvcmUgZWFjaCBjYXB0dXJlLiBMZW5ndGggZGV0ZXJtaW5lcyBob3cgbWFueSBzaG90cyB0YWtlbiAoY2FwcGVkIGF0IDIwIHRvIHByZXZlbnQgZGlzayBmaWxsIC8gZWRpdG9yIGZyZWV6ZSkuIERlZmF1bHQgWzBdID0gc2luZ2xlIHNob3QuJyksXG4gICAgICAgICAgICAgICAgICAgIHdpbmRvd1RpdGxlOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ09wdGlvbmFsIHN1YnN0cmluZyBtYXRjaCBvbiB3aW5kb3cgdGl0bGUuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLmJhdGNoU2NyZWVuc2hvdChhLnNhdmVQYXRoUHJlZml4LCBhLmRlbGF5c01zLCBhLndpbmRvd1RpdGxlKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3dhaXRfY29tcGlsZScsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdCbG9jayB1bnRpbCBjb2NvcyBmaW5pc2hlcyBpdHMgVHlwZVNjcmlwdCBjb21waWxlIHBhc3MuIFRhaWxzIHRlbXAvcHJvZ3JhbW1pbmcvcGFja2VyLWRyaXZlci9sb2dzL2RlYnVnLmxvZyBmb3IgdGhlIFwiVGFyZ2V0KGVkaXRvcikgZW5kc1wiIG1hcmtlci4gUmV0dXJucyBpbW1lZGlhdGVseSB3aXRoIGNvbXBpbGVkPWZhbHNlIGlmIG5vIGNvbXBpbGUgd2FzIHRyaWdnZXJlZCAoY2xlYW4gcHJvamVjdCAvIG5vIGNoYW5nZXMgZGV0ZWN0ZWQpLiBQYWlyIHdpdGggcnVuX3NjcmlwdF9kaWFnbm9zdGljcyBmb3IgYW4gXCJlZGl0IC50cyDihpIgd2FpdCDihpIgZmV0Y2ggZXJyb3JzXCIgd29ya2Zsb3cuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICB0aW1lb3V0TXM6IHoubnVtYmVyKCkubWluKDUwMCkubWF4KDEyMDAwMCkuZGVmYXVsdCgxNTAwMCkuZGVzY3JpYmUoJ01heCB3YWl0IHRpbWUgaW4gbXMgYmVmb3JlIGdpdmluZyB1cC4gRGVmYXVsdCAxNTAwMC4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMud2FpdENvbXBpbGUoYS50aW1lb3V0TXMpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAncnVuX3NjcmlwdF9kaWFnbm9zdGljcycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdSdW4gYHRzYyAtLW5vRW1pdGAgYWdhaW5zdCB0aGUgcHJvamVjdCB0c2NvbmZpZyBhbmQgcmV0dXJuIHBhcnNlZCBkaWFnbm9zdGljcy4gVXNlZCBhZnRlciB3YWl0X2NvbXBpbGUgdG8gc3VyZmFjZSBjb21waWxhdGlvbiBlcnJvcnMgYXMgc3RydWN0dXJlZCB7ZmlsZSwgbGluZSwgY29sdW1uLCBjb2RlLCBtZXNzYWdlfSBlbnRyaWVzLiBSZXNvbHZlcyB0c2MgYmluYXJ5IGZyb20gcHJvamVjdCBub2RlX21vZHVsZXMg4oaSIGVkaXRvciBidW5kbGVkIGVuZ2luZSDihpIgbnB4IGZhbGxiYWNrLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgdHNjb25maWdQYXRoOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ09wdGlvbmFsIG92ZXJyaWRlIChhYnNvbHV0ZSBvciBwcm9qZWN0LXJlbGF0aXZlKS4gRGVmYXVsdDogdHNjb25maWcuanNvbiBvciB0ZW1wL3RzY29uZmlnLmNvY29zLmpzb24uJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLnJ1blNjcmlwdERpYWdub3N0aWNzKGEudHNjb25maWdQYXRoKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3ByZXZpZXdfdXJsJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1Jlc29sdmUgdGhlIGNvY29zIGJyb3dzZXItcHJldmlldyBVUkwgKGUuZy4gaHR0cDovL2xvY2FsaG9zdDo3NDU2KSB2aWEgdGhlIGRvY3VtZW50ZWQgRWRpdG9yLk1lc3NhZ2UgY2hhbm5lbCBwcmV2aWV3L3F1ZXJ5LXByZXZpZXctdXJsLiBXaXRoIGFjdGlvbj1cIm9wZW5cIiwgYWxzbyBsYXVuY2hlcyB0aGUgVVJMIGluIHRoZSB1c2VyIGRlZmF1bHQgYnJvd3NlciB2aWEgZWxlY3Ryb24uc2hlbGwub3BlbkV4dGVybmFsIOKAlCB1c2VmdWwgYXMgYSBzZXR1cCBzdGVwIGJlZm9yZSBkZWJ1Z19nYW1lX2NvbW1hbmQsIHNpbmNlIHRoZSBHYW1lRGVidWdDbGllbnQgcnVubmluZyBpbnNpZGUgdGhlIHByZXZpZXcgbXVzdCBiZSByZWFjaGFibGUuIEVkaXRvci1zaWRlIFByZXZpZXctaW4tRWRpdG9yIHBsYXkvc3RvcCBpcyBOT1QgZXhwb3NlZCBieSB0aGUgcHVibGljIG1lc3NhZ2UgQVBJIGFuZCBpcyBpbnRlbnRpb25hbGx5IG5vdCBpbXBsZW1lbnRlZCBoZXJlOyB1c2UgdGhlIGNvY29zIGVkaXRvciB0b29sYmFyIG1hbnVhbGx5IGZvciBQSUUuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBhY3Rpb246IHouZW51bShbJ3F1ZXJ5JywgJ29wZW4nXSkuZGVmYXVsdCgncXVlcnknKS5kZXNjcmliZSgnXCJxdWVyeVwiIHJldHVybnMgdGhlIFVSTDsgXCJvcGVuXCIgcmV0dXJucyB0aGUgVVJMIEFORCBvcGVucyBpdCBpbiB0aGUgdXNlciBkZWZhdWx0IGJyb3dzZXIgdmlhIGVsZWN0cm9uLnNoZWxsLm9wZW5FeHRlcm5hbC4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMucHJldmlld1VybChhLmFjdGlvbiksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdxdWVyeV9kZXZpY2VzJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ0xpc3QgcHJldmlldyBkZXZpY2VzIGNvbmZpZ3VyZWQgaW4gdGhlIGNvY29zIHByb2plY3QgKGNjLklEZXZpY2VJdGVtIGVudHJpZXMpLiBCYWNrZWQgYnkgRWRpdG9yLk1lc3NhZ2UgY2hhbm5lbCBkZXZpY2UvcXVlcnkuIFJldHVybnMgYW4gYXJyYXkgb2Yge25hbWUsIHdpZHRoLCBoZWlnaHQsIHJhdGlvfSBlbnRyaWVzIOKAlCB1c2VmdWwgZm9yIGJhdGNoLXNjcmVlbnNob3QgcGlwZWxpbmVzIHRoYXQgdGFyZ2V0IG11bHRpcGxlIHJlc29sdXRpb25zLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiAoKSA9PiB0aGlzLnF1ZXJ5RGV2aWNlcygpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnZ2FtZV9jb21tYW5kJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1NlbmQgYSBydW50aW1lIGNvbW1hbmQgdG8gYSBHYW1lRGVidWdDbGllbnQgcnVubmluZyBpbnNpZGUgYSBjb2NvcyBwcmV2aWV3L2J1aWxkIChicm93c2VyLCBQcmV2aWV3LWluLUVkaXRvciwgb3IgYW55IGRldmljZSB0aGF0IGZldGNoZXMgL2dhbWUvY29tbWFuZCkuIEJ1aWx0LWluIGNvbW1hbmQgdHlwZXM6IFwic2NyZWVuc2hvdFwiIChjYXB0dXJlIGdhbWUgY2FudmFzIHRvIFBORywgcmV0dXJucyBzYXZlZCBmaWxlIHBhdGgpLCBcImNsaWNrXCIgKGVtaXQgQnV0dG9uLkNMSUNLIG9uIGEgbm9kZSBieSBuYW1lKSwgXCJpbnNwZWN0XCIgKGR1bXAgcnVudGltZSBub2RlIGluZm86IHBvc2l0aW9uL3NjYWxlL3JvdGF0aW9uL2NvbnRlbnRTaXplL2FjdGl2ZS9jb21wb25lbnRzIGJ5IG5hbWUpLiBDdXN0b20gY29tbWFuZCB0eXBlcyBhcmUgZm9yd2FyZGVkIHRvIHRoZSBjbGllbnRcXCdzIGN1c3RvbUNvbW1hbmRzIG1hcCAoZS5nLiBcInN0YXRlXCIsIFwibmF2aWdhdGVcIikuIFJlcXVpcmVzIHRoZSBHYW1lRGVidWdDbGllbnQgdGVtcGxhdGUgKGNsaWVudC9jb2Nvcy1tY3AtY2xpZW50LnRzKSB3aXJlZCBpbnRvIHRoZSBydW5uaW5nIGdhbWU7IHdpdGhvdXQgaXQgdGhlIGNhbGwgdGltZXMgb3V0LiBDaGVjayBHRVQgL2dhbWUvc3RhdHVzIHRvIHZlcmlmeSBjbGllbnQgbGl2ZW5lc3MgZmlyc3QuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICB0eXBlOiB6LnN0cmluZygpLm1pbigxKS5kZXNjcmliZSgnQ29tbWFuZCB0eXBlLiBCdWlsdC1pbnM6IHNjcmVlbnNob3QsIGNsaWNrLCBpbnNwZWN0LiBDdXN0b21zOiBhbnkgc3RyaW5nIHRoZSBHYW1lRGVidWdDbGllbnQgcmVnaXN0ZXJlZCBpbiBjdXN0b21Db21tYW5kcy4nKSxcbiAgICAgICAgICAgICAgICAgICAgYXJnczogei5hbnkoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdDb21tYW5kLXNwZWNpZmljIGFyZ3VtZW50cy4gRm9yIFwiY2xpY2tcIi9cImluc3BlY3RcIjoge25hbWU6IHN0cmluZ30gbm9kZSBuYW1lLiBGb3IgXCJzY3JlZW5zaG90XCI6IHt9IChubyBhcmdzKS4nKSxcbiAgICAgICAgICAgICAgICAgICAgdGltZW91dE1zOiB6Lm51bWJlcigpLm1pbig1MDApLm1heCg2MDAwMCkuZGVmYXVsdCgxMDAwMCkuZGVzY3JpYmUoJ01heCB3YWl0IGZvciBjbGllbnQgcmVzcG9uc2UuIERlZmF1bHQgMTAwMDBtcy4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMuZ2FtZUNvbW1hbmQoYS50eXBlLCBhLmFyZ3MsIGEudGltZW91dE1zKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2dhbWVfY2xpZW50X3N0YXR1cycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdSZWFkIEdhbWVEZWJ1Z0NsaWVudCBjb25uZWN0aW9uIHN0YXR1czogY29ubmVjdGVkIChwb2xsZWQgd2l0aGluIDJzKSwgbGFzdCBwb2xsIHRpbWVzdGFtcCwgd2hldGhlciBhIGNvbW1hbmQgaXMgcXVldWVkLiBVc2UgYmVmb3JlIGRlYnVnX2dhbWVfY29tbWFuZCB0byBjb25maXJtIHRoZSBjbGllbnQgaXMgcmVhY2hhYmxlLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiAoKSA9PiB0aGlzLmdhbWVDbGllbnRTdGF0dXMoKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3ByZXZpZXdfY29udHJvbCcsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdQcm9ncmFtbWF0aWNhbGx5IHN0YXJ0IG9yIHN0b3AgUHJldmlldy1pbi1FZGl0b3IgKFBJRSkgcGxheSBtb2RlLiBXcmFwcyB0aGUgdHlwZWQgY2NlLlNjZW5lRmFjYWRlLmNoYW5nZVByZXZpZXdQbGF5U3RhdGUgbWV0aG9kIChkb2N1bWVudGVkIG9uIFNjZW5lRmFjYWRlTWFuYWdlciBpbiBAY29jb3MvY3JlYXRvci10eXBlcykuIFBhaXIgd2l0aCBkZWJ1Z19jYXB0dXJlX3ByZXZpZXdfc2NyZWVuc2hvdDogY2FsbCBwcmV2aWV3X2NvbnRyb2wob3A9XCJzdGFydFwiKSB0byBlbnRlciBwbGF5IG1vZGUsIHdhaXQgZm9yIHRoZSBQSUUgd2luZG93IHRvIGFwcGVhciwgdGhlbiBjYXB0dXJlLiBwcmV2aWV3X2NvbnRyb2wob3A9XCJzdG9wXCIpIHJldHVybnMgdG8gc2NlbmUgbW9kZS4gSW1wbGVtZW50YXRpb24gcm91dGVzIHRocm91Z2ggc2NlbmUtc2NyaXB0IChleGVjdXRlLXNjZW5lLXNjcmlwdCDihpIgc2NlbmUtc2lkZSBjaGFuZ2VQcmV2aWV3UGxheVN0YXRlIGhhbmRsZXIpIHNvIHRoZSBjYWxsIGlzIHR5cGUtY2hlY2tlZCBhZ2FpbnN0IGNyZWF0b3ItdHlwZXMgYW5kIG5vdCBzdWJqZWN0IHRvIHNpbGVudCByZW1vdmFsIGJldHdlZW4gY29jb3MgdmVyc2lvbnMuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBvcDogei5lbnVtKFsnc3RhcnQnLCAnc3RvcCddKS5kZXNjcmliZSgnXCJzdGFydFwiIGVudGVycyBQSUUgcGxheSBtb2RlIChlcXVpdmFsZW50IHRvIGNsaWNraW5nIHRoZSB0b29sYmFyIHBsYXkgYnV0dG9uKS4gXCJzdG9wXCIgZXhpdHMgUElFIHBsYXkgYW5kIHJldHVybnMgdG8gc2NlbmUgbW9kZS4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMucHJldmlld0NvbnRyb2woYS5vcCksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdnZXRfc2NyaXB0X2RpYWdub3N0aWNfY29udGV4dCcsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdSZWFkIGEgd2luZG93IG9mIHNvdXJjZSBsaW5lcyBhcm91bmQgYSBkaWFnbm9zdGljIGxvY2F0aW9uIHNvIEFJIGNhbiByZWFkIHRoZSBvZmZlbmRpbmcgY29kZSB3aXRob3V0IGEgc2VwYXJhdGUgZmlsZSByZWFkLiBQYWlyIHdpdGggcnVuX3NjcmlwdF9kaWFnbm9zdGljczogcGFzcyBmaWxlL2xpbmUgZnJvbSBlYWNoIGRpYWdub3N0aWMgdG8gZmV0Y2ggY29udGV4dC4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIGZpbGU6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0Fic29sdXRlIG9yIHByb2plY3QtcmVsYXRpdmUgcGF0aCB0byB0aGUgc291cmNlIGZpbGUuIERpYWdub3N0aWNzIGZyb20gcnVuX3NjcmlwdF9kaWFnbm9zdGljcyBhbHJlYWR5IHVzZSBhIHBhdGggdHNjIGVtaXR0ZWQsIHdoaWNoIGlzIHN1aXRhYmxlIGhlcmUuJyksXG4gICAgICAgICAgICAgICAgICAgIGxpbmU6IHoubnVtYmVyKCkubWluKDEpLmRlc2NyaWJlKCcxLWJhc2VkIGxpbmUgbnVtYmVyIHRoYXQgdGhlIGRpYWdub3N0aWMgcG9pbnRzIGF0LicpLFxuICAgICAgICAgICAgICAgICAgICBjb250ZXh0TGluZXM6IHoubnVtYmVyKCkubWluKDApLm1heCg1MCkuZGVmYXVsdCg1KS5kZXNjcmliZSgnTnVtYmVyIG9mIGxpbmVzIHRvIGluY2x1ZGUgYmVmb3JlIGFuZCBhZnRlciB0aGUgdGFyZ2V0IGxpbmUuIERlZmF1bHQgNSAowrE1IOKGkiAxMS1saW5lIHdpbmRvdykuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLmdldFNjcmlwdERpYWdub3N0aWNDb250ZXh0KGEuZmlsZSwgYS5saW5lLCBhLmNvbnRleHRMaW5lcyksXG4gICAgICAgICAgICB9LFxuICAgICAgICBdO1xuICAgICAgICB0aGlzLmV4ZWMgPSBkZWZpbmVUb29scyhkZWZzKTtcbiAgICB9XG5cbiAgICBnZXRUb29scygpOiBUb29sRGVmaW5pdGlvbltdIHsgcmV0dXJuIHRoaXMuZXhlYy5nZXRUb29scygpOyB9XG4gICAgZXhlY3V0ZSh0b29sTmFtZTogc3RyaW5nLCBhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4geyByZXR1cm4gdGhpcy5leGVjLmV4ZWN1dGUodG9vbE5hbWUsIGFyZ3MpOyB9XG5cbiAgICAvLyBDb21wYXQgcGF0aDogcHJlc2VydmUgdGhlIHByZS12Mi4zLjAgcmVzcG9uc2Ugc2hhcGVcbiAgICAvLyB7c3VjY2VzcywgZGF0YToge3Jlc3VsdCwgbWVzc2FnZTogJ1NjcmlwdCBleGVjdXRlZCBzdWNjZXNzZnVsbHknfX1cbiAgICAvLyBzbyBvbGRlciBjYWxsZXJzIHJlYWRpbmcgZGF0YS5tZXNzYWdlIGtlZXAgd29ya2luZy5cbiAgICBwcml2YXRlIGFzeW5jIGV4ZWN1dGVTY3JpcHRDb21wYXQoc2NyaXB0OiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBvdXQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVKYXZhU2NyaXB0KHNjcmlwdCwgJ3NjZW5lJyk7XG4gICAgICAgIGlmIChvdXQuc3VjY2VzcyAmJiBvdXQuZGF0YSAmJiAncmVzdWx0JyBpbiBvdXQuZGF0YSkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0OiBvdXQuZGF0YS5yZXN1bHQsXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdTY3JpcHQgZXhlY3V0ZWQgc3VjY2Vzc2Z1bGx5JyxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gb3V0O1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgY2xlYXJDb25zb2xlKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBOb3RlOiBFZGl0b3IuTWVzc2FnZS5zZW5kIG1heSBub3QgcmV0dXJuIGEgcHJvbWlzZSBpbiBhbGwgdmVyc2lvbnNcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnNlbmQoJ2NvbnNvbGUnLCAnY2xlYXInKTtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiAnQ29uc29sZSBjbGVhcmVkIHN1Y2Nlc3NmdWxseSdcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVyci5tZXNzYWdlIH07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGV4ZWN1dGVKYXZhU2NyaXB0KGNvZGU6IHN0cmluZywgY29udGV4dDogJ3NjZW5lJyB8ICdlZGl0b3InKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgaWYgKGNvbnRleHQgPT09ICdzY2VuZScpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmV4ZWN1dGVJblNjZW5lQ29udGV4dChjb2RlKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoY29udGV4dCA9PT0gJ2VkaXRvcicpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmV4ZWN1dGVJbkVkaXRvckNvbnRleHQoY29kZSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgVW5rbm93biBleGVjdXRlX2phdmFzY3JpcHQgY29udGV4dDogJHtjb250ZXh0fWAgfTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGV4ZWN1dGVJblNjZW5lQ29udGV4dChjb2RlOiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ2V4ZWN1dGUtc2NlbmUtc2NyaXB0Jywge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdjb25zb2xlJyxcbiAgICAgICAgICAgICAgICBtZXRob2Q6ICdldmFsJyxcbiAgICAgICAgICAgICAgICBhcmdzOiBbY29kZV1cbiAgICAgICAgICAgIH0pLnRoZW4oKHJlc3VsdDogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRleHQ6ICdzY2VuZScsXG4gICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQ6IHJlc3VsdCxcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogJ1NjZW5lIHNjcmlwdCBleGVjdXRlZCBzdWNjZXNzZnVsbHknXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVyci5tZXNzYWdlIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZXhlY3V0ZUluRWRpdG9yQ29udGV4dChjb2RlOiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBpZiAoIWlzRWRpdG9yQ29udGV4dEV2YWxFbmFibGVkKCkpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgZXJyb3I6ICdFZGl0b3IgY29udGV4dCBldmFsIGlzIGRpc2FibGVkLiBFbmFibGUgYGVuYWJsZUVkaXRvckNvbnRleHRFdmFsYCBpbiBNQ1Agc2VydmVyIHNldHRpbmdzIChwYW5lbCBVSSkgdG8gb3B0IGluLiBUaGlzIGdyYW50cyBBSS1nZW5lcmF0ZWQgY29kZSBhY2Nlc3MgdG8gRWRpdG9yLk1lc3NhZ2UgKyBOb2RlIGZzIEFQSXMgaW4gdGhlIGhvc3QgcHJvY2Vzczsgb25seSBlbmFibGUgd2hlbiB5b3UgdHJ1c3QgdGhlIHVwc3RyZWFtIHByb21wdCBzb3VyY2UuJyxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIFdyYXAgaW4gYXN5bmMgSUlGRSBzbyBBSSBjYW4gdXNlIHRvcC1sZXZlbCBhd2FpdCB0cmFuc3BhcmVudGx5O1xuICAgICAgICAgICAgLy8gYWxzbyBnaXZlcyB1cyBhIGNsZWFuIFByb21pc2UtYmFzZWQgcmV0dXJuIHBhdGggcmVnYXJkbGVzcyBvZlxuICAgICAgICAgICAgLy8gd2hldGhlciB0aGUgdXNlciBjb2RlIHJldHVybnMgYSBQcm9taXNlIG9yIGEgc3luYyB2YWx1ZS5cbiAgICAgICAgICAgIGNvbnN0IHdyYXBwZWQgPSBgKGFzeW5jICgpID0+IHsgJHtjb2RlfSBcXG4gfSkoKWA7XG4gICAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tZXZhbFxuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgKDAsIGV2YWwpKHdyYXBwZWQpO1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgY29udGV4dDogJ2VkaXRvcicsXG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdDogcmVzdWx0LFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogJ0VkaXRvciBzY3JpcHQgZXhlY3V0ZWQgc3VjY2Vzc2Z1bGx5JyxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgIGVycm9yOiBgRWRpdG9yIGV2YWwgZmFpbGVkOiAke2Vycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKX1gLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2V0Tm9kZVRyZWUocm9vdFV1aWQ/OiBzdHJpbmcsIG1heERlcHRoOiBudW1iZXIgPSAxMCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgYnVpbGRUcmVlID0gYXN5bmMgKG5vZGVVdWlkOiBzdHJpbmcsIGRlcHRoOiBudW1iZXIgPSAwKTogUHJvbWlzZTxhbnk+ID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZGVwdGggPj0gbWF4RGVwdGgpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgdHJ1bmNhdGVkOiB0cnVlIH07XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgbm9kZURhdGEgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1ub2RlJywgbm9kZVV1aWQpO1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdHJlZSA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IG5vZGVEYXRhLnV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBuYW1lOiBub2RlRGF0YS5uYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgYWN0aXZlOiBub2RlRGF0YS5hY3RpdmUsXG4gICAgICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRzOiAobm9kZURhdGEgYXMgYW55KS5jb21wb25lbnRzID8gKG5vZGVEYXRhIGFzIGFueSkuY29tcG9uZW50cy5tYXAoKGM6IGFueSkgPT4gYy5fX3R5cGVfXykgOiBbXSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNoaWxkQ291bnQ6IG5vZGVEYXRhLmNoaWxkcmVuID8gbm9kZURhdGEuY2hpbGRyZW4ubGVuZ3RoIDogMCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNoaWxkcmVuOiBbXSBhcyBhbnlbXVxuICAgICAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChub2RlRGF0YS5jaGlsZHJlbiAmJiBub2RlRGF0YS5jaGlsZHJlbi5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGNoaWxkSWQgb2Ygbm9kZURhdGEuY2hpbGRyZW4pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjaGlsZFRyZWUgPSBhd2FpdCBidWlsZFRyZWUoY2hpbGRJZCwgZGVwdGggKyAxKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0cmVlLmNoaWxkcmVuLnB1c2goY2hpbGRUcmVlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0cmVlO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7IGVycm9yOiBlcnIubWVzc2FnZSB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGlmIChyb290VXVpZCkge1xuICAgICAgICAgICAgICAgIGJ1aWxkVHJlZShyb290VXVpZCkudGhlbih0cmVlID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IHRyZWUgfSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LWhpZXJhcmNoeScpLnRoZW4oYXN5bmMgKGhpZXJhcmNoeTogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRyZWVzID0gW107XG4gICAgICAgICAgICAgICAgICAgIGZvciAoY29uc3Qgcm9vdE5vZGUgb2YgaGllcmFyY2h5LmNoaWxkcmVuKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB0cmVlID0gYXdhaXQgYnVpbGRUcmVlKHJvb3ROb2RlLnV1aWQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdHJlZXMucHVzaCh0cmVlKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogdHJlZXMgfSk7XG4gICAgICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2V0UGVyZm9ybWFuY2VTdGF0cygpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LXBlcmZvcm1hbmNlJykudGhlbigoc3RhdHM6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHBlcmZTdGF0czogUGVyZm9ybWFuY2VTdGF0cyA9IHtcbiAgICAgICAgICAgICAgICAgICAgbm9kZUNvdW50OiBzdGF0cy5ub2RlQ291bnQgfHwgMCxcbiAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50Q291bnQ6IHN0YXRzLmNvbXBvbmVudENvdW50IHx8IDAsXG4gICAgICAgICAgICAgICAgICAgIGRyYXdDYWxsczogc3RhdHMuZHJhd0NhbGxzIHx8IDAsXG4gICAgICAgICAgICAgICAgICAgIHRyaWFuZ2xlczogc3RhdHMudHJpYW5nbGVzIHx8IDAsXG4gICAgICAgICAgICAgICAgICAgIG1lbW9yeTogc3RhdHMubWVtb3J5IHx8IHt9XG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogcGVyZlN0YXRzIH0pO1xuICAgICAgICAgICAgfSkuY2F0Y2goKCkgPT4ge1xuICAgICAgICAgICAgICAgIC8vIEZhbGxiYWNrIHRvIGJhc2ljIHN0YXRzXG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdQZXJmb3JtYW5jZSBzdGF0cyBub3QgYXZhaWxhYmxlIGluIGVkaXQgbW9kZSdcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgdmFsaWRhdGVTY2VuZShvcHRpb25zOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBpc3N1ZXM6IFZhbGlkYXRpb25Jc3N1ZVtdID0gW107XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIENoZWNrIGZvciBtaXNzaW5nIGFzc2V0c1xuICAgICAgICAgICAgaWYgKG9wdGlvbnMuY2hlY2tNaXNzaW5nQXNzZXRzKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgYXNzZXRDaGVjayA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ2NoZWNrLW1pc3NpbmctYXNzZXRzJyk7XG4gICAgICAgICAgICAgICAgaWYgKGFzc2V0Q2hlY2sgJiYgYXNzZXRDaGVjay5taXNzaW5nKSB7XG4gICAgICAgICAgICAgICAgICAgIGlzc3Vlcy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6ICdlcnJvcicsXG4gICAgICAgICAgICAgICAgICAgICAgICBjYXRlZ29yeTogJ2Fzc2V0cycsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgRm91bmQgJHthc3NldENoZWNrLm1pc3NpbmcubGVuZ3RofSBtaXNzaW5nIGFzc2V0IHJlZmVyZW5jZXNgLFxuICAgICAgICAgICAgICAgICAgICAgICAgZGV0YWlsczogYXNzZXRDaGVjay5taXNzaW5nXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gQ2hlY2sgZm9yIHBlcmZvcm1hbmNlIGlzc3Vlc1xuICAgICAgICAgICAgaWYgKG9wdGlvbnMuY2hlY2tQZXJmb3JtYW5jZSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGhpZXJhcmNoeSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LWhpZXJhcmNoeScpO1xuICAgICAgICAgICAgICAgIGNvbnN0IG5vZGVDb3VudCA9IHRoaXMuY291bnROb2RlcyhoaWVyYXJjaHkuY2hpbGRyZW4pO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGlmIChub2RlQ291bnQgPiAxMDAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGlzc3Vlcy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6ICd3YXJuaW5nJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhdGVnb3J5OiAncGVyZm9ybWFuY2UnLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYEhpZ2ggbm9kZSBjb3VudDogJHtub2RlQ291bnR9IG5vZGVzIChyZWNvbW1lbmRlZCA8IDEwMDApYCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHN1Z2dlc3Rpb246ICdDb25zaWRlciB1c2luZyBvYmplY3QgcG9vbGluZyBvciBzY2VuZSBvcHRpbWl6YXRpb24nXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgcmVzdWx0OiBWYWxpZGF0aW9uUmVzdWx0ID0ge1xuICAgICAgICAgICAgICAgIHZhbGlkOiBpc3N1ZXMubGVuZ3RoID09PSAwLFxuICAgICAgICAgICAgICAgIGlzc3VlQ291bnQ6IGlzc3Vlcy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgaXNzdWVzOiBpc3N1ZXNcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IHJlc3VsdCB9O1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnIubWVzc2FnZSB9O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBjb3VudE5vZGVzKG5vZGVzOiBhbnlbXSk6IG51bWJlciB7XG4gICAgICAgIGxldCBjb3VudCA9IG5vZGVzLmxlbmd0aDtcbiAgICAgICAgZm9yIChjb25zdCBub2RlIG9mIG5vZGVzKSB7XG4gICAgICAgICAgICBpZiAobm9kZS5jaGlsZHJlbikge1xuICAgICAgICAgICAgICAgIGNvdW50ICs9IHRoaXMuY291bnROb2Rlcyhub2RlLmNoaWxkcmVuKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gY291bnQ7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRFZGl0b3JJbmZvKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IGluZm8gPSB7XG4gICAgICAgICAgICBlZGl0b3I6IHtcbiAgICAgICAgICAgICAgICB2ZXJzaW9uOiAoRWRpdG9yIGFzIGFueSkudmVyc2lvbnM/LmVkaXRvciB8fCAnVW5rbm93bicsXG4gICAgICAgICAgICAgICAgY29jb3NWZXJzaW9uOiAoRWRpdG9yIGFzIGFueSkudmVyc2lvbnM/LmNvY29zIHx8ICdVbmtub3duJyxcbiAgICAgICAgICAgICAgICBwbGF0Zm9ybTogcHJvY2Vzcy5wbGF0Zm9ybSxcbiAgICAgICAgICAgICAgICBhcmNoOiBwcm9jZXNzLmFyY2gsXG4gICAgICAgICAgICAgICAgbm9kZVZlcnNpb246IHByb2Nlc3MudmVyc2lvblxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHByb2plY3Q6IHtcbiAgICAgICAgICAgICAgICBuYW1lOiBFZGl0b3IuUHJvamVjdC5uYW1lLFxuICAgICAgICAgICAgICAgIHBhdGg6IEVkaXRvci5Qcm9qZWN0LnBhdGgsXG4gICAgICAgICAgICAgICAgdXVpZDogRWRpdG9yLlByb2plY3QudXVpZFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIG1lbW9yeTogcHJvY2Vzcy5tZW1vcnlVc2FnZSgpLFxuICAgICAgICAgICAgdXB0aW1lOiBwcm9jZXNzLnVwdGltZSgpXG4gICAgICAgIH07XG5cbiAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogaW5mbyB9O1xuICAgIH1cblxuICAgIHByaXZhdGUgcmVzb2x2ZVByb2plY3RMb2dQYXRoKCk6IHsgcGF0aDogc3RyaW5nIH0gfCB7IGVycm9yOiBzdHJpbmcgfSB7XG4gICAgICAgIGlmICghRWRpdG9yLlByb2plY3QgfHwgIUVkaXRvci5Qcm9qZWN0LnBhdGgpIHtcbiAgICAgICAgICAgIHJldHVybiB7IGVycm9yOiAnRWRpdG9yLlByb2plY3QucGF0aCBpcyBub3QgYXZhaWxhYmxlOyBjYW5ub3QgbG9jYXRlIHByb2plY3QgbG9nIGZpbGUuJyB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGxvZ1BhdGggPSBwYXRoLmpvaW4oRWRpdG9yLlByb2plY3QucGF0aCwgJ3RlbXAvbG9ncy9wcm9qZWN0LmxvZycpO1xuICAgICAgICBpZiAoIWZzLmV4aXN0c1N5bmMobG9nUGF0aCkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IGVycm9yOiBgUHJvamVjdCBsb2cgZmlsZSBub3QgZm91bmQgYXQgJHtsb2dQYXRofWAgfTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4geyBwYXRoOiBsb2dQYXRoIH07XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRQcm9qZWN0TG9ncyhsaW5lczogbnVtYmVyID0gMTAwLCBmaWx0ZXJLZXl3b3JkPzogc3RyaW5nLCBsb2dMZXZlbDogc3RyaW5nID0gJ0FMTCcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcmVzb2x2ZWQgPSB0aGlzLnJlc29sdmVQcm9qZWN0TG9nUGF0aCgpO1xuICAgICAgICAgICAgaWYgKCdlcnJvcicgaW4gcmVzb2x2ZWQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHJlc29sdmVkLmVycm9yIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBsb2dGaWxlUGF0aCA9IHJlc29sdmVkLnBhdGg7XG5cbiAgICAgICAgICAgIC8vIFJlYWQgdGhlIGZpbGUgY29udGVudFxuICAgICAgICAgICAgY29uc3QgbG9nQ29udGVudCA9IGZzLnJlYWRGaWxlU3luYyhsb2dGaWxlUGF0aCwgJ3V0ZjgnKTtcbiAgICAgICAgICAgIGNvbnN0IGxvZ0xpbmVzID0gbG9nQ29udGVudC5zcGxpdCgnXFxuJykuZmlsdGVyKGxpbmUgPT4gbGluZS50cmltKCkgIT09ICcnKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gR2V0IHRoZSBsYXN0IE4gbGluZXNcbiAgICAgICAgICAgIGNvbnN0IHJlY2VudExpbmVzID0gbG9nTGluZXMuc2xpY2UoLWxpbmVzKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gQXBwbHkgZmlsdGVyc1xuICAgICAgICAgICAgbGV0IGZpbHRlcmVkTGluZXMgPSByZWNlbnRMaW5lcztcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gRmlsdGVyIGJ5IGxvZyBsZXZlbCBpZiBub3QgJ0FMTCdcbiAgICAgICAgICAgIGlmIChsb2dMZXZlbCAhPT0gJ0FMTCcpIHtcbiAgICAgICAgICAgICAgICBmaWx0ZXJlZExpbmVzID0gZmlsdGVyZWRMaW5lcy5maWx0ZXIobGluZSA9PiBcbiAgICAgICAgICAgICAgICAgICAgbGluZS5pbmNsdWRlcyhgWyR7bG9nTGV2ZWx9XWApIHx8IGxpbmUuaW5jbHVkZXMobG9nTGV2ZWwudG9Mb3dlckNhc2UoKSlcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBGaWx0ZXIgYnkga2V5d29yZCBpZiBwcm92aWRlZFxuICAgICAgICAgICAgaWYgKGZpbHRlcktleXdvcmQpIHtcbiAgICAgICAgICAgICAgICBmaWx0ZXJlZExpbmVzID0gZmlsdGVyZWRMaW5lcy5maWx0ZXIobGluZSA9PiBcbiAgICAgICAgICAgICAgICAgICAgbGluZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKGZpbHRlcktleXdvcmQudG9Mb3dlckNhc2UoKSlcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICB0b3RhbExpbmVzOiBsb2dMaW5lcy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgIHJlcXVlc3RlZExpbmVzOiBsaW5lcyxcbiAgICAgICAgICAgICAgICAgICAgZmlsdGVyZWRMaW5lczogZmlsdGVyZWRMaW5lcy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgIGxvZ0xldmVsOiBsb2dMZXZlbCxcbiAgICAgICAgICAgICAgICAgICAgZmlsdGVyS2V5d29yZDogZmlsdGVyS2V5d29yZCB8fCBudWxsLFxuICAgICAgICAgICAgICAgICAgICBsb2dzOiBmaWx0ZXJlZExpbmVzLFxuICAgICAgICAgICAgICAgICAgICBsb2dGaWxlUGF0aDogbG9nRmlsZVBhdGhcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgIGVycm9yOiBgRmFpbGVkIHRvIHJlYWQgcHJvamVjdCBsb2dzOiAke2Vycm9yLm1lc3NhZ2V9YFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2V0TG9nRmlsZUluZm8oKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJlc29sdmVkID0gdGhpcy5yZXNvbHZlUHJvamVjdExvZ1BhdGgoKTtcbiAgICAgICAgICAgIGlmICgnZXJyb3InIGluIHJlc29sdmVkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiByZXNvbHZlZC5lcnJvciB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgbG9nRmlsZVBhdGggPSByZXNvbHZlZC5wYXRoO1xuXG4gICAgICAgICAgICBjb25zdCBzdGF0cyA9IGZzLnN0YXRTeW5jKGxvZ0ZpbGVQYXRoKTtcbiAgICAgICAgICAgIGNvbnN0IGxvZ0NvbnRlbnQgPSBmcy5yZWFkRmlsZVN5bmMobG9nRmlsZVBhdGgsICd1dGY4Jyk7XG4gICAgICAgICAgICBjb25zdCBsaW5lQ291bnQgPSBsb2dDb250ZW50LnNwbGl0KCdcXG4nKS5maWx0ZXIobGluZSA9PiBsaW5lLnRyaW0oKSAhPT0gJycpLmxlbmd0aDtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgZmlsZVBhdGg6IGxvZ0ZpbGVQYXRoLFxuICAgICAgICAgICAgICAgICAgICBmaWxlU2l6ZTogc3RhdHMuc2l6ZSxcbiAgICAgICAgICAgICAgICAgICAgZmlsZVNpemVGb3JtYXR0ZWQ6IHRoaXMuZm9ybWF0RmlsZVNpemUoc3RhdHMuc2l6ZSksXG4gICAgICAgICAgICAgICAgICAgIGxhc3RNb2RpZmllZDogc3RhdHMubXRpbWUudG9JU09TdHJpbmcoKSxcbiAgICAgICAgICAgICAgICAgICAgbGluZUNvdW50OiBsaW5lQ291bnQsXG4gICAgICAgICAgICAgICAgICAgIGNyZWF0ZWQ6IHN0YXRzLmJpcnRodGltZS50b0lTT1N0cmluZygpLFxuICAgICAgICAgICAgICAgICAgICBhY2Nlc3NpYmxlOiBmcy5jb25zdGFudHMuUl9PS1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgZXJyb3I6IGBGYWlsZWQgdG8gZ2V0IGxvZyBmaWxlIGluZm86ICR7ZXJyb3IubWVzc2FnZX1gXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBzZWFyY2hQcm9qZWN0TG9ncyhwYXR0ZXJuOiBzdHJpbmcsIG1heFJlc3VsdHM6IG51bWJlciA9IDIwLCBjb250ZXh0TGluZXM6IG51bWJlciA9IDIpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcmVzb2x2ZWQgPSB0aGlzLnJlc29sdmVQcm9qZWN0TG9nUGF0aCgpO1xuICAgICAgICAgICAgaWYgKCdlcnJvcicgaW4gcmVzb2x2ZWQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHJlc29sdmVkLmVycm9yIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBsb2dGaWxlUGF0aCA9IHJlc29sdmVkLnBhdGg7XG5cbiAgICAgICAgICAgIGNvbnN0IGxvZ0NvbnRlbnQgPSBmcy5yZWFkRmlsZVN5bmMobG9nRmlsZVBhdGgsICd1dGY4Jyk7XG4gICAgICAgICAgICBjb25zdCBsb2dMaW5lcyA9IGxvZ0NvbnRlbnQuc3BsaXQoJ1xcbicpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBDcmVhdGUgcmVnZXggcGF0dGVybiAoc3VwcG9ydCBib3RoIHN0cmluZyBhbmQgcmVnZXggcGF0dGVybnMpXG4gICAgICAgICAgICBsZXQgcmVnZXg6IFJlZ0V4cDtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgcmVnZXggPSBuZXcgUmVnRXhwKHBhdHRlcm4sICdnaScpO1xuICAgICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICAgICAgLy8gSWYgcGF0dGVybiBpcyBub3QgdmFsaWQgcmVnZXgsIHRyZWF0IGFzIGxpdGVyYWwgc3RyaW5nXG4gICAgICAgICAgICAgICAgcmVnZXggPSBuZXcgUmVnRXhwKHBhdHRlcm4ucmVwbGFjZSgvWy4qKz9eJHt9KCl8W1xcXVxcXFxdL2csICdcXFxcJCYnKSwgJ2dpJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGNvbnN0IG1hdGNoZXM6IGFueVtdID0gW107XG4gICAgICAgICAgICBsZXQgcmVzdWx0Q291bnQgPSAwO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGxvZ0xpbmVzLmxlbmd0aCAmJiByZXN1bHRDb3VudCA8IG1heFJlc3VsdHM7IGkrKykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGxpbmUgPSBsb2dMaW5lc1tpXTtcbiAgICAgICAgICAgICAgICBpZiAocmVnZXgudGVzdChsaW5lKSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBHZXQgY29udGV4dCBsaW5lc1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjb250ZXh0U3RhcnQgPSBNYXRoLm1heCgwLCBpIC0gY29udGV4dExpbmVzKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY29udGV4dEVuZCA9IE1hdGgubWluKGxvZ0xpbmVzLmxlbmd0aCAtIDEsIGkgKyBjb250ZXh0TGluZXMpO1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY29udGV4dExpbmVzQXJyYXkgPSBbXTtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaiA9IGNvbnRleHRTdGFydDsgaiA8PSBjb250ZXh0RW5kOyBqKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRleHRMaW5lc0FycmF5LnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxpbmVOdW1iZXI6IGogKyAxLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRlbnQ6IGxvZ0xpbmVzW2pdLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlzTWF0Y2g6IGogPT09IGlcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICBtYXRjaGVzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgbGluZU51bWJlcjogaSArIDEsXG4gICAgICAgICAgICAgICAgICAgICAgICBtYXRjaGVkTGluZTogbGluZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRleHQ6IGNvbnRleHRMaW5lc0FycmF5XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0Q291bnQrKztcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIC8vIFJlc2V0IHJlZ2V4IGxhc3RJbmRleCBmb3IgZ2xvYmFsIHNlYXJjaFxuICAgICAgICAgICAgICAgICAgICByZWdleC5sYXN0SW5kZXggPSAwO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgcGF0dGVybjogcGF0dGVybixcbiAgICAgICAgICAgICAgICAgICAgdG90YWxNYXRjaGVzOiBtYXRjaGVzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgbWF4UmVzdWx0czogbWF4UmVzdWx0cyxcbiAgICAgICAgICAgICAgICAgICAgY29udGV4dExpbmVzOiBjb250ZXh0TGluZXMsXG4gICAgICAgICAgICAgICAgICAgIGxvZ0ZpbGVQYXRoOiBsb2dGaWxlUGF0aCxcbiAgICAgICAgICAgICAgICAgICAgbWF0Y2hlczogbWF0Y2hlc1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgZXJyb3I6IGBGYWlsZWQgdG8gc2VhcmNoIHByb2plY3QgbG9nczogJHtlcnJvci5tZXNzYWdlfWBcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGZvcm1hdEZpbGVTaXplKGJ5dGVzOiBudW1iZXIpOiBzdHJpbmcge1xuICAgICAgICBjb25zdCB1bml0cyA9IFsnQicsICdLQicsICdNQicsICdHQiddO1xuICAgICAgICBsZXQgc2l6ZSA9IGJ5dGVzO1xuICAgICAgICBsZXQgdW5pdEluZGV4ID0gMDtcblxuICAgICAgICB3aGlsZSAoc2l6ZSA+PSAxMDI0ICYmIHVuaXRJbmRleCA8IHVuaXRzLmxlbmd0aCAtIDEpIHtcbiAgICAgICAgICAgIHNpemUgLz0gMTAyNDtcbiAgICAgICAgICAgIHVuaXRJbmRleCsrO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGAke3NpemUudG9GaXhlZCgyKX0gJHt1bml0c1t1bml0SW5kZXhdfWA7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBwaWNrV2luZG93KHRpdGxlU3Vic3RyaW5nPzogc3RyaW5nKTogYW55IHtcbiAgICAgICAgLy8gTGF6eSByZXF1aXJlIHNvIHRoYXQgbm9uLUVsZWN0cm9uIGNvbnRleHRzIChlLmcuIHVuaXQgdGVzdHMsIHNtb2tlXG4gICAgICAgIC8vIHNjcmlwdCB3aXRoIHN0dWIgcmVnaXN0cnkpIGNhbiBzdGlsbCBpbXBvcnQgdGhpcyBtb2R1bGUuXG4gICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tdmFyLXJlcXVpcmVzXG4gICAgICAgIGNvbnN0IGVsZWN0cm9uID0gcmVxdWlyZSgnZWxlY3Ryb24nKTtcbiAgICAgICAgY29uc3QgQlcgPSBlbGVjdHJvbi5Ccm93c2VyV2luZG93O1xuICAgICAgICBpZiAoIUJXKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0VsZWN0cm9uIEJyb3dzZXJXaW5kb3cgQVBJIHVuYXZhaWxhYmxlOyBzY3JlZW5zaG90IHRvb2wgcmVxdWlyZXMgcnVubmluZyBpbnNpZGUgQ29jb3MgZWRpdG9yIGhvc3QgcHJvY2Vzcy4nKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGl0bGVTdWJzdHJpbmcpIHtcbiAgICAgICAgICAgIGNvbnN0IG1hdGNoZXMgPSBCVy5nZXRBbGxXaW5kb3dzKCkuZmlsdGVyKCh3OiBhbnkpID0+XG4gICAgICAgICAgICAgICAgdyAmJiAhdy5pc0Rlc3Ryb3llZCgpICYmICh3LmdldFRpdGxlPy4oKSB8fCAnJykuaW5jbHVkZXModGl0bGVTdWJzdHJpbmcpKTtcbiAgICAgICAgICAgIGlmIChtYXRjaGVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgTm8gRWxlY3Ryb24gd2luZG93IHRpdGxlIG1hdGNoZWQgc3Vic3RyaW5nOiAke3RpdGxlU3Vic3RyaW5nfWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIG1hdGNoZXNbMF07XG4gICAgICAgIH1cbiAgICAgICAgLy8gdjIuMy4xIHJldmlldyBmaXg6IGZvY3VzZWQgd2luZG93IG1heSBiZSBhIHRyYW5zaWVudCBwcmV2aWV3IHBvcHVwLlxuICAgICAgICAvLyBQcmVmZXIgYSBub24tUHJldmlldyB3aW5kb3cgc28gZGVmYXVsdCBzY3JlZW5zaG90cyB0YXJnZXQgdGhlIG1haW5cbiAgICAgICAgLy8gZWRpdG9yIHN1cmZhY2UuIENhbGxlciBjYW4gc3RpbGwgcGFzcyB0aXRsZVN1YnN0cmluZz0nUHJldmlldycgdG9cbiAgICAgICAgLy8gZXhwbGljaXRseSB0YXJnZXQgdGhlIHByZXZpZXcgd2hlbiB3YW50ZWQuXG4gICAgICAgIGNvbnN0IGFsbDogYW55W10gPSBCVy5nZXRBbGxXaW5kb3dzKCkuZmlsdGVyKCh3OiBhbnkpID0+IHcgJiYgIXcuaXNEZXN0cm95ZWQoKSk7XG4gICAgICAgIGlmIChhbGwubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIGxpdmUgRWxlY3Ryb24gd2luZG93czsgY2Fubm90IGNhcHR1cmUgc2NyZWVuc2hvdC4nKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBpc1ByZXZpZXcgPSAodzogYW55KSA9PiAvcHJldmlldy9pLnRlc3Qody5nZXRUaXRsZT8uKCkgfHwgJycpO1xuICAgICAgICBjb25zdCBub25QcmV2aWV3ID0gYWxsLmZpbHRlcigodzogYW55KSA9PiAhaXNQcmV2aWV3KHcpKTtcbiAgICAgICAgY29uc3QgZm9jdXNlZCA9IEJXLmdldEZvY3VzZWRXaW5kb3c/LigpO1xuICAgICAgICBpZiAoZm9jdXNlZCAmJiAhZm9jdXNlZC5pc0Rlc3Ryb3llZCgpICYmICFpc1ByZXZpZXcoZm9jdXNlZCkpIHJldHVybiBmb2N1c2VkO1xuICAgICAgICBpZiAobm9uUHJldmlldy5sZW5ndGggPiAwKSByZXR1cm4gbm9uUHJldmlld1swXTtcbiAgICAgICAgcmV0dXJuIGFsbFswXTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGVuc3VyZUNhcHR1cmVEaXIoKTogeyBvazogdHJ1ZTsgZGlyOiBzdHJpbmcgfSB8IHsgb2s6IGZhbHNlOyBlcnJvcjogc3RyaW5nIH0ge1xuICAgICAgICBpZiAoIUVkaXRvci5Qcm9qZWN0IHx8ICFFZGl0b3IuUHJvamVjdC5wYXRoKSB7XG4gICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiAnRWRpdG9yLlByb2plY3QucGF0aCBpcyBub3QgYXZhaWxhYmxlOyBjYW5ub3QgcmVzb2x2ZSBjYXB0dXJlIG91dHB1dCBkaXJlY3RvcnkuJyB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGRpciA9IHBhdGguam9pbihFZGl0b3IuUHJvamVjdC5wYXRoLCAndGVtcCcsICdtY3AtY2FwdHVyZXMnKTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGZzLm1rZGlyU3luYyhkaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgICAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUsIGRpciB9O1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogYEZhaWxlZCB0byBjcmVhdGUgY2FwdHVyZSBkaXI6ICR7ZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpfWAgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIHYyLjguMCBULVYyOC0yIChjYXJyeW92ZXIgZnJvbSB2Mi43LjAgQ29kZXggc2luZ2xlLXJldmlld2VyIPCfn6EpXG4gICAgLy8g4oaSIHYyLjguMSByb3VuZC0xIGZpeCAoQ29kZXgg8J+UtCArIENsYXVkZSDwn5+hKTogdGhlIHYyLjguMCBoZWxwZXJcbiAgICAvLyByZWFscGF0aCdkIGBkaXJgIGFuZCBgcGF0aC5kaXJuYW1lKHBhdGguam9pbihkaXIsIGJhc2VuYW1lKSlgIGFuZFxuICAgIC8vIGNvbXBhcmVkIHRoZSB0d28g4oCUIGJ1dCB3aXRoIGEgZml4ZWQgYmFzZW5hbWUgdGhvc2UgZXhwcmVzc2lvbnMgYm90aFxuICAgIC8vIGNvbGxhcHNlIHRvIGBkaXJgLCBtYWtpbmcgdGhlIGVxdWFsaXR5IGNoZWNrIHRhdXRvbG9naWNhbC4gVGhlIGNoZWNrXG4gICAgLy8gcHJvdGVjdGVkIG5vdGhpbmcgaWYgYDxwcm9qZWN0Pi90ZW1wL21jcC1jYXB0dXJlc2AgaXRzZWxmIHdhcyBhXG4gICAgLy8gc3ltbGluayB0aGF0IGVzY2FwZXMgdGhlIHByb2plY3QgdHJlZS5cbiAgICAvL1xuICAgIC8vIFRydWUgZXNjYXBlIHByb3RlY3Rpb24gcmVxdWlyZXMgYW5jaG9yaW5nIGFnYWluc3QgdGhlIHByb2plY3Qgcm9vdC5cbiAgICAvLyBXZSBub3cgcmVhbHBhdGggQk9USCB0aGUgY2FwdHVyZSBkaXIgYW5kIGBFZGl0b3IuUHJvamVjdC5wYXRoYCBhbmRcbiAgICAvLyByZXF1aXJlIHRoZSByZXNvbHZlZCBjYXB0dXJlIGRpciB0byBiZSBpbnNpZGUgdGhlIHJlc29sdmVkIHByb2plY3RcbiAgICAvLyByb290IChlcXVhbGl0eSBPUiBgcmVhbERpci5zdGFydHNXaXRoKHJlYWxQcm9qZWN0Um9vdCArIHNlcClgKS5cbiAgICAvLyBUaGUgaW50cmEtZGlyIGNoZWNrIGlzIGtlcHQgZm9yIGNoZWFwIGRlZmVuc2UtaW4tZGVwdGggaW4gY2FzZSBhXG4gICAgLy8gZnV0dXJlIGJhc2VuYW1lIGdldHMgdHJhdmVyc2FsIGNoYXJhY3RlcnMgdGhyZWFkZWQgdGhyb3VnaC5cbiAgICAvL1xuICAgIC8vIFJldHVybnMgeyBvazogdHJ1ZSwgZmlsZVBhdGgsIGRpciB9IHdoZW4gc2FmZSB0byB3cml0ZSwgb3JcbiAgICAvLyB7IG9rOiBmYWxzZSwgZXJyb3IgfSB3aXRoIHRoZSBzYW1lIGVycm9yIGVudmVsb3BlIHNoYXBlIGFzXG4gICAgLy8gZW5zdXJlQ2FwdHVyZURpciBzbyBjYWxsZXJzIGNhbiBmYWxsIHRocm91Z2ggdGhlaXIgZXhpc3RpbmdcbiAgICAvLyBlcnJvci1yZXR1cm4gcGF0dGVybi5cbiAgICBwcml2YXRlIHJlc29sdmVBdXRvQ2FwdHVyZUZpbGUoYmFzZW5hbWU6IHN0cmluZyk6IHsgb2s6IHRydWU7IGZpbGVQYXRoOiBzdHJpbmc7IGRpcjogc3RyaW5nIH0gfCB7IG9rOiBmYWxzZTsgZXJyb3I6IHN0cmluZyB9IHtcbiAgICAgICAgY29uc3QgZGlyUmVzdWx0ID0gdGhpcy5lbnN1cmVDYXB0dXJlRGlyKCk7XG4gICAgICAgIGlmICghZGlyUmVzdWx0Lm9rKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBkaXJSZXN1bHQuZXJyb3IgfTtcbiAgICAgICAgY29uc3QgcHJvamVjdFBhdGg6IHN0cmluZyB8IHVuZGVmaW5lZCA9IEVkaXRvcj8uUHJvamVjdD8ucGF0aDtcbiAgICAgICAgaWYgKCFwcm9qZWN0UGF0aCkge1xuICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogJ0VkaXRvci5Qcm9qZWN0LnBhdGggaXMgbm90IGF2YWlsYWJsZTsgY2Fubm90IGFuY2hvciBjYXB0dXJlLWRpciBjb250YWlubWVudCBjaGVjay4nIH07XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZmlsZVBhdGggPSBwYXRoLmpvaW4oZGlyUmVzdWx0LmRpciwgYmFzZW5hbWUpO1xuICAgICAgICBsZXQgcmVhbERpcjogc3RyaW5nO1xuICAgICAgICBsZXQgcmVhbFBhcmVudDogc3RyaW5nO1xuICAgICAgICBsZXQgcmVhbFByb2plY3RSb290OiBzdHJpbmc7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBycDogYW55ID0gZnMucmVhbHBhdGhTeW5jIGFzIGFueTtcbiAgICAgICAgICAgIGNvbnN0IHJlc29sdmVSZWFsID0gcnAubmF0aXZlID8/IHJwO1xuICAgICAgICAgICAgcmVhbERpciA9IHJlc29sdmVSZWFsKGRpclJlc3VsdC5kaXIpO1xuICAgICAgICAgICAgcmVhbFBhcmVudCA9IHJlc29sdmVSZWFsKHBhdGguZGlybmFtZShmaWxlUGF0aCkpO1xuICAgICAgICAgICAgcmVhbFByb2plY3RSb290ID0gcmVzb2x2ZVJlYWwocHJvamVjdFBhdGgpO1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogYHNjcmVlbnNob3QgcGF0aCByZWFscGF0aCBmYWlsZWQ6ICR7ZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpfWAgfTtcbiAgICAgICAgfVxuICAgICAgICAvLyBEZWZlbnNlLWluLWRlcHRoOiBwYXJlbnQgb2YgdGhlIHJlc29sdmVkIGZpbGUgbXVzdCBlcXVhbCB0aGVcbiAgICAgICAgLy8gcmVzb2x2ZWQgY2FwdHVyZSBkaXIgKGNhdGNoZXMgZnV0dXJlIGJhc2VuYW1lcyB0aHJlYWRpbmcgYC4uYCkuXG4gICAgICAgIGlmIChwYXRoLnJlc29sdmUocmVhbFBhcmVudCkgIT09IHBhdGgucmVzb2x2ZShyZWFsRGlyKSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogJ3NjcmVlbnNob3Qgc2F2ZSBwYXRoIHJlc29sdmVkIG91dHNpZGUgdGhlIGNhcHR1cmUgZGlyZWN0b3J5JyB9O1xuICAgICAgICB9XG4gICAgICAgIC8vIFByaW1hcnkgcHJvdGVjdGlvbjogY2FwdHVyZSBkaXIgaXRzZWxmIG11c3QgcmVzb2x2ZSBpbnNpZGUgdGhlXG4gICAgICAgIC8vIHByb2plY3Qgcm9vdCwgc28gYSBzeW1saW5rIGNoYWluIG9uIGB0ZW1wL21jcC1jYXB0dXJlc2AgY2Fubm90XG4gICAgICAgIC8vIHBpdm90IHdyaXRlcyB0byBlLmcuIC9ldGMgb3IgQzpcXFdpbmRvd3MuXG4gICAgICAgIGNvbnN0IHJlYWxEaXJOb3JtYWxpemVkID0gcGF0aC5yZXNvbHZlKHJlYWxEaXIpO1xuICAgICAgICBjb25zdCByZWFsUm9vdE5vcm1hbGl6ZWQgPSBwYXRoLnJlc29sdmUocmVhbFByb2plY3RSb290KTtcbiAgICAgICAgY29uc3Qgd2l0aGluUm9vdCA9IHJlYWxEaXJOb3JtYWxpemVkID09PSByZWFsUm9vdE5vcm1hbGl6ZWRcbiAgICAgICAgICAgIHx8IHJlYWxEaXJOb3JtYWxpemVkLnN0YXJ0c1dpdGgocmVhbFJvb3ROb3JtYWxpemVkICsgcGF0aC5zZXApO1xuICAgICAgICBpZiAoIXdpdGhpblJvb3QpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGBjYXB0dXJlIGRpciByZXNvbHZlZCBvdXRzaWRlIHRoZSBwcm9qZWN0IHJvb3Q6ICR7cmVhbERpck5vcm1hbGl6ZWR9IG5vdCB3aXRoaW4gJHtyZWFsUm9vdE5vcm1hbGl6ZWR9YCB9O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7IG9rOiB0cnVlLCBmaWxlUGF0aCwgZGlyOiBkaXJSZXN1bHQuZGlyIH07XG4gICAgfVxuXG4gICAgLy8gdjIuOC4xIHJvdW5kLTEgZml4IChHZW1pbmkg8J+UtCArIENvZGV4IPCfn6EpOiB3aGVuIGNhbGxlciBwYXNzZXMgYW5cbiAgICAvLyBleHBsaWNpdCBzYXZlUGF0aCAvIHNhdmVQYXRoUHJlZml4LCB3ZSBzdGlsbCBuZWVkIHRoZSBzYW1lIHByb2plY3QtXG4gICAgLy8gcm9vdCBjb250YWlubWVudCBndWFyYW50ZWUgdGhhdCByZXNvbHZlQXV0b0NhcHR1cmVGaWxlIGdpdmVzIHRoZVxuICAgIC8vIGF1dG8tbmFtZWQgYnJhbmNoLiBBSS1nZW5lcmF0ZWQgYWJzb2x1dGUgcGF0aHMgY291bGQgb3RoZXJ3aXNlXG4gICAgLy8gd3JpdGUgb3V0c2lkZSB0aGUgcHJvamVjdCByb290LlxuICAgIC8vXG4gICAgLy8gVGhlIGNoZWNrIHJlc29sdmVzIHRoZSBwYXJlbnQgZGlyZWN0b3J5ICh0aGUgZmlsZSBpdHNlbGYgbWF5IG5vdFxuICAgIC8vIGV4aXN0IHlldCkgYW5kIHJlcXVpcmVzIGl0IHRvIGJlIGluc2lkZSBgcmVhbHBhdGgoRWRpdG9yLlByb2plY3QucGF0aClgLlxuICAgIHByaXZhdGUgYXNzZXJ0U2F2ZVBhdGhXaXRoaW5Qcm9qZWN0KHNhdmVQYXRoOiBzdHJpbmcpOiB7IG9rOiB0cnVlOyByZXNvbHZlZFBhdGg6IHN0cmluZyB9IHwgeyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmcgfSB7XG4gICAgICAgIGNvbnN0IHByb2plY3RQYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQgPSBFZGl0b3I/LlByb2plY3Q/LnBhdGg7XG4gICAgICAgIGlmICghcHJvamVjdFBhdGgpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6ICdFZGl0b3IuUHJvamVjdC5wYXRoIGlzIG5vdCBhdmFpbGFibGU7IGNhbm5vdCB2YWxpZGF0ZSBleHBsaWNpdCBzYXZlUGF0aC4nIH07XG4gICAgICAgIH1cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJwOiBhbnkgPSBmcy5yZWFscGF0aFN5bmMgYXMgYW55O1xuICAgICAgICAgICAgY29uc3QgcmVzb2x2ZVJlYWwgPSBycC5uYXRpdmUgPz8gcnA7XG4gICAgICAgICAgICBjb25zdCByZWFsUHJvamVjdFJvb3QgPSByZXNvbHZlUmVhbChwcm9qZWN0UGF0aCk7XG4gICAgICAgICAgICAvLyB2Mi44LjIgcmV0ZXN0IGZpeCAoQ29kZXggcjIg8J+foSAjMSk6IGEgcmVsYXRpdmUgc2F2ZVBhdGggd291bGRcbiAgICAgICAgICAgIC8vIG1ha2UgYHBhdGguZGlybmFtZShzYXZlUGF0aClgIGNvbGxhcHNlIHRvICcuJyBhbmQgcmVzb2x2ZSB0b1xuICAgICAgICAgICAgLy8gdGhlIGhvc3QgcHJvY2VzcyBjd2QgKG9mdGVuIGA8ZWRpdG9yLWluc3RhbGw+L0NvY29zRGFzaGJvYXJkYClcbiAgICAgICAgICAgIC8vIHJhdGhlciB0aGFuIHRoZSBwcm9qZWN0IHJvb3QuIEFuY2hvciByZWxhdGl2ZSBwYXRocyBhZ2FpbnN0XG4gICAgICAgICAgICAvLyB0aGUgcHJvamVjdCByb290IGV4cGxpY2l0bHkgc28gdGhlIEFJJ3MgaW50dWl0aXZlIFwicmVsYXRpdmVcbiAgICAgICAgICAgIC8vIHRvIG15IHByb2plY3RcIiBpbnRlcnByZXRhdGlvbiBpcyB3aGF0IHRoZSBjaGVjayBlbmZvcmNlcy5cbiAgICAgICAgICAgIGNvbnN0IGFic29sdXRlU2F2ZVBhdGggPSBwYXRoLmlzQWJzb2x1dGUoc2F2ZVBhdGgpXG4gICAgICAgICAgICAgICAgPyBzYXZlUGF0aFxuICAgICAgICAgICAgICAgIDogcGF0aC5yZXNvbHZlKHByb2plY3RQYXRoLCBzYXZlUGF0aCk7XG4gICAgICAgICAgICBjb25zdCBwYXJlbnQgPSBwYXRoLmRpcm5hbWUoYWJzb2x1dGVTYXZlUGF0aCk7XG4gICAgICAgICAgICAvLyBQYXJlbnQgbXVzdCBhbHJlYWR5IGV4aXN0IGZvciByZWFscGF0aDsgaWYgaXQgZG9lc24ndCwgdGhlXG4gICAgICAgICAgICAvLyB3cml0ZSB3b3VsZCBmYWlsIGFueXdheSwgYnV0IHJldHVybiBhIGNsZWFyZXIgZXJyb3IgaGVyZS5cbiAgICAgICAgICAgIGxldCByZWFsUGFyZW50OiBzdHJpbmc7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHJlYWxQYXJlbnQgPSByZXNvbHZlUmVhbChwYXJlbnQpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBgc2F2ZVBhdGggcGFyZW50IGRpciBtaXNzaW5nIG9yIHVucmVhZGFibGU6ICR7ZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpfWAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHJlYWxQYXJlbnROb3JtYWxpemVkID0gcGF0aC5yZXNvbHZlKHJlYWxQYXJlbnQpO1xuICAgICAgICAgICAgY29uc3QgcmVhbFJvb3ROb3JtYWxpemVkID0gcGF0aC5yZXNvbHZlKHJlYWxQcm9qZWN0Um9vdCk7XG4gICAgICAgICAgICBjb25zdCB3aXRoaW4gPSByZWFsUGFyZW50Tm9ybWFsaXplZCA9PT0gcmVhbFJvb3ROb3JtYWxpemVkXG4gICAgICAgICAgICAgICAgfHwgcmVhbFBhcmVudE5vcm1hbGl6ZWQuc3RhcnRzV2l0aChyZWFsUm9vdE5vcm1hbGl6ZWQgKyBwYXRoLnNlcCk7XG4gICAgICAgICAgICBpZiAoIXdpdGhpbikge1xuICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgIG9rOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGBzYXZlUGF0aCByZXNvbHZlZCBvdXRzaWRlIHRoZSBwcm9qZWN0IHJvb3Q6ICR7cmVhbFBhcmVudE5vcm1hbGl6ZWR9IG5vdCB3aXRoaW4gJHtyZWFsUm9vdE5vcm1hbGl6ZWR9LiBVc2UgYSBwYXRoIGluc2lkZSA8cHJvamVjdD4vIG9yIG9taXQgc2F2ZVBhdGggdG8gYXV0by1uYW1lIGludG8gPHByb2plY3Q+L3RlbXAvbWNwLWNhcHR1cmVzLmAsXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB7IG9rOiB0cnVlLCByZXNvbHZlZFBhdGg6IGFic29sdXRlU2F2ZVBhdGggfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGBzYXZlUGF0aCByZWFscGF0aCBmYWlsZWQ6ICR7ZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpfWAgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgc2NyZWVuc2hvdChzYXZlUGF0aD86IHN0cmluZywgd2luZG93VGl0bGU/OiBzdHJpbmcsIGluY2x1ZGVCYXNlNjQ6IGJvb2xlYW4gPSBmYWxzZSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBsZXQgZmlsZVBhdGggPSBzYXZlUGF0aDtcbiAgICAgICAgICAgIGlmICghZmlsZVBhdGgpIHtcbiAgICAgICAgICAgICAgICBjb25zdCByZXNvbHZlZCA9IHRoaXMucmVzb2x2ZUF1dG9DYXB0dXJlRmlsZShgc2NyZWVuc2hvdC0ke0RhdGUubm93KCl9LnBuZ2ApO1xuICAgICAgICAgICAgICAgIGlmICghcmVzb2x2ZWQub2spIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogcmVzb2x2ZWQuZXJyb3IgfTtcbiAgICAgICAgICAgICAgICBmaWxlUGF0aCA9IHJlc29sdmVkLmZpbGVQYXRoO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyB2Mi44LjEgcm91bmQtMSBmaXggKEdlbWluaSDwn5S0ICsgQ29kZXgg8J+foSk6IGV4cGxpY2l0IHNhdmVQYXRoXG4gICAgICAgICAgICAgICAgLy8gYWxzbyBnZXRzIGNvbnRhaW5tZW50LWNoZWNrZWQuIEFJLWdlbmVyYXRlZCBwYXRocyBjb3VsZFxuICAgICAgICAgICAgICAgIC8vIG90aGVyd2lzZSB3cml0ZSBvdXRzaWRlIHRoZSBwcm9qZWN0IHJvb3QuXG4gICAgICAgICAgICAgICAgLy8gdjIuOC4yIHJldGVzdCBmaXg6IHVzZSB0aGUgaGVscGVyJ3MgcmVzb2x2ZWRQYXRoIHNvIGFcbiAgICAgICAgICAgICAgICAvLyByZWxhdGl2ZSBzYXZlUGF0aCBhY3R1YWxseSBsYW5kcyBpbnNpZGUgdGhlIHByb2plY3Qgcm9vdC5cbiAgICAgICAgICAgICAgICBjb25zdCBndWFyZCA9IHRoaXMuYXNzZXJ0U2F2ZVBhdGhXaXRoaW5Qcm9qZWN0KGZpbGVQYXRoKTtcbiAgICAgICAgICAgICAgICBpZiAoIWd1YXJkLm9rKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGd1YXJkLmVycm9yIH07XG4gICAgICAgICAgICAgICAgZmlsZVBhdGggPSBndWFyZC5yZXNvbHZlZFBhdGg7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCB3aW4gPSB0aGlzLnBpY2tXaW5kb3cod2luZG93VGl0bGUpO1xuICAgICAgICAgICAgY29uc3QgaW1hZ2UgPSBhd2FpdCB3aW4ud2ViQ29udGVudHMuY2FwdHVyZVBhZ2UoKTtcbiAgICAgICAgICAgIGNvbnN0IHBuZzogQnVmZmVyID0gaW1hZ2UudG9QTkcoKTtcbiAgICAgICAgICAgIGZzLndyaXRlRmlsZVN5bmMoZmlsZVBhdGgsIHBuZyk7XG4gICAgICAgICAgICBjb25zdCBkYXRhOiBhbnkgPSB7XG4gICAgICAgICAgICAgICAgZmlsZVBhdGgsXG4gICAgICAgICAgICAgICAgc2l6ZTogcG5nLmxlbmd0aCxcbiAgICAgICAgICAgICAgICB3aW5kb3dUaXRsZTogdHlwZW9mIHdpbi5nZXRUaXRsZSA9PT0gJ2Z1bmN0aW9uJyA/IHdpbi5nZXRUaXRsZSgpIDogJycsXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgaWYgKGluY2x1ZGVCYXNlNjQpIHtcbiAgICAgICAgICAgICAgICBkYXRhLmRhdGFVcmkgPSBgZGF0YTppbWFnZS9wbmc7YmFzZTY0LCR7cG5nLnRvU3RyaW5nKCdiYXNlNjQnKX1gO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZGF0YSwgbWVzc2FnZTogYFNjcmVlbnNob3Qgc2F2ZWQgdG8gJHtmaWxlUGF0aH1gIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKSB9O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gdjIuNy4wICM0OiBQcmV2aWV3LXdpbmRvdyBzY3JlZW5zaG90LlxuICAgIC8vIHYyLjguMyBULVYyODMtMTogZXh0ZW5kZWQgdG8gaGFuZGxlIGNvY29zIGVtYmVkZGVkIHByZXZpZXcgbW9kZS5cbiAgICAvL1xuICAgIC8vIE1vZGUgZGlzcGF0Y2g6XG4gICAgLy8gICAtIFwid2luZG93XCI6ICAgcmVxdWlyZSBhIFByZXZpZXctdGl0bGVkIEJyb3dzZXJXaW5kb3c7IGZhaWwgaWYgbm9uZS5cbiAgICAvLyAgICAgICAgICAgICAgICAgT3JpZ2luYWwgdjIuNy4wIGJlaGF2aW91ci4gVXNlIHdoZW4gY29jb3MgcHJldmlld1xuICAgIC8vICAgICAgICAgICAgICAgICBjb25maWcgaXMgXCJ3aW5kb3dcIiAvIFwic2ltdWxhdG9yXCIgKHNlcGFyYXRlIHdpbmRvdykuXG4gICAgLy8gICAtIFwiZW1iZWRkZWRcIjogc2tpcCB0aGUgd2luZG93IHByb2JlIGFuZCBjYXB0dXJlIHRoZSBtYWluIGVkaXRvclxuICAgIC8vICAgICAgICAgICAgICAgICBCcm93c2VyV2luZG93IGRpcmVjdGx5LiBVc2Ugd2hlbiBjb2NvcyBwcmV2aWV3IGNvbmZpZ1xuICAgIC8vICAgICAgICAgICAgICAgICBpcyBcImVtYmVkZGVkXCIgKGdhbWV2aWV3IHJlbmRlcnMgaW5zaWRlIG1haW4gZWRpdG9yKS5cbiAgICAvLyAgIC0gXCJhdXRvXCI6ICAgICB0cnkgXCJ3aW5kb3dcIiBmaXJzdDsgaWYgbm8gUHJldmlldy10aXRsZWQgd2luZG93IGlzXG4gICAgLy8gICAgICAgICAgICAgICAgIGZvdW5kLCBmYWxsIGJhY2sgdG8gXCJlbWJlZGRlZFwiIGFuZCBzdXJmYWNlIGEgaGludFxuICAgIC8vICAgICAgICAgICAgICAgICBpbiB0aGUgcmVzcG9uc2UgbWVzc2FnZS4gRGVmYXVsdCDigJQga2VlcHMgdGhlIGhhcHB5XG4gICAgLy8gICAgICAgICAgICAgICAgIHBhdGggd29ya2luZyB3aXRob3V0IGNhbGxlciBrbm93bGVkZ2Ugb2YgY29jb3NcbiAgICAvLyAgICAgICAgICAgICAgICAgcHJldmlldyBjb25maWcuXG4gICAgLy9cbiAgICAvLyBCcm93c2VyLW1vZGUgKFBJRSByZW5kZXJlZCB0byB1c2VyJ3MgZXh0ZXJuYWwgYnJvd3NlciB2aWFcbiAgICAvLyBzaGVsbC5vcGVuRXh0ZXJuYWwpIGlzIE5PVCBjYXB0dXJhYmxlIGhlcmUg4oCUIHRoZSBwYWdlIGxpdmVzIGluXG4gICAgLy8gYSBub24tRWxlY3Ryb24gYnJvd3NlciBwcm9jZXNzLiBBSSBjYW4gZGV0ZWN0IHRoaXMgdmlhXG4gICAgLy8gZGVidWdfZ2V0X3ByZXZpZXdfbW9kZSBhbmQgc2tpcCB0aGUgY2FsbC5cbiAgICBwcml2YXRlIGFzeW5jIGNhcHR1cmVQcmV2aWV3U2NyZWVuc2hvdChcbiAgICAgICAgc2F2ZVBhdGg/OiBzdHJpbmcsXG4gICAgICAgIG1vZGU6ICdhdXRvJyB8ICd3aW5kb3cnIHwgJ2VtYmVkZGVkJyA9ICdhdXRvJyxcbiAgICAgICAgd2luZG93VGl0bGU6IHN0cmluZyA9ICdQcmV2aWV3JyxcbiAgICAgICAgaW5jbHVkZUJhc2U2NDogYm9vbGVhbiA9IGZhbHNlLFxuICAgICk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLXZhci1yZXF1aXJlc1xuICAgICAgICAgICAgY29uc3QgZWxlY3Ryb24gPSByZXF1aXJlKCdlbGVjdHJvbicpO1xuICAgICAgICAgICAgY29uc3QgQlcgPSBlbGVjdHJvbi5Ccm93c2VyV2luZG93O1xuXG4gICAgICAgICAgICAvLyBSZXNvbHZlIHRoZSB0YXJnZXQgd2luZG93IHBlciBtb2RlLlxuICAgICAgICAgICAgY29uc3QgcHJvYmVXaW5kb3dNb2RlID0gKCk6IHsgb2s6IHRydWU7IHdpbjogYW55IH0gfCB7IG9rOiBmYWxzZTsgZXJyb3I6IHN0cmluZzsgdmlzaWJsZVRpdGxlczogc3RyaW5nW10gfSA9PiB7XG4gICAgICAgICAgICAgICAgLy8gdjIuNy4xIHJldmlldyBmaXggKGNsYXVkZSDwn5+hICsgY29kZXgg8J+foSk6IHdpdGggdGhlIGRlZmF1bHRcbiAgICAgICAgICAgICAgICAvLyB3aW5kb3dUaXRsZT0nUHJldmlldycgYSBDaGluZXNlIC8gbG9jYWxpemVkIGNvY29zIGVkaXRvclxuICAgICAgICAgICAgICAgIC8vIHdob3NlIG1haW4gd2luZG93IHRpdGxlIGNvbnRhaW5zIFwiUHJldmlld1wiIChlLmcuIFwiQ29jb3NcbiAgICAgICAgICAgICAgICAvLyBDcmVhdG9yIFByZXZpZXcgLSA8UHJvamVjdE5hbWU+XCIpIHdvdWxkIGZhbHNlbHkgbWF0Y2guXG4gICAgICAgICAgICAgICAgLy8gRGlzYW1iaWd1YXRlIGJ5IGV4Y2x1ZGluZyBhbnkgdGl0bGUgdGhhdCBBTFNPIGNvbnRhaW5zXG4gICAgICAgICAgICAgICAgLy8gXCJDb2NvcyBDcmVhdG9yXCIgd2hlbiB0aGUgY2FsbGVyIHN0dWNrIHdpdGggdGhlIGRlZmF1bHQuXG4gICAgICAgICAgICAgICAgY29uc3QgdXNpbmdEZWZhdWx0ID0gd2luZG93VGl0bGUgPT09ICdQcmV2aWV3JztcbiAgICAgICAgICAgICAgICBjb25zdCBhbGxUaXRsZXM6IHN0cmluZ1tdID0gQlc/LmdldEFsbFdpbmRvd3M/LigpPy5tYXAoKHc6IGFueSkgPT4gdy5nZXRUaXRsZT8uKCkgPz8gJycpLmZpbHRlcihCb29sZWFuKSA/PyBbXTtcbiAgICAgICAgICAgICAgICBjb25zdCBtYXRjaGVzID0gQlc/LmdldEFsbFdpbmRvd3M/LigpPy5maWx0ZXIoKHc6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXcgfHwgdy5pc0Rlc3Ryb3llZCgpKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRpdGxlID0gdy5nZXRUaXRsZT8uKCkgfHwgJyc7XG4gICAgICAgICAgICAgICAgICAgIGlmICghdGl0bGUuaW5jbHVkZXMod2luZG93VGl0bGUpKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIGlmICh1c2luZ0RlZmF1bHQgJiYgL0NvY29zXFxzKkNyZWF0b3IvaS50ZXN0KHRpdGxlKSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9KSA/PyBbXTtcbiAgICAgICAgICAgICAgICBpZiAobWF0Y2hlcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogYE5vIEVsZWN0cm9uIHdpbmRvdyB0aXRsZSBjb250YWlucyBcIiR7d2luZG93VGl0bGV9XCIke3VzaW5nRGVmYXVsdCA/ICcgKGFuZCBpcyBub3QgdGhlIG1haW4gZWRpdG9yKScgOiAnJ30uYCwgdmlzaWJsZVRpdGxlczogYWxsVGl0bGVzIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiB7IG9rOiB0cnVlLCB3aW46IG1hdGNoZXNbMF0gfTtcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGNvbnN0IHByb2JlRW1iZWRkZWRNb2RlID0gKCk6IHsgb2s6IHRydWU7IHdpbjogYW55IH0gfCB7IG9rOiBmYWxzZTsgZXJyb3I6IHN0cmluZyB9ID0+IHtcbiAgICAgICAgICAgICAgICAvLyBFbWJlZGRlZCBQSUUgcmVuZGVycyBpbnNpZGUgdGhlIG1haW4gZWRpdG9yIEJyb3dzZXJXaW5kb3cuXG4gICAgICAgICAgICAgICAgLy8gUGljayB0aGUgc2FtZSBoZXVyaXN0aWMgYXMgcGlja1dpbmRvdygpOiBwcmVmZXIgYSBub24tXG4gICAgICAgICAgICAgICAgLy8gUHJldmlldyB3aW5kb3cuIENvY29zIG1haW4gZWRpdG9yJ3MgdGl0bGUgdHlwaWNhbGx5XG4gICAgICAgICAgICAgICAgLy8gY29udGFpbnMgXCJDb2NvcyBDcmVhdG9yXCIg4oCUIG1hdGNoIHRoYXQgdG8gaWRlbnRpZnkgaXQuXG4gICAgICAgICAgICAgICAgY29uc3QgYWxsOiBhbnlbXSA9IEJXPy5nZXRBbGxXaW5kb3dzPy4oKT8uZmlsdGVyKCh3OiBhbnkpID0+IHcgJiYgIXcuaXNEZXN0cm95ZWQoKSkgPz8gW107XG4gICAgICAgICAgICAgICAgaWYgKGFsbC5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogJ05vIGxpdmUgRWxlY3Ryb24gd2luZG93cyBhdmFpbGFibGU7IGNhbm5vdCBjYXB0dXJlIGVtYmVkZGVkIHByZXZpZXcuJyB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAvLyBQcmVmZXIgdGhlIGVkaXRvciBtYWluIHdpbmRvdyAodGl0bGUgY29udGFpbnMgXCJDb2Nvc1xuICAgICAgICAgICAgICAgIC8vIENyZWF0b3JcIikg4oCUIHRoYXQncyB3aGVyZSBlbWJlZGRlZCBQSUUgcmVuZGVycy5cbiAgICAgICAgICAgICAgICBjb25zdCBlZGl0b3IgPSBhbGwuZmluZCgodzogYW55KSA9PiAvQ29jb3NcXHMqQ3JlYXRvci9pLnRlc3Qody5nZXRUaXRsZT8uKCkgfHwgJycpKTtcbiAgICAgICAgICAgICAgICBpZiAoZWRpdG9yKSByZXR1cm4geyBvazogdHJ1ZSwgd2luOiBlZGl0b3IgfTtcbiAgICAgICAgICAgICAgICAvLyBGYWxsYmFjazogYW55IG5vbi1EZXZUb29scyAvIG5vbi1Xb3JrZXIgLyBub24tQmxhbmsgd2luZG93LlxuICAgICAgICAgICAgICAgIGNvbnN0IGNhbmRpZGF0ZSA9IGFsbC5maW5kKCh3OiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdCA9IHcuZ2V0VGl0bGU/LigpIHx8ICcnO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdCAmJiAhL0RldlRvb2xzfFdvcmtlciAtfF5CbGFuayQvLnRlc3QodCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgaWYgKGNhbmRpZGF0ZSkgcmV0dXJuIHsgb2s6IHRydWUsIHdpbjogY2FuZGlkYXRlIH07XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogJ05vIHN1aXRhYmxlIGVkaXRvciB3aW5kb3cgZm91bmQgZm9yIGVtYmVkZGVkIHByZXZpZXcgY2FwdHVyZS4nIH07XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBsZXQgd2luOiBhbnkgPSBudWxsO1xuICAgICAgICAgICAgbGV0IGNhcHR1cmVOb3RlOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgICAgICAgICAgIGxldCByZXNvbHZlZE1vZGU6ICd3aW5kb3cnIHwgJ2VtYmVkZGVkJyA9ICd3aW5kb3cnO1xuXG4gICAgICAgICAgICBpZiAobW9kZSA9PT0gJ3dpbmRvdycpIHtcbiAgICAgICAgICAgICAgICBjb25zdCByID0gcHJvYmVXaW5kb3dNb2RlKCk7XG4gICAgICAgICAgICAgICAgaWYgKCFyLm9rKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yOiBgJHtyLmVycm9yfSBMYXVuY2ggY29jb3MgcHJldmlldyBmaXJzdCB2aWEgdGhlIHRvb2xiYXIgcGxheSBidXR0b24gb3IgdmlhIGRlYnVnX3ByZXZpZXdfdXJsKGFjdGlvbj1cIm9wZW5cIikuIElmIHlvdXIgY29jb3MgcHJldmlldyBpcyBzZXQgdG8gXCJlbWJlZGRlZFwiLCBjYWxsIHRoaXMgdG9vbCB3aXRoIG1vZGU9XCJlbWJlZGRlZFwiIG9yIG1vZGU9XCJhdXRvXCIuIFZpc2libGUgd2luZG93IHRpdGxlczogJHtyLnZpc2libGVUaXRsZXMuam9pbignLCAnKSB8fCAnKG5vbmUpJ31gLFxuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB3aW4gPSByLndpbjtcbiAgICAgICAgICAgICAgICByZXNvbHZlZE1vZGUgPSAnd2luZG93JztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAobW9kZSA9PT0gJ2VtYmVkZGVkJykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHIgPSBwcm9iZUVtYmVkZGVkTW9kZSgpO1xuICAgICAgICAgICAgICAgIGlmICghci5vaykgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiByLmVycm9yIH07XG4gICAgICAgICAgICAgICAgd2luID0gci53aW47XG4gICAgICAgICAgICAgICAgcmVzb2x2ZWRNb2RlID0gJ2VtYmVkZGVkJztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gYXV0b1xuICAgICAgICAgICAgICAgIGNvbnN0IHdyID0gcHJvYmVXaW5kb3dNb2RlKCk7XG4gICAgICAgICAgICAgICAgaWYgKHdyLm9rKSB7XG4gICAgICAgICAgICAgICAgICAgIHdpbiA9IHdyLndpbjtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZWRNb2RlID0gJ3dpbmRvdyc7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZXIgPSBwcm9iZUVtYmVkZGVkTW9kZSgpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIWVyLm9rKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yOiBgJHt3ci5lcnJvcn0gJHtlci5lcnJvcn0gTGF1bmNoIGNvY29zIHByZXZpZXcgZmlyc3Qgb3IgY2hlY2sgZGVidWdfZ2V0X3ByZXZpZXdfbW9kZSB0byBzZWUgaG93IGNvY29zIGlzIGNvbmZpZ3VyZWQuIFZpc2libGUgd2luZG93IHRpdGxlczogJHt3ci52aXNpYmxlVGl0bGVzLmpvaW4oJywgJykgfHwgJyhub25lKSd9YCxcbiAgICAgICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgd2luID0gZXIud2luO1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlZE1vZGUgPSAnZW1iZWRkZWQnO1xuICAgICAgICAgICAgICAgICAgICBjYXB0dXJlTm90ZSA9ICdObyBQcmV2aWV3LXRpdGxlZCB3aW5kb3cgZm91bmQ7IGZlbGwgYmFjayB0byBjYXB0dXJpbmcgdGhlIG1haW4gZWRpdG9yIHdpbmRvdyAoZW1iZWRkZWQgcHJldmlldyBtb2RlKS4gVXNlIGRlYnVnX2dldF9wcmV2aWV3X21vZGUgdG8gY29uZmlybSBjb2NvcyBwcmV2aWV3IGNvbmZpZy4nO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgbGV0IGZpbGVQYXRoID0gc2F2ZVBhdGg7XG4gICAgICAgICAgICBpZiAoIWZpbGVQYXRoKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVzb2x2ZWQgPSB0aGlzLnJlc29sdmVBdXRvQ2FwdHVyZUZpbGUoYHByZXZpZXctJHtEYXRlLm5vdygpfS5wbmdgKTtcbiAgICAgICAgICAgICAgICBpZiAoIXJlc29sdmVkLm9rKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHJlc29sdmVkLmVycm9yIH07XG4gICAgICAgICAgICAgICAgZmlsZVBhdGggPSByZXNvbHZlZC5maWxlUGF0aDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gdjIuOC4xIHJvdW5kLTEgZml4IChHZW1pbmkg8J+UtCArIENvZGV4IPCfn6EpOiBleHBsaWNpdCBzYXZlUGF0aFxuICAgICAgICAgICAgICAgIC8vIGFsc28gZ2V0cyBjb250YWlubWVudC1jaGVja2VkLlxuICAgICAgICAgICAgICAgIC8vIHYyLjguMiByZXRlc3QgZml4OiB1c2UgcmVzb2x2ZWRQYXRoIGZvciByZWxhdGl2ZS1wYXRoIHN1cHBvcnQuXG4gICAgICAgICAgICAgICAgY29uc3QgZ3VhcmQgPSB0aGlzLmFzc2VydFNhdmVQYXRoV2l0aGluUHJvamVjdChmaWxlUGF0aCk7XG4gICAgICAgICAgICAgICAgaWYgKCFndWFyZC5vaykgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBndWFyZC5lcnJvciB9O1xuICAgICAgICAgICAgICAgIGZpbGVQYXRoID0gZ3VhcmQucmVzb2x2ZWRQYXRoO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgaW1hZ2UgPSBhd2FpdCB3aW4ud2ViQ29udGVudHMuY2FwdHVyZVBhZ2UoKTtcbiAgICAgICAgICAgIGNvbnN0IHBuZzogQnVmZmVyID0gaW1hZ2UudG9QTkcoKTtcbiAgICAgICAgICAgIGZzLndyaXRlRmlsZVN5bmMoZmlsZVBhdGgsIHBuZyk7XG4gICAgICAgICAgICBjb25zdCBkYXRhOiBhbnkgPSB7XG4gICAgICAgICAgICAgICAgZmlsZVBhdGgsXG4gICAgICAgICAgICAgICAgc2l6ZTogcG5nLmxlbmd0aCxcbiAgICAgICAgICAgICAgICB3aW5kb3dUaXRsZTogdHlwZW9mIHdpbi5nZXRUaXRsZSA9PT0gJ2Z1bmN0aW9uJyA/IHdpbi5nZXRUaXRsZSgpIDogJycsXG4gICAgICAgICAgICAgICAgbW9kZTogcmVzb2x2ZWRNb2RlLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGlmIChjYXB0dXJlTm90ZSkgZGF0YS5ub3RlID0gY2FwdHVyZU5vdGU7XG4gICAgICAgICAgICBpZiAoaW5jbHVkZUJhc2U2NCkge1xuICAgICAgICAgICAgICAgIGRhdGEuZGF0YVVyaSA9IGBkYXRhOmltYWdlL3BuZztiYXNlNjQsJHtwbmcudG9TdHJpbmcoJ2Jhc2U2NCcpfWA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBtZXNzYWdlID0gY2FwdHVyZU5vdGVcbiAgICAgICAgICAgICAgICA/IGBQcmV2aWV3IHNjcmVlbnNob3Qgc2F2ZWQgdG8gJHtmaWxlUGF0aH0gKCR7Y2FwdHVyZU5vdGV9KWBcbiAgICAgICAgICAgICAgICA6IGBQcmV2aWV3IHNjcmVlbnNob3Qgc2F2ZWQgdG8gJHtmaWxlUGF0aH0gKG1vZGU9JHtyZXNvbHZlZE1vZGV9KWA7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBkYXRhLCBtZXNzYWdlIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKSB9O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gdjIuOC4zIFQtVjI4My0yOiByZWFkIGNvY29zIHByZXZpZXcgY29uZmlnIHNvIEFJIGNhbiByb3V0ZVxuICAgIC8vIGNhcHR1cmVfcHJldmlld19zY3JlZW5zaG90IHRvIHRoZSBjb3JyZWN0IG1vZGUgd2l0aG91dCBndWVzc2luZy5cbiAgICAvLyBSZWFkcyB2aWEgRWRpdG9yLk1lc3NhZ2UgcHJlZmVyZW5jZXMvcXVlcnktY29uZmlnICh0eXBlZCBpblxuICAgIC8vIG5vZGVfbW9kdWxlcy9AY29jb3MvY3JlYXRvci10eXBlcy8uLi4vcHJlZmVyZW5jZXMvQHR5cGVzL21lc3NhZ2UuZC50cykuXG4gICAgLy9cbiAgICAvLyBXZSBkdW1wIHRoZSBmdWxsICdwcmV2aWV3JyBjYXRlZ29yeSwgdGhlbiB0cnkgdG8gaW50ZXJwcmV0IGEgZmV3XG4gICAgLy8gY29tbW9uIGtleXMgKCdvcGVuX3ByZXZpZXdfd2l0aCcsICdwcmV2aWV3X3dpdGgnLCAnc2ltdWxhdG9yJyxcbiAgICAvLyAnYnJvd3NlcicpIGludG8gYSBub3JtYWxpemVkIG1vZGUgbGFiZWwuIElmIGludGVycHJldGF0aW9uIGZhaWxzLFxuICAgIC8vIHdlIHN0aWxsIHJldHVybiB0aGUgcmF3IGNvbmZpZyBzbyB0aGUgQUkgY2FuIHJlYWQgaXQgZGlyZWN0bHkuXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRQcmV2aWV3TW9kZSgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gUHJvYmUgYXQgbW9kdWxlIGxldmVsIChubyBrZXkpIHRvIGdldCB0aGUgd2hvbGUgY2F0ZWdvcnkuXG4gICAgICAgICAgICBjb25zdCByYXc6IGFueSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3ByZWZlcmVuY2VzJywgJ3F1ZXJ5LWNvbmZpZycgYXMgYW55LCAncHJldmlldycgYXMgYW55KSBhcyBhbnk7XG4gICAgICAgICAgICBpZiAocmF3ID09PSB1bmRlZmluZWQgfHwgcmF3ID09PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIGVycm9yOiAncHJlZmVyZW5jZXMvcXVlcnktY29uZmlnIHJldHVybmVkIG51bGwgZm9yIFwicHJldmlld1wiIOKAlCBjb2NvcyBtYXkgbm90IGV4cG9zZSB0aGlzIGNhdGVnb3J5LCBvciB5b3VyIGJ1aWxkIGRpZmZlcnMgZnJvbSAzLjgueC4nLFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBIZXVyaXN0aWMgaW50ZXJwcmV0YXRpb24uXG4gICAgICAgICAgICAvLyB2Mi44LjMgcmV0ZXN0IGZpbmRpbmc6IGNvY29zIDMuOC43IGFjdHVhbGx5IHN0b3JlcyB0aGVcbiAgICAgICAgICAgIC8vIGFjdGl2ZSBtb2RlIGF0IGBwcmV2aWV3LmN1cnJlbnQucGxhdGZvcm1gIHdpdGggdmFsdWVcbiAgICAgICAgICAgIC8vIGBcImdhbWVWaWV3XCJgIChlbWJlZGRlZCksIGBcImJyb3dzZXJcImAsIG9yIGRldmljZSBuYW1lc1xuICAgICAgICAgICAgLy8gKHNpbXVsYXRvcikuIFRoZSBvcmlnaW5hbCBoZXVyaXN0aWMgb25seSBjaGVja2VkIGtleXMgbGlrZVxuICAgICAgICAgICAgLy8gYG9wZW5fcHJldmlld193aXRoYCAvIGBwcmV2aWV3X3dpdGhgIC8gYG9wZW5fd2l0aGAgLyBgbW9kZWBcbiAgICAgICAgICAgIC8vIGFuZCBtaXNzZWQgdGhlIGxpdmUga2V5LiBQcm9iZSBgY3VycmVudC5wbGF0Zm9ybWAgZmlyc3Q7XG4gICAgICAgICAgICAvLyBrZWVwIHRoZSBsZWdhY3kga2V5cyBhcyBmYWxsYmFjayBmb3Igb2xkZXIgY29jb3MgdmVyc2lvbnMuXG4gICAgICAgICAgICBjb25zdCBsb3dlciA9IChzOiBhbnkpID0+ICh0eXBlb2YgcyA9PT0gJ3N0cmluZycgPyBzLnRvTG93ZXJDYXNlKCkgOiAnJyk7XG4gICAgICAgICAgICBsZXQgaW50ZXJwcmV0ZWQ6ICdicm93c2VyJyB8ICd3aW5kb3cnIHwgJ3NpbXVsYXRvcicgfCAnZW1iZWRkZWQnIHwgJ3Vua25vd24nID0gJ3Vua25vd24nO1xuICAgICAgICAgICAgbGV0IGludGVycHJldGVkRnJvbUtleTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgICAgICAgICBjb25zdCBjbGFzc2lmeSA9ICh2OiBzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBsdiA9IGxvd2VyKHYpO1xuICAgICAgICAgICAgICAgIGlmIChsdi5pbmNsdWRlcygnYnJvd3NlcicpKSByZXR1cm4gJ2Jyb3dzZXInO1xuICAgICAgICAgICAgICAgIGlmIChsdi5pbmNsdWRlcygnc2ltdWxhdG9yJykpIHJldHVybiAnc2ltdWxhdG9yJztcbiAgICAgICAgICAgICAgICBpZiAobHYuaW5jbHVkZXMoJ2VtYmVkJykgfHwgbHYuaW5jbHVkZXMoJ2dhbWV2aWV3JykgfHwgbHYuaW5jbHVkZXMoJ2dhbWVfdmlldycpKSByZXR1cm4gJ2VtYmVkZGVkJztcbiAgICAgICAgICAgICAgICBpZiAobHYuaW5jbHVkZXMoJ3dpbmRvdycpKSByZXR1cm4gJ3dpbmRvdyc7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgY29uc3QgZGlnID0gKG9iajogYW55LCBwYXRoOiBzdHJpbmcpOiBhbnkgPT4ge1xuICAgICAgICAgICAgICAgIGlmICghb2JqIHx8IHR5cGVvZiBvYmogIT09ICdvYmplY3QnKSByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIGNvbnN0IHBhcnRzID0gcGF0aC5zcGxpdCgnLicpO1xuICAgICAgICAgICAgICAgIGxldCBjdXI6IGFueSA9IG9iajtcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IHAgb2YgcGFydHMpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFjdXIgfHwgdHlwZW9mIGN1ciAhPT0gJ29iamVjdCcpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgICAgIGlmIChwIGluIGN1cikge1xuICAgICAgICAgICAgICAgICAgICAgICAgY3VyID0gY3VyW3BdO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgLy8gVHJ5IG9uZSBsZXZlbCBvZiBuZXN0IChzb21ldGltZXMgdGhlIGNhdGVnb3J5IGR1bXBcbiAgICAgICAgICAgICAgICAgICAgLy8gbmVzdHMgdW5kZXIgYSBkZWZhdWx0LXByb3RvY29sIGJ1Y2tldCkuXG4gICAgICAgICAgICAgICAgICAgIGxldCBmb3VuZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IHYgb2YgT2JqZWN0LnZhbHVlcyhjdXIpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodiAmJiB0eXBlb2YgdiA9PT0gJ29iamVjdCcgJiYgcCBpbiAodiBhcyBhbnkpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY3VyID0gKHYgYXMgYW55KVtwXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb3VuZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYgKCFmb3VuZCkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIGN1cjtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBjb25zdCBwcm9iZUtleXMgPSBbXG4gICAgICAgICAgICAgICAgJ3ByZXZpZXcuY3VycmVudC5wbGF0Zm9ybScsXG4gICAgICAgICAgICAgICAgJ2N1cnJlbnQucGxhdGZvcm0nLFxuICAgICAgICAgICAgICAgICdwcmV2aWV3Lm9wZW5fcHJldmlld193aXRoJyxcbiAgICAgICAgICAgICAgICAnb3Blbl9wcmV2aWV3X3dpdGgnLFxuICAgICAgICAgICAgICAgICdwcmV2aWV3X3dpdGgnLFxuICAgICAgICAgICAgICAgICdvcGVuX3dpdGgnLFxuICAgICAgICAgICAgICAgICdtb2RlJyxcbiAgICAgICAgICAgIF07XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGsgb2YgcHJvYmVLZXlzKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdiA9IGRpZyhyYXcsIGspO1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgdiA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY2xzID0gY2xhc3NpZnkodik7XG4gICAgICAgICAgICAgICAgICAgIGlmIChjbHMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGludGVycHJldGVkID0gY2xzO1xuICAgICAgICAgICAgICAgICAgICAgICAgaW50ZXJwcmV0ZWRGcm9tS2V5ID0gYCR7a309JHt2fWA7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAvLyBOb24tZW1wdHkgc3RyaW5nIHRoYXQgZGlkbid0IG1hdGNoIGEga25vd24gbGFiZWwg4oaSXG4gICAgICAgICAgICAgICAgICAgIC8vIHJlY29yZCBhcyAnc2ltdWxhdG9yJyBjYW5kaWRhdGUgaWYgaXQgbG9va3MgbGlrZSBhXG4gICAgICAgICAgICAgICAgICAgIC8vIGRldmljZSBuYW1lIChlLmcuIFwiQXBwbGUgaVBob25lIDE0IFByb1wiKSwgb3RoZXJ3aXNlXG4gICAgICAgICAgICAgICAgICAgIC8vIGtlZXAgc2VhcmNoaW5nLlxuICAgICAgICAgICAgICAgICAgICBpZiAoL2lQaG9uZXxpUGFkfEhVQVdFSXxYaWFvbWl8U29ueXxBc3VzfE9QUE98SG9ub3J8Tm9raWF8TGVub3ZvfFNhbXN1bmd8R29vZ2xlfFBpeGVsL2kudGVzdCh2KSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaW50ZXJwcmV0ZWQgPSAnc2ltdWxhdG9yJztcbiAgICAgICAgICAgICAgICAgICAgICAgIGludGVycHJldGVkRnJvbUtleSA9IGAke2t9PSR7dn1gO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgZGF0YTogeyBpbnRlcnByZXRlZCwgaW50ZXJwcmV0ZWRGcm9tS2V5LCByYXcgfSxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiBpbnRlcnByZXRlZCA9PT0gJ3Vua25vd24nXG4gICAgICAgICAgICAgICAgICAgID8gJ1JlYWQgY29jb3MgcHJldmlldyBjb25maWcgYnV0IGNvdWxkIG5vdCBpbnRlcnByZXQgYSBtb2RlIGxhYmVsOyBpbnNwZWN0IGRhdGEucmF3IGFuZCBwYXNzIG1vZGU9IGV4cGxpY2l0bHkgdG8gY2FwdHVyZV9wcmV2aWV3X3NjcmVlbnNob3QuJ1xuICAgICAgICAgICAgICAgICAgICA6IGBjb2NvcyBwcmV2aWV3IGlzIGNvbmZpZ3VyZWQgYXMgXCIke2ludGVycHJldGVkfVwiIChmcm9tIGtleSBcIiR7aW50ZXJwcmV0ZWRGcm9tS2V5fVwiKS4gUGFzcyBtb2RlPVwiJHtpbnRlcnByZXRlZCA9PT0gJ2Jyb3dzZXInID8gJ3dpbmRvdycgOiBpbnRlcnByZXRlZH1cIiB0byBjYXB0dXJlX3ByZXZpZXdfc2NyZWVuc2hvdCwgb3IgcmVseSBvbiBtb2RlPVwiYXV0b1wiLmAsXG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgcHJlZmVyZW5jZXMvcXVlcnktY29uZmlnICdwcmV2aWV3JyBmYWlsZWQ6ICR7ZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpfWAgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgYmF0Y2hTY3JlZW5zaG90KHNhdmVQYXRoUHJlZml4Pzogc3RyaW5nLCBkZWxheXNNczogbnVtYmVyW10gPSBbMF0sIHdpbmRvd1RpdGxlPzogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGxldCBwcmVmaXggPSBzYXZlUGF0aFByZWZpeDtcbiAgICAgICAgICAgIGlmICghcHJlZml4KSB7XG4gICAgICAgICAgICAgICAgLy8gYmFzZW5hbWUgaXMgdGhlIHByZWZpeCBzdGVtOyBwZXItaXRlcmF0aW9uIGZpbGVzIGV4dGVuZCBpdFxuICAgICAgICAgICAgICAgIC8vIHdpdGggYC0ke2l9LnBuZ2AuIENvbnRhaW5tZW50IGNoZWNrIG9uIHRoZSBwcmVmaXggcGF0aCBpc1xuICAgICAgICAgICAgICAgIC8vIHN1ZmZpY2llbnQgYmVjYXVzZSBwYXRoLmpvaW4gcHJlc2VydmVzIGRpcm5hbWUgZm9yIGFueVxuICAgICAgICAgICAgICAgIC8vIHN1ZmZpeCB0aGUgbG9vcCBhcHBlbmRzLlxuICAgICAgICAgICAgICAgIGNvbnN0IHJlc29sdmVkID0gdGhpcy5yZXNvbHZlQXV0b0NhcHR1cmVGaWxlKGBiYXRjaC0ke0RhdGUubm93KCl9YCk7XG4gICAgICAgICAgICAgICAgaWYgKCFyZXNvbHZlZC5vaykgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiByZXNvbHZlZC5lcnJvciB9O1xuICAgICAgICAgICAgICAgIHByZWZpeCA9IHJlc29sdmVkLmZpbGVQYXRoO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyB2Mi44LjEgcm91bmQtMSBmaXggKEdlbWluaSDwn5S0ICsgQ29kZXgg8J+foSk6IGV4cGxpY2l0IHByZWZpeFxuICAgICAgICAgICAgICAgIC8vIGFsc28gZ2V0cyBjb250YWlubWVudC1jaGVja2VkLiBXZSBjaGVjayB0aGUgcHJlZml4IHBhdGhcbiAgICAgICAgICAgICAgICAvLyBpdHNlbGYg4oCUIGV2ZXJ5IGVtaXR0ZWQgZmlsZSBsaXZlcyBpbiB0aGUgc2FtZSBkaXJuYW1lLlxuICAgICAgICAgICAgICAgIC8vIHYyLjguMiByZXRlc3QgZml4OiB1c2UgcmVzb2x2ZWRQYXRoIGZvciByZWxhdGl2ZS1wcmVmaXggc3VwcG9ydC5cbiAgICAgICAgICAgICAgICBjb25zdCBndWFyZCA9IHRoaXMuYXNzZXJ0U2F2ZVBhdGhXaXRoaW5Qcm9qZWN0KHByZWZpeCk7XG4gICAgICAgICAgICAgICAgaWYgKCFndWFyZC5vaykgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBndWFyZC5lcnJvciB9O1xuICAgICAgICAgICAgICAgIHByZWZpeCA9IGd1YXJkLnJlc29sdmVkUGF0aDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHdpbiA9IHRoaXMucGlja1dpbmRvdyh3aW5kb3dUaXRsZSk7XG4gICAgICAgICAgICBjb25zdCBjYXB0dXJlczogYW55W10gPSBbXTtcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZGVsYXlzTXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICBjb25zdCBkZWxheSA9IGRlbGF5c01zW2ldO1xuICAgICAgICAgICAgICAgIGlmIChkZWxheSA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIGRlbGF5KSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IGZpbGVQYXRoID0gYCR7cHJlZml4fS0ke2l9LnBuZ2A7XG4gICAgICAgICAgICAgICAgY29uc3QgaW1hZ2UgPSBhd2FpdCB3aW4ud2ViQ29udGVudHMuY2FwdHVyZVBhZ2UoKTtcbiAgICAgICAgICAgICAgICBjb25zdCBwbmc6IEJ1ZmZlciA9IGltYWdlLnRvUE5HKCk7XG4gICAgICAgICAgICAgICAgZnMud3JpdGVGaWxlU3luYyhmaWxlUGF0aCwgcG5nKTtcbiAgICAgICAgICAgICAgICBjYXB0dXJlcy5wdXNoKHsgaW5kZXg6IGksIGRlbGF5TXM6IGRlbGF5LCBmaWxlUGF0aCwgc2l6ZTogcG5nLmxlbmd0aCB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIGNvdW50OiBjYXB0dXJlcy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgIHdpbmRvd1RpdGxlOiB0eXBlb2Ygd2luLmdldFRpdGxlID09PSAnZnVuY3Rpb24nID8gd2luLmdldFRpdGxlKCkgOiAnJyxcbiAgICAgICAgICAgICAgICAgICAgY2FwdHVyZXMsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiBgQ2FwdHVyZWQgJHtjYXB0dXJlcy5sZW5ndGh9IHNjcmVlbnNob3RzYCxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKSB9O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gdjIuNy4wICMzOiBwcmV2aWV3LXVybCAvIHF1ZXJ5LWRldmljZXMgaGFuZGxlcnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgICBwcml2YXRlIGFzeW5jIHByZXZpZXdVcmwoYWN0aW9uOiAncXVlcnknIHwgJ29wZW4nID0gJ3F1ZXJ5Jyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCB1cmw6IHN0cmluZyA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3ByZXZpZXcnLCAncXVlcnktcHJldmlldy11cmwnIGFzIGFueSkgYXMgYW55O1xuICAgICAgICAgICAgaWYgKCF1cmwgfHwgdHlwZW9mIHVybCAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdwcmV2aWV3L3F1ZXJ5LXByZXZpZXctdXJsIHJldHVybmVkIGVtcHR5IHJlc3VsdDsgY2hlY2sgdGhhdCBjb2NvcyBwcmV2aWV3IHNlcnZlciBpcyBydW5uaW5nJyB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgZGF0YTogYW55ID0geyB1cmwgfTtcbiAgICAgICAgICAgIGlmIChhY3Rpb24gPT09ICdvcGVuJykge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIExhenkgcmVxdWlyZSBzbyBzbW9rZSAvIG5vbi1FbGVjdHJvbiBjb250ZXh0cyBkb24ndCBmYXVsdFxuICAgICAgICAgICAgICAgICAgICAvLyBvbiBtaXNzaW5nIGVsZWN0cm9uLlxuICAgICAgICAgICAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLXZhci1yZXF1aXJlc1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBlbGVjdHJvbiA9IHJlcXVpcmUoJ2VsZWN0cm9uJyk7XG4gICAgICAgICAgICAgICAgICAgIC8vIHYyLjcuMSByZXZpZXcgZml4IChjb2RleCDwn5+hICsgZ2VtaW5pIPCfn6EpOiBvcGVuRXh0ZXJuYWxcbiAgICAgICAgICAgICAgICAgICAgLy8gcmVzb2x2ZXMgd2hlbiB0aGUgT1MgbGF1bmNoZXIgaXMgaW52b2tlZCwgbm90IHdoZW4gdGhlXG4gICAgICAgICAgICAgICAgICAgIC8vIHBhZ2UgcmVuZGVycy4gVXNlIFwibGF1bmNoXCIgd29yZGluZyB0byBhdm9pZCB0aGUgQUlcbiAgICAgICAgICAgICAgICAgICAgLy8gbWlzcmVhZGluZyBcIm9wZW5lZFwiIGFzIGEgY29uZmlybWVkIHBhZ2UtbG9hZC5cbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgZWxlY3Ryb24uc2hlbGwub3BlbkV4dGVybmFsKHVybCk7XG4gICAgICAgICAgICAgICAgICAgIGRhdGEubGF1bmNoZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICAgICAgICAgIGRhdGEubGF1bmNoZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgZGF0YS5sYXVuY2hFcnJvciA9IGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBSZWZsZWN0IGFjdHVhbCBsYXVuY2ggb3V0Y29tZSBpbiB0aGUgdG9wLWxldmVsIG1lc3NhZ2Ugc28gQUlcbiAgICAgICAgICAgIC8vIHNlZXMgXCJsYXVuY2ggZmFpbGVkXCIgaW5zdGVhZCBvZiBtaXNsZWFkaW5nIFwiT3BlbmVkIC4uLlwiIHdoZW5cbiAgICAgICAgICAgIC8vIG9wZW5FeHRlcm5hbCB0aHJldyAoZ2VtaW5pIPCfn6EpLlxuICAgICAgICAgICAgY29uc3QgbWVzc2FnZSA9IGFjdGlvbiA9PT0gJ29wZW4nXG4gICAgICAgICAgICAgICAgPyAoZGF0YS5sYXVuY2hlZFxuICAgICAgICAgICAgICAgICAgICA/IGBMYXVuY2hlZCAke3VybH0gaW4gZGVmYXVsdCBicm93c2VyIChwYWdlIHJlbmRlciBub3QgYXdhaXRlZClgXG4gICAgICAgICAgICAgICAgICAgIDogYFJldHVybmVkIFVSTCAke3VybH0gYnV0IGxhdW5jaCBmYWlsZWQ6ICR7ZGF0YS5sYXVuY2hFcnJvcn1gKVxuICAgICAgICAgICAgICAgIDogdXJsO1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZGF0YSwgbWVzc2FnZSB9O1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycikgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIHYyLjguMCBULVYyOC0zOiBQSUUgcGxheSAvIHN0b3AuIFJvdXRlcyB0aHJvdWdoIHNjZW5lLXNjcmlwdCBzbyB0aGVcbiAgICAvLyB0eXBlZCBjY2UuU2NlbmVGYWNhZGUuY2hhbmdlUHJldmlld1BsYXlTdGF0ZSBpcyByZWFjaGVkIHZpYSB0aGVcbiAgICAvLyBkb2N1bWVudGVkIGV4ZWN1dGUtc2NlbmUtc2NyaXB0IGNoYW5uZWwuXG4gICAgLy9cbiAgICAvLyB2Mi44LjMgVC1WMjgzLTMgcmV0ZXN0IGZpbmRpbmc6IGNvY29zIHNvbWV0aW1lcyBsb2dzXG4gICAgLy8gXCJGYWlsZWQgdG8gcmVmcmVzaCB0aGUgY3VycmVudCBzY2VuZVwiIGluc2lkZSBjaGFuZ2VQcmV2aWV3UGxheVN0YXRlXG4gICAgLy8gZXZlbiB3aGVuIHRoZSBjYWxsIHJldHVybnMgd2l0aG91dCB0aHJvd2luZy4gT2JzZXJ2ZWQgaW4gY29jb3NcbiAgICAvLyAzLjguNyAvIGVtYmVkZGVkIHByZXZpZXcgbW9kZS4gVGhlIHJvb3QgY2F1c2UgaXMgdW5jbGVhciAobWF5XG4gICAgLy8gcmVsYXRlIHRvIGN1bXVsYXRpdmUgc2NlbmUtZGlydHkgLyBlbWJlZGRlZC1tb2RlIHRpbWluZyAvXG4gICAgLy8gaW5pdGlhbC1sb2FkIGNvbXBsYWludCksIGJ1dCB0aGUgdmlzaWJsZSBlZmZlY3QgaXMgdGhhdCBQSUUgc3RhdGVcbiAgICAvLyBjaGFuZ2VzIGluY29tcGxldGVseS4gV2Ugbm93IFNDQU4gdGhlIGNhcHR1cmVkIHNjZW5lLXNjcmlwdCBsb2dzXG4gICAgLy8gZm9yIHRoYXQgZXJyb3Igc3RyaW5nIGFuZCBzdXJmYWNlIGl0IHRvIHRoZSBBSSBhcyBhIHN0cnVjdHVyZWRcbiAgICAvLyB3YXJuaW5nIGluc3RlYWQgb2YgbGV0dGluZyBpdCBoaWRlIGluc2lkZSBkYXRhLmNhcHR1cmVkTG9ncy5cbiAgICBwcml2YXRlIGFzeW5jIHByZXZpZXdDb250cm9sKG9wOiAnc3RhcnQnIHwgJ3N0b3AnKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3Qgc3RhdGUgPSBvcCA9PT0gJ3N0YXJ0JztcbiAgICAgICAgY29uc3QgcmVzdWx0OiBUb29sUmVzcG9uc2UgPSBhd2FpdCBydW5TY2VuZU1ldGhvZEFzVG9vbFJlc3BvbnNlKCdjaGFuZ2VQcmV2aWV3UGxheVN0YXRlJywgW3N0YXRlXSk7XG4gICAgICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgICAgICAgLy8gU2NhbiBjYXB0dXJlZExvZ3MgZm9yIHRoZSBrbm93biBjb2NvcyB3YXJuaW5nIHNvIEFJXG4gICAgICAgICAgICAvLyBkb2Vzbid0IGdldCBhIG1pc2xlYWRpbmcgYmFyZS1zdWNjZXNzIGVudmVsb3BlLlxuICAgICAgICAgICAgY29uc3QgY2FwdHVyZWQgPSAocmVzdWx0IGFzIGFueSkuY2FwdHVyZWRMb2dzIGFzIEFycmF5PHsgbGV2ZWw6IHN0cmluZzsgbWVzc2FnZTogc3RyaW5nIH0+IHwgdW5kZWZpbmVkO1xuICAgICAgICAgICAgY29uc3Qgc2NlbmVSZWZyZXNoRXJyb3IgPSBjYXB0dXJlZD8uZmluZChcbiAgICAgICAgICAgICAgICBlID0+IGU/LmxldmVsID09PSAnZXJyb3InICYmIC9GYWlsZWQgdG8gcmVmcmVzaCB0aGUgY3VycmVudCBzY2VuZS9pLnRlc3QoZT8ubWVzc2FnZSA/PyAnJyksXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgY29uc3Qgd2FybmluZ3M6IHN0cmluZ1tdID0gW107XG4gICAgICAgICAgICBpZiAoc2NlbmVSZWZyZXNoRXJyb3IpIHtcbiAgICAgICAgICAgICAgICB3YXJuaW5ncy5wdXNoKFxuICAgICAgICAgICAgICAgICAgICAnY29jb3MgZWRpdG9yIGxvZ2dlZCBcIkZhaWxlZCB0byByZWZyZXNoIHRoZSBjdXJyZW50IHNjZW5lXCIgZHVyaW5nIFBJRSBzdGF0ZSBjaGFuZ2UuIFBJRSBtYXkgbm90IGhhdmUgZnVsbHkgc3RhcnRlZCDigJQgdmVyaWZ5IHdpdGggYSBmb2xsb3ctdXAgZGVidWdfY2FwdHVyZV9wcmV2aWV3X3NjcmVlbnNob3QuIENvbW1vbiB3b3JrYXJvdW5kOiBlbnN1cmUgdGhlIGFjdGl2ZSBzY2VuZSBpcyBzYXZlZCAodXNlIHNjZW5lX3NhdmVfc2NlbmUpIGJlZm9yZSBjYWxsaW5nIHByZXZpZXdfY29udHJvbChzdGFydCkuJyxcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgYmFzZU1lc3NhZ2UgPSBzdGF0ZVxuICAgICAgICAgICAgICAgID8gJ0VudGVyZWQgUHJldmlldy1pbi1FZGl0b3IgcGxheSBtb2RlIChQSUUgbWF5IHRha2UgYSBtb21lbnQgdG8gYXBwZWFyOyBtb2RlIGRlcGVuZHMgb24gY29jb3MgcHJldmlldyBjb25maWcg4oCUIHNlZSBkZWJ1Z19nZXRfcHJldmlld19tb2RlKSdcbiAgICAgICAgICAgICAgICA6ICdFeGl0ZWQgUHJldmlldy1pbi1FZGl0b3IgcGxheSBtb2RlJztcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgLi4ucmVzdWx0LFxuICAgICAgICAgICAgICAgIC4uLih3YXJuaW5ncy5sZW5ndGggPiAwID8geyBkYXRhOiB7IC4uLihyZXN1bHQuZGF0YSA/PyB7fSksIHdhcm5pbmdzIH0gfSA6IHt9KSxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiB3YXJuaW5ncy5sZW5ndGggPiAwXG4gICAgICAgICAgICAgICAgICAgID8gYCR7YmFzZU1lc3NhZ2V9LiDimqAgJHt3YXJuaW5ncy5qb2luKCcgJyl9YFxuICAgICAgICAgICAgICAgICAgICA6IGJhc2VNZXNzYWdlLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgcXVlcnlEZXZpY2VzKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBkZXZpY2VzOiBhbnlbXSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2RldmljZScsICdxdWVyeScpIGFzIGFueTtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IHsgZGV2aWNlczogQXJyYXkuaXNBcnJheShkZXZpY2VzKSA/IGRldmljZXMgOiBbXSwgY291bnQ6IEFycmF5LmlzQXJyYXkoZGV2aWNlcykgPyBkZXZpY2VzLmxlbmd0aCA6IDAgfSB9O1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycikgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIHYyLjYuMCBULVYyNi0xOiBHYW1lRGVidWdDbGllbnQgYnJpZGdlIGhhbmRsZXJzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnYW1lQ29tbWFuZCh0eXBlOiBzdHJpbmcsIGFyZ3M6IGFueSwgdGltZW91dE1zOiBudW1iZXIgPSAxMDAwMCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHF1ZXVlZCA9IHF1ZXVlR2FtZUNvbW1hbmQodHlwZSwgYXJncyk7XG4gICAgICAgIGlmICghcXVldWVkLm9rKSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHF1ZXVlZC5lcnJvciB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGF3YWl0ZWQgPSBhd2FpdCBhd2FpdENvbW1hbmRSZXN1bHQocXVldWVkLmlkLCB0aW1lb3V0TXMpO1xuICAgICAgICBpZiAoIWF3YWl0ZWQub2spIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYXdhaXRlZC5lcnJvciB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0ZWQucmVzdWx0O1xuICAgICAgICBpZiAocmVzdWx0LnN1Y2Nlc3MgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHJlc3VsdC5lcnJvciA/PyAnR2FtZURlYnVnQ2xpZW50IHJlcG9ydGVkIGZhaWx1cmUnLCBkYXRhOiByZXN1bHQuZGF0YSB9O1xuICAgICAgICB9XG4gICAgICAgIC8vIEJ1aWx0LWluIHNjcmVlbnNob3QgcGF0aDogY2xpZW50IHNlbmRzIGJhY2sgYSBiYXNlNjQgZGF0YVVybDtcbiAgICAgICAgLy8gbGFuZGluZyB0aGUgYnl0ZXMgdG8gZGlzayBvbiBob3N0IHNpZGUga2VlcHMgdGhlIHJlc3VsdCBlbnZlbG9wZVxuICAgICAgICAvLyBzbWFsbCBhbmQgcmV1c2VzIHRoZSBleGlzdGluZyBwcm9qZWN0LXJvb3RlZCBjYXB0dXJlIGRpciBndWFyZC5cbiAgICAgICAgaWYgKHR5cGUgPT09ICdzY3JlZW5zaG90JyAmJiByZXN1bHQuZGF0YSAmJiB0eXBlb2YgcmVzdWx0LmRhdGEuZGF0YVVybCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIGNvbnN0IHBlcnNpc3RlZCA9IHRoaXMucGVyc2lzdEdhbWVTY3JlZW5zaG90KHJlc3VsdC5kYXRhLmRhdGFVcmwsIHJlc3VsdC5kYXRhLndpZHRoLCByZXN1bHQuZGF0YS5oZWlnaHQpO1xuICAgICAgICAgICAgaWYgKCFwZXJzaXN0ZWQub2spIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHBlcnNpc3RlZC5lcnJvciB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICAgICAgICAgICAgZmlsZVBhdGg6IHBlcnNpc3RlZC5maWxlUGF0aCxcbiAgICAgICAgICAgICAgICAgICAgc2l6ZTogcGVyc2lzdGVkLnNpemUsXG4gICAgICAgICAgICAgICAgICAgIHdpZHRoOiByZXN1bHQuZGF0YS53aWR0aCxcbiAgICAgICAgICAgICAgICAgICAgaGVpZ2h0OiByZXN1bHQuZGF0YS5oZWlnaHQsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiBgR2FtZSBjYW52YXMgY2FwdHVyZWQgdG8gJHtwZXJzaXN0ZWQuZmlsZVBhdGh9YCxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogeyB0eXBlLCAuLi5yZXN1bHQuZGF0YSB9LCBtZXNzYWdlOiBgR2FtZSBjb21tYW5kICR7dHlwZX0gb2tgIH07XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnYW1lQ2xpZW50U3RhdHVzKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IGdldENsaWVudFN0YXR1cygpIH07XG4gICAgfVxuXG4gICAgLy8gdjIuNi4xIHJldmlldyBmaXggKGNvZGV4IPCflLQgKyBjbGF1ZGUgVzEpOiBib3VuZCB0aGUgbGVnaXRpbWF0ZSByYW5nZVxuICAgIC8vIG9mIGEgc2NyZWVuc2hvdCBwYXlsb2FkIGJlZm9yZSBkZWNvZGluZyBzbyBhIG1pc2JlaGF2aW5nIC8gbWFsaWNpb3VzXG4gICAgLy8gY2xpZW50IGNhbm5vdCBmaWxsIGRpc2sgYnkgc3RyZWFtaW5nIGFyYml0cmFyeSBiYXNlNjQgYnl0ZXMuXG4gICAgLy8gMzIgTUIgbWF0Y2hlcyB0aGUgZ2xvYmFsIHJlcXVlc3QtYm9keSBjYXAgaW4gbWNwLXNlcnZlci1zZGsudHMgc29cbiAgICAvLyB0aGUgYm9keSB3b3VsZCBhbHJlYWR5IDQxMyBiZWZvcmUgcmVhY2hpbmcgaGVyZSwgYnV0IGFcbiAgICAvLyBiZWx0LWFuZC1icmFjZXMgY2hlY2sgc3RheXMgY2hlYXAuXG4gICAgcHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgTUFYX0dBTUVfU0NSRUVOU0hPVF9CWVRFUyA9IDMyICogMTAyNCAqIDEwMjQ7XG5cbiAgICBwcml2YXRlIHBlcnNpc3RHYW1lU2NyZWVuc2hvdChkYXRhVXJsOiBzdHJpbmcsIF93aWR0aD86IG51bWJlciwgX2hlaWdodD86IG51bWJlcik6IHsgb2s6IHRydWU7IGZpbGVQYXRoOiBzdHJpbmc7IHNpemU6IG51bWJlciB9IHwgeyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmcgfSB7XG4gICAgICAgIGNvbnN0IG0gPSAvXmRhdGE6aW1hZ2VcXC8ocG5nfGpwZWd8d2VicCk7YmFzZTY0LCguKikkL2kuZXhlYyhkYXRhVXJsKTtcbiAgICAgICAgaWYgKCFtKSB7XG4gICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiAnR2FtZURlYnVnQ2xpZW50IHJldHVybmVkIHNjcmVlbnNob3QgZGF0YVVybCBpbiB1bmV4cGVjdGVkIGZvcm1hdCAoZXhwZWN0ZWQgZGF0YTppbWFnZS97cG5nfGpwZWd8d2VicH07YmFzZTY0LC4uLiknIH07XG4gICAgICAgIH1cbiAgICAgICAgLy8gYmFzZTY0LWRlY29kZWQgYnl0ZSBjb3VudCA9IH5jZWlsKGI2NExlbiAqIDMgLyA0KTsgcmVqZWN0IGVhcmx5XG4gICAgICAgIC8vIGJlZm9yZSBhbGxvY2F0aW5nIGEgbXVsdGktR0IgQnVmZmVyLlxuICAgICAgICBjb25zdCBiNjRMZW4gPSBtWzJdLmxlbmd0aDtcbiAgICAgICAgY29uc3QgYXBwcm94Qnl0ZXMgPSBNYXRoLmNlaWwoYjY0TGVuICogMyAvIDQpO1xuICAgICAgICBpZiAoYXBwcm94Qnl0ZXMgPiBEZWJ1Z1Rvb2xzLk1BWF9HQU1FX1NDUkVFTlNIT1RfQllURVMpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGBzY3JlZW5zaG90IHBheWxvYWQgdG9vIGxhcmdlOiB+JHthcHByb3hCeXRlc30gYnl0ZXMgZXhjZWVkcyBjYXAgJHtEZWJ1Z1Rvb2xzLk1BWF9HQU1FX1NDUkVFTlNIT1RfQllURVN9YCB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGV4dCA9IG1bMV0udG9Mb3dlckNhc2UoKSA9PT0gJ2pwZWcnID8gJ2pwZycgOiBtWzFdLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIGNvbnN0IGJ1ZiA9IEJ1ZmZlci5mcm9tKG1bMl0sICdiYXNlNjQnKTtcbiAgICAgICAgaWYgKGJ1Zi5sZW5ndGggPiBEZWJ1Z1Rvb2xzLk1BWF9HQU1FX1NDUkVFTlNIT1RfQllURVMpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGBzY3JlZW5zaG90IHBheWxvYWQgdG9vIGxhcmdlIGFmdGVyIGRlY29kZTogJHtidWYubGVuZ3RofSBieXRlcyBleGNlZWRzIGNhcCAke0RlYnVnVG9vbHMuTUFYX0dBTUVfU0NSRUVOU0hPVF9CWVRFU31gIH07XG4gICAgICAgIH1cbiAgICAgICAgLy8gdjIuNi4xIHJldmlldyBmaXggKGNsYXVkZSBNMiArIGNvZGV4IPCfn6EgKyBnZW1pbmkg8J+foSk6IHJlYWxwYXRoIGJvdGhcbiAgICAgICAgLy8gc2lkZXMgZm9yIGEgdHJ1ZSBjb250YWlubWVudCBjaGVjay4gdjIuOC4wIFQtVjI4LTIgaG9pc3RlZCB0aGlzXG4gICAgICAgIC8vIHBhdHRlcm4gaW50byByZXNvbHZlQXV0b0NhcHR1cmVGaWxlKCkgc28gc2NyZWVuc2hvdCgpIC8gY2FwdHVyZS1cbiAgICAgICAgLy8gcHJldmlldyAvIGJhdGNoLXNjcmVlbnNob3QgLyBwZXJzaXN0LWdhbWUgc2hhcmUgb25lIGltcGxlbWVudGF0aW9uLlxuICAgICAgICBjb25zdCByZXNvbHZlZCA9IHRoaXMucmVzb2x2ZUF1dG9DYXB0dXJlRmlsZShgZ2FtZS0ke0RhdGUubm93KCl9LiR7ZXh0fWApO1xuICAgICAgICBpZiAoIXJlc29sdmVkLm9rKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiByZXNvbHZlZC5lcnJvciB9O1xuICAgICAgICBmcy53cml0ZUZpbGVTeW5jKHJlc29sdmVkLmZpbGVQYXRoLCBidWYpO1xuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSwgZmlsZVBhdGg6IHJlc29sdmVkLmZpbGVQYXRoLCBzaXplOiBidWYubGVuZ3RoIH07XG4gICAgfVxuXG4gICAgLy8gdjIuNC44IEExOiBUUyBkaWFnbm9zdGljcyBoYW5kbGVycyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgICBwcml2YXRlIGFzeW5jIHdhaXRDb21waWxlKHRpbWVvdXRNczogbnVtYmVyID0gMTUwMDApOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcHJvamVjdFBhdGggPSBFZGl0b3I/LlByb2plY3Q/LnBhdGg7XG4gICAgICAgICAgICBpZiAoIXByb2plY3RQYXRoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnd2FpdF9jb21waWxlOiBlZGl0b3IgY29udGV4dCB1bmF2YWlsYWJsZSAobm8gRWRpdG9yLlByb2plY3QucGF0aCknIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB3YWl0Rm9yQ29tcGlsZShwcm9qZWN0UGF0aCwgdGltZW91dE1zKTtcbiAgICAgICAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHJlc3VsdC5lcnJvciA/PyAnd2FpdF9jb21waWxlIGZhaWxlZCcsIGRhdGE6IHJlc3VsdCB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IHJlc3VsdC5jb21waWxlZFxuICAgICAgICAgICAgICAgICAgICA/IGBDb21waWxlIGZpbmlzaGVkIGluICR7cmVzdWx0LndhaXRlZE1zfW1zYFxuICAgICAgICAgICAgICAgICAgICA6IChyZXN1bHQubm90ZSA/PyAnTm8gY29tcGlsZSB0cmlnZ2VyZWQgb3IgdGltZWQgb3V0JyksXG4gICAgICAgICAgICAgICAgZGF0YTogcmVzdWx0LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpIH07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHJ1blNjcmlwdERpYWdub3N0aWNzKHRzY29uZmlnUGF0aD86IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBwcm9qZWN0UGF0aCA9IEVkaXRvcj8uUHJvamVjdD8ucGF0aDtcbiAgICAgICAgICAgIGlmICghcHJvamVjdFBhdGgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdydW5fc2NyaXB0X2RpYWdub3N0aWNzOiBlZGl0b3IgY29udGV4dCB1bmF2YWlsYWJsZSAobm8gRWRpdG9yLlByb2plY3QucGF0aCknIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBydW5TY3JpcHREaWFnbm9zdGljcyhwcm9qZWN0UGF0aCwgeyB0c2NvbmZpZ1BhdGggfSk7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHJlc3VsdC5vayxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiByZXN1bHQuc3VtbWFyeSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIHRvb2w6IHJlc3VsdC50b29sLFxuICAgICAgICAgICAgICAgICAgICBiaW5hcnk6IHJlc3VsdC5iaW5hcnksXG4gICAgICAgICAgICAgICAgICAgIHRzY29uZmlnUGF0aDogcmVzdWx0LnRzY29uZmlnUGF0aCxcbiAgICAgICAgICAgICAgICAgICAgZXhpdENvZGU6IHJlc3VsdC5leGl0Q29kZSxcbiAgICAgICAgICAgICAgICAgICAgZGlhZ25vc3RpY3M6IHJlc3VsdC5kaWFnbm9zdGljcyxcbiAgICAgICAgICAgICAgICAgICAgZGlhZ25vc3RpY0NvdW50OiByZXN1bHQuZGlhZ25vc3RpY3MubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICAvLyB2Mi40LjkgcmV2aWV3IGZpeDogc3Bhd24gZmFpbHVyZXMgKGJpbmFyeSBtaXNzaW5nIC9cbiAgICAgICAgICAgICAgICAgICAgLy8gcGVybWlzc2lvbiBkZW5pZWQpIHN1cmZhY2VkIGV4cGxpY2l0bHkgc28gQUkgY2FuXG4gICAgICAgICAgICAgICAgICAgIC8vIGRpc3Rpbmd1aXNoIFwidHNjIG5ldmVyIHJhblwiIGZyb20gXCJ0c2MgZm91bmQgZXJyb3JzXCIuXG4gICAgICAgICAgICAgICAgICAgIHNwYXduRmFpbGVkOiByZXN1bHQuc3Bhd25GYWlsZWQgPT09IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIHN5c3RlbUVycm9yOiByZXN1bHQuc3lzdGVtRXJyb3IsXG4gICAgICAgICAgICAgICAgICAgIC8vIFRydW5jYXRlIHJhdyBzdHJlYW1zIHRvIGtlZXAgdG9vbCByZXN1bHQgcmVhc29uYWJsZTtcbiAgICAgICAgICAgICAgICAgICAgLy8gZnVsbCBjb250ZW50IHJhcmVseSB1c2VmdWwgd2hlbiB0aGUgcGFyc2VyIGFscmVhZHlcbiAgICAgICAgICAgICAgICAgICAgLy8gc3RydWN0dXJlZCB0aGUgZXJyb3JzLlxuICAgICAgICAgICAgICAgICAgICBzdGRvdXRUYWlsOiByZXN1bHQuc3Rkb3V0LnNsaWNlKC0yMDAwKSxcbiAgICAgICAgICAgICAgICAgICAgc3RkZXJyVGFpbDogcmVzdWx0LnN0ZGVyci5zbGljZSgtMjAwMCksXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKSB9O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRTY3JpcHREaWFnbm9zdGljQ29udGV4dChcbiAgICAgICAgZmlsZTogc3RyaW5nLFxuICAgICAgICBsaW5lOiBudW1iZXIsXG4gICAgICAgIGNvbnRleHRMaW5lczogbnVtYmVyID0gNSxcbiAgICApOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcHJvamVjdFBhdGggPSBFZGl0b3I/LlByb2plY3Q/LnBhdGg7XG4gICAgICAgICAgICBpZiAoIXByb2plY3RQYXRoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnZ2V0X3NjcmlwdF9kaWFnbm9zdGljX2NvbnRleHQ6IGVkaXRvciBjb250ZXh0IHVuYXZhaWxhYmxlJyB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgYWJzUGF0aCA9IHBhdGguaXNBYnNvbHV0ZShmaWxlKSA/IGZpbGUgOiBwYXRoLmpvaW4ocHJvamVjdFBhdGgsIGZpbGUpO1xuICAgICAgICAgICAgLy8gUGF0aCBzYWZldHk6IGVuc3VyZSBhYnNvbHV0ZSBwYXRoIHJlc29sdmVzIHVuZGVyIHByb2plY3RQYXRoXG4gICAgICAgICAgICAvLyB0byBwcmV2ZW50IHJlYWRzIG91dHNpZGUgdGhlIGNvY29zIHByb2plY3QuXG4gICAgICAgICAgICAvL1xuICAgICAgICAgICAgLy8gdjIuNC45IHJldmlldyBmaXggKGNvZGV4IPCflLQpOiBwbGFpbiBwYXRoLnJlc29sdmUrc3RhcnRzV2l0aCBvbmx5XG4gICAgICAgICAgICAvLyBjYXRjaGVzIGAuLmAgdHJhdmVyc2FsIOKAlCBhIFNZTUxJTksgaW5zaWRlIHRoZSBwcm9qZWN0IHBvaW50aW5nXG4gICAgICAgICAgICAvLyBvdXRzaWRlIGlzIHN0aWxsIHJlYWRhYmxlIGJlY2F1c2UgcGF0aC5yZXNvbHZlIGRvZXNuJ3QgZm9sbG93XG4gICAgICAgICAgICAvLyBzeW1saW5rcy4gVXNlIGZzLnJlYWxwYXRoU3luYyBvbiBib3RoIHNpZGVzIHNvIHdlIGNvbXBhcmUgdGhlXG4gICAgICAgICAgICAvLyByZWFsIG9uLWRpc2sgcGF0aHMgKFdpbmRvd3MgaXMgY2FzZS1pbnNlbnNpdGl2ZTsgYm90aCBzaWRlcyBnb1xuICAgICAgICAgICAgLy8gdGhyb3VnaCByZWFscGF0aFN5bmMgc28gY2FzaW5nIGlzIG5vcm1hbGlzZWQgY29uc2lzdGVudGx5KS5cbiAgICAgICAgICAgIGNvbnN0IHJlc29sdmVkUmF3ID0gcGF0aC5yZXNvbHZlKGFic1BhdGgpO1xuICAgICAgICAgICAgY29uc3QgcHJvamVjdFJlc29sdmVkUmF3ID0gcGF0aC5yZXNvbHZlKHByb2plY3RQYXRoKTtcbiAgICAgICAgICAgIGxldCByZXNvbHZlZDogc3RyaW5nO1xuICAgICAgICAgICAgbGV0IHByb2plY3RSZXNvbHZlZDogc3RyaW5nO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlZCA9IGZzLnJlYWxwYXRoU3luYy5uYXRpdmUocmVzb2x2ZWRSYXcpO1xuICAgICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgZ2V0X3NjcmlwdF9kaWFnbm9zdGljX2NvbnRleHQ6IGZpbGUgbm90IGZvdW5kIG9yIHVucmVhZGFibGU6ICR7cmVzb2x2ZWRSYXd9YCB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBwcm9qZWN0UmVzb2x2ZWQgPSBmcy5yZWFscGF0aFN5bmMubmF0aXZlKHByb2plY3RSZXNvbHZlZFJhdyk7XG4gICAgICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgICAgICBwcm9qZWN0UmVzb2x2ZWQgPSBwcm9qZWN0UmVzb2x2ZWRSYXc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBDYXNlLWluc2Vuc2l0aXZlIGNvbXBhcmlzb24gb24gV2luZG93czsgc2VwIGd1YXJkIGFnYWluc3RcbiAgICAgICAgICAgIC8vIC9wcm9qLWZvbyB2cyAvcHJvaiBwcmVmaXggY29uZnVzaW9uLlxuICAgICAgICAgICAgY29uc3QgY21wUmVzb2x2ZWQgPSBwcm9jZXNzLnBsYXRmb3JtID09PSAnd2luMzInID8gcmVzb2x2ZWQudG9Mb3dlckNhc2UoKSA6IHJlc29sdmVkO1xuICAgICAgICAgICAgY29uc3QgY21wUHJvamVjdCA9IHByb2Nlc3MucGxhdGZvcm0gPT09ICd3aW4zMicgPyBwcm9qZWN0UmVzb2x2ZWQudG9Mb3dlckNhc2UoKSA6IHByb2plY3RSZXNvbHZlZDtcbiAgICAgICAgICAgIGlmICghY21wUmVzb2x2ZWQuc3RhcnRzV2l0aChjbXBQcm9qZWN0ICsgcGF0aC5zZXApICYmIGNtcFJlc29sdmVkICE9PSBjbXBQcm9qZWN0KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgZ2V0X3NjcmlwdF9kaWFnbm9zdGljX2NvbnRleHQ6IHBhdGggJHtyZXNvbHZlZH0gcmVzb2x2ZXMgb3V0c2lkZSB0aGUgcHJvamVjdCByb290IChzeW1saW5rLWF3YXJlIGNoZWNrKWAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghZnMuZXhpc3RzU3luYyhyZXNvbHZlZCkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBnZXRfc2NyaXB0X2RpYWdub3N0aWNfY29udGV4dDogZmlsZSBub3QgZm91bmQ6ICR7cmVzb2x2ZWR9YCB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3Qgc3RhdCA9IGZzLnN0YXRTeW5jKHJlc29sdmVkKTtcbiAgICAgICAgICAgIGlmIChzdGF0LnNpemUgPiA1ICogMTAyNCAqIDEwMjQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBnZXRfc2NyaXB0X2RpYWdub3N0aWNfY29udGV4dDogZmlsZSB0b28gbGFyZ2UgKCR7c3RhdC5zaXplfSBieXRlcyk7IHJlZnVzaW5nIHRvIHJlYWQuYCB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgY29udGVudCA9IGZzLnJlYWRGaWxlU3luYyhyZXNvbHZlZCwgJ3V0ZjgnKTtcbiAgICAgICAgICAgIGNvbnN0IGFsbExpbmVzID0gY29udGVudC5zcGxpdCgvXFxyP1xcbi8pO1xuICAgICAgICAgICAgaWYgKGxpbmUgPCAxIHx8IGxpbmUgPiBhbGxMaW5lcy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGBnZXRfc2NyaXB0X2RpYWdub3N0aWNfY29udGV4dDogbGluZSAke2xpbmV9IG91dCBvZiByYW5nZSAxLi4ke2FsbExpbmVzLmxlbmd0aH1gLFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBzdGFydCA9IE1hdGgubWF4KDEsIGxpbmUgLSBjb250ZXh0TGluZXMpO1xuICAgICAgICAgICAgY29uc3QgZW5kID0gTWF0aC5taW4oYWxsTGluZXMubGVuZ3RoLCBsaW5lICsgY29udGV4dExpbmVzKTtcbiAgICAgICAgICAgIGNvbnN0IHdpbmRvdyA9IGFsbExpbmVzLnNsaWNlKHN0YXJ0IC0gMSwgZW5kKTtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiBgUmVhZCAke3dpbmRvdy5sZW5ndGh9IGxpbmVzIG9mIGNvbnRleHQgYXJvdW5kICR7cGF0aC5yZWxhdGl2ZShwcm9qZWN0UmVzb2x2ZWQsIHJlc29sdmVkKX06JHtsaW5lfWAsXG4gICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICBmaWxlOiBwYXRoLnJlbGF0aXZlKHByb2plY3RSZXNvbHZlZCwgcmVzb2x2ZWQpLFxuICAgICAgICAgICAgICAgICAgICBhYnNvbHV0ZVBhdGg6IHJlc29sdmVkLFxuICAgICAgICAgICAgICAgICAgICB0YXJnZXRMaW5lOiBsaW5lLFxuICAgICAgICAgICAgICAgICAgICBzdGFydExpbmU6IHN0YXJ0LFxuICAgICAgICAgICAgICAgICAgICBlbmRMaW5lOiBlbmQsXG4gICAgICAgICAgICAgICAgICAgIHRvdGFsTGluZXM6IGFsbExpbmVzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgbGluZXM6IHdpbmRvdy5tYXAoKHRleHQsIGkpID0+ICh7IGxpbmU6IHN0YXJ0ICsgaSwgdGV4dCB9KSksXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKSB9O1xuICAgICAgICB9XG4gICAgfVxufVxuIl19