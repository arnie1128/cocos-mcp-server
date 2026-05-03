/**
 * Tool descriptions for asset-advanced-tools. Externalized in v2.11.
 */
export const ASSET_ADVANCED_DOCS = {
    save_asset_meta: '[specialist] Write serialized meta content for an asset URL/UUID; mutates asset metadata.',
    generate_available_url: '[specialist] Return a collision-free asset URL derived from the requested URL.',
    query_asset_db_ready: '[specialist] Check whether asset-db reports ready before batch operations.',
    open_asset_external: '[specialist] Open an asset through the editor/OS external handler; does not edit content.',
    batch_import_assets: '[specialist] Import files from a disk directory into asset-db; mutates project assets.',
    batch_delete_assets: '[specialist] Delete multiple asset-db URLs; mutates project assets.',
    validate_asset_references: '[specialist] Lightly scan assets under a directory for broken asset-info references.',
    get_tree: '[primary] Return a recursive asset tree under a directory with UUID/type metadata for browsing project assets.',
    get_asset_dependencies: '[specialist] Unsupported dependency-analysis placeholder; always reports unsupported.',
    get_unused_assets: '[specialist] Scan scenes and prefabs for asset dependencies, then report assets under a directory that are not referenced by those scene/prefab roots.',
    compress_textures: '[specialist] Unsupported texture-compression placeholder; always reports unsupported.',
    export_asset_manifest: '[specialist] Return asset inventory for a directory as json/csv/xml text; does not write a file.',
    get_users: '[specialist] Find scenes/prefabs/scripts that reference an asset by UUID.',
} as const;
