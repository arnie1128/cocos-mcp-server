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
        // Validation throws SYNCHRONOUSLY inside the executor before the
        // callback can run, so without try/catch the Promise rejects and
        // the caller's outer catch returns a generic "spawn EINVAL"
        // instead of our structured spawnFailed envelope.
        //
        // Cross-platform notes (verified for macOS + Linux):
        //   - The .cmd / .bat shim issue is Windows-only — on POSIX,
        //     `findTsBinary` returns either the project's `tsc` (a
        //     Node-shebanged JS file or symlink, not .cmd) or the
        //     unqualified `npx` token. The regex below only matches
        //     when BOTH `process.platform === 'win32'` AND the file ends
        //     in .cmd/.bat, so the macOS/Linux branch is unchanged from
        //     pre-v2.4.12 behaviour.
        //   - On POSIX with shell:false, execFile passes args as a raw
        //     argv array to spawn. No shell parsing happens; spaces and
        //     quotes inside individual args are preserved as-is — no
        //     manual quoting is required or wanted.
        //   - quoteForCmd uses cmd.exe escape rules (double-up internal
        //     `"`). It is only invoked under isWindowsShim, never on
        //     POSIX, so its rules don't have to align with bash/zsh.
        const isWindowsShim = process.platform === 'win32' && /\.(cmd|bat)$/i.test(file);
        const quoteForCmd = (s) => {
            // Quote only if the arg contains whitespace or cmd.exe meta
            // characters; double internal quotes per cmd.exe rules.
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHMtZGlhZ25vc3RpY3MuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvbGliL3RzLWRpYWdub3N0aWNzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQW1CRzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUF3REgsb0NBMEJDO0FBVUQsb0NBU0M7QUFnRkQsd0NBNENDO0FBRUQsb0RBK0RDO0FBMkJELHdDQWlGQztBQTVZRCx1Q0FBeUI7QUFDekIsMkNBQTZCO0FBQzdCLGlEQUF5QztBQXFDekMsU0FBUyxNQUFNLENBQUMsUUFBZ0I7SUFDNUIsSUFBSSxDQUFDO1FBQ0QsT0FBTyxFQUFFLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQ25DLENBQUM7SUFBQyxXQUFNLENBQUM7UUFDTCxPQUFPLEtBQUssQ0FBQztJQUNqQixDQUFDO0FBQ0wsQ0FBQztBQUVEOzs7Ozs7R0FNRztBQUNILFNBQWdCLFlBQVksQ0FBQyxXQUFtQjs7SUFDNUMsTUFBTSxPQUFPLEdBQUcsT0FBTyxDQUFDLFFBQVEsS0FBSyxPQUFPLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDO0lBQ2pFLE1BQU0sV0FBVyxHQUFhLEVBQUUsQ0FBQztJQUNqQyxNQUFNLFVBQVUsR0FBRyxNQUFBLE1BQUMsVUFBa0IsQ0FBQyxNQUFNLDBDQUFFLEdBQUcsMENBQUUsSUFBSSxDQUFDO0lBQ3pELElBQUksVUFBVSxFQUFFLENBQUM7UUFDYixXQUFXLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7SUFDM0QsQ0FBQztJQUNELE1BQU0sdUJBQXVCLEdBQWEsRUFBRSxDQUFDO0lBQzdDLEtBQUssTUFBTSxJQUFJLElBQUksV0FBVyxFQUFFLENBQUM7UUFDN0IsdUJBQXVCLENBQUMsSUFBSSxDQUN4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QVEsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUN6QyxDQUFDO29CQUFTLENBQUM7Z0JBQ1AsRUFBRSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNyQixDQUFDO1FBQ0wsQ0FBQztRQUFDLE9BQU8sR0FBUSxFQUFFLENBQUM7WUFDaEIsT0FBTztnQkFDSCxPQUFPLEVBQUUsS0FBSztnQkFDZCxRQUFRLEVBQUUsS0FBSztnQkFDZixRQUFRLEVBQUUsSUFBSSxDQUFDLEdBQUcsRUFBRSxHQUFHLFNBQVM7Z0JBQ2hDLEtBQUssRUFBRSxrQ0FBa0MsTUFBQSxHQUFHLGFBQUgsR0FBRyx1QkFBSCxHQUFHLENBQUUsT0FBTyxtQ0FBSSxNQUFNLENBQUMsR0FBRyxDQUFDLEVBQUU7YUFDekUsQ0FBQztRQUNOLENBQUM7UUFDRCxJQUFJLFVBQVUsQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLEVBQUUsQ0FBQztZQUN0QyxPQUFPO2dCQUNILE9BQU8sRUFBRSxJQUFJO2dCQUNiLFFBQVEsRUFBRSxJQUFJO2dCQUNkLFFBQVEsRUFBRSxJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcsU0FBUztnQkFDaEMsT0FBTzthQUNWLENBQUM7UUFDTixDQUFDO0lBQ0wsQ0FBQztJQUNELE9BQU87UUFDSCxPQUFPLEVBQUUsSUFBSTtRQUNiLFFBQVEsRUFBRSxLQUFLO1FBQ2YsT0FBTyxFQUFFLElBQUk7UUFDYixRQUFRLEVBQUUsU0FBUztRQUNuQixJQUFJLEVBQUUsb0dBQW9HO1FBQzFHLE9BQU87S0FDVixDQUFDO0FBQ04sQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogdHMtZGlhZ25vc3RpY3Mg4oCUIGhvc3Qtc2lkZSBUeXBlU2NyaXB0IGRpYWdub3N0aWNzICsgY29tcGlsZS13YWl0IGhlbHBlcnMuXG4gKlxuICogVGhyZWUgcGllY2VzLCB1c2VkIGJ5IGRlYnVnLXRvb2xzLnRzOlxuICogICAtIGZpbmRUc0JpbmFyeShwcm9qZWN0UGF0aCk6IGxvY2F0ZSBgdHNjYCAocHJvamVjdCBub2RlX21vZHVsZXMg4oaSIGVkaXRvclxuICogICAgIGJ1bmRsZWQgZW5naW5lIOKGkiBucHggZmFsbGJhY2spXG4gKiAgIC0gZmluZFRzQ29uZmlnKHByb2plY3RQYXRoLCBleHBsaWNpdD8pOiBsb2NhdGUgdHNjb25maWcuanNvbiAob3JcbiAqICAgICB0ZW1wL3RzY29uZmlnLmNvY29zLmpzb24gd2hpY2ggY29jb3MgZ2VuZXJhdGVzIGZvciB0aGUgZWRpdG9yKVxuICogICAtIHJ1blNjcmlwdERpYWdub3N0aWNzKHByb2plY3RQYXRoLCBvcHRzKTogcnVuIGB0c2MgLS1ub0VtaXQgLXAgLi4uYCxcbiAqICAgICBwYXJzZSB0aGUgb3V0cHV0IGludG8gc3RydWN0dXJlZCBkaWFnbm9zdGljcy5cbiAqICAgLSB3YWl0Rm9yQ29tcGlsZShwcm9qZWN0UGF0aCwgdGltZW91dE1zKTogdGFpbFxuICogICAgIHRlbXAvcHJvZ3JhbW1pbmcvcGFja2VyLWRyaXZlci9sb2dzL2RlYnVnLmxvZyBmb3IgY29jb3Mnc1xuICogICAgIGBUYXJnZXQoZWRpdG9yKSBlbmRzYCBtYXJrZXIuXG4gKlxuICogU291cmNlczpcbiAqICAgLSBGdW5wbGF5QUkvZnVucGxheS1jb2Nvcy1tY3AgbGliL2RpYWdub3N0aWNzLmpzIChiaW5hcnkgZGlzY292ZXJ5XG4gKiAgICAgKyB0c2Mgb3V0cHV0IHBhcnNlcilcbiAqICAgLSBoYXJhZHkvY29jb3MtY3JlYXRvci1tY3Agc291cmNlL3Rvb2xzL2RlYnVnLXRvb2xzLnRzOndhaXRDb21waWxlXG4gKiAgICAgKGxvZy1zaXplIGRlbHRhICsgbWFya2VyLXN0cmluZyBkZXRlY3Rpb24gcGF0dGVybilcbiAqL1xuXG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHsgZXhlY0ZpbGUgfSBmcm9tICdjaGlsZF9wcm9jZXNzJztcblxuZXhwb3J0IGludGVyZmFjZSBUc2NEaWFnbm9zdGljIHtcbiAgICBmaWxlOiBzdHJpbmc7XG4gICAgbGluZTogbnVtYmVyO1xuICAgIGNvbHVtbjogbnVtYmVyO1xuICAgIGNvZGU6IHN0cmluZztcbiAgICBtZXNzYWdlOiBzdHJpbmc7XG4gICAgc2V2ZXJpdHk/OiAnZXJyb3InIHwgJ3dhcm5pbmcnIHwgJ2luZm8nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJ1blNjcmlwdERpYWdub3N0aWNzT3B0aW9ucyB7XG4gICAgLyoqIE9wdGlvbmFsIG92ZXJyaWRlIHBhdGggKGFic29sdXRlIG9yIHJlbGF0aXZlIHRvIHByb2plY3Qgcm9vdCkuICovXG4gICAgdHNjb25maWdQYXRoPzogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJ1blNjcmlwdERpYWdub3N0aWNzUmVzdWx0IHtcbiAgICBvazogYm9vbGVhbjtcbiAgICB0b29sOiAndHlwZXNjcmlwdCc7XG4gICAgYmluYXJ5OiBzdHJpbmc7XG4gICAgdHNjb25maWdQYXRoOiBzdHJpbmc7XG4gICAgZXhpdENvZGU6IG51bWJlcjtcbiAgICBzdW1tYXJ5OiBzdHJpbmc7XG4gICAgZGlhZ25vc3RpY3M6IFRzY0RpYWdub3N0aWNbXTtcbiAgICAvKiogUmF3IHN0ZG91dCDigJQga2VwdCBmb3IgZGVidWdnaW5nIHRzYyBvdXRwdXQgdGhlIHBhcnNlciBtaXNzZWQuICovXG4gICAgc3Rkb3V0OiBzdHJpbmc7XG4gICAgLyoqIFJhdyBzdGRlcnIg4oCUIGtlcHQgZm9yIGRlYnVnZ2luZyB0c2Mgb3V0cHV0IHRoZSBwYXJzZXIgbWlzc2VkLiAqL1xuICAgIHN0ZGVycjogc3RyaW5nO1xuICAgIC8qKiB2Mi40Ljk6IHN1cmZhY2VzIHNwYXduIGZhaWx1cmVzIChFTk9FTlQgZXRjLikgc28gQUkgc2VlcyBiaW5hcnkgcHJvYmxlbXNcbiAgICAgKiAgc2VwYXJhdGVseSBmcm9tIGNvbXBpbGUgZXJyb3JzLiBFbXB0eSB3aGVuIHRzYyBhY3R1YWxseSByYW4uICovXG4gICAgc3lzdGVtRXJyb3I/OiBzdHJpbmc7XG4gICAgLyoqIHYyLjQuOTogdHJ1ZSB3aGVuIGV4ZWNGaWxlIHJlcG9ydGVkIGEgbm9uLW51bWVyaWMgZXJyb3IuY29kZSAoYmluYXJ5XG4gICAgICogIG5vdCBmb3VuZCAvIG5vdCBleGVjdXRhYmxlIC8gRUFDQ0VTKS4gRGlzdGluY3QgZnJvbSBhIG5vcm1hbCBub24temVyb1xuICAgICAqICBleGl0IChjb21waWxlIGVycm9ycykuICovXG4gICAgc3Bhd25GYWlsZWQ/OiBib29sZWFuO1xufVxuXG5mdW5jdGlvbiBleGlzdHMoZmlsZVBhdGg6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgIHRyeSB7XG4gICAgICAgIHJldHVybiBmcy5leGlzdHNTeW5jKGZpbGVQYXRoKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbn1cblxuLyoqXG4gKiBMb2NhdGUgdGhlIHR5cGVzY3JpcHQgY29tcGlsZXIgYmluYXJ5LiBQcmVmZXJlbmNlIG9yZGVyOlxuICogICAxLiBwcm9qZWN0IG5vZGVfbW9kdWxlcy8uYmluL3RzYyguY21kKVxuICogICAyLiBwcm9qZWN0IG5vZGVfbW9kdWxlcy90eXBlc2NyaXB0L2Jpbi90c2NcbiAqICAgMy4gZWRpdG9yJ3MgYnVuZGxlZCBlbmdpbmUgbm9kZV9tb2R1bGVzLy5iaW4vdHNjXG4gKiAgIDQuIG5weCAoZmFsbGJhY2sg4oCUIHNsb3cgZmlyc3QgcnVuLCBidXQgYWx3YXlzIHByZXNlbnQpXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmaW5kVHNCaW5hcnkocHJvamVjdFBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgY29uc3QgdHNjTmFtZSA9IHByb2Nlc3MucGxhdGZvcm0gPT09ICd3aW4zMicgPyAndHNjLmNtZCcgOiAndHNjJztcbiAgICBjb25zdCBlZGl0b3JSb290czogc3RyaW5nW10gPSBbXTtcbiAgICBjb25zdCBlZGl0b3JQYXRoID0gKGdsb2JhbFRoaXMgYXMgYW55KS5FZGl0b3I/LkFwcD8ucGF0aDtcbiAgICBpZiAoZWRpdG9yUGF0aCkge1xuICAgICAgICBlZGl0b3JSb290cy5wdXNoKGVkaXRvclBhdGgsIHBhdGguZGlybmFtZShlZGl0b3JQYXRoKSk7XG4gICAgfVxuICAgIGNvbnN0IGVkaXRvckJ1bmRsZWRDYW5kaWRhdGVzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGZvciAoY29uc3Qgcm9vdCBvZiBlZGl0b3JSb290cykge1xuICAgICAgICBlZGl0b3JCdW5kbGVkQ2FuZGlkYXRlcy5wdXNoKFxuICAgICAgICAgICAgcGF0aC5qb2luKHJvb3QsICdyZXNvdXJjZXMnLCAnM2QnLCAnZW5naW5lJywgJ25vZGVfbW9kdWxlcycsICcuYmluJywgdHNjTmFtZSksXG4gICAgICAgICAgICBwYXRoLmpvaW4ocm9vdCwgJ3Jlc291cmNlcycsICczZCcsICdlbmdpbmUnLCAnbm9kZV9tb2R1bGVzJywgJ3R5cGVzY3JpcHQnLCAnYmluJywgJ3RzYycpLFxuICAgICAgICAgICAgcGF0aC5qb2luKHJvb3QsICdhcHAuYXNhci51bnBhY2tlZCcsICdub2RlX21vZHVsZXMnLCAndHlwZXNjcmlwdCcsICdiaW4nLCAndHNjJyksXG4gICAgICAgICAgICBwYXRoLmpvaW4ocm9vdCwgJ0NvbnRlbnRzJywgJ1Jlc291cmNlcycsICdyZXNvdXJjZXMnLCAnM2QnLCAnZW5naW5lJywgJ25vZGVfbW9kdWxlcycsICcuYmluJywgdHNjTmFtZSksXG4gICAgICAgICAgICBwYXRoLmpvaW4ocm9vdCwgJ0NvbnRlbnRzJywgJ1Jlc291cmNlcycsICdyZXNvdXJjZXMnLCAnM2QnLCAnZW5naW5lJywgJ25vZGVfbW9kdWxlcycsICd0eXBlc2NyaXB0JywgJ2JpbicsICd0c2MnKSxcbiAgICAgICAgKTtcbiAgICB9XG4gICAgY29uc3QgY2FuZGlkYXRlcyA9IFtcbiAgICAgICAgcGF0aC5qb2luKHByb2plY3RQYXRoLCAnbm9kZV9tb2R1bGVzJywgJy5iaW4nLCB0c2NOYW1lKSxcbiAgICAgICAgcGF0aC5qb2luKHByb2plY3RQYXRoLCAnbm9kZV9tb2R1bGVzJywgJ3R5cGVzY3JpcHQnLCAnYmluJywgJ3RzYycpLFxuICAgICAgICAuLi5lZGl0b3JCdW5kbGVkQ2FuZGlkYXRlcyxcbiAgICBdO1xuICAgIGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIGNhbmRpZGF0ZXMpIHtcbiAgICAgICAgaWYgKGV4aXN0cyhjYW5kaWRhdGUpKSByZXR1cm4gY2FuZGlkYXRlO1xuICAgIH1cbiAgICByZXR1cm4gcHJvY2Vzcy5wbGF0Zm9ybSA9PT0gJ3dpbjMyJyA/ICducHguY21kJyA6ICducHgnO1xufVxuXG4vKipcbiAqIExvY2F0ZSB0aGUgdHNjb25maWcgdG8gdXNlLiBQcmVmZXJlbmNlIG9yZGVyOlxuICogICAxLiBleHBsaWNpdCBwYXRoIHBhc3NlZCBieSBjYWxsZXJcbiAqICAgMi4gPHByb2plY3Q+L3RzY29uZmlnLmpzb25cbiAqICAgMy4gPHByb2plY3Q+L3RlbXAvdHNjb25maWcuY29jb3MuanNvbiAoY29jb3MgYXV0by1nZW5lcmF0ZXMgdGhpcyBmb3JcbiAqICAgICAgdGhlIGVkaXRvcidzIFRTIHBpcGVsaW5lOyBhdmFpbGFibGUgZXZlbiBpZiB1c2VyIGhhcyBubyB0b3AtbGV2ZWxcbiAqICAgICAgdHNjb25maWcuanNvbilcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZpbmRUc0NvbmZpZyhwcm9qZWN0UGF0aDogc3RyaW5nLCBleHBsaWNpdD86IHN0cmluZyk6IHN0cmluZyB8ICcnIHtcbiAgICBpZiAoZXhwbGljaXQpIHtcbiAgICAgICAgcmV0dXJuIHBhdGguaXNBYnNvbHV0ZShleHBsaWNpdCkgPyBleHBsaWNpdCA6IHBhdGguam9pbihwcm9qZWN0UGF0aCwgZXhwbGljaXQpO1xuICAgIH1cbiAgICBjb25zdCBjYW5kaWRhdGVzID0gW1xuICAgICAgICBwYXRoLmpvaW4ocHJvamVjdFBhdGgsICd0c2NvbmZpZy5qc29uJyksXG4gICAgICAgIHBhdGguam9pbihwcm9qZWN0UGF0aCwgJ3RlbXAnLCAndHNjb25maWcuY29jb3MuanNvbicpLFxuICAgIF07XG4gICAgcmV0dXJuIGNhbmRpZGF0ZXMuZmluZChleGlzdHMpID8/ICcnO1xufVxuXG5pbnRlcmZhY2UgRXhlY1Jlc3VsdCB7IGNvZGU6IG51bWJlcjsgc3Rkb3V0OiBzdHJpbmc7IHN0ZGVycjogc3RyaW5nOyBlcnJvcjogc3RyaW5nOyBzcGF3bkZhaWxlZDogYm9vbGVhbjsgfVxuXG5mdW5jdGlvbiBleGVjQXN5bmMoZmlsZTogc3RyaW5nLCBhcmdzOiBzdHJpbmdbXSwgY3dkOiBzdHJpbmcpOiBQcm9taXNlPEV4ZWNSZXN1bHQ+IHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgY29uc3Qgb25SZXN1bHQgPSAoZXJyb3I6IGFueSwgc3Rkb3V0OiBhbnksIHN0ZGVycjogYW55KSA9PiB7XG4gICAgICAgICAgICAvLyB2Mi40LjkgcmV2aWV3IGZpeCAoY2xhdWRlICsgY29kZXgg8J+UtCk6IGEgbm9uLW51bWVyaWMgZXJyb3IuY29kZVxuICAgICAgICAgICAgLy8gKGUuZy4gJ0VOT0VOVCcgd2hlbiB0aGUgcmVzb2x2ZWQgdHNjIGJpbmFyeSBkb2Vzbid0IGV4aXN0LCBvclxuICAgICAgICAgICAgLy8gJ0VJTlZBTCcgb24gTm9kZSAyMisgd2hlbiBleGVjRmlsZSBpcyBjYWxsZWQgYWdhaW5zdCBhIC5jbWRcbiAgICAgICAgICAgIC8vIHNoaW0gd2l0aG91dCBzaGVsbDp0cnVlKSB3YXMgcHJldmlvdXNseSBjb2VyY2VkIHRvIDAg4oaSIG9rOnRydWVcbiAgICAgICAgICAgIC8vIHdpdGggZW1wdHkgZGlhZ25vc3RpY3Mg4oaSIEFJIGZhbHNlbHkgc2VlcyBcIm5vIGVycm9yc1wiIHdoZW4gdHNjXG4gICAgICAgICAgICAvLyBuZXZlciByYW4uIFRyZWF0IGFueSBlcnJvciB3aXRoIGEgbm9uLW51bWVyaWMgY29kZSBhcyBhIHNwYXduXG4gICAgICAgICAgICAvLyBmYWlsdXJlIChjb2RlPS0xKSBhbmQgZm9yY2UgdGhlIGNhbGxlciB0byBzdXJmYWNlIGl0LlxuICAgICAgICAgICAgY29uc3QgcmF3Q29kZSA9IGVycm9yPy5jb2RlO1xuICAgICAgICAgICAgY29uc3QgbnVtZXJpY0NvZGUgPSB0eXBlb2YgcmF3Q29kZSA9PT0gJ251bWJlcicgPyByYXdDb2RlIDogKGVycm9yID8gLTEgOiAwKTtcbiAgICAgICAgICAgIGNvbnN0IHNwYXduRmFpbGVkID0gISFlcnJvciAmJiB0eXBlb2YgcmF3Q29kZSAhPT0gJ251bWJlcic7XG4gICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICBjb2RlOiBudW1lcmljQ29kZSxcbiAgICAgICAgICAgICAgICBzdGRvdXQ6IFN0cmluZyhzdGRvdXQgfHwgJycpLFxuICAgICAgICAgICAgICAgIHN0ZGVycjogU3RyaW5nKHN0ZGVyciB8fCAnJyksXG4gICAgICAgICAgICAgICAgZXJyb3I6IGVycm9yID8gZXJyb3IubWVzc2FnZSA6ICcnLFxuICAgICAgICAgICAgICAgIHNwYXduRmFpbGVkLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH07XG4gICAgICAgIC8vIHYyLjQuMTIgbGl2ZS1yZXRlc3QgZml4OiBOb2RlIDIyKyByZWZ1c2VzIHRvIHNwYXduIC5jbWQgLyAuYmF0XG4gICAgICAgIC8vIGZpbGVzIHZpYSBleGVjRmlsZSB3aXRob3V0IHNoZWxsOnRydWUgKENWRS0yMDI0LTI3OTgwIHBhdGNoKS5cbiAgICAgICAgLy8gVmFsaWRhdGlvbiB0aHJvd3MgU1lOQ0hST05PVVNMWSBpbnNpZGUgdGhlIGV4ZWN1dG9yIGJlZm9yZSB0aGVcbiAgICAgICAgLy8gY2FsbGJhY2sgY2FuIHJ1biwgc28gd2l0aG91dCB0cnkvY2F0Y2ggdGhlIFByb21pc2UgcmVqZWN0cyBhbmRcbiAgICAgICAgLy8gdGhlIGNhbGxlcidzIG91dGVyIGNhdGNoIHJldHVybnMgYSBnZW5lcmljIFwic3Bhd24gRUlOVkFMXCJcbiAgICAgICAgLy8gaW5zdGVhZCBvZiBvdXIgc3RydWN0dXJlZCBzcGF3bkZhaWxlZCBlbnZlbG9wZS5cbiAgICAgICAgLy9cbiAgICAgICAgLy8gQ3Jvc3MtcGxhdGZvcm0gbm90ZXMgKHZlcmlmaWVkIGZvciBtYWNPUyArIExpbnV4KTpcbiAgICAgICAgLy8gICAtIFRoZSAuY21kIC8gLmJhdCBzaGltIGlzc3VlIGlzIFdpbmRvd3Mtb25seSDigJQgb24gUE9TSVgsXG4gICAgICAgIC8vICAgICBgZmluZFRzQmluYXJ5YCByZXR1cm5zIGVpdGhlciB0aGUgcHJvamVjdCdzIGB0c2NgIChhXG4gICAgICAgIC8vICAgICBOb2RlLXNoZWJhbmdlZCBKUyBmaWxlIG9yIHN5bWxpbmssIG5vdCAuY21kKSBvciB0aGVcbiAgICAgICAgLy8gICAgIHVucXVhbGlmaWVkIGBucHhgIHRva2VuLiBUaGUgcmVnZXggYmVsb3cgb25seSBtYXRjaGVzXG4gICAgICAgIC8vICAgICB3aGVuIEJPVEggYHByb2Nlc3MucGxhdGZvcm0gPT09ICd3aW4zMidgIEFORCB0aGUgZmlsZSBlbmRzXG4gICAgICAgIC8vICAgICBpbiAuY21kLy5iYXQsIHNvIHRoZSBtYWNPUy9MaW51eCBicmFuY2ggaXMgdW5jaGFuZ2VkIGZyb21cbiAgICAgICAgLy8gICAgIHByZS12Mi40LjEyIGJlaGF2aW91ci5cbiAgICAgICAgLy8gICAtIE9uIFBPU0lYIHdpdGggc2hlbGw6ZmFsc2UsIGV4ZWNGaWxlIHBhc3NlcyBhcmdzIGFzIGEgcmF3XG4gICAgICAgIC8vICAgICBhcmd2IGFycmF5IHRvIHNwYXduLiBObyBzaGVsbCBwYXJzaW5nIGhhcHBlbnM7IHNwYWNlcyBhbmRcbiAgICAgICAgLy8gICAgIHF1b3RlcyBpbnNpZGUgaW5kaXZpZHVhbCBhcmdzIGFyZSBwcmVzZXJ2ZWQgYXMtaXMg4oCUIG5vXG4gICAgICAgIC8vICAgICBtYW51YWwgcXVvdGluZyBpcyByZXF1aXJlZCBvciB3YW50ZWQuXG4gICAgICAgIC8vICAgLSBxdW90ZUZvckNtZCB1c2VzIGNtZC5leGUgZXNjYXBlIHJ1bGVzIChkb3VibGUtdXAgaW50ZXJuYWxcbiAgICAgICAgLy8gICAgIGBcImApLiBJdCBpcyBvbmx5IGludm9rZWQgdW5kZXIgaXNXaW5kb3dzU2hpbSwgbmV2ZXIgb25cbiAgICAgICAgLy8gICAgIFBPU0lYLCBzbyBpdHMgcnVsZXMgZG9uJ3QgaGF2ZSB0byBhbGlnbiB3aXRoIGJhc2gvenNoLlxuICAgICAgICBjb25zdCBpc1dpbmRvd3NTaGltID0gcHJvY2Vzcy5wbGF0Zm9ybSA9PT0gJ3dpbjMyJyAmJiAvXFwuKGNtZHxiYXQpJC9pLnRlc3QoZmlsZSk7XG4gICAgICAgIGNvbnN0IHF1b3RlRm9yQ21kID0gKHM6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gICAgICAgICAgICAvLyBRdW90ZSBvbmx5IGlmIHRoZSBhcmcgY29udGFpbnMgd2hpdGVzcGFjZSBvciBjbWQuZXhlIG1ldGFcbiAgICAgICAgICAgIC8vIGNoYXJhY3RlcnM7IGRvdWJsZSBpbnRlcm5hbCBxdW90ZXMgcGVyIGNtZC5leGUgcnVsZXMuXG4gICAgICAgICAgICBpZiAoIS9bXFxzXCImPD58Xl0vLnRlc3QocykpIHJldHVybiBzO1xuICAgICAgICAgICAgcmV0dXJuICdcIicgKyBzLnJlcGxhY2UoL1wiL2csICdcIlwiJykgKyAnXCInO1xuICAgICAgICB9O1xuICAgICAgICBjb25zdCBmaWxlQXJnID0gaXNXaW5kb3dzU2hpbSA/IHF1b3RlRm9yQ21kKGZpbGUpIDogZmlsZTtcbiAgICAgICAgY29uc3QgYXJnc0FyZyA9IGlzV2luZG93c1NoaW0gPyBhcmdzLm1hcChxdW90ZUZvckNtZCkgOiBhcmdzO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgZXhlY0ZpbGUoZmlsZUFyZywgYXJnc0FyZywge1xuICAgICAgICAgICAgICAgIGN3ZCxcbiAgICAgICAgICAgICAgICBtYXhCdWZmZXI6IDggKiAxMDI0ICogMTAyNCxcbiAgICAgICAgICAgICAgICB3aW5kb3dzSGlkZTogdHJ1ZSxcbiAgICAgICAgICAgICAgICBzaGVsbDogaXNXaW5kb3dzU2hpbSxcbiAgICAgICAgICAgIH0sIG9uUmVzdWx0KTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIC8vIENhdGNoIHN5bmNocm9ub3VzIHZhbGlkYXRpb24gZXJyb3JzIChFSU5WQUwgZXRjLikgc28gdGhlXG4gICAgICAgICAgICAvLyBjYWxsZXIgc3RpbGwgZ2V0cyB0aGUgc3RydWN0dXJlZCBzcGF3bkZhaWxlZCBlbnZlbG9wZS5cbiAgICAgICAgICAgIG9uUmVzdWx0KGVyciwgJycsICcnKTtcbiAgICAgICAgfVxuICAgIH0pO1xufVxuXG4vLyB2Mi40LjkgcmV2aWV3IGZpeCAoZ2VtaW5pIPCfn6EgKyBjbGF1ZGUg8J+foSArIGNvZGV4IPCfn6EpOiB3aWRlbiB0byBhbHNvIGFjY2VwdFxuLy8gYHdhcm5pbmdgIGxpbmVzICh0c2MgcmFyZWx5IGVtaXRzIHRoZW0gYnV0IFR5cGVTY3JpcHQgcGx1Z2lucyBkbykgYW5kIHRvXG4vLyBrZWVwIGZpbGUtbGluZS1jb2x1bW4gc2hhcGUgY29tcGF0aWJsZS4gVGhlIGRpYWdub3N0aWMgc3RyZWFtJ3MgYHNldmVyaXR5YFxuLy8gaXMgYWRkZWQgc28gY29uc3VtZXJzIGNhbiBmaWx0ZXIg4oCUIGNvZGUgc3RheXMgdGhlIHNhbWUgc2hhcGUgb3RoZXJ3aXNlLlxuY29uc3QgVFNDX0xJTkVfUkUgPSAvXiguKj8pXFwoKFxcZCspLChcXGQrKVxcKTpcXHMrKGVycm9yfHdhcm5pbmd8aW5mbylcXHMrKFRTXFxkKyk6XFxzKyguKikkL2k7XG4vLyBQcm9qZWN0LXNjb3BlIGRpYWdub3N0aWNzIChlLmcuIFRTMTgwMDMgXCJObyBpbnB1dHMgd2VyZSBmb3VuZC4uLlwiKSBoYXZlIG5vXG4vLyBmaWxlL2xpbmUvY29sdW1uIOKAlCBzZXBhcmF0ZWx5IGNhcHR1cmVkLlxuY29uc3QgVFNDX1BST0pFQ1RfTElORV9SRSA9IC9eXFxzKihlcnJvcnx3YXJuaW5nfGluZm8pXFxzKyhUU1xcZCspOlxccysoLiopJC9pO1xuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VUc2NPdXRwdXQob3V0cHV0OiBzdHJpbmcpOiBUc2NEaWFnbm9zdGljW10ge1xuICAgIGlmICghb3V0cHV0KSByZXR1cm4gW107XG4gICAgY29uc3QgZGlhZ25vc3RpY3M6IFRzY0RpYWdub3N0aWNbXSA9IFtdO1xuICAgIGxldCBsYXN0OiBUc2NEaWFnbm9zdGljIHwgbnVsbCA9IG51bGw7XG4gICAgZm9yIChjb25zdCByYXcgb2Ygb3V0cHV0LnNwbGl0KC9cXHI/XFxuLykpIHtcbiAgICAgICAgY29uc3QgbGluZSA9IHJhdy5yZXBsYWNlKC9cXHMrJC91LCAnJyk7XG4gICAgICAgIGlmICghbGluZSkgeyBsYXN0ID0gbnVsbDsgY29udGludWU7IH1cbiAgICAgICAgY29uc3QgbSA9IFRTQ19MSU5FX1JFLmV4ZWMobGluZS50cmltKCkpO1xuICAgICAgICBpZiAobSkge1xuICAgICAgICAgICAgY29uc3QgZGlhZzogVHNjRGlhZ25vc3RpYyA9IHtcbiAgICAgICAgICAgICAgICBmaWxlOiBtWzFdLFxuICAgICAgICAgICAgICAgIGxpbmU6IE51bWJlcihtWzJdKSxcbiAgICAgICAgICAgICAgICBjb2x1bW46IE51bWJlcihtWzNdKSxcbiAgICAgICAgICAgICAgICBjb2RlOiBtWzVdLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IG1bNl0sXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgKGRpYWcgYXMgYW55KS5zZXZlcml0eSA9IG1bNF0udG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgIGRpYWdub3N0aWNzLnB1c2goZGlhZyk7XG4gICAgICAgICAgICBsYXN0ID0gZGlhZztcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHBtID0gVFNDX1BST0pFQ1RfTElORV9SRS5leGVjKGxpbmUudHJpbSgpKTtcbiAgICAgICAgaWYgKHBtKSB7XG4gICAgICAgICAgICBjb25zdCBkaWFnOiBUc2NEaWFnbm9zdGljID0ge1xuICAgICAgICAgICAgICAgIGZpbGU6ICcnLFxuICAgICAgICAgICAgICAgIGxpbmU6IDAsXG4gICAgICAgICAgICAgICAgY29sdW1uOiAwLFxuICAgICAgICAgICAgICAgIGNvZGU6IHBtWzJdLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IHBtWzNdLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIChkaWFnIGFzIGFueSkuc2V2ZXJpdHkgPSBwbVsxXS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgZGlhZ25vc3RpY3MucHVzaChkaWFnKTtcbiAgICAgICAgICAgIGxhc3QgPSBkaWFnO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgLy8gdjIuNC45IHJldmlldyBmaXggKGNvZGV4IPCfn6EpOiBUeXBlU2NyaXB0IG11bHRpLWxpbmUgZGlhZ25vc3RpY3NcbiAgICAgICAgLy8gY29udGludWUgd2l0aCBpbmRlbnRlZCBsaW5lcyAoZS5nLiBcIlR5cGUgJ1gnIGlzIG5vdCBhc3NpZ25hYmxlIHRvXG4gICAgICAgIC8vIHR5cGUgJ1knLlxcbiAgUHJvcGVydHkgJ2EnIGlzIG1pc3NpbmcuXCIpIOKAlCBhcHBlbmQgdG8gdGhlIHByZXZpb3VzXG4gICAgICAgIC8vIGRpYWdub3N0aWMncyBtZXNzYWdlIGluc3RlYWQgb2YgZHJvcHBpbmcgc2lsZW50bHkuXG4gICAgICAgIGlmIChsYXN0ICYmIC9eXFxzLy50ZXN0KHJhdykpIHtcbiAgICAgICAgICAgIGxhc3QubWVzc2FnZSA9IGAke2xhc3QubWVzc2FnZX1cXG4ke3Jhdy50cmltKCl9YDtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZGlhZ25vc3RpY3M7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBydW5TY3JpcHREaWFnbm9zdGljcyhcbiAgICBwcm9qZWN0UGF0aDogc3RyaW5nLFxuICAgIG9wdGlvbnM6IFJ1blNjcmlwdERpYWdub3N0aWNzT3B0aW9ucyA9IHt9LFxuKTogUHJvbWlzZTxSdW5TY3JpcHREaWFnbm9zdGljc1Jlc3VsdD4ge1xuICAgIGNvbnN0IHRzY29uZmlnUGF0aCA9IGZpbmRUc0NvbmZpZyhwcm9qZWN0UGF0aCwgb3B0aW9ucy50c2NvbmZpZ1BhdGgpO1xuICAgIGlmICghdHNjb25maWdQYXRoIHx8ICFleGlzdHModHNjb25maWdQYXRoKSkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgb2s6IGZhbHNlLFxuICAgICAgICAgICAgdG9vbDogJ3R5cGVzY3JpcHQnLFxuICAgICAgICAgICAgYmluYXJ5OiAnJyxcbiAgICAgICAgICAgIHRzY29uZmlnUGF0aDogdHNjb25maWdQYXRoIHx8ICcnLFxuICAgICAgICAgICAgZXhpdENvZGU6IC0xLFxuICAgICAgICAgICAgc3VtbWFyeTogJ05vIHRzY29uZmlnLmpzb24gb3IgdGVtcC90c2NvbmZpZy5jb2Nvcy5qc29uIGZvdW5kIGluIHByb2plY3QuJyxcbiAgICAgICAgICAgIGRpYWdub3N0aWNzOiBbXSxcbiAgICAgICAgICAgIHN0ZG91dDogJycsXG4gICAgICAgICAgICBzdGRlcnI6ICcnLFxuICAgICAgICAgICAgc3Bhd25GYWlsZWQ6IGZhbHNlLFxuICAgICAgICB9O1xuICAgIH1cbiAgICBjb25zdCBiaW5hcnkgPSBmaW5kVHNCaW5hcnkocHJvamVjdFBhdGgpO1xuICAgIGNvbnN0IGlzTnB4ID0gL1tcXFxcL11ucHgoPzpcXC5jbWQpPyQvaS50ZXN0KGJpbmFyeSkgfHwgYmluYXJ5ID09PSAnbnB4JyB8fCBiaW5hcnkgPT09ICducHguY21kJztcbiAgICBjb25zdCBhcmdzID0gaXNOcHhcbiAgICAgICAgPyBbJ3RzYycsICctLW5vRW1pdCcsICctcCcsIHRzY29uZmlnUGF0aCwgJy0tcHJldHR5JywgJ2ZhbHNlJ11cbiAgICAgICAgOiBbJy0tbm9FbWl0JywgJy1wJywgdHNjb25maWdQYXRoLCAnLS1wcmV0dHknLCAnZmFsc2UnXTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjQXN5bmMoYmluYXJ5LCBhcmdzLCBwcm9qZWN0UGF0aCk7XG4gICAgY29uc3QgbWVyZ2VkID0gW3Jlc3VsdC5zdGRvdXQsIHJlc3VsdC5zdGRlcnIsIHJlc3VsdC5lcnJvcl0uZmlsdGVyKEJvb2xlYW4pLmpvaW4oJ1xcbicpLnRyaW0oKTtcbiAgICBjb25zdCBkaWFnbm9zdGljcyA9IHBhcnNlVHNjT3V0cHV0KG1lcmdlZCk7XG4gICAgLy8gdjIuNC4xMCByb3VuZC0yIHJldmlldyBmaXggKGNsYXVkZSArIGNvZGV4ICsgZ2VtaW5pIPCfn6EpOiBgb2tgIHNob3VsZFxuICAgIC8vIHJlZmxlY3QgY29tcGlsYXRpb24gc3VjY2Vzcy4gdHNjIGV4aXRzIDAgb24gd2FybmluZ3Mtb25seSBydW5zXG4gICAgLy8gKHdhcm5pbmdzIGRvbid0IGZhaWwgdGhlIGJ1aWxkKTsgdGhlIGRpYWdub3N0aWNzIGFycmF5IGNhcnJpZXMgdGhlbVxuICAgIC8vIGZvciB2aXNpYmlsaXR5IGJ1dCB0aGV5IHNob3VsZG4ndCBmbGlwIHRoZSBib29sZWFuLiBDb3VudCBieSBzZXZlcml0eTpcbiAgICAvLyBvbmx5IGBlcnJvcmAgc2V2ZXJpdHkgKGRlZmF1bHQgd2hlbiBzZXZlcml0eSBpcyBtaXNzaW5nIOKAlCBwcmUtdjIuNC4xMFxuICAgIC8vIGRpYWdub3N0aWNzIGhhZCBubyBzZXZlcml0eSBmaWVsZCkgYmxvY2tzIGBva2AuXG4gICAgY29uc3QgZXJyQ291bnQgPSBkaWFnbm9zdGljcy5maWx0ZXIoZCA9PiAoZC5zZXZlcml0eSA/PyAnZXJyb3InKSA9PT0gJ2Vycm9yJykubGVuZ3RoO1xuICAgIGNvbnN0IHdhcm5Db3VudCA9IGRpYWdub3N0aWNzLmZpbHRlcihkID0+IGQuc2V2ZXJpdHkgPT09ICd3YXJuaW5nJykubGVuZ3RoO1xuICAgIGNvbnN0IG9rID0gIXJlc3VsdC5zcGF3bkZhaWxlZCAmJiByZXN1bHQuY29kZSA9PT0gMCAmJiBlcnJDb3VudCA9PT0gMDtcbiAgICBsZXQgc3VtbWFyeTogc3RyaW5nO1xuICAgIGlmIChyZXN1bHQuc3Bhd25GYWlsZWQpIHtcbiAgICAgICAgc3VtbWFyeSA9IGB0c2MgYmluYXJ5IGZhaWxlZCB0byBzcGF3biAoJHtyZXN1bHQuZXJyb3IgfHwgJ3Vua25vd24gZXJyb3InfSkuIFJlc29sdmVkIGJpbmFyeTogJHtiaW5hcnl9LmA7XG4gICAgfSBlbHNlIGlmIChvaykge1xuICAgICAgICBzdW1tYXJ5ID0gd2FybkNvdW50XG4gICAgICAgICAgICA/IGBUeXBlU2NyaXB0IGRpYWdub3N0aWNzIGNvbXBsZXRlZCB3aXRoIG5vIGVycm9ycyAoJHt3YXJuQ291bnR9IHdhcm5pbmcocykgcmVwb3J0ZWQpLmBcbiAgICAgICAgICAgIDogJ1R5cGVTY3JpcHQgZGlhZ25vc3RpY3MgY29tcGxldGVkIHdpdGggbm8gZXJyb3JzLic7XG4gICAgfSBlbHNlIGlmIChlcnJDb3VudCkge1xuICAgICAgICBzdW1tYXJ5ID0gd2FybkNvdW50XG4gICAgICAgICAgICA/IGBGb3VuZCAke2VyckNvdW50fSBlcnJvcihzKSwgJHt3YXJuQ291bnR9IHdhcm5pbmcocykuYFxuICAgICAgICAgICAgOiBgRm91bmQgJHtlcnJDb3VudH0gVHlwZVNjcmlwdCBlcnJvcihzKS5gO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHN1bW1hcnkgPSBtZXJnZWQgfHwgYFR5cGVTY3JpcHQgZGlhZ25vc3RpY3MgcmVwb3J0ZWQgZXhpdCBjb2RlICR7cmVzdWx0LmNvZGV9IGJ1dCBubyBwYXJzZWQgZGlhZ25vc3RpY3MuYDtcbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgICAgb2ssXG4gICAgICAgIHRvb2w6ICd0eXBlc2NyaXB0JyxcbiAgICAgICAgYmluYXJ5LFxuICAgICAgICB0c2NvbmZpZ1BhdGgsXG4gICAgICAgIGV4aXRDb2RlOiByZXN1bHQuY29kZSxcbiAgICAgICAgc3VtbWFyeSxcbiAgICAgICAgZGlhZ25vc3RpY3MsXG4gICAgICAgIHN0ZG91dDogcmVzdWx0LnN0ZG91dCxcbiAgICAgICAgc3RkZXJyOiByZXN1bHQuc3RkZXJyLFxuICAgICAgICBzcGF3bkZhaWxlZDogcmVzdWx0LnNwYXduRmFpbGVkIHx8IHVuZGVmaW5lZCxcbiAgICAgICAgc3lzdGVtRXJyb3I6IHJlc3VsdC5zcGF3bkZhaWxlZCA/IHJlc3VsdC5lcnJvciA6IHVuZGVmaW5lZCxcbiAgICB9O1xufVxuXG4vLyAtLS0tIHdhaXRGb3JDb21waWxlIChoYXJhZHkgcGF0dGVybikgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuY29uc3QgQ09NUElMRV9MT0dfUkVMID0gcGF0aC5qb2luKCd0ZW1wJywgJ3Byb2dyYW1taW5nJywgJ3BhY2tlci1kcml2ZXInLCAnbG9ncycsICdkZWJ1Zy5sb2cnKTtcbmNvbnN0IENPTVBJTEVfTUFSS0VSID0gJ1RhcmdldChlZGl0b3IpIGVuZHMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFdhaXRGb3JDb21waWxlUmVzdWx0IHtcbiAgICBzdWNjZXNzOiBib29sZWFuO1xuICAgIGNvbXBpbGVkOiBib29sZWFuO1xuICAgIHRpbWVvdXQ/OiBib29sZWFuO1xuICAgIHdhaXRlZE1zOiBudW1iZXI7XG4gICAgbm90ZT86IHN0cmluZztcbiAgICBsb2dQYXRoPzogc3RyaW5nO1xuICAgIGVycm9yPzogc3RyaW5nO1xufVxuXG4vKipcbiAqIFdhaXQgZm9yIHRoZSBjb2NvcyBwYWNrZXItZHJpdmVyIHRvIGxvZyBcIlRhcmdldChlZGl0b3IpIGVuZHNcIiBpbmRpY2F0aW5nXG4gKiB0aGUgVFMgY29tcGlsZSBwaXBlbGluZSBmaW5pc2hlZC4gV2UgdGFpbCB0aGUgbG9nIGJ5IHRyYWNraW5nIGJ5dGVcbiAqIGxlbmd0aCBhdCBzdGFydCB2cyBwb2xsLXRpbWUuIElmIHRoZSBsb2cgZG9lc24ndCBncm93IHdpdGhpbiBhIGdyYWNlXG4gKiB3aW5kb3cgKGRlZmF1bHQgMnMpLCB3ZSBjb25jbHVkZSBubyBjb21waWxlIHdhcyB0cmlnZ2VyZWQgKGNsZWFuXG4gKiBwcm9qZWN0LCBubyByZWNlbnQgLnRzIGNoYW5nZXMpIGFuZCByZXR1cm4gc3VjY2Vzcy5cbiAqXG4gKiBDYWxsZXIgdXN1YWxseSBwYWlycyB0aGlzIHdpdGggYSBgcmVmcmVzaC1hc3NldGAgdG8gbnVkZ2UgY29jb3MgaW50b1xuICogZGV0ZWN0aW5nIGZyZXNoIGNoYW5nZXM7IHdlIGRvIHRoYXQgYXMgYSBuby1mYWlsIGtpY2sgYmVmb3JlIHBvbGxpbmcuXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB3YWl0Rm9yQ29tcGlsZShcbiAgICBwcm9qZWN0UGF0aDogc3RyaW5nLFxuICAgIHRpbWVvdXRNczogbnVtYmVyID0gMTUwMDAsXG4pOiBQcm9taXNlPFdhaXRGb3JDb21waWxlUmVzdWx0PiB7XG4gICAgY29uc3QgbG9nUGF0aCA9IHBhdGguam9pbihwcm9qZWN0UGF0aCwgQ09NUElMRV9MT0dfUkVMKTtcbiAgICBpZiAoIWV4aXN0cyhsb2dQYXRoKSkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICBjb21waWxlZDogZmFsc2UsXG4gICAgICAgICAgICB3YWl0ZWRNczogMCxcbiAgICAgICAgICAgIGVycm9yOiBgQ29tcGlsZSBsb2cgbm90IGZvdW5kIGF0ICR7bG9nUGF0aH0uIEhhcyB0aGUgZWRpdG9yIHJ1biBhIGJ1aWxkIHBpcGVsaW5lIHlldD9gLFxuICAgICAgICB9O1xuICAgIH1cbiAgICB0cnkge1xuICAgICAgICBhd2FpdCAoRWRpdG9yIGFzIGFueSk/Lk1lc3NhZ2U/LnJlcXVlc3Q/LignYXNzZXQtZGInLCAncmVmcmVzaC1hc3NldCcsICdkYjovL2Fzc2V0cycpO1xuICAgIH0gY2F0Y2ggeyAvKiBzd2FsbG93IOKAlCByZWZyZXNoIGlzIGEga2ljaywgbm90IHJlcXVpcmVkICovIH1cblxuICAgIGNvbnN0IGluaXRpYWxTaXplID0gZnMuc3RhdFN5bmMobG9nUGF0aCkuc2l6ZTtcbiAgICBjb25zdCBzdGFydFRpbWUgPSBEYXRlLm5vdygpO1xuICAgIGNvbnN0IFBPTExfSU5URVJWQUwgPSAyMDA7XG4gICAgY29uc3QgREVURUNUX0dSQUNFX01TID0gMjAwMDtcblxuICAgIHdoaWxlIChEYXRlLm5vdygpIC0gc3RhcnRUaW1lIDwgdGltZW91dE1zKSB7XG4gICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCBQT0xMX0lOVEVSVkFMKSk7XG4gICAgICAgIGxldCBjdXJyZW50U2l6ZTogbnVtYmVyO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY3VycmVudFNpemUgPSBmcy5zdGF0U3luYyhsb2dQYXRoKS5zaXplO1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBjb21waWxlZDogZmFsc2UsXG4gICAgICAgICAgICAgICAgd2FpdGVkTXM6IERhdGUubm93KCkgLSBzdGFydFRpbWUsXG4gICAgICAgICAgICAgICAgZXJyb3I6IGBzdGF0IGNvbXBpbGUgbG9nIGZhaWxlZDogJHtlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycil9YCxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGN1cnJlbnRTaXplIDw9IGluaXRpYWxTaXplKSB7XG4gICAgICAgICAgICBpZiAoRGF0ZS5ub3coKSAtIHN0YXJ0VGltZSA8IERFVEVDVF9HUkFDRV9NUykgY29udGludWU7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgY29tcGlsZWQ6IGZhbHNlLFxuICAgICAgICAgICAgICAgIHdhaXRlZE1zOiBEYXRlLm5vdygpIC0gc3RhcnRUaW1lLFxuICAgICAgICAgICAgICAgIG5vdGU6ICdObyBjb21waWxhdGlvbiB0cmlnZ2VyZWQgKG5vIGxvZyBncm93dGggd2l0aGluIGdyYWNlIHdpbmRvdykuJyxcbiAgICAgICAgICAgICAgICBsb2dQYXRoLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBuZXdCeXRlcyA9IGN1cnJlbnRTaXplIC0gaW5pdGlhbFNpemU7XG4gICAgICAgIGxldCBuZXdDb250ZW50ID0gJyc7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBmZCA9IGZzLm9wZW5TeW5jKGxvZ1BhdGgsICdyJyk7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGJ1ZmZlciA9IEJ1ZmZlci5hbGxvYyhuZXdCeXRlcyk7XG4gICAgICAgICAgICAgICAgZnMucmVhZFN5bmMoZmQsIGJ1ZmZlciwgMCwgbmV3Qnl0ZXMsIGluaXRpYWxTaXplKTtcbiAgICAgICAgICAgICAgICBuZXdDb250ZW50ID0gYnVmZmVyLnRvU3RyaW5nKCd1dGY4Jyk7XG4gICAgICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgICAgICAgIGZzLmNsb3NlU3luYyhmZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgIGNvbXBpbGVkOiBmYWxzZSxcbiAgICAgICAgICAgICAgICB3YWl0ZWRNczogRGF0ZS5ub3coKSAtIHN0YXJ0VGltZSxcbiAgICAgICAgICAgICAgICBlcnJvcjogYHJlYWQgY29tcGlsZSBsb2cgZGVsdGEgZmFpbGVkOiAke2Vycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKX1gLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICBpZiAobmV3Q29udGVudC5pbmNsdWRlcyhDT01QSUxFX01BUktFUikpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBjb21waWxlZDogdHJ1ZSxcbiAgICAgICAgICAgICAgICB3YWl0ZWRNczogRGF0ZS5ub3coKSAtIHN0YXJ0VGltZSxcbiAgICAgICAgICAgICAgICBsb2dQYXRoLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4ge1xuICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICBjb21waWxlZDogZmFsc2UsXG4gICAgICAgIHRpbWVvdXQ6IHRydWUsXG4gICAgICAgIHdhaXRlZE1zOiB0aW1lb3V0TXMsXG4gICAgICAgIG5vdGU6ICdUaW1lZCBvdXQgd2FpdGluZyBmb3IgY29tcGlsZSBtYXJrZXI7IGNvbXBpbGUgbWF5IHN0aWxsIGJlIGluIHByb2dyZXNzIG9yIG5vIHJlY29tcGlsZSB3YXMgbmVlZGVkLicsXG4gICAgICAgIGxvZ1BhdGgsXG4gICAgfTtcbn1cbiJdfQ==