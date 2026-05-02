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
                description: '[specialist] Read the extension-local broadcast log. No project side effects; filter by messageType to inspect scene/asset-db/build-worker events.',
                inputSchema: schema_1.z.object({
                    limit: schema_1.z.number().default(50).describe('Maximum recent log entries to return. Default 50.'),
                    messageType: schema_1.z.string().optional().describe('Optional broadcast type filter, e.g. scene:ready or asset-db:asset-change.'),
                }),
                handler: a => this.getBroadcastLog(a.limit, a.messageType),
            },
            {
                name: 'listen_broadcast',
                title: 'Listen for broadcast',
                description: '[specialist] Add a messageType to the extension-local active listener list. Current path is simulated/logging only, not a guaranteed live Editor broadcast subscription.',
                inputSchema: schema_1.z.object({
                    messageType: schema_1.z.string().describe('Broadcast type to add to the local listener list. Current implementation is simulated/logging only.'),
                }),
                handler: a => this.listenBroadcast(a.messageType),
            },
            {
                name: 'stop_listening',
                title: 'Stop broadcast listener',
                description: '[specialist] Remove a messageType from the extension-local listener list. Does not affect Cocos Editor internals.',
                inputSchema: schema_1.z.object({
                    messageType: schema_1.z.string().describe('Broadcast type to remove from the local listener list.'),
                }),
                handler: a => this.stopListening(a.messageType),
            },
            {
                name: 'clear_broadcast_log',
                title: 'Clear broadcast log',
                description: '[specialist] Clear the extension-local broadcast log only. Does not modify scene, assets, or Editor state.',
                inputSchema: schema_1.z.object({}),
                handler: () => this.clearBroadcastLog(),
            },
            {
                name: 'get_active_listeners',
                title: 'Read active listeners',
                description: '[specialist] List extension-local broadcast listener types and counts for diagnostics.',
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
    async stopListening(messageType) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvYWRjYXN0LXRvb2xzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL3Rvb2xzL2Jyb2FkY2FzdC10b29scy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSw4Q0FBMkM7QUFFM0Msb0NBQXNDO0FBQ3RDLDBDQUFrQztBQUNsQyxzREFBMkQ7QUFFM0QsTUFBYSxjQUFjO0lBS3ZCO1FBSlEsY0FBUyxHQUE0QixJQUFJLEdBQUcsRUFBRSxDQUFDO1FBQy9DLGVBQVUsR0FBNkQsRUFBRSxDQUFDO1FBSTlFLElBQUksQ0FBQyx1QkFBdUIsRUFBRSxDQUFDO1FBQy9CLE1BQU0sSUFBSSxHQUFjO1lBQ3BCO2dCQUNJLElBQUksRUFBRSxtQkFBbUI7Z0JBQ3pCLEtBQUssRUFBRSxvQkFBb0I7Z0JBQzNCLFdBQVcsRUFBRSxvSkFBb0o7Z0JBQ2pLLFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDO29CQUNsQixLQUFLLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMsbURBQW1ELENBQUM7b0JBQzNGLFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxFQUFFLENBQUMsUUFBUSxDQUFDLDRFQUE0RSxDQUFDO2lCQUM1SCxDQUFDO2dCQUNGLE9BQU8sRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsV0FBVyxDQUFDO2FBQzdEO1lBQ0Q7Z0JBQ0ksSUFBSSxFQUFFLGtCQUFrQjtnQkFDeEIsS0FBSyxFQUFFLHNCQUFzQjtnQkFDN0IsV0FBVyxFQUFFLDBLQUEwSztnQkFDdkwsV0FBVyxFQUFFLFVBQUMsQ0FBQyxNQUFNLENBQUM7b0JBQ2xCLFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLHFHQUFxRyxDQUFDO2lC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IjpbImltcG9ydCB7IG9rLCBmYWlsIH0gZnJvbSAnLi4vbGliL3Jlc3BvbnNlJztcbmltcG9ydCB7IFRvb2xEZWZpbml0aW9uLCBUb29sUmVzcG9uc2UsIFRvb2xFeGVjdXRvciB9IGZyb20gJy4uL3R5cGVzJztcbmltcG9ydCB7IGRlYnVnTG9nIH0gZnJvbSAnLi4vbGliL2xvZyc7XG5pbXBvcnQgeyB6IH0gZnJvbSAnLi4vbGliL3NjaGVtYSc7XG5pbXBvcnQgeyBkZWZpbmVUb29scywgVG9vbERlZiB9IGZyb20gJy4uL2xpYi9kZWZpbmUtdG9vbHMnO1xuXG5leHBvcnQgY2xhc3MgQnJvYWRjYXN0VG9vbHMgaW1wbGVtZW50cyBUb29sRXhlY3V0b3Ige1xuICAgIHByaXZhdGUgbGlzdGVuZXJzOiBNYXA8c3RyaW5nLCBGdW5jdGlvbltdPiA9IG5ldyBNYXAoKTtcbiAgICBwcml2YXRlIG1lc3NhZ2VMb2c6IEFycmF5PHsgbWVzc2FnZTogc3RyaW5nOyBkYXRhOiBhbnk7IHRpbWVzdGFtcDogbnVtYmVyIH0+ID0gW107XG4gICAgcHJpdmF0ZSByZWFkb25seSBleGVjOiBUb29sRXhlY3V0b3I7XG5cbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgdGhpcy5zZXR1cEJyb2FkY2FzdExpc3RlbmVycygpO1xuICAgICAgICBjb25zdCBkZWZzOiBUb29sRGVmW10gPSBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2dldF9icm9hZGNhc3RfbG9nJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1JlYWQgYnJvYWRjYXN0IGxvZycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gUmVhZCB0aGUgZXh0ZW5zaW9uLWxvY2FsIGJyb2FkY2FzdCBsb2cuIE5vIHByb2plY3Qgc2lkZSBlZmZlY3RzOyBmaWx0ZXIgYnkgbWVzc2FnZVR5cGUgdG8gaW5zcGVjdCBzY2VuZS9hc3NldC1kYi9idWlsZC13b3JrZXIgZXZlbnRzLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgbGltaXQ6IHoubnVtYmVyKCkuZGVmYXVsdCg1MCkuZGVzY3JpYmUoJ01heGltdW0gcmVjZW50IGxvZyBlbnRyaWVzIHRvIHJldHVybi4gRGVmYXVsdCA1MC4nKSxcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZVR5cGU6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnT3B0aW9uYWwgYnJvYWRjYXN0IHR5cGUgZmlsdGVyLCBlLmcuIHNjZW5lOnJlYWR5IG9yIGFzc2V0LWRiOmFzc2V0LWNoYW5nZS4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMuZ2V0QnJvYWRjYXN0TG9nKGEubGltaXQsIGEubWVzc2FnZVR5cGUpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnbGlzdGVuX2Jyb2FkY2FzdCcsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdMaXN0ZW4gZm9yIGJyb2FkY2FzdCcsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gQWRkIGEgbWVzc2FnZVR5cGUgdG8gdGhlIGV4dGVuc2lvbi1sb2NhbCBhY3RpdmUgbGlzdGVuZXIgbGlzdC4gQ3VycmVudCBwYXRoIGlzIHNpbXVsYXRlZC9sb2dnaW5nIG9ubHksIG5vdCBhIGd1YXJhbnRlZWQgbGl2ZSBFZGl0b3IgYnJvYWRjYXN0IHN1YnNjcmlwdGlvbi4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2VUeXBlOiB6LnN0cmluZygpLmRlc2NyaWJlKCdCcm9hZGNhc3QgdHlwZSB0byBhZGQgdG8gdGhlIGxvY2FsIGxpc3RlbmVyIGxpc3QuIEN1cnJlbnQgaW1wbGVtZW50YXRpb24gaXMgc2ltdWxhdGVkL2xvZ2dpbmcgb25seS4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMubGlzdGVuQnJvYWRjYXN0KGEubWVzc2FnZVR5cGUpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnc3RvcF9saXN0ZW5pbmcnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnU3RvcCBicm9hZGNhc3QgbGlzdGVuZXInLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFJlbW92ZSBhIG1lc3NhZ2VUeXBlIGZyb20gdGhlIGV4dGVuc2lvbi1sb2NhbCBsaXN0ZW5lciBsaXN0LiBEb2VzIG5vdCBhZmZlY3QgQ29jb3MgRWRpdG9yIGludGVybmFscy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2VUeXBlOiB6LnN0cmluZygpLmRlc2NyaWJlKCdCcm9hZGNhc3QgdHlwZSB0byByZW1vdmUgZnJvbSB0aGUgbG9jYWwgbGlzdGVuZXIgbGlzdC4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMuc3RvcExpc3RlbmluZyhhLm1lc3NhZ2VUeXBlKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2NsZWFyX2Jyb2FkY2FzdF9sb2cnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnQ2xlYXIgYnJvYWRjYXN0IGxvZycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gQ2xlYXIgdGhlIGV4dGVuc2lvbi1sb2NhbCBicm9hZGNhc3QgbG9nIG9ubHkuIERvZXMgbm90IG1vZGlmeSBzY2VuZSwgYXNzZXRzLCBvciBFZGl0b3Igc3RhdGUuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6ICgpID0+IHRoaXMuY2xlYXJCcm9hZGNhc3RMb2coKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2dldF9hY3RpdmVfbGlzdGVuZXJzJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1JlYWQgYWN0aXZlIGxpc3RlbmVycycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gTGlzdCBleHRlbnNpb24tbG9jYWwgYnJvYWRjYXN0IGxpc3RlbmVyIHR5cGVzIGFuZCBjb3VudHMgZm9yIGRpYWdub3N0aWNzLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiAoKSA9PiB0aGlzLmdldEFjdGl2ZUxpc3RlbmVycygpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgXTtcbiAgICAgICAgdGhpcy5leGVjID0gZGVmaW5lVG9vbHMoZGVmcyk7XG4gICAgfVxuXG4gICAgZ2V0VG9vbHMoKTogVG9vbERlZmluaXRpb25bXSB7IHJldHVybiB0aGlzLmV4ZWMuZ2V0VG9vbHMoKTsgfVxuICAgIGV4ZWN1dGUodG9vbE5hbWU6IHN0cmluZywgYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHsgcmV0dXJuIHRoaXMuZXhlYy5leGVjdXRlKHRvb2xOYW1lLCBhcmdzKTsgfVxuXG4gICAgcHJpdmF0ZSBzZXR1cEJyb2FkY2FzdExpc3RlbmVycygpOiB2b2lkIHtcbiAgICAgICAgLy8g6Kit572u6aCQ5a6a576p55qE6YeN6KaB5buj5pKt5raI5oGv55uj6IG9XG4gICAgICAgIGNvbnN0IGltcG9ydGFudE1lc3NhZ2VzID0gW1xuICAgICAgICAgICAgJ2J1aWxkLXdvcmtlcjpyZWFkeScsXG4gICAgICAgICAgICAnYnVpbGQtd29ya2VyOmNsb3NlZCcsXG4gICAgICAgICAgICAnc2NlbmU6cmVhZHknLFxuICAgICAgICAgICAgJ3NjZW5lOmNsb3NlJyxcbiAgICAgICAgICAgICdzY2VuZTpsaWdodC1wcm9iZS1lZGl0LW1vZGUtY2hhbmdlZCcsXG4gICAgICAgICAgICAnc2NlbmU6bGlnaHQtcHJvYmUtYm91bmRpbmctYm94LWVkaXQtbW9kZS1jaGFuZ2VkJyxcbiAgICAgICAgICAgICdhc3NldC1kYjpyZWFkeScsXG4gICAgICAgICAgICAnYXNzZXQtZGI6Y2xvc2UnLFxuICAgICAgICAgICAgJ2Fzc2V0LWRiOmFzc2V0LWFkZCcsXG4gICAgICAgICAgICAnYXNzZXQtZGI6YXNzZXQtY2hhbmdlJyxcbiAgICAgICAgICAgICdhc3NldC1kYjphc3NldC1kZWxldGUnXG4gICAgICAgIF07XG5cbiAgICAgICAgaW1wb3J0YW50TWVzc2FnZXMuZm9yRWFjaChtZXNzYWdlVHlwZSA9PiB7XG4gICAgICAgICAgICB0aGlzLmFkZEJyb2FkY2FzdExpc3RlbmVyKG1lc3NhZ2VUeXBlKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhZGRCcm9hZGNhc3RMaXN0ZW5lcihtZXNzYWdlVHlwZTogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGxpc3RlbmVyID0gKGRhdGE6IGFueSkgPT4ge1xuICAgICAgICAgICAgdGhpcy5tZXNzYWdlTG9nLnB1c2goe1xuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IG1lc3NhZ2VUeXBlLFxuICAgICAgICAgICAgICAgIGRhdGE6IGRhdGEsXG4gICAgICAgICAgICAgICAgdGltZXN0YW1wOiBEYXRlLm5vdygpXG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8g5L+d5oyB5pel6KqM5aSn5bCP5Zyo5ZCI55CG56+E5ZyN5YWnXG4gICAgICAgICAgICBpZiAodGhpcy5tZXNzYWdlTG9nLmxlbmd0aCA+IDEwMDApIHtcbiAgICAgICAgICAgICAgICB0aGlzLm1lc3NhZ2VMb2cgPSB0aGlzLm1lc3NhZ2VMb2cuc2xpY2UoLTUwMCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGRlYnVnTG9nKGBbQnJvYWRjYXN0XSAke21lc3NhZ2VUeXBlfTpgLCBkYXRhKTtcbiAgICAgICAgfTtcblxuICAgICAgICBpZiAoIXRoaXMubGlzdGVuZXJzLmhhcyhtZXNzYWdlVHlwZSkpIHtcbiAgICAgICAgICAgIHRoaXMubGlzdGVuZXJzLnNldChtZXNzYWdlVHlwZSwgW10pO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMubGlzdGVuZXJzLmdldChtZXNzYWdlVHlwZSkhLnB1c2gobGlzdGVuZXIpO1xuXG4gICAgICAgIC8vIOiou+WGiiBFZGl0b3Ig5raI5oGv55uj6IG9IC0g5pqr5pmC6Ki76YeL5o6J77yMRWRpdG9yLk1lc3NhZ2UgQVBJ5Y+v6IO95LiN5pSv5oyBXG4gICAgICAgIC8vIEVkaXRvci5NZXNzYWdlLm9uKG1lc3NhZ2VUeXBlLCBsaXN0ZW5lcik7XG4gICAgICAgIGRlYnVnTG9nKGBbQnJvYWRjYXN0VG9vbHNdIEFkZGVkIGxpc3RlbmVyIGZvciAke21lc3NhZ2VUeXBlfSAoc2ltdWxhdGVkKWApO1xuICAgIH1cblxuICAgIHByaXZhdGUgcmVtb3ZlQnJvYWRjYXN0TGlzdGVuZXIobWVzc2FnZVR5cGU6IHN0cmluZyk6IHZvaWQge1xuICAgICAgICBjb25zdCBsaXN0ZW5lcnMgPSB0aGlzLmxpc3RlbmVycy5nZXQobWVzc2FnZVR5cGUpO1xuICAgICAgICBpZiAobGlzdGVuZXJzKSB7XG4gICAgICAgICAgICBsaXN0ZW5lcnMuZm9yRWFjaChsaXN0ZW5lciA9PiB7XG4gICAgICAgICAgICAgICAgLy8gRWRpdG9yLk1lc3NhZ2Uub2ZmKG1lc3NhZ2VUeXBlLCBsaXN0ZW5lcik7XG4gICAgICAgICAgICAgICAgZGVidWdMb2coYFtCcm9hZGNhc3RUb29sc10gUmVtb3ZlZCBsaXN0ZW5lciBmb3IgJHttZXNzYWdlVHlwZX0gKHNpbXVsYXRlZClgKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgdGhpcy5saXN0ZW5lcnMuZGVsZXRlKG1lc3NhZ2VUeXBlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2V0QnJvYWRjYXN0TG9nKGxpbWl0OiBudW1iZXIgPSA1MCwgbWVzc2FnZVR5cGU/OiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIGxldCBmaWx0ZXJlZExvZyA9IHRoaXMubWVzc2FnZUxvZztcblxuICAgICAgICAgICAgaWYgKG1lc3NhZ2VUeXBlKSB7XG4gICAgICAgICAgICAgICAgZmlsdGVyZWRMb2cgPSB0aGlzLm1lc3NhZ2VMb2cuZmlsdGVyKGVudHJ5ID0+IGVudHJ5Lm1lc3NhZ2UgPT09IG1lc3NhZ2VUeXBlKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgcmVjZW50TG9nID0gZmlsdGVyZWRMb2cuc2xpY2UoLWxpbWl0KS5tYXAoZW50cnkgPT4gKHtcbiAgICAgICAgICAgICAgICAuLi5lbnRyeSxcbiAgICAgICAgICAgICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKGVudHJ5LnRpbWVzdGFtcCkudG9JU09TdHJpbmcoKVxuICAgICAgICAgICAgfSkpO1xuXG4gICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgbG9nOiByZWNlbnRMb2csXG4gICAgICAgICAgICAgICAgICAgIGNvdW50OiByZWNlbnRMb2cubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICB0b3RhbENvdW50OiBmaWx0ZXJlZExvZy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgIGZpbHRlcjogbWVzc2FnZVR5cGUgfHwgJ2FsbCcsXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdCcm9hZGNhc3QgbG9nIHJldHJpZXZlZCBzdWNjZXNzZnVsbHknXG4gICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGxpc3RlbkJyb2FkY2FzdChtZXNzYWdlVHlwZTogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgaWYgKCF0aGlzLmxpc3RlbmVycy5oYXMobWVzc2FnZVR5cGUpKSB7XG4gICAgICAgICAgICB0aGlzLmFkZEJyb2FkY2FzdExpc3RlbmVyKG1lc3NhZ2VUeXBlKTtcbiAgICAgICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2VUeXBlOiBtZXNzYWdlVHlwZSxcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYFN0YXJ0ZWQgbGlzdGVuaW5nIGZvciBicm9hZGNhc3Q6ICR7bWVzc2FnZVR5cGV9YFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgbWVzc2FnZVR5cGU6IG1lc3NhZ2VUeXBlLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBBbHJlYWR5IGxpc3RlbmluZyBmb3IgYnJvYWRjYXN0OiAke21lc3NhZ2VUeXBlfWBcbiAgICAgICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgc3RvcExpc3RlbmluZyhtZXNzYWdlVHlwZTogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgaWYgKHRoaXMubGlzdGVuZXJzLmhhcyhtZXNzYWdlVHlwZSkpIHtcbiAgICAgICAgICAgIHRoaXMucmVtb3ZlQnJvYWRjYXN0TGlzdGVuZXIobWVzc2FnZVR5cGUpO1xuICAgICAgICAgICAgcmV0dXJuIG9rKHtcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZVR5cGU6IG1lc3NhZ2VUeXBlLFxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgU3RvcHBlZCBsaXN0ZW5pbmcgZm9yIGJyb2FkY2FzdDogJHttZXNzYWdlVHlwZX1gXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG9rKHtcbiAgICAgICAgICAgICAgICBtZXNzYWdlVHlwZTogbWVzc2FnZVR5cGUsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogYFdhcyBub3QgbGlzdGVuaW5nIGZvciBicm9hZGNhc3Q6ICR7bWVzc2FnZVR5cGV9YFxuICAgICAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBjbGVhckJyb2FkY2FzdExvZygpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHByZXZpb3VzQ291bnQgPSB0aGlzLm1lc3NhZ2VMb2cubGVuZ3RoO1xuICAgICAgICAgICAgdGhpcy5tZXNzYWdlTG9nID0gW107XG4gICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgY2xlYXJlZENvdW50OiBwcmV2aW91c0NvdW50LFxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiAnQnJvYWRjYXN0IGxvZyBjbGVhcmVkIHN1Y2Nlc3NmdWxseSdcbiAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2V0QWN0aXZlTGlzdGVuZXJzKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgYWN0aXZlTGlzdGVuZXJzID0gQXJyYXkuZnJvbSh0aGlzLmxpc3RlbmVycy5rZXlzKCkpLm1hcChtZXNzYWdlVHlwZSA9PiAoe1xuICAgICAgICAgICAgICAgIG1lc3NhZ2VUeXBlOiBtZXNzYWdlVHlwZSxcbiAgICAgICAgICAgICAgICBsaXN0ZW5lckNvdW50OiB0aGlzLmxpc3RlbmVycy5nZXQobWVzc2FnZVR5cGUpPy5sZW5ndGggfHwgMFxuICAgICAgICAgICAgfSkpO1xuXG4gICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgbGlzdGVuZXJzOiBhY3RpdmVMaXN0ZW5lcnMsXG4gICAgICAgICAgICAgICAgICAgIGNvdW50OiBhY3RpdmVMaXN0ZW5lcnMubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiAnQWN0aXZlIGxpc3RlbmVycyByZXRyaWV2ZWQgc3VjY2Vzc2Z1bGx5J1xuICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgfSk7XG4gICAgfVxufVxuIl19