import { ok, fail } from '../lib/response';
import { ToolDefinition, ToolResponse, ToolExecutor } from '../types';
import { z } from '../lib/schema';
import { defineTools, ToolDef } from '../lib/define-tools';

export class ValidationTools implements ToolExecutor {
    private readonly exec: ToolExecutor;

    constructor() {
        const defs: ToolDef[] = [
            {
                name: 'validate_json_params',
                title: 'Validate/repair JSON args',
                description: '[specialist] Validate and lightly repair a JSON argument string before calling another tool. No Cocos side effects; useful for diagnosing escaping or required-field errors.',
                inputSchema: z.object({
                    jsonString: z.string().describe('JSON string to parse and lightly repair before a tool call. Handles common escaping, quote, and trailing-comma mistakes.'),
                    expectedSchema: z.object({}).passthrough().optional().describe('Optional simple JSON schema; checks only basic type and required fields.'),
                }),
                handler: a => this.validateJsonParams(a.jsonString, a.expectedSchema),
            },
            {
                name: 'safe_string_value',
                title: 'Escape string for JSON',
                description: '[specialist] Escape a raw string for safe use inside JSON arguments. No Cocos side effects; useful for Label text or custom data containing quotes/newlines.',
                inputSchema: z.object({
                    value: z.string().describe('Raw string that must be embedded safely inside JSON arguments.'),
                }),
                handler: a => this.createSafeStringValue(a.value),
            },
            {
                name: 'format_mcp_request',
                title: 'Format MCP request',
                description: '[specialist] Format a complete MCP tools/call request and curl example. Formatting only; does not execute the target tool.',
                inputSchema: z.object({
                    toolName: z.string().describe('MCP tool name to wrap, e.g. create_node or set_component_property.'),
                    arguments: z.object({}).passthrough().describe('Arguments object for the target tool. This helper formats only; it does not execute the tool.'),
                }),
                handler: a => this.formatMcpRequest(a.toolName, a.arguments),
            },
        ];
        this.exec = defineTools(defs);
    }

    getTools(): ToolDefinition[] { return this.exec.getTools(); }
    execute(toolName: string, args: any): Promise<ToolResponse> { return this.exec.execute(toolName, args); }

    private async validateJsonParams(jsonString: string, expectedSchema?: any): Promise<ToolResponse> {
        // First try to parse as-is
        let parsed;
        try {
            parsed = JSON.parse(jsonString);
        } catch (error: any) {
            // Try to fix common issues
            const fixed = this.fixJsonString(jsonString);
            try {
                parsed = JSON.parse(fixed);
            } catch (secondError) {
                return fail(`Cannot fix JSON: ${error.message}`, {
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
                return fail('Schema validation failed', {
                        parsedJson: parsed,
                        validationErrors: validation.errors,
                        suggestions: validation.suggestions
                    });
            }
        }

        return ok({
                parsedJson: parsed,
                fixedJson: JSON.stringify(parsed, null, 2),
                isValid: true
            });
    }

    private async createSafeStringValue(value: string): Promise<ToolResponse> {
        const safeValue = this.escapJsonString(value);
        return ok({
                originalValue: value,
                safeValue: safeValue,
                jsonReady: JSON.stringify(safeValue),
                usage: `Use "${safeValue}" in your JSON parameters`
            });
    }

    private async formatMcpRequest(toolName: string, toolArgs: any): Promise<ToolResponse> {
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

            return ok({
                    request: mcpRequest,
                    formattedJson: formattedJson,
                    compactJson: compactJson,
                    curlCommand: this.generateCurlCommand(compactJson)
                });
        } catch (error: any) {
            return fail(`Failed to format MCP request: ${error.message}`);
        }
    }

    private fixJsonString(jsonStr: string): string {
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

    private escapJsonString(str: string): string {
        return str
            .replace(/\\/g, '\\\\')  // Escape backslashes first
            .replace(/"/g, '\\"')    // Escape quotes
            .replace(/\n/g, '\\n')   // Escape newlines
            .replace(/\r/g, '\\r')   // Escape carriage returns
            .replace(/\t/g, '\\t')   // Escape tabs
            .replace(/\f/g, '\\f')   // Escape form feeds
            .replace(/\b/g, '\\b');  // Escape backspaces
    }

    private validateAgainstSchema(data: any, schema: any): { valid: boolean; errors: string[]; suggestions: string[] } {
        const errors: string[] = [];
        const suggestions: string[] = [];

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

    private getJsonFixSuggestions(jsonStr: string): string[] {
        const suggestions: string[] = [];
        
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

    private generateCurlCommand(jsonStr: string): string {
        const escapedJson = jsonStr.replace(/'/g, "'\"'\"'");
        return `curl -X POST http://127.0.0.1:8585/mcp \\
  -H "Content-Type: application/json" \\
  -d '${escapedJson}'`;
    }
}
