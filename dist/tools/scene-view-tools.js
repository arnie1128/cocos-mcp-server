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
const scene_view_docs_1 = require("../data/scene-view-docs");
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
    (0, decorators_1.mcpTool)({ name: 'change_gizmo_tool', title: 'Set gizmo tool', description: scene_view_docs_1.SCENE_VIEW_DOCS.change_gizmo_tool,
        inputSchema: schema_1.z.object({ name: schema_1.z.enum(['position', 'rotation', 'scale', 'rect']).describe('Scene view gizmo tool to activate.') }) })
], SceneViewTools.prototype, "changeGizmoTool", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'query_gizmo_tool_name', title: 'Read gizmo tool', description: scene_view_docs_1.SCENE_VIEW_DOCS.query_gizmo_tool_name,
        inputSchema: schema_1.z.object({}) })
], SceneViewTools.prototype, "queryGizmoToolName", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'change_gizmo_pivot', title: 'Set gizmo pivot', description: scene_view_docs_1.SCENE_VIEW_DOCS.change_gizmo_pivot,
        inputSchema: schema_1.z.object({ name: schema_1.z.enum(['pivot', 'center']).describe('Transform pivot mode: pivot or center.') }) })
], SceneViewTools.prototype, "changeGizmoPivot", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'query_gizmo_pivot', title: 'Read gizmo pivot', description: scene_view_docs_1.SCENE_VIEW_DOCS.query_gizmo_pivot,
        inputSchema: schema_1.z.object({}) })
], SceneViewTools.prototype, "queryGizmoPivot", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'query_gizmo_view_mode', title: 'Read gizmo view mode', description: scene_view_docs_1.SCENE_VIEW_DOCS.query_gizmo_view_mode,
        inputSchema: schema_1.z.object({}) })
], SceneViewTools.prototype, "queryGizmoViewMode", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'change_gizmo_coordinate', title: 'Set gizmo coordinate', description: scene_view_docs_1.SCENE_VIEW_DOCS.change_gizmo_coordinate,
        inputSchema: schema_1.z.object({ type: schema_1.z.enum(['local', 'global']).describe('Transform coordinate system for the scene view gizmo.') }) })
], SceneViewTools.prototype, "changeGizmoCoordinate", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'query_gizmo_coordinate', title: 'Read gizmo coordinate', description: scene_view_docs_1.SCENE_VIEW_DOCS.query_gizmo_coordinate,
        inputSchema: schema_1.z.object({}) })
], SceneViewTools.prototype, "queryGizmoCoordinate", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'change_view_mode_2d_3d', title: 'Set scene view mode', description: scene_view_docs_1.SCENE_VIEW_DOCS.change_view_mode_2d_3d,
        inputSchema: schema_1.z.object({ is2D: schema_1.z.boolean().describe('true switches scene view to 2D mode; false switches to 3D mode.') }) })
], SceneViewTools.prototype, "changeViewMode2D3D", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'query_view_mode_2d_3d', title: 'Read scene view mode', description: scene_view_docs_1.SCENE_VIEW_DOCS.query_view_mode_2d_3d,
        inputSchema: schema_1.z.object({}) })
], SceneViewTools.prototype, "queryViewMode2D3D", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'set_grid_visible', title: 'Set grid visibility', description: scene_view_docs_1.SCENE_VIEW_DOCS.set_grid_visible,
        inputSchema: schema_1.z.object({ visible: schema_1.z.boolean().describe('Whether the scene view grid should be visible.') }) })
], SceneViewTools.prototype, "setGridVisible", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'query_grid_visible', title: 'Read grid visibility', description: scene_view_docs_1.SCENE_VIEW_DOCS.query_grid_visible,
        inputSchema: schema_1.z.object({}) })
], SceneViewTools.prototype, "queryGridVisible", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'set_icon_gizmo_3d', title: 'Set icon gizmo mode', description: scene_view_docs_1.SCENE_VIEW_DOCS.set_icon_gizmo_3d,
        inputSchema: schema_1.z.object({ is3D: schema_1.z.boolean().describe('true sets IconGizmo to 3D mode; false sets 2D mode.') }) })
], SceneViewTools.prototype, "setIconGizmo3D", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'query_icon_gizmo_3d', title: 'Read icon gizmo mode', description: scene_view_docs_1.SCENE_VIEW_DOCS.query_icon_gizmo_3d,
        inputSchema: schema_1.z.object({}) })
], SceneViewTools.prototype, "queryIconGizmo3D", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'set_icon_gizmo_size', title: 'Set icon gizmo size', description: scene_view_docs_1.SCENE_VIEW_DOCS.set_icon_gizmo_size,
        inputSchema: schema_1.z.object({ size: schema_1.z.number().min(10).max(100).describe('IconGizmo size from 10 to 100.') }) })
], SceneViewTools.prototype, "setIconGizmoSize", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'query_icon_gizmo_size', title: 'Read icon gizmo size', description: scene_view_docs_1.SCENE_VIEW_DOCS.query_icon_gizmo_size,
        inputSchema: schema_1.z.object({}) })
], SceneViewTools.prototype, "queryIconGizmoSize", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'focus_camera_on_nodes', title: 'Focus camera on nodes', description: scene_view_docs_1.SCENE_VIEW_DOCS.focus_camera_on_nodes,
        inputSchema: schema_1.z.object({ uuids: schema_1.z.array(schema_1.z.string()).nullable().describe('Node UUIDs to focus the scene camera on. null focuses all nodes.') }) })
], SceneViewTools.prototype, "focusCameraOnNodes", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'align_camera_with_view', title: 'Align camera with view', description: scene_view_docs_1.SCENE_VIEW_DOCS.align_camera_with_view,
        inputSchema: schema_1.z.object({}) })
], SceneViewTools.prototype, "alignCameraWithView", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'align_view_with_node', title: 'Align view with node', description: scene_view_docs_1.SCENE_VIEW_DOCS.align_view_with_node,
        inputSchema: schema_1.z.object({}) })
], SceneViewTools.prototype, "alignViewWithNode", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'get_scene_view_status', title: 'Read scene view status', description: scene_view_docs_1.SCENE_VIEW_DOCS.get_scene_view_status,
        inputSchema: schema_1.z.object({}) })
], SceneViewTools.prototype, "getSceneViewStatus", null);
__decorate([
    (0, decorators_1.mcpTool)({ name: 'reset_scene_view', title: 'Reset scene view', description: scene_view_docs_1.SCENE_VIEW_DOCS.reset_scene_view,
        inputSchema: schema_1.z.object({}) })
], SceneViewTools.prototype, "resetSceneView", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NlbmUtdmlldy10b29scy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NvdXJjZS90b29scy9zY2VuZS12aWV3LXRvb2xzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7OztBQUFBLDhDQUEyQztBQUUzQywwQ0FBa0M7QUFDbEMsa0RBQXVFO0FBQ3ZFLDZEQUEwRDtBQUUxRCxNQUFhLGNBQWM7SUFHdkI7UUFDSSxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUEsc0NBQXlCLEVBQUMsSUFBSSxDQUFDLENBQUM7SUFDaEQsQ0FBQztJQUVELFFBQVEsS0FBdUIsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUM3RCxPQUFPLENBQUMsUUFBZ0IsRUFBRSxJQUFTLElBQTJCLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUluRyxBQUFOLEtBQUssQ0FBQyxlQUFlLENBQUMsSUFBK0I7UUFDakQsTUFBTSxJQUFJLEdBQUcsT0FBTyxJQUFJLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUM7UUFDekQsT0FBTyxJQUFJLE9BQU8sQ0FBQyxDQUFDLE9BQU8sRUFBRSxFQUFFO1lBQzNCLE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFO2dCQUNqRSxPQUFPLENBQUMsSUFBQSxhQUFFLEVBQUMsU0FBUyxFQUFFLDBCQUEwQixJQUFJLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFDOUQsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBVSxFQUFFLEVBQUU7Z0JBQ3BCLE9BQU8sQ0FBQyxJQUFBLGVBQUksRUFBQyxHQUFHLENBQUMsT0FB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SyxFQUFFLHdCQUF3QixFQUFFLFdBQVcsRUFBRSxpQ0FBZSxDQUFDLHNCQUFzQjtRQUMzSCxXQUFXLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDO3lEQVMvQjtBQUlLO0lBRkwsSUFBQSxvQkFBTyxFQUFDLEVBQUUsSUFBSSxFQUFFLHNCQUFzQixFQUFFLEtBQUssRUFBRSxzQkFBc0IsRUFBRSxXQUFXLEVBQUUsaUNBQWUsQ0FBQyxvQkFBb0I7UUFDckgsV0FBVyxFQUFFLFVBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQzt1REFTL0I7QUFJSztJQUZMLElBQUEsb0JBQU8sRUFBQyxFQUFFLElBQUksRUFBRSx1QkFBdUIsRUFBRSxLQUFLLEVBQUUsd0JBQXdCLEVBQUUsV0FBVyxFQUFFLGlDQUFlLENBQUMscUJBQXFCO1FBQ3pILFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUM7d0RBeUQvQjtBQUlLO0lBRkwsSUFBQSxvQkFBTyxFQUFDLEVBQUUsSUFBSSxFQUFFLGtCQUFrQixFQUFFLEtBQUssRUFBRSxrQkFBa0IsRUFBRSxXQUFXLEVBQUUsaUNBQWUsQ0FBQyxnQkFBZ0I7UUFDekcsV0FBVyxFQUFFLFVBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQztvREF1Qi9CIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgb2ssIGZhaWwgfSBmcm9tICcuLi9saWIvcmVzcG9uc2UnO1xuaW1wb3J0IHsgVG9vbERlZmluaXRpb24sIFRvb2xSZXNwb25zZSwgVG9vbEV4ZWN1dG9yIH0gZnJvbSAnLi4vdHlwZXMnO1xuaW1wb3J0IHsgeiB9IGZyb20gJy4uL2xpYi9zY2hlbWEnO1xuaW1wb3J0IHsgbWNwVG9vbCwgZGVmaW5lVG9vbHNGcm9tRGVjb3JhdG9ycyB9IGZyb20gJy4uL2xpYi9kZWNvcmF0b3JzJztcbmltcG9ydCB7IFNDRU5FX1ZJRVdfRE9DUyB9IGZyb20gJy4uL2RhdGEvc2NlbmUtdmlldy1kb2NzJztcblxuZXhwb3J0IGNsYXNzIFNjZW5lVmlld1Rvb2xzIGltcGxlbWVudHMgVG9vbEV4ZWN1dG9yIHtcbiAgICBwcml2YXRlIHJlYWRvbmx5IGV4ZWM6IFRvb2xFeGVjdXRvcjtcblxuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICB0aGlzLmV4ZWMgPSBkZWZpbmVUb29sc0Zyb21EZWNvcmF0b3JzKHRoaXMpO1xuICAgIH1cblxuICAgIGdldFRvb2xzKCk6IFRvb2xEZWZpbml0aW9uW10geyByZXR1cm4gdGhpcy5leGVjLmdldFRvb2xzKCk7IH1cbiAgICBleGVjdXRlKHRvb2xOYW1lOiBzdHJpbmcsIGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7IHJldHVybiB0aGlzLmV4ZWMuZXhlY3V0ZSh0b29sTmFtZSwgYXJncyk7IH1cblxuICAgIEBtY3BUb29sKHsgbmFtZTogJ2NoYW5nZV9naXptb190b29sJywgdGl0bGU6ICdTZXQgZ2l6bW8gdG9vbCcsIGRlc2NyaXB0aW9uOiBTQ0VORV9WSUVXX0RPQ1MuY2hhbmdlX2dpem1vX3Rvb2wsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7IG5hbWU6IHouZW51bShbJ3Bvc2l0aW9uJywgJ3JvdGF0aW9uJywgJ3NjYWxlJywgJ3JlY3QnXSkuZGVzY3JpYmUoJ1NjZW5lIHZpZXcgZ2l6bW8gdG9vbCB0byBhY3RpdmF0ZS4nKSB9KSB9KVxuICAgIGFzeW5jIGNoYW5nZUdpem1vVG9vbChhcmdzOiB7IG5hbWU6IHN0cmluZyB9IHwgc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgbmFtZSA9IHR5cGVvZiBhcmdzID09PSAnc3RyaW5nJyA/IGFyZ3MgOiBhcmdzLm5hbWU7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnY2hhbmdlLWdpem1vLXRvb2wnLCBuYW1lKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHVuZGVmaW5lZCwgYEdpem1vIHRvb2wgY2hhbmdlZCB0byAnJHtuYW1lfSdgKSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHsgbmFtZTogJ3F1ZXJ5X2dpem1vX3Rvb2xfbmFtZScsIHRpdGxlOiAnUmVhZCBnaXptbyB0b29sJywgZGVzY3JpcHRpb246IFNDRU5FX1ZJRVdfRE9DUy5xdWVyeV9naXptb190b29sX25hbWUsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSkgfSlcbiAgICBhc3luYyBxdWVyeUdpem1vVG9vbE5hbWUoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1naXptby10b29sLW5hbWUnKS50aGVuKCh0b29sTmFtZTogc3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICBjdXJyZW50VG9vbDogdG9vbE5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgQ3VycmVudCBHaXptbyB0b29sOiAke3Rvb2xOYW1lfWBcbiAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdjaGFuZ2VfZ2l6bW9fcGl2b3QnLCB0aXRsZTogJ1NldCBnaXptbyBwaXZvdCcsIGRlc2NyaXB0aW9uOiBTQ0VORV9WSUVXX0RPQ1MuY2hhbmdlX2dpem1vX3Bpdm90LFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3QoeyBuYW1lOiB6LmVudW0oWydwaXZvdCcsICdjZW50ZXInXSkuZGVzY3JpYmUoJ1RyYW5zZm9ybSBwaXZvdCBtb2RlOiBwaXZvdCBvciBjZW50ZXIuJykgfSkgfSlcbiAgICBhc3luYyBjaGFuZ2VHaXptb1Bpdm90KGFyZ3M6IHsgbmFtZTogc3RyaW5nIH0gfCBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBuYW1lID0gdHlwZW9mIGFyZ3MgPT09ICdzdHJpbmcnID8gYXJncyA6IGFyZ3MubmFtZTtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdjaGFuZ2UtZ2l6bW8tcGl2b3QnLCBuYW1lKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHVuZGVmaW5lZCwgYEdpem1vIHBpdm90IGNoYW5nZWQgdG8gJyR7bmFtZX0nYCkpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdxdWVyeV9naXptb19waXZvdCcsIHRpdGxlOiAnUmVhZCBnaXptbyBwaXZvdCcsIGRlc2NyaXB0aW9uOiBTQ0VORV9WSUVXX0RPQ1MucXVlcnlfZ2l6bW9fcGl2b3QsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSkgfSlcbiAgICBhc3luYyBxdWVyeUdpem1vUGl2b3QoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1naXptby1waXZvdCcpLnRoZW4oKHBpdm90TmFtZTogc3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICBjdXJyZW50UGl2b3Q6IHBpdm90TmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBDdXJyZW50IEdpem1vIHBpdm90OiAke3Bpdm90TmFtZX1gXG4gICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woeyBuYW1lOiAncXVlcnlfZ2l6bW9fdmlld19tb2RlJywgdGl0bGU6ICdSZWFkIGdpem1vIHZpZXcgbW9kZScsIGRlc2NyaXB0aW9uOiBTQ0VORV9WSUVXX0RPQ1MucXVlcnlfZ2l6bW9fdmlld19tb2RlLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pIH0pXG4gICAgYXN5bmMgcXVlcnlHaXptb1ZpZXdNb2RlKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktZ2l6bW8tdmlldy1tb2RlJykudGhlbigodmlld01vZGU6IHN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgdmlld01vZGU6IHZpZXdNb2RlLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYEN1cnJlbnQgdmlldyBtb2RlOiAke3ZpZXdNb2RlfWBcbiAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdjaGFuZ2VfZ2l6bW9fY29vcmRpbmF0ZScsIHRpdGxlOiAnU2V0IGdpem1vIGNvb3JkaW5hdGUnLCBkZXNjcmlwdGlvbjogU0NFTkVfVklFV19ET0NTLmNoYW5nZV9naXptb19jb29yZGluYXRlLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3QoeyB0eXBlOiB6LmVudW0oWydsb2NhbCcsICdnbG9iYWwnXSkuZGVzY3JpYmUoJ1RyYW5zZm9ybSBjb29yZGluYXRlIHN5c3RlbSBmb3IgdGhlIHNjZW5lIHZpZXcgZ2l6bW8uJykgfSkgfSlcbiAgICBhc3luYyBjaGFuZ2VHaXptb0Nvb3JkaW5hdGUoYXJnczogeyB0eXBlOiBzdHJpbmcgfSB8IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHR5cGUgPSB0eXBlb2YgYXJncyA9PT0gJ3N0cmluZycgPyBhcmdzIDogYXJncy50eXBlO1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ2NoYW5nZS1naXptby1jb29yZGluYXRlJywgdHlwZSkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh1bmRlZmluZWQsIGBDb29yZGluYXRlIHN5c3RlbSBjaGFuZ2VkIHRvICcke3R5cGV9J2ApKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woeyBuYW1lOiAncXVlcnlfZ2l6bW9fY29vcmRpbmF0ZScsIHRpdGxlOiAnUmVhZCBnaXptbyBjb29yZGluYXRlJywgZGVzY3JpcHRpb246IFNDRU5FX1ZJRVdfRE9DUy5xdWVyeV9naXptb19jb29yZGluYXRlLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pIH0pXG4gICAgYXN5bmMgcXVlcnlHaXptb0Nvb3JkaW5hdGUoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1naXptby1jb29yZGluYXRlJykudGhlbigoY29vcmRpbmF0ZTogc3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb29yZGluYXRlOiBjb29yZGluYXRlLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYEN1cnJlbnQgY29vcmRpbmF0ZSBzeXN0ZW06ICR7Y29vcmRpbmF0ZX1gXG4gICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woeyBuYW1lOiAnY2hhbmdlX3ZpZXdfbW9kZV8yZF8zZCcsIHRpdGxlOiAnU2V0IHNjZW5lIHZpZXcgbW9kZScsIGRlc2NyaXB0aW9uOiBTQ0VORV9WSUVXX0RPQ1MuY2hhbmdlX3ZpZXdfbW9kZV8yZF8zZCxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHsgaXMyRDogei5ib29sZWFuKCkuZGVzY3JpYmUoJ3RydWUgc3dpdGNoZXMgc2NlbmUgdmlldyB0byAyRCBtb2RlOyBmYWxzZSBzd2l0Y2hlcyB0byAzRCBtb2RlLicpIH0pIH0pXG4gICAgYXN5bmMgY2hhbmdlVmlld01vZGUyRDNEKGFyZ3M6IHsgaXMyRDogYm9vbGVhbiB9IHwgYm9vbGVhbik6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IGlzMkQgPSB0eXBlb2YgYXJncyA9PT0gJ2Jvb2xlYW4nID8gYXJncyA6IGFyZ3MuaXMyRDtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdjaGFuZ2UtaXMyRCcsIGlzMkQpLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2sodW5kZWZpbmVkLCBgVmlldyBtb2RlIGNoYW5nZWQgdG8gJHtpczJEID8gJzJEJyA6ICczRCd9YCkpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdxdWVyeV92aWV3X21vZGVfMmRfM2QnLCB0aXRsZTogJ1JlYWQgc2NlbmUgdmlldyBtb2RlJywgZGVzY3JpcHRpb246IFNDRU5FX1ZJRVdfRE9DUy5xdWVyeV92aWV3X21vZGVfMmRfM2QsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSkgfSlcbiAgICBhc3luYyBxdWVyeVZpZXdNb2RlMkQzRCgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LWlzMkQnKS50aGVuKChpczJEOiBib29sZWFuKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICBpczJEOiBpczJELFxuICAgICAgICAgICAgICAgICAgICAgICAgdmlld01vZGU6IGlzMkQgPyAnMkQnIDogJzNEJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBDdXJyZW50IHZpZXcgbW9kZTogJHtpczJEID8gJzJEJyA6ICczRCd9YFxuICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHsgbmFtZTogJ3NldF9ncmlkX3Zpc2libGUnLCB0aXRsZTogJ1NldCBncmlkIHZpc2liaWxpdHknLCBkZXNjcmlwdGlvbjogU0NFTkVfVklFV19ET0NTLnNldF9ncmlkX3Zpc2libGUsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7IHZpc2libGU6IHouYm9vbGVhbigpLmRlc2NyaWJlKCdXaGV0aGVyIHRoZSBzY2VuZSB2aWV3IGdyaWQgc2hvdWxkIGJlIHZpc2libGUuJykgfSkgfSlcbiAgICBhc3luYyBzZXRHcmlkVmlzaWJsZShhcmdzOiB7IHZpc2libGU6IGJvb2xlYW4gfSB8IGJvb2xlYW4pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCB2aXNpYmxlID0gdHlwZW9mIGFyZ3MgPT09ICdib29sZWFuJyA/IGFyZ3MgOiBhcmdzLnZpc2libGU7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnc2V0LWdyaWQtdmlzaWJsZScsIHZpc2libGUpLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2sodW5kZWZpbmVkLCBgR3JpZCAke3Zpc2libGUgPyAnc2hvd24nIDogJ2hpZGRlbid9YCkpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdxdWVyeV9ncmlkX3Zpc2libGUnLCB0aXRsZTogJ1JlYWQgZ3JpZCB2aXNpYmlsaXR5JywgZGVzY3JpcHRpb246IFNDRU5FX1ZJRVdfRE9DUy5xdWVyeV9ncmlkX3Zpc2libGUsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSkgfSlcbiAgICBhc3luYyBxdWVyeUdyaWRWaXNpYmxlKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktaXMtZ3JpZC12aXNpYmxlJykudGhlbigodmlzaWJsZTogYm9vbGVhbikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgdmlzaWJsZTogdmlzaWJsZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBHcmlkIGlzICR7dmlzaWJsZSA/ICd2aXNpYmxlJyA6ICdoaWRkZW4nfWBcbiAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7IG5hbWU6ICdzZXRfaWNvbl9naXptb18zZCcsIHRpdGxlOiAnU2V0IGljb24gZ2l6bW8gbW9kZScsIGRlc2NyaXB0aW9uOiBTQ0VORV9WSUVXX0RPQ1Muc2V0X2ljb25fZ2l6bW9fM2QsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7IGlzM0Q6IHouYm9vbGVhbigpLmRlc2NyaWJlKCd0cnVlIHNldHMgSWNvbkdpem1vIHRvIDNEIG1vZGU7IGZhbHNlIHNldHMgMkQgbW9kZS4nKSB9KSB9KVxuICAgIGFzeW5jIHNldEljb25HaXptbzNEKGFyZ3M6IHsgaXMzRDogYm9vbGVhbiB9IHwgYm9vbGVhbik6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IGlzM0QgPSB0eXBlb2YgYXJncyA9PT0gJ2Jvb2xlYW4nID8gYXJncyA6IGFyZ3MuaXMzRDtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdzZXQtaWNvbi1naXptby0zZCcsIGlzM0QpLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2sodW5kZWZpbmVkLCBgSWNvbkdpem1vIHNldCB0byAke2lzM0QgPyAnM0QnIDogJzJEJ30gbW9kZWApKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woeyBuYW1lOiAncXVlcnlfaWNvbl9naXptb18zZCcsIHRpdGxlOiAnUmVhZCBpY29uIGdpem1vIG1vZGUnLCBkZXNjcmlwdGlvbjogU0NFTkVfVklFV19ET0NTLnF1ZXJ5X2ljb25fZ2l6bW9fM2QsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSkgfSlcbiAgICBhc3luYyBxdWVyeUljb25HaXptbzNEKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktaXMtaWNvbi1naXptby0zZCcpLnRoZW4oKGlzM0Q6IGJvb2xlYW4pID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlzM0Q6IGlzM0QsXG4gICAgICAgICAgICAgICAgICAgICAgICBtb2RlOiBpczNEID8gJzNEJyA6ICcyRCcsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgSWNvbkdpem1vIGlzIGluICR7aXMzRCA/ICczRCcgOiAnMkQnfSBtb2RlYFxuICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHsgbmFtZTogJ3NldF9pY29uX2dpem1vX3NpemUnLCB0aXRsZTogJ1NldCBpY29uIGdpem1vIHNpemUnLCBkZXNjcmlwdGlvbjogU0NFTkVfVklFV19ET0NTLnNldF9pY29uX2dpem1vX3NpemUsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7IHNpemU6IHoubnVtYmVyKCkubWluKDEwKS5tYXgoMTAwKS5kZXNjcmliZSgnSWNvbkdpem1vIHNpemUgZnJvbSAxMCB0byAxMDAuJykgfSkgfSlcbiAgICBhc3luYyBzZXRJY29uR2l6bW9TaXplKGFyZ3M6IHsgc2l6ZTogbnVtYmVyIH0gfCBudW1iZXIpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBzaXplID0gdHlwZW9mIGFyZ3MgPT09ICdudW1iZXInID8gYXJncyA6IGFyZ3Muc2l6ZTtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdzZXQtaWNvbi1naXptby1zaXplJywgc2l6ZSkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh1bmRlZmluZWQsIGBJY29uR2l6bW8gc2l6ZSBzZXQgdG8gJHtzaXplfWApKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woeyBuYW1lOiAncXVlcnlfaWNvbl9naXptb19zaXplJywgdGl0bGU6ICdSZWFkIGljb24gZ2l6bW8gc2l6ZScsIGRlc2NyaXB0aW9uOiBTQ0VORV9WSUVXX0RPQ1MucXVlcnlfaWNvbl9naXptb19zaXplLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pIH0pXG4gICAgYXN5bmMgcXVlcnlJY29uR2l6bW9TaXplKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktaWNvbi1naXptby1zaXplJykudGhlbigoc2l6ZTogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICBzaXplOiBzaXplLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYEljb25HaXptbyBzaXplOiAke3NpemV9YFxuICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHsgbmFtZTogJ2ZvY3VzX2NhbWVyYV9vbl9ub2RlcycsIHRpdGxlOiAnRm9jdXMgY2FtZXJhIG9uIG5vZGVzJywgZGVzY3JpcHRpb246IFNDRU5FX1ZJRVdfRE9DUy5mb2N1c19jYW1lcmFfb25fbm9kZXMsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7IHV1aWRzOiB6LmFycmF5KHouc3RyaW5nKCkpLm51bGxhYmxlKCkuZGVzY3JpYmUoJ05vZGUgVVVJRHMgdG8gZm9jdXMgdGhlIHNjZW5lIGNhbWVyYSBvbi4gbnVsbCBmb2N1c2VzIGFsbCBub2Rlcy4nKSB9KSB9KVxuICAgIGFzeW5jIGZvY3VzQ2FtZXJhT25Ob2RlcyhhcmdzOiB7IHV1aWRzOiBzdHJpbmdbXSB8IG51bGwgfSB8IHN0cmluZ1tdIHwgbnVsbCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHV1aWRzID0gQXJyYXkuaXNBcnJheShhcmdzKSB8fCBhcmdzID09PSBudWxsID8gYXJncyA6IGFyZ3MudXVpZHM7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnZm9jdXMtY2FtZXJhJywgdXVpZHMgfHwgW10pLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IG1lc3NhZ2UgPSB1dWlkcyA9PT0gbnVsbCA/IFxuICAgICAgICAgICAgICAgICAgICAnQ2FtZXJhIGZvY3VzZWQgb24gYWxsIG5vZGVzJyA6IFxuICAgICAgICAgICAgICAgICAgICBgQ2FtZXJhIGZvY3VzZWQgb24gJHt1dWlkcy5sZW5ndGh9IG5vZGUocylgO1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2sodW5kZWZpbmVkLCBtZXNzYWdlKSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHsgbmFtZTogJ2FsaWduX2NhbWVyYV93aXRoX3ZpZXcnLCB0aXRsZTogJ0FsaWduIGNhbWVyYSB3aXRoIHZpZXcnLCBkZXNjcmlwdGlvbjogU0NFTkVfVklFV19ET0NTLmFsaWduX2NhbWVyYV93aXRoX3ZpZXcsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSkgfSlcbiAgICBhc3luYyBhbGlnbkNhbWVyYVdpdGhWaWV3KCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnYWxpZ24td2l0aC12aWV3JykudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh1bmRlZmluZWQsICdTY2VuZSBjYW1lcmEgYWxpZ25lZCB3aXRoIGN1cnJlbnQgdmlldycpKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woeyBuYW1lOiAnYWxpZ25fdmlld193aXRoX25vZGUnLCB0aXRsZTogJ0FsaWduIHZpZXcgd2l0aCBub2RlJywgZGVzY3JpcHRpb246IFNDRU5FX1ZJRVdfRE9DUy5hbGlnbl92aWV3X3dpdGhfbm9kZSxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSB9KVxuICAgIGFzeW5jIGFsaWduVmlld1dpdGhOb2RlKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnYWxpZ24td2l0aC12aWV3LW5vZGUnKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHVuZGVmaW5lZCwgJ1ZpZXcgYWxpZ25lZCB3aXRoIHNlbGVjdGVkIG5vZGUnKSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHsgbmFtZTogJ2dldF9zY2VuZV92aWV3X3N0YXR1cycsIHRpdGxlOiAnUmVhZCBzY2VuZSB2aWV3IHN0YXR1cycsIGRlc2NyaXB0aW9uOiBTQ0VORV9WSUVXX0RPQ1MuZ2V0X3NjZW5lX3ZpZXdfc3RhdHVzLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pIH0pXG4gICAgYXN5bmMgZ2V0U2NlbmVWaWV3U3RhdHVzKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZShhc3luYyAocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAvLyBHYXRoZXIgYWxsIHZpZXcgc3RhdHVzIGluZm9ybWF0aW9uXG4gICAgICAgICAgICAgICAgY29uc3QgW1xuICAgICAgICAgICAgICAgICAgICBnaXptb1Rvb2wsXG4gICAgICAgICAgICAgICAgICAgIGdpem1vUGl2b3QsXG4gICAgICAgICAgICAgICAgICAgIGdpem1vQ29vcmRpbmF0ZSxcbiAgICAgICAgICAgICAgICAgICAgdmlld01vZGUyRDNELFxuICAgICAgICAgICAgICAgICAgICBncmlkVmlzaWJsZSxcbiAgICAgICAgICAgICAgICAgICAgaWNvbkdpem1vM0QsXG4gICAgICAgICAgICAgICAgICAgIGljb25HaXptb1NpemVcbiAgICAgICAgICAgICAgICBdID0gYXdhaXQgUHJvbWlzZS5hbGxTZXR0bGVkKFtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5xdWVyeUdpem1vVG9vbE5hbWUoKSxcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5xdWVyeUdpem1vUGl2b3QoKSxcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5xdWVyeUdpem1vQ29vcmRpbmF0ZSgpLFxuICAgICAgICAgICAgICAgICAgICB0aGlzLnF1ZXJ5Vmlld01vZGUyRDNEKCksXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucXVlcnlHcmlkVmlzaWJsZSgpLFxuICAgICAgICAgICAgICAgICAgICB0aGlzLnF1ZXJ5SWNvbkdpem1vM0QoKSxcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5xdWVyeUljb25HaXptb1NpemUoKVxuICAgICAgICAgICAgICAgIF0pO1xuXG4gICAgICAgICAgICAgICAgY29uc3Qgc3RhdHVzOiBhbnkgPSB7XG4gICAgICAgICAgICAgICAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpXG4gICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgIC8vIEV4dHJhY3QgZGF0YSBmcm9tIGZ1bGZpbGxlZCBwcm9taXNlc1xuICAgICAgICAgICAgICAgIGlmIChnaXptb1Rvb2wuc3RhdHVzID09PSAnZnVsZmlsbGVkJyAmJiBnaXptb1Rvb2wudmFsdWUuc3VjY2Vzcykge1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXMuZ2l6bW9Ub29sID0gZ2l6bW9Ub29sLnZhbHVlLmRhdGEuY3VycmVudFRvb2w7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChnaXptb1Bpdm90LnN0YXR1cyA9PT0gJ2Z1bGZpbGxlZCcgJiYgZ2l6bW9QaXZvdC52YWx1ZS5zdWNjZXNzKSB7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5naXptb1Bpdm90ID0gZ2l6bW9QaXZvdC52YWx1ZS5kYXRhLmN1cnJlbnRQaXZvdDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKGdpem1vQ29vcmRpbmF0ZS5zdGF0dXMgPT09ICdmdWxmaWxsZWQnICYmIGdpem1vQ29vcmRpbmF0ZS52YWx1ZS5zdWNjZXNzKSB7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5jb29yZGluYXRlID0gZ2l6bW9Db29yZGluYXRlLnZhbHVlLmRhdGEuY29vcmRpbmF0ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKHZpZXdNb2RlMkQzRC5zdGF0dXMgPT09ICdmdWxmaWxsZWQnICYmIHZpZXdNb2RlMkQzRC52YWx1ZS5zdWNjZXNzKSB7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5pczJEID0gdmlld01vZGUyRDNELnZhbHVlLmRhdGEuaXMyRDtcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzLnZpZXdNb2RlID0gdmlld01vZGUyRDNELnZhbHVlLmRhdGEudmlld01vZGU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChncmlkVmlzaWJsZS5zdGF0dXMgPT09ICdmdWxmaWxsZWQnICYmIGdyaWRWaXNpYmxlLnZhbHVlLnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzLmdyaWRWaXNpYmxlID0gZ3JpZFZpc2libGUudmFsdWUuZGF0YS52aXNpYmxlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoaWNvbkdpem1vM0Quc3RhdHVzID09PSAnZnVsZmlsbGVkJyAmJiBpY29uR2l6bW8zRC52YWx1ZS5zdWNjZXNzKSB7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5pY29uR2l6bW8zRCA9IGljb25HaXptbzNELnZhbHVlLmRhdGEuaXMzRDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKGljb25HaXptb1NpemUuc3RhdHVzID09PSAnZnVsZmlsbGVkJyAmJiBpY29uR2l6bW9TaXplLnZhbHVlLnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzLmljb25HaXptb1NpemUgPSBpY29uR2l6bW9TaXplLnZhbHVlLmRhdGEuc2l6ZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHN0YXR1cykpO1xuXG4gICAgICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChgRmFpbGVkIHRvIGdldCBzY2VuZSB2aWV3IHN0YXR1czogJHtlcnIubWVzc2FnZX1gKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHsgbmFtZTogJ3Jlc2V0X3NjZW5lX3ZpZXcnLCB0aXRsZTogJ1Jlc2V0IHNjZW5lIHZpZXcnLCBkZXNjcmlwdGlvbjogU0NFTkVfVklFV19ET0NTLnJlc2V0X3NjZW5lX3ZpZXcsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSkgfSlcbiAgICBhc3luYyByZXNldFNjZW5lVmlldygpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoYXN5bmMgKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgLy8gUmVzZXQgc2NlbmUgdmlldyB0byBkZWZhdWx0IHNldHRpbmdzXG4gICAgICAgICAgICAgICAgY29uc3QgcmVzZXRBY3Rpb25zID0gW1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmNoYW5nZUdpem1vVG9vbCgncG9zaXRpb24nKSxcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jaGFuZ2VHaXptb1Bpdm90KCdwaXZvdCcpLFxuICAgICAgICAgICAgICAgICAgICB0aGlzLmNoYW5nZUdpem1vQ29vcmRpbmF0ZSgnbG9jYWwnKSxcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jaGFuZ2VWaWV3TW9kZTJEM0QoZmFsc2UpLCAvLyAzRCBtb2RlXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0R3JpZFZpc2libGUodHJ1ZSksXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0SWNvbkdpem1vM0QodHJ1ZSksXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0SWNvbkdpem1vU2l6ZSg2MClcbiAgICAgICAgICAgICAgICBdO1xuXG4gICAgICAgICAgICAgICAgYXdhaXQgUHJvbWlzZS5hbGwocmVzZXRBY3Rpb25zKTtcblxuICAgICAgICAgICAgICAgIHJlc29sdmUob2sodW5kZWZpbmVkLCAnU2NlbmUgdmlldyByZXNldCB0byBkZWZhdWx0IHNldHRpbmdzJykpO1xuXG4gICAgICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChgRmFpbGVkIHRvIHJlc2V0IHNjZW5lIHZpZXc6ICR7ZXJyLm1lc3NhZ2V9YCkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG59XG4iXX0=