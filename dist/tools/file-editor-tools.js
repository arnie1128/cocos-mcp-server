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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmlsZS1lZGl0b3ItdG9vbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvdG9vbHMvZmlsZS1lZGl0b3ItdG9vbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBeUJHOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUgsdUNBQXlCO0FBQ3pCLDJDQUE2QjtBQUU3QiwwQ0FBa0M7QUFDbEMsc0RBQTJEO0FBQzNELG9DQUFvQztBQUVwQyxNQUFNLGFBQWEsR0FBRywwRUFBMEUsQ0FBQztBQUVqRyxtRUFBbUU7QUFDbkUsdUNBQXVDO0FBQ3ZDLE1BQU0sa0JBQWtCLEdBQUcsQ0FBQyxHQUFHLElBQUksR0FBRyxJQUFJLENBQUM7QUFFM0MsMEVBQTBFO0FBQzFFLGdFQUFnRTtBQUNoRSx1RUFBdUU7QUFDdkUsd0VBQXdFO0FBQ3hFLGtEQUFrRDtBQUNsRCxNQUFNLG1CQUFtQixHQUFHLENBQUMsR0FBRyxJQUFJLEdBQUcsSUFBSSxDQUFDO0FBRTVDLDZFQUE2RTtBQUM3RSx5RUFBeUU7QUFDekUsK0RBQStEO0FBQy9ELE1BQU0sWUFBWSxHQUEyQixNQUFDLEVBQUUsQ0FBQyxZQUFvQixDQUFDLE1BQU0sbUNBQUksRUFBRSxDQUFDLFlBQVksQ0FBQztBQUVoRywwRUFBMEU7QUFDMUUsd0VBQXdFO0FBQ3hFLHdFQUF3RTtBQUN4RSxrRUFBa0U7QUFDbEUsd0RBQXdEO0FBQ3hELFNBQVMsU0FBUyxDQUFDLE9BQWU7SUFDOUIsbUVBQW1FO0lBQ25FLG9FQUFvRTtJQUNwRSxrRUFBa0U7SUFDbEUsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUM7SUFDeEUsSUFBSSxJQUFJLEdBQUcsQ0FBQyxDQUFDO0lBQ2IsSUFBSSxFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBQ1gsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztRQUNyQyxJQUFJLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLEtBQUssSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ3pDLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxJQUFJLENBQUMsUUFBUTtnQkFBRSxJQUFJLEVBQUUsQ0FBQzs7Z0JBQzNELEVBQUUsRUFBRSxDQUFDO1FBQ2QsQ0FBQztJQUNMLENBQUM7SUFDRCxPQUFPLElBQUksR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO0FBQ3JDLENBQUM7QUFFRCxTQUFTLG9CQUFvQixDQUFDLE9BQWU7SUFDekMsT0FBTztRQUNILEtBQUssRUFBRSxPQUFPLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQztRQUM3QixHQUFHLEVBQUUsU0FBUyxDQUFDLE9BQU8sQ0FBQztLQUMxQixDQUFDO0FBQ04sQ0FBQztBQUlELFNBQVMsY0FBYzs7SUFDbkIsSUFBSSxDQUFDO1FBQ0QsT0FBTyxNQUFBLE1BQUEsTUFBTSxhQUFOLE1BQU0sdUJBQU4sTUFBTSxDQUFFLE9BQU8sMENBQUUsSUFBSSxtQ0FBSSxJQUFJLENBQUM7SUFDekMsQ0FBQztJQUFDLFdBQU0sQ0FBQztRQUNMLE9BQU8sSUFBSSxDQUFDO0lBQ2hCLENBQUM7QUFDTCxDQUFDO0FBRUQ7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQWtCRztBQUNILFNBQVMsa0JBQWtCLENBQUMsTUFBYztJQUN0QyxNQUFNLFdBQVcsR0FBRyxjQUFjLEVBQUUsQ0FBQztJQUNyQyxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7UUFDZixPQUFPLEVBQUUsS0FBSyxFQUFFLGtFQUFrRSxFQUFFLENBQUM7SUFDekYsQ0FBQztJQUNELE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFDakYsSUFBSSxXQUFtQixDQUFDO0lBQ3hCLElBQUksQ0FBQztRQUNELFdBQVcsR0FBRyxZQUFZLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDdkMsQ0FBQztJQUFDLFdBQU0sQ0FBQztRQUNMLE9BQU8sRUFBRSxLQUFLLEVBQUUsOENBQThDLE1BQU0sRUFBRSxFQUFFLENBQUM7SUFDN0UsQ0FBQztJQUNELElBQUksVUFBa0IsQ0FBQztJQUN2QixJQUFJLENBQUM7UUFDRCxVQUFVLEdBQUcsWUFBWSxDQUFDLFdBQVcsQ0FBQyxDQUFDO0lBQzNDLENBQUM7SUFBQyxXQUFNLENBQUM7UUFDTCxVQUFVLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsQ0FBQztJQUMzQyxDQUFDO0lBQ0QsTUFBTSxHQUFHLEdBQUcsT0FBTyxDQUFDLFFBQVEsS0FBSyxPQUFPO1FBQ3BDLENBQUMsQ0FBQyxFQUFFLFFBQVEsRUFBRSxXQUFXLENBQUMsV0FBVyxFQUFFLEVBQUUsT0FBTyxFQUFFLFVBQVUsQ0FBQyxXQUFXLEVBQUUsRUFBRTtRQUM1RSxDQUFDLENBQUMsRUFBRSxRQUFRLEVBQUUsV0FBVyxFQUFFLE9BQU8sRUFBRSxVQUFVLEVBQUUsQ0FBQztJQUNyRCxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksR0FBRyxDQUFDLFFBQVEsS0FBSyxHQUFHLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDbkYsT0FBTyxFQUFFLEtBQUssRUFBRSxxQkFBcUIsV0FBVywwREFBMEQsRUFBRSxDQUFDO0lBQ2pILENBQUM7SUFDRCxPQUFPLEVBQUUsR0FBRyxFQUFFLFdBQVcsRUFBRSxVQUFVLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxVQUFVLEVBQUUsV0FBVyxDQUFDLEVBQUUsQ0FBQztBQUNwRixDQUFDO0FBRUQsTUFBTSxrQkFBa0IsR0FBRyxJQUFJLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsT0FBTyxFQUFFLFdBQVcsRUFBRSxTQUFTLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQztBQUVuSjs7Ozs7Ozs7R0FRRztBQUNILEtBQUssVUFBVSxjQUFjLENBQUMsT0FBZTs7SUFDekMsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxXQUFXLEVBQUUsQ0FBQztJQUNoRCxJQUFJLENBQUMsa0JBQWtCLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQztRQUFFLE9BQU87SUFDekMsSUFBSSxDQUFDO1FBQ0QsTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUUsZUFBZSxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQ3ZFLENBQUM7SUFBQyxPQUFPLEdBQVEsRUFBRSxDQUFDO1FBQ2hCLFlBQU0sQ0FBQyxLQUFLLENBQUMseURBQXlELEVBQUUsTUFBQSxHQUFHLGFBQUgsR0FBRyx1QkFBSCxHQUFHLENBQUUsT0FBTyxtQ0FBSSxHQUFHLENBQUMsQ0FBQztJQUNqRyxDQUFDO0FBQ0wsQ0FBQztBQUVELE1BQU0sVUFBVSxHQUFZO0lBQ3hCLElBQUksRUFBRSxhQUFhO0lBQ25CLFdBQVcsRUFBRSxhQUFhLEdBQUcscU9BQXFPO0lBQ2xRLFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDO1FBQ2xCLFFBQVEsRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLGtEQUFrRCxDQUFDO1FBQ2pGLElBQUksRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyw4REFBOEQsQ0FBQztRQUN0RyxJQUFJLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyw4REFBOEQsQ0FBQztLQUM1RixDQUFDO0lBQ0YsT0FBTyxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQXlCLEVBQUU7O1FBQzNDLE1BQU0sQ0FBQyxHQUFHLGtCQUFrQixDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUM1QyxJQUFJLE9BQU8sSUFBSSxDQUFDO1lBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUM1RCxJQUFJLE9BQWUsQ0FBQztRQUNwQixJQUFJLENBQUM7WUFDRCxNQUFNLElBQUksR0FBRyxFQUFFLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNoQyxJQUFJLElBQUksQ0FBQyxJQUFJLEdBQUcsa0JBQWtCLEVBQUUsQ0FBQztnQkFDakMsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLGdDQUFnQyxJQUFJLENBQUMsSUFBSSw0QkFBNEIsRUFBRSxDQUFDO1lBQzVHLENBQUM7WUFDRCxPQUFPLEdBQUcsRUFBRSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQzlDLENBQUM7UUFBQyxPQUFPLEdBQVEsRUFBRSxDQUFDO1lBQ2hCLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxNQUFBLEdBQUcsYUFBSCxHQUFHLHVCQUFILEdBQUcsQ0FBRSxPQUFPLG1DQUFJLE1BQU0sQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO1FBQ2xFLENBQUM7UUFDRCxNQUFNLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRSxHQUFHLG9CQUFvQixDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3JELE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxJQUFJLEdBQUcsQ0FBQyxDQUFDO1FBQ2xDLElBQUksV0FBVyxJQUFJLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUM5QixLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUMxQixDQUFDO2FBQU0sQ0FBQztZQUNKLEtBQUssQ0FBQyxNQUFNLENBQUMsV0FBVyxFQUFFLENBQUMsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDNUMsQ0FBQztRQUNELElBQUksQ0FBQztZQUNELEVBQUUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQ3RELENBQUM7UUFBQyxPQUFPLEdBQVEsRUFBRSxDQUFDO1lBQ2hCLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxNQUFBLEdBQUcsYUFBSCxHQUFHLHVCQUFILEdBQUcsQ0FBRSxPQUFPLG1DQUFJLE1BQU0sQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO1FBQ2xFLENBQUM7UUFDRCxNQUFNLGNBQWMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDNUIsT0FBTztZQUNILE9BQU8sRUFBRSxJQUFJO1lBQ2IsT0FBTyxFQUFFLHlCQUF5QixJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQyxVQUFVLEVBQUU7WUFDeEYsSUFBSSxFQUFFLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxVQUFVLEVBQUUsVUFBVSxFQUFFLEtBQUssQ0FBQyxNQUFNLEVBQUUsR0FBRyxFQUFFLEdBQUcsS0FBSyxNQUFNLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFO1NBQzlGLENBQUM7SUFDTixDQUFDO0NBQ0osQ0FBQztBQUVGLE1BQU0sV0FBVyxHQUFZO0lBQ3pCLElBQUksRUFBRSxjQUFjO0lBQ3BCLFdBQVcsRUFBRSxhQUFhLEdBQUcsZ0ZBQWdGO0lBQzdHLFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDO1FBQ2xCLFFBQVEsRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLGtEQUFrRCxDQUFDO1FBQ2pGLFNBQVMsRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyw0Q0FBNEMsQ0FBQztRQUN6RixPQUFPLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsaUVBQWlFLENBQUM7S0FDL0csQ0FBQztJQUNGLE9BQU8sRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUF5QixFQUFFOztRQUMzQyxJQUFJLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ2hDLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSwyQ0FBMkMsRUFBRSxDQUFDO1FBQ2xGLENBQUM7UUFDRCxNQUFNLENBQUMsR0FBRyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDNUMsSUFBSSxPQUFPLElBQUksQ0FBQztZQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDNUQsSUFBSSxPQUFlLENBQUM7UUFDcEIsSUFBSSxDQUFDO1lBQ0QsTUFBTSxJQUFJLEdBQUcsRUFBRSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDaEMsSUFBSSxJQUFJLENBQUMsSUFBSSxHQUFHLGtCQUFrQixFQUFFLENBQUM7Z0JBQ2pDLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxnQ0FBZ0MsSUFBSSxDQUFDLElBQUksNEJBQTRCLEVBQUUsQ0FBQztZQUM1RyxDQUFDO1lBQ0QsT0FBTyxHQUFHLEVBQUUsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUM5QyxDQUFDO1FBQUMsT0FBTyxHQUFRLEVBQUUsQ0FBQztZQUNoQixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsTUFBQSxHQUFHLGFBQUgsR0FBRyx1QkFBSCxHQUFHLENBQUUsT0FBTyxtQ0FBSSxNQUFNLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztRQUNsRSxDQUFDO1FBQ0QsTUFBTSxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsR0FBRyxvQkFBb0IsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUNyRCxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsU0FBUyxHQUFHLENBQUMsQ0FBQztRQUN2QyxNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQyxTQUFTLEdBQUcsQ0FBQyxDQUFDO1FBQ3pELE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsY0FBYyxFQUFFLEtBQUssQ0FBQyxNQUFNLEdBQUcsV0FBVyxDQUFDLENBQUMsQ0FBQztRQUN2RixJQUFJLFlBQVksS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUNyQixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsc0JBQXNCLElBQUksQ0FBQyxTQUFTLElBQUksSUFBSSxDQUFDLE9BQU8sMEJBQTBCLEtBQUssQ0FBQyxNQUFNLFNBQVMsRUFBRSxDQUFDO1FBQzFJLENBQUM7UUFDRCxLQUFLLENBQUMsTUFBTSxDQUFDLFdBQVcsRUFBRSxZQUFZLENBQUMsQ0FBQztRQUN4QyxJQUFJLENBQUM7WUFDRCxFQUFFLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUN0RCxDQUFDO1FBQUMsT0FBTyxHQUFRLEVBQUUsQ0FBQztZQUNoQixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsTUFBQSxHQUFHLGFBQUgsR0FBRyx1QkFBSCxHQUFHLENBQUUsT0FBTyxtQ0FBSSxNQUFNLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztRQUNsRSxDQUFDO1FBQ0QsTUFBTSxjQUFjLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQzVCLE9BQU87WUFDSCxPQUFPLEVBQUUsSUFBSTtZQUNiLE9BQU8sRUFBRSxXQUFXLFlBQVksc0JBQXNCLElBQUksQ0FBQyxTQUFTLE9BQU8sSUFBSSxDQUFDLFNBQVMsR0FBRyxZQUFZLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxVQUFVLEVBQUU7WUFDakksSUFBSSxFQUFFLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxVQUFVLEVBQUUsWUFBWSxFQUFFLFVBQVUsRUFBRSxLQUFLLENBQUMsTUFBTSxFQUFFLEdBQUcsRUFBRSxHQUFHLEtBQUssTUFBTSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRTtTQUM1RyxDQUFDO0lBQ04sQ0FBQztDQUNKLENBQUM7QUFFRixNQUFNLFdBQVcsR0FBWTtJQUN6QixJQUFJLEVBQUUsY0FBYztJQUNwQixXQUFXLEVBQUUsYUFBYSxHQUFHLGtRQUFrUTtJQUMvUixXQUFXLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQztRQUNsQixRQUFRLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyxrREFBa0QsQ0FBQztRQUNqRixvRUFBb0U7UUFDcEUsb0VBQW9FO1FBQ3BFLGdEQUFnRDtRQUNoRCxNQUFNLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsMEJBQTBCLENBQUMsQ0FBQyxRQUFRLENBQUMsd0VBQXdFLENBQUM7UUFDeEksT0FBTyxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLENBQUMscUZBQXFGLENBQUM7UUFDbkgsUUFBUSxFQUFFLFVBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUMsUUFBUSxDQUFDLDZEQUE2RCxDQUFDO1FBQzVHLFVBQVUsRUFBRSxVQUFDLENBQUMsT0FBTyxFQUFFLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDLFFBQVEsQ0FBQyx1REFBdUQsQ0FBQztLQUMzRyxDQUFDO0lBQ0YsT0FBTyxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQXlCLEVBQUU7O1FBQzNDLE1BQU0sQ0FBQyxHQUFHLGtCQUFrQixDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUM1QyxJQUFJLE9BQU8sSUFBSSxDQUFDO1lBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUM1RCxJQUFJLE9BQWUsQ0FBQztRQUNwQixJQUFJLENBQUM7WUFDRCxNQUFNLElBQUksR0FBRyxFQUFFLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNoQyxJQUFJLElBQUksQ0FBQyxJQUFJLEdBQUcsa0JBQWtCLEVBQUUsQ0FBQztnQkFDakMsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLGdDQUFnQyxJQUFJLENBQUMsSUFBSSw0QkFBNEIsRUFBRSxDQUFDO1lBQzVHLENBQUM7WUFDRCxnRUFBZ0U7WUFDaEUsOERBQThEO1lBQzlELDREQUE0RDtZQUM1RCwyREFBMkQ7WUFDM0QsNERBQTREO1lBQzVELDREQUE0RDtZQUM1RCxrREFBa0Q7WUFDbEQsSUFBSSxJQUFJLENBQUMsUUFBUSxJQUFJLElBQUksQ0FBQyxJQUFJLEdBQUcsbUJBQW1CLEVBQUUsQ0FBQztnQkFDbkQsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLDJDQUEyQyxtQkFBbUIsV0FBVyxJQUFJLENBQUMsSUFBSSxpRUFBaUUsRUFBRSxDQUFDO1lBQzFMLENBQUM7WUFDRCxPQUFPLEdBQUcsRUFBRSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQzlDLENBQUM7UUFBQyxPQUFPLEdBQVEsRUFBRSxDQUFDO1lBQ2hCLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxNQUFBLEdBQUcsYUFBSCxHQUFHLHVCQUFILEdBQUcsQ0FBRSxPQUFPLG1DQUFJLE1BQU0sQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO1FBQ2xFLENBQUM7UUFDRCxJQUFJLFlBQVksR0FBRyxDQUFDLENBQUM7UUFDckIsSUFBSSxVQUFrQixDQUFDO1FBQ3ZCLElBQUksQ0FBQztZQUNELElBQUksSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO2dCQUNoQixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztnQkFDekMsTUFBTSxLQUFLLEdBQUcsSUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsQ0FBQztnQkFDN0MsNkRBQTZEO2dCQUM3RCxxREFBcUQ7Z0JBQ3JELDREQUE0RDtnQkFDNUQseURBQXlEO2dCQUN6RCwwREFBMEQ7Z0JBQzFELHVDQUF1QztnQkFDdkMsTUFBTSxPQUFPLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDckMsWUFBWSxHQUFHLE9BQU8sQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUM1QyxVQUFVLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ3RELENBQUM7aUJBQU0sSUFBSSxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7Z0JBQ3pCLE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUN6QyxZQUFZLEdBQUcsS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUM7Z0JBQ2hDLFVBQVUsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUMxQyxDQUFDO2lCQUFNLENBQUM7Z0JBQ0osTUFBTSxHQUFHLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQ3pDLElBQUksR0FBRyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUM7b0JBQ2IsT0FBTyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLElBQUksRUFBRSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsVUFBVSxFQUFFLFlBQVksRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO2dCQUM5SCxDQUFDO2dCQUNELFlBQVksR0FBRyxDQUFDLENBQUM7Z0JBQ2pCLFVBQVUsR0FBRyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUMsT0FBTyxHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUMsR0FBRyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDaEcsQ0FBQztRQUNMLENBQUM7UUFBQyxPQUFPLEdBQVEsRUFBRSxDQUFDO1lBQ2hCLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxnQ0FBZ0MsTUFBQSxHQUFHLGFBQUgsR0FBRyx1QkFBSCxHQUFHLENBQUUsT0FBTyxtQ0FBSSxNQUFNLENBQUMsR0FBRyxDQUFDLEVBQUUsRUFBRSxDQUFDO1FBQ3BHLENBQUM7UUFDRCxJQUFJLFlBQVksS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUNyQixPQUFPLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsSUFBSSxFQUFFLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxVQUFVLEVBQUUsWUFBWSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7UUFDOUgsQ0FBQztRQUNELElBQUksQ0FBQztZQUNELEVBQUUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxVQUFVLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDakQsQ0FBQztRQUFDLE9BQU8sR0FBUSxFQUFFLENBQUM7WUFDaEIsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLE1BQUEsR0FBRyxhQUFILEdBQUcsdUJBQUgsR0FBRyxDQUFFLE9BQU8sbUNBQUksTUFBTSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7UUFDbEUsQ0FBQztRQUNELE1BQU0sY0FBYyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUM1QixPQUFPO1lBQ0gsT0FBTyxFQUFFLElBQUk7WUFDYixPQUFPLEVBQUUsWUFBWSxZQUFZLHFCQUFxQixDQUFDLENBQUMsVUFBVSxFQUFFO1lBQ3BFLElBQUksRUFBRSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsVUFBVSxFQUFFLFlBQVksRUFBRTtTQUM3QyxDQUFDO0lBQ04sQ0FBQztDQUNKLENBQUM7QUFFRixNQUFNLFNBQVMsR0FBWTtJQUN2QixJQUFJLEVBQUUsWUFBWTtJQUNsQixXQUFXLEVBQUUsYUFBYSxHQUFHLDJKQUEySjtJQUN4TCxXQUFXLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQztRQUNsQixRQUFRLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyxrREFBa0QsQ0FBQztRQUNqRixTQUFTLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxRQUFRLENBQUMsMENBQTBDLENBQUM7UUFDbEcsT0FBTyxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUMsUUFBUSxDQUFDLDhEQUE4RCxDQUFDO0tBQ3ZILENBQUM7SUFDRixPQUFPLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBeUIsRUFBRTs7UUFDM0MsTUFBTSxDQUFDLEdBQUcsa0JBQWtCLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzVDLElBQUksT0FBTyxJQUFJLENBQUM7WUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQzVELElBQUksT0FBZSxDQUFDO1FBQ3BCLElBQUksQ0FBQztZQUNELE1BQU0sSUFBSSxHQUFHLEVBQUUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ2hDLElBQUksSUFBSSxDQUFDLElBQUksR0FBRyxrQkFBa0IsRUFBRSxDQUFDO2dCQUNqQyxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsZ0NBQWdDLElBQUksQ0FBQyxJQUFJLDRCQUE0QixFQUFFLENBQUM7WUFDNUcsQ0FBQztZQUNELE9BQU8sR0FBRyxFQUFFLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDOUMsQ0FBQztRQUFDLE9BQU8sR0FBUSxFQUFFLENBQUM7WUFDaEIsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLE1BQUEsR0FBRyxhQUFILEdBQUcsdUJBQUgsR0FBRyxDQUFFLE9BQU8sbUNBQUksTUFBTSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7UUFDbEUsQ0FBQztRQUNELE1BQU0sRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLEdBQUcsb0JBQW9CLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDckQsTUFBTSxVQUFVLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQztRQUNoQyxNQUFNLElBQUksR0FBRyxDQUFDLE1BQUEsSUFBSSxDQUFDLFNBQVMsbUNBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3ZDLE1BQU0sRUFBRSxHQUFHLE1BQUEsSUFBSSxDQUFDLE9BQU8sbUNBQUksVUFBVSxDQUFDO1FBQ3RDLElBQUksSUFBSSxJQUFJLFVBQVUsRUFBRSxDQUFDO1lBQ3JCLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSwwQkFBMEIsTUFBQSxJQUFJLENBQUMsU0FBUyxtQ0FBSSxDQUFDLHVCQUF1QixVQUFVLFNBQVMsRUFBRSxDQUFDO1FBQzlILENBQUM7UUFDRCxJQUFJLElBQUksQ0FBQyxTQUFTLEtBQUssU0FBUyxJQUFJLElBQUksQ0FBQyxPQUFPLEtBQUssU0FBUyxJQUFJLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQzlGLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSwyQ0FBMkMsRUFBRSxDQUFDO1FBQ2xGLENBQUM7UUFDRCxNQUFNLE1BQU0sR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNyQyxNQUFNLE1BQU0sR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksRUFBRSxJQUFJLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDdkUsT0FBTztZQUNILE9BQU8sRUFBRSxJQUFJO1lBQ2IsT0FBTyxFQUFFLFFBQVEsTUFBTSxDQUFDLE1BQU0saUJBQWlCLENBQUMsQ0FBQyxVQUFVLEVBQUU7WUFDN0QsSUFBSSxFQUFFLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxVQUFVLEVBQUUsVUFBVSxFQUFFLFNBQVMsRUFBRSxJQUFJLEdBQUcsQ0FBQyxFQUFFLE9BQU8sRUFBRSxJQUFJLEdBQUcsTUFBTSxDQUFDLE1BQU0sRUFBRSxHQUFHLEVBQUUsR0FBRyxLQUFLLE1BQU0sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRTtTQUNuSixDQUFDO0lBQ04sQ0FBQztDQUNKLENBQUM7QUFFRixNQUFhLGVBQWU7SUFBNUI7UUFDWSxTQUFJLEdBQUcsSUFBQSwwQkFBVyxFQUFDO1lBQ3ZCLFVBQVU7WUFDVixXQUFXO1lBQ1gsV0FBVztZQUNYLFNBQVM7U0FDWixDQUFDLENBQUM7SUFTUCxDQUFDO0lBUEcsUUFBUTtRQUNKLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztJQUNoQyxDQUFDO0lBRUQsT0FBTyxDQUFDLFFBQWdCLEVBQUUsSUFBUztRQUMvQixPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQztJQUM3QyxDQUFDO0NBQ0o7QUFmRCwwQ0FlQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogZmlsZS1lZGl0b3ItdG9vbHMg4oCUIGhvc3Qtc2lkZSBmcyBvcGVyYXRpb25zIGZvciBjbGllbnRzIHdpdGhvdXRcbiAqIG5hdGl2ZSBmaWxlIGVkaXRpbmcuXG4gKlxuICogRm91ciB0b29scyAoU3BheWRvIGNvY29zLW1jcC1leHRlbnNpb24gcm91dGUsIGhhcmRlbmVkKTpcbiAqICAgLSBmaWxlX2VkaXRvcl9pbnNlcnRfdGV4dCAgIOKAlCBpbnNlcnQgYXQgMS1iYXNlZCBsaW5lXG4gKiAgIC0gZmlsZV9lZGl0b3JfZGVsZXRlX2xpbmVzICDigJQgZGVsZXRlIHJhbmdlLCAxLWJhc2VkIGluY2x1c2l2ZVxuICogICAtIGZpbGVfZWRpdG9yX3JlcGxhY2VfdGV4dCAg4oCUIGZpbmQvcmVwbGFjZSwgcGxhaW4gb3IgcmVnZXhcbiAqICAgLSBmaWxlX2VkaXRvcl9xdWVyeV90ZXh0ICAgIOKAlCByZWFkIHJhbmdlLCAxLWJhc2VkXG4gKlxuICogV2h5IHdlIHNoaXAgdGhlc2UgZXZlbiB0aG91Z2ggQ2xhdWRlIENvZGUgYWxyZWFkeSBoYXMgRWRpdC9Xcml0ZTpcbiAqICAgTXVsdGktY2xpZW50IGJyZWFkdGguIENsYXVkZSBEZXNrdG9wIC8gQ2xpbmUgLyBDb250aW51ZSBoYXZlIG5vXG4gKiAgIG5hdGl2ZSBmaWxlIG9wczsgQUkgb24gdGhvc2UgY2xpZW50cyBtdXN0IGdvIHRocm91Z2ggdGhlIE1DUFxuICogICBzZXJ2ZXIuIFRvb2wgZGVzY3JpcHRpb25zIGNhcnJ5IFtjbGF1ZGUtY29kZS1yZWR1bmRhbnRdIHNvIHRoZVxuICogICByYW5rZXIgb24gQ2xhdWRlIENvZGUgcHJlZmVycyB0aGUgSURFIHRvb2wuXG4gKlxuICogU3BheWRvJ3MgdXBzdHJlYW0gaGFkIHR3byBnYXBzIHdlIGNsb3NlOlxuICogICAxLiBwYXRoLXNhZmV0eSBndWFyZCB2aWEgcGxhaW4gYHBhdGgucmVzb2x2ZSArIHN0YXJ0c1dpdGhgIGlzXG4gKiAgICAgIHN5bWxpbmstdW5zYWZlIOKAlCBhIHN5bWxpbmsgaW5zaWRlIHRoZSBwcm9qZWN0IHBvaW50aW5nXG4gKiAgICAgIG91dHNpZGUgc3RpbGwgcGFzc2VzLiBVc2UgYGZzLnJlYWxwYXRoU3luYy5uYXRpdmVgIG9uIGJvdGhcbiAqICAgICAgc2lkZXMgKHNhbWUgZml4IHYyLjQuOSBhcHBsaWVkIHRvIGRlYnVnX2dldF9zY3JpcHRfZGlhZ25vc3RpY19jb250ZXh0KS5cbiAqICAgMi4gYXNzZXQtZGIgcmVmcmVzaCBob29rIG1pc3Npbmc6IGNvY29zIGVkaXRvciBkb2Vzbid0IHJlaW1wb3J0XG4gKiAgICAgIGEgLnRzLy5qcyB1bnRpbCBhc3NldC1kYiBzZWVzIGEgcmVmcmVzaCBldmVudC4gQ2FsbFxuICogICAgICBgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncmVmcmVzaCcsIGFic1BhdGgpYCBhZnRlclxuICogICAgICBldmVyeSB3cml0ZSBzbyB0aGUgZWRpdG9yIHBpY2tzIHVwIHRoZSBjaGFuZ2UuXG4gKi9cblxuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB0eXBlIHsgVG9vbFJlc3BvbnNlIH0gZnJvbSAnLi4vdHlwZXMnO1xuaW1wb3J0IHsgeiB9IGZyb20gJy4uL2xpYi9zY2hlbWEnO1xuaW1wb3J0IHsgZGVmaW5lVG9vbHMsIFRvb2xEZWYgfSBmcm9tICcuLi9saWIvZGVmaW5lLXRvb2xzJztcbmltcG9ydCB7IGxvZ2dlciB9IGZyb20gJy4uL2xpYi9sb2cnO1xuXG5jb25zdCBSRURVTkRBTlRfVEFHID0gJ1tjbGF1ZGUtY29kZS1yZWR1bmRhbnRdIFVzZSBFZGl0L1dyaXRlIHRvb2wgZnJvbSB5b3VyIElERSBpZiBhdmFpbGFibGUuICc7XG5cbi8vIFJlYWQgY2FwIHRvIGtlZXAgdG9vbCByZXN1bHQgcmVhc29uYWJsZTsgbWF0Y2hlcyB0aGUgY2FwIHVzZWQgYnlcbi8vIGRlYnVnX2dldF9zY3JpcHRfZGlhZ25vc3RpY19jb250ZXh0LlxuY29uc3QgRklMRV9SRUFEX0JZVEVfQ0FQID0gNSAqIDEwMjQgKiAxMDI0O1xuXG4vLyB2Mi41LjEgcm91bmQtMSByZXZpZXcgZml4IChjb2RleCArIGNsYXVkZSArIGdlbWluaSDwn5+hKTogcmVnZXggbW9kZSBydW5zXG4vLyBvbiBmaWxlcyB1cCB0byBGSUxFX1JFQURfQllURV9DQVAgd2l0aG91dCBhIHJ1bnRpbWUgY2FwLCBzbyBhXG4vLyBjYXRhc3Ryb3BoaWMtYmFja3RyYWNraW5nIHBhdHRlcm4gd291bGQgaGFuZyB0aGUgZWRpdG9yIHByb2Nlc3MuIENhcFxuLy8gdGhlIHJlZ2V4LW1vZGUgYm9keSB0byBhIHNtYWxsZXIgd2luZG93LiBQbGFpbi1zdHJpbmcgbW9kZSBpcyBib3VuZGVkXG4vLyBieSBWOCBzdHJpbmcgb3BzIHNvIGl0IGRvZXNuJ3QgbmVlZCB0aGlzIGd1YXJkLlxuY29uc3QgUkVHRVhfTU9ERV9CWVRFX0NBUCA9IDEgKiAxMDI0ICogMTAyNDtcblxuLy8gdjIuNS4xIHJvdW5kLTEgcmV2aWV3IGZpeCAoY29kZXgg8J+foSk6IGZzLnJlYWxwYXRoU3luYy5uYXRpdmUgaXMgZG9jdW1lbnRlZFxuLy8gc2luY2UgTm9kZSA5LjIgYnV0IGEgZmV3IGNvY29zLWJ1bmRsZWQgTm9kZSBidWlsZHMgaGlzdG9yaWNhbGx5IGRpZG4ndFxuLy8gZXhwb3NlIGl0LiBSZXNvbHZlIG9uY2UgYXQgbW9kdWxlIGxvYWQgd2l0aCBhIHNhZmUgZmFsbGJhY2suXG5jb25zdCByZWFscGF0aFN5bmM6IHR5cGVvZiBmcy5yZWFscGF0aFN5bmMgPSAoZnMucmVhbHBhdGhTeW5jIGFzIGFueSkubmF0aXZlID8/IGZzLnJlYWxwYXRoU3luYztcblxuLy8gdjIuNS4xIHJvdW5kLTEgcmV2aWV3IGZpeCAoY2xhdWRlIPCfn6EpOiBwcmVzZXJ2ZSBkb21pbmFudCBsaW5lIGVuZGluZyBzb1xuLy8gZWRpdHMgZG9uJ3Qgc2lsZW50bHkgcmV3cml0ZSBhIFdpbmRvd3MgcHJvamVjdCdzIENSTEYgbGluZXMgYXMgTEYuIFdlXG4vLyBkZXRlY3QgYnkgY291bnRpbmcgXFxyXFxuIHZzIGxvbmUgXFxuIGluIHRoZSBmaWxlLCB0aGVuIHJlLWpvaW4gd2l0aCB0aGVcbi8vIGRvbWluYW50IHN0eWxlLiBOZXcgbGluZXMgYWRkZWQgYnkgdGhlIHVzZXIgKHZpYSBpbnNlcnRfdGV4dCBvclxuLy8gcmVwbGFjZV90ZXh0KSBpbmhlcml0IHdoYXRldmVyIHRoZSBmaWxlIGFscmVhZHkgdXNlcy5cbmZ1bmN0aW9uIGRldGVjdEVvbChjb250ZW50OiBzdHJpbmcpOiAnXFxyXFxuJyB8ICdcXG4nIHtcbiAgICAvLyBDb3VudCBsb25lIFxcbiB2cyBcXHJcXG4gaW4gdGhlIGZpcnN0IDRLQiDigJQgc2FtcGxlIGlzIGVub3VnaDsgbWl4ZWRcbiAgICAvLyBmaWxlcyBwaWNrIHdoaWNoZXZlciBhcHBlYXJzIG1vcmUgaW4gdGhlIGhlYWQuIEVkZ2UgY2FzZSAoZmlsZSBpc1xuICAgIC8vIGFsbC1DUkxGIGV4Y2VwdCBhIHNpbmdsZSBMRiBpbiB0aGUgbWlkZGxlKTogd2Ugc3RpbGwgcGljayBDUkxGLlxuICAgIGNvbnN0IHNhbXBsZSA9IGNvbnRlbnQubGVuZ3RoID4gNDA5NiA/IGNvbnRlbnQuc2xpY2UoMCwgNDA5NikgOiBjb250ZW50O1xuICAgIGxldCBjcmxmID0gMDtcbiAgICBsZXQgbGYgPSAwO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc2FtcGxlLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmIChzYW1wbGUuY2hhckNvZGVBdChpKSA9PT0gMHgwYSAvKiBcXG4gKi8pIHtcbiAgICAgICAgICAgIGlmIChpID4gMCAmJiBzYW1wbGUuY2hhckNvZGVBdChpIC0gMSkgPT09IDB4MGQgLyogXFxyICovKSBjcmxmKys7XG4gICAgICAgICAgICBlbHNlIGxmKys7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGNybGYgPiBsZiA/ICdcXHJcXG4nIDogJ1xcbic7XG59XG5cbmZ1bmN0aW9uIHNwbGl0TGluZXNOb3JtYWxpemVkKGNvbnRlbnQ6IHN0cmluZyk6IHsgbGluZXM6IHN0cmluZ1tdOyBlb2w6ICdcXHJcXG4nIHwgJ1xcbicgfSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgbGluZXM6IGNvbnRlbnQuc3BsaXQoL1xccj9cXG4vKSxcbiAgICAgICAgZW9sOiBkZXRlY3RFb2woY29udGVudCksXG4gICAgfTtcbn1cblxuaW50ZXJmYWNlIFJlc29sdmVkUGF0aCB7IGFiczogc3RyaW5nOyByZWxQcm9qZWN0OiBzdHJpbmc7IH1cblxuZnVuY3Rpb24gZ2V0UHJvamVjdFBhdGgoKTogc3RyaW5nIHwgbnVsbCB7XG4gICAgdHJ5IHtcbiAgICAgICAgcmV0dXJuIEVkaXRvcj8uUHJvamVjdD8ucGF0aCA/PyBudWxsO1xuICAgIH0gY2F0Y2gge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG59XG5cbi8qKlxuICogUmVzb2x2ZSBhIHVzZXItc3VwcGxpZWQgcGF0aCB0byBhbiBhYnNvbHV0ZSwgc3ltbGluay1zYWZlIHBhdGhcbiAqIGluc2lkZSB0aGUgcHJvamVjdC4gUmV0dXJucyB0aGUgcmVzb2x2ZWQgYWJzb2x1dGUgcGF0aCArIHRoZVxuICogcHJvamVjdC1yZWxhdGl2ZSBmb3JtIChmb3IgZnJpZW5kbHkgbWVzc2FnZXMpLiBUaHJvd3Mtc3R5bGVcbiAqIHsgZXJyb3IgfSBlbnZlbG9wZSBmb3IgY2FsbGVycyB0byBzaG9ydC1jaXJjdWl0IG9uLlxuICpcbiAqIFBhdGggc2FmZXR5OlxuICogICAxLiBJZiBgdGFyZ2V0YCBpcyByZWxhdGl2ZSwgam9pbmVkIHRvIHByb2plY3RQYXRoOyBpZiBhYnNvbHV0ZSxcbiAqICAgICAgdXNlZCBhcy1pcy5cbiAqICAgMi4gQm90aCB0YXJnZXQgYW5kIHByb2plY3Qgcm9vdCBnbyB0aHJvdWdoIGBmcy5yZWFscGF0aFN5bmMubmF0aXZlYFxuICogICAgICBzbyBzeW1saW5rcyBhcmUgZm9sbG93ZWQgYmVmb3JlIHRoZSBwcmVmaXggY2hlY2suXG4gKiAgIDMuIENhc2UtaW5zZW5zaXRpdmUgY29tcGFyaXNvbiBvbiBXaW5kb3dzOyBjYXNlLXNlbnNpdGl2ZSBvbiBQT1NJWC5cbiAqICAgNC4gU2VwIGd1YXJkIGFnYWluc3QgYC9wcm9qLWZvb2AgdnMgYC9wcm9qYCBwcmVmaXggY29uZnVzaW9uLlxuICpcbiAqIENhbGxlciBNVVNUIGhhbmRsZSB0aGUgbWlzc2luZy10YXJnZXQgY2FzZSBmb3Igd3JpdGUgb3BlcmF0aW9uc1xuICogKGluc2VydC9yZXBsYWNlL2RlbGV0ZSkg4oCUIHdlIHN0aWxsIHdhbnQgdG8gd3JpdGUgdG8gYSBub24tZXhpc3RlbnRcbiAqIGZpbGUgdmlhIHRoZSByZWxhdGl2ZS1wYXRoIGZhbGxiYWNrIHdoZW4gdGhlIHBhcmVudCBkaXJlY3RvcnlcbiAqIGV4aXN0cy4gU2VlIGByZXNvbHZlUGF0aEZvcldyaXRlYCBiZWxvdy5cbiAqL1xuZnVuY3Rpb24gcmVzb2x2ZVBhdGhGb3JSZWFkKHRhcmdldDogc3RyaW5nKTogUmVzb2x2ZWRQYXRoIHwgeyBlcnJvcjogc3RyaW5nIH0ge1xuICAgIGNvbnN0IHByb2plY3RQYXRoID0gZ2V0UHJvamVjdFBhdGgoKTtcbiAgICBpZiAoIXByb2plY3RQYXRoKSB7XG4gICAgICAgIHJldHVybiB7IGVycm9yOiAnZmlsZS1lZGl0b3I6IGVkaXRvciBjb250ZXh0IHVuYXZhaWxhYmxlIChubyBFZGl0b3IuUHJvamVjdC5wYXRoKScgfTtcbiAgICB9XG4gICAgY29uc3QgYWJzUmF3ID0gcGF0aC5pc0Fic29sdXRlKHRhcmdldCkgPyB0YXJnZXQgOiBwYXRoLmpvaW4ocHJvamVjdFBhdGgsIHRhcmdldCk7XG4gICAgbGV0IHJlc29sdmVkQWJzOiBzdHJpbmc7XG4gICAgdHJ5IHtcbiAgICAgICAgcmVzb2x2ZWRBYnMgPSByZWFscGF0aFN5bmMoYWJzUmF3KTtcbiAgICB9IGNhdGNoIHtcbiAgICAgICAgcmV0dXJuIHsgZXJyb3I6IGBmaWxlLWVkaXRvcjogZmlsZSBub3QgZm91bmQgb3IgdW5yZWFkYWJsZTogJHthYnNSYXd9YCB9O1xuICAgIH1cbiAgICBsZXQgcHJvamVjdEFiczogc3RyaW5nO1xuICAgIHRyeSB7XG4gICAgICAgIHByb2plY3RBYnMgPSByZWFscGF0aFN5bmMocHJvamVjdFBhdGgpO1xuICAgIH0gY2F0Y2gge1xuICAgICAgICBwcm9qZWN0QWJzID0gcGF0aC5yZXNvbHZlKHByb2plY3RQYXRoKTtcbiAgICB9XG4gICAgY29uc3QgY21wID0gcHJvY2Vzcy5wbGF0Zm9ybSA9PT0gJ3dpbjMyJ1xuICAgICAgICA/IHsgcmVzb2x2ZWQ6IHJlc29sdmVkQWJzLnRvTG93ZXJDYXNlKCksIHByb2plY3Q6IHByb2plY3RBYnMudG9Mb3dlckNhc2UoKSB9XG4gICAgICAgIDogeyByZXNvbHZlZDogcmVzb2x2ZWRBYnMsIHByb2plY3Q6IHByb2plY3RBYnMgfTtcbiAgICBpZiAoIWNtcC5yZXNvbHZlZC5zdGFydHNXaXRoKGNtcC5wcm9qZWN0ICsgcGF0aC5zZXApICYmIGNtcC5yZXNvbHZlZCAhPT0gY21wLnByb2plY3QpIHtcbiAgICAgICAgcmV0dXJuIHsgZXJyb3I6IGBmaWxlLWVkaXRvcjogcGF0aCAke3Jlc29sdmVkQWJzfSByZXNvbHZlcyBvdXRzaWRlIHRoZSBwcm9qZWN0IHJvb3QgKHN5bWxpbmstYXdhcmUgY2hlY2spYCB9O1xuICAgIH1cbiAgICByZXR1cm4geyBhYnM6IHJlc29sdmVkQWJzLCByZWxQcm9qZWN0OiBwYXRoLnJlbGF0aXZlKHByb2plY3RBYnMsIHJlc29sdmVkQWJzKSB9O1xufVxuXG5jb25zdCBBU1NFVF9SRUZSRVNIX0VYVFMgPSBuZXcgU2V0KFsnLnRzJywgJy50c3gnLCAnLmpzJywgJy5qc3gnLCAnLmpzb24nLCAnLmZpcmUnLCAnLnNjZW5lJywgJy5wcmVmYWInLCAnLmFuaW0nLCAnLm1hdGVyaWFsJywgJy5lZmZlY3QnLCAnLmZudCddKTtcblxuLyoqXG4gKiBCZXN0LWVmZm9ydDogdGVsbCBjb2NvcyBhc3NldC1kYiB0aGF0IHRoZSBmaWxlIGNoYW5nZWQgc28gdGhlIGVkaXRvclxuICogcGlja3MgaXQgdXAgd2l0aG91dCBhIG1hbnVhbCByZWZyZXNoLiBGYWlsdXJlIGlzIG5vbi1mYXRhbCBiZWNhdXNlXG4gKiB0aGUgZmlsZSBpcyBhbHJlYWR5IHdyaXR0ZW47IHRoZSB1c2VyIGNhbiBoaXQgcmVmcmVzaCBtYW51YWxseS5cbiAqXG4gKiBPbmx5IGZpcmVzIGZvciBmaWxlIGV4dGVuc2lvbnMgY29jb3MgY2FyZXMgYWJvdXQgKFRTIHNvdXJjZSwgSlNPTlxuICogY29uZmlncywgc2NlbmUvcHJlZmFiL2FuaW0gYXNzZXRzLCBldGMuKSBzbyBwbGFpbiAudHh0IGVkaXRzIGRvbid0XG4gKiBzcGFtIHRoZSBhc3NldC1kYi5cbiAqL1xuYXN5bmMgZnVuY3Rpb24gcmVmcmVzaEFzc2V0RGIoYWJzUGF0aDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgZXh0ID0gcGF0aC5leHRuYW1lKGFic1BhdGgpLnRvTG93ZXJDYXNlKCk7XG4gICAgaWYgKCFBU1NFVF9SRUZSRVNIX0VYVFMuaGFzKGV4dCkpIHJldHVybjtcbiAgICB0cnkge1xuICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdyZWZyZXNoLWFzc2V0JywgYWJzUGF0aCk7XG4gICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgbG9nZ2VyLmRlYnVnKCdbRmlsZUVkaXRvcl0gYXNzZXQtZGIgcmVmcmVzaC1hc3NldCBmYWlsZWQgKG5vbi1mYXRhbCk6JywgZXJyPy5tZXNzYWdlID8/IGVycik7XG4gICAgfVxufVxuXG5jb25zdCBpbnNlcnRUZXh0OiBUb29sRGVmID0ge1xuICAgIG5hbWU6ICdpbnNlcnRfdGV4dCcsXG4gICAgZGVzY3JpcHRpb246IFJFRFVOREFOVF9UQUcgKyAnSW5zZXJ0IGEgbmV3IGxpbmUgYXQgdGhlIGdpdmVuIDEtYmFzZWQgbGluZSBudW1iZXIuIElmIGxpbmUgZXhjZWVkcyB0b3RhbCwgdGV4dCBpcyBhcHBlbmRlZCBhdCBlbmQgb2YgZmlsZS4gVHJpZ2dlcnMgY29jb3MgYXNzZXQtZGIgcmVmcmVzaCBvbiBjb2Nvcy1yZWNvZ25pc2VkIGV4dGVuc2lvbnMgKC50cy8uanNvbi8uc2NlbmUvLnByZWZhYi9ldGMuKSBzbyB0aGUgZWRpdG9yIHJlaW1wb3J0cy4nLFxuICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgIGZpbGVQYXRoOiB6LnN0cmluZygpLmRlc2NyaWJlKCdQYXRoIHRvIHRoZSBmaWxlIChhYnNvbHV0ZSBvciBwcm9qZWN0LXJlbGF0aXZlKS4nKSxcbiAgICAgICAgbGluZTogei5udW1iZXIoKS5pbnQoKS5taW4oMSkuZGVzY3JpYmUoJzEtYmFzZWQgbGluZSBudW1iZXIgdG8gaW5zZXJ0IGF0OyBleGlzdGluZyBsaW5lcyBzaGlmdCBkb3duLicpLFxuICAgICAgICB0ZXh0OiB6LnN0cmluZygpLmRlc2NyaWJlKCdUZXh0IHRvIGluc2VydCBhcyBhIG5ldyBsaW5lIChubyB0cmFpbGluZyBuZXdsaW5lIGV4cGVjdGVkKS4nKSxcbiAgICB9KSxcbiAgICBoYW5kbGVyOiBhc3luYyAoYXJncyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiA9PiB7XG4gICAgICAgIGNvbnN0IHIgPSByZXNvbHZlUGF0aEZvclJlYWQoYXJncy5maWxlUGF0aCk7XG4gICAgICAgIGlmICgnZXJyb3InIGluIHIpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogci5lcnJvciB9O1xuICAgICAgICBsZXQgY29udGVudDogc3RyaW5nO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3Qgc3RhdCA9IGZzLnN0YXRTeW5jKHIuYWJzKTtcbiAgICAgICAgICAgIGlmIChzdGF0LnNpemUgPiBGSUxFX1JFQURfQllURV9DQVApIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBmaWxlLWVkaXRvcjogZmlsZSB0b28gbGFyZ2UgKCR7c3RhdC5zaXplfSBieXRlcyk7IHJlZnVzaW5nIHRvIHJlYWQuYCB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29udGVudCA9IGZzLnJlYWRGaWxlU3luYyhyLmFicywgJ3V0Zi04Jyk7XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKSB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHsgbGluZXMsIGVvbCB9ID0gc3BsaXRMaW5lc05vcm1hbGl6ZWQoY29udGVudCk7XG4gICAgICAgIGNvbnN0IGluc2VydEluZGV4ID0gYXJncy5saW5lIC0gMTtcbiAgICAgICAgaWYgKGluc2VydEluZGV4ID49IGxpbmVzLmxlbmd0aCkge1xuICAgICAgICAgICAgbGluZXMucHVzaChhcmdzLnRleHQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbGluZXMuc3BsaWNlKGluc2VydEluZGV4LCAwLCBhcmdzLnRleHQpO1xuICAgICAgICB9XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBmcy53cml0ZUZpbGVTeW5jKHIuYWJzLCBsaW5lcy5qb2luKGVvbCksICd1dGYtOCcpO1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycikgfTtcbiAgICAgICAgfVxuICAgICAgICBhd2FpdCByZWZyZXNoQXNzZXREYihyLmFicyk7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgbWVzc2FnZTogYEluc2VydGVkIHRleHQgYXQgbGluZSAke01hdGgubWluKGFyZ3MubGluZSwgbGluZXMubGVuZ3RoKX0gb2YgJHtyLnJlbFByb2plY3R9YCxcbiAgICAgICAgICAgIGRhdGE6IHsgZmlsZTogci5yZWxQcm9qZWN0LCB0b3RhbExpbmVzOiBsaW5lcy5sZW5ndGgsIGVvbDogZW9sID09PSAnXFxyXFxuJyA/ICdDUkxGJyA6ICdMRicgfSxcbiAgICAgICAgfTtcbiAgICB9LFxufTtcblxuY29uc3QgZGVsZXRlTGluZXM6IFRvb2xEZWYgPSB7XG4gICAgbmFtZTogJ2RlbGV0ZV9saW5lcycsXG4gICAgZGVzY3JpcHRpb246IFJFRFVOREFOVF9UQUcgKyAnRGVsZXRlIGEgcmFuZ2Ugb2YgbGluZXMgKDEtYmFzZWQsIGluY2x1c2l2ZSkuIFRyaWdnZXJzIGNvY29zIGFzc2V0LWRiIHJlZnJlc2guJyxcbiAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICBmaWxlUGF0aDogei5zdHJpbmcoKS5kZXNjcmliZSgnUGF0aCB0byB0aGUgZmlsZSAoYWJzb2x1dGUgb3IgcHJvamVjdC1yZWxhdGl2ZSkuJyksXG4gICAgICAgIHN0YXJ0TGluZTogei5udW1iZXIoKS5pbnQoKS5taW4oMSkuZGVzY3JpYmUoJ0ZpcnN0IGxpbmUgdG8gZGVsZXRlICgxLWJhc2VkLCBpbmNsdXNpdmUpLicpLFxuICAgICAgICBlbmRMaW5lOiB6Lm51bWJlcigpLmludCgpLm1pbigxKS5kZXNjcmliZSgnTGFzdCBsaW5lIHRvIGRlbGV0ZSAoMS1iYXNlZCwgaW5jbHVzaXZlKS4gTXVzdCBiZSA+PSBzdGFydExpbmUuJyksXG4gICAgfSksXG4gICAgaGFuZGxlcjogYXN5bmMgKGFyZ3MpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4gPT4ge1xuICAgICAgICBpZiAoYXJncy5zdGFydExpbmUgPiBhcmdzLmVuZExpbmUpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ2ZpbGUtZWRpdG9yOiBzdGFydExpbmUgbXVzdCBiZSA8PSBlbmRMaW5lJyB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHIgPSByZXNvbHZlUGF0aEZvclJlYWQoYXJncy5maWxlUGF0aCk7XG4gICAgICAgIGlmICgnZXJyb3InIGluIHIpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogci5lcnJvciB9O1xuICAgICAgICBsZXQgY29udGVudDogc3RyaW5nO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3Qgc3RhdCA9IGZzLnN0YXRTeW5jKHIuYWJzKTtcbiAgICAgICAgICAgIGlmIChzdGF0LnNpemUgPiBGSUxFX1JFQURfQllURV9DQVApIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBmaWxlLWVkaXRvcjogZmlsZSB0b28gbGFyZ2UgKCR7c3RhdC5zaXplfSBieXRlcyk7IHJlZnVzaW5nIHRvIHJlYWQuYCB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29udGVudCA9IGZzLnJlYWRGaWxlU3luYyhyLmFicywgJ3V0Zi04Jyk7XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKSB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHsgbGluZXMsIGVvbCB9ID0gc3BsaXRMaW5lc05vcm1hbGl6ZWQoY29udGVudCk7XG4gICAgICAgIGNvbnN0IGRlbGV0ZVN0YXJ0ID0gYXJncy5zdGFydExpbmUgLSAxO1xuICAgICAgICBjb25zdCByZXF1ZXN0ZWRDb3VudCA9IGFyZ3MuZW5kTGluZSAtIGFyZ3Muc3RhcnRMaW5lICsgMTtcbiAgICAgICAgY29uc3QgZGVsZXRlZENvdW50ID0gTWF0aC5tYXgoMCwgTWF0aC5taW4ocmVxdWVzdGVkQ291bnQsIGxpbmVzLmxlbmd0aCAtIGRlbGV0ZVN0YXJ0KSk7XG4gICAgICAgIGlmIChkZWxldGVkQ291bnQgPT09IDApIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYGZpbGUtZWRpdG9yOiByYW5nZSAke2FyZ3Muc3RhcnRMaW5lfS0ke2FyZ3MuZW5kTGluZX0gaXMgcGFzdCBFT0YgKGZpbGUgaGFzICR7bGluZXMubGVuZ3RofSBsaW5lcylgIH07XG4gICAgICAgIH1cbiAgICAgICAgbGluZXMuc3BsaWNlKGRlbGV0ZVN0YXJ0LCBkZWxldGVkQ291bnQpO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgZnMud3JpdGVGaWxlU3luYyhyLmFicywgbGluZXMuam9pbihlb2wpLCAndXRmLTgnKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpIH07XG4gICAgICAgIH1cbiAgICAgICAgYXdhaXQgcmVmcmVzaEFzc2V0RGIoci5hYnMpO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgIG1lc3NhZ2U6IGBEZWxldGVkICR7ZGVsZXRlZENvdW50fSBsaW5lKHMpIGZyb20gbGluZSAke2FyZ3Muc3RhcnRMaW5lfSB0byAke2FyZ3Muc3RhcnRMaW5lICsgZGVsZXRlZENvdW50IC0gMX0gb2YgJHtyLnJlbFByb2plY3R9YCxcbiAgICAgICAgICAgIGRhdGE6IHsgZmlsZTogci5yZWxQcm9qZWN0LCBkZWxldGVkQ291bnQsIHRvdGFsTGluZXM6IGxpbmVzLmxlbmd0aCwgZW9sOiBlb2wgPT09ICdcXHJcXG4nID8gJ0NSTEYnIDogJ0xGJyB9LFxuICAgICAgICB9O1xuICAgIH0sXG59O1xuXG5jb25zdCByZXBsYWNlVGV4dDogVG9vbERlZiA9IHtcbiAgICBuYW1lOiAncmVwbGFjZV90ZXh0JyxcbiAgICBkZXNjcmlwdGlvbjogUkVEVU5EQU5UX1RBRyArICdGaW5kL3JlcGxhY2UgdGV4dCBpbiBhIGZpbGUuIFBsYWluIHN0cmluZyBieSBkZWZhdWx0OyBwYXNzIHVzZVJlZ2V4OnRydWUgdG8gaW50ZXJwcmV0IHNlYXJjaCBhcyBhIHJlZ2V4LiBSZXBsYWNlcyBmaXJzdCBvY2N1cnJlbmNlIG9ubHkgdW5sZXNzIHJlcGxhY2VBbGw6dHJ1ZS4gUmVnZXggYmFja3JlZmVyZW5jZXMgKCQxLCAkJiwgJGAsICRcXCcpIHdvcmsgd2hlbiB1c2VSZWdleDp0cnVlLiBUcmlnZ2VycyBjb2NvcyBhc3NldC1kYiByZWZyZXNoLicsXG4gICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgZmlsZVBhdGg6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1BhdGggdG8gdGhlIGZpbGUgKGFic29sdXRlIG9yIHByb2plY3QtcmVsYXRpdmUpLicpLFxuICAgICAgICAvLyB2Mi41LjEgcm91bmQtMSByZXZpZXcgZml4IChjb2RleCArIGNsYXVkZSDwn5+hKTogZW1wdHkgc2VhcmNoIHdvdWxkXG4gICAgICAgIC8vIGVpdGhlciBpbnNlcnQgYmV0d2VlbiBldmVyeSBjaGFyIChyZXBsYWNlQWxsKSBvciBpbnNlcnQgYXQgYnl0ZSAwXG4gICAgICAgIC8vIChmaXJzdC1vbmx5KSDigJQgYm90aCBzdXJwcmlzaW5nLiBSZWplY3QgZWFybHkuXG4gICAgICAgIHNlYXJjaDogei5zdHJpbmcoKS5taW4oMSwgJ3NlYXJjaCBtdXN0IGJlIG5vbi1lbXB0eScpLmRlc2NyaWJlKCdTZWFyY2ggdGV4dCBvciByZWdleCBwYXR0ZXJuIChkZXBlbmRzIG9uIHVzZVJlZ2V4KS4gTXVzdCBiZSBub24tZW1wdHkuJyksXG4gICAgICAgIHJlcGxhY2U6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1JlcGxhY2VtZW50IHRleHQuIFJlZ2V4IGJhY2tyZWZlcmVuY2VzICgkMSwgJCYsICRgLCAkXFwnKSBleHBhbmQgd2hlbiB1c2VSZWdleDp0cnVlLicpLFxuICAgICAgICB1c2VSZWdleDogei5ib29sZWFuKCkuZGVmYXVsdChmYWxzZSkuZGVzY3JpYmUoJ1RyZWF0IGBzZWFyY2hgIGFzIGEgSlMgUmVnRXhwIHNvdXJjZSBzdHJpbmcuIERlZmF1bHQgZmFsc2UuJyksXG4gICAgICAgIHJlcGxhY2VBbGw6IHouYm9vbGVhbigpLmRlZmF1bHQoZmFsc2UpLmRlc2NyaWJlKCdSZXBsYWNlIGV2ZXJ5IG9jY3VycmVuY2UuIERlZmF1bHQgZmFsc2UgKGZpcnN0IG9ubHkpLicpLFxuICAgIH0pLFxuICAgIGhhbmRsZXI6IGFzeW5jIChhcmdzKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+ID0+IHtcbiAgICAgICAgY29uc3QgciA9IHJlc29sdmVQYXRoRm9yUmVhZChhcmdzLmZpbGVQYXRoKTtcbiAgICAgICAgaWYgKCdlcnJvcicgaW4gcikgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiByLmVycm9yIH07XG4gICAgICAgIGxldCBjb250ZW50OiBzdHJpbmc7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBzdGF0ID0gZnMuc3RhdFN5bmMoci5hYnMpO1xuICAgICAgICAgICAgaWYgKHN0YXQuc2l6ZSA+IEZJTEVfUkVBRF9CWVRFX0NBUCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYGZpbGUtZWRpdG9yOiBmaWxlIHRvbyBsYXJnZSAoJHtzdGF0LnNpemV9IGJ5dGVzKTsgcmVmdXNpbmcgdG8gcmVhZC5gIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyB2Mi41LjEgcm91bmQtMSByZXZpZXcgZml4IChjb2RleCArIGNsYXVkZSArIGdlbWluaSDwn5+hKTogcmVnZXhcbiAgICAgICAgICAgIC8vIG1vZGUgcnVucyB1c2VyLWNvbnRyb2xsZWQgcGF0dGVybnMgYWdhaW5zdCB0aGUgZmlsZSBjb250ZW50XG4gICAgICAgICAgICAvLyB3aXRoIG5vIHRpbWVvdXQuIENhcCB0byBhIHNtYWxsZXIgd2luZG93IGluIHJlZ2V4IG1vZGUgc29cbiAgICAgICAgICAgIC8vIGNhdGFzdHJvcGhpYyBiYWNrdHJhY2tpbmcgb24gYSBsYXJnZSBmaWxlIGNhbid0IGhhbmcgdGhlXG4gICAgICAgICAgICAvLyBlZGl0b3IncyBob3N0IHByb2Nlc3MuIFBsYWluLXN0cmluZyBtb2RlIGtlZXBzIHRoZSBsYXJnZXJcbiAgICAgICAgICAgIC8vIEZJTEVfUkVBRF9CWVRFX0NBUCBiZWNhdXNlIFN0cmluZy5zcGxpdC9pbmRleE9mL3NsaWNlIGFyZVxuICAgICAgICAgICAgLy8gYm91bmRlZCBieSBWOCBpbnRlcm5hbHMgKG5vIHJlZ2V4IGVuZ2luZSBwYXRoKS5cbiAgICAgICAgICAgIGlmIChhcmdzLnVzZVJlZ2V4ICYmIHN0YXQuc2l6ZSA+IFJFR0VYX01PREVfQllURV9DQVApIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBmaWxlLWVkaXRvcjogcmVnZXggbW9kZSByZWZ1c2VzIGZpbGVzID4gJHtSRUdFWF9NT0RFX0JZVEVfQ0FQfSBieXRlcyAoJHtzdGF0LnNpemV9IGJ5dGVzIGhlcmUpLiBTd2l0Y2ggdG8gdXNlUmVnZXg6ZmFsc2Ugb3Igc3BsaXQgdGhlIGZpbGUgZmlyc3QuYCB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29udGVudCA9IGZzLnJlYWRGaWxlU3luYyhyLmFicywgJ3V0Zi04Jyk7XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKSB9O1xuICAgICAgICB9XG4gICAgICAgIGxldCByZXBsYWNlbWVudHMgPSAwO1xuICAgICAgICBsZXQgbmV3Q29udGVudDogc3RyaW5nO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgaWYgKGFyZ3MudXNlUmVnZXgpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBmbGFncyA9IGFyZ3MucmVwbGFjZUFsbCA/ICdnJyA6ICcnO1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlZ2V4ID0gbmV3IFJlZ0V4cChhcmdzLnNlYXJjaCwgZmxhZ3MpO1xuICAgICAgICAgICAgICAgIC8vIHYyLjUuMSByb3VuZC0xIHJldmlldyBmaXggKGNvZGV4IPCflLQpOiBwYXNzIHRoZSByZXBsYWNlbWVudFxuICAgICAgICAgICAgICAgIC8vIFNUUklORyBkaXJlY3RseSBzbyAkMS8kJi9ldGMuIGV4cGFuZC4gVGhlIHByZXZpb3VzXG4gICAgICAgICAgICAgICAgLy8gZnVuY3Rpb24tY2FsbGJhY2sgZm9ybSByZXR1cm5lZCBgYXJncy5yZXBsYWNlYCBsaXRlcmFsbHksXG4gICAgICAgICAgICAgICAgLy8gYnJlYWtpbmcgdGhlIGRvY3VtZW50ZWQgYmFja3JlZmVyZW5jZSBiZWhhdmlvdXIuIENvdW50XG4gICAgICAgICAgICAgICAgLy8gbWF0Y2hlcyBzZXBhcmF0ZWx5IHZpYSBhIHBhcmFsbGVsIG1hdGNoKCkgcGFzcyBzaW5jZSB3ZVxuICAgICAgICAgICAgICAgIC8vIG5vIGxvbmdlciBoYXZlIHRoZSBwZXItY2FsbCBjb3VudGVyLlxuICAgICAgICAgICAgICAgIGNvbnN0IG1hdGNoZXMgPSBjb250ZW50Lm1hdGNoKHJlZ2V4KTtcbiAgICAgICAgICAgICAgICByZXBsYWNlbWVudHMgPSBtYXRjaGVzID8gbWF0Y2hlcy5sZW5ndGggOiAwO1xuICAgICAgICAgICAgICAgIG5ld0NvbnRlbnQgPSBjb250ZW50LnJlcGxhY2UocmVnZXgsIGFyZ3MucmVwbGFjZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGFyZ3MucmVwbGFjZUFsbCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHBhcnRzID0gY29udGVudC5zcGxpdChhcmdzLnNlYXJjaCk7XG4gICAgICAgICAgICAgICAgcmVwbGFjZW1lbnRzID0gcGFydHMubGVuZ3RoIC0gMTtcbiAgICAgICAgICAgICAgICBuZXdDb250ZW50ID0gcGFydHMuam9pbihhcmdzLnJlcGxhY2UpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zdCBpZHggPSBjb250ZW50LmluZGV4T2YoYXJncy5zZWFyY2gpO1xuICAgICAgICAgICAgICAgIGlmIChpZHggPT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIG1lc3NhZ2U6ICdObyBvY2N1cnJlbmNlcyBmb3VuZDsgZmlsZSB1bmNoYW5nZWQuJywgZGF0YTogeyBmaWxlOiByLnJlbFByb2plY3QsIHJlcGxhY2VtZW50czogMCB9IH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJlcGxhY2VtZW50cyA9IDE7XG4gICAgICAgICAgICAgICAgbmV3Q29udGVudCA9IGNvbnRlbnQuc2xpY2UoMCwgaWR4KSArIGFyZ3MucmVwbGFjZSArIGNvbnRlbnQuc2xpY2UoaWR4ICsgYXJncy5zZWFyY2gubGVuZ3RoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYGZpbGUtZWRpdG9yOiByZXBsYWNlIGZhaWxlZDogJHtlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycil9YCB9O1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZXBsYWNlbWVudHMgPT09IDApIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIG1lc3NhZ2U6ICdObyBvY2N1cnJlbmNlcyBmb3VuZDsgZmlsZSB1bmNoYW5nZWQuJywgZGF0YTogeyBmaWxlOiByLnJlbFByb2plY3QsIHJlcGxhY2VtZW50czogMCB9IH07XG4gICAgICAgIH1cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGZzLndyaXRlRmlsZVN5bmMoci5hYnMsIG5ld0NvbnRlbnQsICd1dGYtOCcpO1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycikgfTtcbiAgICAgICAgfVxuICAgICAgICBhd2FpdCByZWZyZXNoQXNzZXREYihyLmFicyk7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgbWVzc2FnZTogYFJlcGxhY2VkICR7cmVwbGFjZW1lbnRzfSBvY2N1cnJlbmNlKHMpIGluICR7ci5yZWxQcm9qZWN0fWAsXG4gICAgICAgICAgICBkYXRhOiB7IGZpbGU6IHIucmVsUHJvamVjdCwgcmVwbGFjZW1lbnRzIH0sXG4gICAgICAgIH07XG4gICAgfSxcbn07XG5cbmNvbnN0IHF1ZXJ5VGV4dDogVG9vbERlZiA9IHtcbiAgICBuYW1lOiAncXVlcnlfdGV4dCcsXG4gICAgZGVzY3JpcHRpb246IFJFRFVOREFOVF9UQUcgKyAnUmVhZCBhIHJhbmdlIG9mIGxpbmVzICgxLWJhc2VkLCBpbmNsdXNpdmUpLiBSZXR1cm5zIGxpbmVzIHdpdGggbGluZSBudW1iZXJzOyB0b3RhbCBsaW5lIGNvdW50IG9mIGZpbGUgaW4gZGF0YS50b3RhbExpbmVzLiBSZWFkLW9ubHk7IG5vIGFzc2V0LWRiIHJlZnJlc2guJyxcbiAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICBmaWxlUGF0aDogei5zdHJpbmcoKS5kZXNjcmliZSgnUGF0aCB0byB0aGUgZmlsZSAoYWJzb2x1dGUgb3IgcHJvamVjdC1yZWxhdGl2ZSkuJyksXG4gICAgICAgIHN0YXJ0TGluZTogei5udW1iZXIoKS5pbnQoKS5taW4oMSkub3B0aW9uYWwoKS5kZXNjcmliZSgnRmlyc3QgbGluZSB0byByZWFkICgxLWJhc2VkKS4gRGVmYXVsdCAxLicpLFxuICAgICAgICBlbmRMaW5lOiB6Lm51bWJlcigpLmludCgpLm1pbigxKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdMYXN0IGxpbmUgdG8gcmVhZCAoMS1iYXNlZCwgaW5jbHVzaXZlKS4gRGVmYXVsdCBlbmQgb2YgZmlsZS4nKSxcbiAgICB9KSxcbiAgICBoYW5kbGVyOiBhc3luYyAoYXJncyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiA9PiB7XG4gICAgICAgIGNvbnN0IHIgPSByZXNvbHZlUGF0aEZvclJlYWQoYXJncy5maWxlUGF0aCk7XG4gICAgICAgIGlmICgnZXJyb3InIGluIHIpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogci5lcnJvciB9O1xuICAgICAgICBsZXQgY29udGVudDogc3RyaW5nO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3Qgc3RhdCA9IGZzLnN0YXRTeW5jKHIuYWJzKTtcbiAgICAgICAgICAgIGlmIChzdGF0LnNpemUgPiBGSUxFX1JFQURfQllURV9DQVApIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBmaWxlLWVkaXRvcjogZmlsZSB0b28gbGFyZ2UgKCR7c3RhdC5zaXplfSBieXRlcyk7IHJlZnVzaW5nIHRvIHJlYWQuYCB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29udGVudCA9IGZzLnJlYWRGaWxlU3luYyhyLmFicywgJ3V0Zi04Jyk7XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKSB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHsgbGluZXMsIGVvbCB9ID0gc3BsaXRMaW5lc05vcm1hbGl6ZWQoY29udGVudCk7XG4gICAgICAgIGNvbnN0IHRvdGFsTGluZXMgPSBsaW5lcy5sZW5ndGg7XG4gICAgICAgIGNvbnN0IGZyb20gPSAoYXJncy5zdGFydExpbmUgPz8gMSkgLSAxO1xuICAgICAgICBjb25zdCB0byA9IGFyZ3MuZW5kTGluZSA/PyB0b3RhbExpbmVzO1xuICAgICAgICBpZiAoZnJvbSA+PSB0b3RhbExpbmVzKSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBmaWxlLWVkaXRvcjogc3RhcnRMaW5lICR7YXJncy5zdGFydExpbmUgPz8gMX0gcGFzdCBFT0YgKGZpbGUgaGFzICR7dG90YWxMaW5lc30gbGluZXMpYCB9O1xuICAgICAgICB9XG4gICAgICAgIGlmIChhcmdzLnN0YXJ0TGluZSAhPT0gdW5kZWZpbmVkICYmIGFyZ3MuZW5kTGluZSAhPT0gdW5kZWZpbmVkICYmIGFyZ3Muc3RhcnRMaW5lID4gYXJncy5lbmRMaW5lKSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdmaWxlLWVkaXRvcjogc3RhcnRMaW5lIG11c3QgYmUgPD0gZW5kTGluZScgfTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBzbGljZWQgPSBsaW5lcy5zbGljZShmcm9tLCB0byk7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IHNsaWNlZC5tYXAoKHRleHQsIGkpID0+ICh7IGxpbmU6IGZyb20gKyBpICsgMSwgdGV4dCB9KSk7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgbWVzc2FnZTogYFJlYWQgJHtyZXN1bHQubGVuZ3RofSBsaW5lKHMpIGZyb20gJHtyLnJlbFByb2plY3R9YCxcbiAgICAgICAgICAgIGRhdGE6IHsgZmlsZTogci5yZWxQcm9qZWN0LCB0b3RhbExpbmVzLCBzdGFydExpbmU6IGZyb20gKyAxLCBlbmRMaW5lOiBmcm9tICsgcmVzdWx0Lmxlbmd0aCwgZW9sOiBlb2wgPT09ICdcXHJcXG4nID8gJ0NSTEYnIDogJ0xGJywgbGluZXM6IHJlc3VsdCB9LFxuICAgICAgICB9O1xuICAgIH0sXG59O1xuXG5leHBvcnQgY2xhc3MgRmlsZUVkaXRvclRvb2xzIHtcbiAgICBwcml2YXRlIGltcGwgPSBkZWZpbmVUb29scyhbXG4gICAgICAgIGluc2VydFRleHQsXG4gICAgICAgIGRlbGV0ZUxpbmVzLFxuICAgICAgICByZXBsYWNlVGV4dCxcbiAgICAgICAgcXVlcnlUZXh0LFxuICAgIF0pO1xuXG4gICAgZ2V0VG9vbHMoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmltcGwuZ2V0VG9vbHMoKTtcbiAgICB9XG5cbiAgICBleGVjdXRlKHRvb2xOYW1lOiBzdHJpbmcsIGFyZ3M6IGFueSkge1xuICAgICAgICByZXR1cm4gdGhpcy5pbXBsLmV4ZWN1dGUodG9vbE5hbWUsIGFyZ3MpO1xuICAgIH1cbn1cbiJdfQ==