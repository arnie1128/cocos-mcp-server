import { MCPServer } from './mcp-server-sdk';
import { readSettings, saveSettings } from './settings';
import { MCPServerSettings } from './types';
import { ToolManager } from './tools/tool-manager';
import { createToolRegistry, ToolRegistry } from './tools/registry';
import { logger } from './lib/log';

let mcpServer: MCPServer | null = null;
let toolManager: ToolManager;
let toolRegistry: ToolRegistry;

/**
 * @en Registration method for the main process of Extension
 * @zh 為擴展的主進程的註冊方法
 */
export const methods: { [key: string]: (...any: any) => any } = {
    /**
     * @en Open the MCP server panel
     * @zh 打開 MCP 服務器面板
     */
    openPanel() {
        Editor.Panel.open('cocos-mcp-server');
    },



    /**
     * @en Start the MCP server
     * @zh 啟動 MCP 服務器
     */
    async startServer() {
        if (mcpServer) {
            // 確保使用最新的工具配置
            const enabledTools = toolManager.getEnabledTools();
            mcpServer.updateEnabledTools(enabledTools);
            await mcpServer.start();
        } else {
            logger.warn('[MCP插件] mcpServer 未初始化');
        }
    },

    /**
     * @en Stop the MCP server
     * @zh 停止 MCP 服務器
     */
    async stopServer() {
        if (mcpServer) {
            await mcpServer.stop();
        } else {
            logger.warn('[MCP插件] mcpServer 未初始化');
        }
    },

    /**
     * @en Toggle the MCP server from the Extensions menu — starts when
     *     stopped, stops when running. Cocos cannot update menu labels
     *     at runtime, so a single "Start / Stop" entry handles both
     *     directions. State change shows up in any open panel via the
     *     existing 2s polling loop.
     * @zh 從擴展選單切換 MCP 服務器 — 未執行時啟動、執行中時停止。
     */
    async toggleServer() {
        if (!mcpServer) {
            logger.warn('[MCP插件] mcpServer 未初始化，無法 toggle');
            return;
        }
        const wasRunning = mcpServer.getStatus().running;
        try {
            if (wasRunning) {
                await mcpServer.stop();
                logger.info('[MCP插件] 透過選單關閉 MCP Server');
            } else {
                const enabledTools = toolManager.getEnabledTools();
                mcpServer.updateEnabledTools(enabledTools);
                await mcpServer.start();
                const status = mcpServer.getStatus();
                logger.info(`[MCP插件] 透過選單啟動 MCP Server，listening on http://127.0.0.1:${status.port}/mcp`);
            }
        } catch (err: any) {
            logger.error(`[MCP插件] toggle 失敗：${err?.message ?? err}`);
        }
    },

    /**
     * @en Get server status
     * @zh 獲取服務器狀態
     */
    getServerStatus() {
        const status = mcpServer ? mcpServer.getStatus() : { running: false, port: 0, clients: 0 };
        const settings = mcpServer ? mcpServer.getSettings() : readSettings();
        return {
            ...status,
            settings: settings
        };
    },

    /**
     * @en Update server settings
     * @zh 更新服務器設置
     */
    async updateSettings(settings: MCPServerSettings) {
        saveSettings(settings);
        if (mcpServer) {
            await mcpServer.stop();
        }
        mcpServer = new MCPServer(settings, toolRegistry);
        // Restore the user's enabled-tool filter; without this, every
        // settings save would expose all 157 tools regardless of what
        // the tool manager has configured. Mirrors the load() flow.
        mcpServer.updateEnabledTools(toolManager.getEnabledTools());
        await mcpServer.start();
    },

    /**
     * @en Get tools list
     * @zh 獲取工具列表
     */
    getToolsList() {
        return mcpServer ? mcpServer.getAvailableTools() : [];
    },

    getFilteredToolsList() {
        if (!mcpServer) return [];
        // updateEnabledTools rebuilds toolsList already filtered by the
        // current enabled set inside setupTools(); getAvailableTools then
        // returns that filtered list. The previous getFilteredTools() did
        // a redundant second filter on the same set.
        const enabledTools = toolManager.getEnabledTools();
        mcpServer.updateEnabledTools(enabledTools);
        return mcpServer.getAvailableTools();
    },
    /**
     * @en Get server settings
     * @zh 獲取服務器設置
     */
    async getServerSettings() {
        return mcpServer ? mcpServer.getSettings() : readSettings();
    },

    /**
     * @en Get server settings (alternative method)
     * @zh 獲取服務器設置（替代方法）
     */
    async getSettings() {
        return mcpServer ? mcpServer.getSettings() : readSettings();
    },

    // 工具管理器相關方法
    async getToolManagerState() {
        return toolManager.getToolManagerState();
    },

    async createToolConfiguration(name: string, description?: string) {
        try {
            const config = toolManager.createConfiguration(name, description);
            return { success: true, id: config.id, config };
        } catch (error: any) {
            throw new Error(`創建配置失敗: ${error.message}`);
        }
    },

    async updateToolConfiguration(configId: string, updates: any) {
        try {
            return toolManager.updateConfiguration(configId, updates);
        } catch (error: any) {
            throw new Error(`更新配置失敗: ${error.message}`);
        }
    },

    async deleteToolConfiguration(configId: string) {
        try {
            toolManager.deleteConfiguration(configId);
            return { success: true };
        } catch (error: any) {
            throw new Error(`刪除配置失敗: ${error.message}`);
        }
    },

    async setCurrentToolConfiguration(configId: string) {
        try {
            toolManager.setCurrentConfiguration(configId);
            return { success: true };
        } catch (error: any) {
            throw new Error(`設置當前配置失敗: ${error.message}`);
        }
    },

    async updateToolStatus(category: string, toolName: string, enabled: boolean) {
        try {
            const currentConfig = toolManager.getCurrentConfiguration();
            if (!currentConfig) {
                throw new Error('沒有當前配置');
            }
            
            toolManager.updateToolStatus(currentConfig.id, category, toolName, enabled);
            
            // 更新MCP服務器的工具列表
            if (mcpServer) {
                const enabledTools = toolManager.getEnabledTools();
                mcpServer.updateEnabledTools(enabledTools);
            }
            
            return { success: true };
        } catch (error: any) {
            throw new Error(`更新工具狀態失敗: ${error.message}`);
        }
    },

    async updateToolStatusBatch(updates: any[]) {
        try {
            logger.debug(`[Main] updateToolStatusBatch called with updates count:`, updates ? updates.length : 0);
            
            const currentConfig = toolManager.getCurrentConfiguration();
            if (!currentConfig) {
                throw new Error('沒有當前配置');
            }
            
            toolManager.updateToolStatusBatch(currentConfig.id, updates);
            
            // 更新MCP服務器的工具列表
            if (mcpServer) {
                const enabledTools = toolManager.getEnabledTools();
                mcpServer.updateEnabledTools(enabledTools);
            }
            
            return { success: true };
        } catch (error: any) {
            throw new Error(`批量更新工具狀態失敗: ${error.message}`);
        }
    },

    async exportToolConfiguration(configId: string) {
        try {
            return { configJson: toolManager.exportConfiguration(configId) };
        } catch (error: any) {
            throw new Error(`導出配置失敗: ${error.message}`);
        }
    },

    async importToolConfiguration(configJson: string) {
        try {
            return toolManager.importConfiguration(configJson);
        } catch (error: any) {
            throw new Error(`導入配置失敗: ${error.message}`);
        }
    },

    async getEnabledTools() {
        return toolManager.getEnabledTools();
    },

    async applyToolProfile(profile: 'core' | 'full') {
        try {
            toolManager.applyProfile(profile);
            const enabledTools = toolManager.getEnabledTools();
            if (mcpServer) {
                mcpServer.updateEnabledTools(enabledTools);
            }
            return { success: true, profile, enabledCount: enabledTools.length };
        } catch (error: any) {
            throw new Error(`套用工具設定檔失敗: ${error.message}`);
        }
    }
};

