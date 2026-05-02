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
        (0, child_process_1.execFile)(file, args, { cwd, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
            // v2.4.9 review fix (claude + codex 🔴): a non-numeric error.code
            // (e.g. 'ENOENT' when the resolved tsc binary doesn't exist) was
            // previously coerced to 0 → ok:true with empty diagnostics → AI
            // falsely sees "no errors" when tsc never ran. Treat any error
            // with a non-numeric code as a spawn failure (code=-1) and force
            // the caller to surface it.
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
        });
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
    // v2.4.9 review fix: spawnFailed (binary not found) was being silently
    // collapsed to ok:true. Now ok requires both a clean exit AND no spawn
    // failure. summary calls out the spawn failure separately so the AI
    // sees "binary not found" instead of "no errors".
    const ok = !result.spawnFailed && result.code === 0 && diagnostics.length === 0;
    let summary;
    if (result.spawnFailed) {
        summary = `tsc binary failed to spawn (${result.error || 'unknown error'}). Resolved binary: ${binary}.`;
    }
    else if (ok) {
        summary = 'TypeScript diagnostics completed with no errors.';
    }
    else if (diagnostics.length) {
        const errCount = diagnostics.filter(d => { var _a; return ((_a = d.severity) !== null && _a !== void 0 ? _a : 'error') === 'error'; }).length;
        const warnCount = diagnostics.filter(d => d.severity === 'warning').length;
        summary = warnCount
            ? `Found ${errCount} error(s), ${warnCount} warning(s).`
            : `Found ${diagnostics.length} TypeScript error(s).`;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHMtZGlhZ25vc3RpY3MuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvbGliL3RzLWRpYWdub3N0aWNzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQW1CRzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUF3REgsb0NBMEJDO0FBVUQsb0NBU0M7QUFvQ0Qsd0NBNENDO0FBRUQsb0RBMkRDO0FBMkJELHdDQWlGQztBQTVWRCx1Q0FBeUI7QUFDekIsMkNBQTZCO0FBQzdCLGlEQUF5QztBQXFDekMsU0FBUyxNQUFNLENBQUMsUUFBZ0I7SUFDNUIsSUFBSSxDQUFDO1FBQ0QsT0FBTyxFQUFFLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQ25DLENBQUM7SUFBQyxXQUFNLENBQUM7UUFDTCxPQUFPLEtBQUssQ0FBQztJQUNqQixDQUFDO0FBQ0wsQ0FBQztBQUVEOzs7Ozs7R0FNRztBQUNILFNBQWdCLFlBQVksQ0FBQyxXQUFtQjs7SUFDNUMsTUFBTSxPQUFPLEdBQUcsT0FBTyxDQUFDLFFBQVEsS0FBSyxPQUFPLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDO0lBQ2pFLE1BQU0sV0FBVyxHQUFhLEVBQUUsQ0FBQztJQUNqQyxNQUFNLFVBQVUsR0FBRyxNQUFBLE1BQUMsVUFBa0IsQ0FBQyxNQUFNLDBDQUFFLEdBQUcsMENBQUUsSUFBSSxDQUFDO0lBQ3pELElBQUksVUFBVSxFQUFFLENBQUM7UUFDYixXQUFXLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7SUFDM0QsQ0FBQztJQUNELE1BQU0sdUJBQXVCLEdBQWEsRUFBRSxDQUFDO0lBQzdDLEtBQUssTUFBTSxJQUFJLElBQUksV0FBVyxFQUFFLENBQUM7UUFDN0IsdUJBQXVCLENBQUMsSUFBSSxDQUN4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LE9BQU87Z0JBQ0gsT0FBTyxFQUFFLEtBQUs7Z0JBQ2QsUUFBUSxFQUFFLEtBQUs7Z0JBQ2YsUUFBUSxFQUFFLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxTQUFTO2dCQUNoQyxLQUFLLEVBQUUsa0NBQWtDLE1BQUEsR0FBRyxhQUFILEdBQUcsdUJBQUgsR0FBRyxDQUFFLE9BQU8sbUNBQUksTUFBTSxDQUFDLEdBQUcsQ0FBQyxFQUFFO2FBQ3pFLENBQUM7UUFDTixDQUFDO1FBQ0QsSUFBSSxVQUFVLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyxFQUFFLENBQUM7WUFDdEMsT0FBTztnQkFDSCxPQUFPLEVBQUUsSUFBSTtnQkFDYixRQUFRLEVBQUUsSUFBSTtnQkFDZCxRQUFRLEVBQUUsSUFBSSxDQUFDLEdBQUcsRUFBRSxHQUFHLFNBQVM7Z0JBQ2hDLE9BQU87YUFDVixDQUFDO1FBQ04sQ0FBQztJQUNMLENBQUM7SUFDRCxPQUFPO1FBQ0gsT0FBTyxFQUFFLElBQUk7UUFDYixRQUFRLEVBQUUsS0FBSztRQUNmLE9BQU8sRUFBRSxJQUFJO1FBQ2IsUUFBUSxFQUFFLFNBQVM7UUFDbkIsSUFBSSxFQUFFLG9HQUFvRztRQUMxRyxPQUFPO0tBQ1YsQ0FBQztBQUNOLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIHRzLWRpYWdub3N0aWNzIOKAlCBob3N0LXNpZGUgVHlwZVNjcmlwdCBkaWFnbm9zdGljcyArIGNvbXBpbGUtd2FpdCBoZWxwZXJzLlxuICpcbiAqIFRocmVlIHBpZWNlcywgdXNlZCBieSBkZWJ1Zy10b29scy50czpcbiAqICAgLSBmaW5kVHNCaW5hcnkocHJvamVjdFBhdGgpOiBsb2NhdGUgYHRzY2AgKHByb2plY3Qgbm9kZV9tb2R1bGVzIOKGkiBlZGl0b3JcbiAqICAgICBidW5kbGVkIGVuZ2luZSDihpIgbnB4IGZhbGxiYWNrKVxuICogICAtIGZpbmRUc0NvbmZpZyhwcm9qZWN0UGF0aCwgZXhwbGljaXQ/KTogbG9jYXRlIHRzY29uZmlnLmpzb24gKG9yXG4gKiAgICAgdGVtcC90c2NvbmZpZy5jb2Nvcy5qc29uIHdoaWNoIGNvY29zIGdlbmVyYXRlcyBmb3IgdGhlIGVkaXRvcilcbiAqICAgLSBydW5TY3JpcHREaWFnbm9zdGljcyhwcm9qZWN0UGF0aCwgb3B0cyk6IHJ1biBgdHNjIC0tbm9FbWl0IC1wIC4uLmAsXG4gKiAgICAgcGFyc2UgdGhlIG91dHB1dCBpbnRvIHN0cnVjdHVyZWQgZGlhZ25vc3RpY3MuXG4gKiAgIC0gd2FpdEZvckNvbXBpbGUocHJvamVjdFBhdGgsIHRpbWVvdXRNcyk6IHRhaWxcbiAqICAgICB0ZW1wL3Byb2dyYW1taW5nL3BhY2tlci1kcml2ZXIvbG9ncy9kZWJ1Zy5sb2cgZm9yIGNvY29zJ3NcbiAqICAgICBgVGFyZ2V0KGVkaXRvcikgZW5kc2AgbWFya2VyLlxuICpcbiAqIFNvdXJjZXM6XG4gKiAgIC0gRnVucGxheUFJL2Z1bnBsYXktY29jb3MtbWNwIGxpYi9kaWFnbm9zdGljcy5qcyAoYmluYXJ5IGRpc2NvdmVyeVxuICogICAgICsgdHNjIG91dHB1dCBwYXJzZXIpXG4gKiAgIC0gaGFyYWR5L2NvY29zLWNyZWF0b3ItbWNwIHNvdXJjZS90b29scy9kZWJ1Zy10b29scy50czp3YWl0Q29tcGlsZVxuICogICAgIChsb2ctc2l6ZSBkZWx0YSArIG1hcmtlci1zdHJpbmcgZGV0ZWN0aW9uIHBhdHRlcm4pXG4gKi9cblxuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB7IGV4ZWNGaWxlIH0gZnJvbSAnY2hpbGRfcHJvY2Vzcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVHNjRGlhZ25vc3RpYyB7XG4gICAgZmlsZTogc3RyaW5nO1xuICAgIGxpbmU6IG51bWJlcjtcbiAgICBjb2x1bW46IG51bWJlcjtcbiAgICBjb2RlOiBzdHJpbmc7XG4gICAgbWVzc2FnZTogc3RyaW5nO1xuICAgIHNldmVyaXR5PzogJ2Vycm9yJyB8ICd3YXJuaW5nJyB8ICdpbmZvJztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBSdW5TY3JpcHREaWFnbm9zdGljc09wdGlvbnMge1xuICAgIC8qKiBPcHRpb25hbCBvdmVycmlkZSBwYXRoIChhYnNvbHV0ZSBvciByZWxhdGl2ZSB0byBwcm9qZWN0IHJvb3QpLiAqL1xuICAgIHRzY29uZmlnUGF0aD86IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBSdW5TY3JpcHREaWFnbm9zdGljc1Jlc3VsdCB7XG4gICAgb2s6IGJvb2xlYW47XG4gICAgdG9vbDogJ3R5cGVzY3JpcHQnO1xuICAgIGJpbmFyeTogc3RyaW5nO1xuICAgIHRzY29uZmlnUGF0aDogc3RyaW5nO1xuICAgIGV4aXRDb2RlOiBudW1iZXI7XG4gICAgc3VtbWFyeTogc3RyaW5nO1xuICAgIGRpYWdub3N0aWNzOiBUc2NEaWFnbm9zdGljW107XG4gICAgLyoqIFJhdyBzdGRvdXQg4oCUIGtlcHQgZm9yIGRlYnVnZ2luZyB0c2Mgb3V0cHV0IHRoZSBwYXJzZXIgbWlzc2VkLiAqL1xuICAgIHN0ZG91dDogc3RyaW5nO1xuICAgIC8qKiBSYXcgc3RkZXJyIOKAlCBrZXB0IGZvciBkZWJ1Z2dpbmcgdHNjIG91dHB1dCB0aGUgcGFyc2VyIG1pc3NlZC4gKi9cbiAgICBzdGRlcnI6IHN0cmluZztcbiAgICAvKiogdjIuNC45OiBzdXJmYWNlcyBzcGF3biBmYWlsdXJlcyAoRU5PRU5UIGV0Yy4pIHNvIEFJIHNlZXMgYmluYXJ5IHByb2JsZW1zXG4gICAgICogIHNlcGFyYXRlbHkgZnJvbSBjb21waWxlIGVycm9ycy4gRW1wdHkgd2hlbiB0c2MgYWN0dWFsbHkgcmFuLiAqL1xuICAgIHN5c3RlbUVycm9yPzogc3RyaW5nO1xuICAgIC8qKiB2Mi40Ljk6IHRydWUgd2hlbiBleGVjRmlsZSByZXBvcnRlZCBhIG5vbi1udW1lcmljIGVycm9yLmNvZGUgKGJpbmFyeVxuICAgICAqICBub3QgZm91bmQgLyBub3QgZXhlY3V0YWJsZSAvIEVBQ0NFUykuIERpc3RpbmN0IGZyb20gYSBub3JtYWwgbm9uLXplcm9cbiAgICAgKiAgZXhpdCAoY29tcGlsZSBlcnJvcnMpLiAqL1xuICAgIHNwYXduRmFpbGVkPzogYm9vbGVhbjtcbn1cblxuZnVuY3Rpb24gZXhpc3RzKGZpbGVQYXRoOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICB0cnkge1xuICAgICAgICByZXR1cm4gZnMuZXhpc3RzU3luYyhmaWxlUGF0aCk7XG4gICAgfSBjYXRjaCB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG59XG5cbi8qKlxuICogTG9jYXRlIHRoZSB0eXBlc2NyaXB0IGNvbXBpbGVyIGJpbmFyeS4gUHJlZmVyZW5jZSBvcmRlcjpcbiAqICAgMS4gcHJvamVjdCBub2RlX21vZHVsZXMvLmJpbi90c2MoLmNtZClcbiAqICAgMi4gcHJvamVjdCBub2RlX21vZHVsZXMvdHlwZXNjcmlwdC9iaW4vdHNjXG4gKiAgIDMuIGVkaXRvcidzIGJ1bmRsZWQgZW5naW5lIG5vZGVfbW9kdWxlcy8uYmluL3RzY1xuICogICA0LiBucHggKGZhbGxiYWNrIOKAlCBzbG93IGZpcnN0IHJ1biwgYnV0IGFsd2F5cyBwcmVzZW50KVxuICovXG5leHBvcnQgZnVuY3Rpb24gZmluZFRzQmluYXJ5KHByb2plY3RQYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIGNvbnN0IHRzY05hbWUgPSBwcm9jZXNzLnBsYXRmb3JtID09PSAnd2luMzInID8gJ3RzYy5jbWQnIDogJ3RzYyc7XG4gICAgY29uc3QgZWRpdG9yUm9vdHM6IHN0cmluZ1tdID0gW107XG4gICAgY29uc3QgZWRpdG9yUGF0aCA9IChnbG9iYWxUaGlzIGFzIGFueSkuRWRpdG9yPy5BcHA/LnBhdGg7XG4gICAgaWYgKGVkaXRvclBhdGgpIHtcbiAgICAgICAgZWRpdG9yUm9vdHMucHVzaChlZGl0b3JQYXRoLCBwYXRoLmRpcm5hbWUoZWRpdG9yUGF0aCkpO1xuICAgIH1cbiAgICBjb25zdCBlZGl0b3JCdW5kbGVkQ2FuZGlkYXRlczogc3RyaW5nW10gPSBbXTtcbiAgICBmb3IgKGNvbnN0IHJvb3Qgb2YgZWRpdG9yUm9vdHMpIHtcbiAgICAgICAgZWRpdG9yQnVuZGxlZENhbmRpZGF0ZXMucHVzaChcbiAgICAgICAgICAgIHBhdGguam9pbihyb290LCAncmVzb3VyY2VzJywgJzNkJywgJ2VuZ2luZScsICdub2RlX21vZHVsZXMnLCAnLmJpbicsIHRzY05hbWUpLFxuICAgICAgICAgICAgcGF0aC5qb2luKHJvb3QsICdyZXNvdXJjZXMnLCAnM2QnLCAnZW5naW5lJywgJ25vZGVfbW9kdWxlcycsICd0eXBlc2NyaXB0JywgJ2JpbicsICd0c2MnKSxcbiAgICAgICAgICAgIHBhdGguam9pbihyb290LCAnYXBwLmFzYXIudW5wYWNrZWQnLCAnbm9kZV9tb2R1bGVzJywgJ3R5cGVzY3JpcHQnLCAnYmluJywgJ3RzYycpLFxuICAgICAgICAgICAgcGF0aC5qb2luKHJvb3QsICdDb250ZW50cycsICdSZXNvdXJjZXMnLCAncmVzb3VyY2VzJywgJzNkJywgJ2VuZ2luZScsICdub2RlX21vZHVsZXMnLCAnLmJpbicsIHRzY05hbWUpLFxuICAgICAgICAgICAgcGF0aC5qb2luKHJvb3QsICdDb250ZW50cycsICdSZXNvdXJjZXMnLCAncmVzb3VyY2VzJywgJzNkJywgJ2VuZ2luZScsICdub2RlX21vZHVsZXMnLCAndHlwZXNjcmlwdCcsICdiaW4nLCAndHNjJyksXG4gICAgICAgICk7XG4gICAgfVxuICAgIGNvbnN0IGNhbmRpZGF0ZXMgPSBbXG4gICAgICAgIHBhdGguam9pbihwcm9qZWN0UGF0aCwgJ25vZGVfbW9kdWxlcycsICcuYmluJywgdHNjTmFtZSksXG4gICAgICAgIHBhdGguam9pbihwcm9qZWN0UGF0aCwgJ25vZGVfbW9kdWxlcycsICd0eXBlc2NyaXB0JywgJ2JpbicsICd0c2MnKSxcbiAgICAgICAgLi4uZWRpdG9yQnVuZGxlZENhbmRpZGF0ZXMsXG4gICAgXTtcbiAgICBmb3IgKGNvbnN0IGNhbmRpZGF0ZSBvZiBjYW5kaWRhdGVzKSB7XG4gICAgICAgIGlmIChleGlzdHMoY2FuZGlkYXRlKSkgcmV0dXJuIGNhbmRpZGF0ZTtcbiAgICB9XG4gICAgcmV0dXJuIHByb2Nlc3MucGxhdGZvcm0gPT09ICd3aW4zMicgPyAnbnB4LmNtZCcgOiAnbnB4Jztcbn1cblxuLyoqXG4gKiBMb2NhdGUgdGhlIHRzY29uZmlnIHRvIHVzZS4gUHJlZmVyZW5jZSBvcmRlcjpcbiAqICAgMS4gZXhwbGljaXQgcGF0aCBwYXNzZWQgYnkgY2FsbGVyXG4gKiAgIDIuIDxwcm9qZWN0Pi90c2NvbmZpZy5qc29uXG4gKiAgIDMuIDxwcm9qZWN0Pi90ZW1wL3RzY29uZmlnLmNvY29zLmpzb24gKGNvY29zIGF1dG8tZ2VuZXJhdGVzIHRoaXMgZm9yXG4gKiAgICAgIHRoZSBlZGl0b3IncyBUUyBwaXBlbGluZTsgYXZhaWxhYmxlIGV2ZW4gaWYgdXNlciBoYXMgbm8gdG9wLWxldmVsXG4gKiAgICAgIHRzY29uZmlnLmpzb24pXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmaW5kVHNDb25maWcocHJvamVjdFBhdGg6IHN0cmluZywgZXhwbGljaXQ/OiBzdHJpbmcpOiBzdHJpbmcgfCAnJyB7XG4gICAgaWYgKGV4cGxpY2l0KSB7XG4gICAgICAgIHJldHVybiBwYXRoLmlzQWJzb2x1dGUoZXhwbGljaXQpID8gZXhwbGljaXQgOiBwYXRoLmpvaW4ocHJvamVjdFBhdGgsIGV4cGxpY2l0KTtcbiAgICB9XG4gICAgY29uc3QgY2FuZGlkYXRlcyA9IFtcbiAgICAgICAgcGF0aC5qb2luKHByb2plY3RQYXRoLCAndHNjb25maWcuanNvbicpLFxuICAgICAgICBwYXRoLmpvaW4ocHJvamVjdFBhdGgsICd0ZW1wJywgJ3RzY29uZmlnLmNvY29zLmpzb24nKSxcbiAgICBdO1xuICAgIHJldHVybiBjYW5kaWRhdGVzLmZpbmQoZXhpc3RzKSA/PyAnJztcbn1cblxuaW50ZXJmYWNlIEV4ZWNSZXN1bHQgeyBjb2RlOiBudW1iZXI7IHN0ZG91dDogc3RyaW5nOyBzdGRlcnI6IHN0cmluZzsgZXJyb3I6IHN0cmluZzsgc3Bhd25GYWlsZWQ6IGJvb2xlYW47IH1cblxuZnVuY3Rpb24gZXhlY0FzeW5jKGZpbGU6IHN0cmluZywgYXJnczogc3RyaW5nW10sIGN3ZDogc3RyaW5nKTogUHJvbWlzZTxFeGVjUmVzdWx0PiB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgIGV4ZWNGaWxlKGZpbGUsIGFyZ3MsIHsgY3dkLCBtYXhCdWZmZXI6IDggKiAxMDI0ICogMTAyNCwgd2luZG93c0hpZGU6IHRydWUgfSwgKGVycm9yLCBzdGRvdXQsIHN0ZGVycikgPT4ge1xuICAgICAgICAgICAgLy8gdjIuNC45IHJldmlldyBmaXggKGNsYXVkZSArIGNvZGV4IPCflLQpOiBhIG5vbi1udW1lcmljIGVycm9yLmNvZGVcbiAgICAgICAgICAgIC8vIChlLmcuICdFTk9FTlQnIHdoZW4gdGhlIHJlc29sdmVkIHRzYyBiaW5hcnkgZG9lc24ndCBleGlzdCkgd2FzXG4gICAgICAgICAgICAvLyBwcmV2aW91c2x5IGNvZXJjZWQgdG8gMCDihpIgb2s6dHJ1ZSB3aXRoIGVtcHR5IGRpYWdub3N0aWNzIOKGkiBBSVxuICAgICAgICAgICAgLy8gZmFsc2VseSBzZWVzIFwibm8gZXJyb3JzXCIgd2hlbiB0c2MgbmV2ZXIgcmFuLiBUcmVhdCBhbnkgZXJyb3JcbiAgICAgICAgICAgIC8vIHdpdGggYSBub24tbnVtZXJpYyBjb2RlIGFzIGEgc3Bhd24gZmFpbHVyZSAoY29kZT0tMSkgYW5kIGZvcmNlXG4gICAgICAgICAgICAvLyB0aGUgY2FsbGVyIHRvIHN1cmZhY2UgaXQuXG4gICAgICAgICAgICBjb25zdCByYXdDb2RlID0gKGVycm9yIGFzIGFueSk/LmNvZGU7XG4gICAgICAgICAgICBjb25zdCBudW1lcmljQ29kZSA9IHR5cGVvZiByYXdDb2RlID09PSAnbnVtYmVyJyA/IHJhd0NvZGUgOiAoZXJyb3IgPyAtMSA6IDApO1xuICAgICAgICAgICAgY29uc3Qgc3Bhd25GYWlsZWQgPSAhIWVycm9yICYmIHR5cGVvZiByYXdDb2RlICE9PSAnbnVtYmVyJztcbiAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgIGNvZGU6IG51bWVyaWNDb2RlLFxuICAgICAgICAgICAgICAgIHN0ZG91dDogU3RyaW5nKHN0ZG91dCB8fCAnJyksXG4gICAgICAgICAgICAgICAgc3RkZXJyOiBTdHJpbmcoc3RkZXJyIHx8ICcnKSxcbiAgICAgICAgICAgICAgICBlcnJvcjogZXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJycsXG4gICAgICAgICAgICAgICAgc3Bhd25GYWlsZWQsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG59XG5cbi8vIHYyLjQuOSByZXZpZXcgZml4IChnZW1pbmkg8J+foSArIGNsYXVkZSDwn5+hICsgY29kZXgg8J+foSk6IHdpZGVuIHRvIGFsc28gYWNjZXB0XG4vLyBgd2FybmluZ2AgbGluZXMgKHRzYyByYXJlbHkgZW1pdHMgdGhlbSBidXQgVHlwZVNjcmlwdCBwbHVnaW5zIGRvKSBhbmQgdG9cbi8vIGtlZXAgZmlsZS1saW5lLWNvbHVtbiBzaGFwZSBjb21wYXRpYmxlLiBUaGUgZGlhZ25vc3RpYyBzdHJlYW0ncyBgc2V2ZXJpdHlgXG4vLyBpcyBhZGRlZCBzbyBjb25zdW1lcnMgY2FuIGZpbHRlciDigJQgY29kZSBzdGF5cyB0aGUgc2FtZSBzaGFwZSBvdGhlcndpc2UuXG5jb25zdCBUU0NfTElORV9SRSA9IC9eKC4qPylcXCgoXFxkKyksKFxcZCspXFwpOlxccysoZXJyb3J8d2FybmluZ3xpbmZvKVxccysoVFNcXGQrKTpcXHMrKC4qKSQvaTtcbi8vIFByb2plY3Qtc2NvcGUgZGlhZ25vc3RpY3MgKGUuZy4gVFMxODAwMyBcIk5vIGlucHV0cyB3ZXJlIGZvdW5kLi4uXCIpIGhhdmUgbm9cbi8vIGZpbGUvbGluZS9jb2x1bW4g4oCUIHNlcGFyYXRlbHkgY2FwdHVyZWQuXG5jb25zdCBUU0NfUFJPSkVDVF9MSU5FX1JFID0gL15cXHMqKGVycm9yfHdhcm5pbmd8aW5mbylcXHMrKFRTXFxkKyk6XFxzKyguKikkL2k7XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZVRzY091dHB1dChvdXRwdXQ6IHN0cmluZyk6IFRzY0RpYWdub3N0aWNbXSB7XG4gICAgaWYgKCFvdXRwdXQpIHJldHVybiBbXTtcbiAgICBjb25zdCBkaWFnbm9zdGljczogVHNjRGlhZ25vc3RpY1tdID0gW107XG4gICAgbGV0IGxhc3Q6IFRzY0RpYWdub3N0aWMgfCBudWxsID0gbnVsbDtcbiAgICBmb3IgKGNvbnN0IHJhdyBvZiBvdXRwdXQuc3BsaXQoL1xccj9cXG4vKSkge1xuICAgICAgICBjb25zdCBsaW5lID0gcmF3LnJlcGxhY2UoL1xccyskL3UsICcnKTtcbiAgICAgICAgaWYgKCFsaW5lKSB7IGxhc3QgPSBudWxsOyBjb250aW51ZTsgfVxuICAgICAgICBjb25zdCBtID0gVFNDX0xJTkVfUkUuZXhlYyhsaW5lLnRyaW0oKSk7XG4gICAgICAgIGlmIChtKSB7XG4gICAgICAgICAgICBjb25zdCBkaWFnOiBUc2NEaWFnbm9zdGljID0ge1xuICAgICAgICAgICAgICAgIGZpbGU6IG1bMV0sXG4gICAgICAgICAgICAgICAgbGluZTogTnVtYmVyKG1bMl0pLFxuICAgICAgICAgICAgICAgIGNvbHVtbjogTnVtYmVyKG1bM10pLFxuICAgICAgICAgICAgICAgIGNvZGU6IG1bNV0sXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogbVs2XSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICAoZGlhZyBhcyBhbnkpLnNldmVyaXR5ID0gbVs0XS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgZGlhZ25vc3RpY3MucHVzaChkaWFnKTtcbiAgICAgICAgICAgIGxhc3QgPSBkaWFnO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcG0gPSBUU0NfUFJPSkVDVF9MSU5FX1JFLmV4ZWMobGluZS50cmltKCkpO1xuICAgICAgICBpZiAocG0pIHtcbiAgICAgICAgICAgIGNvbnN0IGRpYWc6IFRzY0RpYWdub3N0aWMgPSB7XG4gICAgICAgICAgICAgICAgZmlsZTogJycsXG4gICAgICAgICAgICAgICAgbGluZTogMCxcbiAgICAgICAgICAgICAgICBjb2x1bW46IDAsXG4gICAgICAgICAgICAgICAgY29kZTogcG1bMl0sXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogcG1bM10sXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgKGRpYWcgYXMgYW55KS5zZXZlcml0eSA9IHBtWzFdLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICBkaWFnbm9zdGljcy5wdXNoKGRpYWcpO1xuICAgICAgICAgICAgbGFzdCA9IGRpYWc7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICAvLyB2Mi40LjkgcmV2aWV3IGZpeCAoY29kZXgg8J+foSk6IFR5cGVTY3JpcHQgbXVsdGktbGluZSBkaWFnbm9zdGljc1xuICAgICAgICAvLyBjb250aW51ZSB3aXRoIGluZGVudGVkIGxpbmVzIChlLmcuIFwiVHlwZSAnWCcgaXMgbm90IGFzc2lnbmFibGUgdG9cbiAgICAgICAgLy8gdHlwZSAnWScuXFxuICBQcm9wZXJ0eSAnYScgaXMgbWlzc2luZy5cIikg4oCUIGFwcGVuZCB0byB0aGUgcHJldmlvdXNcbiAgICAgICAgLy8gZGlhZ25vc3RpYydzIG1lc3NhZ2UgaW5zdGVhZCBvZiBkcm9wcGluZyBzaWxlbnRseS5cbiAgICAgICAgaWYgKGxhc3QgJiYgL15cXHMvLnRlc3QocmF3KSkge1xuICAgICAgICAgICAgbGFzdC5tZXNzYWdlID0gYCR7bGFzdC5tZXNzYWdlfVxcbiR7cmF3LnRyaW0oKX1gO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBkaWFnbm9zdGljcztcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJ1blNjcmlwdERpYWdub3N0aWNzKFxuICAgIHByb2plY3RQYXRoOiBzdHJpbmcsXG4gICAgb3B0aW9uczogUnVuU2NyaXB0RGlhZ25vc3RpY3NPcHRpb25zID0ge30sXG4pOiBQcm9taXNlPFJ1blNjcmlwdERpYWdub3N0aWNzUmVzdWx0PiB7XG4gICAgY29uc3QgdHNjb25maWdQYXRoID0gZmluZFRzQ29uZmlnKHByb2plY3RQYXRoLCBvcHRpb25zLnRzY29uZmlnUGF0aCk7XG4gICAgaWYgKCF0c2NvbmZpZ1BhdGggfHwgIWV4aXN0cyh0c2NvbmZpZ1BhdGgpKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBvazogZmFsc2UsXG4gICAgICAgICAgICB0b29sOiAndHlwZXNjcmlwdCcsXG4gICAgICAgICAgICBiaW5hcnk6ICcnLFxuICAgICAgICAgICAgdHNjb25maWdQYXRoOiB0c2NvbmZpZ1BhdGggfHwgJycsXG4gICAgICAgICAgICBleGl0Q29kZTogLTEsXG4gICAgICAgICAgICBzdW1tYXJ5OiAnTm8gdHNjb25maWcuanNvbiBvciB0ZW1wL3RzY29uZmlnLmNvY29zLmpzb24gZm91bmQgaW4gcHJvamVjdC4nLFxuICAgICAgICAgICAgZGlhZ25vc3RpY3M6IFtdLFxuICAgICAgICAgICAgc3Rkb3V0OiAnJyxcbiAgICAgICAgICAgIHN0ZGVycjogJycsXG4gICAgICAgICAgICBzcGF3bkZhaWxlZDogZmFsc2UsXG4gICAgICAgIH07XG4gICAgfVxuICAgIGNvbnN0IGJpbmFyeSA9IGZpbmRUc0JpbmFyeShwcm9qZWN0UGF0aCk7XG4gICAgY29uc3QgaXNOcHggPSAvW1xcXFwvXW5weCg/OlxcLmNtZCk/JC9pLnRlc3QoYmluYXJ5KSB8fCBiaW5hcnkgPT09ICducHgnIHx8IGJpbmFyeSA9PT0gJ25weC5jbWQnO1xuICAgIGNvbnN0IGFyZ3MgPSBpc05weFxuICAgICAgICA/IFsndHNjJywgJy0tbm9FbWl0JywgJy1wJywgdHNjb25maWdQYXRoLCAnLS1wcmV0dHknLCAnZmFsc2UnXVxuICAgICAgICA6IFsnLS1ub0VtaXQnLCAnLXAnLCB0c2NvbmZpZ1BhdGgsICctLXByZXR0eScsICdmYWxzZSddO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWNBc3luYyhiaW5hcnksIGFyZ3MsIHByb2plY3RQYXRoKTtcbiAgICBjb25zdCBtZXJnZWQgPSBbcmVzdWx0LnN0ZG91dCwgcmVzdWx0LnN0ZGVyciwgcmVzdWx0LmVycm9yXS5maWx0ZXIoQm9vbGVhbikuam9pbignXFxuJykudHJpbSgpO1xuICAgIGNvbnN0IGRpYWdub3N0aWNzID0gcGFyc2VUc2NPdXRwdXQobWVyZ2VkKTtcbiAgICAvLyB2Mi40LjkgcmV2aWV3IGZpeDogc3Bhd25GYWlsZWQgKGJpbmFyeSBub3QgZm91bmQpIHdhcyBiZWluZyBzaWxlbnRseVxuICAgIC8vIGNvbGxhcHNlZCB0byBvazp0cnVlLiBOb3cgb2sgcmVxdWlyZXMgYm90aCBhIGNsZWFuIGV4aXQgQU5EIG5vIHNwYXduXG4gICAgLy8gZmFpbHVyZS4gc3VtbWFyeSBjYWxscyBvdXQgdGhlIHNwYXduIGZhaWx1cmUgc2VwYXJhdGVseSBzbyB0aGUgQUlcbiAgICAvLyBzZWVzIFwiYmluYXJ5IG5vdCBmb3VuZFwiIGluc3RlYWQgb2YgXCJubyBlcnJvcnNcIi5cbiAgICBjb25zdCBvayA9ICFyZXN1bHQuc3Bhd25GYWlsZWQgJiYgcmVzdWx0LmNvZGUgPT09IDAgJiYgZGlhZ25vc3RpY3MubGVuZ3RoID09PSAwO1xuICAgIGxldCBzdW1tYXJ5OiBzdHJpbmc7XG4gICAgaWYgKHJlc3VsdC5zcGF3bkZhaWxlZCkge1xuICAgICAgICBzdW1tYXJ5ID0gYHRzYyBiaW5hcnkgZmFpbGVkIHRvIHNwYXduICgke3Jlc3VsdC5lcnJvciB8fCAndW5rbm93biBlcnJvcid9KS4gUmVzb2x2ZWQgYmluYXJ5OiAke2JpbmFyeX0uYDtcbiAgICB9IGVsc2UgaWYgKG9rKSB7XG4gICAgICAgIHN1bW1hcnkgPSAnVHlwZVNjcmlwdCBkaWFnbm9zdGljcyBjb21wbGV0ZWQgd2l0aCBubyBlcnJvcnMuJztcbiAgICB9IGVsc2UgaWYgKGRpYWdub3N0aWNzLmxlbmd0aCkge1xuICAgICAgICBjb25zdCBlcnJDb3VudCA9IGRpYWdub3N0aWNzLmZpbHRlcihkID0+IChkLnNldmVyaXR5ID8/ICdlcnJvcicpID09PSAnZXJyb3InKS5sZW5ndGg7XG4gICAgICAgIGNvbnN0IHdhcm5Db3VudCA9IGRpYWdub3N0aWNzLmZpbHRlcihkID0+IGQuc2V2ZXJpdHkgPT09ICd3YXJuaW5nJykubGVuZ3RoO1xuICAgICAgICBzdW1tYXJ5ID0gd2FybkNvdW50XG4gICAgICAgICAgICA/IGBGb3VuZCAke2VyckNvdW50fSBlcnJvcihzKSwgJHt3YXJuQ291bnR9IHdhcm5pbmcocykuYFxuICAgICAgICAgICAgOiBgRm91bmQgJHtkaWFnbm9zdGljcy5sZW5ndGh9IFR5cGVTY3JpcHQgZXJyb3IocykuYDtcbiAgICB9IGVsc2Uge1xuICAgICAgICBzdW1tYXJ5ID0gbWVyZ2VkIHx8IGBUeXBlU2NyaXB0IGRpYWdub3N0aWNzIHJlcG9ydGVkIGV4aXQgY29kZSAke3Jlc3VsdC5jb2RlfSBidXQgbm8gcGFyc2VkIGRpYWdub3N0aWNzLmA7XG4gICAgfVxuICAgIHJldHVybiB7XG4gICAgICAgIG9rLFxuICAgICAgICB0b29sOiAndHlwZXNjcmlwdCcsXG4gICAgICAgIGJpbmFyeSxcbiAgICAgICAgdHNjb25maWdQYXRoLFxuICAgICAgICBleGl0Q29kZTogcmVzdWx0LmNvZGUsXG4gICAgICAgIHN1bW1hcnksXG4gICAgICAgIGRpYWdub3N0aWNzLFxuICAgICAgICBzdGRvdXQ6IHJlc3VsdC5zdGRvdXQsXG4gICAgICAgIHN0ZGVycjogcmVzdWx0LnN0ZGVycixcbiAgICAgICAgc3Bhd25GYWlsZWQ6IHJlc3VsdC5zcGF3bkZhaWxlZCB8fCB1bmRlZmluZWQsXG4gICAgICAgIHN5c3RlbUVycm9yOiByZXN1bHQuc3Bhd25GYWlsZWQgPyByZXN1bHQuZXJyb3IgOiB1bmRlZmluZWQsXG4gICAgfTtcbn1cblxuLy8gLS0tLSB3YWl0Rm9yQ29tcGlsZSAoaGFyYWR5IHBhdHRlcm4pIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmNvbnN0IENPTVBJTEVfTE9HX1JFTCA9IHBhdGguam9pbigndGVtcCcsICdwcm9ncmFtbWluZycsICdwYWNrZXItZHJpdmVyJywgJ2xvZ3MnLCAnZGVidWcubG9nJyk7XG5jb25zdCBDT01QSUxFX01BUktFUiA9ICdUYXJnZXQoZWRpdG9yKSBlbmRzJztcblxuZXhwb3J0IGludGVyZmFjZSBXYWl0Rm9yQ29tcGlsZVJlc3VsdCB7XG4gICAgc3VjY2VzczogYm9vbGVhbjtcbiAgICBjb21waWxlZDogYm9vbGVhbjtcbiAgICB0aW1lb3V0PzogYm9vbGVhbjtcbiAgICB3YWl0ZWRNczogbnVtYmVyO1xuICAgIG5vdGU/OiBzdHJpbmc7XG4gICAgbG9nUGF0aD86IHN0cmluZztcbiAgICBlcnJvcj86IHN0cmluZztcbn1cblxuLyoqXG4gKiBXYWl0IGZvciB0aGUgY29jb3MgcGFja2VyLWRyaXZlciB0byBsb2cgXCJUYXJnZXQoZWRpdG9yKSBlbmRzXCIgaW5kaWNhdGluZ1xuICogdGhlIFRTIGNvbXBpbGUgcGlwZWxpbmUgZmluaXNoZWQuIFdlIHRhaWwgdGhlIGxvZyBieSB0cmFja2luZyBieXRlXG4gKiBsZW5ndGggYXQgc3RhcnQgdnMgcG9sbC10aW1lLiBJZiB0aGUgbG9nIGRvZXNuJ3QgZ3JvdyB3aXRoaW4gYSBncmFjZVxuICogd2luZG93IChkZWZhdWx0IDJzKSwgd2UgY29uY2x1ZGUgbm8gY29tcGlsZSB3YXMgdHJpZ2dlcmVkIChjbGVhblxuICogcHJvamVjdCwgbm8gcmVjZW50IC50cyBjaGFuZ2VzKSBhbmQgcmV0dXJuIHN1Y2Nlc3MuXG4gKlxuICogQ2FsbGVyIHVzdWFsbHkgcGFpcnMgdGhpcyB3aXRoIGEgYHJlZnJlc2gtYXNzZXRgIHRvIG51ZGdlIGNvY29zIGludG9cbiAqIGRldGVjdGluZyBmcmVzaCBjaGFuZ2VzOyB3ZSBkbyB0aGF0IGFzIGEgbm8tZmFpbCBraWNrIGJlZm9yZSBwb2xsaW5nLlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gd2FpdEZvckNvbXBpbGUoXG4gICAgcHJvamVjdFBhdGg6IHN0cmluZyxcbiAgICB0aW1lb3V0TXM6IG51bWJlciA9IDE1MDAwLFxuKTogUHJvbWlzZTxXYWl0Rm9yQ29tcGlsZVJlc3VsdD4ge1xuICAgIGNvbnN0IGxvZ1BhdGggPSBwYXRoLmpvaW4ocHJvamVjdFBhdGgsIENPTVBJTEVfTE9HX1JFTCk7XG4gICAgaWYgKCFleGlzdHMobG9nUGF0aCkpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgY29tcGlsZWQ6IGZhbHNlLFxuICAgICAgICAgICAgd2FpdGVkTXM6IDAsXG4gICAgICAgICAgICBlcnJvcjogYENvbXBpbGUgbG9nIG5vdCBmb3VuZCBhdCAke2xvZ1BhdGh9LiBIYXMgdGhlIGVkaXRvciBydW4gYSBidWlsZCBwaXBlbGluZSB5ZXQ/YCxcbiAgICAgICAgfTtcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgKEVkaXRvciBhcyBhbnkpPy5NZXNzYWdlPy5yZXF1ZXN0Py4oJ2Fzc2V0LWRiJywgJ3JlZnJlc2gtYXNzZXQnLCAnZGI6Ly9hc3NldHMnKTtcbiAgICB9IGNhdGNoIHsgLyogc3dhbGxvdyDigJQgcmVmcmVzaCBpcyBhIGtpY2ssIG5vdCByZXF1aXJlZCAqLyB9XG5cbiAgICBjb25zdCBpbml0aWFsU2l6ZSA9IGZzLnN0YXRTeW5jKGxvZ1BhdGgpLnNpemU7XG4gICAgY29uc3Qgc3RhcnRUaW1lID0gRGF0ZS5ub3coKTtcbiAgICBjb25zdCBQT0xMX0lOVEVSVkFMID0gMjAwO1xuICAgIGNvbnN0IERFVEVDVF9HUkFDRV9NUyA9IDIwMDA7XG5cbiAgICB3aGlsZSAoRGF0ZS5ub3coKSAtIHN0YXJ0VGltZSA8IHRpbWVvdXRNcykge1xuICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgUE9MTF9JTlRFUlZBTCkpO1xuICAgICAgICBsZXQgY3VycmVudFNpemU6IG51bWJlcjtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGN1cnJlbnRTaXplID0gZnMuc3RhdFN5bmMobG9nUGF0aCkuc2l6ZTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgY29tcGlsZWQ6IGZhbHNlLFxuICAgICAgICAgICAgICAgIHdhaXRlZE1zOiBEYXRlLm5vdygpIC0gc3RhcnRUaW1lLFxuICAgICAgICAgICAgICAgIGVycm9yOiBgc3RhdCBjb21waWxlIGxvZyBmYWlsZWQ6ICR7ZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpfWAsXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIGlmIChjdXJyZW50U2l6ZSA8PSBpbml0aWFsU2l6ZSkge1xuICAgICAgICAgICAgaWYgKERhdGUubm93KCkgLSBzdGFydFRpbWUgPCBERVRFQ1RfR1JBQ0VfTVMpIGNvbnRpbnVlO1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGNvbXBpbGVkOiBmYWxzZSxcbiAgICAgICAgICAgICAgICB3YWl0ZWRNczogRGF0ZS5ub3coKSAtIHN0YXJ0VGltZSxcbiAgICAgICAgICAgICAgICBub3RlOiAnTm8gY29tcGlsYXRpb24gdHJpZ2dlcmVkIChubyBsb2cgZ3Jvd3RoIHdpdGhpbiBncmFjZSB3aW5kb3cpLicsXG4gICAgICAgICAgICAgICAgbG9nUGF0aCxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgbmV3Qnl0ZXMgPSBjdXJyZW50U2l6ZSAtIGluaXRpYWxTaXplO1xuICAgICAgICBsZXQgbmV3Q29udGVudCA9ICcnO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgZmQgPSBmcy5vcGVuU3luYyhsb2dQYXRoLCAncicpO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCBidWZmZXIgPSBCdWZmZXIuYWxsb2MobmV3Qnl0ZXMpO1xuICAgICAgICAgICAgICAgIGZzLnJlYWRTeW5jKGZkLCBidWZmZXIsIDAsIG5ld0J5dGVzLCBpbml0aWFsU2l6ZSk7XG4gICAgICAgICAgICAgICAgbmV3Q29udGVudCA9IGJ1ZmZlci50b1N0cmluZygndXRmOCcpO1xuICAgICAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgICAgICBmcy5jbG9zZVN5bmMoZmQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBjb21waWxlZDogZmFsc2UsXG4gICAgICAgICAgICAgICAgd2FpdGVkTXM6IERhdGUubm93KCkgLSBzdGFydFRpbWUsXG4gICAgICAgICAgICAgICAgZXJyb3I6IGByZWFkIGNvbXBpbGUgbG9nIGRlbHRhIGZhaWxlZDogJHtlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycil9YCxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG5ld0NvbnRlbnQuaW5jbHVkZXMoQ09NUElMRV9NQVJLRVIpKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgY29tcGlsZWQ6IHRydWUsXG4gICAgICAgICAgICAgICAgd2FpdGVkTXM6IERhdGUubm93KCkgLSBzdGFydFRpbWUsXG4gICAgICAgICAgICAgICAgbG9nUGF0aCxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgY29tcGlsZWQ6IGZhbHNlLFxuICAgICAgICB0aW1lb3V0OiB0cnVlLFxuICAgICAgICB3YWl0ZWRNczogdGltZW91dE1zLFxuICAgICAgICBub3RlOiAnVGltZWQgb3V0IHdhaXRpbmcgZm9yIGNvbXBpbGUgbWFya2VyOyBjb21waWxlIG1heSBzdGlsbCBiZSBpbiBwcm9ncmVzcyBvciBubyByZWNvbXBpbGUgd2FzIG5lZWRlZC4nLFxuICAgICAgICBsb2dQYXRoLFxuICAgIH07XG59XG4iXX0=