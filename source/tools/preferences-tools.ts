import { ok, fail } from '../lib/response';
import { ToolDefinition, ToolResponse, ToolExecutor } from '../types';
import { z } from '../lib/schema';
import { defineTools, ToolDef } from '../lib/define-tools';

// v2.10.4 #8 (RomaRogov macro-tool enum routing): collapse 7 flat
// preferences tools into a single `preferences_manage({op, ...})` macro
// tool. Reasons:
//   - Token cost: 7 separate tool schemas vs 1 union saves bandwidth on
//     every tools/list response.
//   - Coherence: all ops share the same domain (cocos preferences IPC)
//     and dispatch to the same Editor.Message channel; flat collapse
//     keeps the dispatch trivial.
//   - LLM ergonomics: a single tool with `op` enum is easier for AI to
//     pick than 7 near-identically-named flat tools.
//
// Schema shape: flat optional fields per op (NOT z.discriminatedUnion).
// discriminatedUnion compiles to JSON Schema 7 `oneOf` with per-branch
// required arrays — gemini-compat works in zod 4 / draft-7 (landmine
// #15), but the flat schema is simpler for every LLM tool-call parser
// and matches the v2.9.3 referenceImage_manage precedent.
//
// Backward compatibility: this is a BREAKING change for callers that
// addressed individual `preferences_<verb>` tool names. We
// intentionally don't ship compat aliases — that would defeat the
// token-cost reduction. v2.10.x is the migration window.

type PreferencesOp =
    | 'open_settings'
    | 'query_config'
    | 'set_config'
    | 'get_all'
    | 'reset'
    | 'export'
    | 'import';

interface ManageArgs {
    op: PreferencesOp;
    name?: string;
    path?: string;
    value?: any;
    type?: 'default' | 'global' | 'local';
    tab?: 'general' | 'external-tools' | 'data-editor' | 'laboratory' | 'extensions';
    args?: any[];
    importPath?: string;
    exportPath?: string;
}

export class PreferencesTools implements ToolExecutor {
    private readonly exec: ToolExecutor;

    constructor() {
        const defs: ToolDef[] = [
            {
                name: 'manage',
                title: 'Manage preferences',
                description: '[specialist] Macro tool for cocos editor preferences. op routes to: open_settings (UI), query_config / set_config (read/write a path), get_all (dump common categories), reset (single category to defaults), export (return JSON), import (unsupported placeholder).',
                inputSchema: z.object({
                    op: z.enum([
                        'open_settings',
                        'query_config',
                        'set_config',
                        'get_all',
                        'reset',
                        'export',
                        'import',
                    ]).describe('Action to perform. open_settings shows UI; query_config/set_config read/write one path; get_all dumps common categories; reset restores one category to defaults; export returns JSON; import is unsupported.'),
                    name: z.string().optional().describe('Preferences category or extension name. Required by query_config (default "general"), set_config, reset (single-category only).'),
                    path: z.string().optional().describe('Config path within the category. Optional for query_config (omit to read whole category); required for set_config.'),
                    value: z.any().optional().describe('Value to write. Required for set_config; must match the target preference field shape.'),
                    type: z.enum(['default', 'global', 'local']).optional().describe('Config source/scope. query_config defaults to "global"; set_config defaults to "global"; reset accepts global/local.'),
                    tab: z.enum(['general', 'external-tools', 'data-editor', 'laboratory', 'extensions']).optional().describe('Used only by op="open_settings" to land on a specific tab.'),
                    args: z.array(z.any()).optional().describe('Used only by op="open_settings" for extra tab arguments; normally unnecessary.'),
                    importPath: z.string().optional().describe('Used only by op="import"; current implementation reports unsupported and does not modify settings.'),
                    exportPath: z.string().optional().describe('Used only by op="export" as label for the returned export path. Does not write a file.'),
                }),
                handler: a => this.manage(a as ManageArgs),
            },
        ];
        this.exec = defineTools(defs);
    }

    getTools(): ToolDefinition[] { return this.exec.getTools(); }
    execute(toolName: string, args: any): Promise<ToolResponse> { return this.exec.execute(toolName, args); }

