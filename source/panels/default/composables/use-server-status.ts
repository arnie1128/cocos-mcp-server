import { computed, ref } from 'vue';
import { logger } from '../../../lib/log';

interface ServerSettingsLike {
    port: number;
    autoStart: boolean;
    debugLog: boolean;
    maxConnections: number;
}

const PACKAGE_NAME = 'cocos-mcp-server';
const POLL_INTERVAL_MS = 2000;

export function useServerStatus(getSettings: () => ServerSettingsLike) {
    const serverRunning = ref(false);
    const serverStatus = ref('已停止');
    const connectedClients = ref(0);
    const httpUrl = ref('');
    const isProcessing = ref(false);

    const statusClass = computed(() => ({
        'status-running': serverRunning.value,
        'status-stopped': !serverRunning.value,
    }));

    const toggleServer = async () => {
        // Guard against double-click while a transition is in flight.
        if (isProcessing.value) return;
        isProcessing.value = true;
        try {
            if (serverRunning.value) {
                await Editor.Message.request(PACKAGE_NAME, 'stop-server');
            } else {
                const s = getSettings();
                await Editor.Message.request(PACKAGE_NAME, 'update-settings', {
                    port: s.port,
                    autoStart: s.autoStart,
                    enableDebugLog: s.debugLog,
                    maxConnections: s.maxConnections,
                });
                await Editor.Message.request(PACKAGE_NAME, 'start-server');
            }
            logger.debug('[Vue App] Server toggled');
            // Polling clears isProcessing on next tick after confirming the
            // new state — leaving the button disabled for up to one poll
            // interval is the right UX (the server's actual state hasn't
            // settled until the poll reports it).
        } catch (error) {
            logger.error('[Vue App] Failed to toggle server:', error);
            isProcessing.value = false;
        }
    };

    const copyUrl = async () => {
        try {
            await navigator.clipboard.writeText(httpUrl.value);
            logger.debug('[Vue App] URL copied to clipboard');
        } catch (error) {
            logger.error('[Vue App] Failed to copy URL:', error);
        }
    };

    let pollHandle: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
        if (pollHandle !== null) return;
        pollHandle = setInterval(async () => {
            try {
                const result: any = await Editor.Message.request(PACKAGE_NAME, 'get-server-status');
                if (!result) return;
                serverRunning.value = result.running;
                serverStatus.value = result.running ? '运行中' : '已停止';
                connectedClients.value = result.clients || 0;
                httpUrl.value = result.running ? `http://localhost:${result.port}` : '';
                isProcessing.value = false;
            } catch (error) {
                logger.error('[Vue App] Failed to get server status:', error);
            }
        }, POLL_INTERVAL_MS);
    };

    const stopPolling = () => {
        if (pollHandle !== null) {
            clearInterval(pollHandle);
            pollHandle = null;
        }
    };

    return {
        serverRunning,
        serverStatus,
        connectedClients,
        httpUrl,
        isProcessing,
        statusClass,
        toggleServer,
        copyUrl,
        startPolling,
        stopPolling,
    };
}
