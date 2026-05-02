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
const response_1 = require("../lib/response");
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
                description: 'Send a runtime command to a connected GameDebugClient. Works inside a cocos preview/build (browser, Preview-in-Editor, or any device that fetches /game/command). Built-in command types: "screenshot" (capture game canvas to PNG, returns saved file path), "click" (emit Button.CLICK on a node by name), "inspect" (dump runtime node info: position/scale/rotation/active/components by name; when present also returns UITransform.contentSize/anchorPoint, Widget alignment flags/offsets, and Layout type/spacing/padding), "state" (dump global game state from the running game client), and "navigate" (switch scene/page by name through the game client\'s router). Custom command types are forwarded to the client\'s customCommands map. Requires the GameDebugClient template (client/cocos-mcp-client.ts) wired into the running game; without it the call times out. Check GET /game/status to verify client liveness first.',
                inputSchema: schema_1.z.object({
                    type: schema_1.z.string().min(1).describe('Command type. Built-ins: screenshot, click, inspect, state, navigate. Customs: any string the GameDebugClient registered in customCommands.'),
                    args: schema_1.z.any().optional().describe('Command-specific arguments. For "click"/"inspect": {name: string} node name. For "navigate": {pageName: string} or {page: string}. For "state"/"screenshot": {} (no args).'),
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
            return (0, response_1.ok)({
                result: out.data.result,
                message: 'Script executed successfully',
            });
        }
        return out;
    }
    async clearConsole() {
        try {
            // Note: Editor.Message.send may not return a promise in all versions
            Editor.Message.send('console', 'clear');
            return (0, response_1.ok)(undefined, 'Console cleared successfully');
        }
        catch (err) {
            return (0, response_1.fail)(err.message);
        }
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
                    resolve((0, response_1.ok)(tree));
                });
            }
            else {
                Editor.Message.request('scene', 'query-hierarchy').then(async (hierarchy) => {
                    const trees = [];
                    for (const rootNode of hierarchy.children) {
                        const tree = await buildTree(rootNode.uuid);
                        trees.push(tree);
                    }
                    resolve((0, response_1.ok)(trees));
                }).catch((err) => {
                    resolve((0, response_1.fail)(err.message));
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
                resolve((0, response_1.ok)(perfStats));
            }).catch(() => {
                // Fallback to basic stats
                resolve((0, response_1.ok)({
                    message: 'Performance stats not available in edit mode'
                }));
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
            return (0, response_1.ok)(result);
        }
        catch (err) {
            return (0, response_1.fail)(err.message);
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
    async getProjectLogs(lines = 100, filterKeyword, logLevel = 'ALL') {
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
                filteredLines = filteredLines.filter(line => line.includes(`[${logLevel}]`) || line.includes(logLevel.toLowerCase()));
            }
            // Filter by keyword if provided
            if (filterKeyword) {
                filteredLines = filteredLines.filter(line => line.toLowerCase().includes(filterKeyword.toLowerCase()));
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
    async getLogFileInfo() {
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
    async searchProjectLogs(pattern, maxResults = 20, contextLines = 2) {
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
            return (0, response_1.ok)({
                pattern: pattern,
                totalMatches: matches.length,
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
    async screenshot(savePath, windowTitle, includeBase64 = false) {
        var _a;
        try {
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
        catch (err) {
            return (0, response_1.fail)((_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : String(err));
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
        catch (err) {
            return (0, response_1.fail)((_c = err === null || err === void 0 ? void 0 : err.message) !== null && _c !== void 0 ? _c : String(err));
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
        catch (err) {
            return (0, response_1.fail)((_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : String(err));
        }
    }
    // v2.7.0 #3: preview-url / query-devices handlers ---------------------
    async previewUrl(action = 'query') {
        var _a, _b;
        try {
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
        catch (err) {
            return (0, response_1.fail)((_b = err === null || err === void 0 ? void 0 : err.message) !== null && _b !== void 0 ? _b : String(err));
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
    async previewControl(op, acknowledgeFreezeRisk = false) {
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
    async queryDevices() {
        var _a;
        try {
            const devices = await Editor.Message.request('device', 'query');
            return (0, response_1.ok)({ devices: Array.isArray(devices) ? devices : [], count: Array.isArray(devices) ? devices.length : 0 });
        }
        catch (err) {
            return (0, response_1.fail)((_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : String(err));
        }
    }
    // v2.6.0 T-V26-1: GameDebugClient bridge handlers ---------------------
    async gameCommand(type, args, timeoutMs = 10000) {
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
    async waitCompile(timeoutMs = 15000) {
        var _a, _b, _c, _d;
        try {
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
        catch (err) {
            return (0, response_1.fail)((_d = err === null || err === void 0 ? void 0 : err.message) !== null && _d !== void 0 ? _d : String(err));
        }
    }
    async runScriptDiagnostics(tsconfigPath) {
        var _a, _b;
        try {
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
        catch (err) {
            return (0, response_1.fail)((_b = err === null || err === void 0 ? void 0 : err.message) !== null && _b !== void 0 ? _b : String(err));
        }
    }
    async getScriptDiagnosticContext(file, line, contextLines = 5) {
        var _a, _b;
        try {
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
        catch (err) {
            return (0, response_1.fail)((_b = err === null || err === void 0 ? void 0 : err.message) !== null && _b !== void 0 ? _b : String(err));
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWctdG9vbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvdG9vbHMvZGVidWctdG9vbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsOENBQTJDO0FBRzNDLHdEQUFrRTtBQUNsRSwwQ0FBa0M7QUFDbEMsc0RBQTJEO0FBQzNELDBEQUE2RTtBQUM3RSxrRUFBa0c7QUFDbEcsc0RBQW1FO0FBQ25FLHVDQUF5QjtBQUN6QiwyQ0FBNkI7QUFFN0Isa0VBQWtFO0FBQ2xFLHdFQUF3RTtBQUN4RSx5RUFBeUU7QUFDekUsa0VBQWtFO0FBQ2xFLGlDQUFpQztBQUNqQyxFQUFFO0FBQ0Ysa0VBQWtFO0FBQ2xFLG1FQUFtRTtBQUNuRSw2REFBNkQ7QUFDN0Qsa0VBQWtFO0FBQ2xFLHFFQUFxRTtBQUNyRSxzRUFBc0U7QUFDdEUsbUVBQW1FO0FBQ25FLDhEQUE4RDtBQUM5RCxtRUFBbUU7QUFDbkUsOERBQThEO0FBQzlELDRDQUE0QztBQUM1QyxTQUFTLGdCQUFnQixDQUFDLFNBQWlCLEVBQUUsSUFBWTtJQUNyRCxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQ3hDLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDbkMsSUFBSSxPQUFPLEtBQUssT0FBTztRQUFFLE9BQU8sSUFBSSxDQUFDO0lBQ3JDLE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQzVDLElBQUksQ0FBQyxHQUFHO1FBQUUsT0FBTyxJQUFJLENBQUMsQ0FBOEIsWUFBWTtJQUNoRSxxRUFBcUU7SUFDckUsa0VBQWtFO0lBQ2xFLG9FQUFvRTtJQUNwRSw2Q0FBNkM7SUFDN0MsSUFBSSxHQUFHLEtBQUssSUFBSSxJQUFJLEdBQUcsQ0FB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RyxFQUFFLEdBQUcsSUFBSSxHQUFHLElBQUksQ0FBQztBQTZCckUsb0VBQW9FO0FBQ3BFLG9FQUFvRTtBQUNwRSxpRUFBaUU7QUFDakUsVUFBVTtBQUNWLEVBQUU7QUFDRixpRUFBaUU7QUFDakUscUVBQXFFO0FBQ3JFLDREQUE0RDtBQUM1RCwrREFBK0Q7QUFDL0Qsc0VBQXNFO0FBQ3RFLDBEQUEwRDtBQUNsQyxtQ0FBd0IsR0FBRyxFQUFFLEdBQUcsSUFBSSxHQUFHLElBQUksQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IG9rLCBmYWlsIH0gZnJvbSAnLi4vbGliL3Jlc3BvbnNlJztcbmltcG9ydCB7IFRvb2xEZWZpbml0aW9uLCBUb29sUmVzcG9uc2UsIFRvb2xFeGVjdXRvciwgUGVyZm9ybWFuY2VTdGF0cywgVmFsaWRhdGlvblJlc3VsdCwgVmFsaWRhdGlvbklzc3VlIH0gZnJvbSAnLi4vdHlwZXMnO1xuaW1wb3J0IHsgZGVidWdMb2cgfSBmcm9tICcuLi9saWIvbG9nJztcbmltcG9ydCB7IGlzRWRpdG9yQ29udGV4dEV2YWxFbmFibGVkIH0gZnJvbSAnLi4vbGliL3J1bnRpbWUtZmxhZ3MnO1xuaW1wb3J0IHsgeiB9IGZyb20gJy4uL2xpYi9zY2hlbWEnO1xuaW1wb3J0IHsgZGVmaW5lVG9vbHMsIFRvb2xEZWYgfSBmcm9tICcuLi9saWIvZGVmaW5lLXRvb2xzJztcbmltcG9ydCB7IHJ1blNjcmlwdERpYWdub3N0aWNzLCB3YWl0Rm9yQ29tcGlsZSB9IGZyb20gJy4uL2xpYi90cy1kaWFnbm9zdGljcyc7XG5pbXBvcnQgeyBxdWV1ZUdhbWVDb21tYW5kLCBhd2FpdENvbW1hbmRSZXN1bHQsIGdldENsaWVudFN0YXR1cyB9IGZyb20gJy4uL2xpYi9nYW1lLWNvbW1hbmQtcXVldWUnO1xuaW1wb3J0IHsgcnVuU2NlbmVNZXRob2RBc1Rvb2xSZXNwb25zZSB9IGZyb20gJy4uL2xpYi9zY2VuZS1icmlkZ2UnO1xuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcblxuLy8gdjIuOS54IHBvbGlzaDogY29udGFpbm1lbnQgaGVscGVyIHRoYXQgaGFuZGxlcyBkcml2ZS1yb290IGVkZ2VzXG4vLyAoQzpcXCksIHByZWZpeC1jb2xsaXNpb24gKEM6XFxmb28gdnMgQzpcXGZvb2JhciksIGFuZCBjcm9zcy12b2x1bWUgcGF0aHNcbi8vIChEOlxcLi4uIHdoZW4gcm9vdCBpcyBDOlxcKS4gVXNlcyBwYXRoLnJlbGF0aXZlIHdoaWNoIHJldHVybnMgYSByZWxhdGl2ZVxuLy8gZXhwcmVzc2lvbiDigJQgaWYgdGhlIHJlc3VsdCBzdGFydHMgd2l0aCBgLi5gIG9yIGlzIGFic29sdXRlLCB0aGVcbi8vIGNhbmRpZGF0ZSBpcyBvdXRzaWRlIHRoZSByb290LlxuLy9cbi8vIFRPQ1RPVSBub3RlIChDb2RleCByMSArIEdlbWluaSByMSBzaW5nbGUt8J+foSBmcm9tIHYyLjguMSByZXZpZXcsXG4vLyByZXZpZXdlZCB2Mi45LnggYW5kIGFjY2VwdGVkIGFzIHJlc2lkdWFsIHJpc2spOiB0aGVyZSBpcyBhIHNtYWxsXG4vLyByYWNlIHdpbmRvdyBiZXR3ZWVuIHJlYWxwYXRoU3luYyBjb250YWlubWVudCBjaGVjayBhbmQgdGhlXG4vLyBzdWJzZXF1ZW50IHdyaXRlRmlsZVN5bmMg4oCUIGEgbWFsaWNpb3VzIHN5bWxpbmsgc3dhcCBkdXJpbmcgdGhhdFxuLy8gd2luZG93IGNvdWxkIGVzY2FwZS4gRnVsbCBtaXRpZ2F0aW9uIG5lZWRzIE9fTk9GT0xMT1cgd2hpY2ggTm9kZSdzXG4vLyBmcyBBUEkgZG9lc24ndCBleHBvc2UgZGlyZWN0bHkuIEdpdmVuIHRoaXMgaXMgYSBsb2NhbCBkZXYgdG9vbCwgbm90XG4vLyBhIG5ldHdvcmstZmFjaW5nIHNlcnZpY2UsIGFuZCB0aGUgYXR0YWNrIHdpbmRvdyBpcyBtaWNyb3NlY29uZHMsXG4vLyB0aGUgcmlzayBpcyBhY2NlcHRlZCBmb3Igbm93LiBBIGZ1dHVyZSB2Mi54IHBhdGNoIGNvdWxkIGFkZFxuLy8gYGZzLm9wZW5TeW5jKGZpbGVQYXRoLCAnd3gnKWAgZm9yIEFVVE8tbmFtZWQgcGF0aHMgb25seSAoY2FsbGVyLVxuLy8gcHJvdmlkZWQgc2F2ZVBhdGggbmVlZHMgb3ZlcndyaXRlIHNlbWFudGljcykuIERvbid0IHJlbHkgb25cbi8vIGNvbnRhaW5tZW50IGZvciBzZWN1cml0eS1jcml0aWNhbCB3cml0ZXMuXG5mdW5jdGlvbiBpc1BhdGhXaXRoaW5Sb290KGNhbmRpZGF0ZTogc3RyaW5nLCByb290OiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICBjb25zdCBjYW5kQWJzID0gcGF0aC5yZXNvbHZlKGNhbmRpZGF0ZSk7XG4gICAgY29uc3Qgcm9vdEFicyA9IHBhdGgucmVzb2x2ZShyb290KTtcbiAgICBpZiAoY2FuZEFicyA9PT0gcm9vdEFicykgcmV0dXJuIHRydWU7XG4gICAgY29uc3QgcmVsID0gcGF0aC5yZWxhdGl2ZShyb290QWJzLCBjYW5kQWJzKTtcbiAgICBpZiAoIXJlbCkgcmV0dXJuIHRydWU7ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gaWRlbnRpY2FsXG4gICAgLy8gdjIuOS41IHJldmlldyBmaXggKENvZGV4IPCfn6EpOiBzdGFydHNXaXRoKCcuLicpIHdvdWxkIGFsc28gcmVqZWN0IGFcbiAgICAvLyBsZWdpdGltYXRlIGNoaWxkIHdob3NlIGZpcnN0IHBhdGggc2VnbWVudCBsaXRlcmFsbHkgc3RhcnRzIHdpdGhcbiAgICAvLyBcIi4uXCIgKGUuZy4gZGlyZWN0b3J5IG5hbWVkIFwiLi5mb29cIikuIE1hdGNoIGVpdGhlciBleGFjdGx5IGAuLmAgb3JcbiAgICAvLyBgLi5gIGZvbGxvd2VkIGJ5IGEgcGF0aCBzZXBhcmF0b3IgaW5zdGVhZC5cbiAgICBpZiAocmVsID09PSAnLi4nIHx8IHJlbC5zdGFydHNXaXRoKCcuLicgKyBwYXRoLnNlcCkpIHJldHVybiBmYWxzZTtcbiAgICBpZiAocGF0aC5pc0Fic29sdXRlKHJlbCkpIHJldHVybiBmYWxzZTsgICAgICAgICAgICAgLy8gZGlmZmVyZW50IGRyaXZlXG4gICAgcmV0dXJuIHRydWU7XG59XG5cbmV4cG9ydCBjbGFzcyBEZWJ1Z1Rvb2xzIGltcGxlbWVudHMgVG9vbEV4ZWN1dG9yIHtcbiAgICBwcml2YXRlIHJlYWRvbmx5IGV4ZWM6IFRvb2xFeGVjdXRvcjtcblxuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICBjb25zdCBkZWZzOiBUb29sRGVmW10gPSBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2NsZWFyX2NvbnNvbGUnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnQ2xlYXIgY29uc29sZScsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdDbGVhciB0aGUgQ29jb3MgRWRpdG9yIENvbnNvbGUgVUkuIE5vIHByb2plY3Qgc2lkZSBlZmZlY3RzLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiAoKSA9PiB0aGlzLmNsZWFyQ29uc29sZSgpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnZXhlY3V0ZV9qYXZhc2NyaXB0JyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ0V4ZWN1dGUgSmF2YVNjcmlwdCcsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdbcHJpbWFyeV0gRXhlY3V0ZSBKYXZhU2NyaXB0IGluIHNjZW5lIG9yIGVkaXRvciBjb250ZXh0LiBVc2UgdGhpcyBhcyB0aGUgZGVmYXVsdCBmaXJzdCB0b29sIGZvciBjb21wb3VuZCBvcGVyYXRpb25zIChyZWFkIOKGkiBtdXRhdGUg4oaSIHZlcmlmeSkg4oCUIG9uZSBjYWxsIHJlcGxhY2VzIDUtMTAgbmFycm93IHNwZWNpYWxpc3QgdG9vbHMgYW5kIGF2b2lkcyBwZXItY2FsbCB0b2tlbiBvdmVyaGVhZC4gY29udGV4dD1cInNjZW5lXCIgaW5zcGVjdHMvbXV0YXRlcyBjYy5Ob2RlIGdyYXBoOyBjb250ZXh0PVwiZWRpdG9yXCIgcnVucyBpbiBob3N0IHByb2Nlc3MgZm9yIEVkaXRvci5NZXNzYWdlICsgZnMgKGRlZmF1bHQgb2ZmLCBvcHQtaW4pLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgY29kZTogei5zdHJpbmcoKS5kZXNjcmliZSgnSmF2YVNjcmlwdCBzb3VyY2UgdG8gZXhlY3V0ZS4gSGFzIGFjY2VzcyB0byBjYy4qIGluIHNjZW5lIGNvbnRleHQsIEVkaXRvci4qIGluIGVkaXRvciBjb250ZXh0LicpLFxuICAgICAgICAgICAgICAgICAgICBjb250ZXh0OiB6LmVudW0oWydzY2VuZScsICdlZGl0b3InXSkuZGVmYXVsdCgnc2NlbmUnKS5kZXNjcmliZSgnRXhlY3V0aW9uIHNhbmRib3guIFwic2NlbmVcIiBydW5zIGluc2lkZSB0aGUgY29jb3Mgc2NlbmUgc2NyaXB0IGNvbnRleHQgKGNjLCBkaXJlY3RvciwgZmluZCkuIFwiZWRpdG9yXCIgcnVucyBpbiB0aGUgZWRpdG9yIGhvc3QgcHJvY2VzcyAoRWRpdG9yLCBhc3NldC1kYiwgZnMsIHJlcXVpcmUpLiBFZGl0b3IgY29udGV4dCBpcyBPRkYgYnkgZGVmYXVsdCBhbmQgbXVzdCBiZSBvcHQtaW4gdmlhIHBhbmVsIHNldHRpbmcgYGVuYWJsZUVkaXRvckNvbnRleHRFdmFsYCDigJQgYXJiaXRyYXJ5IGNvZGUgaW4gdGhlIGhvc3QgcHJvY2VzcyBpcyBhIHByb21wdC1pbmplY3Rpb24gcmlzay4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMuZXhlY3V0ZUphdmFTY3JpcHQoYS5jb2RlLCBhLmNvbnRleHQgPz8gJ3NjZW5lJyksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdleGVjdXRlX3NjcmlwdCcsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdSdW4gc2NlbmUgSmF2YVNjcmlwdCcsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdbY29tcGF0XSBTY2VuZS1vbmx5IEphdmFTY3JpcHQgZXZhbC4gUHJlZmVyIGV4ZWN1dGVfamF2YXNjcmlwdCB3aXRoIGNvbnRleHQ9XCJzY2VuZVwiIOKAlCBrZXB0IGFzIGNvbXBhdGliaWxpdHkgZW50cnlwb2ludCBmb3Igb2xkZXIgY2xpZW50cy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHNjcmlwdDogei5zdHJpbmcoKS5kZXNjcmliZSgnSmF2YVNjcmlwdCB0byBleGVjdXRlIGluIHNjZW5lIGNvbnRleHQgdmlhIGNvbnNvbGUvZXZhbC4gQ2FuIHJlYWQgb3IgbXV0YXRlIHRoZSBjdXJyZW50IHNjZW5lLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy5leGVjdXRlU2NyaXB0Q29tcGF0KGEuc2NyaXB0KSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2dldF9ub2RlX3RyZWUnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnUmVhZCBkZWJ1ZyBub2RlIHRyZWUnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnUmVhZCBhIGRlYnVnIG5vZGUgdHJlZSBmcm9tIGEgcm9vdCBvciBzY2VuZSByb290IGZvciBoaWVyYXJjaHkvY29tcG9uZW50IGluc3BlY3Rpb24uJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICByb290VXVpZDogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdSb290IG5vZGUgVVVJRCB0byBleHBhbmQuIE9taXQgdG8gdXNlIHRoZSBjdXJyZW50IHNjZW5lIHJvb3QuJyksXG4gICAgICAgICAgICAgICAgICAgIG1heERlcHRoOiB6Lm51bWJlcigpLmRlZmF1bHQoMTApLmRlc2NyaWJlKCdNYXhpbXVtIHRyZWUgZGVwdGguIERlZmF1bHQgMTA7IGxhcmdlIHZhbHVlcyBjYW4gcmV0dXJuIGEgbG90IG9mIGRhdGEuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLmdldE5vZGVUcmVlKGEucm9vdFV1aWQsIGEubWF4RGVwdGgpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnZ2V0X3BlcmZvcm1hbmNlX3N0YXRzJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1JlYWQgcGVyZm9ybWFuY2Ugc3RhdHMnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnVHJ5IHRvIHJlYWQgc2NlbmUgcXVlcnktcGVyZm9ybWFuY2Ugc3RhdHM7IG1heSByZXR1cm4gdW5hdmFpbGFibGUgaW4gZWRpdCBtb2RlLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiAoKSA9PiB0aGlzLmdldFBlcmZvcm1hbmNlU3RhdHMoKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3ZhbGlkYXRlX3NjZW5lJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1ZhbGlkYXRlIGN1cnJlbnQgc2NlbmUnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnUnVuIGJhc2ljIGN1cnJlbnQtc2NlbmUgaGVhbHRoIGNoZWNrcyBmb3IgbWlzc2luZyBhc3NldHMgYW5kIG5vZGUtY291bnQgd2FybmluZ3MuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBjaGVja01pc3NpbmdBc3NldHM6IHouYm9vbGVhbigpLmRlZmF1bHQodHJ1ZSkuZGVzY3JpYmUoJ0NoZWNrIG1pc3NpbmcgYXNzZXQgcmVmZXJlbmNlcyB3aGVuIHRoZSBDb2NvcyBzY2VuZSBBUEkgc3VwcG9ydHMgaXQuJyksXG4gICAgICAgICAgICAgICAgICAgIGNoZWNrUGVyZm9ybWFuY2U6IHouYm9vbGVhbigpLmRlZmF1bHQodHJ1ZSkuZGVzY3JpYmUoJ1J1biBiYXNpYyBwZXJmb3JtYW5jZSBjaGVja3Mgc3VjaCBhcyBoaWdoIG5vZGUgY291bnQgd2FybmluZ3MuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLnZhbGlkYXRlU2NlbmUoeyBjaGVja01pc3NpbmdBc3NldHM6IGEuY2hlY2tNaXNzaW5nQXNzZXRzLCBjaGVja1BlcmZvcm1hbmNlOiBhLmNoZWNrUGVyZm9ybWFuY2UgfSksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdnZXRfZWRpdG9yX2luZm8nLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnUmVhZCBlZGl0b3IgaW5mbycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdSZWFkIEVkaXRvci9Db2Nvcy9wcm9qZWN0L3Byb2Nlc3MgaW5mb3JtYXRpb24gYW5kIG1lbW9yeSBzdW1tYXJ5LicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiAoKSA9PiB0aGlzLmdldEVkaXRvckluZm8oKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2dldF9wcm9qZWN0X2xvZ3MnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnUmVhZCBwcm9qZWN0IGxvZ3MnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnUmVhZCB0ZW1wL2xvZ3MvcHJvamVjdC5sb2cgdGFpbCB3aXRoIG9wdGlvbmFsIGxldmVsL2tleXdvcmQgZmlsdGVycy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIGxpbmVzOiB6Lm51bWJlcigpLm1pbigxKS5tYXgoMTAwMDApLmRlZmF1bHQoMTAwKS5kZXNjcmliZSgnTnVtYmVyIG9mIGxpbmVzIHRvIHJlYWQgZnJvbSB0aGUgZW5kIG9mIHRlbXAvbG9ncy9wcm9qZWN0LmxvZy4gRGVmYXVsdCAxMDAuJyksXG4gICAgICAgICAgICAgICAgICAgIGZpbHRlcktleXdvcmQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnT3B0aW9uYWwgY2FzZS1pbnNlbnNpdGl2ZSBrZXl3b3JkIGZpbHRlci4nKSxcbiAgICAgICAgICAgICAgICAgICAgbG9nTGV2ZWw6IHouZW51bShbJ0VSUk9SJywgJ1dBUk4nLCAnSU5GTycsICdERUJVRycsICdUUkFDRScsICdBTEwnXSkuZGVmYXVsdCgnQUxMJykuZGVzY3JpYmUoJ09wdGlvbmFsIGxvZyBsZXZlbCBmaWx0ZXIuIEFMTCBkaXNhYmxlcyBsZXZlbCBmaWx0ZXJpbmcuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLmdldFByb2plY3RMb2dzKGEubGluZXMsIGEuZmlsdGVyS2V5d29yZCwgYS5sb2dMZXZlbCksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdnZXRfbG9nX2ZpbGVfaW5mbycsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdSZWFkIGxvZyBmaWxlIGluZm8nLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnUmVhZCB0ZW1wL2xvZ3MvcHJvamVjdC5sb2cgcGF0aCwgc2l6ZSwgbGluZSBjb3VudCwgYW5kIHRpbWVzdGFtcHMuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6ICgpID0+IHRoaXMuZ2V0TG9nRmlsZUluZm8oKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3NlYXJjaF9wcm9qZWN0X2xvZ3MnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnU2VhcmNoIHByb2plY3QgbG9ncycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdTZWFyY2ggdGVtcC9sb2dzL3Byb2plY3QubG9nIGZvciBzdHJpbmcvcmVnZXggYW5kIHJldHVybiBsaW5lIGNvbnRleHQuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBwYXR0ZXJuOiB6LnN0cmluZygpLmRlc2NyaWJlKCdTZWFyY2ggc3RyaW5nIG9yIHJlZ2V4LiBJbnZhbGlkIHJlZ2V4IGlzIHRyZWF0ZWQgYXMgYSBsaXRlcmFsIHN0cmluZy4nKSxcbiAgICAgICAgICAgICAgICAgICAgbWF4UmVzdWx0czogei5udW1iZXIoKS5taW4oMSkubWF4KDEwMCkuZGVmYXVsdCgyMCkuZGVzY3JpYmUoJ01heGltdW0gbWF0Y2hlcyB0byByZXR1cm4uIERlZmF1bHQgMjAuJyksXG4gICAgICAgICAgICAgICAgICAgIGNvbnRleHRMaW5lczogei5udW1iZXIoKS5taW4oMCkubWF4KDEwKS5kZWZhdWx0KDIpLmRlc2NyaWJlKCdDb250ZXh0IGxpbmVzIGJlZm9yZS9hZnRlciBlYWNoIG1hdGNoLiBEZWZhdWx0IDIuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLnNlYXJjaFByb2plY3RMb2dzKGEucGF0dGVybiwgYS5tYXhSZXN1bHRzLCBhLmNvbnRleHRMaW5lcyksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdzY3JlZW5zaG90JyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ0NhcHR1cmUgZWRpdG9yIHNjcmVlbnNob3QnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnQ2FwdHVyZSB0aGUgZm9jdXNlZCBDb2NvcyBFZGl0b3Igd2luZG93IChvciBhIHdpbmRvdyBtYXRjaGVkIGJ5IHRpdGxlKSB0byBhIFBORy4gUmV0dXJucyBzYXZlZCBmaWxlIHBhdGguIFVzZSB0aGlzIGZvciBBSSB2aXN1YWwgdmVyaWZpY2F0aW9uIGFmdGVyIHNjZW5lL1VJIGNoYW5nZXMuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBzYXZlUGF0aDogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdBYnNvbHV0ZSBmaWxlc3lzdGVtIHBhdGggdG8gc2F2ZSB0aGUgUE5HLiBNdXN0IHJlc29sdmUgaW5zaWRlIHRoZSBjb2NvcyBwcm9qZWN0IHJvb3QgKGNvbnRhaW5tZW50IGNoZWNrIHZpYSByZWFscGF0aCkuIE9taXQgdG8gYXV0by1uYW1lIGludG8gPHByb2plY3Q+L3RlbXAvbWNwLWNhcHR1cmVzL3NjcmVlbnNob3QtPHRpbWVzdGFtcD4ucG5nLicpLFxuICAgICAgICAgICAgICAgICAgICB3aW5kb3dUaXRsZTogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdPcHRpb25hbCBzdWJzdHJpbmcgbWF0Y2ggb24gd2luZG93IHRpdGxlIHRvIHBpY2sgYSBzcGVjaWZpYyBFbGVjdHJvbiB3aW5kb3cuIERlZmF1bHQ6IGZvY3VzZWQgd2luZG93LicpLFxuICAgICAgICAgICAgICAgICAgICBpbmNsdWRlQmFzZTY0OiB6LmJvb2xlYW4oKS5kZWZhdWx0KGZhbHNlKS5kZXNjcmliZSgnRW1iZWQgUE5HIGJ5dGVzIGFzIGJhc2U2NCBpbiByZXNwb25zZSBkYXRhIChsYXJnZTsgZGVmYXVsdCBmYWxzZSkuIFdoZW4gZmFsc2UsIG9ubHkgdGhlIHNhdmVkIGZpbGUgcGF0aCBpcyByZXR1cm5lZC4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMuc2NyZWVuc2hvdChhLnNhdmVQYXRoLCBhLndpbmRvd1RpdGxlLCBhLmluY2x1ZGVCYXNlNjQpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnY2FwdHVyZV9wcmV2aWV3X3NjcmVlbnNob3QnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnQ2FwdHVyZSBwcmV2aWV3IHNjcmVlbnNob3QnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnQ2FwdHVyZSB0aGUgY29jb3MgUHJldmlldy1pbi1FZGl0b3IgKFBJRSkgZ2FtZXZpZXcgdG8gYSBQTkcuIENvY29zIGhhcyBtdWx0aXBsZSBQSUUgcmVuZGVyIHRhcmdldHMgZGVwZW5kaW5nIG9uIHRoZSB1c2VyXFwncyBwcmV2aWV3IGNvbmZpZyAoUHJlZmVyZW5jZXMg4oaSIFByZXZpZXcg4oaSIE9wZW4gUHJldmlldyBXaXRoKTogXCJicm93c2VyXCIgb3BlbnMgYW4gZXh0ZXJuYWwgYnJvd3NlciAoTk9UIGNhcHR1cmFibGUgaGVyZSksIFwid2luZG93XCIgLyBcInNpbXVsYXRvclwiIG9wZW5zIGEgc2VwYXJhdGUgRWxlY3Ryb24gd2luZG93ICh0aXRsZSBjb250YWlucyBcIlByZXZpZXdcIiksIFwiZW1iZWRkZWRcIiByZW5kZXJzIHRoZSBnYW1ldmlldyBpbnNpZGUgdGhlIG1haW4gZWRpdG9yIHdpbmRvdy4gVGhlIGRlZmF1bHQgbW9kZT1cImF1dG9cIiB0cmllcyB0aGUgUHJldmlldy10aXRsZWQgd2luZG93IGZpcnN0IGFuZCBmYWxscyBiYWNrIHRvIGNhcHR1cmluZyB0aGUgbWFpbiBlZGl0b3Igd2luZG93IHdoZW4gbm8gUHJldmlldy10aXRsZWQgd2luZG93IGV4aXN0cyAoY292ZXJzIGVtYmVkZGVkIG1vZGUpLiBVc2UgbW9kZT1cIndpbmRvd1wiIHRvIGZvcmNlIHRoZSBzZXBhcmF0ZS13aW5kb3cgc3RyYXRlZ3kgb3IgbW9kZT1cImVtYmVkZGVkXCIgdG8gc2tpcCB0aGUgd2luZG93IHByb2JlLiBQYWlyIHdpdGggZGVidWdfZ2V0X3ByZXZpZXdfbW9kZSB0byByZWFkIHRoZSBjb2NvcyBjb25maWcgYW5kIHJvdXRlIGRldGVybWluaXN0aWNhbGx5LiBGb3IgcnVudGltZSBnYW1lLWNhbnZhcyBwaXhlbC1sZXZlbCBjYXB0dXJlIChjYW1lcmEgUmVuZGVyVGV4dHVyZSksIHVzZSBkZWJ1Z19nYW1lX2NvbW1hbmQodHlwZT1cInNjcmVlbnNob3RcIikgaW5zdGVhZC4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHNhdmVQYXRoOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0Fic29sdXRlIGZpbGVzeXN0ZW0gcGF0aCB0byBzYXZlIHRoZSBQTkcuIE11c3QgcmVzb2x2ZSBpbnNpZGUgdGhlIGNvY29zIHByb2plY3Qgcm9vdCAoY29udGFpbm1lbnQgY2hlY2sgdmlhIHJlYWxwYXRoKS4gT21pdCB0byBhdXRvLW5hbWUgaW50byA8cHJvamVjdD4vdGVtcC9tY3AtY2FwdHVyZXMvcHJldmlldy08dGltZXN0YW1wPi5wbmcuJyksXG4gICAgICAgICAgICAgICAgICAgIG1vZGU6IHouZW51bShbJ2F1dG8nLCAnd2luZG93JywgJ2VtYmVkZGVkJ10pLmRlZmF1bHQoJ2F1dG8nKS5kZXNjcmliZSgnQ2FwdHVyZSB0YXJnZXQuIFwiYXV0b1wiIChkZWZhdWx0KSB0cmllcyBQcmV2aWV3LXRpdGxlZCB3aW5kb3cgdGhlbiBmYWxscyBiYWNrIHRvIHRoZSBtYWluIGVkaXRvciB3aW5kb3cuIFwid2luZG93XCIgb25seSBtYXRjaGVzIFByZXZpZXctdGl0bGVkIHdpbmRvd3MgKGZhaWxzIGlmIG5vbmUpLiBcImVtYmVkZGVkXCIgY2FwdHVyZXMgdGhlIG1haW4gZWRpdG9yIHdpbmRvdyBkaXJlY3RseSAoc2tpcCBQcmV2aWV3LXdpbmRvdyBwcm9iZSkuJyksXG4gICAgICAgICAgICAgICAgICAgIHdpbmRvd1RpdGxlOiB6LnN0cmluZygpLmRlZmF1bHQoJ1ByZXZpZXcnKS5kZXNjcmliZSgnU3Vic3RyaW5nIG1hdGNoZWQgYWdhaW5zdCB3aW5kb3cgdGl0bGVzIGluIHdpbmRvdy9hdXRvIG1vZGVzIChkZWZhdWx0IFwiUHJldmlld1wiIGZvciBQSUUpLiBJZ25vcmVkIGluIGVtYmVkZGVkIG1vZGUuJyksXG4gICAgICAgICAgICAgICAgICAgIGluY2x1ZGVCYXNlNjQ6IHouYm9vbGVhbigpLmRlZmF1bHQoZmFsc2UpLmRlc2NyaWJlKCdFbWJlZCBQTkcgYnl0ZXMgYXMgYmFzZTY0IGluIHJlc3BvbnNlIGRhdGEgKGxhcmdlOyBkZWZhdWx0IGZhbHNlKS4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMuY2FwdHVyZVByZXZpZXdTY3JlZW5zaG90KGEuc2F2ZVBhdGgsIGEubW9kZSA/PyAnYXV0bycsIGEud2luZG93VGl0bGUsIGEuaW5jbHVkZUJhc2U2NCksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdnZXRfcHJldmlld19tb2RlJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1JlYWQgcHJldmlldyBtb2RlJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1JlYWQgdGhlIGNvY29zIHByZXZpZXcgY29uZmlndXJhdGlvbi4gVXNlcyBFZGl0b3IuTWVzc2FnZSBwcmVmZXJlbmNlcy9xdWVyeS1jb25maWcgc28gQUkgY2FuIHJvdXRlIGRlYnVnX2NhcHR1cmVfcHJldmlld19zY3JlZW5zaG90IHRvIHRoZSBjb3JyZWN0IG1vZGUuIFJldHVybnMgeyBpbnRlcnByZXRlZDogXCJicm93c2VyXCIgfCBcIndpbmRvd1wiIHwgXCJzaW11bGF0b3JcIiB8IFwiZW1iZWRkZWRcIiB8IFwidW5rbm93blwiLCByYXc6IDxmdWxsIHByZXZpZXcgY29uZmlnIGR1bXA+IH0uIFVzZSBiZWZvcmUgY2FwdHVyZTogaWYgaW50ZXJwcmV0ZWQ9XCJlbWJlZGRlZFwiLCBjYWxsIGNhcHR1cmVfcHJldmlld19zY3JlZW5zaG90IHdpdGggbW9kZT1cImVtYmVkZGVkXCIgb3IgcmVseSBvbiBtb2RlPVwiYXV0b1wiIGZhbGxiYWNrLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiAoKSA9PiB0aGlzLmdldFByZXZpZXdNb2RlKCksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdzZXRfcHJldmlld19tb2RlJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1NldCBwcmV2aWV3IG1vZGUnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAn4p2MIE5PVCBTVVBQT1JURUQgb24gY29jb3MgMy44LjcrIChsYW5kbWluZSAjMTcpLiBQcm9ncmFtbWF0aWMgcHJldmlldy1tb2RlIHN3aXRjaGluZyBpcyBpbXBvc3NpYmxlIGZyb20gYSB0aGlyZC1wYXJ0eSBleHRlbnNpb24gb24gY29jb3MgMy44Ljc6IGBwcmVmZXJlbmNlcy9zZXQtY29uZmlnYCBhZ2FpbnN0IGBwcmV2aWV3LmN1cnJlbnQucGxhdGZvcm1gIHJldHVybnMgdHJ1dGh5IGJ1dCBuZXZlciBwZXJzaXN0cywgYW5kICoqbm9uZSBvZiA2IHN1cnZleWVkIHJlZmVyZW5jZSBwcm9qZWN0cyAoaGFyYWR5IC8gU3BheWRvIC8gUm9tYVJvZ292IC8gY29jb3MtY29kZS1tb2RlIC8gRnVucGxheUFJIC8gY29jb3MtY2xpKSBzaGlwIGEgd29ya2luZyBhbHRlcm5hdGl2ZSoqICh2Mi4xMCBjcm9zcy1yZXBvIHJlZnJlc2gsIDIwMjYtMDUtMDIpLiBUaGUgZmllbGQgaXMgZWZmZWN0aXZlbHkgcmVhZC1vbmx5IOKAlCBvbmx5IHRoZSBjb2NvcyBwcmV2aWV3IGRyb3Bkb3duIHdyaXRlcyBpdC4gKipVc2UgdGhlIGNvY29zIHByZXZpZXcgZHJvcGRvd24gaW4gdGhlIGVkaXRvciB0b29sYmFyIHRvIHN3aXRjaCBtb2RlcyoqLiBEZWZhdWx0IGJlaGF2aW9yIGlzIGhhcmQtZmFpbDsgcGFzcyBhdHRlbXB0QW55d2F5PXRydWUgT05MWSBmb3IgZGlhZ25vc3RpYyBwcm9iaW5nIChyZXR1cm5zIDQtc3RyYXRlZ3kgYXR0ZW1wdCBsb2cgc28geW91IGNhbiB2ZXJpZnkgYWdhaW5zdCBhIGZ1dHVyZSBjb2NvcyBidWlsZCB3aGV0aGVyIGFueSBzaGFwZSBub3cgd29ya3MpLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgbW9kZTogei5lbnVtKFsnYnJvd3NlcicsICdnYW1lVmlldycsICdzaW11bGF0b3InXSkuZGVzY3JpYmUoJ1RhcmdldCBwcmV2aWV3IHBsYXRmb3JtLiBcImJyb3dzZXJcIiBvcGVucyBwcmV2aWV3IGluIHRoZSB1c2VyIGRlZmF1bHQgYnJvd3Nlci4gXCJnYW1lVmlld1wiIGVtYmVkcyB0aGUgZ2FtZXZpZXcgaW4gdGhlIG1haW4gZWRpdG9yIChpbi1lZGl0b3IgcHJldmlldykuIFwic2ltdWxhdG9yXCIgbGF1bmNoZXMgdGhlIGNvY29zIHNpbXVsYXRvci4gTWFwcyBkaXJlY3RseSB0byB0aGUgY29jb3MgcHJldmlldy5jdXJyZW50LnBsYXRmb3JtIHZhbHVlLicpLFxuICAgICAgICAgICAgICAgICAgICBhdHRlbXB0QW55d2F5OiB6LmJvb2xlYW4oKS5kZWZhdWx0KGZhbHNlKS5kZXNjcmliZSgnRGlhZ25vc3RpYyBvcHQtaW4uIERlZmF1bHQgZmFsc2UgcmV0dXJucyBOT1RfU1VQUE9SVEVEIHdpdGggdGhlIGNvY29zIFVJIHJlZGlyZWN0LiBTZXQgdHJ1ZSBPTkxZIHRvIHJlLXByb2JlIHRoZSA0IHNldC1jb25maWcgc2hhcGVzIGFnYWluc3QgYSBuZXcgY29jb3MgYnVpbGQg4oCUIHVzZWZ1bCB3aGVuIHZhbGlkYXRpbmcgd2hldGhlciBhIGZ1dHVyZSBjb2NvcyB2ZXJzaW9uIGV4cG9zZXMgYSB3cml0ZSBwYXRoLiBSZXR1cm5zIGRhdGEuYXR0ZW1wdHMgd2l0aCBldmVyeSBzaGFwZSB0cmllZCBhbmQgaXRzIHJlYWQtYmFjayBvYnNlcnZhdGlvbi4gRG9lcyBOT1QgZnJlZXplIHRoZSBlZGl0b3IgKHRoZSBjYWxsIG1lcmVseSBuby1vcHMpLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy5zZXRQcmV2aWV3TW9kZShhLm1vZGUsIGEuYXR0ZW1wdEFueXdheSA/PyBmYWxzZSksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdiYXRjaF9zY3JlZW5zaG90JyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ0NhcHR1cmUgYmF0Y2ggc2NyZWVuc2hvdHMnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnQ2FwdHVyZSBtdWx0aXBsZSBQTkdzIG9mIHRoZSBlZGl0b3Igd2luZG93IHdpdGggb3B0aW9uYWwgZGVsYXlzIGJldHdlZW4gc2hvdHMuIFVzZWZ1bCBmb3IgYW5pbWF0aW5nIHByZXZpZXcgdmVyaWZpY2F0aW9uIG9yIGNhcHR1cmluZyB0cmFuc2l0aW9ucy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHNhdmVQYXRoUHJlZml4OiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1BhdGggcHJlZml4IGZvciBiYXRjaCBvdXRwdXQgZmlsZXMuIEZpbGVzIHdyaXR0ZW4gYXMgPHByZWZpeD4tPGluZGV4Pi5wbmcuIE11c3QgcmVzb2x2ZSBpbnNpZGUgdGhlIGNvY29zIHByb2plY3Qgcm9vdCAoY29udGFpbm1lbnQgY2hlY2sgdmlhIHJlYWxwYXRoKS4gRGVmYXVsdDogPHByb2plY3Q+L3RlbXAvbWNwLWNhcHR1cmVzL2JhdGNoLTx0aW1lc3RhbXA+LicpLFxuICAgICAgICAgICAgICAgICAgICBkZWxheXNNczogei5hcnJheSh6Lm51bWJlcigpLm1pbigwKS5tYXgoMTAwMDApKS5tYXgoMjApLmRlZmF1bHQoWzBdKS5kZXNjcmliZSgnRGVsYXkgKG1zKSBiZWZvcmUgZWFjaCBjYXB0dXJlLiBMZW5ndGggZGV0ZXJtaW5lcyBob3cgbWFueSBzaG90cyB0YWtlbiAoY2FwcGVkIGF0IDIwIHRvIHByZXZlbnQgZGlzayBmaWxsIC8gZWRpdG9yIGZyZWV6ZSkuIERlZmF1bHQgWzBdID0gc2luZ2xlIHNob3QuJyksXG4gICAgICAgICAgICAgICAgICAgIHdpbmRvd1RpdGxlOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ09wdGlvbmFsIHN1YnN0cmluZyBtYXRjaCBvbiB3aW5kb3cgdGl0bGUuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLmJhdGNoU2NyZWVuc2hvdChhLnNhdmVQYXRoUHJlZml4LCBhLmRlbGF5c01zLCBhLndpbmRvd1RpdGxlKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3dhaXRfY29tcGlsZScsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdXYWl0IGZvciBjb21waWxlJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ0Jsb2NrIHVudGlsIGNvY29zIGZpbmlzaGVzIGl0cyBUeXBlU2NyaXB0IGNvbXBpbGUgcGFzcy4gVGFpbHMgdGVtcC9wcm9ncmFtbWluZy9wYWNrZXItZHJpdmVyL2xvZ3MvZGVidWcubG9nIGZvciB0aGUgXCJUYXJnZXQoZWRpdG9yKSBlbmRzXCIgbWFya2VyLiBSZXR1cm5zIGltbWVkaWF0ZWx5IHdpdGggY29tcGlsZWQ9ZmFsc2UgaWYgbm8gY29tcGlsZSB3YXMgdHJpZ2dlcmVkIChjbGVhbiBwcm9qZWN0IC8gbm8gY2hhbmdlcyBkZXRlY3RlZCkuIFBhaXIgd2l0aCBydW5fc2NyaXB0X2RpYWdub3N0aWNzIGZvciBhbiBcImVkaXQgLnRzIOKGkiB3YWl0IOKGkiBmZXRjaCBlcnJvcnNcIiB3b3JrZmxvdy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHRpbWVvdXRNczogei5udW1iZXIoKS5taW4oNTAwKS5tYXgoMTIwMDAwKS5kZWZhdWx0KDE1MDAwKS5kZXNjcmliZSgnTWF4IHdhaXQgdGltZSBpbiBtcyBiZWZvcmUgZ2l2aW5nIHVwLiBEZWZhdWx0IDE1MDAwLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy53YWl0Q29tcGlsZShhLnRpbWVvdXRNcyksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdydW5fc2NyaXB0X2RpYWdub3N0aWNzJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1J1biBzY3JpcHQgZGlhZ25vc3RpY3MnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnUnVuIGB0c2MgLS1ub0VtaXRgIGFnYWluc3QgdGhlIHByb2plY3QgdHNjb25maWcgYW5kIHJldHVybiBwYXJzZWQgZGlhZ25vc3RpY3MuIFVzZWQgYWZ0ZXIgd2FpdF9jb21waWxlIHRvIHN1cmZhY2UgY29tcGlsYXRpb24gZXJyb3JzIGFzIHN0cnVjdHVyZWQge2ZpbGUsIGxpbmUsIGNvbHVtbiwgY29kZSwgbWVzc2FnZX0gZW50cmllcy4gUmVzb2x2ZXMgdHNjIGJpbmFyeSBmcm9tIHByb2plY3Qgbm9kZV9tb2R1bGVzIOKGkiBlZGl0b3IgYnVuZGxlZCBlbmdpbmUg4oaSIG5weCBmYWxsYmFjay4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHRzY29uZmlnUGF0aDogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdPcHRpb25hbCBvdmVycmlkZSAoYWJzb2x1dGUgb3IgcHJvamVjdC1yZWxhdGl2ZSkuIERlZmF1bHQ6IHRzY29uZmlnLmpzb24gb3IgdGVtcC90c2NvbmZpZy5jb2Nvcy5qc29uLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy5ydW5TY3JpcHREaWFnbm9zdGljcyhhLnRzY29uZmlnUGF0aCksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdwcmV2aWV3X3VybCcsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdSZXNvbHZlIHByZXZpZXcgVVJMJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1Jlc29sdmUgdGhlIGNvY29zIGJyb3dzZXItcHJldmlldyBVUkwuIFVzZXMgdGhlIGRvY3VtZW50ZWQgRWRpdG9yLk1lc3NhZ2UgY2hhbm5lbCBwcmV2aWV3L3F1ZXJ5LXByZXZpZXctdXJsLiBXaXRoIGFjdGlvbj1cIm9wZW5cIiwgYWxzbyBsYXVuY2hlcyB0aGUgVVJMIGluIHRoZSB1c2VyIGRlZmF1bHQgYnJvd3NlciB2aWEgZWxlY3Ryb24uc2hlbGwub3BlbkV4dGVybmFsIOKAlCB1c2VmdWwgYXMgYSBzZXR1cCBzdGVwIGJlZm9yZSBkZWJ1Z19nYW1lX2NvbW1hbmQsIHNpbmNlIHRoZSBHYW1lRGVidWdDbGllbnQgcnVubmluZyBpbnNpZGUgdGhlIHByZXZpZXcgbXVzdCBiZSByZWFjaGFibGUuIEVkaXRvci1zaWRlIFByZXZpZXctaW4tRWRpdG9yIHBsYXkvc3RvcCBpcyBOT1QgZXhwb3NlZCBieSB0aGUgcHVibGljIG1lc3NhZ2UgQVBJIGFuZCBpcyBpbnRlbnRpb25hbGx5IG5vdCBpbXBsZW1lbnRlZCBoZXJlOyB1c2UgdGhlIGNvY29zIGVkaXRvciB0b29sYmFyIG1hbnVhbGx5IGZvciBQSUUuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBhY3Rpb246IHouZW51bShbJ3F1ZXJ5JywgJ29wZW4nXSkuZGVmYXVsdCgncXVlcnknKS5kZXNjcmliZSgnXCJxdWVyeVwiIHJldHVybnMgdGhlIFVSTDsgXCJvcGVuXCIgcmV0dXJucyB0aGUgVVJMIEFORCBvcGVucyBpdCBpbiB0aGUgdXNlciBkZWZhdWx0IGJyb3dzZXIgdmlhIGVsZWN0cm9uLnNoZWxsLm9wZW5FeHRlcm5hbC4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMucHJldmlld1VybChhLmFjdGlvbiksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdxdWVyeV9kZXZpY2VzJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ0xpc3QgcHJldmlldyBkZXZpY2VzJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ0xpc3QgcHJldmlldyBkZXZpY2VzIGNvbmZpZ3VyZWQgaW4gdGhlIGNvY29zIHByb2plY3QuIEJhY2tlZCBieSBFZGl0b3IuTWVzc2FnZSBjaGFubmVsIGRldmljZS9xdWVyeS4gUmV0dXJucyBhbiBhcnJheSBvZiB7bmFtZSwgd2lkdGgsIGhlaWdodCwgcmF0aW99IGVudHJpZXMg4oCUIHVzZWZ1bCBmb3IgYmF0Y2gtc2NyZWVuc2hvdCBwaXBlbGluZXMgdGhhdCB0YXJnZXQgbXVsdGlwbGUgcmVzb2x1dGlvbnMuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6ICgpID0+IHRoaXMucXVlcnlEZXZpY2VzKCksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdnYW1lX2NvbW1hbmQnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnU2VuZCBnYW1lIGNvbW1hbmQnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnU2VuZCBhIHJ1bnRpbWUgY29tbWFuZCB0byBhIGNvbm5lY3RlZCBHYW1lRGVidWdDbGllbnQuIFdvcmtzIGluc2lkZSBhIGNvY29zIHByZXZpZXcvYnVpbGQgKGJyb3dzZXIsIFByZXZpZXctaW4tRWRpdG9yLCBvciBhbnkgZGV2aWNlIHRoYXQgZmV0Y2hlcyAvZ2FtZS9jb21tYW5kKS4gQnVpbHQtaW4gY29tbWFuZCB0eXBlczogXCJzY3JlZW5zaG90XCIgKGNhcHR1cmUgZ2FtZSBjYW52YXMgdG8gUE5HLCByZXR1cm5zIHNhdmVkIGZpbGUgcGF0aCksIFwiY2xpY2tcIiAoZW1pdCBCdXR0b24uQ0xJQ0sgb24gYSBub2RlIGJ5IG5hbWUpLCBcImluc3BlY3RcIiAoZHVtcCBydW50aW1lIG5vZGUgaW5mbzogcG9zaXRpb24vc2NhbGUvcm90YXRpb24vYWN0aXZlL2NvbXBvbmVudHMgYnkgbmFtZTsgd2hlbiBwcmVzZW50IGFsc28gcmV0dXJucyBVSVRyYW5zZm9ybS5jb250ZW50U2l6ZS9hbmNob3JQb2ludCwgV2lkZ2V0IGFsaWdubWVudCBmbGFncy9vZmZzZXRzLCBhbmQgTGF5b3V0IHR5cGUvc3BhY2luZy9wYWRkaW5nKSwgXCJzdGF0ZVwiIChkdW1wIGdsb2JhbCBnYW1lIHN0YXRlIGZyb20gdGhlIHJ1bm5pbmcgZ2FtZSBjbGllbnQpLCBhbmQgXCJuYXZpZ2F0ZVwiIChzd2l0Y2ggc2NlbmUvcGFnZSBieSBuYW1lIHRocm91Z2ggdGhlIGdhbWUgY2xpZW50XFwncyByb3V0ZXIpLiBDdXN0b20gY29tbWFuZCB0eXBlcyBhcmUgZm9yd2FyZGVkIHRvIHRoZSBjbGllbnRcXCdzIGN1c3RvbUNvbW1hbmRzIG1hcC4gUmVxdWlyZXMgdGhlIEdhbWVEZWJ1Z0NsaWVudCB0ZW1wbGF0ZSAoY2xpZW50L2NvY29zLW1jcC1jbGllbnQudHMpIHdpcmVkIGludG8gdGhlIHJ1bm5pbmcgZ2FtZTsgd2l0aG91dCBpdCB0aGUgY2FsbCB0aW1lcyBvdXQuIENoZWNrIEdFVCAvZ2FtZS9zdGF0dXMgdG8gdmVyaWZ5IGNsaWVudCBsaXZlbmVzcyBmaXJzdC4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHR5cGU6IHouc3RyaW5nKCkubWluKDEpLmRlc2NyaWJlKCdDb21tYW5kIHR5cGUuIEJ1aWx0LWluczogc2NyZWVuc2hvdCwgY2xpY2ssIGluc3BlY3QsIHN0YXRlLCBuYXZpZ2F0ZS4gQ3VzdG9tczogYW55IHN0cmluZyB0aGUgR2FtZURlYnVnQ2xpZW50IHJlZ2lzdGVyZWQgaW4gY3VzdG9tQ29tbWFuZHMuJyksXG4gICAgICAgICAgICAgICAgICAgIGFyZ3M6IHouYW55KCkub3B0aW9uYWwoKS5kZXNjcmliZSgnQ29tbWFuZC1zcGVjaWZpYyBhcmd1bWVudHMuIEZvciBcImNsaWNrXCIvXCJpbnNwZWN0XCI6IHtuYW1lOiBzdHJpbmd9IG5vZGUgbmFtZS4gRm9yIFwibmF2aWdhdGVcIjoge3BhZ2VOYW1lOiBzdHJpbmd9IG9yIHtwYWdlOiBzdHJpbmd9LiBGb3IgXCJzdGF0ZVwiL1wic2NyZWVuc2hvdFwiOiB7fSAobm8gYXJncykuJyksXG4gICAgICAgICAgICAgICAgICAgIHRpbWVvdXRNczogei5udW1iZXIoKS5taW4oNTAwKS5tYXgoNjAwMDApLmRlZmF1bHQoMTAwMDApLmRlc2NyaWJlKCdNYXggd2FpdCBmb3IgY2xpZW50IHJlc3BvbnNlLiBEZWZhdWx0IDEwMDAwbXMuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLmdhbWVDb21tYW5kKGEudHlwZSwgYS5hcmdzLCBhLnRpbWVvdXRNcyksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdyZWNvcmRfc3RhcnQnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnU3RhcnQgZ2FtZSByZWNvcmRpbmcnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnU3RhcnQgcmVjb3JkaW5nIHRoZSBydW5uaW5nIGdhbWUgY2FudmFzIHZpYSB0aGUgR2FtZURlYnVnQ2xpZW50IChicm93c2VyL1BJRSBwcmV2aWV3IG9ubHkpLiBXcmFwcyBkZWJ1Z19nYW1lX2NvbW1hbmQodHlwZT1cInJlY29yZF9zdGFydFwiKSBmb3IgQUkgZXJnb25vbWljcy4gUmV0dXJucyBpbW1lZGlhdGVseSB3aXRoIHsgcmVjb3JkaW5nOiB0cnVlLCBtaW1lVHlwZSB9OyB0aGUgcmVjb3JkaW5nIGNvbnRpbnVlcyB1bnRpbCBkZWJ1Z19yZWNvcmRfc3RvcCBpcyBjYWxsZWQuIEJyb3dzZXItb25seSDigJQgZmFpbHMgb24gbmF0aXZlIGNvY29zIGJ1aWxkcyAoTWVkaWFSZWNvcmRlciBBUEkgcmVxdWlyZXMgYSBET00gY2FudmFzICsgY2FwdHVyZVN0cmVhbSkuIFNpbmdsZS1mbGlnaHQgcGVyIGNsaWVudDogYSBzZWNvbmQgcmVjb3JkX3N0YXJ0IHdoaWxlIGEgcmVjb3JkaW5nIGlzIGluIHByb2dyZXNzIHJldHVybnMgc3VjY2VzczpmYWxzZS4gUGFpciB3aXRoIGRlYnVnX2dhbWVfY2xpZW50X3N0YXR1cyB0byBjb25maXJtIGEgY2xpZW50IGlzIGNvbm5lY3RlZCBiZWZvcmUgY2FsbGluZy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIG1pbWVUeXBlOiB6LmVudW0oWyd2aWRlby93ZWJtJywgJ3ZpZGVvL21wNCddKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdDb250YWluZXIvY29kZWMgaGludCBmb3IgTWVkaWFSZWNvcmRlci4gRGVmYXVsdDogYnJvd3NlciBhdXRvLXBpY2sgKHdlYm0gcHJlZmVycmVkIHdoZXJlIHN1cHBvcnRlZCwgZmFsbHMgYmFjayB0byBtcDQpLiBTb21lIGJyb3dzZXJzIHJlamVjdCB1bnN1cHBvcnRlZCB0eXBlcyDigJQgcmVjb3JkX3N0YXJ0IHN1cmZhY2VzIGEgY2xlYXIgZXJyb3IgaW4gdGhhdCBjYXNlLicpLFxuICAgICAgICAgICAgICAgICAgICB2aWRlb0JpdHNQZXJTZWNvbmQ6IHoubnVtYmVyKCkubWluKDEwMF8wMDApLm1heCgyMF8wMDBfMDAwKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdPcHRpb25hbCBNZWRpYVJlY29yZGVyIGJpdHJhdGUgaGludCBpbiBiaXRzL3NlYy4gTG93ZXIg4oaSIHNtYWxsZXIgZmlsZXMgYnV0IGxvd2VyIHF1YWxpdHkuIEJyb3dzZXIgZGVmYXVsdCBpZiBvbWl0dGVkLicpLFxuICAgICAgICAgICAgICAgICAgICB0aW1lb3V0TXM6IHoubnVtYmVyKCkubWluKDUwMCkubWF4KDMwMDAwKS5kZWZhdWx0KDUwMDApLmRlc2NyaWJlKCdNYXggd2FpdCBmb3IgdGhlIEdhbWVEZWJ1Z0NsaWVudCB0byBhY2tub3dsZWRnZSByZWNvcmRfc3RhcnQuIFJlY29yZGluZyBpdHNlbGYgcnVucyB1bnRpbCBkZWJ1Z19yZWNvcmRfc3RvcC4gRGVmYXVsdCA1MDAwbXMuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLnJlY29yZFN0YXJ0KGEubWltZVR5cGUsIGEudmlkZW9CaXRzUGVyU2Vjb25kLCBhLnRpbWVvdXRNcyA/PyA1MDAwKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3JlY29yZF9zdG9wJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1N0b3AgZ2FtZSByZWNvcmRpbmcnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnU3RvcCB0aGUgaW4tcHJvZ3Jlc3MgZ2FtZSBjYW52YXMgcmVjb3JkaW5nIGFuZCBwZXJzaXN0IGl0IHVuZGVyIDxwcm9qZWN0Pi90ZW1wL21jcC1jYXB0dXJlcy4gV3JhcHMgZGVidWdfZ2FtZV9jb21tYW5kKHR5cGU9XCJyZWNvcmRfc3RvcFwiKS4gUmV0dXJucyB7IGZpbGVQYXRoLCBzaXplLCBtaW1lVHlwZSwgZHVyYXRpb25NcyB9LiBDYWxsaW5nIHdpdGhvdXQgYSBwcmlvciByZWNvcmRfc3RhcnQgcmV0dXJucyBzdWNjZXNzOmZhbHNlLiBUaGUgaG9zdCBhcHBsaWVzIHRoZSBzYW1lIHJlYWxwYXRoIGNvbnRhaW5tZW50IGd1YXJkICsgNjRNQiBieXRlIGNhcCAoc3luY2VkIHdpdGggdGhlIHJlcXVlc3QgYm9keSBjYXAgaW4gbWNwLXNlcnZlci1zZGsudHM7IHYyLjkuNiByYWlzZWQgYm90aCBmcm9tIDMyIHRvIDY0TUIpOyByYWlzZSB2aWRlb0JpdHNQZXJTZWNvbmQgLyByZWR1Y2UgcmVjb3JkaW5nIGR1cmF0aW9uIG9uIGNhcCByZWplY3Rpb24uJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICB0aW1lb3V0TXM6IHoubnVtYmVyKCkubWluKDEwMDApLm1heCgxMjAwMDApLmRlZmF1bHQoMzAwMDApLmRlc2NyaWJlKCdNYXggd2FpdCBmb3IgdGhlIGNsaWVudCB0byBhc3NlbWJsZSArIHJldHVybiB0aGUgcmVjb3JkaW5nIGJsb2IuIFJlY29yZGluZ3Mgb2Ygc2V2ZXJhbCBzZWNvbmRzIGF0IGhpZ2ggYml0cmF0ZSBtYXkgbmVlZCBsb25nZXIgdGhhbiB0aGUgZGVmYXVsdCAzMHMg4oCUIHJhaXNlIG9uIGxvbmcgcmVjb3JkaW5ncy4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMucmVjb3JkU3RvcChhLnRpbWVvdXRNcyA/PyAzMDAwMCksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdnYW1lX2NsaWVudF9zdGF0dXMnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnUmVhZCBnYW1lIGNsaWVudCBzdGF0dXMnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnUmVhZCBHYW1lRGVidWdDbGllbnQgY29ubmVjdGlvbiBzdGF0dXMuIEluY2x1ZGVzIGNvbm5lY3RlZCAocG9sbGVkIHdpdGhpbiAycyksIGxhc3QgcG9sbCB0aW1lc3RhbXAsIGFuZCB3aGV0aGVyIGEgY29tbWFuZCBpcyBxdWV1ZWQuIFVzZSBiZWZvcmUgZGVidWdfZ2FtZV9jb21tYW5kIHRvIGNvbmZpcm0gdGhlIGNsaWVudCBpcyByZWFjaGFibGUuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6ICgpID0+IHRoaXMuZ2FtZUNsaWVudFN0YXR1cygpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnY2hlY2tfZWRpdG9yX2hlYWx0aCcsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdDaGVjayBlZGl0b3IgaGVhbHRoJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1Byb2JlIHdoZXRoZXIgdGhlIGNvY29zIGVkaXRvciBzY2VuZS1zY3JpcHQgcmVuZGVyZXIgaXMgcmVzcG9uc2l2ZS4gVXNlZnVsIGFmdGVyIGRlYnVnX3ByZXZpZXdfY29udHJvbChzdGFydCkg4oCUIGxhbmRtaW5lICMxNiBkb2N1bWVudHMgdGhhdCBjb2NvcyAzLjguNyBzb21ldGltZXMgZnJlZXplcyB0aGUgc2NlbmUtc2NyaXB0IHJlbmRlcmVyIChzcGlubmluZyBpbmRpY2F0b3IsIEN0cmwrUiByZXF1aXJlZCkuIFN0cmF0ZWd5ICh2Mi45LjYpOiB0aHJlZSBwcm9iZXMg4oCUICgxKSBob3N0OiBkZXZpY2UvcXVlcnkgKG1haW4gcHJvY2VzcywgYWx3YXlzIHJlc3BvbnNpdmUgZXZlbiB3aGVuIHNjZW5lLXNjcmlwdCBpcyB3ZWRnZWQpOyAoMikgc2NlbmUvcXVlcnktaXMtcmVhZHkgdHlwZWQgY2hhbm5lbCDigJQgZGlyZWN0IElQQyBpbnRvIHRoZSBzY2VuZSBtb2R1bGUsIGhhbmdzIHdoZW4gc2NlbmUgcmVuZGVyZXIgaXMgZnJvemVuOyAoMykgc2NlbmUvcXVlcnktbm9kZS10cmVlIHR5cGVkIGNoYW5uZWwg4oCUIHJldHVybnMgdGhlIGZ1bGwgc2NlbmUgdHJlZSwgZm9yY2VzIGFuIGFjdHVhbCBzY2VuZS1ncmFwaCB3YWxrIHRocm91Z2ggdGhlIHdlZGdlZCBjb2RlIHBhdGguIEVhY2ggcHJvYmUgaGFzIGl0cyBvd24gdGltZW91dCByYWNlIChkZWZhdWx0IDE1MDBtcyBlYWNoKS4gU2NlbmUgZGVjbGFyZWQgYWxpdmUgb25seSB3aGVuIEJPVEggKDIpIHJldHVybnMgdHJ1ZSBBTkQgKDMpIHJldHVybnMgYSBub24tbnVsbCB0cmVlIHdpdGhpbiB0aGUgdGltZW91dC4gUmV0dXJucyB7IGhvc3RBbGl2ZSwgc2NlbmVBbGl2ZSwgc2NlbmVMYXRlbmN5TXMsIGhvc3RFcnJvciwgc2NlbmVFcnJvciwgdG90YWxQcm9iZU1zIH0uIEFJIHdvcmtmbG93OiBjYWxsIGFmdGVyIHByZXZpZXdfY29udHJvbChzdGFydCk7IGlmIHNjZW5lQWxpdmU9ZmFsc2UsIHN1cmZhY2UgXCJjb2NvcyBlZGl0b3IgbGlrZWx5IGZyb3plbiDigJQgcHJlc3MgQ3RybCtSXCIgaW5zdGVhZCBvZiBpc3N1aW5nIG1vcmUgc2NlbmUtYm91bmQgY2FsbHMuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBzY2VuZVRpbWVvdXRNczogei5udW1iZXIoKS5taW4oMjAwKS5tYXgoMTAwMDApLmRlZmF1bHQoMTUwMCkuZGVzY3JpYmUoJ1RpbWVvdXQgZm9yIHRoZSBzY2VuZS1zY3JpcHQgcHJvYmUgaW4gbXMuIEJlbG93IHRoaXMgc2NlbmUgaXMgY29uc2lkZXJlZCBmcm96ZW4uIERlZmF1bHQgMTUwMG1zLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy5jaGVja0VkaXRvckhlYWx0aChhLnNjZW5lVGltZW91dE1zID8/IDE1MDApLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAncHJldmlld19jb250cm9sJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ0NvbnRyb2wgcHJldmlldyBwbGF5YmFjaycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICfimqAgUEFSS0VEIOKAlCBzdGFydCBGUkVFWkVTIGNvY29zIDMuOC43IChsYW5kbWluZSAjMTYpLiBQcm9ncmFtbWF0aWNhbGx5IHN0YXJ0IG9yIHN0b3AgUHJldmlldy1pbi1FZGl0b3IgKFBJRSkgcGxheSBtb2RlLiBXcmFwcyB0aGUgdHlwZWQgY2NlLlNjZW5lRmFjYWRlTWFuYWdlci5jaGFuZ2VQcmV2aWV3UGxheVN0YXRlIG1ldGhvZC4gKipzdGFydCBoaXRzIGEgY29jb3MgMy44Ljcgc29mdFJlbG9hZFNjZW5lIHJhY2UqKiB0aGF0IHJldHVybnMgc3VjY2VzcyBidXQgZnJlZXplcyB0aGUgZWRpdG9yIChzcGlubmluZyBpbmRpY2F0b3IsIEN0cmwrUiByZXF1aXJlZCB0byByZWNvdmVyKS4gVmVyaWZpZWQgaW4gYm90aCBlbWJlZGRlZCBhbmQgYnJvd3NlciBwcmV2aWV3IG1vZGVzLiB2Mi4xMCBjcm9zcy1yZXBvIHJlZnJlc2ggY29uZmlybWVkOiBub25lIG9mIDYgc3VydmV5ZWQgcGVlcnMgKGhhcmFkeSAvIFNwYXlkbyAvIFJvbWFSb2dvdiAvIGNvY29zLWNvZGUtbW9kZSAvIEZ1bnBsYXlBSSAvIGNvY29zLWNsaSkgc2hpcCBhIHNhZmVyIGNhbGwgcGF0aCDigJQgaGFyYWR5IGFuZCBjb2Nvcy1jb2RlLW1vZGUgdXNlIHRoZSBgRWRpdG9yLk1lc3NhZ2Ugc2NlbmUvZWRpdG9yLXByZXZpZXctc2V0LXBsYXlgIGNoYW5uZWwgYW5kIGhpdCB0aGUgc2FtZSByYWNlLiAqKnN0b3AgaXMgc2FmZSoqIGFuZCByZWxpYWJsZS4gVG8gcHJldmVudCBhY2NpZGVudGFsIHRyaWdnZXJpbmcsIHN0YXJ0IHJlcXVpcmVzIGV4cGxpY2l0IGBhY2tub3dsZWRnZUZyZWV6ZVJpc2s6IHRydWVgLiAqKlN0cm9uZ2x5IHByZWZlcnJlZCBhbHRlcm5hdGl2ZXMgaW5zdGVhZCBvZiBzdGFydCoqOiAoYSkgZGVidWdfY2FwdHVyZV9wcmV2aWV3X3NjcmVlbnNob3QobW9kZT1cImVtYmVkZGVkXCIpIGluIEVESVQgbW9kZSDigJQgbm8gUElFIG5lZWRlZDsgKGIpIGRlYnVnX2dhbWVfY29tbWFuZCh0eXBlPVwic2NyZWVuc2hvdFwiKSB2aWEgR2FtZURlYnVnQ2xpZW50IG9uIGJyb3dzZXIgcHJldmlldyBsYXVuY2hlZCB2aWEgZGVidWdfcHJldmlld191cmwoYWN0aW9uPVwib3BlblwiKS4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIG9wOiB6LmVudW0oWydzdGFydCcsICdzdG9wJ10pLmRlc2NyaWJlKCdcInN0YXJ0XCIgZW50ZXJzIFBJRSBwbGF5IG1vZGUgKGVxdWl2YWxlbnQgdG8gY2xpY2tpbmcgdGhlIHRvb2xiYXIgcGxheSBidXR0b24pIOKAlCBSRVFVSVJFUyBhY2tub3dsZWRnZUZyZWV6ZVJpc2s9dHJ1ZSBvbiBjb2NvcyAzLjguNyBkdWUgdG8gbGFuZG1pbmUgIzE2LiBcInN0b3BcIiBleGl0cyBQSUUgcGxheSBhbmQgcmV0dXJucyB0byBzY2VuZSBtb2RlIChhbHdheXMgc2FmZSkuJyksXG4gICAgICAgICAgICAgICAgICAgIGFja25vd2xlZGdlRnJlZXplUmlzazogei5ib29sZWFuKCkuZGVmYXVsdChmYWxzZSkuZGVzY3JpYmUoJ1JlcXVpcmVkIHRvIGJlIHRydWUgZm9yIG9wPVwic3RhcnRcIiBvbiBjb2NvcyAzLjguNyBkdWUgdG8gbGFuZG1pbmUgIzE2IChzb2Z0UmVsb2FkU2NlbmUgcmFjZSB0aGF0IGZyZWV6ZXMgdGhlIGVkaXRvcikuIFNldCB0cnVlIE9OTFkgd2hlbiB0aGUgaHVtYW4gdXNlciBoYXMgZXhwbGljaXRseSBhY2NlcHRlZCB0aGUgcmlzayBhbmQgaXMgcHJlcGFyZWQgdG8gcHJlc3MgQ3RybCtSIGlmIHRoZSBlZGl0b3IgZnJlZXplcy4gSWdub3JlZCBmb3Igb3A9XCJzdG9wXCIgd2hpY2ggaXMgcmVsaWFibGUuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLnByZXZpZXdDb250cm9sKGEub3AsIGEuYWNrbm93bGVkZ2VGcmVlemVSaXNrID8/IGZhbHNlKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2dldF9zY3JpcHRfZGlhZ25vc3RpY19jb250ZXh0JyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1JlYWQgZGlhZ25vc3RpYyBjb250ZXh0JyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1JlYWQgYSB3aW5kb3cgb2Ygc291cmNlIGxpbmVzIGFyb3VuZCBhIGRpYWdub3N0aWMgbG9jYXRpb24gc28gQUkgY2FuIHJlYWQgdGhlIG9mZmVuZGluZyBjb2RlIHdpdGhvdXQgYSBzZXBhcmF0ZSBmaWxlIHJlYWQuIFBhaXIgd2l0aCBydW5fc2NyaXB0X2RpYWdub3N0aWNzOiBwYXNzIGZpbGUvbGluZSBmcm9tIGVhY2ggZGlhZ25vc3RpYyB0byBmZXRjaCBjb250ZXh0LicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgZmlsZTogei5zdHJpbmcoKS5kZXNjcmliZSgnQWJzb2x1dGUgb3IgcHJvamVjdC1yZWxhdGl2ZSBwYXRoIHRvIHRoZSBzb3VyY2UgZmlsZS4gRGlhZ25vc3RpY3MgZnJvbSBydW5fc2NyaXB0X2RpYWdub3N0aWNzIGFscmVhZHkgdXNlIGEgcGF0aCB0c2MgZW1pdHRlZCwgd2hpY2ggaXMgc3VpdGFibGUgaGVyZS4nKSxcbiAgICAgICAgICAgICAgICAgICAgbGluZTogei5udW1iZXIoKS5taW4oMSkuZGVzY3JpYmUoJzEtYmFzZWQgbGluZSBudW1iZXIgdGhhdCB0aGUgZGlhZ25vc3RpYyBwb2ludHMgYXQuJyksXG4gICAgICAgICAgICAgICAgICAgIGNvbnRleHRMaW5lczogei5udW1iZXIoKS5taW4oMCkubWF4KDUwKS5kZWZhdWx0KDUpLmRlc2NyaWJlKCdOdW1iZXIgb2YgbGluZXMgdG8gaW5jbHVkZSBiZWZvcmUgYW5kIGFmdGVyIHRoZSB0YXJnZXQgbGluZS4gRGVmYXVsdCA1ICjCsTUg4oaSIDExLWxpbmUgd2luZG93KS4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMuZ2V0U2NyaXB0RGlhZ25vc3RpY0NvbnRleHQoYS5maWxlLCBhLmxpbmUsIGEuY29udGV4dExpbmVzKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgIF07XG4gICAgICAgIHRoaXMuZXhlYyA9IGRlZmluZVRvb2xzKGRlZnMpO1xuICAgIH1cblxuICAgIGdldFRvb2xzKCk6IFRvb2xEZWZpbml0aW9uW10geyByZXR1cm4gdGhpcy5leGVjLmdldFRvb2xzKCk7IH1cbiAgICBleGVjdXRlKHRvb2xOYW1lOiBzdHJpbmcsIGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7IHJldHVybiB0aGlzLmV4ZWMuZXhlY3V0ZSh0b29sTmFtZSwgYXJncyk7IH1cblxuICAgIC8vIENvbXBhdCBwYXRoOiBwcmVzZXJ2ZSB0aGUgcHJlLXYyLjMuMCByZXNwb25zZSBzaGFwZVxuICAgIC8vIHtzdWNjZXNzLCBkYXRhOiB7cmVzdWx0LCBtZXNzYWdlOiAnU2NyaXB0IGV4ZWN1dGVkIHN1Y2Nlc3NmdWxseSd9fVxuICAgIC8vIHNvIG9sZGVyIGNhbGxlcnMgcmVhZGluZyBkYXRhLm1lc3NhZ2Uga2VlcCB3b3JraW5nLlxuICAgIHByaXZhdGUgYXN5bmMgZXhlY3V0ZVNjcmlwdENvbXBhdChzY3JpcHQ6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IG91dCA9IGF3YWl0IHRoaXMuZXhlY3V0ZUphdmFTY3JpcHQoc2NyaXB0LCAnc2NlbmUnKTtcbiAgICAgICAgaWYgKG91dC5zdWNjZXNzICYmIG91dC5kYXRhICYmICdyZXN1bHQnIGluIG91dC5kYXRhKSB7XG4gICAgICAgICAgICByZXR1cm4gb2soe1xuICAgICAgICAgICAgICAgICAgICByZXN1bHQ6IG91dC5kYXRhLnJlc3VsdCxcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogJ1NjcmlwdCBleGVjdXRlZCBzdWNjZXNzZnVsbHknLFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBvdXQ7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBjbGVhckNvbnNvbGUoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIE5vdGU6IEVkaXRvci5NZXNzYWdlLnNlbmQgbWF5IG5vdCByZXR1cm4gYSBwcm9taXNlIGluIGFsbCB2ZXJzaW9uc1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2Uuc2VuZCgnY29uc29sZScsICdjbGVhcicpO1xuICAgICAgICAgICAgcmV0dXJuIG9rKHVuZGVmaW5lZCwgJ0NvbnNvbGUgY2xlYXJlZCBzdWNjZXNzZnVsbHknKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGVyci5tZXNzYWdlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZXhlY3V0ZUphdmFTY3JpcHQoY29kZTogc3RyaW5nLCBjb250ZXh0OiAnc2NlbmUnIHwgJ2VkaXRvcicpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBpZiAoY29udGV4dCA9PT0gJ3NjZW5lJykge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZXhlY3V0ZUluU2NlbmVDb250ZXh0KGNvZGUpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChjb250ZXh0ID09PSAnZWRpdG9yJykge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZXhlY3V0ZUluRWRpdG9yQ29udGV4dChjb2RlKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFpbChgVW5rbm93biBleGVjdXRlX2phdmFzY3JpcHQgY29udGV4dDogJHtjb250ZXh0fWApO1xuICAgIH1cblxuICAgIHByaXZhdGUgZXhlY3V0ZUluU2NlbmVDb250ZXh0KGNvZGU6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnZXhlY3V0ZS1zY2VuZS1zY3JpcHQnLCB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2NvbnNvbGUnLFxuICAgICAgICAgICAgICAgIG1ldGhvZDogJ2V2YWwnLFxuICAgICAgICAgICAgICAgIGFyZ3M6IFtjb2RlXVxuICAgICAgICAgICAgfSkudGhlbigocmVzdWx0OiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRleHQ6ICdzY2VuZScsXG4gICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQ6IHJlc3VsdCxcbiAgICAgICAgICAgICAgICAgICAgfSwgJ1NjZW5lIHNjcmlwdCBleGVjdXRlZCBzdWNjZXNzZnVsbHknKSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZXhlY3V0ZUluRWRpdG9yQ29udGV4dChjb2RlOiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBpZiAoIWlzRWRpdG9yQ29udGV4dEV2YWxFbmFibGVkKCkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKCdFZGl0b3IgY29udGV4dCBldmFsIGlzIGRpc2FibGVkLiBFbmFibGUgYGVuYWJsZUVkaXRvckNvbnRleHRFdmFsYCBpbiBNQ1Agc2VydmVyIHNldHRpbmdzIChwYW5lbCBVSSkgdG8gb3B0IGluLiBUaGlzIGdyYW50cyBBSS1nZW5lcmF0ZWQgY29kZSBhY2Nlc3MgdG8gRWRpdG9yLk1lc3NhZ2UgKyBOb2RlIGZzIEFQSXMgaW4gdGhlIGhvc3QgcHJvY2Vzczsgb25seSBlbmFibGUgd2hlbiB5b3UgdHJ1c3QgdGhlIHVwc3RyZWFtIHByb21wdCBzb3VyY2UuJyk7XG4gICAgICAgIH1cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIFdyYXAgaW4gYXN5bmMgSUlGRSBzbyBBSSBjYW4gdXNlIHRvcC1sZXZlbCBhd2FpdCB0cmFuc3BhcmVudGx5O1xuICAgICAgICAgICAgLy8gYWxzbyBnaXZlcyB1cyBhIGNsZWFuIFByb21pc2UtYmFzZWQgcmV0dXJuIHBhdGggcmVnYXJkbGVzcyBvZlxuICAgICAgICAgICAgLy8gd2hldGhlciB0aGUgdXNlciBjb2RlIHJldHVybnMgYSBQcm9taXNlIG9yIGEgc3luYyB2YWx1ZS5cbiAgICAgICAgICAgIGNvbnN0IHdyYXBwZWQgPSBgKGFzeW5jICgpID0+IHsgJHtjb2RlfSBcXG4gfSkoKWA7XG4gICAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tZXZhbFxuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgKDAsIGV2YWwpKHdyYXBwZWQpO1xuICAgICAgICAgICAgcmV0dXJuIG9rKHtcbiAgICAgICAgICAgICAgICAgICAgY29udGV4dDogJ2VkaXRvcicsXG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdDogcmVzdWx0LFxuICAgICAgICAgICAgICAgIH0sICdFZGl0b3Igc2NyaXB0IGV4ZWN1dGVkIHN1Y2Nlc3NmdWxseScpO1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoYEVkaXRvciBldmFsIGZhaWxlZDogJHtlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycil9YCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldE5vZGVUcmVlKHJvb3RVdWlkPzogc3RyaW5nLCBtYXhEZXB0aDogbnVtYmVyID0gMTApOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGJ1aWxkVHJlZSA9IGFzeW5jIChub2RlVXVpZDogc3RyaW5nLCBkZXB0aDogbnVtYmVyID0gMCk6IFByb21pc2U8YW55PiA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGRlcHRoID49IG1heERlcHRoKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7IHRydW5jYXRlZDogdHJ1ZSB9O1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG5vZGVEYXRhID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktbm9kZScsIG5vZGVVdWlkKTtcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRyZWUgPSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiBub2RlRGF0YS51dWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogbm9kZURhdGEubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGFjdGl2ZTogbm9kZURhdGEuYWN0aXZlLFxuICAgICAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50czogKG5vZGVEYXRhIGFzIGFueSkuY29tcG9uZW50cyA/IChub2RlRGF0YSBhcyBhbnkpLmNvbXBvbmVudHMubWFwKChjOiBhbnkpID0+IGMuX190eXBlX18pIDogW10sXG4gICAgICAgICAgICAgICAgICAgICAgICBjaGlsZENvdW50OiBub2RlRGF0YS5jaGlsZHJlbiA/IG5vZGVEYXRhLmNoaWxkcmVuLmxlbmd0aCA6IDAsXG4gICAgICAgICAgICAgICAgICAgICAgICBjaGlsZHJlbjogW10gYXMgYW55W11cbiAgICAgICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAobm9kZURhdGEuY2hpbGRyZW4gJiYgbm9kZURhdGEuY2hpbGRyZW4ubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBjaGlsZElkIG9mIG5vZGVEYXRhLmNoaWxkcmVuKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY2hpbGRUcmVlID0gYXdhaXQgYnVpbGRUcmVlKGNoaWxkSWQsIGRlcHRoICsgMSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHJlZS5jaGlsZHJlbi5wdXNoKGNoaWxkVHJlZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJlZTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4geyBlcnJvcjogZXJyLm1lc3NhZ2UgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBpZiAocm9vdFV1aWQpIHtcbiAgICAgICAgICAgICAgICBidWlsZFRyZWUocm9vdFV1aWQpLnRoZW4odHJlZSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUob2sodHJlZSkpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1oaWVyYXJjaHknKS50aGVuKGFzeW5jIChoaWVyYXJjaHk6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB0cmVlcyA9IFtdO1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IHJvb3ROb2RlIG9mIGhpZXJhcmNoeS5jaGlsZHJlbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgdHJlZSA9IGF3YWl0IGJ1aWxkVHJlZShyb290Tm9kZS51dWlkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyZWVzLnB1c2godHJlZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShvayh0cmVlcykpO1xuICAgICAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldFBlcmZvcm1hbmNlU3RhdHMoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1wZXJmb3JtYW5jZScpLnRoZW4oKHN0YXRzOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBwZXJmU3RhdHM6IFBlcmZvcm1hbmNlU3RhdHMgPSB7XG4gICAgICAgICAgICAgICAgICAgIG5vZGVDb3VudDogc3RhdHMubm9kZUNvdW50IHx8IDAsXG4gICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudENvdW50OiBzdGF0cy5jb21wb25lbnRDb3VudCB8fCAwLFxuICAgICAgICAgICAgICAgICAgICBkcmF3Q2FsbHM6IHN0YXRzLmRyYXdDYWxscyB8fCAwLFxuICAgICAgICAgICAgICAgICAgICB0cmlhbmdsZXM6IHN0YXRzLnRyaWFuZ2xlcyB8fCAwLFxuICAgICAgICAgICAgICAgICAgICBtZW1vcnk6IHN0YXRzLm1lbW9yeSB8fCB7fVxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayhwZXJmU3RhdHMpKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKCgpID0+IHtcbiAgICAgICAgICAgICAgICAvLyBGYWxsYmFjayB0byBiYXNpYyBzdGF0c1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogJ1BlcmZvcm1hbmNlIHN0YXRzIG5vdCBhdmFpbGFibGUgaW4gZWRpdCBtb2RlJ1xuICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyB2YWxpZGF0ZVNjZW5lKG9wdGlvbnM6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IGlzc3VlczogVmFsaWRhdGlvbklzc3VlW10gPSBbXTtcblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gQ2hlY2sgZm9yIG1pc3NpbmcgYXNzZXRzXG4gICAgICAgICAgICBpZiAob3B0aW9ucy5jaGVja01pc3NpbmdBc3NldHMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBhc3NldENoZWNrID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnY2hlY2stbWlzc2luZy1hc3NldHMnKTtcbiAgICAgICAgICAgICAgICBpZiAoYXNzZXRDaGVjayAmJiBhc3NldENoZWNrLm1pc3NpbmcpIHtcbiAgICAgICAgICAgICAgICAgICAgaXNzdWVzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogJ2Vycm9yJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhdGVnb3J5OiAnYXNzZXRzJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBGb3VuZCAke2Fzc2V0Q2hlY2subWlzc2luZy5sZW5ndGh9IG1pc3NpbmcgYXNzZXQgcmVmZXJlbmNlc2AsXG4gICAgICAgICAgICAgICAgICAgICAgICBkZXRhaWxzOiBhc3NldENoZWNrLm1pc3NpbmdcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBDaGVjayBmb3IgcGVyZm9ybWFuY2UgaXNzdWVzXG4gICAgICAgICAgICBpZiAob3B0aW9ucy5jaGVja1BlcmZvcm1hbmNlKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgaGllcmFyY2h5ID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktaGllcmFyY2h5Jyk7XG4gICAgICAgICAgICAgICAgY29uc3Qgbm9kZUNvdW50ID0gdGhpcy5jb3VudE5vZGVzKGhpZXJhcmNoeS5jaGlsZHJlbik7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaWYgKG5vZGVDb3VudCA+IDEwMDApIHtcbiAgICAgICAgICAgICAgICAgICAgaXNzdWVzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogJ3dhcm5pbmcnLFxuICAgICAgICAgICAgICAgICAgICAgICAgY2F0ZWdvcnk6ICdwZXJmb3JtYW5jZScsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgSGlnaCBub2RlIGNvdW50OiAke25vZGVDb3VudH0gbm9kZXMgKHJlY29tbWVuZGVkIDwgMTAwMClgLFxuICAgICAgICAgICAgICAgICAgICAgICAgc3VnZ2VzdGlvbjogJ0NvbnNpZGVyIHVzaW5nIG9iamVjdCBwb29saW5nIG9yIHNjZW5lIG9wdGltaXphdGlvbidcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCByZXN1bHQ6IFZhbGlkYXRpb25SZXN1bHQgPSB7XG4gICAgICAgICAgICAgICAgdmFsaWQ6IGlzc3Vlcy5sZW5ndGggPT09IDAsXG4gICAgICAgICAgICAgICAgaXNzdWVDb3VudDogaXNzdWVzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICBpc3N1ZXM6IGlzc3Vlc1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgcmV0dXJuIG9rKHJlc3VsdCk7XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChlcnIubWVzc2FnZSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGNvdW50Tm9kZXMobm9kZXM6IGFueVtdKTogbnVtYmVyIHtcbiAgICAgICAgbGV0IGNvdW50ID0gbm9kZXMubGVuZ3RoO1xuICAgICAgICBmb3IgKGNvbnN0IG5vZGUgb2Ygbm9kZXMpIHtcbiAgICAgICAgICAgIGlmIChub2RlLmNoaWxkcmVuKSB7XG4gICAgICAgICAgICAgICAgY291bnQgKz0gdGhpcy5jb3VudE5vZGVzKG5vZGUuY2hpbGRyZW4pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBjb3VudDtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldEVkaXRvckluZm8oKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgaW5mbyA9IHtcbiAgICAgICAgICAgIGVkaXRvcjoge1xuICAgICAgICAgICAgICAgIHZlcnNpb246IChFZGl0b3IgYXMgYW55KS52ZXJzaW9ucz8uZWRpdG9yIHx8ICdVbmtub3duJyxcbiAgICAgICAgICAgICAgICBjb2Nvc1ZlcnNpb246IChFZGl0b3IgYXMgYW55KS52ZXJzaW9ucz8uY29jb3MgfHwgJ1Vua25vd24nLFxuICAgICAgICAgICAgICAgIHBsYXRmb3JtOiBwcm9jZXNzLnBsYXRmb3JtLFxuICAgICAgICAgICAgICAgIGFyY2g6IHByb2Nlc3MuYXJjaCxcbiAgICAgICAgICAgICAgICBub2RlVmVyc2lvbjogcHJvY2Vzcy52ZXJzaW9uXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgcHJvamVjdDoge1xuICAgICAgICAgICAgICAgIG5hbWU6IEVkaXRvci5Qcm9qZWN0Lm5hbWUsXG4gICAgICAgICAgICAgICAgcGF0aDogRWRpdG9yLlByb2plY3QucGF0aCxcbiAgICAgICAgICAgICAgICB1dWlkOiBFZGl0b3IuUHJvamVjdC51dWlkXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgbWVtb3J5OiBwcm9jZXNzLm1lbW9yeVVzYWdlKCksXG4gICAgICAgICAgICB1cHRpbWU6IHByb2Nlc3MudXB0aW1lKClcbiAgICAgICAgfTtcblxuICAgICAgICByZXR1cm4gb2soaW5mbyk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSByZXNvbHZlUHJvamVjdExvZ1BhdGgoKTogeyBwYXRoOiBzdHJpbmcgfSB8IHsgZXJyb3I6IHN0cmluZyB9IHtcbiAgICAgICAgaWYgKCFFZGl0b3IuUHJvamVjdCB8fCAhRWRpdG9yLlByb2plY3QucGF0aCkge1xuICAgICAgICAgICAgcmV0dXJuIHsgZXJyb3I6ICdFZGl0b3IuUHJvamVjdC5wYXRoIGlzIG5vdCBhdmFpbGFibGU7IGNhbm5vdCBsb2NhdGUgcHJvamVjdCBsb2cgZmlsZS4nIH07XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgbG9nUGF0aCA9IHBhdGguam9pbihFZGl0b3IuUHJvamVjdC5wYXRoLCAndGVtcC9sb2dzL3Byb2plY3QubG9nJyk7XG4gICAgICAgIGlmICghZnMuZXhpc3RzU3luYyhsb2dQYXRoKSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgZXJyb3I6IGBQcm9qZWN0IGxvZyBmaWxlIG5vdCBmb3VuZCBhdCAke2xvZ1BhdGh9YCB9O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7IHBhdGg6IGxvZ1BhdGggfTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldFByb2plY3RMb2dzKGxpbmVzOiBudW1iZXIgPSAxMDAsIGZpbHRlcktleXdvcmQ/OiBzdHJpbmcsIGxvZ0xldmVsOiBzdHJpbmcgPSAnQUxMJyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByZXNvbHZlZCA9IHRoaXMucmVzb2x2ZVByb2plY3RMb2dQYXRoKCk7XG4gICAgICAgICAgICBpZiAoJ2Vycm9yJyBpbiByZXNvbHZlZCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKHJlc29sdmVkLmVycm9yKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGxvZ0ZpbGVQYXRoID0gcmVzb2x2ZWQucGF0aDtcblxuICAgICAgICAgICAgLy8gUmVhZCB0aGUgZmlsZSBjb250ZW50XG4gICAgICAgICAgICBjb25zdCBsb2dDb250ZW50ID0gZnMucmVhZEZpbGVTeW5jKGxvZ0ZpbGVQYXRoLCAndXRmOCcpO1xuICAgICAgICAgICAgY29uc3QgbG9nTGluZXMgPSBsb2dDb250ZW50LnNwbGl0KCdcXG4nKS5maWx0ZXIobGluZSA9PiBsaW5lLnRyaW0oKSAhPT0gJycpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBHZXQgdGhlIGxhc3QgTiBsaW5lc1xuICAgICAgICAgICAgY29uc3QgcmVjZW50TGluZXMgPSBsb2dMaW5lcy5zbGljZSgtbGluZXMpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBBcHBseSBmaWx0ZXJzXG4gICAgICAgICAgICBsZXQgZmlsdGVyZWRMaW5lcyA9IHJlY2VudExpbmVzO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBGaWx0ZXIgYnkgbG9nIGxldmVsIGlmIG5vdCAnQUxMJ1xuICAgICAgICAgICAgaWYgKGxvZ0xldmVsICE9PSAnQUxMJykge1xuICAgICAgICAgICAgICAgIGZpbHRlcmVkTGluZXMgPSBmaWx0ZXJlZExpbmVzLmZpbHRlcihsaW5lID0+IFxuICAgICAgICAgICAgICAgICAgICBsaW5lLmluY2x1ZGVzKGBbJHtsb2dMZXZlbH1dYCkgfHwgbGluZS5pbmNsdWRlcyhsb2dMZXZlbC50b0xvd2VyQ2FzZSgpKVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIEZpbHRlciBieSBrZXl3b3JkIGlmIHByb3ZpZGVkXG4gICAgICAgICAgICBpZiAoZmlsdGVyS2V5d29yZCkge1xuICAgICAgICAgICAgICAgIGZpbHRlcmVkTGluZXMgPSBmaWx0ZXJlZExpbmVzLmZpbHRlcihsaW5lID0+IFxuICAgICAgICAgICAgICAgICAgICBsaW5lLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoZmlsdGVyS2V5d29yZC50b0xvd2VyQ2FzZSgpKVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgICAgIHRvdGFsTGluZXM6IGxvZ0xpbmVzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgcmVxdWVzdGVkTGluZXM6IGxpbmVzLFxuICAgICAgICAgICAgICAgICAgICBmaWx0ZXJlZExpbmVzOiBmaWx0ZXJlZExpbmVzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgbG9nTGV2ZWw6IGxvZ0xldmVsLFxuICAgICAgICAgICAgICAgICAgICBmaWx0ZXJLZXl3b3JkOiBmaWx0ZXJLZXl3b3JkIHx8IG51bGwsXG4gICAgICAgICAgICAgICAgICAgIGxvZ3M6IGZpbHRlcmVkTGluZXMsXG4gICAgICAgICAgICAgICAgICAgIGxvZ0ZpbGVQYXRoOiBsb2dGaWxlUGF0aFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChgRmFpbGVkIHRvIHJlYWQgcHJvamVjdCBsb2dzOiAke2Vycm9yLm1lc3NhZ2V9YCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldExvZ0ZpbGVJbmZvKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByZXNvbHZlZCA9IHRoaXMucmVzb2x2ZVByb2plY3RMb2dQYXRoKCk7XG4gICAgICAgICAgICBpZiAoJ2Vycm9yJyBpbiByZXNvbHZlZCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKHJlc29sdmVkLmVycm9yKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGxvZ0ZpbGVQYXRoID0gcmVzb2x2ZWQucGF0aDtcblxuICAgICAgICAgICAgY29uc3Qgc3RhdHMgPSBmcy5zdGF0U3luYyhsb2dGaWxlUGF0aCk7XG4gICAgICAgICAgICBjb25zdCBsb2dDb250ZW50ID0gZnMucmVhZEZpbGVTeW5jKGxvZ0ZpbGVQYXRoLCAndXRmOCcpO1xuICAgICAgICAgICAgY29uc3QgbGluZUNvdW50ID0gbG9nQ29udGVudC5zcGxpdCgnXFxuJykuZmlsdGVyKGxpbmUgPT4gbGluZS50cmltKCkgIT09ICcnKS5sZW5ndGg7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgICAgIGZpbGVQYXRoOiBsb2dGaWxlUGF0aCxcbiAgICAgICAgICAgICAgICAgICAgZmlsZVNpemU6IHN0YXRzLnNpemUsXG4gICAgICAgICAgICAgICAgICAgIGZpbGVTaXplRm9ybWF0dGVkOiB0aGlzLmZvcm1hdEZpbGVTaXplKHN0YXRzLnNpemUpLFxuICAgICAgICAgICAgICAgICAgICBsYXN0TW9kaWZpZWQ6IHN0YXRzLm10aW1lLnRvSVNPU3RyaW5nKCksXG4gICAgICAgICAgICAgICAgICAgIGxpbmVDb3VudDogbGluZUNvdW50LFxuICAgICAgICAgICAgICAgICAgICBjcmVhdGVkOiBzdGF0cy5iaXJ0aHRpbWUudG9JU09TdHJpbmcoKSxcbiAgICAgICAgICAgICAgICAgICAgYWNjZXNzaWJsZTogZnMuY29uc3RhbnRzLlJfT0tcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoYEZhaWxlZCB0byBnZXQgbG9nIGZpbGUgaW5mbzogJHtlcnJvci5tZXNzYWdlfWApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBzZWFyY2hQcm9qZWN0TG9ncyhwYXR0ZXJuOiBzdHJpbmcsIG1heFJlc3VsdHM6IG51bWJlciA9IDIwLCBjb250ZXh0TGluZXM6IG51bWJlciA9IDIpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcmVzb2x2ZWQgPSB0aGlzLnJlc29sdmVQcm9qZWN0TG9nUGF0aCgpO1xuICAgICAgICAgICAgaWYgKCdlcnJvcicgaW4gcmVzb2x2ZWQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFpbChyZXNvbHZlZC5lcnJvcik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBsb2dGaWxlUGF0aCA9IHJlc29sdmVkLnBhdGg7XG5cbiAgICAgICAgICAgIGNvbnN0IGxvZ0NvbnRlbnQgPSBmcy5yZWFkRmlsZVN5bmMobG9nRmlsZVBhdGgsICd1dGY4Jyk7XG4gICAgICAgICAgICBjb25zdCBsb2dMaW5lcyA9IGxvZ0NvbnRlbnQuc3BsaXQoJ1xcbicpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBDcmVhdGUgcmVnZXggcGF0dGVybiAoc3VwcG9ydCBib3RoIHN0cmluZyBhbmQgcmVnZXggcGF0dGVybnMpXG4gICAgICAgICAgICBsZXQgcmVnZXg6IFJlZ0V4cDtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgcmVnZXggPSBuZXcgUmVnRXhwKHBhdHRlcm4sICdnaScpO1xuICAgICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICAgICAgLy8gSWYgcGF0dGVybiBpcyBub3QgdmFsaWQgcmVnZXgsIHRyZWF0IGFzIGxpdGVyYWwgc3RyaW5nXG4gICAgICAgICAgICAgICAgcmVnZXggPSBuZXcgUmVnRXhwKHBhdHRlcm4ucmVwbGFjZSgvWy4qKz9eJHt9KCl8W1xcXVxcXFxdL2csICdcXFxcJCYnKSwgJ2dpJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGNvbnN0IG1hdGNoZXM6IGFueVtdID0gW107XG4gICAgICAgICAgICBsZXQgcmVzdWx0Q291bnQgPSAwO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGxvZ0xpbmVzLmxlbmd0aCAmJiByZXN1bHRDb3VudCA8IG1heFJlc3VsdHM7IGkrKykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGxpbmUgPSBsb2dMaW5lc1tpXTtcbiAgICAgICAgICAgICAgICBpZiAocmVnZXgudGVzdChsaW5lKSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBHZXQgY29udGV4dCBsaW5lc1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjb250ZXh0U3RhcnQgPSBNYXRoLm1heCgwLCBpIC0gY29udGV4dExpbmVzKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY29udGV4dEVuZCA9IE1hdGgubWluKGxvZ0xpbmVzLmxlbmd0aCAtIDEsIGkgKyBjb250ZXh0TGluZXMpO1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY29udGV4dExpbmVzQXJyYXkgPSBbXTtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaiA9IGNvbnRleHRTdGFydDsgaiA8PSBjb250ZXh0RW5kOyBqKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRleHRMaW5lc0FycmF5LnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxpbmVOdW1iZXI6IGogKyAxLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRlbnQ6IGxvZ0xpbmVzW2pdLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlzTWF0Y2g6IGogPT09IGlcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICBtYXRjaGVzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgbGluZU51bWJlcjogaSArIDEsXG4gICAgICAgICAgICAgICAgICAgICAgICBtYXRjaGVkTGluZTogbGluZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRleHQ6IGNvbnRleHRMaW5lc0FycmF5XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0Q291bnQrKztcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIC8vIFJlc2V0IHJlZ2V4IGxhc3RJbmRleCBmb3IgZ2xvYmFsIHNlYXJjaFxuICAgICAgICAgICAgICAgICAgICByZWdleC5sYXN0SW5kZXggPSAwO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgcmV0dXJuIG9rKHtcbiAgICAgICAgICAgICAgICAgICAgcGF0dGVybjogcGF0dGVybixcbiAgICAgICAgICAgICAgICAgICAgdG90YWxNYXRjaGVzOiBtYXRjaGVzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgbWF4UmVzdWx0czogbWF4UmVzdWx0cyxcbiAgICAgICAgICAgICAgICAgICAgY29udGV4dExpbmVzOiBjb250ZXh0TGluZXMsXG4gICAgICAgICAgICAgICAgICAgIGxvZ0ZpbGVQYXRoOiBsb2dGaWxlUGF0aCxcbiAgICAgICAgICAgICAgICAgICAgbWF0Y2hlczogbWF0Y2hlc1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChgRmFpbGVkIHRvIHNlYXJjaCBwcm9qZWN0IGxvZ3M6ICR7ZXJyb3IubWVzc2FnZX1gKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgZm9ybWF0RmlsZVNpemUoYnl0ZXM6IG51bWJlcik6IHN0cmluZyB7XG4gICAgICAgIGNvbnN0IHVuaXRzID0gWydCJywgJ0tCJywgJ01CJywgJ0dCJ107XG4gICAgICAgIGxldCBzaXplID0gYnl0ZXM7XG4gICAgICAgIGxldCB1bml0SW5kZXggPSAwO1xuXG4gICAgICAgIHdoaWxlIChzaXplID49IDEwMjQgJiYgdW5pdEluZGV4IDwgdW5pdHMubGVuZ3RoIC0gMSkge1xuICAgICAgICAgICAgc2l6ZSAvPSAxMDI0O1xuICAgICAgICAgICAgdW5pdEluZGV4Kys7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gYCR7c2l6ZS50b0ZpeGVkKDIpfSAke3VuaXRzW3VuaXRJbmRleF19YDtcbiAgICB9XG5cbiAgICBwcml2YXRlIHBpY2tXaW5kb3codGl0bGVTdWJzdHJpbmc/OiBzdHJpbmcpOiBhbnkge1xuICAgICAgICAvLyBMYXp5IHJlcXVpcmUgc28gdGhhdCBub24tRWxlY3Ryb24gY29udGV4dHMgKGUuZy4gdW5pdCB0ZXN0cywgc21va2VcbiAgICAgICAgLy8gc2NyaXB0IHdpdGggc3R1YiByZWdpc3RyeSkgY2FuIHN0aWxsIGltcG9ydCB0aGlzIG1vZHVsZS5cbiAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby12YXItcmVxdWlyZXNcbiAgICAgICAgY29uc3QgZWxlY3Ryb24gPSByZXF1aXJlKCdlbGVjdHJvbicpO1xuICAgICAgICBjb25zdCBCVyA9IGVsZWN0cm9uLkJyb3dzZXJXaW5kb3c7XG4gICAgICAgIGlmICghQlcpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignRWxlY3Ryb24gQnJvd3NlcldpbmRvdyBBUEkgdW5hdmFpbGFibGU7IHNjcmVlbnNob3QgdG9vbCByZXF1aXJlcyBydW5uaW5nIGluc2lkZSBDb2NvcyBlZGl0b3IgaG9zdCBwcm9jZXNzLicpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aXRsZVN1YnN0cmluZykge1xuICAgICAgICAgICAgY29uc3QgbWF0Y2hlcyA9IEJXLmdldEFsbFdpbmRvd3MoKS5maWx0ZXIoKHc6IGFueSkgPT5cbiAgICAgICAgICAgICAgICB3ICYmICF3LmlzRGVzdHJveWVkKCkgJiYgKHcuZ2V0VGl0bGU/LigpIHx8ICcnKS5pbmNsdWRlcyh0aXRsZVN1YnN0cmluZykpO1xuICAgICAgICAgICAgaWYgKG1hdGNoZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBObyBFbGVjdHJvbiB3aW5kb3cgdGl0bGUgbWF0Y2hlZCBzdWJzdHJpbmc6ICR7dGl0bGVTdWJzdHJpbmd9YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gbWF0Y2hlc1swXTtcbiAgICAgICAgfVxuICAgICAgICAvLyB2Mi4zLjEgcmV2aWV3IGZpeDogZm9jdXNlZCB3aW5kb3cgbWF5IGJlIGEgdHJhbnNpZW50IHByZXZpZXcgcG9wdXAuXG4gICAgICAgIC8vIFByZWZlciBhIG5vbi1QcmV2aWV3IHdpbmRvdyBzbyBkZWZhdWx0IHNjcmVlbnNob3RzIHRhcmdldCB0aGUgbWFpblxuICAgICAgICAvLyBlZGl0b3Igc3VyZmFjZS4gQ2FsbGVyIGNhbiBzdGlsbCBwYXNzIHRpdGxlU3Vic3RyaW5nPSdQcmV2aWV3JyB0b1xuICAgICAgICAvLyBleHBsaWNpdGx5IHRhcmdldCB0aGUgcHJldmlldyB3aGVuIHdhbnRlZC5cbiAgICAgICAgY29uc3QgYWxsOiBhbnlbXSA9IEJXLmdldEFsbFdpbmRvd3MoKS5maWx0ZXIoKHc6IGFueSkgPT4gdyAmJiAhdy5pc0Rlc3Ryb3llZCgpKTtcbiAgICAgICAgaWYgKGFsbC5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignTm8gbGl2ZSBFbGVjdHJvbiB3aW5kb3dzOyBjYW5ub3QgY2FwdHVyZSBzY3JlZW5zaG90LicpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGlzUHJldmlldyA9ICh3OiBhbnkpID0+IC9wcmV2aWV3L2kudGVzdCh3LmdldFRpdGxlPy4oKSB8fCAnJyk7XG4gICAgICAgIGNvbnN0IG5vblByZXZpZXcgPSBhbGwuZmlsdGVyKCh3OiBhbnkpID0+ICFpc1ByZXZpZXcodykpO1xuICAgICAgICBjb25zdCBmb2N1c2VkID0gQlcuZ2V0Rm9jdXNlZFdpbmRvdz8uKCk7XG4gICAgICAgIGlmIChmb2N1c2VkICYmICFmb2N1c2VkLmlzRGVzdHJveWVkKCkgJiYgIWlzUHJldmlldyhmb2N1c2VkKSkgcmV0dXJuIGZvY3VzZWQ7XG4gICAgICAgIGlmIChub25QcmV2aWV3Lmxlbmd0aCA+IDApIHJldHVybiBub25QcmV2aWV3WzBdO1xuICAgICAgICByZXR1cm4gYWxsWzBdO1xuICAgIH1cblxuICAgIHByaXZhdGUgZW5zdXJlQ2FwdHVyZURpcigpOiB7IG9rOiB0cnVlOyBkaXI6IHN0cmluZyB9IHwgeyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmcgfSB7XG4gICAgICAgIGlmICghRWRpdG9yLlByb2plY3QgfHwgIUVkaXRvci5Qcm9qZWN0LnBhdGgpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6ICdFZGl0b3IuUHJvamVjdC5wYXRoIGlzIG5vdCBhdmFpbGFibGU7IGNhbm5vdCByZXNvbHZlIGNhcHR1cmUgb3V0cHV0IGRpcmVjdG9yeS4nIH07XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZGlyID0gcGF0aC5qb2luKEVkaXRvci5Qcm9qZWN0LnBhdGgsICd0ZW1wJywgJ21jcC1jYXB0dXJlcycpO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgZnMubWtkaXJTeW5jKGRpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gICAgICAgICAgICByZXR1cm4geyBvazogdHJ1ZSwgZGlyIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBgRmFpbGVkIHRvIGNyZWF0ZSBjYXB0dXJlIGRpcjogJHtlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycil9YCB9O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gdjIuOC4wIFQtVjI4LTIgKGNhcnJ5b3ZlciBmcm9tIHYyLjcuMCBDb2RleCBzaW5nbGUtcmV2aWV3ZXIg8J+foSlcbiAgICAvLyDihpIgdjIuOC4xIHJvdW5kLTEgZml4IChDb2RleCDwn5S0ICsgQ2xhdWRlIPCfn6EpOiB0aGUgdjIuOC4wIGhlbHBlclxuICAgIC8vIHJlYWxwYXRoJ2QgYGRpcmAgYW5kIGBwYXRoLmRpcm5hbWUocGF0aC5qb2luKGRpciwgYmFzZW5hbWUpKWAgYW5kXG4gICAgLy8gY29tcGFyZWQgdGhlIHR3byDigJQgYnV0IHdpdGggYSBmaXhlZCBiYXNlbmFtZSB0aG9zZSBleHByZXNzaW9ucyBib3RoXG4gICAgLy8gY29sbGFwc2UgdG8gYGRpcmAsIG1ha2luZyB0aGUgZXF1YWxpdHkgY2hlY2sgdGF1dG9sb2dpY2FsLiBUaGUgY2hlY2tcbiAgICAvLyBwcm90ZWN0ZWQgbm90aGluZyBpZiBgPHByb2plY3Q+L3RlbXAvbWNwLWNhcHR1cmVzYCBpdHNlbGYgd2FzIGFcbiAgICAvLyBzeW1saW5rIHRoYXQgZXNjYXBlcyB0aGUgcHJvamVjdCB0cmVlLlxuICAgIC8vXG4gICAgLy8gVHJ1ZSBlc2NhcGUgcHJvdGVjdGlvbiByZXF1aXJlcyBhbmNob3JpbmcgYWdhaW5zdCB0aGUgcHJvamVjdCByb290LlxuICAgIC8vIFdlIG5vdyByZWFscGF0aCBCT1RIIHRoZSBjYXB0dXJlIGRpciBhbmQgYEVkaXRvci5Qcm9qZWN0LnBhdGhgIGFuZFxuICAgIC8vIHJlcXVpcmUgdGhlIHJlc29sdmVkIGNhcHR1cmUgZGlyIHRvIGJlIGluc2lkZSB0aGUgcmVzb2x2ZWQgcHJvamVjdFxuICAgIC8vIHJvb3QgKGVxdWFsaXR5IE9SIGByZWFsRGlyLnN0YXJ0c1dpdGgocmVhbFByb2plY3RSb290ICsgc2VwKWApLlxuICAgIC8vIFRoZSBpbnRyYS1kaXIgY2hlY2sgaXMga2VwdCBmb3IgY2hlYXAgZGVmZW5zZS1pbi1kZXB0aCBpbiBjYXNlIGFcbiAgICAvLyBmdXR1cmUgYmFzZW5hbWUgZ2V0cyB0cmF2ZXJzYWwgY2hhcmFjdGVycyB0aHJlYWRlZCB0aHJvdWdoLlxuICAgIC8vXG4gICAgLy8gUmV0dXJucyB7IG9rOiB0cnVlLCBmaWxlUGF0aCwgZGlyIH0gd2hlbiBzYWZlIHRvIHdyaXRlLCBvclxuICAgIC8vIHsgb2s6IGZhbHNlLCBlcnJvciB9IHdpdGggdGhlIHNhbWUgZXJyb3IgZW52ZWxvcGUgc2hhcGUgYXNcbiAgICAvLyBlbnN1cmVDYXB0dXJlRGlyIHNvIGNhbGxlcnMgY2FuIGZhbGwgdGhyb3VnaCB0aGVpciBleGlzdGluZ1xuICAgIC8vIGVycm9yLXJldHVybiBwYXR0ZXJuLlxuICAgIHByaXZhdGUgcmVzb2x2ZUF1dG9DYXB0dXJlRmlsZShiYXNlbmFtZTogc3RyaW5nKTogeyBvazogdHJ1ZTsgZmlsZVBhdGg6IHN0cmluZzsgZGlyOiBzdHJpbmcgfSB8IHsgb2s6IGZhbHNlOyBlcnJvcjogc3RyaW5nIH0ge1xuICAgICAgICBjb25zdCBkaXJSZXN1bHQgPSB0aGlzLmVuc3VyZUNhcHR1cmVEaXIoKTtcbiAgICAgICAgaWYgKCFkaXJSZXN1bHQub2spIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGRpclJlc3VsdC5lcnJvciB9O1xuICAgICAgICBjb25zdCBwcm9qZWN0UGF0aDogc3RyaW5nIHwgdW5kZWZpbmVkID0gRWRpdG9yPy5Qcm9qZWN0Py5wYXRoO1xuICAgICAgICBpZiAoIXByb2plY3RQYXRoKSB7XG4gICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiAnRWRpdG9yLlByb2plY3QucGF0aCBpcyBub3QgYXZhaWxhYmxlOyBjYW5ub3QgYW5jaG9yIGNhcHR1cmUtZGlyIGNvbnRhaW5tZW50IGNoZWNrLicgfTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBmaWxlUGF0aCA9IHBhdGguam9pbihkaXJSZXN1bHQuZGlyLCBiYXNlbmFtZSk7XG4gICAgICAgIGxldCByZWFsRGlyOiBzdHJpbmc7XG4gICAgICAgIGxldCByZWFsUGFyZW50OiBzdHJpbmc7XG4gICAgICAgIGxldCByZWFsUHJvamVjdFJvb3Q6IHN0cmluZztcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJwOiBhbnkgPSBmcy5yZWFscGF0aFN5bmMgYXMgYW55O1xuICAgICAgICAgICAgY29uc3QgcmVzb2x2ZVJlYWwgPSBycC5uYXRpdmUgPz8gcnA7XG4gICAgICAgICAgICByZWFsRGlyID0gcmVzb2x2ZVJlYWwoZGlyUmVzdWx0LmRpcik7XG4gICAgICAgICAgICByZWFsUGFyZW50ID0gcmVzb2x2ZVJlYWwocGF0aC5kaXJuYW1lKGZpbGVQYXRoKSk7XG4gICAgICAgICAgICByZWFsUHJvamVjdFJvb3QgPSByZXNvbHZlUmVhbChwcm9qZWN0UGF0aCk7XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBgc2NyZWVuc2hvdCBwYXRoIHJlYWxwYXRoIGZhaWxlZDogJHtlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycil9YCB9O1xuICAgICAgICB9XG4gICAgICAgIC8vIERlZmVuc2UtaW4tZGVwdGg6IHBhcmVudCBvZiB0aGUgcmVzb2x2ZWQgZmlsZSBtdXN0IGVxdWFsIHRoZVxuICAgICAgICAvLyByZXNvbHZlZCBjYXB0dXJlIGRpciAoY2F0Y2hlcyBmdXR1cmUgYmFzZW5hbWVzIHRocmVhZGluZyBgLi5gKS5cbiAgICAgICAgaWYgKHBhdGgucmVzb2x2ZShyZWFsUGFyZW50KSAhPT0gcGF0aC5yZXNvbHZlKHJlYWxEaXIpKSB7XG4gICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiAnc2NyZWVuc2hvdCBzYXZlIHBhdGggcmVzb2x2ZWQgb3V0c2lkZSB0aGUgY2FwdHVyZSBkaXJlY3RvcnknIH07XG4gICAgICAgIH1cbiAgICAgICAgLy8gUHJpbWFyeSBwcm90ZWN0aW9uOiBjYXB0dXJlIGRpciBpdHNlbGYgbXVzdCByZXNvbHZlIGluc2lkZSB0aGVcbiAgICAgICAgLy8gcHJvamVjdCByb290LCBzbyBhIHN5bWxpbmsgY2hhaW4gb24gYHRlbXAvbWNwLWNhcHR1cmVzYCBjYW5ub3RcbiAgICAgICAgLy8gcGl2b3Qgd3JpdGVzIHRvIGUuZy4gL2V0YyBvciBDOlxcV2luZG93cy5cbiAgICAgICAgLy8gdjIuOS54IHBvbGlzaCAoQ29kZXggcjIgc2luZ2xlLfCfn6EgZnJvbSB2Mi44LjEgcmV2aWV3KTogdXNlXG4gICAgICAgIC8vIHBhdGgucmVsYXRpdmUgaW5zdGVhZCBvZiBgcm9vdCArIHBhdGguc2VwYCBwcmVmaXggY2hlY2sg4oCUXG4gICAgICAgIC8vIHdoZW4gcm9vdCBpcyBhIGRyaXZlIHJvb3QgKGBDOlxcYCksIHBhdGgucmVzb2x2ZSBub3JtYWxpc2VzIGl0XG4gICAgICAgIC8vIHRvIGBDOlxcXFxgIGFuZCBgcGF0aC5zZXBgIGFkZHMgYW5vdGhlciBgXFxgLCBwcm9kdWNpbmcgYEM6XFxcXFxcXFxgXG4gICAgICAgIC8vIHdoaWNoIGEgY2FuZGlkYXRlIGxpa2UgYEM6XFxcXGZvb2AgZG9lcyBub3QgbWF0Y2guIHBhdGgucmVsYXRpdmVcbiAgICAgICAgLy8gYWxzbyBoYW5kbGVzIHRoZSBDOlxcZm9vIHZzIEM6XFxmb29iYXIgcHJlZml4LWNvbGxpc2lvbiBjYXNlLlxuICAgICAgICBpZiAoIWlzUGF0aFdpdGhpblJvb3QocmVhbERpciwgcmVhbFByb2plY3RSb290KSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogYGNhcHR1cmUgZGlyIHJlc29sdmVkIG91dHNpZGUgdGhlIHByb2plY3Qgcm9vdDogJHtwYXRoLnJlc29sdmUocmVhbERpcil9IG5vdCB3aXRoaW4gJHtwYXRoLnJlc29sdmUocmVhbFByb2plY3RSb290KX1gIH07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUsIGZpbGVQYXRoLCBkaXI6IGRpclJlc3VsdC5kaXIgfTtcbiAgICB9XG5cbiAgICAvLyB2Mi44LjEgcm91bmQtMSBmaXggKEdlbWluaSDwn5S0ICsgQ29kZXgg8J+foSk6IHdoZW4gY2FsbGVyIHBhc3NlcyBhblxuICAgIC8vIGV4cGxpY2l0IHNhdmVQYXRoIC8gc2F2ZVBhdGhQcmVmaXgsIHdlIHN0aWxsIG5lZWQgdGhlIHNhbWUgcHJvamVjdC1cbiAgICAvLyByb290IGNvbnRhaW5tZW50IGd1YXJhbnRlZSB0aGF0IHJlc29sdmVBdXRvQ2FwdHVyZUZpbGUgZ2l2ZXMgdGhlXG4gICAgLy8gYXV0by1uYW1lZCBicmFuY2guIEFJLWdlbmVyYXRlZCBhYnNvbHV0ZSBwYXRocyBjb3VsZCBvdGhlcndpc2VcbiAgICAvLyB3cml0ZSBvdXRzaWRlIHRoZSBwcm9qZWN0IHJvb3QuXG4gICAgLy9cbiAgICAvLyBUaGUgY2hlY2sgcmVzb2x2ZXMgdGhlIHBhcmVudCBkaXJlY3RvcnkgKHRoZSBmaWxlIGl0c2VsZiBtYXkgbm90XG4gICAgLy8gZXhpc3QgeWV0KSBhbmQgcmVxdWlyZXMgaXQgdG8gYmUgaW5zaWRlIGByZWFscGF0aChFZGl0b3IuUHJvamVjdC5wYXRoKWAuXG4gICAgcHJpdmF0ZSBhc3NlcnRTYXZlUGF0aFdpdGhpblByb2plY3Qoc2F2ZVBhdGg6IHN0cmluZyk6IHsgb2s6IHRydWU7IHJlc29sdmVkUGF0aDogc3RyaW5nIH0gfCB7IG9rOiBmYWxzZTsgZXJyb3I6IHN0cmluZyB9IHtcbiAgICAgICAgY29uc3QgcHJvamVjdFBhdGg6IHN0cmluZyB8IHVuZGVmaW5lZCA9IEVkaXRvcj8uUHJvamVjdD8ucGF0aDtcbiAgICAgICAgaWYgKCFwcm9qZWN0UGF0aCkge1xuICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogJ0VkaXRvci5Qcm9qZWN0LnBhdGggaXMgbm90IGF2YWlsYWJsZTsgY2Fubm90IHZhbGlkYXRlIGV4cGxpY2l0IHNhdmVQYXRoLicgfTtcbiAgICAgICAgfVxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcnA6IGFueSA9IGZzLnJlYWxwYXRoU3luYyBhcyBhbnk7XG4gICAgICAgICAgICBjb25zdCByZXNvbHZlUmVhbCA9IHJwLm5hdGl2ZSA/PyBycDtcbiAgICAgICAgICAgIGNvbnN0IHJlYWxQcm9qZWN0Um9vdCA9IHJlc29sdmVSZWFsKHByb2plY3RQYXRoKTtcbiAgICAgICAgICAgIC8vIHYyLjguMiByZXRlc3QgZml4IChDb2RleCByMiDwn5+hICMxKTogYSByZWxhdGl2ZSBzYXZlUGF0aCB3b3VsZFxuICAgICAgICAgICAgLy8gbWFrZSBgcGF0aC5kaXJuYW1lKHNhdmVQYXRoKWAgY29sbGFwc2UgdG8gJy4nIGFuZCByZXNvbHZlIHRvXG4gICAgICAgICAgICAvLyB0aGUgaG9zdCBwcm9jZXNzIGN3ZCAob2Z0ZW4gYDxlZGl0b3ItaW5zdGFsbD4vQ29jb3NEYXNoYm9hcmRgKVxuICAgICAgICAgICAgLy8gcmF0aGVyIHRoYW4gdGhlIHByb2plY3Qgcm9vdC4gQW5jaG9yIHJlbGF0aXZlIHBhdGhzIGFnYWluc3RcbiAgICAgICAgICAgIC8vIHRoZSBwcm9qZWN0IHJvb3QgZXhwbGljaXRseSBzbyB0aGUgQUkncyBpbnR1aXRpdmUgXCJyZWxhdGl2ZVxuICAgICAgICAgICAgLy8gdG8gbXkgcHJvamVjdFwiIGludGVycHJldGF0aW9uIGlzIHdoYXQgdGhlIGNoZWNrIGVuZm9yY2VzLlxuICAgICAgICAgICAgY29uc3QgYWJzb2x1dGVTYXZlUGF0aCA9IHBhdGguaXNBYnNvbHV0ZShzYXZlUGF0aClcbiAgICAgICAgICAgICAgICA/IHNhdmVQYXRoXG4gICAgICAgICAgICAgICAgOiBwYXRoLnJlc29sdmUocHJvamVjdFBhdGgsIHNhdmVQYXRoKTtcbiAgICAgICAgICAgIGNvbnN0IHBhcmVudCA9IHBhdGguZGlybmFtZShhYnNvbHV0ZVNhdmVQYXRoKTtcbiAgICAgICAgICAgIC8vIFBhcmVudCBtdXN0IGFscmVhZHkgZXhpc3QgZm9yIHJlYWxwYXRoOyBpZiBpdCBkb2Vzbid0LCB0aGVcbiAgICAgICAgICAgIC8vIHdyaXRlIHdvdWxkIGZhaWwgYW55d2F5LCBidXQgcmV0dXJuIGEgY2xlYXJlciBlcnJvciBoZXJlLlxuICAgICAgICAgICAgbGV0IHJlYWxQYXJlbnQ6IHN0cmluZztcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgcmVhbFBhcmVudCA9IHJlc29sdmVSZWFsKHBhcmVudCk7XG4gICAgICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGBzYXZlUGF0aCBwYXJlbnQgZGlyIG1pc3Npbmcgb3IgdW5yZWFkYWJsZTogJHtlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycil9YCB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gdjIuOS54IHBvbGlzaCAoQ29kZXggcjIgc2luZ2xlLfCfn6EgZnJvbSB2Mi44LjEgcmV2aWV3KTogc2FtZVxuICAgICAgICAgICAgLy8gcGF0aC5yZWxhdGl2ZS1iYXNlZCBjb250YWlubWVudCBhcyByZXNvbHZlQXV0b0NhcHR1cmVGaWxlLlxuICAgICAgICAgICAgaWYgKCFpc1BhdGhXaXRoaW5Sb290KHJlYWxQYXJlbnQsIHJlYWxQcm9qZWN0Um9vdCkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICBvazogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIGVycm9yOiBgc2F2ZVBhdGggcmVzb2x2ZWQgb3V0c2lkZSB0aGUgcHJvamVjdCByb290OiAke3BhdGgucmVzb2x2ZShyZWFsUGFyZW50KX0gbm90IHdpdGhpbiAke3BhdGgucmVzb2x2ZShyZWFsUHJvamVjdFJvb3QpfS4gVXNlIGEgcGF0aCBpbnNpZGUgPHByb2plY3Q+LyBvciBvbWl0IHNhdmVQYXRoIHRvIGF1dG8tbmFtZSBpbnRvIDxwcm9qZWN0Pi90ZW1wL21jcC1jYXB0dXJlcy5gLFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4geyBvazogdHJ1ZSwgcmVzb2x2ZWRQYXRoOiBhYnNvbHV0ZVNhdmVQYXRoIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBgc2F2ZVBhdGggcmVhbHBhdGggZmFpbGVkOiAke2Vycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKX1gIH07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHNjcmVlbnNob3Qoc2F2ZVBhdGg/OiBzdHJpbmcsIHdpbmRvd1RpdGxlPzogc3RyaW5nLCBpbmNsdWRlQmFzZTY0OiBib29sZWFuID0gZmFsc2UpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgbGV0IGZpbGVQYXRoID0gc2F2ZVBhdGg7XG4gICAgICAgICAgICBpZiAoIWZpbGVQYXRoKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVzb2x2ZWQgPSB0aGlzLnJlc29sdmVBdXRvQ2FwdHVyZUZpbGUoYHNjcmVlbnNob3QtJHtEYXRlLm5vdygpfS5wbmdgKTtcbiAgICAgICAgICAgICAgICBpZiAoIXJlc29sdmVkLm9rKSByZXR1cm4gZmFpbChyZXNvbHZlZC5lcnJvcik7XG4gICAgICAgICAgICAgICAgZmlsZVBhdGggPSByZXNvbHZlZC5maWxlUGF0aDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gdjIuOC4xIHJvdW5kLTEgZml4IChHZW1pbmkg8J+UtCArIENvZGV4IPCfn6EpOiBleHBsaWNpdCBzYXZlUGF0aFxuICAgICAgICAgICAgICAgIC8vIGFsc28gZ2V0cyBjb250YWlubWVudC1jaGVja2VkLiBBSS1nZW5lcmF0ZWQgcGF0aHMgY291bGRcbiAgICAgICAgICAgICAgICAvLyBvdGhlcndpc2Ugd3JpdGUgb3V0c2lkZSB0aGUgcHJvamVjdCByb290LlxuICAgICAgICAgICAgICAgIC8vIHYyLjguMiByZXRlc3QgZml4OiB1c2UgdGhlIGhlbHBlcidzIHJlc29sdmVkUGF0aCBzbyBhXG4gICAgICAgICAgICAgICAgLy8gcmVsYXRpdmUgc2F2ZVBhdGggYWN0dWFsbHkgbGFuZHMgaW5zaWRlIHRoZSBwcm9qZWN0IHJvb3QuXG4gICAgICAgICAgICAgICAgY29uc3QgZ3VhcmQgPSB0aGlzLmFzc2VydFNhdmVQYXRoV2l0aGluUHJvamVjdChmaWxlUGF0aCk7XG4gICAgICAgICAgICAgICAgaWYgKCFndWFyZC5vaykgcmV0dXJuIGZhaWwoZ3VhcmQuZXJyb3IpO1xuICAgICAgICAgICAgICAgIGZpbGVQYXRoID0gZ3VhcmQucmVzb2x2ZWRQYXRoO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3Qgd2luID0gdGhpcy5waWNrV2luZG93KHdpbmRvd1RpdGxlKTtcbiAgICAgICAgICAgIGNvbnN0IGltYWdlID0gYXdhaXQgd2luLndlYkNvbnRlbnRzLmNhcHR1cmVQYWdlKCk7XG4gICAgICAgICAgICBjb25zdCBwbmc6IEJ1ZmZlciA9IGltYWdlLnRvUE5HKCk7XG4gICAgICAgICAgICBmcy53cml0ZUZpbGVTeW5jKGZpbGVQYXRoLCBwbmcpO1xuICAgICAgICAgICAgY29uc3QgZGF0YTogYW55ID0ge1xuICAgICAgICAgICAgICAgIGZpbGVQYXRoLFxuICAgICAgICAgICAgICAgIHNpemU6IHBuZy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgd2luZG93VGl0bGU6IHR5cGVvZiB3aW4uZ2V0VGl0bGUgPT09ICdmdW5jdGlvbicgPyB3aW4uZ2V0VGl0bGUoKSA6ICcnLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGlmIChpbmNsdWRlQmFzZTY0KSB7XG4gICAgICAgICAgICAgICAgZGF0YS5kYXRhVXJpID0gYGRhdGE6aW1hZ2UvcG5nO2Jhc2U2NCwke3BuZy50b1N0cmluZygnYmFzZTY0Jyl9YDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBvayhkYXRhLCBgU2NyZWVuc2hvdCBzYXZlZCB0byAke2ZpbGVQYXRofWApO1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIHYyLjcuMCAjNDogUHJldmlldy13aW5kb3cgc2NyZWVuc2hvdC5cbiAgICAvLyB2Mi44LjMgVC1WMjgzLTE6IGV4dGVuZGVkIHRvIGhhbmRsZSBjb2NvcyBlbWJlZGRlZCBwcmV2aWV3IG1vZGUuXG4gICAgLy9cbiAgICAvLyBNb2RlIGRpc3BhdGNoOlxuICAgIC8vICAgLSBcIndpbmRvd1wiOiAgIHJlcXVpcmUgYSBQcmV2aWV3LXRpdGxlZCBCcm93c2VyV2luZG93OyBmYWlsIGlmIG5vbmUuXG4gICAgLy8gICAgICAgICAgICAgICAgIE9yaWdpbmFsIHYyLjcuMCBiZWhhdmlvdXIuIFVzZSB3aGVuIGNvY29zIHByZXZpZXdcbiAgICAvLyAgICAgICAgICAgICAgICAgY29uZmlnIGlzIFwid2luZG93XCIgLyBcInNpbXVsYXRvclwiIChzZXBhcmF0ZSB3aW5kb3cpLlxuICAgIC8vICAgLSBcImVtYmVkZGVkXCI6IHNraXAgdGhlIHdpbmRvdyBwcm9iZSBhbmQgY2FwdHVyZSB0aGUgbWFpbiBlZGl0b3JcbiAgICAvLyAgICAgICAgICAgICAgICAgQnJvd3NlcldpbmRvdyBkaXJlY3RseS4gVXNlIHdoZW4gY29jb3MgcHJldmlldyBjb25maWdcbiAgICAvLyAgICAgICAgICAgICAgICAgaXMgXCJlbWJlZGRlZFwiIChnYW1ldmlldyByZW5kZXJzIGluc2lkZSBtYWluIGVkaXRvcikuXG4gICAgLy8gICAtIFwiYXV0b1wiOiAgICAgdHJ5IFwid2luZG93XCIgZmlyc3Q7IGlmIG5vIFByZXZpZXctdGl0bGVkIHdpbmRvdyBpc1xuICAgIC8vICAgICAgICAgICAgICAgICBmb3VuZCwgZmFsbCBiYWNrIHRvIFwiZW1iZWRkZWRcIiBhbmQgc3VyZmFjZSBhIGhpbnRcbiAgICAvLyAgICAgICAgICAgICAgICAgaW4gdGhlIHJlc3BvbnNlIG1lc3NhZ2UuIERlZmF1bHQg4oCUIGtlZXBzIHRoZSBoYXBweVxuICAgIC8vICAgICAgICAgICAgICAgICBwYXRoIHdvcmtpbmcgd2l0aG91dCBjYWxsZXIga25vd2xlZGdlIG9mIGNvY29zXG4gICAgLy8gICAgICAgICAgICAgICAgIHByZXZpZXcgY29uZmlnLlxuICAgIC8vXG4gICAgLy8gQnJvd3Nlci1tb2RlIChQSUUgcmVuZGVyZWQgdG8gdXNlcidzIGV4dGVybmFsIGJyb3dzZXIgdmlhXG4gICAgLy8gc2hlbGwub3BlbkV4dGVybmFsKSBpcyBOT1QgY2FwdHVyYWJsZSBoZXJlIOKAlCB0aGUgcGFnZSBsaXZlcyBpblxuICAgIC8vIGEgbm9uLUVsZWN0cm9uIGJyb3dzZXIgcHJvY2Vzcy4gQUkgY2FuIGRldGVjdCB0aGlzIHZpYVxuICAgIC8vIGRlYnVnX2dldF9wcmV2aWV3X21vZGUgYW5kIHNraXAgdGhlIGNhbGwuXG4gICAgcHJpdmF0ZSBhc3luYyBjYXB0dXJlUHJldmlld1NjcmVlbnNob3QoXG4gICAgICAgIHNhdmVQYXRoPzogc3RyaW5nLFxuICAgICAgICBtb2RlOiAnYXV0bycgfCAnd2luZG93JyB8ICdlbWJlZGRlZCcgPSAnYXV0bycsXG4gICAgICAgIHdpbmRvd1RpdGxlOiBzdHJpbmcgPSAnUHJldmlldycsXG4gICAgICAgIGluY2x1ZGVCYXNlNjQ6IGJvb2xlYW4gPSBmYWxzZSxcbiAgICApOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby12YXItcmVxdWlyZXNcbiAgICAgICAgICAgIGNvbnN0IGVsZWN0cm9uID0gcmVxdWlyZSgnZWxlY3Ryb24nKTtcbiAgICAgICAgICAgIGNvbnN0IEJXID0gZWxlY3Ryb24uQnJvd3NlcldpbmRvdztcblxuICAgICAgICAgICAgLy8gUmVzb2x2ZSB0aGUgdGFyZ2V0IHdpbmRvdyBwZXIgbW9kZS5cbiAgICAgICAgICAgIGNvbnN0IHByb2JlV2luZG93TW9kZSA9ICgpOiB7IG9rOiB0cnVlOyB3aW46IGFueSB9IHwgeyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmc7IHZpc2libGVUaXRsZXM6IHN0cmluZ1tdIH0gPT4ge1xuICAgICAgICAgICAgICAgIC8vIHYyLjcuMSByZXZpZXcgZml4IChjbGF1ZGUg8J+foSArIGNvZGV4IPCfn6EpOiB3aXRoIHRoZSBkZWZhdWx0XG4gICAgICAgICAgICAgICAgLy8gd2luZG93VGl0bGU9J1ByZXZpZXcnIGEgQ2hpbmVzZSAvIGxvY2FsaXplZCBjb2NvcyBlZGl0b3JcbiAgICAgICAgICAgICAgICAvLyB3aG9zZSBtYWluIHdpbmRvdyB0aXRsZSBjb250YWlucyBcIlByZXZpZXdcIiAoZS5nLiBcIkNvY29zXG4gICAgICAgICAgICAgICAgLy8gQ3JlYXRvciBQcmV2aWV3IC0gPFByb2plY3ROYW1lPlwiKSB3b3VsZCBmYWxzZWx5IG1hdGNoLlxuICAgICAgICAgICAgICAgIC8vIERpc2FtYmlndWF0ZSBieSBleGNsdWRpbmcgYW55IHRpdGxlIHRoYXQgQUxTTyBjb250YWluc1xuICAgICAgICAgICAgICAgIC8vIFwiQ29jb3MgQ3JlYXRvclwiIHdoZW4gdGhlIGNhbGxlciBzdHVjayB3aXRoIHRoZSBkZWZhdWx0LlxuICAgICAgICAgICAgICAgIGNvbnN0IHVzaW5nRGVmYXVsdCA9IHdpbmRvd1RpdGxlID09PSAnUHJldmlldyc7XG4gICAgICAgICAgICAgICAgY29uc3QgYWxsVGl0bGVzOiBzdHJpbmdbXSA9IEJXPy5nZXRBbGxXaW5kb3dzPy4oKT8ubWFwKCh3OiBhbnkpID0+IHcuZ2V0VGl0bGU/LigpID8/ICcnKS5maWx0ZXIoQm9vbGVhbikgPz8gW107XG4gICAgICAgICAgICAgICAgY29uc3QgbWF0Y2hlcyA9IEJXPy5nZXRBbGxXaW5kb3dzPy4oKT8uZmlsdGVyKCh3OiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCF3IHx8IHcuaXNEZXN0cm95ZWQoKSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB0aXRsZSA9IHcuZ2V0VGl0bGU/LigpIHx8ICcnO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXRpdGxlLmluY2x1ZGVzKHdpbmRvd1RpdGxlKSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICBpZiAodXNpbmdEZWZhdWx0ICYmIC9Db2Nvc1xccypDcmVhdG9yL2kudGVzdCh0aXRsZSkpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgfSkgPz8gW107XG4gICAgICAgICAgICAgICAgaWYgKG1hdGNoZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGBObyBFbGVjdHJvbiB3aW5kb3cgdGl0bGUgY29udGFpbnMgXCIke3dpbmRvd1RpdGxlfVwiJHt1c2luZ0RlZmF1bHQgPyAnIChhbmQgaXMgbm90IHRoZSBtYWluIGVkaXRvciknIDogJyd9LmAsIHZpc2libGVUaXRsZXM6IGFsbFRpdGxlcyB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4geyBvazogdHJ1ZSwgd2luOiBtYXRjaGVzWzBdIH07XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBjb25zdCBwcm9iZUVtYmVkZGVkTW9kZSA9ICgpOiB7IG9rOiB0cnVlOyB3aW46IGFueSB9IHwgeyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmcgfSA9PiB7XG4gICAgICAgICAgICAgICAgLy8gRW1iZWRkZWQgUElFIHJlbmRlcnMgaW5zaWRlIHRoZSBtYWluIGVkaXRvciBCcm93c2VyV2luZG93LlxuICAgICAgICAgICAgICAgIC8vIFBpY2sgdGhlIHNhbWUgaGV1cmlzdGljIGFzIHBpY2tXaW5kb3coKTogcHJlZmVyIGEgbm9uLVxuICAgICAgICAgICAgICAgIC8vIFByZXZpZXcgd2luZG93LiBDb2NvcyBtYWluIGVkaXRvcidzIHRpdGxlIHR5cGljYWxseVxuICAgICAgICAgICAgICAgIC8vIGNvbnRhaW5zIFwiQ29jb3MgQ3JlYXRvclwiIOKAlCBtYXRjaCB0aGF0IHRvIGlkZW50aWZ5IGl0LlxuICAgICAgICAgICAgICAgIGNvbnN0IGFsbDogYW55W10gPSBCVz8uZ2V0QWxsV2luZG93cz8uKCk/LmZpbHRlcigodzogYW55KSA9PiB3ICYmICF3LmlzRGVzdHJveWVkKCkpID8/IFtdO1xuICAgICAgICAgICAgICAgIGlmIChhbGwubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6ICdObyBsaXZlIEVsZWN0cm9uIHdpbmRvd3MgYXZhaWxhYmxlOyBjYW5ub3QgY2FwdHVyZSBlbWJlZGRlZCBwcmV2aWV3LicgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgLy8gUHJlZmVyIHRoZSBlZGl0b3IgbWFpbiB3aW5kb3cgKHRpdGxlIGNvbnRhaW5zIFwiQ29jb3NcbiAgICAgICAgICAgICAgICAvLyBDcmVhdG9yXCIpIOKAlCB0aGF0J3Mgd2hlcmUgZW1iZWRkZWQgUElFIHJlbmRlcnMuXG4gICAgICAgICAgICAgICAgY29uc3QgZWRpdG9yID0gYWxsLmZpbmQoKHc6IGFueSkgPT4gL0NvY29zXFxzKkNyZWF0b3IvaS50ZXN0KHcuZ2V0VGl0bGU/LigpIHx8ICcnKSk7XG4gICAgICAgICAgICAgICAgaWYgKGVkaXRvcikgcmV0dXJuIHsgb2s6IHRydWUsIHdpbjogZWRpdG9yIH07XG4gICAgICAgICAgICAgICAgLy8gRmFsbGJhY2s6IGFueSBub24tRGV2VG9vbHMgLyBub24tV29ya2VyIC8gbm9uLUJsYW5rIHdpbmRvdy5cbiAgICAgICAgICAgICAgICBjb25zdCBjYW5kaWRhdGUgPSBhbGwuZmluZCgodzogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHQgPSB3LmdldFRpdGxlPy4oKSB8fCAnJztcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHQgJiYgIS9EZXZUb29sc3xXb3JrZXIgLXxeQmxhbmskLy50ZXN0KHQpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGlmIChjYW5kaWRhdGUpIHJldHVybiB7IG9rOiB0cnVlLCB3aW46IGNhbmRpZGF0ZSB9O1xuICAgICAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6ICdObyBzdWl0YWJsZSBlZGl0b3Igd2luZG93IGZvdW5kIGZvciBlbWJlZGRlZCBwcmV2aWV3IGNhcHR1cmUuJyB9O1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgbGV0IHdpbjogYW55ID0gbnVsbDtcbiAgICAgICAgICAgIGxldCBjYXB0dXJlTm90ZTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgICAgICAgICBsZXQgcmVzb2x2ZWRNb2RlOiAnd2luZG93JyB8ICdlbWJlZGRlZCcgPSAnd2luZG93JztcblxuICAgICAgICAgICAgaWYgKG1vZGUgPT09ICd3aW5kb3cnKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgciA9IHByb2JlV2luZG93TW9kZSgpO1xuICAgICAgICAgICAgICAgIGlmICghci5vaykge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFpbChgJHtyLmVycm9yfSBMYXVuY2ggY29jb3MgcHJldmlldyBmaXJzdCB2aWEgdGhlIHRvb2xiYXIgcGxheSBidXR0b24gb3IgdmlhIGRlYnVnX3ByZXZpZXdfdXJsKGFjdGlvbj1cIm9wZW5cIikuIElmIHlvdXIgY29jb3MgcHJldmlldyBpcyBzZXQgdG8gXCJlbWJlZGRlZFwiLCBjYWxsIHRoaXMgdG9vbCB3aXRoIG1vZGU9XCJlbWJlZGRlZFwiIG9yIG1vZGU9XCJhdXRvXCIuIFZpc2libGUgd2luZG93IHRpdGxlczogJHtyLnZpc2libGVUaXRsZXMuam9pbignLCAnKSB8fCAnKG5vbmUpJ31gKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgd2luID0gci53aW47XG4gICAgICAgICAgICAgICAgcmVzb2x2ZWRNb2RlID0gJ3dpbmRvdyc7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKG1vZGUgPT09ICdlbWJlZGRlZCcpIHtcbiAgICAgICAgICAgICAgICBjb25zdCByID0gcHJvYmVFbWJlZGRlZE1vZGUoKTtcbiAgICAgICAgICAgICAgICBpZiAoIXIub2spIHJldHVybiBmYWlsKHIuZXJyb3IpO1xuICAgICAgICAgICAgICAgIHdpbiA9IHIud2luO1xuICAgICAgICAgICAgICAgIHJlc29sdmVkTW9kZSA9ICdlbWJlZGRlZCc7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIGF1dG9cbiAgICAgICAgICAgICAgICBjb25zdCB3ciA9IHByb2JlV2luZG93TW9kZSgpO1xuICAgICAgICAgICAgICAgIGlmICh3ci5vaykge1xuICAgICAgICAgICAgICAgICAgICB3aW4gPSB3ci53aW47XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmVkTW9kZSA9ICd3aW5kb3cnO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGVyID0gcHJvYmVFbWJlZGRlZE1vZGUoKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFlci5vaykge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoYCR7d3IuZXJyb3J9ICR7ZXIuZXJyb3J9IExhdW5jaCBjb2NvcyBwcmV2aWV3IGZpcnN0IG9yIGNoZWNrIGRlYnVnX2dldF9wcmV2aWV3X21vZGUgdG8gc2VlIGhvdyBjb2NvcyBpcyBjb25maWd1cmVkLiBWaXNpYmxlIHdpbmRvdyB0aXRsZXM6ICR7d3IudmlzaWJsZVRpdGxlcy5qb2luKCcsICcpIHx8ICcobm9uZSknfWApO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHdpbiA9IGVyLndpbjtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZWRNb2RlID0gJ2VtYmVkZGVkJztcbiAgICAgICAgICAgICAgICAgICAgLy8gdjIuOC40IHJldGVzdCBmaW5kaW5nOiB3aGVuIGNvY29zIHByZXZpZXcgaXMgc2V0XG4gICAgICAgICAgICAgICAgICAgIC8vIHRvIFwiYnJvd3NlclwiLCBhdXRvLWZhbGxiYWNrIEFMU08gZ3JhYnMgdGhlIG1haW5cbiAgICAgICAgICAgICAgICAgICAgLy8gZWRpdG9yIHdpbmRvdyAoYmVjYXVzZSBubyBQcmV2aWV3LXRpdGxlZCB3aW5kb3dcbiAgICAgICAgICAgICAgICAgICAgLy8gZXhpc3RzKSDigJQgYnV0IGluIGJyb3dzZXIgbW9kZSB0aGUgYWN0dWFsIGdhbWV2aWV3XG4gICAgICAgICAgICAgICAgICAgIC8vIGxpdmVzIGluIHRoZSB1c2VyJ3MgZXh0ZXJuYWwgYnJvd3NlciwgTk9UIGluIHRoZVxuICAgICAgICAgICAgICAgICAgICAvLyBjYXB0dXJlZCBFbGVjdHJvbiB3aW5kb3cuIERvbid0IGNsYWltIFwiZW1iZWRkZWRcbiAgICAgICAgICAgICAgICAgICAgLy8gcHJldmlldyBtb2RlXCIg4oCUIHRoYXQncyBhIGd1ZXNzLCBhbmQgd3Jvbmcgd2hlblxuICAgICAgICAgICAgICAgICAgICAvLyB1c2VyIGlzIG9uIGJyb3dzZXIgY29uZmlnLiBQcm9iZSB0aGUgcmVhbCBjb25maWdcbiAgICAgICAgICAgICAgICAgICAgLy8gYW5kIHRhaWxvciB0aGUgaGludCBwZXIgbW9kZS5cbiAgICAgICAgICAgICAgICAgICAgbGV0IGFjdHVhbE1vZGU6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY2ZnOiBhbnkgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICdwcmVmZXJlbmNlcycsICdxdWVyeS1jb25maWcnIGFzIGFueSwgJ3ByZXZpZXcnIGFzIGFueSxcbiAgICAgICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBwbGF0Zm9ybSA9IGNmZz8ucHJldmlldz8uY3VycmVudD8ucGxhdGZvcm07XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHBsYXRmb3JtID09PSAnc3RyaW5nJykgYWN0dWFsTW9kZSA9IHBsYXRmb3JtO1xuICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGJlc3QtZWZmb3J0OyBmYWxsIHRocm91Z2ggd2l0aCBuZXV0cmFsIGhpbnRcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZiAoYWN0dWFsTW9kZSA9PT0gJ2Jyb3dzZXInKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXB0dXJlTm90ZSA9ICdObyBQcmV2aWV3LXRpdGxlZCB3aW5kb3cgZm91bmQ7IGNhcHR1cmVkIHRoZSBtYWluIGVkaXRvciB3aW5kb3cuIE5PVEU6IGNvY29zIHByZXZpZXcgaXMgc2V0IHRvIFwiYnJvd3NlclwiIOKAlCB0aGUgYWN0dWFsIHByZXZpZXcgY29udGVudCBpcyByZW5kZXJlZCBpbiB5b3VyIGV4dGVybmFsIGJyb3dzZXIgKE5PVCBpbiB0aGlzIGltYWdlKS4gRm9yIHJ1bnRpbWUgY2FudmFzIGNhcHR1cmUgaW4gYnJvd3NlciBtb2RlIHVzZSBkZWJ1Z19nYW1lX2NvbW1hbmQodHlwZT1cInNjcmVlbnNob3RcIikgdmlhIGEgR2FtZURlYnVnQ2xpZW50IHJ1bm5pbmcgb24gdGhlIGJyb3dzZXIgcHJldmlldyBwYWdlLic7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoYWN0dWFsTW9kZSA9PT0gJ2dhbWVWaWV3Jykge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FwdHVyZU5vdGUgPSAnTm8gUHJldmlldy10aXRsZWQgd2luZG93IGZvdW5kOyBjYXB0dXJlZCB0aGUgbWFpbiBlZGl0b3Igd2luZG93IChjb2NvcyBwcmV2aWV3IGlzIHNldCB0byBcImdhbWVWaWV3XCIgZW1iZWRkZWQg4oCUIHRoZSBlZGl0b3IgZ2FtZXZpZXcgSVMgd2hlcmUgcHJldmlldyByZW5kZXJzLCBzbyB0aGlzIGltYWdlIGlzIGNvcnJlY3QpLic7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoYWN0dWFsTW9kZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FwdHVyZU5vdGUgPSBgTm8gUHJldmlldy10aXRsZWQgd2luZG93IGZvdW5kOyBjYXB0dXJlZCB0aGUgbWFpbiBlZGl0b3Igd2luZG93LiBjb2NvcyBwcmV2aWV3IGlzIHNldCB0byBcIiR7YWN0dWFsTW9kZX1cIiDigJQgdmVyaWZ5IHRoaXMgaW1hZ2UgYWN0dWFsbHkgY29udGFpbnMgdGhlIGdhbWV2aWV3IHlvdSB3YW50ZWQ7IGZvciBydW50aW1lIGNhbnZhcyBjYXB0dXJlIHByZWZlciBkZWJ1Z19nYW1lX2NvbW1hbmQgdmlhIEdhbWVEZWJ1Z0NsaWVudC5gO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FwdHVyZU5vdGUgPSAnTm8gUHJldmlldy10aXRsZWQgd2luZG93IGZvdW5kOyBjYXB0dXJlZCB0aGUgbWFpbiBlZGl0b3Igd2luZG93LiBDb3VsZCBub3QgZGV0ZXJtaW5lIGNvY29zIHByZXZpZXcgbW9kZSAoZGVidWdfZ2V0X3ByZXZpZXdfbW9kZSBtaWdodCBnaXZlIG1vcmUgaW5mbykuIElmIHlvdXIgY29jb3MgcHJldmlldyBpcyBzZXQgdG8gXCJicm93c2VyXCIsIHRoZSBhY3R1YWwgcHJldmlldyBjb250ZW50IGlzIGluIHlvdXIgZXh0ZXJuYWwgYnJvd3NlciBhbmQgaXMgTk9UIGluIHRoaXMgaW1hZ2UuJztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgbGV0IGZpbGVQYXRoID0gc2F2ZVBhdGg7XG4gICAgICAgICAgICBpZiAoIWZpbGVQYXRoKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVzb2x2ZWQgPSB0aGlzLnJlc29sdmVBdXRvQ2FwdHVyZUZpbGUoYHByZXZpZXctJHtEYXRlLm5vdygpfS5wbmdgKTtcbiAgICAgICAgICAgICAgICBpZiAoIXJlc29sdmVkLm9rKSByZXR1cm4gZmFpbChyZXNvbHZlZC5lcnJvcik7XG4gICAgICAgICAgICAgICAgZmlsZVBhdGggPSByZXNvbHZlZC5maWxlUGF0aDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gdjIuOC4xIHJvdW5kLTEgZml4IChHZW1pbmkg8J+UtCArIENvZGV4IPCfn6EpOiBleHBsaWNpdCBzYXZlUGF0aFxuICAgICAgICAgICAgICAgIC8vIGFsc28gZ2V0cyBjb250YWlubWVudC1jaGVja2VkLlxuICAgICAgICAgICAgICAgIC8vIHYyLjguMiByZXRlc3QgZml4OiB1c2UgcmVzb2x2ZWRQYXRoIGZvciByZWxhdGl2ZS1wYXRoIHN1cHBvcnQuXG4gICAgICAgICAgICAgICAgY29uc3QgZ3VhcmQgPSB0aGlzLmFzc2VydFNhdmVQYXRoV2l0aGluUHJvamVjdChmaWxlUGF0aCk7XG4gICAgICAgICAgICAgICAgaWYgKCFndWFyZC5vaykgcmV0dXJuIGZhaWwoZ3VhcmQuZXJyb3IpO1xuICAgICAgICAgICAgICAgIGZpbGVQYXRoID0gZ3VhcmQucmVzb2x2ZWRQYXRoO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgaW1hZ2UgPSBhd2FpdCB3aW4ud2ViQ29udGVudHMuY2FwdHVyZVBhZ2UoKTtcbiAgICAgICAgICAgIGNvbnN0IHBuZzogQnVmZmVyID0gaW1hZ2UudG9QTkcoKTtcbiAgICAgICAgICAgIGZzLndyaXRlRmlsZVN5bmMoZmlsZVBhdGgsIHBuZyk7XG4gICAgICAgICAgICBjb25zdCBkYXRhOiBhbnkgPSB7XG4gICAgICAgICAgICAgICAgZmlsZVBhdGgsXG4gICAgICAgICAgICAgICAgc2l6ZTogcG5nLmxlbmd0aCxcbiAgICAgICAgICAgICAgICB3aW5kb3dUaXRsZTogdHlwZW9mIHdpbi5nZXRUaXRsZSA9PT0gJ2Z1bmN0aW9uJyA/IHdpbi5nZXRUaXRsZSgpIDogJycsXG4gICAgICAgICAgICAgICAgbW9kZTogcmVzb2x2ZWRNb2RlLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGlmIChjYXB0dXJlTm90ZSkgZGF0YS5ub3RlID0gY2FwdHVyZU5vdGU7XG4gICAgICAgICAgICBpZiAoaW5jbHVkZUJhc2U2NCkge1xuICAgICAgICAgICAgICAgIGRhdGEuZGF0YVVyaSA9IGBkYXRhOmltYWdlL3BuZztiYXNlNjQsJHtwbmcudG9TdHJpbmcoJ2Jhc2U2NCcpfWA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBtZXNzYWdlID0gY2FwdHVyZU5vdGVcbiAgICAgICAgICAgICAgICA/IGBQcmV2aWV3IHNjcmVlbnNob3Qgc2F2ZWQgdG8gJHtmaWxlUGF0aH0gKCR7Y2FwdHVyZU5vdGV9KWBcbiAgICAgICAgICAgICAgICA6IGBQcmV2aWV3IHNjcmVlbnNob3Qgc2F2ZWQgdG8gJHtmaWxlUGF0aH0gKG1vZGU9JHtyZXNvbHZlZE1vZGV9KWA7XG4gICAgICAgICAgICByZXR1cm4gb2soZGF0YSwgbWVzc2FnZSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycikpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gdjIuOC4zIFQtVjI4My0yOiByZWFkIGNvY29zIHByZXZpZXcgY29uZmlnIHNvIEFJIGNhbiByb3V0ZVxuICAgIC8vIGNhcHR1cmVfcHJldmlld19zY3JlZW5zaG90IHRvIHRoZSBjb3JyZWN0IG1vZGUgd2l0aG91dCBndWVzc2luZy5cbiAgICAvLyBSZWFkcyB2aWEgRWRpdG9yLk1lc3NhZ2UgcHJlZmVyZW5jZXMvcXVlcnktY29uZmlnICh0eXBlZCBpblxuICAgIC8vIG5vZGVfbW9kdWxlcy9AY29jb3MvY3JlYXRvci10eXBlcy8uLi4vcHJlZmVyZW5jZXMvQHR5cGVzL21lc3NhZ2UuZC50cykuXG4gICAgLy9cbiAgICAvLyBXZSBkdW1wIHRoZSBmdWxsICdwcmV2aWV3JyBjYXRlZ29yeSwgdGhlbiB0cnkgdG8gaW50ZXJwcmV0IGEgZmV3XG4gICAgLy8gY29tbW9uIGtleXMgKCdvcGVuX3ByZXZpZXdfd2l0aCcsICdwcmV2aWV3X3dpdGgnLCAnc2ltdWxhdG9yJyxcbiAgICAvLyAnYnJvd3NlcicpIGludG8gYSBub3JtYWxpemVkIG1vZGUgbGFiZWwuIElmIGludGVycHJldGF0aW9uIGZhaWxzLFxuICAgIC8vIHdlIHN0aWxsIHJldHVybiB0aGUgcmF3IGNvbmZpZyBzbyB0aGUgQUkgY2FuIHJlYWQgaXQgZGlyZWN0bHkuXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRQcmV2aWV3TW9kZSgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gUHJvYmUgYXQgbW9kdWxlIGxldmVsIChubyBrZXkpIHRvIGdldCB0aGUgd2hvbGUgY2F0ZWdvcnkuXG4gICAgICAgICAgICBjb25zdCByYXc6IGFueSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3ByZWZlcmVuY2VzJywgJ3F1ZXJ5LWNvbmZpZycgYXMgYW55LCAncHJldmlldycgYXMgYW55KSBhcyBhbnk7XG4gICAgICAgICAgICBpZiAocmF3ID09PSB1bmRlZmluZWQgfHwgcmF3ID09PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ3ByZWZlcmVuY2VzL3F1ZXJ5LWNvbmZpZyByZXR1cm5lZCBudWxsIGZvciBcInByZXZpZXdcIiDigJQgY29jb3MgbWF5IG5vdCBleHBvc2UgdGhpcyBjYXRlZ29yeSwgb3IgeW91ciBidWlsZCBkaWZmZXJzIGZyb20gMy44LnguJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBIZXVyaXN0aWMgaW50ZXJwcmV0YXRpb24uXG4gICAgICAgICAgICAvLyB2Mi44LjMgcmV0ZXN0IGZpbmRpbmc6IGNvY29zIDMuOC43IGFjdHVhbGx5IHN0b3JlcyB0aGVcbiAgICAgICAgICAgIC8vIGFjdGl2ZSBtb2RlIGF0IGBwcmV2aWV3LmN1cnJlbnQucGxhdGZvcm1gIHdpdGggdmFsdWVcbiAgICAgICAgICAgIC8vIGBcImdhbWVWaWV3XCJgIChlbWJlZGRlZCksIGBcImJyb3dzZXJcImAsIG9yIGRldmljZSBuYW1lc1xuICAgICAgICAgICAgLy8gKHNpbXVsYXRvcikuIFRoZSBvcmlnaW5hbCBoZXVyaXN0aWMgb25seSBjaGVja2VkIGtleXMgbGlrZVxuICAgICAgICAgICAgLy8gYG9wZW5fcHJldmlld193aXRoYCAvIGBwcmV2aWV3X3dpdGhgIC8gYG9wZW5fd2l0aGAgLyBgbW9kZWBcbiAgICAgICAgICAgIC8vIGFuZCBtaXNzZWQgdGhlIGxpdmUga2V5LiBQcm9iZSBgY3VycmVudC5wbGF0Zm9ybWAgZmlyc3Q7XG4gICAgICAgICAgICAvLyBrZWVwIHRoZSBsZWdhY3kga2V5cyBhcyBmYWxsYmFjayBmb3Igb2xkZXIgY29jb3MgdmVyc2lvbnMuXG4gICAgICAgICAgICBjb25zdCBsb3dlciA9IChzOiBhbnkpID0+ICh0eXBlb2YgcyA9PT0gJ3N0cmluZycgPyBzLnRvTG93ZXJDYXNlKCkgOiAnJyk7XG4gICAgICAgICAgICBsZXQgaW50ZXJwcmV0ZWQ6ICdicm93c2VyJyB8ICd3aW5kb3cnIHwgJ3NpbXVsYXRvcicgfCAnZW1iZWRkZWQnIHwgJ3Vua25vd24nID0gJ3Vua25vd24nO1xuICAgICAgICAgICAgbGV0IGludGVycHJldGVkRnJvbUtleTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgICAgICAgICBjb25zdCBjbGFzc2lmeSA9ICh2OiBzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBsdiA9IGxvd2VyKHYpO1xuICAgICAgICAgICAgICAgIGlmIChsdi5pbmNsdWRlcygnYnJvd3NlcicpKSByZXR1cm4gJ2Jyb3dzZXInO1xuICAgICAgICAgICAgICAgIGlmIChsdi5pbmNsdWRlcygnc2ltdWxhdG9yJykpIHJldHVybiAnc2ltdWxhdG9yJztcbiAgICAgICAgICAgICAgICBpZiAobHYuaW5jbHVkZXMoJ2VtYmVkJykgfHwgbHYuaW5jbHVkZXMoJ2dhbWV2aWV3JykgfHwgbHYuaW5jbHVkZXMoJ2dhbWVfdmlldycpKSByZXR1cm4gJ2VtYmVkZGVkJztcbiAgICAgICAgICAgICAgICBpZiAobHYuaW5jbHVkZXMoJ3dpbmRvdycpKSByZXR1cm4gJ3dpbmRvdyc7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgY29uc3QgZGlnID0gKG9iajogYW55LCBwYXRoOiBzdHJpbmcpOiBhbnkgPT4ge1xuICAgICAgICAgICAgICAgIGlmICghb2JqIHx8IHR5cGVvZiBvYmogIT09ICdvYmplY3QnKSByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIGNvbnN0IHBhcnRzID0gcGF0aC5zcGxpdCgnLicpO1xuICAgICAgICAgICAgICAgIGxldCBjdXI6IGFueSA9IG9iajtcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IHAgb2YgcGFydHMpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFjdXIgfHwgdHlwZW9mIGN1ciAhPT0gJ29iamVjdCcpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgICAgIGlmIChwIGluIGN1cikge1xuICAgICAgICAgICAgICAgICAgICAgICAgY3VyID0gY3VyW3BdO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgLy8gVHJ5IG9uZSBsZXZlbCBvZiBuZXN0IChzb21ldGltZXMgdGhlIGNhdGVnb3J5IGR1bXBcbiAgICAgICAgICAgICAgICAgICAgLy8gbmVzdHMgdW5kZXIgYSBkZWZhdWx0LXByb3RvY29sIGJ1Y2tldCkuXG4gICAgICAgICAgICAgICAgICAgIGxldCBmb3VuZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IHYgb2YgT2JqZWN0LnZhbHVlcyhjdXIpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodiAmJiB0eXBlb2YgdiA9PT0gJ29iamVjdCcgJiYgcCBpbiAodiBhcyBhbnkpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY3VyID0gKHYgYXMgYW55KVtwXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb3VuZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYgKCFmb3VuZCkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIGN1cjtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBjb25zdCBwcm9iZUtleXMgPSBbXG4gICAgICAgICAgICAgICAgJ3ByZXZpZXcuY3VycmVudC5wbGF0Zm9ybScsXG4gICAgICAgICAgICAgICAgJ2N1cnJlbnQucGxhdGZvcm0nLFxuICAgICAgICAgICAgICAgICdwcmV2aWV3Lm9wZW5fcHJldmlld193aXRoJyxcbiAgICAgICAgICAgICAgICAnb3Blbl9wcmV2aWV3X3dpdGgnLFxuICAgICAgICAgICAgICAgICdwcmV2aWV3X3dpdGgnLFxuICAgICAgICAgICAgICAgICdvcGVuX3dpdGgnLFxuICAgICAgICAgICAgICAgICdtb2RlJyxcbiAgICAgICAgICAgIF07XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGsgb2YgcHJvYmVLZXlzKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdiA9IGRpZyhyYXcsIGspO1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgdiA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY2xzID0gY2xhc3NpZnkodik7XG4gICAgICAgICAgICAgICAgICAgIGlmIChjbHMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGludGVycHJldGVkID0gY2xzO1xuICAgICAgICAgICAgICAgICAgICAgICAgaW50ZXJwcmV0ZWRGcm9tS2V5ID0gYCR7a309JHt2fWA7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAvLyBOb24tZW1wdHkgc3RyaW5nIHRoYXQgZGlkbid0IG1hdGNoIGEga25vd24gbGFiZWwg4oaSXG4gICAgICAgICAgICAgICAgICAgIC8vIHJlY29yZCBhcyAnc2ltdWxhdG9yJyBjYW5kaWRhdGUgaWYgaXQgbG9va3MgbGlrZSBhXG4gICAgICAgICAgICAgICAgICAgIC8vIGRldmljZSBuYW1lIChlLmcuIFwiQXBwbGUgaVBob25lIDE0IFByb1wiKSwgb3RoZXJ3aXNlXG4gICAgICAgICAgICAgICAgICAgIC8vIGtlZXAgc2VhcmNoaW5nLlxuICAgICAgICAgICAgICAgICAgICBpZiAoL2lQaG9uZXxpUGFkfEhVQVdFSXxYaWFvbWl8U29ueXxBc3VzfE9QUE98SG9ub3J8Tm9raWF8TGVub3ZvfFNhbXN1bmd8R29vZ2xlfFBpeGVsL2kudGVzdCh2KSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaW50ZXJwcmV0ZWQgPSAnc2ltdWxhdG9yJztcbiAgICAgICAgICAgICAgICAgICAgICAgIGludGVycHJldGVkRnJvbUtleSA9IGAke2t9PSR7dn1gO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gb2soeyBpbnRlcnByZXRlZCwgaW50ZXJwcmV0ZWRGcm9tS2V5LCByYXcgfSwgaW50ZXJwcmV0ZWQgPT09ICd1bmtub3duJ1xuICAgICAgICAgICAgICAgICAgICA/ICdSZWFkIGNvY29zIHByZXZpZXcgY29uZmlnIGJ1dCBjb3VsZCBub3QgaW50ZXJwcmV0IGEgbW9kZSBsYWJlbDsgaW5zcGVjdCBkYXRhLnJhdyBhbmQgcGFzcyBtb2RlPSBleHBsaWNpdGx5IHRvIGNhcHR1cmVfcHJldmlld19zY3JlZW5zaG90LidcbiAgICAgICAgICAgICAgICAgICAgOiBgY29jb3MgcHJldmlldyBpcyBjb25maWd1cmVkIGFzIFwiJHtpbnRlcnByZXRlZH1cIiAoZnJvbSBrZXkgXCIke2ludGVycHJldGVkRnJvbUtleX1cIikuIFBhc3MgbW9kZT1cIiR7aW50ZXJwcmV0ZWQgPT09ICdicm93c2VyJyA/ICd3aW5kb3cnIDogaW50ZXJwcmV0ZWR9XCIgdG8gY2FwdHVyZV9wcmV2aWV3X3NjcmVlbnNob3QsIG9yIHJlbHkgb24gbW9kZT1cImF1dG9cIi5gKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGBwcmVmZXJlbmNlcy9xdWVyeS1jb25maWcgJ3ByZXZpZXcnIGZhaWxlZDogJHtlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycil9YCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyB2Mi4xMCBULVYyMTAtMTogaGFyZC1mYWlsIGJ5IGRlZmF1bHQuIFBlciBjcm9zcy1yZXBvIHJlZnJlc2hcbiAgICAvLyAyMDI2LTA1LTAyLCBub25lIG9mIDYgc3VydmV5ZWQgY29jb3MtbWNwIHBlZXJzIHNoaXAgYSB3b3JraW5nXG4gICAgLy8gcHJldmlldy1tb2RlIHNldHRlciDigJQgdGhlIGNvY29zIDMuOC43IHByZXZpZXcgY2F0ZWdvcnkgaXNcbiAgICAvLyBlZmZlY3RpdmVseSByZWFkb25seSB0byB0aGlyZC1wYXJ0eSBleHRlbnNpb25zIChsYW5kbWluZSAjMTcpLlxuICAgIC8vIERlZmF1bHQgYmVoYXZpb3IgaXMgbm93IE5PVF9TVVBQT1JURUQgd2l0aCBhIFVJIHJlZGlyZWN0LlxuICAgIC8vXG4gICAgLy8gVGhlIDQtc3RyYXRlZ3kgcHJvYmUgaXMgcHJlc2VydmVkIGJlaGluZCBgYXR0ZW1wdEFueXdheT10cnVlYFxuICAgIC8vIHNvIGEgZnV0dXJlIGNvY29zIGJ1aWxkIGNhbiBiZSB2YWxpZGF0ZWQgcXVpY2tseTogcmVhZCB0aGVcbiAgICAvLyByZXR1cm5lZCBkYXRhLmF0dGVtcHRzIGxvZyB0byBzZWUgd2hldGhlciBhbnkgc2hhcGUgbm93IHdvcmtzLlxuICAgIC8vIFRoZSBzZXR0ZXIgZG9lcyBOT1QgZnJlZXplIHRoZSBlZGl0b3IgKHNldC1jb25maWcgc2lsZW50bHlcbiAgICAvLyBuby1vcHMsIGNmLiBwcmV2aWV3X2NvbnRyb2wgd2hpY2ggRE9FUyBmcmVlemUg4oCUIGxhbmRtaW5lICMxNikuXG4gICAgLy9cbiAgICAvLyBTdHJhdGVnaWVzIHRyaWVkIGluIG9yZGVyOlxuICAgIC8vICAgMS4gKCdwcmV2aWV3JywgJ2N1cnJlbnQnLCB7IHBsYXRmb3JtOiB2YWx1ZSB9KSAg4oCUIG5lc3RlZCBvYmplY3RcbiAgICAvLyAgIDIuICgncHJldmlldycsICdjdXJyZW50LnBsYXRmb3JtJywgdmFsdWUsICdnbG9iYWwnKSDigJQgZXhwbGljaXQgcHJvdG9jb2xcbiAgICAvLyAgIDMuICgncHJldmlldycsICdjdXJyZW50LnBsYXRmb3JtJywgdmFsdWUsICdsb2NhbCcpICDigJQgZXhwbGljaXQgcHJvdG9jb2xcbiAgICAvLyAgIDQuICgncHJldmlldycsICdjdXJyZW50LnBsYXRmb3JtJywgdmFsdWUpICAgICAgICAgIOKAlCBubyBwcm90b2NvbFxuICAgIHByaXZhdGUgYXN5bmMgc2V0UHJldmlld01vZGUobW9kZTogJ2Jyb3dzZXInIHwgJ2dhbWVWaWV3JyB8ICdzaW11bGF0b3InLCBhdHRlbXB0QW55d2F5OiBib29sZWFuKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHF1ZXJ5Q3VycmVudCA9IGFzeW5jICgpOiBQcm9taXNlPHN0cmluZyB8IG51bGw+ID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBjZmc6IGFueSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3ByZWZlcmVuY2VzJywgJ3F1ZXJ5LWNvbmZpZycgYXMgYW55LCAncHJldmlldycgYXMgYW55KSBhcyBhbnk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNmZz8ucHJldmlldz8uY3VycmVudD8ucGxhdGZvcm0gPz8gbnVsbDtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBjb25zdCBwcmV2aW91c01vZGUgPSBhd2FpdCBxdWVyeUN1cnJlbnQoKTtcbiAgICAgICAgICAgIGlmICghYXR0ZW1wdEFueXdheSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKGBkZWJ1Z19zZXRfcHJldmlld19tb2RlIGlzIE5PVCBTVVBQT1JURUQgb24gY29jb3MgMy44LjcrIChsYW5kbWluZSAjMTcpLiBQcm9ncmFtbWF0aWMgcHJldmlldy1tb2RlIHN3aXRjaGluZyBoYXMgbm8gd29ya2luZyBJUEMgcGF0aDogcHJlZmVyZW5jZXMvc2V0LWNvbmZpZyByZXR1cm5zIHRydXRoeSBidXQgZG9lcyBub3QgcGVyc2lzdCwgYW5kIDYgc3VydmV5ZWQgcmVmZXJlbmNlIHByb2plY3RzIChoYXJhZHkgLyBTcGF5ZG8gLyBSb21hUm9nb3YgLyBjb2Nvcy1jb2RlLW1vZGUgLyBGdW5wbGF5QUkgLyBjb2Nvcy1jbGkpIGFsbCBjb25maXJtIG5vIHdvcmtpbmcgYWx0ZXJuYXRpdmUgZXhpc3RzLiAqKlN3aXRjaCB2aWEgdGhlIGNvY29zIHByZXZpZXcgZHJvcGRvd24gaW4gdGhlIGVkaXRvciB0b29sYmFyIGluc3RlYWQqKiAoY3VycmVudCBtb2RlOiBcIiR7cHJldmlvdXNNb2RlID8/ICd1bmtub3duJ31cIiwgcmVxdWVzdGVkOiBcIiR7bW9kZX1cIikuIFRvIHJlLXByb2JlIHdoZXRoZXIgYSBuZXdlciBjb2NvcyBidWlsZCBub3cgZXhwb3NlcyBhIHdyaXRlIHBhdGgsIHJlLWNhbGwgd2l0aCBhdHRlbXB0QW55d2F5PXRydWUgKGRpYWdub3N0aWMgb25seSDigJQgZG9lcyBOT1QgZnJlZXplIHRoZSBlZGl0b3IpLmAsIHsgcHJldmlvdXNNb2RlLCByZXF1ZXN0ZWRNb2RlOiBtb2RlLCBzdXBwb3J0ZWQ6IGZhbHNlIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHByZXZpb3VzTW9kZSA9PT0gbW9kZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBvayh7IHByZXZpb3VzTW9kZSwgbmV3TW9kZTogbW9kZSwgY29uZmlybWVkOiB0cnVlLCBub09wOiB0cnVlIH0sIGBjb2NvcyBwcmV2aWV3IGFscmVhZHkgc2V0IHRvIFwiJHttb2RlfVwiOyBubyBjaGFuZ2UgYXBwbGllZC5gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHR5cGUgU3RyYXRlZ3kgPSB7IGlkOiBzdHJpbmc7IHBheWxvYWQ6ICgpID0+IFByb21pc2U8YW55PiB9O1xuICAgICAgICAgICAgY29uc3Qgc3RyYXRlZ2llczogU3RyYXRlZ3lbXSA9IFtcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIGlkOiBcInNldC1jb25maWcoJ3ByZXZpZXcnLCdjdXJyZW50Jyx7cGxhdGZvcm06dmFsdWV9KVwiLFxuICAgICAgICAgICAgICAgICAgICBwYXlsb2FkOiAoKSA9PiBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KFxuICAgICAgICAgICAgICAgICAgICAgICAgJ3ByZWZlcmVuY2VzJywgJ3NldC1jb25maWcnIGFzIGFueSxcbiAgICAgICAgICAgICAgICAgICAgICAgICdwcmV2aWV3JyBhcyBhbnksICdjdXJyZW50JyBhcyBhbnksXG4gICAgICAgICAgICAgICAgICAgICAgICB7IHBsYXRmb3JtOiBtb2RlIH0gYXMgYW55LFxuICAgICAgICAgICAgICAgICAgICApLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBpZDogXCJzZXQtY29uZmlnKCdwcmV2aWV3JywnY3VycmVudC5wbGF0Zm9ybScsdmFsdWUsJ2dsb2JhbCcpXCIsXG4gICAgICAgICAgICAgICAgICAgIHBheWxvYWQ6ICgpID0+IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoXG4gICAgICAgICAgICAgICAgICAgICAgICAncHJlZmVyZW5jZXMnLCAnc2V0LWNvbmZpZycgYXMgYW55LFxuICAgICAgICAgICAgICAgICAgICAgICAgJ3ByZXZpZXcnIGFzIGFueSwgJ2N1cnJlbnQucGxhdGZvcm0nIGFzIGFueSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1vZGUgYXMgYW55LCAnZ2xvYmFsJyBhcyBhbnksXG4gICAgICAgICAgICAgICAgICAgICksXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIGlkOiBcInNldC1jb25maWcoJ3ByZXZpZXcnLCdjdXJyZW50LnBsYXRmb3JtJyx2YWx1ZSwnbG9jYWwnKVwiLFxuICAgICAgICAgICAgICAgICAgICBwYXlsb2FkOiAoKSA9PiBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KFxuICAgICAgICAgICAgICAgICAgICAgICAgJ3ByZWZlcmVuY2VzJywgJ3NldC1jb25maWcnIGFzIGFueSxcbiAgICAgICAgICAgICAgICAgICAgICAgICdwcmV2aWV3JyBhcyBhbnksICdjdXJyZW50LnBsYXRmb3JtJyBhcyBhbnksXG4gICAgICAgICAgICAgICAgICAgICAgICBtb2RlIGFzIGFueSwgJ2xvY2FsJyBhcyBhbnksXG4gICAgICAgICAgICAgICAgICAgICksXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIGlkOiBcInNldC1jb25maWcoJ3ByZXZpZXcnLCdjdXJyZW50LnBsYXRmb3JtJyx2YWx1ZSlcIixcbiAgICAgICAgICAgICAgICAgICAgcGF5bG9hZDogKCkgPT4gRWRpdG9yLk1lc3NhZ2UucmVxdWVzdChcbiAgICAgICAgICAgICAgICAgICAgICAgICdwcmVmZXJlbmNlcycsICdzZXQtY29uZmlnJyBhcyBhbnksXG4gICAgICAgICAgICAgICAgICAgICAgICAncHJldmlldycgYXMgYW55LCAnY3VycmVudC5wbGF0Zm9ybScgYXMgYW55LFxuICAgICAgICAgICAgICAgICAgICAgICAgbW9kZSBhcyBhbnksXG4gICAgICAgICAgICAgICAgICAgICksXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIF07XG4gICAgICAgICAgICBjb25zdCBhdHRlbXB0czogQXJyYXk8eyBzdHJhdGVneTogc3RyaW5nOyBzZXRSZXN1bHQ6IGFueTsgb2JzZXJ2ZWRNb2RlOiBzdHJpbmcgfCBudWxsOyBtYXRjaGVkOiBib29sZWFuOyBlcnJvcj86IHN0cmluZyB9PiA9IFtdO1xuICAgICAgICAgICAgbGV0IHdpbm5lcjogdHlwZW9mIGF0dGVtcHRzW251bWJlcl0gfCBudWxsID0gbnVsbDtcbiAgICAgICAgICAgIGZvciAoY29uc3QgcyBvZiBzdHJhdGVnaWVzKSB7XG4gICAgICAgICAgICAgICAgbGV0IHNldFJlc3VsdDogYW55ID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIGxldCBlcnJvcjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIHNldFJlc3VsdCA9IGF3YWl0IHMucGF5bG9hZCgpO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICAgICAgICAgIGVycm9yID0gZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBvYnNlcnZlZE1vZGUgPSBhd2FpdCBxdWVyeUN1cnJlbnQoKTtcbiAgICAgICAgICAgICAgICBjb25zdCBtYXRjaGVkID0gb2JzZXJ2ZWRNb2RlID09PSBtb2RlO1xuICAgICAgICAgICAgICAgIGF0dGVtcHRzLnB1c2goeyBzdHJhdGVneTogcy5pZCwgc2V0UmVzdWx0LCBvYnNlcnZlZE1vZGUsIG1hdGNoZWQsIGVycm9yIH0pO1xuICAgICAgICAgICAgICAgIGlmIChtYXRjaGVkKSB7XG4gICAgICAgICAgICAgICAgICAgIHdpbm5lciA9IGF0dGVtcHRzW2F0dGVtcHRzLmxlbmd0aCAtIDFdO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIXdpbm5lcikge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKGBzZXQtY29uZmlnIHN0cmF0ZWdpZXMgYWxsIGZhaWxlZCB0byBmbGlwIHByZXZpZXcuY3VycmVudC5wbGF0Zm9ybSBmcm9tIFwiJHtwcmV2aW91c01vZGUgPz8gJ3Vua25vd24nfVwiIHRvIFwiJHttb2RlfVwiLiBUcmllZCA0IHNoYXBlczsgY29jb3MgcmV0dXJuZWQgdmFsdWVzIGJ1dCB0aGUgcmVhZC1iYWNrIG5ldmVyIG1hdGNoZWQgdGhlIHJlcXVlc3RlZCBtb2RlLiBUaGUgc2V0LWNvbmZpZyBjaGFubmVsIG1heSBoYXZlIGNoYW5nZWQgaW4gdGhpcyBjb2NvcyBidWlsZDsgc3dpdGNoIHZpYSB0aGUgY29jb3MgcHJldmlldyBkcm9wZG93biBtYW51YWxseSBmb3Igbm93IGFuZCByZXBvcnQgd2hpY2ggc2hhcGUgd29ya3MuYCwgeyBwcmV2aW91c01vZGUsIHJlcXVlc3RlZE1vZGU6IG1vZGUsIGF0dGVtcHRzIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIG9rKHsgcHJldmlvdXNNb2RlLCBuZXdNb2RlOiBtb2RlLCBjb25maXJtZWQ6IHRydWUsIHN0cmF0ZWd5OiB3aW5uZXIuc3RyYXRlZ3ksIGF0dGVtcHRzIH0sIGBjb2NvcyBwcmV2aWV3IHN3aXRjaGVkOiBcIiR7cHJldmlvdXNNb2RlID8/ICd1bmtub3duJ31cIiDihpIgXCIke21vZGV9XCIgdmlhICR7d2lubmVyLnN0cmF0ZWd5fS4gUmVzdG9yZSB2aWEgZGVidWdfc2V0X3ByZXZpZXdfbW9kZShtb2RlPVwiJHtwcmV2aW91c01vZGUgPz8gJ2Jyb3dzZXInfVwiLCBjb25maXJtPXRydWUpIHdoZW4gZG9uZSBpZiBuZWVkZWQuYCk7XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChgcHJlZmVyZW5jZXMvc2V0LWNvbmZpZyAncHJldmlldycgZmFpbGVkOiAke2Vycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKX1gKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgYmF0Y2hTY3JlZW5zaG90KHNhdmVQYXRoUHJlZml4Pzogc3RyaW5nLCBkZWxheXNNczogbnVtYmVyW10gPSBbMF0sIHdpbmRvd1RpdGxlPzogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGxldCBwcmVmaXggPSBzYXZlUGF0aFByZWZpeDtcbiAgICAgICAgICAgIGlmICghcHJlZml4KSB7XG4gICAgICAgICAgICAgICAgLy8gYmFzZW5hbWUgaXMgdGhlIHByZWZpeCBzdGVtOyBwZXItaXRlcmF0aW9uIGZpbGVzIGV4dGVuZCBpdFxuICAgICAgICAgICAgICAgIC8vIHdpdGggYC0ke2l9LnBuZ2AuIENvbnRhaW5tZW50IGNoZWNrIG9uIHRoZSBwcmVmaXggcGF0aCBpc1xuICAgICAgICAgICAgICAgIC8vIHN1ZmZpY2llbnQgYmVjYXVzZSBwYXRoLmpvaW4gcHJlc2VydmVzIGRpcm5hbWUgZm9yIGFueVxuICAgICAgICAgICAgICAgIC8vIHN1ZmZpeCB0aGUgbG9vcCBhcHBlbmRzLlxuICAgICAgICAgICAgICAgIGNvbnN0IHJlc29sdmVkID0gdGhpcy5yZXNvbHZlQXV0b0NhcHR1cmVGaWxlKGBiYXRjaC0ke0RhdGUubm93KCl9YCk7XG4gICAgICAgICAgICAgICAgaWYgKCFyZXNvbHZlZC5vaykgcmV0dXJuIGZhaWwocmVzb2x2ZWQuZXJyb3IpO1xuICAgICAgICAgICAgICAgIHByZWZpeCA9IHJlc29sdmVkLmZpbGVQYXRoO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyB2Mi44LjEgcm91bmQtMSBmaXggKEdlbWluaSDwn5S0ICsgQ29kZXgg8J+foSk6IGV4cGxpY2l0IHByZWZpeFxuICAgICAgICAgICAgICAgIC8vIGFsc28gZ2V0cyBjb250YWlubWVudC1jaGVja2VkLiBXZSBjaGVjayB0aGUgcHJlZml4IHBhdGhcbiAgICAgICAgICAgICAgICAvLyBpdHNlbGYg4oCUIGV2ZXJ5IGVtaXR0ZWQgZmlsZSBsaXZlcyBpbiB0aGUgc2FtZSBkaXJuYW1lLlxuICAgICAgICAgICAgICAgIC8vIHYyLjguMiByZXRlc3QgZml4OiB1c2UgcmVzb2x2ZWRQYXRoIGZvciByZWxhdGl2ZS1wcmVmaXggc3VwcG9ydC5cbiAgICAgICAgICAgICAgICBjb25zdCBndWFyZCA9IHRoaXMuYXNzZXJ0U2F2ZVBhdGhXaXRoaW5Qcm9qZWN0KHByZWZpeCk7XG4gICAgICAgICAgICAgICAgaWYgKCFndWFyZC5vaykgcmV0dXJuIGZhaWwoZ3VhcmQuZXJyb3IpO1xuICAgICAgICAgICAgICAgIHByZWZpeCA9IGd1YXJkLnJlc29sdmVkUGF0aDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHdpbiA9IHRoaXMucGlja1dpbmRvdyh3aW5kb3dUaXRsZSk7XG4gICAgICAgICAgICBjb25zdCBjYXB0dXJlczogYW55W10gPSBbXTtcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZGVsYXlzTXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICBjb25zdCBkZWxheSA9IGRlbGF5c01zW2ldO1xuICAgICAgICAgICAgICAgIGlmIChkZWxheSA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIGRlbGF5KSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IGZpbGVQYXRoID0gYCR7cHJlZml4fS0ke2l9LnBuZ2A7XG4gICAgICAgICAgICAgICAgY29uc3QgaW1hZ2UgPSBhd2FpdCB3aW4ud2ViQ29udGVudHMuY2FwdHVyZVBhZ2UoKTtcbiAgICAgICAgICAgICAgICBjb25zdCBwbmc6IEJ1ZmZlciA9IGltYWdlLnRvUE5HKCk7XG4gICAgICAgICAgICAgICAgZnMud3JpdGVGaWxlU3luYyhmaWxlUGF0aCwgcG5nKTtcbiAgICAgICAgICAgICAgICBjYXB0dXJlcy5wdXNoKHsgaW5kZXg6IGksIGRlbGF5TXM6IGRlbGF5LCBmaWxlUGF0aCwgc2l6ZTogcG5nLmxlbmd0aCB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgICAgIGNvdW50OiBjYXB0dXJlcy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgIHdpbmRvd1RpdGxlOiB0eXBlb2Ygd2luLmdldFRpdGxlID09PSAnZnVuY3Rpb24nID8gd2luLmdldFRpdGxlKCkgOiAnJyxcbiAgICAgICAgICAgICAgICAgICAgY2FwdHVyZXMsXG4gICAgICAgICAgICAgICAgfSwgYENhcHR1cmVkICR7Y2FwdHVyZXMubGVuZ3RofSBzY3JlZW5zaG90c2ApO1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIHYyLjcuMCAjMzogcHJldmlldy11cmwgLyBxdWVyeS1kZXZpY2VzIGhhbmRsZXJzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gICAgcHJpdmF0ZSBhc3luYyBwcmV2aWV3VXJsKGFjdGlvbjogJ3F1ZXJ5JyB8ICdvcGVuJyA9ICdxdWVyeScpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgdXJsOiBzdHJpbmcgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdwcmV2aWV3JywgJ3F1ZXJ5LXByZXZpZXctdXJsJyBhcyBhbnkpIGFzIGFueTtcbiAgICAgICAgICAgIGlmICghdXJsIHx8IHR5cGVvZiB1cmwgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ3ByZXZpZXcvcXVlcnktcHJldmlldy11cmwgcmV0dXJuZWQgZW1wdHkgcmVzdWx0OyBjaGVjayB0aGF0IGNvY29zIHByZXZpZXcgc2VydmVyIGlzIHJ1bm5pbmcnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGRhdGE6IGFueSA9IHsgdXJsIH07XG4gICAgICAgICAgICBpZiAoYWN0aW9uID09PSAnb3BlbicpIHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAvLyBMYXp5IHJlcXVpcmUgc28gc21va2UgLyBub24tRWxlY3Ryb24gY29udGV4dHMgZG9uJ3QgZmF1bHRcbiAgICAgICAgICAgICAgICAgICAgLy8gb24gbWlzc2luZyBlbGVjdHJvbi5cbiAgICAgICAgICAgICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby12YXItcmVxdWlyZXNcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZWxlY3Ryb24gPSByZXF1aXJlKCdlbGVjdHJvbicpO1xuICAgICAgICAgICAgICAgICAgICAvLyB2Mi43LjEgcmV2aWV3IGZpeCAoY29kZXgg8J+foSArIGdlbWluaSDwn5+hKTogb3BlbkV4dGVybmFsXG4gICAgICAgICAgICAgICAgICAgIC8vIHJlc29sdmVzIHdoZW4gdGhlIE9TIGxhdW5jaGVyIGlzIGludm9rZWQsIG5vdCB3aGVuIHRoZVxuICAgICAgICAgICAgICAgICAgICAvLyBwYWdlIHJlbmRlcnMuIFVzZSBcImxhdW5jaFwiIHdvcmRpbmcgdG8gYXZvaWQgdGhlIEFJXG4gICAgICAgICAgICAgICAgICAgIC8vIG1pc3JlYWRpbmcgXCJvcGVuZWRcIiBhcyBhIGNvbmZpcm1lZCBwYWdlLWxvYWQuXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IGVsZWN0cm9uLnNoZWxsLm9wZW5FeHRlcm5hbCh1cmwpO1xuICAgICAgICAgICAgICAgICAgICBkYXRhLmxhdW5jaGVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgICAgICAgICBkYXRhLmxhdW5jaGVkID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIGRhdGEubGF1bmNoRXJyb3IgPSBlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gUmVmbGVjdCBhY3R1YWwgbGF1bmNoIG91dGNvbWUgaW4gdGhlIHRvcC1sZXZlbCBtZXNzYWdlIHNvIEFJXG4gICAgICAgICAgICAvLyBzZWVzIFwibGF1bmNoIGZhaWxlZFwiIGluc3RlYWQgb2YgbWlzbGVhZGluZyBcIk9wZW5lZCAuLi5cIiB3aGVuXG4gICAgICAgICAgICAvLyBvcGVuRXh0ZXJuYWwgdGhyZXcgKGdlbWluaSDwn5+hKS5cbiAgICAgICAgICAgIGNvbnN0IG1lc3NhZ2UgPSBhY3Rpb24gPT09ICdvcGVuJ1xuICAgICAgICAgICAgICAgID8gKGRhdGEubGF1bmNoZWRcbiAgICAgICAgICAgICAgICAgICAgPyBgTGF1bmNoZWQgJHt1cmx9IGluIGRlZmF1bHQgYnJvd3NlciAocGFnZSByZW5kZXIgbm90IGF3YWl0ZWQpYFxuICAgICAgICAgICAgICAgICAgICA6IGBSZXR1cm5lZCBVUkwgJHt1cmx9IGJ1dCBsYXVuY2ggZmFpbGVkOiAke2RhdGEubGF1bmNoRXJyb3J9YClcbiAgICAgICAgICAgICAgICA6IHVybDtcbiAgICAgICAgICAgIHJldHVybiBvayhkYXRhLCBtZXNzYWdlKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyB2Mi44LjAgVC1WMjgtMzogUElFIHBsYXkgLyBzdG9wLiBSb3V0ZXMgdGhyb3VnaCBzY2VuZS1zY3JpcHQgc28gdGhlXG4gICAgLy8gdHlwZWQgY2NlLlNjZW5lRmFjYWRlLmNoYW5nZVByZXZpZXdQbGF5U3RhdGUgaXMgcmVhY2hlZCB2aWEgdGhlXG4gICAgLy8gZG9jdW1lbnRlZCBleGVjdXRlLXNjZW5lLXNjcmlwdCBjaGFubmVsLlxuICAgIC8vXG4gICAgLy8gdjIuOC4zIFQtVjI4My0zIHJldGVzdCBmaW5kaW5nOiBjb2NvcyBzb21ldGltZXMgbG9nc1xuICAgIC8vIFwiRmFpbGVkIHRvIHJlZnJlc2ggdGhlIGN1cnJlbnQgc2NlbmVcIiBpbnNpZGUgY2hhbmdlUHJldmlld1BsYXlTdGF0ZVxuICAgIC8vIGV2ZW4gd2hlbiB0aGUgY2FsbCByZXR1cm5zIHdpdGhvdXQgdGhyb3dpbmcuIE9ic2VydmVkIGluIGNvY29zXG4gICAgLy8gMy44LjcgLyBlbWJlZGRlZCBwcmV2aWV3IG1vZGUuIFRoZSByb290IGNhdXNlIGlzIHVuY2xlYXIgKG1heVxuICAgIC8vIHJlbGF0ZSB0byBjdW11bGF0aXZlIHNjZW5lLWRpcnR5IC8gZW1iZWRkZWQtbW9kZSB0aW1pbmcgL1xuICAgIC8vIGluaXRpYWwtbG9hZCBjb21wbGFpbnQpLCBidXQgdGhlIHZpc2libGUgZWZmZWN0IGlzIHRoYXQgUElFIHN0YXRlXG4gICAgLy8gY2hhbmdlcyBpbmNvbXBsZXRlbHkuIFdlIG5vdyBTQ0FOIHRoZSBjYXB0dXJlZCBzY2VuZS1zY3JpcHQgbG9nc1xuICAgIC8vIGZvciB0aGF0IGVycm9yIHN0cmluZyBhbmQgc3VyZmFjZSBpdCB0byB0aGUgQUkgYXMgYSBzdHJ1Y3R1cmVkXG4gICAgLy8gd2FybmluZyBpbnN0ZWFkIG9mIGxldHRpbmcgaXQgaGlkZSBpbnNpZGUgZGF0YS5jYXB0dXJlZExvZ3MuXG4gICAgLy8gdjIuOS4wIFQtVjI5LTE6IGVkaXRvci1oZWFsdGggcHJvYmUuIERldGVjdHMgc2NlbmUtc2NyaXB0IGZyZWV6ZVxuICAgIC8vIGJ5IHJ1bm5pbmcgdHdvIHByb2JlcyBpbiBwYXJhbGxlbDpcbiAgICAvLyAgIC0gaG9zdCBwcm9iZTogRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnZGV2aWNlJywgJ3F1ZXJ5Jykg4oCUIGdvZXNcbiAgICAvLyAgICAgdG8gdGhlIGVkaXRvciBtYWluIHByb2Nlc3MsIE5PVCB0aGUgc2NlbmUtc2NyaXB0IHJlbmRlcmVyLlxuICAgIC8vICAgICBUaGlzIHN0YXlzIHJlc3BvbnNpdmUgZXZlbiB3aGVuIHNjZW5lIGlzIHdlZGdlZC5cbiAgICAvLyAgIC0gc2NlbmUgcHJvYmU6IGV4ZWN1dGUtc2NlbmUtc2NyaXB0IGludm9jYXRpb24gd2l0aCBhIHRyaXZpYWxcbiAgICAvLyAgICAgYGV2YWxFY2hvYCB0ZXN0ICh1c2VzIGFuIGV4aXN0aW5nIHNhZmUgc2NlbmUgbWV0aG9kLCB3aXRoXG4gICAgLy8gICAgIHdyYXBwaW5nIHRpbWVvdXQpLiBUaW1lcyBvdXQg4oaSIHNjZW5lLXNjcmlwdCBmcm96ZW4uXG4gICAgLy9cbiAgICAvLyBEZXNpZ25lZCBmb3IgdGhlIHBvc3QtcHJldmlld19jb250cm9sKHN0YXJ0KSBmcmVlemUgcGF0dGVybiBpblxuICAgIC8vIGxhbmRtaW5lICMxNjogQUkgY2FsbHMgcHJldmlld19jb250cm9sKHN0YXJ0KSwgdGhlblxuICAgIC8vIGNoZWNrX2VkaXRvcl9oZWFsdGgsIGFuZCBpZiBzY2VuZUFsaXZlPWZhbHNlIHN0b3BzIGlzc3VpbmcgbW9yZVxuICAgIC8vIHNjZW5lIGNhbGxzIGFuZCBzdXJmYWNlcyB0aGUgcmVjb3ZlcnkgaGludCBpbnN0ZWFkIG9mIGhhbmdpbmcuXG4gICAgcHJpdmF0ZSBhc3luYyBjaGVja0VkaXRvckhlYWx0aChzY2VuZVRpbWVvdXRNczogbnVtYmVyID0gMTUwMCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHQwID0gRGF0ZS5ub3coKTtcbiAgICAgICAgLy8gSG9zdCBwcm9iZSDigJQgc2hvdWxkIGFsd2F5cyByZXNvbHZlIGZhc3QuXG4gICAgICAgIGxldCBob3N0QWxpdmUgPSBmYWxzZTtcbiAgICAgICAgbGV0IGhvc3RFcnJvcjogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdkZXZpY2UnLCAncXVlcnknKTtcbiAgICAgICAgICAgIGhvc3RBbGl2ZSA9IHRydWU7XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICBob3N0RXJyb3IgPSBlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycik7XG4gICAgICAgIH1cbiAgICAgICAgLy8gU2NlbmUgcHJvYmUg4oCUIHYyLjkuNSByZXZpZXcgZml4IChHZW1pbmkg8J+UtCArIENvZGV4IPCflLQgKyBDbGF1ZGUg8J+foSk6XG4gICAgICAgIC8vIHYyLjkuMCB1c2VkIGdldEN1cnJlbnRTY2VuZUluZm8gdmlhIGV4ZWN1dGUtc2NlbmUtc2NyaXB0IHdyYXBwZXIsXG4gICAgICAgIC8vIGJ1dCB0aGF0IHNjZW5lLXNpZGUgbWV0aG9kIGp1c3QgcmVhZHMgYGRpcmVjdG9yLmdldFNjZW5lKClgXG4gICAgICAgIC8vIChjYWNoZWQgc2luZ2xldG9uKSBhbmQgcmVzb2x2ZXMgPDFtcyBldmVuIHdoZW4gdGhlIHNjZW5lLXNjcmlwdFxuICAgICAgICAvLyByZW5kZXJlciBpcyB2aXNpYmx5IGZyb3plbiDigJQgY29uZmlybWVkIGxpdmUgZHVyaW5nIHYyLjkuMSByZXRlc3RcbiAgICAgICAgLy8gd2hlcmUgc2NlbmVBbGl2ZSByZXR1cm5lZCB0cnVlIHdoaWxlIHVzZXIgcmVwb3J0ZWQgdGhlIGVkaXRvclxuICAgICAgICAvLyB3YXMgc3Bpbm5pbmcgYW5kIHJlcXVpcmVkIEN0cmwrUi5cbiAgICAgICAgLy9cbiAgICAgICAgLy8gU3dpdGNoIHRvIHR3byBwcm9iZXMgdGhhdCBleGVyY2lzZSBkaWZmZXJlbnQgcGF0aHM6XG4gICAgICAgIC8vICAxLiBgc2NlbmUvcXVlcnktaXMtcmVhZHlgICh0eXBlZCBjaGFubmVsIOKAlCBzZWVcbiAgICAgICAgLy8gICAgIHNjZW5lL0B0eXBlcy9tZXNzYWdlLmQudHM6MjU3KS4gRGlyZWN0IElQQyBpbnRvIHRoZSBzY2VuZVxuICAgICAgICAvLyAgICAgbW9kdWxlOyB3aWxsIGhhbmcgaWYgdGhlIHNjZW5lLXNjcmlwdCByZW5kZXJlciBpcyB3ZWRnZWQuXG4gICAgICAgIC8vICAyLiBgc2NlbmUvZXhlY3V0ZS1zY2VuZS1zY3JpcHRgIHJ1bldpdGhDYXB0dXJlKCdxdWVyeU5vZGVEdW1wJylcbiAgICAgICAgLy8gICAgIG9uIGEga25vd24gVVVJRCBmb3JjaW5nIGFuIGFjdHVhbCBzY2VuZS1ncmFwaCB3YWxrIOKAlCBjb3ZlcnNcbiAgICAgICAgLy8gICAgIHRoZSBjYXNlIHdoZXJlIHNjZW5lIElQQyBpcyBhbGl2ZSBidXQgdGhlIHJ1bldpdGhDYXB0dXJlIC9cbiAgICAgICAgLy8gICAgIGV4ZWN1dGUtc2NlbmUtc2NyaXB0IHBhdGggaXMgdGhlIHdlZGdlZCBvbmUuXG4gICAgICAgIC8vIFdlIGRlY2xhcmUgc2NlbmUgaGVhbHRoeSBvbmx5IHdoZW4gQk9USCBwcm9iZXMgcmVzb2x2ZSB3aXRoaW5cbiAgICAgICAgLy8gdGhlIHRpbWVvdXQuIEVhY2ggcHJvYmUgZ2V0cyBpdHMgb3duIHRpbWVvdXQgcmFjZSBzbyBhIHN0dWNrXG4gICAgICAgIC8vIHNjZW5lLXNjcmlwdCBkb2Vzbid0IGNvbXBvdW5kIGRlbGF5cy5cbiAgICAgICAgY29uc3QgcHJvYmVXaXRoVGltZW91dCA9IGFzeW5jIDxUPihwOiBQcm9taXNlPFQ+LCBsYWJlbDogc3RyaW5nKTogUHJvbWlzZTx7IG9rOiB0cnVlOyB2YWx1ZTogVDsgbGF0ZW5jeU1zOiBudW1iZXIgfSB8IHsgb2s6IGZhbHNlOyBlcnJvcjogc3RyaW5nOyBsYXRlbmN5TXM6IG51bWJlciB9PiA9PiB7XG4gICAgICAgICAgICBjb25zdCBzdGFydCA9IERhdGUubm93KCk7XG4gICAgICAgICAgICBjb25zdCB0aW1lb3V0ID0gbmV3IFByb21pc2U8eyB0aW1lZE91dDogdHJ1ZSB9PihyZXNvbHZlID0+XG4gICAgICAgICAgICAgICAgc2V0VGltZW91dCgoKSA9PiByZXNvbHZlKHsgdGltZWRPdXQ6IHRydWUgfSksIHNjZW5lVGltZW91dE1zKSxcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHI6IGFueSA9IGF3YWl0IFByb21pc2UucmFjZShbcC50aGVuKHYgPT4gKHsgdmFsdWU6IHYsIHRpbWVkT3V0OiBmYWxzZSB9KSksIHRpbWVvdXRdKTtcbiAgICAgICAgICAgICAgICBjb25zdCBsYXRlbmN5TXMgPSBEYXRlLm5vdygpIC0gc3RhcnQ7XG4gICAgICAgICAgICAgICAgaWYgKHI/LnRpbWVkT3V0KSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBgJHtsYWJlbH0gcHJvYmUgdGltZWQgb3V0IGFmdGVyICR7c2NlbmVUaW1lb3V0TXN9bXNgLCBsYXRlbmN5TXMgfTtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBvazogdHJ1ZSwgdmFsdWU6IHIudmFsdWUsIGxhdGVuY3lNcyB9O1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBgJHtsYWJlbH0gcHJvYmUgdGhyZXc6ICR7ZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpfWAsIGxhdGVuY3lNczogRGF0ZS5ub3coKSAtIHN0YXJ0IH07XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIGNvbnN0IGlzUmVhZHlQID0gcHJvYmVXaXRoVGltZW91dChcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LWlzLXJlYWR5JyBhcyBhbnkpIGFzIFByb21pc2U8Ym9vbGVhbj4sXG4gICAgICAgICAgICAnc2NlbmUvcXVlcnktaXMtcmVhZHknLFxuICAgICAgICApO1xuICAgICAgICAvLyB2Mi45LjYgcm91bmQtMiBmaXggKENvZGV4IPCflLQgKyBDbGF1ZGUg8J+foSk6IHYyLjkuNSB1c2VkXG4gICAgICAgIC8vIGBzY2VuZS9xdWVyeS1jdXJyZW50LXNjZW5lYCBjaGFpbmVkIGludG8gYHF1ZXJ5LW5vZGVgIOKAlFxuICAgICAgICAvLyBgcXVlcnktY3VycmVudC1zY2VuZWAgaXMgTk9UIGluIHNjZW5lL0B0eXBlcy9tZXNzYWdlLmQudHNcbiAgICAgICAgLy8gKG9ubHkgYHF1ZXJ5LWlzLXJlYWR5YCBhbmQgYHF1ZXJ5LW5vZGUtdHJlZWAvZXRjLiBhcmUgdHlwZWQpLlxuICAgICAgICAvLyBBbiB1bmtub3duIGNoYW5uZWwgbWF5IHJlc29sdmUgZmFzdCB3aXRoIGdhcmJhZ2Ugb24gc29tZSBjb2Nvc1xuICAgICAgICAvLyBidWlsZHMsIGxlYWRpbmcgdG8gZmFsc2UtaGVhbHRoeSByZXBvcnRzLlxuICAgICAgICAvL1xuICAgICAgICAvLyBTd2l0Y2ggdG8gYHNjZW5lL3F1ZXJ5LW5vZGUtdHJlZWAgKHR5cGVkOiBzY2VuZS9AdHlwZXMvXG4gICAgICAgIC8vIG1lc3NhZ2UuZC50czoyNzMpIHdpdGggbm8gYXJnIOKAlCByZXR1cm5zIHRoZSBmdWxsIElOb2RlW10gdHJlZS5cbiAgICAgICAgLy8gVGhpcyBmb3JjZXMgYSByZWFsIGdyYXBoIHdhbGsgdGhyb3VnaCB0aGUgc2NlbmUtc2NyaXB0IHJlbmRlcmVyXG4gICAgICAgIC8vIGFuZCBpcyB0aGUgcmlnaHQgc3RyZW5ndGggb2YgcHJvYmUgZm9yIGxpdmVuZXNzIGRldGVjdGlvbi5cbiAgICAgICAgY29uc3QgZHVtcFAgPSBwcm9iZVdpdGhUaW1lb3V0KFxuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktbm9kZS10cmVlJyBhcyBhbnkpIGFzIFByb21pc2U8YW55PixcbiAgICAgICAgICAgICdzY2VuZS9xdWVyeS1ub2RlLXRyZWUnLFxuICAgICAgICApO1xuICAgICAgICBjb25zdCBbaXNSZWFkeSwgZHVtcF0gPSBhd2FpdCBQcm9taXNlLmFsbChbaXNSZWFkeVAsIGR1bXBQXSk7XG4gICAgICAgIGNvbnN0IHNjZW5lTGF0ZW5jeU1zID0gTWF0aC5tYXgoaXNSZWFkeS5sYXRlbmN5TXMsIGR1bXAubGF0ZW5jeU1zKTtcbiAgICAgICAgLy8gdjIuOS42IHJvdW5kLTIgZml4IChDb2RleCDwn5S0IHNpbmdsZSDigJQgbnVsbCBVVUlEIGZhbHNlLWhlYWx0aHkpOlxuICAgICAgICAvLyByZXF1aXJlIEJPVEggcHJvYmVzIHRvIHJlc29sdmUgQU5EIHF1ZXJ5LWlzLXJlYWR5ID09PSB0cnVlIEFORFxuICAgICAgICAvLyBxdWVyeS1ub2RlLXRyZWUgdG8gcmV0dXJuIG5vbi1udWxsLlxuICAgICAgICAvLyB2Mi45Ljcgcm91bmQtMyBmaXggKENvZGV4IHIzIPCfn6EgKyBDbGF1ZGUgcjMg8J+foSBpbmZvcm1hdGlvbmFsKTpcbiAgICAgICAgLy8gdGlnaHRlbiBmdXJ0aGVyIOKAlCBhIHJldHVybmVkIGVtcHR5IGFycmF5IGBbXWAgaXMgbnVsbC1zYWZlIGJ1dFxuICAgICAgICAvLyBzZW1hbnRpY2FsbHkgbWVhbnMgXCJubyBzY2VuZSBsb2FkZWRcIiwgd2hpY2ggaXMgTk9UIGFsaXZlIGluIHRoZVxuICAgICAgICAvLyBzZW5zZSB0aGUgQUkgY2FyZXMgYWJvdXQgKGEgZnJvemVuIHJlbmRlcmVyIG1pZ2h0IGFsc28gcHJvZHVjZVxuICAgICAgICAvLyB6ZXJvLXRyZWUgcmVzcG9uc2VzIG9uIHNvbWUgYnVpbGRzKS4gUmVxdWlyZSBub24tZW1wdHkgYXJyYXkuXG4gICAgICAgIGNvbnN0IGR1bXBWYWxpZCA9IGR1bXAub2tcbiAgICAgICAgICAgICYmIGR1bXAudmFsdWUgIT09IG51bGxcbiAgICAgICAgICAgICYmIGR1bXAudmFsdWUgIT09IHVuZGVmaW5lZFxuICAgICAgICAgICAgJiYgKCFBcnJheS5pc0FycmF5KGR1bXAudmFsdWUpIHx8IGR1bXAudmFsdWUubGVuZ3RoID4gMCk7XG4gICAgICAgIGNvbnN0IHNjZW5lQWxpdmUgPSBpc1JlYWR5Lm9rICYmIGR1bXBWYWxpZCAmJiBpc1JlYWR5LnZhbHVlID09PSB0cnVlO1xuICAgICAgICBsZXQgc2NlbmVFcnJvcjogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgICAgIGlmICghaXNSZWFkeS5vaykgc2NlbmVFcnJvciA9IGlzUmVhZHkuZXJyb3I7XG4gICAgICAgIGVsc2UgaWYgKCFkdW1wLm9rKSBzY2VuZUVycm9yID0gZHVtcC5lcnJvcjtcbiAgICAgICAgZWxzZSBpZiAoIWR1bXBWYWxpZCkgc2NlbmVFcnJvciA9IGBzY2VuZS9xdWVyeS1ub2RlLXRyZWUgcmV0dXJuZWQgJHtBcnJheS5pc0FycmF5KGR1bXAudmFsdWUpICYmIGR1bXAudmFsdWUubGVuZ3RoID09PSAwID8gJ2FuIGVtcHR5IGFycmF5IChubyBzY2VuZSBsb2FkZWQgb3Igc2NlbmUtc2NyaXB0IGluIGRlZ3JhZGVkIHN0YXRlKScgOiBKU09OLnN0cmluZ2lmeShkdW1wLnZhbHVlKX0gKGV4cGVjdGVkIG5vbi1lbXB0eSBJTm9kZVtdKWA7XG4gICAgICAgIGVsc2UgaWYgKGlzUmVhZHkudmFsdWUgIT09IHRydWUpIHNjZW5lRXJyb3IgPSBgc2NlbmUvcXVlcnktaXMtcmVhZHkgcmV0dXJuZWQgJHtKU09OLnN0cmluZ2lmeShpc1JlYWR5LnZhbHVlKX0gKGV4cGVjdGVkIHRydWUpYDtcbiAgICAgICAgY29uc3Qgc3VnZ2VzdGlvbiA9ICFob3N0QWxpdmVcbiAgICAgICAgICAgID8gJ2NvY29zIGVkaXRvciBob3N0IHByb2Nlc3MgdW5yZXNwb25zaXZlIOKAlCB2ZXJpZnkgdGhlIGVkaXRvciBpcyBydW5uaW5nIGFuZCB0aGUgY29jb3MtbWNwLXNlcnZlciBleHRlbnNpb24gaXMgbG9hZGVkLidcbiAgICAgICAgICAgIDogIXNjZW5lQWxpdmVcbiAgICAgICAgICAgICAgICA/ICdjb2NvcyBlZGl0b3Igc2NlbmUtc2NyaXB0IGlzIGZyb3plbiAobGlrZWx5IGxhbmRtaW5lICMxNiBhZnRlciBwcmV2aWV3X2NvbnRyb2woc3RhcnQpKS4gUHJlc3MgQ3RybCtSIGluIHRoZSBjb2NvcyBlZGl0b3IgdG8gcmVsb2FkIHRoZSBzY2VuZS1zY3JpcHQgcmVuZGVyZXI7IGRvIG5vdCBpc3N1ZSBtb3JlIHNjZW5lLyogdG9vbCBjYWxscyB1bnRpbCByZWNvdmVyZWQuJ1xuICAgICAgICAgICAgICAgIDogJ2VkaXRvciBoZWFsdGh5OyBzY2VuZS1zY3JpcHQgYW5kIGhvc3QgYm90aCByZXNwb25zaXZlLic7XG4gICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgaG9zdEFsaXZlLFxuICAgICAgICAgICAgICAgIHNjZW5lQWxpdmUsXG4gICAgICAgICAgICAgICAgc2NlbmVMYXRlbmN5TXMsXG4gICAgICAgICAgICAgICAgc2NlbmVUaW1lb3V0TXMsXG4gICAgICAgICAgICAgICAgaG9zdEVycm9yLFxuICAgICAgICAgICAgICAgIHNjZW5lRXJyb3IsXG4gICAgICAgICAgICAgICAgdG90YWxQcm9iZU1zOiBEYXRlLm5vdygpIC0gdDAsXG4gICAgICAgICAgICB9LCBzdWdnZXN0aW9uKTtcbiAgICB9XG5cbiAgICAvLyB2Mi45LnggcG9saXNoIChDb2RleCByMSBzaW5nbGUt8J+foSBmcm9tIHYyLjguMSByZXZpZXcpOiBtb2R1bGUtbGV2ZWxcbiAgICAvLyBpbi1mbGlnaHQgZ3VhcmQgcHJldmVudHMgQUkgd29ya2Zsb3dzIGZyb20gZmlyaW5nIHR3byBQSUUgc3RhdGVcbiAgICAvLyBjaGFuZ2VzIGNvbmN1cnJlbnRseS4gVGhlIGNvY29zIGVuZ2luZSByYWNlIGluIGxhbmRtaW5lICMxNiBtYWtlc1xuICAgIC8vIGRvdWJsZS1maXJlIHBhcnRpY3VsYXJseSBkYW5nZXJvdXMg4oCUIHRoZSBzZWNvbmQgY2FsbCB3b3VsZCBoaXRcbiAgICAvLyBhIHBhcnRpYWxseS1pbml0aWFsaXNlZCBQcmV2aWV3U2NlbmVGYWNhZGUuIFJlamVjdCBvdmVybGFwLlxuICAgIHByaXZhdGUgc3RhdGljIHByZXZpZXdDb250cm9sSW5GbGlnaHQgPSBmYWxzZTtcblxuICAgIHByaXZhdGUgYXN5bmMgcHJldmlld0NvbnRyb2wob3A6ICdzdGFydCcgfCAnc3RvcCcsIGFja25vd2xlZGdlRnJlZXplUmlzazogYm9vbGVhbiA9IGZhbHNlKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgLy8gdjIuOS54IHBhcmsgZ2F0ZTogb3A9XCJzdGFydFwiIGlzIGtub3duIHRvIGZyZWV6ZSBjb2NvcyAzLjguN1xuICAgICAgICAvLyAobGFuZG1pbmUgIzE2KS4gUmVmdXNlIHVubGVzcyB0aGUgY2FsbGVyIGhhcyBleHBsaWNpdGx5XG4gICAgICAgIC8vIGFja25vd2xlZGdlZCB0aGUgcmlzay4gb3A9XCJzdG9wXCIgaXMgYWx3YXlzIHNhZmUg4oCUIGJ5cGFzcyB0aGVcbiAgICAgICAgLy8gZ2F0ZSBzbyBjYWxsZXJzIGNhbiByZWNvdmVyIGZyb20gYSBoYWxmLWFwcGxpZWQgc3RhdGUuXG4gICAgICAgIGlmIChvcCA9PT0gJ3N0YXJ0JyAmJiAhYWNrbm93bGVkZ2VGcmVlemVSaXNrKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbCgnZGVidWdfcHJldmlld19jb250cm9sKG9wPVwic3RhcnRcIikgaXMgcGFya2VkIGR1ZSB0byBsYW5kbWluZSAjMTYg4oCUIHRoZSBjb2NvcyAzLjguNyBzb2Z0UmVsb2FkU2NlbmUgcmFjZSBmcmVlemVzIHRoZSBlZGl0b3IgcmVnYXJkbGVzcyBvZiBwcmV2aWV3IG1vZGUgKHZlcmlmaWVkIGVtYmVkZGVkICsgYnJvd3NlcikuIHYyLjEwIGNyb3NzLXJlcG8gcmVmcmVzaCBjb25maXJtZWQgbm8gcmVmZXJlbmNlIHByb2plY3Qgc2hpcHMgYSBzYWZlciBwYXRoIOKAlCBoYXJhZHkgYW5kIGNvY29zLWNvZGUtbW9kZSB1c2UgdGhlIHNhbWUgY2hhbm5lbCBmYW1pbHkgYW5kIGhpdCB0aGUgc2FtZSByYWNlLiAqKlN0cm9uZ2x5IHByZWZlcnJlZCBhbHRlcm5hdGl2ZXMqKiAocGxlYXNlIHVzZSB0aGVzZSBpbnN0ZWFkKTogKGEpIGRlYnVnX2NhcHR1cmVfcHJldmlld19zY3JlZW5zaG90KG1vZGU9XCJlbWJlZGRlZFwiKSBpbiBFRElUIG1vZGUgKG5vIFBJRSBuZWVkZWQpOyAoYikgZGVidWdfZ2FtZV9jb21tYW5kKHR5cGU9XCJzY3JlZW5zaG90XCIpIHZpYSBHYW1lRGVidWdDbGllbnQgb24gYnJvd3NlciBwcmV2aWV3IGxhdW5jaGVkIHZpYSBkZWJ1Z19wcmV2aWV3X3VybChhY3Rpb249XCJvcGVuXCIpLiBPbmx5IHJlLWNhbGwgd2l0aCBhY2tub3dsZWRnZUZyZWV6ZVJpc2s9dHJ1ZSBpZiBuZWl0aGVyIGFsdGVybmF0aXZlIGZpdHMgQU5EIHRoZSBodW1hbiB1c2VyIGlzIHByZXBhcmVkIHRvIHByZXNzIEN0cmwrUiBpbiBjb2NvcyBpZiB0aGUgZWRpdG9yIGZyZWV6ZXMuJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKERlYnVnVG9vbHMucHJldmlld0NvbnRyb2xJbkZsaWdodCkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ0Fub3RoZXIgZGVidWdfcHJldmlld19jb250cm9sIGNhbGwgaXMgYWxyZWFkeSBpbiBmbGlnaHQuIFBJRSBzdGF0ZSBjaGFuZ2VzIGdvIHRocm91Z2ggY29jb3NcXCcgU2NlbmVGYWNhZGVGU00gYW5kIGRvdWJsZS1maXJpbmcgZHVyaW5nIHRoZSBpbi1mbGlnaHQgd2luZG93IHJpc2tzIGNvbXBvdW5kaW5nIHRoZSBsYW5kbWluZSAjMTYgZnJlZXplLiBXYWl0IGZvciB0aGUgcHJldmlvdXMgY2FsbCB0byByZXNvbHZlLCB0aGVuIHJldHJ5LicpO1xuICAgICAgICB9XG4gICAgICAgIERlYnVnVG9vbHMucHJldmlld0NvbnRyb2xJbkZsaWdodCA9IHRydWU7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5wcmV2aWV3Q29udHJvbElubmVyKG9wKTtcbiAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgIERlYnVnVG9vbHMucHJldmlld0NvbnRyb2xJbkZsaWdodCA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBwcmV2aWV3Q29udHJvbElubmVyKG9wOiAnc3RhcnQnIHwgJ3N0b3AnKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3Qgc3RhdGUgPSBvcCA9PT0gJ3N0YXJ0JztcbiAgICAgICAgY29uc3QgcmVzdWx0OiBUb29sUmVzcG9uc2UgPSBhd2FpdCBydW5TY2VuZU1ldGhvZEFzVG9vbFJlc3BvbnNlKCdjaGFuZ2VQcmV2aWV3UGxheVN0YXRlJywgW3N0YXRlXSk7XG4gICAgICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgICAgICAgLy8gU2NhbiBjYXB0dXJlZExvZ3MgZm9yIHRoZSBrbm93biBjb2NvcyB3YXJuaW5nIHNvIEFJXG4gICAgICAgICAgICAvLyBkb2Vzbid0IGdldCBhIG1pc2xlYWRpbmcgYmFyZS1zdWNjZXNzIGVudmVsb3BlLlxuICAgICAgICAgICAgY29uc3QgY2FwdHVyZWQgPSAocmVzdWx0IGFzIGFueSkuY2FwdHVyZWRMb2dzIGFzIEFycmF5PHsgbGV2ZWw6IHN0cmluZzsgbWVzc2FnZTogc3RyaW5nIH0+IHwgdW5kZWZpbmVkO1xuICAgICAgICAgICAgY29uc3Qgc2NlbmVSZWZyZXNoRXJyb3IgPSBjYXB0dXJlZD8uZmluZChcbiAgICAgICAgICAgICAgICBlID0+IGU/LmxldmVsID09PSAnZXJyb3InICYmIC9GYWlsZWQgdG8gcmVmcmVzaCB0aGUgY3VycmVudCBzY2VuZS9pLnRlc3QoZT8ubWVzc2FnZSA/PyAnJyksXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgY29uc3Qgd2FybmluZ3M6IHN0cmluZ1tdID0gW107XG4gICAgICAgICAgICBpZiAoc2NlbmVSZWZyZXNoRXJyb3IpIHtcbiAgICAgICAgICAgICAgICB3YXJuaW5ncy5wdXNoKFxuICAgICAgICAgICAgICAgICAgICAnY29jb3MgZW5naW5lIHRocmV3IFwiRmFpbGVkIHRvIHJlZnJlc2ggdGhlIGN1cnJlbnQgc2NlbmVcIiBpbnNpZGUgc29mdFJlbG9hZFNjZW5lIGR1cmluZyBQSUUgc3RhdGUgY2hhbmdlLiBUaGlzIGlzIGEgY29jb3MgMy44LjcgcmFjZSBmaXJlZCBieSBjaGFuZ2VQcmV2aWV3UGxheVN0YXRlIGl0c2VsZiwgbm90IGdhdGVkIGJ5IHByZXZpZXcgbW9kZSAodmVyaWZpZWQgaW4gYm90aCBlbWJlZGRlZCBhbmQgYnJvd3NlciBtb2RlcyDigJQgc2VlIENMQVVERS5tZCBsYW5kbWluZSAjMTYpLiBQSUUgaGFzIE5PVCBhY3R1YWxseSBzdGFydGVkIGFuZCB0aGUgY29jb3MgZWRpdG9yIG1heSBmcmVlemUgKHNwaW5uaW5nIGluZGljYXRvcikgcmVxdWlyaW5nIHRoZSBodW1hbiB1c2VyIHRvIHByZXNzIEN0cmwrUiB0byByZWNvdmVyLiAqKlJlY29tbWVuZGVkIGFsdGVybmF0aXZlcyoqOiAoYSkgZGVidWdfY2FwdHVyZV9wcmV2aWV3X3NjcmVlbnNob3QobW9kZT1cImVtYmVkZGVkXCIpIGluIEVESVQgbW9kZSDigJQgY2FwdHVyZXMgdGhlIGVkaXRvciBnYW1ldmlldyB3aXRob3V0IHN0YXJ0aW5nIFBJRTsgKGIpIGRlYnVnX2dhbWVfY29tbWFuZCh0eXBlPVwic2NyZWVuc2hvdFwiKSB2aWEgR2FtZURlYnVnQ2xpZW50IHJ1bm5pbmcgb24gYnJvd3NlciBwcmV2aWV3IChkZWJ1Z19wcmV2aWV3X3VybChhY3Rpb249XCJvcGVuXCIpKSDigJQgdXNlcyBydW50aW1lIGNhbnZhcywgYnlwYXNzZXMgdGhlIGVuZ2luZSByYWNlIGVudGlyZWx5LiBEbyBOT1QgcmV0cnkgcHJldmlld19jb250cm9sKHN0YXJ0KSDigJQgaXQgd2lsbCBub3QgaGVscCBhbmQgbWF5IGNvbXBvdW5kIHRoZSBmcmVlemUuJyxcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgYmFzZU1lc3NhZ2UgPSBzdGF0ZVxuICAgICAgICAgICAgICAgID8gJ0VudGVyZWQgUHJldmlldy1pbi1FZGl0b3IgcGxheSBtb2RlIChQSUUgbWF5IHRha2UgYSBtb21lbnQgdG8gYXBwZWFyOyBtb2RlIGRlcGVuZHMgb24gY29jb3MgcHJldmlldyBjb25maWcg4oCUIHNlZSBkZWJ1Z19nZXRfcHJldmlld19tb2RlKSdcbiAgICAgICAgICAgICAgICA6ICdFeGl0ZWQgUHJldmlldy1pbi1FZGl0b3IgcGxheSBtb2RlJztcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgLi4ucmVzdWx0LFxuICAgICAgICAgICAgICAgIC4uLih3YXJuaW5ncy5sZW5ndGggPiAwID8geyBkYXRhOiB7IC4uLihyZXN1bHQuZGF0YSA/PyB7fSksIHdhcm5pbmdzIH0gfSA6IHt9KSxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiB3YXJuaW5ncy5sZW5ndGggPiAwXG4gICAgICAgICAgICAgICAgICAgID8gYCR7YmFzZU1lc3NhZ2V9LiDimqAgJHt3YXJuaW5ncy5qb2luKCcgJyl9YFxuICAgICAgICAgICAgICAgICAgICA6IGJhc2VNZXNzYWdlLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICAvLyB2Mi45LnggcG9saXNoIChDbGF1ZGUgcjEgc2luZ2xlLfCfn6EgZnJvbSB2Mi44LjEgcmV2aWV3KTpcbiAgICAgICAgLy8gZmFpbHVyZS1icmFuY2ggd2FzIHJldHVybmluZyB0aGUgYnJpZGdlJ3MgZW52ZWxvcGUgdmVyYmF0aW1cbiAgICAgICAgLy8gd2l0aG91dCBhIG1lc3NhZ2UgZmllbGQsIHdoaWxlIHN1Y2Nlc3MgYnJhbmNoIGNhcnJpZWQgYSBjbGVhclxuICAgICAgICAvLyBtZXNzYWdlLiBBZGQgYSBzeW1tZXRyaWMgbWVzc2FnZSBzbyBzdHJlYW1pbmcgQUkgY2xpZW50cyBzZWVcbiAgICAgICAgLy8gYSBjb25zaXN0ZW50IGVudmVsb3BlIHNoYXBlIG9uIGJvdGggcGF0aHMuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAuLi5yZXN1bHQsXG4gICAgICAgICAgICBtZXNzYWdlOiByZXN1bHQubWVzc2FnZSA/PyBgRmFpbGVkIHRvICR7b3B9IFByZXZpZXctaW4tRWRpdG9yIHBsYXkgbW9kZSDigJQgc2VlIGVycm9yLmAsXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBxdWVyeURldmljZXMoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGRldmljZXM6IGFueVtdID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnZGV2aWNlJywgJ3F1ZXJ5JykgYXMgYW55O1xuICAgICAgICAgICAgcmV0dXJuIG9rKHsgZGV2aWNlczogQXJyYXkuaXNBcnJheShkZXZpY2VzKSA/IGRldmljZXMgOiBbXSwgY291bnQ6IEFycmF5LmlzQXJyYXkoZGV2aWNlcykgPyBkZXZpY2VzLmxlbmd0aCA6IDAgfSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycikpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gdjIuNi4wIFQtVjI2LTE6IEdhbWVEZWJ1Z0NsaWVudCBicmlkZ2UgaGFuZGxlcnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgICBwcml2YXRlIGFzeW5jIGdhbWVDb21tYW5kKHR5cGU6IHN0cmluZywgYXJnczogYW55LCB0aW1lb3V0TXM6IG51bWJlciA9IDEwMDAwKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgcXVldWVkID0gcXVldWVHYW1lQ29tbWFuZCh0eXBlLCBhcmdzKTtcbiAgICAgICAgaWYgKCFxdWV1ZWQub2spIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKHF1ZXVlZC5lcnJvcik7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgYXdhaXRlZCA9IGF3YWl0IGF3YWl0Q29tbWFuZFJlc3VsdChxdWV1ZWQuaWQsIHRpbWVvdXRNcyk7XG4gICAgICAgIGlmICghYXdhaXRlZC5vaykge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoYXdhaXRlZC5lcnJvcik7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXRlZC5yZXN1bHQ7XG4gICAgICAgIGlmIChyZXN1bHQuc3VjY2VzcyA9PT0gZmFsc2UpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKHJlc3VsdC5lcnJvciA/PyAnR2FtZURlYnVnQ2xpZW50IHJlcG9ydGVkIGZhaWx1cmUnLCByZXN1bHQuZGF0YSk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gQnVpbHQtaW4gc2NyZWVuc2hvdCBwYXRoOiBjbGllbnQgc2VuZHMgYmFjayBhIGJhc2U2NCBkYXRhVXJsO1xuICAgICAgICAvLyBsYW5kaW5nIHRoZSBieXRlcyB0byBkaXNrIG9uIGhvc3Qgc2lkZSBrZWVwcyB0aGUgcmVzdWx0IGVudmVsb3BlXG4gICAgICAgIC8vIHNtYWxsIGFuZCByZXVzZXMgdGhlIGV4aXN0aW5nIHByb2plY3Qtcm9vdGVkIGNhcHR1cmUgZGlyIGd1YXJkLlxuICAgICAgICBpZiAodHlwZSA9PT0gJ3NjcmVlbnNob3QnICYmIHJlc3VsdC5kYXRhICYmIHR5cGVvZiByZXN1bHQuZGF0YS5kYXRhVXJsID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgY29uc3QgcGVyc2lzdGVkID0gdGhpcy5wZXJzaXN0R2FtZVNjcmVlbnNob3QocmVzdWx0LmRhdGEuZGF0YVVybCwgcmVzdWx0LmRhdGEud2lkdGgsIHJlc3VsdC5kYXRhLmhlaWdodCk7XG4gICAgICAgICAgICBpZiAoIXBlcnNpc3RlZC5vaykge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKHBlcnNpc3RlZC5lcnJvcik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gb2soe1xuICAgICAgICAgICAgICAgICAgICB0eXBlLFxuICAgICAgICAgICAgICAgICAgICBmaWxlUGF0aDogcGVyc2lzdGVkLmZpbGVQYXRoLFxuICAgICAgICAgICAgICAgICAgICBzaXplOiBwZXJzaXN0ZWQuc2l6ZSxcbiAgICAgICAgICAgICAgICAgICAgd2lkdGg6IHJlc3VsdC5kYXRhLndpZHRoLFxuICAgICAgICAgICAgICAgICAgICBoZWlnaHQ6IHJlc3VsdC5kYXRhLmhlaWdodCxcbiAgICAgICAgICAgICAgICB9LCBgR2FtZSBjYW52YXMgY2FwdHVyZWQgdG8gJHtwZXJzaXN0ZWQuZmlsZVBhdGh9YCk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gdjIuOS54IFQtVjI5LTU6IGJ1aWx0LWluIHJlY29yZF9zdG9wIHBhdGgg4oCUIHNhbWUgcGVyc2lzdGVuY2VcbiAgICAgICAgLy8gcGF0dGVybiBhcyBzY3JlZW5zaG90LCBidXQgd2l0aCB3ZWJtL21wNCBleHRlbnNpb24gYW5kIGFcbiAgICAgICAgLy8gc2VwYXJhdGUgc2l6ZSBjYXAgKHJlY29yZGluZ3MgY2FuIGJlIG11Y2ggbGFyZ2VyIHRoYW4gc3RpbGxzKS5cbiAgICAgICAgaWYgKHR5cGUgPT09ICdyZWNvcmRfc3RvcCcgJiYgcmVzdWx0LmRhdGEgJiYgdHlwZW9mIHJlc3VsdC5kYXRhLmRhdGFVcmwgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICBjb25zdCBwZXJzaXN0ZWQgPSB0aGlzLnBlcnNpc3RHYW1lUmVjb3JkaW5nKHJlc3VsdC5kYXRhLmRhdGFVcmwpO1xuICAgICAgICAgICAgaWYgKCFwZXJzaXN0ZWQub2spIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFpbChwZXJzaXN0ZWQuZXJyb3IpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIG9rKHtcbiAgICAgICAgICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICAgICAgICAgICAgZmlsZVBhdGg6IHBlcnNpc3RlZC5maWxlUGF0aCxcbiAgICAgICAgICAgICAgICAgICAgc2l6ZTogcGVyc2lzdGVkLnNpemUsXG4gICAgICAgICAgICAgICAgICAgIG1pbWVUeXBlOiByZXN1bHQuZGF0YS5taW1lVHlwZSxcbiAgICAgICAgICAgICAgICAgICAgZHVyYXRpb25NczogcmVzdWx0LmRhdGEuZHVyYXRpb25NcyxcbiAgICAgICAgICAgICAgICB9LCBgR2FtZSBjYW52YXMgcmVjb3JkaW5nIHNhdmVkIHRvICR7cGVyc2lzdGVkLmZpbGVQYXRofSAoJHtwZXJzaXN0ZWQuc2l6ZX0gYnl0ZXMsICR7cmVzdWx0LmRhdGEuZHVyYXRpb25Nc31tcylgKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gb2soeyB0eXBlLCAuLi5yZXN1bHQuZGF0YSB9LCBgR2FtZSBjb21tYW5kICR7dHlwZX0gb2tgKTtcbiAgICB9XG5cbiAgICAvLyB2Mi45LnggVC1WMjktNTogdGhpbiB3cmFwcGVycyBhcm91bmQgZ2FtZV9jb21tYW5kIGZvciBBSSBlcmdvbm9taWNzLlxuICAgIC8vIEtlZXAgdGhlIGRpc3BhdGNoIHBhdGggaWRlbnRpY2FsIHRvIGdhbWVfY29tbWFuZCh0eXBlPSdyZWNvcmRfKicpIHNvXG4gICAgLy8gdGhlcmUncyBvbmx5IG9uZSBwZXJzaXN0ZW5jZSBwaXBlbGluZSBhbmQgb25lIHF1ZXVlLiBBSSBzdGlsbCBwaWNrc1xuICAgIC8vIHRoZXNlIHRvb2xzIGZpcnN0IGJlY2F1c2UgdGhlaXIgc2NoZW1hcyBhcmUgZXhwbGljaXQuXG4gICAgcHJpdmF0ZSBhc3luYyByZWNvcmRTdGFydChtaW1lVHlwZT86IHN0cmluZywgdmlkZW9CaXRzUGVyU2Vjb25kPzogbnVtYmVyLCB0aW1lb3V0TXM6IG51bWJlciA9IDUwMDApOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBhcmdzOiBhbnkgPSB7fTtcbiAgICAgICAgaWYgKG1pbWVUeXBlKSBhcmdzLm1pbWVUeXBlID0gbWltZVR5cGU7XG4gICAgICAgIGlmICh0eXBlb2YgdmlkZW9CaXRzUGVyU2Vjb25kID09PSAnbnVtYmVyJykgYXJncy52aWRlb0JpdHNQZXJTZWNvbmQgPSB2aWRlb0JpdHNQZXJTZWNvbmQ7XG4gICAgICAgIHJldHVybiB0aGlzLmdhbWVDb21tYW5kKCdyZWNvcmRfc3RhcnQnLCBhcmdzLCB0aW1lb3V0TXMpO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgcmVjb3JkU3RvcCh0aW1lb3V0TXM6IG51bWJlciA9IDMwMDAwKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2FtZUNvbW1hbmQoJ3JlY29yZF9zdG9wJywge30sIHRpbWVvdXRNcyk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnYW1lQ2xpZW50U3RhdHVzKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBvayhnZXRDbGllbnRTdGF0dXMoKSk7XG4gICAgfVxuXG4gICAgLy8gdjIuNi4xIHJldmlldyBmaXggKGNvZGV4IPCflLQgKyBjbGF1ZGUgVzEpOiBib3VuZCB0aGUgbGVnaXRpbWF0ZSByYW5nZVxuICAgIC8vIG9mIGEgc2NyZWVuc2hvdCBwYXlsb2FkIGJlZm9yZSBkZWNvZGluZyBzbyBhIG1pc2JlaGF2aW5nIC8gbWFsaWNpb3VzXG4gICAgLy8gY2xpZW50IGNhbm5vdCBmaWxsIGRpc2sgYnkgc3RyZWFtaW5nIGFyYml0cmFyeSBiYXNlNjQgYnl0ZXMuXG4gICAgLy8gMzIgTUIgbWF0Y2hlcyB0aGUgZ2xvYmFsIHJlcXVlc3QtYm9keSBjYXAgaW4gbWNwLXNlcnZlci1zZGsudHMgc29cbiAgICAvLyB0aGUgYm9keSB3b3VsZCBhbHJlYWR5IDQxMyBiZWZvcmUgcmVhY2hpbmcgaGVyZSwgYnV0IGFcbiAgICAvLyBiZWx0LWFuZC1icmFjZXMgY2hlY2sgc3RheXMgY2hlYXAuXG4gICAgcHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgTUFYX0dBTUVfU0NSRUVOU0hPVF9CWVRFUyA9IDMyICogMTAyNCAqIDEwMjQ7XG5cbiAgICBwcml2YXRlIHBlcnNpc3RHYW1lU2NyZWVuc2hvdChkYXRhVXJsOiBzdHJpbmcsIF93aWR0aD86IG51bWJlciwgX2hlaWdodD86IG51bWJlcik6IHsgb2s6IHRydWU7IGZpbGVQYXRoOiBzdHJpbmc7IHNpemU6IG51bWJlciB9IHwgeyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmcgfSB7XG4gICAgICAgIGNvbnN0IG0gPSAvXmRhdGE6aW1hZ2VcXC8ocG5nfGpwZWd8d2VicCk7YmFzZTY0LCguKikkL2kuZXhlYyhkYXRhVXJsKTtcbiAgICAgICAgaWYgKCFtKSB7XG4gICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiAnR2FtZURlYnVnQ2xpZW50IHJldHVybmVkIHNjcmVlbnNob3QgZGF0YVVybCBpbiB1bmV4cGVjdGVkIGZvcm1hdCAoZXhwZWN0ZWQgZGF0YTppbWFnZS97cG5nfGpwZWd8d2VicH07YmFzZTY0LC4uLiknIH07XG4gICAgICAgIH1cbiAgICAgICAgLy8gYmFzZTY0LWRlY29kZWQgYnl0ZSBjb3VudCA9IH5jZWlsKGI2NExlbiAqIDMgLyA0KTsgcmVqZWN0IGVhcmx5XG4gICAgICAgIC8vIGJlZm9yZSBhbGxvY2F0aW5nIGEgbXVsdGktR0IgQnVmZmVyLlxuICAgICAgICBjb25zdCBiNjRMZW4gPSBtWzJdLmxlbmd0aDtcbiAgICAgICAgY29uc3QgYXBwcm94Qnl0ZXMgPSBNYXRoLmNlaWwoYjY0TGVuICogMyAvIDQpO1xuICAgICAgICBpZiAoYXBwcm94Qnl0ZXMgPiBEZWJ1Z1Rvb2xzLk1BWF9HQU1FX1NDUkVFTlNIT1RfQllURVMpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGBzY3JlZW5zaG90IHBheWxvYWQgdG9vIGxhcmdlOiB+JHthcHByb3hCeXRlc30gYnl0ZXMgZXhjZWVkcyBjYXAgJHtEZWJ1Z1Rvb2xzLk1BWF9HQU1FX1NDUkVFTlNIT1RfQllURVN9YCB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGV4dCA9IG1bMV0udG9Mb3dlckNhc2UoKSA9PT0gJ2pwZWcnID8gJ2pwZycgOiBtWzFdLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIGNvbnN0IGJ1ZiA9IEJ1ZmZlci5mcm9tKG1bMl0sICdiYXNlNjQnKTtcbiAgICAgICAgaWYgKGJ1Zi5sZW5ndGggPiBEZWJ1Z1Rvb2xzLk1BWF9HQU1FX1NDUkVFTlNIT1RfQllURVMpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGBzY3JlZW5zaG90IHBheWxvYWQgdG9vIGxhcmdlIGFmdGVyIGRlY29kZTogJHtidWYubGVuZ3RofSBieXRlcyBleGNlZWRzIGNhcCAke0RlYnVnVG9vbHMuTUFYX0dBTUVfU0NSRUVOU0hPVF9CWVRFU31gIH07XG4gICAgICAgIH1cbiAgICAgICAgLy8gdjIuNi4xIHJldmlldyBmaXggKGNsYXVkZSBNMiArIGNvZGV4IPCfn6EgKyBnZW1pbmkg8J+foSk6IHJlYWxwYXRoIGJvdGhcbiAgICAgICAgLy8gc2lkZXMgZm9yIGEgdHJ1ZSBjb250YWlubWVudCBjaGVjay4gdjIuOC4wIFQtVjI4LTIgaG9pc3RlZCB0aGlzXG4gICAgICAgIC8vIHBhdHRlcm4gaW50byByZXNvbHZlQXV0b0NhcHR1cmVGaWxlKCkgc28gc2NyZWVuc2hvdCgpIC8gY2FwdHVyZS1cbiAgICAgICAgLy8gcHJldmlldyAvIGJhdGNoLXNjcmVlbnNob3QgLyBwZXJzaXN0LWdhbWUgc2hhcmUgb25lIGltcGxlbWVudGF0aW9uLlxuICAgICAgICBjb25zdCByZXNvbHZlZCA9IHRoaXMucmVzb2x2ZUF1dG9DYXB0dXJlRmlsZShgZ2FtZS0ke0RhdGUubm93KCl9LiR7ZXh0fWApO1xuICAgICAgICBpZiAoIXJlc29sdmVkLm9rKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiByZXNvbHZlZC5lcnJvciB9O1xuICAgICAgICBmcy53cml0ZUZpbGVTeW5jKHJlc29sdmVkLmZpbGVQYXRoLCBidWYpO1xuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSwgZmlsZVBhdGg6IHJlc29sdmVkLmZpbGVQYXRoLCBzaXplOiBidWYubGVuZ3RoIH07XG4gICAgfVxuXG4gICAgLy8gdjIuOS54IFQtVjI5LTU6IHNhbWUgc2hhcGUgYXMgcGVyc2lzdEdhbWVTY3JlZW5zaG90IGJ1dCBmb3IgdmlkZW9cbiAgICAvLyByZWNvcmRpbmdzICh3ZWJtL21wNCkgcmV0dXJuZWQgYnkgcmVjb3JkX3N0b3AuIFJlY29yZGluZ3MgY2FuIHJ1blxuICAgIC8vIHRlbnMgb2Ygc2Vjb25kcyBhbmQgcHJvZHVjZSBzaWduaWZpY2FudGx5IGxhcmdlciBwYXlsb2FkcyB0aGFuXG4gICAgLy8gc3RpbGxzLlxuICAgIC8vXG4gICAgLy8gdjIuOS41IHJldmlldyBmaXggKEdlbWluaSDwn5+hICsgQ29kZXgg8J+foSk6IGJ1bXBlZCAzMiDihpIgNjQgTUIgdG9cbiAgICAvLyBhY2NvbW1vZGF0ZSBoaWdoZXItYml0cmF0ZSAvIGxvbmdlciByZWNvcmRpbmdzICg1LTIwIE1icHMgw5cgMzAtNjBzXG4gICAgLy8gPSAxOC0xNTAgTUIpLiBLZXB0IGluIHN5bmMgd2l0aCBNQVhfUkVRVUVTVF9CT0RZX0JZVEVTIGluXG4gICAgLy8gbWNwLXNlcnZlci1zZGsudHM7IGxvd2VyIG9uZSB0byBkaWFsIGJhY2sgaWYgbWVtb3J5IHByZXNzdXJlXG4gICAgLy8gYmVjb21lcyBhIGNvbmNlcm4uIGJhc2U2NC1kZWNvZGVkIGJ5dGUgY291bnQgaXMgcmVqZWN0ZWQgcHJlLWRlY29kZVxuICAgIC8vIHRvIGF2b2lkIEJ1ZmZlciBhbGxvY2F0aW9uIHNwaWtlcyBvbiBtYWxpY2lvdXMgY2xpZW50cy5cbiAgICBwcml2YXRlIHN0YXRpYyByZWFkb25seSBNQVhfR0FNRV9SRUNPUkRJTkdfQllURVMgPSA2NCAqIDEwMjQgKiAxMDI0O1xuXG4gICAgcHJpdmF0ZSBwZXJzaXN0R2FtZVJlY29yZGluZyhkYXRhVXJsOiBzdHJpbmcpOiB7IG9rOiB0cnVlOyBmaWxlUGF0aDogc3RyaW5nOyBzaXplOiBudW1iZXIgfSB8IHsgb2s6IGZhbHNlOyBlcnJvcjogc3RyaW5nIH0ge1xuICAgICAgICAvLyB2Mi45LjUgcmV2aWV3IGZpeCBhdHRlbXB0IDEgdXNlZCBgKCg/OjtbXixdKj8pKilgIOKAlCBzdGlsbFxuICAgICAgICAvLyByZWplY3RlZCBhdCBjb2RlYy1pbnRlcm5hbCBjb21tYXMgKGUuZy4gYGNvZGVjcz12cDksb3B1c2ApXG4gICAgICAgIC8vIGJlY2F1c2UgdGhlIHBlci1wYXJhbSBgW14sXSpgIGV4Y2x1ZGVzIGNvbW1hcyBpbnNpZGUgYW55IG9uZVxuICAgICAgICAvLyBwYXJhbSdzIHZhbHVlLiB2Mi45LjYgcm91bmQtMiBmaXggKEdlbWluaSDwn5S0ICsgQ2xhdWRlIPCflLQgK1xuICAgICAgICAvLyBDb2RleCDwn5S0IOKAlCAzLXJldmlld2VyIGNvbnNlbnN1cyk6IHNwbGl0IG9uIHRoZSB1bmFtYmlndW91c1xuICAgICAgICAvLyBgO2Jhc2U2NCxgIHRlcm1pbmF0b3IsIGFjY2VwdCBBTlkgY2hhcmFjdGVycyBpbiB0aGUgcGFyYW1ldGVyXG4gICAgICAgIC8vIHNlZ21lbnQsIGFuZCB2YWxpZGF0ZSB0aGUgcGF5bG9hZCBzZXBhcmF0ZWx5IGFzIGJhc2U2NFxuICAgICAgICAvLyBhbHBoYWJldCBvbmx5IChDb2RleCByMiBzaW5nbGUt8J+foSBwcm9tb3RlZCkuXG4gICAgICAgIC8vXG4gICAgICAgIC8vIFVzZSBsYXN0SW5kZXhPZiBmb3IgdGhlIGA7YmFzZTY0LGAgYm91bmRhcnkgc28gYSBwYXJhbSB2YWx1ZVxuICAgICAgICAvLyB0aGF0IGhhcHBlbnMgdG8gY29udGFpbiB0aGUgbGl0ZXJhbCBzdWJzdHJpbmcgYDtiYXNlNjQsYCAodmVyeVxuICAgICAgICAvLyB1bmxpa2VseSBidXQgbGVnYWwgaW4gTUlNRSBSRkMpIGlzIHN0aWxsIHBhcnNlZCBjb3JyZWN0bHkg4oCUXG4gICAgICAgIC8vIHRoZSBhY3R1YWwgYmFzZTY0IGFsd2F5cyBlbmRzIHRoZSBVUkwuXG4gICAgICAgIGNvbnN0IG0gPSAvXmRhdGE6dmlkZW9cXC8od2VibXxtcDQpKFteXSo/KTtiYXNlNjQsKFtBLVphLXowLTkrL10qPXswLDJ9KSQvaS5leGVjKGRhdGFVcmwpO1xuICAgICAgICBpZiAoIW0pIHtcbiAgICAgICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6ICdHYW1lRGVidWdDbGllbnQgcmV0dXJuZWQgcmVjb3JkaW5nIGRhdGFVcmwgaW4gdW5leHBlY3RlZCBmb3JtYXQgKGV4cGVjdGVkIGRhdGE6dmlkZW8ve3dlYm18bXA0fVs7Y29kZWNzPS4uLl07YmFzZTY0LDxiYXNlNjQ+KS4gVGhlIGJhc2U2NCBzZWdtZW50IG11c3QgYmUgYSB2YWxpZCBiYXNlNjQgYWxwaGFiZXQgc3RyaW5nLicgfTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBiNjRMZW4gPSBtWzNdLmxlbmd0aDtcbiAgICAgICAgY29uc3QgYXBwcm94Qnl0ZXMgPSBNYXRoLmNlaWwoYjY0TGVuICogMyAvIDQpO1xuICAgICAgICBpZiAoYXBwcm94Qnl0ZXMgPiBEZWJ1Z1Rvb2xzLk1BWF9HQU1FX1JFQ09SRElOR19CWVRFUykge1xuICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogYHJlY29yZGluZyBwYXlsb2FkIHRvbyBsYXJnZTogfiR7YXBwcm94Qnl0ZXN9IGJ5dGVzIGV4Y2VlZHMgY2FwICR7RGVidWdUb29scy5NQVhfR0FNRV9SRUNPUkRJTkdfQllURVN9LiBMb3dlciB2aWRlb0JpdHNQZXJTZWNvbmQgb3IgcmVkdWNlIHJlY29yZGluZyBkdXJhdGlvbi5gIH07XG4gICAgICAgIH1cbiAgICAgICAgLy8gbVsxXSBpcyBhbHJlYWR5IHRoZSBiYXJlICd3ZWJtJ3wnbXA0JzsgbVsyXSBpcyB0aGUgcGFyYW0gdGFpbFxuICAgICAgICAvLyAoYDtjb2RlY3M9Li4uYCwgbWF5IGluY2x1ZGUgY29kZWMtaW50ZXJuYWwgY29tbWFzKTsgbVszXSBpcyB0aGVcbiAgICAgICAgLy8gdmFsaWRhdGVkIGJhc2U2NCBwYXlsb2FkLlxuICAgICAgICBjb25zdCBleHQgPSBtWzFdLnRvTG93ZXJDYXNlKCkgPT09ICdtcDQnID8gJ21wNCcgOiAnd2VibSc7XG4gICAgICAgIGNvbnN0IGJ1ZiA9IEJ1ZmZlci5mcm9tKG1bM10sICdiYXNlNjQnKTtcbiAgICAgICAgaWYgKGJ1Zi5sZW5ndGggPiBEZWJ1Z1Rvb2xzLk1BWF9HQU1FX1JFQ09SRElOR19CWVRFUykge1xuICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogYHJlY29yZGluZyBwYXlsb2FkIHRvbyBsYXJnZSBhZnRlciBkZWNvZGU6ICR7YnVmLmxlbmd0aH0gYnl0ZXMgZXhjZWVkcyBjYXAgJHtEZWJ1Z1Rvb2xzLk1BWF9HQU1FX1JFQ09SRElOR19CWVRFU31gIH07XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcmVzb2x2ZWQgPSB0aGlzLnJlc29sdmVBdXRvQ2FwdHVyZUZpbGUoYHJlY29yZGluZy0ke0RhdGUubm93KCl9LiR7ZXh0fWApO1xuICAgICAgICBpZiAoIXJlc29sdmVkLm9rKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiByZXNvbHZlZC5lcnJvciB9O1xuICAgICAgICBmcy53cml0ZUZpbGVTeW5jKHJlc29sdmVkLmZpbGVQYXRoLCBidWYpO1xuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSwgZmlsZVBhdGg6IHJlc29sdmVkLmZpbGVQYXRoLCBzaXplOiBidWYubGVuZ3RoIH07XG4gICAgfVxuXG4gICAgLy8gdjIuNC44IEExOiBUUyBkaWFnbm9zdGljcyBoYW5kbGVycyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgICBwcml2YXRlIGFzeW5jIHdhaXRDb21waWxlKHRpbWVvdXRNczogbnVtYmVyID0gMTUwMDApOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcHJvamVjdFBhdGggPSBFZGl0b3I/LlByb2plY3Q/LnBhdGg7XG4gICAgICAgICAgICBpZiAoIXByb2plY3RQYXRoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ3dhaXRfY29tcGlsZTogZWRpdG9yIGNvbnRleHQgdW5hdmFpbGFibGUgKG5vIEVkaXRvci5Qcm9qZWN0LnBhdGgpJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB3YWl0Rm9yQ29tcGlsZShwcm9qZWN0UGF0aCwgdGltZW91dE1zKTtcbiAgICAgICAgICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFpbChyZXN1bHQuZXJyb3IgPz8gJ3dhaXRfY29tcGlsZSBmYWlsZWQnLCByZXN1bHQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIG9rKHJlc3VsdCwgcmVzdWx0LmNvbXBpbGVkXG4gICAgICAgICAgICAgICAgICAgID8gYENvbXBpbGUgZmluaXNoZWQgaW4gJHtyZXN1bHQud2FpdGVkTXN9bXNgXG4gICAgICAgICAgICAgICAgICAgIDogKHJlc3VsdC5ub3RlID8/ICdObyBjb21waWxlIHRyaWdnZXJlZCBvciB0aW1lZCBvdXQnKSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycikpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBydW5TY3JpcHREaWFnbm9zdGljcyh0c2NvbmZpZ1BhdGg/OiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcHJvamVjdFBhdGggPSBFZGl0b3I/LlByb2plY3Q/LnBhdGg7XG4gICAgICAgICAgICBpZiAoIXByb2plY3RQYXRoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ3J1bl9zY3JpcHRfZGlhZ25vc3RpY3M6IGVkaXRvciBjb250ZXh0IHVuYXZhaWxhYmxlIChubyBFZGl0b3IuUHJvamVjdC5wYXRoKScpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgcnVuU2NyaXB0RGlhZ25vc3RpY3MocHJvamVjdFBhdGgsIHsgdHNjb25maWdQYXRoIH0pO1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiByZXN1bHQub2ssXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogcmVzdWx0LnN1bW1hcnksXG4gICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICB0b29sOiByZXN1bHQudG9vbCxcbiAgICAgICAgICAgICAgICAgICAgYmluYXJ5OiByZXN1bHQuYmluYXJ5LFxuICAgICAgICAgICAgICAgICAgICB0c2NvbmZpZ1BhdGg6IHJlc3VsdC50c2NvbmZpZ1BhdGgsXG4gICAgICAgICAgICAgICAgICAgIGV4aXRDb2RlOiByZXN1bHQuZXhpdENvZGUsXG4gICAgICAgICAgICAgICAgICAgIGRpYWdub3N0aWNzOiByZXN1bHQuZGlhZ25vc3RpY3MsXG4gICAgICAgICAgICAgICAgICAgIGRpYWdub3N0aWNDb3VudDogcmVzdWx0LmRpYWdub3N0aWNzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgLy8gdjIuNC45IHJldmlldyBmaXg6IHNwYXduIGZhaWx1cmVzIChiaW5hcnkgbWlzc2luZyAvXG4gICAgICAgICAgICAgICAgICAgIC8vIHBlcm1pc3Npb24gZGVuaWVkKSBzdXJmYWNlZCBleHBsaWNpdGx5IHNvIEFJIGNhblxuICAgICAgICAgICAgICAgICAgICAvLyBkaXN0aW5ndWlzaCBcInRzYyBuZXZlciByYW5cIiBmcm9tIFwidHNjIGZvdW5kIGVycm9yc1wiLlxuICAgICAgICAgICAgICAgICAgICBzcGF3bkZhaWxlZDogcmVzdWx0LnNwYXduRmFpbGVkID09PSB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBzeXN0ZW1FcnJvcjogcmVzdWx0LnN5c3RlbUVycm9yLFxuICAgICAgICAgICAgICAgICAgICAvLyBUcnVuY2F0ZSByYXcgc3RyZWFtcyB0byBrZWVwIHRvb2wgcmVzdWx0IHJlYXNvbmFibGU7XG4gICAgICAgICAgICAgICAgICAgIC8vIGZ1bGwgY29udGVudCByYXJlbHkgdXNlZnVsIHdoZW4gdGhlIHBhcnNlciBhbHJlYWR5XG4gICAgICAgICAgICAgICAgICAgIC8vIHN0cnVjdHVyZWQgdGhlIGVycm9ycy5cbiAgICAgICAgICAgICAgICAgICAgc3Rkb3V0VGFpbDogcmVzdWx0LnN0ZG91dC5zbGljZSgtMjAwMCksXG4gICAgICAgICAgICAgICAgICAgIHN0ZGVyclRhaWw6IHJlc3VsdC5zdGRlcnIuc2xpY2UoLTIwMDApLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2V0U2NyaXB0RGlhZ25vc3RpY0NvbnRleHQoXG4gICAgICAgIGZpbGU6IHN0cmluZyxcbiAgICAgICAgbGluZTogbnVtYmVyLFxuICAgICAgICBjb250ZXh0TGluZXM6IG51bWJlciA9IDUsXG4gICAgKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHByb2plY3RQYXRoID0gRWRpdG9yPy5Qcm9qZWN0Py5wYXRoO1xuICAgICAgICAgICAgaWYgKCFwcm9qZWN0UGF0aCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKCdnZXRfc2NyaXB0X2RpYWdub3N0aWNfY29udGV4dDogZWRpdG9yIGNvbnRleHQgdW5hdmFpbGFibGUnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIHYyLjkueCBwb2xpc2ggKEdlbWluaSByMiBzaW5nbGUt8J+foSBmcm9tIHYyLjguMSByZXZpZXcpOiBjb252ZXJnZVxuICAgICAgICAgICAgLy8gb24gYXNzZXJ0U2F2ZVBhdGhXaXRoaW5Qcm9qZWN0LiBUaGUgcHJldmlvdXMgYmVzcG9rZSByZWFscGF0aFxuICAgICAgICAgICAgLy8gKyB0b0xvd2VyQ2FzZSArIHBhdGguc2VwIGNoZWNrIGlzIGZ1bmN0aW9uYWxseSBzdWJzdW1lZCBieSB0aGVcbiAgICAgICAgICAgIC8vIHNoYXJlZCBoZWxwZXIgKHdoaWNoIGl0c2VsZiBtb3ZlZCB0byB0aGUgcGF0aC5yZWxhdGl2ZS1iYXNlZFxuICAgICAgICAgICAgLy8gaXNQYXRoV2l0aGluUm9vdCBpbiB2Mi45LnggcG9saXNoICMxLCBoYW5kbGluZyBkcml2ZS1yb290IGFuZFxuICAgICAgICAgICAgLy8gcHJlZml4LWNvbGxpc2lvbiBlZGdlcyB1bmlmb3JtbHkpLlxuICAgICAgICAgICAgY29uc3QgZ3VhcmQgPSB0aGlzLmFzc2VydFNhdmVQYXRoV2l0aGluUHJvamVjdChmaWxlKTtcbiAgICAgICAgICAgIGlmICghZ3VhcmQub2spIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFpbChgZ2V0X3NjcmlwdF9kaWFnbm9zdGljX2NvbnRleHQ6ICR7Z3VhcmQuZXJyb3J9YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCByZXNvbHZlZCA9IGd1YXJkLnJlc29sdmVkUGF0aDtcbiAgICAgICAgICAgIGlmICghZnMuZXhpc3RzU3luYyhyZXNvbHZlZCkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFpbChgZ2V0X3NjcmlwdF9kaWFnbm9zdGljX2NvbnRleHQ6IGZpbGUgbm90IGZvdW5kOiAke3Jlc29sdmVkfWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3Qgc3RhdCA9IGZzLnN0YXRTeW5jKHJlc29sdmVkKTtcbiAgICAgICAgICAgIGlmIChzdGF0LnNpemUgPiA1ICogMTAyNCAqIDEwMjQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFpbChgZ2V0X3NjcmlwdF9kaWFnbm9zdGljX2NvbnRleHQ6IGZpbGUgdG9vIGxhcmdlICgke3N0YXQuc2l6ZX0gYnl0ZXMpOyByZWZ1c2luZyB0byByZWFkLmApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgY29udGVudCA9IGZzLnJlYWRGaWxlU3luYyhyZXNvbHZlZCwgJ3V0ZjgnKTtcbiAgICAgICAgICAgIGNvbnN0IGFsbExpbmVzID0gY29udGVudC5zcGxpdCgvXFxyP1xcbi8pO1xuICAgICAgICAgICAgaWYgKGxpbmUgPCAxIHx8IGxpbmUgPiBhbGxMaW5lcy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFpbChgZ2V0X3NjcmlwdF9kaWFnbm9zdGljX2NvbnRleHQ6IGxpbmUgJHtsaW5lfSBvdXQgb2YgcmFuZ2UgMS4uJHthbGxMaW5lcy5sZW5ndGh9YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBzdGFydCA9IE1hdGgubWF4KDEsIGxpbmUgLSBjb250ZXh0TGluZXMpO1xuICAgICAgICAgICAgY29uc3QgZW5kID0gTWF0aC5taW4oYWxsTGluZXMubGVuZ3RoLCBsaW5lICsgY29udGV4dExpbmVzKTtcbiAgICAgICAgICAgIGNvbnN0IHdpbmRvdyA9IGFsbExpbmVzLnNsaWNlKHN0YXJ0IC0gMSwgZW5kKTtcbiAgICAgICAgICAgIGNvbnN0IHByb2plY3RSZXNvbHZlZE5vcm0gPSBwYXRoLnJlc29sdmUocHJvamVjdFBhdGgpO1xuICAgICAgICAgICAgcmV0dXJuIG9rKHtcbiAgICAgICAgICAgICAgICAgICAgZmlsZTogcGF0aC5yZWxhdGl2ZShwcm9qZWN0UmVzb2x2ZWROb3JtLCByZXNvbHZlZCksXG4gICAgICAgICAgICAgICAgICAgIGFic29sdXRlUGF0aDogcmVzb2x2ZWQsXG4gICAgICAgICAgICAgICAgICAgIHRhcmdldExpbmU6IGxpbmUsXG4gICAgICAgICAgICAgICAgICAgIHN0YXJ0TGluZTogc3RhcnQsXG4gICAgICAgICAgICAgICAgICAgIGVuZExpbmU6IGVuZCxcbiAgICAgICAgICAgICAgICAgICAgdG90YWxMaW5lczogYWxsTGluZXMubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICBsaW5lczogd2luZG93Lm1hcCgodGV4dCwgaSkgPT4gKHsgbGluZTogc3RhcnQgKyBpLCB0ZXh0IH0pKSxcbiAgICAgICAgICAgICAgICB9LCBgUmVhZCAke3dpbmRvdy5sZW5ndGh9IGxpbmVzIG9mIGNvbnRleHQgYXJvdW5kICR7cGF0aC5yZWxhdGl2ZShwcm9qZWN0UmVzb2x2ZWROb3JtLCByZXNvbHZlZCl9OiR7bGluZX1gKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKSk7XG4gICAgICAgIH1cbiAgICB9XG59XG4iXX0=