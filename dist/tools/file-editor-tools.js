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
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
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
const decorators_1 = require("../lib/decorators");
const log_1 = require("../lib/log");
const file_editor_docs_1 = require("../data/file-editor-docs");
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
class FileEditorTools {
    constructor() {
        this.exec = (0, decorators_1.defineToolsFromDecorators)(this);
    }
    getTools() {
        return this.exec.getTools();
    }
    execute(toolName, args) {
        return this.exec.execute(toolName, args);
    }
    async insertText(args) {
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
    }
    async deleteLines(args) {
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
    }
    async replaceText(args) {
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
    }
    async queryText(args) {
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
    }
}
exports.FileEditorTools = FileEditorTools;
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'insert_text',
        title: 'Insert text at line',
        description: file_editor_docs_1.FILE_EDITOR_DOCS.insert_text,
        inputSchema: schema_1.z.object({
            filePath: schema_1.z.string().describe('Path to the file (absolute or project-relative).'),
            line: schema_1.z.number().int().min(1).describe('1-based line number to insert at; existing lines shift down.'),
            text: schema_1.z.string().describe('Text to insert as a new line (no trailing newline expected).'),
        }),
    })
], FileEditorTools.prototype, "insertText", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'delete_lines',
        title: 'Delete line range',
        description: file_editor_docs_1.FILE_EDITOR_DOCS.delete_lines,
        inputSchema: schema_1.z.object({
            filePath: schema_1.z.string().describe('Path to the file (absolute or project-relative).'),
            startLine: schema_1.z.number().int().min(1).describe('First line to delete (1-based, inclusive).'),
            endLine: schema_1.z.number().int().min(1).describe('Last line to delete (1-based, inclusive). Must be >= startLine.'),
        }),
    })
], FileEditorTools.prototype, "deleteLines", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'replace_text',
        title: 'Replace text in file',
        description: file_editor_docs_1.FILE_EDITOR_DOCS.replace_text,
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
    })
], FileEditorTools.prototype, "replaceText", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'query_text',
        title: 'Read line range',
        description: file_editor_docs_1.FILE_EDITOR_DOCS.query_text,
        inputSchema: schema_1.z.object({
            filePath: schema_1.z.string().describe('Path to the file (absolute or project-relative).'),
            startLine: schema_1.z.number().int().min(1).optional().describe('First line to read (1-based). Default 1.'),
            endLine: schema_1.z.number().int().min(1).optional().describe('Last line to read (1-based, inclusive). Default end of file.'),
        }),
    })
], FileEditorTools.prototype, "queryText", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmlsZS1lZGl0b3ItdG9vbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvdG9vbHMvZmlsZS1lZGl0b3ItdG9vbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLDhDQUEyQztBQUMzQzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQXlCRztBQUVILHVDQUF5QjtBQUN6QiwyQ0FBNkI7QUFFN0IsMENBQWtDO0FBQ2xDLGtEQUF1RTtBQUN2RSxvQ0FBb0M7QUFDcEMsK0RBQTREO0FBRTVELE1BQU0sYUFBYSxHQUFHLDBFQUEwRSxDQUFDO0FBRWpHLG1FQUFtRTtBQUNuRSx1Q0FBdUM7QUFDdkMsTUFBTSxrQkFBa0IsR0FBRyxDQUFDLEdBQUcsSUFBSSxHQUFHLElBQUksQ0FBQztBQUUzQywwRUFBMEU7QUFDMUUsZ0VBQWdFO0FBQ2hFLHVFQUF1RTtBQUN2RSx3RUFBd0U7QUFDeEUsa0RBQWtEO0FBQ2xELE1BQU0sbUJBQW1CLEdBQUcsQ0FBQyxHQUFHLElBQUksR0FBRyxJQUFJLENBQUM7QUFFNUMsNkVBQTZFO0FBQzdFLHlFQUF5RTtBQUN6RSwrREFBK0Q7QUFDL0QsTUFBTSxZQUFZLEdBQTJCLE1BQUMsRUFBRSxDQUFDLFlBQW9CLENBQUMsTUFBTSxtQ0FBSSxFQUFFLENBQUMsWUFBWSxDQUFDO0FBRWhHLDBFQUEwRTtBQUMxRSx3RUFBd0U7QUFDeEUsd0VBQXdFO0FBQ3hFLGtFQUFrRTtBQUNsRSx3REFBd0Q7QUFDeEQsU0FBUyxTQUFTLENBQUMsT0FBZTtJQUM5QixtRUFBbUU7SUFDbkUsb0VBQW9FO0lBQ3BFLGtFQUFrRTtJQUNsRSxNQUFNLE1BQU0sR0FBRyxPQUFPLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLE9B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SyxDQUFDLENBQUMsUUFBUSxDQUFDLHVEQUF1RCxDQUFDO1NBQzNHLENBQUM7S0FDTCxDQUFDO2tEQXVERDtBQVlLO0lBVkwsSUFBQSxvQkFBTyxFQUFDO1FBQ0wsSUFBSSxFQUFFLFlBQVk7UUFDbEIsS0FBSyxFQUFFLGlCQUFpQjtRQUN4QixXQUFXLEVBQUUsbUNBQWdCLENBQUMsVUFBVTtRQUN4QyxXQUFXLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQztZQUNsQixRQUFRLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyxrREFBa0QsQ0FBQztZQUNqRixTQUFTLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxRQUFRLENBQUMsMENBQTBDLENBQUM7WUFDbEcsT0FBTyxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUMsUUFBUSxDQUFDLDhEQUE4RCxDQUFDO1NBQ3ZILENBQUM7S0FDTCxDQUFDO2dEQXNCRCIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IG9rLCBmYWlsIH0gZnJvbSAnLi4vbGliL3Jlc3BvbnNlJztcbi8qKlxuICogZmlsZS1lZGl0b3ItdG9vbHMg4oCUIGhvc3Qtc2lkZSBmcyBvcGVyYXRpb25zIGZvciBjbGllbnRzIHdpdGhvdXRcbiAqIG5hdGl2ZSBmaWxlIGVkaXRpbmcuXG4gKlxuICogRm91ciB0b29scyAoU3BheWRvIGNvY29zLW1jcC1leHRlbnNpb24gcm91dGUsIGhhcmRlbmVkKTpcbiAqICAgLSBmaWxlX2VkaXRvcl9pbnNlcnRfdGV4dCAgIOKAlCBpbnNlcnQgYXQgMS1iYXNlZCBsaW5lXG4gKiAgIC0gZmlsZV9lZGl0b3JfZGVsZXRlX2xpbmVzICDigJQgZGVsZXRlIHJhbmdlLCAxLWJhc2VkIGluY2x1c2l2ZVxuICogICAtIGZpbGVfZWRpdG9yX3JlcGxhY2VfdGV4dCAg4oCUIGZpbmQvcmVwbGFjZSwgcGxhaW4gb3IgcmVnZXhcbiAqICAgLSBmaWxlX2VkaXRvcl9xdWVyeV90ZXh0ICAgIOKAlCByZWFkIHJhbmdlLCAxLWJhc2VkXG4gKlxuICogV2h5IHdlIHNoaXAgdGhlc2UgZXZlbiB0aG91Z2ggQ2xhdWRlIENvZGUgYWxyZWFkeSBoYXMgRWRpdC9Xcml0ZTpcbiAqICAgTXVsdGktY2xpZW50IGJyZWFkdGguIENsYXVkZSBEZXNrdG9wIC8gQ2xpbmUgLyBDb250aW51ZSBoYXZlIG5vXG4gKiAgIG5hdGl2ZSBmaWxlIG9wczsgQUkgb24gdGhvc2UgY2xpZW50cyBtdXN0IGdvIHRocm91Z2ggdGhlIE1DUFxuICogICBzZXJ2ZXIuIFRvb2wgZGVzY3JpcHRpb25zIGNhcnJ5IFtjbGF1ZGUtY29kZS1yZWR1bmRhbnRdIHNvIHRoZVxuICogICByYW5rZXIgb24gQ2xhdWRlIENvZGUgcHJlZmVycyB0aGUgSURFIHRvb2wuXG4gKlxuICogU3BheWRvJ3MgdXBzdHJlYW0gaGFkIHR3byBnYXBzIHdlIGNsb3NlOlxuICogICAxLiBwYXRoLXNhZmV0eSBndWFyZCB2aWEgcGxhaW4gYHBhdGgucmVzb2x2ZSArIHN0YXJ0c1dpdGhgIGlzXG4gKiAgICAgIHN5bWxpbmstdW5zYWZlIOKAlCBhIHN5bWxpbmsgaW5zaWRlIHRoZSBwcm9qZWN0IHBvaW50aW5nXG4gKiAgICAgIG91dHNpZGUgc3RpbGwgcGFzc2VzLiBVc2UgYGZzLnJlYWxwYXRoU3luYy5uYXRpdmVgIG9uIGJvdGhcbiAqICAgICAgc2lkZXMgKHNhbWUgZml4IHYyLjQuOSBhcHBsaWVkIHRvIGRlYnVnX2dldF9zY3JpcHRfZGlhZ25vc3RpY19jb250ZXh0KS5cbiAqICAgMi4gYXNzZXQtZGIgcmVmcmVzaCBob29rIG1pc3Npbmc6IGNvY29zIGVkaXRvciBkb2Vzbid0IHJlaW1wb3J0XG4gKiAgICAgIGEgLnRzLy5qcyB1bnRpbCBhc3NldC1kYiBzZWVzIGEgcmVmcmVzaCBldmVudC4gQ2FsbFxuICogICAgICBgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncmVmcmVzaCcsIGFic1BhdGgpYCBhZnRlclxuICogICAgICBldmVyeSB3cml0ZSBzbyB0aGUgZWRpdG9yIHBpY2tzIHVwIHRoZSBjaGFuZ2UuXG4gKi9cblxuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB0eXBlIHsgVG9vbERlZmluaXRpb24sIFRvb2xSZXNwb25zZSwgVG9vbEV4ZWN1dG9yIH0gZnJvbSAnLi4vdHlwZXMnO1xuaW1wb3J0IHsgeiB9IGZyb20gJy4uL2xpYi9zY2hlbWEnO1xuaW1wb3J0IHsgbWNwVG9vbCwgZGVmaW5lVG9vbHNGcm9tRGVjb3JhdG9ycyB9IGZyb20gJy4uL2xpYi9kZWNvcmF0b3JzJztcbmltcG9ydCB7IGxvZ2dlciB9IGZyb20gJy4uL2xpYi9sb2cnO1xuaW1wb3J0IHsgRklMRV9FRElUT1JfRE9DUyB9IGZyb20gJy4uL2RhdGEvZmlsZS1lZGl0b3ItZG9jcyc7XG5cbmNvbnN0IFJFRFVOREFOVF9UQUcgPSAnW2NsYXVkZS1jb2RlLXJlZHVuZGFudF0gVXNlIEVkaXQvV3JpdGUgdG9vbCBmcm9tIHlvdXIgSURFIGlmIGF2YWlsYWJsZS4gJztcblxuLy8gUmVhZCBjYXAgdG8ga2VlcCB0b29sIHJlc3VsdCByZWFzb25hYmxlOyBtYXRjaGVzIHRoZSBjYXAgdXNlZCBieVxuLy8gZGVidWdfZ2V0X3NjcmlwdF9kaWFnbm9zdGljX2NvbnRleHQuXG5jb25zdCBGSUxFX1JFQURfQllURV9DQVAgPSA1ICogMTAyNCAqIDEwMjQ7XG5cbi8vIHYyLjUuMSByb3VuZC0xIHJldmlldyBmaXggKGNvZGV4ICsgY2xhdWRlICsgZ2VtaW5pIPCfn6EpOiByZWdleCBtb2RlIHJ1bnNcbi8vIG9uIGZpbGVzIHVwIHRvIEZJTEVfUkVBRF9CWVRFX0NBUCB3aXRob3V0IGEgcnVudGltZSBjYXAsIHNvIGFcbi8vIGNhdGFzdHJvcGhpYy1iYWNrdHJhY2tpbmcgcGF0dGVybiB3b3VsZCBoYW5nIHRoZSBlZGl0b3IgcHJvY2Vzcy4gQ2FwXG4vLyB0aGUgcmVnZXgtbW9kZSBib2R5IHRvIGEgc21hbGxlciB3aW5kb3cuIFBsYWluLXN0cmluZyBtb2RlIGlzIGJvdW5kZWRcbi8vIGJ5IFY4IHN0cmluZyBvcHMgc28gaXQgZG9lc24ndCBuZWVkIHRoaXMgZ3VhcmQuXG5jb25zdCBSRUdFWF9NT0RFX0JZVEVfQ0FQID0gMSAqIDEwMjQgKiAxMDI0O1xuXG4vLyB2Mi41LjEgcm91bmQtMSByZXZpZXcgZml4IChjb2RleCDwn5+hKTogZnMucmVhbHBhdGhTeW5jLm5hdGl2ZSBpcyBkb2N1bWVudGVkXG4vLyBzaW5jZSBOb2RlIDkuMiBidXQgYSBmZXcgY29jb3MtYnVuZGxlZCBOb2RlIGJ1aWxkcyBoaXN0b3JpY2FsbHkgZGlkbid0XG4vLyBleHBvc2UgaXQuIFJlc29sdmUgb25jZSBhdCBtb2R1bGUgbG9hZCB3aXRoIGEgc2FmZSBmYWxsYmFjay5cbmNvbnN0IHJlYWxwYXRoU3luYzogdHlwZW9mIGZzLnJlYWxwYXRoU3luYyA9IChmcy5yZWFscGF0aFN5bmMgYXMgYW55KS5uYXRpdmUgPz8gZnMucmVhbHBhdGhTeW5jO1xuXG4vLyB2Mi41LjEgcm91bmQtMSByZXZpZXcgZml4IChjbGF1ZGUg8J+foSk6IHByZXNlcnZlIGRvbWluYW50IGxpbmUgZW5kaW5nIHNvXG4vLyBlZGl0cyBkb24ndCBzaWxlbnRseSByZXdyaXRlIGEgV2luZG93cyBwcm9qZWN0J3MgQ1JMRiBsaW5lcyBhcyBMRi4gV2Vcbi8vIGRldGVjdCBieSBjb3VudGluZyBcXHJcXG4gdnMgbG9uZSBcXG4gaW4gdGhlIGZpbGUsIHRoZW4gcmUtam9pbiB3aXRoIHRoZVxuLy8gZG9taW5hbnQgc3R5bGUuIE5ldyBsaW5lcyBhZGRlZCBieSB0aGUgdXNlciAodmlhIGluc2VydF90ZXh0IG9yXG4vLyByZXBsYWNlX3RleHQpIGluaGVyaXQgd2hhdGV2ZXIgdGhlIGZpbGUgYWxyZWFkeSB1c2VzLlxuZnVuY3Rpb24gZGV0ZWN0RW9sKGNvbnRlbnQ6IHN0cmluZyk6ICdcXHJcXG4nIHwgJ1xcbicge1xuICAgIC8vIENvdW50IGxvbmUgXFxuIHZzIFxcclxcbiBpbiB0aGUgZmlyc3QgNEtCIOKAlCBzYW1wbGUgaXMgZW5vdWdoOyBtaXhlZFxuICAgIC8vIGZpbGVzIHBpY2sgd2hpY2hldmVyIGFwcGVhcnMgbW9yZSBpbiB0aGUgaGVhZC4gRWRnZSBjYXNlIChmaWxlIGlzXG4gICAgLy8gYWxsLUNSTEYgZXhjZXB0IGEgc2luZ2xlIExGIGluIHRoZSBtaWRkbGUpOiB3ZSBzdGlsbCBwaWNrIENSTEYuXG4gICAgY29uc3Qgc2FtcGxlID0gY29udGVudC5sZW5ndGggPiA0MDk2ID8gY29udGVudC5zbGljZSgwLCA0MDk2KSA6IGNvbnRlbnQ7XG4gICAgbGV0IGNybGYgPSAwO1xuICAgIGxldCBsZiA9IDA7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzYW1wbGUubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKHNhbXBsZS5jaGFyQ29kZUF0KGkpID09PSAweDBhIC8qIFxcbiAqLykge1xuICAgICAgICAgICAgaWYgKGkgPiAwICYmIHNhbXBsZS5jaGFyQ29kZUF0KGkgLSAxKSA9PT0gMHgwZCAvKiBcXHIgKi8pIGNybGYrKztcbiAgICAgICAgICAgIGVsc2UgbGYrKztcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gY3JsZiA+IGxmID8gJ1xcclxcbicgOiAnXFxuJztcbn1cblxuZnVuY3Rpb24gc3BsaXRMaW5lc05vcm1hbGl6ZWQoY29udGVudDogc3RyaW5nKTogeyBsaW5lczogc3RyaW5nW107IGVvbDogJ1xcclxcbicgfCAnXFxuJyB9IHtcbiAgICByZXR1cm4ge1xuICAgICAgICBsaW5lczogY29udGVudC5zcGxpdCgvXFxyP1xcbi8pLFxuICAgICAgICBlb2w6IGRldGVjdEVvbChjb250ZW50KSxcbiAgICB9O1xufVxuXG5pbnRlcmZhY2UgUmVzb2x2ZWRQYXRoIHsgYWJzOiBzdHJpbmc7IHJlbFByb2plY3Q6IHN0cmluZzsgfVxuXG5mdW5jdGlvbiBnZXRQcm9qZWN0UGF0aCgpOiBzdHJpbmcgfCBudWxsIHtcbiAgICB0cnkge1xuICAgICAgICByZXR1cm4gRWRpdG9yPy5Qcm9qZWN0Py5wYXRoID8/IG51bGw7XG4gICAgfSBjYXRjaCB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbn1cblxuLyoqXG4gKiBSZXNvbHZlIGEgdXNlci1zdXBwbGllZCBwYXRoIHRvIGFuIGFic29sdXRlLCBzeW1saW5rLXNhZmUgcGF0aFxuICogaW5zaWRlIHRoZSBwcm9qZWN0LiBSZXR1cm5zIHRoZSByZXNvbHZlZCBhYnNvbHV0ZSBwYXRoICsgdGhlXG4gKiBwcm9qZWN0LXJlbGF0aXZlIGZvcm0gKGZvciBmcmllbmRseSBtZXNzYWdlcykuIFRocm93cy1zdHlsZVxuICogeyBlcnJvciB9IGVudmVsb3BlIGZvciBjYWxsZXJzIHRvIHNob3J0LWNpcmN1aXQgb24uXG4gKlxuICogUGF0aCBzYWZldHk6XG4gKiAgIDEuIElmIGB0YXJnZXRgIGlzIHJlbGF0aXZlLCBqb2luZWQgdG8gcHJvamVjdFBhdGg7IGlmIGFic29sdXRlLFxuICogICAgICB1c2VkIGFzLWlzLlxuICogICAyLiBCb3RoIHRhcmdldCBhbmQgcHJvamVjdCByb290IGdvIHRocm91Z2ggYGZzLnJlYWxwYXRoU3luYy5uYXRpdmVgXG4gKiAgICAgIHNvIHN5bWxpbmtzIGFyZSBmb2xsb3dlZCBiZWZvcmUgdGhlIHByZWZpeCBjaGVjay5cbiAqICAgMy4gQ2FzZS1pbnNlbnNpdGl2ZSBjb21wYXJpc29uIG9uIFdpbmRvd3M7IGNhc2Utc2Vuc2l0aXZlIG9uIFBPU0lYLlxuICogICA0LiBTZXAgZ3VhcmQgYWdhaW5zdCBgL3Byb2otZm9vYCB2cyBgL3Byb2pgIHByZWZpeCBjb25mdXNpb24uXG4gKlxuICogQ2FsbGVyIE1VU1QgaGFuZGxlIHRoZSBtaXNzaW5nLXRhcmdldCBjYXNlIGZvciB3cml0ZSBvcGVyYXRpb25zXG4gKiAoaW5zZXJ0L3JlcGxhY2UvZGVsZXRlKSDigJQgd2Ugc3RpbGwgd2FudCB0byB3cml0ZSB0byBhIG5vbi1leGlzdGVudFxuICogZmlsZSB2aWEgdGhlIHJlbGF0aXZlLXBhdGggZmFsbGJhY2sgd2hlbiB0aGUgcGFyZW50IGRpcmVjdG9yeVxuICogZXhpc3RzLiBTZWUgYHJlc29sdmVQYXRoRm9yV3JpdGVgIGJlbG93LlxuICovXG5mdW5jdGlvbiByZXNvbHZlUGF0aEZvclJlYWQodGFyZ2V0OiBzdHJpbmcpOiBSZXNvbHZlZFBhdGggfCB7IGVycm9yOiBzdHJpbmcgfSB7XG4gICAgY29uc3QgcHJvamVjdFBhdGggPSBnZXRQcm9qZWN0UGF0aCgpO1xuICAgIGlmICghcHJvamVjdFBhdGgpIHtcbiAgICAgICAgcmV0dXJuIHsgZXJyb3I6ICdmaWxlLWVkaXRvcjogZWRpdG9yIGNvbnRleHQgdW5hdmFpbGFibGUgKG5vIEVkaXRvci5Qcm9qZWN0LnBhdGgpJyB9O1xuICAgIH1cbiAgICBjb25zdCBhYnNSYXcgPSBwYXRoLmlzQWJzb2x1dGUodGFyZ2V0KSA/IHRhcmdldCA6IHBhdGguam9pbihwcm9qZWN0UGF0aCwgdGFyZ2V0KTtcbiAgICBsZXQgcmVzb2x2ZWRBYnM6IHN0cmluZztcbiAgICB0cnkge1xuICAgICAgICByZXNvbHZlZEFicyA9IHJlYWxwYXRoU3luYyhhYnNSYXcpO1xuICAgIH0gY2F0Y2gge1xuICAgICAgICByZXR1cm4geyBlcnJvcjogYGZpbGUtZWRpdG9yOiBmaWxlIG5vdCBmb3VuZCBvciB1bnJlYWRhYmxlOiAke2Fic1Jhd31gIH07XG4gICAgfVxuICAgIGxldCBwcm9qZWN0QWJzOiBzdHJpbmc7XG4gICAgdHJ5IHtcbiAgICAgICAgcHJvamVjdEFicyA9IHJlYWxwYXRoU3luYyhwcm9qZWN0UGF0aCk7XG4gICAgfSBjYXRjaCB7XG4gICAgICAgIHByb2plY3RBYnMgPSBwYXRoLnJlc29sdmUocHJvamVjdFBhdGgpO1xuICAgIH1cbiAgICBjb25zdCBjbXAgPSBwcm9jZXNzLnBsYXRmb3JtID09PSAnd2luMzInXG4gICAgICAgID8geyByZXNvbHZlZDogcmVzb2x2ZWRBYnMudG9Mb3dlckNhc2UoKSwgcHJvamVjdDogcHJvamVjdEFicy50b0xvd2VyQ2FzZSgpIH1cbiAgICAgICAgOiB7IHJlc29sdmVkOiByZXNvbHZlZEFicywgcHJvamVjdDogcHJvamVjdEFicyB9O1xuICAgIGlmICghY21wLnJlc29sdmVkLnN0YXJ0c1dpdGgoY21wLnByb2plY3QgKyBwYXRoLnNlcCkgJiYgY21wLnJlc29sdmVkICE9PSBjbXAucHJvamVjdCkge1xuICAgICAgICByZXR1cm4geyBlcnJvcjogYGZpbGUtZWRpdG9yOiBwYXRoICR7cmVzb2x2ZWRBYnN9IHJlc29sdmVzIG91dHNpZGUgdGhlIHByb2plY3Qgcm9vdCAoc3ltbGluay1hd2FyZSBjaGVjaylgIH07XG4gICAgfVxuICAgIHJldHVybiB7IGFiczogcmVzb2x2ZWRBYnMsIHJlbFByb2plY3Q6IHBhdGgucmVsYXRpdmUocHJvamVjdEFicywgcmVzb2x2ZWRBYnMpIH07XG59XG5cbmNvbnN0IEFTU0VUX1JFRlJFU0hfRVhUUyA9IG5ldyBTZXQoWycudHMnLCAnLnRzeCcsICcuanMnLCAnLmpzeCcsICcuanNvbicsICcuZmlyZScsICcuc2NlbmUnLCAnLnByZWZhYicsICcuYW5pbScsICcubWF0ZXJpYWwnLCAnLmVmZmVjdCcsICcuZm50J10pO1xuXG4vKipcbiAqIEJlc3QtZWZmb3J0OiB0ZWxsIGNvY29zIGFzc2V0LWRiIHRoYXQgdGhlIGZpbGUgY2hhbmdlZCBzbyB0aGUgZWRpdG9yXG4gKiBwaWNrcyBpdCB1cCB3aXRob3V0IGEgbWFudWFsIHJlZnJlc2guIEZhaWx1cmUgaXMgbm9uLWZhdGFsIGJlY2F1c2VcbiAqIHRoZSBmaWxlIGlzIGFscmVhZHkgd3JpdHRlbjsgdGhlIHVzZXIgY2FuIGhpdCByZWZyZXNoIG1hbnVhbGx5LlxuICpcbiAqIE9ubHkgZmlyZXMgZm9yIGZpbGUgZXh0ZW5zaW9ucyBjb2NvcyBjYXJlcyBhYm91dCAoVFMgc291cmNlLCBKU09OXG4gKiBjb25maWdzLCBzY2VuZS9wcmVmYWIvYW5pbSBhc3NldHMsIGV0Yy4pIHNvIHBsYWluIC50eHQgZWRpdHMgZG9uJ3RcbiAqIHNwYW0gdGhlIGFzc2V0LWRiLlxuICovXG5hc3luYyBmdW5jdGlvbiByZWZyZXNoQXNzZXREYihhYnNQYXRoOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBleHQgPSBwYXRoLmV4dG5hbWUoYWJzUGF0aCkudG9Mb3dlckNhc2UoKTtcbiAgICBpZiAoIUFTU0VUX1JFRlJFU0hfRVhUUy5oYXMoZXh0KSkgcmV0dXJuO1xuICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3JlZnJlc2gtYXNzZXQnLCBhYnNQYXRoKTtcbiAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICBsb2dnZXIuZGVidWcoJ1tGaWxlRWRpdG9yXSBhc3NldC1kYiByZWZyZXNoLWFzc2V0IGZhaWxlZCAobm9uLWZhdGFsKTonLCBlcnI/Lm1lc3NhZ2UgPz8gZXJyKTtcbiAgICB9XG59XG5cbmV4cG9ydCBjbGFzcyBGaWxlRWRpdG9yVG9vbHMgaW1wbGVtZW50cyBUb29sRXhlY3V0b3Ige1xuICAgIHByaXZhdGUgcmVhZG9ubHkgZXhlYzogVG9vbEV4ZWN1dG9yO1xuXG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHRoaXMuZXhlYyA9IGRlZmluZVRvb2xzRnJvbURlY29yYXRvcnModGhpcyk7XG4gICAgfVxuXG4gICAgZ2V0VG9vbHMoKTogVG9vbERlZmluaXRpb25bXSB7XG4gICAgICAgIHJldHVybiB0aGlzLmV4ZWMuZ2V0VG9vbHMoKTtcbiAgICB9XG5cbiAgICBleGVjdXRlKHRvb2xOYW1lOiBzdHJpbmcsIGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLmV4ZWMuZXhlY3V0ZSh0b29sTmFtZSwgYXJncyk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnaW5zZXJ0X3RleHQnLFxuICAgICAgICB0aXRsZTogJ0luc2VydCB0ZXh0IGF0IGxpbmUnLFxuICAgICAgICBkZXNjcmlwdGlvbjogRklMRV9FRElUT1JfRE9DUy5pbnNlcnRfdGV4dCxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIGZpbGVQYXRoOiB6LnN0cmluZygpLmRlc2NyaWJlKCdQYXRoIHRvIHRoZSBmaWxlIChhYnNvbHV0ZSBvciBwcm9qZWN0LXJlbGF0aXZlKS4nKSxcbiAgICAgICAgICAgIGxpbmU6IHoubnVtYmVyKCkuaW50KCkubWluKDEpLmRlc2NyaWJlKCcxLWJhc2VkIGxpbmUgbnVtYmVyIHRvIGluc2VydCBhdDsgZXhpc3RpbmcgbGluZXMgc2hpZnQgZG93bi4nKSxcbiAgICAgICAgICAgIHRleHQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1RleHQgdG8gaW5zZXJ0IGFzIGEgbmV3IGxpbmUgKG5vIHRyYWlsaW5nIG5ld2xpbmUgZXhwZWN0ZWQpLicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIGluc2VydFRleHQoYXJnczogeyBmaWxlUGF0aDogc3RyaW5nOyBsaW5lOiBudW1iZXI7IHRleHQ6IHN0cmluZyB9KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgciA9IHJlc29sdmVQYXRoRm9yUmVhZChhcmdzLmZpbGVQYXRoKTtcbiAgICAgICAgaWYgKCdlcnJvcicgaW4gcikgcmV0dXJuIGZhaWwoci5lcnJvcik7XG4gICAgICAgIGNvbnN0IHN0YXQgPSBmcy5zdGF0U3luYyhyLmFicyk7XG4gICAgICAgIGlmIChzdGF0LnNpemUgPiBGSUxFX1JFQURfQllURV9DQVApIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGBmaWxlLWVkaXRvcjogZmlsZSB0b28gbGFyZ2UgKCR7c3RhdC5zaXplfSBieXRlcyk7IHJlZnVzaW5nIHRvIHJlYWQuYCk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgY29udGVudCA9IGZzLnJlYWRGaWxlU3luYyhyLmFicywgJ3V0Zi04Jyk7XG4gICAgICAgIGNvbnN0IHsgbGluZXMsIGVvbCB9ID0gc3BsaXRMaW5lc05vcm1hbGl6ZWQoY29udGVudCk7XG4gICAgICAgIGNvbnN0IGluc2VydEluZGV4ID0gYXJncy5saW5lIC0gMTtcbiAgICAgICAgaWYgKGluc2VydEluZGV4ID49IGxpbmVzLmxlbmd0aCkge1xuICAgICAgICAgICAgbGluZXMucHVzaChhcmdzLnRleHQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbGluZXMuc3BsaWNlKGluc2VydEluZGV4LCAwLCBhcmdzLnRleHQpO1xuICAgICAgICB9XG4gICAgICAgIGZzLndyaXRlRmlsZVN5bmMoci5hYnMsIGxpbmVzLmpvaW4oZW9sKSwgJ3V0Zi04Jyk7XG4gICAgICAgIGF3YWl0IHJlZnJlc2hBc3NldERiKHIuYWJzKTtcbiAgICAgICAgcmV0dXJuIG9rKHsgZmlsZTogci5yZWxQcm9qZWN0LCB0b3RhbExpbmVzOiBsaW5lcy5sZW5ndGgsIGVvbDogZW9sID09PSAnXFxyXFxuJyA/ICdDUkxGJyA6ICdMRicgfSwgYEluc2VydGVkIHRleHQgYXQgbGluZSAke01hdGgubWluKGFyZ3MubGluZSwgbGluZXMubGVuZ3RoKX0gb2YgJHtyLnJlbFByb2plY3R9YCk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnZGVsZXRlX2xpbmVzJyxcbiAgICAgICAgdGl0bGU6ICdEZWxldGUgbGluZSByYW5nZScsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBGSUxFX0VESVRPUl9ET0NTLmRlbGV0ZV9saW5lcyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIGZpbGVQYXRoOiB6LnN0cmluZygpLmRlc2NyaWJlKCdQYXRoIHRvIHRoZSBmaWxlIChhYnNvbHV0ZSBvciBwcm9qZWN0LXJlbGF0aXZlKS4nKSxcbiAgICAgICAgICAgIHN0YXJ0TGluZTogei5udW1iZXIoKS5pbnQoKS5taW4oMSkuZGVzY3JpYmUoJ0ZpcnN0IGxpbmUgdG8gZGVsZXRlICgxLWJhc2VkLCBpbmNsdXNpdmUpLicpLFxuICAgICAgICAgICAgZW5kTGluZTogei5udW1iZXIoKS5pbnQoKS5taW4oMSkuZGVzY3JpYmUoJ0xhc3QgbGluZSB0byBkZWxldGUgKDEtYmFzZWQsIGluY2x1c2l2ZSkuIE11c3QgYmUgPj0gc3RhcnRMaW5lLicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIGRlbGV0ZUxpbmVzKGFyZ3M6IHsgZmlsZVBhdGg6IHN0cmluZzsgc3RhcnRMaW5lOiBudW1iZXI7IGVuZExpbmU6IG51bWJlciB9KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgaWYgKGFyZ3Muc3RhcnRMaW5lID4gYXJncy5lbmRMaW5lKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbCgnZmlsZS1lZGl0b3I6IHN0YXJ0TGluZSBtdXN0IGJlIDw9IGVuZExpbmUnKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCByID0gcmVzb2x2ZVBhdGhGb3JSZWFkKGFyZ3MuZmlsZVBhdGgpO1xuICAgICAgICBpZiAoJ2Vycm9yJyBpbiByKSByZXR1cm4gZmFpbChyLmVycm9yKTtcbiAgICAgICAgY29uc3Qgc3RhdCA9IGZzLnN0YXRTeW5jKHIuYWJzKTtcbiAgICAgICAgaWYgKHN0YXQuc2l6ZSA+IEZJTEVfUkVBRF9CWVRFX0NBUCkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoYGZpbGUtZWRpdG9yOiBmaWxlIHRvbyBsYXJnZSAoJHtzdGF0LnNpemV9IGJ5dGVzKTsgcmVmdXNpbmcgdG8gcmVhZC5gKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBjb250ZW50ID0gZnMucmVhZEZpbGVTeW5jKHIuYWJzLCAndXRmLTgnKTtcbiAgICAgICAgY29uc3QgeyBsaW5lcywgZW9sIH0gPSBzcGxpdExpbmVzTm9ybWFsaXplZChjb250ZW50KTtcbiAgICAgICAgY29uc3QgZGVsZXRlU3RhcnQgPSBhcmdzLnN0YXJ0TGluZSAtIDE7XG4gICAgICAgIGNvbnN0IHJlcXVlc3RlZENvdW50ID0gYXJncy5lbmRMaW5lIC0gYXJncy5zdGFydExpbmUgKyAxO1xuICAgICAgICBjb25zdCBkZWxldGVkQ291bnQgPSBNYXRoLm1heCgwLCBNYXRoLm1pbihyZXF1ZXN0ZWRDb3VudCwgbGluZXMubGVuZ3RoIC0gZGVsZXRlU3RhcnQpKTtcbiAgICAgICAgaWYgKGRlbGV0ZWRDb3VudCA9PT0gMCkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoYGZpbGUtZWRpdG9yOiByYW5nZSAke2FyZ3Muc3RhcnRMaW5lfS0ke2FyZ3MuZW5kTGluZX0gaXMgcGFzdCBFT0YgKGZpbGUgaGFzICR7bGluZXMubGVuZ3RofSBsaW5lcylgKTtcbiAgICAgICAgfVxuICAgICAgICBsaW5lcy5zcGxpY2UoZGVsZXRlU3RhcnQsIGRlbGV0ZWRDb3VudCk7XG4gICAgICAgIGZzLndyaXRlRmlsZVN5bmMoci5hYnMsIGxpbmVzLmpvaW4oZW9sKSwgJ3V0Zi04Jyk7XG4gICAgICAgIGF3YWl0IHJlZnJlc2hBc3NldERiKHIuYWJzKTtcbiAgICAgICAgcmV0dXJuIG9rKHsgZmlsZTogci5yZWxQcm9qZWN0LCBkZWxldGVkQ291bnQsIHRvdGFsTGluZXM6IGxpbmVzLmxlbmd0aCwgZW9sOiBlb2wgPT09ICdcXHJcXG4nID8gJ0NSTEYnIDogJ0xGJyB9LCBgRGVsZXRlZCAke2RlbGV0ZWRDb3VudH0gbGluZShzKSBmcm9tIGxpbmUgJHthcmdzLnN0YXJ0TGluZX0gdG8gJHthcmdzLnN0YXJ0TGluZSArIGRlbGV0ZWRDb3VudCAtIDF9IG9mICR7ci5yZWxQcm9qZWN0fWApO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ3JlcGxhY2VfdGV4dCcsXG4gICAgICAgIHRpdGxlOiAnUmVwbGFjZSB0ZXh0IGluIGZpbGUnLFxuICAgICAgICBkZXNjcmlwdGlvbjogRklMRV9FRElUT1JfRE9DUy5yZXBsYWNlX3RleHQsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICBmaWxlUGF0aDogei5zdHJpbmcoKS5kZXNjcmliZSgnUGF0aCB0byB0aGUgZmlsZSAoYWJzb2x1dGUgb3IgcHJvamVjdC1yZWxhdGl2ZSkuJyksXG4gICAgICAgICAgICAvLyB2Mi41LjEgcm91bmQtMSByZXZpZXcgZml4IChjb2RleCArIGNsYXVkZSDwn5+hKTogZW1wdHkgc2VhcmNoIHdvdWxkXG4gICAgICAgICAgICAvLyBlaXRoZXIgaW5zZXJ0IGJldHdlZW4gZXZlcnkgY2hhciAocmVwbGFjZUFsbCkgb3IgaW5zZXJ0IGF0IGJ5dGUgMFxuICAgICAgICAgICAgLy8gKGZpcnN0LW9ubHkpIOKAlCBib3RoIHN1cnByaXNpbmcuIFJlamVjdCBlYXJseS5cbiAgICAgICAgICAgIHNlYXJjaDogei5zdHJpbmcoKS5taW4oMSwgJ3NlYXJjaCBtdXN0IGJlIG5vbi1lbXB0eScpLmRlc2NyaWJlKCdTZWFyY2ggdGV4dCBvciByZWdleCBwYXR0ZXJuIChkZXBlbmRzIG9uIHVzZVJlZ2V4KS4gTXVzdCBiZSBub24tZW1wdHkuJyksXG4gICAgICAgICAgICByZXBsYWNlOiB6LnN0cmluZygpLmRlc2NyaWJlKCdSZXBsYWNlbWVudCB0ZXh0LiBSZWdleCBiYWNrcmVmZXJlbmNlcyAoJDEsICQmLCAkYCwgJFxcJykgZXhwYW5kIHdoZW4gdXNlUmVnZXg6dHJ1ZS4nKSxcbiAgICAgICAgICAgIHVzZVJlZ2V4OiB6LmJvb2xlYW4oKS5kZWZhdWx0KGZhbHNlKS5kZXNjcmliZSgnVHJlYXQgYHNlYXJjaGAgYXMgYSBKUyBSZWdFeHAgc291cmNlIHN0cmluZy4gRGVmYXVsdCBmYWxzZS4nKSxcbiAgICAgICAgICAgIHJlcGxhY2VBbGw6IHouYm9vbGVhbigpLmRlZmF1bHQoZmFsc2UpLmRlc2NyaWJlKCdSZXBsYWNlIGV2ZXJ5IG9jY3VycmVuY2UuIERlZmF1bHQgZmFsc2UgKGZpcnN0IG9ubHkpLicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIHJlcGxhY2VUZXh0KGFyZ3M6IHsgZmlsZVBhdGg6IHN0cmluZzsgc2VhcmNoOiBzdHJpbmc7IHJlcGxhY2U6IHN0cmluZzsgdXNlUmVnZXg6IGJvb2xlYW47IHJlcGxhY2VBbGw6IGJvb2xlYW4gfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHIgPSByZXNvbHZlUGF0aEZvclJlYWQoYXJncy5maWxlUGF0aCk7XG4gICAgICAgIGlmICgnZXJyb3InIGluIHIpIHJldHVybiBmYWlsKHIuZXJyb3IpO1xuICAgICAgICBjb25zdCBzdGF0ID0gZnMuc3RhdFN5bmMoci5hYnMpO1xuICAgICAgICBpZiAoc3RhdC5zaXplID4gRklMRV9SRUFEX0JZVEVfQ0FQKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChgZmlsZS1lZGl0b3I6IGZpbGUgdG9vIGxhcmdlICgke3N0YXQuc2l6ZX0gYnl0ZXMpOyByZWZ1c2luZyB0byByZWFkLmApO1xuICAgICAgICB9XG4gICAgICAgIC8vIHYyLjUuMSByb3VuZC0xIHJldmlldyBmaXggKGNvZGV4ICsgY2xhdWRlICsgZ2VtaW5pIPCfn6EpOiByZWdleFxuICAgICAgICAvLyBtb2RlIHJ1bnMgdXNlci1jb250cm9sbGVkIHBhdHRlcm5zIGFnYWluc3QgdGhlIGZpbGUgY29udGVudFxuICAgICAgICAvLyB3aXRoIG5vIHRpbWVvdXQuIENhcCB0byBhIHNtYWxsZXIgd2luZG93IGluIHJlZ2V4IG1vZGUgc29cbiAgICAgICAgLy8gY2F0YXN0cm9waGljIGJhY2t0cmFja2luZyBvbiBhIGxhcmdlIGZpbGUgY2FuJ3QgaGFuZyB0aGVcbiAgICAgICAgLy8gZWRpdG9yJ3MgaG9zdCBwcm9jZXNzLiBQbGFpbi1zdHJpbmcgbW9kZSBrZWVwcyB0aGUgbGFyZ2VyXG4gICAgICAgIC8vIEZJTEVfUkVBRF9CWVRFX0NBUCBiZWNhdXNlIFN0cmluZy5zcGxpdC9pbmRleE9mL3NsaWNlIGFyZVxuICAgICAgICAvLyBib3VuZGVkIGJ5IFY4IGludGVybmFscyAobm8gcmVnZXggZW5naW5lIHBhdGgpLlxuICAgICAgICBpZiAoYXJncy51c2VSZWdleCAmJiBzdGF0LnNpemUgPiBSRUdFWF9NT0RFX0JZVEVfQ0FQKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChgZmlsZS1lZGl0b3I6IHJlZ2V4IG1vZGUgcmVmdXNlcyBmaWxlcyA+ICR7UkVHRVhfTU9ERV9CWVRFX0NBUH0gYnl0ZXMgKCR7c3RhdC5zaXplfSBieXRlcyBoZXJlKS4gU3dpdGNoIHRvIHVzZVJlZ2V4OmZhbHNlIG9yIHNwbGl0IHRoZSBmaWxlIGZpcnN0LmApO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGNvbnRlbnQgPSBmcy5yZWFkRmlsZVN5bmMoci5hYnMsICd1dGYtOCcpO1xuICAgICAgICBsZXQgcmVwbGFjZW1lbnRzID0gMDtcbiAgICAgICAgbGV0IG5ld0NvbnRlbnQ6IHN0cmluZztcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGlmIChhcmdzLnVzZVJlZ2V4KSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZmxhZ3MgPSBhcmdzLnJlcGxhY2VBbGwgPyAnZycgOiAnJztcbiAgICAgICAgICAgICAgICBjb25zdCByZWdleCA9IG5ldyBSZWdFeHAoYXJncy5zZWFyY2gsIGZsYWdzKTtcbiAgICAgICAgICAgICAgICAvLyB2Mi41LjEgcm91bmQtMSByZXZpZXcgZml4IChjb2RleCDwn5S0KTogcGFzcyB0aGUgcmVwbGFjZW1lbnRcbiAgICAgICAgICAgICAgICAvLyBTVFJJTkcgZGlyZWN0bHkgc28gJDEvJCYvZXRjLiBleHBhbmQuIFRoZSBwcmV2aW91c1xuICAgICAgICAgICAgICAgIC8vIGZ1bmN0aW9uLWNhbGxiYWNrIGZvcm0gcmV0dXJuZWQgYGFyZ3MucmVwbGFjZWAgbGl0ZXJhbGx5LFxuICAgICAgICAgICAgICAgIC8vIGJyZWFraW5nIHRoZSBkb2N1bWVudGVkIGJhY2tyZWZlcmVuY2UgYmVoYXZpb3VyLiBDb3VudFxuICAgICAgICAgICAgICAgIC8vIG1hdGNoZXMgc2VwYXJhdGVseSB2aWEgYSBwYXJhbGxlbCBtYXRjaCgpIHBhc3Mgc2luY2Ugd2VcbiAgICAgICAgICAgICAgICAvLyBubyBsb25nZXIgaGF2ZSB0aGUgcGVyLWNhbGwgY291bnRlci5cbiAgICAgICAgICAgICAgICBjb25zdCBtYXRjaGVzID0gY29udGVudC5tYXRjaChyZWdleCk7XG4gICAgICAgICAgICAgICAgcmVwbGFjZW1lbnRzID0gbWF0Y2hlcyA/IG1hdGNoZXMubGVuZ3RoIDogMDtcbiAgICAgICAgICAgICAgICBuZXdDb250ZW50ID0gY29udGVudC5yZXBsYWNlKHJlZ2V4LCBhcmdzLnJlcGxhY2UpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChhcmdzLnJlcGxhY2VBbGwpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBwYXJ0cyA9IGNvbnRlbnQuc3BsaXQoYXJncy5zZWFyY2gpO1xuICAgICAgICAgICAgICAgIHJlcGxhY2VtZW50cyA9IHBhcnRzLmxlbmd0aCAtIDE7XG4gICAgICAgICAgICAgICAgbmV3Q29udGVudCA9IHBhcnRzLmpvaW4oYXJncy5yZXBsYWNlKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc3QgaWR4ID0gY29udGVudC5pbmRleE9mKGFyZ3Muc2VhcmNoKTtcbiAgICAgICAgICAgICAgICBpZiAoaWR4ID09PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gb2soeyBmaWxlOiByLnJlbFByb2plY3QsIHJlcGxhY2VtZW50czogMCB9LCAnTm8gb2NjdXJyZW5jZXMgZm91bmQ7IGZpbGUgdW5jaGFuZ2VkLicpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXBsYWNlbWVudHMgPSAxO1xuICAgICAgICAgICAgICAgIG5ld0NvbnRlbnQgPSBjb250ZW50LnNsaWNlKDAsIGlkeCkgKyBhcmdzLnJlcGxhY2UgKyBjb250ZW50LnNsaWNlKGlkeCArIGFyZ3Muc2VhcmNoLmxlbmd0aCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChgZmlsZS1lZGl0b3I6IHJlcGxhY2UgZmFpbGVkOiAke2Vycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKX1gKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAocmVwbGFjZW1lbnRzID09PSAwKSB7XG4gICAgICAgICAgICByZXR1cm4gb2soeyBmaWxlOiByLnJlbFByb2plY3QsIHJlcGxhY2VtZW50czogMCB9LCAnTm8gb2NjdXJyZW5jZXMgZm91bmQ7IGZpbGUgdW5jaGFuZ2VkLicpO1xuICAgICAgICB9XG4gICAgICAgIGZzLndyaXRlRmlsZVN5bmMoci5hYnMsIG5ld0NvbnRlbnQsICd1dGYtOCcpO1xuICAgICAgICBhd2FpdCByZWZyZXNoQXNzZXREYihyLmFicyk7XG4gICAgICAgIHJldHVybiBvayh7IGZpbGU6IHIucmVsUHJvamVjdCwgcmVwbGFjZW1lbnRzIH0sIGBSZXBsYWNlZCAke3JlcGxhY2VtZW50c30gb2NjdXJyZW5jZShzKSBpbiAke3IucmVsUHJvamVjdH1gKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdxdWVyeV90ZXh0JyxcbiAgICAgICAgdGl0bGU6ICdSZWFkIGxpbmUgcmFuZ2UnLFxuICAgICAgICBkZXNjcmlwdGlvbjogRklMRV9FRElUT1JfRE9DUy5xdWVyeV90ZXh0LFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgZmlsZVBhdGg6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1BhdGggdG8gdGhlIGZpbGUgKGFic29sdXRlIG9yIHByb2plY3QtcmVsYXRpdmUpLicpLFxuICAgICAgICAgICAgc3RhcnRMaW5lOiB6Lm51bWJlcigpLmludCgpLm1pbigxKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdGaXJzdCBsaW5lIHRvIHJlYWQgKDEtYmFzZWQpLiBEZWZhdWx0IDEuJyksXG4gICAgICAgICAgICBlbmRMaW5lOiB6Lm51bWJlcigpLmludCgpLm1pbigxKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdMYXN0IGxpbmUgdG8gcmVhZCAoMS1iYXNlZCwgaW5jbHVzaXZlKS4gRGVmYXVsdCBlbmQgb2YgZmlsZS4nKSxcbiAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBxdWVyeVRleHQoYXJnczogeyBmaWxlUGF0aDogc3RyaW5nOyBzdGFydExpbmU/OiBudW1iZXI7IGVuZExpbmU/OiBudW1iZXIgfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHIgPSByZXNvbHZlUGF0aEZvclJlYWQoYXJncy5maWxlUGF0aCk7XG4gICAgICAgIGlmICgnZXJyb3InIGluIHIpIHJldHVybiBmYWlsKHIuZXJyb3IpO1xuICAgICAgICBjb25zdCBzdGF0ID0gZnMuc3RhdFN5bmMoci5hYnMpO1xuICAgICAgICBpZiAoc3RhdC5zaXplID4gRklMRV9SRUFEX0JZVEVfQ0FQKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChgZmlsZS1lZGl0b3I6IGZpbGUgdG9vIGxhcmdlICgke3N0YXQuc2l6ZX0gYnl0ZXMpOyByZWZ1c2luZyB0byByZWFkLmApO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGNvbnRlbnQgPSBmcy5yZWFkRmlsZVN5bmMoci5hYnMsICd1dGYtOCcpO1xuICAgICAgICBjb25zdCB7IGxpbmVzLCBlb2wgfSA9IHNwbGl0TGluZXNOb3JtYWxpemVkKGNvbnRlbnQpO1xuICAgICAgICBjb25zdCB0b3RhbExpbmVzID0gbGluZXMubGVuZ3RoO1xuICAgICAgICBjb25zdCBmcm9tID0gKGFyZ3Muc3RhcnRMaW5lID8/IDEpIC0gMTtcbiAgICAgICAgY29uc3QgdG8gPSBhcmdzLmVuZExpbmUgPz8gdG90YWxMaW5lcztcbiAgICAgICAgaWYgKGZyb20gPj0gdG90YWxMaW5lcykge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoYGZpbGUtZWRpdG9yOiBzdGFydExpbmUgJHthcmdzLnN0YXJ0TGluZSA/PyAxfSBwYXN0IEVPRiAoZmlsZSBoYXMgJHt0b3RhbExpbmVzfSBsaW5lcylgKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoYXJncy5zdGFydExpbmUgIT09IHVuZGVmaW5lZCAmJiBhcmdzLmVuZExpbmUgIT09IHVuZGVmaW5lZCAmJiBhcmdzLnN0YXJ0TGluZSA+IGFyZ3MuZW5kTGluZSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ2ZpbGUtZWRpdG9yOiBzdGFydExpbmUgbXVzdCBiZSA8PSBlbmRMaW5lJyk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qgc2xpY2VkID0gbGluZXMuc2xpY2UoZnJvbSwgdG8pO1xuICAgICAgICBjb25zdCByZXN1bHQgPSBzbGljZWQubWFwKCh0ZXh0LCBpKSA9PiAoeyBsaW5lOiBmcm9tICsgaSArIDEsIHRleHQgfSkpO1xuICAgICAgICByZXR1cm4gb2soeyBmaWxlOiByLnJlbFByb2plY3QsIHRvdGFsTGluZXMsIHN0YXJ0TGluZTogZnJvbSArIDEsIGVuZExpbmU6IGZyb20gKyByZXN1bHQubGVuZ3RoLCBlb2w6IGVvbCA9PT0gJ1xcclxcbicgPyAnQ1JMRicgOiAnTEYnLCBsaW5lczogcmVzdWx0IH0sIGBSZWFkICR7cmVzdWx0Lmxlbmd0aH0gbGluZShzKSBmcm9tICR7ci5yZWxQcm9qZWN0fWApO1xuICAgIH1cbn1cbiJdfQ==