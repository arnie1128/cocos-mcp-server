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
 * @zh 为扩展的主进程的注册方法
 */
exports.methods = {
    /**
     * @en Open the MCP server panel
     * @zh 打开 MCP 服务器面板
     */
    openPanel() {
        Editor.Panel.open('cocos-mcp-server');
    },
    /**
     * @en Start the MCP server
     * @zh 启动 MCP 服务器
     */
    async startServer() {
        if (mcpServer) {
            // 确保使用最新的工具配置
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
     * @zh 停止 MCP 服务器
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
     * @zh 获取服务器状态
     */
    getServerStatus() {
        const status = mcpServer ? mcpServer.getStatus() : { running: false, port: 0, clients: 0 };
        const settings = mcpServer ? mcpServer.getSettings() : (0, settings_1.readSettings)();
        return Object.assign(Object.assign({}, status), { settings: settings });
    },
    /**
     * @en Update server settings
     * @zh 更新服务器设置
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
     * @zh 获取工具列表
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
     * @zh 获取服务器设置
     */
    async getServerSettings() {
        return mcpServer ? mcpServer.getSettings() : (0, settings_1.readSettings)();
    },
    /**
     * @en Get server settings (alternative method)
     * @zh 获取服务器设置（替代方法）
     */
    async getSettings() {
        return mcpServer ? mcpServer.getSettings() : (0, settings_1.readSettings)();
    },
    // 工具管理器相关方法
    async getToolManagerState() {
        return toolManager.getToolManagerState();
    },
    async createToolConfiguration(name, description) {
        try {
            const config = toolManager.createConfiguration(name, description);
            return { success: true, id: config.id, config };
        }
        catch (error) {
            throw new Error(`创建配置失败: ${error.message}`);
        }
    },
    async updateToolConfiguration(configId, updates) {
        try {
            return toolManager.updateConfiguration(configId, updates);
        }
        catch (error) {
            throw new Error(`更新配置失败: ${error.message}`);
        }
    },
    async deleteToolConfiguration(configId) {
        try {
            toolManager.deleteConfiguration(configId);
            return { success: true };
        }
        catch (error) {
            throw new Error(`删除配置失败: ${error.message}`);
        }
    },
    async setCurrentToolConfiguration(configId) {
        try {
            toolManager.setCurrentConfiguration(configId);
            return { success: true };
        }
        catch (error) {
            throw new Error(`设置当前配置失败: ${error.message}`);
        }
    },
    async updateToolStatus(category, toolName, enabled) {
        try {
            const currentConfig = toolManager.getCurrentConfiguration();
            if (!currentConfig) {
                throw new Error('没有当前配置');
            }
            toolManager.updateToolStatus(currentConfig.id, category, toolName, enabled);
            // 更新MCP服务器的工具列表
            if (mcpServer) {
                const enabledTools = toolManager.getEnabledTools();
                mcpServer.updateEnabledTools(enabledTools);
            }
            return { success: true };
        }
        catch (error) {
            throw new Error(`更新工具状态失败: ${error.message}`);
        }
    },
    async updateToolStatusBatch(updates) {
        try {
            log_1.logger.debug(`[Main] updateToolStatusBatch called with updates count:`, updates ? updates.length : 0);
            const currentConfig = toolManager.getCurrentConfiguration();
            if (!currentConfig) {
                throw new Error('没有当前配置');
            }
            toolManager.updateToolStatusBatch(currentConfig.id, updates);
            // 更新MCP服务器的工具列表
            if (mcpServer) {
                const enabledTools = toolManager.getEnabledTools();
                mcpServer.updateEnabledTools(enabledTools);
            }
            return { success: true };
        }
        catch (error) {
            throw new Error(`批量更新工具状态失败: ${error.message}`);
        }
    },
    async exportToolConfiguration(configId) {
        try {
            return { configJson: toolManager.exportConfiguration(configId) };
        }
        catch (error) {
            throw new Error(`导出配置失败: ${error.message}`);
        }
    },
    async importToolConfiguration(configJson) {
        try {
            return toolManager.importConfiguration(configJson);
        }
        catch (error) {
            throw new Error(`导入配置失败: ${error.message}`);
        }
    },
    async getEnabledTools() {
        return toolManager.getEnabledTools();
    }
};
/**
 * @en Method Triggered on Extension Startup
 * @zh 扩展启动时触发的方法
 */
function load() {
    log_1.logger.info('Cocos MCP Server extension loaded');
    // 建立工具註冊表（一次實例化，多處共用）
    toolRegistry = (0, registry_1.createToolRegistry)();
    // 初始化工具管理器（接收共用 registry）
    toolManager = new tool_manager_1.ToolManager(toolRegistry);
    // 读取设置
    const settings = (0, settings_1.readSettings)();
    mcpServer = new mcp_server_sdk_1.MCPServer(settings, toolRegistry);
    // 初始化MCP服务器的工具列表
    const enabledTools = toolManager.getEnabledTools();
    mcpServer.updateEnabledTools(enabledTools);
    // 如果设置了自动启动，则启动服务器
    if (settings.autoStart) {
        mcpServer.start().catch(err => {
            log_1.logger.error('Failed to auto-start MCP server:', err);
        });
    }
}
/**
 * @en Method triggered when uninstalling the extension
 * @zh 卸载扩展时触发的方法
 */
async function unload() {
    if (mcpServer) {
        await mcpServer.stop();
        mcpServer = null;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NvdXJjZS9tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQWtPQSxvQkF1QkM7QUFNRCx3QkFLQztBQXBRRCxxREFBNkM7QUFDN0MseUNBQXdEO0FBRXhELHVEQUFtRDtBQUNuRCwrQ0FBb0U7QUFDcEUsbUNBQW1DO0FBRW5DLElBQUksU0FBUyxHQUFxQixJQUFJLENBQUM7QUFDdkMsSUFBSSxXQUF3QixDQUFDO0FBQzdCLElBQUksWUFBMEIsQ0FBQztBQUUvQjs7O0dBR0c7QUFDVSxRQUFBLE9BQU8sR0FBNEM7SUFDNUQ7OztPQUdHO0lBQ0gsU0FBUztRQUNMLE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLENBQUM7SUFDMUMsQ0FBQztJQUlEOzs7T0FHRztJQUNILEtBQUssQ0FBQyxXQUFXO1FBQ2IsSUFBSSxTQUFTLEVBQUUsQ0FBQztZQUNaLGNBQWM7WUFDZCxNQUFNLFlBQVksR0FBRyxXQUFXLENBQUMsZUFBZSxFQUFFLENBQUM7WUFDbkQsU0FBUyxDQUFDLGtCQUFrQixDQUFDLFlBQVksQ0FBQyxDQUFDO1lBQzNDLE1BQU0sU0FBUyxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQzVCLENBQUM7YUFBTSxDQUFDO1lBQ0osWUFBTSxDQUFDLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO1FBQzFDLENBQUM7SUFDTCxDQUFDO0lBRUQ7OztPQUdHO0lBQ0gsS0FBSyxDQUFDLFVBQVU7UUFDWixJQUFJLFNBQVMsRUFBRSxDQUFDO1lBQ1osTUFBTSxTQUFTLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDM0IsQ0FBQzthQUFNLENBQUM7WUFDSixZQUFNLENBQUMsSUFBSSxDQUFDLHdCQUF3QixDQUFDLENBQUM7UUFDMUMsQ0FBQztJQUNMLENBQUM7SUFFRDs7O09BR0c7SUFDSCxlQUFlO1FBQ1gsTUFBTSxNQUFNLEdBQUcsU0FBUyxDQUFDLENBQUMsQ0FB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Q0FBQztJQUUzQyxtQkFBbUI7SUFDbkIsSUFBSSxRQUFRLENBQUMsU0FBUyxFQUFFLENBQUM7UUFDckIsU0FBUyxDQUFDLEtBQUssRUFBRSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsRUFBRTtZQUMxQixZQUFNLENBQUMsS0FBSyxDQUFDLGtDQUFrQyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQzFELENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztBQUNMLENBQUM7QUFFRDs7O0dBR0c7QUFDSSxLQUFLLFVBQVUsTUFBTTtJQUN4QixJQUFJLFNBQVMsRUFBRSxDQUFDO1FBQ1osTUFBTSxTQUFTLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDdkIsU0FBUyxHQUFHLElBQUksQ0FBQztJQUNyQixDQUFDO0FBQ0wsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IE1DUFNlcnZlciB9IGZyb20gJy4vbWNwLXNlcnZlci1zZGsnO1xuaW1wb3J0IHsgcmVhZFNldHRpbmdzLCBzYXZlU2V0dGluZ3MgfSBmcm9tICcuL3NldHRpbmdzJztcbmltcG9ydCB7IE1DUFNlcnZlclNldHRpbmdzIH0gZnJvbSAnLi90eXBlcyc7XG5pbXBvcnQgeyBUb29sTWFuYWdlciB9IGZyb20gJy4vdG9vbHMvdG9vbC1tYW5hZ2VyJztcbmltcG9ydCB7IGNyZWF0ZVRvb2xSZWdpc3RyeSwgVG9vbFJlZ2lzdHJ5IH0gZnJvbSAnLi90b29scy9yZWdpc3RyeSc7XG5pbXBvcnQgeyBsb2dnZXIgfSBmcm9tICcuL2xpYi9sb2cnO1xuXG5sZXQgbWNwU2VydmVyOiBNQ1BTZXJ2ZXIgfCBudWxsID0gbnVsbDtcbmxldCB0b29sTWFuYWdlcjogVG9vbE1hbmFnZXI7XG5sZXQgdG9vbFJlZ2lzdHJ5OiBUb29sUmVnaXN0cnk7XG5cbi8qKlxuICogQGVuIFJlZ2lzdHJhdGlvbiBtZXRob2QgZm9yIHRoZSBtYWluIHByb2Nlc3Mgb2YgRXh0ZW5zaW9uXG4gKiBAemgg5Li65omp5bGV55qE5Li76L+b56iL55qE5rOo5YaM5pa55rOVXG4gKi9cbmV4cG9ydCBjb25zdCBtZXRob2RzOiB7IFtrZXk6IHN0cmluZ106ICguLi5hbnk6IGFueSkgPT4gYW55IH0gPSB7XG4gICAgLyoqXG4gICAgICogQGVuIE9wZW4gdGhlIE1DUCBzZXJ2ZXIgcGFuZWxcbiAgICAgKiBAemgg5omT5byAIE1DUCDmnI3liqHlmajpnaLmnb9cbiAgICAgKi9cbiAgICBvcGVuUGFuZWwoKSB7XG4gICAgICAgIEVkaXRvci5QYW5lbC5vcGVuKCdjb2Nvcy1tY3Atc2VydmVyJyk7XG4gICAgfSxcblxuXG5cbiAgICAvKipcbiAgICAgKiBAZW4gU3RhcnQgdGhlIE1DUCBzZXJ2ZXJcbiAgICAgKiBAemgg5ZCv5YqoIE1DUCDmnI3liqHlmahcbiAgICAgKi9cbiAgICBhc3luYyBzdGFydFNlcnZlcigpIHtcbiAgICAgICAgaWYgKG1jcFNlcnZlcikge1xuICAgICAgICAgICAgLy8g56Gu5L+d5L2/55So5pyA5paw55qE5bel5YW36YWN572uXG4gICAgICAgICAgICBjb25zdCBlbmFibGVkVG9vbHMgPSB0b29sTWFuYWdlci5nZXRFbmFibGVkVG9vbHMoKTtcbiAgICAgICAgICAgIG1jcFNlcnZlci51cGRhdGVFbmFibGVkVG9vbHMoZW5hYmxlZFRvb2xzKTtcbiAgICAgICAgICAgIGF3YWl0IG1jcFNlcnZlci5zdGFydCgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbG9nZ2VyLndhcm4oJ1tNQ1Dmj5Lku7ZdIG1jcFNlcnZlciDmnKrliJ3lp4vljJYnKTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBAZW4gU3RvcCB0aGUgTUNQIHNlcnZlclxuICAgICAqIEB6aCDlgZzmraIgTUNQIOacjeWKoeWZqFxuICAgICAqL1xuICAgIGFzeW5jIHN0b3BTZXJ2ZXIoKSB7XG4gICAgICAgIGlmIChtY3BTZXJ2ZXIpIHtcbiAgICAgICAgICAgIGF3YWl0IG1jcFNlcnZlci5zdG9wKCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsb2dnZXIud2FybignW01DUOaPkuS7tl0gbWNwU2VydmVyIOacquWIneWni+WMlicpO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEBlbiBHZXQgc2VydmVyIHN0YXR1c1xuICAgICAqIEB6aCDojrflj5bmnI3liqHlmajnirbmgIFcbiAgICAgKi9cbiAgICBnZXRTZXJ2ZXJTdGF0dXMoKSB7XG4gICAgICAgIGNvbnN0IHN0YXR1cyA9IG1jcFNlcnZlciA/IG1jcFNlcnZlci5nZXRTdGF0dXMoKSA6IHsgcnVubmluZzogZmFsc2UsIHBvcnQ6IDAsIGNsaWVudHM6IDAgfTtcbiAgICAgICAgY29uc3Qgc2V0dGluZ3MgPSBtY3BTZXJ2ZXIgPyBtY3BTZXJ2ZXIuZ2V0U2V0dGluZ3MoKSA6IHJlYWRTZXR0aW5ncygpO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgLi4uc3RhdHVzLFxuICAgICAgICAgICAgc2V0dGluZ3M6IHNldHRpbmdzXG4gICAgICAgIH07XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEBlbiBVcGRhdGUgc2VydmVyIHNldHRpbmdzXG4gICAgICogQHpoIOabtOaWsOacjeWKoeWZqOiuvue9rlxuICAgICAqL1xuICAgIGFzeW5jIHVwZGF0ZVNldHRpbmdzKHNldHRpbmdzOiBNQ1BTZXJ2ZXJTZXR0aW5ncykge1xuICAgICAgICBzYXZlU2V0dGluZ3Moc2V0dGluZ3MpO1xuICAgICAgICBpZiAobWNwU2VydmVyKSB7XG4gICAgICAgICAgICBhd2FpdCBtY3BTZXJ2ZXIuc3RvcCgpO1xuICAgICAgICB9XG4gICAgICAgIG1jcFNlcnZlciA9IG5ldyBNQ1BTZXJ2ZXIoc2V0dGluZ3MsIHRvb2xSZWdpc3RyeSk7XG4gICAgICAgIC8vIFJlc3RvcmUgdGhlIHVzZXIncyBlbmFibGVkLXRvb2wgZmlsdGVyOyB3aXRob3V0IHRoaXMsIGV2ZXJ5XG4gICAgICAgIC8vIHNldHRpbmdzIHNhdmUgd291bGQgZXhwb3NlIGFsbCAxNTcgdG9vbHMgcmVnYXJkbGVzcyBvZiB3aGF0XG4gICAgICAgIC8vIHRoZSB0b29sIG1hbmFnZXIgaGFzIGNvbmZpZ3VyZWQuIE1pcnJvcnMgdGhlIGxvYWQoKSBmbG93LlxuICAgICAgICBtY3BTZXJ2ZXIudXBkYXRlRW5hYmxlZFRvb2xzKHRvb2xNYW5hZ2VyLmdldEVuYWJsZWRUb29scygpKTtcbiAgICAgICAgYXdhaXQgbWNwU2VydmVyLnN0YXJ0KCk7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEBlbiBHZXQgdG9vbHMgbGlzdFxuICAgICAqIEB6aCDojrflj5blt6XlhbfliJfooahcbiAgICAgKi9cbiAgICBnZXRUb29sc0xpc3QoKSB7XG4gICAgICAgIHJldHVybiBtY3BTZXJ2ZXIgPyBtY3BTZXJ2ZXIuZ2V0QXZhaWxhYmxlVG9vbHMoKSA6IFtdO1xuICAgIH0sXG5cbiAgICBnZXRGaWx0ZXJlZFRvb2xzTGlzdCgpIHtcbiAgICAgICAgaWYgKCFtY3BTZXJ2ZXIpIHJldHVybiBbXTtcbiAgICAgICAgLy8gdXBkYXRlRW5hYmxlZFRvb2xzIHJlYnVpbGRzIHRvb2xzTGlzdCBhbHJlYWR5IGZpbHRlcmVkIGJ5IHRoZVxuICAgICAgICAvLyBjdXJyZW50IGVuYWJsZWQgc2V0IGluc2lkZSBzZXR1cFRvb2xzKCk7IGdldEF2YWlsYWJsZVRvb2xzIHRoZW5cbiAgICAgICAgLy8gcmV0dXJucyB0aGF0IGZpbHRlcmVkIGxpc3QuIFRoZSBwcmV2aW91cyBnZXRGaWx0ZXJlZFRvb2xzKCkgZGlkXG4gICAgICAgIC8vIGEgcmVkdW5kYW50IHNlY29uZCBmaWx0ZXIgb24gdGhlIHNhbWUgc2V0LlxuICAgICAgICBjb25zdCBlbmFibGVkVG9vbHMgPSB0b29sTWFuYWdlci5nZXRFbmFibGVkVG9vbHMoKTtcbiAgICAgICAgbWNwU2VydmVyLnVwZGF0ZUVuYWJsZWRUb29scyhlbmFibGVkVG9vbHMpO1xuICAgICAgICByZXR1cm4gbWNwU2VydmVyLmdldEF2YWlsYWJsZVRvb2xzKCk7XG4gICAgfSxcbiAgICAvKipcbiAgICAgKiBAZW4gR2V0IHNlcnZlciBzZXR0aW5nc1xuICAgICAqIEB6aCDojrflj5bmnI3liqHlmajorr7nva5cbiAgICAgKi9cbiAgICBhc3luYyBnZXRTZXJ2ZXJTZXR0aW5ncygpIHtcbiAgICAgICAgcmV0dXJuIG1jcFNlcnZlciA/IG1jcFNlcnZlci5nZXRTZXR0aW5ncygpIDogcmVhZFNldHRpbmdzKCk7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEBlbiBHZXQgc2VydmVyIHNldHRpbmdzIChhbHRlcm5hdGl2ZSBtZXRob2QpXG4gICAgICogQHpoIOiOt+WPluacjeWKoeWZqOiuvue9ru+8iOabv+S7o+aWueazle+8iVxuICAgICAqL1xuICAgIGFzeW5jIGdldFNldHRpbmdzKCkge1xuICAgICAgICByZXR1cm4gbWNwU2VydmVyID8gbWNwU2VydmVyLmdldFNldHRpbmdzKCkgOiByZWFkU2V0dGluZ3MoKTtcbiAgICB9LFxuXG4gICAgLy8g5bel5YW3566h55CG5Zmo55u45YWz5pa55rOVXG4gICAgYXN5bmMgZ2V0VG9vbE1hbmFnZXJTdGF0ZSgpIHtcbiAgICAgICAgcmV0dXJuIHRvb2xNYW5hZ2VyLmdldFRvb2xNYW5hZ2VyU3RhdGUoKTtcbiAgICB9LFxuXG4gICAgYXN5bmMgY3JlYXRlVG9vbENvbmZpZ3VyYXRpb24obmFtZTogc3RyaW5nLCBkZXNjcmlwdGlvbj86IHN0cmluZykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgY29uZmlnID0gdG9vbE1hbmFnZXIuY3JlYXRlQ29uZmlndXJhdGlvbihuYW1lLCBkZXNjcmlwdGlvbik7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBpZDogY29uZmlnLmlkLCBjb25maWcgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGDliJvlu7rphY3nva7lpLHotKU6ICR7ZXJyb3IubWVzc2FnZX1gKTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICBhc3luYyB1cGRhdGVUb29sQ29uZmlndXJhdGlvbihjb25maWdJZDogc3RyaW5nLCB1cGRhdGVzOiBhbnkpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHJldHVybiB0b29sTWFuYWdlci51cGRhdGVDb25maWd1cmF0aW9uKGNvbmZpZ0lkLCB1cGRhdGVzKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGDmm7TmlrDphY3nva7lpLHotKU6ICR7ZXJyb3IubWVzc2FnZX1gKTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICBhc3luYyBkZWxldGVUb29sQ29uZmlndXJhdGlvbihjb25maWdJZDogc3RyaW5nKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICB0b29sTWFuYWdlci5kZWxldGVDb25maWd1cmF0aW9uKGNvbmZpZ0lkKTtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGDliKDpmaTphY3nva7lpLHotKU6ICR7ZXJyb3IubWVzc2FnZX1gKTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICBhc3luYyBzZXRDdXJyZW50VG9vbENvbmZpZ3VyYXRpb24oY29uZmlnSWQ6IHN0cmluZykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgdG9vbE1hbmFnZXIuc2V0Q3VycmVudENvbmZpZ3VyYXRpb24oY29uZmlnSWQpO1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYOiuvue9ruW9k+WJjemFjee9ruWksei0pTogJHtlcnJvci5tZXNzYWdlfWApO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIGFzeW5jIHVwZGF0ZVRvb2xTdGF0dXMoY2F0ZWdvcnk6IHN0cmluZywgdG9vbE5hbWU6IHN0cmluZywgZW5hYmxlZDogYm9vbGVhbikge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgY3VycmVudENvbmZpZyA9IHRvb2xNYW5hZ2VyLmdldEN1cnJlbnRDb25maWd1cmF0aW9uKCk7XG4gICAgICAgICAgICBpZiAoIWN1cnJlbnRDb25maWcpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ+ayoeacieW9k+WJjemFjee9ricpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICB0b29sTWFuYWdlci51cGRhdGVUb29sU3RhdHVzKGN1cnJlbnRDb25maWcuaWQsIGNhdGVnb3J5LCB0b29sTmFtZSwgZW5hYmxlZCk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIOabtOaWsE1DUOacjeWKoeWZqOeahOW3peWFt+WIl+ihqFxuICAgICAgICAgICAgaWYgKG1jcFNlcnZlcikge1xuICAgICAgICAgICAgICAgIGNvbnN0IGVuYWJsZWRUb29scyA9IHRvb2xNYW5hZ2VyLmdldEVuYWJsZWRUb29scygpO1xuICAgICAgICAgICAgICAgIG1jcFNlcnZlci51cGRhdGVFbmFibGVkVG9vbHMoZW5hYmxlZFRvb2xzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYOabtOaWsOW3peWFt+eKtuaAgeWksei0pTogJHtlcnJvci5tZXNzYWdlfWApO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIGFzeW5jIHVwZGF0ZVRvb2xTdGF0dXNCYXRjaCh1cGRhdGVzOiBhbnlbXSkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgbG9nZ2VyLmRlYnVnKGBbTWFpbl0gdXBkYXRlVG9vbFN0YXR1c0JhdGNoIGNhbGxlZCB3aXRoIHVwZGF0ZXMgY291bnQ6YCwgdXBkYXRlcyA/IHVwZGF0ZXMubGVuZ3RoIDogMCk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGNvbnN0IGN1cnJlbnRDb25maWcgPSB0b29sTWFuYWdlci5nZXRDdXJyZW50Q29uZmlndXJhdGlvbigpO1xuICAgICAgICAgICAgaWYgKCFjdXJyZW50Q29uZmlnKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCfmsqHmnInlvZPliY3phY3nva4nKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgdG9vbE1hbmFnZXIudXBkYXRlVG9vbFN0YXR1c0JhdGNoKGN1cnJlbnRDb25maWcuaWQsIHVwZGF0ZXMpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyDmm7TmlrBNQ1DmnI3liqHlmajnmoTlt6XlhbfliJfooahcbiAgICAgICAgICAgIGlmIChtY3BTZXJ2ZXIpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBlbmFibGVkVG9vbHMgPSB0b29sTWFuYWdlci5nZXRFbmFibGVkVG9vbHMoKTtcbiAgICAgICAgICAgICAgICBtY3BTZXJ2ZXIudXBkYXRlRW5hYmxlZFRvb2xzKGVuYWJsZWRUb29scyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGDmibnph4/mm7TmlrDlt6XlhbfnirbmgIHlpLHotKU6ICR7ZXJyb3IubWVzc2FnZX1gKTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICBhc3luYyBleHBvcnRUb29sQ29uZmlndXJhdGlvbihjb25maWdJZDogc3RyaW5nKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICByZXR1cm4geyBjb25maWdKc29uOiB0b29sTWFuYWdlci5leHBvcnRDb25maWd1cmF0aW9uKGNvbmZpZ0lkKSB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYOWvvOWHuumFjee9ruWksei0pTogJHtlcnJvci5tZXNzYWdlfWApO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIGFzeW5jIGltcG9ydFRvb2xDb25maWd1cmF0aW9uKGNvbmZpZ0pzb246IHN0cmluZykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgcmV0dXJuIHRvb2xNYW5hZ2VyLmltcG9ydENvbmZpZ3VyYXRpb24oY29uZmlnSnNvbik7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihg5a+85YWl6YWN572u5aSx6LSlOiAke2Vycm9yLm1lc3NhZ2V9YCk7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgYXN5bmMgZ2V0RW5hYmxlZFRvb2xzKCkge1xuICAgICAgICByZXR1cm4gdG9vbE1hbmFnZXIuZ2V0RW5hYmxlZFRvb2xzKCk7XG4gICAgfVxufTtcblxuLyoqXG4gKiBAZW4gTWV0aG9kIFRyaWdnZXJlZCBvbiBFeHRlbnNpb24gU3RhcnR1cFxuICogQHpoIOaJqeWxleWQr+WKqOaXtuinpuWPkeeahOaWueazlVxuICovXG5leHBvcnQgZnVuY3Rpb24gbG9hZCgpIHtcbiAgICBsb2dnZXIuaW5mbygnQ29jb3MgTUNQIFNlcnZlciBleHRlbnNpb24gbG9hZGVkJyk7XG5cbiAgICAvLyDlu7rnq4vlt6XlhbfoqLvlhorooajvvIjkuIDmrKHlr6bkvovljJbvvIzlpJromZXlhbHnlKjvvIlcbiAgICB0b29sUmVnaXN0cnkgPSBjcmVhdGVUb29sUmVnaXN0cnkoKTtcblxuICAgIC8vIOWIneWni+WMluW3peWFt+euoeeQhuWZqO+8iOaOpeaUtuWFseeUqCByZWdpc3Ryee+8iVxuICAgIHRvb2xNYW5hZ2VyID0gbmV3IFRvb2xNYW5hZ2VyKHRvb2xSZWdpc3RyeSk7XG5cbiAgICAvLyDor7vlj5borr7nva5cbiAgICBjb25zdCBzZXR0aW5ncyA9IHJlYWRTZXR0aW5ncygpO1xuICAgIG1jcFNlcnZlciA9IG5ldyBNQ1BTZXJ2ZXIoc2V0dGluZ3MsIHRvb2xSZWdpc3RyeSk7XG5cbiAgICAvLyDliJ3lp4vljJZNQ1DmnI3liqHlmajnmoTlt6XlhbfliJfooahcbiAgICBjb25zdCBlbmFibGVkVG9vbHMgPSB0b29sTWFuYWdlci5nZXRFbmFibGVkVG9vbHMoKTtcbiAgICBtY3BTZXJ2ZXIudXBkYXRlRW5hYmxlZFRvb2xzKGVuYWJsZWRUb29scyk7XG4gICAgXG4gICAgLy8g5aaC5p6c6K6+572u5LqG6Ieq5Yqo5ZCv5Yqo77yM5YiZ5ZCv5Yqo5pyN5Yqh5ZmoXG4gICAgaWYgKHNldHRpbmdzLmF1dG9TdGFydCkge1xuICAgICAgICBtY3BTZXJ2ZXIuc3RhcnQoKS5jYXRjaChlcnIgPT4ge1xuICAgICAgICAgICAgbG9nZ2VyLmVycm9yKCdGYWlsZWQgdG8gYXV0by1zdGFydCBNQ1Agc2VydmVyOicsIGVycik7XG4gICAgICAgIH0pO1xuICAgIH1cbn1cblxuLyoqXG4gKiBAZW4gTWV0aG9kIHRyaWdnZXJlZCB3aGVuIHVuaW5zdGFsbGluZyB0aGUgZXh0ZW5zaW9uXG4gKiBAemgg5Y246L295omp5bGV5pe26Kem5Y+R55qE5pa55rOVXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB1bmxvYWQoKSB7XG4gICAgaWYgKG1jcFNlcnZlcikge1xuICAgICAgICBhd2FpdCBtY3BTZXJ2ZXIuc3RvcCgpO1xuICAgICAgICBtY3BTZXJ2ZXIgPSBudWxsO1xuICAgIH1cbn0iXX0=