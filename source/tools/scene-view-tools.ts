import { ok, fail } from '../lib/response';
import { ToolDefinition, ToolResponse, ToolExecutor } from '../types';
import { z } from '../lib/schema';
import { defineTools, ToolDef } from '../lib/define-tools';

export class SceneViewTools implements ToolExecutor {
    private readonly exec: ToolExecutor;

    constructor() {
        const defs: ToolDef[] = [
            { name: 'change_gizmo_tool', title: 'Set gizmo tool', description: '[specialist] Change active scene view gizmo tool; UI side effect only.',
                inputSchema: z.object({ name: z.enum(['position', 'rotation', 'scale', 'rect']).describe('Scene view gizmo tool to activate.') }),
                handler: a => this.changeGizmoTool(a.name) },
            { name: 'query_gizmo_tool_name', title: 'Read gizmo tool', description: '[specialist] Read active scene view gizmo tool.',
                inputSchema: z.object({}), handler: () => this.queryGizmoToolName() },
            { name: 'change_gizmo_pivot', title: 'Set gizmo pivot', description: '[specialist] Change scene view transform pivot mode; UI side effect only.',
                inputSchema: z.object({ name: z.enum(['pivot', 'center']).describe('Transform pivot mode: pivot or center.') }),
                handler: a => this.changeGizmoPivot(a.name) },
            { name: 'query_gizmo_pivot', title: 'Read gizmo pivot', description: '[specialist] Read current scene view pivot mode.',
                inputSchema: z.object({}), handler: () => this.queryGizmoPivot() },
            { name: 'query_gizmo_view_mode', title: 'Read gizmo view mode', description: '[specialist] Read current scene view/select mode.',
                inputSchema: z.object({}), handler: () => this.queryGizmoViewMode() },
            { name: 'change_gizmo_coordinate', title: 'Set gizmo coordinate', description: '[specialist] Change scene view coordinate system to local/global; UI side effect only.',
                inputSchema: z.object({ type: z.enum(['local', 'global']).describe('Transform coordinate system for the scene view gizmo.') }),
                handler: a => this.changeGizmoCoordinate(a.type) },
            { name: 'query_gizmo_coordinate', title: 'Read gizmo coordinate', description: '[specialist] Read current scene view coordinate system.',
                inputSchema: z.object({}), handler: () => this.queryGizmoCoordinate() },
            { name: 'change_view_mode_2d_3d', title: 'Set scene view mode', description: '[specialist] Switch scene view between 2D and 3D; UI side effect only.',
                inputSchema: z.object({ is2D: z.boolean().describe('true switches scene view to 2D mode; false switches to 3D mode.') }),
                handler: a => this.changeViewMode2D3D(a.is2D) },
            { name: 'query_view_mode_2d_3d', title: 'Read scene view mode', description: '[specialist] Read whether scene view is in 2D or 3D mode.',
                inputSchema: z.object({}), handler: () => this.queryViewMode2D3D() },
            { name: 'set_grid_visible', title: 'Set grid visibility', description: '[specialist] Show or hide scene view grid; UI side effect only.',
                inputSchema: z.object({ visible: z.boolean().describe('Whether the scene view grid should be visible.') }),
                handler: a => this.setGridVisible(a.visible) },
            { name: 'query_grid_visible', title: 'Read grid visibility', description: '[specialist] Read scene view grid visibility.',
                inputSchema: z.object({}), handler: () => this.queryGridVisible() },
            { name: 'set_icon_gizmo_3d', title: 'Set icon gizmo mode', description: '[specialist] Switch IconGizmo between 3D and 2D mode; UI side effect only.',
                inputSchema: z.object({ is3D: z.boolean().describe('true sets IconGizmo to 3D mode; false sets 2D mode.') }),
                handler: a => this.setIconGizmo3D(a.is3D) },
            { name: 'query_icon_gizmo_3d', title: 'Read icon gizmo mode', description: '[specialist] Read current IconGizmo 3D/2D mode.',
                inputSchema: z.object({}), handler: () => this.queryIconGizmo3D() },
            { name: 'set_icon_gizmo_size', title: 'Set icon gizmo size', description: '[specialist] Set IconGizmo display size; UI side effect only.',
                inputSchema: z.object({ size: z.number().min(10).max(100).describe('IconGizmo size from 10 to 100.') }),
                handler: a => this.setIconGizmoSize(a.size) },
            { name: 'query_icon_gizmo_size', title: 'Read icon gizmo size', description: '[specialist] Read current IconGizmo display size.',
                inputSchema: z.object({}), handler: () => this.queryIconGizmoSize() },
            { name: 'focus_camera_on_nodes', title: 'Focus camera on nodes', description: '[specialist] Focus scene view camera on nodes or all nodes; camera UI side effect only.',
                inputSchema: z.object({ uuids: z.array(z.string()).nullable().describe('Node UUIDs to focus the scene camera on. null focuses all nodes.') }),
                handler: a => this.focusCameraOnNodes(a.uuids) },
            { name: 'align_camera_with_view', title: 'Align camera with view', description: '[specialist] Apply scene view camera transform to selected camera/node; may mutate selection.',
                inputSchema: z.object({}), handler: () => this.alignCameraWithView() },
            { name: 'align_view_with_node', title: 'Align view with node', description: '[specialist] Align scene view to selected node; camera UI side effect only.',
                inputSchema: z.object({}), handler: () => this.alignViewWithNode() },
            { name: 'get_scene_view_status', title: 'Read scene view status', description: '[specialist] Read combined scene view status snapshot.',
                inputSchema: z.object({}), handler: () => this.getSceneViewStatus() },
            { name: 'reset_scene_view', title: 'Reset scene view', description: '[specialist] Reset scene view UI settings to defaults; UI side effects only.',
                inputSchema: z.object({}), handler: () => this.resetSceneView() },
        ];
        this.exec = defineTools(defs);
    }

