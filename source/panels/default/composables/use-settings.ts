import { nextTick, ref, watch } from 'vue';
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
    // Suppress dirty-flag during programmatic loads. Vue's deep watch is
    // async (post-render), so settingsChanged.value=false set in the same
    // tick as settings.value=… would be re-flipped to true by the watch
    // callback firing afterwards. Gating the watch with this flag avoids
    // the race entirely.
    let suppressDirty = false;

    watch(
        settings,
        () => {
            setDebugLogEnabled(settings.value.debugLog);
            if (suppressDirty) return;
            settingsChanged.value = true;
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
            suppressDirty = true;
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
            await nextTick();
            settingsChanged.value = false;
            suppressDirty = false;
        } catch (error) {
            logger.error('[Vue App] Failed to get server status:', error);
            logger.debug('[Vue App] Using default server settings');
            suppressDirty = false;
        }
    };

    return {
        settings,
        settingsChanged,
        saveSettings,
        loadFromServerStatus,
    };
}
