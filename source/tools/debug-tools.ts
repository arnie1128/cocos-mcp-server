import { ToolDefinition, ToolResponse, ToolExecutor, PerformanceStats, ValidationResult, ValidationIssue } from '../types';
import { debugLog } from '../lib/log';
import { isEditorContextEvalEnabled } from '../lib/runtime-flags';
import { z, toInputSchema, validateArgs } from '../lib/schema';
import * as fs from 'fs';
import * as path from 'path';

const debugSchemas = {
    clear_console: z.object({}),
    execute_javascript: z.object({
        code: z.string().describe('JavaScript source to execute. Has access to cc.* in scene context, Editor.* in editor context.'),
        context: z.enum(['scene', 'editor']).default('scene').describe('Execution sandbox. "scene" runs inside the cocos scene script context (cc, director, find). "editor" runs in the editor host process (Editor, asset-db, fs, require). Editor context is OFF by default and must be opt-in via panel setting `enableEditorContextEval` — arbitrary code in the host process is a prompt-injection risk.'),
    }),
    execute_script: z.object({
        script: z.string().describe('JavaScript to execute in scene context via console/eval. Can read or mutate the current scene.'),
    }),
    get_node_tree: z.object({
        rootUuid: z.string().optional().describe('Root node UUID to expand. Omit to use the current scene root.'),
        maxDepth: z.number().default(10).describe('Maximum tree depth. Default 10; large values can return a lot of data.'),
    }),
    get_performance_stats: z.object({}),
    validate_scene: z.object({
        checkMissingAssets: z.boolean().default(true).describe('Check missing asset references when the Cocos scene API supports it.'),
        checkPerformance: z.boolean().default(true).describe('Run basic performance checks such as high node count warnings.'),
    }),
    get_editor_info: z.object({}),
    get_project_logs: z.object({
        lines: z.number().min(1).max(10000).default(100).describe('Number of lines to read from the end of temp/logs/project.log. Default 100.'),
        filterKeyword: z.string().optional().describe('Optional case-insensitive keyword filter.'),
        logLevel: z.enum(['ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE', 'ALL']).default('ALL').describe('Optional log level filter. ALL disables level filtering.'),
    }),
    get_log_file_info: z.object({}),
    search_project_logs: z.object({
        pattern: z.string().describe('Search string or regex. Invalid regex is treated as a literal string.'),
        maxResults: z.number().min(1).max(100).default(20).describe('Maximum matches to return. Default 20.'),
        contextLines: z.number().min(0).max(10).default(2).describe('Context lines before/after each match. Default 2.'),
    }),
    screenshot: z.object({
        savePath: z.string().optional().describe('Absolute filesystem path to save the PNG. Omit to auto-name into <project>/temp/mcp-captures/screenshot-<timestamp>.png.'),
        windowTitle: z.string().optional().describe('Optional substring match on window title to pick a specific Electron window. Default: focused window.'),
        includeBase64: z.boolean().default(false).describe('Embed PNG bytes as base64 in response data (large; default false). When false, only the saved file path is returned.'),
    }),
    batch_screenshot: z.object({
        savePathPrefix: z.string().optional().describe('Path prefix for batch output files. Files written as <prefix>-<index>.png. Default: <project>/temp/mcp-captures/batch-<timestamp>.'),
        delaysMs: z.array(z.number().min(0).max(10000)).max(20).default([0]).describe('Delay (ms) before each capture. Length determines how many shots taken (capped at 20 to prevent disk fill / editor freeze). Default [0] = single shot.'),
        windowTitle: z.string().optional().describe('Optional substring match on window title.'),
    }),
} as const;

