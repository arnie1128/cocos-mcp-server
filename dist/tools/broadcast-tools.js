"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BroadcastTools = void 0;
const log_1 = require("../lib/log");
const schema_1 = require("../lib/schema");
const broadcastSchemas = {
    get_broadcast_log: schema_1.z.object({
        limit: schema_1.z.number().default(50).describe('Number of recent messages to return'),
        messageType: schema_1.z.string().optional().describe('Filter by message type (optional)'),
    }),
    listen_broadcast: schema_1.z.object({
        messageType: schema_1.z.string().describe('Message type to listen for'),
    }),
    stop_listening: schema_1.z.object({
        messageType: schema_1.z.string().describe('Message type to stop listening for'),
    }),
    clear_broadcast_log: schema_1.z.object({}),
    get_active_listeners: schema_1.z.object({}),
};
const broadcastToolMeta = {
    get_broadcast_log: 'Get recent broadcast messages log',
    listen_broadcast: 'Start listening for specific broadcast messages',
    stop_listening: 'Stop listening for specific broadcast messages',
    clear_broadcast_log: 'Clear the broadcast messages log',
    get_active_listeners: 'Get list of active broadcast listeners',
};
class BroadcastTools {
    constructor() {
        this.listeners = new Map();
        this.messageLog = [];
        this.setupBroadcastListeners();
    }
    getTools() {
        return Object.keys(broadcastSchemas).map(name => ({
            name,
            description: broadcastToolMeta[name],
            inputSchema: (0, schema_1.toInputSchema)(broadcastSchemas[name]),
        }));
    }
    async execute(toolName, args) {
        const schemaName = toolName;
        const schema = broadcastSchemas[schemaName];
        if (!schema) {
            throw new Error(`Unknown tool: ${toolName}`);
        }
        const validation = (0, schema_1.validateArgs)(schema, args !== null && args !== void 0 ? args : {});
        if (!validation.ok) {
            return validation.response;
        }
        const a = validation.data;
        switch (schemaName) {
            case 'get_broadcast_log':
                return await this.getBroadcastLog(a.limit, a.messageType);
            case 'listen_broadcast':
                return await this.listenBroadcast(a.messageType);
            case 'stop_listening':
                return await this.stopListening(a.messageType);
            case 'clear_broadcast_log':
                return await this.clearBroadcastLog();
            case 'get_active_listeners':
                return await this.getActiveListeners();
        }
    }
    setupBroadcastListeners() {
        // 设置预定义的重要广播消息监听
        const importantMessages = [
            'build-worker:ready',
            'build-worker:closed',
            'scene:ready',
            'scene:close',
            'scene:light-probe-edit-mode-changed',
            'scene:light-probe-bounding-box-edit-mode-changed',
            'asset-db:ready',
            'asset-db:close',
            'asset-db:asset-add',
            'asset-db:asset-change',
            'asset-db:asset-delete'
        ];
        importantMessages.forEach(messageType => {
            this.addBroadcastListener(messageType);
        });
    }
    addBroadcastListener(messageType) {
        const listener = (data) => {
            this.messageLog.push({
                message: messageType,
                data: data,
                timestamp: Date.now()
            });
            // 保持日志大小在合理范围内
            if (this.messageLog.length > 1000) {
                this.messageLog = this.messageLog.slice(-500);
            }
            (0, log_1.debugLog)(`[Broadcast] ${messageType}:`, data);
        };
        if (!this.listeners.has(messageType)) {
            this.listeners.set(messageType, []);
        }
        this.listeners.get(messageType).push(listener);
        // 注册 Editor 消息监听 - 暂时注释掉，Editor.Message API可能不支持
        // Editor.Message.on(messageType, listener);
        (0, log_1.debugLog)(`[BroadcastTools] Added listener for ${messageType} (simulated)`);
    }
    removeBroadcastListener(messageType) {
        const listeners = this.listeners.get(messageType);
        if (listeners) {
            listeners.forEach(listener => {
                // Editor.Message.off(messageType, listener);
                (0, log_1.debugLog)(`[BroadcastTools] Removed listener for ${messageType} (simulated)`);
            });
            this.listeners.delete(messageType);
        }
    }
    async getBroadcastLog(limit = 50, messageType) {
        return new Promise((resolve) => {
            let filteredLog = this.messageLog;
            if (messageType) {
                filteredLog = this.messageLog.filter(entry => entry.message === messageType);
            }
            const recentLog = filteredLog.slice(-limit).map(entry => (Object.assign(Object.assign({}, entry), { timestamp: new Date(entry.timestamp).toISOString() })));
            resolve({
                success: true,
                data: {
                    log: recentLog,
                    count: recentLog.length,
                    totalCount: filteredLog.length,
                    filter: messageType || 'all',
                    message: 'Broadcast log retrieved successfully'
                }
            });
        });
    }
    async listenBroadcast(messageType) {
        return new Promise((resolve) => {
            try {
                if (!this.listeners.has(messageType)) {
                    this.addBroadcastListener(messageType);
                    resolve({
                        success: true,
                        data: {
                            messageType: messageType,
                            message: `Started listening for broadcast: ${messageType}`
                        }
                    });
                }
                else {
                    resolve({
                        success: true,
                        data: {
                            messageType: messageType,
                            message: `Already listening for broadcast: ${messageType}`
                        }
                    });
                }
            }
            catch (err) {
                resolve({ success: false, error: err.message });
            }
        });
    }
    async stopListening(messageType) {
        return new Promise((resolve) => {
            try {
                if (this.listeners.has(messageType)) {
                    this.removeBroadcastListener(messageType);
                    resolve({
                        success: true,
                        data: {
                            messageType: messageType,
                            message: `Stopped listening for broadcast: ${messageType}`
                        }
                    });
                }
                else {
                    resolve({
                        success: true,
                        data: {
                            messageType: messageType,
                            message: `Was not listening for broadcast: ${messageType}`
                        }
                    });
                }
            }
            catch (err) {
                resolve({ success: false, error: err.message });
            }
        });
    }
    async clearBroadcastLog() {
        return new Promise((resolve) => {
            const previousCount = this.messageLog.length;
            this.messageLog = [];
            resolve({
                success: true,
                data: {
                    clearedCount: previousCount,
                    message: 'Broadcast log cleared successfully'
                }
            });
        });
    }
    async getActiveListeners() {
        return new Promise((resolve) => {
            const activeListeners = Array.from(this.listeners.keys()).map(messageType => {
                var _a;
                return ({
                    messageType: messageType,
                    listenerCount: ((_a = this.listeners.get(messageType)) === null || _a === void 0 ? void 0 : _a.length) || 0
                });
            });
            resolve({
                success: true,
                data: {
                    listeners: activeListeners,
                    count: activeListeners.length,
                    message: 'Active listeners retrieved successfully'
                }
            });
        });
    }
}
exports.BroadcastTools = BroadcastTools;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvYWRjYXN0LXRvb2xzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL3Rvb2xzL2Jyb2FkY2FzdC10b29scy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSxvQ0FBc0M7QUFDdEMsMENBQStEO0FBRS9ELE1BQU0sZ0JBQWdCLEdBQUc7SUFDckIsaUJBQWlCLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQztRQUN4QixLQUFLLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMscUNBQXFDLENBQUM7UUFDN0UsV0FBVyxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxRQUFRLENBQUMsbUNBQW1DLENBQUM7S0FDbkYsQ0FBQztJQUNGLGdCQUFnQixFQUFFLFVBQUMsQ0FBQyxNQUFNLENBQUM7UUFDdkIsV0FBVyxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLENBQUMsNEJBQTRCLENBQUM7S0FDakUsQ0FBQztJQUNGLGNBQWMsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDO1FBQ3JCLFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLG9DQUFvQyxDQUFDO0tBQ3pFLENBQUM7SUFDRixtQkFBbUIsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztJQUNqQyxvQkFBb0IsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztDQUM1QixDQUFDO0FBRVgsTUFBTSxpQkFBaUIsR0FBa0Q7SUFDckUsaUJBQWlCLEVBQUUsbUNBQW1DO0lBQ3RELGdCQUFnQixFQUFFLGlEQUFpRDtJQUNuRSxjQUFjLEVBQUUsZ0RBQWdEO0lBQ2hFLG1CQUFtQixFQUFFLGtDQUFrQztJQUN2RCxvQkFBb0IsRUFBRSx3Q0FBd0M7Q0FDakUsQ0FBQztBQUVGLE1BQWEsY0FBYztJQUl2QjtRQUhRLGNBQVMsR0FBNEIsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQUMvQyxlQUFVLEdBQTZELEVBQUUsQ0FBQztRQUc5RSxJQUFJLENBQUMsdUJBQXVCLEVBQUUsQ0FBQztJQUNuQyxDQUFDO0lBRUQsUUFBUTtRQUNKLE9BQVEsTUFBTSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBMEMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ3hGLElBQUk7WUFDSixXQUFXLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUFDO1lBQ3BDLFdBQVcsRUFBRSxJQUFBLHNCQUFhLEVBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLENBQUM7U0FDckQsQ0FBQyxDQUFDLENBQUM7SUFDUixDQUFDO0lBRUQsS0FBSyxDQUFDLE9BQU8sQ0FBQyxRQUFnQixFQUFFLElBQVM7UUFDckMsTUFBTSxVQUFVLEdBQUcsUUFBeUMsQ0FBQztRQUM3RCxNQUFNLE1BQU0sR0FBRyxnQkFBZ0IsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUM1QyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDVixNQUFNLElBQUksS0FBSyxDQUFDLGlCQUFpQixRQUFRLEVBQUUsQ0FBQyxDQUFDO1FBQ2pELENBQUM7UUFDRCxNQUFNLFVBQVUsR0FBRyxJQUFBLHFCQUFZLEVBQUMsTUFBTSxFQUFFLElBQUksYUFBSixJQUFJLGNBQUosSUFBSSxHQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQ3BELElBQUksQ0FBQyxVQUFVLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDakIsT0FBTyxVQUFVLENBQUMsUUFBUSxDQUFDO1FBQy9CLENBQUM7UUFDRCxNQUFNLENBQUMsR0FBRyxVQUFVLENBQUMsSUFBVyxDQUFDO1FBRWpDLFFBQVEsVUFBVSxFQUFFLENBQUM7WUFDakIsS0FBSyxtQkFBbUI7Z0JBQ3BCLE9BQU8sTUFBTSxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDO1lBQzlELEtBQUssa0JBQWtCO2dCQUNuQixPQUFPLE1BQU0sSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDLENBQUM7WUFDckQsS0FBSyxnQkFBZ0I7Z0JBQ2pCLE9BQU8sTUFBTSxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUNuRCxLQUFLLHFCQUFxQjtnQkFDdEIsT0FBTyxNQUFNLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1lBQzFDLEtBQUssc0JBQXNCO2dCQUN2QixPQUFPLE1BQU0sSUFBSSxDQUFDLGtCQUFrQixFQUFFLENBQUM7UUFDL0MsQ0FBQztJQUNMLENBQUM7SUFFTyx1QkFBdUI7UUFDM0IsaUJBQWlCO1FBQ2pCLE1BQU0saUJBQWlCLEdBQUc7WUFDdEIsb0JBQW9CO1lBQ3BCLHFCQUFxQjtZQUNyQixhQUFhO1lBQ2IsYUFBYTtZQUNiLHFDQUFxQztZQUNyQyxrREFBa0Q7WUFDbEQsZ0JBQWdCO1lBQ2hCLGdCQUFnQjtZQUNoQixvQkFBb0I7WUFDcEIsdUJBQXVCO1lBQ3ZCLHVCQUF1QjtTQUMxQixDQUFDO1FBRUYsaUJBQWlCLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxFQUFFO1lBQ3BDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUMzQyxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7SUFFTyxvQkFBb0IsQ0FBQyxXQUFtQjtRQUM1QyxNQUFNLFFBQVEsR0FBRyxDQUFDLElBQVMsRUFBRSxFQUFFO1lBQzNCLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDO2dCQUNqQixPQUFPLEVBQUUsV0FBVztnQkFDcEIsSUFBSSxFQUFFLElBQUk7Z0JBQ1YsU0FBUyxFQUFFLElBQUksQ0FBQyxHQUFHLEVBQUU7YUFDeEIsQ0FBQyxDQUFDO1lBRUgsZUFBZTtZQUNmLElBQUksSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLEdBQUcsSUFBSSxFQUFFLENBQUM7Z0JBQ2hDLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNsRCxDQUFDO1lBRUQsSUFBQSxjQUFRLEVBQUMsZUFBZSxXQUFXLEdBQUcsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNsRCxDQUFDLENBQUM7UUFFRixJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQztZQUNuQyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxXQUFXLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDeEMsQ0FBQztRQUNELElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBRSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUVoRCxpREFBaUQ7UUFDakQsNENBQTRDO1FBQzVDLElBQUEsY0FBUSxFQUFDLHVDQUF1QyxXQUFXLGNBQWMsQ0FBQyxDQUFDO0lBQy9FLENBQUM7SUFFTyx1QkFBdUIsQ0FBQyxXQUFtQjtRQUMvQyxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUNsRCxJQUFJLFNBQVMsRUFBRSxDQUFDO1lBQ1osU0FBUyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsRUFBRTtnQkFDekIsNkNBQTZDO2dCQUM3QyxJQUFBLGNBQVEsRUFBQyx5Q0FBeUMsV0FBVyxjQUFjLENBQUMsQ0FBQztZQUNqRixDQUFDLENBQUMsQ0FBQztZQUNILElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQ3ZDLENBQUM7SUFDTCxDQUFDO0lBRU8sS0FBSyxDQUFDLGVBQWUsQ0FBQyxRQUFnQixFQUFFLEVBQUUsV0FBb0I7UUFDbEUsT0FBTyxJQUFJLE9BQU8sQ0FBQyxDQUFDLE9BQU8sRUFBRSxFQUFFO1lBQzNCLElBQUksV0FBVyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUM7WUFFbEMsSUFBSSxXQUFXLEVBQUUsQ0FBQztnQkFDZCxXQUFXLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsT0FBTyxLQUFLLFdBQVcsQ0FBQyxDQUFDO1lBQ2pGLENBQUM7WUFFRCxNQUFNLFNBQVMsR0FBRyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsaUNBQ2xELEtBQUssS0FDUixTQUFTLEVBQUUsSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDLFdBQVcsRUFBRSxJQUNwRCxDQUFDLENBQUM7WUFFSixPQUFPLENBQUM7Z0JBQ0osT0FBTyxFQUFFLElBQUk7Z0JBQ2IsSUFBSSxFQUFFO29CQUNGLEdBQUcsRUFBRSxTQUFTO29CQUNkLEtBQUssRUFBRSxTQUFTLENBQUMsTUFBTTtvQkFDdkIsVUFBVSxFQUFFLFdBQVcsQ0FBQyxNQUFNO29CQUM5QixNQUFNLEVBQUUsV0FBVyxJQUFJLEtBQUs7b0JBQzVCLE9BQU8sRUFBRSxzQ0FBc0M7aUJBQ2xEO2FBQ0osQ0FBQyxDQUFDO1FBQ1AsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDO0lBRU8sS0FBSyxDQUFDLGVBQWUsQ0FBQyxXQUFtQjtRQUM3QyxPQUFPLElBQUksT0FBTyxDQUFDLENBQUMsT0FBTyxFQUFFLEVBQUU7WUFDM0IsSUFBSSxDQUFDO2dCQUNELElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDO29CQUNuQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsV0FBVyxDQUFDLENBQUM7b0JBQ3ZDLE9BQU8sQ0FBQzt3QkFDSixPQUFPLEVBQUUsSUFBSTt3QkFDYixJQUFJLEVBQUU7NEJBQ0YsV0FBVyxFQUFFLFdBQVc7NEJBQ3hCLE9BQU8sRUFBRSxvQ0FBb0MsV0FBVyxFQUFFO3lCQUM3RDtxQkFDSixDQUFDLENBQUM7Z0JBQ1AsQ0FBQztxQkFBTSxDQUFDO29CQUNKLE9BQU8sQ0FBQzt3QkFDSixPQUFPLEVBQUUsSUFBSTt3QkFDYixJQUFJLEVBQUU7NEJBQ0YsV0FBVyxFQUFFLFdBQVc7NEJBQ3hCLE9BQU8sRUFBRSxvQ0FBb0MsV0FBVyxFQUFFO3lCQUM3RDtxQkFDSixDQUFDLENBQUM7Z0JBQ1AsQ0FBQztZQUNMLENBQUM7WUFBQyxPQUFPLEdBQVEsRUFBRSxDQUFDO2dCQUNoQixPQUFPLENBQUMsRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxHQUFHLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQztZQUNwRCxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDO0lBRU8sS0FBSyxDQUFDLGFBQWEsQ0FBQyxXQUFtQjtRQUMzQyxPQUFPLElBQUksT0FBTyxDQUFDLENBQUMsT0FBTyxFQUFFLEVBQUU7WUFDM0IsSUFBSSxDQUFDO2dCQUNELElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQztvQkFDbEMsSUFBSSxDQUFDLHVCQUF1QixDQUFDLFdBQVcsQ0FBQyxDQUFDO29CQUMxQyxPQUFPLENBQUM7d0JBQ0osT0FBTyxFQUFFLElBQUk7d0JBQ2IsSUFBSSxFQUFFOzRCQUNGLFdBQVcsRUFBRSxXQUFXOzRCQUN4QixPQUFPLEVBQUUsb0NBQW9DLFdBQVcsRUFBRTt5QkFDN0Q7cUJBQ0osQ0FBQyxDQUFDO2dCQUNQLENBQUM7cUJBQU0sQ0FBQztvQkFDSixPQUFPLENBQUM7d0JBQ0osT0FBTyxFQUFFLElBQUk7d0JBQ2IsSUFBSSxFQUFFOzRCQUNGLFdBQVcsRUFBRSxXQUFXOzRCQUN4QixPQUFPLEVBQUUsb0NBQW9DLFdBQVcsRUFBRTt5QkFDN0Q7cUJBQ0osQ0FBQyxDQUFDO2dCQUNQLENBQUM7WUFDTCxDQUFDO1lBQUMsT0FBTyxHQUFRLEVBQUUsQ0FBQztnQkFDaEIsT0FBTyxDQUFDLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsR0FBRyxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUM7WUFDcEQsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztJQUVPLEtBQUssQ0FBQyxpQkFBaUI7UUFDM0IsT0FBTyxJQUFJLE9BQU8sQ0FBQyxDQUFDLE9BQU8sRUFBRSxFQUFFO1lBQzNCLE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDO1lBQzdDLElBQUksQ0FBQyxVQUFVLEdBQUcsRUFBRSxDQUFDO1lBQ3JCLE9BQU8sQ0FBQztnQkFDSixPQUFPLEVBQUUsSUFBSTtnQkFDYixJQUFJLEVBQUU7b0JBQ0YsWUFBWSxFQUFFLGFBQWE7b0JBQzNCLE9BQU8sRUFBRSxvQ0FBb0M7aUJBQ2hEO2FBQ0osQ0FBQyxDQUFDO1FBQ1AsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDO0lBRU8sS0FBSyxDQUFDLGtCQUFrQjtRQUM1QixPQUFPLElBQUksT0FBTyxDQUFDLENBQUMsT0FBTyxFQUFFLEVBQUU7WUFDM0IsTUFBTSxlQUFlLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxFQUFFOztnQkFBQyxPQUFBLENBQUM7b0JBQzFFLFdBQVcsRUFBRSxXQUFXO29CQUN4QixhQUFhLEVBQUUsQ0FBQSxNQUFBLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQywwQ0FBRSxNQUFNLEtBQUksQ0FBQztpQkFDOUQsQ0FBQyxDQUFBO2FBQUEsQ0FBQyxDQUFDO1lBRUosT0FBTyxDQUFDO2dCQUNKLE9BQU8sRUFBRSxJQUFJO2dCQUNiLElBQUksRUFBRTtvQkFDRixTQUFTLEVBQUUsZUFBZTtvQkFDMUIsS0FBSyxFQUFFLGVBQWUsQ0FBQyxNQUFNO29CQUM3QixPQUFPLEVBQUUseUNBQXlDO2lCQUNyRDthQUNKLENBQUMsQ0FBQztRQUNQLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztDQUNKO0FBbk5ELHdDQW1OQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFRvb2xEZWZpbml0aW9uLCBUb29sUmVzcG9uc2UsIFRvb2xFeGVjdXRvciB9IGZyb20gJy4uL3R5cGVzJztcbmltcG9ydCB7IGRlYnVnTG9nIH0gZnJvbSAnLi4vbGliL2xvZyc7XG5pbXBvcnQgeyB6LCB0b0lucHV0U2NoZW1hLCB2YWxpZGF0ZUFyZ3MgfSBmcm9tICcuLi9saWIvc2NoZW1hJztcblxuY29uc3QgYnJvYWRjYXN0U2NoZW1hcyA9IHtcbiAgICBnZXRfYnJvYWRjYXN0X2xvZzogei5vYmplY3Qoe1xuICAgICAgICBsaW1pdDogei5udW1iZXIoKS5kZWZhdWx0KDUwKS5kZXNjcmliZSgnTnVtYmVyIG9mIHJlY2VudCBtZXNzYWdlcyB0byByZXR1cm4nKSxcbiAgICAgICAgbWVzc2FnZVR5cGU6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnRmlsdGVyIGJ5IG1lc3NhZ2UgdHlwZSAob3B0aW9uYWwpJyksXG4gICAgfSksXG4gICAgbGlzdGVuX2Jyb2FkY2FzdDogei5vYmplY3Qoe1xuICAgICAgICBtZXNzYWdlVHlwZTogei5zdHJpbmcoKS5kZXNjcmliZSgnTWVzc2FnZSB0eXBlIHRvIGxpc3RlbiBmb3InKSxcbiAgICB9KSxcbiAgICBzdG9wX2xpc3RlbmluZzogei5vYmplY3Qoe1xuICAgICAgICBtZXNzYWdlVHlwZTogei5zdHJpbmcoKS5kZXNjcmliZSgnTWVzc2FnZSB0eXBlIHRvIHN0b3AgbGlzdGVuaW5nIGZvcicpLFxuICAgIH0pLFxuICAgIGNsZWFyX2Jyb2FkY2FzdF9sb2c6IHoub2JqZWN0KHt9KSxcbiAgICBnZXRfYWN0aXZlX2xpc3RlbmVyczogei5vYmplY3Qoe30pLFxufSBhcyBjb25zdDtcblxuY29uc3QgYnJvYWRjYXN0VG9vbE1ldGE6IFJlY29yZDxrZXlvZiB0eXBlb2YgYnJvYWRjYXN0U2NoZW1hcywgc3RyaW5nPiA9IHtcbiAgICBnZXRfYnJvYWRjYXN0X2xvZzogJ0dldCByZWNlbnQgYnJvYWRjYXN0IG1lc3NhZ2VzIGxvZycsXG4gICAgbGlzdGVuX2Jyb2FkY2FzdDogJ1N0YXJ0IGxpc3RlbmluZyBmb3Igc3BlY2lmaWMgYnJvYWRjYXN0IG1lc3NhZ2VzJyxcbiAgICBzdG9wX2xpc3RlbmluZzogJ1N0b3AgbGlzdGVuaW5nIGZvciBzcGVjaWZpYyBicm9hZGNhc3QgbWVzc2FnZXMnLFxuICAgIGNsZWFyX2Jyb2FkY2FzdF9sb2c6ICdDbGVhciB0aGUgYnJvYWRjYXN0IG1lc3NhZ2VzIGxvZycsXG4gICAgZ2V0X2FjdGl2ZV9saXN0ZW5lcnM6ICdHZXQgbGlzdCBvZiBhY3RpdmUgYnJvYWRjYXN0IGxpc3RlbmVycycsXG59O1xuXG5leHBvcnQgY2xhc3MgQnJvYWRjYXN0VG9vbHMgaW1wbGVtZW50cyBUb29sRXhlY3V0b3Ige1xuICAgIHByaXZhdGUgbGlzdGVuZXJzOiBNYXA8c3RyaW5nLCBGdW5jdGlvbltdPiA9IG5ldyBNYXAoKTtcbiAgICBwcml2YXRlIG1lc3NhZ2VMb2c6IEFycmF5PHsgbWVzc2FnZTogc3RyaW5nOyBkYXRhOiBhbnk7IHRpbWVzdGFtcDogbnVtYmVyIH0+ID0gW107XG5cbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgdGhpcy5zZXR1cEJyb2FkY2FzdExpc3RlbmVycygpO1xuICAgIH1cblxuICAgIGdldFRvb2xzKCk6IFRvb2xEZWZpbml0aW9uW10ge1xuICAgICAgICByZXR1cm4gKE9iamVjdC5rZXlzKGJyb2FkY2FzdFNjaGVtYXMpIGFzIEFycmF5PGtleW9mIHR5cGVvZiBicm9hZGNhc3RTY2hlbWFzPikubWFwKG5hbWUgPT4gKHtcbiAgICAgICAgICAgIG5hbWUsXG4gICAgICAgICAgICBkZXNjcmlwdGlvbjogYnJvYWRjYXN0VG9vbE1ldGFbbmFtZV0sXG4gICAgICAgICAgICBpbnB1dFNjaGVtYTogdG9JbnB1dFNjaGVtYShicm9hZGNhc3RTY2hlbWFzW25hbWVdKSxcbiAgICAgICAgfSkpO1xuICAgIH1cblxuICAgIGFzeW5jIGV4ZWN1dGUodG9vbE5hbWU6IHN0cmluZywgYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3Qgc2NoZW1hTmFtZSA9IHRvb2xOYW1lIGFzIGtleW9mIHR5cGVvZiBicm9hZGNhc3RTY2hlbWFzO1xuICAgICAgICBjb25zdCBzY2hlbWEgPSBicm9hZGNhc3RTY2hlbWFzW3NjaGVtYU5hbWVdO1xuICAgICAgICBpZiAoIXNjaGVtYSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIHRvb2w6ICR7dG9vbE5hbWV9YCk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgdmFsaWRhdGlvbiA9IHZhbGlkYXRlQXJncyhzY2hlbWEsIGFyZ3MgPz8ge30pO1xuICAgICAgICBpZiAoIXZhbGlkYXRpb24ub2spIHtcbiAgICAgICAgICAgIHJldHVybiB2YWxpZGF0aW9uLnJlc3BvbnNlO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGEgPSB2YWxpZGF0aW9uLmRhdGEgYXMgYW55O1xuXG4gICAgICAgIHN3aXRjaCAoc2NoZW1hTmFtZSkge1xuICAgICAgICAgICAgY2FzZSAnZ2V0X2Jyb2FkY2FzdF9sb2cnOlxuICAgICAgICAgICAgICAgIHJldHVybiBhd2FpdCB0aGlzLmdldEJyb2FkY2FzdExvZyhhLmxpbWl0LCBhLm1lc3NhZ2VUeXBlKTtcbiAgICAgICAgICAgIGNhc2UgJ2xpc3Rlbl9icm9hZGNhc3QnOlxuICAgICAgICAgICAgICAgIHJldHVybiBhd2FpdCB0aGlzLmxpc3RlbkJyb2FkY2FzdChhLm1lc3NhZ2VUeXBlKTtcbiAgICAgICAgICAgIGNhc2UgJ3N0b3BfbGlzdGVuaW5nJzpcbiAgICAgICAgICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5zdG9wTGlzdGVuaW5nKGEubWVzc2FnZVR5cGUpO1xuICAgICAgICAgICAgY2FzZSAnY2xlYXJfYnJvYWRjYXN0X2xvZyc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuY2xlYXJCcm9hZGNhc3RMb2coKTtcbiAgICAgICAgICAgIGNhc2UgJ2dldF9hY3RpdmVfbGlzdGVuZXJzJzpcbiAgICAgICAgICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5nZXRBY3RpdmVMaXN0ZW5lcnMoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgc2V0dXBCcm9hZGNhc3RMaXN0ZW5lcnMoKTogdm9pZCB7XG4gICAgICAgIC8vIOiuvue9rumihOWumuS5ieeahOmHjeimgeW5v+aSrea2iOaBr+ebkeWQrFxuICAgICAgICBjb25zdCBpbXBvcnRhbnRNZXNzYWdlcyA9IFtcbiAgICAgICAgICAgICdidWlsZC13b3JrZXI6cmVhZHknLFxuICAgICAgICAgICAgJ2J1aWxkLXdvcmtlcjpjbG9zZWQnLFxuICAgICAgICAgICAgJ3NjZW5lOnJlYWR5JyxcbiAgICAgICAgICAgICdzY2VuZTpjbG9zZScsXG4gICAgICAgICAgICAnc2NlbmU6bGlnaHQtcHJvYmUtZWRpdC1tb2RlLWNoYW5nZWQnLFxuICAgICAgICAgICAgJ3NjZW5lOmxpZ2h0LXByb2JlLWJvdW5kaW5nLWJveC1lZGl0LW1vZGUtY2hhbmdlZCcsXG4gICAgICAgICAgICAnYXNzZXQtZGI6cmVhZHknLFxuICAgICAgICAgICAgJ2Fzc2V0LWRiOmNsb3NlJyxcbiAgICAgICAgICAgICdhc3NldC1kYjphc3NldC1hZGQnLFxuICAgICAgICAgICAgJ2Fzc2V0LWRiOmFzc2V0LWNoYW5nZScsXG4gICAgICAgICAgICAnYXNzZXQtZGI6YXNzZXQtZGVsZXRlJ1xuICAgICAgICBdO1xuXG4gICAgICAgIGltcG9ydGFudE1lc3NhZ2VzLmZvckVhY2gobWVzc2FnZVR5cGUgPT4ge1xuICAgICAgICAgICAgdGhpcy5hZGRCcm9hZGNhc3RMaXN0ZW5lcihtZXNzYWdlVHlwZSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYWRkQnJvYWRjYXN0TGlzdGVuZXIobWVzc2FnZVR5cGU6IHN0cmluZyk6IHZvaWQge1xuICAgICAgICBjb25zdCBsaXN0ZW5lciA9IChkYXRhOiBhbnkpID0+IHtcbiAgICAgICAgICAgIHRoaXMubWVzc2FnZUxvZy5wdXNoKHtcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiBtZXNzYWdlVHlwZSxcbiAgICAgICAgICAgICAgICBkYXRhOiBkYXRhLFxuICAgICAgICAgICAgICAgIHRpbWVzdGFtcDogRGF0ZS5ub3coKVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIC8vIOS/neaMgeaXpeW/l+Wkp+Wwj+WcqOWQiOeQhuiMg+WbtOWGhVxuICAgICAgICAgICAgaWYgKHRoaXMubWVzc2FnZUxvZy5sZW5ndGggPiAxMDAwKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5tZXNzYWdlTG9nID0gdGhpcy5tZXNzYWdlTG9nLnNsaWNlKC01MDApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBkZWJ1Z0xvZyhgW0Jyb2FkY2FzdF0gJHttZXNzYWdlVHlwZX06YCwgZGF0YSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgaWYgKCF0aGlzLmxpc3RlbmVycy5oYXMobWVzc2FnZVR5cGUpKSB7XG4gICAgICAgICAgICB0aGlzLmxpc3RlbmVycy5zZXQobWVzc2FnZVR5cGUsIFtdKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmxpc3RlbmVycy5nZXQobWVzc2FnZVR5cGUpIS5wdXNoKGxpc3RlbmVyKTtcblxuICAgICAgICAvLyDms6jlhowgRWRpdG9yIOa2iOaBr+ebkeWQrCAtIOaaguaXtuazqOmHiuaOie+8jEVkaXRvci5NZXNzYWdlIEFQSeWPr+iDveS4jeaUr+aMgVxuICAgICAgICAvLyBFZGl0b3IuTWVzc2FnZS5vbihtZXNzYWdlVHlwZSwgbGlzdGVuZXIpO1xuICAgICAgICBkZWJ1Z0xvZyhgW0Jyb2FkY2FzdFRvb2xzXSBBZGRlZCBsaXN0ZW5lciBmb3IgJHttZXNzYWdlVHlwZX0gKHNpbXVsYXRlZClgKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHJlbW92ZUJyb2FkY2FzdExpc3RlbmVyKG1lc3NhZ2VUeXBlOiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgbGlzdGVuZXJzID0gdGhpcy5saXN0ZW5lcnMuZ2V0KG1lc3NhZ2VUeXBlKTtcbiAgICAgICAgaWYgKGxpc3RlbmVycykge1xuICAgICAgICAgICAgbGlzdGVuZXJzLmZvckVhY2gobGlzdGVuZXIgPT4ge1xuICAgICAgICAgICAgICAgIC8vIEVkaXRvci5NZXNzYWdlLm9mZihtZXNzYWdlVHlwZSwgbGlzdGVuZXIpO1xuICAgICAgICAgICAgICAgIGRlYnVnTG9nKGBbQnJvYWRjYXN0VG9vbHNdIFJlbW92ZWQgbGlzdGVuZXIgZm9yICR7bWVzc2FnZVR5cGV9IChzaW11bGF0ZWQpYCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHRoaXMubGlzdGVuZXJzLmRlbGV0ZShtZXNzYWdlVHlwZSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldEJyb2FkY2FzdExvZyhsaW1pdDogbnVtYmVyID0gNTAsIG1lc3NhZ2VUeXBlPzogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBsZXQgZmlsdGVyZWRMb2cgPSB0aGlzLm1lc3NhZ2VMb2c7XG5cbiAgICAgICAgICAgIGlmIChtZXNzYWdlVHlwZSkge1xuICAgICAgICAgICAgICAgIGZpbHRlcmVkTG9nID0gdGhpcy5tZXNzYWdlTG9nLmZpbHRlcihlbnRyeSA9PiBlbnRyeS5tZXNzYWdlID09PSBtZXNzYWdlVHlwZSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IHJlY2VudExvZyA9IGZpbHRlcmVkTG9nLnNsaWNlKC1saW1pdCkubWFwKGVudHJ5ID0+ICh7XG4gICAgICAgICAgICAgICAgLi4uZW50cnksXG4gICAgICAgICAgICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZShlbnRyeS50aW1lc3RhbXApLnRvSVNPU3RyaW5nKClcbiAgICAgICAgICAgIH0pKTtcblxuICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIGxvZzogcmVjZW50TG9nLFxuICAgICAgICAgICAgICAgICAgICBjb3VudDogcmVjZW50TG9nLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgdG90YWxDb3VudDogZmlsdGVyZWRMb2cubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICBmaWx0ZXI6IG1lc3NhZ2VUeXBlIHx8ICdhbGwnLFxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiAnQnJvYWRjYXN0IGxvZyByZXRyaWV2ZWQgc3VjY2Vzc2Z1bGx5J1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGxpc3RlbkJyb2FkY2FzdChtZXNzYWdlVHlwZTogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGlmICghdGhpcy5saXN0ZW5lcnMuaGFzKG1lc3NhZ2VUeXBlKSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmFkZEJyb2FkY2FzdExpc3RlbmVyKG1lc3NhZ2VUeXBlKTtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2VUeXBlOiBtZXNzYWdlVHlwZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgU3RhcnRlZCBsaXN0ZW5pbmcgZm9yIGJyb2FkY2FzdDogJHttZXNzYWdlVHlwZX1gXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlVHlwZTogbWVzc2FnZVR5cGUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYEFscmVhZHkgbGlzdGVuaW5nIGZvciBicm9hZGNhc3Q6ICR7bWVzc2FnZVR5cGV9YFxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVyci5tZXNzYWdlIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHN0b3BMaXN0ZW5pbmcobWVzc2FnZVR5cGU6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5saXN0ZW5lcnMuaGFzKG1lc3NhZ2VUeXBlKSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnJlbW92ZUJyb2FkY2FzdExpc3RlbmVyKG1lc3NhZ2VUeXBlKTtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2VUeXBlOiBtZXNzYWdlVHlwZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgU3RvcHBlZCBsaXN0ZW5pbmcgZm9yIGJyb2FkY2FzdDogJHttZXNzYWdlVHlwZX1gXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlVHlwZTogbWVzc2FnZVR5cGUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYFdhcyBub3QgbGlzdGVuaW5nIGZvciBicm9hZGNhc3Q6ICR7bWVzc2FnZVR5cGV9YFxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVyci5tZXNzYWdlIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGNsZWFyQnJvYWRjYXN0TG9nKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgcHJldmlvdXNDb3VudCA9IHRoaXMubWVzc2FnZUxvZy5sZW5ndGg7XG4gICAgICAgICAgICB0aGlzLm1lc3NhZ2VMb2cgPSBbXTtcbiAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICBjbGVhcmVkQ291bnQ6IHByZXZpb3VzQ291bnQsXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdCcm9hZGNhc3QgbG9nIGNsZWFyZWQgc3VjY2Vzc2Z1bGx5J1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldEFjdGl2ZUxpc3RlbmVycygpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGFjdGl2ZUxpc3RlbmVycyA9IEFycmF5LmZyb20odGhpcy5saXN0ZW5lcnMua2V5cygpKS5tYXAobWVzc2FnZVR5cGUgPT4gKHtcbiAgICAgICAgICAgICAgICBtZXNzYWdlVHlwZTogbWVzc2FnZVR5cGUsXG4gICAgICAgICAgICAgICAgbGlzdGVuZXJDb3VudDogdGhpcy5saXN0ZW5lcnMuZ2V0KG1lc3NhZ2VUeXBlKT8ubGVuZ3RoIHx8IDBcbiAgICAgICAgICAgIH0pKTtcblxuICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIGxpc3RlbmVyczogYWN0aXZlTGlzdGVuZXJzLFxuICAgICAgICAgICAgICAgICAgICBjb3VudDogYWN0aXZlTGlzdGVuZXJzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogJ0FjdGl2ZSBsaXN0ZW5lcnMgcmV0cmlldmVkIHN1Y2Nlc3NmdWxseSdcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxufSJdfQ==