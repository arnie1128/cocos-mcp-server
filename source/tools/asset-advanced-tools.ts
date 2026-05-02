import { ok, fail } from '../lib/response';
import type { ToolDefinition, ToolResponse, ToolExecutor } from '../types';
import { z } from '../lib/schema';
import { mcpTool, defineToolsFromDecorators } from '../lib/decorators';
import { ASSET_ADVANCED_DOCS } from '../data/asset-advanced-docs';

export class AssetAdvancedTools implements ToolExecutor {
    private readonly exec: ToolExecutor;

    constructor() {
        this.exec = defineToolsFromDecorators(this);
    }

    getTools(): ToolDefinition[] { return this.exec.getTools(); }
    execute(toolName: string, args: any): Promise<ToolResponse> { return this.exec.execute(toolName, args); }

    @mcpTool({
        name: 'save_asset_meta',
        title: 'Save asset meta',
        description: ASSET_ADVANCED_DOCS.save_asset_meta,
        inputSchema: z.object({
            urlOrUUID: z.string().describe('Asset db:// URL or UUID whose .meta content should be saved.'),
            content: z.string().describe('Serialized asset meta content string to write.'),
        }),
    })
    async saveAssetMeta(args: { urlOrUUID: string; content: string }): Promise<ToolResponse> {
        return this.saveAssetMetaImpl(args.urlOrUUID, args.content);
    }

    @mcpTool({
        name: 'generate_available_url',
        title: 'Generate asset URL',
        description: ASSET_ADVANCED_DOCS.generate_available_url,
        inputSchema: z.object({
            url: z.string().describe('Desired asset db:// URL to test for collision and adjust if needed.'),
        }),
    })
    async generateAvailableUrl(args: { url: string }): Promise<ToolResponse> {
        return this.generateAvailableUrlImpl(args.url);
    }

    @mcpTool({
        name: 'query_asset_db_ready',
        title: 'Check asset-db readiness',
        description: ASSET_ADVANCED_DOCS.query_asset_db_ready,
        inputSchema: z.object({}),
    })
    async queryAssetDbReady(): Promise<ToolResponse> {
        return this.queryAssetDbReadyImpl();
    }

    @mcpTool({
        name: 'open_asset_external',
        title: 'Open asset externally',
        description: ASSET_ADVANCED_DOCS.open_asset_external,
        inputSchema: z.object({
            urlOrUUID: z.string().describe('Asset db:// URL or UUID to open with the OS/editor associated external program.'),
        }),
    })
    async openAssetExternal(args: { urlOrUUID: string }): Promise<ToolResponse> {
        return this.openAssetExternalImpl(args.urlOrUUID);
    }

    @mcpTool({
        name: 'batch_import_assets',
        title: 'Import assets in batch',
        description: ASSET_ADVANCED_DOCS.batch_import_assets,
        inputSchema: z.object({
            sourceDirectory: z.string().describe('Absolute source directory on disk to scan for import files.'),
            targetDirectory: z.string().describe('Target asset-db directory URL, e.g. db://assets/textures.'),
            fileFilter: z.array(z.string()).default([]).describe('Allowed file extensions, e.g. [".png",".jpg"]. Empty means all files.'),
            recursive: z.boolean().default(false).describe('Include files from subdirectories.'),
            overwrite: z.boolean().default(false).describe('Overwrite existing target assets instead of auto-renaming.'),
        }),
    })
    async batchImportAssets(args: any): Promise<ToolResponse> {
        return this.batchImportAssetsImpl(args);
    }

    @mcpTool({
        name: 'batch_delete_assets',
        title: 'Delete assets in batch',
        description: ASSET_ADVANCED_DOCS.batch_delete_assets,
        inputSchema: z.object({
            urls: z.array(z.string()).describe('Asset db:// URLs to delete. Each URL is attempted independently.'),
        }),
    })
    async batchDeleteAssets(args: { urls: string[] }): Promise<ToolResponse> {
        return this.batchDeleteAssetsImpl(args.urls);
    }

    @mcpTool({
        name: 'validate_asset_references',
        title: 'Validate asset references',
        description: ASSET_ADVANCED_DOCS.validate_asset_references,
        inputSchema: z.object({
            directory: z.string().default('db://assets').describe('Asset-db directory to scan. Default db://assets.'),
        }),
    })
    async validateAssetReferences(args: { directory?: string }): Promise<ToolResponse> {
        return this.validateAssetReferencesImpl(args.directory);
    }