const debugToolMeta: Record<keyof typeof debugSchemas, string> = {
    clear_console: 'Clear the Cocos Editor Console UI. No project side effects.',
    execute_javascript: '[primary] Execute JavaScript in scene or editor context. Use this as the default first tool for compound operations (read → mutate → verify) — one call replaces 5-10 narrow specialist tools and avoids per-call token overhead. context="scene" inspects/mutates cc.Node graph; context="editor" runs in host process for Editor.Message + fs (default off, opt-in).',
    execute_script: '[compat] Scene-only JavaScript eval. Prefer execute_javascript with context="scene" — kept as compatibility entrypoint for older clients.',
    get_node_tree: 'Read a debug node tree from a root or scene root for hierarchy/component inspection.',
    get_performance_stats: 'Try to read scene query-performance stats; may return unavailable in edit mode.',
    validate_scene: 'Run basic current-scene health checks for missing assets and node-count warnings.',
    get_editor_info: 'Read Editor/Cocos/project/process information and memory summary.',
    get_project_logs: 'Read temp/logs/project.log tail with optional level/keyword filters.',
    get_log_file_info: 'Read temp/logs/project.log path, size, line count, and timestamps.',
    search_project_logs: 'Search temp/logs/project.log for string/regex and return line context.',
    screenshot: 'Capture the focused Cocos Editor window (or a window matched by title) to a PNG. Returns saved file path. Use this for AI visual verification after scene/UI changes.',
    batch_screenshot: 'Capture multiple PNGs of the editor window with optional delays between shots. Useful for animating preview verification or capturing transitions.',
};

export class DebugTools implements ToolExecutor {
    getTools(): ToolDefinition[] {
        return (Object.keys(debugSchemas) as Array<keyof typeof debugSchemas>).map(name => ({
            name,
            description: debugToolMeta[name],
            inputSchema: toInputSchema(debugSchemas[name]),
        }));
    }

    async execute(toolName: string, args: any): Promise<ToolResponse> {
        const schemaName = toolName as keyof typeof debugSchemas;
        const schema = debugSchemas[schemaName];
        if (!schema) {
            throw new Error(`Unknown tool: ${toolName}`);
        }
        const validation = validateArgs(schema, args ?? {});
        if (!validation.ok) {
            return validation.response;
        }
        const a = validation.data as any;

        switch (schemaName) {
            case 'clear_console':
                return await this.clearConsole();
            case 'execute_javascript':
                return await this.executeJavaScript(a.code, a.context ?? 'scene');
            case 'execute_script': {
                // Compat path: preserve the pre-v2.3.0 response shape
                // {success, data: {result, message: 'Script executed successfully'}}
                // so older callers reading data.message keep working.
                const out = await this.executeJavaScript(a.script, 'scene');
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
            case 'get_node_tree':
                return await this.getNodeTree(a.rootUuid, a.maxDepth);
            case 'get_performance_stats':
                return await this.getPerformanceStats();
            case 'validate_scene':
                return await this.validateScene(a);
            case 'get_editor_info':
                return await this.getEditorInfo();
            case 'get_project_logs':
                return await this.getProjectLogs(a.lines, a.filterKeyword, a.logLevel);
            case 'get_log_file_info':
                return await this.getLogFileInfo();
            case 'search_project_logs':
                return await this.searchProjectLogs(a.pattern, a.maxResults, a.contextLines);
            case 'screenshot':
                return await this.screenshot(a.savePath, a.windowTitle, a.includeBase64);
            case 'batch_screenshot':
                return await this.batchScreenshot(a.savePathPrefix, a.delaysMs, a.windowTitle);
        }
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

    private async screenshot(savePath?: string, windowTitle?: string, includeBase64: boolean = false): Promise<ToolResponse> {
        try {
            let filePath = savePath;
            if (!filePath) {
                const dirResult = this.ensureCaptureDir();
                if (!dirResult.ok) return { success: false, error: dirResult.error };
                filePath = path.join(dirResult.dir, `screenshot-${Date.now()}.png`);
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

    private async batchScreenshot(savePathPrefix?: string, delaysMs: number[] = [0], windowTitle?: string): Promise<ToolResponse> {
        try {
            let prefix = savePathPrefix;
            if (!prefix) {
                const dirResult = this.ensureCaptureDir();
                if (!dirResult.ok) return { success: false, error: dirResult.error };
                prefix = path.join(dirResult.dir, `batch-${Date.now()}`);
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
}
