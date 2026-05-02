/**
 * Tool descriptions for scene-tools. Externalized in v2.11 from inline
 * strings to keep scene-tools.ts focused on routing/handler logic.
 */
export const SCENE_DOCS = {
    get_current_scene: '[specialist] Read the currently open scene root summary (name/uuid/type/active/nodeCount). No scene mutation; use to get the scene root UUID. Also exposed as resource cocos://scene/current; prefer the resource when the client supports MCP resources.',
    get_scene_list: '[specialist] List .scene assets under db://assets with name/path/uuid. Does not open scenes or modify assets. Also exposed as resource cocos://scene/list.',
    open_scene: '[specialist] Open a scene by db:// path. Switches the active Editor scene; save current edits first if needed.',
    save_scene: '[specialist] Save the currently open scene back to its scene asset. Mutates the project file on disk.',
    create_scene: '[specialist] Create a new .scene asset. Mutates asset-db; non-empty templates also open the new scene and populate standard Camera/Canvas or Camera/Light nodes.',
    save_scene_as: '[specialist] Copy the currently open scene to a new .scene asset. Saves current scene first; optionally opens the copy and can overwrite when requested.',
    close_scene: '[specialist] Close the current scene. Editor state side effect; save first if unsaved changes matter.',
    get_scene_hierarchy: '[specialist] Read the complete current scene node hierarchy. No mutation; use for UUID/path lookup, optionally with component summaries. Also exposed as resource cocos://scene/hierarchy (defaults: includeComponents=false); prefer the resource for full-tree reads.',
} as const;
