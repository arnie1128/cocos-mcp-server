import { ok, fail } from '../lib/response';
import type { ToolDefinition, ToolResponse, ToolExecutor, ProjectInfo, AssetInfo } from '../types';
import { z } from '../lib/schema';
import { mcpTool, defineToolsFromDecorators } from '../lib/decorators';
import * as fs from 'fs';
import * as path from 'path';

export class ProjectTools implements ToolExecutor {
    private readonly exec: ToolExecutor;

    constructor() {
        this.exec = defineToolsFromDecorators(this);
    }

    getTools(): ToolDefinition[] { return this.exec.getTools(); }
    execute(toolName: string, args: any): Promise<ToolResponse> { return this.exec.execute(toolName, args); }

    @mcpTool({ name: 'run_project', title: 'Open preview fallback', description: '[specialist] Open Build panel as preview fallback; does not launch preview automatically.',
                inputSchema: z.object({
                    platform: z.enum(['browser', 'simulator', 'preview']).default('browser').describe('Requested preview platform. Current implementation opens the build panel instead of launching preview.'),
                })
    })
    async runProject(platform: any = 'browser'): Promise<ToolResponse> {
        if (platform && typeof platform === 'object') {
            platform = platform.platform ?? 'browser';
        }
        return new Promise((resolve) => {
            const previewConfig = {
                platform: platform,
                scenes: [] // Will use current scene
            };

            // Note: Preview module is not documented in official API
            // Using fallback approach - open build panel as alternative
            Editor.Message.request('builder', 'open').then(() => {
                resolve(ok(undefined, `Build panel opened. Preview functionality requires manual setup.`));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    @mcpTool({ name: 'build_project', title: 'Open build fallback', description: '[specialist] Open Build panel for the requested platform; does not start the build.',
                inputSchema: z.object({
                    platform: z.enum(['web-mobile', 'web-desktop', 'ios', 'android', 'windows', 'mac']).describe('Build platform to pre-contextualize the response. Actual build still requires Editor UI.'),
                    debug: z.boolean().default(true).describe('Requested debug build flag. Returned as context only; build is not started programmatically.'),
                })
    })
    async buildProject(args: any): Promise<ToolResponse> {
        return new Promise((resolve) => {
            const buildOptions = {
                platform: args.platform,
                debug: args.debug !== false,
                sourceMaps: args.debug !== false,
                buildPath: `build/${args.platform}`
            };

            // Note: Builder module only supports 'open' and 'query-worker-ready'
            // Building requires manual interaction through the build panel
            Editor.Message.request('builder', 'open').then(() => {
                resolve(ok({ 
                        platform: args.platform,
                        instruction: "Use the build panel to configure and start the build process"
                    }, `Build panel opened for ${args.platform}. Please configure and start build manually.`));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    @mcpTool({ name: 'get_project_info', title: 'Read project info', description: '[specialist] Read project name/path/uuid/version/Cocos version and config. Also exposed as resource cocos://project/info; prefer the resource when the client supports MCP resources.',
                inputSchema: z.object({})
    })
    async getProjectInfo(): Promise<ToolResponse> {
        return new Promise((resolve) => {
            const info: ProjectInfo = {
                name: Editor.Project.name,
                path: Editor.Project.path,
                uuid: Editor.Project.uuid,
                version: (Editor.Project as any).version || '1.0.0',
                cocosVersion: (Editor as any).versions?.cocos || 'Unknown'
            };

            // Note: 'query-info' API doesn't exist, using 'query-config' instead
            Editor.Message.request('project', 'query-config', 'project').then((additionalInfo: any) => {
                if (additionalInfo) {
                    Object.assign(info, { config: additionalInfo });
                }
                resolve(ok(info));
            }).catch(() => {
                // Return basic info even if detailed query fails
                resolve(ok(info));
            });
        });
    }

    @mcpTool({ name: 'get_project_settings', title: 'Read project settings', description: '[specialist] Read one project settings category via project/query-config.',
                inputSchema: z.object({
                    category: z.enum(['general', 'physics', 'render', 'assets']).default('general').describe('Project settings category to query via project/query-config.'),
                })
    })
    async getProjectSettings(category: any = 'general'): Promise<ToolResponse> {
        if (category && typeof category === 'object') {
            category = category.category ?? 'general';
        }
        return new Promise((resolve) => {
            // 使用正確的 project API 查詢項目配置
            const configMap: Record<string, string> = {
                general: 'project',
                physics: 'physics',
                render: 'render',
                assets: 'asset-db'
            };

            const configName = configMap[category] || 'project';

            Editor.Message.request('project', 'query-config', configName).then((settings: any) => {
                resolve(ok({
                        category: category,
                        config: settings,
                        message: `${category} settings retrieved successfully`
                    }));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    @mcpTool({ name: 'refresh_assets', title: 'Refresh asset folder', description: '[specialist] Refresh asset-db for a folder; affects Editor asset state, not file content.',
                inputSchema: z.object({
                    folder: z.string().optional().describe('Asset db:// folder to refresh. Omit to refresh db://assets.'),
                })
    })
    async refreshAssets(folder?: any): Promise<ToolResponse> {
        if (folder && typeof folder === 'object') {
            folder = folder.folder;
        }
        return new Promise((resolve) => {
            // 使用正確的 asset-db API 刷新資源
            const targetPath = folder || 'db://assets';
            
            Editor.Message.request('asset-db', 'refresh-asset', targetPath).then(() => {
                resolve(ok(undefined, `Assets refreshed in: ${targetPath}`));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    @mcpTool({ name: 'import_asset', title: 'Import asset file', description: '[specialist] Import one disk file into asset-db; mutates project assets.',
                inputSchema: z.object({
                    sourcePath: z.string().describe('Absolute source file path on disk. Must exist.'),
                    targetFolder: z.string().describe('Target asset folder, either db://... or relative under db://assets.'),
                })
    })
    async importAsset(sourcePath: any, targetFolder?: string): Promise<ToolResponse> {
        if (sourcePath && typeof sourcePath === 'object') {
            targetFolder = sourcePath.targetFolder;
            sourcePath = sourcePath.sourcePath;
        }
        return new Promise((resolve) => {
            if (!fs.existsSync(sourcePath)) {
                resolve(fail('Source file not found'));
                return;
            }

            const fileName = path.basename(sourcePath);
            const targetPath = targetFolder!.startsWith('db://') ?
                targetFolder! : `db://assets/${targetFolder}`;

            Editor.Message.request('asset-db', 'import-asset', sourcePath, `${targetPath}/${fileName}`).then((result: any) => {
                resolve(ok({
                        uuid: result.uuid,
                        path: result.url,
                        message: `Asset imported: ${fileName}`
                    }));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    @mcpTool({ name: 'get_asset_info', title: 'Read asset info', description: '[specialist] Read basic metadata for one db:// asset path.',
                inputSchema: z.object({
                    assetPath: z.string().describe('Asset db:// path to query.'),
                })
    })
    async getAssetInfo(assetPath: any): Promise<ToolResponse> {
        if (assetPath && typeof assetPath === 'object') {
            assetPath = assetPath.assetPath;
        }
        return new Promise((resolve) => {
            Editor.Message.request('asset-db', 'query-asset-info', assetPath).then((assetInfo: any) => {
                if (!assetInfo) {
                    throw new Error('Asset not found');
                }

                const info: AssetInfo = {
                    name: assetInfo.name,
                    uuid: assetInfo.uuid,
                    path: assetInfo.url,
                    type: assetInfo.type,
                    size: assetInfo.size,
                    isDirectory: assetInfo.isDirectory
                };

                if (assetInfo.meta) {
                    info.meta = {
                        ver: assetInfo.meta.ver,
                        importer: assetInfo.meta.importer
                    };
                }

                resolve(ok(info));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    @mcpTool({ name: 'get_assets', title: 'List project assets', description: '[specialist] List assets under a folder using type-specific filename patterns. Also exposed as resource cocos://assets (defaults type=all, folder=db://assets) and cocos://assets{?type,folder} template.',
                inputSchema: z.object({
                    type: z.enum(['all', 'scene', 'prefab', 'script', 'texture', 'material', 'mesh', 'audio', 'animation']).default('all').describe('Asset type filter translated into filename patterns.'),
                    folder: z.string().default('db://assets').describe('Asset-db folder to search. Default db://assets.'),
                })
    })
    async getAssets(type: any = 'all', folder: string = 'db://assets'): Promise<ToolResponse> {
        if (type && typeof type === 'object') {
            folder = type.folder ?? 'db://assets';
            type = type.type ?? 'all';
        }
        return new Promise((resolve) => {
            let pattern = `${folder}/**/*`;
            
            // 添加類型過濾
            if (type !== 'all') {
                const typeExtensions: Record<string, string> = {
                    'scene': '.scene',
                    'prefab': '.prefab',
                    'script': '.{ts,js}',
                    'texture': '.{png,jpg,jpeg,gif,tga,bmp,psd}',
                    'material': '.mtl',
                    'mesh': '.{fbx,obj,dae}',
                    'audio': '.{mp3,ogg,wav,m4a}',
                    'animation': '.{anim,clip}'
                };
                
                const extension = typeExtensions[type];
                if (extension) {
                    pattern = `${folder}/**/*${extension}`;
                }
            }

            // Note: query-assets API parameters corrected based on documentation
            Editor.Message.request('asset-db', 'query-assets', { pattern: pattern }).then((results: any[]) => {
                const assets = results.map(asset => ({
                    name: asset.name,
                    uuid: asset.uuid,
                    path: asset.url,
                    type: asset.type,
                    size: asset.size || 0,
                    isDirectory: asset.isDirectory || false
                }));
                
                resolve(ok({
                        type: type,
                        folder: folder,
                        count: assets.length,
                        assets: assets
                    }));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    @mcpTool({ name: 'get_build_settings', title: 'Read build settings', description: '[specialist] Report builder readiness and MCP build limitations.',
                inputSchema: z.object({})
    })
    async getBuildSettings(): Promise<ToolResponse> {
        return new Promise((resolve) => {
            // 檢查構建器是否準備就緒
            Editor.Message.request('builder', 'query-worker-ready').then((ready: boolean) => {
                resolve(ok({
                        builderReady: ready,
                        message: 'Build settings are limited in MCP plugin environment',
                        availableActions: [
                            'Open build panel with open_build_panel',
                            'Check builder status with check_builder_status',
                            'Start preview server with start_preview_server',
                            'Stop preview server with stop_preview_server'
                        ],
                        limitation: 'Full build configuration requires direct Editor UI access'
                    }));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    @mcpTool({ name: 'open_build_panel', title: 'Open build panel', description: '[specialist] Open the Cocos Build panel; does not start a build.',
                inputSchema: z.object({})
    })
    async openBuildPanel(): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('builder', 'open').then(() => {
                resolve(ok(undefined, 'Build panel opened successfully'));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    @mcpTool({ name: 'check_builder_status', title: 'Check builder status', description: '[specialist] Check whether the builder worker is ready.',
                inputSchema: z.object({})
    })
    async checkBuilderStatus(): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('builder', 'query-worker-ready').then((ready: boolean) => {
                resolve(ok({
                        ready: ready,
                        status: ready ? 'Builder worker is ready' : 'Builder worker is not ready',
                        message: 'Builder status checked successfully'
                    }));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    @mcpTool({ name: 'start_preview_server', title: 'Start preview server', description: '[specialist] Unsupported preview-server placeholder; use Editor UI.',
                inputSchema: z.object({
                    port: z.number().default(7456).describe('Requested preview server port. Current implementation reports unsupported.'),
                })
    })
    async startPreviewServer(port: any = 7456): Promise<ToolResponse> {
        if (port && typeof port === 'object') {
            port = port.port ?? 7456;
        }
        return new Promise((resolve) => {
            resolve({
                success: false,
                error: 'Preview server control is not supported through MCP API',
                instruction: 'Please start the preview server manually using the editor menu: Project > Preview, or use the preview panel in the editor'
            });
        });
    }

    @mcpTool({ name: 'stop_preview_server', title: 'Stop preview server', description: '[specialist] Unsupported preview-server placeholder; use Editor UI.',
                inputSchema: z.object({})
    })
    async stopPreviewServer(): Promise<ToolResponse> {
        return new Promise((resolve) => {
            resolve({
                success: false,
                error: 'Preview server control is not supported through MCP API',
                instruction: 'Please stop the preview server manually using the preview panel in the editor'
            });
        });
    }

    @mcpTool({ name: 'create_asset', title: 'Create asset', description: '[specialist] Create an asset file or folder through asset-db; null content creates folder.',
                inputSchema: z.object({
                    url: z.string().describe('Target asset db:// URL, e.g. db://assets/newfile.json.'),
                    content: z.string().nullable().optional().describe('File content. Pass null/omit for folder creation.'),
                    overwrite: z.boolean().default(false).describe('Overwrite existing target instead of auto-renaming.'),
                })
    })
    async createAsset(url: any, content: string | null = null, overwrite: boolean = false): Promise<ToolResponse> {
        if (url && typeof url === 'object') {
            content = url.content;
            overwrite = url.overwrite;
            url = url.url;
        }
        return new Promise((resolve) => {
            const options = {
                overwrite: overwrite,
                rename: !overwrite
            };

            Editor.Message.request('asset-db', 'create-asset', url, content, options).then((result: any) => {
                if (result && result.uuid) {
                    resolve(ok({
                            uuid: result.uuid,
                            url: result.url,
                            message: content === null ? 'Folder created successfully' : 'File created successfully'
                        }));
                } else {
                    resolve(ok({
                            url: url,
                            message: content === null ? 'Folder created successfully' : 'File created successfully'
                        }));
                }
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    @mcpTool({ name: 'copy_asset', title: 'Copy asset', description: '[specialist] Copy an asset through asset-db; mutates project assets.',
                inputSchema: z.object({
                    source: z.string().describe('Source asset db:// URL.'),
                    target: z.string().describe('Target asset db:// URL or folder path.'),
                    overwrite: z.boolean().default(false).describe('Overwrite existing target instead of auto-renaming.'),
                })
    })
    async copyAsset(source: any, target?: string, overwrite: boolean = false): Promise<ToolResponse> {
        if (source && typeof source === 'object') {
            target = source.target;
            overwrite = source.overwrite;
            source = source.source;
        }
        return new Promise((resolve) => {
            const options = {
                overwrite: overwrite,
                rename: !overwrite
            };

            Editor.Message.request('asset-db', 'copy-asset', source, target!, options).then((result: any) => {
                if (result && result.uuid) {
                    resolve(ok({
                            uuid: result.uuid,
                            url: result.url,
                            message: 'Asset copied successfully'
                        }));
                } else {
                    resolve(ok({
                            source: source,
                            target: target,
                            message: 'Asset copied successfully'
                        }));
                }
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    @mcpTool({ name: 'move_asset', title: 'Move asset', description: '[specialist] Move or rename an asset through asset-db; mutates project assets.',
                inputSchema: z.object({
                    source: z.string().describe('Source asset db:// URL.'),
                    target: z.string().describe('Target asset db:// URL or folder path.'),
                    overwrite: z.boolean().default(false).describe('Overwrite existing target instead of auto-renaming.'),
                })
    })
    async moveAsset(source: any, target?: string, overwrite: boolean = false): Promise<ToolResponse> {
        if (source && typeof source === 'object') {
            target = source.target;
            overwrite = source.overwrite;
            source = source.source;
        }
        return new Promise((resolve) => {
            const options = {
                overwrite: overwrite,
                rename: !overwrite
            };

            Editor.Message.request('asset-db', 'move-asset', source, target!, options).then((result: any) => {
                if (result && result.uuid) {
                    resolve(ok({
                            uuid: result.uuid,
                            url: result.url,
                            message: 'Asset moved successfully'
                        }));
                } else {
                    resolve(ok({
                            source: source,
                            target: target,
                            message: 'Asset moved successfully'
                        }));
                }
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    @mcpTool({ name: 'delete_asset', title: 'Delete asset', description: '[specialist] Delete one asset-db URL; mutates project assets.',
                inputSchema: z.object({
                    url: z.string().describe('Asset db:// URL to delete.'),
                })
    })
    async deleteAsset(url: any): Promise<ToolResponse> {
        if (url && typeof url === 'object') {
            url = url.url;
        }
        return new Promise((resolve) => {
            Editor.Message.request('asset-db', 'delete-asset', url).then((result: any) => {
                resolve(ok({
                        url: url,
                        message: 'Asset deleted successfully'
                    }));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    @mcpTool({ name: 'save_asset', title: 'Save asset', description: '[specialist] Write serialized content to an asset URL; use only for known-good formats.',
                inputSchema: z.object({
                    url: z.string().describe('Asset db:// URL whose content should be saved.'),
                    content: z.string().describe('Serialized asset content to write.'),
                })
    })
    async saveAsset(url: any, content?: string): Promise<ToolResponse> {
        if (url && typeof url === 'object') {
            content = url.content;
            url = url.url;
        }
        return new Promise((resolve) => {
            Editor.Message.request('asset-db', 'save-asset', url, content!).then((result: any) => {
                if (result && result.uuid) {
                    resolve(ok({
                            uuid: result.uuid,
                            url: result.url,
                            message: 'Asset saved successfully'
                        }));
                } else {
                    resolve(ok({
                            url: url,
                            message: 'Asset saved successfully'
                        }));
                }
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    @mcpTool({ name: 'reimport_asset', title: 'Reimport asset', description: '[specialist] Ask asset-db to reimport an asset; updates imported asset state/cache.',
                inputSchema: z.object({
                    url: z.string().describe('Asset db:// URL to reimport.'),
                })
    })
    async reimportAsset(url: any): Promise<ToolResponse> {
        if (url && typeof url === 'object') {
            url = url.url;
        }
        return new Promise((resolve) => {
            Editor.Message.request('asset-db', 'reimport-asset', url).then(() => {
                resolve(ok({
                        url: url,
                        message: 'Asset reimported successfully'
                    }));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    @mcpTool({ name: 'query_asset_path', title: 'Resolve asset path', description: '[specialist] Resolve an asset db:// URL to disk path.',
                inputSchema: z.object({
                    url: z.string().describe('Asset db:// URL to resolve to a disk path.'),
                })
    })
    async queryAssetPath(url: any): Promise<ToolResponse> {
        if (url && typeof url === 'object') {
            url = url.url;
        }
        return new Promise((resolve) => {
            Editor.Message.request('asset-db', 'query-path', url).then((path: string | null) => {
                if (path) {
                    resolve(ok({
                            url: url,
                            path: path,
                            message: 'Asset path retrieved successfully'
                        }));
                } else {
                    resolve(fail('Asset path not found'));
                }
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    @mcpTool({ name: 'query_asset_uuid', title: 'Resolve asset UUID', description: '[specialist] Resolve an asset db:// URL to UUID.',
                inputSchema: z.object({
                    url: z.string().describe('Asset db:// URL to resolve to UUID.'),
                })
    })
    async queryAssetUuid(url: any): Promise<ToolResponse> {
        if (url && typeof url === 'object') {
            url = url.url;
        }
        return new Promise((resolve) => {
            Editor.Message.request('asset-db', 'query-uuid', url).then((uuid: string | null) => {
                if (uuid) {
                    resolve(ok({
                            url: url,
                            uuid: uuid,
                            message: 'Asset UUID retrieved successfully'
                        }));
                } else {
                    resolve(fail('Asset UUID not found'));
                }
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    @mcpTool({ name: 'query_asset_url', title: 'Resolve asset URL', description: '[specialist] Resolve an asset UUID to db:// URL.',
                inputSchema: z.object({
                    uuid: z.string().describe('Asset UUID to resolve to db:// URL.'),
                })
    })
    async queryAssetUrl(uuid: any): Promise<ToolResponse> {
        if (uuid && typeof uuid === 'object') {
            uuid = uuid.uuid;
        }
        return new Promise((resolve) => {
            Editor.Message.request('asset-db', 'query-url', uuid).then((url: string | null) => {
                if (url) {
                    resolve(ok({
                            uuid: uuid,
                            url: url,
                            message: 'Asset URL retrieved successfully'
                        }));
                } else {
                    resolve(fail('Asset URL not found'));
                }
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    @mcpTool({ name: 'find_asset_by_name', title: 'Find asset by name', description: '[specialist] Search assets by name with exact/type/folder filters; use to discover UUIDs/paths.',
                inputSchema: z.object({
                    name: z.string().describe('Asset name search term. Partial match unless exactMatch=true.'),
                    exactMatch: z.boolean().default(false).describe('Require exact asset name match. Default false.'),
                    assetType: z.enum(['all', 'scene', 'prefab', 'script', 'texture', 'material', 'mesh', 'audio', 'animation', 'spriteFrame']).default('all').describe('Asset type filter for the search.'),
                    folder: z.string().default('db://assets').describe('Asset-db folder to search. Default db://assets.'),
                    maxResults: z.number().min(1).max(100).default(20).describe('Maximum matched assets to return. Default 20.'),
                })
    })
    async findAssetByName(args: any): Promise<ToolResponse> {
        const { name, exactMatch = false, assetType = 'all', folder = 'db://assets', maxResults = 20 } = args;
        
        return new Promise(async (resolve) => {
            try {
                // Get all assets in the specified folder
                const allAssetsResponse = await this.getAssets(assetType, folder);
                if (!allAssetsResponse.success || !allAssetsResponse.data) {
                    resolve(fail(`Failed to get assets: ${allAssetsResponse.error}`));
                    return;
                }
                
                const allAssets = allAssetsResponse.data.assets as any[];
                let matchedAssets: any[] = [];
                
                // Search for matching assets
                for (const asset of allAssets) {
                    const assetName = asset.name;
                    let matches = false;
                    
                    if (exactMatch) {
                        matches = assetName === name;
                    } else {
                        matches = assetName.toLowerCase().includes(name.toLowerCase());
                    }
                    
                    if (matches) {
                        // Get detailed asset info if needed
                        try {
                            const detailResponse = await this.getAssetInfo(asset.path);
                            if (detailResponse.success) {
                                matchedAssets.push({
                                    ...asset,
                                    details: detailResponse.data
                                });
                            } else {
                                matchedAssets.push(asset);
                            }
                        } catch {
                            matchedAssets.push(asset);
                        }
                        
                        if (matchedAssets.length >= maxResults) {
                            break;
                        }
                    }
                }
                
                resolve(ok({
                        searchTerm: name,
                        exactMatch,
                        assetType,
                        folder,
                        totalFound: matchedAssets.length,
                        maxResults,
                        assets: matchedAssets,
                        message: `Found ${matchedAssets.length} assets matching '${name}'`
                    }));
                
            } catch (error: any) {
                resolve(fail(`Asset search failed: ${error.message}`));
            }
        });
    }
    
    @mcpTool({ name: 'get_asset_details', title: 'Read asset details', description: '[specialist] Read asset info plus known image sub-assets such as spriteFrame/texture UUIDs.',
                inputSchema: z.object({
                    assetPath: z.string().describe('Asset db:// path to inspect.'),
                    includeSubAssets: z.boolean().default(true).describe('Try to include known image sub-assets such as spriteFrame and texture UUIDs.'),
                })
    })
    async getAssetDetails(assetPath: any, includeSubAssets: boolean = true): Promise<ToolResponse> {
        if (assetPath && typeof assetPath === 'object') {
            includeSubAssets = assetPath.includeSubAssets;
            assetPath = assetPath.assetPath;
        }
        return new Promise(async (resolve) => {
            try {
                // Get basic asset info
                const assetInfoResponse = await this.getAssetInfo(assetPath);
                if (!assetInfoResponse.success) {
                    resolve(assetInfoResponse);
                    return;
                }
                
                const assetInfo = assetInfoResponse.data;
                const detailedInfo: any = {
                    ...assetInfo,
                    subAssets: []
                };
                
                if (includeSubAssets && assetInfo) {
                    // For image assets, try to get spriteFrame and texture sub-assets
                    if (assetInfo.type === 'cc.ImageAsset' || assetPath.match(/\.(png|jpg|jpeg|gif|tga|bmp|psd)$/i)) {
                        // Generate common sub-asset UUIDs
                        const baseUuid = assetInfo.uuid;
                        const possibleSubAssets = [
                            { type: 'spriteFrame', uuid: `${baseUuid}@f9941`, suffix: '@f9941' },
                            { type: 'texture', uuid: `${baseUuid}@6c48a`, suffix: '@6c48a' },
                            { type: 'texture2D', uuid: `${baseUuid}@6c48a`, suffix: '@6c48a' }
                        ];
                        
                        for (const subAsset of possibleSubAssets) {
                            try {
                                // Try to get URL for the sub-asset to verify it exists
                                const subAssetUrl = await Editor.Message.request('asset-db', 'query-url', subAsset.uuid);
                                if (subAssetUrl) {
                                    detailedInfo.subAssets.push({
                                        type: subAsset.type,
                                        uuid: subAsset.uuid,
                                        url: subAssetUrl,
                                        suffix: subAsset.suffix
                                    });
                                }
                            } catch {
                                // Sub-asset doesn't exist, skip it
                            }
                        }
                    }
                }
                
                resolve(ok({
                        assetPath,
                        includeSubAssets,
                        ...detailedInfo,
                        message: `Asset details retrieved. Found ${detailedInfo.subAssets.length} sub-assets.`
                    }));
                
            } catch (error: any) {
                resolve(fail(`Failed to get asset details: ${error.message}`));
            }
        });
    }
}
