import { computed, onBeforeUnmount, ref } from 'vue';
import { logger } from '../../../lib/log';

export interface ToolConfig {
    category: string;
    name: string;
    enabled: boolean;
    description: string;
    title?: string;
}

const PACKAGE_NAME = 'cocos-mcp-server';

const CATEGORY_DISPLAY: { [key: string]: string } = {
    scene: '場景',
    sceneAdvanced: '場景進階',
    sceneView: '場景視圖',
    node: '節點',
    component: '組件',
    prefab: '預製體',
    project: '專案',
    debug: '除錯',
    preferences: '偏好設定',
    server: '伺服器',
    broadcast: '廣播',
    referenceImage: '參考圖片',
    assetAdvanced: '資源進階',
    assetMeta: '資源 Meta',
    inspector: 'Inspector',
    animation: '動畫',
    fileEditor: '檔案編輯',
    input: '輸入模擬',
    validation: '驗證',
};

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function useToolConfig() {
    const availableTools = ref<ToolConfig[]>([]);
    const searchQuery = ref('');
    const expandedCategories = ref<Set<string>>(new Set());
    const saveStatus = ref<SaveStatus>('idle');
    const saveMessage = ref<string>('');
    const loadError = ref<string>('');
    let saveTimer: ReturnType<typeof setTimeout> | null = null;

    onBeforeUnmount(() => {
        if (saveTimer) {
            clearTimeout(saveTimer);
            saveTimer = null;
        }
    });

    const totalTools = computed(() => availableTools.value.length);
    const enabledTools = computed(() => availableTools.value.filter(t => t.enabled).length);
    const disabledTools = computed(() => totalTools.value - enabledTools.value);

    const orderedCategories = computed(() => {
        const seen = new Set<string>();
        const order: string[] = [];
        for (const t of availableTools.value) {
            if (!seen.has(t.category)) {
                seen.add(t.category);
                order.push(t.category);
            }
        }
        return order;
    });

    const categoryStats = computed(() => {
        const stats: Record<string, { enabled: number; total: number }> = {};
        for (const t of availableTools.value) {
            const s = stats[t.category] || (stats[t.category] = { enabled: 0, total: 0 });
            s.total++;
            if (t.enabled) s.enabled++;
        }
        return stats;
    });

    const normalizedQuery = computed(() => searchQuery.value.trim().toLowerCase());

    const matchesQuery = (tool: ToolConfig, q: string) =>
        tool.name.toLowerCase().includes(q) ||
        (tool.title ?? '').toLowerCase().includes(q) ||
        (tool.description ?? '').toLowerCase().includes(q) ||
        tool.category.toLowerCase().includes(q) ||
        (CATEGORY_DISPLAY[tool.category] ?? '').toLowerCase().includes(q);

    // [{ category, displayName, tools (after filter), stats }]
    const visibleCategories = computed(() => {
        const q = normalizedQuery.value;
        const result: Array<{
            category: string;
            displayName: string;
            tools: ToolConfig[];
            stats: { enabled: number; total: number };
        }> = [];
        for (const cat of orderedCategories.value) {
            const all = availableTools.value.filter(t => t.category === cat);
            const tools = q ? all.filter(t => matchesQuery(t, q)) : all;
            if (q && tools.length === 0) continue;
            result.push({
                category: cat,
                displayName: CATEGORY_DISPLAY[cat] ?? cat,
                tools,
                stats: categoryStats.value[cat] ?? { enabled: 0, total: 0 },
            });
        }
        return result;
    });

    const isCategoryExpanded = (cat: string) =>
        normalizedQuery.value !== '' || expandedCategories.value.has(cat);

    const toggleCategory = (cat: string) => {
        const next = new Set(expandedCategories.value);
        if (next.has(cat)) next.delete(cat);
        else next.add(cat);
        expandedCategories.value = next;
    };

    const expandAll = () => {
        expandedCategories.value = new Set(orderedCategories.value);
    };

    const collapseAll = () => {
        expandedCategories.value = new Set();
    };

    const flashSaveStatus = (status: SaveStatus, message = '') => {
        saveStatus.value = status;
        saveMessage.value = message;
        if (saveTimer) clearTimeout(saveTimer);
        if (status === 'saved' || status === 'error') {
            saveTimer = setTimeout(() => {
                saveStatus.value = 'idle';
                saveMessage.value = '';
            }, 2000);
        }
    };

    const refreshFilter = () => {
        availableTools.value = [...availableTools.value];
    };

    const loadToolManagerState = async () => {
        try {
            const result: any = await Editor.Message.request(PACKAGE_NAME, 'getToolManagerState');
            if (result?.success) {
                availableTools.value = result.availableTools || [];
                loadError.value = '';
                logger.debug('[Vue App] Loaded tools:', availableTools.value.length);
            } else {
                loadError.value = '無法取得工具列表';
            }
        } catch (error) {
            logger.error('[Vue App] Failed to load tool manager state:', error);
            loadError.value = '載入工具列表失敗';
            flashSaveStatus('error', '載入失敗');
        }
    };

    const findToolIndex = (category: string, name: string) =>
        availableTools.value.findIndex(t => t.category === category && t.name === name);

    const updateToolStatus = async (category: string, name: string, enabled: boolean) => {
        const idx = findToolIndex(category, name);
        const previous = idx !== -1 ? availableTools.value[idx].enabled : null;
        try {
            if (idx !== -1) {
                availableTools.value[idx].enabled = enabled;
                refreshFilter();
            }
            flashSaveStatus('saving', '儲存中…');
            const result: any = await Editor.Message.request(
                PACKAGE_NAME, 'updateToolStatus', category, name, enabled,
            );
            if (result?.success) {
                flashSaveStatus('saved', '已儲存');
            } else {
                if (idx !== -1 && previous !== null) {
                    availableTools.value[idx].enabled = previous;
                    refreshFilter();
                }
                flashSaveStatus('error', '儲存失敗');
            }
        } catch (error) {
            if (idx !== -1 && previous !== null) {
                availableTools.value[idx].enabled = previous;
                refreshFilter();
            }
            logger.error('[Vue App] Failed to update tool status:', error);
            flashSaveStatus('error', '儲存失敗');
        }
    };

    const batchSave = async (): Promise<boolean> => {
        const updates = availableTools.value.map(tool => ({
            category: String(tool.category),
            name: String(tool.name),
            enabled: Boolean(tool.enabled),
        }));
        flashSaveStatus('saving', '儲存中…');
        try {
            const result: any = await Editor.Message.request(
                PACKAGE_NAME, 'updateToolStatusBatch', updates,
            );
            if (result?.success) {
                flashSaveStatus('saved', '已儲存');
                return true;
            }
            flashSaveStatus('error', '儲存失敗');
            return false;
        } catch (error) {
            logger.error('[Vue App] Failed to save tool changes:', error);
            flashSaveStatus('error', '儲存失敗');
            return false;
        }
    };

    const withBulkRollback = async (mutate: () => void) => {
        const snapshot = availableTools.value.map(t => ({ ...t }));
        mutate();
        refreshFilter();
        if (!(await batchSave())) {
            availableTools.value = snapshot;
        }
    };

    const selectAllTools = () => withBulkRollback(() => {
        availableTools.value.forEach(t => (t.enabled = true));
    });

    const deselectAllTools = () => withBulkRollback(() => {
        availableTools.value.forEach(t => (t.enabled = false));
    });

    const toggleCategoryTools = (category: string, enabled: boolean) =>
        withBulkRollback(() => {
            availableTools.value.forEach(t => {
                if (t.category === category) t.enabled = enabled;
            });
        });

    const applyProfile = async (profile: 'core' | 'full') => {
        flashSaveStatus('saving', '套用中…');
        try {
            const result: any = await Editor.Message.request(PACKAGE_NAME, 'applyToolProfile', profile);
            if (result?.success) {
                await loadToolManagerState();
                flashSaveStatus('saved', `已套用 ${profile}`);
            } else {
                flashSaveStatus('error', '套用失敗');
            }
        } catch (error) {
            logger.error('[Vue App] Failed to apply tool profile:', error);
            flashSaveStatus('error', '套用失敗');
        }
    };

    const clearSearch = () => {
        searchQuery.value = '';
    };

    const getCategoryDisplayName = (category: string) =>
        CATEGORY_DISPLAY[category] || category;

    return {
        availableTools,
        searchQuery,
        clearSearch,
        totalTools,
        enabledTools,
        disabledTools,
        visibleCategories,
        isCategoryExpanded,
        toggleCategory,
        expandAll,
        collapseAll,
        saveStatus,
        saveMessage,
        loadError,
        loadToolManagerState,
        updateToolStatus,
        selectAllTools,
        deselectAllTools,
        toggleCategoryTools,
        getCategoryDisplayName,
        applyProfile,
    };
}
