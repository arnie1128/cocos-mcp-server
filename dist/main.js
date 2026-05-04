"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.methods = void 0;
exports.load = load;
exports.unload = unload;
const mcp_server_sdk_1 = require("./mcp-server-sdk");
const settings_1 = require("./settings");
const tool_manager_1 = require("./tools/tool-manager");
const registry_1 = require("./tools/registry");
const log_1 = require("./lib/log");
let mcpServer = null;
let toolManager;
let toolRegistry;
/**
 * @en Registration method for the main process of Extension
 * @zh 為擴展的主進程的註冊方法
 */
exports.methods = {
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
        }
        else {
            log_1.logger.warn('[MCP插件] mcpServer 未初始化');
        }
    },
    /**
     * @en Stop the MCP server
     * @zh 停止 MCP 服務器
     */
    async stopServer() {
        if (mcpServer) {
            await mcpServer.stop();
        }
        else {
            log_1.logger.warn('[MCP插件] mcpServer 未初始化');
        }
    },
    /**
     * @en Get server status
     * @zh 獲取服務器狀態
     */
    getServerStatus() {
        const status = mcpServer ? mcpServer.getStatus() : { running: false, port: 0, clients: 0 };
        const settings = mcpServer ? mcpServer.getSettings() : (0, settings_1.readSettings)();
        return Object.assign(Object.assign({}, status), { settings: settings });
    },
    /**
     * @en Update server settings
     * @zh 更新服務器設置
     */
    async updateSettings(settings) {
        (0, settings_1.saveSettings)(settings);
        if (mcpServer) {
            await mcpServer.stop();
        }
        mcpServer = new mcp_server_sdk_1.MCPServer(settings, toolRegistry);
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
        if (!mcpServer)
            return [];
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
        return mcpServer ? mcpServer.getSettings() : (0, settings_1.readSettings)();
    },
    /**
     * @en Get server settings (alternative method)
     * @zh 獲取服務器設置（替代方法）
     */
    async getSettings() {
        return mcpServer ? mcpServer.getSettings() : (0, settings_1.readSettings)();
    },
    // 工具管理器相關方法
    async getToolManagerState() {
        return toolManager.getToolManagerState();
    },
    async createToolConfiguration(name, description) {
        try {
            const config = toolManager.createConfiguration(name, description);
            return { success: true, id: config.id, config };
        }
        catch (error) {
            throw new Error(`創建配置失敗: ${error.message}`);
        }
    },
    async updateToolConfiguration(configId, updates) {
        try {
            return toolManager.updateConfiguration(configId, updates);
        }
        catch (error) {
            throw new Error(`更新配置失敗: ${error.message}`);
        }
    },
    async deleteToolConfiguration(configId) {
        try {
            toolManager.deleteConfiguration(configId);
            return { success: true };
        }
        catch (error) {
            throw new Error(`刪除配置失敗: ${error.message}`);
        }
    },
    async setCurrentToolConfiguration(configId) {
        try {
            toolManager.setCurrentConfiguration(configId);
            return { success: true };
        }
        catch (error) {
            throw new Error(`設置當前配置失敗: ${error.message}`);
        }
    },
    async updateToolStatus(category, toolName, enabled) {
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
        }
        catch (error) {
            throw new Error(`更新工具狀態失敗: ${error.message}`);
        }
    },
    async updateToolStatusBatch(updates) {
        try {
            log_1.logger.debug(`[Main] updateToolStatusBatch called with updates count:`, updates ? updates.length : 0);
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
        }
        catch (error) {
            throw new Error(`批量更新工具狀態失敗: ${error.message}`);
        }
    },
    async exportToolConfiguration(configId) {
        try {
            return { configJson: toolManager.exportConfiguration(configId) };
        }
        catch (error) {
            throw new Error(`導出配置失敗: ${error.message}`);
        }
    },
    async importToolConfiguration(configJson) {
        try {
            return toolManager.importConfiguration(configJson);
        }
        catch (error) {
            throw new Error(`導入配置失敗: ${error.message}`);
        }
    },
    async getEnabledTools() {
        return toolManager.getEnabledTools();
    },
    async applyToolProfile(profile) {
        try {
            toolManager.applyProfile(profile);
            const enabledTools = toolManager.getEnabledTools();
            if (mcpServer) {
                mcpServer.updateEnabledTools(enabledTools);
            }
            return { success: true, profile, enabledCount: enabledTools.length };
        }
        catch (error) {
            throw new Error(`套用工具設定檔失敗: ${error.message}`);
        }
    }
};
/**
 * @en Method Triggered on Extension Startup
 * @zh 擴展啟動時觸發的方法
 */
