import { ToolDefinition, ToolResponse, ToolExecutor } from '../types';
import { debugLog } from '../lib/log';
import { z } from '../lib/schema';
import { defineTools, ToolDef } from '../lib/define-tools';

export class BroadcastTools implements ToolExecutor {
    private listeners: Map<string, Function[]> = new Map();
    private messageLog: Array<{ message: string; data: any; timestamp: number }> = [];
    private readonly exec: ToolExecutor;

    constructor() {
        this.setupBroadcastListeners();
        const defs: ToolDef[] = [
            {
                name: 'get_broadcast_log',
                description: 'Read the extension-local broadcast log. No project side effects; filter by messageType to inspect scene/asset-db/build-worker events.',
                inputSchema: z.object({
                    limit: z.number().default(50).describe('Maximum recent log entries to return. Default 50.'),
                    messageType: z.string().optional().describe('Optional broadcast type filter, e.g. scene:ready or asset-db:asset-change.'),
                }),
                handler: a => this.getBroadcastLog(a.limit, a.messageType),
            },
            {
                name: 'listen_broadcast',
                description: 'Add a messageType to the extension-local active listener list. Current path is simulated/logging only, not a guaranteed live Editor broadcast subscription.',
                inputSchema: z.object({
                    messageType: z.string().describe('Broadcast type to add to the local listener list. Current implementation is simulated/logging only.'),
                }),
                handler: a => this.listenBroadcast(a.messageType),
            },
            {
                name: 'stop_listening',
                description: 'Remove a messageType from the extension-local listener list. Does not affect Cocos Editor internals.',
                inputSchema: z.object({
                    messageType: z.string().describe('Broadcast type to remove from the local listener list.'),
                }),
                handler: a => this.stopListening(a.messageType),
            },
            {
                name: 'clear_broadcast_log',
                description: 'Clear the extension-local broadcast log only. Does not modify scene, assets, or Editor state.',
                inputSchema: z.object({}),
                handler: () => this.clearBroadcastLog(),
            },
            {
                name: 'get_active_listeners',
                description: 'List extension-local broadcast listener types and counts for diagnostics.',
                inputSchema: z.object({}),
                handler: () => this.getActiveListeners(),
            },
        ];
        this.exec = defineTools(defs);
    }

    getTools(): ToolDefinition[] { return this.exec.getTools(); }
    execute(toolName: string, args: any): Promise<ToolResponse> { return this.exec.execute(toolName, args); }

    private setupBroadcastListeners(): void {
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

    private addBroadcastListener(messageType: string): void {
        const listener = (data: any) => {
            this.messageLog.push({
                message: messageType,
                data: data,
                timestamp: Date.now()
            });

            // 保持日誌大小在合理範圍內
            if (this.messageLog.length > 1000) {
                this.messageLog = this.messageLog.slice(-500);
            }

            debugLog(`[Broadcast] ${messageType}:`, data);
        };

        if (!this.listeners.has(messageType)) {
            this.listeners.set(messageType, []);
        }
        this.listeners.get(messageType)!.push(listener);

        // 註冊 Editor 消息監聽 - 暫時註釋掉，Editor.Message API可能不支持
        // Editor.Message.on(messageType, listener);
        debugLog(`[BroadcastTools] Added listener for ${messageType} (simulated)`);
    }

    private removeBroadcastListener(messageType: string): void {
        const listeners = this.listeners.get(messageType);
        if (listeners) {
            listeners.forEach(listener => {
                // Editor.Message.off(messageType, listener);
                debugLog(`[BroadcastTools] Removed listener for ${messageType} (simulated)`);
            });
            this.listeners.delete(messageType);
        }
    }

    private async getBroadcastLog(limit: number = 50, messageType?: string): Promise<ToolResponse> {
        return new Promise((resolve) => {
            let filteredLog = this.messageLog;

            if (messageType) {
                filteredLog = this.messageLog.filter(entry => entry.message === messageType);
            }

            const recentLog = filteredLog.slice(-limit).map(entry => ({
                ...entry,
                timestamp: new Date(entry.timestamp).toISOString()
            }));

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

    private async listenBroadcast(messageType: string): Promise<ToolResponse> {
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
                } else {
                    resolve({
                        success: true,
                        data: {
                            messageType: messageType,
                            message: `Already listening for broadcast: ${messageType}`
                        }
                    });
                }
            } catch (err: any) {
                resolve({ success: false, error: err.message });
            }
        });
    }

    private async stopListening(messageType: string): Promise<ToolResponse> {
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
                } else {
                    resolve({
                        success: true,
                        data: {
                            messageType: messageType,
                            message: `Was not listening for broadcast: ${messageType}`
                        }
                    });
                }
            } catch (err: any) {
                resolve({ success: false, error: err.message });
            }
        });
    }

    private async clearBroadcastLog(): Promise<ToolResponse> {
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

    private async getActiveListeners(): Promise<ToolResponse> {
        return new Promise((resolve) => {
            const activeListeners = Array.from(this.listeners.keys()).map(messageType => ({
                messageType: messageType,
                listenerCount: this.listeners.get(messageType)?.length || 0
            }));

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
