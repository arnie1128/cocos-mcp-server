import { ok, fail } from '../lib/response';
/**
 * file-editor-tools — host-side fs operations for clients without
 * native file editing.
 *
 * Four tools (Spaydo cocos-mcp-extension route, hardened):
 *   - file_editor_insert_text   — insert at 1-based line
 *   - file_editor_delete_lines  — delete range, 1-based inclusive
 *   - file_editor_replace_text  — find/replace, plain or regex
 *   - file_editor_query_text    — read range, 1-based
 *
 * Why we ship these even though Claude Code already has Edit/Write:
 *   Multi-client breadth. Claude Desktop / Cline / Continue have no
 *   native file ops; AI on those clients must go through the MCP
 *   server. Tool descriptions carry [claude-code-redundant] so the
 *   ranker on Claude Code prefers the IDE tool.
 *
 * Spaydo's upstream had two gaps we close:
 *   1. path-safety guard via plain `path.resolve + startsWith` is
 *      symlink-unsafe — a symlink inside the project pointing
 *      outside still passes. Use `fs.realpathSync.native` on both
 *      sides (same fix v2.4.9 applied to debug_get_script_diagnostic_context).
 *   2. asset-db refresh hook missing: cocos editor doesn't reimport
 *      a .ts/.js until asset-db sees a refresh event. Call
 *      `Editor.Message.request('asset-db', 'refresh', absPath)` after
 *      every write so the editor picks up the change.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ToolDefinition, ToolResponse, ToolExecutor } from '../types';
import { z } from '../lib/schema';
import { mcpTool, defineToolsFromDecorators } from '../lib/decorators';
import { logger } from '../lib/log';

const REDUNDANT_TAG = '[claude-code-redundant] Use Edit/Write tool from your IDE if available. ';

// Read cap to keep tool result reasonable; matches the cap used by
// debug_get_script_diagnostic_context.
const FILE_READ_BYTE_CAP = 5 * 1024 * 1024;

// v2.5.1 round-1 review fix (codex + claude + gemini 🟡): regex mode runs
// on files up to FILE_READ_BYTE_CAP without a runtime cap, so a
// catastrophic-backtracking pattern would hang the editor process. Cap
// the regex-mode body to a smaller window. Plain-string mode is bounded
// by V8 string ops so it doesn't need this guard.
const REGEX_MODE_BYTE_CAP = 1 * 1024 * 1024;

// v2.5.1 round-1 review fix (codex 🟡): fs.realpathSync.native is documented
// since Node 9.2 but a few cocos-bundled Node builds historically didn't
// expose it. Resolve once at module load with a safe fallback.
const realpathSync: typeof fs.realpathSync = (fs.realpathSync as any).native ?? fs.realpathSync;

// v2.5.1 round-1 review fix (claude 🟡): preserve dominant line ending so
// edits don't silently rewrite a Windows project's CRLF lines as LF. We
// detect by counting \r\n vs lone \n in the file, then re-join with the
// dominant style. New lines added by the user (via insert_text or
// replace_text) inherit whatever the file already uses.
function detectEol(content: string): '\r\n' | '\n' {
    // Count lone \n vs \r\n in the first 4KB — sample is enough; mixed
    // files pick whichever appears more in the head. Edge case (file is
    // all-CRLF except a single LF in the middle): we still pick CRLF.
    const sample = content.length > 4096 ? content.slice(0, 4096) : content;
    let crlf = 0;
    let lf = 0;
    for (let i = 0; i < sample.length; i++) {
        if (sample.charCodeAt(i) === 0x0a /* \n */) {
            if (i > 0 && sample.charCodeAt(i - 1) === 0x0d /* \r */) crlf++;
            else lf++;
        }
    }
    return crlf > lf ? '\r\n' : '\n';
}

function splitLinesNormalized(content: string): { lines: string[]; eol: '\r\n' | '\n' } {
    return {
        lines: content.split(/\r?\n/),
        eol: detectEol(content),
    };
}

interface ResolvedPath { abs: string; relProject: string; }

function getProjectPath(): string | null {
    try {
        return Editor?.Project?.path ?? null;
    } catch {
        return null;
    }
}

