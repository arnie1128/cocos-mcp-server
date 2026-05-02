"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValidationTools = void 0;
const response_1 = require("../lib/response");
const schema_1 = require("../lib/schema");
const define_tools_1 = require("../lib/define-tools");
class ValidationTools {
    constructor() {
        const defs = [
            {
                name: 'validate_json_params',
                title: 'Validate/repair JSON args',
                description: '[specialist] Validate and lightly repair a JSON argument string before calling another tool. No Cocos side effects; useful for diagnosing escaping or required-field errors.',
                inputSchema: schema_1.z.object({
                    jsonString: schema_1.z.string().describe('JSON string to parse and lightly repair before a tool call. Handles common escaping, quote, and trailing-comma mistakes.'),
                    expectedSchema: schema_1.z.object({}).passthrough().optional().describe('Optional simple JSON schema; checks only basic type and required fields.'),
                }),
                handler: a => this.validateJsonParams(a.jsonString, a.expectedSchema),
            },
            {
                name: 'safe_string_value',
                title: 'Escape string for JSON',
                description: '[specialist] Escape a raw string for safe use inside JSON arguments. No Cocos side effects; useful for Label text or custom data containing quotes/newlines.',
                inputSchema: schema_1.z.object({
                    value: schema_1.z.string().describe('Raw string that must be embedded safely inside JSON arguments.'),
                }),
                handler: a => this.createSafeStringValue(a.value),
            },
            {
                name: 'format_mcp_request',
                title: 'Format MCP request',
                description: '[specialist] Format a complete MCP tools/call request and curl example. Formatting only; does not execute the target tool.',
                inputSchema: schema_1.z.object({
                    toolName: schema_1.z.string().describe('MCP tool name to wrap, e.g. create_node or set_component_property.'),
                    arguments: schema_1.z.object({}).passthrough().describe('Arguments object for the target tool. This helper formats only; it does not execute the tool.'),
                }),
                handler: a => this.formatMcpRequest(a.toolName, a.arguments),
            },
        ];
        this.exec = (0, define_tools_1.defineTools)(defs);
    }
    getTools() { return this.exec.getTools(); }
    execute(toolName, args) { return this.exec.execute(toolName, args); }
    async validateJsonParams(jsonString, expectedSchema) {
        try {
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
        catch (error) {
            return (0, response_1.fail)(error.message);
        }
    }
    async createSafeStringValue(value) {
        const safeValue = this.escapJsonString(value);
        return (0, response_1.ok)({
            originalValue: value,
            safeValue: safeValue,
            jsonReady: JSON.stringify(safeValue),
            usage: `Use "${safeValue}" in your JSON parameters`
        });
    }
    async formatMcpRequest(toolName, toolArgs) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmFsaWRhdGlvbi10b29scy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NvdXJjZS90b29scy92YWxpZGF0aW9uLXRvb2xzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLDhDQUEyQztBQUUzQywwQ0FBa0M7QUFDbEMsc0RBQTJEO0FBRTNELE1BQWEsZUFBZTtJQUd4QjtRQUNJLE1BQU0sSUFBSSxHQUFjO1lBQ3BCO2dCQUNJLElBQUksRUFBRSxzQkFBc0I7Z0JBQzVCLEtBQUssRUFBRSwyQkFBMkI7Z0JBQ2xDLFdBQVcsRUFBRSw4S0FBOEs7Z0JBQzNMLFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDO29CQUNsQixVQUFVLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQywwSEFBMEgsQ0FBQztvQkFDM0osY0FBYyxFQUFFLFVBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsV0FBVyxFQUFFLENBQUMsUUFBUSxFQUFFLENBQUMsUUFBUSxDQUFDLDBFQUEwRSxDQUFDO2lCQUM3SSxDQUFDO2dCQUNGLE9BQU8sRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQyxjQUFjLENBQUM7YUFDeEU7WUFDRDtnQkFDSSxJQUFJLEVBQUUsbUJBQW1CO2dCQUN6QixLQUFLLEVBQUUsd0JBQXdCO2dCQUMvQixXQUFXLEVBQUUsOEpBQThKO2dCQUMzSyxXQUFXLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQztvQkFDbEIsS0FBSyxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLENBQUMsZ0VBQWdFLENBQUM7aUJBQy9GLENBQUM7Z0JBQ0YsT0FBTyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUM7YUFDcEQ7WUFDRDtnQkFDSSxJ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QUssRUFBRSxNQUFNLENBQUMsTUFBTSxLQUFLLENBQUM7WUFDMUIsTUFBTTtZQUNOLFdBQVc7U0FDZCxDQUFDO0lBQ04sQ0FBQztJQUVPLHFCQUFxQixDQUFDLE9BQWU7UUFDekMsTUFBTSxXQUFXLEdBQWEsRUFBRSxDQUFDO1FBRWpDLElBQUksT0FBTyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQzFCLFdBQVcsQ0FBQyxJQUFJLENBQUMscUNBQXFDLENBQUMsQ0FBQztRQUM1RCxDQUFDO1FBQ0QsSUFBSSxPQUFPLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDeEIsV0FBVyxDQUFDLElBQUksQ0FBQywwQ0FBMEMsQ0FBQyxDQUFDO1FBQ2pFLENBQUM7UUFDRCxJQUFJLE9BQU8sQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLElBQUksT0FBTyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO1lBQ25ELFdBQVcsQ0FBQyxJQUFJLENBQUMsbUNBQW1DLENBQUMsQ0FBQztRQUMxRCxDQUFDO1FBQ0QsSUFBSSxPQUFPLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUM7WUFDN0IsV0FBVyxDQUFDLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO1FBQy9DLENBQUM7UUFFRCxPQUFPLFdBQVcsQ0FBQztJQUN2QixDQUFDO0lBRU8sbUJBQW1CLENBQUMsT0FBZTtRQUN2QyxNQUFNLFdBQVcsR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxTQUFTLENBQUMsQ0FBQztRQUNyRCxPQUFPOztRQUVQLFdBQVcsR0FBRyxDQUFDO0lBQ25CLENBQUM7Q0FDSjtBQWpORCwwQ0FpTkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBvaywgZmFpbCB9IGZyb20gJy4uL2xpYi9yZXNwb25zZSc7XG5pbXBvcnQgeyBUb29sRGVmaW5pdGlvbiwgVG9vbFJlc3BvbnNlLCBUb29sRXhlY3V0b3IgfSBmcm9tICcuLi90eXBlcyc7XG5pbXBvcnQgeyB6IH0gZnJvbSAnLi4vbGliL3NjaGVtYSc7XG5pbXBvcnQgeyBkZWZpbmVUb29scywgVG9vbERlZiB9IGZyb20gJy4uL2xpYi9kZWZpbmUtdG9vbHMnO1xuXG5leHBvcnQgY2xhc3MgVmFsaWRhdGlvblRvb2xzIGltcGxlbWVudHMgVG9vbEV4ZWN1dG9yIHtcbiAgICBwcml2YXRlIHJlYWRvbmx5IGV4ZWM6IFRvb2xFeGVjdXRvcjtcblxuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICBjb25zdCBkZWZzOiBUb29sRGVmW10gPSBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3ZhbGlkYXRlX2pzb25fcGFyYW1zJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1ZhbGlkYXRlL3JlcGFpciBKU09OIGFyZ3MnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFZhbGlkYXRlIGFuZCBsaWdodGx5IHJlcGFpciBhIEpTT04gYXJndW1lbnQgc3RyaW5nIGJlZm9yZSBjYWxsaW5nIGFub3RoZXIgdG9vbC4gTm8gQ29jb3Mgc2lkZSBlZmZlY3RzOyB1c2VmdWwgZm9yIGRpYWdub3NpbmcgZXNjYXBpbmcgb3IgcmVxdWlyZWQtZmllbGQgZXJyb3JzLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAganNvblN0cmluZzogei5zdHJpbmcoKS5kZXNjcmliZSgnSlNPTiBzdHJpbmcgdG8gcGFyc2UgYW5kIGxpZ2h0bHkgcmVwYWlyIGJlZm9yZSBhIHRvb2wgY2FsbC4gSGFuZGxlcyBjb21tb24gZXNjYXBpbmcsIHF1b3RlLCBhbmQgdHJhaWxpbmctY29tbWEgbWlzdGFrZXMuJyksXG4gICAgICAgICAgICAgICAgICAgIGV4cGVjdGVkU2NoZW1hOiB6Lm9iamVjdCh7fSkucGFzc3Rocm91Z2goKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdPcHRpb25hbCBzaW1wbGUgSlNPTiBzY2hlbWE7IGNoZWNrcyBvbmx5IGJhc2ljIHR5cGUgYW5kIHJlcXVpcmVkIGZpZWxkcy4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMudmFsaWRhdGVKc29uUGFyYW1zKGEuanNvblN0cmluZywgYS5leHBlY3RlZFNjaGVtYSksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdzYWZlX3N0cmluZ192YWx1ZScsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdFc2NhcGUgc3RyaW5nIGZvciBKU09OJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBFc2NhcGUgYSByYXcgc3RyaW5nIGZvciBzYWZlIHVzZSBpbnNpZGUgSlNPTiBhcmd1bWVudHMuIE5vIENvY29zIHNpZGUgZWZmZWN0czsgdXNlZnVsIGZvciBMYWJlbCB0ZXh0IG9yIGN1c3RvbSBkYXRhIGNvbnRhaW5pbmcgcXVvdGVzL25ld2xpbmVzLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgdmFsdWU6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1JhdyBzdHJpbmcgdGhhdCBtdXN0IGJlIGVtYmVkZGVkIHNhZmVseSBpbnNpZGUgSlNPTiBhcmd1bWVudHMuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLmNyZWF0ZVNhZmVTdHJpbmdWYWx1ZShhLnZhbHVlKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2Zvcm1hdF9tY3BfcmVxdWVzdCcsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdGb3JtYXQgTUNQIHJlcXVlc3QnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIEZvcm1hdCBhIGNvbXBsZXRlIE1DUCB0b29scy9jYWxsIHJlcXVlc3QgYW5kIGN1cmwgZXhhbXBsZS4gRm9ybWF0dGluZyBvbmx5OyBkb2VzIG5vdCBleGVjdXRlIHRoZSB0YXJnZXQgdG9vbC4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHRvb2xOYW1lOiB6LnN0cmluZygpLmRlc2NyaWJlKCdNQ1AgdG9vbCBuYW1lIHRvIHdyYXAsIGUuZy4gY3JlYXRlX25vZGUgb3Igc2V0X2NvbXBvbmVudF9wcm9wZXJ0eS4nKSxcbiAgICAgICAgICAgICAgICAgICAgYXJndW1lbnRzOiB6Lm9iamVjdCh7fSkucGFzc3Rocm91Z2goKS5kZXNjcmliZSgnQXJndW1lbnRzIG9iamVjdCBmb3IgdGhlIHRhcmdldCB0b29sLiBUaGlzIGhlbHBlciBmb3JtYXRzIG9ubHk7IGl0IGRvZXMgbm90IGV4ZWN1dGUgdGhlIHRvb2wuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLmZvcm1hdE1jcFJlcXVlc3QoYS50b29sTmFtZSwgYS5hcmd1bWVudHMpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgXTtcbiAgICAgICAgdGhpcy5leGVjID0gZGVmaW5lVG9vbHMoZGVmcyk7XG4gICAgfVxuXG4gICAgZ2V0VG9vbHMoKTogVG9vbERlZmluaXRpb25bXSB7IHJldHVybiB0aGlzLmV4ZWMuZ2V0VG9vbHMoKTsgfVxuICAgIGV4ZWN1dGUodG9vbE5hbWU6IHN0cmluZywgYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHsgcmV0dXJuIHRoaXMuZXhlYy5leGVjdXRlKHRvb2xOYW1lLCBhcmdzKTsgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyB2YWxpZGF0ZUpzb25QYXJhbXMoanNvblN0cmluZzogc3RyaW5nLCBleHBlY3RlZFNjaGVtYT86IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBGaXJzdCB0cnkgdG8gcGFyc2UgYXMtaXNcbiAgICAgICAgICAgIGxldCBwYXJzZWQ7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHBhcnNlZCA9IEpTT04ucGFyc2UoanNvblN0cmluZyk7XG4gICAgICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICAgICAgLy8gVHJ5IHRvIGZpeCBjb21tb24gaXNzdWVzXG4gICAgICAgICAgICAgICAgY29uc3QgZml4ZWQgPSB0aGlzLmZpeEpzb25TdHJpbmcoanNvblN0cmluZyk7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgcGFyc2VkID0gSlNPTi5wYXJzZShmaXhlZCk7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoc2Vjb25kRXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoYENhbm5vdCBmaXggSlNPTjogJHtlcnJvci5tZXNzYWdlfWAsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBvcmlnaW5hbEpzb246IGpzb25TdHJpbmcsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZml4ZWRBdHRlbXB0OiBmaXhlZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdWdnZXN0aW9uczogdGhpcy5nZXRKc29uRml4U3VnZ2VzdGlvbnMoanNvblN0cmluZylcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gVmFsaWRhdGUgYWdhaW5zdCBzY2hlbWEgaWYgcHJvdmlkZWRcbiAgICAgICAgICAgIGlmIChleHBlY3RlZFNjaGVtYSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHZhbGlkYXRpb24gPSB0aGlzLnZhbGlkYXRlQWdhaW5zdFNjaGVtYShwYXJzZWQsIGV4cGVjdGVkU2NoZW1hKTtcbiAgICAgICAgICAgICAgICBpZiAoIXZhbGlkYXRpb24udmFsaWQpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ1NjaGVtYSB2YWxpZGF0aW9uIGZhaWxlZCcsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwYXJzZWRKc29uOiBwYXJzZWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsaWRhdGlvbkVycm9yczogdmFsaWRhdGlvbi5lcnJvcnMsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3VnZ2VzdGlvbnM6IHZhbGlkYXRpb24uc3VnZ2VzdGlvbnNcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIG9rKHtcbiAgICAgICAgICAgICAgICAgICAgcGFyc2VkSnNvbjogcGFyc2VkLFxuICAgICAgICAgICAgICAgICAgICBmaXhlZEpzb246IEpTT04uc3RyaW5naWZ5KHBhcnNlZCwgbnVsbCwgMiksXG4gICAgICAgICAgICAgICAgICAgIGlzVmFsaWQ6IHRydWVcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoZXJyb3IubWVzc2FnZSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGNyZWF0ZVNhZmVTdHJpbmdWYWx1ZSh2YWx1ZTogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3Qgc2FmZVZhbHVlID0gdGhpcy5lc2NhcEpzb25TdHJpbmcodmFsdWUpO1xuICAgICAgICByZXR1cm4gb2soe1xuICAgICAgICAgICAgICAgIG9yaWdpbmFsVmFsdWU6IHZhbHVlLFxuICAgICAgICAgICAgICAgIHNhZmVWYWx1ZTogc2FmZVZhbHVlLFxuICAgICAgICAgICAgICAgIGpzb25SZWFkeTogSlNPTi5zdHJpbmdpZnkoc2FmZVZhbHVlKSxcbiAgICAgICAgICAgICAgICB1c2FnZTogYFVzZSBcIiR7c2FmZVZhbHVlfVwiIGluIHlvdXIgSlNPTiBwYXJhbWV0ZXJzYFxuICAgICAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBmb3JtYXRNY3BSZXF1ZXN0KHRvb2xOYW1lOiBzdHJpbmcsIHRvb2xBcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgbWNwUmVxdWVzdCA9IHtcbiAgICAgICAgICAgICAgICBqc29ucnBjOiAnMi4wJyxcbiAgICAgICAgICAgICAgICBpZDogRGF0ZS5ub3coKSxcbiAgICAgICAgICAgICAgICBtZXRob2Q6ICd0b29scy9jYWxsJyxcbiAgICAgICAgICAgICAgICBwYXJhbXM6IHtcbiAgICAgICAgICAgICAgICAgICAgbmFtZTogdG9vbE5hbWUsXG4gICAgICAgICAgICAgICAgICAgIGFyZ3VtZW50czogdG9vbEFyZ3NcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBjb25zdCBmb3JtYXR0ZWRKc29uID0gSlNPTi5zdHJpbmdpZnkobWNwUmVxdWVzdCwgbnVsbCwgMik7XG4gICAgICAgICAgICBjb25zdCBjb21wYWN0SnNvbiA9IEpTT04uc3RyaW5naWZ5KG1jcFJlcXVlc3QpO1xuXG4gICAgICAgICAgICByZXR1cm4gb2soe1xuICAgICAgICAgICAgICAgICAgICByZXF1ZXN0OiBtY3BSZXF1ZXN0LFxuICAgICAgICAgICAgICAgICAgICBmb3JtYXR0ZWRKc29uOiBmb3JtYXR0ZWRKc29uLFxuICAgICAgICAgICAgICAgICAgICBjb21wYWN0SnNvbjogY29tcGFjdEpzb24sXG4gICAgICAgICAgICAgICAgICAgIGN1cmxDb21tYW5kOiB0aGlzLmdlbmVyYXRlQ3VybENvbW1hbmQoY29tcGFjdEpzb24pXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKGBGYWlsZWQgdG8gZm9ybWF0IE1DUCByZXF1ZXN0OiAke2Vycm9yLm1lc3NhZ2V9YCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGZpeEpzb25TdHJpbmcoanNvblN0cjogc3RyaW5nKTogc3RyaW5nIHtcbiAgICAgICAgbGV0IGZpeGVkID0ganNvblN0cjtcbiAgICAgICAgXG4gICAgICAgIC8vIEZpeCBjb21tb24gZXNjYXBlIGNoYXJhY3RlciBpc3N1ZXNcbiAgICAgICAgZml4ZWQgPSBmaXhlZFxuICAgICAgICAgICAgLy8gRml4IHVuZXNjYXBlZCBxdW90ZXMgaW4gc3RyaW5nIHZhbHVlc1xuICAgICAgICAgICAgLnJlcGxhY2UoLyhcXHtbXn1dKlwiW15cIl0qXCI6XFxzKlwiKShbXlwiXSpcIikoW15cIl0qXCIpKFtefV0qXFx9KS9nLCAobWF0Y2gsIHByZWZpeCwgY29udGVudCwgc3VmZml4LCBlbmQpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBlc2NhcGVkQ29udGVudCA9IGNvbnRlbnQucmVwbGFjZSgvXCIvZywgJ1xcXFxcIicpO1xuICAgICAgICAgICAgICAgIHJldHVybiBwcmVmaXggKyBlc2NhcGVkQ29udGVudCArIHN1ZmZpeCArIGVuZDtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAvLyBGaXggdW5lc2NhcGVkIGJhY2tzbGFzaGVzXG4gICAgICAgICAgICAucmVwbGFjZSgvKFteXFxcXF0pXFxcXChbXlwiXFxcXFxcL2JmbnJ0dV0pL2csICckMVxcXFxcXFxcJDInKVxuICAgICAgICAgICAgLy8gRml4IHRyYWlsaW5nIGNvbW1hc1xuICAgICAgICAgICAgLnJlcGxhY2UoLywoXFxzKlt9XFxdXSkvZywgJyQxJylcbiAgICAgICAgICAgIC8vIEZpeCBjb250cm9sIGNoYXJhY3RlcnNcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXG4vZywgJ1xcXFxuJylcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXHIvZywgJ1xcXFxyJylcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXHQvZywgJ1xcXFx0JylcbiAgICAgICAgICAgIC8vIEZpeCBzaW5nbGUgcXVvdGVzIHRvIGRvdWJsZSBxdW90ZXNcbiAgICAgICAgICAgIC5yZXBsYWNlKC8nL2csICdcIicpO1xuICAgICAgICBcbiAgICAgICAgcmV0dXJuIGZpeGVkO1xuICAgIH1cblxuICAgIHByaXZhdGUgZXNjYXBKc29uU3RyaW5nKHN0cjogc3RyaW5nKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIHN0clxuICAgICAgICAgICAgLnJlcGxhY2UoL1xcXFwvZywgJ1xcXFxcXFxcJykgIC8vIEVzY2FwZSBiYWNrc2xhc2hlcyBmaXJzdFxuICAgICAgICAgICAgLnJlcGxhY2UoL1wiL2csICdcXFxcXCInKSAgICAvLyBFc2NhcGUgcXVvdGVzXG4gICAgICAgICAgICAucmVwbGFjZSgvXFxuL2csICdcXFxcbicpICAgLy8gRXNjYXBlIG5ld2xpbmVzXG4gICAgICAgICAgICAucmVwbGFjZSgvXFxyL2csICdcXFxccicpICAgLy8gRXNjYXBlIGNhcnJpYWdlIHJldHVybnNcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXHQvZywgJ1xcXFx0JykgICAvLyBFc2NhcGUgdGFic1xuICAgICAgICAgICAgLnJlcGxhY2UoL1xcZi9nLCAnXFxcXGYnKSAgIC8vIEVzY2FwZSBmb3JtIGZlZWRzXG4gICAgICAgICAgICAucmVwbGFjZSgvXFxiL2csICdcXFxcYicpOyAgLy8gRXNjYXBlIGJhY2tzcGFjZXNcbiAgICB9XG5cbiAgICBwcml2YXRlIHZhbGlkYXRlQWdhaW5zdFNjaGVtYShkYXRhOiBhbnksIHNjaGVtYTogYW55KTogeyB2YWxpZDogYm9vbGVhbjsgZXJyb3JzOiBzdHJpbmdbXTsgc3VnZ2VzdGlvbnM6IHN0cmluZ1tdIH0ge1xuICAgICAgICBjb25zdCBlcnJvcnM6IHN0cmluZ1tdID0gW107XG4gICAgICAgIGNvbnN0IHN1Z2dlc3Rpb25zOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgICAgIC8vIEJhc2ljIHR5cGUgY2hlY2tpbmdcbiAgICAgICAgaWYgKHNjaGVtYS50eXBlKSB7XG4gICAgICAgICAgICBjb25zdCBhY3R1YWxUeXBlID0gQXJyYXkuaXNBcnJheShkYXRhKSA/ICdhcnJheScgOiB0eXBlb2YgZGF0YTtcbiAgICAgICAgICAgIGlmIChhY3R1YWxUeXBlICE9PSBzY2hlbWEudHlwZSkge1xuICAgICAgICAgICAgICAgIGVycm9ycy5wdXNoKGBFeHBlY3RlZCB0eXBlICR7c2NoZW1hLnR5cGV9LCBnb3QgJHthY3R1YWxUeXBlfWApO1xuICAgICAgICAgICAgICAgIHN1Z2dlc3Rpb25zLnB1c2goYENvbnZlcnQgdmFsdWUgdG8gJHtzY2hlbWEudHlwZX1gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFJlcXVpcmVkIGZpZWxkcyBjaGVja2luZ1xuICAgICAgICBpZiAoc2NoZW1hLnJlcXVpcmVkICYmIEFycmF5LmlzQXJyYXkoc2NoZW1hLnJlcXVpcmVkKSkge1xuICAgICAgICAgICAgZm9yIChjb25zdCBmaWVsZCBvZiBzY2hlbWEucmVxdWlyZWQpIHtcbiAgICAgICAgICAgICAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChkYXRhLCBmaWVsZCkpIHtcbiAgICAgICAgICAgICAgICAgICAgZXJyb3JzLnB1c2goYE1pc3NpbmcgcmVxdWlyZWQgZmllbGQ6ICR7ZmllbGR9YCk7XG4gICAgICAgICAgICAgICAgICAgIHN1Z2dlc3Rpb25zLnB1c2goYEFkZCByZXF1aXJlZCBmaWVsZCBcIiR7ZmllbGR9XCJgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgdmFsaWQ6IGVycm9ycy5sZW5ndGggPT09IDAsXG4gICAgICAgICAgICBlcnJvcnMsXG4gICAgICAgICAgICBzdWdnZXN0aW9uc1xuICAgICAgICB9O1xuICAgIH1cblxuICAgIHByaXZhdGUgZ2V0SnNvbkZpeFN1Z2dlc3Rpb25zKGpzb25TdHI6IHN0cmluZyk6IHN0cmluZ1tdIHtcbiAgICAgICAgY29uc3Qgc3VnZ2VzdGlvbnM6IHN0cmluZ1tdID0gW107XG4gICAgICAgIFxuICAgICAgICBpZiAoanNvblN0ci5pbmNsdWRlcygnXFxcXFwiJykpIHtcbiAgICAgICAgICAgIHN1Z2dlc3Rpb25zLnB1c2goJ0NoZWNrIGZvciBpbXByb3Blcmx5IGVzY2FwZWQgcXVvdGVzJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25TdHIuaW5jbHVkZXMoXCInXCIpKSB7XG4gICAgICAgICAgICBzdWdnZXN0aW9ucy5wdXNoKCdSZXBsYWNlIHNpbmdsZSBxdW90ZXMgd2l0aCBkb3VibGUgcXVvdGVzJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25TdHIuaW5jbHVkZXMoJ1xcbicpIHx8IGpzb25TdHIuaW5jbHVkZXMoJ1xcdCcpKSB7XG4gICAgICAgICAgICBzdWdnZXN0aW9ucy5wdXNoKCdFc2NhcGUgbmV3bGluZXMgYW5kIHRhYnMgcHJvcGVybHknKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblN0ci5tYXRjaCgvLFxccypbfVxcXV0vKSkge1xuICAgICAgICAgICAgc3VnZ2VzdGlvbnMucHVzaCgnUmVtb3ZlIHRyYWlsaW5nIGNvbW1hcycpO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICByZXR1cm4gc3VnZ2VzdGlvbnM7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBnZW5lcmF0ZUN1cmxDb21tYW5kKGpzb25TdHI6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgICAgIGNvbnN0IGVzY2FwZWRKc29uID0ganNvblN0ci5yZXBsYWNlKC8nL2csIFwiJ1xcXCInXFxcIidcIik7XG4gICAgICAgIHJldHVybiBgY3VybCAtWCBQT1NUIGh0dHA6Ly8xMjcuMC4wLjE6ODU4NS9tY3AgXFxcXFxuICAtSCBcIkNvbnRlbnQtVHlwZTogYXBwbGljYXRpb24vanNvblwiIFxcXFxcbiAgLWQgJyR7ZXNjYXBlZEpzb259J2A7XG4gICAgfVxufVxuIl19