function load() {
    log_1.logger.info('Cocos MCP Server extension loaded');
    // 建立工具註冊表（一次實例化，多處共用）
    toolRegistry = (0, registry_1.createToolRegistry)();
    // 初始化工具管理器（接收共用 registry）
    toolManager = new tool_manager_1.ToolManager(toolRegistry);
    // 讀取設置
    const settings = (0, settings_1.readSettings)();
    mcpServer = new mcp_server_sdk_1.MCPServer(settings, toolRegistry);
    // 初始化MCP服務器的工具列表
    const enabledTools = toolManager.getEnabledTools();
    mcpServer.updateEnabledTools(enabledTools);
    // 如果設置了自動啟動，則啟動服務器
    if (settings.autoStart) {
        mcpServer.start().catch(err => {
            log_1.logger.error('Failed to auto-start MCP server:', err);
        });
    }
}
/**
 * @en Method triggered when uninstalling the extension
 * @zh 卸載擴展時觸發的方法
 */
async function unload() {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NvdXJjZS9tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQStPQSxvQkF1QkM7QUFNRCx3QkFpQkM7QUE3UkQscURBQTZDO0FBQzdDLHlDQUF3RDtBQUV4RCx1REFBbUQ7QUFDbkQsK0NBQW9FO0FBQ3BFLG1DQUFtQztBQUVuQyxJQUFJLFNBQVMsR0FBcUIsSUFBSSxDQUFDO0FBQ3ZDLElBQUksV0FBd0IsQ0FBQztBQUM3QixJQUFJLFlBQTBCLENBQUM7QUFFL0I7OztHQUdHO0FBQ1UsUUFBQSxPQUFPLEdBQTRDO0lBQzVEOzs7T0FHRztJQUNILFNBQVM7UUFDTCxNQUFNLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO0lBQzFDLENBQUM7SUFJRDs7O09BR0c7SUFDSCxLQUFLLENBQUMsV0FBVztRQUNiLElBQUksU0FBUyxFQUFFLENBQUM7WUFDWixjQUFjO1lBQ2QsTUFBTSxZQUFZLEdBQUcsV0FBVyxDQUFDLGVBQWUsRUFBRSxDQUFDO1lBQ25ELFNBQVMsQ0FBQyxrQkFBa0IsQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUMzQyxNQUFNLFNBQVMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUM1QixDQUFDO2FBQU0sQ0FBQztZQUNKLFlBQU0sQ0FBQyxJQUFJLENBQUMsd0JBQXdCLENBQUMsQ0FBQztRQUMxQyxDQUFDO0lBQ0wsQ0FBQztJQUVEOzs7T0FHRztJQUNILEtBQUssQ0FBQyxVQUFVO1FBQ1osSUFBSSxTQUFTLEVBQUUsQ0FBQztZQUNaLE1BQU0sU0FBUyxDQUFDLElBQUksRUFBRSxDQUFDO1FBQzNCLENBQUM7YUFBTSxDQUFDO1lBQ0osWUFBTSxDQUFDLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO1FBQzFDLENBQUM7SUFDTCxDQUFDO0lBRUQ7OztPQUdHO0lBQ0gsZUFBZTtRQUNYLE1BQU0sTUFBTSxHQUFHLFNBQVMsQ0FBQyxDQUFDLENB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QUFHLElBQUksTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztRQUMzQyxJQUFJLEdBQUcsQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUMxQixPQUFPLE9BQU8sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDOUIsQ0FBQztJQUNMLENBQUM7QUFDTCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgTUNQU2VydmVyIH0gZnJvbSAnLi9tY3Atc2VydmVyLXNkayc7XG5pbXBvcnQgeyByZWFkU2V0dGluZ3MsIHNhdmVTZXR0aW5ncyB9IGZyb20gJy4vc2V0dGluZ3MnO1xuaW1wb3J0IHsgTUNQU2VydmVyU2V0dGluZ3MgfSBmcm9tICcuL3R5cGVzJztcbmltcG9ydCB7IFRvb2xNYW5hZ2VyIH0gZnJvbSAnLi90b29scy90b29sLW1hbmFnZXInO1xuaW1wb3J0IHsgY3JlYXRlVG9vbFJlZ2lzdHJ5LCBUb29sUmVnaXN0cnkgfSBmcm9tICcuL3Rvb2xzL3JlZ2lzdHJ5JztcbmltcG9ydCB7IGxvZ2dlciB9IGZyb20gJy4vbGliL2xvZyc7XG5cbmxldCBtY3BTZXJ2ZXI6IE1DUFNlcnZlciB8IG51bGwgPSBudWxsO1xubGV0IHRvb2xNYW5hZ2VyOiBUb29sTWFuYWdlcjtcbmxldCB0b29sUmVnaXN0cnk6IFRvb2xSZWdpc3RyeTtcblxuLyoqXG4gKiBAZW4gUmVnaXN0cmF0aW9uIG1ldGhvZCBmb3IgdGhlIG1haW4gcHJvY2VzcyBvZiBFeHRlbnNpb25cbiAqIEB6aCDngrrmk7TlsZXnmoTkuLvpgLLnqIvnmoToqLvlhormlrnms5VcbiAqL1xuZXhwb3J0IGNvbnN0IG1ldGhvZHM6IHsgW2tleTogc3RyaW5nXTogKC4uLmFueTogYW55KSA9PiBhbnkgfSA9IHtcbiAgICAvKipcbiAgICAgKiBAZW4gT3BlbiB0aGUgTUNQIHNlcnZlciBwYW5lbFxuICAgICAqIEB6aCDmiZPplosgTUNQIOacjeWLmeWZqOmdouadv1xuICAgICAqL1xuICAgIG9wZW5QYW5lbCgpIHtcbiAgICAgICAgRWRpdG9yLlBhbmVsLm9wZW4oJ2NvY29zLW1jcC1zZXJ2ZXInKTtcbiAgICB9LFxuXG5cblxuICAgIC8qKlxuICAgICAqIEBlbiBTdGFydCB0aGUgTUNQIHNlcnZlclxuICAgICAqIEB6aCDllZ/li5UgTUNQIOacjeWLmeWZqFxuICAgICAqL1xuICAgIGFzeW5jIHN0YXJ0U2VydmVyKCkge1xuICAgICAgICBpZiAobWNwU2VydmVyKSB7XG4gICAgICAgICAgICAvLyDnorrkv53kvb/nlKjmnIDmlrDnmoTlt6XlhbfphY3nva5cbiAgICAgICAgICAgIGNvbnN0IGVuYWJsZWRUb29scyA9IHRvb2xNYW5hZ2VyLmdldEVuYWJsZWRUb29scygpO1xuICAgICAgICAgICAgbWNwU2VydmVyLnVwZGF0ZUVuYWJsZWRUb29scyhlbmFibGVkVG9vbHMpO1xuICAgICAgICAgICAgYXdhaXQgbWNwU2VydmVyLnN0YXJ0KCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsb2dnZXIud2FybignW01DUOaPkuS7tl0gbWNwU2VydmVyIOacquWIneWni+WMlicpO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEBlbiBTdG9wIHRoZSBNQ1Agc2VydmVyXG4gICAgICogQHpoIOWBnOatoiBNQ1Ag5pyN5YuZ5ZmoXG4gICAgICovXG4gICAgYXN5bmMgc3RvcFNlcnZlcigpIHtcbiAgICAgICAgaWYgKG1jcFNlcnZlcikge1xuICAgICAgICAgICAgYXdhaXQgbWNwU2VydmVyLnN0b3AoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxvZ2dlci53YXJuKCdbTUNQ5o+S5Lu2XSBtY3BTZXJ2ZXIg5pyq5Yid5aeL5YyWJyk7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQGVuIEdldCBzZXJ2ZXIgc3RhdHVzXG4gICAgICogQHpoIOeNsuWPluacjeWLmeWZqOeLgOaFi1xuICAgICAqL1xuICAgIGdldFNlcnZlclN0YXR1cygpIHtcbiAgICAgICAgY29uc3Qgc3RhdHVzID0gbWNwU2VydmVyID8gbWNwU2VydmVyLmdldFN0YXR1cygpIDogeyBydW5uaW5nOiBmYWxzZSwgcG9ydDogMCwgY2xpZW50czogMCB9O1xuICAgICAgICBjb25zdCBzZXR0aW5ncyA9IG1jcFNlcnZlciA/IG1jcFNlcnZlci5nZXRTZXR0aW5ncygpIDogcmVhZFNldHRpbmdzKCk7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAuLi5zdGF0dXMsXG4gICAgICAgICAgICBzZXR0aW5nczogc2V0dGluZ3NcbiAgICAgICAgfTtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQGVuIFVwZGF0ZSBzZXJ2ZXIgc2V0dGluZ3NcbiAgICAgKiBAemgg5pu05paw5pyN5YuZ5Zmo6Kit572uXG4gICAgICovXG4gICAgYXN5bmMgdXBkYXRlU2V0dGluZ3Moc2V0dGluZ3M6IE1DUFNlcnZlclNldHRpbmdzKSB7XG4gICAgICAgIHNhdmVTZXR0aW5ncyhzZXR0aW5ncyk7XG4gICAgICAgIGlmIChtY3BTZXJ2ZXIpIHtcbiAgICAgICAgICAgIGF3YWl0IG1jcFNlcnZlci5zdG9wKCk7XG4gICAgICAgIH1cbiAgICAgICAgbWNwU2VydmVyID0gbmV3IE1DUFNlcnZlcihzZXR0aW5ncywgdG9vbFJlZ2lzdHJ5KTtcbiAgICAgICAgLy8gUmVzdG9yZSB0aGUgdXNlcidzIGVuYWJsZWQtdG9vbCBmaWx0ZXI7IHdpdGhvdXQgdGhpcywgZXZlcnlcbiAgICAgICAgLy8gc2V0dGluZ3Mgc2F2ZSB3b3VsZCBleHBvc2UgYWxsIDE1NyB0b29scyByZWdhcmRsZXNzIG9mIHdoYXRcbiAgICAgICAgLy8gdGhlIHRvb2wgbWFuYWdlciBoYXMgY29uZmlndXJlZC4gTWlycm9ycyB0aGUgbG9hZCgpIGZsb3cuXG4gICAgICAgIG1jcFNlcnZlci51cGRhdGVFbmFibGVkVG9vbHModG9vbE1hbmFnZXIuZ2V0RW5hYmxlZFRvb2xzKCkpO1xuICAgICAgICBhd2FpdCBtY3BTZXJ2ZXIuc3RhcnQoKTtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQGVuIEdldCB0b29scyBsaXN0XG4gICAgICogQHpoIOeNsuWPluW3peWFt+WIl+ihqFxuICAgICAqL1xuICAgIGdldFRvb2xzTGlzdCgpIHtcbiAgICAgICAgcmV0dXJuIG1jcFNlcnZlciA/IG1jcFNlcnZlci5nZXRBdmFpbGFibGVUb29scygpIDogW107XG4gICAgfSxcblxuICAgIGdldEZpbHRlcmVkVG9vbHNMaXN0KCkge1xuICAgICAgICBpZiAoIW1jcFNlcnZlcikgcmV0dXJuIFtdO1xuICAgICAgICAvLyB1cGRhdGVFbmFibGVkVG9vbHMgcmVidWlsZHMgdG9vbHNMaXN0IGFscmVhZHkgZmlsdGVyZWQgYnkgdGhlXG4gICAgICAgIC8vIGN1cnJlbnQgZW5hYmxlZCBzZXQgaW5zaWRlIHNldHVwVG9vbHMoKTsgZ2V0QXZhaWxhYmxlVG9vbHMgdGhlblxuICAgICAgICAvLyByZXR1cm5zIHRoYXQgZmlsdGVyZWQgbGlzdC4gVGhlIHByZXZpb3VzIGdldEZpbHRlcmVkVG9vbHMoKSBkaWRcbiAgICAgICAgLy8gYSByZWR1bmRhbnQgc2Vjb25kIGZpbHRlciBvbiB0aGUgc2FtZSBzZXQuXG4gICAgICAgIGNvbnN0IGVuYWJsZWRUb29scyA9IHRvb2xNYW5hZ2VyLmdldEVuYWJsZWRUb29scygpO1xuICAgICAgICBtY3BTZXJ2ZXIudXBkYXRlRW5hYmxlZFRvb2xzKGVuYWJsZWRUb29scyk7XG4gICAgICAgIHJldHVybiBtY3BTZXJ2ZXIuZ2V0QXZhaWxhYmxlVG9vbHMoKTtcbiAgICB9LFxuICAgIC8qKlxuICAgICAqIEBlbiBHZXQgc2VydmVyIHNldHRpbmdzXG4gICAgICogQHpoIOeNsuWPluacjeWLmeWZqOioree9rlxuICAgICAqL1xuICAgIGFzeW5jIGdldFNlcnZlclNldHRpbmdzKCkge1xuICAgICAgICByZXR1cm4gbWNwU2VydmVyID8gbWNwU2VydmVyLmdldFNldHRpbmdzKCkgOiByZWFkU2V0dGluZ3MoKTtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQGVuIEdldCBzZXJ2ZXIgc2V0dGluZ3MgKGFsdGVybmF0aXZlIG1ldGhvZClcbiAgICAgKiBAemgg542y5Y+W5pyN5YuZ5Zmo6Kit572u77yI5pu/5Luj5pa55rOV77yJXG4gICAgICovXG4gICAgYXN5bmMgZ2V0U2V0dGluZ3MoKSB7XG4gICAgICAgIHJldHVybiBtY3BTZXJ2ZXIgPyBtY3BTZXJ2ZXIuZ2V0U2V0dGluZ3MoKSA6IHJlYWRTZXR0aW5ncygpO1xuICAgIH0sXG5cbiAgICAvLyDlt6XlhbfnrqHnkIblmajnm7jpl5zmlrnms5VcbiAgICBhc3luYyBnZXRUb29sTWFuYWdlclN0YXRlKCkge1xuICAgICAgICByZXR1cm4gdG9vbE1hbmFnZXIuZ2V0VG9vbE1hbmFnZXJTdGF0ZSgpO1xuICAgIH0sXG5cbiAgICBhc3luYyBjcmVhdGVUb29sQ29uZmlndXJhdGlvbihuYW1lOiBzdHJpbmcsIGRlc2NyaXB0aW9uPzogc3RyaW5nKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBjb25maWcgPSB0b29sTWFuYWdlci5jcmVhdGVDb25maWd1cmF0aW9uKG5hbWUsIGRlc2NyaXB0aW9uKTtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGlkOiBjb25maWcuaWQsIGNvbmZpZyB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYOWJteW7uumFjee9ruWkseaVlzogJHtlcnJvci5tZXNzYWdlfWApO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIGFzeW5jIHVwZGF0ZVRvb2xDb25maWd1cmF0aW9uKGNvbmZpZ0lkOiBzdHJpbmcsIHVwZGF0ZXM6IGFueSkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgcmV0dXJuIHRvb2xNYW5hZ2VyLnVwZGF0ZUNvbmZpZ3VyYXRpb24oY29uZmlnSWQsIHVwZGF0ZXMpO1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYOabtOaWsOmFjee9ruWkseaVlzogJHtlcnJvci5tZXNzYWdlfWApO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIGFzeW5jIGRlbGV0ZVRvb2xDb25maWd1cmF0aW9uKGNvbmZpZ0lkOiBzdHJpbmcpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHRvb2xNYW5hZ2VyLmRlbGV0ZUNvbmZpZ3VyYXRpb24oY29uZmlnSWQpO1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYOWIqumZpOmFjee9ruWkseaVlzogJHtlcnJvci5tZXNzYWdlfWApO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIGFzeW5jIHNldEN1cnJlbnRUb29sQ29uZmlndXJhdGlvbihjb25maWdJZDogc3RyaW5nKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICB0b29sTWFuYWdlci5zZXRDdXJyZW50Q29uZmlndXJhdGlvbihjb25maWdJZCk7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihg6Kit572u55W25YmN6YWN572u5aSx5pWXOiAke2Vycm9yLm1lc3NhZ2V9YCk7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgYXN5bmMgdXBkYXRlVG9vbFN0YXR1cyhjYXRlZ29yeTogc3RyaW5nLCB0b29sTmFtZTogc3RyaW5nLCBlbmFibGVkOiBib29sZWFuKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBjdXJyZW50Q29uZmlnID0gdG9vbE1hbmFnZXIuZ2V0Q3VycmVudENvbmZpZ3VyYXRpb24oKTtcbiAgICAgICAgICAgIGlmICghY3VycmVudENvbmZpZykge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcign5rKS5pyJ55W25YmN6YWN572uJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHRvb2xNYW5hZ2VyLnVwZGF0ZVRvb2xTdGF0dXMoY3VycmVudENvbmZpZy5pZCwgY2F0ZWdvcnksIHRvb2xOYW1lLCBlbmFibGVkKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8g5pu05pawTUNQ5pyN5YuZ5Zmo55qE5bel5YW35YiX6KGoXG4gICAgICAgICAgICBpZiAobWNwU2VydmVyKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZW5hYmxlZFRvb2xzID0gdG9vbE1hbmFnZXIuZ2V0RW5hYmxlZFRvb2xzKCk7XG4gICAgICAgICAgICAgICAgbWNwU2VydmVyLnVwZGF0ZUVuYWJsZWRUb29scyhlbmFibGVkVG9vbHMpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihg5pu05paw5bel5YW354uA5oWL5aSx5pWXOiAke2Vycm9yLm1lc3NhZ2V9YCk7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgYXN5bmMgdXBkYXRlVG9vbFN0YXR1c0JhdGNoKHVwZGF0ZXM6IGFueVtdKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBsb2dnZXIuZGVidWcoYFtNYWluXSB1cGRhdGVUb29sU3RhdHVzQmF0Y2ggY2FsbGVkIHdpdGggdXBkYXRlcyBjb3VudDpgLCB1cGRhdGVzID8gdXBkYXRlcy5sZW5ndGggOiAwKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgY29uc3QgY3VycmVudENvbmZpZyA9IHRvb2xNYW5hZ2VyLmdldEN1cnJlbnRDb25maWd1cmF0aW9uKCk7XG4gICAgICAgICAgICBpZiAoIWN1cnJlbnRDb25maWcpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ+aykuacieeVtuWJjemFjee9ricpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICB0b29sTWFuYWdlci51cGRhdGVUb29sU3RhdHVzQmF0Y2goY3VycmVudENvbmZpZy5pZCwgdXBkYXRlcyk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIOabtOaWsE1DUOacjeWLmeWZqOeahOW3peWFt+WIl+ihqFxuICAgICAgICAgICAgaWYgKG1jcFNlcnZlcikge1xuICAgICAgICAgICAgICAgIGNvbnN0IGVuYWJsZWRUb29scyA9IHRvb2xNYW5hZ2VyLmdldEVuYWJsZWRUb29scygpO1xuICAgICAgICAgICAgICAgIG1jcFNlcnZlci51cGRhdGVFbmFibGVkVG9vbHMoZW5hYmxlZFRvb2xzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYOaJuemHj+abtOaWsOW3peWFt+eLgOaFi+WkseaVlzogJHtlcnJvci5tZXNzYWdlfWApO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIGFzeW5jIGV4cG9ydFRvb2xDb25maWd1cmF0aW9uKGNvbmZpZ0lkOiBzdHJpbmcpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHJldHVybiB7IGNvbmZpZ0pzb246IHRvb2xNYW5hZ2VyLmV4cG9ydENvbmZpZ3VyYXRpb24oY29uZmlnSWQpIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihg5bCO5Ye66YWN572u5aSx5pWXOiAke2Vycm9yLm1lc3NhZ2V9YCk7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgYXN5bmMgaW1wb3J0VG9vbENvbmZpZ3VyYXRpb24oY29uZmlnSnNvbjogc3RyaW5nKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICByZXR1cm4gdG9vbE1hbmFnZXIuaW1wb3J0Q29uZmlndXJhdGlvbihjb25maWdKc29uKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGDlsI7lhaXphY3nva7lpLHmlZc6ICR7ZXJyb3IubWVzc2FnZX1gKTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICBhc3luYyBnZXRFbmFibGVkVG9vbHMoKSB7XG4gICAgICAgIHJldHVybiB0b29sTWFuYWdlci5nZXRFbmFibGVkVG9vbHMoKTtcbiAgICB9LFxuXG4gICAgYXN5bmMgYXBwbHlUb29sUHJvZmlsZShwcm9maWxlOiAnY29yZScgfCAnZnVsbCcpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHRvb2xNYW5hZ2VyLmFwcGx5UHJvZmlsZShwcm9maWxlKTtcbiAgICAgICAgICAgIGNvbnN0IGVuYWJsZWRUb29scyA9IHRvb2xNYW5hZ2VyLmdldEVuYWJsZWRUb29scygpO1xuICAgICAgICAgICAgaWYgKG1jcFNlcnZlcikge1xuICAgICAgICAgICAgICAgIG1jcFNlcnZlci51cGRhdGVFbmFibGVkVG9vbHMoZW5hYmxlZFRvb2xzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIHByb2ZpbGUsIGVuYWJsZWRDb3VudDogZW5hYmxlZFRvb2xzLmxlbmd0aCB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYOWll+eUqOW3peWFt+ioreWumuaqlOWkseaVlzogJHtlcnJvci5tZXNzYWdlfWApO1xuICAgICAgICB9XG4gICAgfVxufTtcblxuLyoqXG4gKiBAZW4gTWV0aG9kIFRyaWdnZXJlZCBvbiBFeHRlbnNpb24gU3RhcnR1cFxuICogQHpoIOaTtOWxleWVn+WLleaZguinuOeZvOeahOaWueazlVxuICovXG5leHBvcnQgZnVuY3Rpb24gbG9hZCgpIHtcbiAgICBsb2dnZXIuaW5mbygnQ29jb3MgTUNQIFNlcnZlciBleHRlbnNpb24gbG9hZGVkJyk7XG5cbiAgICAvLyDlu7rnq4vlt6XlhbfoqLvlhorooajvvIjkuIDmrKHlr6bkvovljJbvvIzlpJromZXlhbHnlKjvvIlcbiAgICB0b29sUmVnaXN0cnkgPSBjcmVhdGVUb29sUmVnaXN0cnkoKTtcblxuICAgIC8vIOWIneWni+WMluW3peWFt+euoeeQhuWZqO+8iOaOpeaUtuWFseeUqCByZWdpc3Ryee+8iVxuICAgIHRvb2xNYW5hZ2VyID0gbmV3IFRvb2xNYW5hZ2VyKHRvb2xSZWdpc3RyeSk7XG5cbiAgICAvLyDoroDlj5boqK3nva5cbiAgICBjb25zdCBzZXR0aW5ncyA9IHJlYWRTZXR0aW5ncygpO1xuICAgIG1jcFNlcnZlciA9IG5ldyBNQ1BTZXJ2ZXIoc2V0dGluZ3MsIHRvb2xSZWdpc3RyeSk7XG5cbiAgICAvLyDliJ3lp4vljJZNQ1DmnI3li5nlmajnmoTlt6XlhbfliJfooahcbiAgICBjb25zdCBlbmFibGVkVG9vbHMgPSB0b29sTWFuYWdlci5nZXRFbmFibGVkVG9vbHMoKTtcbiAgICBtY3BTZXJ2ZXIudXBkYXRlRW5hYmxlZFRvb2xzKGVuYWJsZWRUb29scyk7XG4gICAgXG4gICAgLy8g5aaC5p6c6Kit572u5LqG6Ieq5YuV5ZWf5YuV77yM5YmH5ZWf5YuV5pyN5YuZ5ZmoXG4gICAgaWYgKHNldHRpbmdzLmF1dG9TdGFydCkge1xuICAgICAgICBtY3BTZXJ2ZXIuc3RhcnQoKS5jYXRjaChlcnIgPT4ge1xuICAgICAgICAgICAgbG9nZ2VyLmVycm9yKCdGYWlsZWQgdG8gYXV0by1zdGFydCBNQ1Agc2VydmVyOicsIGVycik7XG4gICAgICAgIH0pO1xuICAgIH1cbn1cblxuLyoqXG4gKiBAZW4gTWV0aG9kIHRyaWdnZXJlZCB3aGVuIHVuaW5zdGFsbGluZyB0aGUgZXh0ZW5zaW9uXG4gKiBAemgg5Y246LyJ5pO05bGV5pmC6Ke455m855qE5pa55rOVXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB1bmxvYWQoKSB7XG4gICAgaWYgKG1jcFNlcnZlcikge1xuICAgICAgICBhd2FpdCBtY3BTZXJ2ZXIuc3RvcCgpO1xuICAgICAgICBtY3BTZXJ2ZXIgPSBudWxsO1xuICAgIH1cblxuICAgIC8vIEludmFsaWRhdGUgTm9kZS5qcyByZXF1aXJlLmNhY2hlIGZvciBvdXIgb3duIGRpc3QvIG1vZHVsZXMgc28gdGhlXG4gICAgLy8gbmV4dCBsb2FkKCkgYWN0dWFsbHkgcmUtcmVhZHMgZnJvbSBkaXNrLiBXaXRob3V0IHRoaXMsIENvY29zJ3NcbiAgICAvLyBFeHRlbnNpb25zIOKGkiBSZWxvYWQgb25seSByZS1ydW5zIG1haW4uanMgYnV0IGV2ZXJ5IHRyYW5zaXRpdmVcbiAgICAvLyByZXF1aXJlKCcuL3Rvb2xzLy4uLicpIHJldHVybnMgdGhlIGNhY2hlZCBtb2R1bGUgZnJvbSBmaXJzdCBsb2FkIOKAlFxuICAgIC8vIGEgYG5wbSBydW4gYnVpbGRgIGJldHdlZW4gcmVsb2FkcyB3b3VsZCBoYXZlIG5vIG9ic2VydmFibGUgZWZmZWN0LlxuICAgIGNvbnN0IG91clJvb3QgPSByZXF1aXJlKCdwYXRoJykuZGlybmFtZShfX2ZpbGVuYW1lKTtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhyZXF1aXJlLmNhY2hlKSkge1xuICAgICAgICBpZiAoa2V5LnN0YXJ0c1dpdGgob3VyUm9vdCkpIHtcbiAgICAgICAgICAgIGRlbGV0ZSByZXF1aXJlLmNhY2hlW2tleV07XG4gICAgICAgIH1cbiAgICB9XG59Il19