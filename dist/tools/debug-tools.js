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
                    savePath: schema_1.z.string().optional().describe('Absolute filesystem path to save the PNG. Omit to auto-name into <project>/temp/mcp-captures/screenshot-<timestamp>.png.'),
                    windowTitle: schema_1.z.string().optional().describe('Optional substring match on window title to pick a specific Electron window. Default: focused window.'),
                    includeBase64: schema_1.z.boolean().default(false).describe('Embed PNG bytes as base64 in response data (large; default false). When false, only the saved file path is returned.'),
                }),
                handler: a => this.screenshot(a.savePath, a.windowTitle, a.includeBase64),
            },
            {
                name: 'capture_preview_screenshot',
                description: 'Capture the cocos Preview-in-Editor (PIE) window to a PNG. Targets an Electron BrowserWindow whose title contains "Preview" — covers PIE windows opened by the cocos toolbar play button. Returns saved file path; pair with debug_preview_url before launching to confirm preview is reachable. For runtime game-canvas pixel-level capture (camera RenderTexture), use debug_game_command(type="screenshot") instead.',
                inputSchema: schema_1.z.object({
                    savePath: schema_1.z.string().optional().describe('Absolute filesystem path to save the PNG. Omit to auto-name into <project>/temp/mcp-captures/preview-<timestamp>.png.'),
                    windowTitle: schema_1.z.string().default('Preview').describe('Substring matched against window titles (default "Preview" for PIE).'),
                    includeBase64: schema_1.z.boolean().default(false).describe('Embed PNG bytes as base64 in response data (large; default false).'),
                }),
                handler: a => this.capturePreviewScreenshot(a.savePath, a.windowTitle, a.includeBase64),
            },
            {
                name: 'batch_screenshot',
                description: 'Capture multiple PNGs of the editor window with optional delays between shots. Useful for animating preview verification or capturing transitions.',
                inputSchema: schema_1.z.object({
                    savePathPrefix: schema_1.z.string().optional().describe('Path prefix for batch output files. Files written as <prefix>-<index>.png. Default: <project>/temp/mcp-captures/batch-<timestamp>.'),
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
    // v2.8.0 T-V28-2 (carryover from v2.7.0 Codex single-reviewer 🟡):
    // mirror the v2.6.1 persistGameScreenshot realpath containment check on
    // every auto-named save path. Caller passes a basename that gets joined
    // under the project-rooted capture dir; the resolved parent must equal
    // the resolved dir, otherwise we reject before writing. Protects against
    // the temp/mcp-captures path being a symlink chain that escapes the
    // project tree (rare but cheap to guard).
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
        const filePath = path.join(dirResult.dir, basename);
        let realDir;
        let realParent;
        try {
            const rp = fs.realpathSync;
            realDir = ((_a = rp.native) !== null && _a !== void 0 ? _a : rp)(dirResult.dir);
            realParent = ((_b = rp.native) !== null && _b !== void 0 ? _b : rp)(path.dirname(filePath));
        }
        catch (err) {
            return { ok: false, error: `screenshot path realpath failed: ${(_c = err === null || err === void 0 ? void 0 : err.message) !== null && _c !== void 0 ? _c : String(err)}` };
        }
        if (path.resolve(realParent) !== path.resolve(realDir)) {
            return { ok: false, error: 'screenshot save path resolved outside the capture directory' };
        }
        return { ok: true, filePath, dir: dirResult.dir };
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
    // v2.7.0 #4: Preview-window screenshot. Wraps screenshot() with a
    // PIE-focused default title and a friendlier error when no Preview
    // window exists (the underlying pickWindow throws "No Electron window
    // title matched" — that doesn't tell AI to launch preview first).
    async capturePreviewScreenshot(savePath, windowTitle = 'Preview', includeBase64 = false) {
        var _a, _b, _c, _d, _e, _f, _g;
        try {
            // Pre-check so failure mode is informative, not the generic
            // "No Electron window title matched" from pickWindow.
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const electron = require('electron');
            const BW = electron.BrowserWindow;
            // v2.7.1 review fix (claude 🟡 + codex 🟡): with the default
            // windowTitle='Preview' a Chinese / localized cocos editor whose
            // main window title contains "Preview" (e.g. "Cocos Creator
            // Preview - <ProjectName>") would falsely match. Disambiguate
            // by excluding any title that ALSO contains "Cocos Creator"
            // when the caller stuck with the default 'Preview' filter.
            // Caller-provided custom windowTitle bypasses the negative
            // filter (their intent is explicit).
            const usingDefault = windowTitle === 'Preview';
            const matches = (_c = (_b = (_a = BW === null || BW === void 0 ? void 0 : BW.getAllWindows) === null || _a === void 0 ? void 0 : _a.call(BW)) === null || _b === void 0 ? void 0 : _b.filter((w) => {
                var _a;
                if (!w || w.isDestroyed())
                    return false;
                const title = ((_a = w.getTitle) === null || _a === void 0 ? void 0 : _a.call(w)) || '';
                if (!title.includes(windowTitle))
                    return false;
                if (usingDefault && /Cocos\s*Creator/i.test(title))
                    return false;
                return true;
            })) !== null && _c !== void 0 ? _c : [];
            if (matches.length === 0) {
                return {
                    success: false,
                    error: `No Electron window title contains "${windowTitle}"${usingDefault ? ' (and is not the main editor)' : ''}. Launch cocos preview first via the toolbar play button or via debug_preview_url(action="open"). Visible window titles: ${(_f = (_e = (_d = BW === null || BW === void 0 ? void 0 : BW.getAllWindows) === null || _d === void 0 ? void 0 : _d.call(BW)) === null || _e === void 0 ? void 0 : _e.map((w) => { var _a, _b; return (_b = (_a = w.getTitle) === null || _a === void 0 ? void 0 : _a.call(w)) !== null && _b !== void 0 ? _b : ''; }).filter(Boolean).join(', ')) !== null && _f !== void 0 ? _f : '(none)'}`,
                };
            }
            // v2.7.1 review fix (claude 🟡 + codex 🟡): capture from the
            // matched window directly instead of delegating to screenshot()
            // → pickWindow(), which would re-run the substring filter
            // without our negative-editor heuristic and could pick a
            // different match. Use the first filtered window so the
            // disambiguation cannot drift.
            const win = matches[0];
            let filePath = savePath;
            if (!filePath) {
                const resolved = this.resolveAutoCaptureFile(`preview-${Date.now()}.png`);
                if (!resolved.ok)
                    return { success: false, error: resolved.error };
                filePath = resolved.filePath;
            }
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
            return { success: true, data, message: `Preview screenshot saved to ${filePath}` };
        }
        catch (err) {
            return { success: false, error: (_g = err === null || err === void 0 ? void 0 : err.message) !== null && _g !== void 0 ? _g : String(err) };
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
    // documented execute-scene-script channel. The HANDOFF originally
    // listed `scene/editor-preview-set-play` as an undocumented Editor
    // .Message channel; we found the typed facade method during T-V28-3
    // implementation and went with that instead.
    async previewControl(op) {
        const state = op === 'start';
        const result = await (0, scene_bridge_1.runSceneMethodAsToolResponse)('changePreviewPlayState', [state]);
        if (result.success) {
            return Object.assign(Object.assign({}, result), { message: state
                    ? 'Entered Preview-in-Editor play mode (PIE window may take a moment to appear)'
                    : 'Exited Preview-in-Editor play mode' });
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWctdG9vbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvdG9vbHMvZGVidWctdG9vbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUEsd0RBQWtFO0FBQ2xFLDBDQUFrQztBQUNsQyxzREFBMkQ7QUFDM0QsMERBQTZFO0FBQzdFLGtFQUFrRztBQUNsRyxzREFBbUU7QUFDbkUsdUNBQXlCO0FBQ3pCLDJDQUE2QjtBQUU3QixNQUFhLFVBQVU7SUFHbkI7UUFDSSxNQUFNLElBQUksR0FBYztZQUNwQjtnQkFDSSxJQUFJLEVBQUUsZUFBZTtnQkFDckIsV0FBVyxFQUFFLDZEQUE2RDtnQkFDMUUsV0FBVyxFQUFFLFVBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO2dCQUN6QixPQUFPLEVBQUUsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLFlBQVksRUFBRTthQUNyQztZQUNEO2dCQUNJLElBQUksRUFBRSxvQkFBb0I7Z0JBQzFCLFdBQVcsRUFBRSx3V0FBd1c7Z0JBQ3JYLFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDO29CQUNsQixJQUFJLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyxnR0FBZ0csQ0FBQztvQkFDM0gsT0FBTyxFQUFFLFVBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxPQUFPLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUMsUUFBUSxDQUFDLHdVQUF3VSxDQUFDO2lCQUMzWSxDQUFDO2dCQUNGLE9BQU8sRUFBRSxDQUFDLENBQUMsRUFBRSxXQUFDLE9BQUEsSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsTUFBQSxDQUFDLENBQUMsT0FBTyxtQ0FBSSxPQUFPLENBQUMsQ0FBQSxFQUFBO2FBQ3JFO1lBQ0Q7Z0JBQ0ksSUFBSSxFQUFF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QUUsSUFBSSxFQUFFLENBQUMsQ0FBQztpQkFDOUQ7YUFDSixDQUFDO1FBQ04sQ0FBQztRQUFDLE9BQU8sR0FBUSxFQUFFLENBQUM7WUFDaEIsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLE1BQUEsR0FBRyxhQUFILEdBQUcsdUJBQUgsR0FBRyxDQUFFLE9BQU8sbUNBQUksTUFBTSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7UUFDbEUsQ0FBQztJQUNMLENBQUM7O0FBbGtDTCxnQ0Fta0NDO0FBektHLHVFQUF1RTtBQUN2RSx1RUFBdUU7QUFDdkUsK0RBQStEO0FBQy9ELG9FQUFvRTtBQUNwRSx5REFBeUQ7QUFDekQscUNBQXFDO0FBQ2Isb0NBQXlCLEdBQUcsRUFBRSxHQUFHLElBQUksR0FBRyxJQUFJLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBUb29sRGVmaW5pdGlvbiwgVG9vbFJlc3BvbnNlLCBUb29sRXhlY3V0b3IsIFBlcmZvcm1hbmNlU3RhdHMsIFZhbGlkYXRpb25SZXN1bHQsIFZhbGlkYXRpb25Jc3N1ZSB9IGZyb20gJy4uL3R5cGVzJztcbmltcG9ydCB7IGRlYnVnTG9nIH0gZnJvbSAnLi4vbGliL2xvZyc7XG5pbXBvcnQgeyBpc0VkaXRvckNvbnRleHRFdmFsRW5hYmxlZCB9IGZyb20gJy4uL2xpYi9ydW50aW1lLWZsYWdzJztcbmltcG9ydCB7IHogfSBmcm9tICcuLi9saWIvc2NoZW1hJztcbmltcG9ydCB7IGRlZmluZVRvb2xzLCBUb29sRGVmIH0gZnJvbSAnLi4vbGliL2RlZmluZS10b29scyc7XG5pbXBvcnQgeyBydW5TY3JpcHREaWFnbm9zdGljcywgd2FpdEZvckNvbXBpbGUgfSBmcm9tICcuLi9saWIvdHMtZGlhZ25vc3RpY3MnO1xuaW1wb3J0IHsgcXVldWVHYW1lQ29tbWFuZCwgYXdhaXRDb21tYW5kUmVzdWx0LCBnZXRDbGllbnRTdGF0dXMgfSBmcm9tICcuLi9saWIvZ2FtZS1jb21tYW5kLXF1ZXVlJztcbmltcG9ydCB7IHJ1blNjZW5lTWV0aG9kQXNUb29sUmVzcG9uc2UgfSBmcm9tICcuLi9saWIvc2NlbmUtYnJpZGdlJztcbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5cbmV4cG9ydCBjbGFzcyBEZWJ1Z1Rvb2xzIGltcGxlbWVudHMgVG9vbEV4ZWN1dG9yIHtcbiAgICBwcml2YXRlIHJlYWRvbmx5IGV4ZWM6IFRvb2xFeGVjdXRvcjtcblxuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICBjb25zdCBkZWZzOiBUb29sRGVmW10gPSBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2NsZWFyX2NvbnNvbGUnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnQ2xlYXIgdGhlIENvY29zIEVkaXRvciBDb25zb2xlIFVJLiBObyBwcm9qZWN0IHNpZGUgZWZmZWN0cy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogKCkgPT4gdGhpcy5jbGVhckNvbnNvbGUoKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2V4ZWN1dGVfamF2YXNjcmlwdCcsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdbcHJpbWFyeV0gRXhlY3V0ZSBKYXZhU2NyaXB0IGluIHNjZW5lIG9yIGVkaXRvciBjb250ZXh0LiBVc2UgdGhpcyBhcyB0aGUgZGVmYXVsdCBmaXJzdCB0b29sIGZvciBjb21wb3VuZCBvcGVyYXRpb25zIChyZWFkIOKGkiBtdXRhdGUg4oaSIHZlcmlmeSkg4oCUIG9uZSBjYWxsIHJlcGxhY2VzIDUtMTAgbmFycm93IHNwZWNpYWxpc3QgdG9vbHMgYW5kIGF2b2lkcyBwZXItY2FsbCB0b2tlbiBvdmVyaGVhZC4gY29udGV4dD1cInNjZW5lXCIgaW5zcGVjdHMvbXV0YXRlcyBjYy5Ob2RlIGdyYXBoOyBjb250ZXh0PVwiZWRpdG9yXCIgcnVucyBpbiBob3N0IHByb2Nlc3MgZm9yIEVkaXRvci5NZXNzYWdlICsgZnMgKGRlZmF1bHQgb2ZmLCBvcHQtaW4pLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgY29kZTogei5zdHJpbmcoKS5kZXNjcmliZSgnSmF2YVNjcmlwdCBzb3VyY2UgdG8gZXhlY3V0ZS4gSGFzIGFjY2VzcyB0byBjYy4qIGluIHNjZW5lIGNvbnRleHQsIEVkaXRvci4qIGluIGVkaXRvciBjb250ZXh0LicpLFxuICAgICAgICAgICAgICAgICAgICBjb250ZXh0OiB6LmVudW0oWydzY2VuZScsICdlZGl0b3InXSkuZGVmYXVsdCgnc2NlbmUnKS5kZXNjcmliZSgnRXhlY3V0aW9uIHNhbmRib3guIFwic2NlbmVcIiBydW5zIGluc2lkZSB0aGUgY29jb3Mgc2NlbmUgc2NyaXB0IGNvbnRleHQgKGNjLCBkaXJlY3RvciwgZmluZCkuIFwiZWRpdG9yXCIgcnVucyBpbiB0aGUgZWRpdG9yIGhvc3QgcHJvY2VzcyAoRWRpdG9yLCBhc3NldC1kYiwgZnMsIHJlcXVpcmUpLiBFZGl0b3IgY29udGV4dCBpcyBPRkYgYnkgZGVmYXVsdCBhbmQgbXVzdCBiZSBvcHQtaW4gdmlhIHBhbmVsIHNldHRpbmcgYGVuYWJsZUVkaXRvckNvbnRleHRFdmFsYCDigJQgYXJiaXRyYXJ5IGNvZGUgaW4gdGhlIGhvc3QgcHJvY2VzcyBpcyBhIHByb21wdC1pbmplY3Rpb24gcmlzay4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMuZXhlY3V0ZUphdmFTY3JpcHQoYS5jb2RlLCBhLmNvbnRleHQgPz8gJ3NjZW5lJyksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdleGVjdXRlX3NjcmlwdCcsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdbY29tcGF0XSBTY2VuZS1vbmx5IEphdmFTY3JpcHQgZXZhbC4gUHJlZmVyIGV4ZWN1dGVfamF2YXNjcmlwdCB3aXRoIGNvbnRleHQ9XCJzY2VuZVwiIOKAlCBrZXB0IGFzIGNvbXBhdGliaWxpdHkgZW50cnlwb2ludCBmb3Igb2xkZXIgY2xpZW50cy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHNjcmlwdDogei5zdHJpbmcoKS5kZXNjcmliZSgnSmF2YVNjcmlwdCB0byBleGVjdXRlIGluIHNjZW5lIGNvbnRleHQgdmlhIGNvbnNvbGUvZXZhbC4gQ2FuIHJlYWQgb3IgbXV0YXRlIHRoZSBjdXJyZW50IHNjZW5lLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy5leGVjdXRlU2NyaXB0Q29tcGF0KGEuc2NyaXB0KSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2dldF9ub2RlX3RyZWUnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnUmVhZCBhIGRlYnVnIG5vZGUgdHJlZSBmcm9tIGEgcm9vdCBvciBzY2VuZSByb290IGZvciBoaWVyYXJjaHkvY29tcG9uZW50IGluc3BlY3Rpb24uJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICByb290VXVpZDogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdSb290IG5vZGUgVVVJRCB0byBleHBhbmQuIE9taXQgdG8gdXNlIHRoZSBjdXJyZW50IHNjZW5lIHJvb3QuJyksXG4gICAgICAgICAgICAgICAgICAgIG1heERlcHRoOiB6Lm51bWJlcigpLmRlZmF1bHQoMTApLmRlc2NyaWJlKCdNYXhpbXVtIHRyZWUgZGVwdGguIERlZmF1bHQgMTA7IGxhcmdlIHZhbHVlcyBjYW4gcmV0dXJuIGEgbG90IG9mIGRhdGEuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLmdldE5vZGVUcmVlKGEucm9vdFV1aWQsIGEubWF4RGVwdGgpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnZ2V0X3BlcmZvcm1hbmNlX3N0YXRzJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1RyeSB0byByZWFkIHNjZW5lIHF1ZXJ5LXBlcmZvcm1hbmNlIHN0YXRzOyBtYXkgcmV0dXJuIHVuYXZhaWxhYmxlIGluIGVkaXQgbW9kZS4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogKCkgPT4gdGhpcy5nZXRQZXJmb3JtYW5jZVN0YXRzKCksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICd2YWxpZGF0ZV9zY2VuZScsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdSdW4gYmFzaWMgY3VycmVudC1zY2VuZSBoZWFsdGggY2hlY2tzIGZvciBtaXNzaW5nIGFzc2V0cyBhbmQgbm9kZS1jb3VudCB3YXJuaW5ncy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIGNoZWNrTWlzc2luZ0Fzc2V0czogei5ib29sZWFuKCkuZGVmYXVsdCh0cnVlKS5kZXNjcmliZSgnQ2hlY2sgbWlzc2luZyBhc3NldCByZWZlcmVuY2VzIHdoZW4gdGhlIENvY29zIHNjZW5lIEFQSSBzdXBwb3J0cyBpdC4nKSxcbiAgICAgICAgICAgICAgICAgICAgY2hlY2tQZXJmb3JtYW5jZTogei5ib29sZWFuKCkuZGVmYXVsdCh0cnVlKS5kZXNjcmliZSgnUnVuIGJhc2ljIHBlcmZvcm1hbmNlIGNoZWNrcyBzdWNoIGFzIGhpZ2ggbm9kZSBjb3VudCB3YXJuaW5ncy4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMudmFsaWRhdGVTY2VuZSh7IGNoZWNrTWlzc2luZ0Fzc2V0czogYS5jaGVja01pc3NpbmdBc3NldHMsIGNoZWNrUGVyZm9ybWFuY2U6IGEuY2hlY2tQZXJmb3JtYW5jZSB9KSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2dldF9lZGl0b3JfaW5mbycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdSZWFkIEVkaXRvci9Db2Nvcy9wcm9qZWN0L3Byb2Nlc3MgaW5mb3JtYXRpb24gYW5kIG1lbW9yeSBzdW1tYXJ5LicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiAoKSA9PiB0aGlzLmdldEVkaXRvckluZm8oKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2dldF9wcm9qZWN0X2xvZ3MnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnUmVhZCB0ZW1wL2xvZ3MvcHJvamVjdC5sb2cgdGFpbCB3aXRoIG9wdGlvbmFsIGxldmVsL2tleXdvcmQgZmlsdGVycy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIGxpbmVzOiB6Lm51bWJlcigpLm1pbigxKS5tYXgoMTAwMDApLmRlZmF1bHQoMTAwKS5kZXNjcmliZSgnTnVtYmVyIG9mIGxpbmVzIHRvIHJlYWQgZnJvbSB0aGUgZW5kIG9mIHRlbXAvbG9ncy9wcm9qZWN0LmxvZy4gRGVmYXVsdCAxMDAuJyksXG4gICAgICAgICAgICAgICAgICAgIGZpbHRlcktleXdvcmQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnT3B0aW9uYWwgY2FzZS1pbnNlbnNpdGl2ZSBrZXl3b3JkIGZpbHRlci4nKSxcbiAgICAgICAgICAgICAgICAgICAgbG9nTGV2ZWw6IHouZW51bShbJ0VSUk9SJywgJ1dBUk4nLCAnSU5GTycsICdERUJVRycsICdUUkFDRScsICdBTEwnXSkuZGVmYXVsdCgnQUxMJykuZGVzY3JpYmUoJ09wdGlvbmFsIGxvZyBsZXZlbCBmaWx0ZXIuIEFMTCBkaXNhYmxlcyBsZXZlbCBmaWx0ZXJpbmcuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLmdldFByb2plY3RMb2dzKGEubGluZXMsIGEuZmlsdGVyS2V5d29yZCwgYS5sb2dMZXZlbCksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdnZXRfbG9nX2ZpbGVfaW5mbycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdSZWFkIHRlbXAvbG9ncy9wcm9qZWN0LmxvZyBwYXRoLCBzaXplLCBsaW5lIGNvdW50LCBhbmQgdGltZXN0YW1wcy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogKCkgPT4gdGhpcy5nZXRMb2dGaWxlSW5mbygpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnc2VhcmNoX3Byb2plY3RfbG9ncycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdTZWFyY2ggdGVtcC9sb2dzL3Byb2plY3QubG9nIGZvciBzdHJpbmcvcmVnZXggYW5kIHJldHVybiBsaW5lIGNvbnRleHQuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBwYXR0ZXJuOiB6LnN0cmluZygpLmRlc2NyaWJlKCdTZWFyY2ggc3RyaW5nIG9yIHJlZ2V4LiBJbnZhbGlkIHJlZ2V4IGlzIHRyZWF0ZWQgYXMgYSBsaXRlcmFsIHN0cmluZy4nKSxcbiAgICAgICAgICAgICAgICAgICAgbWF4UmVzdWx0czogei5udW1iZXIoKS5taW4oMSkubWF4KDEwMCkuZGVmYXVsdCgyMCkuZGVzY3JpYmUoJ01heGltdW0gbWF0Y2hlcyB0byByZXR1cm4uIERlZmF1bHQgMjAuJyksXG4gICAgICAgICAgICAgICAgICAgIGNvbnRleHRMaW5lczogei5udW1iZXIoKS5taW4oMCkubWF4KDEwKS5kZWZhdWx0KDIpLmRlc2NyaWJlKCdDb250ZXh0IGxpbmVzIGJlZm9yZS9hZnRlciBlYWNoIG1hdGNoLiBEZWZhdWx0IDIuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLnNlYXJjaFByb2plY3RMb2dzKGEucGF0dGVybiwgYS5tYXhSZXN1bHRzLCBhLmNvbnRleHRMaW5lcyksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdzY3JlZW5zaG90JyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ0NhcHR1cmUgdGhlIGZvY3VzZWQgQ29jb3MgRWRpdG9yIHdpbmRvdyAob3IgYSB3aW5kb3cgbWF0Y2hlZCBieSB0aXRsZSkgdG8gYSBQTkcuIFJldHVybnMgc2F2ZWQgZmlsZSBwYXRoLiBVc2UgdGhpcyBmb3IgQUkgdmlzdWFsIHZlcmlmaWNhdGlvbiBhZnRlciBzY2VuZS9VSSBjaGFuZ2VzLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgc2F2ZVBhdGg6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnQWJzb2x1dGUgZmlsZXN5c3RlbSBwYXRoIHRvIHNhdmUgdGhlIFBORy4gT21pdCB0byBhdXRvLW5hbWUgaW50byA8cHJvamVjdD4vdGVtcC9tY3AtY2FwdHVyZXMvc2NyZWVuc2hvdC08dGltZXN0YW1wPi5wbmcuJyksXG4gICAgICAgICAgICAgICAgICAgIHdpbmRvd1RpdGxlOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ09wdGlvbmFsIHN1YnN0cmluZyBtYXRjaCBvbiB3aW5kb3cgdGl0bGUgdG8gcGljayBhIHNwZWNpZmljIEVsZWN0cm9uIHdpbmRvdy4gRGVmYXVsdDogZm9jdXNlZCB3aW5kb3cuJyksXG4gICAgICAgICAgICAgICAgICAgIGluY2x1ZGVCYXNlNjQ6IHouYm9vbGVhbigpLmRlZmF1bHQoZmFsc2UpLmRlc2NyaWJlKCdFbWJlZCBQTkcgYnl0ZXMgYXMgYmFzZTY0IGluIHJlc3BvbnNlIGRhdGEgKGxhcmdlOyBkZWZhdWx0IGZhbHNlKS4gV2hlbiBmYWxzZSwgb25seSB0aGUgc2F2ZWQgZmlsZSBwYXRoIGlzIHJldHVybmVkLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy5zY3JlZW5zaG90KGEuc2F2ZVBhdGgsIGEud2luZG93VGl0bGUsIGEuaW5jbHVkZUJhc2U2NCksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdjYXB0dXJlX3ByZXZpZXdfc2NyZWVuc2hvdCcsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdDYXB0dXJlIHRoZSBjb2NvcyBQcmV2aWV3LWluLUVkaXRvciAoUElFKSB3aW5kb3cgdG8gYSBQTkcuIFRhcmdldHMgYW4gRWxlY3Ryb24gQnJvd3NlcldpbmRvdyB3aG9zZSB0aXRsZSBjb250YWlucyBcIlByZXZpZXdcIiDigJQgY292ZXJzIFBJRSB3aW5kb3dzIG9wZW5lZCBieSB0aGUgY29jb3MgdG9vbGJhciBwbGF5IGJ1dHRvbi4gUmV0dXJucyBzYXZlZCBmaWxlIHBhdGg7IHBhaXIgd2l0aCBkZWJ1Z19wcmV2aWV3X3VybCBiZWZvcmUgbGF1bmNoaW5nIHRvIGNvbmZpcm0gcHJldmlldyBpcyByZWFjaGFibGUuIEZvciBydW50aW1lIGdhbWUtY2FudmFzIHBpeGVsLWxldmVsIGNhcHR1cmUgKGNhbWVyYSBSZW5kZXJUZXh0dXJlKSwgdXNlIGRlYnVnX2dhbWVfY29tbWFuZCh0eXBlPVwic2NyZWVuc2hvdFwiKSBpbnN0ZWFkLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgc2F2ZVBhdGg6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnQWJzb2x1dGUgZmlsZXN5c3RlbSBwYXRoIHRvIHNhdmUgdGhlIFBORy4gT21pdCB0byBhdXRvLW5hbWUgaW50byA8cHJvamVjdD4vdGVtcC9tY3AtY2FwdHVyZXMvcHJldmlldy08dGltZXN0YW1wPi5wbmcuJyksXG4gICAgICAgICAgICAgICAgICAgIHdpbmRvd1RpdGxlOiB6LnN0cmluZygpLmRlZmF1bHQoJ1ByZXZpZXcnKS5kZXNjcmliZSgnU3Vic3RyaW5nIG1hdGNoZWQgYWdhaW5zdCB3aW5kb3cgdGl0bGVzIChkZWZhdWx0IFwiUHJldmlld1wiIGZvciBQSUUpLicpLFxuICAgICAgICAgICAgICAgICAgICBpbmNsdWRlQmFzZTY0OiB6LmJvb2xlYW4oKS5kZWZhdWx0KGZhbHNlKS5kZXNjcmliZSgnRW1iZWQgUE5HIGJ5dGVzIGFzIGJhc2U2NCBpbiByZXNwb25zZSBkYXRhIChsYXJnZTsgZGVmYXVsdCBmYWxzZSkuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLmNhcHR1cmVQcmV2aWV3U2NyZWVuc2hvdChhLnNhdmVQYXRoLCBhLndpbmRvd1RpdGxlLCBhLmluY2x1ZGVCYXNlNjQpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnYmF0Y2hfc2NyZWVuc2hvdCcsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdDYXB0dXJlIG11bHRpcGxlIFBOR3Mgb2YgdGhlIGVkaXRvciB3aW5kb3cgd2l0aCBvcHRpb25hbCBkZWxheXMgYmV0d2VlbiBzaG90cy4gVXNlZnVsIGZvciBhbmltYXRpbmcgcHJldmlldyB2ZXJpZmljYXRpb24gb3IgY2FwdHVyaW5nIHRyYW5zaXRpb25zLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgc2F2ZVBhdGhQcmVmaXg6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnUGF0aCBwcmVmaXggZm9yIGJhdGNoIG91dHB1dCBmaWxlcy4gRmlsZXMgd3JpdHRlbiBhcyA8cHJlZml4Pi08aW5kZXg+LnBuZy4gRGVmYXVsdDogPHByb2plY3Q+L3RlbXAvbWNwLWNhcHR1cmVzL2JhdGNoLTx0aW1lc3RhbXA+LicpLFxuICAgICAgICAgICAgICAgICAgICBkZWxheXNNczogei5hcnJheSh6Lm51bWJlcigpLm1pbigwKS5tYXgoMTAwMDApKS5tYXgoMjApLmRlZmF1bHQoWzBdKS5kZXNjcmliZSgnRGVsYXkgKG1zKSBiZWZvcmUgZWFjaCBjYXB0dXJlLiBMZW5ndGggZGV0ZXJtaW5lcyBob3cgbWFueSBzaG90cyB0YWtlbiAoY2FwcGVkIGF0IDIwIHRvIHByZXZlbnQgZGlzayBmaWxsIC8gZWRpdG9yIGZyZWV6ZSkuIERlZmF1bHQgWzBdID0gc2luZ2xlIHNob3QuJyksXG4gICAgICAgICAgICAgICAgICAgIHdpbmRvd1RpdGxlOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ09wdGlvbmFsIHN1YnN0cmluZyBtYXRjaCBvbiB3aW5kb3cgdGl0bGUuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLmJhdGNoU2NyZWVuc2hvdChhLnNhdmVQYXRoUHJlZml4LCBhLmRlbGF5c01zLCBhLndpbmRvd1RpdGxlKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3dhaXRfY29tcGlsZScsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdCbG9jayB1bnRpbCBjb2NvcyBmaW5pc2hlcyBpdHMgVHlwZVNjcmlwdCBjb21waWxlIHBhc3MuIFRhaWxzIHRlbXAvcHJvZ3JhbW1pbmcvcGFja2VyLWRyaXZlci9sb2dzL2RlYnVnLmxvZyBmb3IgdGhlIFwiVGFyZ2V0KGVkaXRvcikgZW5kc1wiIG1hcmtlci4gUmV0dXJucyBpbW1lZGlhdGVseSB3aXRoIGNvbXBpbGVkPWZhbHNlIGlmIG5vIGNvbXBpbGUgd2FzIHRyaWdnZXJlZCAoY2xlYW4gcHJvamVjdCAvIG5vIGNoYW5nZXMgZGV0ZWN0ZWQpLiBQYWlyIHdpdGggcnVuX3NjcmlwdF9kaWFnbm9zdGljcyBmb3IgYW4gXCJlZGl0IC50cyDihpIgd2FpdCDihpIgZmV0Y2ggZXJyb3JzXCIgd29ya2Zsb3cuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICB0aW1lb3V0TXM6IHoubnVtYmVyKCkubWluKDUwMCkubWF4KDEyMDAwMCkuZGVmYXVsdCgxNTAwMCkuZGVzY3JpYmUoJ01heCB3YWl0IHRpbWUgaW4gbXMgYmVmb3JlIGdpdmluZyB1cC4gRGVmYXVsdCAxNTAwMC4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMud2FpdENvbXBpbGUoYS50aW1lb3V0TXMpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAncnVuX3NjcmlwdF9kaWFnbm9zdGljcycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdSdW4gYHRzYyAtLW5vRW1pdGAgYWdhaW5zdCB0aGUgcHJvamVjdCB0c2NvbmZpZyBhbmQgcmV0dXJuIHBhcnNlZCBkaWFnbm9zdGljcy4gVXNlZCBhZnRlciB3YWl0X2NvbXBpbGUgdG8gc3VyZmFjZSBjb21waWxhdGlvbiBlcnJvcnMgYXMgc3RydWN0dXJlZCB7ZmlsZSwgbGluZSwgY29sdW1uLCBjb2RlLCBtZXNzYWdlfSBlbnRyaWVzLiBSZXNvbHZlcyB0c2MgYmluYXJ5IGZyb20gcHJvamVjdCBub2RlX21vZHVsZXMg4oaSIGVkaXRvciBidW5kbGVkIGVuZ2luZSDihpIgbnB4IGZhbGxiYWNrLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgdHNjb25maWdQYXRoOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ09wdGlvbmFsIG92ZXJyaWRlIChhYnNvbHV0ZSBvciBwcm9qZWN0LXJlbGF0aXZlKS4gRGVmYXVsdDogdHNjb25maWcuanNvbiBvciB0ZW1wL3RzY29uZmlnLmNvY29zLmpzb24uJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLnJ1blNjcmlwdERpYWdub3N0aWNzKGEudHNjb25maWdQYXRoKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3ByZXZpZXdfdXJsJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1Jlc29sdmUgdGhlIGNvY29zIGJyb3dzZXItcHJldmlldyBVUkwgKGUuZy4gaHR0cDovL2xvY2FsaG9zdDo3NDU2KSB2aWEgdGhlIGRvY3VtZW50ZWQgRWRpdG9yLk1lc3NhZ2UgY2hhbm5lbCBwcmV2aWV3L3F1ZXJ5LXByZXZpZXctdXJsLiBXaXRoIGFjdGlvbj1cIm9wZW5cIiwgYWxzbyBsYXVuY2hlcyB0aGUgVVJMIGluIHRoZSB1c2VyIGRlZmF1bHQgYnJvd3NlciB2aWEgZWxlY3Ryb24uc2hlbGwub3BlbkV4dGVybmFsIOKAlCB1c2VmdWwgYXMgYSBzZXR1cCBzdGVwIGJlZm9yZSBkZWJ1Z19nYW1lX2NvbW1hbmQsIHNpbmNlIHRoZSBHYW1lRGVidWdDbGllbnQgcnVubmluZyBpbnNpZGUgdGhlIHByZXZpZXcgbXVzdCBiZSByZWFjaGFibGUuIEVkaXRvci1zaWRlIFByZXZpZXctaW4tRWRpdG9yIHBsYXkvc3RvcCBpcyBOT1QgZXhwb3NlZCBieSB0aGUgcHVibGljIG1lc3NhZ2UgQVBJIGFuZCBpcyBpbnRlbnRpb25hbGx5IG5vdCBpbXBsZW1lbnRlZCBoZXJlOyB1c2UgdGhlIGNvY29zIGVkaXRvciB0b29sYmFyIG1hbnVhbGx5IGZvciBQSUUuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBhY3Rpb246IHouZW51bShbJ3F1ZXJ5JywgJ29wZW4nXSkuZGVmYXVsdCgncXVlcnknKS5kZXNjcmliZSgnXCJxdWVyeVwiIHJldHVybnMgdGhlIFVSTDsgXCJvcGVuXCIgcmV0dXJucyB0aGUgVVJMIEFORCBvcGVucyBpdCBpbiB0aGUgdXNlciBkZWZhdWx0IGJyb3dzZXIgdmlhIGVsZWN0cm9uLnNoZWxsLm9wZW5FeHRlcm5hbC4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMucHJldmlld1VybChhLmFjdGlvbiksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdxdWVyeV9kZXZpY2VzJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ0xpc3QgcHJldmlldyBkZXZpY2VzIGNvbmZpZ3VyZWQgaW4gdGhlIGNvY29zIHByb2plY3QgKGNjLklEZXZpY2VJdGVtIGVudHJpZXMpLiBCYWNrZWQgYnkgRWRpdG9yLk1lc3NhZ2UgY2hhbm5lbCBkZXZpY2UvcXVlcnkuIFJldHVybnMgYW4gYXJyYXkgb2Yge25hbWUsIHdpZHRoLCBoZWlnaHQsIHJhdGlvfSBlbnRyaWVzIOKAlCB1c2VmdWwgZm9yIGJhdGNoLXNjcmVlbnNob3QgcGlwZWxpbmVzIHRoYXQgdGFyZ2V0IG11bHRpcGxlIHJlc29sdXRpb25zLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiAoKSA9PiB0aGlzLnF1ZXJ5RGV2aWNlcygpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnZ2FtZV9jb21tYW5kJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1NlbmQgYSBydW50aW1lIGNvbW1hbmQgdG8gYSBHYW1lRGVidWdDbGllbnQgcnVubmluZyBpbnNpZGUgYSBjb2NvcyBwcmV2aWV3L2J1aWxkIChicm93c2VyLCBQcmV2aWV3LWluLUVkaXRvciwgb3IgYW55IGRldmljZSB0aGF0IGZldGNoZXMgL2dhbWUvY29tbWFuZCkuIEJ1aWx0LWluIGNvbW1hbmQgdHlwZXM6IFwic2NyZWVuc2hvdFwiIChjYXB0dXJlIGdhbWUgY2FudmFzIHRvIFBORywgcmV0dXJucyBzYXZlZCBmaWxlIHBhdGgpLCBcImNsaWNrXCIgKGVtaXQgQnV0dG9uLkNMSUNLIG9uIGEgbm9kZSBieSBuYW1lKSwgXCJpbnNwZWN0XCIgKGR1bXAgcnVudGltZSBub2RlIGluZm86IHBvc2l0aW9uL3NjYWxlL3JvdGF0aW9uL2NvbnRlbnRTaXplL2FjdGl2ZS9jb21wb25lbnRzIGJ5IG5hbWUpLiBDdXN0b20gY29tbWFuZCB0eXBlcyBhcmUgZm9yd2FyZGVkIHRvIHRoZSBjbGllbnRcXCdzIGN1c3RvbUNvbW1hbmRzIG1hcCAoZS5nLiBcInN0YXRlXCIsIFwibmF2aWdhdGVcIikuIFJlcXVpcmVzIHRoZSBHYW1lRGVidWdDbGllbnQgdGVtcGxhdGUgKGNsaWVudC9jb2Nvcy1tY3AtY2xpZW50LnRzKSB3aXJlZCBpbnRvIHRoZSBydW5uaW5nIGdhbWU7IHdpdGhvdXQgaXQgdGhlIGNhbGwgdGltZXMgb3V0LiBDaGVjayBHRVQgL2dhbWUvc3RhdHVzIHRvIHZlcmlmeSBjbGllbnQgbGl2ZW5lc3MgZmlyc3QuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICB0eXBlOiB6LnN0cmluZygpLm1pbigxKS5kZXNjcmliZSgnQ29tbWFuZCB0eXBlLiBCdWlsdC1pbnM6IHNjcmVlbnNob3QsIGNsaWNrLCBpbnNwZWN0LiBDdXN0b21zOiBhbnkgc3RyaW5nIHRoZSBHYW1lRGVidWdDbGllbnQgcmVnaXN0ZXJlZCBpbiBjdXN0b21Db21tYW5kcy4nKSxcbiAgICAgICAgICAgICAgICAgICAgYXJnczogei5hbnkoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdDb21tYW5kLXNwZWNpZmljIGFyZ3VtZW50cy4gRm9yIFwiY2xpY2tcIi9cImluc3BlY3RcIjoge25hbWU6IHN0cmluZ30gbm9kZSBuYW1lLiBGb3IgXCJzY3JlZW5zaG90XCI6IHt9IChubyBhcmdzKS4nKSxcbiAgICAgICAgICAgICAgICAgICAgdGltZW91dE1zOiB6Lm51bWJlcigpLm1pbig1MDApLm1heCg2MDAwMCkuZGVmYXVsdCgxMDAwMCkuZGVzY3JpYmUoJ01heCB3YWl0IGZvciBjbGllbnQgcmVzcG9uc2UuIERlZmF1bHQgMTAwMDBtcy4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMuZ2FtZUNvbW1hbmQoYS50eXBlLCBhLmFyZ3MsIGEudGltZW91dE1zKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2dhbWVfY2xpZW50X3N0YXR1cycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdSZWFkIEdhbWVEZWJ1Z0NsaWVudCBjb25uZWN0aW9uIHN0YXR1czogY29ubmVjdGVkIChwb2xsZWQgd2l0aGluIDJzKSwgbGFzdCBwb2xsIHRpbWVzdGFtcCwgd2hldGhlciBhIGNvbW1hbmQgaXMgcXVldWVkLiBVc2UgYmVmb3JlIGRlYnVnX2dhbWVfY29tbWFuZCB0byBjb25maXJtIHRoZSBjbGllbnQgaXMgcmVhY2hhYmxlLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiAoKSA9PiB0aGlzLmdhbWVDbGllbnRTdGF0dXMoKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3ByZXZpZXdfY29udHJvbCcsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdQcm9ncmFtbWF0aWNhbGx5IHN0YXJ0IG9yIHN0b3AgUHJldmlldy1pbi1FZGl0b3IgKFBJRSkgcGxheSBtb2RlLiBXcmFwcyB0aGUgdHlwZWQgY2NlLlNjZW5lRmFjYWRlLmNoYW5nZVByZXZpZXdQbGF5U3RhdGUgbWV0aG9kIChkb2N1bWVudGVkIG9uIFNjZW5lRmFjYWRlTWFuYWdlciBpbiBAY29jb3MvY3JlYXRvci10eXBlcykuIFBhaXIgd2l0aCBkZWJ1Z19jYXB0dXJlX3ByZXZpZXdfc2NyZWVuc2hvdDogY2FsbCBwcmV2aWV3X2NvbnRyb2wob3A9XCJzdGFydFwiKSB0byBlbnRlciBwbGF5IG1vZGUsIHdhaXQgZm9yIHRoZSBQSUUgd2luZG93IHRvIGFwcGVhciwgdGhlbiBjYXB0dXJlLiBwcmV2aWV3X2NvbnRyb2wob3A9XCJzdG9wXCIpIHJldHVybnMgdG8gc2NlbmUgbW9kZS4gSW1wbGVtZW50YXRpb24gcm91dGVzIHRocm91Z2ggc2NlbmUtc2NyaXB0IChleGVjdXRlLXNjZW5lLXNjcmlwdCDihpIgc2NlbmUtc2lkZSBjaGFuZ2VQcmV2aWV3UGxheVN0YXRlIGhhbmRsZXIpIHNvIHRoZSBjYWxsIGlzIHR5cGUtY2hlY2tlZCBhZ2FpbnN0IGNyZWF0b3ItdHlwZXMgYW5kIG5vdCBzdWJqZWN0IHRvIHNpbGVudCByZW1vdmFsIGJldHdlZW4gY29jb3MgdmVyc2lvbnMuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBvcDogei5lbnVtKFsnc3RhcnQnLCAnc3RvcCddKS5kZXNjcmliZSgnXCJzdGFydFwiIGVudGVycyBQSUUgcGxheSBtb2RlIChlcXVpdmFsZW50IHRvIGNsaWNraW5nIHRoZSB0b29sYmFyIHBsYXkgYnV0dG9uKS4gXCJzdG9wXCIgZXhpdHMgUElFIHBsYXkgYW5kIHJldHVybnMgdG8gc2NlbmUgbW9kZS4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMucHJldmlld0NvbnRyb2woYS5vcCksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdnZXRfc2NyaXB0X2RpYWdub3N0aWNfY29udGV4dCcsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdSZWFkIGEgd2luZG93IG9mIHNvdXJjZSBsaW5lcyBhcm91bmQgYSBkaWFnbm9zdGljIGxvY2F0aW9uIHNvIEFJIGNhbiByZWFkIHRoZSBvZmZlbmRpbmcgY29kZSB3aXRob3V0IGEgc2VwYXJhdGUgZmlsZSByZWFkLiBQYWlyIHdpdGggcnVuX3NjcmlwdF9kaWFnbm9zdGljczogcGFzcyBmaWxlL2xpbmUgZnJvbSBlYWNoIGRpYWdub3N0aWMgdG8gZmV0Y2ggY29udGV4dC4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIGZpbGU6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0Fic29sdXRlIG9yIHByb2plY3QtcmVsYXRpdmUgcGF0aCB0byB0aGUgc291cmNlIGZpbGUuIERpYWdub3N0aWNzIGZyb20gcnVuX3NjcmlwdF9kaWFnbm9zdGljcyBhbHJlYWR5IHVzZSBhIHBhdGggdHNjIGVtaXR0ZWQsIHdoaWNoIGlzIHN1aXRhYmxlIGhlcmUuJyksXG4gICAgICAgICAgICAgICAgICAgIGxpbmU6IHoubnVtYmVyKCkubWluKDEpLmRlc2NyaWJlKCcxLWJhc2VkIGxpbmUgbnVtYmVyIHRoYXQgdGhlIGRpYWdub3N0aWMgcG9pbnRzIGF0LicpLFxuICAgICAgICAgICAgICAgICAgICBjb250ZXh0TGluZXM6IHoubnVtYmVyKCkubWluKDApLm1heCg1MCkuZGVmYXVsdCg1KS5kZXNjcmliZSgnTnVtYmVyIG9mIGxpbmVzIHRvIGluY2x1ZGUgYmVmb3JlIGFuZCBhZnRlciB0aGUgdGFyZ2V0IGxpbmUuIERlZmF1bHQgNSAowrE1IOKGkiAxMS1saW5lIHdpbmRvdykuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLmdldFNjcmlwdERpYWdub3N0aWNDb250ZXh0KGEuZmlsZSwgYS5saW5lLCBhLmNvbnRleHRMaW5lcyksXG4gICAgICAgICAgICB9LFxuICAgICAgICBdO1xuICAgICAgICB0aGlzLmV4ZWMgPSBkZWZpbmVUb29scyhkZWZzKTtcbiAgICB9XG5cbiAgICBnZXRUb29scygpOiBUb29sRGVmaW5pdGlvbltdIHsgcmV0dXJuIHRoaXMuZXhlYy5nZXRUb29scygpOyB9XG4gICAgZXhlY3V0ZSh0b29sTmFtZTogc3RyaW5nLCBhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4geyByZXR1cm4gdGhpcy5leGVjLmV4ZWN1dGUodG9vbE5hbWUsIGFyZ3MpOyB9XG5cbiAgICAvLyBDb21wYXQgcGF0aDogcHJlc2VydmUgdGhlIHByZS12Mi4zLjAgcmVzcG9uc2Ugc2hhcGVcbiAgICAvLyB7c3VjY2VzcywgZGF0YToge3Jlc3VsdCwgbWVzc2FnZTogJ1NjcmlwdCBleGVjdXRlZCBzdWNjZXNzZnVsbHknfX1cbiAgICAvLyBzbyBvbGRlciBjYWxsZXJzIHJlYWRpbmcgZGF0YS5tZXNzYWdlIGtlZXAgd29ya2luZy5cbiAgICBwcml2YXRlIGFzeW5jIGV4ZWN1dGVTY3JpcHRDb21wYXQoc2NyaXB0OiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBvdXQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVKYXZhU2NyaXB0KHNjcmlwdCwgJ3NjZW5lJyk7XG4gICAgICAgIGlmIChvdXQuc3VjY2VzcyAmJiBvdXQuZGF0YSAmJiAncmVzdWx0JyBpbiBvdXQuZGF0YSkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0OiBvdXQuZGF0YS5yZXN1bHQsXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdTY3JpcHQgZXhlY3V0ZWQgc3VjY2Vzc2Z1bGx5JyxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gb3V0O1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgY2xlYXJDb25zb2xlKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBOb3RlOiBFZGl0b3IuTWVzc2FnZS5zZW5kIG1heSBub3QgcmV0dXJuIGEgcHJvbWlzZSBpbiBhbGwgdmVyc2lvbnNcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnNlbmQoJ2NvbnNvbGUnLCAnY2xlYXInKTtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiAnQ29uc29sZSBjbGVhcmVkIHN1Y2Nlc3NmdWxseSdcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVyci5tZXNzYWdlIH07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGV4ZWN1dGVKYXZhU2NyaXB0KGNvZGU6IHN0cmluZywgY29udGV4dDogJ3NjZW5lJyB8ICdlZGl0b3InKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgaWYgKGNvbnRleHQgPT09ICdzY2VuZScpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmV4ZWN1dGVJblNjZW5lQ29udGV4dChjb2RlKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoY29udGV4dCA9PT0gJ2VkaXRvcicpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmV4ZWN1dGVJbkVkaXRvckNvbnRleHQoY29kZSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgVW5rbm93biBleGVjdXRlX2phdmFzY3JpcHQgY29udGV4dDogJHtjb250ZXh0fWAgfTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGV4ZWN1dGVJblNjZW5lQ29udGV4dChjb2RlOiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ2V4ZWN1dGUtc2NlbmUtc2NyaXB0Jywge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdjb25zb2xlJyxcbiAgICAgICAgICAgICAgICBtZXRob2Q6ICdldmFsJyxcbiAgICAgICAgICAgICAgICBhcmdzOiBbY29kZV1cbiAgICAgICAgICAgIH0pLnRoZW4oKHJlc3VsdDogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRleHQ6ICdzY2VuZScsXG4gICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQ6IHJlc3VsdCxcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogJ1NjZW5lIHNjcmlwdCBleGVjdXRlZCBzdWNjZXNzZnVsbHknXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVyci5tZXNzYWdlIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZXhlY3V0ZUluRWRpdG9yQ29udGV4dChjb2RlOiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBpZiAoIWlzRWRpdG9yQ29udGV4dEV2YWxFbmFibGVkKCkpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgZXJyb3I6ICdFZGl0b3IgY29udGV4dCBldmFsIGlzIGRpc2FibGVkLiBFbmFibGUgYGVuYWJsZUVkaXRvckNvbnRleHRFdmFsYCBpbiBNQ1Agc2VydmVyIHNldHRpbmdzIChwYW5lbCBVSSkgdG8gb3B0IGluLiBUaGlzIGdyYW50cyBBSS1nZW5lcmF0ZWQgY29kZSBhY2Nlc3MgdG8gRWRpdG9yLk1lc3NhZ2UgKyBOb2RlIGZzIEFQSXMgaW4gdGhlIGhvc3QgcHJvY2Vzczsgb25seSBlbmFibGUgd2hlbiB5b3UgdHJ1c3QgdGhlIHVwc3RyZWFtIHByb21wdCBzb3VyY2UuJyxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIFdyYXAgaW4gYXN5bmMgSUlGRSBzbyBBSSBjYW4gdXNlIHRvcC1sZXZlbCBhd2FpdCB0cmFuc3BhcmVudGx5O1xuICAgICAgICAgICAgLy8gYWxzbyBnaXZlcyB1cyBhIGNsZWFuIFByb21pc2UtYmFzZWQgcmV0dXJuIHBhdGggcmVnYXJkbGVzcyBvZlxuICAgICAgICAgICAgLy8gd2hldGhlciB0aGUgdXNlciBjb2RlIHJldHVybnMgYSBQcm9taXNlIG9yIGEgc3luYyB2YWx1ZS5cbiAgICAgICAgICAgIGNvbnN0IHdyYXBwZWQgPSBgKGFzeW5jICgpID0+IHsgJHtjb2RlfSBcXG4gfSkoKWA7XG4gICAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tZXZhbFxuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgKDAsIGV2YWwpKHdyYXBwZWQpO1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgY29udGV4dDogJ2VkaXRvcicsXG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdDogcmVzdWx0LFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogJ0VkaXRvciBzY3JpcHQgZXhlY3V0ZWQgc3VjY2Vzc2Z1bGx5JyxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgIGVycm9yOiBgRWRpdG9yIGV2YWwgZmFpbGVkOiAke2Vycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKX1gLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2V0Tm9kZVRyZWUocm9vdFV1aWQ/OiBzdHJpbmcsIG1heERlcHRoOiBudW1iZXIgPSAxMCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgYnVpbGRUcmVlID0gYXN5bmMgKG5vZGVVdWlkOiBzdHJpbmcsIGRlcHRoOiBudW1iZXIgPSAwKTogUHJvbWlzZTxhbnk+ID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZGVwdGggPj0gbWF4RGVwdGgpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgdHJ1bmNhdGVkOiB0cnVlIH07XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgbm9kZURhdGEgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1ub2RlJywgbm9kZVV1aWQpO1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdHJlZSA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IG5vZGVEYXRhLnV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBuYW1lOiBub2RlRGF0YS5uYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgYWN0aXZlOiBub2RlRGF0YS5hY3RpdmUsXG4gICAgICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRzOiAobm9kZURhdGEgYXMgYW55KS5jb21wb25lbnRzID8gKG5vZGVEYXRhIGFzIGFueSkuY29tcG9uZW50cy5tYXAoKGM6IGFueSkgPT4gYy5fX3R5cGVfXykgOiBbXSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNoaWxkQ291bnQ6IG5vZGVEYXRhLmNoaWxkcmVuID8gbm9kZURhdGEuY2hpbGRyZW4ubGVuZ3RoIDogMCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNoaWxkcmVuOiBbXSBhcyBhbnlbXVxuICAgICAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChub2RlRGF0YS5jaGlsZHJlbiAmJiBub2RlRGF0YS5jaGlsZHJlbi5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGNoaWxkSWQgb2Ygbm9kZURhdGEuY2hpbGRyZW4pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjaGlsZFRyZWUgPSBhd2FpdCBidWlsZFRyZWUoY2hpbGRJZCwgZGVwdGggKyAxKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0cmVlLmNoaWxkcmVuLnB1c2goY2hpbGRUcmVlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0cmVlO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7IGVycm9yOiBlcnIubWVzc2FnZSB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGlmIChyb290VXVpZCkge1xuICAgICAgICAgICAgICAgIGJ1aWxkVHJlZShyb290VXVpZCkudGhlbih0cmVlID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IHRyZWUgfSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LWhpZXJhcmNoeScpLnRoZW4oYXN5bmMgKGhpZXJhcmNoeTogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRyZWVzID0gW107XG4gICAgICAgICAgICAgICAgICAgIGZvciAoY29uc3Qgcm9vdE5vZGUgb2YgaGllcmFyY2h5LmNoaWxkcmVuKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB0cmVlID0gYXdhaXQgYnVpbGRUcmVlKHJvb3ROb2RlLnV1aWQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdHJlZXMucHVzaCh0cmVlKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogdHJlZXMgfSk7XG4gICAgICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2V0UGVyZm9ybWFuY2VTdGF0cygpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LXBlcmZvcm1hbmNlJykudGhlbigoc3RhdHM6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHBlcmZTdGF0czogUGVyZm9ybWFuY2VTdGF0cyA9IHtcbiAgICAgICAgICAgICAgICAgICAgbm9kZUNvdW50OiBzdGF0cy5ub2RlQ291bnQgfHwgMCxcbiAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50Q291bnQ6IHN0YXRzLmNvbXBvbmVudENvdW50IHx8IDAsXG4gICAgICAgICAgICAgICAgICAgIGRyYXdDYWxsczogc3RhdHMuZHJhd0NhbGxzIHx8IDAsXG4gICAgICAgICAgICAgICAgICAgIHRyaWFuZ2xlczogc3RhdHMudHJpYW5nbGVzIHx8IDAsXG4gICAgICAgICAgICAgICAgICAgIG1lbW9yeTogc3RhdHMubWVtb3J5IHx8IHt9XG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogcGVyZlN0YXRzIH0pO1xuICAgICAgICAgICAgfSkuY2F0Y2goKCkgPT4ge1xuICAgICAgICAgICAgICAgIC8vIEZhbGxiYWNrIHRvIGJhc2ljIHN0YXRzXG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdQZXJmb3JtYW5jZSBzdGF0cyBub3QgYXZhaWxhYmxlIGluIGVkaXQgbW9kZSdcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgdmFsaWRhdGVTY2VuZShvcHRpb25zOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBpc3N1ZXM6IFZhbGlkYXRpb25Jc3N1ZVtdID0gW107XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIENoZWNrIGZvciBtaXNzaW5nIGFzc2V0c1xuICAgICAgICAgICAgaWYgKG9wdGlvbnMuY2hlY2tNaXNzaW5nQXNzZXRzKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgYXNzZXRDaGVjayA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ2NoZWNrLW1pc3NpbmctYXNzZXRzJyk7XG4gICAgICAgICAgICAgICAgaWYgKGFzc2V0Q2hlY2sgJiYgYXNzZXRDaGVjay5taXNzaW5nKSB7XG4gICAgICAgICAgICAgICAgICAgIGlzc3Vlcy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6ICdlcnJvcicsXG4gICAgICAgICAgICAgICAgICAgICAgICBjYXRlZ29yeTogJ2Fzc2V0cycsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgRm91bmQgJHthc3NldENoZWNrLm1pc3NpbmcubGVuZ3RofSBtaXNzaW5nIGFzc2V0IHJlZmVyZW5jZXNgLFxuICAgICAgICAgICAgICAgICAgICAgICAgZGV0YWlsczogYXNzZXRDaGVjay5taXNzaW5nXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gQ2hlY2sgZm9yIHBlcmZvcm1hbmNlIGlzc3Vlc1xuICAgICAgICAgICAgaWYgKG9wdGlvbnMuY2hlY2tQZXJmb3JtYW5jZSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGhpZXJhcmNoeSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LWhpZXJhcmNoeScpO1xuICAgICAgICAgICAgICAgIGNvbnN0IG5vZGVDb3VudCA9IHRoaXMuY291bnROb2RlcyhoaWVyYXJjaHkuY2hpbGRyZW4pO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGlmIChub2RlQ291bnQgPiAxMDAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGlzc3Vlcy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6ICd3YXJuaW5nJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhdGVnb3J5OiAncGVyZm9ybWFuY2UnLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYEhpZ2ggbm9kZSBjb3VudDogJHtub2RlQ291bnR9IG5vZGVzIChyZWNvbW1lbmRlZCA8IDEwMDApYCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHN1Z2dlc3Rpb246ICdDb25zaWRlciB1c2luZyBvYmplY3QgcG9vbGluZyBvciBzY2VuZSBvcHRpbWl6YXRpb24nXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgcmVzdWx0OiBWYWxpZGF0aW9uUmVzdWx0ID0ge1xuICAgICAgICAgICAgICAgIHZhbGlkOiBpc3N1ZXMubGVuZ3RoID09PSAwLFxuICAgICAgICAgICAgICAgIGlzc3VlQ291bnQ6IGlzc3Vlcy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgaXNzdWVzOiBpc3N1ZXNcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IHJlc3VsdCB9O1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnIubWVzc2FnZSB9O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBjb3VudE5vZGVzKG5vZGVzOiBhbnlbXSk6IG51bWJlciB7XG4gICAgICAgIGxldCBjb3VudCA9IG5vZGVzLmxlbmd0aDtcbiAgICAgICAgZm9yIChjb25zdCBub2RlIG9mIG5vZGVzKSB7XG4gICAgICAgICAgICBpZiAobm9kZS5jaGlsZHJlbikge1xuICAgICAgICAgICAgICAgIGNvdW50ICs9IHRoaXMuY291bnROb2Rlcyhub2RlLmNoaWxkcmVuKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gY291bnQ7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRFZGl0b3JJbmZvKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IGluZm8gPSB7XG4gICAgICAgICAgICBlZGl0b3I6IHtcbiAgICAgICAgICAgICAgICB2ZXJzaW9uOiAoRWRpdG9yIGFzIGFueSkudmVyc2lvbnM/LmVkaXRvciB8fCAnVW5rbm93bicsXG4gICAgICAgICAgICAgICAgY29jb3NWZXJzaW9uOiAoRWRpdG9yIGFzIGFueSkudmVyc2lvbnM/LmNvY29zIHx8ICdVbmtub3duJyxcbiAgICAgICAgICAgICAgICBwbGF0Zm9ybTogcHJvY2Vzcy5wbGF0Zm9ybSxcbiAgICAgICAgICAgICAgICBhcmNoOiBwcm9jZXNzLmFyY2gsXG4gICAgICAgICAgICAgICAgbm9kZVZlcnNpb246IHByb2Nlc3MudmVyc2lvblxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHByb2plY3Q6IHtcbiAgICAgICAgICAgICAgICBuYW1lOiBFZGl0b3IuUHJvamVjdC5uYW1lLFxuICAgICAgICAgICAgICAgIHBhdGg6IEVkaXRvci5Qcm9qZWN0LnBhdGgsXG4gICAgICAgICAgICAgICAgdXVpZDogRWRpdG9yLlByb2plY3QudXVpZFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIG1lbW9yeTogcHJvY2Vzcy5tZW1vcnlVc2FnZSgpLFxuICAgICAgICAgICAgdXB0aW1lOiBwcm9jZXNzLnVwdGltZSgpXG4gICAgICAgIH07XG5cbiAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogaW5mbyB9O1xuICAgIH1cblxuICAgIHByaXZhdGUgcmVzb2x2ZVByb2plY3RMb2dQYXRoKCk6IHsgcGF0aDogc3RyaW5nIH0gfCB7IGVycm9yOiBzdHJpbmcgfSB7XG4gICAgICAgIGlmICghRWRpdG9yLlByb2plY3QgfHwgIUVkaXRvci5Qcm9qZWN0LnBhdGgpIHtcbiAgICAgICAgICAgIHJldHVybiB7IGVycm9yOiAnRWRpdG9yLlByb2plY3QucGF0aCBpcyBub3QgYXZhaWxhYmxlOyBjYW5ub3QgbG9jYXRlIHByb2plY3QgbG9nIGZpbGUuJyB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGxvZ1BhdGggPSBwYXRoLmpvaW4oRWRpdG9yLlByb2plY3QucGF0aCwgJ3RlbXAvbG9ncy9wcm9qZWN0LmxvZycpO1xuICAgICAgICBpZiAoIWZzLmV4aXN0c1N5bmMobG9nUGF0aCkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IGVycm9yOiBgUHJvamVjdCBsb2cgZmlsZSBub3QgZm91bmQgYXQgJHtsb2dQYXRofWAgfTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4geyBwYXRoOiBsb2dQYXRoIH07XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRQcm9qZWN0TG9ncyhsaW5lczogbnVtYmVyID0gMTAwLCBmaWx0ZXJLZXl3b3JkPzogc3RyaW5nLCBsb2dMZXZlbDogc3RyaW5nID0gJ0FMTCcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcmVzb2x2ZWQgPSB0aGlzLnJlc29sdmVQcm9qZWN0TG9nUGF0aCgpO1xuICAgICAgICAgICAgaWYgKCdlcnJvcicgaW4gcmVzb2x2ZWQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHJlc29sdmVkLmVycm9yIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBsb2dGaWxlUGF0aCA9IHJlc29sdmVkLnBhdGg7XG5cbiAgICAgICAgICAgIC8vIFJlYWQgdGhlIGZpbGUgY29udGVudFxuICAgICAgICAgICAgY29uc3QgbG9nQ29udGVudCA9IGZzLnJlYWRGaWxlU3luYyhsb2dGaWxlUGF0aCwgJ3V0ZjgnKTtcbiAgICAgICAgICAgIGNvbnN0IGxvZ0xpbmVzID0gbG9nQ29udGVudC5zcGxpdCgnXFxuJykuZmlsdGVyKGxpbmUgPT4gbGluZS50cmltKCkgIT09ICcnKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gR2V0IHRoZSBsYXN0IE4gbGluZXNcbiAgICAgICAgICAgIGNvbnN0IHJlY2VudExpbmVzID0gbG9nTGluZXMuc2xpY2UoLWxpbmVzKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gQXBwbHkgZmlsdGVyc1xuICAgICAgICAgICAgbGV0IGZpbHRlcmVkTGluZXMgPSByZWNlbnRMaW5lcztcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gRmlsdGVyIGJ5IGxvZyBsZXZlbCBpZiBub3QgJ0FMTCdcbiAgICAgICAgICAgIGlmIChsb2dMZXZlbCAhPT0gJ0FMTCcpIHtcbiAgICAgICAgICAgICAgICBmaWx0ZXJlZExpbmVzID0gZmlsdGVyZWRMaW5lcy5maWx0ZXIobGluZSA9PiBcbiAgICAgICAgICAgICAgICAgICAgbGluZS5pbmNsdWRlcyhgWyR7bG9nTGV2ZWx9XWApIHx8IGxpbmUuaW5jbHVkZXMobG9nTGV2ZWwudG9Mb3dlckNhc2UoKSlcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBGaWx0ZXIgYnkga2V5d29yZCBpZiBwcm92aWRlZFxuICAgICAgICAgICAgaWYgKGZpbHRlcktleXdvcmQpIHtcbiAgICAgICAgICAgICAgICBmaWx0ZXJlZExpbmVzID0gZmlsdGVyZWRMaW5lcy5maWx0ZXIobGluZSA9PiBcbiAgICAgICAgICAgICAgICAgICAgbGluZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKGZpbHRlcktleXdvcmQudG9Mb3dlckNhc2UoKSlcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICB0b3RhbExpbmVzOiBsb2dMaW5lcy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgIHJlcXVlc3RlZExpbmVzOiBsaW5lcyxcbiAgICAgICAgICAgICAgICAgICAgZmlsdGVyZWRMaW5lczogZmlsdGVyZWRMaW5lcy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgIGxvZ0xldmVsOiBsb2dMZXZlbCxcbiAgICAgICAgICAgICAgICAgICAgZmlsdGVyS2V5d29yZDogZmlsdGVyS2V5d29yZCB8fCBudWxsLFxuICAgICAgICAgICAgICAgICAgICBsb2dzOiBmaWx0ZXJlZExpbmVzLFxuICAgICAgICAgICAgICAgICAgICBsb2dGaWxlUGF0aDogbG9nRmlsZVBhdGhcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgIGVycm9yOiBgRmFpbGVkIHRvIHJlYWQgcHJvamVjdCBsb2dzOiAke2Vycm9yLm1lc3NhZ2V9YFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2V0TG9nRmlsZUluZm8oKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJlc29sdmVkID0gdGhpcy5yZXNvbHZlUHJvamVjdExvZ1BhdGgoKTtcbiAgICAgICAgICAgIGlmICgnZXJyb3InIGluIHJlc29sdmVkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiByZXNvbHZlZC5lcnJvciB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgbG9nRmlsZVBhdGggPSByZXNvbHZlZC5wYXRoO1xuXG4gICAgICAgICAgICBjb25zdCBzdGF0cyA9IGZzLnN0YXRTeW5jKGxvZ0ZpbGVQYXRoKTtcbiAgICAgICAgICAgIGNvbnN0IGxvZ0NvbnRlbnQgPSBmcy5yZWFkRmlsZVN5bmMobG9nRmlsZVBhdGgsICd1dGY4Jyk7XG4gICAgICAgICAgICBjb25zdCBsaW5lQ291bnQgPSBsb2dDb250ZW50LnNwbGl0KCdcXG4nKS5maWx0ZXIobGluZSA9PiBsaW5lLnRyaW0oKSAhPT0gJycpLmxlbmd0aDtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgZmlsZVBhdGg6IGxvZ0ZpbGVQYXRoLFxuICAgICAgICAgICAgICAgICAgICBmaWxlU2l6ZTogc3RhdHMuc2l6ZSxcbiAgICAgICAgICAgICAgICAgICAgZmlsZVNpemVGb3JtYXR0ZWQ6IHRoaXMuZm9ybWF0RmlsZVNpemUoc3RhdHMuc2l6ZSksXG4gICAgICAgICAgICAgICAgICAgIGxhc3RNb2RpZmllZDogc3RhdHMubXRpbWUudG9JU09TdHJpbmcoKSxcbiAgICAgICAgICAgICAgICAgICAgbGluZUNvdW50OiBsaW5lQ291bnQsXG4gICAgICAgICAgICAgICAgICAgIGNyZWF0ZWQ6IHN0YXRzLmJpcnRodGltZS50b0lTT1N0cmluZygpLFxuICAgICAgICAgICAgICAgICAgICBhY2Nlc3NpYmxlOiBmcy5jb25zdGFudHMuUl9PS1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgZXJyb3I6IGBGYWlsZWQgdG8gZ2V0IGxvZyBmaWxlIGluZm86ICR7ZXJyb3IubWVzc2FnZX1gXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBzZWFyY2hQcm9qZWN0TG9ncyhwYXR0ZXJuOiBzdHJpbmcsIG1heFJlc3VsdHM6IG51bWJlciA9IDIwLCBjb250ZXh0TGluZXM6IG51bWJlciA9IDIpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcmVzb2x2ZWQgPSB0aGlzLnJlc29sdmVQcm9qZWN0TG9nUGF0aCgpO1xuICAgICAgICAgICAgaWYgKCdlcnJvcicgaW4gcmVzb2x2ZWQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHJlc29sdmVkLmVycm9yIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBsb2dGaWxlUGF0aCA9IHJlc29sdmVkLnBhdGg7XG5cbiAgICAgICAgICAgIGNvbnN0IGxvZ0NvbnRlbnQgPSBmcy5yZWFkRmlsZVN5bmMobG9nRmlsZVBhdGgsICd1dGY4Jyk7XG4gICAgICAgICAgICBjb25zdCBsb2dMaW5lcyA9IGxvZ0NvbnRlbnQuc3BsaXQoJ1xcbicpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBDcmVhdGUgcmVnZXggcGF0dGVybiAoc3VwcG9ydCBib3RoIHN0cmluZyBhbmQgcmVnZXggcGF0dGVybnMpXG4gICAgICAgICAgICBsZXQgcmVnZXg6IFJlZ0V4cDtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgcmVnZXggPSBuZXcgUmVnRXhwKHBhdHRlcm4sICdnaScpO1xuICAgICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICAgICAgLy8gSWYgcGF0dGVybiBpcyBub3QgdmFsaWQgcmVnZXgsIHRyZWF0IGFzIGxpdGVyYWwgc3RyaW5nXG4gICAgICAgICAgICAgICAgcmVnZXggPSBuZXcgUmVnRXhwKHBhdHRlcm4ucmVwbGFjZSgvWy4qKz9eJHt9KCl8W1xcXVxcXFxdL2csICdcXFxcJCYnKSwgJ2dpJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGNvbnN0IG1hdGNoZXM6IGFueVtdID0gW107XG4gICAgICAgICAgICBsZXQgcmVzdWx0Q291bnQgPSAwO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGxvZ0xpbmVzLmxlbmd0aCAmJiByZXN1bHRDb3VudCA8IG1heFJlc3VsdHM7IGkrKykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGxpbmUgPSBsb2dMaW5lc1tpXTtcbiAgICAgICAgICAgICAgICBpZiAocmVnZXgudGVzdChsaW5lKSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBHZXQgY29udGV4dCBsaW5lc1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjb250ZXh0U3RhcnQgPSBNYXRoLm1heCgwLCBpIC0gY29udGV4dExpbmVzKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY29udGV4dEVuZCA9IE1hdGgubWluKGxvZ0xpbmVzLmxlbmd0aCAtIDEsIGkgKyBjb250ZXh0TGluZXMpO1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY29udGV4dExpbmVzQXJyYXkgPSBbXTtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaiA9IGNvbnRleHRTdGFydDsgaiA8PSBjb250ZXh0RW5kOyBqKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRleHRMaW5lc0FycmF5LnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxpbmVOdW1iZXI6IGogKyAxLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRlbnQ6IGxvZ0xpbmVzW2pdLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlzTWF0Y2g6IGogPT09IGlcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICBtYXRjaGVzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgbGluZU51bWJlcjogaSArIDEsXG4gICAgICAgICAgICAgICAgICAgICAgICBtYXRjaGVkTGluZTogbGluZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRleHQ6IGNvbnRleHRMaW5lc0FycmF5XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0Q291bnQrKztcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIC8vIFJlc2V0IHJlZ2V4IGxhc3RJbmRleCBmb3IgZ2xvYmFsIHNlYXJjaFxuICAgICAgICAgICAgICAgICAgICByZWdleC5sYXN0SW5kZXggPSAwO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgcGF0dGVybjogcGF0dGVybixcbiAgICAgICAgICAgICAgICAgICAgdG90YWxNYXRjaGVzOiBtYXRjaGVzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgbWF4UmVzdWx0czogbWF4UmVzdWx0cyxcbiAgICAgICAgICAgICAgICAgICAgY29udGV4dExpbmVzOiBjb250ZXh0TGluZXMsXG4gICAgICAgICAgICAgICAgICAgIGxvZ0ZpbGVQYXRoOiBsb2dGaWxlUGF0aCxcbiAgICAgICAgICAgICAgICAgICAgbWF0Y2hlczogbWF0Y2hlc1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgZXJyb3I6IGBGYWlsZWQgdG8gc2VhcmNoIHByb2plY3QgbG9nczogJHtlcnJvci5tZXNzYWdlfWBcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGZvcm1hdEZpbGVTaXplKGJ5dGVzOiBudW1iZXIpOiBzdHJpbmcge1xuICAgICAgICBjb25zdCB1bml0cyA9IFsnQicsICdLQicsICdNQicsICdHQiddO1xuICAgICAgICBsZXQgc2l6ZSA9IGJ5dGVzO1xuICAgICAgICBsZXQgdW5pdEluZGV4ID0gMDtcblxuICAgICAgICB3aGlsZSAoc2l6ZSA+PSAxMDI0ICYmIHVuaXRJbmRleCA8IHVuaXRzLmxlbmd0aCAtIDEpIHtcbiAgICAgICAgICAgIHNpemUgLz0gMTAyNDtcbiAgICAgICAgICAgIHVuaXRJbmRleCsrO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGAke3NpemUudG9GaXhlZCgyKX0gJHt1bml0c1t1bml0SW5kZXhdfWA7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBwaWNrV2luZG93KHRpdGxlU3Vic3RyaW5nPzogc3RyaW5nKTogYW55IHtcbiAgICAgICAgLy8gTGF6eSByZXF1aXJlIHNvIHRoYXQgbm9uLUVsZWN0cm9uIGNvbnRleHRzIChlLmcuIHVuaXQgdGVzdHMsIHNtb2tlXG4gICAgICAgIC8vIHNjcmlwdCB3aXRoIHN0dWIgcmVnaXN0cnkpIGNhbiBzdGlsbCBpbXBvcnQgdGhpcyBtb2R1bGUuXG4gICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tdmFyLXJlcXVpcmVzXG4gICAgICAgIGNvbnN0IGVsZWN0cm9uID0gcmVxdWlyZSgnZWxlY3Ryb24nKTtcbiAgICAgICAgY29uc3QgQlcgPSBlbGVjdHJvbi5Ccm93c2VyV2luZG93O1xuICAgICAgICBpZiAoIUJXKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0VsZWN0cm9uIEJyb3dzZXJXaW5kb3cgQVBJIHVuYXZhaWxhYmxlOyBzY3JlZW5zaG90IHRvb2wgcmVxdWlyZXMgcnVubmluZyBpbnNpZGUgQ29jb3MgZWRpdG9yIGhvc3QgcHJvY2Vzcy4nKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGl0bGVTdWJzdHJpbmcpIHtcbiAgICAgICAgICAgIGNvbnN0IG1hdGNoZXMgPSBCVy5nZXRBbGxXaW5kb3dzKCkuZmlsdGVyKCh3OiBhbnkpID0+XG4gICAgICAgICAgICAgICAgdyAmJiAhdy5pc0Rlc3Ryb3llZCgpICYmICh3LmdldFRpdGxlPy4oKSB8fCAnJykuaW5jbHVkZXModGl0bGVTdWJzdHJpbmcpKTtcbiAgICAgICAgICAgIGlmIChtYXRjaGVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgTm8gRWxlY3Ryb24gd2luZG93IHRpdGxlIG1hdGNoZWQgc3Vic3RyaW5nOiAke3RpdGxlU3Vic3RyaW5nfWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIG1hdGNoZXNbMF07XG4gICAgICAgIH1cbiAgICAgICAgLy8gdjIuMy4xIHJldmlldyBmaXg6IGZvY3VzZWQgd2luZG93IG1heSBiZSBhIHRyYW5zaWVudCBwcmV2aWV3IHBvcHVwLlxuICAgICAgICAvLyBQcmVmZXIgYSBub24tUHJldmlldyB3aW5kb3cgc28gZGVmYXVsdCBzY3JlZW5zaG90cyB0YXJnZXQgdGhlIG1haW5cbiAgICAgICAgLy8gZWRpdG9yIHN1cmZhY2UuIENhbGxlciBjYW4gc3RpbGwgcGFzcyB0aXRsZVN1YnN0cmluZz0nUHJldmlldycgdG9cbiAgICAgICAgLy8gZXhwbGljaXRseSB0YXJnZXQgdGhlIHByZXZpZXcgd2hlbiB3YW50ZWQuXG4gICAgICAgIGNvbnN0IGFsbDogYW55W10gPSBCVy5nZXRBbGxXaW5kb3dzKCkuZmlsdGVyKCh3OiBhbnkpID0+IHcgJiYgIXcuaXNEZXN0cm95ZWQoKSk7XG4gICAgICAgIGlmIChhbGwubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIGxpdmUgRWxlY3Ryb24gd2luZG93czsgY2Fubm90IGNhcHR1cmUgc2NyZWVuc2hvdC4nKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBpc1ByZXZpZXcgPSAodzogYW55KSA9PiAvcHJldmlldy9pLnRlc3Qody5nZXRUaXRsZT8uKCkgfHwgJycpO1xuICAgICAgICBjb25zdCBub25QcmV2aWV3ID0gYWxsLmZpbHRlcigodzogYW55KSA9PiAhaXNQcmV2aWV3KHcpKTtcbiAgICAgICAgY29uc3QgZm9jdXNlZCA9IEJXLmdldEZvY3VzZWRXaW5kb3c/LigpO1xuICAgICAgICBpZiAoZm9jdXNlZCAmJiAhZm9jdXNlZC5pc0Rlc3Ryb3llZCgpICYmICFpc1ByZXZpZXcoZm9jdXNlZCkpIHJldHVybiBmb2N1c2VkO1xuICAgICAgICBpZiAobm9uUHJldmlldy5sZW5ndGggPiAwKSByZXR1cm4gbm9uUHJldmlld1swXTtcbiAgICAgICAgcmV0dXJuIGFsbFswXTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGVuc3VyZUNhcHR1cmVEaXIoKTogeyBvazogdHJ1ZTsgZGlyOiBzdHJpbmcgfSB8IHsgb2s6IGZhbHNlOyBlcnJvcjogc3RyaW5nIH0ge1xuICAgICAgICBpZiAoIUVkaXRvci5Qcm9qZWN0IHx8ICFFZGl0b3IuUHJvamVjdC5wYXRoKSB7XG4gICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiAnRWRpdG9yLlByb2plY3QucGF0aCBpcyBub3QgYXZhaWxhYmxlOyBjYW5ub3QgcmVzb2x2ZSBjYXB0dXJlIG91dHB1dCBkaXJlY3RvcnkuJyB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGRpciA9IHBhdGguam9pbihFZGl0b3IuUHJvamVjdC5wYXRoLCAndGVtcCcsICdtY3AtY2FwdHVyZXMnKTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGZzLm1rZGlyU3luYyhkaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgICAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUsIGRpciB9O1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogYEZhaWxlZCB0byBjcmVhdGUgY2FwdHVyZSBkaXI6ICR7ZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpfWAgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIHYyLjguMCBULVYyOC0yIChjYXJyeW92ZXIgZnJvbSB2Mi43LjAgQ29kZXggc2luZ2xlLXJldmlld2VyIPCfn6EpOlxuICAgIC8vIG1pcnJvciB0aGUgdjIuNi4xIHBlcnNpc3RHYW1lU2NyZWVuc2hvdCByZWFscGF0aCBjb250YWlubWVudCBjaGVjayBvblxuICAgIC8vIGV2ZXJ5IGF1dG8tbmFtZWQgc2F2ZSBwYXRoLiBDYWxsZXIgcGFzc2VzIGEgYmFzZW5hbWUgdGhhdCBnZXRzIGpvaW5lZFxuICAgIC8vIHVuZGVyIHRoZSBwcm9qZWN0LXJvb3RlZCBjYXB0dXJlIGRpcjsgdGhlIHJlc29sdmVkIHBhcmVudCBtdXN0IGVxdWFsXG4gICAgLy8gdGhlIHJlc29sdmVkIGRpciwgb3RoZXJ3aXNlIHdlIHJlamVjdCBiZWZvcmUgd3JpdGluZy4gUHJvdGVjdHMgYWdhaW5zdFxuICAgIC8vIHRoZSB0ZW1wL21jcC1jYXB0dXJlcyBwYXRoIGJlaW5nIGEgc3ltbGluayBjaGFpbiB0aGF0IGVzY2FwZXMgdGhlXG4gICAgLy8gcHJvamVjdCB0cmVlIChyYXJlIGJ1dCBjaGVhcCB0byBndWFyZCkuXG4gICAgLy9cbiAgICAvLyBSZXR1cm5zIHsgb2s6IHRydWUsIGZpbGVQYXRoLCBkaXIgfSB3aGVuIHNhZmUgdG8gd3JpdGUsIG9yXG4gICAgLy8geyBvazogZmFsc2UsIGVycm9yIH0gd2l0aCB0aGUgc2FtZSBlcnJvciBlbnZlbG9wZSBzaGFwZSBhc1xuICAgIC8vIGVuc3VyZUNhcHR1cmVEaXIgc28gY2FsbGVycyBjYW4gZmFsbCB0aHJvdWdoIHRoZWlyIGV4aXN0aW5nXG4gICAgLy8gZXJyb3ItcmV0dXJuIHBhdHRlcm4uXG4gICAgcHJpdmF0ZSByZXNvbHZlQXV0b0NhcHR1cmVGaWxlKGJhc2VuYW1lOiBzdHJpbmcpOiB7IG9rOiB0cnVlOyBmaWxlUGF0aDogc3RyaW5nOyBkaXI6IHN0cmluZyB9IHwgeyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmcgfSB7XG4gICAgICAgIGNvbnN0IGRpclJlc3VsdCA9IHRoaXMuZW5zdXJlQ2FwdHVyZURpcigpO1xuICAgICAgICBpZiAoIWRpclJlc3VsdC5vaykgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogZGlyUmVzdWx0LmVycm9yIH07XG4gICAgICAgIGNvbnN0IGZpbGVQYXRoID0gcGF0aC5qb2luKGRpclJlc3VsdC5kaXIsIGJhc2VuYW1lKTtcbiAgICAgICAgbGV0IHJlYWxEaXI6IHN0cmluZztcbiAgICAgICAgbGV0IHJlYWxQYXJlbnQ6IHN0cmluZztcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJwOiBhbnkgPSBmcy5yZWFscGF0aFN5bmMgYXMgYW55O1xuICAgICAgICAgICAgcmVhbERpciA9IChycC5uYXRpdmUgPz8gcnApKGRpclJlc3VsdC5kaXIpO1xuICAgICAgICAgICAgcmVhbFBhcmVudCA9IChycC5uYXRpdmUgPz8gcnApKHBhdGguZGlybmFtZShmaWxlUGF0aCkpO1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogYHNjcmVlbnNob3QgcGF0aCByZWFscGF0aCBmYWlsZWQ6ICR7ZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpfWAgfTtcbiAgICAgICAgfVxuICAgICAgICBpZiAocGF0aC5yZXNvbHZlKHJlYWxQYXJlbnQpICE9PSBwYXRoLnJlc29sdmUocmVhbERpcikpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6ICdzY3JlZW5zaG90IHNhdmUgcGF0aCByZXNvbHZlZCBvdXRzaWRlIHRoZSBjYXB0dXJlIGRpcmVjdG9yeScgfTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSwgZmlsZVBhdGgsIGRpcjogZGlyUmVzdWx0LmRpciB9O1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgc2NyZWVuc2hvdChzYXZlUGF0aD86IHN0cmluZywgd2luZG93VGl0bGU/OiBzdHJpbmcsIGluY2x1ZGVCYXNlNjQ6IGJvb2xlYW4gPSBmYWxzZSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBsZXQgZmlsZVBhdGggPSBzYXZlUGF0aDtcbiAgICAgICAgICAgIGlmICghZmlsZVBhdGgpIHtcbiAgICAgICAgICAgICAgICBjb25zdCByZXNvbHZlZCA9IHRoaXMucmVzb2x2ZUF1dG9DYXB0dXJlRmlsZShgc2NyZWVuc2hvdC0ke0RhdGUubm93KCl9LnBuZ2ApO1xuICAgICAgICAgICAgICAgIGlmICghcmVzb2x2ZWQub2spIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogcmVzb2x2ZWQuZXJyb3IgfTtcbiAgICAgICAgICAgICAgICBmaWxlUGF0aCA9IHJlc29sdmVkLmZpbGVQYXRoO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3Qgd2luID0gdGhpcy5waWNrV2luZG93KHdpbmRvd1RpdGxlKTtcbiAgICAgICAgICAgIGNvbnN0IGltYWdlID0gYXdhaXQgd2luLndlYkNvbnRlbnRzLmNhcHR1cmVQYWdlKCk7XG4gICAgICAgICAgICBjb25zdCBwbmc6IEJ1ZmZlciA9IGltYWdlLnRvUE5HKCk7XG4gICAgICAgICAgICBmcy53cml0ZUZpbGVTeW5jKGZpbGVQYXRoLCBwbmcpO1xuICAgICAgICAgICAgY29uc3QgZGF0YTogYW55ID0ge1xuICAgICAgICAgICAgICAgIGZpbGVQYXRoLFxuICAgICAgICAgICAgICAgIHNpemU6IHBuZy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgd2luZG93VGl0bGU6IHR5cGVvZiB3aW4uZ2V0VGl0bGUgPT09ICdmdW5jdGlvbicgPyB3aW4uZ2V0VGl0bGUoKSA6ICcnLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGlmIChpbmNsdWRlQmFzZTY0KSB7XG4gICAgICAgICAgICAgICAgZGF0YS5kYXRhVXJpID0gYGRhdGE6aW1hZ2UvcG5nO2Jhc2U2NCwke3BuZy50b1N0cmluZygnYmFzZTY0Jyl9YDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGEsIG1lc3NhZ2U6IGBTY3JlZW5zaG90IHNhdmVkIHRvICR7ZmlsZVBhdGh9YCB9O1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycikgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIHYyLjcuMCAjNDogUHJldmlldy13aW5kb3cgc2NyZWVuc2hvdC4gV3JhcHMgc2NyZWVuc2hvdCgpIHdpdGggYVxuICAgIC8vIFBJRS1mb2N1c2VkIGRlZmF1bHQgdGl0bGUgYW5kIGEgZnJpZW5kbGllciBlcnJvciB3aGVuIG5vIFByZXZpZXdcbiAgICAvLyB3aW5kb3cgZXhpc3RzICh0aGUgdW5kZXJseWluZyBwaWNrV2luZG93IHRocm93cyBcIk5vIEVsZWN0cm9uIHdpbmRvd1xuICAgIC8vIHRpdGxlIG1hdGNoZWRcIiDigJQgdGhhdCBkb2Vzbid0IHRlbGwgQUkgdG8gbGF1bmNoIHByZXZpZXcgZmlyc3QpLlxuICAgIHByaXZhdGUgYXN5bmMgY2FwdHVyZVByZXZpZXdTY3JlZW5zaG90KHNhdmVQYXRoPzogc3RyaW5nLCB3aW5kb3dUaXRsZTogc3RyaW5nID0gJ1ByZXZpZXcnLCBpbmNsdWRlQmFzZTY0OiBib29sZWFuID0gZmFsc2UpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gUHJlLWNoZWNrIHNvIGZhaWx1cmUgbW9kZSBpcyBpbmZvcm1hdGl2ZSwgbm90IHRoZSBnZW5lcmljXG4gICAgICAgICAgICAvLyBcIk5vIEVsZWN0cm9uIHdpbmRvdyB0aXRsZSBtYXRjaGVkXCIgZnJvbSBwaWNrV2luZG93LlxuICAgICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby12YXItcmVxdWlyZXNcbiAgICAgICAgICAgIGNvbnN0IGVsZWN0cm9uID0gcmVxdWlyZSgnZWxlY3Ryb24nKTtcbiAgICAgICAgICAgIGNvbnN0IEJXID0gZWxlY3Ryb24uQnJvd3NlcldpbmRvdztcbiAgICAgICAgICAgIC8vIHYyLjcuMSByZXZpZXcgZml4IChjbGF1ZGUg8J+foSArIGNvZGV4IPCfn6EpOiB3aXRoIHRoZSBkZWZhdWx0XG4gICAgICAgICAgICAvLyB3aW5kb3dUaXRsZT0nUHJldmlldycgYSBDaGluZXNlIC8gbG9jYWxpemVkIGNvY29zIGVkaXRvciB3aG9zZVxuICAgICAgICAgICAgLy8gbWFpbiB3aW5kb3cgdGl0bGUgY29udGFpbnMgXCJQcmV2aWV3XCIgKGUuZy4gXCJDb2NvcyBDcmVhdG9yXG4gICAgICAgICAgICAvLyBQcmV2aWV3IC0gPFByb2plY3ROYW1lPlwiKSB3b3VsZCBmYWxzZWx5IG1hdGNoLiBEaXNhbWJpZ3VhdGVcbiAgICAgICAgICAgIC8vIGJ5IGV4Y2x1ZGluZyBhbnkgdGl0bGUgdGhhdCBBTFNPIGNvbnRhaW5zIFwiQ29jb3MgQ3JlYXRvclwiXG4gICAgICAgICAgICAvLyB3aGVuIHRoZSBjYWxsZXIgc3R1Y2sgd2l0aCB0aGUgZGVmYXVsdCAnUHJldmlldycgZmlsdGVyLlxuICAgICAgICAgICAgLy8gQ2FsbGVyLXByb3ZpZGVkIGN1c3RvbSB3aW5kb3dUaXRsZSBieXBhc3NlcyB0aGUgbmVnYXRpdmVcbiAgICAgICAgICAgIC8vIGZpbHRlciAodGhlaXIgaW50ZW50IGlzIGV4cGxpY2l0KS5cbiAgICAgICAgICAgIGNvbnN0IHVzaW5nRGVmYXVsdCA9IHdpbmRvd1RpdGxlID09PSAnUHJldmlldyc7XG4gICAgICAgICAgICBjb25zdCBtYXRjaGVzID0gQlc/LmdldEFsbFdpbmRvd3M/LigpPy5maWx0ZXIoKHc6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmICghdyB8fCB3LmlzRGVzdHJveWVkKCkpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICBjb25zdCB0aXRsZSA9IHcuZ2V0VGl0bGU/LigpIHx8ICcnO1xuICAgICAgICAgICAgICAgIGlmICghdGl0bGUuaW5jbHVkZXMod2luZG93VGl0bGUpKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgaWYgKHVzaW5nRGVmYXVsdCAmJiAvQ29jb3NcXHMqQ3JlYXRvci9pLnRlc3QodGl0bGUpKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9KSA/PyBbXTtcbiAgICAgICAgICAgIGlmIChtYXRjaGVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICBlcnJvcjogYE5vIEVsZWN0cm9uIHdpbmRvdyB0aXRsZSBjb250YWlucyBcIiR7d2luZG93VGl0bGV9XCIke3VzaW5nRGVmYXVsdCA/ICcgKGFuZCBpcyBub3QgdGhlIG1haW4gZWRpdG9yKScgOiAnJ30uIExhdW5jaCBjb2NvcyBwcmV2aWV3IGZpcnN0IHZpYSB0aGUgdG9vbGJhciBwbGF5IGJ1dHRvbiBvciB2aWEgZGVidWdfcHJldmlld191cmwoYWN0aW9uPVwib3BlblwiKS4gVmlzaWJsZSB3aW5kb3cgdGl0bGVzOiAke1xuICAgICAgICAgICAgICAgICAgICAgICAgQlc/LmdldEFsbFdpbmRvd3M/LigpPy5tYXAoKHc6IGFueSkgPT4gdy5nZXRUaXRsZT8uKCkgPz8gJycpLmZpbHRlcihCb29sZWFuKS5qb2luKCcsICcpID8/ICcobm9uZSknXG4gICAgICAgICAgICAgICAgICAgIH1gLFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyB2Mi43LjEgcmV2aWV3IGZpeCAoY2xhdWRlIPCfn6EgKyBjb2RleCDwn5+hKTogY2FwdHVyZSBmcm9tIHRoZVxuICAgICAgICAgICAgLy8gbWF0Y2hlZCB3aW5kb3cgZGlyZWN0bHkgaW5zdGVhZCBvZiBkZWxlZ2F0aW5nIHRvIHNjcmVlbnNob3QoKVxuICAgICAgICAgICAgLy8g4oaSIHBpY2tXaW5kb3coKSwgd2hpY2ggd291bGQgcmUtcnVuIHRoZSBzdWJzdHJpbmcgZmlsdGVyXG4gICAgICAgICAgICAvLyB3aXRob3V0IG91ciBuZWdhdGl2ZS1lZGl0b3IgaGV1cmlzdGljIGFuZCBjb3VsZCBwaWNrIGFcbiAgICAgICAgICAgIC8vIGRpZmZlcmVudCBtYXRjaC4gVXNlIHRoZSBmaXJzdCBmaWx0ZXJlZCB3aW5kb3cgc28gdGhlXG4gICAgICAgICAgICAvLyBkaXNhbWJpZ3VhdGlvbiBjYW5ub3QgZHJpZnQuXG4gICAgICAgICAgICBjb25zdCB3aW4gPSBtYXRjaGVzWzBdO1xuICAgICAgICAgICAgbGV0IGZpbGVQYXRoID0gc2F2ZVBhdGg7XG4gICAgICAgICAgICBpZiAoIWZpbGVQYXRoKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVzb2x2ZWQgPSB0aGlzLnJlc29sdmVBdXRvQ2FwdHVyZUZpbGUoYHByZXZpZXctJHtEYXRlLm5vdygpfS5wbmdgKTtcbiAgICAgICAgICAgICAgICBpZiAoIXJlc29sdmVkLm9rKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHJlc29sdmVkLmVycm9yIH07XG4gICAgICAgICAgICAgICAgZmlsZVBhdGggPSByZXNvbHZlZC5maWxlUGF0aDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGltYWdlID0gYXdhaXQgd2luLndlYkNvbnRlbnRzLmNhcHR1cmVQYWdlKCk7XG4gICAgICAgICAgICBjb25zdCBwbmc6IEJ1ZmZlciA9IGltYWdlLnRvUE5HKCk7XG4gICAgICAgICAgICBmcy53cml0ZUZpbGVTeW5jKGZpbGVQYXRoLCBwbmcpO1xuICAgICAgICAgICAgY29uc3QgZGF0YTogYW55ID0ge1xuICAgICAgICAgICAgICAgIGZpbGVQYXRoLFxuICAgICAgICAgICAgICAgIHNpemU6IHBuZy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgd2luZG93VGl0bGU6IHR5cGVvZiB3aW4uZ2V0VGl0bGUgPT09ICdmdW5jdGlvbicgPyB3aW4uZ2V0VGl0bGUoKSA6ICcnLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGlmIChpbmNsdWRlQmFzZTY0KSB7XG4gICAgICAgICAgICAgICAgZGF0YS5kYXRhVXJpID0gYGRhdGE6aW1hZ2UvcG5nO2Jhc2U2NCwke3BuZy50b1N0cmluZygnYmFzZTY0Jyl9YDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGEsIG1lc3NhZ2U6IGBQcmV2aWV3IHNjcmVlbnNob3Qgc2F2ZWQgdG8gJHtmaWxlUGF0aH1gIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKSB9O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBiYXRjaFNjcmVlbnNob3Qoc2F2ZVBhdGhQcmVmaXg/OiBzdHJpbmcsIGRlbGF5c01zOiBudW1iZXJbXSA9IFswXSwgd2luZG93VGl0bGU/OiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgbGV0IHByZWZpeCA9IHNhdmVQYXRoUHJlZml4O1xuICAgICAgICAgICAgaWYgKCFwcmVmaXgpIHtcbiAgICAgICAgICAgICAgICAvLyBiYXNlbmFtZSBpcyB0aGUgcHJlZml4IHN0ZW07IHBlci1pdGVyYXRpb24gZmlsZXMgZXh0ZW5kIGl0XG4gICAgICAgICAgICAgICAgLy8gd2l0aCBgLSR7aX0ucG5nYC4gQ29udGFpbm1lbnQgY2hlY2sgb24gdGhlIHByZWZpeCBwYXRoIGlzXG4gICAgICAgICAgICAgICAgLy8gc3VmZmljaWVudCBiZWNhdXNlIHBhdGguam9pbiBwcmVzZXJ2ZXMgZGlybmFtZSBmb3IgYW55XG4gICAgICAgICAgICAgICAgLy8gc3VmZml4IHRoZSBsb29wIGFwcGVuZHMuXG4gICAgICAgICAgICAgICAgY29uc3QgcmVzb2x2ZWQgPSB0aGlzLnJlc29sdmVBdXRvQ2FwdHVyZUZpbGUoYGJhdGNoLSR7RGF0ZS5ub3coKX1gKTtcbiAgICAgICAgICAgICAgICBpZiAoIXJlc29sdmVkLm9rKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHJlc29sdmVkLmVycm9yIH07XG4gICAgICAgICAgICAgICAgcHJlZml4ID0gcmVzb2x2ZWQuZmlsZVBhdGg7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCB3aW4gPSB0aGlzLnBpY2tXaW5kb3cod2luZG93VGl0bGUpO1xuICAgICAgICAgICAgY29uc3QgY2FwdHVyZXM6IGFueVtdID0gW107XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGRlbGF5c01zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZGVsYXkgPSBkZWxheXNNc1tpXTtcbiAgICAgICAgICAgICAgICBpZiAoZGVsYXkgPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCBkZWxheSkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBmaWxlUGF0aCA9IGAke3ByZWZpeH0tJHtpfS5wbmdgO1xuICAgICAgICAgICAgICAgIGNvbnN0IGltYWdlID0gYXdhaXQgd2luLndlYkNvbnRlbnRzLmNhcHR1cmVQYWdlKCk7XG4gICAgICAgICAgICAgICAgY29uc3QgcG5nOiBCdWZmZXIgPSBpbWFnZS50b1BORygpO1xuICAgICAgICAgICAgICAgIGZzLndyaXRlRmlsZVN5bmMoZmlsZVBhdGgsIHBuZyk7XG4gICAgICAgICAgICAgICAgY2FwdHVyZXMucHVzaCh7IGluZGV4OiBpLCBkZWxheU1zOiBkZWxheSwgZmlsZVBhdGgsIHNpemU6IHBuZy5sZW5ndGggfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICBjb3VudDogY2FwdHVyZXMubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICB3aW5kb3dUaXRsZTogdHlwZW9mIHdpbi5nZXRUaXRsZSA9PT0gJ2Z1bmN0aW9uJyA/IHdpbi5nZXRUaXRsZSgpIDogJycsXG4gICAgICAgICAgICAgICAgICAgIGNhcHR1cmVzLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogYENhcHR1cmVkICR7Y2FwdHVyZXMubGVuZ3RofSBzY3JlZW5zaG90c2AsXG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycikgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIHYyLjcuMCAjMzogcHJldmlldy11cmwgLyBxdWVyeS1kZXZpY2VzIGhhbmRsZXJzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gICAgcHJpdmF0ZSBhc3luYyBwcmV2aWV3VXJsKGFjdGlvbjogJ3F1ZXJ5JyB8ICdvcGVuJyA9ICdxdWVyeScpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgdXJsOiBzdHJpbmcgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdwcmV2aWV3JywgJ3F1ZXJ5LXByZXZpZXctdXJsJyBhcyBhbnkpIGFzIGFueTtcbiAgICAgICAgICAgIGlmICghdXJsIHx8IHR5cGVvZiB1cmwgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAncHJldmlldy9xdWVyeS1wcmV2aWV3LXVybCByZXR1cm5lZCBlbXB0eSByZXN1bHQ7IGNoZWNrIHRoYXQgY29jb3MgcHJldmlldyBzZXJ2ZXIgaXMgcnVubmluZycgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGRhdGE6IGFueSA9IHsgdXJsIH07XG4gICAgICAgICAgICBpZiAoYWN0aW9uID09PSAnb3BlbicpIHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAvLyBMYXp5IHJlcXVpcmUgc28gc21va2UgLyBub24tRWxlY3Ryb24gY29udGV4dHMgZG9uJ3QgZmF1bHRcbiAgICAgICAgICAgICAgICAgICAgLy8gb24gbWlzc2luZyBlbGVjdHJvbi5cbiAgICAgICAgICAgICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby12YXItcmVxdWlyZXNcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZWxlY3Ryb24gPSByZXF1aXJlKCdlbGVjdHJvbicpO1xuICAgICAgICAgICAgICAgICAgICAvLyB2Mi43LjEgcmV2aWV3IGZpeCAoY29kZXgg8J+foSArIGdlbWluaSDwn5+hKTogb3BlbkV4dGVybmFsXG4gICAgICAgICAgICAgICAgICAgIC8vIHJlc29sdmVzIHdoZW4gdGhlIE9TIGxhdW5jaGVyIGlzIGludm9rZWQsIG5vdCB3aGVuIHRoZVxuICAgICAgICAgICAgICAgICAgICAvLyBwYWdlIHJlbmRlcnMuIFVzZSBcImxhdW5jaFwiIHdvcmRpbmcgdG8gYXZvaWQgdGhlIEFJXG4gICAgICAgICAgICAgICAgICAgIC8vIG1pc3JlYWRpbmcgXCJvcGVuZWRcIiBhcyBhIGNvbmZpcm1lZCBwYWdlLWxvYWQuXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IGVsZWN0cm9uLnNoZWxsLm9wZW5FeHRlcm5hbCh1cmwpO1xuICAgICAgICAgICAgICAgICAgICBkYXRhLmxhdW5jaGVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgICAgICAgICBkYXRhLmxhdW5jaGVkID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIGRhdGEubGF1bmNoRXJyb3IgPSBlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gUmVmbGVjdCBhY3R1YWwgbGF1bmNoIG91dGNvbWUgaW4gdGhlIHRvcC1sZXZlbCBtZXNzYWdlIHNvIEFJXG4gICAgICAgICAgICAvLyBzZWVzIFwibGF1bmNoIGZhaWxlZFwiIGluc3RlYWQgb2YgbWlzbGVhZGluZyBcIk9wZW5lZCAuLi5cIiB3aGVuXG4gICAgICAgICAgICAvLyBvcGVuRXh0ZXJuYWwgdGhyZXcgKGdlbWluaSDwn5+hKS5cbiAgICAgICAgICAgIGNvbnN0IG1lc3NhZ2UgPSBhY3Rpb24gPT09ICdvcGVuJ1xuICAgICAgICAgICAgICAgID8gKGRhdGEubGF1bmNoZWRcbiAgICAgICAgICAgICAgICAgICAgPyBgTGF1bmNoZWQgJHt1cmx9IGluIGRlZmF1bHQgYnJvd3NlciAocGFnZSByZW5kZXIgbm90IGF3YWl0ZWQpYFxuICAgICAgICAgICAgICAgICAgICA6IGBSZXR1cm5lZCBVUkwgJHt1cmx9IGJ1dCBsYXVuY2ggZmFpbGVkOiAke2RhdGEubGF1bmNoRXJyb3J9YClcbiAgICAgICAgICAgICAgICA6IHVybDtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGEsIG1lc3NhZ2UgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpIH07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyB2Mi44LjAgVC1WMjgtMzogUElFIHBsYXkgLyBzdG9wLiBSb3V0ZXMgdGhyb3VnaCBzY2VuZS1zY3JpcHQgc28gdGhlXG4gICAgLy8gdHlwZWQgY2NlLlNjZW5lRmFjYWRlLmNoYW5nZVByZXZpZXdQbGF5U3RhdGUgaXMgcmVhY2hlZCB2aWEgdGhlXG4gICAgLy8gZG9jdW1lbnRlZCBleGVjdXRlLXNjZW5lLXNjcmlwdCBjaGFubmVsLiBUaGUgSEFORE9GRiBvcmlnaW5hbGx5XG4gICAgLy8gbGlzdGVkIGBzY2VuZS9lZGl0b3ItcHJldmlldy1zZXQtcGxheWAgYXMgYW4gdW5kb2N1bWVudGVkIEVkaXRvclxuICAgIC8vIC5NZXNzYWdlIGNoYW5uZWw7IHdlIGZvdW5kIHRoZSB0eXBlZCBmYWNhZGUgbWV0aG9kIGR1cmluZyBULVYyOC0zXG4gICAgLy8gaW1wbGVtZW50YXRpb24gYW5kIHdlbnQgd2l0aCB0aGF0IGluc3RlYWQuXG4gICAgcHJpdmF0ZSBhc3luYyBwcmV2aWV3Q29udHJvbChvcDogJ3N0YXJ0JyB8ICdzdG9wJyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHN0YXRlID0gb3AgPT09ICdzdGFydCc7XG4gICAgICAgIGNvbnN0IHJlc3VsdDogVG9vbFJlc3BvbnNlID0gYXdhaXQgcnVuU2NlbmVNZXRob2RBc1Rvb2xSZXNwb25zZSgnY2hhbmdlUHJldmlld1BsYXlTdGF0ZScsIFtzdGF0ZV0pO1xuICAgICAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgLi4ucmVzdWx0LFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IHN0YXRlXG4gICAgICAgICAgICAgICAgICAgID8gJ0VudGVyZWQgUHJldmlldy1pbi1FZGl0b3IgcGxheSBtb2RlIChQSUUgd2luZG93IG1heSB0YWtlIGEgbW9tZW50IHRvIGFwcGVhciknXG4gICAgICAgICAgICAgICAgICAgIDogJ0V4aXRlZCBQcmV2aWV3LWluLUVkaXRvciBwbGF5IG1vZGUnLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgcXVlcnlEZXZpY2VzKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBkZXZpY2VzOiBhbnlbXSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2RldmljZScsICdxdWVyeScpIGFzIGFueTtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IHsgZGV2aWNlczogQXJyYXkuaXNBcnJheShkZXZpY2VzKSA/IGRldmljZXMgOiBbXSwgY291bnQ6IEFycmF5LmlzQXJyYXkoZGV2aWNlcykgPyBkZXZpY2VzLmxlbmd0aCA6IDAgfSB9O1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycikgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIHYyLjYuMCBULVYyNi0xOiBHYW1lRGVidWdDbGllbnQgYnJpZGdlIGhhbmRsZXJzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnYW1lQ29tbWFuZCh0eXBlOiBzdHJpbmcsIGFyZ3M6IGFueSwgdGltZW91dE1zOiBudW1iZXIgPSAxMDAwMCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHF1ZXVlZCA9IHF1ZXVlR2FtZUNvbW1hbmQodHlwZSwgYXJncyk7XG4gICAgICAgIGlmICghcXVldWVkLm9rKSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHF1ZXVlZC5lcnJvciB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGF3YWl0ZWQgPSBhd2FpdCBhd2FpdENvbW1hbmRSZXN1bHQocXVldWVkLmlkLCB0aW1lb3V0TXMpO1xuICAgICAgICBpZiAoIWF3YWl0ZWQub2spIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYXdhaXRlZC5lcnJvciB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0ZWQucmVzdWx0O1xuICAgICAgICBpZiAocmVzdWx0LnN1Y2Nlc3MgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHJlc3VsdC5lcnJvciA/PyAnR2FtZURlYnVnQ2xpZW50IHJlcG9ydGVkIGZhaWx1cmUnLCBkYXRhOiByZXN1bHQuZGF0YSB9O1xuICAgICAgICB9XG4gICAgICAgIC8vIEJ1aWx0LWluIHNjcmVlbnNob3QgcGF0aDogY2xpZW50IHNlbmRzIGJhY2sgYSBiYXNlNjQgZGF0YVVybDtcbiAgICAgICAgLy8gbGFuZGluZyB0aGUgYnl0ZXMgdG8gZGlzayBvbiBob3N0IHNpZGUga2VlcHMgdGhlIHJlc3VsdCBlbnZlbG9wZVxuICAgICAgICAvLyBzbWFsbCBhbmQgcmV1c2VzIHRoZSBleGlzdGluZyBwcm9qZWN0LXJvb3RlZCBjYXB0dXJlIGRpciBndWFyZC5cbiAgICAgICAgaWYgKHR5cGUgPT09ICdzY3JlZW5zaG90JyAmJiByZXN1bHQuZGF0YSAmJiB0eXBlb2YgcmVzdWx0LmRhdGEuZGF0YVVybCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIGNvbnN0IHBlcnNpc3RlZCA9IHRoaXMucGVyc2lzdEdhbWVTY3JlZW5zaG90KHJlc3VsdC5kYXRhLmRhdGFVcmwsIHJlc3VsdC5kYXRhLndpZHRoLCByZXN1bHQuZGF0YS5oZWlnaHQpO1xuICAgICAgICAgICAgaWYgKCFwZXJzaXN0ZWQub2spIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHBlcnNpc3RlZC5lcnJvciB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICAgICAgICAgICAgZmlsZVBhdGg6IHBlcnNpc3RlZC5maWxlUGF0aCxcbiAgICAgICAgICAgICAgICAgICAgc2l6ZTogcGVyc2lzdGVkLnNpemUsXG4gICAgICAgICAgICAgICAgICAgIHdpZHRoOiByZXN1bHQuZGF0YS53aWR0aCxcbiAgICAgICAgICAgICAgICAgICAgaGVpZ2h0OiByZXN1bHQuZGF0YS5oZWlnaHQsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiBgR2FtZSBjYW52YXMgY2FwdHVyZWQgdG8gJHtwZXJzaXN0ZWQuZmlsZVBhdGh9YCxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogeyB0eXBlLCAuLi5yZXN1bHQuZGF0YSB9LCBtZXNzYWdlOiBgR2FtZSBjb21tYW5kICR7dHlwZX0gb2tgIH07XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnYW1lQ2xpZW50U3RhdHVzKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IGdldENsaWVudFN0YXR1cygpIH07XG4gICAgfVxuXG4gICAgLy8gdjIuNi4xIHJldmlldyBmaXggKGNvZGV4IPCflLQgKyBjbGF1ZGUgVzEpOiBib3VuZCB0aGUgbGVnaXRpbWF0ZSByYW5nZVxuICAgIC8vIG9mIGEgc2NyZWVuc2hvdCBwYXlsb2FkIGJlZm9yZSBkZWNvZGluZyBzbyBhIG1pc2JlaGF2aW5nIC8gbWFsaWNpb3VzXG4gICAgLy8gY2xpZW50IGNhbm5vdCBmaWxsIGRpc2sgYnkgc3RyZWFtaW5nIGFyYml0cmFyeSBiYXNlNjQgYnl0ZXMuXG4gICAgLy8gMzIgTUIgbWF0Y2hlcyB0aGUgZ2xvYmFsIHJlcXVlc3QtYm9keSBjYXAgaW4gbWNwLXNlcnZlci1zZGsudHMgc29cbiAgICAvLyB0aGUgYm9keSB3b3VsZCBhbHJlYWR5IDQxMyBiZWZvcmUgcmVhY2hpbmcgaGVyZSwgYnV0IGFcbiAgICAvLyBiZWx0LWFuZC1icmFjZXMgY2hlY2sgc3RheXMgY2hlYXAuXG4gICAgcHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgTUFYX0dBTUVfU0NSRUVOU0hPVF9CWVRFUyA9IDMyICogMTAyNCAqIDEwMjQ7XG5cbiAgICBwcml2YXRlIHBlcnNpc3RHYW1lU2NyZWVuc2hvdChkYXRhVXJsOiBzdHJpbmcsIF93aWR0aD86IG51bWJlciwgX2hlaWdodD86IG51bWJlcik6IHsgb2s6IHRydWU7IGZpbGVQYXRoOiBzdHJpbmc7IHNpemU6IG51bWJlciB9IHwgeyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmcgfSB7XG4gICAgICAgIGNvbnN0IG0gPSAvXmRhdGE6aW1hZ2VcXC8ocG5nfGpwZWd8d2VicCk7YmFzZTY0LCguKikkL2kuZXhlYyhkYXRhVXJsKTtcbiAgICAgICAgaWYgKCFtKSB7XG4gICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiAnR2FtZURlYnVnQ2xpZW50IHJldHVybmVkIHNjcmVlbnNob3QgZGF0YVVybCBpbiB1bmV4cGVjdGVkIGZvcm1hdCAoZXhwZWN0ZWQgZGF0YTppbWFnZS97cG5nfGpwZWd8d2VicH07YmFzZTY0LC4uLiknIH07XG4gICAgICAgIH1cbiAgICAgICAgLy8gYmFzZTY0LWRlY29kZWQgYnl0ZSBjb3VudCA9IH5jZWlsKGI2NExlbiAqIDMgLyA0KTsgcmVqZWN0IGVhcmx5XG4gICAgICAgIC8vIGJlZm9yZSBhbGxvY2F0aW5nIGEgbXVsdGktR0IgQnVmZmVyLlxuICAgICAgICBjb25zdCBiNjRMZW4gPSBtWzJdLmxlbmd0aDtcbiAgICAgICAgY29uc3QgYXBwcm94Qnl0ZXMgPSBNYXRoLmNlaWwoYjY0TGVuICogMyAvIDQpO1xuICAgICAgICBpZiAoYXBwcm94Qnl0ZXMgPiBEZWJ1Z1Rvb2xzLk1BWF9HQU1FX1NDUkVFTlNIT1RfQllURVMpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGBzY3JlZW5zaG90IHBheWxvYWQgdG9vIGxhcmdlOiB+JHthcHByb3hCeXRlc30gYnl0ZXMgZXhjZWVkcyBjYXAgJHtEZWJ1Z1Rvb2xzLk1BWF9HQU1FX1NDUkVFTlNIT1RfQllURVN9YCB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGV4dCA9IG1bMV0udG9Mb3dlckNhc2UoKSA9PT0gJ2pwZWcnID8gJ2pwZycgOiBtWzFdLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIGNvbnN0IGJ1ZiA9IEJ1ZmZlci5mcm9tKG1bMl0sICdiYXNlNjQnKTtcbiAgICAgICAgaWYgKGJ1Zi5sZW5ndGggPiBEZWJ1Z1Rvb2xzLk1BWF9HQU1FX1NDUkVFTlNIT1RfQllURVMpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGBzY3JlZW5zaG90IHBheWxvYWQgdG9vIGxhcmdlIGFmdGVyIGRlY29kZTogJHtidWYubGVuZ3RofSBieXRlcyBleGNlZWRzIGNhcCAke0RlYnVnVG9vbHMuTUFYX0dBTUVfU0NSRUVOU0hPVF9CWVRFU31gIH07XG4gICAgICAgIH1cbiAgICAgICAgLy8gdjIuNi4xIHJldmlldyBmaXggKGNsYXVkZSBNMiArIGNvZGV4IPCfn6EgKyBnZW1pbmkg8J+foSk6IHJlYWxwYXRoIGJvdGhcbiAgICAgICAgLy8gc2lkZXMgZm9yIGEgdHJ1ZSBjb250YWlubWVudCBjaGVjay4gdjIuOC4wIFQtVjI4LTIgaG9pc3RlZCB0aGlzXG4gICAgICAgIC8vIHBhdHRlcm4gaW50byByZXNvbHZlQXV0b0NhcHR1cmVGaWxlKCkgc28gc2NyZWVuc2hvdCgpIC8gY2FwdHVyZS1cbiAgICAgICAgLy8gcHJldmlldyAvIGJhdGNoLXNjcmVlbnNob3QgLyBwZXJzaXN0LWdhbWUgc2hhcmUgb25lIGltcGxlbWVudGF0aW9uLlxuICAgICAgICBjb25zdCByZXNvbHZlZCA9IHRoaXMucmVzb2x2ZUF1dG9DYXB0dXJlRmlsZShgZ2FtZS0ke0RhdGUubm93KCl9LiR7ZXh0fWApO1xuICAgICAgICBpZiAoIXJlc29sdmVkLm9rKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiByZXNvbHZlZC5lcnJvciB9O1xuICAgICAgICBmcy53cml0ZUZpbGVTeW5jKHJlc29sdmVkLmZpbGVQYXRoLCBidWYpO1xuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSwgZmlsZVBhdGg6IHJlc29sdmVkLmZpbGVQYXRoLCBzaXplOiBidWYubGVuZ3RoIH07XG4gICAgfVxuXG4gICAgLy8gdjIuNC44IEExOiBUUyBkaWFnbm9zdGljcyBoYW5kbGVycyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgICBwcml2YXRlIGFzeW5jIHdhaXRDb21waWxlKHRpbWVvdXRNczogbnVtYmVyID0gMTUwMDApOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcHJvamVjdFBhdGggPSBFZGl0b3I/LlByb2plY3Q/LnBhdGg7XG4gICAgICAgICAgICBpZiAoIXByb2plY3RQYXRoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnd2FpdF9jb21waWxlOiBlZGl0b3IgY29udGV4dCB1bmF2YWlsYWJsZSAobm8gRWRpdG9yLlByb2plY3QucGF0aCknIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB3YWl0Rm9yQ29tcGlsZShwcm9qZWN0UGF0aCwgdGltZW91dE1zKTtcbiAgICAgICAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHJlc3VsdC5lcnJvciA/PyAnd2FpdF9jb21waWxlIGZhaWxlZCcsIGRhdGE6IHJlc3VsdCB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IHJlc3VsdC5jb21waWxlZFxuICAgICAgICAgICAgICAgICAgICA/IGBDb21waWxlIGZpbmlzaGVkIGluICR7cmVzdWx0LndhaXRlZE1zfW1zYFxuICAgICAgICAgICAgICAgICAgICA6IChyZXN1bHQubm90ZSA/PyAnTm8gY29tcGlsZSB0cmlnZ2VyZWQgb3IgdGltZWQgb3V0JyksXG4gICAgICAgICAgICAgICAgZGF0YTogcmVzdWx0LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpIH07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHJ1blNjcmlwdERpYWdub3N0aWNzKHRzY29uZmlnUGF0aD86IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBwcm9qZWN0UGF0aCA9IEVkaXRvcj8uUHJvamVjdD8ucGF0aDtcbiAgICAgICAgICAgIGlmICghcHJvamVjdFBhdGgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdydW5fc2NyaXB0X2RpYWdub3N0aWNzOiBlZGl0b3IgY29udGV4dCB1bmF2YWlsYWJsZSAobm8gRWRpdG9yLlByb2plY3QucGF0aCknIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBydW5TY3JpcHREaWFnbm9zdGljcyhwcm9qZWN0UGF0aCwgeyB0c2NvbmZpZ1BhdGggfSk7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHJlc3VsdC5vayxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiByZXN1bHQuc3VtbWFyeSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIHRvb2w6IHJlc3VsdC50b29sLFxuICAgICAgICAgICAgICAgICAgICBiaW5hcnk6IHJlc3VsdC5iaW5hcnksXG4gICAgICAgICAgICAgICAgICAgIHRzY29uZmlnUGF0aDogcmVzdWx0LnRzY29uZmlnUGF0aCxcbiAgICAgICAgICAgICAgICAgICAgZXhpdENvZGU6IHJlc3VsdC5leGl0Q29kZSxcbiAgICAgICAgICAgICAgICAgICAgZGlhZ25vc3RpY3M6IHJlc3VsdC5kaWFnbm9zdGljcyxcbiAgICAgICAgICAgICAgICAgICAgZGlhZ25vc3RpY0NvdW50OiByZXN1bHQuZGlhZ25vc3RpY3MubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICAvLyB2Mi40LjkgcmV2aWV3IGZpeDogc3Bhd24gZmFpbHVyZXMgKGJpbmFyeSBtaXNzaW5nIC9cbiAgICAgICAgICAgICAgICAgICAgLy8gcGVybWlzc2lvbiBkZW5pZWQpIHN1cmZhY2VkIGV4cGxpY2l0bHkgc28gQUkgY2FuXG4gICAgICAgICAgICAgICAgICAgIC8vIGRpc3Rpbmd1aXNoIFwidHNjIG5ldmVyIHJhblwiIGZyb20gXCJ0c2MgZm91bmQgZXJyb3JzXCIuXG4gICAgICAgICAgICAgICAgICAgIHNwYXduRmFpbGVkOiByZXN1bHQuc3Bhd25GYWlsZWQgPT09IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIHN5c3RlbUVycm9yOiByZXN1bHQuc3lzdGVtRXJyb3IsXG4gICAgICAgICAgICAgICAgICAgIC8vIFRydW5jYXRlIHJhdyBzdHJlYW1zIHRvIGtlZXAgdG9vbCByZXN1bHQgcmVhc29uYWJsZTtcbiAgICAgICAgICAgICAgICAgICAgLy8gZnVsbCBjb250ZW50IHJhcmVseSB1c2VmdWwgd2hlbiB0aGUgcGFyc2VyIGFscmVhZHlcbiAgICAgICAgICAgICAgICAgICAgLy8gc3RydWN0dXJlZCB0aGUgZXJyb3JzLlxuICAgICAgICAgICAgICAgICAgICBzdGRvdXRUYWlsOiByZXN1bHQuc3Rkb3V0LnNsaWNlKC0yMDAwKSxcbiAgICAgICAgICAgICAgICAgICAgc3RkZXJyVGFpbDogcmVzdWx0LnN0ZGVyci5zbGljZSgtMjAwMCksXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKSB9O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRTY3JpcHREaWFnbm9zdGljQ29udGV4dChcbiAgICAgICAgZmlsZTogc3RyaW5nLFxuICAgICAgICBsaW5lOiBudW1iZXIsXG4gICAgICAgIGNvbnRleHRMaW5lczogbnVtYmVyID0gNSxcbiAgICApOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcHJvamVjdFBhdGggPSBFZGl0b3I/LlByb2plY3Q/LnBhdGg7XG4gICAgICAgICAgICBpZiAoIXByb2plY3RQYXRoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnZ2V0X3NjcmlwdF9kaWFnbm9zdGljX2NvbnRleHQ6IGVkaXRvciBjb250ZXh0IHVuYXZhaWxhYmxlJyB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgYWJzUGF0aCA9IHBhdGguaXNBYnNvbHV0ZShmaWxlKSA/IGZpbGUgOiBwYXRoLmpvaW4ocHJvamVjdFBhdGgsIGZpbGUpO1xuICAgICAgICAgICAgLy8gUGF0aCBzYWZldHk6IGVuc3VyZSBhYnNvbHV0ZSBwYXRoIHJlc29sdmVzIHVuZGVyIHByb2plY3RQYXRoXG4gICAgICAgICAgICAvLyB0byBwcmV2ZW50IHJlYWRzIG91dHNpZGUgdGhlIGNvY29zIHByb2plY3QuXG4gICAgICAgICAgICAvL1xuICAgICAgICAgICAgLy8gdjIuNC45IHJldmlldyBmaXggKGNvZGV4IPCflLQpOiBwbGFpbiBwYXRoLnJlc29sdmUrc3RhcnRzV2l0aCBvbmx5XG4gICAgICAgICAgICAvLyBjYXRjaGVzIGAuLmAgdHJhdmVyc2FsIOKAlCBhIFNZTUxJTksgaW5zaWRlIHRoZSBwcm9qZWN0IHBvaW50aW5nXG4gICAgICAgICAgICAvLyBvdXRzaWRlIGlzIHN0aWxsIHJlYWRhYmxlIGJlY2F1c2UgcGF0aC5yZXNvbHZlIGRvZXNuJ3QgZm9sbG93XG4gICAgICAgICAgICAvLyBzeW1saW5rcy4gVXNlIGZzLnJlYWxwYXRoU3luYyBvbiBib3RoIHNpZGVzIHNvIHdlIGNvbXBhcmUgdGhlXG4gICAgICAgICAgICAvLyByZWFsIG9uLWRpc2sgcGF0aHMgKFdpbmRvd3MgaXMgY2FzZS1pbnNlbnNpdGl2ZTsgYm90aCBzaWRlcyBnb1xuICAgICAgICAgICAgLy8gdGhyb3VnaCByZWFscGF0aFN5bmMgc28gY2FzaW5nIGlzIG5vcm1hbGlzZWQgY29uc2lzdGVudGx5KS5cbiAgICAgICAgICAgIGNvbnN0IHJlc29sdmVkUmF3ID0gcGF0aC5yZXNvbHZlKGFic1BhdGgpO1xuICAgICAgICAgICAgY29uc3QgcHJvamVjdFJlc29sdmVkUmF3ID0gcGF0aC5yZXNvbHZlKHByb2plY3RQYXRoKTtcbiAgICAgICAgICAgIGxldCByZXNvbHZlZDogc3RyaW5nO1xuICAgICAgICAgICAgbGV0IHByb2plY3RSZXNvbHZlZDogc3RyaW5nO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlZCA9IGZzLnJlYWxwYXRoU3luYy5uYXRpdmUocmVzb2x2ZWRSYXcpO1xuICAgICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgZ2V0X3NjcmlwdF9kaWFnbm9zdGljX2NvbnRleHQ6IGZpbGUgbm90IGZvdW5kIG9yIHVucmVhZGFibGU6ICR7cmVzb2x2ZWRSYXd9YCB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBwcm9qZWN0UmVzb2x2ZWQgPSBmcy5yZWFscGF0aFN5bmMubmF0aXZlKHByb2plY3RSZXNvbHZlZFJhdyk7XG4gICAgICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgICAgICBwcm9qZWN0UmVzb2x2ZWQgPSBwcm9qZWN0UmVzb2x2ZWRSYXc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBDYXNlLWluc2Vuc2l0aXZlIGNvbXBhcmlzb24gb24gV2luZG93czsgc2VwIGd1YXJkIGFnYWluc3RcbiAgICAgICAgICAgIC8vIC9wcm9qLWZvbyB2cyAvcHJvaiBwcmVmaXggY29uZnVzaW9uLlxuICAgICAgICAgICAgY29uc3QgY21wUmVzb2x2ZWQgPSBwcm9jZXNzLnBsYXRmb3JtID09PSAnd2luMzInID8gcmVzb2x2ZWQudG9Mb3dlckNhc2UoKSA6IHJlc29sdmVkO1xuICAgICAgICAgICAgY29uc3QgY21wUHJvamVjdCA9IHByb2Nlc3MucGxhdGZvcm0gPT09ICd3aW4zMicgPyBwcm9qZWN0UmVzb2x2ZWQudG9Mb3dlckNhc2UoKSA6IHByb2plY3RSZXNvbHZlZDtcbiAgICAgICAgICAgIGlmICghY21wUmVzb2x2ZWQuc3RhcnRzV2l0aChjbXBQcm9qZWN0ICsgcGF0aC5zZXApICYmIGNtcFJlc29sdmVkICE9PSBjbXBQcm9qZWN0KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgZ2V0X3NjcmlwdF9kaWFnbm9zdGljX2NvbnRleHQ6IHBhdGggJHtyZXNvbHZlZH0gcmVzb2x2ZXMgb3V0c2lkZSB0aGUgcHJvamVjdCByb290IChzeW1saW5rLWF3YXJlIGNoZWNrKWAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghZnMuZXhpc3RzU3luYyhyZXNvbHZlZCkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBnZXRfc2NyaXB0X2RpYWdub3N0aWNfY29udGV4dDogZmlsZSBub3QgZm91bmQ6ICR7cmVzb2x2ZWR9YCB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3Qgc3RhdCA9IGZzLnN0YXRTeW5jKHJlc29sdmVkKTtcbiAgICAgICAgICAgIGlmIChzdGF0LnNpemUgPiA1ICogMTAyNCAqIDEwMjQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBnZXRfc2NyaXB0X2RpYWdub3N0aWNfY29udGV4dDogZmlsZSB0b28gbGFyZ2UgKCR7c3RhdC5zaXplfSBieXRlcyk7IHJlZnVzaW5nIHRvIHJlYWQuYCB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgY29udGVudCA9IGZzLnJlYWRGaWxlU3luYyhyZXNvbHZlZCwgJ3V0ZjgnKTtcbiAgICAgICAgICAgIGNvbnN0IGFsbExpbmVzID0gY29udGVudC5zcGxpdCgvXFxyP1xcbi8pO1xuICAgICAgICAgICAgaWYgKGxpbmUgPCAxIHx8IGxpbmUgPiBhbGxMaW5lcy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGBnZXRfc2NyaXB0X2RpYWdub3N0aWNfY29udGV4dDogbGluZSAke2xpbmV9IG91dCBvZiByYW5nZSAxLi4ke2FsbExpbmVzLmxlbmd0aH1gLFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBzdGFydCA9IE1hdGgubWF4KDEsIGxpbmUgLSBjb250ZXh0TGluZXMpO1xuICAgICAgICAgICAgY29uc3QgZW5kID0gTWF0aC5taW4oYWxsTGluZXMubGVuZ3RoLCBsaW5lICsgY29udGV4dExpbmVzKTtcbiAgICAgICAgICAgIGNvbnN0IHdpbmRvdyA9IGFsbExpbmVzLnNsaWNlKHN0YXJ0IC0gMSwgZW5kKTtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiBgUmVhZCAke3dpbmRvdy5sZW5ndGh9IGxpbmVzIG9mIGNvbnRleHQgYXJvdW5kICR7cGF0aC5yZWxhdGl2ZShwcm9qZWN0UmVzb2x2ZWQsIHJlc29sdmVkKX06JHtsaW5lfWAsXG4gICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICBmaWxlOiBwYXRoLnJlbGF0aXZlKHByb2plY3RSZXNvbHZlZCwgcmVzb2x2ZWQpLFxuICAgICAgICAgICAgICAgICAgICBhYnNvbHV0ZVBhdGg6IHJlc29sdmVkLFxuICAgICAgICAgICAgICAgICAgICB0YXJnZXRMaW5lOiBsaW5lLFxuICAgICAgICAgICAgICAgICAgICBzdGFydExpbmU6IHN0YXJ0LFxuICAgICAgICAgICAgICAgICAgICBlbmRMaW5lOiBlbmQsXG4gICAgICAgICAgICAgICAgICAgIHRvdGFsTGluZXM6IGFsbExpbmVzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgbGluZXM6IHdpbmRvdy5tYXAoKHRleHQsIGkpID0+ICh7IGxpbmU6IHN0YXJ0ICsgaSwgdGV4dCB9KSksXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKSB9O1xuICAgICAgICB9XG4gICAgfVxufVxuIl19