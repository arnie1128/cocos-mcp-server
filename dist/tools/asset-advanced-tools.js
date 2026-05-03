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
                const deps = await Editor.Message.request('asset-db', 'query-asset-depends', asset.uuid);
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
            const deps = await Editor.Message.request('asset-db', 'query-asset-depends', asset.uuid);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXNzZXQtYWR2YW5jZWQtdG9vbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvdG9vbHMvYXNzZXQtYWR2YW5jZWQtdG9vbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7O0FBQUEsOENBQTJDO0FBRTNDLDBDQUFrQztBQUNsQyxrREFBdUU7QUFDdkUscUVBQWtFO0FBV2xFLE1BQWEsa0JBQWtCO0lBRzNCO1FBQ0ksSUFBSSxDQUFDLElBQUksR0FBRyxJQUFBLHNDQUF5QixFQUFDLElBQUksQ0FBQyxDQUFDO0lBQ2hELENBQUM7SUFFRCxRQUFRLEtBQXVCLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDN0QsT0FBTyxDQUFDLFFBQWdCLEVBQUUsSUFBUyxJQUEyQixPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFXbkcsQUFBTixLQUFLLENBQUMsYUFBYSxDQUFDLElBQTRDO1FBQzVELE9BQU8sSUFBSSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ2hFLENBQUM7SUFVSyxBQUFOLEtBQUssQ0FBQyxvQkFBb0IsQ0FBQyxJQUFxQjtRQUM1QyxPQUFPLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDbkQsQ0FBQztJQVFLLEFBQU4sS0FBSyxDQUFDLGlCQUFpQjtRQUNuQixPQUFPLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO0lBQ3hDLENBQUM7SUFVSyxBQUFOLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxJQUEyQjtRQUMvQyxPQUFPLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDdEQsQ0FBQztJQWNLLEFBQU4sS0FBSyxD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LFdBQVcsRUFBRSx5Q0FBbUIsQ0FBQyxxQkFBcUI7UUFDdEQsV0FBVyxFQUFFLFVBQUMsQ0FBQyxNQUFNLENBQUM7WUFDbEIsU0FBUyxFQUFFLFVBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLENBQUMsUUFBUSxDQUFDLHFFQUFxRSxDQUFDO1lBQzVILE1BQU0sRUFBRSxVQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxRQUFRLENBQUMseUNBQXlDLENBQUM7WUFDMUcsZUFBZSxFQUFFLFVBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsUUFBUSxDQUFDLCtDQUErQyxDQUFDO1NBQ3ZHLENBQUM7S0FDTCxDQUFDOzZEQUdEO0FBVUs7SUFSTCxJQUFBLG9CQUFPLEVBQUM7UUFDTCxJQUFJLEVBQUUsV0FBVztRQUNqQixLQUFLLEVBQUUsa0JBQWtCO1FBQ3pCLFdBQVcsRUFBRSx5Q0FBbUIsQ0FBQyxTQUFTO1FBQzFDLFdBQVcsRUFBRSxVQUFDLENBQUMsTUFBTSxDQUFDO1lBQ2xCLElBQUksRUFBRSxVQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLG1DQUFtQyxDQUFDO1NBQ2pFLENBQUM7S0FDTCxDQUFDO2tEQUdEIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgb2ssIGZhaWwgfSBmcm9tICcuLi9saWIvcmVzcG9uc2UnO1xuaW1wb3J0IHR5cGUgeyBUb29sRGVmaW5pdGlvbiwgVG9vbFJlc3BvbnNlLCBUb29sRXhlY3V0b3IgfSBmcm9tICcuLi90eXBlcyc7XG5pbXBvcnQgeyB6IH0gZnJvbSAnLi4vbGliL3NjaGVtYSc7XG5pbXBvcnQgeyBtY3BUb29sLCBkZWZpbmVUb29sc0Zyb21EZWNvcmF0b3JzIH0gZnJvbSAnLi4vbGliL2RlY29yYXRvcnMnO1xuaW1wb3J0IHsgQVNTRVRfQURWQU5DRURfRE9DUyB9IGZyb20gJy4uL2RhdGEvYXNzZXQtYWR2YW5jZWQtZG9jcyc7XG5cbmludGVyZmFjZSBUcmVlTm9kZSB7XG4gICAgbmFtZTogc3RyaW5nO1xuICAgIHVybDogc3RyaW5nO1xuICAgIHV1aWQ/OiBzdHJpbmc7XG4gICAgdHlwZT86IHN0cmluZztcbiAgICBpc0RpcmVjdG9yeTogYm9vbGVhbjtcbiAgICBjaGlsZHJlbjogVHJlZU5vZGVbXTtcbn1cblxuZXhwb3J0IGNsYXNzIEFzc2V0QWR2YW5jZWRUb29scyBpbXBsZW1lbnRzIFRvb2xFeGVjdXRvciB7XG4gICAgcHJpdmF0ZSByZWFkb25seSBleGVjOiBUb29sRXhlY3V0b3I7XG5cbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgdGhpcy5leGVjID0gZGVmaW5lVG9vbHNGcm9tRGVjb3JhdG9ycyh0aGlzKTtcbiAgICB9XG5cbiAgICBnZXRUb29scygpOiBUb29sRGVmaW5pdGlvbltdIHsgcmV0dXJuIHRoaXMuZXhlYy5nZXRUb29scygpOyB9XG4gICAgZXhlY3V0ZSh0b29sTmFtZTogc3RyaW5nLCBhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4geyByZXR1cm4gdGhpcy5leGVjLmV4ZWN1dGUodG9vbE5hbWUsIGFyZ3MpOyB9XG5cbiAgICBAbWNwVG9vbCh7XG4gICAgICAgIG5hbWU6ICdzYXZlX2Fzc2V0X21ldGEnLFxuICAgICAgICB0aXRsZTogJ1NhdmUgYXNzZXQgbWV0YScsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBBU1NFVF9BRFZBTkNFRF9ET0NTLnNhdmVfYXNzZXRfbWV0YSxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIHVybE9yVVVJRDogei5zdHJpbmcoKS5kZXNjcmliZSgnQXNzZXQgZGI6Ly8gVVJMIG9yIFVVSUQgd2hvc2UgLm1ldGEgY29udGVudCBzaG91bGQgYmUgc2F2ZWQuJyksXG4gICAgICAgICAgICBjb250ZW50OiB6LnN0cmluZygpLmRlc2NyaWJlKCdTZXJpYWxpemVkIGFzc2V0IG1ldGEgY29udGVudCBzdHJpbmcgdG8gd3JpdGUuJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgc2F2ZUFzc2V0TWV0YShhcmdzOiB7IHVybE9yVVVJRDogc3RyaW5nOyBjb250ZW50OiBzdHJpbmcgfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLnNhdmVBc3NldE1ldGFJbXBsKGFyZ3MudXJsT3JVVUlELCBhcmdzLmNvbnRlbnQpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ2dlbmVyYXRlX2F2YWlsYWJsZV91cmwnLFxuICAgICAgICB0aXRsZTogJ0dlbmVyYXRlIGFzc2V0IFVSTCcsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBBU1NFVF9BRFZBTkNFRF9ET0NTLmdlbmVyYXRlX2F2YWlsYWJsZV91cmwsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICB1cmw6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0Rlc2lyZWQgYXNzZXQgZGI6Ly8gVVJMIHRvIHRlc3QgZm9yIGNvbGxpc2lvbiBhbmQgYWRqdXN0IGlmIG5lZWRlZC4nKSxcbiAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBnZW5lcmF0ZUF2YWlsYWJsZVVybChhcmdzOiB7IHVybDogc3RyaW5nIH0pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZW5lcmF0ZUF2YWlsYWJsZVVybEltcGwoYXJncy51cmwpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ3F1ZXJ5X2Fzc2V0X2RiX3JlYWR5JyxcbiAgICAgICAgdGl0bGU6ICdDaGVjayBhc3NldC1kYiByZWFkaW5lc3MnLFxuICAgICAgICBkZXNjcmlwdGlvbjogQVNTRVRfQURWQU5DRURfRE9DUy5xdWVyeV9hc3NldF9kYl9yZWFkeSxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHt9KSxcbiAgICB9KVxuICAgIGFzeW5jIHF1ZXJ5QXNzZXREYlJlYWR5KCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLnF1ZXJ5QXNzZXREYlJlYWR5SW1wbCgpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ29wZW5fYXNzZXRfZXh0ZXJuYWwnLFxuICAgICAgICB0aXRsZTogJ09wZW4gYXNzZXQgZXh0ZXJuYWxseScsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBBU1NFVF9BRFZBTkNFRF9ET0NTLm9wZW5fYXNzZXRfZXh0ZXJuYWwsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICB1cmxPclVVSUQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0Fzc2V0IGRiOi8vIFVSTCBvciBVVUlEIHRvIG9wZW4gd2l0aCB0aGUgT1MvZWRpdG9yIGFzc29jaWF0ZWQgZXh0ZXJuYWwgcHJvZ3JhbS4nKSxcbiAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBvcGVuQXNzZXRFeHRlcm5hbChhcmdzOiB7IHVybE9yVVVJRDogc3RyaW5nIH0pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5vcGVuQXNzZXRFeHRlcm5hbEltcGwoYXJncy51cmxPclVVSUQpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ2JhdGNoX2ltcG9ydF9hc3NldHMnLFxuICAgICAgICB0aXRsZTogJ0ltcG9ydCBhc3NldHMgaW4gYmF0Y2gnLFxuICAgICAgICBkZXNjcmlwdGlvbjogQVNTRVRfQURWQU5DRURfRE9DUy5iYXRjaF9pbXBvcnRfYXNzZXRzLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgc291cmNlRGlyZWN0b3J5OiB6LnN0cmluZygpLmRlc2NyaWJlKCdBYnNvbHV0ZSBzb3VyY2UgZGlyZWN0b3J5IG9uIGRpc2sgdG8gc2NhbiBmb3IgaW1wb3J0IGZpbGVzLicpLFxuICAgICAgICAgICAgdGFyZ2V0RGlyZWN0b3J5OiB6LnN0cmluZygpLmRlc2NyaWJlKCdUYXJnZXQgYXNzZXQtZGIgZGlyZWN0b3J5IFVSTCwgZS5nLiBkYjovL2Fzc2V0cy90ZXh0dXJlcy4nKSxcbiAgICAgICAgICAgIGZpbGVGaWx0ZXI6IHouYXJyYXkoei5zdHJpbmcoKSkuZGVmYXVsdChbXSkuZGVzY3JpYmUoJ0FsbG93ZWQgZmlsZSBleHRlbnNpb25zLCBlLmcuIFtcIi5wbmdcIixcIi5qcGdcIl0uIEVtcHR5IG1lYW5zIGFsbCBmaWxlcy4nKSxcbiAgICAgICAgICAgIHJlY3Vyc2l2ZTogei5ib29sZWFuKCkuZGVmYXVsdChmYWxzZSkuZGVzY3JpYmUoJ0luY2x1ZGUgZmlsZXMgZnJvbSBzdWJkaXJlY3Rvcmllcy4nKSxcbiAgICAgICAgICAgIG92ZXJ3cml0ZTogei5ib29sZWFuKCkuZGVmYXVsdChmYWxzZSkuZGVzY3JpYmUoJ092ZXJ3cml0ZSBleGlzdGluZyB0YXJnZXQgYXNzZXRzIGluc3RlYWQgb2YgYXV0by1yZW5hbWluZy4nKSxcbiAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBiYXRjaEltcG9ydEFzc2V0cyhhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5iYXRjaEltcG9ydEFzc2V0c0ltcGwoYXJncyk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnYmF0Y2hfZGVsZXRlX2Fzc2V0cycsXG4gICAgICAgIHRpdGxlOiAnRGVsZXRlIGFzc2V0cyBpbiBiYXRjaCcsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBBU1NFVF9BRFZBTkNFRF9ET0NTLmJhdGNoX2RlbGV0ZV9hc3NldHMsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICB1cmxzOiB6LmFycmF5KHouc3RyaW5nKCkpLmRlc2NyaWJlKCdBc3NldCBkYjovLyBVUkxzIHRvIGRlbGV0ZS4gRWFjaCBVUkwgaXMgYXR0ZW1wdGVkIGluZGVwZW5kZW50bHkuJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgYmF0Y2hEZWxldGVBc3NldHMoYXJnczogeyB1cmxzOiBzdHJpbmdbXSB9KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuYmF0Y2hEZWxldGVBc3NldHNJbXBsKGFyZ3MudXJscyk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAndmFsaWRhdGVfYXNzZXRfcmVmZXJlbmNlcycsXG4gICAgICAgIHRpdGxlOiAnVmFsaWRhdGUgYXNzZXQgcmVmZXJlbmNlcycsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBBU1NFVF9BRFZBTkNFRF9ET0NTLnZhbGlkYXRlX2Fzc2V0X3JlZmVyZW5jZXMsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICBkaXJlY3Rvcnk6IHouc3RyaW5nKCkuZGVmYXVsdCgnZGI6Ly9hc3NldHMnKS5kZXNjcmliZSgnQXNzZXQtZGIgZGlyZWN0b3J5IHRvIHNjYW4uIERlZmF1bHQgZGI6Ly9hc3NldHMuJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgdmFsaWRhdGVBc3NldFJlZmVyZW5jZXMoYXJnczogeyBkaXJlY3Rvcnk/OiBzdHJpbmcgfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLnZhbGlkYXRlQXNzZXRSZWZlcmVuY2VzSW1wbChhcmdzLmRpcmVjdG9yeSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnZ2V0X3RyZWUnLFxuICAgICAgICB0aXRsZTogJ0dldCBhc3NldCB0cmVlJyxcbiAgICAgICAgZGVzY3JpcHRpb246IEFTU0VUX0FEVkFOQ0VEX0RPQ1MuZ2V0X3RyZWUsXG4gICAgICAgIGlucHV0U2NoZW1hOiB6Lm9iamVjdCh7XG4gICAgICAgICAgICBkaXJlY3Rvcnk6IHouc3RyaW5nKCkuZGVmYXVsdCgnZGI6Ly9hc3NldHMnKS5kZXNjcmliZSgnQXNzZXQtZGIgZGlyZWN0b3J5IHRvIHVzZSBhcyB0aGUgdHJlZSByb290LiBEZWZhdWx0IGRiOi8vYXNzZXRzLicpLFxuICAgICAgICAgICAgbWF4RGVwdGg6IHoubnVtYmVyKCkubWluKDApLm1heCgzMikuZGVmYXVsdCg4KS5kZXNjcmliZSgnTWF4aW11bSBkZXNjZW5kYW50IGRlcHRoIHRvIGluY2x1ZGUgYmVsb3cgdGhlIHJvb3QgZGlyZWN0b3J5LicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIGdldFRyZWUoYXJnczogeyBkaXJlY3Rvcnk/OiBzdHJpbmc7IG1heERlcHRoPzogbnVtYmVyIH0pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRUcmVlSW1wbChhcmdzLmRpcmVjdG9yeSwgYXJncy5tYXhEZXB0aCk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnZ2V0X2Fzc2V0X2RlcGVuZGVuY2llcycsXG4gICAgICAgIHRpdGxlOiAnUmVhZCBhc3NldCBkZXBlbmRlbmNpZXMnLFxuICAgICAgICBkZXNjcmlwdGlvbjogQVNTRVRfQURWQU5DRURfRE9DUy5nZXRfYXNzZXRfZGVwZW5kZW5jaWVzLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgdXJsT3JVVUlEOiB6LnN0cmluZygpLmRlc2NyaWJlKCdBc3NldCBVUkwgb3IgVVVJRCBmb3IgZGVwZW5kZW5jeSBhbmFseXNpcy4gQ3VycmVudCBpbXBsZW1lbnRhdGlvbiByZXBvcnRzIHVuc3VwcG9ydGVkLicpLFxuICAgICAgICAgICAgZGlyZWN0aW9uOiB6LmVudW0oWydkZXBlbmRlbnRzJywgJ2RlcGVuZGVuY2llcycsICdib3RoJ10pLmRlZmF1bHQoJ2RlcGVuZGVuY2llcycpLmRlc2NyaWJlKCdEZXBlbmRlbmN5IGRpcmVjdGlvbiByZXF1ZXN0ZWQuIEN1cnJlbnQgaW1wbGVtZW50YXRpb24gcmVwb3J0cyB1bnN1cHBvcnRlZC4nKSxcbiAgICAgICAgfSksXG4gICAgfSlcbiAgICBhc3luYyBnZXRBc3NldERlcGVuZGVuY2llcyhhcmdzOiB7IHVybE9yVVVJRDogc3RyaW5nOyBkaXJlY3Rpb24/OiBzdHJpbmcgfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldEFzc2V0RGVwZW5kZW5jaWVzSW1wbChhcmdzLnVybE9yVVVJRCwgYXJncy5kaXJlY3Rpb24pO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ2dldF91bnVzZWRfYXNzZXRzJyxcbiAgICAgICAgdGl0bGU6ICdGaW5kIHVudXNlZCBhc3NldHMnLFxuICAgICAgICBkZXNjcmlwdGlvbjogQVNTRVRfQURWQU5DRURfRE9DUy5nZXRfdW51c2VkX2Fzc2V0cyxcbiAgICAgICAgaW5wdXRTY2hlbWE6IHoub2JqZWN0KHtcbiAgICAgICAgICAgIGRpcmVjdG9yeTogei5zdHJpbmcoKS5kZWZhdWx0KCdkYjovL2Fzc2V0cycpLmRlc2NyaWJlKCdBc3NldC1kYiBkaXJlY3RvcnkgdG8gc2Nhbi4gRGVmYXVsdCBkYjovL2Fzc2V0cy4nKSxcbiAgICAgICAgICAgIGV4Y2x1ZGVEaXJlY3Rvcmllczogei5hcnJheSh6LnN0cmluZygpKS5kZWZhdWx0KFtdKS5kZXNjcmliZSgnRGlyZWN0b3JpZXMgdG8gZXhjbHVkZSBmcm9tIHVudXNlZC1hc3NldCByZXBvcnRpbmcuJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgZ2V0VW51c2VkQXNzZXRzKGFyZ3M6IHsgZGlyZWN0b3J5Pzogc3RyaW5nOyBleGNsdWRlRGlyZWN0b3JpZXM/OiBzdHJpbmdbXSB9KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0VW51c2VkQXNzZXRzSW1wbChhcmdzLmRpcmVjdG9yeSwgYXJncy5leGNsdWRlRGlyZWN0b3JpZXMpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ2NvbXByZXNzX3RleHR1cmVzJyxcbiAgICAgICAgdGl0bGU6ICdDb21wcmVzcyB0ZXh0dXJlcycsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBBU1NFVF9BRFZBTkNFRF9ET0NTLmNvbXByZXNzX3RleHR1cmVzLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgZGlyZWN0b3J5OiB6LnN0cmluZygpLmRlZmF1bHQoJ2RiOi8vYXNzZXRzJykuZGVzY3JpYmUoJ1RleHR1cmUgZGlyZWN0b3J5IHJlcXVlc3RlZCBmb3IgY29tcHJlc3Npb24uIEN1cnJlbnQgaW1wbGVtZW50YXRpb24gcmVwb3J0cyB1bnN1cHBvcnRlZC4nKSxcbiAgICAgICAgICAgIGZvcm1hdDogei5lbnVtKFsnYXV0bycsICdqcGcnLCAncG5nJywgJ3dlYnAnXSkuZGVmYXVsdCgnYXV0bycpLmRlc2NyaWJlKCdSZXF1ZXN0ZWQgb3V0cHV0IGZvcm1hdC4gQ3VycmVudCBpbXBsZW1lbnRhdGlvbiByZXBvcnRzIHVuc3VwcG9ydGVkLicpLFxuICAgICAgICAgICAgcXVhbGl0eTogei5udW1iZXIoKS5taW4oMC4xKS5tYXgoMS4wKS5kZWZhdWx0KDAuOCkuZGVzY3JpYmUoJ1JlcXVlc3RlZCBjb21wcmVzc2lvbiBxdWFsaXR5IGZyb20gMC4xIHRvIDEuMC4gQ3VycmVudCBpbXBsZW1lbnRhdGlvbiByZXBvcnRzIHVuc3VwcG9ydGVkLicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIGNvbXByZXNzVGV4dHVyZXMoYXJnczogeyBkaXJlY3Rvcnk/OiBzdHJpbmc7IGZvcm1hdD86IHN0cmluZzsgcXVhbGl0eT86IG51bWJlciB9KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY29tcHJlc3NUZXh0dXJlc0ltcGwoYXJncy5kaXJlY3RvcnksIGFyZ3MuZm9ybWF0LCBhcmdzLnF1YWxpdHkpO1xuICAgIH1cblxuICAgIEBtY3BUb29sKHtcbiAgICAgICAgbmFtZTogJ2V4cG9ydF9hc3NldF9tYW5pZmVzdCcsXG4gICAgICAgIHRpdGxlOiAnRXhwb3J0IGFzc2V0IG1hbmlmZXN0JyxcbiAgICAgICAgZGVzY3JpcHRpb246IEFTU0VUX0FEVkFOQ0VEX0RPQ1MuZXhwb3J0X2Fzc2V0X21hbmlmZXN0LFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgZGlyZWN0b3J5OiB6LnN0cmluZygpLmRlZmF1bHQoJ2RiOi8vYXNzZXRzJykuZGVzY3JpYmUoJ0Fzc2V0LWRiIGRpcmVjdG9yeSB0byBpbmNsdWRlIGluIHRoZSBtYW5pZmVzdC4gRGVmYXVsdCBkYjovL2Fzc2V0cy4nKSxcbiAgICAgICAgICAgIGZvcm1hdDogei5lbnVtKFsnanNvbicsICdjc3YnLCAneG1sJ10pLmRlZmF1bHQoJ2pzb24nKS5kZXNjcmliZSgnUmV0dXJuZWQgbWFuaWZlc3Qgc2VyaWFsaXphdGlvbiBmb3JtYXQuJyksXG4gICAgICAgICAgICBpbmNsdWRlTWV0YWRhdGE6IHouYm9vbGVhbigpLmRlZmF1bHQodHJ1ZSkuZGVzY3JpYmUoJ1RyeSB0byBpbmNsdWRlIGFzc2V0IG1ldGFkYXRhIHdoZW4gYXZhaWxhYmxlLicpLFxuICAgICAgICB9KSxcbiAgICB9KVxuICAgIGFzeW5jIGV4cG9ydEFzc2V0TWFuaWZlc3QoYXJnczogeyBkaXJlY3Rvcnk/OiBzdHJpbmc7IGZvcm1hdD86IHN0cmluZzsgaW5jbHVkZU1ldGFkYXRhPzogYm9vbGVhbiB9KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZXhwb3J0QXNzZXRNYW5pZmVzdEltcGwoYXJncy5kaXJlY3RvcnksIGFyZ3MuZm9ybWF0LCBhcmdzLmluY2x1ZGVNZXRhZGF0YSk7XG4gICAgfVxuXG4gICAgQG1jcFRvb2woe1xuICAgICAgICBuYW1lOiAnZ2V0X3VzZXJzJyxcbiAgICAgICAgdGl0bGU6ICdGaW5kIGFzc2V0IHVzZXJzJyxcbiAgICAgICAgZGVzY3JpcHRpb246IEFTU0VUX0FEVkFOQ0VEX0RPQ1MuZ2V0X3VzZXJzLFxuICAgICAgICBpbnB1dFNjaGVtYTogei5vYmplY3Qoe1xuICAgICAgICAgICAgdXVpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnQXNzZXQgVVVJRCB0byBmaW5kIHJlZmVyZW5jZXMgdG8uJyksXG4gICAgICAgIH0pLFxuICAgIH0pXG4gICAgYXN5bmMgZ2V0VXNlcnMoYXJnczogeyB1dWlkOiBzdHJpbmcgfSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldFVzZXJzSW1wbChhcmdzLnV1aWQpO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgc2F2ZUFzc2V0TWV0YUltcGwodXJsT3JVVUlEOiBzdHJpbmcsIGNvbnRlbnQ6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAnc2F2ZS1hc3NldC1tZXRhJywgdXJsT3JVVUlELCBjb250ZW50KS50aGVuKChyZXN1bHQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2soe1xuICAgICAgICAgICAgICAgICAgICAgICAgdXVpZDogcmVzdWx0Py51dWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgdXJsOiByZXN1bHQ/LnVybCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdBc3NldCBtZXRhIHNhdmVkIHN1Y2Nlc3NmdWxseSdcbiAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdlbmVyYXRlQXZhaWxhYmxlVXJsSW1wbCh1cmw6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAnZ2VuZXJhdGUtYXZhaWxhYmxlLXVybCcsIHVybCkudGhlbigoYXZhaWxhYmxlVXJsOiBzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG9yaWdpbmFsVXJsOiB1cmwsXG4gICAgICAgICAgICAgICAgICAgICAgICBhdmFpbGFibGVVcmw6IGF2YWlsYWJsZVVybCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGF2YWlsYWJsZVVybCA9PT0gdXJsID8gXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgJ1VSTCBpcyBhdmFpbGFibGUnIDogXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgJ0dlbmVyYXRlZCBuZXcgYXZhaWxhYmxlIFVSTCdcbiAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgfSkuY2F0Y2goKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhaWwoZXJyLm1lc3NhZ2UpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHF1ZXJ5QXNzZXREYlJlYWR5SW1wbCgpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LXJlYWR5JykudGhlbigocmVhZHk6IGJvb2xlYW4pID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG9rKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlYWR5OiByZWFkeSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IHJlYWR5ID8gJ0Fzc2V0IGRhdGFiYXNlIGlzIHJlYWR5JyA6ICdBc3NldCBkYXRhYmFzZSBpcyBub3QgcmVhZHknXG4gICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBvcGVuQXNzZXRFeHRlcm5hbEltcGwodXJsT3JVVUlEOiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ29wZW4tYXNzZXQnLCB1cmxPclVVSUQpLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUob2sodW5kZWZpbmVkLCAnQXNzZXQgb3BlbmVkIHdpdGggZXh0ZXJuYWwgcHJvZ3JhbScpKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWlsKGVyci5tZXNzYWdlKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBiYXRjaEltcG9ydEFzc2V0c0ltcGwoYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgZnMgPSByZXF1aXJlKCdmcycpO1xuICAgICAgICBjb25zdCBwYXRoID0gcmVxdWlyZSgncGF0aCcpO1xuICAgICAgICBcbiAgICAgICAgaWYgKCFmcy5leGlzdHNTeW5jKGFyZ3Muc291cmNlRGlyZWN0b3J5KSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhaWwoJ1NvdXJjZSBkaXJlY3RvcnkgZG9lcyBub3QgZXhpc3QnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGZpbGVzID0gdGhpcy5nZXRGaWxlc0Zyb21EaXJlY3RvcnkoXG4gICAgICAgICAgICBhcmdzLnNvdXJjZURpcmVjdG9yeSwgXG4gICAgICAgICAgICBhcmdzLmZpbGVGaWx0ZXIgfHwgW10sIFxuICAgICAgICAgICAgYXJncy5yZWN1cnNpdmUgfHwgZmFsc2VcbiAgICAgICAgKTtcblxuICAgICAgICBjb25zdCBpbXBvcnRSZXN1bHRzOiBhbnlbXSA9IFtdO1xuICAgICAgICBsZXQgc3VjY2Vzc0NvdW50ID0gMDtcbiAgICAgICAgbGV0IGVycm9yQ291bnQgPSAwO1xuXG4gICAgICAgIGZvciAoY29uc3QgZmlsZVBhdGggb2YgZmlsZXMpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZmlsZU5hbWUgPSBwYXRoLmJhc2VuYW1lKGZpbGVQYXRoKTtcbiAgICAgICAgICAgICAgICBjb25zdCB0YXJnZXRQYXRoID0gYCR7YXJncy50YXJnZXREaXJlY3Rvcnl9LyR7ZmlsZU5hbWV9YDtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdpbXBvcnQtYXNzZXQnLCBcbiAgICAgICAgICAgICAgICAgICAgZmlsZVBhdGgsIHRhcmdldFBhdGgsIHsgXG4gICAgICAgICAgICAgICAgICAgICAgICBvdmVyd3JpdGU6IGFyZ3Mub3ZlcndyaXRlIHx8IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgcmVuYW1lOiAhKGFyZ3Mub3ZlcndyaXRlIHx8IGZhbHNlKVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpbXBvcnRSZXN1bHRzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICBzb3VyY2U6IGZpbGVQYXRoLFxuICAgICAgICAgICAgICAgICAgICB0YXJnZXQ6IHRhcmdldFBhdGgsXG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIHV1aWQ6IHJlc3VsdD8udXVpZFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3NDb3VudCsrO1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgICAgICBpbXBvcnRSZXN1bHRzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICBzb3VyY2U6IGZpbGVQYXRoLFxuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGVyci5tZXNzYWdlXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgZXJyb3JDb3VudCsrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG9rKHtcbiAgICAgICAgICAgICAgICB0b3RhbEZpbGVzOiBmaWxlcy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgc3VjY2Vzc0NvdW50OiBzdWNjZXNzQ291bnQsXG4gICAgICAgICAgICAgICAgZXJyb3JDb3VudDogZXJyb3JDb3VudCxcbiAgICAgICAgICAgICAgICByZXN1bHRzOiBpbXBvcnRSZXN1bHRzLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBCYXRjaCBpbXBvcnQgY29tcGxldGVkOiAke3N1Y2Nlc3NDb3VudH0gc3VjY2VzcywgJHtlcnJvckNvdW50fSBlcnJvcnNgXG4gICAgICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGdldEZpbGVzRnJvbURpcmVjdG9yeShkaXJQYXRoOiBzdHJpbmcsIGZpbGVGaWx0ZXI6IHN0cmluZ1tdLCByZWN1cnNpdmU6IGJvb2xlYW4pOiBzdHJpbmdbXSB7XG4gICAgICAgIGNvbnN0IGZzID0gcmVxdWlyZSgnZnMnKTtcbiAgICAgICAgY29uc3QgcGF0aCA9IHJlcXVpcmUoJ3BhdGgnKTtcbiAgICAgICAgY29uc3QgZmlsZXM6IHN0cmluZ1tdID0gW107XG5cbiAgICAgICAgY29uc3QgaXRlbXMgPSBmcy5yZWFkZGlyU3luYyhkaXJQYXRoKTtcbiAgICAgICAgXG4gICAgICAgIGZvciAoY29uc3QgaXRlbSBvZiBpdGVtcykge1xuICAgICAgICAgICAgY29uc3QgZnVsbFBhdGggPSBwYXRoLmpvaW4oZGlyUGF0aCwgaXRlbSk7XG4gICAgICAgICAgICBjb25zdCBzdGF0ID0gZnMuc3RhdFN5bmMoZnVsbFBhdGgpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZiAoc3RhdC5pc0ZpbGUoKSkge1xuICAgICAgICAgICAgICAgIGlmIChmaWxlRmlsdGVyLmxlbmd0aCA9PT0gMCB8fCBmaWxlRmlsdGVyLnNvbWUoZXh0ID0+IGl0ZW0udG9Mb3dlckNhc2UoKS5lbmRzV2l0aChleHQudG9Mb3dlckNhc2UoKSkpKSB7XG4gICAgICAgICAgICAgICAgICAgIGZpbGVzLnB1c2goZnVsbFBhdGgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSBpZiAoc3RhdC5pc0RpcmVjdG9yeSgpICYmIHJlY3Vyc2l2ZSkge1xuICAgICAgICAgICAgICAgIGZpbGVzLnB1c2goLi4udGhpcy5nZXRGaWxlc0Zyb21EaXJlY3RvcnkoZnVsbFBhdGgsIGZpbGVGaWx0ZXIsIHJlY3Vyc2l2ZSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICByZXR1cm4gZmlsZXM7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBiYXRjaERlbGV0ZUFzc2V0c0ltcGwodXJsczogc3RyaW5nW10pOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBkZWxldGVSZXN1bHRzOiBhbnlbXSA9IFtdO1xuICAgICAgICBsZXQgc3VjY2Vzc0NvdW50ID0gMDtcbiAgICAgICAgbGV0IGVycm9yQ291bnQgPSAwO1xuXG4gICAgICAgIGZvciAoY29uc3QgdXJsIG9mIHVybHMpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAnZGVsZXRlLWFzc2V0JywgdXJsKTtcbiAgICAgICAgICAgICAgICBkZWxldGVSZXN1bHRzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICB1cmw6IHVybCxcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3NDb3VudCsrO1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgICAgICBkZWxldGVSZXN1bHRzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICB1cmw6IHVybCxcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIGVycm9yOiBlcnIubWVzc2FnZVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGVycm9yQ291bnQrKztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBvayh7XG4gICAgICAgICAgICAgICAgdG90YWxBc3NldHM6IHVybHMubGVuZ3RoLFxuICAgICAgICAgICAgICAgIHN1Y2Nlc3NDb3VudDogc3VjY2Vzc0NvdW50LFxuICAgICAgICAgICAgICAgIGVycm9yQ291bnQ6IGVycm9yQ291bnQsXG4gICAgICAgICAgICAgICAgcmVzdWx0czogZGVsZXRlUmVzdWx0cyxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiBgQmF0Y2ggZGVsZXRlIGNvbXBsZXRlZDogJHtzdWNjZXNzQ291bnR9IHN1Y2Nlc3MsICR7ZXJyb3JDb3VudH0gZXJyb3JzYFxuICAgICAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyB2YWxpZGF0ZUFzc2V0UmVmZXJlbmNlc0ltcGwoZGlyZWN0b3J5OiBzdHJpbmcgPSAnZGI6Ly9hc3NldHMnKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgLy8gR2V0IGFsbCBhc3NldHMgaW4gZGlyZWN0b3J5XG4gICAgICAgIGNvbnN0IGFzc2V0cyA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0cycsIHsgcGF0dGVybjogYCR7ZGlyZWN0b3J5fS8qKi8qYCB9KTtcbiAgICAgICAgXG4gICAgICAgIGNvbnN0IGJyb2tlblJlZmVyZW5jZXM6IGFueVtdID0gW107XG4gICAgICAgIGNvbnN0IHZhbGlkUmVmZXJlbmNlczogYW55W10gPSBbXTtcblxuICAgICAgICBmb3IgKGNvbnN0IGFzc2V0IG9mIGFzc2V0cykge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCBhc3NldEluZm8gPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldC1pbmZvJywgYXNzZXQudXJsKTtcbiAgICAgICAgICAgICAgICBpZiAoYXNzZXRJbmZvKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhbGlkUmVmZXJlbmNlcy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHVybDogYXNzZXQudXJsLFxuICAgICAgICAgICAgICAgICAgICAgICAgdXVpZDogYXNzZXQudXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG5hbWU6IGFzc2V0Lm5hbWVcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICAgICAgYnJva2VuUmVmZXJlbmNlcy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgdXJsOiBhc3NldC51cmwsXG4gICAgICAgICAgICAgICAgICAgIHV1aWQ6IGFzc2V0LnV1aWQsXG4gICAgICAgICAgICAgICAgICAgIG5hbWU6IGFzc2V0Lm5hbWUsXG4gICAgICAgICAgICAgICAgICAgIGVycm9yOiAoZXJyIGFzIEVycm9yKS5tZXNzYWdlXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gb2soe1xuICAgICAgICAgICAgICAgIGRpcmVjdG9yeTogZGlyZWN0b3J5LFxuICAgICAgICAgICAgICAgIHRvdGFsQXNzZXRzOiBhc3NldHMubGVuZ3RoLFxuICAgICAgICAgICAgICAgIHZhbGlkUmVmZXJlbmNlczogdmFsaWRSZWZlcmVuY2VzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICBicm9rZW5SZWZlcmVuY2VzOiBicm9rZW5SZWZlcmVuY2VzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICBicm9rZW5Bc3NldHM6IGJyb2tlblJlZmVyZW5jZXMsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogYFZhbGlkYXRpb24gY29tcGxldGVkOiAke2Jyb2tlblJlZmVyZW5jZXMubGVuZ3RofSBicm9rZW4gcmVmZXJlbmNlcyBmb3VuZGBcbiAgICAgICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2V0VHJlZUltcGwoZGlyZWN0b3J5OiBzdHJpbmcgPSAnZGI6Ly9hc3NldHMnLCBtYXhEZXB0aDogbnVtYmVyID0gOCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHJvb3RVcmwgPSBkaXJlY3RvcnkucmVwbGFjZSgvXFwvKyQvLCAnJyk7XG4gICAgICAgIGNvbnN0IGJvdW5kZWREZXB0aCA9IE1hdGgubWF4KDAsIE1hdGgubWluKDMyLCBNYXRoLmZsb29yKG1heERlcHRoKSkpO1xuICAgICAgICBjb25zdCBhc3NldHMgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldHMnLCB7IHBhdHRlcm46IGAke3Jvb3RVcmx9LyoqLypgIH0pO1xuICAgICAgICBjb25zdCByb290TmFtZSA9IHJvb3RVcmwuc3BsaXQoJy8nKS5maWx0ZXIoQm9vbGVhbikucG9wKCkgPz8gcm9vdFVybDtcbiAgICAgICAgY29uc3Qgcm9vdDogVHJlZU5vZGUgPSB7XG4gICAgICAgICAgICBuYW1lOiByb290TmFtZSxcbiAgICAgICAgICAgIHVybDogcm9vdFVybCxcbiAgICAgICAgICAgIGlzRGlyZWN0b3J5OiB0cnVlLFxuICAgICAgICAgICAgY2hpbGRyZW46IFtdLFxuICAgICAgICB9O1xuICAgICAgICBjb25zdCBkaXJlY3RvcmllcyA9IG5ldyBNYXA8c3RyaW5nLCBUcmVlTm9kZT4oW1tyb290VXJsLCByb290XV0pO1xuXG4gICAgICAgIGNvbnN0IGVuc3VyZURpcmVjdG9yeSA9ICh1cmw6IHN0cmluZyk6IFRyZWVOb2RlID0+IHtcbiAgICAgICAgICAgIGNvbnN0IG5vcm1hbGl6ZWQgPSB1cmwucmVwbGFjZSgvXFwvKyQvLCAnJyk7XG4gICAgICAgICAgICBjb25zdCBleGlzdGluZyA9IGRpcmVjdG9yaWVzLmdldChub3JtYWxpemVkKTtcbiAgICAgICAgICAgIGlmIChleGlzdGluZykgcmV0dXJuIGV4aXN0aW5nO1xuICAgICAgICAgICAgY29uc3QgcGFyZW50VXJsID0gbm9ybWFsaXplZC5zbGljZSgwLCBub3JtYWxpemVkLmxhc3RJbmRleE9mKCcvJykpO1xuICAgICAgICAgICAgY29uc3QgcGFyZW50ID0gcGFyZW50VXJsLnN0YXJ0c1dpdGgocm9vdFVybCkgPyBlbnN1cmVEaXJlY3RvcnkocGFyZW50VXJsKSA6IHJvb3Q7XG4gICAgICAgICAgICBjb25zdCBub2RlOiBUcmVlTm9kZSA9IHtcbiAgICAgICAgICAgICAgICBuYW1lOiBub3JtYWxpemVkLnNwbGl0KCcvJykucG9wKCkgPz8gbm9ybWFsaXplZCxcbiAgICAgICAgICAgICAgICB1cmw6IG5vcm1hbGl6ZWQsXG4gICAgICAgICAgICAgICAgaXNEaXJlY3Rvcnk6IHRydWUsXG4gICAgICAgICAgICAgICAgY2hpbGRyZW46IFtdLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGRpcmVjdG9yaWVzLnNldChub3JtYWxpemVkLCBub2RlKTtcbiAgICAgICAgICAgIHBhcmVudC5jaGlsZHJlbi5wdXNoKG5vZGUpO1xuICAgICAgICAgICAgcmV0dXJuIG5vZGU7XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3QgZGVwdGhPZiA9ICh1cmw6IHN0cmluZyk6IG51bWJlciA9PiB7XG4gICAgICAgICAgICBjb25zdCByZWwgPSB1cmwuc2xpY2Uocm9vdFVybC5sZW5ndGgpLnJlcGxhY2UoL15cXC8rLywgJycpO1xuICAgICAgICAgICAgaWYgKCFyZWwpIHJldHVybiAwO1xuICAgICAgICAgICAgcmV0dXJuIHJlbC5zcGxpdCgnLycpLmZpbHRlcihCb29sZWFuKS5sZW5ndGg7XG4gICAgICAgIH07XG5cbiAgICAgICAgZm9yIChjb25zdCBhc3NldCBvZiBhc3NldHMpIHtcbiAgICAgICAgICAgIGNvbnN0IHVybCA9IFN0cmluZyhhc3NldC51cmwgPz8gJycpLnJlcGxhY2UoL1xcLyskLywgJycpO1xuICAgICAgICAgICAgaWYgKCF1cmwuc3RhcnRzV2l0aChgJHtyb290VXJsfS9gKSB8fCBkZXB0aE9mKHVybCkgPiBib3VuZGVkRGVwdGgpIGNvbnRpbnVlO1xuICAgICAgICAgICAgY29uc3QgcGFyZW50VXJsID0gdXJsLnNsaWNlKDAsIHVybC5sYXN0SW5kZXhPZignLycpKTtcbiAgICAgICAgICAgIGNvbnN0IHBhcmVudCA9IHBhcmVudFVybC5zdGFydHNXaXRoKHJvb3RVcmwpID8gZW5zdXJlRGlyZWN0b3J5KHBhcmVudFVybCkgOiByb290O1xuXG4gICAgICAgICAgICBpZiAoYXNzZXQuaXNEaXJlY3RvcnkpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBkaXIgPSBlbnN1cmVEaXJlY3RvcnkodXJsKTtcbiAgICAgICAgICAgICAgICBkaXIudXVpZCA9IGFzc2V0LnV1aWQ7XG4gICAgICAgICAgICAgICAgZGlyLnR5cGUgPSBhc3NldC50eXBlO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBwYXJlbnQuY2hpbGRyZW4ucHVzaCh7XG4gICAgICAgICAgICAgICAgbmFtZTogYXNzZXQubmFtZSA/PyB1cmwuc3BsaXQoJy8nKS5wb3AoKSA/PyB1cmwsXG4gICAgICAgICAgICAgICAgdXJsLFxuICAgICAgICAgICAgICAgIHV1aWQ6IGFzc2V0LnV1aWQsXG4gICAgICAgICAgICAgICAgdHlwZTogYXNzZXQudHlwZSxcbiAgICAgICAgICAgICAgICBpc0RpcmVjdG9yeTogZmFsc2UsXG4gICAgICAgICAgICAgICAgY2hpbGRyZW46IFtdLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBzb3J0VHJlZSA9IChub2RlOiBUcmVlTm9kZSk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgbm9kZS5jaGlsZHJlbi5zb3J0KChhLCBiKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGEuaXNEaXJlY3RvcnkgIT09IGIuaXNEaXJlY3RvcnkpIHJldHVybiBhLmlzRGlyZWN0b3J5ID8gLTEgOiAxO1xuICAgICAgICAgICAgICAgIHJldHVybiBhLm5hbWUubG9jYWxlQ29tcGFyZShiLm5hbWUpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBub2RlLmNoaWxkcmVuLmZvckVhY2goc29ydFRyZWUpO1xuICAgICAgICB9O1xuICAgICAgICBzb3J0VHJlZShyb290KTtcblxuICAgICAgICByZXR1cm4gb2soe1xuICAgICAgICAgICAgICAgIGRpcmVjdG9yeTogcm9vdFVybCxcbiAgICAgICAgICAgICAgICBtYXhEZXB0aDogYm91bmRlZERlcHRoLFxuICAgICAgICAgICAgICAgIGFzc2V0Q291bnQ6IGFzc2V0cy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgdHJlZTogcm9vdCxcbiAgICAgICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2V0QXNzZXREZXBlbmRlbmNpZXNJbXBsKHVybE9yVVVJRDogc3RyaW5nLCBkaXJlY3Rpb246IHN0cmluZyA9ICdkZXBlbmRlbmNpZXMnKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICAvLyBOb3RlOiBUaGlzIHdvdWxkIHJlcXVpcmUgc2NlbmUgYW5hbHlzaXMgb3IgYWRkaXRpb25hbCBBUElzIG5vdCBhdmFpbGFibGUgaW4gY3VycmVudCBkb2N1bWVudGF0aW9uXG4gICAgICAgICAgICByZXNvbHZlKGZhaWwoJ0Fzc2V0IGRlcGVuZGVuY3kgYW5hbHlzaXMgcmVxdWlyZXMgYWRkaXRpb25hbCBBUElzIG5vdCBhdmFpbGFibGUgaW4gY3VycmVudCBDb2NvcyBDcmVhdG9yIE1DUCBpbXBsZW1lbnRhdGlvbi4gQ29uc2lkZXIgdXNpbmcgdGhlIEVkaXRvciBVSSBmb3IgZGVwZW5kZW5jeSBhbmFseXNpcy4nKSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2V0VW51c2VkQXNzZXRzSW1wbChkaXJlY3Rvcnk6IHN0cmluZyA9ICdkYjovL2Fzc2V0cycsIGV4Y2x1ZGVEaXJlY3Rvcmllczogc3RyaW5nW10gPSBbXSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHJvb3RVcmwgPSBkaXJlY3RvcnkucmVwbGFjZSgvXFwvKyQvLCAnJyk7XG4gICAgICAgIGNvbnN0IGV4Y2x1ZGVzID0gZXhjbHVkZURpcmVjdG9yaWVzLm1hcChkaXIgPT4gZGlyLnJlcGxhY2UoL1xcLyskLywgJycpKTtcbiAgICAgICAgY29uc3QgYWxsQXNzZXRzID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXRzJywgeyBwYXR0ZXJuOiBgJHtyb290VXJsfS8qKi8qYCB9KTtcbiAgICAgICAgY29uc3Qgc2NlbmVzID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXRzJywgeyBwYXR0ZXJuOiAnZGI6Ly9hc3NldHMvKionLCBjY1R5cGU6ICdjYy5TY2VuZUFzc2V0JyB9KTtcbiAgICAgICAgY29uc3QgcHJlZmFicyA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0cycsIHsgcGF0dGVybjogJ2RiOi8vYXNzZXRzLyoqJywgY2NUeXBlOiAnY2MuUHJlZmFiJyB9KTtcbiAgICAgICAgY29uc3Qgcm9vdHMgPSBBcnJheS5mcm9tKG5ldyBNYXAoWy4uLnNjZW5lcywgLi4ucHJlZmFic10ubWFwKChhc3NldDogYW55KSA9PiBbYXNzZXQudXVpZCwgYXNzZXRdKSkudmFsdWVzKCkpO1xuICAgICAgICBjb25zdCByZWZlcmVuY2VkVXVpZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgICAgICAgY29uc3QgZGVwZW5kZW5jeUVycm9yczogYW55W10gPSBbXTtcblxuICAgICAgICBjb25zdCBhZGREZXBlbmRlbmN5ID0gKGRlcDogYW55KTogdm9pZCA9PiB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIGRlcCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICByZWZlcmVuY2VkVXVpZHMuYWRkKGRlcCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGRlcD8udXVpZCAmJiB0eXBlb2YgZGVwLnV1aWQgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgcmVmZXJlbmNlZFV1aWRzLmFkZChkZXAudXVpZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgZm9yIChjb25zdCBhc3NldCBvZiByb290cykge1xuICAgICAgICAgICAgcmVmZXJlbmNlZFV1aWRzLmFkZChhc3NldC51dWlkKTtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZGVwcyA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0LWRlcGVuZHMnLCBhc3NldC51dWlkKTtcbiAgICAgICAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShkZXBzKSkge1xuICAgICAgICAgICAgICAgICAgICBkZXBzLmZvckVhY2goYWRkRGVwZW5kZW5jeSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgICAgICBkZXBlbmRlbmN5RXJyb3JzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICB1dWlkOiBhc3NldC51dWlkLFxuICAgICAgICAgICAgICAgICAgICB1cmw6IGFzc2V0LnVybCxcbiAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKSxcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGlzRXhjbHVkZWQgPSAodXJsOiBzdHJpbmcpOiBib29sZWFuID0+IGV4Y2x1ZGVzLnNvbWUoZGlyID0+IHVybCA9PT0gZGlyIHx8IHVybC5zdGFydHNXaXRoKGAke2Rpcn0vYCkpO1xuICAgICAgICBjb25zdCBjYW5kaWRhdGVzID0gYWxsQXNzZXRzLmZpbHRlcigoYXNzZXQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgdXJsID0gU3RyaW5nKGFzc2V0LnVybCA/PyAnJyk7XG4gICAgICAgICAgICBpZiAoIXVybC5zdGFydHNXaXRoKGAke3Jvb3RVcmx9L2ApKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICBpZiAoYXNzZXQuaXNEaXJlY3RvcnkpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIGlmICghYXNzZXQudXVpZCkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgaWYgKGlzRXhjbHVkZWQodXJsKSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgcmV0dXJuICFyZWZlcmVuY2VkVXVpZHMuaGFzKGFzc2V0LnV1aWQpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gb2soe1xuICAgICAgICAgICAgICAgIGRpcmVjdG9yeTogcm9vdFVybCxcbiAgICAgICAgICAgICAgICBleGNsdWRlRGlyZWN0b3JpZXM6IGV4Y2x1ZGVzLFxuICAgICAgICAgICAgICAgIHNjYW5uZWRSb290czogcm9vdHMubWFwKChhc3NldDogYW55KSA9PiAoe1xuICAgICAgICAgICAgICAgICAgICB1dWlkOiBhc3NldC51dWlkLFxuICAgICAgICAgICAgICAgICAgICB1cmw6IGFzc2V0LnVybCxcbiAgICAgICAgICAgICAgICAgICAgbmFtZTogYXNzZXQubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogYXNzZXQudHlwZSxcbiAgICAgICAgICAgICAgICB9KSksXG4gICAgICAgICAgICAgICAgcmVmZXJlbmNlZENvdW50OiByZWZlcmVuY2VkVXVpZHMuc2l6ZSxcbiAgICAgICAgICAgICAgICB0b3RhbEFzc2V0czogYWxsQXNzZXRzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICB1bnVzZWRDb3VudDogY2FuZGlkYXRlcy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgdW51c2VkQXNzZXRzOiBjYW5kaWRhdGVzLm1hcCgoYXNzZXQ6IGFueSkgPT4gKHtcbiAgICAgICAgICAgICAgICAgICAgdXVpZDogYXNzZXQudXVpZCxcbiAgICAgICAgICAgICAgICAgICAgdXJsOiBhc3NldC51cmwsXG4gICAgICAgICAgICAgICAgICAgIG5hbWU6IGFzc2V0Lm5hbWUsXG4gICAgICAgICAgICAgICAgICAgIHR5cGU6IGFzc2V0LnR5cGUsXG4gICAgICAgICAgICAgICAgfSkpLFxuICAgICAgICAgICAgICAgIGRlcGVuZGVuY3lFcnJvcnMsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogYFVudXNlZCBhc3NldCBzY2FuIGNvbXBsZXRlZDogJHtjYW5kaWRhdGVzLmxlbmd0aH0gdW5yZWZlcmVuY2VkIGFzc2V0cyBmb3VuZGAsXG4gICAgICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGNvbXByZXNzVGV4dHVyZXNJbXBsKGRpcmVjdG9yeTogc3RyaW5nID0gJ2RiOi8vYXNzZXRzJywgZm9ybWF0OiBzdHJpbmcgPSAnYXV0bycsIHF1YWxpdHk6IG51bWJlciA9IDAuOCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgLy8gTm90ZTogVGV4dHVyZSBjb21wcmVzc2lvbiB3b3VsZCByZXF1aXJlIGltYWdlIHByb2Nlc3NpbmcgQVBJc1xuICAgICAgICAgICAgcmVzb2x2ZShmYWlsKCdUZXh0dXJlIGNvbXByZXNzaW9uIHJlcXVpcmVzIGltYWdlIHByb2Nlc3NpbmcgY2FwYWJpbGl0aWVzIG5vdCBhdmFpbGFibGUgaW4gY3VycmVudCBDb2NvcyBDcmVhdG9yIE1DUCBpbXBsZW1lbnRhdGlvbi4gVXNlIHRoZSBFZGl0b3JcXCdzIGJ1aWx0LWluIHRleHR1cmUgY29tcHJlc3Npb24gc2V0dGluZ3Mgb3IgZXh0ZXJuYWwgdG9vbHMuJykpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGV4cG9ydEFzc2V0TWFuaWZlc3RJbXBsKGRpcmVjdG9yeTogc3RyaW5nID0gJ2RiOi8vYXNzZXRzJywgZm9ybWF0OiBzdHJpbmcgPSAnanNvbicsIGluY2x1ZGVNZXRhZGF0YTogYm9vbGVhbiA9IHRydWUpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBhc3NldHMgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldHMnLCB7IHBhdHRlcm46IGAke2RpcmVjdG9yeX0vKiovKmAgfSk7XG4gICAgICAgIFxuICAgICAgICBjb25zdCBtYW5pZmVzdDogYW55W10gPSBbXTtcblxuICAgICAgICBmb3IgKGNvbnN0IGFzc2V0IG9mIGFzc2V0cykge1xuICAgICAgICAgICAgY29uc3QgbWFuaWZlc3RFbnRyeTogYW55ID0ge1xuICAgICAgICAgICAgICAgIG5hbWU6IGFzc2V0Lm5hbWUsXG4gICAgICAgICAgICAgICAgdXJsOiBhc3NldC51cmwsXG4gICAgICAgICAgICAgICAgdXVpZDogYXNzZXQudXVpZCxcbiAgICAgICAgICAgICAgICB0eXBlOiBhc3NldC50eXBlLFxuICAgICAgICAgICAgICAgIHNpemU6IChhc3NldCBhcyBhbnkpLnNpemUgfHwgMCxcbiAgICAgICAgICAgICAgICBpc0RpcmVjdG9yeTogYXNzZXQuaXNEaXJlY3RvcnkgfHwgZmFsc2VcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGlmIChpbmNsdWRlTWV0YWRhdGEpIHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBhc3NldEluZm8gPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldC1pbmZvJywgYXNzZXQudXJsKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGFzc2V0SW5mbyAmJiBhc3NldEluZm8ubWV0YSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgbWFuaWZlc3RFbnRyeS5tZXRhID0gYXNzZXRJbmZvLm1ldGE7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gU2tpcCBtZXRhZGF0YSBpZiBub3QgYXZhaWxhYmxlXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBtYW5pZmVzdC5wdXNoKG1hbmlmZXN0RW50cnkpO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IGV4cG9ydERhdGE6IHN0cmluZztcbiAgICAgICAgc3dpdGNoIChmb3JtYXQpIHtcbiAgICAgICAgICAgIGNhc2UgJ2pzb24nOlxuICAgICAgICAgICAgICAgIGV4cG9ydERhdGEgPSBKU09OLnN0cmluZ2lmeShtYW5pZmVzdCwgbnVsbCwgMik7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdjc3YnOlxuICAgICAgICAgICAgICAgIGV4cG9ydERhdGEgPSB0aGlzLmNvbnZlcnRUb0NTVihtYW5pZmVzdCk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICd4bWwnOlxuICAgICAgICAgICAgICAgIGV4cG9ydERhdGEgPSB0aGlzLmNvbnZlcnRUb1hNTChtYW5pZmVzdCk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIGV4cG9ydERhdGEgPSBKU09OLnN0cmluZ2lmeShtYW5pZmVzdCwgbnVsbCwgMik7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gb2soe1xuICAgICAgICAgICAgICAgIGRpcmVjdG9yeTogZGlyZWN0b3J5LFxuICAgICAgICAgICAgICAgIGZvcm1hdDogZm9ybWF0LFxuICAgICAgICAgICAgICAgIGFzc2V0Q291bnQ6IG1hbmlmZXN0Lmxlbmd0aCxcbiAgICAgICAgICAgICAgICBpbmNsdWRlTWV0YWRhdGE6IGluY2x1ZGVNZXRhZGF0YSxcbiAgICAgICAgICAgICAgICBtYW5pZmVzdDogZXhwb3J0RGF0YSxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiBgQXNzZXQgbWFuaWZlc3QgZXhwb3J0ZWQgd2l0aCAke21hbmlmZXN0Lmxlbmd0aH0gYXNzZXRzYFxuICAgICAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBjb252ZXJ0VG9DU1YoZGF0YTogYW55W10pOiBzdHJpbmcge1xuICAgICAgICBpZiAoZGF0YS5sZW5ndGggPT09IDApIHJldHVybiAnJztcbiAgICAgICAgXG4gICAgICAgIGNvbnN0IGhlYWRlcnMgPSBPYmplY3Qua2V5cyhkYXRhWzBdKTtcbiAgICAgICAgY29uc3QgY3N2Um93cyA9IFtoZWFkZXJzLmpvaW4oJywnKV07XG4gICAgICAgIFxuICAgICAgICBmb3IgKGNvbnN0IHJvdyBvZiBkYXRhKSB7XG4gICAgICAgICAgICBjb25zdCB2YWx1ZXMgPSBoZWFkZXJzLm1hcChoZWFkZXIgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHZhbHVlID0gcm93W2hlYWRlcl07XG4gICAgICAgICAgICAgICAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgPyBKU09OLnN0cmluZ2lmeSh2YWx1ZSkgOiBTdHJpbmcodmFsdWUpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBjc3ZSb3dzLnB1c2godmFsdWVzLmpvaW4oJywnKSk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHJldHVybiBjc3ZSb3dzLmpvaW4oJ1xcbicpO1xuICAgIH1cblxuICAgIHByaXZhdGUgY29udmVydFRvWE1MKGRhdGE6IGFueVtdKTogc3RyaW5nIHtcbiAgICAgICAgbGV0IHhtbCA9ICc8P3htbCB2ZXJzaW9uPVwiMS4wXCIgZW5jb2Rpbmc9XCJVVEYtOFwiPz5cXG48YXNzZXRzPlxcbic7XG4gICAgICAgIFxuICAgICAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgZGF0YSkge1xuICAgICAgICAgICAgeG1sICs9ICcgIDxhc3NldD5cXG4nO1xuICAgICAgICAgICAgZm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoaXRlbSkpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB4bWxWYWx1ZSA9IHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgPyBcbiAgICAgICAgICAgICAgICAgICAgSlNPTi5zdHJpbmdpZnkodmFsdWUpIDogXG4gICAgICAgICAgICAgICAgICAgIFN0cmluZyh2YWx1ZSkucmVwbGFjZSgvJi9nLCAnJmFtcDsnKS5yZXBsYWNlKC88L2csICcmbHQ7JykucmVwbGFjZSgvPi9nLCAnJmd0OycpO1xuICAgICAgICAgICAgICAgIHhtbCArPSBgICAgIDwke2tleX0+JHt4bWxWYWx1ZX08LyR7a2V5fT5cXG5gO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgeG1sICs9ICcgIDwvYXNzZXQ+XFxuJztcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgeG1sICs9ICc8L2Fzc2V0cz4nO1xuICAgICAgICByZXR1cm4geG1sO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2V0VXNlcnNJbXBsKHRhcmdldFV1aWQ6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHNjZW5lcyA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0cycsIHsgcGF0dGVybjogJ2RiOi8vYXNzZXRzLyoqJywgY2NUeXBlOiAnY2MuU2NlbmVBc3NldCcgfSk7XG4gICAgICAgIGNvbnN0IHByZWZhYnMgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldHMnLCB7IHBhdHRlcm46ICdkYjovL2Fzc2V0cy8qKicsIGNjVHlwZTogJ2NjLlByZWZhYicgfSk7XG4gICAgICAgIGNvbnN0IHNjcmlwdHNUcyA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0cycsIHsgcGF0dGVybjogJ2RiOi8vYXNzZXRzLyoqLyoudHMnIH0pO1xuICAgICAgICBjb25zdCBzY3JpcHRzSnMgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldHMnLCB7IHBhdHRlcm46ICdkYjovL2Fzc2V0cy8qKi8qLmpzJyB9KTtcbiAgICAgICAgXG4gICAgICAgIGNvbnN0IGFsbEFzc2V0cyA9IFsuLi5zY2VuZXMsIC4uLnByZWZhYnMsIC4uLnNjcmlwdHNUcywgLi4uc2NyaXB0c0pzXTtcbiAgICAgICAgY29uc3QgdW5pcXVlQXNzZXRzID0gQXJyYXkuZnJvbShuZXcgTWFwKGFsbEFzc2V0cy5tYXAoKGE6IGFueSkgPT4gW2EudXVpZCwgYV0pKS52YWx1ZXMoKSk7XG5cbiAgICAgICAgY29uc3QgdXNlcnM6IGFueVtdID0gW107XG4gICAgICAgIGZvciAoY29uc3QgYXNzZXQgb2YgdW5pcXVlQXNzZXRzKSB7XG4gICAgICAgICAgICBjb25zdCBkZXBzID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXQtZGVwZW5kcycsIGFzc2V0LnV1aWQpO1xuICAgICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoZGVwcykgJiYgZGVwcy5pbmNsdWRlcyh0YXJnZXRVdWlkKSkge1xuICAgICAgICAgICAgICAgIGxldCB0eXBlID0gJ3NjcmlwdCc7XG4gICAgICAgICAgICAgICAgaWYgKGFzc2V0LnR5cGUgPT09ICdjYy5TY2VuZUFzc2V0JykgdHlwZSA9ICdzY2VuZSc7XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoYXNzZXQudHlwZSA9PT0gJ2NjLlByZWZhYicpIHR5cGUgPSAncHJlZmFiJztcbiAgICAgICAgICAgICAgICB1c2Vycy5wdXNoKHsgdHlwZSwgdXVpZDogYXNzZXQudXVpZCwgcGF0aDogYXNzZXQudXJsLCBuYW1lOiBhc3NldC5uYW1lIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICByZXR1cm4gb2soeyB1dWlkOiB0YXJnZXRVdWlkLCB1c2VycywgdG90YWw6IHVzZXJzLmxlbmd0aCB9KTtcbiAgICB9XG59XG4iXX0=