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

import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';

export interface TscDiagnostic {
    file: string;
    line: number;
    column: number;
    code: string;
    message: string;
    severity?: 'error' | 'warning' | 'info';
}

export interface RunScriptDiagnosticsOptions {
    /** Optional override path (absolute or relative to project root). */
    tsconfigPath?: string;
}

export interface RunScriptDiagnosticsResult {
    ok: boolean;
    tool: 'typescript';
    binary: string;
    tsconfigPath: string;
    exitCode: number;
    summary: string;
    diagnostics: TscDiagnostic[];
    /** Raw stdout — kept for debugging tsc output the parser missed. */
    stdout: string;
    /** Raw stderr — kept for debugging tsc output the parser missed. */
    stderr: string;
    /** v2.4.9: surfaces spawn failures (ENOENT etc.) so AI sees binary problems
     *  separately from compile errors. Empty when tsc actually ran. */
    systemError?: string;
    /** v2.4.9: true when execFile reported a non-numeric error.code (binary
     *  not found / not executable / EACCES). Distinct from a normal non-zero
     *  exit (compile errors). */
    spawnFailed?: boolean;
}

function exists(filePath: string): boolean {
    try {
        return fs.existsSync(filePath);
    } catch {
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
export function findTsBinary(projectPath: string): string {
    const tscName = process.platform === 'win32' ? 'tsc.cmd' : 'tsc';
    const editorRoots: string[] = [];
    const editorPath = (globalThis as any).Editor?.App?.path;
    if (editorPath) {
        editorRoots.push(editorPath, path.dirname(editorPath));
    }
    const editorBundledCandidates: string[] = [];
    for (const root of editorRoots) {
        editorBundledCandidates.push(
            path.join(root, 'resources', '3d', 'engine', 'node_modules', '.bin', tscName),
            path.join(root, 'resources', '3d', 'engine', 'node_modules', 'typescript', 'bin', 'tsc'),
            path.join(root, 'app.asar.unpacked', 'node_modules', 'typescript', 'bin', 'tsc'),
            path.join(root, 'Contents', 'Resources', 'resources', '3d', 'engine', 'node_modules', '.bin', tscName),
            path.join(root, 'Contents', 'Resources', 'resources', '3d', 'engine', 'node_modules', 'typescript', 'bin', 'tsc'),
        );
    }
    const candidates = [
        path.join(projectPath, 'node_modules', '.bin', tscName),
        path.join(projectPath, 'node_modules', 'typescript', 'bin', 'tsc'),
        ...editorBundledCandidates,
    ];
    for (const candidate of candidates) {
        if (exists(candidate)) return candidate;
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
export function findTsConfig(projectPath: string, explicit?: string): string | '' {
    if (explicit) {
        return path.isAbsolute(explicit) ? explicit : path.join(projectPath, explicit);
    }
    const candidates = [
        path.join(projectPath, 'tsconfig.json'),
        path.join(projectPath, 'temp', 'tsconfig.cocos.json'),
    ];
    return candidates.find(exists) ?? '';
}

interface ExecResult { code: number; stdout: string; stderr: string; error: string; spawnFailed: boolean; }

function execAsync(file: string, args: string[], cwd: string): Promise<ExecResult> {
    return new Promise((resolve) => {
        const onResult = (error: any, stdout: any, stderr: any) => {
            // v2.4.9 review fix (claude + codex 🔴): a non-numeric error.code
            // (e.g. 'ENOENT' when the resolved tsc binary doesn't exist, or
            // 'EINVAL' on Node 22+ when execFile is called against a .cmd
            // shim without shell:true) was previously coerced to 0 → ok:true
            // with empty diagnostics → AI falsely sees "no errors" when tsc
            // never ran. Treat any error with a non-numeric code as a spawn
            // failure (code=-1) and force the caller to surface it.
            const rawCode = error?.code;
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
        const quoteForCmd = (s: string): string => {
            // Quote only if the arg contains whitespace or shell-special
            // characters; double internal quotes per cmd.exe escape rules.
            if (!/[\s"&<>|^]/.test(s)) return s;
            return '"' + s.replace(/"/g, '""') + '"';
        };
        const fileArg = isWindowsShim ? quoteForCmd(file) : file;
        const argsArg = isWindowsShim ? args.map(quoteForCmd) : args;
        try {
            execFile(fileArg, argsArg, {
                cwd,
                maxBuffer: 8 * 1024 * 1024,
                windowsHide: true,
                shell: isWindowsShim,
            }, onResult);
        } catch (err: any) {
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

export function parseTscOutput(output: string): TscDiagnostic[] {
    if (!output) return [];
    const diagnostics: TscDiagnostic[] = [];
    let last: TscDiagnostic | null = null;
    for (const raw of output.split(/\r?\n/)) {
        const line = raw.replace(/\s+$/u, '');
        if (!line) { last = null; continue; }
        const m = TSC_LINE_RE.exec(line.trim());
        if (m) {
            const diag: TscDiagnostic = {
                file: m[1],
                line: Number(m[2]),
                column: Number(m[3]),
                code: m[5],
                message: m[6],
            };
            (diag as any).severity = m[4].toLowerCase();
            diagnostics.push(diag);
            last = diag;
            continue;
        }
        const pm = TSC_PROJECT_LINE_RE.exec(line.trim());
        if (pm) {
            const diag: TscDiagnostic = {
                file: '',
                line: 0,
                column: 0,
                code: pm[2],
                message: pm[3],
            };
            (diag as any).severity = pm[1].toLowerCase();
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

export async function runScriptDiagnostics(
    projectPath: string,
    options: RunScriptDiagnosticsOptions = {},
): Promise<RunScriptDiagnosticsResult> {
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
    const errCount = diagnostics.filter(d => (d.severity ?? 'error') === 'error').length;
    const warnCount = diagnostics.filter(d => d.severity === 'warning').length;
    const ok = !result.spawnFailed && result.code === 0 && errCount === 0;
    let summary: string;
    if (result.spawnFailed) {
        summary = `tsc binary failed to spawn (${result.error || 'unknown error'}). Resolved binary: ${binary}.`;
    } else if (ok) {
        summary = warnCount
            ? `TypeScript diagnostics completed with no errors (${warnCount} warning(s) reported).`
            : 'TypeScript diagnostics completed with no errors.';
    } else if (errCount) {
        summary = warnCount
            ? `Found ${errCount} error(s), ${warnCount} warning(s).`
            : `Found ${errCount} TypeScript error(s).`;
    } else {
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

export interface WaitForCompileResult {
    success: boolean;
    compiled: boolean;
    timeout?: boolean;
    waitedMs: number;
    note?: string;
    logPath?: string;
    error?: string;
}

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
export async function waitForCompile(
    projectPath: string,
    timeoutMs: number = 15000,
): Promise<WaitForCompileResult> {
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
        await (Editor as any)?.Message?.request?.('asset-db', 'refresh-asset', 'db://assets');
    } catch { /* swallow — refresh is a kick, not required */ }

    const initialSize = fs.statSync(logPath).size;
    const startTime = Date.now();
    const POLL_INTERVAL = 200;
    const DETECT_GRACE_MS = 2000;

    while (Date.now() - startTime < timeoutMs) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL));
        let currentSize: number;
        try {
            currentSize = fs.statSync(logPath).size;
        } catch (err: any) {
            return {
                success: false,
                compiled: false,
                waitedMs: Date.now() - startTime,
                error: `stat compile log failed: ${err?.message ?? String(err)}`,
            };
        }
        if (currentSize <= initialSize) {
            if (Date.now() - startTime < DETECT_GRACE_MS) continue;
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
            } finally {
                fs.closeSync(fd);
            }
        } catch (err: any) {
            return {
                success: false,
                compiled: false,
                waitedMs: Date.now() - startTime,
                error: `read compile log delta failed: ${err?.message ?? String(err)}`,
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
