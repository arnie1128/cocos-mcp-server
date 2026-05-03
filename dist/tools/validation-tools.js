"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValidationTools = void 0;
const response_1 = require("../lib/response");
const schema_1 = require("../lib/schema");
const decorators_1 = require("../lib/decorators");
const scene_bridge_1 = require("../lib/scene-bridge");
const MAX_SNAPSHOTS = 20;
const _snapshots = new Map();
let _snapshotSeq = 0;
class ValidationTools {
    constructor() {
        this.exec = (0, decorators_1.defineToolsFromDecorators)(this);
    }
    getTools() { return this.exec.getTools(); }
    execute(toolName, args) { return this.exec.execute(toolName, args); }
    async takeSnapshot(args = {}) {
        var _a, _b, _c, _d;
        const result = await (0, scene_bridge_1.runSceneMethodAsToolResponse)('takeSceneSnapshot');
        if (!result.success)
            return result;
        const data = (_a = result.data) !== null && _a !== void 0 ? _a : {};
        const id = `snap-${++_snapshotSeq}`;
        const label = ((_b = args.label) === null || _b === void 0 ? void 0 : _b.trim()) || id;
        const takenAt = new Date().toISOString();
        const entry = {
            id,
            label,
            takenAt,
            sceneName: (_c = data.sceneName) !== null && _c !== void 0 ? _c : '',
            rootUuids: Array.isArray(data.rootUuids) ? data.rootUuids : [],
            nodes: (_d = data.nodes) !== null && _d !== void 0 ? _d : {},
        };
        _snapshots.set(id, entry);
        while (_snapshots.size > MAX_SNAPSHOTS) {
            const oldest = _snapshots.keys().next().value;
            if (!oldest)
                break;
            _snapshots.delete(oldest);
        }
        return (0, response_1.ok)({
            id,
            label,
            takenAt,
            sceneName: entry.sceneName,
            nodeCount: Object.keys(entry.nodes).length,
        });
    }
    async compareSnapshots(args) {
        var _a, _b;
        const base = _snapshots.get(args.baseId);
        const head = _snapshots.get(args.headId);
        if (!base)
            return (0, response_1.fail)(`Snapshot ${args.baseId} not found`);
        if (!head)
            return (0, response_1.fail)(`Snapshot ${args.headId} not found`);
        const baseNodes = (_a = base.nodes) !== null && _a !== void 0 ? _a : {};
        const headNodes = (_b = head.nodes) !== null && _b !== void 0 ? _b : {};
        const added = Object.keys(headNodes)
            .filter(uuid => !baseNodes[uuid])
            .map(uuid => headNodes[uuid]);
        const removed = Object.keys(baseNodes)
            .filter(uuid => !headNodes[uuid])
            .map(uuid => baseNodes[uuid]);
        const modified = Object.keys(headNodes)
            .filter(uuid => baseNodes[uuid])
            .map(uuid => {
            var _a, _b;
            const before = baseNodes[uuid];
            const after = headNodes[uuid];
            const fields = ['name', 'active', 'position', 'rotation', 'scale', 'components', 'childUuids']
                .filter(field => JSON.stringify(before === null || before === void 0 ? void 0 : before[field]) !== JSON.stringify(after === null || after === void 0 ? void 0 : after[field]));
            const changes = {};
            for (const field of fields) {
                changes[field] = { before: before === null || before === void 0 ? void 0 : before[field], after: after === null || after === void 0 ? void 0 : after[field] };
            }
            return { uuid, name: (_b = (_a = after === null || after === void 0 ? void 0 : after.name) !== null && _a !== void 0 ? _a : before === null || before === void 0 ? void 0 : before.name) !== null && _b !== void 0 ? _b : '', fields, changes };
        })
            .filter(change => change.fields.length > 0);
        return (0, response_1.ok)({
            base: { id: base.id, label: base.label, takenAt: base.takenAt, sceneName: base.sceneName },
            head: { id: head.id, label: head.label, takenAt: head.takenAt, sceneName: head.sceneName },
            summary: {
                added: added.length,
                removed: removed.length,
                modified: modified.length,
                baseNodeCount: Object.keys(baseNodes).length,
                headNodeCount: Object.keys(headNodes).length,
            },
            added,
            removed,
            modified,
        });
    }
    async validateJsonParams(args) {
        const { jsonString, expectedSchema } = args;
        // First try to parse as-is
        let parsed;
        try {
            parsed = JSON.parse(jsonString);
        }
        catch (error) {
            // Try to fix common issues
            const fixed = this.fixJsonString(jsonString);
            try {
                parsed = JSON.parse(fixed);
            }
            catch (secondError) {
                return (0, response_1.fail)(`Cannot fix JSON: ${error.message}`, {
                    originalJson: jsonString,
                    fixedAttempt: fixed,
                    suggestions: this.getJsonFixSuggestions(jsonString)
                });
            }
        }
        // Validate against schema if provided
        if (expectedSchema) {
            const validation = this.validateAgainstSchema(parsed, expectedSchema);
            if (!validation.valid) {
                return (0, response_1.fail)('Schema validation failed', {
                    parsedJson: parsed,
                    validationErrors: validation.errors,
                    suggestions: validation.suggestions
                });
            }
        }
        return (0, response_1.ok)({
            parsedJson: parsed,
            fixedJson: JSON.stringify(parsed, null, 2),
            isValid: true
        });
    }
    async safeStringValue(args) {
        const { value } = args;
        const safeValue = this.escapJsonString(value);
        return (0, response_1.ok)({
            originalValue: value,
            safeValue: safeValue,
            jsonReady: JSON.stringify(safeValue),
            usage: `Use "${safeValue}" in your JSON parameters`
        });
    }
    async formatMcpRequest(args) {
        const toolName = args.toolName;
        const toolArgs = args.arguments;
        try {
            const mcpRequest = {
                jsonrpc: '2.0',
                id: Date.now(),
                method: 'tools/call',
                params: {
                    name: toolName,
                    arguments: toolArgs
                }
            };
            const formattedJson = JSON.stringify(mcpRequest, null, 2);
            const compactJson = JSON.stringify(mcpRequest);
            return (0, response_1.ok)({
                request: mcpRequest,
                formattedJson: formattedJson,
                compactJson: compactJson,
                curlCommand: this.generateCurlCommand(compactJson)
            });
        }
        catch (error) {
            return (0, response_1.fail)(`Failed to format MCP request: ${error.message}`);
        }
    }
    fixJsonString(jsonStr) {
        let fixed = jsonStr;
        // Fix common escape character issues
        fixed = fixed
            // Fix unescaped quotes in string values
            .replace(/(\{[^}]*"[^"]*":\s*")([^"]*")([^"]*")([^}]*\})/g, (match, prefix, content, suffix, end) => {
            const escapedContent = content.replace(/"/g, '\\"');
            return prefix + escapedContent + suffix + end;
        })
            // Fix unescaped backslashes
            .replace(/([^\\])\\([^"\\\/bfnrtu])/g, '$1\\\\$2')
            // Fix trailing commas
            .replace(/,(\s*[}\]])/g, '$1')
            // Fix control characters
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r')
            .replace(/\t/g, '\\t')
            // Fix single quotes to double quotes
            .replace(/'/g, '"');
        return fixed;
    }
    escapJsonString(str) {
        return str
            .replace(/\\/g, '\\\\') // Escape backslashes first
            .replace(/"/g, '\\"') // Escape quotes
            .replace(/\n/g, '\\n') // Escape newlines
            .replace(/\r/g, '\\r') // Escape carriage returns
            .replace(/\t/g, '\\t') // Escape tabs
            .replace(/\f/g, '\\f') // Escape form feeds
            .replace(/\b/g, '\\b'); // Escape backspaces
    }
    validateAgainstSchema(data, schema) {
        const errors = [];
        const suggestions = [];
        // Basic type checking
        if (schema.type) {
            const actualType = Array.isArray(data) ? 'array' : typeof data;
            if (actualType !== schema.type) {
                errors.push(`Expected type ${schema.type}, got ${actualType}`);
                suggestions.push(`Convert value to ${schema.type}`);
            }
        }
        // Required fields checking
        if (schema.required && Array.isArray(schema.required)) {
            for (const field of schema.required) {
                if (!Object.prototype.hasOwnProperty.call(data, field)) {
                    errors.push(`Missing required field: ${field}`);
                    suggestions.push(`Add required field "${field}"`);
                }
            }
        }
        return {
            valid: errors.length === 0,
            errors,
            suggestions
        };
    }
    getJsonFixSuggestions(jsonStr) {
        const suggestions = [];
        if (jsonStr.includes('\\"')) {
            suggestions.push('Check for improperly escaped quotes');
        }
        if (jsonStr.includes("'")) {
            suggestions.push('Replace single quotes with double quotes');
        }
        if (jsonStr.includes('\n') || jsonStr.includes('\t')) {
            suggestions.push('Escape newlines and tabs properly');
        }
        if (jsonStr.match(/,\s*[}\]]/)) {
            suggestions.push('Remove trailing commas');
        }
        return suggestions;
    }
    generateCurlCommand(jsonStr) {
        const escapedJson = jsonStr.replace(/'/g, "'\"'\"'");
        return `curl -X POST http://127.0.0.1:8585/mcp \\
  -H "Content-Type: application/json" \\
  -d '${escapedJson}'`;
    }
}
exports.ValidationTools = ValidationTools;
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'take_snapshot',
        title: 'Take scene snapshot',
        description: '[specialist] Capture a flat scene node snapshot (positions, components, hierarchy) for later diff with compare_snapshots. Session-scoped — snapshots are lost on extension reload. No scene mutations.',
        inputSchema: schema_1.z.object({
            label: schema_1.z.string().optional().describe('Optional human-readable label for this snapshot.'),
        }),
    })
], ValidationTools.prototype, "takeSnapshot", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'compare_snapshots',
        title: 'Compare scene snapshots',
        description: '[specialist] Compare two stored scene snapshots by ID and report node-level diff: added, removed, and modified nodes with field-level change list.',
        inputSchema: schema_1.z.object({
            baseId: schema_1.z.string().describe('Snapshot id to use as the comparison base.'),
            headId: schema_1.z.string().describe('Snapshot id to compare against the base.'),
        }),
    })
], ValidationTools.prototype, "compareSnapshots", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'validate_json_params',
        title: 'Validate/repair JSON args',
        description: '[specialist] Validate and lightly repair a JSON argument string before calling another tool. No Cocos side effects; useful for diagnosing escaping or required-field errors.',
        inputSchema: schema_1.z.object({
            jsonString: schema_1.z.string().describe('JSON string to parse and lightly repair before a tool call. Handles common escaping, quote, and trailing-comma mistakes.'),
            expectedSchema: schema_1.z.object({}).passthrough().optional().describe('Optional simple JSON schema; checks only basic type and required fields.'),
        }),
    })
], ValidationTools.prototype, "validateJsonParams", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'safe_string_value',
        title: 'Escape string for JSON',
        description: '[specialist] Escape a raw string for safe use inside JSON arguments. No Cocos side effects; useful for Label text or custom data containing quotes/newlines.',
        inputSchema: schema_1.z.object({
            value: schema_1.z.string().describe('Raw string that must be embedded safely inside JSON arguments.'),
        }),
    })
], ValidationTools.prototype, "safeStringValue", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'format_mcp_request',
        title: 'Format MCP request',
        description: '[specialist] Format a complete MCP tools/call request and curl example. Formatting only; does not execute the target tool.',
        inputSchema: schema_1.z.object({
            toolName: schema_1.z.string().describe('MCP tool name to wrap, e.g. create_node or set_component_property.'),
            arguments: schema_1.z.object({}).passthrough().describe('Arguments object for the target tool. This helper formats only; it does not execute the tool.'),
        }),
    })
], ValidationTools.prototype, "formatMcpRequest", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmFsaWRhdGlvbi10b29scy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NvdXJjZS90b29scy92YWxpZGF0aW9uLXRvb2xzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7OztBQUFBLDhDQUEyQztBQUUzQywwQ0FBa0M7QUFDbEMsa0RBQXVFO0FBQ3ZFLHNEQUFtRTtBQVduRSxNQUFNLGFBQWEsR0FBRyxFQUFFLENBQUM7QUFDekIsTUFBTSxVQUFVLEdBQUcsSUFBSSxHQUFHLEVBQThCLENBQUM7QUFDekQsSUFBSSxZQUFZLEdBQUcsQ0FBQyxDQUFDO0FBRXJCLE1BQWEsZUFBZTtJQUd4QjtRQUNJLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBQSxzQ0FBeUIsRUFBQyxJQUFJLENBQUMsQ0FBQztJQUNoRCxDQUFDO0lBRUQsUUFBUSxLQUF1QixPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQzdELE9BQU8sQ0FBQyxRQUFnQixFQUFFLElBQVMsSUFBMkIsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBVW5HLEFBQU4sS0FBSyxDQUFDLFlBQVksQ0FBQyxPQUEyQixFQUFFOztRQUM1QyxNQUFNLE1BQU0sR0FBRyxNQUFNLElBQUEsMkNBQTRCLEVBQUMsbUJBQW1CLENBQUMsQ0FBQztRQUN2RSxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU87WUFBRSxPQUFPLE1BQU0sQ0FBQztRQUVuQyxNQUFNLElBQUksR0FBRyxNQUFBLE1BQU0sQ0FBQyxJQUFJLG1DQUFJLEVBQUUsQ0FBQztRQUMvQixNQUFNLEVBQUUsR0FBRyxRQUFRLEVBQUUsWUFBWSxFQUFFLENBQUM7UUFDcEMsTUFBTSxLQUFLLEdBQUcsQ0FBQSxNQUFBLElBQUksQ0FBQyxLQUFLLDBDQUFFLElBQUksRUFBRSxLQUFJLEVBQUUsQ0FBQztRQUN2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Q3pJLFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDO1lBQ2xCLFFBQVEsRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLG9FQUFvRSxDQUFDO1lBQ25HLFNBQVMsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFDLFFBQVEsQ0FBQywrRkFBK0YsQ0FBQztTQUNsSixDQUFDO0tBQ0wsQ0FBQzt1REEyQkQiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBvaywgZmFpbCB9IGZyb20gJy4uL2xpYi9yZXNwb25zZSc7XG5pbXBvcnQgeyBUb29sRGVmaW5pdGlvbiwgVG9vbFJlc3BvbnNlLCBUb29sRXhlY3V0b3IgfSBmcm9tICcuLi90eXBlcyc7XG5pbXBvcnQgeyB6IH0gZnJvbSAnLi4vbGliL3NjaGVtYSc7XG5pbXBvcnQgeyBtY3BUb29sLCBkZWZpbmVUb29sc0Zyb21EZWNvcmF0b3JzIH0gZnJvbSAnLi4vbGliL2RlY29yYXRvcnMnO1xuaW1wb3J0IHsgcnVuU2NlbmVNZXRob2RBc1Rvb2xSZXNwb25zZSB9IGZyb20gJy4uL2xpYi9zY2VuZS1icmlkZ2UnO1xuXG5pbnRlcmZhY2UgU2NlbmVTbmFwc2hvdEVudHJ5IHtcbiAgICBpZDogc3RyaW5nO1xuICAgIGxhYmVsOiBzdHJpbmc7XG4gICAgdGFrZW5BdDogc3RyaW5nO1xuICAgIHNjZW5lTmFtZTogc3RyaW5nO1xuICAgIHJvb3RVdWlkczogc3RyaW5nW107XG4gICAgbm9kZXM6IFJlY29yZDxzdHJpbmcsIGFueT47XG59XG5cbmNvbnN0IE1BWF9TTkFQU0hPVFMgPSAyMDtcbmNvbnN0IF9zbmFwc2hvdHMgPSBuZXcgTWFwPHN0cmluZywgU2NlbmVTbmFwc2hvdEVudHJ5PigpO1xubGV0IF9zbmFwc2hvdFNlcSA9IDA7XG5cbmV4cG9ydCBjbGFzcyBWYWxpZGF0aW9uVG9vbHMgaW1wbGVtZW50cyBUb29sRXhlY3V0b3Ige1xuICAgIHByaXZhdGUgcmVhZG9ubHkgZXhlYzogVG9vbEV4ZWN1dG9yO1xuXG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHRoaXMuZXhlYyA9IGRlZmluZVRvb2xzRnJvbURlY29yYXRvcnModGhpcyk7XG4gICAgfVxuXG4gICAgZ2V0VG9vbHMoKTogVG9vbERlZmluaXRpb25bXSB7IHJldHVybiB0aGlzLmV4ZWMuZ2V0VG9vbHMoKTsgfVxuICAgIGV4ZWN1dGUodG9vbE5hbWU6IHN0cmluZywgYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHsgcmV0dXJuIHRoaXMuZXhlYy5leGVjdXRlKHRvb2xOYW1lLCBhcmdzKTsgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAndGFrZV9zbmFwc2hvdCcsXG4gICAgICAgIHRpdGxlOiAnVGFrZSBzY2VuZSBzbmFwc2hvdCcsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIENhcHR1cmUgYSBmbGF0IHNjZW5lIG5vZGUgc25hcHNob3QgKHBvc2l0aW9ucywgY29tcG9uZW50cywgaGllcmFyY2h5KSBmb3IgbGF0ZXIgZGlmZiB3aXRoIGNvbXBhcmVfc25hcHNob3RzLiBTZXNzaW9uLXNjb3BlZCDigJQgc25hcHNob3RzIGFyZSBsb3N0IG9uIGV4dGVuc2lvbiByZWxvYWQuIE5vIHNjZW5lIG11dGF0aW9ucy4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgbGFiZWw6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnT3B0aW9uYWwgaHVtYW4tcmVhZGFibGUgbGFiZWwgZm9yIHRoaXMgc25hcHNob3QuJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgdGFrZVNuYXBzaG90KGFyZ3M6IHsgbGFiZWw/OiBzdHJpbmcgfSA9IHt9KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgcnVuU2NlbmVNZXRob2RBc1Rvb2xSZXNwb25zZSgndGFrZVNjZW5lU25hcHNob3QnKTtcbiAgICAgICAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIHJlc3VsdDtcblxuICAgICAgICBjb25zdCBkYXRhID0gcmVzdWx0LmRhdGEgPz8ge307XG4gICAgICAgIGNvbnN0IGlkID0gYHNuYXAtJHsrK19zbmFwc2hvdFNlcX1gO1xuICAgICAgICBjb25zdCBsYWJlbCA9IGFyZ3MubGFiZWw/LnRyaW0oKSB8fCBpZDtcbiAgICAgICAgY29uc3QgdGFrZW5BdCA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcbiAgICAgICAgY29uc3QgZW50cnk6IFNjZW5lU25hcHNob3RFbnRyeSA9IHtcbiAgICAgICAgICAgIGlkLFxuICAgICAgICAgICAgbGFiZWwsXG4gICAgICAgICAgICB0YWtlbkF0LFxuICAgICAgICAgICAgc2NlbmVOYW1lOiBkYXRhLnNjZW5lTmFtZSA/PyAnJyxcbiAgICAgICAgICAgIHJvb3RVdWlkczogQXJyYXkuaXNBcnJheShkYXRhLnJvb3RVdWlkcykgPyBkYXRhLnJvb3RVdWlkcyA6IFtdLFxuICAgICAgICAgICAgbm9kZXM6IGRhdGEubm9kZXMgPz8ge30sXG4gICAgICAgIH07XG5cbiAgICAgICAgX3NuYXBzaG90cy5zZXQoaWQsIGVudHJ5KTtcbiAgICAgICAgd2hpbGUgKF9zbmFwc2hvdHMuc2l6ZSA+IE1BWF9TTkFQU0hPVFMpIHtcbiAgICAgICAgICAgIGNvbnN0IG9sZGVzdCA9IF9zbmFwc2hvdHMua2V5cygpLm5leHQoKS52YWx1ZTtcbiAgICAgICAgICAgIGlmICghb2xkZXN0KSBicmVhaztcbiAgICAgICAgICAgIF9zbmFwc2hvdHMuZGVsZXRlKG9sZGVzdCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gb2soe1xuICAgICAgICAgICAgICAgIGlkLFxuICAgICAgICAgICAgICAgIGxhYmVsLFxuICAgICAgICAgICAgICAgIHRha2VuQXQsXG4gICAgICAgICAgICAgICAgc2NlbmVOYW1lOiBlbnRyeS5zY2VuZU5hbWUsXG4gICAgICAgICAgICAgICAgbm9kZUNvdW50OiBPYmplY3Qua2V5cyhlbnRyeS5ub2RlcykubGVuZ3RoLFxuICAgICAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnY29tcGFyZV9zbmFwc2hvdHMnLFxuICAgICAgICB0aXRsZTogJ0NvbXBhcmUgc2NlbmUgc25hcHNob3RzJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gQ29tcGFyZSB0d28gc3RvcmVkIHNjZW5lIHNuYXBzaG90cyBieSBJRCBhbmQgcmVwb3J0IG5vZGUtbGV2ZWwgZGlmZjogYWRkZWQsIHJlbW92ZWQsIGFuZCBtb2RpZmllZCBub2RlcyB3aXRoIGZpZWxkLWxldmVsIGNoYW5nZSBsaXN0LicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICBiYXNlSWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1NuYXBzaG90IGlkIHRvIHVzZSBhcyB0aGUgY29tcGFyaXNvbiBiYXNlLicpLFxuICAgICAgICAgICAgaGVhZElkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdTbmFwc2hvdCBpZCB0byBjb21wYXJlIGFnYWluc3QgdGhlIGJhc2UuJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgY29tcGFyZVNuYXBzaG90cyhhcmdzOiB7IGJhc2VJZDogc3RyaW5nOyBoZWFkSWQ6IHN0cmluZyB9KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgYmFzZSA9IF9zbmFwc2hvdHMuZ2V0KGFyZ3MuYmFzZUlkKTtcbiAgICAgICAgY29uc3QgaGVhZCA9IF9zbmFwc2hvdHMuZ2V0KGFyZ3MuaGVhZElkKTtcbiAgICAgICAgaWYgKCFiYXNlKSByZXR1cm4gZmFpbChgU25hcHNob3QgJHthcmdzLmJhc2VJZH0gbm90IGZvdW5kYCk7XG4gICAgICAgIGlmICghaGVhZCkgcmV0dXJuIGZhaWwoYFNuYXBzaG90ICR7YXJncy5oZWFkSWR9IG5vdCBmb3VuZGApO1xuXG4gICAgICAgIGNvbnN0IGJhc2VOb2RlcyA9IGJhc2Uubm9kZXMgPz8ge307XG4gICAgICAgIGNvbnN0IGhlYWROb2RlcyA9IGhlYWQubm9kZXMgPz8ge307XG4gICAgICAgIGNvbnN0IGFkZGVkID0gT2JqZWN0LmtleXMoaGVhZE5vZGVzKVxuICAgICAgICAgICAgLmZpbHRlcih1dWlkID0+ICFiYXNlTm9kZXNbdXVpZF0pXG4gICAgICAgICAgICAubWFwKHV1aWQgPT4gaGVhZE5vZGVzW3V1aWRdKTtcbiAgICAgICAgY29uc3QgcmVtb3ZlZCA9IE9iamVjdC5rZXlzKGJhc2VOb2RlcylcbiAgICAgICAgICAgIC5maWx0ZXIodXVpZCA9PiAhaGVhZE5vZGVzW3V1aWRdKVxuICAgICAgICAgICAgLm1hcCh1dWlkID0+IGJhc2VOb2Rlc1t1dWlkXSk7XG4gICAgICAgIGNvbnN0IG1vZGlmaWVkID0gT2JqZWN0LmtleXMoaGVhZE5vZGVzKVxuICAgICAgICAgICAgLmZpbHRlcih1dWlkID0+IGJhc2VOb2Rlc1t1dWlkXSlcbiAgICAgICAgICAgIC5tYXAodXVpZCA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgYmVmb3JlID0gYmFzZU5vZGVzW3V1aWRdO1xuICAgICAgICAgICAgICAgIGNvbnN0IGFmdGVyID0gaGVhZE5vZGVzW3V1aWRdO1xuICAgICAgICAgICAgICAgIGNvbnN0IGZpZWxkcyA9IFsnbmFtZScsICdhY3RpdmUnLCAncG9zaXRpb24nLCAncm90YXRpb24nLCAnc2NhbGUnLCAnY29tcG9uZW50cycsICdjaGlsZFV1aWRzJ11cbiAgICAgICAgICAgICAgICAgICAgLmZpbHRlcihmaWVsZCA9PiBKU09OLnN0cmluZ2lmeShiZWZvcmU/LltmaWVsZF0pICE9PSBKU09OLnN0cmluZ2lmeShhZnRlcj8uW2ZpZWxkXSkpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGNoYW5nZXM6IFJlY29yZDxzdHJpbmcsIHsgYmVmb3JlOiBhbnk7IGFmdGVyOiBhbnkgfT4gPSB7fTtcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGZpZWxkIG9mIGZpZWxkcykge1xuICAgICAgICAgICAgICAgICAgICBjaGFuZ2VzW2ZpZWxkXSA9IHsgYmVmb3JlOiBiZWZvcmU/LltmaWVsZF0sIGFmdGVyOiBhZnRlcj8uW2ZpZWxkXSB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4geyB1dWlkLCBuYW1lOiBhZnRlcj8ubmFtZSA/PyBiZWZvcmU/Lm5hbWUgPz8gJycsIGZpZWxkcywgY2hhbmdlcyB9O1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5maWx0ZXIoY2hhbmdlID0+IGNoYW5nZS5maWVsZHMubGVuZ3RoID4gMCk7XG5cbiAgICAgICAgcmV0dXJuIG9rKHtcbiAgICAgICAgICAgICAgICBiYXNlOiB7IGlkOiBiYXNlLmlkLCBsYWJlbDogYmFzZS5sYWJlbCwgdGFrZW5BdDogYmFzZS50YWtlbkF0LCBzY2VuZU5hbWU6IGJhc2Uuc2NlbmVOYW1lIH0sXG4gICAgICAgICAgICAgICAgaGVhZDogeyBpZDogaGVhZC5pZCwgbGFiZWw6IGhlYWQubGFiZWwsIHRha2VuQXQ6IGhlYWQudGFrZW5BdCwgc2NlbmVOYW1lOiBoZWFkLnNjZW5lTmFtZSB9LFxuICAgICAgICAgICAgICAgIHN1bW1hcnk6IHtcbiAgICAgICAgICAgICAgICAgICAgYWRkZWQ6IGFkZGVkLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgcmVtb3ZlZDogcmVtb3ZlZC5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgIG1vZGlmaWVkOiBtb2RpZmllZC5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgIGJhc2VOb2RlQ291bnQ6IE9iamVjdC5rZXlzKGJhc2VOb2RlcykubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICBoZWFkTm9kZUNvdW50OiBPYmplY3Qua2V5cyhoZWFkTm9kZXMpLmxlbmd0aCxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIGFkZGVkLFxuICAgICAgICAgICAgICAgIHJlbW92ZWQsXG4gICAgICAgICAgICAgICAgbW9kaWZpZWQsXG4gICAgICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICd2YWxpZGF0ZV9qc29uX3BhcmFtcycsXG4gICAgICAgIHRpdGxlOiAnVmFsaWRhdGUvcmVwYWlyIEpTT04gYXJncycsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFZhbGlkYXRlIGFuZCBsaWdodGx5IHJlcGFpciBhIEpTT04gYXJndW1lbnQgc3RyaW5nIGJlZm9yZSBjYWxsaW5nIGFub3RoZXIgdG9vbC4gTm8gQ29jb3Mgc2lkZSBlZmZlY3RzOyB1c2VmdWwgZm9yIGRpYWdub3NpbmcgZXNjYXBpbmcgb3IgcmVxdWlyZWQtZmllbGQgZXJyb3JzLicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICBqc29uU3RyaW5nOiB6LnN0cmluZygpLmRlc2NyaWJlKCdKU09OIHN0cmluZyB0byBwYXJzZSBhbmQgbGlnaHRseSByZXBhaXIgYmVmb3JlIGEgdG9vbCBjYWxsLiBIYW5kbGVzIGNvbW1vbiBlc2NhcGluZywgcXVvdGUsIGFuZCB0cmFpbGluZy1jb21tYSBtaXN0YWtlcy4nKSxcbiAgICAgICAgICAgIGV4cGVjdGVkU2NoZW1hOiB6Lm9iamVjdCh7fSkucGFzc3Rocm91Z2goKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdPcHRpb25hbCBzaW1wbGUgSlNPTiBzY2hlbWE7IGNoZWNrcyBvbmx5IGJhc2ljIHR5cGUgYW5kIHJlcXVpcmVkIGZpZWxkcy4nKSxcbiAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyB2YWxpZGF0ZUpzb25QYXJhbXMoYXJnczogeyBqc29uU3RyaW5nOiBzdHJpbmc7IGV4cGVjdGVkU2NoZW1hPzogYW55IH0pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCB7IGpzb25TdHJpbmcsIGV4cGVjdGVkU2NoZW1hIH0gPSBhcmdzO1xuICAgICAgICAvLyBGaXJzdCB0cnkgdG8gcGFyc2UgYXMtaXNcbiAgICAgICAgbGV0IHBhcnNlZDtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHBhcnNlZCA9IEpTT04ucGFyc2UoanNvblN0cmluZyk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIC8vIFRyeSB0byBmaXggY29tbW9uIGlzc3Vlc1xuICAgICAgICAgICAgY29uc3QgZml4ZWQgPSB0aGlzLmZpeEpzb25TdHJpbmcoanNvblN0cmluZyk7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHBhcnNlZCA9IEpTT04ucGFyc2UoZml4ZWQpO1xuICAgICAgICAgICAgfSBjYXRjaCAoc2Vjb25kRXJyb3IpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFpbChgQ2Fubm90IGZpeCBKU09OOiAke2Vycm9yLm1lc3NhZ2V9YCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgb3JpZ2luYWxKc29uOiBqc29uU3RyaW5nLFxuICAgICAgICAgICAgICAgICAgICAgICAgZml4ZWRBdHRlbXB0OiBmaXhlZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHN1Z2dlc3Rpb25zOiB0aGlzLmdldEpzb25GaXhTdWdnZXN0aW9ucyhqc29uU3RyaW5nKVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFZhbGlkYXRlIGFnYWluc3Qgc2NoZW1hIGlmIHByb3ZpZGVkXG4gICAgICAgIGlmIChleHBlY3RlZFNjaGVtYSkge1xuICAgICAgICAgICAgY29uc3QgdmFsaWRhdGlvbiA9IHRoaXMudmFsaWRhdGVBZ2FpbnN0U2NoZW1hKHBhcnNlZCwgZXhwZWN0ZWRTY2hlbWEpO1xuICAgICAgICAgICAgaWYgKCF2YWxpZGF0aW9uLnZhbGlkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ1NjaGVtYSB2YWxpZGF0aW9uIGZhaWxlZCcsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhcnNlZEpzb246IHBhcnNlZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbGlkYXRpb25FcnJvcnM6IHZhbGlkYXRpb24uZXJyb3JzLFxuICAgICAgICAgICAgICAgICAgICAgICAgc3VnZ2VzdGlvbnM6IHZhbGlkYXRpb24uc3VnZ2VzdGlvbnNcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gb2soe1xuICAgICAgICAgICAgICAgIHBhcnNlZEpzb246IHBhcnNlZCxcbiAgICAgICAgICAgICAgICBmaXhlZEpzb246IEpTT04uc3RyaW5naWZ5KHBhcnNlZCwgbnVsbCwgMiksXG4gICAgICAgICAgICAgICAgaXNWYWxpZDogdHJ1ZVxuICAgICAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnc2FmZV9zdHJpbmdfdmFsdWUnLFxuICAgICAgICB0aXRsZTogJ0VzY2FwZSBzdHJpbmcgZm9yIEpTT04nLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBFc2NhcGUgYSByYXcgc3RyaW5nIGZvciBzYWZlIHVzZSBpbnNpZGUgSlNPTiBhcmd1bWVudHMuIE5vIENvY29zIHNpZGUgZWZmZWN0czsgdXNlZnVsIGZvciBMYWJlbCB0ZXh0IG9yIGN1c3RvbSBkYXRhIGNvbnRhaW5pbmcgcXVvdGVzL25ld2xpbmVzLicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICB2YWx1ZTogei5zdHJpbmcoKS5kZXNjcmliZSgnUmF3IHN0cmluZyB0aGF0IG11c3QgYmUgZW1iZWRkZWQgc2FmZWx5IGluc2lkZSBKU09OIGFyZ3VtZW50cy4nKSxcbiAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBzYWZlU3RyaW5nVmFsdWUoYXJnczogeyB2YWx1ZTogc3RyaW5nIH0pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCB7IHZhbHVlIH0gPSBhcmdzO1xuICAgICAgICBjb25zdCBzYWZlVmFsdWUgPSB0aGlzLmVzY2FwSnNvblN0cmluZyh2YWx1ZSk7XG4gICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgb3JpZ2luYWxWYWx1ZTogdmFsdWUsXG4gICAgICAgICAgICAgICAgc2FmZVZhbHVlOiBzYWZlVmFsdWUsXG4gICAgICAgICAgICAgICAganNvblJlYWR5OiBKU09OLnN0cmluZ2lmeShzYWZlVmFsdWUpLFxuICAgICAgICAgICAgICAgIHVzYWdlOiBgVXNlIFwiJHtzYWZlVmFsdWV9XCIgaW4geW91ciBKU09OIHBhcmFtZXRlcnNgXG4gICAgICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdmb3JtYXRfbWNwX3JlcXVlc3QnLFxuICAgICAgICB0aXRsZTogJ0Zvcm1hdCBNQ1AgcmVxdWVzdCcsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIEZvcm1hdCBhIGNvbXBsZXRlIE1DUCB0b29scy9jYWxsIHJlcXVlc3QgYW5kIGN1cmwgZXhhbXBsZS4gRm9ybWF0dGluZyBvbmx5OyBkb2VzIG5vdCBleGVjdXRlIHRoZSB0YXJnZXQgdG9vbC4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgdG9vbE5hbWU6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ01DUCB0b29sIG5hbWUgdG8gd3JhcCwgZS5nLiBjcmVhdGVfbm9kZSBvciBzZXRfY29tcG9uZW50X3Byb3BlcnR5LicpLFxuICAgICAgICAgICAgYXJndW1lbnRzOiB6Lm9iamVjdCh7fSkucGFzc3Rocm91Z2goKS5kZXNjcmliZSgnQXJndW1lbnRzIG9iamVjdCBmb3IgdGhlIHRhcmdldCB0b29sLiBUaGlzIGhlbHBlciBmb3JtYXRzIG9ubHk7IGl0IGRvZXMgbm90IGV4ZWN1dGUgdGhlIHRvb2wuJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgZm9ybWF0TWNwUmVxdWVzdChhcmdzOiB7IHRvb2xOYW1lOiBzdHJpbmc7IGFyZ3VtZW50czogYW55IH0pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCB0b29sTmFtZSA9IGFyZ3MudG9vbE5hbWU7XG4gICAgICAgIGNvbnN0IHRvb2xBcmdzID0gYXJncy5hcmd1bWVudHM7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBtY3BSZXF1ZXN0ID0ge1xuICAgICAgICAgICAgICAgIGpzb25ycGM6ICcyLjAnLFxuICAgICAgICAgICAgICAgIGlkOiBEYXRlLm5vdygpLFxuICAgICAgICAgICAgICAgIG1ldGhvZDogJ3Rvb2xzL2NhbGwnLFxuICAgICAgICAgICAgICAgIHBhcmFtczoge1xuICAgICAgICAgICAgICAgICAgICBuYW1lOiB0b29sTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgYXJndW1lbnRzOiB0b29sQXJnc1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGNvbnN0IGZvcm1hdHRlZEpzb24gPSBKU09OLnN0cmluZ2lmeShtY3BSZXF1ZXN0LCBudWxsLCAyKTtcbiAgICAgICAgICAgIGNvbnN0IGNvbXBhY3RKc29uID0gSlNPTi5zdHJpbmdpZnkobWNwUmVxdWVzdCk7XG5cbiAgICAgICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgICAgIHJlcXVlc3Q6IG1jcFJlcXVlc3QsXG4gICAgICAgICAgICAgICAgICAgIGZvcm1hdHRlZEpzb246IGZvcm1hdHRlZEpzb24sXG4gICAgICAgICAgICAgICAgICAgIGNvbXBhY3RKc29uOiBjb21wYWN0SnNvbixcbiAgICAgICAgICAgICAgICAgICAgY3VybENvbW1hbmQ6IHRoaXMuZ2VuZXJhdGVDdXJsQ29tbWFuZChjb21wYWN0SnNvbilcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoYEZhaWxlZCB0byBmb3JtYXQgTUNQIHJlcXVlc3Q6ICR7ZXJyb3IubWVzc2FnZX1gKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgZml4SnNvblN0cmluZyhqc29uU3RyOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgICAgICBsZXQgZml4ZWQgPSBqc29uU3RyO1xuICAgICAgICBcbiAgICAgICAgLy8gRml4IGNvbW1vbiBlc2NhcGUgY2hhcmFjdGVyIGlzc3Vlc1xuICAgICAgICBmaXhlZCA9IGZpeGVkXG4gICAgICAgICAgICAvLyBGaXggdW5lc2NhcGVkIHF1b3RlcyBpbiBzdHJpbmcgdmFsdWVzXG4gICAgICAgICAgICAucmVwbGFjZSgvKFxce1tefV0qXCJbXlwiXSpcIjpcXHMqXCIpKFteXCJdKlwiKShbXlwiXSpcIikoW159XSpcXH0pL2csIChtYXRjaCwgcHJlZml4LCBjb250ZW50LCBzdWZmaXgsIGVuZCkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGVzY2FwZWRDb250ZW50ID0gY29udGVudC5yZXBsYWNlKC9cIi9nLCAnXFxcXFwiJyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHByZWZpeCArIGVzY2FwZWRDb250ZW50ICsgc3VmZml4ICsgZW5kO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC8vIEZpeCB1bmVzY2FwZWQgYmFja3NsYXNoZXNcbiAgICAgICAgICAgIC5yZXBsYWNlKC8oW15cXFxcXSlcXFxcKFteXCJcXFxcXFwvYmZucnR1XSkvZywgJyQxXFxcXFxcXFwkMicpXG4gICAgICAgICAgICAvLyBGaXggdHJhaWxpbmcgY29tbWFzXG4gICAgICAgICAgICAucmVwbGFjZSgvLChcXHMqW31cXF1dKS9nLCAnJDEnKVxuICAgICAgICAgICAgLy8gRml4IGNvbnRyb2wgY2hhcmFjdGVyc1xuICAgICAgICAgICAgLnJlcGxhY2UoL1xcbi9nLCAnXFxcXG4nKVxuICAgICAgICAgICAgLnJlcGxhY2UoL1xcci9nLCAnXFxcXHInKVxuICAgICAgICAgICAgLnJlcGxhY2UoL1xcdC9nLCAnXFxcXHQnKVxuICAgICAgICAgICAgLy8gRml4IHNpbmdsZSBxdW90ZXMgdG8gZG91YmxlIHF1b3Rlc1xuICAgICAgICAgICAgLnJlcGxhY2UoLycvZywgJ1wiJyk7XG4gICAgICAgIFxuICAgICAgICByZXR1cm4gZml4ZWQ7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBlc2NhcEpzb25TdHJpbmcoc3RyOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gc3RyXG4gICAgICAgICAgICAucmVwbGFjZSgvXFxcXC9nLCAnXFxcXFxcXFwnKSAgLy8gRXNjYXBlIGJhY2tzbGFzaGVzIGZpcnN0XG4gICAgICAgICAgICAucmVwbGFjZSgvXCIvZywgJ1xcXFxcIicpICAgIC8vIEVzY2FwZSBxdW90ZXNcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXG4vZywgJ1xcXFxuJykgICAvLyBFc2NhcGUgbmV3bGluZXNcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXHIvZywgJ1xcXFxyJykgICAvLyBFc2NhcGUgY2FycmlhZ2UgcmV0dXJuc1xuICAgICAgICAgICAgLnJlcGxhY2UoL1xcdC9nLCAnXFxcXHQnKSAgIC8vIEVzY2FwZSB0YWJzXG4gICAgICAgICAgICAucmVwbGFjZSgvXFxmL2csICdcXFxcZicpICAgLy8gRXNjYXBlIGZvcm0gZmVlZHNcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXGIvZywgJ1xcXFxiJyk7ICAvLyBFc2NhcGUgYmFja3NwYWNlc1xuICAgIH1cblxuICAgIHByaXZhdGUgdmFsaWRhdGVBZ2FpbnN0U2NoZW1hKGRhdGE6IGFueSwgc2NoZW1hOiBhbnkpOiB7IHZhbGlkOiBib29sZWFuOyBlcnJvcnM6IHN0cmluZ1tdOyBzdWdnZXN0aW9uczogc3RyaW5nW10gfSB7XG4gICAgICAgIGNvbnN0IGVycm9yczogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgY29uc3Qgc3VnZ2VzdGlvbnM6IHN0cmluZ1tdID0gW107XG5cbiAgICAgICAgLy8gQmFzaWMgdHlwZSBjaGVja2luZ1xuICAgICAgICBpZiAoc2NoZW1hLnR5cGUpIHtcbiAgICAgICAgICAgIGNvbnN0IGFjdHVhbFR5cGUgPSBBcnJheS5pc0FycmF5KGRhdGEpID8gJ2FycmF5JyA6IHR5cGVvZiBkYXRhO1xuICAgICAgICAgICAgaWYgKGFjdHVhbFR5cGUgIT09IHNjaGVtYS50eXBlKSB7XG4gICAgICAgICAgICAgICAgZXJyb3JzLnB1c2goYEV4cGVjdGVkIHR5cGUgJHtzY2hlbWEudHlwZX0sIGdvdCAke2FjdHVhbFR5cGV9YCk7XG4gICAgICAgICAgICAgICAgc3VnZ2VzdGlvbnMucHVzaChgQ29udmVydCB2YWx1ZSB0byAke3NjaGVtYS50eXBlfWApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gUmVxdWlyZWQgZmllbGRzIGNoZWNraW5nXG4gICAgICAgIGlmIChzY2hlbWEucmVxdWlyZWQgJiYgQXJyYXkuaXNBcnJheShzY2hlbWEucmVxdWlyZWQpKSB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGZpZWxkIG9mIHNjaGVtYS5yZXF1aXJlZCkge1xuICAgICAgICAgICAgICAgIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGRhdGEsIGZpZWxkKSkge1xuICAgICAgICAgICAgICAgICAgICBlcnJvcnMucHVzaChgTWlzc2luZyByZXF1aXJlZCBmaWVsZDogJHtmaWVsZH1gKTtcbiAgICAgICAgICAgICAgICAgICAgc3VnZ2VzdGlvbnMucHVzaChgQWRkIHJlcXVpcmVkIGZpZWxkIFwiJHtmaWVsZH1cImApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICB2YWxpZDogZXJyb3JzLmxlbmd0aCA9PT0gMCxcbiAgICAgICAgICAgIGVycm9ycyxcbiAgICAgICAgICAgIHN1Z2dlc3Rpb25zXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBnZXRKc29uRml4U3VnZ2VzdGlvbnMoanNvblN0cjogc3RyaW5nKTogc3RyaW5nW10ge1xuICAgICAgICBjb25zdCBzdWdnZXN0aW9uczogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgXG4gICAgICAgIGlmIChqc29uU3RyLmluY2x1ZGVzKCdcXFxcXCInKSkge1xuICAgICAgICAgICAgc3VnZ2VzdGlvbnMucHVzaCgnQ2hlY2sgZm9yIGltcHJvcGVybHkgZXNjYXBlZCBxdW90ZXMnKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblN0ci5pbmNsdWRlcyhcIidcIikpIHtcbiAgICAgICAgICAgIHN1Z2dlc3Rpb25zLnB1c2goJ1JlcGxhY2Ugc2luZ2xlIHF1b3RlcyB3aXRoIGRvdWJsZSBxdW90ZXMnKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblN0ci5pbmNsdWRlcygnXFxuJykgfHwganNvblN0ci5pbmNsdWRlcygnXFx0JykpIHtcbiAgICAgICAgICAgIHN1Z2dlc3Rpb25zLnB1c2goJ0VzY2FwZSBuZXdsaW5lcyBhbmQgdGFicyBwcm9wZXJseScpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChqc29uU3RyLm1hdGNoKC8sXFxzKlt9XFxdXS8pKSB7XG4gICAgICAgICAgICBzdWdnZXN0aW9ucy5wdXNoKCdSZW1vdmUgdHJhaWxpbmcgY29tbWFzJyk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHJldHVybiBzdWdnZXN0aW9ucztcbiAgICB9XG5cbiAgICBwcml2YXRlIGdlbmVyYXRlQ3VybENvbW1hbmQoanNvblN0cjogc3RyaW5nKTogc3RyaW5nIHtcbiAgICAgICAgY29uc3QgZXNjYXBlZEpzb24gPSBqc29uU3RyLnJlcGxhY2UoLycvZywgXCInXFxcIidcXFwiJ1wiKTtcbiAgICAgICAgcmV0dXJuIGBjdXJsIC1YIFBPU1QgaHR0cDovLzEyNy4wLjAuMTo4NTg1L21jcCBcXFxcXG4gIC1IIFwiQ29udGVudC1UeXBlOiBhcHBsaWNhdGlvbi9qc29uXCIgXFxcXFxuICAtZCAnJHtlc2NhcGVkSnNvbn0nYDtcbiAgICB9XG59XG4iXX0=