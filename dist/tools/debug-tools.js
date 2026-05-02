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
                title: 'Clear console',
                description: 'Clear the Cocos Editor Console UI. No project side effects.',
                inputSchema: schema_1.z.object({}),
                handler: () => this.clearConsole(),
            },
            {
                name: 'execute_javascript',
                title: 'Execute JavaScript',
                description: '[primary] Execute JavaScript in scene or editor context. Use this as the default first tool for compound operations (read → mutate → verify) — one call replaces 5-10 narrow specialist tools and avoids per-call token overhead. context="scene" inspects/mutates cc.Node graph; context="editor" runs in host process for Editor.Message + fs (default off, opt-in).',
                inputSchema: schema_1.z.object({
                    code: schema_1.z.string().describe('JavaScript source to execute. Has access to cc.* in scene context, Editor.* in editor context.'),
                    context: schema_1.z.enum(['scene', 'editor']).default('scene').describe('Execution sandbox. "scene" runs inside the cocos scene script context (cc, director, find). "editor" runs in the editor host process (Editor, asset-db, fs, require). Editor context is OFF by default and must be opt-in via panel setting `enableEditorContextEval` — arbitrary code in the host process is a prompt-injection risk.'),
                }),
                handler: a => { var _a; return this.executeJavaScript(a.code, (_a = a.context) !== null && _a !== void 0 ? _a : 'scene'); },
            },
            {
                name: 'execute_script',
                title: 'Run scene JavaScript',
                description: '[compat] Scene-only JavaScript eval. Prefer execute_javascript with context="scene" — kept as compatibility entrypoint for older clients.',
                inputSchema: schema_1.z.object({
                    script: schema_1.z.string().describe('JavaScript to execute in scene context via console/eval. Can read or mutate the current scene.'),
                }),
                handler: a => this.executeScriptCompat(a.script),
            },
            {
                name: 'get_node_tree',
                title: 'Read debug node tree',
                description: 'Read a debug node tree from a root or scene root for hierarchy/component inspection.',
                inputSchema: schema_1.z.object({
                    rootUuid: schema_1.z.string().optional().describe('Root node UUID to expand. Omit to use the current scene root.'),
                    maxDepth: schema_1.z.number().default(10).describe('Maximum tree depth. Default 10; large values can return a lot of data.'),
                }),
                handler: a => this.getNodeTree(a.rootUuid, a.maxDepth),
            },
            {
                name: 'get_performance_stats',
                title: 'Read performance stats',
                description: 'Try to read scene query-performance stats; may return unavailable in edit mode.',
                inputSchema: schema_1.z.object({}),
                handler: () => this.getPerformanceStats(),
            },
            {
                name: 'validate_scene',
                title: 'Validate current scene',
                description: 'Run basic current-scene health checks for missing assets and node-count warnings.',
                inputSchema: schema_1.z.object({
                    checkMissingAssets: schema_1.z.boolean().default(true).describe('Check missing asset references when the Cocos scene API supports it.'),
                    checkPerformance: schema_1.z.boolean().default(true).describe('Run basic performance checks such as high node count warnings.'),
                }),
                handler: a => this.validateScene({ checkMissingAssets: a.checkMissingAssets, checkPerformance: a.checkPerformance }),
            },
            {
                name: 'get_editor_info',
                title: 'Read editor info',
                description: 'Read Editor/Cocos/project/process information and memory summary.',
                inputSchema: schema_1.z.object({}),
                handler: () => this.getEditorInfo(),
            },
            {
                name: 'get_project_logs',
                title: 'Read project logs',
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
                title: 'Read log file info',
                description: 'Read temp/logs/project.log path, size, line count, and timestamps.',
                inputSchema: schema_1.z.object({}),
                handler: () => this.getLogFileInfo(),
            },
            {
                name: 'search_project_logs',
                title: 'Search project logs',
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
                title: 'Capture editor screenshot',
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
                title: 'Capture preview screenshot',
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
                title: 'Read preview mode',
                description: 'Read the cocos preview configuration. Uses Editor.Message preferences/query-config so AI can route debug_capture_preview_screenshot to the correct mode. Returns { interpreted: "browser" | "window" | "simulator" | "embedded" | "unknown", raw: <full preview config dump> }. Use before capture: if interpreted="embedded", call capture_preview_screenshot with mode="embedded" or rely on mode="auto" fallback.',
                inputSchema: schema_1.z.object({}),
                handler: () => this.getPreviewMode(),
            },
            {
                name: 'set_preview_mode',
                title: 'Set preview mode',
                description: '❌ NOT SUPPORTED on cocos 3.8.7+ (landmine #17). Programmatic preview-mode switching is impossible from a third-party extension on cocos 3.8.7: `preferences/set-config` against `preview.current.platform` returns truthy but never persists, and **none of 6 surveyed reference projects (harady / Spaydo / RomaRogov / cocos-code-mode / FunplayAI / cocos-cli) ship a working alternative** (v2.10 cross-repo refresh, 2026-05-02). The field is effectively read-only — only the cocos preview dropdown writes it. **Use the cocos preview dropdown in the editor toolbar to switch modes**. Default behavior is hard-fail; pass attemptAnyway=true ONLY for diagnostic probing (returns 4-strategy attempt log so you can verify against a future cocos build whether any shape now works).',
                inputSchema: schema_1.z.object({
                    mode: schema_1.z.enum(['browser', 'gameView', 'simulator']).describe('Target preview platform. "browser" opens preview in the user default browser. "gameView" embeds the gameview in the main editor (in-editor preview). "simulator" launches the cocos simulator. Maps directly to the cocos preview.current.platform value.'),
                    attemptAnyway: schema_1.z.boolean().default(false).describe('Diagnostic opt-in. Default false returns NOT_SUPPORTED with the cocos UI redirect. Set true ONLY to re-probe the 4 set-config shapes against a new cocos build — useful when validating whether a future cocos version exposes a write path. Returns data.attempts with every shape tried and its read-back observation. Does NOT freeze the editor (the call merely no-ops).'),
                }),
                handler: a => { var _a; return this.setPreviewMode(a.mode, (_a = a.attemptAnyway) !== null && _a !== void 0 ? _a : false); },
            },
            {
                name: 'batch_screenshot',
                title: 'Capture batch screenshots',
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
                title: 'Wait for compile',
                description: 'Block until cocos finishes its TypeScript compile pass. Tails temp/programming/packer-driver/logs/debug.log for the "Target(editor) ends" marker. Returns immediately with compiled=false if no compile was triggered (clean project / no changes detected). Pair with run_script_diagnostics for an "edit .ts → wait → fetch errors" workflow.',
                inputSchema: schema_1.z.object({
                    timeoutMs: schema_1.z.number().min(500).max(120000).default(15000).describe('Max wait time in ms before giving up. Default 15000.'),
                }),
                handler: a => this.waitCompile(a.timeoutMs),
            },
            {
                name: 'run_script_diagnostics',
                title: 'Run script diagnostics',
                description: 'Run `tsc --noEmit` against the project tsconfig and return parsed diagnostics. Used after wait_compile to surface compilation errors as structured {file, line, column, code, message} entries. Resolves tsc binary from project node_modules → editor bundled engine → npx fallback.',
                inputSchema: schema_1.z.object({
                    tsconfigPath: schema_1.z.string().optional().describe('Optional override (absolute or project-relative). Default: tsconfig.json or temp/tsconfig.cocos.json.'),
                }),
                handler: a => this.runScriptDiagnostics(a.tsconfigPath),
            },
            {
                name: 'preview_url',
                title: 'Resolve preview URL',
                description: 'Resolve the cocos browser-preview URL. Uses the documented Editor.Message channel preview/query-preview-url. With action="open", also launches the URL in the user default browser via electron.shell.openExternal — useful as a setup step before debug_game_command, since the GameDebugClient running inside the preview must be reachable. Editor-side Preview-in-Editor play/stop is NOT exposed by the public message API and is intentionally not implemented here; use the cocos editor toolbar manually for PIE.',
                inputSchema: schema_1.z.object({
                    action: schema_1.z.enum(['query', 'open']).default('query').describe('"query" returns the URL; "open" returns the URL AND opens it in the user default browser via electron.shell.openExternal.'),
                }),
                handler: a => this.previewUrl(a.action),
            },
            {
                name: 'query_devices',
                title: 'List preview devices',
                description: 'List preview devices configured in the cocos project. Backed by Editor.Message channel device/query. Returns an array of {name, width, height, ratio} entries — useful for batch-screenshot pipelines that target multiple resolutions.',
                inputSchema: schema_1.z.object({}),
                handler: () => this.queryDevices(),
            },
            {
                name: 'game_command',
                title: 'Send game command',
                description: 'Send a runtime command to a connected GameDebugClient. Works inside a cocos preview/build (browser, Preview-in-Editor, or any device that fetches /game/command). Built-in command types: "screenshot" (capture game canvas to PNG, returns saved file path), "click" (emit Button.CLICK on a node by name), "inspect" (dump runtime node info: position/scale/rotation/contentSize/active/components by name). Custom command types are forwarded to the client\'s customCommands map (e.g. "state", "navigate"). Requires the GameDebugClient template (client/cocos-mcp-client.ts) wired into the running game; without it the call times out. Check GET /game/status to verify client liveness first.',
                inputSchema: schema_1.z.object({
                    type: schema_1.z.string().min(1).describe('Command type. Built-ins: screenshot, click, inspect. Customs: any string the GameDebugClient registered in customCommands.'),
                    args: schema_1.z.any().optional().describe('Command-specific arguments. For "click"/"inspect": {name: string} node name. For "screenshot": {} (no args).'),
                    timeoutMs: schema_1.z.number().min(500).max(60000).default(10000).describe('Max wait for client response. Default 10000ms.'),
                }),
                handler: a => this.gameCommand(a.type, a.args, a.timeoutMs),
            },
            {
                name: 'record_start',
                title: 'Start game recording',
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
                title: 'Stop game recording',
                description: 'Stop the in-progress game canvas recording and persist it under <project>/temp/mcp-captures. Wraps debug_game_command(type="record_stop"). Returns { filePath, size, mimeType, durationMs }. Calling without a prior record_start returns success:false. The host applies the same realpath containment guard + 64MB byte cap (synced with the request body cap in mcp-server-sdk.ts; v2.9.6 raised both from 32 to 64MB); raise videoBitsPerSecond / reduce recording duration on cap rejection.',
                inputSchema: schema_1.z.object({
                    timeoutMs: schema_1.z.number().min(1000).max(120000).default(30000).describe('Max wait for the client to assemble + return the recording blob. Recordings of several seconds at high bitrate may need longer than the default 30s — raise on long recordings.'),
                }),
                handler: a => { var _a; return this.recordStop((_a = a.timeoutMs) !== null && _a !== void 0 ? _a : 30000); },
            },
            {
                name: 'game_client_status',
                title: 'Read game client status',
                description: 'Read GameDebugClient connection status. Includes connected (polled within 2s), last poll timestamp, and whether a command is queued. Use before debug_game_command to confirm the client is reachable.',
                inputSchema: schema_1.z.object({}),
                handler: () => this.gameClientStatus(),
            },
            {
                name: 'check_editor_health',
                title: 'Check editor health',
                description: 'Probe whether the cocos editor scene-script renderer is responsive. Useful after debug_preview_control(start) — landmine #16 documents that cocos 3.8.7 sometimes freezes the scene-script renderer (spinning indicator, Ctrl+R required). Strategy (v2.9.6): three probes — (1) host: device/query (main process, always responsive even when scene-script is wedged); (2) scene/query-is-ready typed channel — direct IPC into the scene module, hangs when scene renderer is frozen; (3) scene/query-node-tree typed channel — returns the full scene tree, forces an actual scene-graph walk through the wedged code path. Each probe has its own timeout race (default 1500ms each). Scene declared alive only when BOTH (2) returns true AND (3) returns a non-null tree within the timeout. Returns { hostAlive, sceneAlive, sceneLatencyMs, hostError, sceneError, totalProbeMs }. AI workflow: call after preview_control(start); if sceneAlive=false, surface "cocos editor likely frozen — press Ctrl+R" instead of issuing more scene-bound calls.',
                inputSchema: schema_1.z.object({
                    sceneTimeoutMs: schema_1.z.number().min(200).max(10000).default(1500).describe('Timeout for the scene-script probe in ms. Below this scene is considered frozen. Default 1500ms.'),
                }),
                handler: a => { var _a; return this.checkEditorHealth((_a = a.sceneTimeoutMs) !== null && _a !== void 0 ? _a : 1500); },
            },
            {
                name: 'preview_control',
                title: 'Control preview playback',
                description: '⚠ PARKED — start FREEZES cocos 3.8.7 (landmine #16). Programmatically start or stop Preview-in-Editor (PIE) play mode. Wraps the typed cce.SceneFacadeManager.changePreviewPlayState method. **start hits a cocos 3.8.7 softReloadScene race** that returns success but freezes the editor (spinning indicator, Ctrl+R required to recover). Verified in both embedded and browser preview modes. v2.10 cross-repo refresh confirmed: none of 6 surveyed peers (harady / Spaydo / RomaRogov / cocos-code-mode / FunplayAI / cocos-cli) ship a safer call path — harady and cocos-code-mode use the `Editor.Message scene/editor-preview-set-play` channel and hit the same race. **stop is safe** and reliable. To prevent accidental triggering, start requires explicit `acknowledgeFreezeRisk: true`. **Strongly preferred alternatives instead of start**: (a) debug_capture_preview_screenshot(mode="embedded") in EDIT mode — no PIE needed; (b) debug_game_command(type="screenshot") via GameDebugClient on browser preview launched via debug_preview_url(action="open").',
                inputSchema: schema_1.z.object({
                    op: schema_1.z.enum(['start', 'stop']).describe('"start" enters PIE play mode (equivalent to clicking the toolbar play button) — REQUIRES acknowledgeFreezeRisk=true on cocos 3.8.7 due to landmine #16. "stop" exits PIE play and returns to scene mode (always safe).'),
                    acknowledgeFreezeRisk: schema_1.z.boolean().default(false).describe('Required to be true for op="start" on cocos 3.8.7 due to landmine #16 (softReloadScene race that freezes the editor). Set true ONLY when the human user has explicitly accepted the risk and is prepared to press Ctrl+R if the editor freezes. Ignored for op="stop" which is reliable.'),
                }),
                handler: a => { var _a; return this.previewControl(a.op, (_a = a.acknowledgeFreezeRisk) !== null && _a !== void 0 ? _a : false); },
            },
            {
                name: 'get_script_diagnostic_context',
                title: 'Read diagnostic context',
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
    async setPreviewMode(mode, attemptAnyway) {
        var _a, _b;
        try {
            const queryCurrent = async () => {
                var _a, _b, _c;
                const cfg = await Editor.Message.request('preferences', 'query-config', 'preview');
                return (_c = (_b = (_a = cfg === null || cfg === void 0 ? void 0 : cfg.preview) === null || _a === void 0 ? void 0 : _a.current) === null || _b === void 0 ? void 0 : _b.platform) !== null && _c !== void 0 ? _c : null;
            };
            const previousMode = await queryCurrent();
            if (!attemptAnyway) {
                return {
                    success: false,
                    error: `debug_set_preview_mode is NOT SUPPORTED on cocos 3.8.7+ (landmine #17). Programmatic preview-mode switching has no working IPC path: preferences/set-config returns truthy but does not persist, and 6 surveyed reference projects (harady / Spaydo / RomaRogov / cocos-code-mode / FunplayAI / cocos-cli) all confirm no working alternative exists. **Switch via the cocos preview dropdown in the editor toolbar instead** (current mode: "${previousMode !== null && previousMode !== void 0 ? previousMode : 'unknown'}", requested: "${mode}"). To re-probe whether a newer cocos build now exposes a write path, re-call with attemptAnyway=true (diagnostic only — does NOT freeze the editor).`,
                    data: { previousMode, requestedMode: mode, supported: false },
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
                error: 'debug_preview_control(op="start") is parked due to landmine #16 — the cocos 3.8.7 softReloadScene race freezes the editor regardless of preview mode (verified embedded + browser). v2.10 cross-repo refresh confirmed no reference project ships a safer path — harady and cocos-code-mode use the same channel family and hit the same race. **Strongly preferred alternatives** (please use these instead): (a) debug_capture_preview_screenshot(mode="embedded") in EDIT mode (no PIE needed); (b) debug_game_command(type="screenshot") via GameDebugClient on browser preview launched via debug_preview_url(action="open"). Only re-call with acknowledgeFreezeRisk=true if neither alternative fits AND the human user is prepared to press Ctrl+R in cocos if the editor freezes.',
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWctdG9vbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvdG9vbHMvZGVidWctdG9vbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUEsd0RBQWtFO0FBQ2xFLDBDQUFrQztBQUNsQyxzREFBMkQ7QUFDM0QsMERBQTZFO0FBQzdFLGtFQUFrRztBQUNsRyxzREFBbUU7QUFDbkUsdUNBQXlCO0FBQ3pCLDJDQUE2QjtBQUU3QixrRUFBa0U7QUFDbEUsd0VBQXdFO0FBQ3hFLHlFQUF5RTtBQUN6RSxrRUFBa0U7QUFDbEUsaUNBQWlDO0FBQ2pDLEVBQUU7QUFDRixrRUFBa0U7QUFDbEUsbUVBQW1FO0FBQ25FLDZEQUE2RDtBQUM3RCxrRUFBa0U7QUFDbEUscUVBQXFFO0FBQ3JFLHNFQUFzRTtBQUN0RSxtRUFBbUU7QUFDbkUsOERBQThEO0FBQzlELG1FQUFtRTtBQUNuRSw4REFBOEQ7QUFDOUQsNENBQTRDO0FBQzVDLFNBQVMsZ0JBQWdCLENBQUMsU0FBaUIsRUFBRSxJQUFZO0lBQ3JELE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDeEMsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNuQyxJQUFJLE9BQU8sS0FBSyxPQUFPO1FBQUUsT0FBTyxJQUFJLENBQUM7SUFDckMsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFDNUMsSUFBSSxDQUFDLEdBQUc7UUFBRSxPQUFPLElBQUksQ0FBQyxDQUE4QixZQUFZO0lBQ2hFLHFFQUFxRTtJQUNyRSxrRUFBa0U7SUFDbEUsb0VBQW9FO0lBQ3BFLDZDQUE2QztJQUM3QyxJQUFJLEdBQUcsS0FBSyxJQUFJLElBQUksR0FBRyxDQUFDLFVBQVUsQ0FBQyxJ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QUFHLEVBQUUsR0FBRyxJQUFJLEdBQUcsSUFBSSxDQUFDO0FBNkJyRSxvRUFBb0U7QUFDcEUsb0VBQW9FO0FBQ3BFLGlFQUFpRTtBQUNqRSxVQUFVO0FBQ1YsRUFBRTtBQUNGLGlFQUFpRTtBQUNqRSxxRUFBcUU7QUFDckUsNERBQTREO0FBQzVELCtEQUErRDtBQUMvRCxzRUFBc0U7QUFDdEUsMERBQTBEO0FBQ2xDLG1DQUF3QixHQUFHLEVBQUUsR0FBRyxJQUFJLEdBQUcsSUFBSSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgVG9vbERlZmluaXRpb24sIFRvb2xSZXNwb25zZSwgVG9vbEV4ZWN1dG9yLCBQZXJmb3JtYW5jZVN0YXRzLCBWYWxpZGF0aW9uUmVzdWx0LCBWYWxpZGF0aW9uSXNzdWUgfSBmcm9tICcuLi90eXBlcyc7XG5pbXBvcnQgeyBkZWJ1Z0xvZyB9IGZyb20gJy4uL2xpYi9sb2cnO1xuaW1wb3J0IHsgaXNFZGl0b3JDb250ZXh0RXZhbEVuYWJsZWQgfSBmcm9tICcuLi9saWIvcnVudGltZS1mbGFncyc7XG5pbXBvcnQgeyB6IH0gZnJvbSAnLi4vbGliL3NjaGVtYSc7XG5pbXBvcnQgeyBkZWZpbmVUb29scywgVG9vbERlZiB9IGZyb20gJy4uL2xpYi9kZWZpbmUtdG9vbHMnO1xuaW1wb3J0IHsgcnVuU2NyaXB0RGlhZ25vc3RpY3MsIHdhaXRGb3JDb21waWxlIH0gZnJvbSAnLi4vbGliL3RzLWRpYWdub3N0aWNzJztcbmltcG9ydCB7IHF1ZXVlR2FtZUNvbW1hbmQsIGF3YWl0Q29tbWFuZFJlc3VsdCwgZ2V0Q2xpZW50U3RhdHVzIH0gZnJvbSAnLi4vbGliL2dhbWUtY29tbWFuZC1xdWV1ZSc7XG5pbXBvcnQgeyBydW5TY2VuZU1ldGhvZEFzVG9vbFJlc3BvbnNlIH0gZnJvbSAnLi4vbGliL3NjZW5lLWJyaWRnZSc7XG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuXG4vLyB2Mi45LnggcG9saXNoOiBjb250YWlubWVudCBoZWxwZXIgdGhhdCBoYW5kbGVzIGRyaXZlLXJvb3QgZWRnZXNcbi8vIChDOlxcKSwgcHJlZml4LWNvbGxpc2lvbiAoQzpcXGZvbyB2cyBDOlxcZm9vYmFyKSwgYW5kIGNyb3NzLXZvbHVtZSBwYXRoc1xuLy8gKEQ6XFwuLi4gd2hlbiByb290IGlzIEM6XFwpLiBVc2VzIHBhdGgucmVsYXRpdmUgd2hpY2ggcmV0dXJucyBhIHJlbGF0aXZlXG4vLyBleHByZXNzaW9uIOKAlCBpZiB0aGUgcmVzdWx0IHN0YXJ0cyB3aXRoIGAuLmAgb3IgaXMgYWJzb2x1dGUsIHRoZVxuLy8gY2FuZGlkYXRlIGlzIG91dHNpZGUgdGhlIHJvb3QuXG4vL1xuLy8gVE9DVE9VIG5vdGUgKENvZGV4IHIxICsgR2VtaW5pIHIxIHNpbmdsZS3wn5+hIGZyb20gdjIuOC4xIHJldmlldyxcbi8vIHJldmlld2VkIHYyLjkueCBhbmQgYWNjZXB0ZWQgYXMgcmVzaWR1YWwgcmlzayk6IHRoZXJlIGlzIGEgc21hbGxcbi8vIHJhY2Ugd2luZG93IGJldHdlZW4gcmVhbHBhdGhTeW5jIGNvbnRhaW5tZW50IGNoZWNrIGFuZCB0aGVcbi8vIHN1YnNlcXVlbnQgd3JpdGVGaWxlU3luYyDigJQgYSBtYWxpY2lvdXMgc3ltbGluayBzd2FwIGR1cmluZyB0aGF0XG4vLyB3aW5kb3cgY291bGQgZXNjYXBlLiBGdWxsIG1pdGlnYXRpb24gbmVlZHMgT19OT0ZPTExPVyB3aGljaCBOb2RlJ3Ncbi8vIGZzIEFQSSBkb2Vzbid0IGV4cG9zZSBkaXJlY3RseS4gR2l2ZW4gdGhpcyBpcyBhIGxvY2FsIGRldiB0b29sLCBub3Rcbi8vIGEgbmV0d29yay1mYWNpbmcgc2VydmljZSwgYW5kIHRoZSBhdHRhY2sgd2luZG93IGlzIG1pY3Jvc2Vjb25kcyxcbi8vIHRoZSByaXNrIGlzIGFjY2VwdGVkIGZvciBub3cuIEEgZnV0dXJlIHYyLnggcGF0Y2ggY291bGQgYWRkXG4vLyBgZnMub3BlblN5bmMoZmlsZVBhdGgsICd3eCcpYCBmb3IgQVVUTy1uYW1lZCBwYXRocyBvbmx5IChjYWxsZXItXG4vLyBwcm92aWRlZCBzYXZlUGF0aCBuZWVkcyBvdmVyd3JpdGUgc2VtYW50aWNzKS4gRG9uJ3QgcmVseSBvblxuLy8gY29udGFpbm1lbnQgZm9yIHNlY3VyaXR5LWNyaXRpY2FsIHdyaXRlcy5cbmZ1bmN0aW9uIGlzUGF0aFdpdGhpblJvb3QoY2FuZGlkYXRlOiBzdHJpbmcsIHJvb3Q6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgIGNvbnN0IGNhbmRBYnMgPSBwYXRoLnJlc29sdmUoY2FuZGlkYXRlKTtcbiAgICBjb25zdCByb290QWJzID0gcGF0aC5yZXNvbHZlKHJvb3QpO1xuICAgIGlmIChjYW5kQWJzID09PSByb290QWJzKSByZXR1cm4gdHJ1ZTtcbiAgICBjb25zdCByZWwgPSBwYXRoLnJlbGF0aXZlKHJvb3RBYnMsIGNhbmRBYnMpO1xuICAgIGlmICghcmVsKSByZXR1cm4gdHJ1ZTsgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBpZGVudGljYWxcbiAgICAvLyB2Mi45LjUgcmV2aWV3IGZpeCAoQ29kZXgg8J+foSk6IHN0YXJ0c1dpdGgoJy4uJykgd291bGQgYWxzbyByZWplY3QgYVxuICAgIC8vIGxlZ2l0aW1hdGUgY2hpbGQgd2hvc2UgZmlyc3QgcGF0aCBzZWdtZW50IGxpdGVyYWxseSBzdGFydHMgd2l0aFxuICAgIC8vIFwiLi5cIiAoZS5nLiBkaXJlY3RvcnkgbmFtZWQgXCIuLmZvb1wiKS4gTWF0Y2ggZWl0aGVyIGV4YWN0bHkgYC4uYCBvclxuICAgIC8vIGAuLmAgZm9sbG93ZWQgYnkgYSBwYXRoIHNlcGFyYXRvciBpbnN0ZWFkLlxuICAgIGlmIChyZWwgPT09ICcuLicgfHwgcmVsLnN0YXJ0c1dpdGgoJy4uJyArIHBhdGguc2VwKSkgcmV0dXJuIGZhbHNlO1xuICAgIGlmIChwYXRoLmlzQWJzb2x1dGUocmVsKSkgcmV0dXJuIGZhbHNlOyAgICAgICAgICAgICAvLyBkaWZmZXJlbnQgZHJpdmVcbiAgICByZXR1cm4gdHJ1ZTtcbn1cblxuZXhwb3J0IGNsYXNzIERlYnVnVG9vbHMgaW1wbGVtZW50cyBUb29sRXhlY3V0b3Ige1xuICAgIHByaXZhdGUgcmVhZG9ubHkgZXhlYzogVG9vbEV4ZWN1dG9yO1xuXG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIGNvbnN0IGRlZnM6IFRvb2xEZWZbXSA9IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnY2xlYXJfY29uc29sZScsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdDbGVhciBjb25zb2xlJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ0NsZWFyIHRoZSBDb2NvcyBFZGl0b3IgQ29uc29sZSBVSS4gTm8gcHJvamVjdCBzaWRlIGVmZmVjdHMuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6ICgpID0+IHRoaXMuY2xlYXJDb25zb2xlKCksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdleGVjdXRlX2phdmFzY3JpcHQnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnRXhlY3V0ZSBKYXZhU2NyaXB0JyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1twcmltYXJ5XSBFeGVjdXRlIEphdmFTY3JpcHQgaW4gc2NlbmUgb3IgZWRpdG9yIGNvbnRleHQuIFVzZSB0aGlzIGFzIHRoZSBkZWZhdWx0IGZpcnN0IHRvb2wgZm9yIGNvbXBvdW5kIG9wZXJhdGlvbnMgKHJlYWQg4oaSIG11dGF0ZSDihpIgdmVyaWZ5KSDigJQgb25lIGNhbGwgcmVwbGFjZXMgNS0xMCBuYXJyb3cgc3BlY2lhbGlzdCB0b29scyBhbmQgYXZvaWRzIHBlci1jYWxsIHRva2VuIG92ZXJoZWFkLiBjb250ZXh0PVwic2NlbmVcIiBpbnNwZWN0cy9tdXRhdGVzIGNjLk5vZGUgZ3JhcGg7IGNvbnRleHQ9XCJlZGl0b3JcIiBydW5zIGluIGhvc3QgcHJvY2VzcyBmb3IgRWRpdG9yLk1lc3NhZ2UgKyBmcyAoZGVmYXVsdCBvZmYsIG9wdC1pbikuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBjb2RlOiB6LnN0cmluZygpLmRlc2NyaWJlKCdKYXZhU2NyaXB0IHNvdXJjZSB0byBleGVjdXRlLiBIYXMgYWNjZXNzIHRvIGNjLiogaW4gc2NlbmUgY29udGV4dCwgRWRpdG9yLiogaW4gZWRpdG9yIGNvbnRleHQuJyksXG4gICAgICAgICAgICAgICAgICAgIGNvbnRleHQ6IHouZW51bShbJ3NjZW5lJywgJ2VkaXRvciddKS5kZWZhdWx0KCdzY2VuZScpLmRlc2NyaWJlKCdFeGVjdXRpb24gc2FuZGJveC4gXCJzY2VuZVwiIHJ1bnMgaW5zaWRlIHRoZSBjb2NvcyBzY2VuZSBzY3JpcHQgY29udGV4dCAoY2MsIGRpcmVjdG9yLCBmaW5kKS4gXCJlZGl0b3JcIiBydW5zIGluIHRoZSBlZGl0b3IgaG9zdCBwcm9jZXNzIChFZGl0b3IsIGFzc2V0LWRiLCBmcywgcmVxdWlyZSkuIEVkaXRvciBjb250ZXh0IGlzIE9GRiBieSBkZWZhdWx0IGFuZCBtdXN0IGJlIG9wdC1pbiB2aWEgcGFuZWwgc2V0dGluZyBgZW5hYmxlRWRpdG9yQ29udGV4dEV2YWxgIOKAlCBhcmJpdHJhcnkgY29kZSBpbiB0aGUgaG9zdCBwcm9jZXNzIGlzIGEgcHJvbXB0LWluamVjdGlvbiByaXNrLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy5leGVjdXRlSmF2YVNjcmlwdChhLmNvZGUsIGEuY29udGV4dCA/PyAnc2NlbmUnKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2V4ZWN1dGVfc2NyaXB0JyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1J1biBzY2VuZSBKYXZhU2NyaXB0JyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1tjb21wYXRdIFNjZW5lLW9ubHkgSmF2YVNjcmlwdCBldmFsLiBQcmVmZXIgZXhlY3V0ZV9qYXZhc2NyaXB0IHdpdGggY29udGV4dD1cInNjZW5lXCIg4oCUIGtlcHQgYXMgY29tcGF0aWJpbGl0eSBlbnRyeXBvaW50IGZvciBvbGRlciBjbGllbnRzLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgc2NyaXB0OiB6LnN0cmluZygpLmRlc2NyaWJlKCdKYXZhU2NyaXB0IHRvIGV4ZWN1dGUgaW4gc2NlbmUgY29udGV4dCB2aWEgY29uc29sZS9ldmFsLiBDYW4gcmVhZCBvciBtdXRhdGUgdGhlIGN1cnJlbnQgc2NlbmUuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLmV4ZWN1dGVTY3JpcHRDb21wYXQoYS5zY3JpcHQpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnZ2V0X25vZGVfdHJlZScsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdSZWFkIGRlYnVnIG5vZGUgdHJlZScsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdSZWFkIGEgZGVidWcgbm9kZSB0cmVlIGZyb20gYSByb290IG9yIHNjZW5lIHJvb3QgZm9yIGhpZXJhcmNoeS9jb21wb25lbnQgaW5zcGVjdGlvbi4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHJvb3RVdWlkOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1Jvb3Qgbm9kZSBVVUlEIHRvIGV4cGFuZC4gT21pdCB0byB1c2UgdGhlIGN1cnJlbnQgc2NlbmUgcm9vdC4nKSxcbiAgICAgICAgICAgICAgICAgICAgbWF4RGVwdGg6IHoubnVtYmVyKCkuZGVmYXVsdCgxMCkuZGVzY3JpYmUoJ01heGltdW0gdHJlZSBkZXB0aC4gRGVmYXVsdCAxMDsgbGFyZ2UgdmFsdWVzIGNhbiByZXR1cm4gYSBsb3Qgb2YgZGF0YS4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMuZ2V0Tm9kZVRyZWUoYS5yb290VXVpZCwgYS5tYXhEZXB0aCksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdnZXRfcGVyZm9ybWFuY2Vfc3RhdHMnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnUmVhZCBwZXJmb3JtYW5jZSBzdGF0cycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdUcnkgdG8gcmVhZCBzY2VuZSBxdWVyeS1wZXJmb3JtYW5jZSBzdGF0czsgbWF5IHJldHVybiB1bmF2YWlsYWJsZSBpbiBlZGl0IG1vZGUuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6ICgpID0+IHRoaXMuZ2V0UGVyZm9ybWFuY2VTdGF0cygpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAndmFsaWRhdGVfc2NlbmUnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnVmFsaWRhdGUgY3VycmVudCBzY2VuZScsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdSdW4gYmFzaWMgY3VycmVudC1zY2VuZSBoZWFsdGggY2hlY2tzIGZvciBtaXNzaW5nIGFzc2V0cyBhbmQgbm9kZS1jb3VudCB3YXJuaW5ncy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIGNoZWNrTWlzc2luZ0Fzc2V0czogei5ib29sZWFuKCkuZGVmYXVsdCh0cnVlKS5kZXNjcmliZSgnQ2hlY2sgbWlzc2luZyBhc3NldCByZWZlcmVuY2VzIHdoZW4gdGhlIENvY29zIHNjZW5lIEFQSSBzdXBwb3J0cyBpdC4nKSxcbiAgICAgICAgICAgICAgICAgICAgY2hlY2tQZXJmb3JtYW5jZTogei5ib29sZWFuKCkuZGVmYXVsdCh0cnVlKS5kZXNjcmliZSgnUnVuIGJhc2ljIHBlcmZvcm1hbmNlIGNoZWNrcyBzdWNoIGFzIGhpZ2ggbm9kZSBjb3VudCB3YXJuaW5ncy4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMudmFsaWRhdGVTY2VuZSh7IGNoZWNrTWlzc2luZ0Fzc2V0czogYS5jaGVja01pc3NpbmdBc3NldHMsIGNoZWNrUGVyZm9ybWFuY2U6IGEuY2hlY2tQZXJmb3JtYW5jZSB9KSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2dldF9lZGl0b3JfaW5mbycsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdSZWFkIGVkaXRvciBpbmZvJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1JlYWQgRWRpdG9yL0NvY29zL3Byb2plY3QvcHJvY2VzcyBpbmZvcm1hdGlvbiBhbmQgbWVtb3J5IHN1bW1hcnkuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6ICgpID0+IHRoaXMuZ2V0RWRpdG9ySW5mbygpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnZ2V0X3Byb2plY3RfbG9ncycsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdSZWFkIHByb2plY3QgbG9ncycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdSZWFkIHRlbXAvbG9ncy9wcm9qZWN0LmxvZyB0YWlsIHdpdGggb3B0aW9uYWwgbGV2ZWwva2V5d29yZCBmaWx0ZXJzLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgbGluZXM6IHoubnVtYmVyKCkubWluKDEpLm1heCgxMDAwMCkuZGVmYXVsdCgxMDApLmRlc2NyaWJlKCdOdW1iZXIgb2YgbGluZXMgdG8gcmVhZCBmcm9tIHRoZSBlbmQgb2YgdGVtcC9sb2dzL3Byb2plY3QubG9nLiBEZWZhdWx0IDEwMC4nKSxcbiAgICAgICAgICAgICAgICAgICAgZmlsdGVyS2V5d29yZDogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdPcHRpb25hbCBjYXNlLWluc2Vuc2l0aXZlIGtleXdvcmQgZmlsdGVyLicpLFxuICAgICAgICAgICAgICAgICAgICBsb2dMZXZlbDogei5lbnVtKFsnRVJST1InLCAnV0FSTicsICdJTkZPJywgJ0RFQlVHJywgJ1RSQUNFJywgJ0FMTCddKS5kZWZhdWx0KCdBTEwnKS5kZXNjcmliZSgnT3B0aW9uYWwgbG9nIGxldmVsIGZpbHRlci4gQUxMIGRpc2FibGVzIGxldmVsIGZpbHRlcmluZy4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMuZ2V0UHJvamVjdExvZ3MoYS5saW5lcywgYS5maWx0ZXJLZXl3b3JkLCBhLmxvZ0xldmVsKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2dldF9sb2dfZmlsZV9pbmZvJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1JlYWQgbG9nIGZpbGUgaW5mbycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdSZWFkIHRlbXAvbG9ncy9wcm9qZWN0LmxvZyBwYXRoLCBzaXplLCBsaW5lIGNvdW50LCBhbmQgdGltZXN0YW1wcy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogKCkgPT4gdGhpcy5nZXRMb2dGaWxlSW5mbygpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnc2VhcmNoX3Byb2plY3RfbG9ncycsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdTZWFyY2ggcHJvamVjdCBsb2dzJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1NlYXJjaCB0ZW1wL2xvZ3MvcHJvamVjdC5sb2cgZm9yIHN0cmluZy9yZWdleCBhbmQgcmV0dXJuIGxpbmUgY29udGV4dC4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHBhdHRlcm46IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1NlYXJjaCBzdHJpbmcgb3IgcmVnZXguIEludmFsaWQgcmVnZXggaXMgdHJlYXRlZCBhcyBhIGxpdGVyYWwgc3RyaW5nLicpLFxuICAgICAgICAgICAgICAgICAgICBtYXhSZXN1bHRzOiB6Lm51bWJlcigpLm1pbigxKS5tYXgoMTAwKS5kZWZhdWx0KDIwKS5kZXNjcmliZSgnTWF4aW11bSBtYXRjaGVzIHRvIHJldHVybi4gRGVmYXVsdCAyMC4nKSxcbiAgICAgICAgICAgICAgICAgICAgY29udGV4dExpbmVzOiB6Lm51bWJlcigpLm1pbigwKS5tYXgoMTApLmRlZmF1bHQoMikuZGVzY3JpYmUoJ0NvbnRleHQgbGluZXMgYmVmb3JlL2FmdGVyIGVhY2ggbWF0Y2guIERlZmF1bHQgMi4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMuc2VhcmNoUHJvamVjdExvZ3MoYS5wYXR0ZXJuLCBhLm1heFJlc3VsdHMsIGEuY29udGV4dExpbmVzKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3NjcmVlbnNob3QnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnQ2FwdHVyZSBlZGl0b3Igc2NyZWVuc2hvdCcsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdDYXB0dXJlIHRoZSBmb2N1c2VkIENvY29zIEVkaXRvciB3aW5kb3cgKG9yIGEgd2luZG93IG1hdGNoZWQgYnkgdGl0bGUpIHRvIGEgUE5HLiBSZXR1cm5zIHNhdmVkIGZpbGUgcGF0aC4gVXNlIHRoaXMgZm9yIEFJIHZpc3VhbCB2ZXJpZmljYXRpb24gYWZ0ZXIgc2NlbmUvVUkgY2hhbmdlcy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHNhdmVQYXRoOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0Fic29sdXRlIGZpbGVzeXN0ZW0gcGF0aCB0byBzYXZlIHRoZSBQTkcuIE11c3QgcmVzb2x2ZSBpbnNpZGUgdGhlIGNvY29zIHByb2plY3Qgcm9vdCAoY29udGFpbm1lbnQgY2hlY2sgdmlhIHJlYWxwYXRoKS4gT21pdCB0byBhdXRvLW5hbWUgaW50byA8cHJvamVjdD4vdGVtcC9tY3AtY2FwdHVyZXMvc2NyZWVuc2hvdC08dGltZXN0YW1wPi5wbmcuJyksXG4gICAgICAgICAgICAgICAgICAgIHdpbmRvd1RpdGxlOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ09wdGlvbmFsIHN1YnN0cmluZyBtYXRjaCBvbiB3aW5kb3cgdGl0bGUgdG8gcGljayBhIHNwZWNpZmljIEVsZWN0cm9uIHdpbmRvdy4gRGVmYXVsdDogZm9jdXNlZCB3aW5kb3cuJyksXG4gICAgICAgICAgICAgICAgICAgIGluY2x1ZGVCYXNlNjQ6IHouYm9vbGVhbigpLmRlZmF1bHQoZmFsc2UpLmRlc2NyaWJlKCdFbWJlZCBQTkcgYnl0ZXMgYXMgYmFzZTY0IGluIHJlc3BvbnNlIGRhdGEgKGxhcmdlOyBkZWZhdWx0IGZhbHNlKS4gV2hlbiBmYWxzZSwgb25seSB0aGUgc2F2ZWQgZmlsZSBwYXRoIGlzIHJldHVybmVkLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy5zY3JlZW5zaG90KGEuc2F2ZVBhdGgsIGEud2luZG93VGl0bGUsIGEuaW5jbHVkZUJhc2U2NCksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdjYXB0dXJlX3ByZXZpZXdfc2NyZWVuc2hvdCcsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdDYXB0dXJlIHByZXZpZXcgc2NyZWVuc2hvdCcsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdDYXB0dXJlIHRoZSBjb2NvcyBQcmV2aWV3LWluLUVkaXRvciAoUElFKSBnYW1ldmlldyB0byBhIFBORy4gQ29jb3MgaGFzIG11bHRpcGxlIFBJRSByZW5kZXIgdGFyZ2V0cyBkZXBlbmRpbmcgb24gdGhlIHVzZXJcXCdzIHByZXZpZXcgY29uZmlnIChQcmVmZXJlbmNlcyDihpIgUHJldmlldyDihpIgT3BlbiBQcmV2aWV3IFdpdGgpOiBcImJyb3dzZXJcIiBvcGVucyBhbiBleHRlcm5hbCBicm93c2VyIChOT1QgY2FwdHVyYWJsZSBoZXJlKSwgXCJ3aW5kb3dcIiAvIFwic2ltdWxhdG9yXCIgb3BlbnMgYSBzZXBhcmF0ZSBFbGVjdHJvbiB3aW5kb3cgKHRpdGxlIGNvbnRhaW5zIFwiUHJldmlld1wiKSwgXCJlbWJlZGRlZFwiIHJlbmRlcnMgdGhlIGdhbWV2aWV3IGluc2lkZSB0aGUgbWFpbiBlZGl0b3Igd2luZG93LiBUaGUgZGVmYXVsdCBtb2RlPVwiYXV0b1wiIHRyaWVzIHRoZSBQcmV2aWV3LXRpdGxlZCB3aW5kb3cgZmlyc3QgYW5kIGZhbGxzIGJhY2sgdG8gY2FwdHVyaW5nIHRoZSBtYWluIGVkaXRvciB3aW5kb3cgd2hlbiBubyBQcmV2aWV3LXRpdGxlZCB3aW5kb3cgZXhpc3RzIChjb3ZlcnMgZW1iZWRkZWQgbW9kZSkuIFVzZSBtb2RlPVwid2luZG93XCIgdG8gZm9yY2UgdGhlIHNlcGFyYXRlLXdpbmRvdyBzdHJhdGVneSBvciBtb2RlPVwiZW1iZWRkZWRcIiB0byBza2lwIHRoZSB3aW5kb3cgcHJvYmUuIFBhaXIgd2l0aCBkZWJ1Z19nZXRfcHJldmlld19tb2RlIHRvIHJlYWQgdGhlIGNvY29zIGNvbmZpZyBhbmQgcm91dGUgZGV0ZXJtaW5pc3RpY2FsbHkuIEZvciBydW50aW1lIGdhbWUtY2FudmFzIHBpeGVsLWxldmVsIGNhcHR1cmUgKGNhbWVyYSBSZW5kZXJUZXh0dXJlKSwgdXNlIGRlYnVnX2dhbWVfY29tbWFuZCh0eXBlPVwic2NyZWVuc2hvdFwiKSBpbnN0ZWFkLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgc2F2ZVBhdGg6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnQWJzb2x1dGUgZmlsZXN5c3RlbSBwYXRoIHRvIHNhdmUgdGhlIFBORy4gTXVzdCByZXNvbHZlIGluc2lkZSB0aGUgY29jb3MgcHJvamVjdCByb290IChjb250YWlubWVudCBjaGVjayB2aWEgcmVhbHBhdGgpLiBPbWl0IHRvIGF1dG8tbmFtZSBpbnRvIDxwcm9qZWN0Pi90ZW1wL21jcC1jYXB0dXJlcy9wcmV2aWV3LTx0aW1lc3RhbXA+LnBuZy4nKSxcbiAgICAgICAgICAgICAgICAgICAgbW9kZTogei5lbnVtKFsnYXV0bycsICd3aW5kb3cnLCAnZW1iZWRkZWQnXSkuZGVmYXVsdCgnYXV0bycpLmRlc2NyaWJlKCdDYXB0dXJlIHRhcmdldC4gXCJhdXRvXCIgKGRlZmF1bHQpIHRyaWVzIFByZXZpZXctdGl0bGVkIHdpbmRvdyB0aGVuIGZhbGxzIGJhY2sgdG8gdGhlIG1haW4gZWRpdG9yIHdpbmRvdy4gXCJ3aW5kb3dcIiBvbmx5IG1hdGNoZXMgUHJldmlldy10aXRsZWQgd2luZG93cyAoZmFpbHMgaWYgbm9uZSkuIFwiZW1iZWRkZWRcIiBjYXB0dXJlcyB0aGUgbWFpbiBlZGl0b3Igd2luZG93IGRpcmVjdGx5IChza2lwIFByZXZpZXctd2luZG93IHByb2JlKS4nKSxcbiAgICAgICAgICAgICAgICAgICAgd2luZG93VGl0bGU6IHouc3RyaW5nKCkuZGVmYXVsdCgnUHJldmlldycpLmRlc2NyaWJlKCdTdWJzdHJpbmcgbWF0Y2hlZCBhZ2FpbnN0IHdpbmRvdyB0aXRsZXMgaW4gd2luZG93L2F1dG8gbW9kZXMgKGRlZmF1bHQgXCJQcmV2aWV3XCIgZm9yIFBJRSkuIElnbm9yZWQgaW4gZW1iZWRkZWQgbW9kZS4nKSxcbiAgICAgICAgICAgICAgICAgICAgaW5jbHVkZUJhc2U2NDogei5ib29sZWFuKCkuZGVmYXVsdChmYWxzZSkuZGVzY3JpYmUoJ0VtYmVkIFBORyBieXRlcyBhcyBiYXNlNjQgaW4gcmVzcG9uc2UgZGF0YSAobGFyZ2U7IGRlZmF1bHQgZmFsc2UpLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy5jYXB0dXJlUHJldmlld1NjcmVlbnNob3QoYS5zYXZlUGF0aCwgYS5tb2RlID8/ICdhdXRvJywgYS53aW5kb3dUaXRsZSwgYS5pbmNsdWRlQmFzZTY0KSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2dldF9wcmV2aWV3X21vZGUnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnUmVhZCBwcmV2aWV3IG1vZGUnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnUmVhZCB0aGUgY29jb3MgcHJldmlldyBjb25maWd1cmF0aW9uLiBVc2VzIEVkaXRvci5NZXNzYWdlIHByZWZlcmVuY2VzL3F1ZXJ5LWNvbmZpZyBzbyBBSSBjYW4gcm91dGUgZGVidWdfY2FwdHVyZV9wcmV2aWV3X3NjcmVlbnNob3QgdG8gdGhlIGNvcnJlY3QgbW9kZS4gUmV0dXJucyB7IGludGVycHJldGVkOiBcImJyb3dzZXJcIiB8IFwid2luZG93XCIgfCBcInNpbXVsYXRvclwiIHwgXCJlbWJlZGRlZFwiIHwgXCJ1bmtub3duXCIsIHJhdzogPGZ1bGwgcHJldmlldyBjb25maWcgZHVtcD4gfS4gVXNlIGJlZm9yZSBjYXB0dXJlOiBpZiBpbnRlcnByZXRlZD1cImVtYmVkZGVkXCIsIGNhbGwgY2FwdHVyZV9wcmV2aWV3X3NjcmVlbnNob3Qgd2l0aCBtb2RlPVwiZW1iZWRkZWRcIiBvciByZWx5IG9uIG1vZGU9XCJhdXRvXCIgZmFsbGJhY2suJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6ICgpID0+IHRoaXMuZ2V0UHJldmlld01vZGUoKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3NldF9wcmV2aWV3X21vZGUnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnU2V0IHByZXZpZXcgbW9kZScsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICfinYwgTk9UIFNVUFBPUlRFRCBvbiBjb2NvcyAzLjguNysgKGxhbmRtaW5lICMxNykuIFByb2dyYW1tYXRpYyBwcmV2aWV3LW1vZGUgc3dpdGNoaW5nIGlzIGltcG9zc2libGUgZnJvbSBhIHRoaXJkLXBhcnR5IGV4dGVuc2lvbiBvbiBjb2NvcyAzLjguNzogYHByZWZlcmVuY2VzL3NldC1jb25maWdgIGFnYWluc3QgYHByZXZpZXcuY3VycmVudC5wbGF0Zm9ybWAgcmV0dXJucyB0cnV0aHkgYnV0IG5ldmVyIHBlcnNpc3RzLCBhbmQgKipub25lIG9mIDYgc3VydmV5ZWQgcmVmZXJlbmNlIHByb2plY3RzIChoYXJhZHkgLyBTcGF5ZG8gLyBSb21hUm9nb3YgLyBjb2Nvcy1jb2RlLW1vZGUgLyBGdW5wbGF5QUkgLyBjb2Nvcy1jbGkpIHNoaXAgYSB3b3JraW5nIGFsdGVybmF0aXZlKiogKHYyLjEwIGNyb3NzLXJlcG8gcmVmcmVzaCwgMjAyNi0wNS0wMikuIFRoZSBmaWVsZCBpcyBlZmZlY3RpdmVseSByZWFkLW9ubHkg4oCUIG9ubHkgdGhlIGNvY29zIHByZXZpZXcgZHJvcGRvd24gd3JpdGVzIGl0LiAqKlVzZSB0aGUgY29jb3MgcHJldmlldyBkcm9wZG93biBpbiB0aGUgZWRpdG9yIHRvb2xiYXIgdG8gc3dpdGNoIG1vZGVzKiouIERlZmF1bHQgYmVoYXZpb3IgaXMgaGFyZC1mYWlsOyBwYXNzIGF0dGVtcHRBbnl3YXk9dHJ1ZSBPTkxZIGZvciBkaWFnbm9zdGljIHByb2JpbmcgKHJldHVybnMgNC1zdHJhdGVneSBhdHRlbXB0IGxvZyBzbyB5b3UgY2FuIHZlcmlmeSBhZ2FpbnN0IGEgZnV0dXJlIGNvY29zIGJ1aWxkIHdoZXRoZXIgYW55IHNoYXBlIG5vdyB3b3JrcykuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBtb2RlOiB6LmVudW0oWydicm93c2VyJywgJ2dhbWVWaWV3JywgJ3NpbXVsYXRvciddKS5kZXNjcmliZSgnVGFyZ2V0IHByZXZpZXcgcGxhdGZvcm0uIFwiYnJvd3NlclwiIG9wZW5zIHByZXZpZXcgaW4gdGhlIHVzZXIgZGVmYXVsdCBicm93c2VyLiBcImdhbWVWaWV3XCIgZW1iZWRzIHRoZSBnYW1ldmlldyBpbiB0aGUgbWFpbiBlZGl0b3IgKGluLWVkaXRvciBwcmV2aWV3KS4gXCJzaW11bGF0b3JcIiBsYXVuY2hlcyB0aGUgY29jb3Mgc2ltdWxhdG9yLiBNYXBzIGRpcmVjdGx5IHRvIHRoZSBjb2NvcyBwcmV2aWV3LmN1cnJlbnQucGxhdGZvcm0gdmFsdWUuJyksXG4gICAgICAgICAgICAgICAgICAgIGF0dGVtcHRBbnl3YXk6IHouYm9vbGVhbigpLmRlZmF1bHQoZmFsc2UpLmRlc2NyaWJlKCdEaWFnbm9zdGljIG9wdC1pbi4gRGVmYXVsdCBmYWxzZSByZXR1cm5zIE5PVF9TVVBQT1JURUQgd2l0aCB0aGUgY29jb3MgVUkgcmVkaXJlY3QuIFNldCB0cnVlIE9OTFkgdG8gcmUtcHJvYmUgdGhlIDQgc2V0LWNvbmZpZyBzaGFwZXMgYWdhaW5zdCBhIG5ldyBjb2NvcyBidWlsZCDigJQgdXNlZnVsIHdoZW4gdmFsaWRhdGluZyB3aGV0aGVyIGEgZnV0dXJlIGNvY29zIHZlcnNpb24gZXhwb3NlcyBhIHdyaXRlIHBhdGguIFJldHVybnMgZGF0YS5hdHRlbXB0cyB3aXRoIGV2ZXJ5IHNoYXBlIHRyaWVkIGFuZCBpdHMgcmVhZC1iYWNrIG9ic2VydmF0aW9uLiBEb2VzIE5PVCBmcmVlemUgdGhlIGVkaXRvciAodGhlIGNhbGwgbWVyZWx5IG5vLW9wcykuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLnNldFByZXZpZXdNb2RlKGEubW9kZSwgYS5hdHRlbXB0QW55d2F5ID8/IGZhbHNlKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2JhdGNoX3NjcmVlbnNob3QnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnQ2FwdHVyZSBiYXRjaCBzY3JlZW5zaG90cycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdDYXB0dXJlIG11bHRpcGxlIFBOR3Mgb2YgdGhlIGVkaXRvciB3aW5kb3cgd2l0aCBvcHRpb25hbCBkZWxheXMgYmV0d2VlbiBzaG90cy4gVXNlZnVsIGZvciBhbmltYXRpbmcgcHJldmlldyB2ZXJpZmljYXRpb24gb3IgY2FwdHVyaW5nIHRyYW5zaXRpb25zLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgc2F2ZVBhdGhQcmVmaXg6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnUGF0aCBwcmVmaXggZm9yIGJhdGNoIG91dHB1dCBmaWxlcy4gRmlsZXMgd3JpdHRlbiBhcyA8cHJlZml4Pi08aW5kZXg+LnBuZy4gTXVzdCByZXNvbHZlIGluc2lkZSB0aGUgY29jb3MgcHJvamVjdCByb290IChjb250YWlubWVudCBjaGVjayB2aWEgcmVhbHBhdGgpLiBEZWZhdWx0OiA8cHJvamVjdD4vdGVtcC9tY3AtY2FwdHVyZXMvYmF0Y2gtPHRpbWVzdGFtcD4uJyksXG4gICAgICAgICAgICAgICAgICAgIGRlbGF5c01zOiB6LmFycmF5KHoubnVtYmVyKCkubWluKDApLm1heCgxMDAwMCkpLm1heCgyMCkuZGVmYXVsdChbMF0pLmRlc2NyaWJlKCdEZWxheSAobXMpIGJlZm9yZSBlYWNoIGNhcHR1cmUuIExlbmd0aCBkZXRlcm1pbmVzIGhvdyBtYW55IHNob3RzIHRha2VuIChjYXBwZWQgYXQgMjAgdG8gcHJldmVudCBkaXNrIGZpbGwgLyBlZGl0b3IgZnJlZXplKS4gRGVmYXVsdCBbMF0gPSBzaW5nbGUgc2hvdC4nKSxcbiAgICAgICAgICAgICAgICAgICAgd2luZG93VGl0bGU6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnT3B0aW9uYWwgc3Vic3RyaW5nIG1hdGNoIG9uIHdpbmRvdyB0aXRsZS4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMuYmF0Y2hTY3JlZW5zaG90KGEuc2F2ZVBhdGhQcmVmaXgsIGEuZGVsYXlzTXMsIGEud2luZG93VGl0bGUpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnd2FpdF9jb21waWxlJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1dhaXQgZm9yIGNvbXBpbGUnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnQmxvY2sgdW50aWwgY29jb3MgZmluaXNoZXMgaXRzIFR5cGVTY3JpcHQgY29tcGlsZSBwYXNzLiBUYWlscyB0ZW1wL3Byb2dyYW1taW5nL3BhY2tlci1kcml2ZXIvbG9ncy9kZWJ1Zy5sb2cgZm9yIHRoZSBcIlRhcmdldChlZGl0b3IpIGVuZHNcIiBtYXJrZXIuIFJldHVybnMgaW1tZWRpYXRlbHkgd2l0aCBjb21waWxlZD1mYWxzZSBpZiBubyBjb21waWxlIHdhcyB0cmlnZ2VyZWQgKGNsZWFuIHByb2plY3QgLyBubyBjaGFuZ2VzIGRldGVjdGVkKS4gUGFpciB3aXRoIHJ1bl9zY3JpcHRfZGlhZ25vc3RpY3MgZm9yIGFuIFwiZWRpdCAudHMg4oaSIHdhaXQg4oaSIGZldGNoIGVycm9yc1wiIHdvcmtmbG93LicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgdGltZW91dE1zOiB6Lm51bWJlcigpLm1pbig1MDApLm1heCgxMjAwMDApLmRlZmF1bHQoMTUwMDApLmRlc2NyaWJlKCdNYXggd2FpdCB0aW1lIGluIG1zIGJlZm9yZSBnaXZpbmcgdXAuIERlZmF1bHQgMTUwMDAuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLndhaXRDb21waWxlKGEudGltZW91dE1zKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3J1bl9zY3JpcHRfZGlhZ25vc3RpY3MnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnUnVuIHNjcmlwdCBkaWFnbm9zdGljcycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdSdW4gYHRzYyAtLW5vRW1pdGAgYWdhaW5zdCB0aGUgcHJvamVjdCB0c2NvbmZpZyBhbmQgcmV0dXJuIHBhcnNlZCBkaWFnbm9zdGljcy4gVXNlZCBhZnRlciB3YWl0X2NvbXBpbGUgdG8gc3VyZmFjZSBjb21waWxhdGlvbiBlcnJvcnMgYXMgc3RydWN0dXJlZCB7ZmlsZSwgbGluZSwgY29sdW1uLCBjb2RlLCBtZXNzYWdlfSBlbnRyaWVzLiBSZXNvbHZlcyB0c2MgYmluYXJ5IGZyb20gcHJvamVjdCBub2RlX21vZHVsZXMg4oaSIGVkaXRvciBidW5kbGVkIGVuZ2luZSDihpIgbnB4IGZhbGxiYWNrLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgdHNjb25maWdQYXRoOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ09wdGlvbmFsIG92ZXJyaWRlIChhYnNvbHV0ZSBvciBwcm9qZWN0LXJlbGF0aXZlKS4gRGVmYXVsdDogdHNjb25maWcuanNvbiBvciB0ZW1wL3RzY29uZmlnLmNvY29zLmpzb24uJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLnJ1blNjcmlwdERpYWdub3N0aWNzKGEudHNjb25maWdQYXRoKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3ByZXZpZXdfdXJsJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1Jlc29sdmUgcHJldmlldyBVUkwnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnUmVzb2x2ZSB0aGUgY29jb3MgYnJvd3Nlci1wcmV2aWV3IFVSTC4gVXNlcyB0aGUgZG9jdW1lbnRlZCBFZGl0b3IuTWVzc2FnZSBjaGFubmVsIHByZXZpZXcvcXVlcnktcHJldmlldy11cmwuIFdpdGggYWN0aW9uPVwib3BlblwiLCBhbHNvIGxhdW5jaGVzIHRoZSBVUkwgaW4gdGhlIHVzZXIgZGVmYXVsdCBicm93c2VyIHZpYSBlbGVjdHJvbi5zaGVsbC5vcGVuRXh0ZXJuYWwg4oCUIHVzZWZ1bCBhcyBhIHNldHVwIHN0ZXAgYmVmb3JlIGRlYnVnX2dhbWVfY29tbWFuZCwgc2luY2UgdGhlIEdhbWVEZWJ1Z0NsaWVudCBydW5uaW5nIGluc2lkZSB0aGUgcHJldmlldyBtdXN0IGJlIHJlYWNoYWJsZS4gRWRpdG9yLXNpZGUgUHJldmlldy1pbi1FZGl0b3IgcGxheS9zdG9wIGlzIE5PVCBleHBvc2VkIGJ5IHRoZSBwdWJsaWMgbWVzc2FnZSBBUEkgYW5kIGlzIGludGVudGlvbmFsbHkgbm90IGltcGxlbWVudGVkIGhlcmU7IHVzZSB0aGUgY29jb3MgZWRpdG9yIHRvb2xiYXIgbWFudWFsbHkgZm9yIFBJRS4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIGFjdGlvbjogei5lbnVtKFsncXVlcnknLCAnb3BlbiddKS5kZWZhdWx0KCdxdWVyeScpLmRlc2NyaWJlKCdcInF1ZXJ5XCIgcmV0dXJucyB0aGUgVVJMOyBcIm9wZW5cIiByZXR1cm5zIHRoZSBVUkwgQU5EIG9wZW5zIGl0IGluIHRoZSB1c2VyIGRlZmF1bHQgYnJvd3NlciB2aWEgZWxlY3Ryb24uc2hlbGwub3BlbkV4dGVybmFsLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy5wcmV2aWV3VXJsKGEuYWN0aW9uKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3F1ZXJ5X2RldmljZXMnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnTGlzdCBwcmV2aWV3IGRldmljZXMnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnTGlzdCBwcmV2aWV3IGRldmljZXMgY29uZmlndXJlZCBpbiB0aGUgY29jb3MgcHJvamVjdC4gQmFja2VkIGJ5IEVkaXRvci5NZXNzYWdlIGNoYW5uZWwgZGV2aWNlL3F1ZXJ5LiBSZXR1cm5zIGFuIGFycmF5IG9mIHtuYW1lLCB3aWR0aCwgaGVpZ2h0LCByYXRpb30gZW50cmllcyDigJQgdXNlZnVsIGZvciBiYXRjaC1zY3JlZW5zaG90IHBpcGVsaW5lcyB0aGF0IHRhcmdldCBtdWx0aXBsZSByZXNvbHV0aW9ucy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogKCkgPT4gdGhpcy5xdWVyeURldmljZXMoKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2dhbWVfY29tbWFuZCcsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdTZW5kIGdhbWUgY29tbWFuZCcsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdTZW5kIGEgcnVudGltZSBjb21tYW5kIHRvIGEgY29ubmVjdGVkIEdhbWVEZWJ1Z0NsaWVudC4gV29ya3MgaW5zaWRlIGEgY29jb3MgcHJldmlldy9idWlsZCAoYnJvd3NlciwgUHJldmlldy1pbi1FZGl0b3IsIG9yIGFueSBkZXZpY2UgdGhhdCBmZXRjaGVzIC9nYW1lL2NvbW1hbmQpLiBCdWlsdC1pbiBjb21tYW5kIHR5cGVzOiBcInNjcmVlbnNob3RcIiAoY2FwdHVyZSBnYW1lIGNhbnZhcyB0byBQTkcsIHJldHVybnMgc2F2ZWQgZmlsZSBwYXRoKSwgXCJjbGlja1wiIChlbWl0IEJ1dHRvbi5DTElDSyBvbiBhIG5vZGUgYnkgbmFtZSksIFwiaW5zcGVjdFwiIChkdW1wIHJ1bnRpbWUgbm9kZSBpbmZvOiBwb3NpdGlvbi9zY2FsZS9yb3RhdGlvbi9jb250ZW50U2l6ZS9hY3RpdmUvY29tcG9uZW50cyBieSBuYW1lKS4gQ3VzdG9tIGNvbW1hbmQgdHlwZXMgYXJlIGZvcndhcmRlZCB0byB0aGUgY2xpZW50XFwncyBjdXN0b21Db21tYW5kcyBtYXAgKGUuZy4gXCJzdGF0ZVwiLCBcIm5hdmlnYXRlXCIpLiBSZXF1aXJlcyB0aGUgR2FtZURlYnVnQ2xpZW50IHRlbXBsYXRlIChjbGllbnQvY29jb3MtbWNwLWNsaWVudC50cykgd2lyZWQgaW50byB0aGUgcnVubmluZyBnYW1lOyB3aXRob3V0IGl0IHRoZSBjYWxsIHRpbWVzIG91dC4gQ2hlY2sgR0VUIC9nYW1lL3N0YXR1cyB0byB2ZXJpZnkgY2xpZW50IGxpdmVuZXNzIGZpcnN0LicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogei5zdHJpbmcoKS5taW4oMSkuZGVzY3JpYmUoJ0NvbW1hbmQgdHlwZS4gQnVpbHQtaW5zOiBzY3JlZW5zaG90LCBjbGljaywgaW5zcGVjdC4gQ3VzdG9tczogYW55IHN0cmluZyB0aGUgR2FtZURlYnVnQ2xpZW50IHJlZ2lzdGVyZWQgaW4gY3VzdG9tQ29tbWFuZHMuJyksXG4gICAgICAgICAgICAgICAgICAgIGFyZ3M6IHouYW55KCkub3B0aW9uYWwoKS5kZXNjcmliZSgnQ29tbWFuZC1zcGVjaWZpYyBhcmd1bWVudHMuIEZvciBcImNsaWNrXCIvXCJpbnNwZWN0XCI6IHtuYW1lOiBzdHJpbmd9IG5vZGUgbmFtZS4gRm9yIFwic2NyZWVuc2hvdFwiOiB7fSAobm8gYXJncykuJyksXG4gICAgICAgICAgICAgICAgICAgIHRpbWVvdXRNczogei5udW1iZXIoKS5taW4oNTAwKS5tYXgoNjAwMDApLmRlZmF1bHQoMTAwMDApLmRlc2NyaWJlKCdNYXggd2FpdCBmb3IgY2xpZW50IHJlc3BvbnNlLiBEZWZhdWx0IDEwMDAwbXMuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLmdhbWVDb21tYW5kKGEudHlwZSwgYS5hcmdzLCBhLnRpbWVvdXRNcyksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdyZWNvcmRfc3RhcnQnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnU3RhcnQgZ2FtZSByZWNvcmRpbmcnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnU3RhcnQgcmVjb3JkaW5nIHRoZSBydW5uaW5nIGdhbWUgY2FudmFzIHZpYSB0aGUgR2FtZURlYnVnQ2xpZW50IChicm93c2VyL1BJRSBwcmV2aWV3IG9ubHkpLiBXcmFwcyBkZWJ1Z19nYW1lX2NvbW1hbmQodHlwZT1cInJlY29yZF9zdGFydFwiKSBmb3IgQUkgZXJnb25vbWljcy4gUmV0dXJucyBpbW1lZGlhdGVseSB3aXRoIHsgcmVjb3JkaW5nOiB0cnVlLCBtaW1lVHlwZSB9OyB0aGUgcmVjb3JkaW5nIGNvbnRpbnVlcyB1bnRpbCBkZWJ1Z19yZWNvcmRfc3RvcCBpcyBjYWxsZWQuIEJyb3dzZXItb25seSDigJQgZmFpbHMgb24gbmF0aXZlIGNvY29zIGJ1aWxkcyAoTWVkaWFSZWNvcmRlciBBUEkgcmVxdWlyZXMgYSBET00gY2FudmFzICsgY2FwdHVyZVN0cmVhbSkuIFNpbmdsZS1mbGlnaHQgcGVyIGNsaWVudDogYSBzZWNvbmQgcmVjb3JkX3N0YXJ0IHdoaWxlIGEgcmVjb3JkaW5nIGlzIGluIHByb2dyZXNzIHJldHVybnMgc3VjY2VzczpmYWxzZS4gUGFpciB3aXRoIGRlYnVnX2dhbWVfY2xpZW50X3N0YXR1cyB0byBjb25maXJtIGEgY2xpZW50IGlzIGNvbm5lY3RlZCBiZWZvcmUgY2FsbGluZy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIG1pbWVUeXBlOiB6LmVudW0oWyd2aWRlby93ZWJtJywgJ3ZpZGVvL21wNCddKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdDb250YWluZXIvY29kZWMgaGludCBmb3IgTWVkaWFSZWNvcmRlci4gRGVmYXVsdDogYnJvd3NlciBhdXRvLXBpY2sgKHdlYm0gcHJlZmVycmVkIHdoZXJlIHN1cHBvcnRlZCwgZmFsbHMgYmFjayB0byBtcDQpLiBTb21lIGJyb3dzZXJzIHJlamVjdCB1bnN1cHBvcnRlZCB0eXBlcyDigJQgcmVjb3JkX3N0YXJ0IHN1cmZhY2VzIGEgY2xlYXIgZXJyb3IgaW4gdGhhdCBjYXNlLicpLFxuICAgICAgICAgICAgICAgICAgICB2aWRlb0JpdHNQZXJTZWNvbmQ6IHoubnVtYmVyKCkubWluKDEwMF8wMDApLm1heCgyMF8wMDBfMDAwKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdPcHRpb25hbCBNZWRpYVJlY29yZGVyIGJpdHJhdGUgaGludCBpbiBiaXRzL3NlYy4gTG93ZXIg4oaSIHNtYWxsZXIgZmlsZXMgYnV0IGxvd2VyIHF1YWxpdHkuIEJyb3dzZXIgZGVmYXVsdCBpZiBvbWl0dGVkLicpLFxuICAgICAgICAgICAgICAgICAgICB0aW1lb3V0TXM6IHoubnVtYmVyKCkubWluKDUwMCkubWF4KDMwMDAwKS5kZWZhdWx0KDUwMDApLmRlc2NyaWJlKCdNYXggd2FpdCBmb3IgdGhlIEdhbWVEZWJ1Z0NsaWVudCB0byBhY2tub3dsZWRnZSByZWNvcmRfc3RhcnQuIFJlY29yZGluZyBpdHNlbGYgcnVucyB1bnRpbCBkZWJ1Z19yZWNvcmRfc3RvcC4gRGVmYXVsdCA1MDAwbXMuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLnJlY29yZFN0YXJ0KGEubWltZVR5cGUsIGEudmlkZW9CaXRzUGVyU2Vjb25kLCBhLnRpbWVvdXRNcyA/PyA1MDAwKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3JlY29yZF9zdG9wJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1N0b3AgZ2FtZSByZWNvcmRpbmcnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnU3RvcCB0aGUgaW4tcHJvZ3Jlc3MgZ2FtZSBjYW52YXMgcmVjb3JkaW5nIGFuZCBwZXJzaXN0IGl0IHVuZGVyIDxwcm9qZWN0Pi90ZW1wL21jcC1jYXB0dXJlcy4gV3JhcHMgZGVidWdfZ2FtZV9jb21tYW5kKHR5cGU9XCJyZWNvcmRfc3RvcFwiKS4gUmV0dXJucyB7IGZpbGVQYXRoLCBzaXplLCBtaW1lVHlwZSwgZHVyYXRpb25NcyB9LiBDYWxsaW5nIHdpdGhvdXQgYSBwcmlvciByZWNvcmRfc3RhcnQgcmV0dXJucyBzdWNjZXNzOmZhbHNlLiBUaGUgaG9zdCBhcHBsaWVzIHRoZSBzYW1lIHJlYWxwYXRoIGNvbnRhaW5tZW50IGd1YXJkICsgNjRNQiBieXRlIGNhcCAoc3luY2VkIHdpdGggdGhlIHJlcXVlc3QgYm9keSBjYXAgaW4gbWNwLXNlcnZlci1zZGsudHM7IHYyLjkuNiByYWlzZWQgYm90aCBmcm9tIDMyIHRvIDY0TUIpOyByYWlzZSB2aWRlb0JpdHNQZXJTZWNvbmQgLyByZWR1Y2UgcmVjb3JkaW5nIGR1cmF0aW9uIG9uIGNhcCByZWplY3Rpb24uJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICB0aW1lb3V0TXM6IHoubnVtYmVyKCkubWluKDEwMDApLm1heCgxMjAwMDApLmRlZmF1bHQoMzAwMDApLmRlc2NyaWJlKCdNYXggd2FpdCBmb3IgdGhlIGNsaWVudCB0byBhc3NlbWJsZSArIHJldHVybiB0aGUgcmVjb3JkaW5nIGJsb2IuIFJlY29yZGluZ3Mgb2Ygc2V2ZXJhbCBzZWNvbmRzIGF0IGhpZ2ggYml0cmF0ZSBtYXkgbmVlZCBsb25nZXIgdGhhbiB0aGUgZGVmYXVsdCAzMHMg4oCUIHJhaXNlIG9uIGxvbmcgcmVjb3JkaW5ncy4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMucmVjb3JkU3RvcChhLnRpbWVvdXRNcyA/PyAzMDAwMCksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdnYW1lX2NsaWVudF9zdGF0dXMnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnUmVhZCBnYW1lIGNsaWVudCBzdGF0dXMnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnUmVhZCBHYW1lRGVidWdDbGllbnQgY29ubmVjdGlvbiBzdGF0dXMuIEluY2x1ZGVzIGNvbm5lY3RlZCAocG9sbGVkIHdpdGhpbiAycyksIGxhc3QgcG9sbCB0aW1lc3RhbXAsIGFuZCB3aGV0aGVyIGEgY29tbWFuZCBpcyBxdWV1ZWQuIFVzZSBiZWZvcmUgZGVidWdfZ2FtZV9jb21tYW5kIHRvIGNvbmZpcm0gdGhlIGNsaWVudCBpcyByZWFjaGFibGUuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6ICgpID0+IHRoaXMuZ2FtZUNsaWVudFN0YXR1cygpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnY2hlY2tfZWRpdG9yX2hlYWx0aCcsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdDaGVjayBlZGl0b3IgaGVhbHRoJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1Byb2JlIHdoZXRoZXIgdGhlIGNvY29zIGVkaXRvciBzY2VuZS1zY3JpcHQgcmVuZGVyZXIgaXMgcmVzcG9uc2l2ZS4gVXNlZnVsIGFmdGVyIGRlYnVnX3ByZXZpZXdfY29udHJvbChzdGFydCkg4oCUIGxhbmRtaW5lICMxNiBkb2N1bWVudHMgdGhhdCBjb2NvcyAzLjguNyBzb21ldGltZXMgZnJlZXplcyB0aGUgc2NlbmUtc2NyaXB0IHJlbmRlcmVyIChzcGlubmluZyBpbmRpY2F0b3IsIEN0cmwrUiByZXF1aXJlZCkuIFN0cmF0ZWd5ICh2Mi45LjYpOiB0aHJlZSBwcm9iZXMg4oCUICgxKSBob3N0OiBkZXZpY2UvcXVlcnkgKG1haW4gcHJvY2VzcywgYWx3YXlzIHJlc3BvbnNpdmUgZXZlbiB3aGVuIHNjZW5lLXNjcmlwdCBpcyB3ZWRnZWQpOyAoMikgc2NlbmUvcXVlcnktaXMtcmVhZHkgdHlwZWQgY2hhbm5lbCDigJQgZGlyZWN0IElQQyBpbnRvIHRoZSBzY2VuZSBtb2R1bGUsIGhhbmdzIHdoZW4gc2NlbmUgcmVuZGVyZXIgaXMgZnJvemVuOyAoMykgc2NlbmUvcXVlcnktbm9kZS10cmVlIHR5cGVkIGNoYW5uZWwg4oCUIHJldHVybnMgdGhlIGZ1bGwgc2NlbmUgdHJlZSwgZm9yY2VzIGFuIGFjdHVhbCBzY2VuZS1ncmFwaCB3YWxrIHRocm91Z2ggdGhlIHdlZGdlZCBjb2RlIHBhdGguIEVhY2ggcHJvYmUgaGFzIGl0cyBvd24gdGltZW91dCByYWNlIChkZWZhdWx0IDE1MDBtcyBlYWNoKS4gU2NlbmUgZGVjbGFyZWQgYWxpdmUgb25seSB3aGVuIEJPVEggKDIpIHJldHVybnMgdHJ1ZSBBTkQgKDMpIHJldHVybnMgYSBub24tbnVsbCB0cmVlIHdpdGhpbiB0aGUgdGltZW91dC4gUmV0dXJucyB7IGhvc3RBbGl2ZSwgc2NlbmVBbGl2ZSwgc2NlbmVMYXRlbmN5TXMsIGhvc3RFcnJvciwgc2NlbmVFcnJvciwgdG90YWxQcm9iZU1zIH0uIEFJIHdvcmtmbG93OiBjYWxsIGFmdGVyIHByZXZpZXdfY29udHJvbChzdGFydCk7IGlmIHNjZW5lQWxpdmU9ZmFsc2UsIHN1cmZhY2UgXCJjb2NvcyBlZGl0b3IgbGlrZWx5IGZyb3plbiDigJQgcHJlc3MgQ3RybCtSXCIgaW5zdGVhZCBvZiBpc3N1aW5nIG1vcmUgc2NlbmUtYm91bmQgY2FsbHMuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBzY2VuZVRpbWVvdXRNczogei5udW1iZXIoKS5taW4oMjAwKS5tYXgoMTAwMDApLmRlZmF1bHQoMTUwMCkuZGVzY3JpYmUoJ1RpbWVvdXQgZm9yIHRoZSBzY2VuZS1zY3JpcHQgcHJvYmUgaW4gbXMuIEJlbG93IHRoaXMgc2NlbmUgaXMgY29uc2lkZXJlZCBmcm96ZW4uIERlZmF1bHQgMTUwMG1zLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy5jaGVja0VkaXRvckhlYWx0aChhLnNjZW5lVGltZW91dE1zID8/IDE1MDApLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAncHJldmlld19jb250cm9sJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ0NvbnRyb2wgcHJldmlldyBwbGF5YmFjaycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICfimqAgUEFSS0VEIOKAlCBzdGFydCBGUkVFWkVTIGNvY29zIDMuOC43IChsYW5kbWluZSAjMTYpLiBQcm9ncmFtbWF0aWNhbGx5IHN0YXJ0IG9yIHN0b3AgUHJldmlldy1pbi1FZGl0b3IgKFBJRSkgcGxheSBtb2RlLiBXcmFwcyB0aGUgdHlwZWQgY2NlLlNjZW5lRmFjYWRlTWFuYWdlci5jaGFuZ2VQcmV2aWV3UGxheVN0YXRlIG1ldGhvZC4gKipzdGFydCBoaXRzIGEgY29jb3MgMy44Ljcgc29mdFJlbG9hZFNjZW5lIHJhY2UqKiB0aGF0IHJldHVybnMgc3VjY2VzcyBidXQgZnJlZXplcyB0aGUgZWRpdG9yIChzcGlubmluZyBpbmRpY2F0b3IsIEN0cmwrUiByZXF1aXJlZCB0byByZWNvdmVyKS4gVmVyaWZpZWQgaW4gYm90aCBlbWJlZGRlZCBhbmQgYnJvd3NlciBwcmV2aWV3IG1vZGVzLiB2Mi4xMCBjcm9zcy1yZXBvIHJlZnJlc2ggY29uZmlybWVkOiBub25lIG9mIDYgc3VydmV5ZWQgcGVlcnMgKGhhcmFkeSAvIFNwYXlkbyAvIFJvbWFSb2dvdiAvIGNvY29zLWNvZGUtbW9kZSAvIEZ1bnBsYXlBSSAvIGNvY29zLWNsaSkgc2hpcCBhIHNhZmVyIGNhbGwgcGF0aCDigJQgaGFyYWR5IGFuZCBjb2Nvcy1jb2RlLW1vZGUgdXNlIHRoZSBgRWRpdG9yLk1lc3NhZ2Ugc2NlbmUvZWRpdG9yLXByZXZpZXctc2V0LXBsYXlgIGNoYW5uZWwgYW5kIGhpdCB0aGUgc2FtZSByYWNlLiAqKnN0b3AgaXMgc2FmZSoqIGFuZCByZWxpYWJsZS4gVG8gcHJldmVudCBhY2NpZGVudGFsIHRyaWdnZXJpbmcsIHN0YXJ0IHJlcXVpcmVzIGV4cGxpY2l0IGBhY2tub3dsZWRnZUZyZWV6ZVJpc2s6IHRydWVgLiAqKlN0cm9uZ2x5IHByZWZlcnJlZCBhbHRlcm5hdGl2ZXMgaW5zdGVhZCBvZiBzdGFydCoqOiAoYSkgZGVidWdfY2FwdHVyZV9wcmV2aWV3X3NjcmVlbnNob3QobW9kZT1cImVtYmVkZGVkXCIpIGluIEVESVQgbW9kZSDigJQgbm8gUElFIG5lZWRlZDsgKGIpIGRlYnVnX2dhbWVfY29tbWFuZCh0eXBlPVwic2NyZWVuc2hvdFwiKSB2aWEgR2FtZURlYnVnQ2xpZW50IG9uIGJyb3dzZXIgcHJldmlldyBsYXVuY2hlZCB2aWEgZGVidWdfcHJldmlld191cmwoYWN0aW9uPVwib3BlblwiKS4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIG9wOiB6LmVudW0oWydzdGFydCcsICdzdG9wJ10pLmRlc2NyaWJlKCdcInN0YXJ0XCIgZW50ZXJzIFBJRSBwbGF5IG1vZGUgKGVxdWl2YWxlbnQgdG8gY2xpY2tpbmcgdGhlIHRvb2xiYXIgcGxheSBidXR0b24pIOKAlCBSRVFVSVJFUyBhY2tub3dsZWRnZUZyZWV6ZVJpc2s9dHJ1ZSBvbiBjb2NvcyAzLjguNyBkdWUgdG8gbGFuZG1pbmUgIzE2LiBcInN0b3BcIiBleGl0cyBQSUUgcGxheSBhbmQgcmV0dXJucyB0byBzY2VuZSBtb2RlIChhbHdheXMgc2FmZSkuJyksXG4gICAgICAgICAgICAgICAgICAgIGFja25vd2xlZGdlRnJlZXplUmlzazogei5ib29sZWFuKCkuZGVmYXVsdChmYWxzZSkuZGVzY3JpYmUoJ1JlcXVpcmVkIHRvIGJlIHRydWUgZm9yIG9wPVwic3RhcnRcIiBvbiBjb2NvcyAzLjguNyBkdWUgdG8gbGFuZG1pbmUgIzE2IChzb2Z0UmVsb2FkU2NlbmUgcmFjZSB0aGF0IGZyZWV6ZXMgdGhlIGVkaXRvcikuIFNldCB0cnVlIE9OTFkgd2hlbiB0aGUgaHVtYW4gdXNlciBoYXMgZXhwbGljaXRseSBhY2NlcHRlZCB0aGUgcmlzayBhbmQgaXMgcHJlcGFyZWQgdG8gcHJlc3MgQ3RybCtSIGlmIHRoZSBlZGl0b3IgZnJlZXplcy4gSWdub3JlZCBmb3Igb3A9XCJzdG9wXCIgd2hpY2ggaXMgcmVsaWFibGUuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLnByZXZpZXdDb250cm9sKGEub3AsIGEuYWNrbm93bGVkZ2VGcmVlemVSaXNrID8/IGZhbHNlKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2dldF9zY3JpcHRfZGlhZ25vc3RpY19jb250ZXh0JyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1JlYWQgZGlhZ25vc3RpYyBjb250ZXh0JyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1JlYWQgYSB3aW5kb3cgb2Ygc291cmNlIGxpbmVzIGFyb3VuZCBhIGRpYWdub3N0aWMgbG9jYXRpb24gc28gQUkgY2FuIHJlYWQgdGhlIG9mZmVuZGluZyBjb2RlIHdpdGhvdXQgYSBzZXBhcmF0ZSBmaWxlIHJlYWQuIFBhaXIgd2l0aCBydW5fc2NyaXB0X2RpYWdub3N0aWNzOiBwYXNzIGZpbGUvbGluZSBmcm9tIGVhY2ggZGlhZ25vc3RpYyB0byBmZXRjaCBjb250ZXh0LicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgZmlsZTogei5zdHJpbmcoKS5kZXNjcmliZSgnQWJzb2x1dGUgb3IgcHJvamVjdC1yZWxhdGl2ZSBwYXRoIHRvIHRoZSBzb3VyY2UgZmlsZS4gRGlhZ25vc3RpY3MgZnJvbSBydW5fc2NyaXB0X2RpYWdub3N0aWNzIGFscmVhZHkgdXNlIGEgcGF0aCB0c2MgZW1pdHRlZCwgd2hpY2ggaXMgc3VpdGFibGUgaGVyZS4nKSxcbiAgICAgICAgICAgICAgICAgICAgbGluZTogei5udW1iZXIoKS5taW4oMSkuZGVzY3JpYmUoJzEtYmFzZWQgbGluZSBudW1iZXIgdGhhdCB0aGUgZGlhZ25vc3RpYyBwb2ludHMgYXQuJyksXG4gICAgICAgICAgICAgICAgICAgIGNvbnRleHRMaW5lczogei5udW1iZXIoKS5taW4oMCkubWF4KDUwKS5kZWZhdWx0KDUpLmRlc2NyaWJlKCdOdW1iZXIgb2YgbGluZXMgdG8gaW5jbHVkZSBiZWZvcmUgYW5kIGFmdGVyIHRoZSB0YXJnZXQgbGluZS4gRGVmYXVsdCA1ICjCsTUg4oaSIDExLWxpbmUgd2luZG93KS4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMuZ2V0U2NyaXB0RGlhZ25vc3RpY0NvbnRleHQoYS5maWxlLCBhLmxpbmUsIGEuY29udGV4dExpbmVzKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgIF07XG4gICAgICAgIHRoaXMuZXhlYyA9IGRlZmluZVRvb2xzKGRlZnMpO1xuICAgIH1cblxuICAgIGdldFRvb2xzKCk6IFRvb2xEZWZpbml0aW9uW10geyByZXR1cm4gdGhpcy5leGVjLmdldFRvb2xzKCk7IH1cbiAgICBleGVjdXRlKHRvb2xOYW1lOiBzdHJpbmcsIGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7IHJldHVybiB0aGlzLmV4ZWMuZXhlY3V0ZSh0b29sTmFtZSwgYXJncyk7IH1cblxuICAgIC8vIENvbXBhdCBwYXRoOiBwcmVzZXJ2ZSB0aGUgcHJlLXYyLjMuMCByZXNwb25zZSBzaGFwZVxuICAgIC8vIHtzdWNjZXNzLCBkYXRhOiB7cmVzdWx0LCBtZXNzYWdlOiAnU2NyaXB0IGV4ZWN1dGVkIHN1Y2Nlc3NmdWxseSd9fVxuICAgIC8vIHNvIG9sZGVyIGNhbGxlcnMgcmVhZGluZyBkYXRhLm1lc3NhZ2Uga2VlcCB3b3JraW5nLlxuICAgIHByaXZhdGUgYXN5bmMgZXhlY3V0ZVNjcmlwdENvbXBhdChzY3JpcHQ6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IG91dCA9IGF3YWl0IHRoaXMuZXhlY3V0ZUphdmFTY3JpcHQoc2NyaXB0LCAnc2NlbmUnKTtcbiAgICAgICAgaWYgKG91dC5zdWNjZXNzICYmIG91dC5kYXRhICYmICdyZXN1bHQnIGluIG91dC5kYXRhKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICByZXN1bHQ6IG91dC5kYXRhLnJlc3VsdCxcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogJ1NjcmlwdCBleGVjdXRlZCBzdWNjZXNzZnVsbHknLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBvdXQ7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBjbGVhckNvbnNvbGUoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIE5vdGU6IEVkaXRvci5NZXNzYWdlLnNlbmQgbWF5IG5vdCByZXR1cm4gYSBwcm9taXNlIGluIGFsbCB2ZXJzaW9uc1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2Uuc2VuZCgnY29uc29sZScsICdjbGVhcicpO1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdDb25zb2xlIGNsZWFyZWQgc3VjY2Vzc2Z1bGx5J1xuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyLm1lc3NhZ2UgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZXhlY3V0ZUphdmFTY3JpcHQoY29kZTogc3RyaW5nLCBjb250ZXh0OiAnc2NlbmUnIHwgJ2VkaXRvcicpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBpZiAoY29udGV4dCA9PT0gJ3NjZW5lJykge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZXhlY3V0ZUluU2NlbmVDb250ZXh0KGNvZGUpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChjb250ZXh0ID09PSAnZWRpdG9yJykge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZXhlY3V0ZUluRWRpdG9yQ29udGV4dChjb2RlKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBVbmtub3duIGV4ZWN1dGVfamF2YXNjcmlwdCBjb250ZXh0OiAke2NvbnRleHR9YCB9O1xuICAgIH1cblxuICAgIHByaXZhdGUgZXhlY3V0ZUluU2NlbmVDb250ZXh0KGNvZGU6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnZXhlY3V0ZS1zY2VuZS1zY3JpcHQnLCB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2NvbnNvbGUnLFxuICAgICAgICAgICAgICAgIG1ldGhvZDogJ2V2YWwnLFxuICAgICAgICAgICAgICAgIGFyZ3M6IFtjb2RlXVxuICAgICAgICAgICAgfSkudGhlbigocmVzdWx0OiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29udGV4dDogJ3NjZW5lJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdDogcmVzdWx0LFxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiAnU2NlbmUgc2NyaXB0IGV4ZWN1dGVkIHN1Y2Nlc3NmdWxseSdcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBleGVjdXRlSW5FZGl0b3JDb250ZXh0KGNvZGU6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGlmICghaXNFZGl0b3JDb250ZXh0RXZhbEVuYWJsZWQoKSkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBlcnJvcjogJ0VkaXRvciBjb250ZXh0IGV2YWwgaXMgZGlzYWJsZWQuIEVuYWJsZSBgZW5hYmxlRWRpdG9yQ29udGV4dEV2YWxgIGluIE1DUCBzZXJ2ZXIgc2V0dGluZ3MgKHBhbmVsIFVJKSB0byBvcHQgaW4uIFRoaXMgZ3JhbnRzIEFJLWdlbmVyYXRlZCBjb2RlIGFjY2VzcyB0byBFZGl0b3IuTWVzc2FnZSArIE5vZGUgZnMgQVBJcyBpbiB0aGUgaG9zdCBwcm9jZXNzOyBvbmx5IGVuYWJsZSB3aGVuIHlvdSB0cnVzdCB0aGUgdXBzdHJlYW0gcHJvbXB0IHNvdXJjZS4nLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gV3JhcCBpbiBhc3luYyBJSUZFIHNvIEFJIGNhbiB1c2UgdG9wLWxldmVsIGF3YWl0IHRyYW5zcGFyZW50bHk7XG4gICAgICAgICAgICAvLyBhbHNvIGdpdmVzIHVzIGEgY2xlYW4gUHJvbWlzZS1iYXNlZCByZXR1cm4gcGF0aCByZWdhcmRsZXNzIG9mXG4gICAgICAgICAgICAvLyB3aGV0aGVyIHRoZSB1c2VyIGNvZGUgcmV0dXJucyBhIFByb21pc2Ugb3IgYSBzeW5jIHZhbHVlLlxuICAgICAgICAgICAgY29uc3Qgd3JhcHBlZCA9IGAoYXN5bmMgKCkgPT4geyAke2NvZGV9IFxcbiB9KSgpYDtcbiAgICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1ldmFsXG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCAoMCwgZXZhbCkod3JhcHBlZCk7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICBjb250ZXh0OiAnZWRpdG9yJyxcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0OiByZXN1bHQsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiAnRWRpdG9yIHNjcmlwdCBleGVjdXRlZCBzdWNjZXNzZnVsbHknLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgZXJyb3I6IGBFZGl0b3IgZXZhbCBmYWlsZWQ6ICR7ZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpfWAsXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnZXROb2RlVHJlZShyb290VXVpZD86IHN0cmluZywgbWF4RGVwdGg6IG51bWJlciA9IDEwKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBidWlsZFRyZWUgPSBhc3luYyAobm9kZVV1aWQ6IHN0cmluZywgZGVwdGg6IG51bWJlciA9IDApOiBQcm9taXNlPGFueT4gPT4ge1xuICAgICAgICAgICAgICAgIGlmIChkZXB0aCA+PSBtYXhEZXB0aCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4geyB0cnVuY2F0ZWQ6IHRydWUgfTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBub2RlRGF0YSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LW5vZGUnLCBub2RlVXVpZCk7XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICBjb25zdCB0cmVlID0ge1xuICAgICAgICAgICAgICAgICAgICAgICAgdXVpZDogbm9kZURhdGEudXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG5hbWU6IG5vZGVEYXRhLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBhY3RpdmU6IG5vZGVEYXRhLmFjdGl2ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudHM6IChub2RlRGF0YSBhcyBhbnkpLmNvbXBvbmVudHMgPyAobm9kZURhdGEgYXMgYW55KS5jb21wb25lbnRzLm1hcCgoYzogYW55KSA9PiBjLl9fdHlwZV9fKSA6IFtdLFxuICAgICAgICAgICAgICAgICAgICAgICAgY2hpbGRDb3VudDogbm9kZURhdGEuY2hpbGRyZW4gPyBub2RlRGF0YS5jaGlsZHJlbi5sZW5ndGggOiAwLFxuICAgICAgICAgICAgICAgICAgICAgICAgY2hpbGRyZW46IFtdIGFzIGFueVtdXG4gICAgICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKG5vZGVEYXRhLmNoaWxkcmVuICYmIG5vZGVEYXRhLmNoaWxkcmVuLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAoY29uc3QgY2hpbGRJZCBvZiBub2RlRGF0YS5jaGlsZHJlbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGNoaWxkVHJlZSA9IGF3YWl0IGJ1aWxkVHJlZShjaGlsZElkLCBkZXB0aCArIDEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRyZWUuY2hpbGRyZW4ucHVzaChjaGlsZFRyZWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRyZWU7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgZXJyb3I6IGVyci5tZXNzYWdlIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgaWYgKHJvb3RVdWlkKSB7XG4gICAgICAgICAgICAgICAgYnVpbGRUcmVlKHJvb3RVdWlkKS50aGVuKHRyZWUgPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogdHJlZSB9KTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktaGllcmFyY2h5JykudGhlbihhc3luYyAoaGllcmFyY2h5OiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdHJlZXMgPSBbXTtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChjb25zdCByb290Tm9kZSBvZiBoaWVyYXJjaHkuY2hpbGRyZW4pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHRyZWUgPSBhd2FpdCBidWlsZFRyZWUocm9vdE5vZGUudXVpZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB0cmVlcy5wdXNoKHRyZWUpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoeyBzdWNjZXNzOiB0cnVlLCBkYXRhOiB0cmVlcyB9KTtcbiAgICAgICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRQZXJmb3JtYW5jZVN0YXRzKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktcGVyZm9ybWFuY2UnKS50aGVuKChzdGF0czogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgcGVyZlN0YXRzOiBQZXJmb3JtYW5jZVN0YXRzID0ge1xuICAgICAgICAgICAgICAgICAgICBub2RlQ291bnQ6IHN0YXRzLm5vZGVDb3VudCB8fCAwLFxuICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRDb3VudDogc3RhdHMuY29tcG9uZW50Q291bnQgfHwgMCxcbiAgICAgICAgICAgICAgICAgICAgZHJhd0NhbGxzOiBzdGF0cy5kcmF3Q2FsbHMgfHwgMCxcbiAgICAgICAgICAgICAgICAgICAgdHJpYW5nbGVzOiBzdGF0cy50cmlhbmdsZXMgfHwgMCxcbiAgICAgICAgICAgICAgICAgICAgbWVtb3J5OiBzdGF0cy5tZW1vcnkgfHwge31cbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIHJlc29sdmUoeyBzdWNjZXNzOiB0cnVlLCBkYXRhOiBwZXJmU3RhdHMgfSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgLy8gRmFsbGJhY2sgdG8gYmFzaWMgc3RhdHNcbiAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogJ1BlcmZvcm1hbmNlIHN0YXRzIG5vdCBhdmFpbGFibGUgaW4gZWRpdCBtb2RlJ1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyB2YWxpZGF0ZVNjZW5lKG9wdGlvbnM6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IGlzc3VlczogVmFsaWRhdGlvbklzc3VlW10gPSBbXTtcblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gQ2hlY2sgZm9yIG1pc3NpbmcgYXNzZXRzXG4gICAgICAgICAgICBpZiAob3B0aW9ucy5jaGVja01pc3NpbmdBc3NldHMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBhc3NldENoZWNrID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnY2hlY2stbWlzc2luZy1hc3NldHMnKTtcbiAgICAgICAgICAgICAgICBpZiAoYXNzZXRDaGVjayAmJiBhc3NldENoZWNrLm1pc3NpbmcpIHtcbiAgICAgICAgICAgICAgICAgICAgaXNzdWVzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogJ2Vycm9yJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhdGVnb3J5OiAnYXNzZXRzJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBGb3VuZCAke2Fzc2V0Q2hlY2subWlzc2luZy5sZW5ndGh9IG1pc3NpbmcgYXNzZXQgcmVmZXJlbmNlc2AsXG4gICAgICAgICAgICAgICAgICAgICAgICBkZXRhaWxzOiBhc3NldENoZWNrLm1pc3NpbmdcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBDaGVjayBmb3IgcGVyZm9ybWFuY2UgaXNzdWVzXG4gICAgICAgICAgICBpZiAob3B0aW9ucy5jaGVja1BlcmZvcm1hbmNlKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgaGllcmFyY2h5ID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktaGllcmFyY2h5Jyk7XG4gICAgICAgICAgICAgICAgY29uc3Qgbm9kZUNvdW50ID0gdGhpcy5jb3VudE5vZGVzKGhpZXJhcmNoeS5jaGlsZHJlbik7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaWYgKG5vZGVDb3VudCA+IDEwMDApIHtcbiAgICAgICAgICAgICAgICAgICAgaXNzdWVzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogJ3dhcm5pbmcnLFxuICAgICAgICAgICAgICAgICAgICAgICAgY2F0ZWdvcnk6ICdwZXJmb3JtYW5jZScsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgSGlnaCBub2RlIGNvdW50OiAke25vZGVDb3VudH0gbm9kZXMgKHJlY29tbWVuZGVkIDwgMTAwMClgLFxuICAgICAgICAgICAgICAgICAgICAgICAgc3VnZ2VzdGlvbjogJ0NvbnNpZGVyIHVzaW5nIG9iamVjdCBwb29saW5nIG9yIHNjZW5lIG9wdGltaXphdGlvbidcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCByZXN1bHQ6IFZhbGlkYXRpb25SZXN1bHQgPSB7XG4gICAgICAgICAgICAgICAgdmFsaWQ6IGlzc3Vlcy5sZW5ndGggPT09IDAsXG4gICAgICAgICAgICAgICAgaXNzdWVDb3VudDogaXNzdWVzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICBpc3N1ZXM6IGlzc3Vlc1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogcmVzdWx0IH07XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVyci5tZXNzYWdlIH07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGNvdW50Tm9kZXMobm9kZXM6IGFueVtdKTogbnVtYmVyIHtcbiAgICAgICAgbGV0IGNvdW50ID0gbm9kZXMubGVuZ3RoO1xuICAgICAgICBmb3IgKGNvbnN0IG5vZGUgb2Ygbm9kZXMpIHtcbiAgICAgICAgICAgIGlmIChub2RlLmNoaWxkcmVuKSB7XG4gICAgICAgICAgICAgICAgY291bnQgKz0gdGhpcy5jb3VudE5vZGVzKG5vZGUuY2hpbGRyZW4pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBjb3VudDtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldEVkaXRvckluZm8oKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgaW5mbyA9IHtcbiAgICAgICAgICAgIGVkaXRvcjoge1xuICAgICAgICAgICAgICAgIHZlcnNpb246IChFZGl0b3IgYXMgYW55KS52ZXJzaW9ucz8uZWRpdG9yIHx8ICdVbmtub3duJyxcbiAgICAgICAgICAgICAgICBjb2Nvc1ZlcnNpb246IChFZGl0b3IgYXMgYW55KS52ZXJzaW9ucz8uY29jb3MgfHwgJ1Vua25vd24nLFxuICAgICAgICAgICAgICAgIHBsYXRmb3JtOiBwcm9jZXNzLnBsYXRmb3JtLFxuICAgICAgICAgICAgICAgIGFyY2g6IHByb2Nlc3MuYXJjaCxcbiAgICAgICAgICAgICAgICBub2RlVmVyc2lvbjogcHJvY2Vzcy52ZXJzaW9uXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgcHJvamVjdDoge1xuICAgICAgICAgICAgICAgIG5hbWU6IEVkaXRvci5Qcm9qZWN0Lm5hbWUsXG4gICAgICAgICAgICAgICAgcGF0aDogRWRpdG9yLlByb2plY3QucGF0aCxcbiAgICAgICAgICAgICAgICB1dWlkOiBFZGl0b3IuUHJvamVjdC51dWlkXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgbWVtb3J5OiBwcm9jZXNzLm1lbW9yeVVzYWdlKCksXG4gICAgICAgICAgICB1cHRpbWU6IHByb2Nlc3MudXB0aW1lKClcbiAgICAgICAgfTtcblxuICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBkYXRhOiBpbmZvIH07XG4gICAgfVxuXG4gICAgcHJpdmF0ZSByZXNvbHZlUHJvamVjdExvZ1BhdGgoKTogeyBwYXRoOiBzdHJpbmcgfSB8IHsgZXJyb3I6IHN0cmluZyB9IHtcbiAgICAgICAgaWYgKCFFZGl0b3IuUHJvamVjdCB8fCAhRWRpdG9yLlByb2plY3QucGF0aCkge1xuICAgICAgICAgICAgcmV0dXJuIHsgZXJyb3I6ICdFZGl0b3IuUHJvamVjdC5wYXRoIGlzIG5vdCBhdmFpbGFibGU7IGNhbm5vdCBsb2NhdGUgcHJvamVjdCBsb2cgZmlsZS4nIH07XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgbG9nUGF0aCA9IHBhdGguam9pbihFZGl0b3IuUHJvamVjdC5wYXRoLCAndGVtcC9sb2dzL3Byb2plY3QubG9nJyk7XG4gICAgICAgIGlmICghZnMuZXhpc3RzU3luYyhsb2dQYXRoKSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgZXJyb3I6IGBQcm9qZWN0IGxvZyBmaWxlIG5vdCBmb3VuZCBhdCAke2xvZ1BhdGh9YCB9O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7IHBhdGg6IGxvZ1BhdGggfTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldFByb2plY3RMb2dzKGxpbmVzOiBudW1iZXIgPSAxMDAsIGZpbHRlcktleXdvcmQ/OiBzdHJpbmcsIGxvZ0xldmVsOiBzdHJpbmcgPSAnQUxMJyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByZXNvbHZlZCA9IHRoaXMucmVzb2x2ZVByb2plY3RMb2dQYXRoKCk7XG4gICAgICAgICAgICBpZiAoJ2Vycm9yJyBpbiByZXNvbHZlZCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogcmVzb2x2ZWQuZXJyb3IgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGxvZ0ZpbGVQYXRoID0gcmVzb2x2ZWQucGF0aDtcblxuICAgICAgICAgICAgLy8gUmVhZCB0aGUgZmlsZSBjb250ZW50XG4gICAgICAgICAgICBjb25zdCBsb2dDb250ZW50ID0gZnMucmVhZEZpbGVTeW5jKGxvZ0ZpbGVQYXRoLCAndXRmOCcpO1xuICAgICAgICAgICAgY29uc3QgbG9nTGluZXMgPSBsb2dDb250ZW50LnNwbGl0KCdcXG4nKS5maWx0ZXIobGluZSA9PiBsaW5lLnRyaW0oKSAhPT0gJycpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBHZXQgdGhlIGxhc3QgTiBsaW5lc1xuICAgICAgICAgICAgY29uc3QgcmVjZW50TGluZXMgPSBsb2dMaW5lcy5zbGljZSgtbGluZXMpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBBcHBseSBmaWx0ZXJzXG4gICAgICAgICAgICBsZXQgZmlsdGVyZWRMaW5lcyA9IHJlY2VudExpbmVzO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBGaWx0ZXIgYnkgbG9nIGxldmVsIGlmIG5vdCAnQUxMJ1xuICAgICAgICAgICAgaWYgKGxvZ0xldmVsICE9PSAnQUxMJykge1xuICAgICAgICAgICAgICAgIGZpbHRlcmVkTGluZXMgPSBmaWx0ZXJlZExpbmVzLmZpbHRlcihsaW5lID0+IFxuICAgICAgICAgICAgICAgICAgICBsaW5lLmluY2x1ZGVzKGBbJHtsb2dMZXZlbH1dYCkgfHwgbGluZS5pbmNsdWRlcyhsb2dMZXZlbC50b0xvd2VyQ2FzZSgpKVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIEZpbHRlciBieSBrZXl3b3JkIGlmIHByb3ZpZGVkXG4gICAgICAgICAgICBpZiAoZmlsdGVyS2V5d29yZCkge1xuICAgICAgICAgICAgICAgIGZpbHRlcmVkTGluZXMgPSBmaWx0ZXJlZExpbmVzLmZpbHRlcihsaW5lID0+IFxuICAgICAgICAgICAgICAgICAgICBsaW5lLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoZmlsdGVyS2V5d29yZC50b0xvd2VyQ2FzZSgpKVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIHRvdGFsTGluZXM6IGxvZ0xpbmVzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgcmVxdWVzdGVkTGluZXM6IGxpbmVzLFxuICAgICAgICAgICAgICAgICAgICBmaWx0ZXJlZExpbmVzOiBmaWx0ZXJlZExpbmVzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgbG9nTGV2ZWw6IGxvZ0xldmVsLFxuICAgICAgICAgICAgICAgICAgICBmaWx0ZXJLZXl3b3JkOiBmaWx0ZXJLZXl3b3JkIHx8IG51bGwsXG4gICAgICAgICAgICAgICAgICAgIGxvZ3M6IGZpbHRlcmVkTGluZXMsXG4gICAgICAgICAgICAgICAgICAgIGxvZ0ZpbGVQYXRoOiBsb2dGaWxlUGF0aFxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgZXJyb3I6IGBGYWlsZWQgdG8gcmVhZCBwcm9qZWN0IGxvZ3M6ICR7ZXJyb3IubWVzc2FnZX1gXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRMb2dGaWxlSW5mbygpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcmVzb2x2ZWQgPSB0aGlzLnJlc29sdmVQcm9qZWN0TG9nUGF0aCgpO1xuICAgICAgICAgICAgaWYgKCdlcnJvcicgaW4gcmVzb2x2ZWQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHJlc29sdmVkLmVycm9yIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBsb2dGaWxlUGF0aCA9IHJlc29sdmVkLnBhdGg7XG5cbiAgICAgICAgICAgIGNvbnN0IHN0YXRzID0gZnMuc3RhdFN5bmMobG9nRmlsZVBhdGgpO1xuICAgICAgICAgICAgY29uc3QgbG9nQ29udGVudCA9IGZzLnJlYWRGaWxlU3luYyhsb2dGaWxlUGF0aCwgJ3V0ZjgnKTtcbiAgICAgICAgICAgIGNvbnN0IGxpbmVDb3VudCA9IGxvZ0NvbnRlbnQuc3BsaXQoJ1xcbicpLmZpbHRlcihsaW5lID0+IGxpbmUudHJpbSgpICE9PSAnJykubGVuZ3RoO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICBmaWxlUGF0aDogbG9nRmlsZVBhdGgsXG4gICAgICAgICAgICAgICAgICAgIGZpbGVTaXplOiBzdGF0cy5zaXplLFxuICAgICAgICAgICAgICAgICAgICBmaWxlU2l6ZUZvcm1hdHRlZDogdGhpcy5mb3JtYXRGaWxlU2l6ZShzdGF0cy5zaXplKSxcbiAgICAgICAgICAgICAgICAgICAgbGFzdE1vZGlmaWVkOiBzdGF0cy5tdGltZS50b0lTT1N0cmluZygpLFxuICAgICAgICAgICAgICAgICAgICBsaW5lQ291bnQ6IGxpbmVDb3VudCxcbiAgICAgICAgICAgICAgICAgICAgY3JlYXRlZDogc3RhdHMuYmlydGh0aW1lLnRvSVNPU3RyaW5nKCksXG4gICAgICAgICAgICAgICAgICAgIGFjY2Vzc2libGU6IGZzLmNvbnN0YW50cy5SX09LXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBlcnJvcjogYEZhaWxlZCB0byBnZXQgbG9nIGZpbGUgaW5mbzogJHtlcnJvci5tZXNzYWdlfWBcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHNlYXJjaFByb2plY3RMb2dzKHBhdHRlcm46IHN0cmluZywgbWF4UmVzdWx0czogbnVtYmVyID0gMjAsIGNvbnRleHRMaW5lczogbnVtYmVyID0gMik6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByZXNvbHZlZCA9IHRoaXMucmVzb2x2ZVByb2plY3RMb2dQYXRoKCk7XG4gICAgICAgICAgICBpZiAoJ2Vycm9yJyBpbiByZXNvbHZlZCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogcmVzb2x2ZWQuZXJyb3IgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGxvZ0ZpbGVQYXRoID0gcmVzb2x2ZWQucGF0aDtcblxuICAgICAgICAgICAgY29uc3QgbG9nQ29udGVudCA9IGZzLnJlYWRGaWxlU3luYyhsb2dGaWxlUGF0aCwgJ3V0ZjgnKTtcbiAgICAgICAgICAgIGNvbnN0IGxvZ0xpbmVzID0gbG9nQ29udGVudC5zcGxpdCgnXFxuJyk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIENyZWF0ZSByZWdleCBwYXR0ZXJuIChzdXBwb3J0IGJvdGggc3RyaW5nIGFuZCByZWdleCBwYXR0ZXJucylcbiAgICAgICAgICAgIGxldCByZWdleDogUmVnRXhwO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICByZWdleCA9IG5ldyBSZWdFeHAocGF0dGVybiwgJ2dpJyk7XG4gICAgICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgICAgICAvLyBJZiBwYXR0ZXJuIGlzIG5vdCB2YWxpZCByZWdleCwgdHJlYXQgYXMgbGl0ZXJhbCBzdHJpbmdcbiAgICAgICAgICAgICAgICByZWdleCA9IG5ldyBSZWdFeHAocGF0dGVybi5yZXBsYWNlKC9bLiorP14ke30oKXxbXFxdXFxcXF0vZywgJ1xcXFwkJicpLCAnZ2knKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgY29uc3QgbWF0Y2hlczogYW55W10gPSBbXTtcbiAgICAgICAgICAgIGxldCByZXN1bHRDb3VudCA9IDA7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbG9nTGluZXMubGVuZ3RoICYmIHJlc3VsdENvdW50IDwgbWF4UmVzdWx0czsgaSsrKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgbGluZSA9IGxvZ0xpbmVzW2ldO1xuICAgICAgICAgICAgICAgIGlmIChyZWdleC50ZXN0KGxpbmUpKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIEdldCBjb250ZXh0IGxpbmVzXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbnRleHRTdGFydCA9IE1hdGgubWF4KDAsIGkgLSBjb250ZXh0TGluZXMpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjb250ZXh0RW5kID0gTWF0aC5taW4obG9nTGluZXMubGVuZ3RoIC0gMSwgaSArIGNvbnRleHRMaW5lcyk7XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICBjb25zdCBjb250ZXh0TGluZXNBcnJheSA9IFtdO1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGxldCBqID0gY29udGV4dFN0YXJ0OyBqIDw9IGNvbnRleHRFbmQ7IGorKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29udGV4dExpbmVzQXJyYXkucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbGluZU51bWJlcjogaiArIDEsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29udGVudDogbG9nTGluZXNbal0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaXNNYXRjaDogaiA9PT0gaVxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIG1hdGNoZXMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgICAgICBsaW5lTnVtYmVyOiBpICsgMSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1hdGNoZWRMaW5lOiBsaW5lLFxuICAgICAgICAgICAgICAgICAgICAgICAgY29udGV4dDogY29udGV4dExpbmVzQXJyYXlcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICByZXN1bHRDb3VudCsrO1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgLy8gUmVzZXQgcmVnZXggbGFzdEluZGV4IGZvciBnbG9iYWwgc2VhcmNoXG4gICAgICAgICAgICAgICAgICAgIHJlZ2V4Lmxhc3RJbmRleCA9IDA7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICBwYXR0ZXJuOiBwYXR0ZXJuLFxuICAgICAgICAgICAgICAgICAgICB0b3RhbE1hdGNoZXM6IG1hdGNoZXMubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICBtYXhSZXN1bHRzOiBtYXhSZXN1bHRzLFxuICAgICAgICAgICAgICAgICAgICBjb250ZXh0TGluZXM6IGNvbnRleHRMaW5lcyxcbiAgICAgICAgICAgICAgICAgICAgbG9nRmlsZVBhdGg6IGxvZ0ZpbGVQYXRoLFxuICAgICAgICAgICAgICAgICAgICBtYXRjaGVzOiBtYXRjaGVzXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBlcnJvcjogYEZhaWxlZCB0byBzZWFyY2ggcHJvamVjdCBsb2dzOiAke2Vycm9yLm1lc3NhZ2V9YFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgZm9ybWF0RmlsZVNpemUoYnl0ZXM6IG51bWJlcik6IHN0cmluZyB7XG4gICAgICAgIGNvbnN0IHVuaXRzID0gWydCJywgJ0tCJywgJ01CJywgJ0dCJ107XG4gICAgICAgIGxldCBzaXplID0gYnl0ZXM7XG4gICAgICAgIGxldCB1bml0SW5kZXggPSAwO1xuXG4gICAgICAgIHdoaWxlIChzaXplID49IDEwMjQgJiYgdW5pdEluZGV4IDwgdW5pdHMubGVuZ3RoIC0gMSkge1xuICAgICAgICAgICAgc2l6ZSAvPSAxMDI0O1xuICAgICAgICAgICAgdW5pdEluZGV4Kys7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gYCR7c2l6ZS50b0ZpeGVkKDIpfSAke3VuaXRzW3VuaXRJbmRleF19YDtcbiAgICB9XG5cbiAgICBwcml2YXRlIHBpY2tXaW5kb3codGl0bGVTdWJzdHJpbmc/OiBzdHJpbmcpOiBhbnkge1xuICAgICAgICAvLyBMYXp5IHJlcXVpcmUgc28gdGhhdCBub24tRWxlY3Ryb24gY29udGV4dHMgKGUuZy4gdW5pdCB0ZXN0cywgc21va2VcbiAgICAgICAgLy8gc2NyaXB0IHdpdGggc3R1YiByZWdpc3RyeSkgY2FuIHN0aWxsIGltcG9ydCB0aGlzIG1vZHVsZS5cbiAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby12YXItcmVxdWlyZXNcbiAgICAgICAgY29uc3QgZWxlY3Ryb24gPSByZXF1aXJlKCdlbGVjdHJvbicpO1xuICAgICAgICBjb25zdCBCVyA9IGVsZWN0cm9uLkJyb3dzZXJXaW5kb3c7XG4gICAgICAgIGlmICghQlcpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignRWxlY3Ryb24gQnJvd3NlcldpbmRvdyBBUEkgdW5hdmFpbGFibGU7IHNjcmVlbnNob3QgdG9vbCByZXF1aXJlcyBydW5uaW5nIGluc2lkZSBDb2NvcyBlZGl0b3IgaG9zdCBwcm9jZXNzLicpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aXRsZVN1YnN0cmluZykge1xuICAgICAgICAgICAgY29uc3QgbWF0Y2hlcyA9IEJXLmdldEFsbFdpbmRvd3MoKS5maWx0ZXIoKHc6IGFueSkgPT5cbiAgICAgICAgICAgICAgICB3ICYmICF3LmlzRGVzdHJveWVkKCkgJiYgKHcuZ2V0VGl0bGU/LigpIHx8ICcnKS5pbmNsdWRlcyh0aXRsZVN1YnN0cmluZykpO1xuICAgICAgICAgICAgaWYgKG1hdGNoZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBObyBFbGVjdHJvbiB3aW5kb3cgdGl0bGUgbWF0Y2hlZCBzdWJzdHJpbmc6ICR7dGl0bGVTdWJzdHJpbmd9YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gbWF0Y2hlc1swXTtcbiAgICAgICAgfVxuICAgICAgICAvLyB2Mi4zLjEgcmV2aWV3IGZpeDogZm9jdXNlZCB3aW5kb3cgbWF5IGJlIGEgdHJhbnNpZW50IHByZXZpZXcgcG9wdXAuXG4gICAgICAgIC8vIFByZWZlciBhIG5vbi1QcmV2aWV3IHdpbmRvdyBzbyBkZWZhdWx0IHNjcmVlbnNob3RzIHRhcmdldCB0aGUgbWFpblxuICAgICAgICAvLyBlZGl0b3Igc3VyZmFjZS4gQ2FsbGVyIGNhbiBzdGlsbCBwYXNzIHRpdGxlU3Vic3RyaW5nPSdQcmV2aWV3JyB0b1xuICAgICAgICAvLyBleHBsaWNpdGx5IHRhcmdldCB0aGUgcHJldmlldyB3aGVuIHdhbnRlZC5cbiAgICAgICAgY29uc3QgYWxsOiBhbnlbXSA9IEJXLmdldEFsbFdpbmRvd3MoKS5maWx0ZXIoKHc6IGFueSkgPT4gdyAmJiAhdy5pc0Rlc3Ryb3llZCgpKTtcbiAgICAgICAgaWYgKGFsbC5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignTm8gbGl2ZSBFbGVjdHJvbiB3aW5kb3dzOyBjYW5ub3QgY2FwdHVyZSBzY3JlZW5zaG90LicpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGlzUHJldmlldyA9ICh3OiBhbnkpID0+IC9wcmV2aWV3L2kudGVzdCh3LmdldFRpdGxlPy4oKSB8fCAnJyk7XG4gICAgICAgIGNvbnN0IG5vblByZXZpZXcgPSBhbGwuZmlsdGVyKCh3OiBhbnkpID0+ICFpc1ByZXZpZXcodykpO1xuICAgICAgICBjb25zdCBmb2N1c2VkID0gQlcuZ2V0Rm9jdXNlZFdpbmRvdz8uKCk7XG4gICAgICAgIGlmIChmb2N1c2VkICYmICFmb2N1c2VkLmlzRGVzdHJveWVkKCkgJiYgIWlzUHJldmlldyhmb2N1c2VkKSkgcmV0dXJuIGZvY3VzZWQ7XG4gICAgICAgIGlmIChub25QcmV2aWV3Lmxlbmd0aCA+IDApIHJldHVybiBub25QcmV2aWV3WzBdO1xuICAgICAgICByZXR1cm4gYWxsWzBdO1xuICAgIH1cblxuICAgIHByaXZhdGUgZW5zdXJlQ2FwdHVyZURpcigpOiB7IG9rOiB0cnVlOyBkaXI6IHN0cmluZyB9IHwgeyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmcgfSB7XG4gICAgICAgIGlmICghRWRpdG9yLlByb2plY3QgfHwgIUVkaXRvci5Qcm9qZWN0LnBhdGgpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6ICdFZGl0b3IuUHJvamVjdC5wYXRoIGlzIG5vdCBhdmFpbGFibGU7IGNhbm5vdCByZXNvbHZlIGNhcHR1cmUgb3V0cHV0IGRpcmVjdG9yeS4nIH07XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZGlyID0gcGF0aC5qb2luKEVkaXRvci5Qcm9qZWN0LnBhdGgsICd0ZW1wJywgJ21jcC1jYXB0dXJlcycpO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgZnMubWtkaXJTeW5jKGRpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gICAgICAgICAgICByZXR1cm4geyBvazogdHJ1ZSwgZGlyIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBgRmFpbGVkIHRvIGNyZWF0ZSBjYXB0dXJlIGRpcjogJHtlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycil9YCB9O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gdjIuOC4wIFQtVjI4LTIgKGNhcnJ5b3ZlciBmcm9tIHYyLjcuMCBDb2RleCBzaW5nbGUtcmV2aWV3ZXIg8J+foSlcbiAgICAvLyDihpIgdjIuOC4xIHJvdW5kLTEgZml4IChDb2RleCDwn5S0ICsgQ2xhdWRlIPCfn6EpOiB0aGUgdjIuOC4wIGhlbHBlclxuICAgIC8vIHJlYWxwYXRoJ2QgYGRpcmAgYW5kIGBwYXRoLmRpcm5hbWUocGF0aC5qb2luKGRpciwgYmFzZW5hbWUpKWAgYW5kXG4gICAgLy8gY29tcGFyZWQgdGhlIHR3byDigJQgYnV0IHdpdGggYSBmaXhlZCBiYXNlbmFtZSB0aG9zZSBleHByZXNzaW9ucyBib3RoXG4gICAgLy8gY29sbGFwc2UgdG8gYGRpcmAsIG1ha2luZyB0aGUgZXF1YWxpdHkgY2hlY2sgdGF1dG9sb2dpY2FsLiBUaGUgY2hlY2tcbiAgICAvLyBwcm90ZWN0ZWQgbm90aGluZyBpZiBgPHByb2plY3Q+L3RlbXAvbWNwLWNhcHR1cmVzYCBpdHNlbGYgd2FzIGFcbiAgICAvLyBzeW1saW5rIHRoYXQgZXNjYXBlcyB0aGUgcHJvamVjdCB0cmVlLlxuICAgIC8vXG4gICAgLy8gVHJ1ZSBlc2NhcGUgcHJvdGVjdGlvbiByZXF1aXJlcyBhbmNob3JpbmcgYWdhaW5zdCB0aGUgcHJvamVjdCByb290LlxuICAgIC8vIFdlIG5vdyByZWFscGF0aCBCT1RIIHRoZSBjYXB0dXJlIGRpciBhbmQgYEVkaXRvci5Qcm9qZWN0LnBhdGhgIGFuZFxuICAgIC8vIHJlcXVpcmUgdGhlIHJlc29sdmVkIGNhcHR1cmUgZGlyIHRvIGJlIGluc2lkZSB0aGUgcmVzb2x2ZWQgcHJvamVjdFxuICAgIC8vIHJvb3QgKGVxdWFsaXR5IE9SIGByZWFsRGlyLnN0YXJ0c1dpdGgocmVhbFByb2plY3RSb290ICsgc2VwKWApLlxuICAgIC8vIFRoZSBpbnRyYS1kaXIgY2hlY2sgaXMga2VwdCBmb3IgY2hlYXAgZGVmZW5zZS1pbi1kZXB0aCBpbiBjYXNlIGFcbiAgICAvLyBmdXR1cmUgYmFzZW5hbWUgZ2V0cyB0cmF2ZXJzYWwgY2hhcmFjdGVycyB0aHJlYWRlZCB0aHJvdWdoLlxuICAgIC8vXG4gICAgLy8gUmV0dXJucyB7IG9rOiB0cnVlLCBmaWxlUGF0aCwgZGlyIH0gd2hlbiBzYWZlIHRvIHdyaXRlLCBvclxuICAgIC8vIHsgb2s6IGZhbHNlLCBlcnJvciB9IHdpdGggdGhlIHNhbWUgZXJyb3IgZW52ZWxvcGUgc2hhcGUgYXNcbiAgICAvLyBlbnN1cmVDYXB0dXJlRGlyIHNvIGNhbGxlcnMgY2FuIGZhbGwgdGhyb3VnaCB0aGVpciBleGlzdGluZ1xuICAgIC8vIGVycm9yLXJldHVybiBwYXR0ZXJuLlxuICAgIHByaXZhdGUgcmVzb2x2ZUF1dG9DYXB0dXJlRmlsZShiYXNlbmFtZTogc3RyaW5nKTogeyBvazogdHJ1ZTsgZmlsZVBhdGg6IHN0cmluZzsgZGlyOiBzdHJpbmcgfSB8IHsgb2s6IGZhbHNlOyBlcnJvcjogc3RyaW5nIH0ge1xuICAgICAgICBjb25zdCBkaXJSZXN1bHQgPSB0aGlzLmVuc3VyZUNhcHR1cmVEaXIoKTtcbiAgICAgICAgaWYgKCFkaXJSZXN1bHQub2spIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGRpclJlc3VsdC5lcnJvciB9O1xuICAgICAgICBjb25zdCBwcm9qZWN0UGF0aDogc3RyaW5nIHwgdW5kZWZpbmVkID0gRWRpdG9yPy5Qcm9qZWN0Py5wYXRoO1xuICAgICAgICBpZiAoIXByb2plY3RQYXRoKSB7XG4gICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiAnRWRpdG9yLlByb2plY3QucGF0aCBpcyBub3QgYXZhaWxhYmxlOyBjYW5ub3QgYW5jaG9yIGNhcHR1cmUtZGlyIGNvbnRhaW5tZW50IGNoZWNrLicgfTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBmaWxlUGF0aCA9IHBhdGguam9pbihkaXJSZXN1bHQuZGlyLCBiYXNlbmFtZSk7XG4gICAgICAgIGxldCByZWFsRGlyOiBzdHJpbmc7XG4gICAgICAgIGxldCByZWFsUGFyZW50OiBzdHJpbmc7XG4gICAgICAgIGxldCByZWFsUHJvamVjdFJvb3Q6IHN0cmluZztcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJwOiBhbnkgPSBmcy5yZWFscGF0aFN5bmMgYXMgYW55O1xuICAgICAgICAgICAgY29uc3QgcmVzb2x2ZVJlYWwgPSBycC5uYXRpdmUgPz8gcnA7XG4gICAgICAgICAgICByZWFsRGlyID0gcmVzb2x2ZVJlYWwoZGlyUmVzdWx0LmRpcik7XG4gICAgICAgICAgICByZWFsUGFyZW50ID0gcmVzb2x2ZVJlYWwocGF0aC5kaXJuYW1lKGZpbGVQYXRoKSk7XG4gICAgICAgICAgICByZWFsUHJvamVjdFJvb3QgPSByZXNvbHZlUmVhbChwcm9qZWN0UGF0aCk7XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBgc2NyZWVuc2hvdCBwYXRoIHJlYWxwYXRoIGZhaWxlZDogJHtlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycil9YCB9O1xuICAgICAgICB9XG4gICAgICAgIC8vIERlZmVuc2UtaW4tZGVwdGg6IHBhcmVudCBvZiB0aGUgcmVzb2x2ZWQgZmlsZSBtdXN0IGVxdWFsIHRoZVxuICAgICAgICAvLyByZXNvbHZlZCBjYXB0dXJlIGRpciAoY2F0Y2hlcyBmdXR1cmUgYmFzZW5hbWVzIHRocmVhZGluZyBgLi5gKS5cbiAgICAgICAgaWYgKHBhdGgucmVzb2x2ZShyZWFsUGFyZW50KSAhPT0gcGF0aC5yZXNvbHZlKHJlYWxEaXIpKSB7XG4gICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiAnc2NyZWVuc2hvdCBzYXZlIHBhdGggcmVzb2x2ZWQgb3V0c2lkZSB0aGUgY2FwdHVyZSBkaXJlY3RvcnknIH07XG4gICAgICAgIH1cbiAgICAgICAgLy8gUHJpbWFyeSBwcm90ZWN0aW9uOiBjYXB0dXJlIGRpciBpdHNlbGYgbXVzdCByZXNvbHZlIGluc2lkZSB0aGVcbiAgICAgICAgLy8gcHJvamVjdCByb290LCBzbyBhIHN5bWxpbmsgY2hhaW4gb24gYHRlbXAvbWNwLWNhcHR1cmVzYCBjYW5ub3RcbiAgICAgICAgLy8gcGl2b3Qgd3JpdGVzIHRvIGUuZy4gL2V0YyBvciBDOlxcV2luZG93cy5cbiAgICAgICAgLy8gdjIuOS54IHBvbGlzaCAoQ29kZXggcjIgc2luZ2xlLfCfn6EgZnJvbSB2Mi44LjEgcmV2aWV3KTogdXNlXG4gICAgICAgIC8vIHBhdGgucmVsYXRpdmUgaW5zdGVhZCBvZiBgcm9vdCArIHBhdGguc2VwYCBwcmVmaXggY2hlY2sg4oCUXG4gICAgICAgIC8vIHdoZW4gcm9vdCBpcyBhIGRyaXZlIHJvb3QgKGBDOlxcYCksIHBhdGgucmVzb2x2ZSBub3JtYWxpc2VzIGl0XG4gICAgICAgIC8vIHRvIGBDOlxcXFxgIGFuZCBgcGF0aC5zZXBgIGFkZHMgYW5vdGhlciBgXFxgLCBwcm9kdWNpbmcgYEM6XFxcXFxcXFxgXG4gICAgICAgIC8vIHdoaWNoIGEgY2FuZGlkYXRlIGxpa2UgYEM6XFxcXGZvb2AgZG9lcyBub3QgbWF0Y2guIHBhdGgucmVsYXRpdmVcbiAgICAgICAgLy8gYWxzbyBoYW5kbGVzIHRoZSBDOlxcZm9vIHZzIEM6XFxmb29iYXIgcHJlZml4LWNvbGxpc2lvbiBjYXNlLlxuICAgICAgICBpZiAoIWlzUGF0aFdpdGhpblJvb3QocmVhbERpciwgcmVhbFByb2plY3RSb290KSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogYGNhcHR1cmUgZGlyIHJlc29sdmVkIG91dHNpZGUgdGhlIHByb2plY3Qgcm9vdDogJHtwYXRoLnJlc29sdmUocmVhbERpcil9IG5vdCB3aXRoaW4gJHtwYXRoLnJlc29sdmUocmVhbFByb2plY3RSb290KX1gIH07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUsIGZpbGVQYXRoLCBkaXI6IGRpclJlc3VsdC5kaXIgfTtcbiAgICB9XG5cbiAgICAvLyB2Mi44LjEgcm91bmQtMSBmaXggKEdlbWluaSDwn5S0ICsgQ29kZXgg8J+foSk6IHdoZW4gY2FsbGVyIHBhc3NlcyBhblxuICAgIC8vIGV4cGxpY2l0IHNhdmVQYXRoIC8gc2F2ZVBhdGhQcmVmaXgsIHdlIHN0aWxsIG5lZWQgdGhlIHNhbWUgcHJvamVjdC1cbiAgICAvLyByb290IGNvbnRhaW5tZW50IGd1YXJhbnRlZSB0aGF0IHJlc29sdmVBdXRvQ2FwdHVyZUZpbGUgZ2l2ZXMgdGhlXG4gICAgLy8gYXV0by1uYW1lZCBicmFuY2guIEFJLWdlbmVyYXRlZCBhYnNvbHV0ZSBwYXRocyBjb3VsZCBvdGhlcndpc2VcbiAgICAvLyB3cml0ZSBvdXRzaWRlIHRoZSBwcm9qZWN0IHJvb3QuXG4gICAgLy9cbiAgICAvLyBUaGUgY2hlY2sgcmVzb2x2ZXMgdGhlIHBhcmVudCBkaXJlY3RvcnkgKHRoZSBmaWxlIGl0c2VsZiBtYXkgbm90XG4gICAgLy8gZXhpc3QgeWV0KSBhbmQgcmVxdWlyZXMgaXQgdG8gYmUgaW5zaWRlIGByZWFscGF0aChFZGl0b3IuUHJvamVjdC5wYXRoKWAuXG4gICAgcHJpdmF0ZSBhc3NlcnRTYXZlUGF0aFdpdGhpblByb2plY3Qoc2F2ZVBhdGg6IHN0cmluZyk6IHsgb2s6IHRydWU7IHJlc29sdmVkUGF0aDogc3RyaW5nIH0gfCB7IG9rOiBmYWxzZTsgZXJyb3I6IHN0cmluZyB9IHtcbiAgICAgICAgY29uc3QgcHJvamVjdFBhdGg6IHN0cmluZyB8IHVuZGVmaW5lZCA9IEVkaXRvcj8uUHJvamVjdD8ucGF0aDtcbiAgICAgICAgaWYgKCFwcm9qZWN0UGF0aCkge1xuICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogJ0VkaXRvci5Qcm9qZWN0LnBhdGggaXMgbm90IGF2YWlsYWJsZTsgY2Fubm90IHZhbGlkYXRlIGV4cGxpY2l0IHNhdmVQYXRoLicgfTtcbiAgICAgICAgfVxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcnA6IGFueSA9IGZzLnJlYWxwYXRoU3luYyBhcyBhbnk7XG4gICAgICAgICAgICBjb25zdCByZXNvbHZlUmVhbCA9IHJwLm5hdGl2ZSA/PyBycDtcbiAgICAgICAgICAgIGNvbnN0IHJlYWxQcm9qZWN0Um9vdCA9IHJlc29sdmVSZWFsKHByb2plY3RQYXRoKTtcbiAgICAgICAgICAgIC8vIHYyLjguMiByZXRlc3QgZml4IChDb2RleCByMiDwn5+hICMxKTogYSByZWxhdGl2ZSBzYXZlUGF0aCB3b3VsZFxuICAgICAgICAgICAgLy8gbWFrZSBgcGF0aC5kaXJuYW1lKHNhdmVQYXRoKWAgY29sbGFwc2UgdG8gJy4nIGFuZCByZXNvbHZlIHRvXG4gICAgICAgICAgICAvLyB0aGUgaG9zdCBwcm9jZXNzIGN3ZCAob2Z0ZW4gYDxlZGl0b3ItaW5zdGFsbD4vQ29jb3NEYXNoYm9hcmRgKVxuICAgICAgICAgICAgLy8gcmF0aGVyIHRoYW4gdGhlIHByb2plY3Qgcm9vdC4gQW5jaG9yIHJlbGF0aXZlIHBhdGhzIGFnYWluc3RcbiAgICAgICAgICAgIC8vIHRoZSBwcm9qZWN0IHJvb3QgZXhwbGljaXRseSBzbyB0aGUgQUkncyBpbnR1aXRpdmUgXCJyZWxhdGl2ZVxuICAgICAgICAgICAgLy8gdG8gbXkgcHJvamVjdFwiIGludGVycHJldGF0aW9uIGlzIHdoYXQgdGhlIGNoZWNrIGVuZm9yY2VzLlxuICAgICAgICAgICAgY29uc3QgYWJzb2x1dGVTYXZlUGF0aCA9IHBhdGguaXNBYnNvbHV0ZShzYXZlUGF0aClcbiAgICAgICAgICAgICAgICA/IHNhdmVQYXRoXG4gICAgICAgICAgICAgICAgOiBwYXRoLnJlc29sdmUocHJvamVjdFBhdGgsIHNhdmVQYXRoKTtcbiAgICAgICAgICAgIGNvbnN0IHBhcmVudCA9IHBhdGguZGlybmFtZShhYnNvbHV0ZVNhdmVQYXRoKTtcbiAgICAgICAgICAgIC8vIFBhcmVudCBtdXN0IGFscmVhZHkgZXhpc3QgZm9yIHJlYWxwYXRoOyBpZiBpdCBkb2Vzbid0LCB0aGVcbiAgICAgICAgICAgIC8vIHdyaXRlIHdvdWxkIGZhaWwgYW55d2F5LCBidXQgcmV0dXJuIGEgY2xlYXJlciBlcnJvciBoZXJlLlxuICAgICAgICAgICAgbGV0IHJlYWxQYXJlbnQ6IHN0cmluZztcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgcmVhbFBhcmVudCA9IHJlc29sdmVSZWFsKHBhcmVudCk7XG4gICAgICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGBzYXZlUGF0aCBwYXJlbnQgZGlyIG1pc3Npbmcgb3IgdW5yZWFkYWJsZTogJHtlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycil9YCB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gdjIuOS54IHBvbGlzaCAoQ29kZXggcjIgc2luZ2xlLfCfn6EgZnJvbSB2Mi44LjEgcmV2aWV3KTogc2FtZVxuICAgICAgICAgICAgLy8gcGF0aC5yZWxhdGl2ZS1iYXNlZCBjb250YWlubWVudCBhcyByZXNvbHZlQXV0b0NhcHR1cmVGaWxlLlxuICAgICAgICAgICAgaWYgKCFpc1BhdGhXaXRoaW5Sb290KHJlYWxQYXJlbnQsIHJlYWxQcm9qZWN0Um9vdCkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICBvazogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIGVycm9yOiBgc2F2ZVBhdGggcmVzb2x2ZWQgb3V0c2lkZSB0aGUgcHJvamVjdCByb290OiAke3BhdGgucmVzb2x2ZShyZWFsUGFyZW50KX0gbm90IHdpdGhpbiAke3BhdGgucmVzb2x2ZShyZWFsUHJvamVjdFJvb3QpfS4gVXNlIGEgcGF0aCBpbnNpZGUgPHByb2plY3Q+LyBvciBvbWl0IHNhdmVQYXRoIHRvIGF1dG8tbmFtZSBpbnRvIDxwcm9qZWN0Pi90ZW1wL21jcC1jYXB0dXJlcy5gLFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4geyBvazogdHJ1ZSwgcmVzb2x2ZWRQYXRoOiBhYnNvbHV0ZVNhdmVQYXRoIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBgc2F2ZVBhdGggcmVhbHBhdGggZmFpbGVkOiAke2Vycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKX1gIH07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHNjcmVlbnNob3Qoc2F2ZVBhdGg/OiBzdHJpbmcsIHdpbmRvd1RpdGxlPzogc3RyaW5nLCBpbmNsdWRlQmFzZTY0OiBib29sZWFuID0gZmFsc2UpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgbGV0IGZpbGVQYXRoID0gc2F2ZVBhdGg7XG4gICAgICAgICAgICBpZiAoIWZpbGVQYXRoKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVzb2x2ZWQgPSB0aGlzLnJlc29sdmVBdXRvQ2FwdHVyZUZpbGUoYHNjcmVlbnNob3QtJHtEYXRlLm5vdygpfS5wbmdgKTtcbiAgICAgICAgICAgICAgICBpZiAoIXJlc29sdmVkLm9rKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHJlc29sdmVkLmVycm9yIH07XG4gICAgICAgICAgICAgICAgZmlsZVBhdGggPSByZXNvbHZlZC5maWxlUGF0aDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gdjIuOC4xIHJvdW5kLTEgZml4IChHZW1pbmkg8J+UtCArIENvZGV4IPCfn6EpOiBleHBsaWNpdCBzYXZlUGF0aFxuICAgICAgICAgICAgICAgIC8vIGFsc28gZ2V0cyBjb250YWlubWVudC1jaGVja2VkLiBBSS1nZW5lcmF0ZWQgcGF0aHMgY291bGRcbiAgICAgICAgICAgICAgICAvLyBvdGhlcndpc2Ugd3JpdGUgb3V0c2lkZSB0aGUgcHJvamVjdCByb290LlxuICAgICAgICAgICAgICAgIC8vIHYyLjguMiByZXRlc3QgZml4OiB1c2UgdGhlIGhlbHBlcidzIHJlc29sdmVkUGF0aCBzbyBhXG4gICAgICAgICAgICAgICAgLy8gcmVsYXRpdmUgc2F2ZVBhdGggYWN0dWFsbHkgbGFuZHMgaW5zaWRlIHRoZSBwcm9qZWN0IHJvb3QuXG4gICAgICAgICAgICAgICAgY29uc3QgZ3VhcmQgPSB0aGlzLmFzc2VydFNhdmVQYXRoV2l0aGluUHJvamVjdChmaWxlUGF0aCk7XG4gICAgICAgICAgICAgICAgaWYgKCFndWFyZC5vaykgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBndWFyZC5lcnJvciB9O1xuICAgICAgICAgICAgICAgIGZpbGVQYXRoID0gZ3VhcmQucmVzb2x2ZWRQYXRoO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3Qgd2luID0gdGhpcy5waWNrV2luZG93KHdpbmRvd1RpdGxlKTtcbiAgICAgICAgICAgIGNvbnN0IGltYWdlID0gYXdhaXQgd2luLndlYkNvbnRlbnRzLmNhcHR1cmVQYWdlKCk7XG4gICAgICAgICAgICBjb25zdCBwbmc6IEJ1ZmZlciA9IGltYWdlLnRvUE5HKCk7XG4gICAgICAgICAgICBmcy53cml0ZUZpbGVTeW5jKGZpbGVQYXRoLCBwbmcpO1xuICAgICAgICAgICAgY29uc3QgZGF0YTogYW55ID0ge1xuICAgICAgICAgICAgICAgIGZpbGVQYXRoLFxuICAgICAgICAgICAgICAgIHNpemU6IHBuZy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgd2luZG93VGl0bGU6IHR5cGVvZiB3aW4uZ2V0VGl0bGUgPT09ICdmdW5jdGlvbicgPyB3aW4uZ2V0VGl0bGUoKSA6ICcnLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGlmIChpbmNsdWRlQmFzZTY0KSB7XG4gICAgICAgICAgICAgICAgZGF0YS5kYXRhVXJpID0gYGRhdGE6aW1hZ2UvcG5nO2Jhc2U2NCwke3BuZy50b1N0cmluZygnYmFzZTY0Jyl9YDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGEsIG1lc3NhZ2U6IGBTY3JlZW5zaG90IHNhdmVkIHRvICR7ZmlsZVBhdGh9YCB9O1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycikgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIHYyLjcuMCAjNDogUHJldmlldy13aW5kb3cgc2NyZWVuc2hvdC5cbiAgICAvLyB2Mi44LjMgVC1WMjgzLTE6IGV4dGVuZGVkIHRvIGhhbmRsZSBjb2NvcyBlbWJlZGRlZCBwcmV2aWV3IG1vZGUuXG4gICAgLy9cbiAgICAvLyBNb2RlIGRpc3BhdGNoOlxuICAgIC8vICAgLSBcIndpbmRvd1wiOiAgIHJlcXVpcmUgYSBQcmV2aWV3LXRpdGxlZCBCcm93c2VyV2luZG93OyBmYWlsIGlmIG5vbmUuXG4gICAgLy8gICAgICAgICAgICAgICAgIE9yaWdpbmFsIHYyLjcuMCBiZWhhdmlvdXIuIFVzZSB3aGVuIGNvY29zIHByZXZpZXdcbiAgICAvLyAgICAgICAgICAgICAgICAgY29uZmlnIGlzIFwid2luZG93XCIgLyBcInNpbXVsYXRvclwiIChzZXBhcmF0ZSB3aW5kb3cpLlxuICAgIC8vICAgLSBcImVtYmVkZGVkXCI6IHNraXAgdGhlIHdpbmRvdyBwcm9iZSBhbmQgY2FwdHVyZSB0aGUgbWFpbiBlZGl0b3JcbiAgICAvLyAgICAgICAgICAgICAgICAgQnJvd3NlcldpbmRvdyBkaXJlY3RseS4gVXNlIHdoZW4gY29jb3MgcHJldmlldyBjb25maWdcbiAgICAvLyAgICAgICAgICAgICAgICAgaXMgXCJlbWJlZGRlZFwiIChnYW1ldmlldyByZW5kZXJzIGluc2lkZSBtYWluIGVkaXRvcikuXG4gICAgLy8gICAtIFwiYXV0b1wiOiAgICAgdHJ5IFwid2luZG93XCIgZmlyc3Q7IGlmIG5vIFByZXZpZXctdGl0bGVkIHdpbmRvdyBpc1xuICAgIC8vICAgICAgICAgICAgICAgICBmb3VuZCwgZmFsbCBiYWNrIHRvIFwiZW1iZWRkZWRcIiBhbmQgc3VyZmFjZSBhIGhpbnRcbiAgICAvLyAgICAgICAgICAgICAgICAgaW4gdGhlIHJlc3BvbnNlIG1lc3NhZ2UuIERlZmF1bHQg4oCUIGtlZXBzIHRoZSBoYXBweVxuICAgIC8vICAgICAgICAgICAgICAgICBwYXRoIHdvcmtpbmcgd2l0aG91dCBjYWxsZXIga25vd2xlZGdlIG9mIGNvY29zXG4gICAgLy8gICAgICAgICAgICAgICAgIHByZXZpZXcgY29uZmlnLlxuICAgIC8vXG4gICAgLy8gQnJvd3Nlci1tb2RlIChQSUUgcmVuZGVyZWQgdG8gdXNlcidzIGV4dGVybmFsIGJyb3dzZXIgdmlhXG4gICAgLy8gc2hlbGwub3BlbkV4dGVybmFsKSBpcyBOT1QgY2FwdHVyYWJsZSBoZXJlIOKAlCB0aGUgcGFnZSBsaXZlcyBpblxuICAgIC8vIGEgbm9uLUVsZWN0cm9uIGJyb3dzZXIgcHJvY2Vzcy4gQUkgY2FuIGRldGVjdCB0aGlzIHZpYVxuICAgIC8vIGRlYnVnX2dldF9wcmV2aWV3X21vZGUgYW5kIHNraXAgdGhlIGNhbGwuXG4gICAgcHJpdmF0ZSBhc3luYyBjYXB0dXJlUHJldmlld1NjcmVlbnNob3QoXG4gICAgICAgIHNhdmVQYXRoPzogc3RyaW5nLFxuICAgICAgICBtb2RlOiAnYXV0bycgfCAnd2luZG93JyB8ICdlbWJlZGRlZCcgPSAnYXV0bycsXG4gICAgICAgIHdpbmRvd1RpdGxlOiBzdHJpbmcgPSAnUHJldmlldycsXG4gICAgICAgIGluY2x1ZGVCYXNlNjQ6IGJvb2xlYW4gPSBmYWxzZSxcbiAgICApOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby12YXItcmVxdWlyZXNcbiAgICAgICAgICAgIGNvbnN0IGVsZWN0cm9uID0gcmVxdWlyZSgnZWxlY3Ryb24nKTtcbiAgICAgICAgICAgIGNvbnN0IEJXID0gZWxlY3Ryb24uQnJvd3NlcldpbmRvdztcblxuICAgICAgICAgICAgLy8gUmVzb2x2ZSB0aGUgdGFyZ2V0IHdpbmRvdyBwZXIgbW9kZS5cbiAgICAgICAgICAgIGNvbnN0IHByb2JlV2luZG93TW9kZSA9ICgpOiB7IG9rOiB0cnVlOyB3aW46IGFueSB9IHwgeyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmc7IHZpc2libGVUaXRsZXM6IHN0cmluZ1tdIH0gPT4ge1xuICAgICAgICAgICAgICAgIC8vIHYyLjcuMSByZXZpZXcgZml4IChjbGF1ZGUg8J+foSArIGNvZGV4IPCfn6EpOiB3aXRoIHRoZSBkZWZhdWx0XG4gICAgICAgICAgICAgICAgLy8gd2luZG93VGl0bGU9J1ByZXZpZXcnIGEgQ2hpbmVzZSAvIGxvY2FsaXplZCBjb2NvcyBlZGl0b3JcbiAgICAgICAgICAgICAgICAvLyB3aG9zZSBtYWluIHdpbmRvdyB0aXRsZSBjb250YWlucyBcIlByZXZpZXdcIiAoZS5nLiBcIkNvY29zXG4gICAgICAgICAgICAgICAgLy8gQ3JlYXRvciBQcmV2aWV3IC0gPFByb2plY3ROYW1lPlwiKSB3b3VsZCBmYWxzZWx5IG1hdGNoLlxuICAgICAgICAgICAgICAgIC8vIERpc2FtYmlndWF0ZSBieSBleGNsdWRpbmcgYW55IHRpdGxlIHRoYXQgQUxTTyBjb250YWluc1xuICAgICAgICAgICAgICAgIC8vIFwiQ29jb3MgQ3JlYXRvclwiIHdoZW4gdGhlIGNhbGxlciBzdHVjayB3aXRoIHRoZSBkZWZhdWx0LlxuICAgICAgICAgICAgICAgIGNvbnN0IHVzaW5nRGVmYXVsdCA9IHdpbmRvd1RpdGxlID09PSAnUHJldmlldyc7XG4gICAgICAgICAgICAgICAgY29uc3QgYWxsVGl0bGVzOiBzdHJpbmdbXSA9IEJXPy5nZXRBbGxXaW5kb3dzPy4oKT8ubWFwKCh3OiBhbnkpID0+IHcuZ2V0VGl0bGU/LigpID8/ICcnKS5maWx0ZXIoQm9vbGVhbikgPz8gW107XG4gICAgICAgICAgICAgICAgY29uc3QgbWF0Y2hlcyA9IEJXPy5nZXRBbGxXaW5kb3dzPy4oKT8uZmlsdGVyKCh3OiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCF3IHx8IHcuaXNEZXN0cm95ZWQoKSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB0aXRsZSA9IHcuZ2V0VGl0bGU/LigpIHx8ICcnO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXRpdGxlLmluY2x1ZGVzKHdpbmRvd1RpdGxlKSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICBpZiAodXNpbmdEZWZhdWx0ICYmIC9Db2Nvc1xccypDcmVhdG9yL2kudGVzdCh0aXRsZSkpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgfSkgPz8gW107XG4gICAgICAgICAgICAgICAgaWYgKG1hdGNoZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGBObyBFbGVjdHJvbiB3aW5kb3cgdGl0bGUgY29udGFpbnMgXCIke3dpbmRvd1RpdGxlfVwiJHt1c2luZ0RlZmF1bHQgPyAnIChhbmQgaXMgbm90IHRoZSBtYWluIGVkaXRvciknIDogJyd9LmAsIHZpc2libGVUaXRsZXM6IGFsbFRpdGxlcyB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4geyBvazogdHJ1ZSwgd2luOiBtYXRjaGVzWzBdIH07XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBjb25zdCBwcm9iZUVtYmVkZGVkTW9kZSA9ICgpOiB7IG9rOiB0cnVlOyB3aW46IGFueSB9IHwgeyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmcgfSA9PiB7XG4gICAgICAgICAgICAgICAgLy8gRW1iZWRkZWQgUElFIHJlbmRlcnMgaW5zaWRlIHRoZSBtYWluIGVkaXRvciBCcm93c2VyV2luZG93LlxuICAgICAgICAgICAgICAgIC8vIFBpY2sgdGhlIHNhbWUgaGV1cmlzdGljIGFzIHBpY2tXaW5kb3coKTogcHJlZmVyIGEgbm9uLVxuICAgICAgICAgICAgICAgIC8vIFByZXZpZXcgd2luZG93LiBDb2NvcyBtYWluIGVkaXRvcidzIHRpdGxlIHR5cGljYWxseVxuICAgICAgICAgICAgICAgIC8vIGNvbnRhaW5zIFwiQ29jb3MgQ3JlYXRvclwiIOKAlCBtYXRjaCB0aGF0IHRvIGlkZW50aWZ5IGl0LlxuICAgICAgICAgICAgICAgIGNvbnN0IGFsbDogYW55W10gPSBCVz8uZ2V0QWxsV2luZG93cz8uKCk/LmZpbHRlcigodzogYW55KSA9PiB3ICYmICF3LmlzRGVzdHJveWVkKCkpID8/IFtdO1xuICAgICAgICAgICAgICAgIGlmIChhbGwubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6ICdObyBsaXZlIEVsZWN0cm9uIHdpbmRvd3MgYXZhaWxhYmxlOyBjYW5ub3QgY2FwdHVyZSBlbWJlZGRlZCBwcmV2aWV3LicgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgLy8gUHJlZmVyIHRoZSBlZGl0b3IgbWFpbiB3aW5kb3cgKHRpdGxlIGNvbnRhaW5zIFwiQ29jb3NcbiAgICAgICAgICAgICAgICAvLyBDcmVhdG9yXCIpIOKAlCB0aGF0J3Mgd2hlcmUgZW1iZWRkZWQgUElFIHJlbmRlcnMuXG4gICAgICAgICAgICAgICAgY29uc3QgZWRpdG9yID0gYWxsLmZpbmQoKHc6IGFueSkgPT4gL0NvY29zXFxzKkNyZWF0b3IvaS50ZXN0KHcuZ2V0VGl0bGU/LigpIHx8ICcnKSk7XG4gICAgICAgICAgICAgICAgaWYgKGVkaXRvcikgcmV0dXJuIHsgb2s6IHRydWUsIHdpbjogZWRpdG9yIH07XG4gICAgICAgICAgICAgICAgLy8gRmFsbGJhY2s6IGFueSBub24tRGV2VG9vbHMgLyBub24tV29ya2VyIC8gbm9uLUJsYW5rIHdpbmRvdy5cbiAgICAgICAgICAgICAgICBjb25zdCBjYW5kaWRhdGUgPSBhbGwuZmluZCgodzogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHQgPSB3LmdldFRpdGxlPy4oKSB8fCAnJztcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHQgJiYgIS9EZXZUb29sc3xXb3JrZXIgLXxeQmxhbmskLy50ZXN0KHQpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGlmIChjYW5kaWRhdGUpIHJldHVybiB7IG9rOiB0cnVlLCB3aW46IGNhbmRpZGF0ZSB9O1xuICAgICAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6ICdObyBzdWl0YWJsZSBlZGl0b3Igd2luZG93IGZvdW5kIGZvciBlbWJlZGRlZCBwcmV2aWV3IGNhcHR1cmUuJyB9O1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgbGV0IHdpbjogYW55ID0gbnVsbDtcbiAgICAgICAgICAgIGxldCBjYXB0dXJlTm90ZTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgICAgICAgICBsZXQgcmVzb2x2ZWRNb2RlOiAnd2luZG93JyB8ICdlbWJlZGRlZCcgPSAnd2luZG93JztcblxuICAgICAgICAgICAgaWYgKG1vZGUgPT09ICd3aW5kb3cnKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgciA9IHByb2JlV2luZG93TW9kZSgpO1xuICAgICAgICAgICAgICAgIGlmICghci5vaykge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgICAgICBlcnJvcjogYCR7ci5lcnJvcn0gTGF1bmNoIGNvY29zIHByZXZpZXcgZmlyc3QgdmlhIHRoZSB0b29sYmFyIHBsYXkgYnV0dG9uIG9yIHZpYSBkZWJ1Z19wcmV2aWV3X3VybChhY3Rpb249XCJvcGVuXCIpLiBJZiB5b3VyIGNvY29zIHByZXZpZXcgaXMgc2V0IHRvIFwiZW1iZWRkZWRcIiwgY2FsbCB0aGlzIHRvb2wgd2l0aCBtb2RlPVwiZW1iZWRkZWRcIiBvciBtb2RlPVwiYXV0b1wiLiBWaXNpYmxlIHdpbmRvdyB0aXRsZXM6ICR7ci52aXNpYmxlVGl0bGVzLmpvaW4oJywgJykgfHwgJyhub25lKSd9YCxcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgd2luID0gci53aW47XG4gICAgICAgICAgICAgICAgcmVzb2x2ZWRNb2RlID0gJ3dpbmRvdyc7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKG1vZGUgPT09ICdlbWJlZGRlZCcpIHtcbiAgICAgICAgICAgICAgICBjb25zdCByID0gcHJvYmVFbWJlZGRlZE1vZGUoKTtcbiAgICAgICAgICAgICAgICBpZiAoIXIub2spIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogci5lcnJvciB9O1xuICAgICAgICAgICAgICAgIHdpbiA9IHIud2luO1xuICAgICAgICAgICAgICAgIHJlc29sdmVkTW9kZSA9ICdlbWJlZGRlZCc7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIGF1dG9cbiAgICAgICAgICAgICAgICBjb25zdCB3ciA9IHByb2JlV2luZG93TW9kZSgpO1xuICAgICAgICAgICAgICAgIGlmICh3ci5vaykge1xuICAgICAgICAgICAgICAgICAgICB3aW4gPSB3ci53aW47XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmVkTW9kZSA9ICd3aW5kb3cnO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGVyID0gcHJvYmVFbWJlZGRlZE1vZGUoKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFlci5vaykge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlcnJvcjogYCR7d3IuZXJyb3J9ICR7ZXIuZXJyb3J9IExhdW5jaCBjb2NvcyBwcmV2aWV3IGZpcnN0IG9yIGNoZWNrIGRlYnVnX2dldF9wcmV2aWV3X21vZGUgdG8gc2VlIGhvdyBjb2NvcyBpcyBjb25maWd1cmVkLiBWaXNpYmxlIHdpbmRvdyB0aXRsZXM6ICR7d3IudmlzaWJsZVRpdGxlcy5qb2luKCcsICcpIHx8ICcobm9uZSknfWAsXG4gICAgICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHdpbiA9IGVyLndpbjtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZWRNb2RlID0gJ2VtYmVkZGVkJztcbiAgICAgICAgICAgICAgICAgICAgLy8gdjIuOC40IHJldGVzdCBmaW5kaW5nOiB3aGVuIGNvY29zIHByZXZpZXcgaXMgc2V0XG4gICAgICAgICAgICAgICAgICAgIC8vIHRvIFwiYnJvd3NlclwiLCBhdXRvLWZhbGxiYWNrIEFMU08gZ3JhYnMgdGhlIG1haW5cbiAgICAgICAgICAgICAgICAgICAgLy8gZWRpdG9yIHdpbmRvdyAoYmVjYXVzZSBubyBQcmV2aWV3LXRpdGxlZCB3aW5kb3dcbiAgICAgICAgICAgICAgICAgICAgLy8gZXhpc3RzKSDigJQgYnV0IGluIGJyb3dzZXIgbW9kZSB0aGUgYWN0dWFsIGdhbWV2aWV3XG4gICAgICAgICAgICAgICAgICAgIC8vIGxpdmVzIGluIHRoZSB1c2VyJ3MgZXh0ZXJuYWwgYnJvd3NlciwgTk9UIGluIHRoZVxuICAgICAgICAgICAgICAgICAgICAvLyBjYXB0dXJlZCBFbGVjdHJvbiB3aW5kb3cuIERvbid0IGNsYWltIFwiZW1iZWRkZWRcbiAgICAgICAgICAgICAgICAgICAgLy8gcHJldmlldyBtb2RlXCIg4oCUIHRoYXQncyBhIGd1ZXNzLCBhbmQgd3Jvbmcgd2hlblxuICAgICAgICAgICAgICAgICAgICAvLyB1c2VyIGlzIG9uIGJyb3dzZXIgY29uZmlnLiBQcm9iZSB0aGUgcmVhbCBjb25maWdcbiAgICAgICAgICAgICAgICAgICAgLy8gYW5kIHRhaWxvciB0aGUgaGludCBwZXIgbW9kZS5cbiAgICAgICAgICAgICAgICAgICAgbGV0IGFjdHVhbE1vZGU6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY2ZnOiBhbnkgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICdwcmVmZXJlbmNlcycsICdxdWVyeS1jb25maWcnIGFzIGFueSwgJ3ByZXZpZXcnIGFzIGFueSxcbiAgICAgICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBwbGF0Zm9ybSA9IGNmZz8ucHJldmlldz8uY3VycmVudD8ucGxhdGZvcm07XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHBsYXRmb3JtID09PSAnc3RyaW5nJykgYWN0dWFsTW9kZSA9IHBsYXRmb3JtO1xuICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGJlc3QtZWZmb3J0OyBmYWxsIHRocm91Z2ggd2l0aCBuZXV0cmFsIGhpbnRcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZiAoYWN0dWFsTW9kZSA9PT0gJ2Jyb3dzZXInKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXB0dXJlTm90ZSA9ICdObyBQcmV2aWV3LXRpdGxlZCB3aW5kb3cgZm91bmQ7IGNhcHR1cmVkIHRoZSBtYWluIGVkaXRvciB3aW5kb3cuIE5PVEU6IGNvY29zIHByZXZpZXcgaXMgc2V0IHRvIFwiYnJvd3NlclwiIOKAlCB0aGUgYWN0dWFsIHByZXZpZXcgY29udGVudCBpcyByZW5kZXJlZCBpbiB5b3VyIGV4dGVybmFsIGJyb3dzZXIgKE5PVCBpbiB0aGlzIGltYWdlKS4gRm9yIHJ1bnRpbWUgY2FudmFzIGNhcHR1cmUgaW4gYnJvd3NlciBtb2RlIHVzZSBkZWJ1Z19nYW1lX2NvbW1hbmQodHlwZT1cInNjcmVlbnNob3RcIikgdmlhIGEgR2FtZURlYnVnQ2xpZW50IHJ1bm5pbmcgb24gdGhlIGJyb3dzZXIgcHJldmlldyBwYWdlLic7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoYWN0dWFsTW9kZSA9PT0gJ2dhbWVWaWV3Jykge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FwdHVyZU5vdGUgPSAnTm8gUHJldmlldy10aXRsZWQgd2luZG93IGZvdW5kOyBjYXB0dXJlZCB0aGUgbWFpbiBlZGl0b3Igd2luZG93IChjb2NvcyBwcmV2aWV3IGlzIHNldCB0byBcImdhbWVWaWV3XCIgZW1iZWRkZWQg4oCUIHRoZSBlZGl0b3IgZ2FtZXZpZXcgSVMgd2hlcmUgcHJldmlldyByZW5kZXJzLCBzbyB0aGlzIGltYWdlIGlzIGNvcnJlY3QpLic7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoYWN0dWFsTW9kZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FwdHVyZU5vdGUgPSBgTm8gUHJldmlldy10aXRsZWQgd2luZG93IGZvdW5kOyBjYXB0dXJlZCB0aGUgbWFpbiBlZGl0b3Igd2luZG93LiBjb2NvcyBwcmV2aWV3IGlzIHNldCB0byBcIiR7YWN0dWFsTW9kZX1cIiDigJQgdmVyaWZ5IHRoaXMgaW1hZ2UgYWN0dWFsbHkgY29udGFpbnMgdGhlIGdhbWV2aWV3IHlvdSB3YW50ZWQ7IGZvciBydW50aW1lIGNhbnZhcyBjYXB0dXJlIHByZWZlciBkZWJ1Z19nYW1lX2NvbW1hbmQgdmlhIEdhbWVEZWJ1Z0NsaWVudC5gO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FwdHVyZU5vdGUgPSAnTm8gUHJldmlldy10aXRsZWQgd2luZG93IGZvdW5kOyBjYXB0dXJlZCB0aGUgbWFpbiBlZGl0b3Igd2luZG93LiBDb3VsZCBub3QgZGV0ZXJtaW5lIGNvY29zIHByZXZpZXcgbW9kZSAoZGVidWdfZ2V0X3ByZXZpZXdfbW9kZSBtaWdodCBnaXZlIG1vcmUgaW5mbykuIElmIHlvdXIgY29jb3MgcHJldmlldyBpcyBzZXQgdG8gXCJicm93c2VyXCIsIHRoZSBhY3R1YWwgcHJldmlldyBjb250ZW50IGlzIGluIHlvdXIgZXh0ZXJuYWwgYnJvd3NlciBhbmQgaXMgTk9UIGluIHRoaXMgaW1hZ2UuJztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgbGV0IGZpbGVQYXRoID0gc2F2ZVBhdGg7XG4gICAgICAgICAgICBpZiAoIWZpbGVQYXRoKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVzb2x2ZWQgPSB0aGlzLnJlc29sdmVBdXRvQ2FwdHVyZUZpbGUoYHByZXZpZXctJHtEYXRlLm5vdygpfS5wbmdgKTtcbiAgICAgICAgICAgICAgICBpZiAoIXJlc29sdmVkLm9rKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHJlc29sdmVkLmVycm9yIH07XG4gICAgICAgICAgICAgICAgZmlsZVBhdGggPSByZXNvbHZlZC5maWxlUGF0aDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gdjIuOC4xIHJvdW5kLTEgZml4IChHZW1pbmkg8J+UtCArIENvZGV4IPCfn6EpOiBleHBsaWNpdCBzYXZlUGF0aFxuICAgICAgICAgICAgICAgIC8vIGFsc28gZ2V0cyBjb250YWlubWVudC1jaGVja2VkLlxuICAgICAgICAgICAgICAgIC8vIHYyLjguMiByZXRlc3QgZml4OiB1c2UgcmVzb2x2ZWRQYXRoIGZvciByZWxhdGl2ZS1wYXRoIHN1cHBvcnQuXG4gICAgICAgICAgICAgICAgY29uc3QgZ3VhcmQgPSB0aGlzLmFzc2VydFNhdmVQYXRoV2l0aGluUHJvamVjdChmaWxlUGF0aCk7XG4gICAgICAgICAgICAgICAgaWYgKCFndWFyZC5vaykgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBndWFyZC5lcnJvciB9O1xuICAgICAgICAgICAgICAgIGZpbGVQYXRoID0gZ3VhcmQucmVzb2x2ZWRQYXRoO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgaW1hZ2UgPSBhd2FpdCB3aW4ud2ViQ29udGVudHMuY2FwdHVyZVBhZ2UoKTtcbiAgICAgICAgICAgIGNvbnN0IHBuZzogQnVmZmVyID0gaW1hZ2UudG9QTkcoKTtcbiAgICAgICAgICAgIGZzLndyaXRlRmlsZVN5bmMoZmlsZVBhdGgsIHBuZyk7XG4gICAgICAgICAgICBjb25zdCBkYXRhOiBhbnkgPSB7XG4gICAgICAgICAgICAgICAgZmlsZVBhdGgsXG4gICAgICAgICAgICAgICAgc2l6ZTogcG5nLmxlbmd0aCxcbiAgICAgICAgICAgICAgICB3aW5kb3dUaXRsZTogdHlwZW9mIHdpbi5nZXRUaXRsZSA9PT0gJ2Z1bmN0aW9uJyA/IHdpbi5nZXRUaXRsZSgpIDogJycsXG4gICAgICAgICAgICAgICAgbW9kZTogcmVzb2x2ZWRNb2RlLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGlmIChjYXB0dXJlTm90ZSkgZGF0YS5ub3RlID0gY2FwdHVyZU5vdGU7XG4gICAgICAgICAgICBpZiAoaW5jbHVkZUJhc2U2NCkge1xuICAgICAgICAgICAgICAgIGRhdGEuZGF0YVVyaSA9IGBkYXRhOmltYWdlL3BuZztiYXNlNjQsJHtwbmcudG9TdHJpbmcoJ2Jhc2U2NCcpfWA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBtZXNzYWdlID0gY2FwdHVyZU5vdGVcbiAgICAgICAgICAgICAgICA/IGBQcmV2aWV3IHNjcmVlbnNob3Qgc2F2ZWQgdG8gJHtmaWxlUGF0aH0gKCR7Y2FwdHVyZU5vdGV9KWBcbiAgICAgICAgICAgICAgICA6IGBQcmV2aWV3IHNjcmVlbnNob3Qgc2F2ZWQgdG8gJHtmaWxlUGF0aH0gKG1vZGU9JHtyZXNvbHZlZE1vZGV9KWA7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBkYXRhLCBtZXNzYWdlIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKSB9O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gdjIuOC4zIFQtVjI4My0yOiByZWFkIGNvY29zIHByZXZpZXcgY29uZmlnIHNvIEFJIGNhbiByb3V0ZVxuICAgIC8vIGNhcHR1cmVfcHJldmlld19zY3JlZW5zaG90IHRvIHRoZSBjb3JyZWN0IG1vZGUgd2l0aG91dCBndWVzc2luZy5cbiAgICAvLyBSZWFkcyB2aWEgRWRpdG9yLk1lc3NhZ2UgcHJlZmVyZW5jZXMvcXVlcnktY29uZmlnICh0eXBlZCBpblxuICAgIC8vIG5vZGVfbW9kdWxlcy9AY29jb3MvY3JlYXRvci10eXBlcy8uLi4vcHJlZmVyZW5jZXMvQHR5cGVzL21lc3NhZ2UuZC50cykuXG4gICAgLy9cbiAgICAvLyBXZSBkdW1wIHRoZSBmdWxsICdwcmV2aWV3JyBjYXRlZ29yeSwgdGhlbiB0cnkgdG8gaW50ZXJwcmV0IGEgZmV3XG4gICAgLy8gY29tbW9uIGtleXMgKCdvcGVuX3ByZXZpZXdfd2l0aCcsICdwcmV2aWV3X3dpdGgnLCAnc2ltdWxhdG9yJyxcbiAgICAvLyAnYnJvd3NlcicpIGludG8gYSBub3JtYWxpemVkIG1vZGUgbGFiZWwuIElmIGludGVycHJldGF0aW9uIGZhaWxzLFxuICAgIC8vIHdlIHN0aWxsIHJldHVybiB0aGUgcmF3IGNvbmZpZyBzbyB0aGUgQUkgY2FuIHJlYWQgaXQgZGlyZWN0bHkuXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRQcmV2aWV3TW9kZSgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gUHJvYmUgYXQgbW9kdWxlIGxldmVsIChubyBrZXkpIHRvIGdldCB0aGUgd2hvbGUgY2F0ZWdvcnkuXG4gICAgICAgICAgICBjb25zdCByYXc6IGFueSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3ByZWZlcmVuY2VzJywgJ3F1ZXJ5LWNvbmZpZycgYXMgYW55LCAncHJldmlldycgYXMgYW55KSBhcyBhbnk7XG4gICAgICAgICAgICBpZiAocmF3ID09PSB1bmRlZmluZWQgfHwgcmF3ID09PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIGVycm9yOiAncHJlZmVyZW5jZXMvcXVlcnktY29uZmlnIHJldHVybmVkIG51bGwgZm9yIFwicHJldmlld1wiIOKAlCBjb2NvcyBtYXkgbm90IGV4cG9zZSB0aGlzIGNhdGVnb3J5LCBvciB5b3VyIGJ1aWxkIGRpZmZlcnMgZnJvbSAzLjgueC4nLFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBIZXVyaXN0aWMgaW50ZXJwcmV0YXRpb24uXG4gICAgICAgICAgICAvLyB2Mi44LjMgcmV0ZXN0IGZpbmRpbmc6IGNvY29zIDMuOC43IGFjdHVhbGx5IHN0b3JlcyB0aGVcbiAgICAgICAgICAgIC8vIGFjdGl2ZSBtb2RlIGF0IGBwcmV2aWV3LmN1cnJlbnQucGxhdGZvcm1gIHdpdGggdmFsdWVcbiAgICAgICAgICAgIC8vIGBcImdhbWVWaWV3XCJgIChlbWJlZGRlZCksIGBcImJyb3dzZXJcImAsIG9yIGRldmljZSBuYW1lc1xuICAgICAgICAgICAgLy8gKHNpbXVsYXRvcikuIFRoZSBvcmlnaW5hbCBoZXVyaXN0aWMgb25seSBjaGVja2VkIGtleXMgbGlrZVxuICAgICAgICAgICAgLy8gYG9wZW5fcHJldmlld193aXRoYCAvIGBwcmV2aWV3X3dpdGhgIC8gYG9wZW5fd2l0aGAgLyBgbW9kZWBcbiAgICAgICAgICAgIC8vIGFuZCBtaXNzZWQgdGhlIGxpdmUga2V5LiBQcm9iZSBgY3VycmVudC5wbGF0Zm9ybWAgZmlyc3Q7XG4gICAgICAgICAgICAvLyBrZWVwIHRoZSBsZWdhY3kga2V5cyBhcyBmYWxsYmFjayBmb3Igb2xkZXIgY29jb3MgdmVyc2lvbnMuXG4gICAgICAgICAgICBjb25zdCBsb3dlciA9IChzOiBhbnkpID0+ICh0eXBlb2YgcyA9PT0gJ3N0cmluZycgPyBzLnRvTG93ZXJDYXNlKCkgOiAnJyk7XG4gICAgICAgICAgICBsZXQgaW50ZXJwcmV0ZWQ6ICdicm93c2VyJyB8ICd3aW5kb3cnIHwgJ3NpbXVsYXRvcicgfCAnZW1iZWRkZWQnIHwgJ3Vua25vd24nID0gJ3Vua25vd24nO1xuICAgICAgICAgICAgbGV0IGludGVycHJldGVkRnJvbUtleTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgICAgICAgICBjb25zdCBjbGFzc2lmeSA9ICh2OiBzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBsdiA9IGxvd2VyKHYpO1xuICAgICAgICAgICAgICAgIGlmIChsdi5pbmNsdWRlcygnYnJvd3NlcicpKSByZXR1cm4gJ2Jyb3dzZXInO1xuICAgICAgICAgICAgICAgIGlmIChsdi5pbmNsdWRlcygnc2ltdWxhdG9yJykpIHJldHVybiAnc2ltdWxhdG9yJztcbiAgICAgICAgICAgICAgICBpZiAobHYuaW5jbHVkZXMoJ2VtYmVkJykgfHwgbHYuaW5jbHVkZXMoJ2dhbWV2aWV3JykgfHwgbHYuaW5jbHVkZXMoJ2dhbWVfdmlldycpKSByZXR1cm4gJ2VtYmVkZGVkJztcbiAgICAgICAgICAgICAgICBpZiAobHYuaW5jbHVkZXMoJ3dpbmRvdycpKSByZXR1cm4gJ3dpbmRvdyc7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgY29uc3QgZGlnID0gKG9iajogYW55LCBwYXRoOiBzdHJpbmcpOiBhbnkgPT4ge1xuICAgICAgICAgICAgICAgIGlmICghb2JqIHx8IHR5cGVvZiBvYmogIT09ICdvYmplY3QnKSByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIGNvbnN0IHBhcnRzID0gcGF0aC5zcGxpdCgnLicpO1xuICAgICAgICAgICAgICAgIGxldCBjdXI6IGFueSA9IG9iajtcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IHAgb2YgcGFydHMpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFjdXIgfHwgdHlwZW9mIGN1ciAhPT0gJ29iamVjdCcpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgICAgIGlmIChwIGluIGN1cikge1xuICAgICAgICAgICAgICAgICAgICAgICAgY3VyID0gY3VyW3BdO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgLy8gVHJ5IG9uZSBsZXZlbCBvZiBuZXN0IChzb21ldGltZXMgdGhlIGNhdGVnb3J5IGR1bXBcbiAgICAgICAgICAgICAgICAgICAgLy8gbmVzdHMgdW5kZXIgYSBkZWZhdWx0LXByb3RvY29sIGJ1Y2tldCkuXG4gICAgICAgICAgICAgICAgICAgIGxldCBmb3VuZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IHYgb2YgT2JqZWN0LnZhbHVlcyhjdXIpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodiAmJiB0eXBlb2YgdiA9PT0gJ29iamVjdCcgJiYgcCBpbiAodiBhcyBhbnkpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY3VyID0gKHYgYXMgYW55KVtwXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb3VuZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYgKCFmb3VuZCkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIGN1cjtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBjb25zdCBwcm9iZUtleXMgPSBbXG4gICAgICAgICAgICAgICAgJ3ByZXZpZXcuY3VycmVudC5wbGF0Zm9ybScsXG4gICAgICAgICAgICAgICAgJ2N1cnJlbnQucGxhdGZvcm0nLFxuICAgICAgICAgICAgICAgICdwcmV2aWV3Lm9wZW5fcHJldmlld193aXRoJyxcbiAgICAgICAgICAgICAgICAnb3Blbl9wcmV2aWV3X3dpdGgnLFxuICAgICAgICAgICAgICAgICdwcmV2aWV3X3dpdGgnLFxuICAgICAgICAgICAgICAgICdvcGVuX3dpdGgnLFxuICAgICAgICAgICAgICAgICdtb2RlJyxcbiAgICAgICAgICAgIF07XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGsgb2YgcHJvYmVLZXlzKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdiA9IGRpZyhyYXcsIGspO1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgdiA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY2xzID0gY2xhc3NpZnkodik7XG4gICAgICAgICAgICAgICAgICAgIGlmIChjbHMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGludGVycHJldGVkID0gY2xzO1xuICAgICAgICAgICAgICAgICAgICAgICAgaW50ZXJwcmV0ZWRGcm9tS2V5ID0gYCR7a309JHt2fWA7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAvLyBOb24tZW1wdHkgc3RyaW5nIHRoYXQgZGlkbid0IG1hdGNoIGEga25vd24gbGFiZWwg4oaSXG4gICAgICAgICAgICAgICAgICAgIC8vIHJlY29yZCBhcyAnc2ltdWxhdG9yJyBjYW5kaWRhdGUgaWYgaXQgbG9va3MgbGlrZSBhXG4gICAgICAgICAgICAgICAgICAgIC8vIGRldmljZSBuYW1lIChlLmcuIFwiQXBwbGUgaVBob25lIDE0IFByb1wiKSwgb3RoZXJ3aXNlXG4gICAgICAgICAgICAgICAgICAgIC8vIGtlZXAgc2VhcmNoaW5nLlxuICAgICAgICAgICAgICAgICAgICBpZiAoL2lQaG9uZXxpUGFkfEhVQVdFSXxYaWFvbWl8U29ueXxBc3VzfE9QUE98SG9ub3J8Tm9raWF8TGVub3ZvfFNhbXN1bmd8R29vZ2xlfFBpeGVsL2kudGVzdCh2KSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaW50ZXJwcmV0ZWQgPSAnc2ltdWxhdG9yJztcbiAgICAgICAgICAgICAgICAgICAgICAgIGludGVycHJldGVkRnJvbUtleSA9IGAke2t9PSR7dn1gO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgZGF0YTogeyBpbnRlcnByZXRlZCwgaW50ZXJwcmV0ZWRGcm9tS2V5LCByYXcgfSxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiBpbnRlcnByZXRlZCA9PT0gJ3Vua25vd24nXG4gICAgICAgICAgICAgICAgICAgID8gJ1JlYWQgY29jb3MgcHJldmlldyBjb25maWcgYnV0IGNvdWxkIG5vdCBpbnRlcnByZXQgYSBtb2RlIGxhYmVsOyBpbnNwZWN0IGRhdGEucmF3IGFuZCBwYXNzIG1vZGU9IGV4cGxpY2l0bHkgdG8gY2FwdHVyZV9wcmV2aWV3X3NjcmVlbnNob3QuJ1xuICAgICAgICAgICAgICAgICAgICA6IGBjb2NvcyBwcmV2aWV3IGlzIGNvbmZpZ3VyZWQgYXMgXCIke2ludGVycHJldGVkfVwiIChmcm9tIGtleSBcIiR7aW50ZXJwcmV0ZWRGcm9tS2V5fVwiKS4gUGFzcyBtb2RlPVwiJHtpbnRlcnByZXRlZCA9PT0gJ2Jyb3dzZXInID8gJ3dpbmRvdycgOiBpbnRlcnByZXRlZH1cIiB0byBjYXB0dXJlX3ByZXZpZXdfc2NyZWVuc2hvdCwgb3IgcmVseSBvbiBtb2RlPVwiYXV0b1wiLmAsXG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgcHJlZmVyZW5jZXMvcXVlcnktY29uZmlnICdwcmV2aWV3JyBmYWlsZWQ6ICR7ZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpfWAgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIHYyLjEwIFQtVjIxMC0xOiBoYXJkLWZhaWwgYnkgZGVmYXVsdC4gUGVyIGNyb3NzLXJlcG8gcmVmcmVzaFxuICAgIC8vIDIwMjYtMDUtMDIsIG5vbmUgb2YgNiBzdXJ2ZXllZCBjb2Nvcy1tY3AgcGVlcnMgc2hpcCBhIHdvcmtpbmdcbiAgICAvLyBwcmV2aWV3LW1vZGUgc2V0dGVyIOKAlCB0aGUgY29jb3MgMy44LjcgcHJldmlldyBjYXRlZ29yeSBpc1xuICAgIC8vIGVmZmVjdGl2ZWx5IHJlYWRvbmx5IHRvIHRoaXJkLXBhcnR5IGV4dGVuc2lvbnMgKGxhbmRtaW5lICMxNykuXG4gICAgLy8gRGVmYXVsdCBiZWhhdmlvciBpcyBub3cgTk9UX1NVUFBPUlRFRCB3aXRoIGEgVUkgcmVkaXJlY3QuXG4gICAgLy9cbiAgICAvLyBUaGUgNC1zdHJhdGVneSBwcm9iZSBpcyBwcmVzZXJ2ZWQgYmVoaW5kIGBhdHRlbXB0QW55d2F5PXRydWVgXG4gICAgLy8gc28gYSBmdXR1cmUgY29jb3MgYnVpbGQgY2FuIGJlIHZhbGlkYXRlZCBxdWlja2x5OiByZWFkIHRoZVxuICAgIC8vIHJldHVybmVkIGRhdGEuYXR0ZW1wdHMgbG9nIHRvIHNlZSB3aGV0aGVyIGFueSBzaGFwZSBub3cgd29ya3MuXG4gICAgLy8gVGhlIHNldHRlciBkb2VzIE5PVCBmcmVlemUgdGhlIGVkaXRvciAoc2V0LWNvbmZpZyBzaWxlbnRseVxuICAgIC8vIG5vLW9wcywgY2YuIHByZXZpZXdfY29udHJvbCB3aGljaCBET0VTIGZyZWV6ZSDigJQgbGFuZG1pbmUgIzE2KS5cbiAgICAvL1xuICAgIC8vIFN0cmF0ZWdpZXMgdHJpZWQgaW4gb3JkZXI6XG4gICAgLy8gICAxLiAoJ3ByZXZpZXcnLCAnY3VycmVudCcsIHsgcGxhdGZvcm06IHZhbHVlIH0pICDigJQgbmVzdGVkIG9iamVjdFxuICAgIC8vICAgMi4gKCdwcmV2aWV3JywgJ2N1cnJlbnQucGxhdGZvcm0nLCB2YWx1ZSwgJ2dsb2JhbCcpIOKAlCBleHBsaWNpdCBwcm90b2NvbFxuICAgIC8vICAgMy4gKCdwcmV2aWV3JywgJ2N1cnJlbnQucGxhdGZvcm0nLCB2YWx1ZSwgJ2xvY2FsJykgIOKAlCBleHBsaWNpdCBwcm90b2NvbFxuICAgIC8vICAgNC4gKCdwcmV2aWV3JywgJ2N1cnJlbnQucGxhdGZvcm0nLCB2YWx1ZSkgICAgICAgICAg4oCUIG5vIHByb3RvY29sXG4gICAgcHJpdmF0ZSBhc3luYyBzZXRQcmV2aWV3TW9kZShtb2RlOiAnYnJvd3NlcicgfCAnZ2FtZVZpZXcnIHwgJ3NpbXVsYXRvcicsIGF0dGVtcHRBbnl3YXk6IGJvb2xlYW4pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcXVlcnlDdXJyZW50ID0gYXN5bmMgKCk6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4gPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGNmZzogYW55ID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgncHJlZmVyZW5jZXMnLCAncXVlcnktY29uZmlnJyBhcyBhbnksICdwcmV2aWV3JyBhcyBhbnkpIGFzIGFueTtcbiAgICAgICAgICAgICAgICByZXR1cm4gY2ZnPy5wcmV2aWV3Py5jdXJyZW50Py5wbGF0Zm9ybSA/PyBudWxsO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGNvbnN0IHByZXZpb3VzTW9kZSA9IGF3YWl0IHF1ZXJ5Q3VycmVudCgpO1xuICAgICAgICAgICAgaWYgKCFhdHRlbXB0QW55d2F5KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIGVycm9yOiBgZGVidWdfc2V0X3ByZXZpZXdfbW9kZSBpcyBOT1QgU1VQUE9SVEVEIG9uIGNvY29zIDMuOC43KyAobGFuZG1pbmUgIzE3KS4gUHJvZ3JhbW1hdGljIHByZXZpZXctbW9kZSBzd2l0Y2hpbmcgaGFzIG5vIHdvcmtpbmcgSVBDIHBhdGg6IHByZWZlcmVuY2VzL3NldC1jb25maWcgcmV0dXJucyB0cnV0aHkgYnV0IGRvZXMgbm90IHBlcnNpc3QsIGFuZCA2IHN1cnZleWVkIHJlZmVyZW5jZSBwcm9qZWN0cyAoaGFyYWR5IC8gU3BheWRvIC8gUm9tYVJvZ292IC8gY29jb3MtY29kZS1tb2RlIC8gRnVucGxheUFJIC8gY29jb3MtY2xpKSBhbGwgY29uZmlybSBubyB3b3JraW5nIGFsdGVybmF0aXZlIGV4aXN0cy4gKipTd2l0Y2ggdmlhIHRoZSBjb2NvcyBwcmV2aWV3IGRyb3Bkb3duIGluIHRoZSBlZGl0b3IgdG9vbGJhciBpbnN0ZWFkKiogKGN1cnJlbnQgbW9kZTogXCIke3ByZXZpb3VzTW9kZSA/PyAndW5rbm93bid9XCIsIHJlcXVlc3RlZDogXCIke21vZGV9XCIpLiBUbyByZS1wcm9iZSB3aGV0aGVyIGEgbmV3ZXIgY29jb3MgYnVpbGQgbm93IGV4cG9zZXMgYSB3cml0ZSBwYXRoLCByZS1jYWxsIHdpdGggYXR0ZW1wdEFueXdheT10cnVlIChkaWFnbm9zdGljIG9ubHkg4oCUIGRvZXMgTk9UIGZyZWV6ZSB0aGUgZWRpdG9yKS5gLFxuICAgICAgICAgICAgICAgICAgICBkYXRhOiB7IHByZXZpb3VzTW9kZSwgcmVxdWVzdGVkTW9kZTogbW9kZSwgc3VwcG9ydGVkOiBmYWxzZSB9LFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocHJldmlvdXNNb2RlID09PSBtb2RlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgZGF0YTogeyBwcmV2aW91c01vZGUsIG5ld01vZGU6IG1vZGUsIGNvbmZpcm1lZDogdHJ1ZSwgbm9PcDogdHJ1ZSB9LFxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgY29jb3MgcHJldmlldyBhbHJlYWR5IHNldCB0byBcIiR7bW9kZX1cIjsgbm8gY2hhbmdlIGFwcGxpZWQuYCxcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdHlwZSBTdHJhdGVneSA9IHsgaWQ6IHN0cmluZzsgcGF5bG9hZDogKCkgPT4gUHJvbWlzZTxhbnk+IH07XG4gICAgICAgICAgICBjb25zdCBzdHJhdGVnaWVzOiBTdHJhdGVneVtdID0gW1xuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgaWQ6IFwic2V0LWNvbmZpZygncHJldmlldycsJ2N1cnJlbnQnLHtwbGF0Zm9ybTp2YWx1ZX0pXCIsXG4gICAgICAgICAgICAgICAgICAgIHBheWxvYWQ6ICgpID0+IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoXG4gICAgICAgICAgICAgICAgICAgICAgICAncHJlZmVyZW5jZXMnLCAnc2V0LWNvbmZpZycgYXMgYW55LFxuICAgICAgICAgICAgICAgICAgICAgICAgJ3ByZXZpZXcnIGFzIGFueSwgJ2N1cnJlbnQnIGFzIGFueSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHsgcGxhdGZvcm06IG1vZGUgfSBhcyBhbnksXG4gICAgICAgICAgICAgICAgICAgICksXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIGlkOiBcInNldC1jb25maWcoJ3ByZXZpZXcnLCdjdXJyZW50LnBsYXRmb3JtJyx2YWx1ZSwnZ2xvYmFsJylcIixcbiAgICAgICAgICAgICAgICAgICAgcGF5bG9hZDogKCkgPT4gRWRpdG9yLk1lc3NhZ2UucmVxdWVzdChcbiAgICAgICAgICAgICAgICAgICAgICAgICdwcmVmZXJlbmNlcycsICdzZXQtY29uZmlnJyBhcyBhbnksXG4gICAgICAgICAgICAgICAgICAgICAgICAncHJldmlldycgYXMgYW55LCAnY3VycmVudC5wbGF0Zm9ybScgYXMgYW55LFxuICAgICAgICAgICAgICAgICAgICAgICAgbW9kZSBhcyBhbnksICdnbG9iYWwnIGFzIGFueSxcbiAgICAgICAgICAgICAgICAgICAgKSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgaWQ6IFwic2V0LWNvbmZpZygncHJldmlldycsJ2N1cnJlbnQucGxhdGZvcm0nLHZhbHVlLCdsb2NhbCcpXCIsXG4gICAgICAgICAgICAgICAgICAgIHBheWxvYWQ6ICgpID0+IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoXG4gICAgICAgICAgICAgICAgICAgICAgICAncHJlZmVyZW5jZXMnLCAnc2V0LWNvbmZpZycgYXMgYW55LFxuICAgICAgICAgICAgICAgICAgICAgICAgJ3ByZXZpZXcnIGFzIGFueSwgJ2N1cnJlbnQucGxhdGZvcm0nIGFzIGFueSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1vZGUgYXMgYW55LCAnbG9jYWwnIGFzIGFueSxcbiAgICAgICAgICAgICAgICAgICAgKSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgaWQ6IFwic2V0LWNvbmZpZygncHJldmlldycsJ2N1cnJlbnQucGxhdGZvcm0nLHZhbHVlKVwiLFxuICAgICAgICAgICAgICAgICAgICBwYXlsb2FkOiAoKSA9PiBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KFxuICAgICAgICAgICAgICAgICAgICAgICAgJ3ByZWZlcmVuY2VzJywgJ3NldC1jb25maWcnIGFzIGFueSxcbiAgICAgICAgICAgICAgICAgICAgICAgICdwcmV2aWV3JyBhcyBhbnksICdjdXJyZW50LnBsYXRmb3JtJyBhcyBhbnksXG4gICAgICAgICAgICAgICAgICAgICAgICBtb2RlIGFzIGFueSxcbiAgICAgICAgICAgICAgICAgICAgKSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgXTtcbiAgICAgICAgICAgIGNvbnN0IGF0dGVtcHRzOiBBcnJheTx7IHN0cmF0ZWd5OiBzdHJpbmc7IHNldFJlc3VsdDogYW55OyBvYnNlcnZlZE1vZGU6IHN0cmluZyB8IG51bGw7IG1hdGNoZWQ6IGJvb2xlYW47IGVycm9yPzogc3RyaW5nIH0+ID0gW107XG4gICAgICAgICAgICBsZXQgd2lubmVyOiB0eXBlb2YgYXR0ZW1wdHNbbnVtYmVyXSB8IG51bGwgPSBudWxsO1xuICAgICAgICAgICAgZm9yIChjb25zdCBzIG9mIHN0cmF0ZWdpZXMpIHtcbiAgICAgICAgICAgICAgICBsZXQgc2V0UmVzdWx0OiBhbnkgPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgbGV0IGVycm9yOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgc2V0UmVzdWx0ID0gYXdhaXQgcy5wYXlsb2FkKCk7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgICAgICAgICAgZXJyb3IgPSBlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IG9ic2VydmVkTW9kZSA9IGF3YWl0IHF1ZXJ5Q3VycmVudCgpO1xuICAgICAgICAgICAgICAgIGNvbnN0IG1hdGNoZWQgPSBvYnNlcnZlZE1vZGUgPT09IG1vZGU7XG4gICAgICAgICAgICAgICAgYXR0ZW1wdHMucHVzaCh7IHN0cmF0ZWd5OiBzLmlkLCBzZXRSZXN1bHQsIG9ic2VydmVkTW9kZSwgbWF0Y2hlZCwgZXJyb3IgfSk7XG4gICAgICAgICAgICAgICAgaWYgKG1hdGNoZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgd2lubmVyID0gYXR0ZW1wdHNbYXR0ZW1wdHMubGVuZ3RoIC0gMV07XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghd2lubmVyKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIGVycm9yOiBgc2V0LWNvbmZpZyBzdHJhdGVnaWVzIGFsbCBmYWlsZWQgdG8gZmxpcCBwcmV2aWV3LmN1cnJlbnQucGxhdGZvcm0gZnJvbSBcIiR7cHJldmlvdXNNb2RlID8/ICd1bmtub3duJ31cIiB0byBcIiR7bW9kZX1cIi4gVHJpZWQgNCBzaGFwZXM7IGNvY29zIHJldHVybmVkIHZhbHVlcyBidXQgdGhlIHJlYWQtYmFjayBuZXZlciBtYXRjaGVkIHRoZSByZXF1ZXN0ZWQgbW9kZS4gVGhlIHNldC1jb25maWcgY2hhbm5lbCBtYXkgaGF2ZSBjaGFuZ2VkIGluIHRoaXMgY29jb3MgYnVpbGQ7IHN3aXRjaCB2aWEgdGhlIGNvY29zIHByZXZpZXcgZHJvcGRvd24gbWFudWFsbHkgZm9yIG5vdyBhbmQgcmVwb3J0IHdoaWNoIHNoYXBlIHdvcmtzLmAsXG4gICAgICAgICAgICAgICAgICAgIGRhdGE6IHsgcHJldmlvdXNNb2RlLCByZXF1ZXN0ZWRNb2RlOiBtb2RlLCBhdHRlbXB0cyB9LFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgZGF0YTogeyBwcmV2aW91c01vZGUsIG5ld01vZGU6IG1vZGUsIGNvbmZpcm1lZDogdHJ1ZSwgc3RyYXRlZ3k6IHdpbm5lci5zdHJhdGVneSwgYXR0ZW1wdHMgfSxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiBgY29jb3MgcHJldmlldyBzd2l0Y2hlZDogXCIke3ByZXZpb3VzTW9kZSA/PyAndW5rbm93bid9XCIg4oaSIFwiJHttb2RlfVwiIHZpYSAke3dpbm5lci5zdHJhdGVneX0uIFJlc3RvcmUgdmlhIGRlYnVnX3NldF9wcmV2aWV3X21vZGUobW9kZT1cIiR7cHJldmlvdXNNb2RlID8/ICdicm93c2VyJ31cIiwgY29uZmlybT10cnVlKSB3aGVuIGRvbmUgaWYgbmVlZGVkLmAsXG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgcHJlZmVyZW5jZXMvc2V0LWNvbmZpZyAncHJldmlldycgZmFpbGVkOiAke2Vycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKX1gIH07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGJhdGNoU2NyZWVuc2hvdChzYXZlUGF0aFByZWZpeD86IHN0cmluZywgZGVsYXlzTXM6IG51bWJlcltdID0gWzBdLCB3aW5kb3dUaXRsZT86IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBsZXQgcHJlZml4ID0gc2F2ZVBhdGhQcmVmaXg7XG4gICAgICAgICAgICBpZiAoIXByZWZpeCkge1xuICAgICAgICAgICAgICAgIC8vIGJhc2VuYW1lIGlzIHRoZSBwcmVmaXggc3RlbTsgcGVyLWl0ZXJhdGlvbiBmaWxlcyBleHRlbmQgaXRcbiAgICAgICAgICAgICAgICAvLyB3aXRoIGAtJHtpfS5wbmdgLiBDb250YWlubWVudCBjaGVjayBvbiB0aGUgcHJlZml4IHBhdGggaXNcbiAgICAgICAgICAgICAgICAvLyBzdWZmaWNpZW50IGJlY2F1c2UgcGF0aC5qb2luIHByZXNlcnZlcyBkaXJuYW1lIGZvciBhbnlcbiAgICAgICAgICAgICAgICAvLyBzdWZmaXggdGhlIGxvb3AgYXBwZW5kcy5cbiAgICAgICAgICAgICAgICBjb25zdCByZXNvbHZlZCA9IHRoaXMucmVzb2x2ZUF1dG9DYXB0dXJlRmlsZShgYmF0Y2gtJHtEYXRlLm5vdygpfWApO1xuICAgICAgICAgICAgICAgIGlmICghcmVzb2x2ZWQub2spIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogcmVzb2x2ZWQuZXJyb3IgfTtcbiAgICAgICAgICAgICAgICBwcmVmaXggPSByZXNvbHZlZC5maWxlUGF0aDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gdjIuOC4xIHJvdW5kLTEgZml4IChHZW1pbmkg8J+UtCArIENvZGV4IPCfn6EpOiBleHBsaWNpdCBwcmVmaXhcbiAgICAgICAgICAgICAgICAvLyBhbHNvIGdldHMgY29udGFpbm1lbnQtY2hlY2tlZC4gV2UgY2hlY2sgdGhlIHByZWZpeCBwYXRoXG4gICAgICAgICAgICAgICAgLy8gaXRzZWxmIOKAlCBldmVyeSBlbWl0dGVkIGZpbGUgbGl2ZXMgaW4gdGhlIHNhbWUgZGlybmFtZS5cbiAgICAgICAgICAgICAgICAvLyB2Mi44LjIgcmV0ZXN0IGZpeDogdXNlIHJlc29sdmVkUGF0aCBmb3IgcmVsYXRpdmUtcHJlZml4IHN1cHBvcnQuXG4gICAgICAgICAgICAgICAgY29uc3QgZ3VhcmQgPSB0aGlzLmFzc2VydFNhdmVQYXRoV2l0aGluUHJvamVjdChwcmVmaXgpO1xuICAgICAgICAgICAgICAgIGlmICghZ3VhcmQub2spIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZ3VhcmQuZXJyb3IgfTtcbiAgICAgICAgICAgICAgICBwcmVmaXggPSBndWFyZC5yZXNvbHZlZFBhdGg7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCB3aW4gPSB0aGlzLnBpY2tXaW5kb3cod2luZG93VGl0bGUpO1xuICAgICAgICAgICAgY29uc3QgY2FwdHVyZXM6IGFueVtdID0gW107XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGRlbGF5c01zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZGVsYXkgPSBkZWxheXNNc1tpXTtcbiAgICAgICAgICAgICAgICBpZiAoZGVsYXkgPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCBkZWxheSkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBmaWxlUGF0aCA9IGAke3ByZWZpeH0tJHtpfS5wbmdgO1xuICAgICAgICAgICAgICAgIGNvbnN0IGltYWdlID0gYXdhaXQgd2luLndlYkNvbnRlbnRzLmNhcHR1cmVQYWdlKCk7XG4gICAgICAgICAgICAgICAgY29uc3QgcG5nOiBCdWZmZXIgPSBpbWFnZS50b1BORygpO1xuICAgICAgICAgICAgICAgIGZzLndyaXRlRmlsZVN5bmMoZmlsZVBhdGgsIHBuZyk7XG4gICAgICAgICAgICAgICAgY2FwdHVyZXMucHVzaCh7IGluZGV4OiBpLCBkZWxheU1zOiBkZWxheSwgZmlsZVBhdGgsIHNpemU6IHBuZy5sZW5ndGggfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICBjb3VudDogY2FwdHVyZXMubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICB3aW5kb3dUaXRsZTogdHlwZW9mIHdpbi5nZXRUaXRsZSA9PT0gJ2Z1bmN0aW9uJyA/IHdpbi5nZXRUaXRsZSgpIDogJycsXG4gICAgICAgICAgICAgICAgICAgIGNhcHR1cmVzLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogYENhcHR1cmVkICR7Y2FwdHVyZXMubGVuZ3RofSBzY3JlZW5zaG90c2AsXG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycikgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIHYyLjcuMCAjMzogcHJldmlldy11cmwgLyBxdWVyeS1kZXZpY2VzIGhhbmRsZXJzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gICAgcHJpdmF0ZSBhc3luYyBwcmV2aWV3VXJsKGFjdGlvbjogJ3F1ZXJ5JyB8ICdvcGVuJyA9ICdxdWVyeScpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgdXJsOiBzdHJpbmcgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdwcmV2aWV3JywgJ3F1ZXJ5LXByZXZpZXctdXJsJyBhcyBhbnkpIGFzIGFueTtcbiAgICAgICAgICAgIGlmICghdXJsIHx8IHR5cGVvZiB1cmwgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAncHJldmlldy9xdWVyeS1wcmV2aWV3LXVybCByZXR1cm5lZCBlbXB0eSByZXN1bHQ7IGNoZWNrIHRoYXQgY29jb3MgcHJldmlldyBzZXJ2ZXIgaXMgcnVubmluZycgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGRhdGE6IGFueSA9IHsgdXJsIH07XG4gICAgICAgICAgICBpZiAoYWN0aW9uID09PSAnb3BlbicpIHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAvLyBMYXp5IHJlcXVpcmUgc28gc21va2UgLyBub24tRWxlY3Ryb24gY29udGV4dHMgZG9uJ3QgZmF1bHRcbiAgICAgICAgICAgICAgICAgICAgLy8gb24gbWlzc2luZyBlbGVjdHJvbi5cbiAgICAgICAgICAgICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby12YXItcmVxdWlyZXNcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZWxlY3Ryb24gPSByZXF1aXJlKCdlbGVjdHJvbicpO1xuICAgICAgICAgICAgICAgICAgICAvLyB2Mi43LjEgcmV2aWV3IGZpeCAoY29kZXgg8J+foSArIGdlbWluaSDwn5+hKTogb3BlbkV4dGVybmFsXG4gICAgICAgICAgICAgICAgICAgIC8vIHJlc29sdmVzIHdoZW4gdGhlIE9TIGxhdW5jaGVyIGlzIGludm9rZWQsIG5vdCB3aGVuIHRoZVxuICAgICAgICAgICAgICAgICAgICAvLyBwYWdlIHJlbmRlcnMuIFVzZSBcImxhdW5jaFwiIHdvcmRpbmcgdG8gYXZvaWQgdGhlIEFJXG4gICAgICAgICAgICAgICAgICAgIC8vIG1pc3JlYWRpbmcgXCJvcGVuZWRcIiBhcyBhIGNvbmZpcm1lZCBwYWdlLWxvYWQuXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IGVsZWN0cm9uLnNoZWxsLm9wZW5FeHRlcm5hbCh1cmwpO1xuICAgICAgICAgICAgICAgICAgICBkYXRhLmxhdW5jaGVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgICAgICAgICBkYXRhLmxhdW5jaGVkID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIGRhdGEubGF1bmNoRXJyb3IgPSBlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gUmVmbGVjdCBhY3R1YWwgbGF1bmNoIG91dGNvbWUgaW4gdGhlIHRvcC1sZXZlbCBtZXNzYWdlIHNvIEFJXG4gICAgICAgICAgICAvLyBzZWVzIFwibGF1bmNoIGZhaWxlZFwiIGluc3RlYWQgb2YgbWlzbGVhZGluZyBcIk9wZW5lZCAuLi5cIiB3aGVuXG4gICAgICAgICAgICAvLyBvcGVuRXh0ZXJuYWwgdGhyZXcgKGdlbWluaSDwn5+hKS5cbiAgICAgICAgICAgIGNvbnN0IG1lc3NhZ2UgPSBhY3Rpb24gPT09ICdvcGVuJ1xuICAgICAgICAgICAgICAgID8gKGRhdGEubGF1bmNoZWRcbiAgICAgICAgICAgICAgICAgICAgPyBgTGF1bmNoZWQgJHt1cmx9IGluIGRlZmF1bHQgYnJvd3NlciAocGFnZSByZW5kZXIgbm90IGF3YWl0ZWQpYFxuICAgICAgICAgICAgICAgICAgICA6IGBSZXR1cm5lZCBVUkwgJHt1cmx9IGJ1dCBsYXVuY2ggZmFpbGVkOiAke2RhdGEubGF1bmNoRXJyb3J9YClcbiAgICAgICAgICAgICAgICA6IHVybDtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGEsIG1lc3NhZ2UgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpIH07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyB2Mi44LjAgVC1WMjgtMzogUElFIHBsYXkgLyBzdG9wLiBSb3V0ZXMgdGhyb3VnaCBzY2VuZS1zY3JpcHQgc28gdGhlXG4gICAgLy8gdHlwZWQgY2NlLlNjZW5lRmFjYWRlLmNoYW5nZVByZXZpZXdQbGF5U3RhdGUgaXMgcmVhY2hlZCB2aWEgdGhlXG4gICAgLy8gZG9jdW1lbnRlZCBleGVjdXRlLXNjZW5lLXNjcmlwdCBjaGFubmVsLlxuICAgIC8vXG4gICAgLy8gdjIuOC4zIFQtVjI4My0zIHJldGVzdCBmaW5kaW5nOiBjb2NvcyBzb21ldGltZXMgbG9nc1xuICAgIC8vIFwiRmFpbGVkIHRvIHJlZnJlc2ggdGhlIGN1cnJlbnQgc2NlbmVcIiBpbnNpZGUgY2hhbmdlUHJldmlld1BsYXlTdGF0ZVxuICAgIC8vIGV2ZW4gd2hlbiB0aGUgY2FsbCByZXR1cm5zIHdpdGhvdXQgdGhyb3dpbmcuIE9ic2VydmVkIGluIGNvY29zXG4gICAgLy8gMy44LjcgLyBlbWJlZGRlZCBwcmV2aWV3IG1vZGUuIFRoZSByb290IGNhdXNlIGlzIHVuY2xlYXIgKG1heVxuICAgIC8vIHJlbGF0ZSB0byBjdW11bGF0aXZlIHNjZW5lLWRpcnR5IC8gZW1iZWRkZWQtbW9kZSB0aW1pbmcgL1xuICAgIC8vIGluaXRpYWwtbG9hZCBjb21wbGFpbnQpLCBidXQgdGhlIHZpc2libGUgZWZmZWN0IGlzIHRoYXQgUElFIHN0YXRlXG4gICAgLy8gY2hhbmdlcyBpbmNvbXBsZXRlbHkuIFdlIG5vdyBTQ0FOIHRoZSBjYXB0dXJlZCBzY2VuZS1zY3JpcHQgbG9nc1xuICAgIC8vIGZvciB0aGF0IGVycm9yIHN0cmluZyBhbmQgc3VyZmFjZSBpdCB0byB0aGUgQUkgYXMgYSBzdHJ1Y3R1cmVkXG4gICAgLy8gd2FybmluZyBpbnN0ZWFkIG9mIGxldHRpbmcgaXQgaGlkZSBpbnNpZGUgZGF0YS5jYXB0dXJlZExvZ3MuXG4gICAgLy8gdjIuOS4wIFQtVjI5LTE6IGVkaXRvci1oZWFsdGggcHJvYmUuIERldGVjdHMgc2NlbmUtc2NyaXB0IGZyZWV6ZVxuICAgIC8vIGJ5IHJ1bm5pbmcgdHdvIHByb2JlcyBpbiBwYXJhbGxlbDpcbiAgICAvLyAgIC0gaG9zdCBwcm9iZTogRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnZGV2aWNlJywgJ3F1ZXJ5Jykg4oCUIGdvZXNcbiAgICAvLyAgICAgdG8gdGhlIGVkaXRvciBtYWluIHByb2Nlc3MsIE5PVCB0aGUgc2NlbmUtc2NyaXB0IHJlbmRlcmVyLlxuICAgIC8vICAgICBUaGlzIHN0YXlzIHJlc3BvbnNpdmUgZXZlbiB3aGVuIHNjZW5lIGlzIHdlZGdlZC5cbiAgICAvLyAgIC0gc2NlbmUgcHJvYmU6IGV4ZWN1dGUtc2NlbmUtc2NyaXB0IGludm9jYXRpb24gd2l0aCBhIHRyaXZpYWxcbiAgICAvLyAgICAgYGV2YWxFY2hvYCB0ZXN0ICh1c2VzIGFuIGV4aXN0aW5nIHNhZmUgc2NlbmUgbWV0aG9kLCB3aXRoXG4gICAgLy8gICAgIHdyYXBwaW5nIHRpbWVvdXQpLiBUaW1lcyBvdXQg4oaSIHNjZW5lLXNjcmlwdCBmcm96ZW4uXG4gICAgLy9cbiAgICAvLyBEZXNpZ25lZCBmb3IgdGhlIHBvc3QtcHJldmlld19jb250cm9sKHN0YXJ0KSBmcmVlemUgcGF0dGVybiBpblxuICAgIC8vIGxhbmRtaW5lICMxNjogQUkgY2FsbHMgcHJldmlld19jb250cm9sKHN0YXJ0KSwgdGhlblxuICAgIC8vIGNoZWNrX2VkaXRvcl9oZWFsdGgsIGFuZCBpZiBzY2VuZUFsaXZlPWZhbHNlIHN0b3BzIGlzc3VpbmcgbW9yZVxuICAgIC8vIHNjZW5lIGNhbGxzIGFuZCBzdXJmYWNlcyB0aGUgcmVjb3ZlcnkgaGludCBpbnN0ZWFkIG9mIGhhbmdpbmcuXG4gICAgcHJpdmF0ZSBhc3luYyBjaGVja0VkaXRvckhlYWx0aChzY2VuZVRpbWVvdXRNczogbnVtYmVyID0gMTUwMCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHQwID0gRGF0ZS5ub3coKTtcbiAgICAgICAgLy8gSG9zdCBwcm9iZSDigJQgc2hvdWxkIGFsd2F5cyByZXNvbHZlIGZhc3QuXG4gICAgICAgIGxldCBob3N0QWxpdmUgPSBmYWxzZTtcbiAgICAgICAgbGV0IGhvc3RFcnJvcjogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdkZXZpY2UnLCAncXVlcnknKTtcbiAgICAgICAgICAgIGhvc3RBbGl2ZSA9IHRydWU7XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICBob3N0RXJyb3IgPSBlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycik7XG4gICAgICAgIH1cbiAgICAgICAgLy8gU2NlbmUgcHJvYmUg4oCUIHYyLjkuNSByZXZpZXcgZml4IChHZW1pbmkg8J+UtCArIENvZGV4IPCflLQgKyBDbGF1ZGUg8J+foSk6XG4gICAgICAgIC8vIHYyLjkuMCB1c2VkIGdldEN1cnJlbnRTY2VuZUluZm8gdmlhIGV4ZWN1dGUtc2NlbmUtc2NyaXB0IHdyYXBwZXIsXG4gICAgICAgIC8vIGJ1dCB0aGF0IHNjZW5lLXNpZGUgbWV0aG9kIGp1c3QgcmVhZHMgYGRpcmVjdG9yLmdldFNjZW5lKClgXG4gICAgICAgIC8vIChjYWNoZWQgc2luZ2xldG9uKSBhbmQgcmVzb2x2ZXMgPDFtcyBldmVuIHdoZW4gdGhlIHNjZW5lLXNjcmlwdFxuICAgICAgICAvLyByZW5kZXJlciBpcyB2aXNpYmx5IGZyb3plbiDigJQgY29uZmlybWVkIGxpdmUgZHVyaW5nIHYyLjkuMSByZXRlc3RcbiAgICAgICAgLy8gd2hlcmUgc2NlbmVBbGl2ZSByZXR1cm5lZCB0cnVlIHdoaWxlIHVzZXIgcmVwb3J0ZWQgdGhlIGVkaXRvclxuICAgICAgICAvLyB3YXMgc3Bpbm5pbmcgYW5kIHJlcXVpcmVkIEN0cmwrUi5cbiAgICAgICAgLy9cbiAgICAgICAgLy8gU3dpdGNoIHRvIHR3byBwcm9iZXMgdGhhdCBleGVyY2lzZSBkaWZmZXJlbnQgcGF0aHM6XG4gICAgICAgIC8vICAxLiBgc2NlbmUvcXVlcnktaXMtcmVhZHlgICh0eXBlZCBjaGFubmVsIOKAlCBzZWVcbiAgICAgICAgLy8gICAgIHNjZW5lL0B0eXBlcy9tZXNzYWdlLmQudHM6MjU3KS4gRGlyZWN0IElQQyBpbnRvIHRoZSBzY2VuZVxuICAgICAgICAvLyAgICAgbW9kdWxlOyB3aWxsIGhhbmcgaWYgdGhlIHNjZW5lLXNjcmlwdCByZW5kZXJlciBpcyB3ZWRnZWQuXG4gICAgICAgIC8vICAyLiBgc2NlbmUvZXhlY3V0ZS1zY2VuZS1zY3JpcHRgIHJ1bldpdGhDYXB0dXJlKCdxdWVyeU5vZGVEdW1wJylcbiAgICAgICAgLy8gICAgIG9uIGEga25vd24gVVVJRCBmb3JjaW5nIGFuIGFjdHVhbCBzY2VuZS1ncmFwaCB3YWxrIOKAlCBjb3ZlcnNcbiAgICAgICAgLy8gICAgIHRoZSBjYXNlIHdoZXJlIHNjZW5lIElQQyBpcyBhbGl2ZSBidXQgdGhlIHJ1bldpdGhDYXB0dXJlIC9cbiAgICAgICAgLy8gICAgIGV4ZWN1dGUtc2NlbmUtc2NyaXB0IHBhdGggaXMgdGhlIHdlZGdlZCBvbmUuXG4gICAgICAgIC8vIFdlIGRlY2xhcmUgc2NlbmUgaGVhbHRoeSBvbmx5IHdoZW4gQk9USCBwcm9iZXMgcmVzb2x2ZSB3aXRoaW5cbiAgICAgICAgLy8gdGhlIHRpbWVvdXQuIEVhY2ggcHJvYmUgZ2V0cyBpdHMgb3duIHRpbWVvdXQgcmFjZSBzbyBhIHN0dWNrXG4gICAgICAgIC8vIHNjZW5lLXNjcmlwdCBkb2Vzbid0IGNvbXBvdW5kIGRlbGF5cy5cbiAgICAgICAgY29uc3QgcHJvYmVXaXRoVGltZW91dCA9IGFzeW5jIDxUPihwOiBQcm9taXNlPFQ+LCBsYWJlbDogc3RyaW5nKTogUHJvbWlzZTx7IG9rOiB0cnVlOyB2YWx1ZTogVDsgbGF0ZW5jeU1zOiBudW1iZXIgfSB8IHsgb2s6IGZhbHNlOyBlcnJvcjogc3RyaW5nOyBsYXRlbmN5TXM6IG51bWJlciB9PiA9PiB7XG4gICAgICAgICAgICBjb25zdCBzdGFydCA9IERhdGUubm93KCk7XG4gICAgICAgICAgICBjb25zdCB0aW1lb3V0ID0gbmV3IFByb21pc2U8eyB0aW1lZE91dDogdHJ1ZSB9PihyZXNvbHZlID0+XG4gICAgICAgICAgICAgICAgc2V0VGltZW91dCgoKSA9PiByZXNvbHZlKHsgdGltZWRPdXQ6IHRydWUgfSksIHNjZW5lVGltZW91dE1zKSxcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHI6IGFueSA9IGF3YWl0IFByb21pc2UucmFjZShbcC50aGVuKHYgPT4gKHsgdmFsdWU6IHYsIHRpbWVkT3V0OiBmYWxzZSB9KSksIHRpbWVvdXRdKTtcbiAgICAgICAgICAgICAgICBjb25zdCBsYXRlbmN5TXMgPSBEYXRlLm5vdygpIC0gc3RhcnQ7XG4gICAgICAgICAgICAgICAgaWYgKHI/LnRpbWVkT3V0KSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBgJHtsYWJlbH0gcHJvYmUgdGltZWQgb3V0IGFmdGVyICR7c2NlbmVUaW1lb3V0TXN9bXNgLCBsYXRlbmN5TXMgfTtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBvazogdHJ1ZSwgdmFsdWU6IHIudmFsdWUsIGxhdGVuY3lNcyB9O1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBgJHtsYWJlbH0gcHJvYmUgdGhyZXc6ICR7ZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpfWAsIGxhdGVuY3lNczogRGF0ZS5ub3coKSAtIHN0YXJ0IH07XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIGNvbnN0IGlzUmVhZHlQID0gcHJvYmVXaXRoVGltZW91dChcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LWlzLXJlYWR5JyBhcyBhbnkpIGFzIFByb21pc2U8Ym9vbGVhbj4sXG4gICAgICAgICAgICAnc2NlbmUvcXVlcnktaXMtcmVhZHknLFxuICAgICAgICApO1xuICAgICAgICAvLyB2Mi45LjYgcm91bmQtMiBmaXggKENvZGV4IPCflLQgKyBDbGF1ZGUg8J+foSk6IHYyLjkuNSB1c2VkXG4gICAgICAgIC8vIGBzY2VuZS9xdWVyeS1jdXJyZW50LXNjZW5lYCBjaGFpbmVkIGludG8gYHF1ZXJ5LW5vZGVgIOKAlFxuICAgICAgICAvLyBgcXVlcnktY3VycmVudC1zY2VuZWAgaXMgTk9UIGluIHNjZW5lL0B0eXBlcy9tZXNzYWdlLmQudHNcbiAgICAgICAgLy8gKG9ubHkgYHF1ZXJ5LWlzLXJlYWR5YCBhbmQgYHF1ZXJ5LW5vZGUtdHJlZWAvZXRjLiBhcmUgdHlwZWQpLlxuICAgICAgICAvLyBBbiB1bmtub3duIGNoYW5uZWwgbWF5IHJlc29sdmUgZmFzdCB3aXRoIGdhcmJhZ2Ugb24gc29tZSBjb2Nvc1xuICAgICAgICAvLyBidWlsZHMsIGxlYWRpbmcgdG8gZmFsc2UtaGVhbHRoeSByZXBvcnRzLlxuICAgICAgICAvL1xuICAgICAgICAvLyBTd2l0Y2ggdG8gYHNjZW5lL3F1ZXJ5LW5vZGUtdHJlZWAgKHR5cGVkOiBzY2VuZS9AdHlwZXMvXG4gICAgICAgIC8vIG1lc3NhZ2UuZC50czoyNzMpIHdpdGggbm8gYXJnIOKAlCByZXR1cm5zIHRoZSBmdWxsIElOb2RlW10gdHJlZS5cbiAgICAgICAgLy8gVGhpcyBmb3JjZXMgYSByZWFsIGdyYXBoIHdhbGsgdGhyb3VnaCB0aGUgc2NlbmUtc2NyaXB0IHJlbmRlcmVyXG4gICAgICAgIC8vIGFuZCBpcyB0aGUgcmlnaHQgc3RyZW5ndGggb2YgcHJvYmUgZm9yIGxpdmVuZXNzIGRldGVjdGlvbi5cbiAgICAgICAgY29uc3QgZHVtcFAgPSBwcm9iZVdpdGhUaW1lb3V0KFxuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktbm9kZS10cmVlJyBhcyBhbnkpIGFzIFByb21pc2U8YW55PixcbiAgICAgICAgICAgICdzY2VuZS9xdWVyeS1ub2RlLXRyZWUnLFxuICAgICAgICApO1xuICAgICAgICBjb25zdCBbaXNSZWFkeSwgZHVtcF0gPSBhd2FpdCBQcm9taXNlLmFsbChbaXNSZWFkeVAsIGR1bXBQXSk7XG4gICAgICAgIGNvbnN0IHNjZW5lTGF0ZW5jeU1zID0gTWF0aC5tYXgoaXNSZWFkeS5sYXRlbmN5TXMsIGR1bXAubGF0ZW5jeU1zKTtcbiAgICAgICAgLy8gdjIuOS42IHJvdW5kLTIgZml4IChDb2RleCDwn5S0IHNpbmdsZSDigJQgbnVsbCBVVUlEIGZhbHNlLWhlYWx0aHkpOlxuICAgICAgICAvLyByZXF1aXJlIEJPVEggcHJvYmVzIHRvIHJlc29sdmUgQU5EIHF1ZXJ5LWlzLXJlYWR5ID09PSB0cnVlIEFORFxuICAgICAgICAvLyBxdWVyeS1ub2RlLXRyZWUgdG8gcmV0dXJuIG5vbi1udWxsLlxuICAgICAgICAvLyB2Mi45Ljcgcm91bmQtMyBmaXggKENvZGV4IHIzIPCfn6EgKyBDbGF1ZGUgcjMg8J+foSBpbmZvcm1hdGlvbmFsKTpcbiAgICAgICAgLy8gdGlnaHRlbiBmdXJ0aGVyIOKAlCBhIHJldHVybmVkIGVtcHR5IGFycmF5IGBbXWAgaXMgbnVsbC1zYWZlIGJ1dFxuICAgICAgICAvLyBzZW1hbnRpY2FsbHkgbWVhbnMgXCJubyBzY2VuZSBsb2FkZWRcIiwgd2hpY2ggaXMgTk9UIGFsaXZlIGluIHRoZVxuICAgICAgICAvLyBzZW5zZSB0aGUgQUkgY2FyZXMgYWJvdXQgKGEgZnJvemVuIHJlbmRlcmVyIG1pZ2h0IGFsc28gcHJvZHVjZVxuICAgICAgICAvLyB6ZXJvLXRyZWUgcmVzcG9uc2VzIG9uIHNvbWUgYnVpbGRzKS4gUmVxdWlyZSBub24tZW1wdHkgYXJyYXkuXG4gICAgICAgIGNvbnN0IGR1bXBWYWxpZCA9IGR1bXAub2tcbiAgICAgICAgICAgICYmIGR1bXAudmFsdWUgIT09IG51bGxcbiAgICAgICAgICAgICYmIGR1bXAudmFsdWUgIT09IHVuZGVmaW5lZFxuICAgICAgICAgICAgJiYgKCFBcnJheS5pc0FycmF5KGR1bXAudmFsdWUpIHx8IGR1bXAudmFsdWUubGVuZ3RoID4gMCk7XG4gICAgICAgIGNvbnN0IHNjZW5lQWxpdmUgPSBpc1JlYWR5Lm9rICYmIGR1bXBWYWxpZCAmJiBpc1JlYWR5LnZhbHVlID09PSB0cnVlO1xuICAgICAgICBsZXQgc2NlbmVFcnJvcjogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgICAgIGlmICghaXNSZWFkeS5vaykgc2NlbmVFcnJvciA9IGlzUmVhZHkuZXJyb3I7XG4gICAgICAgIGVsc2UgaWYgKCFkdW1wLm9rKSBzY2VuZUVycm9yID0gZHVtcC5lcnJvcjtcbiAgICAgICAgZWxzZSBpZiAoIWR1bXBWYWxpZCkgc2NlbmVFcnJvciA9IGBzY2VuZS9xdWVyeS1ub2RlLXRyZWUgcmV0dXJuZWQgJHtBcnJheS5pc0FycmF5KGR1bXAudmFsdWUpICYmIGR1bXAudmFsdWUubGVuZ3RoID09PSAwID8gJ2FuIGVtcHR5IGFycmF5IChubyBzY2VuZSBsb2FkZWQgb3Igc2NlbmUtc2NyaXB0IGluIGRlZ3JhZGVkIHN0YXRlKScgOiBKU09OLnN0cmluZ2lmeShkdW1wLnZhbHVlKX0gKGV4cGVjdGVkIG5vbi1lbXB0eSBJTm9kZVtdKWA7XG4gICAgICAgIGVsc2UgaWYgKGlzUmVhZHkudmFsdWUgIT09IHRydWUpIHNjZW5lRXJyb3IgPSBgc2NlbmUvcXVlcnktaXMtcmVhZHkgcmV0dXJuZWQgJHtKU09OLnN0cmluZ2lmeShpc1JlYWR5LnZhbHVlKX0gKGV4cGVjdGVkIHRydWUpYDtcbiAgICAgICAgY29uc3Qgc3VnZ2VzdGlvbiA9ICFob3N0QWxpdmVcbiAgICAgICAgICAgID8gJ2NvY29zIGVkaXRvciBob3N0IHByb2Nlc3MgdW5yZXNwb25zaXZlIOKAlCB2ZXJpZnkgdGhlIGVkaXRvciBpcyBydW5uaW5nIGFuZCB0aGUgY29jb3MtbWNwLXNlcnZlciBleHRlbnNpb24gaXMgbG9hZGVkLidcbiAgICAgICAgICAgIDogIXNjZW5lQWxpdmVcbiAgICAgICAgICAgICAgICA/ICdjb2NvcyBlZGl0b3Igc2NlbmUtc2NyaXB0IGlzIGZyb3plbiAobGlrZWx5IGxhbmRtaW5lICMxNiBhZnRlciBwcmV2aWV3X2NvbnRyb2woc3RhcnQpKS4gUHJlc3MgQ3RybCtSIGluIHRoZSBjb2NvcyBlZGl0b3IgdG8gcmVsb2FkIHRoZSBzY2VuZS1zY3JpcHQgcmVuZGVyZXI7IGRvIG5vdCBpc3N1ZSBtb3JlIHNjZW5lLyogdG9vbCBjYWxscyB1bnRpbCByZWNvdmVyZWQuJ1xuICAgICAgICAgICAgICAgIDogJ2VkaXRvciBoZWFsdGh5OyBzY2VuZS1zY3JpcHQgYW5kIGhvc3QgYm90aCByZXNwb25zaXZlLic7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgIGhvc3RBbGl2ZSxcbiAgICAgICAgICAgICAgICBzY2VuZUFsaXZlLFxuICAgICAgICAgICAgICAgIHNjZW5lTGF0ZW5jeU1zLFxuICAgICAgICAgICAgICAgIHNjZW5lVGltZW91dE1zLFxuICAgICAgICAgICAgICAgIGhvc3RFcnJvcixcbiAgICAgICAgICAgICAgICBzY2VuZUVycm9yLFxuICAgICAgICAgICAgICAgIHRvdGFsUHJvYmVNczogRGF0ZS5ub3coKSAtIHQwLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIG1lc3NhZ2U6IHN1Z2dlc3Rpb24sXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gdjIuOS54IHBvbGlzaCAoQ29kZXggcjEgc2luZ2xlLfCfn6EgZnJvbSB2Mi44LjEgcmV2aWV3KTogbW9kdWxlLWxldmVsXG4gICAgLy8gaW4tZmxpZ2h0IGd1YXJkIHByZXZlbnRzIEFJIHdvcmtmbG93cyBmcm9tIGZpcmluZyB0d28gUElFIHN0YXRlXG4gICAgLy8gY2hhbmdlcyBjb25jdXJyZW50bHkuIFRoZSBjb2NvcyBlbmdpbmUgcmFjZSBpbiBsYW5kbWluZSAjMTYgbWFrZXNcbiAgICAvLyBkb3VibGUtZmlyZSBwYXJ0aWN1bGFybHkgZGFuZ2Vyb3VzIOKAlCB0aGUgc2Vjb25kIGNhbGwgd291bGQgaGl0XG4gICAgLy8gYSBwYXJ0aWFsbHktaW5pdGlhbGlzZWQgUHJldmlld1NjZW5lRmFjYWRlLiBSZWplY3Qgb3ZlcmxhcC5cbiAgICBwcml2YXRlIHN0YXRpYyBwcmV2aWV3Q29udHJvbEluRmxpZ2h0ID0gZmFsc2U7XG5cbiAgICBwcml2YXRlIGFzeW5jIHByZXZpZXdDb250cm9sKG9wOiAnc3RhcnQnIHwgJ3N0b3AnLCBhY2tub3dsZWRnZUZyZWV6ZVJpc2s6IGJvb2xlYW4gPSBmYWxzZSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIC8vIHYyLjkueCBwYXJrIGdhdGU6IG9wPVwic3RhcnRcIiBpcyBrbm93biB0byBmcmVlemUgY29jb3MgMy44LjdcbiAgICAgICAgLy8gKGxhbmRtaW5lICMxNikuIFJlZnVzZSB1bmxlc3MgdGhlIGNhbGxlciBoYXMgZXhwbGljaXRseVxuICAgICAgICAvLyBhY2tub3dsZWRnZWQgdGhlIHJpc2suIG9wPVwic3RvcFwiIGlzIGFsd2F5cyBzYWZlIOKAlCBieXBhc3MgdGhlXG4gICAgICAgIC8vIGdhdGUgc28gY2FsbGVycyBjYW4gcmVjb3ZlciBmcm9tIGEgaGFsZi1hcHBsaWVkIHN0YXRlLlxuICAgICAgICBpZiAob3AgPT09ICdzdGFydCcgJiYgIWFja25vd2xlZGdlRnJlZXplUmlzaykge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBlcnJvcjogJ2RlYnVnX3ByZXZpZXdfY29udHJvbChvcD1cInN0YXJ0XCIpIGlzIHBhcmtlZCBkdWUgdG8gbGFuZG1pbmUgIzE2IOKAlCB0aGUgY29jb3MgMy44Ljcgc29mdFJlbG9hZFNjZW5lIHJhY2UgZnJlZXplcyB0aGUgZWRpdG9yIHJlZ2FyZGxlc3Mgb2YgcHJldmlldyBtb2RlICh2ZXJpZmllZCBlbWJlZGRlZCArIGJyb3dzZXIpLiB2Mi4xMCBjcm9zcy1yZXBvIHJlZnJlc2ggY29uZmlybWVkIG5vIHJlZmVyZW5jZSBwcm9qZWN0IHNoaXBzIGEgc2FmZXIgcGF0aCDigJQgaGFyYWR5IGFuZCBjb2Nvcy1jb2RlLW1vZGUgdXNlIHRoZSBzYW1lIGNoYW5uZWwgZmFtaWx5IGFuZCBoaXQgdGhlIHNhbWUgcmFjZS4gKipTdHJvbmdseSBwcmVmZXJyZWQgYWx0ZXJuYXRpdmVzKiogKHBsZWFzZSB1c2UgdGhlc2UgaW5zdGVhZCk6IChhKSBkZWJ1Z19jYXB0dXJlX3ByZXZpZXdfc2NyZWVuc2hvdChtb2RlPVwiZW1iZWRkZWRcIikgaW4gRURJVCBtb2RlIChubyBQSUUgbmVlZGVkKTsgKGIpIGRlYnVnX2dhbWVfY29tbWFuZCh0eXBlPVwic2NyZWVuc2hvdFwiKSB2aWEgR2FtZURlYnVnQ2xpZW50IG9uIGJyb3dzZXIgcHJldmlldyBsYXVuY2hlZCB2aWEgZGVidWdfcHJldmlld191cmwoYWN0aW9uPVwib3BlblwiKS4gT25seSByZS1jYWxsIHdpdGggYWNrbm93bGVkZ2VGcmVlemVSaXNrPXRydWUgaWYgbmVpdGhlciBhbHRlcm5hdGl2ZSBmaXRzIEFORCB0aGUgaHVtYW4gdXNlciBpcyBwcmVwYXJlZCB0byBwcmVzcyBDdHJsK1IgaW4gY29jb3MgaWYgdGhlIGVkaXRvciBmcmVlemVzLicsXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIGlmIChEZWJ1Z1Rvb2xzLnByZXZpZXdDb250cm9sSW5GbGlnaHQpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgZXJyb3I6ICdBbm90aGVyIGRlYnVnX3ByZXZpZXdfY29udHJvbCBjYWxsIGlzIGFscmVhZHkgaW4gZmxpZ2h0LiBQSUUgc3RhdGUgY2hhbmdlcyBnbyB0aHJvdWdoIGNvY29zXFwnIFNjZW5lRmFjYWRlRlNNIGFuZCBkb3VibGUtZmlyaW5nIGR1cmluZyB0aGUgaW4tZmxpZ2h0IHdpbmRvdyByaXNrcyBjb21wb3VuZGluZyB0aGUgbGFuZG1pbmUgIzE2IGZyZWV6ZS4gV2FpdCBmb3IgdGhlIHByZXZpb3VzIGNhbGwgdG8gcmVzb2x2ZSwgdGhlbiByZXRyeS4nLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICBEZWJ1Z1Rvb2xzLnByZXZpZXdDb250cm9sSW5GbGlnaHQgPSB0cnVlO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMucHJldmlld0NvbnRyb2xJbm5lcihvcCk7XG4gICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICBEZWJ1Z1Rvb2xzLnByZXZpZXdDb250cm9sSW5GbGlnaHQgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgcHJldmlld0NvbnRyb2xJbm5lcihvcDogJ3N0YXJ0JyB8ICdzdG9wJyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHN0YXRlID0gb3AgPT09ICdzdGFydCc7XG4gICAgICAgIGNvbnN0IHJlc3VsdDogVG9vbFJlc3BvbnNlID0gYXdhaXQgcnVuU2NlbmVNZXRob2RBc1Rvb2xSZXNwb25zZSgnY2hhbmdlUHJldmlld1BsYXlTdGF0ZScsIFtzdGF0ZV0pO1xuICAgICAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgIC8vIFNjYW4gY2FwdHVyZWRMb2dzIGZvciB0aGUga25vd24gY29jb3Mgd2FybmluZyBzbyBBSVxuICAgICAgICAgICAgLy8gZG9lc24ndCBnZXQgYSBtaXNsZWFkaW5nIGJhcmUtc3VjY2VzcyBlbnZlbG9wZS5cbiAgICAgICAgICAgIGNvbnN0IGNhcHR1cmVkID0gKHJlc3VsdCBhcyBhbnkpLmNhcHR1cmVkTG9ncyBhcyBBcnJheTx7IGxldmVsOiBzdHJpbmc7IG1lc3NhZ2U6IHN0cmluZyB9PiB8IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lUmVmcmVzaEVycm9yID0gY2FwdHVyZWQ/LmZpbmQoXG4gICAgICAgICAgICAgICAgZSA9PiBlPy5sZXZlbCA9PT0gJ2Vycm9yJyAmJiAvRmFpbGVkIHRvIHJlZnJlc2ggdGhlIGN1cnJlbnQgc2NlbmUvaS50ZXN0KGU/Lm1lc3NhZ2UgPz8gJycpLFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGNvbnN0IHdhcm5pbmdzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICAgICAgaWYgKHNjZW5lUmVmcmVzaEVycm9yKSB7XG4gICAgICAgICAgICAgICAgd2FybmluZ3MucHVzaChcbiAgICAgICAgICAgICAgICAgICAgJ2NvY29zIGVuZ2luZSB0aHJldyBcIkZhaWxlZCB0byByZWZyZXNoIHRoZSBjdXJyZW50IHNjZW5lXCIgaW5zaWRlIHNvZnRSZWxvYWRTY2VuZSBkdXJpbmcgUElFIHN0YXRlIGNoYW5nZS4gVGhpcyBpcyBhIGNvY29zIDMuOC43IHJhY2UgZmlyZWQgYnkgY2hhbmdlUHJldmlld1BsYXlTdGF0ZSBpdHNlbGYsIG5vdCBnYXRlZCBieSBwcmV2aWV3IG1vZGUgKHZlcmlmaWVkIGluIGJvdGggZW1iZWRkZWQgYW5kIGJyb3dzZXIgbW9kZXMg4oCUIHNlZSBDTEFVREUubWQgbGFuZG1pbmUgIzE2KS4gUElFIGhhcyBOT1QgYWN0dWFsbHkgc3RhcnRlZCBhbmQgdGhlIGNvY29zIGVkaXRvciBtYXkgZnJlZXplIChzcGlubmluZyBpbmRpY2F0b3IpIHJlcXVpcmluZyB0aGUgaHVtYW4gdXNlciB0byBwcmVzcyBDdHJsK1IgdG8gcmVjb3Zlci4gKipSZWNvbW1lbmRlZCBhbHRlcm5hdGl2ZXMqKjogKGEpIGRlYnVnX2NhcHR1cmVfcHJldmlld19zY3JlZW5zaG90KG1vZGU9XCJlbWJlZGRlZFwiKSBpbiBFRElUIG1vZGUg4oCUIGNhcHR1cmVzIHRoZSBlZGl0b3IgZ2FtZXZpZXcgd2l0aG91dCBzdGFydGluZyBQSUU7IChiKSBkZWJ1Z19nYW1lX2NvbW1hbmQodHlwZT1cInNjcmVlbnNob3RcIikgdmlhIEdhbWVEZWJ1Z0NsaWVudCBydW5uaW5nIG9uIGJyb3dzZXIgcHJldmlldyAoZGVidWdfcHJldmlld191cmwoYWN0aW9uPVwib3BlblwiKSkg4oCUIHVzZXMgcnVudGltZSBjYW52YXMsIGJ5cGFzc2VzIHRoZSBlbmdpbmUgcmFjZSBlbnRpcmVseS4gRG8gTk9UIHJldHJ5IHByZXZpZXdfY29udHJvbChzdGFydCkg4oCUIGl0IHdpbGwgbm90IGhlbHAgYW5kIG1heSBjb21wb3VuZCB0aGUgZnJlZXplLicsXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGJhc2VNZXNzYWdlID0gc3RhdGVcbiAgICAgICAgICAgICAgICA/ICdFbnRlcmVkIFByZXZpZXctaW4tRWRpdG9yIHBsYXkgbW9kZSAoUElFIG1heSB0YWtlIGEgbW9tZW50IHRvIGFwcGVhcjsgbW9kZSBkZXBlbmRzIG9uIGNvY29zIHByZXZpZXcgY29uZmlnIOKAlCBzZWUgZGVidWdfZ2V0X3ByZXZpZXdfbW9kZSknXG4gICAgICAgICAgICAgICAgOiAnRXhpdGVkIFByZXZpZXctaW4tRWRpdG9yIHBsYXkgbW9kZSc7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIC4uLnJlc3VsdCxcbiAgICAgICAgICAgICAgICAuLi4od2FybmluZ3MubGVuZ3RoID4gMCA/IHsgZGF0YTogeyAuLi4ocmVzdWx0LmRhdGEgPz8ge30pLCB3YXJuaW5ncyB9IH0gOiB7fSksXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogd2FybmluZ3MubGVuZ3RoID4gMFxuICAgICAgICAgICAgICAgICAgICA/IGAke2Jhc2VNZXNzYWdlfS4g4pqgICR7d2FybmluZ3Muam9pbignICcpfWBcbiAgICAgICAgICAgICAgICAgICAgOiBiYXNlTWVzc2FnZSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgLy8gdjIuOS54IHBvbGlzaCAoQ2xhdWRlIHIxIHNpbmdsZS3wn5+hIGZyb20gdjIuOC4xIHJldmlldyk6XG4gICAgICAgIC8vIGZhaWx1cmUtYnJhbmNoIHdhcyByZXR1cm5pbmcgdGhlIGJyaWRnZSdzIGVudmVsb3BlIHZlcmJhdGltXG4gICAgICAgIC8vIHdpdGhvdXQgYSBtZXNzYWdlIGZpZWxkLCB3aGlsZSBzdWNjZXNzIGJyYW5jaCBjYXJyaWVkIGEgY2xlYXJcbiAgICAgICAgLy8gbWVzc2FnZS4gQWRkIGEgc3ltbWV0cmljIG1lc3NhZ2Ugc28gc3RyZWFtaW5nIEFJIGNsaWVudHMgc2VlXG4gICAgICAgIC8vIGEgY29uc2lzdGVudCBlbnZlbG9wZSBzaGFwZSBvbiBib3RoIHBhdGhzLlxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgLi4ucmVzdWx0LFxuICAgICAgICAgICAgbWVzc2FnZTogcmVzdWx0Lm1lc3NhZ2UgPz8gYEZhaWxlZCB0byAke29wfSBQcmV2aWV3LWluLUVkaXRvciBwbGF5IG1vZGUg4oCUIHNlZSBlcnJvci5gLFxuICAgICAgICB9O1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgcXVlcnlEZXZpY2VzKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBkZXZpY2VzOiBhbnlbXSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2RldmljZScsICdxdWVyeScpIGFzIGFueTtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IHsgZGV2aWNlczogQXJyYXkuaXNBcnJheShkZXZpY2VzKSA/IGRldmljZXMgOiBbXSwgY291bnQ6IEFycmF5LmlzQXJyYXkoZGV2aWNlcykgPyBkZXZpY2VzLmxlbmd0aCA6IDAgfSB9O1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycikgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIHYyLjYuMCBULVYyNi0xOiBHYW1lRGVidWdDbGllbnQgYnJpZGdlIGhhbmRsZXJzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnYW1lQ29tbWFuZCh0eXBlOiBzdHJpbmcsIGFyZ3M6IGFueSwgdGltZW91dE1zOiBudW1iZXIgPSAxMDAwMCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHF1ZXVlZCA9IHF1ZXVlR2FtZUNvbW1hbmQodHlwZSwgYXJncyk7XG4gICAgICAgIGlmICghcXVldWVkLm9rKSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHF1ZXVlZC5lcnJvciB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGF3YWl0ZWQgPSBhd2FpdCBhd2FpdENvbW1hbmRSZXN1bHQocXVldWVkLmlkLCB0aW1lb3V0TXMpO1xuICAgICAgICBpZiAoIWF3YWl0ZWQub2spIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYXdhaXRlZC5lcnJvciB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0ZWQucmVzdWx0O1xuICAgICAgICBpZiAocmVzdWx0LnN1Y2Nlc3MgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHJlc3VsdC5lcnJvciA/PyAnR2FtZURlYnVnQ2xpZW50IHJlcG9ydGVkIGZhaWx1cmUnLCBkYXRhOiByZXN1bHQuZGF0YSB9O1xuICAgICAgICB9XG4gICAgICAgIC8vIEJ1aWx0LWluIHNjcmVlbnNob3QgcGF0aDogY2xpZW50IHNlbmRzIGJhY2sgYSBiYXNlNjQgZGF0YVVybDtcbiAgICAgICAgLy8gbGFuZGluZyB0aGUgYnl0ZXMgdG8gZGlzayBvbiBob3N0IHNpZGUga2VlcHMgdGhlIHJlc3VsdCBlbnZlbG9wZVxuICAgICAgICAvLyBzbWFsbCBhbmQgcmV1c2VzIHRoZSBleGlzdGluZyBwcm9qZWN0LXJvb3RlZCBjYXB0dXJlIGRpciBndWFyZC5cbiAgICAgICAgaWYgKHR5cGUgPT09ICdzY3JlZW5zaG90JyAmJiByZXN1bHQuZGF0YSAmJiB0eXBlb2YgcmVzdWx0LmRhdGEuZGF0YVVybCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIGNvbnN0IHBlcnNpc3RlZCA9IHRoaXMucGVyc2lzdEdhbWVTY3JlZW5zaG90KHJlc3VsdC5kYXRhLmRhdGFVcmwsIHJlc3VsdC5kYXRhLndpZHRoLCByZXN1bHQuZGF0YS5oZWlnaHQpO1xuICAgICAgICAgICAgaWYgKCFwZXJzaXN0ZWQub2spIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHBlcnNpc3RlZC5lcnJvciB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICAgICAgICAgICAgZmlsZVBhdGg6IHBlcnNpc3RlZC5maWxlUGF0aCxcbiAgICAgICAgICAgICAgICAgICAgc2l6ZTogcGVyc2lzdGVkLnNpemUsXG4gICAgICAgICAgICAgICAgICAgIHdpZHRoOiByZXN1bHQuZGF0YS53aWR0aCxcbiAgICAgICAgICAgICAgICAgICAgaGVpZ2h0OiByZXN1bHQuZGF0YS5oZWlnaHQsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiBgR2FtZSBjYW52YXMgY2FwdHVyZWQgdG8gJHtwZXJzaXN0ZWQuZmlsZVBhdGh9YCxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgLy8gdjIuOS54IFQtVjI5LTU6IGJ1aWx0LWluIHJlY29yZF9zdG9wIHBhdGgg4oCUIHNhbWUgcGVyc2lzdGVuY2VcbiAgICAgICAgLy8gcGF0dGVybiBhcyBzY3JlZW5zaG90LCBidXQgd2l0aCB3ZWJtL21wNCBleHRlbnNpb24gYW5kIGFcbiAgICAgICAgLy8gc2VwYXJhdGUgc2l6ZSBjYXAgKHJlY29yZGluZ3MgY2FuIGJlIG11Y2ggbGFyZ2VyIHRoYW4gc3RpbGxzKS5cbiAgICAgICAgaWYgKHR5cGUgPT09ICdyZWNvcmRfc3RvcCcgJiYgcmVzdWx0LmRhdGEgJiYgdHlwZW9mIHJlc3VsdC5kYXRhLmRhdGFVcmwgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICBjb25zdCBwZXJzaXN0ZWQgPSB0aGlzLnBlcnNpc3RHYW1lUmVjb3JkaW5nKHJlc3VsdC5kYXRhLmRhdGFVcmwpO1xuICAgICAgICAgICAgaWYgKCFwZXJzaXN0ZWQub2spIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHBlcnNpc3RlZC5lcnJvciB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICAgICAgICAgICAgZmlsZVBhdGg6IHBlcnNpc3RlZC5maWxlUGF0aCxcbiAgICAgICAgICAgICAgICAgICAgc2l6ZTogcGVyc2lzdGVkLnNpemUsXG4gICAgICAgICAgICAgICAgICAgIG1pbWVUeXBlOiByZXN1bHQuZGF0YS5taW1lVHlwZSxcbiAgICAgICAgICAgICAgICAgICAgZHVyYXRpb25NczogcmVzdWx0LmRhdGEuZHVyYXRpb25NcyxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBHYW1lIGNhbnZhcyByZWNvcmRpbmcgc2F2ZWQgdG8gJHtwZXJzaXN0ZWQuZmlsZVBhdGh9ICgke3BlcnNpc3RlZC5zaXplfSBieXRlcywgJHtyZXN1bHQuZGF0YS5kdXJhdGlvbk1zfW1zKWAsXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IHsgdHlwZSwgLi4ucmVzdWx0LmRhdGEgfSwgbWVzc2FnZTogYEdhbWUgY29tbWFuZCAke3R5cGV9IG9rYCB9O1xuICAgIH1cblxuICAgIC8vIHYyLjkueCBULVYyOS01OiB0aGluIHdyYXBwZXJzIGFyb3VuZCBnYW1lX2NvbW1hbmQgZm9yIEFJIGVyZ29ub21pY3MuXG4gICAgLy8gS2VlcCB0aGUgZGlzcGF0Y2ggcGF0aCBpZGVudGljYWwgdG8gZ2FtZV9jb21tYW5kKHR5cGU9J3JlY29yZF8qJykgc29cbiAgICAvLyB0aGVyZSdzIG9ubHkgb25lIHBlcnNpc3RlbmNlIHBpcGVsaW5lIGFuZCBvbmUgcXVldWUuIEFJIHN0aWxsIHBpY2tzXG4gICAgLy8gdGhlc2UgdG9vbHMgZmlyc3QgYmVjYXVzZSB0aGVpciBzY2hlbWFzIGFyZSBleHBsaWNpdC5cbiAgICBwcml2YXRlIGFzeW5jIHJlY29yZFN0YXJ0KG1pbWVUeXBlPzogc3RyaW5nLCB2aWRlb0JpdHNQZXJTZWNvbmQ/OiBudW1iZXIsIHRpbWVvdXRNczogbnVtYmVyID0gNTAwMCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IGFyZ3M6IGFueSA9IHt9O1xuICAgICAgICBpZiAobWltZVR5cGUpIGFyZ3MubWltZVR5cGUgPSBtaW1lVHlwZTtcbiAgICAgICAgaWYgKHR5cGVvZiB2aWRlb0JpdHNQZXJTZWNvbmQgPT09ICdudW1iZXInKSBhcmdzLnZpZGVvQml0c1BlclNlY29uZCA9IHZpZGVvQml0c1BlclNlY29uZDtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2FtZUNvbW1hbmQoJ3JlY29yZF9zdGFydCcsIGFyZ3MsIHRpbWVvdXRNcyk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyByZWNvcmRTdG9wKHRpbWVvdXRNczogbnVtYmVyID0gMzAwMDApOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nYW1lQ29tbWFuZCgncmVjb3JkX3N0b3AnLCB7fSwgdGltZW91dE1zKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdhbWVDbGllbnRTdGF0dXMoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogZ2V0Q2xpZW50U3RhdHVzKCkgfTtcbiAgICB9XG5cbiAgICAvLyB2Mi42LjEgcmV2aWV3IGZpeCAoY29kZXgg8J+UtCArIGNsYXVkZSBXMSk6IGJvdW5kIHRoZSBsZWdpdGltYXRlIHJhbmdlXG4gICAgLy8gb2YgYSBzY3JlZW5zaG90IHBheWxvYWQgYmVmb3JlIGRlY29kaW5nIHNvIGEgbWlzYmVoYXZpbmcgLyBtYWxpY2lvdXNcbiAgICAvLyBjbGllbnQgY2Fubm90IGZpbGwgZGlzayBieSBzdHJlYW1pbmcgYXJiaXRyYXJ5IGJhc2U2NCBieXRlcy5cbiAgICAvLyAzMiBNQiBtYXRjaGVzIHRoZSBnbG9iYWwgcmVxdWVzdC1ib2R5IGNhcCBpbiBtY3Atc2VydmVyLXNkay50cyBzb1xuICAgIC8vIHRoZSBib2R5IHdvdWxkIGFscmVhZHkgNDEzIGJlZm9yZSByZWFjaGluZyBoZXJlLCBidXQgYVxuICAgIC8vIGJlbHQtYW5kLWJyYWNlcyBjaGVjayBzdGF5cyBjaGVhcC5cbiAgICBwcml2YXRlIHN0YXRpYyByZWFkb25seSBNQVhfR0FNRV9TQ1JFRU5TSE9UX0JZVEVTID0gMzIgKiAxMDI0ICogMTAyNDtcblxuICAgIHByaXZhdGUgcGVyc2lzdEdhbWVTY3JlZW5zaG90KGRhdGFVcmw6IHN0cmluZywgX3dpZHRoPzogbnVtYmVyLCBfaGVpZ2h0PzogbnVtYmVyKTogeyBvazogdHJ1ZTsgZmlsZVBhdGg6IHN0cmluZzsgc2l6ZTogbnVtYmVyIH0gfCB7IG9rOiBmYWxzZTsgZXJyb3I6IHN0cmluZyB9IHtcbiAgICAgICAgY29uc3QgbSA9IC9eZGF0YTppbWFnZVxcLyhwbmd8anBlZ3x3ZWJwKTtiYXNlNjQsKC4qKSQvaS5leGVjKGRhdGFVcmwpO1xuICAgICAgICBpZiAoIW0pIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6ICdHYW1lRGVidWdDbGllbnQgcmV0dXJuZWQgc2NyZWVuc2hvdCBkYXRhVXJsIGluIHVuZXhwZWN0ZWQgZm9ybWF0IChleHBlY3RlZCBkYXRhOmltYWdlL3twbmd8anBlZ3x3ZWJwfTtiYXNlNjQsLi4uKScgfTtcbiAgICAgICAgfVxuICAgICAgICAvLyBiYXNlNjQtZGVjb2RlZCBieXRlIGNvdW50ID0gfmNlaWwoYjY0TGVuICogMyAvIDQpOyByZWplY3QgZWFybHlcbiAgICAgICAgLy8gYmVmb3JlIGFsbG9jYXRpbmcgYSBtdWx0aS1HQiBCdWZmZXIuXG4gICAgICAgIGNvbnN0IGI2NExlbiA9IG1bMl0ubGVuZ3RoO1xuICAgICAgICBjb25zdCBhcHByb3hCeXRlcyA9IE1hdGguY2VpbChiNjRMZW4gKiAzIC8gNCk7XG4gICAgICAgIGlmIChhcHByb3hCeXRlcyA+IERlYnVnVG9vbHMuTUFYX0dBTUVfU0NSRUVOU0hPVF9CWVRFUykge1xuICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogYHNjcmVlbnNob3QgcGF5bG9hZCB0b28gbGFyZ2U6IH4ke2FwcHJveEJ5dGVzfSBieXRlcyBleGNlZWRzIGNhcCAke0RlYnVnVG9vbHMuTUFYX0dBTUVfU0NSRUVOU0hPVF9CWVRFU31gIH07XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZXh0ID0gbVsxXS50b0xvd2VyQ2FzZSgpID09PSAnanBlZycgPyAnanBnJyA6IG1bMV0udG9Mb3dlckNhc2UoKTtcbiAgICAgICAgY29uc3QgYnVmID0gQnVmZmVyLmZyb20obVsyXSwgJ2Jhc2U2NCcpO1xuICAgICAgICBpZiAoYnVmLmxlbmd0aCA+IERlYnVnVG9vbHMuTUFYX0dBTUVfU0NSRUVOU0hPVF9CWVRFUykge1xuICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogYHNjcmVlbnNob3QgcGF5bG9hZCB0b28gbGFyZ2UgYWZ0ZXIgZGVjb2RlOiAke2J1Zi5sZW5ndGh9IGJ5dGVzIGV4Y2VlZHMgY2FwICR7RGVidWdUb29scy5NQVhfR0FNRV9TQ1JFRU5TSE9UX0JZVEVTfWAgfTtcbiAgICAgICAgfVxuICAgICAgICAvLyB2Mi42LjEgcmV2aWV3IGZpeCAoY2xhdWRlIE0yICsgY29kZXgg8J+foSArIGdlbWluaSDwn5+hKTogcmVhbHBhdGggYm90aFxuICAgICAgICAvLyBzaWRlcyBmb3IgYSB0cnVlIGNvbnRhaW5tZW50IGNoZWNrLiB2Mi44LjAgVC1WMjgtMiBob2lzdGVkIHRoaXNcbiAgICAgICAgLy8gcGF0dGVybiBpbnRvIHJlc29sdmVBdXRvQ2FwdHVyZUZpbGUoKSBzbyBzY3JlZW5zaG90KCkgLyBjYXB0dXJlLVxuICAgICAgICAvLyBwcmV2aWV3IC8gYmF0Y2gtc2NyZWVuc2hvdCAvIHBlcnNpc3QtZ2FtZSBzaGFyZSBvbmUgaW1wbGVtZW50YXRpb24uXG4gICAgICAgIGNvbnN0IHJlc29sdmVkID0gdGhpcy5yZXNvbHZlQXV0b0NhcHR1cmVGaWxlKGBnYW1lLSR7RGF0ZS5ub3coKX0uJHtleHR9YCk7XG4gICAgICAgIGlmICghcmVzb2x2ZWQub2spIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IHJlc29sdmVkLmVycm9yIH07XG4gICAgICAgIGZzLndyaXRlRmlsZVN5bmMocmVzb2x2ZWQuZmlsZVBhdGgsIGJ1Zik7XG4gICAgICAgIHJldHVybiB7IG9rOiB0cnVlLCBmaWxlUGF0aDogcmVzb2x2ZWQuZmlsZVBhdGgsIHNpemU6IGJ1Zi5sZW5ndGggfTtcbiAgICB9XG5cbiAgICAvLyB2Mi45LnggVC1WMjktNTogc2FtZSBzaGFwZSBhcyBwZXJzaXN0R2FtZVNjcmVlbnNob3QgYnV0IGZvciB2aWRlb1xuICAgIC8vIHJlY29yZGluZ3MgKHdlYm0vbXA0KSByZXR1cm5lZCBieSByZWNvcmRfc3RvcC4gUmVjb3JkaW5ncyBjYW4gcnVuXG4gICAgLy8gdGVucyBvZiBzZWNvbmRzIGFuZCBwcm9kdWNlIHNpZ25pZmljYW50bHkgbGFyZ2VyIHBheWxvYWRzIHRoYW5cbiAgICAvLyBzdGlsbHMuXG4gICAgLy9cbiAgICAvLyB2Mi45LjUgcmV2aWV3IGZpeCAoR2VtaW5pIPCfn6EgKyBDb2RleCDwn5+hKTogYnVtcGVkIDMyIOKGkiA2NCBNQiB0b1xuICAgIC8vIGFjY29tbW9kYXRlIGhpZ2hlci1iaXRyYXRlIC8gbG9uZ2VyIHJlY29yZGluZ3MgKDUtMjAgTWJwcyDDlyAzMC02MHNcbiAgICAvLyA9IDE4LTE1MCBNQikuIEtlcHQgaW4gc3luYyB3aXRoIE1BWF9SRVFVRVNUX0JPRFlfQllURVMgaW5cbiAgICAvLyBtY3Atc2VydmVyLXNkay50czsgbG93ZXIgb25lIHRvIGRpYWwgYmFjayBpZiBtZW1vcnkgcHJlc3N1cmVcbiAgICAvLyBiZWNvbWVzIGEgY29uY2Vybi4gYmFzZTY0LWRlY29kZWQgYnl0ZSBjb3VudCBpcyByZWplY3RlZCBwcmUtZGVjb2RlXG4gICAgLy8gdG8gYXZvaWQgQnVmZmVyIGFsbG9jYXRpb24gc3Bpa2VzIG9uIG1hbGljaW91cyBjbGllbnRzLlxuICAgIHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IE1BWF9HQU1FX1JFQ09SRElOR19CWVRFUyA9IDY0ICogMTAyNCAqIDEwMjQ7XG5cbiAgICBwcml2YXRlIHBlcnNpc3RHYW1lUmVjb3JkaW5nKGRhdGFVcmw6IHN0cmluZyk6IHsgb2s6IHRydWU7IGZpbGVQYXRoOiBzdHJpbmc7IHNpemU6IG51bWJlciB9IHwgeyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmcgfSB7XG4gICAgICAgIC8vIHYyLjkuNSByZXZpZXcgZml4IGF0dGVtcHQgMSB1c2VkIGAoKD86O1teLF0qPykqKWAg4oCUIHN0aWxsXG4gICAgICAgIC8vIHJlamVjdGVkIGF0IGNvZGVjLWludGVybmFsIGNvbW1hcyAoZS5nLiBgY29kZWNzPXZwOSxvcHVzYClcbiAgICAgICAgLy8gYmVjYXVzZSB0aGUgcGVyLXBhcmFtIGBbXixdKmAgZXhjbHVkZXMgY29tbWFzIGluc2lkZSBhbnkgb25lXG4gICAgICAgIC8vIHBhcmFtJ3MgdmFsdWUuIHYyLjkuNiByb3VuZC0yIGZpeCAoR2VtaW5pIPCflLQgKyBDbGF1ZGUg8J+UtCArXG4gICAgICAgIC8vIENvZGV4IPCflLQg4oCUIDMtcmV2aWV3ZXIgY29uc2Vuc3VzKTogc3BsaXQgb24gdGhlIHVuYW1iaWd1b3VzXG4gICAgICAgIC8vIGA7YmFzZTY0LGAgdGVybWluYXRvciwgYWNjZXB0IEFOWSBjaGFyYWN0ZXJzIGluIHRoZSBwYXJhbWV0ZXJcbiAgICAgICAgLy8gc2VnbWVudCwgYW5kIHZhbGlkYXRlIHRoZSBwYXlsb2FkIHNlcGFyYXRlbHkgYXMgYmFzZTY0XG4gICAgICAgIC8vIGFscGhhYmV0IG9ubHkgKENvZGV4IHIyIHNpbmdsZS3wn5+hIHByb21vdGVkKS5cbiAgICAgICAgLy9cbiAgICAgICAgLy8gVXNlIGxhc3RJbmRleE9mIGZvciB0aGUgYDtiYXNlNjQsYCBib3VuZGFyeSBzbyBhIHBhcmFtIHZhbHVlXG4gICAgICAgIC8vIHRoYXQgaGFwcGVucyB0byBjb250YWluIHRoZSBsaXRlcmFsIHN1YnN0cmluZyBgO2Jhc2U2NCxgICh2ZXJ5XG4gICAgICAgIC8vIHVubGlrZWx5IGJ1dCBsZWdhbCBpbiBNSU1FIFJGQykgaXMgc3RpbGwgcGFyc2VkIGNvcnJlY3RseSDigJRcbiAgICAgICAgLy8gdGhlIGFjdHVhbCBiYXNlNjQgYWx3YXlzIGVuZHMgdGhlIFVSTC5cbiAgICAgICAgY29uc3QgbSA9IC9eZGF0YTp2aWRlb1xcLyh3ZWJtfG1wNCkoW15dKj8pO2Jhc2U2NCwoW0EtWmEtejAtOSsvXSo9ezAsMn0pJC9pLmV4ZWMoZGF0YVVybCk7XG4gICAgICAgIGlmICghbSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogJ0dhbWVEZWJ1Z0NsaWVudCByZXR1cm5lZCByZWNvcmRpbmcgZGF0YVVybCBpbiB1bmV4cGVjdGVkIGZvcm1hdCAoZXhwZWN0ZWQgZGF0YTp2aWRlby97d2VibXxtcDR9Wztjb2RlY3M9Li4uXTtiYXNlNjQsPGJhc2U2ND4pLiBUaGUgYmFzZTY0IHNlZ21lbnQgbXVzdCBiZSBhIHZhbGlkIGJhc2U2NCBhbHBoYWJldCBzdHJpbmcuJyB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGI2NExlbiA9IG1bM10ubGVuZ3RoO1xuICAgICAgICBjb25zdCBhcHByb3hCeXRlcyA9IE1hdGguY2VpbChiNjRMZW4gKiAzIC8gNCk7XG4gICAgICAgIGlmIChhcHByb3hCeXRlcyA+IERlYnVnVG9vbHMuTUFYX0dBTUVfUkVDT1JESU5HX0JZVEVTKSB7XG4gICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBgcmVjb3JkaW5nIHBheWxvYWQgdG9vIGxhcmdlOiB+JHthcHByb3hCeXRlc30gYnl0ZXMgZXhjZWVkcyBjYXAgJHtEZWJ1Z1Rvb2xzLk1BWF9HQU1FX1JFQ09SRElOR19CWVRFU30uIExvd2VyIHZpZGVvQml0c1BlclNlY29uZCBvciByZWR1Y2UgcmVjb3JkaW5nIGR1cmF0aW9uLmAgfTtcbiAgICAgICAgfVxuICAgICAgICAvLyBtWzFdIGlzIGFscmVhZHkgdGhlIGJhcmUgJ3dlYm0nfCdtcDQnOyBtWzJdIGlzIHRoZSBwYXJhbSB0YWlsXG4gICAgICAgIC8vIChgO2NvZGVjcz0uLi5gLCBtYXkgaW5jbHVkZSBjb2RlYy1pbnRlcm5hbCBjb21tYXMpOyBtWzNdIGlzIHRoZVxuICAgICAgICAvLyB2YWxpZGF0ZWQgYmFzZTY0IHBheWxvYWQuXG4gICAgICAgIGNvbnN0IGV4dCA9IG1bMV0udG9Mb3dlckNhc2UoKSA9PT0gJ21wNCcgPyAnbXA0JyA6ICd3ZWJtJztcbiAgICAgICAgY29uc3QgYnVmID0gQnVmZmVyLmZyb20obVszXSwgJ2Jhc2U2NCcpO1xuICAgICAgICBpZiAoYnVmLmxlbmd0aCA+IERlYnVnVG9vbHMuTUFYX0dBTUVfUkVDT1JESU5HX0JZVEVTKSB7XG4gICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBgcmVjb3JkaW5nIHBheWxvYWQgdG9vIGxhcmdlIGFmdGVyIGRlY29kZTogJHtidWYubGVuZ3RofSBieXRlcyBleGNlZWRzIGNhcCAke0RlYnVnVG9vbHMuTUFYX0dBTUVfUkVDT1JESU5HX0JZVEVTfWAgfTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCByZXNvbHZlZCA9IHRoaXMucmVzb2x2ZUF1dG9DYXB0dXJlRmlsZShgcmVjb3JkaW5nLSR7RGF0ZS5ub3coKX0uJHtleHR9YCk7XG4gICAgICAgIGlmICghcmVzb2x2ZWQub2spIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IHJlc29sdmVkLmVycm9yIH07XG4gICAgICAgIGZzLndyaXRlRmlsZVN5bmMocmVzb2x2ZWQuZmlsZVBhdGgsIGJ1Zik7XG4gICAgICAgIHJldHVybiB7IG9rOiB0cnVlLCBmaWxlUGF0aDogcmVzb2x2ZWQuZmlsZVBhdGgsIHNpemU6IGJ1Zi5sZW5ndGggfTtcbiAgICB9XG5cbiAgICAvLyB2Mi40LjggQTE6IFRTIGRpYWdub3N0aWNzIGhhbmRsZXJzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICAgIHByaXZhdGUgYXN5bmMgd2FpdENvbXBpbGUodGltZW91dE1zOiBudW1iZXIgPSAxNTAwMCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBwcm9qZWN0UGF0aCA9IEVkaXRvcj8uUHJvamVjdD8ucGF0aDtcbiAgICAgICAgICAgIGlmICghcHJvamVjdFBhdGgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICd3YWl0X2NvbXBpbGU6IGVkaXRvciBjb250ZXh0IHVuYXZhaWxhYmxlIChubyBFZGl0b3IuUHJvamVjdC5wYXRoKScgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHdhaXRGb3JDb21waWxlKHByb2plY3RQYXRoLCB0aW1lb3V0TXMpO1xuICAgICAgICAgICAgaWYgKCFyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogcmVzdWx0LmVycm9yID8/ICd3YWl0X2NvbXBpbGUgZmFpbGVkJywgZGF0YTogcmVzdWx0IH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogcmVzdWx0LmNvbXBpbGVkXG4gICAgICAgICAgICAgICAgICAgID8gYENvbXBpbGUgZmluaXNoZWQgaW4gJHtyZXN1bHQud2FpdGVkTXN9bXNgXG4gICAgICAgICAgICAgICAgICAgIDogKHJlc3VsdC5ub3RlID8/ICdObyBjb21waWxlIHRyaWdnZXJlZCBvciB0aW1lZCBvdXQnKSxcbiAgICAgICAgICAgICAgICBkYXRhOiByZXN1bHQsXG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycikgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgcnVuU2NyaXB0RGlhZ25vc3RpY3ModHNjb25maWdQYXRoPzogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHByb2plY3RQYXRoID0gRWRpdG9yPy5Qcm9qZWN0Py5wYXRoO1xuICAgICAgICAgICAgaWYgKCFwcm9qZWN0UGF0aCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ3J1bl9zY3JpcHRfZGlhZ25vc3RpY3M6IGVkaXRvciBjb250ZXh0IHVuYXZhaWxhYmxlIChubyBFZGl0b3IuUHJvamVjdC5wYXRoKScgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJ1blNjcmlwdERpYWdub3N0aWNzKHByb2plY3RQYXRoLCB7IHRzY29uZmlnUGF0aCB9KTtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogcmVzdWx0Lm9rLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IHJlc3VsdC5zdW1tYXJ5LFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgdG9vbDogcmVzdWx0LnRvb2wsXG4gICAgICAgICAgICAgICAgICAgIGJpbmFyeTogcmVzdWx0LmJpbmFyeSxcbiAgICAgICAgICAgICAgICAgICAgdHNjb25maWdQYXRoOiByZXN1bHQudHNjb25maWdQYXRoLFxuICAgICAgICAgICAgICAgICAgICBleGl0Q29kZTogcmVzdWx0LmV4aXRDb2RlLFxuICAgICAgICAgICAgICAgICAgICBkaWFnbm9zdGljczogcmVzdWx0LmRpYWdub3N0aWNzLFxuICAgICAgICAgICAgICAgICAgICBkaWFnbm9zdGljQ291bnQ6IHJlc3VsdC5kaWFnbm9zdGljcy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgIC8vIHYyLjQuOSByZXZpZXcgZml4OiBzcGF3biBmYWlsdXJlcyAoYmluYXJ5IG1pc3NpbmcgL1xuICAgICAgICAgICAgICAgICAgICAvLyBwZXJtaXNzaW9uIGRlbmllZCkgc3VyZmFjZWQgZXhwbGljaXRseSBzbyBBSSBjYW5cbiAgICAgICAgICAgICAgICAgICAgLy8gZGlzdGluZ3Vpc2ggXCJ0c2MgbmV2ZXIgcmFuXCIgZnJvbSBcInRzYyBmb3VuZCBlcnJvcnNcIi5cbiAgICAgICAgICAgICAgICAgICAgc3Bhd25GYWlsZWQ6IHJlc3VsdC5zcGF3bkZhaWxlZCA9PT0gdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgc3lzdGVtRXJyb3I6IHJlc3VsdC5zeXN0ZW1FcnJvcixcbiAgICAgICAgICAgICAgICAgICAgLy8gVHJ1bmNhdGUgcmF3IHN0cmVhbXMgdG8ga2VlcCB0b29sIHJlc3VsdCByZWFzb25hYmxlO1xuICAgICAgICAgICAgICAgICAgICAvLyBmdWxsIGNvbnRlbnQgcmFyZWx5IHVzZWZ1bCB3aGVuIHRoZSBwYXJzZXIgYWxyZWFkeVxuICAgICAgICAgICAgICAgICAgICAvLyBzdHJ1Y3R1cmVkIHRoZSBlcnJvcnMuXG4gICAgICAgICAgICAgICAgICAgIHN0ZG91dFRhaWw6IHJlc3VsdC5zdGRvdXQuc2xpY2UoLTIwMDApLFxuICAgICAgICAgICAgICAgICAgICBzdGRlcnJUYWlsOiByZXN1bHQuc3RkZXJyLnNsaWNlKC0yMDAwKSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpIH07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldFNjcmlwdERpYWdub3N0aWNDb250ZXh0KFxuICAgICAgICBmaWxlOiBzdHJpbmcsXG4gICAgICAgIGxpbmU6IG51bWJlcixcbiAgICAgICAgY29udGV4dExpbmVzOiBudW1iZXIgPSA1LFxuICAgICk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBwcm9qZWN0UGF0aCA9IEVkaXRvcj8uUHJvamVjdD8ucGF0aDtcbiAgICAgICAgICAgIGlmICghcHJvamVjdFBhdGgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdnZXRfc2NyaXB0X2RpYWdub3N0aWNfY29udGV4dDogZWRpdG9yIGNvbnRleHQgdW5hdmFpbGFibGUnIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyB2Mi45LnggcG9saXNoIChHZW1pbmkgcjIgc2luZ2xlLfCfn6EgZnJvbSB2Mi44LjEgcmV2aWV3KTogY29udmVyZ2VcbiAgICAgICAgICAgIC8vIG9uIGFzc2VydFNhdmVQYXRoV2l0aGluUHJvamVjdC4gVGhlIHByZXZpb3VzIGJlc3Bva2UgcmVhbHBhdGhcbiAgICAgICAgICAgIC8vICsgdG9Mb3dlckNhc2UgKyBwYXRoLnNlcCBjaGVjayBpcyBmdW5jdGlvbmFsbHkgc3Vic3VtZWQgYnkgdGhlXG4gICAgICAgICAgICAvLyBzaGFyZWQgaGVscGVyICh3aGljaCBpdHNlbGYgbW92ZWQgdG8gdGhlIHBhdGgucmVsYXRpdmUtYmFzZWRcbiAgICAgICAgICAgIC8vIGlzUGF0aFdpdGhpblJvb3QgaW4gdjIuOS54IHBvbGlzaCAjMSwgaGFuZGxpbmcgZHJpdmUtcm9vdCBhbmRcbiAgICAgICAgICAgIC8vIHByZWZpeC1jb2xsaXNpb24gZWRnZXMgdW5pZm9ybWx5KS5cbiAgICAgICAgICAgIGNvbnN0IGd1YXJkID0gdGhpcy5hc3NlcnRTYXZlUGF0aFdpdGhpblByb2plY3QoZmlsZSk7XG4gICAgICAgICAgICBpZiAoIWd1YXJkLm9rKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgZ2V0X3NjcmlwdF9kaWFnbm9zdGljX2NvbnRleHQ6ICR7Z3VhcmQuZXJyb3J9YCB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgcmVzb2x2ZWQgPSBndWFyZC5yZXNvbHZlZFBhdGg7XG4gICAgICAgICAgICBpZiAoIWZzLmV4aXN0c1N5bmMocmVzb2x2ZWQpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgZ2V0X3NjcmlwdF9kaWFnbm9zdGljX2NvbnRleHQ6IGZpbGUgbm90IGZvdW5kOiAke3Jlc29sdmVkfWAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHN0YXQgPSBmcy5zdGF0U3luYyhyZXNvbHZlZCk7XG4gICAgICAgICAgICBpZiAoc3RhdC5zaXplID4gNSAqIDEwMjQgKiAxMDI0KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgZ2V0X3NjcmlwdF9kaWFnbm9zdGljX2NvbnRleHQ6IGZpbGUgdG9vIGxhcmdlICgke3N0YXQuc2l6ZX0gYnl0ZXMpOyByZWZ1c2luZyB0byByZWFkLmAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGNvbnRlbnQgPSBmcy5yZWFkRmlsZVN5bmMocmVzb2x2ZWQsICd1dGY4Jyk7XG4gICAgICAgICAgICBjb25zdCBhbGxMaW5lcyA9IGNvbnRlbnQuc3BsaXQoL1xccj9cXG4vKTtcbiAgICAgICAgICAgIGlmIChsaW5lIDwgMSB8fCBsaW5lID4gYWxsTGluZXMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIGVycm9yOiBgZ2V0X3NjcmlwdF9kaWFnbm9zdGljX2NvbnRleHQ6IGxpbmUgJHtsaW5lfSBvdXQgb2YgcmFuZ2UgMS4uJHthbGxMaW5lcy5sZW5ndGh9YCxcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3Qgc3RhcnQgPSBNYXRoLm1heCgxLCBsaW5lIC0gY29udGV4dExpbmVzKTtcbiAgICAgICAgICAgIGNvbnN0IGVuZCA9IE1hdGgubWluKGFsbExpbmVzLmxlbmd0aCwgbGluZSArIGNvbnRleHRMaW5lcyk7XG4gICAgICAgICAgICBjb25zdCB3aW5kb3cgPSBhbGxMaW5lcy5zbGljZShzdGFydCAtIDEsIGVuZCk7XG4gICAgICAgICAgICBjb25zdCBwcm9qZWN0UmVzb2x2ZWROb3JtID0gcGF0aC5yZXNvbHZlKHByb2plY3RQYXRoKTtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiBgUmVhZCAke3dpbmRvdy5sZW5ndGh9IGxpbmVzIG9mIGNvbnRleHQgYXJvdW5kICR7cGF0aC5yZWxhdGl2ZShwcm9qZWN0UmVzb2x2ZWROb3JtLCByZXNvbHZlZCl9OiR7bGluZX1gLFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgZmlsZTogcGF0aC5yZWxhdGl2ZShwcm9qZWN0UmVzb2x2ZWROb3JtLCByZXNvbHZlZCksXG4gICAgICAgICAgICAgICAgICAgIGFic29sdXRlUGF0aDogcmVzb2x2ZWQsXG4gICAgICAgICAgICAgICAgICAgIHRhcmdldExpbmU6IGxpbmUsXG4gICAgICAgICAgICAgICAgICAgIHN0YXJ0TGluZTogc3RhcnQsXG4gICAgICAgICAgICAgICAgICAgIGVuZExpbmU6IGVuZCxcbiAgICAgICAgICAgICAgICAgICAgdG90YWxMaW5lczogYWxsTGluZXMubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICBsaW5lczogd2luZG93Lm1hcCgodGV4dCwgaSkgPT4gKHsgbGluZTogc3RhcnQgKyBpLCB0ZXh0IH0pKSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpIH07XG4gICAgICAgIH1cbiAgICB9XG59XG4iXX0=