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
        resolvedAbs = fs.realpathSync.native(absRaw);
    }
    catch (_a) {
        return { error: `file-editor: file not found or unreadable: ${absRaw}` };
    }
    let projectAbs;
    try {
        projectAbs = fs.realpathSync.native(projectPath);
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
        const lines = content.split('\n');
        const insertIndex = args.line - 1;
        if (insertIndex >= lines.length) {
            lines.push(args.text);
        }
        else {
            lines.splice(insertIndex, 0, args.text);
        }
        try {
            fs.writeFileSync(r.abs, lines.join('\n'), 'utf-8');
        }
        catch (err) {
            return { success: false, error: (_b = err === null || err === void 0 ? void 0 : err.message) !== null && _b !== void 0 ? _b : String(err) };
        }
        await refreshAssetDb(r.abs);
        return {
            success: true,
            message: `Inserted text at line ${Math.min(args.line, lines.length)} of ${r.relProject}`,
            data: { file: r.relProject, totalLines: lines.length },
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
        const lines = content.split('\n');
        const deleteStart = args.startLine - 1;
        const requestedCount = args.endLine - args.startLine + 1;
        const deletedCount = Math.max(0, Math.min(requestedCount, lines.length - deleteStart));
        if (deletedCount === 0) {
            return { success: false, error: `file-editor: range ${args.startLine}-${args.endLine} is past EOF (file has ${lines.length} lines)` };
        }
        lines.splice(deleteStart, deletedCount);
        try {
            fs.writeFileSync(r.abs, lines.join('\n'), 'utf-8');
        }
        catch (err) {
            return { success: false, error: (_b = err === null || err === void 0 ? void 0 : err.message) !== null && _b !== void 0 ? _b : String(err) };
        }
        await refreshAssetDb(r.abs);
        return {
            success: true,
            message: `Deleted ${deletedCount} line(s) from line ${args.startLine} to ${args.startLine + deletedCount - 1} of ${r.relProject}`,
            data: { file: r.relProject, deletedCount, totalLines: lines.length },
        };
    },
};
const replaceText = {
    name: 'replace_text',
    description: REDUNDANT_TAG + 'Find/replace text in a file. Plain string by default; pass useRegex:true to interpret search as a regex. Replaces first occurrence only unless replaceAll:true. Triggers cocos asset-db refresh.',
    inputSchema: schema_1.z.object({
        filePath: schema_1.z.string().describe('Path to the file (absolute or project-relative).'),
        search: schema_1.z.string().describe('Search text or regex pattern (depends on useRegex).'),
        replace: schema_1.z.string().describe('Replacement text. Regex backreferences ($1, $&) work when useRegex:true.'),
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
                newContent = content.replace(regex, () => { replacements++; return args.replace; });
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
        const lines = content.split('\n');
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
            data: { file: r.relProject, totalLines, startLine: from + 1, endLine: from + result.length, lines: result },
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmlsZS1lZGl0b3ItdG9vbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvdG9vbHMvZmlsZS1lZGl0b3ItdG9vbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBeUJHOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFFSCx1Q0FBeUI7QUFDekIsMkNBQTZCO0FBRTdCLDBDQUFrQztBQUNsQyxzREFBMkQ7QUFDM0Qsb0NBQW9DO0FBRXBDLE1BQU0sYUFBYSxHQUFHLDBFQUEwRSxDQUFDO0FBRWpHLG1FQUFtRTtBQUNuRSx1Q0FBdUM7QUFDdkMsTUFBTSxrQkFBa0IsR0FBRyxDQUFDLEdBQUcsSUFBSSxHQUFHLElBQUksQ0FBQztBQUkzQyxTQUFTLGNBQWM7O0lBQ25CLElBQUksQ0FBQztRQUNELE9BQU8sTUFBQSxNQUFBLE1BQU0sYUFBTixNQUFNLHVCQUFOLE1BQU0sQ0FBRSxPQUFPLDBDQUFFLElBQUksbUNBQUksSUFBSSxDQUFDO0lBQ3pDLENBQUM7SUFBQyxXQUFNLENBQUM7UUFDTCxPQUFPLElBQUksQ0FBQztJQUNoQixDQUFDO0FBQ0wsQ0FBQztBQUVEOzs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FrQkc7QUFDSCxTQUFTLGtCQUFrQixDQUFDLE1BQWM7SUFDdEMsTUFBTSxXQUFXLEdBQUcsY0FBYyxFQUFFLENBQUM7SUFDckMsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBQ2YsT0FBTyxFQUFFLEtBQUssRUFBRSxrRUFBa0UsRUFBRSxDQUFDO0lBQ3pGLENBQUM7SUFDRCxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFLE1BQU0sQ0FBQyxDQUFDO0lBQ2pGLElBQUksV0FBbUIsQ0FBQztJQUN4QixJ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LEVBQUUsSUFBSSxHQUFHLENBQUMsRUFBRSxPQUFPLEVBQUUsSUFBSSxHQUFHLE1BQU0sQ0FBQyxNQUFNLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRTtTQUM5RyxDQUFDO0lBQ04sQ0FBQztDQUNKLENBQUM7QUFFRixNQUFhLGVBQWU7SUFBNUI7UUFDWSxTQUFJLEdBQUcsSUFBQSwwQkFBVyxFQUFDO1lBQ3ZCLFVBQVU7WUFDVixXQUFXO1lBQ1gsV0FBVztZQUNYLFNBQVM7U0FDWixDQUFDLENBQUM7SUFTUCxDQUFDO0lBUEcsUUFBUTtRQUNKLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztJQUNoQyxDQUFDO0lBRUQsT0FBTyxDQUFDLFFBQWdCLEVBQUUsSUFBUztRQUMvQixPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQztJQUM3QyxDQUFDO0NBQ0o7QUFmRCwwQ0FlQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogZmlsZS1lZGl0b3ItdG9vbHMg4oCUIGhvc3Qtc2lkZSBmcyBvcGVyYXRpb25zIGZvciBjbGllbnRzIHdpdGhvdXRcbiAqIG5hdGl2ZSBmaWxlIGVkaXRpbmcuXG4gKlxuICogRm91ciB0b29scyAoU3BheWRvIGNvY29zLW1jcC1leHRlbnNpb24gcm91dGUsIGhhcmRlbmVkKTpcbiAqICAgLSBmaWxlX2VkaXRvcl9pbnNlcnRfdGV4dCAgIOKAlCBpbnNlcnQgYXQgMS1iYXNlZCBsaW5lXG4gKiAgIC0gZmlsZV9lZGl0b3JfZGVsZXRlX2xpbmVzICDigJQgZGVsZXRlIHJhbmdlLCAxLWJhc2VkIGluY2x1c2l2ZVxuICogICAtIGZpbGVfZWRpdG9yX3JlcGxhY2VfdGV4dCAg4oCUIGZpbmQvcmVwbGFjZSwgcGxhaW4gb3IgcmVnZXhcbiAqICAgLSBmaWxlX2VkaXRvcl9xdWVyeV90ZXh0ICAgIOKAlCByZWFkIHJhbmdlLCAxLWJhc2VkXG4gKlxuICogV2h5IHdlIHNoaXAgdGhlc2UgZXZlbiB0aG91Z2ggQ2xhdWRlIENvZGUgYWxyZWFkeSBoYXMgRWRpdC9Xcml0ZTpcbiAqICAgTXVsdGktY2xpZW50IGJyZWFkdGguIENsYXVkZSBEZXNrdG9wIC8gQ2xpbmUgLyBDb250aW51ZSBoYXZlIG5vXG4gKiAgIG5hdGl2ZSBmaWxlIG9wczsgQUkgb24gdGhvc2UgY2xpZW50cyBtdXN0IGdvIHRocm91Z2ggdGhlIE1DUFxuICogICBzZXJ2ZXIuIFRvb2wgZGVzY3JpcHRpb25zIGNhcnJ5IFtjbGF1ZGUtY29kZS1yZWR1bmRhbnRdIHNvIHRoZVxuICogICByYW5rZXIgb24gQ2xhdWRlIENvZGUgcHJlZmVycyB0aGUgSURFIHRvb2wuXG4gKlxuICogU3BheWRvJ3MgdXBzdHJlYW0gaGFkIHR3byBnYXBzIHdlIGNsb3NlOlxuICogICAxLiBwYXRoLXNhZmV0eSBndWFyZCB2aWEgcGxhaW4gYHBhdGgucmVzb2x2ZSArIHN0YXJ0c1dpdGhgIGlzXG4gKiAgICAgIHN5bWxpbmstdW5zYWZlIOKAlCBhIHN5bWxpbmsgaW5zaWRlIHRoZSBwcm9qZWN0IHBvaW50aW5nXG4gKiAgICAgIG91dHNpZGUgc3RpbGwgcGFzc2VzLiBVc2UgYGZzLnJlYWxwYXRoU3luYy5uYXRpdmVgIG9uIGJvdGhcbiAqICAgICAgc2lkZXMgKHNhbWUgZml4IHYyLjQuOSBhcHBsaWVkIHRvIGRlYnVnX2dldF9zY3JpcHRfZGlhZ25vc3RpY19jb250ZXh0KS5cbiAqICAgMi4gYXNzZXQtZGIgcmVmcmVzaCBob29rIG1pc3Npbmc6IGNvY29zIGVkaXRvciBkb2Vzbid0IHJlaW1wb3J0XG4gKiAgICAgIGEgLnRzLy5qcyB1bnRpbCBhc3NldC1kYiBzZWVzIGEgcmVmcmVzaCBldmVudC4gQ2FsbFxuICogICAgICBgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncmVmcmVzaCcsIGFic1BhdGgpYCBhZnRlclxuICogICAgICBldmVyeSB3cml0ZSBzbyB0aGUgZWRpdG9yIHBpY2tzIHVwIHRoZSBjaGFuZ2UuXG4gKi9cblxuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB0eXBlIHsgVG9vbFJlc3BvbnNlIH0gZnJvbSAnLi4vdHlwZXMnO1xuaW1wb3J0IHsgeiB9IGZyb20gJy4uL2xpYi9zY2hlbWEnO1xuaW1wb3J0IHsgZGVmaW5lVG9vbHMsIFRvb2xEZWYgfSBmcm9tICcuLi9saWIvZGVmaW5lLXRvb2xzJztcbmltcG9ydCB7IGxvZ2dlciB9IGZyb20gJy4uL2xpYi9sb2cnO1xuXG5jb25zdCBSRURVTkRBTlRfVEFHID0gJ1tjbGF1ZGUtY29kZS1yZWR1bmRhbnRdIFVzZSBFZGl0L1dyaXRlIHRvb2wgZnJvbSB5b3VyIElERSBpZiBhdmFpbGFibGUuICc7XG5cbi8vIFJlYWQgY2FwIHRvIGtlZXAgdG9vbCByZXN1bHQgcmVhc29uYWJsZTsgbWF0Y2hlcyB0aGUgY2FwIHVzZWQgYnlcbi8vIGRlYnVnX2dldF9zY3JpcHRfZGlhZ25vc3RpY19jb250ZXh0LlxuY29uc3QgRklMRV9SRUFEX0JZVEVfQ0FQID0gNSAqIDEwMjQgKiAxMDI0O1xuXG5pbnRlcmZhY2UgUmVzb2x2ZWRQYXRoIHsgYWJzOiBzdHJpbmc7IHJlbFByb2plY3Q6IHN0cmluZzsgfVxuXG5mdW5jdGlvbiBnZXRQcm9qZWN0UGF0aCgpOiBzdHJpbmcgfCBudWxsIHtcbiAgICB0cnkge1xuICAgICAgICByZXR1cm4gRWRpdG9yPy5Qcm9qZWN0Py5wYXRoID8/IG51bGw7XG4gICAgfSBjYXRjaCB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbn1cblxuLyoqXG4gKiBSZXNvbHZlIGEgdXNlci1zdXBwbGllZCBwYXRoIHRvIGFuIGFic29sdXRlLCBzeW1saW5rLXNhZmUgcGF0aFxuICogaW5zaWRlIHRoZSBwcm9qZWN0LiBSZXR1cm5zIHRoZSByZXNvbHZlZCBhYnNvbHV0ZSBwYXRoICsgdGhlXG4gKiBwcm9qZWN0LXJlbGF0aXZlIGZvcm0gKGZvciBmcmllbmRseSBtZXNzYWdlcykuIFRocm93cy1zdHlsZVxuICogeyBlcnJvciB9IGVudmVsb3BlIGZvciBjYWxsZXJzIHRvIHNob3J0LWNpcmN1aXQgb24uXG4gKlxuICogUGF0aCBzYWZldHk6XG4gKiAgIDEuIElmIGB0YXJnZXRgIGlzIHJlbGF0aXZlLCBqb2luZWQgdG8gcHJvamVjdFBhdGg7IGlmIGFic29sdXRlLFxuICogICAgICB1c2VkIGFzLWlzLlxuICogICAyLiBCb3RoIHRhcmdldCBhbmQgcHJvamVjdCByb290IGdvIHRocm91Z2ggYGZzLnJlYWxwYXRoU3luYy5uYXRpdmVgXG4gKiAgICAgIHNvIHN5bWxpbmtzIGFyZSBmb2xsb3dlZCBiZWZvcmUgdGhlIHByZWZpeCBjaGVjay5cbiAqICAgMy4gQ2FzZS1pbnNlbnNpdGl2ZSBjb21wYXJpc29uIG9uIFdpbmRvd3M7IGNhc2Utc2Vuc2l0aXZlIG9uIFBPU0lYLlxuICogICA0LiBTZXAgZ3VhcmQgYWdhaW5zdCBgL3Byb2otZm9vYCB2cyBgL3Byb2pgIHByZWZpeCBjb25mdXNpb24uXG4gKlxuICogQ2FsbGVyIE1VU1QgaGFuZGxlIHRoZSBtaXNzaW5nLXRhcmdldCBjYXNlIGZvciB3cml0ZSBvcGVyYXRpb25zXG4gKiAoaW5zZXJ0L3JlcGxhY2UvZGVsZXRlKSDigJQgd2Ugc3RpbGwgd2FudCB0byB3cml0ZSB0byBhIG5vbi1leGlzdGVudFxuICogZmlsZSB2aWEgdGhlIHJlbGF0aXZlLXBhdGggZmFsbGJhY2sgd2hlbiB0aGUgcGFyZW50IGRpcmVjdG9yeVxuICogZXhpc3RzLiBTZWUgYHJlc29sdmVQYXRoRm9yV3JpdGVgIGJlbG93LlxuICovXG5mdW5jdGlvbiByZXNvbHZlUGF0aEZvclJlYWQodGFyZ2V0OiBzdHJpbmcpOiBSZXNvbHZlZFBhdGggfCB7IGVycm9yOiBzdHJpbmcgfSB7XG4gICAgY29uc3QgcHJvamVjdFBhdGggPSBnZXRQcm9qZWN0UGF0aCgpO1xuICAgIGlmICghcHJvamVjdFBhdGgpIHtcbiAgICAgICAgcmV0dXJuIHsgZXJyb3I6ICdmaWxlLWVkaXRvcjogZWRpdG9yIGNvbnRleHQgdW5hdmFpbGFibGUgKG5vIEVkaXRvci5Qcm9qZWN0LnBhdGgpJyB9O1xuICAgIH1cbiAgICBjb25zdCBhYnNSYXcgPSBwYXRoLmlzQWJzb2x1dGUodGFyZ2V0KSA/IHRhcmdldCA6IHBhdGguam9pbihwcm9qZWN0UGF0aCwgdGFyZ2V0KTtcbiAgICBsZXQgcmVzb2x2ZWRBYnM6IHN0cmluZztcbiAgICB0cnkge1xuICAgICAgICByZXNvbHZlZEFicyA9IGZzLnJlYWxwYXRoU3luYy5uYXRpdmUoYWJzUmF3KTtcbiAgICB9IGNhdGNoIHtcbiAgICAgICAgcmV0dXJuIHsgZXJyb3I6IGBmaWxlLWVkaXRvcjogZmlsZSBub3QgZm91bmQgb3IgdW5yZWFkYWJsZTogJHthYnNSYXd9YCB9O1xuICAgIH1cbiAgICBsZXQgcHJvamVjdEFiczogc3RyaW5nO1xuICAgIHRyeSB7XG4gICAgICAgIHByb2plY3RBYnMgPSBmcy5yZWFscGF0aFN5bmMubmF0aXZlKHByb2plY3RQYXRoKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgICAgcHJvamVjdEFicyA9IHBhdGgucmVzb2x2ZShwcm9qZWN0UGF0aCk7XG4gICAgfVxuICAgIGNvbnN0IGNtcCA9IHByb2Nlc3MucGxhdGZvcm0gPT09ICd3aW4zMidcbiAgICAgICAgPyB7IHJlc29sdmVkOiByZXNvbHZlZEFicy50b0xvd2VyQ2FzZSgpLCBwcm9qZWN0OiBwcm9qZWN0QWJzLnRvTG93ZXJDYXNlKCkgfVxuICAgICAgICA6IHsgcmVzb2x2ZWQ6IHJlc29sdmVkQWJzLCBwcm9qZWN0OiBwcm9qZWN0QWJzIH07XG4gICAgaWYgKCFjbXAucmVzb2x2ZWQuc3RhcnRzV2l0aChjbXAucHJvamVjdCArIHBhdGguc2VwKSAmJiBjbXAucmVzb2x2ZWQgIT09IGNtcC5wcm9qZWN0KSB7XG4gICAgICAgIHJldHVybiB7IGVycm9yOiBgZmlsZS1lZGl0b3I6IHBhdGggJHtyZXNvbHZlZEFic30gcmVzb2x2ZXMgb3V0c2lkZSB0aGUgcHJvamVjdCByb290IChzeW1saW5rLWF3YXJlIGNoZWNrKWAgfTtcbiAgICB9XG4gICAgcmV0dXJuIHsgYWJzOiByZXNvbHZlZEFicywgcmVsUHJvamVjdDogcGF0aC5yZWxhdGl2ZShwcm9qZWN0QWJzLCByZXNvbHZlZEFicykgfTtcbn1cblxuY29uc3QgQVNTRVRfUkVGUkVTSF9FWFRTID0gbmV3IFNldChbJy50cycsICcudHN4JywgJy5qcycsICcuanN4JywgJy5qc29uJywgJy5maXJlJywgJy5zY2VuZScsICcucHJlZmFiJywgJy5hbmltJywgJy5tYXRlcmlhbCcsICcuZWZmZWN0JywgJy5mbnQnXSk7XG5cbi8qKlxuICogQmVzdC1lZmZvcnQ6IHRlbGwgY29jb3MgYXNzZXQtZGIgdGhhdCB0aGUgZmlsZSBjaGFuZ2VkIHNvIHRoZSBlZGl0b3JcbiAqIHBpY2tzIGl0IHVwIHdpdGhvdXQgYSBtYW51YWwgcmVmcmVzaC4gRmFpbHVyZSBpcyBub24tZmF0YWwgYmVjYXVzZVxuICogdGhlIGZpbGUgaXMgYWxyZWFkeSB3cml0dGVuOyB0aGUgdXNlciBjYW4gaGl0IHJlZnJlc2ggbWFudWFsbHkuXG4gKlxuICogT25seSBmaXJlcyBmb3IgZmlsZSBleHRlbnNpb25zIGNvY29zIGNhcmVzIGFib3V0IChUUyBzb3VyY2UsIEpTT05cbiAqIGNvbmZpZ3MsIHNjZW5lL3ByZWZhYi9hbmltIGFzc2V0cywgZXRjLikgc28gcGxhaW4gLnR4dCBlZGl0cyBkb24ndFxuICogc3BhbSB0aGUgYXNzZXQtZGIuXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIHJlZnJlc2hBc3NldERiKGFic1BhdGg6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IGV4dCA9IHBhdGguZXh0bmFtZShhYnNQYXRoKS50b0xvd2VyQ2FzZSgpO1xuICAgIGlmICghQVNTRVRfUkVGUkVTSF9FWFRTLmhhcyhleHQpKSByZXR1cm47XG4gICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncmVmcmVzaC1hc3NldCcsIGFic1BhdGgpO1xuICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgIGxvZ2dlci5kZWJ1ZygnW0ZpbGVFZGl0b3JdIGFzc2V0LWRiIHJlZnJlc2gtYXNzZXQgZmFpbGVkIChub24tZmF0YWwpOicsIGVycj8ubWVzc2FnZSA/PyBlcnIpO1xuICAgIH1cbn1cblxuY29uc3QgaW5zZXJ0VGV4dDogVG9vbERlZiA9IHtcbiAgICBuYW1lOiAnaW5zZXJ0X3RleHQnLFxuICAgIGRlc2NyaXB0aW9uOiBSRURVTkRBTlRfVEFHICsgJ0luc2VydCBhIG5ldyBsaW5lIGF0IHRoZSBnaXZlbiAxLWJhc2VkIGxpbmUgbnVtYmVyLiBJZiBsaW5lIGV4Y2VlZHMgdG90YWwsIHRleHQgaXMgYXBwZW5kZWQgYXQgZW5kIG9mIGZpbGUuIFRyaWdnZXJzIGNvY29zIGFzc2V0LWRiIHJlZnJlc2ggb24gY29jb3MtcmVjb2duaXNlZCBleHRlbnNpb25zICgudHMvLmpzb24vLnNjZW5lLy5wcmVmYWIvZXRjLikgc28gdGhlIGVkaXRvciByZWltcG9ydHMuJyxcbiAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICBmaWxlUGF0aDogei5zdHJpbmcoKS5kZXNjcmliZSgnUGF0aCB0byB0aGUgZmlsZSAoYWJzb2x1dGUgb3IgcHJvamVjdC1yZWxhdGl2ZSkuJyksXG4gICAgICAgIGxpbmU6IHoubnVtYmVyKCkuaW50KCkubWluKDEpLmRlc2NyaWJlKCcxLWJhc2VkIGxpbmUgbnVtYmVyIHRvIGluc2VydCBhdDsgZXhpc3RpbmcgbGluZXMgc2hpZnQgZG93bi4nKSxcbiAgICAgICAgdGV4dDogei5zdHJpbmcoKS5kZXNjcmliZSgnVGV4dCB0byBpbnNlcnQgYXMgYSBuZXcgbGluZSAobm8gdHJhaWxpbmcgbmV3bGluZSBleHBlY3RlZCkuJyksXG4gICAgfSksXG4gICAgaGFuZGxlcjogYXN5bmMgKGFyZ3MpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4gPT4ge1xuICAgICAgICBjb25zdCByID0gcmVzb2x2ZVBhdGhGb3JSZWFkKGFyZ3MuZmlsZVBhdGgpO1xuICAgICAgICBpZiAoJ2Vycm9yJyBpbiByKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHIuZXJyb3IgfTtcbiAgICAgICAgbGV0IGNvbnRlbnQ6IHN0cmluZztcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHN0YXQgPSBmcy5zdGF0U3luYyhyLmFicyk7XG4gICAgICAgICAgICBpZiAoc3RhdC5zaXplID4gRklMRV9SRUFEX0JZVEVfQ0FQKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgZmlsZS1lZGl0b3I6IGZpbGUgdG9vIGxhcmdlICgke3N0YXQuc2l6ZX0gYnl0ZXMpOyByZWZ1c2luZyB0byByZWFkLmAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnRlbnQgPSBmcy5yZWFkRmlsZVN5bmMoci5hYnMsICd1dGYtOCcpO1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycikgfTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBsaW5lcyA9IGNvbnRlbnQuc3BsaXQoJ1xcbicpO1xuICAgICAgICBjb25zdCBpbnNlcnRJbmRleCA9IGFyZ3MubGluZSAtIDE7XG4gICAgICAgIGlmIChpbnNlcnRJbmRleCA+PSBsaW5lcy5sZW5ndGgpIHtcbiAgICAgICAgICAgIGxpbmVzLnB1c2goYXJncy50ZXh0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxpbmVzLnNwbGljZShpbnNlcnRJbmRleCwgMCwgYXJncy50ZXh0KTtcbiAgICAgICAgfVxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgZnMud3JpdGVGaWxlU3luYyhyLmFicywgbGluZXMuam9pbignXFxuJyksICd1dGYtOCcpO1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycikgfTtcbiAgICAgICAgfVxuICAgICAgICBhd2FpdCByZWZyZXNoQXNzZXREYihyLmFicyk7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgbWVzc2FnZTogYEluc2VydGVkIHRleHQgYXQgbGluZSAke01hdGgubWluKGFyZ3MubGluZSwgbGluZXMubGVuZ3RoKX0gb2YgJHtyLnJlbFByb2plY3R9YCxcbiAgICAgICAgICAgIGRhdGE6IHsgZmlsZTogci5yZWxQcm9qZWN0LCB0b3RhbExpbmVzOiBsaW5lcy5sZW5ndGggfSxcbiAgICAgICAgfTtcbiAgICB9LFxufTtcblxuY29uc3QgZGVsZXRlTGluZXM6IFRvb2xEZWYgPSB7XG4gICAgbmFtZTogJ2RlbGV0ZV9saW5lcycsXG4gICAgZGVzY3JpcHRpb246IFJFRFVOREFOVF9UQUcgKyAnRGVsZXRlIGEgcmFuZ2Ugb2YgbGluZXMgKDEtYmFzZWQsIGluY2x1c2l2ZSkuIFRyaWdnZXJzIGNvY29zIGFzc2V0LWRiIHJlZnJlc2guJyxcbiAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICBmaWxlUGF0aDogei5zdHJpbmcoKS5kZXNjcmliZSgnUGF0aCB0byB0aGUgZmlsZSAoYWJzb2x1dGUgb3IgcHJvamVjdC1yZWxhdGl2ZSkuJyksXG4gICAgICAgIHN0YXJ0TGluZTogei5udW1iZXIoKS5pbnQoKS5taW4oMSkuZGVzY3JpYmUoJ0ZpcnN0IGxpbmUgdG8gZGVsZXRlICgxLWJhc2VkLCBpbmNsdXNpdmUpLicpLFxuICAgICAgICBlbmRMaW5lOiB6Lm51bWJlcigpLmludCgpLm1pbigxKS5kZXNjcmliZSgnTGFzdCBsaW5lIHRvIGRlbGV0ZSAoMS1iYXNlZCwgaW5jbHVzaXZlKS4gTXVzdCBiZSA+PSBzdGFydExpbmUuJyksXG4gICAgfSksXG4gICAgaGFuZGxlcjogYXN5bmMgKGFyZ3MpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4gPT4ge1xuICAgICAgICBpZiAoYXJncy5zdGFydExpbmUgPiBhcmdzLmVuZExpbmUpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ2ZpbGUtZWRpdG9yOiBzdGFydExpbmUgbXVzdCBiZSA8PSBlbmRMaW5lJyB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHIgPSByZXNvbHZlUGF0aEZvclJlYWQoYXJncy5maWxlUGF0aCk7XG4gICAgICAgIGlmICgnZXJyb3InIGluIHIpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogci5lcnJvciB9O1xuICAgICAgICBsZXQgY29udGVudDogc3RyaW5nO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3Qgc3RhdCA9IGZzLnN0YXRTeW5jKHIuYWJzKTtcbiAgICAgICAgICAgIGlmIChzdGF0LnNpemUgPiBGSUxFX1JFQURfQllURV9DQVApIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBmaWxlLWVkaXRvcjogZmlsZSB0b28gbGFyZ2UgKCR7c3RhdC5zaXplfSBieXRlcyk7IHJlZnVzaW5nIHRvIHJlYWQuYCB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29udGVudCA9IGZzLnJlYWRGaWxlU3luYyhyLmFicywgJ3V0Zi04Jyk7XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKSB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGxpbmVzID0gY29udGVudC5zcGxpdCgnXFxuJyk7XG4gICAgICAgIGNvbnN0IGRlbGV0ZVN0YXJ0ID0gYXJncy5zdGFydExpbmUgLSAxO1xuICAgICAgICBjb25zdCByZXF1ZXN0ZWRDb3VudCA9IGFyZ3MuZW5kTGluZSAtIGFyZ3Muc3RhcnRMaW5lICsgMTtcbiAgICAgICAgY29uc3QgZGVsZXRlZENvdW50ID0gTWF0aC5tYXgoMCwgTWF0aC5taW4ocmVxdWVzdGVkQ291bnQsIGxpbmVzLmxlbmd0aCAtIGRlbGV0ZVN0YXJ0KSk7XG4gICAgICAgIGlmIChkZWxldGVkQ291bnQgPT09IDApIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYGZpbGUtZWRpdG9yOiByYW5nZSAke2FyZ3Muc3RhcnRMaW5lfS0ke2FyZ3MuZW5kTGluZX0gaXMgcGFzdCBFT0YgKGZpbGUgaGFzICR7bGluZXMubGVuZ3RofSBsaW5lcylgIH07XG4gICAgICAgIH1cbiAgICAgICAgbGluZXMuc3BsaWNlKGRlbGV0ZVN0YXJ0LCBkZWxldGVkQ291bnQpO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgZnMud3JpdGVGaWxlU3luYyhyLmFicywgbGluZXMuam9pbignXFxuJyksICd1dGYtOCcpO1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycikgfTtcbiAgICAgICAgfVxuICAgICAgICBhd2FpdCByZWZyZXNoQXNzZXREYihyLmFicyk7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgbWVzc2FnZTogYERlbGV0ZWQgJHtkZWxldGVkQ291bnR9IGxpbmUocykgZnJvbSBsaW5lICR7YXJncy5zdGFydExpbmV9IHRvICR7YXJncy5zdGFydExpbmUgKyBkZWxldGVkQ291bnQgLSAxfSBvZiAke3IucmVsUHJvamVjdH1gLFxuICAgICAgICAgICAgZGF0YTogeyBmaWxlOiByLnJlbFByb2plY3QsIGRlbGV0ZWRDb3VudCwgdG90YWxMaW5lczogbGluZXMubGVuZ3RoIH0sXG4gICAgICAgIH07XG4gICAgfSxcbn07XG5cbmNvbnN0IHJlcGxhY2VUZXh0OiBUb29sRGVmID0ge1xuICAgIG5hbWU6ICdyZXBsYWNlX3RleHQnLFxuICAgIGRlc2NyaXB0aW9uOiBSRURVTkRBTlRfVEFHICsgJ0ZpbmQvcmVwbGFjZSB0ZXh0IGluIGEgZmlsZS4gUGxhaW4gc3RyaW5nIGJ5IGRlZmF1bHQ7IHBhc3MgdXNlUmVnZXg6dHJ1ZSB0byBpbnRlcnByZXQgc2VhcmNoIGFzIGEgcmVnZXguIFJlcGxhY2VzIGZpcnN0IG9jY3VycmVuY2Ugb25seSB1bmxlc3MgcmVwbGFjZUFsbDp0cnVlLiBUcmlnZ2VycyBjb2NvcyBhc3NldC1kYiByZWZyZXNoLicsXG4gICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgZmlsZVBhdGg6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1BhdGggdG8gdGhlIGZpbGUgKGFic29sdXRlIG9yIHByb2plY3QtcmVsYXRpdmUpLicpLFxuICAgICAgICBzZWFyY2g6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1NlYXJjaCB0ZXh0IG9yIHJlZ2V4IHBhdHRlcm4gKGRlcGVuZHMgb24gdXNlUmVnZXgpLicpLFxuICAgICAgICByZXBsYWNlOiB6LnN0cmluZygpLmRlc2NyaWJlKCdSZXBsYWNlbWVudCB0ZXh0LiBSZWdleCBiYWNrcmVmZXJlbmNlcyAoJDEsICQmKSB3b3JrIHdoZW4gdXNlUmVnZXg6dHJ1ZS4nKSxcbiAgICAgICAgdXNlUmVnZXg6IHouYm9vbGVhbigpLmRlZmF1bHQoZmFsc2UpLmRlc2NyaWJlKCdUcmVhdCBgc2VhcmNoYCBhcyBhIEpTIFJlZ0V4cCBzb3VyY2Ugc3RyaW5nLiBEZWZhdWx0IGZhbHNlLicpLFxuICAgICAgICByZXBsYWNlQWxsOiB6LmJvb2xlYW4oKS5kZWZhdWx0KGZhbHNlKS5kZXNjcmliZSgnUmVwbGFjZSBldmVyeSBvY2N1cnJlbmNlLiBEZWZhdWx0IGZhbHNlIChmaXJzdCBvbmx5KS4nKSxcbiAgICB9KSxcbiAgICBoYW5kbGVyOiBhc3luYyAoYXJncyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiA9PiB7XG4gICAgICAgIGNvbnN0IHIgPSByZXNvbHZlUGF0aEZvclJlYWQoYXJncy5maWxlUGF0aCk7XG4gICAgICAgIGlmICgnZXJyb3InIGluIHIpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogci5lcnJvciB9O1xuICAgICAgICBsZXQgY29udGVudDogc3RyaW5nO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3Qgc3RhdCA9IGZzLnN0YXRTeW5jKHIuYWJzKTtcbiAgICAgICAgICAgIGlmIChzdGF0LnNpemUgPiBGSUxFX1JFQURfQllURV9DQVApIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBmaWxlLWVkaXRvcjogZmlsZSB0b28gbGFyZ2UgKCR7c3RhdC5zaXplfSBieXRlcyk7IHJlZnVzaW5nIHRvIHJlYWQuYCB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29udGVudCA9IGZzLnJlYWRGaWxlU3luYyhyLmFicywgJ3V0Zi04Jyk7XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKSB9O1xuICAgICAgICB9XG4gICAgICAgIGxldCByZXBsYWNlbWVudHMgPSAwO1xuICAgICAgICBsZXQgbmV3Q29udGVudDogc3RyaW5nO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgaWYgKGFyZ3MudXNlUmVnZXgpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBmbGFncyA9IGFyZ3MucmVwbGFjZUFsbCA/ICdnJyA6ICcnO1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlZ2V4ID0gbmV3IFJlZ0V4cChhcmdzLnNlYXJjaCwgZmxhZ3MpO1xuICAgICAgICAgICAgICAgIG5ld0NvbnRlbnQgPSBjb250ZW50LnJlcGxhY2UocmVnZXgsICgpID0+IHsgcmVwbGFjZW1lbnRzKys7IHJldHVybiBhcmdzLnJlcGxhY2U7IH0pO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChhcmdzLnJlcGxhY2VBbGwpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBwYXJ0cyA9IGNvbnRlbnQuc3BsaXQoYXJncy5zZWFyY2gpO1xuICAgICAgICAgICAgICAgIHJlcGxhY2VtZW50cyA9IHBhcnRzLmxlbmd0aCAtIDE7XG4gICAgICAgICAgICAgICAgbmV3Q29udGVudCA9IHBhcnRzLmpvaW4oYXJncy5yZXBsYWNlKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc3QgaWR4ID0gY29udGVudC5pbmRleE9mKGFyZ3Muc2VhcmNoKTtcbiAgICAgICAgICAgICAgICBpZiAoaWR4ID09PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBtZXNzYWdlOiAnTm8gb2NjdXJyZW5jZXMgZm91bmQ7IGZpbGUgdW5jaGFuZ2VkLicsIGRhdGE6IHsgZmlsZTogci5yZWxQcm9qZWN0LCByZXBsYWNlbWVudHM6IDAgfSB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXBsYWNlbWVudHMgPSAxO1xuICAgICAgICAgICAgICAgIG5ld0NvbnRlbnQgPSBjb250ZW50LnNsaWNlKDAsIGlkeCkgKyBhcmdzLnJlcGxhY2UgKyBjb250ZW50LnNsaWNlKGlkeCArIGFyZ3Muc2VhcmNoLmxlbmd0aCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBmaWxlLWVkaXRvcjogcmVwbGFjZSBmYWlsZWQ6ICR7ZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpfWAgfTtcbiAgICAgICAgfVxuICAgICAgICBpZiAocmVwbGFjZW1lbnRzID09PSAwKSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBtZXNzYWdlOiAnTm8gb2NjdXJyZW5jZXMgZm91bmQ7IGZpbGUgdW5jaGFuZ2VkLicsIGRhdGE6IHsgZmlsZTogci5yZWxQcm9qZWN0LCByZXBsYWNlbWVudHM6IDAgfSB9O1xuICAgICAgICB9XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBmcy53cml0ZUZpbGVTeW5jKHIuYWJzLCBuZXdDb250ZW50LCAndXRmLTgnKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpIH07XG4gICAgICAgIH1cbiAgICAgICAgYXdhaXQgcmVmcmVzaEFzc2V0RGIoci5hYnMpO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgIG1lc3NhZ2U6IGBSZXBsYWNlZCAke3JlcGxhY2VtZW50c30gb2NjdXJyZW5jZShzKSBpbiAke3IucmVsUHJvamVjdH1gLFxuICAgICAgICAgICAgZGF0YTogeyBmaWxlOiByLnJlbFByb2plY3QsIHJlcGxhY2VtZW50cyB9LFxuICAgICAgICB9O1xuICAgIH0sXG59O1xuXG5jb25zdCBxdWVyeVRleHQ6IFRvb2xEZWYgPSB7XG4gICAgbmFtZTogJ3F1ZXJ5X3RleHQnLFxuICAgIGRlc2NyaXB0aW9uOiBSRURVTkRBTlRfVEFHICsgJ1JlYWQgYSByYW5nZSBvZiBsaW5lcyAoMS1iYXNlZCwgaW5jbHVzaXZlKS4gUmV0dXJucyBsaW5lcyB3aXRoIGxpbmUgbnVtYmVyczsgdG90YWwgbGluZSBjb3VudCBvZiBmaWxlIGluIGRhdGEudG90YWxMaW5lcy4gUmVhZC1vbmx5OyBubyBhc3NldC1kYiByZWZyZXNoLicsXG4gICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgZmlsZVBhdGg6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1BhdGggdG8gdGhlIGZpbGUgKGFic29sdXRlIG9yIHByb2plY3QtcmVsYXRpdmUpLicpLFxuICAgICAgICBzdGFydExpbmU6IHoubnVtYmVyKCkuaW50KCkubWluKDEpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0ZpcnN0IGxpbmUgdG8gcmVhZCAoMS1iYXNlZCkuIERlZmF1bHQgMS4nKSxcbiAgICAgICAgZW5kTGluZTogei5udW1iZXIoKS5pbnQoKS5taW4oMSkub3B0aW9uYWwoKS5kZXNjcmliZSgnTGFzdCBsaW5lIHRvIHJlYWQgKDEtYmFzZWQsIGluY2x1c2l2ZSkuIERlZmF1bHQgZW5kIG9mIGZpbGUuJyksXG4gICAgfSksXG4gICAgaGFuZGxlcjogYXN5bmMgKGFyZ3MpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4gPT4ge1xuICAgICAgICBjb25zdCByID0gcmVzb2x2ZVBhdGhGb3JSZWFkKGFyZ3MuZmlsZVBhdGgpO1xuICAgICAgICBpZiAoJ2Vycm9yJyBpbiByKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHIuZXJyb3IgfTtcbiAgICAgICAgbGV0IGNvbnRlbnQ6IHN0cmluZztcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHN0YXQgPSBmcy5zdGF0U3luYyhyLmFicyk7XG4gICAgICAgICAgICBpZiAoc3RhdC5zaXplID4gRklMRV9SRUFEX0JZVEVfQ0FQKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgZmlsZS1lZGl0b3I6IGZpbGUgdG9vIGxhcmdlICgke3N0YXQuc2l6ZX0gYnl0ZXMpOyByZWZ1c2luZyB0byByZWFkLmAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnRlbnQgPSBmcy5yZWFkRmlsZVN5bmMoci5hYnMsICd1dGYtOCcpO1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycikgfTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBsaW5lcyA9IGNvbnRlbnQuc3BsaXQoJ1xcbicpO1xuICAgICAgICBjb25zdCB0b3RhbExpbmVzID0gbGluZXMubGVuZ3RoO1xuICAgICAgICBjb25zdCBmcm9tID0gKGFyZ3Muc3RhcnRMaW5lID8/IDEpIC0gMTtcbiAgICAgICAgY29uc3QgdG8gPSBhcmdzLmVuZExpbmUgPz8gdG90YWxMaW5lcztcbiAgICAgICAgaWYgKGZyb20gPj0gdG90YWxMaW5lcykge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgZmlsZS1lZGl0b3I6IHN0YXJ0TGluZSAke2FyZ3Muc3RhcnRMaW5lID8/IDF9IHBhc3QgRU9GIChmaWxlIGhhcyAke3RvdGFsTGluZXN9IGxpbmVzKWAgfTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoYXJncy5zdGFydExpbmUgIT09IHVuZGVmaW5lZCAmJiBhcmdzLmVuZExpbmUgIT09IHVuZGVmaW5lZCAmJiBhcmdzLnN0YXJ0TGluZSA+IGFyZ3MuZW5kTGluZSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnZmlsZS1lZGl0b3I6IHN0YXJ0TGluZSBtdXN0IGJlIDw9IGVuZExpbmUnIH07XG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qgc2xpY2VkID0gbGluZXMuc2xpY2UoZnJvbSwgdG8pO1xuICAgICAgICBjb25zdCByZXN1bHQgPSBzbGljZWQubWFwKCh0ZXh0LCBpKSA9PiAoeyBsaW5lOiBmcm9tICsgaSArIDEsIHRleHQgfSkpO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgIG1lc3NhZ2U6IGBSZWFkICR7cmVzdWx0Lmxlbmd0aH0gbGluZShzKSBmcm9tICR7ci5yZWxQcm9qZWN0fWAsXG4gICAgICAgICAgICBkYXRhOiB7IGZpbGU6IHIucmVsUHJvamVjdCwgdG90YWxMaW5lcywgc3RhcnRMaW5lOiBmcm9tICsgMSwgZW5kTGluZTogZnJvbSArIHJlc3VsdC5sZW5ndGgsIGxpbmVzOiByZXN1bHQgfSxcbiAgICAgICAgfTtcbiAgICB9LFxufTtcblxuZXhwb3J0IGNsYXNzIEZpbGVFZGl0b3JUb29scyB7XG4gICAgcHJpdmF0ZSBpbXBsID0gZGVmaW5lVG9vbHMoW1xuICAgICAgICBpbnNlcnRUZXh0LFxuICAgICAgICBkZWxldGVMaW5lcyxcbiAgICAgICAgcmVwbGFjZVRleHQsXG4gICAgICAgIHF1ZXJ5VGV4dCxcbiAgICBdKTtcblxuICAgIGdldFRvb2xzKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5pbXBsLmdldFRvb2xzKCk7XG4gICAgfVxuXG4gICAgZXhlY3V0ZSh0b29sTmFtZTogc3RyaW5nLCBhcmdzOiBhbnkpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuaW1wbC5leGVjdXRlKHRvb2xOYW1lLCBhcmdzKTtcbiAgICB9XG59XG4iXX0=