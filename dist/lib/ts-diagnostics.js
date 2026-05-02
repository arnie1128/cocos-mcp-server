"use strict";
/**
 * ts-diagnostics — host-side TypeScript diagnostics + compile-wait helpers.
 *
 * Three pieces, used by debug-tools.ts:
 *   - findTsBinary(projectPath): locate `tsc` (project node_modules → editor
 *     bundled engine → npx fallback)
 *   - findTsConfig(projectPath, explicit?): locate tsconfig.json (or
 *     temp/tsconfig.cocos.json which cocos generates for the editor)
 *   - runScriptDiagnostics(projectPath, opts): run `tsc --noEmit -p ...`,
 *     parse the output into structured diagnostics.
 *   - waitForCompile(projectPath, timeoutMs): tail
 *     temp/programming/packer-driver/logs/debug.log for cocos's
 *     `Target(editor) ends` marker.
 *
 * Sources:
 *   - FunplayAI/funplay-cocos-mcp lib/diagnostics.js (binary discovery
 *     + tsc output parser)
 *   - harady/cocos-creator-mcp source/tools/debug-tools.ts:waitCompile
 *     (log-size delta + marker-string detection pattern)
 */
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
exports.findTsBinary = findTsBinary;
exports.findTsConfig = findTsConfig;
exports.parseTscOutput = parseTscOutput;
exports.runScriptDiagnostics = runScriptDiagnostics;
exports.waitForCompile = waitForCompile;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
function exists(filePath) {
    try {
        return fs.existsSync(filePath);
    }
    catch (_a) {
        return false;
    }
}
/**
 * Locate the typescript compiler binary. Preference order:
 *   1. project node_modules/.bin/tsc(.cmd)
 *   2. project node_modules/typescript/bin/tsc
 *   3. editor's bundled engine node_modules/.bin/tsc
 *   4. npx (fallback — slow first run, but always present)
 */
function findTsBinary(projectPath) {
    var _a, _b;
    const tscName = process.platform === 'win32' ? 'tsc.cmd' : 'tsc';
    const editorRoots = [];
    const editorPath = (_b = (_a = globalThis.Editor) === null || _a === void 0 ? void 0 : _a.App) === null || _b === void 0 ? void 0 : _b.path;
    if (editorPath) {
        editorRoots.push(editorPath, path.dirname(editorPath));
    }
    const editorBundledCandidates = [];
    for (const root of editorRoots) {
        editorBundledCandidates.push(path.join(root, 'resources', '3d', 'engine', 'node_modules', '.bin', tscName), path.join(root, 'resources', '3d', 'engine', 'node_modules', 'typescript', 'bin', 'tsc'), path.join(root, 'app.asar.unpacked', 'node_modules', 'typescript', 'bin', 'tsc'), path.join(root, 'Contents', 'Resources', 'resources', '3d', 'engine', 'node_modules', '.bin', tscName), path.join(root, 'Contents', 'Resources', 'resources', '3d', 'engine', 'node_modules', 'typescript', 'bin', 'tsc'));
    }
    const candidates = [
        path.join(projectPath, 'node_modules', '.bin', tscName),
        path.join(projectPath, 'node_modules', 'typescript', 'bin', 'tsc'),
        ...editorBundledCandidates,
    ];
    for (const candidate of candidates) {
        if (exists(candidate))
            return candidate;
    }
    return process.platform === 'win32' ? 'npx.cmd' : 'npx';
}
/**
 * Locate the tsconfig to use. Preference order:
 *   1. explicit path passed by caller
 *   2. <project>/tsconfig.json
 *   3. <project>/temp/tsconfig.cocos.json (cocos auto-generates this for
 *      the editor's TS pipeline; available even if user has no top-level
 *      tsconfig.json)
 */
