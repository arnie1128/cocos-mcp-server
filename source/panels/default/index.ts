/* eslint-disable vue/one-component-per-file */

import { readFileSync } from 'fs-extra';
import { join } from 'path';
import { App, createApp, defineComponent, onBeforeUnmount, onMounted, ref } from 'vue';
import { logger } from '../../lib/log';
import { useServerStatus } from './composables/use-server-status';
import { useSettings } from './composables/use-settings';
import { useToolConfig } from './composables/use-tool-config';

const panelDataMap = new WeakMap<any, App>();

module.exports = Editor.Panel.define({
    listeners: {
        show() {
            logger.debug('[MCP Panel] Panel shown');
        },
        hide() {
            logger.debug('[MCP Panel] Panel hidden');
        },
    },
    template: readFileSync(join(__dirname, '../../../static/template/default/index.html'), 'utf-8'),
    style: readFileSync(join(__dirname, '../../../static/style/default/index.css'), 'utf-8'),
    $: {
        app: '#app',
        panelTitle: '#panelTitle',
    },
    ready() {
        if (!this.$.app) return;
        const app = createApp({});
        app.config.compilerOptions.isCustomElement = (tag) => tag.startsWith('ui-');

        app.component('McpServerApp', defineComponent({
            setup() {
                const activeTab = ref('server');

                const settingsApi = useSettings();
                const toolApi = useToolConfig();
                const serverApi = useServerStatus(() => settingsApi.settings.value);

                const switchTab = (tabName: string) => {
                    activeTab.value = tabName;
                    if (tabName === 'tools') {
                        toolApi.loadToolManagerState();
                    }
                };

                onMounted(async () => {
                    await toolApi.loadToolManagerState();
                    await settingsApi.loadFromServerStatus();
                    serverApi.startPolling();
                });

                onBeforeUnmount(() => {
                    serverApi.stopPolling();
                });

                return {
                    activeTab,
                    switchTab,
                    ...settingsApi,
                    ...toolApi,
                    ...serverApi,
                };
            },
            template: readFileSync(join(__dirname, '../../../static/template/vue/mcp-server-app.html'), 'utf-8'),
        }));

        app.mount(this.$.app);
        panelDataMap.set(this, app);
        logger.debug('[MCP Panel] Vue3 app mounted successfully');
    },
    beforeClose() { },
    close() {
        const app = panelDataMap.get(this);
        if (app) {
            app.unmount();
        }
    },
});