    getTools(): ToolDefinition[] { return this.exec.getTools(); }
    execute(toolName: string, args: any): Promise<ToolResponse> { return this.exec.execute(toolName, args); }

    private async changeGizmoTool(name: string): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'change-gizmo-tool', name).then(() => {
                resolve(ok(undefined, `Gizmo tool changed to '${name}'`));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async queryGizmoToolName(): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'query-gizmo-tool-name').then((toolName: string) => {
                resolve(ok({
                        currentTool: toolName,
                        message: `Current Gizmo tool: ${toolName}`
                    }));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async changeGizmoPivot(name: string): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'change-gizmo-pivot', name).then(() => {
                resolve(ok(undefined, `Gizmo pivot changed to '${name}'`));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async queryGizmoPivot(): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'query-gizmo-pivot').then((pivotName: string) => {
                resolve(ok({
                        currentPivot: pivotName,
                        message: `Current Gizmo pivot: ${pivotName}`
                    }));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async queryGizmoViewMode(): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'query-gizmo-view-mode').then((viewMode: string) => {
                resolve(ok({
                        viewMode: viewMode,
                        message: `Current view mode: ${viewMode}`
                    }));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async changeGizmoCoordinate(type: string): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'change-gizmo-coordinate', type).then(() => {
                resolve(ok(undefined, `Coordinate system changed to '${type}'`));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async queryGizmoCoordinate(): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'query-gizmo-coordinate').then((coordinate: string) => {
                resolve(ok({
                        coordinate: coordinate,
                        message: `Current coordinate system: ${coordinate}`
                    }));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async changeViewMode2D3D(is2D: boolean): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'change-is2D', is2D).then(() => {
                resolve(ok(undefined, `View mode changed to ${is2D ? '2D' : '3D'}`));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async queryViewMode2D3D(): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'query-is2D').then((is2D: boolean) => {
                resolve(ok({
                        is2D: is2D,
                        viewMode: is2D ? '2D' : '3D',
                        message: `Current view mode: ${is2D ? '2D' : '3D'}`
                    }));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async setGridVisible(visible: boolean): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'set-grid-visible', visible).then(() => {
                resolve(ok(undefined, `Grid ${visible ? 'shown' : 'hidden'}`));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async queryGridVisible(): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'query-is-grid-visible').then((visible: boolean) => {
                resolve(ok({
                        visible: visible,
                        message: `Grid is ${visible ? 'visible' : 'hidden'}`
                    }));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async setIconGizmo3D(is3D: boolean): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'set-icon-gizmo-3d', is3D).then(() => {
                resolve(ok(undefined, `IconGizmo set to ${is3D ? '3D' : '2D'} mode`));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async queryIconGizmo3D(): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'query-is-icon-gizmo-3d').then((is3D: boolean) => {
                resolve(ok({
                        is3D: is3D,
                        mode: is3D ? '3D' : '2D',
                        message: `IconGizmo is in ${is3D ? '3D' : '2D'} mode`
                    }));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async setIconGizmoSize(size: number): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'set-icon-gizmo-size', size).then(() => {
                resolve(ok(undefined, `IconGizmo size set to ${size}`));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async queryIconGizmoSize(): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'query-icon-gizmo-size').then((size: number) => {
                resolve(ok({
                        size: size,
                        message: `IconGizmo size: ${size}`
                    }));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async focusCameraOnNodes(uuids: string[] | null): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'focus-camera', uuids || []).then(() => {
                const message = uuids === null ? 
                    'Camera focused on all nodes' : 
                    `Camera focused on ${uuids.length} node(s)`;
                resolve(ok(undefined, message));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async alignCameraWithView(): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'align-with-view').then(() => {
                resolve(ok(undefined, 'Scene camera aligned with current view'));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async alignViewWithNode(): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('scene', 'align-with-view-node').then(() => {
                resolve(ok(undefined, 'View aligned with selected node'));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async getSceneViewStatus(): Promise<ToolResponse> {
        return new Promise(async (resolve) => {
            try {
                // Gather all view status information
                const [
                    gizmoTool,
                    gizmoPivot,
                    gizmoCoordinate,
                    viewMode2D3D,
                    gridVisible,
                    iconGizmo3D,
                    iconGizmoSize
                ] = await Promise.allSettled([
                    this.queryGizmoToolName(),
                    this.queryGizmoPivot(),
                    this.queryGizmoCoordinate(),
                    this.queryViewMode2D3D(),
                    this.queryGridVisible(),
                    this.queryIconGizmo3D(),
                    this.queryIconGizmoSize()
                ]);

                const status: any = {
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

                resolve(ok(status));

            } catch (err: any) {
                resolve(fail(`Failed to get scene view status: ${err.message}`));
            }
        });
    }

    private async resetSceneView(): Promise<ToolResponse> {
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

                resolve(ok(undefined, 'Scene view reset to default settings'));

            } catch (err: any) {
                resolve(fail(`Failed to reset scene view: ${err.message}`));
            }
        });
    }
}
