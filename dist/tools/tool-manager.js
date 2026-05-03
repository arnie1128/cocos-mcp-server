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
exports.ToolManager = void 0;
const uuid_1 = require("uuid");
const log_1 = require("../lib/log");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class ToolManager {
    constructor(registry) {
        this.availableTools = [];
        this.settings = this.readToolManagerSettings();
        this.initializeAvailableTools(registry);
        // 如果沒有配置，自動創建一個默認配置
        if (this.settings.configurations.length === 0) {
            (0, log_1.debugLog)('[ToolManager] No configurations found, creating default configuration...');
            this.createConfiguration('默認配置', '自動創建的默認工具配置');
        }
        else {
            this.reconcileConfigurationsWithRegistry();
        }
    }
    /**
     * Add tools that exist in the live registry but not in a saved
     * configuration (defaults to enabled), and drop tools whose name no
     * longer appears in the registry. This runs once per startup so the
     * panel reflects what the build actually exposes after upgrades.
     */
    reconcileConfigurationsWithRegistry() {
        const registryKey = (t) => `${t.category}::${t.name}`;
        const registryIndex = new Map(this.availableTools.map(t => [registryKey(t), t]));
        let anyMutated = false;
        for (const config of this.settings.configurations) {
            let configMutated = false;
            const seen = new Set();
            const kept = [];
            for (const tool of config.tools) {
                const k = registryKey(tool);
                if (registryIndex.has(k)) {
                    seen.add(k);
                    kept.push(tool);
                }
                else {
                    (0, log_1.debugLog)(`[ToolManager] Dropping stale tool from config '${config.name}': ${k}`);
                    configMutated = true;
                }
            }
            for (const [k, tool] of registryIndex) {
                if (!seen.has(k)) {
                    kept.push(Object.assign({}, tool));
                    (0, log_1.debugLog)(`[ToolManager] Adding new tool to config '${config.name}': ${k}`);
                    configMutated = true;
                }
            }
            if (configMutated) {
                config.tools = kept;
                config.updatedAt = new Date().toISOString();
                anyMutated = true;
            }
        }
        if (anyMutated) {
            this.saveSettings();
            (0, log_1.debugLog)('[ToolManager] Reconciled saved configurations with current registry');
        }
    }
    getToolManagerSettingsPath() {
        return path.join(Editor.Project.path, 'settings', 'tool-manager.json');
    }
    ensureSettingsDir() {
        const settingsDir = path.dirname(this.getToolManagerSettingsPath());
        if (!fs.existsSync(settingsDir)) {
            fs.mkdirSync(settingsDir, { recursive: true });
        }
    }
    readToolManagerSettings() {
        const DEFAULT_TOOL_MANAGER_SETTINGS = {
            configurations: [],
            currentConfigId: '',
            maxConfigSlots: 5
        };
        try {
            this.ensureSettingsDir();
            const settingsFile = this.getToolManagerSettingsPath();
            if (fs.existsSync(settingsFile)) {
                const content = fs.readFileSync(settingsFile, 'utf8');
                return Object.assign(Object.assign({}, DEFAULT_TOOL_MANAGER_SETTINGS), JSON.parse(content));
            }
        }
        catch (e) {
            console.error('Failed to read tool manager settings:', e);
        }
        return DEFAULT_TOOL_MANAGER_SETTINGS;
    }
    saveToolManagerSettings(settings) {
        try {
            this.ensureSettingsDir();
            const settingsFile = this.getToolManagerSettingsPath();
            fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
        }
        catch (e) {
            console.error('Failed to save tool manager settings:', e);
            throw e;
        }
    }
    exportToolConfiguration(config) {
        return JSON.stringify(config, null, 2);
    }
    importToolConfiguration(configJson) {
        try {
            const config = JSON.parse(configJson);
            // 驗證配置格式
            if (!config.id || !config.name || !Array.isArray(config.tools)) {
                throw new Error('Invalid configuration format');
            }
            return config;
        }
        catch (e) {
            console.error('Failed to parse tool configuration:', e);
            throw new Error('Invalid JSON format or configuration structure');
        }
    }
    initializeAvailableTools(registry) {
        this.availableTools = [];
        for (const [category, toolSet] of Object.entries(registry)) {
            for (const tool of toolSet.getTools()) {
                this.availableTools.push({
                    category,
                    name: tool.name,
                    enabled: true, // 默認啟用
                    description: tool.description,
                });
            }
        }
        (0, log_1.debugLog)(`[ToolManager] Initialized ${this.availableTools.length} tools from shared registry`);
    }
    getAvailableTools() {
        return [...this.availableTools];
    }
    getConfigurations() {
        return [...this.settings.configurations];
    }
    getCurrentConfiguration() {
        if (!this.settings.currentConfigId) {
            return null;
        }
        return this.settings.configurations.find(config => config.id === this.settings.currentConfigId) || null;
    }
    createConfiguration(name, description) {
        if (this.settings.configurations.length >= this.settings.maxConfigSlots) {
            throw new Error(`已達到最大配置槽位數量 (${this.settings.maxConfigSlots})`);
        }
        const config = {
            id: (0, uuid_1.v4)(),
            name,
            description,
            tools: this.availableTools.map(tool => (Object.assign({}, tool))),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        this.settings.configurations.push(config);
        this.settings.currentConfigId = config.id;
        this.saveSettings();
        return config;
    }
    updateConfiguration(configId, updates) {
        const configIndex = this.settings.configurations.findIndex(config => config.id === configId);
        if (configIndex === -1) {
            throw new Error('配置不存在');
        }
        const config = this.settings.configurations[configIndex];
        const updatedConfig = Object.assign(Object.assign(Object.assign({}, config), updates), { updatedAt: new Date().toISOString() });
        this.settings.configurations[configIndex] = updatedConfig;
        this.saveSettings();
        return updatedConfig;
    }
    deleteConfiguration(configId) {
        const configIndex = this.settings.configurations.findIndex(config => config.id === configId);
        if (configIndex === -1) {
            throw new Error('配置不存在');
        }
        this.settings.configurations.splice(configIndex, 1);
        // 如果刪除的是當前配置，清空當前配置ID
        if (this.settings.currentConfigId === configId) {
            this.settings.currentConfigId = this.settings.configurations.length > 0
                ? this.settings.configurations[0].id
                : '';
        }
        this.saveSettings();
    }
    setCurrentConfiguration(configId) {
        const config = this.settings.configurations.find(config => config.id === configId);
        if (!config) {
            throw new Error('配置不存在');
        }
        this.settings.currentConfigId = configId;
        this.saveSettings();
    }
    updateToolStatus(configId, category, toolName, enabled) {
        (0, log_1.debugLog)(`Backend: Updating tool status - configId: ${configId}, category: ${category}, toolName: ${toolName}, enabled: ${enabled}`);
        const config = this.settings.configurations.find(config => config.id === configId);
        if (!config) {
            console.error(`Backend: Config not found with ID: ${configId}`);
            throw new Error('配置不存在');
        }
        (0, log_1.debugLog)(`Backend: Found config: ${config.name}`);
        const tool = config.tools.find(t => t.category === category && t.name === toolName);
        if (!tool) {
            console.error(`Backend: Tool not found - category: ${category}, name: ${toolName}`);
            throw new Error('工具不存在');
        }
        (0, log_1.debugLog)(`Backend: Found tool: ${tool.name}, current enabled: ${tool.enabled}, new enabled: ${enabled}`);
        tool.enabled = enabled;
        config.updatedAt = new Date().toISOString();
        (0, log_1.debugLog)(`Backend: Tool updated, saving settings...`);
        this.saveSettings();
        (0, log_1.debugLog)(`Backend: Settings saved successfully`);
    }
    updateToolStatusBatch(configId, updates) {
        (0, log_1.debugLog)(`Backend: updateToolStatusBatch called with configId: ${configId}`);
        (0, log_1.debugLog)(`Backend: Current configurations count: ${this.settings.configurations.length}`);
        (0, log_1.debugLog)(`Backend: Current config IDs:`, this.settings.configurations.map(c => c.id));
        const config = this.settings.configurations.find(config => config.id === configId);
        if (!config) {
            console.error(`Backend: Config not found with ID: ${configId}`);
            console.error(`Backend: Available config IDs:`, this.settings.configurations.map(c => c.id));
            throw new Error('配置不存在');
        }
        (0, log_1.debugLog)(`Backend: Found config: ${config.name}, updating ${updates.length} tools`);
        updates.forEach(update => {
            const tool = config.tools.find(t => t.category === update.category && t.name === update.name);
            if (tool) {
                tool.enabled = update.enabled;
            }
        });
        config.updatedAt = new Date().toISOString();
        this.saveSettings();
        (0, log_1.debugLog)(`Backend: Batch update completed successfully`);
    }
    exportConfiguration(configId) {
        const config = this.settings.configurations.find(config => config.id === configId);
        if (!config) {
            throw new Error('配置不存在');
        }
        return this.exportToolConfiguration(config);
    }
    importConfiguration(configJson) {
        const config = this.importToolConfiguration(configJson);
        // 生成新的ID和時間戳
        config.id = (0, uuid_1.v4)();
        config.createdAt = new Date().toISOString();
        config.updatedAt = new Date().toISOString();
        if (this.settings.configurations.length >= this.settings.maxConfigSlots) {
            throw new Error(`已達到最大配置槽位數量 (${this.settings.maxConfigSlots})`);
        }
        this.settings.configurations.push(config);
        this.saveSettings();
        return config;
    }
    getEnabledTools() {
        const currentConfig = this.getCurrentConfiguration();
        if (!currentConfig) {
            return this.availableTools.filter(tool => tool.enabled);
        }
        return currentConfig.tools.filter(tool => tool.enabled);
    }
    applyProfile(profile) {
        if (profile !== 'core' && profile !== 'full') {
            throw new Error(`Invalid profile '${profile}'. Expected 'core' or 'full'.`);
        }
        const currentConfig = this.getCurrentConfiguration();
        if (!currentConfig)
            throw new Error('沒有當前配置');
        const updates = currentConfig.tools.map(tool => {
            var _a;
            return ({
                category: tool.category,
                name: tool.name,
                enabled: profile === 'full' || !((_a = tool.description) === null || _a === void 0 ? void 0 : _a.includes('[specialist]')),
            });
        });
        this.updateToolStatusBatch(currentConfig.id, updates);
    }
    getToolManagerState() {
        const currentConfig = this.getCurrentConfiguration();
        return {
            success: true,
            availableTools: currentConfig ? currentConfig.tools : this.getAvailableTools(),
            selectedConfigId: this.settings.currentConfigId,
            configurations: this.getConfigurations(),
            maxConfigSlots: this.settings.maxConfigSlots
        };
    }
    saveSettings() {
        (0, log_1.debugLog)(`Backend: Saving settings, current configs count: ${this.settings.configurations.length}`);
        this.saveToolManagerSettings(this.settings);
        (0, log_1.debugLog)(`Backend: Settings saved to file`);
    }
}
exports.ToolManager = ToolManager;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG9vbC1tYW5hZ2VyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL3Rvb2xzL3Rvb2wtbWFuYWdlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSwrQkFBb0M7QUFFcEMsb0NBQXNDO0FBRXRDLHVDQUF5QjtBQUN6QiwyQ0FBNkI7QUFFN0IsTUFBYSxXQUFXO0lBSXBCLFlBQVksUUFBc0I7UUFGMUIsbUJBQWMsR0FBaUIsRUFBRSxDQUFDO1FBR3RDLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDLHVCQUF1QixFQUFFLENBQUM7UUFDL0MsSUFBSSxDQUFDLHdCQUF3QixDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBRXhDLG9CQUFvQjtRQUNwQixJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUM1QyxJQUFBLGNBQVEsRUFBQywwRUFBMEUsQ0FBQyxDQUFDO1lBQ3JGLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxNQUFNLEVBQUUsYUFBYSxDQUFDLENBQUM7UUFDcEQsQ0FBQzthQUFNLENBQUM7WUFDSixJQUFJLENBQUMsbUNBQW1DLEVBQUUsQ0FBQztRQUMvQyxDQUFDO0lBQ0wsQ0FBQztJQUVEOzs7OztPQUtHO0lBQ0ssbUNBQW1DO1FBQ3ZDLE1BQU0sV0FBVyxHQUFHLENBQUMsQ0FBcUMsRUFBRSxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsUUFBUSxLQUFLLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUMxRixNQUFNLGFBQWEsR0FBRyxJQUFJLEdBQUcsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVqRixJQUFJLFVBQVUsR0FBRyxL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QixFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsZUFBZTtZQUMvQyxjQUFjLEVBQUUsSUFBSSxDQUFDLGlCQUFpQixFQUFFO1lBQ3hDLGNBQWMsRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLGNBQWM7U0FDL0MsQ0FBQztJQUNOLENBQUM7SUFFTyxZQUFZO1FBQ2hCLElBQUEsY0FBUSxFQUFDLG9EQUFvRCxJQUFJLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO1FBQ3BHLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDNUMsSUFBQSxjQUFRLEVBQUMsaUNBQWlDLENBQUMsQ0FBQztJQUNoRCxDQUFDO0NBQ0o7QUFsVkQsa0NBa1ZDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgdjQgYXMgdXVpZHY0IH0gZnJvbSAndXVpZCc7XG5pbXBvcnQgeyBUb29sQ29uZmlnLCBUb29sQ29uZmlndXJhdGlvbiwgVG9vbE1hbmFnZXJTZXR0aW5ncyB9IGZyb20gJy4uL3R5cGVzJztcbmltcG9ydCB7IGRlYnVnTG9nIH0gZnJvbSAnLi4vbGliL2xvZyc7XG5pbXBvcnQgeyBUb29sUmVnaXN0cnkgfSBmcm9tICcuL3JlZ2lzdHJ5JztcbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5cbmV4cG9ydCBjbGFzcyBUb29sTWFuYWdlciB7XG4gICAgcHJpdmF0ZSBzZXR0aW5nczogVG9vbE1hbmFnZXJTZXR0aW5ncztcbiAgICBwcml2YXRlIGF2YWlsYWJsZVRvb2xzOiBUb29sQ29uZmlnW10gPSBbXTtcblxuICAgIGNvbnN0cnVjdG9yKHJlZ2lzdHJ5OiBUb29sUmVnaXN0cnkpIHtcbiAgICAgICAgdGhpcy5zZXR0aW5ncyA9IHRoaXMucmVhZFRvb2xNYW5hZ2VyU2V0dGluZ3MoKTtcbiAgICAgICAgdGhpcy5pbml0aWFsaXplQXZhaWxhYmxlVG9vbHMocmVnaXN0cnkpO1xuXG4gICAgICAgIC8vIOWmguaenOaykuaciemFjee9ru+8jOiHquWLleWJteW7uuS4gOWAi+m7mOiqjemFjee9rlxuICAgICAgICBpZiAodGhpcy5zZXR0aW5ncy5jb25maWd1cmF0aW9ucy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIGRlYnVnTG9nKCdbVG9vbE1hbmFnZXJdIE5vIGNvbmZpZ3VyYXRpb25zIGZvdW5kLCBjcmVhdGluZyBkZWZhdWx0IGNvbmZpZ3VyYXRpb24uLi4nKTtcbiAgICAgICAgICAgIHRoaXMuY3JlYXRlQ29uZmlndXJhdGlvbign6buY6KqN6YWN572uJywgJ+iHquWLleWJteW7uueahOm7mOiqjeW3peWFt+mFjee9ricpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5yZWNvbmNpbGVDb25maWd1cmF0aW9uc1dpdGhSZWdpc3RyeSgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQWRkIHRvb2xzIHRoYXQgZXhpc3QgaW4gdGhlIGxpdmUgcmVnaXN0cnkgYnV0IG5vdCBpbiBhIHNhdmVkXG4gICAgICogY29uZmlndXJhdGlvbiAoZGVmYXVsdHMgdG8gZW5hYmxlZCksIGFuZCBkcm9wIHRvb2xzIHdob3NlIG5hbWUgbm9cbiAgICAgKiBsb25nZXIgYXBwZWFycyBpbiB0aGUgcmVnaXN0cnkuIFRoaXMgcnVucyBvbmNlIHBlciBzdGFydHVwIHNvIHRoZVxuICAgICAqIHBhbmVsIHJlZmxlY3RzIHdoYXQgdGhlIGJ1aWxkIGFjdHVhbGx5IGV4cG9zZXMgYWZ0ZXIgdXBncmFkZXMuXG4gICAgICovXG4gICAgcHJpdmF0ZSByZWNvbmNpbGVDb25maWd1cmF0aW9uc1dpdGhSZWdpc3RyeSgpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgcmVnaXN0cnlLZXkgPSAodDogeyBjYXRlZ29yeTogc3RyaW5nOyBuYW1lOiBzdHJpbmcgfSkgPT4gYCR7dC5jYXRlZ29yeX06OiR7dC5uYW1lfWA7XG4gICAgICAgIGNvbnN0IHJlZ2lzdHJ5SW5kZXggPSBuZXcgTWFwKHRoaXMuYXZhaWxhYmxlVG9vbHMubWFwKHQgPT4gW3JlZ2lzdHJ5S2V5KHQpLCB0XSkpO1xuXG4gICAgICAgIGxldCBhbnlNdXRhdGVkID0gZmFsc2U7XG4gICAgICAgIGZvciAoY29uc3QgY29uZmlnIG9mIHRoaXMuc2V0dGluZ3MuY29uZmlndXJhdGlvbnMpIHtcbiAgICAgICAgICAgIGxldCBjb25maWdNdXRhdGVkID0gZmFsc2U7XG4gICAgICAgICAgICBjb25zdCBzZWVuID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgICAgICAgICBjb25zdCBrZXB0OiBUb29sQ29uZmlnW10gPSBbXTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgdG9vbCBvZiBjb25maWcudG9vbHMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBrID0gcmVnaXN0cnlLZXkodG9vbCk7XG4gICAgICAgICAgICAgICAgaWYgKHJlZ2lzdHJ5SW5kZXguaGFzKGspKSB7XG4gICAgICAgICAgICAgICAgICAgIHNlZW4uYWRkKGspO1xuICAgICAgICAgICAgICAgICAgICBrZXB0LnB1c2godG9vbCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgZGVidWdMb2coYFtUb29sTWFuYWdlcl0gRHJvcHBpbmcgc3RhbGUgdG9vbCBmcm9tIGNvbmZpZyAnJHtjb25maWcubmFtZX0nOiAke2t9YCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbmZpZ011dGF0ZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZvciAoY29uc3QgW2ssIHRvb2xdIG9mIHJlZ2lzdHJ5SW5kZXgpIHtcbiAgICAgICAgICAgICAgICBpZiAoIXNlZW4uaGFzKGspKSB7XG4gICAgICAgICAgICAgICAgICAgIGtlcHQucHVzaCh7IC4uLnRvb2wgfSk7XG4gICAgICAgICAgICAgICAgICAgIGRlYnVnTG9nKGBbVG9vbE1hbmFnZXJdIEFkZGluZyBuZXcgdG9vbCB0byBjb25maWcgJyR7Y29uZmlnLm5hbWV9JzogJHtrfWApO1xuICAgICAgICAgICAgICAgICAgICBjb25maWdNdXRhdGVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoY29uZmlnTXV0YXRlZCkge1xuICAgICAgICAgICAgICAgIGNvbmZpZy50b29scyA9IGtlcHQ7XG4gICAgICAgICAgICAgICAgY29uZmlnLnVwZGF0ZWRBdCA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcbiAgICAgICAgICAgICAgICBhbnlNdXRhdGVkID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoYW55TXV0YXRlZCkge1xuICAgICAgICAgICAgdGhpcy5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICAgIGRlYnVnTG9nKCdbVG9vbE1hbmFnZXJdIFJlY29uY2lsZWQgc2F2ZWQgY29uZmlndXJhdGlvbnMgd2l0aCBjdXJyZW50IHJlZ2lzdHJ5Jyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGdldFRvb2xNYW5hZ2VyU2V0dGluZ3NQYXRoKCk6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiBwYXRoLmpvaW4oRWRpdG9yLlByb2plY3QucGF0aCwgJ3NldHRpbmdzJywgJ3Rvb2wtbWFuYWdlci5qc29uJyk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBlbnN1cmVTZXR0aW5nc0RpcigpOiB2b2lkIHtcbiAgICAgICAgY29uc3Qgc2V0dGluZ3NEaXIgPSBwYXRoLmRpcm5hbWUodGhpcy5nZXRUb29sTWFuYWdlclNldHRpbmdzUGF0aCgpKTtcbiAgICAgICAgaWYgKCFmcy5leGlzdHNTeW5jKHNldHRpbmdzRGlyKSkge1xuICAgICAgICAgICAgZnMubWtkaXJTeW5jKHNldHRpbmdzRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgcmVhZFRvb2xNYW5hZ2VyU2V0dGluZ3MoKTogVG9vbE1hbmFnZXJTZXR0aW5ncyB7XG4gICAgICAgIGNvbnN0IERFRkFVTFRfVE9PTF9NQU5BR0VSX1NFVFRJTkdTOiBUb29sTWFuYWdlclNldHRpbmdzID0ge1xuICAgICAgICAgICAgY29uZmlndXJhdGlvbnM6IFtdLFxuICAgICAgICAgICAgY3VycmVudENvbmZpZ0lkOiAnJyxcbiAgICAgICAgICAgIG1heENvbmZpZ1Nsb3RzOiA1XG4gICAgICAgIH07XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHRoaXMuZW5zdXJlU2V0dGluZ3NEaXIoKTtcbiAgICAgICAgICAgIGNvbnN0IHNldHRpbmdzRmlsZSA9IHRoaXMuZ2V0VG9vbE1hbmFnZXJTZXR0aW5nc1BhdGgoKTtcbiAgICAgICAgICAgIGlmIChmcy5leGlzdHNTeW5jKHNldHRpbmdzRmlsZSkpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBjb250ZW50ID0gZnMucmVhZEZpbGVTeW5jKHNldHRpbmdzRmlsZSwgJ3V0ZjgnKTtcbiAgICAgICAgICAgICAgICByZXR1cm4geyAuLi5ERUZBVUxUX1RPT0xfTUFOQUdFUl9TRVRUSU5HUywgLi4uSlNPTi5wYXJzZShjb250ZW50KSB9O1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gcmVhZCB0b29sIG1hbmFnZXIgc2V0dGluZ3M6JywgZSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIERFRkFVTFRfVE9PTF9NQU5BR0VSX1NFVFRJTkdTO1xuICAgIH1cblxuICAgIHByaXZhdGUgc2F2ZVRvb2xNYW5hZ2VyU2V0dGluZ3Moc2V0dGluZ3M6IFRvb2xNYW5hZ2VyU2V0dGluZ3MpOiB2b2lkIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHRoaXMuZW5zdXJlU2V0dGluZ3NEaXIoKTtcbiAgICAgICAgICAgIGNvbnN0IHNldHRpbmdzRmlsZSA9IHRoaXMuZ2V0VG9vbE1hbmFnZXJTZXR0aW5nc1BhdGgoKTtcbiAgICAgICAgICAgIGZzLndyaXRlRmlsZVN5bmMoc2V0dGluZ3NGaWxlLCBKU09OLnN0cmluZ2lmeShzZXR0aW5ncywgbnVsbCwgMikpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gc2F2ZSB0b29sIG1hbmFnZXIgc2V0dGluZ3M6JywgZSk7XG4gICAgICAgICAgICB0aHJvdyBlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBleHBvcnRUb29sQ29uZmlndXJhdGlvbihjb25maWc6IFRvb2xDb25maWd1cmF0aW9uKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KGNvbmZpZywgbnVsbCwgMik7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBpbXBvcnRUb29sQ29uZmlndXJhdGlvbihjb25maWdKc29uOiBzdHJpbmcpOiBUb29sQ29uZmlndXJhdGlvbiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBjb25maWcgPSBKU09OLnBhcnNlKGNvbmZpZ0pzb24pO1xuICAgICAgICAgICAgLy8g6amX6K2J6YWN572u5qC85byPXG4gICAgICAgICAgICBpZiAoIWNvbmZpZy5pZCB8fCAhY29uZmlnLm5hbWUgfHwgIUFycmF5LmlzQXJyYXkoY29uZmlnLnRvb2xzKSkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBjb25maWd1cmF0aW9uIGZvcm1hdCcpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGNvbmZpZztcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIHBhcnNlIHRvb2wgY29uZmlndXJhdGlvbjonLCBlKTtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBKU09OIGZvcm1hdCBvciBjb25maWd1cmF0aW9uIHN0cnVjdHVyZScpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBpbml0aWFsaXplQXZhaWxhYmxlVG9vbHMocmVnaXN0cnk6IFRvb2xSZWdpc3RyeSk6IHZvaWQge1xuICAgICAgICB0aGlzLmF2YWlsYWJsZVRvb2xzID0gW107XG4gICAgICAgIGZvciAoY29uc3QgW2NhdGVnb3J5LCB0b29sU2V0XSBvZiBPYmplY3QuZW50cmllcyhyZWdpc3RyeSkpIHtcbiAgICAgICAgICAgIGZvciAoY29uc3QgdG9vbCBvZiB0b29sU2V0LmdldFRvb2xzKCkpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmF2YWlsYWJsZVRvb2xzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICBjYXRlZ29yeSxcbiAgICAgICAgICAgICAgICAgICAgbmFtZTogdG9vbC5uYW1lLFxuICAgICAgICAgICAgICAgICAgICBlbmFibGVkOiB0cnVlLCAvLyDpu5joqo3llZ/nlKhcbiAgICAgICAgICAgICAgICAgICAgZGVzY3JpcHRpb246IHRvb2wuZGVzY3JpcHRpb24sXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZGVidWdMb2coYFtUb29sTWFuYWdlcl0gSW5pdGlhbGl6ZWQgJHt0aGlzLmF2YWlsYWJsZVRvb2xzLmxlbmd0aH0gdG9vbHMgZnJvbSBzaGFyZWQgcmVnaXN0cnlgKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgZ2V0QXZhaWxhYmxlVG9vbHMoKTogVG9vbENvbmZpZ1tdIHtcbiAgICAgICAgcmV0dXJuIFsuLi50aGlzLmF2YWlsYWJsZVRvb2xzXTtcbiAgICB9XG5cbiAgICBwdWJsaWMgZ2V0Q29uZmlndXJhdGlvbnMoKTogVG9vbENvbmZpZ3VyYXRpb25bXSB7XG4gICAgICAgIHJldHVybiBbLi4udGhpcy5zZXR0aW5ncy5jb25maWd1cmF0aW9uc107XG4gICAgfVxuXG4gICAgcHVibGljIGdldEN1cnJlbnRDb25maWd1cmF0aW9uKCk6IFRvb2xDb25maWd1cmF0aW9uIHwgbnVsbCB7XG4gICAgICAgIGlmICghdGhpcy5zZXR0aW5ncy5jdXJyZW50Q29uZmlnSWQpIHtcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLnNldHRpbmdzLmNvbmZpZ3VyYXRpb25zLmZpbmQoY29uZmlnID0+IGNvbmZpZy5pZCA9PT0gdGhpcy5zZXR0aW5ncy5jdXJyZW50Q29uZmlnSWQpIHx8IG51bGw7XG4gICAgfVxuXG4gICAgcHVibGljIGNyZWF0ZUNvbmZpZ3VyYXRpb24obmFtZTogc3RyaW5nLCBkZXNjcmlwdGlvbj86IHN0cmluZyk6IFRvb2xDb25maWd1cmF0aW9uIHtcbiAgICAgICAgaWYgKHRoaXMuc2V0dGluZ3MuY29uZmlndXJhdGlvbnMubGVuZ3RoID49IHRoaXMuc2V0dGluZ3MubWF4Q29uZmlnU2xvdHMpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihg5bey6YGU5Yiw5pyA5aSn6YWN572u5qe95L2N5pW46YePICgke3RoaXMuc2V0dGluZ3MubWF4Q29uZmlnU2xvdHN9KWApO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgY29uZmlnOiBUb29sQ29uZmlndXJhdGlvbiA9IHtcbiAgICAgICAgICAgIGlkOiB1dWlkdjQoKSxcbiAgICAgICAgICAgIG5hbWUsXG4gICAgICAgICAgICBkZXNjcmlwdGlvbixcbiAgICAgICAgICAgIHRvb2xzOiB0aGlzLmF2YWlsYWJsZVRvb2xzLm1hcCh0b29sID0+ICh7IC4uLnRvb2wgfSkpLFxuICAgICAgICAgICAgY3JlYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICAgICAgICB1cGRhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKVxuICAgICAgICB9O1xuXG4gICAgICAgIHRoaXMuc2V0dGluZ3MuY29uZmlndXJhdGlvbnMucHVzaChjb25maWcpO1xuICAgICAgICB0aGlzLnNldHRpbmdzLmN1cnJlbnRDb25maWdJZCA9IGNvbmZpZy5pZDtcbiAgICAgICAgdGhpcy5zYXZlU2V0dGluZ3MoKTtcblxuICAgICAgICByZXR1cm4gY29uZmlnO1xuICAgIH1cblxuICAgIHB1YmxpYyB1cGRhdGVDb25maWd1cmF0aW9uKGNvbmZpZ0lkOiBzdHJpbmcsIHVwZGF0ZXM6IFBhcnRpYWw8VG9vbENvbmZpZ3VyYXRpb24+KTogVG9vbENvbmZpZ3VyYXRpb24ge1xuICAgICAgICBjb25zdCBjb25maWdJbmRleCA9IHRoaXMuc2V0dGluZ3MuY29uZmlndXJhdGlvbnMuZmluZEluZGV4KGNvbmZpZyA9PiBjb25maWcuaWQgPT09IGNvbmZpZ0lkKTtcbiAgICAgICAgaWYgKGNvbmZpZ0luZGV4ID09PSAtMSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCfphY3nva7kuI3lrZjlnKgnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGNvbmZpZyA9IHRoaXMuc2V0dGluZ3MuY29uZmlndXJhdGlvbnNbY29uZmlnSW5kZXhdO1xuICAgICAgICBjb25zdCB1cGRhdGVkQ29uZmlnOiBUb29sQ29uZmlndXJhdGlvbiA9IHtcbiAgICAgICAgICAgIC4uLmNvbmZpZyxcbiAgICAgICAgICAgIC4uLnVwZGF0ZXMsXG4gICAgICAgICAgICB1cGRhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKVxuICAgICAgICB9O1xuXG4gICAgICAgIHRoaXMuc2V0dGluZ3MuY29uZmlndXJhdGlvbnNbY29uZmlnSW5kZXhdID0gdXBkYXRlZENvbmZpZztcbiAgICAgICAgdGhpcy5zYXZlU2V0dGluZ3MoKTtcblxuICAgICAgICByZXR1cm4gdXBkYXRlZENvbmZpZztcbiAgICB9XG5cbiAgICBwdWJsaWMgZGVsZXRlQ29uZmlndXJhdGlvbihjb25maWdJZDogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGNvbmZpZ0luZGV4ID0gdGhpcy5zZXR0aW5ncy5jb25maWd1cmF0aW9ucy5maW5kSW5kZXgoY29uZmlnID0+IGNvbmZpZy5pZCA9PT0gY29uZmlnSWQpO1xuICAgICAgICBpZiAoY29uZmlnSW5kZXggPT09IC0xKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ+mFjee9ruS4jeWtmOWcqCcpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5zZXR0aW5ncy5jb25maWd1cmF0aW9ucy5zcGxpY2UoY29uZmlnSW5kZXgsIDEpO1xuICAgICAgICBcbiAgICAgICAgLy8g5aaC5p6c5Yiq6Zmk55qE5piv55W25YmN6YWN572u77yM5riF56m655W25YmN6YWN572uSURcbiAgICAgICAgaWYgKHRoaXMuc2V0dGluZ3MuY3VycmVudENvbmZpZ0lkID09PSBjb25maWdJZCkge1xuICAgICAgICAgICAgdGhpcy5zZXR0aW5ncy5jdXJyZW50Q29uZmlnSWQgPSB0aGlzLnNldHRpbmdzLmNvbmZpZ3VyYXRpb25zLmxlbmd0aCA+IDAgXG4gICAgICAgICAgICAgICAgPyB0aGlzLnNldHRpbmdzLmNvbmZpZ3VyYXRpb25zWzBdLmlkIFxuICAgICAgICAgICAgICAgIDogJyc7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnNhdmVTZXR0aW5ncygpO1xuICAgIH1cblxuICAgIHB1YmxpYyBzZXRDdXJyZW50Q29uZmlndXJhdGlvbihjb25maWdJZDogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGNvbmZpZyA9IHRoaXMuc2V0dGluZ3MuY29uZmlndXJhdGlvbnMuZmluZChjb25maWcgPT4gY29uZmlnLmlkID09PSBjb25maWdJZCk7XG4gICAgICAgIGlmICghY29uZmlnKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ+mFjee9ruS4jeWtmOWcqCcpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5zZXR0aW5ncy5jdXJyZW50Q29uZmlnSWQgPSBjb25maWdJZDtcbiAgICAgICAgdGhpcy5zYXZlU2V0dGluZ3MoKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgdXBkYXRlVG9vbFN0YXR1cyhjb25maWdJZDogc3RyaW5nLCBjYXRlZ29yeTogc3RyaW5nLCB0b29sTmFtZTogc3RyaW5nLCBlbmFibGVkOiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIGRlYnVnTG9nKGBCYWNrZW5kOiBVcGRhdGluZyB0b29sIHN0YXR1cyAtIGNvbmZpZ0lkOiAke2NvbmZpZ0lkfSwgY2F0ZWdvcnk6ICR7Y2F0ZWdvcnl9LCB0b29sTmFtZTogJHt0b29sTmFtZX0sIGVuYWJsZWQ6ICR7ZW5hYmxlZH1gKTtcbiAgICAgICAgXG4gICAgICAgIGNvbnN0IGNvbmZpZyA9IHRoaXMuc2V0dGluZ3MuY29uZmlndXJhdGlvbnMuZmluZChjb25maWcgPT4gY29uZmlnLmlkID09PSBjb25maWdJZCk7XG4gICAgICAgIGlmICghY29uZmlnKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKGBCYWNrZW5kOiBDb25maWcgbm90IGZvdW5kIHdpdGggSUQ6ICR7Y29uZmlnSWR9YCk7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ+mFjee9ruS4jeWtmOWcqCcpO1xuICAgICAgICB9XG5cbiAgICAgICAgZGVidWdMb2coYEJhY2tlbmQ6IEZvdW5kIGNvbmZpZzogJHtjb25maWcubmFtZX1gKTtcblxuICAgICAgICBjb25zdCB0b29sID0gY29uZmlnLnRvb2xzLmZpbmQodCA9PiB0LmNhdGVnb3J5ID09PSBjYXRlZ29yeSAmJiB0Lm5hbWUgPT09IHRvb2xOYW1lKTtcbiAgICAgICAgaWYgKCF0b29sKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKGBCYWNrZW5kOiBUb29sIG5vdCBmb3VuZCAtIGNhdGVnb3J5OiAke2NhdGVnb3J5fSwgbmFtZTogJHt0b29sTmFtZX1gKTtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcign5bel5YW35LiN5a2Y5ZyoJyk7XG4gICAgICAgIH1cblxuICAgICAgICBkZWJ1Z0xvZyhgQmFja2VuZDogRm91bmQgdG9vbDogJHt0b29sLm5hbWV9LCBjdXJyZW50IGVuYWJsZWQ6ICR7dG9vbC5lbmFibGVkfSwgbmV3IGVuYWJsZWQ6ICR7ZW5hYmxlZH1gKTtcbiAgICAgICAgXG4gICAgICAgIHRvb2wuZW5hYmxlZCA9IGVuYWJsZWQ7XG4gICAgICAgIGNvbmZpZy51cGRhdGVkQXQgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XG4gICAgICAgIFxuICAgICAgICBkZWJ1Z0xvZyhgQmFja2VuZDogVG9vbCB1cGRhdGVkLCBzYXZpbmcgc2V0dGluZ3MuLi5gKTtcbiAgICAgICAgdGhpcy5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgZGVidWdMb2coYEJhY2tlbmQ6IFNldHRpbmdzIHNhdmVkIHN1Y2Nlc3NmdWxseWApO1xuICAgIH1cblxuICAgIHB1YmxpYyB1cGRhdGVUb29sU3RhdHVzQmF0Y2goY29uZmlnSWQ6IHN0cmluZywgdXBkYXRlczogeyBjYXRlZ29yeTogc3RyaW5nOyBuYW1lOiBzdHJpbmc7IGVuYWJsZWQ6IGJvb2xlYW4gfVtdKTogdm9pZCB7XG4gICAgICAgIGRlYnVnTG9nKGBCYWNrZW5kOiB1cGRhdGVUb29sU3RhdHVzQmF0Y2ggY2FsbGVkIHdpdGggY29uZmlnSWQ6ICR7Y29uZmlnSWR9YCk7XG4gICAgICAgIGRlYnVnTG9nKGBCYWNrZW5kOiBDdXJyZW50IGNvbmZpZ3VyYXRpb25zIGNvdW50OiAke3RoaXMuc2V0dGluZ3MuY29uZmlndXJhdGlvbnMubGVuZ3RofWApO1xuICAgICAgICBkZWJ1Z0xvZyhgQmFja2VuZDogQ3VycmVudCBjb25maWcgSURzOmAsIHRoaXMuc2V0dGluZ3MuY29uZmlndXJhdGlvbnMubWFwKGMgPT4gYy5pZCkpO1xuICAgICAgICBcbiAgICAgICAgY29uc3QgY29uZmlnID0gdGhpcy5zZXR0aW5ncy5jb25maWd1cmF0aW9ucy5maW5kKGNvbmZpZyA9PiBjb25maWcuaWQgPT09IGNvbmZpZ0lkKTtcbiAgICAgICAgaWYgKCFjb25maWcpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEJhY2tlbmQ6IENvbmZpZyBub3QgZm91bmQgd2l0aCBJRDogJHtjb25maWdJZH1gKTtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEJhY2tlbmQ6IEF2YWlsYWJsZSBjb25maWcgSURzOmAsIHRoaXMuc2V0dGluZ3MuY29uZmlndXJhdGlvbnMubWFwKGMgPT4gYy5pZCkpO1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCfphY3nva7kuI3lrZjlnKgnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGRlYnVnTG9nKGBCYWNrZW5kOiBGb3VuZCBjb25maWc6ICR7Y29uZmlnLm5hbWV9LCB1cGRhdGluZyAke3VwZGF0ZXMubGVuZ3RofSB0b29sc2ApO1xuXG4gICAgICAgIHVwZGF0ZXMuZm9yRWFjaCh1cGRhdGUgPT4ge1xuICAgICAgICAgICAgY29uc3QgdG9vbCA9IGNvbmZpZy50b29scy5maW5kKHQgPT4gdC5jYXRlZ29yeSA9PT0gdXBkYXRlLmNhdGVnb3J5ICYmIHQubmFtZSA9PT0gdXBkYXRlLm5hbWUpO1xuICAgICAgICAgICAgaWYgKHRvb2wpIHtcbiAgICAgICAgICAgICAgICB0b29sLmVuYWJsZWQgPSB1cGRhdGUuZW5hYmxlZDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uZmlnLnVwZGF0ZWRBdCA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcbiAgICAgICAgdGhpcy5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgZGVidWdMb2coYEJhY2tlbmQ6IEJhdGNoIHVwZGF0ZSBjb21wbGV0ZWQgc3VjY2Vzc2Z1bGx5YCk7XG4gICAgfVxuXG4gICAgcHVibGljIGV4cG9ydENvbmZpZ3VyYXRpb24oY29uZmlnSWQ6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgICAgIGNvbnN0IGNvbmZpZyA9IHRoaXMuc2V0dGluZ3MuY29uZmlndXJhdGlvbnMuZmluZChjb25maWcgPT4gY29uZmlnLmlkID09PSBjb25maWdJZCk7XG4gICAgICAgIGlmICghY29uZmlnKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ+mFjee9ruS4jeWtmOWcqCcpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHRoaXMuZXhwb3J0VG9vbENvbmZpZ3VyYXRpb24oY29uZmlnKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgaW1wb3J0Q29uZmlndXJhdGlvbihjb25maWdKc29uOiBzdHJpbmcpOiBUb29sQ29uZmlndXJhdGlvbiB7XG4gICAgICAgIGNvbnN0IGNvbmZpZyA9IHRoaXMuaW1wb3J0VG9vbENvbmZpZ3VyYXRpb24oY29uZmlnSnNvbik7XG4gICAgICAgIFxuICAgICAgICAvLyDnlJ/miJDmlrDnmoRJROWSjOaZgumWk+aIs1xuICAgICAgICBjb25maWcuaWQgPSB1dWlkdjQoKTtcbiAgICAgICAgY29uZmlnLmNyZWF0ZWRBdCA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcbiAgICAgICAgY29uZmlnLnVwZGF0ZWRBdCA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcblxuICAgICAgICBpZiAodGhpcy5zZXR0aW5ncy5jb25maWd1cmF0aW9ucy5sZW5ndGggPj0gdGhpcy5zZXR0aW5ncy5tYXhDb25maWdTbG90cykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGDlt7LpgZTliLDmnIDlpKfphY3nva7mp73kvY3mlbjph48gKCR7dGhpcy5zZXR0aW5ncy5tYXhDb25maWdTbG90c30pYCk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnNldHRpbmdzLmNvbmZpZ3VyYXRpb25zLnB1c2goY29uZmlnKTtcbiAgICAgICAgdGhpcy5zYXZlU2V0dGluZ3MoKTtcblxuICAgICAgICByZXR1cm4gY29uZmlnO1xuICAgIH1cblxuICAgIHB1YmxpYyBnZXRFbmFibGVkVG9vbHMoKTogVG9vbENvbmZpZ1tdIHtcbiAgICAgICAgY29uc3QgY3VycmVudENvbmZpZyA9IHRoaXMuZ2V0Q3VycmVudENvbmZpZ3VyYXRpb24oKTtcbiAgICAgICAgaWYgKCFjdXJyZW50Q29uZmlnKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5hdmFpbGFibGVUb29scy5maWx0ZXIodG9vbCA9PiB0b29sLmVuYWJsZWQpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBjdXJyZW50Q29uZmlnLnRvb2xzLmZpbHRlcih0b29sID0+IHRvb2wuZW5hYmxlZCk7XG4gICAgfVxuXG5cbiAgICBwdWJsaWMgYXBwbHlQcm9maWxlKHByb2ZpbGU6ICdjb3JlJyB8ICdmdWxsJyk6IHZvaWQge1xuICAgICAgICBpZiAocHJvZmlsZSAhPT0gJ2NvcmUnICYmIHByb2ZpbGUgIT09ICdmdWxsJykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIHByb2ZpbGUgJyR7cHJvZmlsZX0nLiBFeHBlY3RlZCAnY29yZScgb3IgJ2Z1bGwnLmApO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGN1cnJlbnRDb25maWcgPSB0aGlzLmdldEN1cnJlbnRDb25maWd1cmF0aW9uKCk7XG4gICAgICAgIGlmICghY3VycmVudENvbmZpZykgdGhyb3cgbmV3IEVycm9yKCfmspLmnInnlbbliY3phY3nva4nKTtcbiAgICAgICAgY29uc3QgdXBkYXRlcyA9IGN1cnJlbnRDb25maWcudG9vbHMubWFwKHRvb2wgPT4gKHtcbiAgICAgICAgICAgIGNhdGVnb3J5OiB0b29sLmNhdGVnb3J5LFxuICAgICAgICAgICAgbmFtZTogdG9vbC5uYW1lLFxuICAgICAgICAgICAgZW5hYmxlZDogcHJvZmlsZSA9PT0gJ2Z1bGwnIHx8ICF0b29sLmRlc2NyaXB0aW9uPy5pbmNsdWRlcygnW3NwZWNpYWxpc3RdJyksXG4gICAgICAgIH0pKTtcbiAgICAgICAgdGhpcy51cGRhdGVUb29sU3RhdHVzQmF0Y2goY3VycmVudENvbmZpZy5pZCwgdXBkYXRlcyk7XG4gICAgfVxuXG4gICAgcHVibGljIGdldFRvb2xNYW5hZ2VyU3RhdGUoKSB7XG4gICAgICAgIGNvbnN0IGN1cnJlbnRDb25maWcgPSB0aGlzLmdldEN1cnJlbnRDb25maWd1cmF0aW9uKCk7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgYXZhaWxhYmxlVG9vbHM6IGN1cnJlbnRDb25maWcgPyBjdXJyZW50Q29uZmlnLnRvb2xzIDogdGhpcy5nZXRBdmFpbGFibGVUb29scygpLFxuICAgICAgICAgICAgc2VsZWN0ZWRDb25maWdJZDogdGhpcy5zZXR0aW5ncy5jdXJyZW50Q29uZmlnSWQsXG4gICAgICAgICAgICBjb25maWd1cmF0aW9uczogdGhpcy5nZXRDb25maWd1cmF0aW9ucygpLFxuICAgICAgICAgICAgbWF4Q29uZmlnU2xvdHM6IHRoaXMuc2V0dGluZ3MubWF4Q29uZmlnU2xvdHNcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHNhdmVTZXR0aW5ncygpOiB2b2lkIHtcbiAgICAgICAgZGVidWdMb2coYEJhY2tlbmQ6IFNhdmluZyBzZXR0aW5ncywgY3VycmVudCBjb25maWdzIGNvdW50OiAke3RoaXMuc2V0dGluZ3MuY29uZmlndXJhdGlvbnMubGVuZ3RofWApO1xuICAgICAgICB0aGlzLnNhdmVUb29sTWFuYWdlclNldHRpbmdzKHRoaXMuc2V0dGluZ3MpO1xuICAgICAgICBkZWJ1Z0xvZyhgQmFja2VuZDogU2V0dGluZ3Mgc2F2ZWQgdG8gZmlsZWApO1xuICAgIH1cbn0gIl19