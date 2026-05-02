import { ToolDefinition, ToolResponse, ToolExecutor } from '../types';
import { z } from '../lib/schema';
import { defineTools, ToolDef } from '../lib/define-tools';

export class PreferencesTools implements ToolExecutor {
    private readonly exec: ToolExecutor;

    constructor() {
        const defs: ToolDef[] = [
            {
                name: 'open_preferences_settings',
                title: 'Open preferences settings',
                description: 'Open Cocos Preferences UI, optionally on a tab; UI side effect only.',
                inputSchema: z.object({
                    tab: z.enum(['general', 'external-tools', 'data-editor', 'laboratory', 'extensions']).optional().describe('Preferences tab to open. Omit for the default settings panel.'),
                    args: z.array(z.any()).optional().describe('Extra tab arguments; normally unnecessary.'),
                }),
                handler: a => this.openPreferencesSettings(a.tab, a.args),
            },
            {
                name: 'query_preferences_config',
                title: 'Read preferences config',
                description: 'Read a Preferences config category/path/type; query before setting values.',
                inputSchema: z.object({
                    name: z.string().default('general').describe('Preferences category or extension/plugin name. Default general.'),
                    path: z.string().optional().describe('Optional config path. Omit to read the whole category.'),
                    type: z.enum(['default', 'global', 'local']).default('global').describe('Config source: default, global, or project-local.'),
                }),
                handler: a => this.queryPreferencesConfig(a.name, a.path, a.type),
            },
            {
                name: 'set_preferences_config',
                title: 'Set preferences config',
                description: 'Write a Preferences config value; mutates Cocos global/local settings.',
                inputSchema: z.object({
                    name: z.string().describe('Preferences category or extension/plugin name to modify.'),
                    path: z.string().describe('Exact config path to modify. Query first if unsure.'),
                    value: z.any().describe('Value to write; must match the target preference field shape.'),
                    type: z.enum(['default', 'global', 'local']).default('global').describe('Write target. Prefer global or local; avoid default unless intentional.'),
                }),
                handler: a => this.setPreferencesConfig(a.name, a.path, a.value, a.type),
            },
            {
                name: 'get_all_preferences',
                title: 'Read all preferences',
                description: 'Read common Preferences categories; may not include every extension category.',
                inputSchema: z.object({}),
                handler: () => this.getAllPreferences(),
            },
            {
                name: 'reset_preferences',
                title: 'Reset preferences',
                description: 'Reset one Preferences category to defaults; all-category reset is unsupported.',
                inputSchema: z.object({
                    name: z.string().optional().describe('Single preference category to reset. Resetting all categories is not supported.'),
                    type: z.enum(['global', 'local']).default('global').describe('Config scope to reset. Default global.'),
                }),
                handler: a => this.resetPreferences(a.name, a.type),
            },
            {
                name: 'export_preferences',
                title: 'Export preferences',
                description: 'Return readable Preferences as JSON data; does not write a file.',
                inputSchema: z.object({
                    exportPath: z.string().optional().describe('Label for the returned export path. Current implementation returns JSON data only; it does not write a file.'),
                }),
                handler: a => this.exportPreferences(a.exportPath),
            },
            {
                name: 'import_preferences',
                title: 'Import preferences',
                description: 'Unsupported Preferences import placeholder; never modifies settings.',
                inputSchema: z.object({
                    importPath: z.string().describe('Preferences file path to import. Current implementation reports unsupported and does not modify settings.'),
                }),
                handler: a => this.importPreferences(a.importPath),
            },
        ];
        this.exec = defineTools(defs);
    }

    getTools(): ToolDefinition[] { return this.exec.getTools(); }
    execute(toolName: string, args: any): Promise<ToolResponse> { return this.exec.execute(toolName, args); }

    private async openPreferencesSettings(tab?: string, args?: any[]): Promise<ToolResponse> {
        return new Promise((resolve) => {
            const requestArgs = [];
            if (tab) {
                requestArgs.push(tab);
            }
            if (args && args.length > 0) {
                requestArgs.push(...args);
            }

            (Editor.Message.request as any)('preferences', 'open-settings', ...requestArgs).then(() => {
                resolve({
                    success: true,
                    message: `Preferences settings opened${tab ? ` on tab: ${tab}` : ''}`
                });
            }).catch((err: Error) => {
                resolve({ success: false, error: err.message });
            });
        });
    }

