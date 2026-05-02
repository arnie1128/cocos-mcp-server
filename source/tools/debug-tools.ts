import { ToolDefinition, ToolResponse, ToolExecutor, PerformanceStats, ValidationResult, ValidationIssue } from '../types';
import { debugLog } from '../lib/log';
import { isEditorContextEvalEnabled } from '../lib/runtime-flags';
import { z } from '../lib/schema';
import { defineTools, ToolDef } from '../lib/define-tools';
import { runScriptDiagnostics, waitForCompile } from '../lib/ts-diagnostics';
import { queueGameCommand, awaitCommandResult, getClientStatus } from '../lib/game-command-queue';
import { runSceneMethodAsToolResponse } from '../lib/scene-bridge';
import * as fs from 'fs';
import * as path from 'path';

export class DebugTools implements ToolExecutor {
    private readonly exec: ToolExecutor;

    constructor() {
        const defs: ToolDef[] = [
            {
                name: 'clear_console',
                description: 'Clear the Cocos Editor Console UI. No project side effects.',
                inputSchema: z.object({}),
                handler: () => this.clearConsole(),
            },
            {
                name: 'execute_javascript',
                description: '[primary] Execute JavaScript in scene or editor context. Use this as the default first tool for compound operations (read → mutate → verify) — one call replaces 5-10 narrow specialist tools and avoids per-call token overhead. context="scene" inspects/mutates cc.Node graph; context="editor" runs in host process for Editor.Message + fs (default off, opt-in).',
                inputSchema: z.object({
                    code: z.string().describe('JavaScript source to execute. Has access to cc.* in scene context, Editor.* in editor context.'),
                    context: z.enum(['scene', 'editor']).default('scene').describe('Execution sandbox. "scene" runs inside the cocos scene script context (cc, director, find). "editor" runs in the editor host process (Editor, asset-db, fs, require). Editor context is OFF by default and must be opt-in via panel setting `enableEditorContextEval` — arbitrary code in the host process is a prompt-injection risk.'),
                }),
                handler: a => this.executeJavaScript(a.code, a.context ?? 'scene'),
            },
            {
                name: 'execute_script',
                description: '[compat] Scene-only JavaScript eval. Prefer execute_javascript with context="scene" — kept as compatibility entrypoint for older clients.',
                inputSchema: z.object({
                    script: z.string().describe('JavaScript to execute in scene context via console/eval. Can read or mutate the current scene.'),
                }),
                handler: a => this.executeScriptCompat(a.script),
            },
            {
                name: 'get_node_tree',
                description: 'Read a debug node tree from a root or scene root for hierarchy/component inspection.',
                inputSchema: z.object({
                    rootUuid: z.string().optional().describe('Root node UUID to expand. Omit to use the current scene root.'),
                    maxDepth: z.number().default(10).describe('Maximum tree depth. Default 10; large values can return a lot of data.'),
                }),
                handler: a => this.getNodeTree(a.rootUuid, a.maxDepth),
            },
            {
                name: 'get_performance_stats',
                description: 'Try to read scene query-performance stats; may return unavailable in edit mode.',
                inputSchema: z.object({}),
                handler: () => this.getPerformanceStats(),
            },
            {
                name: 'validate_scene',
                description: 'Run basic current-scene health checks for missing assets and node-count warnings.',
                inputSchema: z.object({
                    checkMissingAssets: z.boolean().default(true).describe('Check missing asset references when the Cocos scene API supports it.'),
                    checkPerformance: z.boolean().default(true).describe('Run basic performance checks such as high node count warnings.'),
                }),
                handler: a => this.validateScene({ checkMissingAssets: a.checkMissingAssets, checkPerformance: a.checkPerformance }),
            },
            {
                name: 'get_editor_info',
                description: 'Read Editor/Cocos/project/process information and memory summary.',
                inputSchema: z.object({}),
                handler: () => this.getEditorInfo(),
            },
            {
                name: 'get_project_logs',
                description: 'Read temp/logs/project.log tail with optional level/keyword filters.',
                inputSchema: z.object({
                    lines: z.number().min(1).max(10000).default(100).describe('Number of lines to read from the end of temp/logs/project.log. Default 100.'),
                    filterKeyword: z.string().optional().describe('Optional case-insensitive keyword filter.'),
                    logLevel: z.enum(['ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE', 'ALL']).default('ALL').describe('Optional log level filter. ALL disables level filtering.'),
                }),
                handler: a => this.getProjectLogs(a.lines, a.filterKeyword, a.logLevel),
            },
            {
                name: 'get_log_file_info',
                description: 'Read temp/logs/project.log path, size, line count, and timestamps.',
                inputSchema: z.object({}),
                handler: () => this.getLogFileInfo(),
            },
            {
                name: 'search_project_logs',
                description: 'Search temp/logs/project.log for string/regex and return line context.',
                inputSchema: z.object({
                    pattern: z.string().describe('Search string or regex. Invalid regex is treated as a literal string.'),
                    maxResults: z.number().min(1).max(100).default(20).describe('Maximum matches to return. Default 20.'),
                    contextLines: z.number().min(0).max(10).default(2).describe('Context lines before/after each match. Default 2.'),
                }),
                handler: a => this.searchProjectLogs(a.pattern, a.maxResults, a.contextLines),
            },
            {
                name: 'screenshot',
                description: 'Capture the focused Cocos Editor window (or a window matched by title) to a PNG. Returns saved file path. Use this for AI visual verification after scene/UI changes.',
                inputSchema: z.object({
                    savePath: z.string().optional().describe('Absolute filesystem path to save the PNG. Must resolve inside the cocos project root (containment check via realpath). Omit to auto-name into <project>/temp/mcp-captures/screenshot-<timestamp>.png.'),
                    windowTitle: z.string().optional().describe('Optional substring match on window title to pick a specific Electron window. Default: focused window.'),
                    includeBase64: z.boolean().default(false).describe('Embed PNG bytes as base64 in response data (large; default false). When false, only the saved file path is returned.'),
                }),
                handler: a => this.screenshot(a.savePath, a.windowTitle, a.includeBase64),
            },
            {
                name: 'capture_preview_screenshot',
                description: 'Capture the cocos Preview-in-Editor (PIE) window to a PNG. Targets an Electron BrowserWindow whose title contains "Preview" — covers PIE windows opened by the cocos toolbar play button. Returns saved file path; pair with debug_preview_url before launching to confirm preview is reachable. For runtime game-canvas pixel-level capture (camera RenderTexture), use debug_game_command(type="screenshot") instead.',
                inputSchema: z.object({
                    savePath: z.string().optional().describe('Absolute filesystem path to save the PNG. Must resolve inside the cocos project root (containment check via realpath). Omit to auto-name into <project>/temp/mcp-captures/preview-<timestamp>.png.'),
                    windowTitle: z.string().default('Preview').describe('Substring matched against window titles (default "Preview" for PIE).'),
                    includeBase64: z.boolean().default(false).describe('Embed PNG bytes as base64 in response data (large; default false).'),
                }),
                handler: a => this.capturePreviewScreenshot(a.savePath, a.windowTitle, a.includeBase64),
            },
            {
                name: 'batch_screenshot',
                description: 'Capture multiple PNGs of the editor window with optional delays between shots. Useful for animating preview verification or capturing transitions.',
                inputSchema: z.object({
                    savePathPrefix: z.string().optional().describe('Path prefix for batch output files. Files written as <prefix>-<index>.png. Must resolve inside the cocos project root (containment check via realpath). Default: <project>/temp/mcp-captures/batch-<timestamp>.'),
                    delaysMs: z.array(z.number().min(0).max(10000)).max(20).default([0]).describe('Delay (ms) before each capture. Length determines how many shots taken (capped at 20 to prevent disk fill / editor freeze). Default [0] = single shot.'),
                    windowTitle: z.string().optional().describe('Optional substring match on window title.'),
                }),
                handler: a => this.batchScreenshot(a.savePathPrefix, a.delaysMs, a.windowTitle),
            },
            {
                name: 'wait_compile',
                description: 'Block until cocos finishes its TypeScript compile pass. Tails temp/programming/packer-driver/logs/debug.log for the "Target(editor) ends" marker. Returns immediately with compiled=false if no compile was triggered (clean project / no changes detected). Pair with run_script_diagnostics for an "edit .ts → wait → fetch errors" workflow.',
                inputSchema: z.object({
                    timeoutMs: z.number().min(500).max(120000).default(15000).describe('Max wait time in ms before giving up. Default 15000.'),
                }),
                handler: a => this.waitCompile(a.timeoutMs),
            },
            {
                name: 'run_script_diagnostics',
                description: 'Run `tsc --noEmit` against the project tsconfig and return parsed diagnostics. Used after wait_compile to surface compilation errors as structured {file, line, column, code, message} entries. Resolves tsc binary from project node_modules → editor bundled engine → npx fallback.',
                inputSchema: z.object({
                    tsconfigPath: z.string().optional().describe('Optional override (absolute or project-relative). Default: tsconfig.json or temp/tsconfig.cocos.json.'),
                }),
                handler: a => this.runScriptDiagnostics(a.tsconfigPath),
            },
            {
                name: 'preview_url',
                description: 'Resolve the cocos browser-preview URL (e.g. http://localhost:7456) via the documented Editor.Message channel preview/query-preview-url. With action="open", also launches the URL in the user default browser via electron.shell.openExternal — useful as a setup step before debug_game_command, since the GameDebugClient running inside the preview must be reachable. Editor-side Preview-in-Editor play/stop is NOT exposed by the public message API and is intentionally not implemented here; use the cocos editor toolbar manually for PIE.',
                inputSchema: z.object({
                    action: z.enum(['query', 'open']).default('query').describe('"query" returns the URL; "open" returns the URL AND opens it in the user default browser via electron.shell.openExternal.'),
                }),
                handler: a => this.previewUrl(a.action),
            },
            {
                name: 'query_devices',
                description: 'List preview devices configured in the cocos project (cc.IDeviceItem entries). Backed by Editor.Message channel device/query. Returns an array of {name, width, height, ratio} entries — useful for batch-screenshot pipelines that target multiple resolutions.',
                inputSchema: z.object({}),
                handler: () => this.queryDevices(),
            },
            {
                name: 'game_command',
                description: 'Send a runtime command to a GameDebugClient running inside a cocos preview/build (browser, Preview-in-Editor, or any device that fetches /game/command). Built-in command types: "screenshot" (capture game canvas to PNG, returns saved file path), "click" (emit Button.CLICK on a node by name), "inspect" (dump runtime node info: position/scale/rotation/contentSize/active/components by name). Custom command types are forwarded to the client\'s customCommands map (e.g. "state", "navigate"). Requires the GameDebugClient template (client/cocos-mcp-client.ts) wired into the running game; without it the call times out. Check GET /game/status to verify client liveness first.',
                inputSchema: z.object({
                    type: z.string().min(1).describe('Command type. Built-ins: screenshot, click, inspect. Customs: any string the GameDebugClient registered in customCommands.'),
                    args: z.any().optional().describe('Command-specific arguments. For "click"/"inspect": {name: string} node name. For "screenshot": {} (no args).'),
                    timeoutMs: z.number().min(500).max(60000).default(10000).describe('Max wait for client response. Default 10000ms.'),
                }),
                handler: a => this.gameCommand(a.type, a.args, a.timeoutMs),
            },
            {
                name: 'game_client_status',
                description: 'Read GameDebugClient connection status: connected (polled within 2s), last poll timestamp, whether a command is queued. Use before debug_game_command to confirm the client is reachable.',
                inputSchema: z.object({}),
                handler: () => this.gameClientStatus(),
            },
            {
                name: 'preview_control',
                description: 'Programmatically start or stop Preview-in-Editor (PIE) play mode. Wraps the typed cce.SceneFacade.changePreviewPlayState method (documented on SceneFacadeManager in @cocos/creator-types). Pair with debug_capture_preview_screenshot: call preview_control(op="start") to enter play mode, wait for the PIE window to appear, then capture. preview_control(op="stop") returns to scene mode. Implementation routes through scene-script (execute-scene-script → scene-side changePreviewPlayState handler) so the call is type-checked against creator-types and not subject to silent removal between cocos versions.',
                inputSchema: z.object({
                    op: z.enum(['start', 'stop']).describe('"start" enters PIE play mode (equivalent to clicking the toolbar play button). "stop" exits PIE play and returns to scene mode.'),
                }),
                handler: a => this.previewControl(a.op),
            },
            {
                name: 'get_script_diagnostic_context',
                description: 'Read a window of source lines around a diagnostic location so AI can read the offending code without a separate file read. Pair with run_script_diagnostics: pass file/line from each diagnostic to fetch context.',
                inputSchema: z.object({
                    file: z.string().describe('Absolute or project-relative path to the source file. Diagnostics from run_script_diagnostics already use a path tsc emitted, which is suitable here.'),
                    line: z.number().min(1).describe('1-based line number that the diagnostic points at.'),
                    contextLines: z.number().min(0).max(50).default(5).describe('Number of lines to include before and after the target line. Default 5 (±5 → 11-line window).'),
                }),
                handler: a => this.getScriptDiagnosticContext(a.file, a.line, a.contextLines),
            },
        ];
        this.exec = defineTools(defs);
    }

