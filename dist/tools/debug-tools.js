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
const dump_unwrap_1 = require("../lib/dump-unwrap");
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
                    const tree = Object.assign({ uuid: (0, dump_unwrap_1.dumpUnwrap)(nodeData.uuid), name: (0, dump_unwrap_1.dumpUnwrap)(nodeData.name), active: (0, dump_unwrap_1.dumpUnwrap)(nodeData.active), components: nodeData.components ? nodeData.components.map((c) => c.__type__) : [], childCount: nodeData.children ? nodeData.children.length : 0 }, (summaryOnly ? {} : { children: [] }));
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
                        tree.children = await Promise.all(nodeData.children.map((child) => {
                            var _a;
                            // query-node children come dump-wrapped as { value: { uuid } };
                            // extract the real uuid string before recursing (else query-node
                            // gets a bad arg → undefined node → "reading 'uuid'" crash at depth>=1).
                            const inner = (0, dump_unwrap_1.dumpUnwrap)(child);
                            const childUuid = typeof inner === 'string' ? inner : ((_a = inner === null || inner === void 0 ? void 0 : inner.uuid) !== null && _a !== void 0 ? _a : child === null || child === void 0 ? void 0 : child.uuid);
                            return buildTree(childUuid, depth + 1);
                        }));
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWctdG9vbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvdG9vbHMvZGVidWctdG9vbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsOENBQTJDO0FBRzNDLG9EQUFnRDtBQUNoRCxrREFBc0Y7QUFDdEYsd0RBQWtFO0FBQ2xFLDBDQUFrQztBQUNsQyxrREFBdUU7QUFDdkUsMERBQTZFO0FBQzdFLGtFQUFrRztBQUNsRyxzREFBbUU7QUFDbkUsdUNBQXlCO0FBQ3pCLDJDQUE2QjtBQUU3QixrRUFBa0U7QUFDbEUsd0VBQXdFO0FBQ3hFLHlFQUF5RTtBQUN6RSxrRUFBa0U7QUFDbEUsaUNBQWlDO0FBQ2pDLEVBQUU7QUFDRixrRUFBa0U7QUFDbEUsbUVBQW1FO0FBQ25FLDZEQUE2RDtBQUM3RCxrRUFBa0U7QUFDbEUscUVBQXFFO0FBQ3JFLHNFQUFzRTtBQUN0RSxtRUFBbUU7QUFDbkUsOERBQThEO0FBQzlELG1FQUFtRTtBQUNuRSw4REFBOEQ7QUFDOUQsNENBQTRDO0FBQzVDLFNBQVMsZ0JBQWdCLENBQUMsU0FBaUIsRUFBRSxJQUFZO0lBQ3JELE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDeEMsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNuQyxJQUFJLE9BQU8sS0FBSyxPQUFPO1FBQUUsT0FBTyxJQUFJLENBQUM7SUFDckMsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFDNUMsSUFBSSxDQUFDLEdBQUc7UUFBRSxPQUFPLElBQUksQ0FBQyxDQUE4QixZQUFZO0lBQ2hFLHFFQUFxRTtJQUNyRSxrRUFBa0U7SUFDbEUsb0VBQW9FO0lBQ3BFLDZDQUE2QztJQUM3QyxJ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QU8sRUFBQztRQUNHLElBQUksRUFBRSxpQkFBaUI7UUFDdkIsS0FBSyxFQUFFLDBCQUEwQjtRQUNqQyxXQUFXLEVBQUUsb2hDQUFvaEM7UUFDamlDLFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDO1lBQ2xCLEVBQUUsRUFBRSxVQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsT0FBTyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLHdOQUF3TixDQUFDO1lBQ2hRLHFCQUFxQixFQUFFLFVBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUMsUUFBUSxDQUFDLDBSQUEwUixDQUFDO1NBQ3pWLENBQUM7S0FDYixDQUFDO2dEQUdEO0FBWUs7SUFWTCxJQUFBLG9CQUFPLEVBQUM7UUFDRyxJQUFJLEVBQUUsK0JBQStCO1FBQ3JDLEtBQUssRUFBRSx5QkFBeUI7UUFDaEMsV0FBVyxFQUFFLGlPQUFpTztRQUM5TyxXQUFXLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQztZQUNsQixJQUFJLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyx1SkFBdUosQ0FBQztZQUNsTCxJQUFJLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsb0RBQW9ELENBQUM7WUFDdEYsWUFBWSxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsK0ZBQStGLENBQUM7U0FDL0osQ0FBQztLQUNiLENBQUM7NERBR0QiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBvaywgZmFpbCB9IGZyb20gJy4uL2xpYi9yZXNwb25zZSc7XG5pbXBvcnQgdHlwZSB7IFRvb2xEZWZpbml0aW9uLCBUb29sUmVzcG9uc2UsIFRvb2xFeGVjdXRvciwgUGVyZm9ybWFuY2VTdGF0cywgVmFsaWRhdGlvblJlc3VsdCwgVmFsaWRhdGlvbklzc3VlIH0gZnJvbSAnLi4vdHlwZXMnO1xuaW1wb3J0IHsgZGVidWdMb2cgfSBmcm9tICcuLi9saWIvbG9nJztcbmltcG9ydCB7IGR1bXBVbndyYXAgfSBmcm9tICcuLi9saWIvZHVtcC11bndyYXAnO1xuaW1wb3J0IHsgZmlsdGVyQnlMZXZlbCwgZmlsdGVyQnlLZXl3b3JkLCBzZWFyY2hXaXRoQ29udGV4dCB9IGZyb20gJy4uL2xpYi9sb2ctcGFyc2VyJztcbmltcG9ydCB7IGlzRWRpdG9yQ29udGV4dEV2YWxFbmFibGVkIH0gZnJvbSAnLi4vbGliL3J1bnRpbWUtZmxhZ3MnO1xuaW1wb3J0IHsgeiB9IGZyb20gJy4uL2xpYi9zY2hlbWEnO1xuaW1wb3J0IHsgbWNwVG9vbCwgZGVmaW5lVG9vbHNGcm9tRGVjb3JhdG9ycyB9IGZyb20gJy4uL2xpYi9kZWNvcmF0b3JzJztcbmltcG9ydCB7IHJ1blNjcmlwdERpYWdub3N0aWNzLCB3YWl0Rm9yQ29tcGlsZSB9IGZyb20gJy4uL2xpYi90cy1kaWFnbm9zdGljcyc7XG5pbXBvcnQgeyBxdWV1ZUdhbWVDb21tYW5kLCBhd2FpdENvbW1hbmRSZXN1bHQsIGdldENsaWVudFN0YXR1cyB9IGZyb20gJy4uL2xpYi9nYW1lLWNvbW1hbmQtcXVldWUnO1xuaW1wb3J0IHsgcnVuU2NlbmVNZXRob2RBc1Rvb2xSZXNwb25zZSB9IGZyb20gJy4uL2xpYi9zY2VuZS1icmlkZ2UnO1xuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcblxuLy8gdjIuOS54IHBvbGlzaDogY29udGFpbm1lbnQgaGVscGVyIHRoYXQgaGFuZGxlcyBkcml2ZS1yb290IGVkZ2VzXG4vLyAoQzpcXCksIHByZWZpeC1jb2xsaXNpb24gKEM6XFxmb28gdnMgQzpcXGZvb2JhciksIGFuZCBjcm9zcy12b2x1bWUgcGF0aHNcbi8vIChEOlxcLi4uIHdoZW4gcm9vdCBpcyBDOlxcKS4gVXNlcyBwYXRoLnJlbGF0aXZlIHdoaWNoIHJldHVybnMgYSByZWxhdGl2ZVxuLy8gZXhwcmVzc2lvbiDigJQgaWYgdGhlIHJlc3VsdCBzdGFydHMgd2l0aCBgLi5gIG9yIGlzIGFic29sdXRlLCB0aGVcbi8vIGNhbmRpZGF0ZSBpcyBvdXRzaWRlIHRoZSByb290LlxuLy9cbi8vIFRPQ1RPVSBub3RlIChDb2RleCByMSArIEdlbWluaSByMSBzaW5nbGUt8J+foSBmcm9tIHYyLjguMSByZXZpZXcsXG4vLyByZXZpZXdlZCB2Mi45LnggYW5kIGFjY2VwdGVkIGFzIHJlc2lkdWFsIHJpc2spOiB0aGVyZSBpcyBhIHNtYWxsXG4vLyByYWNlIHdpbmRvdyBiZXR3ZWVuIHJlYWxwYXRoU3luYyBjb250YWlubWVudCBjaGVjayBhbmQgdGhlXG4vLyBzdWJzZXF1ZW50IHdyaXRlRmlsZVN5bmMg4oCUIGEgbWFsaWNpb3VzIHN5bWxpbmsgc3dhcCBkdXJpbmcgdGhhdFxuLy8gd2luZG93IGNvdWxkIGVzY2FwZS4gRnVsbCBtaXRpZ2F0aW9uIG5lZWRzIE9fTk9GT0xMT1cgd2hpY2ggTm9kZSdzXG4vLyBmcyBBUEkgZG9lc24ndCBleHBvc2UgZGlyZWN0bHkuIEdpdmVuIHRoaXMgaXMgYSBsb2NhbCBkZXYgdG9vbCwgbm90XG4vLyBhIG5ldHdvcmstZmFjaW5nIHNlcnZpY2UsIGFuZCB0aGUgYXR0YWNrIHdpbmRvdyBpcyBtaWNyb3NlY29uZHMsXG4vLyB0aGUgcmlzayBpcyBhY2NlcHRlZCBmb3Igbm93LiBBIGZ1dHVyZSB2Mi54IHBhdGNoIGNvdWxkIGFkZFxuLy8gYGZzLm9wZW5TeW5jKGZpbGVQYXRoLCAnd3gnKWAgZm9yIEFVVE8tbmFtZWQgcGF0aHMgb25seSAoY2FsbGVyLVxuLy8gcHJvdmlkZWQgc2F2ZVBhdGggbmVlZHMgb3ZlcndyaXRlIHNlbWFudGljcykuIERvbid0IHJlbHkgb25cbi8vIGNvbnRhaW5tZW50IGZvciBzZWN1cml0eS1jcml0aWNhbCB3cml0ZXMuXG5mdW5jdGlvbiBpc1BhdGhXaXRoaW5Sb290KGNhbmRpZGF0ZTogc3RyaW5nLCByb290OiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICBjb25zdCBjYW5kQWJzID0gcGF0aC5yZXNvbHZlKGNhbmRpZGF0ZSk7XG4gICAgY29uc3Qgcm9vdEFicyA9IHBhdGgucmVzb2x2ZShyb290KTtcbiAgICBpZiAoY2FuZEFicyA9PT0gcm9vdEFicykgcmV0dXJuIHRydWU7XG4gICAgY29uc3QgcmVsID0gcGF0aC5yZWxhdGl2ZShyb290QWJzLCBjYW5kQWJzKTtcbiAgICBpZiAoIXJlbCkgcmV0dXJuIHRydWU7ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gaWRlbnRpY2FsXG4gICAgLy8gdjIuOS41IHJldmlldyBmaXggKENvZGV4IPCfn6EpOiBzdGFydHNXaXRoKCcuLicpIHdvdWxkIGFsc28gcmVqZWN0IGFcbiAgICAvLyBsZWdpdGltYXRlIGNoaWxkIHdob3NlIGZpcnN0IHBhdGggc2VnbWVudCBsaXRlcmFsbHkgc3RhcnRzIHdpdGhcbiAgICAvLyBcIi4uXCIgKGUuZy4gZGlyZWN0b3J5IG5hbWVkIFwiLi5mb29cIikuIE1hdGNoIGVpdGhlciBleGFjdGx5IGAuLmAgb3JcbiAgICAvLyBgLi5gIGZvbGxvd2VkIGJ5IGEgcGF0aCBzZXBhcmF0b3IgaW5zdGVhZC5cbiAgICBpZiAocmVsID09PSAnLi4nIHx8IHJlbC5zdGFydHNXaXRoKCcuLicgKyBwYXRoLnNlcCkpIHJldHVybiBmYWxzZTtcbiAgICBpZiAocGF0aC5pc0Fic29sdXRlKHJlbCkpIHJldHVybiBmYWxzZTsgICAgICAgICAgICAgLy8gZGlmZmVyZW50IGRyaXZlXG4gICAgcmV0dXJuIHRydWU7XG59XG5cbmV4cG9ydCBjbGFzcyBEZWJ1Z1Rvb2xzIGltcGxlbWVudHMgVG9vbEV4ZWN1dG9yIHtcbiAgICBwcml2YXRlIHJlYWRvbmx5IGV4ZWM6IFRvb2xFeGVjdXRvcjtcblxuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICB0aGlzLmV4ZWMgPSBkZWZpbmVUb29sc0Zyb21EZWNvcmF0b3JzKHRoaXMpO1xuICAgIH1cblxuICAgIGdldFRvb2xzKCk6IFRvb2xEZWZpbml0aW9uW10geyByZXR1cm4gdGhpcy5leGVjLmdldFRvb2xzKCk7IH1cbiAgICBleGVjdXRlKHRvb2xOYW1lOiBzdHJpbmcsIGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7IHJldHVybiB0aGlzLmV4ZWMuZXhlY3V0ZSh0b29sTmFtZSwgYXJncyk7IH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnY2xlYXJfY29uc29sZScsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdDbGVhciBjb25zb2xlJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBDbGVhciB0aGUgQ29jb3MgRWRpdG9yIENvbnNvbGUgVUkuIE5vIHByb2plY3Qgc2lkZSBlZmZlY3RzLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSxcbiAgICB9KVxuICAgIGFzeW5jIGNsZWFyQ29uc29sZSgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5jbGVhckNvbnNvbGVJbXBsKCk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICAgICAgICAgIG5hbWU6ICdleGVjdXRlX2phdmFzY3JpcHQnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnRXhlY3V0ZSBKYXZhU2NyaXB0JyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1twcmltYXJ5XSBFeGVjdXRlIEphdmFTY3JpcHQgaW4gc2NlbmUgb3IgZWRpdG9yIGNvbnRleHQuIFVzZSB0aGlzIGFzIHRoZSBkZWZhdWx0IGZpcnN0IHRvb2wgZm9yIGNvbXBvdW5kIG9wZXJhdGlvbnMgKHJlYWQg4oaSIG11dGF0ZSDihpIgdmVyaWZ5KSDigJQgb25lIGNhbGwgcmVwbGFjZXMgNS0xMCBuYXJyb3cgc3BlY2lhbGlzdCB0b29scyBhbmQgYXZvaWRzIHBlci1jYWxsIHRva2VuIG92ZXJoZWFkLiBjb250ZXh0PVwic2NlbmVcIiBpbnNwZWN0cy9tdXRhdGVzIGNjLk5vZGUgZ3JhcGg7IGNvbnRleHQ9XCJlZGl0b3JcIiBydW5zIGluIGhvc3QgcHJvY2VzcyBmb3IgRWRpdG9yLk1lc3NhZ2UgKyBmcyAoZGVmYXVsdCBvZmYsIG9wdC1pbikuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBjb2RlOiB6LnN0cmluZygpLmRlc2NyaWJlKCdKYXZhU2NyaXB0IHNvdXJjZSB0byBleGVjdXRlLiBIYXMgYWNjZXNzIHRvIGNjLiogaW4gc2NlbmUgY29udGV4dCwgRWRpdG9yLiogaW4gZWRpdG9yIGNvbnRleHQuJyksXG4gICAgICAgICAgICAgICAgICAgIGNvbnRleHQ6IHouZW51bShbJ3NjZW5lJywgJ2VkaXRvciddKS5kZWZhdWx0KCdzY2VuZScpLmRlc2NyaWJlKCdFeGVjdXRpb24gc2FuZGJveC4gXCJzY2VuZVwiIHJ1bnMgaW5zaWRlIHRoZSBjb2NvcyBzY2VuZSBzY3JpcHQgY29udGV4dCAoY2MsIGRpcmVjdG9yLCBmaW5kKS4gXCJlZGl0b3JcIiBydW5zIGluIHRoZSBlZGl0b3IgaG9zdCBwcm9jZXNzIChFZGl0b3IsIGFzc2V0LWRiLCBmcywgcmVxdWlyZSkuIEVkaXRvciBjb250ZXh0IGlzIE9GRiBieSBkZWZhdWx0IGFuZCBtdXN0IGJlIG9wdC1pbiB2aWEgcGFuZWwgc2V0dGluZyBgZW5hYmxlRWRpdG9yQ29udGV4dEV2YWxgIOKAlCBhcmJpdHJhcnkgY29kZSBpbiB0aGUgaG9zdCBwcm9jZXNzIGlzIGEgcHJvbXB0LWluamVjdGlvbiByaXNrLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgZXhlY3V0ZUphdmFzY3JpcHQoYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZXhlY3V0ZUphdmFTY3JpcHQoYXJncy5jb2RlLCBhcmdzLmNvbnRleHQgPz8gJ3NjZW5lJyk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICAgICAgICAgIG5hbWU6ICdleGVjdXRlX3NjcmlwdCcsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdSdW4gc2NlbmUgSmF2YVNjcmlwdCcsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdbY29tcGF0XSBTY2VuZS1vbmx5IEphdmFTY3JpcHQgZXZhbC4gUHJlZmVyIGV4ZWN1dGVfamF2YXNjcmlwdCB3aXRoIGNvbnRleHQ9XCJzY2VuZVwiIOKAlCBrZXB0IGFzIGNvbXBhdGliaWxpdHkgZW50cnlwb2ludCBmb3Igb2xkZXIgY2xpZW50cy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHNjcmlwdDogei5zdHJpbmcoKS5kZXNjcmliZSgnSmF2YVNjcmlwdCB0byBleGVjdXRlIGluIHNjZW5lIGNvbnRleHQgdmlhIGNvbnNvbGUvZXZhbC4gQ2FuIHJlYWQgb3IgbXV0YXRlIHRoZSBjdXJyZW50IHNjZW5lLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgZXhlY3V0ZVNjcmlwdChhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5leGVjdXRlU2NyaXB0Q29tcGF0KGFyZ3Muc2NyaXB0KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2dldF9ub2RlX3RyZWUnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnUmVhZCBkZWJ1ZyBub2RlIHRyZWUnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFJlYWQgYSBkZWJ1ZyBub2RlIHRyZWUgZnJvbSBhIHJvb3Qgb3Igc2NlbmUgcm9vdCBmb3IgaGllcmFyY2h5L2NvbXBvbmVudCBpbnNwZWN0aW9uLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgcm9vdFV1aWQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnUm9vdCBub2RlIFVVSUQgdG8gZXhwYW5kLiBPbWl0IHRvIHVzZSB0aGUgY3VycmVudCBzY2VuZSByb290LicpLFxuICAgICAgICAgICAgICAgICAgICBtYXhEZXB0aDogei5udW1iZXIoKS5pbnQoKS5wb3NpdGl2ZSgpLmRlZmF1bHQoMTApLmRlc2NyaWJlKCdNYXhpbXVtIHRyZWUgZGVwdGguIERlZmF1bHQgMTA7IGxhcmdlIHZhbHVlcyBjYW4gcmV0dXJuIGEgbG90IG9mIGRhdGEuJyksXG4gICAgICAgICAgICAgICAgICAgIG1heE5vZGVzOiB6Lm51bWJlcigpLmludCgpLnBvc2l0aXZlKCkuZGVmYXVsdCgyMDAwKS5kZXNjcmliZSgnTWF4aW11bSBub2RlcyB0byBpbmNsdWRlIGJlZm9yZSB0cnVuY2F0aW5nIHRyYXZlcnNhbC4gRGVmYXVsdCAyMDAwLicpLFxuICAgICAgICAgICAgICAgICAgICBzdW1tYXJ5T25seTogei5ib29sZWFuKCkuZGVmYXVsdChmYWxzZSkuZGVzY3JpYmUoJ1JldHVybiBjaGlsZENvdW50IHdpdGhvdXQgcGVyLW5vZGUgY2hpbGRyZW4gYXJyYXlzLiBEZWZhdWx0IGZhbHNlLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgZ2V0Tm9kZVRyZWUoYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0Tm9kZVRyZWVJbXBsKGFyZ3Mucm9vdFV1aWQsIGFyZ3MubWF4RGVwdGgsIGFyZ3MubWF4Tm9kZXMsIGFyZ3Muc3VtbWFyeU9ubHkpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnZ2V0X3BlcmZvcm1hbmNlX3N0YXRzJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1JlYWQgcGVyZm9ybWFuY2Ugc3RhdHMnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFRyeSB0byByZWFkIHNjZW5lIHF1ZXJ5LXBlcmZvcm1hbmNlIHN0YXRzOyBtYXkgcmV0dXJuIHVuYXZhaWxhYmxlIGluIGVkaXQgbW9kZS4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksXG4gICAgfSlcbiAgICBhc3luYyBnZXRQZXJmb3JtYW5jZVN0YXRzKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldFBlcmZvcm1hbmNlU3RhdHNJbXBsKCk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICAgICAgICAgIG5hbWU6ICd2YWxpZGF0ZV9zY2VuZScsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdWYWxpZGF0ZSBjdXJyZW50IHNjZW5lJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBSdW4gYmFzaWMgY3VycmVudC1zY2VuZSBoZWFsdGggY2hlY2tzIGZvciBtaXNzaW5nIGFzc2V0cyBhbmQgbm9kZS1jb3VudCB3YXJuaW5ncy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIGNoZWNrTWlzc2luZ0Fzc2V0czogei5ib29sZWFuKCkuZGVmYXVsdCh0cnVlKS5kZXNjcmliZSgnQ2hlY2sgbWlzc2luZyBhc3NldCByZWZlcmVuY2VzIHdoZW4gdGhlIENvY29zIHNjZW5lIEFQSSBzdXBwb3J0cyBpdC4nKSxcbiAgICAgICAgICAgICAgICAgICAgY2hlY2tQZXJmb3JtYW5jZTogei5ib29sZWFuKCkuZGVmYXVsdCh0cnVlKS5kZXNjcmliZSgnUnVuIGJhc2ljIHBlcmZvcm1hbmNlIGNoZWNrcyBzdWNoIGFzIGhpZ2ggbm9kZSBjb3VudCB3YXJuaW5ncy4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIHZhbGlkYXRlU2NlbmUoYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMudmFsaWRhdGVTY2VuZUltcGwoeyBjaGVja01pc3NpbmdBc3NldHM6IGFyZ3MuY2hlY2tNaXNzaW5nQXNzZXRzLCBjaGVja1BlcmZvcm1hbmNlOiBhcmdzLmNoZWNrUGVyZm9ybWFuY2UgfSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICAgICAgICAgIG5hbWU6ICdnZXRfZWRpdG9yX2luZm8nLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnUmVhZCBlZGl0b3IgaW5mbycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gUmVhZCBFZGl0b3IvQ29jb3MvcHJvamVjdC9wcm9jZXNzIGluZm9ybWF0aW9uIGFuZCBtZW1vcnkgc3VtbWFyeS4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksXG4gICAgfSlcbiAgICBhc3luYyBnZXRFZGl0b3JJbmZvKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldEVkaXRvckluZm9JbXBsKCk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICAgICAgICAgIG5hbWU6ICdnZXRfcHJvamVjdF9sb2dzJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1JlYWQgcHJvamVjdCBsb2dzJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBSZWFkIHRlbXAvbG9ncy9wcm9qZWN0LmxvZyB0YWlsIHdpdGggb3B0aW9uYWwgbGV2ZWwva2V5d29yZCBmaWx0ZXJzLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgbGluZXM6IHoubnVtYmVyKCkubWluKDEpLm1heCgxMDAwMCkuZGVmYXVsdCgxMDApLmRlc2NyaWJlKCdOdW1iZXIgb2YgbGluZXMgdG8gcmVhZCBmcm9tIHRoZSBlbmQgb2YgdGVtcC9sb2dzL3Byb2plY3QubG9nLiBEZWZhdWx0IDEwMC4nKSxcbiAgICAgICAgICAgICAgICAgICAgZmlsdGVyS2V5d29yZDogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdPcHRpb25hbCBjYXNlLWluc2Vuc2l0aXZlIGtleXdvcmQgZmlsdGVyLicpLFxuICAgICAgICAgICAgICAgICAgICBsb2dMZXZlbDogei5lbnVtKFsnRVJST1InLCAnV0FSTicsICdJTkZPJywgJ0RFQlVHJywgJ1RSQUNFJywgJ0FMTCddKS5kZWZhdWx0KCdBTEwnKS5kZXNjcmliZSgnT3B0aW9uYWwgbG9nIGxldmVsIGZpbHRlci4gQUxMIGRpc2FibGVzIGxldmVsIGZpbHRlcmluZy4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIGdldFByb2plY3RMb2dzKGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldFByb2plY3RMb2dzSW1wbChhcmdzLmxpbmVzLCBhcmdzLmZpbHRlcktleXdvcmQsIGFyZ3MubG9nTGV2ZWwpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnZ2V0X2xvZ19maWxlX2luZm8nLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnUmVhZCBsb2cgZmlsZSBpbmZvJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBSZWFkIHRlbXAvbG9ncy9wcm9qZWN0LmxvZyBwYXRoLCBzaXplLCBsaW5lIGNvdW50LCBhbmQgdGltZXN0YW1wcy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksXG4gICAgfSlcbiAgICBhc3luYyBnZXRMb2dGaWxlSW5mbygpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRMb2dGaWxlSW5mb0ltcGwoKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3NlYXJjaF9wcm9qZWN0X2xvZ3MnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnU2VhcmNoIHByb2plY3QgbG9ncycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gU2VhcmNoIHRlbXAvbG9ncy9wcm9qZWN0LmxvZyBmb3Igc3RyaW5nL3JlZ2V4IGFuZCByZXR1cm4gbGluZSBjb250ZXh0LicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgcGF0dGVybjogei5zdHJpbmcoKS5kZXNjcmliZSgnU2VhcmNoIHN0cmluZyBvciByZWdleC4gSW52YWxpZCByZWdleCBpcyB0cmVhdGVkIGFzIGEgbGl0ZXJhbCBzdHJpbmcuJyksXG4gICAgICAgICAgICAgICAgICAgIG1heFJlc3VsdHM6IHoubnVtYmVyKCkubWluKDEpLm1heCgxMDApLmRlZmF1bHQoMjApLmRlc2NyaWJlKCdNYXhpbXVtIG1hdGNoZXMgdG8gcmV0dXJuLiBEZWZhdWx0IDIwLicpLFxuICAgICAgICAgICAgICAgICAgICBjb250ZXh0TGluZXM6IHoubnVtYmVyKCkubWluKDApLm1heCgxMCkuZGVmYXVsdCgyKS5kZXNjcmliZSgnQ29udGV4dCBsaW5lcyBiZWZvcmUvYWZ0ZXIgZWFjaCBtYXRjaC4gRGVmYXVsdCAyLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgc2VhcmNoUHJvamVjdExvZ3MoYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2VhcmNoUHJvamVjdExvZ3NJbXBsKGFyZ3MucGF0dGVybiwgYXJncy5tYXhSZXN1bHRzLCBhcmdzLmNvbnRleHRMaW5lcyk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICAgICAgICAgIG5hbWU6ICdzY3JlZW5zaG90JyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ0NhcHR1cmUgZWRpdG9yIHNjcmVlbnNob3QnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIENhcHR1cmUgdGhlIGZvY3VzZWQgQ29jb3MgRWRpdG9yIHdpbmRvdyAob3IgYSB3aW5kb3cgbWF0Y2hlZCBieSB0aXRsZSkgdG8gYSBQTkcuIFJldHVybnMgc2F2ZWQgZmlsZSBwYXRoLiBVc2UgdGhpcyBmb3IgQUkgdmlzdWFsIHZlcmlmaWNhdGlvbiBhZnRlciBzY2VuZS9VSSBjaGFuZ2VzLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgc2F2ZVBhdGg6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnQWJzb2x1dGUgZmlsZXN5c3RlbSBwYXRoIHRvIHNhdmUgdGhlIFBORy4gTXVzdCByZXNvbHZlIGluc2lkZSB0aGUgY29jb3MgcHJvamVjdCByb290IChjb250YWlubWVudCBjaGVjayB2aWEgcmVhbHBhdGgpLiBPbWl0IHRvIGF1dG8tbmFtZSBpbnRvIDxwcm9qZWN0Pi90ZW1wL21jcC1jYXB0dXJlcy9zY3JlZW5zaG90LTx0aW1lc3RhbXA+LnBuZy4nKSxcbiAgICAgICAgICAgICAgICAgICAgd2luZG93VGl0bGU6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnT3B0aW9uYWwgc3Vic3RyaW5nIG1hdGNoIG9uIHdpbmRvdyB0aXRsZSB0byBwaWNrIGEgc3BlY2lmaWMgRWxlY3Ryb24gd2luZG93LiBEZWZhdWx0OiBmb2N1c2VkIHdpbmRvdy4nKSxcbiAgICAgICAgICAgICAgICAgICAgaW5jbHVkZUJhc2U2NDogei5ib29sZWFuKCkuZGVmYXVsdChmYWxzZSkuZGVzY3JpYmUoJ0VtYmVkIFBORyBieXRlcyBhcyBiYXNlNjQgaW4gcmVzcG9uc2UgZGF0YSAobGFyZ2U7IGRlZmF1bHQgZmFsc2UpLiBXaGVuIGZhbHNlLCBvbmx5IHRoZSBzYXZlZCBmaWxlIHBhdGggaXMgcmV0dXJuZWQuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBzY3JlZW5zaG90KGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLnNjcmVlbnNob3RJbXBsKGFyZ3Muc2F2ZVBhdGgsIGFyZ3Mud2luZG93VGl0bGUsIGFyZ3MuaW5jbHVkZUJhc2U2NCk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICAgICAgICAgIG5hbWU6ICdjYXB0dXJlX3ByZXZpZXdfc2NyZWVuc2hvdCcsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdDYXB0dXJlIHByZXZpZXcgc2NyZWVuc2hvdCcsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gQ2FwdHVyZSB0aGUgY29jb3MgUHJldmlldy1pbi1FZGl0b3IgKFBJRSkgZ2FtZXZpZXcgdG8gYSBQTkcuIENvY29zIGhhcyBtdWx0aXBsZSBQSUUgcmVuZGVyIHRhcmdldHMgZGVwZW5kaW5nIG9uIHRoZSB1c2VyXFwncyBwcmV2aWV3IGNvbmZpZyAoUHJlZmVyZW5jZXMg4oaSIFByZXZpZXcg4oaSIE9wZW4gUHJldmlldyBXaXRoKTogXCJicm93c2VyXCIgb3BlbnMgYW4gZXh0ZXJuYWwgYnJvd3NlciAoTk9UIGNhcHR1cmFibGUgaGVyZSksIFwid2luZG93XCIgLyBcInNpbXVsYXRvclwiIG9wZW5zIGEgc2VwYXJhdGUgRWxlY3Ryb24gd2luZG93ICh0aXRsZSBjb250YWlucyBcIlByZXZpZXdcIiksIFwiZW1iZWRkZWRcIiByZW5kZXJzIHRoZSBnYW1ldmlldyBpbnNpZGUgdGhlIG1haW4gZWRpdG9yIHdpbmRvdy4gVGhlIGRlZmF1bHQgbW9kZT1cImF1dG9cIiB0cmllcyB0aGUgUHJldmlldy10aXRsZWQgd2luZG93IGZpcnN0IGFuZCBmYWxscyBiYWNrIHRvIGNhcHR1cmluZyB0aGUgbWFpbiBlZGl0b3Igd2luZG93IHdoZW4gbm8gUHJldmlldy10aXRsZWQgd2luZG93IGV4aXN0cyAoY292ZXJzIGVtYmVkZGVkIG1vZGUpLiBVc2UgbW9kZT1cIndpbmRvd1wiIHRvIGZvcmNlIHRoZSBzZXBhcmF0ZS13aW5kb3cgc3RyYXRlZ3kgb3IgbW9kZT1cImVtYmVkZGVkXCIgdG8gc2tpcCB0aGUgd2luZG93IHByb2JlLiBQYWlyIHdpdGggZGVidWdfZ2V0X3ByZXZpZXdfbW9kZSB0byByZWFkIHRoZSBjb2NvcyBjb25maWcgYW5kIHJvdXRlIGRldGVybWluaXN0aWNhbGx5LiBGb3IgcnVudGltZSBnYW1lLWNhbnZhcyBwaXhlbC1sZXZlbCBjYXB0dXJlIChjYW1lcmEgUmVuZGVyVGV4dHVyZSksIHVzZSBkZWJ1Z19nYW1lX2NvbW1hbmQodHlwZT1cInNjcmVlbnNob3RcIikgaW5zdGVhZC4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHNhdmVQYXRoOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0Fic29sdXRlIGZpbGVzeXN0ZW0gcGF0aCB0byBzYXZlIHRoZSBQTkcuIE11c3QgcmVzb2x2ZSBpbnNpZGUgdGhlIGNvY29zIHByb2plY3Qgcm9vdCAoY29udGFpbm1lbnQgY2hlY2sgdmlhIHJlYWxwYXRoKS4gT21pdCB0byBhdXRvLW5hbWUgaW50byA8cHJvamVjdD4vdGVtcC9tY3AtY2FwdHVyZXMvcHJldmlldy08dGltZXN0YW1wPi5wbmcuJyksXG4gICAgICAgICAgICAgICAgICAgIG1vZGU6IHouZW51bShbJ2F1dG8nLCAnd2luZG93JywgJ2VtYmVkZGVkJ10pLmRlZmF1bHQoJ2F1dG8nKS5kZXNjcmliZSgnQ2FwdHVyZSB0YXJnZXQuIFwiYXV0b1wiIChkZWZhdWx0KSB0cmllcyBQcmV2aWV3LXRpdGxlZCB3aW5kb3cgdGhlbiBmYWxscyBiYWNrIHRvIHRoZSBtYWluIGVkaXRvciB3aW5kb3cuIFwid2luZG93XCIgb25seSBtYXRjaGVzIFByZXZpZXctdGl0bGVkIHdpbmRvd3MgKGZhaWxzIGlmIG5vbmUpLiBcImVtYmVkZGVkXCIgY2FwdHVyZXMgdGhlIG1haW4gZWRpdG9yIHdpbmRvdyBkaXJlY3RseSAoc2tpcCBQcmV2aWV3LXdpbmRvdyBwcm9iZSkuJyksXG4gICAgICAgICAgICAgICAgICAgIHdpbmRvd1RpdGxlOiB6LnN0cmluZygpLmRlZmF1bHQoJ1ByZXZpZXcnKS5kZXNjcmliZSgnU3Vic3RyaW5nIG1hdGNoZWQgYWdhaW5zdCB3aW5kb3cgdGl0bGVzIGluIHdpbmRvdy9hdXRvIG1vZGVzIChkZWZhdWx0IFwiUHJldmlld1wiIGZvciBQSUUpLiBJZ25vcmVkIGluIGVtYmVkZGVkIG1vZGUuJyksXG4gICAgICAgICAgICAgICAgICAgIGluY2x1ZGVCYXNlNjQ6IHouYm9vbGVhbigpLmRlZmF1bHQoZmFsc2UpLmRlc2NyaWJlKCdFbWJlZCBQTkcgYnl0ZXMgYXMgYmFzZTY0IGluIHJlc3BvbnNlIGRhdGEgKGxhcmdlOyBkZWZhdWx0IGZhbHNlKS4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIGNhcHR1cmVQcmV2aWV3U2NyZWVuc2hvdChhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5jYXB0dXJlUHJldmlld1NjcmVlbnNob3RJbXBsKGFyZ3Muc2F2ZVBhdGgsIGFyZ3MubW9kZSA/PyAnYXV0bycsIGFyZ3Mud2luZG93VGl0bGUsIGFyZ3MuaW5jbHVkZUJhc2U2NCk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICAgICAgICAgIG5hbWU6ICdnZXRfcHJldmlld19tb2RlJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1JlYWQgcHJldmlldyBtb2RlJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBSZWFkIHRoZSBjb2NvcyBwcmV2aWV3IGNvbmZpZ3VyYXRpb24uIFVzZXMgRWRpdG9yLk1lc3NhZ2UgcHJlZmVyZW5jZXMvcXVlcnktY29uZmlnIHNvIEFJIGNhbiByb3V0ZSBkZWJ1Z19jYXB0dXJlX3ByZXZpZXdfc2NyZWVuc2hvdCB0byB0aGUgY29ycmVjdCBtb2RlLiBSZXR1cm5zIHsgaW50ZXJwcmV0ZWQ6IFwiYnJvd3NlclwiIHwgXCJ3aW5kb3dcIiB8IFwic2ltdWxhdG9yXCIgfCBcImVtYmVkZGVkXCIgfCBcInVua25vd25cIiwgcmF3OiA8ZnVsbCBwcmV2aWV3IGNvbmZpZyBkdW1wPiB9LiBVc2UgYmVmb3JlIGNhcHR1cmU6IGlmIGludGVycHJldGVkPVwiZW1iZWRkZWRcIiwgY2FsbCBjYXB0dXJlX3ByZXZpZXdfc2NyZWVuc2hvdCB3aXRoIG1vZGU9XCJlbWJlZGRlZFwiIG9yIHJlbHkgb24gbW9kZT1cImF1dG9cIiBmYWxsYmFjay4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksXG4gICAgfSlcbiAgICBhc3luYyBnZXRQcmV2aWV3TW9kZSgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRQcmV2aWV3TW9kZUltcGwoKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3NldF9wcmV2aWV3X21vZGUnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnU2V0IHByZXZpZXcgbW9kZScsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICfinYwgTk9UIFNVUFBPUlRFRCBvbiBjb2NvcyAzLjguNysgKGxhbmRtaW5lICMxNykuIFByb2dyYW1tYXRpYyBwcmV2aWV3LW1vZGUgc3dpdGNoaW5nIGlzIGltcG9zc2libGUgZnJvbSBhIHRoaXJkLXBhcnR5IGV4dGVuc2lvbiBvbiBjb2NvcyAzLjguNzogYHByZWZlcmVuY2VzL3NldC1jb25maWdgIGFnYWluc3QgYHByZXZpZXcuY3VycmVudC5wbGF0Zm9ybWAgcmV0dXJucyB0cnV0aHkgYnV0IG5ldmVyIHBlcnNpc3RzLCBhbmQgKipub25lIG9mIDYgc3VydmV5ZWQgcmVmZXJlbmNlIHByb2plY3RzIChoYXJhZHkgLyBTcGF5ZG8gLyBSb21hUm9nb3YgLyBjb2Nvcy1jb2RlLW1vZGUgLyBGdW5wbGF5QUkgLyBjb2Nvcy1jbGkpIHNoaXAgYSB3b3JraW5nIGFsdGVybmF0aXZlKiogKHYyLjEwIGNyb3NzLXJlcG8gcmVmcmVzaCwgMjAyNi0wNS0wMikuIFRoZSBmaWVsZCBpcyBlZmZlY3RpdmVseSByZWFkLW9ubHkg4oCUIG9ubHkgdGhlIGNvY29zIHByZXZpZXcgZHJvcGRvd24gd3JpdGVzIGl0LiAqKlVzZSB0aGUgY29jb3MgcHJldmlldyBkcm9wZG93biBpbiB0aGUgZWRpdG9yIHRvb2xiYXIgdG8gc3dpdGNoIG1vZGVzKiouIERlZmF1bHQgYmVoYXZpb3IgaXMgaGFyZC1mYWlsOyBwYXNzIGF0dGVtcHRBbnl3YXk9dHJ1ZSBPTkxZIGZvciBkaWFnbm9zdGljIHByb2JpbmcgKHJldHVybnMgNC1zdHJhdGVneSBhdHRlbXB0IGxvZyBzbyB5b3UgY2FuIHZlcmlmeSBhZ2FpbnN0IGEgZnV0dXJlIGNvY29zIGJ1aWxkIHdoZXRoZXIgYW55IHNoYXBlIG5vdyB3b3JrcykuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBtb2RlOiB6LmVudW0oWydicm93c2VyJywgJ2dhbWVWaWV3JywgJ3NpbXVsYXRvciddKS5kZXNjcmliZSgnVGFyZ2V0IHByZXZpZXcgcGxhdGZvcm0uIFwiYnJvd3NlclwiIG9wZW5zIHByZXZpZXcgaW4gdGhlIHVzZXIgZGVmYXVsdCBicm93c2VyLiBcImdhbWVWaWV3XCIgZW1iZWRzIHRoZSBnYW1ldmlldyBpbiB0aGUgbWFpbiBlZGl0b3IgKGluLWVkaXRvciBwcmV2aWV3KS4gXCJzaW11bGF0b3JcIiBsYXVuY2hlcyB0aGUgY29jb3Mgc2ltdWxhdG9yLiBNYXBzIGRpcmVjdGx5IHRvIHRoZSBjb2NvcyBwcmV2aWV3LmN1cnJlbnQucGxhdGZvcm0gdmFsdWUuJyksXG4gICAgICAgICAgICAgICAgICAgIGF0dGVtcHRBbnl3YXk6IHouYm9vbGVhbigpLmRlZmF1bHQoZmFsc2UpLmRlc2NyaWJlKCdEaWFnbm9zdGljIG9wdC1pbi4gRGVmYXVsdCBmYWxzZSByZXR1cm5zIE5PVF9TVVBQT1JURUQgd2l0aCB0aGUgY29jb3MgVUkgcmVkaXJlY3QuIFNldCB0cnVlIE9OTFkgdG8gcmUtcHJvYmUgdGhlIDQgc2V0LWNvbmZpZyBzaGFwZXMgYWdhaW5zdCBhIG5ldyBjb2NvcyBidWlsZCDigJQgdXNlZnVsIHdoZW4gdmFsaWRhdGluZyB3aGV0aGVyIGEgZnV0dXJlIGNvY29zIHZlcnNpb24gZXhwb3NlcyBhIHdyaXRlIHBhdGguIFJldHVybnMgZGF0YS5hdHRlbXB0cyB3aXRoIGV2ZXJ5IHNoYXBlIHRyaWVkIGFuZCBpdHMgcmVhZC1iYWNrIG9ic2VydmF0aW9uLiBEb2VzIE5PVCBmcmVlemUgdGhlIGVkaXRvciAodGhlIGNhbGwgbWVyZWx5IG5vLW9wcykuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBzZXRQcmV2aWV3TW9kZShhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5zZXRQcmV2aWV3TW9kZUltcGwoYXJncy5tb2RlLCBhcmdzLmF0dGVtcHRBbnl3YXkgPz8gZmFsc2UpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnYmF0Y2hfc2NyZWVuc2hvdCcsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdDYXB0dXJlIGJhdGNoIHNjcmVlbnNob3RzJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBDYXB0dXJlIG11bHRpcGxlIFBOR3Mgb2YgdGhlIGVkaXRvciB3aW5kb3cgd2l0aCBvcHRpb25hbCBkZWxheXMgYmV0d2VlbiBzaG90cy4gVXNlZnVsIGZvciBhbmltYXRpbmcgcHJldmlldyB2ZXJpZmljYXRpb24gb3IgY2FwdHVyaW5nIHRyYW5zaXRpb25zLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgc2F2ZVBhdGhQcmVmaXg6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnUGF0aCBwcmVmaXggZm9yIGJhdGNoIG91dHB1dCBmaWxlcy4gRmlsZXMgd3JpdHRlbiBhcyA8cHJlZml4Pi08aW5kZXg+LnBuZy4gTXVzdCByZXNvbHZlIGluc2lkZSB0aGUgY29jb3MgcHJvamVjdCByb290IChjb250YWlubWVudCBjaGVjayB2aWEgcmVhbHBhdGgpLiBEZWZhdWx0OiA8cHJvamVjdD4vdGVtcC9tY3AtY2FwdHVyZXMvYmF0Y2gtPHRpbWVzdGFtcD4uJyksXG4gICAgICAgICAgICAgICAgICAgIGRlbGF5c01zOiB6LmFycmF5KHoubnVtYmVyKCkubWluKDApLm1heCgxMDAwMCkpLm1heCgyMCkuZGVmYXVsdChbMF0pLmRlc2NyaWJlKCdEZWxheSAobXMpIGJlZm9yZSBlYWNoIGNhcHR1cmUuIExlbmd0aCBkZXRlcm1pbmVzIGhvdyBtYW55IHNob3RzIHRha2VuIChjYXBwZWQgYXQgMjAgdG8gcHJldmVudCBkaXNrIGZpbGwgLyBlZGl0b3IgZnJlZXplKS4gRGVmYXVsdCBbMF0gPSBzaW5nbGUgc2hvdC4nKSxcbiAgICAgICAgICAgICAgICAgICAgd2luZG93VGl0bGU6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnT3B0aW9uYWwgc3Vic3RyaW5nIG1hdGNoIG9uIHdpbmRvdyB0aXRsZS4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIGJhdGNoU2NyZWVuc2hvdChhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5iYXRjaFNjcmVlbnNob3RJbXBsKGFyZ3Muc2F2ZVBhdGhQcmVmaXgsIGFyZ3MuZGVsYXlzTXMsIGFyZ3Mud2luZG93VGl0bGUpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnd2FpdF9jb21waWxlJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1dhaXQgZm9yIGNvbXBpbGUnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIEJsb2NrIHVudGlsIGNvY29zIGZpbmlzaGVzIGl0cyBUeXBlU2NyaXB0IGNvbXBpbGUgcGFzcy4gVGFpbHMgdGVtcC9wcm9ncmFtbWluZy9wYWNrZXItZHJpdmVyL2xvZ3MvZGVidWcubG9nIGZvciB0aGUgXCJUYXJnZXQoZWRpdG9yKSBlbmRzXCIgbWFya2VyLiBSZXR1cm5zIGltbWVkaWF0ZWx5IHdpdGggY29tcGlsZWQ9ZmFsc2UgaWYgbm8gY29tcGlsZSB3YXMgdHJpZ2dlcmVkIChjbGVhbiBwcm9qZWN0IC8gbm8gY2hhbmdlcyBkZXRlY3RlZCkuIFBhaXIgd2l0aCBydW5fc2NyaXB0X2RpYWdub3N0aWNzIGZvciBhbiBcImVkaXQgLnRzIOKGkiB3YWl0IOKGkiBmZXRjaCBlcnJvcnNcIiB3b3JrZmxvdy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHRpbWVvdXRNczogei5udW1iZXIoKS5taW4oNTAwKS5tYXgoMTIwMDAwKS5kZWZhdWx0KDE1MDAwKS5kZXNjcmliZSgnTWF4IHdhaXQgdGltZSBpbiBtcyBiZWZvcmUgZ2l2aW5nIHVwLiBEZWZhdWx0IDE1MDAwLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgd2FpdENvbXBpbGUoYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMud2FpdENvbXBpbGVJbXBsKGFyZ3MudGltZW91dE1zKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3J1bl9zY3JpcHRfZGlhZ25vc3RpY3MnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnUnVuIHNjcmlwdCBkaWFnbm9zdGljcycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gUnVuIGB0c2MgLS1ub0VtaXRgIGFnYWluc3QgdGhlIHByb2plY3QgdHNjb25maWcgYW5kIHJldHVybiBwYXJzZWQgZGlhZ25vc3RpY3MuIFVzZWQgYWZ0ZXIgd2FpdF9jb21waWxlIHRvIHN1cmZhY2UgY29tcGlsYXRpb24gZXJyb3JzIGFzIHN0cnVjdHVyZWQge2ZpbGUsIGxpbmUsIGNvbHVtbiwgY29kZSwgbWVzc2FnZX0gZW50cmllcy4gUmVzb2x2ZXMgdHNjIGJpbmFyeSBmcm9tIHByb2plY3Qgbm9kZV9tb2R1bGVzIOKGkiBlZGl0b3IgYnVuZGxlZCBlbmdpbmUg4oaSIG5weCBmYWxsYmFjay4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHRzY29uZmlnUGF0aDogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdPcHRpb25hbCBvdmVycmlkZSAoYWJzb2x1dGUgb3IgcHJvamVjdC1yZWxhdGl2ZSkuIERlZmF1bHQ6IHRzY29uZmlnLmpzb24gb3IgdGVtcC90c2NvbmZpZy5jb2Nvcy5qc29uLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgcnVuU2NyaXB0RGlhZ25vc3RpY3MoYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMucnVuU2NyaXB0RGlhZ25vc3RpY3NJbXBsKGFyZ3MudHNjb25maWdQYXRoKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3ByZXZpZXdfdXJsJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1Jlc29sdmUgcHJldmlldyBVUkwnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFJlc29sdmUgdGhlIGNvY29zIGJyb3dzZXItcHJldmlldyBVUkwuIFVzZXMgdGhlIGRvY3VtZW50ZWQgRWRpdG9yLk1lc3NhZ2UgY2hhbm5lbCBwcmV2aWV3L3F1ZXJ5LXByZXZpZXctdXJsLiBXaXRoIGFjdGlvbj1cIm9wZW5cIiwgYWxzbyBsYXVuY2hlcyB0aGUgVVJMIGluIHRoZSB1c2VyIGRlZmF1bHQgYnJvd3NlciB2aWEgZWxlY3Ryb24uc2hlbGwub3BlbkV4dGVybmFsIOKAlCB1c2VmdWwgYXMgYSBzZXR1cCBzdGVwIGJlZm9yZSBkZWJ1Z19nYW1lX2NvbW1hbmQsIHNpbmNlIHRoZSBHYW1lRGVidWdDbGllbnQgcnVubmluZyBpbnNpZGUgdGhlIHByZXZpZXcgbXVzdCBiZSByZWFjaGFibGUuIEVkaXRvci1zaWRlIFByZXZpZXctaW4tRWRpdG9yIHBsYXkvc3RvcCBpcyBOT1QgZXhwb3NlZCBieSB0aGUgcHVibGljIG1lc3NhZ2UgQVBJIGFuZCBpcyBpbnRlbnRpb25hbGx5IG5vdCBpbXBsZW1lbnRlZCBoZXJlOyB1c2UgdGhlIGNvY29zIGVkaXRvciB0b29sYmFyIG1hbnVhbGx5IGZvciBQSUUuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBhY3Rpb246IHouZW51bShbJ3F1ZXJ5JywgJ29wZW4nXSkuZGVmYXVsdCgncXVlcnknKS5kZXNjcmliZSgnXCJxdWVyeVwiIHJldHVybnMgdGhlIFVSTDsgXCJvcGVuXCIgcmV0dXJucyB0aGUgVVJMIEFORCBvcGVucyBpdCBpbiB0aGUgdXNlciBkZWZhdWx0IGJyb3dzZXIgdmlhIGVsZWN0cm9uLnNoZWxsLm9wZW5FeHRlcm5hbC4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIHByZXZpZXdVcmwoYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMucHJldmlld1VybEltcGwoYXJncy5hY3Rpb24pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgICAgICAgICBuYW1lOiAncXVlcnlfZGV2aWNlcycsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdMaXN0IHByZXZpZXcgZGV2aWNlcycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gTGlzdCBwcmV2aWV3IGRldmljZXMgY29uZmlndXJlZCBpbiB0aGUgY29jb3MgcHJvamVjdC4gQmFja2VkIGJ5IEVkaXRvci5NZXNzYWdlIGNoYW5uZWwgZGV2aWNlL3F1ZXJ5LiBSZXR1cm5zIGFuIGFycmF5IG9mIHtuYW1lLCB3aWR0aCwgaGVpZ2h0LCByYXRpb30gZW50cmllcyDigJQgdXNlZnVsIGZvciBiYXRjaC1zY3JlZW5zaG90IHBpcGVsaW5lcyB0aGF0IHRhcmdldCBtdWx0aXBsZSByZXNvbHV0aW9ucy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksXG4gICAgfSlcbiAgICBhc3luYyBxdWVyeURldmljZXMoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMucXVlcnlEZXZpY2VzSW1wbCgpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnZ2FtZV9jb21tYW5kJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1NlbmQgZ2FtZSBjb21tYW5kJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBTZW5kIGEgcnVudGltZSBjb21tYW5kIHRvIGEgY29ubmVjdGVkIEdhbWVEZWJ1Z0NsaWVudC4gV29ya3MgaW5zaWRlIGEgY29jb3MgcHJldmlldy9idWlsZCAoYnJvd3NlciwgUHJldmlldy1pbi1FZGl0b3IsIG9yIGFueSBkZXZpY2UgdGhhdCBmZXRjaGVzIC9nYW1lL2NvbW1hbmQpLiBCdWlsdC1pbiBjb21tYW5kIHR5cGVzOiBcInNjcmVlbnNob3RcIiAoY2FwdHVyZSBnYW1lIGNhbnZhcyB0byBQTkcsIHJldHVybnMgc2F2ZWQgZmlsZSBwYXRoKSwgXCJjbGlja1wiIChlbWl0IEJ1dHRvbi5DTElDSyBvbiBhIG5vZGUgYnkgbmFtZSksIFwiaW5zcGVjdFwiIChkdW1wIHJ1bnRpbWUgbm9kZSBpbmZvOiBwb3NpdGlvbi9zY2FsZS9yb3RhdGlvbi9hY3RpdmUvY29tcG9uZW50cyBieSBuYW1lOyB3aGVuIHByZXNlbnQgYWxzbyByZXR1cm5zIFVJVHJhbnNmb3JtLmNvbnRlbnRTaXplL2FuY2hvclBvaW50LCBXaWRnZXQgYWxpZ25tZW50IGZsYWdzL29mZnNldHMsIGFuZCBMYXlvdXQgdHlwZS9zcGFjaW5nL3BhZGRpbmcpLCBcInN0YXRlXCIgKGR1bXAgZ2xvYmFsIGdhbWUgc3RhdGUgZnJvbSB0aGUgcnVubmluZyBnYW1lIGNsaWVudCksIGFuZCBcIm5hdmlnYXRlXCIgKHN3aXRjaCBzY2VuZS9wYWdlIGJ5IG5hbWUgdGhyb3VnaCB0aGUgZ2FtZSBjbGllbnRcXCdzIHJvdXRlcikuIEN1c3RvbSBjb21tYW5kIHR5cGVzIGFyZSBmb3J3YXJkZWQgdG8gdGhlIGNsaWVudFxcJ3MgY3VzdG9tQ29tbWFuZHMgbWFwLiBSZXF1aXJlcyB0aGUgR2FtZURlYnVnQ2xpZW50IHRlbXBsYXRlIChjbGllbnQvY29jb3MtbWNwLWNsaWVudC50cykgd2lyZWQgaW50byB0aGUgcnVubmluZyBnYW1lOyB3aXRob3V0IGl0IHRoZSBjYWxsIHRpbWVzIG91dC4gQ2hlY2sgR0VUIC9nYW1lL3N0YXR1cyB0byB2ZXJpZnkgY2xpZW50IGxpdmVuZXNzIGZpcnN0LicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogei5zdHJpbmcoKS5taW4oMSkuZGVzY3JpYmUoJ0NvbW1hbmQgdHlwZS4gQnVpbHQtaW5zOiBzY3JlZW5zaG90LCBjbGljaywgaW5zcGVjdCwgc3RhdGUsIG5hdmlnYXRlLiBDdXN0b21zOiBhbnkgc3RyaW5nIHRoZSBHYW1lRGVidWdDbGllbnQgcmVnaXN0ZXJlZCBpbiBjdXN0b21Db21tYW5kcy4nKSxcbiAgICAgICAgICAgICAgICAgICAgYXJnczogei5hbnkoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdDb21tYW5kLXNwZWNpZmljIGFyZ3VtZW50cy4gRm9yIFwiY2xpY2tcIi9cImluc3BlY3RcIjoge25hbWU6IHN0cmluZ30gbm9kZSBuYW1lLiBGb3IgXCJuYXZpZ2F0ZVwiOiB7cGFnZU5hbWU6IHN0cmluZ30gb3Ige3BhZ2U6IHN0cmluZ30uIEZvciBcInN0YXRlXCIvXCJzY3JlZW5zaG90XCI6IHt9IChubyBhcmdzKS4nKSxcbiAgICAgICAgICAgICAgICAgICAgdGltZW91dE1zOiB6Lm51bWJlcigpLm1pbig1MDApLm1heCg2MDAwMCkuZGVmYXVsdCgxMDAwMCkuZGVzY3JpYmUoJ01heCB3YWl0IGZvciBjbGllbnQgcmVzcG9uc2UuIERlZmF1bHQgMTAwMDBtcy4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIGdhbWVDb21tYW5kKGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdhbWVDb21tYW5kSW1wbChhcmdzLnR5cGUsIGFyZ3MuYXJncywgYXJncy50aW1lb3V0TXMpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgICAgICAgICBuYW1lOiAncmVjb3JkX3N0YXJ0JyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1N0YXJ0IGdhbWUgcmVjb3JkaW5nJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBTdGFydCByZWNvcmRpbmcgdGhlIHJ1bm5pbmcgZ2FtZSBjYW52YXMgdmlhIHRoZSBHYW1lRGVidWdDbGllbnQgKGJyb3dzZXIvUElFIHByZXZpZXcgb25seSkuIFdyYXBzIGRlYnVnX2dhbWVfY29tbWFuZCh0eXBlPVwicmVjb3JkX3N0YXJ0XCIpIGZvciBBSSBlcmdvbm9taWNzLiBSZXR1cm5zIGltbWVkaWF0ZWx5IHdpdGggeyByZWNvcmRpbmc6IHRydWUsIG1pbWVUeXBlIH07IHRoZSByZWNvcmRpbmcgY29udGludWVzIHVudGlsIGRlYnVnX3JlY29yZF9zdG9wIGlzIGNhbGxlZC4gQnJvd3Nlci1vbmx5IOKAlCBmYWlscyBvbiBuYXRpdmUgY29jb3MgYnVpbGRzIChNZWRpYVJlY29yZGVyIEFQSSByZXF1aXJlcyBhIERPTSBjYW52YXMgKyBjYXB0dXJlU3RyZWFtKS4gU2luZ2xlLWZsaWdodCBwZXIgY2xpZW50OiBhIHNlY29uZCByZWNvcmRfc3RhcnQgd2hpbGUgYSByZWNvcmRpbmcgaXMgaW4gcHJvZ3Jlc3MgcmV0dXJucyBzdWNjZXNzOmZhbHNlLiBQYWlyIHdpdGggZGVidWdfZ2FtZV9jbGllbnRfc3RhdHVzIHRvIGNvbmZpcm0gYSBjbGllbnQgaXMgY29ubmVjdGVkIGJlZm9yZSBjYWxsaW5nLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgbWltZVR5cGU6IHouZW51bShbJ3ZpZGVvL3dlYm0nLCAndmlkZW8vbXA0J10pLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0NvbnRhaW5lci9jb2RlYyBoaW50IGZvciBNZWRpYVJlY29yZGVyLiBEZWZhdWx0OiBicm93c2VyIGF1dG8tcGljayAod2VibSBwcmVmZXJyZWQgd2hlcmUgc3VwcG9ydGVkLCBmYWxscyBiYWNrIHRvIG1wNCkuIFNvbWUgYnJvd3NlcnMgcmVqZWN0IHVuc3VwcG9ydGVkIHR5cGVzIOKAlCByZWNvcmRfc3RhcnQgc3VyZmFjZXMgYSBjbGVhciBlcnJvciBpbiB0aGF0IGNhc2UuJyksXG4gICAgICAgICAgICAgICAgICAgIHZpZGVvQml0c1BlclNlY29uZDogei5udW1iZXIoKS5taW4oMTAwXzAwMCkubWF4KDIwXzAwMF8wMDApLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ09wdGlvbmFsIE1lZGlhUmVjb3JkZXIgYml0cmF0ZSBoaW50IGluIGJpdHMvc2VjLiBMb3dlciDihpIgc21hbGxlciBmaWxlcyBidXQgbG93ZXIgcXVhbGl0eS4gQnJvd3NlciBkZWZhdWx0IGlmIG9taXR0ZWQuJyksXG4gICAgICAgICAgICAgICAgICAgIHRpbWVvdXRNczogei5udW1iZXIoKS5taW4oNTAwKS5tYXgoMzAwMDApLmRlZmF1bHQoNTAwMCkuZGVzY3JpYmUoJ01heCB3YWl0IGZvciB0aGUgR2FtZURlYnVnQ2xpZW50IHRvIGFja25vd2xlZGdlIHJlY29yZF9zdGFydC4gUmVjb3JkaW5nIGl0c2VsZiBydW5zIHVudGlsIGRlYnVnX3JlY29yZF9zdG9wLiBEZWZhdWx0IDUwMDBtcy4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIHJlY29yZFN0YXJ0KGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLnJlY29yZFN0YXJ0SW1wbChhcmdzLm1pbWVUeXBlLCBhcmdzLnZpZGVvQml0c1BlclNlY29uZCwgYXJncy50aW1lb3V0TXMgPz8gNTAwMCk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICAgICAgICAgIG5hbWU6ICdyZWNvcmRfc3RvcCcsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdTdG9wIGdhbWUgcmVjb3JkaW5nJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBTdG9wIHRoZSBpbi1wcm9ncmVzcyBnYW1lIGNhbnZhcyByZWNvcmRpbmcgYW5kIHBlcnNpc3QgaXQgdW5kZXIgPHByb2plY3Q+L3RlbXAvbWNwLWNhcHR1cmVzLiBXcmFwcyBkZWJ1Z19nYW1lX2NvbW1hbmQodHlwZT1cInJlY29yZF9zdG9wXCIpLiBSZXR1cm5zIHsgZmlsZVBhdGgsIHNpemUsIG1pbWVUeXBlLCBkdXJhdGlvbk1zIH0uIENhbGxpbmcgd2l0aG91dCBhIHByaW9yIHJlY29yZF9zdGFydCByZXR1cm5zIHN1Y2Nlc3M6ZmFsc2UuIFRoZSBob3N0IGFwcGxpZXMgdGhlIHNhbWUgcmVhbHBhdGggY29udGFpbm1lbnQgZ3VhcmQgKyA2NE1CIGJ5dGUgY2FwIChzeW5jZWQgd2l0aCB0aGUgcmVxdWVzdCBib2R5IGNhcCBpbiBtY3Atc2VydmVyLXNkay50czsgdjIuOS42IHJhaXNlZCBib3RoIGZyb20gMzIgdG8gNjRNQik7IHJhaXNlIHZpZGVvQml0c1BlclNlY29uZCAvIHJlZHVjZSByZWNvcmRpbmcgZHVyYXRpb24gb24gY2FwIHJlamVjdGlvbi4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHRpbWVvdXRNczogei5udW1iZXIoKS5taW4oMTAwMCkubWF4KDEyMDAwMCkuZGVmYXVsdCgzMDAwMCkuZGVzY3JpYmUoJ01heCB3YWl0IGZvciB0aGUgY2xpZW50IHRvIGFzc2VtYmxlICsgcmV0dXJuIHRoZSByZWNvcmRpbmcgYmxvYi4gUmVjb3JkaW5ncyBvZiBzZXZlcmFsIHNlY29uZHMgYXQgaGlnaCBiaXRyYXRlIG1heSBuZWVkIGxvbmdlciB0aGFuIHRoZSBkZWZhdWx0IDMwcyDigJQgcmFpc2Ugb24gbG9uZyByZWNvcmRpbmdzLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgcmVjb3JkU3RvcChhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5yZWNvcmRTdG9wSW1wbChhcmdzLnRpbWVvdXRNcyA/PyAzMDAwMCk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICAgICAgICAgIG5hbWU6ICdnYW1lX2NsaWVudF9zdGF0dXMnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnUmVhZCBnYW1lIGNsaWVudCBzdGF0dXMnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFJlYWQgR2FtZURlYnVnQ2xpZW50IGNvbm5lY3Rpb24gc3RhdHVzLiBJbmNsdWRlcyBjb25uZWN0ZWQgKHBvbGxlZCB3aXRoaW4gMnMpLCBsYXN0IHBvbGwgdGltZXN0YW1wLCBhbmQgd2hldGhlciBhIGNvbW1hbmQgaXMgcXVldWVkLiBVc2UgYmVmb3JlIGRlYnVnX2dhbWVfY29tbWFuZCB0byBjb25maXJtIHRoZSBjbGllbnQgaXMgcmVhY2hhYmxlLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSxcbiAgICB9KVxuICAgIGFzeW5jIGdhbWVDbGllbnRTdGF0dXMoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2FtZUNsaWVudFN0YXR1c0ltcGwoKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2NoZWNrX2VkaXRvcl9oZWFsdGgnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnQ2hlY2sgZWRpdG9yIGhlYWx0aCcsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gUHJvYmUgd2hldGhlciB0aGUgY29jb3MgZWRpdG9yIHNjZW5lLXNjcmlwdCByZW5kZXJlciBpcyByZXNwb25zaXZlLiBVc2VmdWwgYWZ0ZXIgZGVidWdfcHJldmlld19jb250cm9sKHN0YXJ0KSDigJQgbGFuZG1pbmUgIzE2IGRvY3VtZW50cyB0aGF0IGNvY29zIDMuOC43IHNvbWV0aW1lcyBmcmVlemVzIHRoZSBzY2VuZS1zY3JpcHQgcmVuZGVyZXIgKHNwaW5uaW5nIGluZGljYXRvciwgQ3RybCtSIHJlcXVpcmVkKS4gU3RyYXRlZ3kgKHYyLjkuNik6IHRocmVlIHByb2JlcyDigJQgKDEpIGhvc3Q6IGRldmljZS9xdWVyeSAobWFpbiBwcm9jZXNzLCBhbHdheXMgcmVzcG9uc2l2ZSBldmVuIHdoZW4gc2NlbmUtc2NyaXB0IGlzIHdlZGdlZCk7ICgyKSBzY2VuZS9xdWVyeS1pcy1yZWFkeSB0eXBlZCBjaGFubmVsIOKAlCBkaXJlY3QgSVBDIGludG8gdGhlIHNjZW5lIG1vZHVsZSwgaGFuZ3Mgd2hlbiBzY2VuZSByZW5kZXJlciBpcyBmcm96ZW47ICgzKSBzY2VuZS9xdWVyeS1ub2RlLXRyZWUgdHlwZWQgY2hhbm5lbCDigJQgcmV0dXJucyB0aGUgZnVsbCBzY2VuZSB0cmVlLCBmb3JjZXMgYW4gYWN0dWFsIHNjZW5lLWdyYXBoIHdhbGsgdGhyb3VnaCB0aGUgd2VkZ2VkIGNvZGUgcGF0aC4gRWFjaCBwcm9iZSBoYXMgaXRzIG93biB0aW1lb3V0IHJhY2UgKGRlZmF1bHQgMTUwMG1zIGVhY2gpLiBTY2VuZSBkZWNsYXJlZCBhbGl2ZSBvbmx5IHdoZW4gQk9USCAoMikgcmV0dXJucyB0cnVlIEFORCAoMykgcmV0dXJucyBhIG5vbi1udWxsIHRyZWUgd2l0aGluIHRoZSB0aW1lb3V0LiBSZXR1cm5zIHsgaG9zdEFsaXZlLCBzY2VuZUFsaXZlLCBzY2VuZUxhdGVuY3lNcywgaG9zdEVycm9yLCBzY2VuZUVycm9yLCB0b3RhbFByb2JlTXMgfS4gQUkgd29ya2Zsb3c6IGNhbGwgYWZ0ZXIgcHJldmlld19jb250cm9sKHN0YXJ0KTsgaWYgc2NlbmVBbGl2ZT1mYWxzZSwgc3VyZmFjZSBcImNvY29zIGVkaXRvciBsaWtlbHkgZnJvemVuIOKAlCBwcmVzcyBDdHJsK1JcIiBpbnN0ZWFkIG9mIGlzc3VpbmcgbW9yZSBzY2VuZS1ib3VuZCBjYWxscy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHNjZW5lVGltZW91dE1zOiB6Lm51bWJlcigpLm1pbigyMDApLm1heCgxMDAwMCkuZGVmYXVsdCgxNTAwKS5kZXNjcmliZSgnVGltZW91dCBmb3IgdGhlIHNjZW5lLXNjcmlwdCBwcm9iZSBpbiBtcy4gQmVsb3cgdGhpcyBzY2VuZSBpcyBjb25zaWRlcmVkIGZyb3plbi4gRGVmYXVsdCAxNTAwbXMuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBjaGVja0VkaXRvckhlYWx0aChhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5jaGVja0VkaXRvckhlYWx0aEltcGwoYXJncy5zY2VuZVRpbWVvdXRNcyA/PyAxNTAwKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3ByZXZpZXdfY29udHJvbCcsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdDb250cm9sIHByZXZpZXcgcGxheWJhY2snLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAn4pqgIFBBUktFRCDigJQgc3RhcnQgRlJFRVpFUyBjb2NvcyAzLjguNyAobGFuZG1pbmUgIzE2KS4gUHJvZ3JhbW1hdGljYWxseSBzdGFydCBvciBzdG9wIFByZXZpZXctaW4tRWRpdG9yIChQSUUpIHBsYXkgbW9kZS4gV3JhcHMgdGhlIHR5cGVkIGNjZS5TY2VuZUZhY2FkZU1hbmFnZXIuY2hhbmdlUHJldmlld1BsYXlTdGF0ZSBtZXRob2QuICoqc3RhcnQgaGl0cyBhIGNvY29zIDMuOC43IHNvZnRSZWxvYWRTY2VuZSByYWNlKiogdGhhdCByZXR1cm5zIHN1Y2Nlc3MgYnV0IGZyZWV6ZXMgdGhlIGVkaXRvciAoc3Bpbm5pbmcgaW5kaWNhdG9yLCBDdHJsK1IgcmVxdWlyZWQgdG8gcmVjb3ZlcikuIFZlcmlmaWVkIGluIGJvdGggZW1iZWRkZWQgYW5kIGJyb3dzZXIgcHJldmlldyBtb2Rlcy4gdjIuMTAgY3Jvc3MtcmVwbyByZWZyZXNoIGNvbmZpcm1lZDogbm9uZSBvZiA2IHN1cnZleWVkIHBlZXJzIChoYXJhZHkgLyBTcGF5ZG8gLyBSb21hUm9nb3YgLyBjb2Nvcy1jb2RlLW1vZGUgLyBGdW5wbGF5QUkgLyBjb2Nvcy1jbGkpIHNoaXAgYSBzYWZlciBjYWxsIHBhdGgg4oCUIGhhcmFkeSBhbmQgY29jb3MtY29kZS1tb2RlIHVzZSB0aGUgYEVkaXRvci5NZXNzYWdlIHNjZW5lL2VkaXRvci1wcmV2aWV3LXNldC1wbGF5YCBjaGFubmVsIGFuZCBoaXQgdGhlIHNhbWUgcmFjZS4gKipzdG9wIGlzIHNhZmUqKiBhbmQgcmVsaWFibGUuIFRvIHByZXZlbnQgYWNjaWRlbnRhbCB0cmlnZ2VyaW5nLCBzdGFydCByZXF1aXJlcyBleHBsaWNpdCBgYWNrbm93bGVkZ2VGcmVlemVSaXNrOiB0cnVlYC4gKipTdHJvbmdseSBwcmVmZXJyZWQgYWx0ZXJuYXRpdmVzIGluc3RlYWQgb2Ygc3RhcnQqKjogKGEpIGRlYnVnX2NhcHR1cmVfcHJldmlld19zY3JlZW5zaG90KG1vZGU9XCJlbWJlZGRlZFwiKSBpbiBFRElUIG1vZGUg4oCUIG5vIFBJRSBuZWVkZWQ7IChiKSBkZWJ1Z19nYW1lX2NvbW1hbmQodHlwZT1cInNjcmVlbnNob3RcIikgdmlhIEdhbWVEZWJ1Z0NsaWVudCBvbiBicm93c2VyIHByZXZpZXcgbGF1bmNoZWQgdmlhIGRlYnVnX3ByZXZpZXdfdXJsKGFjdGlvbj1cIm9wZW5cIikuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBvcDogei5lbnVtKFsnc3RhcnQnLCAnc3RvcCddKS5kZXNjcmliZSgnXCJzdGFydFwiIGVudGVycyBQSUUgcGxheSBtb2RlIChlcXVpdmFsZW50IHRvIGNsaWNraW5nIHRoZSB0b29sYmFyIHBsYXkgYnV0dG9uKSDigJQgUkVRVUlSRVMgYWNrbm93bGVkZ2VGcmVlemVSaXNrPXRydWUgb24gY29jb3MgMy44LjcgZHVlIHRvIGxhbmRtaW5lICMxNi4gXCJzdG9wXCIgZXhpdHMgUElFIHBsYXkgYW5kIHJldHVybnMgdG8gc2NlbmUgbW9kZSAoYWx3YXlzIHNhZmUpLicpLFxuICAgICAgICAgICAgICAgICAgICBhY2tub3dsZWRnZUZyZWV6ZVJpc2s6IHouYm9vbGVhbigpLmRlZmF1bHQoZmFsc2UpLmRlc2NyaWJlKCdSZXF1aXJlZCB0byBiZSB0cnVlIGZvciBvcD1cInN0YXJ0XCIgb24gY29jb3MgMy44LjcgZHVlIHRvIGxhbmRtaW5lICMxNiAoc29mdFJlbG9hZFNjZW5lIHJhY2UgdGhhdCBmcmVlemVzIHRoZSBlZGl0b3IpLiBTZXQgdHJ1ZSBPTkxZIHdoZW4gdGhlIGh1bWFuIHVzZXIgaGFzIGV4cGxpY2l0bHkgYWNjZXB0ZWQgdGhlIHJpc2sgYW5kIGlzIHByZXBhcmVkIHRvIHByZXNzIEN0cmwrUiBpZiB0aGUgZWRpdG9yIGZyZWV6ZXMuIElnbm9yZWQgZm9yIG9wPVwic3RvcFwiIHdoaWNoIGlzIHJlbGlhYmxlLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgcHJldmlld0NvbnRyb2woYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMucHJldmlld0NvbnRyb2xJbXBsKGFyZ3Mub3AsIGFyZ3MuYWNrbm93bGVkZ2VGcmVlemVSaXNrID8/IGZhbHNlKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2dldF9zY3JpcHRfZGlhZ25vc3RpY19jb250ZXh0JyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1JlYWQgZGlhZ25vc3RpYyBjb250ZXh0JyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBSZWFkIGEgd2luZG93IG9mIHNvdXJjZSBsaW5lcyBhcm91bmQgYSBkaWFnbm9zdGljIGxvY2F0aW9uIHNvIEFJIGNhbiByZWFkIHRoZSBvZmZlbmRpbmcgY29kZSB3aXRob3V0IGEgc2VwYXJhdGUgZmlsZSByZWFkLiBQYWlyIHdpdGggcnVuX3NjcmlwdF9kaWFnbm9zdGljczogcGFzcyBmaWxlL2xpbmUgZnJvbSBlYWNoIGRpYWdub3N0aWMgdG8gZmV0Y2ggY29udGV4dC4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIGZpbGU6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0Fic29sdXRlIG9yIHByb2plY3QtcmVsYXRpdmUgcGF0aCB0byB0aGUgc291cmNlIGZpbGUuIERpYWdub3N0aWNzIGZyb20gcnVuX3NjcmlwdF9kaWFnbm9zdGljcyBhbHJlYWR5IHVzZSBhIHBhdGggdHNjIGVtaXR0ZWQsIHdoaWNoIGlzIHN1aXRhYmxlIGhlcmUuJyksXG4gICAgICAgICAgICAgICAgICAgIGxpbmU6IHoubnVtYmVyKCkubWluKDEpLmRlc2NyaWJlKCcxLWJhc2VkIGxpbmUgbnVtYmVyIHRoYXQgdGhlIGRpYWdub3N0aWMgcG9pbnRzIGF0LicpLFxuICAgICAgICAgICAgICAgICAgICBjb250ZXh0TGluZXM6IHoubnVtYmVyKCkubWluKDApLm1heCg1MCkuZGVmYXVsdCg1KS5kZXNjcmliZSgnTnVtYmVyIG9mIGxpbmVzIHRvIGluY2x1ZGUgYmVmb3JlIGFuZCBhZnRlciB0aGUgdGFyZ2V0IGxpbmUuIERlZmF1bHQgNSAowrE1IOKGkiAxMS1saW5lIHdpbmRvdykuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBnZXRTY3JpcHREaWFnbm9zdGljQ29udGV4dChhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRTY3JpcHREaWFnbm9zdGljQ29udGV4dEltcGwoYXJncy5maWxlLCBhcmdzLmxpbmUsIGFyZ3MuY29udGV4dExpbmVzKTtcbiAgICB9XG5cbiAgICAvLyBDb21wYXQgcGF0aDogcHJlc2VydmUgdGhlIHByZS12Mi4zLjAgcmVzcG9uc2Ugc2hhcGVcbiAgICAvLyB7c3VjY2VzcywgZGF0YToge3Jlc3VsdCwgbWVzc2FnZTogJ1NjcmlwdCBleGVjdXRlZCBzdWNjZXNzZnVsbHknfX1cbiAgICAvLyBzbyBvbGRlciBjYWxsZXJzIHJlYWRpbmcgZGF0YS5tZXNzYWdlIGtlZXAgd29ya2luZy5cbiAgICBwcml2YXRlIGFzeW5jIGV4ZWN1dGVTY3JpcHRDb21wYXQoc2NyaXB0OiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBvdXQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVKYXZhU2NyaXB0KHNjcmlwdCwgJ3NjZW5lJyk7XG4gICAgICAgIGlmIChvdXQuc3VjY2VzcyAmJiBvdXQuZGF0YSAmJiAncmVzdWx0JyBpbiBvdXQuZGF0YSkge1xuICAgICAgICAgICAgcmV0dXJuIG9rKHtcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0OiBvdXQuZGF0YS5yZXN1bHQsXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdTY3JpcHQgZXhlY3V0ZWQgc3VjY2Vzc2Z1bGx5JyxcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gb3V0O1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgY2xlYXJDb25zb2xlSW1wbCgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICAvLyBOb3RlOiBFZGl0b3IuTWVzc2FnZS5zZW5kIG1heSBub3QgcmV0dXJuIGEgcHJvbWlzZSBpbiBhbGwgdmVyc2lvbnNcbiAgICAgICAgRWRpdG9yLk1lc3NhZ2Uuc2VuZCgnY29uc29sZScsICdjbGVhcicpO1xuICAgICAgICByZXR1cm4gb2sodW5kZWZpbmVkLCAnQ29uc29sZSBjbGVhcmVkIHN1Y2Nlc3NmdWxseScpO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZXhlY3V0ZUphdmFTY3JpcHQoY29kZTogc3RyaW5nLCBjb250ZXh0OiAnc2NlbmUnIHwgJ2VkaXRvcicpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBpZiAoY29udGV4dCA9PT0gJ3NjZW5lJykge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZXhlY3V0ZUluU2NlbmVDb250ZXh0KGNvZGUpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChjb250ZXh0ID09PSAnZWRpdG9yJykge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZXhlY3V0ZUluRWRpdG9yQ29udGV4dChjb2RlKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFpbChgVW5rbm93biBleGVjdXRlX2phdmFzY3JpcHQgY29udGV4dDogJHtjb250ZXh0fWApO1xuICAgIH1cblxuICAgIHByaXZhdGUgZXhlY3V0ZUluU2NlbmVDb250ZXh0KGNvZGU6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnZXhlY3V0ZS1zY2VuZS1zY3JpcHQnLCB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2NvbnNvbGUnLFxuICAgICAgICAgICAgICAgIG1ldGhvZDogJ2V2YWwnLFxuICAgICAgICAgICAgICAgIGFyZ3M6IFtjb2RlXVxuICAgICAgICAgICAgfSkudGhlbigocmVzdWx0OiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRleHQ6ICdzY2VuZScsXG4gICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQ6IHJlc3VsdCxcbiAgICAgICAgICAgICAgICAgICAgfSwgJ1NjZW5lIHNjcmlwdCBleGVjdXRlZCBzdWNjZXNzZnVsbHknKSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZXhlY3V0ZUluRWRpdG9yQ29udGV4dChjb2RlOiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBpZiAoIWlzRWRpdG9yQ29udGV4dEV2YWxFbmFibGVkKCkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKCdFZGl0b3IgY29udGV4dCBldmFsIGlzIGRpc2FibGVkLiBFbmFibGUgYGVuYWJsZUVkaXRvckNvbnRleHRFdmFsYCBpbiBNQ1Agc2VydmVyIHNldHRpbmdzIChwYW5lbCBVSSkgdG8gb3B0IGluLiBUaGlzIGdyYW50cyBBSS1nZW5lcmF0ZWQgY29kZSBhY2Nlc3MgdG8gRWRpdG9yLk1lc3NhZ2UgKyBOb2RlIGZzIEFQSXMgaW4gdGhlIGhvc3QgcHJvY2Vzczsgb25seSBlbmFibGUgd2hlbiB5b3UgdHJ1c3QgdGhlIHVwc3RyZWFtIHByb21wdCBzb3VyY2UuJyk7XG4gICAgICAgIH1cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIFdyYXAgaW4gYXN5bmMgSUlGRSBzbyBBSSBjYW4gdXNlIHRvcC1sZXZlbCBhd2FpdCB0cmFuc3BhcmVudGx5O1xuICAgICAgICAgICAgLy8gYWxzbyBnaXZlcyB1cyBhIGNsZWFuIFByb21pc2UtYmFzZWQgcmV0dXJuIHBhdGggcmVnYXJkbGVzcyBvZlxuICAgICAgICAgICAgLy8gd2hldGhlciB0aGUgdXNlciBjb2RlIHJldHVybnMgYSBQcm9taXNlIG9yIGEgc3luYyB2YWx1ZS5cbiAgICAgICAgICAgIGNvbnN0IHdyYXBwZWQgPSBgKGFzeW5jICgpID0+IHsgJHtjb2RlfSBcXG4gfSkoKWA7XG4gICAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tZXZhbFxuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgKDAsIGV2YWwpKHdyYXBwZWQpO1xuICAgICAgICAgICAgcmV0dXJuIG9rKHtcbiAgICAgICAgICAgICAgICAgICAgY29udGV4dDogJ2VkaXRvcicsXG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdDogcmVzdWx0LFxuICAgICAgICAgICAgICAgIH0sICdFZGl0b3Igc2NyaXB0IGV4ZWN1dGVkIHN1Y2Nlc3NmdWxseScpO1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoYEVkaXRvciBldmFsIGZhaWxlZDogJHtlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycil9YCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldE5vZGVUcmVlSW1wbChyb290VXVpZD86IHN0cmluZywgbWF4RGVwdGg6IG51bWJlciA9IDEwLCBtYXhOb2RlczogbnVtYmVyID0gMjAwMCwgc3VtbWFyeU9ubHk6IGJvb2xlYW4gPSBmYWxzZSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgY291bnRlciA9IHsgY291bnQ6IDAgfTtcbiAgICAgICAgICAgIGNvbnN0IHRydW5jYXRpb24gPSB7IHRydW5jYXRlZDogZmFsc2UsIHRydW5jYXRlZEJ5OiB1bmRlZmluZWQgYXMgJ21heERlcHRoJyB8ICdtYXhOb2RlcycgfCB1bmRlZmluZWQgfTtcblxuICAgICAgICAgICAgY29uc3QgYnVpbGRUcmVlID0gYXN5bmMgKG5vZGVVdWlkOiBzdHJpbmcsIGRlcHRoOiBudW1iZXIgPSAwKTogUHJvbWlzZTxhbnk+ID0+IHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBub2RlRGF0YSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LW5vZGUnLCBub2RlVXVpZCk7XG4gICAgICAgICAgICAgICAgICAgIGNvdW50ZXIuY291bnQrKztcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRyZWUgPSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiBkdW1wVW53cmFwKG5vZGVEYXRhLnV1aWQpLFxuICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogZHVtcFVud3JhcChub2RlRGF0YS5uYW1lKSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGFjdGl2ZTogZHVtcFVud3JhcChub2RlRGF0YS5hY3RpdmUpLFxuICAgICAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50czogKG5vZGVEYXRhIGFzIGFueSkuY29tcG9uZW50cyA/IChub2RlRGF0YSBhcyBhbnkpLmNvbXBvbmVudHMubWFwKChjOiBhbnkpID0+IGMuX190eXBlX18pIDogW10sXG4gICAgICAgICAgICAgICAgICAgICAgICBjaGlsZENvdW50OiBub2RlRGF0YS5jaGlsZHJlbiA/IG5vZGVEYXRhLmNoaWxkcmVuLmxlbmd0aCA6IDAsXG4gICAgICAgICAgICAgICAgICAgICAgICAuLi4oc3VtbWFyeU9ubHkgPyB7fSA6IHsgY2hpbGRyZW46IFtdIGFzIGFueVtdIH0pXG4gICAgICAgICAgICAgICAgICAgIH0gYXMgYW55O1xuXG4gICAgICAgICAgICAgICAgICAgIGlmICghc3VtbWFyeU9ubHkgJiYgdHJlZS5jaGlsZENvdW50ID4gMCAmJiBkZXB0aCA+PSBtYXhEZXB0aCAtIDEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRydW5jYXRpb24udHJ1bmNhdGVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRydW5jYXRpb24udHJ1bmNhdGVkQnkgPz89ICdtYXhEZXB0aCc7XG4gICAgICAgICAgICAgICAgICAgICAgICB0cmVlLnRydW5jYXRlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICB0cmVlLnRydW5jYXRlZEJ5ID0gJ21heERlcHRoJztcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0cmVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGlmICghc3VtbWFyeU9ubHkgJiYgdHJlZS5jaGlsZENvdW50ID4gMCAmJiBjb3VudGVyLmNvdW50ID49IG1heE5vZGVzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0cnVuY2F0aW9uLnRydW5jYXRlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICB0cnVuY2F0aW9uLnRydW5jYXRlZEJ5ID8/PSAnbWF4Tm9kZXMnO1xuICAgICAgICAgICAgICAgICAgICAgICAgdHJlZS50cnVuY2F0ZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgdHJlZS50cnVuY2F0ZWRCeSA9ICdtYXhOb2Rlcyc7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJlZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGlmICghc3VtbWFyeU9ubHkgJiYgbm9kZURhdGEuY2hpbGRyZW4gJiYgbm9kZURhdGEuY2hpbGRyZW4ubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdHJlZS5jaGlsZHJlbiA9IGF3YWl0IFByb21pc2UuYWxsKFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5vZGVEYXRhLmNoaWxkcmVuLm1hcCgoY2hpbGQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBxdWVyeS1ub2RlIGNoaWxkcmVuIGNvbWUgZHVtcC13cmFwcGVkIGFzIHsgdmFsdWU6IHsgdXVpZCB9IH07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGV4dHJhY3QgdGhlIHJlYWwgdXVpZCBzdHJpbmcgYmVmb3JlIHJlY3Vyc2luZyAoZWxzZSBxdWVyeS1ub2RlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGdldHMgYSBiYWQgYXJnIOKGkiB1bmRlZmluZWQgbm9kZSDihpIgXCJyZWFkaW5nICd1dWlkJ1wiIGNyYXNoIGF0IGRlcHRoPj0xKS5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgaW5uZXIgPSBkdW1wVW53cmFwPGFueT4oY2hpbGQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjaGlsZFV1aWQgPSB0eXBlb2YgaW5uZXIgPT09ICdzdHJpbmcnID8gaW5uZXIgOiAoaW5uZXI/LnV1aWQgPz8gY2hpbGQ/LnV1aWQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gYnVpbGRUcmVlKGNoaWxkVXVpZCwgZGVwdGggKyAxKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjb3VudGVyLmNvdW50ID49IG1heE5vZGVzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHJ1bmNhdGlvbi50cnVuY2F0ZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRydW5jYXRpb24udHJ1bmNhdGVkQnkgPz89ICdtYXhOb2Rlcyc7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJlZTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4geyBlcnJvcjogZXJyLm1lc3NhZ2UgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBjb25zdCByZXNwb25kID0gKGRhdGE6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlc3BvbnNlID0gb2soZGF0YSkgYXMgVG9vbFJlc3BvbnNlICYge1xuICAgICAgICAgICAgICAgICAgICB0cnVuY2F0ZWQ6IGJvb2xlYW47XG4gICAgICAgICAgICAgICAgICAgIHRydW5jYXRlZEJ5PzogJ21heERlcHRoJyB8ICdtYXhOb2Rlcyc7XG4gICAgICAgICAgICAgICAgICAgIG5vZGVDb3VudDogbnVtYmVyO1xuICAgICAgICAgICAgICAgICAgICBtYXhEZXB0aDogbnVtYmVyO1xuICAgICAgICAgICAgICAgICAgICBtYXhOb2RlczogbnVtYmVyO1xuICAgICAgICAgICAgICAgICAgICBzdW1tYXJ5T25seTogYm9vbGVhbjtcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIHJlc3BvbnNlLnRydW5jYXRlZCA9IHRydW5jYXRpb24udHJ1bmNhdGVkO1xuICAgICAgICAgICAgICAgIGlmICh0cnVuY2F0aW9uLnRydW5jYXRlZEJ5KSByZXNwb25zZS50cnVuY2F0ZWRCeSA9IHRydW5jYXRpb24udHJ1bmNhdGVkQnk7XG4gICAgICAgICAgICAgICAgcmVzcG9uc2Uubm9kZUNvdW50ID0gY291bnRlci5jb3VudDtcbiAgICAgICAgICAgICAgICByZXNwb25zZS5tYXhEZXB0aCA9IG1heERlcHRoO1xuICAgICAgICAgICAgICAgIHJlc3BvbnNlLm1heE5vZGVzID0gbWF4Tm9kZXM7XG4gICAgICAgICAgICAgICAgcmVzcG9uc2Uuc3VtbWFyeU9ubHkgPSBzdW1tYXJ5T25seTtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGlmIChyb290VXVpZCkge1xuICAgICAgICAgICAgICAgIGJ1aWxkVHJlZShyb290VXVpZCkudGhlbih0cmVlID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzcG9uZCh0cmVlKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktaGllcmFyY2h5JykudGhlbihhc3luYyAoaGllcmFyY2h5OiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdHJlZXMgPSBhd2FpdCBQcm9taXNlLmFsbChcbiAgICAgICAgICAgICAgICAgICAgICAgIGhpZXJhcmNoeS5jaGlsZHJlbi5tYXAoKHJvb3ROb2RlOiBhbnkpID0+IGJ1aWxkVHJlZShyb290Tm9kZS51dWlkKSlcbiAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgICAgcmVzcG9uZCh0cmVlcyk7XG4gICAgICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2V0UGVyZm9ybWFuY2VTdGF0c0ltcGwoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1wZXJmb3JtYW5jZScpLnRoZW4oKHN0YXRzOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBwZXJmU3RhdHM6IFBlcmZvcm1hbmNlU3RhdHMgPSB7XG4gICAgICAgICAgICAgICAgICAgIG5vZGVDb3VudDogc3RhdHMubm9kZUNvdW50IHx8IDAsXG4gICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudENvdW50OiBzdGF0cy5jb21wb25lbnRDb3VudCB8fCAwLFxuICAgICAgICAgICAgICAgICAgICBkcmF3Q2FsbHM6IHN0YXRzLmRyYXdDYWxscyB8fCAwLFxuICAgICAgICAgICAgICAgICAgICB0cmlhbmdsZXM6IHN0YXRzLnRyaWFuZ2xlcyB8fCAwLFxuICAgICAgICAgICAgICAgICAgICBtZW1vcnk6IHN0YXRzLm1lbW9yeSB8fCB7fVxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayhwZXJmU3RhdHMpKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKCgpID0+IHtcbiAgICAgICAgICAgICAgICAvLyBGYWxsYmFjayB0byBiYXNpYyBzdGF0c1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogJ1BlcmZvcm1hbmNlIHN0YXRzIG5vdCBhdmFpbGFibGUgaW4gZWRpdCBtb2RlJ1xuICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyB2YWxpZGF0ZVNjZW5lSW1wbChvcHRpb25zOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBpc3N1ZXM6IFZhbGlkYXRpb25Jc3N1ZVtdID0gW107XG5cbiAgICAgICAgLy8gQ2hlY2sgZm9yIG1pc3NpbmcgYXNzZXRzXG4gICAgICAgIGlmIChvcHRpb25zLmNoZWNrTWlzc2luZ0Fzc2V0cykge1xuICAgICAgICAgICAgY29uc3QgYXNzZXRDaGVjayA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ2NoZWNrLW1pc3NpbmctYXNzZXRzJyk7XG4gICAgICAgICAgICBpZiAoYXNzZXRDaGVjayAmJiBhc3NldENoZWNrLm1pc3NpbmcpIHtcbiAgICAgICAgICAgICAgICBpc3N1ZXMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgIHR5cGU6ICdlcnJvcicsXG4gICAgICAgICAgICAgICAgICAgIGNhdGVnb3J5OiAnYXNzZXRzJyxcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYEZvdW5kICR7YXNzZXRDaGVjay5taXNzaW5nLmxlbmd0aH0gbWlzc2luZyBhc3NldCByZWZlcmVuY2VzYCxcbiAgICAgICAgICAgICAgICAgICAgZGV0YWlsczogYXNzZXRDaGVjay5taXNzaW5nXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBDaGVjayBmb3IgcGVyZm9ybWFuY2UgaXNzdWVzXG4gICAgICAgIGlmIChvcHRpb25zLmNoZWNrUGVyZm9ybWFuY2UpIHtcbiAgICAgICAgICAgIGNvbnN0IGhpZXJhcmNoeSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LWhpZXJhcmNoeScpO1xuICAgICAgICAgICAgY29uc3Qgbm9kZUNvdW50ID0gdGhpcy5jb3VudE5vZGVzKGhpZXJhcmNoeS5jaGlsZHJlbik7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmIChub2RlQ291bnQgPiAxMDAwKSB7XG4gICAgICAgICAgICAgICAgaXNzdWVzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICB0eXBlOiAnd2FybmluZycsXG4gICAgICAgICAgICAgICAgICAgIGNhdGVnb3J5OiAncGVyZm9ybWFuY2UnLFxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgSGlnaCBub2RlIGNvdW50OiAke25vZGVDb3VudH0gbm9kZXMgKHJlY29tbWVuZGVkIDwgMTAwMClgLFxuICAgICAgICAgICAgICAgICAgICBzdWdnZXN0aW9uOiAnQ29uc2lkZXIgdXNpbmcgb2JqZWN0IHBvb2xpbmcgb3Igc2NlbmUgb3B0aW1pemF0aW9uJ1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgcmVzdWx0OiBWYWxpZGF0aW9uUmVzdWx0ID0ge1xuICAgICAgICAgICAgdmFsaWQ6IGlzc3Vlcy5sZW5ndGggPT09IDAsXG4gICAgICAgICAgICBpc3N1ZUNvdW50OiBpc3N1ZXMubGVuZ3RoLFxuICAgICAgICAgICAgaXNzdWVzOiBpc3N1ZXNcbiAgICAgICAgfTtcblxuICAgICAgICByZXR1cm4gb2socmVzdWx0KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGNvdW50Tm9kZXMobm9kZXM6IGFueVtdKTogbnVtYmVyIHtcbiAgICAgICAgbGV0IGNvdW50ID0gbm9kZXMubGVuZ3RoO1xuICAgICAgICBmb3IgKGNvbnN0IG5vZGUgb2Ygbm9kZXMpIHtcbiAgICAgICAgICAgIGlmIChub2RlLmNoaWxkcmVuKSB7XG4gICAgICAgICAgICAgICAgY291bnQgKz0gdGhpcy5jb3VudE5vZGVzKG5vZGUuY2hpbGRyZW4pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBjb3VudDtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldEVkaXRvckluZm9JbXBsKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IGluZm8gPSB7XG4gICAgICAgICAgICBlZGl0b3I6IHtcbiAgICAgICAgICAgICAgICB2ZXJzaW9uOiAoRWRpdG9yIGFzIGFueSkudmVyc2lvbnM/LmVkaXRvciB8fCAnVW5rbm93bicsXG4gICAgICAgICAgICAgICAgY29jb3NWZXJzaW9uOiAoRWRpdG9yIGFzIGFueSkudmVyc2lvbnM/LmNvY29zIHx8ICdVbmtub3duJyxcbiAgICAgICAgICAgICAgICBwbGF0Zm9ybTogcHJvY2Vzcy5wbGF0Zm9ybSxcbiAgICAgICAgICAgICAgICBhcmNoOiBwcm9jZXNzLmFyY2gsXG4gICAgICAgICAgICAgICAgbm9kZVZlcnNpb246IHByb2Nlc3MudmVyc2lvblxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHByb2plY3Q6IHtcbiAgICAgICAgICAgICAgICBuYW1lOiBFZGl0b3IuUHJvamVjdC5uYW1lLFxuICAgICAgICAgICAgICAgIHBhdGg6IEVkaXRvci5Qcm9qZWN0LnBhdGgsXG4gICAgICAgICAgICAgICAgdXVpZDogRWRpdG9yLlByb2plY3QudXVpZFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIG1lbW9yeTogcHJvY2Vzcy5tZW1vcnlVc2FnZSgpLFxuICAgICAgICAgICAgdXB0aW1lOiBwcm9jZXNzLnVwdGltZSgpXG4gICAgICAgIH07XG5cbiAgICAgICAgcmV0dXJuIG9rKGluZm8pO1xuICAgIH1cblxuICAgIHByaXZhdGUgcmVzb2x2ZVByb2plY3RMb2dQYXRoKCk6IHsgcGF0aDogc3RyaW5nIH0gfCB7IGVycm9yOiBzdHJpbmcgfSB7XG4gICAgICAgIGlmICghRWRpdG9yLlByb2plY3QgfHwgIUVkaXRvci5Qcm9qZWN0LnBhdGgpIHtcbiAgICAgICAgICAgIHJldHVybiB7IGVycm9yOiAnRWRpdG9yLlByb2plY3QucGF0aCBpcyBub3QgYXZhaWxhYmxlOyBjYW5ub3QgbG9jYXRlIHByb2plY3QgbG9nIGZpbGUuJyB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGxvZ1BhdGggPSBwYXRoLmpvaW4oRWRpdG9yLlByb2plY3QucGF0aCwgJ3RlbXAvbG9ncy9wcm9qZWN0LmxvZycpO1xuICAgICAgICBpZiAoIWZzLmV4aXN0c1N5bmMobG9nUGF0aCkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IGVycm9yOiBgUHJvamVjdCBsb2cgZmlsZSBub3QgZm91bmQgYXQgJHtsb2dQYXRofWAgfTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4geyBwYXRoOiBsb2dQYXRoIH07XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRQcm9qZWN0TG9nc0ltcGwobGluZXM6IG51bWJlciA9IDEwMCwgZmlsdGVyS2V5d29yZD86IHN0cmluZywgbG9nTGV2ZWw6IHN0cmluZyA9ICdBTEwnKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJlc29sdmVkID0gdGhpcy5yZXNvbHZlUHJvamVjdExvZ1BhdGgoKTtcbiAgICAgICAgICAgIGlmICgnZXJyb3InIGluIHJlc29sdmVkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwocmVzb2x2ZWQuZXJyb3IpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgbG9nRmlsZVBhdGggPSByZXNvbHZlZC5wYXRoO1xuXG4gICAgICAgICAgICAvLyBSZWFkIHRoZSBmaWxlIGNvbnRlbnRcbiAgICAgICAgICAgIGNvbnN0IGxvZ0NvbnRlbnQgPSBmcy5yZWFkRmlsZVN5bmMobG9nRmlsZVBhdGgsICd1dGY4Jyk7XG4gICAgICAgICAgICBjb25zdCBsb2dMaW5lcyA9IGxvZ0NvbnRlbnQuc3BsaXQoJ1xcbicpLmZpbHRlcihsaW5lID0+IGxpbmUudHJpbSgpICE9PSAnJyk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIEdldCB0aGUgbGFzdCBOIGxpbmVzXG4gICAgICAgICAgICBjb25zdCByZWNlbnRMaW5lcyA9IGxvZ0xpbmVzLnNsaWNlKC1saW5lcyk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIEFwcGx5IGZpbHRlcnNcbiAgICAgICAgICAgIGxldCBmaWx0ZXJlZExpbmVzID0gcmVjZW50TGluZXM7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIEZpbHRlciBieSBsb2cgbGV2ZWwgaWYgbm90ICdBTEwnXG4gICAgICAgICAgICBpZiAobG9nTGV2ZWwgIT09ICdBTEwnKSB7XG4gICAgICAgICAgICAgICAgZmlsdGVyZWRMaW5lcyA9IGZpbHRlckJ5TGV2ZWwoZmlsdGVyZWRMaW5lcywgbG9nTGV2ZWwpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBGaWx0ZXIgYnkga2V5d29yZCBpZiBwcm92aWRlZFxuICAgICAgICAgICAgaWYgKGZpbHRlcktleXdvcmQpIHtcbiAgICAgICAgICAgICAgICBmaWx0ZXJlZExpbmVzID0gZmlsdGVyQnlLZXl3b3JkKGZpbHRlcmVkTGluZXMsIGZpbHRlcktleXdvcmQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICByZXR1cm4gb2soe1xuICAgICAgICAgICAgICAgICAgICB0b3RhbExpbmVzOiBsb2dMaW5lcy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgIHJlcXVlc3RlZExpbmVzOiBsaW5lcyxcbiAgICAgICAgICAgICAgICAgICAgZmlsdGVyZWRMaW5lczogZmlsdGVyZWRMaW5lcy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgIGxvZ0xldmVsOiBsb2dMZXZlbCxcbiAgICAgICAgICAgICAgICAgICAgZmlsdGVyS2V5d29yZDogZmlsdGVyS2V5d29yZCB8fCBudWxsLFxuICAgICAgICAgICAgICAgICAgICBsb2dzOiBmaWx0ZXJlZExpbmVzLFxuICAgICAgICAgICAgICAgICAgICBsb2dGaWxlUGF0aDogbG9nRmlsZVBhdGhcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoYEZhaWxlZCB0byByZWFkIHByb2plY3QgbG9nczogJHtlcnJvci5tZXNzYWdlfWApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRMb2dGaWxlSW5mb0ltcGwoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJlc29sdmVkID0gdGhpcy5yZXNvbHZlUHJvamVjdExvZ1BhdGgoKTtcbiAgICAgICAgICAgIGlmICgnZXJyb3InIGluIHJlc29sdmVkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwocmVzb2x2ZWQuZXJyb3IpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgbG9nRmlsZVBhdGggPSByZXNvbHZlZC5wYXRoO1xuXG4gICAgICAgICAgICBjb25zdCBzdGF0cyA9IGZzLnN0YXRTeW5jKGxvZ0ZpbGVQYXRoKTtcbiAgICAgICAgICAgIGNvbnN0IGxvZ0NvbnRlbnQgPSBmcy5yZWFkRmlsZVN5bmMobG9nRmlsZVBhdGgsICd1dGY4Jyk7XG4gICAgICAgICAgICBjb25zdCBsaW5lQ291bnQgPSBsb2dDb250ZW50LnNwbGl0KCdcXG4nKS5maWx0ZXIobGluZSA9PiBsaW5lLnRyaW0oKSAhPT0gJycpLmxlbmd0aDtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgcmV0dXJuIG9rKHtcbiAgICAgICAgICAgICAgICAgICAgZmlsZVBhdGg6IGxvZ0ZpbGVQYXRoLFxuICAgICAgICAgICAgICAgICAgICBmaWxlU2l6ZTogc3RhdHMuc2l6ZSxcbiAgICAgICAgICAgICAgICAgICAgZmlsZVNpemVGb3JtYXR0ZWQ6IHRoaXMuZm9ybWF0RmlsZVNpemUoc3RhdHMuc2l6ZSksXG4gICAgICAgICAgICAgICAgICAgIGxhc3RNb2RpZmllZDogc3RhdHMubXRpbWUudG9JU09TdHJpbmcoKSxcbiAgICAgICAgICAgICAgICAgICAgbGluZUNvdW50OiBsaW5lQ291bnQsXG4gICAgICAgICAgICAgICAgICAgIGNyZWF0ZWQ6IHN0YXRzLmJpcnRodGltZS50b0lTT1N0cmluZygpLFxuICAgICAgICAgICAgICAgICAgICBhY2Nlc3NpYmxlOiBmcy5jb25zdGFudHMuUl9PS1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChgRmFpbGVkIHRvIGdldCBsb2cgZmlsZSBpbmZvOiAke2Vycm9yLm1lc3NhZ2V9YCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHNlYXJjaFByb2plY3RMb2dzSW1wbChwYXR0ZXJuOiBzdHJpbmcsIG1heFJlc3VsdHM6IG51bWJlciA9IDIwLCBjb250ZXh0TGluZXM6IG51bWJlciA9IDIpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcmVzb2x2ZWQgPSB0aGlzLnJlc29sdmVQcm9qZWN0TG9nUGF0aCgpO1xuICAgICAgICAgICAgaWYgKCdlcnJvcicgaW4gcmVzb2x2ZWQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFpbChyZXNvbHZlZC5lcnJvcik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBsb2dGaWxlUGF0aCA9IHJlc29sdmVkLnBhdGg7XG5cbiAgICAgICAgICAgIGNvbnN0IGxvZ0NvbnRlbnQgPSBmcy5yZWFkRmlsZVN5bmMobG9nRmlsZVBhdGgsICd1dGY4Jyk7XG4gICAgICAgICAgICBjb25zdCBsb2dMaW5lcyA9IGxvZ0NvbnRlbnQuc3BsaXQoJ1xcbicpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBDcmVhdGUgcmVnZXggcGF0dGVybiAoc3VwcG9ydCBib3RoIHN0cmluZyBhbmQgcmVnZXggcGF0dGVybnMpXG4gICAgICAgICAgICBsZXQgcmVnZXg6IFJlZ0V4cDtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgcmVnZXggPSBuZXcgUmVnRXhwKHBhdHRlcm4sICdnaScpO1xuICAgICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICAgICAgLy8gSWYgcGF0dGVybiBpcyBub3QgdmFsaWQgcmVnZXgsIHRyZWF0IGFzIGxpdGVyYWwgc3RyaW5nXG4gICAgICAgICAgICAgICAgcmVnZXggPSBuZXcgUmVnRXhwKHBhdHRlcm4ucmVwbGFjZSgvWy4qKz9eJHt9KCl8W1xcXVxcXFxdL2csICdcXFxcJCYnKSwgJ2dpJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGNvbnN0IGFsbE1hdGNoZXMgPSBzZWFyY2hXaXRoQ29udGV4dChsb2dMaW5lcywgcmVnZXgsIGNvbnRleHRMaW5lcyk7XG4gICAgICAgICAgICBjb25zdCBtYXRjaGVzID0gYWxsTWF0Y2hlcy5zbGljZSgwLCBtYXhSZXN1bHRzKS5tYXAobSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgY29udGV4dExpbmVzQXJyYXkgPSBbXTtcbiAgICAgICAgICAgICAgICBsZXQgY3VycmVudExpbmVOdW0gPSBtLm1hdGNoTGluZSAtIG0uYmVmb3JlLmxlbmd0aDtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGxpbmUgb2YgbS5iZWZvcmUpIHtcbiAgICAgICAgICAgICAgICAgICAgY29udGV4dExpbmVzQXJyYXkucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgICAgICBsaW5lTnVtYmVyOiBjdXJyZW50TGluZU51bSsrLFxuICAgICAgICAgICAgICAgICAgICAgICAgY29udGVudDogbGluZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGlzTWF0Y2g6IGZhbHNlXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBjb250ZXh0TGluZXNBcnJheS5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgbGluZU51bWJlcjogbS5tYXRjaExpbmUsXG4gICAgICAgICAgICAgICAgICAgIGNvbnRlbnQ6IG0ubWF0Y2gsXG4gICAgICAgICAgICAgICAgICAgIGlzTWF0Y2g6IHRydWVcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBjdXJyZW50TGluZU51bSsrO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgbGluZSBvZiBtLmFmdGVyKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRleHRMaW5lc0FycmF5LnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgbGluZU51bWJlcjogY3VycmVudExpbmVOdW0rKyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRlbnQ6IGxpbmUsXG4gICAgICAgICAgICAgICAgICAgICAgICBpc01hdGNoOiBmYWxzZVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgbGluZU51bWJlcjogbS5tYXRjaExpbmUsXG4gICAgICAgICAgICAgICAgICAgIG1hdGNoZWRMaW5lOiBtLm1hdGNoLFxuICAgICAgICAgICAgICAgICAgICBjb250ZXh0OiBjb250ZXh0TGluZXNBcnJheVxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgcmV0dXJuIG9rKHtcbiAgICAgICAgICAgICAgICAgICAgcGF0dGVybjogcGF0dGVybixcbiAgICAgICAgICAgICAgICAgICAgdG90YWxNYXRjaGVzOiBhbGxNYXRjaGVzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgbWF4UmVzdWx0czogbWF4UmVzdWx0cyxcbiAgICAgICAgICAgICAgICAgICAgY29udGV4dExpbmVzOiBjb250ZXh0TGluZXMsXG4gICAgICAgICAgICAgICAgICAgIGxvZ0ZpbGVQYXRoOiBsb2dGaWxlUGF0aCxcbiAgICAgICAgICAgICAgICAgICAgbWF0Y2hlczogbWF0Y2hlc1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChgRmFpbGVkIHRvIHNlYXJjaCBwcm9qZWN0IGxvZ3M6ICR7ZXJyb3IubWVzc2FnZX1gKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgZm9ybWF0RmlsZVNpemUoYnl0ZXM6IG51bWJlcik6IHN0cmluZyB7XG4gICAgICAgIGNvbnN0IHVuaXRzID0gWydCJywgJ0tCJywgJ01CJywgJ0dCJ107XG4gICAgICAgIGxldCBzaXplID0gYnl0ZXM7XG4gICAgICAgIGxldCB1bml0SW5kZXggPSAwO1xuXG4gICAgICAgIHdoaWxlIChzaXplID49IDEwMjQgJiYgdW5pdEluZGV4IDwgdW5pdHMubGVuZ3RoIC0gMSkge1xuICAgICAgICAgICAgc2l6ZSAvPSAxMDI0O1xuICAgICAgICAgICAgdW5pdEluZGV4Kys7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gYCR7c2l6ZS50b0ZpeGVkKDIpfSAke3VuaXRzW3VuaXRJbmRleF19YDtcbiAgICB9XG5cbiAgICBwcml2YXRlIHBpY2tXaW5kb3codGl0bGVTdWJzdHJpbmc/OiBzdHJpbmcpOiBhbnkge1xuICAgICAgICAvLyBMYXp5IHJlcXVpcmUgc28gdGhhdCBub24tRWxlY3Ryb24gY29udGV4dHMgKGUuZy4gdW5pdCB0ZXN0cywgc21va2VcbiAgICAgICAgLy8gc2NyaXB0IHdpdGggc3R1YiByZWdpc3RyeSkgY2FuIHN0aWxsIGltcG9ydCB0aGlzIG1vZHVsZS5cbiAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby12YXItcmVxdWlyZXNcbiAgICAgICAgY29uc3QgZWxlY3Ryb24gPSByZXF1aXJlKCdlbGVjdHJvbicpO1xuICAgICAgICBjb25zdCBCVyA9IGVsZWN0cm9uLkJyb3dzZXJXaW5kb3c7XG4gICAgICAgIGlmICghQlcpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignRWxlY3Ryb24gQnJvd3NlcldpbmRvdyBBUEkgdW5hdmFpbGFibGU7IHNjcmVlbnNob3QgdG9vbCByZXF1aXJlcyBydW5uaW5nIGluc2lkZSBDb2NvcyBlZGl0b3IgaG9zdCBwcm9jZXNzLicpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aXRsZVN1YnN0cmluZykge1xuICAgICAgICAgICAgY29uc3QgbWF0Y2hlcyA9IEJXLmdldEFsbFdpbmRvd3MoKS5maWx0ZXIoKHc6IGFueSkgPT5cbiAgICAgICAgICAgICAgICB3ICYmICF3LmlzRGVzdHJveWVkKCkgJiYgKHcuZ2V0VGl0bGU/LigpIHx8ICcnKS5pbmNsdWRlcyh0aXRsZVN1YnN0cmluZykpO1xuICAgICAgICAgICAgaWYgKG1hdGNoZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBObyBFbGVjdHJvbiB3aW5kb3cgdGl0bGUgbWF0Y2hlZCBzdWJzdHJpbmc6ICR7dGl0bGVTdWJzdHJpbmd9YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gbWF0Y2hlc1swXTtcbiAgICAgICAgfVxuICAgICAgICAvLyB2Mi4zLjEgcmV2aWV3IGZpeDogZm9jdXNlZCB3aW5kb3cgbWF5IGJlIGEgdHJhbnNpZW50IHByZXZpZXcgcG9wdXAuXG4gICAgICAgIC8vIFByZWZlciBhIG5vbi1QcmV2aWV3IHdpbmRvdyBzbyBkZWZhdWx0IHNjcmVlbnNob3RzIHRhcmdldCB0aGUgbWFpblxuICAgICAgICAvLyBlZGl0b3Igc3VyZmFjZS4gQ2FsbGVyIGNhbiBzdGlsbCBwYXNzIHRpdGxlU3Vic3RyaW5nPSdQcmV2aWV3JyB0b1xuICAgICAgICAvLyBleHBsaWNpdGx5IHRhcmdldCB0aGUgcHJldmlldyB3aGVuIHdhbnRlZC5cbiAgICAgICAgY29uc3QgYWxsOiBhbnlbXSA9IEJXLmdldEFsbFdpbmRvd3MoKS5maWx0ZXIoKHc6IGFueSkgPT4gdyAmJiAhdy5pc0Rlc3Ryb3llZCgpKTtcbiAgICAgICAgaWYgKGFsbC5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignTm8gbGl2ZSBFbGVjdHJvbiB3aW5kb3dzOyBjYW5ub3QgY2FwdHVyZSBzY3JlZW5zaG90LicpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGlzUHJldmlldyA9ICh3OiBhbnkpID0+IC9wcmV2aWV3L2kudGVzdCh3LmdldFRpdGxlPy4oKSB8fCAnJyk7XG4gICAgICAgIGNvbnN0IG5vblByZXZpZXcgPSBhbGwuZmlsdGVyKCh3OiBhbnkpID0+ICFpc1ByZXZpZXcodykpO1xuICAgICAgICBjb25zdCBmb2N1c2VkID0gQlcuZ2V0Rm9jdXNlZFdpbmRvdz8uKCk7XG4gICAgICAgIGlmIChmb2N1c2VkICYmICFmb2N1c2VkLmlzRGVzdHJveWVkKCkgJiYgIWlzUHJldmlldyhmb2N1c2VkKSkgcmV0dXJuIGZvY3VzZWQ7XG4gICAgICAgIGlmIChub25QcmV2aWV3Lmxlbmd0aCA+IDApIHJldHVybiBub25QcmV2aWV3WzBdO1xuICAgICAgICByZXR1cm4gYWxsWzBdO1xuICAgIH1cblxuICAgIHByaXZhdGUgZW5zdXJlQ2FwdHVyZURpcigpOiB7IG9rOiB0cnVlOyBkaXI6IHN0cmluZyB9IHwgeyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmcgfSB7XG4gICAgICAgIGlmICghRWRpdG9yLlByb2plY3QgfHwgIUVkaXRvci5Qcm9qZWN0LnBhdGgpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6ICdFZGl0b3IuUHJvamVjdC5wYXRoIGlzIG5vdCBhdmFpbGFibGU7IGNhbm5vdCByZXNvbHZlIGNhcHR1cmUgb3V0cHV0IGRpcmVjdG9yeS4nIH07XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZGlyID0gcGF0aC5qb2luKEVkaXRvci5Qcm9qZWN0LnBhdGgsICd0ZW1wJywgJ21jcC1jYXB0dXJlcycpO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgZnMubWtkaXJTeW5jKGRpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gICAgICAgICAgICByZXR1cm4geyBvazogdHJ1ZSwgZGlyIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBgRmFpbGVkIHRvIGNyZWF0ZSBjYXB0dXJlIGRpcjogJHtlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycil9YCB9O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gdjIuOC4wIFQtVjI4LTIgKGNhcnJ5b3ZlciBmcm9tIHYyLjcuMCBDb2RleCBzaW5nbGUtcmV2aWV3ZXIg8J+foSlcbiAgICAvLyDihpIgdjIuOC4xIHJvdW5kLTEgZml4IChDb2RleCDwn5S0ICsgQ2xhdWRlIPCfn6EpOiB0aGUgdjIuOC4wIGhlbHBlclxuICAgIC8vIHJlYWxwYXRoJ2QgYGRpcmAgYW5kIGBwYXRoLmRpcm5hbWUocGF0aC5qb2luKGRpciwgYmFzZW5hbWUpKWAgYW5kXG4gICAgLy8gY29tcGFyZWQgdGhlIHR3byDigJQgYnV0IHdpdGggYSBmaXhlZCBiYXNlbmFtZSB0aG9zZSBleHByZXNzaW9ucyBib3RoXG4gICAgLy8gY29sbGFwc2UgdG8gYGRpcmAsIG1ha2luZyB0aGUgZXF1YWxpdHkgY2hlY2sgdGF1dG9sb2dpY2FsLiBUaGUgY2hlY2tcbiAgICAvLyBwcm90ZWN0ZWQgbm90aGluZyBpZiBgPHByb2plY3Q+L3RlbXAvbWNwLWNhcHR1cmVzYCBpdHNlbGYgd2FzIGFcbiAgICAvLyBzeW1saW5rIHRoYXQgZXNjYXBlcyB0aGUgcHJvamVjdCB0cmVlLlxuICAgIC8vXG4gICAgLy8gVHJ1ZSBlc2NhcGUgcHJvdGVjdGlvbiByZXF1aXJlcyBhbmNob3JpbmcgYWdhaW5zdCB0aGUgcHJvamVjdCByb290LlxuICAgIC8vIFdlIG5vdyByZWFscGF0aCBCT1RIIHRoZSBjYXB0dXJlIGRpciBhbmQgYEVkaXRvci5Qcm9qZWN0LnBhdGhgIGFuZFxuICAgIC8vIHJlcXVpcmUgdGhlIHJlc29sdmVkIGNhcHR1cmUgZGlyIHRvIGJlIGluc2lkZSB0aGUgcmVzb2x2ZWQgcHJvamVjdFxuICAgIC8vIHJvb3QgKGVxdWFsaXR5IE9SIGByZWFsRGlyLnN0YXJ0c1dpdGgocmVhbFByb2plY3RSb290ICsgc2VwKWApLlxuICAgIC8vIFRoZSBpbnRyYS1kaXIgY2hlY2sgaXMga2VwdCBmb3IgY2hlYXAgZGVmZW5zZS1pbi1kZXB0aCBpbiBjYXNlIGFcbiAgICAvLyBmdXR1cmUgYmFzZW5hbWUgZ2V0cyB0cmF2ZXJzYWwgY2hhcmFjdGVycyB0aHJlYWRlZCB0aHJvdWdoLlxuICAgIC8vXG4gICAgLy8gUmV0dXJucyB7IG9rOiB0cnVlLCBmaWxlUGF0aCwgZGlyIH0gd2hlbiBzYWZlIHRvIHdyaXRlLCBvclxuICAgIC8vIHsgb2s6IGZhbHNlLCBlcnJvciB9IHdpdGggdGhlIHNhbWUgZXJyb3IgZW52ZWxvcGUgc2hhcGUgYXNcbiAgICAvLyBlbnN1cmVDYXB0dXJlRGlyIHNvIGNhbGxlcnMgY2FuIGZhbGwgdGhyb3VnaCB0aGVpciBleGlzdGluZ1xuICAgIC8vIGVycm9yLXJldHVybiBwYXR0ZXJuLlxuICAgIHByaXZhdGUgcmVzb2x2ZUF1dG9DYXB0dXJlRmlsZShiYXNlbmFtZTogc3RyaW5nKTogeyBvazogdHJ1ZTsgZmlsZVBhdGg6IHN0cmluZzsgZGlyOiBzdHJpbmcgfSB8IHsgb2s6IGZhbHNlOyBlcnJvcjogc3RyaW5nIH0ge1xuICAgICAgICBjb25zdCBkaXJSZXN1bHQgPSB0aGlzLmVuc3VyZUNhcHR1cmVEaXIoKTtcbiAgICAgICAgaWYgKCFkaXJSZXN1bHQub2spIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGRpclJlc3VsdC5lcnJvciB9O1xuICAgICAgICBjb25zdCBwcm9qZWN0UGF0aDogc3RyaW5nIHwgdW5kZWZpbmVkID0gRWRpdG9yPy5Qcm9qZWN0Py5wYXRoO1xuICAgICAgICBpZiAoIXByb2plY3RQYXRoKSB7XG4gICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiAnRWRpdG9yLlByb2plY3QucGF0aCBpcyBub3QgYXZhaWxhYmxlOyBjYW5ub3QgYW5jaG9yIGNhcHR1cmUtZGlyIGNvbnRhaW5tZW50IGNoZWNrLicgfTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBmaWxlUGF0aCA9IHBhdGguam9pbihkaXJSZXN1bHQuZGlyLCBiYXNlbmFtZSk7XG4gICAgICAgIGxldCByZWFsRGlyOiBzdHJpbmc7XG4gICAgICAgIGxldCByZWFsUGFyZW50OiBzdHJpbmc7XG4gICAgICAgIGxldCByZWFsUHJvamVjdFJvb3Q6IHN0cmluZztcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJwOiBhbnkgPSBmcy5yZWFscGF0aFN5bmMgYXMgYW55O1xuICAgICAgICAgICAgY29uc3QgcmVzb2x2ZVJlYWwgPSBycC5uYXRpdmUgPz8gcnA7XG4gICAgICAgICAgICByZWFsRGlyID0gcmVzb2x2ZVJlYWwoZGlyUmVzdWx0LmRpcik7XG4gICAgICAgICAgICByZWFsUGFyZW50ID0gcmVzb2x2ZVJlYWwocGF0aC5kaXJuYW1lKGZpbGVQYXRoKSk7XG4gICAgICAgICAgICByZWFsUHJvamVjdFJvb3QgPSByZXNvbHZlUmVhbChwcm9qZWN0UGF0aCk7XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBgc2NyZWVuc2hvdCBwYXRoIHJlYWxwYXRoIGZhaWxlZDogJHtlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycil9YCB9O1xuICAgICAgICB9XG4gICAgICAgIC8vIERlZmVuc2UtaW4tZGVwdGg6IHBhcmVudCBvZiB0aGUgcmVzb2x2ZWQgZmlsZSBtdXN0IGVxdWFsIHRoZVxuICAgICAgICAvLyByZXNvbHZlZCBjYXB0dXJlIGRpciAoY2F0Y2hlcyBmdXR1cmUgYmFzZW5hbWVzIHRocmVhZGluZyBgLi5gKS5cbiAgICAgICAgaWYgKHBhdGgucmVzb2x2ZShyZWFsUGFyZW50KSAhPT0gcGF0aC5yZXNvbHZlKHJlYWxEaXIpKSB7XG4gICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiAnc2NyZWVuc2hvdCBzYXZlIHBhdGggcmVzb2x2ZWQgb3V0c2lkZSB0aGUgY2FwdHVyZSBkaXJlY3RvcnknIH07XG4gICAgICAgIH1cbiAgICAgICAgLy8gUHJpbWFyeSBwcm90ZWN0aW9uOiBjYXB0dXJlIGRpciBpdHNlbGYgbXVzdCByZXNvbHZlIGluc2lkZSB0aGVcbiAgICAgICAgLy8gcHJvamVjdCByb290LCBzbyBhIHN5bWxpbmsgY2hhaW4gb24gYHRlbXAvbWNwLWNhcHR1cmVzYCBjYW5ub3RcbiAgICAgICAgLy8gcGl2b3Qgd3JpdGVzIHRvIGUuZy4gL2V0YyBvciBDOlxcV2luZG93cy5cbiAgICAgICAgLy8gdjIuOS54IHBvbGlzaCAoQ29kZXggcjIgc2luZ2xlLfCfn6EgZnJvbSB2Mi44LjEgcmV2aWV3KTogdXNlXG4gICAgICAgIC8vIHBhdGgucmVsYXRpdmUgaW5zdGVhZCBvZiBgcm9vdCArIHBhdGguc2VwYCBwcmVmaXggY2hlY2sg4oCUXG4gICAgICAgIC8vIHdoZW4gcm9vdCBpcyBhIGRyaXZlIHJvb3QgKGBDOlxcYCksIHBhdGgucmVzb2x2ZSBub3JtYWxpc2VzIGl0XG4gICAgICAgIC8vIHRvIGBDOlxcXFxgIGFuZCBgcGF0aC5zZXBgIGFkZHMgYW5vdGhlciBgXFxgLCBwcm9kdWNpbmcgYEM6XFxcXFxcXFxgXG4gICAgICAgIC8vIHdoaWNoIGEgY2FuZGlkYXRlIGxpa2UgYEM6XFxcXGZvb2AgZG9lcyBub3QgbWF0Y2guIHBhdGgucmVsYXRpdmVcbiAgICAgICAgLy8gYWxzbyBoYW5kbGVzIHRoZSBDOlxcZm9vIHZzIEM6XFxmb29iYXIgcHJlZml4LWNvbGxpc2lvbiBjYXNlLlxuICAgICAgICBpZiAoIWlzUGF0aFdpdGhpblJvb3QocmVhbERpciwgcmVhbFByb2plY3RSb290KSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogYGNhcHR1cmUgZGlyIHJlc29sdmVkIG91dHNpZGUgdGhlIHByb2plY3Qgcm9vdDogJHtwYXRoLnJlc29sdmUocmVhbERpcil9IG5vdCB3aXRoaW4gJHtwYXRoLnJlc29sdmUocmVhbFByb2plY3RSb290KX1gIH07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUsIGZpbGVQYXRoLCBkaXI6IGRpclJlc3VsdC5kaXIgfTtcbiAgICB9XG5cbiAgICAvLyB2Mi44LjEgcm91bmQtMSBmaXggKEdlbWluaSDwn5S0ICsgQ29kZXgg8J+foSk6IHdoZW4gY2FsbGVyIHBhc3NlcyBhblxuICAgIC8vIGV4cGxpY2l0IHNhdmVQYXRoIC8gc2F2ZVBhdGhQcmVmaXgsIHdlIHN0aWxsIG5lZWQgdGhlIHNhbWUgcHJvamVjdC1cbiAgICAvLyByb290IGNvbnRhaW5tZW50IGd1YXJhbnRlZSB0aGF0IHJlc29sdmVBdXRvQ2FwdHVyZUZpbGUgZ2l2ZXMgdGhlXG4gICAgLy8gYXV0by1uYW1lZCBicmFuY2guIEFJLWdlbmVyYXRlZCBhYnNvbHV0ZSBwYXRocyBjb3VsZCBvdGhlcndpc2VcbiAgICAvLyB3cml0ZSBvdXRzaWRlIHRoZSBwcm9qZWN0IHJvb3QuXG4gICAgLy9cbiAgICAvLyBUaGUgY2hlY2sgcmVzb2x2ZXMgdGhlIHBhcmVudCBkaXJlY3RvcnkgKHRoZSBmaWxlIGl0c2VsZiBtYXkgbm90XG4gICAgLy8gZXhpc3QgeWV0KSBhbmQgcmVxdWlyZXMgaXQgdG8gYmUgaW5zaWRlIGByZWFscGF0aChFZGl0b3IuUHJvamVjdC5wYXRoKWAuXG4gICAgcHJpdmF0ZSBhc3NlcnRTYXZlUGF0aFdpdGhpblByb2plY3Qoc2F2ZVBhdGg6IHN0cmluZyk6IHsgb2s6IHRydWU7IHJlc29sdmVkUGF0aDogc3RyaW5nIH0gfCB7IG9rOiBmYWxzZTsgZXJyb3I6IHN0cmluZyB9IHtcbiAgICAgICAgY29uc3QgcHJvamVjdFBhdGg6IHN0cmluZyB8IHVuZGVmaW5lZCA9IEVkaXRvcj8uUHJvamVjdD8ucGF0aDtcbiAgICAgICAgaWYgKCFwcm9qZWN0UGF0aCkge1xuICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogJ0VkaXRvci5Qcm9qZWN0LnBhdGggaXMgbm90IGF2YWlsYWJsZTsgY2Fubm90IHZhbGlkYXRlIGV4cGxpY2l0IHNhdmVQYXRoLicgfTtcbiAgICAgICAgfVxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcnA6IGFueSA9IGZzLnJlYWxwYXRoU3luYyBhcyBhbnk7XG4gICAgICAgICAgICBjb25zdCByZXNvbHZlUmVhbCA9IHJwLm5hdGl2ZSA/PyBycDtcbiAgICAgICAgICAgIGNvbnN0IHJlYWxQcm9qZWN0Um9vdCA9IHJlc29sdmVSZWFsKHByb2plY3RQYXRoKTtcbiAgICAgICAgICAgIC8vIHYyLjguMiByZXRlc3QgZml4IChDb2RleCByMiDwn5+hICMxKTogYSByZWxhdGl2ZSBzYXZlUGF0aCB3b3VsZFxuICAgICAgICAgICAgLy8gbWFrZSBgcGF0aC5kaXJuYW1lKHNhdmVQYXRoKWAgY29sbGFwc2UgdG8gJy4nIGFuZCByZXNvbHZlIHRvXG4gICAgICAgICAgICAvLyB0aGUgaG9zdCBwcm9jZXNzIGN3ZCAob2Z0ZW4gYDxlZGl0b3ItaW5zdGFsbD4vQ29jb3NEYXNoYm9hcmRgKVxuICAgICAgICAgICAgLy8gcmF0aGVyIHRoYW4gdGhlIHByb2plY3Qgcm9vdC4gQW5jaG9yIHJlbGF0aXZlIHBhdGhzIGFnYWluc3RcbiAgICAgICAgICAgIC8vIHRoZSBwcm9qZWN0IHJvb3QgZXhwbGljaXRseSBzbyB0aGUgQUkncyBpbnR1aXRpdmUgXCJyZWxhdGl2ZVxuICAgICAgICAgICAgLy8gdG8gbXkgcHJvamVjdFwiIGludGVycHJldGF0aW9uIGlzIHdoYXQgdGhlIGNoZWNrIGVuZm9yY2VzLlxuICAgICAgICAgICAgY29uc3QgYWJzb2x1dGVTYXZlUGF0aCA9IHBhdGguaXNBYnNvbHV0ZShzYXZlUGF0aClcbiAgICAgICAgICAgICAgICA/IHNhdmVQYXRoXG4gICAgICAgICAgICAgICAgOiBwYXRoLnJlc29sdmUocHJvamVjdFBhdGgsIHNhdmVQYXRoKTtcbiAgICAgICAgICAgIGNvbnN0IHBhcmVudCA9IHBhdGguZGlybmFtZShhYnNvbHV0ZVNhdmVQYXRoKTtcbiAgICAgICAgICAgIC8vIFBhcmVudCBtdXN0IGFscmVhZHkgZXhpc3QgZm9yIHJlYWxwYXRoOyBpZiBpdCBkb2Vzbid0LCB0aGVcbiAgICAgICAgICAgIC8vIHdyaXRlIHdvdWxkIGZhaWwgYW55d2F5LCBidXQgcmV0dXJuIGEgY2xlYXJlciBlcnJvciBoZXJlLlxuICAgICAgICAgICAgbGV0IHJlYWxQYXJlbnQ6IHN0cmluZztcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgcmVhbFBhcmVudCA9IHJlc29sdmVSZWFsKHBhcmVudCk7XG4gICAgICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGBzYXZlUGF0aCBwYXJlbnQgZGlyIG1pc3Npbmcgb3IgdW5yZWFkYWJsZTogJHtlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycil9YCB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gdjIuOS54IHBvbGlzaCAoQ29kZXggcjIgc2luZ2xlLfCfn6EgZnJvbSB2Mi44LjEgcmV2aWV3KTogc2FtZVxuICAgICAgICAgICAgLy8gcGF0aC5yZWxhdGl2ZS1iYXNlZCBjb250YWlubWVudCBhcyByZXNvbHZlQXV0b0NhcHR1cmVGaWxlLlxuICAgICAgICAgICAgaWYgKCFpc1BhdGhXaXRoaW5Sb290KHJlYWxQYXJlbnQsIHJlYWxQcm9qZWN0Um9vdCkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICBvazogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIGVycm9yOiBgc2F2ZVBhdGggcmVzb2x2ZWQgb3V0c2lkZSB0aGUgcHJvamVjdCByb290OiAke3BhdGgucmVzb2x2ZShyZWFsUGFyZW50KX0gbm90IHdpdGhpbiAke3BhdGgucmVzb2x2ZShyZWFsUHJvamVjdFJvb3QpfS4gVXNlIGEgcGF0aCBpbnNpZGUgPHByb2plY3Q+LyBvciBvbWl0IHNhdmVQYXRoIHRvIGF1dG8tbmFtZSBpbnRvIDxwcm9qZWN0Pi90ZW1wL21jcC1jYXB0dXJlcy5gLFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4geyBvazogdHJ1ZSwgcmVzb2x2ZWRQYXRoOiBhYnNvbHV0ZVNhdmVQYXRoIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBgc2F2ZVBhdGggcmVhbHBhdGggZmFpbGVkOiAke2Vycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKX1gIH07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHNjcmVlbnNob3RJbXBsKHNhdmVQYXRoPzogc3RyaW5nLCB3aW5kb3dUaXRsZT86IHN0cmluZywgaW5jbHVkZUJhc2U2NDogYm9vbGVhbiA9IGZhbHNlKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgbGV0IGZpbGVQYXRoID0gc2F2ZVBhdGg7XG4gICAgICAgIGlmICghZmlsZVBhdGgpIHtcbiAgICAgICAgICAgIGNvbnN0IHJlc29sdmVkID0gdGhpcy5yZXNvbHZlQXV0b0NhcHR1cmVGaWxlKGBzY3JlZW5zaG90LSR7RGF0ZS5ub3coKX0ucG5nYCk7XG4gICAgICAgICAgICBpZiAoIXJlc29sdmVkLm9rKSByZXR1cm4gZmFpbChyZXNvbHZlZC5lcnJvcik7XG4gICAgICAgICAgICBmaWxlUGF0aCA9IHJlc29sdmVkLmZpbGVQYXRoO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gdjIuOC4xIHJvdW5kLTEgZml4IChHZW1pbmkg8J+UtCArIENvZGV4IPCfn6EpOiBleHBsaWNpdCBzYXZlUGF0aFxuICAgICAgICAgICAgLy8gYWxzbyBnZXRzIGNvbnRhaW5tZW50LWNoZWNrZWQuIEFJLWdlbmVyYXRlZCBwYXRocyBjb3VsZFxuICAgICAgICAgICAgLy8gb3RoZXJ3aXNlIHdyaXRlIG91dHNpZGUgdGhlIHByb2plY3Qgcm9vdC5cbiAgICAgICAgICAgIC8vIHYyLjguMiByZXRlc3QgZml4OiB1c2UgdGhlIGhlbHBlcidzIHJlc29sdmVkUGF0aCBzbyBhXG4gICAgICAgICAgICAvLyByZWxhdGl2ZSBzYXZlUGF0aCBhY3R1YWxseSBsYW5kcyBpbnNpZGUgdGhlIHByb2plY3Qgcm9vdC5cbiAgICAgICAgICAgIGNvbnN0IGd1YXJkID0gdGhpcy5hc3NlcnRTYXZlUGF0aFdpdGhpblByb2plY3QoZmlsZVBhdGgpO1xuICAgICAgICAgICAgaWYgKCFndWFyZC5vaykgcmV0dXJuIGZhaWwoZ3VhcmQuZXJyb3IpO1xuICAgICAgICAgICAgZmlsZVBhdGggPSBndWFyZC5yZXNvbHZlZFBhdGg7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qgd2luID0gdGhpcy5waWNrV2luZG93KHdpbmRvd1RpdGxlKTtcbiAgICAgICAgY29uc3QgaW1hZ2UgPSBhd2FpdCB3aW4ud2ViQ29udGVudHMuY2FwdHVyZVBhZ2UoKTtcbiAgICAgICAgY29uc3QgcG5nOiBCdWZmZXIgPSBpbWFnZS50b1BORygpO1xuICAgICAgICBmcy53cml0ZUZpbGVTeW5jKGZpbGVQYXRoLCBwbmcpO1xuICAgICAgICBjb25zdCBkYXRhOiBhbnkgPSB7XG4gICAgICAgICAgICBmaWxlUGF0aCxcbiAgICAgICAgICAgIHNpemU6IHBuZy5sZW5ndGgsXG4gICAgICAgICAgICB3aW5kb3dUaXRsZTogdHlwZW9mIHdpbi5nZXRUaXRsZSA9PT0gJ2Z1bmN0aW9uJyA/IHdpbi5nZXRUaXRsZSgpIDogJycsXG4gICAgICAgIH07XG4gICAgICAgIGlmIChpbmNsdWRlQmFzZTY0KSB7XG4gICAgICAgICAgICBkYXRhLmRhdGFVcmkgPSBgZGF0YTppbWFnZS9wbmc7YmFzZTY0LCR7cG5nLnRvU3RyaW5nKCdiYXNlNjQnKX1gO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBvayhkYXRhLCBgU2NyZWVuc2hvdCBzYXZlZCB0byAke2ZpbGVQYXRofWApO1xuICAgIH1cblxuICAgIC8vIHYyLjcuMCAjNDogUHJldmlldy13aW5kb3cgc2NyZWVuc2hvdC5cbiAgICAvLyB2Mi44LjMgVC1WMjgzLTE6IGV4dGVuZGVkIHRvIGhhbmRsZSBjb2NvcyBlbWJlZGRlZCBwcmV2aWV3IG1vZGUuXG4gICAgLy9cbiAgICAvLyBNb2RlIGRpc3BhdGNoOlxuICAgIC8vICAgLSBcIndpbmRvd1wiOiAgIHJlcXVpcmUgYSBQcmV2aWV3LXRpdGxlZCBCcm93c2VyV2luZG93OyBmYWlsIGlmIG5vbmUuXG4gICAgLy8gICAgICAgICAgICAgICAgIE9yaWdpbmFsIHYyLjcuMCBiZWhhdmlvdXIuIFVzZSB3aGVuIGNvY29zIHByZXZpZXdcbiAgICAvLyAgICAgICAgICAgICAgICAgY29uZmlnIGlzIFwid2luZG93XCIgLyBcInNpbXVsYXRvclwiIChzZXBhcmF0ZSB3aW5kb3cpLlxuICAgIC8vICAgLSBcImVtYmVkZGVkXCI6IHNraXAgdGhlIHdpbmRvdyBwcm9iZSBhbmQgY2FwdHVyZSB0aGUgbWFpbiBlZGl0b3JcbiAgICAvLyAgICAgICAgICAgICAgICAgQnJvd3NlcldpbmRvdyBkaXJlY3RseS4gVXNlIHdoZW4gY29jb3MgcHJldmlldyBjb25maWdcbiAgICAvLyAgICAgICAgICAgICAgICAgaXMgXCJlbWJlZGRlZFwiIChnYW1ldmlldyByZW5kZXJzIGluc2lkZSBtYWluIGVkaXRvcikuXG4gICAgLy8gICAtIFwiYXV0b1wiOiAgICAgdHJ5IFwid2luZG93XCIgZmlyc3Q7IGlmIG5vIFByZXZpZXctdGl0bGVkIHdpbmRvdyBpc1xuICAgIC8vICAgICAgICAgICAgICAgICBmb3VuZCwgZmFsbCBiYWNrIHRvIFwiZW1iZWRkZWRcIiBhbmQgc3VyZmFjZSBhIGhpbnRcbiAgICAvLyAgICAgICAgICAgICAgICAgaW4gdGhlIHJlc3BvbnNlIG1lc3NhZ2UuIERlZmF1bHQg4oCUIGtlZXBzIHRoZSBoYXBweVxuICAgIC8vICAgICAgICAgICAgICAgICBwYXRoIHdvcmtpbmcgd2l0aG91dCBjYWxsZXIga25vd2xlZGdlIG9mIGNvY29zXG4gICAgLy8gICAgICAgICAgICAgICAgIHByZXZpZXcgY29uZmlnLlxuICAgIC8vXG4gICAgLy8gQnJvd3Nlci1tb2RlIChQSUUgcmVuZGVyZWQgdG8gdXNlcidzIGV4dGVybmFsIGJyb3dzZXIgdmlhXG4gICAgLy8gc2hlbGwub3BlbkV4dGVybmFsKSBpcyBOT1QgY2FwdHVyYWJsZSBoZXJlIOKAlCB0aGUgcGFnZSBsaXZlcyBpblxuICAgIC8vIGEgbm9uLUVsZWN0cm9uIGJyb3dzZXIgcHJvY2Vzcy4gQUkgY2FuIGRldGVjdCB0aGlzIHZpYVxuICAgIC8vIGRlYnVnX2dldF9wcmV2aWV3X21vZGUgYW5kIHNraXAgdGhlIGNhbGwuXG4gICAgcHJpdmF0ZSBhc3luYyBjYXB0dXJlUHJldmlld1NjcmVlbnNob3RJbXBsKFxuICAgICAgICBzYXZlUGF0aD86IHN0cmluZyxcbiAgICAgICAgbW9kZTogJ2F1dG8nIHwgJ3dpbmRvdycgfCAnZW1iZWRkZWQnID0gJ2F1dG8nLFxuICAgICAgICB3aW5kb3dUaXRsZTogc3RyaW5nID0gJ1ByZXZpZXcnLFxuICAgICAgICBpbmNsdWRlQmFzZTY0OiBib29sZWFuID0gZmFsc2UsXG4gICAgKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby12YXItcmVxdWlyZXNcbiAgICAgICAgY29uc3QgZWxlY3Ryb24gPSByZXF1aXJlKCdlbGVjdHJvbicpO1xuICAgICAgICBjb25zdCBCVyA9IGVsZWN0cm9uLkJyb3dzZXJXaW5kb3c7XG5cbiAgICAgICAgICAgIC8vIFJlc29sdmUgdGhlIHRhcmdldCB3aW5kb3cgcGVyIG1vZGUuXG4gICAgICAgIGNvbnN0IHByb2JlV2luZG93TW9kZSA9ICgpOiB7IG9rOiB0cnVlOyB3aW46IGFueSB9IHwgeyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmc7IHZpc2libGVUaXRsZXM6IHN0cmluZ1tdIH0gPT4ge1xuICAgICAgICAgICAgLy8gdjIuNy4xIHJldmlldyBmaXggKGNsYXVkZSDwn5+hICsgY29kZXgg8J+foSk6IHdpdGggdGhlIGRlZmF1bHRcbiAgICAgICAgICAgIC8vIHdpbmRvd1RpdGxlPSdQcmV2aWV3JyBhIENoaW5lc2UgLyBsb2NhbGl6ZWQgY29jb3MgZWRpdG9yXG4gICAgICAgICAgICAvLyB3aG9zZSBtYWluIHdpbmRvdyB0aXRsZSBjb250YWlucyBcIlByZXZpZXdcIiAoZS5nLiBcIkNvY29zXG4gICAgICAgICAgICAvLyBDcmVhdG9yIFByZXZpZXcgLSA8UHJvamVjdE5hbWU+XCIpIHdvdWxkIGZhbHNlbHkgbWF0Y2guXG4gICAgICAgICAgICAvLyBEaXNhbWJpZ3VhdGUgYnkgZXhjbHVkaW5nIGFueSB0aXRsZSB0aGF0IEFMU08gY29udGFpbnNcbiAgICAgICAgICAgIC8vIFwiQ29jb3MgQ3JlYXRvclwiIHdoZW4gdGhlIGNhbGxlciBzdHVjayB3aXRoIHRoZSBkZWZhdWx0LlxuICAgICAgICAgICAgY29uc3QgdXNpbmdEZWZhdWx0ID0gd2luZG93VGl0bGUgPT09ICdQcmV2aWV3JztcbiAgICAgICAgICAgIGNvbnN0IGFsbFRpdGxlczogc3RyaW5nW10gPSBCVz8uZ2V0QWxsV2luZG93cz8uKCk/Lm1hcCgodzogYW55KSA9PiB3LmdldFRpdGxlPy4oKSA/PyAnJykuZmlsdGVyKEJvb2xlYW4pID8/IFtdO1xuICAgICAgICAgICAgY29uc3QgbWF0Y2hlcyA9IEJXPy5nZXRBbGxXaW5kb3dzPy4oKT8uZmlsdGVyKCh3OiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoIXcgfHwgdy5pc0Rlc3Ryb3llZCgpKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgY29uc3QgdGl0bGUgPSB3LmdldFRpdGxlPy4oKSB8fCAnJztcbiAgICAgICAgICAgICAgICBpZiAoIXRpdGxlLmluY2x1ZGVzKHdpbmRvd1RpdGxlKSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIGlmICh1c2luZ0RlZmF1bHQgJiYgL0NvY29zXFxzKkNyZWF0b3IvaS50ZXN0KHRpdGxlKSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfSkgPz8gW107XG4gICAgICAgICAgICBpZiAobWF0Y2hlcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBgTm8gRWxlY3Ryb24gd2luZG93IHRpdGxlIGNvbnRhaW5zIFwiJHt3aW5kb3dUaXRsZX1cIiR7dXNpbmdEZWZhdWx0ID8gJyAoYW5kIGlzIG5vdCB0aGUgbWFpbiBlZGl0b3IpJyA6ICcnfS5gLCB2aXNpYmxlVGl0bGVzOiBhbGxUaXRsZXMgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB7IG9rOiB0cnVlLCB3aW46IG1hdGNoZXNbMF0gfTtcbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCBwcm9iZUVtYmVkZGVkTW9kZSA9ICgpOiB7IG9rOiB0cnVlOyB3aW46IGFueSB9IHwgeyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmcgfSA9PiB7XG4gICAgICAgICAgICAvLyBFbWJlZGRlZCBQSUUgcmVuZGVycyBpbnNpZGUgdGhlIG1haW4gZWRpdG9yIEJyb3dzZXJXaW5kb3cuXG4gICAgICAgICAgICAvLyBQaWNrIHRoZSBzYW1lIGhldXJpc3RpYyBhcyBwaWNrV2luZG93KCk6IHByZWZlciBhIG5vbi1cbiAgICAgICAgICAgIC8vIFByZXZpZXcgd2luZG93LiBDb2NvcyBtYWluIGVkaXRvcidzIHRpdGxlIHR5cGljYWxseVxuICAgICAgICAgICAgLy8gY29udGFpbnMgXCJDb2NvcyBDcmVhdG9yXCIg4oCUIG1hdGNoIHRoYXQgdG8gaWRlbnRpZnkgaXQuXG4gICAgICAgICAgICBjb25zdCBhbGw6IGFueVtdID0gQlc/LmdldEFsbFdpbmRvd3M/LigpPy5maWx0ZXIoKHc6IGFueSkgPT4gdyAmJiAhdy5pc0Rlc3Ryb3llZCgpKSA/PyBbXTtcbiAgICAgICAgICAgIGlmIChhbGwubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogJ05vIGxpdmUgRWxlY3Ryb24gd2luZG93cyBhdmFpbGFibGU7IGNhbm5vdCBjYXB0dXJlIGVtYmVkZGVkIHByZXZpZXcuJyB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gUHJlZmVyIHRoZSBlZGl0b3IgbWFpbiB3aW5kb3cgKHRpdGxlIGNvbnRhaW5zIFwiQ29jb3NcbiAgICAgICAgICAgIC8vIENyZWF0b3JcIikg4oCUIHRoYXQncyB3aGVyZSBlbWJlZGRlZCBQSUUgcmVuZGVycy5cbiAgICAgICAgICAgIGNvbnN0IGVkaXRvciA9IGFsbC5maW5kKCh3OiBhbnkpID0+IC9Db2Nvc1xccypDcmVhdG9yL2kudGVzdCh3LmdldFRpdGxlPy4oKSB8fCAnJykpO1xuICAgICAgICAgICAgaWYgKGVkaXRvcikgcmV0dXJuIHsgb2s6IHRydWUsIHdpbjogZWRpdG9yIH07XG4gICAgICAgICAgICAvLyBGYWxsYmFjazogYW55IG5vbi1EZXZUb29scyAvIG5vbi1Xb3JrZXIgLyBub24tQmxhbmsgd2luZG93LlxuICAgICAgICAgICAgY29uc3QgY2FuZGlkYXRlID0gYWxsLmZpbmQoKHc6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHQgPSB3LmdldFRpdGxlPy4oKSB8fCAnJztcbiAgICAgICAgICAgICAgICByZXR1cm4gdCAmJiAhL0RldlRvb2xzfFdvcmtlciAtfF5CbGFuayQvLnRlc3QodCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGlmIChjYW5kaWRhdGUpIHJldHVybiB7IG9rOiB0cnVlLCB3aW46IGNhbmRpZGF0ZSB9O1xuICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogJ05vIHN1aXRhYmxlIGVkaXRvciB3aW5kb3cgZm91bmQgZm9yIGVtYmVkZGVkIHByZXZpZXcgY2FwdHVyZS4nIH07XG4gICAgICAgIH07XG5cbiAgICAgICAgbGV0IHdpbjogYW55ID0gbnVsbDtcbiAgICAgICAgbGV0IGNhcHR1cmVOb3RlOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgICAgICAgbGV0IHJlc29sdmVkTW9kZTogJ3dpbmRvdycgfCAnZW1iZWRkZWQnID0gJ3dpbmRvdyc7XG5cbiAgICAgICAgaWYgKG1vZGUgPT09ICd3aW5kb3cnKSB7XG4gICAgICAgICAgICBjb25zdCByID0gcHJvYmVXaW5kb3dNb2RlKCk7XG4gICAgICAgICAgICBpZiAoIXIub2spIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFpbChgJHtyLmVycm9yfSBMYXVuY2ggY29jb3MgcHJldmlldyBmaXJzdCB2aWEgdGhlIHRvb2xiYXIgcGxheSBidXR0b24gb3IgdmlhIGRlYnVnX3ByZXZpZXdfdXJsKGFjdGlvbj1cIm9wZW5cIikuIElmIHlvdXIgY29jb3MgcHJldmlldyBpcyBzZXQgdG8gXCJlbWJlZGRlZFwiLCBjYWxsIHRoaXMgdG9vbCB3aXRoIG1vZGU9XCJlbWJlZGRlZFwiIG9yIG1vZGU9XCJhdXRvXCIuIFZpc2libGUgd2luZG93IHRpdGxlczogJHtyLnZpc2libGVUaXRsZXMuam9pbignLCAnKSB8fCAnKG5vbmUpJ31gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHdpbiA9IHIud2luO1xuICAgICAgICAgICAgcmVzb2x2ZWRNb2RlID0gJ3dpbmRvdyc7XG4gICAgICAgIH0gZWxzZSBpZiAobW9kZSA9PT0gJ2VtYmVkZGVkJykge1xuICAgICAgICAgICAgY29uc3QgciA9IHByb2JlRW1iZWRkZWRNb2RlKCk7XG4gICAgICAgICAgICBpZiAoIXIub2spIHJldHVybiBmYWlsKHIuZXJyb3IpO1xuICAgICAgICAgICAgd2luID0gci53aW47XG4gICAgICAgICAgICByZXNvbHZlZE1vZGUgPSAnZW1iZWRkZWQnO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gYXV0b1xuICAgICAgICAgICAgY29uc3Qgd3IgPSBwcm9iZVdpbmRvd01vZGUoKTtcbiAgICAgICAgICAgIGlmICh3ci5vaykge1xuICAgICAgICAgICAgICAgIHdpbiA9IHdyLndpbjtcbiAgICAgICAgICAgICAgICByZXNvbHZlZE1vZGUgPSAnd2luZG93JztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZXIgPSBwcm9iZUVtYmVkZGVkTW9kZSgpO1xuICAgICAgICAgICAgICAgIGlmICghZXIub2spIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoYCR7d3IuZXJyb3J9ICR7ZXIuZXJyb3J9IExhdW5jaCBjb2NvcyBwcmV2aWV3IGZpcnN0IG9yIGNoZWNrIGRlYnVnX2dldF9wcmV2aWV3X21vZGUgdG8gc2VlIGhvdyBjb2NvcyBpcyBjb25maWd1cmVkLiBWaXNpYmxlIHdpbmRvdyB0aXRsZXM6ICR7d3IudmlzaWJsZVRpdGxlcy5qb2luKCcsICcpIHx8ICcobm9uZSknfWApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB3aW4gPSBlci53aW47XG4gICAgICAgICAgICAgICAgcmVzb2x2ZWRNb2RlID0gJ2VtYmVkZGVkJztcbiAgICAgICAgICAgICAgICAgICAgLy8gdjIuOC40IHJldGVzdCBmaW5kaW5nOiB3aGVuIGNvY29zIHByZXZpZXcgaXMgc2V0XG4gICAgICAgICAgICAgICAgICAgIC8vIHRvIFwiYnJvd3NlclwiLCBhdXRvLWZhbGxiYWNrIEFMU08gZ3JhYnMgdGhlIG1haW5cbiAgICAgICAgICAgICAgICAgICAgLy8gZWRpdG9yIHdpbmRvdyAoYmVjYXVzZSBubyBQcmV2aWV3LXRpdGxlZCB3aW5kb3dcbiAgICAgICAgICAgICAgICAgICAgLy8gZXhpc3RzKSDigJQgYnV0IGluIGJyb3dzZXIgbW9kZSB0aGUgYWN0dWFsIGdhbWV2aWV3XG4gICAgICAgICAgICAgICAgICAgIC8vIGxpdmVzIGluIHRoZSB1c2VyJ3MgZXh0ZXJuYWwgYnJvd3NlciwgTk9UIGluIHRoZVxuICAgICAgICAgICAgICAgICAgICAvLyBjYXB0dXJlZCBFbGVjdHJvbiB3aW5kb3cuIERvbid0IGNsYWltIFwiZW1iZWRkZWRcbiAgICAgICAgICAgICAgICAgICAgLy8gcHJldmlldyBtb2RlXCIg4oCUIHRoYXQncyBhIGd1ZXNzLCBhbmQgd3Jvbmcgd2hlblxuICAgICAgICAgICAgICAgICAgICAvLyB1c2VyIGlzIG9uIGJyb3dzZXIgY29uZmlnLiBQcm9iZSB0aGUgcmVhbCBjb25maWdcbiAgICAgICAgICAgICAgICAgICAgLy8gYW5kIHRhaWxvciB0aGUgaGludCBwZXIgbW9kZS5cbiAgICAgICAgICAgICAgICBsZXQgYWN0dWFsTW9kZTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY2ZnOiBhbnkgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KFxuICAgICAgICAgICAgICAgICAgICAgICAgJ3ByZWZlcmVuY2VzJywgJ3F1ZXJ5LWNvbmZpZycgYXMgYW55LCAncHJldmlldycgYXMgYW55LFxuICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBwbGF0Zm9ybSA9IGNmZz8ucHJldmlldz8uY3VycmVudD8ucGxhdGZvcm07XG4gICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgcGxhdGZvcm0gPT09ICdzdHJpbmcnKSBhY3R1YWxNb2RlID0gcGxhdGZvcm07XG4gICAgICAgICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICAgICAgICAgIC8vIGJlc3QtZWZmb3J0OyBmYWxsIHRocm91Z2ggd2l0aCBuZXV0cmFsIGhpbnRcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKGFjdHVhbE1vZGUgPT09ICdicm93c2VyJykge1xuICAgICAgICAgICAgICAgICAgICBjYXB0dXJlTm90ZSA9ICdObyBQcmV2aWV3LXRpdGxlZCB3aW5kb3cgZm91bmQ7IGNhcHR1cmVkIHRoZSBtYWluIGVkaXRvciB3aW5kb3cuIE5PVEU6IGNvY29zIHByZXZpZXcgaXMgc2V0IHRvIFwiYnJvd3NlclwiIOKAlCB0aGUgYWN0dWFsIHByZXZpZXcgY29udGVudCBpcyByZW5kZXJlZCBpbiB5b3VyIGV4dGVybmFsIGJyb3dzZXIgKE5PVCBpbiB0aGlzIGltYWdlKS4gRm9yIHJ1bnRpbWUgY2FudmFzIGNhcHR1cmUgaW4gYnJvd3NlciBtb2RlIHVzZSBkZWJ1Z19nYW1lX2NvbW1hbmQodHlwZT1cInNjcmVlbnNob3RcIikgdmlhIGEgR2FtZURlYnVnQ2xpZW50IHJ1bm5pbmcgb24gdGhlIGJyb3dzZXIgcHJldmlldyBwYWdlLic7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChhY3R1YWxNb2RlID09PSAnZ2FtZVZpZXcnKSB7XG4gICAgICAgICAgICAgICAgICAgIGNhcHR1cmVOb3RlID0gJ05vIFByZXZpZXctdGl0bGVkIHdpbmRvdyBmb3VuZDsgY2FwdHVyZWQgdGhlIG1haW4gZWRpdG9yIHdpbmRvdyAoY29jb3MgcHJldmlldyBpcyBzZXQgdG8gXCJnYW1lVmlld1wiIGVtYmVkZGVkIOKAlCB0aGUgZWRpdG9yIGdhbWV2aWV3IElTIHdoZXJlIHByZXZpZXcgcmVuZGVycywgc28gdGhpcyBpbWFnZSBpcyBjb3JyZWN0KS4nO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoYWN0dWFsTW9kZSkge1xuICAgICAgICAgICAgICAgICAgICBjYXB0dXJlTm90ZSA9IGBObyBQcmV2aWV3LXRpdGxlZCB3aW5kb3cgZm91bmQ7IGNhcHR1cmVkIHRoZSBtYWluIGVkaXRvciB3aW5kb3cuIGNvY29zIHByZXZpZXcgaXMgc2V0IHRvIFwiJHthY3R1YWxNb2RlfVwiIOKAlCB2ZXJpZnkgdGhpcyBpbWFnZSBhY3R1YWxseSBjb250YWlucyB0aGUgZ2FtZXZpZXcgeW91IHdhbnRlZDsgZm9yIHJ1bnRpbWUgY2FudmFzIGNhcHR1cmUgcHJlZmVyIGRlYnVnX2dhbWVfY29tbWFuZCB2aWEgR2FtZURlYnVnQ2xpZW50LmA7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgY2FwdHVyZU5vdGUgPSAnTm8gUHJldmlldy10aXRsZWQgd2luZG93IGZvdW5kOyBjYXB0dXJlZCB0aGUgbWFpbiBlZGl0b3Igd2luZG93LiBDb3VsZCBub3QgZGV0ZXJtaW5lIGNvY29zIHByZXZpZXcgbW9kZSAoZGVidWdfZ2V0X3ByZXZpZXdfbW9kZSBtaWdodCBnaXZlIG1vcmUgaW5mbykuIElmIHlvdXIgY29jb3MgcHJldmlldyBpcyBzZXQgdG8gXCJicm93c2VyXCIsIHRoZSBhY3R1YWwgcHJldmlldyBjb250ZW50IGlzIGluIHlvdXIgZXh0ZXJuYWwgYnJvd3NlciBhbmQgaXMgTk9UIGluIHRoaXMgaW1hZ2UuJztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgZmlsZVBhdGggPSBzYXZlUGF0aDtcbiAgICAgICAgaWYgKCFmaWxlUGF0aCkge1xuICAgICAgICAgICAgY29uc3QgcmVzb2x2ZWQgPSB0aGlzLnJlc29sdmVBdXRvQ2FwdHVyZUZpbGUoYHByZXZpZXctJHtEYXRlLm5vdygpfS5wbmdgKTtcbiAgICAgICAgICAgIGlmICghcmVzb2x2ZWQub2spIHJldHVybiBmYWlsKHJlc29sdmVkLmVycm9yKTtcbiAgICAgICAgICAgIGZpbGVQYXRoID0gcmVzb2x2ZWQuZmlsZVBhdGg7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyB2Mi44LjEgcm91bmQtMSBmaXggKEdlbWluaSDwn5S0ICsgQ29kZXgg8J+foSk6IGV4cGxpY2l0IHNhdmVQYXRoXG4gICAgICAgICAgICAvLyBhbHNvIGdldHMgY29udGFpbm1lbnQtY2hlY2tlZC5cbiAgICAgICAgICAgIC8vIHYyLjguMiByZXRlc3QgZml4OiB1c2UgcmVzb2x2ZWRQYXRoIGZvciByZWxhdGl2ZS1wYXRoIHN1cHBvcnQuXG4gICAgICAgICAgICBjb25zdCBndWFyZCA9IHRoaXMuYXNzZXJ0U2F2ZVBhdGhXaXRoaW5Qcm9qZWN0KGZpbGVQYXRoKTtcbiAgICAgICAgICAgIGlmICghZ3VhcmQub2spIHJldHVybiBmYWlsKGd1YXJkLmVycm9yKTtcbiAgICAgICAgICAgIGZpbGVQYXRoID0gZ3VhcmQucmVzb2x2ZWRQYXRoO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGltYWdlID0gYXdhaXQgd2luLndlYkNvbnRlbnRzLmNhcHR1cmVQYWdlKCk7XG4gICAgICAgIGNvbnN0IHBuZzogQnVmZmVyID0gaW1hZ2UudG9QTkcoKTtcbiAgICAgICAgZnMud3JpdGVGaWxlU3luYyhmaWxlUGF0aCwgcG5nKTtcbiAgICAgICAgY29uc3QgZGF0YTogYW55ID0ge1xuICAgICAgICAgICAgZmlsZVBhdGgsXG4gICAgICAgICAgICBzaXplOiBwbmcubGVuZ3RoLFxuICAgICAgICAgICAgd2luZG93VGl0bGU6IHR5cGVvZiB3aW4uZ2V0VGl0bGUgPT09ICdmdW5jdGlvbicgPyB3aW4uZ2V0VGl0bGUoKSA6ICcnLFxuICAgICAgICAgICAgbW9kZTogcmVzb2x2ZWRNb2RlLFxuICAgICAgICB9O1xuICAgICAgICBpZiAoY2FwdHVyZU5vdGUpIGRhdGEubm90ZSA9IGNhcHR1cmVOb3RlO1xuICAgICAgICBpZiAoaW5jbHVkZUJhc2U2NCkge1xuICAgICAgICAgICAgZGF0YS5kYXRhVXJpID0gYGRhdGE6aW1hZ2UvcG5nO2Jhc2U2NCwke3BuZy50b1N0cmluZygnYmFzZTY0Jyl9YDtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBtZXNzYWdlID0gY2FwdHVyZU5vdGVcbiAgICAgICAgICAgID8gYFByZXZpZXcgc2NyZWVuc2hvdCBzYXZlZCB0byAke2ZpbGVQYXRofSAoJHtjYXB0dXJlTm90ZX0pYFxuICAgICAgICAgICAgOiBgUHJldmlldyBzY3JlZW5zaG90IHNhdmVkIHRvICR7ZmlsZVBhdGh9IChtb2RlPSR7cmVzb2x2ZWRNb2RlfSlgO1xuICAgICAgICByZXR1cm4gb2soZGF0YSwgbWVzc2FnZSk7XG4gICAgfVxuXG4gICAgLy8gdjIuOC4zIFQtVjI4My0yOiByZWFkIGNvY29zIHByZXZpZXcgY29uZmlnIHNvIEFJIGNhbiByb3V0ZVxuICAgIC8vIGNhcHR1cmVfcHJldmlld19zY3JlZW5zaG90IHRvIHRoZSBjb3JyZWN0IG1vZGUgd2l0aG91dCBndWVzc2luZy5cbiAgICAvLyBSZWFkcyB2aWEgRWRpdG9yLk1lc3NhZ2UgcHJlZmVyZW5jZXMvcXVlcnktY29uZmlnICh0eXBlZCBpblxuICAgIC8vIG5vZGVfbW9kdWxlcy9AY29jb3MvY3JlYXRvci10eXBlcy8uLi4vcHJlZmVyZW5jZXMvQHR5cGVzL21lc3NhZ2UuZC50cykuXG4gICAgLy9cbiAgICAvLyBXZSBkdW1wIHRoZSBmdWxsICdwcmV2aWV3JyBjYXRlZ29yeSwgdGhlbiB0cnkgdG8gaW50ZXJwcmV0IGEgZmV3XG4gICAgLy8gY29tbW9uIGtleXMgKCdvcGVuX3ByZXZpZXdfd2l0aCcsICdwcmV2aWV3X3dpdGgnLCAnc2ltdWxhdG9yJyxcbiAgICAvLyAnYnJvd3NlcicpIGludG8gYSBub3JtYWxpemVkIG1vZGUgbGFiZWwuIElmIGludGVycHJldGF0aW9uIGZhaWxzLFxuICAgIC8vIHdlIHN0aWxsIHJldHVybiB0aGUgcmF3IGNvbmZpZyBzbyB0aGUgQUkgY2FuIHJlYWQgaXQgZGlyZWN0bHkuXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRQcmV2aWV3TW9kZUltcGwoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIFByb2JlIGF0IG1vZHVsZSBsZXZlbCAobm8ga2V5KSB0byBnZXQgdGhlIHdob2xlIGNhdGVnb3J5LlxuICAgICAgICAgICAgY29uc3QgcmF3OiBhbnkgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdwcmVmZXJlbmNlcycsICdxdWVyeS1jb25maWcnIGFzIGFueSwgJ3ByZXZpZXcnIGFzIGFueSkgYXMgYW55O1xuICAgICAgICAgICAgaWYgKHJhdyA9PT0gdW5kZWZpbmVkIHx8IHJhdyA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKCdwcmVmZXJlbmNlcy9xdWVyeS1jb25maWcgcmV0dXJuZWQgbnVsbCBmb3IgXCJwcmV2aWV3XCIg4oCUIGNvY29zIG1heSBub3QgZXhwb3NlIHRoaXMgY2F0ZWdvcnksIG9yIHlvdXIgYnVpbGQgZGlmZmVycyBmcm9tIDMuOC54LicpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gSGV1cmlzdGljIGludGVycHJldGF0aW9uLlxuICAgICAgICAgICAgLy8gdjIuOC4zIHJldGVzdCBmaW5kaW5nOiBjb2NvcyAzLjguNyBhY3R1YWxseSBzdG9yZXMgdGhlXG4gICAgICAgICAgICAvLyBhY3RpdmUgbW9kZSBhdCBgcHJldmlldy5jdXJyZW50LnBsYXRmb3JtYCB3aXRoIHZhbHVlXG4gICAgICAgICAgICAvLyBgXCJnYW1lVmlld1wiYCAoZW1iZWRkZWQpLCBgXCJicm93c2VyXCJgLCBvciBkZXZpY2UgbmFtZXNcbiAgICAgICAgICAgIC8vIChzaW11bGF0b3IpLiBUaGUgb3JpZ2luYWwgaGV1cmlzdGljIG9ubHkgY2hlY2tlZCBrZXlzIGxpa2VcbiAgICAgICAgICAgIC8vIGBvcGVuX3ByZXZpZXdfd2l0aGAgLyBgcHJldmlld193aXRoYCAvIGBvcGVuX3dpdGhgIC8gYG1vZGVgXG4gICAgICAgICAgICAvLyBhbmQgbWlzc2VkIHRoZSBsaXZlIGtleS4gUHJvYmUgYGN1cnJlbnQucGxhdGZvcm1gIGZpcnN0O1xuICAgICAgICAgICAgLy8ga2VlcCB0aGUgbGVnYWN5IGtleXMgYXMgZmFsbGJhY2sgZm9yIG9sZGVyIGNvY29zIHZlcnNpb25zLlxuICAgICAgICAgICAgY29uc3QgbG93ZXIgPSAoczogYW55KSA9PiAodHlwZW9mIHMgPT09ICdzdHJpbmcnID8gcy50b0xvd2VyQ2FzZSgpIDogJycpO1xuICAgICAgICAgICAgbGV0IGludGVycHJldGVkOiAnYnJvd3NlcicgfCAnd2luZG93JyB8ICdzaW11bGF0b3InIHwgJ2VtYmVkZGVkJyB8ICd1bmtub3duJyA9ICd1bmtub3duJztcbiAgICAgICAgICAgIGxldCBpbnRlcnByZXRlZEZyb21LZXk6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICAgICAgICAgICAgY29uc3QgY2xhc3NpZnkgPSAodjogc3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgbHYgPSBsb3dlcih2KTtcbiAgICAgICAgICAgICAgICBpZiAobHYuaW5jbHVkZXMoJ2Jyb3dzZXInKSkgcmV0dXJuICdicm93c2VyJztcbiAgICAgICAgICAgICAgICBpZiAobHYuaW5jbHVkZXMoJ3NpbXVsYXRvcicpKSByZXR1cm4gJ3NpbXVsYXRvcic7XG4gICAgICAgICAgICAgICAgaWYgKGx2LmluY2x1ZGVzKCdlbWJlZCcpIHx8IGx2LmluY2x1ZGVzKCdnYW1ldmlldycpIHx8IGx2LmluY2x1ZGVzKCdnYW1lX3ZpZXcnKSkgcmV0dXJuICdlbWJlZGRlZCc7XG4gICAgICAgICAgICAgICAgaWYgKGx2LmluY2x1ZGVzKCd3aW5kb3cnKSkgcmV0dXJuICd3aW5kb3cnO1xuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGNvbnN0IGRpZyA9IChvYmo6IGFueSwgcGF0aDogc3RyaW5nKTogYW55ID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoIW9iaiB8fCB0eXBlb2Ygb2JqICE9PSAnb2JqZWN0JykgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICBjb25zdCBwYXJ0cyA9IHBhdGguc3BsaXQoJy4nKTtcbiAgICAgICAgICAgICAgICBsZXQgY3VyOiBhbnkgPSBvYmo7XG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCBwIG9mIHBhcnRzKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICghY3VyIHx8IHR5cGVvZiBjdXIgIT09ICdvYmplY3QnKSByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgICAgICBpZiAocCBpbiBjdXIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGN1ciA9IGN1cltwXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIC8vIFRyeSBvbmUgbGV2ZWwgb2YgbmVzdCAoc29tZXRpbWVzIHRoZSBjYXRlZ29yeSBkdW1wXG4gICAgICAgICAgICAgICAgICAgIC8vIG5lc3RzIHVuZGVyIGEgZGVmYXVsdC1wcm90b2NvbCBidWNrZXQpLlxuICAgICAgICAgICAgICAgICAgICBsZXQgZm91bmQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChjb25zdCB2IG9mIE9iamVjdC52YWx1ZXMoY3VyKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHYgJiYgdHlwZW9mIHYgPT09ICdvYmplY3QnICYmIHAgaW4gKHYgYXMgYW55KSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGN1ciA9ICh2IGFzIGFueSlbcF07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZm91bmQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGlmICghZm91bmQpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBjdXI7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgY29uc3QgcHJvYmVLZXlzID0gW1xuICAgICAgICAgICAgICAgICdwcmV2aWV3LmN1cnJlbnQucGxhdGZvcm0nLFxuICAgICAgICAgICAgICAgICdjdXJyZW50LnBsYXRmb3JtJyxcbiAgICAgICAgICAgICAgICAncHJldmlldy5vcGVuX3ByZXZpZXdfd2l0aCcsXG4gICAgICAgICAgICAgICAgJ29wZW5fcHJldmlld193aXRoJyxcbiAgICAgICAgICAgICAgICAncHJldmlld193aXRoJyxcbiAgICAgICAgICAgICAgICAnb3Blbl93aXRoJyxcbiAgICAgICAgICAgICAgICAnbW9kZScsXG4gICAgICAgICAgICBdO1xuICAgICAgICAgICAgZm9yIChjb25zdCBrIG9mIHByb2JlS2V5cykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHYgPSBkaWcocmF3LCBrKTtcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHYgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNscyA9IGNsYXNzaWZ5KHYpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoY2xzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpbnRlcnByZXRlZCA9IGNscztcbiAgICAgICAgICAgICAgICAgICAgICAgIGludGVycHJldGVkRnJvbUtleSA9IGAke2t9PSR7dn1gO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgLy8gTm9uLWVtcHR5IHN0cmluZyB0aGF0IGRpZG4ndCBtYXRjaCBhIGtub3duIGxhYmVsIOKGklxuICAgICAgICAgICAgICAgICAgICAvLyByZWNvcmQgYXMgJ3NpbXVsYXRvcicgY2FuZGlkYXRlIGlmIGl0IGxvb2tzIGxpa2UgYVxuICAgICAgICAgICAgICAgICAgICAvLyBkZXZpY2UgbmFtZSAoZS5nLiBcIkFwcGxlIGlQaG9uZSAxNCBQcm9cIiksIG90aGVyd2lzZVxuICAgICAgICAgICAgICAgICAgICAvLyBrZWVwIHNlYXJjaGluZy5cbiAgICAgICAgICAgICAgICAgICAgaWYgKC9pUGhvbmV8aVBhZHxIVUFXRUl8WGlhb21pfFNvbnl8QXN1c3xPUFBPfEhvbm9yfE5va2lhfExlbm92b3xTYW1zdW5nfEdvb2dsZXxQaXhlbC9pLnRlc3QodikpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGludGVycHJldGVkID0gJ3NpbXVsYXRvcic7XG4gICAgICAgICAgICAgICAgICAgICAgICBpbnRlcnByZXRlZEZyb21LZXkgPSBgJHtrfT0ke3Z9YDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIG9rKHsgaW50ZXJwcmV0ZWQsIGludGVycHJldGVkRnJvbUtleSwgcmF3IH0sIGludGVycHJldGVkID09PSAndW5rbm93bidcbiAgICAgICAgICAgICAgICAgICAgPyAnUmVhZCBjb2NvcyBwcmV2aWV3IGNvbmZpZyBidXQgY291bGQgbm90IGludGVycHJldCBhIG1vZGUgbGFiZWw7IGluc3BlY3QgZGF0YS5yYXcgYW5kIHBhc3MgbW9kZT0gZXhwbGljaXRseSB0byBjYXB0dXJlX3ByZXZpZXdfc2NyZWVuc2hvdC4nXG4gICAgICAgICAgICAgICAgICAgIDogYGNvY29zIHByZXZpZXcgaXMgY29uZmlndXJlZCBhcyBcIiR7aW50ZXJwcmV0ZWR9XCIgKGZyb20ga2V5IFwiJHtpbnRlcnByZXRlZEZyb21LZXl9XCIpLiBQYXNzIG1vZGU9XCIke2ludGVycHJldGVkID09PSAnYnJvd3NlcicgPyAnd2luZG93JyA6IGludGVycHJldGVkfVwiIHRvIGNhcHR1cmVfcHJldmlld19zY3JlZW5zaG90LCBvciByZWx5IG9uIG1vZGU9XCJhdXRvXCIuYCk7XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChgcHJlZmVyZW5jZXMvcXVlcnktY29uZmlnICdwcmV2aWV3JyBmYWlsZWQ6ICR7ZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpfWApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gdjIuMTAgVC1WMjEwLTE6IGhhcmQtZmFpbCBieSBkZWZhdWx0LiBQZXIgY3Jvc3MtcmVwbyByZWZyZXNoXG4gICAgLy8gMjAyNi0wNS0wMiwgbm9uZSBvZiA2IHN1cnZleWVkIGNvY29zLW1jcCBwZWVycyBzaGlwIGEgd29ya2luZ1xuICAgIC8vIHByZXZpZXctbW9kZSBzZXR0ZXIg4oCUIHRoZSBjb2NvcyAzLjguNyBwcmV2aWV3IGNhdGVnb3J5IGlzXG4gICAgLy8gZWZmZWN0aXZlbHkgcmVhZG9ubHkgdG8gdGhpcmQtcGFydHkgZXh0ZW5zaW9ucyAobGFuZG1pbmUgIzE3KS5cbiAgICAvLyBEZWZhdWx0IGJlaGF2aW9yIGlzIG5vdyBOT1RfU1VQUE9SVEVEIHdpdGggYSBVSSByZWRpcmVjdC5cbiAgICAvL1xuICAgIC8vIFRoZSA0LXN0cmF0ZWd5IHByb2JlIGlzIHByZXNlcnZlZCBiZWhpbmQgYGF0dGVtcHRBbnl3YXk9dHJ1ZWBcbiAgICAvLyBzbyBhIGZ1dHVyZSBjb2NvcyBidWlsZCBjYW4gYmUgdmFsaWRhdGVkIHF1aWNrbHk6IHJlYWQgdGhlXG4gICAgLy8gcmV0dXJuZWQgZGF0YS5hdHRlbXB0cyBsb2cgdG8gc2VlIHdoZXRoZXIgYW55IHNoYXBlIG5vdyB3b3Jrcy5cbiAgICAvLyBUaGUgc2V0dGVyIGRvZXMgTk9UIGZyZWV6ZSB0aGUgZWRpdG9yIChzZXQtY29uZmlnIHNpbGVudGx5XG4gICAgLy8gbm8tb3BzLCBjZi4gcHJldmlld19jb250cm9sIHdoaWNoIERPRVMgZnJlZXplIOKAlCBsYW5kbWluZSAjMTYpLlxuICAgIC8vXG4gICAgLy8gU3RyYXRlZ2llcyB0cmllZCBpbiBvcmRlcjpcbiAgICAvLyAgIDEuICgncHJldmlldycsICdjdXJyZW50JywgeyBwbGF0Zm9ybTogdmFsdWUgfSkgIOKAlCBuZXN0ZWQgb2JqZWN0XG4gICAgLy8gICAyLiAoJ3ByZXZpZXcnLCAnY3VycmVudC5wbGF0Zm9ybScsIHZhbHVlLCAnZ2xvYmFsJykg4oCUIGV4cGxpY2l0IHByb3RvY29sXG4gICAgLy8gICAzLiAoJ3ByZXZpZXcnLCAnY3VycmVudC5wbGF0Zm9ybScsIHZhbHVlLCAnbG9jYWwnKSAg4oCUIGV4cGxpY2l0IHByb3RvY29sXG4gICAgLy8gICA0LiAoJ3ByZXZpZXcnLCAnY3VycmVudC5wbGF0Zm9ybScsIHZhbHVlKSAgICAgICAgICDigJQgbm8gcHJvdG9jb2xcbiAgICBwcml2YXRlIGFzeW5jIHNldFByZXZpZXdNb2RlSW1wbChtb2RlOiAnYnJvd3NlcicgfCAnZ2FtZVZpZXcnIHwgJ3NpbXVsYXRvcicsIGF0dGVtcHRBbnl3YXk6IGJvb2xlYW4pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcXVlcnlDdXJyZW50ID0gYXN5bmMgKCk6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4gPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGNmZzogYW55ID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgncHJlZmVyZW5jZXMnLCAncXVlcnktY29uZmlnJyBhcyBhbnksICdwcmV2aWV3JyBhcyBhbnkpIGFzIGFueTtcbiAgICAgICAgICAgICAgICByZXR1cm4gY2ZnPy5wcmV2aWV3Py5jdXJyZW50Py5wbGF0Zm9ybSA/PyBudWxsO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGNvbnN0IHByZXZpb3VzTW9kZSA9IGF3YWl0IHF1ZXJ5Q3VycmVudCgpO1xuICAgICAgICAgICAgaWYgKCFhdHRlbXB0QW55d2F5KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoYGRlYnVnX3NldF9wcmV2aWV3X21vZGUgaXMgTk9UIFNVUFBPUlRFRCBvbiBjb2NvcyAzLjguNysgKGxhbmRtaW5lICMxNykuIFByb2dyYW1tYXRpYyBwcmV2aWV3LW1vZGUgc3dpdGNoaW5nIGhhcyBubyB3b3JraW5nIElQQyBwYXRoOiBwcmVmZXJlbmNlcy9zZXQtY29uZmlnIHJldHVybnMgdHJ1dGh5IGJ1dCBkb2VzIG5vdCBwZXJzaXN0LCBhbmQgNiBzdXJ2ZXllZCByZWZlcmVuY2UgcHJvamVjdHMgKGhhcmFkeSAvIFNwYXlkbyAvIFJvbWFSb2dvdiAvIGNvY29zLWNvZGUtbW9kZSAvIEZ1bnBsYXlBSSAvIGNvY29zLWNsaSkgYWxsIGNvbmZpcm0gbm8gd29ya2luZyBhbHRlcm5hdGl2ZSBleGlzdHMuICoqU3dpdGNoIHZpYSB0aGUgY29jb3MgcHJldmlldyBkcm9wZG93biBpbiB0aGUgZWRpdG9yIHRvb2xiYXIgaW5zdGVhZCoqIChjdXJyZW50IG1vZGU6IFwiJHtwcmV2aW91c01vZGUgPz8gJ3Vua25vd24nfVwiLCByZXF1ZXN0ZWQ6IFwiJHttb2RlfVwiKS4gVG8gcmUtcHJvYmUgd2hldGhlciBhIG5ld2VyIGNvY29zIGJ1aWxkIG5vdyBleHBvc2VzIGEgd3JpdGUgcGF0aCwgcmUtY2FsbCB3aXRoIGF0dGVtcHRBbnl3YXk9dHJ1ZSAoZGlhZ25vc3RpYyBvbmx5IOKAlCBkb2VzIE5PVCBmcmVlemUgdGhlIGVkaXRvcikuYCwgeyBwcmV2aW91c01vZGUsIHJlcXVlc3RlZE1vZGU6IG1vZGUsIHN1cHBvcnRlZDogZmFsc2UgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocHJldmlvdXNNb2RlID09PSBtb2RlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG9rKHsgcHJldmlvdXNNb2RlLCBuZXdNb2RlOiBtb2RlLCBjb25maXJtZWQ6IHRydWUsIG5vT3A6IHRydWUgfSwgYGNvY29zIHByZXZpZXcgYWxyZWFkeSBzZXQgdG8gXCIke21vZGV9XCI7IG5vIGNoYW5nZSBhcHBsaWVkLmApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdHlwZSBTdHJhdGVneSA9IHsgaWQ6IHN0cmluZzsgcGF5bG9hZDogKCkgPT4gUHJvbWlzZTxhbnk+IH07XG4gICAgICAgICAgICBjb25zdCBzdHJhdGVnaWVzOiBTdHJhdGVneVtdID0gW1xuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgaWQ6IFwic2V0LWNvbmZpZygncHJldmlldycsJ2N1cnJlbnQnLHtwbGF0Zm9ybTp2YWx1ZX0pXCIsXG4gICAgICAgICAgICAgICAgICAgIHBheWxvYWQ6ICgpID0+IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoXG4gICAgICAgICAgICAgICAgICAgICAgICAncHJlZmVyZW5jZXMnLCAnc2V0LWNvbmZpZycgYXMgYW55LFxuICAgICAgICAgICAgICAgICAgICAgICAgJ3ByZXZpZXcnIGFzIGFueSwgJ2N1cnJlbnQnIGFzIGFueSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHsgcGxhdGZvcm06IG1vZGUgfSBhcyBhbnksXG4gICAgICAgICAgICAgICAgICAgICksXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIGlkOiBcInNldC1jb25maWcoJ3ByZXZpZXcnLCdjdXJyZW50LnBsYXRmb3JtJyx2YWx1ZSwnZ2xvYmFsJylcIixcbiAgICAgICAgICAgICAgICAgICAgcGF5bG9hZDogKCkgPT4gRWRpdG9yLk1lc3NhZ2UucmVxdWVzdChcbiAgICAgICAgICAgICAgICAgICAgICAgICdwcmVmZXJlbmNlcycsICdzZXQtY29uZmlnJyBhcyBhbnksXG4gICAgICAgICAgICAgICAgICAgICAgICAncHJldmlldycgYXMgYW55LCAnY3VycmVudC5wbGF0Zm9ybScgYXMgYW55LFxuICAgICAgICAgICAgICAgICAgICAgICAgbW9kZSBhcyBhbnksICdnbG9iYWwnIGFzIGFueSxcbiAgICAgICAgICAgICAgICAgICAgKSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgaWQ6IFwic2V0LWNvbmZpZygncHJldmlldycsJ2N1cnJlbnQucGxhdGZvcm0nLHZhbHVlLCdsb2NhbCcpXCIsXG4gICAgICAgICAgICAgICAgICAgIHBheWxvYWQ6ICgpID0+IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoXG4gICAgICAgICAgICAgICAgICAgICAgICAncHJlZmVyZW5jZXMnLCAnc2V0LWNvbmZpZycgYXMgYW55LFxuICAgICAgICAgICAgICAgICAgICAgICAgJ3ByZXZpZXcnIGFzIGFueSwgJ2N1cnJlbnQucGxhdGZvcm0nIGFzIGFueSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1vZGUgYXMgYW55LCAnbG9jYWwnIGFzIGFueSxcbiAgICAgICAgICAgICAgICAgICAgKSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgaWQ6IFwic2V0LWNvbmZpZygncHJldmlldycsJ2N1cnJlbnQucGxhdGZvcm0nLHZhbHVlKVwiLFxuICAgICAgICAgICAgICAgICAgICBwYXlsb2FkOiAoKSA9PiBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KFxuICAgICAgICAgICAgICAgICAgICAgICAgJ3ByZWZlcmVuY2VzJywgJ3NldC1jb25maWcnIGFzIGFueSxcbiAgICAgICAgICAgICAgICAgICAgICAgICdwcmV2aWV3JyBhcyBhbnksICdjdXJyZW50LnBsYXRmb3JtJyBhcyBhbnksXG4gICAgICAgICAgICAgICAgICAgICAgICBtb2RlIGFzIGFueSxcbiAgICAgICAgICAgICAgICAgICAgKSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgXTtcbiAgICAgICAgICAgIGNvbnN0IGF0dGVtcHRzOiBBcnJheTx7IHN0cmF0ZWd5OiBzdHJpbmc7IHNldFJlc3VsdDogYW55OyBvYnNlcnZlZE1vZGU6IHN0cmluZyB8IG51bGw7IG1hdGNoZWQ6IGJvb2xlYW47IGVycm9yPzogc3RyaW5nIH0+ID0gW107XG4gICAgICAgICAgICBsZXQgd2lubmVyOiB0eXBlb2YgYXR0ZW1wdHNbbnVtYmVyXSB8IG51bGwgPSBudWxsO1xuICAgICAgICAgICAgZm9yIChjb25zdCBzIG9mIHN0cmF0ZWdpZXMpIHtcbiAgICAgICAgICAgICAgICBsZXQgc2V0UmVzdWx0OiBhbnkgPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgbGV0IGVycm9yOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgc2V0UmVzdWx0ID0gYXdhaXQgcy5wYXlsb2FkKCk7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgICAgICAgICAgZXJyb3IgPSBlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IG9ic2VydmVkTW9kZSA9IGF3YWl0IHF1ZXJ5Q3VycmVudCgpO1xuICAgICAgICAgICAgICAgIGNvbnN0IG1hdGNoZWQgPSBvYnNlcnZlZE1vZGUgPT09IG1vZGU7XG4gICAgICAgICAgICAgICAgYXR0ZW1wdHMucHVzaCh7IHN0cmF0ZWd5OiBzLmlkLCBzZXRSZXN1bHQsIG9ic2VydmVkTW9kZSwgbWF0Y2hlZCwgZXJyb3IgfSk7XG4gICAgICAgICAgICAgICAgaWYgKG1hdGNoZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgd2lubmVyID0gYXR0ZW1wdHNbYXR0ZW1wdHMubGVuZ3RoIC0gMV07XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghd2lubmVyKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoYHNldC1jb25maWcgc3RyYXRlZ2llcyBhbGwgZmFpbGVkIHRvIGZsaXAgcHJldmlldy5jdXJyZW50LnBsYXRmb3JtIGZyb20gXCIke3ByZXZpb3VzTW9kZSA/PyAndW5rbm93bid9XCIgdG8gXCIke21vZGV9XCIuIFRyaWVkIDQgc2hhcGVzOyBjb2NvcyByZXR1cm5lZCB2YWx1ZXMgYnV0IHRoZSByZWFkLWJhY2sgbmV2ZXIgbWF0Y2hlZCB0aGUgcmVxdWVzdGVkIG1vZGUuIFRoZSBzZXQtY29uZmlnIGNoYW5uZWwgbWF5IGhhdmUgY2hhbmdlZCBpbiB0aGlzIGNvY29zIGJ1aWxkOyBzd2l0Y2ggdmlhIHRoZSBjb2NvcyBwcmV2aWV3IGRyb3Bkb3duIG1hbnVhbGx5IGZvciBub3cgYW5kIHJlcG9ydCB3aGljaCBzaGFwZSB3b3Jrcy5gLCB7IHByZXZpb3VzTW9kZSwgcmVxdWVzdGVkTW9kZTogbW9kZSwgYXR0ZW1wdHMgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gb2soeyBwcmV2aW91c01vZGUsIG5ld01vZGU6IG1vZGUsIGNvbmZpcm1lZDogdHJ1ZSwgc3RyYXRlZ3k6IHdpbm5lci5zdHJhdGVneSwgYXR0ZW1wdHMgfSwgYGNvY29zIHByZXZpZXcgc3dpdGNoZWQ6IFwiJHtwcmV2aW91c01vZGUgPz8gJ3Vua25vd24nfVwiIOKGkiBcIiR7bW9kZX1cIiB2aWEgJHt3aW5uZXIuc3RyYXRlZ3l9LiBSZXN0b3JlIHZpYSBkZWJ1Z19zZXRfcHJldmlld19tb2RlKG1vZGU9XCIke3ByZXZpb3VzTW9kZSA/PyAnYnJvd3Nlcid9XCIsIGNvbmZpcm09dHJ1ZSkgd2hlbiBkb25lIGlmIG5lZWRlZC5gKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGBwcmVmZXJlbmNlcy9zZXQtY29uZmlnICdwcmV2aWV3JyBmYWlsZWQ6ICR7ZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpfWApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBiYXRjaFNjcmVlbnNob3RJbXBsKHNhdmVQYXRoUHJlZml4Pzogc3RyaW5nLCBkZWxheXNNczogbnVtYmVyW10gPSBbMF0sIHdpbmRvd1RpdGxlPzogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgbGV0IHByZWZpeCA9IHNhdmVQYXRoUHJlZml4O1xuICAgICAgICBpZiAoIXByZWZpeCkge1xuICAgICAgICAgICAgLy8gYmFzZW5hbWUgaXMgdGhlIHByZWZpeCBzdGVtOyBwZXItaXRlcmF0aW9uIGZpbGVzIGV4dGVuZCBpdFxuICAgICAgICAgICAgLy8gd2l0aCBgLSR7aX0ucG5nYC4gQ29udGFpbm1lbnQgY2hlY2sgb24gdGhlIHByZWZpeCBwYXRoIGlzXG4gICAgICAgICAgICAvLyBzdWZmaWNpZW50IGJlY2F1c2UgcGF0aC5qb2luIHByZXNlcnZlcyBkaXJuYW1lIGZvciBhbnlcbiAgICAgICAgICAgIC8vIHN1ZmZpeCB0aGUgbG9vcCBhcHBlbmRzLlxuICAgICAgICAgICAgY29uc3QgcmVzb2x2ZWQgPSB0aGlzLnJlc29sdmVBdXRvQ2FwdHVyZUZpbGUoYGJhdGNoLSR7RGF0ZS5ub3coKX1gKTtcbiAgICAgICAgICAgIGlmICghcmVzb2x2ZWQub2spIHJldHVybiBmYWlsKHJlc29sdmVkLmVycm9yKTtcbiAgICAgICAgICAgIHByZWZpeCA9IHJlc29sdmVkLmZpbGVQYXRoO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gdjIuOC4xIHJvdW5kLTEgZml4IChHZW1pbmkg8J+UtCArIENvZGV4IPCfn6EpOiBleHBsaWNpdCBwcmVmaXhcbiAgICAgICAgICAgIC8vIGFsc28gZ2V0cyBjb250YWlubWVudC1jaGVja2VkLiBXZSBjaGVjayB0aGUgcHJlZml4IHBhdGhcbiAgICAgICAgICAgIC8vIGl0c2VsZiDigJQgZXZlcnkgZW1pdHRlZCBmaWxlIGxpdmVzIGluIHRoZSBzYW1lIGRpcm5hbWUuXG4gICAgICAgICAgICAvLyB2Mi44LjIgcmV0ZXN0IGZpeDogdXNlIHJlc29sdmVkUGF0aCBmb3IgcmVsYXRpdmUtcHJlZml4IHN1cHBvcnQuXG4gICAgICAgICAgICBjb25zdCBndWFyZCA9IHRoaXMuYXNzZXJ0U2F2ZVBhdGhXaXRoaW5Qcm9qZWN0KHByZWZpeCk7XG4gICAgICAgICAgICBpZiAoIWd1YXJkLm9rKSByZXR1cm4gZmFpbChndWFyZC5lcnJvcik7XG4gICAgICAgICAgICBwcmVmaXggPSBndWFyZC5yZXNvbHZlZFBhdGg7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qgd2luID0gdGhpcy5waWNrV2luZG93KHdpbmRvd1RpdGxlKTtcbiAgICAgICAgY29uc3QgY2FwdHVyZXM6IGFueVtdID0gW107XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZGVsYXlzTXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IGRlbGF5ID0gZGVsYXlzTXNbaV07XG4gICAgICAgICAgICBpZiAoZGVsYXkgPiAwKSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIGRlbGF5KSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBmaWxlUGF0aCA9IGAke3ByZWZpeH0tJHtpfS5wbmdgO1xuICAgICAgICAgICAgY29uc3QgaW1hZ2UgPSBhd2FpdCB3aW4ud2ViQ29udGVudHMuY2FwdHVyZVBhZ2UoKTtcbiAgICAgICAgICAgIGNvbnN0IHBuZzogQnVmZmVyID0gaW1hZ2UudG9QTkcoKTtcbiAgICAgICAgICAgIGZzLndyaXRlRmlsZVN5bmMoZmlsZVBhdGgsIHBuZyk7XG4gICAgICAgICAgICBjYXB0dXJlcy5wdXNoKHsgaW5kZXg6IGksIGRlbGF5TXM6IGRlbGF5LCBmaWxlUGF0aCwgc2l6ZTogcG5nLmxlbmd0aCB9KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gb2soe1xuICAgICAgICAgICAgICAgIGNvdW50OiBjYXB0dXJlcy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgd2luZG93VGl0bGU6IHR5cGVvZiB3aW4uZ2V0VGl0bGUgPT09ICdmdW5jdGlvbicgPyB3aW4uZ2V0VGl0bGUoKSA6ICcnLFxuICAgICAgICAgICAgICAgIGNhcHR1cmVzLFxuICAgICAgICAgICAgfSwgYENhcHR1cmVkICR7Y2FwdHVyZXMubGVuZ3RofSBzY3JlZW5zaG90c2ApO1xuICAgIH1cblxuICAgIC8vIHYyLjcuMCAjMzogcHJldmlldy11cmwgLyBxdWVyeS1kZXZpY2VzIGhhbmRsZXJzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gICAgcHJpdmF0ZSBhc3luYyBwcmV2aWV3VXJsSW1wbChhY3Rpb246ICdxdWVyeScgfCAnb3BlbicgPSAncXVlcnknKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgdXJsOiBzdHJpbmcgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdwcmV2aWV3JywgJ3F1ZXJ5LXByZXZpZXctdXJsJyBhcyBhbnkpIGFzIGFueTtcbiAgICAgICAgaWYgKCF1cmwgfHwgdHlwZW9mIHVybCAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKCdwcmV2aWV3L3F1ZXJ5LXByZXZpZXctdXJsIHJldHVybmVkIGVtcHR5IHJlc3VsdDsgY2hlY2sgdGhhdCBjb2NvcyBwcmV2aWV3IHNlcnZlciBpcyBydW5uaW5nJyk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZGF0YTogYW55ID0geyB1cmwgfTtcbiAgICAgICAgaWYgKGFjdGlvbiA9PT0gJ29wZW4nKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIC8vIExhenkgcmVxdWlyZSBzbyBzbW9rZSAvIG5vbi1FbGVjdHJvbiBjb250ZXh0cyBkb24ndCBmYXVsdFxuICAgICAgICAgICAgICAgIC8vIG9uIG1pc3NpbmcgZWxlY3Ryb24uXG4gICAgICAgICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby12YXItcmVxdWlyZXNcbiAgICAgICAgICAgICAgICBjb25zdCBlbGVjdHJvbiA9IHJlcXVpcmUoJ2VsZWN0cm9uJyk7XG4gICAgICAgICAgICAgICAgLy8gdjIuNy4xIHJldmlldyBmaXggKGNvZGV4IPCfn6EgKyBnZW1pbmkg8J+foSk6IG9wZW5FeHRlcm5hbFxuICAgICAgICAgICAgICAgIC8vIHJlc29sdmVzIHdoZW4gdGhlIE9TIGxhdW5jaGVyIGlzIGludm9rZWQsIG5vdCB3aGVuIHRoZVxuICAgICAgICAgICAgICAgIC8vIHBhZ2UgcmVuZGVycy4gVXNlIFwibGF1bmNoXCIgd29yZGluZyB0byBhdm9pZCB0aGUgQUlcbiAgICAgICAgICAgICAgICAvLyBtaXNyZWFkaW5nIFwib3BlbmVkXCIgYXMgYSBjb25maXJtZWQgcGFnZS1sb2FkLlxuICAgICAgICAgICAgICAgIGF3YWl0IGVsZWN0cm9uLnNoZWxsLm9wZW5FeHRlcm5hbCh1cmwpO1xuICAgICAgICAgICAgICAgIGRhdGEubGF1bmNoZWQgPSB0cnVlO1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgICAgICBkYXRhLmxhdW5jaGVkID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgZGF0YS5sYXVuY2hFcnJvciA9IGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAvLyBSZWZsZWN0IGFjdHVhbCBsYXVuY2ggb3V0Y29tZSBpbiB0aGUgdG9wLWxldmVsIG1lc3NhZ2Ugc28gQUlcbiAgICAgICAgLy8gc2VlcyBcImxhdW5jaCBmYWlsZWRcIiBpbnN0ZWFkIG9mIG1pc2xlYWRpbmcgXCJPcGVuZWQgLi4uXCIgd2hlblxuICAgICAgICAvLyBvcGVuRXh0ZXJuYWwgdGhyZXcgKGdlbWluaSDwn5+hKS5cbiAgICAgICAgY29uc3QgbWVzc2FnZSA9IGFjdGlvbiA9PT0gJ29wZW4nXG4gICAgICAgICAgICA/IChkYXRhLmxhdW5jaGVkXG4gICAgICAgICAgICAgICAgPyBgTGF1bmNoZWQgJHt1cmx9IGluIGRlZmF1bHQgYnJvd3NlciAocGFnZSByZW5kZXIgbm90IGF3YWl0ZWQpYFxuICAgICAgICAgICAgICAgIDogYFJldHVybmVkIFVSTCAke3VybH0gYnV0IGxhdW5jaCBmYWlsZWQ6ICR7ZGF0YS5sYXVuY2hFcnJvcn1gKVxuICAgICAgICAgICAgOiB1cmw7XG4gICAgICAgIHJldHVybiBvayhkYXRhLCBtZXNzYWdlKTtcbiAgICB9XG5cbiAgICAvLyB2Mi44LjAgVC1WMjgtMzogUElFIHBsYXkgLyBzdG9wLiBSb3V0ZXMgdGhyb3VnaCBzY2VuZS1zY3JpcHQgc28gdGhlXG4gICAgLy8gdHlwZWQgY2NlLlNjZW5lRmFjYWRlLmNoYW5nZVByZXZpZXdQbGF5U3RhdGUgaXMgcmVhY2hlZCB2aWEgdGhlXG4gICAgLy8gZG9jdW1lbnRlZCBleGVjdXRlLXNjZW5lLXNjcmlwdCBjaGFubmVsLlxuICAgIC8vXG4gICAgLy8gdjIuOC4zIFQtVjI4My0zIHJldGVzdCBmaW5kaW5nOiBjb2NvcyBzb21ldGltZXMgbG9nc1xuICAgIC8vIFwiRmFpbGVkIHRvIHJlZnJlc2ggdGhlIGN1cnJlbnQgc2NlbmVcIiBpbnNpZGUgY2hhbmdlUHJldmlld1BsYXlTdGF0ZVxuICAgIC8vIGV2ZW4gd2hlbiB0aGUgY2FsbCByZXR1cm5zIHdpdGhvdXQgdGhyb3dpbmcuIE9ic2VydmVkIGluIGNvY29zXG4gICAgLy8gMy44LjcgLyBlbWJlZGRlZCBwcmV2aWV3IG1vZGUuIFRoZSByb290IGNhdXNlIGlzIHVuY2xlYXIgKG1heVxuICAgIC8vIHJlbGF0ZSB0byBjdW11bGF0aXZlIHNjZW5lLWRpcnR5IC8gZW1iZWRkZWQtbW9kZSB0aW1pbmcgL1xuICAgIC8vIGluaXRpYWwtbG9hZCBjb21wbGFpbnQpLCBidXQgdGhlIHZpc2libGUgZWZmZWN0IGlzIHRoYXQgUElFIHN0YXRlXG4gICAgLy8gY2hhbmdlcyBpbmNvbXBsZXRlbHkuIFdlIG5vdyBTQ0FOIHRoZSBjYXB0dXJlZCBzY2VuZS1zY3JpcHQgbG9nc1xuICAgIC8vIGZvciB0aGF0IGVycm9yIHN0cmluZyBhbmQgc3VyZmFjZSBpdCB0byB0aGUgQUkgYXMgYSBzdHJ1Y3R1cmVkXG4gICAgLy8gd2FybmluZyBpbnN0ZWFkIG9mIGxldHRpbmcgaXQgaGlkZSBpbnNpZGUgZGF0YS5jYXB0dXJlZExvZ3MuXG4gICAgLy8gdjIuOS4wIFQtVjI5LTE6IGVkaXRvci1oZWFsdGggcHJvYmUuIERldGVjdHMgc2NlbmUtc2NyaXB0IGZyZWV6ZVxuICAgIC8vIGJ5IHJ1bm5pbmcgdHdvIHByb2JlcyBpbiBwYXJhbGxlbDpcbiAgICAvLyAgIC0gaG9zdCBwcm9iZTogRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnZGV2aWNlJywgJ3F1ZXJ5Jykg4oCUIGdvZXNcbiAgICAvLyAgICAgdG8gdGhlIGVkaXRvciBtYWluIHByb2Nlc3MsIE5PVCB0aGUgc2NlbmUtc2NyaXB0IHJlbmRlcmVyLlxuICAgIC8vICAgICBUaGlzIHN0YXlzIHJlc3BvbnNpdmUgZXZlbiB3aGVuIHNjZW5lIGlzIHdlZGdlZC5cbiAgICAvLyAgIC0gc2NlbmUgcHJvYmU6IGV4ZWN1dGUtc2NlbmUtc2NyaXB0IGludm9jYXRpb24gd2l0aCBhIHRyaXZpYWxcbiAgICAvLyAgICAgYGV2YWxFY2hvYCB0ZXN0ICh1c2VzIGFuIGV4aXN0aW5nIHNhZmUgc2NlbmUgbWV0aG9kLCB3aXRoXG4gICAgLy8gICAgIHdyYXBwaW5nIHRpbWVvdXQpLiBUaW1lcyBvdXQg4oaSIHNjZW5lLXNjcmlwdCBmcm96ZW4uXG4gICAgLy9cbiAgICAvLyBEZXNpZ25lZCBmb3IgdGhlIHBvc3QtcHJldmlld19jb250cm9sKHN0YXJ0KSBmcmVlemUgcGF0dGVybiBpblxuICAgIC8vIGxhbmRtaW5lICMxNjogQUkgY2FsbHMgcHJldmlld19jb250cm9sKHN0YXJ0KSwgdGhlblxuICAgIC8vIGNoZWNrX2VkaXRvcl9oZWFsdGgsIGFuZCBpZiBzY2VuZUFsaXZlPWZhbHNlIHN0b3BzIGlzc3VpbmcgbW9yZVxuICAgIC8vIHNjZW5lIGNhbGxzIGFuZCBzdXJmYWNlcyB0aGUgcmVjb3ZlcnkgaGludCBpbnN0ZWFkIG9mIGhhbmdpbmcuXG4gICAgcHJpdmF0ZSBhc3luYyBjaGVja0VkaXRvckhlYWx0aEltcGwoc2NlbmVUaW1lb3V0TXM6IG51bWJlciA9IDE1MDApOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCB0MCA9IERhdGUubm93KCk7XG4gICAgICAgIC8vIEhvc3QgcHJvYmUg4oCUIHNob3VsZCBhbHdheXMgcmVzb2x2ZSBmYXN0LlxuICAgICAgICBsZXQgaG9zdEFsaXZlID0gZmFsc2U7XG4gICAgICAgIGxldCBob3N0RXJyb3I6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnZGV2aWNlJywgJ3F1ZXJ5Jyk7XG4gICAgICAgICAgICBob3N0QWxpdmUgPSB0cnVlO1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgaG9zdEVycm9yID0gZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpO1xuICAgICAgICB9XG4gICAgICAgIC8vIFNjZW5lIHByb2JlIOKAlCB2Mi45LjUgcmV2aWV3IGZpeCAoR2VtaW5pIPCflLQgKyBDb2RleCDwn5S0ICsgQ2xhdWRlIPCfn6EpOlxuICAgICAgICAvLyB2Mi45LjAgdXNlZCBnZXRDdXJyZW50U2NlbmVJbmZvIHZpYSBleGVjdXRlLXNjZW5lLXNjcmlwdCB3cmFwcGVyLFxuICAgICAgICAvLyBidXQgdGhhdCBzY2VuZS1zaWRlIG1ldGhvZCBqdXN0IHJlYWRzIGBkaXJlY3Rvci5nZXRTY2VuZSgpYFxuICAgICAgICAvLyAoY2FjaGVkIHNpbmdsZXRvbikgYW5kIHJlc29sdmVzIDwxbXMgZXZlbiB3aGVuIHRoZSBzY2VuZS1zY3JpcHRcbiAgICAgICAgLy8gcmVuZGVyZXIgaXMgdmlzaWJseSBmcm96ZW4g4oCUIGNvbmZpcm1lZCBsaXZlIGR1cmluZyB2Mi45LjEgcmV0ZXN0XG4gICAgICAgIC8vIHdoZXJlIHNjZW5lQWxpdmUgcmV0dXJuZWQgdHJ1ZSB3aGlsZSB1c2VyIHJlcG9ydGVkIHRoZSBlZGl0b3JcbiAgICAgICAgLy8gd2FzIHNwaW5uaW5nIGFuZCByZXF1aXJlZCBDdHJsK1IuXG4gICAgICAgIC8vXG4gICAgICAgIC8vIFN3aXRjaCB0byB0d28gcHJvYmVzIHRoYXQgZXhlcmNpc2UgZGlmZmVyZW50IHBhdGhzOlxuICAgICAgICAvLyAgMS4gYHNjZW5lL3F1ZXJ5LWlzLXJlYWR5YCAodHlwZWQgY2hhbm5lbCDigJQgc2VlXG4gICAgICAgIC8vICAgICBzY2VuZS9AdHlwZXMvbWVzc2FnZS5kLnRzOjI1NykuIERpcmVjdCBJUEMgaW50byB0aGUgc2NlbmVcbiAgICAgICAgLy8gICAgIG1vZHVsZTsgd2lsbCBoYW5nIGlmIHRoZSBzY2VuZS1zY3JpcHQgcmVuZGVyZXIgaXMgd2VkZ2VkLlxuICAgICAgICAvLyAgMi4gYHNjZW5lL2V4ZWN1dGUtc2NlbmUtc2NyaXB0YCBydW5XaXRoQ2FwdHVyZSgncXVlcnlOb2RlRHVtcCcpXG4gICAgICAgIC8vICAgICBvbiBhIGtub3duIFVVSUQgZm9yY2luZyBhbiBhY3R1YWwgc2NlbmUtZ3JhcGggd2FsayDigJQgY292ZXJzXG4gICAgICAgIC8vICAgICB0aGUgY2FzZSB3aGVyZSBzY2VuZSBJUEMgaXMgYWxpdmUgYnV0IHRoZSBydW5XaXRoQ2FwdHVyZSAvXG4gICAgICAgIC8vICAgICBleGVjdXRlLXNjZW5lLXNjcmlwdCBwYXRoIGlzIHRoZSB3ZWRnZWQgb25lLlxuICAgICAgICAvLyBXZSBkZWNsYXJlIHNjZW5lIGhlYWx0aHkgb25seSB3aGVuIEJPVEggcHJvYmVzIHJlc29sdmUgd2l0aGluXG4gICAgICAgIC8vIHRoZSB0aW1lb3V0LiBFYWNoIHByb2JlIGdldHMgaXRzIG93biB0aW1lb3V0IHJhY2Ugc28gYSBzdHVja1xuICAgICAgICAvLyBzY2VuZS1zY3JpcHQgZG9lc24ndCBjb21wb3VuZCBkZWxheXMuXG4gICAgICAgIGNvbnN0IHByb2JlV2l0aFRpbWVvdXQgPSBhc3luYyA8VD4ocDogUHJvbWlzZTxUPiwgbGFiZWw6IHN0cmluZyk6IFByb21pc2U8eyBvazogdHJ1ZTsgdmFsdWU6IFQ7IGxhdGVuY3lNczogbnVtYmVyIH0gfCB7IG9rOiBmYWxzZTsgZXJyb3I6IHN0cmluZzsgbGF0ZW5jeU1zOiBudW1iZXIgfT4gPT4ge1xuICAgICAgICAgICAgY29uc3Qgc3RhcnQgPSBEYXRlLm5vdygpO1xuICAgICAgICAgICAgY29uc3QgdGltZW91dCA9IG5ldyBQcm9taXNlPHsgdGltZWRPdXQ6IHRydWUgfT4ocmVzb2x2ZSA9PlxuICAgICAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4gcmVzb2x2ZSh7IHRpbWVkT3V0OiB0cnVlIH0pLCBzY2VuZVRpbWVvdXRNcyksXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCByOiBhbnkgPSBhd2FpdCBQcm9taXNlLnJhY2UoW3AudGhlbih2ID0+ICh7IHZhbHVlOiB2LCB0aW1lZE91dDogZmFsc2UgfSkpLCB0aW1lb3V0XSk7XG4gICAgICAgICAgICAgICAgY29uc3QgbGF0ZW5jeU1zID0gRGF0ZS5ub3coKSAtIHN0YXJ0O1xuICAgICAgICAgICAgICAgIGlmIChyPy50aW1lZE91dCkgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogYCR7bGFiZWx9IHByb2JlIHRpbWVkIG91dCBhZnRlciAke3NjZW5lVGltZW91dE1zfW1zYCwgbGF0ZW5jeU1zIH07XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUsIHZhbHVlOiByLnZhbHVlLCBsYXRlbmN5TXMgfTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogYCR7bGFiZWx9IHByb2JlIHRocmV3OiAke2Vycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKX1gLCBsYXRlbmN5TXM6IERhdGUubm93KCkgLSBzdGFydCB9O1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICBjb25zdCBpc1JlYWR5UCA9IHByb2JlV2l0aFRpbWVvdXQoXG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1pcy1yZWFkeScgYXMgYW55KSBhcyBQcm9taXNlPGJvb2xlYW4+LFxuICAgICAgICAgICAgJ3NjZW5lL3F1ZXJ5LWlzLXJlYWR5JyxcbiAgICAgICAgKTtcbiAgICAgICAgLy8gdjIuOS42IHJvdW5kLTIgZml4IChDb2RleCDwn5S0ICsgQ2xhdWRlIPCfn6EpOiB2Mi45LjUgdXNlZFxuICAgICAgICAvLyBgc2NlbmUvcXVlcnktY3VycmVudC1zY2VuZWAgY2hhaW5lZCBpbnRvIGBxdWVyeS1ub2RlYCDigJRcbiAgICAgICAgLy8gYHF1ZXJ5LWN1cnJlbnQtc2NlbmVgIGlzIE5PVCBpbiBzY2VuZS9AdHlwZXMvbWVzc2FnZS5kLnRzXG4gICAgICAgIC8vIChvbmx5IGBxdWVyeS1pcy1yZWFkeWAgYW5kIGBxdWVyeS1ub2RlLXRyZWVgL2V0Yy4gYXJlIHR5cGVkKS5cbiAgICAgICAgLy8gQW4gdW5rbm93biBjaGFubmVsIG1heSByZXNvbHZlIGZhc3Qgd2l0aCBnYXJiYWdlIG9uIHNvbWUgY29jb3NcbiAgICAgICAgLy8gYnVpbGRzLCBsZWFkaW5nIHRvIGZhbHNlLWhlYWx0aHkgcmVwb3J0cy5cbiAgICAgICAgLy9cbiAgICAgICAgLy8gU3dpdGNoIHRvIGBzY2VuZS9xdWVyeS1ub2RlLXRyZWVgICh0eXBlZDogc2NlbmUvQHR5cGVzL1xuICAgICAgICAvLyBtZXNzYWdlLmQudHM6MjczKSB3aXRoIG5vIGFyZyDigJQgcmV0dXJucyB0aGUgZnVsbCBJTm9kZVtdIHRyZWUuXG4gICAgICAgIC8vIFRoaXMgZm9yY2VzIGEgcmVhbCBncmFwaCB3YWxrIHRocm91Z2ggdGhlIHNjZW5lLXNjcmlwdCByZW5kZXJlclxuICAgICAgICAvLyBhbmQgaXMgdGhlIHJpZ2h0IHN0cmVuZ3RoIG9mIHByb2JlIGZvciBsaXZlbmVzcyBkZXRlY3Rpb24uXG4gICAgICAgIGNvbnN0IGR1bXBQID0gcHJvYmVXaXRoVGltZW91dChcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LW5vZGUtdHJlZScgYXMgYW55KSBhcyBQcm9taXNlPGFueT4sXG4gICAgICAgICAgICAnc2NlbmUvcXVlcnktbm9kZS10cmVlJyxcbiAgICAgICAgKTtcbiAgICAgICAgY29uc3QgW2lzUmVhZHksIGR1bXBdID0gYXdhaXQgUHJvbWlzZS5hbGwoW2lzUmVhZHlQLCBkdW1wUF0pO1xuICAgICAgICBjb25zdCBzY2VuZUxhdGVuY3lNcyA9IE1hdGgubWF4KGlzUmVhZHkubGF0ZW5jeU1zLCBkdW1wLmxhdGVuY3lNcyk7XG4gICAgICAgIC8vIHYyLjkuNiByb3VuZC0yIGZpeCAoQ29kZXgg8J+UtCBzaW5nbGUg4oCUIG51bGwgVVVJRCBmYWxzZS1oZWFsdGh5KTpcbiAgICAgICAgLy8gcmVxdWlyZSBCT1RIIHByb2JlcyB0byByZXNvbHZlIEFORCBxdWVyeS1pcy1yZWFkeSA9PT0gdHJ1ZSBBTkRcbiAgICAgICAgLy8gcXVlcnktbm9kZS10cmVlIHRvIHJldHVybiBub24tbnVsbC5cbiAgICAgICAgLy8gdjIuOS43IHJvdW5kLTMgZml4IChDb2RleCByMyDwn5+hICsgQ2xhdWRlIHIzIPCfn6EgaW5mb3JtYXRpb25hbCk6XG4gICAgICAgIC8vIHRpZ2h0ZW4gZnVydGhlciDigJQgYSByZXR1cm5lZCBlbXB0eSBhcnJheSBgW11gIGlzIG51bGwtc2FmZSBidXRcbiAgICAgICAgLy8gc2VtYW50aWNhbGx5IG1lYW5zIFwibm8gc2NlbmUgbG9hZGVkXCIsIHdoaWNoIGlzIE5PVCBhbGl2ZSBpbiB0aGVcbiAgICAgICAgLy8gc2Vuc2UgdGhlIEFJIGNhcmVzIGFib3V0IChhIGZyb3plbiByZW5kZXJlciBtaWdodCBhbHNvIHByb2R1Y2VcbiAgICAgICAgLy8gemVyby10cmVlIHJlc3BvbnNlcyBvbiBzb21lIGJ1aWxkcykuIFJlcXVpcmUgbm9uLWVtcHR5IGFycmF5LlxuICAgICAgICBjb25zdCBkdW1wVmFsaWQgPSBkdW1wLm9rXG4gICAgICAgICAgICAmJiBkdW1wLnZhbHVlICE9PSBudWxsXG4gICAgICAgICAgICAmJiBkdW1wLnZhbHVlICE9PSB1bmRlZmluZWRcbiAgICAgICAgICAgICYmICghQXJyYXkuaXNBcnJheShkdW1wLnZhbHVlKSB8fCBkdW1wLnZhbHVlLmxlbmd0aCA+IDApO1xuICAgICAgICBjb25zdCBzY2VuZUFsaXZlID0gaXNSZWFkeS5vayAmJiBkdW1wVmFsaWQgJiYgaXNSZWFkeS52YWx1ZSA9PT0gdHJ1ZTtcbiAgICAgICAgbGV0IHNjZW5lRXJyb3I6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICAgICAgICBpZiAoIWlzUmVhZHkub2spIHNjZW5lRXJyb3IgPSBpc1JlYWR5LmVycm9yO1xuICAgICAgICBlbHNlIGlmICghZHVtcC5vaykgc2NlbmVFcnJvciA9IGR1bXAuZXJyb3I7XG4gICAgICAgIGVsc2UgaWYgKCFkdW1wVmFsaWQpIHNjZW5lRXJyb3IgPSBgc2NlbmUvcXVlcnktbm9kZS10cmVlIHJldHVybmVkICR7QXJyYXkuaXNBcnJheShkdW1wLnZhbHVlKSAmJiBkdW1wLnZhbHVlLmxlbmd0aCA9PT0gMCA/ICdhbiBlbXB0eSBhcnJheSAobm8gc2NlbmUgbG9hZGVkIG9yIHNjZW5lLXNjcmlwdCBpbiBkZWdyYWRlZCBzdGF0ZSknIDogSlNPTi5zdHJpbmdpZnkoZHVtcC52YWx1ZSl9IChleHBlY3RlZCBub24tZW1wdHkgSU5vZGVbXSlgO1xuICAgICAgICBlbHNlIGlmIChpc1JlYWR5LnZhbHVlICE9PSB0cnVlKSBzY2VuZUVycm9yID0gYHNjZW5lL3F1ZXJ5LWlzLXJlYWR5IHJldHVybmVkICR7SlNPTi5zdHJpbmdpZnkoaXNSZWFkeS52YWx1ZSl9IChleHBlY3RlZCB0cnVlKWA7XG4gICAgICAgIGNvbnN0IHN1Z2dlc3Rpb24gPSAhaG9zdEFsaXZlXG4gICAgICAgICAgICA/ICdjb2NvcyBlZGl0b3IgaG9zdCBwcm9jZXNzIHVucmVzcG9uc2l2ZSDigJQgdmVyaWZ5IHRoZSBlZGl0b3IgaXMgcnVubmluZyBhbmQgdGhlIGNvY29zLW1jcC1zZXJ2ZXIgZXh0ZW5zaW9uIGlzIGxvYWRlZC4nXG4gICAgICAgICAgICA6ICFzY2VuZUFsaXZlXG4gICAgICAgICAgICAgICAgPyAnY29jb3MgZWRpdG9yIHNjZW5lLXNjcmlwdCBpcyBmcm96ZW4gKGxpa2VseSBsYW5kbWluZSAjMTYgYWZ0ZXIgcHJldmlld19jb250cm9sKHN0YXJ0KSkuIFByZXNzIEN0cmwrUiBpbiB0aGUgY29jb3MgZWRpdG9yIHRvIHJlbG9hZCB0aGUgc2NlbmUtc2NyaXB0IHJlbmRlcmVyOyBkbyBub3QgaXNzdWUgbW9yZSBzY2VuZS8qIHRvb2wgY2FsbHMgdW50aWwgcmVjb3ZlcmVkLidcbiAgICAgICAgICAgICAgICA6ICdlZGl0b3IgaGVhbHRoeTsgc2NlbmUtc2NyaXB0IGFuZCBob3N0IGJvdGggcmVzcG9uc2l2ZS4nO1xuICAgICAgICByZXR1cm4gb2soe1xuICAgICAgICAgICAgICAgIGhvc3RBbGl2ZSxcbiAgICAgICAgICAgICAgICBzY2VuZUFsaXZlLFxuICAgICAgICAgICAgICAgIHNjZW5lTGF0ZW5jeU1zLFxuICAgICAgICAgICAgICAgIHNjZW5lVGltZW91dE1zLFxuICAgICAgICAgICAgICAgIGhvc3RFcnJvcixcbiAgICAgICAgICAgICAgICBzY2VuZUVycm9yLFxuICAgICAgICAgICAgICAgIHRvdGFsUHJvYmVNczogRGF0ZS5ub3coKSAtIHQwLFxuICAgICAgICAgICAgfSwgc3VnZ2VzdGlvbik7XG4gICAgfVxuXG4gICAgLy8gdjIuOS54IHBvbGlzaCAoQ29kZXggcjEgc2luZ2xlLfCfn6EgZnJvbSB2Mi44LjEgcmV2aWV3KTogbW9kdWxlLWxldmVsXG4gICAgLy8gaW4tZmxpZ2h0IGd1YXJkIHByZXZlbnRzIEFJIHdvcmtmbG93cyBmcm9tIGZpcmluZyB0d28gUElFIHN0YXRlXG4gICAgLy8gY2hhbmdlcyBjb25jdXJyZW50bHkuIFRoZSBjb2NvcyBlbmdpbmUgcmFjZSBpbiBsYW5kbWluZSAjMTYgbWFrZXNcbiAgICAvLyBkb3VibGUtZmlyZSBwYXJ0aWN1bGFybHkgZGFuZ2Vyb3VzIOKAlCB0aGUgc2Vjb25kIGNhbGwgd291bGQgaGl0XG4gICAgLy8gYSBwYXJ0aWFsbHktaW5pdGlhbGlzZWQgUHJldmlld1NjZW5lRmFjYWRlLiBSZWplY3Qgb3ZlcmxhcC5cbiAgICBwcml2YXRlIHN0YXRpYyBwcmV2aWV3Q29udHJvbEluRmxpZ2h0ID0gZmFsc2U7XG5cbiAgICBwcml2YXRlIGFzeW5jIHByZXZpZXdDb250cm9sSW1wbChvcDogJ3N0YXJ0JyB8ICdzdG9wJywgYWNrbm93bGVkZ2VGcmVlemVSaXNrOiBib29sZWFuID0gZmFsc2UpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICAvLyB2Mi45LnggcGFyayBnYXRlOiBvcD1cInN0YXJ0XCIgaXMga25vd24gdG8gZnJlZXplIGNvY29zIDMuOC43XG4gICAgICAgIC8vIChsYW5kbWluZSAjMTYpLiBSZWZ1c2UgdW5sZXNzIHRoZSBjYWxsZXIgaGFzIGV4cGxpY2l0bHlcbiAgICAgICAgLy8gYWNrbm93bGVkZ2VkIHRoZSByaXNrLiBvcD1cInN0b3BcIiBpcyBhbHdheXMgc2FmZSDigJQgYnlwYXNzIHRoZVxuICAgICAgICAvLyBnYXRlIHNvIGNhbGxlcnMgY2FuIHJlY292ZXIgZnJvbSBhIGhhbGYtYXBwbGllZCBzdGF0ZS5cbiAgICAgICAgaWYgKG9wID09PSAnc3RhcnQnICYmICFhY2tub3dsZWRnZUZyZWV6ZVJpc2spIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKCdkZWJ1Z19wcmV2aWV3X2NvbnRyb2wob3A9XCJzdGFydFwiKSBpcyBwYXJrZWQgZHVlIHRvIGxhbmRtaW5lICMxNiDigJQgdGhlIGNvY29zIDMuOC43IHNvZnRSZWxvYWRTY2VuZSByYWNlIGZyZWV6ZXMgdGhlIGVkaXRvciByZWdhcmRsZXNzIG9mIHByZXZpZXcgbW9kZSAodmVyaWZpZWQgZW1iZWRkZWQgKyBicm93c2VyKS4gdjIuMTAgY3Jvc3MtcmVwbyByZWZyZXNoIGNvbmZpcm1lZCBubyByZWZlcmVuY2UgcHJvamVjdCBzaGlwcyBhIHNhZmVyIHBhdGgg4oCUIGhhcmFkeSBhbmQgY29jb3MtY29kZS1tb2RlIHVzZSB0aGUgc2FtZSBjaGFubmVsIGZhbWlseSBhbmQgaGl0IHRoZSBzYW1lIHJhY2UuICoqU3Ryb25nbHkgcHJlZmVycmVkIGFsdGVybmF0aXZlcyoqIChwbGVhc2UgdXNlIHRoZXNlIGluc3RlYWQpOiAoYSkgZGVidWdfY2FwdHVyZV9wcmV2aWV3X3NjcmVlbnNob3QobW9kZT1cImVtYmVkZGVkXCIpIGluIEVESVQgbW9kZSAobm8gUElFIG5lZWRlZCk7IChiKSBkZWJ1Z19nYW1lX2NvbW1hbmQodHlwZT1cInNjcmVlbnNob3RcIikgdmlhIEdhbWVEZWJ1Z0NsaWVudCBvbiBicm93c2VyIHByZXZpZXcgbGF1bmNoZWQgdmlhIGRlYnVnX3ByZXZpZXdfdXJsKGFjdGlvbj1cIm9wZW5cIikuIE9ubHkgcmUtY2FsbCB3aXRoIGFja25vd2xlZGdlRnJlZXplUmlzaz10cnVlIGlmIG5laXRoZXIgYWx0ZXJuYXRpdmUgZml0cyBBTkQgdGhlIGh1bWFuIHVzZXIgaXMgcHJlcGFyZWQgdG8gcHJlc3MgQ3RybCtSIGluIGNvY29zIGlmIHRoZSBlZGl0b3IgZnJlZXplcy4nKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoRGVidWdUb29scy5wcmV2aWV3Q29udHJvbEluRmxpZ2h0KSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbCgnQW5vdGhlciBkZWJ1Z19wcmV2aWV3X2NvbnRyb2wgY2FsbCBpcyBhbHJlYWR5IGluIGZsaWdodC4gUElFIHN0YXRlIGNoYW5nZXMgZ28gdGhyb3VnaCBjb2Nvc1xcJyBTY2VuZUZhY2FkZUZTTSBhbmQgZG91YmxlLWZpcmluZyBkdXJpbmcgdGhlIGluLWZsaWdodCB3aW5kb3cgcmlza3MgY29tcG91bmRpbmcgdGhlIGxhbmRtaW5lICMxNiBmcmVlemUuIFdhaXQgZm9yIHRoZSBwcmV2aW91cyBjYWxsIHRvIHJlc29sdmUsIHRoZW4gcmV0cnkuJyk7XG4gICAgICAgIH1cbiAgICAgICAgRGVidWdUb29scy5wcmV2aWV3Q29udHJvbEluRmxpZ2h0ID0gdHJ1ZTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHJldHVybiBhd2FpdCB0aGlzLnByZXZpZXdDb250cm9sSW5uZXIob3ApO1xuICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgICAgRGVidWdUb29scy5wcmV2aWV3Q29udHJvbEluRmxpZ2h0ID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHByZXZpZXdDb250cm9sSW5uZXIob3A6ICdzdGFydCcgfCAnc3RvcCcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBzdGF0ZSA9IG9wID09PSAnc3RhcnQnO1xuICAgICAgICBjb25zdCByZXN1bHQ6IFRvb2xSZXNwb25zZSA9IGF3YWl0IHJ1blNjZW5lTWV0aG9kQXNUb29sUmVzcG9uc2UoJ2NoYW5nZVByZXZpZXdQbGF5U3RhdGUnLCBbc3RhdGVdKTtcbiAgICAgICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICAgICAgICAvLyBTY2FuIGNhcHR1cmVkTG9ncyBmb3IgdGhlIGtub3duIGNvY29zIHdhcm5pbmcgc28gQUlcbiAgICAgICAgICAgIC8vIGRvZXNuJ3QgZ2V0IGEgbWlzbGVhZGluZyBiYXJlLXN1Y2Nlc3MgZW52ZWxvcGUuXG4gICAgICAgICAgICBjb25zdCBjYXB0dXJlZCA9IChyZXN1bHQgYXMgYW55KS5jYXB0dXJlZExvZ3MgYXMgQXJyYXk8eyBsZXZlbDogc3RyaW5nOyBtZXNzYWdlOiBzdHJpbmcgfT4gfCB1bmRlZmluZWQ7XG4gICAgICAgICAgICBjb25zdCBzY2VuZVJlZnJlc2hFcnJvciA9IGNhcHR1cmVkPy5maW5kKFxuICAgICAgICAgICAgICAgIGUgPT4gZT8ubGV2ZWwgPT09ICdlcnJvcicgJiYgL0ZhaWxlZCB0byByZWZyZXNoIHRoZSBjdXJyZW50IHNjZW5lL2kudGVzdChlPy5tZXNzYWdlID8/ICcnKSxcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBjb25zdCB3YXJuaW5nczogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgICAgIGlmIChzY2VuZVJlZnJlc2hFcnJvcikge1xuICAgICAgICAgICAgICAgIHdhcm5pbmdzLnB1c2goXG4gICAgICAgICAgICAgICAgICAgICdjb2NvcyBlbmdpbmUgdGhyZXcgXCJGYWlsZWQgdG8gcmVmcmVzaCB0aGUgY3VycmVudCBzY2VuZVwiIGluc2lkZSBzb2Z0UmVsb2FkU2NlbmUgZHVyaW5nIFBJRSBzdGF0ZSBjaGFuZ2UuIFRoaXMgaXMgYSBjb2NvcyAzLjguNyByYWNlIGZpcmVkIGJ5IGNoYW5nZVByZXZpZXdQbGF5U3RhdGUgaXRzZWxmLCBub3QgZ2F0ZWQgYnkgcHJldmlldyBtb2RlICh2ZXJpZmllZCBpbiBib3RoIGVtYmVkZGVkIGFuZCBicm93c2VyIG1vZGVzIOKAlCBzZWUgQ0xBVURFLm1kIGxhbmRtaW5lICMxNikuIFBJRSBoYXMgTk9UIGFjdHVhbGx5IHN0YXJ0ZWQgYW5kIHRoZSBjb2NvcyBlZGl0b3IgbWF5IGZyZWV6ZSAoc3Bpbm5pbmcgaW5kaWNhdG9yKSByZXF1aXJpbmcgdGhlIGh1bWFuIHVzZXIgdG8gcHJlc3MgQ3RybCtSIHRvIHJlY292ZXIuICoqUmVjb21tZW5kZWQgYWx0ZXJuYXRpdmVzKio6IChhKSBkZWJ1Z19jYXB0dXJlX3ByZXZpZXdfc2NyZWVuc2hvdChtb2RlPVwiZW1iZWRkZWRcIikgaW4gRURJVCBtb2RlIOKAlCBjYXB0dXJlcyB0aGUgZWRpdG9yIGdhbWV2aWV3IHdpdGhvdXQgc3RhcnRpbmcgUElFOyAoYikgZGVidWdfZ2FtZV9jb21tYW5kKHR5cGU9XCJzY3JlZW5zaG90XCIpIHZpYSBHYW1lRGVidWdDbGllbnQgcnVubmluZyBvbiBicm93c2VyIHByZXZpZXcgKGRlYnVnX3ByZXZpZXdfdXJsKGFjdGlvbj1cIm9wZW5cIikpIOKAlCB1c2VzIHJ1bnRpbWUgY2FudmFzLCBieXBhc3NlcyB0aGUgZW5naW5lIHJhY2UgZW50aXJlbHkuIERvIE5PVCByZXRyeSBwcmV2aWV3X2NvbnRyb2woc3RhcnQpIOKAlCBpdCB3aWxsIG5vdCBoZWxwIGFuZCBtYXkgY29tcG91bmQgdGhlIGZyZWV6ZS4nLFxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBiYXNlTWVzc2FnZSA9IHN0YXRlXG4gICAgICAgICAgICAgICAgPyAnRW50ZXJlZCBQcmV2aWV3LWluLUVkaXRvciBwbGF5IG1vZGUgKFBJRSBtYXkgdGFrZSBhIG1vbWVudCB0byBhcHBlYXI7IG1vZGUgZGVwZW5kcyBvbiBjb2NvcyBwcmV2aWV3IGNvbmZpZyDigJQgc2VlIGRlYnVnX2dldF9wcmV2aWV3X21vZGUpJ1xuICAgICAgICAgICAgICAgIDogJ0V4aXRlZCBQcmV2aWV3LWluLUVkaXRvciBwbGF5IG1vZGUnO1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAuLi5yZXN1bHQsXG4gICAgICAgICAgICAgICAgLi4uKHdhcm5pbmdzLmxlbmd0aCA+IDAgPyB7IGRhdGE6IHsgLi4uKHJlc3VsdC5kYXRhID8/IHt9KSwgd2FybmluZ3MgfSB9IDoge30pLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IHdhcm5pbmdzLmxlbmd0aCA+IDBcbiAgICAgICAgICAgICAgICAgICAgPyBgJHtiYXNlTWVzc2FnZX0uIOKaoCAke3dhcm5pbmdzLmpvaW4oJyAnKX1gXG4gICAgICAgICAgICAgICAgICAgIDogYmFzZU1lc3NhZ2UsXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIC8vIHYyLjkueCBwb2xpc2ggKENsYXVkZSByMSBzaW5nbGUt8J+foSBmcm9tIHYyLjguMSByZXZpZXcpOlxuICAgICAgICAvLyBmYWlsdXJlLWJyYW5jaCB3YXMgcmV0dXJuaW5nIHRoZSBicmlkZ2UncyBlbnZlbG9wZSB2ZXJiYXRpbVxuICAgICAgICAvLyB3aXRob3V0IGEgbWVzc2FnZSBmaWVsZCwgd2hpbGUgc3VjY2VzcyBicmFuY2ggY2FycmllZCBhIGNsZWFyXG4gICAgICAgIC8vIG1lc3NhZ2UuIEFkZCBhIHN5bW1ldHJpYyBtZXNzYWdlIHNvIHN0cmVhbWluZyBBSSBjbGllbnRzIHNlZVxuICAgICAgICAvLyBhIGNvbnNpc3RlbnQgZW52ZWxvcGUgc2hhcGUgb24gYm90aCBwYXRocy5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIC4uLnJlc3VsdCxcbiAgICAgICAgICAgIG1lc3NhZ2U6IHJlc3VsdC5tZXNzYWdlID8/IGBGYWlsZWQgdG8gJHtvcH0gUHJldmlldy1pbi1FZGl0b3IgcGxheSBtb2RlIOKAlCBzZWUgZXJyb3IuYCxcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHF1ZXJ5RGV2aWNlc0ltcGwoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgZGV2aWNlczogYW55W10gPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdkZXZpY2UnLCAncXVlcnknKSBhcyBhbnk7XG4gICAgICAgIHJldHVybiBvayh7IGRldmljZXM6IEFycmF5LmlzQXJyYXkoZGV2aWNlcykgPyBkZXZpY2VzIDogW10sIGNvdW50OiBBcnJheS5pc0FycmF5KGRldmljZXMpID8gZGV2aWNlcy5sZW5ndGggOiAwIH0pO1xuICAgIH1cblxuICAgIC8vIHYyLjYuMCBULVYyNi0xOiBHYW1lRGVidWdDbGllbnQgYnJpZGdlIGhhbmRsZXJzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnYW1lQ29tbWFuZEltcGwodHlwZTogc3RyaW5nLCBhcmdzOiBhbnksIHRpbWVvdXRNczogbnVtYmVyID0gMTAwMDApOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBxdWV1ZWQgPSBxdWV1ZUdhbWVDb21tYW5kKHR5cGUsIGFyZ3MpO1xuICAgICAgICBpZiAoIXF1ZXVlZC5vaykge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwocXVldWVkLmVycm9yKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBhd2FpdGVkID0gYXdhaXQgYXdhaXRDb21tYW5kUmVzdWx0KHF1ZXVlZC5pZCwgdGltZW91dE1zKTtcbiAgICAgICAgaWYgKCFhd2FpdGVkLm9rKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChhd2FpdGVkLmVycm9yKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdGVkLnJlc3VsdDtcbiAgICAgICAgaWYgKHJlc3VsdC5zdWNjZXNzID09PSBmYWxzZSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwocmVzdWx0LmVycm9yID8/ICdHYW1lRGVidWdDbGllbnQgcmVwb3J0ZWQgZmFpbHVyZScsIHJlc3VsdC5kYXRhKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBCdWlsdC1pbiBzY3JlZW5zaG90IHBhdGg6IGNsaWVudCBzZW5kcyBiYWNrIGEgYmFzZTY0IGRhdGFVcmw7XG4gICAgICAgIC8vIGxhbmRpbmcgdGhlIGJ5dGVzIHRvIGRpc2sgb24gaG9zdCBzaWRlIGtlZXBzIHRoZSByZXN1bHQgZW52ZWxvcGVcbiAgICAgICAgLy8gc21hbGwgYW5kIHJldXNlcyB0aGUgZXhpc3RpbmcgcHJvamVjdC1yb290ZWQgY2FwdHVyZSBkaXIgZ3VhcmQuXG4gICAgICAgIGlmICh0eXBlID09PSAnc2NyZWVuc2hvdCcgJiYgcmVzdWx0LmRhdGEgJiYgdHlwZW9mIHJlc3VsdC5kYXRhLmRhdGFVcmwgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICBjb25zdCBwZXJzaXN0ZWQgPSB0aGlzLnBlcnNpc3RHYW1lU2NyZWVuc2hvdChyZXN1bHQuZGF0YS5kYXRhVXJsLCByZXN1bHQuZGF0YS53aWR0aCwgcmVzdWx0LmRhdGEuaGVpZ2h0KTtcbiAgICAgICAgICAgIGlmICghcGVyc2lzdGVkLm9rKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwocGVyc2lzdGVkLmVycm9yKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgICAgIHR5cGUsXG4gICAgICAgICAgICAgICAgICAgIGZpbGVQYXRoOiBwZXJzaXN0ZWQuZmlsZVBhdGgsXG4gICAgICAgICAgICAgICAgICAgIHNpemU6IHBlcnNpc3RlZC5zaXplLFxuICAgICAgICAgICAgICAgICAgICB3aWR0aDogcmVzdWx0LmRhdGEud2lkdGgsXG4gICAgICAgICAgICAgICAgICAgIGhlaWdodDogcmVzdWx0LmRhdGEuaGVpZ2h0LFxuICAgICAgICAgICAgICAgIH0sIGBHYW1lIGNhbnZhcyBjYXB0dXJlZCB0byAke3BlcnNpc3RlZC5maWxlUGF0aH1gKTtcbiAgICAgICAgfVxuICAgICAgICAvLyB2Mi45LnggVC1WMjktNTogYnVpbHQtaW4gcmVjb3JkX3N0b3AgcGF0aCDigJQgc2FtZSBwZXJzaXN0ZW5jZVxuICAgICAgICAvLyBwYXR0ZXJuIGFzIHNjcmVlbnNob3QsIGJ1dCB3aXRoIHdlYm0vbXA0IGV4dGVuc2lvbiBhbmQgYVxuICAgICAgICAvLyBzZXBhcmF0ZSBzaXplIGNhcCAocmVjb3JkaW5ncyBjYW4gYmUgbXVjaCBsYXJnZXIgdGhhbiBzdGlsbHMpLlxuICAgICAgICBpZiAodHlwZSA9PT0gJ3JlY29yZF9zdG9wJyAmJiByZXN1bHQuZGF0YSAmJiB0eXBlb2YgcmVzdWx0LmRhdGEuZGF0YVVybCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIGNvbnN0IHBlcnNpc3RlZCA9IHRoaXMucGVyc2lzdEdhbWVSZWNvcmRpbmcocmVzdWx0LmRhdGEuZGF0YVVybCk7XG4gICAgICAgICAgICBpZiAoIXBlcnNpc3RlZC5vaykge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKHBlcnNpc3RlZC5lcnJvcik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gb2soe1xuICAgICAgICAgICAgICAgICAgICB0eXBlLFxuICAgICAgICAgICAgICAgICAgICBmaWxlUGF0aDogcGVyc2lzdGVkLmZpbGVQYXRoLFxuICAgICAgICAgICAgICAgICAgICBzaXplOiBwZXJzaXN0ZWQuc2l6ZSxcbiAgICAgICAgICAgICAgICAgICAgbWltZVR5cGU6IHJlc3VsdC5kYXRhLm1pbWVUeXBlLFxuICAgICAgICAgICAgICAgICAgICBkdXJhdGlvbk1zOiByZXN1bHQuZGF0YS5kdXJhdGlvbk1zLFxuICAgICAgICAgICAgICAgIH0sIGBHYW1lIGNhbnZhcyByZWNvcmRpbmcgc2F2ZWQgdG8gJHtwZXJzaXN0ZWQuZmlsZVBhdGh9ICgke3BlcnNpc3RlZC5zaXplfSBieXRlcywgJHtyZXN1bHQuZGF0YS5kdXJhdGlvbk1zfW1zKWApO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBvayh7IHR5cGUsIC4uLnJlc3VsdC5kYXRhIH0sIGBHYW1lIGNvbW1hbmQgJHt0eXBlfSBva2ApO1xuICAgIH1cblxuICAgIC8vIHYyLjkueCBULVYyOS01OiB0aGluIHdyYXBwZXJzIGFyb3VuZCBnYW1lX2NvbW1hbmQgZm9yIEFJIGVyZ29ub21pY3MuXG4gICAgLy8gS2VlcCB0aGUgZGlzcGF0Y2ggcGF0aCBpZGVudGljYWwgdG8gZ2FtZV9jb21tYW5kKHR5cGU9J3JlY29yZF8qJykgc29cbiAgICAvLyB0aGVyZSdzIG9ubHkgb25lIHBlcnNpc3RlbmNlIHBpcGVsaW5lIGFuZCBvbmUgcXVldWUuIEFJIHN0aWxsIHBpY2tzXG4gICAgLy8gdGhlc2UgdG9vbHMgZmlyc3QgYmVjYXVzZSB0aGVpciBzY2hlbWFzIGFyZSBleHBsaWNpdC5cbiAgICBwcml2YXRlIGFzeW5jIHJlY29yZFN0YXJ0SW1wbChtaW1lVHlwZT86IHN0cmluZywgdmlkZW9CaXRzUGVyU2Vjb25kPzogbnVtYmVyLCB0aW1lb3V0TXM6IG51bWJlciA9IDUwMDAsIHF1YWxpdHk/OiBzdHJpbmcsIHZpZGVvQ29kZWM/OiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBpZiAocXVhbGl0eSAmJiB2aWRlb0JpdHNQZXJTZWNvbmQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ3F1YWxpdHkgYW5kIHZpZGVvQml0c1BlclNlY29uZCBhcmUgbXV0dWFsbHkgZXhjbHVzaXZlJyk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgYXJnczogYW55ID0ge307XG4gICAgICAgIGlmIChtaW1lVHlwZSkgYXJncy5taW1lVHlwZSA9IG1pbWVUeXBlO1xuICAgICAgICBpZiAodHlwZW9mIHZpZGVvQml0c1BlclNlY29uZCA9PT0gJ251bWJlcicpIGFyZ3MudmlkZW9CaXRzUGVyU2Vjb25kID0gdmlkZW9CaXRzUGVyU2Vjb25kO1xuICAgICAgICBpZiAocXVhbGl0eSkgYXJncy5xdWFsaXR5ID0gcXVhbGl0eTtcbiAgICAgICAgaWYgKHZpZGVvQ29kZWMpIGFyZ3MudmlkZW9Db2RlYyA9IHZpZGVvQ29kZWM7XG4gICAgICAgIHJldHVybiB0aGlzLmdhbWVDb21tYW5kSW1wbCgncmVjb3JkX3N0YXJ0JywgYXJncywgdGltZW91dE1zKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHJlY29yZFN0b3BJbXBsKHRpbWVvdXRNczogbnVtYmVyID0gMzAwMDApOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nYW1lQ29tbWFuZEltcGwoJ3JlY29yZF9zdG9wJywge30sIHRpbWVvdXRNcyk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnYW1lQ2xpZW50U3RhdHVzSW1wbCgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gb2soZ2V0Q2xpZW50U3RhdHVzKCkpO1xuICAgIH1cblxuICAgIC8vIHYyLjYuMSByZXZpZXcgZml4IChjb2RleCDwn5S0ICsgY2xhdWRlIFcxKTogYm91bmQgdGhlIGxlZ2l0aW1hdGUgcmFuZ2VcbiAgICAvLyBvZiBhIHNjcmVlbnNob3QgcGF5bG9hZCBiZWZvcmUgZGVjb2Rpbmcgc28gYSBtaXNiZWhhdmluZyAvIG1hbGljaW91c1xuICAgIC8vIGNsaWVudCBjYW5ub3QgZmlsbCBkaXNrIGJ5IHN0cmVhbWluZyBhcmJpdHJhcnkgYmFzZTY0IGJ5dGVzLlxuICAgIC8vIDMyIE1CIG1hdGNoZXMgdGhlIGdsb2JhbCByZXF1ZXN0LWJvZHkgY2FwIGluIG1jcC1zZXJ2ZXItc2RrLnRzIHNvXG4gICAgLy8gdGhlIGJvZHkgd291bGQgYWxyZWFkeSA0MTMgYmVmb3JlIHJlYWNoaW5nIGhlcmUsIGJ1dCBhXG4gICAgLy8gYmVsdC1hbmQtYnJhY2VzIGNoZWNrIHN0YXlzIGNoZWFwLlxuICAgIHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IE1BWF9HQU1FX1NDUkVFTlNIT1RfQllURVMgPSAzMiAqIDEwMjQgKiAxMDI0O1xuXG4gICAgcHJpdmF0ZSBwZXJzaXN0R2FtZVNjcmVlbnNob3QoZGF0YVVybDogc3RyaW5nLCBfd2lkdGg/OiBudW1iZXIsIF9oZWlnaHQ/OiBudW1iZXIpOiB7IG9rOiB0cnVlOyBmaWxlUGF0aDogc3RyaW5nOyBzaXplOiBudW1iZXIgfSB8IHsgb2s6IGZhbHNlOyBlcnJvcjogc3RyaW5nIH0ge1xuICAgICAgICBjb25zdCBtID0gL15kYXRhOmltYWdlXFwvKHBuZ3xqcGVnfHdlYnApO2Jhc2U2NCwoLiopJC9pLmV4ZWMoZGF0YVVybCk7XG4gICAgICAgIGlmICghbSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogJ0dhbWVEZWJ1Z0NsaWVudCByZXR1cm5lZCBzY3JlZW5zaG90IGRhdGFVcmwgaW4gdW5leHBlY3RlZCBmb3JtYXQgKGV4cGVjdGVkIGRhdGE6aW1hZ2Uve3BuZ3xqcGVnfHdlYnB9O2Jhc2U2NCwuLi4pJyB9O1xuICAgICAgICB9XG4gICAgICAgIC8vIGJhc2U2NC1kZWNvZGVkIGJ5dGUgY291bnQgPSB+Y2VpbChiNjRMZW4gKiAzIC8gNCk7IHJlamVjdCBlYXJseVxuICAgICAgICAvLyBiZWZvcmUgYWxsb2NhdGluZyBhIG11bHRpLUdCIEJ1ZmZlci5cbiAgICAgICAgY29uc3QgYjY0TGVuID0gbVsyXS5sZW5ndGg7XG4gICAgICAgIGNvbnN0IGFwcHJveEJ5dGVzID0gTWF0aC5jZWlsKGI2NExlbiAqIDMgLyA0KTtcbiAgICAgICAgaWYgKGFwcHJveEJ5dGVzID4gRGVidWdUb29scy5NQVhfR0FNRV9TQ1JFRU5TSE9UX0JZVEVTKSB7XG4gICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBgc2NyZWVuc2hvdCBwYXlsb2FkIHRvbyBsYXJnZTogfiR7YXBwcm94Qnl0ZXN9IGJ5dGVzIGV4Y2VlZHMgY2FwICR7RGVidWdUb29scy5NQVhfR0FNRV9TQ1JFRU5TSE9UX0JZVEVTfWAgfTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBleHQgPSBtWzFdLnRvTG93ZXJDYXNlKCkgPT09ICdqcGVnJyA/ICdqcGcnIDogbVsxXS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICBjb25zdCBidWYgPSBCdWZmZXIuZnJvbShtWzJdLCAnYmFzZTY0Jyk7XG4gICAgICAgIGlmIChidWYubGVuZ3RoID4gRGVidWdUb29scy5NQVhfR0FNRV9TQ1JFRU5TSE9UX0JZVEVTKSB7XG4gICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBgc2NyZWVuc2hvdCBwYXlsb2FkIHRvbyBsYXJnZSBhZnRlciBkZWNvZGU6ICR7YnVmLmxlbmd0aH0gYnl0ZXMgZXhjZWVkcyBjYXAgJHtEZWJ1Z1Rvb2xzLk1BWF9HQU1FX1NDUkVFTlNIT1RfQllURVN9YCB9O1xuICAgICAgICB9XG4gICAgICAgIC8vIHYyLjYuMSByZXZpZXcgZml4IChjbGF1ZGUgTTIgKyBjb2RleCDwn5+hICsgZ2VtaW5pIPCfn6EpOiByZWFscGF0aCBib3RoXG4gICAgICAgIC8vIHNpZGVzIGZvciBhIHRydWUgY29udGFpbm1lbnQgY2hlY2suIHYyLjguMCBULVYyOC0yIGhvaXN0ZWQgdGhpc1xuICAgICAgICAvLyBwYXR0ZXJuIGludG8gcmVzb2x2ZUF1dG9DYXB0dXJlRmlsZSgpIHNvIHNjcmVlbnNob3QoKSAvIGNhcHR1cmUtXG4gICAgICAgIC8vIHByZXZpZXcgLyBiYXRjaC1zY3JlZW5zaG90IC8gcGVyc2lzdC1nYW1lIHNoYXJlIG9uZSBpbXBsZW1lbnRhdGlvbi5cbiAgICAgICAgY29uc3QgcmVzb2x2ZWQgPSB0aGlzLnJlc29sdmVBdXRvQ2FwdHVyZUZpbGUoYGdhbWUtJHtEYXRlLm5vdygpfS4ke2V4dH1gKTtcbiAgICAgICAgaWYgKCFyZXNvbHZlZC5vaykgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogcmVzb2x2ZWQuZXJyb3IgfTtcbiAgICAgICAgZnMud3JpdGVGaWxlU3luYyhyZXNvbHZlZC5maWxlUGF0aCwgYnVmKTtcbiAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUsIGZpbGVQYXRoOiByZXNvbHZlZC5maWxlUGF0aCwgc2l6ZTogYnVmLmxlbmd0aCB9O1xuICAgIH1cblxuICAgIC8vIHYyLjkueCBULVYyOS01OiBzYW1lIHNoYXBlIGFzIHBlcnNpc3RHYW1lU2NyZWVuc2hvdCBidXQgZm9yIHZpZGVvXG4gICAgLy8gcmVjb3JkaW5ncyAod2VibS9tcDQpIHJldHVybmVkIGJ5IHJlY29yZF9zdG9wLiBSZWNvcmRpbmdzIGNhbiBydW5cbiAgICAvLyB0ZW5zIG9mIHNlY29uZHMgYW5kIHByb2R1Y2Ugc2lnbmlmaWNhbnRseSBsYXJnZXIgcGF5bG9hZHMgdGhhblxuICAgIC8vIHN0aWxscy5cbiAgICAvL1xuICAgIC8vIHYyLjkuNSByZXZpZXcgZml4IChHZW1pbmkg8J+foSArIENvZGV4IPCfn6EpOiBidW1wZWQgMzIg4oaSIDY0IE1CIHRvXG4gICAgLy8gYWNjb21tb2RhdGUgaGlnaGVyLWJpdHJhdGUgLyBsb25nZXIgcmVjb3JkaW5ncyAoNS0yMCBNYnBzIMOXIDMwLTYwc1xuICAgIC8vID0gMTgtMTUwIE1CKS4gS2VwdCBpbiBzeW5jIHdpdGggTUFYX1JFUVVFU1RfQk9EWV9CWVRFUyBpblxuICAgIC8vIG1jcC1zZXJ2ZXItc2RrLnRzOyBsb3dlciBvbmUgdG8gZGlhbCBiYWNrIGlmIG1lbW9yeSBwcmVzc3VyZVxuICAgIC8vIGJlY29tZXMgYSBjb25jZXJuLiBiYXNlNjQtZGVjb2RlZCBieXRlIGNvdW50IGlzIHJlamVjdGVkIHByZS1kZWNvZGVcbiAgICAvLyB0byBhdm9pZCBCdWZmZXIgYWxsb2NhdGlvbiBzcGlrZXMgb24gbWFsaWNpb3VzIGNsaWVudHMuXG4gICAgcHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgTUFYX0dBTUVfUkVDT1JESU5HX0JZVEVTID0gNjQgKiAxMDI0ICogMTAyNDtcblxuICAgIHByaXZhdGUgcGVyc2lzdEdhbWVSZWNvcmRpbmcoZGF0YVVybDogc3RyaW5nKTogeyBvazogdHJ1ZTsgZmlsZVBhdGg6IHN0cmluZzsgc2l6ZTogbnVtYmVyIH0gfCB7IG9rOiBmYWxzZTsgZXJyb3I6IHN0cmluZyB9IHtcbiAgICAgICAgLy8gdjIuOS41IHJldmlldyBmaXggYXR0ZW1wdCAxIHVzZWQgYCgoPzo7W14sXSo/KSopYCDigJQgc3RpbGxcbiAgICAgICAgLy8gcmVqZWN0ZWQgYXQgY29kZWMtaW50ZXJuYWwgY29tbWFzIChlLmcuIGBjb2RlY3M9dnA5LG9wdXNgKVxuICAgICAgICAvLyBiZWNhdXNlIHRoZSBwZXItcGFyYW0gYFteLF0qYCBleGNsdWRlcyBjb21tYXMgaW5zaWRlIGFueSBvbmVcbiAgICAgICAgLy8gcGFyYW0ncyB2YWx1ZS4gdjIuOS42IHJvdW5kLTIgZml4IChHZW1pbmkg8J+UtCArIENsYXVkZSDwn5S0ICtcbiAgICAgICAgLy8gQ29kZXgg8J+UtCDigJQgMy1yZXZpZXdlciBjb25zZW5zdXMpOiBzcGxpdCBvbiB0aGUgdW5hbWJpZ3VvdXNcbiAgICAgICAgLy8gYDtiYXNlNjQsYCB0ZXJtaW5hdG9yLCBhY2NlcHQgQU5ZIGNoYXJhY3RlcnMgaW4gdGhlIHBhcmFtZXRlclxuICAgICAgICAvLyBzZWdtZW50LCBhbmQgdmFsaWRhdGUgdGhlIHBheWxvYWQgc2VwYXJhdGVseSBhcyBiYXNlNjRcbiAgICAgICAgLy8gYWxwaGFiZXQgb25seSAoQ29kZXggcjIgc2luZ2xlLfCfn6EgcHJvbW90ZWQpLlxuICAgICAgICAvL1xuICAgICAgICAvLyBVc2UgbGFzdEluZGV4T2YgZm9yIHRoZSBgO2Jhc2U2NCxgIGJvdW5kYXJ5IHNvIGEgcGFyYW0gdmFsdWVcbiAgICAgICAgLy8gdGhhdCBoYXBwZW5zIHRvIGNvbnRhaW4gdGhlIGxpdGVyYWwgc3Vic3RyaW5nIGA7YmFzZTY0LGAgKHZlcnlcbiAgICAgICAgLy8gdW5saWtlbHkgYnV0IGxlZ2FsIGluIE1JTUUgUkZDKSBpcyBzdGlsbCBwYXJzZWQgY29ycmVjdGx5IOKAlFxuICAgICAgICAvLyB0aGUgYWN0dWFsIGJhc2U2NCBhbHdheXMgZW5kcyB0aGUgVVJMLlxuICAgICAgICBjb25zdCBtID0gL15kYXRhOnZpZGVvXFwvKHdlYm18bXA0KShbXl0qPyk7YmFzZTY0LChbQS1aYS16MC05Ky9dKj17MCwyfSkkL2kuZXhlYyhkYXRhVXJsKTtcbiAgICAgICAgaWYgKCFtKSB7XG4gICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiAnR2FtZURlYnVnQ2xpZW50IHJldHVybmVkIHJlY29yZGluZyBkYXRhVXJsIGluIHVuZXhwZWN0ZWQgZm9ybWF0IChleHBlY3RlZCBkYXRhOnZpZGVvL3t3ZWJtfG1wNH1bO2NvZGVjcz0uLi5dO2Jhc2U2NCw8YmFzZTY0PikuIFRoZSBiYXNlNjQgc2VnbWVudCBtdXN0IGJlIGEgdmFsaWQgYmFzZTY0IGFscGhhYmV0IHN0cmluZy4nIH07XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgYjY0TGVuID0gbVszXS5sZW5ndGg7XG4gICAgICAgIGNvbnN0IGFwcHJveEJ5dGVzID0gTWF0aC5jZWlsKGI2NExlbiAqIDMgLyA0KTtcbiAgICAgICAgaWYgKGFwcHJveEJ5dGVzID4gRGVidWdUb29scy5NQVhfR0FNRV9SRUNPUkRJTkdfQllURVMpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGByZWNvcmRpbmcgcGF5bG9hZCB0b28gbGFyZ2U6IH4ke2FwcHJveEJ5dGVzfSBieXRlcyBleGNlZWRzIGNhcCAke0RlYnVnVG9vbHMuTUFYX0dBTUVfUkVDT1JESU5HX0JZVEVTfS4gTG93ZXIgdmlkZW9CaXRzUGVyU2Vjb25kIG9yIHJlZHVjZSByZWNvcmRpbmcgZHVyYXRpb24uYCB9O1xuICAgICAgICB9XG4gICAgICAgIC8vIG1bMV0gaXMgYWxyZWFkeSB0aGUgYmFyZSAnd2VibSd8J21wNCc7IG1bMl0gaXMgdGhlIHBhcmFtIHRhaWxcbiAgICAgICAgLy8gKGA7Y29kZWNzPS4uLmAsIG1heSBpbmNsdWRlIGNvZGVjLWludGVybmFsIGNvbW1hcyk7IG1bM10gaXMgdGhlXG4gICAgICAgIC8vIHZhbGlkYXRlZCBiYXNlNjQgcGF5bG9hZC5cbiAgICAgICAgY29uc3QgZXh0ID0gbVsxXS50b0xvd2VyQ2FzZSgpID09PSAnbXA0JyA/ICdtcDQnIDogJ3dlYm0nO1xuICAgICAgICBjb25zdCBidWYgPSBCdWZmZXIuZnJvbShtWzNdLCAnYmFzZTY0Jyk7XG4gICAgICAgIGlmIChidWYubGVuZ3RoID4gRGVidWdUb29scy5NQVhfR0FNRV9SRUNPUkRJTkdfQllURVMpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGByZWNvcmRpbmcgcGF5bG9hZCB0b28gbGFyZ2UgYWZ0ZXIgZGVjb2RlOiAke2J1Zi5sZW5ndGh9IGJ5dGVzIGV4Y2VlZHMgY2FwICR7RGVidWdUb29scy5NQVhfR0FNRV9SRUNPUkRJTkdfQllURVN9YCB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHJlc29sdmVkID0gdGhpcy5yZXNvbHZlQXV0b0NhcHR1cmVGaWxlKGByZWNvcmRpbmctJHtEYXRlLm5vdygpfS4ke2V4dH1gKTtcbiAgICAgICAgaWYgKCFyZXNvbHZlZC5vaykgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogcmVzb2x2ZWQuZXJyb3IgfTtcbiAgICAgICAgZnMud3JpdGVGaWxlU3luYyhyZXNvbHZlZC5maWxlUGF0aCwgYnVmKTtcbiAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUsIGZpbGVQYXRoOiByZXNvbHZlZC5maWxlUGF0aCwgc2l6ZTogYnVmLmxlbmd0aCB9O1xuICAgIH1cblxuICAgIC8vIHYyLjQuOCBBMTogVFMgZGlhZ25vc3RpY3MgaGFuZGxlcnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gICAgcHJpdmF0ZSBhc3luYyB3YWl0Q29tcGlsZUltcGwodGltZW91dE1zOiBudW1iZXIgPSAxNTAwMCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHByb2plY3RQYXRoID0gRWRpdG9yPy5Qcm9qZWN0Py5wYXRoO1xuICAgICAgICBpZiAoIXByb2plY3RQYXRoKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbCgnd2FpdF9jb21waWxlOiBlZGl0b3IgY29udGV4dCB1bmF2YWlsYWJsZSAobm8gRWRpdG9yLlByb2plY3QucGF0aCknKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB3YWl0Rm9yQ29tcGlsZShwcm9qZWN0UGF0aCwgdGltZW91dE1zKTtcbiAgICAgICAgaWYgKCFyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwocmVzdWx0LmVycm9yID8/ICd3YWl0X2NvbXBpbGUgZmFpbGVkJywgcmVzdWx0KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gb2socmVzdWx0LCByZXN1bHQuY29tcGlsZWRcbiAgICAgICAgICAgICAgICA/IGBDb21waWxlIGZpbmlzaGVkIGluICR7cmVzdWx0LndhaXRlZE1zfW1zYFxuICAgICAgICAgICAgICAgIDogKHJlc3VsdC5ub3RlID8/ICdObyBjb21waWxlIHRyaWdnZXJlZCBvciB0aW1lZCBvdXQnKSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBydW5TY3JpcHREaWFnbm9zdGljc0ltcGwodHNjb25maWdQYXRoPzogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgcHJvamVjdFBhdGggPSBFZGl0b3I/LlByb2plY3Q/LnBhdGg7XG4gICAgICAgIGlmICghcHJvamVjdFBhdGgpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKCdydW5fc2NyaXB0X2RpYWdub3N0aWNzOiBlZGl0b3IgY29udGV4dCB1bmF2YWlsYWJsZSAobm8gRWRpdG9yLlByb2plY3QucGF0aCknKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBydW5TY3JpcHREaWFnbm9zdGljcyhwcm9qZWN0UGF0aCwgeyB0c2NvbmZpZ1BhdGggfSk7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBzdWNjZXNzOiByZXN1bHQub2ssXG4gICAgICAgICAgICBtZXNzYWdlOiByZXN1bHQuc3VtbWFyeSxcbiAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICB0b29sOiByZXN1bHQudG9vbCxcbiAgICAgICAgICAgICAgICBiaW5hcnk6IHJlc3VsdC5iaW5hcnksXG4gICAgICAgICAgICAgICAgdHNjb25maWdQYXRoOiByZXN1bHQudHNjb25maWdQYXRoLFxuICAgICAgICAgICAgICAgIGV4aXRDb2RlOiByZXN1bHQuZXhpdENvZGUsXG4gICAgICAgICAgICAgICAgZGlhZ25vc3RpY3M6IHJlc3VsdC5kaWFnbm9zdGljcyxcbiAgICAgICAgICAgICAgICBkaWFnbm9zdGljQ291bnQ6IHJlc3VsdC5kaWFnbm9zdGljcy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgLy8gdjIuNC45IHJldmlldyBmaXg6IHNwYXduIGZhaWx1cmVzIChiaW5hcnkgbWlzc2luZyAvXG4gICAgICAgICAgICAgICAgLy8gcGVybWlzc2lvbiBkZW5pZWQpIHN1cmZhY2VkIGV4cGxpY2l0bHkgc28gQUkgY2FuXG4gICAgICAgICAgICAgICAgLy8gZGlzdGluZ3Vpc2ggXCJ0c2MgbmV2ZXIgcmFuXCIgZnJvbSBcInRzYyBmb3VuZCBlcnJvcnNcIi5cbiAgICAgICAgICAgICAgICBzcGF3bkZhaWxlZDogcmVzdWx0LnNwYXduRmFpbGVkID09PSB0cnVlLFxuICAgICAgICAgICAgICAgIHN5c3RlbUVycm9yOiByZXN1bHQuc3lzdGVtRXJyb3IsXG4gICAgICAgICAgICAgICAgLy8gVHJ1bmNhdGUgcmF3IHN0cmVhbXMgdG8ga2VlcCB0b29sIHJlc3VsdCByZWFzb25hYmxlO1xuICAgICAgICAgICAgICAgIC8vIGZ1bGwgY29udGVudCByYXJlbHkgdXNlZnVsIHdoZW4gdGhlIHBhcnNlciBhbHJlYWR5XG4gICAgICAgICAgICAgICAgLy8gc3RydWN0dXJlZCB0aGUgZXJyb3JzLlxuICAgICAgICAgICAgICAgIHN0ZG91dFRhaWw6IHJlc3VsdC5zdGRvdXQuc2xpY2UoLTIwMDApLFxuICAgICAgICAgICAgICAgIHN0ZGVyclRhaWw6IHJlc3VsdC5zdGRlcnIuc2xpY2UoLTIwMDApLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldFNjcmlwdERpYWdub3N0aWNDb250ZXh0SW1wbChcbiAgICAgICAgZmlsZTogc3RyaW5nLFxuICAgICAgICBsaW5lOiBudW1iZXIsXG4gICAgICAgIGNvbnRleHRMaW5lczogbnVtYmVyID0gNSxcbiAgICApOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBwcm9qZWN0UGF0aCA9IEVkaXRvcj8uUHJvamVjdD8ucGF0aDtcbiAgICAgICAgaWYgKCFwcm9qZWN0UGF0aCkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ2dldF9zY3JpcHRfZGlhZ25vc3RpY19jb250ZXh0OiBlZGl0b3IgY29udGV4dCB1bmF2YWlsYWJsZScpO1xuICAgICAgICB9XG4gICAgICAgIC8vIHYyLjkueCBwb2xpc2ggKEdlbWluaSByMiBzaW5nbGUt8J+foSBmcm9tIHYyLjguMSByZXZpZXcpOiBjb252ZXJnZVxuICAgICAgICAvLyBvbiBhc3NlcnRTYXZlUGF0aFdpdGhpblByb2plY3QuIFRoZSBwcmV2aW91cyBiZXNwb2tlIHJlYWxwYXRoXG4gICAgICAgIC8vICsgdG9Mb3dlckNhc2UgKyBwYXRoLnNlcCBjaGVjayBpcyBmdW5jdGlvbmFsbHkgc3Vic3VtZWQgYnkgdGhlXG4gICAgICAgIC8vIHNoYXJlZCBoZWxwZXIgKHdoaWNoIGl0c2VsZiBtb3ZlZCB0byB0aGUgcGF0aC5yZWxhdGl2ZS1iYXNlZFxuICAgICAgICAvLyBpc1BhdGhXaXRoaW5Sb290IGluIHYyLjkueCBwb2xpc2ggIzEsIGhhbmRsaW5nIGRyaXZlLXJvb3QgYW5kXG4gICAgICAgIC8vIHByZWZpeC1jb2xsaXNpb24gZWRnZXMgdW5pZm9ybWx5KS5cbiAgICAgICAgY29uc3QgZ3VhcmQgPSB0aGlzLmFzc2VydFNhdmVQYXRoV2l0aGluUHJvamVjdChmaWxlKTtcbiAgICAgICAgaWYgKCFndWFyZC5vaykge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoYGdldF9zY3JpcHRfZGlhZ25vc3RpY19jb250ZXh0OiAke2d1YXJkLmVycm9yfWApO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHJlc29sdmVkID0gZ3VhcmQucmVzb2x2ZWRQYXRoO1xuICAgICAgICBpZiAoIWZzLmV4aXN0c1N5bmMocmVzb2x2ZWQpKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChgZ2V0X3NjcmlwdF9kaWFnbm9zdGljX2NvbnRleHQ6IGZpbGUgbm90IGZvdW5kOiAke3Jlc29sdmVkfWApO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHN0YXQgPSBmcy5zdGF0U3luYyhyZXNvbHZlZCk7XG4gICAgICAgIGlmIChzdGF0LnNpemUgPiA1ICogMTAyNCAqIDEwMjQpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGBnZXRfc2NyaXB0X2RpYWdub3N0aWNfY29udGV4dDogZmlsZSB0b28gbGFyZ2UgKCR7c3RhdC5zaXplfSBieXRlcyk7IHJlZnVzaW5nIHRvIHJlYWQuYCk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgY29udGVudCA9IGZzLnJlYWRGaWxlU3luYyhyZXNvbHZlZCwgJ3V0ZjgnKTtcbiAgICAgICAgY29uc3QgYWxsTGluZXMgPSBjb250ZW50LnNwbGl0KC9cXHI/XFxuLyk7XG4gICAgICAgIGlmIChsaW5lIDwgMSB8fCBsaW5lID4gYWxsTGluZXMubGVuZ3RoKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChgZ2V0X3NjcmlwdF9kaWFnbm9zdGljX2NvbnRleHQ6IGxpbmUgJHtsaW5lfSBvdXQgb2YgcmFuZ2UgMS4uJHthbGxMaW5lcy5sZW5ndGh9YCk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qgc3RhcnQgPSBNYXRoLm1heCgxLCBsaW5lIC0gY29udGV4dExpbmVzKTtcbiAgICAgICAgY29uc3QgZW5kID0gTWF0aC5taW4oYWxsTGluZXMubGVuZ3RoLCBsaW5lICsgY29udGV4dExpbmVzKTtcbiAgICAgICAgY29uc3Qgd2luZG93ID0gYWxsTGluZXMuc2xpY2Uoc3RhcnQgLSAxLCBlbmQpO1xuICAgICAgICBjb25zdCBwcm9qZWN0UmVzb2x2ZWROb3JtID0gcGF0aC5yZXNvbHZlKHByb2plY3RQYXRoKTtcbiAgICAgICAgcmV0dXJuIG9rKHtcbiAgICAgICAgICAgICAgICBmaWxlOiBwYXRoLnJlbGF0aXZlKHByb2plY3RSZXNvbHZlZE5vcm0sIHJlc29sdmVkKSxcbiAgICAgICAgICAgICAgICBhYnNvbHV0ZVBhdGg6IHJlc29sdmVkLFxuICAgICAgICAgICAgICAgIHRhcmdldExpbmU6IGxpbmUsXG4gICAgICAgICAgICAgICAgc3RhcnRMaW5lOiBzdGFydCxcbiAgICAgICAgICAgICAgICBlbmRMaW5lOiBlbmQsXG4gICAgICAgICAgICAgICAgdG90YWxMaW5lczogYWxsTGluZXMubGVuZ3RoLFxuICAgICAgICAgICAgICAgIGxpbmVzOiB3aW5kb3cubWFwKCh0ZXh0LCBpKSA9PiAoeyBsaW5lOiBzdGFydCArIGksIHRleHQgfSkpLFxuICAgICAgICAgICAgfSwgYFJlYWQgJHt3aW5kb3cubGVuZ3RofSBsaW5lcyBvZiBjb250ZXh0IGFyb3VuZCAke3BhdGgucmVsYXRpdmUocHJvamVjdFJlc29sdmVkTm9ybSwgcmVzb2x2ZWQpfToke2xpbmV9YCk7XG4gICAgfVxufVxuIl19