/**
 * @en Method Triggered on Extension Startup
 * @zh 擴展啟動時觸發的方法
 */
export function load() {
    logger.info('Cocos MCP Server extension loaded');

    // 建立工具註冊表（一次實例化，多處共用）
    toolRegistry = createToolRegistry();

    // 初始化工具管理器（接收共用 registry）
    toolManager = new ToolManager(toolRegistry);

    // 讀取設置
    const settings = readSettings();
    mcpServer = new MCPServer(settings, toolRegistry);

    // 初始化MCP服務器的工具列表
    const enabledTools = toolManager.getEnabledTools();
    mcpServer.updateEnabledTools(enabledTools);
    
    // 如果設置了自動啟動，則啟動服務器
    if (settings.autoStart) {
        mcpServer.start().catch(err => {
            logger.error('Failed to auto-start MCP server:', err);
        });
    }
}

/**
 * @en Method triggered when uninstalling the extension
 * @zh 卸載擴展時觸發的方法
 */
export async function unload() {
    if (mcpServer) {
        await mcpServer.stop();
        mcpServer = null;
    }

    // Invalidate Node.js require.cache for our own dist/ modules so the
    // next load() actually re-reads from disk. Without this, Cocos's
    // Extensions → Reload only re-runs main.js but every transitive
    // require('./tools/...') returns the cached module from first load —
    // a `npm run build` between reloads would have no observable effect.
    const ourRoot = require('path').dirname(__filename);
    for (const key of Object.keys(require.cache)) {
        if (key.startsWith(ourRoot)) {
            delete require.cache[key];
        }
    }
}