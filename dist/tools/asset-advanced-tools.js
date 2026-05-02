"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssetAdvancedTools = void 0;
const response_1 = require("../lib/response");
const schema_1 = require("../lib/schema");
const define_tools_1 = require("../lib/define-tools");
class AssetAdvancedTools {
    constructor() {
        const defs = [
            {
                name: 'save_asset_meta',
                title: 'Save asset meta',
                description: '[specialist] Write serialized meta content for an asset URL/UUID; mutates asset metadata.',
                inputSchema: schema_1.z.object({
                    urlOrUUID: schema_1.z.string().describe('Asset db:// URL or UUID whose .meta content should be saved.'),
                    content: schema_1.z.string().describe('Serialized asset meta content string to write.'),
                }),
                handler: a => this.saveAssetMeta(a.urlOrUUID, a.content),
            },
            {
                name: 'generate_available_url',
                title: 'Generate asset URL',
                description: '[specialist] Return a collision-free asset URL derived from the requested URL.',
                inputSchema: schema_1.z.object({
                    url: schema_1.z.string().describe('Desired asset db:// URL to test for collision and adjust if needed.'),
                }),
                handler: a => this.generateAvailableUrl(a.url),
            },
            {
                name: 'query_asset_db_ready',
                title: 'Check asset-db readiness',
                description: '[specialist] Check whether asset-db reports ready before batch operations.',
                inputSchema: schema_1.z.object({}),
                handler: () => this.queryAssetDbReady(),
            },
            {
                name: 'open_asset_external',
                title: 'Open asset externally',
                description: '[specialist] Open an asset through the editor/OS external handler; does not edit content.',
                inputSchema: schema_1.z.object({
                    urlOrUUID: schema_1.z.string().describe('Asset db:// URL or UUID to open with the OS/editor associated external program.'),
                }),
                handler: a => this.openAssetExternal(a.urlOrUUID),
            },
            {
                name: 'batch_import_assets',
                title: 'Import assets in batch',
                description: '[specialist] Import files from a disk directory into asset-db; mutates project assets.',
                inputSchema: schema_1.z.object({
                    sourceDirectory: schema_1.z.string().describe('Absolute source directory on disk to scan for import files.'),
                    targetDirectory: schema_1.z.string().describe('Target asset-db directory URL, e.g. db://assets/textures.'),
                    fileFilter: schema_1.z.array(schema_1.z.string()).default([]).describe('Allowed file extensions, e.g. [".png",".jpg"]. Empty means all files.'),
                    recursive: schema_1.z.boolean().default(false).describe('Include files from subdirectories.'),
                    overwrite: schema_1.z.boolean().default(false).describe('Overwrite existing target assets instead of auto-renaming.'),
                }),
                handler: a => this.batchImportAssets(a),
            },
            {
                name: 'batch_delete_assets',
                title: 'Delete assets in batch',
                description: '[specialist] Delete multiple asset-db URLs; mutates project assets.',
                inputSchema: schema_1.z.object({
                    urls: schema_1.z.array(schema_1.z.string()).describe('Asset db:// URLs to delete. Each URL is attempted independently.'),
                }),
                handler: a => this.batchDeleteAssets(a.urls),
            },
            {
                name: 'validate_asset_references',
                title: 'Validate asset references',
                description: '[specialist] Lightly scan assets under a directory for broken asset-info references.',
                inputSchema: schema_1.z.object({
                    directory: schema_1.z.string().default('db://assets').describe('Asset-db directory to scan. Default db://assets.'),
                }),
                handler: a => this.validateAssetReferences(a.directory),
            },
            {
                name: 'get_asset_dependencies',
                title: 'Read asset dependencies',
                description: '[specialist] Unsupported dependency-analysis placeholder; always reports unsupported.',
                inputSchema: schema_1.z.object({
                    urlOrUUID: schema_1.z.string().describe('Asset URL or UUID for dependency analysis. Current implementation reports unsupported.'),
                    direction: schema_1.z.enum(['dependents', 'dependencies', 'both']).default('dependencies').describe('Dependency direction requested. Current implementation reports unsupported.'),
                }),
                handler: a => this.getAssetDependencies(a.urlOrUUID, a.direction),
            },
            {
                name: 'get_unused_assets',
                title: 'Find unused assets',
                description: '[specialist] Unsupported unused-asset placeholder; always reports unsupported.',
                inputSchema: schema_1.z.object({
                    directory: schema_1.z.string().default('db://assets').describe('Asset-db directory to scan. Current implementation reports unsupported.'),
                    excludeDirectories: schema_1.z.array(schema_1.z.string()).default([]).describe('Directories to exclude from the requested scan. Current implementation reports unsupported.'),
                }),
                handler: a => this.getUnusedAssets(a.directory, a.excludeDirectories),
            },
            {
                name: 'compress_textures',
                title: 'Compress textures',
                description: '[specialist] Unsupported texture-compression placeholder; always reports unsupported.',
                inputSchema: schema_1.z.object({
                    directory: schema_1.z.string().default('db://assets').describe('Texture directory requested for compression. Current implementation reports unsupported.'),
                    format: schema_1.z.enum(['auto', 'jpg', 'png', 'webp']).default('auto').describe('Requested output format. Current implementation reports unsupported.'),
                    quality: schema_1.z.number().min(0.1).max(1.0).default(0.8).describe('Requested compression quality from 0.1 to 1.0. Current implementation reports unsupported.'),
                }),
                handler: a => this.compressTextures(a.directory, a.format, a.quality),
            },
            {
                name: 'export_asset_manifest',
                title: 'Export asset manifest',
                description: '[specialist] Return asset inventory for a directory as json/csv/xml text; does not write a file.',
                inputSchema: schema_1.z.object({
                    directory: schema_1.z.string().default('db://assets').describe('Asset-db directory to include in the manifest. Default db://assets.'),
                    format: schema_1.z.enum(['json', 'csv', 'xml']).default('json').describe('Returned manifest serialization format.'),
                    includeMetadata: schema_1.z.boolean().default(true).describe('Try to include asset metadata when available.'),
                }),
                handler: a => this.exportAssetManifest(a.directory, a.format, a.includeMetadata),
            },
            {
                name: 'get_users',
                title: 'Find asset users',
                description: '[specialist] Find scenes/prefabs/scripts that reference an asset by UUID.',
                inputSchema: schema_1.z.object({
                    uuid: schema_1.z.string().describe('Asset UUID to find references to.'),
                }),
                handler: a => this.getUsers(a.uuid),
            },
        ];
        this.exec = (0, define_tools_1.defineTools)(defs);
    }
    getTools() { return this.exec.getTools(); }
    execute(toolName, args) { return this.exec.execute(toolName, args); }
    async saveAssetMeta(urlOrUUID, content) {
        return new Promise((resolve) => {
            Editor.Message.request('asset-db', 'save-asset-meta', urlOrUUID, content).then((result) => {
                resolve((0, response_1.ok)({
                    uuid: result === null || result === void 0 ? void 0 : result.uuid,
                    url: result === null || result === void 0 ? void 0 : result.url,
                    message: 'Asset meta saved successfully'
                }));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async generateAvailableUrl(url) {
        return new Promise((resolve) => {
            Editor.Message.request('asset-db', 'generate-available-url', url).then((availableUrl) => {
                resolve((0, response_1.ok)({
                    originalUrl: url,
                    availableUrl: availableUrl,
                    message: availableUrl === url ?
                        'URL is available' :
                        'Generated new available URL'
                }));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async queryAssetDbReady() {
        return new Promise((resolve) => {
            Editor.Message.request('asset-db', 'query-ready').then((ready) => {
                resolve((0, response_1.ok)({
                    ready: ready,
                    message: ready ? 'Asset database is ready' : 'Asset database is not ready'
                }));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async openAssetExternal(urlOrUUID) {
        return new Promise((resolve) => {
            Editor.Message.request('asset-db', 'open-asset', urlOrUUID).then(() => {
                resolve((0, response_1.ok)(undefined, 'Asset opened with external program'));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async batchImportAssets(args) {
        const fs = require('fs');
        const path = require('path');
        if (!fs.existsSync(args.sourceDirectory)) {
            return (0, response_1.fail)('Source directory does not exist');
        }
        const files = this.getFilesFromDirectory(args.sourceDirectory, args.fileFilter || [], args.recursive || false);
        const importResults = [];
        let successCount = 0;
        let errorCount = 0;
        for (const filePath of files) {
            try {
                const fileName = path.basename(filePath);
                const targetPath = `${args.targetDirectory}/${fileName}`;
                const result = await Editor.Message.request('asset-db', 'import-asset', filePath, targetPath, {
                    overwrite: args.overwrite || false,
                    rename: !(args.overwrite || false)
                });
                importResults.push({
                    source: filePath,
                    target: targetPath,
                    success: true,
                    uuid: result === null || result === void 0 ? void 0 : result.uuid
                });
                successCount++;
            }
            catch (err) {
                importResults.push({
                    source: filePath,
                    success: false,
                    error: err.message
                });
                errorCount++;
            }
        }
        return (0, response_1.ok)({
            totalFiles: files.length,
            successCount: successCount,
            errorCount: errorCount,
            results: importResults,
            message: `Batch import completed: ${successCount} success, ${errorCount} errors`
        });
    }
    getFilesFromDirectory(dirPath, fileFilter, recursive) {
        const fs = require('fs');
        const path = require('path');
        const files = [];
        const items = fs.readdirSync(dirPath);
        for (const item of items) {
            const fullPath = path.join(dirPath, item);
            const stat = fs.statSync(fullPath);
            if (stat.isFile()) {
                if (fileFilter.length === 0 || fileFilter.some(ext => item.toLowerCase().endsWith(ext.toLowerCase()))) {
                    files.push(fullPath);
                }
            }
            else if (stat.isDirectory() && recursive) {
                files.push(...this.getFilesFromDirectory(fullPath, fileFilter, recursive));
            }
        }
        return files;
    }
    async batchDeleteAssets(urls) {
        const deleteResults = [];
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
            }
            catch (err) {
                deleteResults.push({
                    url: url,
                    success: false,
                    error: err.message
                });
                errorCount++;
            }
        }
        return (0, response_1.ok)({
            totalAssets: urls.length,
            successCount: successCount,
            errorCount: errorCount,
            results: deleteResults,
            message: `Batch delete completed: ${successCount} success, ${errorCount} errors`
        });
    }
    async validateAssetReferences(directory = 'db://assets') {
        // Get all assets in directory
        const assets = await Editor.Message.request('asset-db', 'query-assets', { pattern: `${directory}/**/*` });
        const brokenReferences = [];
        const validReferences = [];
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
            }
            catch (err) {
                brokenReferences.push({
                    url: asset.url,
                    uuid: asset.uuid,
                    name: asset.name,
                    error: err.message
                });
            }
        }
        return (0, response_1.ok)({
            directory: directory,
            totalAssets: assets.length,
            validReferences: validReferences.length,
            brokenReferences: brokenReferences.length,
            brokenAssets: brokenReferences,
            message: `Validation completed: ${brokenReferences.length} broken references found`
        });
    }
    async getAssetDependencies(urlOrUUID, direction = 'dependencies') {
        return new Promise((resolve) => {
            // Note: This would require scene analysis or additional APIs not available in current documentation
            resolve((0, response_1.fail)('Asset dependency analysis requires additional APIs not available in current Cocos Creator MCP implementation. Consider using the Editor UI for dependency analysis.'));
        });
    }
    async getUnusedAssets(directory = 'db://assets', excludeDirectories = []) {
        return new Promise((resolve) => {
            // Note: This would require comprehensive project analysis
            resolve((0, response_1.fail)('Unused asset detection requires comprehensive project analysis not available in current Cocos Creator MCP implementation. Consider using the Editor UI or third-party tools for unused asset detection.'));
        });
    }
    async compressTextures(directory = 'db://assets', format = 'auto', quality = 0.8) {
        return new Promise((resolve) => {
            // Note: Texture compression would require image processing APIs
            resolve((0, response_1.fail)('Texture compression requires image processing capabilities not available in current Cocos Creator MCP implementation. Use the Editor\'s built-in texture compression settings or external tools.'));
        });
    }
    async exportAssetManifest(directory = 'db://assets', format = 'json', includeMetadata = true) {
        const assets = await Editor.Message.request('asset-db', 'query-assets', { pattern: `${directory}/**/*` });
        const manifest = [];
        for (const asset of assets) {
            const manifestEntry = {
                name: asset.name,
                url: asset.url,
                uuid: asset.uuid,
                type: asset.type,
                size: asset.size || 0,
                isDirectory: asset.isDirectory || false
            };
            if (includeMetadata) {
                try {
                    const assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', asset.url);
                    if (assetInfo && assetInfo.meta) {
                        manifestEntry.meta = assetInfo.meta;
                    }
                }
                catch (err) {
                    // Skip metadata if not available
                }
            }
            manifest.push(manifestEntry);
        }
        let exportData;
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
        return (0, response_1.ok)({
            directory: directory,
            format: format,
            assetCount: manifest.length,
            includeMetadata: includeMetadata,
            manifest: exportData,
            message: `Asset manifest exported with ${manifest.length} assets`
        });
    }
    convertToCSV(data) {
        if (data.length === 0)
            return '';
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
    convertToXML(data) {
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
    async getUsers(targetUuid) {
        const scenes = await Editor.Message.request('asset-db', 'query-assets', { pattern: 'db://assets/**', ccType: 'cc.SceneAsset' });
        const prefabs = await Editor.Message.request('asset-db', 'query-assets', { pattern: 'db://assets/**', ccType: 'cc.Prefab' });
        const scriptsTs = await Editor.Message.request('asset-db', 'query-assets', { pattern: 'db://assets/**/*.ts' });
        const scriptsJs = await Editor.Message.request('asset-db', 'query-assets', { pattern: 'db://assets/**/*.js' });
        const allAssets = [...scenes, ...prefabs, ...scriptsTs, ...scriptsJs];
        const uniqueAssets = Array.from(new Map(allAssets.map((a) => [a.uuid, a])).values());
        const users = [];
        for (const asset of uniqueAssets) {
            const deps = await Editor.Message.request('asset-db', 'query-asset-depends', asset.uuid);
            if (deps && deps.includes(targetUuid)) {
                let type = 'script';
                if (asset.type === 'cc.SceneAsset')
                    type = 'scene';
                else if (asset.type === 'cc.Prefab')
                    type = 'prefab';
                users.push({ type, uuid: asset.uuid, path: asset.url, name: asset.name });
            }
        }
        return (0, response_1.ok)({ uuid: targetUuid, users, total: users.length });
    }
}
exports.AssetAdvancedTools = AssetAdvancedTools;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXNzZXQtYWR2YW5jZWQtdG9vbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvdG9vbHMvYXNzZXQtYWR2YW5jZWQtdG9vbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsOENBQTJDO0FBRTNDLDBDQUFrQztBQUNsQyxzREFBMkQ7QUFFM0QsTUFBYSxrQkFBa0I7SUFHM0I7UUFDSSxNQUFNLElBQUksR0FBYztZQUNwQjtnQkFDSSxJQUFJLEVBQUUsaUJBQWlCO2dCQUN2QixLQUFLLEVBQUUsaUJBQWlCO2dCQUN4QixXQUFXLEVBQUUsMkZBQTJGO2dCQUN4RyxXQUFXLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQztvQkFDbEIsU0FBUyxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLENBQUMsOERBQThELENBQUM7b0JBQzlGLE9BQU8sRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLGdEQUFnRCxDQUFDO2lCQUNqRixDQUFDO2dCQUNGLE9BQU8sRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDO2FBQzNEO1lBQ0Q7Z0JBQ0ksSUFBSSxFQUFFLHdCQUF3QjtnQkFDOUIsS0FBSyxFQUFFLG9CQUFvQjtnQkFDM0IsV0FBVyxFQUFFLGdGQUFnRjtnQkFDN0YsV0FBVyxFQUFFLFVBQUMsQ0FBQyxNQUFNLENBQUM7b0JBQ2xCLEdBQUcsRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLHFFQUFxRSxDQUFDO2lCQUNsRyxDQUFDO2dCQUNGLE9BQU8sRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDO2FBQ2pEO1lBQ0Q7Z0JBQ0ksSUFBSSxFQUFFLHNCQUFzQjtnQkFDNUIsS0FBSyxFQUFF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QUFDLElBQUksQ0FBQyxDQUFDO1lBQ3pGLElBQUksSUFBSSxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQztnQkFDcEMsSUFBSSxJQUFJLEdBQUcsUUFBUSxDQUFDO2dCQUNwQixJQUFJLEtBQUssQ0FBQyxJQUFJLEtBQUssZUFBZTtvQkFBRSxJQUFJLEdBQUcsT0FBTyxDQUFDO3FCQUM5QyxJQUFJLEtBQUssQ0FBQyxJQUFJLEtBQUssV0FBVztvQkFBRSxJQUFJLEdBQUcsUUFBUSxDQUFDO2dCQUNyRCxLQUFLLENBQUMsSUFBSSxDQUFDLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxLQUFLLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxLQUFLLENBQUMsR0FBRyxFQUFFLElBQUksRUFBRSxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQztZQUM5RSxDQUFDO1FBQ0wsQ0FBQztRQUVELE9BQU8sSUFBQSxhQUFFLEVBQUMsRUFBRSxJQUFJLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7SUFDaEUsQ0FBQztDQUNKO0FBN2NELGdEQTZjQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IG9rLCBmYWlsIH0gZnJvbSAnLi4vbGliL3Jlc3BvbnNlJztcbmltcG9ydCB7IFRvb2xEZWZpbml0aW9uLCBUb29sUmVzcG9uc2UsIFRvb2xFeGVjdXRvciB9IGZyb20gJy4uL3R5cGVzJztcbmltcG9ydCB7IHogfSBmcm9tICcuLi9saWIvc2NoZW1hJztcbmltcG9ydCB7IGRlZmluZVRvb2xzLCBUb29sRGVmIH0gZnJvbSAnLi4vbGliL2RlZmluZS10b29scyc7XG5cbmV4cG9ydCBjbGFzcyBBc3NldEFkdmFuY2VkVG9vbHMgaW1wbGVtZW50cyBUb29sRXhlY3V0b3Ige1xuICAgIHByaXZhdGUgcmVhZG9ubHkgZXhlYzogVG9vbEV4ZWN1dG9yO1xuXG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIGNvbnN0IGRlZnM6IFRvb2xEZWZbXSA9IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnc2F2ZV9hc3NldF9tZXRhJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1NhdmUgYXNzZXQgbWV0YScsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gV3JpdGUgc2VyaWFsaXplZCBtZXRhIGNvbnRlbnQgZm9yIGFuIGFzc2V0IFVSTC9VVUlEOyBtdXRhdGVzIGFzc2V0IG1ldGFkYXRhLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgdXJsT3JVVUlEOiB6LnN0cmluZygpLmRlc2NyaWJlKCdBc3NldCBkYjovLyBVUkwgb3IgVVVJRCB3aG9zZSAubWV0YSBjb250ZW50IHNob3VsZCBiZSBzYXZlZC4nKSxcbiAgICAgICAgICAgICAgICAgICAgY29udGVudDogei5zdHJpbmcoKS5kZXNjcmliZSgnU2VyaWFsaXplZCBhc3NldCBtZXRhIGNvbnRlbnQgc3RyaW5nIHRvIHdyaXRlLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy5zYXZlQXNzZXRNZXRhKGEudXJsT3JVVUlELCBhLmNvbnRlbnQpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnZ2VuZXJhdGVfYXZhaWxhYmxlX3VybCcsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdHZW5lcmF0ZSBhc3NldCBVUkwnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFJldHVybiBhIGNvbGxpc2lvbi1mcmVlIGFzc2V0IFVSTCBkZXJpdmVkIGZyb20gdGhlIHJlcXVlc3RlZCBVUkwuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICB1cmw6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0Rlc2lyZWQgYXNzZXQgZGI6Ly8gVVJMIHRvIHRlc3QgZm9yIGNvbGxpc2lvbiBhbmQgYWRqdXN0IGlmIG5lZWRlZC4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMuZ2VuZXJhdGVBdmFpbGFibGVVcmwoYS51cmwpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAncXVlcnlfYXNzZXRfZGJfcmVhZHknLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnQ2hlY2sgYXNzZXQtZGIgcmVhZGluZXNzJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBDaGVjayB3aGV0aGVyIGFzc2V0LWRiIHJlcG9ydHMgcmVhZHkgYmVmb3JlIGJhdGNoIG9wZXJhdGlvbnMuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6ICgpID0+IHRoaXMucXVlcnlBc3NldERiUmVhZHkoKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ29wZW5fYXNzZXRfZXh0ZXJuYWwnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnT3BlbiBhc3NldCBleHRlcm5hbGx5JyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBPcGVuIGFuIGFzc2V0IHRocm91Z2ggdGhlIGVkaXRvci9PUyBleHRlcm5hbCBoYW5kbGVyOyBkb2VzIG5vdCBlZGl0IGNvbnRlbnQuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICB1cmxPclVVSUQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0Fzc2V0IGRiOi8vIFVSTCBvciBVVUlEIHRvIG9wZW4gd2l0aCB0aGUgT1MvZWRpdG9yIGFzc29jaWF0ZWQgZXh0ZXJuYWwgcHJvZ3JhbS4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMub3BlbkFzc2V0RXh0ZXJuYWwoYS51cmxPclVVSUQpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnYmF0Y2hfaW1wb3J0X2Fzc2V0cycsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdJbXBvcnQgYXNzZXRzIGluIGJhdGNoJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBJbXBvcnQgZmlsZXMgZnJvbSBhIGRpc2sgZGlyZWN0b3J5IGludG8gYXNzZXQtZGI7IG11dGF0ZXMgcHJvamVjdCBhc3NldHMuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBzb3VyY2VEaXJlY3Rvcnk6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0Fic29sdXRlIHNvdXJjZSBkaXJlY3Rvcnkgb24gZGlzayB0byBzY2FuIGZvciBpbXBvcnQgZmlsZXMuJyksXG4gICAgICAgICAgICAgICAgICAgIHRhcmdldERpcmVjdG9yeTogei5zdHJpbmcoKS5kZXNjcmliZSgnVGFyZ2V0IGFzc2V0LWRiIGRpcmVjdG9yeSBVUkwsIGUuZy4gZGI6Ly9hc3NldHMvdGV4dHVyZXMuJyksXG4gICAgICAgICAgICAgICAgICAgIGZpbGVGaWx0ZXI6IHouYXJyYXkoei5zdHJpbmcoKSkuZGVmYXVsdChbXSkuZGVzY3JpYmUoJ0FsbG93ZWQgZmlsZSBleHRlbnNpb25zLCBlLmcuIFtcIi5wbmdcIixcIi5qcGdcIl0uIEVtcHR5IG1lYW5zIGFsbCBmaWxlcy4nKSxcbiAgICAgICAgICAgICAgICAgICAgcmVjdXJzaXZlOiB6LmJvb2xlYW4oKS5kZWZhdWx0KGZhbHNlKS5kZXNjcmliZSgnSW5jbHVkZSBmaWxlcyBmcm9tIHN1YmRpcmVjdG9yaWVzLicpLFxuICAgICAgICAgICAgICAgICAgICBvdmVyd3JpdGU6IHouYm9vbGVhbigpLmRlZmF1bHQoZmFsc2UpLmRlc2NyaWJlKCdPdmVyd3JpdGUgZXhpc3RpbmcgdGFyZ2V0IGFzc2V0cyBpbnN0ZWFkIG9mIGF1dG8tcmVuYW1pbmcuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLmJhdGNoSW1wb3J0QXNzZXRzKGEpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnYmF0Y2hfZGVsZXRlX2Fzc2V0cycsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdEZWxldGUgYXNzZXRzIGluIGJhdGNoJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBEZWxldGUgbXVsdGlwbGUgYXNzZXQtZGIgVVJMczsgbXV0YXRlcyBwcm9qZWN0IGFzc2V0cy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHVybHM6IHouYXJyYXkoei5zdHJpbmcoKSkuZGVzY3JpYmUoJ0Fzc2V0IGRiOi8vIFVSTHMgdG8gZGVsZXRlLiBFYWNoIFVSTCBpcyBhdHRlbXB0ZWQgaW5kZXBlbmRlbnRseS4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMuYmF0Y2hEZWxldGVBc3NldHMoYS51cmxzKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3ZhbGlkYXRlX2Fzc2V0X3JlZmVyZW5jZXMnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnVmFsaWRhdGUgYXNzZXQgcmVmZXJlbmNlcycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gTGlnaHRseSBzY2FuIGFzc2V0cyB1bmRlciBhIGRpcmVjdG9yeSBmb3IgYnJva2VuIGFzc2V0LWluZm8gcmVmZXJlbmNlcy4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIGRpcmVjdG9yeTogei5zdHJpbmcoKS5kZWZhdWx0KCdkYjovL2Fzc2V0cycpLmRlc2NyaWJlKCdBc3NldC1kYiBkaXJlY3RvcnkgdG8gc2Nhbi4gRGVmYXVsdCBkYjovL2Fzc2V0cy4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMudmFsaWRhdGVBc3NldFJlZmVyZW5jZXMoYS5kaXJlY3RvcnkpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnZ2V0X2Fzc2V0X2RlcGVuZGVuY2llcycsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdSZWFkIGFzc2V0IGRlcGVuZGVuY2llcycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gVW5zdXBwb3J0ZWQgZGVwZW5kZW5jeS1hbmFseXNpcyBwbGFjZWhvbGRlcjsgYWx3YXlzIHJlcG9ydHMgdW5zdXBwb3J0ZWQuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICB1cmxPclVVSUQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0Fzc2V0IFVSTCBvciBVVUlEIGZvciBkZXBlbmRlbmN5IGFuYWx5c2lzLiBDdXJyZW50IGltcGxlbWVudGF0aW9uIHJlcG9ydHMgdW5zdXBwb3J0ZWQuJyksXG4gICAgICAgICAgICAgICAgICAgIGRpcmVjdGlvbjogei5lbnVtKFsnZGVwZW5kZW50cycsICdkZXBlbmRlbmNpZXMnLCAnYm90aCddKS5kZWZhdWx0KCdkZXBlbmRlbmNpZXMnKS5kZXNjcmliZSgnRGVwZW5kZW5jeSBkaXJlY3Rpb24gcmVxdWVzdGVkLiBDdXJyZW50IGltcGxlbWVudGF0aW9uIHJlcG9ydHMgdW5zdXBwb3J0ZWQuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLmdldEFzc2V0RGVwZW5kZW5jaWVzKGEudXJsT3JVVUlELCBhLmRpcmVjdGlvbiksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdnZXRfdW51c2VkX2Fzc2V0cycsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdGaW5kIHVudXNlZCBhc3NldHMnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFVuc3VwcG9ydGVkIHVudXNlZC1hc3NldCBwbGFjZWhvbGRlcjsgYWx3YXlzIHJlcG9ydHMgdW5zdXBwb3J0ZWQuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBkaXJlY3Rvcnk6IHouc3RyaW5nKCkuZGVmYXVsdCgnZGI6Ly9hc3NldHMnKS5kZXNjcmliZSgnQXNzZXQtZGIgZGlyZWN0b3J5IHRvIHNjYW4uIEN1cnJlbnQgaW1wbGVtZW50YXRpb24gcmVwb3J0cyB1bnN1cHBvcnRlZC4nKSxcbiAgICAgICAgICAgICAgICAgICAgZXhjbHVkZURpcmVjdG9yaWVzOiB6LmFycmF5KHouc3RyaW5nKCkpLmRlZmF1bHQoW10pLmRlc2NyaWJlKCdEaXJlY3RvcmllcyB0byBleGNsdWRlIGZyb20gdGhlIHJlcXVlc3RlZCBzY2FuLiBDdXJyZW50IGltcGxlbWVudGF0aW9uIHJlcG9ydHMgdW5zdXBwb3J0ZWQuJyksXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgaGFuZGxlcjogYSA9PiB0aGlzLmdldFVudXNlZEFzc2V0cyhhLmRpcmVjdG9yeSwgYS5leGNsdWRlRGlyZWN0b3JpZXMpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnY29tcHJlc3NfdGV4dHVyZXMnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnQ29tcHJlc3MgdGV4dHVyZXMnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFVuc3VwcG9ydGVkIHRleHR1cmUtY29tcHJlc3Npb24gcGxhY2Vob2xkZXI7IGFsd2F5cyByZXBvcnRzIHVuc3VwcG9ydGVkLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgZGlyZWN0b3J5OiB6LnN0cmluZygpLmRlZmF1bHQoJ2RiOi8vYXNzZXRzJykuZGVzY3JpYmUoJ1RleHR1cmUgZGlyZWN0b3J5IHJlcXVlc3RlZCBmb3IgY29tcHJlc3Npb24uIEN1cnJlbnQgaW1wbGVtZW50YXRpb24gcmVwb3J0cyB1bnN1cHBvcnRlZC4nKSxcbiAgICAgICAgICAgICAgICAgICAgZm9ybWF0OiB6LmVudW0oWydhdXRvJywgJ2pwZycsICdwbmcnLCAnd2VicCddKS5kZWZhdWx0KCdhdXRvJykuZGVzY3JpYmUoJ1JlcXVlc3RlZCBvdXRwdXQgZm9ybWF0LiBDdXJyZW50IGltcGxlbWVudGF0aW9uIHJlcG9ydHMgdW5zdXBwb3J0ZWQuJyksXG4gICAgICAgICAgICAgICAgICAgIHF1YWxpdHk6IHoubnVtYmVyKCkubWluKDAuMSkubWF4KDEuMCkuZGVmYXVsdCgwLjgpLmRlc2NyaWJlKCdSZXF1ZXN0ZWQgY29tcHJlc3Npb24gcXVhbGl0eSBmcm9tIDAuMSB0byAxLjAuIEN1cnJlbnQgaW1wbGVtZW50YXRpb24gcmVwb3J0cyB1bnN1cHBvcnRlZC4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMuY29tcHJlc3NUZXh0dXJlcyhhLmRpcmVjdG9yeSwgYS5mb3JtYXQsIGEucXVhbGl0eSksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdleHBvcnRfYXNzZXRfbWFuaWZlc3QnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnRXhwb3J0IGFzc2V0IG1hbmlmZXN0JyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBSZXR1cm4gYXNzZXQgaW52ZW50b3J5IGZvciBhIGRpcmVjdG9yeSBhcyBqc29uL2Nzdi94bWwgdGV4dDsgZG9lcyBub3Qgd3JpdGUgYSBmaWxlLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgZGlyZWN0b3J5OiB6LnN0cmluZygpLmRlZmF1bHQoJ2RiOi8vYXNzZXRzJykuZGVzY3JpYmUoJ0Fzc2V0LWRiIGRpcmVjdG9yeSB0byBpbmNsdWRlIGluIHRoZSBtYW5pZmVzdC4gRGVmYXVsdCBkYjovL2Fzc2V0cy4nKSxcbiAgICAgICAgICAgICAgICAgICAgZm9ybWF0OiB6LmVudW0oWydqc29uJywgJ2NzdicsICd4bWwnXSkuZGVmYXVsdCgnanNvbicpLmRlc2NyaWJlKCdSZXR1cm5lZCBtYW5pZmVzdCBzZXJpYWxpemF0aW9uIGZvcm1hdC4nKSxcbiAgICAgICAgICAgICAgICAgICAgaW5jbHVkZU1ldGFkYXRhOiB6LmJvb2xlYW4oKS5kZWZhdWx0KHRydWUpLmRlc2NyaWJlKCdUcnkgdG8gaW5jbHVkZSBhc3NldCBtZXRhZGF0YSB3aGVuIGF2YWlsYWJsZS4nKSxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBoYW5kbGVyOiBhID0+IHRoaXMuZXhwb3J0QXNzZXRNYW5pZmVzdChhLmRpcmVjdG9yeSwgYS5mb3JtYXQsIGEuaW5jbHVkZU1ldGFkYXRhKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2dldF91c2VycycsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdGaW5kIGFzc2V0IHVzZXJzJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBGaW5kIHNjZW5lcy9wcmVmYWJzL3NjcmlwdHMgdGhhdCByZWZlcmVuY2UgYW4gYXNzZXQgYnkgVVVJRC4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0Fzc2V0IFVVSUQgdG8gZmluZCByZWZlcmVuY2VzIHRvLicpLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGhhbmRsZXI6IGEgPT4gdGhpcy5nZXRVc2VycyhhLnV1aWQpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgXTtcbiAgICAgICAgdGhpcy5leGVjID0gZGVmaW5lVG9vbHMoZGVmcyk7XG4gICAgfVxuXG4gICAgZ2V0VG9vbHMoKTogVG9vbERlZmluaXRpb25bXSB7IHJldHVybiB0aGlzLmV4ZWMuZ2V0VG9vbHMoKTsgfVxuICAgIGV4ZWN1dGUodG9vbE5hbWU6IHN0cmluZywgYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHsgcmV0dXJuIHRoaXMuZXhlYy5leGVjdXRlKHRvb2xOYW1lLCBhcmdzKTsgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBzYXZlQXNzZXRNZXRhKHVybE9yVVVJRDogc3RyaW5nLCBjb250ZW50OiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3NhdmUtYXNzZXQtbWV0YScsIHVybE9yVVVJRCwgY29udGVudCkudGhlbigocmVzdWx0OiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IHJlc3VsdD8udXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHVybDogcmVzdWx0Py51cmwsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiAnQXNzZXQgbWV0YSBzYXZlZCBzdWNjZXNzZnVsbHknXG4gICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnZW5lcmF0ZUF2YWlsYWJsZVVybCh1cmw6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAnZ2VuZXJhdGUtYXZhaWxhYmxlLXVybCcsIHVybCkudGhlbigoYXZhaWxhYmxlVXJsOiBzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG9yaWdpbmFsVXJsOiB1cmwsXG4gICAgICAgICAgICAgICAgICAgICAgICBhdmFpbGFibGVVcmw6IGF2YWlsYWJsZVVybCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGF2YWlsYWJsZVVybCA9PT0gdXJsID8gXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgJ1VSTCBpcyBhdmFpbGFibGUnIDogXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgJ0dlbmVyYXRlZCBuZXcgYXZhaWxhYmxlIFVSTCdcbiAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHF1ZXJ5QXNzZXREYlJlYWR5KCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktcmVhZHknKS50aGVuKChyZWFkeTogYm9vbGVhbikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVhZHk6IHJlYWR5LFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogcmVhZHkgPyAnQXNzZXQgZGF0YWJhc2UgaXMgcmVhZHknIDogJ0Fzc2V0IGRhdGFiYXNlIGlzIG5vdCByZWFkeSdcbiAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIG9wZW5Bc3NldEV4dGVybmFsKHVybE9yVVVJRDogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdvcGVuLWFzc2V0JywgdXJsT3JVVUlEKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHVuZGVmaW5lZCwgJ0Fzc2V0IG9wZW5lZCB3aXRoIGV4dGVybmFsIHByb2dyYW0nKSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgYmF0Y2hJbXBvcnRBc3NldHMoYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgZnMgPSByZXF1aXJlKCdmcycpO1xuICAgICAgICBjb25zdCBwYXRoID0gcmVxdWlyZSgncGF0aCcpO1xuICAgICAgICBcbiAgICAgICAgaWYgKCFmcy5leGlzdHNTeW5jKGFyZ3Muc291cmNlRGlyZWN0b3J5KSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ1NvdXJjZSBkaXJlY3RvcnkgZG9lcyBub3QgZXhpc3QnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGZpbGVzID0gdGhpcy5nZXRGaWxlc0Zyb21EaXJlY3RvcnkoXG4gICAgICAgICAgICBhcmdzLnNvdXJjZURpcmVjdG9yeSwgXG4gICAgICAgICAgICBhcmdzLmZpbGVGaWx0ZXIgfHwgW10sIFxuICAgICAgICAgICAgYXJncy5yZWN1cnNpdmUgfHwgZmFsc2VcbiAgICAgICAgKTtcblxuICAgICAgICBjb25zdCBpbXBvcnRSZXN1bHRzOiBhbnlbXSA9IFtdO1xuICAgICAgICBsZXQgc3VjY2Vzc0NvdW50ID0gMDtcbiAgICAgICAgbGV0IGVycm9yQ291bnQgPSAwO1xuXG4gICAgICAgIGZvciAoY29uc3QgZmlsZVBhdGggb2YgZmlsZXMpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZmlsZU5hbWUgPSBwYXRoLmJhc2VuYW1lKGZpbGVQYXRoKTtcbiAgICAgICAgICAgICAgICBjb25zdCB0YXJnZXRQYXRoID0gYCR7YXJncy50YXJnZXREaXJlY3Rvcnl9LyR7ZmlsZU5hbWV9YDtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdpbXBvcnQtYXNzZXQnLCBcbiAgICAgICAgICAgICAgICAgICAgZmlsZVBhdGgsIHRhcmdldFBhdGgsIHsgXG4gICAgICAgICAgICAgICAgICAgICAgICBvdmVyd3JpdGU6IGFyZ3Mub3ZlcndyaXRlIHx8IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgcmVuYW1lOiAhKGFyZ3Mub3ZlcndyaXRlIHx8IGZhbHNlKVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpbXBvcnRSZXN1bHRzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICBzb3VyY2U6IGZpbGVQYXRoLFxuICAgICAgICAgICAgICAgICAgICB0YXJnZXQ6IHRhcmdldFBhdGgsXG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIHV1aWQ6IHJlc3VsdD8udXVpZFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3NDb3VudCsrO1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgICAgICBpbXBvcnRSZXN1bHRzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICBzb3VyY2U6IGZpbGVQYXRoLFxuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGVyci5tZXNzYWdlXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgZXJyb3JDb3VudCsrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG9rKHtcbiAgICAgICAgICAgICAgICB0b3RhbEZpbGVzOiBmaWxlcy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgc3VjY2Vzc0NvdW50OiBzdWNjZXNzQ291bnQsXG4gICAgICAgICAgICAgICAgZXJyb3JDb3VudDogZXJyb3JDb3VudCxcbiAgICAgICAgICAgICAgICByZXN1bHRzOiBpbXBvcnRSZXN1bHRzLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBCYXRjaCBpbXBvcnQgY29tcGxldGVkOiAke3N1Y2Nlc3NDb3VudH0gc3VjY2VzcywgJHtlcnJvckNvdW50fSBlcnJvcnNgXG4gICAgICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGdldEZpbGVzRnJvbURpcmVjdG9yeShkaXJQYXRoOiBzdHJpbmcsIGZpbGVGaWx0ZXI6IHN0cmluZ1tdLCByZWN1cnNpdmU6IGJvb2xlYW4pOiBzdHJpbmdbXSB7XG4gICAgICAgIGNvbnN0IGZzID0gcmVxdWlyZSgnZnMnKTtcbiAgICAgICAgY29uc3QgcGF0aCA9IHJlcXVpcmUoJ3BhdGgnKTtcbiAgICAgICAgY29uc3QgZmlsZXM6IHN0cmluZ1tdID0gW107XG5cbiAgICAgICAgY29uc3QgaXRlbXMgPSBmcy5yZWFkZGlyU3luYyhkaXJQYXRoKTtcbiAgICAgICAgXG4gICAgICAgIGZvciAoY29uc3QgaXRlbSBvZiBpdGVtcykge1xuICAgICAgICAgICAgY29uc3QgZnVsbFBhdGggPSBwYXRoLmpvaW4oZGlyUGF0aCwgaXRlbSk7XG4gICAgICAgICAgICBjb25zdCBzdGF0ID0gZnMuc3RhdFN5bmMoZnVsbFBhdGgpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZiAoc3RhdC5pc0ZpbGUoKSkge1xuICAgICAgICAgICAgICAgIGlmIChmaWxlRmlsdGVyLmxlbmd0aCA9PT0gMCB8fCBmaWxlRmlsdGVyLnNvbWUoZXh0ID0+IGl0ZW0udG9Mb3dlckNhc2UoKS5lbmRzV2l0aChleHQudG9Mb3dlckNhc2UoKSkpKSB7XG4gICAgICAgICAgICAgICAgICAgIGZpbGVzLnB1c2goZnVsbFBhdGgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSBpZiAoc3RhdC5pc0RpcmVjdG9yeSgpICYmIHJlY3Vyc2l2ZSkge1xuICAgICAgICAgICAgICAgIGZpbGVzLnB1c2goLi4udGhpcy5nZXRGaWxlc0Zyb21EaXJlY3RvcnkoZnVsbFBhdGgsIGZpbGVGaWx0ZXIsIHJlY3Vyc2l2ZSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICByZXR1cm4gZmlsZXM7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBiYXRjaERlbGV0ZUFzc2V0cyh1cmxzOiBzdHJpbmdbXSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IGRlbGV0ZVJlc3VsdHM6IGFueVtdID0gW107XG4gICAgICAgIGxldCBzdWNjZXNzQ291bnQgPSAwO1xuICAgICAgICBsZXQgZXJyb3JDb3VudCA9IDA7XG5cbiAgICAgICAgZm9yIChjb25zdCB1cmwgb2YgdXJscykge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdkZWxldGUtYXNzZXQnLCB1cmwpO1xuICAgICAgICAgICAgICAgIGRlbGV0ZVJlc3VsdHMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgIHVybDogdXJsLFxuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgc3VjY2Vzc0NvdW50Kys7XG4gICAgICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgICAgIGRlbGV0ZVJlc3VsdHMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgIHVybDogdXJsLFxuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGVyci5tZXNzYWdlXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgZXJyb3JDb3VudCsrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG9rKHtcbiAgICAgICAgICAgICAgICB0b3RhbEFzc2V0czogdXJscy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgc3VjY2Vzc0NvdW50OiBzdWNjZXNzQ291bnQsXG4gICAgICAgICAgICAgICAgZXJyb3JDb3VudDogZXJyb3JDb3VudCxcbiAgICAgICAgICAgICAgICByZXN1bHRzOiBkZWxldGVSZXN1bHRzLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBCYXRjaCBkZWxldGUgY29tcGxldGVkOiAke3N1Y2Nlc3NDb3VudH0gc3VjY2VzcywgJHtlcnJvckNvdW50fSBlcnJvcnNgXG4gICAgICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHZhbGlkYXRlQXNzZXRSZWZlcmVuY2VzKGRpcmVjdG9yeTogc3RyaW5nID0gJ2RiOi8vYXNzZXRzJyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIC8vIEdldCBhbGwgYXNzZXRzIGluIGRpcmVjdG9yeVxuICAgICAgICBjb25zdCBhc3NldHMgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldHMnLCB7IHBhdHRlcm46IGAke2RpcmVjdG9yeX0vKiovKmAgfSk7XG4gICAgICAgIFxuICAgICAgICBjb25zdCBicm9rZW5SZWZlcmVuY2VzOiBhbnlbXSA9IFtdO1xuICAgICAgICBjb25zdCB2YWxpZFJlZmVyZW5jZXM6IGFueVtdID0gW107XG5cbiAgICAgICAgZm9yIChjb25zdCBhc3NldCBvZiBhc3NldHMpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgYXNzZXRJbmZvID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXQtaW5mbycsIGFzc2V0LnVybCk7XG4gICAgICAgICAgICAgICAgaWYgKGFzc2V0SW5mbykge1xuICAgICAgICAgICAgICAgICAgICB2YWxpZFJlZmVyZW5jZXMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgICAgICB1cmw6IGFzc2V0LnVybCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IGFzc2V0LnV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBuYW1lOiBhc3NldC5uYW1lXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgICAgIGJyb2tlblJlZmVyZW5jZXMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgIHVybDogYXNzZXQudXJsLFxuICAgICAgICAgICAgICAgICAgICB1dWlkOiBhc3NldC51dWlkLFxuICAgICAgICAgICAgICAgICAgICBuYW1lOiBhc3NldC5uYW1lLFxuICAgICAgICAgICAgICAgICAgICBlcnJvcjogKGVyciBhcyBFcnJvcikubWVzc2FnZVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG9rKHtcbiAgICAgICAgICAgICAgICBkaXJlY3Rvcnk6IGRpcmVjdG9yeSxcbiAgICAgICAgICAgICAgICB0b3RhbEFzc2V0czogYXNzZXRzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICB2YWxpZFJlZmVyZW5jZXM6IHZhbGlkUmVmZXJlbmNlcy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgYnJva2VuUmVmZXJlbmNlczogYnJva2VuUmVmZXJlbmNlcy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgYnJva2VuQXNzZXRzOiBicm9rZW5SZWZlcmVuY2VzLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBWYWxpZGF0aW9uIGNvbXBsZXRlZDogJHticm9rZW5SZWZlcmVuY2VzLmxlbmd0aH0gYnJva2VuIHJlZmVyZW5jZXMgZm91bmRgXG4gICAgICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldEFzc2V0RGVwZW5kZW5jaWVzKHVybE9yVVVJRDogc3RyaW5nLCBkaXJlY3Rpb246IHN0cmluZyA9ICdkZXBlbmRlbmNpZXMnKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICAvLyBOb3RlOiBUaGlzIHdvdWxkIHJlcXVpcmUgc2NlbmUgYW5hbHlzaXMgb3IgYWRkaXRpb25hbCBBUElzIG5vdCBhdmFpbGFibGUgaW4gY3VycmVudCBkb2N1bWVudGF0aW9uXG4gICAgICAgICAgICByZXNvbHZlKGZhaWwoJ0Fzc2V0IGRlcGVuZGVuY3kgYW5hbHlzaXMgcmVxdWlyZXMgYWRkaXRpb25hbCBBUElzIG5vdCBhdmFpbGFibGUgaW4gY3VycmVudCBDb2NvcyBDcmVhdG9yIE1DUCBpbXBsZW1lbnRhdGlvbi4gQ29uc2lkZXIgdXNpbmcgdGhlIEVkaXRvciBVSSBmb3IgZGVwZW5kZW5jeSBhbmFseXNpcy4nKSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2V0VW51c2VkQXNzZXRzKGRpcmVjdG9yeTogc3RyaW5nID0gJ2RiOi8vYXNzZXRzJywgZXhjbHVkZURpcmVjdG9yaWVzOiBzdHJpbmdbXSA9IFtdKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICAvLyBOb3RlOiBUaGlzIHdvdWxkIHJlcXVpcmUgY29tcHJlaGVuc2l2ZSBwcm9qZWN0IGFuYWx5c2lzXG4gICAgICAgICAgICByZXNvbHZlKGZhaWwoJ1VudXNlZCBhc3NldCBkZXRlY3Rpb24gcmVxdWlyZXMgY29tcHJlaGVuc2l2ZSBwcm9qZWN0IGFuYWx5c2lzIG5vdCBhdmFpbGFibGUgaW4gY3VycmVudCBDb2NvcyBDcmVhdG9yIE1DUCBpbXBsZW1lbnRhdGlvbi4gQ29uc2lkZXIgdXNpbmcgdGhlIEVkaXRvciBVSSBvciB0aGlyZC1wYXJ0eSB0b29scyBmb3IgdW51c2VkIGFzc2V0IGRldGVjdGlvbi4nKSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgY29tcHJlc3NUZXh0dXJlcyhkaXJlY3Rvcnk6IHN0cmluZyA9ICdkYjovL2Fzc2V0cycsIGZvcm1hdDogc3RyaW5nID0gJ2F1dG8nLCBxdWFsaXR5OiBudW1iZXIgPSAwLjgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIC8vIE5vdGU6IFRleHR1cmUgY29tcHJlc3Npb24gd291bGQgcmVxdWlyZSBpbWFnZSBwcm9jZXNzaW5nIEFQSXNcbiAgICAgICAgICAgIHJlc29sdmUoZmFpbCgnVGV4dHVyZSBjb21wcmVzc2lvbiByZXF1aXJlcyBpbWFnZSBwcm9jZXNzaW5nIGNhcGFiaWxpdGllcyBub3QgYXZhaWxhYmxlIGluIGN1cnJlbnQgQ29jb3MgQ3JlYXRvciBNQ1AgaW1wbGVtZW50YXRpb24uIFVzZSB0aGUgRWRpdG9yXFwncyBidWlsdC1pbiB0ZXh0dXJlIGNvbXByZXNzaW9uIHNldHRpbmdzIG9yIGV4dGVybmFsIHRvb2xzLicpKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBleHBvcnRBc3NldE1hbmlmZXN0KGRpcmVjdG9yeTogc3RyaW5nID0gJ2RiOi8vYXNzZXRzJywgZm9ybWF0OiBzdHJpbmcgPSAnanNvbicsIGluY2x1ZGVNZXRhZGF0YTogYm9vbGVhbiA9IHRydWUpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBhc3NldHMgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldHMnLCB7IHBhdHRlcm46IGAke2RpcmVjdG9yeX0vKiovKmAgfSk7XG4gICAgICAgIFxuICAgICAgICBjb25zdCBtYW5pZmVzdDogYW55W10gPSBbXTtcblxuICAgICAgICBmb3IgKGNvbnN0IGFzc2V0IG9mIGFzc2V0cykge1xuICAgICAgICAgICAgY29uc3QgbWFuaWZlc3RFbnRyeTogYW55ID0ge1xuICAgICAgICAgICAgICAgIG5hbWU6IGFzc2V0Lm5hbWUsXG4gICAgICAgICAgICAgICAgdXJsOiBhc3NldC51cmwsXG4gICAgICAgICAgICAgICAgdXVpZDogYXNzZXQudXVpZCxcbiAgICAgICAgICAgICAgICB0eXBlOiBhc3NldC50eXBlLFxuICAgICAgICAgICAgICAgIHNpemU6IChhc3NldCBhcyBhbnkpLnNpemUgfHwgMCxcbiAgICAgICAgICAgICAgICBpc0RpcmVjdG9yeTogYXNzZXQuaXNEaXJlY3RvcnkgfHwgZmFsc2VcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGlmIChpbmNsdWRlTWV0YWRhdGEpIHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBhc3NldEluZm8gPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldC1pbmZvJywgYXNzZXQudXJsKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGFzc2V0SW5mbyAmJiBhc3NldEluZm8ubWV0YSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgbWFuaWZlc3RFbnRyeS5tZXRhID0gYXNzZXRJbmZvLm1ldGE7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gU2tpcCBtZXRhZGF0YSBpZiBub3QgYXZhaWxhYmxlXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBtYW5pZmVzdC5wdXNoKG1hbmlmZXN0RW50cnkpO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IGV4cG9ydERhdGE6IHN0cmluZztcbiAgICAgICAgc3dpdGNoIChmb3JtYXQpIHtcbiAgICAgICAgICAgIGNhc2UgJ2pzb24nOlxuICAgICAgICAgICAgICAgIGV4cG9ydERhdGEgPSBKU09OLnN0cmluZ2lmeShtYW5pZmVzdCwgbnVsbCwgMik7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdjc3YnOlxuICAgICAgICAgICAgICAgIGV4cG9ydERhdGEgPSB0aGlzLmNvbnZlcnRUb0NTVihtYW5pZmVzdCk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICd4bWwnOlxuICAgICAgICAgICAgICAgIGV4cG9ydERhdGEgPSB0aGlzLmNvbnZlcnRUb1hNTChtYW5pZmVzdCk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIGV4cG9ydERhdGEgPSBKU09OLnN0cmluZ2lmeShtYW5pZmVzdCwgbnVsbCwgMik7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gb2soe1xuICAgICAgICAgICAgICAgIGRpcmVjdG9yeTogZGlyZWN0b3J5LFxuICAgICAgICAgICAgICAgIGZvcm1hdDogZm9ybWF0LFxuICAgICAgICAgICAgICAgIGFzc2V0Q291bnQ6IG1hbmlmZXN0Lmxlbmd0aCxcbiAgICAgICAgICAgICAgICBpbmNsdWRlTWV0YWRhdGE6IGluY2x1ZGVNZXRhZGF0YSxcbiAgICAgICAgICAgICAgICBtYW5pZmVzdDogZXhwb3J0RGF0YSxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiBgQXNzZXQgbWFuaWZlc3QgZXhwb3J0ZWQgd2l0aCAke21hbmlmZXN0Lmxlbmd0aH0gYXNzZXRzYFxuICAgICAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBjb252ZXJ0VG9DU1YoZGF0YTogYW55W10pOiBzdHJpbmcge1xuICAgICAgICBpZiAoZGF0YS5sZW5ndGggPT09IDApIHJldHVybiAnJztcbiAgICAgICAgXG4gICAgICAgIGNvbnN0IGhlYWRlcnMgPSBPYmplY3Qua2V5cyhkYXRhWzBdKTtcbiAgICAgICAgY29uc3QgY3N2Um93cyA9IFtoZWFkZXJzLmpvaW4oJywnKV07XG4gICAgICAgIFxuICAgICAgICBmb3IgKGNvbnN0IHJvdyBvZiBkYXRhKSB7XG4gICAgICAgICAgICBjb25zdCB2YWx1ZXMgPSBoZWFkZXJzLm1hcChoZWFkZXIgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHZhbHVlID0gcm93W2hlYWRlcl07XG4gICAgICAgICAgICAgICAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgPyBKU09OLnN0cmluZ2lmeSh2YWx1ZSkgOiBTdHJpbmcodmFsdWUpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBjc3ZSb3dzLnB1c2godmFsdWVzLmpvaW4oJywnKSk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHJldHVybiBjc3ZSb3dzLmpvaW4oJ1xcbicpO1xuICAgIH1cblxuICAgIHByaXZhdGUgY29udmVydFRvWE1MKGRhdGE6IGFueVtdKTogc3RyaW5nIHtcbiAgICAgICAgbGV0IHhtbCA9ICc8P3htbCB2ZXJzaW9uPVwiMS4wXCIgZW5jb2Rpbmc9XCJVVEYtOFwiPz5cXG48YXNzZXRzPlxcbic7XG4gICAgICAgIFxuICAgICAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgZGF0YSkge1xuICAgICAgICAgICAgeG1sICs9ICcgIDxhc3NldD5cXG4nO1xuICAgICAgICAgICAgZm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoaXRlbSkpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB4bWxWYWx1ZSA9IHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgPyBcbiAgICAgICAgICAgICAgICAgICAgSlNPTi5zdHJpbmdpZnkodmFsdWUpIDogXG4gICAgICAgICAgICAgICAgICAgIFN0cmluZyh2YWx1ZSkucmVwbGFjZSgvJi9nLCAnJmFtcDsnKS5yZXBsYWNlKC88L2csICcmbHQ7JykucmVwbGFjZSgvPi9nLCAnJmd0OycpO1xuICAgICAgICAgICAgICAgIHhtbCArPSBgICAgIDwke2tleX0+JHt4bWxWYWx1ZX08LyR7a2V5fT5cXG5gO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgeG1sICs9ICcgIDwvYXNzZXQ+XFxuJztcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgeG1sICs9ICc8L2Fzc2V0cz4nO1xuICAgICAgICByZXR1cm4geG1sO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2V0VXNlcnModGFyZ2V0VXVpZDogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3Qgc2NlbmVzID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXRzJywgeyBwYXR0ZXJuOiAnZGI6Ly9hc3NldHMvKionLCBjY1R5cGU6ICdjYy5TY2VuZUFzc2V0JyB9KTtcbiAgICAgICAgY29uc3QgcHJlZmFicyA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0cycsIHsgcGF0dGVybjogJ2RiOi8vYXNzZXRzLyoqJywgY2NUeXBlOiAnY2MuUHJlZmFiJyB9KTtcbiAgICAgICAgY29uc3Qgc2NyaXB0c1RzID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXRzJywgeyBwYXR0ZXJuOiAnZGI6Ly9hc3NldHMvKiovKi50cycgfSk7XG4gICAgICAgIGNvbnN0IHNjcmlwdHNKcyA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0cycsIHsgcGF0dGVybjogJ2RiOi8vYXNzZXRzLyoqLyouanMnIH0pO1xuICAgICAgICBcbiAgICAgICAgY29uc3QgYWxsQXNzZXRzID0gWy4uLnNjZW5lcywgLi4ucHJlZmFicywgLi4uc2NyaXB0c1RzLCAuLi5zY3JpcHRzSnNdO1xuICAgICAgICBjb25zdCB1bmlxdWVBc3NldHMgPSBBcnJheS5mcm9tKG5ldyBNYXAoYWxsQXNzZXRzLm1hcCgoYTogYW55KSA9PiBbYS51dWlkLCBhXSkpLnZhbHVlcygpKTtcblxuICAgICAgICBjb25zdCB1c2VyczogYW55W10gPSBbXTtcbiAgICAgICAgZm9yIChjb25zdCBhc3NldCBvZiB1bmlxdWVBc3NldHMpIHtcbiAgICAgICAgICAgIGNvbnN0IGRlcHMgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldC1kZXBlbmRzJywgYXNzZXQudXVpZCk7XG4gICAgICAgICAgICBpZiAoZGVwcyAmJiBkZXBzLmluY2x1ZGVzKHRhcmdldFV1aWQpKSB7XG4gICAgICAgICAgICAgICAgbGV0IHR5cGUgPSAnc2NyaXB0JztcbiAgICAgICAgICAgICAgICBpZiAoYXNzZXQudHlwZSA9PT0gJ2NjLlNjZW5lQXNzZXQnKSB0eXBlID0gJ3NjZW5lJztcbiAgICAgICAgICAgICAgICBlbHNlIGlmIChhc3NldC50eXBlID09PSAnY2MuUHJlZmFiJykgdHlwZSA9ICdwcmVmYWInO1xuICAgICAgICAgICAgICAgIHVzZXJzLnB1c2goeyB0eXBlLCB1dWlkOiBhc3NldC51dWlkLCBwYXRoOiBhc3NldC51cmwsIG5hbWU6IGFzc2V0Lm5hbWUgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHJldHVybiBvayh7IHV1aWQ6IHRhcmdldFV1aWQsIHVzZXJzLCB0b3RhbDogdXNlcnMubGVuZ3RoIH0pO1xuICAgIH1cbn1cbiJdfQ==