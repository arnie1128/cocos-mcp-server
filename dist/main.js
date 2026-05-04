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
     * @en Toggle the MCP server from the Extensions menu — starts when
     *     stopped, stops when running. Cocos cannot update menu labels
     *     at runtime, so a single "Start / Stop" entry handles both
     *     directions. State change shows up in any open panel via the
     *     existing 2s polling loop.
     * @zh 從擴展選單切換 MCP 服務器 — 未執行時啟動、執行中時停止。
     */
    async toggleServer() {
        var _a;
        if (!mcpServer) {
            log_1.logger.warn('[MCP插件] mcpServer 未初始化，無法 toggle');
            return;
        }
        const wasRunning = mcpServer.getStatus().running;
        try {
            if (wasRunning) {
                await mcpServer.stop();
                log_1.logger.info('[MCP插件] 透過選單關閉 MCP Server');
            }
            else {
                const enabledTools = toolManager.getEnabledTools();
                mcpServer.updateEnabledTools(enabledTools);
                await mcpServer.start();
                const status = mcpServer.getStatus();
                log_1.logger.info(`[MCP插件] 透過選單啟動 MCP Server，listening on http://127.0.0.1:${status.port}/mcp`);
            }
        }
        catch (err) {
            log_1.logger.error(`[MCP插件] toggle 失敗：${(_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : err}`);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NvdXJjZS9tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQTZRQSxvQkF1QkM7QUFNRCx3QkFpQkM7QUEzVEQscURBQTZDO0FBQzdDLHlDQUF3RDtBQUV4RCx1REFBbUQ7QUFDbkQsK0NBQW9FO0FBQ3BFLG1DQUFtQztBQUVuQyxJQUFJLFNBQVMsR0FBcUIsSUFBSSxDQUFDO0FBQ3ZDLElBQUksV0FBd0IsQ0FBQztBQUM3QixJQUFJLFlBQTBCLENBQUM7QUFFL0I7OztHQUdHO0FBQ1UsUUFBQSxPQUFPLEdBQTRDO0lBQzVEOzs7T0FHRztJQUNILFNBQVM7UUFDTCxNQUFNLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO0lBQzFDLENBQUM7SUFJRDs7O09BR0c7SUFDSCxLQUFLLENBQUMsV0FBVztRQUNiLElBQUksU0FBUyxFQUFFLENBQUM7WUFDWixjQUFjO1lBQ2QsTUFBTSxZQUFZLEdBQUcsV0FBVyxDQUFDLGVBQWUsRUFBRSxDQUFDO1lBQ25ELFNBQVMsQ0FBQyxrQkFBa0IsQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUMzQyxNQUFNLFNBQVMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUM1QixDQUFDO2FBQU0sQ0FBQztZQUNKLFlBQU0sQ0FBQyxJQUFJLENBQUMsd0JBQXdCLENBQUMsQ0FBQztRQUMxQyxDQUFDO0lBQ0wsQ0FBQztJQUVEOzs7T0FHRztJQUNILEtBQUssQ0FBQyxVQUFVO1FBQ1osSUFBSSxTQUFTLEVBQUUsQ0FBQztZQUNaLE1BQU0sU0FBUyxDQUFDLElBQUksRUFBRSxDQUFDO1FBQzNCLENBQUM7YUFBTSxDQUFDO1lBQ0osWUFBTSxDQUFDLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO1FBQzFDLENBQUM7SUFDTCxDQUFDO0lBRUQ7Ozs7Ozs7T0FPRztJQUNILEtBQUssQ0FBQyxZQUFZOztRQUNkLElBQUksQ0FBQyxTQUFTLEVB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SUFDTCxDQUFDO0FBQ0wsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IE1DUFNlcnZlciB9IGZyb20gJy4vbWNwLXNlcnZlci1zZGsnO1xuaW1wb3J0IHsgcmVhZFNldHRpbmdzLCBzYXZlU2V0dGluZ3MgfSBmcm9tICcuL3NldHRpbmdzJztcbmltcG9ydCB7IE1DUFNlcnZlclNldHRpbmdzIH0gZnJvbSAnLi90eXBlcyc7XG5pbXBvcnQgeyBUb29sTWFuYWdlciB9IGZyb20gJy4vdG9vbHMvdG9vbC1tYW5hZ2VyJztcbmltcG9ydCB7IGNyZWF0ZVRvb2xSZWdpc3RyeSwgVG9vbFJlZ2lzdHJ5IH0gZnJvbSAnLi90b29scy9yZWdpc3RyeSc7XG5pbXBvcnQgeyBsb2dnZXIgfSBmcm9tICcuL2xpYi9sb2cnO1xuXG5sZXQgbWNwU2VydmVyOiBNQ1BTZXJ2ZXIgfCBudWxsID0gbnVsbDtcbmxldCB0b29sTWFuYWdlcjogVG9vbE1hbmFnZXI7XG5sZXQgdG9vbFJlZ2lzdHJ5OiBUb29sUmVnaXN0cnk7XG5cbi8qKlxuICogQGVuIFJlZ2lzdHJhdGlvbiBtZXRob2QgZm9yIHRoZSBtYWluIHByb2Nlc3Mgb2YgRXh0ZW5zaW9uXG4gKiBAemgg54K65pO05bGV55qE5Li76YCy56iL55qE6Ki75YaK5pa55rOVXG4gKi9cbmV4cG9ydCBjb25zdCBtZXRob2RzOiB7IFtrZXk6IHN0cmluZ106ICguLi5hbnk6IGFueSkgPT4gYW55IH0gPSB7XG4gICAgLyoqXG4gICAgICogQGVuIE9wZW4gdGhlIE1DUCBzZXJ2ZXIgcGFuZWxcbiAgICAgKiBAemgg5omT6ZaLIE1DUCDmnI3li5nlmajpnaLmnb9cbiAgICAgKi9cbiAgICBvcGVuUGFuZWwoKSB7XG4gICAgICAgIEVkaXRvci5QYW5lbC5vcGVuKCdjb2Nvcy1tY3Atc2VydmVyJyk7XG4gICAgfSxcblxuXG5cbiAgICAvKipcbiAgICAgKiBAZW4gU3RhcnQgdGhlIE1DUCBzZXJ2ZXJcbiAgICAgKiBAemgg5ZWf5YuVIE1DUCDmnI3li5nlmahcbiAgICAgKi9cbiAgICBhc3luYyBzdGFydFNlcnZlcigpIHtcbiAgICAgICAgaWYgKG1jcFNlcnZlcikge1xuICAgICAgICAgICAgLy8g56K65L+d5L2/55So5pyA5paw55qE5bel5YW36YWN572uXG4gICAgICAgICAgICBjb25zdCBlbmFibGVkVG9vbHMgPSB0b29sTWFuYWdlci5nZXRFbmFibGVkVG9vbHMoKTtcbiAgICAgICAgICAgIG1jcFNlcnZlci51cGRhdGVFbmFibGVkVG9vbHMoZW5hYmxlZFRvb2xzKTtcbiAgICAgICAgICAgIGF3YWl0IG1jcFNlcnZlci5zdGFydCgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbG9nZ2VyLndhcm4oJ1tNQ1Dmj5Lku7ZdIG1jcFNlcnZlciDmnKrliJ3lp4vljJYnKTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBAZW4gU3RvcCB0aGUgTUNQIHNlcnZlclxuICAgICAqIEB6aCDlgZzmraIgTUNQIOacjeWLmeWZqFxuICAgICAqL1xuICAgIGFzeW5jIHN0b3BTZXJ2ZXIoKSB7XG4gICAgICAgIGlmIChtY3BTZXJ2ZXIpIHtcbiAgICAgICAgICAgIGF3YWl0IG1jcFNlcnZlci5zdG9wKCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsb2dnZXIud2FybignW01DUOaPkuS7tl0gbWNwU2VydmVyIOacquWIneWni+WMlicpO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEBlbiBUb2dnbGUgdGhlIE1DUCBzZXJ2ZXIgZnJvbSB0aGUgRXh0ZW5zaW9ucyBtZW51IOKAlCBzdGFydHMgd2hlblxuICAgICAqICAgICBzdG9wcGVkLCBzdG9wcyB3aGVuIHJ1bm5pbmcuIENvY29zIGNhbm5vdCB1cGRhdGUgbWVudSBsYWJlbHNcbiAgICAgKiAgICAgYXQgcnVudGltZSwgc28gYSBzaW5nbGUgXCJTdGFydCAvIFN0b3BcIiBlbnRyeSBoYW5kbGVzIGJvdGhcbiAgICAgKiAgICAgZGlyZWN0aW9ucy4gU3RhdGUgY2hhbmdlIHNob3dzIHVwIGluIGFueSBvcGVuIHBhbmVsIHZpYSB0aGVcbiAgICAgKiAgICAgZXhpc3RpbmcgMnMgcG9sbGluZyBsb29wLlxuICAgICAqIEB6aCDlvp7mk7TlsZXpgbjllq7liIfmj5sgTUNQIOacjeWLmeWZqCDigJQg5pyq5Z+36KGM5pmC5ZWf5YuV44CB5Z+36KGM5Lit5pmC5YGc5q2i44CCXG4gICAgICovXG4gICAgYXN5bmMgdG9nZ2xlU2VydmVyKCkge1xuICAgICAgICBpZiAoIW1jcFNlcnZlcikge1xuICAgICAgICAgICAgbG9nZ2VyLndhcm4oJ1tNQ1Dmj5Lku7ZdIG1jcFNlcnZlciDmnKrliJ3lp4vljJbvvIznhKHms5UgdG9nZ2xlJyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qgd2FzUnVubmluZyA9IG1jcFNlcnZlci5nZXRTdGF0dXMoKS5ydW5uaW5nO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgaWYgKHdhc1J1bm5pbmcpIHtcbiAgICAgICAgICAgICAgICBhd2FpdCBtY3BTZXJ2ZXIuc3RvcCgpO1xuICAgICAgICAgICAgICAgIGxvZ2dlci5pbmZvKCdbTUNQ5o+S5Lu2XSDpgI/pgY7pgbjllq7pl5zplokgTUNQIFNlcnZlcicpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zdCBlbmFibGVkVG9vbHMgPSB0b29sTWFuYWdlci5nZXRFbmFibGVkVG9vbHMoKTtcbiAgICAgICAgICAgICAgICBtY3BTZXJ2ZXIudXBkYXRlRW5hYmxlZFRvb2xzKGVuYWJsZWRUb29scyk7XG4gICAgICAgICAgICAgICAgYXdhaXQgbWNwU2VydmVyLnN0YXJ0KCk7XG4gICAgICAgICAgICAgICAgY29uc3Qgc3RhdHVzID0gbWNwU2VydmVyLmdldFN0YXR1cygpO1xuICAgICAgICAgICAgICAgIGxvZ2dlci5pbmZvKGBbTUNQ5o+S5Lu2XSDpgI/pgY7pgbjllq7llZ/li5UgTUNQIFNlcnZlcu+8jGxpc3RlbmluZyBvbiBodHRwOi8vMTI3LjAuMC4xOiR7c3RhdHVzLnBvcnR9L21jcGApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgbG9nZ2VyLmVycm9yKGBbTUNQ5o+S5Lu2XSB0b2dnbGUg5aSx5pWX77yaJHtlcnI/Lm1lc3NhZ2UgPz8gZXJyfWApO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEBlbiBHZXQgc2VydmVyIHN0YXR1c1xuICAgICAqIEB6aCDnjbLlj5bmnI3li5nlmajni4DmhYtcbiAgICAgKi9cbiAgICBnZXRTZXJ2ZXJTdGF0dXMoKSB7XG4gICAgICAgIGNvbnN0IHN0YXR1cyA9IG1jcFNlcnZlciA/IG1jcFNlcnZlci5nZXRTdGF0dXMoKSA6IHsgcnVubmluZzogZmFsc2UsIHBvcnQ6IDAsIGNsaWVudHM6IDAgfTtcbiAgICAgICAgY29uc3Qgc2V0dGluZ3MgPSBtY3BTZXJ2ZXIgPyBtY3BTZXJ2ZXIuZ2V0U2V0dGluZ3MoKSA6IHJlYWRTZXR0aW5ncygpO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgLi4uc3RhdHVzLFxuICAgICAgICAgICAgc2V0dGluZ3M6IHNldHRpbmdzXG4gICAgICAgIH07XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEBlbiBVcGRhdGUgc2VydmVyIHNldHRpbmdzXG4gICAgICogQHpoIOabtOaWsOacjeWLmeWZqOioree9rlxuICAgICAqL1xuICAgIGFzeW5jIHVwZGF0ZVNldHRpbmdzKHNldHRpbmdzOiBNQ1BTZXJ2ZXJTZXR0aW5ncykge1xuICAgICAgICBzYXZlU2V0dGluZ3Moc2V0dGluZ3MpO1xuICAgICAgICBpZiAobWNwU2VydmVyKSB7XG4gICAgICAgICAgICBhd2FpdCBtY3BTZXJ2ZXIuc3RvcCgpO1xuICAgICAgICB9XG4gICAgICAgIG1jcFNlcnZlciA9IG5ldyBNQ1BTZXJ2ZXIoc2V0dGluZ3MsIHRvb2xSZWdpc3RyeSk7XG4gICAgICAgIC8vIFJlc3RvcmUgdGhlIHVzZXIncyBlbmFibGVkLXRvb2wgZmlsdGVyOyB3aXRob3V0IHRoaXMsIGV2ZXJ5XG4gICAgICAgIC8vIHNldHRpbmdzIHNhdmUgd291bGQgZXhwb3NlIGFsbCAxNTcgdG9vbHMgcmVnYXJkbGVzcyBvZiB3aGF0XG4gICAgICAgIC8vIHRoZSB0b29sIG1hbmFnZXIgaGFzIGNvbmZpZ3VyZWQuIE1pcnJvcnMgdGhlIGxvYWQoKSBmbG93LlxuICAgICAgICBtY3BTZXJ2ZXIudXBkYXRlRW5hYmxlZFRvb2xzKHRvb2xNYW5hZ2VyLmdldEVuYWJsZWRUb29scygpKTtcbiAgICAgICAgYXdhaXQgbWNwU2VydmVyLnN0YXJ0KCk7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEBlbiBHZXQgdG9vbHMgbGlzdFxuICAgICAqIEB6aCDnjbLlj5blt6XlhbfliJfooahcbiAgICAgKi9cbiAgICBnZXRUb29sc0xpc3QoKSB7XG4gICAgICAgIHJldHVybiBtY3BTZXJ2ZXIgPyBtY3BTZXJ2ZXIuZ2V0QXZhaWxhYmxlVG9vbHMoKSA6IFtdO1xuICAgIH0sXG5cbiAgICBnZXRGaWx0ZXJlZFRvb2xzTGlzdCgpIHtcbiAgICAgICAgaWYgKCFtY3BTZXJ2ZXIpIHJldHVybiBbXTtcbiAgICAgICAgLy8gdXBkYXRlRW5hYmxlZFRvb2xzIHJlYnVpbGRzIHRvb2xzTGlzdCBhbHJlYWR5IGZpbHRlcmVkIGJ5IHRoZVxuICAgICAgICAvLyBjdXJyZW50IGVuYWJsZWQgc2V0IGluc2lkZSBzZXR1cFRvb2xzKCk7IGdldEF2YWlsYWJsZVRvb2xzIHRoZW5cbiAgICAgICAgLy8gcmV0dXJucyB0aGF0IGZpbHRlcmVkIGxpc3QuIFRoZSBwcmV2aW91cyBnZXRGaWx0ZXJlZFRvb2xzKCkgZGlkXG4gICAgICAgIC8vIGEgcmVkdW5kYW50IHNlY29uZCBmaWx0ZXIgb24gdGhlIHNhbWUgc2V0LlxuICAgICAgICBjb25zdCBlbmFibGVkVG9vbHMgPSB0b29sTWFuYWdlci5nZXRFbmFibGVkVG9vbHMoKTtcbiAgICAgICAgbWNwU2VydmVyLnVwZGF0ZUVuYWJsZWRUb29scyhlbmFibGVkVG9vbHMpO1xuICAgICAgICByZXR1cm4gbWNwU2VydmVyLmdldEF2YWlsYWJsZVRvb2xzKCk7XG4gICAgfSxcbiAgICAvKipcbiAgICAgKiBAZW4gR2V0IHNlcnZlciBzZXR0aW5nc1xuICAgICAqIEB6aCDnjbLlj5bmnI3li5nlmajoqK3nva5cbiAgICAgKi9cbiAgICBhc3luYyBnZXRTZXJ2ZXJTZXR0aW5ncygpIHtcbiAgICAgICAgcmV0dXJuIG1jcFNlcnZlciA/IG1jcFNlcnZlci5nZXRTZXR0aW5ncygpIDogcmVhZFNldHRpbmdzKCk7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEBlbiBHZXQgc2VydmVyIHNldHRpbmdzIChhbHRlcm5hdGl2ZSBtZXRob2QpXG4gICAgICogQHpoIOeNsuWPluacjeWLmeWZqOioree9ru+8iOabv+S7o+aWueazle+8iVxuICAgICAqL1xuICAgIGFzeW5jIGdldFNldHRpbmdzKCkge1xuICAgICAgICByZXR1cm4gbWNwU2VydmVyID8gbWNwU2VydmVyLmdldFNldHRpbmdzKCkgOiByZWFkU2V0dGluZ3MoKTtcbiAgICB9LFxuXG4gICAgLy8g5bel5YW3566h55CG5Zmo55u46Zec5pa55rOVXG4gICAgYXN5bmMgZ2V0VG9vbE1hbmFnZXJTdGF0ZSgpIHtcbiAgICAgICAgcmV0dXJuIHRvb2xNYW5hZ2VyLmdldFRvb2xNYW5hZ2VyU3RhdGUoKTtcbiAgICB9LFxuXG4gICAgYXN5bmMgY3JlYXRlVG9vbENvbmZpZ3VyYXRpb24obmFtZTogc3RyaW5nLCBkZXNjcmlwdGlvbj86IHN0cmluZykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgY29uZmlnID0gdG9vbE1hbmFnZXIuY3JlYXRlQ29uZmlndXJhdGlvbihuYW1lLCBkZXNjcmlwdGlvbik7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBpZDogY29uZmlnLmlkLCBjb25maWcgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGDlibXlu7rphY3nva7lpLHmlZc6ICR7ZXJyb3IubWVzc2FnZX1gKTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICBhc3luYyB1cGRhdGVUb29sQ29uZmlndXJhdGlvbihjb25maWdJZDogc3RyaW5nLCB1cGRhdGVzOiBhbnkpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHJldHVybiB0b29sTWFuYWdlci51cGRhdGVDb25maWd1cmF0aW9uKGNvbmZpZ0lkLCB1cGRhdGVzKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGDmm7TmlrDphY3nva7lpLHmlZc6ICR7ZXJyb3IubWVzc2FnZX1gKTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICBhc3luYyBkZWxldGVUb29sQ29uZmlndXJhdGlvbihjb25maWdJZDogc3RyaW5nKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICB0b29sTWFuYWdlci5kZWxldGVDb25maWd1cmF0aW9uKGNvbmZpZ0lkKTtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGDliKrpmaTphY3nva7lpLHmlZc6ICR7ZXJyb3IubWVzc2FnZX1gKTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICBhc3luYyBzZXRDdXJyZW50VG9vbENvbmZpZ3VyYXRpb24oY29uZmlnSWQ6IHN0cmluZykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgdG9vbE1hbmFnZXIuc2V0Q3VycmVudENvbmZpZ3VyYXRpb24oY29uZmlnSWQpO1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYOioree9rueVtuWJjemFjee9ruWkseaVlzogJHtlcnJvci5tZXNzYWdlfWApO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIGFzeW5jIHVwZGF0ZVRvb2xTdGF0dXMoY2F0ZWdvcnk6IHN0cmluZywgdG9vbE5hbWU6IHN0cmluZywgZW5hYmxlZDogYm9vbGVhbikge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgY3VycmVudENvbmZpZyA9IHRvb2xNYW5hZ2VyLmdldEN1cnJlbnRDb25maWd1cmF0aW9uKCk7XG4gICAgICAgICAgICBpZiAoIWN1cnJlbnRDb25maWcpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ+aykuacieeVtuWJjemFjee9ricpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICB0b29sTWFuYWdlci51cGRhdGVUb29sU3RhdHVzKGN1cnJlbnRDb25maWcuaWQsIGNhdGVnb3J5LCB0b29sTmFtZSwgZW5hYmxlZCk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIOabtOaWsE1DUOacjeWLmeWZqOeahOW3peWFt+WIl+ihqFxuICAgICAgICAgICAgaWYgKG1jcFNlcnZlcikge1xuICAgICAgICAgICAgICAgIGNvbnN0IGVuYWJsZWRUb29scyA9IHRvb2xNYW5hZ2VyLmdldEVuYWJsZWRUb29scygpO1xuICAgICAgICAgICAgICAgIG1jcFNlcnZlci51cGRhdGVFbmFibGVkVG9vbHMoZW5hYmxlZFRvb2xzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYOabtOaWsOW3peWFt+eLgOaFi+WkseaVlzogJHtlcnJvci5tZXNzYWdlfWApO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIGFzeW5jIHVwZGF0ZVRvb2xTdGF0dXNCYXRjaCh1cGRhdGVzOiBhbnlbXSkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgbG9nZ2VyLmRlYnVnKGBbTWFpbl0gdXBkYXRlVG9vbFN0YXR1c0JhdGNoIGNhbGxlZCB3aXRoIHVwZGF0ZXMgY291bnQ6YCwgdXBkYXRlcyA/IHVwZGF0ZXMubGVuZ3RoIDogMCk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGNvbnN0IGN1cnJlbnRDb25maWcgPSB0b29sTWFuYWdlci5nZXRDdXJyZW50Q29uZmlndXJhdGlvbigpO1xuICAgICAgICAgICAgaWYgKCFjdXJyZW50Q29uZmlnKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCfmspLmnInnlbbliY3phY3nva4nKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgdG9vbE1hbmFnZXIudXBkYXRlVG9vbFN0YXR1c0JhdGNoKGN1cnJlbnRDb25maWcuaWQsIHVwZGF0ZXMpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyDmm7TmlrBNQ1DmnI3li5nlmajnmoTlt6XlhbfliJfooahcbiAgICAgICAgICAgIGlmIChtY3BTZXJ2ZXIpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBlbmFibGVkVG9vbHMgPSB0b29sTWFuYWdlci5nZXRFbmFibGVkVG9vbHMoKTtcbiAgICAgICAgICAgICAgICBtY3BTZXJ2ZXIudXBkYXRlRW5hYmxlZFRvb2xzKGVuYWJsZWRUb29scyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGDmibnph4/mm7TmlrDlt6Xlhbfni4DmhYvlpLHmlZc6ICR7ZXJyb3IubWVzc2FnZX1gKTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICBhc3luYyBleHBvcnRUb29sQ29uZmlndXJhdGlvbihjb25maWdJZDogc3RyaW5nKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICByZXR1cm4geyBjb25maWdKc29uOiB0b29sTWFuYWdlci5leHBvcnRDb25maWd1cmF0aW9uKGNvbmZpZ0lkKSB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYOWwjuWHuumFjee9ruWkseaVlzogJHtlcnJvci5tZXNzYWdlfWApO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIGFzeW5jIGltcG9ydFRvb2xDb25maWd1cmF0aW9uKGNvbmZpZ0pzb246IHN0cmluZykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgcmV0dXJuIHRvb2xNYW5hZ2VyLmltcG9ydENvbmZpZ3VyYXRpb24oY29uZmlnSnNvbik7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihg5bCO5YWl6YWN572u5aSx5pWXOiAke2Vycm9yLm1lc3NhZ2V9YCk7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgYXN5bmMgZ2V0RW5hYmxlZFRvb2xzKCkge1xuICAgICAgICByZXR1cm4gdG9vbE1hbmFnZXIuZ2V0RW5hYmxlZFRvb2xzKCk7XG4gICAgfSxcblxuICAgIGFzeW5jIGFwcGx5VG9vbFByb2ZpbGUocHJvZmlsZTogJ2NvcmUnIHwgJ2Z1bGwnKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICB0b29sTWFuYWdlci5hcHBseVByb2ZpbGUocHJvZmlsZSk7XG4gICAgICAgICAgICBjb25zdCBlbmFibGVkVG9vbHMgPSB0b29sTWFuYWdlci5nZXRFbmFibGVkVG9vbHMoKTtcbiAgICAgICAgICAgIGlmIChtY3BTZXJ2ZXIpIHtcbiAgICAgICAgICAgICAgICBtY3BTZXJ2ZXIudXBkYXRlRW5hYmxlZFRvb2xzKGVuYWJsZWRUb29scyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBwcm9maWxlLCBlbmFibGVkQ291bnQ6IGVuYWJsZWRUb29scy5sZW5ndGggfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGDlpZfnlKjlt6XlhbfoqK3lrprmqpTlpLHmlZc6ICR7ZXJyb3IubWVzc2FnZX1gKTtcbiAgICAgICAgfVxuICAgIH1cbn07XG5cbi8qKlxuICogQGVuIE1ldGhvZCBUcmlnZ2VyZWQgb24gRXh0ZW5zaW9uIFN0YXJ0dXBcbiAqIEB6aCDmk7TlsZXllZ/li5XmmYLop7jnmbznmoTmlrnms5VcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGxvYWQoKSB7XG4gICAgbG9nZ2VyLmluZm8oJ0NvY29zIE1DUCBTZXJ2ZXIgZXh0ZW5zaW9uIGxvYWRlZCcpO1xuXG4gICAgLy8g5bu656uL5bel5YW36Ki75YaK6KGo77yI5LiA5qyh5a+m5L6L5YyW77yM5aSa6JmV5YWx55So77yJXG4gICAgdG9vbFJlZ2lzdHJ5ID0gY3JlYXRlVG9vbFJlZ2lzdHJ5KCk7XG5cbiAgICAvLyDliJ3lp4vljJblt6XlhbfnrqHnkIblmajvvIjmjqXmlLblhbHnlKggcmVnaXN0cnnvvIlcbiAgICB0b29sTWFuYWdlciA9IG5ldyBUb29sTWFuYWdlcih0b29sUmVnaXN0cnkpO1xuXG4gICAgLy8g6K6A5Y+W6Kit572uXG4gICAgY29uc3Qgc2V0dGluZ3MgPSByZWFkU2V0dGluZ3MoKTtcbiAgICBtY3BTZXJ2ZXIgPSBuZXcgTUNQU2VydmVyKHNldHRpbmdzLCB0b29sUmVnaXN0cnkpO1xuXG4gICAgLy8g5Yid5aeL5YyWTUNQ5pyN5YuZ5Zmo55qE5bel5YW35YiX6KGoXG4gICAgY29uc3QgZW5hYmxlZFRvb2xzID0gdG9vbE1hbmFnZXIuZ2V0RW5hYmxlZFRvb2xzKCk7XG4gICAgbWNwU2VydmVyLnVwZGF0ZUVuYWJsZWRUb29scyhlbmFibGVkVG9vbHMpO1xuICAgIFxuICAgIC8vIOWmguaenOioree9ruS6huiHquWLleWVn+WLle+8jOWJh+WVn+WLleacjeWLmeWZqFxuICAgIGlmIChzZXR0aW5ncy5hdXRvU3RhcnQpIHtcbiAgICAgICAgbWNwU2VydmVyLnN0YXJ0KCkuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgICAgIGxvZ2dlci5lcnJvcignRmFpbGVkIHRvIGF1dG8tc3RhcnQgTUNQIHNlcnZlcjonLCBlcnIpO1xuICAgICAgICB9KTtcbiAgICB9XG59XG5cbi8qKlxuICogQGVuIE1ldGhvZCB0cmlnZ2VyZWQgd2hlbiB1bmluc3RhbGxpbmcgdGhlIGV4dGVuc2lvblxuICogQHpoIOWNuOi8ieaTtOWxleaZguinuOeZvOeahOaWueazlVxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gdW5sb2FkKCkge1xuICAgIGlmIChtY3BTZXJ2ZXIpIHtcbiAgICAgICAgYXdhaXQgbWNwU2VydmVyLnN0b3AoKTtcbiAgICAgICAgbWNwU2VydmVyID0gbnVsbDtcbiAgICB9XG5cbiAgICAvLyBJbnZhbGlkYXRlIE5vZGUuanMgcmVxdWlyZS5jYWNoZSBmb3Igb3VyIG93biBkaXN0LyBtb2R1bGVzIHNvIHRoZVxuICAgIC8vIG5leHQgbG9hZCgpIGFjdHVhbGx5IHJlLXJlYWRzIGZyb20gZGlzay4gV2l0aG91dCB0aGlzLCBDb2NvcydzXG4gICAgLy8gRXh0ZW5zaW9ucyDihpIgUmVsb2FkIG9ubHkgcmUtcnVucyBtYWluLmpzIGJ1dCBldmVyeSB0cmFuc2l0aXZlXG4gICAgLy8gcmVxdWlyZSgnLi90b29scy8uLi4nKSByZXR1cm5zIHRoZSBjYWNoZWQgbW9kdWxlIGZyb20gZmlyc3QgbG9hZCDigJRcbiAgICAvLyBhIGBucG0gcnVuIGJ1aWxkYCBiZXR3ZWVuIHJlbG9hZHMgd291bGQgaGF2ZSBubyBvYnNlcnZhYmxlIGVmZmVjdC5cbiAgICBjb25zdCBvdXJSb290ID0gcmVxdWlyZSgncGF0aCcpLmRpcm5hbWUoX19maWxlbmFtZSk7XG4gICAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMocmVxdWlyZS5jYWNoZSkpIHtcbiAgICAgICAgaWYgKGtleS5zdGFydHNXaXRoKG91clJvb3QpKSB7XG4gICAgICAgICAgICBkZWxldGUgcmVxdWlyZS5jYWNoZVtrZXldO1xuICAgICAgICB9XG4gICAgfVxufSJdfQ==