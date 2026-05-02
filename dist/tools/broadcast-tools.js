"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BroadcastTools = void 0;
const response_1 = require("../lib/response");
const log_1 = require("../lib/log");
const schema_1 = require("../lib/schema");
const define_tools_1 = require("../lib/define-tools");
class BroadcastTools {
    constructor() {
        this.listeners = new Map();
        this.messageLog = [];
        this.setupBroadcastListeners();
        const defs = [
            {
                name: 'get_broadcast_log',
                title: 'Read broadcast log',
                description: 'Read the extension-local broadcast log. No project side effects; filter by messageType to inspect scene/asset-db/build-worker events.',
                inputSchema: schema_1.z.object({
                    limit: schema_1.z.number().default(50).describe('Maximum recent log entries to return. Default 50.'),
                    messageType: schema_1.z.string().optional().describe('Optional broadcast type filter, e.g. scene:ready or asset-db:asset-change.'),
                }),
                handler: a => this.getBroadcastLog(a.limit, a.messageType),
            },
            {
                name: 'listen_broadcast',
                title: 'Listen for broadcast',
                description: 'Add a messageType to the extension-local active listener list. Current path is simulated/logging only, not a guaranteed live Editor broadcast subscription.',
                inputSchema: schema_1.z.object({
                    messageType: schema_1.z.string().describe('Broadcast type to add to the local listener list. Current implementation is simulated/logging only.'),
                }),
                handler: a => this.listenBroadcast(a.messageType),
            },
            {
                name: 'stop_listening',
                title: 'Stop broadcast listener',
                description: 'Remove a messageType from the extension-local listener list. Does not affect Cocos Editor internals.',
                inputSchema: schema_1.z.object({
                    messageType: schema_1.z.string().describe('Broadcast type to remove from the local listener list.'),
                }),
                handler: a => this.stopListening(a.messageType),
            },
            {
                name: 'clear_broadcast_log',
                title: 'Clear broadcast log',
                description: 'Clear the extension-local broadcast log only. Does not modify scene, assets, or Editor state.',
                inputSchema: schema_1.z.object({}),
                handler: () => this.clearBroadcastLog(),
            },
            {
                name: 'get_active_listeners',
                title: 'Read active listeners',
                description: 'List extension-local broadcast listener types and counts for diagnostics.',
                inputSchema: schema_1.z.object({}),
                handler: () => this.getActiveListeners(),
            },
        ];
        this.exec = (0, define_tools_1.defineTools)(defs);
    }
    getTools() { return this.exec.getTools(); }
    execute(toolName, args) { return this.exec.execute(toolName, args); }
    setupBroadcastListeners() {
        // 設置預定義的重要廣播消息監聽
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
            // 保持日誌大小在合理範圍內
            if (this.messageLog.length > 1000) {
                this.messageLog = this.messageLog.slice(-500);
            }
            (0, log_1.debugLog)(`[Broadcast] ${messageType}:`, data);
        };
        if (!this.listeners.has(messageType)) {
            this.listeners.set(messageType, []);
        }
        this.listeners.get(messageType).push(listener);
        // 註冊 Editor 消息監聽 - 暫時註釋掉，Editor.Message API可能不支持
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
            resolve((0, response_1.ok)({
                log: recentLog,
                count: recentLog.length,
                totalCount: filteredLog.length,
                filter: messageType || 'all',
                message: 'Broadcast log retrieved successfully'
            }));
        });
    }
    async listenBroadcast(messageType) {
        return new Promise((resolve) => {
            try {
                if (!this.listeners.has(messageType)) {
                    this.addBroadcastListener(messageType);
                    resolve((0, response_1.ok)({
                        messageType: messageType,
                        message: `Started listening for broadcast: ${messageType}`
                    }));
                }
                else {
                    resolve((0, response_1.ok)({
                        messageType: messageType,
                        message: `Already listening for broadcast: ${messageType}`
                    }));
                }
            }
            catch (err) {
                resolve((0, response_1.fail)(err.message));
            }
        });
    }
    async stopListening(messageType) {
        return new Promise((resolve) => {
            try {
                if (this.listeners.has(messageType)) {
                    this.removeBroadcastListener(messageType);
                    resolve((0, response_1.ok)({
                        messageType: messageType,
                        message: `Stopped listening for broadcast: ${messageType}`
                    }));
                }
                else {
                    resolve((0, response_1.ok)({
                        messageType: messageType,
                        message: `Was not listening for broadcast: ${messageType}`
                    }));
                }
            }
            catch (err) {
                resolve((0, response_1.fail)(err.message));
            }
        });
    }
    async clearBroadcastLog() {
        return new Promise((resolve) => {
            const previousCount = this.messageLog.length;
            this.messageLog = [];
            resolve((0, response_1.ok)({
                clearedCount: previousCount,
                message: 'Broadcast log cleared successfully'
            }));
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
            resolve((0, response_1.ok)({
                listeners: activeListeners,
                count: activeListeners.length,
                message: 'Active listeners retrieved successfully'
            }));
        });
    }
}
exports.BroadcastTools = BroadcastTools;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvYWRjYXN0LXRvb2xzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL3Rvb2xzL2Jyb2FkY2FzdC10b29scy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSw4Q0FBMkM7QUFFM0Msb0NBQXNDO0FBQ3RDLDBDQUFrQztBQUNsQyxzREFBMkQ7QUFFM0QsTUFBYSxjQUFjO0lBS3ZCO1FBSlEsY0FBUyxHQUE0QixJQUFJLEdBQUcsRUFBRSxDQUFDO1FBQy9DLGVBQVUsR0FBNkQsRUFBRSxDQUFDO1FBSTlFLElBQUksQ0FBQyx1QkFBdUIsRUFBRSxDQUFDO1FBQy9CLE1BQU0sSUFBSSxHQUFjO1lBQ3BCO2dCQUNJLElBQUksRUFBRSxtQkFBbUI7Z0JBQ3pCLEtBQUssRUFBRSxvQkFBb0I7Z0JBQzNCLFdBQVcsRUFBRSx1SUFBdUk7Z0JBQ3BKLFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDO29CQUNsQixLQUFLLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMsbURBQW1ELENBQUM7b0JBQzNGLFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxFQUFFLENBQUMsUUFBUSxDQUFDLDRFQUE0RSxDQUFDO2lCQUM1SCxDQUFDO2dCQUNGLE9BQU8sRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsV0FBVyxDQUFDO2FBQzdEO1lBQ0Q7Z0JBQ0ksSUFBSSxFQUFFLGtCQUFrQjtnQkFDeEIsS0FBSyxFQUFFLHNCQUFzQjtnQkFDN0IsV0FBVyxFQUFFLDZKQUE2SjtnQkFDMUssV0FBVyxFQUFFLFVBQUMsQ0FBQyxNQUFNLENBQUM7b0JBQ2xCLFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLHFHQUFxRyxDQUFDO2lCQUMxSSxDQUFDO2dCQUNGLE9BQU8sRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQzthQUNwRDtZQUNEO2dCQUNJLElBQUksRUFBRSxnQkFBZ0I7Z0JBQ3RCLEtBQUssRUFBRSx5QkFBeUI7Z0JBQ2hDLFdBQVcsRUFBRSxzR0FBc0c7Z0JBQ25ILFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDO29CQUNsQixXQUFXLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyx3REFBd0QsQ0FBQztpQkFDN0YsQ0FBQztnQkFDRixPQUFPLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUM7YUFDbEQ7WUFDRDtnQkFDSSxJQUFJLEVBQUUscUJBQXFCO2dCQUMzQixLQUFLLEVBQUUscUJBQXFCO2dCQUM1QixXQUFXLEVBQUUsK0ZBQStGO2dCQUM1RyxXQUFXLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7Z0JBQ3pCLE9BQU8sRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLEVBQUU7YUFDMUM7WUFDRDtnQkFDSSxJQUFJLEVBQUUsc0JBQXNCO2dCQUM1QixLQUFLLEVBQUUsdUJBQXVCO2dCQUM5QixXQUFXLEVBQUUsMkVBQTJFO2dCQUN4RixXQUFXLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7Z0JBQ3pCLE9BQU8sRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsa0JBQWtCLEVBQUU7YUFDM0M7U0FDSixDQUFDO1FBQ0YsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFBLDBCQUFXLEVBQUMsSUFBSSxDQUFDLENBQUM7SUFDbEMsQ0FBQztJQUVELFFBQVEsS0FBdUIsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUM3RCxPQUFPLENBQUMsUUFBZ0IsRUFBRSxJQUFTLElBQTJCLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUVqRyx1QkFBdUI7UUFDM0IsaUJBQWlCO1FBQ2pCLE1BQU0saUJBQWlCLEdBQUc7WUFDdEIsb0JBQW9CO1lBQ3BCLHFCQUFxQjtZQUNyQixhQUFhO1lBQ2IsYUFBYTtZQUNiLHFDQUFxQztZQUNyQyxrREFBa0Q7WUFDbEQsZ0JBQWdCO1lBQ2hCLGdCQUFnQjtZQUNoQixvQkFBb0I7WUFDcEIsdUJBQXVCO1lBQ3ZCLHVCQUF1QjtTQUMxQixDQUFDO1FBRUYsaUJBQWlCLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxFQUFFO1lBQ3BDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUMzQyxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7SUFFTyxvQkFBb0IsQ0FBQyxXQUFtQjtRQUM1QyxNQUFNLFFBQVEsR0FBRyxDQUFDLElBQVMsRUFBRSxFQUFFO1lBQzNCLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDO2dCQUNqQixPQUFPLEVBQUUsV0FBVztnQkFDcEIsSUFBSSxFQUFFLElBQUk7Z0JBQ1YsU0FBUyxFQUFFLElBQUksQ0FBQyxHQUFHLEVBQUU7YUFDeEIsQ0FBQyxDQUFDO1lBRUgsZUFBZTtZQUNmLElBQUksSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLEdBQUcsSUFBSSxFQUFFLENBQUM7Z0JBQ2hDLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNsRCxDQUFDO1lBRUQsSUFBQSxjQUFRLEVBQUMsZUFBZSxXQUFXLEdBQUcsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNsRCxDQUFDLENBQUM7UUFFRixJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQztZQUNuQyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxXQUFXLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDeEMsQ0FBQztRQUNELElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBRSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUVoRCxpREFBaUQ7UUFDakQsNENBQTRDO1FBQzVDLElBQUEsY0FBUSxFQUFDLHVDQUF1QyxXQUFXLGNBQWMsQ0FBQyxDQUFDO0lBQy9FLENBQUM7SUFFTyx1QkFBdUIsQ0FBQyxXQUFtQjtRQUMvQyxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUNsRCxJQUFJLFNBQVMsRUFBRSxDQUFDO1lBQ1osU0FBUyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsRUFBRTtnQkFDekIsNkNBQTZDO2dCQUM3QyxJQUFBLGNBQVEsRUFBQyx5Q0FBeUMsV0FBVyxjQUFjLENBQUMsQ0FBQztZQUNqRixDQUFDLENBQUMsQ0FBQztZQUNILElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQ3ZDLENBQUM7SUFDTCxDQUFDO0lBRU8sS0FBSyxDQUFDLGVBQWUsQ0FBQyxRQUFnQixFQUFFLEVBQUUsV0FBb0I7UUFDbEUsT0FBTyxJQUFJLE9BQU8sQ0FBQyxDQUFDLE9BQU8sRUFBRSxFQUFFO1lBQzNCLElBQUksV0FBVyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUM7WUFFbEMsSUFBSSxXQUFXLEVBQUUsQ0FBQztnQkFDZCxXQUFXLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsT0FBTyxLQUFLLFdBQVcsQ0FBQyxDQUFDO1lBQ2pGLENBQUM7WUFFRCxNQUFNLFNBQVMsR0FBRyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsaUNBQ2xELEtBQUssS0FDUixTQUFTLEVBQUUsSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDLFdBQVcsRUFBRSxJQUNwRCxDQUFDLENBQUM7WUFFSixPQUFPLENBQUMsSUFBQSxhQUFFLEVBQUM7Z0JBQ0gsR0FBRyxFQUFFLFNBQVM7Z0JBQ2QsS0FBSyxFQUFFLFNBQVMsQ0FBQyxNQUFNO2dCQUN2QixVQUFVLEVBQUUsV0FBVyxDQUFDLE1BQU07Z0JBQzlCLE1BQU0sRUFBRSxXQUFXLElBQUksS0FBSztnQkFDNUIsT0FBTyxFQUFFLHNDQUFzQzthQUNsRCxDQUFDLENBQUMsQ0FBQztRQUNaLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztJQUVPLEtBQUssQ0FBQyxlQUFlLENBQUMsV0FBbUI7UUFDN0MsT0FBTyxJQUFJLE9BQU8sQ0FBQyxDQUFDLE9BQU8sRUFBRSxFQUFFO1lBQzNCLElBQUksQ0FBQztnQkFDRCxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQztvQkFDbkMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLFdBQVcsQ0FBQyxDQUFDO29CQUN2QyxPQUFPLENBQUMsSUFBQSxhQUFFLEVBQUM7d0JBQ0gsV0FBVyxFQUFFLFdBQVc7d0JBQ3hCLE9BQU8sRUFBRSxvQ0FBb0MsV0FBVyxFQUFFO3FCQUM3RCxDQUFDLENBQUMsQ0FBQztnQkFDWixDQUFDO3FCQUFNLENBQUM7b0JBQ0osT0FBTyxDQUFDLElBQUEsYUFBRSxFQUFDO3dCQUNILFdBQVcsRUFBRSxXQUFXO3dCQUN4QixPQUFPLEVBQUUsb0NBQW9DLFdBQVcsRUFBRTtxQkFDN0QsQ0FBQyxDQUFDLENBQUM7Z0JBQ1osQ0FBQztZQUNMLENBQUM7WUFBQyxPQUFPLEdBQVEsRUFBRSxDQUFDO2dCQUNoQixPQUFPLENBQUMsSUFBQSxlQUFJLEVBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7WUFDL0IsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztJQUVPLEtBQUssQ0FBQyxhQUFhLENBQUMsV0FBbUI7UUFDM0MsT0FBTyxJQUFJLE9BQU8sQ0FBQyxDQUFDLE9BQU8sRUFBRSxFQUFFO1lBQzNCLElBQUksQ0FBQztnQkFDRCxJQUFJLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUM7b0JBQ2xDLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxXQUFXLENBQUMsQ0FBQztvQkFDMUMsT0FBTyxDQUFDLElBQUEsYUFBRSxFQUFDO3dCQUNILFdBQVcsRUFBRSxXQUFXO3dCQUN4QixPQUFPLEVBQUUsb0NBQW9DLFdBQVcsRUFBRTtxQkFDN0QsQ0FBQyxDQUFDLENBQUM7Z0JBQ1osQ0FBQztxQkFBTSxDQUFDO29CQUNKLE9BQU8sQ0FBQyxJQUFBLGFBQUUsRUFBQzt3QkFDSCxXQUFXLEVBQUUsV0FBVzt3QkFDeEIsT0FBTyxFQUFFLG9DQUFvQyxXQUFXLEVBQUU7cUJBQzdELENBQUMsQ0FBQyxDQUFDO2dCQUNaLENBQUM7WUFDTCxDQUFDO1lBQUMsT0FBTyxHQUFRLEVBQUUsQ0FBQztnQkFDaEIsT0FBTyxDQUFDLElBQUEsZUFBSSxFQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQy9CLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7SUFFTyxLQUFLLENBQUMsaUJBQWlCO1FBQzNCLE9BQU8sSUFBSSxPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsRUFBRTtZQUMzQixNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQztZQUM3QyxJQUFJLENBQUMsVUFBVSxHQUFHLEVBQUUsQ0FBQztZQUNyQixPQUFPLENBQUMsSUFBQSxhQUFFLEVBQUM7Z0JBQ0gsWUFBWSxFQUFFLGFBQWE7Z0JBQzNCLE9BQU8sRUFBRSxvQ0FBb0M7YUFDaEQsQ0FBQyxDQUFDLENBQUM7UUFDWixDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7SUFFTyxLQUFLLENBQUMsa0JBQWtCO1FBQzVCLE9BQU8sSUFBSSxPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsRUFBRTtZQUMzQixNQUFNLGVBQWUsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLEVBQUU7O2dCQUFDLE9BQUEsQ0FBQztvQkFDMUUsV0FBVyxFQUFFLFdBQVc7b0JBQ3hCLGFBQWEsRUFBRSxDQUFBLE1BQUEsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLDBDQUFFLE1BQU0sS0FBSSxDQUFDO2lCQUM5RCxDQUFDLENBQUE7YUFBQSxDQUFDLENBQUM7WUFFSixPQUFPLENBQUMsSUFBQSxhQUFFLEVBQUM7Z0JBQ0gsU0FBUyxFQUFFLGVBQWU7Z0JBQzFCLEtBQUssRUFBRSxlQUFlLENBQUMsTUFBTTtnQkFDN0IsT0FBTyxFQUFFLHlDQUF5QzthQUNyRCxDQUFDLENBQUMsQ0FBQztRQUNaLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztDQUNKO0FBN01ELHdDQTZNQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IG9rLCBmYWlsIH0gZnJvbSAnLi4vbGliL3Jlc3BvbnNlJztcbmltcG9ydCB7IFRvb2xEZWZpbml0aW9uLCBUb29sUmVzcG9uc2UsIFRvb2xFeGVjdXRvciB9IGZyb20gJy4uL3R5cGVzJztcbmltcG9ydCB7IGRlYnVnTG9nIH0gZnJvbSAnLi4vbGliL2xvZyc7XG5pbXBvcnQgeyB6IH0gZnJvbSAnLi4vbGliL3NjaGVtYSc7XG5pbXBvcnQgeyBkZWZpbmVUb29scywgVG9vbERlZiB9IGZyb20gJy4uL2xpYi9kZWZpbmUtdG9vbHMnO1xuXG5leHBvcnQgY2xhc3MgQnJvYWRjYXN0VG9vbHMgaW1wbGVtZW50cyBUb29sRXhlY3V0b3Ige1xuICAgIHByaXZhdGUgbGlzdGVuZXJzOiBNYXA8c3RyaW5nLCBGdW5jdGlvbltdPiA9IG5ldyBNYXAoKTtcbiAgICBwcml2YXRlIG1lc3NhZ2VMb2c6IEFycmF5PHsgbWVzc2FnZTogc3RyaW5nOyBkYXRhOiBhbnk7IHRpbWVzdGFtcDogbnVtYmVyIH0+ID0gW107XG4gICAgcHJpdmF0ZSByZWFkb25seSBleGVjOiBUb29sRXhlY3V0b3I7XG5cbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgdGhpcy5zZXR1cEJyb2FkY2FzdExpc3RlbmVycygpO1xuICAgICAgICBjb25zdCBkZWZzOiBUb29sRGVmW10gPSBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2dldF9icm9hZGNhc3RfbG9nJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1JlYWQgYnJvYWRjYXN0IGxvZycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdSZWFkIHRoZSBleHRlbnNpb24tbG9jYWwgYnJvYWRjYXN0IGxvZy4gTm8gcHJvamVjdCBzaWRlIGVmZmVjdHM7IGZpbHRlciBieSBtZXNzYWdlVHlwZSB0byBpbnNwZWN0IHNjZW5lL2Fzc2V0LWRiL2J1aWxkLXdvcmtlciBldmVudHMuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBsaW1pdDogei5udW1iZXIoKS5kZWZhdWx0KDUwKS5kZXNjcmliZSgnTWF4aW11bSByZWNlbnQgbG9nIGVudHJpZXMgdG8gcmV0dXJuLiBEZWZhdWx0IDUwLicpLFxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlVHlwZTogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdPcHRpb25hbCBicm9hZGNhc3QgdHlwZSBmaWx0ZXIsIGUuZy4gc2NlbmU6cmVhZHkgb3IgYXNzZXQtZGI6YXNzZXQtY2hhbmdlLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy5nZXRCcm9hZGNhc3RMb2coYS5saW1pdCwgYS5tZXNzYWdlVHlwZSksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdsaXN0ZW5fYnJvYWRjYXN0JyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ0xpc3RlbiBmb3IgYnJvYWRjYXN0JyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ0FkZCBhIG1lc3NhZ2VUeXBlIHRvIHRoZSBleHRlbnNpb24tbG9jYWwgYWN0aXZlIGxpc3RlbmVyIGxpc3QuIEN1cnJlbnQgcGF0aCBpcyBzaW11bGF0ZWQvbG9nZ2luZyBvbmx5LCBub3QgYSBndWFyYW50ZWVkIGxpdmUgRWRpdG9yIGJyb2FkY2FzdCBzdWJzY3JpcHRpb24uJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlVHlwZTogei5zdHJpbmcoKS5kZXNjcmliZSgnQnJvYWRjYXN0IHR5cGUgdG8gYWRkIHRvIHRoZSBsb2NhbCBsaXN0ZW5lciBsaXN0LiBDdXJyZW50IGltcGxlbWVudGF0aW9uIGlzIHNpbXVsYXRlZC9sb2dnaW5nIG9ubHkuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLmxpc3RlbkJyb2FkY2FzdChhLm1lc3NhZ2VUeXBlKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3N0b3BfbGlzdGVuaW5nJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1N0b3AgYnJvYWRjYXN0IGxpc3RlbmVyJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1JlbW92ZSBhIG1lc3NhZ2VUeXBlIGZyb20gdGhlIGV4dGVuc2lvbi1sb2NhbCBsaXN0ZW5lciBsaXN0LiBEb2VzIG5vdCBhZmZlY3QgQ29jb3MgRWRpdG9yIGludGVybmFscy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2VUeXBlOiB6LnN0cmluZygpLmRlc2NyaWJlKCdCcm9hZGNhc3QgdHlwZSB0byByZW1vdmUgZnJvbSB0aGUgbG9jYWwgbGlzdGVuZXIgbGlzdC4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMuc3RvcExpc3RlbmluZyhhLm1lc3NhZ2VUeXBlKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2NsZWFyX2Jyb2FkY2FzdF9sb2cnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnQ2xlYXIgYnJvYWRjYXN0IGxvZycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdDbGVhciB0aGUgZXh0ZW5zaW9uLWxvY2FsIGJyb2FkY2FzdCBsb2cgb25seS4gRG9lcyBub3QgbW9kaWZ5IHNjZW5lLCBhc3NldHMsIG9yIEVkaXRvciBzdGF0ZS4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogKCkgPT4gdGhpcy5jbGVhckJyb2FkY2FzdExvZygpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnZ2V0X2FjdGl2ZV9saXN0ZW5lcnMnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnUmVhZCBhY3RpdmUgbGlzdGVuZXJzJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ0xpc3QgZXh0ZW5zaW9uLWxvY2FsIGJyb2FkY2FzdCBsaXN0ZW5lciB0eXBlcyBhbmQgY291bnRzIGZvciBkaWFnbm9zdGljcy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogKCkgPT4gdGhpcy5nZXRBY3RpdmVMaXN0ZW5lcnMoKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgIF07XG4gICAgICAgIHRoaXMuZXhlYyA9IGRlZmluZVRvb2xzKGRlZnMpO1xuICAgIH1cblxuICAgIGdldFRvb2xzKCk6IFRvb2xEZWZpbml0aW9uW10geyByZXR1cm4gdGhpcy5leGVjLmdldFRvb2xzKCk7IH1cbiAgICBleGVjdXRlKHRvb2xOYW1lOiBzdHJpbmcsIGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7IHJldHVybiB0aGlzLmV4ZWMuZXhlY3V0ZSh0b29sTmFtZSwgYXJncyk7IH1cblxuICAgIHByaXZhdGUgc2V0dXBCcm9hZGNhc3RMaXN0ZW5lcnMoKTogdm9pZCB7XG4gICAgICAgIC8vIOioree9rumgkOWumue+qeeahOmHjeimgeW7o+aSrea2iOaBr+ebo+iBvVxuICAgICAgICBjb25zdCBpbXBvcnRhbnRNZXNzYWdlcyA9IFtcbiAgICAgICAgICAgICdidWlsZC13b3JrZXI6cmVhZHknLFxuICAgICAgICAgICAgJ2J1aWxkLXdvcmtlcjpjbG9zZWQnLFxuICAgICAgICAgICAgJ3NjZW5lOnJlYWR5JyxcbiAgICAgICAgICAgICdzY2VuZTpjbG9zZScsXG4gICAgICAgICAgICAnc2NlbmU6bGlnaHQtcHJvYmUtZWRpdC1tb2RlLWNoYW5nZWQnLFxuICAgICAgICAgICAgJ3NjZW5lOmxpZ2h0LXByb2JlLWJvdW5kaW5nLWJveC1lZGl0LW1vZGUtY2hhbmdlZCcsXG4gICAgICAgICAgICAnYXNzZXQtZGI6cmVhZHknLFxuICAgICAgICAgICAgJ2Fzc2V0LWRiOmNsb3NlJyxcbiAgICAgICAgICAgICdhc3NldC1kYjphc3NldC1hZGQnLFxuICAgICAgICAgICAgJ2Fzc2V0LWRiOmFzc2V0LWNoYW5nZScsXG4gICAgICAgICAgICAnYXNzZXQtZGI6YXNzZXQtZGVsZXRlJ1xuICAgICAgICBdO1xuXG4gICAgICAgIGltcG9ydGFudE1lc3NhZ2VzLmZvckVhY2gobWVzc2FnZVR5cGUgPT4ge1xuICAgICAgICAgICAgdGhpcy5hZGRCcm9hZGNhc3RMaXN0ZW5lcihtZXNzYWdlVHlwZSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYWRkQnJvYWRjYXN0TGlzdGVuZXIobWVzc2FnZVR5cGU6IHN0cmluZyk6IHZvaWQge1xuICAgICAgICBjb25zdCBsaXN0ZW5lciA9IChkYXRhOiBhbnkpID0+IHtcbiAgICAgICAgICAgIHRoaXMubWVzc2FnZUxvZy5wdXNoKHtcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiBtZXNzYWdlVHlwZSxcbiAgICAgICAgICAgICAgICBkYXRhOiBkYXRhLFxuICAgICAgICAgICAgICAgIHRpbWVzdGFtcDogRGF0ZS5ub3coKVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIC8vIOS/neaMgeaXpeiqjOWkp+Wwj+WcqOWQiOeQhuevhOWcjeWFp1xuICAgICAgICAgICAgaWYgKHRoaXMubWVzc2FnZUxvZy5sZW5ndGggPiAxMDAwKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5tZXNzYWdlTG9nID0gdGhpcy5tZXNzYWdlTG9nLnNsaWNlKC01MDApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBkZWJ1Z0xvZyhgW0Jyb2FkY2FzdF0gJHttZXNzYWdlVHlwZX06YCwgZGF0YSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgaWYgKCF0aGlzLmxpc3RlbmVycy5oYXMobWVzc2FnZVR5cGUpKSB7XG4gICAgICAgICAgICB0aGlzLmxpc3RlbmVycy5zZXQobWVzc2FnZVR5cGUsIFtdKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmxpc3RlbmVycy5nZXQobWVzc2FnZVR5cGUpIS5wdXNoKGxpc3RlbmVyKTtcblxuICAgICAgICAvLyDoqLvlhoogRWRpdG9yIOa2iOaBr+ebo+iBvSAtIOaaq+aZguiou+mHi+aOie+8jEVkaXRvci5NZXNzYWdlIEFQSeWPr+iDveS4jeaUr+aMgVxuICAgICAgICAvLyBFZGl0b3IuTWVzc2FnZS5vbihtZXNzYWdlVHlwZSwgbGlzdGVuZXIpO1xuICAgICAgICBkZWJ1Z0xvZyhgW0Jyb2FkY2FzdFRvb2xzXSBBZGRlZCBsaXN0ZW5lciBmb3IgJHttZXNzYWdlVHlwZX0gKHNpbXVsYXRlZClgKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHJlbW92ZUJyb2FkY2FzdExpc3RlbmVyKG1lc3NhZ2VUeXBlOiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgbGlzdGVuZXJzID0gdGhpcy5saXN0ZW5lcnMuZ2V0KG1lc3NhZ2VUeXBlKTtcbiAgICAgICAgaWYgKGxpc3RlbmVycykge1xuICAgICAgICAgICAgbGlzdGVuZXJzLmZvckVhY2gobGlzdGVuZXIgPT4ge1xuICAgICAgICAgICAgICAgIC8vIEVkaXRvci5NZXNzYWdlLm9mZihtZXNzYWdlVHlwZSwgbGlzdGVuZXIpO1xuICAgICAgICAgICAgICAgIGRlYnVnTG9nKGBbQnJvYWRjYXN0VG9vbHNdIFJlbW92ZWQgbGlzdGVuZXIgZm9yICR7bWVzc2FnZVR5cGV9IChzaW11bGF0ZWQpYCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHRoaXMubGlzdGVuZXJzLmRlbGV0ZShtZXNzYWdlVHlwZSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldEJyb2FkY2FzdExvZyhsaW1pdDogbnVtYmVyID0gNTAsIG1lc3NhZ2VUeXBlPzogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBsZXQgZmlsdGVyZWRMb2cgPSB0aGlzLm1lc3NhZ2VMb2c7XG5cbiAgICAgICAgICAgIGlmIChtZXNzYWdlVHlwZSkge1xuICAgICAgICAgICAgICAgIGZpbHRlcmVkTG9nID0gdGhpcy5tZXNzYWdlTG9nLmZpbHRlcihlbnRyeSA9PiBlbnRyeS5tZXNzYWdlID09PSBtZXNzYWdlVHlwZSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IHJlY2VudExvZyA9IGZpbHRlcmVkTG9nLnNsaWNlKC1saW1pdCkubWFwKGVudHJ5ID0+ICh7XG4gICAgICAgICAgICAgICAgLi4uZW50cnksXG4gICAgICAgICAgICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZShlbnRyeS50aW1lc3RhbXApLnRvSVNPU3RyaW5nKClcbiAgICAgICAgICAgIH0pKTtcblxuICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgIGxvZzogcmVjZW50TG9nLFxuICAgICAgICAgICAgICAgICAgICBjb3VudDogcmVjZW50TG9nLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgdG90YWxDb3VudDogZmlsdGVyZWRMb2cubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICBmaWx0ZXI6IG1lc3NhZ2VUeXBlIHx8ICdhbGwnLFxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiAnQnJvYWRjYXN0IGxvZyByZXRyaWV2ZWQgc3VjY2Vzc2Z1bGx5J1xuICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBsaXN0ZW5Ccm9hZGNhc3QobWVzc2FnZVR5cGU6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBpZiAoIXRoaXMubGlzdGVuZXJzLmhhcyhtZXNzYWdlVHlwZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hZGRCcm9hZGNhc3RMaXN0ZW5lcihtZXNzYWdlVHlwZSk7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2VUeXBlOiBtZXNzYWdlVHlwZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgU3RhcnRlZCBsaXN0ZW5pbmcgZm9yIGJyb2FkY2FzdDogJHttZXNzYWdlVHlwZX1gXG4gICAgICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZVR5cGU6IG1lc3NhZ2VUeXBlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBBbHJlYWR5IGxpc3RlbmluZyBmb3IgYnJvYWRjYXN0OiAke21lc3NhZ2VUeXBlfWBcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHN0b3BMaXN0ZW5pbmcobWVzc2FnZVR5cGU6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5saXN0ZW5lcnMuaGFzKG1lc3NhZ2VUeXBlKSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnJlbW92ZUJyb2FkY2FzdExpc3RlbmVyKG1lc3NhZ2VUeXBlKTtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZVR5cGU6IG1lc3NhZ2VUeXBlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBTdG9wcGVkIGxpc3RlbmluZyBmb3IgYnJvYWRjYXN0OiAke21lc3NhZ2VUeXBlfWBcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlVHlwZTogbWVzc2FnZVR5cGUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYFdhcyBub3QgbGlzdGVuaW5nIGZvciBicm9hZGNhc3Q6ICR7bWVzc2FnZVR5cGV9YFxuICAgICAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgY2xlYXJCcm9hZGNhc3RMb2coKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBwcmV2aW91c0NvdW50ID0gdGhpcy5tZXNzYWdlTG9nLmxlbmd0aDtcbiAgICAgICAgICAgIHRoaXMubWVzc2FnZUxvZyA9IFtdO1xuICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgIGNsZWFyZWRDb3VudDogcHJldmlvdXNDb3VudCxcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogJ0Jyb2FkY2FzdCBsb2cgY2xlYXJlZCBzdWNjZXNzZnVsbHknXG4gICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldEFjdGl2ZUxpc3RlbmVycygpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGFjdGl2ZUxpc3RlbmVycyA9IEFycmF5LmZyb20odGhpcy5saXN0ZW5lcnMua2V5cygpKS5tYXAobWVzc2FnZVR5cGUgPT4gKHtcbiAgICAgICAgICAgICAgICBtZXNzYWdlVHlwZTogbWVzc2FnZVR5cGUsXG4gICAgICAgICAgICAgICAgbGlzdGVuZXJDb3VudDogdGhpcy5saXN0ZW5lcnMuZ2V0KG1lc3NhZ2VUeXBlKT8ubGVuZ3RoIHx8IDBcbiAgICAgICAgICAgIH0pKTtcblxuICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgIGxpc3RlbmVyczogYWN0aXZlTGlzdGVuZXJzLFxuICAgICAgICAgICAgICAgICAgICBjb3VudDogYWN0aXZlTGlzdGVuZXJzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogJ0FjdGl2ZSBsaXN0ZW5lcnMgcmV0cmlldmVkIHN1Y2Nlc3NmdWxseSdcbiAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgIH0pO1xuICAgIH1cbn1cbiJdfQ==