function findTsConfig(projectPath, explicit) {
    var _a;
    if (explicit) {
        return path.isAbsolute(explicit) ? explicit : path.join(projectPath, explicit);
    }
    const candidates = [
        path.join(projectPath, 'tsconfig.json'),
        path.join(projectPath, 'temp', 'tsconfig.cocos.json'),
    ];
    return (_a = candidates.find(exists)) !== null && _a !== void 0 ? _a : '';
}
function execAsync(file, args, cwd) {
    return new Promise((resolve) => {
        const onResult = (error, stdout, stderr) => {
            // v2.4.9 review fix (claude + codex 🔴): a non-numeric error.code
            // (e.g. 'ENOENT' when the resolved tsc binary doesn't exist, or
            // 'EINVAL' on Node 22+ when execFile is called against a .cmd
            // shim without shell:true) was previously coerced to 0 → ok:true
            // with empty diagnostics → AI falsely sees "no errors" when tsc
            // never ran. Treat any error with a non-numeric code as a spawn
            // failure (code=-1) and force the caller to surface it.
            const rawCode = error === null || error === void 0 ? void 0 : error.code;
            const numericCode = typeof rawCode === 'number' ? rawCode : (error ? -1 : 0);
            const spawnFailed = !!error && typeof rawCode !== 'number';
            resolve({
                code: numericCode,
                stdout: String(stdout || ''),
                stderr: String(stderr || ''),
                error: error ? error.message : '',
                spawnFailed,
            });
        };
        // v2.4.12 live-retest fix: Node 22+ refuses to spawn .cmd / .bat
        // files via execFile without shell:true (CVE-2024-27980 patch).
        // The validation throws SYNCHRONOUSLY inside the executor before
        // the callback can run, so without try/catch the Promise rejects
        // and the caller's outer catch returns a generic "spawn EINVAL"
        // error instead of our structured spawnFailed envelope. On
        // Windows .cmd/.bat we use shell:true to route through cmd.exe;
        // shell:true requires us to quote args manually because Node
        // doesn't auto-quote when the shell option is on.
        const isWindowsShim = process.platform === 'win32' && /\.(cmd|bat)$/i.test(file);
        const quoteForCmd = (s) => {
            // Quote only if the arg contains whitespace or shell-special
            // characters; double internal quotes per cmd.exe escape rules.
            if (!/[\s"&<>|^]/.test(s))
                return s;
            return '"' + s.replace(/"/g, '""') + '"';
        };
        const fileArg = isWindowsShim ? quoteForCmd(file) : file;
        const argsArg = isWindowsShim ? args.map(quoteForCmd) : args;
        try {
            (0, child_process_1.execFile)(fileArg, argsArg, {
                cwd,
                maxBuffer: 8 * 1024 * 1024,
                windowsHide: true,
                shell: isWindowsShim,
            }, onResult);
        }
        catch (err) {
            // Catch synchronous validation errors (EINVAL etc.) so the
            // caller still gets the structured spawnFailed envelope.
            onResult(err, '', '');
        }
    });
}
// v2.4.9 review fix (gemini 🟡 + claude 🟡 + codex 🟡): widen to also accept
// `warning` lines (tsc rarely emits them but TypeScript plugins do) and to
// keep file-line-column shape compatible. The diagnostic stream's `severity`
// is added so consumers can filter — code stays the same shape otherwise.
const TSC_LINE_RE = /^(.*?)\((\d+),(\d+)\):\s+(error|warning|info)\s+(TS\d+):\s+(.*)$/i;
// Project-scope diagnostics (e.g. TS18003 "No inputs were found...") have no
// file/line/column — separately captured.
const TSC_PROJECT_LINE_RE = /^\s*(error|warning|info)\s+(TS\d+):\s+(.*)$/i;
function parseTscOutput(output) {
    if (!output)
        return [];
    const diagnostics = [];
    let last = null;
    for (const raw of output.split(/\r?\n/)) {
        const line = raw.replace(/\s+$/u, '');
        if (!line) {
            last = null;
            continue;
        }
        const m = TSC_LINE_RE.exec(line.trim());
        if (m) {
            const diag = {
                file: m[1],
                line: Number(m[2]),
                column: Number(m[3]),
                code: m[5],
                message: m[6],
            };
            diag.severity = m[4].toLowerCase();
            diagnostics.push(diag);
            last = diag;
            continue;
        }
        const pm = TSC_PROJECT_LINE_RE.exec(line.trim());
        if (pm) {
            const diag = {
                file: '',
                line: 0,
                column: 0,
                code: pm[2],
                message: pm[3],
            };
            diag.severity = pm[1].toLowerCase();
            diagnostics.push(diag);
            last = diag;
            continue;
        }
        // v2.4.9 review fix (codex 🟡): TypeScript multi-line diagnostics
        // continue with indented lines (e.g. "Type 'X' is not assignable to
        // type 'Y'.\n  Property 'a' is missing.") — append to the previous
        // diagnostic's message instead of dropping silently.
        if (last && /^\s/.test(raw)) {
            last.message = `${last.message}\n${raw.trim()}`;
        }
    }
    return diagnostics;
}
async function runScriptDiagnostics(projectPath, options = {}) {
    const tsconfigPath = findTsConfig(projectPath, options.tsconfigPath);
    if (!tsconfigPath || !exists(tsconfigPath)) {
        return {
            ok: false,
            tool: 'typescript',
            binary: '',
            tsconfigPath: tsconfigPath || '',
            exitCode: -1,
            summary: 'No tsconfig.json or temp/tsconfig.cocos.json found in project.',
            diagnostics: [],
            stdout: '',
            stderr: '',
            spawnFailed: false,
        };
    }
    const binary = findTsBinary(projectPath);
    const isNpx = /[\\/]npx(?:\.cmd)?$/i.test(binary) || binary === 'npx' || binary === 'npx.cmd';
    const args = isNpx
        ? ['tsc', '--noEmit', '-p', tsconfigPath, '--pretty', 'false']
        : ['--noEmit', '-p', tsconfigPath, '--pretty', 'false'];
    const result = await execAsync(binary, args, projectPath);
    const merged = [result.stdout, result.stderr, result.error].filter(Boolean).join('\n').trim();
    const diagnostics = parseTscOutput(merged);
    // v2.4.10 round-2 review fix (claude + codex + gemini 🟡): `ok` should
    // reflect compilation success. tsc exits 0 on warnings-only runs
    // (warnings don't fail the build); the diagnostics array carries them
    // for visibility but they shouldn't flip the boolean. Count by severity:
    // only `error` severity (default when severity is missing — pre-v2.4.10
    // diagnostics had no severity field) blocks `ok`.
    const errCount = diagnostics.filter(d => { var _a; return ((_a = d.severity) !== null && _a !== void 0 ? _a : 'error') === 'error'; }).length;
    const warnCount = diagnostics.filter(d => d.severity === 'warning').length;
    const ok = !result.spawnFailed && result.code === 0 && errCount === 0;
    let summary;
    if (result.spawnFailed) {
        summary = `tsc binary failed to spawn (${result.error || 'unknown error'}). Resolved binary: ${binary}.`;
    }
    else if (ok) {
        summary = warnCount
            ? `TypeScript diagnostics completed with no errors (${warnCount} warning(s) reported).`
            : 'TypeScript diagnostics completed with no errors.';
    }
    else if (errCount) {
        summary = warnCount
            ? `Found ${errCount} error(s), ${warnCount} warning(s).`
            : `Found ${errCount} TypeScript error(s).`;
    }
    else {
        summary = merged || `TypeScript diagnostics reported exit code ${result.code} but no parsed diagnostics.`;
    }
    return {
        ok,
        tool: 'typescript',
        binary,
        tsconfigPath,
        exitCode: result.code,
        summary,
        diagnostics,
        stdout: result.stdout,
        stderr: result.stderr,
        spawnFailed: result.spawnFailed || undefined,
        systemError: result.spawnFailed ? result.error : undefined,
    };
}
// ---- waitForCompile (harady pattern) -----------------------------------
const COMPILE_LOG_REL = path.join('temp', 'programming', 'packer-driver', 'logs', 'debug.log');
const COMPILE_MARKER = 'Target(editor) ends';
/**
 * Wait for the cocos packer-driver to log "Target(editor) ends" indicating
 * the TS compile pipeline finished. We tail the log by tracking byte
 * length at start vs poll-time. If the log doesn't grow within a grace
 * window (default 2s), we conclude no compile was triggered (clean
 * project, no recent .ts changes) and return success.
 *
 * Caller usually pairs this with a `refresh-asset` to nudge cocos into
 * detecting fresh changes; we do that as a no-fail kick before polling.
 */
async function waitForCompile(projectPath, timeoutMs = 15000) {
    var _a, _b, _c, _d;
    const logPath = path.join(projectPath, COMPILE_LOG_REL);
    if (!exists(logPath)) {
        return {
            success: false,
            compiled: false,
            waitedMs: 0,
            error: `Compile log not found at ${logPath}. Has the editor run a build pipeline yet?`,
        };
    }
    try {
        await ((_b = (_a = Editor === null || Editor === void 0 ? void 0 : Editor.Message) === null || _a === void 0 ? void 0 : _a.request) === null || _b === void 0 ? void 0 : _b.call(_a, 'asset-db', 'refresh-asset', 'db://assets'));
    }
    catch ( /* swallow — refresh is a kick, not required */_e) { /* swallow — refresh is a kick, not required */ }
    const initialSize = fs.statSync(logPath).size;
    const startTime = Date.now();
    const POLL_INTERVAL = 200;
    const DETECT_GRACE_MS = 2000;
    while (Date.now() - startTime < timeoutMs) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL));
        let currentSize;
        try {
            currentSize = fs.statSync(logPath).size;
        }
        catch (err) {
            return {
                success: false,
                compiled: false,
                waitedMs: Date.now() - startTime,
                error: `stat compile log failed: ${(_c = err === null || err === void 0 ? void 0 : err.message) !== null && _c !== void 0 ? _c : String(err)}`,
            };
        }
        if (currentSize <= initialSize) {
            if (Date.now() - startTime < DETECT_GRACE_MS)
                continue;
            return {
                success: true,
                compiled: false,
                waitedMs: Date.now() - startTime,
                note: 'No compilation triggered (no log growth within grace window).',
                logPath,
            };
        }
        const newBytes = currentSize - initialSize;
        let newContent = '';
        try {
            const fd = fs.openSync(logPath, 'r');
            try {
                const buffer = Buffer.alloc(newBytes);
                fs.readSync(fd, buffer, 0, newBytes, initialSize);
                newContent = buffer.toString('utf8');
            }
            finally {
                fs.closeSync(fd);
            }
        }
        catch (err) {
            return {
                success: false,
                compiled: false,
                waitedMs: Date.now() - startTime,
                error: `read compile log delta failed: ${(_d = err === null || err === void 0 ? void 0 : err.message) !== null && _d !== void 0 ? _d : String(err)}`,
            };
        }
        if (newContent.includes(COMPILE_MARKER)) {
            return {
                success: true,
                compiled: true,
                waitedMs: Date.now() - startTime,
                logPath,
            };
        }
    }
    return {
        success: true,
        compiled: false,
        timeout: true,
        waitedMs: timeoutMs,
        note: 'Timed out waiting for compile marker; compile may still be in progress or no recompile was needed.',
        logPath,
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHMtZGlhZ25vc3RpY3MuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvbGliL3RzLWRpYWdub3N0aWNzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQW1CRzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUF3REgsb0NBMEJDO0FBVUQsb0NBU0M7QUFtRUQsd0NBNENDO0FBRUQsb0RBK0RDO0FBMkJELHdDQWlGQztBQS9YRCx1Q0FBeUI7QUFDekIsMkNBQTZCO0FBQzdCLGlEQUF5QztBQXFDekMsU0FBUyxNQUFNLENBQUMsUUFBZ0I7SUFDNUIsSUFBSSxDQUFDO1FBQ0QsT0FBTyxFQUFFLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQ25DLENBQUM7SUFBQyxXQUFNLENBQUM7UUFDTCxPQUFPLEtBQUssQ0FBQztJQUNqQixDQUFDO0FBQ0wsQ0FBQztBQUVEOzs7Ozs7R0FNRztBQUNILFNBQWdCLFlBQVksQ0FBQyxXQUFtQjs7SUFDNUMsTUFBTSxPQUFPLEdBQUcsT0FBTyxDQUFDLFFBQVEsS0FBSyxPQUFPLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDO0lBQ2pFLE1BQU0sV0FBVyxHQUFhLEVBQUUsQ0FBQztJQUNqQyxNQUFNLFVBQVUsR0FBRyxNQUFBLE1BQUMsVUFBa0IsQ0FBQyxNQUFNLDBDQUFFLEdBQUcsMENBQUUsSUFBSSxDQUFDO0lBQ3pELElBQUksVUFBVSxFQUFFLENBQUM7UUFDYixXQUFXLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7SUFDM0QsQ0FBQztJQUNELE1BQU0sdUJBQXVCLEdBQWEsRUFBRSxDQUFDO0lBQzdDLEtBQUssTUFBTSxJQUFJLElBQUksV0FBVyxFQUFFLENBQUM7UUFDN0IsdUJBQXVCLENBQUMsSUFBSSxDQUN4QixJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxXQUFXLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxjQUFjLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxFQUM3RSxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxXQUFXLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxjQUFjLEVBQUUsWUFBWSxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsRUFDeEYsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEVBQUUsY0FBYyxFQUFFLFlBQVksRUFBRSxLQUFLLEVBQUUsS0FBSyxDQUFDLEVBQ2hGLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLFVBQVUsRUFBRSxXQUFXLEVBQUUsV0FBVyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsY0FBYyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsRUFDdEcsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsVUFBVSxFQUFFLFdBQVcsRUFBRSxXQUFXLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxjQUFjLEVBQUUsWUFBWSxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FDcEgsQ0FBQztJQUNOLENBQUM7SUFDRCxNQUFNLFVBQVUsR0FBRztRQUNmLElBQUksQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFLGNBQWMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDO1FBQ3ZELElBQUksQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFLGNBQWMsRUFBRSxZQUFZLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQztRQUNsRSxHQUFHLHVCQUF1QjtLQUM3QixDQUFDO0lBQ0YsS0FBSyxNQUFNLFNBQVMsSUFBSSxVQUFVLEVBQUUsQ0FBQztRQUNqQyxJQUFJLE1BQU0sQ0FBQyxTQUFTLENBQUM7WUFBRSxPQUFPLFNBQVMsQ0FBQztJQUM1QyxDQUFDO0lBQ0QsT0FBTyxPQUFPLENBQUMsUUFBUSxLQUFLLE9BQU8sQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUM7QUFDNUQsQ0FBQztBQUVEOzs7Ozs7O0dBT0c7QUFDSCxTQUFnQixZQUFZLENBQUMsV0FBbUIsRUFBRSxRQUFpQjs7SUFDL0QsSUFBSSxRQUFRLEVBQUUsQ0FBQztRQUNYLE9BQU8sSUFBSSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxRQUFRLENBQUMsQ0FBQztJQUNuRixDQUFDO0lBQ0QsTUFBTSxVQUFVLEdBQUc7UUFDZixJQUFJLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxlQUFlLENBQUM7UUFDdkMsSUFBSSxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsTUFBTSxFQUFFLHFCQUFxQixDQUFDO0tBQ3hELENBQUM7SUFDRixPQUFPLE1BQUEsVUFBVSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsbUNBQUksRUFBRSxDQUFDO0FBQ3pDLENBQUM7QUFJRCxTQUFTLFNBQVMsQ0FBQyxJQUFZLEVBQUUsSUFBYyxFQUFFLEdBQVc7SUFDeEQsT0FBTyxJQUFJLE9BQU8sQ0FBQyxDQUFDLE9BQU8sRUFBRSxFQUFFO1FBQzNCLE1BQU0sUUFBUSxHQUFHLENBQUMsS0FBVSxFQUFFLE1BQVcsRUFBRSxNQUFXLEVBQUUsRUFBRTtZQUN0RCxrRUFBa0U7WUFDbEUsZ0VBQWdFO1lBQ2hFLDhEQUE4RDtZQUM5RCxpRUFBaUU7WUFDakUsZ0VBQWdFO1lBQ2hFLGdFQUFnRTtZQUNoRSx3REFBd0Q7WUFDeEQsTUFBTSxPQUFPLEdBQUcsS0FBSyxhQUFMLEtBQUssdUJBQUwsS0FBSyxDQUFFLElBQUksQ0FBQztZQUM1QixNQUFNLFdBQVcsR0FBRyxPQUFPLE9BQU8sS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUM3RSxNQUFNLFdBQVcsR0FBRyxDQUFDLENBQUMsS0FBSyxJQUFJLE9BQU8sT0FBTyxLQUFLLFFBQVEsQ0FBQztZQUMzRCxPQUFPLENBQUM7Z0JBQ0osSUFBSSxFQUFFLFdBQVc7Z0JBQ2pCLE1BQU0sRUFBRSxNQUFNLENBQUMsTUFBTSxJQUFJLEVBQUUsQ0FBQztnQkFDNUIsTUFBTSxFQUFFLE1BQU0sQ0FBQyxNQUFNLElBQUksRUFBRSxDQUFDO2dCQUM1QixLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFO2dCQUNqQyxXQUFXO2FBQ2QsQ0FBQyxDQUFDO1FBQ1AsQ0FBQyxDQUFDO1FBQ0YsaUVBQWlFO1FBQ2pFLGdFQUFnRTtRQUNoRSxpRUFBaUU7UUFDakUsaUVBQWlFO1FBQ2pFLGdFQUFnRTtRQUNoRSwyREFBMkQ7UUFDM0QsZ0VBQWdFO1FBQ2hFLDZEQUE2RDtRQUM3RCxrREFBa0Q7UUFDbEQsTUFBTSxhQUFhLEdBQUcsT0FBTyxDQUFDLFFBQVEsS0FBSyxPQUFPLElBQUksZUFBZSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNqRixNQUFNLFdBQVcsR0FBRyxDQUFDLENBQVMsRUFBVSxFQUFFO1lBQ3RDLDZEQUE2RDtZQUM3RCwrREFBK0Q7WUFDL0QsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO2dCQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQ3BDLE9BQU8sR0FBRyxHQUFHLENBQUMsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxHQUFHLEdBQUcsQ0FBQztRQUM3QyxDQUFDLENBQUM7UUFDRixNQUFNLE9BQU8sR0FBRyxhQUFhLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO1FBQ3pELE1BQU0sT0FBTyxHQUFHLGFBQWEsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO1FBQzdELElBQUksQ0FBQztZQUNELElBQUEsd0JBQVEsRUFBQyxPQUFPLEVBQUUsT0FBTyxFQUFFO2dCQUN2QixHQUFHO2dCQUNILFNBQVMsRUFBRSxDQUFDLEdBQUcsSUFBSSxHQUFHLElBQUk7Z0JBQzFCLFdBQVcsRUFBRSxJQUFJO2dCQUNqQixLQUFLLEVBQUUsYUFBYTthQUN2QixFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQ2pCLENBQUM7UUFBQyxPQUFPLEdBQVEsRUFBRSxDQUFDO1lBQ2hCLDJEQUEyRDtZQUMzRCx5REFBeUQ7WUFDekQsUUFBUSxDQUFDLEdBQUcsRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDMUIsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0FBQ1AsQ0FBQztBQUVELDZFQUE2RTtBQUM3RSwyRUFBMkU7QUFDM0UsNkVBQTZFO0FBQzdFLDBFQUEwRTtBQUMxRSxNQUFNLFdBQVcsR0FBRyxtRUFBbUUsQ0FBQztBQUN4Riw2RUFBNkU7QUFDN0UsMENBQTBDO0FBQzFDLE1BQU0sbUJBQW1CLEdBQUcsOENBQThDLENBQUM7QUFFM0UsU0FBZ0IsY0FBYyxDQUFDLE1BQWM7SUFDekMsSUFBSSxDQUFDLE1BQU07UUFBRSxPQUFPLEVBQUUsQ0FBQztJQUN2QixNQUFNLFdBQVcsR0FBb0IsRUFBRSxDQUFDO0lBQ3hDLElBQUksSUFBSSxHQUF5QixJQUFJLENBQUM7SUFDdEMsS0FBSyxNQUFNLEdBQUcsSUFBSSxNQUFNLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7UUFDdEMsTUFBTSxJQUFJLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDdEMsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO1lBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztZQUFDLFNBQVM7UUFBQyxDQUFDO1FBQ3JDLE1BQU0sQ0FBQyxHQUFHLFdBQVcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7UUFDeEMsSUFBSSxDQUFDLEVBQUUsQ0FBQztZQUNKLE1BQU0sSUFBSSxHQUFrQjtnQkFDeEIsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ1YsSUFBSSxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ2xCLE1BQU0sRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNwQixJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDVixPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQzthQUNoQixDQUFDO1lBQ0QsSUFBWSxDQUFDLFFBQVEsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDNUMsV0FBVyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUN2QixJQUFJLEdBQUcsSUFBSSxDQUFDO1lBQ1osU0FBUztRQUNiLENBQUM7UUFDRCxNQUFNLEVBQUUsR0FBRyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7UUFDakQsSUFBSSxFQUFFLEVBQUUsQ0FBQztZQUNMLE1BQU0sSUFBSSxHQUFrQjtnQkFDeEIsSUFBSSxFQUFFLEVBQUU7Z0JBQ1IsSUFBSSxFQUFFLENBQUM7Z0JBQ1AsTUFBTSxFQUFFLENBQUM7Z0JBQ1QsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUM7Z0JBQ1gsT0FBTyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUM7YUFDakIsQ0FBQztZQUNELElBQVksQ0FBQyxRQUFRLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQzdDLFdBQVcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDdkIsSUFBSSxHQUFHLElBQUksQ0FBQztZQUNaLFNBQVM7UUFDYixDQUFDO1FBQ0Qsa0VBQWtFO1FBQ2xFLG9FQUFvRTtRQUNwRSxtRUFBbUU7UUFDbkUscURBQXFEO1FBQ3JELElBQUksSUFBSSxJQUFJLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUMxQixJQUFJLENBQUMsT0FBTyxHQUFHLEdBQUcsSUFBSSxDQUFDLE9BQU8sS0FBSyxHQUFHLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQztRQUNwRCxDQUFDO0lBQ0wsQ0FBQztJQUNELE9BQU8sV0FBVyxDQUFDO0FBQ3ZCLENBQUM7QUFFTSxLQUFLLFVBQVUsb0JBQW9CLENBQ3RDLFdBQW1CLEVBQ25CLFVBQXVDLEVBQUU7SUFFekMsTUFBTSxZQUFZLEdBQUcsWUFBWSxDQUFDLFdBQVcsRUFBRSxPQUFPLENBQUMsWUFBWSxDQUFDLENBQUM7SUFDckUsSUFBSSxDQUFDLFlBQVksSUFBSSxDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQUMsRUFBRSxDQUFDO1FBQ3pDLE9BQU87WUFDSCxFQUFFLEVBQUUsS0FBSztZQUNULElBQUksRUFBRSxZQUFZO1lBQ2xCLE1BQU0sRUFBRSxFQUFFO1lBQ1YsWUFBWSxFQUFFLFlBQVksSUFBSSxFQUFFO1lBQ2hDLFFBQVEsRUFBRSxDQUFDLENBQUM7WUFDWixPQUFPLEVBQUUsZ0VBQWdFO1lBQ3pFLFdBQVcsRUFBRSxFQUFFO1lBQ2YsTUFBTSxFQUFFLEVBQUU7WUFDVixNQUFNLEVBQUUsRUFBRTtZQUNWLFdBQVcsRUFBRSxLQUFLO1NBQ3JCLENBQUM7SUFDTixDQUFDO0lBQ0QsTUFBTSxNQUFNLEdBQUcsWUFBWSxDQUFDLFdBQVcsQ0FBQyxDQUFDO0lBQ3pDLE1BQU0sS0FBSyxHQUFHLHNCQUFzQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxNQUFNLEtBQUssS0FBSyxJQUFJLE1BQU0sS0FBSyxTQUFTLENBQUM7SUFDOUYsTUFBTSxJQUFJLEdBQUcsS0FBSztRQUNkLENBQUMsQ0FBQyxDQUFDLEtBQUssRUFBRSxVQUFVLEVBQUUsSUFBSSxFQUFFLFlBQVksRUFBRSxVQUFVLEVBQUUsT0FBTyxDQUFDO1FBQzlELENBQUMsQ0FBQyxDQUFDLFVBQVUsRUFBRSxJQUFJLEVBQUUsWUFBWSxFQUFFLFVBQVUsRUFBRSxPQUFPLENBQUMsQ0FBQztJQUM1RCxNQUFNLE1BQU0sR0FBRyxNQUFNLFNBQVMsQ0FBQyxNQUFNLEVBQUUsSUFBSSxFQUFFLFdBQVcsQ0FBQyxDQUFDO0lBQzFELE1BQU0sTUFBTSxHQUFHLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUMsTUFBTSxFQUFFLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO0lBQzlGLE1BQU0sV0FBVyxHQUFHLGNBQWMsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUMzQyx1RUFBdUU7SUFDdkUsaUVBQWlFO0lBQ2pFLHNFQUFzRTtJQUN0RSx5RUFBeUU7SUFDekUsd0VBQXdFO0lBQ3hFLGtEQUFrRDtJQUNsRCxNQUFNLFFBQVEsR0FBRyxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLFdBQUMsT0FBQSxDQUFDLE1BQUEsQ0FBQyxDQUFDLFFBQVEsbUNBQUksT0FBTyxDQUFDLEtBQUssT0FBTyxDQUFBLEVBQUEsQ0FBQyxDQUFDLE1BQU0sQ0FBQztJQUNyRixNQUFNLFNBQVMsR0FBRyxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFFBQVEsS0FBSyxTQUFTLENBQUMsQ0FBQyxNQUFNLENBQUM7SUFDM0UsTUFBTSxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsV0FBVyxJQUFJLE1BQU0sQ0FBQyxJQUFJLEtBQUssQ0FBQyxJQUFJLFFBQVEsS0FBSyxDQUFDLENBQUM7SUFDdEUsSUFBSSxPQUFlLENBQUM7SUFDcEIsSUFBSSxNQUFNLENBQUMsV0FBVyxFQUFFLENBQUM7UUFDckIsT0FBTyxHQUFHLCtCQUErQixNQUFNLENBQUMsS0FBSyxJQUFJLGVBQWUsdUJBQXVCLE1BQU0sR0FBRyxDQUFDO0lBQzdHLENBQUM7U0FBTSxJQUFJLEVBQUUsRUFBRSxDQUFDO1FBQ1osT0FBTyxHQUFHLFNBQVM7WUFDZixDQUFDLENBQUMsb0RBQW9ELFNBQVMsd0JBQXdCO1lBQ3ZGLENBQUMsQ0FBQyxrREFBa0QsQ0FBQztJQUM3RCxDQUFDO1NBQU0sSUFBSSxRQUFRLEVBQUUsQ0FBQztRQUNsQixPQUFPLEdBQUcsU0FBUztZQUNmLENBQUMsQ0FBQyxTQUFTLFFBQVEsY0FBYyxTQUFTLGNBQWM7WUFDeEQsQ0FBQyxDQUFDLFNBQVMsUUFBUSx1QkFBdUIsQ0FBQztJQUNuRCxDQUFDO1NBQU0sQ0FBQztRQUNKLE9BQU8sR0FBRyxNQUFNLElBQUksNkNBQTZDLE1BQU0sQ0FBQyxJQUFJLDZCQUE2QixDQUFDO0lBQzlHLENBQUM7SUFDRCxPQUFPO1FBQ0gsRUFBRTtRQUNGLElBQUksRUFBRSxZQUFZO1FBQ2xCLE1BQU07UUFDTixZQUFZO1FBQ1osUUFBUSxFQUFFLE1BQU0sQ0FBQyxJQUFJO1FBQ3JCLE9BQU87UUFDUCxXQUFXO1FBQ1gsTUFBTSxFQUFFLE1BQU0sQ0FBQyxNQUFNO1FBQ3JCLE1BQU0sRUFBRSxNQUFNLENBQUMsTUFBTTtRQUNyQixXQUFXLEVBQUUsTUFBTSxDQUFDLFdBQVcsSUFBSSxTQUFTO1FBQzVDLFdBQVcsRUFBRSxNQUFNLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxTQUFTO0tBQzdELENBQUM7QUFDTixDQUFDO0FBRUQsMkVBQTJFO0FBRTNFLE1BQU0sZUFBZSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLGFBQWEsRUFBRSxlQUFlLEVBQUUsTUFBTSxFQUFFLFdBQVcsQ0FBQyxDQUFDO0FBQy9GLE1BQU0sY0FBYyxHQUFHLHFCQUFxQixDQUFDO0FBWTdDOzs7Ozs7Ozs7R0FTRztBQUNJLEtBQUssVUFBVSxjQUFjLENBQ2hDLFdBQW1CLEVBQ25CLFlBQW9CLEtBQUs7O0lBRXpCLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFLGVBQWUsQ0FBQyxDQUFDO0lBQ3hELElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztRQUNuQixPQUFPO1lBQ0gsT0FBTyxFQUFFLEtBQUs7WUFDZCxRQUFRLEVBQUUsS0FBSztZQUNmLFFBQVEsRUFBRSxDQUFDO1lBQ1gsS0FBSyxFQUFFLDRCQUE0QixPQUFPLDRDQUE0QztTQUN6RixDQUFDO0lBQ04sQ0FBQztJQUNELElBQUksQ0FBQztRQUNELE1BQU0sQ0FBQSxNQUFBLE1BQUMsTUFBYyxhQUFkLE1BQU0sdUJBQU4sTUFBTSxDQUFVLE9BQU8sMENBQUUsT0FBTyxtREFBRyxVQUFVLEVBQUUsZUFBZSxFQUFFLGFBQWEsQ0FBQyxDQUFBLENBQUM7SUFDMUYsQ0FBQztJQUFDLFFBQVEsK0NBQStDLElBQWpELENBQUMsQ0FBQywrQ0FBK0MsQ0FBQyxDQUFDO0lBRTNELE1BQU0sV0FBVyxHQUFHLEVBQUUsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDO0lBQzlDLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztJQUM3QixNQUFNLGFBQWEsR0FBRyxHQUFHLENBQUM7SUFDMUIsTUFBTSxlQUFlLEdBQUcsSUFBSSxDQUFDO0lBRTdCLE9BQU8sSUFBSSxDQUFDLEdBQUcsRUFBRSxHQUFHLFNBQVMsR0FBRyxTQUFTLEVBQUUsQ0FBQztRQUN4QyxNQUFNLElBQUksT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLENBQUMsRUFBRSxhQUFhLENBQUMsQ0FBQyxDQUFDO1FBQ3JELElBQUksV0FBbUIsQ0FBQztRQUN4QixJQUFJLENBQUM7WUFDRCxXQUFXLEdBQUcsRUFBRSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUM7UUFDNUMsQ0FBQztRQUFDLE9BQU8sR0FBUSxFQUFFLENBQUM7WUFDaEIsT0FBTztnQkFDSCxPQUFPLEVBQUUsS0FBSztnQkFDZCxRQUFRLEVBQUUsS0FBSztnQkFDZixRQUFRLEVBQUUsSUFBSSxDQUFDLEdBQUcsRUFBRSxHQUFHLFNBQVM7Z0JBQ2hDLEtBQUssRUFBRSw0QkFBNEIsTUFBQSxHQUFHLGFBQUgsR0FBRyx1QkFBSCxHQUFHLENBQUUsT0FBTyxtQ0FBSSxNQUFNLENBQUMsR0FBRyxDQUFDLEVBQUU7YUFDbkUsQ0FBQztRQUNOLENBQUM7UUFDRCxJQUFJLFdBQVcsSUFBSSxXQUFXLEVBQUUsQ0FBQztZQUM3QixJQUFJLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxTQUFTLEdBQUcsZUFBZTtnQkFBRSxTQUFTO1lBQ3ZELE9BQU87Z0JBQ0gsT0FBTyxFQUFFLElBQUk7Z0JBQ2IsUUFBUSxFQUFFLEtBQUs7Z0JBQ2YsUUFBUSxFQUFFLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxTQUFTO2dCQUNoQyxJQUFJLEVBQUUsK0RBQStEO2dCQUNyRSxPQUFPO2FBQ1YsQ0FBQztRQUNOLENBQUM7UUFDRCxNQUFNLFFBQVEsR0FBRyxXQUFXLEdBQUcsV0FBVyxDQUFDO1FBQzNDLElBQUksVUFBVSxHQUFHLEVBQUUsQ0FBQztRQUNwQixJQUFJLENBQUM7WUFDRCxNQUFNLEVBQUUsR0FBRyxFQUFFLENBQUMsUUFBUSxDQUFDLE9BQU8sRUFBRSxHQUFHLENBQUMsQ0FBQztZQUNyQyxJQUFJLENBQUM7Z0JBQ0QsTUFBTSxNQUFNLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztnQkFDdEMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxFQUFFLEVBQUUsTUFBTSxFQUFFLENBQUMsRUFBRSxRQUFRLEVBQUUsV0FBVyxDQUFDLENBQUM7Z0JBQ2xELFVBQVUsR0FBRyxNQUFNLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ3pDLENBQUM7b0JBQVMsQ0FBQztnQkFDUCxFQUFFLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ3JCLENBQUM7UUFDTCxDQUFDO1FBQUMsT0FBTyxHQUFRLEVBQUUsQ0FBQztZQUNoQixPQUFPO2dCQUNILE9BQU8sRUFBRSxLQUFLO2dCQUNkLFFBQVEsRUFBRSxLQUFLO2dCQUNmLFFBQVEsRUFBRSxJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcsU0FBUztnQkFDaEMsS0FBSyxFQUFFLGtDQUFrQyxNQUFBLEdBQUcsYUFBSCxHQUFHLHVCQUFILEdBQUcsQ0FBRSxPQUFPLG1DQUFJLE1BQU0sQ0FBQyxHQUFHLENBQUMsRUFBRTthQUN6RSxDQUFDO1FBQ04sQ0FBQztRQUNELElBQUksVUFBVSxDQUFDLFFBQVEsQ0FBQyxjQUFjLENBQUMsRUFBRSxDQUFDO1lBQ3RDLE9BQU87Z0JBQ0gsT0FBTyxFQUFFLElBQUk7Z0JBQ2IsUUFBUSxFQUFFLElBQUk7Z0JBQ2QsUUFBUSxFQUFFLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxTQUFTO2dCQUNoQyxPQUFPO2FBQ1YsQ0FBQztRQUNOLENBQUM7SUFDTCxDQUFDO0lBQ0QsT0FBTztRQUNILE9BQU8sRUFBRSxJQUFJO1FBQ2IsUUFBUSxFQUFFLEtBQUs7UUFDZixPQUFPLEVBQUUsSUFBSTtRQUNiLFFBQVEsRUFBRSxTQUFTO1FBQ25CLElBQUksRUFBRSxvR0FBb0c7UUFDMUcsT0FBTztLQUNWLENBQUM7QUFDTixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiB0cy1kaWFnbm9zdGljcyDigJQgaG9zdC1zaWRlIFR5cGVTY3JpcHQgZGlhZ25vc3RpY3MgKyBjb21waWxlLXdhaXQgaGVscGVycy5cbiAqXG4gKiBUaHJlZSBwaWVjZXMsIHVzZWQgYnkgZGVidWctdG9vbHMudHM6XG4gKiAgIC0gZmluZFRzQmluYXJ5KHByb2plY3RQYXRoKTogbG9jYXRlIGB0c2NgIChwcm9qZWN0IG5vZGVfbW9kdWxlcyDihpIgZWRpdG9yXG4gKiAgICAgYnVuZGxlZCBlbmdpbmUg4oaSIG5weCBmYWxsYmFjaylcbiAqICAgLSBmaW5kVHNDb25maWcocHJvamVjdFBhdGgsIGV4cGxpY2l0Pyk6IGxvY2F0ZSB0c2NvbmZpZy5qc29uIChvclxuICogICAgIHRlbXAvdHNjb25maWcuY29jb3MuanNvbiB3aGljaCBjb2NvcyBnZW5lcmF0ZXMgZm9yIHRoZSBlZGl0b3IpXG4gKiAgIC0gcnVuU2NyaXB0RGlhZ25vc3RpY3MocHJvamVjdFBhdGgsIG9wdHMpOiBydW4gYHRzYyAtLW5vRW1pdCAtcCAuLi5gLFxuICogICAgIHBhcnNlIHRoZSBvdXRwdXQgaW50byBzdHJ1Y3R1cmVkIGRpYWdub3N0aWNzLlxuICogICAtIHdhaXRGb3JDb21waWxlKHByb2plY3RQYXRoLCB0aW1lb3V0TXMpOiB0YWlsXG4gKiAgICAgdGVtcC9wcm9ncmFtbWluZy9wYWNrZXItZHJpdmVyL2xvZ3MvZGVidWcubG9nIGZvciBjb2NvcydzXG4gKiAgICAgYFRhcmdldChlZGl0b3IpIGVuZHNgIG1hcmtlci5cbiAqXG4gKiBTb3VyY2VzOlxuICogICAtIEZ1bnBsYXlBSS9mdW5wbGF5LWNvY29zLW1jcCBsaWIvZGlhZ25vc3RpY3MuanMgKGJpbmFyeSBkaXNjb3ZlcnlcbiAqICAgICArIHRzYyBvdXRwdXQgcGFyc2VyKVxuICogICAtIGhhcmFkeS9jb2Nvcy1jcmVhdG9yLW1jcCBzb3VyY2UvdG9vbHMvZGVidWctdG9vbHMudHM6d2FpdENvbXBpbGVcbiAqICAgICAobG9nLXNpemUgZGVsdGEgKyBtYXJrZXItc3RyaW5nIGRldGVjdGlvbiBwYXR0ZXJuKVxuICovXG5cbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgeyBleGVjRmlsZSB9IGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFRzY0RpYWdub3N0aWMge1xuICAgIGZpbGU6IHN0cmluZztcbiAgICBsaW5lOiBudW1iZXI7XG4gICAgY29sdW1uOiBudW1iZXI7XG4gICAgY29kZTogc3RyaW5nO1xuICAgIG1lc3NhZ2U6IHN0cmluZztcbiAgICBzZXZlcml0eT86ICdlcnJvcicgfCAnd2FybmluZycgfCAnaW5mbyc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUnVuU2NyaXB0RGlhZ25vc3RpY3NPcHRpb25zIHtcbiAgICAvKiogT3B0aW9uYWwgb3ZlcnJpZGUgcGF0aCAoYWJzb2x1dGUgb3IgcmVsYXRpdmUgdG8gcHJvamVjdCByb290KS4gKi9cbiAgICB0c2NvbmZpZ1BhdGg/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUnVuU2NyaXB0RGlhZ25vc3RpY3NSZXN1bHQge1xuICAgIG9rOiBib29sZWFuO1xuICAgIHRvb2w6ICd0eXBlc2NyaXB0JztcbiAgICBiaW5hcnk6IHN0cmluZztcbiAgICB0c2NvbmZpZ1BhdGg6IHN0cmluZztcbiAgICBleGl0Q29kZTogbnVtYmVyO1xuICAgIHN1bW1hcnk6IHN0cmluZztcbiAgICBkaWFnbm9zdGljczogVHNjRGlhZ25vc3RpY1tdO1xuICAgIC8qKiBSYXcgc3Rkb3V0IOKAlCBrZXB0IGZvciBkZWJ1Z2dpbmcgdHNjIG91dHB1dCB0aGUgcGFyc2VyIG1pc3NlZC4gKi9cbiAgICBzdGRvdXQ6IHN0cmluZztcbiAgICAvKiogUmF3IHN0ZGVyciDigJQga2VwdCBmb3IgZGVidWdnaW5nIHRzYyBvdXRwdXQgdGhlIHBhcnNlciBtaXNzZWQuICovXG4gICAgc3RkZXJyOiBzdHJpbmc7XG4gICAgLyoqIHYyLjQuOTogc3VyZmFjZXMgc3Bhd24gZmFpbHVyZXMgKEVOT0VOVCBldGMuKSBzbyBBSSBzZWVzIGJpbmFyeSBwcm9ibGVtc1xuICAgICAqICBzZXBhcmF0ZWx5IGZyb20gY29tcGlsZSBlcnJvcnMuIEVtcHR5IHdoZW4gdHNjIGFjdHVhbGx5IHJhbi4gKi9cbiAgICBzeXN0ZW1FcnJvcj86IHN0cmluZztcbiAgICAvKiogdjIuNC45OiB0cnVlIHdoZW4gZXhlY0ZpbGUgcmVwb3J0ZWQgYSBub24tbnVtZXJpYyBlcnJvci5jb2RlIChiaW5hcnlcbiAgICAgKiAgbm90IGZvdW5kIC8gbm90IGV4ZWN1dGFibGUgLyBFQUNDRVMpLiBEaXN0aW5jdCBmcm9tIGEgbm9ybWFsIG5vbi16ZXJvXG4gICAgICogIGV4aXQgKGNvbXBpbGUgZXJyb3JzKS4gKi9cbiAgICBzcGF3bkZhaWxlZD86IGJvb2xlYW47XG59XG5cbmZ1bmN0aW9uIGV4aXN0cyhmaWxlUGF0aDogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgdHJ5IHtcbiAgICAgICAgcmV0dXJuIGZzLmV4aXN0c1N5bmMoZmlsZVBhdGgpO1xuICAgIH0gY2F0Y2gge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxufVxuXG4vKipcbiAqIExvY2F0ZSB0aGUgdHlwZXNjcmlwdCBjb21waWxlciBiaW5hcnkuIFByZWZlcmVuY2Ugb3JkZXI6XG4gKiAgIDEuIHByb2plY3Qgbm9kZV9tb2R1bGVzLy5iaW4vdHNjKC5jbWQpXG4gKiAgIDIuIHByb2plY3Qgbm9kZV9tb2R1bGVzL3R5cGVzY3JpcHQvYmluL3RzY1xuICogICAzLiBlZGl0b3IncyBidW5kbGVkIGVuZ2luZSBub2RlX21vZHVsZXMvLmJpbi90c2NcbiAqICAgNC4gbnB4IChmYWxsYmFjayDigJQgc2xvdyBmaXJzdCBydW4sIGJ1dCBhbHdheXMgcHJlc2VudClcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZpbmRUc0JpbmFyeShwcm9qZWN0UGF0aDogc3RyaW5nKTogc3RyaW5nIHtcbiAgICBjb25zdCB0c2NOYW1lID0gcHJvY2Vzcy5wbGF0Zm9ybSA9PT0gJ3dpbjMyJyA/ICd0c2MuY21kJyA6ICd0c2MnO1xuICAgIGNvbnN0IGVkaXRvclJvb3RzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGNvbnN0IGVkaXRvclBhdGggPSAoZ2xvYmFsVGhpcyBhcyBhbnkpLkVkaXRvcj8uQXBwPy5wYXRoO1xuICAgIGlmIChlZGl0b3JQYXRoKSB7XG4gICAgICAgIGVkaXRvclJvb3RzLnB1c2goZWRpdG9yUGF0aCwgcGF0aC5kaXJuYW1lKGVkaXRvclBhdGgpKTtcbiAgICB9XG4gICAgY29uc3QgZWRpdG9yQnVuZGxlZENhbmRpZGF0ZXM6IHN0cmluZ1tdID0gW107XG4gICAgZm9yIChjb25zdCByb290IG9mIGVkaXRvclJvb3RzKSB7XG4gICAgICAgIGVkaXRvckJ1bmRsZWRDYW5kaWRhdGVzLnB1c2goXG4gICAgICAgICAgICBwYXRoLmpvaW4ocm9vdCwgJ3Jlc291cmNlcycsICczZCcsICdlbmdpbmUnLCAnbm9kZV9tb2R1bGVzJywgJy5iaW4nLCB0c2NOYW1lKSxcbiAgICAgICAgICAgIHBhdGguam9pbihyb290LCAncmVzb3VyY2VzJywgJzNkJywgJ2VuZ2luZScsICdub2RlX21vZHVsZXMnLCAndHlwZXNjcmlwdCcsICdiaW4nLCAndHNjJyksXG4gICAgICAgICAgICBwYXRoLmpvaW4ocm9vdCwgJ2FwcC5hc2FyLnVucGFja2VkJywgJ25vZGVfbW9kdWxlcycsICd0eXBlc2NyaXB0JywgJ2JpbicsICd0c2MnKSxcbiAgICAgICAgICAgIHBhdGguam9pbihyb290LCAnQ29udGVudHMnLCAnUmVzb3VyY2VzJywgJ3Jlc291cmNlcycsICczZCcsICdlbmdpbmUnLCAnbm9kZV9tb2R1bGVzJywgJy5iaW4nLCB0c2NOYW1lKSxcbiAgICAgICAgICAgIHBhdGguam9pbihyb290LCAnQ29udGVudHMnLCAnUmVzb3VyY2VzJywgJ3Jlc291cmNlcycsICczZCcsICdlbmdpbmUnLCAnbm9kZV9tb2R1bGVzJywgJ3R5cGVzY3JpcHQnLCAnYmluJywgJ3RzYycpLFxuICAgICAgICApO1xuICAgIH1cbiAgICBjb25zdCBjYW5kaWRhdGVzID0gW1xuICAgICAgICBwYXRoLmpvaW4ocHJvamVjdFBhdGgsICdub2RlX21vZHVsZXMnLCAnLmJpbicsIHRzY05hbWUpLFxuICAgICAgICBwYXRoLmpvaW4ocHJvamVjdFBhdGgsICdub2RlX21vZHVsZXMnLCAndHlwZXNjcmlwdCcsICdiaW4nLCAndHNjJyksXG4gICAgICAgIC4uLmVkaXRvckJ1bmRsZWRDYW5kaWRhdGVzLFxuICAgIF07XG4gICAgZm9yIChjb25zdCBjYW5kaWRhdGUgb2YgY2FuZGlkYXRlcykge1xuICAgICAgICBpZiAoZXhpc3RzKGNhbmRpZGF0ZSkpIHJldHVybiBjYW5kaWRhdGU7XG4gICAgfVxuICAgIHJldHVybiBwcm9jZXNzLnBsYXRmb3JtID09PSAnd2luMzInID8gJ25weC5jbWQnIDogJ25weCc7XG59XG5cbi8qKlxuICogTG9jYXRlIHRoZSB0c2NvbmZpZyB0byB1c2UuIFByZWZlcmVuY2Ugb3JkZXI6XG4gKiAgIDEuIGV4cGxpY2l0IHBhdGggcGFzc2VkIGJ5IGNhbGxlclxuICogICAyLiA8cHJvamVjdD4vdHNjb25maWcuanNvblxuICogICAzLiA8cHJvamVjdD4vdGVtcC90c2NvbmZpZy5jb2Nvcy5qc29uIChjb2NvcyBhdXRvLWdlbmVyYXRlcyB0aGlzIGZvclxuICogICAgICB0aGUgZWRpdG9yJ3MgVFMgcGlwZWxpbmU7IGF2YWlsYWJsZSBldmVuIGlmIHVzZXIgaGFzIG5vIHRvcC1sZXZlbFxuICogICAgICB0c2NvbmZpZy5qc29uKVxuICovXG5leHBvcnQgZnVuY3Rpb24gZmluZFRzQ29uZmlnKHByb2plY3RQYXRoOiBzdHJpbmcsIGV4cGxpY2l0Pzogc3RyaW5nKTogc3RyaW5nIHwgJycge1xuICAgIGlmIChleHBsaWNpdCkge1xuICAgICAgICByZXR1cm4gcGF0aC5pc0Fic29sdXRlKGV4cGxpY2l0KSA/IGV4cGxpY2l0IDogcGF0aC5qb2luKHByb2plY3RQYXRoLCBleHBsaWNpdCk7XG4gICAgfVxuICAgIGNvbnN0IGNhbmRpZGF0ZXMgPSBbXG4gICAgICAgIHBhdGguam9pbihwcm9qZWN0UGF0aCwgJ3RzY29uZmlnLmpzb24nKSxcbiAgICAgICAgcGF0aC5qb2luKHByb2plY3RQYXRoLCAndGVtcCcsICd0c2NvbmZpZy5jb2Nvcy5qc29uJyksXG4gICAgXTtcbiAgICByZXR1cm4gY2FuZGlkYXRlcy5maW5kKGV4aXN0cykgPz8gJyc7XG59XG5cbmludGVyZmFjZSBFeGVjUmVzdWx0IHsgY29kZTogbnVtYmVyOyBzdGRvdXQ6IHN0cmluZzsgc3RkZXJyOiBzdHJpbmc7IGVycm9yOiBzdHJpbmc7IHNwYXduRmFpbGVkOiBib29sZWFuOyB9XG5cbmZ1bmN0aW9uIGV4ZWNBc3luYyhmaWxlOiBzdHJpbmcsIGFyZ3M6IHN0cmluZ1tdLCBjd2Q6IHN0cmluZyk6IFByb21pc2U8RXhlY1Jlc3VsdD4ge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICBjb25zdCBvblJlc3VsdCA9IChlcnJvcjogYW55LCBzdGRvdXQ6IGFueSwgc3RkZXJyOiBhbnkpID0+IHtcbiAgICAgICAgICAgIC8vIHYyLjQuOSByZXZpZXcgZml4IChjbGF1ZGUgKyBjb2RleCDwn5S0KTogYSBub24tbnVtZXJpYyBlcnJvci5jb2RlXG4gICAgICAgICAgICAvLyAoZS5nLiAnRU5PRU5UJyB3aGVuIHRoZSByZXNvbHZlZCB0c2MgYmluYXJ5IGRvZXNuJ3QgZXhpc3QsIG9yXG4gICAgICAgICAgICAvLyAnRUlOVkFMJyBvbiBOb2RlIDIyKyB3aGVuIGV4ZWNGaWxlIGlzIGNhbGxlZCBhZ2FpbnN0IGEgLmNtZFxuICAgICAgICAgICAgLy8gc2hpbSB3aXRob3V0IHNoZWxsOnRydWUpIHdhcyBwcmV2aW91c2x5IGNvZXJjZWQgdG8gMCDihpIgb2s6dHJ1ZVxuICAgICAgICAgICAgLy8gd2l0aCBlbXB0eSBkaWFnbm9zdGljcyDihpIgQUkgZmFsc2VseSBzZWVzIFwibm8gZXJyb3JzXCIgd2hlbiB0c2NcbiAgICAgICAgICAgIC8vIG5ldmVyIHJhbi4gVHJlYXQgYW55IGVycm9yIHdpdGggYSBub24tbnVtZXJpYyBjb2RlIGFzIGEgc3Bhd25cbiAgICAgICAgICAgIC8vIGZhaWx1cmUgKGNvZGU9LTEpIGFuZCBmb3JjZSB0aGUgY2FsbGVyIHRvIHN1cmZhY2UgaXQuXG4gICAgICAgICAgICBjb25zdCByYXdDb2RlID0gZXJyb3I/LmNvZGU7XG4gICAgICAgICAgICBjb25zdCBudW1lcmljQ29kZSA9IHR5cGVvZiByYXdDb2RlID09PSAnbnVtYmVyJyA/IHJhd0NvZGUgOiAoZXJyb3IgPyAtMSA6IDApO1xuICAgICAgICAgICAgY29uc3Qgc3Bhd25GYWlsZWQgPSAhIWVycm9yICYmIHR5cGVvZiByYXdDb2RlICE9PSAnbnVtYmVyJztcbiAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgIGNvZGU6IG51bWVyaWNDb2RlLFxuICAgICAgICAgICAgICAgIHN0ZG91dDogU3RyaW5nKHN0ZG91dCB8fCAnJyksXG4gICAgICAgICAgICAgICAgc3RkZXJyOiBTdHJpbmcoc3RkZXJyIHx8ICcnKSxcbiAgICAgICAgICAgICAgICBlcnJvcjogZXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJycsXG4gICAgICAgICAgICAgICAgc3Bhd25GYWlsZWQsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfTtcbiAgICAgICAgLy8gdjIuNC4xMiBsaXZlLXJldGVzdCBmaXg6IE5vZGUgMjIrIHJlZnVzZXMgdG8gc3Bhd24gLmNtZCAvIC5iYXRcbiAgICAgICAgLy8gZmlsZXMgdmlhIGV4ZWNGaWxlIHdpdGhvdXQgc2hlbGw6dHJ1ZSAoQ1ZFLTIwMjQtMjc5ODAgcGF0Y2gpLlxuICAgICAgICAvLyBUaGUgdmFsaWRhdGlvbiB0aHJvd3MgU1lOQ0hST05PVVNMWSBpbnNpZGUgdGhlIGV4ZWN1dG9yIGJlZm9yZVxuICAgICAgICAvLyB0aGUgY2FsbGJhY2sgY2FuIHJ1biwgc28gd2l0aG91dCB0cnkvY2F0Y2ggdGhlIFByb21pc2UgcmVqZWN0c1xuICAgICAgICAvLyBhbmQgdGhlIGNhbGxlcidzIG91dGVyIGNhdGNoIHJldHVybnMgYSBnZW5lcmljIFwic3Bhd24gRUlOVkFMXCJcbiAgICAgICAgLy8gZXJyb3IgaW5zdGVhZCBvZiBvdXIgc3RydWN0dXJlZCBzcGF3bkZhaWxlZCBlbnZlbG9wZS4gT25cbiAgICAgICAgLy8gV2luZG93cyAuY21kLy5iYXQgd2UgdXNlIHNoZWxsOnRydWUgdG8gcm91dGUgdGhyb3VnaCBjbWQuZXhlO1xuICAgICAgICAvLyBzaGVsbDp0cnVlIHJlcXVpcmVzIHVzIHRvIHF1b3RlIGFyZ3MgbWFudWFsbHkgYmVjYXVzZSBOb2RlXG4gICAgICAgIC8vIGRvZXNuJ3QgYXV0by1xdW90ZSB3aGVuIHRoZSBzaGVsbCBvcHRpb24gaXMgb24uXG4gICAgICAgIGNvbnN0IGlzV2luZG93c1NoaW0gPSBwcm9jZXNzLnBsYXRmb3JtID09PSAnd2luMzInICYmIC9cXC4oY21kfGJhdCkkL2kudGVzdChmaWxlKTtcbiAgICAgICAgY29uc3QgcXVvdGVGb3JDbWQgPSAoczogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgICAgICAgICAgIC8vIFF1b3RlIG9ubHkgaWYgdGhlIGFyZyBjb250YWlucyB3aGl0ZXNwYWNlIG9yIHNoZWxsLXNwZWNpYWxcbiAgICAgICAgICAgIC8vIGNoYXJhY3RlcnM7IGRvdWJsZSBpbnRlcm5hbCBxdW90ZXMgcGVyIGNtZC5leGUgZXNjYXBlIHJ1bGVzLlxuICAgICAgICAgICAgaWYgKCEvW1xcc1wiJjw+fF5dLy50ZXN0KHMpKSByZXR1cm4gcztcbiAgICAgICAgICAgIHJldHVybiAnXCInICsgcy5yZXBsYWNlKC9cIi9nLCAnXCJcIicpICsgJ1wiJztcbiAgICAgICAgfTtcbiAgICAgICAgY29uc3QgZmlsZUFyZyA9IGlzV2luZG93c1NoaW0gPyBxdW90ZUZvckNtZChmaWxlKSA6IGZpbGU7XG4gICAgICAgIGNvbnN0IGFyZ3NBcmcgPSBpc1dpbmRvd3NTaGltID8gYXJncy5tYXAocXVvdGVGb3JDbWQpIDogYXJncztcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGV4ZWNGaWxlKGZpbGVBcmcsIGFyZ3NBcmcsIHtcbiAgICAgICAgICAgICAgICBjd2QsXG4gICAgICAgICAgICAgICAgbWF4QnVmZmVyOiA4ICogMTAyNCAqIDEwMjQsXG4gICAgICAgICAgICAgICAgd2luZG93c0hpZGU6IHRydWUsXG4gICAgICAgICAgICAgICAgc2hlbGw6IGlzV2luZG93c1NoaW0sXG4gICAgICAgICAgICB9LCBvblJlc3VsdCk7XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICAvLyBDYXRjaCBzeW5jaHJvbm91cyB2YWxpZGF0aW9uIGVycm9ycyAoRUlOVkFMIGV0Yy4pIHNvIHRoZVxuICAgICAgICAgICAgLy8gY2FsbGVyIHN0aWxsIGdldHMgdGhlIHN0cnVjdHVyZWQgc3Bhd25GYWlsZWQgZW52ZWxvcGUuXG4gICAgICAgICAgICBvblJlc3VsdChlcnIsICcnLCAnJyk7XG4gICAgICAgIH1cbiAgICB9KTtcbn1cblxuLy8gdjIuNC45IHJldmlldyBmaXggKGdlbWluaSDwn5+hICsgY2xhdWRlIPCfn6EgKyBjb2RleCDwn5+hKTogd2lkZW4gdG8gYWxzbyBhY2NlcHRcbi8vIGB3YXJuaW5nYCBsaW5lcyAodHNjIHJhcmVseSBlbWl0cyB0aGVtIGJ1dCBUeXBlU2NyaXB0IHBsdWdpbnMgZG8pIGFuZCB0b1xuLy8ga2VlcCBmaWxlLWxpbmUtY29sdW1uIHNoYXBlIGNvbXBhdGlibGUuIFRoZSBkaWFnbm9zdGljIHN0cmVhbSdzIGBzZXZlcml0eWBcbi8vIGlzIGFkZGVkIHNvIGNvbnN1bWVycyBjYW4gZmlsdGVyIOKAlCBjb2RlIHN0YXlzIHRoZSBzYW1lIHNoYXBlIG90aGVyd2lzZS5cbmNvbnN0IFRTQ19MSU5FX1JFID0gL14oLio/KVxcKChcXGQrKSwoXFxkKylcXCk6XFxzKyhlcnJvcnx3YXJuaW5nfGluZm8pXFxzKyhUU1xcZCspOlxccysoLiopJC9pO1xuLy8gUHJvamVjdC1zY29wZSBkaWFnbm9zdGljcyAoZS5nLiBUUzE4MDAzIFwiTm8gaW5wdXRzIHdlcmUgZm91bmQuLi5cIikgaGF2ZSBub1xuLy8gZmlsZS9saW5lL2NvbHVtbiDigJQgc2VwYXJhdGVseSBjYXB0dXJlZC5cbmNvbnN0IFRTQ19QUk9KRUNUX0xJTkVfUkUgPSAvXlxccyooZXJyb3J8d2FybmluZ3xpbmZvKVxccysoVFNcXGQrKTpcXHMrKC4qKSQvaTtcblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlVHNjT3V0cHV0KG91dHB1dDogc3RyaW5nKTogVHNjRGlhZ25vc3RpY1tdIHtcbiAgICBpZiAoIW91dHB1dCkgcmV0dXJuIFtdO1xuICAgIGNvbnN0IGRpYWdub3N0aWNzOiBUc2NEaWFnbm9zdGljW10gPSBbXTtcbiAgICBsZXQgbGFzdDogVHNjRGlhZ25vc3RpYyB8IG51bGwgPSBudWxsO1xuICAgIGZvciAoY29uc3QgcmF3IG9mIG91dHB1dC5zcGxpdCgvXFxyP1xcbi8pKSB7XG4gICAgICAgIGNvbnN0IGxpbmUgPSByYXcucmVwbGFjZSgvXFxzKyQvdSwgJycpO1xuICAgICAgICBpZiAoIWxpbmUpIHsgbGFzdCA9IG51bGw7IGNvbnRpbnVlOyB9XG4gICAgICAgIGNvbnN0IG0gPSBUU0NfTElORV9SRS5leGVjKGxpbmUudHJpbSgpKTtcbiAgICAgICAgaWYgKG0pIHtcbiAgICAgICAgICAgIGNvbnN0IGRpYWc6IFRzY0RpYWdub3N0aWMgPSB7XG4gICAgICAgICAgICAgICAgZmlsZTogbVsxXSxcbiAgICAgICAgICAgICAgICBsaW5lOiBOdW1iZXIobVsyXSksXG4gICAgICAgICAgICAgICAgY29sdW1uOiBOdW1iZXIobVszXSksXG4gICAgICAgICAgICAgICAgY29kZTogbVs1XSxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiBtWzZdLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIChkaWFnIGFzIGFueSkuc2V2ZXJpdHkgPSBtWzRdLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICBkaWFnbm9zdGljcy5wdXNoKGRpYWcpO1xuICAgICAgICAgICAgbGFzdCA9IGRpYWc7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBwbSA9IFRTQ19QUk9KRUNUX0xJTkVfUkUuZXhlYyhsaW5lLnRyaW0oKSk7XG4gICAgICAgIGlmIChwbSkge1xuICAgICAgICAgICAgY29uc3QgZGlhZzogVHNjRGlhZ25vc3RpYyA9IHtcbiAgICAgICAgICAgICAgICBmaWxlOiAnJyxcbiAgICAgICAgICAgICAgICBsaW5lOiAwLFxuICAgICAgICAgICAgICAgIGNvbHVtbjogMCxcbiAgICAgICAgICAgICAgICBjb2RlOiBwbVsyXSxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiBwbVszXSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICAoZGlhZyBhcyBhbnkpLnNldmVyaXR5ID0gcG1bMV0udG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgIGRpYWdub3N0aWNzLnB1c2goZGlhZyk7XG4gICAgICAgICAgICBsYXN0ID0gZGlhZztcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIC8vIHYyLjQuOSByZXZpZXcgZml4IChjb2RleCDwn5+hKTogVHlwZVNjcmlwdCBtdWx0aS1saW5lIGRpYWdub3N0aWNzXG4gICAgICAgIC8vIGNvbnRpbnVlIHdpdGggaW5kZW50ZWQgbGluZXMgKGUuZy4gXCJUeXBlICdYJyBpcyBub3QgYXNzaWduYWJsZSB0b1xuICAgICAgICAvLyB0eXBlICdZJy5cXG4gIFByb3BlcnR5ICdhJyBpcyBtaXNzaW5nLlwiKSDigJQgYXBwZW5kIHRvIHRoZSBwcmV2aW91c1xuICAgICAgICAvLyBkaWFnbm9zdGljJ3MgbWVzc2FnZSBpbnN0ZWFkIG9mIGRyb3BwaW5nIHNpbGVudGx5LlxuICAgICAgICBpZiAobGFzdCAmJiAvXlxccy8udGVzdChyYXcpKSB7XG4gICAgICAgICAgICBsYXN0Lm1lc3NhZ2UgPSBgJHtsYXN0Lm1lc3NhZ2V9XFxuJHtyYXcudHJpbSgpfWA7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGRpYWdub3N0aWNzO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcnVuU2NyaXB0RGlhZ25vc3RpY3MoXG4gICAgcHJvamVjdFBhdGg6IHN0cmluZyxcbiAgICBvcHRpb25zOiBSdW5TY3JpcHREaWFnbm9zdGljc09wdGlvbnMgPSB7fSxcbik6IFByb21pc2U8UnVuU2NyaXB0RGlhZ25vc3RpY3NSZXN1bHQ+IHtcbiAgICBjb25zdCB0c2NvbmZpZ1BhdGggPSBmaW5kVHNDb25maWcocHJvamVjdFBhdGgsIG9wdGlvbnMudHNjb25maWdQYXRoKTtcbiAgICBpZiAoIXRzY29uZmlnUGF0aCB8fCAhZXhpc3RzKHRzY29uZmlnUGF0aCkpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIG9rOiBmYWxzZSxcbiAgICAgICAgICAgIHRvb2w6ICd0eXBlc2NyaXB0JyxcbiAgICAgICAgICAgIGJpbmFyeTogJycsXG4gICAgICAgICAgICB0c2NvbmZpZ1BhdGg6IHRzY29uZmlnUGF0aCB8fCAnJyxcbiAgICAgICAgICAgIGV4aXRDb2RlOiAtMSxcbiAgICAgICAgICAgIHN1bW1hcnk6ICdObyB0c2NvbmZpZy5qc29uIG9yIHRlbXAvdHNjb25maWcuY29jb3MuanNvbiBmb3VuZCBpbiBwcm9qZWN0LicsXG4gICAgICAgICAgICBkaWFnbm9zdGljczogW10sXG4gICAgICAgICAgICBzdGRvdXQ6ICcnLFxuICAgICAgICAgICAgc3RkZXJyOiAnJyxcbiAgICAgICAgICAgIHNwYXduRmFpbGVkOiBmYWxzZSxcbiAgICAgICAgfTtcbiAgICB9XG4gICAgY29uc3QgYmluYXJ5ID0gZmluZFRzQmluYXJ5KHByb2plY3RQYXRoKTtcbiAgICBjb25zdCBpc05weCA9IC9bXFxcXC9dbnB4KD86XFwuY21kKT8kL2kudGVzdChiaW5hcnkpIHx8IGJpbmFyeSA9PT0gJ25weCcgfHwgYmluYXJ5ID09PSAnbnB4LmNtZCc7XG4gICAgY29uc3QgYXJncyA9IGlzTnB4XG4gICAgICAgID8gWyd0c2MnLCAnLS1ub0VtaXQnLCAnLXAnLCB0c2NvbmZpZ1BhdGgsICctLXByZXR0eScsICdmYWxzZSddXG4gICAgICAgIDogWyctLW5vRW1pdCcsICctcCcsIHRzY29uZmlnUGF0aCwgJy0tcHJldHR5JywgJ2ZhbHNlJ107XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZXhlY0FzeW5jKGJpbmFyeSwgYXJncywgcHJvamVjdFBhdGgpO1xuICAgIGNvbnN0IG1lcmdlZCA9IFtyZXN1bHQuc3Rkb3V0LCByZXN1bHQuc3RkZXJyLCByZXN1bHQuZXJyb3JdLmZpbHRlcihCb29sZWFuKS5qb2luKCdcXG4nKS50cmltKCk7XG4gICAgY29uc3QgZGlhZ25vc3RpY3MgPSBwYXJzZVRzY091dHB1dChtZXJnZWQpO1xuICAgIC8vIHYyLjQuMTAgcm91bmQtMiByZXZpZXcgZml4IChjbGF1ZGUgKyBjb2RleCArIGdlbWluaSDwn5+hKTogYG9rYCBzaG91bGRcbiAgICAvLyByZWZsZWN0IGNvbXBpbGF0aW9uIHN1Y2Nlc3MuIHRzYyBleGl0cyAwIG9uIHdhcm5pbmdzLW9ubHkgcnVuc1xuICAgIC8vICh3YXJuaW5ncyBkb24ndCBmYWlsIHRoZSBidWlsZCk7IHRoZSBkaWFnbm9zdGljcyBhcnJheSBjYXJyaWVzIHRoZW1cbiAgICAvLyBmb3IgdmlzaWJpbGl0eSBidXQgdGhleSBzaG91bGRuJ3QgZmxpcCB0aGUgYm9vbGVhbi4gQ291bnQgYnkgc2V2ZXJpdHk6XG4gICAgLy8gb25seSBgZXJyb3JgIHNldmVyaXR5IChkZWZhdWx0IHdoZW4gc2V2ZXJpdHkgaXMgbWlzc2luZyDigJQgcHJlLXYyLjQuMTBcbiAgICAvLyBkaWFnbm9zdGljcyBoYWQgbm8gc2V2ZXJpdHkgZmllbGQpIGJsb2NrcyBgb2tgLlxuICAgIGNvbnN0IGVyckNvdW50ID0gZGlhZ25vc3RpY3MuZmlsdGVyKGQgPT4gKGQuc2V2ZXJpdHkgPz8gJ2Vycm9yJykgPT09ICdlcnJvcicpLmxlbmd0aDtcbiAgICBjb25zdCB3YXJuQ291bnQgPSBkaWFnbm9zdGljcy5maWx0ZXIoZCA9PiBkLnNldmVyaXR5ID09PSAnd2FybmluZycpLmxlbmd0aDtcbiAgICBjb25zdCBvayA9ICFyZXN1bHQuc3Bhd25GYWlsZWQgJiYgcmVzdWx0LmNvZGUgPT09IDAgJiYgZXJyQ291bnQgPT09IDA7XG4gICAgbGV0IHN1bW1hcnk6IHN0cmluZztcbiAgICBpZiAocmVzdWx0LnNwYXduRmFpbGVkKSB7XG4gICAgICAgIHN1bW1hcnkgPSBgdHNjIGJpbmFyeSBmYWlsZWQgdG8gc3Bhd24gKCR7cmVzdWx0LmVycm9yIHx8ICd1bmtub3duIGVycm9yJ30pLiBSZXNvbHZlZCBiaW5hcnk6ICR7YmluYXJ5fS5gO1xuICAgIH0gZWxzZSBpZiAob2spIHtcbiAgICAgICAgc3VtbWFyeSA9IHdhcm5Db3VudFxuICAgICAgICAgICAgPyBgVHlwZVNjcmlwdCBkaWFnbm9zdGljcyBjb21wbGV0ZWQgd2l0aCBubyBlcnJvcnMgKCR7d2FybkNvdW50fSB3YXJuaW5nKHMpIHJlcG9ydGVkKS5gXG4gICAgICAgICAgICA6ICdUeXBlU2NyaXB0IGRpYWdub3N0aWNzIGNvbXBsZXRlZCB3aXRoIG5vIGVycm9ycy4nO1xuICAgIH0gZWxzZSBpZiAoZXJyQ291bnQpIHtcbiAgICAgICAgc3VtbWFyeSA9IHdhcm5Db3VudFxuICAgICAgICAgICAgPyBgRm91bmQgJHtlcnJDb3VudH0gZXJyb3IocyksICR7d2FybkNvdW50fSB3YXJuaW5nKHMpLmBcbiAgICAgICAgICAgIDogYEZvdW5kICR7ZXJyQ291bnR9IFR5cGVTY3JpcHQgZXJyb3IocykuYDtcbiAgICB9IGVsc2Uge1xuICAgICAgICBzdW1tYXJ5ID0gbWVyZ2VkIHx8IGBUeXBlU2NyaXB0IGRpYWdub3N0aWNzIHJlcG9ydGVkIGV4aXQgY29kZSAke3Jlc3VsdC5jb2RlfSBidXQgbm8gcGFyc2VkIGRpYWdub3N0aWNzLmA7XG4gICAgfVxuICAgIHJldHVybiB7XG4gICAgICAgIG9rLFxuICAgICAgICB0b29sOiAndHlwZXNjcmlwdCcsXG4gICAgICAgIGJpbmFyeSxcbiAgICAgICAgdHNjb25maWdQYXRoLFxuICAgICAgICBleGl0Q29kZTogcmVzdWx0LmNvZGUsXG4gICAgICAgIHN1bW1hcnksXG4gICAgICAgIGRpYWdub3N0aWNzLFxuICAgICAgICBzdGRvdXQ6IHJlc3VsdC5zdGRvdXQsXG4gICAgICAgIHN0ZGVycjogcmVzdWx0LnN0ZGVycixcbiAgICAgICAgc3Bhd25GYWlsZWQ6IHJlc3VsdC5zcGF3bkZhaWxlZCB8fCB1bmRlZmluZWQsXG4gICAgICAgIHN5c3RlbUVycm9yOiByZXN1bHQuc3Bhd25GYWlsZWQgPyByZXN1bHQuZXJyb3IgOiB1bmRlZmluZWQsXG4gICAgfTtcbn1cblxuLy8gLS0tLSB3YWl0Rm9yQ29tcGlsZSAoaGFyYWR5IHBhdHRlcm4pIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmNvbnN0IENPTVBJTEVfTE9HX1JFTCA9IHBhdGguam9pbigndGVtcCcsICdwcm9ncmFtbWluZycsICdwYWNrZXItZHJpdmVyJywgJ2xvZ3MnLCAnZGVidWcubG9nJyk7XG5jb25zdCBDT01QSUxFX01BUktFUiA9ICdUYXJnZXQoZWRpdG9yKSBlbmRzJztcblxuZXhwb3J0IGludGVyZmFjZSBXYWl0Rm9yQ29tcGlsZVJlc3VsdCB7XG4gICAgc3VjY2VzczogYm9vbGVhbjtcbiAgICBjb21waWxlZDogYm9vbGVhbjtcbiAgICB0aW1lb3V0PzogYm9vbGVhbjtcbiAgICB3YWl0ZWRNczogbnVtYmVyO1xuICAgIG5vdGU/OiBzdHJpbmc7XG4gICAgbG9nUGF0aD86IHN0cmluZztcbiAgICBlcnJvcj86IHN0cmluZztcbn1cblxuLyoqXG4gKiBXYWl0IGZvciB0aGUgY29jb3MgcGFja2VyLWRyaXZlciB0byBsb2cgXCJUYXJnZXQoZWRpdG9yKSBlbmRzXCIgaW5kaWNhdGluZ1xuICogdGhlIFRTIGNvbXBpbGUgcGlwZWxpbmUgZmluaXNoZWQuIFdlIHRhaWwgdGhlIGxvZyBieSB0cmFja2luZyBieXRlXG4gKiBsZW5ndGggYXQgc3RhcnQgdnMgcG9sbC10aW1lLiBJZiB0aGUgbG9nIGRvZXNuJ3QgZ3JvdyB3aXRoaW4gYSBncmFjZVxuICogd2luZG93IChkZWZhdWx0IDJzKSwgd2UgY29uY2x1ZGUgbm8gY29tcGlsZSB3YXMgdHJpZ2dlcmVkIChjbGVhblxuICogcHJvamVjdCwgbm8gcmVjZW50IC50cyBjaGFuZ2VzKSBhbmQgcmV0dXJuIHN1Y2Nlc3MuXG4gKlxuICogQ2FsbGVyIHVzdWFsbHkgcGFpcnMgdGhpcyB3aXRoIGEgYHJlZnJlc2gtYXNzZXRgIHRvIG51ZGdlIGNvY29zIGludG9cbiAqIGRldGVjdGluZyBmcmVzaCBjaGFuZ2VzOyB3ZSBkbyB0aGF0IGFzIGEgbm8tZmFpbCBraWNrIGJlZm9yZSBwb2xsaW5nLlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gd2FpdEZvckNvbXBpbGUoXG4gICAgcHJvamVjdFBhdGg6IHN0cmluZyxcbiAgICB0aW1lb3V0TXM6IG51bWJlciA9IDE1MDAwLFxuKTogUHJvbWlzZTxXYWl0Rm9yQ29tcGlsZVJlc3VsdD4ge1xuICAgIGNvbnN0IGxvZ1BhdGggPSBwYXRoLmpvaW4ocHJvamVjdFBhdGgsIENPTVBJTEVfTE9HX1JFTCk7XG4gICAgaWYgKCFleGlzdHMobG9nUGF0aCkpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgY29tcGlsZWQ6IGZhbHNlLFxuICAgICAgICAgICAgd2FpdGVkTXM6IDAsXG4gICAgICAgICAgICBlcnJvcjogYENvbXBpbGUgbG9nIG5vdCBmb3VuZCBhdCAke2xvZ1BhdGh9LiBIYXMgdGhlIGVkaXRvciBydW4gYSBidWlsZCBwaXBlbGluZSB5ZXQ/YCxcbiAgICAgICAgfTtcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgKEVkaXRvciBhcyBhbnkpPy5NZXNzYWdlPy5yZXF1ZXN0Py4oJ2Fzc2V0LWRiJywgJ3JlZnJlc2gtYXNzZXQnLCAnZGI6Ly9hc3NldHMnKTtcbiAgICB9IGNhdGNoIHsgLyogc3dhbGxvdyDigJQgcmVmcmVzaCBpcyBhIGtpY2ssIG5vdCByZXF1aXJlZCAqLyB9XG5cbiAgICBjb25zdCBpbml0aWFsU2l6ZSA9IGZzLnN0YXRTeW5jKGxvZ1BhdGgpLnNpemU7XG4gICAgY29uc3Qgc3RhcnRUaW1lID0gRGF0ZS5ub3coKTtcbiAgICBjb25zdCBQT0xMX0lOVEVSVkFMID0gMjAwO1xuICAgIGNvbnN0IERFVEVDVF9HUkFDRV9NUyA9IDIwMDA7XG5cbiAgICB3aGlsZSAoRGF0ZS5ub3coKSAtIHN0YXJ0VGltZSA8IHRpbWVvdXRNcykge1xuICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgUE9MTF9JTlRFUlZBTCkpO1xuICAgICAgICBsZXQgY3VycmVudFNpemU6IG51bWJlcjtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGN1cnJlbnRTaXplID0gZnMuc3RhdFN5bmMobG9nUGF0aCkuc2l6ZTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgY29tcGlsZWQ6IGZhbHNlLFxuICAgICAgICAgICAgICAgIHdhaXRlZE1zOiBEYXRlLm5vdygpIC0gc3RhcnRUaW1lLFxuICAgICAgICAgICAgICAgIGVycm9yOiBgc3RhdCBjb21waWxlIGxvZyBmYWlsZWQ6ICR7ZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpfWAsXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIGlmIChjdXJyZW50U2l6ZSA8PSBpbml0aWFsU2l6ZSkge1xuICAgICAgICAgICAgaWYgKERhdGUubm93KCkgLSBzdGFydFRpbWUgPCBERVRFQ1RfR1JBQ0VfTVMpIGNvbnRpbnVlO1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGNvbXBpbGVkOiBmYWxzZSxcbiAgICAgICAgICAgICAgICB3YWl0ZWRNczogRGF0ZS5ub3coKSAtIHN0YXJ0VGltZSxcbiAgICAgICAgICAgICAgICBub3RlOiAnTm8gY29tcGlsYXRpb24gdHJpZ2dlcmVkIChubyBsb2cgZ3Jvd3RoIHdpdGhpbiBncmFjZSB3aW5kb3cpLicsXG4gICAgICAgICAgICAgICAgbG9nUGF0aCxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgbmV3Qnl0ZXMgPSBjdXJyZW50U2l6ZSAtIGluaXRpYWxTaXplO1xuICAgICAgICBsZXQgbmV3Q29udGVudCA9ICcnO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgZmQgPSBmcy5vcGVuU3luYyhsb2dQYXRoLCAncicpO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCBidWZmZXIgPSBCdWZmZXIuYWxsb2MobmV3Qnl0ZXMpO1xuICAgICAgICAgICAgICAgIGZzLnJlYWRTeW5jKGZkLCBidWZmZXIsIDAsIG5ld0J5dGVzLCBpbml0aWFsU2l6ZSk7XG4gICAgICAgICAgICAgICAgbmV3Q29udGVudCA9IGJ1ZmZlci50b1N0cmluZygndXRmOCcpO1xuICAgICAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgICAgICBmcy5jbG9zZVN5bmMoZmQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBjb21waWxlZDogZmFsc2UsXG4gICAgICAgICAgICAgICAgd2FpdGVkTXM6IERhdGUubm93KCkgLSBzdGFydFRpbWUsXG4gICAgICAgICAgICAgICAgZXJyb3I6IGByZWFkIGNvbXBpbGUgbG9nIGRlbHRhIGZhaWxlZDogJHtlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycil9YCxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG5ld0NvbnRlbnQuaW5jbHVkZXMoQ09NUElMRV9NQVJLRVIpKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgY29tcGlsZWQ6IHRydWUsXG4gICAgICAgICAgICAgICAgd2FpdGVkTXM6IERhdGUubm93KCkgLSBzdGFydFRpbWUsXG4gICAgICAgICAgICAgICAgbG9nUGF0aCxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgY29tcGlsZWQ6IGZhbHNlLFxuICAgICAgICB0aW1lb3V0OiB0cnVlLFxuICAgICAgICB3YWl0ZWRNczogdGltZW91dE1zLFxuICAgICAgICBub3RlOiAnVGltZWQgb3V0IHdhaXRpbmcgZm9yIGNvbXBpbGUgbWFya2VyOyBjb21waWxlIG1heSBzdGlsbCBiZSBpbiBwcm9ncmVzcyBvciBubyByZWNvbXBpbGUgd2FzIG5lZWRlZC4nLFxuICAgICAgICBsb2dQYXRoLFxuICAgIH07XG59XG4iXX0=