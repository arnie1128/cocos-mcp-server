"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PreferencesTools = void 0;
const response_1 = require("../lib/response");
const schema_1 = require("../lib/schema");
const define_tools_1 = require("../lib/define-tools");
class PreferencesTools {
    constructor() {
        const defs = [
            {
                name: 'open_preferences_settings',
                title: 'Open preferences settings',
                description: 'Open Cocos Preferences UI, optionally on a tab; UI side effect only.',
                inputSchema: schema_1.z.object({
                    tab: schema_1.z.enum(['general', 'external-tools', 'data-editor', 'laboratory', 'extensions']).optional().describe('Preferences tab to open. Omit for the default settings panel.'),
                    args: schema_1.z.array(schema_1.z.any()).optional().describe('Extra tab arguments; normally unnecessary.'),
                }),
                handler: a => this.openPreferencesSettings(a.tab, a.args),
            },
            {
                name: 'query_preferences_config',
                title: 'Read preferences config',
                description: 'Read a Preferences config category/path/type; query before setting values.',
                inputSchema: schema_1.z.object({
                    name: schema_1.z.string().default('general').describe('Preferences category or extension/plugin name. Default general.'),
                    path: schema_1.z.string().optional().describe('Optional config path. Omit to read the whole category.'),
                    type: schema_1.z.enum(['default', 'global', 'local']).default('global').describe('Config source: default, global, or project-local.'),
                }),
                handler: a => this.queryPreferencesConfig(a.name, a.path, a.type),
            },
            {
                name: 'set_preferences_config',
                title: 'Set preferences config',
                description: 'Write a Preferences config value; mutates Cocos global/local settings.',
                inputSchema: schema_1.z.object({
                    name: schema_1.z.string().describe('Preferences category or extension/plugin name to modify.'),
                    path: schema_1.z.string().describe('Exact config path to modify. Query first if unsure.'),
                    value: schema_1.z.any().describe('Value to write; must match the target preference field shape.'),
                    type: schema_1.z.enum(['default', 'global', 'local']).default('global').describe('Write target. Prefer global or local; avoid default unless intentional.'),
                }),
                handler: a => this.setPreferencesConfig(a.name, a.path, a.value, a.type),
            },
            {
                name: 'get_all_preferences',
                title: 'Read all preferences',
                description: 'Read common Preferences categories; may not include every extension category.',
                inputSchema: schema_1.z.object({}),
                handler: () => this.getAllPreferences(),
            },
            {
                name: 'reset_preferences',
                title: 'Reset preferences',
                description: 'Reset one Preferences category to defaults; all-category reset is unsupported.',
                inputSchema: schema_1.z.object({
                    name: schema_1.z.string().optional().describe('Single preference category to reset. Resetting all categories is not supported.'),
                    type: schema_1.z.enum(['global', 'local']).default('global').describe('Config scope to reset. Default global.'),
                }),
                handler: a => this.resetPreferences(a.name, a.type),
            },
            {
                name: 'export_preferences',
                title: 'Export preferences',
                description: 'Return readable Preferences as JSON data; does not write a file.',
                inputSchema: schema_1.z.object({
                    exportPath: schema_1.z.string().optional().describe('Label for the returned export path. Current implementation returns JSON data only; it does not write a file.'),
                }),
                handler: a => this.exportPreferences(a.exportPath),
            },
            {
                name: 'import_preferences',
                title: 'Import preferences',
                description: 'Unsupported Preferences import placeholder; never modifies settings.',
                inputSchema: schema_1.z.object({
                    importPath: schema_1.z.string().describe('Preferences file path to import. Current implementation reports unsupported and does not modify settings.'),
                }),
                handler: a => this.importPreferences(a.importPath),
            },
        ];
        this.exec = (0, define_tools_1.defineTools)(defs);
    }
    getTools() { return this.exec.getTools(); }
    execute(toolName, args) { return this.exec.execute(toolName, args); }
    async openPreferencesSettings(tab, args) {
        return new Promise((resolve) => {
            const requestArgs = [];
            if (tab) {
                requestArgs.push(tab);
            }
            if (args && args.length > 0) {
                requestArgs.push(...args);
            }
            Editor.Message.request('preferences', 'open-settings', ...requestArgs).then(() => {
                resolve((0, response_1.ok)(undefined, `Preferences settings opened${tab ? ` on tab: ${tab}` : ''}`));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async queryPreferencesConfig(name, path, type = 'global') {
        return new Promise((resolve) => {
            const requestArgs = [name];
            if (path) {
                requestArgs.push(path);
            }
            requestArgs.push(type);
            Editor.Message.request('preferences', 'query-config', ...requestArgs).then((config) => {
                resolve((0, response_1.ok)({
                    name: name,
                    path: path,
                    type: type,
                    config: config
                }));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async setPreferencesConfig(name, path, value, type = 'global') {
        return new Promise((resolve) => {
            Editor.Message.request('preferences', 'set-config', name, path, value, type).then((success) => {
                if (success) {
                    resolve((0, response_1.ok)(undefined, `Preference '${name}.${path}' updated successfully`));
                }
                else {
                    resolve((0, response_1.fail)(`Failed to update preference '${name}.${path}'`));
                }
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async getAllPreferences() {
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
            const preferences = {};
            const queryPromises = categories.map(category => {
                return Editor.Message.request('preferences', 'query-config', category, undefined, 'global')
                    .then((config) => {
                    preferences[category] = config;
                })
                    .catch(() => {
                    // Ignore errors for categories that don't exist
                    preferences[category] = null;
                });
            });
            Promise.all(queryPromises).then(() => {
                // Filter out null entries
                const validPreferences = Object.fromEntries(Object.entries(preferences).filter(([_, value]) => value !== null));
                resolve((0, response_1.ok)({
                    categories: Object.keys(validPreferences),
                    preferences: validPreferences
                }));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async resetPreferences(name, type = 'global') {
        return new Promise((resolve) => {
            if (name) {
                // Reset specific preference category
                Editor.Message.request('preferences', 'query-config', name, undefined, 'default').then((defaultConfig) => {
                    return Editor.Message.request('preferences', 'set-config', name, '', defaultConfig, type);
                }).then((success) => {
                    if (success) {
                        resolve((0, response_1.ok)(undefined, `Preference category '${name}' reset to default`));
                    }
                    else {
                        resolve((0, response_1.fail)(`Failed to reset preference category '${name}'`));
                    }
                }).catch((err) => {
                    resolve((0, response_1.fail)(err.message));
                });
            }
            else {
                resolve((0, response_1.fail)('Resetting all preferences is not supported through API. Please specify a preference category.'));
            }
        });
    }
    async exportPreferences(exportPath) {
        return new Promise((resolve) => {
            this.getAllPreferences().then((prefsResult) => {
                if (!prefsResult.success) {
                    resolve(prefsResult);
                    return;
                }
                const prefsData = JSON.stringify(prefsResult.data, null, 2);
                const path = exportPath || `preferences_export_${Date.now()}.json`;
                // For now, return the data - in a real implementation, you'd write to file
                resolve((0, response_1.ok)({
                    exportPath: path,
                    preferences: prefsResult.data,
                    jsonData: prefsData,
                    message: 'Preferences exported successfully'
                }));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async importPreferences(importPath) {
        return new Promise((resolve) => {
            resolve((0, response_1.fail)('Import preferences functionality requires file system access which is not available in this context. Please manually import preferences through the Editor UI.'));
        });
    }
}
exports.PreferencesTools = PreferencesTools;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJlZmVyZW5jZXMtdG9vbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvdG9vbHMvcHJlZmVyZW5jZXMtdG9vbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsOENBQTJDO0FBRTNDLDBDQUFrQztBQUNsQyxzREFBMkQ7QUFFM0QsTUFBYSxnQkFBZ0I7SUFHekI7UUFDSSxNQUFNLElBQUksR0FBYztZQUNwQjtnQkFDSSxJQUFJLEVBQUUsMkJBQTJCO2dCQUNqQyxLQUFLLEVBQUUsMkJBQTJCO2dCQUNsQyxXQUFXLEVBQUUsc0VBQXNFO2dCQUNuRixXQUFXLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQztvQkFDbEIsR0FBRyxFQUFFLFVBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxTQUFTLEVBQUUsZ0JBQWdCLEVBQUUsYUFBYSxFQUFFLFlBQVksRUFBRSxZQUFZLENBQUMsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDLFFBQVEsQ0FBQywrREFBK0QsQ0FBQztvQkFDMUssSUFBSSxFQUFFLFVBQUMsQ0FBQyxLQUFLLENBQUMsVUFBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUMsUUFBUSxDQUFDLDRDQUE0QyxDQUFDO2lCQUMzRixDQUFDO2dCQUNGLE9BQU8sRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUM7YUFDNUQ7WUFDRDtnQkFDSSxJQUFJLEVBQUUsMEJBQTBCO2dCQUNoQyxLQUFLLEVBQUUseUJBQXlCO2dCQUNoQyxXQUFXLEVBQUUsNEVBQTRFO2dCQUN6RixXQUFXLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQztvQkFDbEIsSUFBSSxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUMsUUFBUSxDQUFDLGlFQUFpRSxDQUFDO29C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QUFDO1FBQ3BMLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztDQUNKO0FBbk9ELDRDQW1PQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IG9rLCBmYWlsIH0gZnJvbSAnLi4vbGliL3Jlc3BvbnNlJztcbmltcG9ydCB7IFRvb2xEZWZpbml0aW9uLCBUb29sUmVzcG9uc2UsIFRvb2xFeGVjdXRvciB9IGZyb20gJy4uL3R5cGVzJztcbmltcG9ydCB7IHogfSBmcm9tICcuLi9saWIvc2NoZW1hJztcbmltcG9ydCB7IGRlZmluZVRvb2xzLCBUb29sRGVmIH0gZnJvbSAnLi4vbGliL2RlZmluZS10b29scyc7XG5cbmV4cG9ydCBjbGFzcyBQcmVmZXJlbmNlc1Rvb2xzIGltcGxlbWVudHMgVG9vbEV4ZWN1dG9yIHtcbiAgICBwcml2YXRlIHJlYWRvbmx5IGV4ZWM6IFRvb2xFeGVjdXRvcjtcblxuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICBjb25zdCBkZWZzOiBUb29sRGVmW10gPSBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ29wZW5fcHJlZmVyZW5jZXNfc2V0dGluZ3MnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnT3BlbiBwcmVmZXJlbmNlcyBzZXR0aW5ncycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdPcGVuIENvY29zIFByZWZlcmVuY2VzIFVJLCBvcHRpb25hbGx5IG9uIGEgdGFiOyBVSSBzaWRlIGVmZmVjdCBvbmx5LicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgdGFiOiB6LmVudW0oWydnZW5lcmFsJywgJ2V4dGVybmFsLXRvb2xzJywgJ2RhdGEtZWRpdG9yJywgJ2xhYm9yYXRvcnknLCAnZXh0ZW5zaW9ucyddKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdQcmVmZXJlbmNlcyB0YWIgdG8gb3Blbi4gT21pdCBmb3IgdGhlIGRlZmF1bHQgc2V0dGluZ3MgcGFuZWwuJyksXG4gICAgICAgICAgICAgICAgICAgIGFyZ3M6IHouYXJyYXkoei5hbnkoKSkub3B0aW9uYWwoKS5kZXNjcmliZSgnRXh0cmEgdGFiIGFyZ3VtZW50czsgbm9ybWFsbHkgdW5uZWNlc3NhcnkuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLm9wZW5QcmVmZXJlbmNlc1NldHRpbmdzKGEudGFiLCBhLmFyZ3MpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAncXVlcnlfcHJlZmVyZW5jZXNfY29uZmlnJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1JlYWQgcHJlZmVyZW5jZXMgY29uZmlnJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1JlYWQgYSBQcmVmZXJlbmNlcyBjb25maWcgY2F0ZWdvcnkvcGF0aC90eXBlOyBxdWVyeSBiZWZvcmUgc2V0dGluZyB2YWx1ZXMuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBuYW1lOiB6LnN0cmluZygpLmRlZmF1bHQoJ2dlbmVyYWwnKS5kZXNjcmliZSgnUHJlZmVyZW5jZXMgY2F0ZWdvcnkgb3IgZXh0ZW5zaW9uL3BsdWdpbiBuYW1lLiBEZWZhdWx0IGdlbmVyYWwuJyksXG4gICAgICAgICAgICAgICAgICAgIHBhdGg6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnT3B0aW9uYWwgY29uZmlnIHBhdGguIE9taXQgdG8gcmVhZCB0aGUgd2hvbGUgY2F0ZWdvcnkuJyksXG4gICAgICAgICAgICAgICAgICAgIHR5cGU6IHouZW51bShbJ2RlZmF1bHQnLCAnZ2xvYmFsJywgJ2xvY2FsJ10pLmRlZmF1bHQoJ2dsb2JhbCcpLmRlc2NyaWJlKCdDb25maWcgc291cmNlOiBkZWZhdWx0LCBnbG9iYWwsIG9yIHByb2plY3QtbG9jYWwuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLnF1ZXJ5UHJlZmVyZW5jZXNDb25maWcoYS5uYW1lLCBhLnBhdGgsIGEudHlwZSksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdzZXRfcHJlZmVyZW5jZXNfY29uZmlnJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1NldCBwcmVmZXJlbmNlcyBjb25maWcnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnV3JpdGUgYSBQcmVmZXJlbmNlcyBjb25maWcgdmFsdWU7IG11dGF0ZXMgQ29jb3MgZ2xvYmFsL2xvY2FsIHNldHRpbmdzLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgbmFtZTogei5zdHJpbmcoKS5kZXNjcmliZSgnUHJlZmVyZW5jZXMgY2F0ZWdvcnkgb3IgZXh0ZW5zaW9uL3BsdWdpbiBuYW1lIHRvIG1vZGlmeS4nKSxcbiAgICAgICAgICAgICAgICAgICAgcGF0aDogei5zdHJpbmcoKS5kZXNjcmliZSgnRXhhY3QgY29uZmlnIHBhdGggdG8gbW9kaWZ5LiBRdWVyeSBmaXJzdCBpZiB1bnN1cmUuJyksXG4gICAgICAgICAgICAgICAgICAgIHZhbHVlOiB6LmFueSgpLmRlc2NyaWJlKCdWYWx1ZSB0byB3cml0ZTsgbXVzdCBtYXRjaCB0aGUgdGFyZ2V0IHByZWZlcmVuY2UgZmllbGQgc2hhcGUuJyksXG4gICAgICAgICAgICAgICAgICAgIHR5cGU6IHouZW51bShbJ2RlZmF1bHQnLCAnZ2xvYmFsJywgJ2xvY2FsJ10pLmRlZmF1bHQoJ2dsb2JhbCcpLmRlc2NyaWJlKCdXcml0ZSB0YXJnZXQuIFByZWZlciBnbG9iYWwgb3IgbG9jYWw7IGF2b2lkIGRlZmF1bHQgdW5sZXNzIGludGVudGlvbmFsLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy5zZXRQcmVmZXJlbmNlc0NvbmZpZyhhLm5hbWUsIGEucGF0aCwgYS52YWx1ZSwgYS50eXBlKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2dldF9hbGxfcHJlZmVyZW5jZXMnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnUmVhZCBhbGwgcHJlZmVyZW5jZXMnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnUmVhZCBjb21tb24gUHJlZmVyZW5jZXMgY2F0ZWdvcmllczsgbWF5IG5vdCBpbmNsdWRlIGV2ZXJ5IGV4dGVuc2lvbiBjYXRlZ29yeS4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogKCkgPT4gdGhpcy5nZXRBbGxQcmVmZXJlbmNlcygpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAncmVzZXRfcHJlZmVyZW5jZXMnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnUmVzZXQgcHJlZmVyZW5jZXMnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnUmVzZXQgb25lIFByZWZlcmVuY2VzIGNhdGVnb3J5IHRvIGRlZmF1bHRzOyBhbGwtY2F0ZWdvcnkgcmVzZXQgaXMgdW5zdXBwb3J0ZWQuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBuYW1lOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1NpbmdsZSBwcmVmZXJlbmNlIGNhdGVnb3J5IHRvIHJlc2V0LiBSZXNldHRpbmcgYWxsIGNhdGVnb3JpZXMgaXMgbm90IHN1cHBvcnRlZC4nKSxcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogei5lbnVtKFsnZ2xvYmFsJywgJ2xvY2FsJ10pLmRlZmF1bHQoJ2dsb2JhbCcpLmRlc2NyaWJlKCdDb25maWcgc2NvcGUgdG8gcmVzZXQuIERlZmF1bHQgZ2xvYmFsLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy5yZXNldFByZWZlcmVuY2VzKGEubmFtZSwgYS50eXBlKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2V4cG9ydF9wcmVmZXJlbmNlcycsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdFeHBvcnQgcHJlZmVyZW5jZXMnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnUmV0dXJuIHJlYWRhYmxlIFByZWZlcmVuY2VzIGFzIEpTT04gZGF0YTsgZG9lcyBub3Qgd3JpdGUgYSBmaWxlLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgZXhwb3J0UGF0aDogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdMYWJlbCBmb3IgdGhlIHJldHVybmVkIGV4cG9ydCBwYXRoLiBDdXJyZW50IGltcGxlbWVudGF0aW9uIHJldHVybnMgSlNPTiBkYXRhIG9ubHk7IGl0IGRvZXMgbm90IHdyaXRlIGEgZmlsZS4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMuZXhwb3J0UHJlZmVyZW5jZXMoYS5leHBvcnRQYXRoKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2ltcG9ydF9wcmVmZXJlbmNlcycsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdJbXBvcnQgcHJlZmVyZW5jZXMnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnVW5zdXBwb3J0ZWQgUHJlZmVyZW5jZXMgaW1wb3J0IHBsYWNlaG9sZGVyOyBuZXZlciBtb2RpZmllcyBzZXR0aW5ncy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIGltcG9ydFBhdGg6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1ByZWZlcmVuY2VzIGZpbGUgcGF0aCB0byBpbXBvcnQuIEN1cnJlbnQgaW1wbGVtZW50YXRpb24gcmVwb3J0cyB1bnN1cHBvcnRlZCBhbmQgZG9lcyBub3QgbW9kaWZ5IHNldHRpbmdzLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy5pbXBvcnRQcmVmZXJlbmNlcyhhLmltcG9ydFBhdGgpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgXTtcbiAgICAgICAgdGhpcy5leGVjID0gZGVmaW5lVG9vbHMoZGVmcyk7XG4gICAgfVxuXG4gICAgZ2V0VG9vbHMoKTogVG9vbERlZmluaXRpb25bXSB7IHJldHVybiB0aGlzLmV4ZWMuZ2V0VG9vbHMoKTsgfVxuICAgIGV4ZWN1dGUodG9vbE5hbWU6IHN0cmluZywgYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHsgcmV0dXJuIHRoaXMuZXhlYy5leGVjdXRlKHRvb2xOYW1lLCBhcmdzKTsgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBvcGVuUHJlZmVyZW5jZXNTZXR0aW5ncyh0YWI/OiBzdHJpbmcsIGFyZ3M/OiBhbnlbXSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgcmVxdWVzdEFyZ3MgPSBbXTtcbiAgICAgICAgICAgIGlmICh0YWIpIHtcbiAgICAgICAgICAgICAgICByZXF1ZXN0QXJncy5wdXNoKHRhYik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoYXJncyAmJiBhcmdzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICByZXF1ZXN0QXJncy5wdXNoKC4uLmFyZ3MpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAoRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCBhcyBhbnkpKCdwcmVmZXJlbmNlcycsICdvcGVuLXNldHRpbmdzJywgLi4ucmVxdWVzdEFyZ3MpLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2sodW5kZWZpbmVkLCBgUHJlZmVyZW5jZXMgc2V0dGluZ3Mgb3BlbmVkJHt0YWIgPyBgIG9uIHRhYjogJHt0YWJ9YCA6ICcnfWApKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBxdWVyeVByZWZlcmVuY2VzQ29uZmlnKG5hbWU6IHN0cmluZywgcGF0aD86IHN0cmluZywgdHlwZTogc3RyaW5nID0gJ2dsb2JhbCcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHJlcXVlc3RBcmdzID0gW25hbWVdO1xuICAgICAgICAgICAgaWYgKHBhdGgpIHtcbiAgICAgICAgICAgICAgICByZXF1ZXN0QXJncy5wdXNoKHBhdGgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmVxdWVzdEFyZ3MucHVzaCh0eXBlKTtcblxuICAgICAgICAgICAgKEVkaXRvci5NZXNzYWdlLnJlcXVlc3QgYXMgYW55KSgncHJlZmVyZW5jZXMnLCAncXVlcnktY29uZmlnJywgLi4ucmVxdWVzdEFyZ3MpLnRoZW4oKGNvbmZpZzogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICBuYW1lOiBuYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgcGF0aDogcGF0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6IHR5cGUsXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25maWc6IGNvbmZpZ1xuICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgc2V0UHJlZmVyZW5jZXNDb25maWcobmFtZTogc3RyaW5nLCBwYXRoOiBzdHJpbmcsIHZhbHVlOiBhbnksIHR5cGU6IHN0cmluZyA9ICdnbG9iYWwnKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICAoRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCBhcyBhbnkpKCdwcmVmZXJlbmNlcycsICdzZXQtY29uZmlnJywgbmFtZSwgcGF0aCwgdmFsdWUsIHR5cGUpLnRoZW4oKHN1Y2Nlc3M6IGJvb2xlYW4pID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoc3VjY2Vzcykge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHVuZGVmaW5lZCwgYFByZWZlcmVuY2UgJyR7bmFtZX0uJHtwYXRofScgdXBkYXRlZCBzdWNjZXNzZnVsbHlgKSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGBGYWlsZWQgdG8gdXBkYXRlIHByZWZlcmVuY2UgJyR7bmFtZX0uJHtwYXRofSdgKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldEFsbFByZWZlcmVuY2VzKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgLy8gQ29tbW9uIHByZWZlcmVuY2UgY2F0ZWdvcmllcyBpbiBDb2NvcyBDcmVhdG9yXG4gICAgICAgICAgICBjb25zdCBjYXRlZ29yaWVzID0gW1xuICAgICAgICAgICAgICAgICdnZW5lcmFsJyxcbiAgICAgICAgICAgICAgICAnZXh0ZXJuYWwtdG9vbHMnLCBcbiAgICAgICAgICAgICAgICAnZGF0YS1lZGl0b3InLFxuICAgICAgICAgICAgICAgICdsYWJvcmF0b3J5JyxcbiAgICAgICAgICAgICAgICAnZXh0ZW5zaW9ucycsXG4gICAgICAgICAgICAgICAgJ3ByZXZpZXcnLFxuICAgICAgICAgICAgICAgICdjb25zb2xlJyxcbiAgICAgICAgICAgICAgICAnbmF0aXZlJyxcbiAgICAgICAgICAgICAgICAnYnVpbGRlcidcbiAgICAgICAgICAgIF07XG5cbiAgICAgICAgICAgIGNvbnN0IHByZWZlcmVuY2VzOiBhbnkgPSB7fTtcblxuICAgICAgICAgICAgY29uc3QgcXVlcnlQcm9taXNlcyA9IGNhdGVnb3JpZXMubWFwKGNhdGVnb3J5ID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgncHJlZmVyZW5jZXMnLCAncXVlcnktY29uZmlnJywgY2F0ZWdvcnksIHVuZGVmaW5lZCwgJ2dsb2JhbCcpXG4gICAgICAgICAgICAgICAgICAgIC50aGVuKChjb25maWc6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgcHJlZmVyZW5jZXNbY2F0ZWdvcnldID0gY29uZmlnO1xuICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICAuY2F0Y2goKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gSWdub3JlIGVycm9ycyBmb3IgY2F0ZWdvcmllcyB0aGF0IGRvbid0IGV4aXN0XG4gICAgICAgICAgICAgICAgICAgICAgICBwcmVmZXJlbmNlc1tjYXRlZ29yeV0gPSBudWxsO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBQcm9taXNlLmFsbChxdWVyeVByb21pc2VzKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICAvLyBGaWx0ZXIgb3V0IG51bGwgZW50cmllc1xuICAgICAgICAgICAgICAgIGNvbnN0IHZhbGlkUHJlZmVyZW5jZXMgPSBPYmplY3QuZnJvbUVudHJpZXMoXG4gICAgICAgICAgICAgICAgICAgIE9iamVjdC5lbnRyaWVzKHByZWZlcmVuY2VzKS5maWx0ZXIoKFtfLCB2YWx1ZV0pID0+IHZhbHVlICE9PSBudWxsKVxuICAgICAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhdGVnb3JpZXM6IE9iamVjdC5rZXlzKHZhbGlkUHJlZmVyZW5jZXMpLFxuICAgICAgICAgICAgICAgICAgICAgICAgcHJlZmVyZW5jZXM6IHZhbGlkUHJlZmVyZW5jZXNcbiAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHJlc2V0UHJlZmVyZW5jZXMobmFtZT86IHN0cmluZywgdHlwZTogc3RyaW5nID0gJ2dsb2JhbCcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIGlmIChuYW1lKSB7XG4gICAgICAgICAgICAgICAgLy8gUmVzZXQgc3BlY2lmaWMgcHJlZmVyZW5jZSBjYXRlZ29yeVxuICAgICAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3ByZWZlcmVuY2VzJywgJ3F1ZXJ5LWNvbmZpZycsIG5hbWUsIHVuZGVmaW5lZCwgJ2RlZmF1bHQnKS50aGVuKChkZWZhdWx0Q29uZmlnOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIChFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0IGFzIGFueSkoJ3ByZWZlcmVuY2VzJywgJ3NldC1jb25maWcnLCBuYW1lLCAnJywgZGVmYXVsdENvbmZpZywgdHlwZSk7XG4gICAgICAgICAgICAgICAgfSkudGhlbigoc3VjY2VzczogYm9vbGVhbikgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAoc3VjY2Vzcykge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShvayh1bmRlZmluZWQsIGBQcmVmZXJlbmNlIGNhdGVnb3J5ICcke25hbWV9JyByZXNldCB0byBkZWZhdWx0YCkpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGBGYWlsZWQgdG8gcmVzZXQgcHJlZmVyZW5jZSBjYXRlZ29yeSAnJHtuYW1lfSdgKSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKCdSZXNldHRpbmcgYWxsIHByZWZlcmVuY2VzIGlzIG5vdCBzdXBwb3J0ZWQgdGhyb3VnaCBBUEkuIFBsZWFzZSBzcGVjaWZ5IGEgcHJlZmVyZW5jZSBjYXRlZ29yeS4nKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZXhwb3J0UHJlZmVyZW5jZXMoZXhwb3J0UGF0aD86IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgdGhpcy5nZXRBbGxQcmVmZXJlbmNlcygpLnRoZW4oKHByZWZzUmVzdWx0OiBUb29sUmVzcG9uc2UpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoIXByZWZzUmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShwcmVmc1Jlc3VsdCk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBjb25zdCBwcmVmc0RhdGEgPSBKU09OLnN0cmluZ2lmeShwcmVmc1Jlc3VsdC5kYXRhLCBudWxsLCAyKTtcbiAgICAgICAgICAgICAgICBjb25zdCBwYXRoID0gZXhwb3J0UGF0aCB8fCBgcHJlZmVyZW5jZXNfZXhwb3J0XyR7RGF0ZS5ub3coKX0uanNvbmA7XG5cbiAgICAgICAgICAgICAgICAvLyBGb3Igbm93LCByZXR1cm4gdGhlIGRhdGEgLSBpbiBhIHJlYWwgaW1wbGVtZW50YXRpb24sIHlvdSdkIHdyaXRlIHRvIGZpbGVcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGV4cG9ydFBhdGg6IHBhdGgsXG4gICAgICAgICAgICAgICAgICAgICAgICBwcmVmZXJlbmNlczogcHJlZnNSZXN1bHQuZGF0YSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGpzb25EYXRhOiBwcmVmc0RhdGEsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiAnUHJlZmVyZW5jZXMgZXhwb3J0ZWQgc3VjY2Vzc2Z1bGx5J1xuICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgaW1wb3J0UHJlZmVyZW5jZXMoaW1wb3J0UGF0aDogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICByZXNvbHZlKGZhaWwoJ0ltcG9ydCBwcmVmZXJlbmNlcyBmdW5jdGlvbmFsaXR5IHJlcXVpcmVzIGZpbGUgc3lzdGVtIGFjY2VzcyB3aGljaCBpcyBub3QgYXZhaWxhYmxlIGluIHRoaXMgY29udGV4dC4gUGxlYXNlIG1hbnVhbGx5IGltcG9ydCBwcmVmZXJlbmNlcyB0aHJvdWdoIHRoZSBFZGl0b3IgVUkuJykpO1xuICAgICAgICB9KTtcbiAgICB9XG59XG4iXX0=