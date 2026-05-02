"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SceneViewTools = void 0;
const response_1 = require("../lib/response");
const schema_1 = require("../lib/schema");
const define_tools_1 = require("../lib/define-tools");
class SceneViewTools {
    constructor() {
        const defs = [
            { name: 'change_gizmo_tool', title: 'Set gizmo tool', description: '[specialist] Change active scene view gizmo tool; UI side effect only.',
                inputSchema: schema_1.z.object({ name: schema_1.z.enum(['position', 'rotation', 'scale', 'rect']).describe('Scene view gizmo tool to activate.') }),
                handler: a => this.changeGizmoTool(a.name) },
            { name: 'query_gizmo_tool_name', title: 'Read gizmo tool', description: '[specialist] Read active scene view gizmo tool.',
                inputSchema: schema_1.z.object({}), handler: () => this.queryGizmoToolName() },
            { name: 'change_gizmo_pivot', title: 'Set gizmo pivot', description: '[specialist] Change scene view transform pivot mode; UI side effect only.',
                inputSchema: schema_1.z.object({ name: schema_1.z.enum(['pivot', 'center']).describe('Transform pivot mode: pivot or center.') }),
                handler: a => this.changeGizmoPivot(a.name) },
            { name: 'query_gizmo_pivot', title: 'Read gizmo pivot', description: '[specialist] Read current scene view pivot mode.',
                inputSchema: schema_1.z.object({}), handler: () => this.queryGizmoPivot() },
            { name: 'query_gizmo_view_mode', title: 'Read gizmo view mode', description: '[specialist] Read current scene view/select mode.',
                inputSchema: schema_1.z.object({}), handler: () => this.queryGizmoViewMode() },
            { name: 'change_gizmo_coordinate', title: 'Set gizmo coordinate', description: '[specialist] Change scene view coordinate system to local/global; UI side effect only.',
                inputSchema: schema_1.z.object({ type: schema_1.z.enum(['local', 'global']).describe('Transform coordinate system for the scene view gizmo.') }),
                handler: a => this.changeGizmoCoordinate(a.type) },
            { name: 'query_gizmo_coordinate', title: 'Read gizmo coordinate', description: '[specialist] Read current scene view coordinate system.',
                inputSchema: schema_1.z.object({}), handler: () => this.queryGizmoCoordinate() },
            { name: 'change_view_mode_2d_3d', title: 'Set scene view mode', description: '[specialist] Switch scene view between 2D and 3D; UI side effect only.',
                inputSchema: schema_1.z.object({ is2D: schema_1.z.boolean().describe('true switches scene view to 2D mode; false switches to 3D mode.') }),
                handler: a => this.changeViewMode2D3D(a.is2D) },
            { name: 'query_view_mode_2d_3d', title: 'Read scene view mode', description: '[specialist] Read whether scene view is in 2D or 3D mode.',
                inputSchema: schema_1.z.object({}), handler: () => this.queryViewMode2D3D() },
            { name: 'set_grid_visible', title: 'Set grid visibility', description: '[specialist] Show or hide scene view grid; UI side effect only.',
                inputSchema: schema_1.z.object({ visible: schema_1.z.boolean().describe('Whether the scene view grid should be visible.') }),
                handler: a => this.setGridVisible(a.visible) },
            { name: 'query_grid_visible', title: 'Read grid visibility', description: '[specialist] Read scene view grid visibility.',
                inputSchema: schema_1.z.object({}), handler: () => this.queryGridVisible() },
            { name: 'set_icon_gizmo_3d', title: 'Set icon gizmo mode', description: '[specialist] Switch IconGizmo between 3D and 2D mode; UI side effect only.',
                inputSchema: schema_1.z.object({ is3D: schema_1.z.boolean().describe('true sets IconGizmo to 3D mode; false sets 2D mode.') }),
                handler: a => this.setIconGizmo3D(a.is3D) },
            { name: 'query_icon_gizmo_3d', title: 'Read icon gizmo mode', description: '[specialist] Read current IconGizmo 3D/2D mode.',
                inputSchema: schema_1.z.object({}), handler: () => this.queryIconGizmo3D() },
            { name: 'set_icon_gizmo_size', title: 'Set icon gizmo size', description: '[specialist] Set IconGizmo display size; UI side effect only.',
                inputSchema: schema_1.z.object({ size: schema_1.z.number().min(10).max(100).describe('IconGizmo size from 10 to 100.') }),
                handler: a => this.setIconGizmoSize(a.size) },
            { name: 'query_icon_gizmo_size', title: 'Read icon gizmo size', description: '[specialist] Read current IconGizmo display size.',
                inputSchema: schema_1.z.object({}), handler: () => this.queryIconGizmoSize() },
            { name: 'focus_camera_on_nodes', title: 'Focus camera on nodes', description: '[specialist] Focus scene view camera on nodes or all nodes; camera UI side effect only.',
                inputSchema: schema_1.z.object({ uuids: schema_1.z.array(schema_1.z.string()).nullable().describe('Node UUIDs to focus the scene camera on. null focuses all nodes.') }),
                handler: a => this.focusCameraOnNodes(a.uuids) },
            { name: 'align_camera_with_view', title: 'Align camera with view', description: '[specialist] Apply scene view camera transform to selected camera/node; may mutate selection.',
                inputSchema: schema_1.z.object({}), handler: () => this.alignCameraWithView() },
            { name: 'align_view_with_node', title: 'Align view with node', description: '[specialist] Align scene view to selected node; camera UI side effect only.',
                inputSchema: schema_1.z.object({}), handler: () => this.alignViewWithNode() },
            { name: 'get_scene_view_status', title: 'Read scene view status', description: '[specialist] Read combined scene view status snapshot.',
                inputSchema: schema_1.z.object({}), handler: () => this.getSceneViewStatus() },
            { name: 'reset_scene_view', title: 'Reset scene view', description: '[specialist] Reset scene view UI settings to defaults; UI side effects only.',
                inputSchema: schema_1.z.object({}), handler: () => this.resetSceneView() },
        ];
        this.exec = (0, define_tools_1.defineTools)(defs);
    }
    getTools() { return this.exec.getTools(); }
    execute(toolName, args) { return this.exec.execute(toolName, args); }
    async changeGizmoTool(name) {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'change-gizmo-tool', name).then(() => {
                resolve((0, response_1.ok)(undefined, `Gizmo tool changed to '${name}'`));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async queryGizmoToolName() {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'query-gizmo-tool-name').then((toolName) => {
                resolve((0, response_1.ok)({
                    currentTool: toolName,
                    message: `Current Gizmo tool: ${toolName}`
                }));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async changeGizmoPivot(name) {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'change-gizmo-pivot', name).then(() => {
                resolve((0, response_1.ok)(undefined, `Gizmo pivot changed to '${name}'`));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async queryGizmoPivot() {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'query-gizmo-pivot').then((pivotName) => {
                resolve((0, response_1.ok)({
                    currentPivot: pivotName,
                    message: `Current Gizmo pivot: ${pivotName}`
                }));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async queryGizmoViewMode() {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'query-gizmo-view-mode').then((viewMode) => {
                resolve((0, response_1.ok)({
                    viewMode: viewMode,
                    message: `Current view mode: ${viewMode}`
                }));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async changeGizmoCoordinate(type) {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'change-gizmo-coordinate', type).then(() => {
                resolve((0, response_1.ok)(undefined, `Coordinate system changed to '${type}'`));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async queryGizmoCoordinate() {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'query-gizmo-coordinate').then((coordinate) => {
                resolve((0, response_1.ok)({
                    coordinate: coordinate,
                    message: `Current coordinate system: ${coordinate}`
                }));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async changeViewMode2D3D(is2D) {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'change-is2D', is2D).then(() => {
                resolve((0, response_1.ok)(undefined, `View mode changed to ${is2D ? '2D' : '3D'}`));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async queryViewMode2D3D() {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'query-is2D').then((is2D) => {
                resolve((0, response_1.ok)({
                    is2D: is2D,
                    viewMode: is2D ? '2D' : '3D',
                    message: `Current view mode: ${is2D ? '2D' : '3D'}`
                }));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async setGridVisible(visible) {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'set-grid-visible', visible).then(() => {
                resolve((0, response_1.ok)(undefined, `Grid ${visible ? 'shown' : 'hidden'}`));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async queryGridVisible() {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'query-is-grid-visible').then((visible) => {
                resolve((0, response_1.ok)({
                    visible: visible,
                    message: `Grid is ${visible ? 'visible' : 'hidden'}`
                }));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async setIconGizmo3D(is3D) {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'set-icon-gizmo-3d', is3D).then(() => {
                resolve((0, response_1.ok)(undefined, `IconGizmo set to ${is3D ? '3D' : '2D'} mode`));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async queryIconGizmo3D() {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'query-is-icon-gizmo-3d').then((is3D) => {
                resolve((0, response_1.ok)({
                    is3D: is3D,
                    mode: is3D ? '3D' : '2D',
                    message: `IconGizmo is in ${is3D ? '3D' : '2D'} mode`
                }));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async setIconGizmoSize(size) {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'set-icon-gizmo-size', size).then(() => {
                resolve((0, response_1.ok)(undefined, `IconGizmo size set to ${size}`));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async queryIconGizmoSize() {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'query-icon-gizmo-size').then((size) => {
                resolve((0, response_1.ok)({
                    size: size,
                    message: `IconGizmo size: ${size}`
                }));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async focusCameraOnNodes(uuids) {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'focus-camera', uuids || []).then(() => {
                const message = uuids === null ?
                    'Camera focused on all nodes' :
                    `Camera focused on ${uuids.length} node(s)`;
                resolve((0, response_1.ok)(undefined, message));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async alignCameraWithView() {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'align-with-view').then(() => {
                resolve((0, response_1.ok)(undefined, 'Scene camera aligned with current view'));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async alignViewWithNode() {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'align-with-view-node').then(() => {
                resolve((0, response_1.ok)(undefined, 'View aligned with selected node'));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async getSceneViewStatus() {
        return new Promise(async (resolve) => {
            try {
                // Gather all view status information
                const [gizmoTool, gizmoPivot, gizmoCoordinate, viewMode2D3D, gridVisible, iconGizmo3D, iconGizmoSize] = await Promise.allSettled([
                    this.queryGizmoToolName(),
                    this.queryGizmoPivot(),
                    this.queryGizmoCoordinate(),
                    this.queryViewMode2D3D(),
                    this.queryGridVisible(),
                    this.queryIconGizmo3D(),
                    this.queryIconGizmoSize()
                ]);
                const status = {
                    timestamp: new Date().toISOString()
                };
                // Extract data from fulfilled promises
                if (gizmoTool.status === 'fulfilled' && gizmoTool.value.success) {
                    status.gizmoTool = gizmoTool.value.data.currentTool;
                }
                if (gizmoPivot.status === 'fulfilled' && gizmoPivot.value.success) {
                    status.gizmoPivot = gizmoPivot.value.data.currentPivot;
                }
                if (gizmoCoordinate.status === 'fulfilled' && gizmoCoordinate.value.success) {
                    status.coordinate = gizmoCoordinate.value.data.coordinate;
                }
                if (viewMode2D3D.status === 'fulfilled' && viewMode2D3D.value.success) {
                    status.is2D = viewMode2D3D.value.data.is2D;
                    status.viewMode = viewMode2D3D.value.data.viewMode;
                }
                if (gridVisible.status === 'fulfilled' && gridVisible.value.success) {
                    status.gridVisible = gridVisible.value.data.visible;
                }
                if (iconGizmo3D.status === 'fulfilled' && iconGizmo3D.value.success) {
                    status.iconGizmo3D = iconGizmo3D.value.data.is3D;
                }
                if (iconGizmoSize.status === 'fulfilled' && iconGizmoSize.value.success) {
                    status.iconGizmoSize = iconGizmoSize.value.data.size;
                }
                resolve((0, response_1.ok)(status));
            }
            catch (err) {
                resolve((0, response_1.fail)(`Failed to get scene view status: ${err.message}`));
            }
        });
    }
    async resetSceneView() {
        return new Promise(async (resolve) => {
            try {
                // Reset scene view to default settings
                const resetActions = [
                    this.changeGizmoTool('position'),
                    this.changeGizmoPivot('pivot'),
                    this.changeGizmoCoordinate('local'),
                    this.changeViewMode2D3D(false), // 3D mode
                    this.setGridVisible(true),
                    this.setIconGizmo3D(true),
                    this.setIconGizmoSize(60)
                ];
                await Promise.all(resetActions);
                resolve((0, response_1.ok)(undefined, 'Scene view reset to default settings'));
            }
            catch (err) {
                resolve((0, response_1.fail)(`Failed to reset scene view: ${err.message}`));
            }
        });
    }
}
exports.SceneViewTools = SceneViewTools;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NlbmUtdmlldy10b29scy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NvdXJjZS90b29scy9zY2VuZS12aWV3LXRvb2xzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLDhDQUEyQztBQUUzQywwQ0FBa0M7QUFDbEMsc0RBQTJEO0FBRTNELE1BQWEsY0FBYztJQUd2QjtRQUNJLE1BQU0sSUFBSSxHQUFjO1lBQ3BCLEVBQUUsSUFBSSxFQUFFLG1CQUFtQixFQUFFLEtBQUssRUFBRSxnQkFBZ0IsRUFBRSxXQUFXLEVBQUUsd0VBQXdFO2dCQUN2SSxXQUFXLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLElBQUksRUFBRSxVQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsVUFBVSxFQUFFLFVBQVUsRUFBRSxPQUFPLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsb0NBQW9DLENBQUMsRUFBRSxDQUFDO2dCQUNqSSxPQUFPLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRTtZQUNoRCxFQUFFLElBQUksRUFBRSx1QkFBdUIsRUFBRSxLQUFLLEVBQUUsaUJBQWlCLEVBQUUsV0FBVyxFQUFFLGlEQUFpRDtnQkFDckgsV0FBVyxFQUFFLFVBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLEVBQUUsT0FBTyxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxFQUFFO1lBQ3pFLEVBQUUsSUFBSSxFQUFFLG9CQUFvQixFQUFFLEtBQUssRUFBRSxpQkFBaUIsRUFBRSxXQUFXLEVBQUUsMkVBQTJFO2dCQUM1SSxXQUFXLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLElBQUksRUFBRSxVQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsT0FBTyxFQUFFLFFBQVEsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLHdDQUF3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QUFDLElBQUEsZUFBSSxFQUFDLCtCQUErQixHQUFHLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ2hFLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7Q0FDSjtBQTlWRCx3Q0E4VkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBvaywgZmFpbCB9IGZyb20gJy4uL2xpYi9yZXNwb25zZSc7XG5pbXBvcnQgeyBUb29sRGVmaW5pdGlvbiwgVG9vbFJlc3BvbnNlLCBUb29sRXhlY3V0b3IgfSBmcm9tICcuLi90eXBlcyc7XG5pbXBvcnQgeyB6IH0gZnJvbSAnLi4vbGliL3NjaGVtYSc7XG5pbXBvcnQgeyBkZWZpbmVUb29scywgVG9vbERlZiB9IGZyb20gJy4uL2xpYi9kZWZpbmUtdG9vbHMnO1xuXG5leHBvcnQgY2xhc3MgU2NlbmVWaWV3VG9vbHMgaW1wbGVtZW50cyBUb29sRXhlY3V0b3Ige1xuICAgIHByaXZhdGUgcmVhZG9ubHkgZXhlYzogVG9vbEV4ZWN1dG9yO1xuXG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIGNvbnN0IGRlZnM6IFRvb2xEZWZbXSA9IFtcbiAgICAgICAgICAgIHsgbmFtZTogJ2NoYW5nZV9naXptb190b29sJywgdGl0bGU6ICdTZXQgZ2l6bW8gdG9vbCcsIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIENoYW5nZSBhY3RpdmUgc2NlbmUgdmlldyBnaXptbyB0b29sOyBVSSBzaWRlIGVmZmVjdCBvbmx5LicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHsgbmFtZTogei5lbnVtKFsncG9zaXRpb24nLCAncm90YXRpb24nLCAnc2NhbGUnLCAncmVjdCddKS5kZXNjcmliZSgnU2NlbmUgdmlldyBnaXptbyB0b29sIHRvIGFjdGl2YXRlLicpIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy5jaGFuZ2VHaXptb1Rvb2woYS5uYW1lKSB9LFxuICAgICAgICAgICAgeyBuYW1lOiAncXVlcnlfZ2l6bW9fdG9vbF9uYW1lJywgdGl0bGU6ICdSZWFkIGdpem1vIHRvb2wnLCBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBSZWFkIGFjdGl2ZSBzY2VuZSB2aWV3IGdpem1vIHRvb2wuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pLCBoYW5kbGVyOiAoKSA9PiB0aGlzLnF1ZXJ5R2l6bW9Ub29sTmFtZSgpIH0sXG4gICAgICAgICAgICB7IG5hbWU6ICdjaGFuZ2VfZ2l6bW9fcGl2b3QnLCB0aXRsZTogJ1NldCBnaXptbyBwaXZvdCcsIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIENoYW5nZSBzY2VuZSB2aWV3IHRyYW5zZm9ybSBwaXZvdCBtb2RlOyBVSSBzaWRlIGVmZmVjdCBvbmx5LicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHsgbmFtZTogei5lbnVtKFsncGl2b3QnLCAnY2VudGVyJ10pLmRlc2NyaWJlKCdUcmFuc2Zvcm0gcGl2b3QgbW9kZTogcGl2b3Qgb3IgY2VudGVyLicpIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy5jaGFuZ2VHaXptb1Bpdm90KGEubmFtZSkgfSxcbiAgICAgICAgICAgIHsgbmFtZTogJ3F1ZXJ5X2dpem1vX3Bpdm90JywgdGl0bGU6ICdSZWFkIGdpem1vIHBpdm90JywgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gUmVhZCBjdXJyZW50IHNjZW5lIHZpZXcgcGl2b3QgbW9kZS4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksIGhhbmRsZXI6ICgpID0+IHRoaXMucXVlcnlHaXptb1Bpdm90KCkgfSxcbiAgICAgICAgICAgIHsgbmFtZTogJ3F1ZXJ5X2dpem1vX3ZpZXdfbW9kZScsIHRpdGxlOiAnUmVhZCBnaXptbyB2aWV3IG1vZGUnLCBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBSZWFkIGN1cnJlbnQgc2NlbmUgdmlldy9zZWxlY3QgbW9kZS4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksIGhhbmRsZXI6ICgpID0+IHRoaXMucXVlcnlHaXptb1ZpZXdNb2RlKCkgfSxcbiAgICAgICAgICAgIHsgbmFtZTogJ2NoYW5nZV9naXptb19jb29yZGluYXRlJywgdGl0bGU6ICdTZXQgZ2l6bW8gY29vcmRpbmF0ZScsIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIENoYW5nZSBzY2VuZSB2aWV3IGNvb3JkaW5hdGUgc3lzdGVtIHRvIGxvY2FsL2dsb2JhbDsgVUkgc2lkZSBlZmZlY3Qgb25seS4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7IHR5cGU6IHouZW51bShbJ2xvY2FsJywgJ2dsb2JhbCddKS5kZXNjcmliZSgnVHJhbnNmb3JtIGNvb3JkaW5hdGUgc3lzdGVtIGZvciB0aGUgc2NlbmUgdmlldyBnaXptby4nKSB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMuY2hhbmdlR2l6bW9Db29yZGluYXRlKGEudHlwZSkgfSxcbiAgICAgICAgICAgIHsgbmFtZTogJ3F1ZXJ5X2dpem1vX2Nvb3JkaW5hdGUnLCB0aXRsZTogJ1JlYWQgZ2l6bW8gY29vcmRpbmF0ZScsIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFJlYWQgY3VycmVudCBzY2VuZSB2aWV3IGNvb3JkaW5hdGUgc3lzdGVtLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSwgaGFuZGxlcjogKCkgPT4gdGhpcy5xdWVyeUdpem1vQ29vcmRpbmF0ZSgpIH0sXG4gICAgICAgICAgICB7IG5hbWU6ICdjaGFuZ2Vfdmlld19tb2RlXzJkXzNkJywgdGl0bGU6ICdTZXQgc2NlbmUgdmlldyBtb2RlJywgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gU3dpdGNoIHNjZW5lIHZpZXcgYmV0d2VlbiAyRCBhbmQgM0Q7IFVJIHNpZGUgZWZmZWN0IG9ubHkuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3QoeyBpczJEOiB6LmJvb2xlYW4oKS5kZXNjcmliZSgndHJ1ZSBzd2l0Y2hlcyBzY2VuZSB2aWV3IHRvIDJEIG1vZGU7IGZhbHNlIHN3aXRjaGVzIHRvIDNEIG1vZGUuJykgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLmNoYW5nZVZpZXdNb2RlMkQzRChhLmlzMkQpIH0sXG4gICAgICAgICAgICB7IG5hbWU6ICdxdWVyeV92aWV3X21vZGVfMmRfM2QnLCB0aXRsZTogJ1JlYWQgc2NlbmUgdmlldyBtb2RlJywgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gUmVhZCB3aGV0aGVyIHNjZW5lIHZpZXcgaXMgaW4gMkQgb3IgM0QgbW9kZS4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksIGhhbmRsZXI6ICgpID0+IHRoaXMucXVlcnlWaWV3TW9kZTJEM0QoKSB9LFxuICAgICAgICAgICAgeyBuYW1lOiAnc2V0X2dyaWRfdmlzaWJsZScsIHRpdGxlOiAnU2V0IGdyaWQgdmlzaWJpbGl0eScsIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFNob3cgb3IgaGlkZSBzY2VuZSB2aWV3IGdyaWQ7IFVJIHNpZGUgZWZmZWN0IG9ubHkuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3QoeyB2aXNpYmxlOiB6LmJvb2xlYW4oKS5kZXNjcmliZSgnV2hldGhlciB0aGUgc2NlbmUgdmlldyBncmlkIHNob3VsZCBiZSB2aXNpYmxlLicpIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy5zZXRHcmlkVmlzaWJsZShhLnZpc2libGUpIH0sXG4gICAgICAgICAgICB7IG5hbWU6ICdxdWVyeV9ncmlkX3Zpc2libGUnLCB0aXRsZTogJ1JlYWQgZ3JpZCB2aXNpYmlsaXR5JywgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gUmVhZCBzY2VuZSB2aWV3IGdyaWQgdmlzaWJpbGl0eS4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksIGhhbmRsZXI6ICgpID0+IHRoaXMucXVlcnlHcmlkVmlzaWJsZSgpIH0sXG4gICAgICAgICAgICB7IG5hbWU6ICdzZXRfaWNvbl9naXptb18zZCcsIHRpdGxlOiAnU2V0IGljb24gZ2l6bW8gbW9kZScsIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFN3aXRjaCBJY29uR2l6bW8gYmV0d2VlbiAzRCBhbmQgMkQgbW9kZTsgVUkgc2lkZSBlZmZlY3Qgb25seS4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7IGlzM0Q6IHouYm9vbGVhbigpLmRlc2NyaWJlKCd0cnVlIHNldHMgSWNvbkdpem1vIHRvIDNEIG1vZGU7IGZhbHNlIHNldHMgMkQgbW9kZS4nKSB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMuc2V0SWNvbkdpem1vM0QoYS5pczNEKSB9LFxuICAgICAgICAgICAgeyBuYW1lOiAncXVlcnlfaWNvbl9naXptb18zZCcsIHRpdGxlOiAnUmVhZCBpY29uIGdpem1vIG1vZGUnLCBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBSZWFkIGN1cnJlbnQgSWNvbkdpem1vIDNELzJEIG1vZGUuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pLCBoYW5kbGVyOiAoKSA9PiB0aGlzLnF1ZXJ5SWNvbkdpem1vM0QoKSB9LFxuICAgICAgICAgICAgeyBuYW1lOiAnc2V0X2ljb25fZ2l6bW9fc2l6ZScsIHRpdGxlOiAnU2V0IGljb24gZ2l6bW8gc2l6ZScsIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFNldCBJY29uR2l6bW8gZGlzcGxheSBzaXplOyBVSSBzaWRlIGVmZmVjdCBvbmx5LicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHsgc2l6ZTogei5udW1iZXIoKS5taW4oMTApLm1heCgxMDApLmRlc2NyaWJlKCdJY29uR2l6bW8gc2l6ZSBmcm9tIDEwIHRvIDEwMC4nKSB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMuc2V0SWNvbkdpem1vU2l6ZShhLnNpemUpIH0sXG4gICAgICAgICAgICB7IG5hbWU6ICdxdWVyeV9pY29uX2dpem1vX3NpemUnLCB0aXRsZTogJ1JlYWQgaWNvbiBnaXptbyBzaXplJywgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gUmVhZCBjdXJyZW50IEljb25HaXptbyBkaXNwbGF5IHNpemUuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pLCBoYW5kbGVyOiAoKSA9PiB0aGlzLnF1ZXJ5SWNvbkdpem1vU2l6ZSgpIH0sXG4gICAgICAgICAgICB7IG5hbWU6ICdmb2N1c19jYW1lcmFfb25fbm9kZXMnLCB0aXRsZTogJ0ZvY3VzIGNhbWVyYSBvbiBub2RlcycsIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIEZvY3VzIHNjZW5lIHZpZXcgY2FtZXJhIG9uIG5vZGVzIG9yIGFsbCBub2RlczsgY2FtZXJhIFVJIHNpZGUgZWZmZWN0IG9ubHkuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3QoeyB1dWlkczogei5hcnJheSh6LnN0cmluZygpKS5udWxsYWJsZSgpLmRlc2NyaWJlKCdOb2RlIFVVSURzIHRvIGZvY3VzIHRoZSBzY2VuZSBjYW1lcmEgb24uIG51bGwgZm9jdXNlcyBhbGwgbm9kZXMuJykgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLmZvY3VzQ2FtZXJhT25Ob2RlcyhhLnV1aWRzKSB9LFxuICAgICAgICAgICAgeyBuYW1lOiAnYWxpZ25fY2FtZXJhX3dpdGhfdmlldycsIHRpdGxlOiAnQWxpZ24gY2FtZXJhIHdpdGggdmlldycsIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIEFwcGx5IHNjZW5lIHZpZXcgY2FtZXJhIHRyYW5zZm9ybSB0byBzZWxlY3RlZCBjYW1lcmEvbm9kZTsgbWF5IG11dGF0ZSBzZWxlY3Rpb24uJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pLCBoYW5kbGVyOiAoKSA9PiB0aGlzLmFsaWduQ2FtZXJhV2l0aFZpZXcoKSB9LFxuICAgICAgICAgICAgeyBuYW1lOiAnYWxpZ25fdmlld193aXRoX25vZGUnLCB0aXRsZTogJ0FsaWduIHZpZXcgd2l0aCBub2RlJywgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gQWxpZ24gc2NlbmUgdmlldyB0byBzZWxlY3RlZCBub2RlOyBjYW1lcmEgVUkgc2lkZSBlZmZlY3Qgb25seS4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksIGhhbmRsZXI6ICgpID0+IHRoaXMuYWxpZ25WaWV3V2l0aE5vZGUoKSB9LFxuICAgICAgICAgICAgeyBuYW1lOiAnZ2V0X3NjZW5lX3ZpZXdfc3RhdHVzJywgdGl0bGU6ICdSZWFkIHNjZW5lIHZpZXcgc3RhdHVzJywgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gUmVhZCBjb21iaW5lZCBzY2VuZSB2aWV3IHN0YXR1cyBzbmFwc2hvdC4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksIGhhbmRsZXI6ICgpID0+IHRoaXMuZ2V0U2NlbmVWaWV3U3RhdHVzKCkgfSxcbiAgICAgICAgICAgIHsgbmFtZTogJ3Jlc2V0X3NjZW5lX3ZpZXcnLCB0aXRsZTogJ1Jlc2V0IHNjZW5lIHZpZXcnLCBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBSZXNldCBzY2VuZSB2aWV3IFVJIHNldHRpbmdzIHRvIGRlZmF1bHRzOyBVSSBzaWRlIGVmZmVjdHMgb25seS4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksIGhhbmRsZXI6ICgpID0+IHRoaXMucmVzZXRTY2VuZVZpZXcoKSB9LFxuICAgICAgICBdO1xuICAgICAgICB0aGlzLmV4ZWMgPSBkZWZpbmVUb29scyhkZWZzKTtcbiAgICB9XG5cbiAgICBnZXRUb29scygpOiBUb29sRGVmaW5pdGlvbltdIHsgcmV0dXJuIHRoaXMuZXhlYy5nZXRUb29scygpOyB9XG4gICAgZXhlY3V0ZSh0b29sTmFtZTogc3RyaW5nLCBhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4geyByZXR1cm4gdGhpcy5leGVjLmV4ZWN1dGUodG9vbE5hbWUsIGFyZ3MpOyB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGNoYW5nZUdpem1vVG9vbChuYW1lOiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ2NoYW5nZS1naXptby10b29sJywgbmFtZSkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh1bmRlZmluZWQsIGBHaXptbyB0b29sIGNoYW5nZWQgdG8gJyR7bmFtZX0nYCkpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHF1ZXJ5R2l6bW9Ub29sTmFtZSgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LWdpem1vLXRvb2wtbmFtZScpLnRoZW4oKHRvb2xOYW1lOiBzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGN1cnJlbnRUb29sOiB0b29sTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBDdXJyZW50IEdpem1vIHRvb2w6ICR7dG9vbE5hbWV9YFxuICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgY2hhbmdlR2l6bW9QaXZvdChuYW1lOiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ2NoYW5nZS1naXptby1waXZvdCcsIG5hbWUpLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2sodW5kZWZpbmVkLCBgR2l6bW8gcGl2b3QgY2hhbmdlZCB0byAnJHtuYW1lfSdgKSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgcXVlcnlHaXptb1Bpdm90KCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktZ2l6bW8tcGl2b3QnKS50aGVuKChwaXZvdE5hbWU6IHN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgY3VycmVudFBpdm90OiBwaXZvdE5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgQ3VycmVudCBHaXptbyBwaXZvdDogJHtwaXZvdE5hbWV9YFxuICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgcXVlcnlHaXptb1ZpZXdNb2RlKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktZ2l6bW8tdmlldy1tb2RlJykudGhlbigodmlld01vZGU6IHN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgdmlld01vZGU6IHZpZXdNb2RlLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYEN1cnJlbnQgdmlldyBtb2RlOiAke3ZpZXdNb2RlfWBcbiAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGNoYW5nZUdpem1vQ29vcmRpbmF0ZSh0eXBlOiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ2NoYW5nZS1naXptby1jb29yZGluYXRlJywgdHlwZSkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh1bmRlZmluZWQsIGBDb29yZGluYXRlIHN5c3RlbSBjaGFuZ2VkIHRvICcke3R5cGV9J2ApKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBxdWVyeUdpem1vQ29vcmRpbmF0ZSgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LWdpem1vLWNvb3JkaW5hdGUnKS50aGVuKChjb29yZGluYXRlOiBzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvb3JkaW5hdGU6IGNvb3JkaW5hdGUsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgQ3VycmVudCBjb29yZGluYXRlIHN5c3RlbTogJHtjb29yZGluYXRlfWBcbiAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGNoYW5nZVZpZXdNb2RlMkQzRChpczJEOiBib29sZWFuKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdjaGFuZ2UtaXMyRCcsIGlzMkQpLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2sodW5kZWZpbmVkLCBgVmlldyBtb2RlIGNoYW5nZWQgdG8gJHtpczJEID8gJzJEJyA6ICczRCd9YCkpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHF1ZXJ5Vmlld01vZGUyRDNEKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktaXMyRCcpLnRoZW4oKGlzMkQ6IGJvb2xlYW4pID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlzMkQ6IGlzMkQsXG4gICAgICAgICAgICAgICAgICAgICAgICB2aWV3TW9kZTogaXMyRCA/ICcyRCcgOiAnM0QnLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYEN1cnJlbnQgdmlldyBtb2RlOiAke2lzMkQgPyAnMkQnIDogJzNEJ31gXG4gICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBzZXRHcmlkVmlzaWJsZSh2aXNpYmxlOiBib29sZWFuKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdzZXQtZ3JpZC12aXNpYmxlJywgdmlzaWJsZSkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh1bmRlZmluZWQsIGBHcmlkICR7dmlzaWJsZSA/ICdzaG93bicgOiAnaGlkZGVuJ31gKSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgcXVlcnlHcmlkVmlzaWJsZSgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LWlzLWdyaWQtdmlzaWJsZScpLnRoZW4oKHZpc2libGU6IGJvb2xlYW4pID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZpc2libGU6IHZpc2libGUsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgR3JpZCBpcyAke3Zpc2libGUgPyAndmlzaWJsZScgOiAnaGlkZGVuJ31gXG4gICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBzZXRJY29uR2l6bW8zRChpczNEOiBib29sZWFuKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdzZXQtaWNvbi1naXptby0zZCcsIGlzM0QpLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2sodW5kZWZpbmVkLCBgSWNvbkdpem1vIHNldCB0byAke2lzM0QgPyAnM0QnIDogJzJEJ30gbW9kZWApKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBxdWVyeUljb25HaXptbzNEKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktaXMtaWNvbi1naXptby0zZCcpLnRoZW4oKGlzM0Q6IGJvb2xlYW4pID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlzM0Q6IGlzM0QsXG4gICAgICAgICAgICAgICAgICAgICAgICBtb2RlOiBpczNEID8gJzNEJyA6ICcyRCcsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgSWNvbkdpem1vIGlzIGluICR7aXMzRCA/ICczRCcgOiAnMkQnfSBtb2RlYFxuICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgc2V0SWNvbkdpem1vU2l6ZShzaXplOiBudW1iZXIpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3NldC1pY29uLWdpem1vLXNpemUnLCBzaXplKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHVuZGVmaW5lZCwgYEljb25HaXptbyBzaXplIHNldCB0byAke3NpemV9YCkpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHF1ZXJ5SWNvbkdpem1vU2l6ZSgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LWljb24tZ2l6bW8tc2l6ZScpLnRoZW4oKHNpemU6IG51bWJlcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgc2l6ZTogc2l6ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBJY29uR2l6bW8gc2l6ZTogJHtzaXplfWBcbiAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGZvY3VzQ2FtZXJhT25Ob2Rlcyh1dWlkczogc3RyaW5nW10gfCBudWxsKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdmb2N1cy1jYW1lcmEnLCB1dWlkcyB8fCBbXSkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgbWVzc2FnZSA9IHV1aWRzID09PSBudWxsID8gXG4gICAgICAgICAgICAgICAgICAgICdDYW1lcmEgZm9jdXNlZCBvbiBhbGwgbm9kZXMnIDogXG4gICAgICAgICAgICAgICAgICAgIGBDYW1lcmEgZm9jdXNlZCBvbiAke3V1aWRzLmxlbmd0aH0gbm9kZShzKWA7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh1bmRlZmluZWQsIG1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBhbGlnbkNhbWVyYVdpdGhWaWV3KCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnYWxpZ24td2l0aC12aWV3JykudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh1bmRlZmluZWQsICdTY2VuZSBjYW1lcmEgYWxpZ25lZCB3aXRoIGN1cnJlbnQgdmlldycpKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBhbGlnblZpZXdXaXRoTm9kZSgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ2FsaWduLXdpdGgtdmlldy1ub2RlJykudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh1bmRlZmluZWQsICdWaWV3IGFsaWduZWQgd2l0aCBzZWxlY3RlZCBub2RlJykpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldFNjZW5lVmlld1N0YXR1cygpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoYXN5bmMgKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgLy8gR2F0aGVyIGFsbCB2aWV3IHN0YXR1cyBpbmZvcm1hdGlvblxuICAgICAgICAgICAgICAgIGNvbnN0IFtcbiAgICAgICAgICAgICAgICAgICAgZ2l6bW9Ub29sLFxuICAgICAgICAgICAgICAgICAgICBnaXptb1Bpdm90LFxuICAgICAgICAgICAgICAgICAgICBnaXptb0Nvb3JkaW5hdGUsXG4gICAgICAgICAgICAgICAgICAgIHZpZXdNb2RlMkQzRCxcbiAgICAgICAgICAgICAgICAgICAgZ3JpZFZpc2libGUsXG4gICAgICAgICAgICAgICAgICAgIGljb25HaXptbzNELFxuICAgICAgICAgICAgICAgICAgICBpY29uR2l6bW9TaXplXG4gICAgICAgICAgICAgICAgXSA9IGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZChbXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucXVlcnlHaXptb1Rvb2xOYW1lKCksXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucXVlcnlHaXptb1Bpdm90KCksXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucXVlcnlHaXptb0Nvb3JkaW5hdGUoKSxcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5xdWVyeVZpZXdNb2RlMkQzRCgpLFxuICAgICAgICAgICAgICAgICAgICB0aGlzLnF1ZXJ5R3JpZFZpc2libGUoKSxcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5xdWVyeUljb25HaXptbzNEKCksXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucXVlcnlJY29uR2l6bW9TaXplKClcbiAgICAgICAgICAgICAgICBdKTtcblxuICAgICAgICAgICAgICAgIGNvbnN0IHN0YXR1czogYW55ID0ge1xuICAgICAgICAgICAgICAgICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKVxuICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgICAvLyBFeHRyYWN0IGRhdGEgZnJvbSBmdWxmaWxsZWQgcHJvbWlzZXNcbiAgICAgICAgICAgICAgICBpZiAoZ2l6bW9Ub29sLnN0YXR1cyA9PT0gJ2Z1bGZpbGxlZCcgJiYgZ2l6bW9Ub29sLnZhbHVlLnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzLmdpem1vVG9vbCA9IGdpem1vVG9vbC52YWx1ZS5kYXRhLmN1cnJlbnRUb29sO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoZ2l6bW9QaXZvdC5zdGF0dXMgPT09ICdmdWxmaWxsZWQnICYmIGdpem1vUGl2b3QudmFsdWUuc3VjY2Vzcykge1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXMuZ2l6bW9QaXZvdCA9IGdpem1vUGl2b3QudmFsdWUuZGF0YS5jdXJyZW50UGl2b3Q7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChnaXptb0Nvb3JkaW5hdGUuc3RhdHVzID09PSAnZnVsZmlsbGVkJyAmJiBnaXptb0Nvb3JkaW5hdGUudmFsdWUuc3VjY2Vzcykge1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXMuY29vcmRpbmF0ZSA9IGdpem1vQ29vcmRpbmF0ZS52YWx1ZS5kYXRhLmNvb3JkaW5hdGU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmICh2aWV3TW9kZTJEM0Quc3RhdHVzID09PSAnZnVsZmlsbGVkJyAmJiB2aWV3TW9kZTJEM0QudmFsdWUuc3VjY2Vzcykge1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXMuaXMyRCA9IHZpZXdNb2RlMkQzRC52YWx1ZS5kYXRhLmlzMkQ7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy52aWV3TW9kZSA9IHZpZXdNb2RlMkQzRC52YWx1ZS5kYXRhLnZpZXdNb2RlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoZ3JpZFZpc2libGUuc3RhdHVzID09PSAnZnVsZmlsbGVkJyAmJiBncmlkVmlzaWJsZS52YWx1ZS5zdWNjZXNzKSB7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5ncmlkVmlzaWJsZSA9IGdyaWRWaXNpYmxlLnZhbHVlLmRhdGEudmlzaWJsZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKGljb25HaXptbzNELnN0YXR1cyA9PT0gJ2Z1bGZpbGxlZCcgJiYgaWNvbkdpem1vM0QudmFsdWUuc3VjY2Vzcykge1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXMuaWNvbkdpem1vM0QgPSBpY29uR2l6bW8zRC52YWx1ZS5kYXRhLmlzM0Q7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChpY29uR2l6bW9TaXplLnN0YXR1cyA9PT0gJ2Z1bGZpbGxlZCcgJiYgaWNvbkdpem1vU2l6ZS52YWx1ZS5zdWNjZXNzKSB7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5pY29uR2l6bW9TaXplID0gaWNvbkdpem1vU2l6ZS52YWx1ZS5kYXRhLnNpemU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayhzdGF0dXMpKTtcblxuICAgICAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoYEZhaWxlZCB0byBnZXQgc2NlbmUgdmlldyBzdGF0dXM6ICR7ZXJyLm1lc3NhZ2V9YCkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHJlc2V0U2NlbmVWaWV3KCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZShhc3luYyAocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAvLyBSZXNldCBzY2VuZSB2aWV3IHRvIGRlZmF1bHQgc2V0dGluZ3NcbiAgICAgICAgICAgICAgICBjb25zdCByZXNldEFjdGlvbnMgPSBbXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY2hhbmdlR2l6bW9Ub29sKCdwb3NpdGlvbicpLFxuICAgICAgICAgICAgICAgICAgICB0aGlzLmNoYW5nZUdpem1vUGl2b3QoJ3Bpdm90JyksXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY2hhbmdlR2l6bW9Db29yZGluYXRlKCdsb2NhbCcpLFxuICAgICAgICAgICAgICAgICAgICB0aGlzLmNoYW5nZVZpZXdNb2RlMkQzRChmYWxzZSksIC8vIDNEIG1vZGVcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXRHcmlkVmlzaWJsZSh0cnVlKSxcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXRJY29uR2l6bW8zRCh0cnVlKSxcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXRJY29uR2l6bW9TaXplKDYwKVxuICAgICAgICAgICAgICAgIF07XG5cbiAgICAgICAgICAgICAgICBhd2FpdCBQcm9taXNlLmFsbChyZXNldEFjdGlvbnMpO1xuXG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh1bmRlZmluZWQsICdTY2VuZSB2aWV3IHJlc2V0IHRvIGRlZmF1bHQgc2V0dGluZ3MnKSk7XG5cbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGBGYWlsZWQgdG8gcmVzZXQgc2NlbmUgdmlldzogJHtlcnIubWVzc2FnZX1gKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cbn1cbiJdfQ==