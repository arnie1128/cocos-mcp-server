"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_TOOL_MANAGER_SETTINGS = exports.DEFAULT_SETTINGS = void 0;
exports.readSettings = readSettings;
exports.saveSettings = saveSettings;
exports.readToolManagerSettings = readToolManagerSettings;
exports.saveToolManagerSettings = saveToolManagerSettings;
exports.exportToolConfiguration = exportToolConfiguration;
exports.importToolConfiguration = importToolConfiguration;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const log_1 = require("./lib/log");
const DEFAULT_SETTINGS = {
    port: 3000,
    autoStart: false,
    enableDebugLog: false,
    allowedOrigins: ['*'],
    maxConnections: 10,
    enableEditorContextEval: false,
    enableSceneLogCapture: true
};
exports.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
const DEFAULT_TOOL_MANAGER_SETTINGS = {
    configurations: [],
    currentConfigId: '',
    maxConfigSlots: 5
};
exports.DEFAULT_TOOL_MANAGER_SETTINGS = DEFAULT_TOOL_MANAGER_SETTINGS;
function getSettingsPath() {
    return path.join(Editor.Project.path, 'settings', 'mcp-server.json');
}
function getToolManagerSettingsPath() {
    return path.join(Editor.Project.path, 'settings', 'tool-manager.json');
}
function ensureSettingsDir() {
    const settingsDir = path.dirname(getSettingsPath());
    if (!fs.existsSync(settingsDir)) {
        fs.mkdirSync(settingsDir, { recursive: true });
    }
}
function readSettings() {
    try {
        ensureSettingsDir();
        const settingsFile = getSettingsPath();
        if (fs.existsSync(settingsFile)) {
            const content = fs.readFileSync(settingsFile, 'utf8');
            return Object.assign(Object.assign({}, DEFAULT_SETTINGS), JSON.parse(content));
        }
    }
    catch (e) {
        log_1.logger.error('Failed to read settings:', e);
    }
    return DEFAULT_SETTINGS;
}
function saveSettings(settings) {
    try {
        ensureSettingsDir();
        const settingsFile = getSettingsPath();
        fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
    }
    catch (e) {
        log_1.logger.error('Failed to save settings:', e);
        throw e;
    }
}
// 工具管理器設置相關函數
function readToolManagerSettings() {
    try {
        ensureSettingsDir();
        const settingsFile = getToolManagerSettingsPath();
        if (fs.existsSync(settingsFile)) {
            const content = fs.readFileSync(settingsFile, 'utf8');
            return Object.assign(Object.assign({}, DEFAULT_TOOL_MANAGER_SETTINGS), JSON.parse(content));
        }
    }
    catch (e) {
        log_1.logger.error('Failed to read tool manager settings:', e);
    }
    return DEFAULT_TOOL_MANAGER_SETTINGS;
}
function saveToolManagerSettings(settings) {
    try {
        ensureSettingsDir();
        const settingsFile = getToolManagerSettingsPath();
        fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
    }
    catch (e) {
        log_1.logger.error('Failed to save tool manager settings:', e);
        throw e;
    }
}
function exportToolConfiguration(config) {
    return JSON.stringify(config, null, 2);
}
function importToolConfiguration(configJson) {
    try {
        const config = JSON.parse(configJson);
        // 驗證配置格式
        if (!config.id || !config.name || !Array.isArray(config.tools)) {
            throw new Error('Invalid configuration format');
        }
        return config;
    }
    catch (e) {
        log_1.logger.error('Failed to parse tool configuration:', e);
        throw new Error('Invalid JSON format or configuration structure');
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2V0dGluZ3MuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zb3VyY2Uvc2V0dGluZ3MudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBb0NBLG9DQVlDO0FBRUQsb0NBU0M7QUFHRCwwREFZQztBQUVELDBEQVNDO0FBRUQsMERBRUM7QUFFRCwwREFZQztBQXZHRCx1Q0FBeUI7QUFDekIsMkNBQTZCO0FBRTdCLG1DQUFtQztBQUVuQyxNQUFNLGdCQUFnQixHQUFzQjtJQUN4QyxJQUFJLEVBQUUsSUFBSTtJQUNWLFNBQVMsRUFBRSxLQUFLO0lBQ2hCLGNBQWMsRUFBRSxLQUFLO0lBQ3JCLGNBQWMsRUFBRSxDQUFDLEdBQUcsQ0FBQztJQUNyQixjQUFjLEVBQUUsRUFBRTtJQUNsQix1QkFBdUIsRUFBRSxLQUFLO0lBQzlCLHFCQUFxQixFQUFFLElBQUk7Q0FDOUIsQ0FBQztBQTRGTyw0Q0FBZ0I7QUExRnpCLE1BQU0sNkJBQTZCLEdBQXdCO0lBQ3ZELGNBQWMsRUFBRSxFQUFFO0lBQ2xCLGVBQWUsRUFBRSxFQUFFO0lBQ25CLGNBQWMsRUFBRSxDQUFDO0NBQ3BCLENBQUM7QUFzRnlCLHNFQUE2QjtBQXBGeEQsU0FBUyxlQUFlO0lBQ3BCLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxVQUFVLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztBQUN6RSxDQUFDO0FBRUQsU0FBUywwQkFBMEI7SUFDL0IsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLFVBQVUsRUFBRSxtQkFBbUIsQ0FBQyxDQUFDO0FBQzNFLENBQUM7QUFFRCxTQUFTLGlCQUFpQjtJQUN0QixNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLGVBQWUsRUFBRSxDQUFDLENBQUM7SUFDcEQsSUFBSSxDQUFDLEVB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SyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3RDLFNBQVM7UUFDVCxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQzdELE1BQU0sSUFBSSxLQUFLLENBQUMsOEJBQThCLENBQUMsQ0FBQztRQUNwRCxDQUFDO1FBQ0QsT0FBTyxNQUFNLENBQUM7SUFDbEIsQ0FBQztJQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7UUFDVCxZQUFNLENBQUMsS0FBSyxDQUFDLHFDQUFxQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3ZELE1BQU0sSUFBSSxLQUFLLENBQUMsZ0RBQWdELENBQUMsQ0FBQztJQUN0RSxDQUFDO0FBQ0wsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgeyBNQ1BTZXJ2ZXJTZXR0aW5ncywgVG9vbE1hbmFnZXJTZXR0aW5ncywgVG9vbENvbmZpZ3VyYXRpb24sIFRvb2xDb25maWcgfSBmcm9tICcuL3R5cGVzJztcbmltcG9ydCB7IGxvZ2dlciB9IGZyb20gJy4vbGliL2xvZyc7XG5cbmNvbnN0IERFRkFVTFRfU0VUVElOR1M6IE1DUFNlcnZlclNldHRpbmdzID0ge1xuICAgIHBvcnQ6IDMwMDAsXG4gICAgYXV0b1N0YXJ0OiBmYWxzZSxcbiAgICBlbmFibGVEZWJ1Z0xvZzogZmFsc2UsXG4gICAgYWxsb3dlZE9yaWdpbnM6IFsnKiddLFxuICAgIG1heENvbm5lY3Rpb25zOiAxMCxcbiAgICBlbmFibGVFZGl0b3JDb250ZXh0RXZhbDogZmFsc2UsXG4gICAgZW5hYmxlU2NlbmVMb2dDYXB0dXJlOiB0cnVlXG59O1xuXG5jb25zdCBERUZBVUxUX1RPT0xfTUFOQUdFUl9TRVRUSU5HUzogVG9vbE1hbmFnZXJTZXR0aW5ncyA9IHtcbiAgICBjb25maWd1cmF0aW9uczogW10sXG4gICAgY3VycmVudENvbmZpZ0lkOiAnJyxcbiAgICBtYXhDb25maWdTbG90czogNVxufTtcblxuZnVuY3Rpb24gZ2V0U2V0dGluZ3NQYXRoKCk6IHN0cmluZyB7XG4gICAgcmV0dXJuIHBhdGguam9pbihFZGl0b3IuUHJvamVjdC5wYXRoLCAnc2V0dGluZ3MnLCAnbWNwLXNlcnZlci5qc29uJyk7XG59XG5cbmZ1bmN0aW9uIGdldFRvb2xNYW5hZ2VyU2V0dGluZ3NQYXRoKCk6IHN0cmluZyB7XG4gICAgcmV0dXJuIHBhdGguam9pbihFZGl0b3IuUHJvamVjdC5wYXRoLCAnc2V0dGluZ3MnLCAndG9vbC1tYW5hZ2VyLmpzb24nKTtcbn1cblxuZnVuY3Rpb24gZW5zdXJlU2V0dGluZ3NEaXIoKTogdm9pZCB7XG4gICAgY29uc3Qgc2V0dGluZ3NEaXIgPSBwYXRoLmRpcm5hbWUoZ2V0U2V0dGluZ3NQYXRoKCkpO1xuICAgIGlmICghZnMuZXhpc3RzU3luYyhzZXR0aW5nc0RpcikpIHtcbiAgICAgICAgZnMubWtkaXJTeW5jKHNldHRpbmdzRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWFkU2V0dGluZ3MoKTogTUNQU2VydmVyU2V0dGluZ3Mge1xuICAgIHRyeSB7XG4gICAgICAgIGVuc3VyZVNldHRpbmdzRGlyKCk7XG4gICAgICAgIGNvbnN0IHNldHRpbmdzRmlsZSA9IGdldFNldHRpbmdzUGF0aCgpO1xuICAgICAgICBpZiAoZnMuZXhpc3RzU3luYyhzZXR0aW5nc0ZpbGUpKSB7XG4gICAgICAgICAgICBjb25zdCBjb250ZW50ID0gZnMucmVhZEZpbGVTeW5jKHNldHRpbmdzRmlsZSwgJ3V0ZjgnKTtcbiAgICAgICAgICAgIHJldHVybiB7IC4uLkRFRkFVTFRfU0VUVElOR1MsIC4uLkpTT04ucGFyc2UoY29udGVudCkgfTtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKCdGYWlsZWQgdG8gcmVhZCBzZXR0aW5nczonLCBlKTtcbiAgICB9XG4gICAgcmV0dXJuIERFRkFVTFRfU0VUVElOR1M7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzYXZlU2V0dGluZ3Moc2V0dGluZ3M6IE1DUFNlcnZlclNldHRpbmdzKTogdm9pZCB7XG4gICAgdHJ5IHtcbiAgICAgICAgZW5zdXJlU2V0dGluZ3NEaXIoKTtcbiAgICAgICAgY29uc3Qgc2V0dGluZ3NGaWxlID0gZ2V0U2V0dGluZ3NQYXRoKCk7XG4gICAgICAgIGZzLndyaXRlRmlsZVN5bmMoc2V0dGluZ3NGaWxlLCBKU09OLnN0cmluZ2lmeShzZXR0aW5ncywgbnVsbCwgMikpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKCdGYWlsZWQgdG8gc2F2ZSBzZXR0aW5nczonLCBlKTtcbiAgICAgICAgdGhyb3cgZTtcbiAgICB9XG59XG5cbi8vIOW3peWFt+euoeeQhuWZqOioree9ruebuOmXnOWHveaVuFxuZXhwb3J0IGZ1bmN0aW9uIHJlYWRUb29sTWFuYWdlclNldHRpbmdzKCk6IFRvb2xNYW5hZ2VyU2V0dGluZ3Mge1xuICAgIHRyeSB7XG4gICAgICAgIGVuc3VyZVNldHRpbmdzRGlyKCk7XG4gICAgICAgIGNvbnN0IHNldHRpbmdzRmlsZSA9IGdldFRvb2xNYW5hZ2VyU2V0dGluZ3NQYXRoKCk7XG4gICAgICAgIGlmIChmcy5leGlzdHNTeW5jKHNldHRpbmdzRmlsZSkpIHtcbiAgICAgICAgICAgIGNvbnN0IGNvbnRlbnQgPSBmcy5yZWFkRmlsZVN5bmMoc2V0dGluZ3NGaWxlLCAndXRmOCcpO1xuICAgICAgICAgICAgcmV0dXJuIHsgLi4uREVGQVVMVF9UT09MX01BTkFHRVJfU0VUVElOR1MsIC4uLkpTT04ucGFyc2UoY29udGVudCkgfTtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKCdGYWlsZWQgdG8gcmVhZCB0b29sIG1hbmFnZXIgc2V0dGluZ3M6JywgZSk7XG4gICAgfVxuICAgIHJldHVybiBERUZBVUxUX1RPT0xfTUFOQUdFUl9TRVRUSU5HUztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNhdmVUb29sTWFuYWdlclNldHRpbmdzKHNldHRpbmdzOiBUb29sTWFuYWdlclNldHRpbmdzKTogdm9pZCB7XG4gICAgdHJ5IHtcbiAgICAgICAgZW5zdXJlU2V0dGluZ3NEaXIoKTtcbiAgICAgICAgY29uc3Qgc2V0dGluZ3NGaWxlID0gZ2V0VG9vbE1hbmFnZXJTZXR0aW5nc1BhdGgoKTtcbiAgICAgICAgZnMud3JpdGVGaWxlU3luYyhzZXR0aW5nc0ZpbGUsIEpTT04uc3RyaW5naWZ5KHNldHRpbmdzLCBudWxsLCAyKSk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBsb2dnZXIuZXJyb3IoJ0ZhaWxlZCB0byBzYXZlIHRvb2wgbWFuYWdlciBzZXR0aW5nczonLCBlKTtcbiAgICAgICAgdGhyb3cgZTtcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleHBvcnRUb29sQ29uZmlndXJhdGlvbihjb25maWc6IFRvb2xDb25maWd1cmF0aW9uKTogc3RyaW5nIHtcbiAgICByZXR1cm4gSlNPTi5zdHJpbmdpZnkoY29uZmlnLCBudWxsLCAyKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGltcG9ydFRvb2xDb25maWd1cmF0aW9uKGNvbmZpZ0pzb246IHN0cmluZyk6IFRvb2xDb25maWd1cmF0aW9uIHtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCBjb25maWcgPSBKU09OLnBhcnNlKGNvbmZpZ0pzb24pO1xuICAgICAgICAvLyDpqZforYnphY3nva7moLzlvI9cbiAgICAgICAgaWYgKCFjb25maWcuaWQgfHwgIWNvbmZpZy5uYW1lIHx8ICFBcnJheS5pc0FycmF5KGNvbmZpZy50b29scykpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBjb25maWd1cmF0aW9uIGZvcm1hdCcpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBjb25maWc7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBsb2dnZXIuZXJyb3IoJ0ZhaWxlZCB0byBwYXJzZSB0b29sIGNvbmZpZ3VyYXRpb246JywgZSk7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBKU09OIGZvcm1hdCBvciBjb25maWd1cmF0aW9uIHN0cnVjdHVyZScpO1xuICAgIH1cbn1cblxuZXhwb3J0IHsgREVGQVVMVF9TRVRUSU5HUywgREVGQVVMVF9UT09MX01BTkFHRVJfU0VUVElOR1MgfTsiXX0=