    private async queryPreferencesConfig(name: string, path?: string, type: string = 'global'): Promise<ToolResponse> {
        return new Promise((resolve) => {
            const requestArgs = [name];
            if (path) {
                requestArgs.push(path);
            }
            requestArgs.push(type);

            (Editor.Message.request as any)('preferences', 'query-config', ...requestArgs).then((config: any) => {
                resolve({
                    success: true,
                    data: {
                        name: name,
                        path: path,
                        type: type,
                        config: config
                    }
                });
            }).catch((err: Error) => {
                resolve({ success: false, error: err.message });
            });
        });
    }

    private async setPreferencesConfig(name: string, path: string, value: any, type: string = 'global'): Promise<ToolResponse> {
        return new Promise((resolve) => {
            (Editor.Message.request as any)('preferences', 'set-config', name, path, value, type).then((success: boolean) => {
                if (success) {
                    resolve({
                        success: true,
                        message: `Preference '${name}.${path}' updated successfully`
                    });
                } else {
                    resolve({
                        success: false,
                        error: `Failed to update preference '${name}.${path}'`
                    });
                }
            }).catch((err: Error) => {
                resolve({ success: false, error: err.message });
            });
        });
    }

    private async getAllPreferences(): Promise<ToolResponse> {
        return new Promise((resolve) => {
            // Common preference categories in Cocos Creator
            const categories = [
                'general',
                'external-tools', 
                'data-editor',
                'laboratory',
                'extensions',
                'preview',
                'console',
                'native',
                'builder'
            ];

            const preferences: any = {};

            const queryPromises = categories.map(category => {
                return Editor.Message.request('preferences', 'query-config', category, undefined, 'global')
                    .then((config: any) => {
                        preferences[category] = config;
                    })
                    .catch(() => {
                        // Ignore errors for categories that don't exist
                        preferences[category] = null;
                    });
            });

            Promise.all(queryPromises).then(() => {
                // Filter out null entries
                const validPreferences = Object.fromEntries(
                    Object.entries(preferences).filter(([_, value]) => value !== null)
                );

                resolve({
                    success: true,
                    data: {
                        categories: Object.keys(validPreferences),
                        preferences: validPreferences
                    }
                });
            }).catch((err: Error) => {
                resolve({ success: false, error: err.message });
            });
        });
    }

    private async resetPreferences(name?: string, type: string = 'global'): Promise<ToolResponse> {
        return new Promise((resolve) => {
            if (name) {
                // Reset specific preference category
                Editor.Message.request('preferences', 'query-config', name, undefined, 'default').then((defaultConfig: any) => {
                    return (Editor.Message.request as any)('preferences', 'set-config', name, '', defaultConfig, type);
                }).then((success: boolean) => {
                    if (success) {
                        resolve({
                            success: true,
                            message: `Preference category '${name}' reset to default`
                        });
                    } else {
                        resolve({
                            success: false,
                            error: `Failed to reset preference category '${name}'`
                        });
                    }
                }).catch((err: Error) => {
                    resolve({ success: false, error: err.message });
                });
            } else {
                resolve({
                    success: false,
                    error: 'Resetting all preferences is not supported through API. Please specify a preference category.'
                });
            }
        });
    }

    private async exportPreferences(exportPath?: string): Promise<ToolResponse> {
        return new Promise((resolve) => {
            this.getAllPreferences().then((prefsResult: ToolResponse) => {
                if (!prefsResult.success) {
                    resolve(prefsResult);
                    return;
                }

                const prefsData = JSON.stringify(prefsResult.data, null, 2);
                const path = exportPath || `preferences_export_${Date.now()}.json`;

                // For now, return the data - in a real implementation, you'd write to file
                resolve({
                    success: true,
                    data: {
                        exportPath: path,
                        preferences: prefsResult.data,
                        jsonData: prefsData,
                        message: 'Preferences exported successfully'
                    }
                });
            }).catch((err: Error) => {
                resolve({ success: false, error: err.message });
            });
        });
    }

    private async importPreferences(importPath: string): Promise<ToolResponse> {
        return new Promise((resolve) => {
            resolve({
                success: false,
                error: 'Import preferences functionality requires file system access which is not available in this context. Please manually import preferences through the Editor UI.'
            });
        });
    }
}
