"use strict";
/* eslint-disable vue/one-component-per-file */
Object.defineProperty(exports, "__esModule", { value: true });
const fs_extra_1 = require("fs-extra");
const path_1 = require("path");
const vue_1 = require("vue");
const log_1 = require("../../lib/log");
const use_server_status_1 = require("./composables/use-server-status");
const use_settings_1 = require("./composables/use-settings");
const use_tool_config_1 = require("./composables/use-tool-config");
const panelDataMap = new WeakMap();
module.exports = Editor.Panel.define({
    listeners: {
        show() {
            log_1.logger.debug('[MCP Panel] Panel shown');
        },
        hide() {
            log_1.logger.debug('[MCP Panel] Panel hidden');
        },
    },
    template: (0, fs_extra_1.readFileSync)((0, path_1.join)(__dirname, '../../../static/template/default/index.html'), 'utf-8'),
    style: (0, fs_extra_1.readFileSync)((0, path_1.join)(__dirname, '../../../static/style/default/index.css'), 'utf-8'),
    $: {
        app: '#app',
        panelTitle: '#panelTitle',
    },
    ready() {
        if (!this.$.app)
            return;
        const app = (0, vue_1.createApp)({});
        app.config.compilerOptions.isCustomElement = (tag) => tag.startsWith('ui-');
        app.component('McpServerApp', (0, vue_1.defineComponent)({
            setup() {
                const activeTab = (0, vue_1.ref)('server');
                const settingsApi = (0, use_settings_1.useSettings)();
                const toolApi = (0, use_tool_config_1.useToolConfig)();
                const serverApi = (0, use_server_status_1.useServerStatus)(() => settingsApi.settings.value);
                const switchTab = (tabName) => {
                    activeTab.value = tabName;
                    if (tabName === 'tools') {
                        toolApi.loadToolManagerState();
                    }
                };
                (0, vue_1.onMounted)(async () => {
                    await toolApi.loadToolManagerState();
                    await settingsApi.loadFromServerStatus();
                    serverApi.startPolling();
                });
                (0, vue_1.onBeforeUnmount)(() => {
                    serverApi.stopPolling();
                });
                return Object.assign(Object.assign(Object.assign({ activeTab,
                    switchTab }, settingsApi), toolApi), serverApi);
            },
            template: (0, fs_extra_1.readFileSync)((0, path_1.join)(__dirname, '../../../static/template/vue/mcp-server-app.html'), 'utf-8'),
        }));
        app.mount(this.$.app);
        panelDataMap.set(this, app);
        log_1.logger.debug('[MCP Panel] Vue3 app mounted successfully');
    },
    beforeClose() { },
    close() {
        const app = panelDataMap.get(this);
        if (app) {
            app.unmount();
        }
    },
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zb3VyY2UvcGFuZWxzL2RlZmF1bHQvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBLCtDQUErQzs7QUFFL0MsdUNBQXdDO0FBQ3hDLCtCQUE0QjtBQUM1Qiw2QkFBdUY7QUFDdkYsdUNBQXVDO0FBQ3ZDLHVFQUFrRTtBQUNsRSw2REFBeUQ7QUFDekQsbUVBQThEO0FBRTlELE1BQU0sWUFBWSxHQUFHLElBQUksT0FBTyxFQUFZLENBQUM7QUFFN0MsTUFBTSxDQUFDLE9BQU8sR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQztJQUNqQyxTQUFTLEVBQUU7UUFDUCxJQUFJO1lBQ0EsWUFBTSxDQUFDLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDO1FBQzVDLENBQUM7UUFDRCxJQUFJO1lBQ0EsWUFBTSxDQUFDLEtBQUssQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO1FBQzdDLENBQUM7S0FDSjtJQUNELFFBQVEsRUFBRSxJQUFBLHVCQUFZLEVBQUMsSUFBQSxXQUFJLEVBQUMsU0FBUyxFQUFFLDZDQUE2QyxDQUFDLEVBQUUsT0FBTyxDQUFDO0lBQy9GLEtBQUssRUFBRSxJQUFBLHVCQUFZLEVBQUMsSUFBQSxXQUFJLEVBQUMsU0FBUyxFQUFFLHlDQUF5QyxDQUFDLEVBQUUsT0FBTyxDQUFDO0lBQ3hGLENBQUMsRUFBRTtRQUNDLEdBQUcsRUFBRSxNQUFNO1FBQ1gsVUFBVSxFQUFFLGFBQWE7S0FDNUI7SUFDRCxLQUFLO1FBQ0QsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsR0FBRztZQUFFLE9BQU87UUFDeEIsTUFBTSxHQUFHLEdBQUcsSUFBQSxlQUFTLEVBQUMsRUFBRSxDQUFDLENBQUM7UUFDMUIsR0FBRyxDQUFDLE1BQU0sQ0FBQyxlQUFlLENBQUMsZUFBZSxHQUFHLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBRTVFLEdBQUcsQ0FBQyxTQUFTLENBQUMsY0FBYyxFQUFFLElBQUEscUJBQWUsRUFBQztZQUMxQyxLQUFLO2dCQUNELE1BQU0sU0FBUyxHQUFHLElBQUEsU0FBRyxFQUFDLFFBQVEsQ0FBQyxDQUFDO2dCQUVoQyxNQUFNLFdBQVcsR0FBRyxJQUFBLDBCQUFXLEdBQUUsQ0FBQztnQkFDbEMsTUFBTSxPQUFPLEdBQUcsSUFBQSwrQkFBYSxHQUFFLENBQUM7Z0JBQ2hDLE1BQU0sU0FBUyxHQUFHLElBQUEsbUNBQWUsRUFBQyxHQUFHLEVBQUUsQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUVwRSxNQUFNLFNBQVMsR0FBRyxDQUFDLE9BQWUsRUFBRSxFQUFFO29CQUNsQyxTQUFTLENBQUMsS0FBSyxHQUFHLE9BQU8sQ0FBQztvQkFDMUIsSUFBSSxPQUFPLEtBQUssT0FBTyxFQUFFLENBQUM7d0JBQ3RCLE9BQU8sQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO29CQUNuQyxDQUFDO2dCQUNMLENBQUMsQ0FBQztnQkFFRixJQUFBLGVBQVMsRUFBQyxLQUFLLElBQUksRUFBRTtvQkFDakIsTUFBTSxPQUFPLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztvQkFDckMsTUFBTSxXQUFXLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztvQkFDekMsU0FBUyxDQUFDLFlBQVksRUFBRSxDQUFDO2dCQUM3QixDQUFDLENBQUMsQ0FBQztnQkFFSCxJQUFBLHFCQUFlLEVBQUMsR0FBRyxFQUFFO29CQUNqQixTQUFTLENBQUMsV0FBVyxFQUFFLENBQUM7Z0JBQzVCLENBQUMsQ0FBQyxDQUFDO2dCQUVILG1EQUNJLFNBQVM7b0JBQ1QsU0FBUyxJQUNOLFdBQVcsR0FDWCxPQUFPLEdBQ1AsU0FBUyxFQUNkO1lBQ04sQ0FBQztZQUNELFFBQVEsRUFBRSxJQUFBLHVCQUFZLEVBQUMsSUFBQSxXQUFJLEVBQUMsU0FBUyxFQUFFLGtEQUFrRCxDQUFDLEVBQUUsT0FBTyxDQUFDO1NBQ3ZHLENBQUMsQ0FBQyxDQUFDO1FBRUosR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3RCLFlBQVksQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQzVCLFlBQU0sQ0FBQyxLQUFLLENBQUMsMkNBQTJDLENBQUMsQ0FBQztJQUM5RCxDQUFDO0lBQ0QsV0FBVyxLQUFLLENBQUM7SUFDakIsS0FBSztRQUNELE1BQU0sR0FBRyxHQUFHLFlBQVksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDbkMsSUFBSSxHQUFHLEVBQUUsQ0FBQztZQUNOLEdBQUcsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNsQixDQUFDO0lBQ0wsQ0FBQztDQUNKLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qIGVzbGludC1kaXNhYmxlIHZ1ZS9vbmUtY29tcG9uZW50LXBlci1maWxlICovXG5cbmltcG9ydCB7IHJlYWRGaWxlU3luYyB9IGZyb20gJ2ZzLWV4dHJhJztcbmltcG9ydCB7IGpvaW4gfSBmcm9tICdwYXRoJztcbmltcG9ydCB7IEFwcCwgY3JlYXRlQXBwLCBkZWZpbmVDb21wb25lbnQsIG9uQmVmb3JlVW5tb3VudCwgb25Nb3VudGVkLCByZWYgfSBmcm9tICd2dWUnO1xuaW1wb3J0IHsgbG9nZ2VyIH0gZnJvbSAnLi4vLi4vbGliL2xvZyc7XG5pbXBvcnQgeyB1c2VTZXJ2ZXJTdGF0dXMgfSBmcm9tICcuL2NvbXBvc2FibGVzL3VzZS1zZXJ2ZXItc3RhdHVzJztcbmltcG9ydCB7IHVzZVNldHRpbmdzIH0gZnJvbSAnLi9jb21wb3NhYmxlcy91c2Utc2V0dGluZ3MnO1xuaW1wb3J0IHsgdXNlVG9vbENvbmZpZyB9IGZyb20gJy4vY29tcG9zYWJsZXMvdXNlLXRvb2wtY29uZmlnJztcblxuY29uc3QgcGFuZWxEYXRhTWFwID0gbmV3IFdlYWtNYXA8YW55LCBBcHA+KCk7XG5cbm1vZHVsZS5leHBvcnRzID0gRWRpdG9yLlBhbmVsLmRlZmluZSh7XG4gICAgbGlzdGVuZXJzOiB7XG4gICAgICAgIHNob3coKSB7XG4gICAgICAgICAgICBsb2dnZXIuZGVidWcoJ1tNQ1AgUGFuZWxdIFBhbmVsIHNob3duJyk7XG4gICAgICAgIH0sXG4gICAgICAgIGhpZGUoKSB7XG4gICAgICAgICAgICBsb2dnZXIuZGVidWcoJ1tNQ1AgUGFuZWxdIFBhbmVsIGhpZGRlbicpO1xuICAgICAgICB9LFxuICAgIH0sXG4gICAgdGVtcGxhdGU6IHJlYWRGaWxlU3luYyhqb2luKF9fZGlybmFtZSwgJy4uLy4uLy4uL3N0YXRpYy90ZW1wbGF0ZS9kZWZhdWx0L2luZGV4Lmh0bWwnKSwgJ3V0Zi04JyksXG4gICAgc3R5bGU6IHJlYWRGaWxlU3luYyhqb2luKF9fZGlybmFtZSwgJy4uLy4uLy4uL3N0YXRpYy9zdHlsZS9kZWZhdWx0L2luZGV4LmNzcycpLCAndXRmLTgnKSxcbiAgICAkOiB7XG4gICAgICAgIGFwcDogJyNhcHAnLFxuICAgICAgICBwYW5lbFRpdGxlOiAnI3BhbmVsVGl0bGUnLFxuICAgIH0sXG4gICAgcmVhZHkoKSB7XG4gICAgICAgIGlmICghdGhpcy4kLmFwcCkgcmV0dXJuO1xuICAgICAgICBjb25zdCBhcHAgPSBjcmVhdGVBcHAoe30pO1xuICAgICAgICBhcHAuY29uZmlnLmNvbXBpbGVyT3B0aW9ucy5pc0N1c3RvbUVsZW1lbnQgPSAodGFnKSA9PiB0YWcuc3RhcnRzV2l0aCgndWktJyk7XG5cbiAgICAgICAgYXBwLmNvbXBvbmVudCgnTWNwU2VydmVyQXBwJywgZGVmaW5lQ29tcG9uZW50KHtcbiAgICAgICAgICAgIHNldHVwKCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGFjdGl2ZVRhYiA9IHJlZignc2VydmVyJyk7XG5cbiAgICAgICAgICAgICAgICBjb25zdCBzZXR0aW5nc0FwaSA9IHVzZVNldHRpbmdzKCk7XG4gICAgICAgICAgICAgICAgY29uc3QgdG9vbEFwaSA9IHVzZVRvb2xDb25maWcoKTtcbiAgICAgICAgICAgICAgICBjb25zdCBzZXJ2ZXJBcGkgPSB1c2VTZXJ2ZXJTdGF0dXMoKCkgPT4gc2V0dGluZ3NBcGkuc2V0dGluZ3MudmFsdWUpO1xuXG4gICAgICAgICAgICAgICAgY29uc3Qgc3dpdGNoVGFiID0gKHRhYk5hbWU6IHN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgICAgICBhY3RpdmVUYWIudmFsdWUgPSB0YWJOYW1lO1xuICAgICAgICAgICAgICAgICAgICBpZiAodGFiTmFtZSA9PT0gJ3Rvb2xzJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgdG9vbEFwaS5sb2FkVG9vbE1hbmFnZXJTdGF0ZSgpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgIG9uTW91bnRlZChhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHRvb2xBcGkubG9hZFRvb2xNYW5hZ2VyU3RhdGUoKTtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgc2V0dGluZ3NBcGkubG9hZEZyb21TZXJ2ZXJTdGF0dXMoKTtcbiAgICAgICAgICAgICAgICAgICAgc2VydmVyQXBpLnN0YXJ0UG9sbGluZygpO1xuICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgb25CZWZvcmVVbm1vdW50KCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgc2VydmVyQXBpLnN0b3BQb2xsaW5nKCk7XG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICBhY3RpdmVUYWIsXG4gICAgICAgICAgICAgICAgICAgIHN3aXRjaFRhYixcbiAgICAgICAgICAgICAgICAgICAgLi4uc2V0dGluZ3NBcGksXG4gICAgICAgICAgICAgICAgICAgIC4uLnRvb2xBcGksXG4gICAgICAgICAgICAgICAgICAgIC4uLnNlcnZlckFwaSxcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHRlbXBsYXRlOiByZWFkRmlsZVN5bmMoam9pbihfX2Rpcm5hbWUsICcuLi8uLi8uLi9zdGF0aWMvdGVtcGxhdGUvdnVlL21jcC1zZXJ2ZXItYXBwLmh0bWwnKSwgJ3V0Zi04JyksXG4gICAgICAgIH0pKTtcblxuICAgICAgICBhcHAubW91bnQodGhpcy4kLmFwcCk7XG4gICAgICAgIHBhbmVsRGF0YU1hcC5zZXQodGhpcywgYXBwKTtcbiAgICAgICAgbG9nZ2VyLmRlYnVnKCdbTUNQIFBhbmVsXSBWdWUzIGFwcCBtb3VudGVkIHN1Y2Nlc3NmdWxseScpO1xuICAgIH0sXG4gICAgYmVmb3JlQ2xvc2UoKSB7IH0sXG4gICAgY2xvc2UoKSB7XG4gICAgICAgIGNvbnN0IGFwcCA9IHBhbmVsRGF0YU1hcC5nZXQodGhpcyk7XG4gICAgICAgIGlmIChhcHApIHtcbiAgICAgICAgICAgIGFwcC51bm1vdW50KCk7XG4gICAgICAgIH1cbiAgICB9LFxufSk7XG4iXX0=