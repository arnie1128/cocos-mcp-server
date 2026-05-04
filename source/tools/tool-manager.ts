import { v4 as uuidv4 } from 'uuid';
import { ToolConfig, ToolConfiguration, ToolManagerSettings } from '../types';
import { debugLog } from '../lib/log';
import { ToolRegistry } from './registry';
import * as fs from 'fs';
import * as path from 'path';

export class ToolManager {
    private settings: ToolManagerSettings;
    private availableTools: ToolConfig[] = [];

    constructor(registry: ToolRegistry) {
        this.settings = this.readToolManagerSettings();
        this.initializeAvailableTools(registry);

        // 如果沒有配置，自動創建一個默認配置
        if (this.settings.configurations.length === 0) {
            debugLog('[ToolManager] No configurations found, creating default configuration...');
            this.createConfiguration('默認配置', '自動創建的默認工具配置');
        } else {
            this.reconcileConfigurationsWithRegistry();
        }
    }

    /**
     * Add tools that exist in the live registry but not in a saved
     * configuration (defaults to enabled), and drop tools whose name no
     * longer appears in the registry. This runs once per startup so the
     * panel reflects what the build actually exposes after upgrades.
     */
    private reconcileConfigurationsWithRegistry(): void {
        const registryKey = (t: { category: string; name: string }) => `${t.category}::${t.name}`;
        const registryIndex = new Map(this.availableTools.map(t => [registryKey(t), t]));

        let anyMutated = false;
        for (const config of this.settings.configurations) {
            let configMutated = false;
            const seen = new Set<string>();
            const kept: ToolConfig[] = [];
            for (const tool of config.tools) {
                const k = registryKey(tool);
                const reg = registryIndex.get(k);
                if (reg) {
                    seen.add(k);
                    // Refresh display fields from registry every load — title /
                    // description are source-of-truth in code, not in the
                    // persisted file. Preserve user's enabled toggle.
                    if (tool.description !== reg.description || tool.title !== reg.title) {
                        tool.description = reg.description;
                        tool.title = reg.title;
                        configMutated = true;
                    }
                    kept.push(tool);
                } else {
                    debugLog(`[ToolManager] Dropping stale tool from config '${config.name}': ${k}`);
                    configMutated = true;
                }
            }
            for (const [k, tool] of registryIndex) {
                if (!seen.has(k)) {
                    kept.push({ ...tool });
                    debugLog(`[ToolManager] Adding new tool to config '${config.name}': ${k}`);
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
            debugLog('[ToolManager] Reconciled saved configurations with current registry');
        }
    }

    private getToolManagerSettingsPath(): string {
        return path.join(Editor.Project.path, 'settings', 'tool-manager.json');
    }

    private ensureSettingsDir(): void {
        const settingsDir = path.dirname(this.getToolManagerSettingsPath());
        if (!fs.existsSync(settingsDir)) {
            fs.mkdirSync(settingsDir, { recursive: true });
        }
    }

    private readToolManagerSettings(): ToolManagerSettings {
        const DEFAULT_TOOL_MANAGER_SETTINGS: ToolManagerSettings = {
            configurations: [],
            currentConfigId: '',
            maxConfigSlots: 5
        };

        try {
            this.ensureSettingsDir();
            const content = fs.readFileSync(this.getToolManagerSettingsPath(), 'utf8');
            return { ...DEFAULT_TOOL_MANAGER_SETTINGS, ...JSON.parse(content) };
        } catch (e: any) {
            if (e?.code !== 'ENOENT') {
                console.error('Failed to read tool manager settings:', e);
            }
        }
        return DEFAULT_TOOL_MANAGER_SETTINGS;
    }

    private saveToolManagerSettings(settings: ToolManagerSettings): void {
        try {
            this.ensureSettingsDir();
            const settingsFile = this.getToolManagerSettingsPath();
            fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
        } catch (e) {
            console.error('Failed to save tool manager settings:', e);
            throw e;
        }
    }

    private exportToolConfiguration(config: ToolConfiguration): string {
        return JSON.stringify(config, null, 2);
    }

    private importToolConfiguration(configJson: string): ToolConfiguration {
        try {
            const config = JSON.parse(configJson);
            // 驗證配置格式
            if (!config.id || !config.name || !Array.isArray(config.tools)) {
                throw new Error('Invalid configuration format');
            }
            return config;
        } catch (e) {
            console.error('Failed to parse tool configuration:', e);
            throw new Error('Invalid JSON format or configuration structure');
        }
    }

    private initializeAvailableTools(registry: ToolRegistry): void {
        this.availableTools = [];
        for (const [category, toolSet] of Object.entries(registry)) {
            for (const tool of toolSet.getTools()) {
                this.availableTools.push({
                    category,
                    name: tool.name,
                    enabled: true, // 默認啟用
                    description: tool.description,
                    title: tool.annotations?.title,
                });
            }
        }
        debugLog(`[ToolManager] Initialized ${this.availableTools.length} tools from shared registry`);
    }

    public getAvailableTools(): ToolConfig[] {
        return [...this.availableTools];
    }

    public getConfigurations(): ToolConfiguration[] {
        return [...this.settings.configurations];
    }

    public getCurrentConfiguration(): ToolConfiguration | null {
        if (!this.settings.currentConfigId) {
            return null;
        }
        return this.settings.configurations.find(config => config.id === this.settings.currentConfigId) || null;
    }

    public createConfiguration(name: string, description?: string): ToolConfiguration {
        if (this.settings.configurations.length >= this.settings.maxConfigSlots) {
            throw new Error(`已達到最大配置槽位數量 (${this.settings.maxConfigSlots})`);
        }

        const config: ToolConfiguration = {
            id: uuidv4(),
            name,
            description,
            tools: this.availableTools.map(tool => ({ ...tool })),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        this.settings.configurations.push(config);
        this.settings.currentConfigId = config.id;
        this.saveSettings();

        return config;
    }

    public updateConfiguration(configId: string, updates: Partial<ToolConfiguration>): ToolConfiguration {
        const configIndex = this.settings.configurations.findIndex(config => config.id === configId);
        if (configIndex === -1) {
            throw new Error('配置不存在');
        }

        const config = this.settings.configurations[configIndex];
        const updatedConfig: ToolConfiguration = {
            ...config,
            ...updates,
            updatedAt: new Date().toISOString()
        };

        this.settings.configurations[configIndex] = updatedConfig;
        this.saveSettings();

        return updatedConfig;
    }

    public deleteConfiguration(configId: string): void {
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

    public setCurrentConfiguration(configId: string): void {
        const config = this.settings.configurations.find(config => config.id === configId);
        if (!config) {
            throw new Error('配置不存在');
        }

        this.settings.currentConfigId = configId;
        this.saveSettings();
    }

    public updateToolStatus(configId: string, category: string, toolName: string, enabled: boolean): void {
        debugLog(`Backend: Updating tool status - configId: ${configId}, category: ${category}, toolName: ${toolName}, enabled: ${enabled}`);
        
        const config = this.settings.configurations.find(config => config.id === configId);
        if (!config) {
            console.error(`Backend: Config not found with ID: ${configId}`);
            throw new Error('配置不存在');
        }

        debugLog(`Backend: Found config: ${config.name}`);

        const tool = config.tools.find(t => t.category === category && t.name === toolName);
        if (!tool) {
            console.error(`Backend: Tool not found - category: ${category}, name: ${toolName}`);
            throw new Error('工具不存在');
        }

        debugLog(`Backend: Found tool: ${tool.name}, current enabled: ${tool.enabled}, new enabled: ${enabled}`);
        
        tool.enabled = enabled;
        config.updatedAt = new Date().toISOString();
        
        debugLog(`Backend: Tool updated, saving settings...`);
        this.saveSettings();
        debugLog(`Backend: Settings saved successfully`);
    }

    public updateToolStatusBatch(configId: string, updates: { category: string; name: string; enabled: boolean }[]): void {
        debugLog(`Backend: updateToolStatusBatch called with configId: ${configId}`);
        debugLog(`Backend: Current configurations count: ${this.settings.configurations.length}`);
        debugLog(`Backend: Current config IDs:`, this.settings.configurations.map(c => c.id));
        
        const config = this.settings.configurations.find(config => config.id === configId);
        if (!config) {
            console.error(`Backend: Config not found with ID: ${configId}`);
            console.error(`Backend: Available config IDs:`, this.settings.configurations.map(c => c.id));
            throw new Error('配置不存在');
        }

        debugLog(`Backend: Found config: ${config.name}, updating ${updates.length} tools`);

        updates.forEach(update => {
            const tool = config.tools.find(t => t.category === update.category && t.name === update.name);
            if (tool) {
                tool.enabled = update.enabled;
            }
        });

        config.updatedAt = new Date().toISOString();
        this.saveSettings();
        debugLog(`Backend: Batch update completed successfully`);
    }

    public exportConfiguration(configId: string): string {
        const config = this.settings.configurations.find(config => config.id === configId);
        if (!config) {
            throw new Error('配置不存在');
        }

        return this.exportToolConfiguration(config);
    }

    public importConfiguration(configJson: string): ToolConfiguration {
        const config = this.importToolConfiguration(configJson);
        
        // 生成新的ID和時間戳
        config.id = uuidv4();
        config.createdAt = new Date().toISOString();
        config.updatedAt = new Date().toISOString();

        if (this.settings.configurations.length >= this.settings.maxConfigSlots) {
            throw new Error(`已達到最大配置槽位數量 (${this.settings.maxConfigSlots})`);
        }

        this.settings.configurations.push(config);
        this.saveSettings();

        return config;
    }

    public getEnabledTools(): ToolConfig[] {
        const currentConfig = this.getCurrentConfiguration();
        if (!currentConfig) {
            return this.availableTools.filter(tool => tool.enabled);
        }
        return currentConfig.tools.filter(tool => tool.enabled);
    }


    public applyProfile(profile: 'core' | 'full'): void {
        if (profile !== 'core' && profile !== 'full') {
            throw new Error(`Invalid profile '${profile}'. Expected 'core' or 'full'.`);
        }
        const currentConfig = this.getCurrentConfiguration();
        if (!currentConfig) throw new Error('沒有當前配置');
        const updates = currentConfig.tools.map(tool => ({
            category: tool.category,
            name: tool.name,
            enabled: profile === 'full' || !tool.description?.includes('[specialist]'),
        }));
        this.updateToolStatusBatch(currentConfig.id, updates);
    }

    public getToolManagerState() {
        const currentConfig = this.getCurrentConfiguration();
        return {
            success: true,
            availableTools: currentConfig ? currentConfig.tools : this.getAvailableTools(),
            selectedConfigId: this.settings.currentConfigId,
            configurations: this.getConfigurations(),
            maxConfigSlots: this.settings.maxConfigSlots
        };
    }

    private saveSettings(): void {
        debugLog(`Backend: Saving settings, current configs count: ${this.settings.configurations.length}`);
        this.saveToolManagerSettings(this.settings);
        debugLog(`Backend: Settings saved to file`);
    }
} 