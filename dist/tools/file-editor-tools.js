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
        description: REDUNDANT_TAG + 'Insert a new line at the given 1-based line number. If line exceeds total, text is appended at end of file. Triggers cocos asset-db refresh on cocos-recognised extensions (.ts/.json/.scene/.prefab/etc.) so the editor reimports.',
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
        description: REDUNDANT_TAG + 'Delete a range of lines (1-based, inclusive). Triggers cocos asset-db refresh.',
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
    })
], FileEditorTools.prototype, "replaceText", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'query_text',
        title: 'Read line range',
        description: REDUNDANT_TAG + 'Read a range of lines (1-based, inclusive). Returns lines with line numbers; total line count of file in data.totalLines. Read-only; no asset-db refresh.',
        inputSchema: schema_1.z.object({
            filePath: schema_1.z.string().describe('Path to the file (absolute or project-relative).'),
            startLine: schema_1.z.number().int().min(1).optional().describe('First line to read (1-based). Default 1.'),
            endLine: schema_1.z.number().int().min(1).optional().describe('Last line to read (1-based, inclusive). Default end of file.'),
        }),
    })
], FileEditorTools.prototype, "queryText", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmlsZS1lZGl0b3ItdG9vbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvdG9vbHMvZmlsZS1lZGl0b3ItdG9vbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLDhDQUEyQztBQUMzQzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQXlCRztBQUVILHVDQUF5QjtBQUN6QiwyQ0FBNkI7QUFFN0IsMENBQWtDO0FBQ2xDLGtEQUF1RTtBQUN2RSxvQ0FBb0M7QUFFcEMsTUFBTSxhQUFhLEdBQUcsMEVBQTBFLENBQUM7QUFFakcsbUVBQW1FO0FBQ25FLHVDQUF1QztBQUN2QyxNQUFNLGtCQUFrQixHQUFHLENBQUMsR0FBRyxJQUFJLEdBQUcsSUFBSSxDQUFDO0FBRTNDLDBFQUEwRTtBQUMxRSxnRUFBZ0U7QUFDaEUsdUVBQXVFO0FBQ3ZFLHdFQUF3RTtBQUN4RSxrREFBa0Q7QUFDbEQsTUFBTSxtQkFBbUIsR0FBRyxDQUFDLEdBQUcsSUFBSSxHQUFHLElBQUksQ0FBQztBQUU1Qyw2RUFBNkU7QUFDN0UseUVBQXlFO0FBQ3pFLCtEQUErRDtBQUMvRCxNQUFNLFlBQVksR0FBMkIsTUFBQyxFQUFFLENBQUMsWUFBb0IsQ0FBQyxNQUFNLG1DQUFJLEVBQUUsQ0FBQyxZQUFZLENBQUM7QUFFaEcsMEVBQTBFO0FBQzFFLHdFQUF3RTtBQUN4RSx3RUFBd0U7QUFDeEUsa0VBQWtFO0FBQ2xFLHdEQUF3RDtBQUN4RCxTQUFTLFNBQVMsQ0FBQyxPQUFlO0lBQzlCLG1FQUFtRTtJQUNuRSxvRUFBb0U7SUFDcEUsa0VBQWtFO0lBQ2xFLE1BQU0sTUFBTSxHQUFHLE9BQU8sQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDO0lBQ3hF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QUFRLENBQUMsdURBQXVELENBQUM7U0FDM0csQ0FBQztLQUNMLENBQUM7a0RBdUREO0FBWUs7SUFWTCxJQUFBLG9CQUFPLEVBQUM7UUFDTCxJQUFJLEVBQUUsWUFBWTtRQUNsQixLQUFLLEVBQUUsaUJBQWlCO1FBQ3hCLFdBQVcsRUFBRSxhQUFhLEdBQUcsMkpBQTJKO1FBQ3hMLFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDO1lBQ2xCLFFBQVEsRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLGtEQUFrRCxDQUFDO1lBQ2pGLFNBQVMsRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDLFFBQVEsQ0FBQywwQ0FBMEMsQ0FBQztZQUNsRyxPQUFPLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxRQUFRLENBQUMsOERBQThELENBQUM7U0FDdkgsQ0FBQztLQUNMLENBQUM7Z0RBc0JEIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgb2ssIGZhaWwgfSBmcm9tICcuLi9saWIvcmVzcG9uc2UnO1xuLyoqXG4gKiBmaWxlLWVkaXRvci10b29scyDigJQgaG9zdC1zaWRlIGZzIG9wZXJhdGlvbnMgZm9yIGNsaWVudHMgd2l0aG91dFxuICogbmF0aXZlIGZpbGUgZWRpdGluZy5cbiAqXG4gKiBGb3VyIHRvb2xzIChTcGF5ZG8gY29jb3MtbWNwLWV4dGVuc2lvbiByb3V0ZSwgaGFyZGVuZWQpOlxuICogICAtIGZpbGVfZWRpdG9yX2luc2VydF90ZXh0ICAg4oCUIGluc2VydCBhdCAxLWJhc2VkIGxpbmVcbiAqICAgLSBmaWxlX2VkaXRvcl9kZWxldGVfbGluZXMgIOKAlCBkZWxldGUgcmFuZ2UsIDEtYmFzZWQgaW5jbHVzaXZlXG4gKiAgIC0gZmlsZV9lZGl0b3JfcmVwbGFjZV90ZXh0ICDigJQgZmluZC9yZXBsYWNlLCBwbGFpbiBvciByZWdleFxuICogICAtIGZpbGVfZWRpdG9yX3F1ZXJ5X3RleHQgICAg4oCUIHJlYWQgcmFuZ2UsIDEtYmFzZWRcbiAqXG4gKiBXaHkgd2Ugc2hpcCB0aGVzZSBldmVuIHRob3VnaCBDbGF1ZGUgQ29kZSBhbHJlYWR5IGhhcyBFZGl0L1dyaXRlOlxuICogICBNdWx0aS1jbGllbnQgYnJlYWR0aC4gQ2xhdWRlIERlc2t0b3AgLyBDbGluZSAvIENvbnRpbnVlIGhhdmUgbm9cbiAqICAgbmF0aXZlIGZpbGUgb3BzOyBBSSBvbiB0aG9zZSBjbGllbnRzIG11c3QgZ28gdGhyb3VnaCB0aGUgTUNQXG4gKiAgIHNlcnZlci4gVG9vbCBkZXNjcmlwdGlvbnMgY2FycnkgW2NsYXVkZS1jb2RlLXJlZHVuZGFudF0gc28gdGhlXG4gKiAgIHJhbmtlciBvbiBDbGF1ZGUgQ29kZSBwcmVmZXJzIHRoZSBJREUgdG9vbC5cbiAqXG4gKiBTcGF5ZG8ncyB1cHN0cmVhbSBoYWQgdHdvIGdhcHMgd2UgY2xvc2U6XG4gKiAgIDEuIHBhdGgtc2FmZXR5IGd1YXJkIHZpYSBwbGFpbiBgcGF0aC5yZXNvbHZlICsgc3RhcnRzV2l0aGAgaXNcbiAqICAgICAgc3ltbGluay11bnNhZmUg4oCUIGEgc3ltbGluayBpbnNpZGUgdGhlIHByb2plY3QgcG9pbnRpbmdcbiAqICAgICAgb3V0c2lkZSBzdGlsbCBwYXNzZXMuIFVzZSBgZnMucmVhbHBhdGhTeW5jLm5hdGl2ZWAgb24gYm90aFxuICogICAgICBzaWRlcyAoc2FtZSBmaXggdjIuNC45IGFwcGxpZWQgdG8gZGVidWdfZ2V0X3NjcmlwdF9kaWFnbm9zdGljX2NvbnRleHQpLlxuICogICAyLiBhc3NldC1kYiByZWZyZXNoIGhvb2sgbWlzc2luZzogY29jb3MgZWRpdG9yIGRvZXNuJ3QgcmVpbXBvcnRcbiAqICAgICAgYSAudHMvLmpzIHVudGlsIGFzc2V0LWRiIHNlZXMgYSByZWZyZXNoIGV2ZW50LiBDYWxsXG4gKiAgICAgIGBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdyZWZyZXNoJywgYWJzUGF0aClgIGFmdGVyXG4gKiAgICAgIGV2ZXJ5IHdyaXRlIHNvIHRoZSBlZGl0b3IgcGlja3MgdXAgdGhlIGNoYW5nZS5cbiAqL1xuXG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHR5cGUgeyBUb29sRGVmaW5pdGlvbiwgVG9vbFJlc3BvbnNlLCBUb29sRXhlY3V0b3IgfSBmcm9tICcuLi90eXBlcyc7XG5pbXBvcnQgeyB6IH0gZnJvbSAnLi4vbGliL3NjaGVtYSc7XG5pbXBvcnQgeyBtY3BUb29sLCBkZWZpbmVUb29sc0Zyb21EZWNvcmF0b3JzIH0gZnJvbSAnLi4vbGliL2RlY29yYXRvcnMnO1xuaW1wb3J0IHsgbG9nZ2VyIH0gZnJvbSAnLi4vbGliL2xvZyc7XG5cbmNvbnN0IFJFRFVOREFOVF9UQUcgPSAnW2NsYXVkZS1jb2RlLXJlZHVuZGFudF0gVXNlIEVkaXQvV3JpdGUgdG9vbCBmcm9tIHlvdXIgSURFIGlmIGF2YWlsYWJsZS4gJztcblxuLy8gUmVhZCBjYXAgdG8ga2VlcCB0b29sIHJlc3VsdCByZWFzb25hYmxlOyBtYXRjaGVzIHRoZSBjYXAgdXNlZCBieVxuLy8gZGVidWdfZ2V0X3NjcmlwdF9kaWFnbm9zdGljX2NvbnRleHQuXG5jb25zdCBGSUxFX1JFQURfQllURV9DQVAgPSA1ICogMTAyNCAqIDEwMjQ7XG5cbi8vIHYyLjUuMSByb3VuZC0xIHJldmlldyBmaXggKGNvZGV4ICsgY2xhdWRlICsgZ2VtaW5pIPCfn6EpOiByZWdleCBtb2RlIHJ1bnNcbi8vIG9uIGZpbGVzIHVwIHRvIEZJTEVfUkVBRF9CWVRFX0NBUCB3aXRob3V0IGEgcnVudGltZSBjYXAsIHNvIGFcbi8vIGNhdGFzdHJvcGhpYy1iYWNrdHJhY2tpbmcgcGF0dGVybiB3b3VsZCBoYW5nIHRoZSBlZGl0b3IgcHJvY2Vzcy4gQ2FwXG4vLyB0aGUgcmVnZXgtbW9kZSBib2R5IHRvIGEgc21hbGxlciB3aW5kb3cuIFBsYWluLXN0cmluZyBtb2RlIGlzIGJvdW5kZWRcbi8vIGJ5IFY4IHN0cmluZyBvcHMgc28gaXQgZG9lc24ndCBuZWVkIHRoaXMgZ3VhcmQuXG5jb25zdCBSRUdFWF9NT0RFX0JZVEVfQ0FQID0gMSAqIDEwMjQgKiAxMDI0O1xuXG4vLyB2Mi41LjEgcm91bmQtMSByZXZpZXcgZml4IChjb2RleCDwn5+hKTogZnMucmVhbHBhdGhTeW5jLm5hdGl2ZSBpcyBkb2N1bWVudGVkXG4vLyBzaW5jZSBOb2RlIDkuMiBidXQgYSBmZXcgY29jb3MtYnVuZGxlZCBOb2RlIGJ1aWxkcyBoaXN0b3JpY2FsbHkgZGlkbid0XG4vLyBleHBvc2UgaXQuIFJlc29sdmUgb25jZSBhdCBtb2R1bGUgbG9hZCB3aXRoIGEgc2FmZSBmYWxsYmFjay5cbmNvbnN0IHJlYWxwYXRoU3luYzogdHlwZW9mIGZzLnJlYWxwYXRoU3luYyA9IChmcy5yZWFscGF0aFN5bmMgYXMgYW55KS5uYXRpdmUgPz8gZnMucmVhbHBhdGhTeW5jO1xuXG4vLyB2Mi41LjEgcm91bmQtMSByZXZpZXcgZml4IChjbGF1ZGUg8J+foSk6IHByZXNlcnZlIGRvbWluYW50IGxpbmUgZW5kaW5nIHNvXG4vLyBlZGl0cyBkb24ndCBzaWxlbnRseSByZXdyaXRlIGEgV2luZG93cyBwcm9qZWN0J3MgQ1JMRiBsaW5lcyBhcyBMRi4gV2Vcbi8vIGRldGVjdCBieSBjb3VudGluZyBcXHJcXG4gdnMgbG9uZSBcXG4gaW4gdGhlIGZpbGUsIHRoZW4gcmUtam9pbiB3aXRoIHRoZVxuLy8gZG9taW5hbnQgc3R5bGUuIE5ldyBsaW5lcyBhZGRlZCBieSB0aGUgdXNlciAodmlhIGluc2VydF90ZXh0IG9yXG4vLyByZXBsYWNlX3RleHQpIGluaGVyaXQgd2hhdGV2ZXIgdGhlIGZpbGUgYWxyZWFkeSB1c2VzLlxuZnVuY3Rpb24gZGV0ZWN0RW9sKGNvbnRlbnQ6IHN0cmluZyk6ICdcXHJcXG4nIHwgJ1xcbicge1xuICAgIC8vIENvdW50IGxvbmUgXFxuIHZzIFxcclxcbiBpbiB0aGUgZmlyc3QgNEtCIOKAlCBzYW1wbGUgaXMgZW5vdWdoOyBtaXhlZFxuICAgIC8vIGZpbGVzIHBpY2sgd2hpY2hldmVyIGFwcGVhcnMgbW9yZSBpbiB0aGUgaGVhZC4gRWRnZSBjYXNlIChmaWxlIGlzXG4gICAgLy8gYWxsLUNSTEYgZXhjZXB0IGEgc2luZ2xlIExGIGluIHRoZSBtaWRkbGUpOiB3ZSBzdGlsbCBwaWNrIENSTEYuXG4gICAgY29uc3Qgc2FtcGxlID0gY29udGVudC5sZW5ndGggPiA0MDk2ID8gY29udGVudC5zbGljZSgwLCA0MDk2KSA6IGNvbnRlbnQ7XG4gICAgbGV0IGNybGYgPSAwO1xuICAgIGxldCBsZiA9IDA7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzYW1wbGUubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKHNhbXBsZS5jaGFyQ29kZUF0KGkpID09PSAweDBhIC8qIFxcbiAqLykge1xuICAgICAgICAgICAgaWYgKGkgPiAwICYmIHNhbXBsZS5jaGFyQ29kZUF0KGkgLSAxKSA9PT0gMHgwZCAvKiBcXHIgKi8pIGNybGYrKztcbiAgICAgICAgICAgIGVsc2UgbGYrKztcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gY3JsZiA+IGxmID8gJ1xcclxcbicgOiAnXFxuJztcbn1cblxuZnVuY3Rpb24gc3BsaXRMaW5lc05vcm1hbGl6ZWQoY29udGVudDogc3RyaW5nKTogeyBsaW5lczogc3RyaW5nW107IGVvbDogJ1xcclxcbicgfCAnXFxuJyB9IHtcbiAgICByZXR1cm4ge1xuICAgICAgICBsaW5lczogY29udGVudC5zcGxpdCgvXFxyP1xcbi8pLFxuICAgICAgICBlb2w6IGRldGVjdEVvbChjb250ZW50KSxcbiAgICB9O1xufVxuXG5pbnRlcmZhY2UgUmVzb2x2ZWRQYXRoIHsgYWJzOiBzdHJpbmc7IHJlbFByb2plY3Q6IHN0cmluZzsgfVxuXG5mdW5jdGlvbiBnZXRQcm9qZWN0UGF0aCgpOiBzdHJpbmcgfCBudWxsIHtcbiAgICB0cnkge1xuICAgICAgICByZXR1cm4gRWRpdG9yPy5Qcm9qZWN0Py5wYXRoID8/IG51bGw7XG4gICAgfSBjYXRjaCB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbn1cblxuLyoqXG4gKiBSZXNvbHZlIGEgdXNlci1zdXBwbGllZCBwYXRoIHRvIGFuIGFic29sdXRlLCBzeW1saW5rLXNhZmUgcGF0aFxuICogaW5zaWRlIHRoZSBwcm9qZWN0LiBSZXR1cm5zIHRoZSByZXNvbHZlZCBhYnNvbHV0ZSBwYXRoICsgdGhlXG4gKiBwcm9qZWN0LXJlbGF0aXZlIGZvcm0gKGZvciBmcmllbmRseSBtZXNzYWdlcykuIFRocm93cy1zdHlsZVxuICogeyBlcnJvciB9IGVudmVsb3BlIGZvciBjYWxsZXJzIHRvIHNob3J0LWNpcmN1aXQgb24uXG4gKlxuICogUGF0aCBzYWZldHk6XG4gKiAgIDEuIElmIGB0YXJnZXRgIGlzIHJlbGF0aXZlLCBqb2luZWQgdG8gcHJvamVjdFBhdGg7IGlmIGFic29sdXRlLFxuICogICAgICB1c2VkIGFzLWlzLlxuICogICAyLiBCb3RoIHRhcmdldCBhbmQgcHJvamVjdCByb290IGdvIHRocm91Z2ggYGZzLnJlYWxwYXRoU3luYy5uYXRpdmVgXG4gKiAgICAgIHNvIHN5bWxpbmtzIGFyZSBmb2xsb3dlZCBiZWZvcmUgdGhlIHByZWZpeCBjaGVjay5cbiAqICAgMy4gQ2FzZS1pbnNlbnNpdGl2ZSBjb21wYXJpc29uIG9uIFdpbmRvd3M7IGNhc2Utc2Vuc2l0aXZlIG9uIFBPU0lYLlxuICogICA0LiBTZXAgZ3VhcmQgYWdhaW5zdCBgL3Byb2otZm9vYCB2cyBgL3Byb2pgIHByZWZpeCBjb25mdXNpb24uXG4gKlxuICogQ2FsbGVyIE1VU1QgaGFuZGxlIHRoZSBtaXNzaW5nLXRhcmdldCBjYXNlIGZvciB3cml0ZSBvcGVyYXRpb25zXG4gKiAoaW5zZXJ0L3JlcGxhY2UvZGVsZXRlKSDigJQgd2Ugc3RpbGwgd2FudCB0byB3cml0ZSB0byBhIG5vbi1leGlzdGVudFxuICogZmlsZSB2aWEgdGhlIHJlbGF0aXZlLXBhdGggZmFsbGJhY2sgd2hlbiB0aGUgcGFyZW50IGRpcmVjdG9yeVxuICogZXhpc3RzLiBTZWUgYHJlc29sdmVQYXRoRm9yV3JpdGVgIGJlbG93LlxuICovXG5mdW5jdGlvbiByZXNvbHZlUGF0aEZvclJlYWQodGFyZ2V0OiBzdHJpbmcpOiBSZXNvbHZlZFBhdGggfCB7IGVycm9yOiBzdHJpbmcgfSB7XG4gICAgY29uc3QgcHJvamVjdFBhdGggPSBnZXRQcm9qZWN0UGF0aCgpO1xuICAgIGlmICghcHJvamVjdFBhdGgpIHtcbiAgICAgICAgcmV0dXJuIHsgZXJyb3I6ICdmaWxlLWVkaXRvcjogZWRpdG9yIGNvbnRleHQgdW5hdmFpbGFibGUgKG5vIEVkaXRvci5Qcm9qZWN0LnBhdGgpJyB9O1xuICAgIH1cbiAgICBjb25zdCBhYnNSYXcgPSBwYXRoLmlzQWJzb2x1dGUodGFyZ2V0KSA/IHRhcmdldCA6IHBhdGguam9pbihwcm9qZWN0UGF0aCwgdGFyZ2V0KTtcbiAgICBsZXQgcmVzb2x2ZWRBYnM6IHN0cmluZztcbiAgICB0cnkge1xuICAgICAgICByZXNvbHZlZEFicyA9IHJlYWxwYXRoU3luYyhhYnNSYXcpO1xuICAgIH0gY2F0Y2gge1xuICAgICAgICByZXR1cm4geyBlcnJvcjogYGZpbGUtZWRpdG9yOiBmaWxlIG5vdCBmb3VuZCBvciB1bnJlYWRhYmxlOiAke2Fic1Jhd31gIH07XG4gICAgfVxuICAgIGxldCBwcm9qZWN0QWJzOiBzdHJpbmc7XG4gICAgdHJ5IHtcbiAgICAgICAgcHJvamVjdEFicyA9IHJlYWxwYXRoU3luYyhwcm9qZWN0UGF0aCk7XG4gICAgfSBjYXRjaCB7XG4gICAgICAgIHByb2plY3RBYnMgPSBwYXRoLnJlc29sdmUocHJvamVjdFBhdGgpO1xuICAgIH1cbiAgICBjb25zdCBjbXAgPSBwcm9jZXNzLnBsYXRmb3JtID09PSAnd2luMzInXG4gICAgICAgID8geyByZXNvbHZlZDogcmVzb2x2ZWRBYnMudG9Mb3dlckNhc2UoKSwgcHJvamVjdDogcHJvamVjdEFicy50b0xvd2VyQ2FzZSgpIH1cbiAgICAgICAgOiB7IHJlc29sdmVkOiByZXNvbHZlZEFicywgcHJvamVjdDogcHJvamVjdEFicyB9O1xuICAgIGlmICghY21wLnJlc29sdmVkLnN0YXJ0c1dpdGgoY21wLnByb2plY3QgKyBwYXRoLnNlcCkgJiYgY21wLnJlc29sdmVkICE9PSBjbXAucHJvamVjdCkge1xuICAgICAgICByZXR1cm4geyBlcnJvcjogYGZpbGUtZWRpdG9yOiBwYXRoICR7cmVzb2x2ZWRBYnN9IHJlc29sdmVzIG91dHNpZGUgdGhlIHByb2plY3Qgcm9vdCAoc3ltbGluay1hd2FyZSBjaGVjaylgIH07XG4gICAgfVxuICAgIHJldHVybiB7IGFiczogcmVzb2x2ZWRBYnMsIHJlbFByb2plY3Q6IHBhdGgucmVsYXRpdmUocHJvamVjdEFicywgcmVzb2x2ZWRBYnMpIH07XG59XG5cbmNvbnN0IEFTU0VUX1JFRlJFU0hfRVhUUyA9IG5ldyBTZXQoWycudHMnLCAnLnRzeCcsICcuanMnLCAnLmpzeCcsICcuanNvbicsICcuZmlyZScsICcuc2NlbmUnLCAnLnByZWZhYicsICcuYW5pbScsICcubWF0ZXJpYWwnLCAnLmVmZmVjdCcsICcuZm50J10pO1xuXG4vKipcbiAqIEJlc3QtZWZmb3J0OiB0ZWxsIGNvY29zIGFzc2V0LWRiIHRoYXQgdGhlIGZpbGUgY2hhbmdlZCBzbyB0aGUgZWRpdG9yXG4gKiBwaWNrcyBpdCB1cCB3aXRob3V0IGEgbWFudWFsIHJlZnJlc2guIEZhaWx1cmUgaXMgbm9uLWZhdGFsIGJlY2F1c2VcbiAqIHRoZSBmaWxlIGlzIGFscmVhZHkgd3JpdHRlbjsgdGhlIHVzZXIgY2FuIGhpdCByZWZyZXNoIG1hbnVhbGx5LlxuICpcbiAqIE9ubHkgZmlyZXMgZm9yIGZpbGUgZXh0ZW5zaW9ucyBjb2NvcyBjYXJlcyBhYm91dCAoVFMgc291cmNlLCBKU09OXG4gKiBjb25maWdzLCBzY2VuZS9wcmVmYWIvYW5pbSBhc3NldHMsIGV0Yy4pIHNvIHBsYWluIC50eHQgZWRpdHMgZG9uJ3RcbiAqIHNwYW0gdGhlIGFzc2V0LWRiLlxuICovXG5hc3luYyBmdW5jdGlvbiByZWZyZXNoQXNzZXREYihhYnNQYXRoOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBleHQgPSBwYXRoLmV4dG5hbWUoYWJzUGF0aCkudG9Mb3dlckNhc2UoKTtcbiAgICBpZiAoIUFTU0VUX1JFRlJFU0hfRVhUUy5oYXMoZXh0KSkgcmV0dXJuO1xuICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3JlZnJlc2gtYXNzZXQnLCBhYnNQYXRoKTtcbiAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICBsb2dnZXIuZGVidWcoJ1tGaWxlRWRpdG9yXSBhc3NldC1kYiByZWZyZXNoLWFzc2V0IGZhaWxlZCAobm9uLWZhdGFsKTonLCBlcnI/Lm1lc3NhZ2UgPz8gZXJyKTtcbiAgICB9XG59XG5cbmV4cG9ydCBjbGFzcyBGaWxlRWRpdG9yVG9vbHMgaW1wbGVtZW50cyBUb29sRXhlY3V0b3Ige1xuICAgIHByaXZhdGUgcmVhZG9ubHkgZXhlYzogVG9vbEV4ZWN1dG9yO1xuXG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHRoaXMuZXhlYyA9IGRlZmluZVRvb2xzRnJvbURlY29yYXRvcnModGhpcyk7XG4gICAgfVxuXG4gICAgZ2V0VG9vbHMoKTogVG9vbERlZmluaXRpb25bXSB7XG4gICAgICAgIHJldHVybiB0aGlzLmV4ZWMuZ2V0VG9vbHMoKTtcbiAgICB9XG5cbiAgICBleGVjdXRlKHRvb2xOYW1lOiBzdHJpbmcsIGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLmV4ZWMuZXhlY3V0ZSh0b29sTmFtZSwgYXJncyk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnaW5zZXJ0X3RleHQnLFxuICAgICAgICB0aXRsZTogJ0luc2VydCB0ZXh0IGF0IGxpbmUnLFxuICAgICAgICBkZXNjcmlwdGlvbjogUkVEVU5EQU5UX1RBRyArICdJbnNlcnQgYSBuZXcgbGluZSBhdCB0aGUgZ2l2ZW4gMS1iYXNlZCBsaW5lIG51bWJlci4gSWYgbGluZSBleGNlZWRzIHRvdGFsLCB0ZXh0IGlzIGFwcGVuZGVkIGF0IGVuZCBvZiBmaWxlLiBUcmlnZ2VycyBjb2NvcyBhc3NldC1kYiByZWZyZXNoIG9uIGNvY29zLXJlY29nbmlzZWQgZXh0ZW5zaW9ucyAoLnRzLy5qc29uLy5zY2VuZS8ucHJlZmFiL2V0Yy4pIHNvIHRoZSBlZGl0b3IgcmVpbXBvcnRzLicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICBmaWxlUGF0aDogei5zdHJpbmcoKS5kZXNjcmliZSgnUGF0aCB0byB0aGUgZmlsZSAoYWJzb2x1dGUgb3IgcHJvamVjdC1yZWxhdGl2ZSkuJyksXG4gICAgICAgICAgICBsaW5lOiB6Lm51bWJlcigpLmludCgpLm1pbigxKS5kZXNjcmliZSgnMS1iYXNlZCBsaW5lIG51bWJlciB0byBpbnNlcnQgYXQ7IGV4aXN0aW5nIGxpbmVzIHNoaWZ0IGRvd24uJyksXG4gICAgICAgICAgICB0ZXh0OiB6LnN0cmluZygpLmRlc2NyaWJlKCdUZXh0IHRvIGluc2VydCBhcyBhIG5ldyBsaW5lIChubyB0cmFpbGluZyBuZXdsaW5lIGV4cGVjdGVkKS4nKSxcbiAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBpbnNlcnRUZXh0KGFyZ3M6IHsgZmlsZVBhdGg6IHN0cmluZzsgbGluZTogbnVtYmVyOyB0ZXh0OiBzdHJpbmcgfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHIgPSByZXNvbHZlUGF0aEZvclJlYWQoYXJncy5maWxlUGF0aCk7XG4gICAgICAgIGlmICgnZXJyb3InIGluIHIpIHJldHVybiBmYWlsKHIuZXJyb3IpO1xuICAgICAgICBjb25zdCBzdGF0ID0gZnMuc3RhdFN5bmMoci5hYnMpO1xuICAgICAgICBpZiAoc3RhdC5zaXplID4gRklMRV9SRUFEX0JZVEVfQ0FQKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChgZmlsZS1lZGl0b3I6IGZpbGUgdG9vIGxhcmdlICgke3N0YXQuc2l6ZX0gYnl0ZXMpOyByZWZ1c2luZyB0byByZWFkLmApO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGNvbnRlbnQgPSBmcy5yZWFkRmlsZVN5bmMoci5hYnMsICd1dGYtOCcpO1xuICAgICAgICBjb25zdCB7IGxpbmVzLCBlb2wgfSA9IHNwbGl0TGluZXNOb3JtYWxpemVkKGNvbnRlbnQpO1xuICAgICAgICBjb25zdCBpbnNlcnRJbmRleCA9IGFyZ3MubGluZSAtIDE7XG4gICAgICAgIGlmIChpbnNlcnRJbmRleCA+PSBsaW5lcy5sZW5ndGgpIHtcbiAgICAgICAgICAgIGxpbmVzLnB1c2goYXJncy50ZXh0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxpbmVzLnNwbGljZShpbnNlcnRJbmRleCwgMCwgYXJncy50ZXh0KTtcbiAgICAgICAgfVxuICAgICAgICBmcy53cml0ZUZpbGVTeW5jKHIuYWJzLCBsaW5lcy5qb2luKGVvbCksICd1dGYtOCcpO1xuICAgICAgICBhd2FpdCByZWZyZXNoQXNzZXREYihyLmFicyk7XG4gICAgICAgIHJldHVybiBvayh7IGZpbGU6IHIucmVsUHJvamVjdCwgdG90YWxMaW5lczogbGluZXMubGVuZ3RoLCBlb2w6IGVvbCA9PT0gJ1xcclxcbicgPyAnQ1JMRicgOiAnTEYnIH0sIGBJbnNlcnRlZCB0ZXh0IGF0IGxpbmUgJHtNYXRoLm1pbihhcmdzLmxpbmUsIGxpbmVzLmxlbmd0aCl9IG9mICR7ci5yZWxQcm9qZWN0fWApO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ2RlbGV0ZV9saW5lcycsXG4gICAgICAgIHRpdGxlOiAnRGVsZXRlIGxpbmUgcmFuZ2UnLFxuICAgICAgICBkZXNjcmlwdGlvbjogUkVEVU5EQU5UX1RBRyArICdEZWxldGUgYSByYW5nZSBvZiBsaW5lcyAoMS1iYXNlZCwgaW5jbHVzaXZlKS4gVHJpZ2dlcnMgY29jb3MgYXNzZXQtZGIgcmVmcmVzaC4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgZmlsZVBhdGg6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1BhdGggdG8gdGhlIGZpbGUgKGFic29sdXRlIG9yIHByb2plY3QtcmVsYXRpdmUpLicpLFxuICAgICAgICAgICAgc3RhcnRMaW5lOiB6Lm51bWJlcigpLmludCgpLm1pbigxKS5kZXNjcmliZSgnRmlyc3QgbGluZSB0byBkZWxldGUgKDEtYmFzZWQsIGluY2x1c2l2ZSkuJyksXG4gICAgICAgICAgICBlbmRMaW5lOiB6Lm51bWJlcigpLmludCgpLm1pbigxKS5kZXNjcmliZSgnTGFzdCBsaW5lIHRvIGRlbGV0ZSAoMS1iYXNlZCwgaW5jbHVzaXZlKS4gTXVzdCBiZSA+PSBzdGFydExpbmUuJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgZGVsZXRlTGluZXMoYXJnczogeyBmaWxlUGF0aDogc3RyaW5nOyBzdGFydExpbmU6IG51bWJlcjsgZW5kTGluZTogbnVtYmVyIH0pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBpZiAoYXJncy5zdGFydExpbmUgPiBhcmdzLmVuZExpbmUpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKCdmaWxlLWVkaXRvcjogc3RhcnRMaW5lIG11c3QgYmUgPD0gZW5kTGluZScpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHIgPSByZXNvbHZlUGF0aEZvclJlYWQoYXJncy5maWxlUGF0aCk7XG4gICAgICAgIGlmICgnZXJyb3InIGluIHIpIHJldHVybiBmYWlsKHIuZXJyb3IpO1xuICAgICAgICBjb25zdCBzdGF0ID0gZnMuc3RhdFN5bmMoci5hYnMpO1xuICAgICAgICBpZiAoc3RhdC5zaXplID4gRklMRV9SRUFEX0JZVEVfQ0FQKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChgZmlsZS1lZGl0b3I6IGZpbGUgdG9vIGxhcmdlICgke3N0YXQuc2l6ZX0gYnl0ZXMpOyByZWZ1c2luZyB0byByZWFkLmApO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGNvbnRlbnQgPSBmcy5yZWFkRmlsZVN5bmMoci5hYnMsICd1dGYtOCcpO1xuICAgICAgICBjb25zdCB7IGxpbmVzLCBlb2wgfSA9IHNwbGl0TGluZXNOb3JtYWxpemVkKGNvbnRlbnQpO1xuICAgICAgICBjb25zdCBkZWxldGVTdGFydCA9IGFyZ3Muc3RhcnRMaW5lIC0gMTtcbiAgICAgICAgY29uc3QgcmVxdWVzdGVkQ291bnQgPSBhcmdzLmVuZExpbmUgLSBhcmdzLnN0YXJ0TGluZSArIDE7XG4gICAgICAgIGNvbnN0IGRlbGV0ZWRDb3VudCA9IE1hdGgubWF4KDAsIE1hdGgubWluKHJlcXVlc3RlZENvdW50LCBsaW5lcy5sZW5ndGggLSBkZWxldGVTdGFydCkpO1xuICAgICAgICBpZiAoZGVsZXRlZENvdW50ID09PSAwKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChgZmlsZS1lZGl0b3I6IHJhbmdlICR7YXJncy5zdGFydExpbmV9LSR7YXJncy5lbmRMaW5lfSBpcyBwYXN0IEVPRiAoZmlsZSBoYXMgJHtsaW5lcy5sZW5ndGh9IGxpbmVzKWApO1xuICAgICAgICB9XG4gICAgICAgIGxpbmVzLnNwbGljZShkZWxldGVTdGFydCwgZGVsZXRlZENvdW50KTtcbiAgICAgICAgZnMud3JpdGVGaWxlU3luYyhyLmFicywgbGluZXMuam9pbihlb2wpLCAndXRmLTgnKTtcbiAgICAgICAgYXdhaXQgcmVmcmVzaEFzc2V0RGIoci5hYnMpO1xuICAgICAgICByZXR1cm4gb2soeyBmaWxlOiByLnJlbFByb2plY3QsIGRlbGV0ZWRDb3VudCwgdG90YWxMaW5lczogbGluZXMubGVuZ3RoLCBlb2w6IGVvbCA9PT0gJ1xcclxcbicgPyAnQ1JMRicgOiAnTEYnIH0sIGBEZWxldGVkICR7ZGVsZXRlZENvdW50fSBsaW5lKHMpIGZyb20gbGluZSAke2FyZ3Muc3RhcnRMaW5lfSB0byAke2FyZ3Muc3RhcnRMaW5lICsgZGVsZXRlZENvdW50IC0gMX0gb2YgJHtyLnJlbFByb2plY3R9YCk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAncmVwbGFjZV90ZXh0JyxcbiAgICAgICAgdGl0bGU6ICdSZXBsYWNlIHRleHQgaW4gZmlsZScsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBSRURVTkRBTlRfVEFHICsgJ0ZpbmQvcmVwbGFjZSB0ZXh0IGluIGEgZmlsZS4gUGxhaW4gc3RyaW5nIGJ5IGRlZmF1bHQ7IHBhc3MgdXNlUmVnZXg6dHJ1ZSB0byBpbnRlcnByZXQgc2VhcmNoIGFzIGEgcmVnZXguIFJlcGxhY2VzIGZpcnN0IG9jY3VycmVuY2Ugb25seSB1bmxlc3MgcmVwbGFjZUFsbDp0cnVlLiBSZWdleCBiYWNrcmVmZXJlbmNlcyAoJDEsICQmLCAkYCwgJFxcJykgd29yayB3aGVuIHVzZVJlZ2V4OnRydWUuIFRyaWdnZXJzIGNvY29zIGFzc2V0LWRiIHJlZnJlc2guJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIGZpbGVQYXRoOiB6LnN0cmluZygpLmRlc2NyaWJlKCdQYXRoIHRvIHRoZSBmaWxlIChhYnNvbHV0ZSBvciBwcm9qZWN0LXJlbGF0aXZlKS4nKSxcbiAgICAgICAgICAgIC8vIHYyLjUuMSByb3VuZC0xIHJldmlldyBmaXggKGNvZGV4ICsgY2xhdWRlIPCfn6EpOiBlbXB0eSBzZWFyY2ggd291bGRcbiAgICAgICAgICAgIC8vIGVpdGhlciBpbnNlcnQgYmV0d2VlbiBldmVyeSBjaGFyIChyZXBsYWNlQWxsKSBvciBpbnNlcnQgYXQgYnl0ZSAwXG4gICAgICAgICAgICAvLyAoZmlyc3Qtb25seSkg4oCUIGJvdGggc3VycHJpc2luZy4gUmVqZWN0IGVhcmx5LlxuICAgICAgICAgICAgc2VhcmNoOiB6LnN0cmluZygpLm1pbigxLCAnc2VhcmNoIG11c3QgYmUgbm9uLWVtcHR5JykuZGVzY3JpYmUoJ1NlYXJjaCB0ZXh0IG9yIHJlZ2V4IHBhdHRlcm4gKGRlcGVuZHMgb24gdXNlUmVnZXgpLiBNdXN0IGJlIG5vbi1lbXB0eS4nKSxcbiAgICAgICAgICAgIHJlcGxhY2U6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1JlcGxhY2VtZW50IHRleHQuIFJlZ2V4IGJhY2tyZWZlcmVuY2VzICgkMSwgJCYsICRgLCAkXFwnKSBleHBhbmQgd2hlbiB1c2VSZWdleDp0cnVlLicpLFxuICAgICAgICAgICAgdXNlUmVnZXg6IHouYm9vbGVhbigpLmRlZmF1bHQoZmFsc2UpLmRlc2NyaWJlKCdUcmVhdCBgc2VhcmNoYCBhcyBhIEpTIFJlZ0V4cCBzb3VyY2Ugc3RyaW5nLiBEZWZhdWx0IGZhbHNlLicpLFxuICAgICAgICAgICAgcmVwbGFjZUFsbDogei5ib29sZWFuKCkuZGVmYXVsdChmYWxzZSkuZGVzY3JpYmUoJ1JlcGxhY2UgZXZlcnkgb2NjdXJyZW5jZS4gRGVmYXVsdCBmYWxzZSAoZmlyc3Qgb25seSkuJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgcmVwbGFjZVRleHQoYXJnczogeyBmaWxlUGF0aDogc3RyaW5nOyBzZWFyY2g6IHN0cmluZzsgcmVwbGFjZTogc3RyaW5nOyB1c2VSZWdleDogYm9vbGVhbjsgcmVwbGFjZUFsbDogYm9vbGVhbiB9KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgciA9IHJlc29sdmVQYXRoRm9yUmVhZChhcmdzLmZpbGVQYXRoKTtcbiAgICAgICAgaWYgKCdlcnJvcicgaW4gcikgcmV0dXJuIGZhaWwoci5lcnJvcik7XG4gICAgICAgIGNvbnN0IHN0YXQgPSBmcy5zdGF0U3luYyhyLmFicyk7XG4gICAgICAgIGlmIChzdGF0LnNpemUgPiBGSUxFX1JFQURfQllURV9DQVApIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGBmaWxlLWVkaXRvcjogZmlsZSB0b28gbGFyZ2UgKCR7c3RhdC5zaXplfSBieXRlcyk7IHJlZnVzaW5nIHRvIHJlYWQuYCk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gdjIuNS4xIHJvdW5kLTEgcmV2aWV3IGZpeCAoY29kZXggKyBjbGF1ZGUgKyBnZW1pbmkg8J+foSk6IHJlZ2V4XG4gICAgICAgIC8vIG1vZGUgcnVucyB1c2VyLWNvbnRyb2xsZWQgcGF0dGVybnMgYWdhaW5zdCB0aGUgZmlsZSBjb250ZW50XG4gICAgICAgIC8vIHdpdGggbm8gdGltZW91dC4gQ2FwIHRvIGEgc21hbGxlciB3aW5kb3cgaW4gcmVnZXggbW9kZSBzb1xuICAgICAgICAvLyBjYXRhc3Ryb3BoaWMgYmFja3RyYWNraW5nIG9uIGEgbGFyZ2UgZmlsZSBjYW4ndCBoYW5nIHRoZVxuICAgICAgICAvLyBlZGl0b3IncyBob3N0IHByb2Nlc3MuIFBsYWluLXN0cmluZyBtb2RlIGtlZXBzIHRoZSBsYXJnZXJcbiAgICAgICAgLy8gRklMRV9SRUFEX0JZVEVfQ0FQIGJlY2F1c2UgU3RyaW5nLnNwbGl0L2luZGV4T2Yvc2xpY2UgYXJlXG4gICAgICAgIC8vIGJvdW5kZWQgYnkgVjggaW50ZXJuYWxzIChubyByZWdleCBlbmdpbmUgcGF0aCkuXG4gICAgICAgIGlmIChhcmdzLnVzZVJlZ2V4ICYmIHN0YXQuc2l6ZSA+IFJFR0VYX01PREVfQllURV9DQVApIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGBmaWxlLWVkaXRvcjogcmVnZXggbW9kZSByZWZ1c2VzIGZpbGVzID4gJHtSRUdFWF9NT0RFX0JZVEVfQ0FQfSBieXRlcyAoJHtzdGF0LnNpemV9IGJ5dGVzIGhlcmUpLiBTd2l0Y2ggdG8gdXNlUmVnZXg6ZmFsc2Ugb3Igc3BsaXQgdGhlIGZpbGUgZmlyc3QuYCk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgY29udGVudCA9IGZzLnJlYWRGaWxlU3luYyhyLmFicywgJ3V0Zi04Jyk7XG4gICAgICAgIGxldCByZXBsYWNlbWVudHMgPSAwO1xuICAgICAgICBsZXQgbmV3Q29udGVudDogc3RyaW5nO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgaWYgKGFyZ3MudXNlUmVnZXgpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBmbGFncyA9IGFyZ3MucmVwbGFjZUFsbCA/ICdnJyA6ICcnO1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlZ2V4ID0gbmV3IFJlZ0V4cChhcmdzLnNlYXJjaCwgZmxhZ3MpO1xuICAgICAgICAgICAgICAgIC8vIHYyLjUuMSByb3VuZC0xIHJldmlldyBmaXggKGNvZGV4IPCflLQpOiBwYXNzIHRoZSByZXBsYWNlbWVudFxuICAgICAgICAgICAgICAgIC8vIFNUUklORyBkaXJlY3RseSBzbyAkMS8kJi9ldGMuIGV4cGFuZC4gVGhlIHByZXZpb3VzXG4gICAgICAgICAgICAgICAgLy8gZnVuY3Rpb24tY2FsbGJhY2sgZm9ybSByZXR1cm5lZCBgYXJncy5yZXBsYWNlYCBsaXRlcmFsbHksXG4gICAgICAgICAgICAgICAgLy8gYnJlYWtpbmcgdGhlIGRvY3VtZW50ZWQgYmFja3JlZmVyZW5jZSBiZWhhdmlvdXIuIENvdW50XG4gICAgICAgICAgICAgICAgLy8gbWF0Y2hlcyBzZXBhcmF0ZWx5IHZpYSBhIHBhcmFsbGVsIG1hdGNoKCkgcGFzcyBzaW5jZSB3ZVxuICAgICAgICAgICAgICAgIC8vIG5vIGxvbmdlciBoYXZlIHRoZSBwZXItY2FsbCBjb3VudGVyLlxuICAgICAgICAgICAgICAgIGNvbnN0IG1hdGNoZXMgPSBjb250ZW50Lm1hdGNoKHJlZ2V4KTtcbiAgICAgICAgICAgICAgICByZXBsYWNlbWVudHMgPSBtYXRjaGVzID8gbWF0Y2hlcy5sZW5ndGggOiAwO1xuICAgICAgICAgICAgICAgIG5ld0NvbnRlbnQgPSBjb250ZW50LnJlcGxhY2UocmVnZXgsIGFyZ3MucmVwbGFjZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGFyZ3MucmVwbGFjZUFsbCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHBhcnRzID0gY29udGVudC5zcGxpdChhcmdzLnNlYXJjaCk7XG4gICAgICAgICAgICAgICAgcmVwbGFjZW1lbnRzID0gcGFydHMubGVuZ3RoIC0gMTtcbiAgICAgICAgICAgICAgICBuZXdDb250ZW50ID0gcGFydHMuam9pbihhcmdzLnJlcGxhY2UpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zdCBpZHggPSBjb250ZW50LmluZGV4T2YoYXJncy5zZWFyY2gpO1xuICAgICAgICAgICAgICAgIGlmIChpZHggPT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBvayh7IGZpbGU6IHIucmVsUHJvamVjdCwgcmVwbGFjZW1lbnRzOiAwIH0sICdObyBvY2N1cnJlbmNlcyBmb3VuZDsgZmlsZSB1bmNoYW5nZWQuJyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJlcGxhY2VtZW50cyA9IDE7XG4gICAgICAgICAgICAgICAgbmV3Q29udGVudCA9IGNvbnRlbnQuc2xpY2UoMCwgaWR4KSArIGFyZ3MucmVwbGFjZSArIGNvbnRlbnQuc2xpY2UoaWR4ICsgYXJncy5zZWFyY2gubGVuZ3RoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGBmaWxlLWVkaXRvcjogcmVwbGFjZSBmYWlsZWQ6ICR7ZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpfWApO1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZXBsYWNlbWVudHMgPT09IDApIHtcbiAgICAgICAgICAgIHJldHVybiBvayh7IGZpbGU6IHIucmVsUHJvamVjdCwgcmVwbGFjZW1lbnRzOiAwIH0sICdObyBvY2N1cnJlbmNlcyBmb3VuZDsgZmlsZSB1bmNoYW5nZWQuJyk7XG4gICAgICAgIH1cbiAgICAgICAgZnMud3JpdGVGaWxlU3luYyhyLmFicywgbmV3Q29udGVudCwgJ3V0Zi04Jyk7XG4gICAgICAgIGF3YWl0IHJlZnJlc2hBc3NldERiKHIuYWJzKTtcbiAgICAgICAgcmV0dXJuIG9rKHsgZmlsZTogci5yZWxQcm9qZWN0LCByZXBsYWNlbWVudHMgfSwgYFJlcGxhY2VkICR7cmVwbGFjZW1lbnRzfSBvY2N1cnJlbmNlKHMpIGluICR7ci5yZWxQcm9qZWN0fWApO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ3F1ZXJ5X3RleHQnLFxuICAgICAgICB0aXRsZTogJ1JlYWQgbGluZSByYW5nZScsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBSRURVTkRBTlRfVEFHICsgJ1JlYWQgYSByYW5nZSBvZiBsaW5lcyAoMS1iYXNlZCwgaW5jbHVzaXZlKS4gUmV0dXJucyBsaW5lcyB3aXRoIGxpbmUgbnVtYmVyczsgdG90YWwgbGluZSBjb3VudCBvZiBmaWxlIGluIGRhdGEudG90YWxMaW5lcy4gUmVhZC1vbmx5OyBubyBhc3NldC1kYiByZWZyZXNoLicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICBmaWxlUGF0aDogei5zdHJpbmcoKS5kZXNjcmliZSgnUGF0aCB0byB0aGUgZmlsZSAoYWJzb2x1dGUgb3IgcHJvamVjdC1yZWxhdGl2ZSkuJyksXG4gICAgICAgICAgICBzdGFydExpbmU6IHoubnVtYmVyKCkuaW50KCkubWluKDEpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0ZpcnN0IGxpbmUgdG8gcmVhZCAoMS1iYXNlZCkuIERlZmF1bHQgMS4nKSxcbiAgICAgICAgICAgIGVuZExpbmU6IHoubnVtYmVyKCkuaW50KCkubWluKDEpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0xhc3QgbGluZSB0byByZWFkICgxLWJhc2VkLCBpbmNsdXNpdmUpLiBEZWZhdWx0IGVuZCBvZiBmaWxlLicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIHF1ZXJ5VGV4dChhcmdzOiB7IGZpbGVQYXRoOiBzdHJpbmc7IHN0YXJ0TGluZT86IG51bWJlcjsgZW5kTGluZT86IG51bWJlciB9KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgciA9IHJlc29sdmVQYXRoRm9yUmVhZChhcmdzLmZpbGVQYXRoKTtcbiAgICAgICAgaWYgKCdlcnJvcicgaW4gcikgcmV0dXJuIGZhaWwoci5lcnJvcik7XG4gICAgICAgIGNvbnN0IHN0YXQgPSBmcy5zdGF0U3luYyhyLmFicyk7XG4gICAgICAgIGlmIChzdGF0LnNpemUgPiBGSUxFX1JFQURfQllURV9DQVApIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGBmaWxlLWVkaXRvcjogZmlsZSB0b28gbGFyZ2UgKCR7c3RhdC5zaXplfSBieXRlcyk7IHJlZnVzaW5nIHRvIHJlYWQuYCk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgY29udGVudCA9IGZzLnJlYWRGaWxlU3luYyhyLmFicywgJ3V0Zi04Jyk7XG4gICAgICAgIGNvbnN0IHsgbGluZXMsIGVvbCB9ID0gc3BsaXRMaW5lc05vcm1hbGl6ZWQoY29udGVudCk7XG4gICAgICAgIGNvbnN0IHRvdGFsTGluZXMgPSBsaW5lcy5sZW5ndGg7XG4gICAgICAgIGNvbnN0IGZyb20gPSAoYXJncy5zdGFydExpbmUgPz8gMSkgLSAxO1xuICAgICAgICBjb25zdCB0byA9IGFyZ3MuZW5kTGluZSA/PyB0b3RhbExpbmVzO1xuICAgICAgICBpZiAoZnJvbSA+PSB0b3RhbExpbmVzKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChgZmlsZS1lZGl0b3I6IHN0YXJ0TGluZSAke2FyZ3Muc3RhcnRMaW5lID8/IDF9IHBhc3QgRU9GIChmaWxlIGhhcyAke3RvdGFsTGluZXN9IGxpbmVzKWApO1xuICAgICAgICB9XG4gICAgICAgIGlmIChhcmdzLnN0YXJ0TGluZSAhPT0gdW5kZWZpbmVkICYmIGFyZ3MuZW5kTGluZSAhPT0gdW5kZWZpbmVkICYmIGFyZ3Muc3RhcnRMaW5lID4gYXJncy5lbmRMaW5lKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbCgnZmlsZS1lZGl0b3I6IHN0YXJ0TGluZSBtdXN0IGJlIDw9IGVuZExpbmUnKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBzbGljZWQgPSBsaW5lcy5zbGljZShmcm9tLCB0byk7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IHNsaWNlZC5tYXAoKHRleHQsIGkpID0+ICh7IGxpbmU6IGZyb20gKyBpICsgMSwgdGV4dCB9KSk7XG4gICAgICAgIHJldHVybiBvayh7IGZpbGU6IHIucmVsUHJvamVjdCwgdG90YWxMaW5lcywgc3RhcnRMaW5lOiBmcm9tICsgMSwgZW5kTGluZTogZnJvbSArIHJlc3VsdC5sZW5ndGgsIGVvbDogZW9sID09PSAnXFxyXFxuJyA/ICdDUkxGJyA6ICdMRicsIGxpbmVzOiByZXN1bHQgfSwgYFJlYWQgJHtyZXN1bHQubGVuZ3RofSBsaW5lKHMpIGZyb20gJHtyLnJlbFByb2plY3R9YCk7XG4gICAgfVxufVxuIl19