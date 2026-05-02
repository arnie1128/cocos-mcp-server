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
            resolve({
                code: error && typeof error.code === 'number' ? error.code : 0,
                stdout: String(stdout || ''),
                stderr: String(stderr || ''),
                error: error ? error.message : '',
            });
        });
    });
}
const TSC_LINE_RE = /^(.*)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.*)$/i;
function parseTscOutput(output) {
    if (!output)
        return [];
    const diagnostics = [];
    for (const raw of output.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line)
            continue;
        const match = TSC_LINE_RE.exec(line);
        if (!match)
            continue;
        diagnostics.push({
            file: match[1],
            line: Number(match[2]),
            column: Number(match[3]),
            code: match[4],
            message: match[5],
        });
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
    const ok = result.code === 0 && diagnostics.length === 0;
    return {
        ok,
        tool: 'typescript',
        binary,
        tsconfigPath,
        exitCode: result.code,
        summary: ok
            ? 'TypeScript diagnostics completed with no errors.'
            : diagnostics.length
                ? `Found ${diagnostics.length} TypeScript error(s).`
                : merged || 'TypeScript diagnostics reported a non-zero exit code.',
        diagnostics,
        stdout: result.stdout,
        stderr: result.stderr,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHMtZGlhZ25vc3RpY3MuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvbGliL3RzLWRpYWdub3N0aWNzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQW1CRzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFnREgsb0NBMEJDO0FBVUQsb0NBU0M7QUFtQkQsd0NBaUJDO0FBRUQsb0RBMENDO0FBMkJELHdDQWlGQztBQXZSRCx1Q0FBeUI7QUFDekIsMkNBQTZCO0FBQzdCLGlEQUF5QztBQTZCekMsU0FBUyxNQUFNLENBQUMsUUFBZ0I7SUFDNUIsSUFBSSxDQUFDO1FBQ0QsT0FBTyxFQUFFLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQ25DLENBQUM7SUFBQyxXQUFNLENBQUM7UUFDTCxPQUFPLEtBQUssQ0FBQztJQUNqQixDQUFDO0FBQ0wsQ0FBQztBQUVEOzs7Ozs7R0FNRztBQUNILFNBQWdCLFlBQVksQ0FBQyxXQUFtQjs7SUFDNUMsTUFBTSxPQUFPLEdBQUcsT0FBTyxDQUFDLFFBQVEsS0FBSyxPQUFPLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDO0lBQ2pFLE1BQU0sV0FBVyxHQUFhLEVBQUUsQ0FBQztJQUNqQyxNQUFNLFVBQVUsR0FBRyxNQUFBLE1BQUMsVUFBa0IsQ0FBQyxNQUFNLDBDQUFFLEdBQUcsMENBQUUsSUFBSSxDQUFDO0lBQ3pELElBQUksVUFBVSxFQUFFLENBQUM7UUFDYixXQUFXLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7SUFDM0QsQ0FBQztJQUNELE1BQU0sdUJBQXVCLEdBQWEsRUFBRSxDQUFDO0lBQzdDLEtBQUssTUFBTSxJQUFJLElBQUksV0FBVyxFQUFFLENBQUM7UUFDN0IsdUJBQXVCLENBQUMsSUFBSSxDQUN4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QyxRQUFRLENBQUMsY0FBYyxDQUFDLEVBQUUsQ0FBQztZQUN0QyxPQUFPO2dCQUNILE9BQU8sRUFBRSxJQUFJO2dCQUNiLFFBQVEsRUFBRSxJQUFJO2dCQUNkLFFBQVEsRUFBRSxJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcsU0FBUztnQkFDaEMsT0FBTzthQUNWLENBQUM7UUFDTixDQUFDO0lBQ0wsQ0FBQztJQUNELE9BQU87UUFDSCxPQUFPLEVBQUUsSUFBSTtRQUNiLFFBQVEsRUFBRSxLQUFLO1FBQ2YsT0FBTyxFQUFFLElBQUk7UUFDYixRQUFRLEVBQUUsU0FBUztRQUNuQixJQUFJLEVBQUUsb0dBQW9HO1FBQzFHLE9BQU87S0FDVixDQUFDO0FBQ04sQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogdHMtZGlhZ25vc3RpY3Mg4oCUIGhvc3Qtc2lkZSBUeXBlU2NyaXB0IGRpYWdub3N0aWNzICsgY29tcGlsZS13YWl0IGhlbHBlcnMuXG4gKlxuICogVGhyZWUgcGllY2VzLCB1c2VkIGJ5IGRlYnVnLXRvb2xzLnRzOlxuICogICAtIGZpbmRUc0JpbmFyeShwcm9qZWN0UGF0aCk6IGxvY2F0ZSBgdHNjYCAocHJvamVjdCBub2RlX21vZHVsZXMg4oaSIGVkaXRvclxuICogICAgIGJ1bmRsZWQgZW5naW5lIOKGkiBucHggZmFsbGJhY2spXG4gKiAgIC0gZmluZFRzQ29uZmlnKHByb2plY3RQYXRoLCBleHBsaWNpdD8pOiBsb2NhdGUgdHNjb25maWcuanNvbiAob3JcbiAqICAgICB0ZW1wL3RzY29uZmlnLmNvY29zLmpzb24gd2hpY2ggY29jb3MgZ2VuZXJhdGVzIGZvciB0aGUgZWRpdG9yKVxuICogICAtIHJ1blNjcmlwdERpYWdub3N0aWNzKHByb2plY3RQYXRoLCBvcHRzKTogcnVuIGB0c2MgLS1ub0VtaXQgLXAgLi4uYCxcbiAqICAgICBwYXJzZSB0aGUgb3V0cHV0IGludG8gc3RydWN0dXJlZCBkaWFnbm9zdGljcy5cbiAqICAgLSB3YWl0Rm9yQ29tcGlsZShwcm9qZWN0UGF0aCwgdGltZW91dE1zKTogdGFpbFxuICogICAgIHRlbXAvcHJvZ3JhbW1pbmcvcGFja2VyLWRyaXZlci9sb2dzL2RlYnVnLmxvZyBmb3IgY29jb3Mnc1xuICogICAgIGBUYXJnZXQoZWRpdG9yKSBlbmRzYCBtYXJrZXIuXG4gKlxuICogU291cmNlczpcbiAqICAgLSBGdW5wbGF5QUkvZnVucGxheS1jb2Nvcy1tY3AgbGliL2RpYWdub3N0aWNzLmpzIChiaW5hcnkgZGlzY292ZXJ5XG4gKiAgICAgKyB0c2Mgb3V0cHV0IHBhcnNlcilcbiAqICAgLSBoYXJhZHkvY29jb3MtY3JlYXRvci1tY3Agc291cmNlL3Rvb2xzL2RlYnVnLXRvb2xzLnRzOndhaXRDb21waWxlXG4gKiAgICAgKGxvZy1zaXplIGRlbHRhICsgbWFya2VyLXN0cmluZyBkZXRlY3Rpb24gcGF0dGVybilcbiAqL1xuXG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHsgZXhlY0ZpbGUgfSBmcm9tICdjaGlsZF9wcm9jZXNzJztcblxuZXhwb3J0IGludGVyZmFjZSBUc2NEaWFnbm9zdGljIHtcbiAgICBmaWxlOiBzdHJpbmc7XG4gICAgbGluZTogbnVtYmVyO1xuICAgIGNvbHVtbjogbnVtYmVyO1xuICAgIGNvZGU6IHN0cmluZztcbiAgICBtZXNzYWdlOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUnVuU2NyaXB0RGlhZ25vc3RpY3NPcHRpb25zIHtcbiAgICAvKiogT3B0aW9uYWwgb3ZlcnJpZGUgcGF0aCAoYWJzb2x1dGUgb3IgcmVsYXRpdmUgdG8gcHJvamVjdCByb290KS4gKi9cbiAgICB0c2NvbmZpZ1BhdGg/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUnVuU2NyaXB0RGlhZ25vc3RpY3NSZXN1bHQge1xuICAgIG9rOiBib29sZWFuO1xuICAgIHRvb2w6ICd0eXBlc2NyaXB0JztcbiAgICBiaW5hcnk6IHN0cmluZztcbiAgICB0c2NvbmZpZ1BhdGg6IHN0cmluZztcbiAgICBleGl0Q29kZTogbnVtYmVyO1xuICAgIHN1bW1hcnk6IHN0cmluZztcbiAgICBkaWFnbm9zdGljczogVHNjRGlhZ25vc3RpY1tdO1xuICAgIC8qKiBSYXcgc3Rkb3V0IOKAlCBrZXB0IGZvciBkZWJ1Z2dpbmcgdHNjIG91dHB1dCB0aGUgcGFyc2VyIG1pc3NlZC4gKi9cbiAgICBzdGRvdXQ6IHN0cmluZztcbiAgICAvKiogUmF3IHN0ZGVyciDigJQga2VwdCBmb3IgZGVidWdnaW5nIHRzYyBvdXRwdXQgdGhlIHBhcnNlciBtaXNzZWQuICovXG4gICAgc3RkZXJyOiBzdHJpbmc7XG59XG5cbmZ1bmN0aW9uIGV4aXN0cyhmaWxlUGF0aDogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgdHJ5IHtcbiAgICAgICAgcmV0dXJuIGZzLmV4aXN0c1N5bmMoZmlsZVBhdGgpO1xuICAgIH0gY2F0Y2gge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxufVxuXG4vKipcbiAqIExvY2F0ZSB0aGUgdHlwZXNjcmlwdCBjb21waWxlciBiaW5hcnkuIFByZWZlcmVuY2Ugb3JkZXI6XG4gKiAgIDEuIHByb2plY3Qgbm9kZV9tb2R1bGVzLy5iaW4vdHNjKC5jbWQpXG4gKiAgIDIuIHByb2plY3Qgbm9kZV9tb2R1bGVzL3R5cGVzY3JpcHQvYmluL3RzY1xuICogICAzLiBlZGl0b3IncyBidW5kbGVkIGVuZ2luZSBub2RlX21vZHVsZXMvLmJpbi90c2NcbiAqICAgNC4gbnB4IChmYWxsYmFjayDigJQgc2xvdyBmaXJzdCBydW4sIGJ1dCBhbHdheXMgcHJlc2VudClcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZpbmRUc0JpbmFyeShwcm9qZWN0UGF0aDogc3RyaW5nKTogc3RyaW5nIHtcbiAgICBjb25zdCB0c2NOYW1lID0gcHJvY2Vzcy5wbGF0Zm9ybSA9PT0gJ3dpbjMyJyA/ICd0c2MuY21kJyA6ICd0c2MnO1xuICAgIGNvbnN0IGVkaXRvclJvb3RzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGNvbnN0IGVkaXRvclBhdGggPSAoZ2xvYmFsVGhpcyBhcyBhbnkpLkVkaXRvcj8uQXBwPy5wYXRoO1xuICAgIGlmIChlZGl0b3JQYXRoKSB7XG4gICAgICAgIGVkaXRvclJvb3RzLnB1c2goZWRpdG9yUGF0aCwgcGF0aC5kaXJuYW1lKGVkaXRvclBhdGgpKTtcbiAgICB9XG4gICAgY29uc3QgZWRpdG9yQnVuZGxlZENhbmRpZGF0ZXM6IHN0cmluZ1tdID0gW107XG4gICAgZm9yIChjb25zdCByb290IG9mIGVkaXRvclJvb3RzKSB7XG4gICAgICAgIGVkaXRvckJ1bmRsZWRDYW5kaWRhdGVzLnB1c2goXG4gICAgICAgICAgICBwYXRoLmpvaW4ocm9vdCwgJ3Jlc291cmNlcycsICczZCcsICdlbmdpbmUnLCAnbm9kZV9tb2R1bGVzJywgJy5iaW4nLCB0c2NOYW1lKSxcbiAgICAgICAgICAgIHBhdGguam9pbihyb290LCAncmVzb3VyY2VzJywgJzNkJywgJ2VuZ2luZScsICdub2RlX21vZHVsZXMnLCAndHlwZXNjcmlwdCcsICdiaW4nLCAndHNjJyksXG4gICAgICAgICAgICBwYXRoLmpvaW4ocm9vdCwgJ2FwcC5hc2FyLnVucGFja2VkJywgJ25vZGVfbW9kdWxlcycsICd0eXBlc2NyaXB0JywgJ2JpbicsICd0c2MnKSxcbiAgICAgICAgICAgIHBhdGguam9pbihyb290LCAnQ29udGVudHMnLCAnUmVzb3VyY2VzJywgJ3Jlc291cmNlcycsICczZCcsICdlbmdpbmUnLCAnbm9kZV9tb2R1bGVzJywgJy5iaW4nLCB0c2NOYW1lKSxcbiAgICAgICAgICAgIHBhdGguam9pbihyb290LCAnQ29udGVudHMnLCAnUmVzb3VyY2VzJywgJ3Jlc291cmNlcycsICczZCcsICdlbmdpbmUnLCAnbm9kZV9tb2R1bGVzJywgJ3R5cGVzY3JpcHQnLCAnYmluJywgJ3RzYycpLFxuICAgICAgICApO1xuICAgIH1cbiAgICBjb25zdCBjYW5kaWRhdGVzID0gW1xuICAgICAgICBwYXRoLmpvaW4ocHJvamVjdFBhdGgsICdub2RlX21vZHVsZXMnLCAnLmJpbicsIHRzY05hbWUpLFxuICAgICAgICBwYXRoLmpvaW4ocHJvamVjdFBhdGgsICdub2RlX21vZHVsZXMnLCAndHlwZXNjcmlwdCcsICdiaW4nLCAndHNjJyksXG4gICAgICAgIC4uLmVkaXRvckJ1bmRsZWRDYW5kaWRhdGVzLFxuICAgIF07XG4gICAgZm9yIChjb25zdCBjYW5kaWRhdGUgb2YgY2FuZGlkYXRlcykge1xuICAgICAgICBpZiAoZXhpc3RzKGNhbmRpZGF0ZSkpIHJldHVybiBjYW5kaWRhdGU7XG4gICAgfVxuICAgIHJldHVybiBwcm9jZXNzLnBsYXRmb3JtID09PSAnd2luMzInID8gJ25weC5jbWQnIDogJ25weCc7XG59XG5cbi8qKlxuICogTG9jYXRlIHRoZSB0c2NvbmZpZyB0byB1c2UuIFByZWZlcmVuY2Ugb3JkZXI6XG4gKiAgIDEuIGV4cGxpY2l0IHBhdGggcGFzc2VkIGJ5IGNhbGxlclxuICogICAyLiA8cHJvamVjdD4vdHNjb25maWcuanNvblxuICogICAzLiA8cHJvamVjdD4vdGVtcC90c2NvbmZpZy5jb2Nvcy5qc29uIChjb2NvcyBhdXRvLWdlbmVyYXRlcyB0aGlzIGZvclxuICogICAgICB0aGUgZWRpdG9yJ3MgVFMgcGlwZWxpbmU7IGF2YWlsYWJsZSBldmVuIGlmIHVzZXIgaGFzIG5vIHRvcC1sZXZlbFxuICogICAgICB0c2NvbmZpZy5qc29uKVxuICovXG5leHBvcnQgZnVuY3Rpb24gZmluZFRzQ29uZmlnKHByb2plY3RQYXRoOiBzdHJpbmcsIGV4cGxpY2l0Pzogc3RyaW5nKTogc3RyaW5nIHwgJycge1xuICAgIGlmIChleHBsaWNpdCkge1xuICAgICAgICByZXR1cm4gcGF0aC5pc0Fic29sdXRlKGV4cGxpY2l0KSA/IGV4cGxpY2l0IDogcGF0aC5qb2luKHByb2plY3RQYXRoLCBleHBsaWNpdCk7XG4gICAgfVxuICAgIGNvbnN0IGNhbmRpZGF0ZXMgPSBbXG4gICAgICAgIHBhdGguam9pbihwcm9qZWN0UGF0aCwgJ3RzY29uZmlnLmpzb24nKSxcbiAgICAgICAgcGF0aC5qb2luKHByb2plY3RQYXRoLCAndGVtcCcsICd0c2NvbmZpZy5jb2Nvcy5qc29uJyksXG4gICAgXTtcbiAgICByZXR1cm4gY2FuZGlkYXRlcy5maW5kKGV4aXN0cykgPz8gJyc7XG59XG5cbmludGVyZmFjZSBFeGVjUmVzdWx0IHsgY29kZTogbnVtYmVyOyBzdGRvdXQ6IHN0cmluZzsgc3RkZXJyOiBzdHJpbmc7IGVycm9yOiBzdHJpbmc7IH1cblxuZnVuY3Rpb24gZXhlY0FzeW5jKGZpbGU6IHN0cmluZywgYXJnczogc3RyaW5nW10sIGN3ZDogc3RyaW5nKTogUHJvbWlzZTxFeGVjUmVzdWx0PiB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgIGV4ZWNGaWxlKGZpbGUsIGFyZ3MsIHsgY3dkLCBtYXhCdWZmZXI6IDggKiAxMDI0ICogMTAyNCwgd2luZG93c0hpZGU6IHRydWUgfSwgKGVycm9yLCBzdGRvdXQsIHN0ZGVycikgPT4ge1xuICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgY29kZTogZXJyb3IgJiYgdHlwZW9mIChlcnJvciBhcyBhbnkpLmNvZGUgPT09ICdudW1iZXInID8gKGVycm9yIGFzIGFueSkuY29kZSA6IDAsXG4gICAgICAgICAgICAgICAgc3Rkb3V0OiBTdHJpbmcoc3Rkb3V0IHx8ICcnKSxcbiAgICAgICAgICAgICAgICBzdGRlcnI6IFN0cmluZyhzdGRlcnIgfHwgJycpLFxuICAgICAgICAgICAgICAgIGVycm9yOiBlcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnJyxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9KTtcbn1cblxuY29uc3QgVFNDX0xJTkVfUkUgPSAvXiguKilcXCgoXFxkKyksKFxcZCspXFwpOlxccytlcnJvclxccysoVFNcXGQrKTpcXHMrKC4qKSQvaTtcblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlVHNjT3V0cHV0KG91dHB1dDogc3RyaW5nKTogVHNjRGlhZ25vc3RpY1tdIHtcbiAgICBpZiAoIW91dHB1dCkgcmV0dXJuIFtdO1xuICAgIGNvbnN0IGRpYWdub3N0aWNzOiBUc2NEaWFnbm9zdGljW10gPSBbXTtcbiAgICBmb3IgKGNvbnN0IHJhdyBvZiBvdXRwdXQuc3BsaXQoL1xccj9cXG4vKSkge1xuICAgICAgICBjb25zdCBsaW5lID0gcmF3LnRyaW0oKTtcbiAgICAgICAgaWYgKCFsaW5lKSBjb250aW51ZTtcbiAgICAgICAgY29uc3QgbWF0Y2ggPSBUU0NfTElORV9SRS5leGVjKGxpbmUpO1xuICAgICAgICBpZiAoIW1hdGNoKSBjb250aW51ZTtcbiAgICAgICAgZGlhZ25vc3RpY3MucHVzaCh7XG4gICAgICAgICAgICBmaWxlOiBtYXRjaFsxXSxcbiAgICAgICAgICAgIGxpbmU6IE51bWJlcihtYXRjaFsyXSksXG4gICAgICAgICAgICBjb2x1bW46IE51bWJlcihtYXRjaFszXSksXG4gICAgICAgICAgICBjb2RlOiBtYXRjaFs0XSxcbiAgICAgICAgICAgIG1lc3NhZ2U6IG1hdGNoWzVdLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgcmV0dXJuIGRpYWdub3N0aWNzO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcnVuU2NyaXB0RGlhZ25vc3RpY3MoXG4gICAgcHJvamVjdFBhdGg6IHN0cmluZyxcbiAgICBvcHRpb25zOiBSdW5TY3JpcHREaWFnbm9zdGljc09wdGlvbnMgPSB7fSxcbik6IFByb21pc2U8UnVuU2NyaXB0RGlhZ25vc3RpY3NSZXN1bHQ+IHtcbiAgICBjb25zdCB0c2NvbmZpZ1BhdGggPSBmaW5kVHNDb25maWcocHJvamVjdFBhdGgsIG9wdGlvbnMudHNjb25maWdQYXRoKTtcbiAgICBpZiAoIXRzY29uZmlnUGF0aCB8fCAhZXhpc3RzKHRzY29uZmlnUGF0aCkpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIG9rOiBmYWxzZSxcbiAgICAgICAgICAgIHRvb2w6ICd0eXBlc2NyaXB0JyxcbiAgICAgICAgICAgIGJpbmFyeTogJycsXG4gICAgICAgICAgICB0c2NvbmZpZ1BhdGg6IHRzY29uZmlnUGF0aCB8fCAnJyxcbiAgICAgICAgICAgIGV4aXRDb2RlOiAtMSxcbiAgICAgICAgICAgIHN1bW1hcnk6ICdObyB0c2NvbmZpZy5qc29uIG9yIHRlbXAvdHNjb25maWcuY29jb3MuanNvbiBmb3VuZCBpbiBwcm9qZWN0LicsXG4gICAgICAgICAgICBkaWFnbm9zdGljczogW10sXG4gICAgICAgICAgICBzdGRvdXQ6ICcnLFxuICAgICAgICAgICAgc3RkZXJyOiAnJyxcbiAgICAgICAgfTtcbiAgICB9XG4gICAgY29uc3QgYmluYXJ5ID0gZmluZFRzQmluYXJ5KHByb2plY3RQYXRoKTtcbiAgICBjb25zdCBpc05weCA9IC9bXFxcXC9dbnB4KD86XFwuY21kKT8kL2kudGVzdChiaW5hcnkpIHx8IGJpbmFyeSA9PT0gJ25weCcgfHwgYmluYXJ5ID09PSAnbnB4LmNtZCc7XG4gICAgY29uc3QgYXJncyA9IGlzTnB4XG4gICAgICAgID8gWyd0c2MnLCAnLS1ub0VtaXQnLCAnLXAnLCB0c2NvbmZpZ1BhdGgsICctLXByZXR0eScsICdmYWxzZSddXG4gICAgICAgIDogWyctLW5vRW1pdCcsICctcCcsIHRzY29uZmlnUGF0aCwgJy0tcHJldHR5JywgJ2ZhbHNlJ107XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZXhlY0FzeW5jKGJpbmFyeSwgYXJncywgcHJvamVjdFBhdGgpO1xuICAgIGNvbnN0IG1lcmdlZCA9IFtyZXN1bHQuc3Rkb3V0LCByZXN1bHQuc3RkZXJyLCByZXN1bHQuZXJyb3JdLmZpbHRlcihCb29sZWFuKS5qb2luKCdcXG4nKS50cmltKCk7XG4gICAgY29uc3QgZGlhZ25vc3RpY3MgPSBwYXJzZVRzY091dHB1dChtZXJnZWQpO1xuICAgIGNvbnN0IG9rID0gcmVzdWx0LmNvZGUgPT09IDAgJiYgZGlhZ25vc3RpY3MubGVuZ3RoID09PSAwO1xuICAgIHJldHVybiB7XG4gICAgICAgIG9rLFxuICAgICAgICB0b29sOiAndHlwZXNjcmlwdCcsXG4gICAgICAgIGJpbmFyeSxcbiAgICAgICAgdHNjb25maWdQYXRoLFxuICAgICAgICBleGl0Q29kZTogcmVzdWx0LmNvZGUsXG4gICAgICAgIHN1bW1hcnk6IG9rXG4gICAgICAgICAgICA/ICdUeXBlU2NyaXB0IGRpYWdub3N0aWNzIGNvbXBsZXRlZCB3aXRoIG5vIGVycm9ycy4nXG4gICAgICAgICAgICA6IGRpYWdub3N0aWNzLmxlbmd0aFxuICAgICAgICAgICAgICAgID8gYEZvdW5kICR7ZGlhZ25vc3RpY3MubGVuZ3RofSBUeXBlU2NyaXB0IGVycm9yKHMpLmBcbiAgICAgICAgICAgICAgICA6IG1lcmdlZCB8fCAnVHlwZVNjcmlwdCBkaWFnbm9zdGljcyByZXBvcnRlZCBhIG5vbi16ZXJvIGV4aXQgY29kZS4nLFxuICAgICAgICBkaWFnbm9zdGljcyxcbiAgICAgICAgc3Rkb3V0OiByZXN1bHQuc3Rkb3V0LFxuICAgICAgICBzdGRlcnI6IHJlc3VsdC5zdGRlcnIsXG4gICAgfTtcbn1cblxuLy8gLS0tLSB3YWl0Rm9yQ29tcGlsZSAoaGFyYWR5IHBhdHRlcm4pIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmNvbnN0IENPTVBJTEVfTE9HX1JFTCA9IHBhdGguam9pbigndGVtcCcsICdwcm9ncmFtbWluZycsICdwYWNrZXItZHJpdmVyJywgJ2xvZ3MnLCAnZGVidWcubG9nJyk7XG5jb25zdCBDT01QSUxFX01BUktFUiA9ICdUYXJnZXQoZWRpdG9yKSBlbmRzJztcblxuZXhwb3J0IGludGVyZmFjZSBXYWl0Rm9yQ29tcGlsZVJlc3VsdCB7XG4gICAgc3VjY2VzczogYm9vbGVhbjtcbiAgICBjb21waWxlZDogYm9vbGVhbjtcbiAgICB0aW1lb3V0PzogYm9vbGVhbjtcbiAgICB3YWl0ZWRNczogbnVtYmVyO1xuICAgIG5vdGU/OiBzdHJpbmc7XG4gICAgbG9nUGF0aD86IHN0cmluZztcbiAgICBlcnJvcj86IHN0cmluZztcbn1cblxuLyoqXG4gKiBXYWl0IGZvciB0aGUgY29jb3MgcGFja2VyLWRyaXZlciB0byBsb2cgXCJUYXJnZXQoZWRpdG9yKSBlbmRzXCIgaW5kaWNhdGluZ1xuICogdGhlIFRTIGNvbXBpbGUgcGlwZWxpbmUgZmluaXNoZWQuIFdlIHRhaWwgdGhlIGxvZyBieSB0cmFja2luZyBieXRlXG4gKiBsZW5ndGggYXQgc3RhcnQgdnMgcG9sbC10aW1lLiBJZiB0aGUgbG9nIGRvZXNuJ3QgZ3JvdyB3aXRoaW4gYSBncmFjZVxuICogd2luZG93IChkZWZhdWx0IDJzKSwgd2UgY29uY2x1ZGUgbm8gY29tcGlsZSB3YXMgdHJpZ2dlcmVkIChjbGVhblxuICogcHJvamVjdCwgbm8gcmVjZW50IC50cyBjaGFuZ2VzKSBhbmQgcmV0dXJuIHN1Y2Nlc3MuXG4gKlxuICogQ2FsbGVyIHVzdWFsbHkgcGFpcnMgdGhpcyB3aXRoIGEgYHJlZnJlc2gtYXNzZXRgIHRvIG51ZGdlIGNvY29zIGludG9cbiAqIGRldGVjdGluZyBmcmVzaCBjaGFuZ2VzOyB3ZSBkbyB0aGF0IGFzIGEgbm8tZmFpbCBraWNrIGJlZm9yZSBwb2xsaW5nLlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gd2FpdEZvckNvbXBpbGUoXG4gICAgcHJvamVjdFBhdGg6IHN0cmluZyxcbiAgICB0aW1lb3V0TXM6IG51bWJlciA9IDE1MDAwLFxuKTogUHJvbWlzZTxXYWl0Rm9yQ29tcGlsZVJlc3VsdD4ge1xuICAgIGNvbnN0IGxvZ1BhdGggPSBwYXRoLmpvaW4ocHJvamVjdFBhdGgsIENPTVBJTEVfTE9HX1JFTCk7XG4gICAgaWYgKCFleGlzdHMobG9nUGF0aCkpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgY29tcGlsZWQ6IGZhbHNlLFxuICAgICAgICAgICAgd2FpdGVkTXM6IDAsXG4gICAgICAgICAgICBlcnJvcjogYENvbXBpbGUgbG9nIG5vdCBmb3VuZCBhdCAke2xvZ1BhdGh9LiBIYXMgdGhlIGVkaXRvciBydW4gYSBidWlsZCBwaXBlbGluZSB5ZXQ/YCxcbiAgICAgICAgfTtcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgKEVkaXRvciBhcyBhbnkpPy5NZXNzYWdlPy5yZXF1ZXN0Py4oJ2Fzc2V0LWRiJywgJ3JlZnJlc2gtYXNzZXQnLCAnZGI6Ly9hc3NldHMnKTtcbiAgICB9IGNhdGNoIHsgLyogc3dhbGxvdyDigJQgcmVmcmVzaCBpcyBhIGtpY2ssIG5vdCByZXF1aXJlZCAqLyB9XG5cbiAgICBjb25zdCBpbml0aWFsU2l6ZSA9IGZzLnN0YXRTeW5jKGxvZ1BhdGgpLnNpemU7XG4gICAgY29uc3Qgc3RhcnRUaW1lID0gRGF0ZS5ub3coKTtcbiAgICBjb25zdCBQT0xMX0lOVEVSVkFMID0gMjAwO1xuICAgIGNvbnN0IERFVEVDVF9HUkFDRV9NUyA9IDIwMDA7XG5cbiAgICB3aGlsZSAoRGF0ZS5ub3coKSAtIHN0YXJ0VGltZSA8IHRpbWVvdXRNcykge1xuICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgUE9MTF9JTlRFUlZBTCkpO1xuICAgICAgICBsZXQgY3VycmVudFNpemU6IG51bWJlcjtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGN1cnJlbnRTaXplID0gZnMuc3RhdFN5bmMobG9nUGF0aCkuc2l6ZTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgY29tcGlsZWQ6IGZhbHNlLFxuICAgICAgICAgICAgICAgIHdhaXRlZE1zOiBEYXRlLm5vdygpIC0gc3RhcnRUaW1lLFxuICAgICAgICAgICAgICAgIGVycm9yOiBgc3RhdCBjb21waWxlIGxvZyBmYWlsZWQ6ICR7ZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpfWAsXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIGlmIChjdXJyZW50U2l6ZSA8PSBpbml0aWFsU2l6ZSkge1xuICAgICAgICAgICAgaWYgKERhdGUubm93KCkgLSBzdGFydFRpbWUgPCBERVRFQ1RfR1JBQ0VfTVMpIGNvbnRpbnVlO1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGNvbXBpbGVkOiBmYWxzZSxcbiAgICAgICAgICAgICAgICB3YWl0ZWRNczogRGF0ZS5ub3coKSAtIHN0YXJ0VGltZSxcbiAgICAgICAgICAgICAgICBub3RlOiAnTm8gY29tcGlsYXRpb24gdHJpZ2dlcmVkIChubyBsb2cgZ3Jvd3RoIHdpdGhpbiBncmFjZSB3aW5kb3cpLicsXG4gICAgICAgICAgICAgICAgbG9nUGF0aCxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgbmV3Qnl0ZXMgPSBjdXJyZW50U2l6ZSAtIGluaXRpYWxTaXplO1xuICAgICAgICBsZXQgbmV3Q29udGVudCA9ICcnO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgZmQgPSBmcy5vcGVuU3luYyhsb2dQYXRoLCAncicpO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCBidWZmZXIgPSBCdWZmZXIuYWxsb2MobmV3Qnl0ZXMpO1xuICAgICAgICAgICAgICAgIGZzLnJlYWRTeW5jKGZkLCBidWZmZXIsIDAsIG5ld0J5dGVzLCBpbml0aWFsU2l6ZSk7XG4gICAgICAgICAgICAgICAgbmV3Q29udGVudCA9IGJ1ZmZlci50b1N0cmluZygndXRmOCcpO1xuICAgICAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgICAgICBmcy5jbG9zZVN5bmMoZmQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBjb21waWxlZDogZmFsc2UsXG4gICAgICAgICAgICAgICAgd2FpdGVkTXM6IERhdGUubm93KCkgLSBzdGFydFRpbWUsXG4gICAgICAgICAgICAgICAgZXJyb3I6IGByZWFkIGNvbXBpbGUgbG9nIGRlbHRhIGZhaWxlZDogJHtlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycil9YCxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG5ld0NvbnRlbnQuaW5jbHVkZXMoQ09NUElMRV9NQVJLRVIpKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgY29tcGlsZWQ6IHRydWUsXG4gICAgICAgICAgICAgICAgd2FpdGVkTXM6IERhdGUubm93KCkgLSBzdGFydFRpbWUsXG4gICAgICAgICAgICAgICAgbG9nUGF0aCxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgY29tcGlsZWQ6IGZhbHNlLFxuICAgICAgICB0aW1lb3V0OiB0cnVlLFxuICAgICAgICB3YWl0ZWRNczogdGltZW91dE1zLFxuICAgICAgICBub3RlOiAnVGltZWQgb3V0IHdhaXRpbmcgZm9yIGNvbXBpbGUgbWFya2VyOyBjb21waWxlIG1heSBzdGlsbCBiZSBpbiBwcm9ncmVzcyBvciBubyByZWNvbXBpbGUgd2FzIG5lZWRlZC4nLFxuICAgICAgICBsb2dQYXRoLFxuICAgIH07XG59XG4iXX0=