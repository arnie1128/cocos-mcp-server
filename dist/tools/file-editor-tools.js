"use strict";
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
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileEditorTools = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const schema_1 = require("../lib/schema");
const define_tools_1 = require("../lib/define-tools");
const log_1 = require("../lib/log");
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
const realpathSync = (_a = fs.realpathSync.native) !== null && _a !== void 0 ? _a : fs.realpathSync;
// v2.5.1 round-1 review fix (claude 🟡): preserve dominant line ending so
// edits don't silently rewrite a Windows project's CRLF lines as LF. We
// detect by counting \r\n vs lone \n in the file, then re-join with the
// dominant style. New lines added by the user (via insert_text or
// replace_text) inherit whatever the file already uses.
function detectEol(content) {
    // Count lone \n vs \r\n in the first 4KB — sample is enough; mixed
    // files pick whichever appears more in the head. Edge case (file is
    // all-CRLF except a single LF in the middle): we still pick CRLF.
    const sample = content.length > 4096 ? content.slice(0, 4096) : content;
    let crlf = 0;
    let lf = 0;
    for (let i = 0; i < sample.length; i++) {
        if (sample.charCodeAt(i) === 0x0a /* \n */) {
            if (i > 0 && sample.charCodeAt(i - 1) === 0x0d /* \r */)
                crlf++;
            else
                lf++;
        }
    }
    return crlf > lf ? '\r\n' : '\n';
}
function splitLinesNormalized(content) {
    return {
        lines: content.split(/\r?\n/),
        eol: detectEol(content),
    };
}
function getProjectPath() {
    var _a, _b;
    try {
        return (_b = (_a = Editor === null || Editor === void 0 ? void 0 : Editor.Project) === null || _a === void 0 ? void 0 : _a.path) !== null && _b !== void 0 ? _b : null;
    }
    catch (_c) {
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
function resolvePathForRead(target) {
    const projectPath = getProjectPath();
    if (!projectPath) {
        return { error: 'file-editor: editor context unavailable (no Editor.Project.path)' };
    }
    const absRaw = path.isAbsolute(target) ? target : path.join(projectPath, target);
    let resolvedAbs;
    try {
        resolvedAbs = realpathSync(absRaw);
    }
    catch (_a) {
        return { error: `file-editor: file not found or unreadable: ${absRaw}` };
    }
    let projectAbs;
    try {
        projectAbs = realpathSync(projectPath);
    }
    catch (_b) {
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
async function refreshAssetDb(absPath) {
    var _a;
    const ext = path.extname(absPath).toLowerCase();
    if (!ASSET_REFRESH_EXTS.has(ext))
        return;
    try {
        await Editor.Message.request('asset-db', 'refresh-asset', absPath);
    }
    catch (err) {
        log_1.logger.debug('[FileEditor] asset-db refresh-asset failed (non-fatal):', (_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : err);
    }
}
const insertText = {
    name: 'insert_text',
    title: 'Insert text at line',
    description: REDUNDANT_TAG + 'Insert a new line at the given 1-based line number. If line exceeds total, text is appended at end of file. Triggers cocos asset-db refresh on cocos-recognised extensions (.ts/.json/.scene/.prefab/etc.) so the editor reimports.',
    inputSchema: schema_1.z.object({
        filePath: schema_1.z.string().describe('Path to the file (absolute or project-relative).'),
        line: schema_1.z.number().int().min(1).describe('1-based line number to insert at; existing lines shift down.'),
        text: schema_1.z.string().describe('Text to insert as a new line (no trailing newline expected).'),
    }),
    handler: async (args) => {
        var _a, _b;
        const r = resolvePathForRead(args.filePath);
        if ('error' in r)
            return { success: false, error: r.error };
        let content;
        try {
            const stat = fs.statSync(r.abs);
            if (stat.size > FILE_READ_BYTE_CAP) {
                return { success: false, error: `file-editor: file too large (${stat.size} bytes); refusing to read.` };
            }
            content = fs.readFileSync(r.abs, 'utf-8');
        }
        catch (err) {
            return { success: false, error: (_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : String(err) };
        }
        const { lines, eol } = splitLinesNormalized(content);
        const insertIndex = args.line - 1;
        if (insertIndex >= lines.length) {
            lines.push(args.text);
        }
        else {
            lines.splice(insertIndex, 0, args.text);
        }
        try {
            fs.writeFileSync(r.abs, lines.join(eol), 'utf-8');
        }
        catch (err) {
            return { success: false, error: (_b = err === null || err === void 0 ? void 0 : err.message) !== null && _b !== void 0 ? _b : String(err) };
        }
        await refreshAssetDb(r.abs);
        return {
            success: true,
            message: `Inserted text at line ${Math.min(args.line, lines.length)} of ${r.relProject}`,
            data: { file: r.relProject, totalLines: lines.length, eol: eol === '\r\n' ? 'CRLF' : 'LF' },
        };
    },
};
const deleteLines = {
    name: 'delete_lines',
    title: 'Delete line range',
    description: REDUNDANT_TAG + 'Delete a range of lines (1-based, inclusive). Triggers cocos asset-db refresh.',
    inputSchema: schema_1.z.object({
        filePath: schema_1.z.string().describe('Path to the file (absolute or project-relative).'),
        startLine: schema_1.z.number().int().min(1).describe('First line to delete (1-based, inclusive).'),
        endLine: schema_1.z.number().int().min(1).describe('Last line to delete (1-based, inclusive). Must be >= startLine.'),
    }),
    handler: async (args) => {
        var _a, _b;
        if (args.startLine > args.endLine) {
            return { success: false, error: 'file-editor: startLine must be <= endLine' };
        }
        const r = resolvePathForRead(args.filePath);
        if ('error' in r)
            return { success: false, error: r.error };
        let content;
        try {
            const stat = fs.statSync(r.abs);
            if (stat.size > FILE_READ_BYTE_CAP) {
                return { success: false, error: `file-editor: file too large (${stat.size} bytes); refusing to read.` };
            }
            content = fs.readFileSync(r.abs, 'utf-8');
        }
        catch (err) {
            return { success: false, error: (_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : String(err) };
        }
        const { lines, eol } = splitLinesNormalized(content);
        const deleteStart = args.startLine - 1;
        const requestedCount = args.endLine - args.startLine + 1;
        const deletedCount = Math.max(0, Math.min(requestedCount, lines.length - deleteStart));
        if (deletedCount === 0) {
            return { success: false, error: `file-editor: range ${args.startLine}-${args.endLine} is past EOF (file has ${lines.length} lines)` };
        }
        lines.splice(deleteStart, deletedCount);
        try {
            fs.writeFileSync(r.abs, lines.join(eol), 'utf-8');
        }
        catch (err) {
            return { success: false, error: (_b = err === null || err === void 0 ? void 0 : err.message) !== null && _b !== void 0 ? _b : String(err) };
        }
        await refreshAssetDb(r.abs);
        return {
            success: true,
            message: `Deleted ${deletedCount} line(s) from line ${args.startLine} to ${args.startLine + deletedCount - 1} of ${r.relProject}`,
            data: { file: r.relProject, deletedCount, totalLines: lines.length, eol: eol === '\r\n' ? 'CRLF' : 'LF' },
        };
    },
};
const replaceText = {
    name: 'replace_text',
    title: 'Replace text in file',
    description: REDUNDANT_TAG + 'Find/replace text in a file. Plain string by default; pass useRegex:true to interpret search as a regex. Replaces first occurrence only unless replaceAll:true. Regex backreferences ($1, $&, $`, $\') work when useRegex:true. Triggers cocos asset-db refresh.',
    inputSchema: schema_1.z.object({
        filePath: schema_1.z.string().describe('Path to the file (absolute or project-relative).'),
        // v2.5.1 round-1 review fix (codex + claude 🟡): empty search would
        // either insert between every char (replaceAll) or insert at byte 0
        // (first-only) — both surprising. Reject early.
        search: schema_1.z.string().min(1, 'search must be non-empty').describe('Search text or regex pattern (depends on useRegex). Must be non-empty.'),
        replace: schema_1.z.string().describe('Replacement text. Regex backreferences ($1, $&, $`, $\') expand when useRegex:true.'),
        useRegex: schema_1.z.boolean().default(false).describe('Treat `search` as a JS RegExp source string. Default false.'),
        replaceAll: schema_1.z.boolean().default(false).describe('Replace every occurrence. Default false (first only).'),
    }),
    handler: async (args) => {
        var _a, _b, _c;
        const r = resolvePathForRead(args.filePath);
        if ('error' in r)
            return { success: false, error: r.error };
        let content;
        try {
            const stat = fs.statSync(r.abs);
            if (stat.size > FILE_READ_BYTE_CAP) {
                return { success: false, error: `file-editor: file too large (${stat.size} bytes); refusing to read.` };
            }
            // v2.5.1 round-1 review fix (codex + claude + gemini 🟡): regex
            // mode runs user-controlled patterns against the file content
            // with no timeout. Cap to a smaller window in regex mode so
            // catastrophic backtracking on a large file can't hang the
            // editor's host process. Plain-string mode keeps the larger
            // FILE_READ_BYTE_CAP because String.split/indexOf/slice are
            // bounded by V8 internals (no regex engine path).
            if (args.useRegex && stat.size > REGEX_MODE_BYTE_CAP) {
                return { success: false, error: `file-editor: regex mode refuses files > ${REGEX_MODE_BYTE_CAP} bytes (${stat.size} bytes here). Switch to useRegex:false or split the file first.` };
            }
            content = fs.readFileSync(r.abs, 'utf-8');
        }
        catch (err) {
            return { success: false, error: (_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : String(err) };
        }
        let replacements = 0;
        let newContent;
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
            }
            else if (args.replaceAll) {
                const parts = content.split(args.search);
                replacements = parts.length - 1;
                newContent = parts.join(args.replace);
            }
            else {
                const idx = content.indexOf(args.search);
                if (idx === -1) {
                    return { success: true, message: 'No occurrences found; file unchanged.', data: { file: r.relProject, replacements: 0 } };
                }
                replacements = 1;
                newContent = content.slice(0, idx) + args.replace + content.slice(idx + args.search.length);
            }
        }
        catch (err) {
            return { success: false, error: `file-editor: replace failed: ${(_b = err === null || err === void 0 ? void 0 : err.message) !== null && _b !== void 0 ? _b : String(err)}` };
        }
        if (replacements === 0) {
            return { success: true, message: 'No occurrences found; file unchanged.', data: { file: r.relProject, replacements: 0 } };
        }
        try {
            fs.writeFileSync(r.abs, newContent, 'utf-8');
        }
        catch (err) {
            return { success: false, error: (_c = err === null || err === void 0 ? void 0 : err.message) !== null && _c !== void 0 ? _c : String(err) };
        }
        await refreshAssetDb(r.abs);
        return {
            success: true,
            message: `Replaced ${replacements} occurrence(s) in ${r.relProject}`,
            data: { file: r.relProject, replacements },
        };
    },
};
const queryText = {
    name: 'query_text',
    title: 'Read line range',
    description: REDUNDANT_TAG + 'Read a range of lines (1-based, inclusive). Returns lines with line numbers; total line count of file in data.totalLines. Read-only; no asset-db refresh.',
    inputSchema: schema_1.z.object({
        filePath: schema_1.z.string().describe('Path to the file (absolute or project-relative).'),
        startLine: schema_1.z.number().int().min(1).optional().describe('First line to read (1-based). Default 1.'),
        endLine: schema_1.z.number().int().min(1).optional().describe('Last line to read (1-based, inclusive). Default end of file.'),
    }),
    handler: async (args) => {
        var _a, _b, _c, _d;
        const r = resolvePathForRead(args.filePath);
        if ('error' in r)
            return { success: false, error: r.error };
        let content;
        try {
            const stat = fs.statSync(r.abs);
            if (stat.size > FILE_READ_BYTE_CAP) {
                return { success: false, error: `file-editor: file too large (${stat.size} bytes); refusing to read.` };
            }
            content = fs.readFileSync(r.abs, 'utf-8');
        }
        catch (err) {
            return { success: false, error: (_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : String(err) };
        }
        const { lines, eol } = splitLinesNormalized(content);
        const totalLines = lines.length;
        const from = ((_b = args.startLine) !== null && _b !== void 0 ? _b : 1) - 1;
        const to = (_c = args.endLine) !== null && _c !== void 0 ? _c : totalLines;
        if (from >= totalLines) {
            return { success: false, error: `file-editor: startLine ${(_d = args.startLine) !== null && _d !== void 0 ? _d : 1} past EOF (file has ${totalLines} lines)` };
        }
        if (args.startLine !== undefined && args.endLine !== undefined && args.startLine > args.endLine) {
            return { success: false, error: 'file-editor: startLine must be <= endLine' };
        }
        const sliced = lines.slice(from, to);
        const result = sliced.map((text, i) => ({ line: from + i + 1, text }));
        return {
            success: true,
            message: `Read ${result.length} line(s) from ${r.relProject}`,
            data: { file: r.relProject, totalLines, startLine: from + 1, endLine: from + result.length, eol: eol === '\r\n' ? 'CRLF' : 'LF', lines: result },
        };
    },
};
class FileEditorTools {
    constructor() {
        this.impl = (0, define_tools_1.defineTools)([
            insertText,
            deleteLines,
            replaceText,
            queryText,
        ]);
    }
    getTools() {
        return this.impl.getTools();
    }
    execute(toolName, args) {
        return this.impl.execute(toolName, args);
    }
}
exports.FileEditorTools = FileEditorTools;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmlsZS1lZGl0b3ItdG9vbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvdG9vbHMvZmlsZS1lZGl0b3ItdG9vbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBeUJHOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUgsdUNBQXlCO0FBQ3pCLDJDQUE2QjtBQUU3QiwwQ0FBa0M7QUFDbEMsc0RBQTJEO0FBQzNELG9DQUFvQztBQUVwQyxNQUFNLGFBQWEsR0FBRywwRUFBMEUsQ0FBQztBQUVqRyxtRUFBbUU7QUFDbkUsdUNBQXVDO0FBQ3ZDLE1BQU0sa0JBQWtCLEdBQUcsQ0FBQyxHQUFHLElBQUksR0FBRyxJQUFJLENBQUM7QUFFM0MsMEVBQTBFO0FBQzFFLGdFQUFnRTtBQUNoRSx1RUFBdUU7QUFDdkUsd0VBQXdFO0FBQ3hFLGtEQUFrRDtBQUNsRCxNQUFNLG1CQUFtQixHQUFHLENBQUMsR0FBRyxJQUFJLEdBQUcsSUFBSSxDQUFDO0FBRTVDLDZFQUE2RTtBQUM3RSx5RUFBeUU7QUFDekUsK0RBQStEO0FBQy9ELE1BQU0sWUFBWSxHQUEyQixNQUFDLEVBQUUsQ0FBQyxZQUFvQixDQUFDLE1BQU0sbUNBQUksRUFBRSxDQUFDLFlBQVksQ0FBQztBQUVoRywwRUFBMEU7QUFDMUUsd0VBQXdFO0FBQ3hFLHdFQUF3RTtBQUN4RSxrRUFBa0U7QUFDbEUsd0RBQXdEO0FBQ3hELFNBQVMsU0FBUyxDQUFDLE9BQWU7SUFDOUIsbUVBQW1FO0lBQ25FLG9FQUFvRTtJQUNwRSxrRUFBa0U7SUFDbEUsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUM7SUFDeEUsSUFBSSxJQUFJLEdBQUcsQ0FB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RUFBRSxVQUFVLEVBQUUsU0FBUyxFQUFFLElBQUksR0FBRyxDQUFDLEVBQUUsT0FBTyxFQUFFLElBQUksR0FBRyxNQUFNLENBQUMsTUFBTSxFQUFFLEdBQUcsRUFBRSxHQUFHLEtBQUssTUFBTSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFO1NBQ25KLENBQUM7SUFDTixDQUFDO0NBQ0osQ0FBQztBQUVGLE1BQWEsZUFBZTtJQUE1QjtRQUNZLFNBQUksR0FBRyxJQUFBLDBCQUFXLEVBQUM7WUFDdkIsVUFBVTtZQUNWLFdBQVc7WUFDWCxXQUFXO1lBQ1gsU0FBUztTQUNaLENBQUMsQ0FBQztJQVNQLENBQUM7SUFQRyxRQUFRO1FBQ0osT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO0lBQ2hDLENBQUM7SUFFRCxPQUFPLENBQUMsUUFBZ0IsRUFBRSxJQUFTO1FBQy9CLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQzdDLENBQUM7Q0FDSjtBQWZELDBDQWVDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBmaWxlLWVkaXRvci10b29scyDigJQgaG9zdC1zaWRlIGZzIG9wZXJhdGlvbnMgZm9yIGNsaWVudHMgd2l0aG91dFxuICogbmF0aXZlIGZpbGUgZWRpdGluZy5cbiAqXG4gKiBGb3VyIHRvb2xzIChTcGF5ZG8gY29jb3MtbWNwLWV4dGVuc2lvbiByb3V0ZSwgaGFyZGVuZWQpOlxuICogICAtIGZpbGVfZWRpdG9yX2luc2VydF90ZXh0ICAg4oCUIGluc2VydCBhdCAxLWJhc2VkIGxpbmVcbiAqICAgLSBmaWxlX2VkaXRvcl9kZWxldGVfbGluZXMgIOKAlCBkZWxldGUgcmFuZ2UsIDEtYmFzZWQgaW5jbHVzaXZlXG4gKiAgIC0gZmlsZV9lZGl0b3JfcmVwbGFjZV90ZXh0ICDigJQgZmluZC9yZXBsYWNlLCBwbGFpbiBvciByZWdleFxuICogICAtIGZpbGVfZWRpdG9yX3F1ZXJ5X3RleHQgICAg4oCUIHJlYWQgcmFuZ2UsIDEtYmFzZWRcbiAqXG4gKiBXaHkgd2Ugc2hpcCB0aGVzZSBldmVuIHRob3VnaCBDbGF1ZGUgQ29kZSBhbHJlYWR5IGhhcyBFZGl0L1dyaXRlOlxuICogICBNdWx0aS1jbGllbnQgYnJlYWR0aC4gQ2xhdWRlIERlc2t0b3AgLyBDbGluZSAvIENvbnRpbnVlIGhhdmUgbm9cbiAqICAgbmF0aXZlIGZpbGUgb3BzOyBBSSBvbiB0aG9zZSBjbGllbnRzIG11c3QgZ28gdGhyb3VnaCB0aGUgTUNQXG4gKiAgIHNlcnZlci4gVG9vbCBkZXNjcmlwdGlvbnMgY2FycnkgW2NsYXVkZS1jb2RlLXJlZHVuZGFudF0gc28gdGhlXG4gKiAgIHJhbmtlciBvbiBDbGF1ZGUgQ29kZSBwcmVmZXJzIHRoZSBJREUgdG9vbC5cbiAqXG4gKiBTcGF5ZG8ncyB1cHN0cmVhbSBoYWQgdHdvIGdhcHMgd2UgY2xvc2U6XG4gKiAgIDEuIHBhdGgtc2FmZXR5IGd1YXJkIHZpYSBwbGFpbiBgcGF0aC5yZXNvbHZlICsgc3RhcnRzV2l0aGAgaXNcbiAqICAgICAgc3ltbGluay11bnNhZmUg4oCUIGEgc3ltbGluayBpbnNpZGUgdGhlIHByb2plY3QgcG9pbnRpbmdcbiAqICAgICAgb3V0c2lkZSBzdGlsbCBwYXNzZXMuIFVzZSBgZnMucmVhbHBhdGhTeW5jLm5hdGl2ZWAgb24gYm90aFxuICogICAgICBzaWRlcyAoc2FtZSBmaXggdjIuNC45IGFwcGxpZWQgdG8gZGVidWdfZ2V0X3NjcmlwdF9kaWFnbm9zdGljX2NvbnRleHQpLlxuICogICAyLiBhc3NldC1kYiByZWZyZXNoIGhvb2sgbWlzc2luZzogY29jb3MgZWRpdG9yIGRvZXNuJ3QgcmVpbXBvcnRcbiAqICAgICAgYSAudHMvLmpzIHVudGlsIGFzc2V0LWRiIHNlZXMgYSByZWZyZXNoIGV2ZW50LiBDYWxsXG4gKiAgICAgIGBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdyZWZyZXNoJywgYWJzUGF0aClgIGFmdGVyXG4gKiAgICAgIGV2ZXJ5IHdyaXRlIHNvIHRoZSBlZGl0b3IgcGlja3MgdXAgdGhlIGNoYW5nZS5cbiAqL1xuXG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHR5cGUgeyBUb29sUmVzcG9uc2UgfSBmcm9tICcuLi90eXBlcyc7XG5pbXBvcnQgeyB6IH0gZnJvbSAnLi4vbGliL3NjaGVtYSc7XG5pbXBvcnQgeyBkZWZpbmVUb29scywgVG9vbERlZiB9IGZyb20gJy4uL2xpYi9kZWZpbmUtdG9vbHMnO1xuaW1wb3J0IHsgbG9nZ2VyIH0gZnJvbSAnLi4vbGliL2xvZyc7XG5cbmNvbnN0IFJFRFVOREFOVF9UQUcgPSAnW2NsYXVkZS1jb2RlLXJlZHVuZGFudF0gVXNlIEVkaXQvV3JpdGUgdG9vbCBmcm9tIHlvdXIgSURFIGlmIGF2YWlsYWJsZS4gJztcblxuLy8gUmVhZCBjYXAgdG8ga2VlcCB0b29sIHJlc3VsdCByZWFzb25hYmxlOyBtYXRjaGVzIHRoZSBjYXAgdXNlZCBieVxuLy8gZGVidWdfZ2V0X3NjcmlwdF9kaWFnbm9zdGljX2NvbnRleHQuXG5jb25zdCBGSUxFX1JFQURfQllURV9DQVAgPSA1ICogMTAyNCAqIDEwMjQ7XG5cbi8vIHYyLjUuMSByb3VuZC0xIHJldmlldyBmaXggKGNvZGV4ICsgY2xhdWRlICsgZ2VtaW5pIPCfn6EpOiByZWdleCBtb2RlIHJ1bnNcbi8vIG9uIGZpbGVzIHVwIHRvIEZJTEVfUkVBRF9CWVRFX0NBUCB3aXRob3V0IGEgcnVudGltZSBjYXAsIHNvIGFcbi8vIGNhdGFzdHJvcGhpYy1iYWNrdHJhY2tpbmcgcGF0dGVybiB3b3VsZCBoYW5nIHRoZSBlZGl0b3IgcHJvY2Vzcy4gQ2FwXG4vLyB0aGUgcmVnZXgtbW9kZSBib2R5IHRvIGEgc21hbGxlciB3aW5kb3cuIFBsYWluLXN0cmluZyBtb2RlIGlzIGJvdW5kZWRcbi8vIGJ5IFY4IHN0cmluZyBvcHMgc28gaXQgZG9lc24ndCBuZWVkIHRoaXMgZ3VhcmQuXG5jb25zdCBSRUdFWF9NT0RFX0JZVEVfQ0FQID0gMSAqIDEwMjQgKiAxMDI0O1xuXG4vLyB2Mi41LjEgcm91bmQtMSByZXZpZXcgZml4IChjb2RleCDwn5+hKTogZnMucmVhbHBhdGhTeW5jLm5hdGl2ZSBpcyBkb2N1bWVudGVkXG4vLyBzaW5jZSBOb2RlIDkuMiBidXQgYSBmZXcgY29jb3MtYnVuZGxlZCBOb2RlIGJ1aWxkcyBoaXN0b3JpY2FsbHkgZGlkbid0XG4vLyBleHBvc2UgaXQuIFJlc29sdmUgb25jZSBhdCBtb2R1bGUgbG9hZCB3aXRoIGEgc2FmZSBmYWxsYmFjay5cbmNvbnN0IHJlYWxwYXRoU3luYzogdHlwZW9mIGZzLnJlYWxwYXRoU3luYyA9IChmcy5yZWFscGF0aFN5bmMgYXMgYW55KS5uYXRpdmUgPz8gZnMucmVhbHBhdGhTeW5jO1xuXG4vLyB2Mi41LjEgcm91bmQtMSByZXZpZXcgZml4IChjbGF1ZGUg8J+foSk6IHByZXNlcnZlIGRvbWluYW50IGxpbmUgZW5kaW5nIHNvXG4vLyBlZGl0cyBkb24ndCBzaWxlbnRseSByZXdyaXRlIGEgV2luZG93cyBwcm9qZWN0J3MgQ1JMRiBsaW5lcyBhcyBMRi4gV2Vcbi8vIGRldGVjdCBieSBjb3VudGluZyBcXHJcXG4gdnMgbG9uZSBcXG4gaW4gdGhlIGZpbGUsIHRoZW4gcmUtam9pbiB3aXRoIHRoZVxuLy8gZG9taW5hbnQgc3R5bGUuIE5ldyBsaW5lcyBhZGRlZCBieSB0aGUgdXNlciAodmlhIGluc2VydF90ZXh0IG9yXG4vLyByZXBsYWNlX3RleHQpIGluaGVyaXQgd2hhdGV2ZXIgdGhlIGZpbGUgYWxyZWFkeSB1c2VzLlxuZnVuY3Rpb24gZGV0ZWN0RW9sKGNvbnRlbnQ6IHN0cmluZyk6ICdcXHJcXG4nIHwgJ1xcbicge1xuICAgIC8vIENvdW50IGxvbmUgXFxuIHZzIFxcclxcbiBpbiB0aGUgZmlyc3QgNEtCIOKAlCBzYW1wbGUgaXMgZW5vdWdoOyBtaXhlZFxuICAgIC8vIGZpbGVzIHBpY2sgd2hpY2hldmVyIGFwcGVhcnMgbW9yZSBpbiB0aGUgaGVhZC4gRWRnZSBjYXNlIChmaWxlIGlzXG4gICAgLy8gYWxsLUNSTEYgZXhjZXB0IGEgc2luZ2xlIExGIGluIHRoZSBtaWRkbGUpOiB3ZSBzdGlsbCBwaWNrIENSTEYuXG4gICAgY29uc3Qgc2FtcGxlID0gY29udGVudC5sZW5ndGggPiA0MDk2ID8gY29udGVudC5zbGljZSgwLCA0MDk2KSA6IGNvbnRlbnQ7XG4gICAgbGV0IGNybGYgPSAwO1xuICAgIGxldCBsZiA9IDA7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzYW1wbGUubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKHNhbXBsZS5jaGFyQ29kZUF0KGkpID09PSAweDBhIC8qIFxcbiAqLykge1xuICAgICAgICAgICAgaWYgKGkgPiAwICYmIHNhbXBsZS5jaGFyQ29kZUF0KGkgLSAxKSA9PT0gMHgwZCAvKiBcXHIgKi8pIGNybGYrKztcbiAgICAgICAgICAgIGVsc2UgbGYrKztcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gY3JsZiA+IGxmID8gJ1xcclxcbicgOiAnXFxuJztcbn1cblxuZnVuY3Rpb24gc3BsaXRMaW5lc05vcm1hbGl6ZWQoY29udGVudDogc3RyaW5nKTogeyBsaW5lczogc3RyaW5nW107IGVvbDogJ1xcclxcbicgfCAnXFxuJyB9IHtcbiAgICByZXR1cm4ge1xuICAgICAgICBsaW5lczogY29udGVudC5zcGxpdCgvXFxyP1xcbi8pLFxuICAgICAgICBlb2w6IGRldGVjdEVvbChjb250ZW50KSxcbiAgICB9O1xufVxuXG5pbnRlcmZhY2UgUmVzb2x2ZWRQYXRoIHsgYWJzOiBzdHJpbmc7IHJlbFByb2plY3Q6IHN0cmluZzsgfVxuXG5mdW5jdGlvbiBnZXRQcm9qZWN0UGF0aCgpOiBzdHJpbmcgfCBudWxsIHtcbiAgICB0cnkge1xuICAgICAgICByZXR1cm4gRWRpdG9yPy5Qcm9qZWN0Py5wYXRoID8/IG51bGw7XG4gICAgfSBjYXRjaCB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbn1cblxuLyoqXG4gKiBSZXNvbHZlIGEgdXNlci1zdXBwbGllZCBwYXRoIHRvIGFuIGFic29sdXRlLCBzeW1saW5rLXNhZmUgcGF0aFxuICogaW5zaWRlIHRoZSBwcm9qZWN0LiBSZXR1cm5zIHRoZSByZXNvbHZlZCBhYnNvbHV0ZSBwYXRoICsgdGhlXG4gKiBwcm9qZWN0LXJlbGF0aXZlIGZvcm0gKGZvciBmcmllbmRseSBtZXNzYWdlcykuIFRocm93cy1zdHlsZVxuICogeyBlcnJvciB9IGVudmVsb3BlIGZvciBjYWxsZXJzIHRvIHNob3J0LWNpcmN1aXQgb24uXG4gKlxuICogUGF0aCBzYWZldHk6XG4gKiAgIDEuIElmIGB0YXJnZXRgIGlzIHJlbGF0aXZlLCBqb2luZWQgdG8gcHJvamVjdFBhdGg7IGlmIGFic29sdXRlLFxuICogICAgICB1c2VkIGFzLWlzLlxuICogICAyLiBCb3RoIHRhcmdldCBhbmQgcHJvamVjdCByb290IGdvIHRocm91Z2ggYGZzLnJlYWxwYXRoU3luYy5uYXRpdmVgXG4gKiAgICAgIHNvIHN5bWxpbmtzIGFyZSBmb2xsb3dlZCBiZWZvcmUgdGhlIHByZWZpeCBjaGVjay5cbiAqICAgMy4gQ2FzZS1pbnNlbnNpdGl2ZSBjb21wYXJpc29uIG9uIFdpbmRvd3M7IGNhc2Utc2Vuc2l0aXZlIG9uIFBPU0lYLlxuICogICA0LiBTZXAgZ3VhcmQgYWdhaW5zdCBgL3Byb2otZm9vYCB2cyBgL3Byb2pgIHByZWZpeCBjb25mdXNpb24uXG4gKlxuICogQ2FsbGVyIE1VU1QgaGFuZGxlIHRoZSBtaXNzaW5nLXRhcmdldCBjYXNlIGZvciB3cml0ZSBvcGVyYXRpb25zXG4gKiAoaW5zZXJ0L3JlcGxhY2UvZGVsZXRlKSDigJQgd2Ugc3RpbGwgd2FudCB0byB3cml0ZSB0byBhIG5vbi1leGlzdGVudFxuICogZmlsZSB2aWEgdGhlIHJlbGF0aXZlLXBhdGggZmFsbGJhY2sgd2hlbiB0aGUgcGFyZW50IGRpcmVjdG9yeVxuICogZXhpc3RzLiBTZWUgYHJlc29sdmVQYXRoRm9yV3JpdGVgIGJlbG93LlxuICovXG5mdW5jdGlvbiByZXNvbHZlUGF0aEZvclJlYWQodGFyZ2V0OiBzdHJpbmcpOiBSZXNvbHZlZFBhdGggfCB7IGVycm9yOiBzdHJpbmcgfSB7XG4gICAgY29uc3QgcHJvamVjdFBhdGggPSBnZXRQcm9qZWN0UGF0aCgpO1xuICAgIGlmICghcHJvamVjdFBhdGgpIHtcbiAgICAgICAgcmV0dXJuIHsgZXJyb3I6ICdmaWxlLWVkaXRvcjogZWRpdG9yIGNvbnRleHQgdW5hdmFpbGFibGUgKG5vIEVkaXRvci5Qcm9qZWN0LnBhdGgpJyB9O1xuICAgIH1cbiAgICBjb25zdCBhYnNSYXcgPSBwYXRoLmlzQWJzb2x1dGUodGFyZ2V0KSA/IHRhcmdldCA6IHBhdGguam9pbihwcm9qZWN0UGF0aCwgdGFyZ2V0KTtcbiAgICBsZXQgcmVzb2x2ZWRBYnM6IHN0cmluZztcbiAgICB0cnkge1xuICAgICAgICByZXNvbHZlZEFicyA9IHJlYWxwYXRoU3luYyhhYnNSYXcpO1xuICAgIH0gY2F0Y2gge1xuICAgICAgICByZXR1cm4geyBlcnJvcjogYGZpbGUtZWRpdG9yOiBmaWxlIG5vdCBmb3VuZCBvciB1bnJlYWRhYmxlOiAke2Fic1Jhd31gIH07XG4gICAgfVxuICAgIGxldCBwcm9qZWN0QWJzOiBzdHJpbmc7XG4gICAgdHJ5IHtcbiAgICAgICAgcHJvamVjdEFicyA9IHJlYWxwYXRoU3luYyhwcm9qZWN0UGF0aCk7XG4gICAgfSBjYXRjaCB7XG4gICAgICAgIHByb2plY3RBYnMgPSBwYXRoLnJlc29sdmUocHJvamVjdFBhdGgpO1xuICAgIH1cbiAgICBjb25zdCBjbXAgPSBwcm9jZXNzLnBsYXRmb3JtID09PSAnd2luMzInXG4gICAgICAgID8geyByZXNvbHZlZDogcmVzb2x2ZWRBYnMudG9Mb3dlckNhc2UoKSwgcHJvamVjdDogcHJvamVjdEFicy50b0xvd2VyQ2FzZSgpIH1cbiAgICAgICAgOiB7IHJlc29sdmVkOiByZXNvbHZlZEFicywgcHJvamVjdDogcHJvamVjdEFicyB9O1xuICAgIGlmICghY21wLnJlc29sdmVkLnN0YXJ0c1dpdGgoY21wLnByb2plY3QgKyBwYXRoLnNlcCkgJiYgY21wLnJlc29sdmVkICE9PSBjbXAucHJvamVjdCkge1xuICAgICAgICByZXR1cm4geyBlcnJvcjogYGZpbGUtZWRpdG9yOiBwYXRoICR7cmVzb2x2ZWRBYnN9IHJlc29sdmVzIG91dHNpZGUgdGhlIHByb2plY3Qgcm9vdCAoc3ltbGluay1hd2FyZSBjaGVjaylgIH07XG4gICAgfVxuICAgIHJldHVybiB7IGFiczogcmVzb2x2ZWRBYnMsIHJlbFByb2plY3Q6IHBhdGgucmVsYXRpdmUocHJvamVjdEFicywgcmVzb2x2ZWRBYnMpIH07XG59XG5cbmNvbnN0IEFTU0VUX1JFRlJFU0hfRVhUUyA9IG5ldyBTZXQoWycudHMnLCAnLnRzeCcsICcuanMnLCAnLmpzeCcsICcuanNvbicsICcuZmlyZScsICcuc2NlbmUnLCAnLnByZWZhYicsICcuYW5pbScsICcubWF0ZXJpYWwnLCAnLmVmZmVjdCcsICcuZm50J10pO1xuXG4vKipcbiAqIEJlc3QtZWZmb3J0OiB0ZWxsIGNvY29zIGFzc2V0LWRiIHRoYXQgdGhlIGZpbGUgY2hhbmdlZCBzbyB0aGUgZWRpdG9yXG4gKiBwaWNrcyBpdCB1cCB3aXRob3V0IGEgbWFudWFsIHJlZnJlc2guIEZhaWx1cmUgaXMgbm9uLWZhdGFsIGJlY2F1c2VcbiAqIHRoZSBmaWxlIGlzIGFscmVhZHkgd3JpdHRlbjsgdGhlIHVzZXIgY2FuIGhpdCByZWZyZXNoIG1hbnVhbGx5LlxuICpcbiAqIE9ubHkgZmlyZXMgZm9yIGZpbGUgZXh0ZW5zaW9ucyBjb2NvcyBjYXJlcyBhYm91dCAoVFMgc291cmNlLCBKU09OXG4gKiBjb25maWdzLCBzY2VuZS9wcmVmYWIvYW5pbSBhc3NldHMsIGV0Yy4pIHNvIHBsYWluIC50eHQgZWRpdHMgZG9uJ3RcbiAqIHNwYW0gdGhlIGFzc2V0LWRiLlxuICovXG5hc3luYyBmdW5jdGlvbiByZWZyZXNoQXNzZXREYihhYnNQYXRoOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBleHQgPSBwYXRoLmV4dG5hbWUoYWJzUGF0aCkudG9Mb3dlckNhc2UoKTtcbiAgICBpZiAoIUFTU0VUX1JFRlJFU0hfRVhUUy5oYXMoZXh0KSkgcmV0dXJuO1xuICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3JlZnJlc2gtYXNzZXQnLCBhYnNQYXRoKTtcbiAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICBsb2dnZXIuZGVidWcoJ1tGaWxlRWRpdG9yXSBhc3NldC1kYiByZWZyZXNoLWFzc2V0IGZhaWxlZCAobm9uLWZhdGFsKTonLCBlcnI/Lm1lc3NhZ2UgPz8gZXJyKTtcbiAgICB9XG59XG5cbmNvbnN0IGluc2VydFRleHQ6IFRvb2xEZWYgPSB7XG4gICAgbmFtZTogJ2luc2VydF90ZXh0JyxcbiAgICB0aXRsZTogJ0luc2VydCB0ZXh0IGF0IGxpbmUnLFxuICAgIGRlc2NyaXB0aW9uOiBSRURVTkRBTlRfVEFHICsgJ0luc2VydCBhIG5ldyBsaW5lIGF0IHRoZSBnaXZlbiAxLWJhc2VkIGxpbmUgbnVtYmVyLiBJZiBsaW5lIGV4Y2VlZHMgdG90YWwsIHRleHQgaXMgYXBwZW5kZWQgYXQgZW5kIG9mIGZpbGUuIFRyaWdnZXJzIGNvY29zIGFzc2V0LWRiIHJlZnJlc2ggb24gY29jb3MtcmVjb2duaXNlZCBleHRlbnNpb25zICgudHMvLmpzb24vLnNjZW5lLy5wcmVmYWIvZXRjLikgc28gdGhlIGVkaXRvciByZWltcG9ydHMuJyxcbiAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICBmaWxlUGF0aDogei5zdHJpbmcoKS5kZXNjcmliZSgnUGF0aCB0byB0aGUgZmlsZSAoYWJzb2x1dGUgb3IgcHJvamVjdC1yZWxhdGl2ZSkuJyksXG4gICAgICAgIGxpbmU6IHoubnVtYmVyKCkuaW50KCkubWluKDEpLmRlc2NyaWJlKCcxLWJhc2VkIGxpbmUgbnVtYmVyIHRvIGluc2VydCBhdDsgZXhpc3RpbmcgbGluZXMgc2hpZnQgZG93bi4nKSxcbiAgICAgICAgdGV4dDogei5zdHJpbmcoKS5kZXNjcmliZSgnVGV4dCB0byBpbnNlcnQgYXMgYSBuZXcgbGluZSAobm8gdHJhaWxpbmcgbmV3bGluZSBleHBlY3RlZCkuJyksXG4gICAgfSksXG4gICAgaGFuZGxlcjogYXN5bmMgKGFyZ3MpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4gPT4ge1xuICAgICAgICBjb25zdCByID0gcmVzb2x2ZVBhdGhGb3JSZWFkKGFyZ3MuZmlsZVBhdGgpO1xuICAgICAgICBpZiAoJ2Vycm9yJyBpbiByKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHIuZXJyb3IgfTtcbiAgICAgICAgbGV0IGNvbnRlbnQ6IHN0cmluZztcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHN0YXQgPSBmcy5zdGF0U3luYyhyLmFicyk7XG4gICAgICAgICAgICBpZiAoc3RhdC5zaXplID4gRklMRV9SRUFEX0JZVEVfQ0FQKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgZmlsZS1lZGl0b3I6IGZpbGUgdG9vIGxhcmdlICgke3N0YXQuc2l6ZX0gYnl0ZXMpOyByZWZ1c2luZyB0byByZWFkLmAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnRlbnQgPSBmcy5yZWFkRmlsZVN5bmMoci5hYnMsICd1dGYtOCcpO1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycikgfTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCB7IGxpbmVzLCBlb2wgfSA9IHNwbGl0TGluZXNOb3JtYWxpemVkKGNvbnRlbnQpO1xuICAgICAgICBjb25zdCBpbnNlcnRJbmRleCA9IGFyZ3MubGluZSAtIDE7XG4gICAgICAgIGlmIChpbnNlcnRJbmRleCA+PSBsaW5lcy5sZW5ndGgpIHtcbiAgICAgICAgICAgIGxpbmVzLnB1c2goYXJncy50ZXh0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxpbmVzLnNwbGljZShpbnNlcnRJbmRleCwgMCwgYXJncy50ZXh0KTtcbiAgICAgICAgfVxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgZnMud3JpdGVGaWxlU3luYyhyLmFicywgbGluZXMuam9pbihlb2wpLCAndXRmLTgnKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpIH07XG4gICAgICAgIH1cbiAgICAgICAgYXdhaXQgcmVmcmVzaEFzc2V0RGIoci5hYnMpO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgIG1lc3NhZ2U6IGBJbnNlcnRlZCB0ZXh0IGF0IGxpbmUgJHtNYXRoLm1pbihhcmdzLmxpbmUsIGxpbmVzLmxlbmd0aCl9IG9mICR7ci5yZWxQcm9qZWN0fWAsXG4gICAgICAgICAgICBkYXRhOiB7IGZpbGU6IHIucmVsUHJvamVjdCwgdG90YWxMaW5lczogbGluZXMubGVuZ3RoLCBlb2w6IGVvbCA9PT0gJ1xcclxcbicgPyAnQ1JMRicgOiAnTEYnIH0sXG4gICAgICAgIH07XG4gICAgfSxcbn07XG5cbmNvbnN0IGRlbGV0ZUxpbmVzOiBUb29sRGVmID0ge1xuICAgIG5hbWU6ICdkZWxldGVfbGluZXMnLFxuICAgIHRpdGxlOiAnRGVsZXRlIGxpbmUgcmFuZ2UnLFxuICAgIGRlc2NyaXB0aW9uOiBSRURVTkRBTlRfVEFHICsgJ0RlbGV0ZSBhIHJhbmdlIG9mIGxpbmVzICgxLWJhc2VkLCBpbmNsdXNpdmUpLiBUcmlnZ2VycyBjb2NvcyBhc3NldC1kYiByZWZyZXNoLicsXG4gICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgZmlsZVBhdGg6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1BhdGggdG8gdGhlIGZpbGUgKGFic29sdXRlIG9yIHByb2plY3QtcmVsYXRpdmUpLicpLFxuICAgICAgICBzdGFydExpbmU6IHoubnVtYmVyKCkuaW50KCkubWluKDEpLmRlc2NyaWJlKCdGaXJzdCBsaW5lIHRvIGRlbGV0ZSAoMS1iYXNlZCwgaW5jbHVzaXZlKS4nKSxcbiAgICAgICAgZW5kTGluZTogei5udW1iZXIoKS5pbnQoKS5taW4oMSkuZGVzY3JpYmUoJ0xhc3QgbGluZSB0byBkZWxldGUgKDEtYmFzZWQsIGluY2x1c2l2ZSkuIE11c3QgYmUgPj0gc3RhcnRMaW5lLicpLFxuICAgIH0pLFxuICAgIGhhbmRsZXI6IGFzeW5jIChhcmdzKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+ID0+IHtcbiAgICAgICAgaWYgKGFyZ3Muc3RhcnRMaW5lID4gYXJncy5lbmRMaW5lKSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdmaWxlLWVkaXRvcjogc3RhcnRMaW5lIG11c3QgYmUgPD0gZW5kTGluZScgfTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCByID0gcmVzb2x2ZVBhdGhGb3JSZWFkKGFyZ3MuZmlsZVBhdGgpO1xuICAgICAgICBpZiAoJ2Vycm9yJyBpbiByKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHIuZXJyb3IgfTtcbiAgICAgICAgbGV0IGNvbnRlbnQ6IHN0cmluZztcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHN0YXQgPSBmcy5zdGF0U3luYyhyLmFicyk7XG4gICAgICAgICAgICBpZiAoc3RhdC5zaXplID4gRklMRV9SRUFEX0JZVEVfQ0FQKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgZmlsZS1lZGl0b3I6IGZpbGUgdG9vIGxhcmdlICgke3N0YXQuc2l6ZX0gYnl0ZXMpOyByZWZ1c2luZyB0byByZWFkLmAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnRlbnQgPSBmcy5yZWFkRmlsZVN5bmMoci5hYnMsICd1dGYtOCcpO1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycikgfTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCB7IGxpbmVzLCBlb2wgfSA9IHNwbGl0TGluZXNOb3JtYWxpemVkKGNvbnRlbnQpO1xuICAgICAgICBjb25zdCBkZWxldGVTdGFydCA9IGFyZ3Muc3RhcnRMaW5lIC0gMTtcbiAgICAgICAgY29uc3QgcmVxdWVzdGVkQ291bnQgPSBhcmdzLmVuZExpbmUgLSBhcmdzLnN0YXJ0TGluZSArIDE7XG4gICAgICAgIGNvbnN0IGRlbGV0ZWRDb3VudCA9IE1hdGgubWF4KDAsIE1hdGgubWluKHJlcXVlc3RlZENvdW50LCBsaW5lcy5sZW5ndGggLSBkZWxldGVTdGFydCkpO1xuICAgICAgICBpZiAoZGVsZXRlZENvdW50ID09PSAwKSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBmaWxlLWVkaXRvcjogcmFuZ2UgJHthcmdzLnN0YXJ0TGluZX0tJHthcmdzLmVuZExpbmV9IGlzIHBhc3QgRU9GIChmaWxlIGhhcyAke2xpbmVzLmxlbmd0aH0gbGluZXMpYCB9O1xuICAgICAgICB9XG4gICAgICAgIGxpbmVzLnNwbGljZShkZWxldGVTdGFydCwgZGVsZXRlZENvdW50KTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGZzLndyaXRlRmlsZVN5bmMoci5hYnMsIGxpbmVzLmpvaW4oZW9sKSwgJ3V0Zi04Jyk7XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKSB9O1xuICAgICAgICB9XG4gICAgICAgIGF3YWl0IHJlZnJlc2hBc3NldERiKHIuYWJzKTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICBtZXNzYWdlOiBgRGVsZXRlZCAke2RlbGV0ZWRDb3VudH0gbGluZShzKSBmcm9tIGxpbmUgJHthcmdzLnN0YXJ0TGluZX0gdG8gJHthcmdzLnN0YXJ0TGluZSArIGRlbGV0ZWRDb3VudCAtIDF9IG9mICR7ci5yZWxQcm9qZWN0fWAsXG4gICAgICAgICAgICBkYXRhOiB7IGZpbGU6IHIucmVsUHJvamVjdCwgZGVsZXRlZENvdW50LCB0b3RhbExpbmVzOiBsaW5lcy5sZW5ndGgsIGVvbDogZW9sID09PSAnXFxyXFxuJyA/ICdDUkxGJyA6ICdMRicgfSxcbiAgICAgICAgfTtcbiAgICB9LFxufTtcblxuY29uc3QgcmVwbGFjZVRleHQ6IFRvb2xEZWYgPSB7XG4gICAgbmFtZTogJ3JlcGxhY2VfdGV4dCcsXG4gICAgdGl0bGU6ICdSZXBsYWNlIHRleHQgaW4gZmlsZScsXG4gICAgZGVzY3JpcHRpb246IFJFRFVOREFOVF9UQUcgKyAnRmluZC9yZXBsYWNlIHRleHQgaW4gYSBmaWxlLiBQbGFpbiBzdHJpbmcgYnkgZGVmYXVsdDsgcGFzcyB1c2VSZWdleDp0cnVlIHRvIGludGVycHJldCBzZWFyY2ggYXMgYSByZWdleC4gUmVwbGFjZXMgZmlyc3Qgb2NjdXJyZW5jZSBvbmx5IHVubGVzcyByZXBsYWNlQWxsOnRydWUuIFJlZ2V4IGJhY2tyZWZlcmVuY2VzICgkMSwgJCYsICRgLCAkXFwnKSB3b3JrIHdoZW4gdXNlUmVnZXg6dHJ1ZS4gVHJpZ2dlcnMgY29jb3MgYXNzZXQtZGIgcmVmcmVzaC4nLFxuICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgIGZpbGVQYXRoOiB6LnN0cmluZygpLmRlc2NyaWJlKCdQYXRoIHRvIHRoZSBmaWxlIChhYnNvbHV0ZSBvciBwcm9qZWN0LXJlbGF0aXZlKS4nKSxcbiAgICAgICAgLy8gdjIuNS4xIHJvdW5kLTEgcmV2aWV3IGZpeCAoY29kZXggKyBjbGF1ZGUg8J+foSk6IGVtcHR5IHNlYXJjaCB3b3VsZFxuICAgICAgICAvLyBlaXRoZXIgaW5zZXJ0IGJldHdlZW4gZXZlcnkgY2hhciAocmVwbGFjZUFsbCkgb3IgaW5zZXJ0IGF0IGJ5dGUgMFxuICAgICAgICAvLyAoZmlyc3Qtb25seSkg4oCUIGJvdGggc3VycHJpc2luZy4gUmVqZWN0IGVhcmx5LlxuICAgICAgICBzZWFyY2g6IHouc3RyaW5nKCkubWluKDEsICdzZWFyY2ggbXVzdCBiZSBub24tZW1wdHknKS5kZXNjcmliZSgnU2VhcmNoIHRleHQgb3IgcmVnZXggcGF0dGVybiAoZGVwZW5kcyBvbiB1c2VSZWdleCkuIE11c3QgYmUgbm9uLWVtcHR5LicpLFxuICAgICAgICByZXBsYWNlOiB6LnN0cmluZygpLmRlc2NyaWJlKCdSZXBsYWNlbWVudCB0ZXh0LiBSZWdleCBiYWNrcmVmZXJlbmNlcyAoJDEsICQmLCAkYCwgJFxcJykgZXhwYW5kIHdoZW4gdXNlUmVnZXg6dHJ1ZS4nKSxcbiAgICAgICAgdXNlUmVnZXg6IHouYm9vbGVhbigpLmRlZmF1bHQoZmFsc2UpLmRlc2NyaWJlKCdUcmVhdCBgc2VhcmNoYCBhcyBhIEpTIFJlZ0V4cCBzb3VyY2Ugc3RyaW5nLiBEZWZhdWx0IGZhbHNlLicpLFxuICAgICAgICByZXBsYWNlQWxsOiB6LmJvb2xlYW4oKS5kZWZhdWx0KGZhbHNlKS5kZXNjcmliZSgnUmVwbGFjZSBldmVyeSBvY2N1cnJlbmNlLiBEZWZhdWx0IGZhbHNlIChmaXJzdCBvbmx5KS4nKSxcbiAgICB9KSxcbiAgICBoYW5kbGVyOiBhc3luYyAoYXJncyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiA9PiB7XG4gICAgICAgIGNvbnN0IHIgPSByZXNvbHZlUGF0aEZvclJlYWQoYXJncy5maWxlUGF0aCk7XG4gICAgICAgIGlmICgnZXJyb3InIGluIHIpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogci5lcnJvciB9O1xuICAgICAgICBsZXQgY29udGVudDogc3RyaW5nO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3Qgc3RhdCA9IGZzLnN0YXRTeW5jKHIuYWJzKTtcbiAgICAgICAgICAgIGlmIChzdGF0LnNpemUgPiBGSUxFX1JFQURfQllURV9DQVApIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBmaWxlLWVkaXRvcjogZmlsZSB0b28gbGFyZ2UgKCR7c3RhdC5zaXplfSBieXRlcyk7IHJlZnVzaW5nIHRvIHJlYWQuYCB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gdjIuNS4xIHJvdW5kLTEgcmV2aWV3IGZpeCAoY29kZXggKyBjbGF1ZGUgKyBnZW1pbmkg8J+foSk6IHJlZ2V4XG4gICAgICAgICAgICAvLyBtb2RlIHJ1bnMgdXNlci1jb250cm9sbGVkIHBhdHRlcm5zIGFnYWluc3QgdGhlIGZpbGUgY29udGVudFxuICAgICAgICAgICAgLy8gd2l0aCBubyB0aW1lb3V0LiBDYXAgdG8gYSBzbWFsbGVyIHdpbmRvdyBpbiByZWdleCBtb2RlIHNvXG4gICAgICAgICAgICAvLyBjYXRhc3Ryb3BoaWMgYmFja3RyYWNraW5nIG9uIGEgbGFyZ2UgZmlsZSBjYW4ndCBoYW5nIHRoZVxuICAgICAgICAgICAgLy8gZWRpdG9yJ3MgaG9zdCBwcm9jZXNzLiBQbGFpbi1zdHJpbmcgbW9kZSBrZWVwcyB0aGUgbGFyZ2VyXG4gICAgICAgICAgICAvLyBGSUxFX1JFQURfQllURV9DQVAgYmVjYXVzZSBTdHJpbmcuc3BsaXQvaW5kZXhPZi9zbGljZSBhcmVcbiAgICAgICAgICAgIC8vIGJvdW5kZWQgYnkgVjggaW50ZXJuYWxzIChubyByZWdleCBlbmdpbmUgcGF0aCkuXG4gICAgICAgICAgICBpZiAoYXJncy51c2VSZWdleCAmJiBzdGF0LnNpemUgPiBSRUdFWF9NT0RFX0JZVEVfQ0FQKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgZmlsZS1lZGl0b3I6IHJlZ2V4IG1vZGUgcmVmdXNlcyBmaWxlcyA+ICR7UkVHRVhfTU9ERV9CWVRFX0NBUH0gYnl0ZXMgKCR7c3RhdC5zaXplfSBieXRlcyBoZXJlKS4gU3dpdGNoIHRvIHVzZVJlZ2V4OmZhbHNlIG9yIHNwbGl0IHRoZSBmaWxlIGZpcnN0LmAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnRlbnQgPSBmcy5yZWFkRmlsZVN5bmMoci5hYnMsICd1dGYtOCcpO1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycikgfTtcbiAgICAgICAgfVxuICAgICAgICBsZXQgcmVwbGFjZW1lbnRzID0gMDtcbiAgICAgICAgbGV0IG5ld0NvbnRlbnQ6IHN0cmluZztcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGlmIChhcmdzLnVzZVJlZ2V4KSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZmxhZ3MgPSBhcmdzLnJlcGxhY2VBbGwgPyAnZycgOiAnJztcbiAgICAgICAgICAgICAgICBjb25zdCByZWdleCA9IG5ldyBSZWdFeHAoYXJncy5zZWFyY2gsIGZsYWdzKTtcbiAgICAgICAgICAgICAgICAvLyB2Mi41LjEgcm91bmQtMSByZXZpZXcgZml4IChjb2RleCDwn5S0KTogcGFzcyB0aGUgcmVwbGFjZW1lbnRcbiAgICAgICAgICAgICAgICAvLyBTVFJJTkcgZGlyZWN0bHkgc28gJDEvJCYvZXRjLiBleHBhbmQuIFRoZSBwcmV2aW91c1xuICAgICAgICAgICAgICAgIC8vIGZ1bmN0aW9uLWNhbGxiYWNrIGZvcm0gcmV0dXJuZWQgYGFyZ3MucmVwbGFjZWAgbGl0ZXJhbGx5LFxuICAgICAgICAgICAgICAgIC8vIGJyZWFraW5nIHRoZSBkb2N1bWVudGVkIGJhY2tyZWZlcmVuY2UgYmVoYXZpb3VyLiBDb3VudFxuICAgICAgICAgICAgICAgIC8vIG1hdGNoZXMgc2VwYXJhdGVseSB2aWEgYSBwYXJhbGxlbCBtYXRjaCgpIHBhc3Mgc2luY2Ugd2VcbiAgICAgICAgICAgICAgICAvLyBubyBsb25nZXIgaGF2ZSB0aGUgcGVyLWNhbGwgY291bnRlci5cbiAgICAgICAgICAgICAgICBjb25zdCBtYXRjaGVzID0gY29udGVudC5tYXRjaChyZWdleCk7XG4gICAgICAgICAgICAgICAgcmVwbGFjZW1lbnRzID0gbWF0Y2hlcyA/IG1hdGNoZXMubGVuZ3RoIDogMDtcbiAgICAgICAgICAgICAgICBuZXdDb250ZW50ID0gY29udGVudC5yZXBsYWNlKHJlZ2V4LCBhcmdzLnJlcGxhY2UpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChhcmdzLnJlcGxhY2VBbGwpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBwYXJ0cyA9IGNvbnRlbnQuc3BsaXQoYXJncy5zZWFyY2gpO1xuICAgICAgICAgICAgICAgIHJlcGxhY2VtZW50cyA9IHBhcnRzLmxlbmd0aCAtIDE7XG4gICAgICAgICAgICAgICAgbmV3Q29udGVudCA9IHBhcnRzLmpvaW4oYXJncy5yZXBsYWNlKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc3QgaWR4ID0gY29udGVudC5pbmRleE9mKGFyZ3Muc2VhcmNoKTtcbiAgICAgICAgICAgICAgICBpZiAoaWR4ID09PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBtZXNzYWdlOiAnTm8gb2NjdXJyZW5jZXMgZm91bmQ7IGZpbGUgdW5jaGFuZ2VkLicsIGRhdGE6IHsgZmlsZTogci5yZWxQcm9qZWN0LCByZXBsYWNlbWVudHM6IDAgfSB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXBsYWNlbWVudHMgPSAxO1xuICAgICAgICAgICAgICAgIG5ld0NvbnRlbnQgPSBjb250ZW50LnNsaWNlKDAsIGlkeCkgKyBhcmdzLnJlcGxhY2UgKyBjb250ZW50LnNsaWNlKGlkeCArIGFyZ3Muc2VhcmNoLmxlbmd0aCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBmaWxlLWVkaXRvcjogcmVwbGFjZSBmYWlsZWQ6ICR7ZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpfWAgfTtcbiAgICAgICAgfVxuICAgICAgICBpZiAocmVwbGFjZW1lbnRzID09PSAwKSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBtZXNzYWdlOiAnTm8gb2NjdXJyZW5jZXMgZm91bmQ7IGZpbGUgdW5jaGFuZ2VkLicsIGRhdGE6IHsgZmlsZTogci5yZWxQcm9qZWN0LCByZXBsYWNlbWVudHM6IDAgfSB9O1xuICAgICAgICB9XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBmcy53cml0ZUZpbGVTeW5jKHIuYWJzLCBuZXdDb250ZW50LCAndXRmLTgnKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpIH07XG4gICAgICAgIH1cbiAgICAgICAgYXdhaXQgcmVmcmVzaEFzc2V0RGIoci5hYnMpO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgIG1lc3NhZ2U6IGBSZXBsYWNlZCAke3JlcGxhY2VtZW50c30gb2NjdXJyZW5jZShzKSBpbiAke3IucmVsUHJvamVjdH1gLFxuICAgICAgICAgICAgZGF0YTogeyBmaWxlOiByLnJlbFByb2plY3QsIHJlcGxhY2VtZW50cyB9LFxuICAgICAgICB9O1xuICAgIH0sXG59O1xuXG5jb25zdCBxdWVyeVRleHQ6IFRvb2xEZWYgPSB7XG4gICAgbmFtZTogJ3F1ZXJ5X3RleHQnLFxuICAgIHRpdGxlOiAnUmVhZCBsaW5lIHJhbmdlJyxcbiAgICBkZXNjcmlwdGlvbjogUkVEVU5EQU5UX1RBRyArICdSZWFkIGEgcmFuZ2Ugb2YgbGluZXMgKDEtYmFzZWQsIGluY2x1c2l2ZSkuIFJldHVybnMgbGluZXMgd2l0aCBsaW5lIG51bWJlcnM7IHRvdGFsIGxpbmUgY291bnQgb2YgZmlsZSBpbiBkYXRhLnRvdGFsTGluZXMuIFJlYWQtb25seTsgbm8gYXNzZXQtZGIgcmVmcmVzaC4nLFxuICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgIGZpbGVQYXRoOiB6LnN0cmluZygpLmRlc2NyaWJlKCdQYXRoIHRvIHRoZSBmaWxlIChhYnNvbHV0ZSBvciBwcm9qZWN0LXJlbGF0aXZlKS4nKSxcbiAgICAgICAgc3RhcnRMaW5lOiB6Lm51bWJlcigpLmludCgpLm1pbigxKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdGaXJzdCBsaW5lIHRvIHJlYWQgKDEtYmFzZWQpLiBEZWZhdWx0IDEuJyksXG4gICAgICAgIGVuZExpbmU6IHoubnVtYmVyKCkuaW50KCkubWluKDEpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0xhc3QgbGluZSB0byByZWFkICgxLWJhc2VkLCBpbmNsdXNpdmUpLiBEZWZhdWx0IGVuZCBvZiBmaWxlLicpLFxuICAgIH0pLFxuICAgIGhhbmRsZXI6IGFzeW5jIChhcmdzKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+ID0+IHtcbiAgICAgICAgY29uc3QgciA9IHJlc29sdmVQYXRoRm9yUmVhZChhcmdzLmZpbGVQYXRoKTtcbiAgICAgICAgaWYgKCdlcnJvcicgaW4gcikgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiByLmVycm9yIH07XG4gICAgICAgIGxldCBjb250ZW50OiBzdHJpbmc7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBzdGF0ID0gZnMuc3RhdFN5bmMoci5hYnMpO1xuICAgICAgICAgICAgaWYgKHN0YXQuc2l6ZSA+IEZJTEVfUkVBRF9CWVRFX0NBUCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYGZpbGUtZWRpdG9yOiBmaWxlIHRvbyBsYXJnZSAoJHtzdGF0LnNpemV9IGJ5dGVzKTsgcmVmdXNpbmcgdG8gcmVhZC5gIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb250ZW50ID0gZnMucmVhZEZpbGVTeW5jKHIuYWJzLCAndXRmLTgnKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpIH07XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgeyBsaW5lcywgZW9sIH0gPSBzcGxpdExpbmVzTm9ybWFsaXplZChjb250ZW50KTtcbiAgICAgICAgY29uc3QgdG90YWxMaW5lcyA9IGxpbmVzLmxlbmd0aDtcbiAgICAgICAgY29uc3QgZnJvbSA9IChhcmdzLnN0YXJ0TGluZSA/PyAxKSAtIDE7XG4gICAgICAgIGNvbnN0IHRvID0gYXJncy5lbmRMaW5lID8/IHRvdGFsTGluZXM7XG4gICAgICAgIGlmIChmcm9tID49IHRvdGFsTGluZXMpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYGZpbGUtZWRpdG9yOiBzdGFydExpbmUgJHthcmdzLnN0YXJ0TGluZSA/PyAxfSBwYXN0IEVPRiAoZmlsZSBoYXMgJHt0b3RhbExpbmVzfSBsaW5lcylgIH07XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGFyZ3Muc3RhcnRMaW5lICE9PSB1bmRlZmluZWQgJiYgYXJncy5lbmRMaW5lICE9PSB1bmRlZmluZWQgJiYgYXJncy5zdGFydExpbmUgPiBhcmdzLmVuZExpbmUpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ2ZpbGUtZWRpdG9yOiBzdGFydExpbmUgbXVzdCBiZSA8PSBlbmRMaW5lJyB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHNsaWNlZCA9IGxpbmVzLnNsaWNlKGZyb20sIHRvKTtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gc2xpY2VkLm1hcCgodGV4dCwgaSkgPT4gKHsgbGluZTogZnJvbSArIGkgKyAxLCB0ZXh0IH0pKTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICBtZXNzYWdlOiBgUmVhZCAke3Jlc3VsdC5sZW5ndGh9IGxpbmUocykgZnJvbSAke3IucmVsUHJvamVjdH1gLFxuICAgICAgICAgICAgZGF0YTogeyBmaWxlOiByLnJlbFByb2plY3QsIHRvdGFsTGluZXMsIHN0YXJ0TGluZTogZnJvbSArIDEsIGVuZExpbmU6IGZyb20gKyByZXN1bHQubGVuZ3RoLCBlb2w6IGVvbCA9PT0gJ1xcclxcbicgPyAnQ1JMRicgOiAnTEYnLCBsaW5lczogcmVzdWx0IH0sXG4gICAgICAgIH07XG4gICAgfSxcbn07XG5cbmV4cG9ydCBjbGFzcyBGaWxlRWRpdG9yVG9vbHMge1xuICAgIHByaXZhdGUgaW1wbCA9IGRlZmluZVRvb2xzKFtcbiAgICAgICAgaW5zZXJ0VGV4dCxcbiAgICAgICAgZGVsZXRlTGluZXMsXG4gICAgICAgIHJlcGxhY2VUZXh0LFxuICAgICAgICBxdWVyeVRleHQsXG4gICAgXSk7XG5cbiAgICBnZXRUb29scygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuaW1wbC5nZXRUb29scygpO1xuICAgIH1cblxuICAgIGV4ZWN1dGUodG9vbE5hbWU6IHN0cmluZywgYXJnczogYW55KSB7XG4gICAgICAgIHJldHVybiB0aGlzLmltcGwuZXhlY3V0ZSh0b29sTmFtZSwgYXJncyk7XG4gICAgfVxufVxuIl19