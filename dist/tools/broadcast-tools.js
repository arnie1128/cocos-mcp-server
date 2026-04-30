"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BroadcastTools = void 0;
const log_1 = require("../lib/log");
class BroadcastTools {
    constructor() {
        this.listeners = new Map();
        this.messageLog = [];
        this.setupBroadcastListeners();
    }
    getTools() {
        return [
            {
                name: 'get_broadcast_log',
                description: 'Get recent broadcast messages log',
                inputSchema: {
                    type: 'object',
                    properties: {
                        limit: {
                            type: 'number',
                            description: 'Number of recent messages to return',
                            default: 50
                        },
                        messageType: {
                            type: 'string',
                            description: 'Filter by message type (optional)'
                        }
                    }
                }
            },
            {
                name: 'listen_broadcast',
                description: 'Start listening for specific broadcast messages',
                inputSchema: {
                    type: 'object',
                    properties: {
                        messageType: {
                            type: 'string',
                            description: 'Message type to listen for'
                        }
                    },
                    required: ['messageType']
                }
            },
            {
                name: 'stop_listening',
                description: 'Stop listening for specific broadcast messages',
                inputSchema: {
                    type: 'object',
                    properties: {
                        messageType: {
                            type: 'string',
                            description: 'Message type to stop listening for'
                        }
                    },
                    required: ['messageType']
                }
            },
            {
                name: 'clear_broadcast_log',
                description: 'Clear the broadcast messages log',
                inputSchema: {
                    type: 'object',
                    properties: {}
                }
            },
            {
                name: 'get_active_listeners',
                description: 'Get list of active broadcast listeners',
                inputSchema: {
                    type: 'object',
                    properties: {}
                }
            }
        ];
    }
    async execute(toolName, args) {
        switch (toolName) {
            case 'get_broadcast_log':
                return await this.getBroadcastLog(args.limit, args.messageType);
            case 'listen_broadcast':
                return await this.listenBroadcast(args.messageType);
            case 'stop_listening':
                return await this.stopListening(args.messageType);
            case 'clear_broadcast_log':
                return await this.clearBroadcastLog();
            case 'get_active_listeners':
                return await this.getActiveListeners();
            default:
                throw new Error(`Unknown tool: ${toolName}`);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvYWRjYXN0LXRvb2xzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL3Rvb2xzL2Jyb2FkY2FzdC10b29scy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSxvQ0FBc0M7QUFFdEMsTUFBYSxjQUFjO0lBSXZCO1FBSFEsY0FBUyxHQUE0QixJQUFJLEdBQUcsRUFBRSxDQUFDO1FBQy9DLGVBQVUsR0FBNkQsRUFBRSxDQUFDO1FBRzlFLElBQUksQ0FBQyx1QkFBdUIsRUFBRSxDQUFDO0lBQ25DLENBQUM7SUFFRCxRQUFRO1FBQ0osT0FBTztZQUNIO2dCQUNJLElBQUksRUFBRSxtQkFBbUI7Z0JBQ3pCLFdBQVcsRUFBRSxtQ0FBbUM7Z0JBQ2hELFdBQVcsRUFBRTtvQkFDVCxJQUFJLEVBQUUsUUFBUTtvQkFDZCxVQUFVLEVBQUU7d0JBQ1IsS0FBSyxFQUFFOzRCQUNILElBQUksRUFBRSxRQUFROzRCQUNkLFdBQVcsRUFBRSxxQ0FBcUM7NEJBQ2xELE9BQU8sRUFBRSxFQUFFO3lCQUNkO3dCQUNELFdBQVcsRUFBRTs0QkFDVCxJQUFJLEVBQUUsUUFBUTs0QkFDZCxXQUFXLEVBQUUsbUNBQW1DO3lCQUNuRDtxQkFDSjtpQkFDSjthQUNKO1lBQ0Q7Z0JBQ0ksSUFBSSxFQUFFLGtCQUFrQjtnQkFDeEIsV0FBVyxFQUFFLGlEQUFpRDtnQkFDOUQsV0FBVyxFQUFFO29CQUNULElBQUksRUFBRSxRQUFRO29CQUNkLFVBQVUsRUFBRTt3QkFDUixXQUFXLEVBQUU7NEJBQ1QsSUFBSSxFQUFFLFFBQVE7NEJBQ2QsV0FBVyxFQUFFLDRCQUE0Qjt5QkFDNUM7cUJBQ0o7b0JBQ0QsUUFBUSxFQUFFLENBQUMsYUFBYSxDQUFDO2lCQUM1QjthQUNKO1lBQ0Q7Z0JBQ0ksSUFBSSxFQUFFLGdCQUFnQjtnQkFDdEIsV0FBVyxFQUFFLGdEQUFnRDtnQkFDN0QsV0FBVyxFQUFFO29CQUNULElBQUksRUFBRSxRQUFRO29CQUNkLFVBQVUsRUFB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TyxFQUFFLG9DQUFvQztpQkFDaEQ7YUFDSixDQUFDLENBQUM7UUFDUCxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7SUFFTyxLQUFLLENBQUMsa0JBQWtCO1FBQzVCLE9BQU8sSUFBSSxPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsRUFBRTtZQUMzQixNQUFNLGVBQWUsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLEVBQUU7O2dCQUFDLE9BQUEsQ0FBQztvQkFDMUUsV0FBVyxFQUFFLFdBQVc7b0JBQ3hCLGFBQWEsRUFBRSxDQUFBLE1BQUEsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLDBDQUFFLE1BQU0sS0FBSSxDQUFDO2lCQUM5RCxDQUFDLENBQUE7YUFBQSxDQUFDLENBQUM7WUFFSixPQUFPLENBQUM7Z0JBQ0osT0FBTyxFQUFFLElBQUk7Z0JBQ2IsSUFBSSxFQUFFO29CQUNGLFNBQVMsRUFBRSxlQUFlO29CQUMxQixLQUFLLEVBQUUsZUFBZSxDQUFDLE1BQU07b0JBQzdCLE9BQU8sRUFBRSx5Q0FBeUM7aUJBQ3JEO2FBQ0osQ0FBQyxDQUFDO1FBQ1AsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDO0NBQ0o7QUFyUUQsd0NBcVFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgVG9vbERlZmluaXRpb24sIFRvb2xSZXNwb25zZSwgVG9vbEV4ZWN1dG9yIH0gZnJvbSAnLi4vdHlwZXMnO1xuaW1wb3J0IHsgZGVidWdMb2cgfSBmcm9tICcuLi9saWIvbG9nJztcblxuZXhwb3J0IGNsYXNzIEJyb2FkY2FzdFRvb2xzIGltcGxlbWVudHMgVG9vbEV4ZWN1dG9yIHtcbiAgICBwcml2YXRlIGxpc3RlbmVyczogTWFwPHN0cmluZywgRnVuY3Rpb25bXT4gPSBuZXcgTWFwKCk7XG4gICAgcHJpdmF0ZSBtZXNzYWdlTG9nOiBBcnJheTx7IG1lc3NhZ2U6IHN0cmluZzsgZGF0YTogYW55OyB0aW1lc3RhbXA6IG51bWJlciB9PiA9IFtdO1xuXG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHRoaXMuc2V0dXBCcm9hZGNhc3RMaXN0ZW5lcnMoKTtcbiAgICB9XG5cbiAgICBnZXRUb29scygpOiBUb29sRGVmaW5pdGlvbltdIHtcbiAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnZ2V0X2Jyb2FkY2FzdF9sb2cnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnR2V0IHJlY2VudCBicm9hZGNhc3QgbWVzc2FnZXMgbG9nJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYToge1xuICAgICAgICAgICAgICAgICAgICB0eXBlOiAnb2JqZWN0JyxcbiAgICAgICAgICAgICAgICAgICAgcHJvcGVydGllczoge1xuICAgICAgICAgICAgICAgICAgICAgICAgbGltaXQ6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiAnbnVtYmVyJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ051bWJlciBvZiByZWNlbnQgbWVzc2FnZXMgdG8gcmV0dXJuJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWZhdWx0OiA1MFxuICAgICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2VUeXBlOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogJ3N0cmluZycsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdGaWx0ZXIgYnkgbWVzc2FnZSB0eXBlIChvcHRpb25hbCknXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdsaXN0ZW5fYnJvYWRjYXN0JyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1N0YXJ0IGxpc3RlbmluZyBmb3Igc3BlY2lmaWMgYnJvYWRjYXN0IG1lc3NhZ2VzJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYToge1xuICAgICAgICAgICAgICAgICAgICB0eXBlOiAnb2JqZWN0JyxcbiAgICAgICAgICAgICAgICAgICAgcHJvcGVydGllczoge1xuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZVR5cGU6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiAnc3RyaW5nJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ01lc3NhZ2UgdHlwZSB0byBsaXN0ZW4gZm9yJ1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICByZXF1aXJlZDogWydtZXNzYWdlVHlwZSddXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnc3RvcF9saXN0ZW5pbmcnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnU3RvcCBsaXN0ZW5pbmcgZm9yIHNwZWNpZmljIGJyb2FkY2FzdCBtZXNzYWdlcycsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHtcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogJ29iamVjdCcsXG4gICAgICAgICAgICAgICAgICAgIHByb3BlcnRpZXM6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2VUeXBlOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogJ3N0cmluZycsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdNZXNzYWdlIHR5cGUgdG8gc3RvcCBsaXN0ZW5pbmcgZm9yJ1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICByZXF1aXJlZDogWydtZXNzYWdlVHlwZSddXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnY2xlYXJfYnJvYWRjYXN0X2xvZycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdDbGVhciB0aGUgYnJvYWRjYXN0IG1lc3NhZ2VzIGxvZycsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHtcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogJ29iamVjdCcsXG4gICAgICAgICAgICAgICAgICAgIHByb3BlcnRpZXM6IHt9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnZ2V0X2FjdGl2ZV9saXN0ZW5lcnMnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnR2V0IGxpc3Qgb2YgYWN0aXZlIGJyb2FkY2FzdCBsaXN0ZW5lcnMnLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB7XG4gICAgICAgICAgICAgICAgICAgIHR5cGU6ICdvYmplY3QnLFxuICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0aWVzOiB7fVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgXTtcbiAgICB9XG5cbiAgICBhc3luYyBleGVjdXRlKHRvb2xOYW1lOiBzdHJpbmcsIGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHN3aXRjaCAodG9vbE5hbWUpIHtcbiAgICAgICAgICAgIGNhc2UgJ2dldF9icm9hZGNhc3RfbG9nJzpcbiAgICAgICAgICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5nZXRCcm9hZGNhc3RMb2coYXJncy5saW1pdCwgYXJncy5tZXNzYWdlVHlwZSk7XG4gICAgICAgICAgICBjYXNlICdsaXN0ZW5fYnJvYWRjYXN0JzpcbiAgICAgICAgICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5saXN0ZW5Ccm9hZGNhc3QoYXJncy5tZXNzYWdlVHlwZSk7XG4gICAgICAgICAgICBjYXNlICdzdG9wX2xpc3RlbmluZyc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuc3RvcExpc3RlbmluZyhhcmdzLm1lc3NhZ2VUeXBlKTtcbiAgICAgICAgICAgIGNhc2UgJ2NsZWFyX2Jyb2FkY2FzdF9sb2cnOlxuICAgICAgICAgICAgICAgIHJldHVybiBhd2FpdCB0aGlzLmNsZWFyQnJvYWRjYXN0TG9nKCk7XG4gICAgICAgICAgICBjYXNlICdnZXRfYWN0aXZlX2xpc3RlbmVycyc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuZ2V0QWN0aXZlTGlzdGVuZXJzKCk7XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5rbm93biB0b29sOiAke3Rvb2xOYW1lfWApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBzZXR1cEJyb2FkY2FzdExpc3RlbmVycygpOiB2b2lkIHtcbiAgICAgICAgLy8g6K6+572u6aKE5a6a5LmJ55qE6YeN6KaB5bm/5pKt5raI5oGv55uR5ZCsXG4gICAgICAgIGNvbnN0IGltcG9ydGFudE1lc3NhZ2VzID0gW1xuICAgICAgICAgICAgJ2J1aWxkLXdvcmtlcjpyZWFkeScsXG4gICAgICAgICAgICAnYnVpbGQtd29ya2VyOmNsb3NlZCcsXG4gICAgICAgICAgICAnc2NlbmU6cmVhZHknLFxuICAgICAgICAgICAgJ3NjZW5lOmNsb3NlJyxcbiAgICAgICAgICAgICdzY2VuZTpsaWdodC1wcm9iZS1lZGl0LW1vZGUtY2hhbmdlZCcsXG4gICAgICAgICAgICAnc2NlbmU6bGlnaHQtcHJvYmUtYm91bmRpbmctYm94LWVkaXQtbW9kZS1jaGFuZ2VkJyxcbiAgICAgICAgICAgICdhc3NldC1kYjpyZWFkeScsXG4gICAgICAgICAgICAnYXNzZXQtZGI6Y2xvc2UnLFxuICAgICAgICAgICAgJ2Fzc2V0LWRiOmFzc2V0LWFkZCcsXG4gICAgICAgICAgICAnYXNzZXQtZGI6YXNzZXQtY2hhbmdlJyxcbiAgICAgICAgICAgICdhc3NldC1kYjphc3NldC1kZWxldGUnXG4gICAgICAgIF07XG5cbiAgICAgICAgaW1wb3J0YW50TWVzc2FnZXMuZm9yRWFjaChtZXNzYWdlVHlwZSA9PiB7XG4gICAgICAgICAgICB0aGlzLmFkZEJyb2FkY2FzdExpc3RlbmVyKG1lc3NhZ2VUeXBlKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhZGRCcm9hZGNhc3RMaXN0ZW5lcihtZXNzYWdlVHlwZTogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGxpc3RlbmVyID0gKGRhdGE6IGFueSkgPT4ge1xuICAgICAgICAgICAgdGhpcy5tZXNzYWdlTG9nLnB1c2goe1xuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IG1lc3NhZ2VUeXBlLFxuICAgICAgICAgICAgICAgIGRhdGE6IGRhdGEsXG4gICAgICAgICAgICAgICAgdGltZXN0YW1wOiBEYXRlLm5vdygpXG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8g5L+d5oyB5pel5b+X5aSn5bCP5Zyo5ZCI55CG6IyD5Zu05YaFXG4gICAgICAgICAgICBpZiAodGhpcy5tZXNzYWdlTG9nLmxlbmd0aCA+IDEwMDApIHtcbiAgICAgICAgICAgICAgICB0aGlzLm1lc3NhZ2VMb2cgPSB0aGlzLm1lc3NhZ2VMb2cuc2xpY2UoLTUwMCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGRlYnVnTG9nKGBbQnJvYWRjYXN0XSAke21lc3NhZ2VUeXBlfTpgLCBkYXRhKTtcbiAgICAgICAgfTtcblxuICAgICAgICBpZiAoIXRoaXMubGlzdGVuZXJzLmhhcyhtZXNzYWdlVHlwZSkpIHtcbiAgICAgICAgICAgIHRoaXMubGlzdGVuZXJzLnNldChtZXNzYWdlVHlwZSwgW10pO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMubGlzdGVuZXJzLmdldChtZXNzYWdlVHlwZSkhLnB1c2gobGlzdGVuZXIpO1xuXG4gICAgICAgIC8vIOazqOWGjCBFZGl0b3Ig5raI5oGv55uR5ZCsIC0g5pqC5pe25rOo6YeK5o6J77yMRWRpdG9yLk1lc3NhZ2UgQVBJ5Y+v6IO95LiN5pSv5oyBXG4gICAgICAgIC8vIEVkaXRvci5NZXNzYWdlLm9uKG1lc3NhZ2VUeXBlLCBsaXN0ZW5lcik7XG4gICAgICAgIGRlYnVnTG9nKGBbQnJvYWRjYXN0VG9vbHNdIEFkZGVkIGxpc3RlbmVyIGZvciAke21lc3NhZ2VUeXBlfSAoc2ltdWxhdGVkKWApO1xuICAgIH1cblxuICAgIHByaXZhdGUgcmVtb3ZlQnJvYWRjYXN0TGlzdGVuZXIobWVzc2FnZVR5cGU6IHN0cmluZyk6IHZvaWQge1xuICAgICAgICBjb25zdCBsaXN0ZW5lcnMgPSB0aGlzLmxpc3RlbmVycy5nZXQobWVzc2FnZVR5cGUpO1xuICAgICAgICBpZiAobGlzdGVuZXJzKSB7XG4gICAgICAgICAgICBsaXN0ZW5lcnMuZm9yRWFjaChsaXN0ZW5lciA9PiB7XG4gICAgICAgICAgICAgICAgLy8gRWRpdG9yLk1lc3NhZ2Uub2ZmKG1lc3NhZ2VUeXBlLCBsaXN0ZW5lcik7XG4gICAgICAgICAgICAgICAgZGVidWdMb2coYFtCcm9hZGNhc3RUb29sc10gUmVtb3ZlZCBsaXN0ZW5lciBmb3IgJHttZXNzYWdlVHlwZX0gKHNpbXVsYXRlZClgKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgdGhpcy5saXN0ZW5lcnMuZGVsZXRlKG1lc3NhZ2VUeXBlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2V0QnJvYWRjYXN0TG9nKGxpbWl0OiBudW1iZXIgPSA1MCwgbWVzc2FnZVR5cGU/OiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIGxldCBmaWx0ZXJlZExvZyA9IHRoaXMubWVzc2FnZUxvZztcblxuICAgICAgICAgICAgaWYgKG1lc3NhZ2VUeXBlKSB7XG4gICAgICAgICAgICAgICAgZmlsdGVyZWRMb2cgPSB0aGlzLm1lc3NhZ2VMb2cuZmlsdGVyKGVudHJ5ID0+IGVudHJ5Lm1lc3NhZ2UgPT09IG1lc3NhZ2VUeXBlKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgcmVjZW50TG9nID0gZmlsdGVyZWRMb2cuc2xpY2UoLWxpbWl0KS5tYXAoZW50cnkgPT4gKHtcbiAgICAgICAgICAgICAgICAuLi5lbnRyeSxcbiAgICAgICAgICAgICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKGVudHJ5LnRpbWVzdGFtcCkudG9JU09TdHJpbmcoKVxuICAgICAgICAgICAgfSkpO1xuXG4gICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgbG9nOiByZWNlbnRMb2csXG4gICAgICAgICAgICAgICAgICAgIGNvdW50OiByZWNlbnRMb2cubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICB0b3RhbENvdW50OiBmaWx0ZXJlZExvZy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgIGZpbHRlcjogbWVzc2FnZVR5cGUgfHwgJ2FsbCcsXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdCcm9hZGNhc3QgbG9nIHJldHJpZXZlZCBzdWNjZXNzZnVsbHknXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgbGlzdGVuQnJvYWRjYXN0KG1lc3NhZ2VUeXBlOiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgaWYgKCF0aGlzLmxpc3RlbmVycy5oYXMobWVzc2FnZVR5cGUpKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYWRkQnJvYWRjYXN0TGlzdGVuZXIobWVzc2FnZVR5cGUpO1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZVR5cGU6IG1lc3NhZ2VUeXBlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBTdGFydGVkIGxpc3RlbmluZyBmb3IgYnJvYWRjYXN0OiAke21lc3NhZ2VUeXBlfWBcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2VUeXBlOiBtZXNzYWdlVHlwZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgQWxyZWFkeSBsaXN0ZW5pbmcgZm9yIGJyb2FkY2FzdDogJHttZXNzYWdlVHlwZX1gXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgc3RvcExpc3RlbmluZyhtZXNzYWdlVHlwZTogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLmxpc3RlbmVycy5oYXMobWVzc2FnZVR5cGUpKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMucmVtb3ZlQnJvYWRjYXN0TGlzdGVuZXIobWVzc2FnZVR5cGUpO1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZVR5cGU6IG1lc3NhZ2VUeXBlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBTdG9wcGVkIGxpc3RlbmluZyBmb3IgYnJvYWRjYXN0OiAke21lc3NhZ2VUeXBlfWBcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2VUeXBlOiBtZXNzYWdlVHlwZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgV2FzIG5vdCBsaXN0ZW5pbmcgZm9yIGJyb2FkY2FzdDogJHttZXNzYWdlVHlwZX1gXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgY2xlYXJCcm9hZGNhc3RMb2coKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBwcmV2aW91c0NvdW50ID0gdGhpcy5tZXNzYWdlTG9nLmxlbmd0aDtcbiAgICAgICAgICAgIHRoaXMubWVzc2FnZUxvZyA9IFtdO1xuICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIGNsZWFyZWRDb3VudDogcHJldmlvdXNDb3VudCxcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogJ0Jyb2FkY2FzdCBsb2cgY2xlYXJlZCBzdWNjZXNzZnVsbHknXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2V0QWN0aXZlTGlzdGVuZXJzKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgYWN0aXZlTGlzdGVuZXJzID0gQXJyYXkuZnJvbSh0aGlzLmxpc3RlbmVycy5rZXlzKCkpLm1hcChtZXNzYWdlVHlwZSA9PiAoe1xuICAgICAgICAgICAgICAgIG1lc3NhZ2VUeXBlOiBtZXNzYWdlVHlwZSxcbiAgICAgICAgICAgICAgICBsaXN0ZW5lckNvdW50OiB0aGlzLmxpc3RlbmVycy5nZXQobWVzc2FnZVR5cGUpPy5sZW5ndGggfHwgMFxuICAgICAgICAgICAgfSkpO1xuXG4gICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgbGlzdGVuZXJzOiBhY3RpdmVMaXN0ZW5lcnMsXG4gICAgICAgICAgICAgICAgICAgIGNvdW50OiBhY3RpdmVMaXN0ZW5lcnMubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiAnQWN0aXZlIGxpc3RlbmVycyByZXRyaWV2ZWQgc3VjY2Vzc2Z1bGx5J1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG59Il19