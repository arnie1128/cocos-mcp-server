import { ref, watch } from 'vue';
import { logger, setDebugLogEnabled } from '../../../lib/log';

export interface ServerSettings {
    port: number;
    autoStart: boolean;
    debugLog: boolean;
    maxConnections: number;
}

const PACKAGE_NAME = 'cocos-mcp-server';

const DEFAULTS: ServerSettings = {
    port: 3000,
    autoStart: false,
    debugLog: false,
    maxConnections: 10,
};

export function useSettings() {
    const settings = ref<ServerSettings>({ ...DEFAULTS });
    const settingsChanged = ref(false);

    watch(
        settings,
        () => {
            settingsChanged.value = true;
            // Keep panel-side debug logging in sync with the user toggle so
            // logger.debug calls in this process honour the same gate as the
            // host process.
            setDebugLogEnabled(settings.value.debugLog);
        },
        { deep: true },
    );

    const saveSettings = async () => {
        try {
            const result = await Editor.Message.request(PACKAGE_NAME, 'update-settings', {
                port: settings.value.port,
                autoStart: settings.value.autoStart,
                enableDebugLog: settings.value.debugLog,
                maxConnections: settings.value.maxConnections,
            });
            logger.debug('[Vue App] Save settings result:', result);
            settingsChanged.value = false;
        } catch (error) {
            logger.error('[Vue App] Failed to save settings:', error);
        }
    };

    const loadFromServerStatus = async () => {
        try {
            const status: any = await Editor.Message.request(PACKAGE_NAME, 'get-server-status');
            if (status?.settings) {
                settings.value = {
                    port: status.settings.port ?? DEFAULTS.port,
                    autoStart: status.settings.autoStart ?? DEFAULTS.autoStart,
                    debugLog: status.settings.enableDebugLog ?? DEFAULTS.debugLog,
                    maxConnections: status.settings.maxConnections ?? DEFAULTS.maxConnections,
                };
                logger.debug('[Vue App] Server settings loaded from status:', status.settings);
            } else if (status?.port) {
                settings.value.port = status.port;
                logger.debug('[Vue App] Port loaded from server status:', status.port);
            }
            settingsChanged.value = false;
        } catch (error) {
            logger.error('[Vue App] Failed to get server status:', error);
            logger.debug('[Vue App] Using default server settings');
        }
    };

    return {
        settings,
        settingsChanged,
        saveSettings,
        loadFromServerStatus,
    };
}
