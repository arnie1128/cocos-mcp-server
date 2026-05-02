"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SceneViewTools = void 0;
const response_1 = require("../lib/response");
const schema_1 = require("../lib/schema");
const decorators_1 = require("../lib/decorators");
class SceneViewTools {
    constructor() {
        this.exec = (0, decorators_1.defineToolsFromDecorators)(this);
    }
    getTools() { return this.exec.getTools(); }
    execute(toolName, args) { return this.exec.execute(toolName, args); }
    async changeGizmoTool(args) {
        const name = typeof args === 'string' ? args : args.name;
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
    async changeGizmoPivot(args) {
        const name = typeof args === 'string' ? args : args.name;
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
    async changeGizmoCoordinate(args) {
        const type = typeof args === 'string' ? args : args.type;
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
    async changeViewMode2D3D(args) {
        const is2D = typeof args === 'boolean' ? args : args.is2D;
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
    async setGridVisible(args) {
        const visible = typeof args === 'boolean' ? args : args.visible;
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
    async setIconGizmo3D(args) {
        const is3D = typeof args === 'boolean' ? args : args.is3D;
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
    async setIconGizmoSize(args) {
        const size = typeof args === 'number' ? args : args.size;
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
    async focusCameraOnNodes(args) {
        const uuids = Array.isArray(args) || args === null ? args : args.uuids;
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
__decorate([
    (0, decorators_1.mcpTool)({ name: 'change_gizmo_tool', title: 'Set gizmo tool', description: '[specialist] Change active scene view gizmo tool; UI side effect only.',
        inputSchema: schema_1.z.object({ name: schema_1.z.enum(['position', 'rotation', 'scale', 'rect']).describe('Scene view gizmo tool to activate.') }) })
], SceneViewTools.prototype, "changeGizmoTool", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'query_gizmo_tool_name', title: 'Read gizmo tool', description: '[specialist] Read active scene view gizmo tool.',
        inputSchema: schema_1.z.object({}) })
], SceneViewTools.prototype, "queryGizmoToolName", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'change_gizmo_pivot', title: 'Set gizmo pivot', description: '[specialist] Change scene view transform pivot mode; UI side effect only.',
        inputSchema: schema_1.z.object({ name: schema_1.z.enum(['pivot', 'center']).describe('Transform pivot mode: pivot or center.') }) })
], SceneViewTools.prototype, "changeGizmoPivot", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'query_gizmo_pivot', title: 'Read gizmo pivot', description: '[specialist] Read current scene view pivot mode.',
        inputSchema: schema_1.z.object({}) })
], SceneViewTools.prototype, "queryGizmoPivot", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'query_gizmo_view_mode', title: 'Read gizmo view mode', description: '[specialist] Read current scene view/select mode.',
        inputSchema: schema_1.z.object({}) })
], SceneViewTools.prototype, "queryGizmoViewMode", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'change_gizmo_coordinate', title: 'Set gizmo coordinate', description: '[specialist] Change scene view coordinate system to local/global; UI side effect only.',
        inputSchema: schema_1.z.object({ type: schema_1.z.enum(['local', 'global']).describe('Transform coordinate system for the scene view gizmo.') }) })
], SceneViewTools.prototype, "changeGizmoCoordinate", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'query_gizmo_coordinate', title: 'Read gizmo coordinate', description: '[specialist] Read current scene view coordinate system.',
        inputSchema: schema_1.z.object({}) })
], SceneViewTools.prototype, "queryGizmoCoordinate", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'change_view_mode_2d_3d', title: 'Set scene view mode', description: '[specialist] Switch scene view between 2D and 3D; UI side effect only.',
        inputSchema: schema_1.z.object({ is2D: schema_1.z.boolean().describe('true switches scene view to 2D mode; false switches to 3D mode.') }) })
], SceneViewTools.prototype, "changeViewMode2D3D", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'query_view_mode_2d_3d', title: 'Read scene view mode', description: '[specialist] Read whether scene view is in 2D or 3D mode.',
        inputSchema: schema_1.z.object({}) })
], SceneViewTools.prototype, "queryViewMode2D3D", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'set_grid_visible', title: 'Set grid visibility', description: '[specialist] Show or hide scene view grid; UI side effect only.',
        inputSchema: schema_1.z.object({ visible: schema_1.z.boolean().describe('Whether the scene view grid should be visible.') }) })
], SceneViewTools.prototype, "setGridVisible", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'query_grid_visible', title: 'Read grid visibility', description: '[specialist] Read scene view grid visibility.',
        inputSchema: schema_1.z.object({}) })
], SceneViewTools.prototype, "queryGridVisible", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'set_icon_gizmo_3d', title: 'Set icon gizmo mode', description: '[specialist] Switch IconGizmo between 3D and 2D mode; UI side effect only.',
        inputSchema: schema_1.z.object({ is3D: schema_1.z.boolean().describe('true sets IconGizmo to 3D mode; false sets 2D mode.') }) })
], SceneViewTools.prototype, "setIconGizmo3D", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'query_icon_gizmo_3d', title: 'Read icon gizmo mode', description: '[specialist] Read current IconGizmo 3D/2D mode.',
        inputSchema: schema_1.z.object({}) })
], SceneViewTools.prototype, "queryIconGizmo3D", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'set_icon_gizmo_size', title: 'Set icon gizmo size', description: '[specialist] Set IconGizmo display size; UI side effect only.',
        inputSchema: schema_1.z.object({ size: schema_1.z.number().min(10).max(100).describe('IconGizmo size from 10 to 100.') }) })
], SceneViewTools.prototype, "setIconGizmoSize", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'query_icon_gizmo_size', title: 'Read icon gizmo size', description: '[specialist] Read current IconGizmo display size.',
        inputSchema: schema_1.z.object({}) })
], SceneViewTools.prototype, "queryIconGizmoSize", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'focus_camera_on_nodes', title: 'Focus camera on nodes', description: '[specialist] Focus scene view camera on nodes or all nodes; camera UI side effect only.',
        inputSchema: schema_1.z.object({ uuids: schema_1.z.array(schema_1.z.string()).nullable().describe('Node UUIDs to focus the scene camera on. null focuses all nodes.') }) })
], SceneViewTools.prototype, "focusCameraOnNodes", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'align_camera_with_view', title: 'Align camera with view', description: '[specialist] Apply scene view camera transform to selected camera/node; may mutate selection.',
        inputSchema: schema_1.z.object({}) })
], SceneViewTools.prototype, "alignCameraWithView", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'align_view_with_node', title: 'Align view with node', description: '[specialist] Align scene view to selected node; camera UI side effect only.',
        inputSchema: schema_1.z.object({}) })
], SceneViewTools.prototype, "alignViewWithNode", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'get_scene_view_status', title: 'Read scene view status', description: '[specialist] Read combined scene view status snapshot.',
        inputSchema: schema_1.z.object({}) })
], SceneViewTools.prototype, "getSceneViewStatus", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'reset_scene_view', title: 'Reset scene view', description: '[specialist] Reset scene view UI settings to defaults; UI side effects only.',
        inputSchema: schema_1.z.object({}) })
], SceneViewTools.prototype, "resetSceneView", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NlbmUtdmlldy10b29scy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NvdXJjZS90b29scy9zY2VuZS12aWV3LXRvb2xzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7OztBQUFBLDhDQUEyQztBQUUzQywwQ0FBa0M7QUFDbEMsa0RBQXVFO0FBRXZFLE1BQWEsY0FBYztJQUd2QjtRQUNJLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBQSxzQ0FBeUIsRUFBQyxJQUFJLENBQUMsQ0FBQztJQUNoRCxDQUFDO0lBRUQsUUFBUSxLQUF1QixPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQzdELE9BQU8sQ0FBQyxRQUFnQixFQUFFLElBQVMsSUFBMkIsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBSW5HLEFBQU4sS0FBSyxDQUFDLGVBQWUsQ0FBQyxJQUErQjtRQUNqRCxNQUFNLElBQUksR0FBRyxPQUFPLElBQUksS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQztRQUN6RCxPQUFPLElBQUksT0FBTyxDQUFDLENBQUMsT0FBTyxFQUFFLEVBQUU7WUFDM0IsTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLG1CQUFtQixFQUFFLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUU7Z0JBQ2pFLE9BQU8sQ0FBQyxJQUFBLGFBQUUsRUFBQyxTQUFTLEVBQUUsMEJBQTBCLElBQUksR0FBRyxDQUFDLENBQUMsQ0FBQztZQUM5RCxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFVLEVBQUUsRUFBRTtnQkFDcEIsT0FBTyxDQUFDLElBQUEsZUFBSSxFQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxD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RTtRQUM5SixXQUFXLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDO3VEQVMvQjtBQUlLO0lBRkwsSUFBQSxvQkFBTyxFQUFDLEVBQUUsSUFBSSxFQUFFLHVCQUF1QixFQUFFLEtBQUssRUFBRSx3QkFBd0IsRUFBRSxXQUFXLEVBQUUsd0RBQXdEO1FBQzVJLFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUM7d0RBeUQvQjtBQUlLO0lBRkwsSUFBQSxvQkFBTyxFQUFDLEVBQUUsSUFBSSxFQUFFLGtCQUFrQixFQUFFLEtBQUssRUFBRSxrQkFBa0IsRUFBRSxXQUFXLEVBQUUsOEVBQThFO1FBQ3ZKLFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUM7b0RBdUIvQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IG9rLCBmYWlsIH0gZnJvbSAnLi4vbGliL3Jlc3BvbnNlJztcbmltcG9ydCB7IFRvb2xEZWZpbml0aW9uLCBUb29sUmVzcG9uc2UsIFRvb2xFeGVjdXRvciB9IGZyb20gJy4uL3R5cGVzJztcbmltcG9ydCB7IHogfSBmcm9tICcuLi9saWIvc2NoZW1hJztcbmltcG9ydCB7IG1jcFRvb2wsIGRlZmluZVRvb2xzRnJvbURlY29yYXRvcnMgfSBmcm9tICcuLi9saWIvZGVjb3JhdG9ycyc7XG5cbmV4cG9ydCBjbGFzcyBTY2VuZVZpZXdUb29scyBpbXBsZW1lbnRzIFRvb2xFeGVjdXRvciB7XG4gICAgcHJpdmF0ZSByZWFkb25seSBleGVjOiBUb29sRXhlY3V0b3I7XG5cbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgdGhpcy5leGVjID0gZGVmaW5lVG9vbHNGcm9tRGVjb3JhdG9ycyh0aGlzKTtcbiAgICB9XG5cbiAgICBnZXRUb29scygpOiBUb29sRGVmaW5pdGlvbltdIHsgcmV0dXJuIHRoaXMuZXhlYy5nZXRUb29scygpOyB9XG4gICAgZXhlY3V0ZSh0b29sTmFtZTogc3RyaW5nLCBhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4geyByZXR1cm4gdGhpcy5leGVjLmV4ZWN1dGUodG9vbE5hbWUsIGFyZ3MpOyB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdjaGFuZ2VfZ2l6bW9fdG9vbCcsIHRpdGxlOiAnU2V0IGdpem1vIHRvb2wnLCBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBDaGFuZ2UgYWN0aXZlIHNjZW5lIHZpZXcgZ2l6bW8gdG9vbDsgVUkgc2lkZSBlZmZlY3Qgb25seS4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3QoeyBuYW1lOiB6LmVudW0oWydwb3NpdGlvbicsICdyb3RhdGlvbicsICdzY2FsZScsICdyZWN0J10pLmRlc2NyaWJlKCdTY2VuZSB2aWV3IGdpem1vIHRvb2wgdG8gYWN0aXZhdGUuJykgfSkgfSlcbiAgICBhc3luYyBjaGFuZ2VHaXptb1Rvb2woYXJnczogeyBuYW1lOiBzdHJpbmcgfSB8IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IG5hbWUgPSB0eXBlb2YgYXJncyA9PT0gJ3N0cmluZycgPyBhcmdzIDogYXJncy5uYW1lO1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ2NoYW5nZS1naXptby10b29sJywgbmFtZSkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh1bmRlZmluZWQsIGBHaXptbyB0b29sIGNoYW5nZWQgdG8gJyR7bmFtZX0nYCkpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdxdWVyeV9naXptb190b29sX25hbWUnLCB0aXRsZTogJ1JlYWQgZ2l6bW8gdG9vbCcsIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFJlYWQgYWN0aXZlIHNjZW5lIHZpZXcgZ2l6bW8gdG9vbC4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pIH0pXG4gICAgYXN5bmMgcXVlcnlHaXptb1Rvb2xOYW1lKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktZ2l6bW8tdG9vbC1uYW1lJykudGhlbigodG9vbE5hbWU6IHN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgY3VycmVudFRvb2w6IHRvb2xOYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYEN1cnJlbnQgR2l6bW8gdG9vbDogJHt0b29sTmFtZX1gXG4gICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woeyBuYW1lOiAnY2hhbmdlX2dpem1vX3Bpdm90JywgdGl0bGU6ICdTZXQgZ2l6bW8gcGl2b3QnLCBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBDaGFuZ2Ugc2NlbmUgdmlldyB0cmFuc2Zvcm0gcGl2b3QgbW9kZTsgVUkgc2lkZSBlZmZlY3Qgb25seS4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3QoeyBuYW1lOiB6LmVudW0oWydwaXZvdCcsICdjZW50ZXInXSkuZGVzY3JpYmUoJ1RyYW5zZm9ybSBwaXZvdCBtb2RlOiBwaXZvdCBvciBjZW50ZXIuJykgfSkgfSlcbiAgICBhc3luYyBjaGFuZ2VHaXptb1Bpdm90KGFyZ3M6IHsgbmFtZTogc3RyaW5nIH0gfCBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBuYW1lID0gdHlwZW9mIGFyZ3MgPT09ICdzdHJpbmcnID8gYXJncyA6IGFyZ3MubmFtZTtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdjaGFuZ2UtZ2l6bW8tcGl2b3QnLCBuYW1lKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHVuZGVmaW5lZCwgYEdpem1vIHBpdm90IGNoYW5nZWQgdG8gJyR7bmFtZX0nYCkpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdxdWVyeV9naXptb19waXZvdCcsIHRpdGxlOiAnUmVhZCBnaXptbyBwaXZvdCcsIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFJlYWQgY3VycmVudCBzY2VuZSB2aWV3IHBpdm90IG1vZGUuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSB9KVxuICAgIGFzeW5jIHF1ZXJ5R2l6bW9QaXZvdCgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LWdpem1vLXBpdm90JykudGhlbigocGl2b3ROYW1lOiBzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGN1cnJlbnRQaXZvdDogcGl2b3ROYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYEN1cnJlbnQgR2l6bW8gcGl2b3Q6ICR7cGl2b3ROYW1lfWBcbiAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdxdWVyeV9naXptb192aWV3X21vZGUnLCB0aXRsZTogJ1JlYWQgZ2l6bW8gdmlldyBtb2RlJywgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gUmVhZCBjdXJyZW50IHNjZW5lIHZpZXcvc2VsZWN0IG1vZGUuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSB9KVxuICAgIGFzeW5jIHF1ZXJ5R2l6bW9WaWV3TW9kZSgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LWdpem1vLXZpZXctbW9kZScpLnRoZW4oKHZpZXdNb2RlOiBzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZpZXdNb2RlOiB2aWV3TW9kZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBDdXJyZW50IHZpZXcgbW9kZTogJHt2aWV3TW9kZX1gXG4gICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woeyBuYW1lOiAnY2hhbmdlX2dpem1vX2Nvb3JkaW5hdGUnLCB0aXRsZTogJ1NldCBnaXptbyBjb29yZGluYXRlJywgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gQ2hhbmdlIHNjZW5lIHZpZXcgY29vcmRpbmF0ZSBzeXN0ZW0gdG8gbG9jYWwvZ2xvYmFsOyBVSSBzaWRlIGVmZmVjdCBvbmx5LicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7IHR5cGU6IHouZW51bShbJ2xvY2FsJywgJ2dsb2JhbCddKS5kZXNjcmliZSgnVHJhbnNmb3JtIGNvb3JkaW5hdGUgc3lzdGVtIGZvciB0aGUgc2NlbmUgdmlldyBnaXptby4nKSB9KSB9KVxuICAgIGFzeW5jIGNoYW5nZUdpem1vQ29vcmRpbmF0ZShhcmdzOiB7IHR5cGU6IHN0cmluZyB9IHwgc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgdHlwZSA9IHR5cGVvZiBhcmdzID09PSAnc3RyaW5nJyA/IGFyZ3MgOiBhcmdzLnR5cGU7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnY2hhbmdlLWdpem1vLWNvb3JkaW5hdGUnLCB0eXBlKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHVuZGVmaW5lZCwgYENvb3JkaW5hdGUgc3lzdGVtIGNoYW5nZWQgdG8gJyR7dHlwZX0nYCkpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdxdWVyeV9naXptb19jb29yZGluYXRlJywgdGl0bGU6ICdSZWFkIGdpem1vIGNvb3JkaW5hdGUnLCBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBSZWFkIGN1cnJlbnQgc2NlbmUgdmlldyBjb29yZGluYXRlIHN5c3RlbS4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pIH0pXG4gICAgYXN5bmMgcXVlcnlHaXptb0Nvb3JkaW5hdGUoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1naXptby1jb29yZGluYXRlJykudGhlbigoY29vcmRpbmF0ZTogc3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb29yZGluYXRlOiBjb29yZGluYXRlLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYEN1cnJlbnQgY29vcmRpbmF0ZSBzeXN0ZW06ICR7Y29vcmRpbmF0ZX1gXG4gICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woeyBuYW1lOiAnY2hhbmdlX3ZpZXdfbW9kZV8yZF8zZCcsIHRpdGxlOiAnU2V0IHNjZW5lIHZpZXcgbW9kZScsIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFN3aXRjaCBzY2VuZSB2aWV3IGJldHdlZW4gMkQgYW5kIDNEOyBVSSBzaWRlIGVmZmVjdCBvbmx5LicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7IGlzMkQ6IHouYm9vbGVhbigpLmRlc2NyaWJlKCd0cnVlIHN3aXRjaGVzIHNjZW5lIHZpZXcgdG8gMkQgbW9kZTsgZmFsc2Ugc3dpdGNoZXMgdG8gM0QgbW9kZS4nKSB9KSB9KVxuICAgIGFzeW5jIGNoYW5nZVZpZXdNb2RlMkQzRChhcmdzOiB7IGlzMkQ6IGJvb2xlYW4gfSB8IGJvb2xlYW4pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBpczJEID0gdHlwZW9mIGFyZ3MgPT09ICdib29sZWFuJyA/IGFyZ3MgOiBhcmdzLmlzMkQ7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnY2hhbmdlLWlzMkQnLCBpczJEKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHVuZGVmaW5lZCwgYFZpZXcgbW9kZSBjaGFuZ2VkIHRvICR7aXMyRCA/ICcyRCcgOiAnM0QnfWApKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woeyBuYW1lOiAncXVlcnlfdmlld19tb2RlXzJkXzNkJywgdGl0bGU6ICdSZWFkIHNjZW5lIHZpZXcgbW9kZScsIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFJlYWQgd2hldGhlciBzY2VuZSB2aWV3IGlzIGluIDJEIG9yIDNEIG1vZGUuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSB9KVxuICAgIGFzeW5jIHF1ZXJ5Vmlld01vZGUyRDNEKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktaXMyRCcpLnRoZW4oKGlzMkQ6IGJvb2xlYW4pID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlzMkQ6IGlzMkQsXG4gICAgICAgICAgICAgICAgICAgICAgICB2aWV3TW9kZTogaXMyRCA/ICcyRCcgOiAnM0QnLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYEN1cnJlbnQgdmlldyBtb2RlOiAke2lzMkQgPyAnMkQnIDogJzNEJ31gXG4gICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woeyBuYW1lOiAnc2V0X2dyaWRfdmlzaWJsZScsIHRpdGxlOiAnU2V0IGdyaWQgdmlzaWJpbGl0eScsIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFNob3cgb3IgaGlkZSBzY2VuZSB2aWV3IGdyaWQ7IFVJIHNpZGUgZWZmZWN0IG9ubHkuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHsgdmlzaWJsZTogei5ib29sZWFuKCkuZGVzY3JpYmUoJ1doZXRoZXIgdGhlIHNjZW5lIHZpZXcgZ3JpZCBzaG91bGQgYmUgdmlzaWJsZS4nKSB9KSB9KVxuICAgIGFzeW5jIHNldEdyaWRWaXNpYmxlKGFyZ3M6IHsgdmlzaWJsZTogYm9vbGVhbiB9IHwgYm9vbGVhbik6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHZpc2libGUgPSB0eXBlb2YgYXJncyA9PT0gJ2Jvb2xlYW4nID8gYXJncyA6IGFyZ3MudmlzaWJsZTtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdzZXQtZ3JpZC12aXNpYmxlJywgdmlzaWJsZSkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh1bmRlZmluZWQsIGBHcmlkICR7dmlzaWJsZSA/ICdzaG93bicgOiAnaGlkZGVuJ31gKSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHsgbmFtZTogJ3F1ZXJ5X2dyaWRfdmlzaWJsZScsIHRpdGxlOiAnUmVhZCBncmlkIHZpc2liaWxpdHknLCBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBSZWFkIHNjZW5lIHZpZXcgZ3JpZCB2aXNpYmlsaXR5LicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSkgfSlcbiAgICBhc3luYyBxdWVyeUdyaWRWaXNpYmxlKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktaXMtZ3JpZC12aXNpYmxlJykudGhlbigodmlzaWJsZTogYm9vbGVhbikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgdmlzaWJsZTogdmlzaWJsZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBHcmlkIGlzICR7dmlzaWJsZSA/ICd2aXNpYmxlJyA6ICdoaWRkZW4nfWBcbiAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdzZXRfaWNvbl9naXptb18zZCcsIHRpdGxlOiAnU2V0IGljb24gZ2l6bW8gbW9kZScsIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFN3aXRjaCBJY29uR2l6bW8gYmV0d2VlbiAzRCBhbmQgMkQgbW9kZTsgVUkgc2lkZSBlZmZlY3Qgb25seS4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3QoeyBpczNEOiB6LmJvb2xlYW4oKS5kZXNjcmliZSgndHJ1ZSBzZXRzIEljb25HaXptbyB0byAzRCBtb2RlOyBmYWxzZSBzZXRzIDJEIG1vZGUuJykgfSkgfSlcbiAgICBhc3luYyBzZXRJY29uR2l6bW8zRChhcmdzOiB7IGlzM0Q6IGJvb2xlYW4gfSB8IGJvb2xlYW4pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBpczNEID0gdHlwZW9mIGFyZ3MgPT09ICdib29sZWFuJyA/IGFyZ3MgOiBhcmdzLmlzM0Q7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnc2V0LWljb24tZ2l6bW8tM2QnLCBpczNEKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHVuZGVmaW5lZCwgYEljb25HaXptbyBzZXQgdG8gJHtpczNEID8gJzNEJyA6ICcyRCd9IG1vZGVgKSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHsgbmFtZTogJ3F1ZXJ5X2ljb25fZ2l6bW9fM2QnLCB0aXRsZTogJ1JlYWQgaWNvbiBnaXptbyBtb2RlJywgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gUmVhZCBjdXJyZW50IEljb25HaXptbyAzRC8yRCBtb2RlLicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSkgfSlcbiAgICBhc3luYyBxdWVyeUljb25HaXptbzNEKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktaXMtaWNvbi1naXptby0zZCcpLnRoZW4oKGlzM0Q6IGJvb2xlYW4pID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlzM0Q6IGlzM0QsXG4gICAgICAgICAgICAgICAgICAgICAgICBtb2RlOiBpczNEID8gJzNEJyA6ICcyRCcsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgSWNvbkdpem1vIGlzIGluICR7aXMzRCA/ICczRCcgOiAnMkQnfSBtb2RlYFxuICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHsgbmFtZTogJ3NldF9pY29uX2dpem1vX3NpemUnLCB0aXRsZTogJ1NldCBpY29uIGdpem1vIHNpemUnLCBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBTZXQgSWNvbkdpem1vIGRpc3BsYXkgc2l6ZTsgVUkgc2lkZSBlZmZlY3Qgb25seS4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3QoeyBzaXplOiB6Lm51bWJlcigpLm1pbigxMCkubWF4KDEwMCkuZGVzY3JpYmUoJ0ljb25HaXptbyBzaXplIGZyb20gMTAgdG8gMTAwLicpIH0pIH0pXG4gICAgYXN5bmMgc2V0SWNvbkdpem1vU2l6ZShhcmdzOiB7IHNpemU6IG51bWJlciB9IHwgbnVtYmVyKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3Qgc2l6ZSA9IHR5cGVvZiBhcmdzID09PSAnbnVtYmVyJyA/IGFyZ3MgOiBhcmdzLnNpemU7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnc2V0LWljb24tZ2l6bW8tc2l6ZScsIHNpemUpLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2sodW5kZWZpbmVkLCBgSWNvbkdpem1vIHNpemUgc2V0IHRvICR7c2l6ZX1gKSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHsgbmFtZTogJ3F1ZXJ5X2ljb25fZ2l6bW9fc2l6ZScsIHRpdGxlOiAnUmVhZCBpY29uIGdpem1vIHNpemUnLCBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBSZWFkIGN1cnJlbnQgSWNvbkdpem1vIGRpc3BsYXkgc2l6ZS4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pIH0pXG4gICAgYXN5bmMgcXVlcnlJY29uR2l6bW9TaXplKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktaWNvbi1naXptby1zaXplJykudGhlbigoc2l6ZTogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICBzaXplOiBzaXplLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYEljb25HaXptbyBzaXplOiAke3NpemV9YFxuICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHsgbmFtZTogJ2ZvY3VzX2NhbWVyYV9vbl9ub2RlcycsIHRpdGxlOiAnRm9jdXMgY2FtZXJhIG9uIG5vZGVzJywgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gRm9jdXMgc2NlbmUgdmlldyBjYW1lcmEgb24gbm9kZXMgb3IgYWxsIG5vZGVzOyBjYW1lcmEgVUkgc2lkZSBlZmZlY3Qgb25seS4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3QoeyB1dWlkczogei5hcnJheSh6LnN0cmluZygpKS5udWxsYWJsZSgpLmRlc2NyaWJlKCdOb2RlIFVVSURzIHRvIGZvY3VzIHRoZSBzY2VuZSBjYW1lcmEgb24uIG51bGwgZm9jdXNlcyBhbGwgbm9kZXMuJykgfSkgfSlcbiAgICBhc3luYyBmb2N1c0NhbWVyYU9uTm9kZXMoYXJnczogeyB1dWlkczogc3RyaW5nW10gfCBudWxsIH0gfCBzdHJpbmdbXSB8IG51bGwpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCB1dWlkcyA9IEFycmF5LmlzQXJyYXkoYXJncykgfHwgYXJncyA9PT0gbnVsbCA/IGFyZ3MgOiBhcmdzLnV1aWRzO1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ2ZvY3VzLWNhbWVyYScsIHV1aWRzIHx8IFtdKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBtZXNzYWdlID0gdXVpZHMgPT09IG51bGwgPyBcbiAgICAgICAgICAgICAgICAgICAgJ0NhbWVyYSBmb2N1c2VkIG9uIGFsbCBub2RlcycgOiBcbiAgICAgICAgICAgICAgICAgICAgYENhbWVyYSBmb2N1c2VkIG9uICR7dXVpZHMubGVuZ3RofSBub2RlKHMpYDtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHVuZGVmaW5lZCwgbWVzc2FnZSkpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdhbGlnbl9jYW1lcmFfd2l0aF92aWV3JywgdGl0bGU6ICdBbGlnbiBjYW1lcmEgd2l0aCB2aWV3JywgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gQXBwbHkgc2NlbmUgdmlldyBjYW1lcmEgdHJhbnNmb3JtIHRvIHNlbGVjdGVkIGNhbWVyYS9ub2RlOyBtYXkgbXV0YXRlIHNlbGVjdGlvbi4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pIH0pXG4gICAgYXN5bmMgYWxpZ25DYW1lcmFXaXRoVmlldygpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ2FsaWduLXdpdGgtdmlldycpLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2sodW5kZWZpbmVkLCAnU2NlbmUgY2FtZXJhIGFsaWduZWQgd2l0aCBjdXJyZW50IHZpZXcnKSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHsgbmFtZTogJ2FsaWduX3ZpZXdfd2l0aF9ub2RlJywgdGl0bGU6ICdBbGlnbiB2aWV3IHdpdGggbm9kZScsIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIEFsaWduIHNjZW5lIHZpZXcgdG8gc2VsZWN0ZWQgbm9kZTsgY2FtZXJhIFVJIHNpZGUgZWZmZWN0IG9ubHkuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSB9KVxuICAgIGFzeW5jIGFsaWduVmlld1dpdGhOb2RlKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnYWxpZ24td2l0aC12aWV3LW5vZGUnKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHVuZGVmaW5lZCwgJ1ZpZXcgYWxpZ25lZCB3aXRoIHNlbGVjdGVkIG5vZGUnKSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHsgbmFtZTogJ2dldF9zY2VuZV92aWV3X3N0YXR1cycsIHRpdGxlOiAnUmVhZCBzY2VuZSB2aWV3IHN0YXR1cycsIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFJlYWQgY29tYmluZWQgc2NlbmUgdmlldyBzdGF0dXMgc25hcHNob3QuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSB9KVxuICAgIGFzeW5jIGdldFNjZW5lVmlld1N0YXR1cygpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoYXN5bmMgKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgLy8gR2F0aGVyIGFsbCB2aWV3IHN0YXR1cyBpbmZvcm1hdGlvblxuICAgICAgICAgICAgICAgIGNvbnN0IFtcbiAgICAgICAgICAgICAgICAgICAgZ2l6bW9Ub29sLFxuICAgICAgICAgICAgICAgICAgICBnaXptb1Bpdm90LFxuICAgICAgICAgICAgICAgICAgICBnaXptb0Nvb3JkaW5hdGUsXG4gICAgICAgICAgICAgICAgICAgIHZpZXdNb2RlMkQzRCxcbiAgICAgICAgICAgICAgICAgICAgZ3JpZFZpc2libGUsXG4gICAgICAgICAgICAgICAgICAgIGljb25HaXptbzNELFxuICAgICAgICAgICAgICAgICAgICBpY29uR2l6bW9TaXplXG4gICAgICAgICAgICAgICAgXSA9IGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZChbXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucXVlcnlHaXptb1Rvb2xOYW1lKCksXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucXVlcnlHaXptb1Bpdm90KCksXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucXVlcnlHaXptb0Nvb3JkaW5hdGUoKSxcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5xdWVyeVZpZXdNb2RlMkQzRCgpLFxuICAgICAgICAgICAgICAgICAgICB0aGlzLnF1ZXJ5R3JpZFZpc2libGUoKSxcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5xdWVyeUljb25HaXptbzNEKCksXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucXVlcnlJY29uR2l6bW9TaXplKClcbiAgICAgICAgICAgICAgICBdKTtcblxuICAgICAgICAgICAgICAgIGNvbnN0IHN0YXR1czogYW55ID0ge1xuICAgICAgICAgICAgICAgICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKVxuICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgICAvLyBFeHRyYWN0IGRhdGEgZnJvbSBmdWxmaWxsZWQgcHJvbWlzZXNcbiAgICAgICAgICAgICAgICBpZiAoZ2l6bW9Ub29sLnN0YXR1cyA9PT0gJ2Z1bGZpbGxlZCcgJiYgZ2l6bW9Ub29sLnZhbHVlLnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzLmdpem1vVG9vbCA9IGdpem1vVG9vbC52YWx1ZS5kYXRhLmN1cnJlbnRUb29sO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoZ2l6bW9QaXZvdC5zdGF0dXMgPT09ICdmdWxmaWxsZWQnICYmIGdpem1vUGl2b3QudmFsdWUuc3VjY2Vzcykge1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXMuZ2l6bW9QaXZvdCA9IGdpem1vUGl2b3QudmFsdWUuZGF0YS5jdXJyZW50UGl2b3Q7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChnaXptb0Nvb3JkaW5hdGUuc3RhdHVzID09PSAnZnVsZmlsbGVkJyAmJiBnaXptb0Nvb3JkaW5hdGUudmFsdWUuc3VjY2Vzcykge1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXMuY29vcmRpbmF0ZSA9IGdpem1vQ29vcmRpbmF0ZS52YWx1ZS5kYXRhLmNvb3JkaW5hdGU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmICh2aWV3TW9kZTJEM0Quc3RhdHVzID09PSAnZnVsZmlsbGVkJyAmJiB2aWV3TW9kZTJEM0QudmFsdWUuc3VjY2Vzcykge1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXMuaXMyRCA9IHZpZXdNb2RlMkQzRC52YWx1ZS5kYXRhLmlzMkQ7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy52aWV3TW9kZSA9IHZpZXdNb2RlMkQzRC52YWx1ZS5kYXRhLnZpZXdNb2RlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoZ3JpZFZpc2libGUuc3RhdHVzID09PSAnZnVsZmlsbGVkJyAmJiBncmlkVmlzaWJsZS52YWx1ZS5zdWNjZXNzKSB7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5ncmlkVmlzaWJsZSA9IGdyaWRWaXNpYmxlLnZhbHVlLmRhdGEudmlzaWJsZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKGljb25HaXptbzNELnN0YXR1cyA9PT0gJ2Z1bGZpbGxlZCcgJiYgaWNvbkdpem1vM0QudmFsdWUuc3VjY2Vzcykge1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXMuaWNvbkdpem1vM0QgPSBpY29uR2l6bW8zRC52YWx1ZS5kYXRhLmlzM0Q7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChpY29uR2l6bW9TaXplLnN0YXR1cyA9PT0gJ2Z1bGZpbGxlZCcgJiYgaWNvbkdpem1vU2l6ZS52YWx1ZS5zdWNjZXNzKSB7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5pY29uR2l6bW9TaXplID0gaWNvbkdpem1vU2l6ZS52YWx1ZS5kYXRhLnNpemU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayhzdGF0dXMpKTtcblxuICAgICAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoYEZhaWxlZCB0byBnZXQgc2NlbmUgdmlldyBzdGF0dXM6ICR7ZXJyLm1lc3NhZ2V9YCkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdyZXNldF9zY2VuZV92aWV3JywgdGl0bGU6ICdSZXNldCBzY2VuZSB2aWV3JywgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gUmVzZXQgc2NlbmUgdmlldyBVSSBzZXR0aW5ncyB0byBkZWZhdWx0czsgVUkgc2lkZSBlZmZlY3RzIG9ubHkuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSB9KVxuICAgIGFzeW5jIHJlc2V0U2NlbmVWaWV3KCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZShhc3luYyAocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAvLyBSZXNldCBzY2VuZSB2aWV3IHRvIGRlZmF1bHQgc2V0dGluZ3NcbiAgICAgICAgICAgICAgICBjb25zdCByZXNldEFjdGlvbnMgPSBbXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY2hhbmdlR2l6bW9Ub29sKCdwb3NpdGlvbicpLFxuICAgICAgICAgICAgICAgICAgICB0aGlzLmNoYW5nZUdpem1vUGl2b3QoJ3Bpdm90JyksXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY2hhbmdlR2l6bW9Db29yZGluYXRlKCdsb2NhbCcpLFxuICAgICAgICAgICAgICAgICAgICB0aGlzLmNoYW5nZVZpZXdNb2RlMkQzRChmYWxzZSksIC8vIDNEIG1vZGVcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXRHcmlkVmlzaWJsZSh0cnVlKSxcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXRJY29uR2l6bW8zRCh0cnVlKSxcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXRJY29uR2l6bW9TaXplKDYwKVxuICAgICAgICAgICAgICAgIF07XG5cbiAgICAgICAgICAgICAgICBhd2FpdCBQcm9taXNlLmFsbChyZXNldEFjdGlvbnMpO1xuXG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh1bmRlZmluZWQsICdTY2VuZSB2aWV3IHJlc2V0IHRvIGRlZmF1bHQgc2V0dGluZ3MnKSk7XG5cbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGBGYWlsZWQgdG8gcmVzZXQgc2NlbmUgdmlldzogJHtlcnIubWVzc2FnZX1gKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cbn1cbiJdfQ==