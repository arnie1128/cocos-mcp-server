/**
 * Tool descriptions for scene-view-tools. Externalized in v2.11.
 */
export const SCENE_VIEW_DOCS = {
    change_gizmo_tool: '[specialist] Change active scene view gizmo tool; UI side effect only.',
    query_gizmo_tool_name: '[specialist] Read active scene view gizmo tool.',
    change_gizmo_pivot: '[specialist] Change scene view transform pivot mode; UI side effect only.',
    query_gizmo_pivot: '[specialist] Read current scene view pivot mode.',
    query_gizmo_view_mode: '[specialist] Read current scene view/select mode.',
    change_gizmo_coordinate: '[specialist] Change scene view coordinate system to local/global; UI side effect only.',
    query_gizmo_coordinate: '[specialist] Read current scene view coordinate system.',
    change_view_mode_2d_3d: '[specialist] Switch scene view between 2D and 3D; UI side effect only.',
    query_view_mode_2d_3d: '[specialist] Read whether scene view is in 2D or 3D mode.',
    set_grid_visible: '[specialist] Show or hide scene view grid; UI side effect only.',
    query_grid_visible: '[specialist] Read scene view grid visibility.',
    set_icon_gizmo_3d: '[specialist] Switch IconGizmo between 3D and 2D mode; UI side effect only.',
    query_icon_gizmo_3d: '[specialist] Read current IconGizmo 3D/2D mode.',
    set_icon_gizmo_size: '[specialist] Set IconGizmo display size; UI side effect only.',
    query_icon_gizmo_size: '[specialist] Read current IconGizmo display size.',
    focus_camera_on_nodes: '[specialist] Focus scene view camera on nodes or all nodes; camera UI side effect only.',
    align_camera_with_view: '[specialist] Apply scene view camera transform to selected camera/node; may mutate selection.',
    align_view_with_node: '[specialist] Align scene view to selected node; camera UI side effect only.',
    get_scene_view_status: '[specialist] Read combined scene view status snapshot.',
    reset_scene_view: '[specialist] Reset scene view UI settings to defaults; UI side effects only.',
} as const;