    private async manage(a: ManageArgs): Promise<ToolResponse> {
        switch (a.op) {
            case 'open_settings':
                return this.openSettings(a.tab, a.args);
            case 'query_config':
                return this.queryConfig(a.name ?? 'general', a.path, a.type ?? 'global');
            case 'set_config':
                if (!a.name || !a.path) {
                    return fail('preferences_manage(set_config): name and path are required');
                }
                return this.setConfig(a.name, a.path, a.value, a.type ?? 'global');
            case 'get_all':
                return this.getAll();
            case 'reset':
                return this.reset(a.name, a.type === 'default' ? 'global' : (a.type ?? 'global'));
            case 'export':
                return this.exportPrefs(a.exportPath);
            case 'import':
                return this.importPrefs(a.importPath ?? '');
            default:
                return fail(`preferences_manage: unknown op "${(a as any).op}". Allowed: open_settings, query_config, set_config, get_all, reset, export, import.`);
        }
    }

    private async openSettings(tab?: string, args?: any[]): Promise<ToolResponse> {
        return new Promise((resolve) => {
            const requestArgs: any[] = [];
            if (tab) requestArgs.push(tab);
            if (args && args.length > 0) requestArgs.push(...args);
            (Editor.Message.request as any)('preferences', 'open-settings', ...requestArgs).then(() => {
                resolve(ok(undefined, `Preferences settings opened${tab ? ` on tab: ${tab}` : ''}`));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async queryConfig(name: string, path: string | undefined, type: string): Promise<ToolResponse> {
        return new Promise((resolve) => {
            const requestArgs: any[] = [name];
            if (path) requestArgs.push(path);
            requestArgs.push(type);
            (Editor.Message.request as any)('preferences', 'query-config', ...requestArgs).then((config: any) => {
                resolve(ok({ name, path, type, config }));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async setConfig(name: string, path: string, value: any, type: string): Promise<ToolResponse> {
        return new Promise((resolve) => {
            (Editor.Message.request as any)('preferences', 'set-config', name, path, value, type).then((success: boolean) => {
                if (success) resolve(ok(undefined, `Preference '${name}.${path}' updated successfully`));
                else resolve(fail(`Failed to update preference '${name}.${path}'`));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async getAll(): Promise<ToolResponse> {
        return new Promise((resolve) => {
            const categories = [
                'general', 'external-tools', 'data-editor', 'laboratory',
                'extensions', 'preview', 'console', 'native', 'builder',
            ];
            const preferences: any = {};
            const queryPromises = categories.map(category => {
                return Editor.Message.request('preferences', 'query-config', category, undefined, 'global')
                    .then((config: any) => { preferences[category] = config; })
                    .catch(() => { preferences[category] = null; });
            });
            Promise.all(queryPromises).then(() => {
                const validPreferences = Object.fromEntries(
                    Object.entries(preferences).filter(([_, value]) => value !== null),
                );
                resolve(ok({
                    categories: Object.keys(validPreferences),
                    preferences: validPreferences,
                }));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async reset(name: string | undefined, type: 'global' | 'local'): Promise<ToolResponse> {
        if (!name) {
            return fail('preferences_manage(reset): single-category reset requires `name`. Resetting all categories is not supported.');
        }
        return new Promise((resolve) => {
            Editor.Message.request('preferences', 'query-config', name, undefined, 'default').then((defaultConfig: any) => {
                return (Editor.Message.request as any)('preferences', 'set-config', name, '', defaultConfig, type);
            }).then((success: boolean) => {
                if (success) resolve(ok(undefined, `Preference category '${name}' reset to default`));
                else resolve(fail(`Failed to reset preference category '${name}'`));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async exportPrefs(exportPath?: string): Promise<ToolResponse> {
        const prefsResult = await this.getAll();
        if (!prefsResult.success) return prefsResult;
        const prefsData = JSON.stringify(prefsResult.data, null, 2);
        const path = exportPath || `preferences_export_${Date.now()}.json`;
        return ok({
            exportPath: path,
            preferences: prefsResult.data,
            jsonData: prefsData,
            message: 'Preferences exported successfully',
        });
    }

    private async importPrefs(_importPath: string): Promise<ToolResponse> {
        return fail('preferences_manage(import) is unsupported in this build — file-system import is not available in this context. Use the Editor UI to import preferences manually.');
    }
}
