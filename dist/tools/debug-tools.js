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
        return this.getNodeTreeImpl(args.rootUuid, args.maxDepth, args.maxNodes, args.summaryOnly);
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
    async getNodeTreeImpl(rootUuid, maxDepth = 10, maxNodes = 2000, summaryOnly = false) {
        return new Promise((resolve) => {
            const counter = { count: 0 };
            const truncation = { truncated: false, truncatedBy: undefined };
            const buildTree = async (nodeUuid, depth = 0) => {
                var _a, _b, _c;
                try {
                    const nodeData = await Editor.Message.request('scene', 'query-node', nodeUuid);
                    counter.count++;
                    const tree = Object.assign({ uuid: nodeData.uuid, name: nodeData.name, active: nodeData.active, components: nodeData.components ? nodeData.components.map((c) => c.__type__) : [], childCount: nodeData.children ? nodeData.children.length : 0 }, (summaryOnly ? {} : { children: [] }));
                    if (!summaryOnly && tree.childCount > 0 && depth >= maxDepth - 1) {
                        truncation.truncated = true;
                        (_a = truncation.truncatedBy) !== null && _a !== void 0 ? _a : (truncation.truncatedBy = 'maxDepth');
                        tree.truncated = true;
                        tree.truncatedBy = 'maxDepth';
                        return tree;
                    }
                    if (!summaryOnly && tree.childCount > 0 && counter.count >= maxNodes) {
                        truncation.truncated = true;
                        (_b = truncation.truncatedBy) !== null && _b !== void 0 ? _b : (truncation.truncatedBy = 'maxNodes');
                        tree.truncated = true;
                        tree.truncatedBy = 'maxNodes';
                        return tree;
                    }
                    if (!summaryOnly && nodeData.children && nodeData.children.length > 0) {
                        tree.children = await Promise.all(nodeData.children.map((childId) => buildTree(childId, depth + 1)));
                        if (counter.count >= maxNodes) {
                            truncation.truncated = true;
                            (_c = truncation.truncatedBy) !== null && _c !== void 0 ? _c : (truncation.truncatedBy = 'maxNodes');
                        }
                    }
                    return tree;
                }
                catch (err) {
                    return { error: err.message };
                }
            };
            const respond = (data) => {
                const response = (0, response_1.ok)(data);
                response.truncated = truncation.truncated;
                if (truncation.truncatedBy)
                    response.truncatedBy = truncation.truncatedBy;
                response.nodeCount = counter.count;
                response.maxDepth = maxDepth;
                response.maxNodes = maxNodes;
                response.summaryOnly = summaryOnly;
                resolve(response);
            };
            if (rootUuid) {
                buildTree(rootUuid).then(tree => {
                    respond(tree);
                });
            }
            else {
                Editor.Message.request('scene', 'query-hierarchy').then(async (hierarchy) => {
                    const trees = await Promise.all(hierarchy.children.map((rootNode) => buildTree(rootNode.uuid)));
                    respond(trees);
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
            maxDepth: schema_1.z.number().int().positive().default(10).describe('Maximum tree depth. Default 10; large values can return a lot of data.'),
            maxNodes: schema_1.z.number().int().positive().default(2000).describe('Maximum nodes to include before truncating traversal. Default 2000.'),
            summaryOnly: schema_1.z.boolean().default(false).describe('Return childCount without per-node children arrays. Default false.'),
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWctdG9vbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvdG9vbHMvZGVidWctdG9vbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsOENBQTJDO0FBRzNDLGtEQUFzRjtBQUN0Rix3REFBa0U7QUFDbEUsMENBQWtDO0FBQ2xDLGtEQUF1RTtBQUN2RSwwREFBNkU7QUFDN0Usa0VBQWtHO0FBQ2xHLHNEQUFtRTtBQUNuRSx1Q0FBeUI7QUFDekIsMkNBQTZCO0FBRTdCLGtFQUFrRTtBQUNsRSx3RUFBd0U7QUFDeEUseUVBQXlFO0FBQ3pFLGtFQUFrRTtBQUNsRSxpQ0FBaUM7QUFDakMsRUFBRTtBQUNGLGtFQUFrRTtBQUNsRSxtRUFBbUU7QUFDbkUsNkRBQTZEO0FBQzdELGtFQUFrRTtBQUNsRSxxRUFBcUU7QUFDckUsc0VBQXNFO0FBQ3RFLG1FQUFtRTtBQUNuRSw4REFBOEQ7QUFDOUQsbUVBQW1FO0FBQ25FLDhEQUE4RDtBQUM5RCw0Q0FBNEM7QUFDNUMsU0FBUyxnQkFBZ0IsQ0FBQyxTQUFpQixFQUFFLElBQVk7SUFDckQsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUN4QyxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ25DLElBQUksT0FBTyxLQUFLLE9BQU87UUFBRSxPQUFPLElBQUksQ0FBQztJQUNyQyxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sRUFBRSxPQUFPLENBQUMsQ0FBQztJQUM1QyxJQUFJLENBQUMsR0FBRztRQUFFLE9BQU8sSUFBSSxDQUFDLENBQThCLFlBQVk7SUFDaEUscUVBQXFFO0lBQ3JFLGtFQUFrRTtJQUNsRSxvRUFBb0U7SUFDcEUsNkNBQTZDO0lBQzdDLElBQUksR0FBRyxLQUFL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K0I7UUFDckMsS0FBSyxFQUFFLHlCQUF5QjtRQUNoQyxXQUFXLEVBQUUsaU9BQWlPO1FBQzlPLFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDO1lBQ2xCLElBQUksRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLHVKQUF1SixDQUFDO1lBQ2xMLElBQUksRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxvREFBb0QsQ0FBQztZQUN0RixZQUFZLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQywrRkFBK0YsQ0FBQztTQUMvSixDQUFDO0tBQ2IsQ0FBQzs0REFHRCIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IG9rLCBmYWlsIH0gZnJvbSAnLi4vbGliL3Jlc3BvbnNlJztcbmltcG9ydCB0eXBlIHsgVG9vbERlZmluaXRpb24sIFRvb2xSZXNwb25zZSwgVG9vbEV4ZWN1dG9yLCBQZXJmb3JtYW5jZVN0YXRzLCBWYWxpZGF0aW9uUmVzdWx0LCBWYWxpZGF0aW9uSXNzdWUgfSBmcm9tICcuLi90eXBlcyc7XG5pbXBvcnQgeyBkZWJ1Z0xvZyB9IGZyb20gJy4uL2xpYi9sb2cnO1xuaW1wb3J0IHsgZmlsdGVyQnlMZXZlbCwgZmlsdGVyQnlLZXl3b3JkLCBzZWFyY2hXaXRoQ29udGV4dCB9IGZyb20gJy4uL2xpYi9sb2ctcGFyc2VyJztcbmltcG9ydCB7IGlzRWRpdG9yQ29udGV4dEV2YWxFbmFibGVkIH0gZnJvbSAnLi4vbGliL3J1bnRpbWUtZmxhZ3MnO1xuaW1wb3J0IHsgeiB9IGZyb20gJy4uL2xpYi9zY2hlbWEnO1xuaW1wb3J0IHsgbWNwVG9vbCwgZGVmaW5lVG9vbHNGcm9tRGVjb3JhdG9ycyB9IGZyb20gJy4uL2xpYi9kZWNvcmF0b3JzJztcbmltcG9ydCB7IHJ1blNjcmlwdERpYWdub3N0aWNzLCB3YWl0Rm9yQ29tcGlsZSB9IGZyb20gJy4uL2xpYi90cy1kaWFnbm9zdGljcyc7XG5pbXBvcnQgeyBxdWV1ZUdhbWVDb21tYW5kLCBhd2FpdENvbW1hbmRSZXN1bHQsIGdldENsaWVudFN0YXR1cyB9IGZyb20gJy4uL2xpYi9nYW1lLWNvbW1hbmQtcXVldWUnO1xuaW1wb3J0IHsgcnVuU2NlbmVNZXRob2RBc1Rvb2xSZXNwb25zZSB9IGZyb20gJy4uL2xpYi9zY2VuZS1icmlkZ2UnO1xuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcblxuLy8gdjIuOS54IHBvbGlzaDogY29udGFpbm1lbnQgaGVscGVyIHRoYXQgaGFuZGxlcyBkcml2ZS1yb290IGVkZ2VzXG4vLyAoQzpcXCksIHByZWZpeC1jb2xsaXNpb24gKEM6XFxmb28gdnMgQzpcXGZvb2JhciksIGFuZCBjcm9zcy12b2x1bWUgcGF0aHNcbi8vIChEOlxcLi4uIHdoZW4gcm9vdCBpcyBDOlxcKS4gVXNlcyBwYXRoLnJlbGF0aXZlIHdoaWNoIHJldHVybnMgYSByZWxhdGl2ZVxuLy8gZXhwcmVzc2lvbiDigJQgaWYgdGhlIHJlc3VsdCBzdGFydHMgd2l0aCBgLi5gIG9yIGlzIGFic29sdXRlLCB0aGVcbi8vIGNhbmRpZGF0ZSBpcyBvdXRzaWRlIHRoZSByb290LlxuLy9cbi8vIFRPQ1RPVSBub3RlIChDb2RleCByMSArIEdlbWluaSByMSBzaW5nbGUt8J+foSBmcm9tIHYyLjguMSByZXZpZXcsXG4vLyByZXZpZXdlZCB2Mi45LnggYW5kIGFjY2VwdGVkIGFzIHJlc2lkdWFsIHJpc2spOiB0aGVyZSBpcyBhIHNtYWxsXG4vLyByYWNlIHdpbmRvdyBiZXR3ZWVuIHJlYWxwYXRoU3luYyBjb250YWlubWVudCBjaGVjayBhbmQgdGhlXG4vLyBzdWJzZXF1ZW50IHdyaXRlRmlsZVN5bmMg4oCUIGEgbWFsaWNpb3VzIHN5bWxpbmsgc3dhcCBkdXJpbmcgdGhhdFxuLy8gd2luZG93IGNvdWxkIGVzY2FwZS4gRnVsbCBtaXRpZ2F0aW9uIG5lZWRzIE9fTk9GT0xMT1cgd2hpY2ggTm9kZSdzXG4vLyBmcyBBUEkgZG9lc24ndCBleHBvc2UgZGlyZWN0bHkuIEdpdmVuIHRoaXMgaXMgYSBsb2NhbCBkZXYgdG9vbCwgbm90XG4vLyBhIG5ldHdvcmstZmFjaW5nIHNlcnZpY2UsIGFuZCB0aGUgYXR0YWNrIHdpbmRvdyBpcyBtaWNyb3NlY29uZHMsXG4vLyB0aGUgcmlzayBpcyBhY2NlcHRlZCBmb3Igbm93LiBBIGZ1dHVyZSB2Mi54IHBhdGNoIGNvdWxkIGFkZFxuLy8gYGZzLm9wZW5TeW5jKGZpbGVQYXRoLCAnd3gnKWAgZm9yIEFVVE8tbmFtZWQgcGF0aHMgb25seSAoY2FsbGVyLVxuLy8gcHJvdmlkZWQgc2F2ZVBhdGggbmVlZHMgb3ZlcndyaXRlIHNlbWFudGljcykuIERvbid0IHJlbHkgb25cbi8vIGNvbnRhaW5tZW50IGZvciBzZWN1cml0eS1jcml0aWNhbCB3cml0ZXMuXG5mdW5jdGlvbiBpc1BhdGhXaXRoaW5Sb290KGNhbmRpZGF0ZTogc3RyaW5nLCByb290OiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICBjb25zdCBjYW5kQWJzID0gcGF0aC5yZXNvbHZlKGNhbmRpZGF0ZSk7XG4gICAgY29uc3Qgcm9vdEFicyA9IHBhdGgucmVzb2x2ZShyb290KTtcbiAgICBpZiAoY2FuZEFicyA9PT0gcm9vdEFicykgcmV0dXJuIHRydWU7XG4gICAgY29uc3QgcmVsID0gcGF0aC5yZWxhdGl2ZShyb290QWJzLCBjYW5kQWJzKTtcbiAgICBpZiAoIXJlbCkgcmV0dXJuIHRydWU7ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gaWRlbnRpY2FsXG4gICAgLy8gdjIuOS41IHJldmlldyBmaXggKENvZGV4IPCfn6EpOiBzdGFydHNXaXRoKCcuLicpIHdvdWxkIGFsc28gcmVqZWN0IGFcbiAgICAvLyBsZWdpdGltYXRlIGNoaWxkIHdob3NlIGZpcnN0IHBhdGggc2VnbWVudCBsaXRlcmFsbHkgc3RhcnRzIHdpdGhcbiAgICAvLyBcIi4uXCIgKGUuZy4gZGlyZWN0b3J5IG5hbWVkIFwiLi5mb29cIikuIE1hdGNoIGVpdGhlciBleGFjdGx5IGAuLmAgb3JcbiAgICAvLyBgLi5gIGZvbGxvd2VkIGJ5IGEgcGF0aCBzZXBhcmF0b3IgaW5zdGVhZC5cbiAgICBpZiAocmVsID09PSAnLi4nIHx8IHJlbC5zdGFydHNXaXRoKCcuLicgKyBwYXRoLnNlcCkpIHJldHVybiBmYWxzZTtcbiAgICBpZiAocGF0aC5pc0Fic29sdXRlKHJlbCkpIHJldHVybiBmYWxzZTsgICAgICAgICAgICAgLy8gZGlmZmVyZW50IGRyaXZlXG4gICAgcmV0dXJuIHRydWU7XG59XG5cbmV4cG9ydCBjbGFzcyBEZWJ1Z1Rvb2xzIGltcGxlbWVudHMgVG9vbEV4ZWN1dG9yIHtcbiAgICBwcml2YXRlIHJlYWRvbmx5IGV4ZWM6IFRvb2xFeGVjdXRvcjtcblxuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICB0aGlzLmV4ZWMgPSBkZWZpbmVUb29sc0Zyb21EZWNvcmF0b3JzKHRoaXMpO1xuICAgIH1cblxuICAgIGdldFRvb2xzKCk6IFRvb2xEZWZpbml0aW9uW10geyByZXR1cm4gdGhpcy5leGVjLmdldFRvb2xzKCk7IH1cbiAgICBleGVjdXRlKHRvb2xOYW1lOiBzdHJpbmcsIGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7IHJldHVybiB0aGlzLmV4ZWMuZXhlY3V0ZSh0b29sTmFtZSwgYXJncyk7IH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnY2xlYXJfY29uc29sZScsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdDbGVhciBjb25zb2xlJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBDbGVhciB0aGUgQ29jb3MgRWRpdG9yIENvbnNvbGUgVUkuIE5vIHByb2plY3Qgc2lkZSBlZmZlY3RzLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSxcbiAgICB9KVxuICAgIGFzeW5jIGNsZWFyQ29uc29sZSgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5jbGVhckNvbnNvbGVJbXBsKCk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICAgICAgICAgIG5hbWU6ICdleGVjdXRlX2phdmFzY3JpcHQnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnRXhlY3V0ZSBKYXZhU2NyaXB0JyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1twcmltYXJ5XSBFeGVjdXRlIEphdmFTY3JpcHQgaW4gc2NlbmUgb3IgZWRpdG9yIGNvbnRleHQuIFVzZSB0aGlzIGFzIHRoZSBkZWZhdWx0IGZpcnN0IHRvb2wgZm9yIGNvbXBvdW5kIG9wZXJhdGlvbnMgKHJlYWQg4oaSIG11dGF0ZSDihpIgdmVyaWZ5KSDigJQgb25lIGNhbGwgcmVwbGFjZXMgNS0xMCBuYXJyb3cgc3BlY2lhbGlzdCB0b29scyBhbmQgYXZvaWRzIHBlci1jYWxsIHRva2VuIG92ZXJoZWFkLiBjb250ZXh0PVwic2NlbmVcIiBpbnNwZWN0cy9tdXRhdGVzIGNjLk5vZGUgZ3JhcGg7IGNvbnRleHQ9XCJlZGl0b3JcIiBydW5zIGluIGhvc3QgcHJvY2VzcyBmb3IgRWRpdG9yLk1lc3NhZ2UgKyBmcyAoZGVmYXVsdCBvZmYsIG9wdC1pbikuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBjb2RlOiB6LnN0cmluZygpLmRlc2NyaWJlKCdKYXZhU2NyaXB0IHNvdXJjZSB0byBleGVjdXRlLiBIYXMgYWNjZXNzIHRvIGNjLiogaW4gc2NlbmUgY29udGV4dCwgRWRpdG9yLiogaW4gZWRpdG9yIGNvbnRleHQuJyksXG4gICAgICAgICAgICAgICAgICAgIGNvbnRleHQ6IHouZW51bShbJ3NjZW5lJywgJ2VkaXRvciddKS5kZWZhdWx0KCdzY2VuZScpLmRlc2NyaWJlKCdFeGVjdXRpb24gc2FuZGJveC4gXCJzY2VuZVwiIHJ1bnMgaW5zaWRlIHRoZSBjb2NvcyBzY2VuZSBzY3JpcHQgY29udGV4dCAoY2MsIGRpcmVjdG9yLCBmaW5kKS4gXCJlZGl0b3JcIiBydW5zIGluIHRoZSBlZGl0b3IgaG9zdCBwcm9jZXNzIChFZGl0b3IsIGFzc2V0LWRiLCBmcywgcmVxdWlyZSkuIEVkaXRvciBjb250ZXh0IGlzIE9GRiBieSBkZWZhdWx0IGFuZCBtdXN0IGJlIG9wdC1pbiB2aWEgcGFuZWwgc2V0dGluZyBgZW5hYmxlRWRpdG9yQ29udGV4dEV2YWxgIOKAlCBhcmJpdHJhcnkgY29kZSBpbiB0aGUgaG9zdCBwcm9jZXNzIGlzIGEgcHJvbXB0LWluamVjdGlvbiByaXNrLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgZXhlY3V0ZUphdmFzY3JpcHQoYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZXhlY3V0ZUphdmFTY3JpcHQoYXJncy5jb2RlLCBhcmdzLmNvbnRleHQgPz8gJ3NjZW5lJyk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICAgICAgICAgIG5hbWU6ICdleGVjdXRlX3NjcmlwdCcsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdSdW4gc2NlbmUgSmF2YVNjcmlwdCcsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdbY29tcGF0XSBTY2VuZS1vbmx5IEphdmFTY3JpcHQgZXZhbC4gUHJlZmVyIGV4ZWN1dGVfamF2YXNjcmlwdCB3aXRoIGNvbnRleHQ9XCJzY2VuZVwiIOKAlCBrZXB0IGFzIGNvbXBhdGliaWxpdHkgZW50cnlwb2ludCBmb3Igb2xkZXIgY2xpZW50cy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHNjcmlwdDogei5zdHJpbmcoKS5kZXNjcmliZSgnSmF2YVNjcmlwdCB0byBleGVjdXRlIGluIHNjZW5lIGNvbnRleHQgdmlhIGNvbnNvbGUvZXZhbC4gQ2FuIHJlYWQgb3IgbXV0YXRlIHRoZSBjdXJyZW50IHNjZW5lLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgZXhlY3V0ZVNjcmlwdChhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5leGVjdXRlU2NyaXB0Q29tcGF0KGFyZ3Muc2NyaXB0KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2dldF9ub2RlX3RyZWUnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnUmVhZCBkZWJ1ZyBub2RlIHRyZWUnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFJlYWQgYSBkZWJ1ZyBub2RlIHRyZWUgZnJvbSBhIHJvb3Qgb3Igc2NlbmUgcm9vdCBmb3IgaGllcmFyY2h5L2NvbXBvbmVudCBpbnNwZWN0aW9uLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgcm9vdFV1aWQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnUm9vdCBub2RlIFVVSUQgdG8gZXhwYW5kLiBPbWl0IHRvIHVzZSB0aGUgY3VycmVudCBzY2VuZSByb290LicpLFxuICAgICAgICAgICAgICAgICAgICBtYXhEZXB0aDogei5udW1iZXIoKS5pbnQoKS5wb3NpdGl2ZSgpLmRlZmF1bHQoMTApLmRlc2NyaWJlKCdNYXhpbXVtIHRyZWUgZGVwdGguIERlZmF1bHQgMTA7IGxhcmdlIHZhbHVlcyBjYW4gcmV0dXJuIGEgbG90IG9mIGRhdGEuJyksXG4gICAgICAgICAgICAgICAgICAgIG1heE5vZGVzOiB6Lm51bWJlcigpLmludCgpLnBvc2l0aXZlKCkuZGVmYXVsdCgyMDAwKS5kZXNjcmliZSgnTWF4aW11bSBub2RlcyB0byBpbmNsdWRlIGJlZm9yZSB0cnVuY2F0aW5nIHRyYXZlcnNhbC4gRGVmYXVsdCAyMDAwLicpLFxuICAgICAgICAgICAgICAgICAgICBzdW1tYXJ5T25seTogei5ib29sZWFuKCkuZGVmYXVsdChmYWxzZSkuZGVzY3JpYmUoJ1JldHVybiBjaGlsZENvdW50IHdpdGhvdXQgcGVyLW5vZGUgY2hpbGRyZW4gYXJyYXlzLiBEZWZhdWx0IGZhbHNlLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgZ2V0Tm9kZVRyZWUoYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0Tm9kZVRyZWVJbXBsKGFyZ3Mucm9vdFV1aWQsIGFyZ3MubWF4RGVwdGgsIGFyZ3MubWF4Tm9kZXMsIGFyZ3Muc3VtbWFyeU9ubHkpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnZ2V0X3BlcmZvcm1hbmNlX3N0YXRzJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1JlYWQgcGVyZm9ybWFuY2Ugc3RhdHMnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFRyeSB0byByZWFkIHNjZW5lIHF1ZXJ5LXBlcmZvcm1hbmNlIHN0YXRzOyBtYXkgcmV0dXJuIHVuYXZhaWxhYmxlIGluIGVkaXQgbW9kZS4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksXG4gICAgfSlcbiAgICBhc3luYyBnZXRQZXJmb3JtYW5jZVN0YXRzKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldFBlcmZvcm1hbmNlU3RhdHNJbXBsKCk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICAgICAgICAgIG5hbWU6ICd2YWxpZGF0ZV9zY2VuZScsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdWYWxpZGF0ZSBjdXJyZW50IHNjZW5lJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBSdW4gYmFzaWMgY3VycmVudC1zY2VuZSBoZWFsdGggY2hlY2tzIGZvciBtaXNzaW5nIGFzc2V0cyBhbmQgbm9kZS1jb3VudCB3YXJuaW5ncy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIGNoZWNrTWlzc2luZ0Fzc2V0czogei5ib29sZWFuKCkuZGVmYXVsdCh0cnVlKS5kZXNjcmliZSgnQ2hlY2sgbWlzc2luZyBhc3NldCByZWZlcmVuY2VzIHdoZW4gdGhlIENvY29zIHNjZW5lIEFQSSBzdXBwb3J0cyBpdC4nKSxcbiAgICAgICAgICAgICAgICAgICAgY2hlY2tQZXJmb3JtYW5jZTogei5ib29sZWFuKCkuZGVmYXVsdCh0cnVlKS5kZXNjcmliZSgnUnVuIGJhc2ljIHBlcmZvcm1hbmNlIGNoZWNrcyBzdWNoIGFzIGhpZ2ggbm9kZSBjb3VudCB3YXJuaW5ncy4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIHZhbGlkYXRlU2NlbmUoYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMudmFsaWRhdGVTY2VuZUltcGwoeyBjaGVja01pc3NpbmdBc3NldHM6IGFyZ3MuY2hlY2tNaXNzaW5nQXNzZXRzLCBjaGVja1BlcmZvcm1hbmNlOiBhcmdzLmNoZWNrUGVyZm9ybWFuY2UgfSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICAgICAgICAgIG5hbWU6ICdnZXRfZWRpdG9yX2luZm8nLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnUmVhZCBlZGl0b3IgaW5mbycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gUmVhZCBFZGl0b3IvQ29jb3MvcHJvamVjdC9wcm9jZXNzIGluZm9ybWF0aW9uIGFuZCBtZW1vcnkgc3VtbWFyeS4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksXG4gICAgfSlcbiAgICBhc3luYyBnZXRFZGl0b3JJbmZvKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldEVkaXRvckluZm9JbXBsKCk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICAgICAgICAgIG5hbWU6ICdnZXRfcHJvamVjdF9sb2dzJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1JlYWQgcHJvamVjdCBsb2dzJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBSZWFkIHRlbXAvbG9ncy9wcm9qZWN0LmxvZyB0YWlsIHdpdGggb3B0aW9uYWwgbGV2ZWwva2V5d29yZCBmaWx0ZXJzLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgbGluZXM6IHoubnVtYmVyKCkubWluKDEpLm1heCgxMDAwMCkuZGVmYXVsdCgxMDApLmRlc2NyaWJlKCdOdW1iZXIgb2YgbGluZXMgdG8gcmVhZCBmcm9tIHRoZSBlbmQgb2YgdGVtcC9sb2dzL3Byb2plY3QubG9nLiBEZWZhdWx0IDEwMC4nKSxcbiAgICAgICAgICAgICAgICAgICAgZmlsdGVyS2V5d29yZDogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdPcHRpb25hbCBjYXNlLWluc2Vuc2l0aXZlIGtleXdvcmQgZmlsdGVyLicpLFxuICAgICAgICAgICAgICAgICAgICBsb2dMZXZlbDogei5lbnVtKFsnRVJST1InLCAnV0FSTicsICdJTkZPJywgJ0RFQlVHJywgJ1RSQUNFJywgJ0FMTCddKS5kZWZhdWx0KCdBTEwnKS5kZXNjcmliZSgnT3B0aW9uYWwgbG9nIGxldmVsIGZpbHRlci4gQUxMIGRpc2FibGVzIGxldmVsIGZpbHRlcmluZy4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIGdldFByb2plY3RMb2dzKGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldFByb2plY3RMb2dzSW1wbChhcmdzLmxpbmVzLCBhcmdzLmZpbHRlcktleXdvcmQsIGFyZ3MubG9nTGV2ZWwpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnZ2V0X2xvZ19maWxlX2luZm8nLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnUmVhZCBsb2cgZmlsZSBpbmZvJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBSZWFkIHRlbXAvbG9ncy9wcm9qZWN0LmxvZyBwYXRoLCBzaXplLCBsaW5lIGNvdW50LCBhbmQgdGltZXN0YW1wcy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksXG4gICAgfSlcbiAgICBhc3luYyBnZXRMb2dGaWxlSW5mbygpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRMb2dGaWxlSW5mb0ltcGwoKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3NlYXJjaF9wcm9qZWN0X2xvZ3MnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnU2VhcmNoIHByb2plY3QgbG9ncycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gU2VhcmNoIHRlbXAvbG9ncy9wcm9qZWN0LmxvZyBmb3Igc3RyaW5nL3JlZ2V4IGFuZCByZXR1cm4gbGluZSBjb250ZXh0LicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgcGF0dGVybjogei5zdHJpbmcoKS5kZXNjcmliZSgnU2VhcmNoIHN0cmluZyBvciByZWdleC4gSW52YWxpZCByZWdleCBpcyB0cmVhdGVkIGFzIGEgbGl0ZXJhbCBzdHJpbmcuJyksXG4gICAgICAgICAgICAgICAgICAgIG1heFJlc3VsdHM6IHoubnVtYmVyKCkubWluKDEpLm1heCgxMDApLmRlZmF1bHQoMjApLmRlc2NyaWJlKCdNYXhpbXVtIG1hdGNoZXMgdG8gcmV0dXJuLiBEZWZhdWx0IDIwLicpLFxuICAgICAgICAgICAgICAgICAgICBjb250ZXh0TGluZXM6IHoubnVtYmVyKCkubWluKDApLm1heCgxMCkuZGVmYXVsdCgyKS5kZXNjcmliZSgnQ29udGV4dCBsaW5lcyBiZWZvcmUvYWZ0ZXIgZWFjaCBtYXRjaC4gRGVmYXVsdCAyLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgc2VhcmNoUHJvamVjdExvZ3MoYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2VhcmNoUHJvamVjdExvZ3NJbXBsKGFyZ3MucGF0dGVybiwgYXJncy5tYXhSZXN1bHRzLCBhcmdzLmNvbnRleHRMaW5lcyk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICAgICAgICAgIG5hbWU6ICdzY3JlZW5zaG90JyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ0NhcHR1cmUgZWRpdG9yIHNjcmVlbnNob3QnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIENhcHR1cmUgdGhlIGZvY3VzZWQgQ29jb3MgRWRpdG9yIHdpbmRvdyAob3IgYSB3aW5kb3cgbWF0Y2hlZCBieSB0aXRsZSkgdG8gYSBQTkcuIFJldHVybnMgc2F2ZWQgZmlsZSBwYXRoLiBVc2UgdGhpcyBmb3IgQUkgdmlzdWFsIHZlcmlmaWNhdGlvbiBhZnRlciBzY2VuZS9VSSBjaGFuZ2VzLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgc2F2ZVBhdGg6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnQWJzb2x1dGUgZmlsZXN5c3RlbSBwYXRoIHRvIHNhdmUgdGhlIFBORy4gTXVzdCByZXNvbHZlIGluc2lkZSB0aGUgY29jb3MgcHJvamVjdCByb290IChjb250YWlubWVudCBjaGVjayB2aWEgcmVhbHBhdGgpLiBPbWl0IHRvIGF1dG8tbmFtZSBpbnRvIDxwcm9qZWN0Pi90ZW1wL21jcC1jYXB0dXJlcy9zY3JlZW5zaG90LTx0aW1lc3RhbXA+LnBuZy4nKSxcbiAgICAgICAgICAgICAgICAgICAgd2luZG93VGl0bGU6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnT3B0aW9uYWwgc3Vic3RyaW5nIG1hdGNoIG9uIHdpbmRvdyB0aXRsZSB0byBwaWNrIGEgc3BlY2lmaWMgRWxlY3Ryb24gd2luZG93LiBEZWZhdWx0OiBmb2N1c2VkIHdpbmRvdy4nKSxcbiAgICAgICAgICAgICAgICAgICAgaW5jbHVkZUJhc2U2NDogei5ib29sZWFuKCkuZGVmYXVsdChmYWxzZSkuZGVzY3JpYmUoJ0VtYmVkIFBORyBieXRlcyBhcyBiYXNlNjQgaW4gcmVzcG9uc2UgZGF0YSAobGFyZ2U7IGRlZmF1bHQgZmFsc2UpLiBXaGVuIGZhbHNlLCBvbmx5IHRoZSBzYXZlZCBmaWxlIHBhdGggaXMgcmV0dXJuZWQuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBzY3JlZW5zaG90KGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLnNjcmVlbnNob3RJbXBsKGFyZ3Muc2F2ZVBhdGgsIGFyZ3Mud2luZG93VGl0bGUsIGFyZ3MuaW5jbHVkZUJhc2U2NCk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICAgICAgICAgIG5hbWU6ICdjYXB0dXJlX3ByZXZpZXdfc2NyZWVuc2hvdCcsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdDYXB0dXJlIHByZXZpZXcgc2NyZWVuc2hvdCcsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gQ2FwdHVyZSB0aGUgY29jb3MgUHJldmlldy1pbi1FZGl0b3IgKFBJRSkgZ2FtZXZpZXcgdG8gYSBQTkcuIENvY29zIGhhcyBtdWx0aXBsZSBQSUUgcmVuZGVyIHRhcmdldHMgZGVwZW5kaW5nIG9uIHRoZSB1c2VyXFwncyBwcmV2aWV3IGNvbmZpZyAoUHJlZmVyZW5jZXMg4oaSIFByZXZpZXcg4oaSIE9wZW4gUHJldmlldyBXaXRoKTogXCJicm93c2VyXCIgb3BlbnMgYW4gZXh0ZXJuYWwgYnJvd3NlciAoTk9UIGNhcHR1cmFibGUgaGVyZSksIFwid2luZG93XCIgLyBcInNpbXVsYXRvclwiIG9wZW5zIGEgc2VwYXJhdGUgRWxlY3Ryb24gd2luZG93ICh0aXRsZSBjb250YWlucyBcIlByZXZpZXdcIiksIFwiZW1iZWRkZWRcIiByZW5kZXJzIHRoZSBnYW1ldmlldyBpbnNpZGUgdGhlIG1haW4gZWRpdG9yIHdpbmRvdy4gVGhlIGRlZmF1bHQgbW9kZT1cImF1dG9cIiB0cmllcyB0aGUgUHJldmlldy10aXRsZWQgd2luZG93IGZpcnN0IGFuZCBmYWxscyBiYWNrIHRvIGNhcHR1cmluZyB0aGUgbWFpbiBlZGl0b3Igd2luZG93IHdoZW4gbm8gUHJldmlldy10aXRsZWQgd2luZG93IGV4aXN0cyAoY292ZXJzIGVtYmVkZGVkIG1vZGUpLiBVc2UgbW9kZT1cIndpbmRvd1wiIHRvIGZvcmNlIHRoZSBzZXBhcmF0ZS13aW5kb3cgc3RyYXRlZ3kgb3IgbW9kZT1cImVtYmVkZGVkXCIgdG8gc2tpcCB0aGUgd2luZG93IHByb2JlLiBQYWlyIHdpdGggZGVidWdfZ2V0X3ByZXZpZXdfbW9kZSB0byByZWFkIHRoZSBjb2NvcyBjb25maWcgYW5kIHJvdXRlIGRldGVybWluaXN0aWNhbGx5LiBGb3IgcnVudGltZSBnYW1lLWNhbnZhcyBwaXhlbC1sZXZlbCBjYXB0dXJlIChjYW1lcmEgUmVuZGVyVGV4dHVyZSksIHVzZSBkZWJ1Z19nYW1lX2NvbW1hbmQodHlwZT1cInNjcmVlbnNob3RcIikgaW5zdGVhZC4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHNhdmVQYXRoOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0Fic29sdXRlIGZpbGVzeXN0ZW0gcGF0aCB0byBzYXZlIHRoZSBQTkcuIE11c3QgcmVzb2x2ZSBpbnNpZGUgdGhlIGNvY29zIHByb2plY3Qgcm9vdCAoY29udGFpbm1lbnQgY2hlY2sgdmlhIHJlYWxwYXRoKS4gT21pdCB0byBhdXRvLW5hbWUgaW50byA8cHJvamVjdD4vdGVtcC9tY3AtY2FwdHVyZXMvcHJldmlldy08dGltZXN0YW1wPi5wbmcuJyksXG4gICAgICAgICAgICAgICAgICAgIG1vZGU6IHouZW51bShbJ2F1dG8nLCAnd2luZG93JywgJ2VtYmVkZGVkJ10pLmRlZmF1bHQoJ2F1dG8nKS5kZXNjcmliZSgnQ2FwdHVyZSB0YXJnZXQuIFwiYXV0b1wiIChkZWZhdWx0KSB0cmllcyBQcmV2aWV3LXRpdGxlZCB3aW5kb3cgdGhlbiBmYWxscyBiYWNrIHRvIHRoZSBtYWluIGVkaXRvciB3aW5kb3cuIFwid2luZG93XCIgb25seSBtYXRjaGVzIFByZXZpZXctdGl0bGVkIHdpbmRvd3MgKGZhaWxzIGlmIG5vbmUpLiBcImVtYmVkZGVkXCIgY2FwdHVyZXMgdGhlIG1haW4gZWRpdG9yIHdpbmRvdyBkaXJlY3RseSAoc2tpcCBQcmV2aWV3LXdpbmRvdyBwcm9iZSkuJyksXG4gICAgICAgICAgICAgICAgICAgIHdpbmRvd1RpdGxlOiB6LnN0cmluZygpLmRlZmF1bHQoJ1ByZXZpZXcnKS5kZXNjcmliZSgnU3Vic3RyaW5nIG1hdGNoZWQgYWdhaW5zdCB3aW5kb3cgdGl0bGVzIGluIHdpbmRvdy9hdXRvIG1vZGVzIChkZWZhdWx0IFwiUHJldmlld1wiIGZvciBQSUUpLiBJZ25vcmVkIGluIGVtYmVkZGVkIG1vZGUuJyksXG4gICAgICAgICAgICAgICAgICAgIGluY2x1ZGVCYXNlNjQ6IHouYm9vbGVhbigpLmRlZmF1bHQoZmFsc2UpLmRlc2NyaWJlKCdFbWJlZCBQTkcgYnl0ZXMgYXMgYmFzZTY0IGluIHJlc3BvbnNlIGRhdGEgKGxhcmdlOyBkZWZhdWx0IGZhbHNlKS4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIGNhcHR1cmVQcmV2aWV3U2NyZWVuc2hvdChhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5jYXB0dXJlUHJldmlld1NjcmVlbnNob3RJbXBsKGFyZ3Muc2F2ZVBhdGgsIGFyZ3MubW9kZSA/PyAnYXV0bycsIGFyZ3Mud2luZG93VGl0bGUsIGFyZ3MuaW5jbHVkZUJhc2U2NCk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICAgICAgICAgIG5hbWU6ICdnZXRfcHJldmlld19tb2RlJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1JlYWQgcHJldmlldyBtb2RlJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBSZWFkIHRoZSBjb2NvcyBwcmV2aWV3IGNvbmZpZ3VyYXRpb24uIFVzZXMgRWRpdG9yLk1lc3NhZ2UgcHJlZmVyZW5jZXMvcXVlcnktY29uZmlnIHNvIEFJIGNhbiByb3V0ZSBkZWJ1Z19jYXB0dXJlX3ByZXZpZXdfc2NyZWVuc2hvdCB0byB0aGUgY29ycmVjdCBtb2RlLiBSZXR1cm5zIHsgaW50ZXJwcmV0ZWQ6IFwiYnJvd3NlclwiIHwgXCJ3aW5kb3dcIiB8IFwic2ltdWxhdG9yXCIgfCBcImVtYmVkZGVkXCIgfCBcInVua25vd25cIiwgcmF3OiA8ZnVsbCBwcmV2aWV3IGNvbmZpZyBkdW1wPiB9LiBVc2UgYmVmb3JlIGNhcHR1cmU6IGlmIGludGVycHJldGVkPVwiZW1iZWRkZWRcIiwgY2FsbCBjYXB0dXJlX3ByZXZpZXdfc2NyZWVuc2hvdCB3aXRoIG1vZGU9XCJlbWJlZGRlZFwiIG9yIHJlbHkgb24gbW9kZT1cImF1dG9cIiBmYWxsYmFjay4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksXG4gICAgfSlcbiAgICBhc3luYyBnZXRQcmV2aWV3TW9kZSgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRQcmV2aWV3TW9kZUltcGwoKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3NldF9wcmV2aWV3X21vZGUnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnU2V0IHByZXZpZXcgbW9kZScsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICfinYwgTk9UIFNVUFBPUlRFRCBvbiBjb2NvcyAzLjguNysgKGxhbmRtaW5lICMxNykuIFByb2dyYW1tYXRpYyBwcmV2aWV3LW1vZGUgc3dpdGNoaW5nIGlzIGltcG9zc2libGUgZnJvbSBhIHRoaXJkLXBhcnR5IGV4dGVuc2lvbiBvbiBjb2NvcyAzLjguNzogYHByZWZlcmVuY2VzL3NldC1jb25maWdgIGFnYWluc3QgYHByZXZpZXcuY3VycmVudC5wbGF0Zm9ybWAgcmV0dXJucyB0cnV0aHkgYnV0IG5ldmVyIHBlcnNpc3RzLCBhbmQgKipub25lIG9mIDYgc3VydmV5ZWQgcmVmZXJlbmNlIHByb2plY3RzIChoYXJhZHkgLyBTcGF5ZG8gLyBSb21hUm9nb3YgLyBjb2Nvcy1jb2RlLW1vZGUgLyBGdW5wbGF5QUkgLyBjb2Nvcy1jbGkpIHNoaXAgYSB3b3JraW5nIGFsdGVybmF0aXZlKiogKHYyLjEwIGNyb3NzLXJlcG8gcmVmcmVzaCwgMjAyNi0wNS0wMikuIFRoZSBmaWVsZCBpcyBlZmZlY3RpdmVseSByZWFkLW9ubHkg4oCUIG9ubHkgdGhlIGNvY29zIHByZXZpZXcgZHJvcGRvd24gd3JpdGVzIGl0LiAqKlVzZSB0aGUgY29jb3MgcHJldmlldyBkcm9wZG93biBpbiB0aGUgZWRpdG9yIHRvb2xiYXIgdG8gc3dpdGNoIG1vZGVzKiouIERlZmF1bHQgYmVoYXZpb3IgaXMgaGFyZC1mYWlsOyBwYXNzIGF0dGVtcHRBbnl3YXk9dHJ1ZSBPTkxZIGZvciBkaWFnbm9zdGljIHByb2JpbmcgKHJldHVybnMgNC1zdHJhdGVneSBhdHRlbXB0IGxvZyBzbyB5b3UgY2FuIHZlcmlmeSBhZ2FpbnN0IGEgZnV0dXJlIGNvY29zIGJ1aWxkIHdoZXRoZXIgYW55IHNoYXBlIG5vdyB3b3JrcykuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBtb2RlOiB6LmVudW0oWydicm93c2VyJywgJ2dhbWVWaWV3JywgJ3NpbXVsYXRvciddKS5kZXNjcmliZSgnVGFyZ2V0IHByZXZpZXcgcGxhdGZvcm0uIFwiYnJvd3NlclwiIG9wZW5zIHByZXZpZXcgaW4gdGhlIHVzZXIgZGVmYXVsdCBicm93c2VyLiBcImdhbWVWaWV3XCIgZW1iZWRzIHRoZSBnYW1ldmlldyBpbiB0aGUgbWFpbiBlZGl0b3IgKGluLWVkaXRvciBwcmV2aWV3KS4gXCJzaW11bGF0b3JcIiBsYXVuY2hlcyB0aGUgY29jb3Mgc2ltdWxhdG9yLiBNYXBzIGRpcmVjdGx5IHRvIHRoZSBjb2NvcyBwcmV2aWV3LmN1cnJlbnQucGxhdGZvcm0gdmFsdWUuJyksXG4gICAgICAgICAgICAgICAgICAgIGF0dGVtcHRBbnl3YXk6IHouYm9vbGVhbigpLmRlZmF1bHQoZmFsc2UpLmRlc2NyaWJlKCdEaWFnbm9zdGljIG9wdC1pbi4gRGVmYXVsdCBmYWxzZSByZXR1cm5zIE5PVF9TVVBQT1JURUQgd2l0aCB0aGUgY29jb3MgVUkgcmVkaXJlY3QuIFNldCB0cnVlIE9OTFkgdG8gcmUtcHJvYmUgdGhlIDQgc2V0LWNvbmZpZyBzaGFwZXMgYWdhaW5zdCBhIG5ldyBjb2NvcyBidWlsZCDigJQgdXNlZnVsIHdoZW4gdmFsaWRhdGluZyB3aGV0aGVyIGEgZnV0dXJlIGNvY29zIHZlcnNpb24gZXhwb3NlcyBhIHdyaXRlIHBhdGguIFJldHVybnMgZGF0YS5hdHRlbXB0cyB3aXRoIGV2ZXJ5IHNoYXBlIHRyaWVkIGFuZCBpdHMgcmVhZC1iYWNrIG9ic2VydmF0aW9uLiBEb2VzIE5PVCBmcmVlemUgdGhlIGVkaXRvciAodGhlIGNhbGwgbWVyZWx5IG5vLW9wcykuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBzZXRQcmV2aWV3TW9kZShhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5zZXRQcmV2aWV3TW9kZUltcGwoYXJncy5tb2RlLCBhcmdzLmF0dGVtcHRBbnl3YXkgPz8gZmFsc2UpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnYmF0Y2hfc2NyZWVuc2hvdCcsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdDYXB0dXJlIGJhdGNoIHNjcmVlbnNob3RzJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBDYXB0dXJlIG11bHRpcGxlIFBOR3Mgb2YgdGhlIGVkaXRvciB3aW5kb3cgd2l0aCBvcHRpb25hbCBkZWxheXMgYmV0d2VlbiBzaG90cy4gVXNlZnVsIGZvciBhbmltYXRpbmcgcHJldmlldyB2ZXJpZmljYXRpb24gb3IgY2FwdHVyaW5nIHRyYW5zaXRpb25zLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgc2F2ZVBhdGhQcmVmaXg6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnUGF0aCBwcmVmaXggZm9yIGJhdGNoIG91dHB1dCBmaWxlcy4gRmlsZXMgd3JpdHRlbiBhcyA8cHJlZml4Pi08aW5kZXg+LnBuZy4gTXVzdCByZXNvbHZlIGluc2lkZSB0aGUgY29jb3MgcHJvamVjdCByb290IChjb250YWlubWVudCBjaGVjayB2aWEgcmVhbHBhdGgpLiBEZWZhdWx0OiA8cHJvamVjdD4vdGVtcC9tY3AtY2FwdHVyZXMvYmF0Y2gtPHRpbWVzdGFtcD4uJyksXG4gICAgICAgICAgICAgICAgICAgIGRlbGF5c01zOiB6LmFycmF5KHoubnVtYmVyKCkubWluKDApLm1heCgxMDAwMCkpLm1heCgyMCkuZGVmYXVsdChbMF0pLmRlc2NyaWJlKCdEZWxheSAobXMpIGJlZm9yZSBlYWNoIGNhcHR1cmUuIExlbmd0aCBkZXRlcm1pbmVzIGhvdyBtYW55IHNob3RzIHRha2VuIChjYXBwZWQgYXQgMjAgdG8gcHJldmVudCBkaXNrIGZpbGwgLyBlZGl0b3IgZnJlZXplKS4gRGVmYXVsdCBbMF0gPSBzaW5nbGUgc2hvdC4nKSxcbiAgICAgICAgICAgICAgICAgICAgd2luZG93VGl0bGU6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnT3B0aW9uYWwgc3Vic3RyaW5nIG1hdGNoIG9uIHdpbmRvdyB0aXRsZS4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIGJhdGNoU2NyZWVuc2hvdChhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5iYXRjaFNjcmVlbnNob3RJbXBsKGFyZ3Muc2F2ZVBhdGhQcmVmaXgsIGFyZ3MuZGVsYXlzTXMsIGFyZ3Mud2luZG93VGl0bGUpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnd2FpdF9jb21waWxlJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1dhaXQgZm9yIGNvbXBpbGUnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIEJsb2NrIHVudGlsIGNvY29zIGZpbmlzaGVzIGl0cyBUeXBlU2NyaXB0IGNvbXBpbGUgcGFzcy4gVGFpbHMgdGVtcC9wcm9ncmFtbWluZy9wYWNrZXItZHJpdmVyL2xvZ3MvZGVidWcubG9nIGZvciB0aGUgXCJUYXJnZXQoZWRpdG9yKSBlbmRzXCIgbWFya2VyLiBSZXR1cm5zIGltbWVkaWF0ZWx5IHdpdGggY29tcGlsZWQ9ZmFsc2UgaWYgbm8gY29tcGlsZSB3YXMgdHJpZ2dlcmVkIChjbGVhbiBwcm9qZWN0IC8gbm8gY2hhbmdlcyBkZXRlY3RlZCkuIFBhaXIgd2l0aCBydW5fc2NyaXB0X2RpYWdub3N0aWNzIGZvciBhbiBcImVkaXQgLnRzIOKGkiB3YWl0IOKGkiBmZXRjaCBlcnJvcnNcIiB3b3JrZmxvdy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHRpbWVvdXRNczogei5udW1iZXIoKS5taW4oNTAwKS5tYXgoMTIwMDAwKS5kZWZhdWx0KDE1MDAwKS5kZXNjcmliZSgnTWF4IHdhaXQgdGltZSBpbiBtcyBiZWZvcmUgZ2l2aW5nIHVwLiBEZWZhdWx0IDE1MDAwLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgd2FpdENvbXBpbGUoYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMud2FpdENvbXBpbGVJbXBsKGFyZ3MudGltZW91dE1zKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3J1bl9zY3JpcHRfZGlhZ25vc3RpY3MnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnUnVuIHNjcmlwdCBkaWFnbm9zdGljcycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gUnVuIGB0c2MgLS1ub0VtaXRgIGFnYWluc3QgdGhlIHByb2plY3QgdHNjb25maWcgYW5kIHJldHVybiBwYXJzZWQgZGlhZ25vc3RpY3MuIFVzZWQgYWZ0ZXIgd2FpdF9jb21waWxlIHRvIHN1cmZhY2UgY29tcGlsYXRpb24gZXJyb3JzIGFzIHN0cnVjdHVyZWQge2ZpbGUsIGxpbmUsIGNvbHVtbiwgY29kZSwgbWVzc2FnZX0gZW50cmllcy4gUmVzb2x2ZXMgdHNjIGJpbmFyeSBmcm9tIHByb2plY3Qgbm9kZV9tb2R1bGVzIOKGkiBlZGl0b3IgYnVuZGxlZCBlbmdpbmUg4oaSIG5weCBmYWxsYmFjay4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHRzY29uZmlnUGF0aDogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdPcHRpb25hbCBvdmVycmlkZSAoYWJzb2x1dGUgb3IgcHJvamVjdC1yZWxhdGl2ZSkuIERlZmF1bHQ6IHRzY29uZmlnLmpzb24gb3IgdGVtcC90c2NvbmZpZy5jb2Nvcy5qc29uLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgcnVuU2NyaXB0RGlhZ25vc3RpY3MoYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMucnVuU2NyaXB0RGlhZ25vc3RpY3NJbXBsKGFyZ3MudHNjb25maWdQYXRoKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3ByZXZpZXdfdXJsJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1Jlc29sdmUgcHJldmlldyBVUkwnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFJlc29sdmUgdGhlIGNvY29zIGJyb3dzZXItcHJldmlldyBVUkwuIFVzZXMgdGhlIGRvY3VtZW50ZWQgRWRpdG9yLk1lc3NhZ2UgY2hhbm5lbCBwcmV2aWV3L3F1ZXJ5LXByZXZpZXctdXJsLiBXaXRoIGFjdGlvbj1cIm9wZW5cIiwgYWxzbyBsYXVuY2hlcyB0aGUgVVJMIGluIHRoZSB1c2VyIGRlZmF1bHQgYnJvd3NlciB2aWEgZWxlY3Ryb24uc2hlbGwub3BlbkV4dGVybmFsIOKAlCB1c2VmdWwgYXMgYSBzZXR1cCBzdGVwIGJlZm9yZSBkZWJ1Z19nYW1lX2NvbW1hbmQsIHNpbmNlIHRoZSBHYW1lRGVidWdDbGllbnQgcnVubmluZyBpbnNpZGUgdGhlIHByZXZpZXcgbXVzdCBiZSByZWFjaGFibGUuIEVkaXRvci1zaWRlIFByZXZpZXctaW4tRWRpdG9yIHBsYXkvc3RvcCBpcyBOT1QgZXhwb3NlZCBieSB0aGUgcHVibGljIG1lc3NhZ2UgQVBJIGFuZCBpcyBpbnRlbnRpb25hbGx5IG5vdCBpbXBsZW1lbnRlZCBoZXJlOyB1c2UgdGhlIGNvY29zIGVkaXRvciB0b29sYmFyIG1hbnVhbGx5IGZvciBQSUUuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBhY3Rpb246IHouZW51bShbJ3F1ZXJ5JywgJ29wZW4nXSkuZGVmYXVsdCgncXVlcnknKS5kZXNjcmliZSgnXCJxdWVyeVwiIHJldHVybnMgdGhlIFVSTDsgXCJvcGVuXCIgcmV0dXJucyB0aGUgVVJMIEFORCBvcGVucyBpdCBpbiB0aGUgdXNlciBkZWZhdWx0IGJyb3dzZXIgdmlhIGVsZWN0cm9uLnNoZWxsLm9wZW5FeHRlcm5hbC4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIHByZXZpZXdVcmwoYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMucHJldmlld1VybEltcGwoYXJncy5hY3Rpb24pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgICAgICAgICBuYW1lOiAncXVlcnlfZGV2aWNlcycsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdMaXN0IHByZXZpZXcgZGV2aWNlcycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gTGlzdCBwcmV2aWV3IGRldmljZXMgY29uZmlndXJlZCBpbiB0aGUgY29jb3MgcHJvamVjdC4gQmFja2VkIGJ5IEVkaXRvci5NZXNzYWdlIGNoYW5uZWwgZGV2aWNlL3F1ZXJ5LiBSZXR1cm5zIGFuIGFycmF5IG9mIHtuYW1lLCB3aWR0aCwgaGVpZ2h0LCByYXRpb30gZW50cmllcyDigJQgdXNlZnVsIGZvciBiYXRjaC1zY3JlZW5zaG90IHBpcGVsaW5lcyB0aGF0IHRhcmdldCBtdWx0aXBsZSByZXNvbHV0aW9ucy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksXG4gICAgfSlcbiAgICBhc3luYyBxdWVyeURldmljZXMoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMucXVlcnlEZXZpY2VzSW1wbCgpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnZ2FtZV9jb21tYW5kJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1NlbmQgZ2FtZSBjb21tYW5kJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBTZW5kIGEgcnVudGltZSBjb21tYW5kIHRvIGEgY29ubmVjdGVkIEdhbWVEZWJ1Z0NsaWVudC4gV29ya3MgaW5zaWRlIGEgY29jb3MgcHJldmlldy9idWlsZCAoYnJvd3NlciwgUHJldmlldy1pbi1FZGl0b3IsIG9yIGFueSBkZXZpY2UgdGhhdCBmZXRjaGVzIC9nYW1lL2NvbW1hbmQpLiBCdWlsdC1pbiBjb21tYW5kIHR5cGVzOiBcInNjcmVlbnNob3RcIiAoY2FwdHVyZSBnYW1lIGNhbnZhcyB0byBQTkcsIHJldHVybnMgc2F2ZWQgZmlsZSBwYXRoKSwgXCJjbGlja1wiIChlbWl0IEJ1dHRvbi5DTElDSyBvbiBhIG5vZGUgYnkgbmFtZSksIFwiaW5zcGVjdFwiIChkdW1wIHJ1bnRpbWUgbm9kZSBpbmZvOiBwb3NpdGlvbi9zY2FsZS9yb3RhdGlvbi9hY3RpdmUvY29tcG9uZW50cyBieSBuYW1lOyB3aGVuIHByZXNlbnQgYWxzbyByZXR1cm5zIFVJVHJhbnNmb3JtLmNvbnRlbnRTaXplL2FuY2hvclBvaW50LCBXaWRnZXQgYWxpZ25tZW50IGZsYWdzL29mZnNldHMsIGFuZCBMYXlvdXQgdHlwZS9zcGFjaW5nL3BhZGRpbmcpLCBcInN0YXRlXCIgKGR1bXAgZ2xvYmFsIGdhbWUgc3RhdGUgZnJvbSB0aGUgcnVubmluZyBnYW1lIGNsaWVudCksIGFuZCBcIm5hdmlnYXRlXCIgKHN3aXRjaCBzY2VuZS9wYWdlIGJ5IG5hbWUgdGhyb3VnaCB0aGUgZ2FtZSBjbGllbnRcXCdzIHJvdXRlcikuIEN1c3RvbSBjb21tYW5kIHR5cGVzIGFyZSBmb3J3YXJkZWQgdG8gdGhlIGNsaWVudFxcJ3MgY3VzdG9tQ29tbWFuZHMgbWFwLiBSZXF1aXJlcyB0aGUgR2FtZURlYnVnQ2xpZW50IHRlbXBsYXRlIChjbGllbnQvY29jb3MtbWNwLWNsaWVudC50cykgd2lyZWQgaW50byB0aGUgcnVubmluZyBnYW1lOyB3aXRob3V0IGl0IHRoZSBjYWxsIHRpbWVzIG91dC4gQ2hlY2sgR0VUIC9nYW1lL3N0YXR1cyB0byB2ZXJpZnkgY2xpZW50IGxpdmVuZXNzIGZpcnN0LicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogei5zdHJpbmcoKS5taW4oMSkuZGVzY3JpYmUoJ0NvbW1hbmQgdHlwZS4gQnVpbHQtaW5zOiBzY3JlZW5zaG90LCBjbGljaywgaW5zcGVjdCwgc3RhdGUsIG5hdmlnYXRlLiBDdXN0b21zOiBhbnkgc3RyaW5nIHRoZSBHYW1lRGVidWdDbGllbnQgcmVnaXN0ZXJlZCBpbiBjdXN0b21Db21tYW5kcy4nKSxcbiAgICAgICAgICAgICAgICAgICAgYXJnczogei5hbnkoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdDb21tYW5kLXNwZWNpZmljIGFyZ3VtZW50cy4gRm9yIFwiY2xpY2tcIi9cImluc3BlY3RcIjoge25hbWU6IHN0cmluZ30gbm9kZSBuYW1lLiBGb3IgXCJuYXZpZ2F0ZVwiOiB7cGFnZU5hbWU6IHN0cmluZ30gb3Ige3BhZ2U6IHN0cmluZ30uIEZvciBcInN0YXRlXCIvXCJzY3JlZW5zaG90XCI6IHt9IChubyBhcmdzKS4nKSxcbiAgICAgICAgICAgICAgICAgICAgdGltZW91dE1zOiB6Lm51bWJlcigpLm1pbig1MDApLm1heCg2MDAwMCkuZGVmYXVsdCgxMDAwMCkuZGVzY3JpYmUoJ01heCB3YWl0IGZvciBjbGllbnQgcmVzcG9uc2UuIERlZmF1bHQgMTAwMDBtcy4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIGdhbWVDb21tYW5kKGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdhbWVDb21tYW5kSW1wbChhcmdzLnR5cGUsIGFyZ3MuYXJncywgYXJncy50aW1lb3V0TXMpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgICAgICAgICBuYW1lOiAncmVjb3JkX3N0YXJ0JyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1N0YXJ0IGdhbWUgcmVjb3JkaW5nJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBTdGFydCByZWNvcmRpbmcgdGhlIHJ1bm5pbmcgZ2FtZSBjYW52YXMgdmlhIHRoZSBHYW1lRGVidWdDbGllbnQgKGJyb3dzZXIvUElFIHByZXZpZXcgb25seSkuIFdyYXBzIGRlYnVnX2dhbWVfY29tbWFuZCh0eXBlPVwicmVjb3JkX3N0YXJ0XCIpIGZvciBBSSBlcmdvbm9taWNzLiBSZXR1cm5zIGltbWVkaWF0ZWx5IHdpdGggeyByZWNvcmRpbmc6IHRydWUsIG1pbWVUeXBlIH07IHRoZSByZWNvcmRpbmcgY29udGludWVzIHVudGlsIGRlYnVnX3JlY29yZF9zdG9wIGlzIGNhbGxlZC4gQnJvd3Nlci1vbmx5IOKAlCBmYWlscyBvbiBuYXRpdmUgY29jb3MgYnVpbGRzIChNZWRpYVJlY29yZGVyIEFQSSByZXF1aXJlcyBhIERPTSBjYW52YXMgKyBjYXB0dXJlU3RyZWFtKS4gU2luZ2xlLWZsaWdodCBwZXIgY2xpZW50OiBhIHNlY29uZCByZWNvcmRfc3RhcnQgd2hpbGUgYSByZWNvcmRpbmcgaXMgaW4gcHJvZ3Jlc3MgcmV0dXJucyBzdWNjZXNzOmZhbHNlLiBQYWlyIHdpdGggZGVidWdfZ2FtZV9jbGllbnRfc3RhdHVzIHRvIGNvbmZpcm0gYSBjbGllbnQgaXMgY29ubmVjdGVkIGJlZm9yZSBjYWxsaW5nLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgbWltZVR5cGU6IHouZW51bShbJ3ZpZGVvL3dlYm0nLCAndmlkZW8vbXA0J10pLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0NvbnRhaW5lci9jb2RlYyBoaW50IGZvciBNZWRpYVJlY29yZGVyLiBEZWZhdWx0OiBicm93c2VyIGF1dG8tcGljayAod2VibSBwcmVmZXJyZWQgd2hlcmUgc3VwcG9ydGVkLCBmYWxscyBiYWNrIHRvIG1wNCkuIFNvbWUgYnJvd3NlcnMgcmVqZWN0IHVuc3VwcG9ydGVkIHR5cGVzIOKAlCByZWNvcmRfc3RhcnQgc3VyZmFjZXMgYSBjbGVhciBlcnJvciBpbiB0aGF0IGNhc2UuJyksXG4gICAgICAgICAgICAgICAgICAgIHZpZGVvQml0c1BlclNlY29uZDogei5udW1iZXIoKS5taW4oMTAwXzAwMCkubWF4KDIwXzAwMF8wMDApLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ09wdGlvbmFsIE1lZGlhUmVjb3JkZXIgYml0cmF0ZSBoaW50IGluIGJpdHMvc2VjLiBMb3dlciDihpIgc21hbGxlciBmaWxlcyBidXQgbG93ZXIgcXVhbGl0eS4gQnJvd3NlciBkZWZhdWx0IGlmIG9taXR0ZWQuJyksXG4gICAgICAgICAgICAgICAgICAgIHRpbWVvdXRNczogei5udW1iZXIoKS5taW4oNTAwKS5tYXgoMzAwMDApLmRlZmF1bHQoNTAwMCkuZGVzY3JpYmUoJ01heCB3YWl0IGZvciB0aGUgR2FtZURlYnVnQ2xpZW50IHRvIGFja25vd2xlZGdlIHJlY29yZF9zdGFydC4gUmVjb3JkaW5nIGl0c2VsZiBydW5zIHVudGlsIGRlYnVnX3JlY29yZF9zdG9wLiBEZWZhdWx0IDUwMDBtcy4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIHJlY29yZFN0YXJ0KGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLnJlY29yZFN0YXJ0SW1wbChhcmdzLm1pbWVUeXBlLCBhcmdzLnZpZGVvQml0c1BlclNlY29uZCwgYXJncy50aW1lb3V0TXMgPz8gNTAwMCk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICAgICAgICAgIG5hbWU6ICdyZWNvcmRfc3RvcCcsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdTdG9wIGdhbWUgcmVjb3JkaW5nJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBTdG9wIHRoZSBpbi1wcm9ncmVzcyBnYW1lIGNhbnZhcyByZWNvcmRpbmcgYW5kIHBlcnNpc3QgaXQgdW5kZXIgPHByb2plY3Q+L3RlbXAvbWNwLWNhcHR1cmVzLiBXcmFwcyBkZWJ1Z19nYW1lX2NvbW1hbmQodHlwZT1cInJlY29yZF9zdG9wXCIpLiBSZXR1cm5zIHsgZmlsZVBhdGgsIHNpemUsIG1pbWVUeXBlLCBkdXJhdGlvbk1zIH0uIENhbGxpbmcgd2l0aG91dCBhIHByaW9yIHJlY29yZF9zdGFydCByZXR1cm5zIHN1Y2Nlc3M6ZmFsc2UuIFRoZSBob3N0IGFwcGxpZXMgdGhlIHNhbWUgcmVhbHBhdGggY29udGFpbm1lbnQgZ3VhcmQgKyA2NE1CIGJ5dGUgY2FwIChzeW5jZWQgd2l0aCB0aGUgcmVxdWVzdCBib2R5IGNhcCBpbiBtY3Atc2VydmVyLXNkay50czsgdjIuOS42IHJhaXNlZCBib3RoIGZyb20gMzIgdG8gNjRNQik7IHJhaXNlIHZpZGVvQml0c1BlclNlY29uZCAvIHJlZHVjZSByZWNvcmRpbmcgZHVyYXRpb24gb24gY2FwIHJlamVjdGlvbi4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHRpbWVvdXRNczogei5udW1iZXIoKS5taW4oMTAwMCkubWF4KDEyMDAwMCkuZGVmYXVsdCgzMDAwMCkuZGVzY3JpYmUoJ01heCB3YWl0IGZvciB0aGUgY2xpZW50IHRvIGFzc2VtYmxlICsgcmV0dXJuIHRoZSByZWNvcmRpbmcgYmxvYi4gUmVjb3JkaW5ncyBvZiBzZXZlcmFsIHNlY29uZHMgYXQgaGlnaCBiaXRyYXRlIG1heSBuZWVkIGxvbmdlciB0aGFuIHRoZSBkZWZhdWx0IDMwcyDigJQgcmFpc2Ugb24gbG9uZyByZWNvcmRpbmdzLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgcmVjb3JkU3RvcChhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5yZWNvcmRTdG9wSW1wbChhcmdzLnRpbWVvdXRNcyA/PyAzMDAwMCk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICAgICAgICAgIG5hbWU6ICdnYW1lX2NsaWVudF9zdGF0dXMnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnUmVhZCBnYW1lIGNsaWVudCBzdGF0dXMnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFJlYWQgR2FtZURlYnVnQ2xpZW50IGNvbm5lY3Rpb24gc3RhdHVzLiBJbmNsdWRlcyBjb25uZWN0ZWQgKHBvbGxlZCB3aXRoaW4gMnMpLCBsYXN0IHBvbGwgdGltZXN0YW1wLCBhbmQgd2hldGhlciBhIGNvbW1hbmQgaXMgcXVldWVkLiBVc2UgYmVmb3JlIGRlYnVnX2dhbWVfY29tbWFuZCB0byBjb25maXJtIHRoZSBjbGllbnQgaXMgcmVhY2hhYmxlLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSxcbiAgICB9KVxuICAgIGFzeW5jIGdhbWVDbGllbnRTdGF0dXMoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2FtZUNsaWVudFN0YXR1c0ltcGwoKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2NoZWNrX2VkaXRvcl9oZWFsdGgnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnQ2hlY2sgZWRpdG9yIGhlYWx0aCcsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gUHJvYmUgd2hldGhlciB0aGUgY29jb3MgZWRpdG9yIHNjZW5lLXNjcmlwdCByZW5kZXJlciBpcyByZXNwb25zaXZlLiBVc2VmdWwgYWZ0ZXIgZGVidWdfcHJldmlld19jb250cm9sKHN0YXJ0KSDigJQgbGFuZG1pbmUgIzE2IGRvY3VtZW50cyB0aGF0IGNvY29zIDMuOC43IHNvbWV0aW1lcyBmcmVlemVzIHRoZSBzY2VuZS1zY3JpcHQgcmVuZGVyZXIgKHNwaW5uaW5nIGluZGljYXRvciwgQ3RybCtSIHJlcXVpcmVkKS4gU3RyYXRlZ3kgKHYyLjkuNik6IHRocmVlIHByb2JlcyDigJQgKDEpIGhvc3Q6IGRldmljZS9xdWVyeSAobWFpbiBwcm9jZXNzLCBhbHdheXMgcmVzcG9uc2l2ZSBldmVuIHdoZW4gc2NlbmUtc2NyaXB0IGlzIHdlZGdlZCk7ICgyKSBzY2VuZS9xdWVyeS1pcy1yZWFkeSB0eXBlZCBjaGFubmVsIOKAlCBkaXJlY3QgSVBDIGludG8gdGhlIHNjZW5lIG1vZHVsZSwgaGFuZ3Mgd2hlbiBzY2VuZSByZW5kZXJlciBpcyBmcm96ZW47ICgzKSBzY2VuZS9xdWVyeS1ub2RlLXRyZWUgdHlwZWQgY2hhbm5lbCDigJQgcmV0dXJucyB0aGUgZnVsbCBzY2VuZSB0cmVlLCBmb3JjZXMgYW4gYWN0dWFsIHNjZW5lLWdyYXBoIHdhbGsgdGhyb3VnaCB0aGUgd2VkZ2VkIGNvZGUgcGF0aC4gRWFjaCBwcm9iZSBoYXMgaXRzIG93biB0aW1lb3V0IHJhY2UgKGRlZmF1bHQgMTUwMG1zIGVhY2gpLiBTY2VuZSBkZWNsYXJlZCBhbGl2ZSBvbmx5IHdoZW4gQk9USCAoMikgcmV0dXJucyB0cnVlIEFORCAoMykgcmV0dXJucyBhIG5vbi1udWxsIHRyZWUgd2l0aGluIHRoZSB0aW1lb3V0LiBSZXR1cm5zIHsgaG9zdEFsaXZlLCBzY2VuZUFsaXZlLCBzY2VuZUxhdGVuY3lNcywgaG9zdEVycm9yLCBzY2VuZUVycm9yLCB0b3RhbFByb2JlTXMgfS4gQUkgd29ya2Zsb3c6IGNhbGwgYWZ0ZXIgcHJldmlld19jb250cm9sKHN0YXJ0KTsgaWYgc2NlbmVBbGl2ZT1mYWxzZSwgc3VyZmFjZSBcImNvY29zIGVkaXRvciBsaWtlbHkgZnJvemVuIOKAlCBwcmVzcyBDdHJsK1JcIiBpbnN0ZWFkIG9mIGlzc3VpbmcgbW9yZSBzY2VuZS1ib3VuZCBjYWxscy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHNjZW5lVGltZW91dE1zOiB6Lm51bWJlcigpLm1pbigyMDApLm1heCgxMDAwMCkuZGVmYXVsdCgxNTAwKS5kZXNjcmliZSgnVGltZW91dCBmb3IgdGhlIHNjZW5lLXNjcmlwdCBwcm9iZSBpbiBtcy4gQmVsb3cgdGhpcyBzY2VuZSBpcyBjb25zaWRlcmVkIGZyb3plbi4gRGVmYXVsdCAxNTAwbXMuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBjaGVja0VkaXRvckhlYWx0aChhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5jaGVja0VkaXRvckhlYWx0aEltcGwoYXJncy5zY2VuZVRpbWVvdXRNcyA/PyAxNTAwKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3ByZXZpZXdfY29udHJvbCcsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdDb250cm9sIHByZXZpZXcgcGxheWJhY2snLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAn4pqgIFBBUktFRCDigJQgc3RhcnQgRlJFRVpFUyBjb2NvcyAzLjguNyAobGFuZG1pbmUgIzE2KS4gUHJvZ3JhbW1hdGljYWxseSBzdGFydCBvciBzdG9wIFByZXZpZXctaW4tRWRpdG9yIChQSUUpIHBsYXkgbW9kZS4gV3JhcHMgdGhlIHR5cGVkIGNjZS5TY2VuZUZhY2FkZU1hbmFnZXIuY2hhbmdlUHJldmlld1BsYXlTdGF0ZSBtZXRob2QuICoqc3RhcnQgaGl0cyBhIGNvY29zIDMuOC43IHNvZnRSZWxvYWRTY2VuZSByYWNlKiogdGhhdCByZXR1cm5zIHN1Y2Nlc3MgYnV0IGZyZWV6ZXMgdGhlIGVkaXRvciAoc3Bpbm5pbmcgaW5kaWNhdG9yLCBDdHJsK1IgcmVxdWlyZWQgdG8gcmVjb3ZlcikuIFZlcmlmaWVkIGluIGJvdGggZW1iZWRkZWQgYW5kIGJyb3dzZXIgcHJldmlldyBtb2Rlcy4gdjIuMTAgY3Jvc3MtcmVwbyByZWZyZXNoIGNvbmZpcm1lZDogbm9uZSBvZiA2IHN1cnZleWVkIHBlZXJzIChoYXJhZHkgLyBTcGF5ZG8gLyBSb21hUm9nb3YgLyBjb2Nvcy1jb2RlLW1vZGUgLyBGdW5wbGF5QUkgLyBjb2Nvcy1jbGkpIHNoaXAgYSBzYWZlciBjYWxsIHBhdGgg4oCUIGhhcmFkeSBhbmQgY29jb3MtY29kZS1tb2RlIHVzZSB0aGUgYEVkaXRvci5NZXNzYWdlIHNjZW5lL2VkaXRvci1wcmV2aWV3LXNldC1wbGF5YCBjaGFubmVsIGFuZCBoaXQgdGhlIHNhbWUgcmFjZS4gKipzdG9wIGlzIHNhZmUqKiBhbmQgcmVsaWFibGUuIFRvIHByZXZlbnQgYWNjaWRlbnRhbCB0cmlnZ2VyaW5nLCBzdGFydCByZXF1aXJlcyBleHBsaWNpdCBgYWNrbm93bGVkZ2VGcmVlemVSaXNrOiB0cnVlYC4gKipTdHJvbmdseSBwcmVmZXJyZWQgYWx0ZXJuYXRpdmVzIGluc3RlYWQgb2Ygc3RhcnQqKjogKGEpIGRlYnVnX2NhcHR1cmVfcHJldmlld19zY3JlZW5zaG90KG1vZGU9XCJlbWJlZGRlZFwiKSBpbiBFRElUIG1vZGUg4oCUIG5vIFBJRSBuZWVkZWQ7IChiKSBkZWJ1Z19nYW1lX2NvbW1hbmQodHlwZT1cInNjcmVlbnNob3RcIikgdmlhIEdhbWVEZWJ1Z0NsaWVudCBvbiBicm93c2VyIHByZXZpZXcgbGF1bmNoZWQgdmlhIGRlYnVnX3ByZXZpZXdfdXJsKGFjdGlvbj1cIm9wZW5cIikuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBvcDogei5lbnVtKFsnc3RhcnQnLCAnc3RvcCddKS5kZXNjcmliZSgnXCJzdGFydFwiIGVudGVycyBQSUUgcGxheSBtb2RlIChlcXVpdmFsZW50IHRvIGNsaWNraW5nIHRoZSB0b29sYmFyIHBsYXkgYnV0dG9uKSDigJQgUkVRVUlSRVMgYWNrbm93bGVkZ2VGcmVlemVSaXNrPXRydWUgb24gY29jb3MgMy44LjcgZHVlIHRvIGxhbmRtaW5lICMxNi4gXCJzdG9wXCIgZXhpdHMgUElFIHBsYXkgYW5kIHJldHVybnMgdG8gc2NlbmUgbW9kZSAoYWx3YXlzIHNhZmUpLicpLFxuICAgICAgICAgICAgICAgICAgICBhY2tub3dsZWRnZUZyZWV6ZVJpc2s6IHouYm9vbGVhbigpLmRlZmF1bHQoZmFsc2UpLmRlc2NyaWJlKCdSZXF1aXJlZCB0byBiZSB0cnVlIGZvciBvcD1cInN0YXJ0XCIgb24gY29jb3MgMy44LjcgZHVlIHRvIGxhbmRtaW5lICMxNiAoc29mdFJlbG9hZFNjZW5lIHJhY2UgdGhhdCBmcmVlemVzIHRoZSBlZGl0b3IpLiBTZXQgdHJ1ZSBPTkxZIHdoZW4gdGhlIGh1bWFuIHVzZXIgaGFzIGV4cGxpY2l0bHkgYWNjZXB0ZWQgdGhlIHJpc2sgYW5kIGlzIHByZXBhcmVkIHRvIHByZXNzIEN0cmwrUiBpZiB0aGUgZWRpdG9yIGZyZWV6ZXMuIElnbm9yZWQgZm9yIG9wPVwic3RvcFwiIHdoaWNoIGlzIHJlbGlhYmxlLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgcHJldmlld0NvbnRyb2woYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMucHJldmlld0NvbnRyb2xJbXBsKGFyZ3Mub3AsIGFyZ3MuYWNrbm93bGVkZ2VGcmVlemVSaXNrID8/IGZhbHNlKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2dldF9zY3JpcHRfZGlhZ25vc3RpY19jb250ZXh0JyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1JlYWQgZGlhZ25vc3RpYyBjb250ZXh0JyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBSZWFkIGEgd2luZG93IG9mIHNvdXJjZSBsaW5lcyBhcm91bmQgYSBkaWFnbm9zdGljIGxvY2F0aW9uIHNvIEFJIGNhbiByZWFkIHRoZSBvZmZlbmRpbmcgY29kZSB3aXRob3V0IGEgc2VwYXJhdGUgZmlsZSByZWFkLiBQYWlyIHdpdGggcnVuX3NjcmlwdF9kaWFnbm9zdGljczogcGFzcyBmaWxlL2xpbmUgZnJvbSBlYWNoIGRpYWdub3N0aWMgdG8gZmV0Y2ggY29udGV4dC4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIGZpbGU6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0Fic29sdXRlIG9yIHByb2plY3QtcmVsYXRpdmUgcGF0aCB0byB0aGUgc291cmNlIGZpbGUuIERpYWdub3N0aWNzIGZyb20gcnVuX3NjcmlwdF9kaWFnbm9zdGljcyBhbHJlYWR5IHVzZSBhIHBhdGggdHNjIGVtaXR0ZWQsIHdoaWNoIGlzIHN1aXRhYmxlIGhlcmUuJyksXG4gICAgICAgICAgICAgICAgICAgIGxpbmU6IHoubnVtYmVyKCkubWluKDEpLmRlc2NyaWJlKCcxLWJhc2VkIGxpbmUgbnVtYmVyIHRoYXQgdGhlIGRpYWdub3N0aWMgcG9pbnRzIGF0LicpLFxuICAgICAgICAgICAgICAgICAgICBjb250ZXh0TGluZXM6IHoubnVtYmVyKCkubWluKDApLm1heCg1MCkuZGVmYXVsdCg1KS5kZXNjcmliZSgnTnVtYmVyIG9mIGxpbmVzIHRvIGluY2x1ZGUgYmVmb3JlIGFuZCBhZnRlciB0aGUgdGFyZ2V0IGxpbmUuIERlZmF1bHQgNSAowrE1IOKGkiAxMS1saW5lIHdpbmRvdykuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBnZXRTY3JpcHREaWFnbm9zdGljQ29udGV4dChhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRTY3JpcHREaWFnbm9zdGljQ29udGV4dEltcGwoYXJncy5maWxlLCBhcmdzLmxpbmUsIGFyZ3MuY29udGV4dExpbmVzKTtcbiAgICB9XG5cbiAgICAvLyBDb21wYXQgcGF0aDogcHJlc2VydmUgdGhlIHByZS12Mi4zLjAgcmVzcG9uc2Ugc2hhcGVcbiAgICAvLyB7c3VjY2VzcywgZGF0YToge3Jlc3VsdCwgbWVzc2FnZTogJ1NjcmlwdCBleGVjdXRlZCBzdWNjZXNzZnVsbHknfX1cbiAgICAvLyBzbyBvbGRlciBjYWxsZXJzIHJlYWRpbmcgZGF0YS5tZXNzYWdlIGtlZXAgd29ya2luZy5cbiAgICBwcml2YXRlIGFzeW5jIGV4ZWN1dGVTY3JpcHRDb21wYXQoc2NyaXB0OiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBvdXQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVKYXZhU2NyaXB0KHNjcmlwdCwgJ3NjZW5lJyk7XG4gICAgICAgIGlmIChvdXQuc3VjY2VzcyAmJiBvdXQuZGF0YSAmJiAncmVzdWx0JyBpbiBvdXQuZGF0YSkge1xuICAgICAgICAgICAgcmV0dXJuIG9rKHtcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0OiBvdXQuZGF0YS5yZXN1bHQsXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdTY3JpcHQgZXhlY3V0ZWQgc3VjY2Vzc2Z1bGx5JyxcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gb3V0O1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgY2xlYXJDb25zb2xlSW1wbCgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICAvLyBOb3RlOiBFZGl0b3IuTWVzc2FnZS5zZW5kIG1heSBub3QgcmV0dXJuIGEgcHJvbWlzZSBpbiBhbGwgdmVyc2lvbnNcbiAgICAgICAgRWRpdG9yLk1lc3NhZ2Uuc2VuZCgnY29uc29sZScsICdjbGVhcicpO1xuICAgICAgICByZXR1cm4gb2sodW5kZWZpbmVkLCAnQ29uc29sZSBjbGVhcmVkIHN1Y2Nlc3NmdWxseScpO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZXhlY3V0ZUphdmFTY3JpcHQoY29kZTogc3RyaW5nLCBjb250ZXh0OiAnc2NlbmUnIHwgJ2VkaXRvcicpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBpZiAoY29udGV4dCA9PT0gJ3NjZW5lJykge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZXhlY3V0ZUluU2NlbmVDb250ZXh0KGNvZGUpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChjb250ZXh0ID09PSAnZWRpdG9yJykge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZXhlY3V0ZUluRWRpdG9yQ29udGV4dChjb2RlKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFpbChgVW5rbm93biBleGVjdXRlX2phdmFzY3JpcHQgY29udGV4dDogJHtjb250ZXh0fWApO1xuICAgIH1cblxuICAgIHByaXZhdGUgZXhlY3V0ZUluU2NlbmVDb250ZXh0KGNvZGU6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnZXhlY3V0ZS1zY2VuZS1zY3JpcHQnLCB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2NvbnNvbGUnLFxuICAgICAgICAgICAgICAgIG1ldGhvZDogJ2V2YWwnLFxuICAgICAgICAgICAgICAgIGFyZ3M6IFtjb2RlXVxuICAgICAgICAgICAgfSkudGhlbigocmVzdWx0OiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRleHQ6ICdzY2VuZScsXG4gICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQ6IHJlc3VsdCxcbiAgICAgICAgICAgICAgICAgICAgfSwgJ1NjZW5lIHNjcmlwdCBleGVjdXRlZCBzdWNjZXNzZnVsbHknKSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZXhlY3V0ZUluRWRpdG9yQ29udGV4dChjb2RlOiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBpZiAoIWlzRWRpdG9yQ29udGV4dEV2YWxFbmFibGVkKCkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKCdFZGl0b3IgY29udGV4dCBldmFsIGlzIGRpc2FibGVkLiBFbmFibGUgYGVuYWJsZUVkaXRvckNvbnRleHRFdmFsYCBpbiBNQ1Agc2VydmVyIHNldHRpbmdzIChwYW5lbCBVSSkgdG8gb3B0IGluLiBUaGlzIGdyYW50cyBBSS1nZW5lcmF0ZWQgY29kZSBhY2Nlc3MgdG8gRWRpdG9yLk1lc3NhZ2UgKyBOb2RlIGZzIEFQSXMgaW4gdGhlIGhvc3QgcHJvY2Vzczsgb25seSBlbmFibGUgd2hlbiB5b3UgdHJ1c3QgdGhlIHVwc3RyZWFtIHByb21wdCBzb3VyY2UuJyk7XG4gICAgICAgIH1cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIFdyYXAgaW4gYXN5bmMgSUlGRSBzbyBBSSBjYW4gdXNlIHRvcC1sZXZlbCBhd2FpdCB0cmFuc3BhcmVudGx5O1xuICAgICAgICAgICAgLy8gYWxzbyBnaXZlcyB1cyBhIGNsZWFuIFByb21pc2UtYmFzZWQgcmV0dXJuIHBhdGggcmVnYXJkbGVzcyBvZlxuICAgICAgICAgICAgLy8gd2hldGhlciB0aGUgdXNlciBjb2RlIHJldHVybnMgYSBQcm9taXNlIG9yIGEgc3luYyB2YWx1ZS5cbiAgICAgICAgICAgIGNvbnN0IHdyYXBwZWQgPSBgKGFzeW5jICgpID0+IHsgJHtjb2RlfSBcXG4gfSkoKWA7XG4gICAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tZXZhbFxuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgKDAsIGV2YWwpKHdyYXBwZWQpO1xuICAgICAgICAgICAgcmV0dXJuIG9rKHtcbiAgICAgICAgICAgICAgICAgICAgY29udGV4dDogJ2VkaXRvcicsXG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdDogcmVzdWx0LFxuICAgICAgICAgICAgICAgIH0sICdFZGl0b3Igc2NyaXB0IGV4ZWN1dGVkIHN1Y2Nlc3NmdWxseScpO1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoYEVkaXRvciBldmFsIGZhaWxlZDogJHtlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycil9YCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldE5vZGVUcmVlSW1wbChyb290VXVpZD86IHN0cmluZywgbWF4RGVwdGg6IG51bWJlciA9IDEwLCBtYXhOb2RlczogbnVtYmVyID0gMjAwMCwgc3VtbWFyeU9ubHk6IGJvb2xlYW4gPSBmYWxzZSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgY291bnRlciA9IHsgY291bnQ6IDAgfTtcbiAgICAgICAgICAgIGNvbnN0IHRydW5jYXRpb24gPSB7IHRydW5jYXRlZDogZmFsc2UsIHRydW5jYXRlZEJ5OiB1bmRlZmluZWQgYXMgJ21heERlcHRoJyB8ICdtYXhOb2RlcycgfCB1bmRlZmluZWQgfTtcblxuICAgICAgICAgICAgY29uc3QgYnVpbGRUcmVlID0gYXN5bmMgKG5vZGVVdWlkOiBzdHJpbmcsIGRlcHRoOiBudW1iZXIgPSAwKTogUHJvbWlzZTxhbnk+ID0+IHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBub2RlRGF0YSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LW5vZGUnLCBub2RlVXVpZCk7XG4gICAgICAgICAgICAgICAgICAgIGNvdW50ZXIuY291bnQrKztcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRyZWUgPSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiBub2RlRGF0YS51dWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogbm9kZURhdGEubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGFjdGl2ZTogbm9kZURhdGEuYWN0aXZlLFxuICAgICAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50czogKG5vZGVEYXRhIGFzIGFueSkuY29tcG9uZW50cyA/IChub2RlRGF0YSBhcyBhbnkpLmNvbXBvbmVudHMubWFwKChjOiBhbnkpID0+IGMuX190eXBlX18pIDogW10sXG4gICAgICAgICAgICAgICAgICAgICAgICBjaGlsZENvdW50OiBub2RlRGF0YS5jaGlsZHJlbiA/IG5vZGVEYXRhLmNoaWxkcmVuLmxlbmd0aCA6IDAsXG4gICAgICAgICAgICAgICAgICAgICAgICAuLi4oc3VtbWFyeU9ubHkgPyB7fSA6IHsgY2hpbGRyZW46IFtdIGFzIGFueVtdIH0pXG4gICAgICAgICAgICAgICAgICAgIH0gYXMgYW55O1xuXG4gICAgICAgICAgICAgICAgICAgIGlmICghc3VtbWFyeU9ubHkgJiYgdHJlZS5jaGlsZENvdW50ID4gMCAmJiBkZXB0aCA+PSBtYXhEZXB0aCAtIDEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRydW5jYXRpb24udHJ1bmNhdGVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRydW5jYXRpb24udHJ1bmNhdGVkQnkgPz89ICdtYXhEZXB0aCc7XG4gICAgICAgICAgICAgICAgICAgICAgICB0cmVlLnRydW5jYXRlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICB0cmVlLnRydW5jYXRlZEJ5ID0gJ21heERlcHRoJztcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0cmVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGlmICghc3VtbWFyeU9ubHkgJiYgdHJlZS5jaGlsZENvdW50ID4gMCAmJiBjb3VudGVyLmNvdW50ID49IG1heE5vZGVzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0cnVuY2F0aW9uLnRydW5jYXRlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICB0cnVuY2F0aW9uLnRydW5jYXRlZEJ5ID8/PSAnbWF4Tm9kZXMnO1xuICAgICAgICAgICAgICAgICAgICAgICAgdHJlZS50cnVuY2F0ZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgdHJlZS50cnVuY2F0ZWRCeSA9ICdtYXhOb2Rlcyc7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJlZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGlmICghc3VtbWFyeU9ubHkgJiYgbm9kZURhdGEuY2hpbGRyZW4gJiYgbm9kZURhdGEuY2hpbGRyZW4ubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdHJlZS5jaGlsZHJlbiA9IGF3YWl0IFByb21pc2UuYWxsKFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5vZGVEYXRhLmNoaWxkcmVuLm1hcCgoY2hpbGRJZDogYW55KSA9PiBidWlsZFRyZWUoY2hpbGRJZCwgZGVwdGggKyAxKSlcbiAgICAgICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoY291bnRlci5jb3VudCA+PSBtYXhOb2Rlcykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRydW5jYXRpb24udHJ1bmNhdGVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0cnVuY2F0aW9uLnRydW5jYXRlZEJ5ID8/PSAnbWF4Tm9kZXMnO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRyZWU7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgZXJyb3I6IGVyci5tZXNzYWdlIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgY29uc3QgcmVzcG9uZCA9IChkYXRhOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCByZXNwb25zZSA9IG9rKGRhdGEpIGFzIFRvb2xSZXNwb25zZSAmIHtcbiAgICAgICAgICAgICAgICAgICAgdHJ1bmNhdGVkOiBib29sZWFuO1xuICAgICAgICAgICAgICAgICAgICB0cnVuY2F0ZWRCeT86ICdtYXhEZXB0aCcgfCAnbWF4Tm9kZXMnO1xuICAgICAgICAgICAgICAgICAgICBub2RlQ291bnQ6IG51bWJlcjtcbiAgICAgICAgICAgICAgICAgICAgbWF4RGVwdGg6IG51bWJlcjtcbiAgICAgICAgICAgICAgICAgICAgbWF4Tm9kZXM6IG51bWJlcjtcbiAgICAgICAgICAgICAgICAgICAgc3VtbWFyeU9ubHk6IGJvb2xlYW47XG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICByZXNwb25zZS50cnVuY2F0ZWQgPSB0cnVuY2F0aW9uLnRydW5jYXRlZDtcbiAgICAgICAgICAgICAgICBpZiAodHJ1bmNhdGlvbi50cnVuY2F0ZWRCeSkgcmVzcG9uc2UudHJ1bmNhdGVkQnkgPSB0cnVuY2F0aW9uLnRydW5jYXRlZEJ5O1xuICAgICAgICAgICAgICAgIHJlc3BvbnNlLm5vZGVDb3VudCA9IGNvdW50ZXIuY291bnQ7XG4gICAgICAgICAgICAgICAgcmVzcG9uc2UubWF4RGVwdGggPSBtYXhEZXB0aDtcbiAgICAgICAgICAgICAgICByZXNwb25zZS5tYXhOb2RlcyA9IG1heE5vZGVzO1xuICAgICAgICAgICAgICAgIHJlc3BvbnNlLnN1bW1hcnlPbmx5ID0gc3VtbWFyeU9ubHk7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShyZXNwb25zZSk7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBpZiAocm9vdFV1aWQpIHtcbiAgICAgICAgICAgICAgICBidWlsZFRyZWUocm9vdFV1aWQpLnRoZW4odHJlZSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3BvbmQodHJlZSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LWhpZXJhcmNoeScpLnRoZW4oYXN5bmMgKGhpZXJhcmNoeTogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRyZWVzID0gYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgICAgICAgICAgICAgICAgICAgICBoaWVyYXJjaHkuY2hpbGRyZW4ubWFwKChyb290Tm9kZTogYW55KSA9PiBidWlsZFRyZWUocm9vdE5vZGUudXVpZCkpXG4gICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICAgIHJlc3BvbmQodHJlZXMpO1xuICAgICAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldFBlcmZvcm1hbmNlU3RhdHNJbXBsKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktcGVyZm9ybWFuY2UnKS50aGVuKChzdGF0czogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgcGVyZlN0YXRzOiBQZXJmb3JtYW5jZVN0YXRzID0ge1xuICAgICAgICAgICAgICAgICAgICBub2RlQ291bnQ6IHN0YXRzLm5vZGVDb3VudCB8fCAwLFxuICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRDb3VudDogc3RhdHMuY29tcG9uZW50Q291bnQgfHwgMCxcbiAgICAgICAgICAgICAgICAgICAgZHJhd0NhbGxzOiBzdGF0cy5kcmF3Q2FsbHMgfHwgMCxcbiAgICAgICAgICAgICAgICAgICAgdHJpYW5nbGVzOiBzdGF0cy50cmlhbmdsZXMgfHwgMCxcbiAgICAgICAgICAgICAgICAgICAgbWVtb3J5OiBzdGF0cy5tZW1vcnkgfHwge31cbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2socGVyZlN0YXRzKSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgLy8gRmFsbGJhY2sgdG8gYmFzaWMgc3RhdHNcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdQZXJmb3JtYW5jZSBzdGF0cyBub3QgYXZhaWxhYmxlIGluIGVkaXQgbW9kZSdcbiAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgdmFsaWRhdGVTY2VuZUltcGwob3B0aW9uczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgaXNzdWVzOiBWYWxpZGF0aW9uSXNzdWVbXSA9IFtdO1xuXG4gICAgICAgIC8vIENoZWNrIGZvciBtaXNzaW5nIGFzc2V0c1xuICAgICAgICBpZiAob3B0aW9ucy5jaGVja01pc3NpbmdBc3NldHMpIHtcbiAgICAgICAgICAgIGNvbnN0IGFzc2V0Q2hlY2sgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdjaGVjay1taXNzaW5nLWFzc2V0cycpO1xuICAgICAgICAgICAgaWYgKGFzc2V0Q2hlY2sgJiYgYXNzZXRDaGVjay5taXNzaW5nKSB7XG4gICAgICAgICAgICAgICAgaXNzdWVzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICB0eXBlOiAnZXJyb3InLFxuICAgICAgICAgICAgICAgICAgICBjYXRlZ29yeTogJ2Fzc2V0cycsXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBGb3VuZCAke2Fzc2V0Q2hlY2subWlzc2luZy5sZW5ndGh9IG1pc3NpbmcgYXNzZXQgcmVmZXJlbmNlc2AsXG4gICAgICAgICAgICAgICAgICAgIGRldGFpbHM6IGFzc2V0Q2hlY2subWlzc2luZ1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gQ2hlY2sgZm9yIHBlcmZvcm1hbmNlIGlzc3Vlc1xuICAgICAgICBpZiAob3B0aW9ucy5jaGVja1BlcmZvcm1hbmNlKSB7XG4gICAgICAgICAgICBjb25zdCBoaWVyYXJjaHkgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1oaWVyYXJjaHknKTtcbiAgICAgICAgICAgIGNvbnN0IG5vZGVDb3VudCA9IHRoaXMuY291bnROb2RlcyhoaWVyYXJjaHkuY2hpbGRyZW4pO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZiAobm9kZUNvdW50ID4gMTAwMCkge1xuICAgICAgICAgICAgICAgIGlzc3Vlcy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogJ3dhcm5pbmcnLFxuICAgICAgICAgICAgICAgICAgICBjYXRlZ29yeTogJ3BlcmZvcm1hbmNlJyxcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYEhpZ2ggbm9kZSBjb3VudDogJHtub2RlQ291bnR9IG5vZGVzIChyZWNvbW1lbmRlZCA8IDEwMDApYCxcbiAgICAgICAgICAgICAgICAgICAgc3VnZ2VzdGlvbjogJ0NvbnNpZGVyIHVzaW5nIG9iamVjdCBwb29saW5nIG9yIHNjZW5lIG9wdGltaXphdGlvbidcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHJlc3VsdDogVmFsaWRhdGlvblJlc3VsdCA9IHtcbiAgICAgICAgICAgIHZhbGlkOiBpc3N1ZXMubGVuZ3RoID09PSAwLFxuICAgICAgICAgICAgaXNzdWVDb3VudDogaXNzdWVzLmxlbmd0aCxcbiAgICAgICAgICAgIGlzc3VlczogaXNzdWVzXG4gICAgICAgIH07XG5cbiAgICAgICAgcmV0dXJuIG9rKHJlc3VsdCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBjb3VudE5vZGVzKG5vZGVzOiBhbnlbXSk6IG51bWJlciB7XG4gICAgICAgIGxldCBjb3VudCA9IG5vZGVzLmxlbmd0aDtcbiAgICAgICAgZm9yIChjb25zdCBub2RlIG9mIG5vZGVzKSB7XG4gICAgICAgICAgICBpZiAobm9kZS5jaGlsZHJlbikge1xuICAgICAgICAgICAgICAgIGNvdW50ICs9IHRoaXMuY291bnROb2Rlcyhub2RlLmNoaWxkcmVuKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gY291bnQ7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRFZGl0b3JJbmZvSW1wbCgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBpbmZvID0ge1xuICAgICAgICAgICAgZWRpdG9yOiB7XG4gICAgICAgICAgICAgICAgdmVyc2lvbjogKEVkaXRvciBhcyBhbnkpLnZlcnNpb25zPy5lZGl0b3IgfHwgJ1Vua25vd24nLFxuICAgICAgICAgICAgICAgIGNvY29zVmVyc2lvbjogKEVkaXRvciBhcyBhbnkpLnZlcnNpb25zPy5jb2NvcyB8fCAnVW5rbm93bicsXG4gICAgICAgICAgICAgICAgcGxhdGZvcm06IHByb2Nlc3MucGxhdGZvcm0sXG4gICAgICAgICAgICAgICAgYXJjaDogcHJvY2Vzcy5hcmNoLFxuICAgICAgICAgICAgICAgIG5vZGVWZXJzaW9uOiBwcm9jZXNzLnZlcnNpb25cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBwcm9qZWN0OiB7XG4gICAgICAgICAgICAgICAgbmFtZTogRWRpdG9yLlByb2plY3QubmFtZSxcbiAgICAgICAgICAgICAgICBwYXRoOiBFZGl0b3IuUHJvamVjdC5wYXRoLFxuICAgICAgICAgICAgICAgIHV1aWQ6IEVkaXRvci5Qcm9qZWN0LnV1aWRcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBtZW1vcnk6IHByb2Nlc3MubWVtb3J5VXNhZ2UoKSxcbiAgICAgICAgICAgIHVwdGltZTogcHJvY2Vzcy51cHRpbWUoKVxuICAgICAgICB9O1xuXG4gICAgICAgIHJldHVybiBvayhpbmZvKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHJlc29sdmVQcm9qZWN0TG9nUGF0aCgpOiB7IHBhdGg6IHN0cmluZyB9IHwgeyBlcnJvcjogc3RyaW5nIH0ge1xuICAgICAgICBpZiAoIUVkaXRvci5Qcm9qZWN0IHx8ICFFZGl0b3IuUHJvamVjdC5wYXRoKSB7XG4gICAgICAgICAgICByZXR1cm4geyBlcnJvcjogJ0VkaXRvci5Qcm9qZWN0LnBhdGggaXMgbm90IGF2YWlsYWJsZTsgY2Fubm90IGxvY2F0ZSBwcm9qZWN0IGxvZyBmaWxlLicgfTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBsb2dQYXRoID0gcGF0aC5qb2luKEVkaXRvci5Qcm9qZWN0LnBhdGgsICd0ZW1wL2xvZ3MvcHJvamVjdC5sb2cnKTtcbiAgICAgICAgaWYgKCFmcy5leGlzdHNTeW5jKGxvZ1BhdGgpKSB7XG4gICAgICAgICAgICByZXR1cm4geyBlcnJvcjogYFByb2plY3QgbG9nIGZpbGUgbm90IGZvdW5kIGF0ICR7bG9nUGF0aH1gIH07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgcGF0aDogbG9nUGF0aCB9O1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2V0UHJvamVjdExvZ3NJbXBsKGxpbmVzOiBudW1iZXIgPSAxMDAsIGZpbHRlcktleXdvcmQ/OiBzdHJpbmcsIGxvZ0xldmVsOiBzdHJpbmcgPSAnQUxMJyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByZXNvbHZlZCA9IHRoaXMucmVzb2x2ZVByb2plY3RMb2dQYXRoKCk7XG4gICAgICAgICAgICBpZiAoJ2Vycm9yJyBpbiByZXNvbHZlZCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKHJlc29sdmVkLmVycm9yKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGxvZ0ZpbGVQYXRoID0gcmVzb2x2ZWQucGF0aDtcblxuICAgICAgICAgICAgLy8gUmVhZCB0aGUgZmlsZSBjb250ZW50XG4gICAgICAgICAgICBjb25zdCBsb2dDb250ZW50ID0gZnMucmVhZEZpbGVTeW5jKGxvZ0ZpbGVQYXRoLCAndXRmOCcpO1xuICAgICAgICAgICAgY29uc3QgbG9nTGluZXMgPSBsb2dDb250ZW50LnNwbGl0KCdcXG4nKS5maWx0ZXIobGluZSA9PiBsaW5lLnRyaW0oKSAhPT0gJycpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBHZXQgdGhlIGxhc3QgTiBsaW5lc1xuICAgICAgICAgICAgY29uc3QgcmVjZW50TGluZXMgPSBsb2dMaW5lcy5zbGljZSgtbGluZXMpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBBcHBseSBmaWx0ZXJzXG4gICAgICAgICAgICBsZXQgZmlsdGVyZWRMaW5lcyA9IHJlY2VudExpbmVzO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBGaWx0ZXIgYnkgbG9nIGxldmVsIGlmIG5vdCAnQUxMJ1xuICAgICAgICAgICAgaWYgKGxvZ0xldmVsICE9PSAnQUxMJykge1xuICAgICAgICAgICAgICAgIGZpbHRlcmVkTGluZXMgPSBmaWx0ZXJCeUxldmVsKGZpbHRlcmVkTGluZXMsIGxvZ0xldmVsKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gRmlsdGVyIGJ5IGtleXdvcmQgaWYgcHJvdmlkZWRcbiAgICAgICAgICAgIGlmIChmaWx0ZXJLZXl3b3JkKSB7XG4gICAgICAgICAgICAgICAgZmlsdGVyZWRMaW5lcyA9IGZpbHRlckJ5S2V5d29yZChmaWx0ZXJlZExpbmVzLCBmaWx0ZXJLZXl3b3JkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgcmV0dXJuIG9rKHtcbiAgICAgICAgICAgICAgICAgICAgdG90YWxMaW5lczogbG9nTGluZXMubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICByZXF1ZXN0ZWRMaW5lczogbGluZXMsXG4gICAgICAgICAgICAgICAgICAgIGZpbHRlcmVkTGluZXM6IGZpbHRlcmVkTGluZXMubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICBsb2dMZXZlbDogbG9nTGV2ZWwsXG4gICAgICAgICAgICAgICAgICAgIGZpbHRlcktleXdvcmQ6IGZpbHRlcktleXdvcmQgfHwgbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgbG9nczogZmlsdGVyZWRMaW5lcyxcbiAgICAgICAgICAgICAgICAgICAgbG9nRmlsZVBhdGg6IGxvZ0ZpbGVQYXRoXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGBGYWlsZWQgdG8gcmVhZCBwcm9qZWN0IGxvZ3M6ICR7ZXJyb3IubWVzc2FnZX1gKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2V0TG9nRmlsZUluZm9JbXBsKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByZXNvbHZlZCA9IHRoaXMucmVzb2x2ZVByb2plY3RMb2dQYXRoKCk7XG4gICAgICAgICAgICBpZiAoJ2Vycm9yJyBpbiByZXNvbHZlZCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKHJlc29sdmVkLmVycm9yKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGxvZ0ZpbGVQYXRoID0gcmVzb2x2ZWQucGF0aDtcblxuICAgICAgICAgICAgY29uc3Qgc3RhdHMgPSBmcy5zdGF0U3luYyhsb2dGaWxlUGF0aCk7XG4gICAgICAgICAgICBjb25zdCBsb2dDb250ZW50ID0gZnMucmVhZEZpbGVTeW5jKGxvZ0ZpbGVQYXRoLCAndXRmOCcpO1xuICAgICAgICAgICAgY29uc3QgbGluZUNvdW50ID0gbG9nQ29udGVudC5zcGxpdCgnXFxuJykuZmlsdGVyKGxpbmUgPT4gbGluZS50cmltKCkgIT09ICcnKS5sZW5ndGg7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgICAgIGZpbGVQYXRoOiBsb2dGaWxlUGF0aCxcbiAgICAgICAgICAgICAgICAgICAgZmlsZVNpemU6IHN0YXRzLnNpemUsXG4gICAgICAgICAgICAgICAgICAgIGZpbGVTaXplRm9ybWF0dGVkOiB0aGlzLmZvcm1hdEZpbGVTaXplKHN0YXRzLnNpemUpLFxuICAgICAgICAgICAgICAgICAgICBsYXN0TW9kaWZpZWQ6IHN0YXRzLm10aW1lLnRvSVNPU3RyaW5nKCksXG4gICAgICAgICAgICAgICAgICAgIGxpbmVDb3VudDogbGluZUNvdW50LFxuICAgICAgICAgICAgICAgICAgICBjcmVhdGVkOiBzdGF0cy5iaXJ0aHRpbWUudG9JU09TdHJpbmcoKSxcbiAgICAgICAgICAgICAgICAgICAgYWNjZXNzaWJsZTogZnMuY29uc3RhbnRzLlJfT0tcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoYEZhaWxlZCB0byBnZXQgbG9nIGZpbGUgaW5mbzogJHtlcnJvci5tZXNzYWdlfWApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBzZWFyY2hQcm9qZWN0TG9nc0ltcGwocGF0dGVybjogc3RyaW5nLCBtYXhSZXN1bHRzOiBudW1iZXIgPSAyMCwgY29udGV4dExpbmVzOiBudW1iZXIgPSAyKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJlc29sdmVkID0gdGhpcy5yZXNvbHZlUHJvamVjdExvZ1BhdGgoKTtcbiAgICAgICAgICAgIGlmICgnZXJyb3InIGluIHJlc29sdmVkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwocmVzb2x2ZWQuZXJyb3IpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgbG9nRmlsZVBhdGggPSByZXNvbHZlZC5wYXRoO1xuXG4gICAgICAgICAgICBjb25zdCBsb2dDb250ZW50ID0gZnMucmVhZEZpbGVTeW5jKGxvZ0ZpbGVQYXRoLCAndXRmOCcpO1xuICAgICAgICAgICAgY29uc3QgbG9nTGluZXMgPSBsb2dDb250ZW50LnNwbGl0KCdcXG4nKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gQ3JlYXRlIHJlZ2V4IHBhdHRlcm4gKHN1cHBvcnQgYm90aCBzdHJpbmcgYW5kIHJlZ2V4IHBhdHRlcm5zKVxuICAgICAgICAgICAgbGV0IHJlZ2V4OiBSZWdFeHA7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHJlZ2V4ID0gbmV3IFJlZ0V4cChwYXR0ZXJuLCAnZ2knKTtcbiAgICAgICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgICAgIC8vIElmIHBhdHRlcm4gaXMgbm90IHZhbGlkIHJlZ2V4LCB0cmVhdCBhcyBsaXRlcmFsIHN0cmluZ1xuICAgICAgICAgICAgICAgIHJlZ2V4ID0gbmV3IFJlZ0V4cChwYXR0ZXJuLnJlcGxhY2UoL1suKis/XiR7fSgpfFtcXF1cXFxcXS9nLCAnXFxcXCQmJyksICdnaScpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICBjb25zdCBhbGxNYXRjaGVzID0gc2VhcmNoV2l0aENvbnRleHQobG9nTGluZXMsIHJlZ2V4LCBjb250ZXh0TGluZXMpO1xuICAgICAgICAgICAgY29uc3QgbWF0Y2hlcyA9IGFsbE1hdGNoZXMuc2xpY2UoMCwgbWF4UmVzdWx0cykubWFwKG0gPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGNvbnRleHRMaW5lc0FycmF5ID0gW107XG4gICAgICAgICAgICAgICAgbGV0IGN1cnJlbnRMaW5lTnVtID0gbS5tYXRjaExpbmUgLSBtLmJlZm9yZS5sZW5ndGg7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCBsaW5lIG9mIG0uYmVmb3JlKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRleHRMaW5lc0FycmF5LnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgbGluZU51bWJlcjogY3VycmVudExpbmVOdW0rKyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRlbnQ6IGxpbmUsXG4gICAgICAgICAgICAgICAgICAgICAgICBpc01hdGNoOiBmYWxzZVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgY29udGV4dExpbmVzQXJyYXkucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgIGxpbmVOdW1iZXI6IG0ubWF0Y2hMaW5lLFxuICAgICAgICAgICAgICAgICAgICBjb250ZW50OiBtLm1hdGNoLFxuICAgICAgICAgICAgICAgICAgICBpc01hdGNoOiB0cnVlXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgY3VycmVudExpbmVOdW0rKztcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGxpbmUgb2YgbS5hZnRlcikge1xuICAgICAgICAgICAgICAgICAgICBjb250ZXh0TGluZXNBcnJheS5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxpbmVOdW1iZXI6IGN1cnJlbnRMaW5lTnVtKyssXG4gICAgICAgICAgICAgICAgICAgICAgICBjb250ZW50OiBsaW5lLFxuICAgICAgICAgICAgICAgICAgICAgICAgaXNNYXRjaDogZmFsc2VcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgIGxpbmVOdW1iZXI6IG0ubWF0Y2hMaW5lLFxuICAgICAgICAgICAgICAgICAgICBtYXRjaGVkTGluZTogbS5tYXRjaCxcbiAgICAgICAgICAgICAgICAgICAgY29udGV4dDogY29udGV4dExpbmVzQXJyYXlcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgICAgIHBhdHRlcm46IHBhdHRlcm4sXG4gICAgICAgICAgICAgICAgICAgIHRvdGFsTWF0Y2hlczogYWxsTWF0Y2hlcy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgIG1heFJlc3VsdHM6IG1heFJlc3VsdHMsXG4gICAgICAgICAgICAgICAgICAgIGNvbnRleHRMaW5lczogY29udGV4dExpbmVzLFxuICAgICAgICAgICAgICAgICAgICBsb2dGaWxlUGF0aDogbG9nRmlsZVBhdGgsXG4gICAgICAgICAgICAgICAgICAgIG1hdGNoZXM6IG1hdGNoZXNcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoYEZhaWxlZCB0byBzZWFyY2ggcHJvamVjdCBsb2dzOiAke2Vycm9yLm1lc3NhZ2V9YCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGZvcm1hdEZpbGVTaXplKGJ5dGVzOiBudW1iZXIpOiBzdHJpbmcge1xuICAgICAgICBjb25zdCB1bml0cyA9IFsnQicsICdLQicsICdNQicsICdHQiddO1xuICAgICAgICBsZXQgc2l6ZSA9IGJ5dGVzO1xuICAgICAgICBsZXQgdW5pdEluZGV4ID0gMDtcblxuICAgICAgICB3aGlsZSAoc2l6ZSA+PSAxMDI0ICYmIHVuaXRJbmRleCA8IHVuaXRzLmxlbmd0aCAtIDEpIHtcbiAgICAgICAgICAgIHNpemUgLz0gMTAyNDtcbiAgICAgICAgICAgIHVuaXRJbmRleCsrO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGAke3NpemUudG9GaXhlZCgyKX0gJHt1bml0c1t1bml0SW5kZXhdfWA7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBwaWNrV2luZG93KHRpdGxlU3Vic3RyaW5nPzogc3RyaW5nKTogYW55IHtcbiAgICAgICAgLy8gTGF6eSByZXF1aXJlIHNvIHRoYXQgbm9uLUVsZWN0cm9uIGNvbnRleHRzIChlLmcuIHVuaXQgdGVzdHMsIHNtb2tlXG4gICAgICAgIC8vIHNjcmlwdCB3aXRoIHN0dWIgcmVnaXN0cnkpIGNhbiBzdGlsbCBpbXBvcnQgdGhpcyBtb2R1bGUuXG4gICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tdmFyLXJlcXVpcmVzXG4gICAgICAgIGNvbnN0IGVsZWN0cm9uID0gcmVxdWlyZSgnZWxlY3Ryb24nKTtcbiAgICAgICAgY29uc3QgQlcgPSBlbGVjdHJvbi5Ccm93c2VyV2luZG93O1xuICAgICAgICBpZiAoIUJXKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0VsZWN0cm9uIEJyb3dzZXJXaW5kb3cgQVBJIHVuYXZhaWxhYmxlOyBzY3JlZW5zaG90IHRvb2wgcmVxdWlyZXMgcnVubmluZyBpbnNpZGUgQ29jb3MgZWRpdG9yIGhvc3QgcHJvY2Vzcy4nKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGl0bGVTdWJzdHJpbmcpIHtcbiAgICAgICAgICAgIGNvbnN0IG1hdGNoZXMgPSBCVy5nZXRBbGxXaW5kb3dzKCkuZmlsdGVyKCh3OiBhbnkpID0+XG4gICAgICAgICAgICAgICAgdyAmJiAhdy5pc0Rlc3Ryb3llZCgpICYmICh3LmdldFRpdGxlPy4oKSB8fCAnJykuaW5jbHVkZXModGl0bGVTdWJzdHJpbmcpKTtcbiAgICAgICAgICAgIGlmIChtYXRjaGVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgTm8gRWxlY3Ryb24gd2luZG93IHRpdGxlIG1hdGNoZWQgc3Vic3RyaW5nOiAke3RpdGxlU3Vic3RyaW5nfWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIG1hdGNoZXNbMF07XG4gICAgICAgIH1cbiAgICAgICAgLy8gdjIuMy4xIHJldmlldyBmaXg6IGZvY3VzZWQgd2luZG93IG1heSBiZSBhIHRyYW5zaWVudCBwcmV2aWV3IHBvcHVwLlxuICAgICAgICAvLyBQcmVmZXIgYSBub24tUHJldmlldyB3aW5kb3cgc28gZGVmYXVsdCBzY3JlZW5zaG90cyB0YXJnZXQgdGhlIG1haW5cbiAgICAgICAgLy8gZWRpdG9yIHN1cmZhY2UuIENhbGxlciBjYW4gc3RpbGwgcGFzcyB0aXRsZVN1YnN0cmluZz0nUHJldmlldycgdG9cbiAgICAgICAgLy8gZXhwbGljaXRseSB0YXJnZXQgdGhlIHByZXZpZXcgd2hlbiB3YW50ZWQuXG4gICAgICAgIGNvbnN0IGFsbDogYW55W10gPSBCVy5nZXRBbGxXaW5kb3dzKCkuZmlsdGVyKCh3OiBhbnkpID0+IHcgJiYgIXcuaXNEZXN0cm95ZWQoKSk7XG4gICAgICAgIGlmIChhbGwubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIGxpdmUgRWxlY3Ryb24gd2luZG93czsgY2Fubm90IGNhcHR1cmUgc2NyZWVuc2hvdC4nKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBpc1ByZXZpZXcgPSAodzogYW55KSA9PiAvcHJldmlldy9pLnRlc3Qody5nZXRUaXRsZT8uKCkgfHwgJycpO1xuICAgICAgICBjb25zdCBub25QcmV2aWV3ID0gYWxsLmZpbHRlcigodzogYW55KSA9PiAhaXNQcmV2aWV3KHcpKTtcbiAgICAgICAgY29uc3QgZm9jdXNlZCA9IEJXLmdldEZvY3VzZWRXaW5kb3c/LigpO1xuICAgICAgICBpZiAoZm9jdXNlZCAmJiAhZm9jdXNlZC5pc0Rlc3Ryb3llZCgpICYmICFpc1ByZXZpZXcoZm9jdXNlZCkpIHJldHVybiBmb2N1c2VkO1xuICAgICAgICBpZiAobm9uUHJldmlldy5sZW5ndGggPiAwKSByZXR1cm4gbm9uUHJldmlld1swXTtcbiAgICAgICAgcmV0dXJuIGFsbFswXTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGVuc3VyZUNhcHR1cmVEaXIoKTogeyBvazogdHJ1ZTsgZGlyOiBzdHJpbmcgfSB8IHsgb2s6IGZhbHNlOyBlcnJvcjogc3RyaW5nIH0ge1xuICAgICAgICBpZiAoIUVkaXRvci5Qcm9qZWN0IHx8ICFFZGl0b3IuUHJvamVjdC5wYXRoKSB7XG4gICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiAnRWRpdG9yLlByb2plY3QucGF0aCBpcyBub3QgYXZhaWxhYmxlOyBjYW5ub3QgcmVzb2x2ZSBjYXB0dXJlIG91dHB1dCBkaXJlY3RvcnkuJyB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGRpciA9IHBhdGguam9pbihFZGl0b3IuUHJvamVjdC5wYXRoLCAndGVtcCcsICdtY3AtY2FwdHVyZXMnKTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGZzLm1rZGlyU3luYyhkaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgICAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUsIGRpciB9O1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogYEZhaWxlZCB0byBjcmVhdGUgY2FwdHVyZSBkaXI6ICR7ZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpfWAgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIHYyLjguMCBULVYyOC0yIChjYXJyeW92ZXIgZnJvbSB2Mi43LjAgQ29kZXggc2luZ2xlLXJldmlld2VyIPCfn6EpXG4gICAgLy8g4oaSIHYyLjguMSByb3VuZC0xIGZpeCAoQ29kZXgg8J+UtCArIENsYXVkZSDwn5+hKTogdGhlIHYyLjguMCBoZWxwZXJcbiAgICAvLyByZWFscGF0aCdkIGBkaXJgIGFuZCBgcGF0aC5kaXJuYW1lKHBhdGguam9pbihkaXIsIGJhc2VuYW1lKSlgIGFuZFxuICAgIC8vIGNvbXBhcmVkIHRoZSB0d28g4oCUIGJ1dCB3aXRoIGEgZml4ZWQgYmFzZW5hbWUgdGhvc2UgZXhwcmVzc2lvbnMgYm90aFxuICAgIC8vIGNvbGxhcHNlIHRvIGBkaXJgLCBtYWtpbmcgdGhlIGVxdWFsaXR5IGNoZWNrIHRhdXRvbG9naWNhbC4gVGhlIGNoZWNrXG4gICAgLy8gcHJvdGVjdGVkIG5vdGhpbmcgaWYgYDxwcm9qZWN0Pi90ZW1wL21jcC1jYXB0dXJlc2AgaXRzZWxmIHdhcyBhXG4gICAgLy8gc3ltbGluayB0aGF0IGVzY2FwZXMgdGhlIHByb2plY3QgdHJlZS5cbiAgICAvL1xuICAgIC8vIFRydWUgZXNjYXBlIHByb3RlY3Rpb24gcmVxdWlyZXMgYW5jaG9yaW5nIGFnYWluc3QgdGhlIHByb2plY3Qgcm9vdC5cbiAgICAvLyBXZSBub3cgcmVhbHBhdGggQk9USCB0aGUgY2FwdHVyZSBkaXIgYW5kIGBFZGl0b3IuUHJvamVjdC5wYXRoYCBhbmRcbiAgICAvLyByZXF1aXJlIHRoZSByZXNvbHZlZCBjYXB0dXJlIGRpciB0byBiZSBpbnNpZGUgdGhlIHJlc29sdmVkIHByb2plY3RcbiAgICAvLyByb290IChlcXVhbGl0eSBPUiBgcmVhbERpci5zdGFydHNXaXRoKHJlYWxQcm9qZWN0Um9vdCArIHNlcClgKS5cbiAgICAvLyBUaGUgaW50cmEtZGlyIGNoZWNrIGlzIGtlcHQgZm9yIGNoZWFwIGRlZmVuc2UtaW4tZGVwdGggaW4gY2FzZSBhXG4gICAgLy8gZnV0dXJlIGJhc2VuYW1lIGdldHMgdHJhdmVyc2FsIGNoYXJhY3RlcnMgdGhyZWFkZWQgdGhyb3VnaC5cbiAgICAvL1xuICAgIC8vIFJldHVybnMgeyBvazogdHJ1ZSwgZmlsZVBhdGgsIGRpciB9IHdoZW4gc2FmZSB0byB3cml0ZSwgb3JcbiAgICAvLyB7IG9rOiBmYWxzZSwgZXJyb3IgfSB3aXRoIHRoZSBzYW1lIGVycm9yIGVudmVsb3BlIHNoYXBlIGFzXG4gICAgLy8gZW5zdXJlQ2FwdHVyZURpciBzbyBjYWxsZXJzIGNhbiBmYWxsIHRocm91Z2ggdGhlaXIgZXhpc3RpbmdcbiAgICAvLyBlcnJvci1yZXR1cm4gcGF0dGVybi5cbiAgICBwcml2YXRlIHJlc29sdmVBdXRvQ2FwdHVyZUZpbGUoYmFzZW5hbWU6IHN0cmluZyk6IHsgb2s6IHRydWU7IGZpbGVQYXRoOiBzdHJpbmc7IGRpcjogc3RyaW5nIH0gfCB7IG9rOiBmYWxzZTsgZXJyb3I6IHN0cmluZyB9IHtcbiAgICAgICAgY29uc3QgZGlyUmVzdWx0ID0gdGhpcy5lbnN1cmVDYXB0dXJlRGlyKCk7XG4gICAgICAgIGlmICghZGlyUmVzdWx0Lm9rKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBkaXJSZXN1bHQuZXJyb3IgfTtcbiAgICAgICAgY29uc3QgcHJvamVjdFBhdGg6IHN0cmluZyB8IHVuZGVmaW5lZCA9IEVkaXRvcj8uUHJvamVjdD8ucGF0aDtcbiAgICAgICAgaWYgKCFwcm9qZWN0UGF0aCkge1xuICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogJ0VkaXRvci5Qcm9qZWN0LnBhdGggaXMgbm90IGF2YWlsYWJsZTsgY2Fubm90IGFuY2hvciBjYXB0dXJlLWRpciBjb250YWlubWVudCBjaGVjay4nIH07XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZmlsZVBhdGggPSBwYXRoLmpvaW4oZGlyUmVzdWx0LmRpciwgYmFzZW5hbWUpO1xuICAgICAgICBsZXQgcmVhbERpcjogc3RyaW5nO1xuICAgICAgICBsZXQgcmVhbFBhcmVudDogc3RyaW5nO1xuICAgICAgICBsZXQgcmVhbFByb2plY3RSb290OiBzdHJpbmc7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBycDogYW55ID0gZnMucmVhbHBhdGhTeW5jIGFzIGFueTtcbiAgICAgICAgICAgIGNvbnN0IHJlc29sdmVSZWFsID0gcnAubmF0aXZlID8/IHJwO1xuICAgICAgICAgICAgcmVhbERpciA9IHJlc29sdmVSZWFsKGRpclJlc3VsdC5kaXIpO1xuICAgICAgICAgICAgcmVhbFBhcmVudCA9IHJlc29sdmVSZWFsKHBhdGguZGlybmFtZShmaWxlUGF0aCkpO1xuICAgICAgICAgICAgcmVhbFByb2plY3RSb290ID0gcmVzb2x2ZVJlYWwocHJvamVjdFBhdGgpO1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogYHNjcmVlbnNob3QgcGF0aCByZWFscGF0aCBmYWlsZWQ6ICR7ZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpfWAgfTtcbiAgICAgICAgfVxuICAgICAgICAvLyBEZWZlbnNlLWluLWRlcHRoOiBwYXJlbnQgb2YgdGhlIHJlc29sdmVkIGZpbGUgbXVzdCBlcXVhbCB0aGVcbiAgICAgICAgLy8gcmVzb2x2ZWQgY2FwdHVyZSBkaXIgKGNhdGNoZXMgZnV0dXJlIGJhc2VuYW1lcyB0aHJlYWRpbmcgYC4uYCkuXG4gICAgICAgIGlmIChwYXRoLnJlc29sdmUocmVhbFBhcmVudCkgIT09IHBhdGgucmVzb2x2ZShyZWFsRGlyKSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogJ3NjcmVlbnNob3Qgc2F2ZSBwYXRoIHJlc29sdmVkIG91dHNpZGUgdGhlIGNhcHR1cmUgZGlyZWN0b3J5JyB9O1xuICAgICAgICB9XG4gICAgICAgIC8vIFByaW1hcnkgcHJvdGVjdGlvbjogY2FwdHVyZSBkaXIgaXRzZWxmIG11c3QgcmVzb2x2ZSBpbnNpZGUgdGhlXG4gICAgICAgIC8vIHByb2plY3Qgcm9vdCwgc28gYSBzeW1saW5rIGNoYWluIG9uIGB0ZW1wL21jcC1jYXB0dXJlc2AgY2Fubm90XG4gICAgICAgIC8vIHBpdm90IHdyaXRlcyB0byBlLmcuIC9ldGMgb3IgQzpcXFdpbmRvd3MuXG4gICAgICAgIC8vIHYyLjkueCBwb2xpc2ggKENvZGV4IHIyIHNpbmdsZS3wn5+hIGZyb20gdjIuOC4xIHJldmlldyk6IHVzZVxuICAgICAgICAvLyBwYXRoLnJlbGF0aXZlIGluc3RlYWQgb2YgYHJvb3QgKyBwYXRoLnNlcGAgcHJlZml4IGNoZWNrIOKAlFxuICAgICAgICAvLyB3aGVuIHJvb3QgaXMgYSBkcml2ZSByb290IChgQzpcXGApLCBwYXRoLnJlc29sdmUgbm9ybWFsaXNlcyBpdFxuICAgICAgICAvLyB0byBgQzpcXFxcYCBhbmQgYHBhdGguc2VwYCBhZGRzIGFub3RoZXIgYFxcYCwgcHJvZHVjaW5nIGBDOlxcXFxcXFxcYFxuICAgICAgICAvLyB3aGljaCBhIGNhbmRpZGF0ZSBsaWtlIGBDOlxcXFxmb29gIGRvZXMgbm90IG1hdGNoLiBwYXRoLnJlbGF0aXZlXG4gICAgICAgIC8vIGFsc28gaGFuZGxlcyB0aGUgQzpcXGZvbyB2cyBDOlxcZm9vYmFyIHByZWZpeC1jb2xsaXNpb24gY2FzZS5cbiAgICAgICAgaWYgKCFpc1BhdGhXaXRoaW5Sb290KHJlYWxEaXIsIHJlYWxQcm9qZWN0Um9vdCkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGBjYXB0dXJlIGRpciByZXNvbHZlZCBvdXRzaWRlIHRoZSBwcm9qZWN0IHJvb3Q6ICR7cGF0aC5yZXNvbHZlKHJlYWxEaXIpfSBub3Qgd2l0aGluICR7cGF0aC5yZXNvbHZlKHJlYWxQcm9qZWN0Um9vdCl9YCB9O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7IG9rOiB0cnVlLCBmaWxlUGF0aCwgZGlyOiBkaXJSZXN1bHQuZGlyIH07XG4gICAgfVxuXG4gICAgLy8gdjIuOC4xIHJvdW5kLTEgZml4IChHZW1pbmkg8J+UtCArIENvZGV4IPCfn6EpOiB3aGVuIGNhbGxlciBwYXNzZXMgYW5cbiAgICAvLyBleHBsaWNpdCBzYXZlUGF0aCAvIHNhdmVQYXRoUHJlZml4LCB3ZSBzdGlsbCBuZWVkIHRoZSBzYW1lIHByb2plY3QtXG4gICAgLy8gcm9vdCBjb250YWlubWVudCBndWFyYW50ZWUgdGhhdCByZXNvbHZlQXV0b0NhcHR1cmVGaWxlIGdpdmVzIHRoZVxuICAgIC8vIGF1dG8tbmFtZWQgYnJhbmNoLiBBSS1nZW5lcmF0ZWQgYWJzb2x1dGUgcGF0aHMgY291bGQgb3RoZXJ3aXNlXG4gICAgLy8gd3JpdGUgb3V0c2lkZSB0aGUgcHJvamVjdCByb290LlxuICAgIC8vXG4gICAgLy8gVGhlIGNoZWNrIHJlc29sdmVzIHRoZSBwYXJlbnQgZGlyZWN0b3J5ICh0aGUgZmlsZSBpdHNlbGYgbWF5IG5vdFxuICAgIC8vIGV4aXN0IHlldCkgYW5kIHJlcXVpcmVzIGl0IHRvIGJlIGluc2lkZSBgcmVhbHBhdGgoRWRpdG9yLlByb2plY3QucGF0aClgLlxuICAgIHByaXZhdGUgYXNzZXJ0U2F2ZVBhdGhXaXRoaW5Qcm9qZWN0KHNhdmVQYXRoOiBzdHJpbmcpOiB7IG9rOiB0cnVlOyByZXNvbHZlZFBhdGg6IHN0cmluZyB9IHwgeyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmcgfSB7XG4gICAgICAgIGNvbnN0IHByb2plY3RQYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQgPSBFZGl0b3I/LlByb2plY3Q/LnBhdGg7XG4gICAgICAgIGlmICghcHJvamVjdFBhdGgpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6ICdFZGl0b3IuUHJvamVjdC5wYXRoIGlzIG5vdCBhdmFpbGFibGU7IGNhbm5vdCB2YWxpZGF0ZSBleHBsaWNpdCBzYXZlUGF0aC4nIH07XG4gICAgICAgIH1cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJwOiBhbnkgPSBmcy5yZWFscGF0aFN5bmMgYXMgYW55O1xuICAgICAgICAgICAgY29uc3QgcmVzb2x2ZVJlYWwgPSBycC5uYXRpdmUgPz8gcnA7XG4gICAgICAgICAgICBjb25zdCByZWFsUHJvamVjdFJvb3QgPSByZXNvbHZlUmVhbChwcm9qZWN0UGF0aCk7XG4gICAgICAgICAgICAvLyB2Mi44LjIgcmV0ZXN0IGZpeCAoQ29kZXggcjIg8J+foSAjMSk6IGEgcmVsYXRpdmUgc2F2ZVBhdGggd291bGRcbiAgICAgICAgICAgIC8vIG1ha2UgYHBhdGguZGlybmFtZShzYXZlUGF0aClgIGNvbGxhcHNlIHRvICcuJyBhbmQgcmVzb2x2ZSB0b1xuICAgICAgICAgICAgLy8gdGhlIGhvc3QgcHJvY2VzcyBjd2QgKG9mdGVuIGA8ZWRpdG9yLWluc3RhbGw+L0NvY29zRGFzaGJvYXJkYClcbiAgICAgICAgICAgIC8vIHJhdGhlciB0aGFuIHRoZSBwcm9qZWN0IHJvb3QuIEFuY2hvciByZWxhdGl2ZSBwYXRocyBhZ2FpbnN0XG4gICAgICAgICAgICAvLyB0aGUgcHJvamVjdCByb290IGV4cGxpY2l0bHkgc28gdGhlIEFJJ3MgaW50dWl0aXZlIFwicmVsYXRpdmVcbiAgICAgICAgICAgIC8vIHRvIG15IHByb2plY3RcIiBpbnRlcnByZXRhdGlvbiBpcyB3aGF0IHRoZSBjaGVjayBlbmZvcmNlcy5cbiAgICAgICAgICAgIGNvbnN0IGFic29sdXRlU2F2ZVBhdGggPSBwYXRoLmlzQWJzb2x1dGUoc2F2ZVBhdGgpXG4gICAgICAgICAgICAgICAgPyBzYXZlUGF0aFxuICAgICAgICAgICAgICAgIDogcGF0aC5yZXNvbHZlKHByb2plY3RQYXRoLCBzYXZlUGF0aCk7XG4gICAgICAgICAgICBjb25zdCBwYXJlbnQgPSBwYXRoLmRpcm5hbWUoYWJzb2x1dGVTYXZlUGF0aCk7XG4gICAgICAgICAgICAvLyBQYXJlbnQgbXVzdCBhbHJlYWR5IGV4aXN0IGZvciByZWFscGF0aDsgaWYgaXQgZG9lc24ndCwgdGhlXG4gICAgICAgICAgICAvLyB3cml0ZSB3b3VsZCBmYWlsIGFueXdheSwgYnV0IHJldHVybiBhIGNsZWFyZXIgZXJyb3IgaGVyZS5cbiAgICAgICAgICAgIGxldCByZWFsUGFyZW50OiBzdHJpbmc7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHJlYWxQYXJlbnQgPSByZXNvbHZlUmVhbChwYXJlbnQpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBgc2F2ZVBhdGggcGFyZW50IGRpciBtaXNzaW5nIG9yIHVucmVhZGFibGU6ICR7ZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpfWAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIHYyLjkueCBwb2xpc2ggKENvZGV4IHIyIHNpbmdsZS3wn5+hIGZyb20gdjIuOC4xIHJldmlldyk6IHNhbWVcbiAgICAgICAgICAgIC8vIHBhdGgucmVsYXRpdmUtYmFzZWQgY29udGFpbm1lbnQgYXMgcmVzb2x2ZUF1dG9DYXB0dXJlRmlsZS5cbiAgICAgICAgICAgIGlmICghaXNQYXRoV2l0aGluUm9vdChyZWFsUGFyZW50LCByZWFsUHJvamVjdFJvb3QpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgb2s6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICBlcnJvcjogYHNhdmVQYXRoIHJlc29sdmVkIG91dHNpZGUgdGhlIHByb2plY3Qgcm9vdDogJHtwYXRoLnJlc29sdmUocmVhbFBhcmVudCl9IG5vdCB3aXRoaW4gJHtwYXRoLnJlc29sdmUocmVhbFByb2plY3RSb290KX0uIFVzZSBhIHBhdGggaW5zaWRlIDxwcm9qZWN0Pi8gb3Igb21pdCBzYXZlUGF0aCB0byBhdXRvLW5hbWUgaW50byA8cHJvamVjdD4vdGVtcC9tY3AtY2FwdHVyZXMuYCxcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUsIHJlc29sdmVkUGF0aDogYWJzb2x1dGVTYXZlUGF0aCB9O1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogYHNhdmVQYXRoIHJlYWxwYXRoIGZhaWxlZDogJHtlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycil9YCB9O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBzY3JlZW5zaG90SW1wbChzYXZlUGF0aD86IHN0cmluZywgd2luZG93VGl0bGU/OiBzdHJpbmcsIGluY2x1ZGVCYXNlNjQ6IGJvb2xlYW4gPSBmYWxzZSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGxldCBmaWxlUGF0aCA9IHNhdmVQYXRoO1xuICAgICAgICBpZiAoIWZpbGVQYXRoKSB7XG4gICAgICAgICAgICBjb25zdCByZXNvbHZlZCA9IHRoaXMucmVzb2x2ZUF1dG9DYXB0dXJlRmlsZShgc2NyZWVuc2hvdC0ke0RhdGUubm93KCl9LnBuZ2ApO1xuICAgICAgICAgICAgaWYgKCFyZXNvbHZlZC5vaykgcmV0dXJuIGZhaWwocmVzb2x2ZWQuZXJyb3IpO1xuICAgICAgICAgICAgZmlsZVBhdGggPSByZXNvbHZlZC5maWxlUGF0aDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIHYyLjguMSByb3VuZC0xIGZpeCAoR2VtaW5pIPCflLQgKyBDb2RleCDwn5+hKTogZXhwbGljaXQgc2F2ZVBhdGhcbiAgICAgICAgICAgIC8vIGFsc28gZ2V0cyBjb250YWlubWVudC1jaGVja2VkLiBBSS1nZW5lcmF0ZWQgcGF0aHMgY291bGRcbiAgICAgICAgICAgIC8vIG90aGVyd2lzZSB3cml0ZSBvdXRzaWRlIHRoZSBwcm9qZWN0IHJvb3QuXG4gICAgICAgICAgICAvLyB2Mi44LjIgcmV0ZXN0IGZpeDogdXNlIHRoZSBoZWxwZXIncyByZXNvbHZlZFBhdGggc28gYVxuICAgICAgICAgICAgLy8gcmVsYXRpdmUgc2F2ZVBhdGggYWN0dWFsbHkgbGFuZHMgaW5zaWRlIHRoZSBwcm9qZWN0IHJvb3QuXG4gICAgICAgICAgICBjb25zdCBndWFyZCA9IHRoaXMuYXNzZXJ0U2F2ZVBhdGhXaXRoaW5Qcm9qZWN0KGZpbGVQYXRoKTtcbiAgICAgICAgICAgIGlmICghZ3VhcmQub2spIHJldHVybiBmYWlsKGd1YXJkLmVycm9yKTtcbiAgICAgICAgICAgIGZpbGVQYXRoID0gZ3VhcmQucmVzb2x2ZWRQYXRoO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHdpbiA9IHRoaXMucGlja1dpbmRvdyh3aW5kb3dUaXRsZSk7XG4gICAgICAgIGNvbnN0IGltYWdlID0gYXdhaXQgd2luLndlYkNvbnRlbnRzLmNhcHR1cmVQYWdlKCk7XG4gICAgICAgIGNvbnN0IHBuZzogQnVmZmVyID0gaW1hZ2UudG9QTkcoKTtcbiAgICAgICAgZnMud3JpdGVGaWxlU3luYyhmaWxlUGF0aCwgcG5nKTtcbiAgICAgICAgY29uc3QgZGF0YTogYW55ID0ge1xuICAgICAgICAgICAgZmlsZVBhdGgsXG4gICAgICAgICAgICBzaXplOiBwbmcubGVuZ3RoLFxuICAgICAgICAgICAgd2luZG93VGl0bGU6IHR5cGVvZiB3aW4uZ2V0VGl0bGUgPT09ICdmdW5jdGlvbicgPyB3aW4uZ2V0VGl0bGUoKSA6ICcnLFxuICAgICAgICB9O1xuICAgICAgICBpZiAoaW5jbHVkZUJhc2U2NCkge1xuICAgICAgICAgICAgZGF0YS5kYXRhVXJpID0gYGRhdGE6aW1hZ2UvcG5nO2Jhc2U2NCwke3BuZy50b1N0cmluZygnYmFzZTY0Jyl9YDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gb2soZGF0YSwgYFNjcmVlbnNob3Qgc2F2ZWQgdG8gJHtmaWxlUGF0aH1gKTtcbiAgICB9XG5cbiAgICAvLyB2Mi43LjAgIzQ6IFByZXZpZXctd2luZG93IHNjcmVlbnNob3QuXG4gICAgLy8gdjIuOC4zIFQtVjI4My0xOiBleHRlbmRlZCB0byBoYW5kbGUgY29jb3MgZW1iZWRkZWQgcHJldmlldyBtb2RlLlxuICAgIC8vXG4gICAgLy8gTW9kZSBkaXNwYXRjaDpcbiAgICAvLyAgIC0gXCJ3aW5kb3dcIjogICByZXF1aXJlIGEgUHJldmlldy10aXRsZWQgQnJvd3NlcldpbmRvdzsgZmFpbCBpZiBub25lLlxuICAgIC8vICAgICAgICAgICAgICAgICBPcmlnaW5hbCB2Mi43LjAgYmVoYXZpb3VyLiBVc2Ugd2hlbiBjb2NvcyBwcmV2aWV3XG4gICAgLy8gICAgICAgICAgICAgICAgIGNvbmZpZyBpcyBcIndpbmRvd1wiIC8gXCJzaW11bGF0b3JcIiAoc2VwYXJhdGUgd2luZG93KS5cbiAgICAvLyAgIC0gXCJlbWJlZGRlZFwiOiBza2lwIHRoZSB3aW5kb3cgcHJvYmUgYW5kIGNhcHR1cmUgdGhlIG1haW4gZWRpdG9yXG4gICAgLy8gICAgICAgICAgICAgICAgIEJyb3dzZXJXaW5kb3cgZGlyZWN0bHkuIFVzZSB3aGVuIGNvY29zIHByZXZpZXcgY29uZmlnXG4gICAgLy8gICAgICAgICAgICAgICAgIGlzIFwiZW1iZWRkZWRcIiAoZ2FtZXZpZXcgcmVuZGVycyBpbnNpZGUgbWFpbiBlZGl0b3IpLlxuICAgIC8vICAgLSBcImF1dG9cIjogICAgIHRyeSBcIndpbmRvd1wiIGZpcnN0OyBpZiBubyBQcmV2aWV3LXRpdGxlZCB3aW5kb3cgaXNcbiAgICAvLyAgICAgICAgICAgICAgICAgZm91bmQsIGZhbGwgYmFjayB0byBcImVtYmVkZGVkXCIgYW5kIHN1cmZhY2UgYSBoaW50XG4gICAgLy8gICAgICAgICAgICAgICAgIGluIHRoZSByZXNwb25zZSBtZXNzYWdlLiBEZWZhdWx0IOKAlCBrZWVwcyB0aGUgaGFwcHlcbiAgICAvLyAgICAgICAgICAgICAgICAgcGF0aCB3b3JraW5nIHdpdGhvdXQgY2FsbGVyIGtub3dsZWRnZSBvZiBjb2Nvc1xuICAgIC8vICAgICAgICAgICAgICAgICBwcmV2aWV3IGNvbmZpZy5cbiAgICAvL1xuICAgIC8vIEJyb3dzZXItbW9kZSAoUElFIHJlbmRlcmVkIHRvIHVzZXIncyBleHRlcm5hbCBicm93c2VyIHZpYVxuICAgIC8vIHNoZWxsLm9wZW5FeHRlcm5hbCkgaXMgTk9UIGNhcHR1cmFibGUgaGVyZSDigJQgdGhlIHBhZ2UgbGl2ZXMgaW5cbiAgICAvLyBhIG5vbi1FbGVjdHJvbiBicm93c2VyIHByb2Nlc3MuIEFJIGNhbiBkZXRlY3QgdGhpcyB2aWFcbiAgICAvLyBkZWJ1Z19nZXRfcHJldmlld19tb2RlIGFuZCBza2lwIHRoZSBjYWxsLlxuICAgIHByaXZhdGUgYXN5bmMgY2FwdHVyZVByZXZpZXdTY3JlZW5zaG90SW1wbChcbiAgICAgICAgc2F2ZVBhdGg/OiBzdHJpbmcsXG4gICAgICAgIG1vZGU6ICdhdXRvJyB8ICd3aW5kb3cnIHwgJ2VtYmVkZGVkJyA9ICdhdXRvJyxcbiAgICAgICAgd2luZG93VGl0bGU6IHN0cmluZyA9ICdQcmV2aWV3JyxcbiAgICAgICAgaW5jbHVkZUJhc2U2NDogYm9vbGVhbiA9IGZhbHNlLFxuICAgICk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tdmFyLXJlcXVpcmVzXG4gICAgICAgIGNvbnN0IGVsZWN0cm9uID0gcmVxdWlyZSgnZWxlY3Ryb24nKTtcbiAgICAgICAgY29uc3QgQlcgPSBlbGVjdHJvbi5Ccm93c2VyV2luZG93O1xuXG4gICAgICAgICAgICAvLyBSZXNvbHZlIHRoZSB0YXJnZXQgd2luZG93IHBlciBtb2RlLlxuICAgICAgICBjb25zdCBwcm9iZVdpbmRvd01vZGUgPSAoKTogeyBvazogdHJ1ZTsgd2luOiBhbnkgfSB8IHsgb2s6IGZhbHNlOyBlcnJvcjogc3RyaW5nOyB2aXNpYmxlVGl0bGVzOiBzdHJpbmdbXSB9ID0+IHtcbiAgICAgICAgICAgIC8vIHYyLjcuMSByZXZpZXcgZml4IChjbGF1ZGUg8J+foSArIGNvZGV4IPCfn6EpOiB3aXRoIHRoZSBkZWZhdWx0XG4gICAgICAgICAgICAvLyB3aW5kb3dUaXRsZT0nUHJldmlldycgYSBDaGluZXNlIC8gbG9jYWxpemVkIGNvY29zIGVkaXRvclxuICAgICAgICAgICAgLy8gd2hvc2UgbWFpbiB3aW5kb3cgdGl0bGUgY29udGFpbnMgXCJQcmV2aWV3XCIgKGUuZy4gXCJDb2Nvc1xuICAgICAgICAgICAgLy8gQ3JlYXRvciBQcmV2aWV3IC0gPFByb2plY3ROYW1lPlwiKSB3b3VsZCBmYWxzZWx5IG1hdGNoLlxuICAgICAgICAgICAgLy8gRGlzYW1iaWd1YXRlIGJ5IGV4Y2x1ZGluZyBhbnkgdGl0bGUgdGhhdCBBTFNPIGNvbnRhaW5zXG4gICAgICAgICAgICAvLyBcIkNvY29zIENyZWF0b3JcIiB3aGVuIHRoZSBjYWxsZXIgc3R1Y2sgd2l0aCB0aGUgZGVmYXVsdC5cbiAgICAgICAgICAgIGNvbnN0IHVzaW5nRGVmYXVsdCA9IHdpbmRvd1RpdGxlID09PSAnUHJldmlldyc7XG4gICAgICAgICAgICBjb25zdCBhbGxUaXRsZXM6IHN0cmluZ1tdID0gQlc/LmdldEFsbFdpbmRvd3M/LigpPy5tYXAoKHc6IGFueSkgPT4gdy5nZXRUaXRsZT8uKCkgPz8gJycpLmZpbHRlcihCb29sZWFuKSA/PyBbXTtcbiAgICAgICAgICAgIGNvbnN0IG1hdGNoZXMgPSBCVz8uZ2V0QWxsV2luZG93cz8uKCk/LmZpbHRlcigodzogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKCF3IHx8IHcuaXNEZXN0cm95ZWQoKSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIGNvbnN0IHRpdGxlID0gdy5nZXRUaXRsZT8uKCkgfHwgJyc7XG4gICAgICAgICAgICAgICAgaWYgKCF0aXRsZS5pbmNsdWRlcyh3aW5kb3dUaXRsZSkpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICBpZiAodXNpbmdEZWZhdWx0ICYmIC9Db2Nvc1xccypDcmVhdG9yL2kudGVzdCh0aXRsZSkpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH0pID8/IFtdO1xuICAgICAgICAgICAgaWYgKG1hdGNoZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogYE5vIEVsZWN0cm9uIHdpbmRvdyB0aXRsZSBjb250YWlucyBcIiR7d2luZG93VGl0bGV9XCIke3VzaW5nRGVmYXVsdCA/ICcgKGFuZCBpcyBub3QgdGhlIG1haW4gZWRpdG9yKScgOiAnJ30uYCwgdmlzaWJsZVRpdGxlczogYWxsVGl0bGVzIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4geyBvazogdHJ1ZSwgd2luOiBtYXRjaGVzWzBdIH07XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3QgcHJvYmVFbWJlZGRlZE1vZGUgPSAoKTogeyBvazogdHJ1ZTsgd2luOiBhbnkgfSB8IHsgb2s6IGZhbHNlOyBlcnJvcjogc3RyaW5nIH0gPT4ge1xuICAgICAgICAgICAgLy8gRW1iZWRkZWQgUElFIHJlbmRlcnMgaW5zaWRlIHRoZSBtYWluIGVkaXRvciBCcm93c2VyV2luZG93LlxuICAgICAgICAgICAgLy8gUGljayB0aGUgc2FtZSBoZXVyaXN0aWMgYXMgcGlja1dpbmRvdygpOiBwcmVmZXIgYSBub24tXG4gICAgICAgICAgICAvLyBQcmV2aWV3IHdpbmRvdy4gQ29jb3MgbWFpbiBlZGl0b3IncyB0aXRsZSB0eXBpY2FsbHlcbiAgICAgICAgICAgIC8vIGNvbnRhaW5zIFwiQ29jb3MgQ3JlYXRvclwiIOKAlCBtYXRjaCB0aGF0IHRvIGlkZW50aWZ5IGl0LlxuICAgICAgICAgICAgY29uc3QgYWxsOiBhbnlbXSA9IEJXPy5nZXRBbGxXaW5kb3dzPy4oKT8uZmlsdGVyKCh3OiBhbnkpID0+IHcgJiYgIXcuaXNEZXN0cm95ZWQoKSkgPz8gW107XG4gICAgICAgICAgICBpZiAoYWxsLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6ICdObyBsaXZlIEVsZWN0cm9uIHdpbmRvd3MgYXZhaWxhYmxlOyBjYW5ub3QgY2FwdHVyZSBlbWJlZGRlZCBwcmV2aWV3LicgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIFByZWZlciB0aGUgZWRpdG9yIG1haW4gd2luZG93ICh0aXRsZSBjb250YWlucyBcIkNvY29zXG4gICAgICAgICAgICAvLyBDcmVhdG9yXCIpIOKAlCB0aGF0J3Mgd2hlcmUgZW1iZWRkZWQgUElFIHJlbmRlcnMuXG4gICAgICAgICAgICBjb25zdCBlZGl0b3IgPSBhbGwuZmluZCgodzogYW55KSA9PiAvQ29jb3NcXHMqQ3JlYXRvci9pLnRlc3Qody5nZXRUaXRsZT8uKCkgfHwgJycpKTtcbiAgICAgICAgICAgIGlmIChlZGl0b3IpIHJldHVybiB7IG9rOiB0cnVlLCB3aW46IGVkaXRvciB9O1xuICAgICAgICAgICAgLy8gRmFsbGJhY2s6IGFueSBub24tRGV2VG9vbHMgLyBub24tV29ya2VyIC8gbm9uLUJsYW5rIHdpbmRvdy5cbiAgICAgICAgICAgIGNvbnN0IGNhbmRpZGF0ZSA9IGFsbC5maW5kKCh3OiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCB0ID0gdy5nZXRUaXRsZT8uKCkgfHwgJyc7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHQgJiYgIS9EZXZUb29sc3xXb3JrZXIgLXxeQmxhbmskLy50ZXN0KHQpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBpZiAoY2FuZGlkYXRlKSByZXR1cm4geyBvazogdHJ1ZSwgd2luOiBjYW5kaWRhdGUgfTtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6ICdObyBzdWl0YWJsZSBlZGl0b3Igd2luZG93IGZvdW5kIGZvciBlbWJlZGRlZCBwcmV2aWV3IGNhcHR1cmUuJyB9O1xuICAgICAgICB9O1xuXG4gICAgICAgIGxldCB3aW46IGFueSA9IG51bGw7XG4gICAgICAgIGxldCBjYXB0dXJlTm90ZTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgICAgIGxldCByZXNvbHZlZE1vZGU6ICd3aW5kb3cnIHwgJ2VtYmVkZGVkJyA9ICd3aW5kb3cnO1xuXG4gICAgICAgIGlmIChtb2RlID09PSAnd2luZG93Jykge1xuICAgICAgICAgICAgY29uc3QgciA9IHByb2JlV2luZG93TW9kZSgpO1xuICAgICAgICAgICAgaWYgKCFyLm9rKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoYCR7ci5lcnJvcn0gTGF1bmNoIGNvY29zIHByZXZpZXcgZmlyc3QgdmlhIHRoZSB0b29sYmFyIHBsYXkgYnV0dG9uIG9yIHZpYSBkZWJ1Z19wcmV2aWV3X3VybChhY3Rpb249XCJvcGVuXCIpLiBJZiB5b3VyIGNvY29zIHByZXZpZXcgaXMgc2V0IHRvIFwiZW1iZWRkZWRcIiwgY2FsbCB0aGlzIHRvb2wgd2l0aCBtb2RlPVwiZW1iZWRkZWRcIiBvciBtb2RlPVwiYXV0b1wiLiBWaXNpYmxlIHdpbmRvdyB0aXRsZXM6ICR7ci52aXNpYmxlVGl0bGVzLmpvaW4oJywgJykgfHwgJyhub25lKSd9YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB3aW4gPSByLndpbjtcbiAgICAgICAgICAgIHJlc29sdmVkTW9kZSA9ICd3aW5kb3cnO1xuICAgICAgICB9IGVsc2UgaWYgKG1vZGUgPT09ICdlbWJlZGRlZCcpIHtcbiAgICAgICAgICAgIGNvbnN0IHIgPSBwcm9iZUVtYmVkZGVkTW9kZSgpO1xuICAgICAgICAgICAgaWYgKCFyLm9rKSByZXR1cm4gZmFpbChyLmVycm9yKTtcbiAgICAgICAgICAgIHdpbiA9IHIud2luO1xuICAgICAgICAgICAgcmVzb2x2ZWRNb2RlID0gJ2VtYmVkZGVkJztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIGF1dG9cbiAgICAgICAgICAgIGNvbnN0IHdyID0gcHJvYmVXaW5kb3dNb2RlKCk7XG4gICAgICAgICAgICBpZiAod3Iub2spIHtcbiAgICAgICAgICAgICAgICB3aW4gPSB3ci53aW47XG4gICAgICAgICAgICAgICAgcmVzb2x2ZWRNb2RlID0gJ3dpbmRvdyc7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbnN0IGVyID0gcHJvYmVFbWJlZGRlZE1vZGUoKTtcbiAgICAgICAgICAgICAgICBpZiAoIWVyLm9rKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKGAke3dyLmVycm9yfSAke2VyLmVycm9yfSBMYXVuY2ggY29jb3MgcHJldmlldyBmaXJzdCBvciBjaGVjayBkZWJ1Z19nZXRfcHJldmlld19tb2RlIHRvIHNlZSBob3cgY29jb3MgaXMgY29uZmlndXJlZC4gVmlzaWJsZSB3aW5kb3cgdGl0bGVzOiAke3dyLnZpc2libGVUaXRsZXMuam9pbignLCAnKSB8fCAnKG5vbmUpJ31gKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgd2luID0gZXIud2luO1xuICAgICAgICAgICAgICAgIHJlc29sdmVkTW9kZSA9ICdlbWJlZGRlZCc7XG4gICAgICAgICAgICAgICAgICAgIC8vIHYyLjguNCByZXRlc3QgZmluZGluZzogd2hlbiBjb2NvcyBwcmV2aWV3IGlzIHNldFxuICAgICAgICAgICAgICAgICAgICAvLyB0byBcImJyb3dzZXJcIiwgYXV0by1mYWxsYmFjayBBTFNPIGdyYWJzIHRoZSBtYWluXG4gICAgICAgICAgICAgICAgICAgIC8vIGVkaXRvciB3aW5kb3cgKGJlY2F1c2Ugbm8gUHJldmlldy10aXRsZWQgd2luZG93XG4gICAgICAgICAgICAgICAgICAgIC8vIGV4aXN0cykg4oCUIGJ1dCBpbiBicm93c2VyIG1vZGUgdGhlIGFjdHVhbCBnYW1ldmlld1xuICAgICAgICAgICAgICAgICAgICAvLyBsaXZlcyBpbiB0aGUgdXNlcidzIGV4dGVybmFsIGJyb3dzZXIsIE5PVCBpbiB0aGVcbiAgICAgICAgICAgICAgICAgICAgLy8gY2FwdHVyZWQgRWxlY3Ryb24gd2luZG93LiBEb24ndCBjbGFpbSBcImVtYmVkZGVkXG4gICAgICAgICAgICAgICAgICAgIC8vIHByZXZpZXcgbW9kZVwiIOKAlCB0aGF0J3MgYSBndWVzcywgYW5kIHdyb25nIHdoZW5cbiAgICAgICAgICAgICAgICAgICAgLy8gdXNlciBpcyBvbiBicm93c2VyIGNvbmZpZy4gUHJvYmUgdGhlIHJlYWwgY29uZmlnXG4gICAgICAgICAgICAgICAgICAgIC8vIGFuZCB0YWlsb3IgdGhlIGhpbnQgcGVyIG1vZGUuXG4gICAgICAgICAgICAgICAgbGV0IGFjdHVhbE1vZGU6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNmZzogYW55ID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdChcbiAgICAgICAgICAgICAgICAgICAgICAgICdwcmVmZXJlbmNlcycsICdxdWVyeS1jb25maWcnIGFzIGFueSwgJ3ByZXZpZXcnIGFzIGFueSxcbiAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcGxhdGZvcm0gPSBjZmc/LnByZXZpZXc/LmN1cnJlbnQ/LnBsYXRmb3JtO1xuICAgICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHBsYXRmb3JtID09PSAnc3RyaW5nJykgYWN0dWFsTW9kZSA9IHBsYXRmb3JtO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgICAgICAgICAvLyBiZXN0LWVmZm9ydDsgZmFsbCB0aHJvdWdoIHdpdGggbmV1dHJhbCBoaW50XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChhY3R1YWxNb2RlID09PSAnYnJvd3NlcicpIHtcbiAgICAgICAgICAgICAgICAgICAgY2FwdHVyZU5vdGUgPSAnTm8gUHJldmlldy10aXRsZWQgd2luZG93IGZvdW5kOyBjYXB0dXJlZCB0aGUgbWFpbiBlZGl0b3Igd2luZG93LiBOT1RFOiBjb2NvcyBwcmV2aWV3IGlzIHNldCB0byBcImJyb3dzZXJcIiDigJQgdGhlIGFjdHVhbCBwcmV2aWV3IGNvbnRlbnQgaXMgcmVuZGVyZWQgaW4geW91ciBleHRlcm5hbCBicm93c2VyIChOT1QgaW4gdGhpcyBpbWFnZSkuIEZvciBydW50aW1lIGNhbnZhcyBjYXB0dXJlIGluIGJyb3dzZXIgbW9kZSB1c2UgZGVidWdfZ2FtZV9jb21tYW5kKHR5cGU9XCJzY3JlZW5zaG90XCIpIHZpYSBhIEdhbWVEZWJ1Z0NsaWVudCBydW5uaW5nIG9uIHRoZSBicm93c2VyIHByZXZpZXcgcGFnZS4nO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoYWN0dWFsTW9kZSA9PT0gJ2dhbWVWaWV3Jykge1xuICAgICAgICAgICAgICAgICAgICBjYXB0dXJlTm90ZSA9ICdObyBQcmV2aWV3LXRpdGxlZCB3aW5kb3cgZm91bmQ7IGNhcHR1cmVkIHRoZSBtYWluIGVkaXRvciB3aW5kb3cgKGNvY29zIHByZXZpZXcgaXMgc2V0IHRvIFwiZ2FtZVZpZXdcIiBlbWJlZGRlZCDigJQgdGhlIGVkaXRvciBnYW1ldmlldyBJUyB3aGVyZSBwcmV2aWV3IHJlbmRlcnMsIHNvIHRoaXMgaW1hZ2UgaXMgY29ycmVjdCkuJztcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGFjdHVhbE1vZGUpIHtcbiAgICAgICAgICAgICAgICAgICAgY2FwdHVyZU5vdGUgPSBgTm8gUHJldmlldy10aXRsZWQgd2luZG93IGZvdW5kOyBjYXB0dXJlZCB0aGUgbWFpbiBlZGl0b3Igd2luZG93LiBjb2NvcyBwcmV2aWV3IGlzIHNldCB0byBcIiR7YWN0dWFsTW9kZX1cIiDigJQgdmVyaWZ5IHRoaXMgaW1hZ2UgYWN0dWFsbHkgY29udGFpbnMgdGhlIGdhbWV2aWV3IHlvdSB3YW50ZWQ7IGZvciBydW50aW1lIGNhbnZhcyBjYXB0dXJlIHByZWZlciBkZWJ1Z19nYW1lX2NvbW1hbmQgdmlhIEdhbWVEZWJ1Z0NsaWVudC5gO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGNhcHR1cmVOb3RlID0gJ05vIFByZXZpZXctdGl0bGVkIHdpbmRvdyBmb3VuZDsgY2FwdHVyZWQgdGhlIG1haW4gZWRpdG9yIHdpbmRvdy4gQ291bGQgbm90IGRldGVybWluZSBjb2NvcyBwcmV2aWV3IG1vZGUgKGRlYnVnX2dldF9wcmV2aWV3X21vZGUgbWlnaHQgZ2l2ZSBtb3JlIGluZm8pLiBJZiB5b3VyIGNvY29zIHByZXZpZXcgaXMgc2V0IHRvIFwiYnJvd3NlclwiLCB0aGUgYWN0dWFsIHByZXZpZXcgY29udGVudCBpcyBpbiB5b3VyIGV4dGVybmFsIGJyb3dzZXIgYW5kIGlzIE5PVCBpbiB0aGlzIGltYWdlLic7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgbGV0IGZpbGVQYXRoID0gc2F2ZVBhdGg7XG4gICAgICAgIGlmICghZmlsZVBhdGgpIHtcbiAgICAgICAgICAgIGNvbnN0IHJlc29sdmVkID0gdGhpcy5yZXNvbHZlQXV0b0NhcHR1cmVGaWxlKGBwcmV2aWV3LSR7RGF0ZS5ub3coKX0ucG5nYCk7XG4gICAgICAgICAgICBpZiAoIXJlc29sdmVkLm9rKSByZXR1cm4gZmFpbChyZXNvbHZlZC5lcnJvcik7XG4gICAgICAgICAgICBmaWxlUGF0aCA9IHJlc29sdmVkLmZpbGVQYXRoO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gdjIuOC4xIHJvdW5kLTEgZml4IChHZW1pbmkg8J+UtCArIENvZGV4IPCfn6EpOiBleHBsaWNpdCBzYXZlUGF0aFxuICAgICAgICAgICAgLy8gYWxzbyBnZXRzIGNvbnRhaW5tZW50LWNoZWNrZWQuXG4gICAgICAgICAgICAvLyB2Mi44LjIgcmV0ZXN0IGZpeDogdXNlIHJlc29sdmVkUGF0aCBmb3IgcmVsYXRpdmUtcGF0aCBzdXBwb3J0LlxuICAgICAgICAgICAgY29uc3QgZ3VhcmQgPSB0aGlzLmFzc2VydFNhdmVQYXRoV2l0aGluUHJvamVjdChmaWxlUGF0aCk7XG4gICAgICAgICAgICBpZiAoIWd1YXJkLm9rKSByZXR1cm4gZmFpbChndWFyZC5lcnJvcik7XG4gICAgICAgICAgICBmaWxlUGF0aCA9IGd1YXJkLnJlc29sdmVkUGF0aDtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBpbWFnZSA9IGF3YWl0IHdpbi53ZWJDb250ZW50cy5jYXB0dXJlUGFnZSgpO1xuICAgICAgICBjb25zdCBwbmc6IEJ1ZmZlciA9IGltYWdlLnRvUE5HKCk7XG4gICAgICAgIGZzLndyaXRlRmlsZVN5bmMoZmlsZVBhdGgsIHBuZyk7XG4gICAgICAgIGNvbnN0IGRhdGE6IGFueSA9IHtcbiAgICAgICAgICAgIGZpbGVQYXRoLFxuICAgICAgICAgICAgc2l6ZTogcG5nLmxlbmd0aCxcbiAgICAgICAgICAgIHdpbmRvd1RpdGxlOiB0eXBlb2Ygd2luLmdldFRpdGxlID09PSAnZnVuY3Rpb24nID8gd2luLmdldFRpdGxlKCkgOiAnJyxcbiAgICAgICAgICAgIG1vZGU6IHJlc29sdmVkTW9kZSxcbiAgICAgICAgfTtcbiAgICAgICAgaWYgKGNhcHR1cmVOb3RlKSBkYXRhLm5vdGUgPSBjYXB0dXJlTm90ZTtcbiAgICAgICAgaWYgKGluY2x1ZGVCYXNlNjQpIHtcbiAgICAgICAgICAgIGRhdGEuZGF0YVVyaSA9IGBkYXRhOmltYWdlL3BuZztiYXNlNjQsJHtwbmcudG9TdHJpbmcoJ2Jhc2U2NCcpfWA7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgbWVzc2FnZSA9IGNhcHR1cmVOb3RlXG4gICAgICAgICAgICA/IGBQcmV2aWV3IHNjcmVlbnNob3Qgc2F2ZWQgdG8gJHtmaWxlUGF0aH0gKCR7Y2FwdHVyZU5vdGV9KWBcbiAgICAgICAgICAgIDogYFByZXZpZXcgc2NyZWVuc2hvdCBzYXZlZCB0byAke2ZpbGVQYXRofSAobW9kZT0ke3Jlc29sdmVkTW9kZX0pYDtcbiAgICAgICAgcmV0dXJuIG9rKGRhdGEsIG1lc3NhZ2UpO1xuICAgIH1cblxuICAgIC8vIHYyLjguMyBULVYyODMtMjogcmVhZCBjb2NvcyBwcmV2aWV3IGNvbmZpZyBzbyBBSSBjYW4gcm91dGVcbiAgICAvLyBjYXB0dXJlX3ByZXZpZXdfc2NyZWVuc2hvdCB0byB0aGUgY29ycmVjdCBtb2RlIHdpdGhvdXQgZ3Vlc3NpbmcuXG4gICAgLy8gUmVhZHMgdmlhIEVkaXRvci5NZXNzYWdlIHByZWZlcmVuY2VzL3F1ZXJ5LWNvbmZpZyAodHlwZWQgaW5cbiAgICAvLyBub2RlX21vZHVsZXMvQGNvY29zL2NyZWF0b3ItdHlwZXMvLi4uL3ByZWZlcmVuY2VzL0B0eXBlcy9tZXNzYWdlLmQudHMpLlxuICAgIC8vXG4gICAgLy8gV2UgZHVtcCB0aGUgZnVsbCAncHJldmlldycgY2F0ZWdvcnksIHRoZW4gdHJ5IHRvIGludGVycHJldCBhIGZld1xuICAgIC8vIGNvbW1vbiBrZXlzICgnb3Blbl9wcmV2aWV3X3dpdGgnLCAncHJldmlld193aXRoJywgJ3NpbXVsYXRvcicsXG4gICAgLy8gJ2Jyb3dzZXInKSBpbnRvIGEgbm9ybWFsaXplZCBtb2RlIGxhYmVsLiBJZiBpbnRlcnByZXRhdGlvbiBmYWlscyxcbiAgICAvLyB3ZSBzdGlsbCByZXR1cm4gdGhlIHJhdyBjb25maWcgc28gdGhlIEFJIGNhbiByZWFkIGl0IGRpcmVjdGx5LlxuICAgIHByaXZhdGUgYXN5bmMgZ2V0UHJldmlld01vZGVJbXBsKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBQcm9iZSBhdCBtb2R1bGUgbGV2ZWwgKG5vIGtleSkgdG8gZ2V0IHRoZSB3aG9sZSBjYXRlZ29yeS5cbiAgICAgICAgICAgIGNvbnN0IHJhdzogYW55ID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgncHJlZmVyZW5jZXMnLCAncXVlcnktY29uZmlnJyBhcyBhbnksICdwcmV2aWV3JyBhcyBhbnkpIGFzIGFueTtcbiAgICAgICAgICAgIGlmIChyYXcgPT09IHVuZGVmaW5lZCB8fCByYXcgPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFpbCgncHJlZmVyZW5jZXMvcXVlcnktY29uZmlnIHJldHVybmVkIG51bGwgZm9yIFwicHJldmlld1wiIOKAlCBjb2NvcyBtYXkgbm90IGV4cG9zZSB0aGlzIGNhdGVnb3J5LCBvciB5b3VyIGJ1aWxkIGRpZmZlcnMgZnJvbSAzLjgueC4nKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIEhldXJpc3RpYyBpbnRlcnByZXRhdGlvbi5cbiAgICAgICAgICAgIC8vIHYyLjguMyByZXRlc3QgZmluZGluZzogY29jb3MgMy44LjcgYWN0dWFsbHkgc3RvcmVzIHRoZVxuICAgICAgICAgICAgLy8gYWN0aXZlIG1vZGUgYXQgYHByZXZpZXcuY3VycmVudC5wbGF0Zm9ybWAgd2l0aCB2YWx1ZVxuICAgICAgICAgICAgLy8gYFwiZ2FtZVZpZXdcImAgKGVtYmVkZGVkKSwgYFwiYnJvd3NlclwiYCwgb3IgZGV2aWNlIG5hbWVzXG4gICAgICAgICAgICAvLyAoc2ltdWxhdG9yKS4gVGhlIG9yaWdpbmFsIGhldXJpc3RpYyBvbmx5IGNoZWNrZWQga2V5cyBsaWtlXG4gICAgICAgICAgICAvLyBgb3Blbl9wcmV2aWV3X3dpdGhgIC8gYHByZXZpZXdfd2l0aGAgLyBgb3Blbl93aXRoYCAvIGBtb2RlYFxuICAgICAgICAgICAgLy8gYW5kIG1pc3NlZCB0aGUgbGl2ZSBrZXkuIFByb2JlIGBjdXJyZW50LnBsYXRmb3JtYCBmaXJzdDtcbiAgICAgICAgICAgIC8vIGtlZXAgdGhlIGxlZ2FjeSBrZXlzIGFzIGZhbGxiYWNrIGZvciBvbGRlciBjb2NvcyB2ZXJzaW9ucy5cbiAgICAgICAgICAgIGNvbnN0IGxvd2VyID0gKHM6IGFueSkgPT4gKHR5cGVvZiBzID09PSAnc3RyaW5nJyA/IHMudG9Mb3dlckNhc2UoKSA6ICcnKTtcbiAgICAgICAgICAgIGxldCBpbnRlcnByZXRlZDogJ2Jyb3dzZXInIHwgJ3dpbmRvdycgfCAnc2ltdWxhdG9yJyB8ICdlbWJlZGRlZCcgfCAndW5rbm93bicgPSAndW5rbm93bic7XG4gICAgICAgICAgICBsZXQgaW50ZXJwcmV0ZWRGcm9tS2V5OiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgICAgICAgICAgIGNvbnN0IGNsYXNzaWZ5ID0gKHY6IHN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGx2ID0gbG93ZXIodik7XG4gICAgICAgICAgICAgICAgaWYgKGx2LmluY2x1ZGVzKCdicm93c2VyJykpIHJldHVybiAnYnJvd3Nlcic7XG4gICAgICAgICAgICAgICAgaWYgKGx2LmluY2x1ZGVzKCdzaW11bGF0b3InKSkgcmV0dXJuICdzaW11bGF0b3InO1xuICAgICAgICAgICAgICAgIGlmIChsdi5pbmNsdWRlcygnZW1iZWQnKSB8fCBsdi5pbmNsdWRlcygnZ2FtZXZpZXcnKSB8fCBsdi5pbmNsdWRlcygnZ2FtZV92aWV3JykpIHJldHVybiAnZW1iZWRkZWQnO1xuICAgICAgICAgICAgICAgIGlmIChsdi5pbmNsdWRlcygnd2luZG93JykpIHJldHVybiAnd2luZG93JztcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBjb25zdCBkaWcgPSAob2JqOiBhbnksIHBhdGg6IHN0cmluZyk6IGFueSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKCFvYmogfHwgdHlwZW9mIG9iaiAhPT0gJ29iamVjdCcpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgY29uc3QgcGFydHMgPSBwYXRoLnNwbGl0KCcuJyk7XG4gICAgICAgICAgICAgICAgbGV0IGN1cjogYW55ID0gb2JqO1xuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgcCBvZiBwYXJ0cykge1xuICAgICAgICAgICAgICAgICAgICBpZiAoIWN1ciB8fCB0eXBlb2YgY3VyICE9PSAnb2JqZWN0JykgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHAgaW4gY3VyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjdXIgPSBjdXJbcF07XG4gICAgICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAvLyBUcnkgb25lIGxldmVsIG9mIG5lc3QgKHNvbWV0aW1lcyB0aGUgY2F0ZWdvcnkgZHVtcFxuICAgICAgICAgICAgICAgICAgICAvLyBuZXN0cyB1bmRlciBhIGRlZmF1bHQtcHJvdG9jb2wgYnVja2V0KS5cbiAgICAgICAgICAgICAgICAgICAgbGV0IGZvdW5kID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIGZvciAoY29uc3QgdiBvZiBPYmplY3QudmFsdWVzKGN1cikpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh2ICYmIHR5cGVvZiB2ID09PSAnb2JqZWN0JyAmJiBwIGluICh2IGFzIGFueSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjdXIgPSAodiBhcyBhbnkpW3BdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvdW5kID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZiAoIWZvdW5kKSByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gY3VyO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGNvbnN0IHByb2JlS2V5cyA9IFtcbiAgICAgICAgICAgICAgICAncHJldmlldy5jdXJyZW50LnBsYXRmb3JtJyxcbiAgICAgICAgICAgICAgICAnY3VycmVudC5wbGF0Zm9ybScsXG4gICAgICAgICAgICAgICAgJ3ByZXZpZXcub3Blbl9wcmV2aWV3X3dpdGgnLFxuICAgICAgICAgICAgICAgICdvcGVuX3ByZXZpZXdfd2l0aCcsXG4gICAgICAgICAgICAgICAgJ3ByZXZpZXdfd2l0aCcsXG4gICAgICAgICAgICAgICAgJ29wZW5fd2l0aCcsXG4gICAgICAgICAgICAgICAgJ21vZGUnLFxuICAgICAgICAgICAgXTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgayBvZiBwcm9iZUtleXMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB2ID0gZGlnKHJhdywgayk7XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiB2ID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjbHMgPSBjbGFzc2lmeSh2KTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNscykge1xuICAgICAgICAgICAgICAgICAgICAgICAgaW50ZXJwcmV0ZWQgPSBjbHM7XG4gICAgICAgICAgICAgICAgICAgICAgICBpbnRlcnByZXRlZEZyb21LZXkgPSBgJHtrfT0ke3Z9YDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIC8vIE5vbi1lbXB0eSBzdHJpbmcgdGhhdCBkaWRuJ3QgbWF0Y2ggYSBrbm93biBsYWJlbCDihpJcbiAgICAgICAgICAgICAgICAgICAgLy8gcmVjb3JkIGFzICdzaW11bGF0b3InIGNhbmRpZGF0ZSBpZiBpdCBsb29rcyBsaWtlIGFcbiAgICAgICAgICAgICAgICAgICAgLy8gZGV2aWNlIG5hbWUgKGUuZy4gXCJBcHBsZSBpUGhvbmUgMTQgUHJvXCIpLCBvdGhlcndpc2VcbiAgICAgICAgICAgICAgICAgICAgLy8ga2VlcCBzZWFyY2hpbmcuXG4gICAgICAgICAgICAgICAgICAgIGlmICgvaVBob25lfGlQYWR8SFVBV0VJfFhpYW9taXxTb255fEFzdXN8T1BQT3xIb25vcnxOb2tpYXxMZW5vdm98U2Ftc3VuZ3xHb29nbGV8UGl4ZWwvaS50ZXN0KHYpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpbnRlcnByZXRlZCA9ICdzaW11bGF0b3InO1xuICAgICAgICAgICAgICAgICAgICAgICAgaW50ZXJwcmV0ZWRGcm9tS2V5ID0gYCR7a309JHt2fWA7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBvayh7IGludGVycHJldGVkLCBpbnRlcnByZXRlZEZyb21LZXksIHJhdyB9LCBpbnRlcnByZXRlZCA9PT0gJ3Vua25vd24nXG4gICAgICAgICAgICAgICAgICAgID8gJ1JlYWQgY29jb3MgcHJldmlldyBjb25maWcgYnV0IGNvdWxkIG5vdCBpbnRlcnByZXQgYSBtb2RlIGxhYmVsOyBpbnNwZWN0IGRhdGEucmF3IGFuZCBwYXNzIG1vZGU9IGV4cGxpY2l0bHkgdG8gY2FwdHVyZV9wcmV2aWV3X3NjcmVlbnNob3QuJ1xuICAgICAgICAgICAgICAgICAgICA6IGBjb2NvcyBwcmV2aWV3IGlzIGNvbmZpZ3VyZWQgYXMgXCIke2ludGVycHJldGVkfVwiIChmcm9tIGtleSBcIiR7aW50ZXJwcmV0ZWRGcm9tS2V5fVwiKS4gUGFzcyBtb2RlPVwiJHtpbnRlcnByZXRlZCA9PT0gJ2Jyb3dzZXInID8gJ3dpbmRvdycgOiBpbnRlcnByZXRlZH1cIiB0byBjYXB0dXJlX3ByZXZpZXdfc2NyZWVuc2hvdCwgb3IgcmVseSBvbiBtb2RlPVwiYXV0b1wiLmApO1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoYHByZWZlcmVuY2VzL3F1ZXJ5LWNvbmZpZyAncHJldmlldycgZmFpbGVkOiAke2Vycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKX1gKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIHYyLjEwIFQtVjIxMC0xOiBoYXJkLWZhaWwgYnkgZGVmYXVsdC4gUGVyIGNyb3NzLXJlcG8gcmVmcmVzaFxuICAgIC8vIDIwMjYtMDUtMDIsIG5vbmUgb2YgNiBzdXJ2ZXllZCBjb2Nvcy1tY3AgcGVlcnMgc2hpcCBhIHdvcmtpbmdcbiAgICAvLyBwcmV2aWV3LW1vZGUgc2V0dGVyIOKAlCB0aGUgY29jb3MgMy44LjcgcHJldmlldyBjYXRlZ29yeSBpc1xuICAgIC8vIGVmZmVjdGl2ZWx5IHJlYWRvbmx5IHRvIHRoaXJkLXBhcnR5IGV4dGVuc2lvbnMgKGxhbmRtaW5lICMxNykuXG4gICAgLy8gRGVmYXVsdCBiZWhhdmlvciBpcyBub3cgTk9UX1NVUFBPUlRFRCB3aXRoIGEgVUkgcmVkaXJlY3QuXG4gICAgLy9cbiAgICAvLyBUaGUgNC1zdHJhdGVneSBwcm9iZSBpcyBwcmVzZXJ2ZWQgYmVoaW5kIGBhdHRlbXB0QW55d2F5PXRydWVgXG4gICAgLy8gc28gYSBmdXR1cmUgY29jb3MgYnVpbGQgY2FuIGJlIHZhbGlkYXRlZCBxdWlja2x5OiByZWFkIHRoZVxuICAgIC8vIHJldHVybmVkIGRhdGEuYXR0ZW1wdHMgbG9nIHRvIHNlZSB3aGV0aGVyIGFueSBzaGFwZSBub3cgd29ya3MuXG4gICAgLy8gVGhlIHNldHRlciBkb2VzIE5PVCBmcmVlemUgdGhlIGVkaXRvciAoc2V0LWNvbmZpZyBzaWxlbnRseVxuICAgIC8vIG5vLW9wcywgY2YuIHByZXZpZXdfY29udHJvbCB3aGljaCBET0VTIGZyZWV6ZSDigJQgbGFuZG1pbmUgIzE2KS5cbiAgICAvL1xuICAgIC8vIFN0cmF0ZWdpZXMgdHJpZWQgaW4gb3JkZXI6XG4gICAgLy8gICAxLiAoJ3ByZXZpZXcnLCAnY3VycmVudCcsIHsgcGxhdGZvcm06IHZhbHVlIH0pICDigJQgbmVzdGVkIG9iamVjdFxuICAgIC8vICAgMi4gKCdwcmV2aWV3JywgJ2N1cnJlbnQucGxhdGZvcm0nLCB2YWx1ZSwgJ2dsb2JhbCcpIOKAlCBleHBsaWNpdCBwcm90b2NvbFxuICAgIC8vICAgMy4gKCdwcmV2aWV3JywgJ2N1cnJlbnQucGxhdGZvcm0nLCB2YWx1ZSwgJ2xvY2FsJykgIOKAlCBleHBsaWNpdCBwcm90b2NvbFxuICAgIC8vICAgNC4gKCdwcmV2aWV3JywgJ2N1cnJlbnQucGxhdGZvcm0nLCB2YWx1ZSkgICAgICAgICAg4oCUIG5vIHByb3RvY29sXG4gICAgcHJpdmF0ZSBhc3luYyBzZXRQcmV2aWV3TW9kZUltcGwobW9kZTogJ2Jyb3dzZXInIHwgJ2dhbWVWaWV3JyB8ICdzaW11bGF0b3InLCBhdHRlbXB0QW55d2F5OiBib29sZWFuKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHF1ZXJ5Q3VycmVudCA9IGFzeW5jICgpOiBQcm9taXNlPHN0cmluZyB8IG51bGw+ID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBjZmc6IGFueSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3ByZWZlcmVuY2VzJywgJ3F1ZXJ5LWNvbmZpZycgYXMgYW55LCAncHJldmlldycgYXMgYW55KSBhcyBhbnk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNmZz8ucHJldmlldz8uY3VycmVudD8ucGxhdGZvcm0gPz8gbnVsbDtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBjb25zdCBwcmV2aW91c01vZGUgPSBhd2FpdCBxdWVyeUN1cnJlbnQoKTtcbiAgICAgICAgICAgIGlmICghYXR0ZW1wdEFueXdheSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKGBkZWJ1Z19zZXRfcHJldmlld19tb2RlIGlzIE5PVCBTVVBQT1JURUQgb24gY29jb3MgMy44LjcrIChsYW5kbWluZSAjMTcpLiBQcm9ncmFtbWF0aWMgcHJldmlldy1tb2RlIHN3aXRjaGluZyBoYXMgbm8gd29ya2luZyBJUEMgcGF0aDogcHJlZmVyZW5jZXMvc2V0LWNvbmZpZyByZXR1cm5zIHRydXRoeSBidXQgZG9lcyBub3QgcGVyc2lzdCwgYW5kIDYgc3VydmV5ZWQgcmVmZXJlbmNlIHByb2plY3RzIChoYXJhZHkgLyBTcGF5ZG8gLyBSb21hUm9nb3YgLyBjb2Nvcy1jb2RlLW1vZGUgLyBGdW5wbGF5QUkgLyBjb2Nvcy1jbGkpIGFsbCBjb25maXJtIG5vIHdvcmtpbmcgYWx0ZXJuYXRpdmUgZXhpc3RzLiAqKlN3aXRjaCB2aWEgdGhlIGNvY29zIHByZXZpZXcgZHJvcGRvd24gaW4gdGhlIGVkaXRvciB0b29sYmFyIGluc3RlYWQqKiAoY3VycmVudCBtb2RlOiBcIiR7cHJldmlvdXNNb2RlID8/ICd1bmtub3duJ31cIiwgcmVxdWVzdGVkOiBcIiR7bW9kZX1cIikuIFRvIHJlLXByb2JlIHdoZXRoZXIgYSBuZXdlciBjb2NvcyBidWlsZCBub3cgZXhwb3NlcyBhIHdyaXRlIHBhdGgsIHJlLWNhbGwgd2l0aCBhdHRlbXB0QW55d2F5PXRydWUgKGRpYWdub3N0aWMgb25seSDigJQgZG9lcyBOT1QgZnJlZXplIHRoZSBlZGl0b3IpLmAsIHsgcHJldmlvdXNNb2RlLCByZXF1ZXN0ZWRNb2RlOiBtb2RlLCBzdXBwb3J0ZWQ6IGZhbHNlIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHByZXZpb3VzTW9kZSA9PT0gbW9kZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBvayh7IHByZXZpb3VzTW9kZSwgbmV3TW9kZTogbW9kZSwgY29uZmlybWVkOiB0cnVlLCBub09wOiB0cnVlIH0sIGBjb2NvcyBwcmV2aWV3IGFscmVhZHkgc2V0IHRvIFwiJHttb2RlfVwiOyBubyBjaGFuZ2UgYXBwbGllZC5gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHR5cGUgU3RyYXRlZ3kgPSB7IGlkOiBzdHJpbmc7IHBheWxvYWQ6ICgpID0+IFByb21pc2U8YW55PiB9O1xuICAgICAgICAgICAgY29uc3Qgc3RyYXRlZ2llczogU3RyYXRlZ3lbXSA9IFtcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIGlkOiBcInNldC1jb25maWcoJ3ByZXZpZXcnLCdjdXJyZW50Jyx7cGxhdGZvcm06dmFsdWV9KVwiLFxuICAgICAgICAgICAgICAgICAgICBwYXlsb2FkOiAoKSA9PiBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KFxuICAgICAgICAgICAgICAgICAgICAgICAgJ3ByZWZlcmVuY2VzJywgJ3NldC1jb25maWcnIGFzIGFueSxcbiAgICAgICAgICAgICAgICAgICAgICAgICdwcmV2aWV3JyBhcyBhbnksICdjdXJyZW50JyBhcyBhbnksXG4gICAgICAgICAgICAgICAgICAgICAgICB7IHBsYXRmb3JtOiBtb2RlIH0gYXMgYW55LFxuICAgICAgICAgICAgICAgICAgICApLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBpZDogXCJzZXQtY29uZmlnKCdwcmV2aWV3JywnY3VycmVudC5wbGF0Zm9ybScsdmFsdWUsJ2dsb2JhbCcpXCIsXG4gICAgICAgICAgICAgICAgICAgIHBheWxvYWQ6ICgpID0+IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoXG4gICAgICAgICAgICAgICAgICAgICAgICAncHJlZmVyZW5jZXMnLCAnc2V0LWNvbmZpZycgYXMgYW55LFxuICAgICAgICAgICAgICAgICAgICAgICAgJ3ByZXZpZXcnIGFzIGFueSwgJ2N1cnJlbnQucGxhdGZvcm0nIGFzIGFueSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1vZGUgYXMgYW55LCAnZ2xvYmFsJyBhcyBhbnksXG4gICAgICAgICAgICAgICAgICAgICksXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIGlkOiBcInNldC1jb25maWcoJ3ByZXZpZXcnLCdjdXJyZW50LnBsYXRmb3JtJyx2YWx1ZSwnbG9jYWwnKVwiLFxuICAgICAgICAgICAgICAgICAgICBwYXlsb2FkOiAoKSA9PiBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KFxuICAgICAgICAgICAgICAgICAgICAgICAgJ3ByZWZlcmVuY2VzJywgJ3NldC1jb25maWcnIGFzIGFueSxcbiAgICAgICAgICAgICAgICAgICAgICAgICdwcmV2aWV3JyBhcyBhbnksICdjdXJyZW50LnBsYXRmb3JtJyBhcyBhbnksXG4gICAgICAgICAgICAgICAgICAgICAgICBtb2RlIGFzIGFueSwgJ2xvY2FsJyBhcyBhbnksXG4gICAgICAgICAgICAgICAgICAgICksXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIGlkOiBcInNldC1jb25maWcoJ3ByZXZpZXcnLCdjdXJyZW50LnBsYXRmb3JtJyx2YWx1ZSlcIixcbiAgICAgICAgICAgICAgICAgICAgcGF5bG9hZDogKCkgPT4gRWRpdG9yLk1lc3NhZ2UucmVxdWVzdChcbiAgICAgICAgICAgICAgICAgICAgICAgICdwcmVmZXJlbmNlcycsICdzZXQtY29uZmlnJyBhcyBhbnksXG4gICAgICAgICAgICAgICAgICAgICAgICAncHJldmlldycgYXMgYW55LCAnY3VycmVudC5wbGF0Zm9ybScgYXMgYW55LFxuICAgICAgICAgICAgICAgICAgICAgICAgbW9kZSBhcyBhbnksXG4gICAgICAgICAgICAgICAgICAgICksXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIF07XG4gICAgICAgICAgICBjb25zdCBhdHRlbXB0czogQXJyYXk8eyBzdHJhdGVneTogc3RyaW5nOyBzZXRSZXN1bHQ6IGFueTsgb2JzZXJ2ZWRNb2RlOiBzdHJpbmcgfCBudWxsOyBtYXRjaGVkOiBib29sZWFuOyBlcnJvcj86IHN0cmluZyB9PiA9IFtdO1xuICAgICAgICAgICAgbGV0IHdpbm5lcjogdHlwZW9mIGF0dGVtcHRzW251bWJlcl0gfCBudWxsID0gbnVsbDtcbiAgICAgICAgICAgIGZvciAoY29uc3QgcyBvZiBzdHJhdGVnaWVzKSB7XG4gICAgICAgICAgICAgICAgbGV0IHNldFJlc3VsdDogYW55ID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIGxldCBlcnJvcjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIHNldFJlc3VsdCA9IGF3YWl0IHMucGF5bG9hZCgpO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICAgICAgICAgIGVycm9yID0gZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBvYnNlcnZlZE1vZGUgPSBhd2FpdCBxdWVyeUN1cnJlbnQoKTtcbiAgICAgICAgICAgICAgICBjb25zdCBtYXRjaGVkID0gb2JzZXJ2ZWRNb2RlID09PSBtb2RlO1xuICAgICAgICAgICAgICAgIGF0dGVtcHRzLnB1c2goeyBzdHJhdGVneTogcy5pZCwgc2V0UmVzdWx0LCBvYnNlcnZlZE1vZGUsIG1hdGNoZWQsIGVycm9yIH0pO1xuICAgICAgICAgICAgICAgIGlmIChtYXRjaGVkKSB7XG4gICAgICAgICAgICAgICAgICAgIHdpbm5lciA9IGF0dGVtcHRzW2F0dGVtcHRzLmxlbmd0aCAtIDFdO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIXdpbm5lcikge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKGBzZXQtY29uZmlnIHN0cmF0ZWdpZXMgYWxsIGZhaWxlZCB0byBmbGlwIHByZXZpZXcuY3VycmVudC5wbGF0Zm9ybSBmcm9tIFwiJHtwcmV2aW91c01vZGUgPz8gJ3Vua25vd24nfVwiIHRvIFwiJHttb2RlfVwiLiBUcmllZCA0IHNoYXBlczsgY29jb3MgcmV0dXJuZWQgdmFsdWVzIGJ1dCB0aGUgcmVhZC1iYWNrIG5ldmVyIG1hdGNoZWQgdGhlIHJlcXVlc3RlZCBtb2RlLiBUaGUgc2V0LWNvbmZpZyBjaGFubmVsIG1heSBoYXZlIGNoYW5nZWQgaW4gdGhpcyBjb2NvcyBidWlsZDsgc3dpdGNoIHZpYSB0aGUgY29jb3MgcHJldmlldyBkcm9wZG93biBtYW51YWxseSBmb3Igbm93IGFuZCByZXBvcnQgd2hpY2ggc2hhcGUgd29ya3MuYCwgeyBwcmV2aW91c01vZGUsIHJlcXVlc3RlZE1vZGU6IG1vZGUsIGF0dGVtcHRzIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIG9rKHsgcHJldmlvdXNNb2RlLCBuZXdNb2RlOiBtb2RlLCBjb25maXJtZWQ6IHRydWUsIHN0cmF0ZWd5OiB3aW5uZXIuc3RyYXRlZ3ksIGF0dGVtcHRzIH0sIGBjb2NvcyBwcmV2aWV3IHN3aXRjaGVkOiBcIiR7cHJldmlvdXNNb2RlID8/ICd1bmtub3duJ31cIiDihpIgXCIke21vZGV9XCIgdmlhICR7d2lubmVyLnN0cmF0ZWd5fS4gUmVzdG9yZSB2aWEgZGVidWdfc2V0X3ByZXZpZXdfbW9kZShtb2RlPVwiJHtwcmV2aW91c01vZGUgPz8gJ2Jyb3dzZXInfVwiLCBjb25maXJtPXRydWUpIHdoZW4gZG9uZSBpZiBuZWVkZWQuYCk7XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChgcHJlZmVyZW5jZXMvc2V0LWNvbmZpZyAncHJldmlldycgZmFpbGVkOiAke2Vycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKX1gKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgYmF0Y2hTY3JlZW5zaG90SW1wbChzYXZlUGF0aFByZWZpeD86IHN0cmluZywgZGVsYXlzTXM6IG51bWJlcltdID0gWzBdLCB3aW5kb3dUaXRsZT86IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGxldCBwcmVmaXggPSBzYXZlUGF0aFByZWZpeDtcbiAgICAgICAgaWYgKCFwcmVmaXgpIHtcbiAgICAgICAgICAgIC8vIGJhc2VuYW1lIGlzIHRoZSBwcmVmaXggc3RlbTsgcGVyLWl0ZXJhdGlvbiBmaWxlcyBleHRlbmQgaXRcbiAgICAgICAgICAgIC8vIHdpdGggYC0ke2l9LnBuZ2AuIENvbnRhaW5tZW50IGNoZWNrIG9uIHRoZSBwcmVmaXggcGF0aCBpc1xuICAgICAgICAgICAgLy8gc3VmZmljaWVudCBiZWNhdXNlIHBhdGguam9pbiBwcmVzZXJ2ZXMgZGlybmFtZSBmb3IgYW55XG4gICAgICAgICAgICAvLyBzdWZmaXggdGhlIGxvb3AgYXBwZW5kcy5cbiAgICAgICAgICAgIGNvbnN0IHJlc29sdmVkID0gdGhpcy5yZXNvbHZlQXV0b0NhcHR1cmVGaWxlKGBiYXRjaC0ke0RhdGUubm93KCl9YCk7XG4gICAgICAgICAgICBpZiAoIXJlc29sdmVkLm9rKSByZXR1cm4gZmFpbChyZXNvbHZlZC5lcnJvcik7XG4gICAgICAgICAgICBwcmVmaXggPSByZXNvbHZlZC5maWxlUGF0aDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIHYyLjguMSByb3VuZC0xIGZpeCAoR2VtaW5pIPCflLQgKyBDb2RleCDwn5+hKTogZXhwbGljaXQgcHJlZml4XG4gICAgICAgICAgICAvLyBhbHNvIGdldHMgY29udGFpbm1lbnQtY2hlY2tlZC4gV2UgY2hlY2sgdGhlIHByZWZpeCBwYXRoXG4gICAgICAgICAgICAvLyBpdHNlbGYg4oCUIGV2ZXJ5IGVtaXR0ZWQgZmlsZSBsaXZlcyBpbiB0aGUgc2FtZSBkaXJuYW1lLlxuICAgICAgICAgICAgLy8gdjIuOC4yIHJldGVzdCBmaXg6IHVzZSByZXNvbHZlZFBhdGggZm9yIHJlbGF0aXZlLXByZWZpeCBzdXBwb3J0LlxuICAgICAgICAgICAgY29uc3QgZ3VhcmQgPSB0aGlzLmFzc2VydFNhdmVQYXRoV2l0aGluUHJvamVjdChwcmVmaXgpO1xuICAgICAgICAgICAgaWYgKCFndWFyZC5vaykgcmV0dXJuIGZhaWwoZ3VhcmQuZXJyb3IpO1xuICAgICAgICAgICAgcHJlZml4ID0gZ3VhcmQucmVzb2x2ZWRQYXRoO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHdpbiA9IHRoaXMucGlja1dpbmRvdyh3aW5kb3dUaXRsZSk7XG4gICAgICAgIGNvbnN0IGNhcHR1cmVzOiBhbnlbXSA9IFtdO1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGRlbGF5c01zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBkZWxheSA9IGRlbGF5c01zW2ldO1xuICAgICAgICAgICAgaWYgKGRlbGF5ID4gMCkge1xuICAgICAgICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCBkZWxheSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgZmlsZVBhdGggPSBgJHtwcmVmaXh9LSR7aX0ucG5nYDtcbiAgICAgICAgICAgIGNvbnN0IGltYWdlID0gYXdhaXQgd2luLndlYkNvbnRlbnRzLmNhcHR1cmVQYWdlKCk7XG4gICAgICAgICAgICBjb25zdCBwbmc6IEJ1ZmZlciA9IGltYWdlLnRvUE5HKCk7XG4gICAgICAgICAgICBmcy53cml0ZUZpbGVTeW5jKGZpbGVQYXRoLCBwbmcpO1xuICAgICAgICAgICAgY2FwdHVyZXMucHVzaCh7IGluZGV4OiBpLCBkZWxheU1zOiBkZWxheSwgZmlsZVBhdGgsIHNpemU6IHBuZy5sZW5ndGggfSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG9rKHtcbiAgICAgICAgICAgICAgICBjb3VudDogY2FwdHVyZXMubGVuZ3RoLFxuICAgICAgICAgICAgICAgIHdpbmRvd1RpdGxlOiB0eXBlb2Ygd2luLmdldFRpdGxlID09PSAnZnVuY3Rpb24nID8gd2luLmdldFRpdGxlKCkgOiAnJyxcbiAgICAgICAgICAgICAgICBjYXB0dXJlcyxcbiAgICAgICAgICAgIH0sIGBDYXB0dXJlZCAke2NhcHR1cmVzLmxlbmd0aH0gc2NyZWVuc2hvdHNgKTtcbiAgICB9XG5cbiAgICAvLyB2Mi43LjAgIzM6IHByZXZpZXctdXJsIC8gcXVlcnktZGV2aWNlcyBoYW5kbGVycyAtLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICAgIHByaXZhdGUgYXN5bmMgcHJldmlld1VybEltcGwoYWN0aW9uOiAncXVlcnknIHwgJ29wZW4nID0gJ3F1ZXJ5Jyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHVybDogc3RyaW5nID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgncHJldmlldycsICdxdWVyeS1wcmV2aWV3LXVybCcgYXMgYW55KSBhcyBhbnk7XG4gICAgICAgIGlmICghdXJsIHx8IHR5cGVvZiB1cmwgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbCgncHJldmlldy9xdWVyeS1wcmV2aWV3LXVybCByZXR1cm5lZCBlbXB0eSByZXN1bHQ7IGNoZWNrIHRoYXQgY29jb3MgcHJldmlldyBzZXJ2ZXIgaXMgcnVubmluZycpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGRhdGE6IGFueSA9IHsgdXJsIH07XG4gICAgICAgIGlmIChhY3Rpb24gPT09ICdvcGVuJykge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAvLyBMYXp5IHJlcXVpcmUgc28gc21va2UgLyBub24tRWxlY3Ryb24gY29udGV4dHMgZG9uJ3QgZmF1bHRcbiAgICAgICAgICAgICAgICAvLyBvbiBtaXNzaW5nIGVsZWN0cm9uLlxuICAgICAgICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tdmFyLXJlcXVpcmVzXG4gICAgICAgICAgICAgICAgY29uc3QgZWxlY3Ryb24gPSByZXF1aXJlKCdlbGVjdHJvbicpO1xuICAgICAgICAgICAgICAgIC8vIHYyLjcuMSByZXZpZXcgZml4IChjb2RleCDwn5+hICsgZ2VtaW5pIPCfn6EpOiBvcGVuRXh0ZXJuYWxcbiAgICAgICAgICAgICAgICAvLyByZXNvbHZlcyB3aGVuIHRoZSBPUyBsYXVuY2hlciBpcyBpbnZva2VkLCBub3Qgd2hlbiB0aGVcbiAgICAgICAgICAgICAgICAvLyBwYWdlIHJlbmRlcnMuIFVzZSBcImxhdW5jaFwiIHdvcmRpbmcgdG8gYXZvaWQgdGhlIEFJXG4gICAgICAgICAgICAgICAgLy8gbWlzcmVhZGluZyBcIm9wZW5lZFwiIGFzIGEgY29uZmlybWVkIHBhZ2UtbG9hZC5cbiAgICAgICAgICAgICAgICBhd2FpdCBlbGVjdHJvbi5zaGVsbC5vcGVuRXh0ZXJuYWwodXJsKTtcbiAgICAgICAgICAgICAgICBkYXRhLmxhdW5jaGVkID0gdHJ1ZTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICAgICAgZGF0YS5sYXVuY2hlZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIGRhdGEubGF1bmNoRXJyb3IgPSBlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy8gUmVmbGVjdCBhY3R1YWwgbGF1bmNoIG91dGNvbWUgaW4gdGhlIHRvcC1sZXZlbCBtZXNzYWdlIHNvIEFJXG4gICAgICAgIC8vIHNlZXMgXCJsYXVuY2ggZmFpbGVkXCIgaW5zdGVhZCBvZiBtaXNsZWFkaW5nIFwiT3BlbmVkIC4uLlwiIHdoZW5cbiAgICAgICAgLy8gb3BlbkV4dGVybmFsIHRocmV3IChnZW1pbmkg8J+foSkuXG4gICAgICAgIGNvbnN0IG1lc3NhZ2UgPSBhY3Rpb24gPT09ICdvcGVuJ1xuICAgICAgICAgICAgPyAoZGF0YS5sYXVuY2hlZFxuICAgICAgICAgICAgICAgID8gYExhdW5jaGVkICR7dXJsfSBpbiBkZWZhdWx0IGJyb3dzZXIgKHBhZ2UgcmVuZGVyIG5vdCBhd2FpdGVkKWBcbiAgICAgICAgICAgICAgICA6IGBSZXR1cm5lZCBVUkwgJHt1cmx9IGJ1dCBsYXVuY2ggZmFpbGVkOiAke2RhdGEubGF1bmNoRXJyb3J9YClcbiAgICAgICAgICAgIDogdXJsO1xuICAgICAgICByZXR1cm4gb2soZGF0YSwgbWVzc2FnZSk7XG4gICAgfVxuXG4gICAgLy8gdjIuOC4wIFQtVjI4LTM6IFBJRSBwbGF5IC8gc3RvcC4gUm91dGVzIHRocm91Z2ggc2NlbmUtc2NyaXB0IHNvIHRoZVxuICAgIC8vIHR5cGVkIGNjZS5TY2VuZUZhY2FkZS5jaGFuZ2VQcmV2aWV3UGxheVN0YXRlIGlzIHJlYWNoZWQgdmlhIHRoZVxuICAgIC8vIGRvY3VtZW50ZWQgZXhlY3V0ZS1zY2VuZS1zY3JpcHQgY2hhbm5lbC5cbiAgICAvL1xuICAgIC8vIHYyLjguMyBULVYyODMtMyByZXRlc3QgZmluZGluZzogY29jb3Mgc29tZXRpbWVzIGxvZ3NcbiAgICAvLyBcIkZhaWxlZCB0byByZWZyZXNoIHRoZSBjdXJyZW50IHNjZW5lXCIgaW5zaWRlIGNoYW5nZVByZXZpZXdQbGF5U3RhdGVcbiAgICAvLyBldmVuIHdoZW4gdGhlIGNhbGwgcmV0dXJucyB3aXRob3V0IHRocm93aW5nLiBPYnNlcnZlZCBpbiBjb2Nvc1xuICAgIC8vIDMuOC43IC8gZW1iZWRkZWQgcHJldmlldyBtb2RlLiBUaGUgcm9vdCBjYXVzZSBpcyB1bmNsZWFyIChtYXlcbiAgICAvLyByZWxhdGUgdG8gY3VtdWxhdGl2ZSBzY2VuZS1kaXJ0eSAvIGVtYmVkZGVkLW1vZGUgdGltaW5nIC9cbiAgICAvLyBpbml0aWFsLWxvYWQgY29tcGxhaW50KSwgYnV0IHRoZSB2aXNpYmxlIGVmZmVjdCBpcyB0aGF0IFBJRSBzdGF0ZVxuICAgIC8vIGNoYW5nZXMgaW5jb21wbGV0ZWx5LiBXZSBub3cgU0NBTiB0aGUgY2FwdHVyZWQgc2NlbmUtc2NyaXB0IGxvZ3NcbiAgICAvLyBmb3IgdGhhdCBlcnJvciBzdHJpbmcgYW5kIHN1cmZhY2UgaXQgdG8gdGhlIEFJIGFzIGEgc3RydWN0dXJlZFxuICAgIC8vIHdhcm5pbmcgaW5zdGVhZCBvZiBsZXR0aW5nIGl0IGhpZGUgaW5zaWRlIGRhdGEuY2FwdHVyZWRMb2dzLlxuICAgIC8vIHYyLjkuMCBULVYyOS0xOiBlZGl0b3ItaGVhbHRoIHByb2JlLiBEZXRlY3RzIHNjZW5lLXNjcmlwdCBmcmVlemVcbiAgICAvLyBieSBydW5uaW5nIHR3byBwcm9iZXMgaW4gcGFyYWxsZWw6XG4gICAgLy8gICAtIGhvc3QgcHJvYmU6IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2RldmljZScsICdxdWVyeScpIOKAlCBnb2VzXG4gICAgLy8gICAgIHRvIHRoZSBlZGl0b3IgbWFpbiBwcm9jZXNzLCBOT1QgdGhlIHNjZW5lLXNjcmlwdCByZW5kZXJlci5cbiAgICAvLyAgICAgVGhpcyBzdGF5cyByZXNwb25zaXZlIGV2ZW4gd2hlbiBzY2VuZSBpcyB3ZWRnZWQuXG4gICAgLy8gICAtIHNjZW5lIHByb2JlOiBleGVjdXRlLXNjZW5lLXNjcmlwdCBpbnZvY2F0aW9uIHdpdGggYSB0cml2aWFsXG4gICAgLy8gICAgIGBldmFsRWNob2AgdGVzdCAodXNlcyBhbiBleGlzdGluZyBzYWZlIHNjZW5lIG1ldGhvZCwgd2l0aFxuICAgIC8vICAgICB3cmFwcGluZyB0aW1lb3V0KS4gVGltZXMgb3V0IOKGkiBzY2VuZS1zY3JpcHQgZnJvemVuLlxuICAgIC8vXG4gICAgLy8gRGVzaWduZWQgZm9yIHRoZSBwb3N0LXByZXZpZXdfY29udHJvbChzdGFydCkgZnJlZXplIHBhdHRlcm4gaW5cbiAgICAvLyBsYW5kbWluZSAjMTY6IEFJIGNhbGxzIHByZXZpZXdfY29udHJvbChzdGFydCksIHRoZW5cbiAgICAvLyBjaGVja19lZGl0b3JfaGVhbHRoLCBhbmQgaWYgc2NlbmVBbGl2ZT1mYWxzZSBzdG9wcyBpc3N1aW5nIG1vcmVcbiAgICAvLyBzY2VuZSBjYWxscyBhbmQgc3VyZmFjZXMgdGhlIHJlY292ZXJ5IGhpbnQgaW5zdGVhZCBvZiBoYW5naW5nLlxuICAgIHByaXZhdGUgYXN5bmMgY2hlY2tFZGl0b3JIZWFsdGhJbXBsKHNjZW5lVGltZW91dE1zOiBudW1iZXIgPSAxNTAwKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgdDAgPSBEYXRlLm5vdygpO1xuICAgICAgICAvLyBIb3N0IHByb2JlIOKAlCBzaG91bGQgYWx3YXlzIHJlc29sdmUgZmFzdC5cbiAgICAgICAgbGV0IGhvc3RBbGl2ZSA9IGZhbHNlO1xuICAgICAgICBsZXQgaG9zdEVycm9yOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2RldmljZScsICdxdWVyeScpO1xuICAgICAgICAgICAgaG9zdEFsaXZlID0gdHJ1ZTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIGhvc3RFcnJvciA9IGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBTY2VuZSBwcm9iZSDigJQgdjIuOS41IHJldmlldyBmaXggKEdlbWluaSDwn5S0ICsgQ29kZXgg8J+UtCArIENsYXVkZSDwn5+hKTpcbiAgICAgICAgLy8gdjIuOS4wIHVzZWQgZ2V0Q3VycmVudFNjZW5lSW5mbyB2aWEgZXhlY3V0ZS1zY2VuZS1zY3JpcHQgd3JhcHBlcixcbiAgICAgICAgLy8gYnV0IHRoYXQgc2NlbmUtc2lkZSBtZXRob2QganVzdCByZWFkcyBgZGlyZWN0b3IuZ2V0U2NlbmUoKWBcbiAgICAgICAgLy8gKGNhY2hlZCBzaW5nbGV0b24pIGFuZCByZXNvbHZlcyA8MW1zIGV2ZW4gd2hlbiB0aGUgc2NlbmUtc2NyaXB0XG4gICAgICAgIC8vIHJlbmRlcmVyIGlzIHZpc2libHkgZnJvemVuIOKAlCBjb25maXJtZWQgbGl2ZSBkdXJpbmcgdjIuOS4xIHJldGVzdFxuICAgICAgICAvLyB3aGVyZSBzY2VuZUFsaXZlIHJldHVybmVkIHRydWUgd2hpbGUgdXNlciByZXBvcnRlZCB0aGUgZWRpdG9yXG4gICAgICAgIC8vIHdhcyBzcGlubmluZyBhbmQgcmVxdWlyZWQgQ3RybCtSLlxuICAgICAgICAvL1xuICAgICAgICAvLyBTd2l0Y2ggdG8gdHdvIHByb2JlcyB0aGF0IGV4ZXJjaXNlIGRpZmZlcmVudCBwYXRoczpcbiAgICAgICAgLy8gIDEuIGBzY2VuZS9xdWVyeS1pcy1yZWFkeWAgKHR5cGVkIGNoYW5uZWwg4oCUIHNlZVxuICAgICAgICAvLyAgICAgc2NlbmUvQHR5cGVzL21lc3NhZ2UuZC50czoyNTcpLiBEaXJlY3QgSVBDIGludG8gdGhlIHNjZW5lXG4gICAgICAgIC8vICAgICBtb2R1bGU7IHdpbGwgaGFuZyBpZiB0aGUgc2NlbmUtc2NyaXB0IHJlbmRlcmVyIGlzIHdlZGdlZC5cbiAgICAgICAgLy8gIDIuIGBzY2VuZS9leGVjdXRlLXNjZW5lLXNjcmlwdGAgcnVuV2l0aENhcHR1cmUoJ3F1ZXJ5Tm9kZUR1bXAnKVxuICAgICAgICAvLyAgICAgb24gYSBrbm93biBVVUlEIGZvcmNpbmcgYW4gYWN0dWFsIHNjZW5lLWdyYXBoIHdhbGsg4oCUIGNvdmVyc1xuICAgICAgICAvLyAgICAgdGhlIGNhc2Ugd2hlcmUgc2NlbmUgSVBDIGlzIGFsaXZlIGJ1dCB0aGUgcnVuV2l0aENhcHR1cmUgL1xuICAgICAgICAvLyAgICAgZXhlY3V0ZS1zY2VuZS1zY3JpcHQgcGF0aCBpcyB0aGUgd2VkZ2VkIG9uZS5cbiAgICAgICAgLy8gV2UgZGVjbGFyZSBzY2VuZSBoZWFsdGh5IG9ubHkgd2hlbiBCT1RIIHByb2JlcyByZXNvbHZlIHdpdGhpblxuICAgICAgICAvLyB0aGUgdGltZW91dC4gRWFjaCBwcm9iZSBnZXRzIGl0cyBvd24gdGltZW91dCByYWNlIHNvIGEgc3R1Y2tcbiAgICAgICAgLy8gc2NlbmUtc2NyaXB0IGRvZXNuJ3QgY29tcG91bmQgZGVsYXlzLlxuICAgICAgICBjb25zdCBwcm9iZVdpdGhUaW1lb3V0ID0gYXN5bmMgPFQ+KHA6IFByb21pc2U8VD4sIGxhYmVsOiBzdHJpbmcpOiBQcm9taXNlPHsgb2s6IHRydWU7IHZhbHVlOiBUOyBsYXRlbmN5TXM6IG51bWJlciB9IHwgeyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmc7IGxhdGVuY3lNczogbnVtYmVyIH0+ID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHN0YXJ0ID0gRGF0ZS5ub3coKTtcbiAgICAgICAgICAgIGNvbnN0IHRpbWVvdXQgPSBuZXcgUHJvbWlzZTx7IHRpbWVkT3V0OiB0cnVlIH0+KHJlc29sdmUgPT5cbiAgICAgICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHJlc29sdmUoeyB0aW1lZE91dDogdHJ1ZSB9KSwgc2NlbmVUaW1lb3V0TXMpLFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcjogYW55ID0gYXdhaXQgUHJvbWlzZS5yYWNlKFtwLnRoZW4odiA9PiAoeyB2YWx1ZTogdiwgdGltZWRPdXQ6IGZhbHNlIH0pKSwgdGltZW91dF0pO1xuICAgICAgICAgICAgICAgIGNvbnN0IGxhdGVuY3lNcyA9IERhdGUubm93KCkgLSBzdGFydDtcbiAgICAgICAgICAgICAgICBpZiAocj8udGltZWRPdXQpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGAke2xhYmVsfSBwcm9iZSB0aW1lZCBvdXQgYWZ0ZXIgJHtzY2VuZVRpbWVvdXRNc31tc2AsIGxhdGVuY3lNcyB9O1xuICAgICAgICAgICAgICAgIHJldHVybiB7IG9rOiB0cnVlLCB2YWx1ZTogci52YWx1ZSwgbGF0ZW5jeU1zIH07XG4gICAgICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGAke2xhYmVsfSBwcm9iZSB0aHJldzogJHtlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycil9YCwgbGF0ZW5jeU1zOiBEYXRlLm5vdygpIC0gc3RhcnQgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgY29uc3QgaXNSZWFkeVAgPSBwcm9iZVdpdGhUaW1lb3V0KFxuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktaXMtcmVhZHknIGFzIGFueSkgYXMgUHJvbWlzZTxib29sZWFuPixcbiAgICAgICAgICAgICdzY2VuZS9xdWVyeS1pcy1yZWFkeScsXG4gICAgICAgICk7XG4gICAgICAgIC8vIHYyLjkuNiByb3VuZC0yIGZpeCAoQ29kZXgg8J+UtCArIENsYXVkZSDwn5+hKTogdjIuOS41IHVzZWRcbiAgICAgICAgLy8gYHNjZW5lL3F1ZXJ5LWN1cnJlbnQtc2NlbmVgIGNoYWluZWQgaW50byBgcXVlcnktbm9kZWAg4oCUXG4gICAgICAgIC8vIGBxdWVyeS1jdXJyZW50LXNjZW5lYCBpcyBOT1QgaW4gc2NlbmUvQHR5cGVzL21lc3NhZ2UuZC50c1xuICAgICAgICAvLyAob25seSBgcXVlcnktaXMtcmVhZHlgIGFuZCBgcXVlcnktbm9kZS10cmVlYC9ldGMuIGFyZSB0eXBlZCkuXG4gICAgICAgIC8vIEFuIHVua25vd24gY2hhbm5lbCBtYXkgcmVzb2x2ZSBmYXN0IHdpdGggZ2FyYmFnZSBvbiBzb21lIGNvY29zXG4gICAgICAgIC8vIGJ1aWxkcywgbGVhZGluZyB0byBmYWxzZS1oZWFsdGh5IHJlcG9ydHMuXG4gICAgICAgIC8vXG4gICAgICAgIC8vIFN3aXRjaCB0byBgc2NlbmUvcXVlcnktbm9kZS10cmVlYCAodHlwZWQ6IHNjZW5lL0B0eXBlcy9cbiAgICAgICAgLy8gbWVzc2FnZS5kLnRzOjI3Mykgd2l0aCBubyBhcmcg4oCUIHJldHVybnMgdGhlIGZ1bGwgSU5vZGVbXSB0cmVlLlxuICAgICAgICAvLyBUaGlzIGZvcmNlcyBhIHJlYWwgZ3JhcGggd2FsayB0aHJvdWdoIHRoZSBzY2VuZS1zY3JpcHQgcmVuZGVyZXJcbiAgICAgICAgLy8gYW5kIGlzIHRoZSByaWdodCBzdHJlbmd0aCBvZiBwcm9iZSBmb3IgbGl2ZW5lc3MgZGV0ZWN0aW9uLlxuICAgICAgICBjb25zdCBkdW1wUCA9IHByb2JlV2l0aFRpbWVvdXQoXG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1ub2RlLXRyZWUnIGFzIGFueSkgYXMgUHJvbWlzZTxhbnk+LFxuICAgICAgICAgICAgJ3NjZW5lL3F1ZXJ5LW5vZGUtdHJlZScsXG4gICAgICAgICk7XG4gICAgICAgIGNvbnN0IFtpc1JlYWR5LCBkdW1wXSA9IGF3YWl0IFByb21pc2UuYWxsKFtpc1JlYWR5UCwgZHVtcFBdKTtcbiAgICAgICAgY29uc3Qgc2NlbmVMYXRlbmN5TXMgPSBNYXRoLm1heChpc1JlYWR5LmxhdGVuY3lNcywgZHVtcC5sYXRlbmN5TXMpO1xuICAgICAgICAvLyB2Mi45LjYgcm91bmQtMiBmaXggKENvZGV4IPCflLQgc2luZ2xlIOKAlCBudWxsIFVVSUQgZmFsc2UtaGVhbHRoeSk6XG4gICAgICAgIC8vIHJlcXVpcmUgQk9USCBwcm9iZXMgdG8gcmVzb2x2ZSBBTkQgcXVlcnktaXMtcmVhZHkgPT09IHRydWUgQU5EXG4gICAgICAgIC8vIHF1ZXJ5LW5vZGUtdHJlZSB0byByZXR1cm4gbm9uLW51bGwuXG4gICAgICAgIC8vIHYyLjkuNyByb3VuZC0zIGZpeCAoQ29kZXggcjMg8J+foSArIENsYXVkZSByMyDwn5+hIGluZm9ybWF0aW9uYWwpOlxuICAgICAgICAvLyB0aWdodGVuIGZ1cnRoZXIg4oCUIGEgcmV0dXJuZWQgZW1wdHkgYXJyYXkgYFtdYCBpcyBudWxsLXNhZmUgYnV0XG4gICAgICAgIC8vIHNlbWFudGljYWxseSBtZWFucyBcIm5vIHNjZW5lIGxvYWRlZFwiLCB3aGljaCBpcyBOT1QgYWxpdmUgaW4gdGhlXG4gICAgICAgIC8vIHNlbnNlIHRoZSBBSSBjYXJlcyBhYm91dCAoYSBmcm96ZW4gcmVuZGVyZXIgbWlnaHQgYWxzbyBwcm9kdWNlXG4gICAgICAgIC8vIHplcm8tdHJlZSByZXNwb25zZXMgb24gc29tZSBidWlsZHMpLiBSZXF1aXJlIG5vbi1lbXB0eSBhcnJheS5cbiAgICAgICAgY29uc3QgZHVtcFZhbGlkID0gZHVtcC5va1xuICAgICAgICAgICAgJiYgZHVtcC52YWx1ZSAhPT0gbnVsbFxuICAgICAgICAgICAgJiYgZHVtcC52YWx1ZSAhPT0gdW5kZWZpbmVkXG4gICAgICAgICAgICAmJiAoIUFycmF5LmlzQXJyYXkoZHVtcC52YWx1ZSkgfHwgZHVtcC52YWx1ZS5sZW5ndGggPiAwKTtcbiAgICAgICAgY29uc3Qgc2NlbmVBbGl2ZSA9IGlzUmVhZHkub2sgJiYgZHVtcFZhbGlkICYmIGlzUmVhZHkudmFsdWUgPT09IHRydWU7XG4gICAgICAgIGxldCBzY2VuZUVycm9yOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgICAgICAgaWYgKCFpc1JlYWR5Lm9rKSBzY2VuZUVycm9yID0gaXNSZWFkeS5lcnJvcjtcbiAgICAgICAgZWxzZSBpZiAoIWR1bXAub2spIHNjZW5lRXJyb3IgPSBkdW1wLmVycm9yO1xuICAgICAgICBlbHNlIGlmICghZHVtcFZhbGlkKSBzY2VuZUVycm9yID0gYHNjZW5lL3F1ZXJ5LW5vZGUtdHJlZSByZXR1cm5lZCAke0FycmF5LmlzQXJyYXkoZHVtcC52YWx1ZSkgJiYgZHVtcC52YWx1ZS5sZW5ndGggPT09IDAgPyAnYW4gZW1wdHkgYXJyYXkgKG5vIHNjZW5lIGxvYWRlZCBvciBzY2VuZS1zY3JpcHQgaW4gZGVncmFkZWQgc3RhdGUpJyA6IEpTT04uc3RyaW5naWZ5KGR1bXAudmFsdWUpfSAoZXhwZWN0ZWQgbm9uLWVtcHR5IElOb2RlW10pYDtcbiAgICAgICAgZWxzZSBpZiAoaXNSZWFkeS52YWx1ZSAhPT0gdHJ1ZSkgc2NlbmVFcnJvciA9IGBzY2VuZS9xdWVyeS1pcy1yZWFkeSByZXR1cm5lZCAke0pTT04uc3RyaW5naWZ5KGlzUmVhZHkudmFsdWUpfSAoZXhwZWN0ZWQgdHJ1ZSlgO1xuICAgICAgICBjb25zdCBzdWdnZXN0aW9uID0gIWhvc3RBbGl2ZVxuICAgICAgICAgICAgPyAnY29jb3MgZWRpdG9yIGhvc3QgcHJvY2VzcyB1bnJlc3BvbnNpdmUg4oCUIHZlcmlmeSB0aGUgZWRpdG9yIGlzIHJ1bm5pbmcgYW5kIHRoZSBjb2Nvcy1tY3Atc2VydmVyIGV4dGVuc2lvbiBpcyBsb2FkZWQuJ1xuICAgICAgICAgICAgOiAhc2NlbmVBbGl2ZVxuICAgICAgICAgICAgICAgID8gJ2NvY29zIGVkaXRvciBzY2VuZS1zY3JpcHQgaXMgZnJvemVuIChsaWtlbHkgbGFuZG1pbmUgIzE2IGFmdGVyIHByZXZpZXdfY29udHJvbChzdGFydCkpLiBQcmVzcyBDdHJsK1IgaW4gdGhlIGNvY29zIGVkaXRvciB0byByZWxvYWQgdGhlIHNjZW5lLXNjcmlwdCByZW5kZXJlcjsgZG8gbm90IGlzc3VlIG1vcmUgc2NlbmUvKiB0b29sIGNhbGxzIHVudGlsIHJlY292ZXJlZC4nXG4gICAgICAgICAgICAgICAgOiAnZWRpdG9yIGhlYWx0aHk7IHNjZW5lLXNjcmlwdCBhbmQgaG9zdCBib3RoIHJlc3BvbnNpdmUuJztcbiAgICAgICAgcmV0dXJuIG9rKHtcbiAgICAgICAgICAgICAgICBob3N0QWxpdmUsXG4gICAgICAgICAgICAgICAgc2NlbmVBbGl2ZSxcbiAgICAgICAgICAgICAgICBzY2VuZUxhdGVuY3lNcyxcbiAgICAgICAgICAgICAgICBzY2VuZVRpbWVvdXRNcyxcbiAgICAgICAgICAgICAgICBob3N0RXJyb3IsXG4gICAgICAgICAgICAgICAgc2NlbmVFcnJvcixcbiAgICAgICAgICAgICAgICB0b3RhbFByb2JlTXM6IERhdGUubm93KCkgLSB0MCxcbiAgICAgICAgICAgIH0sIHN1Z2dlc3Rpb24pO1xuICAgIH1cblxuICAgIC8vIHYyLjkueCBwb2xpc2ggKENvZGV4IHIxIHNpbmdsZS3wn5+hIGZyb20gdjIuOC4xIHJldmlldyk6IG1vZHVsZS1sZXZlbFxuICAgIC8vIGluLWZsaWdodCBndWFyZCBwcmV2ZW50cyBBSSB3b3JrZmxvd3MgZnJvbSBmaXJpbmcgdHdvIFBJRSBzdGF0ZVxuICAgIC8vIGNoYW5nZXMgY29uY3VycmVudGx5LiBUaGUgY29jb3MgZW5naW5lIHJhY2UgaW4gbGFuZG1pbmUgIzE2IG1ha2VzXG4gICAgLy8gZG91YmxlLWZpcmUgcGFydGljdWxhcmx5IGRhbmdlcm91cyDigJQgdGhlIHNlY29uZCBjYWxsIHdvdWxkIGhpdFxuICAgIC8vIGEgcGFydGlhbGx5LWluaXRpYWxpc2VkIFByZXZpZXdTY2VuZUZhY2FkZS4gUmVqZWN0IG92ZXJsYXAuXG4gICAgcHJpdmF0ZSBzdGF0aWMgcHJldmlld0NvbnRyb2xJbkZsaWdodCA9IGZhbHNlO1xuXG4gICAgcHJpdmF0ZSBhc3luYyBwcmV2aWV3Q29udHJvbEltcGwob3A6ICdzdGFydCcgfCAnc3RvcCcsIGFja25vd2xlZGdlRnJlZXplUmlzazogYm9vbGVhbiA9IGZhbHNlKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgLy8gdjIuOS54IHBhcmsgZ2F0ZTogb3A9XCJzdGFydFwiIGlzIGtub3duIHRvIGZyZWV6ZSBjb2NvcyAzLjguN1xuICAgICAgICAvLyAobGFuZG1pbmUgIzE2KS4gUmVmdXNlIHVubGVzcyB0aGUgY2FsbGVyIGhhcyBleHBsaWNpdGx5XG4gICAgICAgIC8vIGFja25vd2xlZGdlZCB0aGUgcmlzay4gb3A9XCJzdG9wXCIgaXMgYWx3YXlzIHNhZmUg4oCUIGJ5cGFzcyB0aGVcbiAgICAgICAgLy8gZ2F0ZSBzbyBjYWxsZXJzIGNhbiByZWNvdmVyIGZyb20gYSBoYWxmLWFwcGxpZWQgc3RhdGUuXG4gICAgICAgIGlmIChvcCA9PT0gJ3N0YXJ0JyAmJiAhYWNrbm93bGVkZ2VGcmVlemVSaXNrKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbCgnZGVidWdfcHJldmlld19jb250cm9sKG9wPVwic3RhcnRcIikgaXMgcGFya2VkIGR1ZSB0byBsYW5kbWluZSAjMTYg4oCUIHRoZSBjb2NvcyAzLjguNyBzb2Z0UmVsb2FkU2NlbmUgcmFjZSBmcmVlemVzIHRoZSBlZGl0b3IgcmVnYXJkbGVzcyBvZiBwcmV2aWV3IG1vZGUgKHZlcmlmaWVkIGVtYmVkZGVkICsgYnJvd3NlcikuIHYyLjEwIGNyb3NzLXJlcG8gcmVmcmVzaCBjb25maXJtZWQgbm8gcmVmZXJlbmNlIHByb2plY3Qgc2hpcHMgYSBzYWZlciBwYXRoIOKAlCBoYXJhZHkgYW5kIGNvY29zLWNvZGUtbW9kZSB1c2UgdGhlIHNhbWUgY2hhbm5lbCBmYW1pbHkgYW5kIGhpdCB0aGUgc2FtZSByYWNlLiAqKlN0cm9uZ2x5IHByZWZlcnJlZCBhbHRlcm5hdGl2ZXMqKiAocGxlYXNlIHVzZSB0aGVzZSBpbnN0ZWFkKTogKGEpIGRlYnVnX2NhcHR1cmVfcHJldmlld19zY3JlZW5zaG90KG1vZGU9XCJlbWJlZGRlZFwiKSBpbiBFRElUIG1vZGUgKG5vIFBJRSBuZWVkZWQpOyAoYikgZGVidWdfZ2FtZV9jb21tYW5kKHR5cGU9XCJzY3JlZW5zaG90XCIpIHZpYSBHYW1lRGVidWdDbGllbnQgb24gYnJvd3NlciBwcmV2aWV3IGxhdW5jaGVkIHZpYSBkZWJ1Z19wcmV2aWV3X3VybChhY3Rpb249XCJvcGVuXCIpLiBPbmx5IHJlLWNhbGwgd2l0aCBhY2tub3dsZWRnZUZyZWV6ZVJpc2s9dHJ1ZSBpZiBuZWl0aGVyIGFsdGVybmF0aXZlIGZpdHMgQU5EIHRoZSBodW1hbiB1c2VyIGlzIHByZXBhcmVkIHRvIHByZXNzIEN0cmwrUiBpbiBjb2NvcyBpZiB0aGUgZWRpdG9yIGZyZWV6ZXMuJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKERlYnVnVG9vbHMucHJldmlld0NvbnRyb2xJbkZsaWdodCkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ0Fub3RoZXIgZGVidWdfcHJldmlld19jb250cm9sIGNhbGwgaXMgYWxyZWFkeSBpbiBmbGlnaHQuIFBJRSBzdGF0ZSBjaGFuZ2VzIGdvIHRocm91Z2ggY29jb3NcXCcgU2NlbmVGYWNhZGVGU00gYW5kIGRvdWJsZS1maXJpbmcgZHVyaW5nIHRoZSBpbi1mbGlnaHQgd2luZG93IHJpc2tzIGNvbXBvdW5kaW5nIHRoZSBsYW5kbWluZSAjMTYgZnJlZXplLiBXYWl0IGZvciB0aGUgcHJldmlvdXMgY2FsbCB0byByZXNvbHZlLCB0aGVuIHJldHJ5LicpO1xuICAgICAgICB9XG4gICAgICAgIERlYnVnVG9vbHMucHJldmlld0NvbnRyb2xJbkZsaWdodCA9IHRydWU7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5wcmV2aWV3Q29udHJvbElubmVyKG9wKTtcbiAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgIERlYnVnVG9vbHMucHJldmlld0NvbnRyb2xJbkZsaWdodCA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBwcmV2aWV3Q29udHJvbElubmVyKG9wOiAnc3RhcnQnIHwgJ3N0b3AnKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3Qgc3RhdGUgPSBvcCA9PT0gJ3N0YXJ0JztcbiAgICAgICAgY29uc3QgcmVzdWx0OiBUb29sUmVzcG9uc2UgPSBhd2FpdCBydW5TY2VuZU1ldGhvZEFzVG9vbFJlc3BvbnNlKCdjaGFuZ2VQcmV2aWV3UGxheVN0YXRlJywgW3N0YXRlXSk7XG4gICAgICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgICAgICAgLy8gU2NhbiBjYXB0dXJlZExvZ3MgZm9yIHRoZSBrbm93biBjb2NvcyB3YXJuaW5nIHNvIEFJXG4gICAgICAgICAgICAvLyBkb2Vzbid0IGdldCBhIG1pc2xlYWRpbmcgYmFyZS1zdWNjZXNzIGVudmVsb3BlLlxuICAgICAgICAgICAgY29uc3QgY2FwdHVyZWQgPSAocmVzdWx0IGFzIGFueSkuY2FwdHVyZWRMb2dzIGFzIEFycmF5PHsgbGV2ZWw6IHN0cmluZzsgbWVzc2FnZTogc3RyaW5nIH0+IHwgdW5kZWZpbmVkO1xuICAgICAgICAgICAgY29uc3Qgc2NlbmVSZWZyZXNoRXJyb3IgPSBjYXB0dXJlZD8uZmluZChcbiAgICAgICAgICAgICAgICBlID0+IGU/LmxldmVsID09PSAnZXJyb3InICYmIC9GYWlsZWQgdG8gcmVmcmVzaCB0aGUgY3VycmVudCBzY2VuZS9pLnRlc3QoZT8ubWVzc2FnZSA/PyAnJyksXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgY29uc3Qgd2FybmluZ3M6IHN0cmluZ1tdID0gW107XG4gICAgICAgICAgICBpZiAoc2NlbmVSZWZyZXNoRXJyb3IpIHtcbiAgICAgICAgICAgICAgICB3YXJuaW5ncy5wdXNoKFxuICAgICAgICAgICAgICAgICAgICAnY29jb3MgZW5naW5lIHRocmV3IFwiRmFpbGVkIHRvIHJlZnJlc2ggdGhlIGN1cnJlbnQgc2NlbmVcIiBpbnNpZGUgc29mdFJlbG9hZFNjZW5lIGR1cmluZyBQSUUgc3RhdGUgY2hhbmdlLiBUaGlzIGlzIGEgY29jb3MgMy44LjcgcmFjZSBmaXJlZCBieSBjaGFuZ2VQcmV2aWV3UGxheVN0YXRlIGl0c2VsZiwgbm90IGdhdGVkIGJ5IHByZXZpZXcgbW9kZSAodmVyaWZpZWQgaW4gYm90aCBlbWJlZGRlZCBhbmQgYnJvd3NlciBtb2RlcyDigJQgc2VlIENMQVVERS5tZCBsYW5kbWluZSAjMTYpLiBQSUUgaGFzIE5PVCBhY3R1YWxseSBzdGFydGVkIGFuZCB0aGUgY29jb3MgZWRpdG9yIG1heSBmcmVlemUgKHNwaW5uaW5nIGluZGljYXRvcikgcmVxdWlyaW5nIHRoZSBodW1hbiB1c2VyIHRvIHByZXNzIEN0cmwrUiB0byByZWNvdmVyLiAqKlJlY29tbWVuZGVkIGFsdGVybmF0aXZlcyoqOiAoYSkgZGVidWdfY2FwdHVyZV9wcmV2aWV3X3NjcmVlbnNob3QobW9kZT1cImVtYmVkZGVkXCIpIGluIEVESVQgbW9kZSDigJQgY2FwdHVyZXMgdGhlIGVkaXRvciBnYW1ldmlldyB3aXRob3V0IHN0YXJ0aW5nIFBJRTsgKGIpIGRlYnVnX2dhbWVfY29tbWFuZCh0eXBlPVwic2NyZWVuc2hvdFwiKSB2aWEgR2FtZURlYnVnQ2xpZW50IHJ1bm5pbmcgb24gYnJvd3NlciBwcmV2aWV3IChkZWJ1Z19wcmV2aWV3X3VybChhY3Rpb249XCJvcGVuXCIpKSDigJQgdXNlcyBydW50aW1lIGNhbnZhcywgYnlwYXNzZXMgdGhlIGVuZ2luZSByYWNlIGVudGlyZWx5LiBEbyBOT1QgcmV0cnkgcHJldmlld19jb250cm9sKHN0YXJ0KSDigJQgaXQgd2lsbCBub3QgaGVscCBhbmQgbWF5IGNvbXBvdW5kIHRoZSBmcmVlemUuJyxcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgYmFzZU1lc3NhZ2UgPSBzdGF0ZVxuICAgICAgICAgICAgICAgID8gJ0VudGVyZWQgUHJldmlldy1pbi1FZGl0b3IgcGxheSBtb2RlIChQSUUgbWF5IHRha2UgYSBtb21lbnQgdG8gYXBwZWFyOyBtb2RlIGRlcGVuZHMgb24gY29jb3MgcHJldmlldyBjb25maWcg4oCUIHNlZSBkZWJ1Z19nZXRfcHJldmlld19tb2RlKSdcbiAgICAgICAgICAgICAgICA6ICdFeGl0ZWQgUHJldmlldy1pbi1FZGl0b3IgcGxheSBtb2RlJztcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgLi4ucmVzdWx0LFxuICAgICAgICAgICAgICAgIC4uLih3YXJuaW5ncy5sZW5ndGggPiAwID8geyBkYXRhOiB7IC4uLihyZXN1bHQuZGF0YSA/PyB7fSksIHdhcm5pbmdzIH0gfSA6IHt9KSxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiB3YXJuaW5ncy5sZW5ndGggPiAwXG4gICAgICAgICAgICAgICAgICAgID8gYCR7YmFzZU1lc3NhZ2V9LiDimqAgJHt3YXJuaW5ncy5qb2luKCcgJyl9YFxuICAgICAgICAgICAgICAgICAgICA6IGJhc2VNZXNzYWdlLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICAvLyB2Mi45LnggcG9saXNoIChDbGF1ZGUgcjEgc2luZ2xlLfCfn6EgZnJvbSB2Mi44LjEgcmV2aWV3KTpcbiAgICAgICAgLy8gZmFpbHVyZS1icmFuY2ggd2FzIHJldHVybmluZyB0aGUgYnJpZGdlJ3MgZW52ZWxvcGUgdmVyYmF0aW1cbiAgICAgICAgLy8gd2l0aG91dCBhIG1lc3NhZ2UgZmllbGQsIHdoaWxlIHN1Y2Nlc3MgYnJhbmNoIGNhcnJpZWQgYSBjbGVhclxuICAgICAgICAvLyBtZXNzYWdlLiBBZGQgYSBzeW1tZXRyaWMgbWVzc2FnZSBzbyBzdHJlYW1pbmcgQUkgY2xpZW50cyBzZWVcbiAgICAgICAgLy8gYSBjb25zaXN0ZW50IGVudmVsb3BlIHNoYXBlIG9uIGJvdGggcGF0aHMuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAuLi5yZXN1bHQsXG4gICAgICAgICAgICBtZXNzYWdlOiByZXN1bHQubWVzc2FnZSA/PyBgRmFpbGVkIHRvICR7b3B9IFByZXZpZXctaW4tRWRpdG9yIHBsYXkgbW9kZSDigJQgc2VlIGVycm9yLmAsXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBxdWVyeURldmljZXNJbXBsKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IGRldmljZXM6IGFueVtdID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnZGV2aWNlJywgJ3F1ZXJ5JykgYXMgYW55O1xuICAgICAgICByZXR1cm4gb2soeyBkZXZpY2VzOiBBcnJheS5pc0FycmF5KGRldmljZXMpID8gZGV2aWNlcyA6IFtdLCBjb3VudDogQXJyYXkuaXNBcnJheShkZXZpY2VzKSA/IGRldmljZXMubGVuZ3RoIDogMCB9KTtcbiAgICB9XG5cbiAgICAvLyB2Mi42LjAgVC1WMjYtMTogR2FtZURlYnVnQ2xpZW50IGJyaWRnZSBoYW5kbGVycyAtLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2FtZUNvbW1hbmRJbXBsKHR5cGU6IHN0cmluZywgYXJnczogYW55LCB0aW1lb3V0TXM6IG51bWJlciA9IDEwMDAwKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgcXVldWVkID0gcXVldWVHYW1lQ29tbWFuZCh0eXBlLCBhcmdzKTtcbiAgICAgICAgaWYgKCFxdWV1ZWQub2spIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKHF1ZXVlZC5lcnJvcik7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgYXdhaXRlZCA9IGF3YWl0IGF3YWl0Q29tbWFuZFJlc3VsdChxdWV1ZWQuaWQsIHRpbWVvdXRNcyk7XG4gICAgICAgIGlmICghYXdhaXRlZC5vaykge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoYXdhaXRlZC5lcnJvcik7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXRlZC5yZXN1bHQ7XG4gICAgICAgIGlmIChyZXN1bHQuc3VjY2VzcyA9PT0gZmFsc2UpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKHJlc3VsdC5lcnJvciA/PyAnR2FtZURlYnVnQ2xpZW50IHJlcG9ydGVkIGZhaWx1cmUnLCByZXN1bHQuZGF0YSk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gQnVpbHQtaW4gc2NyZWVuc2hvdCBwYXRoOiBjbGllbnQgc2VuZHMgYmFjayBhIGJhc2U2NCBkYXRhVXJsO1xuICAgICAgICAvLyBsYW5kaW5nIHRoZSBieXRlcyB0byBkaXNrIG9uIGhvc3Qgc2lkZSBrZWVwcyB0aGUgcmVzdWx0IGVudmVsb3BlXG4gICAgICAgIC8vIHNtYWxsIGFuZCByZXVzZXMgdGhlIGV4aXN0aW5nIHByb2plY3Qtcm9vdGVkIGNhcHR1cmUgZGlyIGd1YXJkLlxuICAgICAgICBpZiAodHlwZSA9PT0gJ3NjcmVlbnNob3QnICYmIHJlc3VsdC5kYXRhICYmIHR5cGVvZiByZXN1bHQuZGF0YS5kYXRhVXJsID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgY29uc3QgcGVyc2lzdGVkID0gdGhpcy5wZXJzaXN0R2FtZVNjcmVlbnNob3QocmVzdWx0LmRhdGEuZGF0YVVybCwgcmVzdWx0LmRhdGEud2lkdGgsIHJlc3VsdC5kYXRhLmhlaWdodCk7XG4gICAgICAgICAgICBpZiAoIXBlcnNpc3RlZC5vaykge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKHBlcnNpc3RlZC5lcnJvcik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gb2soe1xuICAgICAgICAgICAgICAgICAgICB0eXBlLFxuICAgICAgICAgICAgICAgICAgICBmaWxlUGF0aDogcGVyc2lzdGVkLmZpbGVQYXRoLFxuICAgICAgICAgICAgICAgICAgICBzaXplOiBwZXJzaXN0ZWQuc2l6ZSxcbiAgICAgICAgICAgICAgICAgICAgd2lkdGg6IHJlc3VsdC5kYXRhLndpZHRoLFxuICAgICAgICAgICAgICAgICAgICBoZWlnaHQ6IHJlc3VsdC5kYXRhLmhlaWdodCxcbiAgICAgICAgICAgICAgICB9LCBgR2FtZSBjYW52YXMgY2FwdHVyZWQgdG8gJHtwZXJzaXN0ZWQuZmlsZVBhdGh9YCk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gdjIuOS54IFQtVjI5LTU6IGJ1aWx0LWluIHJlY29yZF9zdG9wIHBhdGgg4oCUIHNhbWUgcGVyc2lzdGVuY2VcbiAgICAgICAgLy8gcGF0dGVybiBhcyBzY3JlZW5zaG90LCBidXQgd2l0aCB3ZWJtL21wNCBleHRlbnNpb24gYW5kIGFcbiAgICAgICAgLy8gc2VwYXJhdGUgc2l6ZSBjYXAgKHJlY29yZGluZ3MgY2FuIGJlIG11Y2ggbGFyZ2VyIHRoYW4gc3RpbGxzKS5cbiAgICAgICAgaWYgKHR5cGUgPT09ICdyZWNvcmRfc3RvcCcgJiYgcmVzdWx0LmRhdGEgJiYgdHlwZW9mIHJlc3VsdC5kYXRhLmRhdGFVcmwgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICBjb25zdCBwZXJzaXN0ZWQgPSB0aGlzLnBlcnNpc3RHYW1lUmVjb3JkaW5nKHJlc3VsdC5kYXRhLmRhdGFVcmwpO1xuICAgICAgICAgICAgaWYgKCFwZXJzaXN0ZWQub2spIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFpbChwZXJzaXN0ZWQuZXJyb3IpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIG9rKHtcbiAgICAgICAgICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICAgICAgICAgICAgZmlsZVBhdGg6IHBlcnNpc3RlZC5maWxlUGF0aCxcbiAgICAgICAgICAgICAgICAgICAgc2l6ZTogcGVyc2lzdGVkLnNpemUsXG4gICAgICAgICAgICAgICAgICAgIG1pbWVUeXBlOiByZXN1bHQuZGF0YS5taW1lVHlwZSxcbiAgICAgICAgICAgICAgICAgICAgZHVyYXRpb25NczogcmVzdWx0LmRhdGEuZHVyYXRpb25NcyxcbiAgICAgICAgICAgICAgICB9LCBgR2FtZSBjYW52YXMgcmVjb3JkaW5nIHNhdmVkIHRvICR7cGVyc2lzdGVkLmZpbGVQYXRofSAoJHtwZXJzaXN0ZWQuc2l6ZX0gYnl0ZXMsICR7cmVzdWx0LmRhdGEuZHVyYXRpb25Nc31tcylgKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gb2soeyB0eXBlLCAuLi5yZXN1bHQuZGF0YSB9LCBgR2FtZSBjb21tYW5kICR7dHlwZX0gb2tgKTtcbiAgICB9XG5cbiAgICAvLyB2Mi45LnggVC1WMjktNTogdGhpbiB3cmFwcGVycyBhcm91bmQgZ2FtZV9jb21tYW5kIGZvciBBSSBlcmdvbm9taWNzLlxuICAgIC8vIEtlZXAgdGhlIGRpc3BhdGNoIHBhdGggaWRlbnRpY2FsIHRvIGdhbWVfY29tbWFuZCh0eXBlPSdyZWNvcmRfKicpIHNvXG4gICAgLy8gdGhlcmUncyBvbmx5IG9uZSBwZXJzaXN0ZW5jZSBwaXBlbGluZSBhbmQgb25lIHF1ZXVlLiBBSSBzdGlsbCBwaWNrc1xuICAgIC8vIHRoZXNlIHRvb2xzIGZpcnN0IGJlY2F1c2UgdGhlaXIgc2NoZW1hcyBhcmUgZXhwbGljaXQuXG4gICAgcHJpdmF0ZSBhc3luYyByZWNvcmRTdGFydEltcGwobWltZVR5cGU/OiBzdHJpbmcsIHZpZGVvQml0c1BlclNlY29uZD86IG51bWJlciwgdGltZW91dE1zOiBudW1iZXIgPSA1MDAwLCBxdWFsaXR5Pzogc3RyaW5nLCB2aWRlb0NvZGVjPzogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgaWYgKHF1YWxpdHkgJiYgdmlkZW9CaXRzUGVyU2Vjb25kICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKCdxdWFsaXR5IGFuZCB2aWRlb0JpdHNQZXJTZWNvbmQgYXJlIG11dHVhbGx5IGV4Y2x1c2l2ZScpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGFyZ3M6IGFueSA9IHt9O1xuICAgICAgICBpZiAobWltZVR5cGUpIGFyZ3MubWltZVR5cGUgPSBtaW1lVHlwZTtcbiAgICAgICAgaWYgKHR5cGVvZiB2aWRlb0JpdHNQZXJTZWNvbmQgPT09ICdudW1iZXInKSBhcmdzLnZpZGVvQml0c1BlclNlY29uZCA9IHZpZGVvQml0c1BlclNlY29uZDtcbiAgICAgICAgaWYgKHF1YWxpdHkpIGFyZ3MucXVhbGl0eSA9IHF1YWxpdHk7XG4gICAgICAgIGlmICh2aWRlb0NvZGVjKSBhcmdzLnZpZGVvQ29kZWMgPSB2aWRlb0NvZGVjO1xuICAgICAgICByZXR1cm4gdGhpcy5nYW1lQ29tbWFuZEltcGwoJ3JlY29yZF9zdGFydCcsIGFyZ3MsIHRpbWVvdXRNcyk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyByZWNvcmRTdG9wSW1wbCh0aW1lb3V0TXM6IG51bWJlciA9IDMwMDAwKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2FtZUNvbW1hbmRJbXBsKCdyZWNvcmRfc3RvcCcsIHt9LCB0aW1lb3V0TXMpO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2FtZUNsaWVudFN0YXR1c0ltcGwoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG9rKGdldENsaWVudFN0YXR1cygpKTtcbiAgICB9XG5cbiAgICAvLyB2Mi42LjEgcmV2aWV3IGZpeCAoY29kZXgg8J+UtCArIGNsYXVkZSBXMSk6IGJvdW5kIHRoZSBsZWdpdGltYXRlIHJhbmdlXG4gICAgLy8gb2YgYSBzY3JlZW5zaG90IHBheWxvYWQgYmVmb3JlIGRlY29kaW5nIHNvIGEgbWlzYmVoYXZpbmcgLyBtYWxpY2lvdXNcbiAgICAvLyBjbGllbnQgY2Fubm90IGZpbGwgZGlzayBieSBzdHJlYW1pbmcgYXJiaXRyYXJ5IGJhc2U2NCBieXRlcy5cbiAgICAvLyAzMiBNQiBtYXRjaGVzIHRoZSBnbG9iYWwgcmVxdWVzdC1ib2R5IGNhcCBpbiBtY3Atc2VydmVyLXNkay50cyBzb1xuICAgIC8vIHRoZSBib2R5IHdvdWxkIGFscmVhZHkgNDEzIGJlZm9yZSByZWFjaGluZyBoZXJlLCBidXQgYVxuICAgIC8vIGJlbHQtYW5kLWJyYWNlcyBjaGVjayBzdGF5cyBjaGVhcC5cbiAgICBwcml2YXRlIHN0YXRpYyByZWFkb25seSBNQVhfR0FNRV9TQ1JFRU5TSE9UX0JZVEVTID0gMzIgKiAxMDI0ICogMTAyNDtcblxuICAgIHByaXZhdGUgcGVyc2lzdEdhbWVTY3JlZW5zaG90KGRhdGFVcmw6IHN0cmluZywgX3dpZHRoPzogbnVtYmVyLCBfaGVpZ2h0PzogbnVtYmVyKTogeyBvazogdHJ1ZTsgZmlsZVBhdGg6IHN0cmluZzsgc2l6ZTogbnVtYmVyIH0gfCB7IG9rOiBmYWxzZTsgZXJyb3I6IHN0cmluZyB9IHtcbiAgICAgICAgY29uc3QgbSA9IC9eZGF0YTppbWFnZVxcLyhwbmd8anBlZ3x3ZWJwKTtiYXNlNjQsKC4qKSQvaS5leGVjKGRhdGFVcmwpO1xuICAgICAgICBpZiAoIW0pIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6ICdHYW1lRGVidWdDbGllbnQgcmV0dXJuZWQgc2NyZWVuc2hvdCBkYXRhVXJsIGluIHVuZXhwZWN0ZWQgZm9ybWF0IChleHBlY3RlZCBkYXRhOmltYWdlL3twbmd8anBlZ3x3ZWJwfTtiYXNlNjQsLi4uKScgfTtcbiAgICAgICAgfVxuICAgICAgICAvLyBiYXNlNjQtZGVjb2RlZCBieXRlIGNvdW50ID0gfmNlaWwoYjY0TGVuICogMyAvIDQpOyByZWplY3QgZWFybHlcbiAgICAgICAgLy8gYmVmb3JlIGFsbG9jYXRpbmcgYSBtdWx0aS1HQiBCdWZmZXIuXG4gICAgICAgIGNvbnN0IGI2NExlbiA9IG1bMl0ubGVuZ3RoO1xuICAgICAgICBjb25zdCBhcHByb3hCeXRlcyA9IE1hdGguY2VpbChiNjRMZW4gKiAzIC8gNCk7XG4gICAgICAgIGlmIChhcHByb3hCeXRlcyA+IERlYnVnVG9vbHMuTUFYX0dBTUVfU0NSRUVOU0hPVF9CWVRFUykge1xuICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogYHNjcmVlbnNob3QgcGF5bG9hZCB0b28gbGFyZ2U6IH4ke2FwcHJveEJ5dGVzfSBieXRlcyBleGNlZWRzIGNhcCAke0RlYnVnVG9vbHMuTUFYX0dBTUVfU0NSRUVOU0hPVF9CWVRFU31gIH07XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZXh0ID0gbVsxXS50b0xvd2VyQ2FzZSgpID09PSAnanBlZycgPyAnanBnJyA6IG1bMV0udG9Mb3dlckNhc2UoKTtcbiAgICAgICAgY29uc3QgYnVmID0gQnVmZmVyLmZyb20obVsyXSwgJ2Jhc2U2NCcpO1xuICAgICAgICBpZiAoYnVmLmxlbmd0aCA+IERlYnVnVG9vbHMuTUFYX0dBTUVfU0NSRUVOU0hPVF9CWVRFUykge1xuICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogYHNjcmVlbnNob3QgcGF5bG9hZCB0b28gbGFyZ2UgYWZ0ZXIgZGVjb2RlOiAke2J1Zi5sZW5ndGh9IGJ5dGVzIGV4Y2VlZHMgY2FwICR7RGVidWdUb29scy5NQVhfR0FNRV9TQ1JFRU5TSE9UX0JZVEVTfWAgfTtcbiAgICAgICAgfVxuICAgICAgICAvLyB2Mi42LjEgcmV2aWV3IGZpeCAoY2xhdWRlIE0yICsgY29kZXgg8J+foSArIGdlbWluaSDwn5+hKTogcmVhbHBhdGggYm90aFxuICAgICAgICAvLyBzaWRlcyBmb3IgYSB0cnVlIGNvbnRhaW5tZW50IGNoZWNrLiB2Mi44LjAgVC1WMjgtMiBob2lzdGVkIHRoaXNcbiAgICAgICAgLy8gcGF0dGVybiBpbnRvIHJlc29sdmVBdXRvQ2FwdHVyZUZpbGUoKSBzbyBzY3JlZW5zaG90KCkgLyBjYXB0dXJlLVxuICAgICAgICAvLyBwcmV2aWV3IC8gYmF0Y2gtc2NyZWVuc2hvdCAvIHBlcnNpc3QtZ2FtZSBzaGFyZSBvbmUgaW1wbGVtZW50YXRpb24uXG4gICAgICAgIGNvbnN0IHJlc29sdmVkID0gdGhpcy5yZXNvbHZlQXV0b0NhcHR1cmVGaWxlKGBnYW1lLSR7RGF0ZS5ub3coKX0uJHtleHR9YCk7XG4gICAgICAgIGlmICghcmVzb2x2ZWQub2spIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IHJlc29sdmVkLmVycm9yIH07XG4gICAgICAgIGZzLndyaXRlRmlsZVN5bmMocmVzb2x2ZWQuZmlsZVBhdGgsIGJ1Zik7XG4gICAgICAgIHJldHVybiB7IG9rOiB0cnVlLCBmaWxlUGF0aDogcmVzb2x2ZWQuZmlsZVBhdGgsIHNpemU6IGJ1Zi5sZW5ndGggfTtcbiAgICB9XG5cbiAgICAvLyB2Mi45LnggVC1WMjktNTogc2FtZSBzaGFwZSBhcyBwZXJzaXN0R2FtZVNjcmVlbnNob3QgYnV0IGZvciB2aWRlb1xuICAgIC8vIHJlY29yZGluZ3MgKHdlYm0vbXA0KSByZXR1cm5lZCBieSByZWNvcmRfc3RvcC4gUmVjb3JkaW5ncyBjYW4gcnVuXG4gICAgLy8gdGVucyBvZiBzZWNvbmRzIGFuZCBwcm9kdWNlIHNpZ25pZmljYW50bHkgbGFyZ2VyIHBheWxvYWRzIHRoYW5cbiAgICAvLyBzdGlsbHMuXG4gICAgLy9cbiAgICAvLyB2Mi45LjUgcmV2aWV3IGZpeCAoR2VtaW5pIPCfn6EgKyBDb2RleCDwn5+hKTogYnVtcGVkIDMyIOKGkiA2NCBNQiB0b1xuICAgIC8vIGFjY29tbW9kYXRlIGhpZ2hlci1iaXRyYXRlIC8gbG9uZ2VyIHJlY29yZGluZ3MgKDUtMjAgTWJwcyDDlyAzMC02MHNcbiAgICAvLyA9IDE4LTE1MCBNQikuIEtlcHQgaW4gc3luYyB3aXRoIE1BWF9SRVFVRVNUX0JPRFlfQllURVMgaW5cbiAgICAvLyBtY3Atc2VydmVyLXNkay50czsgbG93ZXIgb25lIHRvIGRpYWwgYmFjayBpZiBtZW1vcnkgcHJlc3N1cmVcbiAgICAvLyBiZWNvbWVzIGEgY29uY2Vybi4gYmFzZTY0LWRlY29kZWQgYnl0ZSBjb3VudCBpcyByZWplY3RlZCBwcmUtZGVjb2RlXG4gICAgLy8gdG8gYXZvaWQgQnVmZmVyIGFsbG9jYXRpb24gc3Bpa2VzIG9uIG1hbGljaW91cyBjbGllbnRzLlxuICAgIHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IE1BWF9HQU1FX1JFQ09SRElOR19CWVRFUyA9IDY0ICogMTAyNCAqIDEwMjQ7XG5cbiAgICBwcml2YXRlIHBlcnNpc3RHYW1lUmVjb3JkaW5nKGRhdGFVcmw6IHN0cmluZyk6IHsgb2s6IHRydWU7IGZpbGVQYXRoOiBzdHJpbmc7IHNpemU6IG51bWJlciB9IHwgeyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmcgfSB7XG4gICAgICAgIC8vIHYyLjkuNSByZXZpZXcgZml4IGF0dGVtcHQgMSB1c2VkIGAoKD86O1teLF0qPykqKWAg4oCUIHN0aWxsXG4gICAgICAgIC8vIHJlamVjdGVkIGF0IGNvZGVjLWludGVybmFsIGNvbW1hcyAoZS5nLiBgY29kZWNzPXZwOSxvcHVzYClcbiAgICAgICAgLy8gYmVjYXVzZSB0aGUgcGVyLXBhcmFtIGBbXixdKmAgZXhjbHVkZXMgY29tbWFzIGluc2lkZSBhbnkgb25lXG4gICAgICAgIC8vIHBhcmFtJ3MgdmFsdWUuIHYyLjkuNiByb3VuZC0yIGZpeCAoR2VtaW5pIPCflLQgKyBDbGF1ZGUg8J+UtCArXG4gICAgICAgIC8vIENvZGV4IPCflLQg4oCUIDMtcmV2aWV3ZXIgY29uc2Vuc3VzKTogc3BsaXQgb24gdGhlIHVuYW1iaWd1b3VzXG4gICAgICAgIC8vIGA7YmFzZTY0LGAgdGVybWluYXRvciwgYWNjZXB0IEFOWSBjaGFyYWN0ZXJzIGluIHRoZSBwYXJhbWV0ZXJcbiAgICAgICAgLy8gc2VnbWVudCwgYW5kIHZhbGlkYXRlIHRoZSBwYXlsb2FkIHNlcGFyYXRlbHkgYXMgYmFzZTY0XG4gICAgICAgIC8vIGFscGhhYmV0IG9ubHkgKENvZGV4IHIyIHNpbmdsZS3wn5+hIHByb21vdGVkKS5cbiAgICAgICAgLy9cbiAgICAgICAgLy8gVXNlIGxhc3RJbmRleE9mIGZvciB0aGUgYDtiYXNlNjQsYCBib3VuZGFyeSBzbyBhIHBhcmFtIHZhbHVlXG4gICAgICAgIC8vIHRoYXQgaGFwcGVucyB0byBjb250YWluIHRoZSBsaXRlcmFsIHN1YnN0cmluZyBgO2Jhc2U2NCxgICh2ZXJ5XG4gICAgICAgIC8vIHVubGlrZWx5IGJ1dCBsZWdhbCBpbiBNSU1FIFJGQykgaXMgc3RpbGwgcGFyc2VkIGNvcnJlY3RseSDigJRcbiAgICAgICAgLy8gdGhlIGFjdHVhbCBiYXNlNjQgYWx3YXlzIGVuZHMgdGhlIFVSTC5cbiAgICAgICAgY29uc3QgbSA9IC9eZGF0YTp2aWRlb1xcLyh3ZWJtfG1wNCkoW15dKj8pO2Jhc2U2NCwoW0EtWmEtejAtOSsvXSo9ezAsMn0pJC9pLmV4ZWMoZGF0YVVybCk7XG4gICAgICAgIGlmICghbSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogJ0dhbWVEZWJ1Z0NsaWVudCByZXR1cm5lZCByZWNvcmRpbmcgZGF0YVVybCBpbiB1bmV4cGVjdGVkIGZvcm1hdCAoZXhwZWN0ZWQgZGF0YTp2aWRlby97d2VibXxtcDR9Wztjb2RlY3M9Li4uXTtiYXNlNjQsPGJhc2U2ND4pLiBUaGUgYmFzZTY0IHNlZ21lbnQgbXVzdCBiZSBhIHZhbGlkIGJhc2U2NCBhbHBoYWJldCBzdHJpbmcuJyB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGI2NExlbiA9IG1bM10ubGVuZ3RoO1xuICAgICAgICBjb25zdCBhcHByb3hCeXRlcyA9IE1hdGguY2VpbChiNjRMZW4gKiAzIC8gNCk7XG4gICAgICAgIGlmIChhcHByb3hCeXRlcyA+IERlYnVnVG9vbHMuTUFYX0dBTUVfUkVDT1JESU5HX0JZVEVTKSB7XG4gICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBgcmVjb3JkaW5nIHBheWxvYWQgdG9vIGxhcmdlOiB+JHthcHByb3hCeXRlc30gYnl0ZXMgZXhjZWVkcyBjYXAgJHtEZWJ1Z1Rvb2xzLk1BWF9HQU1FX1JFQ09SRElOR19CWVRFU30uIExvd2VyIHZpZGVvQml0c1BlclNlY29uZCBvciByZWR1Y2UgcmVjb3JkaW5nIGR1cmF0aW9uLmAgfTtcbiAgICAgICAgfVxuICAgICAgICAvLyBtWzFdIGlzIGFscmVhZHkgdGhlIGJhcmUgJ3dlYm0nfCdtcDQnOyBtWzJdIGlzIHRoZSBwYXJhbSB0YWlsXG4gICAgICAgIC8vIChgO2NvZGVjcz0uLi5gLCBtYXkgaW5jbHVkZSBjb2RlYy1pbnRlcm5hbCBjb21tYXMpOyBtWzNdIGlzIHRoZVxuICAgICAgICAvLyB2YWxpZGF0ZWQgYmFzZTY0IHBheWxvYWQuXG4gICAgICAgIGNvbnN0IGV4dCA9IG1bMV0udG9Mb3dlckNhc2UoKSA9PT0gJ21wNCcgPyAnbXA0JyA6ICd3ZWJtJztcbiAgICAgICAgY29uc3QgYnVmID0gQnVmZmVyLmZyb20obVszXSwgJ2Jhc2U2NCcpO1xuICAgICAgICBpZiAoYnVmLmxlbmd0aCA+IERlYnVnVG9vbHMuTUFYX0dBTUVfUkVDT1JESU5HX0JZVEVTKSB7XG4gICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBgcmVjb3JkaW5nIHBheWxvYWQgdG9vIGxhcmdlIGFmdGVyIGRlY29kZTogJHtidWYubGVuZ3RofSBieXRlcyBleGNlZWRzIGNhcCAke0RlYnVnVG9vbHMuTUFYX0dBTUVfUkVDT1JESU5HX0JZVEVTfWAgfTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCByZXNvbHZlZCA9IHRoaXMucmVzb2x2ZUF1dG9DYXB0dXJlRmlsZShgcmVjb3JkaW5nLSR7RGF0ZS5ub3coKX0uJHtleHR9YCk7XG4gICAgICAgIGlmICghcmVzb2x2ZWQub2spIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IHJlc29sdmVkLmVycm9yIH07XG4gICAgICAgIGZzLndyaXRlRmlsZVN5bmMocmVzb2x2ZWQuZmlsZVBhdGgsIGJ1Zik7XG4gICAgICAgIHJldHVybiB7IG9rOiB0cnVlLCBmaWxlUGF0aDogcmVzb2x2ZWQuZmlsZVBhdGgsIHNpemU6IGJ1Zi5sZW5ndGggfTtcbiAgICB9XG5cbiAgICAvLyB2Mi40LjggQTE6IFRTIGRpYWdub3N0aWNzIGhhbmRsZXJzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICAgIHByaXZhdGUgYXN5bmMgd2FpdENvbXBpbGVJbXBsKHRpbWVvdXRNczogbnVtYmVyID0gMTUwMDApOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBwcm9qZWN0UGF0aCA9IEVkaXRvcj8uUHJvamVjdD8ucGF0aDtcbiAgICAgICAgaWYgKCFwcm9qZWN0UGF0aCkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ3dhaXRfY29tcGlsZTogZWRpdG9yIGNvbnRleHQgdW5hdmFpbGFibGUgKG5vIEVkaXRvci5Qcm9qZWN0LnBhdGgpJyk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgd2FpdEZvckNvbXBpbGUocHJvamVjdFBhdGgsIHRpbWVvdXRNcyk7XG4gICAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKHJlc3VsdC5lcnJvciA/PyAnd2FpdF9jb21waWxlIGZhaWxlZCcsIHJlc3VsdCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG9rKHJlc3VsdCwgcmVzdWx0LmNvbXBpbGVkXG4gICAgICAgICAgICAgICAgPyBgQ29tcGlsZSBmaW5pc2hlZCBpbiAke3Jlc3VsdC53YWl0ZWRNc31tc2BcbiAgICAgICAgICAgICAgICA6IChyZXN1bHQubm90ZSA/PyAnTm8gY29tcGlsZSB0cmlnZ2VyZWQgb3IgdGltZWQgb3V0JykpO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgcnVuU2NyaXB0RGlhZ25vc3RpY3NJbXBsKHRzY29uZmlnUGF0aD86IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHByb2plY3RQYXRoID0gRWRpdG9yPy5Qcm9qZWN0Py5wYXRoO1xuICAgICAgICBpZiAoIXByb2plY3RQYXRoKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbCgncnVuX3NjcmlwdF9kaWFnbm9zdGljczogZWRpdG9yIGNvbnRleHQgdW5hdmFpbGFibGUgKG5vIEVkaXRvci5Qcm9qZWN0LnBhdGgpJyk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgcnVuU2NyaXB0RGlhZ25vc3RpY3MocHJvamVjdFBhdGgsIHsgdHNjb25maWdQYXRoIH0pO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgc3VjY2VzczogcmVzdWx0Lm9rLFxuICAgICAgICAgICAgbWVzc2FnZTogcmVzdWx0LnN1bW1hcnksXG4gICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgdG9vbDogcmVzdWx0LnRvb2wsXG4gICAgICAgICAgICAgICAgYmluYXJ5OiByZXN1bHQuYmluYXJ5LFxuICAgICAgICAgICAgICAgIHRzY29uZmlnUGF0aDogcmVzdWx0LnRzY29uZmlnUGF0aCxcbiAgICAgICAgICAgICAgICBleGl0Q29kZTogcmVzdWx0LmV4aXRDb2RlLFxuICAgICAgICAgICAgICAgIGRpYWdub3N0aWNzOiByZXN1bHQuZGlhZ25vc3RpY3MsXG4gICAgICAgICAgICAgICAgZGlhZ25vc3RpY0NvdW50OiByZXN1bHQuZGlhZ25vc3RpY3MubGVuZ3RoLFxuICAgICAgICAgICAgICAgIC8vIHYyLjQuOSByZXZpZXcgZml4OiBzcGF3biBmYWlsdXJlcyAoYmluYXJ5IG1pc3NpbmcgL1xuICAgICAgICAgICAgICAgIC8vIHBlcm1pc3Npb24gZGVuaWVkKSBzdXJmYWNlZCBleHBsaWNpdGx5IHNvIEFJIGNhblxuICAgICAgICAgICAgICAgIC8vIGRpc3Rpbmd1aXNoIFwidHNjIG5ldmVyIHJhblwiIGZyb20gXCJ0c2MgZm91bmQgZXJyb3JzXCIuXG4gICAgICAgICAgICAgICAgc3Bhd25GYWlsZWQ6IHJlc3VsdC5zcGF3bkZhaWxlZCA9PT0gdHJ1ZSxcbiAgICAgICAgICAgICAgICBzeXN0ZW1FcnJvcjogcmVzdWx0LnN5c3RlbUVycm9yLFxuICAgICAgICAgICAgICAgIC8vIFRydW5jYXRlIHJhdyBzdHJlYW1zIHRvIGtlZXAgdG9vbCByZXN1bHQgcmVhc29uYWJsZTtcbiAgICAgICAgICAgICAgICAvLyBmdWxsIGNvbnRlbnQgcmFyZWx5IHVzZWZ1bCB3aGVuIHRoZSBwYXJzZXIgYWxyZWFkeVxuICAgICAgICAgICAgICAgIC8vIHN0cnVjdHVyZWQgdGhlIGVycm9ycy5cbiAgICAgICAgICAgICAgICBzdGRvdXRUYWlsOiByZXN1bHQuc3Rkb3V0LnNsaWNlKC0yMDAwKSxcbiAgICAgICAgICAgICAgICBzdGRlcnJUYWlsOiByZXN1bHQuc3RkZXJyLnNsaWNlKC0yMDAwKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRTY3JpcHREaWFnbm9zdGljQ29udGV4dEltcGwoXG4gICAgICAgIGZpbGU6IHN0cmluZyxcbiAgICAgICAgbGluZTogbnVtYmVyLFxuICAgICAgICBjb250ZXh0TGluZXM6IG51bWJlciA9IDUsXG4gICAgKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgcHJvamVjdFBhdGggPSBFZGl0b3I/LlByb2plY3Q/LnBhdGg7XG4gICAgICAgIGlmICghcHJvamVjdFBhdGgpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKCdnZXRfc2NyaXB0X2RpYWdub3N0aWNfY29udGV4dDogZWRpdG9yIGNvbnRleHQgdW5hdmFpbGFibGUnKTtcbiAgICAgICAgfVxuICAgICAgICAvLyB2Mi45LnggcG9saXNoIChHZW1pbmkgcjIgc2luZ2xlLfCfn6EgZnJvbSB2Mi44LjEgcmV2aWV3KTogY29udmVyZ2VcbiAgICAgICAgLy8gb24gYXNzZXJ0U2F2ZVBhdGhXaXRoaW5Qcm9qZWN0LiBUaGUgcHJldmlvdXMgYmVzcG9rZSByZWFscGF0aFxuICAgICAgICAvLyArIHRvTG93ZXJDYXNlICsgcGF0aC5zZXAgY2hlY2sgaXMgZnVuY3Rpb25hbGx5IHN1YnN1bWVkIGJ5IHRoZVxuICAgICAgICAvLyBzaGFyZWQgaGVscGVyICh3aGljaCBpdHNlbGYgbW92ZWQgdG8gdGhlIHBhdGgucmVsYXRpdmUtYmFzZWRcbiAgICAgICAgLy8gaXNQYXRoV2l0aGluUm9vdCBpbiB2Mi45LnggcG9saXNoICMxLCBoYW5kbGluZyBkcml2ZS1yb290IGFuZFxuICAgICAgICAvLyBwcmVmaXgtY29sbGlzaW9uIGVkZ2VzIHVuaWZvcm1seSkuXG4gICAgICAgIGNvbnN0IGd1YXJkID0gdGhpcy5hc3NlcnRTYXZlUGF0aFdpdGhpblByb2plY3QoZmlsZSk7XG4gICAgICAgIGlmICghZ3VhcmQub2spIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGBnZXRfc2NyaXB0X2RpYWdub3N0aWNfY29udGV4dDogJHtndWFyZC5lcnJvcn1gKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCByZXNvbHZlZCA9IGd1YXJkLnJlc29sdmVkUGF0aDtcbiAgICAgICAgaWYgKCFmcy5leGlzdHNTeW5jKHJlc29sdmVkKSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoYGdldF9zY3JpcHRfZGlhZ25vc3RpY19jb250ZXh0OiBmaWxlIG5vdCBmb3VuZDogJHtyZXNvbHZlZH1gKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBzdGF0ID0gZnMuc3RhdFN5bmMocmVzb2x2ZWQpO1xuICAgICAgICBpZiAoc3RhdC5zaXplID4gNSAqIDEwMjQgKiAxMDI0KSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChgZ2V0X3NjcmlwdF9kaWFnbm9zdGljX2NvbnRleHQ6IGZpbGUgdG9vIGxhcmdlICgke3N0YXQuc2l6ZX0gYnl0ZXMpOyByZWZ1c2luZyB0byByZWFkLmApO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGNvbnRlbnQgPSBmcy5yZWFkRmlsZVN5bmMocmVzb2x2ZWQsICd1dGY4Jyk7XG4gICAgICAgIGNvbnN0IGFsbExpbmVzID0gY29udGVudC5zcGxpdCgvXFxyP1xcbi8pO1xuICAgICAgICBpZiAobGluZSA8IDEgfHwgbGluZSA+IGFsbExpbmVzLmxlbmd0aCkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoYGdldF9zY3JpcHRfZGlhZ25vc3RpY19jb250ZXh0OiBsaW5lICR7bGluZX0gb3V0IG9mIHJhbmdlIDEuLiR7YWxsTGluZXMubGVuZ3RofWApO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHN0YXJ0ID0gTWF0aC5tYXgoMSwgbGluZSAtIGNvbnRleHRMaW5lcyk7XG4gICAgICAgIGNvbnN0IGVuZCA9IE1hdGgubWluKGFsbExpbmVzLmxlbmd0aCwgbGluZSArIGNvbnRleHRMaW5lcyk7XG4gICAgICAgIGNvbnN0IHdpbmRvdyA9IGFsbExpbmVzLnNsaWNlKHN0YXJ0IC0gMSwgZW5kKTtcbiAgICAgICAgY29uc3QgcHJvamVjdFJlc29sdmVkTm9ybSA9IHBhdGgucmVzb2x2ZShwcm9qZWN0UGF0aCk7XG4gICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgZmlsZTogcGF0aC5yZWxhdGl2ZShwcm9qZWN0UmVzb2x2ZWROb3JtLCByZXNvbHZlZCksXG4gICAgICAgICAgICAgICAgYWJzb2x1dGVQYXRoOiByZXNvbHZlZCxcbiAgICAgICAgICAgICAgICB0YXJnZXRMaW5lOiBsaW5lLFxuICAgICAgICAgICAgICAgIHN0YXJ0TGluZTogc3RhcnQsXG4gICAgICAgICAgICAgICAgZW5kTGluZTogZW5kLFxuICAgICAgICAgICAgICAgIHRvdGFsTGluZXM6IGFsbExpbmVzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICBsaW5lczogd2luZG93Lm1hcCgodGV4dCwgaSkgPT4gKHsgbGluZTogc3RhcnQgKyBpLCB0ZXh0IH0pKSxcbiAgICAgICAgICAgIH0sIGBSZWFkICR7d2luZG93Lmxlbmd0aH0gbGluZXMgb2YgY29udGV4dCBhcm91bmQgJHtwYXRoLnJlbGF0aXZlKHByb2plY3RSZXNvbHZlZE5vcm0sIHJlc29sdmVkKX06JHtsaW5lfWApO1xuICAgIH1cbn1cbiJdfQ==