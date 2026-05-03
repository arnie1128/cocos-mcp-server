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
    async getTree(args) {
        return this.getTreeImpl(args.directory, args.maxDepth);
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
    async getTreeImpl(directory = 'db://assets', maxDepth = 8) {
        var _a, _b, _c, _d;
        const rootUrl = directory.replace(/\/+$/, '');
        const boundedDepth = Math.max(0, Math.min(32, Math.floor(maxDepth)));
        const assets = await Editor.Message.request('asset-db', 'query-assets', { pattern: `${rootUrl}/**/*` });
        const rootName = (_a = rootUrl.split('/').filter(Boolean).pop()) !== null && _a !== void 0 ? _a : rootUrl;
        const root = {
            name: rootName,
            url: rootUrl,
            isDirectory: true,
            children: [],
        };
        const directories = new Map([[rootUrl, root]]);
        const ensureDirectory = (url) => {
            var _a;
            const normalized = url.replace(/\/+$/, '');
            const existing = directories.get(normalized);
            if (existing)
                return existing;
            const parentUrl = normalized.slice(0, normalized.lastIndexOf('/'));
            const parent = parentUrl.startsWith(rootUrl) ? ensureDirectory(parentUrl) : root;
            const node = {
                name: (_a = normalized.split('/').pop()) !== null && _a !== void 0 ? _a : normalized,
                url: normalized,
                isDirectory: true,
                children: [],
            };
            directories.set(normalized, node);
            parent.children.push(node);
            return node;
        };
        const depthOf = (url) => {
            const rel = url.slice(rootUrl.length).replace(/^\/+/, '');
            if (!rel)
                return 0;
            return rel.split('/').filter(Boolean).length;
        };
        for (const asset of assets) {
            const url = String((_b = asset.url) !== null && _b !== void 0 ? _b : '').replace(/\/+$/, '');
            if (!url.startsWith(`${rootUrl}/`) || depthOf(url) > boundedDepth)
                continue;
            const parentUrl = url.slice(0, url.lastIndexOf('/'));
            const parent = parentUrl.startsWith(rootUrl) ? ensureDirectory(parentUrl) : root;
            if (asset.isDirectory) {
                const dir = ensureDirectory(url);
                dir.uuid = asset.uuid;
                dir.type = asset.type;
                continue;
            }
            parent.children.push({
                name: (_d = (_c = asset.name) !== null && _c !== void 0 ? _c : url.split('/').pop()) !== null && _d !== void 0 ? _d : url,
                url,
                uuid: asset.uuid,
                type: asset.type,
                isDirectory: false,
                children: [],
            });
        }
        const sortTree = (node) => {
            node.children.sort((a, b) => {
                if (a.isDirectory !== b.isDirectory)
                    return a.isDirectory ? -1 : 1;
                return a.name.localeCompare(b.name);
            });
            node.children.forEach(sortTree);
        };
        sortTree(root);
        return (0, response_1.ok)({
            directory: rootUrl,
            maxDepth: boundedDepth,
            assetCount: assets.length,
            tree: root,
        });
    }
    async getAssetDependenciesImpl(urlOrUUID, direction = 'dependencies') {
        return new Promise((resolve) => {
            // Note: This would require scene analysis or additional APIs not available in current documentation
            resolve((0, response_1.fail)('Asset dependency analysis requires additional APIs not available in current Cocos Creator MCP implementation. Consider using the Editor UI for dependency analysis.'));
        });
    }
    async getUnusedAssetsImpl(directory = 'db://assets', excludeDirectories = []) {
        var _a;
        const rootUrl = directory.replace(/\/+$/, '');
        const excludes = excludeDirectories.map(dir => dir.replace(/\/+$/, ''));
        const allAssets = await Editor.Message.request('asset-db', 'query-assets', { pattern: `${rootUrl}/**/*` });
        const scenes = await Editor.Message.request('asset-db', 'query-assets', { pattern: 'db://assets/**', ccType: 'cc.SceneAsset' });
        const prefabs = await Editor.Message.request('asset-db', 'query-assets', { pattern: 'db://assets/**', ccType: 'cc.Prefab' });
        const roots = Array.from(new Map([...scenes, ...prefabs].map((asset) => [asset.uuid, asset])).values());
        const referencedUuids = new Set();
        const dependencyErrors = [];
        const addDependency = (dep) => {
            if (typeof dep === 'string') {
                referencedUuids.add(dep);
            }
            else if ((dep === null || dep === void 0 ? void 0 : dep.uuid) && typeof dep.uuid === 'string') {
                referencedUuids.add(dep.uuid);
            }
        };
        for (const asset of roots) {
            referencedUuids.add(asset.uuid);
            try {
                const deps = await Editor.Message.request('asset-db', 'query-asset-dependencies', asset.uuid, undefined);
                if (Array.isArray(deps)) {
                    deps.forEach(addDependency);
                }
            }
            catch (err) {
                dependencyErrors.push({
                    uuid: asset.uuid,
                    url: asset.url,
                    error: (_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : String(err),
                });
            }
        }
        const isExcluded = (url) => excludes.some(dir => url === dir || url.startsWith(`${dir}/`));
        const candidates = allAssets.filter((asset) => {
            var _a;
            const url = String((_a = asset.url) !== null && _a !== void 0 ? _a : '');
            if (!url.startsWith(`${rootUrl}/`))
                return false;
            if (asset.isDirectory)
                return false;
            if (!asset.uuid)
                return false;
            if (isExcluded(url))
                return false;
            return !referencedUuids.has(asset.uuid);
        });
        return (0, response_1.ok)({
            directory: rootUrl,
            excludeDirectories: excludes,
            scannedRoots: roots.map((asset) => ({
                uuid: asset.uuid,
                url: asset.url,
                name: asset.name,
                type: asset.type,
            })),
            referencedCount: referencedUuids.size,
            totalAssets: allAssets.length,
            unusedCount: candidates.length,
            unusedAssets: candidates.map((asset) => ({
                uuid: asset.uuid,
                url: asset.url,
                name: asset.name,
                type: asset.type,
            })),
            dependencyErrors,
            message: `Unused asset scan completed: ${candidates.length} unreferenced assets found`,
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
            const deps = await Editor.Message.request('asset-db', 'query-asset-dependencies', asset.uuid, undefined);
            if (Array.isArray(deps) && deps.includes(targetUuid)) {
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
        name: 'get_tree',
        title: 'Get asset tree',
        description: asset_advanced_docs_1.ASSET_ADVANCED_DOCS.get_tree,
        inputSchema: schema_1.z.object({
            directory: schema_1.z.string().default('db://assets').describe('Asset-db directory to use as the tree root. Default db://assets.'),
            maxDepth: schema_1.z.number().min(0).max(32).default(8).describe('Maximum descendant depth to include below the root directory.'),
        }),
    })
], AssetAdvancedTools.prototype, "getTree", null);
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
            directory: schema_1.z.string().default('db://assets').describe('Asset-db directory to scan. Default db://assets.'),
            excludeDirectories: schema_1.z.array(schema_1.z.string()).default([]).describe('Directories to exclude from unused-asset reporting.'),
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXNzZXQtYWR2YW5jZWQtdG9vbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvdG9vbHMvYXNzZXQtYWR2YW5jZWQtdG9vbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7O0FBQUEsOENBQTJDO0FBRTNDLDBDQUFrQztBQUNsQyxrREFBdUU7QUFDdkUscUVBQWtFO0FBV2xFLE1BQWEsa0JBQWtCO0lBRzNCO1FBQ0ksSUFBSSxDQUFDLElBQUksR0FBRyxJQUFBLHNDQUF5QixFQUFDLElBQUksQ0FBQyxDQUFDO0lBQ2hELENBQUM7SUFFRCxRQUFRLEtBQXVCLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDN0QsT0FBTyxDQUFDLFFBQWdCLEVBQUUsSUFBUyxJQUEyQixPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFXbkcsQUFBTixLQUFLLENBQUMsYUFBYSxDQUFDLElBQTRDO1FBQzVELE9BQU8sSUFBSSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ2hFLENBQUM7SUFVSyxBQUFOLEtBQUssQ0FBQyxvQkFBb0IsQ0FBQyxJQUFxQjtRQUM1QyxPQUFPLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDbkQsQ0FBQztJQVFLLEFBQU4sS0FBSyxDQUFDLGlCQUFpQjtRQUNuQixPQUFPLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO0lBQ3hDLENBQUM7SUFVSyxBQUFOLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxJQUEyQjtRQUMvQyxPQUFPLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDdEQsQ0FBQztJQWNLLEFBQU4sS0FBSyxDQUFDLGlCQUFpQixDQUFDLElBQVM7UUFDN0IsT0FBTyxJQUFJLENBQUMscUJBQXFCLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDNUMsQ0FBQztJQVVLLEFBQU4sS0FBSyxDQUFDLGlCQUFpQixDQUFDLElBQXdCO1FBQzVDLE9BQU8sSUFBSSxDQUFDLHFCQUFxQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNqRCxDQUFDO0lBVUssQUFBTixLQUFLLENBQUMsdUJBQXVCLENBQUMsSUFBNEI7UUFDdEQsT0FBTyxJQUFJLENBQUMsMkJBQTJCLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQzVELENBQUM7SUFXSyxBQUFOLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBK0M7UUFDekQsT0FBTyxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQzNELENBQUM7SUFXSyxBQUFOLEtBQUssQ0FBQyxvQkFBb0IsQ0FBQyxJQUErQztRQUN0RSxPQUFPLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUN6RSxDQUFDO0lBV0ssQUFBTixLQUFLLENBQUMsZUFBZSxDQUFDLElBQTJEO1FBQzdFLE9BQU8sSUFBSSxDQUFDLG1CQUFtQixDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLGtCQUFrQixDQUFDLENBQUM7SUFDN0UsQ0FBQztJQVlLLEFBQU4sS0FBSyxDQUFDLGdCQUFnQixDQUFDLElBQStEO1FBQ2xGLE9BQU8sSUFBSSxDQUFDLG9CQUFvQixDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDaEYsQ0FBQztJQVlLLEFBQU4sS0FBSyxDQUFDLG1CQUFtQixDQUFDLElBQXdFO1FBQzlGLE9BQU8sSUFBSSxDQUFDLHVCQUF1QixDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUM7SUFDM0YsQ0FBQztJQVVLLEFBQU4sS0FBSyxDQUFDLFFBQVEsQ0FBQyxJQUFzQjtRQUNqQyxPQUFPLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3hDLENBQUM7SUFFTyxLQUFLLENBQUMsaUJBQWlCLENBQUMsU0FBaUIsRUFBRSxPQUFlO1FBQzlELE9BQU8sSUFBSSxPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsRUFBRTtZQUMzQixNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUUsaUJBQWlCLEVBQUUsU0FBUyxFQUFFLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQVcsRUFBRSxFQUFFO2dCQUMzRixPQUFPLENBQUMsSUFBQSxhQUFFLEVBQUM7b0JBQ0gsSUFBSSxFQUFFLE1BQU0sYUFBTixNQUFNLHVCQUFOLE1BQU0sQ0FBRSxJQUFJO29CQUNsQixHQUFHLEVBQUUsTUFBTSxhQUFOLE1BQU0sdUJBQU4sTUFBTSxDQUFFLEdBQUc7b0JBQ2hCLE9BQU8sRUFBRSwrQkFBK0I7aUJBQzNDLENBQUMsQ0FBQyxDQUFDO1lBQ1osQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBVSxFQUFFLEVBQUU7Z0JBQ3BCLE9BQU8sQ0FBQyxJQUFBLGVBQUksRUFBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztZQUMvQixDQUFDLENBQUMsQ0FBQztRQUNQLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztJQUVPLEtBQUssQ0FBQyx3QkFBd0IsQ0FBQyxHQUFXO1FBQzlDLE9BQU8sSUFBSSxPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsRUFBRTtZQUMzQixNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUUsd0JBQXdCLEVBQUUsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsWUFBb0IsRUFBRSxFQUFFO2dCQUM1RixPQUFPLENBQUMsSUFBQSxhQUFFLEVBQUM7b0JBQ0gsV0FBVyxFQUFFLEdBQUc7b0JBQ2hCLFlBQVksRUFBRSxZQUFZO29CQUMxQixPQUFPLEVBQUUsWUFBWSxLQUFLLEdBQUcsQ0FBQyxDQUFDO3dCQUMzQixrQkFBa0IsQ0FBQyxDQUFDO3dCQUNwQiw2QkFBNkI7aUJBQ3BDLENBQUMsQ0FBQyxDQUFDO1lBQ1osQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBVSxFQUFFLEVBQUU7Z0JBQ3BCLE9BQU8sQ0FBQyxJQUFBLGVBQUksRUFBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztZQUMvQixDQUFDLENBQUMsQ0FBQztRQUNQLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztJQUVPLEtBQUssQ0FBQyxxQkFBcUI7UUFDL0IsT0FBTyxJQUFJLE9BQU8sQ0FBQyxDQUFDLE9BQU8sRUFBRSxFQUFFO1lBQzNCLE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLFVBQVUsRUFBRSxhQUFhLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxLQUFjLEVBQUUsRUFBRTtnQkFDdEUsT0FBTyxDQUFDLElBQUEsYUFBRSxFQUFDO29CQUNILEtBQUssRUFBRSxLQUFLO29CQUNaLE9BQU8sRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyw2QkFBNkI7aUJBQzdFLENBQUMsQ0FBQyxDQUFDO1lBQ1osQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBVSxFQUFFLEVBQUU7Z0JBQ3BCLE9BQU8sQ0FBQyxJQUFBLGVBQUksRUFBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztZQUMvQixDQUFDLENBQUMsQ0FBQztRQUNQLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztJQUVPLEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxTQUFpQjtRQUNqRCxPQUFPLElBQUksT0FBTyxDQUFDLENBQUMsT0FBTyxFQUFFLEVBQUU7WUFDM0IsTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsVUFBVSxFQUFFLFlBQVksRUFBRSxTQUFTLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFO2dCQUNsRSxPQUFPLENBQUMsSUFBQSxhQUFFLEVBQUMsU0FBUyxFQUFFLG9DQUFvQyxDQUFDLENBQUMsQ0FBQztZQUNqRSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFVLEVBQUUsRUFBRTtnQkFDcEIsT0FBTyxDQUFDLElBQUEsZUFBSSxFQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQy9CLENBQUMsQ0FBQyxDQUFDO1FBQ1AsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDO0lBRU8sS0FBSyxDQUFDLHFCQUFxQixDQUFDLElBQVM7UUFDekMsTUFBTSxFQUFFLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3pCLE1BQU0sSUFBSSxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUU3QixJQUFJLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLEVBQUUsQ0FBQztZQUN2QyxPQUFPLElBQUEsZUFBSSxFQUFDLGlDQUFpQyxDQUFDLENBQUM7UUFDbkQsQ0FBQztRQUVELE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxxQkFBcUIsQ0FDcEMsSUFBSSxDQUFDLGVBQWUsRUFDcEIsSUFBSSxDQUFDLFVBQVUsSUFBSSxFQUFFLEVBQ3JCLElBQUksQ0FBQyxTQUFTLElBQUksS0FBSyxDQUMxQixDQUFDO1FBRUYsTUFBTSxhQUFhLEdBQVUsRUFBRSxDQUFDO1FBQ2hDLElBQUksWUFBWSxHQUFHLENBQUMsQ0FBQztRQUNyQixJQUFJLFVBQVUsR0FBRyxDQUFDLENBQUM7UUFFbkIsS0FBSyxNQUFNLFFBQVEsSUFBSSxLQUFLLEVBQUUsQ0FBQztZQUMzQixJQUFJLENBQUM7Z0JBQ0QsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQztnQkFDekMsTUFBTSxVQUFVLEdBQUcsR0FBRyxJQUFJLENBQUMsZUFBZSxJQUFJLFFBQVEsRUFBRSxDQUFDO2dCQUV6RCxNQUFNLE1BQU0sR0FBRyxNQUFNLE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLFVBQVUsRUFBRSxjQUFjLEVBQ2xFLFFBQVEsRUFBRSxVQUFVLEVBQUU7b0JBQ2xCLFNBQVMsRUFBRSxJQUFJLENBQUMsU0FBUyxJQUFJLEtBQUs7b0JBQ2xDLE1BQU0sRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsSUFBSSxLQUFLLENBQUM7aUJBQ3JDLENBQUMsQ0FBQztnQkFFUCxhQUFhLENBQUMsSUFBSSxDQUFDO29CQUNmLE1BQU0sRUFBRSxRQUFRO29CQUNoQixNQUFNLEVBQUUsVUFBVTtvQkFDbEIsT0FBTyxFQUFFLElBQUk7b0JBQ2IsSUFBSSxFQUFFLE1BQU0sYUFBTixNQUFNLHVCQUFOLE1BQU0sQ0FBRSxJQUFJO2lCQUNyQixDQUFDLENBQUM7Z0JBQ0gsWUFBWSxFQUFFLENBQUM7WUFDbkIsQ0FBQztZQUFDLE9BQU8sR0FBUSxFQUFFLENBQUM7Z0JBQ2hCLGFBQWEsQ0FBQyxJQUFJLENBQUM7b0JBQ2YsTUFBTSxFQUFFLFFBQVE7b0JBQ2hCLE9BQU8sRUFBRSxLQUFLO29CQUNkLEtBQUssRUFBRSxHQUFHLENBQUMsT0FBTztpQkFDckIsQ0FBQyxDQUFDO2dCQUNILFVBQVUsRUFBRSxDQUFDO1lBQ2pCLENBQUM7UUFDTCxDQUFDO1FBRUQsT0FBTyxJQUFBLGFBQUUsRUFBQztZQUNGLFVBQVUsRUFBRSxLQUFLLENBQUMsTUFBTTtZQUN4QixZQUFZLEVBQUUsWUFBWTtZQUMxQixVQUFVLEVBQUUsVUFBVTtZQUN0QixPQUFPLEVBQUUsYUFBYTtZQUN0QixPQUFPLEVBQUUsMkJBQTJCLFlBQVksYUFBYSxVQUFVLFNBQVM7U0FDbkYsQ0FBQyxDQUFDO0lBQ1gsQ0FBQztJQUVPLHFCQUFxQixDQUFDLE9BQWUsRUFBRSxVQUFvQixFQUFFLFNBQWtCO1FBQ25GLE1BQU0sRUFBRSxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN6QixNQUFNLElBQUksR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDN0IsTUFBTSxLQUFLLEdBQWEsRUFBRSxDQUFDO1FBRTNCLE1BQU0sS0FBSyxHQUFHLEVBQUUsQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUM7UUFFdEMsS0FBSyxNQUFNLElBQUksSUFBSSxLQUFLLEVBQUUsQ0FBQztZQUN2QixNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsQ0FBQztZQUMxQyxNQUFNLElBQUksR0FBRyxFQUFFLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBRW5DLElBQUksSUFBSSxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUM7Z0JBQ2hCLElBQUksVUFBVSxDQUFDLE1BQU0sS0FBSyxDQUFDLElBQUksVUFBVSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDO29CQUNwRyxLQUFLLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO2dCQUN6QixDQUFDO1lBQ0wsQ0FBQztpQkFBTSxJQUFJLElBQUksQ0FBQyxXQUFXLEVBQUUsSUFBSSxTQUFTLEVBQUUsQ0FBQztnQkFDekMsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxRQUFRLEVBQUUsVUFBVSxFQUFFLFNBQVMsQ0FBQyxDQUFDLENBQUM7WUFDL0UsQ0FBQztRQUNMLENBQUM7UUFFRCxPQUFPLEtBQUssQ0FBQztJQUNqQixDQUFDO0lBRU8sS0FBSyxDQUFDLHFCQUFxQixDQUFDLElBQWM7UUFDOUMsTUFBTSxhQUFhLEdBQVUsRUFBRSxDQUFDO1FBQ2hDLElBQUksWUFBWSxHQUFHLENBQUMsQ0FBQztRQUNyQixJQUFJLFVBQVUsR0FBRyxDQUFDLENBQUM7UUFFbkIsS0FBSyxNQUFNLEdBQUcsSUFBSSxJQUFJLEVBQUUsQ0FBQztZQUNyQixJQUFJLENBQUM7Z0JBQ0QsTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUUsY0FBYyxFQUFFLEdBQUcsQ0FBQyxDQUFDO2dCQUM5RCxhQUFhLENBQUMsSUFBSSxDQUFDO29CQUNmLEdBQUcsRUFBRSxHQUFHO29CQUNSLE9BQU8sRUFBRSxJQUFJO2lCQUNoQixDQUFDLENBQUM7Z0JBQ0gsWUFBWSxFQUFFLENBQUM7WUFDbkIsQ0FBQztZQUFDLE9BQU8sR0FBUSxFQUFFLENBQUM7Z0JBQ2hCLGFBQWEsQ0FBQyxJQUFJLENBQUM7b0JBQ2YsR0FBRyxFQUFFLEdBQUc7b0JBQ1IsT0FBTyxFQUFFLEtBQUs7b0JBQ2QsS0FBSyxFQUFFLEdBQUcsQ0FBQyxPQUFPO2lCQUNyQixDQUFDLENBQUM7Z0JBQ0gsVUFBVSxFQUFFLENBQUM7WUFDakIsQ0FBQztRQUNMLENBQUM7UUFFRCxPQUFPLElBQUEsYUFBRSxFQUFDO1lBQ0YsV0FBVyxFQUFFLElBQUksQ0FBQyxNQUFNO1lBQ3hCLFlBQVksRUFBRSxZQUFZO1lBQzFCLFVBQVUsRUFBRSxVQUFVO1lBQ3RCLE9BQU8sRUFBRSxhQUFhO1lBQ3RCLE9BQU8sRUFBRSwyQkFBMkIsWUFBWSxhQUFhLFVBQVUsU0FBUztTQUNuRixDQUFDLENBQUM7SUFDWCxDQUFDO0lBRU8sS0FBSyxDQUFDLDJCQUEyQixDQUFDLFlBQW9CLGFBQWE7UUFDdkUsOEJBQThCO1FBQzlCLE1BQU0sTUFBTSxHQUFHLE1BQU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsVUFBVSxFQUFFLGNBQWMsRUFBRSxFQUFFLE9BQU8sRUFBRSxHQUFHLFNBQVMsT0FBTyxFQUFFLENBQUMsQ0FBQztRQUUxRyxNQUFNLGdCQUFnQixHQUFVLEVBQUUsQ0FBQztRQUNuQyxNQUFNLGVBQWUsR0FBVSxFQUFFLENBQUM7UUFFbEMsS0FBSyxNQUFNLEtBQUssSUFBSSxNQUFNLEVBQUUsQ0FBQztZQUN6QixJQUFJLENBQUM7Z0JBQ0QsTUFBTSxTQUFTLEdBQUcsTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUUsa0JBQWtCLEVBQUUsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUMxRixJQUFJLFNBQVMsRUFBRSxDQUFDO29CQUNaLGVBQWUsQ0FBQyxJQUFJLENBQUM7d0JBQ2pCLEdBQUcsRUFBRSxLQUFLLENBQUMsR0FBRzt3QkFDZCxJQUFJLEVBQUUsS0FBSyxDQUFDLElBQUk7d0JBQ2hCLElBQUksRUFBRSxLQUFLLENBQUMsSUFBSTtxQkFDbkIsQ0FBQyxDQUFDO2dCQUNQLENBQUM7WUFDTCxDQUFDO1lBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztnQkFDWCxnQkFBZ0IsQ0FBQyxJQUFJLENBQUM7b0JBQ2xCLEdBQUcsRUFBRSxLQUFLLENBQUMsR0FBRztvQkFDZCxJQUFJLEVBQUUsS0FBSyxDQUFDLElBQUk7b0JBQ2hCLElBQUksRUFBRSxLQUFLLENBQUMsSUFBSTtvQkFDaEIsS0FBSyxFQUFHLEdBQWEsQ0FBQyxPQUFPO2lCQUNoQyxDQUFDLENBQUM7WUFDUCxDQUFDO1FBQ0wsQ0FBQztRQUVELE9BQU8sSUFBQSxhQUFFLEVBQUM7WUFDRixTQUFTLEVBQUUsU0FBUztZQUNwQixXQUFXLEVBQUUsTUFBTSxDQUFDLE1BQU07WUFDMUIsZUFBZSxFQUFFLGVBQWUsQ0FBQyxNQUFNO1lBQ3ZDLGdCQUFnQixFQUFFLGdCQUFnQixDQUFDLE1BQU07WUFDekMsWUFBWSxFQUFFLGdCQUFnQjtZQUM5QixPQUFPLEVBQUUseUJBQXlCLGdCQUFnQixDQUFDLE1BQU0sMEJBQTBCO1NBQ3RGLENBQUMsQ0FBQztJQUNYLENBQUM7SUFFTyxLQUFLLENBQUMsV0FBVyxDQUFDLFlBQW9CLGFBQWEsRUFBRSxXQUFtQixDQUFDOztRQUM3RSxNQUFNLE9BQU8sR0FBRyxTQUFTLENBQUMsT0FBTyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsQ0FBQztRQUM5QyxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNyRSxNQUFNLE1BQU0sR0FBRyxNQUFNLE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLFVBQVUsRUFBRSxjQUFjLEVBQUUsRUFBRSxPQUFPLEVBQUUsR0FBRyxPQUFPLE9BQU8sRUFBRSxDQUFDLENBQUM7UUFDeEcsTUFBTSxRQUFRLEdBQUcsTUFBQSxPQUFPLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQyxHQUFHLEVBQUUsbUNBQUksT0FBTyxDQUFDO1FBQ3JFLE1BQU0sSUFBSSxHQUFhO1lBQ25CLElBQUksRUFBRSxRQUFRO1lBQ2QsR0FBRyxFQUFFLE9BQU87WUFDWixXQUFXLEVBQUUsSUFBSTtZQUNqQixRQUFRLEVBQUUsRUFBRTtTQUNmLENBQUM7UUFDRixNQUFNLFdBQVcsR0FBRyxJQUFJLEdBQUcsQ0FBbUIsQ0FBQyxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFakUsTUFBTSxlQUFlLEdBQUcsQ0FBQyxHQUFXLEVBQVksRUFBRTs7WUFDOUMsTUFBTSxVQUFVLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFDM0MsTUFBTSxRQUFRLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUM3QyxJQUFJLFFBQVE7Z0JBQUUsT0FBTyxRQUFRLENBQUM7WUFDOUIsTUFBTSxTQUFTLEdBQUcsVUFBVSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsVUFBVSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQ25FLE1BQU0sTUFBTSxHQUFHLFNBQVMsQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO1lBQ2pGLE1BQU0sSUFBSSxHQUFhO2dCQUNuQixJQUFJLEVBQUUsTUFBQSxVQUFVLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsRUFBRSxtQ0FBSSxVQUFVO2dCQUMvQyxHQUFHLEVBQUUsVUFBVTtnQkFDZixXQUFXLEVBQUUsSUFBSTtnQkFDakIsUUFBUSxFQUFFLEVBQUU7YUFDZixDQUFDO1lBQ0YsV0FBVyxDQUFDLEdBQUcsQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDbEMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDM0IsT0FBTyxJQUFJLENBQUM7UUFDaEIsQ0FBQyxDQUFDO1FBRUYsTUFBTSxPQUFPLEdBQUcsQ0FBQyxHQUFXLEVBQVUsRUFBRTtZQUNwQyxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQzFELElBQUksQ0FBQyxHQUFHO2dCQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQ25CLE9BQU8sR0FBRyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMsTUFBTSxDQUFDO1FBQ2pELENBQUMsQ0FBQztRQUVGLEtBQUssTUFBTSxLQUFLLElBQUksTUFBTSxFQUFFLENBQUM7WUFDekIsTUFBTSxHQUFHLEdBQUcsTUFBTSxDQUFDLE1BQUEsS0FBSyxDQUFDLEdBQUcsbUNBQUksRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsQ0FBQztZQUN4RCxJQUFJLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxHQUFHLE9BQU8sR0FBRyxDQUFDLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxHQUFHLFlBQVk7Z0JBQUUsU0FBUztZQUM1RSxNQUFNLFNBQVMsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFDckQsTUFBTSxNQUFNLEdBQUcsU0FBUyxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsZUFBZSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7WUFFakYsSUFBSSxLQUFLLENBQUMsV0FBVyxFQUFFLENBQUM7Z0JBQ3BCLE1BQU0sR0FBRyxHQUFHLGVBQWUsQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDakMsR0FBRyxDQUFDLElBQUksR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDO2dCQUN0QixHQUFHLENBQUMsSUFBSSxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7Z0JBQ3RCLFNBQVM7WUFDYixDQUFDO1lBRUQsTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUM7Z0JBQ2pCLElBQUksRUFBRSxNQUFBLE1BQUEsS0FBSyxDQUFDLElBQUksbUNBQUksR0FBRyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLEVBQUUsbUNBQUksR0FBRztnQkFDL0MsR0FBRztnQkFDSCxJQUFJLEVBQUUsS0FBSyxDQUFDLElBQUk7Z0JBQ2hCLElBQUksRUFBRSxLQUFLLENBQUMsSUFBSTtnQkFDaEIsV0FBVyxFQUFFLEtBQUs7Z0JBQ2xCLFFBQVEsRUFBRSxFQUFFO2FBQ2YsQ0FBQyxDQUFDO1FBQ1AsQ0FBQztRQUVELE1BQU0sUUFBUSxHQUFHLENBQUMsSUFBYyxFQUFRLEVBQUU7WUFDdEMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUU7Z0JBQ3hCLElBQUksQ0FBQyxDQUFDLFdBQVcsS0FBSyxDQUFDLENBQUMsV0FBVztvQkFBRSxPQUFPLENBQUMsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ25FLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3hDLENBQUMsQ0FBQyxDQUFDO1lBQ0gsSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDcEMsQ0FBQyxDQUFDO1FBQ0YsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBRWYsT0FBTyxJQUFBLGFBQUUsRUFBQztZQUNGLFNBQVMsRUFBRSxPQUFPO1lBQ2xCLFFBQVEsRUFBRSxZQUFZO1lBQ3RCLFVBQVUsRUFBRSxNQUFNLENBQUMsTUFBTTtZQUN6QixJQUFJLEVBQUUsSUFBSTtTQUNiLENBQUMsQ0FBQztJQUNYLENBQUM7SUFFTyxLQUFLLENBQUMsd0JBQXdCLENBQUMsU0FBaUIsRUFBRSxZQUFvQixjQUFjO1FBQ3hGLE9BQU8sSUFBSSxPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsRUFBRTtZQUMzQixvR0FBb0c7WUFDcEcsT0FBTyxDQUFDLElBQUEsZUFBSSxFQUFDLHFLQUFxSyxDQUFDLENBQUMsQ0FBQztRQUN6TCxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7SUFFTyxLQUFLLENBQUMsbUJBQW1CLENBQUMsWUFBb0IsYUFBYSxFQUFFLHFCQUErQixFQUFFOztRQUNsRyxNQUFNLE9BQU8sR0FBRyxTQUFTLENBQUMsT0FBTyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsQ0FBQztRQUM5QyxNQUFNLFFBQVEsR0FBRyxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3hFLE1BQU0sU0FBUyxHQUFHLE1BQU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsVUFBVSxFQUFFLGNBQWMsRUFBRSxFQUFFLE9BQU8sRUFBRSxHQUFHLE9BQU8sT0FBTyxFQUFFLENBQUMsQ0FBQztRQUMzRyxNQUFNLE1BQU0sR0FBRyxNQUFNLE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLFVBQVUsRUFBRSxjQUFjLEVBQUUsRUFBRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxFQUFFLGVBQWUsRUFBRSxDQUFDLENBQUM7UUFDaEksTUFBTSxPQUFPLEdBQUcsTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUUsY0FBYyxFQUFFLEVBQUUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sRUFBRSxXQUFXLEVBQUUsQ0FBQyxDQUFDO1FBQzdILE1BQU0sS0FBSyxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxHQUFHLENBQUMsQ0FBQyxHQUFHLE1BQU0sRUFBRSxHQUFHLE9BQU8sQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQVUsRUFBRSxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO1FBQzdHLE1BQU0sZUFBZSxHQUFHLElBQUksR0FBRyxFQUFVLENBQUM7UUFDMUMsTUFBTSxnQkFBZ0IsR0FBVSxFQUFFLENBQUM7UUFFbkMsTUFBTSxhQUFhLEdBQUcsQ0FBQyxHQUFRLEVBQVEsRUFBRTtZQUNyQyxJQUFJLE9BQU8sR0FBRyxLQUFLLFFBQVEsRUFBRSxDQUFDO2dCQUMxQixlQUFlLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQzdCLENBQUM7aUJBQU0sSUFBSSxDQUFBLEdBQUcsYUFBSCxHQUFHLHVCQUFILEdBQUcsQ0FBRSxJQUFJLEtBQUksT0FBTyxHQUFHLENBQUMsSUFBSSxLQUFLLFFBQVEsRUFBRSxDQUFDO2dCQUNuRCxlQUFlLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNsQyxDQUFDO1FBQ0wsQ0FBQyxDQUFDO1FBRUYsS0FBSyxNQUFNLEtBQUssSUFBSSxLQUFLLEVBQUUsQ0FBQztZQUN4QixlQUFlLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNoQyxJQUFJLENBQUM7Z0JBQ0QsTUFBTSxJQUFJLEdBQUcsTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUUsMEJBQTBCLEVBQUUsS0FBSyxDQUFDLElBQUksRUFBRSxTQUFTLENBQUMsQ0FBQztnQkFDekcsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7b0JBQ3RCLElBQUksQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLENBQUM7Z0JBQ2hDLENBQUM7WUFDTCxDQUFDO1lBQUMsT0FBTyxHQUFRLEVBQUUsQ0FBQztnQkFDaEIsZ0JBQWdCLENBQUMsSUFBSSxDQUFDO29CQUNsQixJQUFJLEVBQUUsS0FBSyxDQUFDLElBQUk7b0JBQ2hCLEdBQUcsRUFBRSxLQUFLLENBQUMsR0FBRztvQkFDZCxLQUFLLEVBQUUsTUFBQSxHQUFHLGFBQUgsR0FBRyx1QkFBSCxHQUFHLENBQUUsT0FBTyxtQ0FBSSxNQUFNLENBQUMsR0FBRyxDQUFDO2lCQUNyQyxDQUFDLENBQUM7WUFDUCxDQUFDO1FBQ0wsQ0FBQztRQUVELE1BQU0sVUFBVSxHQUFHLENBQUMsR0FBVyxFQUFXLEVBQUUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxLQUFLLEdBQUcsSUFBSSxHQUFHLENBQUMsVUFBVSxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQzVHLE1BQU0sVUFBVSxHQUFHLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxLQUFVLEVBQUUsRUFBRTs7WUFDL0MsTUFBTSxHQUFHLEdBQUcsTUFBTSxDQUFDLE1BQUEsS0FBSyxDQUFDLEdBQUcsbUNBQUksRUFBRSxDQUFDLENBQUM7WUFDcEMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsR0FBRyxPQUFPLEdBQUcsQ0FBQztnQkFBRSxPQUFPLEtBQUssQ0FBQztZQUNqRCxJQUFJLEtBQUssQ0FBQyxXQUFXO2dCQUFFLE9BQU8sS0FBSyxDQUFDO1lBQ3BDLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSTtnQkFBRSxPQUFPLEtBQUssQ0FBQztZQUM5QixJQUFJLFVBQVUsQ0FBQyxHQUFHLENBQUM7Z0JBQUUsT0FBTyxLQUFLLENBQUM7WUFDbEMsT0FBTyxDQUFDLGVBQWUsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzVDLENBQUMsQ0FBQyxDQUFDO1FBRUgsT0FBTyxJQUFBLGFBQUUsRUFBQztZQUNGLFNBQVMsRUFBRSxPQUFPO1lBQ2xCLGtCQUFrQixFQUFFLFFBQVE7WUFDNUIsWUFBWSxFQUFFLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxLQUFVLEVBQUUsRUFBRSxDQUFDLENBQUM7Z0JBQ3JDLElBQUksRUFBRSxLQUFLLENBQUMsSUFBSTtnQkFDaEIsR0FBRyxFQUFFLEtBQUssQ0FBQyxHQUFHO2dCQUNkLElBQUksRUFBRSxLQUFLLENBQUMsSUFBSTtnQkFDaEIsSUFBSSxFQUFFLEtBQUssQ0FBQyxJQUFJO2FBQ25CLENBQUMsQ0FBQztZQUNILGVBQWUsRUFBRSxlQUFlLENBQUMsSUFBSTtZQUNyQyxXQUFXLEVBQUUsU0FBUyxDQUFDLE1BQU07WUFDN0IsV0FBVyxFQUFFLFVBQVUsQ0FBQyxNQUFNO1lBQzlCLFlBQVksRUFBRSxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBVSxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUMxQyxJQUFJLEVBQUUsS0FBSyxDQUFDLElBQUk7Z0JBQ2hCLEdBQUcsRUFBRSxLQUFLLENBQUMsR0FBRztnQkFDZCxJQUFJLEVBQUUsS0FBSyxDQUFDLElBQUk7Z0JBQ2hCLElBQUksRUFBRSxLQUFLLENBQUMsSUFBSTthQUNuQixDQUFDLENBQUM7WUFDSCxnQkFBZ0I7WUFDaEIsT0FBTyxFQUFFLGdDQUFnQyxVQUFVLENBQUMsTUFBTSw0QkFBNEI7U0FDekYsQ0FBQyxDQUFDO0lBQ1gsQ0FBQztJQUVPLEtBQUssQ0FBQyxvQkFBb0IsQ0FBQyxZQUFvQixhQUFhLEVBQUUsU0FBaUIsTUFBTSxFQUFFLFVBQWtCLEdBQUc7UUFDaEgsT0FBTyxJQUFJLE9BQU8sQ0FBQyxDQUFDLE9BQU8sRUFBRSxFQUFFO1lBQzNCLGdFQUFnRTtZQUNoRSxPQUFPLENBQUMsSUFBQSxlQUFJLEVBQUMsa01BQWtNLENBQUMsQ0FBQyxDQUFDO1FBQ3ROLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztJQUVPLEtBQUssQ0FBQyx1QkFBdUIsQ0FBQyxZQUFvQixhQUFhLEVBQUUsU0FBaUIsTUFBTSxFQUFFLGtCQUEyQixJQUFJO1FBQzdILE1BQU0sTUFBTSxHQUFHLE1BQU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsVUFBVSxFQUFFLGNBQWMsRUFBRSxFQUFFLE9BQU8sRUFBRSxHQUFHLFNBQVMsT0FBTyxFQUFFLENBQUMsQ0FBQztRQUUxRyxNQUFNLFFBQVEsR0FBVSxFQUFFLENBQUM7UUFFM0IsS0FBSyxNQUFNLEtBQUssSUFBSSxNQUFNLEVBQUUsQ0FBQztZQUN6QixNQUFNLGFBQWEsR0FBUTtnQkFDdkIsSUFBSSxFQUFFLEtBQUssQ0FBQyxJQUFJO2dCQUNoQixHQUFHLEVBQUUsS0FBSyxDQUFDLEdBQUc7Z0JBQ2QsSUFBSSxFQUFFLEtBQUssQ0FBQyxJQUFJO2dCQUNoQixJQUFJLEVBQUUsS0FBSyxDQUFDLElBQUk7Z0JBQ2hCLElBQUksRUFBRyxLQUFhLENBQUMsSUFBSSxJQUFJLENBQUM7Z0JBQzlCLFdBQVcsRUFBRSxLQUFLLENBQUMsV0FBVyxJQUFJLEtBQUs7YUFDMUMsQ0FBQztZQUVGLElBQUksZUFBZSxFQUFFLENBQUM7Z0JBQ2xCLElBQUksQ0FBQztvQkFDRCxNQUFNLFNBQVMsR0FBRyxNQUFNLE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLFVBQVUsRUFBRSxrQkFBa0IsRUFBRSxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7b0JBQzFGLElBQUksU0FBUyxJQUFJLFNBQVMsQ0FBQyxJQUFJLEVBQUUsQ0FBQzt3QkFDOUIsYUFBYSxDQUFDLElBQUksR0FBRyxTQUFTLENBQUMsSUFBSSxDQUFDO29CQUN4QyxDQUFDO2dCQUNMLENBQUM7Z0JBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztvQkFDWCxpQ0FBaUM7Z0JBQ3JDLENBQUM7WUFDTCxDQUFDO1lBRUQsUUFBUSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUNqQyxDQUFDO1FBRUQsSUFBSSxVQUFrQixDQUFDO1FBQ3ZCLFFBQVEsTUFBTSxFQUFFLENBQUM7WUFDYixLQUFLLE1BQU07Z0JBQ1AsVUFBVSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDL0MsTUFBTTtZQUNWLEtBQUssS0FBSztnQkFDTixVQUFVLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxRQUFRLENBQUMsQ0FBQztnQkFDekMsTUFBTTtZQUNWLEtBQUssS0FBSztnQkFDTixVQUFVLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxRQUFRLENBQUMsQ0FBQztnQkFDekMsTUFBTTtZQUNWO2dCQUNJLFVBQVUsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLFFBQVEsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDdkQsQ0FBQztRQUVELE9BQU8sSUFBQSxhQUFFLEVBQUM7WUFDRixTQUFTLEVBQUUsU0FBUztZQUNwQixNQUFNLEVBQUUsTUFBTTtZQUNkLFVBQVUsRUFBRSxRQUFRLENBQUMsTUFBTTtZQUMzQixlQUFlLEVBQUUsZUFBZTtZQUNoQyxRQUFRLEVBQUUsVUFBVTtZQUNwQixPQUFPLEVBQUUsZ0NBQWdDLFFBQVEsQ0FBQyxNQUFNLFNBQVM7U0FDcEUsQ0FBQyxDQUFDO0lBQ1gsQ0FBQztJQUVPLFlBQVksQ0FBQyxJQUFXO1FBQzVCLElBQUksSUFBSSxDQUFDLE1BQU0sS0FBSyxDQUFDO1lBQUUsT0FBTyxFQUFFLENBQUM7UUFFakMsTUFBTSxPQUFPLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNyQyxNQUFNLE9BQU8sR0FBRyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUVwQyxLQUFLLE1BQU0sR0FBRyxJQUFJLElBQUksRUFBRSxDQUFDO1lBQ3JCLE1BQU0sTUFBTSxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUU7Z0JBQ2hDLE1BQU0sS0FBSyxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDMUIsT0FBTyxPQUFPLEtBQUssS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUM3RSxDQUFDLENBQUMsQ0FBQztZQUNILE9BQU8sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ25DLENBQUM7UUFFRCxPQUFPLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDOUIsQ0FBQztJQUVPLFlBQVksQ0FBQyxJQUFXO1FBQzVCLElBQUksR0FBRyxHQUFHLG9EQUFvRCxDQUFDO1FBRS9ELEtBQUssTUFBTSxJQUFJLElBQUksSUFBSSxFQUFFLENBQUM7WUFDdEIsR0FBRyxJQUFJLGFBQWEsQ0FBQztZQUNyQixLQUFLLE1BQU0sQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO2dCQUM5QyxNQUFNLFFBQVEsR0FBRyxPQUFPLEtBQUssS0FBSyxRQUFRLENBQUMsQ0FBQztvQkFDeEMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO29CQUN2QixNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxPQUFPLENBQUMsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLE1BQU0sQ0FBQyxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsTUFBTSxDQUFDLENBQUM7Z0JBQ3JGLEdBQUcsSUFBSSxRQUFRLEdBQUcsSUFBSSxRQUFRLEtBQUssR0FBRyxLQUFLLENBQUM7WUFDaEQsQ0FBQztZQUNELEdBQUcsSUFBSSxjQUFjLENBQUM7UUFDMUIsQ0FBQztRQUVELEdBQUcsSUFBSSxXQUFXLENBQUM7UUFDbkIsT0FBTyxHQUFHLENBQUM7SUFDZixDQUFDO0lBRU8sS0FBSyxDQUFDLFlBQVksQ0FBQyxVQUFrQjtRQUN6QyxNQUFNLE1BQU0sR0FBRyxNQUFNLE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLFVBQVUsRUFBRSxjQUFjLEVBQUUsRUFBRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxFQUFFLGVBQWUsRUFBRSxDQUFDLENBQUM7UUFDaEksTUFBTSxPQUFPLEdBQUcsTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUUsY0FBYyxFQUFFLEVBQUUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sRUFBRSxXQUFXLEVBQUUsQ0FBQyxDQUFDO1FBQzdILE1BQU0sU0FBUyxHQUFHLE1BQU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsVUFBVSxFQUFFLGNBQWMsRUFBRSxFQUFFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxDQUFDLENBQUM7UUFDL0csTUFBTSxTQUFTLEdBQUcsTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUUsY0FBYyxFQUFFLEVBQUUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLENBQUMsQ0FBQztRQUUvRyxNQUFNLFNBQVMsR0FBRyxDQUFDLEdBQUcsTUFBTSxFQUFFLEdBQUcsT0FBTyxFQUFFLEdBQUcsU0FBUyxFQUFFLEdBQUcsU0FBUyxDQUFDLENBQUM7UUFDdEUsTUFBTSxZQUFZLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBTSxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7UUFFMUYsTUFBTSxLQUFLLEdBQVUsRUFBRSxDQUFDO1FBQ3hCLEtBQUssTUFBTSxLQUFLLElBQUksWUFBWSxFQUFFLENBQUM7WUFDL0IsTUFBTSxJQUFJLEdBQUcsTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUUsMEJBQTBCLEVBQUUsS0FBSyxDQUFDLElBQUksRUFBRSxTQUFTLENBQUMsQ0FBQztZQUN6RyxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDO2dCQUNuRCxJQUFJLElBQUksR0FBRyxRQUFRLENBQUM7Z0JBQ3BCLElBQUksS0FBSyxDQUFDLElBQUksS0FBSyxlQUFlO29CQUFFLElBQUksR0FBRyxPQUFPLENBQUM7cUJBQzlDLElBQUksS0FBSyxDQUFDLElBQUksS0FBSyxXQUFXO29CQUFFLElBQUksR0FBRyxRQUFRLENBQUM7Z0JBQ3JELEtBQUssQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLEtBQUssQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLEtBQUssQ0FBQyxHQUFHLEVBQUUsSUFBSSxFQUFFLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO1lBQzlFLENBQUM7UUFDTCxDQUFDO1FBRUQsT0FBTyxJQUFBLGFBQUUsRUFBQyxFQUFFLElBQUksRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztJQUNoRSxDQUFDO0NBQ0o7QUFwb0JELGdEQW9vQkM7QUFqbkJTO0lBVEwsSUFBQSxvQkFBTyxFQUFDO1FBQ0wsSUFBSSxFQUFFLGlCQUFpQjtRQUN2QixLQUFLLEVBQUUsaUJBQWlCO1FBQ3hCLFdBQVcsRUFBRSx5Q0FBbUIsQ0FBQyxlQUFlO1FBQ2hELFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDO1lBQ2xCLFNBQVMsRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLDhEQUE4RCxDQUFDO1lBQzlGLE9BQU8sRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLGdEQUFnRCxDQUFDO1NBQ2pGLENBQUM7S0FDTCxDQUFDO3VEQUdEO0FBVUs7SUFSTCxJQUFBLG9CQUFPLEVBQUM7UUFDTCxJQUFJLEVBQUUsd0JBQXdCO1FBQzlCLEtBQUssRUFBRSxvQkFBb0I7UUFDM0IsV0FBVyxFQUFFLHlDQUFtQixDQUFDLHNCQUFzQjtRQUN2RCxXQUFXLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQztZQUNsQixHQUFHLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyxxRUFBcUUsQ0FBQztTQUNsRyxDQUFDO0tBQ0wsQ0FBQzs4REFHRDtBQVFLO0lBTkwsSUFBQSxvQkFBTyxFQUFDO1FBQ0wsSUFBSSxFQUFFLHNCQUFzQjtRQUM1QixLQUFLLEVBQUUsMEJBQTBCO1FBQ2pDLFdBQVcsRUFBRSx5Q0FBbUIsQ0FBQyxvQkFBb0I7UUFDckQsV0FBVyxFQUFFLFVBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO0tBQzVCLENBQUM7MkRBR0Q7QUFVSztJQVJMLElBQUEsb0JBQU8sRUFBQztRQUNMLElBQUksRUFBRSxxQkFBcUI7UUFDM0IsS0FBSyxFQUFFLHVCQUF1QjtRQUM5QixXQUFXLEVBQUUseUNBQW1CLENBQUMsbUJBQW1CO1FBQ3BELFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDO1lBQ2xCLFNBQVMsRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLGlGQUFpRixDQUFDO1NBQ3BILENBQUM7S0FDTCxDQUFDOzJEQUdEO0FBY0s7SUFaTCxJQUFBLG9CQUFPLEVBQUM7UUFDTCxJQUFJLEVBQUUscUJBQXFCO1FBQzNCLEtBQUssRUFBRSx3QkFBd0I7UUFDL0IsV0FBVyxFQUFFLHlDQUFtQixDQUFDLG1CQUFtQjtRQUNwRCxXQUFXLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQztZQUNsQixlQUFlLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyw2REFBNkQsQ0FBQztZQUNuRyxlQUFlLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQywyREFBMkQsQ0FBQztZQUNqRyxVQUFVLEVBQUUsVUFBQyxDQUFDLEtBQUssQ0FBQyxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLHVFQUF1RSxDQUFDO1lBQzdILFNBQVMsRUFBRSxVQUFDLENBQUMsT0FBTyxFQUFFLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDLFFBQVEsQ0FBQyxvQ0FBb0MsQ0FBQztZQUNwRixTQUFTLEVBQUUsVUFBQyxDQUFDLE9BQU8sRUFBRSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxRQUFRLENBQUMsNERBQTRELENBQUM7U0FDL0csQ0FBQztLQUNMLENBQUM7MkRBR0Q7QUFVSztJQVJMLElBQUEsb0JBQU8sRUFBQztRQUNMLElBQUksRUFBRSxxQkFBcUI7UUFDM0IsS0FBSyxFQUFFLHdCQUF3QjtRQUMvQixXQUFXLEVBQUUseUNBQW1CLENBQUMsbUJBQW1CO1FBQ3BELFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDO1lBQ2xCLElBQUksRUFBRSxVQUFDLENBQUMsS0FBSyxDQUFDLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxrRUFBa0UsQ0FBQztTQUN6RyxDQUFDO0tBQ0wsQ0FBQzsyREFHRDtBQVVLO0lBUkwsSUFBQSxvQkFBTyxFQUFDO1FBQ0wsSUFBSSxFQUFFLDJCQUEyQjtRQUNqQyxLQUFLLEVBQUUsMkJBQTJCO1FBQ2xDLFdBQVcsRUFBRSx5Q0FBbUIsQ0FBQyx5QkFBeUI7UUFDMUQsV0FBVyxFQUFFLFVBQUMsQ0FBQyxNQUFNLENBQUM7WUFDbEIsU0FBUyxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLENBQUMsUUFBUSxDQUFDLGtEQUFrRCxDQUFDO1NBQzVHLENBQUM7S0FDTCxDQUFDO2lFQUdEO0FBV0s7SUFUTCxJQUFBLG9CQUFPLEVBQUM7UUFDTCxJQUFJLEVBQUUsVUFBVTtRQUNoQixLQUFLLEVBQUUsZ0JBQWdCO1FBQ3ZCLFdBQVcsRUFBRSx5Q0FBbUIsQ0FBQyxRQUFRO1FBQ3pDLFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDO1lBQ2xCLFNBQVMsRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxrRUFBa0UsQ0FBQztZQUN6SCxRQUFRLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQywrREFBK0QsQ0FBQztTQUMzSCxDQUFDO0tBQ0wsQ0FBQztpREFHRDtBQVdLO0lBVEwsSUFBQSxvQkFBTyxFQUFDO1FBQ0wsSUFBSSxFQUFFLHdCQUF3QjtRQUM5QixLQUFLLEVBQUUseUJBQXlCO1FBQ2hDLFdBQVcsRUFBRSx5Q0FBbUIsQ0FBQyxzQkFBc0I7UUFDdkQsV0FBVyxFQUFFLFVBQUMsQ0FBQyxNQUFNLENBQUM7WUFDbEIsU0FBUyxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLENBQUMsd0ZBQXdGLENBQUM7WUFDeEgsU0FBUyxFQUFFLFVBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxZQUFZLEVBQUUsY0FBYyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLGNBQWMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyw2RUFBNkUsQ0FBQztTQUM1SyxDQUFDO0tBQ0wsQ0FBQzs4REFHRDtBQVdLO0lBVEwsSUFBQSxvQkFBTyxFQUFDO1FBQ0wsSUFBSSxFQUFFLG1CQUFtQjtRQUN6QixLQUFLLEVBQUUsb0JBQW9CO1FBQzNCLFdBQVcsRUFBRSx5Q0FBbUIsQ0FBQyxpQkFBaUI7UUFDbEQsV0FBVyxFQUFFLFVBQUMsQ0FBQyxNQUFNLENBQUM7WUFDbEIsU0FBUyxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLENBQUMsUUFBUSxDQUFDLGtEQUFrRCxDQUFDO1lBQ3pHLGtCQUFrQixFQUFFLFVBQUMsQ0FBQyxLQUFLLENBQUMsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxxREFBcUQsQ0FBQztTQUN0SCxDQUFDO0tBQ0wsQ0FBQzt5REFHRDtBQVlLO0lBVkwsSUFBQSxvQkFBTyxFQUFDO1FBQ0wsSUFBSSxFQUFFLG1CQUFtQjtRQUN6QixLQUFLLEVBQUUsbUJBQW1CO1FBQzFCLFdBQVcsRUFBRSx5Q0FBbUIsQ0FBQyxpQkFBaUI7UUFDbEQsV0FBVyxFQUFFLFVBQUMsQ0FBQyxNQUFNLENBQUM7WUFDbEIsU0FBUyxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLENBQUMsUUFBUSxDQUFDLDBGQUEwRixDQUFDO1lBQ2pKLE1BQU0sRUFBRSxVQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsUUFBUSxDQUFDLHNFQUFzRSxDQUFDO1lBQy9JLE9BQU8sRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsUUFBUSxDQUFDLDRGQUE0RixDQUFDO1NBQzVKLENBQUM7S0FDTCxDQUFDOzBEQUdEO0FBWUs7SUFWTCxJQUFBLG9CQUFPLEVBQUM7UUFDTCxJQUFJLEVBQUUsdUJBQXVCO1FBQzdCLEtBQUssRUFBRSx1QkFBdUI7UUFDOUIsV0FBVyxFQUFFLHlDQUFtQixDQUFDLHFCQUFxQjtRQUN0RCxXQUFXLEVBQUUsVUFBQyxDQUFDLE1BQU0sQ0FBQztZQUNsQixTQUFTLEVBQUUsVUFBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsQ0FBQyxRQUFRLENBQUMscUVBQXFFLENBQUM7WUFDNUgsTUFBTSxFQUFFLFVBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLFFBQVEsQ0FBQyx5Q0FBeUMsQ0FBQztZQUMxRyxlQUFlLEVBQUUsVUFBQyxDQUFDLE9BQU8sRUFBRSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxRQUFRLENBQUMsK0NBQStDLENBQUM7U0FDdkcsQ0FBQztLQUNMLENBQUM7NkRBR0Q7QUFVSztJQVJMLElBQUEsb0JBQU8sRUFBQztRQUNMLElBQUksRUFBRSxXQUFXO1FBQ2pCLEtBQUssRUFBRSxrQkFBa0I7UUFDekIsV0FBVyxFQUFFLHlDQUFtQixDQUFDLFNBQVM7UUFDMUMsV0FBVyxFQUFFLFVBQUMsQ0FBQyxNQUFNLENBQUM7WUFDbEIsSUFBSSxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLENBQUMsbUNBQW1DLENBQUM7U0FDakUsQ0FBQztLQUNMLENBQUM7a0RBR0QiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBvaywgZmFpbCB9IGZyb20gJy4uL2xpYi9yZXNwb25zZSc7XG5pbXBvcnQgdHlwZSB7IFRvb2xEZWZpbml0aW9uLCBUb29sUmVzcG9uc2UsIFRvb2xFeGVjdXRvciB9IGZyb20gJy4uL3R5cGVzJztcbmltcG9ydCB7IHogfSBmcm9tICcuLi9saWIvc2NoZW1hJztcbmltcG9ydCB7IG1jcFRvb2wsIGRlZmluZVRvb2xzRnJvbURlY29yYXRvcnMgfSBmcm9tICcuLi9saWIvZGVjb3JhdG9ycyc7XG5pbXBvcnQgeyBBU1NFVF9BRFZBTkNFRF9ET0NTIH0gZnJvbSAnLi4vZGF0YS9hc3NldC1hZHZhbmNlZC1kb2NzJztcblxuaW50ZXJmYWNlIFRyZWVOb2RlIHtcbiAgICBuYW1lOiBzdHJpbmc7XG4gICAgdXJsOiBzdHJpbmc7XG4gICAgdXVpZD86IHN0cmluZztcbiAgICB0eXBlPzogc3RyaW5nO1xuICAgIGlzRGlyZWN0b3J5OiBib29sZWFuO1xuICAgIGNoaWxkcmVuOiBUcmVlTm9kZVtdO1xufVxuXG5leHBvcnQgY2xhc3MgQXNzZXRBZHZhbmNlZFRvb2xzIGltcGxlbWVudHMgVG9vbEV4ZWN1dG9yIHtcbiAgICBwcml2YXRlIHJlYWRvbmx5IGV4ZWM6IFRvb2xFeGVjdXRvcjtcblxuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICB0aGlzLmV4ZWMgPSBkZWZpbmVUb29sc0Zyb21EZWNvcmF0b3JzKHRoaXMpO1xuICAgIH1cblxuICAgIGdldFRvb2xzKCk6IFRvb2xEZWZpbml0aW9uW10geyByZXR1cm4gdGhpcy5leGVjLmdldFRvb2xzKCk7IH1cbiAgICBleGVjdXRlKHRvb2xOYW1lOiBzdHJpbmcsIGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7IHJldHVybiB0aGlzLmV4ZWMuZXhlY3V0ZSh0b29sTmFtZSwgYXJncyk7IH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ3NhdmVfYXNzZXRfbWV0YScsXG4gICAgICAgIHRpdGxlOiAnU2F2ZSBhc3NldCBtZXRhJyxcbiAgICAgICAgZGVzY3JpcHRpb246IEFTU0VUX0FEVkFOQ0VEX0RPQ1Muc2F2ZV9hc3NldF9tZXRhLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgdXJsT3JVVUlEOiB6LnN0cmluZygpLmRlc2NyaWJlKCdBc3NldCBkYjovLyBVUkwgb3IgVVVJRCB3aG9zZSAubWV0YSBjb250ZW50IHNob3VsZCBiZSBzYXZlZC4nKSxcbiAgICAgICAgICAgIGNvbnRlbnQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1NlcmlhbGl6ZWQgYXNzZXQgbWV0YSBjb250ZW50IHN0cmluZyB0byB3cml0ZS4nKSxcbiAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBzYXZlQXNzZXRNZXRhKGFyZ3M6IHsgdXJsT3JVVUlEOiBzdHJpbmc7IGNvbnRlbnQ6IHN0cmluZyB9KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2F2ZUFzc2V0TWV0YUltcGwoYXJncy51cmxPclVVSUQsIGFyZ3MuY29udGVudCk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnZ2VuZXJhdGVfYXZhaWxhYmxlX3VybCcsXG4gICAgICAgIHRpdGxlOiAnR2VuZXJhdGUgYXNzZXQgVVJMJyxcbiAgICAgICAgZGVzY3JpcHRpb246IEFTU0VUX0FEVkFOQ0VEX0RPQ1MuZ2VuZXJhdGVfYXZhaWxhYmxlX3VybCxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIHVybDogei5zdHJpbmcoKS5kZXNjcmliZSgnRGVzaXJlZCBhc3NldCBkYjovLyBVUkwgdG8gdGVzdCBmb3IgY29sbGlzaW9uIGFuZCBhZGp1c3QgaWYgbmVlZGVkLicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIGdlbmVyYXRlQXZhaWxhYmxlVXJsKGFyZ3M6IHsgdXJsOiBzdHJpbmcgfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdlbmVyYXRlQXZhaWxhYmxlVXJsSW1wbChhcmdzLnVybCk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAncXVlcnlfYXNzZXRfZGJfcmVhZHknLFxuICAgICAgICB0aXRsZTogJ0NoZWNrIGFzc2V0LWRiIHJlYWRpbmVzcycsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBBU1NFVF9BRFZBTkNFRF9ET0NTLnF1ZXJ5X2Fzc2V0X2RiX3JlYWR5LFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe30pLFxuICAgIH0pXG4gICAgYXN5bmMgcXVlcnlBc3NldERiUmVhZHkoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMucXVlcnlBc3NldERiUmVhZHlJbXBsKCk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnb3Blbl9hc3NldF9leHRlcm5hbCcsXG4gICAgICAgIHRpdGxlOiAnT3BlbiBhc3NldCBleHRlcm5hbGx5JyxcbiAgICAgICAgZGVzY3JpcHRpb246IEFTU0VUX0FEVkFOQ0VEX0RPQ1Mub3Blbl9hc3NldF9leHRlcm5hbCxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIHVybE9yVVVJRDogei5zdHJpbmcoKS5kZXNjcmliZSgnQXNzZXQgZGI6Ly8gVVJMIG9yIFVVSUQgdG8gb3BlbiB3aXRoIHRoZSBPUy9lZGl0b3IgYXNzb2NpYXRlZCBleHRlcm5hbCBwcm9ncmFtLicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIG9wZW5Bc3NldEV4dGVybmFsKGFyZ3M6IHsgdXJsT3JVVUlEOiBzdHJpbmcgfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLm9wZW5Bc3NldEV4dGVybmFsSW1wbChhcmdzLnVybE9yVVVJRCk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnYmF0Y2hfaW1wb3J0X2Fzc2V0cycsXG4gICAgICAgIHRpdGxlOiAnSW1wb3J0IGFzc2V0cyBpbiBiYXRjaCcsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBBU1NFVF9BRFZBTkNFRF9ET0NTLmJhdGNoX2ltcG9ydF9hc3NldHMsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICBzb3VyY2VEaXJlY3Rvcnk6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0Fic29sdXRlIHNvdXJjZSBkaXJlY3Rvcnkgb24gZGlzayB0byBzY2FuIGZvciBpbXBvcnQgZmlsZXMuJyksXG4gICAgICAgICAgICB0YXJnZXREaXJlY3Rvcnk6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1RhcmdldCBhc3NldC1kYiBkaXJlY3RvcnkgVVJMLCBlLmcuIGRiOi8vYXNzZXRzL3RleHR1cmVzLicpLFxuICAgICAgICAgICAgZmlsZUZpbHRlcjogei5hcnJheSh6LnN0cmluZygpKS5kZWZhdWx0KFtdKS5kZXNjcmliZSgnQWxsb3dlZCBmaWxlIGV4dGVuc2lvbnMsIGUuZy4gW1wiLnBuZ1wiLFwiLmpwZ1wiXS4gRW1wdHkgbWVhbnMgYWxsIGZpbGVzLicpLFxuICAgICAgICAgICAgcmVjdXJzaXZlOiB6LmJvb2xlYW4oKS5kZWZhdWx0KGZhbHNlKS5kZXNjcmliZSgnSW5jbHVkZSBmaWxlcyBmcm9tIHN1YmRpcmVjdG9yaWVzLicpLFxuICAgICAgICAgICAgb3ZlcndyaXRlOiB6LmJvb2xlYW4oKS5kZWZhdWx0KGZhbHNlKS5kZXNjcmliZSgnT3ZlcndyaXRlIGV4aXN0aW5nIHRhcmdldCBhc3NldHMgaW5zdGVhZCBvZiBhdXRvLXJlbmFtaW5nLicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIGJhdGNoSW1wb3J0QXNzZXRzKGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLmJhdGNoSW1wb3J0QXNzZXRzSW1wbChhcmdzKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdiYXRjaF9kZWxldGVfYXNzZXRzJyxcbiAgICAgICAgdGl0bGU6ICdEZWxldGUgYXNzZXRzIGluIGJhdGNoJyxcbiAgICAgICAgZGVzY3JpcHRpb246IEFTU0VUX0FEVkFOQ0VEX0RPQ1MuYmF0Y2hfZGVsZXRlX2Fzc2V0cyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIHVybHM6IHouYXJyYXkoei5zdHJpbmcoKSkuZGVzY3JpYmUoJ0Fzc2V0IGRiOi8vIFVSTHMgdG8gZGVsZXRlLiBFYWNoIFVSTCBpcyBhdHRlbXB0ZWQgaW5kZXBlbmRlbnRseS4nKSxcbiAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBiYXRjaERlbGV0ZUFzc2V0cyhhcmdzOiB7IHVybHM6IHN0cmluZ1tdIH0pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5iYXRjaERlbGV0ZUFzc2V0c0ltcGwoYXJncy51cmxzKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICd2YWxpZGF0ZV9hc3NldF9yZWZlcmVuY2VzJyxcbiAgICAgICAgdGl0bGU6ICdWYWxpZGF0ZSBhc3NldCByZWZlcmVuY2VzJyxcbiAgICAgICAgZGVzY3JpcHRpb246IEFTU0VUX0FEVkFOQ0VEX0RPQ1MudmFsaWRhdGVfYXNzZXRfcmVmZXJlbmNlcyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIGRpcmVjdG9yeTogei5zdHJpbmcoKS5kZWZhdWx0KCdkYjovL2Fzc2V0cycpLmRlc2NyaWJlKCdBc3NldC1kYiBkaXJlY3RvcnkgdG8gc2Nhbi4gRGVmYXVsdCBkYjovL2Fzc2V0cy4nKSxcbiAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyB2YWxpZGF0ZUFzc2V0UmVmZXJlbmNlcyhhcmdzOiB7IGRpcmVjdG9yeT86IHN0cmluZyB9KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMudmFsaWRhdGVBc3NldFJlZmVyZW5jZXNJbXBsKGFyZ3MuZGlyZWN0b3J5KTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdnZXRfdHJlZScsXG4gICAgICAgIHRpdGxlOiAnR2V0IGFzc2V0IHRyZWUnLFxuICAgICAgICBkZXNjcmlwdGlvbjogQVNTRVRfQURWQU5DRURfRE9DUy5nZXRfdHJlZSxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIGRpcmVjdG9yeTogei5zdHJpbmcoKS5kZWZhdWx0KCdkYjovL2Fzc2V0cycpLmRlc2NyaWJlKCdBc3NldC1kYiBkaXJlY3RvcnkgdG8gdXNlIGFzIHRoZSB0cmVlIHJvb3QuIERlZmF1bHQgZGI6Ly9hc3NldHMuJyksXG4gICAgICAgICAgICBtYXhEZXB0aDogei5udW1iZXIoKS5taW4oMCkubWF4KDMyKS5kZWZhdWx0KDgpLmRlc2NyaWJlKCdNYXhpbXVtIGRlc2NlbmRhbnQgZGVwdGggdG8gaW5jbHVkZSBiZWxvdyB0aGUgcm9vdCBkaXJlY3RvcnkuJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgZ2V0VHJlZShhcmdzOiB7IGRpcmVjdG9yeT86IHN0cmluZzsgbWF4RGVwdGg/OiBudW1iZXIgfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldFRyZWVJbXBsKGFyZ3MuZGlyZWN0b3J5LCBhcmdzLm1heERlcHRoKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdnZXRfYXNzZXRfZGVwZW5kZW5jaWVzJyxcbiAgICAgICAgdGl0bGU6ICdSZWFkIGFzc2V0IGRlcGVuZGVuY2llcycsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBBU1NFVF9BRFZBTkNFRF9ET0NTLmdldF9hc3NldF9kZXBlbmRlbmNpZXMsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICB1cmxPclVVSUQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0Fzc2V0IFVSTCBvciBVVUlEIGZvciBkZXBlbmRlbmN5IGFuYWx5c2lzLiBDdXJyZW50IGltcGxlbWVudGF0aW9uIHJlcG9ydHMgdW5zdXBwb3J0ZWQuJyksXG4gICAgICAgICAgICBkaXJlY3Rpb246IHouZW51bShbJ2RlcGVuZGVudHMnLCAnZGVwZW5kZW5jaWVzJywgJ2JvdGgnXSkuZGVmYXVsdCgnZGVwZW5kZW5jaWVzJykuZGVzY3JpYmUoJ0RlcGVuZGVuY3kgZGlyZWN0aW9uIHJlcXVlc3RlZC4gQ3VycmVudCBpbXBsZW1lbnRhdGlvbiByZXBvcnRzIHVuc3VwcG9ydGVkLicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIGdldEFzc2V0RGVwZW5kZW5jaWVzKGFyZ3M6IHsgdXJsT3JVVUlEOiBzdHJpbmc7IGRpcmVjdGlvbj86IHN0cmluZyB9KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0QXNzZXREZXBlbmRlbmNpZXNJbXBsKGFyZ3MudXJsT3JVVUlELCBhcmdzLmRpcmVjdGlvbik7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnZ2V0X3VudXNlZF9hc3NldHMnLFxuICAgICAgICB0aXRsZTogJ0ZpbmQgdW51c2VkIGFzc2V0cycsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBBU1NFVF9BRFZBTkNFRF9ET0NTLmdldF91bnVzZWRfYXNzZXRzLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgZGlyZWN0b3J5OiB6LnN0cmluZygpLmRlZmF1bHQoJ2RiOi8vYXNzZXRzJykuZGVzY3JpYmUoJ0Fzc2V0LWRiIGRpcmVjdG9yeSB0byBzY2FuLiBEZWZhdWx0IGRiOi8vYXNzZXRzLicpLFxuICAgICAgICAgICAgZXhjbHVkZURpcmVjdG9yaWVzOiB6LmFycmF5KHouc3RyaW5nKCkpLmRlZmF1bHQoW10pLmRlc2NyaWJlKCdEaXJlY3RvcmllcyB0byBleGNsdWRlIGZyb20gdW51c2VkLWFzc2V0IHJlcG9ydGluZy4nKSxcbiAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBnZXRVbnVzZWRBc3NldHMoYXJnczogeyBkaXJlY3Rvcnk/OiBzdHJpbmc7IGV4Y2x1ZGVEaXJlY3Rvcmllcz86IHN0cmluZ1tdIH0pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRVbnVzZWRBc3NldHNJbXBsKGFyZ3MuZGlyZWN0b3J5LCBhcmdzLmV4Y2x1ZGVEaXJlY3Rvcmllcyk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnY29tcHJlc3NfdGV4dHVyZXMnLFxuICAgICAgICB0aXRsZTogJ0NvbXByZXNzIHRleHR1cmVzJyxcbiAgICAgICAgZGVzY3JpcHRpb246IEFTU0VUX0FEVkFOQ0VEX0RPQ1MuY29tcHJlc3NfdGV4dHVyZXMsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICBkaXJlY3Rvcnk6IHouc3RyaW5nKCkuZGVmYXVsdCgnZGI6Ly9hc3NldHMnKS5kZXNjcmliZSgnVGV4dHVyZSBkaXJlY3RvcnkgcmVxdWVzdGVkIGZvciBjb21wcmVzc2lvbi4gQ3VycmVudCBpbXBsZW1lbnRhdGlvbiByZXBvcnRzIHVuc3VwcG9ydGVkLicpLFxuICAgICAgICAgICAgZm9ybWF0OiB6LmVudW0oWydhdXRvJywgJ2pwZycsICdwbmcnLCAnd2VicCddKS5kZWZhdWx0KCdhdXRvJykuZGVzY3JpYmUoJ1JlcXVlc3RlZCBvdXRwdXQgZm9ybWF0LiBDdXJyZW50IGltcGxlbWVudGF0aW9uIHJlcG9ydHMgdW5zdXBwb3J0ZWQuJyksXG4gICAgICAgICAgICBxdWFsaXR5OiB6Lm51bWJlcigpLm1pbigwLjEpLm1heCgxLjApLmRlZmF1bHQoMC44KS5kZXNjcmliZSgnUmVxdWVzdGVkIGNvbXByZXNzaW9uIHF1YWxpdHkgZnJvbSAwLjEgdG8gMS4wLiBDdXJyZW50IGltcGxlbWVudGF0aW9uIHJlcG9ydHMgdW5zdXBwb3J0ZWQuJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgY29tcHJlc3NUZXh0dXJlcyhhcmdzOiB7IGRpcmVjdG9yeT86IHN0cmluZzsgZm9ybWF0Pzogc3RyaW5nOyBxdWFsaXR5PzogbnVtYmVyIH0pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5jb21wcmVzc1RleHR1cmVzSW1wbChhcmdzLmRpcmVjdG9yeSwgYXJncy5mb3JtYXQsIGFyZ3MucXVhbGl0eSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnZXhwb3J0X2Fzc2V0X21hbmlmZXN0JyxcbiAgICAgICAgdGl0bGU6ICdFeHBvcnQgYXNzZXQgbWFuaWZlc3QnLFxuICAgICAgICBkZXNjcmlwdGlvbjogQVNTRVRfQURWQU5DRURfRE9DUy5leHBvcnRfYXNzZXRfbWFuaWZlc3QsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICBkaXJlY3Rvcnk6IHouc3RyaW5nKCkuZGVmYXVsdCgnZGI6Ly9hc3NldHMnKS5kZXNjcmliZSgnQXNzZXQtZGIgZGlyZWN0b3J5IHRvIGluY2x1ZGUgaW4gdGhlIG1hbmlmZXN0LiBEZWZhdWx0IGRiOi8vYXNzZXRzLicpLFxuICAgICAgICAgICAgZm9ybWF0OiB6LmVudW0oWydqc29uJywgJ2NzdicsICd4bWwnXSkuZGVmYXVsdCgnanNvbicpLmRlc2NyaWJlKCdSZXR1cm5lZCBtYW5pZmVzdCBzZXJpYWxpemF0aW9uIGZvcm1hdC4nKSxcbiAgICAgICAgICAgIGluY2x1ZGVNZXRhZGF0YTogei5ib29sZWFuKCkuZGVmYXVsdCh0cnVlKS5kZXNjcmliZSgnVHJ5IHRvIGluY2x1ZGUgYXNzZXQgbWV0YWRhdGEgd2hlbiBhdmFpbGFibGUuJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgZXhwb3J0QXNzZXRNYW5pZmVzdChhcmdzOiB7IGRpcmVjdG9yeT86IHN0cmluZzsgZm9ybWF0Pzogc3RyaW5nOyBpbmNsdWRlTWV0YWRhdGE/OiBib29sZWFuIH0pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5leHBvcnRBc3NldE1hbmlmZXN0SW1wbChhcmdzLmRpcmVjdG9yeSwgYXJncy5mb3JtYXQsIGFyZ3MuaW5jbHVkZU1ldGFkYXRhKTtcbiAgICB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdnZXRfdXNlcnMnLFxuICAgICAgICB0aXRsZTogJ0ZpbmQgYXNzZXQgdXNlcnMnLFxuICAgICAgICBkZXNjcmlwdGlvbjogQVNTRVRfQURWQU5DRURfRE9DUy5nZXRfdXNlcnMsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICB1dWlkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdBc3NldCBVVUlEIHRvIGZpbmQgcmVmZXJlbmNlcyB0by4nKSxcbiAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBnZXRVc2VycyhhcmdzOiB7IHV1aWQ6IHN0cmluZyB9KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0VXNlcnNJbXBsKGFyZ3MudXVpZCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBzYXZlQXNzZXRNZXRhSW1wbCh1cmxPclVVSUQ6IHN0cmluZywgY29udGVudDogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdzYXZlLWFzc2V0LW1ldGEnLCB1cmxPclVVSUQsIGNvbnRlbnQpLnRoZW4oKHJlc3VsdDogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh7XG4gICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiByZXN1bHQ/LnV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICB1cmw6IHJlc3VsdD8udXJsLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogJ0Fzc2V0IG1ldGEgc2F2ZWQgc3VjY2Vzc2Z1bGx5J1xuICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2VuZXJhdGVBdmFpbGFibGVVcmxJbXBsKHVybDogc3RyaW5nKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdnZW5lcmF0ZS1hdmFpbGFibGUtdXJsJywgdXJsKS50aGVuKChhdmFpbGFibGVVcmw6IHN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgb3JpZ2luYWxVcmw6IHVybCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGF2YWlsYWJsZVVybDogYXZhaWxhYmxlVXJsLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYXZhaWxhYmxlVXJsID09PSB1cmwgPyBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAnVVJMIGlzIGF2YWlsYWJsZScgOiBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAnR2VuZXJhdGVkIG5ldyBhdmFpbGFibGUgVVJMJ1xuICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICB9KS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZmFpbChlcnIubWVzc2FnZSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgcXVlcnlBc3NldERiUmVhZHlJbXBsKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktcmVhZHknKS50aGVuKChyZWFkeTogYm9vbGVhbikgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVhZHk6IHJlYWR5LFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogcmVhZHkgPyAnQXNzZXQgZGF0YWJhc2UgaXMgcmVhZHknIDogJ0Fzc2V0IGRhdGFiYXNlIGlzIG5vdCByZWFkeSdcbiAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIG9wZW5Bc3NldEV4dGVybmFsSW1wbCh1cmxPclVVSUQ6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAnb3Blbi1hc3NldCcsIHVybE9yVVVJRCkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvayh1bmRlZmluZWQsICdBc3NldCBvcGVuZWQgd2l0aCBleHRlcm5hbCBwcm9ncmFtJykpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGJhdGNoSW1wb3J0QXNzZXRzSW1wbChhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBmcyA9IHJlcXVpcmUoJ2ZzJyk7XG4gICAgICAgIGNvbnN0IHBhdGggPSByZXF1aXJlKCdwYXRoJyk7XG4gICAgICAgIFxuICAgICAgICBpZiAoIWZzLmV4aXN0c1N5bmMoYXJncy5zb3VyY2VEaXJlY3RvcnkpKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFpbCgnU291cmNlIGRpcmVjdG9yeSBkb2VzIG5vdCBleGlzdCcpO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgZmlsZXMgPSB0aGlzLmdldEZpbGVzRnJvbURpcmVjdG9yeShcbiAgICAgICAgICAgIGFyZ3Muc291cmNlRGlyZWN0b3J5LCBcbiAgICAgICAgICAgIGFyZ3MuZmlsZUZpbHRlciB8fCBbXSwgXG4gICAgICAgICAgICBhcmdzLnJlY3Vyc2l2ZSB8fCBmYWxzZVxuICAgICAgICApO1xuXG4gICAgICAgIGNvbnN0IGltcG9ydFJlc3VsdHM6IGFueVtdID0gW107XG4gICAgICAgIGxldCBzdWNjZXNzQ291bnQgPSAwO1xuICAgICAgICBsZXQgZXJyb3JDb3VudCA9IDA7XG5cbiAgICAgICAgZm9yIChjb25zdCBmaWxlUGF0aCBvZiBmaWxlcykge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCBmaWxlTmFtZSA9IHBhdGguYmFzZW5hbWUoZmlsZVBhdGgpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHRhcmdldFBhdGggPSBgJHthcmdzLnRhcmdldERpcmVjdG9yeX0vJHtmaWxlTmFtZX1gO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ2ltcG9ydC1hc3NldCcsIFxuICAgICAgICAgICAgICAgICAgICBmaWxlUGF0aCwgdGFyZ2V0UGF0aCwgeyBcbiAgICAgICAgICAgICAgICAgICAgICAgIG92ZXJ3cml0ZTogYXJncy5vdmVyd3JpdGUgfHwgZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgICAgICByZW5hbWU6ICEoYXJncy5vdmVyd3JpdGUgfHwgZmFsc2UpXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGltcG9ydFJlc3VsdHMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgIHNvdXJjZTogZmlsZVBhdGgsXG4gICAgICAgICAgICAgICAgICAgIHRhcmdldDogdGFyZ2V0UGF0aCxcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgdXVpZDogcmVzdWx0Py51dWlkXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgc3VjY2Vzc0NvdW50Kys7XG4gICAgICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgICAgIGltcG9ydFJlc3VsdHMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgIHNvdXJjZTogZmlsZVBhdGgsXG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICBlcnJvcjogZXJyLm1lc3NhZ2VcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBlcnJvckNvdW50Kys7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gb2soe1xuICAgICAgICAgICAgICAgIHRvdGFsRmlsZXM6IGZpbGVzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICBzdWNjZXNzQ291bnQ6IHN1Y2Nlc3NDb3VudCxcbiAgICAgICAgICAgICAgICBlcnJvckNvdW50OiBlcnJvckNvdW50LFxuICAgICAgICAgICAgICAgIHJlc3VsdHM6IGltcG9ydFJlc3VsdHMsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogYEJhdGNoIGltcG9ydCBjb21wbGV0ZWQ6ICR7c3VjY2Vzc0NvdW50fSBzdWNjZXNzLCAke2Vycm9yQ291bnR9IGVycm9yc2BcbiAgICAgICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgZ2V0RmlsZXNGcm9tRGlyZWN0b3J5KGRpclBhdGg6IHN0cmluZywgZmlsZUZpbHRlcjogc3RyaW5nW10sIHJlY3Vyc2l2ZTogYm9vbGVhbik6IHN0cmluZ1tdIHtcbiAgICAgICAgY29uc3QgZnMgPSByZXF1aXJlKCdmcycpO1xuICAgICAgICBjb25zdCBwYXRoID0gcmVxdWlyZSgncGF0aCcpO1xuICAgICAgICBjb25zdCBmaWxlczogc3RyaW5nW10gPSBbXTtcblxuICAgICAgICBjb25zdCBpdGVtcyA9IGZzLnJlYWRkaXJTeW5jKGRpclBhdGgpO1xuICAgICAgICBcbiAgICAgICAgZm9yIChjb25zdCBpdGVtIG9mIGl0ZW1zKSB7XG4gICAgICAgICAgICBjb25zdCBmdWxsUGF0aCA9IHBhdGguam9pbihkaXJQYXRoLCBpdGVtKTtcbiAgICAgICAgICAgIGNvbnN0IHN0YXQgPSBmcy5zdGF0U3luYyhmdWxsUGF0aCk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmIChzdGF0LmlzRmlsZSgpKSB7XG4gICAgICAgICAgICAgICAgaWYgKGZpbGVGaWx0ZXIubGVuZ3RoID09PSAwIHx8IGZpbGVGaWx0ZXIuc29tZShleHQgPT4gaXRlbS50b0xvd2VyQ2FzZSgpLmVuZHNXaXRoKGV4dC50b0xvd2VyQ2FzZSgpKSkpIHtcbiAgICAgICAgICAgICAgICAgICAgZmlsZXMucHVzaChmdWxsUGF0aCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIGlmIChzdGF0LmlzRGlyZWN0b3J5KCkgJiYgcmVjdXJzaXZlKSB7XG4gICAgICAgICAgICAgICAgZmlsZXMucHVzaCguLi50aGlzLmdldEZpbGVzRnJvbURpcmVjdG9yeShmdWxsUGF0aCwgZmlsZUZpbHRlciwgcmVjdXJzaXZlKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHJldHVybiBmaWxlcztcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGJhdGNoRGVsZXRlQXNzZXRzSW1wbCh1cmxzOiBzdHJpbmdbXSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IGRlbGV0ZVJlc3VsdHM6IGFueVtdID0gW107XG4gICAgICAgIGxldCBzdWNjZXNzQ291bnQgPSAwO1xuICAgICAgICBsZXQgZXJyb3JDb3VudCA9IDA7XG5cbiAgICAgICAgZm9yIChjb25zdCB1cmwgb2YgdXJscykge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdkZWxldGUtYXNzZXQnLCB1cmwpO1xuICAgICAgICAgICAgICAgIGRlbGV0ZVJlc3VsdHMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgIHVybDogdXJsLFxuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgc3VjY2Vzc0NvdW50Kys7XG4gICAgICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgICAgIGRlbGV0ZVJlc3VsdHMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgIHVybDogdXJsLFxuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGVyci5tZXNzYWdlXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgZXJyb3JDb3VudCsrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG9rKHtcbiAgICAgICAgICAgICAgICB0b3RhbEFzc2V0czogdXJscy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgc3VjY2Vzc0NvdW50OiBzdWNjZXNzQ291bnQsXG4gICAgICAgICAgICAgICAgZXJyb3JDb3VudDogZXJyb3JDb3VudCxcbiAgICAgICAgICAgICAgICByZXN1bHRzOiBkZWxldGVSZXN1bHRzLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBCYXRjaCBkZWxldGUgY29tcGxldGVkOiAke3N1Y2Nlc3NDb3VudH0gc3VjY2VzcywgJHtlcnJvckNvdW50fSBlcnJvcnNgXG4gICAgICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHZhbGlkYXRlQXNzZXRSZWZlcmVuY2VzSW1wbChkaXJlY3Rvcnk6IHN0cmluZyA9ICdkYjovL2Fzc2V0cycpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICAvLyBHZXQgYWxsIGFzc2V0cyBpbiBkaXJlY3RvcnlcbiAgICAgICAgY29uc3QgYXNzZXRzID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXRzJywgeyBwYXR0ZXJuOiBgJHtkaXJlY3Rvcnl9LyoqLypgIH0pO1xuICAgICAgICBcbiAgICAgICAgY29uc3QgYnJva2VuUmVmZXJlbmNlczogYW55W10gPSBbXTtcbiAgICAgICAgY29uc3QgdmFsaWRSZWZlcmVuY2VzOiBhbnlbXSA9IFtdO1xuXG4gICAgICAgIGZvciAoY29uc3QgYXNzZXQgb2YgYXNzZXRzKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGFzc2V0SW5mbyA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0LWluZm8nLCBhc3NldC51cmwpO1xuICAgICAgICAgICAgICAgIGlmIChhc3NldEluZm8pIHtcbiAgICAgICAgICAgICAgICAgICAgdmFsaWRSZWZlcmVuY2VzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgdXJsOiBhc3NldC51cmwsXG4gICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiBhc3NldC51dWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogYXNzZXQubmFtZVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgICAgICBicm9rZW5SZWZlcmVuY2VzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICB1cmw6IGFzc2V0LnVybCxcbiAgICAgICAgICAgICAgICAgICAgdXVpZDogYXNzZXQudXVpZCxcbiAgICAgICAgICAgICAgICAgICAgbmFtZTogYXNzZXQubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgZXJyb3I6IChlcnIgYXMgRXJyb3IpLm1lc3NhZ2VcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgZGlyZWN0b3J5OiBkaXJlY3RvcnksXG4gICAgICAgICAgICAgICAgdG90YWxBc3NldHM6IGFzc2V0cy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgdmFsaWRSZWZlcmVuY2VzOiB2YWxpZFJlZmVyZW5jZXMubGVuZ3RoLFxuICAgICAgICAgICAgICAgIGJyb2tlblJlZmVyZW5jZXM6IGJyb2tlblJlZmVyZW5jZXMubGVuZ3RoLFxuICAgICAgICAgICAgICAgIGJyb2tlbkFzc2V0czogYnJva2VuUmVmZXJlbmNlcyxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiBgVmFsaWRhdGlvbiBjb21wbGV0ZWQ6ICR7YnJva2VuUmVmZXJlbmNlcy5sZW5ndGh9IGJyb2tlbiByZWZlcmVuY2VzIGZvdW5kYFxuICAgICAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRUcmVlSW1wbChkaXJlY3Rvcnk6IHN0cmluZyA9ICdkYjovL2Fzc2V0cycsIG1heERlcHRoOiBudW1iZXIgPSA4KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3Qgcm9vdFVybCA9IGRpcmVjdG9yeS5yZXBsYWNlKC9cXC8rJC8sICcnKTtcbiAgICAgICAgY29uc3QgYm91bmRlZERlcHRoID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oMzIsIE1hdGguZmxvb3IobWF4RGVwdGgpKSk7XG4gICAgICAgIGNvbnN0IGFzc2V0cyA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0cycsIHsgcGF0dGVybjogYCR7cm9vdFVybH0vKiovKmAgfSk7XG4gICAgICAgIGNvbnN0IHJvb3ROYW1lID0gcm9vdFVybC5zcGxpdCgnLycpLmZpbHRlcihCb29sZWFuKS5wb3AoKSA/PyByb290VXJsO1xuICAgICAgICBjb25zdCByb290OiBUcmVlTm9kZSA9IHtcbiAgICAgICAgICAgIG5hbWU6IHJvb3ROYW1lLFxuICAgICAgICAgICAgdXJsOiByb290VXJsLFxuICAgICAgICAgICAgaXNEaXJlY3Rvcnk6IHRydWUsXG4gICAgICAgICAgICBjaGlsZHJlbjogW10sXG4gICAgICAgIH07XG4gICAgICAgIGNvbnN0IGRpcmVjdG9yaWVzID0gbmV3IE1hcDxzdHJpbmcsIFRyZWVOb2RlPihbW3Jvb3RVcmwsIHJvb3RdXSk7XG5cbiAgICAgICAgY29uc3QgZW5zdXJlRGlyZWN0b3J5ID0gKHVybDogc3RyaW5nKTogVHJlZU5vZGUgPT4ge1xuICAgICAgICAgICAgY29uc3Qgbm9ybWFsaXplZCA9IHVybC5yZXBsYWNlKC9cXC8rJC8sICcnKTtcbiAgICAgICAgICAgIGNvbnN0IGV4aXN0aW5nID0gZGlyZWN0b3JpZXMuZ2V0KG5vcm1hbGl6ZWQpO1xuICAgICAgICAgICAgaWYgKGV4aXN0aW5nKSByZXR1cm4gZXhpc3Rpbmc7XG4gICAgICAgICAgICBjb25zdCBwYXJlbnRVcmwgPSBub3JtYWxpemVkLnNsaWNlKDAsIG5vcm1hbGl6ZWQubGFzdEluZGV4T2YoJy8nKSk7XG4gICAgICAgICAgICBjb25zdCBwYXJlbnQgPSBwYXJlbnRVcmwuc3RhcnRzV2l0aChyb290VXJsKSA/IGVuc3VyZURpcmVjdG9yeShwYXJlbnRVcmwpIDogcm9vdDtcbiAgICAgICAgICAgIGNvbnN0IG5vZGU6IFRyZWVOb2RlID0ge1xuICAgICAgICAgICAgICAgIG5hbWU6IG5vcm1hbGl6ZWQuc3BsaXQoJy8nKS5wb3AoKSA/PyBub3JtYWxpemVkLFxuICAgICAgICAgICAgICAgIHVybDogbm9ybWFsaXplZCxcbiAgICAgICAgICAgICAgICBpc0RpcmVjdG9yeTogdHJ1ZSxcbiAgICAgICAgICAgICAgICBjaGlsZHJlbjogW10sXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgZGlyZWN0b3JpZXMuc2V0KG5vcm1hbGl6ZWQsIG5vZGUpO1xuICAgICAgICAgICAgcGFyZW50LmNoaWxkcmVuLnB1c2gobm9kZSk7XG4gICAgICAgICAgICByZXR1cm4gbm9kZTtcbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCBkZXB0aE9mID0gKHVybDogc3RyaW5nKTogbnVtYmVyID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHJlbCA9IHVybC5zbGljZShyb290VXJsLmxlbmd0aCkucmVwbGFjZSgvXlxcLysvLCAnJyk7XG4gICAgICAgICAgICBpZiAoIXJlbCkgcmV0dXJuIDA7XG4gICAgICAgICAgICByZXR1cm4gcmVsLnNwbGl0KCcvJykuZmlsdGVyKEJvb2xlYW4pLmxlbmd0aDtcbiAgICAgICAgfTtcblxuICAgICAgICBmb3IgKGNvbnN0IGFzc2V0IG9mIGFzc2V0cykge1xuICAgICAgICAgICAgY29uc3QgdXJsID0gU3RyaW5nKGFzc2V0LnVybCA/PyAnJykucmVwbGFjZSgvXFwvKyQvLCAnJyk7XG4gICAgICAgICAgICBpZiAoIXVybC5zdGFydHNXaXRoKGAke3Jvb3RVcmx9L2ApIHx8IGRlcHRoT2YodXJsKSA+IGJvdW5kZWREZXB0aCkgY29udGludWU7XG4gICAgICAgICAgICBjb25zdCBwYXJlbnRVcmwgPSB1cmwuc2xpY2UoMCwgdXJsLmxhc3RJbmRleE9mKCcvJykpO1xuICAgICAgICAgICAgY29uc3QgcGFyZW50ID0gcGFyZW50VXJsLnN0YXJ0c1dpdGgocm9vdFVybCkgPyBlbnN1cmVEaXJlY3RvcnkocGFyZW50VXJsKSA6IHJvb3Q7XG5cbiAgICAgICAgICAgIGlmIChhc3NldC5pc0RpcmVjdG9yeSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGRpciA9IGVuc3VyZURpcmVjdG9yeSh1cmwpO1xuICAgICAgICAgICAgICAgIGRpci51dWlkID0gYXNzZXQudXVpZDtcbiAgICAgICAgICAgICAgICBkaXIudHlwZSA9IGFzc2V0LnR5cGU7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHBhcmVudC5jaGlsZHJlbi5wdXNoKHtcbiAgICAgICAgICAgICAgICBuYW1lOiBhc3NldC5uYW1lID8/IHVybC5zcGxpdCgnLycpLnBvcCgpID8/IHVybCxcbiAgICAgICAgICAgICAgICB1cmwsXG4gICAgICAgICAgICAgICAgdXVpZDogYXNzZXQudXVpZCxcbiAgICAgICAgICAgICAgICB0eXBlOiBhc3NldC50eXBlLFxuICAgICAgICAgICAgICAgIGlzRGlyZWN0b3J5OiBmYWxzZSxcbiAgICAgICAgICAgICAgICBjaGlsZHJlbjogW10sXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHNvcnRUcmVlID0gKG5vZGU6IFRyZWVOb2RlKTogdm9pZCA9PiB7XG4gICAgICAgICAgICBub2RlLmNoaWxkcmVuLnNvcnQoKGEsIGIpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoYS5pc0RpcmVjdG9yeSAhPT0gYi5pc0RpcmVjdG9yeSkgcmV0dXJuIGEuaXNEaXJlY3RvcnkgPyAtMSA6IDE7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGEubmFtZS5sb2NhbGVDb21wYXJlKGIubmFtZSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIG5vZGUuY2hpbGRyZW4uZm9yRWFjaChzb3J0VHJlZSk7XG4gICAgICAgIH07XG4gICAgICAgIHNvcnRUcmVlKHJvb3QpO1xuXG4gICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgZGlyZWN0b3J5OiByb290VXJsLFxuICAgICAgICAgICAgICAgIG1heERlcHRoOiBib3VuZGVkRGVwdGgsXG4gICAgICAgICAgICAgICAgYXNzZXRDb3VudDogYXNzZXRzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICB0cmVlOiByb290LFxuICAgICAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRBc3NldERlcGVuZGVuY2llc0ltcGwodXJsT3JVVUlEOiBzdHJpbmcsIGRpcmVjdGlvbjogc3RyaW5nID0gJ2RlcGVuZGVuY2llcycpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIC8vIE5vdGU6IFRoaXMgd291bGQgcmVxdWlyZSBzY2VuZSBhbmFseXNpcyBvciBhZGRpdGlvbmFsIEFQSXMgbm90IGF2YWlsYWJsZSBpbiBjdXJyZW50IGRvY3VtZW50YXRpb25cbiAgICAgICAgICAgIHJlc29sdmUoZmFpbCgnQXNzZXQgZGVwZW5kZW5jeSBhbmFseXNpcyByZXF1aXJlcyBhZGRpdGlvbmFsIEFQSXMgbm90IGF2YWlsYWJsZSBpbiBjdXJyZW50IENvY29zIENyZWF0b3IgTUNQIGltcGxlbWVudGF0aW9uLiBDb25zaWRlciB1c2luZyB0aGUgRWRpdG9yIFVJIGZvciBkZXBlbmRlbmN5IGFuYWx5c2lzLicpKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRVbnVzZWRBc3NldHNJbXBsKGRpcmVjdG9yeTogc3RyaW5nID0gJ2RiOi8vYXNzZXRzJywgZXhjbHVkZURpcmVjdG9yaWVzOiBzdHJpbmdbXSA9IFtdKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3Qgcm9vdFVybCA9IGRpcmVjdG9yeS5yZXBsYWNlKC9cXC8rJC8sICcnKTtcbiAgICAgICAgY29uc3QgZXhjbHVkZXMgPSBleGNsdWRlRGlyZWN0b3JpZXMubWFwKGRpciA9PiBkaXIucmVwbGFjZSgvXFwvKyQvLCAnJykpO1xuICAgICAgICBjb25zdCBhbGxBc3NldHMgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldHMnLCB7IHBhdHRlcm46IGAke3Jvb3RVcmx9LyoqLypgIH0pO1xuICAgICAgICBjb25zdCBzY2VuZXMgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldHMnLCB7IHBhdHRlcm46ICdkYjovL2Fzc2V0cy8qKicsIGNjVHlwZTogJ2NjLlNjZW5lQXNzZXQnIH0pO1xuICAgICAgICBjb25zdCBwcmVmYWJzID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXRzJywgeyBwYXR0ZXJuOiAnZGI6Ly9hc3NldHMvKionLCBjY1R5cGU6ICdjYy5QcmVmYWInIH0pO1xuICAgICAgICBjb25zdCByb290cyA9IEFycmF5LmZyb20obmV3IE1hcChbLi4uc2NlbmVzLCAuLi5wcmVmYWJzXS5tYXAoKGFzc2V0OiBhbnkpID0+IFthc3NldC51dWlkLCBhc3NldF0pKS52YWx1ZXMoKSk7XG4gICAgICAgIGNvbnN0IHJlZmVyZW5jZWRVdWlkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAgICAgICBjb25zdCBkZXBlbmRlbmN5RXJyb3JzOiBhbnlbXSA9IFtdO1xuXG4gICAgICAgIGNvbnN0IGFkZERlcGVuZGVuY3kgPSAoZGVwOiBhbnkpOiB2b2lkID0+IHtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgZGVwID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgIHJlZmVyZW5jZWRVdWlkcy5hZGQoZGVwKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZGVwPy51dWlkICYmIHR5cGVvZiBkZXAudXVpZCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICByZWZlcmVuY2VkVXVpZHMuYWRkKGRlcC51dWlkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBmb3IgKGNvbnN0IGFzc2V0IG9mIHJvb3RzKSB7XG4gICAgICAgICAgICByZWZlcmVuY2VkVXVpZHMuYWRkKGFzc2V0LnV1aWQpO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCBkZXBzID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXQtZGVwZW5kZW5jaWVzJywgYXNzZXQudXVpZCwgdW5kZWZpbmVkKTtcbiAgICAgICAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShkZXBzKSkge1xuICAgICAgICAgICAgICAgICAgICBkZXBzLmZvckVhY2goYWRkRGVwZW5kZW5jeSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgICAgICBkZXBlbmRlbmN5RXJyb3JzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICB1dWlkOiBhc3NldC51dWlkLFxuICAgICAgICAgICAgICAgICAgICB1cmw6IGFzc2V0LnVybCxcbiAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKSxcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGlzRXhjbHVkZWQgPSAodXJsOiBzdHJpbmcpOiBib29sZWFuID0+IGV4Y2x1ZGVzLnNvbWUoZGlyID0+IHVybCA9PT0gZGlyIHx8IHVybC5zdGFydHNXaXRoKGAke2Rpcn0vYCkpO1xuICAgICAgICBjb25zdCBjYW5kaWRhdGVzID0gYWxsQXNzZXRzLmZpbHRlcigoYXNzZXQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgdXJsID0gU3RyaW5nKGFzc2V0LnVybCA/PyAnJyk7XG4gICAgICAgICAgICBpZiAoIXVybC5zdGFydHNXaXRoKGAke3Jvb3RVcmx9L2ApKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICBpZiAoYXNzZXQuaXNEaXJlY3RvcnkpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIGlmICghYXNzZXQudXVpZCkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgaWYgKGlzRXhjbHVkZWQodXJsKSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgcmV0dXJuICFyZWZlcmVuY2VkVXVpZHMuaGFzKGFzc2V0LnV1aWQpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gb2soe1xuICAgICAgICAgICAgICAgIGRpcmVjdG9yeTogcm9vdFVybCxcbiAgICAgICAgICAgICAgICBleGNsdWRlRGlyZWN0b3JpZXM6IGV4Y2x1ZGVzLFxuICAgICAgICAgICAgICAgIHNjYW5uZWRSb290czogcm9vdHMubWFwKChhc3NldDogYW55KSA9PiAoe1xuICAgICAgICAgICAgICAgICAgICB1dWlkOiBhc3NldC51dWlkLFxuICAgICAgICAgICAgICAgICAgICB1cmw6IGFzc2V0LnVybCxcbiAgICAgICAgICAgICAgICAgICAgbmFtZTogYXNzZXQubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogYXNzZXQudHlwZSxcbiAgICAgICAgICAgICAgICB9KSksXG4gICAgICAgICAgICAgICAgcmVmZXJlbmNlZENvdW50OiByZWZlcmVuY2VkVXVpZHMuc2l6ZSxcbiAgICAgICAgICAgICAgICB0b3RhbEFzc2V0czogYWxsQXNzZXRzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICB1bnVzZWRDb3VudDogY2FuZGlkYXRlcy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgdW51c2VkQXNzZXRzOiBjYW5kaWRhdGVzLm1hcCgoYXNzZXQ6IGFueSkgPT4gKHtcbiAgICAgICAgICAgICAgICAgICAgdXVpZDogYXNzZXQudXVpZCxcbiAgICAgICAgICAgICAgICAgICAgdXJsOiBhc3NldC51cmwsXG4gICAgICAgICAgICAgICAgICAgIG5hbWU6IGFzc2V0Lm5hbWUsXG4gICAgICAgICAgICAgICAgICAgIHR5cGU6IGFzc2V0LnR5cGUsXG4gICAgICAgICAgICAgICAgfSkpLFxuICAgICAgICAgICAgICAgIGRlcGVuZGVuY3lFcnJvcnMsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogYFVudXNlZCBhc3NldCBzY2FuIGNvbXBsZXRlZDogJHtjYW5kaWRhdGVzLmxlbmd0aH0gdW5yZWZlcmVuY2VkIGFzc2V0cyBmb3VuZGAsXG4gICAgICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGNvbXByZXNzVGV4dHVyZXNJbXBsKGRpcmVjdG9yeTogc3RyaW5nID0gJ2RiOi8vYXNzZXRzJywgZm9ybWF0OiBzdHJpbmcgPSAnYXV0bycsIHF1YWxpdHk6IG51bWJlciA9IDAuOCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgLy8gTm90ZTogVGV4dHVyZSBjb21wcmVzc2lvbiB3b3VsZCByZXF1aXJlIGltYWdlIHByb2Nlc3NpbmcgQVBJc1xuICAgICAgICAgICAgcmVzb2x2ZShmYWlsKCdUZXh0dXJlIGNvbXByZXNzaW9uIHJlcXVpcmVzIGltYWdlIHByb2Nlc3NpbmcgY2FwYWJpbGl0aWVzIG5vdCBhdmFpbGFibGUgaW4gY3VycmVudCBDb2NvcyBDcmVhdG9yIE1DUCBpbXBsZW1lbnRhdGlvbi4gVXNlIHRoZSBFZGl0b3JcXCdzIGJ1aWx0LWluIHRleHR1cmUgY29tcHJlc3Npb24gc2V0dGluZ3Mgb3IgZXh0ZXJuYWwgdG9vbHMuJykpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGV4cG9ydEFzc2V0TWFuaWZlc3RJbXBsKGRpcmVjdG9yeTogc3RyaW5nID0gJ2RiOi8vYXNzZXRzJywgZm9ybWF0OiBzdHJpbmcgPSAnanNvbicsIGluY2x1ZGVNZXRhZGF0YTogYm9vbGVhbiA9IHRydWUpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBhc3NldHMgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldHMnLCB7IHBhdHRlcm46IGAke2RpcmVjdG9yeX0vKiovKmAgfSk7XG4gICAgICAgIFxuICAgICAgICBjb25zdCBtYW5pZmVzdDogYW55W10gPSBbXTtcblxuICAgICAgICBmb3IgKGNvbnN0IGFzc2V0IG9mIGFzc2V0cykge1xuICAgICAgICAgICAgY29uc3QgbWFuaWZlc3RFbnRyeTogYW55ID0ge1xuICAgICAgICAgICAgICAgIG5hbWU6IGFzc2V0Lm5hbWUsXG4gICAgICAgICAgICAgICAgdXJsOiBhc3NldC51cmwsXG4gICAgICAgICAgICAgICAgdXVpZDogYXNzZXQudXVpZCxcbiAgICAgICAgICAgICAgICB0eXBlOiBhc3NldC50eXBlLFxuICAgICAgICAgICAgICAgIHNpemU6IChhc3NldCBhcyBhbnkpLnNpemUgfHwgMCxcbiAgICAgICAgICAgICAgICBpc0RpcmVjdG9yeTogYXNzZXQuaXNEaXJlY3RvcnkgfHwgZmFsc2VcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGlmIChpbmNsdWRlTWV0YWRhdGEpIHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBhc3NldEluZm8gPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldC1pbmZvJywgYXNzZXQudXJsKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGFzc2V0SW5mbyAmJiBhc3NldEluZm8ubWV0YSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgbWFuaWZlc3RFbnRyeS5tZXRhID0gYXNzZXRJbmZvLm1ldGE7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gU2tpcCBtZXRhZGF0YSBpZiBub3QgYXZhaWxhYmxlXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBtYW5pZmVzdC5wdXNoKG1hbmlmZXN0RW50cnkpO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IGV4cG9ydERhdGE6IHN0cmluZztcbiAgICAgICAgc3dpdGNoIChmb3JtYXQpIHtcbiAgICAgICAgICAgIGNhc2UgJ2pzb24nOlxuICAgICAgICAgICAgICAgIGV4cG9ydERhdGEgPSBKU09OLnN0cmluZ2lmeShtYW5pZmVzdCwgbnVsbCwgMik7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdjc3YnOlxuICAgICAgICAgICAgICAgIGV4cG9ydERhdGEgPSB0aGlzLmNvbnZlcnRUb0NTVihtYW5pZmVzdCk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICd4bWwnOlxuICAgICAgICAgICAgICAgIGV4cG9ydERhdGEgPSB0aGlzLmNvbnZlcnRUb1hNTChtYW5pZmVzdCk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIGV4cG9ydERhdGEgPSBKU09OLnN0cmluZ2lmeShtYW5pZmVzdCwgbnVsbCwgMik7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gb2soe1xuICAgICAgICAgICAgICAgIGRpcmVjdG9yeTogZGlyZWN0b3J5LFxuICAgICAgICAgICAgICAgIGZvcm1hdDogZm9ybWF0LFxuICAgICAgICAgICAgICAgIGFzc2V0Q291bnQ6IG1hbmlmZXN0Lmxlbmd0aCxcbiAgICAgICAgICAgICAgICBpbmNsdWRlTWV0YWRhdGE6IGluY2x1ZGVNZXRhZGF0YSxcbiAgICAgICAgICAgICAgICBtYW5pZmVzdDogZXhwb3J0RGF0YSxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiBgQXNzZXQgbWFuaWZlc3QgZXhwb3J0ZWQgd2l0aCAke21hbmlmZXN0Lmxlbmd0aH0gYXNzZXRzYFxuICAgICAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBjb252ZXJ0VG9DU1YoZGF0YTogYW55W10pOiBzdHJpbmcge1xuICAgICAgICBpZiAoZGF0YS5sZW5ndGggPT09IDApIHJldHVybiAnJztcbiAgICAgICAgXG4gICAgICAgIGNvbnN0IGhlYWRlcnMgPSBPYmplY3Qua2V5cyhkYXRhWzBdKTtcbiAgICAgICAgY29uc3QgY3N2Um93cyA9IFtoZWFkZXJzLmpvaW4oJywnKV07XG4gICAgICAgIFxuICAgICAgICBmb3IgKGNvbnN0IHJvdyBvZiBkYXRhKSB7XG4gICAgICAgICAgICBjb25zdCB2YWx1ZXMgPSBoZWFkZXJzLm1hcChoZWFkZXIgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHZhbHVlID0gcm93W2hlYWRlcl07XG4gICAgICAgICAgICAgICAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgPyBKU09OLnN0cmluZ2lmeSh2YWx1ZSkgOiBTdHJpbmcodmFsdWUpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBjc3ZSb3dzLnB1c2godmFsdWVzLmpvaW4oJywnKSk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHJldHVybiBjc3ZSb3dzLmpvaW4oJ1xcbicpO1xuICAgIH1cblxuICAgIHByaXZhdGUgY29udmVydFRvWE1MKGRhdGE6IGFueVtdKTogc3RyaW5nIHtcbiAgICAgICAgbGV0IHhtbCA9ICc8P3htbCB2ZXJzaW9uPVwiMS4wXCIgZW5jb2Rpbmc9XCJVVEYtOFwiPz5cXG48YXNzZXRzPlxcbic7XG4gICAgICAgIFxuICAgICAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgZGF0YSkge1xuICAgICAgICAgICAgeG1sICs9ICcgIDxhc3NldD5cXG4nO1xuICAgICAgICAgICAgZm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoaXRlbSkpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB4bWxWYWx1ZSA9IHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgPyBcbiAgICAgICAgICAgICAgICAgICAgSlNPTi5zdHJpbmdpZnkodmFsdWUpIDogXG4gICAgICAgICAgICAgICAgICAgIFN0cmluZyh2YWx1ZSkucmVwbGFjZSgvJi9nLCAnJmFtcDsnKS5yZXBsYWNlKC88L2csICcmbHQ7JykucmVwbGFjZSgvPi9nLCAnJmd0OycpO1xuICAgICAgICAgICAgICAgIHhtbCArPSBgICAgIDwke2tleX0+JHt4bWxWYWx1ZX08LyR7a2V5fT5cXG5gO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgeG1sICs9ICcgIDwvYXNzZXQ+XFxuJztcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgeG1sICs9ICc8L2Fzc2V0cz4nO1xuICAgICAgICByZXR1cm4geG1sO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2V0VXNlcnNJbXBsKHRhcmdldFV1aWQ6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHNjZW5lcyA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0cycsIHsgcGF0dGVybjogJ2RiOi8vYXNzZXRzLyoqJywgY2NUeXBlOiAnY2MuU2NlbmVBc3NldCcgfSk7XG4gICAgICAgIGNvbnN0IHByZWZhYnMgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldHMnLCB7IHBhdHRlcm46ICdkYjovL2Fzc2V0cy8qKicsIGNjVHlwZTogJ2NjLlByZWZhYicgfSk7XG4gICAgICAgIGNvbnN0IHNjcmlwdHNUcyA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0cycsIHsgcGF0dGVybjogJ2RiOi8vYXNzZXRzLyoqLyoudHMnIH0pO1xuICAgICAgICBjb25zdCBzY3JpcHRzSnMgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldHMnLCB7IHBhdHRlcm46ICdkYjovL2Fzc2V0cy8qKi8qLmpzJyB9KTtcbiAgICAgICAgXG4gICAgICAgIGNvbnN0IGFsbEFzc2V0cyA9IFsuLi5zY2VuZXMsIC4uLnByZWZhYnMsIC4uLnNjcmlwdHNUcywgLi4uc2NyaXB0c0pzXTtcbiAgICAgICAgY29uc3QgdW5pcXVlQXNzZXRzID0gQXJyYXkuZnJvbShuZXcgTWFwKGFsbEFzc2V0cy5tYXAoKGE6IGFueSkgPT4gW2EudXVpZCwgYV0pKS52YWx1ZXMoKSk7XG5cbiAgICAgICAgY29uc3QgdXNlcnM6IGFueVtdID0gW107XG4gICAgICAgIGZvciAoY29uc3QgYXNzZXQgb2YgdW5pcXVlQXNzZXRzKSB7XG4gICAgICAgICAgICBjb25zdCBkZXBzID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXQtZGVwZW5kZW5jaWVzJywgYXNzZXQudXVpZCwgdW5kZWZpbmVkKTtcbiAgICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KGRlcHMpICYmIGRlcHMuaW5jbHVkZXModGFyZ2V0VXVpZCkpIHtcbiAgICAgICAgICAgICAgICBsZXQgdHlwZSA9ICdzY3JpcHQnO1xuICAgICAgICAgICAgICAgIGlmIChhc3NldC50eXBlID09PSAnY2MuU2NlbmVBc3NldCcpIHR5cGUgPSAnc2NlbmUnO1xuICAgICAgICAgICAgICAgIGVsc2UgaWYgKGFzc2V0LnR5cGUgPT09ICdjYy5QcmVmYWInKSB0eXBlID0gJ3ByZWZhYic7XG4gICAgICAgICAgICAgICAgdXNlcnMucHVzaCh7IHR5cGUsIHV1aWQ6IGFzc2V0LnV1aWQsIHBhdGg6IGFzc2V0LnVybCwgbmFtZTogYXNzZXQubmFtZSB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgcmV0dXJuIG9rKHsgdXVpZDogdGFyZ2V0VXVpZCwgdXNlcnMsIHRvdGFsOiB1c2Vycy5sZW5ndGggfSk7XG4gICAgfVxufVxuIl19