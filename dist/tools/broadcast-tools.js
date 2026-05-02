"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BroadcastTools = void 0;
const response_1 = require("../lib/response");
const log_1 = require("../lib/log");
const schema_1 = require("../lib/schema");
const decorators_1 = require("../lib/decorators");
class BroadcastTools {
    constructor() {
        this.listeners = new Map();
        this.messageLog = [];
        this.setupBroadcastListeners();
        this.exec = (0, decorators_1.defineToolsFromDecorators)(this);
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
    async getBroadcastLog(args) {
        var _a;
        const limit = (_a = args.limit) !== null && _a !== void 0 ? _a : 50;
        const messageType = args.messageType;
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
    async listenBroadcast(args) {
        const messageType = args.messageType;
        if (!this.listeners.has(messageType)) {
            this.addBroadcastListener(messageType);
            return (0, response_1.ok)({
                messageType: messageType,
                message: `Started listening for broadcast: ${messageType}`
            });
        }
        return (0, response_1.ok)({
            messageType: messageType,
            message: `Already listening for broadcast: ${messageType}`
        });
    }
    async stopListening(args) {
        const messageType = args.messageType;
        if (this.listeners.has(messageType)) {
            this.removeBroadcastListener(messageType);
            return (0, response_1.ok)({
                messageType: messageType,
                message: `Stopped listening for broadcast: ${messageType}`
            });
        }
        return (0, response_1.ok)({
            messageType: messageType,
            message: `Was not listening for broadcast: ${messageType}`
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
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'get_broadcast_log',
        title: 'Read broadcast log',
        description: '[specialist] Read the extension-local broadcast log. No project side effects; filter by messageType to inspect scene/asset-db/build-worker events.',
        inputSchema: schema_1.z.object({
            limit: schema_1.z.number().default(50).describe('Maximum recent log entries to return. Default 50.'),
            messageType: schema_1.z.string().optional().describe('Optional broadcast type filter, e.g. scene:ready or asset-db:asset-change.'),
        }),
    })
], BroadcastTools.prototype, "getBroadcastLog", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'listen_broadcast',
        title: 'Listen for broadcast',
        description: '[specialist] Add a messageType to the extension-local active listener list. Current path is simulated/logging only, not a guaranteed live Editor broadcast subscription.',
        inputSchema: schema_1.z.object({
            messageType: schema_1.z.string().describe('Broadcast type to add to the local listener list. Current implementation is simulated/logging only.'),
        }),
    })
], BroadcastTools.prototype, "listenBroadcast", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'stop_listening',
        title: 'Stop broadcast listener',
        description: '[specialist] Remove a messageType from the extension-local listener list. Does not affect Cocos Editor internals.',
        inputSchema: schema_1.z.object({
            messageType: schema_1.z.string().describe('Broadcast type to remove from the local listener list.'),
        }),
    })
], BroadcastTools.prototype, "stopListening", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'clear_broadcast_log',
        title: 'Clear broadcast log',
        description: '[specialist] Clear the extension-local broadcast log only. Does not modify scene, assets, or Editor state.',
        inputSchema: schema_1.z.object({}),
    })
], BroadcastTools.prototype, "clearBroadcastLog", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'get_active_listeners',
        title: 'Read active listeners',
        description: '[specialist] List extension-local broadcast listener types and counts for diagnostics.',
        inputSchema: schema_1.z.object({}),
    })
], BroadcastTools.prototype, "getActiveListeners", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvYWRjYXN0LXRvb2xzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL3Rvb2xzL2Jyb2FkY2FzdC10b29scy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7QUFBQSw4Q0FBcUM7QUFFckMsb0NBQXNDO0FBQ3RDLDBDQUFrQztBQUNsQyxrREFBdUU7QUFFdkUsTUFBYSxjQUFjO0lBS3ZCO1FBSlEsY0FBUyxHQUE0QixJQUFJLEdBQUcsRUFBRSxDQUFDO1FBQy9DLGVBQVUsR0FBNkQsRUFBRSxDQUFDO1FBSTlFLElBQUksQ0FBQyx1QkFBdUIsRUFBRSxDQUFDO1FBQy9CLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBQSxzQ0FBeUIsRUFBQyxJQUFJLENBQUMsQ0FBQztJQUNoRCxDQUFDO0lBRUQsUUFBUSxLQUF1QixPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQzdELE9BQU8sQ0FBQyxRQUFnQixFQUFFLElBQVMsSUFBMkIsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRWpHLHVCQUF1QjtRQUMzQixpQkFBaUI7UUFDakIsTUFBTSxpQkFBaUIsR0FBRztZQUN0QixvQkFBb0I7WUFDcEIscUJBQXFCO1lBQ3JCLGFBQWE7WUFDYixhQUFhO1lBQ2IscUNBQXFDO1lBQ3JDLGtEQUFrRDtZQUNsRCxnQkFBZ0I7WUFDaEIsZ0JBQWdCO1lBQ2hCLG9CQUFvQjtZQUNwQix1QkFBdUI7WUFDdkIsdUJBQXVCO1NBQzFCLENBQUM7UUFFRixpQkFBaUIsQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLEVBQUU7WUFDcEMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQzNDLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztJQUVPLG9CQUFvQixDQUFDLFdBQW1CO1FBQzVDLE1BQU0s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RSxDQUFDLFFBQVEsRUFBRSxDQUFDLFFBQVEsQ0FBQyw0RUFBNEUsQ0FBQztTQUM1SCxDQUFDO0tBQ0wsQ0FBQztxREF3QkQ7QUFVSztJQVJMLElBQUEsb0JBQU8sRUFBQztRQUNMLElBQUksRUFBRSxrQkFBa0I7UUFDeEIsS0FBSyxFQUFFLHNCQUFzQjtRQUM3QixXQUFXLEVBQUUsMEtBQTBLO1FBQ3ZMLFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDO1lBQ2xCLFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLHFHQUFxRyxDQUFDO1NBQzFJLENBQUM7S0FDTCxDQUFDO3FEQWNEO0FBVUs7SUFSTCxJQUFBLG9CQUFPLEVBQUM7UUFDTCxJQUFJLEVBQUUsZ0JBQWdCO1FBQ3RCLEtBQUssRUFBRSx5QkFBeUI7UUFDaEMsV0FBVyxFQUFFLG1IQUFtSDtRQUNoSSxXQUFXLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQztZQUNsQixXQUFXLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyx3REFBd0QsQ0FBQztTQUM3RixDQUFDO0tBQ0wsQ0FBQzttREFjRDtBQVFLO0lBTkwsSUFBQSxvQkFBTyxFQUFDO1FBQ0wsSUFBSSxFQUFFLHFCQUFxQjtRQUMzQixLQUFLLEVBQUUscUJBQXFCO1FBQzVCLFdBQVcsRUFBRSw0R0FBNEc7UUFDekgsV0FBVyxFQUFFLFVBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO0tBQzVCLENBQUM7dURBVUQ7QUFRSztJQU5MLElBQUEsb0JBQU8sRUFBQztRQUNMLElBQUksRUFBRSxzQkFBc0I7UUFDNUIsS0FBSyxFQUFFLHVCQUF1QjtRQUM5QixXQUFXLEVBQUUsd0ZBQXdGO1FBQ3JHLFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztLQUM1QixDQUFDO3dEQWNEIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgb2sgfSBmcm9tICcuLi9saWIvcmVzcG9uc2UnO1xuaW1wb3J0IHsgVG9vbERlZmluaXRpb24sIFRvb2xSZXNwb25zZSwgVG9vbEV4ZWN1dG9yIH0gZnJvbSAnLi4vdHlwZXMnO1xuaW1wb3J0IHsgZGVidWdMb2cgfSBmcm9tICcuLi9saWIvbG9nJztcbmltcG9ydCB7IHogfSBmcm9tICcuLi9saWIvc2NoZW1hJztcbmltcG9ydCB7IG1jcFRvb2wsIGRlZmluZVRvb2xzRnJvbURlY29yYXRvcnMgfSBmcm9tICcuLi9saWIvZGVjb3JhdG9ycyc7XG5cbmV4cG9ydCBjbGFzcyBCcm9hZGNhc3RUb29scyBpbXBsZW1lbnRzIFRvb2xFeGVjdXRvciB7XG4gICAgcHJpdmF0ZSBsaXN0ZW5lcnM6IE1hcDxzdHJpbmcsIEZ1bmN0aW9uW10+ID0gbmV3IE1hcCgpO1xuICAgIHByaXZhdGUgbWVzc2FnZUxvZzogQXJyYXk8eyBtZXNzYWdlOiBzdHJpbmc7IGRhdGE6IGFueTsgdGltZXN0YW1wOiBudW1iZXIgfT4gPSBbXTtcbiAgICBwcml2YXRlIHJlYWRvbmx5IGV4ZWM6IFRvb2xFeGVjdXRvcjtcblxuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICB0aGlzLnNldHVwQnJvYWRjYXN0TGlzdGVuZXJzKCk7XG4gICAgICAgIHRoaXMuZXhlYyA9IGRlZmluZVRvb2xzRnJvbURlY29yYXRvcnModGhpcyk7XG4gICAgfVxuXG4gICAgZ2V0VG9vbHMoKTogVG9vbERlZmluaXRpb25bXSB7IHJldHVybiB0aGlzLmV4ZWMuZ2V0VG9vbHMoKTsgfVxuICAgIGV4ZWN1dGUodG9vbE5hbWU6IHN0cmluZywgYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHsgcmV0dXJuIHRoaXMuZXhlYy5leGVjdXRlKHRvb2xOYW1lLCBhcmdzKTsgfVxuXG4gICAgcHJpdmF0ZSBzZXR1cEJyb2FkY2FzdExpc3RlbmVycygpOiB2b2lkIHtcbiAgICAgICAgLy8g6Kit572u6aCQ5a6a576p55qE6YeN6KaB5buj5pKt5raI5oGv55uj6IG9XG4gICAgICAgIGNvbnN0IGltcG9ydGFudE1lc3NhZ2VzID0gW1xuICAgICAgICAgICAgJ2J1aWxkLXdvcmtlcjpyZWFkeScsXG4gICAgICAgICAgICAnYnVpbGQtd29ya2VyOmNsb3NlZCcsXG4gICAgICAgICAgICAnc2NlbmU6cmVhZHknLFxuICAgICAgICAgICAgJ3NjZW5lOmNsb3NlJyxcbiAgICAgICAgICAgICdzY2VuZTpsaWdodC1wcm9iZS1lZGl0LW1vZGUtY2hhbmdlZCcsXG4gICAgICAgICAgICAnc2NlbmU6bGlnaHQtcHJvYmUtYm91bmRpbmctYm94LWVkaXQtbW9kZS1jaGFuZ2VkJyxcbiAgICAgICAgICAgICdhc3NldC1kYjpyZWFkeScsXG4gICAgICAgICAgICAnYXNzZXQtZGI6Y2xvc2UnLFxuICAgICAgICAgICAgJ2Fzc2V0LWRiOmFzc2V0LWFkZCcsXG4gICAgICAgICAgICAnYXNzZXQtZGI6YXNzZXQtY2hhbmdlJyxcbiAgICAgICAgICAgICdhc3NldC1kYjphc3NldC1kZWxldGUnXG4gICAgICAgIF07XG5cbiAgICAgICAgaW1wb3J0YW50TWVzc2FnZXMuZm9yRWFjaChtZXNzYWdlVHlwZSA9PiB7XG4gICAgICAgICAgICB0aGlzLmFkZEJyb2FkY2FzdExpc3RlbmVyKG1lc3NhZ2VUeXBlKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhZGRCcm9hZGNhc3RMaXN0ZW5lcihtZXNzYWdlVHlwZTogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGxpc3RlbmVyID0gKGRhdGE6IGFueSkgPT4ge1xuICAgICAgICAgICAgdGhpcy5tZXNzYWdlTG9nLnB1c2goe1xuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IG1lc3NhZ2VUeXBlLFxuICAgICAgICAgICAgICAgIGRhdGE6IGRhdGEsXG4gICAgICAgICAgICAgICAgdGltZXN0YW1wOiBEYXRlLm5vdygpXG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8g5L+d5oyB5pel6KqM5aSn5bCP5Zyo5ZCI55CG56+E5ZyN5YWnXG4gICAgICAgICAgICBpZiAodGhpcy5tZXNzYWdlTG9nLmxlbmd0aCA+IDEwMDApIHtcbiAgICAgICAgICAgICAgICB0aGlzLm1lc3NhZ2VMb2cgPSB0aGlzLm1lc3NhZ2VMb2cuc2xpY2UoLTUwMCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGRlYnVnTG9nKGBbQnJvYWRjYXN0XSAke21lc3NhZ2VUeXBlfTpgLCBkYXRhKTtcbiAgICAgICAgfTtcblxuICAgICAgICBpZiAoIXRoaXMubGlzdGVuZXJzLmhhcyhtZXNzYWdlVHlwZSkpIHtcbiAgICAgICAgICAgIHRoaXMubGlzdGVuZXJzLnNldChtZXNzYWdlVHlwZSwgW10pO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMubGlzdGVuZXJzLmdldChtZXNzYWdlVHlwZSkhLnB1c2gobGlzdGVuZXIpO1xuXG4gICAgICAgIC8vIOiou+WGiiBFZGl0b3Ig5raI5oGv55uj6IG9IC0g5pqr5pmC6Ki76YeL5o6J77yMRWRpdG9yLk1lc3NhZ2UgQVBJ5Y+v6IO95LiN5pSv5oyBXG4gICAgICAgIC8vIEVkaXRvci5NZXNzYWdlLm9uKG1lc3NhZ2VUeXBlLCBsaXN0ZW5lcik7XG4gICAgICAgIGRlYnVnTG9nKGBbQnJvYWRjYXN0VG9vbHNdIEFkZGVkIGxpc3RlbmVyIGZvciAke21lc3NhZ2VUeXBlfSAoc2ltdWxhdGVkKWApO1xuICAgIH1cblxuICAgIHByaXZhdGUgcmVtb3ZlQnJvYWRjYXN0TGlzdGVuZXIobWVzc2FnZVR5cGU6IHN0cmluZyk6IHZvaWQge1xuICAgICAgICBjb25zdCBsaXN0ZW5lcnMgPSB0aGlzLmxpc3RlbmVycy5nZXQobWVzc2FnZVR5cGUpO1xuICAgICAgICBpZiAobGlzdGVuZXJzKSB7XG4gICAgICAgICAgICBsaXN0ZW5lcnMuZm9yRWFjaChsaXN0ZW5lciA9PiB7XG4gICAgICAgICAgICAgICAgLy8gRWRpdG9yLk1lc3NhZ2Uub2ZmKG1lc3NhZ2VUeXBlLCBsaXN0ZW5lcik7XG4gICAgICAgICAgICAgICAgZGVidWdMb2coYFtCcm9hZGNhc3RUb29sc10gUmVtb3ZlZCBsaXN0ZW5lciBmb3IgJHttZXNzYWdlVHlwZX0gKHNpbXVsYXRlZClgKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgdGhpcy5saXN0ZW5lcnMuZGVsZXRlKG1lc3NhZ2VUeXBlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ2dldF9icm9hZGNhc3RfbG9nJyxcbiAgICAgICAgdGl0bGU6ICdSZWFkIGJyb2FkY2FzdCBsb2cnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBSZWFkIHRoZSBleHRlbnNpb24tbG9jYWwgYnJvYWRjYXN0IGxvZy4gTm8gcHJvamVjdCBzaWRlIGVmZmVjdHM7IGZpbHRlciBieSBtZXNzYWdlVHlwZSB0byBpbnNwZWN0IHNjZW5lL2Fzc2V0LWRiL2J1aWxkLXdvcmtlciBldmVudHMuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIGxpbWl0OiB6Lm51bWJlcigpLmRlZmF1bHQoNTApLmRlc2NyaWJlKCdNYXhpbXVtIHJlY2VudCBsb2cgZW50cmllcyB0byByZXR1cm4uIERlZmF1bHQgNTAuJyksXG4gICAgICAgICAgICBtZXNzYWdlVHlwZTogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdPcHRpb25hbCBicm9hZGNhc3QgdHlwZSBmaWx0ZXIsIGUuZy4gc2NlbmU6cmVhZHkgb3IgYXNzZXQtZGI6YXNzZXQtY2hhbmdlLicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIGdldEJyb2FkY2FzdExvZyhhcmdzOiB7IGxpbWl0PzogbnVtYmVyOyBtZXNzYWdlVHlwZT86IHN0cmluZyB9KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgbGltaXQgPSBhcmdzLmxpbWl0ID8/IDUwO1xuICAgICAgICBjb25zdCBtZXNzYWdlVHlwZSA9IGFyZ3MubWVzc2FnZVR5cGU7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgbGV0IGZpbHRlcmVkTG9nID0gdGhpcy5tZXNzYWdlTG9nO1xuXG4gICAgICAgICAgICBpZiAobWVzc2FnZVR5cGUpIHtcbiAgICAgICAgICAgICAgICBmaWx0ZXJlZExvZyA9IHRoaXMubWVzc2FnZUxvZy5maWx0ZXIoZW50cnkgPT4gZW50cnkubWVzc2FnZSA9PT0gbWVzc2FnZVR5cGUpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCByZWNlbnRMb2cgPSBmaWx0ZXJlZExvZy5zbGljZSgtbGltaXQpLm1hcChlbnRyeSA9PiAoe1xuICAgICAgICAgICAgICAgIC4uLmVudHJ5LFxuICAgICAgICAgICAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoZW50cnkudGltZXN0YW1wKS50b0lTT1N0cmluZygpXG4gICAgICAgICAgICB9KSk7XG5cbiAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICBsb2c6IHJlY2VudExvZyxcbiAgICAgICAgICAgICAgICAgICAgY291bnQ6IHJlY2VudExvZy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgIHRvdGFsQ291bnQ6IGZpbHRlcmVkTG9nLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgZmlsdGVyOiBtZXNzYWdlVHlwZSB8fCAnYWxsJyxcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogJ0Jyb2FkY2FzdCBsb2cgcmV0cmlldmVkIHN1Y2Nlc3NmdWxseSdcbiAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ2xpc3Rlbl9icm9hZGNhc3QnLFxuICAgICAgICB0aXRsZTogJ0xpc3RlbiBmb3IgYnJvYWRjYXN0JyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gQWRkIGEgbWVzc2FnZVR5cGUgdG8gdGhlIGV4dGVuc2lvbi1sb2NhbCBhY3RpdmUgbGlzdGVuZXIgbGlzdC4gQ3VycmVudCBwYXRoIGlzIHNpbXVsYXRlZC9sb2dnaW5nIG9ubHksIG5vdCBhIGd1YXJhbnRlZWQgbGl2ZSBFZGl0b3IgYnJvYWRjYXN0IHN1YnNjcmlwdGlvbi4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgbWVzc2FnZVR5cGU6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0Jyb2FkY2FzdCB0eXBlIHRvIGFkZCB0byB0aGUgbG9jYWwgbGlzdGVuZXIgbGlzdC4gQ3VycmVudCBpbXBsZW1lbnRhdGlvbiBpcyBzaW11bGF0ZWQvbG9nZ2luZyBvbmx5LicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIGxpc3RlbkJyb2FkY2FzdChhcmdzOiB7IG1lc3NhZ2VUeXBlOiBzdHJpbmcgfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IG1lc3NhZ2VUeXBlID0gYXJncy5tZXNzYWdlVHlwZTtcbiAgICAgICAgaWYgKCF0aGlzLmxpc3RlbmVycy5oYXMobWVzc2FnZVR5cGUpKSB7XG4gICAgICAgICAgICB0aGlzLmFkZEJyb2FkY2FzdExpc3RlbmVyKG1lc3NhZ2VUeXBlKTtcbiAgICAgICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2VUeXBlOiBtZXNzYWdlVHlwZSxcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYFN0YXJ0ZWQgbGlzdGVuaW5nIGZvciBicm9hZGNhc3Q6ICR7bWVzc2FnZVR5cGV9YFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgbWVzc2FnZVR5cGU6IG1lc3NhZ2VUeXBlLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBBbHJlYWR5IGxpc3RlbmluZyBmb3IgYnJvYWRjYXN0OiAke21lc3NhZ2VUeXBlfWBcbiAgICAgICAgICAgIH0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ3N0b3BfbGlzdGVuaW5nJyxcbiAgICAgICAgdGl0bGU6ICdTdG9wIGJyb2FkY2FzdCBsaXN0ZW5lcicsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFJlbW92ZSBhIG1lc3NhZ2VUeXBlIGZyb20gdGhlIGV4dGVuc2lvbi1sb2NhbCBsaXN0ZW5lciBsaXN0LiBEb2VzIG5vdCBhZmZlY3QgQ29jb3MgRWRpdG9yIGludGVybmFscy4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgbWVzc2FnZVR5cGU6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0Jyb2FkY2FzdCB0eXBlIHRvIHJlbW92ZSBmcm9tIHRoZSBsb2NhbCBsaXN0ZW5lciBsaXN0LicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIHN0b3BMaXN0ZW5pbmcoYXJnczogeyBtZXNzYWdlVHlwZTogc3RyaW5nIH0pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBtZXNzYWdlVHlwZSA9IGFyZ3MubWVzc2FnZVR5cGU7XG4gICAgICAgIGlmICh0aGlzLmxpc3RlbmVycy5oYXMobWVzc2FnZVR5cGUpKSB7XG4gICAgICAgICAgICB0aGlzLnJlbW92ZUJyb2FkY2FzdExpc3RlbmVyKG1lc3NhZ2VUeXBlKTtcbiAgICAgICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2VUeXBlOiBtZXNzYWdlVHlwZSxcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYFN0b3BwZWQgbGlzdGVuaW5nIGZvciBicm9hZGNhc3Q6ICR7bWVzc2FnZVR5cGV9YFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgbWVzc2FnZVR5cGU6IG1lc3NhZ2VUeXBlLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBXYXMgbm90IGxpc3RlbmluZyBmb3IgYnJvYWRjYXN0OiAke21lc3NhZ2VUeXBlfWBcbiAgICAgICAgICAgIH0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ2NsZWFyX2Jyb2FkY2FzdF9sb2cnLFxuICAgICAgICB0aXRsZTogJ0NsZWFyIGJyb2FkY2FzdCBsb2cnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBDbGVhciB0aGUgZXh0ZW5zaW9uLWxvY2FsIGJyb2FkY2FzdCBsb2cgb25seS4gRG9lcyBub3QgbW9kaWZ5IHNjZW5lLCBhc3NldHMsIG9yIEVkaXRvciBzdGF0ZS4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pLFxuICAgIH0pXG4gICAgYXN5bmMgY2xlYXJCcm9hZGNhc3RMb2coKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBwcmV2aW91c0NvdW50ID0gdGhpcy5tZXNzYWdlTG9nLmxlbmd0aDtcbiAgICAgICAgICAgIHRoaXMubWVzc2FnZUxvZyA9IFtdO1xuICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgIGNsZWFyZWRDb3VudDogcHJldmlvdXNDb3VudCxcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogJ0Jyb2FkY2FzdCBsb2cgY2xlYXJlZCBzdWNjZXNzZnVsbHknXG4gICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdnZXRfYWN0aXZlX2xpc3RlbmVycycsXG4gICAgICAgIHRpdGxlOiAnUmVhZCBhY3RpdmUgbGlzdGVuZXJzJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gTGlzdCBleHRlbnNpb24tbG9jYWwgYnJvYWRjYXN0IGxpc3RlbmVyIHR5cGVzIGFuZCBjb3VudHMgZm9yIGRpYWdub3N0aWNzLicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksXG4gICAgfSlcbiAgICBhc3luYyBnZXRBY3RpdmVMaXN0ZW5lcnMoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBhY3RpdmVMaXN0ZW5lcnMgPSBBcnJheS5mcm9tKHRoaXMubGlzdGVuZXJzLmtleXMoKSkubWFwKG1lc3NhZ2VUeXBlID0+ICh7XG4gICAgICAgICAgICAgICAgbWVzc2FnZVR5cGU6IG1lc3NhZ2VUeXBlLFxuICAgICAgICAgICAgICAgIGxpc3RlbmVyQ291bnQ6IHRoaXMubGlzdGVuZXJzLmdldChtZXNzYWdlVHlwZSk/Lmxlbmd0aCB8fCAwXG4gICAgICAgICAgICB9KSk7XG5cbiAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICBsaXN0ZW5lcnM6IGFjdGl2ZUxpc3RlbmVycyxcbiAgICAgICAgICAgICAgICAgICAgY291bnQ6IGFjdGl2ZUxpc3RlbmVycy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdBY3RpdmUgbGlzdGVuZXJzIHJldHJpZXZlZCBzdWNjZXNzZnVsbHknXG4gICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICB9KTtcbiAgICB9XG59XG4iXX0=