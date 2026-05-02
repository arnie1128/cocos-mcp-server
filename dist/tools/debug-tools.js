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
                name: 'record_start',
                description: 'Start recording the running game canvas via the GameDebugClient (browser/PIE preview only). Wraps debug_game_command(type="record_start") for AI ergonomics. Returns immediately with { recording: true, mimeType }; the recording continues until debug_record_stop is called. Browser-only — fails on native cocos builds (MediaRecorder API requires a DOM canvas + captureStream). Single-flight per client: a second record_start while a recording is in progress returns success:false. Pair with debug_game_client_status to confirm a client is connected before calling.',
                inputSchema: schema_1.z.object({
                    mimeType: schema_1.z.enum(['video/webm', 'video/mp4']).optional().describe('Container/codec hint for MediaRecorder. Default: browser auto-pick (webm preferred where supported, falls back to mp4). Some browsers reject unsupported types — record_start surfaces a clear error in that case.'),
                    videoBitsPerSecond: schema_1.z.number().min(100000).max(20000000).optional().describe('Optional MediaRecorder bitrate hint in bits/sec. Lower → smaller files but lower quality. Browser default if omitted.'),
                    timeoutMs: schema_1.z.number().min(500).max(30000).default(5000).describe('Max wait for the GameDebugClient to acknowledge record_start. Recording itself runs until debug_record_stop. Default 5000ms.'),
                }),
                handler: a => { var _a; return this.recordStart(a.mimeType, a.videoBitsPerSecond, (_a = a.timeoutMs) !== null && _a !== void 0 ? _a : 5000); },
            },
            {
                name: 'record_stop',
                description: 'Stop the in-progress game canvas recording and persist the result to <project>/temp/mcp-captures/recording-<timestamp>.{webm|mp4}. Wraps debug_game_command(type="record_stop"). Returns { filePath, size, mimeType, durationMs }. Calling without a prior record_start returns success:false. The host applies the same realpath containment guard + 64MB byte cap (synced with the request body cap in mcp-server-sdk.ts; v2.9.6 raised both from 32 to 64MB); raise videoBitsPerSecond / reduce recording duration on cap rejection.',
                inputSchema: schema_1.z.object({
                    timeoutMs: schema_1.z.number().min(1000).max(120000).default(30000).describe('Max wait for the client to assemble + return the recording blob. Recordings of several seconds at high bitrate may need longer than the default 30s — raise on long recordings.'),
                }),
                handler: a => { var _a; return this.recordStop((_a = a.timeoutMs) !== null && _a !== void 0 ? _a : 30000); },
            },
            {
                name: 'game_client_status',
                description: 'Read GameDebugClient connection status: connected (polled within 2s), last poll timestamp, whether a command is queued. Use before debug_game_command to confirm the client is reachable.',
                inputSchema: schema_1.z.object({}),
                handler: () => this.gameClientStatus(),
            },
            {
                name: 'check_editor_health',
                description: 'Probe whether the cocos editor scene-script renderer is responsive. Useful after debug_preview_control(start) — landmine #16 documents that cocos 3.8.7 sometimes freezes the scene-script renderer (spinning indicator, Ctrl+R required). Strategy (v2.9.6): three probes — (1) host: device/query (main process, always responsive even when scene-script is wedged); (2) scene/query-is-ready typed channel — direct IPC into the scene module, hangs when scene renderer is frozen; (3) scene/query-node-tree typed channel — returns the full scene tree, forces an actual scene-graph walk through the wedged code path. Each probe has its own timeout race (default 1500ms each). Scene declared alive only when BOTH (2) returns true AND (3) returns a non-null tree within the timeout. Returns { hostAlive, sceneAlive, sceneLatencyMs, hostError, sceneError, totalProbeMs }. AI workflow: call after preview_control(start); if sceneAlive=false, surface "cocos editor likely frozen — press Ctrl+R" instead of issuing more scene-bound calls.',
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
        // query-node-tree to return non-null. Empty result string / null
        // / undefined all force sceneAlive=false so AI gets a clear
        // signal instead of an "alive but garbage" envelope.
        const dumpValid = dump.ok && dump.value !== null && dump.value !== undefined;
        const sceneAlive = isReady.ok && dumpValid && isReady.value === true;
        let sceneError = null;
        if (!isReady.ok)
            sceneError = isReady.error;
        else if (!dump.ok)
            sceneError = dump.error;
        else if (!dumpValid)
            sceneError = `scene/query-node-tree returned ${JSON.stringify(dump.value)} (expected non-null)`;
        else if (isReady.value !== true)
            sceneError = `scene/query-is-ready returned ${JSON.stringify(isReady.value)} (expected true)`;
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
        // v2.9.x T-V29-5: built-in record_stop path — same persistence
        // pattern as screenshot, but with webm/mp4 extension and a
        // separate size cap (recordings can be much larger than stills).
        if (type === 'record_stop' && result.data && typeof result.data.dataUrl === 'string') {
            const persisted = this.persistGameRecording(result.data.dataUrl);
            if (!persisted.ok) {
                return { success: false, error: persisted.error };
            }
            return {
                success: true,
                data: {
                    type,
                    filePath: persisted.filePath,
                    size: persisted.size,
                    mimeType: result.data.mimeType,
                    durationMs: result.data.durationMs,
                },
                message: `Game canvas recording saved to ${persisted.filePath} (${persisted.size} bytes, ${result.data.durationMs}ms)`,
            };
        }
        return { success: true, data: Object.assign({ type }, result.data), message: `Game command ${type} ok` };
    }
    // v2.9.x T-V29-5: thin wrappers around game_command for AI ergonomics.
    // Keep the dispatch path identical to game_command(type='record_*') so
    // there's only one persistence pipeline and one queue. AI still picks
    // these tools first because their schemas are explicit.
    async recordStart(mimeType, videoBitsPerSecond, timeoutMs = 5000) {
        const args = {};
        if (mimeType)
            args.mimeType = mimeType;
        if (typeof videoBitsPerSecond === 'number')
            args.videoBitsPerSecond = videoBitsPerSecond;
        return this.gameCommand('record_start', args, timeoutMs);
    }
    async recordStop(timeoutMs = 30000) {
        return this.gameCommand('record_stop', {}, timeoutMs);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWctdG9vbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvdG9vbHMvZGVidWctdG9vbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUEsd0RBQWtFO0FBQ2xFLDBDQUFrQztBQUNsQyxzREFBMkQ7QUFDM0QsMERBQTZFO0FBQzdFLGtFQUFrRztBQUNsRyxzREFBbUU7QUFDbkUsdUNBQXlCO0FBQ3pCLDJDQUE2QjtBQUU3QixrRUFBa0U7QUFDbEUsd0VBQXdFO0FBQ3hFLHlFQUF5RTtBQUN6RSxrRUFBa0U7QUFDbEUsaUNBQWlDO0FBQ2pDLEVBQUU7QUFDRixrRUFBa0U7QUFDbEUsbUVBQW1FO0FBQ25FLDZEQUE2RDtBQUM3RCxrRUFBa0U7QUFDbEUscUVBQXFFO0FBQ3JFLHNFQUFzRTtBQUN0RSxtRUFBbUU7QUFDbkUsOERBQThEO0FBQzlELG1FQUFtRTtBQUNuRSw4REFBOEQ7QUFDOUQsNENBQTRDO0FBQzVDLFNBQVMsZ0JBQWdCLENBQUMsU0FBaUIsRUFBRSxJQUFZO0lBQ3JELE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDeEMsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNuQyxJQUFJLE9BQU8sS0FBSyxPQUFPO1FBQUUsT0FBTyxJQUFJLENBQUM7SUFDckMsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFDNUMsSUFBSSxDQUFDLEdBQUc7UUFBRSxPQUFPLElBQUksQ0FBQyxDQUE4QixZQUFZO0lBQ2hFLHFFQUFxRTtJQUNyRSxrRUFBa0U7SUFDbEUsb0VBQW9FO0lBQ3BFLDZDQUE2QztJQUM3QyxJQUFJLEdBQUcsS0FBSyxJQUFJLElBQUksR0FBRyxDQUFDLFVBQVUsQ0FBQyxJ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RSwrREFBK0Q7QUFDL0Qsb0VBQW9FO0FBQ3BFLHlEQUF5RDtBQUN6RCxxQ0FBcUM7QUFDYixvQ0FBeUIsR0FBRyxFQUFFLEdBQUcsSUFBSSxHQUFHLElBQUksQ0FBQztBQTZCckUsb0VBQW9FO0FBQ3BFLG9FQUFvRTtBQUNwRSxpRUFBaUU7QUFDakUsVUFBVTtBQUNWLEVBQUU7QUFDRixpRUFBaUU7QUFDakUscUVBQXFFO0FBQ3JFLDREQUE0RDtBQUM1RCwrREFBK0Q7QUFDL0Qsc0VBQXNFO0FBQ3RFLDBEQUEwRDtBQUNsQyxtQ0FBd0IsR0FBRyxFQUFFLEdBQUcsSUFBSSxHQUFHLElBQUksQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFRvb2xEZWZpbml0aW9uLCBUb29sUmVzcG9uc2UsIFRvb2xFeGVjdXRvciwgUGVyZm9ybWFuY2VTdGF0cywgVmFsaWRhdGlvblJlc3VsdCwgVmFsaWRhdGlvbklzc3VlIH0gZnJvbSAnLi4vdHlwZXMnO1xuaW1wb3J0IHsgZGVidWdMb2cgfSBmcm9tICcuLi9saWIvbG9nJztcbmltcG9ydCB7IGlzRWRpdG9yQ29udGV4dEV2YWxFbmFibGVkIH0gZnJvbSAnLi4vbGliL3J1bnRpbWUtZmxhZ3MnO1xuaW1wb3J0IHsgeiB9IGZyb20gJy4uL2xpYi9zY2hlbWEnO1xuaW1wb3J0IHsgZGVmaW5lVG9vbHMsIFRvb2xEZWYgfSBmcm9tICcuLi9saWIvZGVmaW5lLXRvb2xzJztcbmltcG9ydCB7IHJ1blNjcmlwdERpYWdub3N0aWNzLCB3YWl0Rm9yQ29tcGlsZSB9IGZyb20gJy4uL2xpYi90cy1kaWFnbm9zdGljcyc7XG5pbXBvcnQgeyBxdWV1ZUdhbWVDb21tYW5kLCBhd2FpdENvbW1hbmRSZXN1bHQsIGdldENsaWVudFN0YXR1cyB9IGZyb20gJy4uL2xpYi9nYW1lLWNvbW1hbmQtcXVldWUnO1xuaW1wb3J0IHsgcnVuU2NlbmVNZXRob2RBc1Rvb2xSZXNwb25zZSB9IGZyb20gJy4uL2xpYi9zY2VuZS1icmlkZ2UnO1xuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcblxuLy8gdjIuOS54IHBvbGlzaDogY29udGFpbm1lbnQgaGVscGVyIHRoYXQgaGFuZGxlcyBkcml2ZS1yb290IGVkZ2VzXG4vLyAoQzpcXCksIHByZWZpeC1jb2xsaXNpb24gKEM6XFxmb28gdnMgQzpcXGZvb2JhciksIGFuZCBjcm9zcy12b2x1bWUgcGF0aHNcbi8vIChEOlxcLi4uIHdoZW4gcm9vdCBpcyBDOlxcKS4gVXNlcyBwYXRoLnJlbGF0aXZlIHdoaWNoIHJldHVybnMgYSByZWxhdGl2ZVxuLy8gZXhwcmVzc2lvbiDigJQgaWYgdGhlIHJlc3VsdCBzdGFydHMgd2l0aCBgLi5gIG9yIGlzIGFic29sdXRlLCB0aGVcbi8vIGNhbmRpZGF0ZSBpcyBvdXRzaWRlIHRoZSByb290LlxuLy9cbi8vIFRPQ1RPVSBub3RlIChDb2RleCByMSArIEdlbWluaSByMSBzaW5nbGUt8J+foSBmcm9tIHYyLjguMSByZXZpZXcsXG4vLyByZXZpZXdlZCB2Mi45LnggYW5kIGFjY2VwdGVkIGFzIHJlc2lkdWFsIHJpc2spOiB0aGVyZSBpcyBhIHNtYWxsXG4vLyByYWNlIHdpbmRvdyBiZXR3ZWVuIHJlYWxwYXRoU3luYyBjb250YWlubWVudCBjaGVjayBhbmQgdGhlXG4vLyBzdWJzZXF1ZW50IHdyaXRlRmlsZVN5bmMg4oCUIGEgbWFsaWNpb3VzIHN5bWxpbmsgc3dhcCBkdXJpbmcgdGhhdFxuLy8gd2luZG93IGNvdWxkIGVzY2FwZS4gRnVsbCBtaXRpZ2F0aW9uIG5lZWRzIE9fTk9GT0xMT1cgd2hpY2ggTm9kZSdzXG4vLyBmcyBBUEkgZG9lc24ndCBleHBvc2UgZGlyZWN0bHkuIEdpdmVuIHRoaXMgaXMgYSBsb2NhbCBkZXYgdG9vbCwgbm90XG4vLyBhIG5ldHdvcmstZmFjaW5nIHNlcnZpY2UsIGFuZCB0aGUgYXR0YWNrIHdpbmRvdyBpcyBtaWNyb3NlY29uZHMsXG4vLyB0aGUgcmlzayBpcyBhY2NlcHRlZCBmb3Igbm93LiBBIGZ1dHVyZSB2Mi54IHBhdGNoIGNvdWxkIGFkZFxuLy8gYGZzLm9wZW5TeW5jKGZpbGVQYXRoLCAnd3gnKWAgZm9yIEFVVE8tbmFtZWQgcGF0aHMgb25seSAoY2FsbGVyLVxuLy8gcHJvdmlkZWQgc2F2ZVBhdGggbmVlZHMgb3ZlcndyaXRlIHNlbWFudGljcykuIERvbid0IHJlbHkgb25cbi8vIGNvbnRhaW5tZW50IGZvciBzZWN1cml0eS1jcml0aWNhbCB3cml0ZXMuXG5mdW5jdGlvbiBpc1BhdGhXaXRoaW5Sb290KGNhbmRpZGF0ZTogc3RyaW5nLCByb290OiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICBjb25zdCBjYW5kQWJzID0gcGF0aC5yZXNvbHZlKGNhbmRpZGF0ZSk7XG4gICAgY29uc3Qgcm9vdEFicyA9IHBhdGgucmVzb2x2ZShyb290KTtcbiAgICBpZiAoY2FuZEFicyA9PT0gcm9vdEFicykgcmV0dXJuIHRydWU7XG4gICAgY29uc3QgcmVsID0gcGF0aC5yZWxhdGl2ZShyb290QWJzLCBjYW5kQWJzKTtcbiAgICBpZiAoIXJlbCkgcmV0dXJuIHRydWU7ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gaWRlbnRpY2FsXG4gICAgLy8gdjIuOS41IHJldmlldyBmaXggKENvZGV4IPCfn6EpOiBzdGFydHNXaXRoKCcuLicpIHdvdWxkIGFsc28gcmVqZWN0IGFcbiAgICAvLyBsZWdpdGltYXRlIGNoaWxkIHdob3NlIGZpcnN0IHBhdGggc2VnbWVudCBsaXRlcmFsbHkgc3RhcnRzIHdpdGhcbiAgICAvLyBcIi4uXCIgKGUuZy4gZGlyZWN0b3J5IG5hbWVkIFwiLi5mb29cIikuIE1hdGNoIGVpdGhlciBleGFjdGx5IGAuLmAgb3JcbiAgICAvLyBgLi5gIGZvbGxvd2VkIGJ5IGEgcGF0aCBzZXBhcmF0b3IgaW5zdGVhZC5cbiAgICBpZiAocmVsID09PSAnLi4nIHx8IHJlbC5zdGFydHNXaXRoKCcuLicgKyBwYXRoLnNlcCkpIHJldHVybiBmYWxzZTtcbiAgICBpZiAocGF0aC5pc0Fic29sdXRlKHJlbCkpIHJldHVybiBmYWxzZTsgICAgICAgICAgICAgLy8gZGlmZmVyZW50IGRyaXZlXG4gICAgcmV0dXJuIHRydWU7XG59XG5cbmV4cG9ydCBjbGFzcyBEZWJ1Z1Rvb2xzIGltcGxlbWVudHMgVG9vbEV4ZWN1dG9yIHtcbiAgICBwcml2YXRlIHJlYWRvbmx5IGV4ZWM6IFRvb2xFeGVjdXRvcjtcblxuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICBjb25zdCBkZWZzOiBUb29sRGVmW10gPSBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2NsZWFyX2NvbnNvbGUnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnQ2xlYXIgdGhlIENvY29zIEVkaXRvciBDb25zb2xlIFVJLiBObyBwcm9qZWN0IHNpZGUgZWZmZWN0cy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogKCkgPT4gdGhpcy5jbGVhckNvbnNvbGUoKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2V4ZWN1dGVfamF2YXNjcmlwdCcsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdbcHJpbWFyeV0gRXhlY3V0ZSBKYXZhU2NyaXB0IGluIHNjZW5lIG9yIGVkaXRvciBjb250ZXh0LiBVc2UgdGhpcyBhcyB0aGUgZGVmYXVsdCBmaXJzdCB0b29sIGZvciBjb21wb3VuZCBvcGVyYXRpb25zIChyZWFkIOKGkiBtdXRhdGUg4oaSIHZlcmlmeSkg4oCUIG9uZSBjYWxsIHJlcGxhY2VzIDUtMTAgbmFycm93IHNwZWNpYWxpc3QgdG9vbHMgYW5kIGF2b2lkcyBwZXItY2FsbCB0b2tlbiBvdmVyaGVhZC4gY29udGV4dD1cInNjZW5lXCIgaW5zcGVjdHMvbXV0YXRlcyBjYy5Ob2RlIGdyYXBoOyBjb250ZXh0PVwiZWRpdG9yXCIgcnVucyBpbiBob3N0IHByb2Nlc3MgZm9yIEVkaXRvci5NZXNzYWdlICsgZnMgKGRlZmF1bHQgb2ZmLCBvcHQtaW4pLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgY29kZTogei5zdHJpbmcoKS5kZXNjcmliZSgnSmF2YVNjcmlwdCBzb3VyY2UgdG8gZXhlY3V0ZS4gSGFzIGFjY2VzcyB0byBjYy4qIGluIHNjZW5lIGNvbnRleHQsIEVkaXRvci4qIGluIGVkaXRvciBjb250ZXh0LicpLFxuICAgICAgICAgICAgICAgICAgICBjb250ZXh0OiB6LmVudW0oWydzY2VuZScsICdlZGl0b3InXSkuZGVmYXVsdCgnc2NlbmUnKS5kZXNjcmliZSgnRXhlY3V0aW9uIHNhbmRib3guIFwic2NlbmVcIiBydW5zIGluc2lkZSB0aGUgY29jb3Mgc2NlbmUgc2NyaXB0IGNvbnRleHQgKGNjLCBkaXJlY3RvciwgZmluZCkuIFwiZWRpdG9yXCIgcnVucyBpbiB0aGUgZWRpdG9yIGhvc3QgcHJvY2VzcyAoRWRpdG9yLCBhc3NldC1kYiwgZnMsIHJlcXVpcmUpLiBFZGl0b3IgY29udGV4dCBpcyBPRkYgYnkgZGVmYXVsdCBhbmQgbXVzdCBiZSBvcHQtaW4gdmlhIHBhbmVsIHNldHRpbmcgYGVuYWJsZUVkaXRvckNvbnRleHRFdmFsYCDigJQgYXJiaXRyYXJ5IGNvZGUgaW4gdGhlIGhvc3QgcHJvY2VzcyBpcyBhIHByb21wdC1pbmplY3Rpb24gcmlzay4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMuZXhlY3V0ZUphdmFTY3JpcHQoYS5jb2RlLCBhLmNvbnRleHQgPz8gJ3NjZW5lJyksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdleGVjdXRlX3NjcmlwdCcsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdbY29tcGF0XSBTY2VuZS1vbmx5IEphdmFTY3JpcHQgZXZhbC4gUHJlZmVyIGV4ZWN1dGVfamF2YXNjcmlwdCB3aXRoIGNvbnRleHQ9XCJzY2VuZVwiIOKAlCBrZXB0IGFzIGNvbXBhdGliaWxpdHkgZW50cnlwb2ludCBmb3Igb2xkZXIgY2xpZW50cy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHNjcmlwdDogei5zdHJpbmcoKS5kZXNjcmliZSgnSmF2YVNjcmlwdCB0byBleGVjdXRlIGluIHNjZW5lIGNvbnRleHQgdmlhIGNvbnNvbGUvZXZhbC4gQ2FuIHJlYWQgb3IgbXV0YXRlIHRoZSBjdXJyZW50IHNjZW5lLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy5leGVjdXRlU2NyaXB0Q29tcGF0KGEuc2NyaXB0KSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2dldF9ub2RlX3RyZWUnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnUmVhZCBhIGRlYnVnIG5vZGUgdHJlZSBmcm9tIGEgcm9vdCBvciBzY2VuZSByb290IGZvciBoaWVyYXJjaHkvY29tcG9uZW50IGluc3BlY3Rpb24uJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICByb290VXVpZDogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdSb290IG5vZGUgVVVJRCB0byBleHBhbmQuIE9taXQgdG8gdXNlIHRoZSBjdXJyZW50IHNjZW5lIHJvb3QuJyksXG4gICAgICAgICAgICAgICAgICAgIG1heERlcHRoOiB6Lm51bWJlcigpLmRlZmF1bHQoMTApLmRlc2NyaWJlKCdNYXhpbXVtIHRyZWUgZGVwdGguIERlZmF1bHQgMTA7IGxhcmdlIHZhbHVlcyBjYW4gcmV0dXJuIGEgbG90IG9mIGRhdGEuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLmdldE5vZGVUcmVlKGEucm9vdFV1aWQsIGEubWF4RGVwdGgpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnZ2V0X3BlcmZvcm1hbmNlX3N0YXRzJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1RyeSB0byByZWFkIHNjZW5lIHF1ZXJ5LXBlcmZvcm1hbmNlIHN0YXRzOyBtYXkgcmV0dXJuIHVuYXZhaWxhYmxlIGluIGVkaXQgbW9kZS4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogKCkgPT4gdGhpcy5nZXRQZXJmb3JtYW5jZVN0YXRzKCksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICd2YWxpZGF0ZV9zY2VuZScsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdSdW4gYmFzaWMgY3VycmVudC1zY2VuZSBoZWFsdGggY2hlY2tzIGZvciBtaXNzaW5nIGFzc2V0cyBhbmQgbm9kZS1jb3VudCB3YXJuaW5ncy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIGNoZWNrTWlzc2luZ0Fzc2V0czogei5ib29sZWFuKCkuZGVmYXVsdCh0cnVlKS5kZXNjcmliZSgnQ2hlY2sgbWlzc2luZyBhc3NldCByZWZlcmVuY2VzIHdoZW4gdGhlIENvY29zIHNjZW5lIEFQSSBzdXBwb3J0cyBpdC4nKSxcbiAgICAgICAgICAgICAgICAgICAgY2hlY2tQZXJmb3JtYW5jZTogei5ib29sZWFuKCkuZGVmYXVsdCh0cnVlKS5kZXNjcmliZSgnUnVuIGJhc2ljIHBlcmZvcm1hbmNlIGNoZWNrcyBzdWNoIGFzIGhpZ2ggbm9kZSBjb3VudCB3YXJuaW5ncy4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMudmFsaWRhdGVTY2VuZSh7IGNoZWNrTWlzc2luZ0Fzc2V0czogYS5jaGVja01pc3NpbmdBc3NldHMsIGNoZWNrUGVyZm9ybWFuY2U6IGEuY2hlY2tQZXJmb3JtYW5jZSB9KSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2dldF9lZGl0b3JfaW5mbycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdSZWFkIEVkaXRvci9Db2Nvcy9wcm9qZWN0L3Byb2Nlc3MgaW5mb3JtYXRpb24gYW5kIG1lbW9yeSBzdW1tYXJ5LicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiAoKSA9PiB0aGlzLmdldEVkaXRvckluZm8oKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2dldF9wcm9qZWN0X2xvZ3MnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnUmVhZCB0ZW1wL2xvZ3MvcHJvamVjdC5sb2cgdGFpbCB3aXRoIG9wdGlvbmFsIGxldmVsL2tleXdvcmQgZmlsdGVycy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIGxpbmVzOiB6Lm51bWJlcigpLm1pbigxKS5tYXgoMTAwMDApLmRlZmF1bHQoMTAwKS5kZXNjcmliZSgnTnVtYmVyIG9mIGxpbmVzIHRvIHJlYWQgZnJvbSB0aGUgZW5kIG9mIHRlbXAvbG9ncy9wcm9qZWN0LmxvZy4gRGVmYXVsdCAxMDAuJyksXG4gICAgICAgICAgICAgICAgICAgIGZpbHRlcktleXdvcmQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnT3B0aW9uYWwgY2FzZS1pbnNlbnNpdGl2ZSBrZXl3b3JkIGZpbHRlci4nKSxcbiAgICAgICAgICAgICAgICAgICAgbG9nTGV2ZWw6IHouZW51bShbJ0VSUk9SJywgJ1dBUk4nLCAnSU5GTycsICdERUJVRycsICdUUkFDRScsICdBTEwnXSkuZGVmYXVsdCgnQUxMJykuZGVzY3JpYmUoJ09wdGlvbmFsIGxvZyBsZXZlbCBmaWx0ZXIuIEFMTCBkaXNhYmxlcyBsZXZlbCBmaWx0ZXJpbmcuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLmdldFByb2plY3RMb2dzKGEubGluZXMsIGEuZmlsdGVyS2V5d29yZCwgYS5sb2dMZXZlbCksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdnZXRfbG9nX2ZpbGVfaW5mbycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdSZWFkIHRlbXAvbG9ncy9wcm9qZWN0LmxvZyBwYXRoLCBzaXplLCBsaW5lIGNvdW50LCBhbmQgdGltZXN0YW1wcy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogKCkgPT4gdGhpcy5nZXRMb2dGaWxlSW5mbygpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnc2VhcmNoX3Byb2plY3RfbG9ncycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdTZWFyY2ggdGVtcC9sb2dzL3Byb2plY3QubG9nIGZvciBzdHJpbmcvcmVnZXggYW5kIHJldHVybiBsaW5lIGNvbnRleHQuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBwYXR0ZXJuOiB6LnN0cmluZygpLmRlc2NyaWJlKCdTZWFyY2ggc3RyaW5nIG9yIHJlZ2V4LiBJbnZhbGlkIHJlZ2V4IGlzIHRyZWF0ZWQgYXMgYSBsaXRlcmFsIHN0cmluZy4nKSxcbiAgICAgICAgICAgICAgICAgICAgbWF4UmVzdWx0czogei5udW1iZXIoKS5taW4oMSkubWF4KDEwMCkuZGVmYXVsdCgyMCkuZGVzY3JpYmUoJ01heGltdW0gbWF0Y2hlcyB0byByZXR1cm4uIERlZmF1bHQgMjAuJyksXG4gICAgICAgICAgICAgICAgICAgIGNvbnRleHRMaW5lczogei5udW1iZXIoKS5taW4oMCkubWF4KDEwKS5kZWZhdWx0KDIpLmRlc2NyaWJlKCdDb250ZXh0IGxpbmVzIGJlZm9yZS9hZnRlciBlYWNoIG1hdGNoLiBEZWZhdWx0IDIuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLnNlYXJjaFByb2plY3RMb2dzKGEucGF0dGVybiwgYS5tYXhSZXN1bHRzLCBhLmNvbnRleHRMaW5lcyksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdzY3JlZW5zaG90JyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ0NhcHR1cmUgdGhlIGZvY3VzZWQgQ29jb3MgRWRpdG9yIHdpbmRvdyAob3IgYSB3aW5kb3cgbWF0Y2hlZCBieSB0aXRsZSkgdG8gYSBQTkcuIFJldHVybnMgc2F2ZWQgZmlsZSBwYXRoLiBVc2UgdGhpcyBmb3IgQUkgdmlzdWFsIHZlcmlmaWNhdGlvbiBhZnRlciBzY2VuZS9VSSBjaGFuZ2VzLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgc2F2ZVBhdGg6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnQWJzb2x1dGUgZmlsZXN5c3RlbSBwYXRoIHRvIHNhdmUgdGhlIFBORy4gTXVzdCByZXNvbHZlIGluc2lkZSB0aGUgY29jb3MgcHJvamVjdCByb290IChjb250YWlubWVudCBjaGVjayB2aWEgcmVhbHBhdGgpLiBPbWl0IHRvIGF1dG8tbmFtZSBpbnRvIDxwcm9qZWN0Pi90ZW1wL21jcC1jYXB0dXJlcy9zY3JlZW5zaG90LTx0aW1lc3RhbXA+LnBuZy4nKSxcbiAgICAgICAgICAgICAgICAgICAgd2luZG93VGl0bGU6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnT3B0aW9uYWwgc3Vic3RyaW5nIG1hdGNoIG9uIHdpbmRvdyB0aXRsZSB0byBwaWNrIGEgc3BlY2lmaWMgRWxlY3Ryb24gd2luZG93LiBEZWZhdWx0OiBmb2N1c2VkIHdpbmRvdy4nKSxcbiAgICAgICAgICAgICAgICAgICAgaW5jbHVkZUJhc2U2NDogei5ib29sZWFuKCkuZGVmYXVsdChmYWxzZSkuZGVzY3JpYmUoJ0VtYmVkIFBORyBieXRlcyBhcyBiYXNlNjQgaW4gcmVzcG9uc2UgZGF0YSAobGFyZ2U7IGRlZmF1bHQgZmFsc2UpLiBXaGVuIGZhbHNlLCBvbmx5IHRoZSBzYXZlZCBmaWxlIHBhdGggaXMgcmV0dXJuZWQuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLnNjcmVlbnNob3QoYS5zYXZlUGF0aCwgYS53aW5kb3dUaXRsZSwgYS5pbmNsdWRlQmFzZTY0KSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2NhcHR1cmVfcHJldmlld19zY3JlZW5zaG90JyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ0NhcHR1cmUgdGhlIGNvY29zIFByZXZpZXctaW4tRWRpdG9yIChQSUUpIGdhbWV2aWV3IHRvIGEgUE5HLiBDb2NvcyBoYXMgbXVsdGlwbGUgUElFIHJlbmRlciB0YXJnZXRzIGRlcGVuZGluZyBvbiB0aGUgdXNlclxcJ3MgcHJldmlldyBjb25maWcgKFByZWZlcmVuY2VzIOKGkiBQcmV2aWV3IOKGkiBPcGVuIFByZXZpZXcgV2l0aCk6IFwiYnJvd3NlclwiIG9wZW5zIGFuIGV4dGVybmFsIGJyb3dzZXIgKE5PVCBjYXB0dXJhYmxlIGhlcmUpLCBcIndpbmRvd1wiIC8gXCJzaW11bGF0b3JcIiBvcGVucyBhIHNlcGFyYXRlIEVsZWN0cm9uIHdpbmRvdyAodGl0bGUgY29udGFpbnMgXCJQcmV2aWV3XCIpLCBcImVtYmVkZGVkXCIgcmVuZGVycyB0aGUgZ2FtZXZpZXcgaW5zaWRlIHRoZSBtYWluIGVkaXRvciB3aW5kb3cuIFRoZSBkZWZhdWx0IG1vZGU9XCJhdXRvXCIgdHJpZXMgdGhlIFByZXZpZXctdGl0bGVkIHdpbmRvdyBmaXJzdCBhbmQgZmFsbHMgYmFjayB0byBjYXB0dXJpbmcgdGhlIG1haW4gZWRpdG9yIHdpbmRvdyB3aGVuIG5vIFByZXZpZXctdGl0bGVkIHdpbmRvdyBleGlzdHMgKGNvdmVycyBlbWJlZGRlZCBtb2RlKS4gVXNlIG1vZGU9XCJ3aW5kb3dcIiB0byBmb3JjZSB0aGUgc2VwYXJhdGUtd2luZG93IHN0cmF0ZWd5IG9yIG1vZGU9XCJlbWJlZGRlZFwiIHRvIHNraXAgdGhlIHdpbmRvdyBwcm9iZS4gUGFpciB3aXRoIGRlYnVnX2dldF9wcmV2aWV3X21vZGUgdG8gcmVhZCB0aGUgY29jb3MgY29uZmlnIGFuZCByb3V0ZSBkZXRlcm1pbmlzdGljYWxseS4gRm9yIHJ1bnRpbWUgZ2FtZS1jYW52YXMgcGl4ZWwtbGV2ZWwgY2FwdHVyZSAoY2FtZXJhIFJlbmRlclRleHR1cmUpLCB1c2UgZGVidWdfZ2FtZV9jb21tYW5kKHR5cGU9XCJzY3JlZW5zaG90XCIpIGluc3RlYWQuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBzYXZlUGF0aDogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdBYnNvbHV0ZSBmaWxlc3lzdGVtIHBhdGggdG8gc2F2ZSB0aGUgUE5HLiBNdXN0IHJlc29sdmUgaW5zaWRlIHRoZSBjb2NvcyBwcm9qZWN0IHJvb3QgKGNvbnRhaW5tZW50IGNoZWNrIHZpYSByZWFscGF0aCkuIE9taXQgdG8gYXV0by1uYW1lIGludG8gPHByb2plY3Q+L3RlbXAvbWNwLWNhcHR1cmVzL3ByZXZpZXctPHRpbWVzdGFtcD4ucG5nLicpLFxuICAgICAgICAgICAgICAgICAgICBtb2RlOiB6LmVudW0oWydhdXRvJywgJ3dpbmRvdycsICdlbWJlZGRlZCddKS5kZWZhdWx0KCdhdXRvJykuZGVzY3JpYmUoJ0NhcHR1cmUgdGFyZ2V0LiBcImF1dG9cIiAoZGVmYXVsdCkgdHJpZXMgUHJldmlldy10aXRsZWQgd2luZG93IHRoZW4gZmFsbHMgYmFjayB0byB0aGUgbWFpbiBlZGl0b3Igd2luZG93LiBcIndpbmRvd1wiIG9ubHkgbWF0Y2hlcyBQcmV2aWV3LXRpdGxlZCB3aW5kb3dzIChmYWlscyBpZiBub25lKS4gXCJlbWJlZGRlZFwiIGNhcHR1cmVzIHRoZSBtYWluIGVkaXRvciB3aW5kb3cgZGlyZWN0bHkgKHNraXAgUHJldmlldy13aW5kb3cgcHJvYmUpLicpLFxuICAgICAgICAgICAgICAgICAgICB3aW5kb3dUaXRsZTogei5zdHJpbmcoKS5kZWZhdWx0KCdQcmV2aWV3JykuZGVzY3JpYmUoJ1N1YnN0cmluZyBtYXRjaGVkIGFnYWluc3Qgd2luZG93IHRpdGxlcyBpbiB3aW5kb3cvYXV0byBtb2RlcyAoZGVmYXVsdCBcIlByZXZpZXdcIiBmb3IgUElFKS4gSWdub3JlZCBpbiBlbWJlZGRlZCBtb2RlLicpLFxuICAgICAgICAgICAgICAgICAgICBpbmNsdWRlQmFzZTY0OiB6LmJvb2xlYW4oKS5kZWZhdWx0KGZhbHNlKS5kZXNjcmliZSgnRW1iZWQgUE5HIGJ5dGVzIGFzIGJhc2U2NCBpbiByZXNwb25zZSBkYXRhIChsYXJnZTsgZGVmYXVsdCBmYWxzZSkuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLmNhcHR1cmVQcmV2aWV3U2NyZWVuc2hvdChhLnNhdmVQYXRoLCBhLm1vZGUgPz8gJ2F1dG8nLCBhLndpbmRvd1RpdGxlLCBhLmluY2x1ZGVCYXNlNjQpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnZ2V0X3ByZXZpZXdfbW9kZScsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdSZWFkIHRoZSBjb2NvcyBwcmV2aWV3IGNvbmZpZ3VyYXRpb24gdmlhIEVkaXRvci5NZXNzYWdlIHByZWZlcmVuY2VzL3F1ZXJ5LWNvbmZpZyBzbyBBSSBjYW4gcm91dGUgZGVidWdfY2FwdHVyZV9wcmV2aWV3X3NjcmVlbnNob3QgdG8gdGhlIGNvcnJlY3QgbW9kZS4gUmV0dXJucyB7IGludGVycHJldGVkOiBcImJyb3dzZXJcIiB8IFwid2luZG93XCIgfCBcInNpbXVsYXRvclwiIHwgXCJlbWJlZGRlZFwiIHwgXCJ1bmtub3duXCIsIHJhdzogPGZ1bGwgcHJldmlldyBjb25maWcgZHVtcD4gfS4gVXNlIGJlZm9yZSBjYXB0dXJlOiBpZiBpbnRlcnByZXRlZD1cImVtYmVkZGVkXCIsIGNhbGwgY2FwdHVyZV9wcmV2aWV3X3NjcmVlbnNob3Qgd2l0aCBtb2RlPVwiZW1iZWRkZWRcIiBvciByZWx5IG9uIG1vZGU9XCJhdXRvXCIgZmFsbGJhY2suJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6ICgpID0+IHRoaXMuZ2V0UHJldmlld01vZGUoKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3NldF9wcmV2aWV3X21vZGUnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAn4pqgIEVYUEVSSU1FTlRBTCDigJQgZG9lcyBOT1QgYWN0dWFsbHkgZmxpcCBjb2NvcyAzLjguNyBwcmV2aWV3IG1vZGUgKHZlcmlmaWVkIGxpdmUgdjIuOS4xLCBzZWUgbGFuZG1pbmUgIzE3KS4gU3dpdGNoIGNvY29zIHByZXZpZXcgbW9kZSBwcm9ncmFtbWF0aWNhbGx5IHZpYSB0aGUgdHlwZWQgRWRpdG9yLk1lc3NhZ2UgcHJlZmVyZW5jZXMvc2V0LWNvbmZpZyBjaGFubmVsLiB2Mi45LjEgYXR0ZW1wdHMgNCBrbm93biBzaGFwZXMgKG5lc3RlZCBvYmplY3QgLyBkb3QtcGF0aCB3aXRoIGdsb2JhbC9sb2NhbCBwcm90b2NvbCAvIG5vIHByb3RvY29sKSBhbmQgdmVyaWZpZXMgdmlhIHJlYWQtYmFjazsgYWxsIDQgc2lsZW50bHkgbm8tb3Agb24gY29jb3MgMy44Ljcg4oCUIHNldC1jb25maWcgcmV0dXJucyB0cnV0aHkgYnV0IHByZXZpZXcuY3VycmVudC5wbGF0Zm9ybSBpcyBuZXZlciBwZXJzaXN0ZWQsIHN1Z2dlc3RpbmcgY29jb3MgdHJlYXRzIHRoaXMgYXMgYSByZWFkb25seSBjYXRlZ29yeSBvciBkZXJpdmVzIGN1cnJlbnQucGxhdGZvcm0gZnJvbSBub24tcHJlZnMgcnVudGltZSBzdGF0ZS4gVG9vbCBzdGlsbCB1c2VmdWwgZm9yIGRpYWdub3N0aWNzOiBkYXRhLmF0dGVtcHRzIHJlY29yZHMgZXZlcnkgc2hhcGUgdHJpZWQgYW5kIGl0cyByZWFkLWJhY2sgb2JzZXJ2YXRpb24uIEZvciBub3csIHN3aXRjaCB0aGUgcHJldmlldyBtb2RlIHZpYSB0aGUgY29jb3MgZHJvcGRvd24gbWFudWFsbHkuIFBlbmRpbmcgcmVmZXJlbmNlLXByb2plY3QgY29tcGFyaXNvbiAodjIuOSBjYW5kaWRhdGUpIHRvIGZpbmQgdGhlIGNvcnJlY3Qgd3JpdGUgcGF0aC4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIG1vZGU6IHouZW51bShbJ2Jyb3dzZXInLCAnZ2FtZVZpZXcnLCAnc2ltdWxhdG9yJ10pLmRlc2NyaWJlKCdUYXJnZXQgcHJldmlldyBwbGF0Zm9ybS4gXCJicm93c2VyXCIgb3BlbnMgcHJldmlldyBpbiB0aGUgdXNlciBkZWZhdWx0IGJyb3dzZXIuIFwiZ2FtZVZpZXdcIiBlbWJlZHMgdGhlIGdhbWV2aWV3IGluIHRoZSBtYWluIGVkaXRvciAoaW4tZWRpdG9yIHByZXZpZXcpLiBcInNpbXVsYXRvclwiIGxhdW5jaGVzIHRoZSBjb2NvcyBzaW11bGF0b3IuIE1hcHMgZGlyZWN0bHkgdG8gdGhlIGNvY29zIHByZXZpZXcuY3VycmVudC5wbGF0Zm9ybSB2YWx1ZS4nKSxcbiAgICAgICAgICAgICAgICAgICAgY29uZmlybTogei5ib29sZWFuKCkuZGVmYXVsdChmYWxzZSkuZGVzY3JpYmUoJ1JlcXVpcmVkIHRvIGNvbW1pdCB0aGUgY2hhbmdlLiBEZWZhdWx0IGZhbHNlIHJldHVybnMgdGhlIGN1cnJlbnQgdmFsdWUgcGx1cyBhIGhpbnQsIHdpdGhvdXQgbW9kaWZ5aW5nIHByZWZlcmVuY2VzLiBTZXQgdHJ1ZSB0byBhY3R1YWxseSB3cml0ZS4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMuc2V0UHJldmlld01vZGUoYS5tb2RlLCBhLmNvbmZpcm0gPz8gZmFsc2UpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnYmF0Y2hfc2NyZWVuc2hvdCcsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdDYXB0dXJlIG11bHRpcGxlIFBOR3Mgb2YgdGhlIGVkaXRvciB3aW5kb3cgd2l0aCBvcHRpb25hbCBkZWxheXMgYmV0d2VlbiBzaG90cy4gVXNlZnVsIGZvciBhbmltYXRpbmcgcHJldmlldyB2ZXJpZmljYXRpb24gb3IgY2FwdHVyaW5nIHRyYW5zaXRpb25zLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgc2F2ZVBhdGhQcmVmaXg6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnUGF0aCBwcmVmaXggZm9yIGJhdGNoIG91dHB1dCBmaWxlcy4gRmlsZXMgd3JpdHRlbiBhcyA8cHJlZml4Pi08aW5kZXg+LnBuZy4gTXVzdCByZXNvbHZlIGluc2lkZSB0aGUgY29jb3MgcHJvamVjdCByb290IChjb250YWlubWVudCBjaGVjayB2aWEgcmVhbHBhdGgpLiBEZWZhdWx0OiA8cHJvamVjdD4vdGVtcC9tY3AtY2FwdHVyZXMvYmF0Y2gtPHRpbWVzdGFtcD4uJyksXG4gICAgICAgICAgICAgICAgICAgIGRlbGF5c01zOiB6LmFycmF5KHoubnVtYmVyKCkubWluKDApLm1heCgxMDAwMCkpLm1heCgyMCkuZGVmYXVsdChbMF0pLmRlc2NyaWJlKCdEZWxheSAobXMpIGJlZm9yZSBlYWNoIGNhcHR1cmUuIExlbmd0aCBkZXRlcm1pbmVzIGhvdyBtYW55IHNob3RzIHRha2VuIChjYXBwZWQgYXQgMjAgdG8gcHJldmVudCBkaXNrIGZpbGwgLyBlZGl0b3IgZnJlZXplKS4gRGVmYXVsdCBbMF0gPSBzaW5nbGUgc2hvdC4nKSxcbiAgICAgICAgICAgICAgICAgICAgd2luZG93VGl0bGU6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnT3B0aW9uYWwgc3Vic3RyaW5nIG1hdGNoIG9uIHdpbmRvdyB0aXRsZS4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMuYmF0Y2hTY3JlZW5zaG90KGEuc2F2ZVBhdGhQcmVmaXgsIGEuZGVsYXlzTXMsIGEud2luZG93VGl0bGUpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnd2FpdF9jb21waWxlJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ0Jsb2NrIHVudGlsIGNvY29zIGZpbmlzaGVzIGl0cyBUeXBlU2NyaXB0IGNvbXBpbGUgcGFzcy4gVGFpbHMgdGVtcC9wcm9ncmFtbWluZy9wYWNrZXItZHJpdmVyL2xvZ3MvZGVidWcubG9nIGZvciB0aGUgXCJUYXJnZXQoZWRpdG9yKSBlbmRzXCIgbWFya2VyLiBSZXR1cm5zIGltbWVkaWF0ZWx5IHdpdGggY29tcGlsZWQ9ZmFsc2UgaWYgbm8gY29tcGlsZSB3YXMgdHJpZ2dlcmVkIChjbGVhbiBwcm9qZWN0IC8gbm8gY2hhbmdlcyBkZXRlY3RlZCkuIFBhaXIgd2l0aCBydW5fc2NyaXB0X2RpYWdub3N0aWNzIGZvciBhbiBcImVkaXQgLnRzIOKGkiB3YWl0IOKGkiBmZXRjaCBlcnJvcnNcIiB3b3JrZmxvdy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHRpbWVvdXRNczogei5udW1iZXIoKS5taW4oNTAwKS5tYXgoMTIwMDAwKS5kZWZhdWx0KDE1MDAwKS5kZXNjcmliZSgnTWF4IHdhaXQgdGltZSBpbiBtcyBiZWZvcmUgZ2l2aW5nIHVwLiBEZWZhdWx0IDE1MDAwLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy53YWl0Q29tcGlsZShhLnRpbWVvdXRNcyksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdydW5fc2NyaXB0X2RpYWdub3N0aWNzJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1J1biBgdHNjIC0tbm9FbWl0YCBhZ2FpbnN0IHRoZSBwcm9qZWN0IHRzY29uZmlnIGFuZCByZXR1cm4gcGFyc2VkIGRpYWdub3N0aWNzLiBVc2VkIGFmdGVyIHdhaXRfY29tcGlsZSB0byBzdXJmYWNlIGNvbXBpbGF0aW9uIGVycm9ycyBhcyBzdHJ1Y3R1cmVkIHtmaWxlLCBsaW5lLCBjb2x1bW4sIGNvZGUsIG1lc3NhZ2V9IGVudHJpZXMuIFJlc29sdmVzIHRzYyBiaW5hcnkgZnJvbSBwcm9qZWN0IG5vZGVfbW9kdWxlcyDihpIgZWRpdG9yIGJ1bmRsZWQgZW5naW5lIOKGkiBucHggZmFsbGJhY2suJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICB0c2NvbmZpZ1BhdGg6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnT3B0aW9uYWwgb3ZlcnJpZGUgKGFic29sdXRlIG9yIHByb2plY3QtcmVsYXRpdmUpLiBEZWZhdWx0OiB0c2NvbmZpZy5qc29uIG9yIHRlbXAvdHNjb25maWcuY29jb3MuanNvbi4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMucnVuU2NyaXB0RGlhZ25vc3RpY3MoYS50c2NvbmZpZ1BhdGgpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAncHJldmlld191cmwnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnUmVzb2x2ZSB0aGUgY29jb3MgYnJvd3Nlci1wcmV2aWV3IFVSTCAoZS5nLiBodHRwOi8vbG9jYWxob3N0Ojc0NTYpIHZpYSB0aGUgZG9jdW1lbnRlZCBFZGl0b3IuTWVzc2FnZSBjaGFubmVsIHByZXZpZXcvcXVlcnktcHJldmlldy11cmwuIFdpdGggYWN0aW9uPVwib3BlblwiLCBhbHNvIGxhdW5jaGVzIHRoZSBVUkwgaW4gdGhlIHVzZXIgZGVmYXVsdCBicm93c2VyIHZpYSBlbGVjdHJvbi5zaGVsbC5vcGVuRXh0ZXJuYWwg4oCUIHVzZWZ1bCBhcyBhIHNldHVwIHN0ZXAgYmVmb3JlIGRlYnVnX2dhbWVfY29tbWFuZCwgc2luY2UgdGhlIEdhbWVEZWJ1Z0NsaWVudCBydW5uaW5nIGluc2lkZSB0aGUgcHJldmlldyBtdXN0IGJlIHJlYWNoYWJsZS4gRWRpdG9yLXNpZGUgUHJldmlldy1pbi1FZGl0b3IgcGxheS9zdG9wIGlzIE5PVCBleHBvc2VkIGJ5IHRoZSBwdWJsaWMgbWVzc2FnZSBBUEkgYW5kIGlzIGludGVudGlvbmFsbHkgbm90IGltcGxlbWVudGVkIGhlcmU7IHVzZSB0aGUgY29jb3MgZWRpdG9yIHRvb2xiYXIgbWFudWFsbHkgZm9yIFBJRS4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIGFjdGlvbjogei5lbnVtKFsncXVlcnknLCAnb3BlbiddKS5kZWZhdWx0KCdxdWVyeScpLmRlc2NyaWJlKCdcInF1ZXJ5XCIgcmV0dXJucyB0aGUgVVJMOyBcIm9wZW5cIiByZXR1cm5zIHRoZSBVUkwgQU5EIG9wZW5zIGl0IGluIHRoZSB1c2VyIGRlZmF1bHQgYnJvd3NlciB2aWEgZWxlY3Ryb24uc2hlbGwub3BlbkV4dGVybmFsLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy5wcmV2aWV3VXJsKGEuYWN0aW9uKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3F1ZXJ5X2RldmljZXMnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnTGlzdCBwcmV2aWV3IGRldmljZXMgY29uZmlndXJlZCBpbiB0aGUgY29jb3MgcHJvamVjdCAoY2MuSURldmljZUl0ZW0gZW50cmllcykuIEJhY2tlZCBieSBFZGl0b3IuTWVzc2FnZSBjaGFubmVsIGRldmljZS9xdWVyeS4gUmV0dXJucyBhbiBhcnJheSBvZiB7bmFtZSwgd2lkdGgsIGhlaWdodCwgcmF0aW99IGVudHJpZXMg4oCUIHVzZWZ1bCBmb3IgYmF0Y2gtc2NyZWVuc2hvdCBwaXBlbGluZXMgdGhhdCB0YXJnZXQgbXVsdGlwbGUgcmVzb2x1dGlvbnMuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6ICgpID0+IHRoaXMucXVlcnlEZXZpY2VzKCksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdnYW1lX2NvbW1hbmQnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnU2VuZCBhIHJ1bnRpbWUgY29tbWFuZCB0byBhIEdhbWVEZWJ1Z0NsaWVudCBydW5uaW5nIGluc2lkZSBhIGNvY29zIHByZXZpZXcvYnVpbGQgKGJyb3dzZXIsIFByZXZpZXctaW4tRWRpdG9yLCBvciBhbnkgZGV2aWNlIHRoYXQgZmV0Y2hlcyAvZ2FtZS9jb21tYW5kKS4gQnVpbHQtaW4gY29tbWFuZCB0eXBlczogXCJzY3JlZW5zaG90XCIgKGNhcHR1cmUgZ2FtZSBjYW52YXMgdG8gUE5HLCByZXR1cm5zIHNhdmVkIGZpbGUgcGF0aCksIFwiY2xpY2tcIiAoZW1pdCBCdXR0b24uQ0xJQ0sgb24gYSBub2RlIGJ5IG5hbWUpLCBcImluc3BlY3RcIiAoZHVtcCBydW50aW1lIG5vZGUgaW5mbzogcG9zaXRpb24vc2NhbGUvcm90YXRpb24vY29udGVudFNpemUvYWN0aXZlL2NvbXBvbmVudHMgYnkgbmFtZSkuIEN1c3RvbSBjb21tYW5kIHR5cGVzIGFyZSBmb3J3YXJkZWQgdG8gdGhlIGNsaWVudFxcJ3MgY3VzdG9tQ29tbWFuZHMgbWFwIChlLmcuIFwic3RhdGVcIiwgXCJuYXZpZ2F0ZVwiKS4gUmVxdWlyZXMgdGhlIEdhbWVEZWJ1Z0NsaWVudCB0ZW1wbGF0ZSAoY2xpZW50L2NvY29zLW1jcC1jbGllbnQudHMpIHdpcmVkIGludG8gdGhlIHJ1bm5pbmcgZ2FtZTsgd2l0aG91dCBpdCB0aGUgY2FsbCB0aW1lcyBvdXQuIENoZWNrIEdFVCAvZ2FtZS9zdGF0dXMgdG8gdmVyaWZ5IGNsaWVudCBsaXZlbmVzcyBmaXJzdC4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHR5cGU6IHouc3RyaW5nKCkubWluKDEpLmRlc2NyaWJlKCdDb21tYW5kIHR5cGUuIEJ1aWx0LWluczogc2NyZWVuc2hvdCwgY2xpY2ssIGluc3BlY3QuIEN1c3RvbXM6IGFueSBzdHJpbmcgdGhlIEdhbWVEZWJ1Z0NsaWVudCByZWdpc3RlcmVkIGluIGN1c3RvbUNvbW1hbmRzLicpLFxuICAgICAgICAgICAgICAgICAgICBhcmdzOiB6LmFueSgpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0NvbW1hbmQtc3BlY2lmaWMgYXJndW1lbnRzLiBGb3IgXCJjbGlja1wiL1wiaW5zcGVjdFwiOiB7bmFtZTogc3RyaW5nfSBub2RlIG5hbWUuIEZvciBcInNjcmVlbnNob3RcIjoge30gKG5vIGFyZ3MpLicpLFxuICAgICAgICAgICAgICAgICAgICB0aW1lb3V0TXM6IHoubnVtYmVyKCkubWluKDUwMCkubWF4KDYwMDAwKS5kZWZhdWx0KDEwMDAwKS5kZXNjcmliZSgnTWF4IHdhaXQgZm9yIGNsaWVudCByZXNwb25zZS4gRGVmYXVsdCAxMDAwMG1zLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy5nYW1lQ29tbWFuZChhLnR5cGUsIGEuYXJncywgYS50aW1lb3V0TXMpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAncmVjb3JkX3N0YXJ0JyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1N0YXJ0IHJlY29yZGluZyB0aGUgcnVubmluZyBnYW1lIGNhbnZhcyB2aWEgdGhlIEdhbWVEZWJ1Z0NsaWVudCAoYnJvd3Nlci9QSUUgcHJldmlldyBvbmx5KS4gV3JhcHMgZGVidWdfZ2FtZV9jb21tYW5kKHR5cGU9XCJyZWNvcmRfc3RhcnRcIikgZm9yIEFJIGVyZ29ub21pY3MuIFJldHVybnMgaW1tZWRpYXRlbHkgd2l0aCB7IHJlY29yZGluZzogdHJ1ZSwgbWltZVR5cGUgfTsgdGhlIHJlY29yZGluZyBjb250aW51ZXMgdW50aWwgZGVidWdfcmVjb3JkX3N0b3AgaXMgY2FsbGVkLiBCcm93c2VyLW9ubHkg4oCUIGZhaWxzIG9uIG5hdGl2ZSBjb2NvcyBidWlsZHMgKE1lZGlhUmVjb3JkZXIgQVBJIHJlcXVpcmVzIGEgRE9NIGNhbnZhcyArIGNhcHR1cmVTdHJlYW0pLiBTaW5nbGUtZmxpZ2h0IHBlciBjbGllbnQ6IGEgc2Vjb25kIHJlY29yZF9zdGFydCB3aGlsZSBhIHJlY29yZGluZyBpcyBpbiBwcm9ncmVzcyByZXR1cm5zIHN1Y2Nlc3M6ZmFsc2UuIFBhaXIgd2l0aCBkZWJ1Z19nYW1lX2NsaWVudF9zdGF0dXMgdG8gY29uZmlybSBhIGNsaWVudCBpcyBjb25uZWN0ZWQgYmVmb3JlIGNhbGxpbmcuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBtaW1lVHlwZTogei5lbnVtKFsndmlkZW8vd2VibScsICd2aWRlby9tcDQnXSkub3B0aW9uYWwoKS5kZXNjcmliZSgnQ29udGFpbmVyL2NvZGVjIGhpbnQgZm9yIE1lZGlhUmVjb3JkZXIuIERlZmF1bHQ6IGJyb3dzZXIgYXV0by1waWNrICh3ZWJtIHByZWZlcnJlZCB3aGVyZSBzdXBwb3J0ZWQsIGZhbGxzIGJhY2sgdG8gbXA0KS4gU29tZSBicm93c2VycyByZWplY3QgdW5zdXBwb3J0ZWQgdHlwZXMg4oCUIHJlY29yZF9zdGFydCBzdXJmYWNlcyBhIGNsZWFyIGVycm9yIGluIHRoYXQgY2FzZS4nKSxcbiAgICAgICAgICAgICAgICAgICAgdmlkZW9CaXRzUGVyU2Vjb25kOiB6Lm51bWJlcigpLm1pbigxMDBfMDAwKS5tYXgoMjBfMDAwXzAwMCkub3B0aW9uYWwoKS5kZXNjcmliZSgnT3B0aW9uYWwgTWVkaWFSZWNvcmRlciBiaXRyYXRlIGhpbnQgaW4gYml0cy9zZWMuIExvd2VyIOKGkiBzbWFsbGVyIGZpbGVzIGJ1dCBsb3dlciBxdWFsaXR5LiBCcm93c2VyIGRlZmF1bHQgaWYgb21pdHRlZC4nKSxcbiAgICAgICAgICAgICAgICAgICAgdGltZW91dE1zOiB6Lm51bWJlcigpLm1pbig1MDApLm1heCgzMDAwMCkuZGVmYXVsdCg1MDAwKS5kZXNjcmliZSgnTWF4IHdhaXQgZm9yIHRoZSBHYW1lRGVidWdDbGllbnQgdG8gYWNrbm93bGVkZ2UgcmVjb3JkX3N0YXJ0LiBSZWNvcmRpbmcgaXRzZWxmIHJ1bnMgdW50aWwgZGVidWdfcmVjb3JkX3N0b3AuIERlZmF1bHQgNTAwMG1zLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy5yZWNvcmRTdGFydChhLm1pbWVUeXBlLCBhLnZpZGVvQml0c1BlclNlY29uZCwgYS50aW1lb3V0TXMgPz8gNTAwMCksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdyZWNvcmRfc3RvcCcsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdTdG9wIHRoZSBpbi1wcm9ncmVzcyBnYW1lIGNhbnZhcyByZWNvcmRpbmcgYW5kIHBlcnNpc3QgdGhlIHJlc3VsdCB0byA8cHJvamVjdD4vdGVtcC9tY3AtY2FwdHVyZXMvcmVjb3JkaW5nLTx0aW1lc3RhbXA+Lnt3ZWJtfG1wNH0uIFdyYXBzIGRlYnVnX2dhbWVfY29tbWFuZCh0eXBlPVwicmVjb3JkX3N0b3BcIikuIFJldHVybnMgeyBmaWxlUGF0aCwgc2l6ZSwgbWltZVR5cGUsIGR1cmF0aW9uTXMgfS4gQ2FsbGluZyB3aXRob3V0IGEgcHJpb3IgcmVjb3JkX3N0YXJ0IHJldHVybnMgc3VjY2VzczpmYWxzZS4gVGhlIGhvc3QgYXBwbGllcyB0aGUgc2FtZSByZWFscGF0aCBjb250YWlubWVudCBndWFyZCArIDY0TUIgYnl0ZSBjYXAgKHN5bmNlZCB3aXRoIHRoZSByZXF1ZXN0IGJvZHkgY2FwIGluIG1jcC1zZXJ2ZXItc2RrLnRzOyB2Mi45LjYgcmFpc2VkIGJvdGggZnJvbSAzMiB0byA2NE1CKTsgcmFpc2UgdmlkZW9CaXRzUGVyU2Vjb25kIC8gcmVkdWNlIHJlY29yZGluZyBkdXJhdGlvbiBvbiBjYXAgcmVqZWN0aW9uLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgdGltZW91dE1zOiB6Lm51bWJlcigpLm1pbigxMDAwKS5tYXgoMTIwMDAwKS5kZWZhdWx0KDMwMDAwKS5kZXNjcmliZSgnTWF4IHdhaXQgZm9yIHRoZSBjbGllbnQgdG8gYXNzZW1ibGUgKyByZXR1cm4gdGhlIHJlY29yZGluZyBibG9iLiBSZWNvcmRpbmdzIG9mIHNldmVyYWwgc2Vjb25kcyBhdCBoaWdoIGJpdHJhdGUgbWF5IG5lZWQgbG9uZ2VyIHRoYW4gdGhlIGRlZmF1bHQgMzBzIOKAlCByYWlzZSBvbiBsb25nIHJlY29yZGluZ3MuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLnJlY29yZFN0b3AoYS50aW1lb3V0TXMgPz8gMzAwMDApLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnZ2FtZV9jbGllbnRfc3RhdHVzJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1JlYWQgR2FtZURlYnVnQ2xpZW50IGNvbm5lY3Rpb24gc3RhdHVzOiBjb25uZWN0ZWQgKHBvbGxlZCB3aXRoaW4gMnMpLCBsYXN0IHBvbGwgdGltZXN0YW1wLCB3aGV0aGVyIGEgY29tbWFuZCBpcyBxdWV1ZWQuIFVzZSBiZWZvcmUgZGVidWdfZ2FtZV9jb21tYW5kIHRvIGNvbmZpcm0gdGhlIGNsaWVudCBpcyByZWFjaGFibGUuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6ICgpID0+IHRoaXMuZ2FtZUNsaWVudFN0YXR1cygpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnY2hlY2tfZWRpdG9yX2hlYWx0aCcsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdQcm9iZSB3aGV0aGVyIHRoZSBjb2NvcyBlZGl0b3Igc2NlbmUtc2NyaXB0IHJlbmRlcmVyIGlzIHJlc3BvbnNpdmUuIFVzZWZ1bCBhZnRlciBkZWJ1Z19wcmV2aWV3X2NvbnRyb2woc3RhcnQpIOKAlCBsYW5kbWluZSAjMTYgZG9jdW1lbnRzIHRoYXQgY29jb3MgMy44Ljcgc29tZXRpbWVzIGZyZWV6ZXMgdGhlIHNjZW5lLXNjcmlwdCByZW5kZXJlciAoc3Bpbm5pbmcgaW5kaWNhdG9yLCBDdHJsK1IgcmVxdWlyZWQpLiBTdHJhdGVneSAodjIuOS42KTogdGhyZWUgcHJvYmVzIOKAlCAoMSkgaG9zdDogZGV2aWNlL3F1ZXJ5IChtYWluIHByb2Nlc3MsIGFsd2F5cyByZXNwb25zaXZlIGV2ZW4gd2hlbiBzY2VuZS1zY3JpcHQgaXMgd2VkZ2VkKTsgKDIpIHNjZW5lL3F1ZXJ5LWlzLXJlYWR5IHR5cGVkIGNoYW5uZWwg4oCUIGRpcmVjdCBJUEMgaW50byB0aGUgc2NlbmUgbW9kdWxlLCBoYW5ncyB3aGVuIHNjZW5lIHJlbmRlcmVyIGlzIGZyb3plbjsgKDMpIHNjZW5lL3F1ZXJ5LW5vZGUtdHJlZSB0eXBlZCBjaGFubmVsIOKAlCByZXR1cm5zIHRoZSBmdWxsIHNjZW5lIHRyZWUsIGZvcmNlcyBhbiBhY3R1YWwgc2NlbmUtZ3JhcGggd2FsayB0aHJvdWdoIHRoZSB3ZWRnZWQgY29kZSBwYXRoLiBFYWNoIHByb2JlIGhhcyBpdHMgb3duIHRpbWVvdXQgcmFjZSAoZGVmYXVsdCAxNTAwbXMgZWFjaCkuIFNjZW5lIGRlY2xhcmVkIGFsaXZlIG9ubHkgd2hlbiBCT1RIICgyKSByZXR1cm5zIHRydWUgQU5EICgzKSByZXR1cm5zIGEgbm9uLW51bGwgdHJlZSB3aXRoaW4gdGhlIHRpbWVvdXQuIFJldHVybnMgeyBob3N0QWxpdmUsIHNjZW5lQWxpdmUsIHNjZW5lTGF0ZW5jeU1zLCBob3N0RXJyb3IsIHNjZW5lRXJyb3IsIHRvdGFsUHJvYmVNcyB9LiBBSSB3b3JrZmxvdzogY2FsbCBhZnRlciBwcmV2aWV3X2NvbnRyb2woc3RhcnQpOyBpZiBzY2VuZUFsaXZlPWZhbHNlLCBzdXJmYWNlIFwiY29jb3MgZWRpdG9yIGxpa2VseSBmcm96ZW4g4oCUIHByZXNzIEN0cmwrUlwiIGluc3RlYWQgb2YgaXNzdWluZyBtb3JlIHNjZW5lLWJvdW5kIGNhbGxzLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgc2NlbmVUaW1lb3V0TXM6IHoubnVtYmVyKCkubWluKDIwMCkubWF4KDEwMDAwKS5kZWZhdWx0KDE1MDApLmRlc2NyaWJlKCdUaW1lb3V0IGZvciB0aGUgc2NlbmUtc2NyaXB0IHByb2JlIGluIG1zLiBCZWxvdyB0aGlzIHNjZW5lIGlzIGNvbnNpZGVyZWQgZnJvemVuLiBEZWZhdWx0IDE1MDBtcy4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMuY2hlY2tFZGl0b3JIZWFsdGgoYS5zY2VuZVRpbWVvdXRNcyA/PyAxNTAwKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3ByZXZpZXdfY29udHJvbCcsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICfimqAgUEFSS0VEIOKAlCBrbm93biB0byBmcmVlemUgY29jb3MgMy44LjcgKGxhbmRtaW5lICMxNikuIFByb2dyYW1tYXRpY2FsbHkgc3RhcnQgb3Igc3RvcCBQcmV2aWV3LWluLUVkaXRvciAoUElFKSBwbGF5IG1vZGUuIFdyYXBzIHRoZSB0eXBlZCBjY2UuU2NlbmVGYWNhZGVNYW5hZ2VyLmNoYW5nZVByZXZpZXdQbGF5U3RhdGUgbWV0aG9kLiAqKnN0YXJ0IGhpdHMgYSBjb2NvcyAzLjguNyBzb2Z0UmVsb2FkU2NlbmUgcmFjZSoqIHRoYXQgcmV0dXJucyBzdWNjZXNzIGJ1dCBmcmVlemVzIHRoZSBlZGl0b3IgKHNwaW5uaW5nIGluZGljYXRvciwgQ3RybCtSIHJlcXVpcmVkIHRvIHJlY292ZXIpLiBWZXJpZmllZCBpbiBib3RoIGVtYmVkZGVkIGFuZCBicm93c2VyIHByZXZpZXcgbW9kZXMuICoqc3RvcCBpcyBzYWZlKiogYW5kIHJlbGlhYmxlLiBUbyBwcmV2ZW50IGFjY2lkZW50YWwgdHJpZ2dlcmluZywgc3RhcnQgbm93IHJlcXVpcmVzIGV4cGxpY2l0IGBhY2tub3dsZWRnZUZyZWV6ZVJpc2s6IHRydWVgLiAqKlJlY29tbWVuZGVkIGFsdGVybmF0aXZlcyBpbnN0ZWFkIG9mIHN0YXJ0Kio6IChhKSBkZWJ1Z19jYXB0dXJlX3ByZXZpZXdfc2NyZWVuc2hvdChtb2RlPVwiZW1iZWRkZWRcIikgaW4gRURJVCBtb2RlIOKAlCBubyBQSUUgbmVlZGVkOyAoYikgZGVidWdfZ2FtZV9jb21tYW5kKHR5cGU9XCJzY3JlZW5zaG90XCIpIHZpYSBHYW1lRGVidWdDbGllbnQgb24gYnJvd3NlciBwcmV2aWV3LiBQZW5kaW5nIHYyLjkgcmVmZXJlbmNlLXByb2plY3QgY29tcGFyaXNvbiB0byBmaW5kIGEgc2FmZXIgY2FsbCBwYXRoLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgb3A6IHouZW51bShbJ3N0YXJ0JywgJ3N0b3AnXSkuZGVzY3JpYmUoJ1wic3RhcnRcIiBlbnRlcnMgUElFIHBsYXkgbW9kZSAoZXF1aXZhbGVudCB0byBjbGlja2luZyB0aGUgdG9vbGJhciBwbGF5IGJ1dHRvbikg4oCUIFJFUVVJUkVTIGFja25vd2xlZGdlRnJlZXplUmlzaz10cnVlIG9uIGNvY29zIDMuOC43IGR1ZSB0byBsYW5kbWluZSAjMTYuIFwic3RvcFwiIGV4aXRzIFBJRSBwbGF5IGFuZCByZXR1cm5zIHRvIHNjZW5lIG1vZGUgKGFsd2F5cyBzYWZlKS4nKSxcbiAgICAgICAgICAgICAgICAgICAgYWNrbm93bGVkZ2VGcmVlemVSaXNrOiB6LmJvb2xlYW4oKS5kZWZhdWx0KGZhbHNlKS5kZXNjcmliZSgnUmVxdWlyZWQgdG8gYmUgdHJ1ZSBmb3Igb3A9XCJzdGFydFwiIG9uIGNvY29zIDMuOC43IGR1ZSB0byBsYW5kbWluZSAjMTYgKHNvZnRSZWxvYWRTY2VuZSByYWNlIHRoYXQgZnJlZXplcyB0aGUgZWRpdG9yKS4gU2V0IHRydWUgT05MWSB3aGVuIHRoZSBodW1hbiB1c2VyIGhhcyBleHBsaWNpdGx5IGFjY2VwdGVkIHRoZSByaXNrIGFuZCBpcyBwcmVwYXJlZCB0byBwcmVzcyBDdHJsK1IgaWYgdGhlIGVkaXRvciBmcmVlemVzLiBJZ25vcmVkIGZvciBvcD1cInN0b3BcIiB3aGljaCBpcyByZWxpYWJsZS4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMucHJldmlld0NvbnRyb2woYS5vcCwgYS5hY2tub3dsZWRnZUZyZWV6ZVJpc2sgPz8gZmFsc2UpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnZ2V0X3NjcmlwdF9kaWFnbm9zdGljX2NvbnRleHQnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnUmVhZCBhIHdpbmRvdyBvZiBzb3VyY2UgbGluZXMgYXJvdW5kIGEgZGlhZ25vc3RpYyBsb2NhdGlvbiBzbyBBSSBjYW4gcmVhZCB0aGUgb2ZmZW5kaW5nIGNvZGUgd2l0aG91dCBhIHNlcGFyYXRlIGZpbGUgcmVhZC4gUGFpciB3aXRoIHJ1bl9zY3JpcHRfZGlhZ25vc3RpY3M6IHBhc3MgZmlsZS9saW5lIGZyb20gZWFjaCBkaWFnbm9zdGljIHRvIGZldGNoIGNvbnRleHQuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBmaWxlOiB6LnN0cmluZygpLmRlc2NyaWJlKCdBYnNvbHV0ZSBvciBwcm9qZWN0LXJlbGF0aXZlIHBhdGggdG8gdGhlIHNvdXJjZSBmaWxlLiBEaWFnbm9zdGljcyBmcm9tIHJ1bl9zY3JpcHRfZGlhZ25vc3RpY3MgYWxyZWFkeSB1c2UgYSBwYXRoIHRzYyBlbWl0dGVkLCB3aGljaCBpcyBzdWl0YWJsZSBoZXJlLicpLFxuICAgICAgICAgICAgICAgICAgICBsaW5lOiB6Lm51bWJlcigpLm1pbigxKS5kZXNjcmliZSgnMS1iYXNlZCBsaW5lIG51bWJlciB0aGF0IHRoZSBkaWFnbm9zdGljIHBvaW50cyBhdC4nKSxcbiAgICAgICAgICAgICAgICAgICAgY29udGV4dExpbmVzOiB6Lm51bWJlcigpLm1pbigwKS5tYXgoNTApLmRlZmF1bHQoNSkuZGVzY3JpYmUoJ051bWJlciBvZiBsaW5lcyB0byBpbmNsdWRlIGJlZm9yZSBhbmQgYWZ0ZXIgdGhlIHRhcmdldCBsaW5lLiBEZWZhdWx0IDUgKMKxNSDihpIgMTEtbGluZSB3aW5kb3cpLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy5nZXRTY3JpcHREaWFnbm9zdGljQ29udGV4dChhLmZpbGUsIGEubGluZSwgYS5jb250ZXh0TGluZXMpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgXTtcbiAgICAgICAgdGhpcy5leGVjID0gZGVmaW5lVG9vbHMoZGVmcyk7XG4gICAgfVxuXG4gICAgZ2V0VG9vbHMoKTogVG9vbERlZmluaXRpb25bXSB7IHJldHVybiB0aGlzLmV4ZWMuZ2V0VG9vbHMoKTsgfVxuICAgIGV4ZWN1dGUodG9vbE5hbWU6IHN0cmluZywgYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHsgcmV0dXJuIHRoaXMuZXhlYy5leGVjdXRlKHRvb2xOYW1lLCBhcmdzKTsgfVxuXG4gICAgLy8gQ29tcGF0IHBhdGg6IHByZXNlcnZlIHRoZSBwcmUtdjIuMy4wIHJlc3BvbnNlIHNoYXBlXG4gICAgLy8ge3N1Y2Nlc3MsIGRhdGE6IHtyZXN1bHQsIG1lc3NhZ2U6ICdTY3JpcHQgZXhlY3V0ZWQgc3VjY2Vzc2Z1bGx5J319XG4gICAgLy8gc28gb2xkZXIgY2FsbGVycyByZWFkaW5nIGRhdGEubWVzc2FnZSBrZWVwIHdvcmtpbmcuXG4gICAgcHJpdmF0ZSBhc3luYyBleGVjdXRlU2NyaXB0Q29tcGF0KHNjcmlwdDogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3Qgb3V0ID0gYXdhaXQgdGhpcy5leGVjdXRlSmF2YVNjcmlwdChzY3JpcHQsICdzY2VuZScpO1xuICAgICAgICBpZiAob3V0LnN1Y2Nlc3MgJiYgb3V0LmRhdGEgJiYgJ3Jlc3VsdCcgaW4gb3V0LmRhdGEpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdDogb3V0LmRhdGEucmVzdWx0LFxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiAnU2NyaXB0IGV4ZWN1dGVkIHN1Y2Nlc3NmdWxseScsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG91dDtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGNsZWFyQ29uc29sZSgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gTm90ZTogRWRpdG9yLk1lc3NhZ2Uuc2VuZCBtYXkgbm90IHJldHVybiBhIHByb21pc2UgaW4gYWxsIHZlcnNpb25zXG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5zZW5kKCdjb25zb2xlJywgJ2NsZWFyJyk7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogJ0NvbnNvbGUgY2xlYXJlZCBzdWNjZXNzZnVsbHknXG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnIubWVzc2FnZSB9O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBleGVjdXRlSmF2YVNjcmlwdChjb2RlOiBzdHJpbmcsIGNvbnRleHQ6ICdzY2VuZScgfCAnZWRpdG9yJyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGlmIChjb250ZXh0ID09PSAnc2NlbmUnKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5leGVjdXRlSW5TY2VuZUNvbnRleHQoY29kZSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGNvbnRleHQgPT09ICdlZGl0b3InKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5leGVjdXRlSW5FZGl0b3JDb250ZXh0KGNvZGUpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYFVua25vd24gZXhlY3V0ZV9qYXZhc2NyaXB0IGNvbnRleHQ6ICR7Y29udGV4dH1gIH07XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBleGVjdXRlSW5TY2VuZUNvbnRleHQoY29kZTogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdleGVjdXRlLXNjZW5lLXNjcmlwdCcsIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnY29uc29sZScsXG4gICAgICAgICAgICAgICAgbWV0aG9kOiAnZXZhbCcsXG4gICAgICAgICAgICAgICAgYXJnczogW2NvZGVdXG4gICAgICAgICAgICB9KS50aGVuKChyZXN1bHQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb250ZXh0OiAnc2NlbmUnLFxuICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0OiByZXN1bHQsXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdTY2VuZSBzY3JpcHQgZXhlY3V0ZWQgc3VjY2Vzc2Z1bGx5J1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGV4ZWN1dGVJbkVkaXRvckNvbnRleHQoY29kZTogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgaWYgKCFpc0VkaXRvckNvbnRleHRFdmFsRW5hYmxlZCgpKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgIGVycm9yOiAnRWRpdG9yIGNvbnRleHQgZXZhbCBpcyBkaXNhYmxlZC4gRW5hYmxlIGBlbmFibGVFZGl0b3JDb250ZXh0RXZhbGAgaW4gTUNQIHNlcnZlciBzZXR0aW5ncyAocGFuZWwgVUkpIHRvIG9wdCBpbi4gVGhpcyBncmFudHMgQUktZ2VuZXJhdGVkIGNvZGUgYWNjZXNzIHRvIEVkaXRvci5NZXNzYWdlICsgTm9kZSBmcyBBUElzIGluIHRoZSBob3N0IHByb2Nlc3M7IG9ubHkgZW5hYmxlIHdoZW4geW91IHRydXN0IHRoZSB1cHN0cmVhbSBwcm9tcHQgc291cmNlLicsXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBXcmFwIGluIGFzeW5jIElJRkUgc28gQUkgY2FuIHVzZSB0b3AtbGV2ZWwgYXdhaXQgdHJhbnNwYXJlbnRseTtcbiAgICAgICAgICAgIC8vIGFsc28gZ2l2ZXMgdXMgYSBjbGVhbiBQcm9taXNlLWJhc2VkIHJldHVybiBwYXRoIHJlZ2FyZGxlc3Mgb2ZcbiAgICAgICAgICAgIC8vIHdoZXRoZXIgdGhlIHVzZXIgY29kZSByZXR1cm5zIGEgUHJvbWlzZSBvciBhIHN5bmMgdmFsdWUuXG4gICAgICAgICAgICBjb25zdCB3cmFwcGVkID0gYChhc3luYyAoKSA9PiB7ICR7Y29kZX0gXFxuIH0pKClgO1xuICAgICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWV2YWxcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0ICgwLCBldmFsKSh3cmFwcGVkKTtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRleHQ6ICdlZGl0b3InLFxuICAgICAgICAgICAgICAgICAgICByZXN1bHQ6IHJlc3VsdCxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdFZGl0b3Igc2NyaXB0IGV4ZWN1dGVkIHN1Y2Nlc3NmdWxseScsXG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBlcnJvcjogYEVkaXRvciBldmFsIGZhaWxlZDogJHtlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycil9YCxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldE5vZGVUcmVlKHJvb3RVdWlkPzogc3RyaW5nLCBtYXhEZXB0aDogbnVtYmVyID0gMTApOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGJ1aWxkVHJlZSA9IGFzeW5jIChub2RlVXVpZDogc3RyaW5nLCBkZXB0aDogbnVtYmVyID0gMCk6IFByb21pc2U8YW55PiA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGRlcHRoID49IG1heERlcHRoKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7IHRydW5jYXRlZDogdHJ1ZSB9O1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG5vZGVEYXRhID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktbm9kZScsIG5vZGVVdWlkKTtcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRyZWUgPSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiBub2RlRGF0YS51dWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogbm9kZURhdGEubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGFjdGl2ZTogbm9kZURhdGEuYWN0aXZlLFxuICAgICAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50czogKG5vZGVEYXRhIGFzIGFueSkuY29tcG9uZW50cyA/IChub2RlRGF0YSBhcyBhbnkpLmNvbXBvbmVudHMubWFwKChjOiBhbnkpID0+IGMuX190eXBlX18pIDogW10sXG4gICAgICAgICAgICAgICAgICAgICAgICBjaGlsZENvdW50OiBub2RlRGF0YS5jaGlsZHJlbiA/IG5vZGVEYXRhLmNoaWxkcmVuLmxlbmd0aCA6IDAsXG4gICAgICAgICAgICAgICAgICAgICAgICBjaGlsZHJlbjogW10gYXMgYW55W11cbiAgICAgICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAobm9kZURhdGEuY2hpbGRyZW4gJiYgbm9kZURhdGEuY2hpbGRyZW4ubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBjaGlsZElkIG9mIG5vZGVEYXRhLmNoaWxkcmVuKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY2hpbGRUcmVlID0gYXdhaXQgYnVpbGRUcmVlKGNoaWxkSWQsIGRlcHRoICsgMSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHJlZS5jaGlsZHJlbi5wdXNoKGNoaWxkVHJlZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJlZTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4geyBlcnJvcjogZXJyLm1lc3NhZ2UgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBpZiAocm9vdFV1aWQpIHtcbiAgICAgICAgICAgICAgICBidWlsZFRyZWUocm9vdFV1aWQpLnRoZW4odHJlZSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoeyBzdWNjZXNzOiB0cnVlLCBkYXRhOiB0cmVlIH0pO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1oaWVyYXJjaHknKS50aGVuKGFzeW5jIChoaWVyYXJjaHk6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB0cmVlcyA9IFtdO1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IHJvb3ROb2RlIG9mIGhpZXJhcmNoeS5jaGlsZHJlbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgdHJlZSA9IGF3YWl0IGJ1aWxkVHJlZShyb290Tm9kZS51dWlkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyZWVzLnB1c2godHJlZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IHRyZWVzIH0pO1xuICAgICAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVyci5tZXNzYWdlIH0pO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldFBlcmZvcm1hbmNlU3RhdHMoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1wZXJmb3JtYW5jZScpLnRoZW4oKHN0YXRzOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBwZXJmU3RhdHM6IFBlcmZvcm1hbmNlU3RhdHMgPSB7XG4gICAgICAgICAgICAgICAgICAgIG5vZGVDb3VudDogc3RhdHMubm9kZUNvdW50IHx8IDAsXG4gICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudENvdW50OiBzdGF0cy5jb21wb25lbnRDb3VudCB8fCAwLFxuICAgICAgICAgICAgICAgICAgICBkcmF3Q2FsbHM6IHN0YXRzLmRyYXdDYWxscyB8fCAwLFxuICAgICAgICAgICAgICAgICAgICB0cmlhbmdsZXM6IHN0YXRzLnRyaWFuZ2xlcyB8fCAwLFxuICAgICAgICAgICAgICAgICAgICBtZW1vcnk6IHN0YXRzLm1lbW9yeSB8fCB7fVxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IHBlcmZTdGF0cyB9KTtcbiAgICAgICAgICAgIH0pLmNhdGNoKCgpID0+IHtcbiAgICAgICAgICAgICAgICAvLyBGYWxsYmFjayB0byBiYXNpYyBzdGF0c1xuICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiAnUGVyZm9ybWFuY2Ugc3RhdHMgbm90IGF2YWlsYWJsZSBpbiBlZGl0IG1vZGUnXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHZhbGlkYXRlU2NlbmUob3B0aW9uczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgaXNzdWVzOiBWYWxpZGF0aW9uSXNzdWVbXSA9IFtdO1xuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBDaGVjayBmb3IgbWlzc2luZyBhc3NldHNcbiAgICAgICAgICAgIGlmIChvcHRpb25zLmNoZWNrTWlzc2luZ0Fzc2V0cykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGFzc2V0Q2hlY2sgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdjaGVjay1taXNzaW5nLWFzc2V0cycpO1xuICAgICAgICAgICAgICAgIGlmIChhc3NldENoZWNrICYmIGFzc2V0Q2hlY2subWlzc2luZykge1xuICAgICAgICAgICAgICAgICAgICBpc3N1ZXMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiAnZXJyb3InLFxuICAgICAgICAgICAgICAgICAgICAgICAgY2F0ZWdvcnk6ICdhc3NldHMnLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYEZvdW5kICR7YXNzZXRDaGVjay5taXNzaW5nLmxlbmd0aH0gbWlzc2luZyBhc3NldCByZWZlcmVuY2VzYCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGRldGFpbHM6IGFzc2V0Q2hlY2subWlzc2luZ1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIENoZWNrIGZvciBwZXJmb3JtYW5jZSBpc3N1ZXNcbiAgICAgICAgICAgIGlmIChvcHRpb25zLmNoZWNrUGVyZm9ybWFuY2UpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBoaWVyYXJjaHkgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1oaWVyYXJjaHknKTtcbiAgICAgICAgICAgICAgICBjb25zdCBub2RlQ291bnQgPSB0aGlzLmNvdW50Tm9kZXMoaGllcmFyY2h5LmNoaWxkcmVuKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpZiAobm9kZUNvdW50ID4gMTAwMCkge1xuICAgICAgICAgICAgICAgICAgICBpc3N1ZXMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiAnd2FybmluZycsXG4gICAgICAgICAgICAgICAgICAgICAgICBjYXRlZ29yeTogJ3BlcmZvcm1hbmNlJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBIaWdoIG5vZGUgY291bnQ6ICR7bm9kZUNvdW50fSBub2RlcyAocmVjb21tZW5kZWQgPCAxMDAwKWAsXG4gICAgICAgICAgICAgICAgICAgICAgICBzdWdnZXN0aW9uOiAnQ29uc2lkZXIgdXNpbmcgb2JqZWN0IHBvb2xpbmcgb3Igc2NlbmUgb3B0aW1pemF0aW9uJ1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdDogVmFsaWRhdGlvblJlc3VsdCA9IHtcbiAgICAgICAgICAgICAgICB2YWxpZDogaXNzdWVzLmxlbmd0aCA9PT0gMCxcbiAgICAgICAgICAgICAgICBpc3N1ZUNvdW50OiBpc3N1ZXMubGVuZ3RoLFxuICAgICAgICAgICAgICAgIGlzc3VlczogaXNzdWVzXG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBkYXRhOiByZXN1bHQgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyLm1lc3NhZ2UgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgY291bnROb2Rlcyhub2RlczogYW55W10pOiBudW1iZXIge1xuICAgICAgICBsZXQgY291bnQgPSBub2Rlcy5sZW5ndGg7XG4gICAgICAgIGZvciAoY29uc3Qgbm9kZSBvZiBub2Rlcykge1xuICAgICAgICAgICAgaWYgKG5vZGUuY2hpbGRyZW4pIHtcbiAgICAgICAgICAgICAgICBjb3VudCArPSB0aGlzLmNvdW50Tm9kZXMobm9kZS5jaGlsZHJlbik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGNvdW50O1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2V0RWRpdG9ySW5mbygpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBpbmZvID0ge1xuICAgICAgICAgICAgZWRpdG9yOiB7XG4gICAgICAgICAgICAgICAgdmVyc2lvbjogKEVkaXRvciBhcyBhbnkpLnZlcnNpb25zPy5lZGl0b3IgfHwgJ1Vua25vd24nLFxuICAgICAgICAgICAgICAgIGNvY29zVmVyc2lvbjogKEVkaXRvciBhcyBhbnkpLnZlcnNpb25zPy5jb2NvcyB8fCAnVW5rbm93bicsXG4gICAgICAgICAgICAgICAgcGxhdGZvcm06IHByb2Nlc3MucGxhdGZvcm0sXG4gICAgICAgICAgICAgICAgYXJjaDogcHJvY2Vzcy5hcmNoLFxuICAgICAgICAgICAgICAgIG5vZGVWZXJzaW9uOiBwcm9jZXNzLnZlcnNpb25cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBwcm9qZWN0OiB7XG4gICAgICAgICAgICAgICAgbmFtZTogRWRpdG9yLlByb2plY3QubmFtZSxcbiAgICAgICAgICAgICAgICBwYXRoOiBFZGl0b3IuUHJvamVjdC5wYXRoLFxuICAgICAgICAgICAgICAgIHV1aWQ6IEVkaXRvci5Qcm9qZWN0LnV1aWRcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBtZW1vcnk6IHByb2Nlc3MubWVtb3J5VXNhZ2UoKSxcbiAgICAgICAgICAgIHVwdGltZTogcHJvY2Vzcy51cHRpbWUoKVxuICAgICAgICB9O1xuXG4gICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IGluZm8gfTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHJlc29sdmVQcm9qZWN0TG9nUGF0aCgpOiB7IHBhdGg6IHN0cmluZyB9IHwgeyBlcnJvcjogc3RyaW5nIH0ge1xuICAgICAgICBpZiAoIUVkaXRvci5Qcm9qZWN0IHx8ICFFZGl0b3IuUHJvamVjdC5wYXRoKSB7XG4gICAgICAgICAgICByZXR1cm4geyBlcnJvcjogJ0VkaXRvci5Qcm9qZWN0LnBhdGggaXMgbm90IGF2YWlsYWJsZTsgY2Fubm90IGxvY2F0ZSBwcm9qZWN0IGxvZyBmaWxlLicgfTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBsb2dQYXRoID0gcGF0aC5qb2luKEVkaXRvci5Qcm9qZWN0LnBhdGgsICd0ZW1wL2xvZ3MvcHJvamVjdC5sb2cnKTtcbiAgICAgICAgaWYgKCFmcy5leGlzdHNTeW5jKGxvZ1BhdGgpKSB7XG4gICAgICAgICAgICByZXR1cm4geyBlcnJvcjogYFByb2plY3QgbG9nIGZpbGUgbm90IGZvdW5kIGF0ICR7bG9nUGF0aH1gIH07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgcGF0aDogbG9nUGF0aCB9O1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2V0UHJvamVjdExvZ3MobGluZXM6IG51bWJlciA9IDEwMCwgZmlsdGVyS2V5d29yZD86IHN0cmluZywgbG9nTGV2ZWw6IHN0cmluZyA9ICdBTEwnKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJlc29sdmVkID0gdGhpcy5yZXNvbHZlUHJvamVjdExvZ1BhdGgoKTtcbiAgICAgICAgICAgIGlmICgnZXJyb3InIGluIHJlc29sdmVkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiByZXNvbHZlZC5lcnJvciB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgbG9nRmlsZVBhdGggPSByZXNvbHZlZC5wYXRoO1xuXG4gICAgICAgICAgICAvLyBSZWFkIHRoZSBmaWxlIGNvbnRlbnRcbiAgICAgICAgICAgIGNvbnN0IGxvZ0NvbnRlbnQgPSBmcy5yZWFkRmlsZVN5bmMobG9nRmlsZVBhdGgsICd1dGY4Jyk7XG4gICAgICAgICAgICBjb25zdCBsb2dMaW5lcyA9IGxvZ0NvbnRlbnQuc3BsaXQoJ1xcbicpLmZpbHRlcihsaW5lID0+IGxpbmUudHJpbSgpICE9PSAnJyk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIEdldCB0aGUgbGFzdCBOIGxpbmVzXG4gICAgICAgICAgICBjb25zdCByZWNlbnRMaW5lcyA9IGxvZ0xpbmVzLnNsaWNlKC1saW5lcyk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIEFwcGx5IGZpbHRlcnNcbiAgICAgICAgICAgIGxldCBmaWx0ZXJlZExpbmVzID0gcmVjZW50TGluZXM7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIEZpbHRlciBieSBsb2cgbGV2ZWwgaWYgbm90ICdBTEwnXG4gICAgICAgICAgICBpZiAobG9nTGV2ZWwgIT09ICdBTEwnKSB7XG4gICAgICAgICAgICAgICAgZmlsdGVyZWRMaW5lcyA9IGZpbHRlcmVkTGluZXMuZmlsdGVyKGxpbmUgPT4gXG4gICAgICAgICAgICAgICAgICAgIGxpbmUuaW5jbHVkZXMoYFske2xvZ0xldmVsfV1gKSB8fCBsaW5lLmluY2x1ZGVzKGxvZ0xldmVsLnRvTG93ZXJDYXNlKCkpXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gRmlsdGVyIGJ5IGtleXdvcmQgaWYgcHJvdmlkZWRcbiAgICAgICAgICAgIGlmIChmaWx0ZXJLZXl3b3JkKSB7XG4gICAgICAgICAgICAgICAgZmlsdGVyZWRMaW5lcyA9IGZpbHRlcmVkTGluZXMuZmlsdGVyKGxpbmUgPT4gXG4gICAgICAgICAgICAgICAgICAgIGxpbmUudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhmaWx0ZXJLZXl3b3JkLnRvTG93ZXJDYXNlKCkpXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgdG90YWxMaW5lczogbG9nTGluZXMubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICByZXF1ZXN0ZWRMaW5lczogbGluZXMsXG4gICAgICAgICAgICAgICAgICAgIGZpbHRlcmVkTGluZXM6IGZpbHRlcmVkTGluZXMubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICBsb2dMZXZlbDogbG9nTGV2ZWwsXG4gICAgICAgICAgICAgICAgICAgIGZpbHRlcktleXdvcmQ6IGZpbHRlcktleXdvcmQgfHwgbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgbG9nczogZmlsdGVyZWRMaW5lcyxcbiAgICAgICAgICAgICAgICAgICAgbG9nRmlsZVBhdGg6IGxvZ0ZpbGVQYXRoXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBlcnJvcjogYEZhaWxlZCB0byByZWFkIHByb2plY3QgbG9nczogJHtlcnJvci5tZXNzYWdlfWBcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldExvZ0ZpbGVJbmZvKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByZXNvbHZlZCA9IHRoaXMucmVzb2x2ZVByb2plY3RMb2dQYXRoKCk7XG4gICAgICAgICAgICBpZiAoJ2Vycm9yJyBpbiByZXNvbHZlZCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogcmVzb2x2ZWQuZXJyb3IgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGxvZ0ZpbGVQYXRoID0gcmVzb2x2ZWQucGF0aDtcblxuICAgICAgICAgICAgY29uc3Qgc3RhdHMgPSBmcy5zdGF0U3luYyhsb2dGaWxlUGF0aCk7XG4gICAgICAgICAgICBjb25zdCBsb2dDb250ZW50ID0gZnMucmVhZEZpbGVTeW5jKGxvZ0ZpbGVQYXRoLCAndXRmOCcpO1xuICAgICAgICAgICAgY29uc3QgbGluZUNvdW50ID0gbG9nQ29udGVudC5zcGxpdCgnXFxuJykuZmlsdGVyKGxpbmUgPT4gbGluZS50cmltKCkgIT09ICcnKS5sZW5ndGg7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIGZpbGVQYXRoOiBsb2dGaWxlUGF0aCxcbiAgICAgICAgICAgICAgICAgICAgZmlsZVNpemU6IHN0YXRzLnNpemUsXG4gICAgICAgICAgICAgICAgICAgIGZpbGVTaXplRm9ybWF0dGVkOiB0aGlzLmZvcm1hdEZpbGVTaXplKHN0YXRzLnNpemUpLFxuICAgICAgICAgICAgICAgICAgICBsYXN0TW9kaWZpZWQ6IHN0YXRzLm10aW1lLnRvSVNPU3RyaW5nKCksXG4gICAgICAgICAgICAgICAgICAgIGxpbmVDb3VudDogbGluZUNvdW50LFxuICAgICAgICAgICAgICAgICAgICBjcmVhdGVkOiBzdGF0cy5iaXJ0aHRpbWUudG9JU09TdHJpbmcoKSxcbiAgICAgICAgICAgICAgICAgICAgYWNjZXNzaWJsZTogZnMuY29uc3RhbnRzLlJfT0tcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgIGVycm9yOiBgRmFpbGVkIHRvIGdldCBsb2cgZmlsZSBpbmZvOiAke2Vycm9yLm1lc3NhZ2V9YFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgc2VhcmNoUHJvamVjdExvZ3MocGF0dGVybjogc3RyaW5nLCBtYXhSZXN1bHRzOiBudW1iZXIgPSAyMCwgY29udGV4dExpbmVzOiBudW1iZXIgPSAyKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJlc29sdmVkID0gdGhpcy5yZXNvbHZlUHJvamVjdExvZ1BhdGgoKTtcbiAgICAgICAgICAgIGlmICgnZXJyb3InIGluIHJlc29sdmVkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiByZXNvbHZlZC5lcnJvciB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgbG9nRmlsZVBhdGggPSByZXNvbHZlZC5wYXRoO1xuXG4gICAgICAgICAgICBjb25zdCBsb2dDb250ZW50ID0gZnMucmVhZEZpbGVTeW5jKGxvZ0ZpbGVQYXRoLCAndXRmOCcpO1xuICAgICAgICAgICAgY29uc3QgbG9nTGluZXMgPSBsb2dDb250ZW50LnNwbGl0KCdcXG4nKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gQ3JlYXRlIHJlZ2V4IHBhdHRlcm4gKHN1cHBvcnQgYm90aCBzdHJpbmcgYW5kIHJlZ2V4IHBhdHRlcm5zKVxuICAgICAgICAgICAgbGV0IHJlZ2V4OiBSZWdFeHA7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHJlZ2V4ID0gbmV3IFJlZ0V4cChwYXR0ZXJuLCAnZ2knKTtcbiAgICAgICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgICAgIC8vIElmIHBhdHRlcm4gaXMgbm90IHZhbGlkIHJlZ2V4LCB0cmVhdCBhcyBsaXRlcmFsIHN0cmluZ1xuICAgICAgICAgICAgICAgIHJlZ2V4ID0gbmV3IFJlZ0V4cChwYXR0ZXJuLnJlcGxhY2UoL1suKis/XiR7fSgpfFtcXF1cXFxcXS9nLCAnXFxcXCQmJyksICdnaScpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICBjb25zdCBtYXRjaGVzOiBhbnlbXSA9IFtdO1xuICAgICAgICAgICAgbGV0IHJlc3VsdENvdW50ID0gMDtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBsb2dMaW5lcy5sZW5ndGggJiYgcmVzdWx0Q291bnQgPCBtYXhSZXN1bHRzOyBpKyspIHtcbiAgICAgICAgICAgICAgICBjb25zdCBsaW5lID0gbG9nTGluZXNbaV07XG4gICAgICAgICAgICAgICAgaWYgKHJlZ2V4LnRlc3QobGluZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gR2V0IGNvbnRleHQgbGluZXNcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY29udGV4dFN0YXJ0ID0gTWF0aC5tYXgoMCwgaSAtIGNvbnRleHRMaW5lcyk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbnRleHRFbmQgPSBNYXRoLm1pbihsb2dMaW5lcy5sZW5ndGggLSAxLCBpICsgY29udGV4dExpbmVzKTtcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbnRleHRMaW5lc0FycmF5ID0gW107XG4gICAgICAgICAgICAgICAgICAgIGZvciAobGV0IGogPSBjb250ZXh0U3RhcnQ7IGogPD0gY29udGV4dEVuZDsgaisrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb250ZXh0TGluZXNBcnJheS5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsaW5lTnVtYmVyOiBqICsgMSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb250ZW50OiBsb2dMaW5lc1tqXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpc01hdGNoOiBqID09PSBpXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgbWF0Y2hlcy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxpbmVOdW1iZXI6IGkgKyAxLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWF0Y2hlZExpbmU6IGxpbmUsXG4gICAgICAgICAgICAgICAgICAgICAgICBjb250ZXh0OiBjb250ZXh0TGluZXNBcnJheVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdENvdW50Kys7XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAvLyBSZXNldCByZWdleCBsYXN0SW5kZXggZm9yIGdsb2JhbCBzZWFyY2hcbiAgICAgICAgICAgICAgICAgICAgcmVnZXgubGFzdEluZGV4ID0gMDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIHBhdHRlcm46IHBhdHRlcm4sXG4gICAgICAgICAgICAgICAgICAgIHRvdGFsTWF0Y2hlczogbWF0Y2hlcy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgIG1heFJlc3VsdHM6IG1heFJlc3VsdHMsXG4gICAgICAgICAgICAgICAgICAgIGNvbnRleHRMaW5lczogY29udGV4dExpbmVzLFxuICAgICAgICAgICAgICAgICAgICBsb2dGaWxlUGF0aDogbG9nRmlsZVBhdGgsXG4gICAgICAgICAgICAgICAgICAgIG1hdGNoZXM6IG1hdGNoZXNcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgIGVycm9yOiBgRmFpbGVkIHRvIHNlYXJjaCBwcm9qZWN0IGxvZ3M6ICR7ZXJyb3IubWVzc2FnZX1gXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBmb3JtYXRGaWxlU2l6ZShieXRlczogbnVtYmVyKTogc3RyaW5nIHtcbiAgICAgICAgY29uc3QgdW5pdHMgPSBbJ0InLCAnS0InLCAnTUInLCAnR0InXTtcbiAgICAgICAgbGV0IHNpemUgPSBieXRlcztcbiAgICAgICAgbGV0IHVuaXRJbmRleCA9IDA7XG5cbiAgICAgICAgd2hpbGUgKHNpemUgPj0gMTAyNCAmJiB1bml0SW5kZXggPCB1bml0cy5sZW5ndGggLSAxKSB7XG4gICAgICAgICAgICBzaXplIC89IDEwMjQ7XG4gICAgICAgICAgICB1bml0SW5kZXgrKztcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBgJHtzaXplLnRvRml4ZWQoMil9ICR7dW5pdHNbdW5pdEluZGV4XX1gO1xuICAgIH1cblxuICAgIHByaXZhdGUgcGlja1dpbmRvdyh0aXRsZVN1YnN0cmluZz86IHN0cmluZyk6IGFueSB7XG4gICAgICAgIC8vIExhenkgcmVxdWlyZSBzbyB0aGF0IG5vbi1FbGVjdHJvbiBjb250ZXh0cyAoZS5nLiB1bml0IHRlc3RzLCBzbW9rZVxuICAgICAgICAvLyBzY3JpcHQgd2l0aCBzdHViIHJlZ2lzdHJ5KSBjYW4gc3RpbGwgaW1wb3J0IHRoaXMgbW9kdWxlLlxuICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLXZhci1yZXF1aXJlc1xuICAgICAgICBjb25zdCBlbGVjdHJvbiA9IHJlcXVpcmUoJ2VsZWN0cm9uJyk7XG4gICAgICAgIGNvbnN0IEJXID0gZWxlY3Ryb24uQnJvd3NlcldpbmRvdztcbiAgICAgICAgaWYgKCFCVykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdFbGVjdHJvbiBCcm93c2VyV2luZG93IEFQSSB1bmF2YWlsYWJsZTsgc2NyZWVuc2hvdCB0b29sIHJlcXVpcmVzIHJ1bm5pbmcgaW5zaWRlIENvY29zIGVkaXRvciBob3N0IHByb2Nlc3MuJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRpdGxlU3Vic3RyaW5nKSB7XG4gICAgICAgICAgICBjb25zdCBtYXRjaGVzID0gQlcuZ2V0QWxsV2luZG93cygpLmZpbHRlcigodzogYW55KSA9PlxuICAgICAgICAgICAgICAgIHcgJiYgIXcuaXNEZXN0cm95ZWQoKSAmJiAody5nZXRUaXRsZT8uKCkgfHwgJycpLmluY2x1ZGVzKHRpdGxlU3Vic3RyaW5nKSk7XG4gICAgICAgICAgICBpZiAobWF0Y2hlcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE5vIEVsZWN0cm9uIHdpbmRvdyB0aXRsZSBtYXRjaGVkIHN1YnN0cmluZzogJHt0aXRsZVN1YnN0cmluZ31gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBtYXRjaGVzWzBdO1xuICAgICAgICB9XG4gICAgICAgIC8vIHYyLjMuMSByZXZpZXcgZml4OiBmb2N1c2VkIHdpbmRvdyBtYXkgYmUgYSB0cmFuc2llbnQgcHJldmlldyBwb3B1cC5cbiAgICAgICAgLy8gUHJlZmVyIGEgbm9uLVByZXZpZXcgd2luZG93IHNvIGRlZmF1bHQgc2NyZWVuc2hvdHMgdGFyZ2V0IHRoZSBtYWluXG4gICAgICAgIC8vIGVkaXRvciBzdXJmYWNlLiBDYWxsZXIgY2FuIHN0aWxsIHBhc3MgdGl0bGVTdWJzdHJpbmc9J1ByZXZpZXcnIHRvXG4gICAgICAgIC8vIGV4cGxpY2l0bHkgdGFyZ2V0IHRoZSBwcmV2aWV3IHdoZW4gd2FudGVkLlxuICAgICAgICBjb25zdCBhbGw6IGFueVtdID0gQlcuZ2V0QWxsV2luZG93cygpLmZpbHRlcigodzogYW55KSA9PiB3ICYmICF3LmlzRGVzdHJveWVkKCkpO1xuICAgICAgICBpZiAoYWxsLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyBsaXZlIEVsZWN0cm9uIHdpbmRvd3M7IGNhbm5vdCBjYXB0dXJlIHNjcmVlbnNob3QuJyk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgaXNQcmV2aWV3ID0gKHc6IGFueSkgPT4gL3ByZXZpZXcvaS50ZXN0KHcuZ2V0VGl0bGU/LigpIHx8ICcnKTtcbiAgICAgICAgY29uc3Qgbm9uUHJldmlldyA9IGFsbC5maWx0ZXIoKHc6IGFueSkgPT4gIWlzUHJldmlldyh3KSk7XG4gICAgICAgIGNvbnN0IGZvY3VzZWQgPSBCVy5nZXRGb2N1c2VkV2luZG93Py4oKTtcbiAgICAgICAgaWYgKGZvY3VzZWQgJiYgIWZvY3VzZWQuaXNEZXN0cm95ZWQoKSAmJiAhaXNQcmV2aWV3KGZvY3VzZWQpKSByZXR1cm4gZm9jdXNlZDtcbiAgICAgICAgaWYgKG5vblByZXZpZXcubGVuZ3RoID4gMCkgcmV0dXJuIG5vblByZXZpZXdbMF07XG4gICAgICAgIHJldHVybiBhbGxbMF07XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBlbnN1cmVDYXB0dXJlRGlyKCk6IHsgb2s6IHRydWU7IGRpcjogc3RyaW5nIH0gfCB7IG9rOiBmYWxzZTsgZXJyb3I6IHN0cmluZyB9IHtcbiAgICAgICAgaWYgKCFFZGl0b3IuUHJvamVjdCB8fCAhRWRpdG9yLlByb2plY3QucGF0aCkge1xuICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogJ0VkaXRvci5Qcm9qZWN0LnBhdGggaXMgbm90IGF2YWlsYWJsZTsgY2Fubm90IHJlc29sdmUgY2FwdHVyZSBvdXRwdXQgZGlyZWN0b3J5LicgfTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBkaXIgPSBwYXRoLmpvaW4oRWRpdG9yLlByb2plY3QucGF0aCwgJ3RlbXAnLCAnbWNwLWNhcHR1cmVzJyk7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBmcy5ta2RpclN5bmMoZGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiB0cnVlLCBkaXIgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGBGYWlsZWQgdG8gY3JlYXRlIGNhcHR1cmUgZGlyOiAke2Vycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKX1gIH07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyB2Mi44LjAgVC1WMjgtMiAoY2FycnlvdmVyIGZyb20gdjIuNy4wIENvZGV4IHNpbmdsZS1yZXZpZXdlciDwn5+hKVxuICAgIC8vIOKGkiB2Mi44LjEgcm91bmQtMSBmaXggKENvZGV4IPCflLQgKyBDbGF1ZGUg8J+foSk6IHRoZSB2Mi44LjAgaGVscGVyXG4gICAgLy8gcmVhbHBhdGgnZCBgZGlyYCBhbmQgYHBhdGguZGlybmFtZShwYXRoLmpvaW4oZGlyLCBiYXNlbmFtZSkpYCBhbmRcbiAgICAvLyBjb21wYXJlZCB0aGUgdHdvIOKAlCBidXQgd2l0aCBhIGZpeGVkIGJhc2VuYW1lIHRob3NlIGV4cHJlc3Npb25zIGJvdGhcbiAgICAvLyBjb2xsYXBzZSB0byBgZGlyYCwgbWFraW5nIHRoZSBlcXVhbGl0eSBjaGVjayB0YXV0b2xvZ2ljYWwuIFRoZSBjaGVja1xuICAgIC8vIHByb3RlY3RlZCBub3RoaW5nIGlmIGA8cHJvamVjdD4vdGVtcC9tY3AtY2FwdHVyZXNgIGl0c2VsZiB3YXMgYVxuICAgIC8vIHN5bWxpbmsgdGhhdCBlc2NhcGVzIHRoZSBwcm9qZWN0IHRyZWUuXG4gICAgLy9cbiAgICAvLyBUcnVlIGVzY2FwZSBwcm90ZWN0aW9uIHJlcXVpcmVzIGFuY2hvcmluZyBhZ2FpbnN0IHRoZSBwcm9qZWN0IHJvb3QuXG4gICAgLy8gV2Ugbm93IHJlYWxwYXRoIEJPVEggdGhlIGNhcHR1cmUgZGlyIGFuZCBgRWRpdG9yLlByb2plY3QucGF0aGAgYW5kXG4gICAgLy8gcmVxdWlyZSB0aGUgcmVzb2x2ZWQgY2FwdHVyZSBkaXIgdG8gYmUgaW5zaWRlIHRoZSByZXNvbHZlZCBwcm9qZWN0XG4gICAgLy8gcm9vdCAoZXF1YWxpdHkgT1IgYHJlYWxEaXIuc3RhcnRzV2l0aChyZWFsUHJvamVjdFJvb3QgKyBzZXApYCkuXG4gICAgLy8gVGhlIGludHJhLWRpciBjaGVjayBpcyBrZXB0IGZvciBjaGVhcCBkZWZlbnNlLWluLWRlcHRoIGluIGNhc2UgYVxuICAgIC8vIGZ1dHVyZSBiYXNlbmFtZSBnZXRzIHRyYXZlcnNhbCBjaGFyYWN0ZXJzIHRocmVhZGVkIHRocm91Z2guXG4gICAgLy9cbiAgICAvLyBSZXR1cm5zIHsgb2s6IHRydWUsIGZpbGVQYXRoLCBkaXIgfSB3aGVuIHNhZmUgdG8gd3JpdGUsIG9yXG4gICAgLy8geyBvazogZmFsc2UsIGVycm9yIH0gd2l0aCB0aGUgc2FtZSBlcnJvciBlbnZlbG9wZSBzaGFwZSBhc1xuICAgIC8vIGVuc3VyZUNhcHR1cmVEaXIgc28gY2FsbGVycyBjYW4gZmFsbCB0aHJvdWdoIHRoZWlyIGV4aXN0aW5nXG4gICAgLy8gZXJyb3ItcmV0dXJuIHBhdHRlcm4uXG4gICAgcHJpdmF0ZSByZXNvbHZlQXV0b0NhcHR1cmVGaWxlKGJhc2VuYW1lOiBzdHJpbmcpOiB7IG9rOiB0cnVlOyBmaWxlUGF0aDogc3RyaW5nOyBkaXI6IHN0cmluZyB9IHwgeyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmcgfSB7XG4gICAgICAgIGNvbnN0IGRpclJlc3VsdCA9IHRoaXMuZW5zdXJlQ2FwdHVyZURpcigpO1xuICAgICAgICBpZiAoIWRpclJlc3VsdC5vaykgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogZGlyUmVzdWx0LmVycm9yIH07XG4gICAgICAgIGNvbnN0IHByb2plY3RQYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQgPSBFZGl0b3I/LlByb2plY3Q/LnBhdGg7XG4gICAgICAgIGlmICghcHJvamVjdFBhdGgpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6ICdFZGl0b3IuUHJvamVjdC5wYXRoIGlzIG5vdCBhdmFpbGFibGU7IGNhbm5vdCBhbmNob3IgY2FwdHVyZS1kaXIgY29udGFpbm1lbnQgY2hlY2suJyB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGZpbGVQYXRoID0gcGF0aC5qb2luKGRpclJlc3VsdC5kaXIsIGJhc2VuYW1lKTtcbiAgICAgICAgbGV0IHJlYWxEaXI6IHN0cmluZztcbiAgICAgICAgbGV0IHJlYWxQYXJlbnQ6IHN0cmluZztcbiAgICAgICAgbGV0IHJlYWxQcm9qZWN0Um9vdDogc3RyaW5nO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcnA6IGFueSA9IGZzLnJlYWxwYXRoU3luYyBhcyBhbnk7XG4gICAgICAgICAgICBjb25zdCByZXNvbHZlUmVhbCA9IHJwLm5hdGl2ZSA/PyBycDtcbiAgICAgICAgICAgIHJlYWxEaXIgPSByZXNvbHZlUmVhbChkaXJSZXN1bHQuZGlyKTtcbiAgICAgICAgICAgIHJlYWxQYXJlbnQgPSByZXNvbHZlUmVhbChwYXRoLmRpcm5hbWUoZmlsZVBhdGgpKTtcbiAgICAgICAgICAgIHJlYWxQcm9qZWN0Um9vdCA9IHJlc29sdmVSZWFsKHByb2plY3RQYXRoKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGBzY3JlZW5zaG90IHBhdGggcmVhbHBhdGggZmFpbGVkOiAke2Vycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKX1gIH07XG4gICAgICAgIH1cbiAgICAgICAgLy8gRGVmZW5zZS1pbi1kZXB0aDogcGFyZW50IG9mIHRoZSByZXNvbHZlZCBmaWxlIG11c3QgZXF1YWwgdGhlXG4gICAgICAgIC8vIHJlc29sdmVkIGNhcHR1cmUgZGlyIChjYXRjaGVzIGZ1dHVyZSBiYXNlbmFtZXMgdGhyZWFkaW5nIGAuLmApLlxuICAgICAgICBpZiAocGF0aC5yZXNvbHZlKHJlYWxQYXJlbnQpICE9PSBwYXRoLnJlc29sdmUocmVhbERpcikpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6ICdzY3JlZW5zaG90IHNhdmUgcGF0aCByZXNvbHZlZCBvdXRzaWRlIHRoZSBjYXB0dXJlIGRpcmVjdG9yeScgfTtcbiAgICAgICAgfVxuICAgICAgICAvLyBQcmltYXJ5IHByb3RlY3Rpb246IGNhcHR1cmUgZGlyIGl0c2VsZiBtdXN0IHJlc29sdmUgaW5zaWRlIHRoZVxuICAgICAgICAvLyBwcm9qZWN0IHJvb3QsIHNvIGEgc3ltbGluayBjaGFpbiBvbiBgdGVtcC9tY3AtY2FwdHVyZXNgIGNhbm5vdFxuICAgICAgICAvLyBwaXZvdCB3cml0ZXMgdG8gZS5nLiAvZXRjIG9yIEM6XFxXaW5kb3dzLlxuICAgICAgICAvLyB2Mi45LnggcG9saXNoIChDb2RleCByMiBzaW5nbGUt8J+foSBmcm9tIHYyLjguMSByZXZpZXcpOiB1c2VcbiAgICAgICAgLy8gcGF0aC5yZWxhdGl2ZSBpbnN0ZWFkIG9mIGByb290ICsgcGF0aC5zZXBgIHByZWZpeCBjaGVjayDigJRcbiAgICAgICAgLy8gd2hlbiByb290IGlzIGEgZHJpdmUgcm9vdCAoYEM6XFxgKSwgcGF0aC5yZXNvbHZlIG5vcm1hbGlzZXMgaXRcbiAgICAgICAgLy8gdG8gYEM6XFxcXGAgYW5kIGBwYXRoLnNlcGAgYWRkcyBhbm90aGVyIGBcXGAsIHByb2R1Y2luZyBgQzpcXFxcXFxcXGBcbiAgICAgICAgLy8gd2hpY2ggYSBjYW5kaWRhdGUgbGlrZSBgQzpcXFxcZm9vYCBkb2VzIG5vdCBtYXRjaC4gcGF0aC5yZWxhdGl2ZVxuICAgICAgICAvLyBhbHNvIGhhbmRsZXMgdGhlIEM6XFxmb28gdnMgQzpcXGZvb2JhciBwcmVmaXgtY29sbGlzaW9uIGNhc2UuXG4gICAgICAgIGlmICghaXNQYXRoV2l0aGluUm9vdChyZWFsRGlyLCByZWFsUHJvamVjdFJvb3QpKSB7XG4gICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBgY2FwdHVyZSBkaXIgcmVzb2x2ZWQgb3V0c2lkZSB0aGUgcHJvamVjdCByb290OiAke3BhdGgucmVzb2x2ZShyZWFsRGlyKX0gbm90IHdpdGhpbiAke3BhdGgucmVzb2x2ZShyZWFsUHJvamVjdFJvb3QpfWAgfTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSwgZmlsZVBhdGgsIGRpcjogZGlyUmVzdWx0LmRpciB9O1xuICAgIH1cblxuICAgIC8vIHYyLjguMSByb3VuZC0xIGZpeCAoR2VtaW5pIPCflLQgKyBDb2RleCDwn5+hKTogd2hlbiBjYWxsZXIgcGFzc2VzIGFuXG4gICAgLy8gZXhwbGljaXQgc2F2ZVBhdGggLyBzYXZlUGF0aFByZWZpeCwgd2Ugc3RpbGwgbmVlZCB0aGUgc2FtZSBwcm9qZWN0LVxuICAgIC8vIHJvb3QgY29udGFpbm1lbnQgZ3VhcmFudGVlIHRoYXQgcmVzb2x2ZUF1dG9DYXB0dXJlRmlsZSBnaXZlcyB0aGVcbiAgICAvLyBhdXRvLW5hbWVkIGJyYW5jaC4gQUktZ2VuZXJhdGVkIGFic29sdXRlIHBhdGhzIGNvdWxkIG90aGVyd2lzZVxuICAgIC8vIHdyaXRlIG91dHNpZGUgdGhlIHByb2plY3Qgcm9vdC5cbiAgICAvL1xuICAgIC8vIFRoZSBjaGVjayByZXNvbHZlcyB0aGUgcGFyZW50IGRpcmVjdG9yeSAodGhlIGZpbGUgaXRzZWxmIG1heSBub3RcbiAgICAvLyBleGlzdCB5ZXQpIGFuZCByZXF1aXJlcyBpdCB0byBiZSBpbnNpZGUgYHJlYWxwYXRoKEVkaXRvci5Qcm9qZWN0LnBhdGgpYC5cbiAgICBwcml2YXRlIGFzc2VydFNhdmVQYXRoV2l0aGluUHJvamVjdChzYXZlUGF0aDogc3RyaW5nKTogeyBvazogdHJ1ZTsgcmVzb2x2ZWRQYXRoOiBzdHJpbmcgfSB8IHsgb2s6IGZhbHNlOyBlcnJvcjogc3RyaW5nIH0ge1xuICAgICAgICBjb25zdCBwcm9qZWN0UGF0aDogc3RyaW5nIHwgdW5kZWZpbmVkID0gRWRpdG9yPy5Qcm9qZWN0Py5wYXRoO1xuICAgICAgICBpZiAoIXByb2plY3RQYXRoKSB7XG4gICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiAnRWRpdG9yLlByb2plY3QucGF0aCBpcyBub3QgYXZhaWxhYmxlOyBjYW5ub3QgdmFsaWRhdGUgZXhwbGljaXQgc2F2ZVBhdGguJyB9O1xuICAgICAgICB9XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBycDogYW55ID0gZnMucmVhbHBhdGhTeW5jIGFzIGFueTtcbiAgICAgICAgICAgIGNvbnN0IHJlc29sdmVSZWFsID0gcnAubmF0aXZlID8/IHJwO1xuICAgICAgICAgICAgY29uc3QgcmVhbFByb2plY3RSb290ID0gcmVzb2x2ZVJlYWwocHJvamVjdFBhdGgpO1xuICAgICAgICAgICAgLy8gdjIuOC4yIHJldGVzdCBmaXggKENvZGV4IHIyIPCfn6EgIzEpOiBhIHJlbGF0aXZlIHNhdmVQYXRoIHdvdWxkXG4gICAgICAgICAgICAvLyBtYWtlIGBwYXRoLmRpcm5hbWUoc2F2ZVBhdGgpYCBjb2xsYXBzZSB0byAnLicgYW5kIHJlc29sdmUgdG9cbiAgICAgICAgICAgIC8vIHRoZSBob3N0IHByb2Nlc3MgY3dkIChvZnRlbiBgPGVkaXRvci1pbnN0YWxsPi9Db2Nvc0Rhc2hib2FyZGApXG4gICAgICAgICAgICAvLyByYXRoZXIgdGhhbiB0aGUgcHJvamVjdCByb290LiBBbmNob3IgcmVsYXRpdmUgcGF0aHMgYWdhaW5zdFxuICAgICAgICAgICAgLy8gdGhlIHByb2plY3Qgcm9vdCBleHBsaWNpdGx5IHNvIHRoZSBBSSdzIGludHVpdGl2ZSBcInJlbGF0aXZlXG4gICAgICAgICAgICAvLyB0byBteSBwcm9qZWN0XCIgaW50ZXJwcmV0YXRpb24gaXMgd2hhdCB0aGUgY2hlY2sgZW5mb3JjZXMuXG4gICAgICAgICAgICBjb25zdCBhYnNvbHV0ZVNhdmVQYXRoID0gcGF0aC5pc0Fic29sdXRlKHNhdmVQYXRoKVxuICAgICAgICAgICAgICAgID8gc2F2ZVBhdGhcbiAgICAgICAgICAgICAgICA6IHBhdGgucmVzb2x2ZShwcm9qZWN0UGF0aCwgc2F2ZVBhdGgpO1xuICAgICAgICAgICAgY29uc3QgcGFyZW50ID0gcGF0aC5kaXJuYW1lKGFic29sdXRlU2F2ZVBhdGgpO1xuICAgICAgICAgICAgLy8gUGFyZW50IG11c3QgYWxyZWFkeSBleGlzdCBmb3IgcmVhbHBhdGg7IGlmIGl0IGRvZXNuJ3QsIHRoZVxuICAgICAgICAgICAgLy8gd3JpdGUgd291bGQgZmFpbCBhbnl3YXksIGJ1dCByZXR1cm4gYSBjbGVhcmVyIGVycm9yIGhlcmUuXG4gICAgICAgICAgICBsZXQgcmVhbFBhcmVudDogc3RyaW5nO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICByZWFsUGFyZW50ID0gcmVzb2x2ZVJlYWwocGFyZW50KTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogYHNhdmVQYXRoIHBhcmVudCBkaXIgbWlzc2luZyBvciB1bnJlYWRhYmxlOiAke2Vycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKX1gIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyB2Mi45LnggcG9saXNoIChDb2RleCByMiBzaW5nbGUt8J+foSBmcm9tIHYyLjguMSByZXZpZXcpOiBzYW1lXG4gICAgICAgICAgICAvLyBwYXRoLnJlbGF0aXZlLWJhc2VkIGNvbnRhaW5tZW50IGFzIHJlc29sdmVBdXRvQ2FwdHVyZUZpbGUuXG4gICAgICAgICAgICBpZiAoIWlzUGF0aFdpdGhpblJvb3QocmVhbFBhcmVudCwgcmVhbFByb2plY3RSb290KSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgIG9rOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGBzYXZlUGF0aCByZXNvbHZlZCBvdXRzaWRlIHRoZSBwcm9qZWN0IHJvb3Q6ICR7cGF0aC5yZXNvbHZlKHJlYWxQYXJlbnQpfSBub3Qgd2l0aGluICR7cGF0aC5yZXNvbHZlKHJlYWxQcm9qZWN0Um9vdCl9LiBVc2UgYSBwYXRoIGluc2lkZSA8cHJvamVjdD4vIG9yIG9taXQgc2F2ZVBhdGggdG8gYXV0by1uYW1lIGludG8gPHByb2plY3Q+L3RlbXAvbWNwLWNhcHR1cmVzLmAsXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB7IG9rOiB0cnVlLCByZXNvbHZlZFBhdGg6IGFic29sdXRlU2F2ZVBhdGggfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGBzYXZlUGF0aCByZWFscGF0aCBmYWlsZWQ6ICR7ZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpfWAgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgc2NyZWVuc2hvdChzYXZlUGF0aD86IHN0cmluZywgd2luZG93VGl0bGU/OiBzdHJpbmcsIGluY2x1ZGVCYXNlNjQ6IGJvb2xlYW4gPSBmYWxzZSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBsZXQgZmlsZVBhdGggPSBzYXZlUGF0aDtcbiAgICAgICAgICAgIGlmICghZmlsZVBhdGgpIHtcbiAgICAgICAgICAgICAgICBjb25zdCByZXNvbHZlZCA9IHRoaXMucmVzb2x2ZUF1dG9DYXB0dXJlRmlsZShgc2NyZWVuc2hvdC0ke0RhdGUubm93KCl9LnBuZ2ApO1xuICAgICAgICAgICAgICAgIGlmICghcmVzb2x2ZWQub2spIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogcmVzb2x2ZWQuZXJyb3IgfTtcbiAgICAgICAgICAgICAgICBmaWxlUGF0aCA9IHJlc29sdmVkLmZpbGVQYXRoO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyB2Mi44LjEgcm91bmQtMSBmaXggKEdlbWluaSDwn5S0ICsgQ29kZXgg8J+foSk6IGV4cGxpY2l0IHNhdmVQYXRoXG4gICAgICAgICAgICAgICAgLy8gYWxzbyBnZXRzIGNvbnRhaW5tZW50LWNoZWNrZWQuIEFJLWdlbmVyYXRlZCBwYXRocyBjb3VsZFxuICAgICAgICAgICAgICAgIC8vIG90aGVyd2lzZSB3cml0ZSBvdXRzaWRlIHRoZSBwcm9qZWN0IHJvb3QuXG4gICAgICAgICAgICAgICAgLy8gdjIuOC4yIHJldGVzdCBmaXg6IHVzZSB0aGUgaGVscGVyJ3MgcmVzb2x2ZWRQYXRoIHNvIGFcbiAgICAgICAgICAgICAgICAvLyByZWxhdGl2ZSBzYXZlUGF0aCBhY3R1YWxseSBsYW5kcyBpbnNpZGUgdGhlIHByb2plY3Qgcm9vdC5cbiAgICAgICAgICAgICAgICBjb25zdCBndWFyZCA9IHRoaXMuYXNzZXJ0U2F2ZVBhdGhXaXRoaW5Qcm9qZWN0KGZpbGVQYXRoKTtcbiAgICAgICAgICAgICAgICBpZiAoIWd1YXJkLm9rKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGd1YXJkLmVycm9yIH07XG4gICAgICAgICAgICAgICAgZmlsZVBhdGggPSBndWFyZC5yZXNvbHZlZFBhdGg7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCB3aW4gPSB0aGlzLnBpY2tXaW5kb3cod2luZG93VGl0bGUpO1xuICAgICAgICAgICAgY29uc3QgaW1hZ2UgPSBhd2FpdCB3aW4ud2ViQ29udGVudHMuY2FwdHVyZVBhZ2UoKTtcbiAgICAgICAgICAgIGNvbnN0IHBuZzogQnVmZmVyID0gaW1hZ2UudG9QTkcoKTtcbiAgICAgICAgICAgIGZzLndyaXRlRmlsZVN5bmMoZmlsZVBhdGgsIHBuZyk7XG4gICAgICAgICAgICBjb25zdCBkYXRhOiBhbnkgPSB7XG4gICAgICAgICAgICAgICAgZmlsZVBhdGgsXG4gICAgICAgICAgICAgICAgc2l6ZTogcG5nLmxlbmd0aCxcbiAgICAgICAgICAgICAgICB3aW5kb3dUaXRsZTogdHlwZW9mIHdpbi5nZXRUaXRsZSA9PT0gJ2Z1bmN0aW9uJyA/IHdpbi5nZXRUaXRsZSgpIDogJycsXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgaWYgKGluY2x1ZGVCYXNlNjQpIHtcbiAgICAgICAgICAgICAgICBkYXRhLmRhdGFVcmkgPSBgZGF0YTppbWFnZS9wbmc7YmFzZTY0LCR7cG5nLnRvU3RyaW5nKCdiYXNlNjQnKX1gO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZGF0YSwgbWVzc2FnZTogYFNjcmVlbnNob3Qgc2F2ZWQgdG8gJHtmaWxlUGF0aH1gIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKSB9O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gdjIuNy4wICM0OiBQcmV2aWV3LXdpbmRvdyBzY3JlZW5zaG90LlxuICAgIC8vIHYyLjguMyBULVYyODMtMTogZXh0ZW5kZWQgdG8gaGFuZGxlIGNvY29zIGVtYmVkZGVkIHByZXZpZXcgbW9kZS5cbiAgICAvL1xuICAgIC8vIE1vZGUgZGlzcGF0Y2g6XG4gICAgLy8gICAtIFwid2luZG93XCI6ICAgcmVxdWlyZSBhIFByZXZpZXctdGl0bGVkIEJyb3dzZXJXaW5kb3c7IGZhaWwgaWYgbm9uZS5cbiAgICAvLyAgICAgICAgICAgICAgICAgT3JpZ2luYWwgdjIuNy4wIGJlaGF2aW91ci4gVXNlIHdoZW4gY29jb3MgcHJldmlld1xuICAgIC8vICAgICAgICAgICAgICAgICBjb25maWcgaXMgXCJ3aW5kb3dcIiAvIFwic2ltdWxhdG9yXCIgKHNlcGFyYXRlIHdpbmRvdykuXG4gICAgLy8gICAtIFwiZW1iZWRkZWRcIjogc2tpcCB0aGUgd2luZG93IHByb2JlIGFuZCBjYXB0dXJlIHRoZSBtYWluIGVkaXRvclxuICAgIC8vICAgICAgICAgICAgICAgICBCcm93c2VyV2luZG93IGRpcmVjdGx5LiBVc2Ugd2hlbiBjb2NvcyBwcmV2aWV3IGNvbmZpZ1xuICAgIC8vICAgICAgICAgICAgICAgICBpcyBcImVtYmVkZGVkXCIgKGdhbWV2aWV3IHJlbmRlcnMgaW5zaWRlIG1haW4gZWRpdG9yKS5cbiAgICAvLyAgIC0gXCJhdXRvXCI6ICAgICB0cnkgXCJ3aW5kb3dcIiBmaXJzdDsgaWYgbm8gUHJldmlldy10aXRsZWQgd2luZG93IGlzXG4gICAgLy8gICAgICAgICAgICAgICAgIGZvdW5kLCBmYWxsIGJhY2sgdG8gXCJlbWJlZGRlZFwiIGFuZCBzdXJmYWNlIGEgaGludFxuICAgIC8vICAgICAgICAgICAgICAgICBpbiB0aGUgcmVzcG9uc2UgbWVzc2FnZS4gRGVmYXVsdCDigJQga2VlcHMgdGhlIGhhcHB5XG4gICAgLy8gICAgICAgICAgICAgICAgIHBhdGggd29ya2luZyB3aXRob3V0IGNhbGxlciBrbm93bGVkZ2Ugb2YgY29jb3NcbiAgICAvLyAgICAgICAgICAgICAgICAgcHJldmlldyBjb25maWcuXG4gICAgLy9cbiAgICAvLyBCcm93c2VyLW1vZGUgKFBJRSByZW5kZXJlZCB0byB1c2VyJ3MgZXh0ZXJuYWwgYnJvd3NlciB2aWFcbiAgICAvLyBzaGVsbC5vcGVuRXh0ZXJuYWwpIGlzIE5PVCBjYXB0dXJhYmxlIGhlcmUg4oCUIHRoZSBwYWdlIGxpdmVzIGluXG4gICAgLy8gYSBub24tRWxlY3Ryb24gYnJvd3NlciBwcm9jZXNzLiBBSSBjYW4gZGV0ZWN0IHRoaXMgdmlhXG4gICAgLy8gZGVidWdfZ2V0X3ByZXZpZXdfbW9kZSBhbmQgc2tpcCB0aGUgY2FsbC5cbiAgICBwcml2YXRlIGFzeW5jIGNhcHR1cmVQcmV2aWV3U2NyZWVuc2hvdChcbiAgICAgICAgc2F2ZVBhdGg/OiBzdHJpbmcsXG4gICAgICAgIG1vZGU6ICdhdXRvJyB8ICd3aW5kb3cnIHwgJ2VtYmVkZGVkJyA9ICdhdXRvJyxcbiAgICAgICAgd2luZG93VGl0bGU6IHN0cmluZyA9ICdQcmV2aWV3JyxcbiAgICAgICAgaW5jbHVkZUJhc2U2NDogYm9vbGVhbiA9IGZhbHNlLFxuICAgICk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLXZhci1yZXF1aXJlc1xuICAgICAgICAgICAgY29uc3QgZWxlY3Ryb24gPSByZXF1aXJlKCdlbGVjdHJvbicpO1xuICAgICAgICAgICAgY29uc3QgQlcgPSBlbGVjdHJvbi5Ccm93c2VyV2luZG93O1xuXG4gICAgICAgICAgICAvLyBSZXNvbHZlIHRoZSB0YXJnZXQgd2luZG93IHBlciBtb2RlLlxuICAgICAgICAgICAgY29uc3QgcHJvYmVXaW5kb3dNb2RlID0gKCk6IHsgb2s6IHRydWU7IHdpbjogYW55IH0gfCB7IG9rOiBmYWxzZTsgZXJyb3I6IHN0cmluZzsgdmlzaWJsZVRpdGxlczogc3RyaW5nW10gfSA9PiB7XG4gICAgICAgICAgICAgICAgLy8gdjIuNy4xIHJldmlldyBmaXggKGNsYXVkZSDwn5+hICsgY29kZXgg8J+foSk6IHdpdGggdGhlIGRlZmF1bHRcbiAgICAgICAgICAgICAgICAvLyB3aW5kb3dUaXRsZT0nUHJldmlldycgYSBDaGluZXNlIC8gbG9jYWxpemVkIGNvY29zIGVkaXRvclxuICAgICAgICAgICAgICAgIC8vIHdob3NlIG1haW4gd2luZG93IHRpdGxlIGNvbnRhaW5zIFwiUHJldmlld1wiIChlLmcuIFwiQ29jb3NcbiAgICAgICAgICAgICAgICAvLyBDcmVhdG9yIFByZXZpZXcgLSA8UHJvamVjdE5hbWU+XCIpIHdvdWxkIGZhbHNlbHkgbWF0Y2guXG4gICAgICAgICAgICAgICAgLy8gRGlzYW1iaWd1YXRlIGJ5IGV4Y2x1ZGluZyBhbnkgdGl0bGUgdGhhdCBBTFNPIGNvbnRhaW5zXG4gICAgICAgICAgICAgICAgLy8gXCJDb2NvcyBDcmVhdG9yXCIgd2hlbiB0aGUgY2FsbGVyIHN0dWNrIHdpdGggdGhlIGRlZmF1bHQuXG4gICAgICAgICAgICAgICAgY29uc3QgdXNpbmdEZWZhdWx0ID0gd2luZG93VGl0bGUgPT09ICdQcmV2aWV3JztcbiAgICAgICAgICAgICAgICBjb25zdCBhbGxUaXRsZXM6IHN0cmluZ1tdID0gQlc/LmdldEFsbFdpbmRvd3M/LigpPy5tYXAoKHc6IGFueSkgPT4gdy5nZXRUaXRsZT8uKCkgPz8gJycpLmZpbHRlcihCb29sZWFuKSA/PyBbXTtcbiAgICAgICAgICAgICAgICBjb25zdCBtYXRjaGVzID0gQlc/LmdldEFsbFdpbmRvd3M/LigpPy5maWx0ZXIoKHc6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXcgfHwgdy5pc0Rlc3Ryb3llZCgpKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRpdGxlID0gdy5nZXRUaXRsZT8uKCkgfHwgJyc7XG4gICAgICAgICAgICAgICAgICAgIGlmICghdGl0bGUuaW5jbHVkZXMod2luZG93VGl0bGUpKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIGlmICh1c2luZ0RlZmF1bHQgJiYgL0NvY29zXFxzKkNyZWF0b3IvaS50ZXN0KHRpdGxlKSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9KSA/PyBbXTtcbiAgICAgICAgICAgICAgICBpZiAobWF0Y2hlcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogYE5vIEVsZWN0cm9uIHdpbmRvdyB0aXRsZSBjb250YWlucyBcIiR7d2luZG93VGl0bGV9XCIke3VzaW5nRGVmYXVsdCA/ICcgKGFuZCBpcyBub3QgdGhlIG1haW4gZWRpdG9yKScgOiAnJ30uYCwgdmlzaWJsZVRpdGxlczogYWxsVGl0bGVzIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiB7IG9rOiB0cnVlLCB3aW46IG1hdGNoZXNbMF0gfTtcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGNvbnN0IHByb2JlRW1iZWRkZWRNb2RlID0gKCk6IHsgb2s6IHRydWU7IHdpbjogYW55IH0gfCB7IG9rOiBmYWxzZTsgZXJyb3I6IHN0cmluZyB9ID0+IHtcbiAgICAgICAgICAgICAgICAvLyBFbWJlZGRlZCBQSUUgcmVuZGVycyBpbnNpZGUgdGhlIG1haW4gZWRpdG9yIEJyb3dzZXJXaW5kb3cuXG4gICAgICAgICAgICAgICAgLy8gUGljayB0aGUgc2FtZSBoZXVyaXN0aWMgYXMgcGlja1dpbmRvdygpOiBwcmVmZXIgYSBub24tXG4gICAgICAgICAgICAgICAgLy8gUHJldmlldyB3aW5kb3cuIENvY29zIG1haW4gZWRpdG9yJ3MgdGl0bGUgdHlwaWNhbGx5XG4gICAgICAgICAgICAgICAgLy8gY29udGFpbnMgXCJDb2NvcyBDcmVhdG9yXCIg4oCUIG1hdGNoIHRoYXQgdG8gaWRlbnRpZnkgaXQuXG4gICAgICAgICAgICAgICAgY29uc3QgYWxsOiBhbnlbXSA9IEJXPy5nZXRBbGxXaW5kb3dzPy4oKT8uZmlsdGVyKCh3OiBhbnkpID0+IHcgJiYgIXcuaXNEZXN0cm95ZWQoKSkgPz8gW107XG4gICAgICAgICAgICAgICAgaWYgKGFsbC5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogJ05vIGxpdmUgRWxlY3Ryb24gd2luZG93cyBhdmFpbGFibGU7IGNhbm5vdCBjYXB0dXJlIGVtYmVkZGVkIHByZXZpZXcuJyB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAvLyBQcmVmZXIgdGhlIGVkaXRvciBtYWluIHdpbmRvdyAodGl0bGUgY29udGFpbnMgXCJDb2Nvc1xuICAgICAgICAgICAgICAgIC8vIENyZWF0b3JcIikg4oCUIHRoYXQncyB3aGVyZSBlbWJlZGRlZCBQSUUgcmVuZGVycy5cbiAgICAgICAgICAgICAgICBjb25zdCBlZGl0b3IgPSBhbGwuZmluZCgodzogYW55KSA9PiAvQ29jb3NcXHMqQ3JlYXRvci9pLnRlc3Qody5nZXRUaXRsZT8uKCkgfHwgJycpKTtcbiAgICAgICAgICAgICAgICBpZiAoZWRpdG9yKSByZXR1cm4geyBvazogdHJ1ZSwgd2luOiBlZGl0b3IgfTtcbiAgICAgICAgICAgICAgICAvLyBGYWxsYmFjazogYW55IG5vbi1EZXZUb29scyAvIG5vbi1Xb3JrZXIgLyBub24tQmxhbmsgd2luZG93LlxuICAgICAgICAgICAgICAgIGNvbnN0IGNhbmRpZGF0ZSA9IGFsbC5maW5kKCh3OiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdCA9IHcuZ2V0VGl0bGU/LigpIHx8ICcnO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdCAmJiAhL0RldlRvb2xzfFdvcmtlciAtfF5CbGFuayQvLnRlc3QodCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgaWYgKGNhbmRpZGF0ZSkgcmV0dXJuIHsgb2s6IHRydWUsIHdpbjogY2FuZGlkYXRlIH07XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogJ05vIHN1aXRhYmxlIGVkaXRvciB3aW5kb3cgZm91bmQgZm9yIGVtYmVkZGVkIHByZXZpZXcgY2FwdHVyZS4nIH07XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBsZXQgd2luOiBhbnkgPSBudWxsO1xuICAgICAgICAgICAgbGV0IGNhcHR1cmVOb3RlOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgICAgICAgICAgIGxldCByZXNvbHZlZE1vZGU6ICd3aW5kb3cnIHwgJ2VtYmVkZGVkJyA9ICd3aW5kb3cnO1xuXG4gICAgICAgICAgICBpZiAobW9kZSA9PT0gJ3dpbmRvdycpIHtcbiAgICAgICAgICAgICAgICBjb25zdCByID0gcHJvYmVXaW5kb3dNb2RlKCk7XG4gICAgICAgICAgICAgICAgaWYgKCFyLm9rKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yOiBgJHtyLmVycm9yfSBMYXVuY2ggY29jb3MgcHJldmlldyBmaXJzdCB2aWEgdGhlIHRvb2xiYXIgcGxheSBidXR0b24gb3IgdmlhIGRlYnVnX3ByZXZpZXdfdXJsKGFjdGlvbj1cIm9wZW5cIikuIElmIHlvdXIgY29jb3MgcHJldmlldyBpcyBzZXQgdG8gXCJlbWJlZGRlZFwiLCBjYWxsIHRoaXMgdG9vbCB3aXRoIG1vZGU9XCJlbWJlZGRlZFwiIG9yIG1vZGU9XCJhdXRvXCIuIFZpc2libGUgd2luZG93IHRpdGxlczogJHtyLnZpc2libGVUaXRsZXMuam9pbignLCAnKSB8fCAnKG5vbmUpJ31gLFxuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB3aW4gPSByLndpbjtcbiAgICAgICAgICAgICAgICByZXNvbHZlZE1vZGUgPSAnd2luZG93JztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAobW9kZSA9PT0gJ2VtYmVkZGVkJykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHIgPSBwcm9iZUVtYmVkZGVkTW9kZSgpO1xuICAgICAgICAgICAgICAgIGlmICghci5vaykgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiByLmVycm9yIH07XG4gICAgICAgICAgICAgICAgd2luID0gci53aW47XG4gICAgICAgICAgICAgICAgcmVzb2x2ZWRNb2RlID0gJ2VtYmVkZGVkJztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gYXV0b1xuICAgICAgICAgICAgICAgIGNvbnN0IHdyID0gcHJvYmVXaW5kb3dNb2RlKCk7XG4gICAgICAgICAgICAgICAgaWYgKHdyLm9rKSB7XG4gICAgICAgICAgICAgICAgICAgIHdpbiA9IHdyLndpbjtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZWRNb2RlID0gJ3dpbmRvdyc7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZXIgPSBwcm9iZUVtYmVkZGVkTW9kZSgpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIWVyLm9rKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yOiBgJHt3ci5lcnJvcn0gJHtlci5lcnJvcn0gTGF1bmNoIGNvY29zIHByZXZpZXcgZmlyc3Qgb3IgY2hlY2sgZGVidWdfZ2V0X3ByZXZpZXdfbW9kZSB0byBzZWUgaG93IGNvY29zIGlzIGNvbmZpZ3VyZWQuIFZpc2libGUgd2luZG93IHRpdGxlczogJHt3ci52aXNpYmxlVGl0bGVzLmpvaW4oJywgJykgfHwgJyhub25lKSd9YCxcbiAgICAgICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgd2luID0gZXIud2luO1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlZE1vZGUgPSAnZW1iZWRkZWQnO1xuICAgICAgICAgICAgICAgICAgICAvLyB2Mi44LjQgcmV0ZXN0IGZpbmRpbmc6IHdoZW4gY29jb3MgcHJldmlldyBpcyBzZXRcbiAgICAgICAgICAgICAgICAgICAgLy8gdG8gXCJicm93c2VyXCIsIGF1dG8tZmFsbGJhY2sgQUxTTyBncmFicyB0aGUgbWFpblxuICAgICAgICAgICAgICAgICAgICAvLyBlZGl0b3Igd2luZG93IChiZWNhdXNlIG5vIFByZXZpZXctdGl0bGVkIHdpbmRvd1xuICAgICAgICAgICAgICAgICAgICAvLyBleGlzdHMpIOKAlCBidXQgaW4gYnJvd3NlciBtb2RlIHRoZSBhY3R1YWwgZ2FtZXZpZXdcbiAgICAgICAgICAgICAgICAgICAgLy8gbGl2ZXMgaW4gdGhlIHVzZXIncyBleHRlcm5hbCBicm93c2VyLCBOT1QgaW4gdGhlXG4gICAgICAgICAgICAgICAgICAgIC8vIGNhcHR1cmVkIEVsZWN0cm9uIHdpbmRvdy4gRG9uJ3QgY2xhaW0gXCJlbWJlZGRlZFxuICAgICAgICAgICAgICAgICAgICAvLyBwcmV2aWV3IG1vZGVcIiDigJQgdGhhdCdzIGEgZ3Vlc3MsIGFuZCB3cm9uZyB3aGVuXG4gICAgICAgICAgICAgICAgICAgIC8vIHVzZXIgaXMgb24gYnJvd3NlciBjb25maWcuIFByb2JlIHRoZSByZWFsIGNvbmZpZ1xuICAgICAgICAgICAgICAgICAgICAvLyBhbmQgdGFpbG9yIHRoZSBoaW50IHBlciBtb2RlLlxuICAgICAgICAgICAgICAgICAgICBsZXQgYWN0dWFsTW9kZTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjZmc6IGFueSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgJ3ByZWZlcmVuY2VzJywgJ3F1ZXJ5LWNvbmZpZycgYXMgYW55LCAncHJldmlldycgYXMgYW55LFxuICAgICAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHBsYXRmb3JtID0gY2ZnPy5wcmV2aWV3Py5jdXJyZW50Py5wbGF0Zm9ybTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgcGxhdGZvcm0gPT09ICdzdHJpbmcnKSBhY3R1YWxNb2RlID0gcGxhdGZvcm07XG4gICAgICAgICAgICAgICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gYmVzdC1lZmZvcnQ7IGZhbGwgdGhyb3VnaCB3aXRoIG5ldXRyYWwgaGludFxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGlmIChhY3R1YWxNb2RlID09PSAnYnJvd3NlcicpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhcHR1cmVOb3RlID0gJ05vIFByZXZpZXctdGl0bGVkIHdpbmRvdyBmb3VuZDsgY2FwdHVyZWQgdGhlIG1haW4gZWRpdG9yIHdpbmRvdy4gTk9URTogY29jb3MgcHJldmlldyBpcyBzZXQgdG8gXCJicm93c2VyXCIg4oCUIHRoZSBhY3R1YWwgcHJldmlldyBjb250ZW50IGlzIHJlbmRlcmVkIGluIHlvdXIgZXh0ZXJuYWwgYnJvd3NlciAoTk9UIGluIHRoaXMgaW1hZ2UpLiBGb3IgcnVudGltZSBjYW52YXMgY2FwdHVyZSBpbiBicm93c2VyIG1vZGUgdXNlIGRlYnVnX2dhbWVfY29tbWFuZCh0eXBlPVwic2NyZWVuc2hvdFwiKSB2aWEgYSBHYW1lRGVidWdDbGllbnQgcnVubmluZyBvbiB0aGUgYnJvd3NlciBwcmV2aWV3IHBhZ2UuJztcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChhY3R1YWxNb2RlID09PSAnZ2FtZVZpZXcnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXB0dXJlTm90ZSA9ICdObyBQcmV2aWV3LXRpdGxlZCB3aW5kb3cgZm91bmQ7IGNhcHR1cmVkIHRoZSBtYWluIGVkaXRvciB3aW5kb3cgKGNvY29zIHByZXZpZXcgaXMgc2V0IHRvIFwiZ2FtZVZpZXdcIiBlbWJlZGRlZCDigJQgdGhlIGVkaXRvciBnYW1ldmlldyBJUyB3aGVyZSBwcmV2aWV3IHJlbmRlcnMsIHNvIHRoaXMgaW1hZ2UgaXMgY29ycmVjdCkuJztcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChhY3R1YWxNb2RlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXB0dXJlTm90ZSA9IGBObyBQcmV2aWV3LXRpdGxlZCB3aW5kb3cgZm91bmQ7IGNhcHR1cmVkIHRoZSBtYWluIGVkaXRvciB3aW5kb3cuIGNvY29zIHByZXZpZXcgaXMgc2V0IHRvIFwiJHthY3R1YWxNb2RlfVwiIOKAlCB2ZXJpZnkgdGhpcyBpbWFnZSBhY3R1YWxseSBjb250YWlucyB0aGUgZ2FtZXZpZXcgeW91IHdhbnRlZDsgZm9yIHJ1bnRpbWUgY2FudmFzIGNhcHR1cmUgcHJlZmVyIGRlYnVnX2dhbWVfY29tbWFuZCB2aWEgR2FtZURlYnVnQ2xpZW50LmA7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXB0dXJlTm90ZSA9ICdObyBQcmV2aWV3LXRpdGxlZCB3aW5kb3cgZm91bmQ7IGNhcHR1cmVkIHRoZSBtYWluIGVkaXRvciB3aW5kb3cuIENvdWxkIG5vdCBkZXRlcm1pbmUgY29jb3MgcHJldmlldyBtb2RlIChkZWJ1Z19nZXRfcHJldmlld19tb2RlIG1pZ2h0IGdpdmUgbW9yZSBpbmZvKS4gSWYgeW91ciBjb2NvcyBwcmV2aWV3IGlzIHNldCB0byBcImJyb3dzZXJcIiwgdGhlIGFjdHVhbCBwcmV2aWV3IGNvbnRlbnQgaXMgaW4geW91ciBleHRlcm5hbCBicm93c2VyIGFuZCBpcyBOT1QgaW4gdGhpcyBpbWFnZS4nO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBsZXQgZmlsZVBhdGggPSBzYXZlUGF0aDtcbiAgICAgICAgICAgIGlmICghZmlsZVBhdGgpIHtcbiAgICAgICAgICAgICAgICBjb25zdCByZXNvbHZlZCA9IHRoaXMucmVzb2x2ZUF1dG9DYXB0dXJlRmlsZShgcHJldmlldy0ke0RhdGUubm93KCl9LnBuZ2ApO1xuICAgICAgICAgICAgICAgIGlmICghcmVzb2x2ZWQub2spIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogcmVzb2x2ZWQuZXJyb3IgfTtcbiAgICAgICAgICAgICAgICBmaWxlUGF0aCA9IHJlc29sdmVkLmZpbGVQYXRoO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyB2Mi44LjEgcm91bmQtMSBmaXggKEdlbWluaSDwn5S0ICsgQ29kZXgg8J+foSk6IGV4cGxpY2l0IHNhdmVQYXRoXG4gICAgICAgICAgICAgICAgLy8gYWxzbyBnZXRzIGNvbnRhaW5tZW50LWNoZWNrZWQuXG4gICAgICAgICAgICAgICAgLy8gdjIuOC4yIHJldGVzdCBmaXg6IHVzZSByZXNvbHZlZFBhdGggZm9yIHJlbGF0aXZlLXBhdGggc3VwcG9ydC5cbiAgICAgICAgICAgICAgICBjb25zdCBndWFyZCA9IHRoaXMuYXNzZXJ0U2F2ZVBhdGhXaXRoaW5Qcm9qZWN0KGZpbGVQYXRoKTtcbiAgICAgICAgICAgICAgICBpZiAoIWd1YXJkLm9rKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGd1YXJkLmVycm9yIH07XG4gICAgICAgICAgICAgICAgZmlsZVBhdGggPSBndWFyZC5yZXNvbHZlZFBhdGg7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBpbWFnZSA9IGF3YWl0IHdpbi53ZWJDb250ZW50cy5jYXB0dXJlUGFnZSgpO1xuICAgICAgICAgICAgY29uc3QgcG5nOiBCdWZmZXIgPSBpbWFnZS50b1BORygpO1xuICAgICAgICAgICAgZnMud3JpdGVGaWxlU3luYyhmaWxlUGF0aCwgcG5nKTtcbiAgICAgICAgICAgIGNvbnN0IGRhdGE6IGFueSA9IHtcbiAgICAgICAgICAgICAgICBmaWxlUGF0aCxcbiAgICAgICAgICAgICAgICBzaXplOiBwbmcubGVuZ3RoLFxuICAgICAgICAgICAgICAgIHdpbmRvd1RpdGxlOiB0eXBlb2Ygd2luLmdldFRpdGxlID09PSAnZnVuY3Rpb24nID8gd2luLmdldFRpdGxlKCkgOiAnJyxcbiAgICAgICAgICAgICAgICBtb2RlOiByZXNvbHZlZE1vZGUsXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgaWYgKGNhcHR1cmVOb3RlKSBkYXRhLm5vdGUgPSBjYXB0dXJlTm90ZTtcbiAgICAgICAgICAgIGlmIChpbmNsdWRlQmFzZTY0KSB7XG4gICAgICAgICAgICAgICAgZGF0YS5kYXRhVXJpID0gYGRhdGE6aW1hZ2UvcG5nO2Jhc2U2NCwke3BuZy50b1N0cmluZygnYmFzZTY0Jyl9YDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IG1lc3NhZ2UgPSBjYXB0dXJlTm90ZVxuICAgICAgICAgICAgICAgID8gYFByZXZpZXcgc2NyZWVuc2hvdCBzYXZlZCB0byAke2ZpbGVQYXRofSAoJHtjYXB0dXJlTm90ZX0pYFxuICAgICAgICAgICAgICAgIDogYFByZXZpZXcgc2NyZWVuc2hvdCBzYXZlZCB0byAke2ZpbGVQYXRofSAobW9kZT0ke3Jlc29sdmVkTW9kZX0pYDtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGEsIG1lc3NhZ2UgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpIH07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyB2Mi44LjMgVC1WMjgzLTI6IHJlYWQgY29jb3MgcHJldmlldyBjb25maWcgc28gQUkgY2FuIHJvdXRlXG4gICAgLy8gY2FwdHVyZV9wcmV2aWV3X3NjcmVlbnNob3QgdG8gdGhlIGNvcnJlY3QgbW9kZSB3aXRob3V0IGd1ZXNzaW5nLlxuICAgIC8vIFJlYWRzIHZpYSBFZGl0b3IuTWVzc2FnZSBwcmVmZXJlbmNlcy9xdWVyeS1jb25maWcgKHR5cGVkIGluXG4gICAgLy8gbm9kZV9tb2R1bGVzL0Bjb2Nvcy9jcmVhdG9yLXR5cGVzLy4uLi9wcmVmZXJlbmNlcy9AdHlwZXMvbWVzc2FnZS5kLnRzKS5cbiAgICAvL1xuICAgIC8vIFdlIGR1bXAgdGhlIGZ1bGwgJ3ByZXZpZXcnIGNhdGVnb3J5LCB0aGVuIHRyeSB0byBpbnRlcnByZXQgYSBmZXdcbiAgICAvLyBjb21tb24ga2V5cyAoJ29wZW5fcHJldmlld193aXRoJywgJ3ByZXZpZXdfd2l0aCcsICdzaW11bGF0b3InLFxuICAgIC8vICdicm93c2VyJykgaW50byBhIG5vcm1hbGl6ZWQgbW9kZSBsYWJlbC4gSWYgaW50ZXJwcmV0YXRpb24gZmFpbHMsXG4gICAgLy8gd2Ugc3RpbGwgcmV0dXJuIHRoZSByYXcgY29uZmlnIHNvIHRoZSBBSSBjYW4gcmVhZCBpdCBkaXJlY3RseS5cbiAgICBwcml2YXRlIGFzeW5jIGdldFByZXZpZXdNb2RlKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBQcm9iZSBhdCBtb2R1bGUgbGV2ZWwgKG5vIGtleSkgdG8gZ2V0IHRoZSB3aG9sZSBjYXRlZ29yeS5cbiAgICAgICAgICAgIGNvbnN0IHJhdzogYW55ID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgncHJlZmVyZW5jZXMnLCAncXVlcnktY29uZmlnJyBhcyBhbnksICdwcmV2aWV3JyBhcyBhbnkpIGFzIGFueTtcbiAgICAgICAgICAgIGlmIChyYXcgPT09IHVuZGVmaW5lZCB8fCByYXcgPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgZXJyb3I6ICdwcmVmZXJlbmNlcy9xdWVyeS1jb25maWcgcmV0dXJuZWQgbnVsbCBmb3IgXCJwcmV2aWV3XCIg4oCUIGNvY29zIG1heSBub3QgZXhwb3NlIHRoaXMgY2F0ZWdvcnksIG9yIHlvdXIgYnVpbGQgZGlmZmVycyBmcm9tIDMuOC54LicsXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIEhldXJpc3RpYyBpbnRlcnByZXRhdGlvbi5cbiAgICAgICAgICAgIC8vIHYyLjguMyByZXRlc3QgZmluZGluZzogY29jb3MgMy44LjcgYWN0dWFsbHkgc3RvcmVzIHRoZVxuICAgICAgICAgICAgLy8gYWN0aXZlIG1vZGUgYXQgYHByZXZpZXcuY3VycmVudC5wbGF0Zm9ybWAgd2l0aCB2YWx1ZVxuICAgICAgICAgICAgLy8gYFwiZ2FtZVZpZXdcImAgKGVtYmVkZGVkKSwgYFwiYnJvd3NlclwiYCwgb3IgZGV2aWNlIG5hbWVzXG4gICAgICAgICAgICAvLyAoc2ltdWxhdG9yKS4gVGhlIG9yaWdpbmFsIGhldXJpc3RpYyBvbmx5IGNoZWNrZWQga2V5cyBsaWtlXG4gICAgICAgICAgICAvLyBgb3Blbl9wcmV2aWV3X3dpdGhgIC8gYHByZXZpZXdfd2l0aGAgLyBgb3Blbl93aXRoYCAvIGBtb2RlYFxuICAgICAgICAgICAgLy8gYW5kIG1pc3NlZCB0aGUgbGl2ZSBrZXkuIFByb2JlIGBjdXJyZW50LnBsYXRmb3JtYCBmaXJzdDtcbiAgICAgICAgICAgIC8vIGtlZXAgdGhlIGxlZ2FjeSBrZXlzIGFzIGZhbGxiYWNrIGZvciBvbGRlciBjb2NvcyB2ZXJzaW9ucy5cbiAgICAgICAgICAgIGNvbnN0IGxvd2VyID0gKHM6IGFueSkgPT4gKHR5cGVvZiBzID09PSAnc3RyaW5nJyA/IHMudG9Mb3dlckNhc2UoKSA6ICcnKTtcbiAgICAgICAgICAgIGxldCBpbnRlcnByZXRlZDogJ2Jyb3dzZXInIHwgJ3dpbmRvdycgfCAnc2ltdWxhdG9yJyB8ICdlbWJlZGRlZCcgfCAndW5rbm93bicgPSAndW5rbm93bic7XG4gICAgICAgICAgICBsZXQgaW50ZXJwcmV0ZWRGcm9tS2V5OiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgICAgICAgICAgIGNvbnN0IGNsYXNzaWZ5ID0gKHY6IHN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGx2ID0gbG93ZXIodik7XG4gICAgICAgICAgICAgICAgaWYgKGx2LmluY2x1ZGVzKCdicm93c2VyJykpIHJldHVybiAnYnJvd3Nlcic7XG4gICAgICAgICAgICAgICAgaWYgKGx2LmluY2x1ZGVzKCdzaW11bGF0b3InKSkgcmV0dXJuICdzaW11bGF0b3InO1xuICAgICAgICAgICAgICAgIGlmIChsdi5pbmNsdWRlcygnZW1iZWQnKSB8fCBsdi5pbmNsdWRlcygnZ2FtZXZpZXcnKSB8fCBsdi5pbmNsdWRlcygnZ2FtZV92aWV3JykpIHJldHVybiAnZW1iZWRkZWQnO1xuICAgICAgICAgICAgICAgIGlmIChsdi5pbmNsdWRlcygnd2luZG93JykpIHJldHVybiAnd2luZG93JztcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBjb25zdCBkaWcgPSAob2JqOiBhbnksIHBhdGg6IHN0cmluZyk6IGFueSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKCFvYmogfHwgdHlwZW9mIG9iaiAhPT0gJ29iamVjdCcpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgY29uc3QgcGFydHMgPSBwYXRoLnNwbGl0KCcuJyk7XG4gICAgICAgICAgICAgICAgbGV0IGN1cjogYW55ID0gb2JqO1xuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgcCBvZiBwYXJ0cykge1xuICAgICAgICAgICAgICAgICAgICBpZiAoIWN1ciB8fCB0eXBlb2YgY3VyICE9PSAnb2JqZWN0JykgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHAgaW4gY3VyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjdXIgPSBjdXJbcF07XG4gICAgICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAvLyBUcnkgb25lIGxldmVsIG9mIG5lc3QgKHNvbWV0aW1lcyB0aGUgY2F0ZWdvcnkgZHVtcFxuICAgICAgICAgICAgICAgICAgICAvLyBuZXN0cyB1bmRlciBhIGRlZmF1bHQtcHJvdG9jb2wgYnVja2V0KS5cbiAgICAgICAgICAgICAgICAgICAgbGV0IGZvdW5kID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIGZvciAoY29uc3QgdiBvZiBPYmplY3QudmFsdWVzKGN1cikpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh2ICYmIHR5cGVvZiB2ID09PSAnb2JqZWN0JyAmJiBwIGluICh2IGFzIGFueSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjdXIgPSAodiBhcyBhbnkpW3BdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvdW5kID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZiAoIWZvdW5kKSByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gY3VyO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGNvbnN0IHByb2JlS2V5cyA9IFtcbiAgICAgICAgICAgICAgICAncHJldmlldy5jdXJyZW50LnBsYXRmb3JtJyxcbiAgICAgICAgICAgICAgICAnY3VycmVudC5wbGF0Zm9ybScsXG4gICAgICAgICAgICAgICAgJ3ByZXZpZXcub3Blbl9wcmV2aWV3X3dpdGgnLFxuICAgICAgICAgICAgICAgICdvcGVuX3ByZXZpZXdfd2l0aCcsXG4gICAgICAgICAgICAgICAgJ3ByZXZpZXdfd2l0aCcsXG4gICAgICAgICAgICAgICAgJ29wZW5fd2l0aCcsXG4gICAgICAgICAgICAgICAgJ21vZGUnLFxuICAgICAgICAgICAgXTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgayBvZiBwcm9iZUtleXMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB2ID0gZGlnKHJhdywgayk7XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiB2ID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjbHMgPSBjbGFzc2lmeSh2KTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNscykge1xuICAgICAgICAgICAgICAgICAgICAgICAgaW50ZXJwcmV0ZWQgPSBjbHM7XG4gICAgICAgICAgICAgICAgICAgICAgICBpbnRlcnByZXRlZEZyb21LZXkgPSBgJHtrfT0ke3Z9YDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIC8vIE5vbi1lbXB0eSBzdHJpbmcgdGhhdCBkaWRuJ3QgbWF0Y2ggYSBrbm93biBsYWJlbCDihpJcbiAgICAgICAgICAgICAgICAgICAgLy8gcmVjb3JkIGFzICdzaW11bGF0b3InIGNhbmRpZGF0ZSBpZiBpdCBsb29rcyBsaWtlIGFcbiAgICAgICAgICAgICAgICAgICAgLy8gZGV2aWNlIG5hbWUgKGUuZy4gXCJBcHBsZSBpUGhvbmUgMTQgUHJvXCIpLCBvdGhlcndpc2VcbiAgICAgICAgICAgICAgICAgICAgLy8ga2VlcCBzZWFyY2hpbmcuXG4gICAgICAgICAgICAgICAgICAgIGlmICgvaVBob25lfGlQYWR8SFVBV0VJfFhpYW9taXxTb255fEFzdXN8T1BQT3xIb25vcnxOb2tpYXxMZW5vdm98U2Ftc3VuZ3xHb29nbGV8UGl4ZWwvaS50ZXN0KHYpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpbnRlcnByZXRlZCA9ICdzaW11bGF0b3InO1xuICAgICAgICAgICAgICAgICAgICAgICAgaW50ZXJwcmV0ZWRGcm9tS2V5ID0gYCR7a309JHt2fWA7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7IGludGVycHJldGVkLCBpbnRlcnByZXRlZEZyb21LZXksIHJhdyB9LFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGludGVycHJldGVkID09PSAndW5rbm93bidcbiAgICAgICAgICAgICAgICAgICAgPyAnUmVhZCBjb2NvcyBwcmV2aWV3IGNvbmZpZyBidXQgY291bGQgbm90IGludGVycHJldCBhIG1vZGUgbGFiZWw7IGluc3BlY3QgZGF0YS5yYXcgYW5kIHBhc3MgbW9kZT0gZXhwbGljaXRseSB0byBjYXB0dXJlX3ByZXZpZXdfc2NyZWVuc2hvdC4nXG4gICAgICAgICAgICAgICAgICAgIDogYGNvY29zIHByZXZpZXcgaXMgY29uZmlndXJlZCBhcyBcIiR7aW50ZXJwcmV0ZWR9XCIgKGZyb20ga2V5IFwiJHtpbnRlcnByZXRlZEZyb21LZXl9XCIpLiBQYXNzIG1vZGU9XCIke2ludGVycHJldGVkID09PSAnYnJvd3NlcicgPyAnd2luZG93JyA6IGludGVycHJldGVkfVwiIHRvIGNhcHR1cmVfcHJldmlld19zY3JlZW5zaG90LCBvciByZWx5IG9uIG1vZGU9XCJhdXRvXCIuYCxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBwcmVmZXJlbmNlcy9xdWVyeS1jb25maWcgJ3ByZXZpZXcnIGZhaWxlZDogJHtlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycil9YCB9O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gdjIuOS4wIFQtVjI5LTI6IGNvdW50ZXJwYXJ0IHRvIGdldFByZXZpZXdNb2RlLiBXcml0ZXNcbiAgICAvLyBwcmV2aWV3LmN1cnJlbnQucGxhdGZvcm0gdmlhIHRoZSB0eXBlZFxuICAgIC8vIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3ByZWZlcmVuY2VzJywgJ3NldC1jb25maWcnLCAuLi4pIGNoYW5uZWwuXG4gICAgLy9cbiAgICAvLyB2Mi45LjAgcmV0ZXN0IGZpeDogdGhlIGluaXRpYWwgaW1wbGVtZW50YXRpb24gcGFzc2VkXG4gICAgLy8gKCdwcmV2aWV3JywgJ2N1cnJlbnQucGxhdGZvcm0nLCB2YWx1ZSkgYW5kIHJldHVybmVkIHN1Y2Nlc3MgYnV0XG4gICAgLy8gdGhlIHdyaXRlIGRpZCBOT1QgdGFrZSBlZmZlY3Qg4oCUIGNvY29zJ3Mgc2V0LWNvbmZpZyBkb2Vzbid0IHNlZW1cbiAgICAvLyB0byBzdXBwb3J0IGRvdC1wYXRoIGtleXMuIFN0cmF0ZWdpZXMgdHJpZWQgaW4gb3JkZXI6XG4gICAgLy8gICAxLiAoJ3ByZXZpZXcnLCAnY3VycmVudCcsIHsgcGxhdGZvcm06IHZhbHVlIH0pICDigJQgbmVzdGVkIG9iamVjdFxuICAgIC8vICAgMi4gKCdwcmV2aWV3JywgJ2N1cnJlbnQucGxhdGZvcm0nLCB2YWx1ZSwgJ2dsb2JhbCcpIOKAlCBleHBsaWNpdCBwcm90b2NvbFxuICAgIC8vICAgMy4gKCdwcmV2aWV3JywgJ2N1cnJlbnQucGxhdGZvcm0nLCB2YWx1ZSwgJ2xvY2FsJykgIOKAlCBleHBsaWNpdCBwcm90b2NvbFxuICAgIC8vICAgNC4gKCdwcmV2aWV3JywgJ2N1cnJlbnQucGxhdGZvcm0nLCB2YWx1ZSkgICAgICAgICAg4oCUIG5vIHByb3RvY29sIChvcmlnaW5hbClcbiAgICAvLyBFYWNoIGF0dGVtcHQgaXMgZm9sbG93ZWQgYnkgYSBmcmVzaCBxdWVyeS1jb25maWcgdG8gdmVyaWZ5IHRoZVxuICAgIC8vIHZhbHVlIGFjdHVhbGx5IGZsaXBwZWQuIFdlIHJldHVybiB0aGUgc3RyYXRlZ3kgdGhhdCB3b3JrZWQgcGx1c1xuICAgIC8vIHRoZSByYXcgc2V0LWNvbmZpZyByZXR1cm4gZm9yIGRpYWdub3N0aWNzLlxuICAgIC8vXG4gICAgLy8gQ29uZmlybSBnYXRlOiBgY29uZmlybT1mYWxzZWAgKGRlZmF1bHQpIGlzIGEgZHJ5LXJ1biB0aGF0IHJldHVybnNcbiAgICAvLyB0aGUgY3VycmVudCB2YWx1ZSArIHN1Z2dlc3RlZCBjYWxsLiBgY29uZmlybT10cnVlYCBhY3R1YWxseVxuICAgIC8vIHdyaXRlcy4gVGhpcyBhdm9pZHMgQUktaW5kdWNlZCBwcmVmZXJlbmNlIGRyaWZ0IHdoZW4gdGhlIExMTSBpc1xuICAgIC8vIGV4cGxvcmluZyB0b29sIGNhcGFiaWxpdGllcy5cbiAgICBwcml2YXRlIGFzeW5jIHNldFByZXZpZXdNb2RlKG1vZGU6ICdicm93c2VyJyB8ICdnYW1lVmlldycgfCAnc2ltdWxhdG9yJywgY29uZmlybTogYm9vbGVhbik6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBxdWVyeUN1cnJlbnQgPSBhc3luYyAoKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgY2ZnOiBhbnkgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdwcmVmZXJlbmNlcycsICdxdWVyeS1jb25maWcnIGFzIGFueSwgJ3ByZXZpZXcnIGFzIGFueSkgYXMgYW55O1xuICAgICAgICAgICAgICAgIHJldHVybiBjZmc/LnByZXZpZXc/LmN1cnJlbnQ/LnBsYXRmb3JtID8/IG51bGw7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgY29uc3QgcHJldmlvdXNNb2RlID0gYXdhaXQgcXVlcnlDdXJyZW50KCk7XG4gICAgICAgICAgICBpZiAoIWNvbmZpcm0pIHtcbiAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBkYXRhOiB7IHByZXZpb3VzTW9kZSwgcmVxdWVzdGVkTW9kZTogbW9kZSwgY29uZmlybWVkOiBmYWxzZSB9LFxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgRHJ5IHJ1biBvbmx5IOKAlCBjdXJyZW50IGNvY29zIHByZXZpZXcgbW9kZSBpcyBcIiR7cHJldmlvdXNNb2RlID8/ICd1bmtub3duJ31cIiwgcmVxdWVzdGVkIFwiJHttb2RlfVwiLiBSZS1jYWxsIHdpdGggY29uZmlybT10cnVlIHRvIGFjdHVhbGx5IHN3aXRjaC4gQ2FsbGVyIGlzIHJlc3BvbnNpYmxlIGZvciByZXN0b3JpbmcgdGhlIG9yaWdpbmFsIG1vZGUgd2hlbiBkb25lIGlmIGFwcHJvcHJpYXRlLmAsXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChwcmV2aW91c01vZGUgPT09IG1vZGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBkYXRhOiB7IHByZXZpb3VzTW9kZSwgbmV3TW9kZTogbW9kZSwgY29uZmlybWVkOiB0cnVlLCBub09wOiB0cnVlIH0sXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBjb2NvcyBwcmV2aWV3IGFscmVhZHkgc2V0IHRvIFwiJHttb2RlfVwiOyBubyBjaGFuZ2UgYXBwbGllZC5gLFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0eXBlIFN0cmF0ZWd5ID0geyBpZDogc3RyaW5nOyBwYXlsb2FkOiAoKSA9PiBQcm9taXNlPGFueT4gfTtcbiAgICAgICAgICAgIGNvbnN0IHN0cmF0ZWdpZXM6IFN0cmF0ZWd5W10gPSBbXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBpZDogXCJzZXQtY29uZmlnKCdwcmV2aWV3JywnY3VycmVudCcse3BsYXRmb3JtOnZhbHVlfSlcIixcbiAgICAgICAgICAgICAgICAgICAgcGF5bG9hZDogKCkgPT4gRWRpdG9yLk1lc3NhZ2UucmVxdWVzdChcbiAgICAgICAgICAgICAgICAgICAgICAgICdwcmVmZXJlbmNlcycsICdzZXQtY29uZmlnJyBhcyBhbnksXG4gICAgICAgICAgICAgICAgICAgICAgICAncHJldmlldycgYXMgYW55LCAnY3VycmVudCcgYXMgYW55LFxuICAgICAgICAgICAgICAgICAgICAgICAgeyBwbGF0Zm9ybTogbW9kZSB9IGFzIGFueSxcbiAgICAgICAgICAgICAgICAgICAgKSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgaWQ6IFwic2V0LWNvbmZpZygncHJldmlldycsJ2N1cnJlbnQucGxhdGZvcm0nLHZhbHVlLCdnbG9iYWwnKVwiLFxuICAgICAgICAgICAgICAgICAgICBwYXlsb2FkOiAoKSA9PiBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KFxuICAgICAgICAgICAgICAgICAgICAgICAgJ3ByZWZlcmVuY2VzJywgJ3NldC1jb25maWcnIGFzIGFueSxcbiAgICAgICAgICAgICAgICAgICAgICAgICdwcmV2aWV3JyBhcyBhbnksICdjdXJyZW50LnBsYXRmb3JtJyBhcyBhbnksXG4gICAgICAgICAgICAgICAgICAgICAgICBtb2RlIGFzIGFueSwgJ2dsb2JhbCcgYXMgYW55LFxuICAgICAgICAgICAgICAgICAgICApLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBpZDogXCJzZXQtY29uZmlnKCdwcmV2aWV3JywnY3VycmVudC5wbGF0Zm9ybScsdmFsdWUsJ2xvY2FsJylcIixcbiAgICAgICAgICAgICAgICAgICAgcGF5bG9hZDogKCkgPT4gRWRpdG9yLk1lc3NhZ2UucmVxdWVzdChcbiAgICAgICAgICAgICAgICAgICAgICAgICdwcmVmZXJlbmNlcycsICdzZXQtY29uZmlnJyBhcyBhbnksXG4gICAgICAgICAgICAgICAgICAgICAgICAncHJldmlldycgYXMgYW55LCAnY3VycmVudC5wbGF0Zm9ybScgYXMgYW55LFxuICAgICAgICAgICAgICAgICAgICAgICAgbW9kZSBhcyBhbnksICdsb2NhbCcgYXMgYW55LFxuICAgICAgICAgICAgICAgICAgICApLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBpZDogXCJzZXQtY29uZmlnKCdwcmV2aWV3JywnY3VycmVudC5wbGF0Zm9ybScsdmFsdWUpXCIsXG4gICAgICAgICAgICAgICAgICAgIHBheWxvYWQ6ICgpID0+IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoXG4gICAgICAgICAgICAgICAgICAgICAgICAncHJlZmVyZW5jZXMnLCAnc2V0LWNvbmZpZycgYXMgYW55LFxuICAgICAgICAgICAgICAgICAgICAgICAgJ3ByZXZpZXcnIGFzIGFueSwgJ2N1cnJlbnQucGxhdGZvcm0nIGFzIGFueSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1vZGUgYXMgYW55LFxuICAgICAgICAgICAgICAgICAgICApLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBdO1xuICAgICAgICAgICAgY29uc3QgYXR0ZW1wdHM6IEFycmF5PHsgc3RyYXRlZ3k6IHN0cmluZzsgc2V0UmVzdWx0OiBhbnk7IG9ic2VydmVkTW9kZTogc3RyaW5nIHwgbnVsbDsgbWF0Y2hlZDogYm9vbGVhbjsgZXJyb3I/OiBzdHJpbmcgfT4gPSBbXTtcbiAgICAgICAgICAgIGxldCB3aW5uZXI6IHR5cGVvZiBhdHRlbXB0c1tudW1iZXJdIHwgbnVsbCA9IG51bGw7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHMgb2Ygc3RyYXRlZ2llcykge1xuICAgICAgICAgICAgICAgIGxldCBzZXRSZXN1bHQ6IGFueSA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICBsZXQgZXJyb3I6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBzZXRSZXN1bHQgPSBhd2FpdCBzLnBheWxvYWQoKTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgICAgICAgICBlcnJvciA9IGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29uc3Qgb2JzZXJ2ZWRNb2RlID0gYXdhaXQgcXVlcnlDdXJyZW50KCk7XG4gICAgICAgICAgICAgICAgY29uc3QgbWF0Y2hlZCA9IG9ic2VydmVkTW9kZSA9PT0gbW9kZTtcbiAgICAgICAgICAgICAgICBhdHRlbXB0cy5wdXNoKHsgc3RyYXRlZ3k6IHMuaWQsIHNldFJlc3VsdCwgb2JzZXJ2ZWRNb2RlLCBtYXRjaGVkLCBlcnJvciB9KTtcbiAgICAgICAgICAgICAgICBpZiAobWF0Y2hlZCkge1xuICAgICAgICAgICAgICAgICAgICB3aW5uZXIgPSBhdHRlbXB0c1thdHRlbXB0cy5sZW5ndGggLSAxXTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCF3aW5uZXIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGBzZXQtY29uZmlnIHN0cmF0ZWdpZXMgYWxsIGZhaWxlZCB0byBmbGlwIHByZXZpZXcuY3VycmVudC5wbGF0Zm9ybSBmcm9tIFwiJHtwcmV2aW91c01vZGUgPz8gJ3Vua25vd24nfVwiIHRvIFwiJHttb2RlfVwiLiBUcmllZCA0IHNoYXBlczsgY29jb3MgcmV0dXJuZWQgdmFsdWVzIGJ1dCB0aGUgcmVhZC1iYWNrIG5ldmVyIG1hdGNoZWQgdGhlIHJlcXVlc3RlZCBtb2RlLiBUaGUgc2V0LWNvbmZpZyBjaGFubmVsIG1heSBoYXZlIGNoYW5nZWQgaW4gdGhpcyBjb2NvcyBidWlsZDsgc3dpdGNoIHZpYSB0aGUgY29jb3MgcHJldmlldyBkcm9wZG93biBtYW51YWxseSBmb3Igbm93IGFuZCByZXBvcnQgd2hpY2ggc2hhcGUgd29ya3MuYCxcbiAgICAgICAgICAgICAgICAgICAgZGF0YTogeyBwcmV2aW91c01vZGUsIHJlcXVlc3RlZE1vZGU6IG1vZGUsIGF0dGVtcHRzIH0sXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7IHByZXZpb3VzTW9kZSwgbmV3TW9kZTogbW9kZSwgY29uZmlybWVkOiB0cnVlLCBzdHJhdGVneTogd2lubmVyLnN0cmF0ZWd5LCBhdHRlbXB0cyB9LFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBjb2NvcyBwcmV2aWV3IHN3aXRjaGVkOiBcIiR7cHJldmlvdXNNb2RlID8/ICd1bmtub3duJ31cIiDihpIgXCIke21vZGV9XCIgdmlhICR7d2lubmVyLnN0cmF0ZWd5fS4gUmVzdG9yZSB2aWEgZGVidWdfc2V0X3ByZXZpZXdfbW9kZShtb2RlPVwiJHtwcmV2aW91c01vZGUgPz8gJ2Jyb3dzZXInfVwiLCBjb25maXJtPXRydWUpIHdoZW4gZG9uZSBpZiBuZWVkZWQuYCxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBwcmVmZXJlbmNlcy9zZXQtY29uZmlnICdwcmV2aWV3JyBmYWlsZWQ6ICR7ZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpfWAgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgYmF0Y2hTY3JlZW5zaG90KHNhdmVQYXRoUHJlZml4Pzogc3RyaW5nLCBkZWxheXNNczogbnVtYmVyW10gPSBbMF0sIHdpbmRvd1RpdGxlPzogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGxldCBwcmVmaXggPSBzYXZlUGF0aFByZWZpeDtcbiAgICAgICAgICAgIGlmICghcHJlZml4KSB7XG4gICAgICAgICAgICAgICAgLy8gYmFzZW5hbWUgaXMgdGhlIHByZWZpeCBzdGVtOyBwZXItaXRlcmF0aW9uIGZpbGVzIGV4dGVuZCBpdFxuICAgICAgICAgICAgICAgIC8vIHdpdGggYC0ke2l9LnBuZ2AuIENvbnRhaW5tZW50IGNoZWNrIG9uIHRoZSBwcmVmaXggcGF0aCBpc1xuICAgICAgICAgICAgICAgIC8vIHN1ZmZpY2llbnQgYmVjYXVzZSBwYXRoLmpvaW4gcHJlc2VydmVzIGRpcm5hbWUgZm9yIGFueVxuICAgICAgICAgICAgICAgIC8vIHN1ZmZpeCB0aGUgbG9vcCBhcHBlbmRzLlxuICAgICAgICAgICAgICAgIGNvbnN0IHJlc29sdmVkID0gdGhpcy5yZXNvbHZlQXV0b0NhcHR1cmVGaWxlKGBiYXRjaC0ke0RhdGUubm93KCl9YCk7XG4gICAgICAgICAgICAgICAgaWYgKCFyZXNvbHZlZC5vaykgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiByZXNvbHZlZC5lcnJvciB9O1xuICAgICAgICAgICAgICAgIHByZWZpeCA9IHJlc29sdmVkLmZpbGVQYXRoO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyB2Mi44LjEgcm91bmQtMSBmaXggKEdlbWluaSDwn5S0ICsgQ29kZXgg8J+foSk6IGV4cGxpY2l0IHByZWZpeFxuICAgICAgICAgICAgICAgIC8vIGFsc28gZ2V0cyBjb250YWlubWVudC1jaGVja2VkLiBXZSBjaGVjayB0aGUgcHJlZml4IHBhdGhcbiAgICAgICAgICAgICAgICAvLyBpdHNlbGYg4oCUIGV2ZXJ5IGVtaXR0ZWQgZmlsZSBsaXZlcyBpbiB0aGUgc2FtZSBkaXJuYW1lLlxuICAgICAgICAgICAgICAgIC8vIHYyLjguMiByZXRlc3QgZml4OiB1c2UgcmVzb2x2ZWRQYXRoIGZvciByZWxhdGl2ZS1wcmVmaXggc3VwcG9ydC5cbiAgICAgICAgICAgICAgICBjb25zdCBndWFyZCA9IHRoaXMuYXNzZXJ0U2F2ZVBhdGhXaXRoaW5Qcm9qZWN0KHByZWZpeCk7XG4gICAgICAgICAgICAgICAgaWYgKCFndWFyZC5vaykgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBndWFyZC5lcnJvciB9O1xuICAgICAgICAgICAgICAgIHByZWZpeCA9IGd1YXJkLnJlc29sdmVkUGF0aDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHdpbiA9IHRoaXMucGlja1dpbmRvdyh3aW5kb3dUaXRsZSk7XG4gICAgICAgICAgICBjb25zdCBjYXB0dXJlczogYW55W10gPSBbXTtcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZGVsYXlzTXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICBjb25zdCBkZWxheSA9IGRlbGF5c01zW2ldO1xuICAgICAgICAgICAgICAgIGlmIChkZWxheSA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIGRlbGF5KSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IGZpbGVQYXRoID0gYCR7cHJlZml4fS0ke2l9LnBuZ2A7XG4gICAgICAgICAgICAgICAgY29uc3QgaW1hZ2UgPSBhd2FpdCB3aW4ud2ViQ29udGVudHMuY2FwdHVyZVBhZ2UoKTtcbiAgICAgICAgICAgICAgICBjb25zdCBwbmc6IEJ1ZmZlciA9IGltYWdlLnRvUE5HKCk7XG4gICAgICAgICAgICAgICAgZnMud3JpdGVGaWxlU3luYyhmaWxlUGF0aCwgcG5nKTtcbiAgICAgICAgICAgICAgICBjYXB0dXJlcy5wdXNoKHsgaW5kZXg6IGksIGRlbGF5TXM6IGRlbGF5LCBmaWxlUGF0aCwgc2l6ZTogcG5nLmxlbmd0aCB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIGNvdW50OiBjYXB0dXJlcy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgIHdpbmRvd1RpdGxlOiB0eXBlb2Ygd2luLmdldFRpdGxlID09PSAnZnVuY3Rpb24nID8gd2luLmdldFRpdGxlKCkgOiAnJyxcbiAgICAgICAgICAgICAgICAgICAgY2FwdHVyZXMsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiBgQ2FwdHVyZWQgJHtjYXB0dXJlcy5sZW5ndGh9IHNjcmVlbnNob3RzYCxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKSB9O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gdjIuNy4wICMzOiBwcmV2aWV3LXVybCAvIHF1ZXJ5LWRldmljZXMgaGFuZGxlcnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgICBwcml2YXRlIGFzeW5jIHByZXZpZXdVcmwoYWN0aW9uOiAncXVlcnknIHwgJ29wZW4nID0gJ3F1ZXJ5Jyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCB1cmw6IHN0cmluZyA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3ByZXZpZXcnLCAncXVlcnktcHJldmlldy11cmwnIGFzIGFueSkgYXMgYW55O1xuICAgICAgICAgICAgaWYgKCF1cmwgfHwgdHlwZW9mIHVybCAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdwcmV2aWV3L3F1ZXJ5LXByZXZpZXctdXJsIHJldHVybmVkIGVtcHR5IHJlc3VsdDsgY2hlY2sgdGhhdCBjb2NvcyBwcmV2aWV3IHNlcnZlciBpcyBydW5uaW5nJyB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgZGF0YTogYW55ID0geyB1cmwgfTtcbiAgICAgICAgICAgIGlmIChhY3Rpb24gPT09ICdvcGVuJykge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIExhenkgcmVxdWlyZSBzbyBzbW9rZSAvIG5vbi1FbGVjdHJvbiBjb250ZXh0cyBkb24ndCBmYXVsdFxuICAgICAgICAgICAgICAgICAgICAvLyBvbiBtaXNzaW5nIGVsZWN0cm9uLlxuICAgICAgICAgICAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLXZhci1yZXF1aXJlc1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBlbGVjdHJvbiA9IHJlcXVpcmUoJ2VsZWN0cm9uJyk7XG4gICAgICAgICAgICAgICAgICAgIC8vIHYyLjcuMSByZXZpZXcgZml4IChjb2RleCDwn5+hICsgZ2VtaW5pIPCfn6EpOiBvcGVuRXh0ZXJuYWxcbiAgICAgICAgICAgICAgICAgICAgLy8gcmVzb2x2ZXMgd2hlbiB0aGUgT1MgbGF1bmNoZXIgaXMgaW52b2tlZCwgbm90IHdoZW4gdGhlXG4gICAgICAgICAgICAgICAgICAgIC8vIHBhZ2UgcmVuZGVycy4gVXNlIFwibGF1bmNoXCIgd29yZGluZyB0byBhdm9pZCB0aGUgQUlcbiAgICAgICAgICAgICAgICAgICAgLy8gbWlzcmVhZGluZyBcIm9wZW5lZFwiIGFzIGEgY29uZmlybWVkIHBhZ2UtbG9hZC5cbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgZWxlY3Ryb24uc2hlbGwub3BlbkV4dGVybmFsKHVybCk7XG4gICAgICAgICAgICAgICAgICAgIGRhdGEubGF1bmNoZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICAgICAgICAgIGRhdGEubGF1bmNoZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgZGF0YS5sYXVuY2hFcnJvciA9IGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBSZWZsZWN0IGFjdHVhbCBsYXVuY2ggb3V0Y29tZSBpbiB0aGUgdG9wLWxldmVsIG1lc3NhZ2Ugc28gQUlcbiAgICAgICAgICAgIC8vIHNlZXMgXCJsYXVuY2ggZmFpbGVkXCIgaW5zdGVhZCBvZiBtaXNsZWFkaW5nIFwiT3BlbmVkIC4uLlwiIHdoZW5cbiAgICAgICAgICAgIC8vIG9wZW5FeHRlcm5hbCB0aHJldyAoZ2VtaW5pIPCfn6EpLlxuICAgICAgICAgICAgY29uc3QgbWVzc2FnZSA9IGFjdGlvbiA9PT0gJ29wZW4nXG4gICAgICAgICAgICAgICAgPyAoZGF0YS5sYXVuY2hlZFxuICAgICAgICAgICAgICAgICAgICA/IGBMYXVuY2hlZCAke3VybH0gaW4gZGVmYXVsdCBicm93c2VyIChwYWdlIHJlbmRlciBub3QgYXdhaXRlZClgXG4gICAgICAgICAgICAgICAgICAgIDogYFJldHVybmVkIFVSTCAke3VybH0gYnV0IGxhdW5jaCBmYWlsZWQ6ICR7ZGF0YS5sYXVuY2hFcnJvcn1gKVxuICAgICAgICAgICAgICAgIDogdXJsO1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZGF0YSwgbWVzc2FnZSB9O1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycikgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIHYyLjguMCBULVYyOC0zOiBQSUUgcGxheSAvIHN0b3AuIFJvdXRlcyB0aHJvdWdoIHNjZW5lLXNjcmlwdCBzbyB0aGVcbiAgICAvLyB0eXBlZCBjY2UuU2NlbmVGYWNhZGUuY2hhbmdlUHJldmlld1BsYXlTdGF0ZSBpcyByZWFjaGVkIHZpYSB0aGVcbiAgICAvLyBkb2N1bWVudGVkIGV4ZWN1dGUtc2NlbmUtc2NyaXB0IGNoYW5uZWwuXG4gICAgLy9cbiAgICAvLyB2Mi44LjMgVC1WMjgzLTMgcmV0ZXN0IGZpbmRpbmc6IGNvY29zIHNvbWV0aW1lcyBsb2dzXG4gICAgLy8gXCJGYWlsZWQgdG8gcmVmcmVzaCB0aGUgY3VycmVudCBzY2VuZVwiIGluc2lkZSBjaGFuZ2VQcmV2aWV3UGxheVN0YXRlXG4gICAgLy8gZXZlbiB3aGVuIHRoZSBjYWxsIHJldHVybnMgd2l0aG91dCB0aHJvd2luZy4gT2JzZXJ2ZWQgaW4gY29jb3NcbiAgICAvLyAzLjguNyAvIGVtYmVkZGVkIHByZXZpZXcgbW9kZS4gVGhlIHJvb3QgY2F1c2UgaXMgdW5jbGVhciAobWF5XG4gICAgLy8gcmVsYXRlIHRvIGN1bXVsYXRpdmUgc2NlbmUtZGlydHkgLyBlbWJlZGRlZC1tb2RlIHRpbWluZyAvXG4gICAgLy8gaW5pdGlhbC1sb2FkIGNvbXBsYWludCksIGJ1dCB0aGUgdmlzaWJsZSBlZmZlY3QgaXMgdGhhdCBQSUUgc3RhdGVcbiAgICAvLyBjaGFuZ2VzIGluY29tcGxldGVseS4gV2Ugbm93IFNDQU4gdGhlIGNhcHR1cmVkIHNjZW5lLXNjcmlwdCBsb2dzXG4gICAgLy8gZm9yIHRoYXQgZXJyb3Igc3RyaW5nIGFuZCBzdXJmYWNlIGl0IHRvIHRoZSBBSSBhcyBhIHN0cnVjdHVyZWRcbiAgICAvLyB3YXJuaW5nIGluc3RlYWQgb2YgbGV0dGluZyBpdCBoaWRlIGluc2lkZSBkYXRhLmNhcHR1cmVkTG9ncy5cbiAgICAvLyB2Mi45LjAgVC1WMjktMTogZWRpdG9yLWhlYWx0aCBwcm9iZS4gRGV0ZWN0cyBzY2VuZS1zY3JpcHQgZnJlZXplXG4gICAgLy8gYnkgcnVubmluZyB0d28gcHJvYmVzIGluIHBhcmFsbGVsOlxuICAgIC8vICAgLSBob3N0IHByb2JlOiBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdkZXZpY2UnLCAncXVlcnknKSDigJQgZ29lc1xuICAgIC8vICAgICB0byB0aGUgZWRpdG9yIG1haW4gcHJvY2VzcywgTk9UIHRoZSBzY2VuZS1zY3JpcHQgcmVuZGVyZXIuXG4gICAgLy8gICAgIFRoaXMgc3RheXMgcmVzcG9uc2l2ZSBldmVuIHdoZW4gc2NlbmUgaXMgd2VkZ2VkLlxuICAgIC8vICAgLSBzY2VuZSBwcm9iZTogZXhlY3V0ZS1zY2VuZS1zY3JpcHQgaW52b2NhdGlvbiB3aXRoIGEgdHJpdmlhbFxuICAgIC8vICAgICBgZXZhbEVjaG9gIHRlc3QgKHVzZXMgYW4gZXhpc3Rpbmcgc2FmZSBzY2VuZSBtZXRob2QsIHdpdGhcbiAgICAvLyAgICAgd3JhcHBpbmcgdGltZW91dCkuIFRpbWVzIG91dCDihpIgc2NlbmUtc2NyaXB0IGZyb3plbi5cbiAgICAvL1xuICAgIC8vIERlc2lnbmVkIGZvciB0aGUgcG9zdC1wcmV2aWV3X2NvbnRyb2woc3RhcnQpIGZyZWV6ZSBwYXR0ZXJuIGluXG4gICAgLy8gbGFuZG1pbmUgIzE2OiBBSSBjYWxscyBwcmV2aWV3X2NvbnRyb2woc3RhcnQpLCB0aGVuXG4gICAgLy8gY2hlY2tfZWRpdG9yX2hlYWx0aCwgYW5kIGlmIHNjZW5lQWxpdmU9ZmFsc2Ugc3RvcHMgaXNzdWluZyBtb3JlXG4gICAgLy8gc2NlbmUgY2FsbHMgYW5kIHN1cmZhY2VzIHRoZSByZWNvdmVyeSBoaW50IGluc3RlYWQgb2YgaGFuZ2luZy5cbiAgICBwcml2YXRlIGFzeW5jIGNoZWNrRWRpdG9ySGVhbHRoKHNjZW5lVGltZW91dE1zOiBudW1iZXIgPSAxNTAwKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgdDAgPSBEYXRlLm5vdygpO1xuICAgICAgICAvLyBIb3N0IHByb2JlIOKAlCBzaG91bGQgYWx3YXlzIHJlc29sdmUgZmFzdC5cbiAgICAgICAgbGV0IGhvc3RBbGl2ZSA9IGZhbHNlO1xuICAgICAgICBsZXQgaG9zdEVycm9yOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2RldmljZScsICdxdWVyeScpO1xuICAgICAgICAgICAgaG9zdEFsaXZlID0gdHJ1ZTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIGhvc3RFcnJvciA9IGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBTY2VuZSBwcm9iZSDigJQgdjIuOS41IHJldmlldyBmaXggKEdlbWluaSDwn5S0ICsgQ29kZXgg8J+UtCArIENsYXVkZSDwn5+hKTpcbiAgICAgICAgLy8gdjIuOS4wIHVzZWQgZ2V0Q3VycmVudFNjZW5lSW5mbyB2aWEgZXhlY3V0ZS1zY2VuZS1zY3JpcHQgd3JhcHBlcixcbiAgICAgICAgLy8gYnV0IHRoYXQgc2NlbmUtc2lkZSBtZXRob2QganVzdCByZWFkcyBgZGlyZWN0b3IuZ2V0U2NlbmUoKWBcbiAgICAgICAgLy8gKGNhY2hlZCBzaW5nbGV0b24pIGFuZCByZXNvbHZlcyA8MW1zIGV2ZW4gd2hlbiB0aGUgc2NlbmUtc2NyaXB0XG4gICAgICAgIC8vIHJlbmRlcmVyIGlzIHZpc2libHkgZnJvemVuIOKAlCBjb25maXJtZWQgbGl2ZSBkdXJpbmcgdjIuOS4xIHJldGVzdFxuICAgICAgICAvLyB3aGVyZSBzY2VuZUFsaXZlIHJldHVybmVkIHRydWUgd2hpbGUgdXNlciByZXBvcnRlZCB0aGUgZWRpdG9yXG4gICAgICAgIC8vIHdhcyBzcGlubmluZyBhbmQgcmVxdWlyZWQgQ3RybCtSLlxuICAgICAgICAvL1xuICAgICAgICAvLyBTd2l0Y2ggdG8gdHdvIHByb2JlcyB0aGF0IGV4ZXJjaXNlIGRpZmZlcmVudCBwYXRoczpcbiAgICAgICAgLy8gIDEuIGBzY2VuZS9xdWVyeS1pcy1yZWFkeWAgKHR5cGVkIGNoYW5uZWwg4oCUIHNlZVxuICAgICAgICAvLyAgICAgc2NlbmUvQHR5cGVzL21lc3NhZ2UuZC50czoyNTcpLiBEaXJlY3QgSVBDIGludG8gdGhlIHNjZW5lXG4gICAgICAgIC8vICAgICBtb2R1bGU7IHdpbGwgaGFuZyBpZiB0aGUgc2NlbmUtc2NyaXB0IHJlbmRlcmVyIGlzIHdlZGdlZC5cbiAgICAgICAgLy8gIDIuIGBzY2VuZS9leGVjdXRlLXNjZW5lLXNjcmlwdGAgcnVuV2l0aENhcHR1cmUoJ3F1ZXJ5Tm9kZUR1bXAnKVxuICAgICAgICAvLyAgICAgb24gYSBrbm93biBVVUlEIGZvcmNpbmcgYW4gYWN0dWFsIHNjZW5lLWdyYXBoIHdhbGsg4oCUIGNvdmVyc1xuICAgICAgICAvLyAgICAgdGhlIGNhc2Ugd2hlcmUgc2NlbmUgSVBDIGlzIGFsaXZlIGJ1dCB0aGUgcnVuV2l0aENhcHR1cmUgL1xuICAgICAgICAvLyAgICAgZXhlY3V0ZS1zY2VuZS1zY3JpcHQgcGF0aCBpcyB0aGUgd2VkZ2VkIG9uZS5cbiAgICAgICAgLy8gV2UgZGVjbGFyZSBzY2VuZSBoZWFsdGh5IG9ubHkgd2hlbiBCT1RIIHByb2JlcyByZXNvbHZlIHdpdGhpblxuICAgICAgICAvLyB0aGUgdGltZW91dC4gRWFjaCBwcm9iZSBnZXRzIGl0cyBvd24gdGltZW91dCByYWNlIHNvIGEgc3R1Y2tcbiAgICAgICAgLy8gc2NlbmUtc2NyaXB0IGRvZXNuJ3QgY29tcG91bmQgZGVsYXlzLlxuICAgICAgICBjb25zdCBwcm9iZVdpdGhUaW1lb3V0ID0gYXN5bmMgPFQ+KHA6IFByb21pc2U8VD4sIGxhYmVsOiBzdHJpbmcpOiBQcm9taXNlPHsgb2s6IHRydWU7IHZhbHVlOiBUOyBsYXRlbmN5TXM6IG51bWJlciB9IHwgeyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmc7IGxhdGVuY3lNczogbnVtYmVyIH0+ID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHN0YXJ0ID0gRGF0ZS5ub3coKTtcbiAgICAgICAgICAgIGNvbnN0IHRpbWVvdXQgPSBuZXcgUHJvbWlzZTx7IHRpbWVkT3V0OiB0cnVlIH0+KHJlc29sdmUgPT5cbiAgICAgICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHJlc29sdmUoeyB0aW1lZE91dDogdHJ1ZSB9KSwgc2NlbmVUaW1lb3V0TXMpLFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcjogYW55ID0gYXdhaXQgUHJvbWlzZS5yYWNlKFtwLnRoZW4odiA9PiAoeyB2YWx1ZTogdiwgdGltZWRPdXQ6IGZhbHNlIH0pKSwgdGltZW91dF0pO1xuICAgICAgICAgICAgICAgIGNvbnN0IGxhdGVuY3lNcyA9IERhdGUubm93KCkgLSBzdGFydDtcbiAgICAgICAgICAgICAgICBpZiAocj8udGltZWRPdXQpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGAke2xhYmVsfSBwcm9iZSB0aW1lZCBvdXQgYWZ0ZXIgJHtzY2VuZVRpbWVvdXRNc31tc2AsIGxhdGVuY3lNcyB9O1xuICAgICAgICAgICAgICAgIHJldHVybiB7IG9rOiB0cnVlLCB2YWx1ZTogci52YWx1ZSwgbGF0ZW5jeU1zIH07XG4gICAgICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGAke2xhYmVsfSBwcm9iZSB0aHJldzogJHtlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycil9YCwgbGF0ZW5jeU1zOiBEYXRlLm5vdygpIC0gc3RhcnQgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgY29uc3QgaXNSZWFkeVAgPSBwcm9iZVdpdGhUaW1lb3V0KFxuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktaXMtcmVhZHknIGFzIGFueSkgYXMgUHJvbWlzZTxib29sZWFuPixcbiAgICAgICAgICAgICdzY2VuZS9xdWVyeS1pcy1yZWFkeScsXG4gICAgICAgICk7XG4gICAgICAgIC8vIHYyLjkuNiByb3VuZC0yIGZpeCAoQ29kZXgg8J+UtCArIENsYXVkZSDwn5+hKTogdjIuOS41IHVzZWRcbiAgICAgICAgLy8gYHNjZW5lL3F1ZXJ5LWN1cnJlbnQtc2NlbmVgIGNoYWluZWQgaW50byBgcXVlcnktbm9kZWAg4oCUXG4gICAgICAgIC8vIGBxdWVyeS1jdXJyZW50LXNjZW5lYCBpcyBOT1QgaW4gc2NlbmUvQHR5cGVzL21lc3NhZ2UuZC50c1xuICAgICAgICAvLyAob25seSBgcXVlcnktaXMtcmVhZHlgIGFuZCBgcXVlcnktbm9kZS10cmVlYC9ldGMuIGFyZSB0eXBlZCkuXG4gICAgICAgIC8vIEFuIHVua25vd24gY2hhbm5lbCBtYXkgcmVzb2x2ZSBmYXN0IHdpdGggZ2FyYmFnZSBvbiBzb21lIGNvY29zXG4gICAgICAgIC8vIGJ1aWxkcywgbGVhZGluZyB0byBmYWxzZS1oZWFsdGh5IHJlcG9ydHMuXG4gICAgICAgIC8vXG4gICAgICAgIC8vIFN3aXRjaCB0byBgc2NlbmUvcXVlcnktbm9kZS10cmVlYCAodHlwZWQ6IHNjZW5lL0B0eXBlcy9cbiAgICAgICAgLy8gbWVzc2FnZS5kLnRzOjI3Mykgd2l0aCBubyBhcmcg4oCUIHJldHVybnMgdGhlIGZ1bGwgSU5vZGVbXSB0cmVlLlxuICAgICAgICAvLyBUaGlzIGZvcmNlcyBhIHJlYWwgZ3JhcGggd2FsayB0aHJvdWdoIHRoZSBzY2VuZS1zY3JpcHQgcmVuZGVyZXJcbiAgICAgICAgLy8gYW5kIGlzIHRoZSByaWdodCBzdHJlbmd0aCBvZiBwcm9iZSBmb3IgbGl2ZW5lc3MgZGV0ZWN0aW9uLlxuICAgICAgICBjb25zdCBkdW1wUCA9IHByb2JlV2l0aFRpbWVvdXQoXG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1ub2RlLXRyZWUnIGFzIGFueSkgYXMgUHJvbWlzZTxhbnk+LFxuICAgICAgICAgICAgJ3NjZW5lL3F1ZXJ5LW5vZGUtdHJlZScsXG4gICAgICAgICk7XG4gICAgICAgIGNvbnN0IFtpc1JlYWR5LCBkdW1wXSA9IGF3YWl0IFByb21pc2UuYWxsKFtpc1JlYWR5UCwgZHVtcFBdKTtcbiAgICAgICAgY29uc3Qgc2NlbmVMYXRlbmN5TXMgPSBNYXRoLm1heChpc1JlYWR5LmxhdGVuY3lNcywgZHVtcC5sYXRlbmN5TXMpO1xuICAgICAgICAvLyB2Mi45LjYgcm91bmQtMiBmaXggKENvZGV4IPCflLQgc2luZ2xlIOKAlCBudWxsIFVVSUQgZmFsc2UtaGVhbHRoeSk6XG4gICAgICAgIC8vIHJlcXVpcmUgQk9USCBwcm9iZXMgdG8gcmVzb2x2ZSBBTkQgcXVlcnktaXMtcmVhZHkgPT09IHRydWUgQU5EXG4gICAgICAgIC8vIHF1ZXJ5LW5vZGUtdHJlZSB0byByZXR1cm4gbm9uLW51bGwuIEVtcHR5IHJlc3VsdCBzdHJpbmcgLyBudWxsXG4gICAgICAgIC8vIC8gdW5kZWZpbmVkIGFsbCBmb3JjZSBzY2VuZUFsaXZlPWZhbHNlIHNvIEFJIGdldHMgYSBjbGVhclxuICAgICAgICAvLyBzaWduYWwgaW5zdGVhZCBvZiBhbiBcImFsaXZlIGJ1dCBnYXJiYWdlXCIgZW52ZWxvcGUuXG4gICAgICAgIGNvbnN0IGR1bXBWYWxpZCA9IGR1bXAub2sgJiYgZHVtcC52YWx1ZSAhPT0gbnVsbCAmJiBkdW1wLnZhbHVlICE9PSB1bmRlZmluZWQ7XG4gICAgICAgIGNvbnN0IHNjZW5lQWxpdmUgPSBpc1JlYWR5Lm9rICYmIGR1bXBWYWxpZCAmJiBpc1JlYWR5LnZhbHVlID09PSB0cnVlO1xuICAgICAgICBsZXQgc2NlbmVFcnJvcjogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgICAgIGlmICghaXNSZWFkeS5vaykgc2NlbmVFcnJvciA9IGlzUmVhZHkuZXJyb3I7XG4gICAgICAgIGVsc2UgaWYgKCFkdW1wLm9rKSBzY2VuZUVycm9yID0gZHVtcC5lcnJvcjtcbiAgICAgICAgZWxzZSBpZiAoIWR1bXBWYWxpZCkgc2NlbmVFcnJvciA9IGBzY2VuZS9xdWVyeS1ub2RlLXRyZWUgcmV0dXJuZWQgJHtKU09OLnN0cmluZ2lmeShkdW1wLnZhbHVlKX0gKGV4cGVjdGVkIG5vbi1udWxsKWA7XG4gICAgICAgIGVsc2UgaWYgKGlzUmVhZHkudmFsdWUgIT09IHRydWUpIHNjZW5lRXJyb3IgPSBgc2NlbmUvcXVlcnktaXMtcmVhZHkgcmV0dXJuZWQgJHtKU09OLnN0cmluZ2lmeShpc1JlYWR5LnZhbHVlKX0gKGV4cGVjdGVkIHRydWUpYDtcbiAgICAgICAgY29uc3Qgc3VnZ2VzdGlvbiA9ICFob3N0QWxpdmVcbiAgICAgICAgICAgID8gJ2NvY29zIGVkaXRvciBob3N0IHByb2Nlc3MgdW5yZXNwb25zaXZlIOKAlCB2ZXJpZnkgdGhlIGVkaXRvciBpcyBydW5uaW5nIGFuZCB0aGUgY29jb3MtbWNwLXNlcnZlciBleHRlbnNpb24gaXMgbG9hZGVkLidcbiAgICAgICAgICAgIDogIXNjZW5lQWxpdmVcbiAgICAgICAgICAgICAgICA/ICdjb2NvcyBlZGl0b3Igc2NlbmUtc2NyaXB0IGlzIGZyb3plbiAobGlrZWx5IGxhbmRtaW5lICMxNiBhZnRlciBwcmV2aWV3X2NvbnRyb2woc3RhcnQpKS4gUHJlc3MgQ3RybCtSIGluIHRoZSBjb2NvcyBlZGl0b3IgdG8gcmVsb2FkIHRoZSBzY2VuZS1zY3JpcHQgcmVuZGVyZXI7IGRvIG5vdCBpc3N1ZSBtb3JlIHNjZW5lLyogdG9vbCBjYWxscyB1bnRpbCByZWNvdmVyZWQuJ1xuICAgICAgICAgICAgICAgIDogJ2VkaXRvciBoZWFsdGh5OyBzY2VuZS1zY3JpcHQgYW5kIGhvc3QgYm90aCByZXNwb25zaXZlLic7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgIGhvc3RBbGl2ZSxcbiAgICAgICAgICAgICAgICBzY2VuZUFsaXZlLFxuICAgICAgICAgICAgICAgIHNjZW5lTGF0ZW5jeU1zLFxuICAgICAgICAgICAgICAgIHNjZW5lVGltZW91dE1zLFxuICAgICAgICAgICAgICAgIGhvc3RFcnJvcixcbiAgICAgICAgICAgICAgICBzY2VuZUVycm9yLFxuICAgICAgICAgICAgICAgIHRvdGFsUHJvYmVNczogRGF0ZS5ub3coKSAtIHQwLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIG1lc3NhZ2U6IHN1Z2dlc3Rpb24sXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gdjIuOS54IHBvbGlzaCAoQ29kZXggcjEgc2luZ2xlLfCfn6EgZnJvbSB2Mi44LjEgcmV2aWV3KTogbW9kdWxlLWxldmVsXG4gICAgLy8gaW4tZmxpZ2h0IGd1YXJkIHByZXZlbnRzIEFJIHdvcmtmbG93cyBmcm9tIGZpcmluZyB0d28gUElFIHN0YXRlXG4gICAgLy8gY2hhbmdlcyBjb25jdXJyZW50bHkuIFRoZSBjb2NvcyBlbmdpbmUgcmFjZSBpbiBsYW5kbWluZSAjMTYgbWFrZXNcbiAgICAvLyBkb3VibGUtZmlyZSBwYXJ0aWN1bGFybHkgZGFuZ2Vyb3VzIOKAlCB0aGUgc2Vjb25kIGNhbGwgd291bGQgaGl0XG4gICAgLy8gYSBwYXJ0aWFsbHktaW5pdGlhbGlzZWQgUHJldmlld1NjZW5lRmFjYWRlLiBSZWplY3Qgb3ZlcmxhcC5cbiAgICBwcml2YXRlIHN0YXRpYyBwcmV2aWV3Q29udHJvbEluRmxpZ2h0ID0gZmFsc2U7XG5cbiAgICBwcml2YXRlIGFzeW5jIHByZXZpZXdDb250cm9sKG9wOiAnc3RhcnQnIHwgJ3N0b3AnLCBhY2tub3dsZWRnZUZyZWV6ZVJpc2s6IGJvb2xlYW4gPSBmYWxzZSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIC8vIHYyLjkueCBwYXJrIGdhdGU6IG9wPVwic3RhcnRcIiBpcyBrbm93biB0byBmcmVlemUgY29jb3MgMy44LjdcbiAgICAgICAgLy8gKGxhbmRtaW5lICMxNikuIFJlZnVzZSB1bmxlc3MgdGhlIGNhbGxlciBoYXMgZXhwbGljaXRseVxuICAgICAgICAvLyBhY2tub3dsZWRnZWQgdGhlIHJpc2suIG9wPVwic3RvcFwiIGlzIGFsd2F5cyBzYWZlIOKAlCBieXBhc3MgdGhlXG4gICAgICAgIC8vIGdhdGUgc28gY2FsbGVycyBjYW4gcmVjb3ZlciBmcm9tIGEgaGFsZi1hcHBsaWVkIHN0YXRlLlxuICAgICAgICBpZiAob3AgPT09ICdzdGFydCcgJiYgIWFja25vd2xlZGdlRnJlZXplUmlzaykge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBlcnJvcjogJ2RlYnVnX3ByZXZpZXdfY29udHJvbChvcD1cInN0YXJ0XCIpIGlzIHBhcmtlZCBkdWUgdG8gbGFuZG1pbmUgIzE2IOKAlCB0aGUgY29jb3MgMy44Ljcgc29mdFJlbG9hZFNjZW5lIHJhY2UgZnJlZXplcyB0aGUgZWRpdG9yIHJlZ2FyZGxlc3Mgb2YgcHJldmlldyBtb2RlICh2ZXJpZmllZCBlbWJlZGRlZCArIGJyb3dzZXIpLiBUbyBwcm9jZWVkIGFueXdheSwgcmUtY2FsbCB3aXRoIGFja25vd2xlZGdlRnJlZXplUmlzaz10cnVlIEFORCBlbnN1cmUgdGhlIGh1bWFuIHVzZXIgaXMgcHJlcGFyZWQgdG8gcHJlc3MgQ3RybCtSIGluIGNvY29zIGlmIHRoZSBlZGl0b3IgZnJlZXplcy4gKipTdHJvbmdseSBwcmVmZXJyZWQgYWx0ZXJuYXRpdmVzKio6IChhKSBkZWJ1Z19jYXB0dXJlX3ByZXZpZXdfc2NyZWVuc2hvdChtb2RlPVwiZW1iZWRkZWRcIikgaW4gRURJVCBtb2RlIChubyBQSUUgbmVlZGVkKTsgKGIpIGRlYnVnX2dhbWVfY29tbWFuZCh0eXBlPVwic2NyZWVuc2hvdFwiKSB2aWEgR2FtZURlYnVnQ2xpZW50IG9uIGJyb3dzZXIgcHJldmlldy4gUGVuZGluZyB2Mi45IHJlZmVyZW5jZS1wcm9qZWN0IGNvbXBhcmlzb24uJyxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgaWYgKERlYnVnVG9vbHMucHJldmlld0NvbnRyb2xJbkZsaWdodCkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBlcnJvcjogJ0Fub3RoZXIgZGVidWdfcHJldmlld19jb250cm9sIGNhbGwgaXMgYWxyZWFkeSBpbiBmbGlnaHQuIFBJRSBzdGF0ZSBjaGFuZ2VzIGdvIHRocm91Z2ggY29jb3NcXCcgU2NlbmVGYWNhZGVGU00gYW5kIGRvdWJsZS1maXJpbmcgZHVyaW5nIHRoZSBpbi1mbGlnaHQgd2luZG93IHJpc2tzIGNvbXBvdW5kaW5nIHRoZSBsYW5kbWluZSAjMTYgZnJlZXplLiBXYWl0IGZvciB0aGUgcHJldmlvdXMgY2FsbCB0byByZXNvbHZlLCB0aGVuIHJldHJ5LicsXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIERlYnVnVG9vbHMucHJldmlld0NvbnRyb2xJbkZsaWdodCA9IHRydWU7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5wcmV2aWV3Q29udHJvbElubmVyKG9wKTtcbiAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgIERlYnVnVG9vbHMucHJldmlld0NvbnRyb2xJbkZsaWdodCA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBwcmV2aWV3Q29udHJvbElubmVyKG9wOiAnc3RhcnQnIHwgJ3N0b3AnKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3Qgc3RhdGUgPSBvcCA9PT0gJ3N0YXJ0JztcbiAgICAgICAgY29uc3QgcmVzdWx0OiBUb29sUmVzcG9uc2UgPSBhd2FpdCBydW5TY2VuZU1ldGhvZEFzVG9vbFJlc3BvbnNlKCdjaGFuZ2VQcmV2aWV3UGxheVN0YXRlJywgW3N0YXRlXSk7XG4gICAgICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgICAgICAgLy8gU2NhbiBjYXB0dXJlZExvZ3MgZm9yIHRoZSBrbm93biBjb2NvcyB3YXJuaW5nIHNvIEFJXG4gICAgICAgICAgICAvLyBkb2Vzbid0IGdldCBhIG1pc2xlYWRpbmcgYmFyZS1zdWNjZXNzIGVudmVsb3BlLlxuICAgICAgICAgICAgY29uc3QgY2FwdHVyZWQgPSAocmVzdWx0IGFzIGFueSkuY2FwdHVyZWRMb2dzIGFzIEFycmF5PHsgbGV2ZWw6IHN0cmluZzsgbWVzc2FnZTogc3RyaW5nIH0+IHwgdW5kZWZpbmVkO1xuICAgICAgICAgICAgY29uc3Qgc2NlbmVSZWZyZXNoRXJyb3IgPSBjYXB0dXJlZD8uZmluZChcbiAgICAgICAgICAgICAgICBlID0+IGU/LmxldmVsID09PSAnZXJyb3InICYmIC9GYWlsZWQgdG8gcmVmcmVzaCB0aGUgY3VycmVudCBzY2VuZS9pLnRlc3QoZT8ubWVzc2FnZSA/PyAnJyksXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgY29uc3Qgd2FybmluZ3M6IHN0cmluZ1tdID0gW107XG4gICAgICAgICAgICBpZiAoc2NlbmVSZWZyZXNoRXJyb3IpIHtcbiAgICAgICAgICAgICAgICB3YXJuaW5ncy5wdXNoKFxuICAgICAgICAgICAgICAgICAgICAnY29jb3MgZW5naW5lIHRocmV3IFwiRmFpbGVkIHRvIHJlZnJlc2ggdGhlIGN1cnJlbnQgc2NlbmVcIiBpbnNpZGUgc29mdFJlbG9hZFNjZW5lIGR1cmluZyBQSUUgc3RhdGUgY2hhbmdlLiBUaGlzIGlzIGEgY29jb3MgMy44LjcgcmFjZSBmaXJlZCBieSBjaGFuZ2VQcmV2aWV3UGxheVN0YXRlIGl0c2VsZiwgbm90IGdhdGVkIGJ5IHByZXZpZXcgbW9kZSAodmVyaWZpZWQgaW4gYm90aCBlbWJlZGRlZCBhbmQgYnJvd3NlciBtb2RlcyDigJQgc2VlIENMQVVERS5tZCBsYW5kbWluZSAjMTYpLiBQSUUgaGFzIE5PVCBhY3R1YWxseSBzdGFydGVkIGFuZCB0aGUgY29jb3MgZWRpdG9yIG1heSBmcmVlemUgKHNwaW5uaW5nIGluZGljYXRvcikgcmVxdWlyaW5nIHRoZSBodW1hbiB1c2VyIHRvIHByZXNzIEN0cmwrUiB0byByZWNvdmVyLiAqKlJlY29tbWVuZGVkIGFsdGVybmF0aXZlcyoqOiAoYSkgZGVidWdfY2FwdHVyZV9wcmV2aWV3X3NjcmVlbnNob3QobW9kZT1cImVtYmVkZGVkXCIpIGluIEVESVQgbW9kZSDigJQgY2FwdHVyZXMgdGhlIGVkaXRvciBnYW1ldmlldyB3aXRob3V0IHN0YXJ0aW5nIFBJRTsgKGIpIGRlYnVnX2dhbWVfY29tbWFuZCh0eXBlPVwic2NyZWVuc2hvdFwiKSB2aWEgR2FtZURlYnVnQ2xpZW50IHJ1bm5pbmcgb24gYnJvd3NlciBwcmV2aWV3IChkZWJ1Z19wcmV2aWV3X3VybChhY3Rpb249XCJvcGVuXCIpKSDigJQgdXNlcyBydW50aW1lIGNhbnZhcywgYnlwYXNzZXMgdGhlIGVuZ2luZSByYWNlIGVudGlyZWx5LiBEbyBOT1QgcmV0cnkgcHJldmlld19jb250cm9sKHN0YXJ0KSDigJQgaXQgd2lsbCBub3QgaGVscCBhbmQgbWF5IGNvbXBvdW5kIHRoZSBmcmVlemUuJyxcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgYmFzZU1lc3NhZ2UgPSBzdGF0ZVxuICAgICAgICAgICAgICAgID8gJ0VudGVyZWQgUHJldmlldy1pbi1FZGl0b3IgcGxheSBtb2RlIChQSUUgbWF5IHRha2UgYSBtb21lbnQgdG8gYXBwZWFyOyBtb2RlIGRlcGVuZHMgb24gY29jb3MgcHJldmlldyBjb25maWcg4oCUIHNlZSBkZWJ1Z19nZXRfcHJldmlld19tb2RlKSdcbiAgICAgICAgICAgICAgICA6ICdFeGl0ZWQgUHJldmlldy1pbi1FZGl0b3IgcGxheSBtb2RlJztcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgLi4ucmVzdWx0LFxuICAgICAgICAgICAgICAgIC4uLih3YXJuaW5ncy5sZW5ndGggPiAwID8geyBkYXRhOiB7IC4uLihyZXN1bHQuZGF0YSA/PyB7fSksIHdhcm5pbmdzIH0gfSA6IHt9KSxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiB3YXJuaW5ncy5sZW5ndGggPiAwXG4gICAgICAgICAgICAgICAgICAgID8gYCR7YmFzZU1lc3NhZ2V9LiDimqAgJHt3YXJuaW5ncy5qb2luKCcgJyl9YFxuICAgICAgICAgICAgICAgICAgICA6IGJhc2VNZXNzYWdlLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICAvLyB2Mi45LnggcG9saXNoIChDbGF1ZGUgcjEgc2luZ2xlLfCfn6EgZnJvbSB2Mi44LjEgcmV2aWV3KTpcbiAgICAgICAgLy8gZmFpbHVyZS1icmFuY2ggd2FzIHJldHVybmluZyB0aGUgYnJpZGdlJ3MgZW52ZWxvcGUgdmVyYmF0aW1cbiAgICAgICAgLy8gd2l0aG91dCBhIG1lc3NhZ2UgZmllbGQsIHdoaWxlIHN1Y2Nlc3MgYnJhbmNoIGNhcnJpZWQgYSBjbGVhclxuICAgICAgICAvLyBtZXNzYWdlLiBBZGQgYSBzeW1tZXRyaWMgbWVzc2FnZSBzbyBzdHJlYW1pbmcgQUkgY2xpZW50cyBzZWVcbiAgICAgICAgLy8gYSBjb25zaXN0ZW50IGVudmVsb3BlIHNoYXBlIG9uIGJvdGggcGF0aHMuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAuLi5yZXN1bHQsXG4gICAgICAgICAgICBtZXNzYWdlOiByZXN1bHQubWVzc2FnZSA/PyBgRmFpbGVkIHRvICR7b3B9IFByZXZpZXctaW4tRWRpdG9yIHBsYXkgbW9kZSDigJQgc2VlIGVycm9yLmAsXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBxdWVyeURldmljZXMoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGRldmljZXM6IGFueVtdID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnZGV2aWNlJywgJ3F1ZXJ5JykgYXMgYW55O1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogeyBkZXZpY2VzOiBBcnJheS5pc0FycmF5KGRldmljZXMpID8gZGV2aWNlcyA6IFtdLCBjb3VudDogQXJyYXkuaXNBcnJheShkZXZpY2VzKSA/IGRldmljZXMubGVuZ3RoIDogMCB9IH07XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKSB9O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gdjIuNi4wIFQtVjI2LTE6IEdhbWVEZWJ1Z0NsaWVudCBicmlkZ2UgaGFuZGxlcnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgICBwcml2YXRlIGFzeW5jIGdhbWVDb21tYW5kKHR5cGU6IHN0cmluZywgYXJnczogYW55LCB0aW1lb3V0TXM6IG51bWJlciA9IDEwMDAwKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgcXVldWVkID0gcXVldWVHYW1lQ29tbWFuZCh0eXBlLCBhcmdzKTtcbiAgICAgICAgaWYgKCFxdWV1ZWQub2spIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogcXVldWVkLmVycm9yIH07XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgYXdhaXRlZCA9IGF3YWl0IGF3YWl0Q29tbWFuZFJlc3VsdChxdWV1ZWQuaWQsIHRpbWVvdXRNcyk7XG4gICAgICAgIGlmICghYXdhaXRlZC5vaykge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBhd2FpdGVkLmVycm9yIH07XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXRlZC5yZXN1bHQ7XG4gICAgICAgIGlmIChyZXN1bHQuc3VjY2VzcyA9PT0gZmFsc2UpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogcmVzdWx0LmVycm9yID8/ICdHYW1lRGVidWdDbGllbnQgcmVwb3J0ZWQgZmFpbHVyZScsIGRhdGE6IHJlc3VsdC5kYXRhIH07XG4gICAgICAgIH1cbiAgICAgICAgLy8gQnVpbHQtaW4gc2NyZWVuc2hvdCBwYXRoOiBjbGllbnQgc2VuZHMgYmFjayBhIGJhc2U2NCBkYXRhVXJsO1xuICAgICAgICAvLyBsYW5kaW5nIHRoZSBieXRlcyB0byBkaXNrIG9uIGhvc3Qgc2lkZSBrZWVwcyB0aGUgcmVzdWx0IGVudmVsb3BlXG4gICAgICAgIC8vIHNtYWxsIGFuZCByZXVzZXMgdGhlIGV4aXN0aW5nIHByb2plY3Qtcm9vdGVkIGNhcHR1cmUgZGlyIGd1YXJkLlxuICAgICAgICBpZiAodHlwZSA9PT0gJ3NjcmVlbnNob3QnICYmIHJlc3VsdC5kYXRhICYmIHR5cGVvZiByZXN1bHQuZGF0YS5kYXRhVXJsID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgY29uc3QgcGVyc2lzdGVkID0gdGhpcy5wZXJzaXN0R2FtZVNjcmVlbnNob3QocmVzdWx0LmRhdGEuZGF0YVVybCwgcmVzdWx0LmRhdGEud2lkdGgsIHJlc3VsdC5kYXRhLmhlaWdodCk7XG4gICAgICAgICAgICBpZiAoIXBlcnNpc3RlZC5vaykge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogcGVyc2lzdGVkLmVycm9yIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICB0eXBlLFxuICAgICAgICAgICAgICAgICAgICBmaWxlUGF0aDogcGVyc2lzdGVkLmZpbGVQYXRoLFxuICAgICAgICAgICAgICAgICAgICBzaXplOiBwZXJzaXN0ZWQuc2l6ZSxcbiAgICAgICAgICAgICAgICAgICAgd2lkdGg6IHJlc3VsdC5kYXRhLndpZHRoLFxuICAgICAgICAgICAgICAgICAgICBoZWlnaHQ6IHJlc3VsdC5kYXRhLmhlaWdodCxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBHYW1lIGNhbnZhcyBjYXB0dXJlZCB0byAke3BlcnNpc3RlZC5maWxlUGF0aH1gLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICAvLyB2Mi45LnggVC1WMjktNTogYnVpbHQtaW4gcmVjb3JkX3N0b3AgcGF0aCDigJQgc2FtZSBwZXJzaXN0ZW5jZVxuICAgICAgICAvLyBwYXR0ZXJuIGFzIHNjcmVlbnNob3QsIGJ1dCB3aXRoIHdlYm0vbXA0IGV4dGVuc2lvbiBhbmQgYVxuICAgICAgICAvLyBzZXBhcmF0ZSBzaXplIGNhcCAocmVjb3JkaW5ncyBjYW4gYmUgbXVjaCBsYXJnZXIgdGhhbiBzdGlsbHMpLlxuICAgICAgICBpZiAodHlwZSA9PT0gJ3JlY29yZF9zdG9wJyAmJiByZXN1bHQuZGF0YSAmJiB0eXBlb2YgcmVzdWx0LmRhdGEuZGF0YVVybCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIGNvbnN0IHBlcnNpc3RlZCA9IHRoaXMucGVyc2lzdEdhbWVSZWNvcmRpbmcocmVzdWx0LmRhdGEuZGF0YVVybCk7XG4gICAgICAgICAgICBpZiAoIXBlcnNpc3RlZC5vaykge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogcGVyc2lzdGVkLmVycm9yIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICB0eXBlLFxuICAgICAgICAgICAgICAgICAgICBmaWxlUGF0aDogcGVyc2lzdGVkLmZpbGVQYXRoLFxuICAgICAgICAgICAgICAgICAgICBzaXplOiBwZXJzaXN0ZWQuc2l6ZSxcbiAgICAgICAgICAgICAgICAgICAgbWltZVR5cGU6IHJlc3VsdC5kYXRhLm1pbWVUeXBlLFxuICAgICAgICAgICAgICAgICAgICBkdXJhdGlvbk1zOiByZXN1bHQuZGF0YS5kdXJhdGlvbk1zLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogYEdhbWUgY2FudmFzIHJlY29yZGluZyBzYXZlZCB0byAke3BlcnNpc3RlZC5maWxlUGF0aH0gKCR7cGVyc2lzdGVkLnNpemV9IGJ5dGVzLCAke3Jlc3VsdC5kYXRhLmR1cmF0aW9uTXN9bXMpYCxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogeyB0eXBlLCAuLi5yZXN1bHQuZGF0YSB9LCBtZXNzYWdlOiBgR2FtZSBjb21tYW5kICR7dHlwZX0gb2tgIH07XG4gICAgfVxuXG4gICAgLy8gdjIuOS54IFQtVjI5LTU6IHRoaW4gd3JhcHBlcnMgYXJvdW5kIGdhbWVfY29tbWFuZCBmb3IgQUkgZXJnb25vbWljcy5cbiAgICAvLyBLZWVwIHRoZSBkaXNwYXRjaCBwYXRoIGlkZW50aWNhbCB0byBnYW1lX2NvbW1hbmQodHlwZT0ncmVjb3JkXyonKSBzb1xuICAgIC8vIHRoZXJlJ3Mgb25seSBvbmUgcGVyc2lzdGVuY2UgcGlwZWxpbmUgYW5kIG9uZSBxdWV1ZS4gQUkgc3RpbGwgcGlja3NcbiAgICAvLyB0aGVzZSB0b29scyBmaXJzdCBiZWNhdXNlIHRoZWlyIHNjaGVtYXMgYXJlIGV4cGxpY2l0LlxuICAgIHByaXZhdGUgYXN5bmMgcmVjb3JkU3RhcnQobWltZVR5cGU/OiBzdHJpbmcsIHZpZGVvQml0c1BlclNlY29uZD86IG51bWJlciwgdGltZW91dE1zOiBudW1iZXIgPSA1MDAwKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgYXJnczogYW55ID0ge307XG4gICAgICAgIGlmIChtaW1lVHlwZSkgYXJncy5taW1lVHlwZSA9IG1pbWVUeXBlO1xuICAgICAgICBpZiAodHlwZW9mIHZpZGVvQml0c1BlclNlY29uZCA9PT0gJ251bWJlcicpIGFyZ3MudmlkZW9CaXRzUGVyU2Vjb25kID0gdmlkZW9CaXRzUGVyU2Vjb25kO1xuICAgICAgICByZXR1cm4gdGhpcy5nYW1lQ29tbWFuZCgncmVjb3JkX3N0YXJ0JywgYXJncywgdGltZW91dE1zKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHJlY29yZFN0b3AodGltZW91dE1zOiBudW1iZXIgPSAzMDAwMCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdhbWVDb21tYW5kKCdyZWNvcmRfc3RvcCcsIHt9LCB0aW1lb3V0TXMpO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2FtZUNsaWVudFN0YXR1cygpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBkYXRhOiBnZXRDbGllbnRTdGF0dXMoKSB9O1xuICAgIH1cblxuICAgIC8vIHYyLjYuMSByZXZpZXcgZml4IChjb2RleCDwn5S0ICsgY2xhdWRlIFcxKTogYm91bmQgdGhlIGxlZ2l0aW1hdGUgcmFuZ2VcbiAgICAvLyBvZiBhIHNjcmVlbnNob3QgcGF5bG9hZCBiZWZvcmUgZGVjb2Rpbmcgc28gYSBtaXNiZWhhdmluZyAvIG1hbGljaW91c1xuICAgIC8vIGNsaWVudCBjYW5ub3QgZmlsbCBkaXNrIGJ5IHN0cmVhbWluZyBhcmJpdHJhcnkgYmFzZTY0IGJ5dGVzLlxuICAgIC8vIDMyIE1CIG1hdGNoZXMgdGhlIGdsb2JhbCByZXF1ZXN0LWJvZHkgY2FwIGluIG1jcC1zZXJ2ZXItc2RrLnRzIHNvXG4gICAgLy8gdGhlIGJvZHkgd291bGQgYWxyZWFkeSA0MTMgYmVmb3JlIHJlYWNoaW5nIGhlcmUsIGJ1dCBhXG4gICAgLy8gYmVsdC1hbmQtYnJhY2VzIGNoZWNrIHN0YXlzIGNoZWFwLlxuICAgIHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IE1BWF9HQU1FX1NDUkVFTlNIT1RfQllURVMgPSAzMiAqIDEwMjQgKiAxMDI0O1xuXG4gICAgcHJpdmF0ZSBwZXJzaXN0R2FtZVNjcmVlbnNob3QoZGF0YVVybDogc3RyaW5nLCBfd2lkdGg/OiBudW1iZXIsIF9oZWlnaHQ/OiBudW1iZXIpOiB7IG9rOiB0cnVlOyBmaWxlUGF0aDogc3RyaW5nOyBzaXplOiBudW1iZXIgfSB8IHsgb2s6IGZhbHNlOyBlcnJvcjogc3RyaW5nIH0ge1xuICAgICAgICBjb25zdCBtID0gL15kYXRhOmltYWdlXFwvKHBuZ3xqcGVnfHdlYnApO2Jhc2U2NCwoLiopJC9pLmV4ZWMoZGF0YVVybCk7XG4gICAgICAgIGlmICghbSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogJ0dhbWVEZWJ1Z0NsaWVudCByZXR1cm5lZCBzY3JlZW5zaG90IGRhdGFVcmwgaW4gdW5leHBlY3RlZCBmb3JtYXQgKGV4cGVjdGVkIGRhdGE6aW1hZ2Uve3BuZ3xqcGVnfHdlYnB9O2Jhc2U2NCwuLi4pJyB9O1xuICAgICAgICB9XG4gICAgICAgIC8vIGJhc2U2NC1kZWNvZGVkIGJ5dGUgY291bnQgPSB+Y2VpbChiNjRMZW4gKiAzIC8gNCk7IHJlamVjdCBlYXJseVxuICAgICAgICAvLyBiZWZvcmUgYWxsb2NhdGluZyBhIG11bHRpLUdCIEJ1ZmZlci5cbiAgICAgICAgY29uc3QgYjY0TGVuID0gbVsyXS5sZW5ndGg7XG4gICAgICAgIGNvbnN0IGFwcHJveEJ5dGVzID0gTWF0aC5jZWlsKGI2NExlbiAqIDMgLyA0KTtcbiAgICAgICAgaWYgKGFwcHJveEJ5dGVzID4gRGVidWdUb29scy5NQVhfR0FNRV9TQ1JFRU5TSE9UX0JZVEVTKSB7XG4gICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBgc2NyZWVuc2hvdCBwYXlsb2FkIHRvbyBsYXJnZTogfiR7YXBwcm94Qnl0ZXN9IGJ5dGVzIGV4Y2VlZHMgY2FwICR7RGVidWdUb29scy5NQVhfR0FNRV9TQ1JFRU5TSE9UX0JZVEVTfWAgfTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBleHQgPSBtWzFdLnRvTG93ZXJDYXNlKCkgPT09ICdqcGVnJyA/ICdqcGcnIDogbVsxXS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICBjb25zdCBidWYgPSBCdWZmZXIuZnJvbShtWzJdLCAnYmFzZTY0Jyk7XG4gICAgICAgIGlmIChidWYubGVuZ3RoID4gRGVidWdUb29scy5NQVhfR0FNRV9TQ1JFRU5TSE9UX0JZVEVTKSB7XG4gICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBgc2NyZWVuc2hvdCBwYXlsb2FkIHRvbyBsYXJnZSBhZnRlciBkZWNvZGU6ICR7YnVmLmxlbmd0aH0gYnl0ZXMgZXhjZWVkcyBjYXAgJHtEZWJ1Z1Rvb2xzLk1BWF9HQU1FX1NDUkVFTlNIT1RfQllURVN9YCB9O1xuICAgICAgICB9XG4gICAgICAgIC8vIHYyLjYuMSByZXZpZXcgZml4IChjbGF1ZGUgTTIgKyBjb2RleCDwn5+hICsgZ2VtaW5pIPCfn6EpOiByZWFscGF0aCBib3RoXG4gICAgICAgIC8vIHNpZGVzIGZvciBhIHRydWUgY29udGFpbm1lbnQgY2hlY2suIHYyLjguMCBULVYyOC0yIGhvaXN0ZWQgdGhpc1xuICAgICAgICAvLyBwYXR0ZXJuIGludG8gcmVzb2x2ZUF1dG9DYXB0dXJlRmlsZSgpIHNvIHNjcmVlbnNob3QoKSAvIGNhcHR1cmUtXG4gICAgICAgIC8vIHByZXZpZXcgLyBiYXRjaC1zY3JlZW5zaG90IC8gcGVyc2lzdC1nYW1lIHNoYXJlIG9uZSBpbXBsZW1lbnRhdGlvbi5cbiAgICAgICAgY29uc3QgcmVzb2x2ZWQgPSB0aGlzLnJlc29sdmVBdXRvQ2FwdHVyZUZpbGUoYGdhbWUtJHtEYXRlLm5vdygpfS4ke2V4dH1gKTtcbiAgICAgICAgaWYgKCFyZXNvbHZlZC5vaykgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogcmVzb2x2ZWQuZXJyb3IgfTtcbiAgICAgICAgZnMud3JpdGVGaWxlU3luYyhyZXNvbHZlZC5maWxlUGF0aCwgYnVmKTtcbiAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUsIGZpbGVQYXRoOiByZXNvbHZlZC5maWxlUGF0aCwgc2l6ZTogYnVmLmxlbmd0aCB9O1xuICAgIH1cblxuICAgIC8vIHYyLjkueCBULVYyOS01OiBzYW1lIHNoYXBlIGFzIHBlcnNpc3RHYW1lU2NyZWVuc2hvdCBidXQgZm9yIHZpZGVvXG4gICAgLy8gcmVjb3JkaW5ncyAod2VibS9tcDQpIHJldHVybmVkIGJ5IHJlY29yZF9zdG9wLiBSZWNvcmRpbmdzIGNhbiBydW5cbiAgICAvLyB0ZW5zIG9mIHNlY29uZHMgYW5kIHByb2R1Y2Ugc2lnbmlmaWNhbnRseSBsYXJnZXIgcGF5bG9hZHMgdGhhblxuICAgIC8vIHN0aWxscy5cbiAgICAvL1xuICAgIC8vIHYyLjkuNSByZXZpZXcgZml4IChHZW1pbmkg8J+foSArIENvZGV4IPCfn6EpOiBidW1wZWQgMzIg4oaSIDY0IE1CIHRvXG4gICAgLy8gYWNjb21tb2RhdGUgaGlnaGVyLWJpdHJhdGUgLyBsb25nZXIgcmVjb3JkaW5ncyAoNS0yMCBNYnBzIMOXIDMwLTYwc1xuICAgIC8vID0gMTgtMTUwIE1CKS4gS2VwdCBpbiBzeW5jIHdpdGggTUFYX1JFUVVFU1RfQk9EWV9CWVRFUyBpblxuICAgIC8vIG1jcC1zZXJ2ZXItc2RrLnRzOyBsb3dlciBvbmUgdG8gZGlhbCBiYWNrIGlmIG1lbW9yeSBwcmVzc3VyZVxuICAgIC8vIGJlY29tZXMgYSBjb25jZXJuLiBiYXNlNjQtZGVjb2RlZCBieXRlIGNvdW50IGlzIHJlamVjdGVkIHByZS1kZWNvZGVcbiAgICAvLyB0byBhdm9pZCBCdWZmZXIgYWxsb2NhdGlvbiBzcGlrZXMgb24gbWFsaWNpb3VzIGNsaWVudHMuXG4gICAgcHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgTUFYX0dBTUVfUkVDT1JESU5HX0JZVEVTID0gNjQgKiAxMDI0ICogMTAyNDtcblxuICAgIHByaXZhdGUgcGVyc2lzdEdhbWVSZWNvcmRpbmcoZGF0YVVybDogc3RyaW5nKTogeyBvazogdHJ1ZTsgZmlsZVBhdGg6IHN0cmluZzsgc2l6ZTogbnVtYmVyIH0gfCB7IG9rOiBmYWxzZTsgZXJyb3I6IHN0cmluZyB9IHtcbiAgICAgICAgLy8gdjIuOS41IHJldmlldyBmaXggYXR0ZW1wdCAxIHVzZWQgYCgoPzo7W14sXSo/KSopYCDigJQgc3RpbGxcbiAgICAgICAgLy8gcmVqZWN0ZWQgYXQgY29kZWMtaW50ZXJuYWwgY29tbWFzIChlLmcuIGBjb2RlY3M9dnA5LG9wdXNgKVxuICAgICAgICAvLyBiZWNhdXNlIHRoZSBwZXItcGFyYW0gYFteLF0qYCBleGNsdWRlcyBjb21tYXMgaW5zaWRlIGFueSBvbmVcbiAgICAgICAgLy8gcGFyYW0ncyB2YWx1ZS4gdjIuOS42IHJvdW5kLTIgZml4IChHZW1pbmkg8J+UtCArIENsYXVkZSDwn5S0ICtcbiAgICAgICAgLy8gQ29kZXgg8J+UtCDigJQgMy1yZXZpZXdlciBjb25zZW5zdXMpOiBzcGxpdCBvbiB0aGUgdW5hbWJpZ3VvdXNcbiAgICAgICAgLy8gYDtiYXNlNjQsYCB0ZXJtaW5hdG9yLCBhY2NlcHQgQU5ZIGNoYXJhY3RlcnMgaW4gdGhlIHBhcmFtZXRlclxuICAgICAgICAvLyBzZWdtZW50LCBhbmQgdmFsaWRhdGUgdGhlIHBheWxvYWQgc2VwYXJhdGVseSBhcyBiYXNlNjRcbiAgICAgICAgLy8gYWxwaGFiZXQgb25seSAoQ29kZXggcjIgc2luZ2xlLfCfn6EgcHJvbW90ZWQpLlxuICAgICAgICAvL1xuICAgICAgICAvLyBVc2UgbGFzdEluZGV4T2YgZm9yIHRoZSBgO2Jhc2U2NCxgIGJvdW5kYXJ5IHNvIGEgcGFyYW0gdmFsdWVcbiAgICAgICAgLy8gdGhhdCBoYXBwZW5zIHRvIGNvbnRhaW4gdGhlIGxpdGVyYWwgc3Vic3RyaW5nIGA7YmFzZTY0LGAgKHZlcnlcbiAgICAgICAgLy8gdW5saWtlbHkgYnV0IGxlZ2FsIGluIE1JTUUgUkZDKSBpcyBzdGlsbCBwYXJzZWQgY29ycmVjdGx5IOKAlFxuICAgICAgICAvLyB0aGUgYWN0dWFsIGJhc2U2NCBhbHdheXMgZW5kcyB0aGUgVVJMLlxuICAgICAgICBjb25zdCBtID0gL15kYXRhOnZpZGVvXFwvKHdlYm18bXA0KShbXl0qPyk7YmFzZTY0LChbQS1aYS16MC05Ky9dKj17MCwyfSkkL2kuZXhlYyhkYXRhVXJsKTtcbiAgICAgICAgaWYgKCFtKSB7XG4gICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiAnR2FtZURlYnVnQ2xpZW50IHJldHVybmVkIHJlY29yZGluZyBkYXRhVXJsIGluIHVuZXhwZWN0ZWQgZm9ybWF0IChleHBlY3RlZCBkYXRhOnZpZGVvL3t3ZWJtfG1wNH1bO2NvZGVjcz0uLi5dO2Jhc2U2NCw8YmFzZTY0PikuIFRoZSBiYXNlNjQgc2VnbWVudCBtdXN0IGJlIGEgdmFsaWQgYmFzZTY0IGFscGhhYmV0IHN0cmluZy4nIH07XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgYjY0TGVuID0gbVszXS5sZW5ndGg7XG4gICAgICAgIGNvbnN0IGFwcHJveEJ5dGVzID0gTWF0aC5jZWlsKGI2NExlbiAqIDMgLyA0KTtcbiAgICAgICAgaWYgKGFwcHJveEJ5dGVzID4gRGVidWdUb29scy5NQVhfR0FNRV9SRUNPUkRJTkdfQllURVMpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGByZWNvcmRpbmcgcGF5bG9hZCB0b28gbGFyZ2U6IH4ke2FwcHJveEJ5dGVzfSBieXRlcyBleGNlZWRzIGNhcCAke0RlYnVnVG9vbHMuTUFYX0dBTUVfUkVDT1JESU5HX0JZVEVTfS4gTG93ZXIgdmlkZW9CaXRzUGVyU2Vjb25kIG9yIHJlZHVjZSByZWNvcmRpbmcgZHVyYXRpb24uYCB9O1xuICAgICAgICB9XG4gICAgICAgIC8vIG1bMV0gaXMgYWxyZWFkeSB0aGUgYmFyZSAnd2VibSd8J21wNCc7IG1bMl0gaXMgdGhlIHBhcmFtIHRhaWxcbiAgICAgICAgLy8gKGA7Y29kZWNzPS4uLmAsIG1heSBpbmNsdWRlIGNvZGVjLWludGVybmFsIGNvbW1hcyk7IG1bM10gaXMgdGhlXG4gICAgICAgIC8vIHZhbGlkYXRlZCBiYXNlNjQgcGF5bG9hZC5cbiAgICAgICAgY29uc3QgZXh0ID0gbVsxXS50b0xvd2VyQ2FzZSgpID09PSAnbXA0JyA/ICdtcDQnIDogJ3dlYm0nO1xuICAgICAgICBjb25zdCBidWYgPSBCdWZmZXIuZnJvbShtWzNdLCAnYmFzZTY0Jyk7XG4gICAgICAgIGlmIChidWYubGVuZ3RoID4gRGVidWdUb29scy5NQVhfR0FNRV9SRUNPUkRJTkdfQllURVMpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGByZWNvcmRpbmcgcGF5bG9hZCB0b28gbGFyZ2UgYWZ0ZXIgZGVjb2RlOiAke2J1Zi5sZW5ndGh9IGJ5dGVzIGV4Y2VlZHMgY2FwICR7RGVidWdUb29scy5NQVhfR0FNRV9SRUNPUkRJTkdfQllURVN9YCB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHJlc29sdmVkID0gdGhpcy5yZXNvbHZlQXV0b0NhcHR1cmVGaWxlKGByZWNvcmRpbmctJHtEYXRlLm5vdygpfS4ke2V4dH1gKTtcbiAgICAgICAgaWYgKCFyZXNvbHZlZC5vaykgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogcmVzb2x2ZWQuZXJyb3IgfTtcbiAgICAgICAgZnMud3JpdGVGaWxlU3luYyhyZXNvbHZlZC5maWxlUGF0aCwgYnVmKTtcbiAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUsIGZpbGVQYXRoOiByZXNvbHZlZC5maWxlUGF0aCwgc2l6ZTogYnVmLmxlbmd0aCB9O1xuICAgIH1cblxuICAgIC8vIHYyLjQuOCBBMTogVFMgZGlhZ25vc3RpY3MgaGFuZGxlcnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gICAgcHJpdmF0ZSBhc3luYyB3YWl0Q29tcGlsZSh0aW1lb3V0TXM6IG51bWJlciA9IDE1MDAwKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHByb2plY3RQYXRoID0gRWRpdG9yPy5Qcm9qZWN0Py5wYXRoO1xuICAgICAgICAgICAgaWYgKCFwcm9qZWN0UGF0aCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ3dhaXRfY29tcGlsZTogZWRpdG9yIGNvbnRleHQgdW5hdmFpbGFibGUgKG5vIEVkaXRvci5Qcm9qZWN0LnBhdGgpJyB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgd2FpdEZvckNvbXBpbGUocHJvamVjdFBhdGgsIHRpbWVvdXRNcyk7XG4gICAgICAgICAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiByZXN1bHQuZXJyb3IgPz8gJ3dhaXRfY29tcGlsZSBmYWlsZWQnLCBkYXRhOiByZXN1bHQgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiByZXN1bHQuY29tcGlsZWRcbiAgICAgICAgICAgICAgICAgICAgPyBgQ29tcGlsZSBmaW5pc2hlZCBpbiAke3Jlc3VsdC53YWl0ZWRNc31tc2BcbiAgICAgICAgICAgICAgICAgICAgOiAocmVzdWx0Lm5vdGUgPz8gJ05vIGNvbXBpbGUgdHJpZ2dlcmVkIG9yIHRpbWVkIG91dCcpLFxuICAgICAgICAgICAgICAgIGRhdGE6IHJlc3VsdCxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKSB9O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBydW5TY3JpcHREaWFnbm9zdGljcyh0c2NvbmZpZ1BhdGg/OiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcHJvamVjdFBhdGggPSBFZGl0b3I/LlByb2plY3Q/LnBhdGg7XG4gICAgICAgICAgICBpZiAoIXByb2plY3RQYXRoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAncnVuX3NjcmlwdF9kaWFnbm9zdGljczogZWRpdG9yIGNvbnRleHQgdW5hdmFpbGFibGUgKG5vIEVkaXRvci5Qcm9qZWN0LnBhdGgpJyB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgcnVuU2NyaXB0RGlhZ25vc3RpY3MocHJvamVjdFBhdGgsIHsgdHNjb25maWdQYXRoIH0pO1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiByZXN1bHQub2ssXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogcmVzdWx0LnN1bW1hcnksXG4gICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICB0b29sOiByZXN1bHQudG9vbCxcbiAgICAgICAgICAgICAgICAgICAgYmluYXJ5OiByZXN1bHQuYmluYXJ5LFxuICAgICAgICAgICAgICAgICAgICB0c2NvbmZpZ1BhdGg6IHJlc3VsdC50c2NvbmZpZ1BhdGgsXG4gICAgICAgICAgICAgICAgICAgIGV4aXRDb2RlOiByZXN1bHQuZXhpdENvZGUsXG4gICAgICAgICAgICAgICAgICAgIGRpYWdub3N0aWNzOiByZXN1bHQuZGlhZ25vc3RpY3MsXG4gICAgICAgICAgICAgICAgICAgIGRpYWdub3N0aWNDb3VudDogcmVzdWx0LmRpYWdub3N0aWNzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgLy8gdjIuNC45IHJldmlldyBmaXg6IHNwYXduIGZhaWx1cmVzIChiaW5hcnkgbWlzc2luZyAvXG4gICAgICAgICAgICAgICAgICAgIC8vIHBlcm1pc3Npb24gZGVuaWVkKSBzdXJmYWNlZCBleHBsaWNpdGx5IHNvIEFJIGNhblxuICAgICAgICAgICAgICAgICAgICAvLyBkaXN0aW5ndWlzaCBcInRzYyBuZXZlciByYW5cIiBmcm9tIFwidHNjIGZvdW5kIGVycm9yc1wiLlxuICAgICAgICAgICAgICAgICAgICBzcGF3bkZhaWxlZDogcmVzdWx0LnNwYXduRmFpbGVkID09PSB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBzeXN0ZW1FcnJvcjogcmVzdWx0LnN5c3RlbUVycm9yLFxuICAgICAgICAgICAgICAgICAgICAvLyBUcnVuY2F0ZSByYXcgc3RyZWFtcyB0byBrZWVwIHRvb2wgcmVzdWx0IHJlYXNvbmFibGU7XG4gICAgICAgICAgICAgICAgICAgIC8vIGZ1bGwgY29udGVudCByYXJlbHkgdXNlZnVsIHdoZW4gdGhlIHBhcnNlciBhbHJlYWR5XG4gICAgICAgICAgICAgICAgICAgIC8vIHN0cnVjdHVyZWQgdGhlIGVycm9ycy5cbiAgICAgICAgICAgICAgICAgICAgc3Rkb3V0VGFpbDogcmVzdWx0LnN0ZG91dC5zbGljZSgtMjAwMCksXG4gICAgICAgICAgICAgICAgICAgIHN0ZGVyclRhaWw6IHJlc3VsdC5zdGRlcnIuc2xpY2UoLTIwMDApLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycikgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2V0U2NyaXB0RGlhZ25vc3RpY0NvbnRleHQoXG4gICAgICAgIGZpbGU6IHN0cmluZyxcbiAgICAgICAgbGluZTogbnVtYmVyLFxuICAgICAgICBjb250ZXh0TGluZXM6IG51bWJlciA9IDUsXG4gICAgKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHByb2plY3RQYXRoID0gRWRpdG9yPy5Qcm9qZWN0Py5wYXRoO1xuICAgICAgICAgICAgaWYgKCFwcm9qZWN0UGF0aCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ2dldF9zY3JpcHRfZGlhZ25vc3RpY19jb250ZXh0OiBlZGl0b3IgY29udGV4dCB1bmF2YWlsYWJsZScgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIHYyLjkueCBwb2xpc2ggKEdlbWluaSByMiBzaW5nbGUt8J+foSBmcm9tIHYyLjguMSByZXZpZXcpOiBjb252ZXJnZVxuICAgICAgICAgICAgLy8gb24gYXNzZXJ0U2F2ZVBhdGhXaXRoaW5Qcm9qZWN0LiBUaGUgcHJldmlvdXMgYmVzcG9rZSByZWFscGF0aFxuICAgICAgICAgICAgLy8gKyB0b0xvd2VyQ2FzZSArIHBhdGguc2VwIGNoZWNrIGlzIGZ1bmN0aW9uYWxseSBzdWJzdW1lZCBieSB0aGVcbiAgICAgICAgICAgIC8vIHNoYXJlZCBoZWxwZXIgKHdoaWNoIGl0c2VsZiBtb3ZlZCB0byB0aGUgcGF0aC5yZWxhdGl2ZS1iYXNlZFxuICAgICAgICAgICAgLy8gaXNQYXRoV2l0aGluUm9vdCBpbiB2Mi45LnggcG9saXNoICMxLCBoYW5kbGluZyBkcml2ZS1yb290IGFuZFxuICAgICAgICAgICAgLy8gcHJlZml4LWNvbGxpc2lvbiBlZGdlcyB1bmlmb3JtbHkpLlxuICAgICAgICAgICAgY29uc3QgZ3VhcmQgPSB0aGlzLmFzc2VydFNhdmVQYXRoV2l0aGluUHJvamVjdChmaWxlKTtcbiAgICAgICAgICAgIGlmICghZ3VhcmQub2spIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBnZXRfc2NyaXB0X2RpYWdub3N0aWNfY29udGV4dDogJHtndWFyZC5lcnJvcn1gIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCByZXNvbHZlZCA9IGd1YXJkLnJlc29sdmVkUGF0aDtcbiAgICAgICAgICAgIGlmICghZnMuZXhpc3RzU3luYyhyZXNvbHZlZCkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBnZXRfc2NyaXB0X2RpYWdub3N0aWNfY29udGV4dDogZmlsZSBub3QgZm91bmQ6ICR7cmVzb2x2ZWR9YCB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3Qgc3RhdCA9IGZzLnN0YXRTeW5jKHJlc29sdmVkKTtcbiAgICAgICAgICAgIGlmIChzdGF0LnNpemUgPiA1ICogMTAyNCAqIDEwMjQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBnZXRfc2NyaXB0X2RpYWdub3N0aWNfY29udGV4dDogZmlsZSB0b28gbGFyZ2UgKCR7c3RhdC5zaXplfSBieXRlcyk7IHJlZnVzaW5nIHRvIHJlYWQuYCB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgY29udGVudCA9IGZzLnJlYWRGaWxlU3luYyhyZXNvbHZlZCwgJ3V0ZjgnKTtcbiAgICAgICAgICAgIGNvbnN0IGFsbExpbmVzID0gY29udGVudC5zcGxpdCgvXFxyP1xcbi8pO1xuICAgICAgICAgICAgaWYgKGxpbmUgPCAxIHx8IGxpbmUgPiBhbGxMaW5lcy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGBnZXRfc2NyaXB0X2RpYWdub3N0aWNfY29udGV4dDogbGluZSAke2xpbmV9IG91dCBvZiByYW5nZSAxLi4ke2FsbExpbmVzLmxlbmd0aH1gLFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBzdGFydCA9IE1hdGgubWF4KDEsIGxpbmUgLSBjb250ZXh0TGluZXMpO1xuICAgICAgICAgICAgY29uc3QgZW5kID0gTWF0aC5taW4oYWxsTGluZXMubGVuZ3RoLCBsaW5lICsgY29udGV4dExpbmVzKTtcbiAgICAgICAgICAgIGNvbnN0IHdpbmRvdyA9IGFsbExpbmVzLnNsaWNlKHN0YXJ0IC0gMSwgZW5kKTtcbiAgICAgICAgICAgIGNvbnN0IHByb2plY3RSZXNvbHZlZE5vcm0gPSBwYXRoLnJlc29sdmUocHJvamVjdFBhdGgpO1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBSZWFkICR7d2luZG93Lmxlbmd0aH0gbGluZXMgb2YgY29udGV4dCBhcm91bmQgJHtwYXRoLnJlbGF0aXZlKHByb2plY3RSZXNvbHZlZE5vcm0sIHJlc29sdmVkKX06JHtsaW5lfWAsXG4gICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICBmaWxlOiBwYXRoLnJlbGF0aXZlKHByb2plY3RSZXNvbHZlZE5vcm0sIHJlc29sdmVkKSxcbiAgICAgICAgICAgICAgICAgICAgYWJzb2x1dGVQYXRoOiByZXNvbHZlZCxcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0TGluZTogbGluZSxcbiAgICAgICAgICAgICAgICAgICAgc3RhcnRMaW5lOiBzdGFydCxcbiAgICAgICAgICAgICAgICAgICAgZW5kTGluZTogZW5kLFxuICAgICAgICAgICAgICAgICAgICB0b3RhbExpbmVzOiBhbGxMaW5lcy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgIGxpbmVzOiB3aW5kb3cubWFwKCh0ZXh0LCBpKSA9PiAoeyBsaW5lOiBzdGFydCArIGksIHRleHQgfSkpLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycikgfTtcbiAgICAgICAgfVxuICAgIH1cbn1cbiJdfQ==