/**
 * Resolve a user-supplied path to an absolute, symlink-safe path
 * inside the project. Returns the resolved absolute path + the
 * project-relative form (for friendly messages). Throws-style
 * { error } envelope for callers to short-circuit on.
 *
 * Path safety:
 *   1. If `target` is relative, joined to projectPath; if absolute,
 *      used as-is.
 *   2. Both target and project root go through `fs.realpathSync.native`
 *      so symlinks are followed before the prefix check.
 *   3. Case-insensitive comparison on Windows; case-sensitive on POSIX.
 *   4. Sep guard against `/proj-foo` vs `/proj` prefix confusion.
 *
 * Caller MUST handle the missing-target case for write operations
 * (insert/replace/delete) — we still want to write to a non-existent
 * file via the relative-path fallback when the parent directory
 * exists. See `resolvePathForWrite` below.
 */
function resolvePathForRead(target: string): ResolvedPath | { error: string } {
    const projectPath = getProjectPath();
    if (!projectPath) {
        return { error: 'file-editor: editor context unavailable (no Editor.Project.path)' };
    }
    const absRaw = path.isAbsolute(target) ? target : path.join(projectPath, target);
    let resolvedAbs: string;
    try {
        resolvedAbs = realpathSync(absRaw);
    } catch {
        return { error: `file-editor: file not found or unreadable: ${absRaw}` };
    }
    let projectAbs: string;
    try {
        projectAbs = realpathSync(projectPath);
    } catch {
        projectAbs = path.resolve(projectPath);
    }
    const cmp = process.platform === 'win32'
        ? { resolved: resolvedAbs.toLowerCase(), project: projectAbs.toLowerCase() }
        : { resolved: resolvedAbs, project: projectAbs };
    if (!cmp.resolved.startsWith(cmp.project + path.sep) && cmp.resolved !== cmp.project) {
        return { error: `file-editor: path ${resolvedAbs} resolves outside the project root (symlink-aware check)` };
    }
    return { abs: resolvedAbs, relProject: path.relative(projectAbs, resolvedAbs) };
}

const ASSET_REFRESH_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.json', '.fire', '.scene', '.prefab', '.anim', '.material', '.effect', '.fnt']);

/**
 * Best-effort: tell cocos asset-db that the file changed so the editor
 * picks it up without a manual refresh. Failure is non-fatal because
 * the file is already written; the user can hit refresh manually.
 *
 * Only fires for file extensions cocos cares about (TS source, JSON
 * configs, scene/prefab/anim assets, etc.) so plain .txt edits don't
 * spam the asset-db.
 */
async function refreshAssetDb(absPath: string): Promise<void> {
    const ext = path.extname(absPath).toLowerCase();
    if (!ASSET_REFRESH_EXTS.has(ext)) return;
    try {
        await Editor.Message.request('asset-db', 'refresh-asset', absPath);
    } catch (err: any) {
        logger.debug('[FileEditor] asset-db refresh-asset failed (non-fatal):', err?.message ?? err);
    }
}

export class FileEditorTools implements ToolExecutor {
    private readonly exec: ToolExecutor;

    constructor() {
        this.exec = defineToolsFromDecorators(this);
    }

    getTools(): ToolDefinition[] {
        return this.exec.getTools();
    }

    execute(toolName: string, args: any): Promise<ToolResponse> {
        return this.exec.execute(toolName, args);
    }

    @mcpTool({
        name: 'insert_text',
        title: 'Insert text at line',
        description: REDUNDANT_TAG + 'Insert a new line at the given 1-based line number. If line exceeds total, text is appended at end of file. Triggers cocos asset-db refresh on cocos-recognised extensions (.ts/.json/.scene/.prefab/etc.) so the editor reimports.',
        inputSchema: z.object({
            filePath: z.string().describe('Path to the file (absolute or project-relative).'),
            line: z.number().int().min(1).describe('1-based line number to insert at; existing lines shift down.'),
            text: z.string().describe('Text to insert as a new line (no trailing newline expected).'),
        }),
    })
    async insertText(args: { filePath: string; line: number; text: string }): Promise<ToolResponse> {
        const r = resolvePathForRead(args.filePath);
        if ('error' in r) return fail(r.error);
        const stat = fs.statSync(r.abs);
        if (stat.size > FILE_READ_BYTE_CAP) {
            return fail(`file-editor: file too large (${stat.size} bytes); refusing to read.`);
        }
        const content = fs.readFileSync(r.abs, 'utf-8');
        const { lines, eol } = splitLinesNormalized(content);
        const insertIndex = args.line - 1;
        if (insertIndex >= lines.length) {
            lines.push(args.text);
        } else {
            lines.splice(insertIndex, 0, args.text);
        }
        fs.writeFileSync(r.abs, lines.join(eol), 'utf-8');
        await refreshAssetDb(r.abs);
        return ok({ file: r.relProject, totalLines: lines.length, eol: eol === '\r\n' ? 'CRLF' : 'LF' }, `Inserted text at line ${Math.min(args.line, lines.length)} of ${r.relProject}`);
    }

