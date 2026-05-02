/**
 * Tool descriptions for project-tools. Externalized in v2.11 from inline
 * strings to keep project-tools.ts focused on routing/handler logic.
 */
export const PROJECT_DOCS = {
    run_project: '[specialist] Open Build panel as preview fallback; does not launch preview automatically.',
    build_project: '[specialist] Open Build panel for the requested platform; does not start the build.',
    get_project_info: '[specialist] Read project name/path/uuid/version/Cocos version and config. Also exposed as resource cocos://project/info; prefer the resource when the client supports MCP resources.',
    get_project_settings: '[specialist] Read one project settings category via project/query-config.',
    refresh_assets: '[specialist] Refresh asset-db for a folder; affects Editor asset state, not file content.',
    import_asset: '[specialist] Import one disk file into asset-db; mutates project assets.',
    get_asset_info: '[specialist] Read basic metadata for one db:// asset path.',
    get_assets: '[specialist] List assets under a folder using type-specific filename patterns. Also exposed as resource cocos://assets (defaults type=all, folder=db://assets) and cocos://assets{?type,folder} template.',
    get_build_settings: '[specialist] Report builder readiness and MCP build limitations.',
    open_build_panel: '[specialist] Open the Cocos Build panel; does not start a build.',
    check_builder_status: '[specialist] Check whether the builder worker is ready.',
    start_preview_server: '[specialist] Unsupported preview-server placeholder; use Editor UI.',
    stop_preview_server: '[specialist] Unsupported preview-server placeholder; use Editor UI.',
    create_asset: '[specialist] Create an asset file or folder through asset-db; null content creates folder.',
    copy_asset: '[specialist] Copy an asset through asset-db; mutates project assets.',
    move_asset: '[specialist] Move or rename an asset through asset-db; mutates project assets.',
    delete_asset: '[specialist] Delete one asset-db URL; mutates project assets.',
    save_asset: '[specialist] Write serialized content to an asset URL; use only for known-good formats.',
    reimport_asset: '[specialist] Ask asset-db to reimport an asset; updates imported asset state/cache.',
    query_asset_path: '[specialist] Resolve an asset db:// URL to disk path.',
    query_asset_uuid: '[specialist] Resolve an asset db:// URL to UUID.',
    query_asset_url: '[specialist] Resolve an asset UUID to db:// URL.',
    find_asset_by_name: '[specialist] Search assets by name with exact/type/folder filters; use to discover UUIDs/paths.',
    get_asset_details: '[specialist] Read asset info plus known image sub-assets such as spriteFrame/texture UUIDs.',
} as const;
