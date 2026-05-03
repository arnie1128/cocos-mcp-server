import { ok, fail } from '../lib/response';
import { ToolDefinition, ToolResponse, ToolExecutor } from '../types';
import { z } from '../lib/schema';
import { mcpTool, defineToolsFromDecorators } from '../lib/decorators';
import { runSceneMethodAsToolResponse } from '../lib/scene-bridge';

interface SceneSnapshotEntry {
    id: string;
    label: string;
    takenAt: string;
    sceneName: string;
    rootUuids: string[];
    nodes: Record<string, any>;
}

const MAX_SNAPSHOTS = 20;
const _snapshots = new Map<string, SceneSnapshotEntry>();
let _snapshotSeq = 0;

export class ValidationTools implements ToolExecutor {
    private readonly exec: ToolExecutor;

    constructor() {
        this.exec = defineToolsFromDecorators(this);
    }

    getTools(): ToolDefinition[] { return this.exec.getTools(); }
    execute(toolName: string, args: any): Promise<ToolResponse> { return this.exec.execute(toolName, args); }

    @mcpTool({
        name: 'take_snapshot',
        title: 'Take scene snapshot',
        description: '[specialist] Capture a flat scene node snapshot (positions, components, hierarchy) for later diff with compare_snapshots. Session-scoped — snapshots are lost on extension reload. No scene mutations.',
        inputSchema: z.object({
            label: z.string().optional().describe('Optional human-readable label for this snapshot.'),
        }),
    })
    async takeSnapshot(args: { label?: string } = {}): Promise<ToolResponse> {
        const result = await runSceneMethodAsToolResponse('takeSceneSnapshot');
        if (!result.success) return result;

        const data = result.data ?? {};
        const id = `snap-${++_snapshotSeq}`;
        const label = args.label?.trim() || id;
        const takenAt = new Date().toISOString();
        const entry: SceneSnapshotEntry = {
            id,
            label,
            takenAt,
            sceneName: data.sceneName ?? '',
            rootUuids: Array.isArray(data.rootUuids) ? data.rootUuids : [],
            nodes: data.nodes ?? {},
        };

        _snapshots.set(id, entry);
        while (_snapshots.size > MAX_SNAPSHOTS) {
            const oldest = _snapshots.keys().next().value;
            if (!oldest) break;
            _snapshots.delete(oldest);
        }

        return ok({
                id,
                label,
                takenAt,
                sceneName: entry.sceneName,
                nodeCount: Object.keys(entry.nodes).length,
            });
    }

    @mcpTool({
        name: 'compare_snapshots',
        title: 'Compare scene snapshots',
        description: '[specialist] Compare two stored scene snapshots by ID and report node-level diff: added, removed, and modified nodes with field-level change list.',
        inputSchema: z.object({
            baseId: z.string().describe('Snapshot id to use as the comparison base.'),
            headId: z.string().describe('Snapshot id to compare against the base.'),
        }),
    })
    async compareSnapshots(args: { baseId: string; headId: string }): Promise<ToolResponse> {
        const base = _snapshots.get(args.baseId);
        const head = _snapshots.get(args.headId);
        if (!base) return fail(`Snapshot ${args.baseId} not found`);
        if (!head) return fail(`Snapshot ${args.headId} not found`);

        const baseNodes = base.nodes ?? {};
        const headNodes = head.nodes ?? {};
        const added = Object.keys(headNodes)
            .filter(uuid => !baseNodes[uuid])
            .map(uuid => headNodes[uuid]);
        const removed = Object.keys(baseNodes)
            .filter(uuid => !headNodes[uuid])
            .map(uuid => baseNodes[uuid]);
        const modified = Object.keys(headNodes)
            .filter(uuid => baseNodes[uuid])
            .map(uuid => {
                const before = baseNodes[uuid];
                const after = headNodes[uuid];
                const fields = ['name', 'active', 'position', 'rotation', 'scale', 'components', 'childUuids']
                    .filter(field => JSON.stringify(before?.[field]) !== JSON.stringify(after?.[field]));
                const changes: Record<string, { before: any; after: any }> = {};
                for (const field of fields) {
                    changes[field] = { before: before?.[field], after: after?.[field] };
                }
                return { uuid, name: after?.name ?? before?.name ?? '', fields, changes };
            })
            .filter(change => change.fields.length > 0);

        return ok({
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

    @mcpTool({
        name: 'validate_json_params',
        title: 'Validate/repair JSON args',
        description: '[specialist] Validate and lightly repair a JSON argument string before calling another tool. No Cocos side effects; useful for diagnosing escaping or required-field errors.',
        inputSchema: z.object({
            jsonString: z.string().describe('JSON string to parse and lightly repair before a tool call. Handles common escaping, quote, and trailing-comma mistakes.'),
            expectedSchema: z.object({}).passthrough().optional().describe('Optional simple JSON schema; checks only basic type and required fields.'),
        }),
    })
    async validateJsonParams(args: { jsonString: string; expectedSchema?: any }): Promise<ToolResponse> {
        const { jsonString, expectedSchema } = args;
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

    @mcpTool({
        name: 'safe_string_value',
        title: 'Escape string for JSON',
        description: '[specialist] Escape a raw string for safe use inside JSON arguments. No Cocos side effects; useful for Label text or custom data containing quotes/newlines.',
        inputSchema: z.object({
            value: z.string().describe('Raw string that must be embedded safely inside JSON arguments.'),
        }),
    })
    async safeStringValue(args: { value: string }): Promise<ToolResponse> {
        const { value } = args;
        const safeValue = this.escapJsonString(value);
        return ok({
                originalValue: value,
                safeValue: safeValue,
                jsonReady: JSON.stringify(safeValue),
                usage: `Use "${safeValue}" in your JSON parameters`
            });
    }

    @mcpTool({
        name: 'format_mcp_request',
        title: 'Format MCP request',
        description: '[specialist] Format a complete MCP tools/call request and curl example. Formatting only; does not execute the target tool.',
        inputSchema: z.object({
            toolName: z.string().describe('MCP tool name to wrap, e.g. create_node or set_component_property.'),
            arguments: z.object({}).passthrough().describe('Arguments object for the target tool. This helper formats only; it does not execute the tool.'),
        }),
    })
    async formatMcpRequest(args: { toolName: string; arguments: any }): Promise<ToolResponse> {
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
