"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PreferencesTools = void 0;
const response_1 = require("../lib/response");
const schema_1 = require("../lib/schema");
const decorators_1 = require("../lib/decorators");
class PreferencesTools {
    constructor() {
        this.exec = (0, decorators_1.defineToolsFromDecorators)(this);
    }
    getTools() { return this.exec.getTools(); }
    execute(toolName, args) { return this.exec.execute(toolName, args); }
    async manage(a) {
        var _a, _b, _c, _d, _e;
        switch (a.op) {
            case 'open_settings':
                return this.openSettings(a.tab, a.args);
            case 'query_config':
                return this.queryConfig((_a = a.name) !== null && _a !== void 0 ? _a : 'general', a.path, (_b = a.type) !== null && _b !== void 0 ? _b : 'global');
            case 'set_config':
                if (!a.name || !a.path) {
                    return (0, response_1.fail)('preferences_manage(set_config): name and path are required');
                }
                return this.setConfig(a.name, a.path, a.value, (_c = a.type) !== null && _c !== void 0 ? _c : 'global');
            case 'get_all':
                return this.getAll();
            case 'reset':
                return this.reset(a.name, a.type === 'default' ? 'global' : ((_d = a.type) !== null && _d !== void 0 ? _d : 'global'));
            case 'export':
                return this.exportPrefs(a.exportPath);
            case 'import':
                return this.importPrefs((_e = a.importPath) !== null && _e !== void 0 ? _e : '');
            default:
                return (0, response_1.fail)(`preferences_manage: unknown op "${a.op}". Allowed: open_settings, query_config, set_config, get_all, reset, export, import.`);
        }
    }
    async openSettings(tab, args) {
        return new Promise((resolve) => {
            const requestArgs = [];
            if (tab)
                requestArgs.push(tab);
            if (args && args.length > 0)
                requestArgs.push(...args);
            Editor.Message.request('preferences', 'open-settings', ...requestArgs).then(() => {
                resolve((0, response_1.ok)(undefined, `Preferences settings opened${tab ? ` on tab: ${tab}` : ''}`));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async queryConfig(name, path, type) {
        return new Promise((resolve) => {
            const requestArgs = [name];
            if (path)
                requestArgs.push(path);
            requestArgs.push(type);
            Editor.Message.request('preferences', 'query-config', ...requestArgs).then((config) => {
                resolve((0, response_1.ok)({ name, path, type, config }));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async setConfig(name, path, value, type) {
        return new Promise((resolve) => {
            Editor.Message.request('preferences', 'set-config', name, path, value, type).then((success) => {
                if (success)
                    resolve((0, response_1.ok)(undefined, `Preference '${name}.${path}' updated successfully`));
                else
                    resolve((0, response_1.fail)(`Failed to update preference '${name}.${path}'`));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async getAll() {
        return new Promise((resolve) => {
            const categories = [
                'general', 'external-tools', 'data-editor', 'laboratory',
                'extensions', 'preview', 'console', 'native', 'builder',
            ];
            const preferences = {};
            const queryPromises = categories.map(category => {
                return Editor.Message.request('preferences', 'query-config', category, undefined, 'global')
                    .then((config) => { preferences[category] = config; })
                    .catch(() => { preferences[category] = null; });
            });
            Promise.all(queryPromises).then(() => {
                const validPreferences = Object.fromEntries(Object.entries(preferences).filter(([_, value]) => value !== null));
                resolve((0, response_1.ok)({
                    categories: Object.keys(validPreferences),
                    preferences: validPreferences,
                }));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async reset(name, type) {
        if (!name) {
            return (0, response_1.fail)('preferences_manage(reset): single-category reset requires `name`. Resetting all categories is not supported.');
        }
        return new Promise((resolve) => {
            Editor.Message.request('preferences', 'query-config', name, undefined, 'default').then((defaultConfig) => {
                return Editor.Message.request('preferences', 'set-config', name, '', defaultConfig, type);
            }).then((success) => {
                if (success)
                    resolve((0, response_1.ok)(undefined, `Preference category '${name}' reset to default`));
                else
                    resolve((0, response_1.fail)(`Failed to reset preference category '${name}'`));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async exportPrefs(exportPath) {
        const prefsResult = await this.getAll();
        if (!prefsResult.success)
            return prefsResult;
        const prefsData = JSON.stringify(prefsResult.data, null, 2);
        const path = exportPath || `preferences_export_${Date.now()}.json`;
        return (0, response_1.ok)({
            exportPath: path,
            preferences: prefsResult.data,
            jsonData: prefsData,
            message: 'Preferences exported successfully',
        });
    }
    async importPrefs(_importPath) {
        return (0, response_1.fail)('preferences_manage(import) is unsupported in this build — file-system import is not available in this context. Use the Editor UI to import preferences manually.');
    }
}
exports.PreferencesTools = PreferencesTools;
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'manage',
        title: 'Manage preferences',
        description: '[specialist] Macro tool for cocos editor preferences. op routes to: open_settings (UI), query_config / set_config (read/write a path), get_all (dump common categories), reset (single category to defaults), export (return JSON), import (unsupported placeholder).',
        inputSchema: schema_1.z.object({
            op: schema_1.z.enum([
                'open_settings',
                'query_config',
                'set_config',
                'get_all',
                'reset',
                'export',
                'import',
            ]).describe('Action to perform. open_settings shows UI; query_config/set_config read/write one path; get_all dumps common categories; reset restores one category to defaults; export returns JSON; import is unsupported.'),
            name: schema_1.z.string().optional().describe('Preferences category or extension name. Required by query_config (default "general"), set_config, reset (single-category only).'),
            path: schema_1.z.string().optional().describe('Config path within the category. Optional for query_config (omit to read whole category); required for set_config.'),
            value: schema_1.z.any().optional().describe('Value to write. Required for set_config; must match the target preference field shape.'),
            type: schema_1.z.enum(['default', 'global', 'local']).optional().describe('Config source/scope. query_config defaults to "global"; set_config defaults to "global"; reset accepts global/local.'),
            tab: schema_1.z.enum(['general', 'external-tools', 'data-editor', 'laboratory', 'extensions']).optional().describe('Used only by op="open_settings" to land on a specific tab.'),
            args: schema_1.z.array(schema_1.z.any()).optional().describe('Used only by op="open_settings" for extra tab arguments; normally unnecessary.'),
            importPath: schema_1.z.string().optional().describe('Used only by op="import"; current implementation reports unsupported and does not modify settings.'),
            exportPath: schema_1.z.string().optional().describe('Used only by op="export" as label for the returned export path. Does not write a file.'),
        }),
    })
], PreferencesTools.prototype, "manage", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJlZmVyZW5jZXMtdG9vbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvdG9vbHMvcHJlZmVyZW5jZXMtdG9vbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7O0FBQUEsOENBQTJDO0FBRTNDLDBDQUFrQztBQUNsQyxrREFBdUU7QUE2Q3ZFLE1BQWEsZ0JBQWdCO0lBR3pCO1FBQ0ksSUFBSSxDQUFDLElBQUksR0FBRyxJQUFBLHNDQUF5QixFQUFDLElBQUksQ0FBQyxDQUFDO0lBQ2hELENBQUM7SUFFRCxRQUFRLEtBQXVCLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDN0QsT0FBTyxDQUFDLFFBQWdCLEVBQUUsSUFBUyxJQUEyQixPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7SUEwQm5HLEFBQU4sS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFhOztRQUN0QixRQUFRLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNYLEtBQUssZUFBZTtnQkFDaEIsT0FBTyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQzVDLEtBQUssY0FBYztnQkFDZixPQUFPLElBQUksQ0FBQyxXQUFXLENBQUMsTUFBQSxDQUFDLENBQUMsSUFBSSxtQ0FBSSxTQUFTLEVBQUUsQ0FBQyxDQUFDLElBQUksRUFBRSxNQUFBLENBQUMsQ0FBQyxJQUFJLG1DQUFJLFFBQVEsQ0FBQyxDQUFDO1lBQzdFLEtBQUssWUFBWTtnQkFDYixJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztvQkFDckIsT0FBTyxJQUFBLGVBQUksRUFBQyw0REFBNEQsQ0FBQyxDQUFDO2dCQUM5RSxDQUFDO2dC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LEVBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxRQUFRLENBQUMsc0hBQXNILENBQUM7WUFDeEwsR0FBRyxFQUFFLFVBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxTQUFTLEVBQUUsZ0JBQWdCLEVBQUUsYUFBYSxFQUFFLFlBQVksRUFBRSxZQUFZLENBQUMsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDLFFBQVEsQ0FBQyw0REFBNEQsQ0FBQztZQUN2SyxJQUFJLEVBQUUsVUFBQyxDQUFDLEtBQUssQ0FBQyxVQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxRQUFRLENBQUMsZ0ZBQWdGLENBQUM7WUFDNUgsVUFBVSxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxRQUFRLENBQUMsb0dBQW9HLENBQUM7WUFDaEosVUFBVSxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxRQUFRLENBQUMsd0ZBQXdGLENBQUM7U0FDdkksQ0FBQztLQUNMLENBQUM7OENBdUJEIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgb2ssIGZhaWwgfSBmcm9tICcuLi9saWIvcmVzcG9uc2UnO1xuaW1wb3J0IHsgVG9vbERlZmluaXRpb24sIFRvb2xSZXNwb25zZSwgVG9vbEV4ZWN1dG9yIH0gZnJvbSAnLi4vdHlwZXMnO1xuaW1wb3J0IHsgeiB9IGZyb20gJy4uL2xpYi9zY2hlbWEnO1xuaW1wb3J0IHsgbWNwVG9vbCwgZGVmaW5lVG9vbHNGcm9tRGVjb3JhdG9ycyB9IGZyb20gJy4uL2xpYi9kZWNvcmF0b3JzJztcblxuLy8gdjIuMTAuNCAjOCAoUm9tYVJvZ292IG1hY3JvLXRvb2wgZW51bSByb3V0aW5nKTogY29sbGFwc2UgNyBmbGF0XG4vLyBwcmVmZXJlbmNlcyB0b29scyBpbnRvIGEgc2luZ2xlIGBwcmVmZXJlbmNlc19tYW5hZ2Uoe29wLCAuLi59KWAgbWFjcm9cbi8vIHRvb2wuIFJlYXNvbnM6XG4vLyAgIC0gVG9rZW4gY29zdDogNyBzZXBhcmF0ZSB0b29sIHNjaGVtYXMgdnMgMSB1bmlvbiBzYXZlcyBiYW5kd2lkdGggb25cbi8vICAgICBldmVyeSB0b29scy9saXN0IHJlc3BvbnNlLlxuLy8gICAtIENvaGVyZW5jZTogYWxsIG9wcyBzaGFyZSB0aGUgc2FtZSBkb21haW4gKGNvY29zIHByZWZlcmVuY2VzIElQQylcbi8vICAgICBhbmQgZGlzcGF0Y2ggdG8gdGhlIHNhbWUgRWRpdG9yLk1lc3NhZ2UgY2hhbm5lbDsgZmxhdCBjb2xsYXBzZVxuLy8gICAgIGtlZXBzIHRoZSBkaXNwYXRjaCB0cml2aWFsLlxuLy8gICAtIExMTSBlcmdvbm9taWNzOiBhIHNpbmdsZSB0b29sIHdpdGggYG9wYCBlbnVtIGlzIGVhc2llciBmb3IgQUkgdG9cbi8vICAgICBwaWNrIHRoYW4gNyBuZWFyLWlkZW50aWNhbGx5LW5hbWVkIGZsYXQgdG9vbHMuXG4vL1xuLy8gU2NoZW1hIHNoYXBlOiBmbGF0IG9wdGlvbmFsIGZpZWxkcyBwZXIgb3AgKE5PVCB6LmRpc2NyaW1pbmF0ZWRVbmlvbikuXG4vLyBkaXNjcmltaW5hdGVkVW5pb24gY29tcGlsZXMgdG8gSlNPTiBTY2hlbWEgNyBgb25lT2ZgIHdpdGggcGVyLWJyYW5jaFxuLy8gcmVxdWlyZWQgYXJyYXlzIOKAlCBnZW1pbmktY29tcGF0IHdvcmtzIGluIHpvZCA0IC8gZHJhZnQtNyAobGFuZG1pbmVcbi8vICMxNSksIGJ1dCB0aGUgZmxhdCBzY2hlbWEgaXMgc2ltcGxlciBmb3IgZXZlcnkgTExNIHRvb2wtY2FsbCBwYXJzZXJcbi8vIGFuZCBtYXRjaGVzIHRoZSB2Mi45LjMgcmVmZXJlbmNlSW1hZ2VfbWFuYWdlIHByZWNlZGVudC5cbi8vXG4vLyBCYWNrd2FyZCBjb21wYXRpYmlsaXR5OiB0aGlzIGlzIGEgQlJFQUtJTkcgY2hhbmdlIGZvciBjYWxsZXJzIHRoYXRcbi8vIGFkZHJlc3NlZCBpbmRpdmlkdWFsIGBwcmVmZXJlbmNlc188dmVyYj5gIHRvb2wgbmFtZXMuIFdlXG4vLyBpbnRlbnRpb25hbGx5IGRvbid0IHNoaXAgY29tcGF0IGFsaWFzZXMg4oCUIHRoYXQgd291bGQgZGVmZWF0IHRoZVxuLy8gdG9rZW4tY29zdCByZWR1Y3Rpb24uIHYyLjEwLnggaXMgdGhlIG1pZ3JhdGlvbiB3aW5kb3cuXG5cbnR5cGUgUHJlZmVyZW5jZXNPcCA9XG4gICAgfCAnb3Blbl9zZXR0aW5ncydcbiAgICB8ICdxdWVyeV9jb25maWcnXG4gICAgfCAnc2V0X2NvbmZpZydcbiAgICB8ICdnZXRfYWxsJ1xuICAgIHwgJ3Jlc2V0J1xuICAgIHwgJ2V4cG9ydCdcbiAgICB8ICdpbXBvcnQnO1xuXG5pbnRlcmZhY2UgTWFuYWdlQXJncyB7XG4gICAgb3A6IFByZWZlcmVuY2VzT3A7XG4gICAgbmFtZT86IHN0cmluZztcbiAgICBwYXRoPzogc3RyaW5nO1xuICAgIHZhbHVlPzogYW55O1xuICAgIHR5cGU/OiAnZGVmYXVsdCcgfCAnZ2xvYmFsJyB8ICdsb2NhbCc7XG4gICAgdGFiPzogJ2dlbmVyYWwnIHwgJ2V4dGVybmFsLXRvb2xzJyB8ICdkYXRhLWVkaXRvcicgfCAnbGFib3JhdG9yeScgfCAnZXh0ZW5zaW9ucyc7XG4gICAgYXJncz86IGFueVtdO1xuICAgIGltcG9ydFBhdGg/OiBzdHJpbmc7XG4gICAgZXhwb3J0UGF0aD86IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIFByZWZlcmVuY2VzVG9vbHMgaW1wbGVtZW50cyBUb29sRXhlY3V0b3Ige1xuICAgIHByaXZhdGUgcmVhZG9ubHkgZXhlYzogVG9vbEV4ZWN1dG9yO1xuXG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHRoaXMuZXhlYyA9IGRlZmluZVRvb2xzRnJvbURlY29yYXRvcnModGhpcyk7XG4gICAgfVxuXG4gICAgZ2V0VG9vbHMoKTogVG9vbERlZmluaXRpb25bXSB7IHJldHVybiB0aGlzLmV4ZWMuZ2V0VG9vbHMoKTsgfVxuICAgIGV4ZWN1dGUodG9vbE5hbWU6IHN0cmluZywgYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHsgcmV0dXJuIHRoaXMuZXhlYy5leGVjdXRlKHRvb2xOYW1lLCBhcmdzKTsgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnbWFuYWdlJyxcbiAgICAgICAgdGl0bGU6ICdNYW5hZ2UgcHJlZmVyZW5jZXMnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBNYWNybyB0b29sIGZvciBjb2NvcyBlZGl0b3IgcHJlZmVyZW5jZXMuIG9wIHJvdXRlcyB0bzogb3Blbl9zZXR0aW5ncyAoVUkpLCBxdWVyeV9jb25maWcgLyBzZXRfY29uZmlnIChyZWFkL3dyaXRlIGEgcGF0aCksIGdldF9hbGwgKGR1bXAgY29tbW9uIGNhdGVnb3JpZXMpLCByZXNldCAoc2luZ2xlIGNhdGVnb3J5IHRvIGRlZmF1bHRzKSwgZXhwb3J0IChyZXR1cm4gSlNPTiksIGltcG9ydCAodW5zdXBwb3J0ZWQgcGxhY2Vob2xkZXIpLicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICBvcDogei5lbnVtKFtcbiAgICAgICAgICAgICAgICAnb3Blbl9zZXR0aW5ncycsXG4gICAgICAgICAgICAgICAgJ3F1ZXJ5X2NvbmZpZycsXG4gICAgICAgICAgICAgICAgJ3NldF9jb25maWcnLFxuICAgICAgICAgICAgICAgICdnZXRfYWxsJyxcbiAgICAgICAgICAgICAgICAncmVzZXQnLFxuICAgICAgICAgICAgICAgICdleHBvcnQnLFxuICAgICAgICAgICAgICAgICdpbXBvcnQnLFxuICAgICAgICAgICAgXSkuZGVzY3JpYmUoJ0FjdGlvbiB0byBwZXJmb3JtLiBvcGVuX3NldHRpbmdzIHNob3dzIFVJOyBxdWVyeV9jb25maWcvc2V0X2NvbmZpZyByZWFkL3dyaXRlIG9uZSBwYXRoOyBnZXRfYWxsIGR1bXBzIGNvbW1vbiBjYXRlZ29yaWVzOyByZXNldCByZXN0b3JlcyBvbmUgY2F0ZWdvcnkgdG8gZGVmYXVsdHM7IGV4cG9ydCByZXR1cm5zIEpTT047IGltcG9ydCBpcyB1bnN1cHBvcnRlZC4nKSxcbiAgICAgICAgICAgIG5hbWU6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnUHJlZmVyZW5jZXMgY2F0ZWdvcnkgb3IgZXh0ZW5zaW9uIG5hbWUuIFJlcXVpcmVkIGJ5IHF1ZXJ5X2NvbmZpZyAoZGVmYXVsdCBcImdlbmVyYWxcIiksIHNldF9jb25maWcsIHJlc2V0IChzaW5nbGUtY2F0ZWdvcnkgb25seSkuJyksXG4gICAgICAgICAgICBwYXRoOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0NvbmZpZyBwYXRoIHdpdGhpbiB0aGUgY2F0ZWdvcnkuIE9wdGlvbmFsIGZvciBxdWVyeV9jb25maWcgKG9taXQgdG8gcmVhZCB3aG9sZSBjYXRlZ29yeSk7IHJlcXVpcmVkIGZvciBzZXRfY29uZmlnLicpLFxuICAgICAgICAgICAgdmFsdWU6IHouYW55KCkub3B0aW9uYWwoKS5kZXNjcmliZSgnVmFsdWUgdG8gd3JpdGUuIFJlcXVpcmVkIGZvciBzZXRfY29uZmlnOyBtdXN0IG1hdGNoIHRoZSB0YXJnZXQgcHJlZmVyZW5jZSBmaWVsZCBzaGFwZS4nKSxcbiAgICAgICAgICAgIHR5cGU6IHouZW51bShbJ2RlZmF1bHQnLCAnZ2xvYmFsJywgJ2xvY2FsJ10pLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0NvbmZpZyBzb3VyY2Uvc2NvcGUuIHF1ZXJ5X2NvbmZpZyBkZWZhdWx0cyB0byBcImdsb2JhbFwiOyBzZXRfY29uZmlnIGRlZmF1bHRzIHRvIFwiZ2xvYmFsXCI7IHJlc2V0IGFjY2VwdHMgZ2xvYmFsL2xvY2FsLicpLFxuICAgICAgICAgICAgdGFiOiB6LmVudW0oWydnZW5lcmFsJywgJ2V4dGVybmFsLXRvb2xzJywgJ2RhdGEtZWRpdG9yJywgJ2xhYm9yYXRvcnknLCAnZXh0ZW5zaW9ucyddKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdVc2VkIG9ubHkgYnkgb3A9XCJvcGVuX3NldHRpbmdzXCIgdG8gbGFuZCBvbiBhIHNwZWNpZmljIHRhYi4nKSxcbiAgICAgICAgICAgIGFyZ3M6IHouYXJyYXkoei5hbnkoKSkub3B0aW9uYWwoKS5kZXNjcmliZSgnVXNlZCBvbmx5IGJ5IG9wPVwib3Blbl9zZXR0aW5nc1wiIGZvciBleHRyYSB0YWIgYXJndW1lbnRzOyBub3JtYWxseSB1bm5lY2Vzc2FyeS4nKSxcbiAgICAgICAgICAgIGltcG9ydFBhdGg6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnVXNlZCBvbmx5IGJ5IG9wPVwiaW1wb3J0XCI7IGN1cnJlbnQgaW1wbGVtZW50YXRpb24gcmVwb3J0cyB1bnN1cHBvcnRlZCBhbmQgZG9lcyBub3QgbW9kaWZ5IHNldHRpbmdzLicpLFxuICAgICAgICAgICAgZXhwb3J0UGF0aDogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdVc2VkIG9ubHkgYnkgb3A9XCJleHBvcnRcIiBhcyBsYWJlbCBmb3IgdGhlIHJldHVybmVkIGV4cG9ydCBwYXRoLiBEb2VzIG5vdCB3cml0ZSBhIGZpbGUuJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgbWFuYWdlKGE6IE1hbmFnZUFyZ3MpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBzd2l0Y2ggKGEub3ApIHtcbiAgICAgICAgICAgIGNhc2UgJ29wZW5fc2V0dGluZ3MnOlxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLm9wZW5TZXR0aW5ncyhhLnRhYiwgYS5hcmdzKTtcbiAgICAgICAgICAgIGNhc2UgJ3F1ZXJ5X2NvbmZpZyc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMucXVlcnlDb25maWcoYS5uYW1lID8/ICdnZW5lcmFsJywgYS5wYXRoLCBhLnR5cGUgPz8gJ2dsb2JhbCcpO1xuICAgICAgICAgICAgY2FzZSAnc2V0X2NvbmZpZyc6XG4gICAgICAgICAgICAgICAgaWYgKCFhLm5hbWUgfHwgIWEucGF0aCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFpbCgncHJlZmVyZW5jZXNfbWFuYWdlKHNldF9jb25maWcpOiBuYW1lIGFuZCBwYXRoIGFyZSByZXF1aXJlZCcpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5zZXRDb25maWcoYS5uYW1lLCBhLnBhdGgsIGEudmFsdWUsIGEudHlwZSA/PyAnZ2xvYmFsJyk7XG4gICAgICAgICAgICBjYXNlICdnZXRfYWxsJzpcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5nZXRBbGwoKTtcbiAgICAgICAgICAgIGNhc2UgJ3Jlc2V0JzpcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5yZXNldChhLm5hbWUsIGEudHlwZSA9PT0gJ2RlZmF1bHQnID8gJ2dsb2JhbCcgOiAoYS50eXBlID8/ICdnbG9iYWwnKSk7XG4gICAgICAgICAgICBjYXNlICdleHBvcnQnOlxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmV4cG9ydFByZWZzKGEuZXhwb3J0UGF0aCk7XG4gICAgICAgICAgICBjYXNlICdpbXBvcnQnOlxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmltcG9ydFByZWZzKGEuaW1wb3J0UGF0aCA/PyAnJyk7XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKGBwcmVmZXJlbmNlc19tYW5hZ2U6IHVua25vd24gb3AgXCIkeyhhIGFzIGFueSkub3B9XCIuIEFsbG93ZWQ6IG9wZW5fc2V0dGluZ3MsIHF1ZXJ5X2NvbmZpZywgc2V0X2NvbmZpZywgZ2V0X2FsbCwgcmVzZXQsIGV4cG9ydCwgaW1wb3J0LmApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBvcGVuU2V0dGluZ3ModGFiPzogc3RyaW5nLCBhcmdzPzogYW55W10pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHJlcXVlc3RBcmdzOiBhbnlbXSA9IFtdO1xuICAgICAgICAgICAgaWYgKHRhYikgcmVxdWVzdEFyZ3MucHVzaCh0YWIpO1xuICAgICAgICAgICAgaWYgKGFyZ3MgJiYgYXJncy5sZW5ndGggPiAwKSByZXF1ZXN0QXJncy5wdXNoKC4uLmFyZ3MpO1xuICAgICAgICAgICAgKEVkaXRvci5NZXNzYWdlLnJlcXVlc3QgYXMgYW55KSgncHJlZmVyZW5jZXMnLCAnb3Blbi1zZXR0aW5ncycsIC4uLnJlcXVlc3RBcmdzKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHVuZGVmaW5lZCwgYFByZWZlcmVuY2VzIHNldHRpbmdzIG9wZW5lZCR7dGFiID8gYCBvbiB0YWI6ICR7dGFifWAgOiAnJ31gKSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgcXVlcnlDb25maWcobmFtZTogc3RyaW5nLCBwYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQsIHR5cGU6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgcmVxdWVzdEFyZ3M6IGFueVtdID0gW25hbWVdO1xuICAgICAgICAgICAgaWYgKHBhdGgpIHJlcXVlc3RBcmdzLnB1c2gocGF0aCk7XG4gICAgICAgICAgICByZXF1ZXN0QXJncy5wdXNoKHR5cGUpO1xuICAgICAgICAgICAgKEVkaXRvci5NZXNzYWdlLnJlcXVlc3QgYXMgYW55KSgncHJlZmVyZW5jZXMnLCAncXVlcnktY29uZmlnJywgLi4ucmVxdWVzdEFyZ3MpLnRoZW4oKGNvbmZpZzogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7IG5hbWUsIHBhdGgsIHR5cGUsIGNvbmZpZyB9KSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgc2V0Q29uZmlnKG5hbWU6IHN0cmluZywgcGF0aDogc3RyaW5nLCB2YWx1ZTogYW55LCB0eXBlOiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIChFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0IGFzIGFueSkoJ3ByZWZlcmVuY2VzJywgJ3NldC1jb25maWcnLCBuYW1lLCBwYXRoLCB2YWx1ZSwgdHlwZSkudGhlbigoc3VjY2VzczogYm9vbGVhbikgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChzdWNjZXNzKSByZXNvbHZlKG9rKHVuZGVmaW5lZCwgYFByZWZlcmVuY2UgJyR7bmFtZX0uJHtwYXRofScgdXBkYXRlZCBzdWNjZXNzZnVsbHlgKSk7XG4gICAgICAgICAgICAgICAgZWxzZSByZXNvbHZlKGZhaWwoYEZhaWxlZCB0byB1cGRhdGUgcHJlZmVyZW5jZSAnJHtuYW1lfS4ke3BhdGh9J2ApKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRBbGwoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBjYXRlZ29yaWVzID0gW1xuICAgICAgICAgICAgICAgICdnZW5lcmFsJywgJ2V4dGVybmFsLXRvb2xzJywgJ2RhdGEtZWRpdG9yJywgJ2xhYm9yYXRvcnknLFxuICAgICAgICAgICAgICAgICdleHRlbnNpb25zJywgJ3ByZXZpZXcnLCAnY29uc29sZScsICduYXRpdmUnLCAnYnVpbGRlcicsXG4gICAgICAgICAgICBdO1xuICAgICAgICAgICAgY29uc3QgcHJlZmVyZW5jZXM6IGFueSA9IHt9O1xuICAgICAgICAgICAgY29uc3QgcXVlcnlQcm9taXNlcyA9IGNhdGVnb3JpZXMubWFwKGNhdGVnb3J5ID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgncHJlZmVyZW5jZXMnLCAncXVlcnktY29uZmlnJywgY2F0ZWdvcnksIHVuZGVmaW5lZCwgJ2dsb2JhbCcpXG4gICAgICAgICAgICAgICAgICAgIC50aGVuKChjb25maWc6IGFueSkgPT4geyBwcmVmZXJlbmNlc1tjYXRlZ29yeV0gPSBjb25maWc7IH0pXG4gICAgICAgICAgICAgICAgICAgIC5jYXRjaCgoKSA9PiB7IHByZWZlcmVuY2VzW2NhdGVnb3J5XSA9IG51bGw7IH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBQcm9taXNlLmFsbChxdWVyeVByb21pc2VzKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCB2YWxpZFByZWZlcmVuY2VzID0gT2JqZWN0LmZyb21FbnRyaWVzKFxuICAgICAgICAgICAgICAgICAgICBPYmplY3QuZW50cmllcyhwcmVmZXJlbmNlcykuZmlsdGVyKChbXywgdmFsdWVdKSA9PiB2YWx1ZSAhPT0gbnVsbCksXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgY2F0ZWdvcmllczogT2JqZWN0LmtleXModmFsaWRQcmVmZXJlbmNlcyksXG4gICAgICAgICAgICAgICAgICAgIHByZWZlcmVuY2VzOiB2YWxpZFByZWZlcmVuY2VzLFxuICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyByZXNldChuYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQsIHR5cGU6ICdnbG9iYWwnIHwgJ2xvY2FsJyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGlmICghbmFtZSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ3ByZWZlcmVuY2VzX21hbmFnZShyZXNldCk6IHNpbmdsZS1jYXRlZ29yeSByZXNldCByZXF1aXJlcyBgbmFtZWAuIFJlc2V0dGluZyBhbGwgY2F0ZWdvcmllcyBpcyBub3Qgc3VwcG9ydGVkLicpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgncHJlZmVyZW5jZXMnLCAncXVlcnktY29uZmlnJywgbmFtZSwgdW5kZWZpbmVkLCAnZGVmYXVsdCcpLnRoZW4oKGRlZmF1bHRDb25maWc6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiAoRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCBhcyBhbnkpKCdwcmVmZXJlbmNlcycsICdzZXQtY29uZmlnJywgbmFtZSwgJycsIGRlZmF1bHRDb25maWcsIHR5cGUpO1xuICAgICAgICAgICAgfSkudGhlbigoc3VjY2VzczogYm9vbGVhbikgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChzdWNjZXNzKSByZXNvbHZlKG9rKHVuZGVmaW5lZCwgYFByZWZlcmVuY2UgY2F0ZWdvcnkgJyR7bmFtZX0nIHJlc2V0IHRvIGRlZmF1bHRgKSk7XG4gICAgICAgICAgICAgICAgZWxzZSByZXNvbHZlKGZhaWwoYEZhaWxlZCB0byByZXNldCBwcmVmZXJlbmNlIGNhdGVnb3J5ICcke25hbWV9J2ApKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBleHBvcnRQcmVmcyhleHBvcnRQYXRoPzogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgcHJlZnNSZXN1bHQgPSBhd2FpdCB0aGlzLmdldEFsbCgpO1xuICAgICAgICBpZiAoIXByZWZzUmVzdWx0LnN1Y2Nlc3MpIHJldHVybiBwcmVmc1Jlc3VsdDtcbiAgICAgICAgY29uc3QgcHJlZnNEYXRhID0gSlNPTi5zdHJpbmdpZnkocHJlZnNSZXN1bHQuZGF0YSwgbnVsbCwgMik7XG4gICAgICAgIGNvbnN0IHBhdGggPSBleHBvcnRQYXRoIHx8IGBwcmVmZXJlbmNlc19leHBvcnRfJHtEYXRlLm5vdygpfS5qc29uYDtcbiAgICAgICAgcmV0dXJuIG9rKHtcbiAgICAgICAgICAgIGV4cG9ydFBhdGg6IHBhdGgsXG4gICAgICAgICAgICBwcmVmZXJlbmNlczogcHJlZnNSZXN1bHQuZGF0YSxcbiAgICAgICAgICAgIGpzb25EYXRhOiBwcmVmc0RhdGEsXG4gICAgICAgICAgICBtZXNzYWdlOiAnUHJlZmVyZW5jZXMgZXhwb3J0ZWQgc3VjY2Vzc2Z1bGx5JyxcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBpbXBvcnRQcmVmcyhfaW1wb3J0UGF0aDogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIGZhaWwoJ3ByZWZlcmVuY2VzX21hbmFnZShpbXBvcnQpIGlzIHVuc3VwcG9ydGVkIGluIHRoaXMgYnVpbGQg4oCUIGZpbGUtc3lzdGVtIGltcG9ydCBpcyBub3QgYXZhaWxhYmxlIGluIHRoaXMgY29udGV4dC4gVXNlIHRoZSBFZGl0b3IgVUkgdG8gaW1wb3J0IHByZWZlcmVuY2VzIG1hbnVhbGx5LicpO1xuICAgIH1cbn1cbiJdfQ==