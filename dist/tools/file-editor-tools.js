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
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileEditorTools = void 0;
const response_1 = require("../lib/response");
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
        const r = resolvePathForRead(args.filePath);
        if ('error' in r)
            return (0, response_1.fail)(r.error);
        const stat = fs.statSync(r.abs);
        if (stat.size > FILE_READ_BYTE_CAP) {
            return (0, response_1.fail)(`file-editor: file too large (${stat.size} bytes); refusing to read.`);
        }
        const content = fs.readFileSync(r.abs, 'utf-8');
        const { lines, eol } = splitLinesNormalized(content);
        const insertIndex = args.line - 1;
        if (insertIndex >= lines.length) {
            lines.push(args.text);
        }
        else {
            lines.splice(insertIndex, 0, args.text);
        }
        fs.writeFileSync(r.abs, lines.join(eol), 'utf-8');
        await refreshAssetDb(r.abs);
        return (0, response_1.ok)({ file: r.relProject, totalLines: lines.length, eol: eol === '\r\n' ? 'CRLF' : 'LF' }, `Inserted text at line ${Math.min(args.line, lines.length)} of ${r.relProject}`);
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
        if (args.startLine > args.endLine) {
            return (0, response_1.fail)('file-editor: startLine must be <= endLine');
        }
        const r = resolvePathForRead(args.filePath);
        if ('error' in r)
            return (0, response_1.fail)(r.error);
        const stat = fs.statSync(r.abs);
        if (stat.size > FILE_READ_BYTE_CAP) {
            return (0, response_1.fail)(`file-editor: file too large (${stat.size} bytes); refusing to read.`);
        }
        const content = fs.readFileSync(r.abs, 'utf-8');
        const { lines, eol } = splitLinesNormalized(content);
        const deleteStart = args.startLine - 1;
        const requestedCount = args.endLine - args.startLine + 1;
        const deletedCount = Math.max(0, Math.min(requestedCount, lines.length - deleteStart));
        if (deletedCount === 0) {
            return (0, response_1.fail)(`file-editor: range ${args.startLine}-${args.endLine} is past EOF (file has ${lines.length} lines)`);
        }
        lines.splice(deleteStart, deletedCount);
        fs.writeFileSync(r.abs, lines.join(eol), 'utf-8');
        await refreshAssetDb(r.abs);
        return (0, response_1.ok)({ file: r.relProject, deletedCount, totalLines: lines.length, eol: eol === '\r\n' ? 'CRLF' : 'LF' }, `Deleted ${deletedCount} line(s) from line ${args.startLine} to ${args.startLine + deletedCount - 1} of ${r.relProject}`);
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
        var _a;
        const r = resolvePathForRead(args.filePath);
        if ('error' in r)
            return (0, response_1.fail)(r.error);
        const stat = fs.statSync(r.abs);
        if (stat.size > FILE_READ_BYTE_CAP) {
            return (0, response_1.fail)(`file-editor: file too large (${stat.size} bytes); refusing to read.`);
        }
        // v2.5.1 round-1 review fix (codex + claude + gemini 🟡): regex
        // mode runs user-controlled patterns against the file content
        // with no timeout. Cap to a smaller window in regex mode so
        // catastrophic backtracking on a large file can't hang the
        // editor's host process. Plain-string mode keeps the larger
        // FILE_READ_BYTE_CAP because String.split/indexOf/slice are
        // bounded by V8 internals (no regex engine path).
        if (args.useRegex && stat.size > REGEX_MODE_BYTE_CAP) {
            return (0, response_1.fail)(`file-editor: regex mode refuses files > ${REGEX_MODE_BYTE_CAP} bytes (${stat.size} bytes here). Switch to useRegex:false or split the file first.`);
        }
        const content = fs.readFileSync(r.abs, 'utf-8');
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
                    return (0, response_1.ok)({ file: r.relProject, replacements: 0 }, 'No occurrences found; file unchanged.');
                }
                replacements = 1;
                newContent = content.slice(0, idx) + args.replace + content.slice(idx + args.search.length);
            }
        }
        catch (err) {
            return (0, response_1.fail)(`file-editor: replace failed: ${(_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : String(err)}`);
        }
        if (replacements === 0) {
            return (0, response_1.ok)({ file: r.relProject, replacements: 0 }, 'No occurrences found; file unchanged.');
        }
        fs.writeFileSync(r.abs, newContent, 'utf-8');
        await refreshAssetDb(r.abs);
        return (0, response_1.ok)({ file: r.relProject, replacements }, `Replaced ${replacements} occurrence(s) in ${r.relProject}`);
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
        var _a, _b, _c;
        const r = resolvePathForRead(args.filePath);
        if ('error' in r)
            return (0, response_1.fail)(r.error);
        const stat = fs.statSync(r.abs);
        if (stat.size > FILE_READ_BYTE_CAP) {
            return (0, response_1.fail)(`file-editor: file too large (${stat.size} bytes); refusing to read.`);
        }
        const content = fs.readFileSync(r.abs, 'utf-8');
        const { lines, eol } = splitLinesNormalized(content);
        const totalLines = lines.length;
        const from = ((_a = args.startLine) !== null && _a !== void 0 ? _a : 1) - 1;
        const to = (_b = args.endLine) !== null && _b !== void 0 ? _b : totalLines;
        if (from >= totalLines) {
            return (0, response_1.fail)(`file-editor: startLine ${(_c = args.startLine) !== null && _c !== void 0 ? _c : 1} past EOF (file has ${totalLines} lines)`);
        }
        if (args.startLine !== undefined && args.endLine !== undefined && args.startLine > args.endLine) {
            return (0, response_1.fail)('file-editor: startLine must be <= endLine');
        }
        const sliced = lines.slice(from, to);
        const result = sliced.map((text, i) => ({ line: from + i + 1, text }));
        return (0, response_1.ok)({ file: r.relProject, totalLines, startLine: from + 1, endLine: from + result.length, eol: eol === '\r\n' ? 'CRLF' : 'LF', lines: result }, `Read ${result.length} line(s) from ${r.relProject}`);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmlsZS1lZGl0b3ItdG9vbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvdG9vbHMvZmlsZS1lZGl0b3ItdG9vbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLDhDQUEyQztBQUMzQzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQXlCRztBQUVILHVDQUF5QjtBQUN6QiwyQ0FBNkI7QUFFN0IsMENBQWtDO0FBQ2xDLHNEQUEyRDtBQUMzRCxvQ0FBb0M7QUFFcEMsTUFBTSxhQUFhLEdBQUcsMEVBQTBFLENBQUM7QUFFakcsbUVBQW1FO0FBQ25FLHVDQUF1QztBQUN2QyxNQUFNLGtCQUFrQixHQUFHLENBQUMsR0FBRyxJQUFJLEdBQUcsSUFBSSxDQUFDO0FBRTNDLDBFQUEwRTtBQUMxRSxnRUFBZ0U7QUFDaEUsdUVBQXVFO0FBQ3ZFLHdFQUF3RTtBQUN4RSxrREFBa0Q7QUFDbEQsTUFBTSxtQkFBbUIsR0FBRyxDQUFDLEdBQUcsSUFBSSxHQUFHLElBQUksQ0FBQztBQUU1Qyw2RUFBNkU7QUFDN0UseUVBQXlFO0FBQ3pFLCtEQUErRDtBQUMvRCxNQUFNLFlBQVksR0FBMkIsTUFBQyxFQUFFLENBQUMsWUFBb0IsQ0FBQyxNQUFNLG1DQUFJLEVBQUUsQ0FBQyxZQUFZLENBQUM7QUFFaEcsMEVBQTBFO0FBQzFFLHdFQUF3RTtBQUN4RSx3RUFBd0U7QUFDeEUsa0VBQWtFO0FBQ2xFLHdEQUF3RDtBQUN4RCxTQUFTLFNBQVMsQ0FBQyxPQUFlO0lBQzlCLG1FQUFtRTtJQUNuRSxvRUFBb0U7SUFDcEUsa0VBQWtFO0lBQ2xFLE1BQU0sTUFBTSxHQUFHLE9BQU8sQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDO0lBQ3hFLElBQUks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QUcsTUFBTSxDQUFDLE1BQU0sRUFBRSxHQUFHLEVBQUUsR0FBRyxLQUFLLE1BQU0sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxFQUFFLFFBQVEsTUFBTSxDQUFDLE1BQU0saUJBQWlCLENBQUMsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDO0lBQ2hOLENBQUM7Q0FDSixDQUFDO0FBRUYsTUFBYSxlQUFlO0lBQTVCO1FBQ1ksU0FBSSxHQUFHLElBQUEsMEJBQVcsRUFBQztZQUN2QixVQUFVO1lBQ1YsV0FBVztZQUNYLFdBQVc7WUFDWCxTQUFTO1NBQ1osQ0FBQyxDQUFDO0lBU1AsQ0FBQztJQVBHLFFBQVE7UUFDSixPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7SUFDaEMsQ0FBQztJQUVELE9BQU8sQ0FBQyxRQUFnQixFQUFFLElBQVM7UUFDL0IsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDN0MsQ0FBQztDQUNKO0FBZkQsMENBZUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBvaywgZmFpbCB9IGZyb20gJy4uL2xpYi9yZXNwb25zZSc7XG4vKipcbiAqIGZpbGUtZWRpdG9yLXRvb2xzIOKAlCBob3N0LXNpZGUgZnMgb3BlcmF0aW9ucyBmb3IgY2xpZW50cyB3aXRob3V0XG4gKiBuYXRpdmUgZmlsZSBlZGl0aW5nLlxuICpcbiAqIEZvdXIgdG9vbHMgKFNwYXlkbyBjb2Nvcy1tY3AtZXh0ZW5zaW9uIHJvdXRlLCBoYXJkZW5lZCk6XG4gKiAgIC0gZmlsZV9lZGl0b3JfaW5zZXJ0X3RleHQgICDigJQgaW5zZXJ0IGF0IDEtYmFzZWQgbGluZVxuICogICAtIGZpbGVfZWRpdG9yX2RlbGV0ZV9saW5lcyAg4oCUIGRlbGV0ZSByYW5nZSwgMS1iYXNlZCBpbmNsdXNpdmVcbiAqICAgLSBmaWxlX2VkaXRvcl9yZXBsYWNlX3RleHQgIOKAlCBmaW5kL3JlcGxhY2UsIHBsYWluIG9yIHJlZ2V4XG4gKiAgIC0gZmlsZV9lZGl0b3JfcXVlcnlfdGV4dCAgICDigJQgcmVhZCByYW5nZSwgMS1iYXNlZFxuICpcbiAqIFdoeSB3ZSBzaGlwIHRoZXNlIGV2ZW4gdGhvdWdoIENsYXVkZSBDb2RlIGFscmVhZHkgaGFzIEVkaXQvV3JpdGU6XG4gKiAgIE11bHRpLWNsaWVudCBicmVhZHRoLiBDbGF1ZGUgRGVza3RvcCAvIENsaW5lIC8gQ29udGludWUgaGF2ZSBub1xuICogICBuYXRpdmUgZmlsZSBvcHM7IEFJIG9uIHRob3NlIGNsaWVudHMgbXVzdCBnbyB0aHJvdWdoIHRoZSBNQ1BcbiAqICAgc2VydmVyLiBUb29sIGRlc2NyaXB0aW9ucyBjYXJyeSBbY2xhdWRlLWNvZGUtcmVkdW5kYW50XSBzbyB0aGVcbiAqICAgcmFua2VyIG9uIENsYXVkZSBDb2RlIHByZWZlcnMgdGhlIElERSB0b29sLlxuICpcbiAqIFNwYXlkbydzIHVwc3RyZWFtIGhhZCB0d28gZ2FwcyB3ZSBjbG9zZTpcbiAqICAgMS4gcGF0aC1zYWZldHkgZ3VhcmQgdmlhIHBsYWluIGBwYXRoLnJlc29sdmUgKyBzdGFydHNXaXRoYCBpc1xuICogICAgICBzeW1saW5rLXVuc2FmZSDigJQgYSBzeW1saW5rIGluc2lkZSB0aGUgcHJvamVjdCBwb2ludGluZ1xuICogICAgICBvdXRzaWRlIHN0aWxsIHBhc3Nlcy4gVXNlIGBmcy5yZWFscGF0aFN5bmMubmF0aXZlYCBvbiBib3RoXG4gKiAgICAgIHNpZGVzIChzYW1lIGZpeCB2Mi40LjkgYXBwbGllZCB0byBkZWJ1Z19nZXRfc2NyaXB0X2RpYWdub3N0aWNfY29udGV4dCkuXG4gKiAgIDIuIGFzc2V0LWRiIHJlZnJlc2ggaG9vayBtaXNzaW5nOiBjb2NvcyBlZGl0b3IgZG9lc24ndCByZWltcG9ydFxuICogICAgICBhIC50cy8uanMgdW50aWwgYXNzZXQtZGIgc2VlcyBhIHJlZnJlc2ggZXZlbnQuIENhbGxcbiAqICAgICAgYEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3JlZnJlc2gnLCBhYnNQYXRoKWAgYWZ0ZXJcbiAqICAgICAgZXZlcnkgd3JpdGUgc28gdGhlIGVkaXRvciBwaWNrcyB1cCB0aGUgY2hhbmdlLlxuICovXG5cbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgdHlwZSB7IFRvb2xSZXNwb25zZSB9IGZyb20gJy4uL3R5cGVzJztcbmltcG9ydCB7IHogfSBmcm9tICcuLi9saWIvc2NoZW1hJztcbmltcG9ydCB7IGRlZmluZVRvb2xzLCBUb29sRGVmIH0gZnJvbSAnLi4vbGliL2RlZmluZS10b29scyc7XG5pbXBvcnQgeyBsb2dnZXIgfSBmcm9tICcuLi9saWIvbG9nJztcblxuY29uc3QgUkVEVU5EQU5UX1RBRyA9ICdbY2xhdWRlLWNvZGUtcmVkdW5kYW50XSBVc2UgRWRpdC9Xcml0ZSB0b29sIGZyb20geW91ciBJREUgaWYgYXZhaWxhYmxlLiAnO1xuXG4vLyBSZWFkIGNhcCB0byBrZWVwIHRvb2wgcmVzdWx0IHJlYXNvbmFibGU7IG1hdGNoZXMgdGhlIGNhcCB1c2VkIGJ5XG4vLyBkZWJ1Z19nZXRfc2NyaXB0X2RpYWdub3N0aWNfY29udGV4dC5cbmNvbnN0IEZJTEVfUkVBRF9CWVRFX0NBUCA9IDUgKiAxMDI0ICogMTAyNDtcblxuLy8gdjIuNS4xIHJvdW5kLTEgcmV2aWV3IGZpeCAoY29kZXggKyBjbGF1ZGUgKyBnZW1pbmkg8J+foSk6IHJlZ2V4IG1vZGUgcnVuc1xuLy8gb24gZmlsZXMgdXAgdG8gRklMRV9SRUFEX0JZVEVfQ0FQIHdpdGhvdXQgYSBydW50aW1lIGNhcCwgc28gYVxuLy8gY2F0YXN0cm9waGljLWJhY2t0cmFja2luZyBwYXR0ZXJuIHdvdWxkIGhhbmcgdGhlIGVkaXRvciBwcm9jZXNzLiBDYXBcbi8vIHRoZSByZWdleC1tb2RlIGJvZHkgdG8gYSBzbWFsbGVyIHdpbmRvdy4gUGxhaW4tc3RyaW5nIG1vZGUgaXMgYm91bmRlZFxuLy8gYnkgVjggc3RyaW5nIG9wcyBzbyBpdCBkb2Vzbid0IG5lZWQgdGhpcyBndWFyZC5cbmNvbnN0IFJFR0VYX01PREVfQllURV9DQVAgPSAxICogMTAyNCAqIDEwMjQ7XG5cbi8vIHYyLjUuMSByb3VuZC0xIHJldmlldyBmaXggKGNvZGV4IPCfn6EpOiBmcy5yZWFscGF0aFN5bmMubmF0aXZlIGlzIGRvY3VtZW50ZWRcbi8vIHNpbmNlIE5vZGUgOS4yIGJ1dCBhIGZldyBjb2Nvcy1idW5kbGVkIE5vZGUgYnVpbGRzIGhpc3RvcmljYWxseSBkaWRuJ3Rcbi8vIGV4cG9zZSBpdC4gUmVzb2x2ZSBvbmNlIGF0IG1vZHVsZSBsb2FkIHdpdGggYSBzYWZlIGZhbGxiYWNrLlxuY29uc3QgcmVhbHBhdGhTeW5jOiB0eXBlb2YgZnMucmVhbHBhdGhTeW5jID0gKGZzLnJlYWxwYXRoU3luYyBhcyBhbnkpLm5hdGl2ZSA/PyBmcy5yZWFscGF0aFN5bmM7XG5cbi8vIHYyLjUuMSByb3VuZC0xIHJldmlldyBmaXggKGNsYXVkZSDwn5+hKTogcHJlc2VydmUgZG9taW5hbnQgbGluZSBlbmRpbmcgc29cbi8vIGVkaXRzIGRvbid0IHNpbGVudGx5IHJld3JpdGUgYSBXaW5kb3dzIHByb2plY3QncyBDUkxGIGxpbmVzIGFzIExGLiBXZVxuLy8gZGV0ZWN0IGJ5IGNvdW50aW5nIFxcclxcbiB2cyBsb25lIFxcbiBpbiB0aGUgZmlsZSwgdGhlbiByZS1qb2luIHdpdGggdGhlXG4vLyBkb21pbmFudCBzdHlsZS4gTmV3IGxpbmVzIGFkZGVkIGJ5IHRoZSB1c2VyICh2aWEgaW5zZXJ0X3RleHQgb3Jcbi8vIHJlcGxhY2VfdGV4dCkgaW5oZXJpdCB3aGF0ZXZlciB0aGUgZmlsZSBhbHJlYWR5IHVzZXMuXG5mdW5jdGlvbiBkZXRlY3RFb2woY29udGVudDogc3RyaW5nKTogJ1xcclxcbicgfCAnXFxuJyB7XG4gICAgLy8gQ291bnQgbG9uZSBcXG4gdnMgXFxyXFxuIGluIHRoZSBmaXJzdCA0S0Ig4oCUIHNhbXBsZSBpcyBlbm91Z2g7IG1peGVkXG4gICAgLy8gZmlsZXMgcGljayB3aGljaGV2ZXIgYXBwZWFycyBtb3JlIGluIHRoZSBoZWFkLiBFZGdlIGNhc2UgKGZpbGUgaXNcbiAgICAvLyBhbGwtQ1JMRiBleGNlcHQgYSBzaW5nbGUgTEYgaW4gdGhlIG1pZGRsZSk6IHdlIHN0aWxsIHBpY2sgQ1JMRi5cbiAgICBjb25zdCBzYW1wbGUgPSBjb250ZW50Lmxlbmd0aCA+IDQwOTYgPyBjb250ZW50LnNsaWNlKDAsIDQwOTYpIDogY29udGVudDtcbiAgICBsZXQgY3JsZiA9IDA7XG4gICAgbGV0IGxmID0gMDtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHNhbXBsZS5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAoc2FtcGxlLmNoYXJDb2RlQXQoaSkgPT09IDB4MGEgLyogXFxuICovKSB7XG4gICAgICAgICAgICBpZiAoaSA+IDAgJiYgc2FtcGxlLmNoYXJDb2RlQXQoaSAtIDEpID09PSAweDBkIC8qIFxcciAqLykgY3JsZisrO1xuICAgICAgICAgICAgZWxzZSBsZisrO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBjcmxmID4gbGYgPyAnXFxyXFxuJyA6ICdcXG4nO1xufVxuXG5mdW5jdGlvbiBzcGxpdExpbmVzTm9ybWFsaXplZChjb250ZW50OiBzdHJpbmcpOiB7IGxpbmVzOiBzdHJpbmdbXTsgZW9sOiAnXFxyXFxuJyB8ICdcXG4nIH0ge1xuICAgIHJldHVybiB7XG4gICAgICAgIGxpbmVzOiBjb250ZW50LnNwbGl0KC9cXHI/XFxuLyksXG4gICAgICAgIGVvbDogZGV0ZWN0RW9sKGNvbnRlbnQpLFxuICAgIH07XG59XG5cbmludGVyZmFjZSBSZXNvbHZlZFBhdGggeyBhYnM6IHN0cmluZzsgcmVsUHJvamVjdDogc3RyaW5nOyB9XG5cbmZ1bmN0aW9uIGdldFByb2plY3RQYXRoKCk6IHN0cmluZyB8IG51bGwge1xuICAgIHRyeSB7XG4gICAgICAgIHJldHVybiBFZGl0b3I/LlByb2plY3Q/LnBhdGggPz8gbnVsbDtcbiAgICB9IGNhdGNoIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxufVxuXG4vKipcbiAqIFJlc29sdmUgYSB1c2VyLXN1cHBsaWVkIHBhdGggdG8gYW4gYWJzb2x1dGUsIHN5bWxpbmstc2FmZSBwYXRoXG4gKiBpbnNpZGUgdGhlIHByb2plY3QuIFJldHVybnMgdGhlIHJlc29sdmVkIGFic29sdXRlIHBhdGggKyB0aGVcbiAqIHByb2plY3QtcmVsYXRpdmUgZm9ybSAoZm9yIGZyaWVuZGx5IG1lc3NhZ2VzKS4gVGhyb3dzLXN0eWxlXG4gKiB7IGVycm9yIH0gZW52ZWxvcGUgZm9yIGNhbGxlcnMgdG8gc2hvcnQtY2lyY3VpdCBvbi5cbiAqXG4gKiBQYXRoIHNhZmV0eTpcbiAqICAgMS4gSWYgYHRhcmdldGAgaXMgcmVsYXRpdmUsIGpvaW5lZCB0byBwcm9qZWN0UGF0aDsgaWYgYWJzb2x1dGUsXG4gKiAgICAgIHVzZWQgYXMtaXMuXG4gKiAgIDIuIEJvdGggdGFyZ2V0IGFuZCBwcm9qZWN0IHJvb3QgZ28gdGhyb3VnaCBgZnMucmVhbHBhdGhTeW5jLm5hdGl2ZWBcbiAqICAgICAgc28gc3ltbGlua3MgYXJlIGZvbGxvd2VkIGJlZm9yZSB0aGUgcHJlZml4IGNoZWNrLlxuICogICAzLiBDYXNlLWluc2Vuc2l0aXZlIGNvbXBhcmlzb24gb24gV2luZG93czsgY2FzZS1zZW5zaXRpdmUgb24gUE9TSVguXG4gKiAgIDQuIFNlcCBndWFyZCBhZ2FpbnN0IGAvcHJvai1mb29gIHZzIGAvcHJvamAgcHJlZml4IGNvbmZ1c2lvbi5cbiAqXG4gKiBDYWxsZXIgTVVTVCBoYW5kbGUgdGhlIG1pc3NpbmctdGFyZ2V0IGNhc2UgZm9yIHdyaXRlIG9wZXJhdGlvbnNcbiAqIChpbnNlcnQvcmVwbGFjZS9kZWxldGUpIOKAlCB3ZSBzdGlsbCB3YW50IHRvIHdyaXRlIHRvIGEgbm9uLWV4aXN0ZW50XG4gKiBmaWxlIHZpYSB0aGUgcmVsYXRpdmUtcGF0aCBmYWxsYmFjayB3aGVuIHRoZSBwYXJlbnQgZGlyZWN0b3J5XG4gKiBleGlzdHMuIFNlZSBgcmVzb2x2ZVBhdGhGb3JXcml0ZWAgYmVsb3cuXG4gKi9cbmZ1bmN0aW9uIHJlc29sdmVQYXRoRm9yUmVhZCh0YXJnZXQ6IHN0cmluZyk6IFJlc29sdmVkUGF0aCB8IHsgZXJyb3I6IHN0cmluZyB9IHtcbiAgICBjb25zdCBwcm9qZWN0UGF0aCA9IGdldFByb2plY3RQYXRoKCk7XG4gICAgaWYgKCFwcm9qZWN0UGF0aCkge1xuICAgICAgICByZXR1cm4geyBlcnJvcjogJ2ZpbGUtZWRpdG9yOiBlZGl0b3IgY29udGV4dCB1bmF2YWlsYWJsZSAobm8gRWRpdG9yLlByb2plY3QucGF0aCknIH07XG4gICAgfVxuICAgIGNvbnN0IGFic1JhdyA9IHBhdGguaXNBYnNvbHV0ZSh0YXJnZXQpID8gdGFyZ2V0IDogcGF0aC5qb2luKHByb2plY3RQYXRoLCB0YXJnZXQpO1xuICAgIGxldCByZXNvbHZlZEFiczogc3RyaW5nO1xuICAgIHRyeSB7XG4gICAgICAgIHJlc29sdmVkQWJzID0gcmVhbHBhdGhTeW5jKGFic1Jhdyk7XG4gICAgfSBjYXRjaCB7XG4gICAgICAgIHJldHVybiB7IGVycm9yOiBgZmlsZS1lZGl0b3I6IGZpbGUgbm90IGZvdW5kIG9yIHVucmVhZGFibGU6ICR7YWJzUmF3fWAgfTtcbiAgICB9XG4gICAgbGV0IHByb2plY3RBYnM6IHN0cmluZztcbiAgICB0cnkge1xuICAgICAgICBwcm9qZWN0QWJzID0gcmVhbHBhdGhTeW5jKHByb2plY3RQYXRoKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgICAgcHJvamVjdEFicyA9IHBhdGgucmVzb2x2ZShwcm9qZWN0UGF0aCk7XG4gICAgfVxuICAgIGNvbnN0IGNtcCA9IHByb2Nlc3MucGxhdGZvcm0gPT09ICd3aW4zMidcbiAgICAgICAgPyB7IHJlc29sdmVkOiByZXNvbHZlZEFicy50b0xvd2VyQ2FzZSgpLCBwcm9qZWN0OiBwcm9qZWN0QWJzLnRvTG93ZXJDYXNlKCkgfVxuICAgICAgICA6IHsgcmVzb2x2ZWQ6IHJlc29sdmVkQWJzLCBwcm9qZWN0OiBwcm9qZWN0QWJzIH07XG4gICAgaWYgKCFjbXAucmVzb2x2ZWQuc3RhcnRzV2l0aChjbXAucHJvamVjdCArIHBhdGguc2VwKSAmJiBjbXAucmVzb2x2ZWQgIT09IGNtcC5wcm9qZWN0KSB7XG4gICAgICAgIHJldHVybiB7IGVycm9yOiBgZmlsZS1lZGl0b3I6IHBhdGggJHtyZXNvbHZlZEFic30gcmVzb2x2ZXMgb3V0c2lkZSB0aGUgcHJvamVjdCByb290IChzeW1saW5rLWF3YXJlIGNoZWNrKWAgfTtcbiAgICB9XG4gICAgcmV0dXJuIHsgYWJzOiByZXNvbHZlZEFicywgcmVsUHJvamVjdDogcGF0aC5yZWxhdGl2ZShwcm9qZWN0QWJzLCByZXNvbHZlZEFicykgfTtcbn1cblxuY29uc3QgQVNTRVRfUkVGUkVTSF9FWFRTID0gbmV3IFNldChbJy50cycsICcudHN4JywgJy5qcycsICcuanN4JywgJy5qc29uJywgJy5maXJlJywgJy5zY2VuZScsICcucHJlZmFiJywgJy5hbmltJywgJy5tYXRlcmlhbCcsICcuZWZmZWN0JywgJy5mbnQnXSk7XG5cbi8qKlxuICogQmVzdC1lZmZvcnQ6IHRlbGwgY29jb3MgYXNzZXQtZGIgdGhhdCB0aGUgZmlsZSBjaGFuZ2VkIHNvIHRoZSBlZGl0b3JcbiAqIHBpY2tzIGl0IHVwIHdpdGhvdXQgYSBtYW51YWwgcmVmcmVzaC4gRmFpbHVyZSBpcyBub24tZmF0YWwgYmVjYXVzZVxuICogdGhlIGZpbGUgaXMgYWxyZWFkeSB3cml0dGVuOyB0aGUgdXNlciBjYW4gaGl0IHJlZnJlc2ggbWFudWFsbHkuXG4gKlxuICogT25seSBmaXJlcyBmb3IgZmlsZSBleHRlbnNpb25zIGNvY29zIGNhcmVzIGFib3V0IChUUyBzb3VyY2UsIEpTT05cbiAqIGNvbmZpZ3MsIHNjZW5lL3ByZWZhYi9hbmltIGFzc2V0cywgZXRjLikgc28gcGxhaW4gLnR4dCBlZGl0cyBkb24ndFxuICogc3BhbSB0aGUgYXNzZXQtZGIuXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIHJlZnJlc2hBc3NldERiKGFic1BhdGg6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IGV4dCA9IHBhdGguZXh0bmFtZShhYnNQYXRoKS50b0xvd2VyQ2FzZSgpO1xuICAgIGlmICghQVNTRVRfUkVGUkVTSF9FWFRTLmhhcyhleHQpKSByZXR1cm47XG4gICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncmVmcmVzaC1hc3NldCcsIGFic1BhdGgpO1xuICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgIGxvZ2dlci5kZWJ1ZygnW0ZpbGVFZGl0b3JdIGFzc2V0LWRiIHJlZnJlc2gtYXNzZXQgZmFpbGVkIChub24tZmF0YWwpOicsIGVycj8ubWVzc2FnZSA/PyBlcnIpO1xuICAgIH1cbn1cblxuY29uc3QgaW5zZXJ0VGV4dDogVG9vbERlZiA9IHtcbiAgICBuYW1lOiAnaW5zZXJ0X3RleHQnLFxuICAgIHRpdGxlOiAnSW5zZXJ0IHRleHQgYXQgbGluZScsXG4gICAgZGVzY3JpcHRpb246IFJFRFVOREFOVF9UQUcgKyAnSW5zZXJ0IGEgbmV3IGxpbmUgYXQgdGhlIGdpdmVuIDEtYmFzZWQgbGluZSBudW1iZXIuIElmIGxpbmUgZXhjZWVkcyB0b3RhbCwgdGV4dCBpcyBhcHBlbmRlZCBhdCBlbmQgb2YgZmlsZS4gVHJpZ2dlcnMgY29jb3MgYXNzZXQtZGIgcmVmcmVzaCBvbiBjb2Nvcy1yZWNvZ25pc2VkIGV4dGVuc2lvbnMgKC50cy8uanNvbi8uc2NlbmUvLnByZWZhYi9ldGMuKSBzbyB0aGUgZWRpdG9yIHJlaW1wb3J0cy4nLFxuICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgIGZpbGVQYXRoOiB6LnN0cmluZygpLmRlc2NyaWJlKCdQYXRoIHRvIHRoZSBmaWxlIChhYnNvbHV0ZSBvciBwcm9qZWN0LXJlbGF0aXZlKS4nKSxcbiAgICAgICAgbGluZTogei5udW1iZXIoKS5pbnQoKS5taW4oMSkuZGVzY3JpYmUoJzEtYmFzZWQgbGluZSBudW1iZXIgdG8gaW5zZXJ0IGF0OyBleGlzdGluZyBsaW5lcyBzaGlmdCBkb3duLicpLFxuICAgICAgICB0ZXh0OiB6LnN0cmluZygpLmRlc2NyaWJlKCdUZXh0IHRvIGluc2VydCBhcyBhIG5ldyBsaW5lIChubyB0cmFpbGluZyBuZXdsaW5lIGV4cGVjdGVkKS4nKSxcbiAgICB9KSxcbiAgICBoYW5kbGVyOiBhc3luYyAoYXJncyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiA9PiB7XG4gICAgICAgIGNvbnN0IHIgPSByZXNvbHZlUGF0aEZvclJlYWQoYXJncy5maWxlUGF0aCk7XG4gICAgICAgIGlmICgnZXJyb3InIGluIHIpIHJldHVybiBmYWlsKHIuZXJyb3IpO1xuICAgICAgICBjb25zdCBzdGF0ID0gZnMuc3RhdFN5bmMoci5hYnMpO1xuICAgICAgICBpZiAoc3RhdC5zaXplID4gRklMRV9SRUFEX0JZVEVfQ0FQKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChgZmlsZS1lZGl0b3I6IGZpbGUgdG9vIGxhcmdlICgke3N0YXQuc2l6ZX0gYnl0ZXMpOyByZWZ1c2luZyB0byByZWFkLmApO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGNvbnRlbnQgPSBmcy5yZWFkRmlsZVN5bmMoci5hYnMsICd1dGYtOCcpO1xuICAgICAgICBjb25zdCB7IGxpbmVzLCBlb2wgfSA9IHNwbGl0TGluZXNOb3JtYWxpemVkKGNvbnRlbnQpO1xuICAgICAgICBjb25zdCBpbnNlcnRJbmRleCA9IGFyZ3MubGluZSAtIDE7XG4gICAgICAgIGlmIChpbnNlcnRJbmRleCA+PSBsaW5lcy5sZW5ndGgpIHtcbiAgICAgICAgICAgIGxpbmVzLnB1c2goYXJncy50ZXh0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxpbmVzLnNwbGljZShpbnNlcnRJbmRleCwgMCwgYXJncy50ZXh0KTtcbiAgICAgICAgfVxuICAgICAgICBmcy53cml0ZUZpbGVTeW5jKHIuYWJzLCBsaW5lcy5qb2luKGVvbCksICd1dGYtOCcpO1xuICAgICAgICBhd2FpdCByZWZyZXNoQXNzZXREYihyLmFicyk7XG4gICAgICAgIHJldHVybiBvayh7IGZpbGU6IHIucmVsUHJvamVjdCwgdG90YWxMaW5lczogbGluZXMubGVuZ3RoLCBlb2w6IGVvbCA9PT0gJ1xcclxcbicgPyAnQ1JMRicgOiAnTEYnIH0sIGBJbnNlcnRlZCB0ZXh0IGF0IGxpbmUgJHtNYXRoLm1pbihhcmdzLmxpbmUsIGxpbmVzLmxlbmd0aCl9IG9mICR7ci5yZWxQcm9qZWN0fWApO1xuICAgIH0sXG59O1xuXG5jb25zdCBkZWxldGVMaW5lczogVG9vbERlZiA9IHtcbiAgICBuYW1lOiAnZGVsZXRlX2xpbmVzJyxcbiAgICB0aXRsZTogJ0RlbGV0ZSBsaW5lIHJhbmdlJyxcbiAgICBkZXNjcmlwdGlvbjogUkVEVU5EQU5UX1RBRyArICdEZWxldGUgYSByYW5nZSBvZiBsaW5lcyAoMS1iYXNlZCwgaW5jbHVzaXZlKS4gVHJpZ2dlcnMgY29jb3MgYXNzZXQtZGIgcmVmcmVzaC4nLFxuICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgIGZpbGVQYXRoOiB6LnN0cmluZygpLmRlc2NyaWJlKCdQYXRoIHRvIHRoZSBmaWxlIChhYnNvbHV0ZSBvciBwcm9qZWN0LXJlbGF0aXZlKS4nKSxcbiAgICAgICAgc3RhcnRMaW5lOiB6Lm51bWJlcigpLmludCgpLm1pbigxKS5kZXNjcmliZSgnRmlyc3QgbGluZSB0byBkZWxldGUgKDEtYmFzZWQsIGluY2x1c2l2ZSkuJyksXG4gICAgICAgIGVuZExpbmU6IHoubnVtYmVyKCkuaW50KCkubWluKDEpLmRlc2NyaWJlKCdMYXN0IGxpbmUgdG8gZGVsZXRlICgxLWJhc2VkLCBpbmNsdXNpdmUpLiBNdXN0IGJlID49IHN0YXJ0TGluZS4nKSxcbiAgICB9KSxcbiAgICBoYW5kbGVyOiBhc3luYyAoYXJncyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiA9PiB7XG4gICAgICAgIGlmIChhcmdzLnN0YXJ0TGluZSA+IGFyZ3MuZW5kTGluZSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ2ZpbGUtZWRpdG9yOiBzdGFydExpbmUgbXVzdCBiZSA8PSBlbmRMaW5lJyk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgciA9IHJlc29sdmVQYXRoRm9yUmVhZChhcmdzLmZpbGVQYXRoKTtcbiAgICAgICAgaWYgKCdlcnJvcicgaW4gcikgcmV0dXJuIGZhaWwoci5lcnJvcik7XG4gICAgICAgIGNvbnN0IHN0YXQgPSBmcy5zdGF0U3luYyhyLmFicyk7XG4gICAgICAgIGlmIChzdGF0LnNpemUgPiBGSUxFX1JFQURfQllURV9DQVApIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGBmaWxlLWVkaXRvcjogZmlsZSB0b28gbGFyZ2UgKCR7c3RhdC5zaXplfSBieXRlcyk7IHJlZnVzaW5nIHRvIHJlYWQuYCk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgY29udGVudCA9IGZzLnJlYWRGaWxlU3luYyhyLmFicywgJ3V0Zi04Jyk7XG4gICAgICAgIGNvbnN0IHsgbGluZXMsIGVvbCB9ID0gc3BsaXRMaW5lc05vcm1hbGl6ZWQoY29udGVudCk7XG4gICAgICAgIGNvbnN0IGRlbGV0ZVN0YXJ0ID0gYXJncy5zdGFydExpbmUgLSAxO1xuICAgICAgICBjb25zdCByZXF1ZXN0ZWRDb3VudCA9IGFyZ3MuZW5kTGluZSAtIGFyZ3Muc3RhcnRMaW5lICsgMTtcbiAgICAgICAgY29uc3QgZGVsZXRlZENvdW50ID0gTWF0aC5tYXgoMCwgTWF0aC5taW4ocmVxdWVzdGVkQ291bnQsIGxpbmVzLmxlbmd0aCAtIGRlbGV0ZVN0YXJ0KSk7XG4gICAgICAgIGlmIChkZWxldGVkQ291bnQgPT09IDApIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGBmaWxlLWVkaXRvcjogcmFuZ2UgJHthcmdzLnN0YXJ0TGluZX0tJHthcmdzLmVuZExpbmV9IGlzIHBhc3QgRU9GIChmaWxlIGhhcyAke2xpbmVzLmxlbmd0aH0gbGluZXMpYCk7XG4gICAgICAgIH1cbiAgICAgICAgbGluZXMuc3BsaWNlKGRlbGV0ZVN0YXJ0LCBkZWxldGVkQ291bnQpO1xuICAgICAgICBmcy53cml0ZUZpbGVTeW5jKHIuYWJzLCBsaW5lcy5qb2luKGVvbCksICd1dGYtOCcpO1xuICAgICAgICBhd2FpdCByZWZyZXNoQXNzZXREYihyLmFicyk7XG4gICAgICAgIHJldHVybiBvayh7IGZpbGU6IHIucmVsUHJvamVjdCwgZGVsZXRlZENvdW50LCB0b3RhbExpbmVzOiBsaW5lcy5sZW5ndGgsIGVvbDogZW9sID09PSAnXFxyXFxuJyA/ICdDUkxGJyA6ICdMRicgfSwgYERlbGV0ZWQgJHtkZWxldGVkQ291bnR9IGxpbmUocykgZnJvbSBsaW5lICR7YXJncy5zdGFydExpbmV9IHRvICR7YXJncy5zdGFydExpbmUgKyBkZWxldGVkQ291bnQgLSAxfSBvZiAke3IucmVsUHJvamVjdH1gKTtcbiAgICB9LFxufTtcblxuY29uc3QgcmVwbGFjZVRleHQ6IFRvb2xEZWYgPSB7XG4gICAgbmFtZTogJ3JlcGxhY2VfdGV4dCcsXG4gICAgdGl0bGU6ICdSZXBsYWNlIHRleHQgaW4gZmlsZScsXG4gICAgZGVzY3JpcHRpb246IFJFRFVOREFOVF9UQUcgKyAnRmluZC9yZXBsYWNlIHRleHQgaW4gYSBmaWxlLiBQbGFpbiBzdHJpbmcgYnkgZGVmYXVsdDsgcGFzcyB1c2VSZWdleDp0cnVlIHRvIGludGVycHJldCBzZWFyY2ggYXMgYSByZWdleC4gUmVwbGFjZXMgZmlyc3Qgb2NjdXJyZW5jZSBvbmx5IHVubGVzcyByZXBsYWNlQWxsOnRydWUuIFJlZ2V4IGJhY2tyZWZlcmVuY2VzICgkMSwgJCYsICRgLCAkXFwnKSB3b3JrIHdoZW4gdXNlUmVnZXg6dHJ1ZS4gVHJpZ2dlcnMgY29jb3MgYXNzZXQtZGIgcmVmcmVzaC4nLFxuICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgIGZpbGVQYXRoOiB6LnN0cmluZygpLmRlc2NyaWJlKCdQYXRoIHRvIHRoZSBmaWxlIChhYnNvbHV0ZSBvciBwcm9qZWN0LXJlbGF0aXZlKS4nKSxcbiAgICAgICAgLy8gdjIuNS4xIHJvdW5kLTEgcmV2aWV3IGZpeCAoY29kZXggKyBjbGF1ZGUg8J+foSk6IGVtcHR5IHNlYXJjaCB3b3VsZFxuICAgICAgICAvLyBlaXRoZXIgaW5zZXJ0IGJldHdlZW4gZXZlcnkgY2hhciAocmVwbGFjZUFsbCkgb3IgaW5zZXJ0IGF0IGJ5dGUgMFxuICAgICAgICAvLyAoZmlyc3Qtb25seSkg4oCUIGJvdGggc3VycHJpc2luZy4gUmVqZWN0IGVhcmx5LlxuICAgICAgICBzZWFyY2g6IHouc3RyaW5nKCkubWluKDEsICdzZWFyY2ggbXVzdCBiZSBub24tZW1wdHknKS5kZXNjcmliZSgnU2VhcmNoIHRleHQgb3IgcmVnZXggcGF0dGVybiAoZGVwZW5kcyBvbiB1c2VSZWdleCkuIE11c3QgYmUgbm9uLWVtcHR5LicpLFxuICAgICAgICByZXBsYWNlOiB6LnN0cmluZygpLmRlc2NyaWJlKCdSZXBsYWNlbWVudCB0ZXh0LiBSZWdleCBiYWNrcmVmZXJlbmNlcyAoJDEsICQmLCAkYCwgJFxcJykgZXhwYW5kIHdoZW4gdXNlUmVnZXg6dHJ1ZS4nKSxcbiAgICAgICAgdXNlUmVnZXg6IHouYm9vbGVhbigpLmRlZmF1bHQoZmFsc2UpLmRlc2NyaWJlKCdUcmVhdCBgc2VhcmNoYCBhcyBhIEpTIFJlZ0V4cCBzb3VyY2Ugc3RyaW5nLiBEZWZhdWx0IGZhbHNlLicpLFxuICAgICAgICByZXBsYWNlQWxsOiB6LmJvb2xlYW4oKS5kZWZhdWx0KGZhbHNlKS5kZXNjcmliZSgnUmVwbGFjZSBldmVyeSBvY2N1cnJlbmNlLiBEZWZhdWx0IGZhbHNlIChmaXJzdCBvbmx5KS4nKSxcbiAgICB9KSxcbiAgICBoYW5kbGVyOiBhc3luYyAoYXJncyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiA9PiB7XG4gICAgICAgIGNvbnN0IHIgPSByZXNvbHZlUGF0aEZvclJlYWQoYXJncy5maWxlUGF0aCk7XG4gICAgICAgIGlmICgnZXJyb3InIGluIHIpIHJldHVybiBmYWlsKHIuZXJyb3IpO1xuICAgICAgICBjb25zdCBzdGF0ID0gZnMuc3RhdFN5bmMoci5hYnMpO1xuICAgICAgICBpZiAoc3RhdC5zaXplID4gRklMRV9SRUFEX0JZVEVfQ0FQKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChgZmlsZS1lZGl0b3I6IGZpbGUgdG9vIGxhcmdlICgke3N0YXQuc2l6ZX0gYnl0ZXMpOyByZWZ1c2luZyB0byByZWFkLmApO1xuICAgICAgICB9XG4gICAgICAgIC8vIHYyLjUuMSByb3VuZC0xIHJldmlldyBmaXggKGNvZGV4ICsgY2xhdWRlICsgZ2VtaW5pIPCfn6EpOiByZWdleFxuICAgICAgICAvLyBtb2RlIHJ1bnMgdXNlci1jb250cm9sbGVkIHBhdHRlcm5zIGFnYWluc3QgdGhlIGZpbGUgY29udGVudFxuICAgICAgICAvLyB3aXRoIG5vIHRpbWVvdXQuIENhcCB0byBhIHNtYWxsZXIgd2luZG93IGluIHJlZ2V4IG1vZGUgc29cbiAgICAgICAgLy8gY2F0YXN0cm9waGljIGJhY2t0cmFja2luZyBvbiBhIGxhcmdlIGZpbGUgY2FuJ3QgaGFuZyB0aGVcbiAgICAgICAgLy8gZWRpdG9yJ3MgaG9zdCBwcm9jZXNzLiBQbGFpbi1zdHJpbmcgbW9kZSBrZWVwcyB0aGUgbGFyZ2VyXG4gICAgICAgIC8vIEZJTEVfUkVBRF9CWVRFX0NBUCBiZWNhdXNlIFN0cmluZy5zcGxpdC9pbmRleE9mL3NsaWNlIGFyZVxuICAgICAgICAvLyBib3VuZGVkIGJ5IFY4IGludGVybmFscyAobm8gcmVnZXggZW5naW5lIHBhdGgpLlxuICAgICAgICBpZiAoYXJncy51c2VSZWdleCAmJiBzdGF0LnNpemUgPiBSRUdFWF9NT0RFX0JZVEVfQ0FQKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChgZmlsZS1lZGl0b3I6IHJlZ2V4IG1vZGUgcmVmdXNlcyBmaWxlcyA+ICR7UkVHRVhfTU9ERV9CWVRFX0NBUH0gYnl0ZXMgKCR7c3RhdC5zaXplfSBieXRlcyBoZXJlKS4gU3dpdGNoIHRvIHVzZVJlZ2V4OmZhbHNlIG9yIHNwbGl0IHRoZSBmaWxlIGZpcnN0LmApO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGNvbnRlbnQgPSBmcy5yZWFkRmlsZVN5bmMoci5hYnMsICd1dGYtOCcpO1xuICAgICAgICBsZXQgcmVwbGFjZW1lbnRzID0gMDtcbiAgICAgICAgbGV0IG5ld0NvbnRlbnQ6IHN0cmluZztcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGlmIChhcmdzLnVzZVJlZ2V4KSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZmxhZ3MgPSBhcmdzLnJlcGxhY2VBbGwgPyAnZycgOiAnJztcbiAgICAgICAgICAgICAgICBjb25zdCByZWdleCA9IG5ldyBSZWdFeHAoYXJncy5zZWFyY2gsIGZsYWdzKTtcbiAgICAgICAgICAgICAgICAvLyB2Mi41LjEgcm91bmQtMSByZXZpZXcgZml4IChjb2RleCDwn5S0KTogcGFzcyB0aGUgcmVwbGFjZW1lbnRcbiAgICAgICAgICAgICAgICAvLyBTVFJJTkcgZGlyZWN0bHkgc28gJDEvJCYvZXRjLiBleHBhbmQuIFRoZSBwcmV2aW91c1xuICAgICAgICAgICAgICAgIC8vIGZ1bmN0aW9uLWNhbGxiYWNrIGZvcm0gcmV0dXJuZWQgYGFyZ3MucmVwbGFjZWAgbGl0ZXJhbGx5LFxuICAgICAgICAgICAgICAgIC8vIGJyZWFraW5nIHRoZSBkb2N1bWVudGVkIGJhY2tyZWZlcmVuY2UgYmVoYXZpb3VyLiBDb3VudFxuICAgICAgICAgICAgICAgIC8vIG1hdGNoZXMgc2VwYXJhdGVseSB2aWEgYSBwYXJhbGxlbCBtYXRjaCgpIHBhc3Mgc2luY2Ugd2VcbiAgICAgICAgICAgICAgICAvLyBubyBsb25nZXIgaGF2ZSB0aGUgcGVyLWNhbGwgY291bnRlci5cbiAgICAgICAgICAgICAgICBjb25zdCBtYXRjaGVzID0gY29udGVudC5tYXRjaChyZWdleCk7XG4gICAgICAgICAgICAgICAgcmVwbGFjZW1lbnRzID0gbWF0Y2hlcyA/IG1hdGNoZXMubGVuZ3RoIDogMDtcbiAgICAgICAgICAgICAgICBuZXdDb250ZW50ID0gY29udGVudC5yZXBsYWNlKHJlZ2V4LCBhcmdzLnJlcGxhY2UpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChhcmdzLnJlcGxhY2VBbGwpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBwYXJ0cyA9IGNvbnRlbnQuc3BsaXQoYXJncy5zZWFyY2gpO1xuICAgICAgICAgICAgICAgIHJlcGxhY2VtZW50cyA9IHBhcnRzLmxlbmd0aCAtIDE7XG4gICAgICAgICAgICAgICAgbmV3Q29udGVudCA9IHBhcnRzLmpvaW4oYXJncy5yZXBsYWNlKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc3QgaWR4ID0gY29udGVudC5pbmRleE9mKGFyZ3Muc2VhcmNoKTtcbiAgICAgICAgICAgICAgICBpZiAoaWR4ID09PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gb2soeyBmaWxlOiByLnJlbFByb2plY3QsIHJlcGxhY2VtZW50czogMCB9LCAnTm8gb2NjdXJyZW5jZXMgZm91bmQ7IGZpbGUgdW5jaGFuZ2VkLicpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXBsYWNlbWVudHMgPSAxO1xuICAgICAgICAgICAgICAgIG5ld0NvbnRlbnQgPSBjb250ZW50LnNsaWNlKDAsIGlkeCkgKyBhcmdzLnJlcGxhY2UgKyBjb250ZW50LnNsaWNlKGlkeCArIGFyZ3Muc2VhcmNoLmxlbmd0aCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChgZmlsZS1lZGl0b3I6IHJlcGxhY2UgZmFpbGVkOiAke2Vycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKX1gKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAocmVwbGFjZW1lbnRzID09PSAwKSB7XG4gICAgICAgICAgICByZXR1cm4gb2soeyBmaWxlOiByLnJlbFByb2plY3QsIHJlcGxhY2VtZW50czogMCB9LCAnTm8gb2NjdXJyZW5jZXMgZm91bmQ7IGZpbGUgdW5jaGFuZ2VkLicpO1xuICAgICAgICB9XG4gICAgICAgIGZzLndyaXRlRmlsZVN5bmMoci5hYnMsIG5ld0NvbnRlbnQsICd1dGYtOCcpO1xuICAgICAgICBhd2FpdCByZWZyZXNoQXNzZXREYihyLmFicyk7XG4gICAgICAgIHJldHVybiBvayh7IGZpbGU6IHIucmVsUHJvamVjdCwgcmVwbGFjZW1lbnRzIH0sIGBSZXBsYWNlZCAke3JlcGxhY2VtZW50c30gb2NjdXJyZW5jZShzKSBpbiAke3IucmVsUHJvamVjdH1gKTtcbiAgICB9LFxufTtcblxuY29uc3QgcXVlcnlUZXh0OiBUb29sRGVmID0ge1xuICAgIG5hbWU6ICdxdWVyeV90ZXh0JyxcbiAgICB0aXRsZTogJ1JlYWQgbGluZSByYW5nZScsXG4gICAgZGVzY3JpcHRpb246IFJFRFVOREFOVF9UQUcgKyAnUmVhZCBhIHJhbmdlIG9mIGxpbmVzICgxLWJhc2VkLCBpbmNsdXNpdmUpLiBSZXR1cm5zIGxpbmVzIHdpdGggbGluZSBudW1iZXJzOyB0b3RhbCBsaW5lIGNvdW50IG9mIGZpbGUgaW4gZGF0YS50b3RhbExpbmVzLiBSZWFkLW9ubHk7IG5vIGFzc2V0LWRiIHJlZnJlc2guJyxcbiAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICBmaWxlUGF0aDogei5zdHJpbmcoKS5kZXNjcmliZSgnUGF0aCB0byB0aGUgZmlsZSAoYWJzb2x1dGUgb3IgcHJvamVjdC1yZWxhdGl2ZSkuJyksXG4gICAgICAgIHN0YXJ0TGluZTogei5udW1iZXIoKS5pbnQoKS5taW4oMSkub3B0aW9uYWwoKS5kZXNjcmliZSgnRmlyc3QgbGluZSB0byByZWFkICgxLWJhc2VkKS4gRGVmYXVsdCAxLicpLFxuICAgICAgICBlbmRMaW5lOiB6Lm51bWJlcigpLmludCgpLm1pbigxKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdMYXN0IGxpbmUgdG8gcmVhZCAoMS1iYXNlZCwgaW5jbHVzaXZlKS4gRGVmYXVsdCBlbmQgb2YgZmlsZS4nKSxcbiAgICB9KSxcbiAgICBoYW5kbGVyOiBhc3luYyAoYXJncyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiA9PiB7XG4gICAgICAgIGNvbnN0IHIgPSByZXNvbHZlUGF0aEZvclJlYWQoYXJncy5maWxlUGF0aCk7XG4gICAgICAgIGlmICgnZXJyb3InIGluIHIpIHJldHVybiBmYWlsKHIuZXJyb3IpO1xuICAgICAgICBjb25zdCBzdGF0ID0gZnMuc3RhdFN5bmMoci5hYnMpO1xuICAgICAgICBpZiAoc3RhdC5zaXplID4gRklMRV9SRUFEX0JZVEVfQ0FQKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChgZmlsZS1lZGl0b3I6IGZpbGUgdG9vIGxhcmdlICgke3N0YXQuc2l6ZX0gYnl0ZXMpOyByZWZ1c2luZyB0byByZWFkLmApO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGNvbnRlbnQgPSBmcy5yZWFkRmlsZVN5bmMoci5hYnMsICd1dGYtOCcpO1xuICAgICAgICBjb25zdCB7IGxpbmVzLCBlb2wgfSA9IHNwbGl0TGluZXNOb3JtYWxpemVkKGNvbnRlbnQpO1xuICAgICAgICBjb25zdCB0b3RhbExpbmVzID0gbGluZXMubGVuZ3RoO1xuICAgICAgICBjb25zdCBmcm9tID0gKGFyZ3Muc3RhcnRMaW5lID8/IDEpIC0gMTtcbiAgICAgICAgY29uc3QgdG8gPSBhcmdzLmVuZExpbmUgPz8gdG90YWxMaW5lcztcbiAgICAgICAgaWYgKGZyb20gPj0gdG90YWxMaW5lcykge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoYGZpbGUtZWRpdG9yOiBzdGFydExpbmUgJHthcmdzLnN0YXJ0TGluZSA/PyAxfSBwYXN0IEVPRiAoZmlsZSBoYXMgJHt0b3RhbExpbmVzfSBsaW5lcylgKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoYXJncy5zdGFydExpbmUgIT09IHVuZGVmaW5lZCAmJiBhcmdzLmVuZExpbmUgIT09IHVuZGVmaW5lZCAmJiBhcmdzLnN0YXJ0TGluZSA+IGFyZ3MuZW5kTGluZSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ2ZpbGUtZWRpdG9yOiBzdGFydExpbmUgbXVzdCBiZSA8PSBlbmRMaW5lJyk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qgc2xpY2VkID0gbGluZXMuc2xpY2UoZnJvbSwgdG8pO1xuICAgICAgICBjb25zdCByZXN1bHQgPSBzbGljZWQubWFwKCh0ZXh0LCBpKSA9PiAoeyBsaW5lOiBmcm9tICsgaSArIDEsIHRleHQgfSkpO1xuICAgICAgICByZXR1cm4gb2soeyBmaWxlOiByLnJlbFByb2plY3QsIHRvdGFsTGluZXMsIHN0YXJ0TGluZTogZnJvbSArIDEsIGVuZExpbmU6IGZyb20gKyByZXN1bHQubGVuZ3RoLCBlb2w6IGVvbCA9PT0gJ1xcclxcbicgPyAnQ1JMRicgOiAnTEYnLCBsaW5lczogcmVzdWx0IH0sIGBSZWFkICR7cmVzdWx0Lmxlbmd0aH0gbGluZShzKSBmcm9tICR7ci5yZWxQcm9qZWN0fWApO1xuICAgIH0sXG59O1xuXG5leHBvcnQgY2xhc3MgRmlsZUVkaXRvclRvb2xzIHtcbiAgICBwcml2YXRlIGltcGwgPSBkZWZpbmVUb29scyhbXG4gICAgICAgIGluc2VydFRleHQsXG4gICAgICAgIGRlbGV0ZUxpbmVzLFxuICAgICAgICByZXBsYWNlVGV4dCxcbiAgICAgICAgcXVlcnlUZXh0LFxuICAgIF0pO1xuXG4gICAgZ2V0VG9vbHMoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmltcGwuZ2V0VG9vbHMoKTtcbiAgICB9XG5cbiAgICBleGVjdXRlKHRvb2xOYW1lOiBzdHJpbmcsIGFyZ3M6IGFueSkge1xuICAgICAgICByZXR1cm4gdGhpcy5pbXBsLmV4ZWN1dGUodG9vbE5hbWUsIGFyZ3MpO1xuICAgIH1cbn1cbiJdfQ==