    @mcpTool({
        name: 'get_asset_dependencies',
        title: 'Read asset dependencies',
        description: ASSET_ADVANCED_DOCS.get_asset_dependencies,
        inputSchema: z.object({
            urlOrUUID: z.string().describe('Asset URL or UUID for dependency analysis. Current implementation reports unsupported.'),
            direction: z.enum(['dependents', 'dependencies', 'both']).default('dependencies').describe('Dependency direction requested. Current implementation reports unsupported.'),
        }),
    })
    async getAssetDependencies(args: { urlOrUUID: string; direction?: string }): Promise<ToolResponse> {
        return this.getAssetDependenciesImpl(args.urlOrUUID, args.direction);
    }

    @mcpTool({
        name: 'get_unused_assets',
        title: 'Find unused assets',
        description: ASSET_ADVANCED_DOCS.get_unused_assets,
        inputSchema: z.object({
            directory: z.string().default('db://assets').describe('Asset-db directory to scan. Current implementation reports unsupported.'),
            excludeDirectories: z.array(z.string()).default([]).describe('Directories to exclude from the requested scan. Current implementation reports unsupported.'),
        }),
    })
    async getUnusedAssets(args: { directory?: string; excludeDirectories?: string[] }): Promise<ToolResponse> {
        return this.getUnusedAssetsImpl(args.directory, args.excludeDirectories);
    }

    @mcpTool({
        name: 'compress_textures',
        title: 'Compress textures',
        description: ASSET_ADVANCED_DOCS.compress_textures,
        inputSchema: z.object({
            directory: z.string().default('db://assets').describe('Texture directory requested for compression. Current implementation reports unsupported.'),
            format: z.enum(['auto', 'jpg', 'png', 'webp']).default('auto').describe('Requested output format. Current implementation reports unsupported.'),
            quality: z.number().min(0.1).max(1.0).default(0.8).describe('Requested compression quality from 0.1 to 1.0. Current implementation reports unsupported.'),
        }),
    })
    async compressTextures(args: { directory?: string; format?: string; quality?: number }): Promise<ToolResponse> {
        return this.compressTexturesImpl(args.directory, args.format, args.quality);
    }

    @mcpTool({
        name: 'export_asset_manifest',
        title: 'Export asset manifest',
        description: ASSET_ADVANCED_DOCS.export_asset_manifest,
        inputSchema: z.object({
            directory: z.string().default('db://assets').describe('Asset-db directory to include in the manifest. Default db://assets.'),
            format: z.enum(['json', 'csv', 'xml']).default('json').describe('Returned manifest serialization format.'),
            includeMetadata: z.boolean().default(true).describe('Try to include asset metadata when available.'),
        }),
    })
    async exportAssetManifest(args: { directory?: string; format?: string; includeMetadata?: boolean }): Promise<ToolResponse> {
        return this.exportAssetManifestImpl(args.directory, args.format, args.includeMetadata);
    }

    @mcpTool({
        name: 'get_users',
        title: 'Find asset users',
        description: ASSET_ADVANCED_DOCS.get_users,
        inputSchema: z.object({
            uuid: z.string().describe('Asset UUID to find references to.'),
        }),
    })
    async getUsers(args: { uuid: string }): Promise<ToolResponse> {
        return this.getUsersImpl(args.uuid);
    }

