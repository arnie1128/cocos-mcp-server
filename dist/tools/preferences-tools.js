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
                description: '[specialist] Open Cocos Preferences UI, optionally on a tab; UI side effect only.',
                inputSchema: schema_1.z.object({
                    tab: schema_1.z.enum(['general', 'external-tools', 'data-editor', 'laboratory', 'extensions']).optional().describe('Preferences tab to open. Omit for the default settings panel.'),
                    args: schema_1.z.array(schema_1.z.any()).optional().describe('Extra tab arguments; normally unnecessary.'),
                }),
                handler: a => this.openPreferencesSettings(a.tab, a.args),
            },
            {
                name: 'query_preferences_config',
                title: 'Read preferences config',
                description: '[specialist] Read a Preferences config category/path/type; query before setting values.',
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
                description: '[specialist] Write a Preferences config value; mutates Cocos global/local settings.',
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
                description: '[specialist] Read common Preferences categories; may not include every extension category.',
                inputSchema: schema_1.z.object({}),
                handler: () => this.getAllPreferences(),
            },
            {
                name: 'reset_preferences',
                title: 'Reset preferences',
                description: '[specialist] Reset one Preferences category to defaults; all-category reset is unsupported.',
                inputSchema: schema_1.z.object({
                    name: schema_1.z.string().optional().describe('Single preference category to reset. Resetting all categories is not supported.'),
                    type: schema_1.z.enum(['global', 'local']).default('global').describe('Config scope to reset. Default global.'),
                }),
                handler: a => this.resetPreferences(a.name, a.type),
            },
            {
                name: 'export_preferences',
                title: 'Export preferences',
                description: '[specialist] Return readable Preferences as JSON data; does not write a file.',
                inputSchema: schema_1.z.object({
                    exportPath: schema_1.z.string().optional().describe('Label for the returned export path. Current implementation returns JSON data only; it does not write a file.'),
                }),
                handler: a => this.exportPreferences(a.exportPath),
            },
            {
                name: 'import_preferences',
                title: 'Import preferences',
                description: '[specialist] Unsupported Preferences import placeholder; never modifies settings.',
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJlZmVyZW5jZXMtdG9vbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvdG9vbHMvcHJlZmVyZW5jZXMtdG9vbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsOENBQTJDO0FBRTNDLDBDQUFrQztBQUNsQyxzREFBMkQ7QUFFM0QsTUFBYSxnQkFBZ0I7SUFHekI7UUFDSSxNQUFNLElBQUksR0FBYztZQUNwQjtnQkFDSSxJQUFJLEVBQUUsMkJBQTJCO2dCQUNqQyxLQUFLLEVBQUUsMkJBQTJCO2dCQUNsQyxXQUFXLEVBQUUsbUZBQW1GO2dCQUNoRyxXQUFXLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQztvQkFDbEIsR0FBRyxFQUFFLFVBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxTQUFTLEVBQUUsZ0JBQWdCLEVBQUUsYUFBYSxFQUFFLFlBQVksRUFBRSxZQUFZLENBQUMsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDLFFBQVEsQ0FBQywrREFBK0QsQ0FBQztvQkFDMUssSUFBSSxFQUFFLFVBQUMsQ0FBQyxLQUFLLENBQUMsVUFBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUMsUUFBUSxDQUFDLDRDQUE0QyxDQUFDO2lCQUMzRixDQUFDO2dCQUNGLE9BQU8sRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUM7YUFDNUQ7WUFDRDtnQkFDSSxJQUFJLEVBQUUsMEJBQTBCO2dCQUNoQyxLQUFLLEVBQUUseUJBQXlCO2dCQUNoQyxXQUFXLEVBQUUseUZBQXlGO2dCQUN0RyxXQUFXLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQztvQkFDbEIsSUFBSSxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUMsUUFBUSxDQUFDLGlFQUFpRSxDQUFDO29C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QUFDO1FBQ3BMLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztDQUNKO0FBbk9ELDRDQW1PQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IG9rLCBmYWlsIH0gZnJvbSAnLi4vbGliL3Jlc3BvbnNlJztcbmltcG9ydCB7IFRvb2xEZWZpbml0aW9uLCBUb29sUmVzcG9uc2UsIFRvb2xFeGVjdXRvciB9IGZyb20gJy4uL3R5cGVzJztcbmltcG9ydCB7IHogfSBmcm9tICcuLi9saWIvc2NoZW1hJztcbmltcG9ydCB7IGRlZmluZVRvb2xzLCBUb29sRGVmIH0gZnJvbSAnLi4vbGliL2RlZmluZS10b29scyc7XG5cbmV4cG9ydCBjbGFzcyBQcmVmZXJlbmNlc1Rvb2xzIGltcGxlbWVudHMgVG9vbEV4ZWN1dG9yIHtcbiAgICBwcml2YXRlIHJlYWRvbmx5IGV4ZWM6IFRvb2xFeGVjdXRvcjtcblxuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICBjb25zdCBkZWZzOiBUb29sRGVmW10gPSBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ29wZW5fcHJlZmVyZW5jZXNfc2V0dGluZ3MnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnT3BlbiBwcmVmZXJlbmNlcyBzZXR0aW5ncycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gT3BlbiBDb2NvcyBQcmVmZXJlbmNlcyBVSSwgb3B0aW9uYWxseSBvbiBhIHRhYjsgVUkgc2lkZSBlZmZlY3Qgb25seS4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHRhYjogei5lbnVtKFsnZ2VuZXJhbCcsICdleHRlcm5hbC10b29scycsICdkYXRhLWVkaXRvcicsICdsYWJvcmF0b3J5JywgJ2V4dGVuc2lvbnMnXSkub3B0aW9uYWwoKS5kZXNjcmliZSgnUHJlZmVyZW5jZXMgdGFiIHRvIG9wZW4uIE9taXQgZm9yIHRoZSBkZWZhdWx0IHNldHRpbmdzIHBhbmVsLicpLFxuICAgICAgICAgICAgICAgICAgICBhcmdzOiB6LmFycmF5KHouYW55KCkpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0V4dHJhIHRhYiBhcmd1bWVudHM7IG5vcm1hbGx5IHVubmVjZXNzYXJ5LicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy5vcGVuUHJlZmVyZW5jZXNTZXR0aW5ncyhhLnRhYiwgYS5hcmdzKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3F1ZXJ5X3ByZWZlcmVuY2VzX2NvbmZpZycsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdSZWFkIHByZWZlcmVuY2VzIGNvbmZpZycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gUmVhZCBhIFByZWZlcmVuY2VzIGNvbmZpZyBjYXRlZ29yeS9wYXRoL3R5cGU7IHF1ZXJ5IGJlZm9yZSBzZXR0aW5nIHZhbHVlcy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIG5hbWU6IHouc3RyaW5nKCkuZGVmYXVsdCgnZ2VuZXJhbCcpLmRlc2NyaWJlKCdQcmVmZXJlbmNlcyBjYXRlZ29yeSBvciBleHRlbnNpb24vcGx1Z2luIG5hbWUuIERlZmF1bHQgZ2VuZXJhbC4nKSxcbiAgICAgICAgICAgICAgICAgICAgcGF0aDogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdPcHRpb25hbCBjb25maWcgcGF0aC4gT21pdCB0byByZWFkIHRoZSB3aG9sZSBjYXRlZ29yeS4nKSxcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogei5lbnVtKFsnZGVmYXVsdCcsICdnbG9iYWwnLCAnbG9jYWwnXSkuZGVmYXVsdCgnZ2xvYmFsJykuZGVzY3JpYmUoJ0NvbmZpZyBzb3VyY2U6IGRlZmF1bHQsIGdsb2JhbCwgb3IgcHJvamVjdC1sb2NhbC4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMucXVlcnlQcmVmZXJlbmNlc0NvbmZpZyhhLm5hbWUsIGEucGF0aCwgYS50eXBlKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3NldF9wcmVmZXJlbmNlc19jb25maWcnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnU2V0IHByZWZlcmVuY2VzIGNvbmZpZycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gV3JpdGUgYSBQcmVmZXJlbmNlcyBjb25maWcgdmFsdWU7IG11dGF0ZXMgQ29jb3MgZ2xvYmFsL2xvY2FsIHNldHRpbmdzLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgbmFtZTogei5zdHJpbmcoKS5kZXNjcmliZSgnUHJlZmVyZW5jZXMgY2F0ZWdvcnkgb3IgZXh0ZW5zaW9uL3BsdWdpbiBuYW1lIHRvIG1vZGlmeS4nKSxcbiAgICAgICAgICAgICAgICAgICAgcGF0aDogei5zdHJpbmcoKS5kZXNjcmliZSgnRXhhY3QgY29uZmlnIHBhdGggdG8gbW9kaWZ5LiBRdWVyeSBmaXJzdCBpZiB1bnN1cmUuJyksXG4gICAgICAgICAgICAgICAgICAgIHZhbHVlOiB6LmFueSgpLmRlc2NyaWJlKCdWYWx1ZSB0byB3cml0ZTsgbXVzdCBtYXRjaCB0aGUgdGFyZ2V0IHByZWZlcmVuY2UgZmllbGQgc2hhcGUuJyksXG4gICAgICAgICAgICAgICAgICAgIHR5cGU6IHouZW51bShbJ2RlZmF1bHQnLCAnZ2xvYmFsJywgJ2xvY2FsJ10pLmRlZmF1bHQoJ2dsb2JhbCcpLmRlc2NyaWJlKCdXcml0ZSB0YXJnZXQuIFByZWZlciBnbG9iYWwgb3IgbG9jYWw7IGF2b2lkIGRlZmF1bHQgdW5sZXNzIGludGVudGlvbmFsLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy5zZXRQcmVmZXJlbmNlc0NvbmZpZyhhLm5hbWUsIGEucGF0aCwgYS52YWx1ZSwgYS50eXBlKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2dldF9hbGxfcHJlZmVyZW5jZXMnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnUmVhZCBhbGwgcHJlZmVyZW5jZXMnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFJlYWQgY29tbW9uIFByZWZlcmVuY2VzIGNhdGVnb3JpZXM7IG1heSBub3QgaW5jbHVkZSBldmVyeSBleHRlbnNpb24gY2F0ZWdvcnkuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6ICgpID0+IHRoaXMuZ2V0QWxsUHJlZmVyZW5jZXMoKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3Jlc2V0X3ByZWZlcmVuY2VzJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1Jlc2V0IHByZWZlcmVuY2VzJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBSZXNldCBvbmUgUHJlZmVyZW5jZXMgY2F0ZWdvcnkgdG8gZGVmYXVsdHM7IGFsbC1jYXRlZ29yeSByZXNldCBpcyB1bnN1cHBvcnRlZC4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIG5hbWU6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnU2luZ2xlIHByZWZlcmVuY2UgY2F0ZWdvcnkgdG8gcmVzZXQuIFJlc2V0dGluZyBhbGwgY2F0ZWdvcmllcyBpcyBub3Qgc3VwcG9ydGVkLicpLFxuICAgICAgICAgICAgICAgICAgICB0eXBlOiB6LmVudW0oWydnbG9iYWwnLCAnbG9jYWwnXSkuZGVmYXVsdCgnZ2xvYmFsJykuZGVzY3JpYmUoJ0NvbmZpZyBzY29wZSB0byByZXNldC4gRGVmYXVsdCBnbG9iYWwuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLnJlc2V0UHJlZmVyZW5jZXMoYS5uYW1lLCBhLnR5cGUpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnZXhwb3J0X3ByZWZlcmVuY2VzJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ0V4cG9ydCBwcmVmZXJlbmNlcycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gUmV0dXJuIHJlYWRhYmxlIFByZWZlcmVuY2VzIGFzIEpTT04gZGF0YTsgZG9lcyBub3Qgd3JpdGUgYSBmaWxlLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgZXhwb3J0UGF0aDogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdMYWJlbCBmb3IgdGhlIHJldHVybmVkIGV4cG9ydCBwYXRoLiBDdXJyZW50IGltcGxlbWVudGF0aW9uIHJldHVybnMgSlNPTiBkYXRhIG9ubHk7IGl0IGRvZXMgbm90IHdyaXRlIGEgZmlsZS4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMuZXhwb3J0UHJlZmVyZW5jZXMoYS5leHBvcnRQYXRoKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2ltcG9ydF9wcmVmZXJlbmNlcycsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdJbXBvcnQgcHJlZmVyZW5jZXMnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFVuc3VwcG9ydGVkIFByZWZlcmVuY2VzIGltcG9ydCBwbGFjZWhvbGRlcjsgbmV2ZXIgbW9kaWZpZXMgc2V0dGluZ3MuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBpbXBvcnRQYXRoOiB6LnN0cmluZygpLmRlc2NyaWJlKCdQcmVmZXJlbmNlcyBmaWxlIHBhdGggdG8gaW1wb3J0LiBDdXJyZW50IGltcGxlbWVudGF0aW9uIHJlcG9ydHMgdW5zdXBwb3J0ZWQgYW5kIGRvZXMgbm90IG1vZGlmeSBzZXR0aW5ncy4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMuaW1wb3J0UHJlZmVyZW5jZXMoYS5pbXBvcnRQYXRoKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgIF07XG4gICAgICAgIHRoaXMuZXhlYyA9IGRlZmluZVRvb2xzKGRlZnMpO1xuICAgIH1cblxuICAgIGdldFRvb2xzKCk6IFRvb2xEZWZpbml0aW9uW10geyByZXR1cm4gdGhpcy5leGVjLmdldFRvb2xzKCk7IH1cbiAgICBleGVjdXRlKHRvb2xOYW1lOiBzdHJpbmcsIGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7IHJldHVybiB0aGlzLmV4ZWMuZXhlY3V0ZSh0b29sTmFtZSwgYXJncyk7IH1cblxuICAgIHByaXZhdGUgYXN5bmMgb3BlblByZWZlcmVuY2VzU2V0dGluZ3ModGFiPzogc3RyaW5nLCBhcmdzPzogYW55W10pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHJlcXVlc3RBcmdzID0gW107XG4gICAgICAgICAgICBpZiAodGFiKSB7XG4gICAgICAgICAgICAgICAgcmVxdWVzdEFyZ3MucHVzaCh0YWIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGFyZ3MgJiYgYXJncy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgcmVxdWVzdEFyZ3MucHVzaCguLi5hcmdzKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgKEVkaXRvci5NZXNzYWdlLnJlcXVlc3QgYXMgYW55KSgncHJlZmVyZW5jZXMnLCAnb3Blbi1zZXR0aW5ncycsIC4uLnJlcXVlc3RBcmdzKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHVuZGVmaW5lZCwgYFByZWZlcmVuY2VzIHNldHRpbmdzIG9wZW5lZCR7dGFiID8gYCBvbiB0YWI6ICR7dGFifWAgOiAnJ31gKSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgcXVlcnlQcmVmZXJlbmNlc0NvbmZpZyhuYW1lOiBzdHJpbmcsIHBhdGg/OiBzdHJpbmcsIHR5cGU6IHN0cmluZyA9ICdnbG9iYWwnKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCByZXF1ZXN0QXJncyA9IFtuYW1lXTtcbiAgICAgICAgICAgIGlmIChwYXRoKSB7XG4gICAgICAgICAgICAgICAgcmVxdWVzdEFyZ3MucHVzaChwYXRoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJlcXVlc3RBcmdzLnB1c2godHlwZSk7XG5cbiAgICAgICAgICAgIChFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0IGFzIGFueSkoJ3ByZWZlcmVuY2VzJywgJ3F1ZXJ5LWNvbmZpZycsIC4uLnJlcXVlc3RBcmdzKS50aGVuKChjb25maWc6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogbmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhdGg6IHBhdGgsXG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiB0eXBlLFxuICAgICAgICAgICAgICAgICAgICAgICAgY29uZmlnOiBjb25maWdcbiAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHNldFByZWZlcmVuY2VzQ29uZmlnKG5hbWU6IHN0cmluZywgcGF0aDogc3RyaW5nLCB2YWx1ZTogYW55LCB0eXBlOiBzdHJpbmcgPSAnZ2xvYmFsJyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgKEVkaXRvci5NZXNzYWdlLnJlcXVlc3QgYXMgYW55KSgncHJlZmVyZW5jZXMnLCAnc2V0LWNvbmZpZycsIG5hbWUsIHBhdGgsIHZhbHVlLCB0eXBlKS50aGVuKChzdWNjZXNzOiBib29sZWFuKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShvayh1bmRlZmluZWQsIGBQcmVmZXJlbmNlICcke25hbWV9LiR7cGF0aH0nIHVwZGF0ZWQgc3VjY2Vzc2Z1bGx5YCkpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChgRmFpbGVkIHRvIHVwZGF0ZSBwcmVmZXJlbmNlICcke25hbWV9LiR7cGF0aH0nYCkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRBbGxQcmVmZXJlbmNlcygpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIC8vIENvbW1vbiBwcmVmZXJlbmNlIGNhdGVnb3JpZXMgaW4gQ29jb3MgQ3JlYXRvclxuICAgICAgICAgICAgY29uc3QgY2F0ZWdvcmllcyA9IFtcbiAgICAgICAgICAgICAgICAnZ2VuZXJhbCcsXG4gICAgICAgICAgICAgICAgJ2V4dGVybmFsLXRvb2xzJywgXG4gICAgICAgICAgICAgICAgJ2RhdGEtZWRpdG9yJyxcbiAgICAgICAgICAgICAgICAnbGFib3JhdG9yeScsXG4gICAgICAgICAgICAgICAgJ2V4dGVuc2lvbnMnLFxuICAgICAgICAgICAgICAgICdwcmV2aWV3JyxcbiAgICAgICAgICAgICAgICAnY29uc29sZScsXG4gICAgICAgICAgICAgICAgJ25hdGl2ZScsXG4gICAgICAgICAgICAgICAgJ2J1aWxkZXInXG4gICAgICAgICAgICBdO1xuXG4gICAgICAgICAgICBjb25zdCBwcmVmZXJlbmNlczogYW55ID0ge307XG5cbiAgICAgICAgICAgIGNvbnN0IHF1ZXJ5UHJvbWlzZXMgPSBjYXRlZ29yaWVzLm1hcChjYXRlZ29yeSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3ByZWZlcmVuY2VzJywgJ3F1ZXJ5LWNvbmZpZycsIGNhdGVnb3J5LCB1bmRlZmluZWQsICdnbG9iYWwnKVxuICAgICAgICAgICAgICAgICAgICAudGhlbigoY29uZmlnOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHByZWZlcmVuY2VzW2NhdGVnb3J5XSA9IGNvbmZpZztcbiAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgLmNhdGNoKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIElnbm9yZSBlcnJvcnMgZm9yIGNhdGVnb3JpZXMgdGhhdCBkb24ndCBleGlzdFxuICAgICAgICAgICAgICAgICAgICAgICAgcHJlZmVyZW5jZXNbY2F0ZWdvcnldID0gbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgUHJvbWlzZS5hbGwocXVlcnlQcm9taXNlcykudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgLy8gRmlsdGVyIG91dCBudWxsIGVudHJpZXNcbiAgICAgICAgICAgICAgICBjb25zdCB2YWxpZFByZWZlcmVuY2VzID0gT2JqZWN0LmZyb21FbnRyaWVzKFxuICAgICAgICAgICAgICAgICAgICBPYmplY3QuZW50cmllcyhwcmVmZXJlbmNlcykuZmlsdGVyKChbXywgdmFsdWVdKSA9PiB2YWx1ZSAhPT0gbnVsbClcbiAgICAgICAgICAgICAgICApO1xuXG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXRlZ29yaWVzOiBPYmplY3Qua2V5cyh2YWxpZFByZWZlcmVuY2VzKSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHByZWZlcmVuY2VzOiB2YWxpZFByZWZlcmVuY2VzXG4gICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyByZXNldFByZWZlcmVuY2VzKG5hbWU/OiBzdHJpbmcsIHR5cGU6IHN0cmluZyA9ICdnbG9iYWwnKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBpZiAobmFtZSkge1xuICAgICAgICAgICAgICAgIC8vIFJlc2V0IHNwZWNpZmljIHByZWZlcmVuY2UgY2F0ZWdvcnlcbiAgICAgICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdwcmVmZXJlbmNlcycsICdxdWVyeS1jb25maWcnLCBuYW1lLCB1bmRlZmluZWQsICdkZWZhdWx0JykudGhlbigoZGVmYXVsdENvbmZpZzogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAoRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCBhcyBhbnkpKCdwcmVmZXJlbmNlcycsICdzZXQtY29uZmlnJywgbmFtZSwgJycsIGRlZmF1bHRDb25maWcsIHR5cGUpO1xuICAgICAgICAgICAgICAgIH0pLnRoZW4oKHN1Y2Nlc3M6IGJvb2xlYW4pID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUob2sodW5kZWZpbmVkLCBgUHJlZmVyZW5jZSBjYXRlZ29yeSAnJHtuYW1lfScgcmVzZXQgdG8gZGVmYXVsdGApKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChgRmFpbGVkIHRvIHJlc2V0IHByZWZlcmVuY2UgY2F0ZWdvcnkgJyR7bmFtZX0nYCkpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbCgnUmVzZXR0aW5nIGFsbCBwcmVmZXJlbmNlcyBpcyBub3Qgc3VwcG9ydGVkIHRocm91Z2ggQVBJLiBQbGVhc2Ugc3BlY2lmeSBhIHByZWZlcmVuY2UgY2F0ZWdvcnkuJykpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGV4cG9ydFByZWZlcmVuY2VzKGV4cG9ydFBhdGg/OiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIHRoaXMuZ2V0QWxsUHJlZmVyZW5jZXMoKS50aGVuKChwcmVmc1Jlc3VsdDogVG9vbFJlc3BvbnNlKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKCFwcmVmc1Jlc3VsdC5zdWNjZXNzKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUocHJlZnNSZXN1bHQpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgY29uc3QgcHJlZnNEYXRhID0gSlNPTi5zdHJpbmdpZnkocHJlZnNSZXN1bHQuZGF0YSwgbnVsbCwgMik7XG4gICAgICAgICAgICAgICAgY29uc3QgcGF0aCA9IGV4cG9ydFBhdGggfHwgYHByZWZlcmVuY2VzX2V4cG9ydF8ke0RhdGUubm93KCl9Lmpzb25gO1xuXG4gICAgICAgICAgICAgICAgLy8gRm9yIG5vdywgcmV0dXJuIHRoZSBkYXRhIC0gaW4gYSByZWFsIGltcGxlbWVudGF0aW9uLCB5b3UnZCB3cml0ZSB0byBmaWxlXG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICBleHBvcnRQYXRoOiBwYXRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgcHJlZmVyZW5jZXM6IHByZWZzUmVzdWx0LmRhdGEsXG4gICAgICAgICAgICAgICAgICAgICAgICBqc29uRGF0YTogcHJlZnNEYXRhLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogJ1ByZWZlcmVuY2VzIGV4cG9ydGVkIHN1Y2Nlc3NmdWxseSdcbiAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGltcG9ydFByZWZlcmVuY2VzKGltcG9ydFBhdGg6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgcmVzb2x2ZShmYWlsKCdJbXBvcnQgcHJlZmVyZW5jZXMgZnVuY3Rpb25hbGl0eSByZXF1aXJlcyBmaWxlIHN5c3RlbSBhY2Nlc3Mgd2hpY2ggaXMgbm90IGF2YWlsYWJsZSBpbiB0aGlzIGNvbnRleHQuIFBsZWFzZSBtYW51YWxseSBpbXBvcnQgcHJlZmVyZW5jZXMgdGhyb3VnaCB0aGUgRWRpdG9yIFVJLicpKTtcbiAgICAgICAgfSk7XG4gICAgfVxufVxuIl19