    @mcpTool({
        name: 'delete_lines',
        title: 'Delete line range',
        description: REDUNDANT_TAG + 'Delete a range of lines (1-based, inclusive). Triggers cocos asset-db refresh.',
        inputSchema: z.object({
            filePath: z.string().describe('Path to the file (absolute or project-relative).'),
            startLine: z.number().int().min(1).describe('First line to delete (1-based, inclusive).'),
            endLine: z.number().int().min(1).describe('Last line to delete (1-based, inclusive). Must be >= startLine.'),
        }),
    })
    async deleteLines(args: { filePath: string; startLine: number; endLine: number }): Promise<ToolResponse> {
        if (args.startLine > args.endLine) {
            return fail('file-editor: startLine must be <= endLine');
        }
        const r = resolvePathForRead(args.filePath);
        if ('error' in r) return fail(r.error);
        const stat = fs.statSync(r.abs);
        if (stat.size > FILE_READ_BYTE_CAP) {
            return fail(`file-editor: file too large (${stat.size} bytes); refusing to read.`);
        }
        const content = fs.readFileSync(r.abs, 'utf-8');
        const { lines, eol } = splitLinesNormalized(content);
        const deleteStart = args.startLine - 1;
        const requestedCount = args.endLine - args.startLine + 1;
        const deletedCount = Math.max(0, Math.min(requestedCount, lines.length - deleteStart));
        if (deletedCount === 0) {
            return fail(`file-editor: range ${args.startLine}-${args.endLine} is past EOF (file has ${lines.length} lines)`);
        }
        lines.splice(deleteStart, deletedCount);
        fs.writeFileSync(r.abs, lines.join(eol), 'utf-8');
        await refreshAssetDb(r.abs);
        return ok({ file: r.relProject, deletedCount, totalLines: lines.length, eol: eol === '\r\n' ? 'CRLF' : 'LF' }, `Deleted ${deletedCount} line(s) from line ${args.startLine} to ${args.startLine + deletedCount - 1} of ${r.relProject}`);
    }

