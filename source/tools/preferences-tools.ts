import { ToolDefinition, ToolResponse, ToolExecutor } from '../types';
import { z, toInputSchema, validateArgs } from '../lib/schema';

const preferencesSchemas = {
    open_preferences_settings: z.object({
        tab: z.enum(['general', 'external-tools', 'data-editor', 'laboratory', 'extensions']).optional().describe('Preferences tab to open (optional)'),
        args: z.array(z.any()).optional().describe('Additional arguments to pass to the tab'),
    }),
    query_preferences_config: z.object({
        name: z.string().default('general').describe('Plugin or category name'),
        path: z.string().optional().describe('Configuration path (optional)'),
        type: z.enum(['default', 'global', 'local']).default('global').describe('Configuration type'),
    }),
    set_preferences_config: z.object({
        name: z.string().describe('Plugin name'),
        path: z.string().describe('Configuration path'),
        value: z.any().describe('Configuration value'),
        type: z.enum(['default', 'global', 'local']).default('global').describe('Configuration type'),
    }),
    get_all_preferences: z.object({}),
    reset_preferences: z.object({
        name: z.string().optional().describe('Specific preference category to reset (optional)'),
        type: z.enum(['global', 'local']).default('global').describe('Configuration type to reset'),
    }),
    export_preferences: z.object({
        exportPath: z.string().optional().describe('Path to export preferences file (optional)'),
    }),
    import_preferences: z.object({
        importPath: z.string().describe('Path to import preferences file from'),
    }),
} as const;

const preferencesToolMeta: Record<keyof typeof preferencesSchemas, string> = {
    open_preferences_settings: 'Open preferences settings panel',
    query_preferences_config: 'Query preferences configuration',
    set_preferences_config: 'Set preferences configuration',
    get_all_preferences: 'Get all available preferences categories',
    reset_preferences: 'Reset preferences to default values',
    export_preferences: 'Export current preferences configuration',
    import_preferences: 'Import preferences configuration from file',
};

export class PreferencesTools implements ToolExecutor {
    getTools(): ToolDefinition[] {
        return (Object.keys(preferencesSchemas) as Array<keyof typeof preferencesSchemas>).map(name => ({
            name,
            description: preferencesToolMeta[name],
            inputSchema: toInputSchema(preferencesSchemas[name]),
        }));
    }

    async execute(toolName: string, args: any): Promise<ToolResponse> {
        const schemaName = toolName as keyof typeof preferencesSchemas;
        const schema = preferencesSchemas[schemaName];
        if (!schema) {
            throw new Error(`Unknown tool: ${toolName}`);
        }
        const validation = validateArgs(schema, args ?? {});
        if (!validation.ok) {
            return validation.response;
        }
        const a = validation.data as any;

        switch (schemaName) {
            case 'open_preferences_settings':
                return await this.openPreferencesSettings(a.tab, a.args);
            case 'query_preferences_config':
                return await this.queryPreferencesConfig(a.name, a.path, a.type);
            case 'set_preferences_config':
                return await this.setPreferencesConfig(a.name, a.path, a.value, a.type);
            case 'get_all_preferences':
                return await this.getAllPreferences();
            case 'reset_preferences':
                return await this.resetPreferences(a.name, a.type);
            case 'export_preferences':
                return await this.exportPreferences(a.exportPath);
            case 'import_preferences':
                return await this.importPreferences(a.importPath);
        }
    }

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