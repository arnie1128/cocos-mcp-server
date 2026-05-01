import { computed, ref } from 'vue';
import { logger } from '../../../lib/log';

export interface ToolConfig {
    category: string;
    name: string;
    enabled: boolean;
    description: string;
}

const PACKAGE_NAME = 'cocos-mcp-server';

const CATEGORY_DISPLAY: { [key: string]: string } = {
    scene: '場景工具',
    node: '節點工具',
    component: '組件工具',
    prefab: '預製體工具',
    project: '項目工具',
    debug: '調試工具',
    preferences: '偏好設置工具',
    server: '服務器工具',
    broadcast: '廣播工具',
    sceneAdvanced: '高級場景工具',
    sceneView: '場景視圖工具',
    referenceImage: '參考圖片工具',
    assetAdvanced: '高級資源工具',
    validation: '驗證工具',
};

export function useToolConfig() {
    const availableTools = ref<ToolConfig[]>([]);
    const toolCategories = ref<string[]>([]);

    const totalTools = computed(() => availableTools.value.length);
    const enabledTools = computed(() => availableTools.value.filter(t => t.enabled).length);
    const disabledTools = computed(() => totalTools.value - enabledTools.value);

    const refreshCategories = () => {
        toolCategories.value = Array.from(new Set(availableTools.value.map(t => t.category)));
    };

    const loadToolManagerState = async () => {
        try {
            const result: any = await Editor.Message.request(PACKAGE_NAME, 'getToolManagerState');
            if (result?.success) {
                availableTools.value = result.availableTools || [];
                logger.debug('[Vue App] Loaded tools:', availableTools.value.length);
                refreshCategories();
            }
        } catch (error) {
            logger.error('[Vue App] Failed to load tool manager state:', error);
        }
    };

    const findToolIndex = (category: string, name: string) =>
        availableTools.value.findIndex(t => t.category === category && t.name === name);

    const updateToolStatus = async (category: string, name: string, enabled: boolean) => {
        const idx = findToolIndex(category, name);
        try {
            logger.debug('[Vue App] updateToolStatus called:', category, name, enabled);
            if (idx !== -1) {
                availableTools.value[idx].enabled = enabled;
                availableTools.value = [...availableTools.value];
            }
            const result: any = await Editor.Message.request(PACKAGE_NAME, 'updateToolStatus', category, name, enabled);
            if (!result?.success) {
                if (idx !== -1) {
                    availableTools.value[idx].enabled = !enabled;
                    availableTools.value = [...availableTools.value];
                }
                logger.error('[Vue App] Backend update failed, rolled back local state');
            } else {
                logger.debug('[Vue App] Backend update successful');
            }
        } catch (error) {
            if (idx !== -1) {
                availableTools.value[idx].enabled = !enabled;
                availableTools.value = [...availableTools.value];
            }
            logger.error('[Vue App] Failed to update tool status:', error);
        }
    };

    const saveChanges = async () => {
        try {
            const updates = availableTools.value.map(tool => ({
                category: String(tool.category),
                name: String(tool.name),
                enabled: Boolean(tool.enabled),
            }));
            logger.debug('[Vue App] Sending updates:', updates.length, 'tools');
            const result: any = await Editor.Message.request(PACKAGE_NAME, 'updateToolStatusBatch', updates);
            if (result?.success) {
                logger.debug('[Vue App] Tool changes saved successfully');
            }
        } catch (error) {
            logger.error('[Vue App] Failed to save tool changes:', error);
        }
    };

    const selectAllTools = async () => {
        try {
            availableTools.value.forEach(t => (t.enabled = true));
            await saveChanges();
        } catch (error) {
            logger.error('[Vue App] Failed to select all tools:', error);
        }
    };

    const deselectAllTools = async () => {
        try {
            availableTools.value.forEach(t => (t.enabled = false));
            await saveChanges();
        } catch (error) {
            logger.error('[Vue App] Failed to deselect all tools:', error);
        }
    };

    const toggleCategoryTools = async (category: string, enabled: boolean) => {
        try {
            availableTools.value.forEach(t => {
                if (t.category === category) t.enabled = enabled;
            });
            await saveChanges();
        } catch (error) {
            logger.error('[Vue App] Failed to toggle category tools:', error);
        }
    };

    const getToolsByCategory = (category: string) =>
        availableTools.value.filter(t => t.category === category);

    const getCategoryDisplayName = (category: string) =>
        CATEGORY_DISPLAY[category] || category;

    return {
        availableTools,
        toolCategories,
        totalTools,
        enabledTools,
        disabledTools,
        loadToolManagerState,
        updateToolStatus,
        selectAllTools,
        deselectAllTools,
        saveChanges,
        toggleCategoryTools,
        getToolsByCategory,
        getCategoryDisplayName,
    };
}