    @mcpTool({
        name: 'replace_text',
        title: 'Replace text in file',
        description: REDUNDANT_TAG + 'Find/replace text in a file. Plain string by default; pass useRegex:true to interpret search as a regex. Replaces first occurrence only unless replaceAll:true. Regex backreferences ($1, $&, $`, $\') work when useRegex:true. Triggers cocos asset-db refresh.',
        inputSchema: z.object({
            filePath: z.string().describe('Path to the file (absolute or project-relative).'),
            // v2.5.1 round-1 review fix (codex + claude 🟡): empty search would
            // either insert between every char (replaceAll) or insert at byte 0
            // (first-only) — both surprising. Reject early.
            search: z.string().min(1, 'search must be non-empty').describe('Search text or regex pattern (depends on useRegex). Must be non-empty.'),
            replace: z.string().describe('Replacement text. Regex backreferences ($1, $&, $`, $\') expand when useRegex:true.'),
            useRegex: z.boolean().default(false).describe('Treat `search` as a JS RegExp source string. Default false.'),
            replaceAll: z.boolean().default(false).describe('Replace every occurrence. Default false (first only).'),
        }),
    })
    async replaceText(args: { filePath: string; search: string; replace: string; useRegex: boolean; replaceAll: boolean }): Promise<ToolResponse> {
        const r = resolvePathForRead(args.filePath);
        if ('error' in r) return fail(r.error);
        const stat = fs.statSync(r.abs);
        if (stat.size > FILE_READ_BYTE_CAP) {
            return fail(`file-editor: file too large (${stat.size} bytes); refusing to read.`);
        }
        // v2.5.1 round-1 review fix (codex + claude + gemini 🟡): regex
        // mode runs user-controlled patterns against the file content
        // with no timeout. Cap to a smaller window in regex mode so
        // catastrophic backtracking on a large file can't hang the
        // editor's host process. Plain-string mode keeps the larger
        // FILE_READ_BYTE_CAP because String.split/indexOf/slice are
        // bounded by V8 internals (no regex engine path).
        if (args.useRegex && stat.size > REGEX_MODE_BYTE_CAP) {
            return fail(`file-editor: regex mode refuses files > ${REGEX_MODE_BYTE_CAP} bytes (${stat.size} bytes here). Switch to useRegex:false or split the file first.`);
        }
        const content = fs.readFileSync(r.abs, 'utf-8');
        let replacements = 0;
        let newContent: string;
        try {
            if (args.useRegex) {
                const flags = args.replaceAll ? 'g' : '';
                const regex = new RegExp(args.search, flags);
                // v2.5.1 round-1 review fix (codex 🔴): pass the replacement
                // STRING directly so $1/$&/etc. expand. The previous
                // function-callback form returned `args.replace` literally,
                // breaking the documented backreference behaviour. Count
                // matches separately via a parallel match() pass since we
                // no longer have the per-call counter.
                const matches = content.match(regex);
                replacements = matches ? matches.length : 0;
                newContent = content.replace(regex, args.replace);
            } else if (args.replaceAll) {
                const parts = content.split(args.search);
                replacements = parts.length - 1;
                newContent = parts.join(args.replace);
            } else {
                const idx = content.indexOf(args.search);
                if (idx === -1) {
                    return ok({ file: r.relProject, replacements: 0 }, 'No occurrences found; file unchanged.');
                }
                replacements = 1;
                newContent = content.slice(0, idx) + args.replace + content.slice(idx + args.search.length);
            }
        } catch (err: any) {
            return fail(`file-editor: replace failed: ${err?.message ?? String(err)}`);
        }
        if (replacements === 0) {
            return ok({ file: r.relProject, replacements: 0 }, 'No occurrences found; file unchanged.');
        }
        fs.writeFileSync(r.abs, newContent, 'utf-8');
        await refreshAssetDb(r.abs);
        return ok({ file: r.relProject, replacements }, `Replaced ${replacements} occurrence(s) in ${r.relProject}`);
    }

    @mcpTool({
        name: 'query_text',
        title: 'Read line range',
        description: REDUNDANT_TAG + 'Read a range of lines (1-based, inclusive). Returns lines with line numbers; total line count of file in data.totalLines. Read-only; no asset-db refresh.',
        inputSchema: z.object({
            filePath: z.string().describe('Path to the file (absolute or project-relative).'),
            startLine: z.number().int().min(1).optional().describe('First line to read (1-based). Default 1.'),
            endLine: z.number().int().min(1).optional().describe('Last line to read (1-based, inclusive). Default end of file.'),
        }),
    })
    async queryText(args: { filePath: string; startLine?: number; endLine?: number }): Promise<ToolResponse> {
        const r = resolvePathForRead(args.filePath);
        if ('error' in r) return fail(r.error);
        const stat = fs.statSync(r.abs);
        if (stat.size > FILE_READ_BYTE_CAP) {
            return fail(`file-editor: file too large (${stat.size} bytes); refusing to read.`);
        }
        const content = fs.readFileSync(r.abs, 'utf-8');
        const { lines, eol } = splitLinesNormalized(content);
        const totalLines = lines.length;
        const from = (args.startLine ?? 1) - 1;
        const to = args.endLine ?? totalLines;
        if (from >= totalLines) {
            return fail(`file-editor: startLine ${args.startLine ?? 1} past EOF (file has ${totalLines} lines)`);
        }
        if (args.startLine !== undefined && args.endLine !== undefined && args.startLine > args.endLine) {
            return fail('file-editor: startLine must be <= endLine');
        }
        const sliced = lines.slice(from, to);
        const result = sliced.map((text, i) => ({ line: from + i + 1, text }));
        return ok({ file: r.relProject, totalLines, startLine: from + 1, endLine: from + result.length, eol: eol === '\r\n' ? 'CRLF' : 'LF', lines: result }, `Read ${result.length} line(s) from ${r.relProject}`);
    }
}
