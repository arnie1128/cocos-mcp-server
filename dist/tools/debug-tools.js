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
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
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
const response_1 = require("../lib/response");
const log_parser_1 = require("../lib/log-parser");
const runtime_flags_1 = require("../lib/runtime-flags");
const schema_1 = require("../lib/schema");
const decorators_1 = require("../lib/decorators");
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
    // v2.9.5 review fix (Codex 🟡): startsWith('..') would also reject a
    // legitimate child whose first path segment literally starts with
    // ".." (e.g. directory named "..foo"). Match either exactly `..` or
    // `..` followed by a path separator instead.
    if (rel === '..' || rel.startsWith('..' + path.sep))
        return false;
    if (path.isAbsolute(rel))
        return false; // different drive
    return true;
}
class DebugTools {
    constructor() {
        this.exec = (0, decorators_1.defineToolsFromDecorators)(this);
    }
    getTools() { return this.exec.getTools(); }
    execute(toolName, args) { return this.exec.execute(toolName, args); }
    async clearConsole() {
        return this.clearConsoleImpl();
    }
    async executeJavascript(args) {
        var _a;
        return this.executeJavaScript(args.code, (_a = args.context) !== null && _a !== void 0 ? _a : 'scene');
    }
    async executeScript(args) {
        return this.executeScriptCompat(args.script);
    }
    async getNodeTree(args) {
        return this.getNodeTreeImpl(args.rootUuid, args.maxDepth);
    }
    async getPerformanceStats() {
        return this.getPerformanceStatsImpl();
    }
    async validateScene(args) {
        return this.validateSceneImpl({ checkMissingAssets: args.checkMissingAssets, checkPerformance: args.checkPerformance });
    }
    async getEditorInfo() {
        return this.getEditorInfoImpl();
    }
    async getProjectLogs(args) {
        return this.getProjectLogsImpl(args.lines, args.filterKeyword, args.logLevel);
    }
    async getLogFileInfo() {
        return this.getLogFileInfoImpl();
    }
    async searchProjectLogs(args) {
        return this.searchProjectLogsImpl(args.pattern, args.maxResults, args.contextLines);
    }
    async screenshot(args) {
        return this.screenshotImpl(args.savePath, args.windowTitle, args.includeBase64);
    }
    async capturePreviewScreenshot(args) {
        var _a;
        return this.capturePreviewScreenshotImpl(args.savePath, (_a = args.mode) !== null && _a !== void 0 ? _a : 'auto', args.windowTitle, args.includeBase64);
    }
    async getPreviewMode() {
        return this.getPreviewModeImpl();
    }
    async setPreviewMode(args) {
        var _a;
        return this.setPreviewModeImpl(args.mode, (_a = args.attemptAnyway) !== null && _a !== void 0 ? _a : false);
    }
    async batchScreenshot(args) {
        return this.batchScreenshotImpl(args.savePathPrefix, args.delaysMs, args.windowTitle);
    }
    async waitCompile(args) {
        return this.waitCompileImpl(args.timeoutMs);
    }
    async runScriptDiagnostics(args) {
        return this.runScriptDiagnosticsImpl(args.tsconfigPath);
    }
    async previewUrl(args) {
        return this.previewUrlImpl(args.action);
    }
    async queryDevices() {
        return this.queryDevicesImpl();
    }
    async gameCommand(args) {
        return this.gameCommandImpl(args.type, args.args, args.timeoutMs);
    }
    async recordStart(args) {
        var _a;
        return this.recordStartImpl(args.mimeType, args.videoBitsPerSecond, (_a = args.timeoutMs) !== null && _a !== void 0 ? _a : 5000);
    }
    async recordStop(args) {
        var _a;
        return this.recordStopImpl((_a = args.timeoutMs) !== null && _a !== void 0 ? _a : 30000);
    }
    async gameClientStatus() {
        return this.gameClientStatusImpl();
    }
    async checkEditorHealth(args) {
        var _a;
        return this.checkEditorHealthImpl((_a = args.sceneTimeoutMs) !== null && _a !== void 0 ? _a : 1500);
    }
    async previewControl(args) {
        var _a;
        return this.previewControlImpl(args.op, (_a = args.acknowledgeFreezeRisk) !== null && _a !== void 0 ? _a : false);
    }
    async getScriptDiagnosticContext(args) {
        return this.getScriptDiagnosticContextImpl(args.file, args.line, args.contextLines);
    }
    // Compat path: preserve the pre-v2.3.0 response shape
    // {success, data: {result, message: 'Script executed successfully'}}
    // so older callers reading data.message keep working.
    async executeScriptCompat(script) {
        const out = await this.executeJavaScript(script, 'scene');
        if (out.success && out.data && 'result' in out.data) {
            return (0, response_1.ok)({
                result: out.data.result,
                message: 'Script executed successfully',
            });
        }
        return out;
    }
    async clearConsoleImpl() {
        // Note: Editor.Message.send may not return a promise in all versions
        Editor.Message.send('console', 'clear');
        return (0, response_1.ok)(undefined, 'Console cleared successfully');
    }
    async executeJavaScript(code, context) {
        if (context === 'scene') {
            return this.executeInSceneContext(code);
        }
        if (context === 'editor') {
            return this.executeInEditorContext(code);
        }
        return (0, response_1.fail)(`Unknown execute_javascript context: ${context}`);
    }
    executeInSceneContext(code) {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'execute-scene-script', {
                name: 'console',
                method: 'eval',
                args: [code]
            }).then((result) => {
                resolve((0, response_1.ok)({
                    context: 'scene',
                    result: result,
                }, 'Scene script executed successfully'));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async executeInEditorContext(code) {
        var _a;
        if (!(0, runtime_flags_1.isEditorContextEvalEnabled)()) {
            return (0, response_1.fail)('Editor context eval is disabled. Enable `enableEditorContextEval` in MCP server settings (panel UI) to opt in. This grants AI-generated code access to Editor.Message + Node fs APIs in the host process; only enable when you trust the upstream prompt source.');
        }
        try {
            // Wrap in async IIFE so AI can use top-level await transparently;
            // also gives us a clean Promise-based return path regardless of
            // whether the user code returns a Promise or a sync value.
            const wrapped = `(async () => { ${code} \n })()`;
            // eslint-disable-next-line no-eval
            const result = await (0, eval)(wrapped);
            return (0, response_1.ok)({
                context: 'editor',
                result: result,
            }, 'Editor script executed successfully');
        }
        catch (err) {
            return (0, response_1.fail)(`Editor eval failed: ${(_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : String(err)}`);
        }
    }
    async getNodeTreeImpl(rootUuid, maxDepth = 10) {
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
                        tree.children = await Promise.all(nodeData.children.map((childId) => buildTree(childId, depth + 1)));
                    }
                    return tree;
                }
                catch (err) {
                    return { error: err.message };
                }
            };
            if (rootUuid) {
                buildTree(rootUuid).then(tree => {
                    resolve((0, response_1.ok)(tree));
                });
            }
            else {
                Editor.Message.request('scene', 'query-hierarchy').then(async (hierarchy) => {
                    const trees = await Promise.all(hierarchy.children.map((rootNode) => buildTree(rootNode.uuid)));
                    resolve((0, response_1.ok)(trees));
                }).catch((err) => {
                    resolve((0, response_1.fail)(err.message));
                });
            }
        });
    }
    async getPerformanceStatsImpl() {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'query-performance').then((stats) => {
                const perfStats = {
                    nodeCount: stats.nodeCount || 0,
                    componentCount: stats.componentCount || 0,
                    drawCalls: stats.drawCalls || 0,
                    triangles: stats.triangles || 0,
                    memory: stats.memory || {}
                };
                resolve((0, response_1.ok)(perfStats));
            }).catch(() => {
                // Fallback to basic stats
                resolve((0, response_1.ok)({
                    message: 'Performance stats not available in edit mode'
                }));
            });
        });
    }
    async validateSceneImpl(options) {
        const issues = [];
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
        return (0, response_1.ok)(result);
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
    async getEditorInfoImpl() {
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
        return (0, response_1.ok)(info);
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
    async getProjectLogsImpl(lines = 100, filterKeyword, logLevel = 'ALL') {
        try {
            const resolved = this.resolveProjectLogPath();
            if ('error' in resolved) {
                return (0, response_1.fail)(resolved.error);
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
                filteredLines = (0, log_parser_1.filterByLevel)(filteredLines, logLevel);
            }
            // Filter by keyword if provided
            if (filterKeyword) {
                filteredLines = (0, log_parser_1.filterByKeyword)(filteredLines, filterKeyword);
            }
            return (0, response_1.ok)({
                totalLines: logLines.length,
                requestedLines: lines,
                filteredLines: filteredLines.length,
                logLevel: logLevel,
                filterKeyword: filterKeyword || null,
                logs: filteredLines,
                logFilePath: logFilePath
            });
        }
        catch (error) {
            return (0, response_1.fail)(`Failed to read project logs: ${error.message}`);
        }
    }
    async getLogFileInfoImpl() {
        try {
            const resolved = this.resolveProjectLogPath();
            if ('error' in resolved) {
                return (0, response_1.fail)(resolved.error);
            }
            const logFilePath = resolved.path;
            const stats = fs.statSync(logFilePath);
            const logContent = fs.readFileSync(logFilePath, 'utf8');
            const lineCount = logContent.split('\n').filter(line => line.trim() !== '').length;
            return (0, response_1.ok)({
                filePath: logFilePath,
                fileSize: stats.size,
                fileSizeFormatted: this.formatFileSize(stats.size),
                lastModified: stats.mtime.toISOString(),
                lineCount: lineCount,
                created: stats.birthtime.toISOString(),
                accessible: fs.constants.R_OK
            });
        }
        catch (error) {
            return (0, response_1.fail)(`Failed to get log file info: ${error.message}`);
        }
    }
    async searchProjectLogsImpl(pattern, maxResults = 20, contextLines = 2) {
        try {
            const resolved = this.resolveProjectLogPath();
            if ('error' in resolved) {
                return (0, response_1.fail)(resolved.error);
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
            const allMatches = (0, log_parser_1.searchWithContext)(logLines, regex, contextLines);
            const matches = allMatches.slice(0, maxResults).map(m => {
                const contextLinesArray = [];
                let currentLineNum = m.matchLine - m.before.length;
                for (const line of m.before) {
                    contextLinesArray.push({
                        lineNumber: currentLineNum++,
                        content: line,
                        isMatch: false
                    });
                }
                contextLinesArray.push({
                    lineNumber: m.matchLine,
                    content: m.match,
                    isMatch: true
                });
                currentLineNum++;
                for (const line of m.after) {
                    contextLinesArray.push({
                        lineNumber: currentLineNum++,
                        content: line,
                        isMatch: false
                    });
                }
                return {
                    lineNumber: m.matchLine,
                    matchedLine: m.match,
                    context: contextLinesArray
                };
            });
            return (0, response_1.ok)({
                pattern: pattern,
                totalMatches: allMatches.length,
                maxResults: maxResults,
                contextLines: contextLines,
                logFilePath: logFilePath,
                matches: matches
            });
        }
        catch (error) {
            return (0, response_1.fail)(`Failed to search project logs: ${error.message}`);
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
    async screenshotImpl(savePath, windowTitle, includeBase64 = false) {
        let filePath = savePath;
        if (!filePath) {
            const resolved = this.resolveAutoCaptureFile(`screenshot-${Date.now()}.png`);
            if (!resolved.ok)
                return (0, response_1.fail)(resolved.error);
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
                return (0, response_1.fail)(guard.error);
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
        return (0, response_1.ok)(data, `Screenshot saved to ${filePath}`);
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
    async capturePreviewScreenshotImpl(savePath, mode = 'auto', windowTitle = 'Preview', includeBase64 = false) {
        var _a, _b;
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
                return (0, response_1.fail)(`${r.error} Launch cocos preview first via the toolbar play button or via debug_preview_url(action="open"). If your cocos preview is set to "embedded", call this tool with mode="embedded" or mode="auto". Visible window titles: ${r.visibleTitles.join(', ') || '(none)'}`);
            }
            win = r.win;
            resolvedMode = 'window';
        }
        else if (mode === 'embedded') {
            const r = probeEmbeddedMode();
            if (!r.ok)
                return (0, response_1.fail)(r.error);
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
                    return (0, response_1.fail)(`${wr.error} ${er.error} Launch cocos preview first or check debug_get_preview_mode to see how cocos is configured. Visible window titles: ${wr.visibleTitles.join(', ') || '(none)'}`);
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
                catch (_c) {
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
                return (0, response_1.fail)(resolved.error);
            filePath = resolved.filePath;
        }
        else {
            // v2.8.1 round-1 fix (Gemini 🔴 + Codex 🟡): explicit savePath
            // also gets containment-checked.
            // v2.8.2 retest fix: use resolvedPath for relative-path support.
            const guard = this.assertSavePathWithinProject(filePath);
            if (!guard.ok)
                return (0, response_1.fail)(guard.error);
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
        return (0, response_1.ok)(data, message);
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
    async getPreviewModeImpl() {
        var _a;
        try {
            // Probe at module level (no key) to get the whole category.
            const raw = await Editor.Message.request('preferences', 'query-config', 'preview');
            if (raw === undefined || raw === null) {
                return (0, response_1.fail)('preferences/query-config returned null for "preview" — cocos may not expose this category, or your build differs from 3.8.x.');
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
            return (0, response_1.ok)({ interpreted, interpretedFromKey, raw }, interpreted === 'unknown'
                ? 'Read cocos preview config but could not interpret a mode label; inspect data.raw and pass mode= explicitly to capture_preview_screenshot.'
                : `cocos preview is configured as "${interpreted}" (from key "${interpretedFromKey}"). Pass mode="${interpreted === 'browser' ? 'window' : interpreted}" to capture_preview_screenshot, or rely on mode="auto".`);
        }
        catch (err) {
            return (0, response_1.fail)(`preferences/query-config 'preview' failed: ${(_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : String(err)}`);
        }
    }
    // v2.10 T-V210-1: hard-fail by default. Per cross-repo refresh
    // 2026-05-02, none of 6 surveyed cocos-mcp peers ship a working
    // preview-mode setter — the cocos 3.8.7 preview category is
    // effectively readonly to third-party extensions (landmine #17).
    // Default behavior is now NOT_SUPPORTED with a UI redirect.
    //
    // The 4-strategy probe is preserved behind `attemptAnyway=true`
    // so a future cocos build can be validated quickly: read the
    // returned data.attempts log to see whether any shape now works.
    // The setter does NOT freeze the editor (set-config silently
    // no-ops, cf. preview_control which DOES freeze — landmine #16).
    //
    // Strategies tried in order:
    //   1. ('preview', 'current', { platform: value })  — nested object
    //   2. ('preview', 'current.platform', value, 'global') — explicit protocol
    //   3. ('preview', 'current.platform', value, 'local')  — explicit protocol
    //   4. ('preview', 'current.platform', value)          — no protocol
    async setPreviewModeImpl(mode, attemptAnyway) {
        var _a, _b;
        try {
            const queryCurrent = async () => {
                var _a, _b, _c;
                const cfg = await Editor.Message.request('preferences', 'query-config', 'preview');
                return (_c = (_b = (_a = cfg === null || cfg === void 0 ? void 0 : cfg.preview) === null || _a === void 0 ? void 0 : _a.current) === null || _b === void 0 ? void 0 : _b.platform) !== null && _c !== void 0 ? _c : null;
            };
            const previousMode = await queryCurrent();
            if (!attemptAnyway) {
                return (0, response_1.fail)(`debug_set_preview_mode is NOT SUPPORTED on cocos 3.8.7+ (landmine #17). Programmatic preview-mode switching has no working IPC path: preferences/set-config returns truthy but does not persist, and 6 surveyed reference projects (harady / Spaydo / RomaRogov / cocos-code-mode / FunplayAI / cocos-cli) all confirm no working alternative exists. **Switch via the cocos preview dropdown in the editor toolbar instead** (current mode: "${previousMode !== null && previousMode !== void 0 ? previousMode : 'unknown'}", requested: "${mode}"). To re-probe whether a newer cocos build now exposes a write path, re-call with attemptAnyway=true (diagnostic only — does NOT freeze the editor).`, { previousMode, requestedMode: mode, supported: false });
            }
            if (previousMode === mode) {
                return (0, response_1.ok)({ previousMode, newMode: mode, confirmed: true, noOp: true }, `cocos preview already set to "${mode}"; no change applied.`);
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
                return (0, response_1.fail)(`set-config strategies all failed to flip preview.current.platform from "${previousMode !== null && previousMode !== void 0 ? previousMode : 'unknown'}" to "${mode}". Tried 4 shapes; cocos returned values but the read-back never matched the requested mode. The set-config channel may have changed in this cocos build; switch via the cocos preview dropdown manually for now and report which shape works.`, { previousMode, requestedMode: mode, attempts });
            }
            return (0, response_1.ok)({ previousMode, newMode: mode, confirmed: true, strategy: winner.strategy, attempts }, `cocos preview switched: "${previousMode !== null && previousMode !== void 0 ? previousMode : 'unknown'}" → "${mode}" via ${winner.strategy}. Restore via debug_set_preview_mode(mode="${previousMode !== null && previousMode !== void 0 ? previousMode : 'browser'}", confirm=true) when done if needed.`);
        }
        catch (err) {
            return (0, response_1.fail)(`preferences/set-config 'preview' failed: ${(_b = err === null || err === void 0 ? void 0 : err.message) !== null && _b !== void 0 ? _b : String(err)}`);
        }
    }
    async batchScreenshotImpl(savePathPrefix, delaysMs = [0], windowTitle) {
        let prefix = savePathPrefix;
        if (!prefix) {
            // basename is the prefix stem; per-iteration files extend it
            // with `-${i}.png`. Containment check on the prefix path is
            // sufficient because path.join preserves dirname for any
            // suffix the loop appends.
            const resolved = this.resolveAutoCaptureFile(`batch-${Date.now()}`);
            if (!resolved.ok)
                return (0, response_1.fail)(resolved.error);
            prefix = resolved.filePath;
        }
        else {
            // v2.8.1 round-1 fix (Gemini 🔴 + Codex 🟡): explicit prefix
            // also gets containment-checked. We check the prefix path
            // itself — every emitted file lives in the same dirname.
            // v2.8.2 retest fix: use resolvedPath for relative-prefix support.
            const guard = this.assertSavePathWithinProject(prefix);
            if (!guard.ok)
                return (0, response_1.fail)(guard.error);
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
        return (0, response_1.ok)({
            count: captures.length,
            windowTitle: typeof win.getTitle === 'function' ? win.getTitle() : '',
            captures,
        }, `Captured ${captures.length} screenshots`);
    }
    // v2.7.0 #3: preview-url / query-devices handlers ---------------------
    async previewUrlImpl(action = 'query') {
        var _a;
        const url = await Editor.Message.request('preview', 'query-preview-url');
        if (!url || typeof url !== 'string') {
            return (0, response_1.fail)('preview/query-preview-url returned empty result; check that cocos preview server is running');
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
        return (0, response_1.ok)(data, message);
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
    async checkEditorHealthImpl(sceneTimeoutMs = 1500) {
        var _a;
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
        // Scene probe — v2.9.5 review fix (Gemini 🔴 + Codex 🔴 + Claude 🟡):
        // v2.9.0 used getCurrentSceneInfo via execute-scene-script wrapper,
        // but that scene-side method just reads `director.getScene()`
        // (cached singleton) and resolves <1ms even when the scene-script
        // renderer is visibly frozen — confirmed live during v2.9.1 retest
        // where sceneAlive returned true while user reported the editor
        // was spinning and required Ctrl+R.
        //
        // Switch to two probes that exercise different paths:
        //  1. `scene/query-is-ready` (typed channel — see
        //     scene/@types/message.d.ts:257). Direct IPC into the scene
        //     module; will hang if the scene-script renderer is wedged.
        //  2. `scene/execute-scene-script` runWithCapture('queryNodeDump')
        //     on a known UUID forcing an actual scene-graph walk — covers
        //     the case where scene IPC is alive but the runWithCapture /
        //     execute-scene-script path is the wedged one.
        // We declare scene healthy only when BOTH probes resolve within
        // the timeout. Each probe gets its own timeout race so a stuck
        // scene-script doesn't compound delays.
        const probeWithTimeout = async (p, label) => {
            var _a;
            const start = Date.now();
            const timeout = new Promise(resolve => setTimeout(() => resolve({ timedOut: true }), sceneTimeoutMs));
            try {
                const r = await Promise.race([p.then(v => ({ value: v, timedOut: false })), timeout]);
                const latencyMs = Date.now() - start;
                if (r === null || r === void 0 ? void 0 : r.timedOut)
                    return { ok: false, error: `${label} probe timed out after ${sceneTimeoutMs}ms`, latencyMs };
                return { ok: true, value: r.value, latencyMs };
            }
            catch (err) {
                return { ok: false, error: `${label} probe threw: ${(_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : String(err)}`, latencyMs: Date.now() - start };
            }
        };
        const isReadyP = probeWithTimeout(Editor.Message.request('scene', 'query-is-ready'), 'scene/query-is-ready');
        // v2.9.6 round-2 fix (Codex 🔴 + Claude 🟡): v2.9.5 used
        // `scene/query-current-scene` chained into `query-node` —
        // `query-current-scene` is NOT in scene/@types/message.d.ts
        // (only `query-is-ready` and `query-node-tree`/etc. are typed).
        // An unknown channel may resolve fast with garbage on some cocos
        // builds, leading to false-healthy reports.
        //
        // Switch to `scene/query-node-tree` (typed: scene/@types/
        // message.d.ts:273) with no arg — returns the full INode[] tree.
        // This forces a real graph walk through the scene-script renderer
        // and is the right strength of probe for liveness detection.
        const dumpP = probeWithTimeout(Editor.Message.request('scene', 'query-node-tree'), 'scene/query-node-tree');
        const [isReady, dump] = await Promise.all([isReadyP, dumpP]);
        const sceneLatencyMs = Math.max(isReady.latencyMs, dump.latencyMs);
        // v2.9.6 round-2 fix (Codex 🔴 single — null UUID false-healthy):
        // require BOTH probes to resolve AND query-is-ready === true AND
        // query-node-tree to return non-null.
        // v2.9.7 round-3 fix (Codex r3 🟡 + Claude r3 🟡 informational):
        // tighten further — a returned empty array `[]` is null-safe but
        // semantically means "no scene loaded", which is NOT alive in the
        // sense the AI cares about (a frozen renderer might also produce
        // zero-tree responses on some builds). Require non-empty array.
        const dumpValid = dump.ok
            && dump.value !== null
            && dump.value !== undefined
            && (!Array.isArray(dump.value) || dump.value.length > 0);
        const sceneAlive = isReady.ok && dumpValid && isReady.value === true;
        let sceneError = null;
        if (!isReady.ok)
            sceneError = isReady.error;
        else if (!dump.ok)
            sceneError = dump.error;
        else if (!dumpValid)
            sceneError = `scene/query-node-tree returned ${Array.isArray(dump.value) && dump.value.length === 0 ? 'an empty array (no scene loaded or scene-script in degraded state)' : JSON.stringify(dump.value)} (expected non-empty INode[])`;
        else if (isReady.value !== true)
            sceneError = `scene/query-is-ready returned ${JSON.stringify(isReady.value)} (expected true)`;
        const suggestion = !hostAlive
            ? 'cocos editor host process unresponsive — verify the editor is running and the cocos-mcp-server extension is loaded.'
            : !sceneAlive
                ? 'cocos editor scene-script is frozen (likely landmine #16 after preview_control(start)). Press Ctrl+R in the cocos editor to reload the scene-script renderer; do not issue more scene/* tool calls until recovered.'
                : 'editor healthy; scene-script and host both responsive.';
        return (0, response_1.ok)({
            hostAlive,
            sceneAlive,
            sceneLatencyMs,
            sceneTimeoutMs,
            hostError,
            sceneError,
            totalProbeMs: Date.now() - t0,
        }, suggestion);
    }
    async previewControlImpl(op, acknowledgeFreezeRisk = false) {
        // v2.9.x park gate: op="start" is known to freeze cocos 3.8.7
        // (landmine #16). Refuse unless the caller has explicitly
        // acknowledged the risk. op="stop" is always safe — bypass the
        // gate so callers can recover from a half-applied state.
        if (op === 'start' && !acknowledgeFreezeRisk) {
            return (0, response_1.fail)('debug_preview_control(op="start") is parked due to landmine #16 — the cocos 3.8.7 softReloadScene race freezes the editor regardless of preview mode (verified embedded + browser). v2.10 cross-repo refresh confirmed no reference project ships a safer path — harady and cocos-code-mode use the same channel family and hit the same race. **Strongly preferred alternatives** (please use these instead): (a) debug_capture_preview_screenshot(mode="embedded") in EDIT mode (no PIE needed); (b) debug_game_command(type="screenshot") via GameDebugClient on browser preview launched via debug_preview_url(action="open"). Only re-call with acknowledgeFreezeRisk=true if neither alternative fits AND the human user is prepared to press Ctrl+R in cocos if the editor freezes.');
        }
        if (DebugTools.previewControlInFlight) {
            return (0, response_1.fail)('Another debug_preview_control call is already in flight. PIE state changes go through cocos\' SceneFacadeFSM and double-firing during the in-flight window risks compounding the landmine #16 freeze. Wait for the previous call to resolve, then retry.');
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
    async queryDevicesImpl() {
        const devices = await Editor.Message.request('device', 'query');
        return (0, response_1.ok)({ devices: Array.isArray(devices) ? devices : [], count: Array.isArray(devices) ? devices.length : 0 });
    }
    // v2.6.0 T-V26-1: GameDebugClient bridge handlers ---------------------
    async gameCommandImpl(type, args, timeoutMs = 10000) {
        var _a;
        const queued = (0, game_command_queue_1.queueGameCommand)(type, args);
        if (!queued.ok) {
            return (0, response_1.fail)(queued.error);
        }
        const awaited = await (0, game_command_queue_1.awaitCommandResult)(queued.id, timeoutMs);
        if (!awaited.ok) {
            return (0, response_1.fail)(awaited.error);
        }
        const result = awaited.result;
        if (result.success === false) {
            return (0, response_1.fail)((_a = result.error) !== null && _a !== void 0 ? _a : 'GameDebugClient reported failure', result.data);
        }
        // Built-in screenshot path: client sends back a base64 dataUrl;
        // landing the bytes to disk on host side keeps the result envelope
        // small and reuses the existing project-rooted capture dir guard.
        if (type === 'screenshot' && result.data && typeof result.data.dataUrl === 'string') {
            const persisted = this.persistGameScreenshot(result.data.dataUrl, result.data.width, result.data.height);
            if (!persisted.ok) {
                return (0, response_1.fail)(persisted.error);
            }
            return (0, response_1.ok)({
                type,
                filePath: persisted.filePath,
                size: persisted.size,
                width: result.data.width,
                height: result.data.height,
            }, `Game canvas captured to ${persisted.filePath}`);
        }
        // v2.9.x T-V29-5: built-in record_stop path — same persistence
        // pattern as screenshot, but with webm/mp4 extension and a
        // separate size cap (recordings can be much larger than stills).
        if (type === 'record_stop' && result.data && typeof result.data.dataUrl === 'string') {
            const persisted = this.persistGameRecording(result.data.dataUrl);
            if (!persisted.ok) {
                return (0, response_1.fail)(persisted.error);
            }
            return (0, response_1.ok)({
                type,
                filePath: persisted.filePath,
                size: persisted.size,
                mimeType: result.data.mimeType,
                durationMs: result.data.durationMs,
            }, `Game canvas recording saved to ${persisted.filePath} (${persisted.size} bytes, ${result.data.durationMs}ms)`);
        }
        return (0, response_1.ok)(Object.assign({ type }, result.data), `Game command ${type} ok`);
    }
    // v2.9.x T-V29-5: thin wrappers around game_command for AI ergonomics.
    // Keep the dispatch path identical to game_command(type='record_*') so
    // there's only one persistence pipeline and one queue. AI still picks
    // these tools first because their schemas are explicit.
    async recordStartImpl(mimeType, videoBitsPerSecond, timeoutMs = 5000, quality, videoCodec) {
        if (quality && videoBitsPerSecond !== undefined) {
            return (0, response_1.fail)('quality and videoBitsPerSecond are mutually exclusive');
        }
        const args = {};
        if (mimeType)
            args.mimeType = mimeType;
        if (typeof videoBitsPerSecond === 'number')
            args.videoBitsPerSecond = videoBitsPerSecond;
        if (quality)
            args.quality = quality;
        if (videoCodec)
            args.videoCodec = videoCodec;
        return this.gameCommandImpl('record_start', args, timeoutMs);
    }
    async recordStopImpl(timeoutMs = 30000) {
        return this.gameCommandImpl('record_stop', {}, timeoutMs);
    }
    async gameClientStatusImpl() {
        return (0, response_1.ok)((0, game_command_queue_1.getClientStatus)());
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
    persistGameRecording(dataUrl) {
        // v2.9.5 review fix attempt 1 used `((?:;[^,]*?)*)` — still
        // rejected at codec-internal commas (e.g. `codecs=vp9,opus`)
        // because the per-param `[^,]*` excludes commas inside any one
        // param's value. v2.9.6 round-2 fix (Gemini 🔴 + Claude 🔴 +
        // Codex 🔴 — 3-reviewer consensus): split on the unambiguous
        // `;base64,` terminator, accept ANY characters in the parameter
        // segment, and validate the payload separately as base64
        // alphabet only (Codex r2 single-🟡 promoted).
        //
        // Use lastIndexOf for the `;base64,` boundary so a param value
        // that happens to contain the literal substring `;base64,` (very
        // unlikely but legal in MIME RFC) is still parsed correctly —
        // the actual base64 always ends the URL.
        const m = /^data:video\/(webm|mp4)([^]*?);base64,([A-Za-z0-9+/]*={0,2})$/i.exec(dataUrl);
        if (!m) {
            return { ok: false, error: 'GameDebugClient returned recording dataUrl in unexpected format (expected data:video/{webm|mp4}[;codecs=...];base64,<base64>). The base64 segment must be a valid base64 alphabet string.' };
        }
        const b64Len = m[3].length;
        const approxBytes = Math.ceil(b64Len * 3 / 4);
        if (approxBytes > DebugTools.MAX_GAME_RECORDING_BYTES) {
            return { ok: false, error: `recording payload too large: ~${approxBytes} bytes exceeds cap ${DebugTools.MAX_GAME_RECORDING_BYTES}. Lower videoBitsPerSecond or reduce recording duration.` };
        }
        // m[1] is already the bare 'webm'|'mp4'; m[2] is the param tail
        // (`;codecs=...`, may include codec-internal commas); m[3] is the
        // validated base64 payload.
        const ext = m[1].toLowerCase() === 'mp4' ? 'mp4' : 'webm';
        const buf = Buffer.from(m[3], 'base64');
        if (buf.length > DebugTools.MAX_GAME_RECORDING_BYTES) {
            return { ok: false, error: `recording payload too large after decode: ${buf.length} bytes exceeds cap ${DebugTools.MAX_GAME_RECORDING_BYTES}` };
        }
        const resolved = this.resolveAutoCaptureFile(`recording-${Date.now()}.${ext}`);
        if (!resolved.ok)
            return { ok: false, error: resolved.error };
        fs.writeFileSync(resolved.filePath, buf);
        return { ok: true, filePath: resolved.filePath, size: buf.length };
    }
    // v2.4.8 A1: TS diagnostics handlers ----------------------------------
    async waitCompileImpl(timeoutMs = 15000) {
        var _a, _b, _c;
        const projectPath = (_a = Editor === null || Editor === void 0 ? void 0 : Editor.Project) === null || _a === void 0 ? void 0 : _a.path;
        if (!projectPath) {
            return (0, response_1.fail)('wait_compile: editor context unavailable (no Editor.Project.path)');
        }
        const result = await (0, ts_diagnostics_1.waitForCompile)(projectPath, timeoutMs);
        if (!result.success) {
            return (0, response_1.fail)((_b = result.error) !== null && _b !== void 0 ? _b : 'wait_compile failed', result);
        }
        return (0, response_1.ok)(result, result.compiled
            ? `Compile finished in ${result.waitedMs}ms`
            : ((_c = result.note) !== null && _c !== void 0 ? _c : 'No compile triggered or timed out'));
    }
    async runScriptDiagnosticsImpl(tsconfigPath) {
        var _a;
        const projectPath = (_a = Editor === null || Editor === void 0 ? void 0 : Editor.Project) === null || _a === void 0 ? void 0 : _a.path;
        if (!projectPath) {
            return (0, response_1.fail)('run_script_diagnostics: editor context unavailable (no Editor.Project.path)');
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
    async getScriptDiagnosticContextImpl(file, line, contextLines = 5) {
        var _a;
        const projectPath = (_a = Editor === null || Editor === void 0 ? void 0 : Editor.Project) === null || _a === void 0 ? void 0 : _a.path;
        if (!projectPath) {
            return (0, response_1.fail)('get_script_diagnostic_context: editor context unavailable');
        }
        // v2.9.x polish (Gemini r2 single-🟡 from v2.8.1 review): converge
        // on assertSavePathWithinProject. The previous bespoke realpath
        // + toLowerCase + path.sep check is functionally subsumed by the
        // shared helper (which itself moved to the path.relative-based
        // isPathWithinRoot in v2.9.x polish #1, handling drive-root and
        // prefix-collision edges uniformly).
        const guard = this.assertSavePathWithinProject(file);
        if (!guard.ok) {
            return (0, response_1.fail)(`get_script_diagnostic_context: ${guard.error}`);
        }
        const resolved = guard.resolvedPath;
        if (!fs.existsSync(resolved)) {
            return (0, response_1.fail)(`get_script_diagnostic_context: file not found: ${resolved}`);
        }
        const stat = fs.statSync(resolved);
        if (stat.size > 5 * 1024 * 1024) {
            return (0, response_1.fail)(`get_script_diagnostic_context: file too large (${stat.size} bytes); refusing to read.`);
        }
        const content = fs.readFileSync(resolved, 'utf8');
        const allLines = content.split(/\r?\n/);
        if (line < 1 || line > allLines.length) {
            return (0, response_1.fail)(`get_script_diagnostic_context: line ${line} out of range 1..${allLines.length}`);
        }
        const start = Math.max(1, line - contextLines);
        const end = Math.min(allLines.length, line + contextLines);
        const window = allLines.slice(start - 1, end);
        const projectResolvedNorm = path.resolve(projectPath);
        return (0, response_1.ok)({
            file: path.relative(projectResolvedNorm, resolved),
            absolutePath: resolved,
            targetLine: line,
            startLine: start,
            endLine: end,
            totalLines: allLines.length,
            lines: window.map((text, i) => ({ line: start + i, text })),
        }, `Read ${window.length} lines of context around ${path.relative(projectResolvedNorm, resolved)}:${line}`);
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
// v2.9.x T-V29-5: same shape as persistGameScreenshot but for video
// recordings (webm/mp4) returned by record_stop. Recordings can run
// tens of seconds and produce significantly larger payloads than
// stills.
//
// v2.9.5 review fix (Gemini 🟡 + Codex 🟡): bumped 32 → 64 MB to
// accommodate higher-bitrate / longer recordings (5-20 Mbps × 30-60s
// = 18-150 MB). Kept in sync with MAX_REQUEST_BODY_BYTES in
// mcp-server-sdk.ts; lower one to dial back if memory pressure
// becomes a concern. base64-decoded byte count is rejected pre-decode
// to avoid Buffer allocation spikes on malicious clients.
DebugTools.MAX_GAME_RECORDING_BYTES = 64 * 1024 * 1024;
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'clear_console',
        title: 'Clear console',
        description: '[specialist] Clear the Cocos Editor Console UI. No project side effects.',
        inputSchema: schema_1.z.object({}),
    })
], DebugTools.prototype, "clearConsole", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'execute_javascript',
        title: 'Execute JavaScript',
        description: '[primary] Execute JavaScript in scene or editor context. Use this as the default first tool for compound operations (read → mutate → verify) — one call replaces 5-10 narrow specialist tools and avoids per-call token overhead. context="scene" inspects/mutates cc.Node graph; context="editor" runs in host process for Editor.Message + fs (default off, opt-in).',
        inputSchema: schema_1.z.object({
            code: schema_1.z.string().describe('JavaScript source to execute. Has access to cc.* in scene context, Editor.* in editor context.'),
            context: schema_1.z.enum(['scene', 'editor']).default('scene').describe('Execution sandbox. "scene" runs inside the cocos scene script context (cc, director, find). "editor" runs in the editor host process (Editor, asset-db, fs, require). Editor context is OFF by default and must be opt-in via panel setting `enableEditorContextEval` — arbitrary code in the host process is a prompt-injection risk.'),
        }),
    })
], DebugTools.prototype, "executeJavascript", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'execute_script',
        title: 'Run scene JavaScript',
        description: '[compat] Scene-only JavaScript eval. Prefer execute_javascript with context="scene" — kept as compatibility entrypoint for older clients.',
        inputSchema: schema_1.z.object({
            script: schema_1.z.string().describe('JavaScript to execute in scene context via console/eval. Can read or mutate the current scene.'),
        }),
    })
], DebugTools.prototype, "executeScript", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'get_node_tree',
        title: 'Read debug node tree',
        description: '[specialist] Read a debug node tree from a root or scene root for hierarchy/component inspection.',
        inputSchema: schema_1.z.object({
            rootUuid: schema_1.z.string().optional().describe('Root node UUID to expand. Omit to use the current scene root.'),
            maxDepth: schema_1.z.number().default(10).describe('Maximum tree depth. Default 10; large values can return a lot of data.'),
        }),
    })
], DebugTools.prototype, "getNodeTree", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'get_performance_stats',
        title: 'Read performance stats',
        description: '[specialist] Try to read scene query-performance stats; may return unavailable in edit mode.',
        inputSchema: schema_1.z.object({}),
    })
], DebugTools.prototype, "getPerformanceStats", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'validate_scene',
        title: 'Validate current scene',
        description: '[specialist] Run basic current-scene health checks for missing assets and node-count warnings.',
        inputSchema: schema_1.z.object({
            checkMissingAssets: schema_1.z.boolean().default(true).describe('Check missing asset references when the Cocos scene API supports it.'),
            checkPerformance: schema_1.z.boolean().default(true).describe('Run basic performance checks such as high node count warnings.'),
        }),
    })
], DebugTools.prototype, "validateScene", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'get_editor_info',
        title: 'Read editor info',
        description: '[specialist] Read Editor/Cocos/project/process information and memory summary.',
        inputSchema: schema_1.z.object({}),
    })
], DebugTools.prototype, "getEditorInfo", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'get_project_logs',
        title: 'Read project logs',
        description: '[specialist] Read temp/logs/project.log tail with optional level/keyword filters.',
        inputSchema: schema_1.z.object({
            lines: schema_1.z.number().min(1).max(10000).default(100).describe('Number of lines to read from the end of temp/logs/project.log. Default 100.'),
            filterKeyword: schema_1.z.string().optional().describe('Optional case-insensitive keyword filter.'),
            logLevel: schema_1.z.enum(['ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE', 'ALL']).default('ALL').describe('Optional log level filter. ALL disables level filtering.'),
        }),
    })
], DebugTools.prototype, "getProjectLogs", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'get_log_file_info',
        title: 'Read log file info',
        description: '[specialist] Read temp/logs/project.log path, size, line count, and timestamps.',
        inputSchema: schema_1.z.object({}),
    })
], DebugTools.prototype, "getLogFileInfo", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'search_project_logs',
        title: 'Search project logs',
        description: '[specialist] Search temp/logs/project.log for string/regex and return line context.',
        inputSchema: schema_1.z.object({
            pattern: schema_1.z.string().describe('Search string or regex. Invalid regex is treated as a literal string.'),
            maxResults: schema_1.z.number().min(1).max(100).default(20).describe('Maximum matches to return. Default 20.'),
            contextLines: schema_1.z.number().min(0).max(10).default(2).describe('Context lines before/after each match. Default 2.'),
        }),
    })
], DebugTools.prototype, "searchProjectLogs", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'screenshot',
        title: 'Capture editor screenshot',
        description: '[specialist] Capture the focused Cocos Editor window (or a window matched by title) to a PNG. Returns saved file path. Use this for AI visual verification after scene/UI changes.',
        inputSchema: schema_1.z.object({
            savePath: schema_1.z.string().optional().describe('Absolute filesystem path to save the PNG. Must resolve inside the cocos project root (containment check via realpath). Omit to auto-name into <project>/temp/mcp-captures/screenshot-<timestamp>.png.'),
            windowTitle: schema_1.z.string().optional().describe('Optional substring match on window title to pick a specific Electron window. Default: focused window.'),
            includeBase64: schema_1.z.boolean().default(false).describe('Embed PNG bytes as base64 in response data (large; default false). When false, only the saved file path is returned.'),
        }),
    })
], DebugTools.prototype, "screenshot", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'capture_preview_screenshot',
        title: 'Capture preview screenshot',
        description: '[specialist] Capture the cocos Preview-in-Editor (PIE) gameview to a PNG. Cocos has multiple PIE render targets depending on the user\'s preview config (Preferences → Preview → Open Preview With): "browser" opens an external browser (NOT capturable here), "window" / "simulator" opens a separate Electron window (title contains "Preview"), "embedded" renders the gameview inside the main editor window. The default mode="auto" tries the Preview-titled window first and falls back to capturing the main editor window when no Preview-titled window exists (covers embedded mode). Use mode="window" to force the separate-window strategy or mode="embedded" to skip the window probe. Pair with debug_get_preview_mode to read the cocos config and route deterministically. For runtime game-canvas pixel-level capture (camera RenderTexture), use debug_game_command(type="screenshot") instead.',
        inputSchema: schema_1.z.object({
            savePath: schema_1.z.string().optional().describe('Absolute filesystem path to save the PNG. Must resolve inside the cocos project root (containment check via realpath). Omit to auto-name into <project>/temp/mcp-captures/preview-<timestamp>.png.'),
            mode: schema_1.z.enum(['auto', 'window', 'embedded']).default('auto').describe('Capture target. "auto" (default) tries Preview-titled window then falls back to the main editor window. "window" only matches Preview-titled windows (fails if none). "embedded" captures the main editor window directly (skip Preview-window probe).'),
            windowTitle: schema_1.z.string().default('Preview').describe('Substring matched against window titles in window/auto modes (default "Preview" for PIE). Ignored in embedded mode.'),
            includeBase64: schema_1.z.boolean().default(false).describe('Embed PNG bytes as base64 in response data (large; default false).'),
        }),
    })
], DebugTools.prototype, "capturePreviewScreenshot", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'get_preview_mode',
        title: 'Read preview mode',
        description: '[specialist] Read the cocos preview configuration. Uses Editor.Message preferences/query-config so AI can route debug_capture_preview_screenshot to the correct mode. Returns { interpreted: "browser" | "window" | "simulator" | "embedded" | "unknown", raw: <full preview config dump> }. Use before capture: if interpreted="embedded", call capture_preview_screenshot with mode="embedded" or rely on mode="auto" fallback.',
        inputSchema: schema_1.z.object({}),
    })
], DebugTools.prototype, "getPreviewMode", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'set_preview_mode',
        title: 'Set preview mode',
        description: '❌ NOT SUPPORTED on cocos 3.8.7+ (landmine #17). Programmatic preview-mode switching is impossible from a third-party extension on cocos 3.8.7: `preferences/set-config` against `preview.current.platform` returns truthy but never persists, and **none of 6 surveyed reference projects (harady / Spaydo / RomaRogov / cocos-code-mode / FunplayAI / cocos-cli) ship a working alternative** (v2.10 cross-repo refresh, 2026-05-02). The field is effectively read-only — only the cocos preview dropdown writes it. **Use the cocos preview dropdown in the editor toolbar to switch modes**. Default behavior is hard-fail; pass attemptAnyway=true ONLY for diagnostic probing (returns 4-strategy attempt log so you can verify against a future cocos build whether any shape now works).',
        inputSchema: schema_1.z.object({
            mode: schema_1.z.enum(['browser', 'gameView', 'simulator']).describe('Target preview platform. "browser" opens preview in the user default browser. "gameView" embeds the gameview in the main editor (in-editor preview). "simulator" launches the cocos simulator. Maps directly to the cocos preview.current.platform value.'),
            attemptAnyway: schema_1.z.boolean().default(false).describe('Diagnostic opt-in. Default false returns NOT_SUPPORTED with the cocos UI redirect. Set true ONLY to re-probe the 4 set-config shapes against a new cocos build — useful when validating whether a future cocos version exposes a write path. Returns data.attempts with every shape tried and its read-back observation. Does NOT freeze the editor (the call merely no-ops).'),
        }),
    })
], DebugTools.prototype, "setPreviewMode", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'batch_screenshot',
        title: 'Capture batch screenshots',
        description: '[specialist] Capture multiple PNGs of the editor window with optional delays between shots. Useful for animating preview verification or capturing transitions.',
        inputSchema: schema_1.z.object({
            savePathPrefix: schema_1.z.string().optional().describe('Path prefix for batch output files. Files written as <prefix>-<index>.png. Must resolve inside the cocos project root (containment check via realpath). Default: <project>/temp/mcp-captures/batch-<timestamp>.'),
            delaysMs: schema_1.z.array(schema_1.z.number().min(0).max(10000)).max(20).default([0]).describe('Delay (ms) before each capture. Length determines how many shots taken (capped at 20 to prevent disk fill / editor freeze). Default [0] = single shot.'),
            windowTitle: schema_1.z.string().optional().describe('Optional substring match on window title.'),
        }),
    })
], DebugTools.prototype, "batchScreenshot", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'wait_compile',
        title: 'Wait for compile',
        description: '[specialist] Block until cocos finishes its TypeScript compile pass. Tails temp/programming/packer-driver/logs/debug.log for the "Target(editor) ends" marker. Returns immediately with compiled=false if no compile was triggered (clean project / no changes detected). Pair with run_script_diagnostics for an "edit .ts → wait → fetch errors" workflow.',
        inputSchema: schema_1.z.object({
            timeoutMs: schema_1.z.number().min(500).max(120000).default(15000).describe('Max wait time in ms before giving up. Default 15000.'),
        }),
    })
], DebugTools.prototype, "waitCompile", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'run_script_diagnostics',
        title: 'Run script diagnostics',
        description: '[specialist] Run `tsc --noEmit` against the project tsconfig and return parsed diagnostics. Used after wait_compile to surface compilation errors as structured {file, line, column, code, message} entries. Resolves tsc binary from project node_modules → editor bundled engine → npx fallback.',
        inputSchema: schema_1.z.object({
            tsconfigPath: schema_1.z.string().optional().describe('Optional override (absolute or project-relative). Default: tsconfig.json or temp/tsconfig.cocos.json.'),
        }),
    })
], DebugTools.prototype, "runScriptDiagnostics", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'preview_url',
        title: 'Resolve preview URL',
        description: '[specialist] Resolve the cocos browser-preview URL. Uses the documented Editor.Message channel preview/query-preview-url. With action="open", also launches the URL in the user default browser via electron.shell.openExternal — useful as a setup step before debug_game_command, since the GameDebugClient running inside the preview must be reachable. Editor-side Preview-in-Editor play/stop is NOT exposed by the public message API and is intentionally not implemented here; use the cocos editor toolbar manually for PIE.',
        inputSchema: schema_1.z.object({
            action: schema_1.z.enum(['query', 'open']).default('query').describe('"query" returns the URL; "open" returns the URL AND opens it in the user default browser via electron.shell.openExternal.'),
        }),
    })
], DebugTools.prototype, "previewUrl", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'query_devices',
        title: 'List preview devices',
        description: '[specialist] List preview devices configured in the cocos project. Backed by Editor.Message channel device/query. Returns an array of {name, width, height, ratio} entries — useful for batch-screenshot pipelines that target multiple resolutions.',
        inputSchema: schema_1.z.object({}),
    })
], DebugTools.prototype, "queryDevices", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'game_command',
        title: 'Send game command',
        description: '[specialist] Send a runtime command to a connected GameDebugClient. Works inside a cocos preview/build (browser, Preview-in-Editor, or any device that fetches /game/command). Built-in command types: "screenshot" (capture game canvas to PNG, returns saved file path), "click" (emit Button.CLICK on a node by name), "inspect" (dump runtime node info: position/scale/rotation/active/components by name; when present also returns UITransform.contentSize/anchorPoint, Widget alignment flags/offsets, and Layout type/spacing/padding), "state" (dump global game state from the running game client), and "navigate" (switch scene/page by name through the game client\'s router). Custom command types are forwarded to the client\'s customCommands map. Requires the GameDebugClient template (client/cocos-mcp-client.ts) wired into the running game; without it the call times out. Check GET /game/status to verify client liveness first.',
        inputSchema: schema_1.z.object({
            type: schema_1.z.string().min(1).describe('Command type. Built-ins: screenshot, click, inspect, state, navigate. Customs: any string the GameDebugClient registered in customCommands.'),
            args: schema_1.z.any().optional().describe('Command-specific arguments. For "click"/"inspect": {name: string} node name. For "navigate": {pageName: string} or {page: string}. For "state"/"screenshot": {} (no args).'),
            timeoutMs: schema_1.z.number().min(500).max(60000).default(10000).describe('Max wait for client response. Default 10000ms.'),
        }),
    })
], DebugTools.prototype, "gameCommand", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'record_start',
        title: 'Start game recording',
        description: '[specialist] Start recording the running game canvas via the GameDebugClient (browser/PIE preview only). Wraps debug_game_command(type="record_start") for AI ergonomics. Returns immediately with { recording: true, mimeType }; the recording continues until debug_record_stop is called. Browser-only — fails on native cocos builds (MediaRecorder API requires a DOM canvas + captureStream). Single-flight per client: a second record_start while a recording is in progress returns success:false. Pair with debug_game_client_status to confirm a client is connected before calling.',
        inputSchema: schema_1.z.object({
            mimeType: schema_1.z.enum(['video/webm', 'video/mp4']).optional().describe('Container/codec hint for MediaRecorder. Default: browser auto-pick (webm preferred where supported, falls back to mp4). Some browsers reject unsupported types — record_start surfaces a clear error in that case.'),
            videoBitsPerSecond: schema_1.z.number().min(100000).max(20000000).optional().describe('Optional MediaRecorder bitrate hint in bits/sec. Lower → smaller files but lower quality. Browser default if omitted.'),
            timeoutMs: schema_1.z.number().min(500).max(30000).default(5000).describe('Max wait for the GameDebugClient to acknowledge record_start. Recording itself runs until debug_record_stop. Default 5000ms.'),
        }),
    })
], DebugTools.prototype, "recordStart", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'record_stop',
        title: 'Stop game recording',
        description: '[specialist] Stop the in-progress game canvas recording and persist it under <project>/temp/mcp-captures. Wraps debug_game_command(type="record_stop"). Returns { filePath, size, mimeType, durationMs }. Calling without a prior record_start returns success:false. The host applies the same realpath containment guard + 64MB byte cap (synced with the request body cap in mcp-server-sdk.ts; v2.9.6 raised both from 32 to 64MB); raise videoBitsPerSecond / reduce recording duration on cap rejection.',
        inputSchema: schema_1.z.object({
            timeoutMs: schema_1.z.number().min(1000).max(120000).default(30000).describe('Max wait for the client to assemble + return the recording blob. Recordings of several seconds at high bitrate may need longer than the default 30s — raise on long recordings.'),
        }),
    })
], DebugTools.prototype, "recordStop", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'game_client_status',
        title: 'Read game client status',
        description: '[specialist] Read GameDebugClient connection status. Includes connected (polled within 2s), last poll timestamp, and whether a command is queued. Use before debug_game_command to confirm the client is reachable.',
        inputSchema: schema_1.z.object({}),
    })
], DebugTools.prototype, "gameClientStatus", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'check_editor_health',
        title: 'Check editor health',
        description: '[specialist] Probe whether the cocos editor scene-script renderer is responsive. Useful after debug_preview_control(start) — landmine #16 documents that cocos 3.8.7 sometimes freezes the scene-script renderer (spinning indicator, Ctrl+R required). Strategy (v2.9.6): three probes — (1) host: device/query (main process, always responsive even when scene-script is wedged); (2) scene/query-is-ready typed channel — direct IPC into the scene module, hangs when scene renderer is frozen; (3) scene/query-node-tree typed channel — returns the full scene tree, forces an actual scene-graph walk through the wedged code path. Each probe has its own timeout race (default 1500ms each). Scene declared alive only when BOTH (2) returns true AND (3) returns a non-null tree within the timeout. Returns { hostAlive, sceneAlive, sceneLatencyMs, hostError, sceneError, totalProbeMs }. AI workflow: call after preview_control(start); if sceneAlive=false, surface "cocos editor likely frozen — press Ctrl+R" instead of issuing more scene-bound calls.',
        inputSchema: schema_1.z.object({
            sceneTimeoutMs: schema_1.z.number().min(200).max(10000).default(1500).describe('Timeout for the scene-script probe in ms. Below this scene is considered frozen. Default 1500ms.'),
        }),
    })
], DebugTools.prototype, "checkEditorHealth", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'preview_control',
        title: 'Control preview playback',
        description: '⚠ PARKED — start FREEZES cocos 3.8.7 (landmine #16). Programmatically start or stop Preview-in-Editor (PIE) play mode. Wraps the typed cce.SceneFacadeManager.changePreviewPlayState method. **start hits a cocos 3.8.7 softReloadScene race** that returns success but freezes the editor (spinning indicator, Ctrl+R required to recover). Verified in both embedded and browser preview modes. v2.10 cross-repo refresh confirmed: none of 6 surveyed peers (harady / Spaydo / RomaRogov / cocos-code-mode / FunplayAI / cocos-cli) ship a safer call path — harady and cocos-code-mode use the `Editor.Message scene/editor-preview-set-play` channel and hit the same race. **stop is safe** and reliable. To prevent accidental triggering, start requires explicit `acknowledgeFreezeRisk: true`. **Strongly preferred alternatives instead of start**: (a) debug_capture_preview_screenshot(mode="embedded") in EDIT mode — no PIE needed; (b) debug_game_command(type="screenshot") via GameDebugClient on browser preview launched via debug_preview_url(action="open").',
        inputSchema: schema_1.z.object({
            op: schema_1.z.enum(['start', 'stop']).describe('"start" enters PIE play mode (equivalent to clicking the toolbar play button) — REQUIRES acknowledgeFreezeRisk=true on cocos 3.8.7 due to landmine #16. "stop" exits PIE play and returns to scene mode (always safe).'),
            acknowledgeFreezeRisk: schema_1.z.boolean().default(false).describe('Required to be true for op="start" on cocos 3.8.7 due to landmine #16 (softReloadScene race that freezes the editor). Set true ONLY when the human user has explicitly accepted the risk and is prepared to press Ctrl+R if the editor freezes. Ignored for op="stop" which is reliable.'),
        }),
    })
], DebugTools.prototype, "previewControl", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'get_script_diagnostic_context',
        title: 'Read diagnostic context',
        description: '[specialist] Read a window of source lines around a diagnostic location so AI can read the offending code without a separate file read. Pair with run_script_diagnostics: pass file/line from each diagnostic to fetch context.',
        inputSchema: schema_1.z.object({
            file: schema_1.z.string().describe('Absolute or project-relative path to the source file. Diagnostics from run_script_diagnostics already use a path tsc emitted, which is suitable here.'),
            line: schema_1.z.number().min(1).describe('1-based line number that the diagnostic points at.'),
            contextLines: schema_1.z.number().min(0).max(50).default(5).describe('Number of lines to include before and after the target line. Default 5 (±5 → 11-line window).'),
        }),
    })
], DebugTools.prototype, "getScriptDiagnosticContext", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWctdG9vbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvdG9vbHMvZGVidWctdG9vbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsOENBQTJDO0FBRzNDLGtEQUFzRjtBQUN0Rix3REFBa0U7QUFDbEUsMENBQWtDO0FBQ2xDLGtEQUF1RTtBQUN2RSwwREFBNkU7QUFDN0Usa0VBQWtHO0FBQ2xHLHNEQUFtRTtBQUNuRSx1Q0FBeUI7QUFDekIsMkNBQTZCO0FBRTdCLGtFQUFrRTtBQUNsRSx3RUFBd0U7QUFDeEUseUVBQXlFO0FBQ3pFLGtFQUFrRTtBQUNsRSxpQ0FBaUM7QUFDakMsRUFBRTtBQUNGLGtFQUFrRTtBQUNsRSxtRUFBbUU7QUFDbkUsNkRBQTZEO0FBQzdELGtFQUFrRTtBQUNsRSxxRUFBcUU7QUFDckUsc0VBQXNFO0FBQ3RFLG1FQUFtRTtBQUNuRSw4REFBOEQ7QUFDOUQsbUVBQW1FO0FBQ25FLDhEQUE4RDtBQUM5RCw0Q0FBNEM7QUFDNUMsU0FBUyxnQkFBZ0IsQ0FBQyxTQUFpQixFQUFFLElBQVk7SUFDckQsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUN4QyxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ25DLElBQUksT0FBTyxLQUFLLE9BQU87UUFBRSxPQUFPLElBQUksQ0FBQztJQUNyQyxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sRUFBRSxPQUFPLENBQUMsQ0FBQztJQUM1QyxJQUFJLENBQUMsR0FBRztRQUFFLE9BQU8sSUFBSSxDQUFDLENBQThCLFlBQVk7SUFDaEUscUVBQXFFO0lBQ3JFLGtFQUFrRTtJQUNsRSxvRUFBb0U7SUFDcEUsNkNBQTZDO0lBQzdDLElBQUksR0FBRyxLQUFL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LENBQUMsT0FBTyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLHdOQUF3TixDQUFDO1lBQ2hRLHFCQUFxQixFQUFFLFVBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUMsUUFBUSxDQUFDLDBSQUEwUixDQUFDO1NBQ3pWLENBQUM7S0FDYixDQUFDO2dEQUdEO0FBWUs7SUFWTCxJQUFBLG9CQUFPLEVBQUM7UUFDRyxJQUFJLEVBQUUsK0JBQStCO1FBQ3JDLEtBQUssRUFBRSx5QkFBeUI7UUFDaEMsV0FBVyxFQUFFLGlPQUFpTztRQUM5TyxXQUFXLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQztZQUNsQixJQUFJLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyx1SkFBdUosQ0FBQztZQUNsTCxJQUFJLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsb0RBQW9ELENBQUM7WUFDdEYsWUFBWSxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsK0ZBQStGLENBQUM7U0FDL0osQ0FBQztLQUNiLENBQUM7NERBR0QiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBvaywgZmFpbCB9IGZyb20gJy4uL2xpYi9yZXNwb25zZSc7XG5pbXBvcnQgdHlwZSB7IFRvb2xEZWZpbml0aW9uLCBUb29sUmVzcG9uc2UsIFRvb2xFeGVjdXRvciwgUGVyZm9ybWFuY2VTdGF0cywgVmFsaWRhdGlvblJlc3VsdCwgVmFsaWRhdGlvbklzc3VlIH0gZnJvbSAnLi4vdHlwZXMnO1xuaW1wb3J0IHsgZGVidWdMb2cgfSBmcm9tICcuLi9saWIvbG9nJztcbmltcG9ydCB7IGZpbHRlckJ5TGV2ZWwsIGZpbHRlckJ5S2V5d29yZCwgc2VhcmNoV2l0aENvbnRleHQgfSBmcm9tICcuLi9saWIvbG9nLXBhcnNlcic7XG5pbXBvcnQgeyBpc0VkaXRvckNvbnRleHRFdmFsRW5hYmxlZCB9IGZyb20gJy4uL2xpYi9ydW50aW1lLWZsYWdzJztcbmltcG9ydCB7IHogfSBmcm9tICcuLi9saWIvc2NoZW1hJztcbmltcG9ydCB7IG1jcFRvb2wsIGRlZmluZVRvb2xzRnJvbURlY29yYXRvcnMgfSBmcm9tICcuLi9saWIvZGVjb3JhdG9ycyc7XG5pbXBvcnQgeyBydW5TY3JpcHREaWFnbm9zdGljcywgd2FpdEZvckNvbXBpbGUgfSBmcm9tICcuLi9saWIvdHMtZGlhZ25vc3RpY3MnO1xuaW1wb3J0IHsgcXVldWVHYW1lQ29tbWFuZCwgYXdhaXRDb21tYW5kUmVzdWx0LCBnZXRDbGllbnRTdGF0dXMgfSBmcm9tICcuLi9saWIvZ2FtZS1jb21tYW5kLXF1ZXVlJztcbmltcG9ydCB7IHJ1blNjZW5lTWV0aG9kQXNUb29sUmVzcG9uc2UgfSBmcm9tICcuLi9saWIvc2NlbmUtYnJpZGdlJztcbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5cbi8vIHYyLjkueCBwb2xpc2g6IGNvbnRhaW5tZW50IGhlbHBlciB0aGF0IGhhbmRsZXMgZHJpdmUtcm9vdCBlZGdlc1xuLy8gKEM6XFwpLCBwcmVmaXgtY29sbGlzaW9uIChDOlxcZm9vIHZzIEM6XFxmb29iYXIpLCBhbmQgY3Jvc3Mtdm9sdW1lIHBhdGhzXG4vLyAoRDpcXC4uLiB3aGVuIHJvb3QgaXMgQzpcXCkuIFVzZXMgcGF0aC5yZWxhdGl2ZSB3aGljaCByZXR1cm5zIGEgcmVsYXRpdmVcbi8vIGV4cHJlc3Npb24g4oCUIGlmIHRoZSByZXN1bHQgc3RhcnRzIHdpdGggYC4uYCBvciBpcyBhYnNvbHV0ZSwgdGhlXG4vLyBjYW5kaWRhdGUgaXMgb3V0c2lkZSB0aGUgcm9vdC5cbi8vXG4vLyBUT0NUT1Ugbm90ZSAoQ29kZXggcjEgKyBHZW1pbmkgcjEgc2luZ2xlLfCfn6EgZnJvbSB2Mi44LjEgcmV2aWV3LFxuLy8gcmV2aWV3ZWQgdjIuOS54IGFuZCBhY2NlcHRlZCBhcyByZXNpZHVhbCByaXNrKTogdGhlcmUgaXMgYSBzbWFsbFxuLy8gcmFjZSB3aW5kb3cgYmV0d2VlbiByZWFscGF0aFN5bmMgY29udGFpbm1lbnQgY2hlY2sgYW5kIHRoZVxuLy8gc3Vic2VxdWVudCB3cml0ZUZpbGVTeW5jIOKAlCBhIG1hbGljaW91cyBzeW1saW5rIHN3YXAgZHVyaW5nIHRoYXRcbi8vIHdpbmRvdyBjb3VsZCBlc2NhcGUuIEZ1bGwgbWl0aWdhdGlvbiBuZWVkcyBPX05PRk9MTE9XIHdoaWNoIE5vZGUnc1xuLy8gZnMgQVBJIGRvZXNuJ3QgZXhwb3NlIGRpcmVjdGx5LiBHaXZlbiB0aGlzIGlzIGEgbG9jYWwgZGV2IHRvb2wsIG5vdFxuLy8gYSBuZXR3b3JrLWZhY2luZyBzZXJ2aWNlLCBhbmQgdGhlIGF0dGFjayB3aW5kb3cgaXMgbWljcm9zZWNvbmRzLFxuLy8gdGhlIHJpc2sgaXMgYWNjZXB0ZWQgZm9yIG5vdy4gQSBmdXR1cmUgdjIueCBwYXRjaCBjb3VsZCBhZGRcbi8vIGBmcy5vcGVuU3luYyhmaWxlUGF0aCwgJ3d4JylgIGZvciBBVVRPLW5hbWVkIHBhdGhzIG9ubHkgKGNhbGxlci1cbi8vIHByb3ZpZGVkIHNhdmVQYXRoIG5lZWRzIG92ZXJ3cml0ZSBzZW1hbnRpY3MpLiBEb24ndCByZWx5IG9uXG4vLyBjb250YWlubWVudCBmb3Igc2VjdXJpdHktY3JpdGljYWwgd3JpdGVzLlxuZnVuY3Rpb24gaXNQYXRoV2l0aGluUm9vdChjYW5kaWRhdGU6IHN0cmluZywgcm9vdDogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgY29uc3QgY2FuZEFicyA9IHBhdGgucmVzb2x2ZShjYW5kaWRhdGUpO1xuICAgIGNvbnN0IHJvb3RBYnMgPSBwYXRoLnJlc29sdmUocm9vdCk7XG4gICAgaWYgKGNhbmRBYnMgPT09IHJvb3RBYnMpIHJldHVybiB0cnVlO1xuICAgIGNvbnN0IHJlbCA9IHBhdGgucmVsYXRpdmUocm9vdEFicywgY2FuZEFicyk7XG4gICAgaWYgKCFyZWwpIHJldHVybiB0cnVlOyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGlkZW50aWNhbFxuICAgIC8vIHYyLjkuNSByZXZpZXcgZml4IChDb2RleCDwn5+hKTogc3RhcnRzV2l0aCgnLi4nKSB3b3VsZCBhbHNvIHJlamVjdCBhXG4gICAgLy8gbGVnaXRpbWF0ZSBjaGlsZCB3aG9zZSBmaXJzdCBwYXRoIHNlZ21lbnQgbGl0ZXJhbGx5IHN0YXJ0cyB3aXRoXG4gICAgLy8gXCIuLlwiIChlLmcuIGRpcmVjdG9yeSBuYW1lZCBcIi4uZm9vXCIpLiBNYXRjaCBlaXRoZXIgZXhhY3RseSBgLi5gIG9yXG4gICAgLy8gYC4uYCBmb2xsb3dlZCBieSBhIHBhdGggc2VwYXJhdG9yIGluc3RlYWQuXG4gICAgaWYgKHJlbCA9PT0gJy4uJyB8fCByZWwuc3RhcnRzV2l0aCgnLi4nICsgcGF0aC5zZXApKSByZXR1cm4gZmFsc2U7XG4gICAgaWYgKHBhdGguaXNBYnNvbHV0ZShyZWwpKSByZXR1cm4gZmFsc2U7ICAgICAgICAgICAgIC8vIGRpZmZlcmVudCBkcml2ZVxuICAgIHJldHVybiB0cnVlO1xufVxuXG5leHBvcnQgY2xhc3MgRGVidWdUb29scyBpbXBsZW1lbnRzIFRvb2xFeGVjdXRvciB7XG4gICAgcHJpdmF0ZSByZWFkb25seSBleGVjOiBUb29sRXhlY3V0b3I7XG5cbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgdGhpcy5leGVjID0gZGVmaW5lVG9vbHNGcm9tRGVjb3JhdG9ycyh0aGlzKTtcbiAgICB9XG5cbiAgICBnZXRUb29scygpOiBUb29sRGVmaW5pdGlvbltdIHsgcmV0dXJuIHRoaXMuZXhlYy5nZXRUb29scygpOyB9XG4gICAgZXhlY3V0ZSh0b29sTmFtZTogc3RyaW5nLCBhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4geyByZXR1cm4gdGhpcy5leGVjLmV4ZWN1dGUodG9vbE5hbWUsIGFyZ3MpOyB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2NsZWFyX2NvbnNvbGUnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnQ2xlYXIgY29uc29sZScsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gQ2xlYXIgdGhlIENvY29zIEVkaXRvciBDb25zb2xlIFVJLiBObyBwcm9qZWN0IHNpZGUgZWZmZWN0cy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksXG4gICAgfSlcbiAgICBhc3luYyBjbGVhckNvbnNvbGUoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY2xlYXJDb25zb2xlSW1wbCgpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnZXhlY3V0ZV9qYXZhc2NyaXB0JyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ0V4ZWN1dGUgSmF2YVNjcmlwdCcsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdbcHJpbWFyeV0gRXhlY3V0ZSBKYXZhU2NyaXB0IGluIHNjZW5lIG9yIGVkaXRvciBjb250ZXh0LiBVc2UgdGhpcyBhcyB0aGUgZGVmYXVsdCBmaXJzdCB0b29sIGZvciBjb21wb3VuZCBvcGVyYXRpb25zIChyZWFkIOKGkiBtdXRhdGUg4oaSIHZlcmlmeSkg4oCUIG9uZSBjYWxsIHJlcGxhY2VzIDUtMTAgbmFycm93IHNwZWNpYWxpc3QgdG9vbHMgYW5kIGF2b2lkcyBwZXItY2FsbCB0b2tlbiBvdmVyaGVhZC4gY29udGV4dD1cInNjZW5lXCIgaW5zcGVjdHMvbXV0YXRlcyBjYy5Ob2RlIGdyYXBoOyBjb250ZXh0PVwiZWRpdG9yXCIgcnVucyBpbiBob3N0IHByb2Nlc3MgZm9yIEVkaXRvci5NZXNzYWdlICsgZnMgKGRlZmF1bHQgb2ZmLCBvcHQtaW4pLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgY29kZTogei5zdHJpbmcoKS5kZXNjcmliZSgnSmF2YVNjcmlwdCBzb3VyY2UgdG8gZXhlY3V0ZS4gSGFzIGFjY2VzcyB0byBjYy4qIGluIHNjZW5lIGNvbnRleHQsIEVkaXRvci4qIGluIGVkaXRvciBjb250ZXh0LicpLFxuICAgICAgICAgICAgICAgICAgICBjb250ZXh0OiB6LmVudW0oWydzY2VuZScsICdlZGl0b3InXSkuZGVmYXVsdCgnc2NlbmUnKS5kZXNjcmliZSgnRXhlY3V0aW9uIHNhbmRib3guIFwic2NlbmVcIiBydW5zIGluc2lkZSB0aGUgY29jb3Mgc2NlbmUgc2NyaXB0IGNvbnRleHQgKGNjLCBkaXJlY3RvciwgZmluZCkuIFwiZWRpdG9yXCIgcnVucyBpbiB0aGUgZWRpdG9yIGhvc3QgcHJvY2VzcyAoRWRpdG9yLCBhc3NldC1kYiwgZnMsIHJlcXVpcmUpLiBFZGl0b3IgY29udGV4dCBpcyBPRkYgYnkgZGVmYXVsdCBhbmQgbXVzdCBiZSBvcHQtaW4gdmlhIHBhbmVsIHNldHRpbmcgYGVuYWJsZUVkaXRvckNvbnRleHRFdmFsYCDigJQgYXJiaXRyYXJ5IGNvZGUgaW4gdGhlIGhvc3QgcHJvY2VzcyBpcyBhIHByb21wdC1pbmplY3Rpb24gcmlzay4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIGV4ZWN1dGVKYXZhc2NyaXB0KGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLmV4ZWN1dGVKYXZhU2NyaXB0KGFyZ3MuY29kZSwgYXJncy5jb250ZXh0ID8/ICdzY2VuZScpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnZXhlY3V0ZV9zY3JpcHQnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnUnVuIHNjZW5lIEphdmFTY3JpcHQnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnW2NvbXBhdF0gU2NlbmUtb25seSBKYXZhU2NyaXB0IGV2YWwuIFByZWZlciBleGVjdXRlX2phdmFzY3JpcHQgd2l0aCBjb250ZXh0PVwic2NlbmVcIiDigJQga2VwdCBhcyBjb21wYXRpYmlsaXR5IGVudHJ5cG9pbnQgZm9yIG9sZGVyIGNsaWVudHMuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBzY3JpcHQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0phdmFTY3JpcHQgdG8gZXhlY3V0ZSBpbiBzY2VuZSBjb250ZXh0IHZpYSBjb25zb2xlL2V2YWwuIENhbiByZWFkIG9yIG11dGF0ZSB0aGUgY3VycmVudCBzY2VuZS4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIGV4ZWN1dGVTY3JpcHQoYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZXhlY3V0ZVNjcmlwdENvbXBhdChhcmdzLnNjcmlwdCk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICAgICAgICAgIG5hbWU6ICdnZXRfbm9kZV90cmVlJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1JlYWQgZGVidWcgbm9kZSB0cmVlJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBSZWFkIGEgZGVidWcgbm9kZSB0cmVlIGZyb20gYSByb290IG9yIHNjZW5lIHJvb3QgZm9yIGhpZXJhcmNoeS9jb21wb25lbnQgaW5zcGVjdGlvbi4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHJvb3RVdWlkOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1Jvb3Qgbm9kZSBVVUlEIHRvIGV4cGFuZC4gT21pdCB0byB1c2UgdGhlIGN1cnJlbnQgc2NlbmUgcm9vdC4nKSxcbiAgICAgICAgICAgICAgICAgICAgbWF4RGVwdGg6IHoubnVtYmVyKCkuZGVmYXVsdCgxMCkuZGVzY3JpYmUoJ01heGltdW0gdHJlZSBkZXB0aC4gRGVmYXVsdCAxMDsgbGFyZ2UgdmFsdWVzIGNhbiByZXR1cm4gYSBsb3Qgb2YgZGF0YS4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIGdldE5vZGVUcmVlKGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE5vZGVUcmVlSW1wbChhcmdzLnJvb3RVdWlkLCBhcmdzLm1heERlcHRoKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2dldF9wZXJmb3JtYW5jZV9zdGF0cycsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdSZWFkIHBlcmZvcm1hbmNlIHN0YXRzJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBUcnkgdG8gcmVhZCBzY2VuZSBxdWVyeS1wZXJmb3JtYW5jZSBzdGF0czsgbWF5IHJldHVybiB1bmF2YWlsYWJsZSBpbiBlZGl0IG1vZGUuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pLFxuICAgIH0pXG4gICAgYXN5bmMgZ2V0UGVyZm9ybWFuY2VTdGF0cygpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRQZXJmb3JtYW5jZVN0YXRzSW1wbCgpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgICAgICAgICBuYW1lOiAndmFsaWRhdGVfc2NlbmUnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnVmFsaWRhdGUgY3VycmVudCBzY2VuZScsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gUnVuIGJhc2ljIGN1cnJlbnQtc2NlbmUgaGVhbHRoIGNoZWNrcyBmb3IgbWlzc2luZyBhc3NldHMgYW5kIG5vZGUtY291bnQgd2FybmluZ3MuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBjaGVja01pc3NpbmdBc3NldHM6IHouYm9vbGVhbigpLmRlZmF1bHQodHJ1ZSkuZGVzY3JpYmUoJ0NoZWNrIG1pc3NpbmcgYXNzZXQgcmVmZXJlbmNlcyB3aGVuIHRoZSBDb2NvcyBzY2VuZSBBUEkgc3VwcG9ydHMgaXQuJyksXG4gICAgICAgICAgICAgICAgICAgIGNoZWNrUGVyZm9ybWFuY2U6IHouYm9vbGVhbigpLmRlZmF1bHQodHJ1ZSkuZGVzY3JpYmUoJ1J1biBiYXNpYyBwZXJmb3JtYW5jZSBjaGVja3Mgc3VjaCBhcyBoaWdoIG5vZGUgY291bnQgd2FybmluZ3MuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyB2YWxpZGF0ZVNjZW5lKGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLnZhbGlkYXRlU2NlbmVJbXBsKHsgY2hlY2tNaXNzaW5nQXNzZXRzOiBhcmdzLmNoZWNrTWlzc2luZ0Fzc2V0cywgY2hlY2tQZXJmb3JtYW5jZTogYXJncy5jaGVja1BlcmZvcm1hbmNlIH0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnZ2V0X2VkaXRvcl9pbmZvJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1JlYWQgZWRpdG9yIGluZm8nLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFJlYWQgRWRpdG9yL0NvY29zL3Byb2plY3QvcHJvY2VzcyBpbmZvcm1hdGlvbiBhbmQgbWVtb3J5IHN1bW1hcnkuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pLFxuICAgIH0pXG4gICAgYXN5bmMgZ2V0RWRpdG9ySW5mbygpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRFZGl0b3JJbmZvSW1wbCgpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnZ2V0X3Byb2plY3RfbG9ncycsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdSZWFkIHByb2plY3QgbG9ncycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gUmVhZCB0ZW1wL2xvZ3MvcHJvamVjdC5sb2cgdGFpbCB3aXRoIG9wdGlvbmFsIGxldmVsL2tleXdvcmQgZmlsdGVycy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIGxpbmVzOiB6Lm51bWJlcigpLm1pbigxKS5tYXgoMTAwMDApLmRlZmF1bHQoMTAwKS5kZXNjcmliZSgnTnVtYmVyIG9mIGxpbmVzIHRvIHJlYWQgZnJvbSB0aGUgZW5kIG9mIHRlbXAvbG9ncy9wcm9qZWN0LmxvZy4gRGVmYXVsdCAxMDAuJyksXG4gICAgICAgICAgICAgICAgICAgIGZpbHRlcktleXdvcmQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnT3B0aW9uYWwgY2FzZS1pbnNlbnNpdGl2ZSBrZXl3b3JkIGZpbHRlci4nKSxcbiAgICAgICAgICAgICAgICAgICAgbG9nTGV2ZWw6IHouZW51bShbJ0VSUk9SJywgJ1dBUk4nLCAnSU5GTycsICdERUJVRycsICdUUkFDRScsICdBTEwnXSkuZGVmYXVsdCgnQUxMJykuZGVzY3JpYmUoJ09wdGlvbmFsIGxvZyBsZXZlbCBmaWx0ZXIuIEFMTCBkaXNhYmxlcyBsZXZlbCBmaWx0ZXJpbmcuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBnZXRQcm9qZWN0TG9ncyhhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRQcm9qZWN0TG9nc0ltcGwoYXJncy5saW5lcywgYXJncy5maWx0ZXJLZXl3b3JkLCBhcmdzLmxvZ0xldmVsKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2dldF9sb2dfZmlsZV9pbmZvJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1JlYWQgbG9nIGZpbGUgaW5mbycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gUmVhZCB0ZW1wL2xvZ3MvcHJvamVjdC5sb2cgcGF0aCwgc2l6ZSwgbGluZSBjb3VudCwgYW5kIHRpbWVzdGFtcHMuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pLFxuICAgIH0pXG4gICAgYXN5bmMgZ2V0TG9nRmlsZUluZm8oKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0TG9nRmlsZUluZm9JbXBsKCk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICAgICAgICAgIG5hbWU6ICdzZWFyY2hfcHJvamVjdF9sb2dzJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1NlYXJjaCBwcm9qZWN0IGxvZ3MnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFNlYXJjaCB0ZW1wL2xvZ3MvcHJvamVjdC5sb2cgZm9yIHN0cmluZy9yZWdleCBhbmQgcmV0dXJuIGxpbmUgY29udGV4dC4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHBhdHRlcm46IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1NlYXJjaCBzdHJpbmcgb3IgcmVnZXguIEludmFsaWQgcmVnZXggaXMgdHJlYXRlZCBhcyBhIGxpdGVyYWwgc3RyaW5nLicpLFxuICAgICAgICAgICAgICAgICAgICBtYXhSZXN1bHRzOiB6Lm51bWJlcigpLm1pbigxKS5tYXgoMTAwKS5kZWZhdWx0KDIwKS5kZXNjcmliZSgnTWF4aW11bSBtYXRjaGVzIHRvIHJldHVybi4gRGVmYXVsdCAyMC4nKSxcbiAgICAgICAgICAgICAgICAgICAgY29udGV4dExpbmVzOiB6Lm51bWJlcigpLm1pbigwKS5tYXgoMTApLmRlZmF1bHQoMikuZGVzY3JpYmUoJ0NvbnRleHQgbGluZXMgYmVmb3JlL2FmdGVyIGVhY2ggbWF0Y2guIERlZmF1bHQgMi4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIHNlYXJjaFByb2plY3RMb2dzKGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLnNlYXJjaFByb2plY3RMb2dzSW1wbChhcmdzLnBhdHRlcm4sIGFyZ3MubWF4UmVzdWx0cywgYXJncy5jb250ZXh0TGluZXMpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnc2NyZWVuc2hvdCcsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdDYXB0dXJlIGVkaXRvciBzY3JlZW5zaG90JyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBDYXB0dXJlIHRoZSBmb2N1c2VkIENvY29zIEVkaXRvciB3aW5kb3cgKG9yIGEgd2luZG93IG1hdGNoZWQgYnkgdGl0bGUpIHRvIGEgUE5HLiBSZXR1cm5zIHNhdmVkIGZpbGUgcGF0aC4gVXNlIHRoaXMgZm9yIEFJIHZpc3VhbCB2ZXJpZmljYXRpb24gYWZ0ZXIgc2NlbmUvVUkgY2hhbmdlcy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHNhdmVQYXRoOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0Fic29sdXRlIGZpbGVzeXN0ZW0gcGF0aCB0byBzYXZlIHRoZSBQTkcuIE11c3QgcmVzb2x2ZSBpbnNpZGUgdGhlIGNvY29zIHByb2plY3Qgcm9vdCAoY29udGFpbm1lbnQgY2hlY2sgdmlhIHJlYWxwYXRoKS4gT21pdCB0byBhdXRvLW5hbWUgaW50byA8cHJvamVjdD4vdGVtcC9tY3AtY2FwdHVyZXMvc2NyZWVuc2hvdC08dGltZXN0YW1wPi5wbmcuJyksXG4gICAgICAgICAgICAgICAgICAgIHdpbmRvd1RpdGxlOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ09wdGlvbmFsIHN1YnN0cmluZyBtYXRjaCBvbiB3aW5kb3cgdGl0bGUgdG8gcGljayBhIHNwZWNpZmljIEVsZWN0cm9uIHdpbmRvdy4gRGVmYXVsdDogZm9jdXNlZCB3aW5kb3cuJyksXG4gICAgICAgICAgICAgICAgICAgIGluY2x1ZGVCYXNlNjQ6IHouYm9vbGVhbigpLmRlZmF1bHQoZmFsc2UpLmRlc2NyaWJlKCdFbWJlZCBQTkcgYnl0ZXMgYXMgYmFzZTY0IGluIHJlc3BvbnNlIGRhdGEgKGxhcmdlOyBkZWZhdWx0IGZhbHNlKS4gV2hlbiBmYWxzZSwgb25seSB0aGUgc2F2ZWQgZmlsZSBwYXRoIGlzIHJldHVybmVkLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgc2NyZWVuc2hvdChhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5zY3JlZW5zaG90SW1wbChhcmdzLnNhdmVQYXRoLCBhcmdzLndpbmRvd1RpdGxlLCBhcmdzLmluY2x1ZGVCYXNlNjQpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnY2FwdHVyZV9wcmV2aWV3X3NjcmVlbnNob3QnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnQ2FwdHVyZSBwcmV2aWV3IHNjcmVlbnNob3QnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIENhcHR1cmUgdGhlIGNvY29zIFByZXZpZXctaW4tRWRpdG9yIChQSUUpIGdhbWV2aWV3IHRvIGEgUE5HLiBDb2NvcyBoYXMgbXVsdGlwbGUgUElFIHJlbmRlciB0YXJnZXRzIGRlcGVuZGluZyBvbiB0aGUgdXNlclxcJ3MgcHJldmlldyBjb25maWcgKFByZWZlcmVuY2VzIOKGkiBQcmV2aWV3IOKGkiBPcGVuIFByZXZpZXcgV2l0aCk6IFwiYnJvd3NlclwiIG9wZW5zIGFuIGV4dGVybmFsIGJyb3dzZXIgKE5PVCBjYXB0dXJhYmxlIGhlcmUpLCBcIndpbmRvd1wiIC8gXCJzaW11bGF0b3JcIiBvcGVucyBhIHNlcGFyYXRlIEVsZWN0cm9uIHdpbmRvdyAodGl0bGUgY29udGFpbnMgXCJQcmV2aWV3XCIpLCBcImVtYmVkZGVkXCIgcmVuZGVycyB0aGUgZ2FtZXZpZXcgaW5zaWRlIHRoZSBtYWluIGVkaXRvciB3aW5kb3cuIFRoZSBkZWZhdWx0IG1vZGU9XCJhdXRvXCIgdHJpZXMgdGhlIFByZXZpZXctdGl0bGVkIHdpbmRvdyBmaXJzdCBhbmQgZmFsbHMgYmFjayB0byBjYXB0dXJpbmcgdGhlIG1haW4gZWRpdG9yIHdpbmRvdyB3aGVuIG5vIFByZXZpZXctdGl0bGVkIHdpbmRvdyBleGlzdHMgKGNvdmVycyBlbWJlZGRlZCBtb2RlKS4gVXNlIG1vZGU9XCJ3aW5kb3dcIiB0byBmb3JjZSB0aGUgc2VwYXJhdGUtd2luZG93IHN0cmF0ZWd5IG9yIG1vZGU9XCJlbWJlZGRlZFwiIHRvIHNraXAgdGhlIHdpbmRvdyBwcm9iZS4gUGFpciB3aXRoIGRlYnVnX2dldF9wcmV2aWV3X21vZGUgdG8gcmVhZCB0aGUgY29jb3MgY29uZmlnIGFuZCByb3V0ZSBkZXRlcm1pbmlzdGljYWxseS4gRm9yIHJ1bnRpbWUgZ2FtZS1jYW52YXMgcGl4ZWwtbGV2ZWwgY2FwdHVyZSAoY2FtZXJhIFJlbmRlclRleHR1cmUpLCB1c2UgZGVidWdfZ2FtZV9jb21tYW5kKHR5cGU9XCJzY3JlZW5zaG90XCIpIGluc3RlYWQuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBzYXZlUGF0aDogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdBYnNvbHV0ZSBmaWxlc3lzdGVtIHBhdGggdG8gc2F2ZSB0aGUgUE5HLiBNdXN0IHJlc29sdmUgaW5zaWRlIHRoZSBjb2NvcyBwcm9qZWN0IHJvb3QgKGNvbnRhaW5tZW50IGNoZWNrIHZpYSByZWFscGF0aCkuIE9taXQgdG8gYXV0by1uYW1lIGludG8gPHByb2plY3Q+L3RlbXAvbWNwLWNhcHR1cmVzL3ByZXZpZXctPHRpbWVzdGFtcD4ucG5nLicpLFxuICAgICAgICAgICAgICAgICAgICBtb2RlOiB6LmVudW0oWydhdXRvJywgJ3dpbmRvdycsICdlbWJlZGRlZCddKS5kZWZhdWx0KCdhdXRvJykuZGVzY3JpYmUoJ0NhcHR1cmUgdGFyZ2V0LiBcImF1dG9cIiAoZGVmYXVsdCkgdHJpZXMgUHJldmlldy10aXRsZWQgd2luZG93IHRoZW4gZmFsbHMgYmFjayB0byB0aGUgbWFpbiBlZGl0b3Igd2luZG93LiBcIndpbmRvd1wiIG9ubHkgbWF0Y2hlcyBQcmV2aWV3LXRpdGxlZCB3aW5kb3dzIChmYWlscyBpZiBub25lKS4gXCJlbWJlZGRlZFwiIGNhcHR1cmVzIHRoZSBtYWluIGVkaXRvciB3aW5kb3cgZGlyZWN0bHkgKHNraXAgUHJldmlldy13aW5kb3cgcHJvYmUpLicpLFxuICAgICAgICAgICAgICAgICAgICB3aW5kb3dUaXRsZTogei5zdHJpbmcoKS5kZWZhdWx0KCdQcmV2aWV3JykuZGVzY3JpYmUoJ1N1YnN0cmluZyBtYXRjaGVkIGFnYWluc3Qgd2luZG93IHRpdGxlcyBpbiB3aW5kb3cvYXV0byBtb2RlcyAoZGVmYXVsdCBcIlByZXZpZXdcIiBmb3IgUElFKS4gSWdub3JlZCBpbiBlbWJlZGRlZCBtb2RlLicpLFxuICAgICAgICAgICAgICAgICAgICBpbmNsdWRlQmFzZTY0OiB6LmJvb2xlYW4oKS5kZWZhdWx0KGZhbHNlKS5kZXNjcmliZSgnRW1iZWQgUE5HIGJ5dGVzIGFzIGJhc2U2NCBpbiByZXNwb25zZSBkYXRhIChsYXJnZTsgZGVmYXVsdCBmYWxzZSkuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBjYXB0dXJlUHJldmlld1NjcmVlbnNob3QoYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY2FwdHVyZVByZXZpZXdTY3JlZW5zaG90SW1wbChhcmdzLnNhdmVQYXRoLCBhcmdzLm1vZGUgPz8gJ2F1dG8nLCBhcmdzLndpbmRvd1RpdGxlLCBhcmdzLmluY2x1ZGVCYXNlNjQpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnZ2V0X3ByZXZpZXdfbW9kZScsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdSZWFkIHByZXZpZXcgbW9kZScsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gUmVhZCB0aGUgY29jb3MgcHJldmlldyBjb25maWd1cmF0aW9uLiBVc2VzIEVkaXRvci5NZXNzYWdlIHByZWZlcmVuY2VzL3F1ZXJ5LWNvbmZpZyBzbyBBSSBjYW4gcm91dGUgZGVidWdfY2FwdHVyZV9wcmV2aWV3X3NjcmVlbnNob3QgdG8gdGhlIGNvcnJlY3QgbW9kZS4gUmV0dXJucyB7IGludGVycHJldGVkOiBcImJyb3dzZXJcIiB8IFwid2luZG93XCIgfCBcInNpbXVsYXRvclwiIHwgXCJlbWJlZGRlZFwiIHwgXCJ1bmtub3duXCIsIHJhdzogPGZ1bGwgcHJldmlldyBjb25maWcgZHVtcD4gfS4gVXNlIGJlZm9yZSBjYXB0dXJlOiBpZiBpbnRlcnByZXRlZD1cImVtYmVkZGVkXCIsIGNhbGwgY2FwdHVyZV9wcmV2aWV3X3NjcmVlbnNob3Qgd2l0aCBtb2RlPVwiZW1iZWRkZWRcIiBvciByZWx5IG9uIG1vZGU9XCJhdXRvXCIgZmFsbGJhY2suJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pLFxuICAgIH0pXG4gICAgYXN5bmMgZ2V0UHJldmlld01vZGUoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0UHJldmlld01vZGVJbXBsKCk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICAgICAgICAgIG5hbWU6ICdzZXRfcHJldmlld19tb2RlJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1NldCBwcmV2aWV3IG1vZGUnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAn4p2MIE5PVCBTVVBQT1JURUQgb24gY29jb3MgMy44LjcrIChsYW5kbWluZSAjMTcpLiBQcm9ncmFtbWF0aWMgcHJldmlldy1tb2RlIHN3aXRjaGluZyBpcyBpbXBvc3NpYmxlIGZyb20gYSB0aGlyZC1wYXJ0eSBleHRlbnNpb24gb24gY29jb3MgMy44Ljc6IGBwcmVmZXJlbmNlcy9zZXQtY29uZmlnYCBhZ2FpbnN0IGBwcmV2aWV3LmN1cnJlbnQucGxhdGZvcm1gIHJldHVybnMgdHJ1dGh5IGJ1dCBuZXZlciBwZXJzaXN0cywgYW5kICoqbm9uZSBvZiA2IHN1cnZleWVkIHJlZmVyZW5jZSBwcm9qZWN0cyAoaGFyYWR5IC8gU3BheWRvIC8gUm9tYVJvZ292IC8gY29jb3MtY29kZS1tb2RlIC8gRnVucGxheUFJIC8gY29jb3MtY2xpKSBzaGlwIGEgd29ya2luZyBhbHRlcm5hdGl2ZSoqICh2Mi4xMCBjcm9zcy1yZXBvIHJlZnJlc2gsIDIwMjYtMDUtMDIpLiBUaGUgZmllbGQgaXMgZWZmZWN0aXZlbHkgcmVhZC1vbmx5IOKAlCBvbmx5IHRoZSBjb2NvcyBwcmV2aWV3IGRyb3Bkb3duIHdyaXRlcyBpdC4gKipVc2UgdGhlIGNvY29zIHByZXZpZXcgZHJvcGRvd24gaW4gdGhlIGVkaXRvciB0b29sYmFyIHRvIHN3aXRjaCBtb2RlcyoqLiBEZWZhdWx0IGJlaGF2aW9yIGlzIGhhcmQtZmFpbDsgcGFzcyBhdHRlbXB0QW55d2F5PXRydWUgT05MWSBmb3IgZGlhZ25vc3RpYyBwcm9iaW5nIChyZXR1cm5zIDQtc3RyYXRlZ3kgYXR0ZW1wdCBsb2cgc28geW91IGNhbiB2ZXJpZnkgYWdhaW5zdCBhIGZ1dHVyZSBjb2NvcyBidWlsZCB3aGV0aGVyIGFueSBzaGFwZSBub3cgd29ya3MpLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgbW9kZTogei5lbnVtKFsnYnJvd3NlcicsICdnYW1lVmlldycsICdzaW11bGF0b3InXSkuZGVzY3JpYmUoJ1RhcmdldCBwcmV2aWV3IHBsYXRmb3JtLiBcImJyb3dzZXJcIiBvcGVucyBwcmV2aWV3IGluIHRoZSB1c2VyIGRlZmF1bHQgYnJvd3Nlci4gXCJnYW1lVmlld1wiIGVtYmVkcyB0aGUgZ2FtZXZpZXcgaW4gdGhlIG1haW4gZWRpdG9yIChpbi1lZGl0b3IgcHJldmlldykuIFwic2ltdWxhdG9yXCIgbGF1bmNoZXMgdGhlIGNvY29zIHNpbXVsYXRvci4gTWFwcyBkaXJlY3RseSB0byB0aGUgY29jb3MgcHJldmlldy5jdXJyZW50LnBsYXRmb3JtIHZhbHVlLicpLFxuICAgICAgICAgICAgICAgICAgICBhdHRlbXB0QW55d2F5OiB6LmJvb2xlYW4oKS5kZWZhdWx0KGZhbHNlKS5kZXNjcmliZSgnRGlhZ25vc3RpYyBvcHQtaW4uIERlZmF1bHQgZmFsc2UgcmV0dXJucyBOT1RfU1VQUE9SVEVEIHdpdGggdGhlIGNvY29zIFVJIHJlZGlyZWN0LiBTZXQgdHJ1ZSBPTkxZIHRvIHJlLXByb2JlIHRoZSA0IHNldC1jb25maWcgc2hhcGVzIGFnYWluc3QgYSBuZXcgY29jb3MgYnVpbGQg4oCUIHVzZWZ1bCB3aGVuIHZhbGlkYXRpbmcgd2hldGhlciBhIGZ1dHVyZSBjb2NvcyB2ZXJzaW9uIGV4cG9zZXMgYSB3cml0ZSBwYXRoLiBSZXR1cm5zIGRhdGEuYXR0ZW1wdHMgd2l0aCBldmVyeSBzaGFwZSB0cmllZCBhbmQgaXRzIHJlYWQtYmFjayBvYnNlcnZhdGlvbi4gRG9lcyBOT1QgZnJlZXplIHRoZSBlZGl0b3IgKHRoZSBjYWxsIG1lcmVseSBuby1vcHMpLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgc2V0UHJldmlld01vZGUoYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2V0UHJldmlld01vZGVJbXBsKGFyZ3MubW9kZSwgYXJncy5hdHRlbXB0QW55d2F5ID8/IGZhbHNlKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2JhdGNoX3NjcmVlbnNob3QnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnQ2FwdHVyZSBiYXRjaCBzY3JlZW5zaG90cycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gQ2FwdHVyZSBtdWx0aXBsZSBQTkdzIG9mIHRoZSBlZGl0b3Igd2luZG93IHdpdGggb3B0aW9uYWwgZGVsYXlzIGJldHdlZW4gc2hvdHMuIFVzZWZ1bCBmb3IgYW5pbWF0aW5nIHByZXZpZXcgdmVyaWZpY2F0aW9uIG9yIGNhcHR1cmluZyB0cmFuc2l0aW9ucy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHNhdmVQYXRoUHJlZml4OiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1BhdGggcHJlZml4IGZvciBiYXRjaCBvdXRwdXQgZmlsZXMuIEZpbGVzIHdyaXR0ZW4gYXMgPHByZWZpeD4tPGluZGV4Pi5wbmcuIE11c3QgcmVzb2x2ZSBpbnNpZGUgdGhlIGNvY29zIHByb2plY3Qgcm9vdCAoY29udGFpbm1lbnQgY2hlY2sgdmlhIHJlYWxwYXRoKS4gRGVmYXVsdDogPHByb2plY3Q+L3RlbXAvbWNwLWNhcHR1cmVzL2JhdGNoLTx0aW1lc3RhbXA+LicpLFxuICAgICAgICAgICAgICAgICAgICBkZWxheXNNczogei5hcnJheSh6Lm51bWJlcigpLm1pbigwKS5tYXgoMTAwMDApKS5tYXgoMjApLmRlZmF1bHQoWzBdKS5kZXNjcmliZSgnRGVsYXkgKG1zKSBiZWZvcmUgZWFjaCBjYXB0dXJlLiBMZW5ndGggZGV0ZXJtaW5lcyBob3cgbWFueSBzaG90cyB0YWtlbiAoY2FwcGVkIGF0IDIwIHRvIHByZXZlbnQgZGlzayBmaWxsIC8gZWRpdG9yIGZyZWV6ZSkuIERlZmF1bHQgWzBdID0gc2luZ2xlIHNob3QuJyksXG4gICAgICAgICAgICAgICAgICAgIHdpbmRvd1RpdGxlOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ09wdGlvbmFsIHN1YnN0cmluZyBtYXRjaCBvbiB3aW5kb3cgdGl0bGUuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBiYXRjaFNjcmVlbnNob3QoYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuYmF0Y2hTY3JlZW5zaG90SW1wbChhcmdzLnNhdmVQYXRoUHJlZml4LCBhcmdzLmRlbGF5c01zLCBhcmdzLndpbmRvd1RpdGxlKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3dhaXRfY29tcGlsZScsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdXYWl0IGZvciBjb21waWxlJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBCbG9jayB1bnRpbCBjb2NvcyBmaW5pc2hlcyBpdHMgVHlwZVNjcmlwdCBjb21waWxlIHBhc3MuIFRhaWxzIHRlbXAvcHJvZ3JhbW1pbmcvcGFja2VyLWRyaXZlci9sb2dzL2RlYnVnLmxvZyBmb3IgdGhlIFwiVGFyZ2V0KGVkaXRvcikgZW5kc1wiIG1hcmtlci4gUmV0dXJucyBpbW1lZGlhdGVseSB3aXRoIGNvbXBpbGVkPWZhbHNlIGlmIG5vIGNvbXBpbGUgd2FzIHRyaWdnZXJlZCAoY2xlYW4gcHJvamVjdCAvIG5vIGNoYW5nZXMgZGV0ZWN0ZWQpLiBQYWlyIHdpdGggcnVuX3NjcmlwdF9kaWFnbm9zdGljcyBmb3IgYW4gXCJlZGl0IC50cyDihpIgd2FpdCDihpIgZmV0Y2ggZXJyb3JzXCIgd29ya2Zsb3cuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICB0aW1lb3V0TXM6IHoubnVtYmVyKCkubWluKDUwMCkubWF4KDEyMDAwMCkuZGVmYXVsdCgxNTAwMCkuZGVzY3JpYmUoJ01heCB3YWl0IHRpbWUgaW4gbXMgYmVmb3JlIGdpdmluZyB1cC4gRGVmYXVsdCAxNTAwMC4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIHdhaXRDb21waWxlKGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLndhaXRDb21waWxlSW1wbChhcmdzLnRpbWVvdXRNcyk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICAgICAgICAgIG5hbWU6ICdydW5fc2NyaXB0X2RpYWdub3N0aWNzJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1J1biBzY3JpcHQgZGlhZ25vc3RpY3MnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFJ1biBgdHNjIC0tbm9FbWl0YCBhZ2FpbnN0IHRoZSBwcm9qZWN0IHRzY29uZmlnIGFuZCByZXR1cm4gcGFyc2VkIGRpYWdub3N0aWNzLiBVc2VkIGFmdGVyIHdhaXRfY29tcGlsZSB0byBzdXJmYWNlIGNvbXBpbGF0aW9uIGVycm9ycyBhcyBzdHJ1Y3R1cmVkIHtmaWxlLCBsaW5lLCBjb2x1bW4sIGNvZGUsIG1lc3NhZ2V9IGVudHJpZXMuIFJlc29sdmVzIHRzYyBiaW5hcnkgZnJvbSBwcm9qZWN0IG5vZGVfbW9kdWxlcyDihpIgZWRpdG9yIGJ1bmRsZWQgZW5naW5lIOKGkiBucHggZmFsbGJhY2suJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICB0c2NvbmZpZ1BhdGg6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnT3B0aW9uYWwgb3ZlcnJpZGUgKGFic29sdXRlIG9yIHByb2plY3QtcmVsYXRpdmUpLiBEZWZhdWx0OiB0c2NvbmZpZy5qc29uIG9yIHRlbXAvdHNjb25maWcuY29jb3MuanNvbi4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIHJ1blNjcmlwdERpYWdub3N0aWNzKGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLnJ1blNjcmlwdERpYWdub3N0aWNzSW1wbChhcmdzLnRzY29uZmlnUGF0aCk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICAgICAgICAgIG5hbWU6ICdwcmV2aWV3X3VybCcsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdSZXNvbHZlIHByZXZpZXcgVVJMJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBSZXNvbHZlIHRoZSBjb2NvcyBicm93c2VyLXByZXZpZXcgVVJMLiBVc2VzIHRoZSBkb2N1bWVudGVkIEVkaXRvci5NZXNzYWdlIGNoYW5uZWwgcHJldmlldy9xdWVyeS1wcmV2aWV3LXVybC4gV2l0aCBhY3Rpb249XCJvcGVuXCIsIGFsc28gbGF1bmNoZXMgdGhlIFVSTCBpbiB0aGUgdXNlciBkZWZhdWx0IGJyb3dzZXIgdmlhIGVsZWN0cm9uLnNoZWxsLm9wZW5FeHRlcm5hbCDigJQgdXNlZnVsIGFzIGEgc2V0dXAgc3RlcCBiZWZvcmUgZGVidWdfZ2FtZV9jb21tYW5kLCBzaW5jZSB0aGUgR2FtZURlYnVnQ2xpZW50IHJ1bm5pbmcgaW5zaWRlIHRoZSBwcmV2aWV3IG11c3QgYmUgcmVhY2hhYmxlLiBFZGl0b3Itc2lkZSBQcmV2aWV3LWluLUVkaXRvciBwbGF5L3N0b3AgaXMgTk9UIGV4cG9zZWQgYnkgdGhlIHB1YmxpYyBtZXNzYWdlIEFQSSBhbmQgaXMgaW50ZW50aW9uYWxseSBub3QgaW1wbGVtZW50ZWQgaGVyZTsgdXNlIHRoZSBjb2NvcyBlZGl0b3IgdG9vbGJhciBtYW51YWxseSBmb3IgUElFLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgYWN0aW9uOiB6LmVudW0oWydxdWVyeScsICdvcGVuJ10pLmRlZmF1bHQoJ3F1ZXJ5JykuZGVzY3JpYmUoJ1wicXVlcnlcIiByZXR1cm5zIHRoZSBVUkw7IFwib3BlblwiIHJldHVybnMgdGhlIFVSTCBBTkQgb3BlbnMgaXQgaW4gdGhlIHVzZXIgZGVmYXVsdCBicm93c2VyIHZpYSBlbGVjdHJvbi5zaGVsbC5vcGVuRXh0ZXJuYWwuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBwcmV2aWV3VXJsKGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLnByZXZpZXdVcmxJbXBsKGFyZ3MuYWN0aW9uKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3F1ZXJ5X2RldmljZXMnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnTGlzdCBwcmV2aWV3IGRldmljZXMnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIExpc3QgcHJldmlldyBkZXZpY2VzIGNvbmZpZ3VyZWQgaW4gdGhlIGNvY29zIHByb2plY3QuIEJhY2tlZCBieSBFZGl0b3IuTWVzc2FnZSBjaGFubmVsIGRldmljZS9xdWVyeS4gUmV0dXJucyBhbiBhcnJheSBvZiB7bmFtZSwgd2lkdGgsIGhlaWdodCwgcmF0aW99IGVudHJpZXMg4oCUIHVzZWZ1bCBmb3IgYmF0Y2gtc2NyZWVuc2hvdCBwaXBlbGluZXMgdGhhdCB0YXJnZXQgbXVsdGlwbGUgcmVzb2x1dGlvbnMuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pLFxuICAgIH0pXG4gICAgYXN5bmMgcXVlcnlEZXZpY2VzKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLnF1ZXJ5RGV2aWNlc0ltcGwoKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2dhbWVfY29tbWFuZCcsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdTZW5kIGdhbWUgY29tbWFuZCcsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gU2VuZCBhIHJ1bnRpbWUgY29tbWFuZCB0byBhIGNvbm5lY3RlZCBHYW1lRGVidWdDbGllbnQuIFdvcmtzIGluc2lkZSBhIGNvY29zIHByZXZpZXcvYnVpbGQgKGJyb3dzZXIsIFByZXZpZXctaW4tRWRpdG9yLCBvciBhbnkgZGV2aWNlIHRoYXQgZmV0Y2hlcyAvZ2FtZS9jb21tYW5kKS4gQnVpbHQtaW4gY29tbWFuZCB0eXBlczogXCJzY3JlZW5zaG90XCIgKGNhcHR1cmUgZ2FtZSBjYW52YXMgdG8gUE5HLCByZXR1cm5zIHNhdmVkIGZpbGUgcGF0aCksIFwiY2xpY2tcIiAoZW1pdCBCdXR0b24uQ0xJQ0sgb24gYSBub2RlIGJ5IG5hbWUpLCBcImluc3BlY3RcIiAoZHVtcCBydW50aW1lIG5vZGUgaW5mbzogcG9zaXRpb24vc2NhbGUvcm90YXRpb24vYWN0aXZlL2NvbXBvbmVudHMgYnkgbmFtZTsgd2hlbiBwcmVzZW50IGFsc28gcmV0dXJucyBVSVRyYW5zZm9ybS5jb250ZW50U2l6ZS9hbmNob3JQb2ludCwgV2lkZ2V0IGFsaWdubWVudCBmbGFncy9vZmZzZXRzLCBhbmQgTGF5b3V0IHR5cGUvc3BhY2luZy9wYWRkaW5nKSwgXCJzdGF0ZVwiIChkdW1wIGdsb2JhbCBnYW1lIHN0YXRlIGZyb20gdGhlIHJ1bm5pbmcgZ2FtZSBjbGllbnQpLCBhbmQgXCJuYXZpZ2F0ZVwiIChzd2l0Y2ggc2NlbmUvcGFnZSBieSBuYW1lIHRocm91Z2ggdGhlIGdhbWUgY2xpZW50XFwncyByb3V0ZXIpLiBDdXN0b20gY29tbWFuZCB0eXBlcyBhcmUgZm9yd2FyZGVkIHRvIHRoZSBjbGllbnRcXCdzIGN1c3RvbUNvbW1hbmRzIG1hcC4gUmVxdWlyZXMgdGhlIEdhbWVEZWJ1Z0NsaWVudCB0ZW1wbGF0ZSAoY2xpZW50L2NvY29zLW1jcC1jbGllbnQudHMpIHdpcmVkIGludG8gdGhlIHJ1bm5pbmcgZ2FtZTsgd2l0aG91dCBpdCB0aGUgY2FsbCB0aW1lcyBvdXQuIENoZWNrIEdFVCAvZ2FtZS9zdGF0dXMgdG8gdmVyaWZ5IGNsaWVudCBsaXZlbmVzcyBmaXJzdC4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHR5cGU6IHouc3RyaW5nKCkubWluKDEpLmRlc2NyaWJlKCdDb21tYW5kIHR5cGUuIEJ1aWx0LWluczogc2NyZWVuc2hvdCwgY2xpY2ssIGluc3BlY3QsIHN0YXRlLCBuYXZpZ2F0ZS4gQ3VzdG9tczogYW55IHN0cmluZyB0aGUgR2FtZURlYnVnQ2xpZW50IHJlZ2lzdGVyZWQgaW4gY3VzdG9tQ29tbWFuZHMuJyksXG4gICAgICAgICAgICAgICAgICAgIGFyZ3M6IHouYW55KCkub3B0aW9uYWwoKS5kZXNjcmliZSgnQ29tbWFuZC1zcGVjaWZpYyBhcmd1bWVudHMuIEZvciBcImNsaWNrXCIvXCJpbnNwZWN0XCI6IHtuYW1lOiBzdHJpbmd9IG5vZGUgbmFtZS4gRm9yIFwibmF2aWdhdGVcIjoge3BhZ2VOYW1lOiBzdHJpbmd9IG9yIHtwYWdlOiBzdHJpbmd9LiBGb3IgXCJzdGF0ZVwiL1wic2NyZWVuc2hvdFwiOiB7fSAobm8gYXJncykuJyksXG4gICAgICAgICAgICAgICAgICAgIHRpbWVvdXRNczogei5udW1iZXIoKS5taW4oNTAwKS5tYXgoNjAwMDApLmRlZmF1bHQoMTAwMDApLmRlc2NyaWJlKCdNYXggd2FpdCBmb3IgY2xpZW50IHJlc3BvbnNlLiBEZWZhdWx0IDEwMDAwbXMuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBnYW1lQ29tbWFuZChhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nYW1lQ29tbWFuZEltcGwoYXJncy50eXBlLCBhcmdzLmFyZ3MsIGFyZ3MudGltZW91dE1zKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3JlY29yZF9zdGFydCcsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdTdGFydCBnYW1lIHJlY29yZGluZycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gU3RhcnQgcmVjb3JkaW5nIHRoZSBydW5uaW5nIGdhbWUgY2FudmFzIHZpYSB0aGUgR2FtZURlYnVnQ2xpZW50IChicm93c2VyL1BJRSBwcmV2aWV3IG9ubHkpLiBXcmFwcyBkZWJ1Z19nYW1lX2NvbW1hbmQodHlwZT1cInJlY29yZF9zdGFydFwiKSBmb3IgQUkgZXJnb25vbWljcy4gUmV0dXJucyBpbW1lZGlhdGVseSB3aXRoIHsgcmVjb3JkaW5nOiB0cnVlLCBtaW1lVHlwZSB9OyB0aGUgcmVjb3JkaW5nIGNvbnRpbnVlcyB1bnRpbCBkZWJ1Z19yZWNvcmRfc3RvcCBpcyBjYWxsZWQuIEJyb3dzZXItb25seSDigJQgZmFpbHMgb24gbmF0aXZlIGNvY29zIGJ1aWxkcyAoTWVkaWFSZWNvcmRlciBBUEkgcmVxdWlyZXMgYSBET00gY2FudmFzICsgY2FwdHVyZVN0cmVhbSkuIFNpbmdsZS1mbGlnaHQgcGVyIGNsaWVudDogYSBzZWNvbmQgcmVjb3JkX3N0YXJ0IHdoaWxlIGEgcmVjb3JkaW5nIGlzIGluIHByb2dyZXNzIHJldHVybnMgc3VjY2VzczpmYWxzZS4gUGFpciB3aXRoIGRlYnVnX2dhbWVfY2xpZW50X3N0YXR1cyB0byBjb25maXJtIGEgY2xpZW50IGlzIGNvbm5lY3RlZCBiZWZvcmUgY2FsbGluZy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIG1pbWVUeXBlOiB6LmVudW0oWyd2aWRlby93ZWJtJywgJ3ZpZGVvL21wNCddKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdDb250YWluZXIvY29kZWMgaGludCBmb3IgTWVkaWFSZWNvcmRlci4gRGVmYXVsdDogYnJvd3NlciBhdXRvLXBpY2sgKHdlYm0gcHJlZmVycmVkIHdoZXJlIHN1cHBvcnRlZCwgZmFsbHMgYmFjayB0byBtcDQpLiBTb21lIGJyb3dzZXJzIHJlamVjdCB1bnN1cHBvcnRlZCB0eXBlcyDigJQgcmVjb3JkX3N0YXJ0IHN1cmZhY2VzIGEgY2xlYXIgZXJyb3IgaW4gdGhhdCBjYXNlLicpLFxuICAgICAgICAgICAgICAgICAgICB2aWRlb0JpdHNQZXJTZWNvbmQ6IHoubnVtYmVyKCkubWluKDEwMF8wMDApLm1heCgyMF8wMDBfMDAwKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdPcHRpb25hbCBNZWRpYVJlY29yZGVyIGJpdHJhdGUgaGludCBpbiBiaXRzL3NlYy4gTG93ZXIg4oaSIHNtYWxsZXIgZmlsZXMgYnV0IGxvd2VyIHF1YWxpdHkuIEJyb3dzZXIgZGVmYXVsdCBpZiBvbWl0dGVkLicpLFxuICAgICAgICAgICAgICAgICAgICB0aW1lb3V0TXM6IHoubnVtYmVyKCkubWluKDUwMCkubWF4KDMwMDAwKS5kZWZhdWx0KDUwMDApLmRlc2NyaWJlKCdNYXggd2FpdCBmb3IgdGhlIEdhbWVEZWJ1Z0NsaWVudCB0byBhY2tub3dsZWRnZSByZWNvcmRfc3RhcnQuIFJlY29yZGluZyBpdHNlbGYgcnVucyB1bnRpbCBkZWJ1Z19yZWNvcmRfc3RvcC4gRGVmYXVsdCA1MDAwbXMuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyByZWNvcmRTdGFydChhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5yZWNvcmRTdGFydEltcGwoYXJncy5taW1lVHlwZSwgYXJncy52aWRlb0JpdHNQZXJTZWNvbmQsIGFyZ3MudGltZW91dE1zID8/IDUwMDApO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgICAgICAgICBuYW1lOiAncmVjb3JkX3N0b3AnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnU3RvcCBnYW1lIHJlY29yZGluZycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gU3RvcCB0aGUgaW4tcHJvZ3Jlc3MgZ2FtZSBjYW52YXMgcmVjb3JkaW5nIGFuZCBwZXJzaXN0IGl0IHVuZGVyIDxwcm9qZWN0Pi90ZW1wL21jcC1jYXB0dXJlcy4gV3JhcHMgZGVidWdfZ2FtZV9jb21tYW5kKHR5cGU9XCJyZWNvcmRfc3RvcFwiKS4gUmV0dXJucyB7IGZpbGVQYXRoLCBzaXplLCBtaW1lVHlwZSwgZHVyYXRpb25NcyB9LiBDYWxsaW5nIHdpdGhvdXQgYSBwcmlvciByZWNvcmRfc3RhcnQgcmV0dXJucyBzdWNjZXNzOmZhbHNlLiBUaGUgaG9zdCBhcHBsaWVzIHRoZSBzYW1lIHJlYWxwYXRoIGNvbnRhaW5tZW50IGd1YXJkICsgNjRNQiBieXRlIGNhcCAoc3luY2VkIHdpdGggdGhlIHJlcXVlc3QgYm9keSBjYXAgaW4gbWNwLXNlcnZlci1zZGsudHM7IHYyLjkuNiByYWlzZWQgYm90aCBmcm9tIDMyIHRvIDY0TUIpOyByYWlzZSB2aWRlb0JpdHNQZXJTZWNvbmQgLyByZWR1Y2UgcmVjb3JkaW5nIGR1cmF0aW9uIG9uIGNhcCByZWplY3Rpb24uJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICB0aW1lb3V0TXM6IHoubnVtYmVyKCkubWluKDEwMDApLm1heCgxMjAwMDApLmRlZmF1bHQoMzAwMDApLmRlc2NyaWJlKCdNYXggd2FpdCBmb3IgdGhlIGNsaWVudCB0byBhc3NlbWJsZSArIHJldHVybiB0aGUgcmVjb3JkaW5nIGJsb2IuIFJlY29yZGluZ3Mgb2Ygc2V2ZXJhbCBzZWNvbmRzIGF0IGhpZ2ggYml0cmF0ZSBtYXkgbmVlZCBsb25nZXIgdGhhbiB0aGUgZGVmYXVsdCAzMHMg4oCUIHJhaXNlIG9uIGxvbmcgcmVjb3JkaW5ncy4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIHJlY29yZFN0b3AoYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMucmVjb3JkU3RvcEltcGwoYXJncy50aW1lb3V0TXMgPz8gMzAwMDApO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnZ2FtZV9jbGllbnRfc3RhdHVzJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1JlYWQgZ2FtZSBjbGllbnQgc3RhdHVzJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBSZWFkIEdhbWVEZWJ1Z0NsaWVudCBjb25uZWN0aW9uIHN0YXR1cy4gSW5jbHVkZXMgY29ubmVjdGVkIChwb2xsZWQgd2l0aGluIDJzKSwgbGFzdCBwb2xsIHRpbWVzdGFtcCwgYW5kIHdoZXRoZXIgYSBjb21tYW5kIGlzIHF1ZXVlZC4gVXNlIGJlZm9yZSBkZWJ1Z19nYW1lX2NvbW1hbmQgdG8gY29uZmlybSB0aGUgY2xpZW50IGlzIHJlYWNoYWJsZS4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksXG4gICAgfSlcbiAgICBhc3luYyBnYW1lQ2xpZW50U3RhdHVzKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdhbWVDbGllbnRTdGF0dXNJbXBsKCk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICAgICAgICAgIG5hbWU6ICdjaGVja19lZGl0b3JfaGVhbHRoJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ0NoZWNrIGVkaXRvciBoZWFsdGgnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFByb2JlIHdoZXRoZXIgdGhlIGNvY29zIGVkaXRvciBzY2VuZS1zY3JpcHQgcmVuZGVyZXIgaXMgcmVzcG9uc2l2ZS4gVXNlZnVsIGFmdGVyIGRlYnVnX3ByZXZpZXdfY29udHJvbChzdGFydCkg4oCUIGxhbmRtaW5lICMxNiBkb2N1bWVudHMgdGhhdCBjb2NvcyAzLjguNyBzb21ldGltZXMgZnJlZXplcyB0aGUgc2NlbmUtc2NyaXB0IHJlbmRlcmVyIChzcGlubmluZyBpbmRpY2F0b3IsIEN0cmwrUiByZXF1aXJlZCkuIFN0cmF0ZWd5ICh2Mi45LjYpOiB0aHJlZSBwcm9iZXMg4oCUICgxKSBob3N0OiBkZXZpY2UvcXVlcnkgKG1haW4gcHJvY2VzcywgYWx3YXlzIHJlc3BvbnNpdmUgZXZlbiB3aGVuIHNjZW5lLXNjcmlwdCBpcyB3ZWRnZWQpOyAoMikgc2NlbmUvcXVlcnktaXMtcmVhZHkgdHlwZWQgY2hhbm5lbCDigJQgZGlyZWN0IElQQyBpbnRvIHRoZSBzY2VuZSBtb2R1bGUsIGhhbmdzIHdoZW4gc2NlbmUgcmVuZGVyZXIgaXMgZnJvemVuOyAoMykgc2NlbmUvcXVlcnktbm9kZS10cmVlIHR5cGVkIGNoYW5uZWwg4oCUIHJldHVybnMgdGhlIGZ1bGwgc2NlbmUgdHJlZSwgZm9yY2VzIGFuIGFjdHVhbCBzY2VuZS1ncmFwaCB3YWxrIHRocm91Z2ggdGhlIHdlZGdlZCBjb2RlIHBhdGguIEVhY2ggcHJvYmUgaGFzIGl0cyBvd24gdGltZW91dCByYWNlIChkZWZhdWx0IDE1MDBtcyBlYWNoKS4gU2NlbmUgZGVjbGFyZWQgYWxpdmUgb25seSB3aGVuIEJPVEggKDIpIHJldHVybnMgdHJ1ZSBBTkQgKDMpIHJldHVybnMgYSBub24tbnVsbCB0cmVlIHdpdGhpbiB0aGUgdGltZW91dC4gUmV0dXJucyB7IGhvc3RBbGl2ZSwgc2NlbmVBbGl2ZSwgc2NlbmVMYXRlbmN5TXMsIGhvc3RFcnJvciwgc2NlbmVFcnJvciwgdG90YWxQcm9iZU1zIH0uIEFJIHdvcmtmbG93OiBjYWxsIGFmdGVyIHByZXZpZXdfY29udHJvbChzdGFydCk7IGlmIHNjZW5lQWxpdmU9ZmFsc2UsIHN1cmZhY2UgXCJjb2NvcyBlZGl0b3IgbGlrZWx5IGZyb3plbiDigJQgcHJlc3MgQ3RybCtSXCIgaW5zdGVhZCBvZiBpc3N1aW5nIG1vcmUgc2NlbmUtYm91bmQgY2FsbHMuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBzY2VuZVRpbWVvdXRNczogei5udW1iZXIoKS5taW4oMjAwKS5tYXgoMTAwMDApLmRlZmF1bHQoMTUwMCkuZGVzY3JpYmUoJ1RpbWVvdXQgZm9yIHRoZSBzY2VuZS1zY3JpcHQgcHJvYmUgaW4gbXMuIEJlbG93IHRoaXMgc2NlbmUgaXMgY29uc2lkZXJlZCBmcm96ZW4uIERlZmF1bHQgMTUwMG1zLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgY2hlY2tFZGl0b3JIZWFsdGgoYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY2hlY2tFZGl0b3JIZWFsdGhJbXBsKGFyZ3Muc2NlbmVUaW1lb3V0TXMgPz8gMTUwMCk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICAgICAgICAgIG5hbWU6ICdwcmV2aWV3X2NvbnRyb2wnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnQ29udHJvbCBwcmV2aWV3IHBsYXliYWNrJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ+KaoCBQQVJLRUQg4oCUIHN0YXJ0IEZSRUVaRVMgY29jb3MgMy44LjcgKGxhbmRtaW5lICMxNikuIFByb2dyYW1tYXRpY2FsbHkgc3RhcnQgb3Igc3RvcCBQcmV2aWV3LWluLUVkaXRvciAoUElFKSBwbGF5IG1vZGUuIFdyYXBzIHRoZSB0eXBlZCBjY2UuU2NlbmVGYWNhZGVNYW5hZ2VyLmNoYW5nZVByZXZpZXdQbGF5U3RhdGUgbWV0aG9kLiAqKnN0YXJ0IGhpdHMgYSBjb2NvcyAzLjguNyBzb2Z0UmVsb2FkU2NlbmUgcmFjZSoqIHRoYXQgcmV0dXJucyBzdWNjZXNzIGJ1dCBmcmVlemVzIHRoZSBlZGl0b3IgKHNwaW5uaW5nIGluZGljYXRvciwgQ3RybCtSIHJlcXVpcmVkIHRvIHJlY292ZXIpLiBWZXJpZmllZCBpbiBib3RoIGVtYmVkZGVkIGFuZCBicm93c2VyIHByZXZpZXcgbW9kZXMuIHYyLjEwIGNyb3NzLXJlcG8gcmVmcmVzaCBjb25maXJtZWQ6IG5vbmUgb2YgNiBzdXJ2ZXllZCBwZWVycyAoaGFyYWR5IC8gU3BheWRvIC8gUm9tYVJvZ292IC8gY29jb3MtY29kZS1tb2RlIC8gRnVucGxheUFJIC8gY29jb3MtY2xpKSBzaGlwIGEgc2FmZXIgY2FsbCBwYXRoIOKAlCBoYXJhZHkgYW5kIGNvY29zLWNvZGUtbW9kZSB1c2UgdGhlIGBFZGl0b3IuTWVzc2FnZSBzY2VuZS9lZGl0b3ItcHJldmlldy1zZXQtcGxheWAgY2hhbm5lbCBhbmQgaGl0IHRoZSBzYW1lIHJhY2UuICoqc3RvcCBpcyBzYWZlKiogYW5kIHJlbGlhYmxlLiBUbyBwcmV2ZW50IGFjY2lkZW50YWwgdHJpZ2dlcmluZywgc3RhcnQgcmVxdWlyZXMgZXhwbGljaXQgYGFja25vd2xlZGdlRnJlZXplUmlzazogdHJ1ZWAuICoqU3Ryb25nbHkgcHJlZmVycmVkIGFsdGVybmF0aXZlcyBpbnN0ZWFkIG9mIHN0YXJ0Kio6IChhKSBkZWJ1Z19jYXB0dXJlX3ByZXZpZXdfc2NyZWVuc2hvdChtb2RlPVwiZW1iZWRkZWRcIikgaW4gRURJVCBtb2RlIOKAlCBubyBQSUUgbmVlZGVkOyAoYikgZGVidWdfZ2FtZV9jb21tYW5kKHR5cGU9XCJzY3JlZW5zaG90XCIpIHZpYSBHYW1lRGVidWdDbGllbnQgb24gYnJvd3NlciBwcmV2aWV3IGxhdW5jaGVkIHZpYSBkZWJ1Z19wcmV2aWV3X3VybChhY3Rpb249XCJvcGVuXCIpLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgb3A6IHouZW51bShbJ3N0YXJ0JywgJ3N0b3AnXSkuZGVzY3JpYmUoJ1wic3RhcnRcIiBlbnRlcnMgUElFIHBsYXkgbW9kZSAoZXF1aXZhbGVudCB0byBjbGlja2luZyB0aGUgdG9vbGJhciBwbGF5IGJ1dHRvbikg4oCUIFJFUVVJUkVTIGFja25vd2xlZGdlRnJlZXplUmlzaz10cnVlIG9uIGNvY29zIDMuOC43IGR1ZSB0byBsYW5kbWluZSAjMTYuIFwic3RvcFwiIGV4aXRzIFBJRSBwbGF5IGFuZCByZXR1cm5zIHRvIHNjZW5lIG1vZGUgKGFsd2F5cyBzYWZlKS4nKSxcbiAgICAgICAgICAgICAgICAgICAgYWNrbm93bGVkZ2VGcmVlemVSaXNrOiB6LmJvb2xlYW4oKS5kZWZhdWx0KGZhbHNlKS5kZXNjcmliZSgnUmVxdWlyZWQgdG8gYmUgdHJ1ZSBmb3Igb3A9XCJzdGFydFwiIG9uIGNvY29zIDMuOC43IGR1ZSB0byBsYW5kbWluZSAjMTYgKHNvZnRSZWxvYWRTY2VuZSByYWNlIHRoYXQgZnJlZXplcyB0aGUgZWRpdG9yKS4gU2V0IHRydWUgT05MWSB3aGVuIHRoZSBodW1hbiB1c2VyIGhhcyBleHBsaWNpdGx5IGFjY2VwdGVkIHRoZSByaXNrIGFuZCBpcyBwcmVwYXJlZCB0byBwcmVzcyBDdHJsK1IgaWYgdGhlIGVkaXRvciBmcmVlemVzLiBJZ25vcmVkIGZvciBvcD1cInN0b3BcIiB3aGljaCBpcyByZWxpYWJsZS4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIHByZXZpZXdDb250cm9sKGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLnByZXZpZXdDb250cm9sSW1wbChhcmdzLm9wLCBhcmdzLmFja25vd2xlZGdlRnJlZXplUmlzayA/PyBmYWxzZSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICAgICAgICAgIG5hbWU6ICdnZXRfc2NyaXB0X2RpYWdub3N0aWNfY29udGV4dCcsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdSZWFkIGRpYWdub3N0aWMgY29udGV4dCcsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gUmVhZCBhIHdpbmRvdyBvZiBzb3VyY2UgbGluZXMgYXJvdW5kIGEgZGlhZ25vc3RpYyBsb2NhdGlvbiBzbyBBSSBjYW4gcmVhZCB0aGUgb2ZmZW5kaW5nIGNvZGUgd2l0aG91dCBhIHNlcGFyYXRlIGZpbGUgcmVhZC4gUGFpciB3aXRoIHJ1bl9zY3JpcHRfZGlhZ25vc3RpY3M6IHBhc3MgZmlsZS9saW5lIGZyb20gZWFjaCBkaWFnbm9zdGljIHRvIGZldGNoIGNvbnRleHQuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBmaWxlOiB6LnN0cmluZygpLmRlc2NyaWJlKCdBYnNvbHV0ZSBvciBwcm9qZWN0LXJlbGF0aXZlIHBhdGggdG8gdGhlIHNvdXJjZSBmaWxlLiBEaWFnbm9zdGljcyBmcm9tIHJ1bl9zY3JpcHRfZGlhZ25vc3RpY3MgYWxyZWFkeSB1c2UgYSBwYXRoIHRzYyBlbWl0dGVkLCB3aGljaCBpcyBzdWl0YWJsZSBoZXJlLicpLFxuICAgICAgICAgICAgICAgICAgICBsaW5lOiB6Lm51bWJlcigpLm1pbigxKS5kZXNjcmliZSgnMS1iYXNlZCBsaW5lIG51bWJlciB0aGF0IHRoZSBkaWFnbm9zdGljIHBvaW50cyBhdC4nKSxcbiAgICAgICAgICAgICAgICAgICAgY29udGV4dExpbmVzOiB6Lm51bWJlcigpLm1pbigwKS5tYXgoNTApLmRlZmF1bHQoNSkuZGVzY3JpYmUoJ051bWJlciBvZiBsaW5lcyB0byBpbmNsdWRlIGJlZm9yZSBhbmQgYWZ0ZXIgdGhlIHRhcmdldCBsaW5lLiBEZWZhdWx0IDUgKMKxNSDihpIgMTEtbGluZSB3aW5kb3cpLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgZ2V0U2NyaXB0RGlhZ25vc3RpY0NvbnRleHQoYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0U2NyaXB0RGlhZ25vc3RpY0NvbnRleHRJbXBsKGFyZ3MuZmlsZSwgYXJncy5saW5lLCBhcmdzLmNvbnRleHRMaW5lcyk7XG4gICAgfVxuXG4gICAgLy8gQ29tcGF0IHBhdGg6IHByZXNlcnZlIHRoZSBwcmUtdjIuMy4wIHJlc3BvbnNlIHNoYXBlXG4gICAgLy8ge3N1Y2Nlc3MsIGRhdGE6IHtyZXN1bHQsIG1lc3NhZ2U6ICdTY3JpcHQgZXhlY3V0ZWQgc3VjY2Vzc2Z1bGx5J319XG4gICAgLy8gc28gb2xkZXIgY2FsbGVycyByZWFkaW5nIGRhdGEubWVzc2FnZSBrZWVwIHdvcmtpbmcuXG4gICAgcHJpdmF0ZSBhc3luYyBleGVjdXRlU2NyaXB0Q29tcGF0KHNjcmlwdDogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3Qgb3V0ID0gYXdhaXQgdGhpcy5leGVjdXRlSmF2YVNjcmlwdChzY3JpcHQsICdzY2VuZScpO1xuICAgICAgICBpZiAob3V0LnN1Y2Nlc3MgJiYgb3V0LmRhdGEgJiYgJ3Jlc3VsdCcgaW4gb3V0LmRhdGEpIHtcbiAgICAgICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdDogb3V0LmRhdGEucmVzdWx0LFxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiAnU2NyaXB0IGV4ZWN1dGVkIHN1Y2Nlc3NmdWxseScsXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG91dDtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGNsZWFyQ29uc29sZUltcGwoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgLy8gTm90ZTogRWRpdG9yLk1lc3NhZ2Uuc2VuZCBtYXkgbm90IHJldHVybiBhIHByb21pc2UgaW4gYWxsIHZlcnNpb25zXG4gICAgICAgIEVkaXRvci5NZXNzYWdlLnNlbmQoJ2NvbnNvbGUnLCAnY2xlYXInKTtcbiAgICAgICAgcmV0dXJuIG9rKHVuZGVmaW5lZCwgJ0NvbnNvbGUgY2xlYXJlZCBzdWNjZXNzZnVsbHknKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGV4ZWN1dGVKYXZhU2NyaXB0KGNvZGU6IHN0cmluZywgY29udGV4dDogJ3NjZW5lJyB8ICdlZGl0b3InKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgaWYgKGNvbnRleHQgPT09ICdzY2VuZScpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmV4ZWN1dGVJblNjZW5lQ29udGV4dChjb2RlKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoY29udGV4dCA9PT0gJ2VkaXRvcicpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmV4ZWN1dGVJbkVkaXRvckNvbnRleHQoY29kZSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhaWwoYFVua25vd24gZXhlY3V0ZV9qYXZhc2NyaXB0IGNvbnRleHQ6ICR7Y29udGV4dH1gKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGV4ZWN1dGVJblNjZW5lQ29udGV4dChjb2RlOiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ2V4ZWN1dGUtc2NlbmUtc2NyaXB0Jywge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdjb25zb2xlJyxcbiAgICAgICAgICAgICAgICBtZXRob2Q6ICdldmFsJyxcbiAgICAgICAgICAgICAgICBhcmdzOiBbY29kZV1cbiAgICAgICAgICAgIH0pLnRoZW4oKHJlc3VsdDogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb250ZXh0OiAnc2NlbmUnLFxuICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0OiByZXN1bHQsXG4gICAgICAgICAgICAgICAgICAgIH0sICdTY2VuZSBzY3JpcHQgZXhlY3V0ZWQgc3VjY2Vzc2Z1bGx5JykpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGV4ZWN1dGVJbkVkaXRvckNvbnRleHQoY29kZTogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgaWYgKCFpc0VkaXRvckNvbnRleHRFdmFsRW5hYmxlZCgpKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbCgnRWRpdG9yIGNvbnRleHQgZXZhbCBpcyBkaXNhYmxlZC4gRW5hYmxlIGBlbmFibGVFZGl0b3JDb250ZXh0RXZhbGAgaW4gTUNQIHNlcnZlciBzZXR0aW5ncyAocGFuZWwgVUkpIHRvIG9wdCBpbi4gVGhpcyBncmFudHMgQUktZ2VuZXJhdGVkIGNvZGUgYWNjZXNzIHRvIEVkaXRvci5NZXNzYWdlICsgTm9kZSBmcyBBUElzIGluIHRoZSBob3N0IHByb2Nlc3M7IG9ubHkgZW5hYmxlIHdoZW4geW91IHRydXN0IHRoZSB1cHN0cmVhbSBwcm9tcHQgc291cmNlLicpO1xuICAgICAgICB9XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBXcmFwIGluIGFzeW5jIElJRkUgc28gQUkgY2FuIHVzZSB0b3AtbGV2ZWwgYXdhaXQgdHJhbnNwYXJlbnRseTtcbiAgICAgICAgICAgIC8vIGFsc28gZ2l2ZXMgdXMgYSBjbGVhbiBQcm9taXNlLWJhc2VkIHJldHVybiBwYXRoIHJlZ2FyZGxlc3Mgb2ZcbiAgICAgICAgICAgIC8vIHdoZXRoZXIgdGhlIHVzZXIgY29kZSByZXR1cm5zIGEgUHJvbWlzZSBvciBhIHN5bmMgdmFsdWUuXG4gICAgICAgICAgICBjb25zdCB3cmFwcGVkID0gYChhc3luYyAoKSA9PiB7ICR7Y29kZX0gXFxuIH0pKClgO1xuICAgICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWV2YWxcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0ICgwLCBldmFsKSh3cmFwcGVkKTtcbiAgICAgICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRleHQ6ICdlZGl0b3InLFxuICAgICAgICAgICAgICAgICAgICByZXN1bHQ6IHJlc3VsdCxcbiAgICAgICAgICAgICAgICB9LCAnRWRpdG9yIHNjcmlwdCBleGVjdXRlZCBzdWNjZXNzZnVsbHknKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGBFZGl0b3IgZXZhbCBmYWlsZWQ6ICR7ZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpfWApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnZXROb2RlVHJlZUltcGwocm9vdFV1aWQ/OiBzdHJpbmcsIG1heERlcHRoOiBudW1iZXIgPSAxMCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgYnVpbGRUcmVlID0gYXN5bmMgKG5vZGVVdWlkOiBzdHJpbmcsIGRlcHRoOiBudW1iZXIgPSAwKTogUHJvbWlzZTxhbnk+ID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZGVwdGggPj0gbWF4RGVwdGgpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgdHJ1bmNhdGVkOiB0cnVlIH07XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgbm9kZURhdGEgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1ub2RlJywgbm9kZVV1aWQpO1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdHJlZSA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IG5vZGVEYXRhLnV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBuYW1lOiBub2RlRGF0YS5uYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgYWN0aXZlOiBub2RlRGF0YS5hY3RpdmUsXG4gICAgICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRzOiAobm9kZURhdGEgYXMgYW55KS5jb21wb25lbnRzID8gKG5vZGVEYXRhIGFzIGFueSkuY29tcG9uZW50cy5tYXAoKGM6IGFueSkgPT4gYy5fX3R5cGVfXykgOiBbXSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNoaWxkQ291bnQ6IG5vZGVEYXRhLmNoaWxkcmVuID8gbm9kZURhdGEuY2hpbGRyZW4ubGVuZ3RoIDogMCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNoaWxkcmVuOiBbXSBhcyBhbnlbXVxuICAgICAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChub2RlRGF0YS5jaGlsZHJlbiAmJiBub2RlRGF0YS5jaGlsZHJlbi5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0cmVlLmNoaWxkcmVuID0gYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbm9kZURhdGEuY2hpbGRyZW4ubWFwKChjaGlsZElkOiBhbnkpID0+IGJ1aWxkVHJlZShjaGlsZElkLCBkZXB0aCArIDEpKVxuICAgICAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0cmVlO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7IGVycm9yOiBlcnIubWVzc2FnZSB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGlmIChyb290VXVpZCkge1xuICAgICAgICAgICAgICAgIGJ1aWxkVHJlZShyb290VXVpZCkudGhlbih0cmVlID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShvayh0cmVlKSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LWhpZXJhcmNoeScpLnRoZW4oYXN5bmMgKGhpZXJhcmNoeTogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRyZWVzID0gYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgICAgICAgICAgICAgICAgICAgICBoaWVyYXJjaHkuY2hpbGRyZW4ubWFwKChyb290Tm9kZTogYW55KSA9PiBidWlsZFRyZWUocm9vdE5vZGUudXVpZCkpXG4gICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUob2sodHJlZXMpKTtcbiAgICAgICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRQZXJmb3JtYW5jZVN0YXRzSW1wbCgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LXBlcmZvcm1hbmNlJykudGhlbigoc3RhdHM6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHBlcmZTdGF0czogUGVyZm9ybWFuY2VTdGF0cyA9IHtcbiAgICAgICAgICAgICAgICAgICAgbm9kZUNvdW50OiBzdGF0cy5ub2RlQ291bnQgfHwgMCxcbiAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50Q291bnQ6IHN0YXRzLmNvbXBvbmVudENvdW50IHx8IDAsXG4gICAgICAgICAgICAgICAgICAgIGRyYXdDYWxsczogc3RhdHMuZHJhd0NhbGxzIHx8IDAsXG4gICAgICAgICAgICAgICAgICAgIHRyaWFuZ2xlczogc3RhdHMudHJpYW5nbGVzIHx8IDAsXG4gICAgICAgICAgICAgICAgICAgIG1lbW9yeTogc3RhdHMubWVtb3J5IHx8IHt9XG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHBlcmZTdGF0cykpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKCkgPT4ge1xuICAgICAgICAgICAgICAgIC8vIEZhbGxiYWNrIHRvIGJhc2ljIHN0YXRzXG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiAnUGVyZm9ybWFuY2Ugc3RhdHMgbm90IGF2YWlsYWJsZSBpbiBlZGl0IG1vZGUnXG4gICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHZhbGlkYXRlU2NlbmVJbXBsKG9wdGlvbnM6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IGlzc3VlczogVmFsaWRhdGlvbklzc3VlW10gPSBbXTtcblxuICAgICAgICAvLyBDaGVjayBmb3IgbWlzc2luZyBhc3NldHNcbiAgICAgICAgaWYgKG9wdGlvbnMuY2hlY2tNaXNzaW5nQXNzZXRzKSB7XG4gICAgICAgICAgICBjb25zdCBhc3NldENoZWNrID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnY2hlY2stbWlzc2luZy1hc3NldHMnKTtcbiAgICAgICAgICAgIGlmIChhc3NldENoZWNrICYmIGFzc2V0Q2hlY2subWlzc2luZykge1xuICAgICAgICAgICAgICAgIGlzc3Vlcy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogJ2Vycm9yJyxcbiAgICAgICAgICAgICAgICAgICAgY2F0ZWdvcnk6ICdhc3NldHMnLFxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgRm91bmQgJHthc3NldENoZWNrLm1pc3NpbmcubGVuZ3RofSBtaXNzaW5nIGFzc2V0IHJlZmVyZW5jZXNgLFxuICAgICAgICAgICAgICAgICAgICBkZXRhaWxzOiBhc3NldENoZWNrLm1pc3NpbmdcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIENoZWNrIGZvciBwZXJmb3JtYW5jZSBpc3N1ZXNcbiAgICAgICAgaWYgKG9wdGlvbnMuY2hlY2tQZXJmb3JtYW5jZSkge1xuICAgICAgICAgICAgY29uc3QgaGllcmFyY2h5ID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktaGllcmFyY2h5Jyk7XG4gICAgICAgICAgICBjb25zdCBub2RlQ291bnQgPSB0aGlzLmNvdW50Tm9kZXMoaGllcmFyY2h5LmNoaWxkcmVuKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgaWYgKG5vZGVDb3VudCA+IDEwMDApIHtcbiAgICAgICAgICAgICAgICBpc3N1ZXMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgIHR5cGU6ICd3YXJuaW5nJyxcbiAgICAgICAgICAgICAgICAgICAgY2F0ZWdvcnk6ICdwZXJmb3JtYW5jZScsXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBIaWdoIG5vZGUgY291bnQ6ICR7bm9kZUNvdW50fSBub2RlcyAocmVjb21tZW5kZWQgPCAxMDAwKWAsXG4gICAgICAgICAgICAgICAgICAgIHN1Z2dlc3Rpb246ICdDb25zaWRlciB1c2luZyBvYmplY3QgcG9vbGluZyBvciBzY2VuZSBvcHRpbWl6YXRpb24nXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCByZXN1bHQ6IFZhbGlkYXRpb25SZXN1bHQgPSB7XG4gICAgICAgICAgICB2YWxpZDogaXNzdWVzLmxlbmd0aCA9PT0gMCxcbiAgICAgICAgICAgIGlzc3VlQ291bnQ6IGlzc3Vlcy5sZW5ndGgsXG4gICAgICAgICAgICBpc3N1ZXM6IGlzc3Vlc1xuICAgICAgICB9O1xuXG4gICAgICAgIHJldHVybiBvayhyZXN1bHQpO1xuICAgIH1cblxuICAgIHByaXZhdGUgY291bnROb2Rlcyhub2RlczogYW55W10pOiBudW1iZXIge1xuICAgICAgICBsZXQgY291bnQgPSBub2Rlcy5sZW5ndGg7XG4gICAgICAgIGZvciAoY29uc3Qgbm9kZSBvZiBub2Rlcykge1xuICAgICAgICAgICAgaWYgKG5vZGUuY2hpbGRyZW4pIHtcbiAgICAgICAgICAgICAgICBjb3VudCArPSB0aGlzLmNvdW50Tm9kZXMobm9kZS5jaGlsZHJlbik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGNvdW50O1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2V0RWRpdG9ySW5mb0ltcGwoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgaW5mbyA9IHtcbiAgICAgICAgICAgIGVkaXRvcjoge1xuICAgICAgICAgICAgICAgIHZlcnNpb246IChFZGl0b3IgYXMgYW55KS52ZXJzaW9ucz8uZWRpdG9yIHx8ICdVbmtub3duJyxcbiAgICAgICAgICAgICAgICBjb2Nvc1ZlcnNpb246IChFZGl0b3IgYXMgYW55KS52ZXJzaW9ucz8uY29jb3MgfHwgJ1Vua25vd24nLFxuICAgICAgICAgICAgICAgIHBsYXRmb3JtOiBwcm9jZXNzLnBsYXRmb3JtLFxuICAgICAgICAgICAgICAgIGFyY2g6IHByb2Nlc3MuYXJjaCxcbiAgICAgICAgICAgICAgICBub2RlVmVyc2lvbjogcHJvY2Vzcy52ZXJzaW9uXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgcHJvamVjdDoge1xuICAgICAgICAgICAgICAgIG5hbWU6IEVkaXRvci5Qcm9qZWN0Lm5hbWUsXG4gICAgICAgICAgICAgICAgcGF0aDogRWRpdG9yLlByb2plY3QucGF0aCxcbiAgICAgICAgICAgICAgICB1dWlkOiBFZGl0b3IuUHJvamVjdC51dWlkXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgbWVtb3J5OiBwcm9jZXNzLm1lbW9yeVVzYWdlKCksXG4gICAgICAgICAgICB1cHRpbWU6IHByb2Nlc3MudXB0aW1lKClcbiAgICAgICAgfTtcblxuICAgICAgICByZXR1cm4gb2soaW5mbyk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSByZXNvbHZlUHJvamVjdExvZ1BhdGgoKTogeyBwYXRoOiBzdHJpbmcgfSB8IHsgZXJyb3I6IHN0cmluZyB9IHtcbiAgICAgICAgaWYgKCFFZGl0b3IuUHJvamVjdCB8fCAhRWRpdG9yLlByb2plY3QucGF0aCkge1xuICAgICAgICAgICAgcmV0dXJuIHsgZXJyb3I6ICdFZGl0b3IuUHJvamVjdC5wYXRoIGlzIG5vdCBhdmFpbGFibGU7IGNhbm5vdCBsb2NhdGUgcHJvamVjdCBsb2cgZmlsZS4nIH07XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgbG9nUGF0aCA9IHBhdGguam9pbihFZGl0b3IuUHJvamVjdC5wYXRoLCAndGVtcC9sb2dzL3Byb2plY3QubG9nJyk7XG4gICAgICAgIGlmICghZnMuZXhpc3RzU3luYyhsb2dQYXRoKSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgZXJyb3I6IGBQcm9qZWN0IGxvZyBmaWxlIG5vdCBmb3VuZCBhdCAke2xvZ1BhdGh9YCB9O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7IHBhdGg6IGxvZ1BhdGggfTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldFByb2plY3RMb2dzSW1wbChsaW5lczogbnVtYmVyID0gMTAwLCBmaWx0ZXJLZXl3b3JkPzogc3RyaW5nLCBsb2dMZXZlbDogc3RyaW5nID0gJ0FMTCcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcmVzb2x2ZWQgPSB0aGlzLnJlc29sdmVQcm9qZWN0TG9nUGF0aCgpO1xuICAgICAgICAgICAgaWYgKCdlcnJvcicgaW4gcmVzb2x2ZWQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFpbChyZXNvbHZlZC5lcnJvcik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBsb2dGaWxlUGF0aCA9IHJlc29sdmVkLnBhdGg7XG5cbiAgICAgICAgICAgIC8vIFJlYWQgdGhlIGZpbGUgY29udGVudFxuICAgICAgICAgICAgY29uc3QgbG9nQ29udGVudCA9IGZzLnJlYWRGaWxlU3luYyhsb2dGaWxlUGF0aCwgJ3V0ZjgnKTtcbiAgICAgICAgICAgIGNvbnN0IGxvZ0xpbmVzID0gbG9nQ29udGVudC5zcGxpdCgnXFxuJykuZmlsdGVyKGxpbmUgPT4gbGluZS50cmltKCkgIT09ICcnKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gR2V0IHRoZSBsYXN0IE4gbGluZXNcbiAgICAgICAgICAgIGNvbnN0IHJlY2VudExpbmVzID0gbG9nTGluZXMuc2xpY2UoLWxpbmVzKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gQXBwbHkgZmlsdGVyc1xuICAgICAgICAgICAgbGV0IGZpbHRlcmVkTGluZXMgPSByZWNlbnRMaW5lcztcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gRmlsdGVyIGJ5IGxvZyBsZXZlbCBpZiBub3QgJ0FMTCdcbiAgICAgICAgICAgIGlmIChsb2dMZXZlbCAhPT0gJ0FMTCcpIHtcbiAgICAgICAgICAgICAgICBmaWx0ZXJlZExpbmVzID0gZmlsdGVyQnlMZXZlbChmaWx0ZXJlZExpbmVzLCBsb2dMZXZlbCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIEZpbHRlciBieSBrZXl3b3JkIGlmIHByb3ZpZGVkXG4gICAgICAgICAgICBpZiAoZmlsdGVyS2V5d29yZCkge1xuICAgICAgICAgICAgICAgIGZpbHRlcmVkTGluZXMgPSBmaWx0ZXJCeUtleXdvcmQoZmlsdGVyZWRMaW5lcywgZmlsdGVyS2V5d29yZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgICAgIHRvdGFsTGluZXM6IGxvZ0xpbmVzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgcmVxdWVzdGVkTGluZXM6IGxpbmVzLFxuICAgICAgICAgICAgICAgICAgICBmaWx0ZXJlZExpbmVzOiBmaWx0ZXJlZExpbmVzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgbG9nTGV2ZWw6IGxvZ0xldmVsLFxuICAgICAgICAgICAgICAgICAgICBmaWx0ZXJLZXl3b3JkOiBmaWx0ZXJLZXl3b3JkIHx8IG51bGwsXG4gICAgICAgICAgICAgICAgICAgIGxvZ3M6IGZpbHRlcmVkTGluZXMsXG4gICAgICAgICAgICAgICAgICAgIGxvZ0ZpbGVQYXRoOiBsb2dGaWxlUGF0aFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChgRmFpbGVkIHRvIHJlYWQgcHJvamVjdCBsb2dzOiAke2Vycm9yLm1lc3NhZ2V9YCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldExvZ0ZpbGVJbmZvSW1wbCgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcmVzb2x2ZWQgPSB0aGlzLnJlc29sdmVQcm9qZWN0TG9nUGF0aCgpO1xuICAgICAgICAgICAgaWYgKCdlcnJvcicgaW4gcmVzb2x2ZWQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFpbChyZXNvbHZlZC5lcnJvcik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBsb2dGaWxlUGF0aCA9IHJlc29sdmVkLnBhdGg7XG5cbiAgICAgICAgICAgIGNvbnN0IHN0YXRzID0gZnMuc3RhdFN5bmMobG9nRmlsZVBhdGgpO1xuICAgICAgICAgICAgY29uc3QgbG9nQ29udGVudCA9IGZzLnJlYWRGaWxlU3luYyhsb2dGaWxlUGF0aCwgJ3V0ZjgnKTtcbiAgICAgICAgICAgIGNvbnN0IGxpbmVDb3VudCA9IGxvZ0NvbnRlbnQuc3BsaXQoJ1xcbicpLmZpbHRlcihsaW5lID0+IGxpbmUudHJpbSgpICE9PSAnJykubGVuZ3RoO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICByZXR1cm4gb2soe1xuICAgICAgICAgICAgICAgICAgICBmaWxlUGF0aDogbG9nRmlsZVBhdGgsXG4gICAgICAgICAgICAgICAgICAgIGZpbGVTaXplOiBzdGF0cy5zaXplLFxuICAgICAgICAgICAgICAgICAgICBmaWxlU2l6ZUZvcm1hdHRlZDogdGhpcy5mb3JtYXRGaWxlU2l6ZShzdGF0cy5zaXplKSxcbiAgICAgICAgICAgICAgICAgICAgbGFzdE1vZGlmaWVkOiBzdGF0cy5tdGltZS50b0lTT1N0cmluZygpLFxuICAgICAgICAgICAgICAgICAgICBsaW5lQ291bnQ6IGxpbmVDb3VudCxcbiAgICAgICAgICAgICAgICAgICAgY3JlYXRlZDogc3RhdHMuYmlydGh0aW1lLnRvSVNPU3RyaW5nKCksXG4gICAgICAgICAgICAgICAgICAgIGFjY2Vzc2libGU6IGZzLmNvbnN0YW50cy5SX09LXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGBGYWlsZWQgdG8gZ2V0IGxvZyBmaWxlIGluZm86ICR7ZXJyb3IubWVzc2FnZX1gKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgc2VhcmNoUHJvamVjdExvZ3NJbXBsKHBhdHRlcm46IHN0cmluZywgbWF4UmVzdWx0czogbnVtYmVyID0gMjAsIGNvbnRleHRMaW5lczogbnVtYmVyID0gMik6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByZXNvbHZlZCA9IHRoaXMucmVzb2x2ZVByb2plY3RMb2dQYXRoKCk7XG4gICAgICAgICAgICBpZiAoJ2Vycm9yJyBpbiByZXNvbHZlZCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKHJlc29sdmVkLmVycm9yKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGxvZ0ZpbGVQYXRoID0gcmVzb2x2ZWQucGF0aDtcblxuICAgICAgICAgICAgY29uc3QgbG9nQ29udGVudCA9IGZzLnJlYWRGaWxlU3luYyhsb2dGaWxlUGF0aCwgJ3V0ZjgnKTtcbiAgICAgICAgICAgIGNvbnN0IGxvZ0xpbmVzID0gbG9nQ29udGVudC5zcGxpdCgnXFxuJyk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIENyZWF0ZSByZWdleCBwYXR0ZXJuIChzdXBwb3J0IGJvdGggc3RyaW5nIGFuZCByZWdleCBwYXR0ZXJucylcbiAgICAgICAgICAgIGxldCByZWdleDogUmVnRXhwO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICByZWdleCA9IG5ldyBSZWdFeHAocGF0dGVybiwgJ2dpJyk7XG4gICAgICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgICAgICAvLyBJZiBwYXR0ZXJuIGlzIG5vdCB2YWxpZCByZWdleCwgdHJlYXQgYXMgbGl0ZXJhbCBzdHJpbmdcbiAgICAgICAgICAgICAgICByZWdleCA9IG5ldyBSZWdFeHAocGF0dGVybi5yZXBsYWNlKC9bLiorP14ke30oKXxbXFxdXFxcXF0vZywgJ1xcXFwkJicpLCAnZ2knKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgY29uc3QgYWxsTWF0Y2hlcyA9IHNlYXJjaFdpdGhDb250ZXh0KGxvZ0xpbmVzLCByZWdleCwgY29udGV4dExpbmVzKTtcbiAgICAgICAgICAgIGNvbnN0IG1hdGNoZXMgPSBhbGxNYXRjaGVzLnNsaWNlKDAsIG1heFJlc3VsdHMpLm1hcChtID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBjb250ZXh0TGluZXNBcnJheSA9IFtdO1xuICAgICAgICAgICAgICAgIGxldCBjdXJyZW50TGluZU51bSA9IG0ubWF0Y2hMaW5lIC0gbS5iZWZvcmUubGVuZ3RoO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgbGluZSBvZiBtLmJlZm9yZSkge1xuICAgICAgICAgICAgICAgICAgICBjb250ZXh0TGluZXNBcnJheS5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxpbmVOdW1iZXI6IGN1cnJlbnRMaW5lTnVtKyssXG4gICAgICAgICAgICAgICAgICAgICAgICBjb250ZW50OiBsaW5lLFxuICAgICAgICAgICAgICAgICAgICAgICAgaXNNYXRjaDogZmFsc2VcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGNvbnRleHRMaW5lc0FycmF5LnB1c2goe1xuICAgICAgICAgICAgICAgICAgICBsaW5lTnVtYmVyOiBtLm1hdGNoTGluZSxcbiAgICAgICAgICAgICAgICAgICAgY29udGVudDogbS5tYXRjaCxcbiAgICAgICAgICAgICAgICAgICAgaXNNYXRjaDogdHJ1ZVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGN1cnJlbnRMaW5lTnVtKys7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCBsaW5lIG9mIG0uYWZ0ZXIpIHtcbiAgICAgICAgICAgICAgICAgICAgY29udGV4dExpbmVzQXJyYXkucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgICAgICBsaW5lTnVtYmVyOiBjdXJyZW50TGluZU51bSsrLFxuICAgICAgICAgICAgICAgICAgICAgICAgY29udGVudDogbGluZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGlzTWF0Y2g6IGZhbHNlXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICBsaW5lTnVtYmVyOiBtLm1hdGNoTGluZSxcbiAgICAgICAgICAgICAgICAgICAgbWF0Y2hlZExpbmU6IG0ubWF0Y2gsXG4gICAgICAgICAgICAgICAgICAgIGNvbnRleHQ6IGNvbnRleHRMaW5lc0FycmF5XG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICByZXR1cm4gb2soe1xuICAgICAgICAgICAgICAgICAgICBwYXR0ZXJuOiBwYXR0ZXJuLFxuICAgICAgICAgICAgICAgICAgICB0b3RhbE1hdGNoZXM6IGFsbE1hdGNoZXMubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICBtYXhSZXN1bHRzOiBtYXhSZXN1bHRzLFxuICAgICAgICAgICAgICAgICAgICBjb250ZXh0TGluZXM6IGNvbnRleHRMaW5lcyxcbiAgICAgICAgICAgICAgICAgICAgbG9nRmlsZVBhdGg6IGxvZ0ZpbGVQYXRoLFxuICAgICAgICAgICAgICAgICAgICBtYXRjaGVzOiBtYXRjaGVzXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGBGYWlsZWQgdG8gc2VhcmNoIHByb2plY3QgbG9nczogJHtlcnJvci5tZXNzYWdlfWApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBmb3JtYXRGaWxlU2l6ZShieXRlczogbnVtYmVyKTogc3RyaW5nIHtcbiAgICAgICAgY29uc3QgdW5pdHMgPSBbJ0InLCAnS0InLCAnTUInLCAnR0InXTtcbiAgICAgICAgbGV0IHNpemUgPSBieXRlcztcbiAgICAgICAgbGV0IHVuaXRJbmRleCA9IDA7XG5cbiAgICAgICAgd2hpbGUgKHNpemUgPj0gMTAyNCAmJiB1bml0SW5kZXggPCB1bml0cy5sZW5ndGggLSAxKSB7XG4gICAgICAgICAgICBzaXplIC89IDEwMjQ7XG4gICAgICAgICAgICB1bml0SW5kZXgrKztcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBgJHtzaXplLnRvRml4ZWQoMil9ICR7dW5pdHNbdW5pdEluZGV4XX1gO1xuICAgIH1cblxuICAgIHByaXZhdGUgcGlja1dpbmRvdyh0aXRsZVN1YnN0cmluZz86IHN0cmluZyk6IGFueSB7XG4gICAgICAgIC8vIExhenkgcmVxdWlyZSBzbyB0aGF0IG5vbi1FbGVjdHJvbiBjb250ZXh0cyAoZS5nLiB1bml0IHRlc3RzLCBzbW9rZVxuICAgICAgICAvLyBzY3JpcHQgd2l0aCBzdHViIHJlZ2lzdHJ5KSBjYW4gc3RpbGwgaW1wb3J0IHRoaXMgbW9kdWxlLlxuICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLXZhci1yZXF1aXJlc1xuICAgICAgICBjb25zdCBlbGVjdHJvbiA9IHJlcXVpcmUoJ2VsZWN0cm9uJyk7XG4gICAgICAgIGNvbnN0IEJXID0gZWxlY3Ryb24uQnJvd3NlcldpbmRvdztcbiAgICAgICAgaWYgKCFCVykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdFbGVjdHJvbiBCcm93c2VyV2luZG93IEFQSSB1bmF2YWlsYWJsZTsgc2NyZWVuc2hvdCB0b29sIHJlcXVpcmVzIHJ1bm5pbmcgaW5zaWRlIENvY29zIGVkaXRvciBob3N0IHByb2Nlc3MuJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRpdGxlU3Vic3RyaW5nKSB7XG4gICAgICAgICAgICBjb25zdCBtYXRjaGVzID0gQlcuZ2V0QWxsV2luZG93cygpLmZpbHRlcigodzogYW55KSA9PlxuICAgICAgICAgICAgICAgIHcgJiYgIXcuaXNEZXN0cm95ZWQoKSAmJiAody5nZXRUaXRsZT8uKCkgfHwgJycpLmluY2x1ZGVzKHRpdGxlU3Vic3RyaW5nKSk7XG4gICAgICAgICAgICBpZiAobWF0Y2hlcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE5vIEVsZWN0cm9uIHdpbmRvdyB0aXRsZSBtYXRjaGVkIHN1YnN0cmluZzogJHt0aXRsZVN1YnN0cmluZ31gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBtYXRjaGVzWzBdO1xuICAgICAgICB9XG4gICAgICAgIC8vIHYyLjMuMSByZXZpZXcgZml4OiBmb2N1c2VkIHdpbmRvdyBtYXkgYmUgYSB0cmFuc2llbnQgcHJldmlldyBwb3B1cC5cbiAgICAgICAgLy8gUHJlZmVyIGEgbm9uLVByZXZpZXcgd2luZG93IHNvIGRlZmF1bHQgc2NyZWVuc2hvdHMgdGFyZ2V0IHRoZSBtYWluXG4gICAgICAgIC8vIGVkaXRvciBzdXJmYWNlLiBDYWxsZXIgY2FuIHN0aWxsIHBhc3MgdGl0bGVTdWJzdHJpbmc9J1ByZXZpZXcnIHRvXG4gICAgICAgIC8vIGV4cGxpY2l0bHkgdGFyZ2V0IHRoZSBwcmV2aWV3IHdoZW4gd2FudGVkLlxuICAgICAgICBjb25zdCBhbGw6IGFueVtdID0gQlcuZ2V0QWxsV2luZG93cygpLmZpbHRlcigodzogYW55KSA9PiB3ICYmICF3LmlzRGVzdHJveWVkKCkpO1xuICAgICAgICBpZiAoYWxsLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyBsaXZlIEVsZWN0cm9uIHdpbmRvd3M7IGNhbm5vdCBjYXB0dXJlIHNjcmVlbnNob3QuJyk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgaXNQcmV2aWV3ID0gKHc6IGFueSkgPT4gL3ByZXZpZXcvaS50ZXN0KHcuZ2V0VGl0bGU/LigpIHx8ICcnKTtcbiAgICAgICAgY29uc3Qgbm9uUHJldmlldyA9IGFsbC5maWx0ZXIoKHc6IGFueSkgPT4gIWlzUHJldmlldyh3KSk7XG4gICAgICAgIGNvbnN0IGZvY3VzZWQgPSBCVy5nZXRGb2N1c2VkV2luZG93Py4oKTtcbiAgICAgICAgaWYgKGZvY3VzZWQgJiYgIWZvY3VzZWQuaXNEZXN0cm95ZWQoKSAmJiAhaXNQcmV2aWV3KGZvY3VzZWQpKSByZXR1cm4gZm9jdXNlZDtcbiAgICAgICAgaWYgKG5vblByZXZpZXcubGVuZ3RoID4gMCkgcmV0dXJuIG5vblByZXZpZXdbMF07XG4gICAgICAgIHJldHVybiBhbGxbMF07XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBlbnN1cmVDYXB0dXJlRGlyKCk6IHsgb2s6IHRydWU7IGRpcjogc3RyaW5nIH0gfCB7IG9rOiBmYWxzZTsgZXJyb3I6IHN0cmluZyB9IHtcbiAgICAgICAgaWYgKCFFZGl0b3IuUHJvamVjdCB8fCAhRWRpdG9yLlByb2plY3QucGF0aCkge1xuICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogJ0VkaXRvci5Qcm9qZWN0LnBhdGggaXMgbm90IGF2YWlsYWJsZTsgY2Fubm90IHJlc29sdmUgY2FwdHVyZSBvdXRwdXQgZGlyZWN0b3J5LicgfTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBkaXIgPSBwYXRoLmpvaW4oRWRpdG9yLlByb2plY3QucGF0aCwgJ3RlbXAnLCAnbWNwLWNhcHR1cmVzJyk7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBmcy5ta2RpclN5bmMoZGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiB0cnVlLCBkaXIgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGBGYWlsZWQgdG8gY3JlYXRlIGNhcHR1cmUgZGlyOiAke2Vycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKX1gIH07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyB2Mi44LjAgVC1WMjgtMiAoY2FycnlvdmVyIGZyb20gdjIuNy4wIENvZGV4IHNpbmdsZS1yZXZpZXdlciDwn5+hKVxuICAgIC8vIOKGkiB2Mi44LjEgcm91bmQtMSBmaXggKENvZGV4IPCflLQgKyBDbGF1ZGUg8J+foSk6IHRoZSB2Mi44LjAgaGVscGVyXG4gICAgLy8gcmVhbHBhdGgnZCBgZGlyYCBhbmQgYHBhdGguZGlybmFtZShwYXRoLmpvaW4oZGlyLCBiYXNlbmFtZSkpYCBhbmRcbiAgICAvLyBjb21wYXJlZCB0aGUgdHdvIOKAlCBidXQgd2l0aCBhIGZpeGVkIGJhc2VuYW1lIHRob3NlIGV4cHJlc3Npb25zIGJvdGhcbiAgICAvLyBjb2xsYXBzZSB0byBgZGlyYCwgbWFraW5nIHRoZSBlcXVhbGl0eSBjaGVjayB0YXV0b2xvZ2ljYWwuIFRoZSBjaGVja1xuICAgIC8vIHByb3RlY3RlZCBub3RoaW5nIGlmIGA8cHJvamVjdD4vdGVtcC9tY3AtY2FwdHVyZXNgIGl0c2VsZiB3YXMgYVxuICAgIC8vIHN5bWxpbmsgdGhhdCBlc2NhcGVzIHRoZSBwcm9qZWN0IHRyZWUuXG4gICAgLy9cbiAgICAvLyBUcnVlIGVzY2FwZSBwcm90ZWN0aW9uIHJlcXVpcmVzIGFuY2hvcmluZyBhZ2FpbnN0IHRoZSBwcm9qZWN0IHJvb3QuXG4gICAgLy8gV2Ugbm93IHJlYWxwYXRoIEJPVEggdGhlIGNhcHR1cmUgZGlyIGFuZCBgRWRpdG9yLlByb2plY3QucGF0aGAgYW5kXG4gICAgLy8gcmVxdWlyZSB0aGUgcmVzb2x2ZWQgY2FwdHVyZSBkaXIgdG8gYmUgaW5zaWRlIHRoZSByZXNvbHZlZCBwcm9qZWN0XG4gICAgLy8gcm9vdCAoZXF1YWxpdHkgT1IgYHJlYWxEaXIuc3RhcnRzV2l0aChyZWFsUHJvamVjdFJvb3QgKyBzZXApYCkuXG4gICAgLy8gVGhlIGludHJhLWRpciBjaGVjayBpcyBrZXB0IGZvciBjaGVhcCBkZWZlbnNlLWluLWRlcHRoIGluIGNhc2UgYVxuICAgIC8vIGZ1dHVyZSBiYXNlbmFtZSBnZXRzIHRyYXZlcnNhbCBjaGFyYWN0ZXJzIHRocmVhZGVkIHRocm91Z2guXG4gICAgLy9cbiAgICAvLyBSZXR1cm5zIHsgb2s6IHRydWUsIGZpbGVQYXRoLCBkaXIgfSB3aGVuIHNhZmUgdG8gd3JpdGUsIG9yXG4gICAgLy8geyBvazogZmFsc2UsIGVycm9yIH0gd2l0aCB0aGUgc2FtZSBlcnJvciBlbnZlbG9wZSBzaGFwZSBhc1xuICAgIC8vIGVuc3VyZUNhcHR1cmVEaXIgc28gY2FsbGVycyBjYW4gZmFsbCB0aHJvdWdoIHRoZWlyIGV4aXN0aW5nXG4gICAgLy8gZXJyb3ItcmV0dXJuIHBhdHRlcm4uXG4gICAgcHJpdmF0ZSByZXNvbHZlQXV0b0NhcHR1cmVGaWxlKGJhc2VuYW1lOiBzdHJpbmcpOiB7IG9rOiB0cnVlOyBmaWxlUGF0aDogc3RyaW5nOyBkaXI6IHN0cmluZyB9IHwgeyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmcgfSB7XG4gICAgICAgIGNvbnN0IGRpclJlc3VsdCA9IHRoaXMuZW5zdXJlQ2FwdHVyZURpcigpO1xuICAgICAgICBpZiAoIWRpclJlc3VsdC5vaykgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogZGlyUmVzdWx0LmVycm9yIH07XG4gICAgICAgIGNvbnN0IHByb2plY3RQYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQgPSBFZGl0b3I/LlByb2plY3Q/LnBhdGg7XG4gICAgICAgIGlmICghcHJvamVjdFBhdGgpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6ICdFZGl0b3IuUHJvamVjdC5wYXRoIGlzIG5vdCBhdmFpbGFibGU7IGNhbm5vdCBhbmNob3IgY2FwdHVyZS1kaXIgY29udGFpbm1lbnQgY2hlY2suJyB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGZpbGVQYXRoID0gcGF0aC5qb2luKGRpclJlc3VsdC5kaXIsIGJhc2VuYW1lKTtcbiAgICAgICAgbGV0IHJlYWxEaXI6IHN0cmluZztcbiAgICAgICAgbGV0IHJlYWxQYXJlbnQ6IHN0cmluZztcbiAgICAgICAgbGV0IHJlYWxQcm9qZWN0Um9vdDogc3RyaW5nO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcnA6IGFueSA9IGZzLnJlYWxwYXRoU3luYyBhcyBhbnk7XG4gICAgICAgICAgICBjb25zdCByZXNvbHZlUmVhbCA9IHJwLm5hdGl2ZSA/PyBycDtcbiAgICAgICAgICAgIHJlYWxEaXIgPSByZXNvbHZlUmVhbChkaXJSZXN1bHQuZGlyKTtcbiAgICAgICAgICAgIHJlYWxQYXJlbnQgPSByZXNvbHZlUmVhbChwYXRoLmRpcm5hbWUoZmlsZVBhdGgpKTtcbiAgICAgICAgICAgIHJlYWxQcm9qZWN0Um9vdCA9IHJlc29sdmVSZWFsKHByb2plY3RQYXRoKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGBzY3JlZW5zaG90IHBhdGggcmVhbHBhdGggZmFpbGVkOiAke2Vycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKX1gIH07XG4gICAgICAgIH1cbiAgICAgICAgLy8gRGVmZW5zZS1pbi1kZXB0aDogcGFyZW50IG9mIHRoZSByZXNvbHZlZCBmaWxlIG11c3QgZXF1YWwgdGhlXG4gICAgICAgIC8vIHJlc29sdmVkIGNhcHR1cmUgZGlyIChjYXRjaGVzIGZ1dHVyZSBiYXNlbmFtZXMgdGhyZWFkaW5nIGAuLmApLlxuICAgICAgICBpZiAocGF0aC5yZXNvbHZlKHJlYWxQYXJlbnQpICE9PSBwYXRoLnJlc29sdmUocmVhbERpcikpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6ICdzY3JlZW5zaG90IHNhdmUgcGF0aCByZXNvbHZlZCBvdXRzaWRlIHRoZSBjYXB0dXJlIGRpcmVjdG9yeScgfTtcbiAgICAgICAgfVxuICAgICAgICAvLyBQcmltYXJ5IHByb3RlY3Rpb246IGNhcHR1cmUgZGlyIGl0c2VsZiBtdXN0IHJlc29sdmUgaW5zaWRlIHRoZVxuICAgICAgICAvLyBwcm9qZWN0IHJvb3QsIHNvIGEgc3ltbGluayBjaGFpbiBvbiBgdGVtcC9tY3AtY2FwdHVyZXNgIGNhbm5vdFxuICAgICAgICAvLyBwaXZvdCB3cml0ZXMgdG8gZS5nLiAvZXRjIG9yIEM6XFxXaW5kb3dzLlxuICAgICAgICAvLyB2Mi45LnggcG9saXNoIChDb2RleCByMiBzaW5nbGUt8J+foSBmcm9tIHYyLjguMSByZXZpZXcpOiB1c2VcbiAgICAgICAgLy8gcGF0aC5yZWxhdGl2ZSBpbnN0ZWFkIG9mIGByb290ICsgcGF0aC5zZXBgIHByZWZpeCBjaGVjayDigJRcbiAgICAgICAgLy8gd2hlbiByb290IGlzIGEgZHJpdmUgcm9vdCAoYEM6XFxgKSwgcGF0aC5yZXNvbHZlIG5vcm1hbGlzZXMgaXRcbiAgICAgICAgLy8gdG8gYEM6XFxcXGAgYW5kIGBwYXRoLnNlcGAgYWRkcyBhbm90aGVyIGBcXGAsIHByb2R1Y2luZyBgQzpcXFxcXFxcXGBcbiAgICAgICAgLy8gd2hpY2ggYSBjYW5kaWRhdGUgbGlrZSBgQzpcXFxcZm9vYCBkb2VzIG5vdCBtYXRjaC4gcGF0aC5yZWxhdGl2ZVxuICAgICAgICAvLyBhbHNvIGhhbmRsZXMgdGhlIEM6XFxmb28gdnMgQzpcXGZvb2JhciBwcmVmaXgtY29sbGlzaW9uIGNhc2UuXG4gICAgICAgIGlmICghaXNQYXRoV2l0aGluUm9vdChyZWFsRGlyLCByZWFsUHJvamVjdFJvb3QpKSB7XG4gICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBgY2FwdHVyZSBkaXIgcmVzb2x2ZWQgb3V0c2lkZSB0aGUgcHJvamVjdCByb290OiAke3BhdGgucmVzb2x2ZShyZWFsRGlyKX0gbm90IHdpdGhpbiAke3BhdGgucmVzb2x2ZShyZWFsUHJvamVjdFJvb3QpfWAgfTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSwgZmlsZVBhdGgsIGRpcjogZGlyUmVzdWx0LmRpciB9O1xuICAgIH1cblxuICAgIC8vIHYyLjguMSByb3VuZC0xIGZpeCAoR2VtaW5pIPCflLQgKyBDb2RleCDwn5+hKTogd2hlbiBjYWxsZXIgcGFzc2VzIGFuXG4gICAgLy8gZXhwbGljaXQgc2F2ZVBhdGggLyBzYXZlUGF0aFByZWZpeCwgd2Ugc3RpbGwgbmVlZCB0aGUgc2FtZSBwcm9qZWN0LVxuICAgIC8vIHJvb3QgY29udGFpbm1lbnQgZ3VhcmFudGVlIHRoYXQgcmVzb2x2ZUF1dG9DYXB0dXJlRmlsZSBnaXZlcyB0aGVcbiAgICAvLyBhdXRvLW5hbWVkIGJyYW5jaC4gQUktZ2VuZXJhdGVkIGFic29sdXRlIHBhdGhzIGNvdWxkIG90aGVyd2lzZVxuICAgIC8vIHdyaXRlIG91dHNpZGUgdGhlIHByb2plY3Qgcm9vdC5cbiAgICAvL1xuICAgIC8vIFRoZSBjaGVjayByZXNvbHZlcyB0aGUgcGFyZW50IGRpcmVjdG9yeSAodGhlIGZpbGUgaXRzZWxmIG1heSBub3RcbiAgICAvLyBleGlzdCB5ZXQpIGFuZCByZXF1aXJlcyBpdCB0byBiZSBpbnNpZGUgYHJlYWxwYXRoKEVkaXRvci5Qcm9qZWN0LnBhdGgpYC5cbiAgICBwcml2YXRlIGFzc2VydFNhdmVQYXRoV2l0aGluUHJvamVjdChzYXZlUGF0aDogc3RyaW5nKTogeyBvazogdHJ1ZTsgcmVzb2x2ZWRQYXRoOiBzdHJpbmcgfSB8IHsgb2s6IGZhbHNlOyBlcnJvcjogc3RyaW5nIH0ge1xuICAgICAgICBjb25zdCBwcm9qZWN0UGF0aDogc3RyaW5nIHwgdW5kZWZpbmVkID0gRWRpdG9yPy5Qcm9qZWN0Py5wYXRoO1xuICAgICAgICBpZiAoIXByb2plY3RQYXRoKSB7XG4gICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiAnRWRpdG9yLlByb2plY3QucGF0aCBpcyBub3QgYXZhaWxhYmxlOyBjYW5ub3QgdmFsaWRhdGUgZXhwbGljaXQgc2F2ZVBhdGguJyB9O1xuICAgICAgICB9XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBycDogYW55ID0gZnMucmVhbHBhdGhTeW5jIGFzIGFueTtcbiAgICAgICAgICAgIGNvbnN0IHJlc29sdmVSZWFsID0gcnAubmF0aXZlID8/IHJwO1xuICAgICAgICAgICAgY29uc3QgcmVhbFByb2plY3RSb290ID0gcmVzb2x2ZVJlYWwocHJvamVjdFBhdGgpO1xuICAgICAgICAgICAgLy8gdjIuOC4yIHJldGVzdCBmaXggKENvZGV4IHIyIPCfn6EgIzEpOiBhIHJlbGF0aXZlIHNhdmVQYXRoIHdvdWxkXG4gICAgICAgICAgICAvLyBtYWtlIGBwYXRoLmRpcm5hbWUoc2F2ZVBhdGgpYCBjb2xsYXBzZSB0byAnLicgYW5kIHJlc29sdmUgdG9cbiAgICAgICAgICAgIC8vIHRoZSBob3N0IHByb2Nlc3MgY3dkIChvZnRlbiBgPGVkaXRvci1pbnN0YWxsPi9Db2Nvc0Rhc2hib2FyZGApXG4gICAgICAgICAgICAvLyByYXRoZXIgdGhhbiB0aGUgcHJvamVjdCByb290LiBBbmNob3IgcmVsYXRpdmUgcGF0aHMgYWdhaW5zdFxuICAgICAgICAgICAgLy8gdGhlIHByb2plY3Qgcm9vdCBleHBsaWNpdGx5IHNvIHRoZSBBSSdzIGludHVpdGl2ZSBcInJlbGF0aXZlXG4gICAgICAgICAgICAvLyB0byBteSBwcm9qZWN0XCIgaW50ZXJwcmV0YXRpb24gaXMgd2hhdCB0aGUgY2hlY2sgZW5mb3JjZXMuXG4gICAgICAgICAgICBjb25zdCBhYnNvbHV0ZVNhdmVQYXRoID0gcGF0aC5pc0Fic29sdXRlKHNhdmVQYXRoKVxuICAgICAgICAgICAgICAgID8gc2F2ZVBhdGhcbiAgICAgICAgICAgICAgICA6IHBhdGgucmVzb2x2ZShwcm9qZWN0UGF0aCwgc2F2ZVBhdGgpO1xuICAgICAgICAgICAgY29uc3QgcGFyZW50ID0gcGF0aC5kaXJuYW1lKGFic29sdXRlU2F2ZVBhdGgpO1xuICAgICAgICAgICAgLy8gUGFyZW50IG11c3QgYWxyZWFkeSBleGlzdCBmb3IgcmVhbHBhdGg7IGlmIGl0IGRvZXNuJ3QsIHRoZVxuICAgICAgICAgICAgLy8gd3JpdGUgd291bGQgZmFpbCBhbnl3YXksIGJ1dCByZXR1cm4gYSBjbGVhcmVyIGVycm9yIGhlcmUuXG4gICAgICAgICAgICBsZXQgcmVhbFBhcmVudDogc3RyaW5nO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICByZWFsUGFyZW50ID0gcmVzb2x2ZVJlYWwocGFyZW50KTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogYHNhdmVQYXRoIHBhcmVudCBkaXIgbWlzc2luZyBvciB1bnJlYWRhYmxlOiAke2Vycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKX1gIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyB2Mi45LnggcG9saXNoIChDb2RleCByMiBzaW5nbGUt8J+foSBmcm9tIHYyLjguMSByZXZpZXcpOiBzYW1lXG4gICAgICAgICAgICAvLyBwYXRoLnJlbGF0aXZlLWJhc2VkIGNvbnRhaW5tZW50IGFzIHJlc29sdmVBdXRvQ2FwdHVyZUZpbGUuXG4gICAgICAgICAgICBpZiAoIWlzUGF0aFdpdGhpblJvb3QocmVhbFBhcmVudCwgcmVhbFByb2plY3RSb290KSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgIG9rOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGBzYXZlUGF0aCByZXNvbHZlZCBvdXRzaWRlIHRoZSBwcm9qZWN0IHJvb3Q6ICR7cGF0aC5yZXNvbHZlKHJlYWxQYXJlbnQpfSBub3Qgd2l0aGluICR7cGF0aC5yZXNvbHZlKHJlYWxQcm9qZWN0Um9vdCl9LiBVc2UgYSBwYXRoIGluc2lkZSA8cHJvamVjdD4vIG9yIG9taXQgc2F2ZVBhdGggdG8gYXV0by1uYW1lIGludG8gPHByb2plY3Q+L3RlbXAvbWNwLWNhcHR1cmVzLmAsXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB7IG9rOiB0cnVlLCByZXNvbHZlZFBhdGg6IGFic29sdXRlU2F2ZVBhdGggfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGBzYXZlUGF0aCByZWFscGF0aCBmYWlsZWQ6ICR7ZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpfWAgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgc2NyZWVuc2hvdEltcGwoc2F2ZVBhdGg/OiBzdHJpbmcsIHdpbmRvd1RpdGxlPzogc3RyaW5nLCBpbmNsdWRlQmFzZTY0OiBib29sZWFuID0gZmFsc2UpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBsZXQgZmlsZVBhdGggPSBzYXZlUGF0aDtcbiAgICAgICAgaWYgKCFmaWxlUGF0aCkge1xuICAgICAgICAgICAgY29uc3QgcmVzb2x2ZWQgPSB0aGlzLnJlc29sdmVBdXRvQ2FwdHVyZUZpbGUoYHNjcmVlbnNob3QtJHtEYXRlLm5vdygpfS5wbmdgKTtcbiAgICAgICAgICAgIGlmICghcmVzb2x2ZWQub2spIHJldHVybiBmYWlsKHJlc29sdmVkLmVycm9yKTtcbiAgICAgICAgICAgIGZpbGVQYXRoID0gcmVzb2x2ZWQuZmlsZVBhdGg7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyB2Mi44LjEgcm91bmQtMSBmaXggKEdlbWluaSDwn5S0ICsgQ29kZXgg8J+foSk6IGV4cGxpY2l0IHNhdmVQYXRoXG4gICAgICAgICAgICAvLyBhbHNvIGdldHMgY29udGFpbm1lbnQtY2hlY2tlZC4gQUktZ2VuZXJhdGVkIHBhdGhzIGNvdWxkXG4gICAgICAgICAgICAvLyBvdGhlcndpc2Ugd3JpdGUgb3V0c2lkZSB0aGUgcHJvamVjdCByb290LlxuICAgICAgICAgICAgLy8gdjIuOC4yIHJldGVzdCBmaXg6IHVzZSB0aGUgaGVscGVyJ3MgcmVzb2x2ZWRQYXRoIHNvIGFcbiAgICAgICAgICAgIC8vIHJlbGF0aXZlIHNhdmVQYXRoIGFjdHVhbGx5IGxhbmRzIGluc2lkZSB0aGUgcHJvamVjdCByb290LlxuICAgICAgICAgICAgY29uc3QgZ3VhcmQgPSB0aGlzLmFzc2VydFNhdmVQYXRoV2l0aGluUHJvamVjdChmaWxlUGF0aCk7XG4gICAgICAgICAgICBpZiAoIWd1YXJkLm9rKSByZXR1cm4gZmFpbChndWFyZC5lcnJvcik7XG4gICAgICAgICAgICBmaWxlUGF0aCA9IGd1YXJkLnJlc29sdmVkUGF0aDtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCB3aW4gPSB0aGlzLnBpY2tXaW5kb3cod2luZG93VGl0bGUpO1xuICAgICAgICBjb25zdCBpbWFnZSA9IGF3YWl0IHdpbi53ZWJDb250ZW50cy5jYXB0dXJlUGFnZSgpO1xuICAgICAgICBjb25zdCBwbmc6IEJ1ZmZlciA9IGltYWdlLnRvUE5HKCk7XG4gICAgICAgIGZzLndyaXRlRmlsZVN5bmMoZmlsZVBhdGgsIHBuZyk7XG4gICAgICAgIGNvbnN0IGRhdGE6IGFueSA9IHtcbiAgICAgICAgICAgIGZpbGVQYXRoLFxuICAgICAgICAgICAgc2l6ZTogcG5nLmxlbmd0aCxcbiAgICAgICAgICAgIHdpbmRvd1RpdGxlOiB0eXBlb2Ygd2luLmdldFRpdGxlID09PSAnZnVuY3Rpb24nID8gd2luLmdldFRpdGxlKCkgOiAnJyxcbiAgICAgICAgfTtcbiAgICAgICAgaWYgKGluY2x1ZGVCYXNlNjQpIHtcbiAgICAgICAgICAgIGRhdGEuZGF0YVVyaSA9IGBkYXRhOmltYWdlL3BuZztiYXNlNjQsJHtwbmcudG9TdHJpbmcoJ2Jhc2U2NCcpfWA7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG9rKGRhdGEsIGBTY3JlZW5zaG90IHNhdmVkIHRvICR7ZmlsZVBhdGh9YCk7XG4gICAgfVxuXG4gICAgLy8gdjIuNy4wICM0OiBQcmV2aWV3LXdpbmRvdyBzY3JlZW5zaG90LlxuICAgIC8vIHYyLjguMyBULVYyODMtMTogZXh0ZW5kZWQgdG8gaGFuZGxlIGNvY29zIGVtYmVkZGVkIHByZXZpZXcgbW9kZS5cbiAgICAvL1xuICAgIC8vIE1vZGUgZGlzcGF0Y2g6XG4gICAgLy8gICAtIFwid2luZG93XCI6ICAgcmVxdWlyZSBhIFByZXZpZXctdGl0bGVkIEJyb3dzZXJXaW5kb3c7IGZhaWwgaWYgbm9uZS5cbiAgICAvLyAgICAgICAgICAgICAgICAgT3JpZ2luYWwgdjIuNy4wIGJlaGF2aW91ci4gVXNlIHdoZW4gY29jb3MgcHJldmlld1xuICAgIC8vICAgICAgICAgICAgICAgICBjb25maWcgaXMgXCJ3aW5kb3dcIiAvIFwic2ltdWxhdG9yXCIgKHNlcGFyYXRlIHdpbmRvdykuXG4gICAgLy8gICAtIFwiZW1iZWRkZWRcIjogc2tpcCB0aGUgd2luZG93IHByb2JlIGFuZCBjYXB0dXJlIHRoZSBtYWluIGVkaXRvclxuICAgIC8vICAgICAgICAgICAgICAgICBCcm93c2VyV2luZG93IGRpcmVjdGx5LiBVc2Ugd2hlbiBjb2NvcyBwcmV2aWV3IGNvbmZpZ1xuICAgIC8vICAgICAgICAgICAgICAgICBpcyBcImVtYmVkZGVkXCIgKGdhbWV2aWV3IHJlbmRlcnMgaW5zaWRlIG1haW4gZWRpdG9yKS5cbiAgICAvLyAgIC0gXCJhdXRvXCI6ICAgICB0cnkgXCJ3aW5kb3dcIiBmaXJzdDsgaWYgbm8gUHJldmlldy10aXRsZWQgd2luZG93IGlzXG4gICAgLy8gICAgICAgICAgICAgICAgIGZvdW5kLCBmYWxsIGJhY2sgdG8gXCJlbWJlZGRlZFwiIGFuZCBzdXJmYWNlIGEgaGludFxuICAgIC8vICAgICAgICAgICAgICAgICBpbiB0aGUgcmVzcG9uc2UgbWVzc2FnZS4gRGVmYXVsdCDigJQga2VlcHMgdGhlIGhhcHB5XG4gICAgLy8gICAgICAgICAgICAgICAgIHBhdGggd29ya2luZyB3aXRob3V0IGNhbGxlciBrbm93bGVkZ2Ugb2YgY29jb3NcbiAgICAvLyAgICAgICAgICAgICAgICAgcHJldmlldyBjb25maWcuXG4gICAgLy9cbiAgICAvLyBCcm93c2VyLW1vZGUgKFBJRSByZW5kZXJlZCB0byB1c2VyJ3MgZXh0ZXJuYWwgYnJvd3NlciB2aWFcbiAgICAvLyBzaGVsbC5vcGVuRXh0ZXJuYWwpIGlzIE5PVCBjYXB0dXJhYmxlIGhlcmUg4oCUIHRoZSBwYWdlIGxpdmVzIGluXG4gICAgLy8gYSBub24tRWxlY3Ryb24gYnJvd3NlciBwcm9jZXNzLiBBSSBjYW4gZGV0ZWN0IHRoaXMgdmlhXG4gICAgLy8gZGVidWdfZ2V0X3ByZXZpZXdfbW9kZSBhbmQgc2tpcCB0aGUgY2FsbC5cbiAgICBwcml2YXRlIGFzeW5jIGNhcHR1cmVQcmV2aWV3U2NyZWVuc2hvdEltcGwoXG4gICAgICAgIHNhdmVQYXRoPzogc3RyaW5nLFxuICAgICAgICBtb2RlOiAnYXV0bycgfCAnd2luZG93JyB8ICdlbWJlZGRlZCcgPSAnYXV0bycsXG4gICAgICAgIHdpbmRvd1RpdGxlOiBzdHJpbmcgPSAnUHJldmlldycsXG4gICAgICAgIGluY2x1ZGVCYXNlNjQ6IGJvb2xlYW4gPSBmYWxzZSxcbiAgICApOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLXZhci1yZXF1aXJlc1xuICAgICAgICBjb25zdCBlbGVjdHJvbiA9IHJlcXVpcmUoJ2VsZWN0cm9uJyk7XG4gICAgICAgIGNvbnN0IEJXID0gZWxlY3Ryb24uQnJvd3NlcldpbmRvdztcblxuICAgICAgICAgICAgLy8gUmVzb2x2ZSB0aGUgdGFyZ2V0IHdpbmRvdyBwZXIgbW9kZS5cbiAgICAgICAgY29uc3QgcHJvYmVXaW5kb3dNb2RlID0gKCk6IHsgb2s6IHRydWU7IHdpbjogYW55IH0gfCB7IG9rOiBmYWxzZTsgZXJyb3I6IHN0cmluZzsgdmlzaWJsZVRpdGxlczogc3RyaW5nW10gfSA9PiB7XG4gICAgICAgICAgICAvLyB2Mi43LjEgcmV2aWV3IGZpeCAoY2xhdWRlIPCfn6EgKyBjb2RleCDwn5+hKTogd2l0aCB0aGUgZGVmYXVsdFxuICAgICAgICAgICAgLy8gd2luZG93VGl0bGU9J1ByZXZpZXcnIGEgQ2hpbmVzZSAvIGxvY2FsaXplZCBjb2NvcyBlZGl0b3JcbiAgICAgICAgICAgIC8vIHdob3NlIG1haW4gd2luZG93IHRpdGxlIGNvbnRhaW5zIFwiUHJldmlld1wiIChlLmcuIFwiQ29jb3NcbiAgICAgICAgICAgIC8vIENyZWF0b3IgUHJldmlldyAtIDxQcm9qZWN0TmFtZT5cIikgd291bGQgZmFsc2VseSBtYXRjaC5cbiAgICAgICAgICAgIC8vIERpc2FtYmlndWF0ZSBieSBleGNsdWRpbmcgYW55IHRpdGxlIHRoYXQgQUxTTyBjb250YWluc1xuICAgICAgICAgICAgLy8gXCJDb2NvcyBDcmVhdG9yXCIgd2hlbiB0aGUgY2FsbGVyIHN0dWNrIHdpdGggdGhlIGRlZmF1bHQuXG4gICAgICAgICAgICBjb25zdCB1c2luZ0RlZmF1bHQgPSB3aW5kb3dUaXRsZSA9PT0gJ1ByZXZpZXcnO1xuICAgICAgICAgICAgY29uc3QgYWxsVGl0bGVzOiBzdHJpbmdbXSA9IEJXPy5nZXRBbGxXaW5kb3dzPy4oKT8ubWFwKCh3OiBhbnkpID0+IHcuZ2V0VGl0bGU/LigpID8/ICcnKS5maWx0ZXIoQm9vbGVhbikgPz8gW107XG4gICAgICAgICAgICBjb25zdCBtYXRjaGVzID0gQlc/LmdldEFsbFdpbmRvd3M/LigpPy5maWx0ZXIoKHc6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmICghdyB8fCB3LmlzRGVzdHJveWVkKCkpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICBjb25zdCB0aXRsZSA9IHcuZ2V0VGl0bGU/LigpIHx8ICcnO1xuICAgICAgICAgICAgICAgIGlmICghdGl0bGUuaW5jbHVkZXMod2luZG93VGl0bGUpKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgaWYgKHVzaW5nRGVmYXVsdCAmJiAvQ29jb3NcXHMqQ3JlYXRvci9pLnRlc3QodGl0bGUpKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9KSA/PyBbXTtcbiAgICAgICAgICAgIGlmIChtYXRjaGVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGBObyBFbGVjdHJvbiB3aW5kb3cgdGl0bGUgY29udGFpbnMgXCIke3dpbmRvd1RpdGxlfVwiJHt1c2luZ0RlZmF1bHQgPyAnIChhbmQgaXMgbm90IHRoZSBtYWluIGVkaXRvciknIDogJyd9LmAsIHZpc2libGVUaXRsZXM6IGFsbFRpdGxlcyB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUsIHdpbjogbWF0Y2hlc1swXSB9O1xuICAgICAgICB9O1xuXG4gICAgICAgIGNvbnN0IHByb2JlRW1iZWRkZWRNb2RlID0gKCk6IHsgb2s6IHRydWU7IHdpbjogYW55IH0gfCB7IG9rOiBmYWxzZTsgZXJyb3I6IHN0cmluZyB9ID0+IHtcbiAgICAgICAgICAgIC8vIEVtYmVkZGVkIFBJRSByZW5kZXJzIGluc2lkZSB0aGUgbWFpbiBlZGl0b3IgQnJvd3NlcldpbmRvdy5cbiAgICAgICAgICAgIC8vIFBpY2sgdGhlIHNhbWUgaGV1cmlzdGljIGFzIHBpY2tXaW5kb3coKTogcHJlZmVyIGEgbm9uLVxuICAgICAgICAgICAgLy8gUHJldmlldyB3aW5kb3cuIENvY29zIG1haW4gZWRpdG9yJ3MgdGl0bGUgdHlwaWNhbGx5XG4gICAgICAgICAgICAvLyBjb250YWlucyBcIkNvY29zIENyZWF0b3JcIiDigJQgbWF0Y2ggdGhhdCB0byBpZGVudGlmeSBpdC5cbiAgICAgICAgICAgIGNvbnN0IGFsbDogYW55W10gPSBCVz8uZ2V0QWxsV2luZG93cz8uKCk/LmZpbHRlcigodzogYW55KSA9PiB3ICYmICF3LmlzRGVzdHJveWVkKCkpID8/IFtdO1xuICAgICAgICAgICAgaWYgKGFsbC5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiAnTm8gbGl2ZSBFbGVjdHJvbiB3aW5kb3dzIGF2YWlsYWJsZTsgY2Fubm90IGNhcHR1cmUgZW1iZWRkZWQgcHJldmlldy4nIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBQcmVmZXIgdGhlIGVkaXRvciBtYWluIHdpbmRvdyAodGl0bGUgY29udGFpbnMgXCJDb2Nvc1xuICAgICAgICAgICAgLy8gQ3JlYXRvclwiKSDigJQgdGhhdCdzIHdoZXJlIGVtYmVkZGVkIFBJRSByZW5kZXJzLlxuICAgICAgICAgICAgY29uc3QgZWRpdG9yID0gYWxsLmZpbmQoKHc6IGFueSkgPT4gL0NvY29zXFxzKkNyZWF0b3IvaS50ZXN0KHcuZ2V0VGl0bGU/LigpIHx8ICcnKSk7XG4gICAgICAgICAgICBpZiAoZWRpdG9yKSByZXR1cm4geyBvazogdHJ1ZSwgd2luOiBlZGl0b3IgfTtcbiAgICAgICAgICAgIC8vIEZhbGxiYWNrOiBhbnkgbm9uLURldlRvb2xzIC8gbm9uLVdvcmtlciAvIG5vbi1CbGFuayB3aW5kb3cuXG4gICAgICAgICAgICBjb25zdCBjYW5kaWRhdGUgPSBhbGwuZmluZCgodzogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgdCA9IHcuZ2V0VGl0bGU/LigpIHx8ICcnO1xuICAgICAgICAgICAgICAgIHJldHVybiB0ICYmICEvRGV2VG9vbHN8V29ya2VyIC18XkJsYW5rJC8udGVzdCh0KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgaWYgKGNhbmRpZGF0ZSkgcmV0dXJuIHsgb2s6IHRydWUsIHdpbjogY2FuZGlkYXRlIH07XG4gICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiAnTm8gc3VpdGFibGUgZWRpdG9yIHdpbmRvdyBmb3VuZCBmb3IgZW1iZWRkZWQgcHJldmlldyBjYXB0dXJlLicgfTtcbiAgICAgICAgfTtcblxuICAgICAgICBsZXQgd2luOiBhbnkgPSBudWxsO1xuICAgICAgICBsZXQgY2FwdHVyZU5vdGU6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICAgICAgICBsZXQgcmVzb2x2ZWRNb2RlOiAnd2luZG93JyB8ICdlbWJlZGRlZCcgPSAnd2luZG93JztcblxuICAgICAgICBpZiAobW9kZSA9PT0gJ3dpbmRvdycpIHtcbiAgICAgICAgICAgIGNvbnN0IHIgPSBwcm9iZVdpbmRvd01vZGUoKTtcbiAgICAgICAgICAgIGlmICghci5vaykge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKGAke3IuZXJyb3J9IExhdW5jaCBjb2NvcyBwcmV2aWV3IGZpcnN0IHZpYSB0aGUgdG9vbGJhciBwbGF5IGJ1dHRvbiBvciB2aWEgZGVidWdfcHJldmlld191cmwoYWN0aW9uPVwib3BlblwiKS4gSWYgeW91ciBjb2NvcyBwcmV2aWV3IGlzIHNldCB0byBcImVtYmVkZGVkXCIsIGNhbGwgdGhpcyB0b29sIHdpdGggbW9kZT1cImVtYmVkZGVkXCIgb3IgbW9kZT1cImF1dG9cIi4gVmlzaWJsZSB3aW5kb3cgdGl0bGVzOiAke3IudmlzaWJsZVRpdGxlcy5qb2luKCcsICcpIHx8ICcobm9uZSknfWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgd2luID0gci53aW47XG4gICAgICAgICAgICByZXNvbHZlZE1vZGUgPSAnd2luZG93JztcbiAgICAgICAgfSBlbHNlIGlmIChtb2RlID09PSAnZW1iZWRkZWQnKSB7XG4gICAgICAgICAgICBjb25zdCByID0gcHJvYmVFbWJlZGRlZE1vZGUoKTtcbiAgICAgICAgICAgIGlmICghci5vaykgcmV0dXJuIGZhaWwoci5lcnJvcik7XG4gICAgICAgICAgICB3aW4gPSByLndpbjtcbiAgICAgICAgICAgIHJlc29sdmVkTW9kZSA9ICdlbWJlZGRlZCc7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBhdXRvXG4gICAgICAgICAgICBjb25zdCB3ciA9IHByb2JlV2luZG93TW9kZSgpO1xuICAgICAgICAgICAgaWYgKHdyLm9rKSB7XG4gICAgICAgICAgICAgICAgd2luID0gd3Iud2luO1xuICAgICAgICAgICAgICAgIHJlc29sdmVkTW9kZSA9ICd3aW5kb3cnO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zdCBlciA9IHByb2JlRW1iZWRkZWRNb2RlKCk7XG4gICAgICAgICAgICAgICAgaWYgKCFlci5vaykge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFpbChgJHt3ci5lcnJvcn0gJHtlci5lcnJvcn0gTGF1bmNoIGNvY29zIHByZXZpZXcgZmlyc3Qgb3IgY2hlY2sgZGVidWdfZ2V0X3ByZXZpZXdfbW9kZSB0byBzZWUgaG93IGNvY29zIGlzIGNvbmZpZ3VyZWQuIFZpc2libGUgd2luZG93IHRpdGxlczogJHt3ci52aXNpYmxlVGl0bGVzLmpvaW4oJywgJykgfHwgJyhub25lKSd9YCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHdpbiA9IGVyLndpbjtcbiAgICAgICAgICAgICAgICByZXNvbHZlZE1vZGUgPSAnZW1iZWRkZWQnO1xuICAgICAgICAgICAgICAgICAgICAvLyB2Mi44LjQgcmV0ZXN0IGZpbmRpbmc6IHdoZW4gY29jb3MgcHJldmlldyBpcyBzZXRcbiAgICAgICAgICAgICAgICAgICAgLy8gdG8gXCJicm93c2VyXCIsIGF1dG8tZmFsbGJhY2sgQUxTTyBncmFicyB0aGUgbWFpblxuICAgICAgICAgICAgICAgICAgICAvLyBlZGl0b3Igd2luZG93IChiZWNhdXNlIG5vIFByZXZpZXctdGl0bGVkIHdpbmRvd1xuICAgICAgICAgICAgICAgICAgICAvLyBleGlzdHMpIOKAlCBidXQgaW4gYnJvd3NlciBtb2RlIHRoZSBhY3R1YWwgZ2FtZXZpZXdcbiAgICAgICAgICAgICAgICAgICAgLy8gbGl2ZXMgaW4gdGhlIHVzZXIncyBleHRlcm5hbCBicm93c2VyLCBOT1QgaW4gdGhlXG4gICAgICAgICAgICAgICAgICAgIC8vIGNhcHR1cmVkIEVsZWN0cm9uIHdpbmRvdy4gRG9uJ3QgY2xhaW0gXCJlbWJlZGRlZFxuICAgICAgICAgICAgICAgICAgICAvLyBwcmV2aWV3IG1vZGVcIiDigJQgdGhhdCdzIGEgZ3Vlc3MsIGFuZCB3cm9uZyB3aGVuXG4gICAgICAgICAgICAgICAgICAgIC8vIHVzZXIgaXMgb24gYnJvd3NlciBjb25maWcuIFByb2JlIHRoZSByZWFsIGNvbmZpZ1xuICAgICAgICAgICAgICAgICAgICAvLyBhbmQgdGFpbG9yIHRoZSBoaW50IHBlciBtb2RlLlxuICAgICAgICAgICAgICAgIGxldCBhY3R1YWxNb2RlOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjZmc6IGFueSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoXG4gICAgICAgICAgICAgICAgICAgICAgICAncHJlZmVyZW5jZXMnLCAncXVlcnktY29uZmlnJyBhcyBhbnksICdwcmV2aWV3JyBhcyBhbnksXG4gICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHBsYXRmb3JtID0gY2ZnPy5wcmV2aWV3Py5jdXJyZW50Py5wbGF0Zm9ybTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBwbGF0Zm9ybSA9PT0gJ3N0cmluZycpIGFjdHVhbE1vZGUgPSBwbGF0Zm9ybTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gYmVzdC1lZmZvcnQ7IGZhbGwgdGhyb3VnaCB3aXRoIG5ldXRyYWwgaGludFxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoYWN0dWFsTW9kZSA9PT0gJ2Jyb3dzZXInKSB7XG4gICAgICAgICAgICAgICAgICAgIGNhcHR1cmVOb3RlID0gJ05vIFByZXZpZXctdGl0bGVkIHdpbmRvdyBmb3VuZDsgY2FwdHVyZWQgdGhlIG1haW4gZWRpdG9yIHdpbmRvdy4gTk9URTogY29jb3MgcHJldmlldyBpcyBzZXQgdG8gXCJicm93c2VyXCIg4oCUIHRoZSBhY3R1YWwgcHJldmlldyBjb250ZW50IGlzIHJlbmRlcmVkIGluIHlvdXIgZXh0ZXJuYWwgYnJvd3NlciAoTk9UIGluIHRoaXMgaW1hZ2UpLiBGb3IgcnVudGltZSBjYW52YXMgY2FwdHVyZSBpbiBicm93c2VyIG1vZGUgdXNlIGRlYnVnX2dhbWVfY29tbWFuZCh0eXBlPVwic2NyZWVuc2hvdFwiKSB2aWEgYSBHYW1lRGVidWdDbGllbnQgcnVubmluZyBvbiB0aGUgYnJvd3NlciBwcmV2aWV3IHBhZ2UuJztcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGFjdHVhbE1vZGUgPT09ICdnYW1lVmlldycpIHtcbiAgICAgICAgICAgICAgICAgICAgY2FwdHVyZU5vdGUgPSAnTm8gUHJldmlldy10aXRsZWQgd2luZG93IGZvdW5kOyBjYXB0dXJlZCB0aGUgbWFpbiBlZGl0b3Igd2luZG93IChjb2NvcyBwcmV2aWV3IGlzIHNldCB0byBcImdhbWVWaWV3XCIgZW1iZWRkZWQg4oCUIHRoZSBlZGl0b3IgZ2FtZXZpZXcgSVMgd2hlcmUgcHJldmlldyByZW5kZXJzLCBzbyB0aGlzIGltYWdlIGlzIGNvcnJlY3QpLic7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChhY3R1YWxNb2RlKSB7XG4gICAgICAgICAgICAgICAgICAgIGNhcHR1cmVOb3RlID0gYE5vIFByZXZpZXctdGl0bGVkIHdpbmRvdyBmb3VuZDsgY2FwdHVyZWQgdGhlIG1haW4gZWRpdG9yIHdpbmRvdy4gY29jb3MgcHJldmlldyBpcyBzZXQgdG8gXCIke2FjdHVhbE1vZGV9XCIg4oCUIHZlcmlmeSB0aGlzIGltYWdlIGFjdHVhbGx5IGNvbnRhaW5zIHRoZSBnYW1ldmlldyB5b3Ugd2FudGVkOyBmb3IgcnVudGltZSBjYW52YXMgY2FwdHVyZSBwcmVmZXIgZGVidWdfZ2FtZV9jb21tYW5kIHZpYSBHYW1lRGVidWdDbGllbnQuYDtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBjYXB0dXJlTm90ZSA9ICdObyBQcmV2aWV3LXRpdGxlZCB3aW5kb3cgZm91bmQ7IGNhcHR1cmVkIHRoZSBtYWluIGVkaXRvciB3aW5kb3cuIENvdWxkIG5vdCBkZXRlcm1pbmUgY29jb3MgcHJldmlldyBtb2RlIChkZWJ1Z19nZXRfcHJldmlld19tb2RlIG1pZ2h0IGdpdmUgbW9yZSBpbmZvKS4gSWYgeW91ciBjb2NvcyBwcmV2aWV3IGlzIHNldCB0byBcImJyb3dzZXJcIiwgdGhlIGFjdHVhbCBwcmV2aWV3IGNvbnRlbnQgaXMgaW4geW91ciBleHRlcm5hbCBicm93c2VyIGFuZCBpcyBOT1QgaW4gdGhpcyBpbWFnZS4nO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGxldCBmaWxlUGF0aCA9IHNhdmVQYXRoO1xuICAgICAgICBpZiAoIWZpbGVQYXRoKSB7XG4gICAgICAgICAgICBjb25zdCByZXNvbHZlZCA9IHRoaXMucmVzb2x2ZUF1dG9DYXB0dXJlRmlsZShgcHJldmlldy0ke0RhdGUubm93KCl9LnBuZ2ApO1xuICAgICAgICAgICAgaWYgKCFyZXNvbHZlZC5vaykgcmV0dXJuIGZhaWwocmVzb2x2ZWQuZXJyb3IpO1xuICAgICAgICAgICAgZmlsZVBhdGggPSByZXNvbHZlZC5maWxlUGF0aDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIHYyLjguMSByb3VuZC0xIGZpeCAoR2VtaW5pIPCflLQgKyBDb2RleCDwn5+hKTogZXhwbGljaXQgc2F2ZVBhdGhcbiAgICAgICAgICAgIC8vIGFsc28gZ2V0cyBjb250YWlubWVudC1jaGVja2VkLlxuICAgICAgICAgICAgLy8gdjIuOC4yIHJldGVzdCBmaXg6IHVzZSByZXNvbHZlZFBhdGggZm9yIHJlbGF0aXZlLXBhdGggc3VwcG9ydC5cbiAgICAgICAgICAgIGNvbnN0IGd1YXJkID0gdGhpcy5hc3NlcnRTYXZlUGF0aFdpdGhpblByb2plY3QoZmlsZVBhdGgpO1xuICAgICAgICAgICAgaWYgKCFndWFyZC5vaykgcmV0dXJuIGZhaWwoZ3VhcmQuZXJyb3IpO1xuICAgICAgICAgICAgZmlsZVBhdGggPSBndWFyZC5yZXNvbHZlZFBhdGg7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgaW1hZ2UgPSBhd2FpdCB3aW4ud2ViQ29udGVudHMuY2FwdHVyZVBhZ2UoKTtcbiAgICAgICAgY29uc3QgcG5nOiBCdWZmZXIgPSBpbWFnZS50b1BORygpO1xuICAgICAgICBmcy53cml0ZUZpbGVTeW5jKGZpbGVQYXRoLCBwbmcpO1xuICAgICAgICBjb25zdCBkYXRhOiBhbnkgPSB7XG4gICAgICAgICAgICBmaWxlUGF0aCxcbiAgICAgICAgICAgIHNpemU6IHBuZy5sZW5ndGgsXG4gICAgICAgICAgICB3aW5kb3dUaXRsZTogdHlwZW9mIHdpbi5nZXRUaXRsZSA9PT0gJ2Z1bmN0aW9uJyA/IHdpbi5nZXRUaXRsZSgpIDogJycsXG4gICAgICAgICAgICBtb2RlOiByZXNvbHZlZE1vZGUsXG4gICAgICAgIH07XG4gICAgICAgIGlmIChjYXB0dXJlTm90ZSkgZGF0YS5ub3RlID0gY2FwdHVyZU5vdGU7XG4gICAgICAgIGlmIChpbmNsdWRlQmFzZTY0KSB7XG4gICAgICAgICAgICBkYXRhLmRhdGFVcmkgPSBgZGF0YTppbWFnZS9wbmc7YmFzZTY0LCR7cG5nLnRvU3RyaW5nKCdiYXNlNjQnKX1gO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IG1lc3NhZ2UgPSBjYXB0dXJlTm90ZVxuICAgICAgICAgICAgPyBgUHJldmlldyBzY3JlZW5zaG90IHNhdmVkIHRvICR7ZmlsZVBhdGh9ICgke2NhcHR1cmVOb3RlfSlgXG4gICAgICAgICAgICA6IGBQcmV2aWV3IHNjcmVlbnNob3Qgc2F2ZWQgdG8gJHtmaWxlUGF0aH0gKG1vZGU9JHtyZXNvbHZlZE1vZGV9KWA7XG4gICAgICAgIHJldHVybiBvayhkYXRhLCBtZXNzYWdlKTtcbiAgICB9XG5cbiAgICAvLyB2Mi44LjMgVC1WMjgzLTI6IHJlYWQgY29jb3MgcHJldmlldyBjb25maWcgc28gQUkgY2FuIHJvdXRlXG4gICAgLy8gY2FwdHVyZV9wcmV2aWV3X3NjcmVlbnNob3QgdG8gdGhlIGNvcnJlY3QgbW9kZSB3aXRob3V0IGd1ZXNzaW5nLlxuICAgIC8vIFJlYWRzIHZpYSBFZGl0b3IuTWVzc2FnZSBwcmVmZXJlbmNlcy9xdWVyeS1jb25maWcgKHR5cGVkIGluXG4gICAgLy8gbm9kZV9tb2R1bGVzL0Bjb2Nvcy9jcmVhdG9yLXR5cGVzLy4uLi9wcmVmZXJlbmNlcy9AdHlwZXMvbWVzc2FnZS5kLnRzKS5cbiAgICAvL1xuICAgIC8vIFdlIGR1bXAgdGhlIGZ1bGwgJ3ByZXZpZXcnIGNhdGVnb3J5LCB0aGVuIHRyeSB0byBpbnRlcnByZXQgYSBmZXdcbiAgICAvLyBjb21tb24ga2V5cyAoJ29wZW5fcHJldmlld193aXRoJywgJ3ByZXZpZXdfd2l0aCcsICdzaW11bGF0b3InLFxuICAgIC8vICdicm93c2VyJykgaW50byBhIG5vcm1hbGl6ZWQgbW9kZSBsYWJlbC4gSWYgaW50ZXJwcmV0YXRpb24gZmFpbHMsXG4gICAgLy8gd2Ugc3RpbGwgcmV0dXJuIHRoZSByYXcgY29uZmlnIHNvIHRoZSBBSSBjYW4gcmVhZCBpdCBkaXJlY3RseS5cbiAgICBwcml2YXRlIGFzeW5jIGdldFByZXZpZXdNb2RlSW1wbCgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gUHJvYmUgYXQgbW9kdWxlIGxldmVsIChubyBrZXkpIHRvIGdldCB0aGUgd2hvbGUgY2F0ZWdvcnkuXG4gICAgICAgICAgICBjb25zdCByYXc6IGFueSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3ByZWZlcmVuY2VzJywgJ3F1ZXJ5LWNvbmZpZycgYXMgYW55LCAncHJldmlldycgYXMgYW55KSBhcyBhbnk7XG4gICAgICAgICAgICBpZiAocmF3ID09PSB1bmRlZmluZWQgfHwgcmF3ID09PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ3ByZWZlcmVuY2VzL3F1ZXJ5LWNvbmZpZyByZXR1cm5lZCBudWxsIGZvciBcInByZXZpZXdcIiDigJQgY29jb3MgbWF5IG5vdCBleHBvc2UgdGhpcyBjYXRlZ29yeSwgb3IgeW91ciBidWlsZCBkaWZmZXJzIGZyb20gMy44LnguJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBIZXVyaXN0aWMgaW50ZXJwcmV0YXRpb24uXG4gICAgICAgICAgICAvLyB2Mi44LjMgcmV0ZXN0IGZpbmRpbmc6IGNvY29zIDMuOC43IGFjdHVhbGx5IHN0b3JlcyB0aGVcbiAgICAgICAgICAgIC8vIGFjdGl2ZSBtb2RlIGF0IGBwcmV2aWV3LmN1cnJlbnQucGxhdGZvcm1gIHdpdGggdmFsdWVcbiAgICAgICAgICAgIC8vIGBcImdhbWVWaWV3XCJgIChlbWJlZGRlZCksIGBcImJyb3dzZXJcImAsIG9yIGRldmljZSBuYW1lc1xuICAgICAgICAgICAgLy8gKHNpbXVsYXRvcikuIFRoZSBvcmlnaW5hbCBoZXVyaXN0aWMgb25seSBjaGVja2VkIGtleXMgbGlrZVxuICAgICAgICAgICAgLy8gYG9wZW5fcHJldmlld193aXRoYCAvIGBwcmV2aWV3X3dpdGhgIC8gYG9wZW5fd2l0aGAgLyBgbW9kZWBcbiAgICAgICAgICAgIC8vIGFuZCBtaXNzZWQgdGhlIGxpdmUga2V5LiBQcm9iZSBgY3VycmVudC5wbGF0Zm9ybWAgZmlyc3Q7XG4gICAgICAgICAgICAvLyBrZWVwIHRoZSBsZWdhY3kga2V5cyBhcyBmYWxsYmFjayBmb3Igb2xkZXIgY29jb3MgdmVyc2lvbnMuXG4gICAgICAgICAgICBjb25zdCBsb3dlciA9IChzOiBhbnkpID0+ICh0eXBlb2YgcyA9PT0gJ3N0cmluZycgPyBzLnRvTG93ZXJDYXNlKCkgOiAnJyk7XG4gICAgICAgICAgICBsZXQgaW50ZXJwcmV0ZWQ6ICdicm93c2VyJyB8ICd3aW5kb3cnIHwgJ3NpbXVsYXRvcicgfCAnZW1iZWRkZWQnIHwgJ3Vua25vd24nID0gJ3Vua25vd24nO1xuICAgICAgICAgICAgbGV0IGludGVycHJldGVkRnJvbUtleTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgICAgICAgICBjb25zdCBjbGFzc2lmeSA9ICh2OiBzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBsdiA9IGxvd2VyKHYpO1xuICAgICAgICAgICAgICAgIGlmIChsdi5pbmNsdWRlcygnYnJvd3NlcicpKSByZXR1cm4gJ2Jyb3dzZXInO1xuICAgICAgICAgICAgICAgIGlmIChsdi5pbmNsdWRlcygnc2ltdWxhdG9yJykpIHJldHVybiAnc2ltdWxhdG9yJztcbiAgICAgICAgICAgICAgICBpZiAobHYuaW5jbHVkZXMoJ2VtYmVkJykgfHwgbHYuaW5jbHVkZXMoJ2dhbWV2aWV3JykgfHwgbHYuaW5jbHVkZXMoJ2dhbWVfdmlldycpKSByZXR1cm4gJ2VtYmVkZGVkJztcbiAgICAgICAgICAgICAgICBpZiAobHYuaW5jbHVkZXMoJ3dpbmRvdycpKSByZXR1cm4gJ3dpbmRvdyc7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgY29uc3QgZGlnID0gKG9iajogYW55LCBwYXRoOiBzdHJpbmcpOiBhbnkgPT4ge1xuICAgICAgICAgICAgICAgIGlmICghb2JqIHx8IHR5cGVvZiBvYmogIT09ICdvYmplY3QnKSByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIGNvbnN0IHBhcnRzID0gcGF0aC5zcGxpdCgnLicpO1xuICAgICAgICAgICAgICAgIGxldCBjdXI6IGFueSA9IG9iajtcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IHAgb2YgcGFydHMpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFjdXIgfHwgdHlwZW9mIGN1ciAhPT0gJ29iamVjdCcpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgICAgIGlmIChwIGluIGN1cikge1xuICAgICAgICAgICAgICAgICAgICAgICAgY3VyID0gY3VyW3BdO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgLy8gVHJ5IG9uZSBsZXZlbCBvZiBuZXN0IChzb21ldGltZXMgdGhlIGNhdGVnb3J5IGR1bXBcbiAgICAgICAgICAgICAgICAgICAgLy8gbmVzdHMgdW5kZXIgYSBkZWZhdWx0LXByb3RvY29sIGJ1Y2tldCkuXG4gICAgICAgICAgICAgICAgICAgIGxldCBmb3VuZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IHYgb2YgT2JqZWN0LnZhbHVlcyhjdXIpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodiAmJiB0eXBlb2YgdiA9PT0gJ29iamVjdCcgJiYgcCBpbiAodiBhcyBhbnkpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY3VyID0gKHYgYXMgYW55KVtwXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb3VuZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYgKCFmb3VuZCkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIGN1cjtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBjb25zdCBwcm9iZUtleXMgPSBbXG4gICAgICAgICAgICAgICAgJ3ByZXZpZXcuY3VycmVudC5wbGF0Zm9ybScsXG4gICAgICAgICAgICAgICAgJ2N1cnJlbnQucGxhdGZvcm0nLFxuICAgICAgICAgICAgICAgICdwcmV2aWV3Lm9wZW5fcHJldmlld193aXRoJyxcbiAgICAgICAgICAgICAgICAnb3Blbl9wcmV2aWV3X3dpdGgnLFxuICAgICAgICAgICAgICAgICdwcmV2aWV3X3dpdGgnLFxuICAgICAgICAgICAgICAgICdvcGVuX3dpdGgnLFxuICAgICAgICAgICAgICAgICdtb2RlJyxcbiAgICAgICAgICAgIF07XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGsgb2YgcHJvYmVLZXlzKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdiA9IGRpZyhyYXcsIGspO1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgdiA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY2xzID0gY2xhc3NpZnkodik7XG4gICAgICAgICAgICAgICAgICAgIGlmIChjbHMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGludGVycHJldGVkID0gY2xzO1xuICAgICAgICAgICAgICAgICAgICAgICAgaW50ZXJwcmV0ZWRGcm9tS2V5ID0gYCR7a309JHt2fWA7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAvLyBOb24tZW1wdHkgc3RyaW5nIHRoYXQgZGlkbid0IG1hdGNoIGEga25vd24gbGFiZWwg4oaSXG4gICAgICAgICAgICAgICAgICAgIC8vIHJlY29yZCBhcyAnc2ltdWxhdG9yJyBjYW5kaWRhdGUgaWYgaXQgbG9va3MgbGlrZSBhXG4gICAgICAgICAgICAgICAgICAgIC8vIGRldmljZSBuYW1lIChlLmcuIFwiQXBwbGUgaVBob25lIDE0IFByb1wiKSwgb3RoZXJ3aXNlXG4gICAgICAgICAgICAgICAgICAgIC8vIGtlZXAgc2VhcmNoaW5nLlxuICAgICAgICAgICAgICAgICAgICBpZiAoL2lQaG9uZXxpUGFkfEhVQVdFSXxYaWFvbWl8U29ueXxBc3VzfE9QUE98SG9ub3J8Tm9raWF8TGVub3ZvfFNhbXN1bmd8R29vZ2xlfFBpeGVsL2kudGVzdCh2KSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaW50ZXJwcmV0ZWQgPSAnc2ltdWxhdG9yJztcbiAgICAgICAgICAgICAgICAgICAgICAgIGludGVycHJldGVkRnJvbUtleSA9IGAke2t9PSR7dn1gO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gb2soeyBpbnRlcnByZXRlZCwgaW50ZXJwcmV0ZWRGcm9tS2V5LCByYXcgfSwgaW50ZXJwcmV0ZWQgPT09ICd1bmtub3duJ1xuICAgICAgICAgICAgICAgICAgICA/ICdSZWFkIGNvY29zIHByZXZpZXcgY29uZmlnIGJ1dCBjb3VsZCBub3QgaW50ZXJwcmV0IGEgbW9kZSBsYWJlbDsgaW5zcGVjdCBkYXRhLnJhdyBhbmQgcGFzcyBtb2RlPSBleHBsaWNpdGx5IHRvIGNhcHR1cmVfcHJldmlld19zY3JlZW5zaG90LidcbiAgICAgICAgICAgICAgICAgICAgOiBgY29jb3MgcHJldmlldyBpcyBjb25maWd1cmVkIGFzIFwiJHtpbnRlcnByZXRlZH1cIiAoZnJvbSBrZXkgXCIke2ludGVycHJldGVkRnJvbUtleX1cIikuIFBhc3MgbW9kZT1cIiR7aW50ZXJwcmV0ZWQgPT09ICdicm93c2VyJyA/ICd3aW5kb3cnIDogaW50ZXJwcmV0ZWR9XCIgdG8gY2FwdHVyZV9wcmV2aWV3X3NjcmVlbnNob3QsIG9yIHJlbHkgb24gbW9kZT1cImF1dG9cIi5gKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGBwcmVmZXJlbmNlcy9xdWVyeS1jb25maWcgJ3ByZXZpZXcnIGZhaWxlZDogJHtlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycil9YCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyB2Mi4xMCBULVYyMTAtMTogaGFyZC1mYWlsIGJ5IGRlZmF1bHQuIFBlciBjcm9zcy1yZXBvIHJlZnJlc2hcbiAgICAvLyAyMDI2LTA1LTAyLCBub25lIG9mIDYgc3VydmV5ZWQgY29jb3MtbWNwIHBlZXJzIHNoaXAgYSB3b3JraW5nXG4gICAgLy8gcHJldmlldy1tb2RlIHNldHRlciDigJQgdGhlIGNvY29zIDMuOC43IHByZXZpZXcgY2F0ZWdvcnkgaXNcbiAgICAvLyBlZmZlY3RpdmVseSByZWFkb25seSB0byB0aGlyZC1wYXJ0eSBleHRlbnNpb25zIChsYW5kbWluZSAjMTcpLlxuICAgIC8vIERlZmF1bHQgYmVoYXZpb3IgaXMgbm93IE5PVF9TVVBQT1JURUQgd2l0aCBhIFVJIHJlZGlyZWN0LlxuICAgIC8vXG4gICAgLy8gVGhlIDQtc3RyYXRlZ3kgcHJvYmUgaXMgcHJlc2VydmVkIGJlaGluZCBgYXR0ZW1wdEFueXdheT10cnVlYFxuICAgIC8vIHNvIGEgZnV0dXJlIGNvY29zIGJ1aWxkIGNhbiBiZSB2YWxpZGF0ZWQgcXVpY2tseTogcmVhZCB0aGVcbiAgICAvLyByZXR1cm5lZCBkYXRhLmF0dGVtcHRzIGxvZyB0byBzZWUgd2hldGhlciBhbnkgc2hhcGUgbm93IHdvcmtzLlxuICAgIC8vIFRoZSBzZXR0ZXIgZG9lcyBOT1QgZnJlZXplIHRoZSBlZGl0b3IgKHNldC1jb25maWcgc2lsZW50bHlcbiAgICAvLyBuby1vcHMsIGNmLiBwcmV2aWV3X2NvbnRyb2wgd2hpY2ggRE9FUyBmcmVlemUg4oCUIGxhbmRtaW5lICMxNikuXG4gICAgLy9cbiAgICAvLyBTdHJhdGVnaWVzIHRyaWVkIGluIG9yZGVyOlxuICAgIC8vICAgMS4gKCdwcmV2aWV3JywgJ2N1cnJlbnQnLCB7IHBsYXRmb3JtOiB2YWx1ZSB9KSAg4oCUIG5lc3RlZCBvYmplY3RcbiAgICAvLyAgIDIuICgncHJldmlldycsICdjdXJyZW50LnBsYXRmb3JtJywgdmFsdWUsICdnbG9iYWwnKSDigJQgZXhwbGljaXQgcHJvdG9jb2xcbiAgICAvLyAgIDMuICgncHJldmlldycsICdjdXJyZW50LnBsYXRmb3JtJywgdmFsdWUsICdsb2NhbCcpICDigJQgZXhwbGljaXQgcHJvdG9jb2xcbiAgICAvLyAgIDQuICgncHJldmlldycsICdjdXJyZW50LnBsYXRmb3JtJywgdmFsdWUpICAgICAgICAgIOKAlCBubyBwcm90b2NvbFxuICAgIHByaXZhdGUgYXN5bmMgc2V0UHJldmlld01vZGVJbXBsKG1vZGU6ICdicm93c2VyJyB8ICdnYW1lVmlldycgfCAnc2ltdWxhdG9yJywgYXR0ZW1wdEFueXdheTogYm9vbGVhbik6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBxdWVyeUN1cnJlbnQgPSBhc3luYyAoKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgY2ZnOiBhbnkgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdwcmVmZXJlbmNlcycsICdxdWVyeS1jb25maWcnIGFzIGFueSwgJ3ByZXZpZXcnIGFzIGFueSkgYXMgYW55O1xuICAgICAgICAgICAgICAgIHJldHVybiBjZmc/LnByZXZpZXc/LmN1cnJlbnQ/LnBsYXRmb3JtID8/IG51bGw7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgY29uc3QgcHJldmlvdXNNb2RlID0gYXdhaXQgcXVlcnlDdXJyZW50KCk7XG4gICAgICAgICAgICBpZiAoIWF0dGVtcHRBbnl3YXkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFpbChgZGVidWdfc2V0X3ByZXZpZXdfbW9kZSBpcyBOT1QgU1VQUE9SVEVEIG9uIGNvY29zIDMuOC43KyAobGFuZG1pbmUgIzE3KS4gUHJvZ3JhbW1hdGljIHByZXZpZXctbW9kZSBzd2l0Y2hpbmcgaGFzIG5vIHdvcmtpbmcgSVBDIHBhdGg6IHByZWZlcmVuY2VzL3NldC1jb25maWcgcmV0dXJucyB0cnV0aHkgYnV0IGRvZXMgbm90IHBlcnNpc3QsIGFuZCA2IHN1cnZleWVkIHJlZmVyZW5jZSBwcm9qZWN0cyAoaGFyYWR5IC8gU3BheWRvIC8gUm9tYVJvZ292IC8gY29jb3MtY29kZS1tb2RlIC8gRnVucGxheUFJIC8gY29jb3MtY2xpKSBhbGwgY29uZmlybSBubyB3b3JraW5nIGFsdGVybmF0aXZlIGV4aXN0cy4gKipTd2l0Y2ggdmlhIHRoZSBjb2NvcyBwcmV2aWV3IGRyb3Bkb3duIGluIHRoZSBlZGl0b3IgdG9vbGJhciBpbnN0ZWFkKiogKGN1cnJlbnQgbW9kZTogXCIke3ByZXZpb3VzTW9kZSA/PyAndW5rbm93bid9XCIsIHJlcXVlc3RlZDogXCIke21vZGV9XCIpLiBUbyByZS1wcm9iZSB3aGV0aGVyIGEgbmV3ZXIgY29jb3MgYnVpbGQgbm93IGV4cG9zZXMgYSB3cml0ZSBwYXRoLCByZS1jYWxsIHdpdGggYXR0ZW1wdEFueXdheT10cnVlIChkaWFnbm9zdGljIG9ubHkg4oCUIGRvZXMgTk9UIGZyZWV6ZSB0aGUgZWRpdG9yKS5gLCB7IHByZXZpb3VzTW9kZSwgcmVxdWVzdGVkTW9kZTogbW9kZSwgc3VwcG9ydGVkOiBmYWxzZSB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChwcmV2aW91c01vZGUgPT09IG1vZGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gb2soeyBwcmV2aW91c01vZGUsIG5ld01vZGU6IG1vZGUsIGNvbmZpcm1lZDogdHJ1ZSwgbm9PcDogdHJ1ZSB9LCBgY29jb3MgcHJldmlldyBhbHJlYWR5IHNldCB0byBcIiR7bW9kZX1cIjsgbm8gY2hhbmdlIGFwcGxpZWQuYCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0eXBlIFN0cmF0ZWd5ID0geyBpZDogc3RyaW5nOyBwYXlsb2FkOiAoKSA9PiBQcm9taXNlPGFueT4gfTtcbiAgICAgICAgICAgIGNvbnN0IHN0cmF0ZWdpZXM6IFN0cmF0ZWd5W10gPSBbXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBpZDogXCJzZXQtY29uZmlnKCdwcmV2aWV3JywnY3VycmVudCcse3BsYXRmb3JtOnZhbHVlfSlcIixcbiAgICAgICAgICAgICAgICAgICAgcGF5bG9hZDogKCkgPT4gRWRpdG9yLk1lc3NhZ2UucmVxdWVzdChcbiAgICAgICAgICAgICAgICAgICAgICAgICdwcmVmZXJlbmNlcycsICdzZXQtY29uZmlnJyBhcyBhbnksXG4gICAgICAgICAgICAgICAgICAgICAgICAncHJldmlldycgYXMgYW55LCAnY3VycmVudCcgYXMgYW55LFxuICAgICAgICAgICAgICAgICAgICAgICAgeyBwbGF0Zm9ybTogbW9kZSB9IGFzIGFueSxcbiAgICAgICAgICAgICAgICAgICAgKSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgaWQ6IFwic2V0LWNvbmZpZygncHJldmlldycsJ2N1cnJlbnQucGxhdGZvcm0nLHZhbHVlLCdnbG9iYWwnKVwiLFxuICAgICAgICAgICAgICAgICAgICBwYXlsb2FkOiAoKSA9PiBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KFxuICAgICAgICAgICAgICAgICAgICAgICAgJ3ByZWZlcmVuY2VzJywgJ3NldC1jb25maWcnIGFzIGFueSxcbiAgICAgICAgICAgICAgICAgICAgICAgICdwcmV2aWV3JyBhcyBhbnksICdjdXJyZW50LnBsYXRmb3JtJyBhcyBhbnksXG4gICAgICAgICAgICAgICAgICAgICAgICBtb2RlIGFzIGFueSwgJ2dsb2JhbCcgYXMgYW55LFxuICAgICAgICAgICAgICAgICAgICApLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBpZDogXCJzZXQtY29uZmlnKCdwcmV2aWV3JywnY3VycmVudC5wbGF0Zm9ybScsdmFsdWUsJ2xvY2FsJylcIixcbiAgICAgICAgICAgICAgICAgICAgcGF5bG9hZDogKCkgPT4gRWRpdG9yLk1lc3NhZ2UucmVxdWVzdChcbiAgICAgICAgICAgICAgICAgICAgICAgICdwcmVmZXJlbmNlcycsICdzZXQtY29uZmlnJyBhcyBhbnksXG4gICAgICAgICAgICAgICAgICAgICAgICAncHJldmlldycgYXMgYW55LCAnY3VycmVudC5wbGF0Zm9ybScgYXMgYW55LFxuICAgICAgICAgICAgICAgICAgICAgICAgbW9kZSBhcyBhbnksICdsb2NhbCcgYXMgYW55LFxuICAgICAgICAgICAgICAgICAgICApLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBpZDogXCJzZXQtY29uZmlnKCdwcmV2aWV3JywnY3VycmVudC5wbGF0Zm9ybScsdmFsdWUpXCIsXG4gICAgICAgICAgICAgICAgICAgIHBheWxvYWQ6ICgpID0+IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoXG4gICAgICAgICAgICAgICAgICAgICAgICAncHJlZmVyZW5jZXMnLCAnc2V0LWNvbmZpZycgYXMgYW55LFxuICAgICAgICAgICAgICAgICAgICAgICAgJ3ByZXZpZXcnIGFzIGFueSwgJ2N1cnJlbnQucGxhdGZvcm0nIGFzIGFueSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1vZGUgYXMgYW55LFxuICAgICAgICAgICAgICAgICAgICApLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBdO1xuICAgICAgICAgICAgY29uc3QgYXR0ZW1wdHM6IEFycmF5PHsgc3RyYXRlZ3k6IHN0cmluZzsgc2V0UmVzdWx0OiBhbnk7IG9ic2VydmVkTW9kZTogc3RyaW5nIHwgbnVsbDsgbWF0Y2hlZDogYm9vbGVhbjsgZXJyb3I/OiBzdHJpbmcgfT4gPSBbXTtcbiAgICAgICAgICAgIGxldCB3aW5uZXI6IHR5cGVvZiBhdHRlbXB0c1tudW1iZXJdIHwgbnVsbCA9IG51bGw7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHMgb2Ygc3RyYXRlZ2llcykge1xuICAgICAgICAgICAgICAgIGxldCBzZXRSZXN1bHQ6IGFueSA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICBsZXQgZXJyb3I6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBzZXRSZXN1bHQgPSBhd2FpdCBzLnBheWxvYWQoKTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgICAgICAgICBlcnJvciA9IGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29uc3Qgb2JzZXJ2ZWRNb2RlID0gYXdhaXQgcXVlcnlDdXJyZW50KCk7XG4gICAgICAgICAgICAgICAgY29uc3QgbWF0Y2hlZCA9IG9ic2VydmVkTW9kZSA9PT0gbW9kZTtcbiAgICAgICAgICAgICAgICBhdHRlbXB0cy5wdXNoKHsgc3RyYXRlZ3k6IHMuaWQsIHNldFJlc3VsdCwgb2JzZXJ2ZWRNb2RlLCBtYXRjaGVkLCBlcnJvciB9KTtcbiAgICAgICAgICAgICAgICBpZiAobWF0Y2hlZCkge1xuICAgICAgICAgICAgICAgICAgICB3aW5uZXIgPSBhdHRlbXB0c1thdHRlbXB0cy5sZW5ndGggLSAxXTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCF3aW5uZXIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFpbChgc2V0LWNvbmZpZyBzdHJhdGVnaWVzIGFsbCBmYWlsZWQgdG8gZmxpcCBwcmV2aWV3LmN1cnJlbnQucGxhdGZvcm0gZnJvbSBcIiR7cHJldmlvdXNNb2RlID8/ICd1bmtub3duJ31cIiB0byBcIiR7bW9kZX1cIi4gVHJpZWQgNCBzaGFwZXM7IGNvY29zIHJldHVybmVkIHZhbHVlcyBidXQgdGhlIHJlYWQtYmFjayBuZXZlciBtYXRjaGVkIHRoZSByZXF1ZXN0ZWQgbW9kZS4gVGhlIHNldC1jb25maWcgY2hhbm5lbCBtYXkgaGF2ZSBjaGFuZ2VkIGluIHRoaXMgY29jb3MgYnVpbGQ7IHN3aXRjaCB2aWEgdGhlIGNvY29zIHByZXZpZXcgZHJvcGRvd24gbWFudWFsbHkgZm9yIG5vdyBhbmQgcmVwb3J0IHdoaWNoIHNoYXBlIHdvcmtzLmAsIHsgcHJldmlvdXNNb2RlLCByZXF1ZXN0ZWRNb2RlOiBtb2RlLCBhdHRlbXB0cyB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBvayh7IHByZXZpb3VzTW9kZSwgbmV3TW9kZTogbW9kZSwgY29uZmlybWVkOiB0cnVlLCBzdHJhdGVneTogd2lubmVyLnN0cmF0ZWd5LCBhdHRlbXB0cyB9LCBgY29jb3MgcHJldmlldyBzd2l0Y2hlZDogXCIke3ByZXZpb3VzTW9kZSA/PyAndW5rbm93bid9XCIg4oaSIFwiJHttb2RlfVwiIHZpYSAke3dpbm5lci5zdHJhdGVneX0uIFJlc3RvcmUgdmlhIGRlYnVnX3NldF9wcmV2aWV3X21vZGUobW9kZT1cIiR7cHJldmlvdXNNb2RlID8/ICdicm93c2VyJ31cIiwgY29uZmlybT10cnVlKSB3aGVuIGRvbmUgaWYgbmVlZGVkLmApO1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoYHByZWZlcmVuY2VzL3NldC1jb25maWcgJ3ByZXZpZXcnIGZhaWxlZDogJHtlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycil9YCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGJhdGNoU2NyZWVuc2hvdEltcGwoc2F2ZVBhdGhQcmVmaXg/OiBzdHJpbmcsIGRlbGF5c01zOiBudW1iZXJbXSA9IFswXSwgd2luZG93VGl0bGU/OiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBsZXQgcHJlZml4ID0gc2F2ZVBhdGhQcmVmaXg7XG4gICAgICAgIGlmICghcHJlZml4KSB7XG4gICAgICAgICAgICAvLyBiYXNlbmFtZSBpcyB0aGUgcHJlZml4IHN0ZW07IHBlci1pdGVyYXRpb24gZmlsZXMgZXh0ZW5kIGl0XG4gICAgICAgICAgICAvLyB3aXRoIGAtJHtpfS5wbmdgLiBDb250YWlubWVudCBjaGVjayBvbiB0aGUgcHJlZml4IHBhdGggaXNcbiAgICAgICAgICAgIC8vIHN1ZmZpY2llbnQgYmVjYXVzZSBwYXRoLmpvaW4gcHJlc2VydmVzIGRpcm5hbWUgZm9yIGFueVxuICAgICAgICAgICAgLy8gc3VmZml4IHRoZSBsb29wIGFwcGVuZHMuXG4gICAgICAgICAgICBjb25zdCByZXNvbHZlZCA9IHRoaXMucmVzb2x2ZUF1dG9DYXB0dXJlRmlsZShgYmF0Y2gtJHtEYXRlLm5vdygpfWApO1xuICAgICAgICAgICAgaWYgKCFyZXNvbHZlZC5vaykgcmV0dXJuIGZhaWwocmVzb2x2ZWQuZXJyb3IpO1xuICAgICAgICAgICAgcHJlZml4ID0gcmVzb2x2ZWQuZmlsZVBhdGg7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyB2Mi44LjEgcm91bmQtMSBmaXggKEdlbWluaSDwn5S0ICsgQ29kZXgg8J+foSk6IGV4cGxpY2l0IHByZWZpeFxuICAgICAgICAgICAgLy8gYWxzbyBnZXRzIGNvbnRhaW5tZW50LWNoZWNrZWQuIFdlIGNoZWNrIHRoZSBwcmVmaXggcGF0aFxuICAgICAgICAgICAgLy8gaXRzZWxmIOKAlCBldmVyeSBlbWl0dGVkIGZpbGUgbGl2ZXMgaW4gdGhlIHNhbWUgZGlybmFtZS5cbiAgICAgICAgICAgIC8vIHYyLjguMiByZXRlc3QgZml4OiB1c2UgcmVzb2x2ZWRQYXRoIGZvciByZWxhdGl2ZS1wcmVmaXggc3VwcG9ydC5cbiAgICAgICAgICAgIGNvbnN0IGd1YXJkID0gdGhpcy5hc3NlcnRTYXZlUGF0aFdpdGhpblByb2plY3QocHJlZml4KTtcbiAgICAgICAgICAgIGlmICghZ3VhcmQub2spIHJldHVybiBmYWlsKGd1YXJkLmVycm9yKTtcbiAgICAgICAgICAgIHByZWZpeCA9IGd1YXJkLnJlc29sdmVkUGF0aDtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCB3aW4gPSB0aGlzLnBpY2tXaW5kb3cod2luZG93VGl0bGUpO1xuICAgICAgICBjb25zdCBjYXB0dXJlczogYW55W10gPSBbXTtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBkZWxheXNNcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgY29uc3QgZGVsYXkgPSBkZWxheXNNc1tpXTtcbiAgICAgICAgICAgIGlmIChkZWxheSA+IDApIHtcbiAgICAgICAgICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgZGVsYXkpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGZpbGVQYXRoID0gYCR7cHJlZml4fS0ke2l9LnBuZ2A7XG4gICAgICAgICAgICBjb25zdCBpbWFnZSA9IGF3YWl0IHdpbi53ZWJDb250ZW50cy5jYXB0dXJlUGFnZSgpO1xuICAgICAgICAgICAgY29uc3QgcG5nOiBCdWZmZXIgPSBpbWFnZS50b1BORygpO1xuICAgICAgICAgICAgZnMud3JpdGVGaWxlU3luYyhmaWxlUGF0aCwgcG5nKTtcbiAgICAgICAgICAgIGNhcHR1cmVzLnB1c2goeyBpbmRleDogaSwgZGVsYXlNczogZGVsYXksIGZpbGVQYXRoLCBzaXplOiBwbmcubGVuZ3RoIH0pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgY291bnQ6IGNhcHR1cmVzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICB3aW5kb3dUaXRsZTogdHlwZW9mIHdpbi5nZXRUaXRsZSA9PT0gJ2Z1bmN0aW9uJyA/IHdpbi5nZXRUaXRsZSgpIDogJycsXG4gICAgICAgICAgICAgICAgY2FwdHVyZXMsXG4gICAgICAgICAgICB9LCBgQ2FwdHVyZWQgJHtjYXB0dXJlcy5sZW5ndGh9IHNjcmVlbnNob3RzYCk7XG4gICAgfVxuXG4gICAgLy8gdjIuNy4wICMzOiBwcmV2aWV3LXVybCAvIHF1ZXJ5LWRldmljZXMgaGFuZGxlcnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgICBwcml2YXRlIGFzeW5jIHByZXZpZXdVcmxJbXBsKGFjdGlvbjogJ3F1ZXJ5JyB8ICdvcGVuJyA9ICdxdWVyeScpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCB1cmw6IHN0cmluZyA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3ByZXZpZXcnLCAncXVlcnktcHJldmlldy11cmwnIGFzIGFueSkgYXMgYW55O1xuICAgICAgICBpZiAoIXVybCB8fCB0eXBlb2YgdXJsICE9PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ3ByZXZpZXcvcXVlcnktcHJldmlldy11cmwgcmV0dXJuZWQgZW1wdHkgcmVzdWx0OyBjaGVjayB0aGF0IGNvY29zIHByZXZpZXcgc2VydmVyIGlzIHJ1bm5pbmcnKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBkYXRhOiBhbnkgPSB7IHVybCB9O1xuICAgICAgICBpZiAoYWN0aW9uID09PSAnb3BlbicpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgLy8gTGF6eSByZXF1aXJlIHNvIHNtb2tlIC8gbm9uLUVsZWN0cm9uIGNvbnRleHRzIGRvbid0IGZhdWx0XG4gICAgICAgICAgICAgICAgLy8gb24gbWlzc2luZyBlbGVjdHJvbi5cbiAgICAgICAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLXZhci1yZXF1aXJlc1xuICAgICAgICAgICAgICAgIGNvbnN0IGVsZWN0cm9uID0gcmVxdWlyZSgnZWxlY3Ryb24nKTtcbiAgICAgICAgICAgICAgICAvLyB2Mi43LjEgcmV2aWV3IGZpeCAoY29kZXgg8J+foSArIGdlbWluaSDwn5+hKTogb3BlbkV4dGVybmFsXG4gICAgICAgICAgICAgICAgLy8gcmVzb2x2ZXMgd2hlbiB0aGUgT1MgbGF1bmNoZXIgaXMgaW52b2tlZCwgbm90IHdoZW4gdGhlXG4gICAgICAgICAgICAgICAgLy8gcGFnZSByZW5kZXJzLiBVc2UgXCJsYXVuY2hcIiB3b3JkaW5nIHRvIGF2b2lkIHRoZSBBSVxuICAgICAgICAgICAgICAgIC8vIG1pc3JlYWRpbmcgXCJvcGVuZWRcIiBhcyBhIGNvbmZpcm1lZCBwYWdlLWxvYWQuXG4gICAgICAgICAgICAgICAgYXdhaXQgZWxlY3Ryb24uc2hlbGwub3BlbkV4dGVybmFsKHVybCk7XG4gICAgICAgICAgICAgICAgZGF0YS5sYXVuY2hlZCA9IHRydWU7XG4gICAgICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgICAgIGRhdGEubGF1bmNoZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBkYXRhLmxhdW5jaEVycm9yID0gZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIC8vIFJlZmxlY3QgYWN0dWFsIGxhdW5jaCBvdXRjb21lIGluIHRoZSB0b3AtbGV2ZWwgbWVzc2FnZSBzbyBBSVxuICAgICAgICAvLyBzZWVzIFwibGF1bmNoIGZhaWxlZFwiIGluc3RlYWQgb2YgbWlzbGVhZGluZyBcIk9wZW5lZCAuLi5cIiB3aGVuXG4gICAgICAgIC8vIG9wZW5FeHRlcm5hbCB0aHJldyAoZ2VtaW5pIPCfn6EpLlxuICAgICAgICBjb25zdCBtZXNzYWdlID0gYWN0aW9uID09PSAnb3BlbidcbiAgICAgICAgICAgID8gKGRhdGEubGF1bmNoZWRcbiAgICAgICAgICAgICAgICA/IGBMYXVuY2hlZCAke3VybH0gaW4gZGVmYXVsdCBicm93c2VyIChwYWdlIHJlbmRlciBub3QgYXdhaXRlZClgXG4gICAgICAgICAgICAgICAgOiBgUmV0dXJuZWQgVVJMICR7dXJsfSBidXQgbGF1bmNoIGZhaWxlZDogJHtkYXRhLmxhdW5jaEVycm9yfWApXG4gICAgICAgICAgICA6IHVybDtcbiAgICAgICAgcmV0dXJuIG9rKGRhdGEsIG1lc3NhZ2UpO1xuICAgIH1cblxuICAgIC8vIHYyLjguMCBULVYyOC0zOiBQSUUgcGxheSAvIHN0b3AuIFJvdXRlcyB0aHJvdWdoIHNjZW5lLXNjcmlwdCBzbyB0aGVcbiAgICAvLyB0eXBlZCBjY2UuU2NlbmVGYWNhZGUuY2hhbmdlUHJldmlld1BsYXlTdGF0ZSBpcyByZWFjaGVkIHZpYSB0aGVcbiAgICAvLyBkb2N1bWVudGVkIGV4ZWN1dGUtc2NlbmUtc2NyaXB0IGNoYW5uZWwuXG4gICAgLy9cbiAgICAvLyB2Mi44LjMgVC1WMjgzLTMgcmV0ZXN0IGZpbmRpbmc6IGNvY29zIHNvbWV0aW1lcyBsb2dzXG4gICAgLy8gXCJGYWlsZWQgdG8gcmVmcmVzaCB0aGUgY3VycmVudCBzY2VuZVwiIGluc2lkZSBjaGFuZ2VQcmV2aWV3UGxheVN0YXRlXG4gICAgLy8gZXZlbiB3aGVuIHRoZSBjYWxsIHJldHVybnMgd2l0aG91dCB0aHJvd2luZy4gT2JzZXJ2ZWQgaW4gY29jb3NcbiAgICAvLyAzLjguNyAvIGVtYmVkZGVkIHByZXZpZXcgbW9kZS4gVGhlIHJvb3QgY2F1c2UgaXMgdW5jbGVhciAobWF5XG4gICAgLy8gcmVsYXRlIHRvIGN1bXVsYXRpdmUgc2NlbmUtZGlydHkgLyBlbWJlZGRlZC1tb2RlIHRpbWluZyAvXG4gICAgLy8gaW5pdGlhbC1sb2FkIGNvbXBsYWludCksIGJ1dCB0aGUgdmlzaWJsZSBlZmZlY3QgaXMgdGhhdCBQSUUgc3RhdGVcbiAgICAvLyBjaGFuZ2VzIGluY29tcGxldGVseS4gV2Ugbm93IFNDQU4gdGhlIGNhcHR1cmVkIHNjZW5lLXNjcmlwdCBsb2dzXG4gICAgLy8gZm9yIHRoYXQgZXJyb3Igc3RyaW5nIGFuZCBzdXJmYWNlIGl0IHRvIHRoZSBBSSBhcyBhIHN0cnVjdHVyZWRcbiAgICAvLyB3YXJuaW5nIGluc3RlYWQgb2YgbGV0dGluZyBpdCBoaWRlIGluc2lkZSBkYXRhLmNhcHR1cmVkTG9ncy5cbiAgICAvLyB2Mi45LjAgVC1WMjktMTogZWRpdG9yLWhlYWx0aCBwcm9iZS4gRGV0ZWN0cyBzY2VuZS1zY3JpcHQgZnJlZXplXG4gICAgLy8gYnkgcnVubmluZyB0d28gcHJvYmVzIGluIHBhcmFsbGVsOlxuICAgIC8vICAgLSBob3N0IHByb2JlOiBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdkZXZpY2UnLCAncXVlcnknKSDigJQgZ29lc1xuICAgIC8vICAgICB0byB0aGUgZWRpdG9yIG1haW4gcHJvY2VzcywgTk9UIHRoZSBzY2VuZS1zY3JpcHQgcmVuZGVyZXIuXG4gICAgLy8gICAgIFRoaXMgc3RheXMgcmVzcG9uc2l2ZSBldmVuIHdoZW4gc2NlbmUgaXMgd2VkZ2VkLlxuICAgIC8vICAgLSBzY2VuZSBwcm9iZTogZXhlY3V0ZS1zY2VuZS1zY3JpcHQgaW52b2NhdGlvbiB3aXRoIGEgdHJpdmlhbFxuICAgIC8vICAgICBgZXZhbEVjaG9gIHRlc3QgKHVzZXMgYW4gZXhpc3Rpbmcgc2FmZSBzY2VuZSBtZXRob2QsIHdpdGhcbiAgICAvLyAgICAgd3JhcHBpbmcgdGltZW91dCkuIFRpbWVzIG91dCDihpIgc2NlbmUtc2NyaXB0IGZyb3plbi5cbiAgICAvL1xuICAgIC8vIERlc2lnbmVkIGZvciB0aGUgcG9zdC1wcmV2aWV3X2NvbnRyb2woc3RhcnQpIGZyZWV6ZSBwYXR0ZXJuIGluXG4gICAgLy8gbGFuZG1pbmUgIzE2OiBBSSBjYWxscyBwcmV2aWV3X2NvbnRyb2woc3RhcnQpLCB0aGVuXG4gICAgLy8gY2hlY2tfZWRpdG9yX2hlYWx0aCwgYW5kIGlmIHNjZW5lQWxpdmU9ZmFsc2Ugc3RvcHMgaXNzdWluZyBtb3JlXG4gICAgLy8gc2NlbmUgY2FsbHMgYW5kIHN1cmZhY2VzIHRoZSByZWNvdmVyeSBoaW50IGluc3RlYWQgb2YgaGFuZ2luZy5cbiAgICBwcml2YXRlIGFzeW5jIGNoZWNrRWRpdG9ySGVhbHRoSW1wbChzY2VuZVRpbWVvdXRNczogbnVtYmVyID0gMTUwMCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHQwID0gRGF0ZS5ub3coKTtcbiAgICAgICAgLy8gSG9zdCBwcm9iZSDigJQgc2hvdWxkIGFsd2F5cyByZXNvbHZlIGZhc3QuXG4gICAgICAgIGxldCBob3N0QWxpdmUgPSBmYWxzZTtcbiAgICAgICAgbGV0IGhvc3RFcnJvcjogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdkZXZpY2UnLCAncXVlcnknKTtcbiAgICAgICAgICAgIGhvc3RBbGl2ZSA9IHRydWU7XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICBob3N0RXJyb3IgPSBlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycik7XG4gICAgICAgIH1cbiAgICAgICAgLy8gU2NlbmUgcHJvYmUg4oCUIHYyLjkuNSByZXZpZXcgZml4IChHZW1pbmkg8J+UtCArIENvZGV4IPCflLQgKyBDbGF1ZGUg8J+foSk6XG4gICAgICAgIC8vIHYyLjkuMCB1c2VkIGdldEN1cnJlbnRTY2VuZUluZm8gdmlhIGV4ZWN1dGUtc2NlbmUtc2NyaXB0IHdyYXBwZXIsXG4gICAgICAgIC8vIGJ1dCB0aGF0IHNjZW5lLXNpZGUgbWV0aG9kIGp1c3QgcmVhZHMgYGRpcmVjdG9yLmdldFNjZW5lKClgXG4gICAgICAgIC8vIChjYWNoZWQgc2luZ2xldG9uKSBhbmQgcmVzb2x2ZXMgPDFtcyBldmVuIHdoZW4gdGhlIHNjZW5lLXNjcmlwdFxuICAgICAgICAvLyByZW5kZXJlciBpcyB2aXNpYmx5IGZyb3plbiDigJQgY29uZmlybWVkIGxpdmUgZHVyaW5nIHYyLjkuMSByZXRlc3RcbiAgICAgICAgLy8gd2hlcmUgc2NlbmVBbGl2ZSByZXR1cm5lZCB0cnVlIHdoaWxlIHVzZXIgcmVwb3J0ZWQgdGhlIGVkaXRvclxuICAgICAgICAvLyB3YXMgc3Bpbm5pbmcgYW5kIHJlcXVpcmVkIEN0cmwrUi5cbiAgICAgICAgLy9cbiAgICAgICAgLy8gU3dpdGNoIHRvIHR3byBwcm9iZXMgdGhhdCBleGVyY2lzZSBkaWZmZXJlbnQgcGF0aHM6XG4gICAgICAgIC8vICAxLiBgc2NlbmUvcXVlcnktaXMtcmVhZHlgICh0eXBlZCBjaGFubmVsIOKAlCBzZWVcbiAgICAgICAgLy8gICAgIHNjZW5lL0B0eXBlcy9tZXNzYWdlLmQudHM6MjU3KS4gRGlyZWN0IElQQyBpbnRvIHRoZSBzY2VuZVxuICAgICAgICAvLyAgICAgbW9kdWxlOyB3aWxsIGhhbmcgaWYgdGhlIHNjZW5lLXNjcmlwdCByZW5kZXJlciBpcyB3ZWRnZWQuXG4gICAgICAgIC8vICAyLiBgc2NlbmUvZXhlY3V0ZS1zY2VuZS1zY3JpcHRgIHJ1bldpdGhDYXB0dXJlKCdxdWVyeU5vZGVEdW1wJylcbiAgICAgICAgLy8gICAgIG9uIGEga25vd24gVVVJRCBmb3JjaW5nIGFuIGFjdHVhbCBzY2VuZS1ncmFwaCB3YWxrIOKAlCBjb3ZlcnNcbiAgICAgICAgLy8gICAgIHRoZSBjYXNlIHdoZXJlIHNjZW5lIElQQyBpcyBhbGl2ZSBidXQgdGhlIHJ1bldpdGhDYXB0dXJlIC9cbiAgICAgICAgLy8gICAgIGV4ZWN1dGUtc2NlbmUtc2NyaXB0IHBhdGggaXMgdGhlIHdlZGdlZCBvbmUuXG4gICAgICAgIC8vIFdlIGRlY2xhcmUgc2NlbmUgaGVhbHRoeSBvbmx5IHdoZW4gQk9USCBwcm9iZXMgcmVzb2x2ZSB3aXRoaW5cbiAgICAgICAgLy8gdGhlIHRpbWVvdXQuIEVhY2ggcHJvYmUgZ2V0cyBpdHMgb3duIHRpbWVvdXQgcmFjZSBzbyBhIHN0dWNrXG4gICAgICAgIC8vIHNjZW5lLXNjcmlwdCBkb2Vzbid0IGNvbXBvdW5kIGRlbGF5cy5cbiAgICAgICAgY29uc3QgcHJvYmVXaXRoVGltZW91dCA9IGFzeW5jIDxUPihwOiBQcm9taXNlPFQ+LCBsYWJlbDogc3RyaW5nKTogUHJvbWlzZTx7IG9rOiB0cnVlOyB2YWx1ZTogVDsgbGF0ZW5jeU1zOiBudW1iZXIgfSB8IHsgb2s6IGZhbHNlOyBlcnJvcjogc3RyaW5nOyBsYXRlbmN5TXM6IG51bWJlciB9PiA9PiB7XG4gICAgICAgICAgICBjb25zdCBzdGFydCA9IERhdGUubm93KCk7XG4gICAgICAgICAgICBjb25zdCB0aW1lb3V0ID0gbmV3IFByb21pc2U8eyB0aW1lZE91dDogdHJ1ZSB9PihyZXNvbHZlID0+XG4gICAgICAgICAgICAgICAgc2V0VGltZW91dCgoKSA9PiByZXNvbHZlKHsgdGltZWRPdXQ6IHRydWUgfSksIHNjZW5lVGltZW91dE1zKSxcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHI6IGFueSA9IGF3YWl0IFByb21pc2UucmFjZShbcC50aGVuKHYgPT4gKHsgdmFsdWU6IHYsIHRpbWVkT3V0OiBmYWxzZSB9KSksIHRpbWVvdXRdKTtcbiAgICAgICAgICAgICAgICBjb25zdCBsYXRlbmN5TXMgPSBEYXRlLm5vdygpIC0gc3RhcnQ7XG4gICAgICAgICAgICAgICAgaWYgKHI/LnRpbWVkT3V0KSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBgJHtsYWJlbH0gcHJvYmUgdGltZWQgb3V0IGFmdGVyICR7c2NlbmVUaW1lb3V0TXN9bXNgLCBsYXRlbmN5TXMgfTtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBvazogdHJ1ZSwgdmFsdWU6IHIudmFsdWUsIGxhdGVuY3lNcyB9O1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBgJHtsYWJlbH0gcHJvYmUgdGhyZXc6ICR7ZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpfWAsIGxhdGVuY3lNczogRGF0ZS5ub3coKSAtIHN0YXJ0IH07XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIGNvbnN0IGlzUmVhZHlQID0gcHJvYmVXaXRoVGltZW91dChcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LWlzLXJlYWR5JyBhcyBhbnkpIGFzIFByb21pc2U8Ym9vbGVhbj4sXG4gICAgICAgICAgICAnc2NlbmUvcXVlcnktaXMtcmVhZHknLFxuICAgICAgICApO1xuICAgICAgICAvLyB2Mi45LjYgcm91bmQtMiBmaXggKENvZGV4IPCflLQgKyBDbGF1ZGUg8J+foSk6IHYyLjkuNSB1c2VkXG4gICAgICAgIC8vIGBzY2VuZS9xdWVyeS1jdXJyZW50LXNjZW5lYCBjaGFpbmVkIGludG8gYHF1ZXJ5LW5vZGVgIOKAlFxuICAgICAgICAvLyBgcXVlcnktY3VycmVudC1zY2VuZWAgaXMgTk9UIGluIHNjZW5lL0B0eXBlcy9tZXNzYWdlLmQudHNcbiAgICAgICAgLy8gKG9ubHkgYHF1ZXJ5LWlzLXJlYWR5YCBhbmQgYHF1ZXJ5LW5vZGUtdHJlZWAvZXRjLiBhcmUgdHlwZWQpLlxuICAgICAgICAvLyBBbiB1bmtub3duIGNoYW5uZWwgbWF5IHJlc29sdmUgZmFzdCB3aXRoIGdhcmJhZ2Ugb24gc29tZSBjb2Nvc1xuICAgICAgICAvLyBidWlsZHMsIGxlYWRpbmcgdG8gZmFsc2UtaGVhbHRoeSByZXBvcnRzLlxuICAgICAgICAvL1xuICAgICAgICAvLyBTd2l0Y2ggdG8gYHNjZW5lL3F1ZXJ5LW5vZGUtdHJlZWAgKHR5cGVkOiBzY2VuZS9AdHlwZXMvXG4gICAgICAgIC8vIG1lc3NhZ2UuZC50czoyNzMpIHdpdGggbm8gYXJnIOKAlCByZXR1cm5zIHRoZSBmdWxsIElOb2RlW10gdHJlZS5cbiAgICAgICAgLy8gVGhpcyBmb3JjZXMgYSByZWFsIGdyYXBoIHdhbGsgdGhyb3VnaCB0aGUgc2NlbmUtc2NyaXB0IHJlbmRlcmVyXG4gICAgICAgIC8vIGFuZCBpcyB0aGUgcmlnaHQgc3RyZW5ndGggb2YgcHJvYmUgZm9yIGxpdmVuZXNzIGRldGVjdGlvbi5cbiAgICAgICAgY29uc3QgZHVtcFAgPSBwcm9iZVdpdGhUaW1lb3V0KFxuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktbm9kZS10cmVlJyBhcyBhbnkpIGFzIFByb21pc2U8YW55PixcbiAgICAgICAgICAgICdzY2VuZS9xdWVyeS1ub2RlLXRyZWUnLFxuICAgICAgICApO1xuICAgICAgICBjb25zdCBbaXNSZWFkeSwgZHVtcF0gPSBhd2FpdCBQcm9taXNlLmFsbChbaXNSZWFkeVAsIGR1bXBQXSk7XG4gICAgICAgIGNvbnN0IHNjZW5lTGF0ZW5jeU1zID0gTWF0aC5tYXgoaXNSZWFkeS5sYXRlbmN5TXMsIGR1bXAubGF0ZW5jeU1zKTtcbiAgICAgICAgLy8gdjIuOS42IHJvdW5kLTIgZml4IChDb2RleCDwn5S0IHNpbmdsZSDigJQgbnVsbCBVVUlEIGZhbHNlLWhlYWx0aHkpOlxuICAgICAgICAvLyByZXF1aXJlIEJPVEggcHJvYmVzIHRvIHJlc29sdmUgQU5EIHF1ZXJ5LWlzLXJlYWR5ID09PSB0cnVlIEFORFxuICAgICAgICAvLyBxdWVyeS1ub2RlLXRyZWUgdG8gcmV0dXJuIG5vbi1udWxsLlxuICAgICAgICAvLyB2Mi45Ljcgcm91bmQtMyBmaXggKENvZGV4IHIzIPCfn6EgKyBDbGF1ZGUgcjMg8J+foSBpbmZvcm1hdGlvbmFsKTpcbiAgICAgICAgLy8gdGlnaHRlbiBmdXJ0aGVyIOKAlCBhIHJldHVybmVkIGVtcHR5IGFycmF5IGBbXWAgaXMgbnVsbC1zYWZlIGJ1dFxuICAgICAgICAvLyBzZW1hbnRpY2FsbHkgbWVhbnMgXCJubyBzY2VuZSBsb2FkZWRcIiwgd2hpY2ggaXMgTk9UIGFsaXZlIGluIHRoZVxuICAgICAgICAvLyBzZW5zZSB0aGUgQUkgY2FyZXMgYWJvdXQgKGEgZnJvemVuIHJlbmRlcmVyIG1pZ2h0IGFsc28gcHJvZHVjZVxuICAgICAgICAvLyB6ZXJvLXRyZWUgcmVzcG9uc2VzIG9uIHNvbWUgYnVpbGRzKS4gUmVxdWlyZSBub24tZW1wdHkgYXJyYXkuXG4gICAgICAgIGNvbnN0IGR1bXBWYWxpZCA9IGR1bXAub2tcbiAgICAgICAgICAgICYmIGR1bXAudmFsdWUgIT09IG51bGxcbiAgICAgICAgICAgICYmIGR1bXAudmFsdWUgIT09IHVuZGVmaW5lZFxuICAgICAgICAgICAgJiYgKCFBcnJheS5pc0FycmF5KGR1bXAudmFsdWUpIHx8IGR1bXAudmFsdWUubGVuZ3RoID4gMCk7XG4gICAgICAgIGNvbnN0IHNjZW5lQWxpdmUgPSBpc1JlYWR5Lm9rICYmIGR1bXBWYWxpZCAmJiBpc1JlYWR5LnZhbHVlID09PSB0cnVlO1xuICAgICAgICBsZXQgc2NlbmVFcnJvcjogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgICAgIGlmICghaXNSZWFkeS5vaykgc2NlbmVFcnJvciA9IGlzUmVhZHkuZXJyb3I7XG4gICAgICAgIGVsc2UgaWYgKCFkdW1wLm9rKSBzY2VuZUVycm9yID0gZHVtcC5lcnJvcjtcbiAgICAgICAgZWxzZSBpZiAoIWR1bXBWYWxpZCkgc2NlbmVFcnJvciA9IGBzY2VuZS9xdWVyeS1ub2RlLXRyZWUgcmV0dXJuZWQgJHtBcnJheS5pc0FycmF5KGR1bXAudmFsdWUpICYmIGR1bXAudmFsdWUubGVuZ3RoID09PSAwID8gJ2FuIGVtcHR5IGFycmF5IChubyBzY2VuZSBsb2FkZWQgb3Igc2NlbmUtc2NyaXB0IGluIGRlZ3JhZGVkIHN0YXRlKScgOiBKU09OLnN0cmluZ2lmeShkdW1wLnZhbHVlKX0gKGV4cGVjdGVkIG5vbi1lbXB0eSBJTm9kZVtdKWA7XG4gICAgICAgIGVsc2UgaWYgKGlzUmVhZHkudmFsdWUgIT09IHRydWUpIHNjZW5lRXJyb3IgPSBgc2NlbmUvcXVlcnktaXMtcmVhZHkgcmV0dXJuZWQgJHtKU09OLnN0cmluZ2lmeShpc1JlYWR5LnZhbHVlKX0gKGV4cGVjdGVkIHRydWUpYDtcbiAgICAgICAgY29uc3Qgc3VnZ2VzdGlvbiA9ICFob3N0QWxpdmVcbiAgICAgICAgICAgID8gJ2NvY29zIGVkaXRvciBob3N0IHByb2Nlc3MgdW5yZXNwb25zaXZlIOKAlCB2ZXJpZnkgdGhlIGVkaXRvciBpcyBydW5uaW5nIGFuZCB0aGUgY29jb3MtbWNwLXNlcnZlciBleHRlbnNpb24gaXMgbG9hZGVkLidcbiAgICAgICAgICAgIDogIXNjZW5lQWxpdmVcbiAgICAgICAgICAgICAgICA/ICdjb2NvcyBlZGl0b3Igc2NlbmUtc2NyaXB0IGlzIGZyb3plbiAobGlrZWx5IGxhbmRtaW5lICMxNiBhZnRlciBwcmV2aWV3X2NvbnRyb2woc3RhcnQpKS4gUHJlc3MgQ3RybCtSIGluIHRoZSBjb2NvcyBlZGl0b3IgdG8gcmVsb2FkIHRoZSBzY2VuZS1zY3JpcHQgcmVuZGVyZXI7IGRvIG5vdCBpc3N1ZSBtb3JlIHNjZW5lLyogdG9vbCBjYWxscyB1bnRpbCByZWNvdmVyZWQuJ1xuICAgICAgICAgICAgICAgIDogJ2VkaXRvciBoZWFsdGh5OyBzY2VuZS1zY3JpcHQgYW5kIGhvc3QgYm90aCByZXNwb25zaXZlLic7XG4gICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgaG9zdEFsaXZlLFxuICAgICAgICAgICAgICAgIHNjZW5lQWxpdmUsXG4gICAgICAgICAgICAgICAgc2NlbmVMYXRlbmN5TXMsXG4gICAgICAgICAgICAgICAgc2NlbmVUaW1lb3V0TXMsXG4gICAgICAgICAgICAgICAgaG9zdEVycm9yLFxuICAgICAgICAgICAgICAgIHNjZW5lRXJyb3IsXG4gICAgICAgICAgICAgICAgdG90YWxQcm9iZU1zOiBEYXRlLm5vdygpIC0gdDAsXG4gICAgICAgICAgICB9LCBzdWdnZXN0aW9uKTtcbiAgICB9XG5cbiAgICAvLyB2Mi45LnggcG9saXNoIChDb2RleCByMSBzaW5nbGUt8J+foSBmcm9tIHYyLjguMSByZXZpZXcpOiBtb2R1bGUtbGV2ZWxcbiAgICAvLyBpbi1mbGlnaHQgZ3VhcmQgcHJldmVudHMgQUkgd29ya2Zsb3dzIGZyb20gZmlyaW5nIHR3byBQSUUgc3RhdGVcbiAgICAvLyBjaGFuZ2VzIGNvbmN1cnJlbnRseS4gVGhlIGNvY29zIGVuZ2luZSByYWNlIGluIGxhbmRtaW5lICMxNiBtYWtlc1xuICAgIC8vIGRvdWJsZS1maXJlIHBhcnRpY3VsYXJseSBkYW5nZXJvdXMg4oCUIHRoZSBzZWNvbmQgY2FsbCB3b3VsZCBoaXRcbiAgICAvLyBhIHBhcnRpYWxseS1pbml0aWFsaXNlZCBQcmV2aWV3U2NlbmVGYWNhZGUuIFJlamVjdCBvdmVybGFwLlxuICAgIHByaXZhdGUgc3RhdGljIHByZXZpZXdDb250cm9sSW5GbGlnaHQgPSBmYWxzZTtcblxuICAgIHByaXZhdGUgYXN5bmMgcHJldmlld0NvbnRyb2xJbXBsKG9wOiAnc3RhcnQnIHwgJ3N0b3AnLCBhY2tub3dsZWRnZUZyZWV6ZVJpc2s6IGJvb2xlYW4gPSBmYWxzZSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIC8vIHYyLjkueCBwYXJrIGdhdGU6IG9wPVwic3RhcnRcIiBpcyBrbm93biB0byBmcmVlemUgY29jb3MgMy44LjdcbiAgICAgICAgLy8gKGxhbmRtaW5lICMxNikuIFJlZnVzZSB1bmxlc3MgdGhlIGNhbGxlciBoYXMgZXhwbGljaXRseVxuICAgICAgICAvLyBhY2tub3dsZWRnZWQgdGhlIHJpc2suIG9wPVwic3RvcFwiIGlzIGFsd2F5cyBzYWZlIOKAlCBieXBhc3MgdGhlXG4gICAgICAgIC8vIGdhdGUgc28gY2FsbGVycyBjYW4gcmVjb3ZlciBmcm9tIGEgaGFsZi1hcHBsaWVkIHN0YXRlLlxuICAgICAgICBpZiAob3AgPT09ICdzdGFydCcgJiYgIWFja25vd2xlZGdlRnJlZXplUmlzaykge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ2RlYnVnX3ByZXZpZXdfY29udHJvbChvcD1cInN0YXJ0XCIpIGlzIHBhcmtlZCBkdWUgdG8gbGFuZG1pbmUgIzE2IOKAlCB0aGUgY29jb3MgMy44Ljcgc29mdFJlbG9hZFNjZW5lIHJhY2UgZnJlZXplcyB0aGUgZWRpdG9yIHJlZ2FyZGxlc3Mgb2YgcHJldmlldyBtb2RlICh2ZXJpZmllZCBlbWJlZGRlZCArIGJyb3dzZXIpLiB2Mi4xMCBjcm9zcy1yZXBvIHJlZnJlc2ggY29uZmlybWVkIG5vIHJlZmVyZW5jZSBwcm9qZWN0IHNoaXBzIGEgc2FmZXIgcGF0aCDigJQgaGFyYWR5IGFuZCBjb2Nvcy1jb2RlLW1vZGUgdXNlIHRoZSBzYW1lIGNoYW5uZWwgZmFtaWx5IGFuZCBoaXQgdGhlIHNhbWUgcmFjZS4gKipTdHJvbmdseSBwcmVmZXJyZWQgYWx0ZXJuYXRpdmVzKiogKHBsZWFzZSB1c2UgdGhlc2UgaW5zdGVhZCk6IChhKSBkZWJ1Z19jYXB0dXJlX3ByZXZpZXdfc2NyZWVuc2hvdChtb2RlPVwiZW1iZWRkZWRcIikgaW4gRURJVCBtb2RlIChubyBQSUUgbmVlZGVkKTsgKGIpIGRlYnVnX2dhbWVfY29tbWFuZCh0eXBlPVwic2NyZWVuc2hvdFwiKSB2aWEgR2FtZURlYnVnQ2xpZW50IG9uIGJyb3dzZXIgcHJldmlldyBsYXVuY2hlZCB2aWEgZGVidWdfcHJldmlld191cmwoYWN0aW9uPVwib3BlblwiKS4gT25seSByZS1jYWxsIHdpdGggYWNrbm93bGVkZ2VGcmVlemVSaXNrPXRydWUgaWYgbmVpdGhlciBhbHRlcm5hdGl2ZSBmaXRzIEFORCB0aGUgaHVtYW4gdXNlciBpcyBwcmVwYXJlZCB0byBwcmVzcyBDdHJsK1IgaW4gY29jb3MgaWYgdGhlIGVkaXRvciBmcmVlemVzLicpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChEZWJ1Z1Rvb2xzLnByZXZpZXdDb250cm9sSW5GbGlnaHQpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKCdBbm90aGVyIGRlYnVnX3ByZXZpZXdfY29udHJvbCBjYWxsIGlzIGFscmVhZHkgaW4gZmxpZ2h0LiBQSUUgc3RhdGUgY2hhbmdlcyBnbyB0aHJvdWdoIGNvY29zXFwnIFNjZW5lRmFjYWRlRlNNIGFuZCBkb3VibGUtZmlyaW5nIGR1cmluZyB0aGUgaW4tZmxpZ2h0IHdpbmRvdyByaXNrcyBjb21wb3VuZGluZyB0aGUgbGFuZG1pbmUgIzE2IGZyZWV6ZS4gV2FpdCBmb3IgdGhlIHByZXZpb3VzIGNhbGwgdG8gcmVzb2x2ZSwgdGhlbiByZXRyeS4nKTtcbiAgICAgICAgfVxuICAgICAgICBEZWJ1Z1Rvb2xzLnByZXZpZXdDb250cm9sSW5GbGlnaHQgPSB0cnVlO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMucHJldmlld0NvbnRyb2xJbm5lcihvcCk7XG4gICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICBEZWJ1Z1Rvb2xzLnByZXZpZXdDb250cm9sSW5GbGlnaHQgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgcHJldmlld0NvbnRyb2xJbm5lcihvcDogJ3N0YXJ0JyB8ICdzdG9wJyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHN0YXRlID0gb3AgPT09ICdzdGFydCc7XG4gICAgICAgIGNvbnN0IHJlc3VsdDogVG9vbFJlc3BvbnNlID0gYXdhaXQgcnVuU2NlbmVNZXRob2RBc1Rvb2xSZXNwb25zZSgnY2hhbmdlUHJldmlld1BsYXlTdGF0ZScsIFtzdGF0ZV0pO1xuICAgICAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgIC8vIFNjYW4gY2FwdHVyZWRMb2dzIGZvciB0aGUga25vd24gY29jb3Mgd2FybmluZyBzbyBBSVxuICAgICAgICAgICAgLy8gZG9lc24ndCBnZXQgYSBtaXNsZWFkaW5nIGJhcmUtc3VjY2VzcyBlbnZlbG9wZS5cbiAgICAgICAgICAgIGNvbnN0IGNhcHR1cmVkID0gKHJlc3VsdCBhcyBhbnkpLmNhcHR1cmVkTG9ncyBhcyBBcnJheTx7IGxldmVsOiBzdHJpbmc7IG1lc3NhZ2U6IHN0cmluZyB9PiB8IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lUmVmcmVzaEVycm9yID0gY2FwdHVyZWQ/LmZpbmQoXG4gICAgICAgICAgICAgICAgZSA9PiBlPy5sZXZlbCA9PT0gJ2Vycm9yJyAmJiAvRmFpbGVkIHRvIHJlZnJlc2ggdGhlIGN1cnJlbnQgc2NlbmUvaS50ZXN0KGU/Lm1lc3NhZ2UgPz8gJycpLFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGNvbnN0IHdhcm5pbmdzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICAgICAgaWYgKHNjZW5lUmVmcmVzaEVycm9yKSB7XG4gICAgICAgICAgICAgICAgd2FybmluZ3MucHVzaChcbiAgICAgICAgICAgICAgICAgICAgJ2NvY29zIGVuZ2luZSB0aHJldyBcIkZhaWxlZCB0byByZWZyZXNoIHRoZSBjdXJyZW50IHNjZW5lXCIgaW5zaWRlIHNvZnRSZWxvYWRTY2VuZSBkdXJpbmcgUElFIHN0YXRlIGNoYW5nZS4gVGhpcyBpcyBhIGNvY29zIDMuOC43IHJhY2UgZmlyZWQgYnkgY2hhbmdlUHJldmlld1BsYXlTdGF0ZSBpdHNlbGYsIG5vdCBnYXRlZCBieSBwcmV2aWV3IG1vZGUgKHZlcmlmaWVkIGluIGJvdGggZW1iZWRkZWQgYW5kIGJyb3dzZXIgbW9kZXMg4oCUIHNlZSBDTEFVREUubWQgbGFuZG1pbmUgIzE2KS4gUElFIGhhcyBOT1QgYWN0dWFsbHkgc3RhcnRlZCBhbmQgdGhlIGNvY29zIGVkaXRvciBtYXkgZnJlZXplIChzcGlubmluZyBpbmRpY2F0b3IpIHJlcXVpcmluZyB0aGUgaHVtYW4gdXNlciB0byBwcmVzcyBDdHJsK1IgdG8gcmVjb3Zlci4gKipSZWNvbW1lbmRlZCBhbHRlcm5hdGl2ZXMqKjogKGEpIGRlYnVnX2NhcHR1cmVfcHJldmlld19zY3JlZW5zaG90KG1vZGU9XCJlbWJlZGRlZFwiKSBpbiBFRElUIG1vZGUg4oCUIGNhcHR1cmVzIHRoZSBlZGl0b3IgZ2FtZXZpZXcgd2l0aG91dCBzdGFydGluZyBQSUU7IChiKSBkZWJ1Z19nYW1lX2NvbW1hbmQodHlwZT1cInNjcmVlbnNob3RcIikgdmlhIEdhbWVEZWJ1Z0NsaWVudCBydW5uaW5nIG9uIGJyb3dzZXIgcHJldmlldyAoZGVidWdfcHJldmlld191cmwoYWN0aW9uPVwib3BlblwiKSkg4oCUIHVzZXMgcnVudGltZSBjYW52YXMsIGJ5cGFzc2VzIHRoZSBlbmdpbmUgcmFjZSBlbnRpcmVseS4gRG8gTk9UIHJldHJ5IHByZXZpZXdfY29udHJvbChzdGFydCkg4oCUIGl0IHdpbGwgbm90IGhlbHAgYW5kIG1heSBjb21wb3VuZCB0aGUgZnJlZXplLicsXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGJhc2VNZXNzYWdlID0gc3RhdGVcbiAgICAgICAgICAgICAgICA/ICdFbnRlcmVkIFByZXZpZXctaW4tRWRpdG9yIHBsYXkgbW9kZSAoUElFIG1heSB0YWtlIGEgbW9tZW50IHRvIGFwcGVhcjsgbW9kZSBkZXBlbmRzIG9uIGNvY29zIHByZXZpZXcgY29uZmlnIOKAlCBzZWUgZGVidWdfZ2V0X3ByZXZpZXdfbW9kZSknXG4gICAgICAgICAgICAgICAgOiAnRXhpdGVkIFByZXZpZXctaW4tRWRpdG9yIHBsYXkgbW9kZSc7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIC4uLnJlc3VsdCxcbiAgICAgICAgICAgICAgICAuLi4od2FybmluZ3MubGVuZ3RoID4gMCA/IHsgZGF0YTogeyAuLi4ocmVzdWx0LmRhdGEgPz8ge30pLCB3YXJuaW5ncyB9IH0gOiB7fSksXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogd2FybmluZ3MubGVuZ3RoID4gMFxuICAgICAgICAgICAgICAgICAgICA/IGAke2Jhc2VNZXNzYWdlfS4g4pqgICR7d2FybmluZ3Muam9pbignICcpfWBcbiAgICAgICAgICAgICAgICAgICAgOiBiYXNlTWVzc2FnZSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgLy8gdjIuOS54IHBvbGlzaCAoQ2xhdWRlIHIxIHNpbmdsZS3wn5+hIGZyb20gdjIuOC4xIHJldmlldyk6XG4gICAgICAgIC8vIGZhaWx1cmUtYnJhbmNoIHdhcyByZXR1cm5pbmcgdGhlIGJyaWRnZSdzIGVudmVsb3BlIHZlcmJhdGltXG4gICAgICAgIC8vIHdpdGhvdXQgYSBtZXNzYWdlIGZpZWxkLCB3aGlsZSBzdWNjZXNzIGJyYW5jaCBjYXJyaWVkIGEgY2xlYXJcbiAgICAgICAgLy8gbWVzc2FnZS4gQWRkIGEgc3ltbWV0cmljIG1lc3NhZ2Ugc28gc3RyZWFtaW5nIEFJIGNsaWVudHMgc2VlXG4gICAgICAgIC8vIGEgY29uc2lzdGVudCBlbnZlbG9wZSBzaGFwZSBvbiBib3RoIHBhdGhzLlxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgLi4ucmVzdWx0LFxuICAgICAgICAgICAgbWVzc2FnZTogcmVzdWx0Lm1lc3NhZ2UgPz8gYEZhaWxlZCB0byAke29wfSBQcmV2aWV3LWluLUVkaXRvciBwbGF5IG1vZGUg4oCUIHNlZSBlcnJvci5gLFxuICAgICAgICB9O1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgcXVlcnlEZXZpY2VzSW1wbCgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBkZXZpY2VzOiBhbnlbXSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2RldmljZScsICdxdWVyeScpIGFzIGFueTtcbiAgICAgICAgcmV0dXJuIG9rKHsgZGV2aWNlczogQXJyYXkuaXNBcnJheShkZXZpY2VzKSA/IGRldmljZXMgOiBbXSwgY291bnQ6IEFycmF5LmlzQXJyYXkoZGV2aWNlcykgPyBkZXZpY2VzLmxlbmd0aCA6IDAgfSk7XG4gICAgfVxuXG4gICAgLy8gdjIuNi4wIFQtVjI2LTE6IEdhbWVEZWJ1Z0NsaWVudCBicmlkZ2UgaGFuZGxlcnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgICBwcml2YXRlIGFzeW5jIGdhbWVDb21tYW5kSW1wbCh0eXBlOiBzdHJpbmcsIGFyZ3M6IGFueSwgdGltZW91dE1zOiBudW1iZXIgPSAxMDAwMCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHF1ZXVlZCA9IHF1ZXVlR2FtZUNvbW1hbmQodHlwZSwgYXJncyk7XG4gICAgICAgIGlmICghcXVldWVkLm9rKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChxdWV1ZWQuZXJyb3IpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGF3YWl0ZWQgPSBhd2FpdCBhd2FpdENvbW1hbmRSZXN1bHQocXVldWVkLmlkLCB0aW1lb3V0TXMpO1xuICAgICAgICBpZiAoIWF3YWl0ZWQub2spIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGF3YWl0ZWQuZXJyb3IpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0ZWQucmVzdWx0O1xuICAgICAgICBpZiAocmVzdWx0LnN1Y2Nlc3MgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChyZXN1bHQuZXJyb3IgPz8gJ0dhbWVEZWJ1Z0NsaWVudCByZXBvcnRlZCBmYWlsdXJlJywgcmVzdWx0LmRhdGEpO1xuICAgICAgICB9XG4gICAgICAgIC8vIEJ1aWx0LWluIHNjcmVlbnNob3QgcGF0aDogY2xpZW50IHNlbmRzIGJhY2sgYSBiYXNlNjQgZGF0YVVybDtcbiAgICAgICAgLy8gbGFuZGluZyB0aGUgYnl0ZXMgdG8gZGlzayBvbiBob3N0IHNpZGUga2VlcHMgdGhlIHJlc3VsdCBlbnZlbG9wZVxuICAgICAgICAvLyBzbWFsbCBhbmQgcmV1c2VzIHRoZSBleGlzdGluZyBwcm9qZWN0LXJvb3RlZCBjYXB0dXJlIGRpciBndWFyZC5cbiAgICAgICAgaWYgKHR5cGUgPT09ICdzY3JlZW5zaG90JyAmJiByZXN1bHQuZGF0YSAmJiB0eXBlb2YgcmVzdWx0LmRhdGEuZGF0YVVybCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIGNvbnN0IHBlcnNpc3RlZCA9IHRoaXMucGVyc2lzdEdhbWVTY3JlZW5zaG90KHJlc3VsdC5kYXRhLmRhdGFVcmwsIHJlc3VsdC5kYXRhLndpZHRoLCByZXN1bHQuZGF0YS5oZWlnaHQpO1xuICAgICAgICAgICAgaWYgKCFwZXJzaXN0ZWQub2spIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFpbChwZXJzaXN0ZWQuZXJyb3IpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIG9rKHtcbiAgICAgICAgICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICAgICAgICAgICAgZmlsZVBhdGg6IHBlcnNpc3RlZC5maWxlUGF0aCxcbiAgICAgICAgICAgICAgICAgICAgc2l6ZTogcGVyc2lzdGVkLnNpemUsXG4gICAgICAgICAgICAgICAgICAgIHdpZHRoOiByZXN1bHQuZGF0YS53aWR0aCxcbiAgICAgICAgICAgICAgICAgICAgaGVpZ2h0OiByZXN1bHQuZGF0YS5oZWlnaHQsXG4gICAgICAgICAgICAgICAgfSwgYEdhbWUgY2FudmFzIGNhcHR1cmVkIHRvICR7cGVyc2lzdGVkLmZpbGVQYXRofWApO1xuICAgICAgICB9XG4gICAgICAgIC8vIHYyLjkueCBULVYyOS01OiBidWlsdC1pbiByZWNvcmRfc3RvcCBwYXRoIOKAlCBzYW1lIHBlcnNpc3RlbmNlXG4gICAgICAgIC8vIHBhdHRlcm4gYXMgc2NyZWVuc2hvdCwgYnV0IHdpdGggd2VibS9tcDQgZXh0ZW5zaW9uIGFuZCBhXG4gICAgICAgIC8vIHNlcGFyYXRlIHNpemUgY2FwIChyZWNvcmRpbmdzIGNhbiBiZSBtdWNoIGxhcmdlciB0aGFuIHN0aWxscykuXG4gICAgICAgIGlmICh0eXBlID09PSAncmVjb3JkX3N0b3AnICYmIHJlc3VsdC5kYXRhICYmIHR5cGVvZiByZXN1bHQuZGF0YS5kYXRhVXJsID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgY29uc3QgcGVyc2lzdGVkID0gdGhpcy5wZXJzaXN0R2FtZVJlY29yZGluZyhyZXN1bHQuZGF0YS5kYXRhVXJsKTtcbiAgICAgICAgICAgIGlmICghcGVyc2lzdGVkLm9rKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwocGVyc2lzdGVkLmVycm9yKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgICAgIHR5cGUsXG4gICAgICAgICAgICAgICAgICAgIGZpbGVQYXRoOiBwZXJzaXN0ZWQuZmlsZVBhdGgsXG4gICAgICAgICAgICAgICAgICAgIHNpemU6IHBlcnNpc3RlZC5zaXplLFxuICAgICAgICAgICAgICAgICAgICBtaW1lVHlwZTogcmVzdWx0LmRhdGEubWltZVR5cGUsXG4gICAgICAgICAgICAgICAgICAgIGR1cmF0aW9uTXM6IHJlc3VsdC5kYXRhLmR1cmF0aW9uTXMsXG4gICAgICAgICAgICAgICAgfSwgYEdhbWUgY2FudmFzIHJlY29yZGluZyBzYXZlZCB0byAke3BlcnNpc3RlZC5maWxlUGF0aH0gKCR7cGVyc2lzdGVkLnNpemV9IGJ5dGVzLCAke3Jlc3VsdC5kYXRhLmR1cmF0aW9uTXN9bXMpYCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG9rKHsgdHlwZSwgLi4ucmVzdWx0LmRhdGEgfSwgYEdhbWUgY29tbWFuZCAke3R5cGV9IG9rYCk7XG4gICAgfVxuXG4gICAgLy8gdjIuOS54IFQtVjI5LTU6IHRoaW4gd3JhcHBlcnMgYXJvdW5kIGdhbWVfY29tbWFuZCBmb3IgQUkgZXJnb25vbWljcy5cbiAgICAvLyBLZWVwIHRoZSBkaXNwYXRjaCBwYXRoIGlkZW50aWNhbCB0byBnYW1lX2NvbW1hbmQodHlwZT0ncmVjb3JkXyonKSBzb1xuICAgIC8vIHRoZXJlJ3Mgb25seSBvbmUgcGVyc2lzdGVuY2UgcGlwZWxpbmUgYW5kIG9uZSBxdWV1ZS4gQUkgc3RpbGwgcGlja3NcbiAgICAvLyB0aGVzZSB0b29scyBmaXJzdCBiZWNhdXNlIHRoZWlyIHNjaGVtYXMgYXJlIGV4cGxpY2l0LlxuICAgIHByaXZhdGUgYXN5bmMgcmVjb3JkU3RhcnRJbXBsKG1pbWVUeXBlPzogc3RyaW5nLCB2aWRlb0JpdHNQZXJTZWNvbmQ/OiBudW1iZXIsIHRpbWVvdXRNczogbnVtYmVyID0gNTAwMCwgcXVhbGl0eT86IHN0cmluZywgdmlkZW9Db2RlYz86IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGlmIChxdWFsaXR5ICYmIHZpZGVvQml0c1BlclNlY29uZCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbCgncXVhbGl0eSBhbmQgdmlkZW9CaXRzUGVyU2Vjb25kIGFyZSBtdXR1YWxseSBleGNsdXNpdmUnKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBhcmdzOiBhbnkgPSB7fTtcbiAgICAgICAgaWYgKG1pbWVUeXBlKSBhcmdzLm1pbWVUeXBlID0gbWltZVR5cGU7XG4gICAgICAgIGlmICh0eXBlb2YgdmlkZW9CaXRzUGVyU2Vjb25kID09PSAnbnVtYmVyJykgYXJncy52aWRlb0JpdHNQZXJTZWNvbmQgPSB2aWRlb0JpdHNQZXJTZWNvbmQ7XG4gICAgICAgIGlmIChxdWFsaXR5KSBhcmdzLnF1YWxpdHkgPSBxdWFsaXR5O1xuICAgICAgICBpZiAodmlkZW9Db2RlYykgYXJncy52aWRlb0NvZGVjID0gdmlkZW9Db2RlYztcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2FtZUNvbW1hbmRJbXBsKCdyZWNvcmRfc3RhcnQnLCBhcmdzLCB0aW1lb3V0TXMpO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgcmVjb3JkU3RvcEltcGwodGltZW91dE1zOiBudW1iZXIgPSAzMDAwMCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdhbWVDb21tYW5kSW1wbCgncmVjb3JkX3N0b3AnLCB7fSwgdGltZW91dE1zKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdhbWVDbGllbnRTdGF0dXNJbXBsKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBvayhnZXRDbGllbnRTdGF0dXMoKSk7XG4gICAgfVxuXG4gICAgLy8gdjIuNi4xIHJldmlldyBmaXggKGNvZGV4IPCflLQgKyBjbGF1ZGUgVzEpOiBib3VuZCB0aGUgbGVnaXRpbWF0ZSByYW5nZVxuICAgIC8vIG9mIGEgc2NyZWVuc2hvdCBwYXlsb2FkIGJlZm9yZSBkZWNvZGluZyBzbyBhIG1pc2JlaGF2aW5nIC8gbWFsaWNpb3VzXG4gICAgLy8gY2xpZW50IGNhbm5vdCBmaWxsIGRpc2sgYnkgc3RyZWFtaW5nIGFyYml0cmFyeSBiYXNlNjQgYnl0ZXMuXG4gICAgLy8gMzIgTUIgbWF0Y2hlcyB0aGUgZ2xvYmFsIHJlcXVlc3QtYm9keSBjYXAgaW4gbWNwLXNlcnZlci1zZGsudHMgc29cbiAgICAvLyB0aGUgYm9keSB3b3VsZCBhbHJlYWR5IDQxMyBiZWZvcmUgcmVhY2hpbmcgaGVyZSwgYnV0IGFcbiAgICAvLyBiZWx0LWFuZC1icmFjZXMgY2hlY2sgc3RheXMgY2hlYXAuXG4gICAgcHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgTUFYX0dBTUVfU0NSRUVOU0hPVF9CWVRFUyA9IDMyICogMTAyNCAqIDEwMjQ7XG5cbiAgICBwcml2YXRlIHBlcnNpc3RHYW1lU2NyZWVuc2hvdChkYXRhVXJsOiBzdHJpbmcsIF93aWR0aD86IG51bWJlciwgX2hlaWdodD86IG51bWJlcik6IHsgb2s6IHRydWU7IGZpbGVQYXRoOiBzdHJpbmc7IHNpemU6IG51bWJlciB9IHwgeyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmcgfSB7XG4gICAgICAgIGNvbnN0IG0gPSAvXmRhdGE6aW1hZ2VcXC8ocG5nfGpwZWd8d2VicCk7YmFzZTY0LCguKikkL2kuZXhlYyhkYXRhVXJsKTtcbiAgICAgICAgaWYgKCFtKSB7XG4gICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiAnR2FtZURlYnVnQ2xpZW50IHJldHVybmVkIHNjcmVlbnNob3QgZGF0YVVybCBpbiB1bmV4cGVjdGVkIGZvcm1hdCAoZXhwZWN0ZWQgZGF0YTppbWFnZS97cG5nfGpwZWd8d2VicH07YmFzZTY0LC4uLiknIH07XG4gICAgICAgIH1cbiAgICAgICAgLy8gYmFzZTY0LWRlY29kZWQgYnl0ZSBjb3VudCA9IH5jZWlsKGI2NExlbiAqIDMgLyA0KTsgcmVqZWN0IGVhcmx5XG4gICAgICAgIC8vIGJlZm9yZSBhbGxvY2F0aW5nIGEgbXVsdGktR0IgQnVmZmVyLlxuICAgICAgICBjb25zdCBiNjRMZW4gPSBtWzJdLmxlbmd0aDtcbiAgICAgICAgY29uc3QgYXBwcm94Qnl0ZXMgPSBNYXRoLmNlaWwoYjY0TGVuICogMyAvIDQpO1xuICAgICAgICBpZiAoYXBwcm94Qnl0ZXMgPiBEZWJ1Z1Rvb2xzLk1BWF9HQU1FX1NDUkVFTlNIT1RfQllURVMpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGBzY3JlZW5zaG90IHBheWxvYWQgdG9vIGxhcmdlOiB+JHthcHByb3hCeXRlc30gYnl0ZXMgZXhjZWVkcyBjYXAgJHtEZWJ1Z1Rvb2xzLk1BWF9HQU1FX1NDUkVFTlNIT1RfQllURVN9YCB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGV4dCA9IG1bMV0udG9Mb3dlckNhc2UoKSA9PT0gJ2pwZWcnID8gJ2pwZycgOiBtWzFdLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIGNvbnN0IGJ1ZiA9IEJ1ZmZlci5mcm9tKG1bMl0sICdiYXNlNjQnKTtcbiAgICAgICAgaWYgKGJ1Zi5sZW5ndGggPiBEZWJ1Z1Rvb2xzLk1BWF9HQU1FX1NDUkVFTlNIT1RfQllURVMpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGBzY3JlZW5zaG90IHBheWxvYWQgdG9vIGxhcmdlIGFmdGVyIGRlY29kZTogJHtidWYubGVuZ3RofSBieXRlcyBleGNlZWRzIGNhcCAke0RlYnVnVG9vbHMuTUFYX0dBTUVfU0NSRUVOU0hPVF9CWVRFU31gIH07XG4gICAgICAgIH1cbiAgICAgICAgLy8gdjIuNi4xIHJldmlldyBmaXggKGNsYXVkZSBNMiArIGNvZGV4IPCfn6EgKyBnZW1pbmkg8J+foSk6IHJlYWxwYXRoIGJvdGhcbiAgICAgICAgLy8gc2lkZXMgZm9yIGEgdHJ1ZSBjb250YWlubWVudCBjaGVjay4gdjIuOC4wIFQtVjI4LTIgaG9pc3RlZCB0aGlzXG4gICAgICAgIC8vIHBhdHRlcm4gaW50byByZXNvbHZlQXV0b0NhcHR1cmVGaWxlKCkgc28gc2NyZWVuc2hvdCgpIC8gY2FwdHVyZS1cbiAgICAgICAgLy8gcHJldmlldyAvIGJhdGNoLXNjcmVlbnNob3QgLyBwZXJzaXN0LWdhbWUgc2hhcmUgb25lIGltcGxlbWVudGF0aW9uLlxuICAgICAgICBjb25zdCByZXNvbHZlZCA9IHRoaXMucmVzb2x2ZUF1dG9DYXB0dXJlRmlsZShgZ2FtZS0ke0RhdGUubm93KCl9LiR7ZXh0fWApO1xuICAgICAgICBpZiAoIXJlc29sdmVkLm9rKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiByZXNvbHZlZC5lcnJvciB9O1xuICAgICAgICBmcy53cml0ZUZpbGVTeW5jKHJlc29sdmVkLmZpbGVQYXRoLCBidWYpO1xuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSwgZmlsZVBhdGg6IHJlc29sdmVkLmZpbGVQYXRoLCBzaXplOiBidWYubGVuZ3RoIH07XG4gICAgfVxuXG4gICAgLy8gdjIuOS54IFQtVjI5LTU6IHNhbWUgc2hhcGUgYXMgcGVyc2lzdEdhbWVTY3JlZW5zaG90IGJ1dCBmb3IgdmlkZW9cbiAgICAvLyByZWNvcmRpbmdzICh3ZWJtL21wNCkgcmV0dXJuZWQgYnkgcmVjb3JkX3N0b3AuIFJlY29yZGluZ3MgY2FuIHJ1blxuICAgIC8vIHRlbnMgb2Ygc2Vjb25kcyBhbmQgcHJvZHVjZSBzaWduaWZpY2FudGx5IGxhcmdlciBwYXlsb2FkcyB0aGFuXG4gICAgLy8gc3RpbGxzLlxuICAgIC8vXG4gICAgLy8gdjIuOS41IHJldmlldyBmaXggKEdlbWluaSDwn5+hICsgQ29kZXgg8J+foSk6IGJ1bXBlZCAzMiDihpIgNjQgTUIgdG9cbiAgICAvLyBhY2NvbW1vZGF0ZSBoaWdoZXItYml0cmF0ZSAvIGxvbmdlciByZWNvcmRpbmdzICg1LTIwIE1icHMgw5cgMzAtNjBzXG4gICAgLy8gPSAxOC0xNTAgTUIpLiBLZXB0IGluIHN5bmMgd2l0aCBNQVhfUkVRVUVTVF9CT0RZX0JZVEVTIGluXG4gICAgLy8gbWNwLXNlcnZlci1zZGsudHM7IGxvd2VyIG9uZSB0byBkaWFsIGJhY2sgaWYgbWVtb3J5IHByZXNzdXJlXG4gICAgLy8gYmVjb21lcyBhIGNvbmNlcm4uIGJhc2U2NC1kZWNvZGVkIGJ5dGUgY291bnQgaXMgcmVqZWN0ZWQgcHJlLWRlY29kZVxuICAgIC8vIHRvIGF2b2lkIEJ1ZmZlciBhbGxvY2F0aW9uIHNwaWtlcyBvbiBtYWxpY2lvdXMgY2xpZW50cy5cbiAgICBwcml2YXRlIHN0YXRpYyByZWFkb25seSBNQVhfR0FNRV9SRUNPUkRJTkdfQllURVMgPSA2NCAqIDEwMjQgKiAxMDI0O1xuXG4gICAgcHJpdmF0ZSBwZXJzaXN0R2FtZVJlY29yZGluZyhkYXRhVXJsOiBzdHJpbmcpOiB7IG9rOiB0cnVlOyBmaWxlUGF0aDogc3RyaW5nOyBzaXplOiBudW1iZXIgfSB8IHsgb2s6IGZhbHNlOyBlcnJvcjogc3RyaW5nIH0ge1xuICAgICAgICAvLyB2Mi45LjUgcmV2aWV3IGZpeCBhdHRlbXB0IDEgdXNlZCBgKCg/OjtbXixdKj8pKilgIOKAlCBzdGlsbFxuICAgICAgICAvLyByZWplY3RlZCBhdCBjb2RlYy1pbnRlcm5hbCBjb21tYXMgKGUuZy4gYGNvZGVjcz12cDksb3B1c2ApXG4gICAgICAgIC8vIGJlY2F1c2UgdGhlIHBlci1wYXJhbSBgW14sXSpgIGV4Y2x1ZGVzIGNvbW1hcyBpbnNpZGUgYW55IG9uZVxuICAgICAgICAvLyBwYXJhbSdzIHZhbHVlLiB2Mi45LjYgcm91bmQtMiBmaXggKEdlbWluaSDwn5S0ICsgQ2xhdWRlIPCflLQgK1xuICAgICAgICAvLyBDb2RleCDwn5S0IOKAlCAzLXJldmlld2VyIGNvbnNlbnN1cyk6IHNwbGl0IG9uIHRoZSB1bmFtYmlndW91c1xuICAgICAgICAvLyBgO2Jhc2U2NCxgIHRlcm1pbmF0b3IsIGFjY2VwdCBBTlkgY2hhcmFjdGVycyBpbiB0aGUgcGFyYW1ldGVyXG4gICAgICAgIC8vIHNlZ21lbnQsIGFuZCB2YWxpZGF0ZSB0aGUgcGF5bG9hZCBzZXBhcmF0ZWx5IGFzIGJhc2U2NFxuICAgICAgICAvLyBhbHBoYWJldCBvbmx5IChDb2RleCByMiBzaW5nbGUt8J+foSBwcm9tb3RlZCkuXG4gICAgICAgIC8vXG4gICAgICAgIC8vIFVzZSBsYXN0SW5kZXhPZiBmb3IgdGhlIGA7YmFzZTY0LGAgYm91bmRhcnkgc28gYSBwYXJhbSB2YWx1ZVxuICAgICAgICAvLyB0aGF0IGhhcHBlbnMgdG8gY29udGFpbiB0aGUgbGl0ZXJhbCBzdWJzdHJpbmcgYDtiYXNlNjQsYCAodmVyeVxuICAgICAgICAvLyB1bmxpa2VseSBidXQgbGVnYWwgaW4gTUlNRSBSRkMpIGlzIHN0aWxsIHBhcnNlZCBjb3JyZWN0bHkg4oCUXG4gICAgICAgIC8vIHRoZSBhY3R1YWwgYmFzZTY0IGFsd2F5cyBlbmRzIHRoZSBVUkwuXG4gICAgICAgIGNvbnN0IG0gPSAvXmRhdGE6dmlkZW9cXC8od2VibXxtcDQpKFteXSo/KTtiYXNlNjQsKFtBLVphLXowLTkrL10qPXswLDJ9KSQvaS5leGVjKGRhdGFVcmwpO1xuICAgICAgICBpZiAoIW0pIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6ICdHYW1lRGVidWdDbGllbnQgcmV0dXJuZWQgcmVjb3JkaW5nIGRhdGFVcmwgaW4gdW5leHBlY3RlZCBmb3JtYXQgKGV4cGVjdGVkIGRhdGE6dmlkZW8ve3dlYm18bXA0fVs7Y29kZWNzPS4uLl07YmFzZTY0LDxiYXNlNjQ+KS4gVGhlIGJhc2U2NCBzZWdtZW50IG11c3QgYmUgYSB2YWxpZCBiYXNlNjQgYWxwaGFiZXQgc3RyaW5nLicgfTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBiNjRMZW4gPSBtWzNdLmxlbmd0aDtcbiAgICAgICAgY29uc3QgYXBwcm94Qnl0ZXMgPSBNYXRoLmNlaWwoYjY0TGVuICogMyAvIDQpO1xuICAgICAgICBpZiAoYXBwcm94Qnl0ZXMgPiBEZWJ1Z1Rvb2xzLk1BWF9HQU1FX1JFQ09SRElOR19CWVRFUykge1xuICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogYHJlY29yZGluZyBwYXlsb2FkIHRvbyBsYXJnZTogfiR7YXBwcm94Qnl0ZXN9IGJ5dGVzIGV4Y2VlZHMgY2FwICR7RGVidWdUb29scy5NQVhfR0FNRV9SRUNPUkRJTkdfQllURVN9LiBMb3dlciB2aWRlb0JpdHNQZXJTZWNvbmQgb3IgcmVkdWNlIHJlY29yZGluZyBkdXJhdGlvbi5gIH07XG4gICAgICAgIH1cbiAgICAgICAgLy8gbVsxXSBpcyBhbHJlYWR5IHRoZSBiYXJlICd3ZWJtJ3wnbXA0JzsgbVsyXSBpcyB0aGUgcGFyYW0gdGFpbFxuICAgICAgICAvLyAoYDtjb2RlY3M9Li4uYCwgbWF5IGluY2x1ZGUgY29kZWMtaW50ZXJuYWwgY29tbWFzKTsgbVszXSBpcyB0aGVcbiAgICAgICAgLy8gdmFsaWRhdGVkIGJhc2U2NCBwYXlsb2FkLlxuICAgICAgICBjb25zdCBleHQgPSBtWzFdLnRvTG93ZXJDYXNlKCkgPT09ICdtcDQnID8gJ21wNCcgOiAnd2VibSc7XG4gICAgICAgIGNvbnN0IGJ1ZiA9IEJ1ZmZlci5mcm9tKG1bM10sICdiYXNlNjQnKTtcbiAgICAgICAgaWYgKGJ1Zi5sZW5ndGggPiBEZWJ1Z1Rvb2xzLk1BWF9HQU1FX1JFQ09SRElOR19CWVRFUykge1xuICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogYHJlY29yZGluZyBwYXlsb2FkIHRvbyBsYXJnZSBhZnRlciBkZWNvZGU6ICR7YnVmLmxlbmd0aH0gYnl0ZXMgZXhjZWVkcyBjYXAgJHtEZWJ1Z1Rvb2xzLk1BWF9HQU1FX1JFQ09SRElOR19CWVRFU31gIH07XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcmVzb2x2ZWQgPSB0aGlzLnJlc29sdmVBdXRvQ2FwdHVyZUZpbGUoYHJlY29yZGluZy0ke0RhdGUubm93KCl9LiR7ZXh0fWApO1xuICAgICAgICBpZiAoIXJlc29sdmVkLm9rKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiByZXNvbHZlZC5lcnJvciB9O1xuICAgICAgICBmcy53cml0ZUZpbGVTeW5jKHJlc29sdmVkLmZpbGVQYXRoLCBidWYpO1xuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSwgZmlsZVBhdGg6IHJlc29sdmVkLmZpbGVQYXRoLCBzaXplOiBidWYubGVuZ3RoIH07XG4gICAgfVxuXG4gICAgLy8gdjIuNC44IEExOiBUUyBkaWFnbm9zdGljcyBoYW5kbGVycyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgICBwcml2YXRlIGFzeW5jIHdhaXRDb21waWxlSW1wbCh0aW1lb3V0TXM6IG51bWJlciA9IDE1MDAwKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgcHJvamVjdFBhdGggPSBFZGl0b3I/LlByb2plY3Q/LnBhdGg7XG4gICAgICAgIGlmICghcHJvamVjdFBhdGgpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKCd3YWl0X2NvbXBpbGU6IGVkaXRvciBjb250ZXh0IHVuYXZhaWxhYmxlIChubyBFZGl0b3IuUHJvamVjdC5wYXRoKScpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHdhaXRGb3JDb21waWxlKHByb2plY3RQYXRoLCB0aW1lb3V0TXMpO1xuICAgICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChyZXN1bHQuZXJyb3IgPz8gJ3dhaXRfY29tcGlsZSBmYWlsZWQnLCByZXN1bHQpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBvayhyZXN1bHQsIHJlc3VsdC5jb21waWxlZFxuICAgICAgICAgICAgICAgID8gYENvbXBpbGUgZmluaXNoZWQgaW4gJHtyZXN1bHQud2FpdGVkTXN9bXNgXG4gICAgICAgICAgICAgICAgOiAocmVzdWx0Lm5vdGUgPz8gJ05vIGNvbXBpbGUgdHJpZ2dlcmVkIG9yIHRpbWVkIG91dCcpKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHJ1blNjcmlwdERpYWdub3N0aWNzSW1wbCh0c2NvbmZpZ1BhdGg/OiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBwcm9qZWN0UGF0aCA9IEVkaXRvcj8uUHJvamVjdD8ucGF0aDtcbiAgICAgICAgaWYgKCFwcm9qZWN0UGF0aCkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ3J1bl9zY3JpcHRfZGlhZ25vc3RpY3M6IGVkaXRvciBjb250ZXh0IHVuYXZhaWxhYmxlIChubyBFZGl0b3IuUHJvamVjdC5wYXRoKScpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJ1blNjcmlwdERpYWdub3N0aWNzKHByb2plY3RQYXRoLCB7IHRzY29uZmlnUGF0aCB9KTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHN1Y2Nlc3M6IHJlc3VsdC5vayxcbiAgICAgICAgICAgIG1lc3NhZ2U6IHJlc3VsdC5zdW1tYXJ5LFxuICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgIHRvb2w6IHJlc3VsdC50b29sLFxuICAgICAgICAgICAgICAgIGJpbmFyeTogcmVzdWx0LmJpbmFyeSxcbiAgICAgICAgICAgICAgICB0c2NvbmZpZ1BhdGg6IHJlc3VsdC50c2NvbmZpZ1BhdGgsXG4gICAgICAgICAgICAgICAgZXhpdENvZGU6IHJlc3VsdC5leGl0Q29kZSxcbiAgICAgICAgICAgICAgICBkaWFnbm9zdGljczogcmVzdWx0LmRpYWdub3N0aWNzLFxuICAgICAgICAgICAgICAgIGRpYWdub3N0aWNDb3VudDogcmVzdWx0LmRpYWdub3N0aWNzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAvLyB2Mi40LjkgcmV2aWV3IGZpeDogc3Bhd24gZmFpbHVyZXMgKGJpbmFyeSBtaXNzaW5nIC9cbiAgICAgICAgICAgICAgICAvLyBwZXJtaXNzaW9uIGRlbmllZCkgc3VyZmFjZWQgZXhwbGljaXRseSBzbyBBSSBjYW5cbiAgICAgICAgICAgICAgICAvLyBkaXN0aW5ndWlzaCBcInRzYyBuZXZlciByYW5cIiBmcm9tIFwidHNjIGZvdW5kIGVycm9yc1wiLlxuICAgICAgICAgICAgICAgIHNwYXduRmFpbGVkOiByZXN1bHQuc3Bhd25GYWlsZWQgPT09IHRydWUsXG4gICAgICAgICAgICAgICAgc3lzdGVtRXJyb3I6IHJlc3VsdC5zeXN0ZW1FcnJvcixcbiAgICAgICAgICAgICAgICAvLyBUcnVuY2F0ZSByYXcgc3RyZWFtcyB0byBrZWVwIHRvb2wgcmVzdWx0IHJlYXNvbmFibGU7XG4gICAgICAgICAgICAgICAgLy8gZnVsbCBjb250ZW50IHJhcmVseSB1c2VmdWwgd2hlbiB0aGUgcGFyc2VyIGFscmVhZHlcbiAgICAgICAgICAgICAgICAvLyBzdHJ1Y3R1cmVkIHRoZSBlcnJvcnMuXG4gICAgICAgICAgICAgICAgc3Rkb3V0VGFpbDogcmVzdWx0LnN0ZG91dC5zbGljZSgtMjAwMCksXG4gICAgICAgICAgICAgICAgc3RkZXJyVGFpbDogcmVzdWx0LnN0ZGVyci5zbGljZSgtMjAwMCksXG4gICAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2V0U2NyaXB0RGlhZ25vc3RpY0NvbnRleHRJbXBsKFxuICAgICAgICBmaWxlOiBzdHJpbmcsXG4gICAgICAgIGxpbmU6IG51bWJlcixcbiAgICAgICAgY29udGV4dExpbmVzOiBudW1iZXIgPSA1LFxuICAgICk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHByb2plY3RQYXRoID0gRWRpdG9yPy5Qcm9qZWN0Py5wYXRoO1xuICAgICAgICBpZiAoIXByb2plY3RQYXRoKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbCgnZ2V0X3NjcmlwdF9kaWFnbm9zdGljX2NvbnRleHQ6IGVkaXRvciBjb250ZXh0IHVuYXZhaWxhYmxlJyk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gdjIuOS54IHBvbGlzaCAoR2VtaW5pIHIyIHNpbmdsZS3wn5+hIGZyb20gdjIuOC4xIHJldmlldyk6IGNvbnZlcmdlXG4gICAgICAgIC8vIG9uIGFzc2VydFNhdmVQYXRoV2l0aGluUHJvamVjdC4gVGhlIHByZXZpb3VzIGJlc3Bva2UgcmVhbHBhdGhcbiAgICAgICAgLy8gKyB0b0xvd2VyQ2FzZSArIHBhdGguc2VwIGNoZWNrIGlzIGZ1bmN0aW9uYWxseSBzdWJzdW1lZCBieSB0aGVcbiAgICAgICAgLy8gc2hhcmVkIGhlbHBlciAod2hpY2ggaXRzZWxmIG1vdmVkIHRvIHRoZSBwYXRoLnJlbGF0aXZlLWJhc2VkXG4gICAgICAgIC8vIGlzUGF0aFdpdGhpblJvb3QgaW4gdjIuOS54IHBvbGlzaCAjMSwgaGFuZGxpbmcgZHJpdmUtcm9vdCBhbmRcbiAgICAgICAgLy8gcHJlZml4LWNvbGxpc2lvbiBlZGdlcyB1bmlmb3JtbHkpLlxuICAgICAgICBjb25zdCBndWFyZCA9IHRoaXMuYXNzZXJ0U2F2ZVBhdGhXaXRoaW5Qcm9qZWN0KGZpbGUpO1xuICAgICAgICBpZiAoIWd1YXJkLm9rKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChgZ2V0X3NjcmlwdF9kaWFnbm9zdGljX2NvbnRleHQ6ICR7Z3VhcmQuZXJyb3J9YCk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcmVzb2x2ZWQgPSBndWFyZC5yZXNvbHZlZFBhdGg7XG4gICAgICAgIGlmICghZnMuZXhpc3RzU3luYyhyZXNvbHZlZCkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGBnZXRfc2NyaXB0X2RpYWdub3N0aWNfY29udGV4dDogZmlsZSBub3QgZm91bmQ6ICR7cmVzb2x2ZWR9YCk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qgc3RhdCA9IGZzLnN0YXRTeW5jKHJlc29sdmVkKTtcbiAgICAgICAgaWYgKHN0YXQuc2l6ZSA+IDUgKiAxMDI0ICogMTAyNCkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoYGdldF9zY3JpcHRfZGlhZ25vc3RpY19jb250ZXh0OiBmaWxlIHRvbyBsYXJnZSAoJHtzdGF0LnNpemV9IGJ5dGVzKTsgcmVmdXNpbmcgdG8gcmVhZC5gKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBjb250ZW50ID0gZnMucmVhZEZpbGVTeW5jKHJlc29sdmVkLCAndXRmOCcpO1xuICAgICAgICBjb25zdCBhbGxMaW5lcyA9IGNvbnRlbnQuc3BsaXQoL1xccj9cXG4vKTtcbiAgICAgICAgaWYgKGxpbmUgPCAxIHx8IGxpbmUgPiBhbGxMaW5lcy5sZW5ndGgpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGBnZXRfc2NyaXB0X2RpYWdub3N0aWNfY29udGV4dDogbGluZSAke2xpbmV9IG91dCBvZiByYW5nZSAxLi4ke2FsbExpbmVzLmxlbmd0aH1gKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBzdGFydCA9IE1hdGgubWF4KDEsIGxpbmUgLSBjb250ZXh0TGluZXMpO1xuICAgICAgICBjb25zdCBlbmQgPSBNYXRoLm1pbihhbGxMaW5lcy5sZW5ndGgsIGxpbmUgKyBjb250ZXh0TGluZXMpO1xuICAgICAgICBjb25zdCB3aW5kb3cgPSBhbGxMaW5lcy5zbGljZShzdGFydCAtIDEsIGVuZCk7XG4gICAgICAgIGNvbnN0IHByb2plY3RSZXNvbHZlZE5vcm0gPSBwYXRoLnJlc29sdmUocHJvamVjdFBhdGgpO1xuICAgICAgICByZXR1cm4gb2soe1xuICAgICAgICAgICAgICAgIGZpbGU6IHBhdGgucmVsYXRpdmUocHJvamVjdFJlc29sdmVkTm9ybSwgcmVzb2x2ZWQpLFxuICAgICAgICAgICAgICAgIGFic29sdXRlUGF0aDogcmVzb2x2ZWQsXG4gICAgICAgICAgICAgICAgdGFyZ2V0TGluZTogbGluZSxcbiAgICAgICAgICAgICAgICBzdGFydExpbmU6IHN0YXJ0LFxuICAgICAgICAgICAgICAgIGVuZExpbmU6IGVuZCxcbiAgICAgICAgICAgICAgICB0b3RhbExpbmVzOiBhbGxMaW5lcy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgbGluZXM6IHdpbmRvdy5tYXAoKHRleHQsIGkpID0+ICh7IGxpbmU6IHN0YXJ0ICsgaSwgdGV4dCB9KSksXG4gICAgICAgICAgICB9LCBgUmVhZCAke3dpbmRvdy5sZW5ndGh9IGxpbmVzIG9mIGNvbnRleHQgYXJvdW5kICR7cGF0aC5yZWxhdGl2ZShwcm9qZWN0UmVzb2x2ZWROb3JtLCByZXNvbHZlZCl9OiR7bGluZX1gKTtcbiAgICB9XG59XG4iXX0=