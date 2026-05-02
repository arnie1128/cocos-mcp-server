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
class ValidationTools {
    constructor() {
        this.exec = (0, decorators_1.defineToolsFromDecorators)(this);
    }
    getTools() { return this.exec.getTools(); }
    execute(toolName, args) { return this.exec.execute(toolName, args); }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmFsaWRhdGlvbi10b29scy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NvdXJjZS90b29scy92YWxpZGF0aW9uLXRvb2xzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7OztBQUFBLDhDQUEyQztBQUUzQywwQ0FBa0M7QUFDbEMsa0RBQXVFO0FBRXZFLE1BQWEsZUFBZTtJQUd4QjtRQUNJLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBQSxzQ0FBeUIsRUFBQyxJQUFJLENBQUMsQ0FBQztJQUNoRCxDQUFDO0lBRUQsUUFBUSxLQUF1QixPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQzdELE9BQU8sQ0FBQyxRQUFnQixFQUFFLElBQVMsSUFBMkIsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBV25HLEFBQU4sS0FBSyxDQUFDLGtCQUFrQixDQUFDLElBQWtEO1FBQ3ZFLE1BQU0sRUFBRSxVQUFVLEVBQUUsY0FBYyxFQUFFLEdBQUcsSUFBSSxDQUFDO1FBQzVDLDJCQUEyQjtRQUMzQixJQUFJLE1BQU0sQ0FBQztRQUNYLElBQUksQ0FBQztZQUNELE1BQU0sR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3BDLENBQUM7UUFBQyxPQUFPLEtBQVUsRUFBRSxDQUFDO1lBQ2xCLDJCQUEyQjtZQUMzQixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBQzdDLElBQUksQ0FBQztnQkFDRCxNQUFNLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUMvQixDQUFDO1lBQUMsT0FBTyxXQUFXLEVBQUUsQ0FBQztnQkFDbkIsT0FBTyxJQUFBLGVBQUksRUFBQyxvQkFBb0IsS0FBSyxDQUFDLE9BQU8sRUFBRSxFQUFF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UUFBUSxDQUFDLDBFQUEwRSxDQUFDO1NBQzdJLENBQUM7S0FDTCxDQUFDO3lEQXNDRDtBQVVLO0lBUkwsSUFBQSxvQkFBTyxFQUFDO1FBQ0wsSUFBSSxFQUFFLG1CQUFtQjtRQUN6QixLQUFLLEVBQUUsd0JBQXdCO1FBQy9CLFdBQVcsRUFBRSw4SkFBOEo7UUFDM0ssV0FBVyxFQUFFLFVBQUMsQ0FBQyxNQUFNLENBQUM7WUFDbEIsS0FBSyxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLENBQUMsZ0VBQWdFLENBQUM7U0FDL0YsQ0FBQztLQUNMLENBQUM7c0RBVUQ7QUFXSztJQVRMLElBQUEsb0JBQU8sRUFBQztRQUNMLElBQUksRUFBRSxvQkFBb0I7UUFDMUIsS0FBSyxFQUFFLG9CQUFvQjtRQUMzQixXQUFXLEVBQUUsNEhBQTRIO1FBQ3pJLFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDO1lBQ2xCLFFBQVEsRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLG9FQUFvRSxDQUFDO1lBQ25HLFNBQVMsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFDLFFBQVEsQ0FBQywrRkFBK0YsQ0FBQztTQUNsSixDQUFDO0tBQ0wsQ0FBQzt1REEyQkQiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBvaywgZmFpbCB9IGZyb20gJy4uL2xpYi9yZXNwb25zZSc7XG5pbXBvcnQgeyBUb29sRGVmaW5pdGlvbiwgVG9vbFJlc3BvbnNlLCBUb29sRXhlY3V0b3IgfSBmcm9tICcuLi90eXBlcyc7XG5pbXBvcnQgeyB6IH0gZnJvbSAnLi4vbGliL3NjaGVtYSc7XG5pbXBvcnQgeyBtY3BUb29sLCBkZWZpbmVUb29sc0Zyb21EZWNvcmF0b3JzIH0gZnJvbSAnLi4vbGliL2RlY29yYXRvcnMnO1xuXG5leHBvcnQgY2xhc3MgVmFsaWRhdGlvblRvb2xzIGltcGxlbWVudHMgVG9vbEV4ZWN1dG9yIHtcbiAgICBwcml2YXRlIHJlYWRvbmx5IGV4ZWM6IFRvb2xFeGVjdXRvcjtcblxuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICB0aGlzLmV4ZWMgPSBkZWZpbmVUb29sc0Zyb21EZWNvcmF0b3JzKHRoaXMpO1xuICAgIH1cblxuICAgIGdldFRvb2xzKCk6IFRvb2xEZWZpbml0aW9uW10geyByZXR1cm4gdGhpcy5leGVjLmdldFRvb2xzKCk7IH1cbiAgICBleGVjdXRlKHRvb2xOYW1lOiBzdHJpbmcsIGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7IHJldHVybiB0aGlzLmV4ZWMuZXhlY3V0ZSh0b29sTmFtZSwgYXJncyk7IH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ3ZhbGlkYXRlX2pzb25fcGFyYW1zJyxcbiAgICAgICAgdGl0bGU6ICdWYWxpZGF0ZS9yZXBhaXIgSlNPTiBhcmdzJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gVmFsaWRhdGUgYW5kIGxpZ2h0bHkgcmVwYWlyIGEgSlNPTiBhcmd1bWVudCBzdHJpbmcgYmVmb3JlIGNhbGxpbmcgYW5vdGhlciB0b29sLiBObyBDb2NvcyBzaWRlIGVmZmVjdHM7IHVzZWZ1bCBmb3IgZGlhZ25vc2luZyBlc2NhcGluZyBvciByZXF1aXJlZC1maWVsZCBlcnJvcnMuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIGpzb25TdHJpbmc6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0pTT04gc3RyaW5nIHRvIHBhcnNlIGFuZCBsaWdodGx5IHJlcGFpciBiZWZvcmUgYSB0b29sIGNhbGwuIEhhbmRsZXMgY29tbW9uIGVzY2FwaW5nLCBxdW90ZSwgYW5kIHRyYWlsaW5nLWNvbW1hIG1pc3Rha2VzLicpLFxuICAgICAgICAgICAgZXhwZWN0ZWRTY2hlbWE6IHoub2JqZWN0KHt9KS5wYXNzdGhyb3VnaCgpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ09wdGlvbmFsIHNpbXBsZSBKU09OIHNjaGVtYTsgY2hlY2tzIG9ubHkgYmFzaWMgdHlwZSBhbmQgcmVxdWlyZWQgZmllbGRzLicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIHZhbGlkYXRlSnNvblBhcmFtcyhhcmdzOiB7IGpzb25TdHJpbmc6IHN0cmluZzsgZXhwZWN0ZWRTY2hlbWE/OiBhbnkgfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHsganNvblN0cmluZywgZXhwZWN0ZWRTY2hlbWEgfSA9IGFyZ3M7XG4gICAgICAgIC8vIEZpcnN0IHRyeSB0byBwYXJzZSBhcy1pc1xuICAgICAgICBsZXQgcGFyc2VkO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgcGFyc2VkID0gSlNPTi5wYXJzZShqc29uU3RyaW5nKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgLy8gVHJ5IHRvIGZpeCBjb21tb24gaXNzdWVzXG4gICAgICAgICAgICBjb25zdCBmaXhlZCA9IHRoaXMuZml4SnNvblN0cmluZyhqc29uU3RyaW5nKTtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgcGFyc2VkID0gSlNPTi5wYXJzZShmaXhlZCk7XG4gICAgICAgICAgICB9IGNhdGNoIChzZWNvbmRFcnJvcikge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKGBDYW5ub3QgZml4IEpTT046ICR7ZXJyb3IubWVzc2FnZX1gLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICBvcmlnaW5hbEpzb246IGpzb25TdHJpbmcsXG4gICAgICAgICAgICAgICAgICAgICAgICBmaXhlZEF0dGVtcHQ6IGZpeGVkLFxuICAgICAgICAgICAgICAgICAgICAgICAgc3VnZ2VzdGlvbnM6IHRoaXMuZ2V0SnNvbkZpeFN1Z2dlc3Rpb25zKGpzb25TdHJpbmcpXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gVmFsaWRhdGUgYWdhaW5zdCBzY2hlbWEgaWYgcHJvdmlkZWRcbiAgICAgICAgaWYgKGV4cGVjdGVkU2NoZW1hKSB7XG4gICAgICAgICAgICBjb25zdCB2YWxpZGF0aW9uID0gdGhpcy52YWxpZGF0ZUFnYWluc3RTY2hlbWEocGFyc2VkLCBleHBlY3RlZFNjaGVtYSk7XG4gICAgICAgICAgICBpZiAoIXZhbGlkYXRpb24udmFsaWQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFpbCgnU2NoZW1hIHZhbGlkYXRpb24gZmFpbGVkJywge1xuICAgICAgICAgICAgICAgICAgICAgICAgcGFyc2VkSnNvbjogcGFyc2VkLFxuICAgICAgICAgICAgICAgICAgICAgICAgdmFsaWRhdGlvbkVycm9yczogdmFsaWRhdGlvbi5lcnJvcnMsXG4gICAgICAgICAgICAgICAgICAgICAgICBzdWdnZXN0aW9uczogdmFsaWRhdGlvbi5zdWdnZXN0aW9uc1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgcGFyc2VkSnNvbjogcGFyc2VkLFxuICAgICAgICAgICAgICAgIGZpeGVkSnNvbjogSlNPTi5zdHJpbmdpZnkocGFyc2VkLCBudWxsLCAyKSxcbiAgICAgICAgICAgICAgICBpc1ZhbGlkOiB0cnVlXG4gICAgICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdzYWZlX3N0cmluZ192YWx1ZScsXG4gICAgICAgIHRpdGxlOiAnRXNjYXBlIHN0cmluZyBmb3IgSlNPTicsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIEVzY2FwZSBhIHJhdyBzdHJpbmcgZm9yIHNhZmUgdXNlIGluc2lkZSBKU09OIGFyZ3VtZW50cy4gTm8gQ29jb3Mgc2lkZSBlZmZlY3RzOyB1c2VmdWwgZm9yIExhYmVsIHRleHQgb3IgY3VzdG9tIGRhdGEgY29udGFpbmluZyBxdW90ZXMvbmV3bGluZXMuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIHZhbHVlOiB6LnN0cmluZygpLmRlc2NyaWJlKCdSYXcgc3RyaW5nIHRoYXQgbXVzdCBiZSBlbWJlZGRlZCBzYWZlbHkgaW5zaWRlIEpTT04gYXJndW1lbnRzLicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIHNhZmVTdHJpbmdWYWx1ZShhcmdzOiB7IHZhbHVlOiBzdHJpbmcgfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHsgdmFsdWUgfSA9IGFyZ3M7XG4gICAgICAgIGNvbnN0IHNhZmVWYWx1ZSA9IHRoaXMuZXNjYXBKc29uU3RyaW5nKHZhbHVlKTtcbiAgICAgICAgcmV0dXJuIG9rKHtcbiAgICAgICAgICAgICAgICBvcmlnaW5hbFZhbHVlOiB2YWx1ZSxcbiAgICAgICAgICAgICAgICBzYWZlVmFsdWU6IHNhZmVWYWx1ZSxcbiAgICAgICAgICAgICAgICBqc29uUmVhZHk6IEpTT04uc3RyaW5naWZ5KHNhZmVWYWx1ZSksXG4gICAgICAgICAgICAgICAgdXNhZ2U6IGBVc2UgXCIke3NhZmVWYWx1ZX1cIiBpbiB5b3VyIEpTT04gcGFyYW1ldGVyc2BcbiAgICAgICAgICAgIH0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ2Zvcm1hdF9tY3BfcmVxdWVzdCcsXG4gICAgICAgIHRpdGxlOiAnRm9ybWF0IE1DUCByZXF1ZXN0JyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gRm9ybWF0IGEgY29tcGxldGUgTUNQIHRvb2xzL2NhbGwgcmVxdWVzdCBhbmQgY3VybCBleGFtcGxlLiBGb3JtYXR0aW5nIG9ubHk7IGRvZXMgbm90IGV4ZWN1dGUgdGhlIHRhcmdldCB0b29sLicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICB0b29sTmFtZTogei5zdHJpbmcoKS5kZXNjcmliZSgnTUNQIHRvb2wgbmFtZSB0byB3cmFwLCBlLmcuIGNyZWF0ZV9ub2RlIG9yIHNldF9jb21wb25lbnRfcHJvcGVydHkuJyksXG4gICAgICAgICAgICBhcmd1bWVudHM6IHoub2JqZWN0KHt9KS5wYXNzdGhyb3VnaCgpLmRlc2NyaWJlKCdBcmd1bWVudHMgb2JqZWN0IGZvciB0aGUgdGFyZ2V0IHRvb2wuIFRoaXMgaGVscGVyIGZvcm1hdHMgb25seTsgaXQgZG9lcyBub3QgZXhlY3V0ZSB0aGUgdG9vbC4nKSxcbiAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBmb3JtYXRNY3BSZXF1ZXN0KGFyZ3M6IHsgdG9vbE5hbWU6IHN0cmluZzsgYXJndW1lbnRzOiBhbnkgfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHRvb2xOYW1lID0gYXJncy50b29sTmFtZTtcbiAgICAgICAgY29uc3QgdG9vbEFyZ3MgPSBhcmdzLmFyZ3VtZW50cztcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IG1jcFJlcXVlc3QgPSB7XG4gICAgICAgICAgICAgICAganNvbnJwYzogJzIuMCcsXG4gICAgICAgICAgICAgICAgaWQ6IERhdGUubm93KCksXG4gICAgICAgICAgICAgICAgbWV0aG9kOiAndG9vbHMvY2FsbCcsXG4gICAgICAgICAgICAgICAgcGFyYW1zOiB7XG4gICAgICAgICAgICAgICAgICAgIG5hbWU6IHRvb2xOYW1lLFxuICAgICAgICAgICAgICAgICAgICBhcmd1bWVudHM6IHRvb2xBcmdzXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgY29uc3QgZm9ybWF0dGVkSnNvbiA9IEpTT04uc3RyaW5naWZ5KG1jcFJlcXVlc3QsIG51bGwsIDIpO1xuICAgICAgICAgICAgY29uc3QgY29tcGFjdEpzb24gPSBKU09OLnN0cmluZ2lmeShtY3BSZXF1ZXN0KTtcblxuICAgICAgICAgICAgcmV0dXJuIG9rKHtcbiAgICAgICAgICAgICAgICAgICAgcmVxdWVzdDogbWNwUmVxdWVzdCxcbiAgICAgICAgICAgICAgICAgICAgZm9ybWF0dGVkSnNvbjogZm9ybWF0dGVkSnNvbixcbiAgICAgICAgICAgICAgICAgICAgY29tcGFjdEpzb246IGNvbXBhY3RKc29uLFxuICAgICAgICAgICAgICAgICAgICBjdXJsQ29tbWFuZDogdGhpcy5nZW5lcmF0ZUN1cmxDb21tYW5kKGNvbXBhY3RKc29uKVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbChgRmFpbGVkIHRvIGZvcm1hdCBNQ1AgcmVxdWVzdDogJHtlcnJvci5tZXNzYWdlfWApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBmaXhKc29uU3RyaW5nKGpzb25TdHI6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgICAgIGxldCBmaXhlZCA9IGpzb25TdHI7XG4gICAgICAgIFxuICAgICAgICAvLyBGaXggY29tbW9uIGVzY2FwZSBjaGFyYWN0ZXIgaXNzdWVzXG4gICAgICAgIGZpeGVkID0gZml4ZWRcbiAgICAgICAgICAgIC8vIEZpeCB1bmVzY2FwZWQgcXVvdGVzIGluIHN0cmluZyB2YWx1ZXNcbiAgICAgICAgICAgIC5yZXBsYWNlKC8oXFx7W159XSpcIlteXCJdKlwiOlxccypcIikoW15cIl0qXCIpKFteXCJdKlwiKShbXn1dKlxcfSkvZywgKG1hdGNoLCBwcmVmaXgsIGNvbnRlbnQsIHN1ZmZpeCwgZW5kKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgZXNjYXBlZENvbnRlbnQgPSBjb250ZW50LnJlcGxhY2UoL1wiL2csICdcXFxcXCInKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gcHJlZml4ICsgZXNjYXBlZENvbnRlbnQgKyBzdWZmaXggKyBlbmQ7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLy8gRml4IHVuZXNjYXBlZCBiYWNrc2xhc2hlc1xuICAgICAgICAgICAgLnJlcGxhY2UoLyhbXlxcXFxdKVxcXFwoW15cIlxcXFxcXC9iZm5ydHVdKS9nLCAnJDFcXFxcXFxcXCQyJylcbiAgICAgICAgICAgIC8vIEZpeCB0cmFpbGluZyBjb21tYXNcbiAgICAgICAgICAgIC5yZXBsYWNlKC8sKFxccypbfVxcXV0pL2csICckMScpXG4gICAgICAgICAgICAvLyBGaXggY29udHJvbCBjaGFyYWN0ZXJzXG4gICAgICAgICAgICAucmVwbGFjZSgvXFxuL2csICdcXFxcbicpXG4gICAgICAgICAgICAucmVwbGFjZSgvXFxyL2csICdcXFxccicpXG4gICAgICAgICAgICAucmVwbGFjZSgvXFx0L2csICdcXFxcdCcpXG4gICAgICAgICAgICAvLyBGaXggc2luZ2xlIHF1b3RlcyB0byBkb3VibGUgcXVvdGVzXG4gICAgICAgICAgICAucmVwbGFjZSgvJy9nLCAnXCInKTtcbiAgICAgICAgXG4gICAgICAgIHJldHVybiBmaXhlZDtcbiAgICB9XG5cbiAgICBwcml2YXRlIGVzY2FwSnNvblN0cmluZyhzdHI6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiBzdHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXFxcL2csICdcXFxcXFxcXCcpICAvLyBFc2NhcGUgYmFja3NsYXNoZXMgZmlyc3RcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cIi9nLCAnXFxcXFwiJykgICAgLy8gRXNjYXBlIHF1b3Rlc1xuICAgICAgICAgICAgLnJlcGxhY2UoL1xcbi9nLCAnXFxcXG4nKSAgIC8vIEVzY2FwZSBuZXdsaW5lc1xuICAgICAgICAgICAgLnJlcGxhY2UoL1xcci9nLCAnXFxcXHInKSAgIC8vIEVzY2FwZSBjYXJyaWFnZSByZXR1cm5zXG4gICAgICAgICAgICAucmVwbGFjZSgvXFx0L2csICdcXFxcdCcpICAgLy8gRXNjYXBlIHRhYnNcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXGYvZywgJ1xcXFxmJykgICAvLyBFc2NhcGUgZm9ybSBmZWVkc1xuICAgICAgICAgICAgLnJlcGxhY2UoL1xcYi9nLCAnXFxcXGInKTsgIC8vIEVzY2FwZSBiYWNrc3BhY2VzXG4gICAgfVxuXG4gICAgcHJpdmF0ZSB2YWxpZGF0ZUFnYWluc3RTY2hlbWEoZGF0YTogYW55LCBzY2hlbWE6IGFueSk6IHsgdmFsaWQ6IGJvb2xlYW47IGVycm9yczogc3RyaW5nW107IHN1Z2dlc3Rpb25zOiBzdHJpbmdbXSB9IHtcbiAgICAgICAgY29uc3QgZXJyb3JzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICBjb25zdCBzdWdnZXN0aW9uczogc3RyaW5nW10gPSBbXTtcblxuICAgICAgICAvLyBCYXNpYyB0eXBlIGNoZWNraW5nXG4gICAgICAgIGlmIChzY2hlbWEudHlwZSkge1xuICAgICAgICAgICAgY29uc3QgYWN0dWFsVHlwZSA9IEFycmF5LmlzQXJyYXkoZGF0YSkgPyAnYXJyYXknIDogdHlwZW9mIGRhdGE7XG4gICAgICAgICAgICBpZiAoYWN0dWFsVHlwZSAhPT0gc2NoZW1hLnR5cGUpIHtcbiAgICAgICAgICAgICAgICBlcnJvcnMucHVzaChgRXhwZWN0ZWQgdHlwZSAke3NjaGVtYS50eXBlfSwgZ290ICR7YWN0dWFsVHlwZX1gKTtcbiAgICAgICAgICAgICAgICBzdWdnZXN0aW9ucy5wdXNoKGBDb252ZXJ0IHZhbHVlIHRvICR7c2NoZW1hLnR5cGV9YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBSZXF1aXJlZCBmaWVsZHMgY2hlY2tpbmdcbiAgICAgICAgaWYgKHNjaGVtYS5yZXF1aXJlZCAmJiBBcnJheS5pc0FycmF5KHNjaGVtYS5yZXF1aXJlZCkpIHtcbiAgICAgICAgICAgIGZvciAoY29uc3QgZmllbGQgb2Ygc2NoZW1hLnJlcXVpcmVkKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoZGF0YSwgZmllbGQpKSB7XG4gICAgICAgICAgICAgICAgICAgIGVycm9ycy5wdXNoKGBNaXNzaW5nIHJlcXVpcmVkIGZpZWxkOiAke2ZpZWxkfWApO1xuICAgICAgICAgICAgICAgICAgICBzdWdnZXN0aW9ucy5wdXNoKGBBZGQgcmVxdWlyZWQgZmllbGQgXCIke2ZpZWxkfVwiYCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHZhbGlkOiBlcnJvcnMubGVuZ3RoID09PSAwLFxuICAgICAgICAgICAgZXJyb3JzLFxuICAgICAgICAgICAgc3VnZ2VzdGlvbnNcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGdldEpzb25GaXhTdWdnZXN0aW9ucyhqc29uU3RyOiBzdHJpbmcpOiBzdHJpbmdbXSB7XG4gICAgICAgIGNvbnN0IHN1Z2dlc3Rpb25zOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICBcbiAgICAgICAgaWYgKGpzb25TdHIuaW5jbHVkZXMoJ1xcXFxcIicpKSB7XG4gICAgICAgICAgICBzdWdnZXN0aW9ucy5wdXNoKCdDaGVjayBmb3IgaW1wcm9wZXJseSBlc2NhcGVkIHF1b3RlcycpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChqc29uU3RyLmluY2x1ZGVzKFwiJ1wiKSkge1xuICAgICAgICAgICAgc3VnZ2VzdGlvbnMucHVzaCgnUmVwbGFjZSBzaW5nbGUgcXVvdGVzIHdpdGggZG91YmxlIHF1b3RlcycpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChqc29uU3RyLmluY2x1ZGVzKCdcXG4nKSB8fCBqc29uU3RyLmluY2x1ZGVzKCdcXHQnKSkge1xuICAgICAgICAgICAgc3VnZ2VzdGlvbnMucHVzaCgnRXNjYXBlIG5ld2xpbmVzIGFuZCB0YWJzIHByb3Blcmx5Jyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25TdHIubWF0Y2goLyxcXHMqW31cXF1dLykpIHtcbiAgICAgICAgICAgIHN1Z2dlc3Rpb25zLnB1c2goJ1JlbW92ZSB0cmFpbGluZyBjb21tYXMnKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgcmV0dXJuIHN1Z2dlc3Rpb25zO1xuICAgIH1cblxuICAgIHByaXZhdGUgZ2VuZXJhdGVDdXJsQ29tbWFuZChqc29uU3RyOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgICAgICBjb25zdCBlc2NhcGVkSnNvbiA9IGpzb25TdHIucmVwbGFjZSgvJy9nLCBcIidcXFwiJ1xcXCInXCIpO1xuICAgICAgICByZXR1cm4gYGN1cmwgLVggUE9TVCBodHRwOi8vMTI3LjAuMC4xOjg1ODUvbWNwIFxcXFxcbiAgLUggXCJDb250ZW50LVR5cGU6IGFwcGxpY2F0aW9uL2pzb25cIiBcXFxcXG4gIC1kICcke2VzY2FwZWRKc29ufSdgO1xuICAgIH1cbn1cbiJdfQ==