/**
 * Tool descriptions for scene-advanced-tools. Externalized in v2.11.
 */
export const SCENE_ADVANCED_DOCS = {
    reset_node_property: '[specialist] Reset one node property to Cocos default; mutates scene.',
    move_array_element: '[specialist] Move an item in a node array property such as __comps__; mutates scene.',
    remove_array_element: '[specialist] Remove an item from a node array property by index; mutates scene.',
    copy_node: '[specialist] Copy nodes through the Cocos scene clipboard channel.',
    paste_node: '[specialist] Paste copied nodes under a target parent; mutates scene and returns new UUIDs.',
    cut_node: '[specialist] Cut nodes through the Cocos scene channel; clipboard/scene side effects.',
    reset_node_transform: '[specialist] Reset node transform to Cocos defaults; mutates scene.',
    reset_component: '[specialist] Reset a component by component UUID; mutates scene.',
    restore_prefab: '[specialist] Restore a prefab instance through scene/restore-prefab; mutates scene.',
    execute_component_method: '[specialist] Execute an editor-exposed component method; side effects depend on method.',
    execute_scene_script: '[specialist] Execute a scene script method; low-level escape hatch that can mutate scene.',
    scene_snapshot: '[specialist] Create a Cocos scene snapshot for undo/change tracking.',
    scene_snapshot_abort: '[specialist] Abort the current Cocos scene snapshot.',
    begin_undo_recording: '[specialist] Begin undo recording for a node and return undoId.',
    end_undo_recording: '[specialist] Commit a previously started undo recording.',
    cancel_undo_recording: '[specialist] Cancel a previously started undo recording.',
    soft_reload_scene: '[specialist] Soft reload the current scene; Editor state side effect.',
    query_scene_ready: '[specialist] Check whether the scene module reports ready.',
    query_scene_dirty: '[specialist] Check whether the current scene has unsaved changes.',
    query_scene_classes: '[specialist] List registered scene classes, optionally filtered by base class.',
    query_scene_components: '[specialist] List available scene component definitions from Cocos.',
    query_component_has_script: '[specialist] Check whether a component class has an associated script.',
    query_nodes_by_asset_uuid: '[specialist] Find current-scene nodes that reference an asset UUID.',
} as const;