    private async saveAssetMetaImpl(urlOrUUID: string, content: string): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('asset-db', 'save-asset-meta', urlOrUUID, content).then((result: any) => {
                resolve(ok({
                        uuid: result?.uuid,
                        url: result?.url,
                        message: 'Asset meta saved successfully'
                    }));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async generateAvailableUrlImpl(url: string): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('asset-db', 'generate-available-url', url).then((availableUrl: string) => {
                resolve(ok({
                        originalUrl: url,
                        availableUrl: availableUrl,
                        message: availableUrl === url ? 
                            'URL is available' : 
                            'Generated new available URL'
                    }));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async queryAssetDbReadyImpl(): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('asset-db', 'query-ready').then((ready: boolean) => {
                resolve(ok({
                        ready: ready,
                        message: ready ? 'Asset database is ready' : 'Asset database is not ready'
                    }));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async openAssetExternalImpl(urlOrUUID: string): Promise<ToolResponse> {
        return new Promise((resolve) => {
            Editor.Message.request('asset-db', 'open-asset', urlOrUUID).then(() => {
                resolve(ok(undefined, 'Asset opened with external program'));
            }).catch((err: Error) => {
                resolve(fail(err.message));
            });
        });
    }

    private async batchImportAssetsImpl(args: any): Promise<ToolResponse> {
        const fs = require('fs');
        const path = require('path');
        
        if (!fs.existsSync(args.sourceDirectory)) {
            return fail('Source directory does not exist');
        }

        const files = this.getFilesFromDirectory(
            args.sourceDirectory, 
            args.fileFilter || [], 
            args.recursive || false
        );

        const importResults: any[] = [];
        let successCount = 0;
        let errorCount = 0;

        for (const filePath of files) {
            try {
                const fileName = path.basename(filePath);
                const targetPath = `${args.targetDirectory}/${fileName}`;
                
                const result = await Editor.Message.request('asset-db', 'import-asset', 
                    filePath, targetPath, { 
                        overwrite: args.overwrite || false,
                        rename: !(args.overwrite || false)
                    });
                
                importResults.push({
                    source: filePath,
                    target: targetPath,
                    success: true,
                    uuid: result?.uuid
                });
                successCount++;
            } catch (err: any) {
                importResults.push({
                    source: filePath,
                    success: false,
                    error: err.message
                });
                errorCount++;
            }
        }

        return ok({
                totalFiles: files.length,
                successCount: successCount,
                errorCount: errorCount,
                results: importResults,
                message: `Batch import completed: ${successCount} success, ${errorCount} errors`
            });
    }

    private getFilesFromDirectory(dirPath: string, fileFilter: string[], recursive: boolean): string[] {
        const fs = require('fs');
        const path = require('path');
        const files: string[] = [];

        const items = fs.readdirSync(dirPath);
        
        for (const item of items) {
            const fullPath = path.join(dirPath, item);
            const stat = fs.statSync(fullPath);
            
            if (stat.isFile()) {
                if (fileFilter.length === 0 || fileFilter.some(ext => item.toLowerCase().endsWith(ext.toLowerCase()))) {
                    files.push(fullPath);
                }
            } else if (stat.isDirectory() && recursive) {
                files.push(...this.getFilesFromDirectory(fullPath, fileFilter, recursive));
            }
        }
        
        return files;
    }

    private async batchDeleteAssetsImpl(urls: string[]): Promise<ToolResponse> {
        const deleteResults: any[] = [];
        let successCount = 0;
        let errorCount = 0;

        for (const url of urls) {
            try {
                await Editor.Message.request('asset-db', 'delete-asset', url);
                deleteResults.push({
                    url: url,
                    success: true
                });
                successCount++;
            } catch (err: any) {
                deleteResults.push({
                    url: url,
                    success: false,
                    error: err.message
                });
                errorCount++;
            }
        }

        return ok({
                totalAssets: urls.length,
                successCount: successCount,
                errorCount: errorCount,
                results: deleteResults,
                message: `Batch delete completed: ${successCount} success, ${errorCount} errors`
            });
    }

    private async validateAssetReferencesImpl(directory: string = 'db://assets'): Promise<ToolResponse> {
        // Get all assets in directory
        const assets = await Editor.Message.request('asset-db', 'query-assets', { pattern: `${directory}/**/*` });
        
        const brokenReferences: any[] = [];
        const validReferences: any[] = [];

        for (const asset of assets) {
            try {
                const assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', asset.url);
                if (assetInfo) {
                    validReferences.push({
                        url: asset.url,
                        uuid: asset.uuid,
                        name: asset.name
                    });
                }
            } catch (err) {
                brokenReferences.push({
                    url: asset.url,
                    uuid: asset.uuid,
                    name: asset.name,
                    error: (err as Error).message
                });
            }
        }

        return ok({
                directory: directory,
                totalAssets: assets.length,
                validReferences: validReferences.length,
                brokenReferences: brokenReferences.length,
                brokenAssets: brokenReferences,
                message: `Validation completed: ${brokenReferences.length} broken references found`
            });
    }

    private async getAssetDependenciesImpl(urlOrUUID: string, direction: string = 'dependencies'): Promise<ToolResponse> {
        return new Promise((resolve) => {
            // Note: This would require scene analysis or additional APIs not available in current documentation
            resolve(fail('Asset dependency analysis requires additional APIs not available in current Cocos Creator MCP implementation. Consider using the Editor UI for dependency analysis.'));
        });
    }

    private async getUnusedAssetsImpl(directory: string = 'db://assets', excludeDirectories: string[] = []): Promise<ToolResponse> {
        return new Promise((resolve) => {
            // Note: This would require comprehensive project analysis
            resolve(fail('Unused asset detection requires comprehensive project analysis not available in current Cocos Creator MCP implementation. Consider using the Editor UI or third-party tools for unused asset detection.'));
        });
    }

    private async compressTexturesImpl(directory: string = 'db://assets', format: string = 'auto', quality: number = 0.8): Promise<ToolResponse> {
        return new Promise((resolve) => {
            // Note: Texture compression would require image processing APIs
            resolve(fail('Texture compression requires image processing capabilities not available in current Cocos Creator MCP implementation. Use the Editor\'s built-in texture compression settings or external tools.'));
        });
    }

    private async exportAssetManifestImpl(directory: string = 'db://assets', format: string = 'json', includeMetadata: boolean = true): Promise<ToolResponse> {
        const assets = await Editor.Message.request('asset-db', 'query-assets', { pattern: `${directory}/**/*` });
        
        const manifest: any[] = [];

        for (const asset of assets) {
            const manifestEntry: any = {
                name: asset.name,
                url: asset.url,
                uuid: asset.uuid,
                type: asset.type,
                size: (asset as any).size || 0,
                isDirectory: asset.isDirectory || false
            };

            if (includeMetadata) {
                try {
                    const assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', asset.url);
                    if (assetInfo && assetInfo.meta) {
                        manifestEntry.meta = assetInfo.meta;
                    }
                } catch (err) {
                    // Skip metadata if not available
                }
            }

            manifest.push(manifestEntry);
        }

        let exportData: string;
        switch (format) {
            case 'json':
                exportData = JSON.stringify(manifest, null, 2);
                break;
            case 'csv':
                exportData = this.convertToCSV(manifest);
                break;
            case 'xml':
                exportData = this.convertToXML(manifest);
                break;
            default:
                exportData = JSON.stringify(manifest, null, 2);
        }

        return ok({
                directory: directory,
                format: format,
                assetCount: manifest.length,
                includeMetadata: includeMetadata,
                manifest: exportData,
                message: `Asset manifest exported with ${manifest.length} assets`
            });
    }

    private convertToCSV(data: any[]): string {
        if (data.length === 0) return '';
        
        const headers = Object.keys(data[0]);
        const csvRows = [headers.join(',')];
        
        for (const row of data) {
            const values = headers.map(header => {
                const value = row[header];
                return typeof value === 'object' ? JSON.stringify(value) : String(value);
            });
            csvRows.push(values.join(','));
        }
        
        return csvRows.join('\n');
    }

    private convertToXML(data: any[]): string {
        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<assets>\n';
        
        for (const item of data) {
            xml += '  <asset>\n';
            for (const [key, value] of Object.entries(item)) {
                const xmlValue = typeof value === 'object' ? 
                    JSON.stringify(value) : 
                    String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                xml += `    <${key}>${xmlValue}</${key}>\n`;
            }
            xml += '  </asset>\n';
        }
        
        xml += '</assets>';
        return xml;
    }

    private async getUsersImpl(targetUuid: string): Promise<ToolResponse> {
        const scenes = await Editor.Message.request('asset-db', 'query-assets', { pattern: 'db://assets/**', ccType: 'cc.SceneAsset' });
        const prefabs = await Editor.Message.request('asset-db', 'query-assets', { pattern: 'db://assets/**', ccType: 'cc.Prefab' });
        const scriptsTs = await Editor.Message.request('asset-db', 'query-assets', { pattern: 'db://assets/**/*.ts' });
        const scriptsJs = await Editor.Message.request('asset-db', 'query-assets', { pattern: 'db://assets/**/*.js' });
        
        const allAssets = [...scenes, ...prefabs, ...scriptsTs, ...scriptsJs];
        const uniqueAssets = Array.from(new Map(allAssets.map((a: any) => [a.uuid, a])).values());

        const users: any[] = [];
        for (const asset of uniqueAssets) {
            const deps = await Editor.Message.request('asset-db', 'query-asset-depends', asset.uuid);
            if (deps && deps.includes(targetUuid)) {
                let type = 'script';
                if (asset.type === 'cc.SceneAsset') type = 'scene';
                else if (asset.type === 'cc.Prefab') type = 'prefab';
                users.push({ type, uuid: asset.uuid, path: asset.url, name: asset.name });
            }
        }
        
        return ok({ uuid: targetUuid, users, total: users.length });
    }
}
