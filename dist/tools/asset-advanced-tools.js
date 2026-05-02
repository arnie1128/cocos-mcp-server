"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssetAdvancedTools = void 0;
const response_1 = require("../lib/response");
const schema_1 = require("../lib/schema");
const decorators_1 = require("../lib/decorators");
const asset_advanced_docs_1 = require("../data/asset-advanced-docs");
class AssetAdvancedTools {
    constructor() {
        this.exec = (0, decorators_1.defineToolsFromDecorators)(this);
    }
    getTools() { return this.exec.getTools(); }
    execute(toolName, args) { return this.exec.execute(toolName, args); }
    async saveAssetMeta(args) {
        return this.saveAssetMetaImpl(args.urlOrUUID, args.content);
    }
    async generateAvailableUrl(args) {
        return this.generateAvailableUrlImpl(args.url);
    }
    async queryAssetDbReady() {
        return this.queryAssetDbReadyImpl();
    }
    async openAssetExternal(args) {
        return this.openAssetExternalImpl(args.urlOrUUID);
    }
    async batchImportAssets(args) {
        return this.batchImportAssetsImpl(args);
    }
    async batchDeleteAssets(args) {
        return this.batchDeleteAssetsImpl(args.urls);
    }
    async validateAssetReferences(args) {
        return this.validateAssetReferencesImpl(args.directory);
    }
    async getAssetDependencies(args) {
        return this.getAssetDependenciesImpl(args.urlOrUUID, args.direction);
    }
    async getUnusedAssets(args) {
        return this.getUnusedAssetsImpl(args.directory, args.excludeDirectories);
    }
    async compressTextures(args) {
        return this.compressTexturesImpl(args.directory, args.format, args.quality);
    }
    async exportAssetManifest(args) {
        return this.exportAssetManifestImpl(args.directory, args.format, args.includeMetadata);
    }
    async getUsers(args) {
        return this.getUsersImpl(args.uuid);
    }
    async saveAssetMetaImpl(urlOrUUID, content) {
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
    async generateAvailableUrlImpl(url) {
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
    async queryAssetDbReadyImpl() {
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
    async openAssetExternalImpl(urlOrUUID) {
        return new Promise((resolve) => {
            Editor.Message.request('asset-db', 'open-asset', urlOrUUID).then(() => {
                resolve((0, response_1.ok)(undefined, 'Asset opened with external program'));
            }).catch((err) => {
                resolve((0, response_1.fail)(err.message));
            });
        });
    }
    async batchImportAssetsImpl(args) {
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
    async batchDeleteAssetsImpl(urls) {
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
    async validateAssetReferencesImpl(directory = 'db://assets') {
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
    async getAssetDependenciesImpl(urlOrUUID, direction = 'dependencies') {
        return new Promise((resolve) => {
            // Note: This would require scene analysis or additional APIs not available in current documentation
            resolve((0, response_1.fail)('Asset dependency analysis requires additional APIs not available in current Cocos Creator MCP implementation. Consider using the Editor UI for dependency analysis.'));
        });
    }
    async getUnusedAssetsImpl(directory = 'db://assets', excludeDirectories = []) {
        return new Promise((resolve) => {
            // Note: This would require comprehensive project analysis
            resolve((0, response_1.fail)('Unused asset detection requires comprehensive project analysis not available in current Cocos Creator MCP implementation. Consider using the Editor UI or third-party tools for unused asset detection.'));
        });
    }
    async compressTexturesImpl(directory = 'db://assets', format = 'auto', quality = 0.8) {
        return new Promise((resolve) => {
            // Note: Texture compression would require image processing APIs
            resolve((0, response_1.fail)('Texture compression requires image processing capabilities not available in current Cocos Creator MCP implementation. Use the Editor\'s built-in texture compression settings or external tools.'));
        });
    }
    async exportAssetManifestImpl(directory = 'db://assets', format = 'json', includeMetadata = true) {
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
    async getUsersImpl(targetUuid) {
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
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'save_asset_meta',
        title: 'Save asset meta',
        description: asset_advanced_docs_1.ASSET_ADVANCED_DOCS.save_asset_meta,
        inputSchema: schema_1.z.object({
            urlOrUUID: schema_1.z.string().describe('Asset db:// URL or UUID whose .meta content should be saved.'),
            content: schema_1.z.string().describe('Serialized asset meta content string to write.'),
        }),
    })
], AssetAdvancedTools.prototype, "saveAssetMeta", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'generate_available_url',
        title: 'Generate asset URL',
        description: asset_advanced_docs_1.ASSET_ADVANCED_DOCS.generate_available_url,
        inputSchema: schema_1.z.object({
            url: schema_1.z.string().describe('Desired asset db:// URL to test for collision and adjust if needed.'),
        }),
    })
], AssetAdvancedTools.prototype, "generateAvailableUrl", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'query_asset_db_ready',
        title: 'Check asset-db readiness',
        description: asset_advanced_docs_1.ASSET_ADVANCED_DOCS.query_asset_db_ready,
        inputSchema: schema_1.z.object({}),
    })
], AssetAdvancedTools.prototype, "queryAssetDbReady", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'open_asset_external',
        title: 'Open asset externally',
        description: asset_advanced_docs_1.ASSET_ADVANCED_DOCS.open_asset_external,
        inputSchema: schema_1.z.object({
            urlOrUUID: schema_1.z.string().describe('Asset db:// URL or UUID to open with the OS/editor associated external program.'),
        }),
    })
], AssetAdvancedTools.prototype, "openAssetExternal", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'batch_import_assets',
        title: 'Import assets in batch',
        description: asset_advanced_docs_1.ASSET_ADVANCED_DOCS.batch_import_assets,
        inputSchema: schema_1.z.object({
            sourceDirectory: schema_1.z.string().describe('Absolute source directory on disk to scan for import files.'),
            targetDirectory: schema_1.z.string().describe('Target asset-db directory URL, e.g. db://assets/textures.'),
            fileFilter: schema_1.z.array(schema_1.z.string()).default([]).describe('Allowed file extensions, e.g. [".png",".jpg"]. Empty means all files.'),
            recursive: schema_1.z.boolean().default(false).describe('Include files from subdirectories.'),
            overwrite: schema_1.z.boolean().default(false).describe('Overwrite existing target assets instead of auto-renaming.'),
        }),
    })
], AssetAdvancedTools.prototype, "batchImportAssets", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'batch_delete_assets',
        title: 'Delete assets in batch',
        description: asset_advanced_docs_1.ASSET_ADVANCED_DOCS.batch_delete_assets,
        inputSchema: schema_1.z.object({
            urls: schema_1.z.array(schema_1.z.string()).describe('Asset db:// URLs to delete. Each URL is attempted independently.'),
        }),
    })
], AssetAdvancedTools.prototype, "batchDeleteAssets", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'validate_asset_references',
        title: 'Validate asset references',
        description: asset_advanced_docs_1.ASSET_ADVANCED_DOCS.validate_asset_references,
        inputSchema: schema_1.z.object({
            directory: schema_1.z.string().default('db://assets').describe('Asset-db directory to scan. Default db://assets.'),
        }),
    })
], AssetAdvancedTools.prototype, "validateAssetReferences", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'get_asset_dependencies',
        title: 'Read asset dependencies',
        description: asset_advanced_docs_1.ASSET_ADVANCED_DOCS.get_asset_dependencies,
        inputSchema: schema_1.z.object({
            urlOrUUID: schema_1.z.string().describe('Asset URL or UUID for dependency analysis. Current implementation reports unsupported.'),
            direction: schema_1.z.enum(['dependents', 'dependencies', 'both']).default('dependencies').describe('Dependency direction requested. Current implementation reports unsupported.'),
        }),
    })
], AssetAdvancedTools.prototype, "getAssetDependencies", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'get_unused_assets',
        title: 'Find unused assets',
        description: asset_advanced_docs_1.ASSET_ADVANCED_DOCS.get_unused_assets,
        inputSchema: schema_1.z.object({
            directory: schema_1.z.string().default('db://assets').describe('Asset-db directory to scan. Current implementation reports unsupported.'),
            excludeDirectories: schema_1.z.array(schema_1.z.string()).default([]).describe('Directories to exclude from the requested scan. Current implementation reports unsupported.'),
        }),
    })
], AssetAdvancedTools.prototype, "getUnusedAssets", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'compress_textures',
        title: 'Compress textures',
        description: asset_advanced_docs_1.ASSET_ADVANCED_DOCS.compress_textures,
        inputSchema: schema_1.z.object({
            directory: schema_1.z.string().default('db://assets').describe('Texture directory requested for compression. Current implementation reports unsupported.'),
            format: schema_1.z.enum(['auto', 'jpg', 'png', 'webp']).default('auto').describe('Requested output format. Current implementation reports unsupported.'),
            quality: schema_1.z.number().min(0.1).max(1.0).default(0.8).describe('Requested compression quality from 0.1 to 1.0. Current implementation reports unsupported.'),
        }),
    })
], AssetAdvancedTools.prototype, "compressTextures", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'export_asset_manifest',
        title: 'Export asset manifest',
        description: asset_advanced_docs_1.ASSET_ADVANCED_DOCS.export_asset_manifest,
        inputSchema: schema_1.z.object({
            directory: schema_1.z.string().default('db://assets').describe('Asset-db directory to include in the manifest. Default db://assets.'),
            format: schema_1.z.enum(['json', 'csv', 'xml']).default('json').describe('Returned manifest serialization format.'),
            includeMetadata: schema_1.z.boolean().default(true).describe('Try to include asset metadata when available.'),
        }),
    })
], AssetAdvancedTools.prototype, "exportAssetManifest", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'get_users',
        title: 'Find asset users',
        description: asset_advanced_docs_1.ASSET_ADVANCED_DOCS.get_users,
        inputSchema: schema_1.z.object({
            uuid: schema_1.z.string().describe('Asset UUID to find references to.'),
        }),
    })
], AssetAdvancedTools.prototype, "getUsers", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXNzZXQtYWR2YW5jZWQtdG9vbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvdG9vbHMvYXNzZXQtYWR2YW5jZWQtdG9vbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7O0FBQUEsOENBQTJDO0FBRTNDLDBDQUFrQztBQUNsQyxrREFBdUU7QUFDdkUscUVBQWtFO0FBRWxFLE1BQWEsa0JBQWtCO0lBRzNCO1FBQ0ksSUFBSSxDQUFDLElBQUksR0FBRyxJQUFBLHNDQUF5QixFQUFDLElBQUksQ0FBQyxDQUFDO0lBQ2hELENBQUM7SUFFRCxRQUFRLEtBQXVCLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDN0QsT0FBTyxDQUFDLFFBQWdCLEVBQUUsSUFBUyxJQUEyQixPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFXbkcsQUFBTixLQUFLLENBQUMsYUFBYSxDQUFDLElBQTRDO1FBQzVELE9BQU8sSUFBSSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ2hFLENBQUM7SUFVSyxBQUFOLEtBQUssQ0FBQyxvQkFBb0IsQ0FBQyxJQUFxQjtRQUM1QyxPQUFPLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDbkQsQ0FBQztJQVFLLEFBQU4sS0FBSyxDQUFDLGlCQUFpQjtRQUNuQixPQUFPLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO0lBQ3hDLENBQUM7SUFVSyxBQUFOLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxJQUEyQjtRQUMvQyxPQUFPLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDdEQsQ0FBQztJQWNLLEFBQU4sS0FBSyxD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QUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxRQUFRLENBQUMseUNBQXlDLENBQUM7WUFDMUcsZUFBZSxFQUFFLFVBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsUUFBUSxDQUFDLCtDQUErQyxDQUFDO1NBQ3ZHLENBQUM7S0FDTCxDQUFDOzZEQUdEO0FBVUs7SUFSTCxJQUFBLG9CQUFPLEVBQUM7UUFDTCxJQUFJLEVBQUUsV0FBVztRQUNqQixLQUFLLEVBQUUsa0JBQWtCO1FBQ3pCLFdBQVcsRUFBRSx5Q0FBbUIsQ0FBQyxTQUFTO1FBQzFDLFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDO1lBQ2xCLElBQUksRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLG1DQUFtQyxDQUFDO1NBQ2pFLENBQUM7S0FDTCxDQUFDO2tEQUdEIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgb2ssIGZhaWwgfSBmcm9tICcuLi9saWIvcmVzcG9uc2UnO1xuaW1wb3J0IHR5cGUgeyBUb29sRGVmaW5pdGlvbiwgVG9vbFJlc3BvbnNlLCBUb29sRXhlY3V0b3IgfSBmcm9tICcuLi90eXBlcyc7XG5pbXBvcnQgeyB6IH0gZnJvbSAnLi4vbGliL3NjaGVtYSc7XG5pbXBvcnQgeyBtY3BUb29sLCBkZWZpbmVUb29sc0Zyb21EZWNvcmF0b3JzIH0gZnJvbSAnLi4vbGliL2RlY29yYXRvcnMnO1xuaW1wb3J0IHsgQVNTRVRfQURWQU5DRURfRE9DUyB9IGZyb20gJy4uL2RhdGEvYXNzZXQtYWR2YW5jZWQtZG9jcyc7XG5cbmV4cG9ydCBjbGFzcyBBc3NldEFkdmFuY2VkVG9vbHMgaW1wbGVtZW50cyBUb29sRXhlY3V0b3Ige1xuICAgIHByaXZhdGUgcmVhZG9ubHkgZXhlYzogVG9vbEV4ZWN1dG9yO1xuXG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHRoaXMuZXhlYyA9IGRlZmluZVRvb2xzRnJvbURlY29yYXRvcnModGhpcyk7XG4gICAgfVxuXG4gICAgZ2V0VG9vbHMoKTogVG9vbERlZmluaXRpb25bXSB7IHJldHVybiB0aGlzLmV4ZWMuZ2V0VG9vbHMoKTsgfVxuICAgIGV4ZWN1dGUodG9vbE5hbWU6IHN0cmluZywgYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHsgcmV0dXJuIHRoaXMuZXhlYy5leGVjdXRlKHRvb2xOYW1lLCBhcmdzKTsgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnc2F2ZV9hc3NldF9tZXRhJyxcbiAgICAgICAgdGl0bGU6ICdTYXZlIGFzc2V0IG1ldGEnLFxuICAgICAgICBkZXNjcmlwdGlvbjogQVNTRVRfQURWQU5DRURfRE9DUy5zYXZlX2Fzc2V0X21ldGEsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICB1cmxPclVVSUQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0Fzc2V0IGRiOi8vIFVSTCBvciBVVUlEIHdob3NlIC5tZXRhIGNvbnRlbnQgc2hvdWxkIGJlIHNhdmVkLicpLFxuICAgICAgICAgICAgY29udGVudDogei5zdHJpbmcoKS5kZXNjcmliZSgnU2VyaWFsaXplZCBhc3NldCBtZXRhIGNvbnRlbnQgc3RyaW5nIHRvIHdyaXRlLicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIHNhdmVBc3NldE1ldGEoYXJnczogeyB1cmxPclVVSUQ6IHN0cmluZzsgY29udGVudDogc3RyaW5nIH0pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5zYXZlQXNzZXRNZXRhSW1wbChhcmdzLnVybE9yVVVJRCwgYXJncy5jb250ZW50KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdnZW5lcmF0ZV9hdmFpbGFibGVfdXJsJyxcbiAgICAgICAgdGl0bGU6ICdHZW5lcmF0ZSBhc3NldCBVUkwnLFxuICAgICAgICBkZXNjcmlwdGlvbjogQVNTRVRfQURWQU5DRURfRE9DUy5nZW5lcmF0ZV9hdmFpbGFibGVfdXJsLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgdXJsOiB6LnN0cmluZygpLmRlc2NyaWJlKCdEZXNpcmVkIGFzc2V0IGRiOi8vIFVSTCB0byB0ZXN0IGZvciBjb2xsaXNpb24gYW5kIGFkanVzdCBpZiBuZWVkZWQuJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgZ2VuZXJhdGVBdmFpbGFibGVVcmwoYXJnczogeyB1cmw6IHN0cmluZyB9KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2VuZXJhdGVBdmFpbGFibGVVcmxJbXBsKGFyZ3MudXJsKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdxdWVyeV9hc3NldF9kYl9yZWFkeScsXG4gICAgICAgIHRpdGxlOiAnQ2hlY2sgYXNzZXQtZGIgcmVhZGluZXNzJyxcbiAgICAgICAgZGVzY3JpcHRpb246IEFTU0VUX0FEVkFOQ0VEX0RPQ1MucXVlcnlfYXNzZXRfZGJfcmVhZHksXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7fSksXG4gICAgfSlcbiAgICBhc3luYyBxdWVyeUFzc2V0RGJSZWFkeSgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5xdWVyeUFzc2V0RGJSZWFkeUltcGwoKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdvcGVuX2Fzc2V0X2V4dGVybmFsJyxcbiAgICAgICAgdGl0bGU6ICdPcGVuIGFzc2V0IGV4dGVybmFsbHknLFxuICAgICAgICBkZXNjcmlwdGlvbjogQVNTRVRfQURWQU5DRURfRE9DUy5vcGVuX2Fzc2V0X2V4dGVybmFsLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgdXJsT3JVVUlEOiB6LnN0cmluZygpLmRlc2NyaWJlKCdBc3NldCBkYjovLyBVUkwgb3IgVVVJRCB0byBvcGVuIHdpdGggdGhlIE9TL2VkaXRvciBhc3NvY2lhdGVkIGV4dGVybmFsIHByb2dyYW0uJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgb3BlbkFzc2V0RXh0ZXJuYWwoYXJnczogeyB1cmxPclVVSUQ6IHN0cmluZyB9KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMub3BlbkFzc2V0RXh0ZXJuYWxJbXBsKGFyZ3MudXJsT3JVVUlEKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdiYXRjaF9pbXBvcnRfYXNzZXRzJyxcbiAgICAgICAgdGl0bGU6ICdJbXBvcnQgYXNzZXRzIGluIGJhdGNoJyxcbiAgICAgICAgZGVzY3JpcHRpb246IEFTU0VUX0FEVkFOQ0VEX0RPQ1MuYmF0Y2hfaW1wb3J0X2Fzc2V0cyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIHNvdXJjZURpcmVjdG9yeTogei5zdHJpbmcoKS5kZXNjcmliZSgnQWJzb2x1dGUgc291cmNlIGRpcmVjdG9yeSBvbiBkaXNrIHRvIHNjYW4gZm9yIGltcG9ydCBmaWxlcy4nKSxcbiAgICAgICAgICAgIHRhcmdldERpcmVjdG9yeTogei5zdHJpbmcoKS5kZXNjcmliZSgnVGFyZ2V0IGFzc2V0LWRiIGRpcmVjdG9yeSBVUkwsIGUuZy4gZGI6Ly9hc3NldHMvdGV4dHVyZXMuJyksXG4gICAgICAgICAgICBmaWxlRmlsdGVyOiB6LmFycmF5KHouc3RyaW5nKCkpLmRlZmF1bHQoW10pLmRlc2NyaWJlKCdBbGxvd2VkIGZpbGUgZXh0ZW5zaW9ucywgZS5nLiBbXCIucG5nXCIsXCIuanBnXCJdLiBFbXB0eSBtZWFucyBhbGwgZmlsZXMuJyksXG4gICAgICAgICAgICByZWN1cnNpdmU6IHouYm9vbGVhbigpLmRlZmF1bHQoZmFsc2UpLmRlc2NyaWJlKCdJbmNsdWRlIGZpbGVzIGZyb20gc3ViZGlyZWN0b3JpZXMuJyksXG4gICAgICAgICAgICBvdmVyd3JpdGU6IHouYm9vbGVhbigpLmRlZmF1bHQoZmFsc2UpLmRlc2NyaWJlKCdPdmVyd3JpdGUgZXhpc3RpbmcgdGFyZ2V0IGFzc2V0cyBpbnN0ZWFkIG9mIGF1dG8tcmVuYW1pbmcuJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgYmF0Y2hJbXBvcnRBc3NldHMoYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuYmF0Y2hJbXBvcnRBc3NldHNJbXBsKGFyZ3MpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ2JhdGNoX2RlbGV0ZV9hc3NldHMnLFxuICAgICAgICB0aXRsZTogJ0RlbGV0ZSBhc3NldHMgaW4gYmF0Y2gnLFxuICAgICAgICBkZXNjcmlwdGlvbjogQVNTRVRfQURWQU5DRURfRE9DUy5iYXRjaF9kZWxldGVfYXNzZXRzLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgdXJsczogei5hcnJheSh6LnN0cmluZygpKS5kZXNjcmliZSgnQXNzZXQgZGI6Ly8gVVJMcyB0byBkZWxldGUuIEVhY2ggVVJMIGlzIGF0dGVtcHRlZCBpbmRlcGVuZGVudGx5LicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIGJhdGNoRGVsZXRlQXNzZXRzKGFyZ3M6IHsgdXJsczogc3RyaW5nW10gfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLmJhdGNoRGVsZXRlQXNzZXRzSW1wbChhcmdzLnVybHMpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ3ZhbGlkYXRlX2Fzc2V0X3JlZmVyZW5jZXMnLFxuICAgICAgICB0aXRsZTogJ1ZhbGlkYXRlIGFzc2V0IHJlZmVyZW5jZXMnLFxuICAgICAgICBkZXNjcmlwdGlvbjogQVNTRVRfQURWQU5DRURfRE9DUy52YWxpZGF0ZV9hc3NldF9yZWZlcmVuY2VzLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgZGlyZWN0b3J5OiB6LnN0cmluZygpLmRlZmF1bHQoJ2RiOi8vYXNzZXRzJykuZGVzY3JpYmUoJ0Fzc2V0LWRiIGRpcmVjdG9yeSB0byBzY2FuLiBEZWZhdWx0IGRiOi8vYXNzZXRzLicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIHZhbGlkYXRlQXNzZXRSZWZlcmVuY2VzKGFyZ3M6IHsgZGlyZWN0b3J5Pzogc3RyaW5nIH0pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy52YWxpZGF0ZUFzc2V0UmVmZXJlbmNlc0ltcGwoYXJncy5kaXJlY3RvcnkpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ2dldF9hc3NldF9kZXBlbmRlbmNpZXMnLFxuICAgICAgICB0aXRsZTogJ1JlYWQgYXNzZXQgZGVwZW5kZW5jaWVzJyxcbiAgICAgICAgZGVzY3JpcHRpb246IEFTU0VUX0FEVkFOQ0VEX0RPQ1MuZ2V0X2Fzc2V0X2RlcGVuZGVuY2llcyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIHVybE9yVVVJRDogei5zdHJpbmcoKS5kZXNjcmliZSgnQXNzZXQgVVJMIG9yIFVVSUQgZm9yIGRlcGVuZGVuY3kgYW5hbHlzaXMuIEN1cnJlbnQgaW1wbGVtZW50YXRpb24gcmVwb3J0cyB1bnN1cHBvcnRlZC4nKSxcbiAgICAgICAgICAgIGRpcmVjdGlvbjogei5lbnVtKFsnZGVwZW5kZW50cycsICdkZXBlbmRlbmNpZXMnLCAnYm90aCddKS5kZWZhdWx0KCdkZXBlbmRlbmNpZXMnKS5kZXNjcmliZSgnRGVwZW5kZW5jeSBkaXJlY3Rpb24gcmVxdWVzdGVkLiBDdXJyZW50IGltcGxlbWVudGF0aW9uIHJlcG9ydHMgdW5zdXBwb3J0ZWQuJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgZ2V0QXNzZXREZXBlbmRlbmNpZXMoYXJnczogeyB1cmxPclVVSUQ6IHN0cmluZzsgZGlyZWN0aW9uPzogc3RyaW5nIH0pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRBc3NldERlcGVuZGVuY2llc0ltcGwoYXJncy51cmxPclVVSUQsIGFyZ3MuZGlyZWN0aW9uKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdnZXRfdW51c2VkX2Fzc2V0cycsXG4gICAgICAgIHRpdGxlOiAnRmluZCB1bnVzZWQgYXNzZXRzJyxcbiAgICAgICAgZGVzY3JpcHRpb246IEFTU0VUX0FEVkFOQ0VEX0RPQ1MuZ2V0X3VudXNlZF9hc3NldHMsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICBkaXJlY3Rvcnk6IHouc3RyaW5nKCkuZGVmYXVsdCgnZGI6Ly9hc3NldHMnKS5kZXNjcmliZSgnQXNzZXQtZGIgZGlyZWN0b3J5IHRvIHNjYW4uIEN1cnJlbnQgaW1wbGVtZW50YXRpb24gcmVwb3J0cyB1bnN1cHBvcnRlZC4nKSxcbiAgICAgICAgICAgIGV4Y2x1ZGVEaXJlY3Rvcmllczogei5hcnJheSh6LnN0cmluZygpKS5kZWZhdWx0KFtdKS5kZXNjcmliZSgnRGlyZWN0b3JpZXMgdG8gZXhjbHVkZSBmcm9tIHRoZSByZXF1ZXN0ZWQgc2Nhbi4gQ3VycmVudCBpbXBsZW1lbnRhdGlvbiByZXBvcnRzIHVuc3VwcG9ydGVkLicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIGdldFVudXNlZEFzc2V0cyhhcmdzOiB7IGRpcmVjdG9yeT86IHN0cmluZzsgZXhjbHVkZURpcmVjdG9yaWVzPzogc3RyaW5nW10gfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldFVudXNlZEFzc2V0c0ltcGwoYXJncy5kaXJlY3RvcnksIGFyZ3MuZXhjbHVkZURpcmVjdG9yaWVzKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdjb21wcmVzc190ZXh0dXJlcycsXG4gICAgICAgIHRpdGxlOiAnQ29tcHJlc3MgdGV4dHVyZXMnLFxuICAgICAgICBkZXNjcmlwdGlvbjogQVNTRVRfQURWQU5DRURfRE9DUy5jb21wcmVzc190ZXh0dXJlcyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIGRpcmVjdG9yeTogei5zdHJpbmcoKS5kZWZhdWx0KCdkYjovL2Fzc2V0cycpLmRlc2NyaWJlKCdUZXh0dXJlIGRpcmVjdG9yeSByZXF1ZXN0ZWQgZm9yIGNvbXByZXNzaW9uLiBDdXJyZW50IGltcGxlbWVudGF0aW9uIHJlcG9ydHMgdW5zdXBwb3J0ZWQuJyksXG4gICAgICAgICAgICBmb3JtYXQ6IHouZW51bShbJ2F1dG8nLCAnanBnJywgJ3BuZycsICd3ZWJwJ10pLmRlZmF1bHQoJ2F1dG8nKS5kZXNjcmliZSgnUmVxdWVzdGVkIG91dHB1dCBmb3JtYXQuIEN1cnJlbnQgaW1wbGVtZW50YXRpb24gcmVwb3J0cyB1bnN1cHBvcnRlZC4nKSxcbiAgICAgICAgICAgIHF1YWxpdHk6IHoubnVtYmVyKCkubWluKDAuMSkubWF4KDEuMCkuZGVmYXVsdCgwLjgpLmRlc2NyaWJlKCdSZXF1ZXN0ZWQgY29tcHJlc3Npb24gcXVhbGl0eSBmcm9tIDAuMSB0byAxLjAuIEN1cnJlbnQgaW1wbGVtZW50YXRpb24gcmVwb3J0cyB1bnN1cHBvcnRlZC4nKSxcbiAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBjb21wcmVzc1RleHR1cmVzKGFyZ3M6IHsgZGlyZWN0b3J5Pzogc3RyaW5nOyBmb3JtYXQ/OiBzdHJpbmc7IHF1YWxpdHk/OiBudW1iZXIgfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLmNvbXByZXNzVGV4dHVyZXNJbXBsKGFyZ3MuZGlyZWN0b3J5LCBhcmdzLmZvcm1hdCwgYXJncy5xdWFsaXR5KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdleHBvcnRfYXNzZXRfbWFuaWZlc3QnLFxuICAgICAgICB0aXRsZTogJ0V4cG9ydCBhc3NldCBtYW5pZmVzdCcsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBBU1NFVF9BRFZBTkNFRF9ET0NTLmV4cG9ydF9hc3NldF9tYW5pZmVzdCxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIGRpcmVjdG9yeTogei5zdHJpbmcoKS5kZWZhdWx0KCdkYjovL2Fzc2V0cycpLmRlc2NyaWJlKCdBc3NldC1kYiBkaXJlY3RvcnkgdG8gaW5jbHVkZSBpbiB0aGUgbWFuaWZlc3QuIERlZmF1bHQgZGI6Ly9hc3NldHMuJyksXG4gICAgICAgICAgICBmb3JtYXQ6IHouZW51bShbJ2pzb24nLCAnY3N2JywgJ3htbCddKS5kZWZhdWx0KCdqc29uJykuZGVzY3JpYmUoJ1JldHVybmVkIG1hbmlmZXN0IHNlcmlhbGl6YXRpb24gZm9ybWF0LicpLFxuICAgICAgICAgICAgaW5jbHVkZU1ldGFkYXRhOiB6LmJvb2xlYW4oKS5kZWZhdWx0KHRydWUpLmRlc2NyaWJlKCdUcnkgdG8gaW5jbHVkZSBhc3NldCBtZXRhZGF0YSB3aGVuIGF2YWlsYWJsZS4nKSxcbiAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBleHBvcnRBc3NldE1hbmlmZXN0KGFyZ3M6IHsgZGlyZWN0b3J5Pzogc3RyaW5nOyBmb3JtYXQ/OiBzdHJpbmc7IGluY2x1ZGVNZXRhZGF0YT86IGJvb2xlYW4gfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLmV4cG9ydEFzc2V0TWFuaWZlc3RJbXBsKGFyZ3MuZGlyZWN0b3J5LCBhcmdzLmZvcm1hdCwgYXJncy5pbmNsdWRlTWV0YWRhdGEpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ2dldF91c2VycycsXG4gICAgICAgIHRpdGxlOiAnRmluZCBhc3NldCB1c2VycycsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBBU1NFVF9BRFZBTkNFRF9ET0NTLmdldF91c2VycyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIHV1aWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0Fzc2V0IFVVSUQgdG8gZmluZCByZWZlcmVuY2VzIHRvLicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIGdldFVzZXJzKGFyZ3M6IHsgdXVpZDogc3RyaW5nIH0pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRVc2Vyc0ltcGwoYXJncy51dWlkKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHNhdmVBc3NldE1ldGFJbXBsKHVybE9yVVVJRDogc3RyaW5nLCBjb250ZW50OiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3NhdmUtYXNzZXQtbWV0YScsIHVybE9yVVVJRCwgY29udGVudCkudGhlbigocmVzdWx0OiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IHJlc3VsdD8udXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHVybDogcmVzdWx0Py51cmwsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiAnQXNzZXQgbWV0YSBzYXZlZCBzdWNjZXNzZnVsbHknXG4gICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnZW5lcmF0ZUF2YWlsYWJsZVVybEltcGwodXJsOiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ2dlbmVyYXRlLWF2YWlsYWJsZS11cmwnLCB1cmwpLnRoZW4oKGF2YWlsYWJsZVVybDogc3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICBvcmlnaW5hbFVybDogdXJsLFxuICAgICAgICAgICAgICAgICAgICAgICAgYXZhaWxhYmxlVXJsOiBhdmFpbGFibGVVcmwsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBhdmFpbGFibGVVcmwgPT09IHVybCA/IFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICdVUkwgaXMgYXZhaWxhYmxlJyA6IFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICdHZW5lcmF0ZWQgbmV3IGF2YWlsYWJsZSBVUkwnXG4gICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBxdWVyeUFzc2V0RGJSZWFkeUltcGwoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1yZWFkeScpLnRoZW4oKHJlYWR5OiBib29sZWFuKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICByZWFkeTogcmVhZHksXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiByZWFkeSA/ICdBc3NldCBkYXRhYmFzZSBpcyByZWFkeScgOiAnQXNzZXQgZGF0YWJhc2UgaXMgbm90IHJlYWR5J1xuICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgb3BlbkFzc2V0RXh0ZXJuYWxJbXBsKHVybE9yVVVJRDogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdvcGVuLWFzc2V0JywgdXJsT3JVVUlEKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHVuZGVmaW5lZCwgJ0Fzc2V0IG9wZW5lZCB3aXRoIGV4dGVybmFsIHByb2dyYW0nKSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgYmF0Y2hJbXBvcnRBc3NldHNJbXBsKGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IGZzID0gcmVxdWlyZSgnZnMnKTtcbiAgICAgICAgY29uc3QgcGF0aCA9IHJlcXVpcmUoJ3BhdGgnKTtcbiAgICAgICAgXG4gICAgICAgIGlmICghZnMuZXhpc3RzU3luYyhhcmdzLnNvdXJjZURpcmVjdG9yeSkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWlsKCdTb3VyY2UgZGlyZWN0b3J5IGRvZXMgbm90IGV4aXN0Jyk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBmaWxlcyA9IHRoaXMuZ2V0RmlsZXNGcm9tRGlyZWN0b3J5KFxuICAgICAgICAgICAgYXJncy5zb3VyY2VEaXJlY3RvcnksIFxuICAgICAgICAgICAgYXJncy5maWxlRmlsdGVyIHx8IFtdLCBcbiAgICAgICAgICAgIGFyZ3MucmVjdXJzaXZlIHx8IGZhbHNlXG4gICAgICAgICk7XG5cbiAgICAgICAgY29uc3QgaW1wb3J0UmVzdWx0czogYW55W10gPSBbXTtcbiAgICAgICAgbGV0IHN1Y2Nlc3NDb3VudCA9IDA7XG4gICAgICAgIGxldCBlcnJvckNvdW50ID0gMDtcblxuICAgICAgICBmb3IgKGNvbnN0IGZpbGVQYXRoIG9mIGZpbGVzKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGZpbGVOYW1lID0gcGF0aC5iYXNlbmFtZShmaWxlUGF0aCk7XG4gICAgICAgICAgICAgICAgY29uc3QgdGFyZ2V0UGF0aCA9IGAke2FyZ3MudGFyZ2V0RGlyZWN0b3J5fS8ke2ZpbGVOYW1lfWA7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAnaW1wb3J0LWFzc2V0JywgXG4gICAgICAgICAgICAgICAgICAgIGZpbGVQYXRoLCB0YXJnZXRQYXRoLCB7IFxuICAgICAgICAgICAgICAgICAgICAgICAgb3ZlcndyaXRlOiBhcmdzLm92ZXJ3cml0ZSB8fCBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlbmFtZTogIShhcmdzLm92ZXJ3cml0ZSB8fCBmYWxzZSlcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaW1wb3J0UmVzdWx0cy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgc291cmNlOiBmaWxlUGF0aCxcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0OiB0YXJnZXRQYXRoLFxuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICB1dWlkOiByZXN1bHQ/LnV1aWRcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBzdWNjZXNzQ291bnQrKztcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICAgICAgaW1wb3J0UmVzdWx0cy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgc291cmNlOiBmaWxlUGF0aCxcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIGVycm9yOiBlcnIubWVzc2FnZVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGVycm9yQ291bnQrKztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgdG90YWxGaWxlczogZmlsZXMubGVuZ3RoLFxuICAgICAgICAgICAgICAgIHN1Y2Nlc3NDb3VudDogc3VjY2Vzc0NvdW50LFxuICAgICAgICAgICAgICAgIGVycm9yQ291bnQ6IGVycm9yQ291bnQsXG4gICAgICAgICAgICAgICAgcmVzdWx0czogaW1wb3J0UmVzdWx0cyxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiBgQmF0Y2ggaW1wb3J0IGNvbXBsZXRlZDogJHtzdWNjZXNzQ291bnR9IHN1Y2Nlc3MsICR7ZXJyb3JDb3VudH0gZXJyb3JzYFxuICAgICAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBnZXRGaWxlc0Zyb21EaXJlY3RvcnkoZGlyUGF0aDogc3RyaW5nLCBmaWxlRmlsdGVyOiBzdHJpbmdbXSwgcmVjdXJzaXZlOiBib29sZWFuKTogc3RyaW5nW10ge1xuICAgICAgICBjb25zdCBmcyA9IHJlcXVpcmUoJ2ZzJyk7XG4gICAgICAgIGNvbnN0IHBhdGggPSByZXF1aXJlKCdwYXRoJyk7XG4gICAgICAgIGNvbnN0IGZpbGVzOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgICAgIGNvbnN0IGl0ZW1zID0gZnMucmVhZGRpclN5bmMoZGlyUGF0aCk7XG4gICAgICAgIFxuICAgICAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgaXRlbXMpIHtcbiAgICAgICAgICAgIGNvbnN0IGZ1bGxQYXRoID0gcGF0aC5qb2luKGRpclBhdGgsIGl0ZW0pO1xuICAgICAgICAgICAgY29uc3Qgc3RhdCA9IGZzLnN0YXRTeW5jKGZ1bGxQYXRoKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgaWYgKHN0YXQuaXNGaWxlKCkpIHtcbiAgICAgICAgICAgICAgICBpZiAoZmlsZUZpbHRlci5sZW5ndGggPT09IDAgfHwgZmlsZUZpbHRlci5zb21lKGV4dCA9PiBpdGVtLnRvTG93ZXJDYXNlKCkuZW5kc1dpdGgoZXh0LnRvTG93ZXJDYXNlKCkpKSkge1xuICAgICAgICAgICAgICAgICAgICBmaWxlcy5wdXNoKGZ1bGxQYXRoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHN0YXQuaXNEaXJlY3RvcnkoKSAmJiByZWN1cnNpdmUpIHtcbiAgICAgICAgICAgICAgICBmaWxlcy5wdXNoKC4uLnRoaXMuZ2V0RmlsZXNGcm9tRGlyZWN0b3J5KGZ1bGxQYXRoLCBmaWxlRmlsdGVyLCByZWN1cnNpdmUpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgcmV0dXJuIGZpbGVzO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgYmF0Y2hEZWxldGVBc3NldHNJbXBsKHVybHM6IHN0cmluZ1tdKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgZGVsZXRlUmVzdWx0czogYW55W10gPSBbXTtcbiAgICAgICAgbGV0IHN1Y2Nlc3NDb3VudCA9IDA7XG4gICAgICAgIGxldCBlcnJvckNvdW50ID0gMDtcblxuICAgICAgICBmb3IgKGNvbnN0IHVybCBvZiB1cmxzKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ2RlbGV0ZS1hc3NldCcsIHVybCk7XG4gICAgICAgICAgICAgICAgZGVsZXRlUmVzdWx0cy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgdXJsOiB1cmwsXG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWVcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBzdWNjZXNzQ291bnQrKztcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICAgICAgZGVsZXRlUmVzdWx0cy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgdXJsOiB1cmwsXG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICBlcnJvcjogZXJyLm1lc3NhZ2VcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBlcnJvckNvdW50Kys7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gb2soe1xuICAgICAgICAgICAgICAgIHRvdGFsQXNzZXRzOiB1cmxzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICBzdWNjZXNzQ291bnQ6IHN1Y2Nlc3NDb3VudCxcbiAgICAgICAgICAgICAgICBlcnJvckNvdW50OiBlcnJvckNvdW50LFxuICAgICAgICAgICAgICAgIHJlc3VsdHM6IGRlbGV0ZVJlc3VsdHMsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogYEJhdGNoIGRlbGV0ZSBjb21wbGV0ZWQ6ICR7c3VjY2Vzc0NvdW50fSBzdWNjZXNzLCAke2Vycm9yQ291bnR9IGVycm9yc2BcbiAgICAgICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgdmFsaWRhdGVBc3NldFJlZmVyZW5jZXNJbXBsKGRpcmVjdG9yeTogc3RyaW5nID0gJ2RiOi8vYXNzZXRzJyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIC8vIEdldCBhbGwgYXNzZXRzIGluIGRpcmVjdG9yeVxuICAgICAgICBjb25zdCBhc3NldHMgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldHMnLCB7IHBhdHRlcm46IGAke2RpcmVjdG9yeX0vKiovKmAgfSk7XG4gICAgICAgIFxuICAgICAgICBjb25zdCBicm9rZW5SZWZlcmVuY2VzOiBhbnlbXSA9IFtdO1xuICAgICAgICBjb25zdCB2YWxpZFJlZmVyZW5jZXM6IGFueVtdID0gW107XG5cbiAgICAgICAgZm9yIChjb25zdCBhc3NldCBvZiBhc3NldHMpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgYXNzZXRJbmZvID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXQtaW5mbycsIGFzc2V0LnVybCk7XG4gICAgICAgICAgICAgICAgaWYgKGFzc2V0SW5mbykge1xuICAgICAgICAgICAgICAgICAgICB2YWxpZFJlZmVyZW5jZXMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgICAgICB1cmw6IGFzc2V0LnVybCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IGFzc2V0LnV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBuYW1lOiBhc3NldC5uYW1lXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgICAgIGJyb2tlblJlZmVyZW5jZXMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgIHVybDogYXNzZXQudXJsLFxuICAgICAgICAgICAgICAgICAgICB1dWlkOiBhc3NldC51dWlkLFxuICAgICAgICAgICAgICAgICAgICBuYW1lOiBhc3NldC5uYW1lLFxuICAgICAgICAgICAgICAgICAgICBlcnJvcjogKGVyciBhcyBFcnJvcikubWVzc2FnZVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG9rKHtcbiAgICAgICAgICAgICAgICBkaXJlY3Rvcnk6IGRpcmVjdG9yeSxcbiAgICAgICAgICAgICAgICB0b3RhbEFzc2V0czogYXNzZXRzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICB2YWxpZFJlZmVyZW5jZXM6IHZhbGlkUmVmZXJlbmNlcy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgYnJva2VuUmVmZXJlbmNlczogYnJva2VuUmVmZXJlbmNlcy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgYnJva2VuQXNzZXRzOiBicm9rZW5SZWZlcmVuY2VzLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBWYWxpZGF0aW9uIGNvbXBsZXRlZDogJHticm9rZW5SZWZlcmVuY2VzLmxlbmd0aH0gYnJva2VuIHJlZmVyZW5jZXMgZm91bmRgXG4gICAgICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldEFzc2V0RGVwZW5kZW5jaWVzSW1wbCh1cmxPclVVSUQ6IHN0cmluZywgZGlyZWN0aW9uOiBzdHJpbmcgPSAnZGVwZW5kZW5jaWVzJyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgLy8gTm90ZTogVGhpcyB3b3VsZCByZXF1aXJlIHNjZW5lIGFuYWx5c2lzIG9yIGFkZGl0aW9uYWwgQVBJcyBub3QgYXZhaWxhYmxlIGluIGN1cnJlbnQgZG9jdW1lbnRhdGlvblxuICAgICAgICAgICAgcmVzb2x2ZShmYWlsKCdBc3NldCBkZXBlbmRlbmN5IGFuYWx5c2lzIHJlcXVpcmVzIGFkZGl0aW9uYWwgQVBJcyBub3QgYXZhaWxhYmxlIGluIGN1cnJlbnQgQ29jb3MgQ3JlYXRvciBNQ1AgaW1wbGVtZW50YXRpb24uIENvbnNpZGVyIHVzaW5nIHRoZSBFZGl0b3IgVUkgZm9yIGRlcGVuZGVuY3kgYW5hbHlzaXMuJykpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldFVudXNlZEFzc2V0c0ltcGwoZGlyZWN0b3J5OiBzdHJpbmcgPSAnZGI6Ly9hc3NldHMnLCBleGNsdWRlRGlyZWN0b3JpZXM6IHN0cmluZ1tdID0gW10pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIC8vIE5vdGU6IFRoaXMgd291bGQgcmVxdWlyZSBjb21wcmVoZW5zaXZlIHByb2plY3QgYW5hbHlzaXNcbiAgICAgICAgICAgIHJlc29sdmUoZmFpbCgnVW51c2VkIGFzc2V0IGRldGVjdGlvbiByZXF1aXJlcyBjb21wcmVoZW5zaXZlIHByb2plY3QgYW5hbHlzaXMgbm90IGF2YWlsYWJsZSBpbiBjdXJyZW50IENvY29zIENyZWF0b3IgTUNQIGltcGxlbWVudGF0aW9uLiBDb25zaWRlciB1c2luZyB0aGUgRWRpdG9yIFVJIG9yIHRoaXJkLXBhcnR5IHRvb2xzIGZvciB1bnVzZWQgYXNzZXQgZGV0ZWN0aW9uLicpKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBjb21wcmVzc1RleHR1cmVzSW1wbChkaXJlY3Rvcnk6IHN0cmluZyA9ICdkYjovL2Fzc2V0cycsIGZvcm1hdDogc3RyaW5nID0gJ2F1dG8nLCBxdWFsaXR5OiBudW1iZXIgPSAwLjgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIC8vIE5vdGU6IFRleHR1cmUgY29tcHJlc3Npb24gd291bGQgcmVxdWlyZSBpbWFnZSBwcm9jZXNzaW5nIEFQSXNcbiAgICAgICAgICAgIHJlc29sdmUoZmFpbCgnVGV4dHVyZSBjb21wcmVzc2lvbiByZXF1aXJlcyBpbWFnZSBwcm9jZXNzaW5nIGNhcGFiaWxpdGllcyBub3QgYXZhaWxhYmxlIGluIGN1cnJlbnQgQ29jb3MgQ3JlYXRvciBNQ1AgaW1wbGVtZW50YXRpb24uIFVzZSB0aGUgRWRpdG9yXFwncyBidWlsdC1pbiB0ZXh0dXJlIGNvbXByZXNzaW9uIHNldHRpbmdzIG9yIGV4dGVybmFsIHRvb2xzLicpKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBleHBvcnRBc3NldE1hbmlmZXN0SW1wbChkaXJlY3Rvcnk6IHN0cmluZyA9ICdkYjovL2Fzc2V0cycsIGZvcm1hdDogc3RyaW5nID0gJ2pzb24nLCBpbmNsdWRlTWV0YWRhdGE6IGJvb2xlYW4gPSB0cnVlKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgYXNzZXRzID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXRzJywgeyBwYXR0ZXJuOiBgJHtkaXJlY3Rvcnl9LyoqLypgIH0pO1xuICAgICAgICBcbiAgICAgICAgY29uc3QgbWFuaWZlc3Q6IGFueVtdID0gW107XG5cbiAgICAgICAgZm9yIChjb25zdCBhc3NldCBvZiBhc3NldHMpIHtcbiAgICAgICAgICAgIGNvbnN0IG1hbmlmZXN0RW50cnk6IGFueSA9IHtcbiAgICAgICAgICAgICAgICBuYW1lOiBhc3NldC5uYW1lLFxuICAgICAgICAgICAgICAgIHVybDogYXNzZXQudXJsLFxuICAgICAgICAgICAgICAgIHV1aWQ6IGFzc2V0LnV1aWQsXG4gICAgICAgICAgICAgICAgdHlwZTogYXNzZXQudHlwZSxcbiAgICAgICAgICAgICAgICBzaXplOiAoYXNzZXQgYXMgYW55KS5zaXplIHx8IDAsXG4gICAgICAgICAgICAgICAgaXNEaXJlY3Rvcnk6IGFzc2V0LmlzRGlyZWN0b3J5IHx8IGZhbHNlXG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBpZiAoaW5jbHVkZU1ldGFkYXRhKSB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYXNzZXRJbmZvID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXQtaW5mbycsIGFzc2V0LnVybCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChhc3NldEluZm8gJiYgYXNzZXRJbmZvLm1ldGEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG1hbmlmZXN0RW50cnkubWV0YSA9IGFzc2V0SW5mby5tZXRhO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIFNraXAgbWV0YWRhdGEgaWYgbm90IGF2YWlsYWJsZVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgbWFuaWZlc3QucHVzaChtYW5pZmVzdEVudHJ5KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCBleHBvcnREYXRhOiBzdHJpbmc7XG4gICAgICAgIHN3aXRjaCAoZm9ybWF0KSB7XG4gICAgICAgICAgICBjYXNlICdqc29uJzpcbiAgICAgICAgICAgICAgICBleHBvcnREYXRhID0gSlNPTi5zdHJpbmdpZnkobWFuaWZlc3QsIG51bGwsIDIpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnY3N2JzpcbiAgICAgICAgICAgICAgICBleHBvcnREYXRhID0gdGhpcy5jb252ZXJ0VG9DU1YobWFuaWZlc3QpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAneG1sJzpcbiAgICAgICAgICAgICAgICBleHBvcnREYXRhID0gdGhpcy5jb252ZXJ0VG9YTUwobWFuaWZlc3QpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICBleHBvcnREYXRhID0gSlNPTi5zdHJpbmdpZnkobWFuaWZlc3QsIG51bGwsIDIpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG9rKHtcbiAgICAgICAgICAgICAgICBkaXJlY3Rvcnk6IGRpcmVjdG9yeSxcbiAgICAgICAgICAgICAgICBmb3JtYXQ6IGZvcm1hdCxcbiAgICAgICAgICAgICAgICBhc3NldENvdW50OiBtYW5pZmVzdC5sZW5ndGgsXG4gICAgICAgICAgICAgICAgaW5jbHVkZU1ldGFkYXRhOiBpbmNsdWRlTWV0YWRhdGEsXG4gICAgICAgICAgICAgICAgbWFuaWZlc3Q6IGV4cG9ydERhdGEsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogYEFzc2V0IG1hbmlmZXN0IGV4cG9ydGVkIHdpdGggJHttYW5pZmVzdC5sZW5ndGh9IGFzc2V0c2BcbiAgICAgICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgY29udmVydFRvQ1NWKGRhdGE6IGFueVtdKTogc3RyaW5nIHtcbiAgICAgICAgaWYgKGRhdGEubGVuZ3RoID09PSAwKSByZXR1cm4gJyc7XG4gICAgICAgIFxuICAgICAgICBjb25zdCBoZWFkZXJzID0gT2JqZWN0LmtleXMoZGF0YVswXSk7XG4gICAgICAgIGNvbnN0IGNzdlJvd3MgPSBbaGVhZGVycy5qb2luKCcsJyldO1xuICAgICAgICBcbiAgICAgICAgZm9yIChjb25zdCByb3cgb2YgZGF0YSkge1xuICAgICAgICAgICAgY29uc3QgdmFsdWVzID0gaGVhZGVycy5tYXAoaGVhZGVyID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCB2YWx1ZSA9IHJvd1toZWFkZXJdO1xuICAgICAgICAgICAgICAgIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnID8gSlNPTi5zdHJpbmdpZnkodmFsdWUpIDogU3RyaW5nKHZhbHVlKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgY3N2Um93cy5wdXNoKHZhbHVlcy5qb2luKCcsJykpO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICByZXR1cm4gY3N2Um93cy5qb2luKCdcXG4nKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGNvbnZlcnRUb1hNTChkYXRhOiBhbnlbXSk6IHN0cmluZyB7XG4gICAgICAgIGxldCB4bWwgPSAnPD94bWwgdmVyc2lvbj1cIjEuMFwiIGVuY29kaW5nPVwiVVRGLThcIj8+XFxuPGFzc2V0cz5cXG4nO1xuICAgICAgICBcbiAgICAgICAgZm9yIChjb25zdCBpdGVtIG9mIGRhdGEpIHtcbiAgICAgICAgICAgIHhtbCArPSAnICA8YXNzZXQ+XFxuJztcbiAgICAgICAgICAgIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGl0ZW0pKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgeG1sVmFsdWUgPSB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnID8gXG4gICAgICAgICAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KHZhbHVlKSA6IFxuICAgICAgICAgICAgICAgICAgICBTdHJpbmcodmFsdWUpLnJlcGxhY2UoLyYvZywgJyZhbXA7JykucmVwbGFjZSgvPC9nLCAnJmx0OycpLnJlcGxhY2UoLz4vZywgJyZndDsnKTtcbiAgICAgICAgICAgICAgICB4bWwgKz0gYCAgICA8JHtrZXl9PiR7eG1sVmFsdWV9PC8ke2tleX0+XFxuYDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHhtbCArPSAnICA8L2Fzc2V0Plxcbic7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHhtbCArPSAnPC9hc3NldHM+JztcbiAgICAgICAgcmV0dXJuIHhtbDtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldFVzZXJzSW1wbCh0YXJnZXRVdWlkOiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBzY2VuZXMgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldHMnLCB7IHBhdHRlcm46ICdkYjovL2Fzc2V0cy8qKicsIGNjVHlwZTogJ2NjLlNjZW5lQXNzZXQnIH0pO1xuICAgICAgICBjb25zdCBwcmVmYWJzID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXRzJywgeyBwYXR0ZXJuOiAnZGI6Ly9hc3NldHMvKionLCBjY1R5cGU6ICdjYy5QcmVmYWInIH0pO1xuICAgICAgICBjb25zdCBzY3JpcHRzVHMgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldHMnLCB7IHBhdHRlcm46ICdkYjovL2Fzc2V0cy8qKi8qLnRzJyB9KTtcbiAgICAgICAgY29uc3Qgc2NyaXB0c0pzID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXRzJywgeyBwYXR0ZXJuOiAnZGI6Ly9hc3NldHMvKiovKi5qcycgfSk7XG4gICAgICAgIFxuICAgICAgICBjb25zdCBhbGxBc3NldHMgPSBbLi4uc2NlbmVzLCAuLi5wcmVmYWJzLCAuLi5zY3JpcHRzVHMsIC4uLnNjcmlwdHNKc107XG4gICAgICAgIGNvbnN0IHVuaXF1ZUFzc2V0cyA9IEFycmF5LmZyb20obmV3IE1hcChhbGxBc3NldHMubWFwKChhOiBhbnkpID0+IFthLnV1aWQsIGFdKSkudmFsdWVzKCkpO1xuXG4gICAgICAgIGNvbnN0IHVzZXJzOiBhbnlbXSA9IFtdO1xuICAgICAgICBmb3IgKGNvbnN0IGFzc2V0IG9mIHVuaXF1ZUFzc2V0cykge1xuICAgICAgICAgICAgY29uc3QgZGVwcyA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0LWRlcGVuZHMnLCBhc3NldC51dWlkKTtcbiAgICAgICAgICAgIGlmIChkZXBzICYmIGRlcHMuaW5jbHVkZXModGFyZ2V0VXVpZCkpIHtcbiAgICAgICAgICAgICAgICBsZXQgdHlwZSA9ICdzY3JpcHQnO1xuICAgICAgICAgICAgICAgIGlmIChhc3NldC50eXBlID09PSAnY2MuU2NlbmVBc3NldCcpIHR5cGUgPSAnc2NlbmUnO1xuICAgICAgICAgICAgICAgIGVsc2UgaWYgKGFzc2V0LnR5cGUgPT09ICdjYy5QcmVmYWInKSB0eXBlID0gJ3ByZWZhYic7XG4gICAgICAgICAgICAgICAgdXNlcnMucHVzaCh7IHR5cGUsIHV1aWQ6IGFzc2V0LnV1aWQsIHBhdGg6IGFzc2V0LnVybCwgbmFtZTogYXNzZXQubmFtZSB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgcmV0dXJuIG9rKHsgdXVpZDogdGFyZ2V0VXVpZCwgdXNlcnMsIHRvdGFsOiB1c2Vycy5sZW5ndGggfSk7XG4gICAgfVxufVxuIl19