    getTools(): ToolDefinition[] { return this.exec.getTools(); }
    execute(toolName: string, args: any): Promise<ToolResponse> { return this.exec.execute(toolName, args); }

    // Compat path: preserve the pre-v2.3.0 response shape
    // {success, data: {result, message: 'Script executed successfully'}}
    // so older callers reading data.message keep working.
    private async executeScriptCompat(script: string): Promise<ToolResponse> {
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

    private async clearConsole(): Promise<ToolResponse> {
        try {
            // Note: Editor.Message.send may not return a promise in all versions
            Editor.Message.send('console', 'clear');
            return {
                success: true,
                message: 'Console cleared successfully'
            };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    }

    private async executeJavaScript(code: string, context: 'scene' | 'editor'): Promise<ToolResponse> {
        if (context === 'scene') {
            return this.executeInSceneContext(code);
        }
        if (context === 'editor') {
            return this.executeInEditorContext(code);
        }
        return { success: false, error: `Unknown execute_javascript context: ${context}` };
    }

    private executeInSceneContext(code: string): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'execute-scene-script', {
                name: 'console',
                method: 'eval',
                args: [code]
            }).then((result: any) => {
                resolve({
                    success: true,
                    data: {
                        context: 'scene',
                        result: result,
                    },
                    message: 'Scene script executed successfully'
                });
            }).catch((err: Error) => {
                resolve({ success: false, error: err.message });
            });
        });
    }

    private async executeInEditorContext(code: string): Promise<ToolResponse> {
        if (!isEditorContextEvalEnabled()) {
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
        } catch (err: any) {
            return {
                success: false,
                error: `Editor eval failed: ${err?.message ?? String(err)}`,
            };
        }
    }

    private async getNodeTree(rootUuid?: string, maxDepth: number = 10): Promise<ToolResponse> {
        return new Promise((resolve) => {
            const buildTree = async (nodeUuid: string, depth: number = 0): Promise<any> => {
                if (depth >= maxDepth) {
                    return { truncated: true };
                }

                try {
                    const nodeData = await Editor.Message.request('scene', 'query-node', nodeUuid);
                    
                    const tree = {
                        uuid: nodeData.uuid,
                        name: nodeData.name,
                        active: nodeData.active,
                        components: (nodeData as any).components ? (nodeData as any).components.map((c: any) => c.__type__) : [],
                        childCount: nodeData.children ? nodeData.children.length : 0,
                        children: [] as any[]
                    };

                    if (nodeData.children && nodeData.children.length > 0) {
                        for (const childId of nodeData.children) {
                            const childTree = await buildTree(childId, depth + 1);
                            tree.children.push(childTree);
                        }
                    }

                    return tree;
                } catch (err: any) {
                    return { error: err.message };
                }
            };

            if (rootUuid) {
                buildTree(rootUuid).then(tree => {
                    resolve({ success: true, data: tree });
                });
            } else {
                Editor.Message.request('scene', 'query-hierarchy').then(async (hierarchy: any) => {
                    const trees = [];
                    for (const rootNode of hierarchy.children) {
                        const tree = await buildTree(rootNode.uuid);
                        trees.push(tree);
                    }
                    resolve({ success: true, data: trees });
                }).catch((err: Error) => {
                    resolve({ success: false, error: err.message });
                });
            }
        });
    }

    private async getPerformanceStats(): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'query-performance').then((stats: any) => {
                const perfStats: PerformanceStats = {
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

    private async validateScene(options: any): Promise<ToolResponse> {
        const issues: ValidationIssue[] = [];

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

            const result: ValidationResult = {
                valid: issues.length === 0,
                issueCount: issues.length,
                issues: issues
            };

            return { success: true, data: result };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    }

    private countNodes(nodes: any[]): number {
        let count = nodes.length;
        for (const node of nodes) {
            if (node.children) {
                count += this.countNodes(node.children);
            }
        }
        return count;
    }

    private async getEditorInfo(): Promise<ToolResponse> {
        const info = {
            editor: {
                version: (Editor as any).versions?.editor || 'Unknown',
                cocosVersion: (Editor as any).versions?.cocos || 'Unknown',
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

    private resolveProjectLogPath(): { path: string } | { error: string } {
        if (!Editor.Project || !Editor.Project.path) {
            return { error: 'Editor.Project.path is not available; cannot locate project log file.' };
        }
        const logPath = path.join(Editor.Project.path, 'temp/logs/project.log');
        if (!fs.existsSync(logPath)) {
            return { error: `Project log file not found at ${logPath}` };
        }
        return { path: logPath };
    }

    private async getProjectLogs(lines: number = 100, filterKeyword?: string, logLevel: string = 'ALL'): Promise<ToolResponse> {
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
                filteredLines = filteredLines.filter(line => 
                    line.includes(`[${logLevel}]`) || line.includes(logLevel.toLowerCase())
                );
            }
            
            // Filter by keyword if provided
            if (filterKeyword) {
                filteredLines = filteredLines.filter(line => 
                    line.toLowerCase().includes(filterKeyword.toLowerCase())
                );
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
        } catch (error: any) {
            return {
                success: false,
                error: `Failed to read project logs: ${error.message}`
            };
        }
    }

    private async getLogFileInfo(): Promise<ToolResponse> {
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
        } catch (error: any) {
            return {
                success: false,
                error: `Failed to get log file info: ${error.message}`
            };
        }
    }

    private async searchProjectLogs(pattern: string, maxResults: number = 20, contextLines: number = 2): Promise<ToolResponse> {
        try {
            const resolved = this.resolveProjectLogPath();
            if ('error' in resolved) {
                return { success: false, error: resolved.error };
            }
            const logFilePath = resolved.path;

            const logContent = fs.readFileSync(logFilePath, 'utf8');
            const logLines = logContent.split('\n');
            
            // Create regex pattern (support both string and regex patterns)
            let regex: RegExp;
            try {
                regex = new RegExp(pattern, 'gi');
            } catch {
                // If pattern is not valid regex, treat as literal string
                regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
            }
            
            const matches: any[] = [];
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
        } catch (error: any) {
            return {
                success: false,
                error: `Failed to search project logs: ${error.message}`
            };
        }
    }

    private formatFileSize(bytes: number): string {
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;

        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }

        return `${size.toFixed(2)} ${units[unitIndex]}`;
    }

    private pickWindow(titleSubstring?: string): any {
        // Lazy require so that non-Electron contexts (e.g. unit tests, smoke
        // script with stub registry) can still import this module.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const electron = require('electron');
        const BW = electron.BrowserWindow;
        if (!BW) {
            throw new Error('Electron BrowserWindow API unavailable; screenshot tool requires running inside Cocos editor host process.');
        }
        if (titleSubstring) {
            const matches = BW.getAllWindows().filter((w: any) =>
                w && !w.isDestroyed() && (w.getTitle?.() || '').includes(titleSubstring));
            if (matches.length === 0) {
                throw new Error(`No Electron window title matched substring: ${titleSubstring}`);
            }
            return matches[0];
        }
        // v2.3.1 review fix: focused window may be a transient preview popup.
        // Prefer a non-Preview window so default screenshots target the main
        // editor surface. Caller can still pass titleSubstring='Preview' to
        // explicitly target the preview when wanted.
        const all: any[] = BW.getAllWindows().filter((w: any) => w && !w.isDestroyed());
        if (all.length === 0) {
            throw new Error('No live Electron windows; cannot capture screenshot.');
        }
        const isPreview = (w: any) => /preview/i.test(w.getTitle?.() || '');
        const nonPreview = all.filter((w: any) => !isPreview(w));
        const focused = BW.getFocusedWindow?.();
        if (focused && !focused.isDestroyed() && !isPreview(focused)) return focused;
        if (nonPreview.length > 0) return nonPreview[0];
        return all[0];
    }

    private ensureCaptureDir(): { ok: true; dir: string } | { ok: false; error: string } {
        if (!Editor.Project || !Editor.Project.path) {
            return { ok: false, error: 'Editor.Project.path is not available; cannot resolve capture output directory.' };
        }
        const dir = path.join(Editor.Project.path, 'temp', 'mcp-captures');
        try {
            fs.mkdirSync(dir, { recursive: true });
            return { ok: true, dir };
        } catch (err: any) {
            return { ok: false, error: `Failed to create capture dir: ${err?.message ?? String(err)}` };
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
    private resolveAutoCaptureFile(basename: string): { ok: true; filePath: string; dir: string } | { ok: false; error: string } {
        const dirResult = this.ensureCaptureDir();
        if (!dirResult.ok) return { ok: false, error: dirResult.error };
        const projectPath: string | undefined = Editor?.Project?.path;
        if (!projectPath) {
            return { ok: false, error: 'Editor.Project.path is not available; cannot anchor capture-dir containment check.' };
        }
        const filePath = path.join(dirResult.dir, basename);
        let realDir: string;
        let realParent: string;
        let realProjectRoot: string;
        try {
            const rp: any = fs.realpathSync as any;
            const resolveReal = rp.native ?? rp;
            realDir = resolveReal(dirResult.dir);
            realParent = resolveReal(path.dirname(filePath));
            realProjectRoot = resolveReal(projectPath);
        } catch (err: any) {
            return { ok: false, error: `screenshot path realpath failed: ${err?.message ?? String(err)}` };
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
    private assertSavePathWithinProject(savePath: string): { ok: true; resolvedPath: string } | { ok: false; error: string } {
        const projectPath: string | undefined = Editor?.Project?.path;
        if (!projectPath) {
            return { ok: false, error: 'Editor.Project.path is not available; cannot validate explicit savePath.' };
        }
        try {
            const rp: any = fs.realpathSync as any;
            const resolveReal = rp.native ?? rp;
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
            let realParent: string;
            try {
                realParent = resolveReal(parent);
            } catch (err: any) {
                return { ok: false, error: `savePath parent dir missing or unreadable: ${err?.message ?? String(err)}` };
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
        } catch (err: any) {
            return { ok: false, error: `savePath realpath failed: ${err?.message ?? String(err)}` };
        }
    }

    private async screenshot(savePath?: string, windowTitle?: string, includeBase64: boolean = false): Promise<ToolResponse> {
        try {
            let filePath = savePath;
            if (!filePath) {
                const resolved = this.resolveAutoCaptureFile(`screenshot-${Date.now()}.png`);
                if (!resolved.ok) return { success: false, error: resolved.error };
                filePath = resolved.filePath;
            } else {
                // v2.8.1 round-1 fix (Gemini 🔴 + Codex 🟡): explicit savePath
                // also gets containment-checked. AI-generated paths could
                // otherwise write outside the project root.
                // v2.8.2 retest fix: use the helper's resolvedPath so a
                // relative savePath actually lands inside the project root.
                const guard = this.assertSavePathWithinProject(filePath);
                if (!guard.ok) return { success: false, error: guard.error };
                filePath = guard.resolvedPath;
            }
            const win = this.pickWindow(windowTitle);
            const image = await win.webContents.capturePage();
            const png: Buffer = image.toPNG();
            fs.writeFileSync(filePath, png);
            const data: any = {
                filePath,
                size: png.length,
                windowTitle: typeof win.getTitle === 'function' ? win.getTitle() : '',
            };
            if (includeBase64) {
                data.dataUri = `data:image/png;base64,${png.toString('base64')}`;
            }
            return { success: true, data, message: `Screenshot saved to ${filePath}` };
        } catch (err: any) {
            return { success: false, error: err?.message ?? String(err) };
        }
    }

    // v2.7.0 #4: Preview-window screenshot. Wraps screenshot() with a
    // PIE-focused default title and a friendlier error when no Preview
    // window exists (the underlying pickWindow throws "No Electron window
    // title matched" — that doesn't tell AI to launch preview first).
    private async capturePreviewScreenshot(savePath?: string, windowTitle: string = 'Preview', includeBase64: boolean = false): Promise<ToolResponse> {
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
            const matches = BW?.getAllWindows?.()?.filter((w: any) => {
                if (!w || w.isDestroyed()) return false;
                const title = w.getTitle?.() || '';
                if (!title.includes(windowTitle)) return false;
                if (usingDefault && /Cocos\s*Creator/i.test(title)) return false;
                return true;
            }) ?? [];
            if (matches.length === 0) {
                return {
                    success: false,
                    error: `No Electron window title contains "${windowTitle}"${usingDefault ? ' (and is not the main editor)' : ''}. Launch cocos preview first via the toolbar play button or via debug_preview_url(action="open"). Visible window titles: ${
                        BW?.getAllWindows?.()?.map((w: any) => w.getTitle?.() ?? '').filter(Boolean).join(', ') ?? '(none)'
                    }`,
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
                if (!resolved.ok) return { success: false, error: resolved.error };
                filePath = resolved.filePath;
            } else {
                // v2.8.1 round-1 fix (Gemini 🔴 + Codex 🟡): explicit savePath
                // also gets containment-checked.
                // v2.8.2 retest fix: use resolvedPath for relative-path support.
                const guard = this.assertSavePathWithinProject(filePath);
                if (!guard.ok) return { success: false, error: guard.error };
                filePath = guard.resolvedPath;
            }
            const image = await win.webContents.capturePage();
            const png: Buffer = image.toPNG();
            fs.writeFileSync(filePath, png);
            const data: any = {
                filePath,
                size: png.length,
                windowTitle: typeof win.getTitle === 'function' ? win.getTitle() : '',
            };
            if (includeBase64) {
                data.dataUri = `data:image/png;base64,${png.toString('base64')}`;
            }
            return { success: true, data, message: `Preview screenshot saved to ${filePath}` };
        } catch (err: any) {
            return { success: false, error: err?.message ?? String(err) };
        }
    }

    private async batchScreenshot(savePathPrefix?: string, delaysMs: number[] = [0], windowTitle?: string): Promise<ToolResponse> {
        try {
            let prefix = savePathPrefix;
            if (!prefix) {
                // basename is the prefix stem; per-iteration files extend it
                // with `-${i}.png`. Containment check on the prefix path is
                // sufficient because path.join preserves dirname for any
                // suffix the loop appends.
                const resolved = this.resolveAutoCaptureFile(`batch-${Date.now()}`);
                if (!resolved.ok) return { success: false, error: resolved.error };
                prefix = resolved.filePath;
            } else {
                // v2.8.1 round-1 fix (Gemini 🔴 + Codex 🟡): explicit prefix
                // also gets containment-checked. We check the prefix path
                // itself — every emitted file lives in the same dirname.
                // v2.8.2 retest fix: use resolvedPath for relative-prefix support.
                const guard = this.assertSavePathWithinProject(prefix);
                if (!guard.ok) return { success: false, error: guard.error };
                prefix = guard.resolvedPath;
            }
            const win = this.pickWindow(windowTitle);
            const captures: any[] = [];
            for (let i = 0; i < delaysMs.length; i++) {
                const delay = delaysMs[i];
                if (delay > 0) {
                    await new Promise(r => setTimeout(r, delay));
                }
                const filePath = `${prefix}-${i}.png`;
                const image = await win.webContents.capturePage();
                const png: Buffer = image.toPNG();
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
        } catch (err: any) {
            return { success: false, error: err?.message ?? String(err) };
        }
    }

    // v2.7.0 #3: preview-url / query-devices handlers ---------------------

    private async previewUrl(action: 'query' | 'open' = 'query'): Promise<ToolResponse> {
        try {
            const url: string = await Editor.Message.request('preview', 'query-preview-url' as any) as any;
            if (!url || typeof url !== 'string') {
                return { success: false, error: 'preview/query-preview-url returned empty result; check that cocos preview server is running' };
            }
            const data: any = { url };
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
                } catch (err: any) {
                    data.launched = false;
                    data.launchError = err?.message ?? String(err);
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
        } catch (err: any) {
            return { success: false, error: err?.message ?? String(err) };
        }
    }

    // v2.8.0 T-V28-3: PIE play / stop. Routes through scene-script so the
    // typed cce.SceneFacade.changePreviewPlayState is reached via the
    // documented execute-scene-script channel. The HANDOFF originally
    // listed `scene/editor-preview-set-play` as an undocumented Editor
    // .Message channel; we found the typed facade method during T-V28-3
    // implementation and went with that instead.
    private async previewControl(op: 'start' | 'stop'): Promise<ToolResponse> {
        const state = op === 'start';
        const result: ToolResponse = await runSceneMethodAsToolResponse('changePreviewPlayState', [state]);
        if (result.success) {
            return {
                ...result,
                message: state
                    ? 'Entered Preview-in-Editor play mode (PIE window may take a moment to appear)'
                    : 'Exited Preview-in-Editor play mode',
            };
        }
        return result;
    }

    private async queryDevices(): Promise<ToolResponse> {
        try {
            const devices: any[] = await Editor.Message.request('device', 'query') as any;
            return { success: true, data: { devices: Array.isArray(devices) ? devices : [], count: Array.isArray(devices) ? devices.length : 0 } };
        } catch (err: any) {
            return { success: false, error: err?.message ?? String(err) };
        }
    }

    // v2.6.0 T-V26-1: GameDebugClient bridge handlers ---------------------

    private async gameCommand(type: string, args: any, timeoutMs: number = 10000): Promise<ToolResponse> {
        const queued = queueGameCommand(type, args);
        if (!queued.ok) {
            return { success: false, error: queued.error };
        }
        const awaited = await awaitCommandResult(queued.id, timeoutMs);
        if (!awaited.ok) {
            return { success: false, error: awaited.error };
        }
        const result = awaited.result;
        if (result.success === false) {
            return { success: false, error: result.error ?? 'GameDebugClient reported failure', data: result.data };
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
        return { success: true, data: { type, ...result.data }, message: `Game command ${type} ok` };
    }

    private async gameClientStatus(): Promise<ToolResponse> {
        return { success: true, data: getClientStatus() };
    }

    // v2.6.1 review fix (codex 🔴 + claude W1): bound the legitimate range
    // of a screenshot payload before decoding so a misbehaving / malicious
    // client cannot fill disk by streaming arbitrary base64 bytes.
    // 32 MB matches the global request-body cap in mcp-server-sdk.ts so
    // the body would already 413 before reaching here, but a
    // belt-and-braces check stays cheap.
    private static readonly MAX_GAME_SCREENSHOT_BYTES = 32 * 1024 * 1024;

    private persistGameScreenshot(dataUrl: string, _width?: number, _height?: number): { ok: true; filePath: string; size: number } | { ok: false; error: string } {
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
        if (!resolved.ok) return { ok: false, error: resolved.error };
        fs.writeFileSync(resolved.filePath, buf);
        return { ok: true, filePath: resolved.filePath, size: buf.length };
    }

    // v2.4.8 A1: TS diagnostics handlers ----------------------------------

    private async waitCompile(timeoutMs: number = 15000): Promise<ToolResponse> {
        try {
            const projectPath = Editor?.Project?.path;
            if (!projectPath) {
                return { success: false, error: 'wait_compile: editor context unavailable (no Editor.Project.path)' };
            }
            const result = await waitForCompile(projectPath, timeoutMs);
            if (!result.success) {
                return { success: false, error: result.error ?? 'wait_compile failed', data: result };
            }
            return {
                success: true,
                message: result.compiled
                    ? `Compile finished in ${result.waitedMs}ms`
                    : (result.note ?? 'No compile triggered or timed out'),
                data: result,
            };
        } catch (err: any) {
            return { success: false, error: err?.message ?? String(err) };
        }
    }

    private async runScriptDiagnostics(tsconfigPath?: string): Promise<ToolResponse> {
        try {
            const projectPath = Editor?.Project?.path;
            if (!projectPath) {
                return { success: false, error: 'run_script_diagnostics: editor context unavailable (no Editor.Project.path)' };
            }
            const result = await runScriptDiagnostics(projectPath, { tsconfigPath });
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
        } catch (err: any) {
            return { success: false, error: err?.message ?? String(err) };
        }
    }

    private async getScriptDiagnosticContext(
        file: string,
        line: number,
        contextLines: number = 5,
    ): Promise<ToolResponse> {
        try {
            const projectPath = Editor?.Project?.path;
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
            let resolved: string;
            let projectResolved: string;
            try {
                resolved = fs.realpathSync.native(resolvedRaw);
            } catch {
                return { success: false, error: `get_script_diagnostic_context: file not found or unreadable: ${resolvedRaw}` };
            }
            try {
                projectResolved = fs.realpathSync.native(projectResolvedRaw);
            } catch {
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
        } catch (err: any) {
            return { success: false, error: err?.message ?? String(err) };
        }
    }
}
