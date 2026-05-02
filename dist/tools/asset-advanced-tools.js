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
        description: '[specialist] Write serialized meta content for an asset URL/UUID; mutates asset metadata.',
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
        description: '[specialist] Return a collision-free asset URL derived from the requested URL.',
        inputSchema: schema_1.z.object({
            url: schema_1.z.string().describe('Desired asset db:// URL to test for collision and adjust if needed.'),
        }),
    })
], AssetAdvancedTools.prototype, "generateAvailableUrl", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'query_asset_db_ready',
        title: 'Check asset-db readiness',
        description: '[specialist] Check whether asset-db reports ready before batch operations.',
        inputSchema: schema_1.z.object({}),
    })
], AssetAdvancedTools.prototype, "queryAssetDbReady", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'open_asset_external',
        title: 'Open asset externally',
        description: '[specialist] Open an asset through the editor/OS external handler; does not edit content.',
        inputSchema: schema_1.z.object({
            urlOrUUID: schema_1.z.string().describe('Asset db:// URL or UUID to open with the OS/editor associated external program.'),
        }),
    })
], AssetAdvancedTools.prototype, "openAssetExternal", null);
__decorate([
    (0, decorators_1.mcpTool)({
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
    })
], AssetAdvancedTools.prototype, "batchImportAssets", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'batch_delete_assets',
        title: 'Delete assets in batch',
        description: '[specialist] Delete multiple asset-db URLs; mutates project assets.',
        inputSchema: schema_1.z.object({
            urls: schema_1.z.array(schema_1.z.string()).describe('Asset db:// URLs to delete. Each URL is attempted independently.'),
        }),
    })
], AssetAdvancedTools.prototype, "batchDeleteAssets", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'validate_asset_references',
        title: 'Validate asset references',
        description: '[specialist] Lightly scan assets under a directory for broken asset-info references.',
        inputSchema: schema_1.z.object({
            directory: schema_1.z.string().default('db://assets').describe('Asset-db directory to scan. Default db://assets.'),
        }),
    })
], AssetAdvancedTools.prototype, "validateAssetReferences", null);
__decorate([
    (0, decorators_1.mcpTool)({
        name: 'get_asset_dependencies',
        title: 'Read asset dependencies',
        description: '[specialist] Unsupported dependency-analysis placeholder; always reports unsupported.',
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
        description: '[specialist] Unsupported unused-asset placeholder; always reports unsupported.',
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
        description: '[specialist] Unsupported texture-compression placeholder; always reports unsupported.',
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
        description: '[specialist] Return asset inventory for a directory as json/csv/xml text; does not write a file.',
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
        description: '[specialist] Find scenes/prefabs/scripts that reference an asset by UUID.',
        inputSchema: schema_1.z.object({
            uuid: schema_1.z.string().describe('Asset UUID to find references to.'),
        }),
    })
], AssetAdvancedTools.prototype, "getUsers", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXNzZXQtYWR2YW5jZWQtdG9vbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvdG9vbHMvYXNzZXQtYWR2YW5jZWQtdG9vbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7O0FBQUEsOENBQTJDO0FBRTNDLDBDQUFrQztBQUNsQyxrREFBdUU7QUFFdkUsTUFBYSxrQkFBa0I7SUFHM0I7UUFDSSxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUEsc0NBQXlCLEVBQUMsSUFBSSxDQUFDLENBQUM7SUFDaEQsQ0FBQztJQUVELFFBQVEsS0FBdUIsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUM3RCxPQUFPLENBQUMsUUFBZ0IsRUFBRSxJQUFTLElBQTJCLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztJQVduRyxBQUFOLEtBQUssQ0FBQyxhQUFhLENBQUMsSUFBNEM7UUFDNUQsT0FBTyxJQUFJLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDaEUsQ0FBQztJQVVLLEFBQU4sS0FBSyxDQUFDLG9CQUFvQixDQUFDLElBQXFCO1FBQzVDLE9BQU8sSUFBSSxDQUFDLHdCQUF3QixDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUNuRCxDQUFDO0lBUUssQUFBTixLQUFLLENBQUMsaUJBQWlCO1FBQ25CLE9BQU8sSUFBSSxDQUFDLHFCQUFxQixFQUFFLENBQUM7SUFDeEMsQ0FBQztJQVVLLEFBQU4sS0FBSyxDQUFDLGlCQUFpQixDQUFDLElBQTJCO1FBQy9DLE9BQU8sSUFBSSxDQUFDLHFCQUFxQixDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUN0RCxDQUFDO0lBY0ssQUFBTixLQUFLLENBQUMsaUJBQWlCLENB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RyxDQUFDO0tBQ0wsQ0FBQzs2REFHRDtBQVVLO0lBUkwsSUFBQSxvQkFBTyxFQUFDO1FBQ0wsSUFBSSxFQUFFLFdBQVc7UUFDakIsS0FBSyxFQUFFLGtCQUFrQjtRQUN6QixXQUFXLEVBQUUsMkVBQTJFO1FBQ3hGLFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDO1lBQ2xCLElBQUksRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLG1DQUFtQyxDQUFDO1NBQ2pFLENBQUM7S0FDTCxDQUFDO2tEQUdEIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgb2ssIGZhaWwgfSBmcm9tICcuLi9saWIvcmVzcG9uc2UnO1xuaW1wb3J0IHR5cGUgeyBUb29sRGVmaW5pdGlvbiwgVG9vbFJlc3BvbnNlLCBUb29sRXhlY3V0b3IgfSBmcm9tICcuLi90eXBlcyc7XG5pbXBvcnQgeyB6IH0gZnJvbSAnLi4vbGliL3NjaGVtYSc7XG5pbXBvcnQgeyBtY3BUb29sLCBkZWZpbmVUb29sc0Zyb21EZWNvcmF0b3JzIH0gZnJvbSAnLi4vbGliL2RlY29yYXRvcnMnO1xuXG5leHBvcnQgY2xhc3MgQXNzZXRBZHZhbmNlZFRvb2xzIGltcGxlbWVudHMgVG9vbEV4ZWN1dG9yIHtcbiAgICBwcml2YXRlIHJlYWRvbmx5IGV4ZWM6IFRvb2xFeGVjdXRvcjtcblxuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICB0aGlzLmV4ZWMgPSBkZWZpbmVUb29sc0Zyb21EZWNvcmF0b3JzKHRoaXMpO1xuICAgIH1cblxuICAgIGdldFRvb2xzKCk6IFRvb2xEZWZpbml0aW9uW10geyByZXR1cm4gdGhpcy5leGVjLmdldFRvb2xzKCk7IH1cbiAgICBleGVjdXRlKHRvb2xOYW1lOiBzdHJpbmcsIGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7IHJldHVybiB0aGlzLmV4ZWMuZXhlY3V0ZSh0b29sTmFtZSwgYXJncyk7IH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ3NhdmVfYXNzZXRfbWV0YScsXG4gICAgICAgIHRpdGxlOiAnU2F2ZSBhc3NldCBtZXRhJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gV3JpdGUgc2VyaWFsaXplZCBtZXRhIGNvbnRlbnQgZm9yIGFuIGFzc2V0IFVSTC9VVUlEOyBtdXRhdGVzIGFzc2V0IG1ldGFkYXRhLicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICB1cmxPclVVSUQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0Fzc2V0IGRiOi8vIFVSTCBvciBVVUlEIHdob3NlIC5tZXRhIGNvbnRlbnQgc2hvdWxkIGJlIHNhdmVkLicpLFxuICAgICAgICAgICAgY29udGVudDogei5zdHJpbmcoKS5kZXNjcmliZSgnU2VyaWFsaXplZCBhc3NldCBtZXRhIGNvbnRlbnQgc3RyaW5nIHRvIHdyaXRlLicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIHNhdmVBc3NldE1ldGEoYXJnczogeyB1cmxPclVVSUQ6IHN0cmluZzsgY29udGVudDogc3RyaW5nIH0pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5zYXZlQXNzZXRNZXRhSW1wbChhcmdzLnVybE9yVVVJRCwgYXJncy5jb250ZW50KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdnZW5lcmF0ZV9hdmFpbGFibGVfdXJsJyxcbiAgICAgICAgdGl0bGU6ICdHZW5lcmF0ZSBhc3NldCBVUkwnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBSZXR1cm4gYSBjb2xsaXNpb24tZnJlZSBhc3NldCBVUkwgZGVyaXZlZCBmcm9tIHRoZSByZXF1ZXN0ZWQgVVJMLicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICB1cmw6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0Rlc2lyZWQgYXNzZXQgZGI6Ly8gVVJMIHRvIHRlc3QgZm9yIGNvbGxpc2lvbiBhbmQgYWRqdXN0IGlmIG5lZWRlZC4nKSxcbiAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBnZW5lcmF0ZUF2YWlsYWJsZVVybChhcmdzOiB7IHVybDogc3RyaW5nIH0pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZW5lcmF0ZUF2YWlsYWJsZVVybEltcGwoYXJncy51cmwpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ3F1ZXJ5X2Fzc2V0X2RiX3JlYWR5JyxcbiAgICAgICAgdGl0bGU6ICdDaGVjayBhc3NldC1kYiByZWFkaW5lc3MnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1tzcGVjaWFsaXN0XSBDaGVjayB3aGV0aGVyIGFzc2V0LWRiIHJlcG9ydHMgcmVhZHkgYmVmb3JlIGJhdGNoIG9wZXJhdGlvbnMuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSxcbiAgICB9KVxuICAgIGFzeW5jIHF1ZXJ5QXNzZXREYlJlYWR5KCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLnF1ZXJ5QXNzZXREYlJlYWR5SW1wbCgpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ29wZW5fYXNzZXRfZXh0ZXJuYWwnLFxuICAgICAgICB0aXRsZTogJ09wZW4gYXNzZXQgZXh0ZXJuYWxseScsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIE9wZW4gYW4gYXNzZXQgdGhyb3VnaCB0aGUgZWRpdG9yL09TIGV4dGVybmFsIGhhbmRsZXI7IGRvZXMgbm90IGVkaXQgY29udGVudC4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgdXJsT3JVVUlEOiB6LnN0cmluZygpLmRlc2NyaWJlKCdBc3NldCBkYjovLyBVUkwgb3IgVVVJRCB0byBvcGVuIHdpdGggdGhlIE9TL2VkaXRvciBhc3NvY2lhdGVkIGV4dGVybmFsIHByb2dyYW0uJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgb3BlbkFzc2V0RXh0ZXJuYWwoYXJnczogeyB1cmxPclVVSUQ6IHN0cmluZyB9KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMub3BlbkFzc2V0RXh0ZXJuYWxJbXBsKGFyZ3MudXJsT3JVVUlEKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdiYXRjaF9pbXBvcnRfYXNzZXRzJyxcbiAgICAgICAgdGl0bGU6ICdJbXBvcnQgYXNzZXRzIGluIGJhdGNoJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gSW1wb3J0IGZpbGVzIGZyb20gYSBkaXNrIGRpcmVjdG9yeSBpbnRvIGFzc2V0LWRiOyBtdXRhdGVzIHByb2plY3QgYXNzZXRzLicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICBzb3VyY2VEaXJlY3Rvcnk6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0Fic29sdXRlIHNvdXJjZSBkaXJlY3Rvcnkgb24gZGlzayB0byBzY2FuIGZvciBpbXBvcnQgZmlsZXMuJyksXG4gICAgICAgICAgICB0YXJnZXREaXJlY3Rvcnk6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1RhcmdldCBhc3NldC1kYiBkaXJlY3RvcnkgVVJMLCBlLmcuIGRiOi8vYXNzZXRzL3RleHR1cmVzLicpLFxuICAgICAgICAgICAgZmlsZUZpbHRlcjogei5hcnJheSh6LnN0cmluZygpKS5kZWZhdWx0KFtdKS5kZXNjcmliZSgnQWxsb3dlZCBmaWxlIGV4dGVuc2lvbnMsIGUuZy4gW1wiLnBuZ1wiLFwiLmpwZ1wiXS4gRW1wdHkgbWVhbnMgYWxsIGZpbGVzLicpLFxuICAgICAgICAgICAgcmVjdXJzaXZlOiB6LmJvb2xlYW4oKS5kZWZhdWx0KGZhbHNlKS5kZXNjcmliZSgnSW5jbHVkZSBmaWxlcyBmcm9tIHN1YmRpcmVjdG9yaWVzLicpLFxuICAgICAgICAgICAgb3ZlcndyaXRlOiB6LmJvb2xlYW4oKS5kZWZhdWx0KGZhbHNlKS5kZXNjcmliZSgnT3ZlcndyaXRlIGV4aXN0aW5nIHRhcmdldCBhc3NldHMgaW5zdGVhZCBvZiBhdXRvLXJlbmFtaW5nLicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIGJhdGNoSW1wb3J0QXNzZXRzKGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLmJhdGNoSW1wb3J0QXNzZXRzSW1wbChhcmdzKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdiYXRjaF9kZWxldGVfYXNzZXRzJyxcbiAgICAgICAgdGl0bGU6ICdEZWxldGUgYXNzZXRzIGluIGJhdGNoJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gRGVsZXRlIG11bHRpcGxlIGFzc2V0LWRiIFVSTHM7IG11dGF0ZXMgcHJvamVjdCBhc3NldHMuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIHVybHM6IHouYXJyYXkoei5zdHJpbmcoKSkuZGVzY3JpYmUoJ0Fzc2V0IGRiOi8vIFVSTHMgdG8gZGVsZXRlLiBFYWNoIFVSTCBpcyBhdHRlbXB0ZWQgaW5kZXBlbmRlbnRseS4nKSxcbiAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBiYXRjaERlbGV0ZUFzc2V0cyhhcmdzOiB7IHVybHM6IHN0cmluZ1tdIH0pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5iYXRjaERlbGV0ZUFzc2V0c0ltcGwoYXJncy51cmxzKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICd2YWxpZGF0ZV9hc3NldF9yZWZlcmVuY2VzJyxcbiAgICAgICAgdGl0bGU6ICdWYWxpZGF0ZSBhc3NldCByZWZlcmVuY2VzJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gTGlnaHRseSBzY2FuIGFzc2V0cyB1bmRlciBhIGRpcmVjdG9yeSBmb3IgYnJva2VuIGFzc2V0LWluZm8gcmVmZXJlbmNlcy4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgZGlyZWN0b3J5OiB6LnN0cmluZygpLmRlZmF1bHQoJ2RiOi8vYXNzZXRzJykuZGVzY3JpYmUoJ0Fzc2V0LWRiIGRpcmVjdG9yeSB0byBzY2FuLiBEZWZhdWx0IGRiOi8vYXNzZXRzLicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIHZhbGlkYXRlQXNzZXRSZWZlcmVuY2VzKGFyZ3M6IHsgZGlyZWN0b3J5Pzogc3RyaW5nIH0pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy52YWxpZGF0ZUFzc2V0UmVmZXJlbmNlc0ltcGwoYXJncy5kaXJlY3RvcnkpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ2dldF9hc3NldF9kZXBlbmRlbmNpZXMnLFxuICAgICAgICB0aXRsZTogJ1JlYWQgYXNzZXQgZGVwZW5kZW5jaWVzJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gVW5zdXBwb3J0ZWQgZGVwZW5kZW5jeS1hbmFseXNpcyBwbGFjZWhvbGRlcjsgYWx3YXlzIHJlcG9ydHMgdW5zdXBwb3J0ZWQuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIHVybE9yVVVJRDogei5zdHJpbmcoKS5kZXNjcmliZSgnQXNzZXQgVVJMIG9yIFVVSUQgZm9yIGRlcGVuZGVuY3kgYW5hbHlzaXMuIEN1cnJlbnQgaW1wbGVtZW50YXRpb24gcmVwb3J0cyB1bnN1cHBvcnRlZC4nKSxcbiAgICAgICAgICAgIGRpcmVjdGlvbjogei5lbnVtKFsnZGVwZW5kZW50cycsICdkZXBlbmRlbmNpZXMnLCAnYm90aCddKS5kZWZhdWx0KCdkZXBlbmRlbmNpZXMnKS5kZXNjcmliZSgnRGVwZW5kZW5jeSBkaXJlY3Rpb24gcmVxdWVzdGVkLiBDdXJyZW50IGltcGxlbWVudGF0aW9uIHJlcG9ydHMgdW5zdXBwb3J0ZWQuJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgZ2V0QXNzZXREZXBlbmRlbmNpZXMoYXJnczogeyB1cmxPclVVSUQ6IHN0cmluZzsgZGlyZWN0aW9uPzogc3RyaW5nIH0pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRBc3NldERlcGVuZGVuY2llc0ltcGwoYXJncy51cmxPclVVSUQsIGFyZ3MuZGlyZWN0aW9uKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdnZXRfdW51c2VkX2Fzc2V0cycsXG4gICAgICAgIHRpdGxlOiAnRmluZCB1bnVzZWQgYXNzZXRzJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gVW5zdXBwb3J0ZWQgdW51c2VkLWFzc2V0IHBsYWNlaG9sZGVyOyBhbHdheXMgcmVwb3J0cyB1bnN1cHBvcnRlZC4nLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgZGlyZWN0b3J5OiB6LnN0cmluZygpLmRlZmF1bHQoJ2RiOi8vYXNzZXRzJykuZGVzY3JpYmUoJ0Fzc2V0LWRiIGRpcmVjdG9yeSB0byBzY2FuLiBDdXJyZW50IGltcGxlbWVudGF0aW9uIHJlcG9ydHMgdW5zdXBwb3J0ZWQuJyksXG4gICAgICAgICAgICBleGNsdWRlRGlyZWN0b3JpZXM6IHouYXJyYXkoei5zdHJpbmcoKSkuZGVmYXVsdChbXSkuZGVzY3JpYmUoJ0RpcmVjdG9yaWVzIHRvIGV4Y2x1ZGUgZnJvbSB0aGUgcmVxdWVzdGVkIHNjYW4uIEN1cnJlbnQgaW1wbGVtZW50YXRpb24gcmVwb3J0cyB1bnN1cHBvcnRlZC4nKSxcbiAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBnZXRVbnVzZWRBc3NldHMoYXJnczogeyBkaXJlY3Rvcnk/OiBzdHJpbmc7IGV4Y2x1ZGVEaXJlY3Rvcmllcz86IHN0cmluZ1tdIH0pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRVbnVzZWRBc3NldHNJbXBsKGFyZ3MuZGlyZWN0b3J5LCBhcmdzLmV4Y2x1ZGVEaXJlY3Rvcmllcyk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnY29tcHJlc3NfdGV4dHVyZXMnLFxuICAgICAgICB0aXRsZTogJ0NvbXByZXNzIHRleHR1cmVzJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdbc3BlY2lhbGlzdF0gVW5zdXBwb3J0ZWQgdGV4dHVyZS1jb21wcmVzc2lvbiBwbGFjZWhvbGRlcjsgYWx3YXlzIHJlcG9ydHMgdW5zdXBwb3J0ZWQuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIGRpcmVjdG9yeTogei5zdHJpbmcoKS5kZWZhdWx0KCdkYjovL2Fzc2V0cycpLmRlc2NyaWJlKCdUZXh0dXJlIGRpcmVjdG9yeSByZXF1ZXN0ZWQgZm9yIGNvbXByZXNzaW9uLiBDdXJyZW50IGltcGxlbWVudGF0aW9uIHJlcG9ydHMgdW5zdXBwb3J0ZWQuJyksXG4gICAgICAgICAgICBmb3JtYXQ6IHouZW51bShbJ2F1dG8nLCAnanBnJywgJ3BuZycsICd3ZWJwJ10pLmRlZmF1bHQoJ2F1dG8nKS5kZXNjcmliZSgnUmVxdWVzdGVkIG91dHB1dCBmb3JtYXQuIEN1cnJlbnQgaW1wbGVtZW50YXRpb24gcmVwb3J0cyB1bnN1cHBvcnRlZC4nKSxcbiAgICAgICAgICAgIHF1YWxpdHk6IHoubnVtYmVyKCkubWluKDAuMSkubWF4KDEuMCkuZGVmYXVsdCgwLjgpLmRlc2NyaWJlKCdSZXF1ZXN0ZWQgY29tcHJlc3Npb24gcXVhbGl0eSBmcm9tIDAuMSB0byAxLjAuIEN1cnJlbnQgaW1wbGVtZW50YXRpb24gcmVwb3J0cyB1bnN1cHBvcnRlZC4nKSxcbiAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBjb21wcmVzc1RleHR1cmVzKGFyZ3M6IHsgZGlyZWN0b3J5Pzogc3RyaW5nOyBmb3JtYXQ/OiBzdHJpbmc7IHF1YWxpdHk/OiBudW1iZXIgfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLmNvbXByZXNzVGV4dHVyZXNJbXBsKGFyZ3MuZGlyZWN0b3J5LCBhcmdzLmZvcm1hdCwgYXJncy5xdWFsaXR5KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdleHBvcnRfYXNzZXRfbWFuaWZlc3QnLFxuICAgICAgICB0aXRsZTogJ0V4cG9ydCBhc3NldCBtYW5pZmVzdCcsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIFJldHVybiBhc3NldCBpbnZlbnRvcnkgZm9yIGEgZGlyZWN0b3J5IGFzIGpzb24vY3N2L3htbCB0ZXh0OyBkb2VzIG5vdCB3cml0ZSBhIGZpbGUuJyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIGRpcmVjdG9yeTogei5zdHJpbmcoKS5kZWZhdWx0KCdkYjovL2Fzc2V0cycpLmRlc2NyaWJlKCdBc3NldC1kYiBkaXJlY3RvcnkgdG8gaW5jbHVkZSBpbiB0aGUgbWFuaWZlc3QuIERlZmF1bHQgZGI6Ly9hc3NldHMuJyksXG4gICAgICAgICAgICBmb3JtYXQ6IHouZW51bShbJ2pzb24nLCAnY3N2JywgJ3htbCddKS5kZWZhdWx0KCdqc29uJykuZGVzY3JpYmUoJ1JldHVybmVkIG1hbmlmZXN0IHNlcmlhbGl6YXRpb24gZm9ybWF0LicpLFxuICAgICAgICAgICAgaW5jbHVkZU1ldGFkYXRhOiB6LmJvb2xlYW4oKS5kZWZhdWx0KHRydWUpLmRlc2NyaWJlKCdUcnkgdG8gaW5jbHVkZSBhc3NldCBtZXRhZGF0YSB3aGVuIGF2YWlsYWJsZS4nKSxcbiAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBleHBvcnRBc3NldE1hbmlmZXN0KGFyZ3M6IHsgZGlyZWN0b3J5Pzogc3RyaW5nOyBmb3JtYXQ/OiBzdHJpbmc7IGluY2x1ZGVNZXRhZGF0YT86IGJvb2xlYW4gfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLmV4cG9ydEFzc2V0TWFuaWZlc3RJbXBsKGFyZ3MuZGlyZWN0b3J5LCBhcmdzLmZvcm1hdCwgYXJncy5pbmNsdWRlTWV0YWRhdGEpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ2dldF91c2VycycsXG4gICAgICAgIHRpdGxlOiAnRmluZCBhc3NldCB1c2VycycsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnW3NwZWNpYWxpc3RdIEZpbmQgc2NlbmVzL3ByZWZhYnMvc2NyaXB0cyB0aGF0IHJlZmVyZW5jZSBhbiBhc3NldCBieSBVVUlELicsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICB1dWlkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdBc3NldCBVVUlEIHRvIGZpbmQgcmVmZXJlbmNlcyB0by4nKSxcbiAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBnZXRVc2VycyhhcmdzOiB7IHV1aWQ6IHN0cmluZyB9KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0VXNlcnNJbXBsKGFyZ3MudXVpZCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBzYXZlQXNzZXRNZXRhSW1wbCh1cmxPclVVSUQ6IHN0cmluZywgY29udGVudDogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdzYXZlLWFzc2V0LW1ldGEnLCB1cmxPclVVSUQsIGNvbnRlbnQpLnRoZW4oKHJlc3VsdDogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiByZXN1bHQ/LnV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICB1cmw6IHJlc3VsdD8udXJsLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogJ0Fzc2V0IG1ldGEgc2F2ZWQgc3VjY2Vzc2Z1bGx5J1xuICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2VuZXJhdGVBdmFpbGFibGVVcmxJbXBsKHVybDogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdnZW5lcmF0ZS1hdmFpbGFibGUtdXJsJywgdXJsKS50aGVuKChhdmFpbGFibGVVcmw6IHN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgb3JpZ2luYWxVcmw6IHVybCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGF2YWlsYWJsZVVybDogYXZhaWxhYmxlVXJsLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYXZhaWxhYmxlVXJsID09PSB1cmwgPyBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAnVVJMIGlzIGF2YWlsYWJsZScgOiBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAnR2VuZXJhdGVkIG5ldyBhdmFpbGFibGUgVVJMJ1xuICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgcXVlcnlBc3NldERiUmVhZHlJbXBsKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktcmVhZHknKS50aGVuKChyZWFkeTogYm9vbGVhbikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVhZHk6IHJlYWR5LFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogcmVhZHkgPyAnQXNzZXQgZGF0YWJhc2UgaXMgcmVhZHknIDogJ0Fzc2V0IGRhdGFiYXNlIGlzIG5vdCByZWFkeSdcbiAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIG9wZW5Bc3NldEV4dGVybmFsSW1wbCh1cmxPclVVSUQ6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAnb3Blbi1hc3NldCcsIHVybE9yVVVJRCkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh1bmRlZmluZWQsICdBc3NldCBvcGVuZWQgd2l0aCBleHRlcm5hbCBwcm9ncmFtJykpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGJhdGNoSW1wb3J0QXNzZXRzSW1wbChhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBmcyA9IHJlcXVpcmUoJ2ZzJyk7XG4gICAgICAgIGNvbnN0IHBhdGggPSByZXF1aXJlKCdwYXRoJyk7XG4gICAgICAgIFxuICAgICAgICBpZiAoIWZzLmV4aXN0c1N5bmMoYXJncy5zb3VyY2VEaXJlY3RvcnkpKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbCgnU291cmNlIGRpcmVjdG9yeSBkb2VzIG5vdCBleGlzdCcpO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgZmlsZXMgPSB0aGlzLmdldEZpbGVzRnJvbURpcmVjdG9yeShcbiAgICAgICAgICAgIGFyZ3Muc291cmNlRGlyZWN0b3J5LCBcbiAgICAgICAgICAgIGFyZ3MuZmlsZUZpbHRlciB8fCBbXSwgXG4gICAgICAgICAgICBhcmdzLnJlY3Vyc2l2ZSB8fCBmYWxzZVxuICAgICAgICApO1xuXG4gICAgICAgIGNvbnN0IGltcG9ydFJlc3VsdHM6IGFueVtdID0gW107XG4gICAgICAgIGxldCBzdWNjZXNzQ291bnQgPSAwO1xuICAgICAgICBsZXQgZXJyb3JDb3VudCA9IDA7XG5cbiAgICAgICAgZm9yIChjb25zdCBmaWxlUGF0aCBvZiBmaWxlcykge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCBmaWxlTmFtZSA9IHBhdGguYmFzZW5hbWUoZmlsZVBhdGgpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHRhcmdldFBhdGggPSBgJHthcmdzLnRhcmdldERpcmVjdG9yeX0vJHtmaWxlTmFtZX1gO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ2ltcG9ydC1hc3NldCcsIFxuICAgICAgICAgICAgICAgICAgICBmaWxlUGF0aCwgdGFyZ2V0UGF0aCwgeyBcbiAgICAgICAgICAgICAgICAgICAgICAgIG92ZXJ3cml0ZTogYXJncy5vdmVyd3JpdGUgfHwgZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgICAgICByZW5hbWU6ICEoYXJncy5vdmVyd3JpdGUgfHwgZmFsc2UpXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGltcG9ydFJlc3VsdHMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgIHNvdXJjZTogZmlsZVBhdGgsXG4gICAgICAgICAgICAgICAgICAgIHRhcmdldDogdGFyZ2V0UGF0aCxcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgdXVpZDogcmVzdWx0Py51dWlkXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgc3VjY2Vzc0NvdW50Kys7XG4gICAgICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgICAgIGltcG9ydFJlc3VsdHMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgIHNvdXJjZTogZmlsZVBhdGgsXG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICBlcnJvcjogZXJyLm1lc3NhZ2VcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBlcnJvckNvdW50Kys7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gb2soe1xuICAgICAgICAgICAgICAgIHRvdGFsRmlsZXM6IGZpbGVzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICBzdWNjZXNzQ291bnQ6IHN1Y2Nlc3NDb3VudCxcbiAgICAgICAgICAgICAgICBlcnJvckNvdW50OiBlcnJvckNvdW50LFxuICAgICAgICAgICAgICAgIHJlc3VsdHM6IGltcG9ydFJlc3VsdHMsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogYEJhdGNoIGltcG9ydCBjb21wbGV0ZWQ6ICR7c3VjY2Vzc0NvdW50fSBzdWNjZXNzLCAke2Vycm9yQ291bnR9IGVycm9yc2BcbiAgICAgICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgZ2V0RmlsZXNGcm9tRGlyZWN0b3J5KGRpclBhdGg6IHN0cmluZywgZmlsZUZpbHRlcjogc3RyaW5nW10sIHJlY3Vyc2l2ZTogYm9vbGVhbik6IHN0cmluZ1tdIHtcbiAgICAgICAgY29uc3QgZnMgPSByZXF1aXJlKCdmcycpO1xuICAgICAgICBjb25zdCBwYXRoID0gcmVxdWlyZSgncGF0aCcpO1xuICAgICAgICBjb25zdCBmaWxlczogc3RyaW5nW10gPSBbXTtcblxuICAgICAgICBjb25zdCBpdGVtcyA9IGZzLnJlYWRkaXJTeW5jKGRpclBhdGgpO1xuICAgICAgICBcbiAgICAgICAgZm9yIChjb25zdCBpdGVtIG9mIGl0ZW1zKSB7XG4gICAgICAgICAgICBjb25zdCBmdWxsUGF0aCA9IHBhdGguam9pbihkaXJQYXRoLCBpdGVtKTtcbiAgICAgICAgICAgIGNvbnN0IHN0YXQgPSBmcy5zdGF0U3luYyhmdWxsUGF0aCk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmIChzdGF0LmlzRmlsZSgpKSB7XG4gICAgICAgICAgICAgICAgaWYgKGZpbGVGaWx0ZXIubGVuZ3RoID09PSAwIHx8IGZpbGVGaWx0ZXIuc29tZShleHQgPT4gaXRlbS50b0xvd2VyQ2FzZSgpLmVuZHNXaXRoKGV4dC50b0xvd2VyQ2FzZSgpKSkpIHtcbiAgICAgICAgICAgICAgICAgICAgZmlsZXMucHVzaChmdWxsUGF0aCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIGlmIChzdGF0LmlzRGlyZWN0b3J5KCkgJiYgcmVjdXJzaXZlKSB7XG4gICAgICAgICAgICAgICAgZmlsZXMucHVzaCguLi50aGlzLmdldEZpbGVzRnJvbURpcmVjdG9yeShmdWxsUGF0aCwgZmlsZUZpbHRlciwgcmVjdXJzaXZlKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHJldHVybiBmaWxlcztcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGJhdGNoRGVsZXRlQXNzZXRzSW1wbCh1cmxzOiBzdHJpbmdbXSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IGRlbGV0ZVJlc3VsdHM6IGFueVtdID0gW107XG4gICAgICAgIGxldCBzdWNjZXNzQ291bnQgPSAwO1xuICAgICAgICBsZXQgZXJyb3JDb3VudCA9IDA7XG5cbiAgICAgICAgZm9yIChjb25zdCB1cmwgb2YgdXJscykge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdkZWxldGUtYXNzZXQnLCB1cmwpO1xuICAgICAgICAgICAgICAgIGRlbGV0ZVJlc3VsdHMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgIHVybDogdXJsLFxuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgc3VjY2Vzc0NvdW50Kys7XG4gICAgICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgICAgIGRlbGV0ZVJlc3VsdHMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgIHVybDogdXJsLFxuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGVyci5tZXNzYWdlXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgZXJyb3JDb3VudCsrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG9rKHtcbiAgICAgICAgICAgICAgICB0b3RhbEFzc2V0czogdXJscy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgc3VjY2Vzc0NvdW50OiBzdWNjZXNzQ291bnQsXG4gICAgICAgICAgICAgICAgZXJyb3JDb3VudDogZXJyb3JDb3VudCxcbiAgICAgICAgICAgICAgICByZXN1bHRzOiBkZWxldGVSZXN1bHRzLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBCYXRjaCBkZWxldGUgY29tcGxldGVkOiAke3N1Y2Nlc3NDb3VudH0gc3VjY2VzcywgJHtlcnJvckNvdW50fSBlcnJvcnNgXG4gICAgICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHZhbGlkYXRlQXNzZXRSZWZlcmVuY2VzSW1wbChkaXJlY3Rvcnk6IHN0cmluZyA9ICdkYjovL2Fzc2V0cycpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICAvLyBHZXQgYWxsIGFzc2V0cyBpbiBkaXJlY3RvcnlcbiAgICAgICAgY29uc3QgYXNzZXRzID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXRzJywgeyBwYXR0ZXJuOiBgJHtkaXJlY3Rvcnl9LyoqLypgIH0pO1xuICAgICAgICBcbiAgICAgICAgY29uc3QgYnJva2VuUmVmZXJlbmNlczogYW55W10gPSBbXTtcbiAgICAgICAgY29uc3QgdmFsaWRSZWZlcmVuY2VzOiBhbnlbXSA9IFtdO1xuXG4gICAgICAgIGZvciAoY29uc3QgYXNzZXQgb2YgYXNzZXRzKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGFzc2V0SW5mbyA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0LWluZm8nLCBhc3NldC51cmwpO1xuICAgICAgICAgICAgICAgIGlmIChhc3NldEluZm8pIHtcbiAgICAgICAgICAgICAgICAgICAgdmFsaWRSZWZlcmVuY2VzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgdXJsOiBhc3NldC51cmwsXG4gICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiBhc3NldC51dWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogYXNzZXQubmFtZVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgICAgICBicm9rZW5SZWZlcmVuY2VzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICB1cmw6IGFzc2V0LnVybCxcbiAgICAgICAgICAgICAgICAgICAgdXVpZDogYXNzZXQudXVpZCxcbiAgICAgICAgICAgICAgICAgICAgbmFtZTogYXNzZXQubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgZXJyb3I6IChlcnIgYXMgRXJyb3IpLm1lc3NhZ2VcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgZGlyZWN0b3J5OiBkaXJlY3RvcnksXG4gICAgICAgICAgICAgICAgdG90YWxBc3NldHM6IGFzc2V0cy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgdmFsaWRSZWZlcmVuY2VzOiB2YWxpZFJlZmVyZW5jZXMubGVuZ3RoLFxuICAgICAgICAgICAgICAgIGJyb2tlblJlZmVyZW5jZXM6IGJyb2tlblJlZmVyZW5jZXMubGVuZ3RoLFxuICAgICAgICAgICAgICAgIGJyb2tlbkFzc2V0czogYnJva2VuUmVmZXJlbmNlcyxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiBgVmFsaWRhdGlvbiBjb21wbGV0ZWQ6ICR7YnJva2VuUmVmZXJlbmNlcy5sZW5ndGh9IGJyb2tlbiByZWZlcmVuY2VzIGZvdW5kYFxuICAgICAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRBc3NldERlcGVuZGVuY2llc0ltcGwodXJsT3JVVUlEOiBzdHJpbmcsIGRpcmVjdGlvbjogc3RyaW5nID0gJ2RlcGVuZGVuY2llcycpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIC8vIE5vdGU6IFRoaXMgd291bGQgcmVxdWlyZSBzY2VuZSBhbmFseXNpcyBvciBhZGRpdGlvbmFsIEFQSXMgbm90IGF2YWlsYWJsZSBpbiBjdXJyZW50IGRvY3VtZW50YXRpb25cbiAgICAgICAgICAgIHJlc29sdmUoZmFpbCgnQXNzZXQgZGVwZW5kZW5jeSBhbmFseXNpcyByZXF1aXJlcyBhZGRpdGlvbmFsIEFQSXMgbm90IGF2YWlsYWJsZSBpbiBjdXJyZW50IENvY29zIENyZWF0b3IgTUNQIGltcGxlbWVudGF0aW9uLiBDb25zaWRlciB1c2luZyB0aGUgRWRpdG9yIFVJIGZvciBkZXBlbmRlbmN5IGFuYWx5c2lzLicpKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRVbnVzZWRBc3NldHNJbXBsKGRpcmVjdG9yeTogc3RyaW5nID0gJ2RiOi8vYXNzZXRzJywgZXhjbHVkZURpcmVjdG9yaWVzOiBzdHJpbmdbXSA9IFtdKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICAvLyBOb3RlOiBUaGlzIHdvdWxkIHJlcXVpcmUgY29tcHJlaGVuc2l2ZSBwcm9qZWN0IGFuYWx5c2lzXG4gICAgICAgICAgICByZXNvbHZlKGZhaWwoJ1VudXNlZCBhc3NldCBkZXRlY3Rpb24gcmVxdWlyZXMgY29tcHJlaGVuc2l2ZSBwcm9qZWN0IGFuYWx5c2lzIG5vdCBhdmFpbGFibGUgaW4gY3VycmVudCBDb2NvcyBDcmVhdG9yIE1DUCBpbXBsZW1lbnRhdGlvbi4gQ29uc2lkZXIgdXNpbmcgdGhlIEVkaXRvciBVSSBvciB0aGlyZC1wYXJ0eSB0b29scyBmb3IgdW51c2VkIGFzc2V0IGRldGVjdGlvbi4nKSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgY29tcHJlc3NUZXh0dXJlc0ltcGwoZGlyZWN0b3J5OiBzdHJpbmcgPSAnZGI6Ly9hc3NldHMnLCBmb3JtYXQ6IHN0cmluZyA9ICdhdXRvJywgcXVhbGl0eTogbnVtYmVyID0gMC44KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICAvLyBOb3RlOiBUZXh0dXJlIGNvbXByZXNzaW9uIHdvdWxkIHJlcXVpcmUgaW1hZ2UgcHJvY2Vzc2luZyBBUElzXG4gICAgICAgICAgICByZXNvbHZlKGZhaWwoJ1RleHR1cmUgY29tcHJlc3Npb24gcmVxdWlyZXMgaW1hZ2UgcHJvY2Vzc2luZyBjYXBhYmlsaXRpZXMgbm90IGF2YWlsYWJsZSBpbiBjdXJyZW50IENvY29zIENyZWF0b3IgTUNQIGltcGxlbWVudGF0aW9uLiBVc2UgdGhlIEVkaXRvclxcJ3MgYnVpbHQtaW4gdGV4dHVyZSBjb21wcmVzc2lvbiBzZXR0aW5ncyBvciBleHRlcm5hbCB0b29scy4nKSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZXhwb3J0QXNzZXRNYW5pZmVzdEltcGwoZGlyZWN0b3J5OiBzdHJpbmcgPSAnZGI6Ly9hc3NldHMnLCBmb3JtYXQ6IHN0cmluZyA9ICdqc29uJywgaW5jbHVkZU1ldGFkYXRhOiBib29sZWFuID0gdHJ1ZSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IGFzc2V0cyA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0cycsIHsgcGF0dGVybjogYCR7ZGlyZWN0b3J5fS8qKi8qYCB9KTtcbiAgICAgICAgXG4gICAgICAgIGNvbnN0IG1hbmlmZXN0OiBhbnlbXSA9IFtdO1xuXG4gICAgICAgIGZvciAoY29uc3QgYXNzZXQgb2YgYXNzZXRzKSB7XG4gICAgICAgICAgICBjb25zdCBtYW5pZmVzdEVudHJ5OiBhbnkgPSB7XG4gICAgICAgICAgICAgICAgbmFtZTogYXNzZXQubmFtZSxcbiAgICAgICAgICAgICAgICB1cmw6IGFzc2V0LnVybCxcbiAgICAgICAgICAgICAgICB1dWlkOiBhc3NldC51dWlkLFxuICAgICAgICAgICAgICAgIHR5cGU6IGFzc2V0LnR5cGUsXG4gICAgICAgICAgICAgICAgc2l6ZTogKGFzc2V0IGFzIGFueSkuc2l6ZSB8fCAwLFxuICAgICAgICAgICAgICAgIGlzRGlyZWN0b3J5OiBhc3NldC5pc0RpcmVjdG9yeSB8fCBmYWxzZVxuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgaWYgKGluY2x1ZGVNZXRhZGF0YSkge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGFzc2V0SW5mbyA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0LWluZm8nLCBhc3NldC51cmwpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoYXNzZXRJbmZvICYmIGFzc2V0SW5mby5tZXRhKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBtYW5pZmVzdEVudHJ5Lm1ldGEgPSBhc3NldEluZm8ubWV0YTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgICAgICAgICAvLyBTa2lwIG1ldGFkYXRhIGlmIG5vdCBhdmFpbGFibGVcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIG1hbmlmZXN0LnB1c2gobWFuaWZlc3RFbnRyeSk7XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgZXhwb3J0RGF0YTogc3RyaW5nO1xuICAgICAgICBzd2l0Y2ggKGZvcm1hdCkge1xuICAgICAgICAgICAgY2FzZSAnanNvbic6XG4gICAgICAgICAgICAgICAgZXhwb3J0RGF0YSA9IEpTT04uc3RyaW5naWZ5KG1hbmlmZXN0LCBudWxsLCAyKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ2Nzdic6XG4gICAgICAgICAgICAgICAgZXhwb3J0RGF0YSA9IHRoaXMuY29udmVydFRvQ1NWKG1hbmlmZXN0KTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ3htbCc6XG4gICAgICAgICAgICAgICAgZXhwb3J0RGF0YSA9IHRoaXMuY29udmVydFRvWE1MKG1hbmlmZXN0KTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgZXhwb3J0RGF0YSA9IEpTT04uc3RyaW5naWZ5KG1hbmlmZXN0LCBudWxsLCAyKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgZGlyZWN0b3J5OiBkaXJlY3RvcnksXG4gICAgICAgICAgICAgICAgZm9ybWF0OiBmb3JtYXQsXG4gICAgICAgICAgICAgICAgYXNzZXRDb3VudDogbWFuaWZlc3QubGVuZ3RoLFxuICAgICAgICAgICAgICAgIGluY2x1ZGVNZXRhZGF0YTogaW5jbHVkZU1ldGFkYXRhLFxuICAgICAgICAgICAgICAgIG1hbmlmZXN0OiBleHBvcnREYXRhLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBBc3NldCBtYW5pZmVzdCBleHBvcnRlZCB3aXRoICR7bWFuaWZlc3QubGVuZ3RofSBhc3NldHNgXG4gICAgICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGNvbnZlcnRUb0NTVihkYXRhOiBhbnlbXSk6IHN0cmluZyB7XG4gICAgICAgIGlmIChkYXRhLmxlbmd0aCA9PT0gMCkgcmV0dXJuICcnO1xuICAgICAgICBcbiAgICAgICAgY29uc3QgaGVhZGVycyA9IE9iamVjdC5rZXlzKGRhdGFbMF0pO1xuICAgICAgICBjb25zdCBjc3ZSb3dzID0gW2hlYWRlcnMuam9pbignLCcpXTtcbiAgICAgICAgXG4gICAgICAgIGZvciAoY29uc3Qgcm93IG9mIGRhdGEpIHtcbiAgICAgICAgICAgIGNvbnN0IHZhbHVlcyA9IGhlYWRlcnMubWFwKGhlYWRlciA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgdmFsdWUgPSByb3dbaGVhZGVyXTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyA/IEpTT04uc3RyaW5naWZ5KHZhbHVlKSA6IFN0cmluZyh2YWx1ZSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGNzdlJvd3MucHVzaCh2YWx1ZXMuam9pbignLCcpKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgcmV0dXJuIGNzdlJvd3Muam9pbignXFxuJyk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBjb252ZXJ0VG9YTUwoZGF0YTogYW55W10pOiBzdHJpbmcge1xuICAgICAgICBsZXQgeG1sID0gJzw/eG1sIHZlcnNpb249XCIxLjBcIiBlbmNvZGluZz1cIlVURi04XCI/Plxcbjxhc3NldHM+XFxuJztcbiAgICAgICAgXG4gICAgICAgIGZvciAoY29uc3QgaXRlbSBvZiBkYXRhKSB7XG4gICAgICAgICAgICB4bWwgKz0gJyAgPGFzc2V0Plxcbic7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhpdGVtKSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHhtbFZhbHVlID0gdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyA/IFxuICAgICAgICAgICAgICAgICAgICBKU09OLnN0cmluZ2lmeSh2YWx1ZSkgOiBcbiAgICAgICAgICAgICAgICAgICAgU3RyaW5nKHZhbHVlKS5yZXBsYWNlKC8mL2csICcmYW1wOycpLnJlcGxhY2UoLzwvZywgJyZsdDsnKS5yZXBsYWNlKC8+L2csICcmZ3Q7Jyk7XG4gICAgICAgICAgICAgICAgeG1sICs9IGAgICAgPCR7a2V5fT4ke3htbFZhbHVlfTwvJHtrZXl9PlxcbmA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB4bWwgKz0gJyAgPC9hc3NldD5cXG4nO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICB4bWwgKz0gJzwvYXNzZXRzPic7XG4gICAgICAgIHJldHVybiB4bWw7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRVc2Vyc0ltcGwodGFyZ2V0VXVpZDogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3Qgc2NlbmVzID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXRzJywgeyBwYXR0ZXJuOiAnZGI6Ly9hc3NldHMvKionLCBjY1R5cGU6ICdjYy5TY2VuZUFzc2V0JyB9KTtcbiAgICAgICAgY29uc3QgcHJlZmFicyA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0cycsIHsgcGF0dGVybjogJ2RiOi8vYXNzZXRzLyoqJywgY2NUeXBlOiAnY2MuUHJlZmFiJyB9KTtcbiAgICAgICAgY29uc3Qgc2NyaXB0c1RzID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXRzJywgeyBwYXR0ZXJuOiAnZGI6Ly9hc3NldHMvKiovKi50cycgfSk7XG4gICAgICAgIGNvbnN0IHNjcmlwdHNKcyA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0cycsIHsgcGF0dGVybjogJ2RiOi8vYXNzZXRzLyoqLyouanMnIH0pO1xuICAgICAgICBcbiAgICAgICAgY29uc3QgYWxsQXNzZXRzID0gWy4uLnNjZW5lcywgLi4ucHJlZmFicywgLi4uc2NyaXB0c1RzLCAuLi5zY3JpcHRzSnNdO1xuICAgICAgICBjb25zdCB1bmlxdWVBc3NldHMgPSBBcnJheS5mcm9tKG5ldyBNYXAoYWxsQXNzZXRzLm1hcCgoYTogYW55KSA9PiBbYS51dWlkLCBhXSkpLnZhbHVlcygpKTtcblxuICAgICAgICBjb25zdCB1c2VyczogYW55W10gPSBbXTtcbiAgICAgICAgZm9yIChjb25zdCBhc3NldCBvZiB1bmlxdWVBc3NldHMpIHtcbiAgICAgICAgICAgIGNvbnN0IGRlcHMgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldC1kZXBlbmRzJywgYXNzZXQudXVpZCk7XG4gICAgICAgICAgICBpZiAoZGVwcyAmJiBkZXBzLmluY2x1ZGVzKHRhcmdldFV1aWQpKSB7XG4gICAgICAgICAgICAgICAgbGV0IHR5cGUgPSAnc2NyaXB0JztcbiAgICAgICAgICAgICAgICBpZiAoYXNzZXQudHlwZSA9PT0gJ2NjLlNjZW5lQXNzZXQnKSB0eXBlID0gJ3NjZW5lJztcbiAgICAgICAgICAgICAgICBlbHNlIGlmIChhc3NldC50eXBlID09PSAnY2MuUHJlZmFiJykgdHlwZSA9ICdwcmVmYWInO1xuICAgICAgICAgICAgICAgIHVzZXJzLnB1c2goeyB0eXBlLCB1dWlkOiBhc3NldC51dWlkLCBwYXRoOiBhc3NldC51cmwsIG5hbWU6IGFzc2V0Lm5hbWUgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHJldHVybiBvayh7IHV1aWQ6IHRhcmdldFV1aWQsIHVzZXJzLCB0b3RhbDogdXNlcnMubGVuZ3RoIH0pO1xuICAgIH1cbn1cbiJdfQ==